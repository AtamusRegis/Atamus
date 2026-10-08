import express from "express";
import { getSessionUser, readCookie } from "./sessions.js";
import { CATALOG } from "./licenses.js";
import * as pilots from "./pilots.js";

export const game = express.Router();

async function auth(req, res, next) {
  const u = await getSessionUser(readCookie(req));
  if (!u) return res.status(401).json({ error: "Not logged in." });
  req.uid = String(u.id);
  next();
}

game.get("/catalog", (_req, res) => res.json(CATALOG));

game.get("/state", auth, async (req, res) => {
  try { res.json(await pilots.getState(req.uid)); }
  catch (e) { console.error("state", e); res.status(500).json({ error: "Could not load state." }); }
});

game.post("/pilot/create", auth, async (req, res) => {
  try { const id = await pilots.createPilot(req.uid, req.body?.name); res.json({ id }); }
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
