// The admin panel's server side (owner, 2026-10-11). Admins (users.role 'admin') and the Head Admin ('head': Nyssary,
// set in db.js) open it with a second password, kept here only as its scrypt hash. Everything is checked here:
//   anyone with a role: see the players and the admin log, kick, ban (permanent, or for hours / days) and unban, each
//     with a reason, written to the admin log (a ban's reason is what the player sees at login);
//   the Head Admin only: make or remove admins, add / remove / reset a pilot's license levels, reset credits and the
//     corporation.
// No one can act on themselves or the Head Admin; an admin can't act on another admin.
import crypto from "node:crypto";
import express from "express";
import { pool } from "./db.js";
import { getSessionUser, readCookie, destroyAllSessions } from "./sessions.js";
import { verifySecret } from "./hash.js";
import { allow } from "./ratelimit.js";
import { PTR } from "./ptr.js";
import { LICENSES, STARTING_LICENSES, getLicense } from "./licenses.js";
import { CORP } from "./pilots.js";

const ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$4c30f6abf27a79c489f12869811f1ae9$cc0bd80ad3565c3c6b6404e4af96c61c06bba810a36133290e6c02b30970294b";
const UNLOCK_MS = 8 * 3600_000;                     // the second password lasts this long per session
const REASON_MAX = 500;
const unlocked = new Map();                         // session key -> { uid, until }

// the game socket's side (net.js registers these): who's online, kicking, and refreshing a player's pilots in the world
let hooks = { online: () => new Set(), kick: () => {}, refreshPilots: async () => {} };
export const setGameHooks = (h) => { hooks = { ...hooks, ...h }; };

export const admin = express.Router();
const sessionKey = (req, uid) => PTR ? "ptr:" + uid : crypto.createHash("sha256").update(readCookie(req) || "").digest("hex");
const fail = (res, code, error) => res.status(code).json({ error });
const isId = (v) => typeof v === "string" && /^[0-9]{1,15}$/.test(v) || (Number.isInteger(v) && v > 0);
const cleanReason = (r) => (typeof r === "string" ? r.replace(/\s+/g, " ").trim().slice(0, REASON_MAX) : "");

