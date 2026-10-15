// The admin panel's server side (owner, 2026-10-13: a small panel for the 3D game). Staff are accounts with a role
// ('head' = Nyssary, 'admin', 'mod'); being logged in as one is enough (owner: no second admin password). The panel
// lists online players (plus anyone banned or muted) with the disciplinary panel (kick, mute, ban, kill, respawn,
// teleports) and unban / unmute, player reports, and the ban appeals.
// Every action goes in the admin log; staff can't act on themselves or on other staff. Admins appear
// to players as "Admin" (appeal lines), never by username.
// (owner, 2026-10-14) Nyssary (head) makes and removes moderators from the disciplinary panel. A moderator can kick, mute
// and ban (and sees Players and Reports); a mute or ban of up to 3 days applies at once, longer ones (7 days, indefinite)
// are requests Nyssary approves or denies in an Approvals section only she has.
import express from "express";
import { safeText } from "./textsafe.js";
import { pool } from "./db.js";
import { getSessionUser, readCookie, destroyAllSessions } from "./sessions.js";
import { PTR, ptrAs } from "./ptr.js";
import { appealState, lines, adminWrite, closeAppeal } from "./appeals.js";

const REASON_MAX = 500, STAFF = ["head", "admin", "mod"], MOD_MAX = 4320;   // MOD_MAX: the longest a moderator's mute / ban goes through without approval (3 days)
// the game socket's side (net.js registers these): who's online (id -> { name, side }), kicking, mutes, devices in use
let hooks = { staffChanged: () => {}, online: () => new Map(), kick: () => {}, mute: () => {}, respawn: () => false, teleportTo: () => false, inWorld: () => false, note: () => {}, deviceBusy: () => false };
/** For the other server modules: ask or tell the game something. */
export const gameHook = (name, ...args) => hooks[name] && hooks[name](...args);
export const setGameHooks = (h) => { hooks = { ...hooks, ...h }; };

export const admin = express.Router();
const fail = (res, code, error) => res.status(code).json({ error });
const isId = (v) => typeof v === "string" && /^[0-9]{1,15}$/.test(v);
const cleanReason = (r) => safeText(r, REASON_MAX);

