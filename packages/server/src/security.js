// (owner, 2026-10-11) Account security:
//   - every login is recorded (when, the address, the browser's device id and time zone);
//   - failed logins back off more and more, per account and device (not per address: many players can share a VPN's);
//   - flagged to the Admins: more than 4 devices in 30 days;
//   - staff can lock an account; the owner unlocks it with their recovery questions;
//   - a game client sending malformed messages is timed out (its device and account), longer each time.
// (owner, 2026-10-13) IP geolocation and the VPN lists were removed, and with them the impossible-travel lock and the
// VPN-jump / odd-hour flags. Once logged in nothing checks the address again: only logins are looked at.
import { pool } from "./db.js";
import { gameHook } from "./admin.js";
import { destroyAllSessions } from "./sessions.js";
import { flag } from "./suspicion.js";

const DEVICE_RE = /^[A-Za-z0-9_-]{16,64}$/, TZ_RE = /^[A-Za-z0-9_+\-\/]{1,48}$/;
/** A browser's device id (made once and kept in its storage), or null. */
export const deviceOf = (v) => (typeof v === "string" && DEVICE_RE.test(v) ? v : null);
export const tzOf = (v) => (typeof v === "string" && TZ_RE.test(v) ? v : null);

// ---- failed logins: after 5 misses, 1 minute, then 2, 4, 8 ... up to an hour; per account name and device (or address
// when a client sends no device). Many misses on one account from devices it has never logged in on also hold those back.
const fails = new Map(), spray = new Map();
const FAIL_FREE = 5, SPRAY_MAX = 20, HOUR = 3600_000;
const failKey = (name, device, ip) => String(name || "").toLowerCase() + "|" + (device || "ip:" + ip);
async function knownDevice(name, device) {
  if (!device) return false;
  const { rows } = await pool.query(`SELECT 1 FROM logins l JOIN users u ON u.id = l.user_id WHERE lower(u.username) = lower($1) AND l.device = $2 AND l.result = 'ok' LIMIT 1`, [String(name || ""), device]);
  return !!rows[0];
}
/** Minutes to wait before trying again, or 0. */
export async function loginWait(name, device, ip) {
  const now = Date.now(), f = fails.get(failKey(name, device, ip));
  if (f && f.until > now) return Math.ceil((f.until - now) / 60_000);
  const s = spray.get(String(name || "").toLowerCase());
  if (s && s.n > SPRAY_MAX && now - s.at < HOUR && !(await knownDevice(name, device))) return Math.ceil((s.at + HOUR - now) / 60_000);
  return 0;
}
export function loginFailed(name, device, ip) {
  const now = Date.now(), k = failKey(name, device, ip), f = fails.get(k) || { n: 0, until: 0 };
  f.n++; f.at = now; if (f.n >= FAIL_FREE) f.until = now + Math.min(60, 2 ** (f.n - FAIL_FREE)) * 60_000; fails.set(k, f);
  const sk = String(name || "").toLowerCase(), s = spray.get(sk); if (!s || now - s.at > HOUR) spray.set(sk, { n: 1, at: now }); else s.n++;
  if (s && s.n === SPRAY_MAX + 1) pool.query(`SELECT id FROM users WHERE lower(username) = $1`, [sk]).then(({ rows }) => rows[0] && flag(rows[0].id, "spray", "Over " + SPRAY_MAX + " failed logins in an hour.")).catch(() => {});
}
export const loginSucceeded = (name, device, ip) => fails.delete(failKey(name, device, ip));
setInterval(() => { const now = Date.now(); for (const [k, f] of fails) if (now - f.at > 24 * HOUR && f.until < now) fails.delete(k); for (const [k, s] of spray) if (now - s.at > HOUR) spray.delete(k); }, 10 * 60_000).unref();

// ---- locks ----
export async function lockAccount(uid, reason) {
  await pool.query(`UPDATE users SET locked_reason = $2, locked_at = now() WHERE id = $1`, [String(uid), reason]);
  await pool.query(`DELETE FROM remember_tokens WHERE user_id = $1`, [String(uid)]);
  await destroyAllSessions(uid);
  gameHook("kick", String(uid), 4011, { t: "locked" });
}
// (the next login after an unlock isn't checked for travel: the owner has just shown it's them)
export async function unlockAccount(uid) {
  const { rowCount } = await pool.query(`UPDATE users SET locked_reason = NULL, locked_at = NULL WHERE id = $1 AND locked_reason IS NOT NULL`, [String(uid)]);
  if (rowCount) await pool.query(`INSERT INTO logins (user_id, result) VALUES ($1, 'unlocked')`, [String(uid)]);
}
export const LOCK_TEXT = "This account is locked. Unlock it with your recovery questions (Forgot password).";

