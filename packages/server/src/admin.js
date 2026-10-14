// The admin panel's server side (owner, 2026-10-13: a small panel for the 3D game). Staff are accounts with a role
// ('head' = Nyssary, 'admin', 'mod'); being logged in as one is enough (owner: no second admin password). The panel
// lists online players (plus anyone banned or muted) with the disciplinary panel (kick, mute, ban, kill, respawn,
// teleports) and unban / unmute, player reports, and the ban appeals.
// Every action goes in the admin log; staff can't act on themselves or on other staff. Admins appear
// to players as "Admin" (appeal lines), never by username.
import express from "express";
import { safeText } from "./textsafe.js";
import { pool } from "./db.js";
import { getSessionUser, readCookie, destroyAllSessions } from "./sessions.js";
import { PTR, ptrAs } from "./ptr.js";
import { appealState, lines, adminWrite, closeAppeal } from "./appeals.js";

const REASON_MAX = 500, STAFF = ["head", "admin", "mod"];
// the game socket's side (net.js registers these): who's online (id -> { name, side }), kicking, mutes, devices in use
let hooks = { online: () => new Map(), kick: () => {}, mute: () => {}, respawn: () => false, teleportTo: () => false, inWorld: () => false, note: () => {}, deviceBusy: () => false };
/** For the other server modules: ask or tell the game something. */
export const gameHook = (name, ...args) => hooks[name] && hooks[name](...args);
export const setGameHooks = (h) => { hooks = { ...hooks, ...h }; };

export const admin = express.Router();
const fail = (res, code, error) => res.status(code).json({ error });
const isId = (v) => typeof v === "string" && /^[0-9]{1,15}$/.test(v);
const cleanReason = (r) => safeText(r, REASON_MAX);

