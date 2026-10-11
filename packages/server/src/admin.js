// The admin panel's server side (owner, 2026-10-11). Staff: the Head Admin (Nyssary, role 'head', the only one), Admins
// ('admin') and Moderators ('mod').
// Nyssary (the owner, set in db.js) opens the panel with the shared second password, kept here only as its scrypt hash;
// every other staff member makes a password of their own first (30+ characters: 3 capitals, 3 numbers, 3 symbols).
//   Moderators: chat and behavior moderation (kick, ban, mute, freeze, names, separating players, appeals, reports,
//     support), each with a reason in the admin log (a ban's reason is what the player sees at login);
//   Admins: also make or remove Moderators, change credits, licenses and items, reset the corporation, approve words,
//     suspend Moderators (the Head Admin is told at once); only Nyssary makes or removes Admins.
// No one acts on themselves, and staff can't discipline staff (owner).
import crypto from "node:crypto";
import express from "express";
import { pool } from "./db.js";
import { getSessionUser, readCookie, destroyAllSessions } from "./sessions.js";
import { verifySecret, hashSecret } from "./hash.js";
import { allow } from "./ratelimit.js";
import { PTR, ptrAs } from "./ptr.js";
import { LICENSES, STARTING_LICENSES, getLicense } from "./licenses.js";
import { CORP, offerName } from "./pilots.js";
import { nameKey, filterForm, CATEGORY_KEYS } from "./namefilter.js";
import { reloadWords } from "./names.js";
import { unreadNoteCount, notesOf, readNotes, staffChatRecent, unreadCounts, markSeen } from "./staff.js";
import { setRelation, relationsOf } from "./relations.js";
import * as relAp from "./relappeals.js";
import * as tickets from "./tickets.js";
import { appealState, lines, subscribers, subscribe, adminWrite, closeAppeal, timeoutAppeal } from "./appeals.js";
import { personaOf, adminShown, resolveLines, setPersona, loadPersonas, setRank } from "./personas.js";
import { heatNow, kindHeat, HEAT_MAX, HEAT_HOT } from "./language.js";
export { loadPersonas };

const ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$4c30f6abf27a79c489f12869811f1ae9$cc0bd80ad3565c3c6b6404e4af96c61c06bba810a36133290e6c02b30970294b";
const UNLOCK_MS = 8 * 3600_000;                     // the second password lasts this long per session
const REASON_MAX = 500;
const unlocked = new Map();                         // session key -> { uid, until }

