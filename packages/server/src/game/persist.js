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
// ---- (owner) admin DMs (one per player) and the Freeze that goes with one, kept across restarts ----
export async function loadAdminDms() { const { rows } = await pool.query(`SELECT player_id, admin_id, admin_name, player_name, log, frozen FROM admin_dms`); return rows; }
export async function saveAdminDm(pid, d) {
  await pool.query(`INSERT INTO admin_dms (player_id, admin_id, admin_name, player_name, log, frozen) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (player_id) DO UPDATE SET admin_id = $2, admin_name = $3, player_name = $4, log = $5, frozen = $6`, [pid, d.admin, d.adminName, d.name, JSON.stringify(d.log), !!d.frozen]);
}
// (owner) staff DM rooms, kept across restarts
export async function loadAdminRooms() { const { rows } = await pool.query(`SELECT data FROM admin_rooms`); return rows.map((r) => r.data); }
export async function saveAdminRoom(id, r) { const { grace, ...keep } = r; await pool.query(`INSERT INTO admin_rooms (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`, [id, keep]); }
export async function deleteAdminRoom(id) { await pool.query(`DELETE FROM admin_rooms WHERE id = $1`, [id]); }
export async function deleteAdminDm(pid) { await pool.query(`DELETE FROM admin_dms WHERE player_id = $1`, [pid]); }
export async function setFrozenRow(pid, on, adminId) { await pool.query(`UPDATE users SET frozen = $2, frozen_by = $3, frozen_at = CASE WHEN $2 THEN now() END, frozen_reason = NULL WHERE id = $1`, [pid, on, on ? adminId : null]); }
export async function roleOf(id) { const { rows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [id]); return rows[0] ? rows[0].role || null : null; }
export async function userByName(name) { const { rows } = await pool.query(`SELECT id, username FROM users WHERE lower(username) = lower($1)`, [name]); return rows[0] ? { id: String(rows[0].id), name: rows[0].username } : null; }

/** Every account (id, username): each gets a player station (owner). */
export async function loadAccounts() { const { rows } = await pool.query(`SELECT id, username FROM users ORDER BY id`); return rows.map((r) => ({ id: String(r.id), name: r.username })); }
export async function loadPois() { const { rows } = await pool.query(`SELECT data FROM instances`); return rows.map((r) => r.data); }
export async function savePoi(id, data) {
  await pool.query(`INSERT INTO instances (id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [id, data]);
}
export async function deletePoi(id) { await pool.query(`DELETE FROM instances WHERE id = $1`, [id]); }
