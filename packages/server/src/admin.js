// The admin panel's server side (owner, 2026-10-13: a small panel for the 3D game). Staff are accounts with a role
// ('head' = Nyssary, 'admin', 'mod'); being logged in as one is enough (owner: no second admin password). The panel
// lists online players (plus anyone banned or muted) with kick / ban / unban / mute / unmute, and the ban appeals.
// Every action needs a reason and goes in the admin log; staff can't act on themselves or on other staff. Admins appear
// to players as "Admin" (appeal lines), never by username.
import express from "express";
import { safeText } from "./textsafe.js";
import { pool } from "./db.js";
import { getSessionUser, readCookie, destroyAllSessions } from "./sessions.js";
import { PTR, ptrAs } from "./ptr.js";
import { appealState, lines, adminWrite, closeAppeal } from "./appeals.js";

const REASON_MAX = 500, STAFF = ["head", "admin", "mod"];
// the game socket's side (net.js registers these): who's online (id -> { name, side }), kicking, mutes, devices in use
let hooks = { online: () => new Map(), kick: () => {}, mute: () => {}, deviceBusy: () => false };
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
// a length: permanent, or a number of hours / days
const lengthOf = (b) => { const n = Number(b.amount), unit = b.unit === "days" ? 86400_000 : b.unit === "hours" ? 3600_000 : 0; return b.perm ? { perm: true, until: null } : Number.isInteger(n) && n >= 1 && n <= 3650 && unit ? { perm: false, until: new Date(Date.now() + n * unit), n } : null; };

admin.get("/me", guard(async (req, res, me) => res.json({ role: me.role })));

// online players, and everyone banned or muted (so they can be lifted while offline)
admin.get("/players", guard(async (req, res) => {
  const on = hooks.online(), ids = [...on.keys()];
  const { rows } = await pool.query(`SELECT id, username, role, ban_perm, ban_until, ban_reason, mute_perm, mute_until, mute_reason FROM users
    WHERE id = ANY($1::bigint[]) OR ban_perm OR ban_until > now() OR mute_perm OR mute_until > now() ORDER BY lower(username)`, [ids]);
  res.json(rows.map((u) => { const o = on.get(String(u.id)); return { id: String(u.id), name: u.username, staff: !!u.role, online: !!o, side: o ? o.side || null : null, ban: banOf(u), mute: muteOf(u) }; }));
}));

admin.post("/kick", guard(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason.");
  hooks.kick(String(t.id), 4005, reason);
  await log(me, t, "kick", reason); res.json({ ok: true });
}));
admin.post("/ban", guard(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason the player will see.");
  const len = lengthOf(b); if (!len) return fail(res, 400, "Give the ban a length.");
  await pool.query(`UPDATE users SET ban_perm = $2, ban_until = $3, ban_reason = $4, ban_at = now() WHERE id = $1`, [t.id, len.perm, len.until, reason]);
  await destroyAllSessions(t.id);
  hooks.kick(String(t.id), 4006, reason);
  await log(me, t, "ban", reason, len.perm ? { perm: true } : { amount: len.n, unit: b.unit, until: len.until }); res.json({ ok: true });
}));
admin.post("/unban", guard(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write why.");
  if (!banOf(t)) return fail(res, 400, "That player isn't banned.");
  await pool.query(`UPDATE users SET ban_perm = false, ban_until = NULL, ban_reason = NULL, ban_at = NULL WHERE id = $1`, [t.id]);
  { const { rows } = await pool.query(`SELECT id FROM appeals WHERE user_id = $1 AND status = 'open'`, [t.id]); for (const r of rows) await closeAppeal(String(r.id), me, true, reason); }   // (an open appeal is answered by it)
  await log(me, t, "unban", reason); res.json({ ok: true });
}));
admin.post("/mute", guard(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason.");
  const len = lengthOf(b); if (!len) return fail(res, 400, "Give the mute a length.");
  await pool.query(`UPDATE users SET mute_perm = $2, mute_until = $3, mute_reason = $4, mute_at = now() WHERE id = $1`, [t.id, len.perm, len.until, reason]);
  hooks.mute(String(t.id), { perm: len.perm, until: len.until && len.until.getTime() });
  await log(me, t, "mute", reason, len.perm ? { perm: true } : { amount: len.n, unit: b.unit, until: len.until }); res.json({ ok: true });
}));
admin.post("/unmute", guard(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write why.");
  await pool.query(`UPDATE users SET mute_perm = false, mute_until = NULL, mute_reason = NULL, mute_at = NULL WHERE id = $1`, [t.id]);
  hooks.mute(String(t.id), null);
  await log(me, t, "unmute", reason); res.json({ ok: true });
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
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason.");
  const accept = !!b.accept;
  await closeAppeal(String(a.id), me, accept, reason);
  if (accept) await pool.query(`UPDATE users SET ban_perm = false, ban_until = NULL, ban_reason = NULL, ban_at = NULL WHERE id = $1`, [t.id]);
  await log(me, t, accept ? "appeal accepted" : "appeal denied", reason, { appeal: String(a.id) }); res.json({ ok: true });
}));