// the game socket's side (net.js registers these): who's online, kicking, and refreshing a player's pilots in the world
let hooks = { modSuspended: async () => {}, staffNotify: async () => {}, relations: () => {}, persona: () => {}, online: () => new Set(), chatLog: () => [], shipNames: () => [], kick: () => {}, refreshPilots: async () => {}, freeze: () => {}, mute: () => {}, renameRequired: () => {}, renamed: () => {} };
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
  let u = await getSessionUser(readCookie(req));
  if (PTR && req.headers["x-ptr-as"]) u = await ptrAs(String(req.headers["x-ptr-as"]));   // (PTR only: tests act as another account)
  if (!u) { fail(res, 401, "Not logged in."); return null; }
  if (!STAFF.includes(u.role)) { fail(res, 403, "Not an admin."); return null; }
  const key = sessionKey(req, u.id), un = unlocked.get(key);
  if (needUnlock && !(un && un.uid === String(u.id) && un.until > Date.now())) { fail(res, 403, "Locked."); return null; }
  const pe = personaOf(u.id);
  if (u.role === "mod" && (needUnlock || req.path === "/unlock")) {   // (owner) a suspended Moderator: no moderation until it ends
    const { rows } = await pool.query(`SELECT mod_suspended_until FROM users WHERE id = $1 AND mod_suspended_until > now()`, [u.id]);
    if (rows[0]) { fail(res, 403, "Your moderator abilities are suspended until " + new Date(rows[0].mod_suspended_until).toUTCString() + "."); return null; }
  }
  if (needPersona && !pe) { fail(res, 403, "Make your admin profile first."); return null; }
  return { id: String(u.id), name: pe ? pe.name : u.username, username: u.username, role: u.role, key, persona: pe };
}
const guard = (needUnlock, fn, needPersona = needUnlock) => async (req, res) => { try { const me = await who(req, res, needUnlock, needPersona); if (me) await fn(req, res, me); } catch (e) { console.error("admin", e); fail(res, 500, "Something went wrong."); } };
async function target(id) {
  if (!isId(id)) return null;
  const { rows } = await pool.query(`SELECT id, username, role, credits, corp, created_at, ban_perm, ban_until, ban_reason, ban_at, frozen, frozen_at, frozen_reason, mute_perm, mute_until, mute_reason, mute_at, lang_heat, lang_heat_at FROM users WHERE id = $1`, [String(id)]);
  return rows[0] || null;
}
// may `me` act on `t` (kick, ban, change)? never yourself or the Head Admin; an admin not on another admin
// (owner) staff (Moderators and Head Admins) can't kick, ban, mute, block or freeze each other
const mayAct = (me, t) => String(t.id) !== me.id && !t.role;
// (owner) staff roles: the Head Admin (Nyssary, the only one), Admins and Moderators; Admins and the Head Admin are "high"
const STAFF = ["head", "admin", "mod"], ROLE_NAME = { head: "Head Admin", admin: "Admin", mod: "Moderator" };
const high = (me) => me.role === "head" || me.role === "admin";
/** (owner) Nyssary: the one who makes Head Admins (and the PTR tester, standing in for them) */
const isOwner = (name) => String(name || "").toLowerCase() === "nyssary" || (PTR && String(name || "").toLowerCase() === "ptr");
// (owner) a staff member's own panel password: 30 characters or more, with 3 capitals, 3 numbers and 3 symbols
const pwProblem = (pw) => typeof pw !== "string" || pw.length < 30 || pw.length > 200 || (pw.match(/[A-Z]/g) || []).length < 3 || (pw.match(/[0-9]/g) || []).length < 3 || (pw.match(/[^A-Za-z0-9]/g) || []).length < 3
  ? "At least 30 characters, with 3 capitals, 3 numbers and 3 symbols." : null;
async function pwHashOf(uid) { const { rows } = await pool.query(`SELECT admin_pw_hash, password FROM users WHERE id = $1`, [uid]); return rows[0] || {}; }
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
admin.get("/me", guard(false, async (req, res, me) => {
  const un = unlocked.get(me.key), un2 = !!(un && un.uid === me.id && un.until > Date.now()), h = await pwHashOf(me.id);
  const sus = me.role === "mod" ? (await pool.query(`SELECT mod_suspended_until FROM users WHERE id = $1 AND mod_suspended_until > now()`, [me.id])).rows[0] : null;
  res.json({ role: me.role, owner: isOwner(me.username), notes: await unreadNoteCount(me.id), suspendedUntil: sus ? sus.mod_suspended_until : null, needPassword: !h.admin_pw_hash && !isOwner(me.username), unlocked: un2, persona: un2 && me.persona ? { name: me.persona.name, pic: me.persona.pic } : null });
}));
// (owner) new staff make their own panel password (not their login's); it unlocks the panel from then on
admin.post("/password", guard(false, async (req, res, me) => {
  const h = await pwHashOf(me.id), un = unlocked.get(me.key), un2 = !!(un && un.uid === me.id && un.until > Date.now());
  if (h.admin_pw_hash && !un2) return fail(res, 403, "Locked.");                       // changing it needs the panel open
  const pw = (req.body || {}).password, p = pwProblem(pw); if (p) return fail(res, 400, p);
  if (h.password && h.password !== "!" && await verifySecret(pw, h.password).catch(() => false)) return fail(res, 400, "Use a different password from your login.");
  await pool.query(`UPDATE users SET admin_pw_hash = $2 WHERE id = $1`, [me.id, await hashSecret(pw)]);
  unlocked.set(me.key, { uid: me.id, until: Date.now() + UNLOCK_MS }); res.json({ ok: true });
}, false));
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
  // (owner) a staff member's own password; Nyssary's is the shared one (until they make their own)
  const h = await pwHashOf(me.id), hash = h.admin_pw_hash || (isOwner(me.username) ? ADMIN_PASSWORD_HASH : null);
  if (!hash) return fail(res, 403, "Make your admin password first.");
  if (typeof pw !== "string" || pw.length > 200 || !(await verifySecret(pw, hash))) return fail(res, 403, "Wrong password.");
  unlocked.set(me.key, { uid: me.id, until: Date.now() + UNLOCK_MS }); res.json({ ok: true });
}));
admin.post("/lock", guard(false, async (req, res, me) => { unlocked.delete(me.key); res.json({ ok: true }); }));

