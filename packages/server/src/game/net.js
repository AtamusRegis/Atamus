// The game socket (owner, 2026-10-12; the mining redesign 2026-10-18; the sandbox build 2026-10-18). One shared world;
// one session per pilot (a new tab replaces the old: 4002), one pilot per device (4003). No chat and no parties: the
// socket carries inputs, acts, station ops and the world's state. The client sends commands; the server simulates at
// 20 Hz and sends each player only what's in its vision (the fog of war is server-side). Rocks travel as summaries at
// 5 Hz; each rock's chunk layout goes separately, re-sent when its version changes. Deploy countdowns and website
// reloads reach every client here. The admin hooks stay server-side (kick, ban, respawn); the game shows no admin UI.
import { WebSocketServer } from "ws";
import { readCookie, getSessionUser } from "../sessions.js";
import { getGuestUser } from "../guest.js";
import { SERVER_BUILD, onWebsiteUpdate, onCountdown, activeCountdown, updateStatus } from "../build.js";
import { World } from "./world.js";
import * as R from "./rules.js";
import { PTR, ptrAs } from "../ptr.js";
import { setGameHooks } from "../admin.js";
import { deviceOf } from "../security.js";

import { setValue, resetAll, loadTuning, saveTuning, reshapes } from "./tuning.js";

// the game's numbers, for the clients (drawing, prediction, the station panel); sent again whenever tuning changes one
const gameInfo = () => ({ world: R.WORLD, ships: R.SHIPS, kinds: R.SHIP_KINDS, fly: R.FLY, chunk: R.CHUNK, core: R.CORE,
  rock: R.ROCK, ringShells: R.RING_SHELLS, ringOres: R.RING_ORES, ringSpawn: R.RING_SPAWN,
  ores: R.ORES, refinedSpace: R.REFINED_SPACE, drops: R.DROPS, econ: R.ECON,
  sectors: R.SECTORS, sectorNames: R.SECTOR_NAMES });
const DEV_ROLES = ["head", "admin"];           // (tuning still answers to staff sessions — the game client has no dev UI)

