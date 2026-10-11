// (owner, 2026-10-11) Ban appeals: a conversation while the ban lasts. The banned player writes from the login page (their
// password gets them a short-lived token); every admin sees the whole thread and can answer; admins who subscribe are
// told of new lines in the game. Closing an appeal (accepted: unbanned; denied: closed) ends it: the player can't keep
// writing in it and must start a new one. A ban allows APPEALS_PER_BAN appeals. On any appeal an admin can set a
// timeout: the appeal closes and no new one can be made for days / months / years; after a timeout the player gets
// one more appeal (owner).
import crypto from "node:crypto";
import { safeText } from "./textsafe.js";
import { pool } from "./db.js";
import { adminShown } from "./personas.js";

export const APPEALS_PER_BAN = 3;
const TOKEN_MS = 3 * 3600_000;
const tokens = new Map();                                   // token -> { uid, until }
let notify = () => {};                                      // (net.js) tell subscribed admins of a new line
export const onAppealLine = (fn) => { notify = fn; };

export function appealToken(uid) {
  const now = Date.now(); for (const [k, v] of tokens) if (v.until < now) tokens.delete(k);
  const t = crypto.randomBytes(24).toString("base64url"); tokens.set(t, { uid: String(uid), until: now + TOKEN_MS }); return t;
}
export const tokenUser = (t) => { const v = typeof t === "string" ? tokens.get(t) : null; return v && v.until > Date.now() ? v.uid : null; };
export const cleanText = (t) => safeText(t, 1000);
const isBanned = (u) => !!(u.ban_perm || (u.ban_until && new Date(u.ban_until) > new Date()));

/** Where a player's appeals stand: their ban, how many appeals this ban has had (since its start, or since a "no new
 *  appeals" period ended), any block, the current (open, else latest) appeal with its lines, and whether they may start one. */
