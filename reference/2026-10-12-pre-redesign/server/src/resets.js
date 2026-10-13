// (owner, 2026-10-11) Password reset appeals: someone who has forgotten their password and their recovery answers asks the
// Head Admin for a reset, choosing a temporary password. Logging in with that temporary password shows the request's
// conversation (not the game). The Head Admin answers, then approves (the temporary password becomes the account's
// password) or denies. While a request is open, the account's real owner sees it when they log in and can say "This is
// not me", which closes it and tells the Head Admin.
import crypto from "node:crypto";
import { safeText } from "./textsafe.js";
import { pool } from "./db.js";
import { hashSecret, verifySecret } from "./hash.js";
import { adminShown } from "./personas.js";
import { unlockAccount } from "./security.js";

const clean = (t) => safeText(t, 1000);
const TOKEN_MS = 3 * 3600_000, tokens = new Map();         // token -> { id (request), until }
let notify = () => {};                                     // (net.js / admin.js) the Head Admin is told
export const onResetLine = (fn) => { notify = fn; };

export function resetToken(id) {
  const now = Date.now(); for (const [k, v] of tokens) if (v.until < now) tokens.delete(k);
  const t = crypto.randomBytes(24).toString("base64url"); tokens.set(t, { id: String(id), until: now + TOKEN_MS }); return t;
}
export const tokenRequest = (t) => { const v = typeof t === "string" ? tokens.get(t) : null; return v && v.until > Date.now() ? v.id : null; };

async function row(id) { const { rows } = await pool.query(`SELECT * FROM reset_requests WHERE id = $1`, [String(id)]); return rows[0] || null; }
export async function resetView(id) {
  const r = await row(id); if (!r) return null;
  const { rows } = await pool.query(`SELECT id, at, from_admin, admin_id, name, text FROM reset_messages WHERE request_id = $1 ORDER BY id`, [r.id]);
  return { id: String(r.id), userId: String(r.user_id), name: r.username, status: r.status, at: r.created_at, closedBy: r.closed_by ? adminShown(r.closed_by, "?") : null,
    lines: rows.map((m) => ({ id: String(m.id), at: m.at, admin: m.from_admin, name: m.from_admin ? adminShown(m.admin_id, m.name) : m.name, text: m.text })) };
}
async function addLine(r, fromAdmin, adminId, name, text) {
  await pool.query(`INSERT INTO reset_messages (request_id, from_admin, admin_id, name, text) VALUES ($1, $2, $3, $4, $5)`, [r.id, fromAdmin, adminId, name, text]);
  if (!fromAdmin) try { notify(String(r.id), r.username, text); } catch (e) { console.error("reset notify", e); }
}
/** A new request: the account, a temporary password (8+), and why. One open request per account. */
export async function openReset(username, temp, raw) {
  const text = clean(raw); if (!text) throw new Error("Write your request.");
  if (typeof temp !== "string" || temp.length < 8 || temp.length > 200) throw new Error("The temporary password must be at least 8 characters.");
  const { rows } = await pool.query(`SELECT id, username FROM users WHERE lower(username) = lower($1)`, [String(username || "")]); const u = rows[0];
  if (!u) throw new Error("No account with that name.");
  const open = await pool.query(`SELECT id FROM reset_requests WHERE user_id = $1 AND status = 'open'`, [u.id]);
  if (open.rows[0]) throw new Error("A request is already open for this account. Log in with your temporary password to follow it.");
  const r = (await pool.query(`INSERT INTO reset_requests (user_id, username, temp_hash) VALUES ($1, $2, $3) RETURNING *`, [u.id, u.username, await hashSecret(temp)])).rows[0];
  await addLine(r, false, null, u.username, text);
  return String(r.id);
}
/** Logging in with a temporary password: the open request it belongs to, or null. */
export async function requestByTemp(userId, password) {
  const { rows } = await pool.query(`SELECT * FROM reset_requests WHERE user_id = $1 AND status = 'open'`, [userId]);
  for (const r of rows) if (await verifySecret(password, r.temp_hash).catch(() => false)) return r;
  return null;
}
export async function requesterSay(id, raw) {
  const text = clean(raw); if (!text) throw new Error("Write something.");
  const r = await row(id); if (!r || r.status !== "open") throw new Error("This request is closed.");
  await addLine(r, false, null, r.username, text);
}
export async function adminSay(admin, id, raw) {
  const text = clean(raw); if (!text) throw new Error("Write something.");
  const r = await row(id); if (!r || r.status !== "open") throw new Error("This request is closed.");
  await addLine(r, true, admin.id, admin.name, text);
}
/** Approve (the temporary password becomes the account's password) or deny. Returns the request. */
export async function closeReset(admin, id, approve) {
  const r = await row(id); if (!r || r.status !== "open") throw new Error("This request isn't open.");
  if (approve) { await pool.query(`UPDATE users SET password = $2 WHERE id = $1`, [r.user_id, r.temp_hash]); await unlockAccount(r.user_id); await pool.query(`DELETE FROM remember_tokens WHERE user_id = $1`, [r.user_id]); }   // (an approved reset also unlocks a locked account)
  await pool.query(`UPDATE reset_requests SET status = $2, closed_by = $3, closed_at = now() WHERE id = $1`, [r.id, approve ? "approved" : "denied", admin.id]);
  await addLine(r, true, admin.id, admin.name, approve ? "Approved: your temporary password is now this account's password. Log in with it, then change it." : "Denied.");
  return r;
}
/** Open requests on an account (shown to its owner when they log in). */
export async function openFor(userId) {
  const { rows } = await pool.query(`SELECT id, created_at FROM reset_requests WHERE user_id = $1 AND status = 'open' ORDER BY id`, [userId]);
  return rows.map((r) => ({ id: String(r.id), at: r.created_at }));
}
/** The owner says "This is not me": the request closes. */
export async function disown(userId, id) {
  const r = await row(id); if (!r || String(r.user_id) !== String(userId) || r.status !== "open") throw new Error("No such request.");
  await pool.query(`UPDATE reset_requests SET status = 'disowned', closed_at = now() WHERE id = $1`, [r.id]);
  await pool.query(`INSERT INTO reset_messages (request_id, from_admin, name, text) VALUES ($1, false, $2, 'The account owner logged in and said this is not them.')`, [r.id, r.username]);
  return r;
}
export async function resetList() {
  const { rows } = await pool.query(`SELECT r.id, r.username, r.user_id, r.status, r.created_at, (SELECT count(*) FROM reset_messages m WHERE m.request_id = r.id)::int AS n FROM reset_requests r ORDER BY (r.status = 'open') DESC, r.id DESC LIMIT 200`);
  return rows.map((r) => ({ id: String(r.id), name: r.username, userId: String(r.user_id), status: r.status, at: r.created_at, lines: r.n }));
}
