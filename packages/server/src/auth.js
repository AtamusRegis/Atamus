import crypto from "node:crypto";
import { checkNewAccount } from "./watch.js";
import express from "express";
import { pool } from "./db.js";
import { config } from "./config.js";
import { hashSecret, verifySecret, normalizeAnswer } from "./hash.js";
import {
  createSession, destroySession, destroyAllSessions, getSessionUser,
  readCookie, setSessionCookie, clearSessionCookie,
} from "./sessions.js";
import { allow } from "./ratelimit.js";
import { PTR } from "./ptr.js";
import { checkName } from "./names.js";
import { appealToken, tokenUser, appealState, playerWrite } from "./appeals.js";
import { gameHook } from "./admin.js";
import * as sec from "./security.js";
import { HOLD_TEXT } from "./suspicion.js";

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

// (owner) the End User License Agreement (website/eula.html): agreed to at sign-up; the version agreed is kept
export const EULA_VERSION = "2026-10-11";
auth.post("/signup", async (req, res) => {
  if (!PTR && !allow("signup", clientIp(req), 10, 60 * 60_000))   // (the PTR's tests sign up test accounts)
    return fail(res, 429, "Too many sign-ups from this address. Try again later.");

  const { username, password, email, recovery, eula } = req.body || {};
  if (eula !== true) return fail(res, 400, "Agree to the End User License Agreement to create an account.");   // (owner)

  if (!USERNAME_RE.test(username || ""))
    return fail(res, 400, "Username must be 3–24 characters: letters, numbers and underscores.");
  { const np = await checkName(username); if (np) return fail(res, 400, np); }   // (owner) the name filter and banned names
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
        `INSERT INTO users (username, password, email, eula_version, eula_at, role) VALUES ($1, $2, $3, $4, now(), $5) RETURNING id`,
        [username, passHash, email || null, EULA_VERSION, username.toLowerCase() === "nyssary" ? "head" : null]   // (owner) Nyssary is the Head Admin from the start
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

    { const b = req.body || {}; await sec.checkLogin({ id: userId, username }, clientIp(req), sec.deviceOf(b.device), sec.tzOf(b.tz)).catch((e) => console.error("signup login", e));
      await checkNewAccount(userId, sec.deviceOf(b.device), clientIp(req), false).catch((e) => console.error("signup watch", e)); }   // (owner) several new accounts from one device or address   // (the first login's place and device)
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
  // (owner) a broad cap per address only (many players can share a VPN's); failed logins back off per account and device
  if (!PTR && !allow("login", ip, 120, 15 * 60_000))   // (the PTR's test suite logs in test accounts many times)
    return fail(res, 429, "Too many attempts. Please wait a few minutes.");

  const { username, password } = req.body || {}, remembered = (req.body || {}).token;
  const device = sec.deviceOf((req.body || {}).device), tz = sec.tzOf((req.body || {}).tz);
  // (owner) Remember Password: the browser keeps a token for this account and device, never the password
  const byToken = typeof remembered === "string" && remembered.length >= 20 && remembered.length <= 100 && !!device;
  if (typeof username !== "string" || !username || username.length > 40 || (!byToken && (typeof password !== "string" || !password || password.length > 200))) return fail(res, 400, "Enter your username and password.");
  { const wait = await sec.loginWait(username, device, ip); if (wait) return fail(res, 429, "Too many failed logins. Try again in " + wait + (wait === 1 ? " minute." : " minutes.")); }

  const { rows } = await pool.query(
    `SELECT id, username, password, email, ban_perm, ban_until, ban_reason, ban_at, locked_reason, login_hold_until,
            EXISTS(SELECT 1 FROM recovery_questions rq WHERE rq.user_id = users.id) AS has_recovery
       FROM users WHERE lower(username) = lower($1)`,
    [username]
  );
  const user = rows[0];
  // Verify even when the user is missing, to keep timing roughly constant.
  const ok = byToken ? !!user && await rememberOk(user.id, device, remembered)
    : user ? await verifySecret(password, user.password)
    : await verifySecret(password, "scrypt$16384$8$1$00$00");
  if (byToken && !ok) { sec.loginFailed(username, device, ip); return res.status(401).json({ error: "Enter your password.", forget: true }); }

  if (!user || !ok) {
    sec.loginFailed(username, device, ip); if (user) sec.recordFailed(user.id, ip, device, tz).catch((e) => console.error("login record", e));
    return fail(res, 401, "Incorrect username or password.");
  }
  sec.loginSucceeded(username, device, ip);
  // (owner) a banned player is told why (and until when) at login, and where their appeal stands
  if (isBanned(user))
    return res.status(403).json({ error: banText(user), ban: { perm: !!user.ban_perm, until: user.ban_until, reason: user.ban_reason || "" }, appeal: forPlayer(await appealState(user.id)), appealToken: appealToken(user.id) });

  // (owner) a locked account (suspected sharing or compromise), and where this login comes from
  if (user.locked_reason) return res.status(403).json({ error: sec.LOCK_TEXT, locked: true });
  if (user.login_hold_until && new Date(user.login_hold_until) > new Date()) return res.status(403).json({ error: HOLD_TEXT(user.login_hold_until), hold: true });   // (owner) suspicion: logins on hold
  if (device && gameHook("deviceBusy", device, String(user.id))) return fail(res, 409, "Another account is playing on this device.");   // (owner) one account per device
  if ((await sec.checkLogin(user, ip, device, tz)).locked) return res.status(403).json({ error: sec.LOCK_TEXT, locked: true });

  const { token, expires } = await createSession(user.id);
  setSessionCookie(res, token, expires);
  let rem = null;
  if (device && (req.body || {}).remember === true) rem = byToken ? remembered : await rememberNew(user.id, device);
  else if (byToken) await forget(remembered);
  res.json({ ...publicUser(user), ...(rem ? { remember: rem } : {}) });
});
// (owner) Remember Password tokens: one per account and browser, 30 days from last use; a new password, a recovery or a
// lock revokes them all
const tokHash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
async function rememberOk(uid, device, t) {
  const { rows } = await pool.query(`UPDATE remember_tokens SET used_at = now() WHERE token_hash = $1 AND user_id = $2 AND device = $3 AND used_at > now() - interval '30 days' RETURNING 1`, [tokHash(t), uid, device]);
  return !!rows[0];
}
async function rememberNew(uid, device) {
  await pool.query(`DELETE FROM remember_tokens WHERE user_id = $1 AND device = $2`, [uid, device]);
  const t = crypto.randomBytes(32).toString("base64url");
  await pool.query(`INSERT INTO remember_tokens (token_hash, user_id, device) VALUES ($1, $2, $3)`, [tokHash(t), uid, device]); return t;
}
const forget = (t) => pool.query(`DELETE FROM remember_tokens WHERE token_hash = $1`, [tokHash(t)]);
export const forgetAll = (uid) => pool.query(`DELETE FROM remember_tokens WHERE user_id = $1`, [String(uid)]);
auth.post("/remember/forget", async (req, res) => { const t = (req.body || {}).token; if (typeof t === "string" && t.length <= 100) await forget(t); res.json({ ok: true }); });

