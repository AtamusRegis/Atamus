// (owner, 2026-10-19) Name and play, like an .io game: no accounts, no passwords, nothing remembered. Entering a name
// hands the browser a session token (a cookie that dies with the browser session, held only in the server's memory);
// the pilot exists while they play (and a minute after they drop, for a reload), then it's gone. A server restart forgets
// everyone. Names must pass the name filter and can't be one already in play. (The old guests and accounts tables stay
// in the database, untouched and unused.)
import crypto from "node:crypto";
import express from "express";
import { checkName } from "./names.js";
import { allow } from "./ratelimit.js";

const COOKIE = "atamus_pilot";
const tokens = new Map();                      // token -> { id, name, at }
let inUse = () => new Set();                   // the game's names in play (set by the game server)
export function setNamesInUse(fn) { inUse = fn; }
export function forgetPilot(id) { for (const [t, v] of tokens) if (v.id === id) tokens.delete(t); }

export function readGuestCookie(req) {
  const header = req.headers.cookie; if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("="); if (i === -1) continue;
    if (part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
export async function getGuestUser(req) {
  const t = readGuestCookie(req), v = t && tokens.get(t); if (!v) return null;
  v.at = Date.now();
  return { id: v.id, username: v.name, role: null, guest: true };
}

export const guest = express.Router();
guest.post("/guest", async (req, res) => {
  try {
    if (!allow("guest", req.ip, 30, 600_000)) return res.status(429).json({ error: "Too many tries; wait a moment." });
    const name = String((req.body && req.body.name) || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_ -]{1,18}[A-Za-z0-9]$/.test(name)) return res.status(400).json({ error: "3 to 20 letters, numbers, spaces, - or _." });
    const bad = await checkName(name); if (bad) return res.status(400).json({ error: bad });
    const lower = name.toLowerCase(), now = Date.now(), mine = readGuestCookie(req);
    for (const [t, v] of tokens) if (now - v.at > 10 * 60_000 && !inUse().has(v.name.toLowerCase())) tokens.delete(t);   // (stale, never joined)
    const taken = inUse().has(lower) || [...tokens.entries()].some(([t, v]) => t !== mine && v.name.toLowerCase() === lower);
    if (taken) return res.status(409).json({ error: "That name is in play right now." });
    if (mine) tokens.delete(mine);
    const token = crypto.randomBytes(24).toString("base64url");
    tokens.set(token, { id: "p_" + crypto.randomBytes(6).toString("hex"), name, at: now });
    res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/`);   // (no Max-Age: gone with the browser session)
    res.json({ ok: true, name });
  } catch (e) { console.error("guest", e); res.status(500).json({ error: "Try again." }); }
});
