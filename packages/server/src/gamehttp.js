// The game's HTTP routes (the game itself runs over the socket in game/net.js): the deploy workflows' calls.
import express from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import { websiteDeployed, announceUpdate } from "./build.js";
import { readCookie, getSessionUser } from "./sessions.js";
import { modelRef } from "./game/world3d.js";

export const game = express.Router();

// Called by the website deploy workflow right after GitHub Pages publishes; harmless to call any time.
game.post("/build-check", (_req, res) => { websiteDeployed(); res.json({ ok: true }); });
// Called by both deploy workflows ~30 s before they switch the live build.
game.post("/update-countdown", async (req, res) => { res.json(await announceUpdate(req.query.part, 1)); });

// (owner, 2026-10-15) the Object Creator's models: the head admin uploads a GLB (50 MB at most); it's kept on the server
// (uploads/models at the repo's root, outside git: index.js clears packages/server/data at every start, and the service
// may only write under the app folder) under a random name and served to everyone from here
const MODEL_DIR = new URL("../../../uploads/models/", import.meta.url).pathname;
try { fs.mkdirSync(MODEL_DIR, { recursive: true }); } catch (e) { console.error("models dir", e); }
game.post("/models", express.raw({ type: () => true, limit: "50mb" }), async (req, res) => {
  let u = null; try { u = await getSessionUser(readCookie(req)); } catch {}
  if (!u || u.role !== "head") return res.status(403).json({ error: "Only the head admin can do that." });
  const b = req.body;   // a GLB: "glTF", version 2, then its whole length
  if (!Buffer.isBuffer(b) || b.length < 20 || b.readUInt32LE(0) !== 0x46546c67 || b.readUInt32LE(4) !== 2 || b.readUInt32LE(8) !== b.length) return res.status(400).json({ error: "That isn't a GLB model." });
  const file = crypto.randomBytes(12).toString("hex") + ".glb";
  try { await fs.promises.writeFile(MODEL_DIR + file, b); } catch (e) { console.error("model save", e); return res.status(500).json({ error: "The model couldn't be saved." }); }
  res.json({ ok: true, file });
});
game.get("/models/:f", (req, res) => {
  const f = modelRef(req.params.f); if (!f) return res.status(404).end();
  res.setHeader("Content-Type", "model/gltf-binary"); res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(MODEL_DIR + f, (err) => { if (err && !res.headersSent) res.status(404).end(); });
});
