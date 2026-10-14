// The game socket for the 3D world (owner, 2026-10-12). One shared world: every
// connected player is in it, everyone sees everyone. One session per account (a new
// tab replaces the old: 4002). The client only sends commands ({t:"move", x, y}: a
// direction); the server simulates at 20 Hz and sends snapshots at 15 Hz. Deploy
// countdowns and website reloads reach every client here, as before.
import { WebSocketServer } from "ws";
import { readCookie, getSessionUser } from "../sessions.js";
import { SERVER_BUILD, onWebsiteUpdate, onCountdown, activeCountdown } from "../build.js";
import { World3D, HEX_FLAT, SPHERE_R, SPEED, ACCEL, BRAKE, STOP_D, SPRINT, SIDE_SPEED, FWD_ARC, TURN_ACCEL, CAP_MAX, CAP_DRAIN, CAP_WALK, CAP_IDLE, CAP_RESUME, LOAD_R } from "./world3d.js";
import { PTR, ptrAs } from "../ptr.js";
import { setGameHooks } from "../admin.js";
import { deviceOf } from "../security.js";
import { pool } from "../db.js";
import { safeText } from "../textsafe.js";

export function attachGameServer(httpServer) {
  const world = new World3D();
  const socks = new Map();                     // account id -> ws
  const devs = new Map();                      // device id -> account id, for the connected sockets
  const mutes = new Map();                     // account id -> { perm, until } (ms), the connected players' chat mutes
  // (owner, 2026-10-13) the admin panel's hooks into the world: who's online, kicks (and bans), mutes; and one account
  // per device (auth.js asks at login; a second account's socket on a device in use is refused below)
  setGameHooks({
    online: () => { const m = new Map(); for (const [pid] of socks) { const p = world.players.get(pid); m.set(pid, { side: p ? p.team : null }); } return m; },
    kick: (pid, code, reason) => { const w = socks.get(pid); if (w) { try { w.close(code, String(reason || "").slice(0, 100)); } catch {} } },
    mute: (pid, m) => { if (m) mutes.set(pid, m); else mutes.delete(pid); },
    deviceBusy: (device, uid) => { const o = devs.get(device); return !!o && o !== String(uid) && socks.has(o); },
  });
  // (owner, 2026-10-13) the last chat lines (everything sent, any channel), kept to go with a report: the reported
  // player's recent lines
  const recent = [];
  const remember = (line) => { recent.push(line); if (recent.length > 500) recent.shift(); };
  const reports = new Map();                   // account id -> recent report times: at most 5 in 10 minutes
  const reportOk = (pid) => { const now = Date.now(), l = (reports.get(pid) || []).filter((t) => now - t < 600_000); if (l.length >= 5) return false; l.push(now); reports.set(pid, l); return true; };
  const muted = (pid) => { const m = mutes.get(pid); return !!m && (m.perm || (m.until && m.until > Date.now())); };

  const wss = new WebSocketServer({
    server: httpServer, path: "/ws", maxPayload: 16 * 1024,
    perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 3 }, serverMaxWindowBits: 13, concurrencyLimit: 4 },
  });

  const broadcast = (obj) => { const msg = JSON.stringify(obj); for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(msg); };

  // ---- deploys: the 30 s countdown, and "the website switched: reload" ----
  onCountdown((at, head, parts) => { broadcast({ t: "countdown", at, in: Math.max(0, at - Date.now()), parts }); console.log("[build] update " + head.slice(0, 7) + " in " + Math.round((at - Date.now()) / 1000) + " s"); });
  onWebsiteUpdate((v) => { broadcast({ t: "update", web: v }); console.log("[build] website " + v.slice(0, 7) + " live, clients told to reload"); });

  wss.on("connection", async (ws, req) => {
    let user = null;
    try { user = await getSessionUser(readCookie(req)); } catch (e) { console.error("ws auth", e); }
    if (PTR) { const as = new URL(req.url, "http://x").searchParams.get("as"); if (as) user = await ptrAs(as).catch(() => null) || user; }   // (PTR only) ?as=Name tests as another account
    if (!user) { ws.close(4001, "Not logged in"); return; }
    if (user.frozen) { ws.close(4001, "Not available"); return; }
    const pid = String(user.id);
    const device = deviceOf(new URL(req.url, "http://x").searchParams.get("d"));
    if (device && devs.has(device) && devs.get(device) !== pid && socks.has(devs.get(device))) { ws.close(4003, "Another account is playing on this device."); return; }   // (owner) one account per device
    if (device) devs.set(device, pid);
    if (user.mute_perm || (user.mute_until && new Date(user.mute_until) > new Date())) mutes.set(pid, { perm: !!user.mute_perm, until: user.mute_until ? new Date(user.mute_until).getTime() : 0 });

    const old = socks.get(pid);                // (owner) one session per account: the new one replaces the old
    if (old && old !== ws) { try { old.close(4002, "Replaced"); } catch {} }
    socks.set(pid, ws);

    // (owner, 2026-10-13) a player joins the world only once they've sent {t:"side", s:"red"|"blue"}: the client sends
    // the remembered side (hello.side) by itself, or shows the picker the first time and when they chose Reset faction
    let joined = false;
    let cmds = 0;                              // rough flood cap: ~40 commands a second
    const cmdReset = setInterval(() => { cmds = 0; }, 1000);

    let saved = null;                          // (owner, 2026-10-13) the side this account chose last time: the client re-joins it unless resetting
    try { saved = await world.savedTeam(pid); } catch (e) { console.error("saved side", e); }
    if (socks.get(pid) !== ws || ws.readyState !== ws.OPEN) { clearInterval(cmdReset); if (socks.get(pid) === ws) { socks.delete(pid); mutes.delete(pid); if (device && devs.get(device) === pid) devs.delete(device); } return; }   // closed or replaced meanwhile
    ws.send(JSON.stringify({
      t: "hello", side: saved, build: SERVER_BUILD, countdown: activeCountdown(),
      you: { id: pid, name: user.username, staff: ["head", "admin", "mod"].includes(user.role) },   // staff: the Admin button
      cfg: { loadR: LOAD_R, hexFlat: HEX_FLAT, sphereR: SPHERE_R, speed: SPEED, accel: ACCEL, brake: BRAKE, stopD: STOP_D, sprint: SPRINT, sideSpeed: SIDE_SPEED, fwdArc: FWD_ARC, turnAccel: TURN_ACCEL, cap: { max: CAP_MAX, drain: CAP_DRAIN, walk: CAP_WALK, idle: CAP_IDLE, resume: CAP_RESUME } },
      roster: world.roster(),
    }));

    ws.on("message", (data) => {
      if (socks.get(pid) !== ws) return;       // a replaced session: ignore everything it sends
      if (++cmds > 80) return;                 // moves and chat together
      let m; try { m = JSON.parse(String(data)); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "side") {
        if (joined || (m.s !== "red" && m.s !== "blue")) return;   // once per session, and only a real side
        joined = true;
        world.join(pid, user.username, m.s).then((me) => {
          if (socks.get(pid) !== ws) return;
          try { ws.send(JSON.stringify({ t: "spawn", x: me.x, y: me.y, s: me.team })); } catch {}
          broadcast({ t: "join", i: pid, n: user.username, s: me.team });
        }).catch((e) => { joined = false; console.error("join", e); });
      }
      else if (m.t === "move") world.setDir(pid, m.x, m.y, m.b, m.h, m.a);
      else if (m.t === "chat") {               // (owner, 2026-10-13) World (everyone), Faction (your side), Whisper (one player)
        const me = world.players.get(pid); if (!me || typeof m.text !== "string" || muted(pid)) return;   // (owner) a muted player's lines go nowhere
        const text = m.text.slice(0, 240); if (!text.trim()) return;
        const ch = m.ch === "side" ? "side" : m.ch === "whisper" ? "whisper" : "global";
        if (ch === "whisper") {                // to one player by account id; both sides get it, tagged with the other one
          const to = typeof m.to === "string" ? m.to : "", tws = socks.get(to), tp = world.players.get(to);
          if (!tws || !tp || to === pid) { ws.send(JSON.stringify({ t: "chat", ch, sys: 1, with: to, text: "offline" })); return; }
          const line = { t: "chat", ch, i: pid, n: user.username, s: me.team, text };
          tws.send(JSON.stringify({ ...line, with: pid, withName: user.username }));
          ws.send(JSON.stringify({ ...line, with: to, withName: tp.name }));
          remember({ at: Date.now(), i: pid, n: user.username, ch: "whisper", text }); return;
        }
        const msg = JSON.stringify({ t: "chat", ch, i: pid, n: user.username, s: me.team, text });
        for (const [qid, qws] of socks) { const q = world.players.get(qid); if (q && qws.readyState === qws.OPEN && (ch === "global" || q.team === me.team)) qws.send(msg); }
        remember({ at: Date.now(), i: pid, n: user.username, ch, text });
      }
      else if (m.t === "report") {             // (owner, 2026-10-13) a player reports another: kept for the admin panel with their recent lines
        if (!reportOk(pid) || typeof m.i !== "string" || m.i === pid || !/^[0-9]{1,15}$/.test(m.i)) return;
        const text = safeText(m.text, 1000); if (!text) return;
        const chat = recent.filter((l) => l.i === m.i).slice(-30).map((l) => ({ at: l.at, ch: l.ch, text: l.text }));
        pool.query(`INSERT INTO reports (reporter, target, target_name, category, text, chat) SELECT $1, id, username, 'player', $3, $4 FROM users WHERE id = $2`, [pid, m.i, text, JSON.stringify(chat)])
          .then(() => ws.send(JSON.stringify({ t: "reported" }))).catch((e) => console.error("report", e));
      }
      else if (m.t === "ping") { try { ws.send(JSON.stringify({ t: "pong", ts: m.ts })); } catch {} }
    });

    ws.on("close", () => {
      clearInterval(cmdReset);
      if (socks.get(pid) !== ws) return;       // replaced: the newer socket owns the player now
      socks.delete(pid); mutes.delete(pid);
      if (device && devs.get(device) === pid) devs.delete(device);
      if (!joined) return;
      world.leave(pid).then(() => broadcast({ t: "leave", i: pid })).catch((e) => console.error("leave", e));
    });
    ws.on("error", (e) => console.error("ws", e.message));
  });

  setInterval(() => world.step(), 50);                                          // 20 Hz simulation
  // 15 Hz snapshots, each player's own: only what's inside their load circle (owner, 2026-10-13)
  setInterval(() => {
    const ts = Date.now();
    for (const [pid, ws] of socks) {
      const p = world.players.get(pid); if (!p || ws.readyState !== ws.OPEN) continue;
      ws.send(JSON.stringify({ t: "snap", ts, p: world.snapshotFor(p) }));
    }
  }, 66);
  setInterval(() => {                                                           // each player's own capacitor, 4 Hz, to them only
    for (const [pid, ws] of socks) { const p = world.players.get(pid); if (p && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: "cap", c: Math.round((p.cap ?? CAP_MAX) * 10) / 10, o: p.capOut ? 1 : 0 })); }
  }, 250);

  console.log("3D world attached at /ws (hex " + Math.round(HEX_FLAT) + " m flat to flat)");
}