async function who(req, res) {
  let u = await getSessionUser(readCookie(req));
  if (PTR && req.headers["x-ptr-as"]) u = await ptrAs(String(req.headers["x-ptr-as"]));   // (PTR only: tests act as another account)
  if (!u) { fail(res, 401, "Not logged in."); return null; }
  if (!STAFF.includes(u.role)) { fail(res, 403, "Not an admin."); return null; }
  return { id: String(u.id), name: "Admin", username: u.username, role: u.role };
}
const guard = (fn) => async (req, res) => { try { const me = await who(req, res); if (me) await fn(req, res, me); } catch (e) { console.error("admin", e); fail(res, 500, "Something went wrong."); } };
async function target(id) {
  if (!isId(String(id || ""))) return null;
  const { rows } = await pool.query(`SELECT id, username, role, ban_perm, ban_until, ban_reason, ban_at, mute_perm, mute_until, mute_reason, mute_at FROM users WHERE id = $1`, [String(id)]);
  return rows[0] || null;
}
const mayAct = (me, t) => String(t.id) !== me.id && !t.role;
async function log(me, t, action, reason, detail = null) {
  await pool.query(`INSERT INTO admin_log (admin_id, admin_name, target_id, target_name, action, reason, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [me.id, me.username, t.id, t.username, action, reason || "", detail]);
}
const banOf = (u) => u.ban_perm ? { perm: true, reason: u.ban_reason || "" } : u.ban_until && new Date(u.ban_until) > new Date() ? { perm: false, until: u.ban_until, reason: u.ban_reason || "" } : null;
const muteOf = (u) => u.mute_perm ? { perm: true, reason: u.mute_reason || "" } : u.mute_until && new Date(u.mute_until) > new Date() ? { perm: false, until: u.mute_until, reason: u.mute_reason || "" } : null;

admin.get("/me", guard(async (req, res, me) => res.json({ role: me.role })));

// online players, and everyone banned or muted (so they can be lifted while offline); ?focus=id adds that account too
// (opened from a player's name in chat, or from a report)
admin.get("/players", guard(async (req, res) => {
  const on = hooks.online(), ids = [...on.keys()];
  if (isId(String(req.query.focus || ""))) ids.push(String(req.query.focus));
  const { rows } = await pool.query(`SELECT id, username, role, ban_perm, ban_until, ban_reason, mute_perm, mute_until, mute_reason FROM users
    WHERE id = ANY($1::bigint[]) OR ban_perm OR ban_until > now() OR mute_perm OR mute_until > now() ORDER BY lower(username)`, [ids]);
  res.json(rows.map((u) => { const o = on.get(String(u.id)); return { id: String(u.id), name: u.username, staff: !!u.role, online: !!o, side: o ? o.side || null : null, ban: banOf(u), mute: muteOf(u) }; }));
}));

// (owner, 2026-10-13) the disciplinary panel: one action on a player. type: kick | mute | ban | kill | respawn | tpme
// (teleport them to me) | tpto (teleport me to them). Mutes and bans take a reason from their list and a length from the
// slider's notches (minutes, or indefinite); a note to the player is optional (shown in their chat, or with the kick /
// ban message, and with the ban at login). No free-text reasons.
const REASONS = { mute: ["Language", "Spam"], ban: ["Language", "Spam", "Disruptive Behavior"] };
const NOTCHES = [5, 30, 360, 1440, 4320, 10080];       // 5 min, 30 min, 6 h, 1 day, 3 days, 7 days (+ indefinite)
const lengthText = (m) => m === null ? "indefinitely" : m < 60 ? m + " minutes" : m < 1440 ? m / 60 + " hours" : m / 1440 + (m === 1440 ? " day" : " days");
admin.post("/act", guard(async (req, res, me) => {
  const b = req.body || {}, type = String(b.type || ""), t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!["kick", "mute", "ban", "kill", "respawn", "tpme", "tpto"].includes(type)) return fail(res, 400, "Bad request.");
  if (String(t.id) === me.id) return fail(res, 403, "You can't do that to yourself.");
  if (!type.startsWith("tp") && t.role) return fail(res, 403, "You can't do that to staff.");
  const note = safeText(b.note, 300);
  let reason = "", minutes = null;
  if (REASONS[type]) {
    reason = String(b.reason || ""); if (!REASONS[type].includes(reason)) return fail(res, 400, "Pick a reason.");
    if (b.minutes !== null && b.minutes !== undefined) { minutes = Number(b.minutes); if (!NOTCHES.includes(minutes)) return fail(res, 400, "Bad length."); }
  }
  const tid = String(t.id), shown = reason + (note ? " — " + note : "");
  const until = minutes === null ? null : new Date(Date.now() + minutes * 60_000);
  if (type === "kick") hooks.kick(tid, 4005, note);
  else if (type === "ban") {
    await pool.query(`UPDATE users SET ban_perm = $2, ban_until = $3, ban_reason = $4, ban_at = now() WHERE id = $1`, [tid, minutes === null, until, shown]);
    await destroyAllSessions(tid); hooks.kick(tid, 4006, shown);
  } else if (type === "mute") {
    await pool.query(`UPDATE users SET mute_perm = $2, mute_until = $3, mute_reason = $4, mute_at = now() WHERE id = $1`, [tid, minutes === null, until, shown]);
    hooks.mute(tid, { perm: minutes === null, until: until && until.getTime() });
    hooks.note(tid, "Muted " + lengthText(minutes) + ": " + shown);
  } else if (type === "kill" || type === "respawn") { if (!hooks.respawn(tid)) return fail(res, 400, "That player isn't in the world."); }
  else if (type === "tpme") { if (!hooks.inWorld(me.id)) return fail(res, 400, "You're not in the world."); if (!hooks.teleportTo(tid, me.id)) return fail(res, 400, "That player isn't in the world."); }
  else if (type === "tpto") { if (!hooks.inWorld(tid)) return fail(res, 400, "That player isn't in the world."); if (!hooks.teleportTo(me.id, tid)) return fail(res, 400, "You're not in the world."); }
  if (note && !["kick", "ban", "mute"].includes(type)) hooks.note(tid, note);
  await log(me, t, type, reason, { ...(REASONS[type] ? { length: lengthText(minutes) } : {}), ...(note ? { note } : {}) });
  res.json({ ok: true });
}));
admin.post("/unban", guard(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  if (!banOf(t)) return fail(res, 400, "That player isn't banned.");
  await pool.query(`UPDATE users SET ban_perm = false, ban_until = NULL, ban_reason = NULL, ban_at = NULL WHERE id = $1`, [t.id]);
  { const { rows } = await pool.query(`SELECT id FROM appeals WHERE user_id = $1 AND status = 'open'`, [t.id]); for (const r of rows) await closeAppeal(String(r.id), me, true, "Unbanned."); }   // (an open appeal is answered by it)
  await log(me, t, "unban", ""); res.json({ ok: true });
}));
admin.post("/unmute", guard(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  await pool.query(`UPDATE users SET mute_perm = false, mute_until = NULL, mute_reason = NULL, mute_at = NULL WHERE id = $1`, [t.id]);
  hooks.mute(String(t.id), null);
  await log(me, t, "unmute", ""); res.json({ ok: true });
}));

// ---- (owner, 2026-10-13) player reports (made from a name in chat): open first; each with the reported player's recent lines ----
admin.get("/reports", guard(async (req, res) => {
  const { rows } = await pool.query(`SELECT r.id, r.target, r.target_name, r.text, r.chat, r.status, r.created_at, u.username AS reporter
    FROM reports r LEFT JOIN users u ON u.id = r.reporter WHERE r.category = 'player' ORDER BY (r.status = 'open') DESC, r.id DESC LIMIT 100`);
  res.json(rows.map((r) => ({ id: String(r.id), target: r.target == null ? null : String(r.target), targetName: r.target_name, reporter: r.reporter || "?", text: r.text, chat: r.chat || [], status: r.status, at: r.created_at })));
}));
admin.post("/report/close", guard(async (req, res, me) => {
  const id = String((req.body || {}).id || ""); if (!isId(id)) return fail(res, 400, "Bad request.");
  const { rows } = await pool.query(`UPDATE reports SET status = 'closed' WHERE id = $1 AND category = 'player' RETURNING target, target_name`, [id]);
  if (!rows[0]) return fail(res, 404, "No such report.");
  await log(me, { id: rows[0].target, username: rows[0].target_name }, "report closed", "", { report: id }); res.json({ ok: true });
}));

// ---- ban appeals (appeals.js): a conversation with a banned player while the ban lasts; Accept unbans, Deny closes it ----
admin.get("/appeals", guard(async (req, res) => {
  const { rows } = await pool.query(`SELECT a.id, a.user_id, a.username, a.ban_reason, a.status, a.created_at,
      (SELECT row_to_json(m) FROM (SELECT text, at, from_admin FROM appeal_messages WHERE appeal_id = a.id ORDER BY id DESC LIMIT 1) m) AS last
    FROM appeals a ORDER BY (a.status = 'open') DESC, a.id DESC LIMIT 100`);
  res.json(rows.map((a) => ({ id: String(a.id), name: a.username, banReason: a.ban_reason, status: a.status, at: a.created_at, last: a.last && { text: a.last.text, at: a.last.at, admin: a.last.from_admin } })));
}));
async function appealOf(id) { if (!isId(String(id || ""))) return null; const { rows } = await pool.query(`SELECT * FROM appeals WHERE id = $1`, [String(id)]); return rows[0] || null; }
admin.get("/appeal/:id", guard(async (req, res) => {
  const a = await appealOf(req.params.id); if (!a) return fail(res, 404, "No such appeal.");
  const st = a.user_id ? await appealState(String(a.user_id)) : null;
  res.json({ id: String(a.id), name: a.username, banReason: a.ban_reason, status: a.status, at: a.created_at, lines: await lines(String(a.id)), ban: st && st.ban });
}));
admin.post("/appeal/say", guard(async (req, res, me) => {
  const b = req.body || {}, a = await appealOf(b.id); if (!a) return fail(res, 404, "No such appeal.");
  try { await adminWrite(String(a.id), me, b.text); res.json({ ok: true }); } catch (e) { fail(res, 400, e.message); }
}));
admin.post("/appeal", guard(async (req, res, me) => {
  const b = req.body || {}, a = await appealOf(b.id);
  if (!a || a.status !== "open") return fail(res, 404, "That appeal isn't open.");
  const t = await target(String(a.user_id)); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const accept = !!b.accept, reason = cleanReason(b.reason) || (accept ? "Unbanned." : "Denied.");   // (an optional note)
  await closeAppeal(String(a.id), me, accept, reason);
  if (accept) await pool.query(`UPDATE users SET ban_perm = false, ban_until = NULL, ban_reason = NULL, ban_at = NULL WHERE id = $1`, [t.id]);
  await log(me, t, accept ? "appeal accepted" : "appeal denied", reason, { appeal: String(a.id) }); res.json({ ok: true });
}));