export async function appealState(uid) {
  const { rows } = await pool.query(`SELECT id, username, ban_perm, ban_until, ban_reason, ban_at, appeal_block_until, appeal_reset_at FROM users WHERE id = $1`, [uid]);
  const u = rows[0]; if (!u) return null;
  // this ban's appeals; after a timeout (appeal_reset_at: when it ends) only those since count, and one is allowed
  const banAt = u.ban_at ? new Date(u.ban_at) : null, reset = u.appeal_reset_at && (!banAt || new Date(u.appeal_reset_at) > banAt) ? new Date(u.appeal_reset_at) : null;
  const { rows: aps } = await pool.query(`SELECT id, status, response, created_at FROM appeals WHERE user_id = $1 AND ($2::timestamptz IS NULL OR created_at >= $2) ORDER BY id DESC`, [uid, banAt]);
  const limit = reset ? 1 : APPEALS_PER_BAN, used = reset ? aps.filter((a) => new Date(a.created_at) >= reset).length : aps.length;
  const blockedUntil = u.appeal_block_until && new Date(u.appeal_block_until) > new Date() ? u.appeal_block_until : null;
  const cur = aps.find((a) => a.status === "open") || aps[0] || null;
  const banned = isBanned(u), open = !!(cur && cur.status === "open");
  return {
    userId: String(u.id), name: u.username, banned, ban: banned ? { perm: !!u.ban_perm, until: u.ban_until, reason: u.ban_reason || "" } : null,
    used, left: Math.max(0, limit - used), blockedUntil,
    canNew: banned && !open && !blockedUntil && used < limit,
    current: cur ? { id: String(cur.id), status: cur.status, response: cur.response || "", messages: await lines(cur.id) } : null,
  };
}
export async function lines(appealId) {
  const { rows } = await pool.query(`SELECT id, at, from_admin, admin_id, name, text FROM appeal_messages WHERE appeal_id = $1 ORDER BY id`, [appealId]);
  return rows.map((m) => ({ id: String(m.id), at: m.at, admin: m.from_admin, name: m.from_admin ? adminShown(m.admin_id, m.name) : m.name, text: m.text }));   // (owner) an admin's lines: their admin profile now
}
export async function subscribers(appealId) { const { rows } = await pool.query(`SELECT admin_id FROM appeal_subs WHERE appeal_id = $1`, [appealId]); return rows.map((r) => String(r.admin_id)); }
export async function subscribe(appealId, adminId, on) {
  if (on) await pool.query(`INSERT INTO appeal_subs (appeal_id, admin_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [appealId, adminId]);
  else await pool.query(`DELETE FROM appeal_subs WHERE appeal_id = $1 AND admin_id = $2`, [appealId, adminId]);
}
async function addLine(appealId, fromAdmin, name, text, exceptAdmin = null) {
  await pool.query(`INSERT INTO appeal_messages (appeal_id, from_admin, name, text, admin_id) VALUES ($1, $2, $3, $4, $5)`, [appealId, fromAdmin, name, text, fromAdmin ? exceptAdmin : null]);
  try { notify(String(appealId), name, text, exceptAdmin); } catch (e) { console.error("appeal notify", e); }
}

/** The player writes: into their open appeal, or (if they may) a new one. */
export async function playerWrite(uid, raw) {
  const text = cleanText(raw); if (!text) throw new Error("Write your appeal.");
  const st = await appealState(uid); if (!st) throw new Error("No such account.");
  if (!st.banned) throw new Error("This account isn't banned.");
  if (st.current && st.current.status === "open") { await addLine(st.current.id, false, st.name, text); return; }
  if (st.blockedUntil) throw new Error("No new appeals until " + new Date(st.blockedUntil).toUTCString() + ".");
  if (!st.canNew) throw new Error("No appeals left for this ban.");
  const { rows } = await pool.query(`SELECT ban_reason FROM users WHERE id = $1`, [uid]);
  const a = (await pool.query(`INSERT INTO appeals (user_id, username, ban_reason, text) VALUES ($1, $2, $3, $4) RETURNING id`, [uid, st.name, rows[0].ban_reason || "", text])).rows[0];
  await addLine(a.id, false, st.name, text);
}
/** An admin answers in an open appeal (and is subscribed to it). */
export async function adminWrite(appealId, admin, raw) {
  const text = cleanText(raw); if (!text) throw new Error("Write something.");
  const { rows } = await pool.query(`SELECT status FROM appeals WHERE id = $1`, [appealId]); if (!rows[0]) throw new Error("No such appeal.");
  if (rows[0].status !== "open") throw new Error("That appeal is closed.");
  await subscribe(appealId, admin.id, true);
  await addLine(appealId, true, admin.name, text, admin.id);
}
/** An appeal closes (accepted or denied): a last line says so; no one writes in it after. */
export async function closeAppeal(appealId, admin, accepted, reason) {
  await pool.query(`UPDATE appeals SET status = $2, admin_name = $3, response = $4, handled_at = now(), admin_id = $5 WHERE id = $1`, [appealId, accepted ? "accepted" : "denied", admin.name, reason, admin.id]);
  await addLine(appealId, true, admin.name, (accepted ? "Accepted: " : "Closed: ") + reason, admin.id);
}
/** (owner) An appeal timeout: the appeal closes (if open) and no new one can be made until `until`; then one more is allowed. */
export async function timeoutAppeal(appealId, uid, admin, until, reason) {
  const { rows } = await pool.query(`SELECT status FROM appeals WHERE id = $1`, [appealId]);
  if (rows[0] && rows[0].status === "open") await closeAppeal(appealId, admin, false, reason);
  await pool.query(`UPDATE users SET appeal_block_until = $2, appeal_reset_at = $2 WHERE id = $1`, [uid, until]);
  await addLine(appealId, true, admin.name, "No new appeals until " + new Date(until).toUTCString() + ".", admin.id);
}