// signed in with a role; `needUnlock`: and the second password given this session
async function who(req, res, needUnlock = true) {
  const u = await getSessionUser(readCookie(req));
  if (!u) { fail(res, 401, "Not logged in."); return null; }
  if (u.role !== "admin" && u.role !== "head") { fail(res, 403, "Not an admin."); return null; }
  const key = sessionKey(req, u.id), un = unlocked.get(key);
  if (needUnlock && !(un && un.uid === String(u.id) && un.until > Date.now())) { fail(res, 403, "Locked."); return null; }
  return { id: String(u.id), name: u.username, role: u.role, key };
}
const guard = (needUnlock, fn) => async (req, res) => { try { const me = await who(req, res, needUnlock); if (me) await fn(req, res, me); } catch (e) { console.error("admin", e); fail(res, 500, "Something went wrong."); } };
async function target(id) {
  if (!isId(id)) return null;
  const { rows } = await pool.query(`SELECT id, username, role, credits, corp, created_at, ban_perm, ban_until, ban_reason FROM users WHERE id = $1`, [String(id)]);
  return rows[0] || null;
}
// may `me` act on `t` (kick, ban, change)? never yourself or the Head Admin; an admin not on another admin
const mayAct = (me, t) => String(t.id) !== me.id && t.role !== "head" && !(t.role === "admin" && me.role !== "head");
async function log(me, t, action, reason, detail = null) {
  await pool.query(`INSERT INTO admin_log (admin_id, admin_name, target_id, target_name, action, reason, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [me.id, me.name, t.id, t.username, action, reason || "", detail]);
}
const banOf = (u) => u.ban_perm ? { perm: true, reason: u.ban_reason || "" } : u.ban_until && new Date(u.ban_until) > new Date() ? { perm: false, until: u.ban_until, reason: u.ban_reason || "" } : null;

// ---- the second password ----
admin.get("/me", guard(false, async (req, res, me) => { const un = unlocked.get(me.key); res.json({ role: me.role, unlocked: !!(un && un.uid === me.id && un.until > Date.now()) }); }));
admin.post("/unlock", guard(false, async (req, res, me) => {
  if (!allow("admin-unlock", me.id, 5, 15 * 60_000)) return fail(res, 429, "Too many tries. Wait a few minutes.");
  const pw = req.body && req.body.password;
  if (typeof pw !== "string" || pw.length > 200 || !(await verifySecret(pw, ADMIN_PASSWORD_HASH))) return fail(res, 403, "Wrong password.");
  unlocked.set(me.key, { uid: me.id, until: Date.now() + UNLOCK_MS }); res.json({ ok: true });
}));
admin.post("/lock", guard(false, async (req, res, me) => { unlocked.delete(me.key); res.json({ ok: true }); }));

// ---- players ----
admin.get("/players", guard(true, async (req, res) => {
  const { rows } = await pool.query(`SELECT id, username, role, created_at, ban_perm, ban_until, ban_reason FROM users ORDER BY lower(username)`);
  const on = hooks.online();
  res.json(rows.map((u) => ({ id: String(u.id), name: u.username, role: u.role || null, createdAt: u.created_at, online: on.has(String(u.id)), ban: banOf(u) })));
}));
admin.get("/player/:id", guard(true, async (req, res) => {
  const t = await target(req.params.id); if (!t) return fail(res, 404, "No such player.");
  const { rows } = await pool.query(`SELECT id, name, data FROM pilots WHERE user_id = $1 ORDER BY id`, [t.id]);
  res.json({ id: String(t.id), name: t.username, role: t.role || null, createdAt: t.created_at, credits: Number(t.credits || 0), corp: t.corp || CORP, online: hooks.online().has(String(t.id)), ban: banOf(t),
    pilots: rows.map((p) => ({ id: String(p.id), name: p.name, licenses: (p.data && p.data.licenses) || {} })),
    licenses: LICENSES.map((l) => ({ key: l.key, name: l.name, maxLevel: l.maxLevel, start: STARTING_LICENSES[l.key] || 0 })) });
}));

// ---- kick, ban, unban (any admin; a reason each time) ----
admin.post("/kick", guard(true, async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason.");
  hooks.kick(String(t.id), 4003, { t: "kicked", reason });
  await log(me, t, "kick", reason); res.json({ ok: true });
}));
admin.post("/ban", guard(true, async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason the player will see.");
  const perm = !!b.perm, n = Number(b.amount), unit = b.unit === "days" ? 86400_000 : b.unit === "hours" ? 3600_000 : 0;
  if (!perm && !(Number.isInteger(n) && n >= 1 && n <= 3650 && unit)) return fail(res, 400, "Give the ban a length.");
  const until = perm ? null : new Date(Date.now() + n * unit);
  await pool.query(`UPDATE users SET ban_perm = $2, ban_until = $3, ban_reason = $4 WHERE id = $1`, [t.id, perm, until, reason]);
  await destroyAllSessions(t.id);
  hooks.kick(String(t.id), 4004, { t: "banned", reason, perm, until });
  await log(me, t, "ban", reason, perm ? { perm: true } : { amount: n, unit: b.unit, until }); res.json({ ok: true });
}));
admin.post("/unban", guard(true, async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write why.");
  if (!banOf(t)) return fail(res, 400, "That player isn't banned.");
  await pool.query(`UPDATE users SET ban_perm = false, ban_until = NULL, ban_reason = NULL WHERE id = $1`, [t.id]);
  await log(me, t, "unban", reason, isId(b.logId) ? { of: String(b.logId) } : null); res.json({ ok: true });
}));
admin.get("/log", guard(true, async (req, res) => {
  const { rows } = await pool.query(`SELECT id, at, admin_name, target_id, target_name, action, reason, detail FROM admin_log ORDER BY id DESC LIMIT 300`);
  res.json(rows.map((r) => ({ id: String(r.id), at: r.at, admin: r.admin_name, targetId: r.target_id == null ? null : String(r.target_id), target: r.target_name, action: r.action, reason: r.reason, detail: r.detail })));
}));

// ---- the Head Admin only ----
const head = (fn) => guard(true, async (req, res, me) => { if (me.role !== "head") return fail(res, 403, "Only the Head Admin can do that."); await fn(req, res, me); });
admin.post("/role", head(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (String(t.id) === me.id || t.role === "head") return fail(res, 403, "You can't change that player's role.");
  const make = !!b.admin; if (make === (t.role === "admin")) return res.json({ ok: true });
  await pool.query(`UPDATE users SET role = $2 WHERE id = $1`, [t.id, make ? "admin" : null]);
  await log(me, t, make ? "make admin" : "remove admin", cleanReason(b.reason)); res.json({ ok: true });
}));
admin.post("/license", head(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!isId(b.pilotId) || !getLicense(b.key) || !["+", "-", "reset"].includes(b.op)) return fail(res, 400, "Bad request.");
  const { rows } = await pool.query(`SELECT id, name, data FROM pilots WHERE id = $1 AND user_id = $2`, [String(b.pilotId), t.id]);
  const p = rows[0]; if (!p) return fail(res, 404, "No such pilot.");
  const l = getLicense(b.key), d = p.data || {}, lic = (d.licenses ||= {}), was = lic[l.key] || 0, start = STARTING_LICENSES[l.key] || 0;
  const now = b.op === "reset" ? start : Math.max(start, Math.min(l.maxLevel, was + (b.op === "+" ? 1 : -1)));
  if (now === was) return res.json({ ok: true, level: now });
  lic[l.key] = now;
  if (Array.isArray(d.queue)) d.queue = d.queue.filter((q) => q.key !== l.key || q.level > now);   // levels it now has leave the queue
  await pool.query(`UPDATE pilots SET data = $1 WHERE id = $2`, [d, p.id]);
  await hooks.refreshPilots(String(t.id));
  await log(me, t, "license " + (b.op === "reset" ? "reset" : b.op === "+" ? "up" : "down"), cleanReason(b.reason), { pilot: p.name, license: l.name, from: was, to: now });
  res.json({ ok: true, level: now });
}));
admin.post("/reset", head(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (b.what === "credits") { await pool.query(`UPDATE users SET credits = 0 WHERE id = $1`, [t.id]); await log(me, t, "reset credits", cleanReason(b.reason), { was: Number(t.credits || 0) }); }
  else if (b.what === "corp") { await pool.query(`UPDATE users SET corp = NULL WHERE id = $1`, [t.id]); await log(me, t, "reset corporation", cleanReason(b.reason), { was: t.corp || CORP }); }
  else return fail(res, 400, "Bad request.");
  res.json({ ok: true });
}));