// ---- a successful password check: record it. Returns { locked } (always false now: nothing locks at login).
const placeOf = (r) => (r.city ? r.city + (r.country ? ", " + r.country : "") : r.country || "");   // (old rows still carry a place)
export async function checkLogin(user, ip, device, tz) {
  const { rows: hist } = await pool.query(`SELECT device FROM logins WHERE user_id = $1 AND result = 'ok' ORDER BY id DESC LIMIT 100`, [user.id]);
  await pool.query(`INSERT INTO logins (user_id, ip, device, tz, vpn, result) VALUES ($1,$2,$3,$4,false,'ok')`, [user.id, ip, device, tz]);
  // more than 4 devices in 30 days (told when a new one appears)
  if (device && !hist.some((h) => h.device === device)) {
    const { rows } = await pool.query(`SELECT count(DISTINCT device)::int AS n FROM logins WHERE user_id = $1 AND result = 'ok' AND device IS NOT NULL AND at > now() - interval '30 days'`, [user.id]);
    if (rows[0].n > 4) await flag(user.id, "devices", rows[0].n + " devices in 30 days.", device);
  }
  return { locked: false };
}
/** A failed password, for the history staff see. */
export async function recordFailed(uid, ip, device, tz) {
  await pool.query(`INSERT INTO logins (user_id, ip, device, tz, vpn, result) VALUES ($1,$2,$3,$4,false,'failed')`, [uid, ip, device, tz]);
}
/** (admin) an account's recent logins, devices and lock. */
export async function securityOf(uid) {
  const { rows } = await pool.query(`SELECT at, device, tz, city, country, vpn, result FROM logins WHERE user_id = $1 ORDER BY id DESC LIMIT 50`, [String(uid)]);
  const { rows: d } = await pool.query(`SELECT count(DISTINCT device)::int AS n FROM logins WHERE user_id = $1 AND result = 'ok' AND device IS NOT NULL AND at > now() - interval '30 days'`, [String(uid)]);
  const { rows: u } = await pool.query(`SELECT locked_reason, locked_at FROM users WHERE id = $1`, [String(uid)]);
  const { rows: t } = await pool.query(`SELECT at, until, reason FROM timeouts WHERE user_id = $1 ORDER BY id DESC LIMIT 20`, [String(uid)]);
  const dev = new Map(); let n = 0; const devName = (x) => { if (!x) return "?"; if (!dev.has(x)) dev.set(x, "Device " + ++n); return dev.get(x); };   // (ids aren't shown, only which is which)
  return { devices30: d[0].n, locked: u[0] && u[0].locked_reason ? { reason: u[0].locked_reason, at: u[0].locked_at } : null,
    logins: rows.map((r) => ({ at: r.at, device: devName(r.device), place: r.city || r.country ? placeOf(r) : "", tz: r.tz || "", vpn: r.vpn, result: r.result })),
    timeouts: t.map((r) => ({ at: r.at, until: r.until, reason: r.reason })) };
}

// ---- the game socket: malformed messages (not JSON, no command, an unknown command, flooding) ----
const STRIKES_MAX = 20, STRIKE_DECAY = STRIKES_MAX / 60_000;   // more than 20 in about a minute
/** A counter per connection: hit(n) adds strikes and says whether the client is over the line. */
export function strikes() {
  let s = 0, at = Date.now();
  return (n = 1) => { const now = Date.now(); s = Math.max(0, s - (now - at) * STRIKE_DECAY) + n; at = now; return s > STRIKES_MAX; };
}
const STEPS = [5, 30, 24 * 60];                       // minutes: the first timeout, the second, then a day (within a week)
/** Time out a device and account; returns until when. */
export async function timeOut(uid, device, reason) {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM timeouts WHERE (user_id = $1 OR ($2::text IS NOT NULL AND device = $2)) AND at > now() - interval '7 days'`, [uid, device]);
  const until = new Date(Date.now() + STEPS[Math.min(STEPS.length - 1, rows[0].n)] * 60_000);
  await pool.query(`INSERT INTO timeouts (user_id, device, until, reason) VALUES ($1, $2, $3, $4)`, [uid, device, until, reason]);
  return until;
}
/** Is this account or device timed out? (until when, or null) */
export async function timedOut(uid, device) {
  const { rows } = await pool.query(`SELECT max(until) AS until FROM timeouts WHERE (user_id = $1 OR ($2::text IS NOT NULL AND device = $2)) AND until > now()`, [uid, device]);
  return rows[0].until || null;
}
