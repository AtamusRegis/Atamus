// PTR: a private test copy of Atamus that only runs in Claude's workspace (scripts/ptr.sh, scripts/ptr-run.mjs).
// Enabled solely by ATAMUS_PTR=1, which the live server never sets. With it on there are
// no accounts or passwords: every request is the single "PTR" tester (or ?as=Name for a second account).
import { pool } from "./db.js";

export const PTR = process.env.ATAMUS_PTR === "1";

let tester = null;
export async function ptrUser() {
  if (!tester) {
    let { rows } = await pool.query(`SELECT id, username, email FROM users WHERE lower(username) = 'ptr'`);
    if (!rows[0]) ({ rows } = await pool.query(`INSERT INTO users (username, password) VALUES ('PTR', '!') RETURNING id, username, email`));
    await pool.query(`UPDATE users SET role = 'head' WHERE id = $1`, [rows[0].id]);   // (the PTR tester starts as the Head Admin, to test the admin panel)
    tester = { ...rows[0], has_recovery: true };
  }
  const { rows } = await pool.query(`SELECT role, frozen, mute_perm, mute_until, mute_reason FROM users WHERE id = $1`, [tester.id]);   // (tests switch it to admin and back)
  return { ...tester, ...(rows[0] || {}), frozen: !!(rows[0] && rows[0].frozen) };
}

/** PTR only: a second test account for the socket (`/ws?as=Name`), to test things between players (admin DMs, Freeze). */
export async function ptrAs(name) {
  if (!PTR || typeof name !== "string" || !/^[A-Za-z0-9_]{3,24}$/.test(name) || name.toLowerCase() === "ptr") return null;
  let { rows } = await pool.query(`SELECT id, username, email, role, frozen, mute_perm, mute_until, mute_reason FROM users WHERE lower(username) = lower($1)`, [name]);
  if (!rows[0]) ({ rows } = await pool.query(`INSERT INTO users (username, password) VALUES ($1, '!') RETURNING id, username, email, role, frozen, mute_perm, mute_until, mute_reason`, [name]));
  return { ...rows[0], has_recovery: true };
}
