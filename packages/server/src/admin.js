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
import { appealState, lines, subscribers, subscribe, adminWrite, closeAppeal, timeoutAppeal } from "./appeals.js";
import { personaOf, adminShown, resolveLines, setPersona, loadPersonas } from "./personas.js";
import { heatNow, kindHeat, HEAT_MAX, HEAT_HOT } from "./language.js";
export { loadPersonas };

const ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$4c30f6abf27a79c489f12869811f1ae9$cc0bd80ad3565c3c6b6404e4af96c61c06bba810a36133290e6c02b30970294b";
const UNLOCK_MS = 8 * 3600_000;                     // the second password lasts this long per session
const REASON_MAX = 500;
const unlocked = new Map();                         // session key -> { uid, until }

// the game socket's side (net.js registers these): who's online, kicking, and refreshing a player's pilots in the world
let hooks = { persona: () => {}, online: () => new Set(), chatLog: () => [], shipNames: () => [], kick: () => {}, refreshPilots: async () => {}, freeze: () => {}, mute: () => {}, renameRequired: () => {}, renamed: () => {} };
/** For the other HTTP routes: tell the game something changed (a player renamed themselves or a pilot). */
export const gameHook = (name, ...args) => hooks[name] && hooks[name](...args);
/** Has this account opened the admin panel (the second password) in any of its sessions? (admin DMs over the socket) */
export const isUnlocked = (uid) => { for (const v of unlocked.values()) if (v.uid === String(uid) && v.until > Date.now()) return true; return false; };
export const setGameHooks = (h) => { hooks = { ...hooks, ...h }; };

export const admin = express.Router();
const sessionKey = (req, uid) => PTR ? "ptr:" + uid : crypto.createHash("sha256").update(readCookie(req) || "").digest("hex");
const fail = (res, code, error) => res.status(code).json({ error });
const isId = (v) => typeof v === "string" && /^[0-9]{1,15}$/.test(v) || (Number.isInteger(v) && v > 0);
const cleanReason = (r) => (typeof r === "string" ? r.replace(/\s+/g, " ").trim().slice(0, REASON_MAX) : "");

