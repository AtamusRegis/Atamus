// (owner, 2026-10-11) Admin profiles: each admin acts and speaks under an admin name and one of the admin pictures
// (website/assets/admin/1–6.png), so admins can play without people knowing who they are. Everything an admin wrote or
// did is shown under their current profile (resolved by account here, never stored as text alone): changing it changes
// every earlier line and log entry too, so no one can hide behind an old name.
import crypto from "node:crypto";
import { pool } from "./db.js";
import { nameProblem } from "./namefilter.js";
import { bannedName } from "./names.js";

export const ADMIN_PICS = 6;
const NAME_RE = /^[A-Za-z0-9_]{3,24}$/;
const personas = new Map();                                  // account id -> { name, pic, key }

export async function loadPersonas() {
  const { rows } = await pool.query(`SELECT id, admin_name, admin_pic, admin_key FROM users WHERE admin_name IS NOT NULL`);
  personas.clear(); for (const r of rows) personas.set(String(r.id), { name: r.admin_name, pic: r.admin_pic || 1, key: r.admin_key });
}
/** An admin's profile ({ name, pic, key }), or null. */
export const personaOf = (uid) => (uid == null ? null : personas.get(String(uid)) || null);
/** The name an admin's action or line shows: their profile's name now, else what was saved. */
export const adminShown = (uid, saved) => (personaOf(uid) || {}).name || saved;
/** Lines saved with an admin's account (`aid`) show that admin's current profile. */
export const resolveLines = (list) => (Array.isArray(list) ? list.map((l) => {
  if (!l || typeof l !== "object") return l;
  const o = { ...l }; if (o.aid) { o.from = adminShown(o.aid, o.from); o.admin = true; }
  if (o.toAid) o.to = adminShown(o.toAid, o.to);
  delete o.aid; delete o.toAid; return o;
}) : []);

/** Set an admin's profile: a name no one else has (player, pilot or admin) and one of the pictures. */
export async function setPersona(uid, name, pic) {
  if (typeof name !== "string" || !NAME_RE.test(name.trim())) throw new Error("Names are 3–24 characters: letters, numbers and underscores.");
  name = name.trim();
  if (!Number.isInteger(pic) || pic < 1 || pic > ADMIN_PICS) throw new Error("Pick a picture.");
  if (nameProblem(name)) throw new Error("That name isn't allowed.");
  const q = async (sql) => (await pool.query(sql, [name, uid])).rows.length > 0;
  if (await bannedName(name)) throw new Error("That name isn't allowed.");
  if (await q(`SELECT 1 FROM users WHERE (lower(username) = lower($1) OR lower(admin_name) = lower($1)) AND id <> $2`)
    || await q(`SELECT 1 FROM users WHERE lower(username) = lower($1) AND id = $2`)
    || await q(`SELECT 1 FROM pilots WHERE lower(name) = lower($1) AND $2::bigint IS NOT NULL`)) throw new Error("That name is taken.");
  const was = personaOf(uid), key = (was && was.key) || crypto.randomBytes(9).toString("base64url");
  try { await pool.query(`UPDATE users SET admin_name = $2, admin_pic = $3, admin_key = $4 WHERE id = $1`, [uid, name, pic, key]); }
  catch (e) { if (e.code === "23505") throw new Error("That name is taken."); throw e; }
  const now = { name, pic, key }; personas.set(String(uid), now);
  return { was, now };
}
