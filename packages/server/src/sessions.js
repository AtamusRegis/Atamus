import crypto from "node:crypto";
import { pool } from "./db.js";
import { config } from "./config.js";

const COOKIE_NAME = "atamus_sid";

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** Create a session for a user and return the raw token (goes in the cookie). */
export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.sessionTtlDays * 86400_000);
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [sha256(token), userId, expires]
  );
  return { token, expires };
}

/** Look up the user for a session token, or null. */
export async function getSessionUser(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.email,
            EXISTS(SELECT 1 FROM recovery_questions rq WHERE rq.user_id = u.id) AS has_recovery
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)]
  );
  return rows[0] || null;
}

export async function destroySession(token) {
  if (!token) return;
  await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [sha256(token)]);
}

/** Invalidate every session for a user (e.g. after a password reset). */
export async function destroyAllSessions(userId) {
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
}

// ---- cookie helpers ----

export function readCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const name = part.slice(0, i).trim();
    if (name === COOKIE_NAME) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function setSessionCookie(res, token, expires) {
  const maxAge = Math.floor((expires.getTime() - Date.now()) / 1000);
  res.setHeader("Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  );
}
