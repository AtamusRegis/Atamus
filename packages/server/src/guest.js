// (owner, 2026-10-18) No login: create a name and play. A random token cookie owns the pilot; the name rides on it and
// can be changed at the door. The name filter and banned names still apply. Old account rows stay untouched.
import crypto from "node:crypto";
import express from "express";
import { pool } from "./db.js";
import { checkName } from "./names.js";
import { allow } from "./ratelimit.js";

const COOKIE = "atamus_guest";
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export async function guestMigrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS guests (id SERIAL PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen TIMESTAMPTZ NOT NULL DEFAULT now())`);
}

export function readGuestCookie(req) {
  const header = req.headers.cookie; if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("="); if (i === -1) continue;
    if (part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
export async function getGuestUser(req) {
  const token = readGuestCookie(req); if (!token) return null;
  const { rows } = await pool.query(`SELECT id, name FROM guests WHERE token_hash = $1`, [sha256(token)]);
  if (!rows[0]) return null;
  pool.query(`UPDATE guests SET last_seen = now() WHERE id = $1`, [rows[0].id]).catch(() => {});
  return { id: "g" + rows[0].id, username: rows[0].name, role: null, guest: true };
}

export const guest = express.Router();
guest.get("/guest", async (req, res) => {
  try { const u = await getGuestUser(req); res.json(u ? { name: u.username } : {}); }
  catch (e) { console.error("guest who", e); res.status(500).json({ error: "Try again." }); }
});
guest.post("/guest", async (req, res) => {
  try {
    if (!allow("guest", req.ip, 20, 600_000)) return res.status(429).json({ error: "Too many tries; wait a moment." });
    const name = String((req.body && req.body.name) || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_ -]{1,18}[A-Za-z0-9]$/.test(name)) return res.status(400).json({ error: "3 to 20 letters, numbers, spaces, - or _." });
    const bad = await checkName(name); if (bad) return res.status(400).json({ error: bad });
    let token = readGuestCookie(req);
    if (token) {
      const { rowCount } = await pool.query(`UPDATE guests SET name = $2, last_seen = now() WHERE token_hash = $1`, [sha256(token), name]);
      if (!rowCount) token = null;
    }
    if (!token) {
      token = crypto.randomBytes(32).toString("base64url");
      await pool.query(`INSERT INTO guests (token_hash, name) VALUES ($1, $2)`, [sha256(token), name]);
    }
    res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${365 * 86400}`);
    res.json({ ok: true, name });
  } catch (e) { console.error("guest", e); res.status(500).json({ error: "Try again." }); }
});
