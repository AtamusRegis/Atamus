// (owner, 2026-10-11) Players mute and block each other. Neither changes anything in the world (they still see and can
// fight each other): a mute hides that player's chat lines from you and stops their DMs to you; a block does the same
// and also stops their prompts to you (trade, duel, party and corporation invites, as those come). Players edit their own
// lists; an admin can set a mute or block between two players (on both lists), which they can't remove, only appeal.
import { pool } from "./db.js";

const rel = new Map();                                     // "owner|other" -> { mute: adminId | 0, block: adminId | 0 } (0: the player's own)
const key = (a, b) => String(a) + "|" + String(b);
const has = (a, b, kind) => { const r = rel.get(key(a, b)); return !!(r && kind in r); };

export async function loadRelations() {
  const { rows } = await pool.query(`SELECT owner_id, other_id, kind, admin_id FROM player_relations`);
  rel.clear(); for (const r of rows) { const k = key(r.owner_id, r.other_id), o = rel.get(k) || {}; o[r.kind] = r.admin_id ? String(r.admin_id) : 0; rel.set(k, o); }
}
/** Does `viewer` see `speaker`'s chat lines and DMs? (not if they muted or blocked them) */
export const hears = (viewer, speaker) => !(has(viewer, speaker, "mute") || has(viewer, speaker, "block"));
/** May `from` send `to` a prompt (trade, duel, invites)? (not if `to` blocked them) */
export const mayPrompt = (from, to) => !has(to, from, "block");

/** Add or remove one of the player's own entries; an admin's (`adminId`) entry goes on both players' lists. */
export async function setRelation(owner, other, kind, on, adminId = null) {
  if (kind !== "mute" && kind !== "block") throw new Error("Bad request.");
  if (String(owner) === String(other)) throw new Error("Not yourself.");
  const pairs = adminId ? [[owner, other], [other, owner]] : [[owner, other]];
  if (!adminId) { const r = rel.get(key(owner, other)); if (r && r[kind]) throw new Error("An admin set that one: appeal it."); }
  for (const [a, b] of pairs) {
    const k = key(a, b), o = rel.get(k) || {};
    if (on) {
      await pool.query(`INSERT INTO player_relations (owner_id, other_id, kind, admin_id) VALUES ($1, $2, $3, $4) ON CONFLICT (owner_id, other_id, kind) DO UPDATE SET admin_id = $4, at = now()`, [a, b, kind, adminId]);
      o[kind] = adminId ? String(adminId) : 0; rel.set(k, o);
    } else {
      await pool.query(`DELETE FROM player_relations WHERE owner_id = $1 AND other_id = $2 AND kind = $3`, [a, b, kind]);
      delete o[kind]; if (Object.keys(o).length) rel.set(k, o); else rel.delete(k);
    }
  }
}
/** Is there an admin-set `kind` between the two? */
export const adminSet = (a, b, kind) => { const r = rel.get(key(a, b)); return !!(r && r[kind]); };
/** A player's lists: [{ id, name, kind, admin (set by an admin) }] */
export async function relationsOf(owner) {
  const { rows } = await pool.query(`SELECT r.other_id, u.username, r.kind, r.admin_id, r.at FROM player_relations r JOIN users u ON u.id = r.other_id WHERE r.owner_id = $1 ORDER BY lower(u.username)`, [owner]);
  return rows.map((r) => ({ id: String(r.other_id), name: r.username, kind: r.kind, admin: !!r.admin_id, at: r.at }));
}