// ---- (owner) bans and appeals (appeals.js): a banned player is told why at login and gets a token to write their
// appeal (a conversation with the admins) from the login page ----
const isBanned = (u) => !!(u.ban_perm || (u.ban_until && new Date(u.ban_until) > new Date()));
const banText = (u) => (u.ban_perm ? "This account is permanently banned." : "This account is banned until " + new Date(u.ban_until).toUTCString() + ".") + (u.ban_reason ? " Reason: " + u.ban_reason : "");
const forPlayer = (st) => st && { banned: st.banned, left: st.left, used: st.used, blockedUntil: st.blockedUntil, canNew: st.canNew, current: st.current };
auth.post("/appeal/state", async (req, res) => {
  const uid = tokenUser(req.body && req.body.token); if (!uid) return fail(res, 401, "Log in again to see your appeal.");
  res.json(forPlayer(await appealState(uid)));
});
auth.post("/appeal", async (req, res) => {
  const uid = tokenUser(req.body && req.body.token); if (!uid) return fail(res, 401, "Log in again to write your appeal.");
  if (!PTR && !allow("appeal", uid, 30, 60 * 60_000)) return fail(res, 429, "Too many messages. Try again later.");
  try { await playerWrite(uid, req.body.text); res.json(forPlayer(await appealState(uid))); }
  catch (e) { fail(res, 400, e.message); }
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
  await sec.unlockAccount(userId);   // (owner) the recovery answers unlock a locked account
  await forgetAll(userId);

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
  await forgetAll(user.id);   // (owner) remembered logins end with a new password
  res.json({ ok: true });
});
