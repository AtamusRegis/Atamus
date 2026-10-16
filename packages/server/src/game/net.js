// The game socket (owner, 2026-10-12; rebuilt 2026-10-15). One shared world; one session per account (a new tab replaces
// the old: 4002), one account per device (4003). The client sends commands; the server simulates at 20 Hz and sends each
// player snapshots of their load circle at 15 Hz. Deploy countdowns and website reloads reach every client here.
import { WebSocketServer } from "ws";
import { readCookie, getSessionUser } from "../sessions.js";
import { SERVER_BUILD, onWebsiteUpdate, onCountdown, activeCountdown, updateStatus } from "../build.js";
import { World3D, inside, HEX_FLAT, SPHERE_R, SHIP_R, BUILD_H, LOAD_R, buildMsg, TURN_ACCEL, VEL_TURN, FWD_ARC, COLL_DEFAULT, VIS_DEFAULT } from "./world3d.js";
import { SHIP_FIELDS, TEAMS, maxRange } from "./ships.js";
import { PTR, ptrAs } from "../ptr.js";
import { setGameHooks } from "../admin.js";
import { deviceOf } from "../security.js";
import { pool } from "../db.js";
import { safeText } from "../textsafe.js";

const UI_KEYS = ["shipedit", "attrs"];                    // editor windows whose spot is remembered per account

