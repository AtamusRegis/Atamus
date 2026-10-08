// Per-player world state (ships, gates, belt field) persisted in Postgres.
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

/** Systems whose owner is offline but still has an active stargate (restored on boot). */
export async function loadActiveGateSystems() {
  const { rows } = await pool.query(
    `SELECT s.user_id, u.username, s.data FROM systems s JOIN users u ON u.id = s.user_id
     WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(s.data->'gates') g WHERE g->>'state' = 'active')`
  );
  return rows;
}
