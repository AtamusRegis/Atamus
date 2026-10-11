// (owner) Can this name be used for an account or a pilot? Not if the filter (namefilter.js) refuses it, or an admin
// banned it (Ban Name: the banned_names list).
import { pool } from "./db.js";
import { nameProblem } from "./namefilter.js";

export async function checkName(name) {
  const p = nameProblem(name); if (p) return p;
  const { rows } = await pool.query(`SELECT 1 FROM banned_names WHERE name_lower = lower($1)`, [name]);
  return rows[0] ? "That name isn't allowed." : null;
}