async function who(req, res) {
  let u = await getSessionUser(readCookie(req));
  if (PTR && req.headers["x-ptr-as"]) u = await ptrAs(String(req.headers["x-ptr-as"]));   // (PTR only: tests act as another account)
  if (!u) { fail(res, 401, "Not logged in."); return null; }
  if (!STAFF.includes(u.role)) { fail(res, 403, "Not an admin."); return null; }
  return { id: String(u.id), name: "Admin", username: u.username, role: u.role };
}
const full = (me) => me.role === "head" || me.role === "admin";   // everything; a moderator gets kick / mute / ban only
const headOnly = (fn) => guard(async (req, res, me) => { if (me.role !== "head") return fail(res, 403, "Only Nyssary can do that."); await fn(req, res, me); });
const fullOnly = (fn) => guard(async (req, res, me) => { if (!full(me)) return fail(res, 403, "Moderators can't do that."); await fn(req, res, me); });
const guard = (fn) => async (req, res) => { try { const me = await who(req, res); if (me) await fn(req, res, me); } catch (e) { console.error("admin", e); fail(res, 500, "Something went wrong."); } };
async function target(id) {
  if (!isId(String(id || ""))) return null;
  const { rows } = await pool.query(`SELECT id, username, role, ban_perm, ban_until, ban_reason, ban_at, mute_perm, mute_until, mute_reason, mute_at FROM users WHERE id = $1`, [String(id)]);
  return rows[0] || null;
}
const mayAct = (me, t) => String(t.id) !== me.id && !t.role;
async function log(me, t, action, reason, detail = null) {
  await pool.query(`INSERT INTO admin_log (admin_id, admin_name, target_id, target_name, action, reason, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [me.id, me.username, t.id, t.username, action, reason || "", detail]);
}
const banOf = (u) => u.ban_perm ? { perm: true, reason: u.ban_reason || "" } : u.ban_until && new Date(u.ban_until) > new Date() ? { perm: false, until: u.ban_until, reason: u.ban_reason || "" } : null;
const muteOf = (u) => u.mute_perm ? { perm: true, reason: u.mute_reason || "" } : u.mute_until && new Date(u.mute_until) > new Date() ? { perm: false, until: u.mute_until, reason: u.mute_reason || "" } : null;

admin.get("/me", guard(async (req, res, me) => res.json({ role: me.role })));

// (owner, 2026-10-13) the player lists: ?list=online (everyone in the game) or offline (everyone else, most recently played
// first, at most 200), ?q= a name search (any part, any case). Each with their mute and ban and when they last played
// (world3d.updated_at: saved while playing and on leaving).
// (owner) with each player's discipline totals: kicks counted; time spent muted / banned (each one to its end, or to when it
// was lifted if earlier, or to now if still running), in seconds
const playerRow = (u, on) => { const o = on.get(String(u.id)); return { id: String(u.id), name: u.username, staff: !!u.role, role: u.role || null, online: !!o, side: o ? o.side || null : null, ban: banOf(u), mute: muteOf(u), lastPlayed: u.last_played || null,
  totals: { kicks: Number(u.kicks || 0), muted: Math.round(Number(u.muted_s || 0)), banned: Math.round(Number(u.banned_s || 0)) } }; };
const served = (kind) => `(SELECT coalesce(sum(extract(epoch FROM least(coalesce(d.ended, now()), coalesce(d.until, now()), now()) - d.at)), 0) FROM discipline d WHERE d.user_id = u.id AND d.kind = '${kind}')`;
const PLAYER_COLS = `u.id, u.username, u.role, u.ban_perm, u.ban_until, u.ban_reason, u.mute_perm, u.mute_until, u.mute_reason, w.updated_at AS last_played,
  (SELECT count(*) FROM discipline d WHERE d.user_id = u.id AND d.kind = 'kick') AS kicks, ${served("mute")} AS muted_s, ${served("ban")} AS banned_s`;
// a new mute / ban ends any running one of the same kind; lifting ends it now
const endDiscipline = (uid, kind) => pool.query(`UPDATE discipline SET ended = now() WHERE user_id = $1 AND kind = $2 AND ended IS NULL AND (until IS NULL OR until > now())`, [uid, kind]);
async function recordDiscipline(uid, kind, until) { if (kind !== "kick") await endDiscipline(uid, kind); await pool.query(`INSERT INTO discipline (user_id, kind, until) VALUES ($1, $2, $3)`, [uid, kind, until]); }
admin.get("/players", guard(async (req, res) => {
  const on = hooks.online(), ids = [...on.keys()], q = String(req.query.q || "").slice(0, 40).toLowerCase();
  const like = "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const { rows } = req.query.list === "offline"
    ? await pool.query(`SELECT ${PLAYER_COLS} FROM users u LEFT JOIN world3d w ON w.user_id = u.id::text
        WHERE NOT (u.id = ANY($1::bigint[])) AND lower(u.username) LIKE $2 ORDER BY w.updated_at DESC NULLS LAST, lower(u.username) LIMIT 200`, [ids, like])
    : await pool.query(`SELECT ${PLAYER_COLS} FROM users u LEFT JOIN world3d w ON w.user_id = u.id::text
        WHERE u.id = ANY($1::bigint[]) AND lower(u.username) LIKE $2 ORDER BY lower(u.username)`, [ids, like]);
  res.json(rows.map((u) => playerRow(u, on)));
}));
// one player (the disciplinary panel, opened from a name in chat: to offer Unmute / Unban when they apply)
admin.get("/player/:id", guard(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, "Bad request.");
  const { rows } = await pool.query(`SELECT ${PLAYER_COLS} FROM users u LEFT JOIN world3d w ON w.user_id = u.id::text WHERE u.id = $1`, [req.params.id]);
  if (!rows[0]) return fail(res, 404, "No such player.");
  res.json(playerRow(rows[0], hooks.online()));
}));

// (owner, 2026-10-13) the disciplinary panel: one action on a player. type: kick | mute | ban | kill | respawn | tpme
// (teleport them to me) | tpto (teleport me to them). Mutes and bans take a reason from their list and a length from the
// slider's notches (minutes, or indefinite); a note to the player is optional (shown in their chat, or with the kick /
// ban message, and with the ban at login). No free-text reasons.
const REASONS = { mute: ["Language", "Spam"], ban: ["Language", "Spam", "Disruptive Behavior"] };
const NOTCHES = [5, 30, 360, 1440, 4320, 10080];       // 5 min, 30 min, 6 h, 1 day, 3 days, 7 days (+ indefinite)
const lengthText = (m) => m === null ? "indefinitely" : m < 60 ? m + " minutes" : m < 1440 ? m / 60 + " hours" : m / 1440 + (m === 1440 ? " day" : " days");
admin.post("/act", guard(async (req, res, me) => {
  const b = req.body || {}, type = String(b.type || ""), t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!["kick", "mute", "ban", "kill", "respawn", "tpme", "tpto"].includes(type)) return fail(res, 400, "Bad request.");
  if (String(t.id) === me.id) return fail(res, 403, "You can't do that to yourself.");
  if (!type.startsWith("tp") && t.role) return fail(res, 403, "You can't do that to staff.");
  if (!full(me) && !["kick", "mute", "ban"].includes(type)) return fail(res, 403, "Moderators can't do that.");
  const note = safeText(b.note, 300);
  let reason = "", minutes = null;
  if (REASONS[type]) {
    reason = String(b.reason || ""); if (!REASONS[type].includes(reason)) return fail(res, 400, "Pick a reason.");
    if (b.minutes !== null && b.minutes !== undefined) { minutes = Number(b.minutes); if (!NOTCHES.includes(minutes)) return fail(res, 400, "Bad length."); }
  }
  if (!full(me) && REASONS[type] && (minutes === null || minutes > MOD_MAX)) {   // (owner) a moderator's long one: a request for Nyssary
    await pool.query(`INSERT INTO approvals (mod_id, mod_name, target_id, target_name, kind, reason, minutes, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [me.id, me.username, t.id, t.username, type, reason, minutes, note || null]);
    await log(me, t, type + " requested", reason, { length: lengthText(minutes), ...(note ? { note } : {}) });
    return res.json({ ok: true, pending: true });
  }
  try { await apply(me, t, type, reason, minutes, note); } catch (e) { return fail(res, 400, e.message); }
  res.json({ ok: true });
}));
// carry out an action (also an approved request); throws with the message to show when it can't
async function apply(me, t, type, reason, minutes, note) {
  const tid = String(t.id), shown = reason + (note ? " — " + note : "");
  const until = minutes === null ? null : new Date(Date.now() + minutes * 60_000);
  if (["kick", "mute", "ban"].includes(type)) await recordDiscipline(tid, type, until);
  if (type === "kick") hooks.kick(tid, 4005, note);
  else if (type === "ban") {
    await pool.query(`UPDATE users SET ban_perm = $2, ban_until = $3, ban_reason = $4, ban_at = now() WHERE id = $1`, [tid, minutes === null, until, shown]);
    await destroyAllSessions(tid); hooks.kick(tid, 4006, shown);
  } else if (type === "mute") {
    await pool.query(`UPDATE users SET mute_perm = $2, mute_until = $3, mute_reason = $4, mute_at = now() WHERE id = $1`, [tid, minutes === null, until, shown]);
    hooks.mute(tid, { perm: minutes === null, until: until && until.getTime() });
    hooks.note(tid, "Muted " + lengthText(minutes) + ": " + shown);
  } else if (type === "kill" || type === "respawn") { if (!hooks.respawn(tid)) throw new Error("That player isn't in the world."); }
  else if (type === "tpme") { if (!hooks.inWorld(me.id)) throw new Error("You're not in the world."); if (!hooks.teleportTo(tid, me.id)) throw new Error("That player isn't in the world."); }
  else if (type === "tpto") { if (!hooks.inWorld(tid)) throw new Error("That player isn't in the world."); if (!hooks.teleportTo(me.id, tid)) throw new Error("You're not in the world."); }
  if (note && !["kick", "ban", "mute"].includes(type)) hooks.note(tid, note);
  await log(me, t, type, reason, { ...(REASONS[type] ? { length: lengthText(minutes) } : {}), ...(note ? { note } : {}) });
}

