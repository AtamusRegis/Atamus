// (owner, 2026-10-11) Support tickets: a player opens one (subject, category, message) and it becomes a conversation with
// the admins until an admin closes it. (Later: admins assigned to tickets and subscribed by category.)
import { pool } from "./db.js";
import { adminShown } from "./personas.js";

export const TICKET_CATEGORIES = ["Bug", "Account", "Player Behavior", "Gameplay", "Other"];
const clean = (t, n = 1000) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, n) : "");
let notify = () => {};                                     // (net.js) the player and the admins online are told of a new line
export const onTicket = (fn) => { notify = fn; };

async function row(id) { const { rows } = await pool.query(`SELECT * FROM tickets WHERE id = $1`, [String(id)]); return rows[0] || null; }
export async function ticketView(id) {
  const t = await row(id); if (!t) return null;
  const { rows } = await pool.query(`SELECT id, at, from_admin, admin_id, name, text FROM ticket_messages WHERE ticket_id = $1 ORDER BY id`, [t.id]);
  return { id: String(t.id), userId: t.user_id == null ? null : String(t.user_id), name: t.username, subject: t.subject, category: t.category, status: t.status, at: t.created_at,
    closedBy: t.closed_by ? adminShown(t.closed_by, "?") : null,
    lines: rows.map((m) => ({ id: String(m.id), at: m.at, admin: m.from_admin, name: m.from_admin ? adminShown(m.admin_id, m.name) : m.name, text: m.text })) };
}
async function addLine(t, fromAdmin, adminId, name, text) {
  await pool.query(`INSERT INTO ticket_messages (ticket_id, from_admin, admin_id, name, text) VALUES ($1, $2, $3, $4, $5)`, [t.id, fromAdmin, adminId, name, text]);
  await pool.query(`UPDATE tickets SET updated_at = now() WHERE id = $1`, [t.id]);
  try { notify(String(t.id), t.user_id == null ? null : String(t.user_id), fromAdmin, t.subject); } catch (e) { console.error("ticket notify", e); }
}
export async function openTicket(uid, name, b) {
  const subject = clean(b && b.subject, 80), text = clean(b && b.text);
  if (!subject) throw new Error("Write a subject.");
  if (!TICKET_CATEGORIES.includes(b && b.category)) throw new Error("Pick a category.");
  if (!text) throw new Error("Write your message.");
  const { rows: open } = await pool.query(`SELECT count(*)::int AS n FROM tickets WHERE user_id = $1 AND status = 'open'`, [uid]);
  if (open[0].n >= 5) throw new Error("You have 5 open tickets.");
  const t = (await pool.query(`INSERT INTO tickets (user_id, username, subject, category) VALUES ($1, $2, $3, $4) RETURNING *`, [uid, name, subject, b.category])).rows[0];
  await addLine(t, false, null, name, text);
  return String(t.id);
}
export async function playerSay(uid, name, id, raw) {
  const text = clean(raw); if (!text) throw new Error("Write something.");
  const t = await row(id); if (!t || String(t.user_id) !== String(uid)) throw new Error("No such ticket.");
  if (t.status !== "open") throw new Error("That ticket is closed.");
  await addLine(t, false, null, name, text);
}
export async function playerTickets(uid) {
  const { rows } = await pool.query(`SELECT id FROM tickets WHERE user_id = $1 ORDER BY (status = 'open') DESC, id DESC LIMIT 50`, [uid]);
  const out = []; for (const r of rows) out.push(await ticketView(r.id)); return out;
}
export async function adminSay(admin, id, raw) {
  const text = clean(raw); if (!text) throw new Error("Write something.");
  const t = await row(id); if (!t) throw new Error("No such ticket."); if (t.status !== "open") throw new Error("That ticket is closed.");
  await addLine(t, true, admin.id, admin.name, text);
}
export async function closeTicket(admin, id) {
  const t = await row(id); if (!t || t.status !== "open") throw new Error("That ticket isn't open.");
  await pool.query(`UPDATE tickets SET status = 'closed', closed_by = $2, closed_at = now() WHERE id = $1`, [t.id, admin.id]);
  await addLine(t, true, admin.id, admin.name, "Closed.");
}
export async function ticketList() {
  const { rows } = await pool.query(`SELECT t.id, t.user_id, t.username, t.subject, t.category, t.status, t.created_at, t.updated_at,
      (SELECT count(*) FROM ticket_messages m WHERE m.ticket_id = t.id)::int AS n,
      (SELECT from_admin FROM ticket_messages m WHERE m.ticket_id = t.id ORDER BY id DESC LIMIT 1) AS last_admin
    FROM tickets t ORDER BY (t.status = 'open') DESC, t.updated_at DESC LIMIT 300`);
  return rows.map((t) => ({ id: String(t.id), userId: t.user_id == null ? null : String(t.user_id), name: t.username, subject: t.subject, category: t.category, status: t.status, at: t.created_at, updated: t.updated_at, lines: t.n, waiting: t.status === "open" && t.last_admin === false }));
}
