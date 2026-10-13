// (owner, 2026-10-11) Appealing a mute or block an admin set between two players: a conversation both players and every
// admin see. Each player may write once; after that only when an admin gives them one more message (one at a time), so
// the appeal can't be used to bother the other player. An admin accepts (the mute / block is lifted on both lists) or
// denies (it closes).
import { pool } from "./db.js";
import { safeText } from "./textsafe.js";
import { adminShown } from "./personas.js";
import { adminSet, setRelation } from "./relations.js";

const clean = (t) => safeText(t, 1000);
let notify = () => {};                                     // (net.js) tell both players and the admins of a change
export const onRelAppeal = (fn) => { notify = fn; };

async function row(id) { const { rows } = await pool.query(`SELECT * FROM rel_appeals WHERE id = $1`, [String(id)]); return rows[0] || null; }
const players = (a) => [String(a.a_id), String(a.b_id)];
export async function relAppealView(id) {
  const a = await row(id); if (!a) return null;
  const { rows: ms } = await pool.query(`SELECT id, at, from_admin, user_id, admin_id, name, text FROM rel_appeal_messages WHERE appeal_id = $1 ORDER BY id`, [a.id]);
  const { rows: ts } = await pool.query(`SELECT user_id, left_n FROM rel_appeal_turns WHERE appeal_id = $1`, [a.id]);
  const { rows: us } = await pool.query(`SELECT id, username FROM users WHERE id = ANY($1)`, [players(a)]);
  const nm = (id2) => (us.find((u) => String(u.id) === String(id2)) || {}).username || "?";
  return { id: String(a.id), kind: a.kind, status: a.status, at: a.created_at, response: a.response || "", admin: a.admin_id ? adminShown(a.admin_id, "?") : null,
    players: players(a).map((p) => ({ id: p, name: nm(p), left: Number((ts.find((t) => String(t.user_id) === p) || {}).left_n || 0) })),
    lines: ms.map((m) => ({ id: String(m.id), at: m.at, admin: m.from_admin, name: m.from_admin ? adminShown(m.admin_id, m.name) : m.name, text: m.text })) };
}
async function addLine(a, fromAdmin, who, name, text) {
  await pool.query(`INSERT INTO rel_appeal_messages (appeal_id, from_admin, user_id, admin_id, name, text) VALUES ($1, $2, $3, $4, $5, $6)`, [a.id, fromAdmin, fromAdmin ? null : who, fromAdmin ? who : null, name, text]);
  try { notify(String(a.id), players(a), !fromAdmin); } catch (e) { console.error("relappeal notify", e); }
}
/** A player opens an appeal against an admin-set mute or block with the other player: their one message. */
export async function openRelAppeal(uid, name, otherId, kind, raw) {
  const text = clean(raw); if (!text) throw new Error("Write your appeal.");
  if (!adminSet(uid, otherId, kind)) throw new Error("No admin " + kind + " to appeal.");
  const [a0, b0] = [String(uid), String(otherId)].sort((x, y) => Number(x) - Number(y));
  const { rows } = await pool.query(`SELECT id FROM rel_appeals WHERE a_id = $1 AND b_id = $2 AND kind = $3 AND status = 'open'`, [a0, b0, kind]);
  if (rows[0]) throw new Error("There's already an open appeal for this.");
  const a = (await pool.query(`INSERT INTO rel_appeals (a_id, b_id, kind, opened_by) VALUES ($1, $2, $3, $4) RETURNING *`, [a0, b0, kind, uid])).rows[0];
  for (const p of players(a)) await pool.query(`INSERT INTO rel_appeal_turns (appeal_id, user_id, left_n) VALUES ($1, $2, $3)`, [a.id, p, p === String(uid) ? 0 : 1]);   // each player writes once
  await addLine(a, false, uid, name, text);
  return String(a.id);
}
/** A player writes, if they have a message left. */
export async function playerSay(uid, name, id, raw) {
  const text = clean(raw); if (!text) throw new Error("Write something.");
  const a = await row(id); if (!a || !players(a).includes(String(uid))) throw new Error("No such appeal.");
  if (a.status !== "open") throw new Error("That appeal is closed.");
  const { rowCount } = await pool.query(`UPDATE rel_appeal_turns SET left_n = left_n - 1 WHERE appeal_id = $1 AND user_id = $2 AND left_n > 0`, [a.id, uid]);
  if (!rowCount) throw new Error("No messages left.");
  await addLine(a, false, uid, name, text);
}
/** A player's appeals (open first), each with its lines. */
export async function playerAppeals(uid) {
  const { rows } = await pool.query(`SELECT id FROM rel_appeals WHERE a_id = $1 OR b_id = $1 ORDER BY (status = 'open') DESC, id DESC LIMIT 50`, [uid]);
  const out = []; for (const r of rows) out.push(await relAppealView(r.id)); return out;
}
export async function adminSay(admin, id, raw) {
  const text = clean(raw); if (!text) throw new Error("Write something.");
  const a = await row(id); if (!a) throw new Error("No such appeal."); if (a.status !== "open") throw new Error("That appeal is closed.");
  await addLine(a, true, admin.id, admin.name, text);
}
/** (owner) An admin gives a player one more message (only when they have none left: one at a time). */
export async function giveTurn(id, uid) {
  const a = await row(id); if (!a || !players(a).includes(String(uid))) throw new Error("No such appeal.");
  if (a.status !== "open") throw new Error("That appeal is closed.");
  await pool.query(`UPDATE rel_appeal_turns SET left_n = 1 WHERE appeal_id = $1 AND user_id = $2 AND left_n = 0`, [a.id, uid]);
  try { notify(String(a.id), players(a), false); } catch {}
}
/** Accept (lift the mute / block on both lists) or deny; a last line says so. */
export async function closeRelAppeal(admin, id, accept, reason) {
  const a = await row(id); if (!a || a.status !== "open") throw new Error("That appeal isn't open.");
  if (accept) await setRelation(a.a_id, a.b_id, a.kind, false, admin.id);
  await pool.query(`UPDATE rel_appeals SET status = $2, admin_id = $3, response = $4, closed_at = now() WHERE id = $1`, [a.id, accept ? "accepted" : "denied", admin.id, reason]);
  await addLine(a, true, admin.id, admin.name, (accept ? "Accepted: " : "Closed: ") + reason);
  return a;
}
export async function relAppealList() {
  const { rows } = await pool.query(`SELECT r.id, r.kind, r.status, r.created_at, ua.username AS a_name, ub.username AS b_name,
      (SELECT count(*) FROM rel_appeal_messages m WHERE m.appeal_id = r.id)::int AS n
    FROM rel_appeals r LEFT JOIN users ua ON ua.id = r.a_id LEFT JOIN users ub ON ub.id = r.b_id ORDER BY (r.status = 'open') DESC, r.id DESC LIMIT 300`);
  return rows.map((r) => ({ id: String(r.id), kind: r.kind, status: r.status, at: r.created_at, players: [r.a_name, r.b_name], lines: r.n }));
}
