// (owner, 2026-10-11) Watching for credit farms and illicit trading. Everything one player gives another goes in the
// ledger (recordFlow): trades, jettisoned cans someone else picks up, kills (the victim's loss) and loot taken from a
// player's wreck. (Trading, cans, kills and loot come later: each of those features must call recordFlow when it ships.)
// From it and the login records:
//   - the trade web (webOf): who gives a player most and whom they give most, a step further out, and the accounts that
//     share their devices or addresses (Admin › player Info › Trades);
//   - red flags (suspicion.js): large credits from someone they've never talked to (a DM either way), the same players
//     killed again and again, large player loot, licenses trained far beyond the time actually played (new accounts
//     most), and several new accounts made on one device or address.
import { pool } from "./db.js";
import { flag } from "./suspicion.js";
import { trainMs, STARTING_LICENSES } from "./licenses.js";

export const BIG_CREDITS = 1_000_000, BIG_LOOT = 5_000_000, REPEAT_KILLS = 3;
export const FLOW_KINDS = ["trade", "can", "kill", "loot", "gift"];
const cr = (n) => Math.round(n).toLocaleString("en-US") + " cr";

/** Two players talked (a DM either way). */
export async function recordContact(a, b) {
  if (!a || !b || String(a) === String(b)) return;
  const [x, y] = [String(a), String(b)].sort();
  await pool.query(`INSERT INTO contacts (a_id, b_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [x, y]);
}
const talked = async (a, b) => { const [x, y] = [String(a), String(b)].sort(); return !!(await pool.query(`SELECT 1 FROM contacts WHERE a_id = $1 AND b_id = $2`, [x, y])).rows[0]; };

/** Something passed from one player to another. kind: trade | can | kill | loot | gift; credits; value (the items' worth); items { key: qty }. */
export async function recordFlow({ from, to, kind, credits = 0, value = 0, items = null }) {
  if (!from || !to || String(from) === String(to) || !FLOW_KINDS.includes(kind)) return;
  credits = Math.max(0, Math.round(+credits || 0)); value = Math.max(0, Math.round(+value || 0));
  const row = (await pool.query(`INSERT INTO ledger (from_id, to_id, kind, credits, value, items) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [String(from), String(to), kind, credits, value, items])).rows[0], key = "flow:" + row.id;   // (each flow counts once)
  const worth = credits + value;
  if ((kind === "trade" || kind === "gift" || kind === "can") && worth >= BIG_CREDITS && !(await talked(from, to)))
    await flag(to, "stranger", cr(worth) + " from someone they never talked to.", key, Math.min(10, 3 * worth / BIG_CREDITS));
  if (kind === "kill") {                                   // (from: the victim, to: the killer)
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ledger WHERE kind = 'kill' AND from_id = $1 AND to_id = $2 AND at > now() - interval '7 days'`, [String(from), String(to)]);
    if (rows[0].n >= REPEAT_KILLS) { await flag(to, "kills", "Killed the same player " + rows[0].n + " times in a week.", key); await flag(from, "kills", "Killed by the same player " + rows[0].n + " times in a week.", key); }
  }
  if (kind === "loot") {
    const { rows } = await pool.query(`SELECT coalesce(sum(credits + value), 0)::bigint AS v, count(DISTINCT from_id)::int AS who FROM ledger WHERE kind = 'loot' AND to_id = $1 AND at > now() - interval '1 day'`, [String(to)]);
    const v = Number(rows[0].v); if (v >= BIG_LOOT) await flag(to, "loot", cr(v) + " of player loot in a day" + (rows[0].who <= 2 ? ", from " + rows[0].who + (rows[0].who === 1 ? " player" : " players") : "") + ".", key, rows[0].who <= 2 ? 5 : 3);
  }
}

/** (signup) several new accounts on one device, or (not through a known VPN) one address, are red flags on all of them. */
export async function checkNewAccount(uid, device, ip, vpn) {
  await pool.query(`UPDATE users SET signup_device = $2, signup_ip = $3, signup_vpn = $4 WHERE id = $1`, [String(uid), device, ip, !!vpn]);
  if (device) {
    const { rows } = await pool.query(`SELECT id, username FROM users WHERE signup_device = $1 AND id <> $2 AND created_at > now() - interval '30 days'`, [device, String(uid)]);
    if (rows.length >= 1) for (const id of [String(uid), ...rows.map((r) => String(r.id))]) await flag(id, "multiacct", (rows.length + 1) + " new accounts on one device in 30 days.", "device:" + device, rows.length >= 2 ? 4 : 2);
  }
  if (ip && !vpn) {
    const { rows } = await pool.query(`SELECT id FROM users WHERE signup_ip = $1 AND NOT signup_vpn AND id <> $2 AND created_at > now() - interval '1 day'`, [ip, String(uid)]);
    if (rows.length >= 3) for (const id of [String(uid), ...rows.map((r) => String(r.id))]) await flag(id, "multiacct", (rows.length + 1) + " new accounts from one address in a day.", "ip:" + ip, 2);
  }
}

// ---- training far beyond the time played (checked hourly): a farm trains accounts it hardly plays ----
const H = 3600_000;
function trainedMs(d) {
  let t = 0;
  for (const [k, lv] of Object.entries((d && d.licenses) || {})) for (let l = (STARTING_LICENSES[k] || 0) + 1; l <= lv; l++) t += trainMs(k, l) || 0;
  for (const q of (d && d.queue) || []) t += trainMs(q.key, q.level) || 0;
  return t;
}
export async function trainingSweep() {
  const { rows } = await pool.query(`SELECT u.id, u.play_seconds, u.created_at, array_agg(p.data) AS pilots FROM users u JOIN pilots p ON p.user_id = u.id WHERE u.role IS NULL GROUP BY u.id`);
  for (const u of rows) {
    const trained = u.pilots.reduce((t, d) => t + trainedMs(d), 0), played = Number(u.play_seconds) * 1000;
    const isNew = Date.now() - new Date(u.created_at).getTime() < 14 * 86400_000;
    if (trained >= 48 * H && trained > 20 * Math.max(played, H)) await flag(String(u.id), "training", Math.round(trained / H) + " h of training (done and queued) with " + Math.round(played / H * 10) / 10 + " h played" + (isNew ? ", on a new account" : "") + ".", "day:" + new Date().toISOString().slice(0, 10), isNew ? 4 : 2);
  }
}
export function startWatch() {
  setInterval(() => trainingSweep().catch((e) => console.error("training sweep", e)), H).unref();
}
/** Time played, added when a session ends (and every few minutes while it lasts). */
export async function addPlay(uid, seconds) { if (seconds > 0) await pool.query(`UPDATE users SET play_seconds = play_seconds + $2 WHERE id = $1`, [String(uid), Math.round(seconds)]); }

/** (admin) The trade web around a player: the counterparties (in and out, by kind), a step further out, and associations. */
export async function webOf(uid) {
  uid = String(uid);
  const flows = async (id, limit) => (await pool.query(`
    SELECT other, u.username AS name, sum(cin)::bigint AS cin, sum(cout)::bigint AS cout, sum(nin)::int AS nin, sum(nout)::int AS nout,
      sum(kills)::int AS kills, sum(deaths)::int AS deaths, sum(cans)::int AS cans, sum(loot)::bigint AS loot
    FROM (
      SELECT from_id AS other, credits + value AS cin, 0 AS cout, 1 AS nin, 0 AS nout, 0 AS kills, (kind = 'kill')::int AS deaths, (kind = 'can')::int AS cans, CASE WHEN kind = 'loot' THEN credits + value ELSE 0 END AS loot FROM ledger WHERE to_id = $1 AND kind <> 'kill'
      UNION ALL SELECT from_id, 0, 0, 0, 0, 1, 0, 0, 0 FROM ledger WHERE to_id = $1 AND kind = 'kill'
      UNION ALL SELECT to_id, 0, credits + value, 0, 1, 0, 0, (kind = 'can')::int, 0 FROM ledger WHERE from_id = $1 AND kind <> 'kill'
      UNION ALL SELECT to_id, 0, 0, 0, 0, 0, 1, 0, 0 FROM ledger WHERE from_id = $1 AND kind = 'kill'
    ) f JOIN users u ON u.id = f.other GROUP BY other, u.username ORDER BY sum(cin + cout) DESC, sum(nin + nout + kills + deaths) DESC LIMIT $2`, [id, limit])).rows
    .map((r) => ({ id: String(r.other), name: r.name, in: Number(r.cin), out: Number(r.cout), nIn: r.nin, nOut: r.nout, kills: r.kills, deaths: r.deaths, cans: r.cans, loot: Number(r.loot) }));
  const { rows: me } = await pool.query(`SELECT username FROM users WHERE id = $1`, [uid]);
  const near = await flows(uid, 12), far = [];
  for (const n of near.slice(0, 6)) for (const f of await flows(n.id, 4)) if (f.id !== uid && !near.some((x) => x.id === f.id)) far.push({ ...f, via: n.id });
  // accounts that logged in on the same devices or addresses (ok logins)
  const { rows: assoc } = await pool.query(`
    SELECT o.user_id AS id, u.username AS name, count(DISTINCT o.device) FILTER (WHERE o.device IS NOT NULL AND o.device IN (SELECT device FROM logins WHERE user_id = $1 AND result = 'ok' AND device IS NOT NULL))::int AS devices,
      count(DISTINCT o.ip) FILTER (WHERE NOT o.vpn AND o.ip IN (SELECT ip FROM logins WHERE user_id = $1 AND result = 'ok' AND NOT vpn AND ip IS NOT NULL))::int AS ips
    FROM logins o JOIN users u ON u.id = o.user_id WHERE o.user_id <> $1 AND o.result = 'ok'
      AND (o.device IN (SELECT device FROM logins WHERE user_id = $1 AND result = 'ok' AND device IS NOT NULL) OR (NOT o.vpn AND o.ip IN (SELECT ip FROM logins WHERE user_id = $1 AND result = 'ok' AND NOT vpn AND ip IS NOT NULL)))
    GROUP BY o.user_id, u.username ORDER BY 3 DESC, 4 DESC LIMIT 12`, [uid]);
  return { id: uid, name: me[0] ? me[0].username : "?", near, far: far.slice(0, 16), assoc: assoc.map((a) => ({ id: String(a.id), name: a.name, devices: a.devices, ips: a.ips })) };
}