// signed in with a role; `needUnlock`: and the second password given this session; `needPersona`: and an admin profile
// made (owner: admins act under their admin name)
async function who(req, res, needUnlock = true, needPersona = needUnlock) {
  const u = await getSessionUser(readCookie(req));
  if (!u) { fail(res, 401, "Not logged in."); return null; }
  if (u.role !== "admin" && u.role !== "head") { fail(res, 403, "Not an admin."); return null; }
  const key = sessionKey(req, u.id), un = unlocked.get(key);
  if (needUnlock && !(un && un.uid === String(u.id) && un.until > Date.now())) { fail(res, 403, "Locked."); return null; }
  const pe = personaOf(u.id);
  if (needPersona && !pe) { fail(res, 403, "Make your admin profile first."); return null; }
  return { id: String(u.id), name: pe ? pe.name : u.username, role: u.role, key, persona: pe };
}
const guard = (needUnlock, fn, needPersona = needUnlock) => async (req, res) => { try { const me = await who(req, res, needUnlock, needPersona); if (me) await fn(req, res, me); } catch (e) { console.error("admin", e); fail(res, 500, "Something went wrong."); } };
async function target(id) {
  if (!isId(id)) return null;
  const { rows } = await pool.query(`SELECT id, username, role, credits, corp, created_at, ban_perm, ban_until, ban_reason, ban_at, frozen, frozen_at, frozen_reason, mute_perm, mute_until, mute_reason, mute_at, lang_heat, lang_heat_at FROM users WHERE id = $1`, [String(id)]);
  return rows[0] || null;
}
// may `me` act on `t` (kick, ban, change)? never yourself or the Head Admin; an admin not on another admin
const mayAct = (me, t) => String(t.id) !== me.id && t.role !== "head" && !(t.role === "admin" && me.role !== "head");
/** (net.js) an admin's action from the game (Freeze in an admin DM) into the admin log */
export async function logAction(adminId, adminName, targetId, targetName, action, reason = "", detail = null) {
  await pool.query(`INSERT INTO admin_log (admin_id, admin_name, target_id, target_name, action, reason, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [adminId, adminName, targetId, targetName, action, reason, detail]);
}
async function log(me, t, action, reason, detail = null) {
  await pool.query(`INSERT INTO admin_log (admin_id, admin_name, target_id, target_name, action, reason, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [me.id, me.name, t.id, t.username, action, reason || "", detail]);
}
// a player's active discipline (each with when it started and why): a ban, a mute (permanent, or until a time), Freeze
const banOf = (u) => u.ban_perm ? { perm: true, reason: u.ban_reason || "", at: u.ban_at } : u.ban_until && new Date(u.ban_until) > new Date() ? { perm: false, until: u.ban_until, reason: u.ban_reason || "", at: u.ban_at } : null;
export const muteOf = (u) => u.mute_perm ? { perm: true, reason: u.mute_reason || "", at: u.mute_at } : u.mute_until && new Date(u.mute_until) > new Date() ? { perm: false, until: u.mute_until, reason: u.mute_reason || "", at: u.mute_at } : null;
const frozenOf = (u) => u.frozen ? { reason: u.frozen_reason || "", at: u.frozen_at } : null;
// (owner) the language meter now (0 to the top), and the top and the hot mark for drawing it
const heatOf = (u) => Math.min(HEAT_MAX, Math.round(heatNow(u.lang_heat, u.lang_heat_at) * 10) / 10);
const lengthOf = (b) => { const n = Number(b.amount), unit = b.unit === "days" ? 86400_000 : b.unit === "hours" ? 3600_000 : 0; return b.perm ? { perm: true, until: null } : Number.isInteger(n) && n >= 1 && n <= 3650 && unit ? { perm: false, until: new Date(Date.now() + n * unit), n } : null; };

// ---- the second password ----
admin.get("/me", guard(false, async (req, res, me) => { const un = unlocked.get(me.key), un2 = !!(un && un.uid === me.id && un.until > Date.now()); res.json({ role: me.role, unlocked: un2, persona: un2 && me.persona ? { name: me.persona.name, pic: me.persona.pic } : null }); }));
// (owner) the admin profile: made when an admin first opens the panel, changed from its menu; every earlier line and log
// entry of theirs then shows the new one
admin.post("/persona", guard(true, async (req, res, me) => {
  const b = req.body || {};
  let r; try { r = await setPersona(me.id, b.name, b.pic); } catch (e) { return fail(res, 400, e.message); }
  if (!r.was || r.was.name !== r.now.name || r.was.pic !== r.now.pic) await pool.query(`INSERT INTO admin_log (admin_id, admin_name, target_id, target_name, action, reason, detail) VALUES ($1, $2, NULL, $2, $3, '', $4)`,
    [me.id, r.now.name, r.was ? "admin profile changed" : "admin profile made", r.was ? { from: r.was.name, pic: r.now.pic } : { pic: r.now.pic }]);
  hooks.persona(me.id, r.now); res.json({ ok: true, persona: { name: r.now.name, pic: r.now.pic } });
}, false));
admin.post("/unlock", guard(false, async (req, res, me) => {
  if (!PTR && !allow("admin-unlock", me.id, 5, 15 * 60_000)) return fail(res, 429, "Too many tries. Wait a few minutes.");   // (not in the PTR: its tests unlock often)
  const pw = req.body && req.body.password;
  if (typeof pw !== "string" || pw.length > 200 || !(await verifySecret(pw, ADMIN_PASSWORD_HASH))) return fail(res, 403, "Wrong password.");
  unlocked.set(me.key, { uid: me.id, until: Date.now() + UNLOCK_MS }); res.json({ ok: true });
}));
admin.post("/lock", guard(false, async (req, res, me) => { unlocked.delete(me.key); res.json({ ok: true }); }));

// ---- players ----
admin.get("/players", guard(true, async (req, res) => {
  const { rows } = await pool.query(`SELECT id, username, role, credits, corp, created_at, ban_perm, ban_until, ban_reason, ban_at, frozen, frozen_at, frozen_reason, mute_perm, mute_until, mute_reason, mute_at, lang_heat, lang_heat_at FROM users ORDER BY lower(username)`);
  const on = hooks.online();
  res.json(rows.map((u) => ({ id: String(u.id), name: u.username, role: u.role || null, ...(u.role && personaOf(u.id) ? { adminName: personaOf(u.id).name } : {}), createdAt: u.created_at, online: on.has(String(u.id)), ban: banOf(u), mute: muteOf(u), frozen: frozenOf(u), heat: heatOf(u) })));
}));
admin.get("/player/:id", guard(true, async (req, res) => {
  const t = await target(req.params.id); if (!t) return fail(res, 404, "No such player.");
  const { rows } = await pool.query(`SELECT id, name, data FROM pilots WHERE user_id = $1 ORDER BY id`, [t.id]);
  res.json({ id: String(t.id), name: t.username, role: t.role || null, createdAt: t.created_at, credits: Number(t.credits || 0), corp: t.corp || CORP, online: hooks.online().has(String(t.id)), ban: banOf(t), mute: muteOf(t), frozen: frozenOf(t), heat: heatOf(t), heatMax: HEAT_MAX, heatHot: HEAT_HOT,
    pilots: rows.map((p) => ({ id: String(p.id), name: p.name, portrait: (p.data && p.data.portrait) || null, licenses: (p.data && p.data.licenses) || {} })),
    licenses: LICENSES.map((l) => ({ key: l.key, name: l.name, maxLevel: l.maxLevel, start: STARTING_LICENSES[l.key] || 0 })) });
}));

// ---- kick, ban, unban (any admin; a reason each time) ----
admin.post("/kick", guard(true, async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason.");
  const chat = hooks.chatLog(String(t.id));   // (owner) the last hour of chat goes with it
  hooks.kick(String(t.id), 4005, { t: "kicked", reason });
  await log(me, t, "kick", reason, { chat, ships: hooks.shipNames(String(t.id)) }); res.json({ ok: true });
}));
admin.post("/ban", guard(true, async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason the player will see.");
  const len = lengthOf(b); if (!len) return fail(res, 400, "Give the ban a length.");
  const { perm, until } = len, n = len.n;
  await pool.query(`UPDATE users SET ban_perm = $2, ban_until = $3, ban_reason = $4, ban_at = now() WHERE id = $1`, [t.id, perm, until, reason]);
  await destroyAllSessions(t.id);
  hooks.kick(String(t.id), 4006, { t: "banned", reason, perm, until });
  await log(me, t, "ban", reason, { ...(perm ? { perm: true } : { amount: n, unit: b.unit, until }), chat: hooks.chatLog(String(t.id)), ships: hooks.shipNames(String(t.id)) }); res.json({ ok: true });
}));
admin.post("/unban", guard(true, async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write why.");
  if (!banOf(t)) return fail(res, 400, "That player isn't banned.");
  await pool.query(`UPDATE users SET ban_perm = false, ban_until = NULL, ban_reason = NULL, ban_at = NULL WHERE id = $1`, [t.id]);
  { const { rows } = await pool.query(`SELECT id FROM appeals WHERE user_id = $1 AND status = 'open'`, [t.id]); for (const r of rows) await closeAppeal(String(r.id), me, true, reason); }   // (an open appeal is answered by it)
  await log(me, t, "unban", reason, isId(b.logId) ? { of: String(b.logId) } : null); res.json({ ok: true });
}));
// (owner) Mute: no chat, permanent or for hours / days, with a reason
admin.post("/mute", guard(true, async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason.");
  const len = lengthOf(b); if (!len) return fail(res, 400, "Give the mute a length.");
  await pool.query(`UPDATE users SET mute_perm = $2, mute_until = $3, mute_reason = $4, mute_at = now() WHERE id = $1`, [t.id, len.perm, len.until, reason]);
  hooks.mute(String(t.id), { perm: len.perm, until: len.until && len.until.getTime(), reason });
  await log(me, t, "mute", reason, len.perm ? { perm: true } : { amount: len.n, unit: b.unit, until: len.until }); res.json({ ok: true });
}));
admin.post("/unmute", guard(true, async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write why.");
  await pool.query(`UPDATE users SET mute_perm = false, mute_until = NULL, mute_reason = NULL, mute_at = NULL WHERE id = $1`, [t.id]);
  hooks.mute(String(t.id), null);
  await log(me, t, "unmute", reason); res.json({ ok: true });
}));
// (owner) appeals (appeals.js): a conversation with a banned player while the ban lasts; every admin sees it all and can
// answer (answering subscribes you: you're told of new lines in the game). Accept unbans, Deny closes it; a Timeout
// closes it and blocks new appeals for days / months / years (then one more is allowed).
admin.get("/appeals", guard(true, async (req, res, me) => {
  const { rows } = await pool.query(`SELECT a.id, a.user_id, a.username, a.ban_reason, a.status, a.admin_name, a.admin_id, a.response, a.created_at,
      (SELECT count(*) FROM appeal_messages m WHERE m.appeal_id = a.id) AS n,
      (SELECT row_to_json(m) FROM (SELECT name, admin_id, text, at, from_admin FROM appeal_messages WHERE appeal_id = a.id ORDER BY id DESC LIMIT 1) m) AS last,
      EXISTS(SELECT 1 FROM appeal_subs s WHERE s.appeal_id = a.id AND s.admin_id = $1) AS sub
    FROM appeals a ORDER BY (a.status = 'open') DESC, a.id DESC LIMIT 300`, [me.id]);
  res.json(rows.map((a) => ({ id: String(a.id), userId: a.user_id == null ? null : String(a.user_id), name: a.username, banReason: a.ban_reason, status: a.status, admin: adminShown(a.admin_id, a.admin_name), response: a.response, at: a.created_at, lines: Number(a.n), last: a.last && { name: a.last.from_admin ? adminShown(a.last.admin_id, a.last.name) : a.last.name, text: a.last.text, at: a.last.at, from_admin: a.last.from_admin }, subscribed: a.sub })));
}));
async function appealOf(id) { if (!isId(id)) return null; const { rows } = await pool.query(`SELECT * FROM appeals WHERE id = $1`, [String(id)]); return rows[0] || null; }
admin.get("/appeal/:id", guard(true, async (req, res, me) => {
  const a = await appealOf(req.params.id); if (!a) return fail(res, 404, "No such appeal.");
  const st = a.user_id ? await appealState(String(a.user_id)) : null, subs = await subscribers(String(a.id));
  res.json({ id: String(a.id), userId: a.user_id == null ? null : String(a.user_id), name: a.username, banReason: a.ban_reason, status: a.status, at: a.created_at,
    lines: await lines(String(a.id)), subscribed: subs.includes(me.id), player: st && { banned: st.banned, ban: st.ban, used: st.used, left: st.left, blockedUntil: st.blockedUntil } });
}));
admin.post("/appeal/say", guard(true, async (req, res, me) => {
  const b = req.body || {}, a = await appealOf(b.id); if (!a) return fail(res, 404, "No such appeal.");
  try { await adminWrite(String(a.id), me, b.text); res.json({ ok: true }); } catch (e) { fail(res, 400, e.message); }
}));
admin.post("/appeal/subscribe", guard(true, async (req, res, me) => {
  const b = req.body || {}, a = await appealOf(b.id); if (!a) return fail(res, 404, "No such appeal.");
  await subscribe(String(a.id), me.id, !!b.on); res.json({ ok: true });
}));
admin.post("/appeal", guard(true, async (req, res, me) => {
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
admin.post("/appeal/timeout", guard(true, async (req, res, me) => {
  const b = req.body || {}, a = await appealOf(b.id); if (!a) return fail(res, 404, "No such appeal.");
  const t = await target(String(a.user_id)); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason.");
  const n = Number(b.amount), unit = { days: 1, months: 30, years: 365 }[b.unit];
  if (!(Number.isInteger(n) && n >= 1 && n <= 100 && unit)) return fail(res, 400, "Give the timeout a length.");
  const until = new Date(Date.now() + n * unit * 86400_000);
  await timeoutAppeal(String(a.id), String(t.id), me, until, reason);
  await log(me, t, "appeal timeout", reason, { appeal: String(a.id), amount: n, unit: b.unit, until }); res.json({ ok: true });
}));

// (owner) Freeze: the player's ships, station, chat and the rest are suspended (their ships can't be targeted) and their
// screen is grayed out but for an admin DM, until unfrozen
admin.post("/freeze", guard(true, async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  // (owner) freezing happens in an admin DM (its Freeze box, no reason needed); from here a player can only be unfrozen
  if (b.on) return fail(res, 400, "Freeze from an admin DM.");
  if (!t.frozen) return res.json({ ok: true });
  await hooks.freeze(String(t.id), false, me); res.json({ ok: true });
}));
// (owner) Ban Name: the player's name, or one of their pilots', goes on the banned names list, and they must pick a new one
admin.post("/banname", guard(true, async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason.");
  let name, kind;
  if (b.pilotId == null) { name = t.username; kind = "player"; await pool.query(`UPDATE users SET rename_required = true, rename_reason = $2 WHERE id = $1`, [t.id, reason]); }
  else {
    if (!isId(b.pilotId)) return fail(res, 400, "Bad request.");
    const { rows } = await pool.query(`SELECT id, name, data FROM pilots WHERE id = $1 AND user_id = $2`, [String(b.pilotId), t.id]); const p = rows[0];
    if (!p) return fail(res, 404, "No such pilot.");
    name = p.name; kind = "pilot"; const d = p.data || {}; d.renameRequired = true; d.renameReason = reason;
    await pool.query(`UPDATE pilots SET data = $2 WHERE id = $1`, [p.id, d]);
  }
  await pool.query(`INSERT INTO banned_names (name_lower, name, kind, admin_name, reason, admin_id) VALUES (lower($1), $1, $2, $3, $4, $5) ON CONFLICT (name_lower) DO NOTHING`, [name, kind, me.name, reason, me.id]);
  hooks.renameRequired(String(t.id));
  await log(me, t, "ban name", reason, { name, kind }); res.json({ ok: true });
}));
admin.get("/names", guard(true, async (req, res) => {
  const { rows } = await pool.query(`SELECT name, kind, admin_name, admin_id, reason, at FROM banned_names ORDER BY at DESC LIMIT 500`);
  res.json(rows.map((r) => ({ name: r.name, kind: r.kind, admin: adminShown(r.admin_id, r.admin_name), reason: r.reason, at: r.at })));
}));
admin.post("/names/remove", guard(true, async (req, res, me) => {
  const b = req.body || {}; if (typeof b.name !== "string" || b.name.length > 40) return fail(res, 400, "Bad request.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write why.");
  const { rowCount } = await pool.query(`DELETE FROM banned_names WHERE name_lower = lower($1)`, [b.name]); if (!rowCount) return fail(res, 404, "That name isn't banned.");
  await log(me, { id: null, username: b.name }, "unban name", reason); res.json({ ok: true });
}));
// (owner) Local / Corp lines the filter flagged (sexual, racist, extremist), newest first; DMs are never recorded
admin.get("/chatflags", guard(true, async (req, res) => {
  const { rows } = await pool.query(`SELECT id, at, user_id, username, channel, text, cats, words FROM chat_flags ORDER BY id DESC LIMIT 300`);
  res.json(rows.map((r) => ({ id: String(r.id), at: r.at, userId: r.user_id == null ? null : String(r.user_id), name: r.username, channel: r.channel, text: r.text, cats: r.cats, words: r.words })));
}));
// (owner) a player's language log: every line of theirs the filter flagged, newest first
admin.get("/player/:id/language", guard(true, async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, "Bad request.");
  const { rows } = await pool.query(`SELECT id, at, channel, text, cats, words FROM chat_flags WHERE user_id = $1 ORDER BY id DESC LIMIT 300`, [req.params.id]);
  res.json({ kinds: await kindHeat(req.params.id), lines: rows.map((r) => ({ id: String(r.id), at: r.at, channel: r.channel, text: r.text, cats: r.cats, words: r.words })) });
}));
admin.get("/log", guard(true, async (req, res) => {
  const { rows } = await pool.query(`SELECT id, at, admin_id, admin_name, target_id, target_name, action, reason, detail - 'chat' - 'ships' AS detail, detail -> 'ships' AS ships, jsonb_array_length(coalesce(detail -> 'chat', '[]'::jsonb)) AS chat_n FROM admin_log ORDER BY id DESC LIMIT 300`);
  res.json(rows.map((r) => ({ id: String(r.id), at: r.at, admin: adminShown(r.admin_id, r.admin_name), targetId: r.target_id == null ? null : String(r.target_id), target: r.target_name, action: r.action, reason: r.reason, detail: r.detail, chat: Number(r.chat_n), ships: r.ships || null })));
}));
// (owner) the chat saved with a kick or ban (the last hour: Local, Corp, the player's DMs and admin DMs)
admin.get("/log/:id/chat", guard(true, async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, "Bad request.");
  const { rows } = await pool.query(`SELECT detail -> 'chat' AS chat FROM admin_log WHERE id = $1`, [req.params.id]);
  res.json(resolveLines(rows[0] && rows[0].chat));
}));
// (owner) player reports, newest first, each with the last hour of chat saved when it was made; Close marks one handled
admin.get("/reports", guard(true, async (req, res) => {
  const { rows } = await pool.query(`SELECT r.id, r.reporter, u.username AS reporter_name, r.target, r.target_name, r.category, r.text, r.context, r.status, r.created_at, r.ships, jsonb_array_length(coalesce(r.chat, '[]'::jsonb)) AS chat_n FROM reports r LEFT JOIN users u ON u.id = r.reporter ORDER BY (r.status = 'open') DESC, r.id DESC LIMIT 300`);
  res.json(rows.map((r) => ({ id: String(r.id), reporterId: r.reporter == null ? null : String(r.reporter), reporter: r.reporter_name || "?", targetId: r.target == null ? null : String(r.target), target: r.target_name, category: r.category, text: r.text, context: r.context, status: r.status, at: r.created_at, chat: Number(r.chat_n), ships: r.ships || [] })));
}));
admin.get("/report/:id/chat", guard(true, async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, "Bad request.");
  const { rows } = await pool.query(`SELECT chat FROM reports WHERE id = $1`, [req.params.id]); res.json(resolveLines(rows[0] && rows[0].chat));
}));
admin.post("/report/close", guard(true, async (req, res, me) => {
  const b = req.body || {}; if (!isId(b.id)) return fail(res, 400, "Bad request.");
  await pool.query(`UPDATE reports SET status = 'closed' WHERE id = $1`, [String(b.id)]); res.json({ ok: true });
}));

// ---- the Head Admin only ----
const head = (fn) => guard(true, async (req, res, me) => { if (me.role !== "head") return fail(res, 403, "Only the Head Admin can do that."); await fn(req, res, me); });
admin.post("/role", head(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (String(t.id) === me.id || t.role === "head") return fail(res, 403, "You can't change that player's role.");
  const make = !!b.admin; if (make === (t.role === "admin")) return res.json({ ok: true });
  await pool.query(`UPDATE users SET role = $2 WHERE id = $1`, [t.id, make ? "admin" : null]);
  if (!make) for (const [k, v] of unlocked) if (v.uid === String(t.id)) unlocked.delete(k);   // a removed admin's panel locks at once
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
