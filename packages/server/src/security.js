// (owner, 2026-10-11) Account security, what's left of it (owner, 2026-10-13: login records, IP geolocation, the VPN lists
// and the travel / suspicion checks were removed):
//   - failed logins back off more and more, per account and device (not per address: many players can share a VPN's);
//   - an account locked in the past stays locked (shown at login) until the owner unlocks it with their recovery questions.
import { pool } from "./db.js";

const DEVICE_RE = /^[A-Za-z0-9_-]{16,64}$/;
/** A browser's device id (made once and kept in its storage), or null. */
export const deviceOf = (v) => (typeof v === "string" && DEVICE_RE.test(v) ? v : null);

// ---- failed logins: after 5 misses, 1 minute, then 2, 4, 8 ... up to an hour; per account name and device (or address
// when a client sends no device)
const fails = new Map();
const FAIL_FREE = 5, HOUR = 3600_000;
const failKey = (name, device, ip) => String(name || "").toLowerCase() + "|" + (device || "ip:" + ip);
/** Minutes to wait before trying again, or 0. */
export async function loginWait(name, device, ip) {
  const now = Date.now(), f = fails.get(failKey(name, device, ip));
  return f && f.until > now ? Math.ceil((f.until - now) / 60_000) : 0;
}
export function loginFailed(name, device, ip) {
  const now = Date.now(), k = failKey(name, device, ip), f = fails.get(k) || { n: 0, until: 0 };
  f.n++; f.at = now; if (f.n >= FAIL_FREE) f.until = now + Math.min(60, 2 ** (f.n - FAIL_FREE)) * 60_000; fails.set(k, f);
}
export const loginSucceeded = (name, device, ip) => fails.delete(failKey(name, device, ip));
setInterval(() => { const now = Date.now(); for (const [k, f] of fails) if (now - f.at > 24 * HOUR && f.until < now) fails.delete(k); }, 10 * 60_000).unref();

// ---- locks ----
export async function unlockAccount(uid) {
  await pool.query(`UPDATE users SET locked_reason = NULL, locked_at = NULL WHERE id = $1 AND locked_reason IS NOT NULL`, [String(uid)]);
}
export const LOCK_TEXT = "This account is locked. Unlock it with your recovery questions (Forgot password).";
