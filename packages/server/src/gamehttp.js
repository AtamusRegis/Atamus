import express from "express";
import { safeText } from "./textsafe.js";
import { getSessionUser, readCookie } from "./sessions.js";
import { CATALOG } from "./licenses.js";
import { PORTRAIT_PARTS } from "./portraits.js";
import * as pilots from "./pilots.js";
import { websiteDeployed, announceUpdate } from "./build.js";
import { allow } from "./ratelimit.js";
import { gameHook } from "./admin.js";
import { PTR, ptrAs } from "./ptr.js";
import { pool } from "./db.js";
import { setRelation, relationsOf } from "./relations.js";
import * as relAp from "./relappeals.js";
import * as tickets from "./tickets.js";

export const game = express.Router();

async function auth(req, res, next) {
  let u = await getSessionUser(readCookie(req));
  if (PTR && req.headers["x-ptr-as"]) u = await ptrAs(String(req.headers["x-ptr-as"]));   // (PTR only: tests act as a second account)
  if (!u) return res.status(401).json({ error: "Not logged in." });
  req.uid = String(u.id);
  next();
}

// Called by the website deploy workflow right after GitHub Pages publishes; harmless to call any time.
game.post("/build-check", (_req, res) => { websiteDeployed(); res.json({ ok: true }); });
// Called by both deploy workflows ~30 s before they switch the live build.
game.post("/update-countdown", async (req, res) => { res.json(await announceUpdate(req.query.part, 30)); });

game.get("/catalog", (_req, res) => res.json(CATALOG));
game.get("/portraits", (_req, res) => res.json(PORTRAIT_PARTS));

