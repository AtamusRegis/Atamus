// (owner, 2026-10-11) Each player's language heat: every Local / Corp line the filter flags (namefilter.js) is kept in
// their log (chat_flags) and adds to a meter that cools off over time, so the more such lines in a short time, the
// hotter it runs. When it runs hot, the admins online are told, and the game mutes them (below).
import { pool } from "./db.js";

export const HEAT_MAX = 10;                 // the meter's top
export const HEAT_HOT = 6;                  // at or above: the admins are told
const HALF_LIFE_S = 30 * 60;                // the heat halves every 30 minutes
const ALERT_EVERY_S = 30 * 60;              // a hot player is reported to the admins at most this often
const WEIGHT = { racist: 3, slurs: 3, extremist: 3, hostile: 3, sexual: 2, profanity: 1, groups: 0.5 };

/** (owner) A meter per kind of word, from every line in the player's log: each line adds its kind's weight, cooled by its
 *  age the same way. { kind: { heat, count } } */
export async function kindHeat(userId) {
  const { rows } = await pool.query(`SELECT c AS kind, count(*)::int AS n, coalesce(sum(power(0.5, extract(epoch FROM now() - at) / $2)), 0) AS w FROM chat_flags, unnest(cats) AS c WHERE user_id = $1 GROUP BY c`, [userId, HALF_LIFE_S]);
  const out = {}; for (const r of rows) out[r.kind] = { heat: Math.min(HEAT_MAX, Math.round(Number(r.w) * (WEIGHT[r.kind] || 1) * 10) / 10), count: r.n };
  return out;
}
/** The heat now, from what was saved (heat, when). */
export const heatNow = (heat, at) => (heat && at ? heat * Math.pow(0.5, (Date.now() - new Date(at).getTime()) / 1000 / HALF_LIFE_S) : 0);
// (owner) a player whose language runs hot is muted by the game, longer each time that day (UTC): 1 minute, 5, 10, 30,
// an hour, a day. The heat isn't reset when a mute ends, so the next flagged line while it's still hot mutes them for the
// next step. Staff reset the steps and the heat (and lift an automatic mute).
export const AUTO_MUTE_MIN = [1, 5, 10, 30, 60, 1440];
async function autoMute(userId, heat, cats) {
  if (heat < HEAT_HOT || !cats.some((c) => c !== "groups")) return null;   // (owner) a people named on its own never mutes
  const day = new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(`SELECT mute_perm, mute_until, lang_mute_step, lang_mute_day FROM users WHERE id = $1`, [userId]); const u = rows[0]; if (!u) return null;
  if (u.mute_perm || (u.mute_until && new Date(u.mute_until) > new Date())) return null;   // (already muted)
  const step = u.lang_mute_day === day ? u.lang_mute_step || 0 : 0, mins = AUTO_MUTE_MIN[Math.min(step, AUTO_MUTE_MIN.length - 1)];
  const until = new Date(Date.now() + mins * 60_000), reason = "Automatic: language";
  await pool.query(`UPDATE users SET mute_perm = false, mute_until = $2, mute_reason = $3, mute_at = now(), mute_auto = true, lang_mute_step = $4, lang_mute_day = $5 WHERE id = $1`, [userId, until, reason, step + 1, day]);
  return { until, mins, reason };
}
/** (staff) the steps and the heat back to zero; an automatic mute is lifted. Returns whether a mute was lifted. */
export async function resetLanguage(userId) {
  const { rows } = await pool.query(`UPDATE users SET lang_heat = 0, lang_heat_at = now(), lang_mute_step = 0, lang_alert_at = NULL WHERE id = $1 RETURNING mute_auto`, [userId]);
  if (rows[0] && rows[0].mute_auto) { await pool.query(`UPDATE users SET mute_perm = false, mute_until = NULL, mute_reason = NULL, mute_at = NULL, mute_auto = false WHERE id = $1`, [userId]); return true; }
  return false;
}
/** A flagged line: kept, and the player's heat raised. Returns { heat, alert, muted } (alert: tell the admins now; muted:
 *  an automatic mute { until, mins, reason }). */
export async function flagLine(userId, username, channel, text, cats, words) {
  await pool.query(`INSERT INTO chat_flags (user_id, username, channel, text, cats, words) VALUES ($1, $2, $3, $4, $5, $6)`, [userId, username, channel, text, cats, words]);
  const add = Math.max(...cats.map((c) => WEIGHT[c] || 1));
  const { rows } = await pool.query(`UPDATE users SET lang_heat = coalesce(lang_heat, 0) * power(0.5, extract(epoch FROM now() - coalesce(lang_heat_at, now())) / $3) + $2, lang_heat_at = now() WHERE id = $1 RETURNING lang_heat, lang_alert_at`, [userId, add, HALF_LIFE_S]);
  const r = rows[0]; if (!r) return { heat: 0, alert: false };
  const alert = r.lang_heat >= HEAT_HOT && (!r.lang_alert_at || Date.now() - new Date(r.lang_alert_at).getTime() > ALERT_EVERY_S * 1000);
  if (alert) await pool.query(`UPDATE users SET lang_alert_at = now() WHERE id = $1`, [userId]);
  return { heat: r.lang_heat, alert, muted: await autoMute(userId, r.lang_heat, cats), hostile: cats.includes("hostile") };
}