// ---- players ----
admin.get("/players", guard(true, async (req, res) => {
  const { rows } = await pool.query(`SELECT id, username, role, credits, corp, created_at, ban_perm, ban_until, ban_reason, ban_at, frozen, frozen_at, frozen_reason, mute_perm, mute_until, mute_reason, mute_at, lang_heat, lang_heat_at, mod_suspended_until FROM users ORDER BY lower(username)`);
  const on = hooks.online();
  res.json(rows.map((u) => ({ id: String(u.id), name: u.username, role: u.role || null, ...(u.role && personaOf(u.id) ? { adminName: personaOf(u.id).name } : {}), createdAt: u.created_at, online: on.has(String(u.id)), ban: banOf(u), mute: muteOf(u), frozen: frozenOf(u), heat: heatOf(u), ...(u.role === "mod" && u.mod_suspended_until && new Date(u.mod_suspended_until) > new Date() ? { suspendedUntil: u.mod_suspended_until } : {}) })));
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
    name = p.name; kind = "pilot"; const d = p.data || {}; d.renameRequired = true; d.renameReason = reason; d.bannedName = name;
    await pool.query(`UPDATE pilots SET data = $2 WHERE id = $1`, [p.id, d]);
  }
  await pool.query(`INSERT INTO banned_names (name_lower, name, kind, admin_name, reason, admin_id, owner_id, pilot_id, name_key) VALUES (lower($1), $1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (name_lower) DO NOTHING`, [name, kind, me.name, reason, me.id, t.id, kind === "pilot" ? String(b.pilotId) : null, nameKey(name)]);
  hooks.renameRequired(String(t.id));
  await log(me, t, "ban name", reason, { name, kind, ...(kind === "pilot" ? { pilotId: String(b.pilotId) } : {}) }); res.json({ ok: true });
}));
admin.get("/names", guard(true, async (req, res) => {
  const { rows } = await pool.query(`SELECT name, kind, admin_name, admin_id, reason, at FROM banned_names ORDER BY at DESC LIMIT 500`);
  res.json(rows.map((r) => ({ name: r.name, kind: r.kind, admin: adminShown(r.admin_id, r.admin_name), reason: r.reason, at: r.at })));
}));
admin.post("/names/remove", guard(true, async (req, res, me) => {
  const b = req.body || {}; if (typeof b.name !== "string" || b.name.length > 40) return fail(res, 400, "Bad request.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write why.");
  const { rows } = await pool.query(`DELETE FROM banned_names WHERE name_lower = lower($1) RETURNING name, kind, owner_id, pilot_id`, [b.name]); const nb = rows[0];
  if (!nb) return fail(res, 404, "That name isn't banned.");
  // (owner) Allow: whoever had the name is offered it back (revert or keep their new one); not renamed yet, they just keep it
  let owner = nb.owner_id, pilotId = nb.pilot_id;
  if (!owner) { const l = (await pool.query(`SELECT target_id, detail FROM admin_log WHERE action = 'ban name' AND lower(detail ->> 'name') = lower($1) ORDER BY id DESC LIMIT 1`, [nb.name])).rows[0]; if (l) { owner = l.target_id; pilotId = (l.detail && l.detail.pilotId) || null; } }
  if (owner) { await offerName(String(owner), nb.kind, pilotId == null ? null : String(pilotId), nb.name); await hooks.renameRequired(String(owner)); }
  await log(me, { id: owner || null, username: nb.name }, "unban name", reason); res.json({ ok: true });
}));
// (owner) the filter's words: any admin asks for a word in a category; the Head Admin approves it (maybe in another
// category) or denies it. Approved words are read like the rest (leet, padding) in names and chat at once.
admin.get("/words", guard(true, async (req, res) => {
  const { rows } = await pool.query(`SELECT id, word, cat, asked_cat, status, requested_by, requested_at, decided_by, decided_at FROM filter_words ORDER BY (status = 'pending') DESC, id DESC LIMIT 500`);
  res.json(rows.map((r) => ({ id: String(r.id), word: r.word, cat: r.cat, askedCat: r.asked_cat, status: r.status, by: adminShown(r.requested_by, "?"), at: r.requested_at, decidedBy: r.decided_by ? adminShown(r.decided_by, "?") : null, decidedAt: r.decided_at })));
}));
admin.post("/words/request", guard(true, async (req, res, me) => {
  const b = req.body || {}, raw = typeof b.word === "string" ? b.word.trim() : "";
  if (!raw || raw.length > 30 || /\s/.test(raw)) return fail(res, 400, "One word, up to 30 characters.");
  const word = filterForm(raw); if (word.length < 2) return fail(res, 400, "One word, up to 30 characters.");
  if (!CATEGORY_KEYS.includes(b.cat)) return fail(res, 400, "Pick a category.");
  const { rows } = await pool.query(`SELECT 1 FROM filter_words WHERE word = $1 AND status <> 'denied'`, [word]); if (rows[0]) return fail(res, 400, "That word is already on the list.");
  await pool.query(`INSERT INTO filter_words (word, cat, asked_cat, requested_by) VALUES ($1, $2, $2, $3)`, [word, b.cat, me.id]);
  await log(me, { id: null, username: word }, "word requested", "", { cat: b.cat }); res.json({ ok: true, word });
}));
admin.post("/words/decide", guard(true, async (req, res, me) => {
  if (!high(me)) return fail(res, 403, "Only an Admin can do that.");
  const b = req.body || {}; if (!isId(b.id)) return fail(res, 400, "Bad request.");
  const { rows } = await pool.query(`SELECT * FROM filter_words WHERE id = $1`, [String(b.id)]); const w = rows[0];
  if (!w || w.status !== "pending") return fail(res, 404, "That request isn't pending.");
  const cat = b.cat == null ? w.cat : b.cat; if (!CATEGORY_KEYS.includes(cat)) return fail(res, 400, "Pick a category.");
  const ok = !!b.approve;
  await pool.query(`UPDATE filter_words SET status = $2, cat = $3, decided_by = $4, decided_at = now() WHERE id = $1`, [w.id, ok ? "approved" : "denied", cat, me.id]);
  if (ok) await reloadWords();
  await log(me, { id: null, username: w.word }, ok ? "word approved" : "word denied", "", { cat, asked: w.asked_cat }); res.json({ ok: true });
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

// (owner) an admin sets a mute or block between two players: on both their lists; they can't remove it, only appeal
admin.post("/relation", guard(true, async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (b.kind !== "mute" && b.kind !== "block") return fail(res, 400, "Bad request.");
  let o = null;
  if (isId(b.otherId)) o = await target(b.otherId);
  else if (typeof b.other === "string" && b.other.length <= 40) { const { rows } = await pool.query(`SELECT id FROM users WHERE lower(username) = lower($1)`, [b.other]); if (rows[0]) o = await target(String(rows[0].id)); }
  if (!o) return fail(res, 404, "No such player.");
  if (String(o.id) === String(t.id)) return fail(res, 400, "Two different players.");
  if (!mayAct(me, t) || !mayAct(me, o)) return fail(res, 403, "You can't do that to this player.");
  const on = b.on !== false, reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason.");
  await setRelation(String(t.id), String(o.id), b.kind, on, me.id); hooks.relations();
  await log(me, t, (on ? "" : "lift ") + "admin " + b.kind, reason, { with: o.username, withId: String(o.id) }); res.json({ ok: true });
}));
admin.get("/player/:id/relations", guard(true, async (req, res) => { if (!isId(req.params.id)) return fail(res, 400, "Bad request."); res.json(await relationsOf(req.params.id)); }));
// (owner) appeals of admin-set mutes / blocks: both players and the admins; a player writes once, more when an admin gives one
admin.get("/relappeals", guard(true, async (req, res) => res.json(await relAp.relAppealList())));
admin.get("/relappeal/:id", guard(true, async (req, res) => { if (!isId(req.params.id)) return fail(res, 400, "Bad request."); const v = await relAp.relAppealView(req.params.id); if (!v) return fail(res, 404, "No such appeal."); res.json(v); }));
admin.post("/relappeal/say", guard(true, async (req, res, me) => { const b = req.body || {}; if (!isId(b.id)) return fail(res, 400, "Bad request."); try { await relAp.adminSay(me, String(b.id), b.text); res.json({ ok: true }); } catch (e) { fail(res, 400, e.message); } }));
admin.post("/relappeal/turn", guard(true, async (req, res, me) => { const b = req.body || {}; if (!isId(b.id) || !isId(b.userId)) return fail(res, 400, "Bad request."); try { await relAp.giveTurn(String(b.id), String(b.userId)); res.json({ ok: true }); } catch (e) { fail(res, 400, e.message); } }));
admin.post("/relappeal/close", guard(true, async (req, res, me) => {
  const b = req.body || {}; if (!isId(b.id)) return fail(res, 400, "Bad request.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason.");
  try { const a = await relAp.closeRelAppeal(me, String(b.id), !!b.accept, reason); hooks.relations();
    const t = await target(String(a.a_id)); if (t) await log(me, t, (b.accept ? "accepted " : "denied ") + a.kind + " appeal", reason, { appeal: String(a.id), withId: String(a.b_id) });
    res.json({ ok: true }); } catch (e) { fail(res, 400, e.message); }
}));
// (owner) support tickets: every admin sees them (open first, newest activity first), answers and closes them
admin.get("/tickets", guard(true, async (req, res) => res.json(await tickets.ticketList())));
admin.get("/ticket/:id", guard(true, async (req, res) => { if (!isId(req.params.id)) return fail(res, 400, "Bad request."); const v = await tickets.ticketView(req.params.id); if (!v) return fail(res, 404, "No such ticket."); res.json(v); }));
admin.post("/ticket/say", guard(true, async (req, res, me) => { const b = req.body || {}; if (!isId(b.id)) return fail(res, 400, "Bad request."); try { await tickets.adminSay(me, String(b.id), b.text); res.json({ ok: true }); } catch (e) { fail(res, 400, e.message); } }));
admin.post("/ticket/close", guard(true, async (req, res, me) => { const b = req.body || {}; if (!isId(b.id)) return fail(res, 400, "Bad request."); try { await tickets.closeTicket(me, String(b.id)); res.json({ ok: true }); } catch (e) { fail(res, 400, e.message); } }));

// (owner) an Admin can suspend a Moderator's abilities for 24 hours, with a reason: their panel locks and their admin DMs
// end at once, and the Head Admin is told immediately (online now, else when they next play). An Admin can lift it early.
admin.post("/suspend", guard(true, async (req, res, me) => {
  if (!high(me)) return fail(res, 403, "Only an Admin can do that.");   // (owner) only Admins (and the Head Admin) suspend Moderators
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (t.role !== "mod") return fail(res, 403, "Only Moderators can be suspended.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write a reason.");
  const until = new Date(Date.now() + 24 * 3600_000);
  await pool.query(`UPDATE users SET mod_suspended_until = $2 WHERE id = $1`, [t.id, until]);
  const s = (await pool.query(`INSERT INTO mod_suspensions (mod_id, by_id, reason, until) VALUES ($1, $2, $3, $4) RETURNING id`, [t.id, me.id, reason, until])).rows[0];
  for (const [k, v] of unlocked) if (v.uid === String(t.id)) unlocked.delete(k);
  await hooks.modSuspended(String(t.id));
  await log(me, t, "suspend moderator", reason, { until });
  await hooks.staffNotify(["head"], "suspension", "Moderator " + t.username + (personaOf(t.id) ? " (" + personaOf(t.id).name + ")" : "") + " suspended by " + me.name + ": " + reason, { player: String(t.id) });   // (owner) the Head Admin is told
  res.json({ ok: true, until });
}));
admin.post("/unsuspend", guard(true, async (req, res, me) => {
  if (!high(me)) return fail(res, 403, "Only an Admin can do that.");
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  const reason = cleanReason(b.reason); if (!reason) return fail(res, 400, "Write why.");
  await pool.query(`UPDATE users SET mod_suspended_until = NULL WHERE id = $1`, [t.id]);
  await pool.query(`UPDATE mod_suspensions SET lifted_by = $2, lifted_at = now() WHERE mod_id = $1 AND lifted_at IS NULL AND until > now()`, [t.id, me.id]);
  await log(me, t, "lift moderator suspension", reason); res.json({ ok: true });
}));

// (owner) a staff member's notifications (kept while they were away; read only with the panel unlocked), the Admin chat's
// recent lines, and what's new on each tab since they last opened it
admin.get("/notes", guard(true, async (req, res, me) => res.json(await notesOf(me.id))));
admin.post("/notes/read", guard(true, async (req, res, me) => { await readNotes(me.id); res.json({ ok: true }); }));
admin.get("/staffchat", guard(true, async (req, res) => res.json(await staffChatRecent())));
admin.get("/unread", guard(true, async (req, res, me) => res.json(await unreadCounts(me.id))));
admin.post("/seen", guard(true, async (req, res, me) => { await markSeen(me.id, String((req.body || {}).tab || "")); res.json({ ok: true }); }));

// ---- the Head Admin only ----
const head = (fn) => guard(true, async (req, res, me) => { if (!high(me)) return fail(res, 403, "Only an Admin can do that."); await fn(req, res, me); });   // Admins and the Head Admin
// (owner) roles: a Head Admin makes or removes Moderators; only Nyssary makes or removes Head Admins. A staff member who
// loses their role has their panel locked at once and their own password dropped (a new one if they're made staff again).
admin.post("/role", head(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  const want = b.role === "admin" ? "admin" : b.role === "mod" || b.admin === true ? "mod" : null;   // (no one is made Head Admin)
  if (String(t.id) === me.id || isOwner(t.username) || t.role === "head") return fail(res, 403, "You can't change that player's role.");
  if ((want === "admin" || t.role === "admin") && !isOwner(me.username)) return fail(res, 403, "Only Nyssary can do that.");   // (owner) only Nyssary makes Admins
  if ((t.role || null) === want) return res.json({ ok: true });
  await pool.query(`UPDATE users SET role = $2${want ? "" : ", admin_pw_hash = NULL"} WHERE id = $1`, [t.id, want]);
  if (!want) for (const [k, v] of unlocked) if (v.uid === String(t.id)) unlocked.delete(k);   // a removed staff member's panel locks at once
  setRank(String(t.id), want); if (personaOf(t.id)) hooks.persona(String(t.id), personaOf(t.id));   // (their lines' color follows the role)
  await log(me, t, want ? "make " + ROLE_NAME[want] : "remove " + ROLE_NAME[t.role], cleanReason(b.reason)); res.json({ ok: true });
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