// another player's sheet (Info on a chat name)
game.get("/player/:name", auth, async (req, res) => {
  try { const p = await pilots.publicProfile(req.params.name); if (!p) return res.status(404).json({ error: "No such player." }); res.json(p); }
  catch (e) { console.error("player", e); res.status(500).json({ error: "Could not load that player." }); }
});
game.get("/pilot-info/:id", auth, async (req, res) => {
  try { const p = await pilots.publicPilot(req.params.id); if (!p) return res.status(404).json({ error: "No such pilot." }); res.json(p); }
  catch (e) { console.error("pilot-info", e); res.status(500).json({ error: "Could not load that pilot." }); }
});
// (owner) a player's mutes and blocks (their own, and any an admin set between them and someone: those only appealed)
async function nameOf(uid) { const { rows } = await pool.query(`SELECT username FROM users WHERE id = $1`, [uid]); return rows[0] ? rows[0].username : "?"; }
async function idByName(name) { if (typeof name !== "string" || !name || name.length > 40) return null; const { rows } = await pool.query(`SELECT id FROM users WHERE lower(username) = lower($1)`, [name]); return rows[0] ? String(rows[0].id) : null; }
const fail400 = (res, e) => res.status(400).json({ error: e.message });
game.get("/relations", auth, async (req, res) => { try { res.json({ list: await relationsOf(req.uid), appeals: await relAp.playerAppeals(req.uid) }); } catch (e) { fail400(res, e); } });
game.post("/relation", auth, async (req, res) => {
  try { const b = req.body || {}, other = await idByName(b.name); if (!other) throw new Error("No such player.");
    await setRelation(req.uid, other, b.kind, b.on === true); gameHook("relations"); res.json({ ok: true }); } catch (e) { fail400(res, e); }
});
game.post("/relappeal", auth, async (req, res) => {
  if (!allow("relappeal", req.uid, 10, 3600_000)) return res.status(429).json({ error: "Too many. Try again later." });
  try { const b = req.body || {}, other = await idByName(b.name); if (!other) throw new Error("No such player.");
    res.json({ id: await relAp.openRelAppeal(req.uid, await nameOf(req.uid), other, b.kind, b.text) }); } catch (e) { fail400(res, e); }
});
game.post("/relappeal/say", auth, async (req, res) => { try { await relAp.playerSay(req.uid, await nameOf(req.uid), (req.body || {}).id, (req.body || {}).text); res.json({ ok: true }); } catch (e) { fail400(res, e); } });
// (owner) support tickets
game.get("/tickets", auth, async (req, res) => { try { res.json({ categories: tickets.TICKET_CATEGORIES, list: await tickets.playerTickets(req.uid) }); } catch (e) { fail400(res, e); } });
game.post("/ticket", auth, async (req, res) => {
  if (!allow("ticket", req.uid, 10, 3600_000)) return res.status(429).json({ error: "Too many tickets. Try again later." });
  try { res.json({ id: await tickets.openTicket(req.uid, await nameOf(req.uid), req.body || {}) }); } catch (e) { fail400(res, e); }
});
game.post("/ticket/say", auth, async (req, res) => { try { await tickets.playerSay(req.uid, await nameOf(req.uid), (req.body || {}).id, (req.body || {}).text); res.json({ ok: true }); } catch (e) { fail400(res, e); } });
game.get("/report-categories", (_req, res) => res.json(pilots.REPORT_CATEGORIES));
game.post("/report", auth, async (req, res) => {
  if (!allow("report", req.uid, 10, 3600_000)) return res.status(429).json({ error: "Too many reports. Try again later." });
  try { await pilots.fileReport(req.uid, req.body || {}, (pid) => ({ chat: gameHook("chatLog", pid) || [], ships: gameHook("shipNames", pid) || [] }));
    const b = req.body || {}; gameHook("staffNotify", ["head", "admin", "mod"], "report", "Report: " + (await nameOf(req.uid)) + " reported " + String(b.target || "").slice(0, 40) + " (" + String(b.category || "").slice(0, 40) + ")", { tab: "reports" });   // (owner) staff are told
    res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// (owner) after an admin's Ban Name: a new name for the account or that pilot (only then)
game.post("/rename", auth, async (req, res) => {
  try { const name = await pilots.renameAccount(req.uid, req.body?.name); gameHook("renamed", req.uid, name); res.json({ name }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// (owner) an allowed name offered back: Revert (take it) or Keep (the name they have)
game.post("/name-offer", auth, async (req, res) => {
  try { const b = req.body || {}, r = await pilots.answerNameOffer(req.uid, b.pilotId == null ? null : b.pilotId, b.take === true);
    if (b.pilotId == null) { if (r.changed) gameHook("renamed", req.uid, r.name); } else await gameHook("refreshPilots", req.uid);
    res.json({ name: r.name }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// (owner) a promotion to Moderator or Admin: accepted, the role's powers start; declined (with why), they go back to the
// role they had and the Head Admin alone is told
game.post("/promotion", auth, async (req, res) => {
  try {
    const b = req.body || {}, { rows } = await pool.query(`SELECT username, promo_pending, promo_from FROM users WHERE id = $1`, [req.uid]), u = rows[0];
    if (!u || !u.promo_pending) throw new Error("No promotion to answer.");
    const NAME = { admin: "Admin", mod: "Moderator" }, role = NAME[u.promo_pending] || u.promo_pending;
    const why = safeText(b.reason, 500);   // (owner) an Admin's note, accepting or declining
    if (b.accept === true) {
      await pool.query(`UPDATE users SET promo_pending = NULL, promo_from = NULL WHERE id = $1`, [req.uid]);
      await pool.query(`INSERT INTO admin_log (admin_id, admin_name, target_id, target_name, action, reason) VALUES ($1, $2, $1, $2, $3, $4)`, [req.uid, u.username, "accepted " + role, why]);
      gameHook("staffNotify", ["head"], "promotion", u.username + " accepted " + role + (why ? ": " + why : "."), { player: req.uid });
    } else {
      if (!why) throw new Error("Write why.");
      await pool.query(`UPDATE users SET role = promo_from, promo_pending = NULL, promo_from = NULL, admin_pw_hash = NULL WHERE id = $1`, [req.uid]);
      await pool.query(`INSERT INTO admin_log (admin_id, admin_name, target_id, target_name, action, reason) VALUES ($1, $2, $1, $2, $3, $4)`, [req.uid, u.username, "declined " + role, why]);
      gameHook("staffNotify", ["head"], "promotion", u.username + " declined " + role + ": " + why, { player: req.uid });
    }
    res.json({ ok: true });
  } catch (e) { fail400(res, e); }
});
game.post("/pilot/rename", auth, async (req, res) => {
  try { const name = await pilots.renamePilot(req.uid, req.body?.pilotId, req.body?.name); await gameHook("refreshPilots", req.uid); res.json({ name }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

game.post("/character", auth, async (req, res) => {
  try { res.json({ portrait: await pilots.setCharacter(req.uid, req.body?.portrait) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

game.get("/state", auth, async (req, res) => {
  try { res.json(await pilots.getState(req.uid)); }
  catch (e) { console.error("state", e); res.status(500).json({ error: "Could not load state." }); }
});

game.post("/pilot/create", auth, async (req, res) => {
  try { const id = await pilots.createPilot(req.uid, req.body?.name, req.body?.portrait); res.json({ id }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

game.post("/queue/add", auth, async (req, res) => {
  try { await pilots.queueAdd(req.uid, req.body.pilotId, req.body.key); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

game.post("/queue/remove", auth, async (req, res) => {
  try { await pilots.queueRemove(req.uid, req.body.pilotId, req.body.key); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

game.post("/queue/reorder", auth, async (req, res) => {
  try { await pilots.queueReorder(req.uid, req.body.pilotId, req.body.order); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

game.post("/queue/pause", auth, async (req, res) => {
  try { await pilots.queuePause(req.uid, req.body.pilotId, !!req.body.paused); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

game.post("/queue/cancel", auth, async (req, res) => {
  try { await pilots.queueCancel(req.uid, req.body.pilotId, req.body.key, +req.body.level); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
