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
  `);
}

/** Delete expired sessions and recovery tokens. Called periodically. */
export async function cleanupExpired() {
  await pool.query(`DELETE FROM sessions WHERE expires_at < now()`);
  await pool.query(`DELETE FROM recovery_tokens WHERE expires_at < now()`);
}
