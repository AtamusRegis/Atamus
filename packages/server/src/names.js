// (owner) Can this name be used for an account or a pilot? Not if the filter (namefilter.js) refuses it, or an admin
// banned it (Ban Name: the banned_names list, compared the way the filter reads names, so leet spellings count too).
import { pool } from "./db.js";
import { nameProblem, nameKey, setExtraWords } from "./namefilter.js";

export async function bannedName(name) {
  const { rows } = await pool.query(`SELECT 1 FROM banned_names WHERE name_key = $1 OR name_lower = lower($2)`, [nameKey(name), name]);
  return !!rows[0];
}
export async function checkName(name) {
  const p = nameProblem(name); if (p) return p;
  if (await bannedName(name)) return "That name isn't allowed.";
  const { rows: a } = await pool.query(`SELECT 1 FROM users WHERE lower(admin_name) = lower($1)`, [name]);   // (owner) an admin's name
  return a[0] ? "That name is taken." : null;
}
/** At start-up: banned names saved before keys existed get theirs; the approved requested words go into the filter. */
export async function loadNameData() {
  const { rows } = await pool.query(`SELECT name_lower, name FROM banned_names WHERE name_key IS NULL`);
  for (const r of rows) await pool.query(`UPDATE banned_names SET name_key = $2 WHERE name_lower = $1`, [r.name_lower, nameKey(r.name)]);
  await reloadWords();
}
export async function reloadWords() {
  const { rows } = await pool.query(`SELECT word, cat FROM filter_words WHERE status = 'approved'`);
  setExtraWords(rows);
}
