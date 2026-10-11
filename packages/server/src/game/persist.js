// Per-player world state (their ship) persisted in Postgres.
import { pool } from "../db.js";

export async function loadSystem(userId) {
  const { rows } = await pool.query(`SELECT data FROM systems WHERE user_id = $1`, [userId]);
  return rows[0] ? rows[0].data : null;
}
export async function saveSystem(userId, data) {
  await pool.query(
    `INSERT INTO systems (user_id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [userId, data]
  );
}

// Belt POIs (shared by everyone), kept in the instances table so a restart doesn't reshuffle them.
/** (owner) A Local / Corp line the filter flagged, for the admins' Chat log. */
export async function saveChatFlag(userId, username, channel, text, cats, words) {
  await pool.query(`INSERT INTO chat_flags (user_id, username, channel, text, cats, words) VALUES ($1, $2, $3, $4, $5, $6)`, [userId, username, channel, text, cats, words]);
}
/** Every account (id, username): each gets a player station (owner). */
export async function loadAccounts() { const { rows } = await pool.query(`SELECT id, username FROM users ORDER BY id`); return rows.map((r) => ({ id: String(r.id), name: r.username })); }
export async function loadPois() { const { rows } = await pool.query(`SELECT data FROM instances`); return rows.map((r) => r.data); }
export async function savePoi(id, data) {
  await pool.query(`INSERT INTO instances (id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [id, data]);
}
export async function deletePoi(id) { await pool.query(`DELETE FROM instances WHERE id = $1`, [id]); }
