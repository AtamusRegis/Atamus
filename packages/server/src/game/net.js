import { WebSocketServer } from "ws";
import { config } from "../config.js";
import { getSessionUser, readCookie } from "../sessions.js";
import { World } from "./world.js";
import {
  TICK_MS, SNAPSHOT_MS, CELL_APOTHEM_KM, CELL_CIRCUMRADIUS_KM, CELL_CORNER_ROUND_KM,
  GATE_TRANSFER_RADIUS_KM, FUEL_SESSION_MAX_MS, FUEL_START_MS, DOCK_RADIUS_KM, SHIP_TYPES, SHIP_CLASSES, LASER_RANGE_KM, MINING_CYCLE_MS, MODULE_CATEGORIES,
  INST_APOTHEM_KM, INST_MAX_PLAYERS, BEACON_RANGE_KM, INST_RETURN_POS, WARP_EXIT_SHOW_MS,
} from "./constants.js";
import { CELLS, STARGATE_CELLS, STATION_POS } from "./geometry.js";
import { ORES } from "./belts.js";
import { ITEMS, MAX_STACKS, MARKET } from "./inventory.js";
import { getState, useGameCredits } from "../pilots.js";
import { loadSystem, saveSystem, loadAwakeSystems, loadInstances, saveInstance, deleteInstance } from "./persist.js";
import { pool } from "../db.js";
import { SERVER_BUILD, onWebsiteUpdate, onCountdown, activeCountdown } from "../build.js";
import { PTR, devCommand } from "../ptr.js";

const world = new World();
// Spending credits outside the game (a new pilot): online players' credits are in memory.
useGameCredits({
  take: (pid, n) => { const p = world.players.get(pid); if (!p) return null; if (p.credits < n) return false; p.credits -= n; p.invDirty = true; return true; },
  give: (pid, n) => { const p = world.players.get(pid); if (p) { p.credits += n; p.invDirty = true; } },
});
const conns = new Map();   // pid -> sockets; one session per account: a new tab or device replaces the old one

const CLIENT_CONFIG = {
  cells: CELLS,
  stargates: STARGATE_CELLS,
  station: STATION_POS,
  cellApothem: CELL_APOTHEM_KM,
  cellCircumradius: CELL_CIRCUMRADIUS_KM,
  cellCornerRound: CELL_CORNER_ROUND_KM,
  transferRadius: GATE_TRANSFER_RADIUS_KM,
  fuelMaxMs: FUEL_SESSION_MAX_MS,
  fuelStartMs: FUEL_START_MS,
  ores: ORES,
  warpExitShowMs: WARP_EXIT_SHOW_MS, instApothem: INST_APOTHEM_KM, instReturn: INST_RETURN_POS, instMaxPlayers: INST_MAX_PLAYERS, beaconRange: BEACON_RANGE_KM,
  items: ITEMS,
  market: MARKET,
  laserRange: LASER_RANGE_KM, cycleMs: MINING_CYCLE_MS,
  maxStacks: MAX_STACKS,
  dockRadius: DOCK_RADIUS_KM,
  shipTypes: SHIP_TYPES, shipClasses: SHIP_CLASSES, moduleCategories: MODULE_CATEGORIES,
};

