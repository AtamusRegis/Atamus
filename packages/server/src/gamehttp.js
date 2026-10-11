import express from "express";
import { getSessionUser, readCookie } from "./sessions.js";
import { CATALOG } from "./licenses.js";
import { PORTRAIT_PARTS } from "./portraits.js";
import * as pilots from "./pilots.js";
import { websiteDeployed, announceUpdate } from "./build.js";
import { allow } from "./ratelimit.js";
import { gameHook } from "./admin.js";

export const game = express.Router();

async function auth(req, res, next) {
  const u = await getSessionUser(readCookie(req));
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
game.get("/report-categories", (_req, res) => res.json(pilots.REPORT_CATEGORIES));
game.post("/report", auth, async (req, res) => {
  if (!allow("report", req.uid, 10, 3600_000)) return res.status(429).json({ error: "Too many reports. Try again later." });
  try { await pilots.fileReport(req.uid, req.body || {}, (pid) => ({ chat: gameHook("chatLog", pid) || [], ships: gameHook("shipNames", pid) || [] })); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// (owner) after an admin's Ban Name: a new name for the account or that pilot (only then)
game.post("/rename", auth, async (req, res) => {
  try { const name = await pilots.renameAccount(req.uid, req.body?.name); gameHook("renamed", req.uid, name); res.json({ name }); }
  catch (e) { res.status(400).json({ error: e.message }); }
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
