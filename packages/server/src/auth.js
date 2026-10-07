import crypto from "node:crypto";
import express from "express";
import { pool } from "./db.js";
import { config } from "./config.js";
import { hashSecret, verifySecret, normalizeAnswer } from "./hash.js";
import {
  createSession, destroySession, destroyAllSessions, getSessionUser,
  readCookie, setSessionCookie, clearSessionCookie,
} from "./sessions.js";
import { allow } from "./ratelimit.js";

export const auth = express.Router();

const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}
function fail(res, status, error) {
  return res.status(status).json({ error });
}

// Shape a user row for the client. Never leak the password hash.
function publicUser(u) {
  return { username: u.username, email: u.email || null, hasRecovery: !!u.has_recovery };
}

/** Who am I? Used by the pages to check login state. */
auth.get("/me", async (req, res) => {
  const user = await getSessionUser(readCookie(req));
  if (!user) return fail(res, 401, "Not logged in.");
  res.json(publicUser(user));
});

auth.post("/signup", async (req, res) => {
  if (!allow("signup", clientIp(req), 10, 60 * 60_000))
    return fail(res, 429, "Too many sign-ups from this address. Try again later.");

  const { username, password, email, recovery } = req.body || {};

  if (!USERNAME_RE.test(username || ""))
    return fail(res, 400, "Username must be 3–24 characters: letters, numbers and underscores.");
  if (typeof password !== "string" || password.length < 8)
    return fail(res, 400, "Password must be at least 8 characters.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return fail(res, 400, "That email address doesn't look valid.");

  // Recovery questions are optional, but if present must be exactly three complete pairs.
  let recoveryRows = null;
  if (recovery != null) {
    if (!Array.isArray(recovery) || recovery.length !== 3 ||
        recovery.some((r) => !r || !String(r.question).trim() || !String(r.answer).trim()))
      return fail(res, 400, "Provide all three recovery questions and answers, or none.");
    recoveryRows = recovery;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const passHash = await hashSecret(password);
    let userId;
    try {
      const { rows } = await client.query(
        `INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id`,
        [username, passHash, email || null]
      );
      userId = rows[0].id;
    } catch (e) {
      await client.query("ROLLBACK");
      if (e.code === "23505") return fail(res, 409, "That username is taken.");
      throw e;
    }

    if (recoveryRows) {
      for (let i = 0; i < 3; i++) {
        const ansHash = await hashSecret(normalizeAnswer(recoveryRows[i].answer));
        await client.query(
          `INSERT INTO recovery_questions (user_id, idx, question, answer) VALUES ($1, $2, $3, $4)`,
          [userId, i, String(recoveryRows[i].question).trim(), ansHash]
        );
      }
    }

    await client.query("COMMIT");

    const { token, expires } = await createSession(userId);
    setSessionCookie(res, token, expires);
    res.status(201).json({ username, email: email || null, hasRecovery: !!recoveryRows });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("signup error", e);
    fail(res, 500, "Something went wrong creating your account.");
  } finally {
    client.release();
  }
});

auth.post("/login", async (req, res) => {
  const ip = clientIp(req);
  if (!allow("login", ip, 10, 15 * 60_000))
    return fail(res, 429, "Too many attempts. Please wait a few minutes.");

  const { username, password } = req.body || {};
  if (!username || !password) return fail(res, 400, "Enter your username and password.");

  const { rows } = await pool.query(
    `SELECT id, username, password, email,
            EXISTS(SELECT 1 FROM recovery_questions rq WHERE rq.user_id = users.id) AS has_recovery
       FROM users WHERE lower(username) = lower($1)`,
    [username]
  );
  const user = rows[0];
  // Verify even when the user is missing, to keep timing roughly constant.
  const ok = user
    ? await verifySecret(password, user.password)
    : await verifySecret(password, "scrypt$16384$8$1$00$00");

  if (!user || !ok) return fail(res, 401, "Incorrect username or password.");

  const { token, expires } = await createSession(user.id);
  setSessionCookie(res, token, expires);
  res.json(publicUser(user));
});

auth.post("/logout", async (req, res) => {
  await destroySession(readCookie(req));
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ---- password recovery via custom questions ----

auth.post("/recover/start", async (req, res) => {
  const ip = clientIp(req);
  if (!allow("recover", ip, 10, 15 * 60_000))
    return fail(res, 429, "Too many attempts. Please wait a few minutes.");

  const { username } = req.body || {};
  if (!username) return fail(res, 400, "Enter your username.");

  const { rows } = await pool.query(
    `SELECT u.id, rq.idx, rq.question
       FROM users u JOIN recovery_questions rq ON rq.user_id = u.id
      WHERE lower(u.username) = lower($1) ORDER BY rq.idx`,
    [username]
  );
  if (rows.length !== 3)
    return fail(res, 404, "No recovery questions are set for that account.");

  const userId = rows[0].id;
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.recoveryTtlMinutes * 60_000);
  await pool.query(
    `INSERT INTO recovery_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [crypto.createHash("sha256").update(token).digest("hex"), userId, expires]
  );

  res.json({ token, questions: rows.map((r) => r.question) });
});

auth.post("/recover/finish", async (req, res) => {
  const ip = clientIp(req);
  if (!allow("recover-finish", ip, 10, 15 * 60_000))
    return fail(res, 429, "Too many attempts. Please wait a few minutes.");

  const { token, answers, password } = req.body || {};
  if (!token || !Array.isArray(answers) || answers.length !== 3)
    return fail(res, 400, "Answer all three questions.");
  if (typeof password !== "string" || password.length < 8)
    return fail(res, 400, "New password must be at least 8 characters.");

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const { rows: trows } = await pool.query(
    `SELECT user_id FROM recovery_tokens WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash]
  );
  if (!trows[0]) return fail(res, 400, "This recovery attempt has expired. Start again.");
  const userId = trows[0].user_id;

  const { rows: qrows } = await pool.query(
    `SELECT idx, answer FROM recovery_questions WHERE user_id = $1 ORDER BY idx`,
    [userId]
  );

  let allMatch = qrows.length === 3;
  for (let i = 0; i < qrows.length; i++) {
    const ok = await verifySecret(normalizeAnswer(answers[i]), qrows[i].answer);
    if (!ok) allMatch = false;
  }
  if (!allMatch) {
    // Burn the token on a wrong attempt so it can't be brute-forced.
    await pool.query(`DELETE FROM recovery_tokens WHERE token_hash = $1`, [tokenHash]);
    return fail(res, 401, "One or more answers were incorrect.");
  }

  const passHash = await hashSecret(password);
  await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [passHash, userId]);
  await pool.query(`DELETE FROM recovery_tokens WHERE user_id = $1`, [userId]);
  await destroyAllSessions(userId); // force re-login everywhere

  res.json({ ok: true });
});

// ---- account management (used by the account page) ----

auth.post("/account/password", async (req, res) => {
  const user = await getSessionUser(readCookie(req));
  if (!user) return fail(res, 401, "Not logged in.");

  const { current, password } = req.body || {};
  if (typeof password !== "string" || password.length < 8)
    return fail(res, 400, "New password must be at least 8 characters.");

  const { rows } = await pool.query(`SELECT password FROM users WHERE id = $1`, [user.id]);
  if (!rows[0] || !(await verifySecret(current || "", rows[0].password)))
    return fail(res, 401, "Current password is incorrect.");

  await pool.query(`UPDATE users SET password = $1 WHERE id = $2`,
    [await hashSecret(password), user.id]);
  res.json({ ok: true });
});
