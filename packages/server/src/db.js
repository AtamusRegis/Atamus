import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

/**
 * Create the tables the game uses if they don't exist. Safe to run on every startup.
 * Usernames are stored as typed but uniqueness is enforced case-insensitively.
 * (owner, 2026-10-13) Only what's in use is declared here now. The 2D game's tables (pilots, systems, instances, reports,
 * tickets, logins, suspicion, the ledger, staff notes and the rest) and their columns stay in the database untouched,
 * for reference; no code reads or writes them. The 3D world's own table (world3d) is made by game/world3d.js.
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
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS eula_version TEXT;   -- (owner) the EULA version agreed to, and when
    ALTER TABLE users ADD COLUMN IF NOT EXISTS eula_at TIMESTAMPTZ;
    -- (owner) staff: 'head' (Nyssary), 'admin', 'mod'
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;
    -- (owner) bans (permanent, or until a time) with the reason the player sees at login; mutes (no chat); Freeze (kept: a
    -- frozen account can't enter); a lock (unlocked with the recovery questions); the admin name column names can't take
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_perm BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_perm BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_block_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_reset_at TIMESTAMPTZ;
    UPDATE users SET role = 'head' WHERE lower(username) = 'nyssary' AND role IS DISTINCT FROM 'head';   -- (owner) Nyssary is the Head Admin

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
    -- (owner) Remember Password: a token for one browser (never the password itself)
    CREATE TABLE IF NOT EXISTS remember_tokens (
      token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, device TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), used_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- (owner) the admin log: every kick, ban, mute and appeal decision, with its reason
    CREATE TABLE IF NOT EXISTS admin_log (
      id          BIGSERIAL PRIMARY KEY,
      at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      admin_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
      admin_name  TEXT NOT NULL,
      target_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
      target_name TEXT NOT NULL,
      action      TEXT NOT NULL,
      reason      TEXT NOT NULL DEFAULT '',
      detail      JSONB
    );
    -- (owner) a banned player's appeals: a conversation with the admins while the ban lasts
    CREATE TABLE IF NOT EXISTS appeals (
      id          BIGSERIAL PRIMARY KEY,
      user_id     BIGINT REFERENCES users(id) ON DELETE CASCADE,
      username    TEXT NOT NULL,
      ban_reason  TEXT NOT NULL DEFAULT '',
      text        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',      -- open | accepted | denied
      admin_name  TEXT,
      response    TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      handled_at  TIMESTAMPTZ
    );
    ALTER TABLE appeals ADD COLUMN IF NOT EXISTS admin_id BIGINT;
    CREATE TABLE IF NOT EXISTS appeal_messages (
      id          BIGSERIAL PRIMARY KEY,
      appeal_id   BIGINT NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
      at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      from_admin  BOOLEAN NOT NULL DEFAULT false,
      name        TEXT NOT NULL,
      text        TEXT NOT NULL
    );
    ALTER TABLE appeal_messages ADD COLUMN IF NOT EXISTS admin_id BIGINT;
    CREATE INDEX IF NOT EXISTS appeal_messages_appeal_idx ON appeal_messages (appeal_id);

    -- (owner) names no one can take (names.js), and words added to the name filter
    CREATE TABLE IF NOT EXISTS banned_names (
      name_lower  TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      kind        TEXT NOT NULL,
      admin_name  TEXT NOT NULL,
      reason      TEXT NOT NULL DEFAULT '',
      at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE banned_names ADD COLUMN IF NOT EXISTS name_key TEXT;
    CREATE INDEX IF NOT EXISTS banned_names_key_idx ON banned_names (name_key);
    CREATE TABLE IF NOT EXISTS filter_words (
      id            BIGSERIAL PRIMARY KEY,
      word          TEXT NOT NULL,
      cat           TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      requested_by  BIGINT,
      requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      asked_cat     TEXT NOT NULL,
      decided_by    BIGINT,
      decided_at    TIMESTAMPTZ
    );
    -- (owner) player reports (net.js), read in the admin panel: the reported player's recent chat goes with each
    CREATE TABLE IF NOT EXISTS reports (
      id          BIGSERIAL PRIMARY KEY,
      reporter    BIGINT REFERENCES users(id) ON DELETE SET NULL,
      target      BIGINT REFERENCES users(id) ON DELETE SET NULL,
      target_name TEXT NOT NULL,
      category    TEXT NOT NULL,
      text        TEXT NOT NULL,
      context     TEXT,
      status      TEXT NOT NULL DEFAULT 'open',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS chat JSONB;
    -- (owner, 2026-10-13) each kick, mute and ban, for the totals in the admin panel: a mute / ban runs from at until
    -- until (NULL: indefinite) or until lifted (ended), whichever is first
    CREATE TABLE IF NOT EXISTS discipline (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT now(), until TIMESTAMPTZ, ended TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS discipline_user_idx ON discipline (user_id, kind);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now());
    -- (owner, 2026-10-14) a moderator's mute / ban longer than 3 days (7 days, indefinite) waits here for Nyssary
    CREATE TABLE IF NOT EXISTS approvals (
      id BIGSERIAL PRIMARY KEY, mod_id BIGINT, mod_name TEXT NOT NULL, target_id BIGINT NOT NULL, target_name TEXT NOT NULL,
      kind TEXT NOT NULL, reason TEXT NOT NULL, minutes INTEGER, note TEXT, status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_by TEXT, decided_at TIMESTAMPTZ
    );
  `);
}

/** Delete expired sessions and recovery tokens. Called periodically. */
export async function cleanupExpired() {
  await pool.query(`DELETE FROM sessions WHERE expires_at < now()`);
  await pool.query(`DELETE FROM recovery_tokens WHERE expires_at < now()`);
}