export function attachGameServer(httpServer) {
  const world = new World3D();
  const socks = new Map();                     // account id -> ws
  const devs = new Map();                      // device id -> account id
  const mutes = new Map();                     // account id -> { perm, until }
  const roles = new Map(), badge = (pid) => { const r = roles.get(pid); return r === "mod" ? "m" : r === "head" || r === "admin" ? "a" : undefined; };
  const tell = (pid, obj) => { const w = socks.get(pid); if (w && w.readyState === w.OPEN) w.send(JSON.stringify(obj)); };
  const muted = (pid) => { const m = mutes.get(pid); return !!m && (m.perm || (m.until && m.until > Date.now())); };
  setGameHooks({                               // the admin panel's hooks into the world
    staffChanged: (pid, role) => { roles.set(pid, role || null); tell(pid, { t: "staff" }); },   // the client reloads so its menus follow
    online: () => { const m = new Map(); for (const [pid] of socks) { const p = world.players.get(pid); m.set(pid, { side: p ? p.team : null }); } return m; },
    kick: (pid, code, reason) => { const w = socks.get(pid); if (w) { try { w.close(code, String(reason || "").slice(0, 100)); } catch {} } },
    mute: (pid, m) => { if (m) mutes.set(pid, m); else mutes.delete(pid); },
    respawn: (pid) => { const p = world.respawn(pid); if (p) tell(pid, { t: "teleport", x: p.x, y: p.y }); return !!p; },
    teleportTo: (pid, toPid) => { const q = world.players.get(toPid); if (!q || !world.players.get(pid)) return false; const a = Math.random() * Math.PI * 2;
      const p = world.teleport(pid, q.x + Math.cos(a) * 150, q.y + Math.sin(a) * 150); if (p) tell(pid, { t: "teleport", x: p.x, y: p.y }); return !!p; },
    inWorld: (pid) => world.players.has(pid),
    note: (pid, text) => tell(pid, { t: "chat", ch: "sys", text }),
    deviceBusy: (device, uid) => { const o = devs.get(device); return !!o && o !== String(uid) && socks.has(o); },
  });
  const recent = [], remember = (line) => { recent.push(line); if (recent.length > 500) recent.shift(); };   // chat lines, to go with reports
  const reports = new Map(), reportOk = (pid) => { const now = Date.now(), l = (reports.get(pid) || []).filter((t) => now - t < 600_000); if (l.length >= 5) return false; l.push(now); reports.set(pid, l); return true; };

  const wss = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: 16 * 1024, perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 3 }, serverMaxWindowBits: 13, concurrencyLimit: 4 } });
  const broadcast = (obj) => { const msg = JSON.stringify(obj); for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(msg); };
  onCountdown((at, head, parts) => { broadcast({ t: "countdown", at, in: Math.max(0, at - Date.now()), parts, head: /^[0-9a-f]{7,40}$/.test(head) ? head : undefined }); console.log("[build] update " + head.slice(0, 7) + " in " + Math.round((at - Date.now()) / 1000) + " s"); });
  onWebsiteUpdate((v) => { broadcast({ t: "update", web: v }); console.log("[build] website " + v.slice(0, 7) + " live, clients told to reload"); });

  wss.on("connection", async (ws, req) => {
    let user = null;
    try { user = await getSessionUser(readCookie(req)); } catch (e) { console.error("ws auth", e); }
    if (PTR) { const as = new URL(req.url, "http://x").searchParams.get("as"); if (as) user = await ptrAs(as).catch(() => null) || user; }
    if (!user) { ws.close(4001, "Not logged in"); return; }
    if (user.frozen) { ws.close(4001, "Not available"); return; }
    const pid = String(user.id), device = deviceOf(new URL(req.url, "http://x").searchParams.get("d"));
    if (device && devs.has(device) && devs.get(device) !== pid && socks.has(devs.get(device))) { ws.close(4003, "Another account is playing on this device."); return; }
    if (device) devs.set(device, pid);
    if (user.mute_perm || (user.mute_until && new Date(user.mute_until) > new Date())) mutes.set(pid, { perm: !!user.mute_perm, until: user.mute_until ? new Date(user.mute_until).getTime() : 0 });
    const old = socks.get(pid); if (old && old !== ws) { try { old.close(4002, "Replaced"); } catch {} }
    socks.set(pid, ws); roles.set(pid, user.role || null);
    // the Build menu: head admin, admins, developers; the Ship Editor: head admin and developers (owner, 2026-10-15)
    const placer = ["head", "admin", "dev"].includes(user.role), editor = ["head", "dev"].includes(user.role);
    let joined = false, cmds = 0, teamAt = 0;
    const cmdReset = setInterval(() => { cmds = 0; }, 1000);
    let saved = null; try { saved = await world.savedTeam(pid); } catch (e) { console.error("saved side", e); }
    let ui = {}; if (editor || placer) try { ui = await uiGet(pid); } catch (e) { console.error("ui", e); }
    if (socks.get(pid) !== ws || ws.readyState !== ws.OPEN) { clearInterval(cmdReset); if (socks.get(pid) === ws) { socks.delete(pid); mutes.delete(pid); if (device && devs.get(device) === pid) devs.delete(device); } return; }
    await world.ready;
    const coll = {}; for (const k of Object.keys(COLL_DEFAULT)) coll[k] = world.coll[k] || COLL_DEFAULT[k];
    ws.send(JSON.stringify({
      t: "hello", side: saved, build: SERVER_BUILD, countdown: activeCountdown(), updating: updateStatus(), now: Date.now(), ui,
      you: { id: pid, name: user.username, staff: ["head", "admin", "mod"].includes(user.role), builder: placer, editor },
      cfg: { hexFlat: HEX_FLAT, sphereR: SPHERE_R, shipR: SHIP_R, buildH: BUILD_H, loadR: LOAD_R, turnAccel: TURN_ACCEL, velTurn: VEL_TURN, fwdArc: FWD_ARC },
      fields: SHIP_FIELDS.map(([k, lo, hi]) => [k, lo, hi]), ships: world.ships,
      coll, shipVis: world.vis || VIS_DEFAULT, shipPivot: world.pivot, oval: world.oval, roster: world.roster(),
    }));

    ws.on("message", (data) => {
      if (socks.get(pid) !== ws || ++cmds > 80) return;
      let m; try { m = JSON.parse(String(data)); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "side") {                    // joining the world with a team (once per session)
        if (joined || !TEAMS.includes(m.s)) return; joined = true;
        world.join(pid, user.username, m.s, m.rp === 1).then((me) => {
          if (socks.get(pid) !== ws) return;
          try { ws.send(JSON.stringify({ t: "spawn", x: me.x, y: me.y, s: me.team })); } catch {}
          broadcast({ t: "join", i: pid, n: user.username, s: me.team });
        }).catch((e) => { joined = false; console.error("join", e); });
      }
      else if (m.t === "move") world.setDir(pid, m.x, m.y, m.b, m.h, m.a);
      else if (m.t === "fire") world.fire(pid, m.x, m.y);
      else if (m.t === "beam") world.setBeam(pid, m.on === 1, m.x, m.y);
      else if (m.t === "reload") world.reload(pid);
      else if (m.t === "team") {               // switching team in the game (at most every 2 s)
        const now = Date.now(); if (!joined || !TEAMS.includes(m.s) || now - teamAt < 2000) return; teamAt = now;
        const p = world.setTeam(pid, m.s); if (p) broadcast({ t: "side", i: pid, s: p.team });
      }
      else if (m.t === "ship") {               // the Ship Editor: one number of a team's ship
        if (!editor || !world.setStat(m.s, m.k, m.v)) return; shipsCast = true;
      }
      else if (m.t === "chat") {               // World (everyone), Faction (your team), Whisper (one player)
        const me = world.players.get(pid); if (!me || typeof m.text !== "string" || muted(pid)) return;
        const text = m.text.slice(0, 240); if (!text.trim()) return;
        const ch = m.ch === "side" ? "side" : m.ch === "whisper" ? "whisper" : "global";
        if (ch === "whisper") {
          let to = typeof m.to === "string" ? m.to : "";
          if (!to && typeof m.toName === "string") {
            const want = m.toName.trim().toLowerCase().slice(0, 40);
            for (const [qid, q] of world.players) if (socks.has(qid) && String(q.name).toLowerCase() === want) { to = qid; break; }
            if (!to) { ws.send(JSON.stringify({ t: "chat", ch, sys: 1, withName: m.toName.trim().slice(0, 40), text: "offline" })); return; }
          }
          const tws = socks.get(to), tp = world.players.get(to);
          if (!tws || !tp || to === pid) { ws.send(JSON.stringify({ t: "chat", ch, sys: 1, with: to, text: "offline" })); return; }
          const line = { t: "chat", ch, i: pid, n: user.username, s: me.team, r: badge(pid), text };
          tws.send(JSON.stringify({ ...line, with: pid, withName: user.username })); ws.send(JSON.stringify({ ...line, with: to, withName: tp.name }));
          remember({ at: Date.now(), i: pid, n: user.username, ch: "whisper", text }); return;
        }
        const msg = JSON.stringify({ t: "chat", ch, i: pid, n: user.username, s: me.team, r: badge(pid), text });
        for (const [qid, qws] of socks) { const q = world.players.get(qid); if (q && qws.readyState === qws.OPEN && (ch === "global" || q.team === me.team)) qws.send(msg); }
        remember({ at: Date.now(), i: pid, n: user.username, ch, text });
      }
      else if (m.t === "report") {             // a player reports another: kept for the admin panel with their recent lines
        if (!reportOk(pid) || typeof m.i !== "string" || m.i === pid || !/^[0-9]{1,15}$/.test(m.i)) return;
        const text = safeText(m.text, 1000); if (!text) return;
        const chat = recent.filter((l) => l.i === m.i).slice(-30).map((l) => ({ at: l.at, ch: l.ch, text: l.text }));
        pool.query(`INSERT INTO reports (reporter, target, target_name, category, text, chat) SELECT $1, id, username, 'player', $3, $4 FROM users WHERE id = $2`, [pid, m.i, text, JSON.stringify(chat)])
          .then(() => ws.send(JSON.stringify({ t: "reported" }))).catch((e) => console.error("report", e));
      }
      else if (m.t === "bnew" || m.t === "bset" || m.t === "bdel") {   // the Build menu
        if (!placer) return;
        const bid = typeof m.id === "string" && /^[0-9]{1,15}$/.test(m.id) ? m.id : null;
        if (m.t === "bnew") { const q = Number.isInteger(m.q) ? m.q : 0; world.addBuild(m, pid).then((b) => { if (!b) return; objCast(b); if (socks.get(pid) === ws) ws.send(JSON.stringify({ t: "bnew", q, id: b.id })); }).catch((e) => console.error("build", e)); }
        else if (m.t === "bset") { const b = bid && world.setBuild(bid, m); if (b) objCast(b); }
        else if (bid) world.delBuild(bid).then((ok) => { if (ok) objGone([bid]); }).catch((e) => console.error("unbuild", e));
      }
      else if (m.t === "ui") { if ((editor || placer) && UI_KEYS.includes(m.k) && Number.isFinite(m.x) && Number.isFinite(m.y)) uiSet(pid, m.k, m.x, m.y).catch((e) => console.error("ui", e)); }
      else if (m.t === "ping") { try { ws.send(JSON.stringify({ t: "pong", ts: m.ts })); } catch {} }
    });
    ws.on("close", () => {
      clearInterval(cmdReset); if (socks.get(pid) !== ws) return;
      socks.delete(pid); mutes.delete(pid); roles.delete(pid); if (device && devs.get(device) === pid) devs.delete(device);
      if (joined) world.leave(pid).then(() => broadcast({ t: "leave", i: pid })).catch((e) => console.error("leave", e));
    });
    ws.on("error", (e) => console.error("ws", e.message));
  });

  // editor window spots, per account
  const uiTable = pool.query(`CREATE TABLE IF NOT EXISTS world3d_ui (user_id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb)`);
  async function uiGet(uid) { await uiTable; const { rows } = await pool.query(`SELECT data FROM world3d_ui WHERE user_id = $1`, [String(uid)]); return rows[0] ? rows[0].data : {}; }
  async function uiSet(uid, k, x, y) { await uiTable; const v = { x: Math.max(0, Math.min(20000, Math.round(x))), y: Math.max(0, Math.min(20000, Math.round(y))) }; await pool.query(`INSERT INTO world3d_ui (user_id, data) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET data = world3d_ui.data || $2`, [String(uid), JSON.stringify({ [k]: v })]); }

  // ---- Build pieces go only to players whose load circle reaches them (each socket keeps the ids it was sent) ----
  const reach = (p, b) => Math.hypot(b.x - p.x, b.y - p.y) - b.rad <= LOAD_R;
  const known = (ws) => ws.known || (ws.known = new Set());
  function objCast(b) { const id = String(b.id); let msg = null; for (const [qid, qws] of socks) { const p = world.players.get(qid); if (!p || qws.readyState !== qws.OPEN) continue; const k = known(qws); if (k.has(id) || reach(p, b)) { k.add(id); qws.send(msg || (msg = JSON.stringify({ t: "build", o: buildMsg(b) }))); } } }
  function objGone(ids) { for (const [, qws] of socks) { if (qws.readyState !== qws.OPEN) continue; const k = known(qws); for (const id of ids) if (k.delete(id)) qws.send(JSON.stringify({ t: "unbuild", id })); } }
  setInterval(() => {
    for (const [pid, ws] of socks) {
      const p = world.players.get(pid); if (!p || ws.readyState !== ws.OPEN) continue;
      const k = known(ws), seen = new Set(), out = [];
      for (const b of world.builds.values()) { const id = String(b.id); if (!reach(p, b)) continue; seen.add(id); if (!k.has(id)) { k.add(id); out.push({ t: "build", o: buildMsg(b) }); } }
      for (const id of [...k]) if (!seen.has(id)) { k.delete(id); out.push({ t: "unbuild", id }); }
      if (out.length) ws.send(JSON.stringify({ t: "batch", m: out }));
    }
  }, 500);

  // the Ship Editor's changes: to everyone, at most 5 times a second
  let shipsCast = false;
  setInterval(() => { if (!shipsCast) return; shipsCast = false; broadcast({ t: "ships", ships: world.ships }); }, 200);

  const r1 = (v) => Math.round(v * 10) / 10;
  setInterval(() => {                          // 20 Hz simulation, then this tick's impacts and shots to the players near them
    world.step();
    if (world.hits.length) {
      for (const [pid, ws] of socks) {
        const p = world.players.get(pid); if (!p || ws.readyState !== ws.OPEN) continue;
        const near = world.hits.filter((h) => Math.hypot(h.x - p.x, h.y - p.y) <= LOAD_R).map((h) => ({ t: "hit", x: Math.round(h.x), y: Math.round(h.y), s: h.s, a: h.a, b: h.b, dx: Math.round(h.dx * 100) / 100, dy: Math.round(h.dy * 100) / 100, ...(h.sa ? { sa: 1 } : {}), ...(h.sb ? { sb: 1 } : {}) }));
        if (near.length) ws.send(JSON.stringify(near.length === 1 ? near[0] : { t: "batch", m: near }));
      }
      world.hits.length = 0;
    }
    if (world.projEv.length) {
      for (const [pid, ws] of socks) {
        const p = world.players.get(pid); if (!p || ws.readyState !== ws.OPEN) continue;
        const out = [];
        for (const e of world.projEv) {
          if (e.t === "proj") { const q = e.q, S = q.S; if (Math.hypot(q.x - p.x, q.y - p.y) > LOAD_R + maxRange(S)) continue;
            out.push({ t: "proj", i: q.id, a: q.a, x: r1(q.x), y: r1(q.y), ux: Math.round(q.ux * 1000) / 1000, uy: Math.round(q.uy * 1000) / 1000, s: [S.bspeed, S.optimal, S.falloff, S.spdEnd, S.spdCurve] }); }
          else if (Math.hypot(e.x - p.x, e.y - p.y) <= LOAD_R) out.push({ t: "pend", i: e.i, x: r1(e.x), y: r1(e.y), h: e.h, s: e.s, ...(e.sh ? { sh: 1 } : {}) });
        }
        if (out.length) ws.send(JSON.stringify({ t: "batch", m: out }));
      }
      world.projEv.length = 0;
    }
    world.deaths.length = 0;
  }, 50);
  // 15 Hz snapshots: only the rows that changed since this socket's last (p), the ids of the unchanged ones (u), or
  // { same: 1 }; a ship in neither has left the load circle
  setInterval(() => {
    const ts = Date.now();
    for (const [pid, ws] of socks) {
      const p = world.players.get(pid); if (!p || ws.readyState !== ws.OPEN) continue;
      const rows = world.snapshotFor(p), last = ws.lastSnap || new Map(), now = new Map(), ch = [], un = [];
      for (const r of rows) { const id = r[0], key = JSON.stringify(r); now.set(id, key); if (last.get(id) === key) un.push(id); else ch.push(r); }
      ws.lastSnap = now;
      ws.send(JSON.stringify(!ch.length && un.length === last.size ? { t: "snap", ts, same: 1 } : { t: "snap", ts, p: ch, u: un }));
    }
  }, 66);
  setInterval(() => {                          // each player's own capacitor, ammo and reload, 5 Hz, only on change
    const now = Date.now();
    for (const [pid, ws] of socks) { const p = world.players.get(pid); if (!p || ws.readyState !== ws.OPEN) continue;
      const msg = JSON.stringify({ t: "me", c: Math.round(p.cap * 10) / 10, o: p.capOut ? 1 : 0, a: Math.ceil(p.ammo), r: p.reloadAt ? Math.max(0, p.reloadAt - now) : 0, d: p.dead ? Math.max(0, p.deadUntil - now) : 0 });
      if (msg !== ws.lastMe) { ws.lastMe = msg; ws.send(msg); } }
  }, 200);
  void inside;
  console.log("3D world attached at /ws (hex " + Math.round(HEX_FLAT) + " m flat to flat)");
}
