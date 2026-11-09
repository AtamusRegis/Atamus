// The deploy workflows' HTTP calls (the game itself runs over the WebSocket in pets.js).
import express from "express";
import { websiteDeployed, announceUpdate, updateStatus } from "./build.js";

export const game = express.Router();

// Called by the website deploy workflow right after GitHub Pages publishes; harmless to call any time.
game.post("/build-check", (_req, res) => { websiteDeployed(); res.json({ ok: true }); });
// Called by both deploy workflows ~30 s before they switch the live build.
game.post("/update-countdown", async (req, res) => { res.json(await announceUpdate(req.query.part, 1, req.query.also)); });
// is an update in progress? (null: no)
game.get("/update-status", (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.json({ updating: updateStatus() }); });
