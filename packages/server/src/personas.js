// (owner, 2026-10-11) Staff identities. Admins (and the Head Admin) act and speak under an admin name and one of the
// admin pictures (website/assets/admin/1–6.png), so they can play without people knowing who they are. Moderators have
// no anonymity (owner): they're players with a supervisory role, shown under their own username and character portrait.
// Everything staff wrote or did is shown under their current identity (resolved by account here, never stored as text
// alone): changing it changes every earlier line and log entry too, so no one can hide behind an old name.
import crypto from "node:crypto";
import { pool } from "./db.js";
import { nameProblem } from "./namefilter.js";
import { bannedName } from "./names.js";

export const ADMIN_PICS = 6;
const NAME_RE = /^[A-Za-z0-9_]{3,24}$/;
const personas = new Map();                                  // account id -> { name, pic, key, rank } (Admins' profiles)
const mods = new Map();                                      // account id -> { name (their username), portrait, key, rank: "mod", mod: true }
// (owner) the color an admin's lines show in: Moderators orange, Admins (and the Head Admin) red
const rankOf = (role) => (role === "mod" ? "mod" : "admin");
const modOf = (r) => ({ name: r.username, portrait: r.portrait || null, pic: 0, key: "mod-" + r.id, rank: "mod", mod: true });
/** A staff member's role (or name) changed: their identity and their lines' color follow. */
export async function setRank(uid) {
  const { rows } = await pool.query(`SELECT id, username, portrait, role, admin_name, admin_pic, admin_key FROM users WHERE id = $1`, [uid]); const r = rows[0];
  mods.delete(String(uid)); if (!r) return;
  if (r.role === "mod") mods.set(String(uid), modOf(r));
  const p = personas.get(String(uid)); if (p) p.rank = rankOf(r.role);
}

export async function loadPersonas() {
  const { rows } = await pool.query(`SELECT id, username, portrait, admin_name, admin_pic, admin_key, role FROM users WHERE admin_name IS NOT NULL OR role = 'mod'`);
  personas.clear(); mods.clear();
  for (const r of rows) { if (r.role === "mod") mods.set(String(r.id), modOf(r)); if (r.admin_name) personas.set(String(r.id), { name: r.admin_name, pic: r.admin_pic || 1, key: r.admin_key, rank: rankOf(r.role) }); }
}
/** A staff member's identity ({ name, pic, key, rank, mod?, portrait? }): a Moderator's own name, else an Admin's profile, or null. */
export const personaOf = (uid) => (uid == null ? null : mods.get(String(uid)) || personas.get(String(uid)) || null);
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
  if (mods.has(String(uid))) throw new Error("Moderators use their own name.");
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
  let role = null;
  try { role = (await pool.query(`UPDATE users SET admin_name = $2, admin_pic = $3, admin_key = $4 WHERE id = $1 RETURNING role`, [uid, name, pic, key])).rows[0].role; }
  catch (e) { if (e.code === "23505") throw new Error("That name is taken."); throw e; }
  const now = { name, pic, key, rank: rankOf(role) }; personas.set(String(uid), now);
  return { was, now };
}
