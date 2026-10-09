import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

/**
 * Create tables if they don't exist. Safe to run on every startup.
 * Usernames are stored as typed but uniqueness is enforced case-insensitively.
 */
export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          BIGSERIAL PRIMARY KEY,
      username    TEXT NOT NULL,
      password    TEXT NOT NULL,            -- scrypt hash, see hash.js
      email       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
      ON users (lower(username));

    CREATE TABLE IF NOT EXISTS recovery_questions (
      user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idx         SMALLINT NOT NULL,        -- 0, 1, 2
      question    TEXT NOT NULL,            -- shown to the user, stored in clear
      answer      TEXT NOT NULL,            -- scrypt hash of the normalized answer
      PRIMARY KEY (user_id, idx)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash  TEXT PRIMARY KEY,         -- sha256 of the cookie value
      user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

    CREATE TABLE IF NOT EXISTS recovery_tokens (
      token_hash  TEXT PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pilots (
      id          BIGSERIAL PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      data        JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS pilots_user_idx ON pilots (user_id);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS credits BIGINT NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS systems (
      user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data        JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- shared asteroid instances (their rock fields); they survive restarts and go when mined out
    CREATE TABLE IF NOT EXISTS instances (
      id          TEXT PRIMARY KEY,
      data        JSONB NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/**
 * One-time wipes, run at startup before the game loads. Each tag runs once ever (recorded in the meta table).
 * A wipe keeps accounts (logins, sessions, recovery) and removes every pilot, system (ships, items, cans,
 * licenses unlocked) and credit, so everyone starts over as a new player.
 */
const WIPES = ["2026-10-09 quick-training reset"];
export async function runWipes() {
  await pool.query(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  for (const tag of WIPES) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const { rowCount } = await c.query(`INSERT INTO meta (key, value) VALUES ($1, 'done') ON CONFLICT (key) DO NOTHING`, ["wipe:" + tag]);
      if (!rowCount) { await c.query("ROLLBACK"); continue; }          // already ran
      const p = await c.query(`DELETE FROM pilots`), s = await c.query(`DELETE FROM systems`);
      await c.query(`UPDATE users SET credits = 0`);
      await c.query("COMMIT");
      console.log(`[wipe] ${tag}: ${p.rowCount} pilots, ${s.rowCount} systems removed, credits reset`);
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
    finally { c.release(); }
  }
}

/** Delete expired sessions and recovery tokens. Called periodically. */
export async function cleanupExpired() {
  await pool.query(`DELETE FROM sessions WHERE expires_at < now()`);
  await pool.query(`DELETE FROM recovery_tokens WHERE expires_at < now()`);
}
