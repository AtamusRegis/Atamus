// The game's HTTP routes (the game itself runs over the socket in game/net.js): the deploy workflows' calls.
import express from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import { websiteDeployed, announceUpdate } from "./build.js";
import { readCookie, getSessionUser } from "./sessions.js";
import { modelRef, imageRef, audioRef } from "./game/world3d.js";

export const game = express.Router();

// Called by the website deploy workflow right after GitHub Pages publishes; harmless to call any time.
game.post("/build-check", (_req, res) => { websiteDeployed(); res.json({ ok: true }); });
// Called by both deploy workflows ~30 s before they switch the live build.
game.post("/update-countdown", async (req, res) => { res.json(await announceUpdate(req.query.part, 1)); });

// (owner, 2026-10-15) the models (the Importer uploads them, below: a GLB, 50 MB at most); they're kept on the server
// (uploads/models at the repo's root, outside git: index.js clears packages/server/data at every start, and the service
// may only write under the app folder) under a random name and served to everyone from here
const MODEL_DIR = new URL("../../../uploads/models/", import.meta.url).pathname;
try { fs.mkdirSync(MODEL_DIR, { recursive: true }); } catch (e) { console.error("models dir", e); }
game.get("/models/:f", (req, res) => {
  const f = modelRef(req.params.f); if (!f) return res.status(404).end();
  res.setHeader("Content-Type", "model/gltf-binary"); res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(MODEL_DIR + f, (err) => { if (err && !res.headersSent) res.status(404).end(); });
});

// (owner, 2026-10-15) the Importer's files (head admin): a GLB model (50 MB at most; with the models above), a PNG / JPEG /
// WebP image (10 MB) or an MP3 / OGG / WAV sound (25 MB), told apart by their first bytes, never by name. Answers its file
// name and kind. Images and sounds are kept in uploads/assets and served from /game/assets.
const ASSET_DIR = new URL("../../../uploads/assets/", import.meta.url).pathname;
try { fs.mkdirSync(ASSET_DIR, { recursive: true }); } catch (e) { console.error("assets dir", e); }
function sniff(b) {
  if (b.length >= 20 && b.readUInt32LE(0) === 0x46546c67 && b.readUInt32LE(4) === 2 && b.readUInt32LE(8) === b.length) return { kind: "model", ext: "glb", max: 50 };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "image", ext: "png", max: 10 };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", ext: "jpg", max: 10 };
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return { kind: "image", ext: "webp", max: 10 };
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WAVE") return { kind: "audio", ext: "wav", max: 25 };
  if (b.length >= 4 && b.toString("latin1", 0, 4) === "OggS") return { kind: "audio", ext: "ogg", max: 25 };
  if (b.length >= 3 && (b.toString("latin1", 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))) return { kind: "audio", ext: "mp3", max: 25 };
  return null;
}
game.post("/assets", express.raw({ type: () => true, limit: "50mb" }), async (req, res) => {
  let u = null; try { u = await getSessionUser(readCookie(req)); } catch {}
  if (!u || u.role !== "head") return res.status(403).json({ error: "Only the head admin can do that." });
  const b = req.body, k = Buffer.isBuffer(b) && sniff(b);
  if (!k) return res.status(400).json({ error: "That isn't a model, image or sound the game can use." });
  if (b.length > k.max * 1024 * 1024) return res.status(400).json({ error: "That file is over " + k.max + " MB." });
  const file = crypto.randomBytes(12).toString("hex") + "." + k.ext;
  try { await fs.promises.writeFile((k.kind === "model" ? MODEL_DIR : ASSET_DIR) + file, b); } catch (e) { console.error("asset save", e); return res.status(500).json({ error: "The file couldn't be saved." }); }
  res.json({ ok: true, file, kind: k.kind });
});
const MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav" };
game.get("/assets/:f", (req, res) => {
  const f = imageRef(req.params.f) || audioRef(req.params.f); if (!f) return res.status(404).end();
  res.setHeader("Content-Type", MIME[f.split(".").pop()]); res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(ASSET_DIR + f, (err) => { if (err && !res.headersSent) res.status(404).end(); });
});
