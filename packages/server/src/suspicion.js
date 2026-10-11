// (owner, 2026-10-11) Suspicion: the red flags (security.js: VPN jumps, many devices, odd hours, malformed messages;
// watch.js: credits from strangers, repeated kills and loot, training without play, many new accounts from one device
// or address) don't each tell the staff. Each adds points to the account's suspicion score, which fades over time (half
// every week). Every 10 points the Admins and the Head Admin are told (with the latest reasons); at 30 the account's
// logins are put on hold for a day (it's kicked) while staff look. Staff see the score and its reasons, clear them and
// lift a hold (Info › Security).
import { pool } from "./db.js";
import { gameHook } from "./admin.js";
import { destroyAllSessions } from "./sessions.js";

export const POINTS = { vpnjump: 3, tzjump: 3, devices: 2, oddhour: 2, timeout: 4, spray: 2, stranger: 3, kills: 2, loot: 3, training: 4, multiacct: 3 };
export const KIND_NAME = { vpnjump: "VPN jump", tzjump: "Jump, same time zone", devices: "Many devices", oddhour: "New place, odd hour", timeout: "Malformed messages", spray: "Password guessing", stranger: "Credits from a stranger", kills: "Same players killed", loot: "Large player loot", training: "Training without play", multiacct: "Several new accounts", travel: "Impossible travel" };
const HALF_LIFE = 7 * 86400_000, STEP = 10, HOLD_AT = 30, HOLD_MS = 24 * 3600_000, WINDOW_DAYS = 60;
const recent = new Map();                                   // uid|kind|key -> when: the same flag at most once an hour
setInterval(() => { const now = Date.now(); for (const [k, t] of recent) if (now - t > 3600_000) recent.delete(k); }, 600_000).unref();

/** The account's score now (each flag's points halving every week). */
export async function scoreOf(uid) {
  const { rows } = await pool.query(`SELECT points, at FROM suspicion WHERE user_id = $1 AND at > now() - make_interval(days => $2)`, [String(uid), WINDOW_DAYS]);
  const now = Date.now(); let s = 0; for (const r of rows) s += r.points * 0.5 ** ((now - new Date(r.at).getTime()) / HALF_LIFE);
  return Math.round(s * 10) / 10;
}
export const HOLD_TEXT = (until) => "This account's logins are on hold while staff look into unusual activity, until " + new Date(until).toUTCString() + ".";

/** A red flag on an account. `key` keeps the same flag from counting twice within an hour. */
export async function flag(uid, kind, text, key = "", points = POINTS[kind] ?? 2) {
  if (!uid) return;
  const k = uid + "|" + kind + "|" + key; if (recent.has(k)) return; recent.set(k, Date.now());
  await pool.query(`INSERT INTO suspicion (user_id, kind, points, text) VALUES ($1, $2, $3, $4)`, [String(uid), kind, points, text]);
  const score = await scoreOf(uid), lvl = Math.floor(score / STEP);
  const { rows } = await pool.query(`SELECT username, susp_level, role, login_hold_until FROM users WHERE id = $1`, [String(uid)]); const u = rows[0]; if (!u) return;
  const was = u.susp_level || 0;
  await pool.query(`UPDATE users SET susp_level = $2 WHERE id = $1`, [String(uid), lvl > was ? lvl : Math.min(was, lvl)]);
  if (lvl > was && lvl >= 1) {
    const { rows: last } = await pool.query(`SELECT kind, text FROM suspicion WHERE user_id = $1 ORDER BY id DESC LIMIT 3`, [String(uid)]);
    gameHook("staffNotify", ["head", "admin"], "suspicion", "Suspicious activity: " + u.username + " (score " + score + "). " + last.map((r) => (KIND_NAME[r.kind] || r.kind) + ": " + r.text).join(" · "), { player: String(uid), tab: "sec" });
  }
  if (score >= HOLD_AT && !u.role && !(u.login_hold_until && new Date(u.login_hold_until) > new Date())) {   // (staff aren't held)
    const until = new Date(Date.now() + HOLD_MS);
    await pool.query(`UPDATE users SET login_hold_until = $2 WHERE id = $1`, [String(uid), until]);
    await destroyAllSessions(uid); gameHook("kick", String(uid), 4012, { t: "hold" });
    gameHook("staffNotify", ["head", "admin"], "suspicion", "Logins on hold for a day: " + u.username + " (score " + score + ").", { player: String(uid), tab: "sec" });
  }
}
/** (admin) the score, any hold, and the reasons, newest first. */
export async function suspicionOf(uid) {
  const { rows } = await pool.query(`SELECT at, kind, points, text FROM suspicion WHERE user_id = $1 ORDER BY id DESC LIMIT 50`, [String(uid)]);
  const { rows: u } = await pool.query(`SELECT login_hold_until FROM users WHERE id = $1`, [String(uid)]);
  const hold = u[0] && u[0].login_hold_until && new Date(u[0].login_hold_until) > new Date() ? u[0].login_hold_until : null;
  return { score: await scoreOf(uid), hold, reasons: rows.map((r) => ({ at: r.at, kind: KIND_NAME[r.kind] || r.kind, points: r.points, text: r.text })) };
}
/** (admin) Clear: the reasons go and the hold lifts. */
export async function clearSuspicion(uid) {
  await pool.query(`DELETE FROM suspicion WHERE user_id = $1`, [String(uid)]);
  await pool.query(`UPDATE users SET susp_level = 0, login_hold_until = NULL WHERE id = $1`, [String(uid)]);
}