// ---- (owner, 2026-10-14) moderators (and, 2026-10-15, developers): Nyssary makes and removes them (players only; not other staff) ----
admin.post("/role", headOnly(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (String(t.id) === me.id) return fail(res, 403, "You can't do that to yourself.");
  // (owner, 2026-10-15) and developers ("dev": the Object Placer), the same way
  const make = b.role === "mod" || b.role === "dev" ? b.role : null, label = { mod: "moderator", dev: "developer" };
  if (make ? t.role : !["mod", "dev"].includes(t.role)) return fail(res, 400, make ? "That player is already staff." : "That player isn't a moderator or developer.");
  const was = t.role;
  await pool.query(`UPDATE users SET role = $2 WHERE id = $1`, [t.id, make]);
  hooks.staffChanged(String(t.id), make);
  await log(me, t, make ? "made " + label[make] : "removed " + label[was], ""); res.json({ ok: true });
}));
// ---- (owner, 2026-10-14) Approvals (Nyssary only): moderators' requests for 7-day / indefinite mutes and bans ----
admin.get("/approvals", headOnly(async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM approvals ORDER BY (status = 'open') DESC, id DESC LIMIT 100`);
  res.json(rows.map((a) => ({ id: String(a.id), mod: a.mod_name, target: String(a.target_id), targetName: a.target_name, kind: a.kind, reason: a.reason, length: lengthText(a.minutes), note: a.note || "", status: a.status, at: a.created_at, by: a.decided_by, decidedAt: a.decided_at })));
}));
admin.post("/approval", headOnly(async (req, res, me) => {
  const b = req.body || {}, id = String(b.id || ""); if (!isId(id)) return fail(res, 400, "Bad request.");
  const { rows } = await pool.query(`SELECT * FROM approvals WHERE id = $1`, [id]); const a = rows[0];
  if (!a || a.status !== "open") return fail(res, 404, "That request isn't open.");
  const t = await target(String(a.target_id)); if (!t) return fail(res, 404, "No such player.");
  const approve = !!b.approve;
  if (approve) {
    if (t.role) return fail(res, 403, "That player is staff now.");
    try { await apply(me, t, a.kind, a.reason, a.minutes, a.note || ""); } catch (e) { return fail(res, 400, e.message); }   // (the length runs from now)
  }
  await pool.query(`UPDATE approvals SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1`, [id, approve ? "approved" : "denied", me.username]);
  await log(me, t, a.kind + (approve ? " approved" : " denied"), a.reason, { request: id, by: a.mod_name, length: lengthText(a.minutes) });
  res.json({ ok: true });
}));
admin.post("/unban", fullOnly(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  if (!banOf(t)) return fail(res, 400, "That player isn't banned.");
  await pool.query(`UPDATE users SET ban_perm = false, ban_until = NULL, ban_reason = NULL, ban_at = NULL WHERE id = $1`, [t.id]);
  await endDiscipline(t.id, "ban");
  { const { rows } = await pool.query(`SELECT id FROM appeals WHERE user_id = $1 AND status = 'open'`, [t.id]); for (const r of rows) await closeAppeal(String(r.id), me, true, "Unbanned."); }   // (an open appeal is answered by it)
  await log(me, t, "unban", ""); res.json({ ok: true });
}));
admin.post("/unmute", fullOnly(async (req, res, me) => {
  const b = req.body || {}, t = await target(b.id); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  await pool.query(`UPDATE users SET mute_perm = false, mute_until = NULL, mute_reason = NULL, mute_at = NULL WHERE id = $1`, [t.id]);
  hooks.mute(String(t.id), null);
  await endDiscipline(t.id, "mute");
  await log(me, t, "unmute", ""); res.json({ ok: true });
}));

// ---- (owner, 2026-10-13) player reports (made from a name in chat): open first; each with the reported player's recent lines ----
admin.get("/reports", guard(async (req, res) => {
  const { rows } = await pool.query(`SELECT r.id, r.target, r.target_name, r.text, r.chat, r.status, r.created_at, u.username AS reporter
    FROM reports r LEFT JOIN users u ON u.id = r.reporter WHERE r.category = 'player' ORDER BY (r.status = 'open') DESC, r.id DESC LIMIT 100`);
  res.json(rows.map((r) => ({ id: String(r.id), target: r.target == null ? null : String(r.target), targetName: r.target_name, reporter: r.reporter || "?", text: r.text, chat: r.chat || [], status: r.status, at: r.created_at })));
}));
admin.post("/report/close", guard(async (req, res, me) => {
  const id = String((req.body || {}).id || ""); if (!isId(id)) return fail(res, 400, "Bad request.");
  const { rows } = await pool.query(`UPDATE reports SET status = 'closed' WHERE id = $1 AND category = 'player' RETURNING target, target_name`, [id]);
  if (!rows[0]) return fail(res, 404, "No such report.");
  await log(me, { id: rows[0].target, username: rows[0].target_name }, "report closed", "", { report: id }); res.json({ ok: true });
}));

// ---- ban appeals (appeals.js): a conversation with a banned player while the ban lasts; Accept unbans, Deny closes it ----
admin.get("/appeals", fullOnly(async (req, res) => {
  const { rows } = await pool.query(`SELECT a.id, a.user_id, a.username, a.ban_reason, a.status, a.created_at,
      (SELECT row_to_json(m) FROM (SELECT text, at, from_admin FROM appeal_messages WHERE appeal_id = a.id ORDER BY id DESC LIMIT 1) m) AS last
    FROM appeals a ORDER BY (a.status = 'open') DESC, a.id DESC LIMIT 100`);
  res.json(rows.map((a) => ({ id: String(a.id), name: a.username, banReason: a.ban_reason, status: a.status, at: a.created_at, last: a.last && { text: a.last.text, at: a.last.at, admin: a.last.from_admin } })));
}));
async function appealOf(id) { if (!isId(String(id || ""))) return null; const { rows } = await pool.query(`SELECT * FROM appeals WHERE id = $1`, [String(id)]); return rows[0] || null; }
admin.get("/appeal/:id", fullOnly(async (req, res) => {
  const a = await appealOf(req.params.id); if (!a) return fail(res, 404, "No such appeal.");
  const st = a.user_id ? await appealState(String(a.user_id)) : null;
  res.json({ id: String(a.id), name: a.username, banReason: a.ban_reason, status: a.status, at: a.created_at, lines: await lines(String(a.id)), ban: st && st.ban });
}));
admin.post("/appeal/say", fullOnly(async (req, res, me) => {
  const b = req.body || {}, a = await appealOf(b.id); if (!a) return fail(res, 404, "No such appeal.");
  try { await adminWrite(String(a.id), me, b.text); res.json({ ok: true }); } catch (e) { fail(res, 400, e.message); }
}));
admin.post("/appeal", fullOnly(async (req, res, me) => {
  const b = req.body || {}, a = await appealOf(b.id);
  if (!a || a.status !== "open") return fail(res, 404, "That appeal isn't open.");
  const t = await target(String(a.user_id)); if (!t) return fail(res, 404, "No such player.");
  if (!mayAct(me, t)) return fail(res, 403, "You can't do that to this player.");
  const accept = !!b.accept, reason = cleanReason(b.reason) || (accept ? "Unbanned." : "Denied.");   // (an optional note)
  await closeAppeal(String(a.id), me, accept, reason);
  if (accept) { await pool.query(`UPDATE users SET ban_perm = false, ban_until = NULL, ban_reason = NULL, ban_at = NULL WHERE id = $1`, [t.id]); await endDiscipline(t.id, "ban"); }
  await log(me, t, accept ? "appeal accepted" : "appeal denied", reason, { appeal: String(a.id) }); res.json({ ok: true });
}));
