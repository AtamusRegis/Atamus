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

/** Systems that should be awake on boot: a running gate, a ship still carrying out an order or mining (offline
 *  mining carries on), or a ship in an asteroid instance. */
export async function loadAwakeSystems() {
  const { rows } = await pool.query(
    `SELECT s.user_id, u.username, s.data FROM systems s JOIN users u ON u.id = s.user_id
     WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(s.data->'gates') g WHERE g->>'state' = 'active')
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(s.data->'ships') sh
                   WHERE (sh->>'moving')::boolean OR sh->>'sys' LIKE 'inst:%' OR (sh->'auto'->>'on')::boolean
                      OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(sh->'lasers') = 'array' THEN sh->'lasers' ELSE '[]'::jsonb END) l WHERE (l->>'on')::boolean))`
  );
  return rows;
}

// shared asteroid instances
export async function loadInstances() { const { rows } = await pool.query(`SELECT data FROM instances`); return rows.map((r) => r.data); }
export async function saveInstance(id, data) {
  await pool.query(`INSERT INTO instances (id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [id, data]);
}
export async function deleteInstance(id) { await pool.query(`DELETE FROM instances WHERE id = $1`, [id]); }
