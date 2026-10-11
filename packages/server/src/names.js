// (owner) Can this name be used for an account or a pilot? Not if the filter (namefilter.js) refuses it, or an admin
// banned it (Ban Name: the banned_names list).
import { pool } from "./db.js";
import { nameProblem } from "./namefilter.js";

export async function checkName(name) {
  const p = nameProblem(name); if (p) return p;
  const { rows } = await pool.query(`SELECT 1 FROM banned_names WHERE name_lower = lower($1)`, [name]);
  if (rows[0]) return "That name isn't allowed.";
  const { rows: a } = await pool.query(`SELECT 1 FROM users WHERE lower(admin_name) = lower($1)`, [name]);   // (owner) an admin's name
  return a[0] ? "That name is taken." : null;
}