export function attachGameServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: 64 * 1024 });
  onCountdown((at, head, parts) => { const msg = JSON.stringify({ t: "countdown", at, in: Math.max(0, at - Date.now()), parts }); for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(msg); console.log("[build] update " + head.slice(0, 7) + " in " + Math.round((at - Date.now()) / 1000) + " s"); });
  // a new website build is live: tell every connected client to reload now
  onWebsiteUpdate((v) => { const msg = JSON.stringify({ t: "update", web: v }); for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(msg); console.log("[build] website " + v.slice(0, 7) + " live, clients told to reload"); });

  wss.on("connection", async (ws, req) => {
    const origin = req.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) { ws.close(4003, "origin"); return; }
    const user = await getSessionUser(readCookie(req));
    if (!user) { ws.close(4001, "auth"); return; }

    const pid = String(user.id);
    const send = (s) => { if (ws.readyState === ws.OPEN) ws.send(s); };
    if (!conns.has(pid)) conns.set(pid, new Set());
    const mine = conns.get(pid);
    for (const old of mine) { old.replaced = true; try { old.close(4002, "elsewhere"); } catch {} }   // signed in elsewhere: the old session ends
    mine.add(ws);
    const sendAll = (s) => { for (const c of mine) if (!c.replaced && c.readyState === c.OPEN) c.send(s); };
    const inMemory = world.players.has(pid);               // another tab, or a system still awake: memory is the truth
    let saved = null; if (!inMemory) try { saved = await loadSystem(pid); } catch (e) { console.error("loadSystem", e); }
    if (ws.readyState !== ws.OPEN) { mine.delete(ws); if (!mine.size) conns.delete(pid); return; }   // left while loading
    const player = world.addPlayer(pid, user.username, sendAll, saved);
    let licTimer = 0;
    ws.on("close", () => {
      clearInterval(licTimer); mine.delete(ws);
      if (mine.size) return;                                 // replaced by a newer session: it carries on
      conns.delete(pid); persist(pid).finally(() => { if (!conns.has(pid)) world.removePlayer(pid); });
    });
    if (!inMemory) try { const { rows } = await pool.query(`SELECT credits FROM users WHERE id = $1`, [user.id]); player.credits = Number(rows[0]?.credits || 0); } catch (e) { console.error("credits", e); }
    // highest level of each license across the account's pilots drives module stats (auto-miner cycle etc.)
    const refreshLicenses = async () => {
      try {
        const st = await getState(user.id); const lic = {};
        for (const pl of st.pilots) for (const k in pl.licenses) lic[k] = Math.max(lic[k] || 0, pl.licenses[k]);
        player.licenses = lic; player.pilots = st.pilots.map((pl) => ({ id: pl.id, name: pl.name, licenses: pl.licenses }));
        world.assignDefaultPilots(pid);
      } catch (e) { console.error("licenses", e); }
    };
    await refreshLicenses();
    licTimer = setInterval(refreshLicenses, 60000);
    const fl = world.fieldsFor(player); player.fieldSig = fl.sig;
    send(JSON.stringify({ t: "hello", build: SERVER_BUILD, countdown: activeCountdown(), you: { id: pid, name: user.username }, cfg: CLIENT_CONFIG, belts: fl.fields }));
    send(JSON.stringify(world.inventoriesFor(pid)));

    let budget = 40, budgetAt = Date.now();                 // flood guard: ~40 commands a second, extras dropped
    ws.on("message", (buf) => {
      if (ws.replaced) return;                              // nothing from a session that's been replaced
      const now = Date.now(); budget = Math.min(40, budget + (now - budgetAt) * 0.04); budgetAt = now;
      if (budget < 1) return; budget--;
      let m; try { m = JSON.parse(buf.toString()); } catch { return; }
      if (!m || typeof m !== "object" || typeof m.t !== "string") return;
      try { handle(m); } catch (e) { console.error("command " + m.t, e); }
    });
    const handle = (m) => {
      switch (m.t) {
        case "gate": world.cmdGate(pid, m.gate, !!m.open); break;
        case "move": world.cmdMove(pid, m.ships, +m.x, +m.y, m.sys); break;
        case "jump": world.cmdJump(pid, m.beacon, m.ships); break;
        case "chat": world.cmdChat(pid, m.text, m.channel, m.to); break;
        case "lock": world.cmdLock(pid, m.ship, m.kind, m.id); break;
        case "mine": world.cmdMine(pid, m.ship, !!m.on); break;
        case "laser": world.cmdLaser(pid, m.ship, m.idx, !!m.on, m.rock); break;
        case "auto": world.cmdAuto(pid, m.ship, !!m.on); break;
        case "power": world.cmdPower(pid, m.ship, m.mod, m.idx, !!m.on); break;
        case "fit": world.cmdFit(pid, m.ship, m.from); break;
        case "unfit": world.cmdUnfit(pid, m.ship, m.idx, m.to); break;
        case "fitswap": world.cmdFitSwap(pid, m.ship, m.a, m.b); break;
        case "inv_split": world.cmdInvSplit(pid, m.ref, m.slot, m.qty, m.item); break;
        case "jettison": world.cmdJettison(pid, m.ref, m.slot, m.qty, m.item); break;
        case "buy": world.cmdBuy(pid, m.item, m.qty); break;
        case "read": if (world.cmdRead(pid, m.ref, m.slot, m.item)) persist(pid); break;
        case "licenses": refreshLicenses(); break;
        case "crew": refreshLicenses().then(() => world.cmdCrew(pid, m.ship, m.pilot)).catch((e) => console.error("crew", e)); break;
        case "decrew": world.cmdDecrew(pid, m.ship); break;
        case "rename_hangar": world.cmdRenameHangar(pid, m.h, m.name); break;
        case "assemble": world.cmdAssemble(pid, m.ref, m.slot, m.item); break;
        case "destroy_can": world.cmdDestroyCan(pid, m.can); break;
        case "rename_ship": world.cmdRenameShip(pid, m.ship, m.name); break;
        case "dev": if (PTR) devCommand(world, pid, m, refreshLicenses); break;
        case "dock": world.cmdDock(pid, m.ship, !!m.dock); break;
        case "warp": world.cmdWarp(pid, m.ship); break;
        case "inv_move": world.cmdInvMove(pid, m.from, m.to, m.qty); break;
        case "inv_sort": world.cmdInvSort(pid, m.ref); break;
        case "sell": world.cmdSell(pid, m.ref, m.slot, m.qty, m.item); break;
      }
    };
    ws.on("error", () => { try { ws.close(); } catch {} });
  });

  const lastSaved = new Map();                            // pid -> JSON last written: skip the write when nothing changed
  const persist = async (pid) => {
    if (!world.players.has(pid)) return;
    const json = JSON.stringify(world.exportState(pid)); if (lastSaved.get(pid) === json) return;
    try { await saveSystem(pid, json); lastSaved.set(pid, json); } catch (e) { console.error("saveSystem", e); }
  };
  world.onCredits = (pid, delta) => { pool.query(`UPDATE users SET credits = credits + $1 WHERE id = $2`, [delta, pid]).catch((e) => console.error("credits", e)); };
  world.onBeforePurge = (pid) => { lastSaved.delete(pid); const state = world.exportState(pid); saveSystem(pid, state).catch((e) => console.error("saveSystem(purge)", e)); };
  // asteroid instances persist on their own (shared by many players); a closed one is deleted
  const instSaved = new Map();
  const persistInstances = () => { for (const inst of world.instances.values()) { const json = JSON.stringify(world.exportInstance(inst)); if (instSaved.get(inst.id) === json) continue; instSaved.set(inst.id, json); saveInstance(inst.id, json).catch((e) => console.error("saveInstance", e)); } };
  world.onInstanceClosed = (id) => { instSaved.delete(id); deleteInstance(id).catch((e) => console.error("deleteInstance", e)); };
  // On boot: the instances first (ships may be in them), then anyone who should still be awake: a running gate,
  // unfinished orders, offline mining, or ships in an instance. Their pilots come too (licenses drive mining).
  (async () => {
    try { for (const d of await loadInstances()) world.loadInstance(d); if (world.instances.size) console.log(`[world] restored ${world.instances.size} asteroid instance(s)`); } catch (e) { console.error("loadInstances", e); }
    try {
      const rows = await loadAwakeSystems();
      for (const r of rows) {
        const pid = String(r.user_id); if (world.players.has(pid)) continue;
        const p = world.addPlayer(pid, r.username, () => {}, r.data); p.offline = true; p.offlineSince = Date.now() + 5 * 60000;   // 6 min grace after a restart: players coming back from an update keep their idle ships in place
        try { const st = await getState(r.user_id); const lic = {}; for (const pl of st.pilots) for (const k in pl.licenses) lic[k] = Math.max(lic[k] || 0, pl.licenses[k]); p.licenses = lic; p.pilots = st.pilots.map((pl) => ({ id: pl.id, name: pl.name, licenses: pl.licenses })); } catch (e) { console.error("pilots(awake)", e); }
      }
      if (rows.length) console.log(`[world] restored ${rows.length} offline system(s) awake`);
    } catch (e) { console.error("loadAwakeSystems", e); }
  })();
  setInterval(() => { for (const pid of world.players.keys()) persist(pid); persistInstances(); }, 10000);

  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    world.tick(dt);
  }, TICK_MS);

  setInterval(() => {
    for (const p of world.players.values()) {
      if (p.offline) continue;                              // nobody to send to
      p.send(JSON.stringify(world.snapshotFor(p)));
      if (p.invDirty) { p.invDirty = false; p.send(JSON.stringify(world.inventoriesFor(p.id))); }
      if (world.fieldSig(p) !== p.fieldSig) { const fl = world.fieldsFor(p); p.fieldSig = fl.sig; p.send(JSON.stringify({ t: "belts", belts: fl.fields })); p.rockDirty && p.rockDirty.clear(); }   // a field came into view or regrew
      if (p.rockDirty && p.rockDirty.size) { p.send(JSON.stringify({ t: "rocks", rocks: [...p.rockDirty].map(([id, m3]) => ({ id, m3 })) })); p.rockDirty.clear(); }
    }
  }, SNAPSHOT_MS);

  return wss;
}
