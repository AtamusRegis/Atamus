import { WebSocketServer } from "ws";
import { config } from "../config.js";
import { getSessionUser, readCookie } from "../sessions.js";
import { World } from "./world.js";
import {
  TICK_MS, SNAPSHOT_MS, CELL_APOTHEM_KM, CELL_CIRCUMRADIUS_KM, CELL_CORNER_ROUND_KM,
  GATE_TRANSFER_RADIUS_KM, FUEL_SESSION_MAX_MS, FUEL_START_MS, DOCK_RADIUS_KM, SHIP_TYPES, SHIP_CLASSES, LASER_RANGE_KM, MINING_CYCLE_MS,
} from "./constants.js";
import { CELLS, STARGATE_CELLS, STATION_POS } from "./geometry.js";
import { ORES, BELT, fieldBelts } from "./belts.js";
import { ITEMS, MAX_STACKS, MARKET } from "./inventory.js";
import { getState } from "../pilots.js";
import { loadSystem, saveSystem, loadAwakeSystems } from "./persist.js";
import { pool } from "../db.js";
import { SERVER_BUILD, onWebsiteUpdate, onCountdown, activeCountdown } from "../build.js";
import { PTR, devCommand } from "../ptr.js";

const world = new World();

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
  belt: BELT,
  items: ITEMS,
  market: MARKET,
  laserRange: LASER_RANGE_KM, cycleMs: MINING_CYCLE_MS,
  maxStacks: MAX_STACKS,
  dockRadius: DOCK_RADIUS_KM,
  shipTypes: SHIP_TYPES, shipClasses: SHIP_CLASSES,
};

export function attachGameServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
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
    let saved = null; try { saved = await loadSystem(pid); } catch (e) { console.error("loadSystem", e); }
    const player = world.addPlayer(pid, user.username, send, saved);
    try { const { rows } = await pool.query(`SELECT credits FROM users WHERE id = $1`, [user.id]); player.credits = Number(rows[0]?.credits || 0); } catch (e) { console.error("credits", e); }
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
    const licTimer = setInterval(refreshLicenses, 60000);
    send(JSON.stringify({ t: "hello", build: SERVER_BUILD, countdown: activeCountdown(), you: { id: pid, name: user.username }, cfg: CLIENT_CONFIG, belts: fieldBelts(player.beltField) }));
    send(JSON.stringify(world.inventoriesFor(pid)));

    ws.on("message", (buf) => {
      let m; try { m = JSON.parse(buf.toString()); } catch { return; }
      switch (m.t) {
        case "gate": world.cmdGate(pid, m.gate, !!m.open); break;
        case "move": world.cmdMove(pid, m.ships, +m.x, +m.y); break;
        case "chat": world.cmdChat(pid, m.text, m.channel, m.to); break;
        case "lock": world.cmdLock(pid, m.ship, m.kind, m.id); break;
        case "mine": world.cmdMine(pid, m.ship, !!m.on); break;
        case "laser": world.cmdLaser(pid, m.ship, m.idx, !!m.on, m.rock); break;
        case "auto": world.cmdAuto(pid, m.ship, !!m.on); break;
        case "inv_split": world.cmdInvSplit(pid, m.ref, m.slot, m.qty); break;
        case "jettison": world.cmdJettison(pid, m.ref, m.slot, m.qty); break;
        case "buy": world.cmdBuy(pid, m.item, m.qty); break;
        case "read": if (world.cmdRead(pid, m.ref, m.slot)) persist(pid); break;
        case "licenses": refreshLicenses(); break;
        case "crew": refreshLicenses().then(() => world.cmdCrew(pid, m.ship, m.pilot)); break;
        case "decrew": world.cmdDecrew(pid, m.ship); break;
        case "rename_hangar": world.cmdRenameHangar(pid, m.h, m.name); break;
        case "assemble": world.cmdAssemble(pid, m.ref, m.slot); break;
        case "destroy_can": world.cmdDestroyCan(pid, m.can); break;
        case "rename_ship": world.cmdRenameShip(pid, m.ship, m.name); break;
        case "dev": if (PTR) devCommand(world, pid, m, refreshLicenses); break;
        case "dock": world.cmdDock(pid, m.ship, !!m.dock); break;
        case "warp": world.cmdWarp(pid, m.ship); break;
        case "inv_move": world.cmdInvMove(pid, m.from, m.to, m.qty); break;
        case "inv_sort": world.cmdInvSort(pid, m.ref); break;
        case "sell": world.cmdSell(pid, m.ref, m.slot, m.qty); break;
      }
    });
    ws.on("close", () => { clearInterval(licTimer); persist(pid).finally(() => world.removePlayer(pid)); });
    ws.on("error", () => { try { ws.close(); } catch {} });
  });

  const persist = async (pid) => { if (!world.players.has(pid)) return; try { await saveSystem(pid, world.exportState(pid)); } catch (e) { console.error("saveSystem", e); } };
  world.onCredits = (pid, delta) => { pool.query(`UPDATE users SET credits = credits + $1 WHERE id = $2`, [delta, pid]).catch((e) => console.error("credits", e)); };
  world.onBeforePurge = (pid) => { const state = world.exportState(pid); saveSystem(pid, state).catch((e) => console.error("saveSystem(purge)", e)); };
  // On boot, bring back anyone whose gate was still running: timers and links keep going, logging off is not an escape.
  loadAwakeSystems().then((rows) => {
    for (const r of rows) { const p = world.addPlayer(String(r.user_id), r.username, () => {}, r.data); p.offline = true; p.offlineSince = Date.now(); }
    if (rows.length) console.log(`[world] restored ${rows.length} offline system(s) awake (running gate or unfinished orders)`);
  }).catch((e) => console.error("loadAwakeSystems", e));
  setInterval(() => { for (const pid of world.players.keys()) persist(pid); }, 10000);

  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    world.tick(dt);
  }, TICK_MS);

  setInterval(() => {
    for (const p of world.players.values()) {
      p.send(JSON.stringify(world.snapshotFor(p)));
      if (p.invDirty) { p.invDirty = false; p.send(JSON.stringify(world.inventoriesFor(p.id))); }
      if (p.rockDirty && p.rockDirty.size) { p.send(JSON.stringify({ t: "rocks", rocks: [...p.rockDirty].map(([id, m3]) => ({ id, m3 })) })); p.rockDirty.clear(); }
    }
  }, SNAPSHOT_MS);

  return wss;
}
