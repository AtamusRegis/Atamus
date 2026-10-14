// The game's HTTP routes (the game itself runs over the socket in game/net.js): the deploy workflows' calls.
import express from "express";
import { websiteDeployed, announceUpdate } from "./build.js";

export const game = express.Router();

// Called by the website deploy workflow right after GitHub Pages publishes; harmless to call any time.
game.post("/build-check", (_req, res) => { websiteDeployed(); res.json({ ok: true }); });
// Called by both deploy workflows ~30 s before they switch the live build.
game.post("/update-countdown", async (req, res) => { res.json(await announceUpdate(req.query.part, 1)); });
