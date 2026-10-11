// The game socket: one session per account, a few commands in, snapshots out at 15 Hz.
import { WebSocketServer } from "ws";
import { config } from "../config.js";
import { getSessionUser, readCookie } from "../sessions.js";
import { World } from "./world.js";
import { TICK_MS, SNAPSHOT_MS, SHIP_TYPES, EXPANSE_APOTHEM_KM, AU_KM } from "./constants.js";
import { loadSystem, saveSystem, loadPois, savePoi, deletePoi } from "./persist.js";
import { ORES } from "./belts.js";
import { MODULES } from "./modules.js";
import { DOCK_KM } from "./station.js";
import { SERVER_BUILD, onWebsiteUpdate, onCountdown, activeCountdown } from "../build.js";
import { PTR, devCommand } from "../ptr.js";
import { getState } from "../pilots.js";

const world = new World();
const conns = new Map();   // pid -> sockets; one session per account: a new tab or device replaces the old one
const CLIENT_CONFIG = { expanseApothemKm: EXPANSE_APOTHEM_KM, auKm: AU_KM, shipTypes: SHIP_TYPES, ores: ORES, modules: MODULES, dockKm: DOCK_KM };

export function attachGameServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: 16 * 1024, perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 3 }, serverMaxWindowBits: 13, concurrencyLimit: 4 } });
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
    const inMemory = world.players.has(pid);               // a reload within the grace: memory is the truth
    let saved = null; if (!inMemory) try { saved = await loadSystem(pid); } catch (e) { console.error("loadSystem", e); }
    if (ws.readyState !== ws.OPEN) { mine.delete(ws); if (!mine.size) conns.delete(pid); return; }   // left while loading
    let st0 = null; try { st0 = await getState(user.id); } catch (e) { console.error("pilots", e); }
    if (ws.readyState !== ws.OPEN) { mine.delete(ws); if (!mine.size) conns.delete(pid); return; }
    const player = world.addPlayer(pid, user.username, sendAll, saved, st0 ? st0.pilots : []);
    player.portrait = st0 && st0.profile.portrait;          // the account's character: who you are in chat
    player.heavy = new Map();                              // a new session gets the whole fit / holds / hangar again
    // a pilot made or gone while you play (the client says so; and once a minute anyway)
    const refreshPilots = async () => { try { const st = await getState(user.id); world.setPilots(pid, st.pilots); player.portrait = st.profile.portrait; } catch (e) { console.error("pilots", e); } };
    const pilotTimer = setInterval(refreshPilots, 60000);
    ws.on("close", () => {
      clearInterval(pilotTimer); mine.delete(ws);
      if (mine.size) return;                                 // replaced by a newer session: it carries on
      conns.delete(pid); persist(pid).finally(() => { if (!conns.has(pid)) world.removePlayer(pid); });
    });
    const fl = world.fieldsFor(player); player.fieldSig = fl.sig; player.poiSig = world.poiSig(player);
    send(JSON.stringify({ t: "hello", build: SERVER_BUILD, countdown: activeCountdown(), you: { id: pid, name: user.username }, cfg: CLIENT_CONFIG, pois: world.poisFor(player), belts: fl.fields }));

    let budget = 40, budgetAt = Date.now();                 // flood guard: ~40 commands a second, extras dropped
    ws.on("message", (buf) => {
      if (ws.replaced) return;                              // nothing from a session that's been replaced
      const now = Date.now(); budget = Math.min(40, budget + (now - budgetAt) * 0.04); budgetAt = now;
      if (budget < 1) return; budget--;
      let m; try { m = JSON.parse(buf.toString()); } catch { return; }
      if (!m || typeof m !== "object" || typeof m.t !== "string") return;
      try {
        switch (m.t) {
          case "move": world.cmdMove(pid, m.ship, m.x, m.y); break;
          case "view": world.cmdView(pid, m.x, m.y, m.w); break;
          case "pilots": refreshPilots(); break;
          case "chat": world.cmdChat(pid, m.text, m.channel, m.to, m.ship); break;
          case "align": world.cmdAlign(pid, m.ship, m.poi); break;
          case "warp": world.cmdWarp(pid, m.ship, m.poi); break;
          case "lock": world.cmdLock(pid, m.ship, m.kind, m.id); break;
          case "unlock": world.cmdUnlock(pid, m.ship, m.kind, m.id); break;
          case "chase": world.cmdChase(pid, m.ship, m.kind, m.id, m.mode); break;
          case "info": world.cmdInfo(pid, m.kind, m.id); break;
          case "rename": world.cmdRename(pid, m.ship, m.name); break;
          case "fit": world.cmdFit(pid, m.ship, m.item, m.kind, m.slot); break;
          case "unfit": world.cmdUnfit(pid, m.ship, m.kind, m.slot); break;
          case "module": world.cmdModule(pid, m.ship, m.slot, !!m.on); break;
          case "power": world.cmdPower(pid, m.ship, m.kind, m.slot, !!m.on); break;
          case "dock": world.cmdDock(pid, m.ship); break;
          case "undock": world.cmdUndock(pid, m.ship); break;
          case "transfer": world.cmdTransfer(pid, m.from, m.to, m.item, m.qty); break;
          case "dev": if (PTR) devCommand(world, pid, m); break;
        }
      } catch (e) { console.error("command " + m.t, e); }
    });
    ws.on("error", () => { try { ws.close(); } catch {} });
  });

  const lastSaved = new Map();                            // pid -> JSON last written: skip the write when nothing changed
  const persist = async (pid) => {
    if (!world.players.has(pid)) return;
    const json = JSON.stringify(world.exportState(pid)); if (lastSaved.get(pid) === json) return;
    try { await saveSystem(pid, json); lastSaved.set(pid, json); } catch (e) { console.error("saveSystem", e); }
  };
  world.onBeforePurge = (pid) => { lastSaved.delete(pid); saveSystem(pid, world.exportState(pid)).catch((e) => console.error("saveSystem(purge)", e)); };
  // belt POIs persist on their own (shared by everyone); a closed one is deleted
  const poiSaved = new Map();
  const persistPois = () => { for (const poi of world.pois.values()) { if (poi.kind !== "belt") continue;   // the Library is built at start-up
      const json = JSON.stringify(poi); if (poiSaved.get(poi.id) === json) continue; poiSaved.set(poi.id, json); savePoi(poi.id, json).catch((e) => console.error("savePoi", e)); } };
  world.onPoiClosed = (poi) => { poiSaved.delete(poi.id); deletePoi(poi.id).catch((e) => console.error("deletePoi", e)); };
  loadPois().then((list) => { for (const d of list) world.loadPoi(d); }).catch((e) => console.error("loadPois", e));
  setInterval(() => { for (const pid of world.players.keys()) persist(pid); persistPois(); }, 10000);

  // a ship's fit, holds and fitted stats, and the hangar, are only sent when they change (the client keeps the last ones)
  const HEAVY = ["fit", "holds", "calc"];
  const lighten = (p, snap) => {
    const hv = p.heavy || (p.heavy = new Map());
    const same = (key, v) => { const j = JSON.stringify(v); if (hv.get(key) === j) return true; hv.set(key, j); return false; };
    for (const e of snap.ships) if (e.mine) for (const k of HEAVY) if (k in e && same(e.id + "|" + k, e[k])) delete e[k];
    if (snap.hangar && same("hangar", snap.hangar)) delete snap.hangar;
    return snap;
  };
  let last = Date.now();
  setInterval(() => { const now = Date.now(), dt = Math.min(0.25, (now - last) / 1000); last = now; world.tick(dt); }, TICK_MS);
  setInterval(() => {
    for (const p of world.players.values()) {
      if (p.offline) continue;
      const ps = world.poiSig(p); if (ps !== p.poiSig) { p.poiSig = ps; p.send(JSON.stringify({ t: "pois", pois: world.poisFor(p) })); }   // the map's POIs changed
      const fs = world.fieldSig(p); if (fs !== p.fieldSig) { const fl = world.fieldsFor(p); p.fieldSig = fl.sig; p.send(JSON.stringify({ t: "belts", belts: fl.fields })); }   // a belt came into reach, or its rocks changed
      p.send(JSON.stringify(lighten(p, world.snapshotFor(p))));
    }
  }, SNAPSHOT_MS);

  return wss;
}
