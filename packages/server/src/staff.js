// (owner, 2026-10-11) Staff notifications, Admin chat and unread counts.
//   Notifications (a player's language running hot, a Moderator suspended, reports, tickets, appeals, @mentions) go to the
//   staff they're for: as a line in the Admin chat if they're online with the panel unlocked, else into their
//   Notifications (a red count on the Admin button; read only with the panel unlocked).
//   Admin chat: staff talk to each other under their admin profiles; "@name" pings that staff member.
//   Unread counts: per staff member, how much is new on each admin tab since they last opened it.
import { pool } from "./db.js";
import { adminShown, personaOf } from "./personas.js";

export const STAFF_ROLES = ["head", "admin", "mod"], HIGH_ROLES = ["head", "admin"];
export async function staffIds(roles = STAFF_ROLES) {
  const { rows } = await pool.query(`SELECT id FROM users WHERE role = ANY($1)`, [roles]); return rows.map((r) => String(r.id));
}
export async function storeNote(adminId, kind, text, ref = null) {
  await pool.query(`INSERT INTO staff_notes (admin_id, kind, text, ref) VALUES ($1, $2, $3, $4)`, [adminId, kind, text, ref]);
}
export async function unreadNoteCount(adminId) { const { rows } = await pool.query(`SELECT count(*)::int AS n FROM staff_notes WHERE admin_id = $1 AND NOT read`, [adminId]); return rows[0].n; }
export async function notesOf(adminId) {
  const { rows } = await pool.query(`SELECT id, at, kind, text, ref, read FROM staff_notes WHERE admin_id = $1 ORDER BY id DESC LIMIT 200`, [adminId]);
  return rows.map((r) => ({ id: String(r.id), at: r.at, kind: r.kind, text: r.text, ref: r.ref, read: r.read }));
}
export async function readNotes(adminId) { await pool.query(`UPDATE staff_notes SET read = true WHERE admin_id = $1 AND NOT read`, [adminId]); }

// ---- (owner) the staff chats, kept so whoever comes online can catch up (shown under each one's current identity):
// 'admin', the Admin chat (Admins and the Head Admin), and 'mod', the Moderator chat (Moderators; Admins read and write it) ----
export const CHAT_ROLES = { admin: HIGH_ROLES, mod: STAFF_ROLES };
export async function saveStaffLine(adminId, text, channel = "admin") { const { rows } = await pool.query(`INSERT INTO staff_chat (admin_id, text, channel) VALUES ($1, $2, $3) RETURNING at`, [adminId, text, channel]); return rows[0].at; }
export async function staffChatRecent(channel = "admin") {
  const { rows } = await pool.query(`SELECT admin_id, at, text FROM (SELECT * FROM staff_chat WHERE channel = $1 ORDER BY id DESC LIMIT 200) x ORDER BY id`, [channel]);
  return rows.map((r) => { const pe = personaOf(r.admin_id) || {}; return { from: adminShown(r.admin_id, "?"), admin: pe.key || "", pic: pe.pic || 1, rank: pe.rank || "admin", ...(pe.portrait ? { portrait: pe.portrait } : {}), text: r.text, ts: new Date(r.at).getTime() }; });
}
/** The staff a line mentions ("@name": an Admin's admin name or a Moderator's username) who may read `channel`, by account id. */
export async function mentioned(text, channel = "admin") {
  const names = [...new Set((String(text).match(/@([A-Za-z0-9_]{3,24})/g) || []).map((m) => m.slice(1).toLowerCase()))]; if (!names.length) return [];
  const { rows } = await pool.query(`SELECT id FROM users WHERE role = ANY($1) AND ((role <> 'mod' AND lower(admin_name) = ANY($2)) OR (role = 'mod' AND lower(username) = ANY($2)))`, [CHAT_ROLES[channel] || HIGH_ROLES, names]); return rows.map((r) => String(r.id));
}
export async function rolesOf(ids) { if (!ids.length) return new Map(); const { rows } = await pool.query(`SELECT id, role FROM users WHERE id = ANY($1)`, [ids]); return new Map(rows.map((r) => [String(r.id), r.role])); }

// ---- unread counts: what's new on each tab since the staff member last opened it ----
const TABS = {
  reports: `SELECT count(*)::int AS n FROM reports WHERE created_at > $1`,
  appeals: `SELECT (SELECT count(*) FROM appeal_messages WHERE NOT from_admin AND at > $1) + (SELECT count(*) FROM rel_appeal_messages WHERE NOT from_admin AND at > $1) AS n`,
  chat: `SELECT count(*)::int AS n FROM chat_flags WHERE at > $1`,
  names: `SELECT count(*)::int AS n FROM banned_names WHERE at > $1`,
  words: `SELECT count(*)::int AS n FROM filter_words WHERE requested_at > $1 OR decided_at > $1`,
  support: `SELECT count(*)::int AS n FROM ticket_messages WHERE NOT from_admin AND at > $1`,
  disc: `SELECT count(*)::int AS n FROM admin_log WHERE at > $1 AND action IN ('ban', 'mute', 'freeze', 'unban', 'unmute', 'unfreeze')`,
  review: `SELECT count(*)::int AS n FROM mod_reviews WHERE at > $1 AND status = 'open'`,
};
export const UNREAD_TABS = Object.keys(TABS);
export async function unreadCounts(adminId) {
  const { rows } = await pool.query(`SELECT tab, at FROM staff_seen WHERE admin_id = $1`, [adminId]);
  const seen = Object.fromEntries(rows.map((r) => [r.tab, r.at])), out = {};
  for (const [tab, sql] of Object.entries(TABS)) {
    if (!seen[tab]) { await markSeen(adminId, tab); out[tab] = 0; continue; }        // a new staff member starts with nothing unread
    out[tab] = Number((await pool.query(sql, [seen[tab]])).rows[0].n);
  }
  return out;
}
export async function markSeen(adminId, tab) {
  if (!TABS[tab]) return;
  await pool.query(`INSERT INTO staff_seen (admin_id, tab, at) VALUES ($1, $2, now()) ON CONFLICT (admin_id, tab) DO UPDATE SET at = now()`, [adminId, tab]);
}