export function attachGameServer(httpServer) {
  const world = new World();
  world.ready = Promise.all([world.ready, loadTuning().catch((e) => console.error("tuning", e))]);
  const socks = new Map();                     // pilot id -> ws
  const devs = new Map();                      // device id -> pilot id
  const roles = new Map();
  const tell = (pid, obj) => { const w = socks.get(pid); if (w && w.readyState === w.OPEN) w.send(JSON.stringify(obj)); };
  setGameHooks({                               // the admin panel's hooks into the world (server-side only now)
    staffChanged: (pid, role) => { roles.set(pid, role || null); tell(pid, { t: "staff" }); },
    online: () => { const m = new Map(); for (const [pid] of socks) m.set(pid, { side: null }); return m; },
    kick: (pid, code, reason) => { if (code === 4006) world.banned(pid).catch((e) => console.error("ban hold", e)); const w = socks.get(pid); if (w) { try { w.close(code, String(reason || "").slice(0, 100)); } catch {} } },
    mute: () => {},
    respawn: (pid) => !!world.respawn(pid),
    teleportTo: (pid, toPid) => { const q = world.players.get(toPid); if (!q || !world.players.get(pid)) return false; const a = Math.random() * Math.PI * 2; return !!world.teleport(pid, q.x + Math.cos(a) * 80, q.y + Math.sin(a) * 80); },
    inWorld: (pid) => world.players.has(pid),
    note: (pid, text) => tell(pid, { t: "note", text }),
    deviceBusy: (device, uid) => { const o = devs.get(device); return !!o && o !== String(uid) && socks.has(o); },
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: 16 * 1024, perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 3 }, serverMaxWindowBits: 13, concurrencyLimit: 4 } });
  const broadcast = (obj) => { const msg = JSON.stringify(obj); for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(msg); };
  onCountdown((at, head, parts) => { broadcast({ t: "countdown", at, in: Math.max(0, at - Date.now()), parts, head: /^[0-9a-f]{7,40}$/.test(head) ? head : undefined }); console.log("[build] update " + head.slice(0, 7) + " in " + Math.round((at - Date.now()) / 1000) + " s"); });
  onWebsiteUpdate((v) => { broadcast({ t: "update", web: v }); console.log("[build] website " + v.slice(0, 7) + " live, clients told to reload"); });

  wss.on("connection", async (ws, req) => {
    let user = null;
    try { user = await getSessionUser(readCookie(req)); } catch (e) { console.error("ws auth", e); }
    try { if (!user) user = await getGuestUser(req); } catch (e) { console.error("ws guest", e); }   // (owner, 2026-10-18) name-and-play
    if (PTR) { const as = new URL(req.url, "http://x").searchParams.get("as"); if (as) user = await ptrAs(as).catch(() => null) || user; }
    if (!user) { ws.close(4001, "No name yet"); return; }
    if (user.frozen) { ws.close(4001, "Not available"); return; }
    const pid = String(user.id), device = deviceOf(new URL(req.url, "http://x").searchParams.get("d"));
    if (device && devs.has(device) && devs.get(device) !== pid && socks.has(devs.get(device))) { ws.close(4003, "Another pilot is playing on this device."); return; }
    if (device) devs.set(device, pid);
    const old = socks.get(pid); if (old && old !== ws) { try { old.close(4002, "Replaced"); } catch {} }
    socks.set(pid, ws); roles.set(pid, user.role || null);
    let joined = false, cmds = 0;
    const cmdReset = setInterval(() => { cmds = 0; }, 1000);
    const drop = () => { clearInterval(cmdReset); if (socks.get(pid) === ws) { socks.delete(pid); roles.delete(pid); if (device && devs.get(device) === pid) devs.delete(device); } };
    ws.on("close", () => {
      if (socks.get(pid) !== ws) { clearInterval(cmdReset); return; }
      drop();
      if (joined) world.leave(pid).then(() => broadcast({ t: "leave", i: pid })).catch((e) => console.error("leave", e));
    });
    ws.on("error", (e) => console.error("ws", e.message));
    let me;
    try { await world.ready; me = await world.join(pid, user.username); } catch (e) { console.error("join", e); drop(); try { ws.close(1011, "Join failed"); } catch {} return; }
    if (socks.get(pid) !== ws || ws.readyState !== ws.OPEN) { if (socks.get(pid) !== ws) return; drop(); world.leave(pid).catch(() => {}); return; }
    joined = true;
    ws.send(JSON.stringify({
      t: "hello", build: SERVER_BUILD, countdown: activeCountdown(), updating: updateStatus(), now: Date.now(), game: gameInfo(),
      you: { id: pid, name: user.username, dev: DEV_ROLES.includes(roles.get(pid)) }, spawn: { x: me.x, y: me.y, h: me.h },
      online: world.players.size, roster: world.roster(),
    }));
    ws.ready = true;                           // (the loops below send nothing to a socket before its hello)
    broadcast({ t: "join", i: pid, n: user.username });

    ws.on("message", (data) => {
      if (socks.get(pid) !== ws || ++cmds > 80) return;
      let m; try { m = JSON.parse(String(data)); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "in") world.setInput(pid, m);
      else if (m.t === "act") world.act(pid, m);
      else if (m.t === "st") world.station(pid, m);
      else if (m.t === "tune") tune(m);
      else if (m.t === "ping") { try { ws.send(JSON.stringify({ t: "pong", ts: m.ts })); } catch {} }
    });
    // tuning: one number at a time, or everything back to the defaults — staff sessions only (no in-game UI anymore)
    function tune(m) {
      if (!DEV_ROLES.includes(roles.get(pid))) return;
      let field = false;
      if (m.reset === true) { resetAll(); field = true; }
      else if (Array.isArray(m.path) && setValue(m.path, m.value)) field = reshapes(m.path);
      else return;
      saveTuning().catch((e) => console.error("tuning save", e));
      if (field) { world.resetField(); for (const c of wss.clients) { c.knownRocks = null; c.rockVers = null; } }
      broadcast({ t: "game", game: gameInfo(), field: field ? 1 : 0 });
    }
  });

  // ---- the loops ----
  const send = (ws, o) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(o)); };
  let lastWake = 0;
  setInterval(() => {                          // 20 Hz simulation, then effects and messages
    const t = Date.now();
    if (t - lastWake > 1000) { lastWake = t; world.wakeAround(t); }
    world.step(0.05);
    if (world.fx.length) {
      for (const [pid, ws] of socks) {
        const p = world.players.get(pid); if (!p || !ws.ready) continue;
        const near = world.fx.filter((f) => Math.hypot(f.x - p.x, f.y - p.y) <= world.visionOf(p) + 200).map((f) => ({ t: "fx", ...f }));
        if (near.length) send(ws, near.length === 1 ? near[0] : { t: "batch", m: near });
      }
      world.fx.length = 0;
    }
    if (world.msgs.length) { for (const { to, m } of world.msgs) { if (to === null) broadcast(m); else tell(to, m); } world.msgs.length = 0; }
  }, 50);
  // 15 Hz: ships, as changes since this socket's last (p), the unchanged ids (u), or { same: 1 }
  setInterval(() => {
    const ts = Date.now();
    const cache = world.shipRowCache();
    for (const [pid, ws] of socks) {
      const p = world.players.get(pid); if (!p || !ws.ready || ws.readyState !== ws.OPEN) continue;
      const rows = world.shipRows(p, cache), last = ws.lastSnap || new Map(), now = new Map(), ch = [], un = [];
      for (const { row: r, key } of rows) { now.set(r[0], key); if (last.get(r[0]) === key) un.push(r[0]); else ch.push(r); }
      ws.lastSnap = now;
      send(ws, !ch.length && un.length === last.size ? { t: "snap", ts, same: 1 } : { t: "snap", ts, p: ch, u: un });
    }
  }, 66);
  // 5 Hz: what changed near each player — rock summaries (and each visible rock's chunk layout when its version moves),
  // ore drops, my own state
  const diff = (ws, field, rows) => {
    const known = ws[field] || (ws[field] = new Map()), seen = new Set(), add = [], gone = [];
    for (const r of rows) { const key = JSON.stringify(r); seen.add(r[0]); if (known.get(r[0]) !== key) { known.set(r[0], key); add.push(r); } }
    for (const id of [...known.keys()]) if (!seen.has(id)) { known.delete(id); gone.push(id); }
    return add.length || gone.length ? { a: add, x: gone } : null;
  };
  setInterval(() => {
    for (const [pid, ws] of socks) {
      const p = world.players.get(pid); if (!p || !ws.ready || ws.readyState !== ws.OPEN) continue;
      const rows = world.rockRows(p), rk = diff(ws, "knownRocks", rows);
      if (rk) send(ws, { t: "rocks", ...rk });
      const vers = ws.rockVers || (ws.rockVers = new Map());       // the chunk layouts, one message per rock that changed
      const seen = new Set();
      for (const row of rows) {
        const r = world.rocks.get(row[0]); if (!r) continue; seen.add(r.id);
        if (vers.get(r.id) !== r.v) { const first = !vers.has(r.id); vers.set(r.id, r.v); send(ws, world.rockDetail(r, first)); }   // (the exact polygons ride the first one)
      }
      for (const id of [...vers.keys()]) if (!seen.has(id)) vers.delete(id);   // out of vision: sent fresh on return
      const dr = diff(ws, "knownDrops", world.dropRows(p)); if (dr) send(ws, { t: "drops", ...dr });
      const mm = JSON.stringify(world.meMsg(p)); if (mm !== ws.lastMe) { ws.lastMe = mm; ws.send(mm); }
    }
  }, 200);
  console.log("Saturn ring world attached at /ws");
}
