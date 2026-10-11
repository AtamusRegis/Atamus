// The game socket: one session per account, a few commands in, snapshots out at 15 Hz.
import { WebSocketServer } from "ws";
import { config } from "../config.js";
import { getSessionUser, readCookie } from "../sessions.js";
import { World } from "./world.js";
import { TICK_MS, SNAPSHOT_MS, SHIP_TYPES, EXPANSE_APOTHEM_KM, AU_KM } from "./constants.js";
import { loadSystem, saveSystem } from "./persist.js";
import { SERVER_BUILD, onWebsiteUpdate, onCountdown, activeCountdown } from "../build.js";
import { PTR, devCommand } from "../ptr.js";

const world = new World();
const conns = new Map();   // pid -> sockets; one session per account: a new tab or device replaces the old one
const CLIENT_CONFIG = { expanseApothemKm: EXPANSE_APOTHEM_KM, auKm: AU_KM, shipTypes: SHIP_TYPES };

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
    world.addPlayer(pid, user.username, sendAll, saved);
    ws.on("close", () => {
      mine.delete(ws);
      if (mine.size) return;                                 // replaced by a newer session: it carries on
      conns.delete(pid); persist(pid).finally(() => { if (!conns.has(pid)) world.removePlayer(pid); });
    });
    send(JSON.stringify({ t: "hello", build: SERVER_BUILD, countdown: activeCountdown(), you: { id: pid, name: user.username }, cfg: CLIENT_CONFIG }));

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
  setInterval(() => { for (const pid of world.players.keys()) persist(pid); }, 10000);

  let last = Date.now();
  setInterval(() => { const now = Date.now(), dt = Math.min(0.25, (now - last) / 1000); last = now; world.tick(dt); }, TICK_MS);
  setInterval(() => { for (const p of world.players.values()) if (!p.offline) p.send(JSON.stringify(world.snapshotFor(p))); }, SNAPSHOT_MS);

  return wss;
}
