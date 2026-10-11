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
    ALTER TABLE users ADD COLUMN IF NOT EXISTS portrait JSONB;   -- the account's character (portraits.js), shown in chat

    CREATE TABLE IF NOT EXISTS systems (
      user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data        JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- shared asteroid instances (their rock fields); they survive restarts and go when mined out
    -- player reports (owner: kept for admin tools to read later)
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

    CREATE TABLE IF NOT EXISTS instances (
      id          TEXT PRIMARY KEY,
      data        JSONB NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- (owner) admins: role 'head' (the Head Admin) or 'admin'; bans (a permanent one, or until a time) with the reason
    -- the player sees at login; a corporation (NULL: the starting one); and the admin log of every kick, ban and change
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS corp TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_perm BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT false;   -- (owner) frozen by an admin
    ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_at TIMESTAMPTZ;
    -- (owner) muted: no chat (permanent, or until a time)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_perm BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_at TIMESTAMPTZ;
    -- (owner) a banned player's appeals (one open at a time), answered from the admin panel
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
    -- (owner) an appeal is a conversation while the ban lasts: the player and every admin, each line kept; admins
    -- subscribe to be told of new lines. A ban allows 3 appeals; after that an admin can set "no new appeals" for a
    -- time (appeal_block_until), after which the count starts again (appeal_reset_at)
    CREATE TABLE IF NOT EXISTS appeal_messages (
      id          BIGSERIAL PRIMARY KEY,
      appeal_id   BIGINT NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
      at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      from_admin  BOOLEAN NOT NULL DEFAULT false,
      name        TEXT NOT NULL,
      text        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS appeal_messages_appeal_idx ON appeal_messages (appeal_id);
    INSERT INTO appeal_messages (appeal_id, at, from_admin, name, text)
      SELECT a.id, a.created_at, false, a.username, a.text FROM appeals a WHERE NOT EXISTS (SELECT 1 FROM appeal_messages m WHERE m.appeal_id = a.id);
    CREATE TABLE IF NOT EXISTS appeal_subs (
      appeal_id   BIGINT NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
      admin_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (appeal_id, admin_id)
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_block_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_reset_at TIMESTAMPTZ;

    -- (owner) Ban Name: the name goes on this list (no one can take it again) and its owner must pick a new one
    CREATE TABLE IF NOT EXISTS banned_names (
      name_lower  TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      kind        TEXT NOT NULL,                     -- player | pilot
      admin_name  TEXT NOT NULL,
      reason      TEXT NOT NULL DEFAULT '',
      at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS rename_required BOOLEAN NOT NULL DEFAULT false;
    -- (owner) Local / Corp lines the name filter flags (namefilter.js), for admins to glance at; never DMs
    CREATE TABLE IF NOT EXISTS chat_flags (
      id          BIGSERIAL PRIMARY KEY,
      at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
      username    TEXT NOT NULL,
      channel     TEXT NOT NULL,
      text        TEXT NOT NULL,
      cats        TEXT[] NOT NULL,
      words       TEXT[] NOT NULL
    );
    -- (owner) Freeze belongs to an admin's DM with the player: who froze them, and the open admin DMs (kept across restarts)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_by BIGINT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS chat JSONB;     -- (owner) the last hour of chat, saved with the report
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS ships JSONB;    -- (owner) and the player's pilots' ship names then
    CREATE TABLE IF NOT EXISTS admin_dms (
      player_id   BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      admin_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admin_name  TEXT NOT NULL,
      player_name TEXT NOT NULL,
      log         JSONB NOT NULL DEFAULT '[]'::jsonb,
      frozen      BOOLEAN NOT NULL DEFAULT false
    );
    -- (owner) admins speak and act under an admin name and picture of their own (so they can play unknown); the key
    -- (random) is how clients know which admin a line is from, so a renamed admin's old lines show the new name
    ALTER TABLE users ADD COLUMN IF NOT EXISTS rename_reason TEXT;   
    ALTER TABLE banned_names ADD COLUMN IF NOT EXISTS name_key TEXT;   -- (owner) the name as the filter reads it (leet spellings match)
    CREATE INDEX IF NOT EXISTS banned_names_key_idx ON banned_names (name_key);
    -- (owner) words an admin asked to add to the filter, in a category; the Head Admin approves (maybe in another category) or denies
    CREATE TABLE IF NOT EXISTS filter_words (
      id            BIGSERIAL PRIMARY KEY,
      word          TEXT NOT NULL,
      cat           TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | denied
      requested_by  BIGINT,
      requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      asked_cat     TEXT NOT NULL,
      decided_by    BIGINT,
      decided_at    TIMESTAMPTZ
    );
    -- (owner) players' mutes and blocks (relations.js); admin_id: set by an admin (on both players' lists, appeal only)
    CREATE TABLE IF NOT EXISTS player_relations (
      owner_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      other_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind      TEXT NOT NULL,                       -- mute | block
      admin_id  BIGINT,
      at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (owner_id, other_id, kind)
    );
    -- (owner) appeals of an admin-set mute / block (relappeals.js): both players and the admins; a message each, more when given
    CREATE TABLE IF NOT EXISTS rel_appeals (
      id BIGSERIAL PRIMARY KEY, a_id BIGINT NOT NULL, b_id BIGINT NOT NULL, kind TEXT NOT NULL, opened_by BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open', admin_id BIGINT, response TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS rel_appeal_messages (
      id BIGSERIAL PRIMARY KEY, appeal_id BIGINT NOT NULL REFERENCES rel_appeals(id) ON DELETE CASCADE, at TIMESTAMPTZ NOT NULL DEFAULT now(),
      from_admin BOOLEAN NOT NULL DEFAULT false, user_id BIGINT, admin_id BIGINT, name TEXT NOT NULL, text TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rel_appeal_turns (
      appeal_id BIGINT NOT NULL REFERENCES rel_appeals(id) ON DELETE CASCADE, user_id BIGINT NOT NULL, left_n INT NOT NULL DEFAULT 0,
      PRIMARY KEY (appeal_id, user_id)
    );
    -- (owner) support tickets (tickets.js): subject, category, then a conversation with the admins
    CREATE TABLE IF NOT EXISTS tickets (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, username TEXT NOT NULL, subject TEXT NOT NULL,
      category TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed_by BIGINT, closed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id BIGSERIAL PRIMARY KEY, ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, at TIMESTAMPTZ NOT NULL DEFAULT now(),
      from_admin BOOLEAN NOT NULL DEFAULT false, admin_id BIGINT, name TEXT NOT NULL, text TEXT NOT NULL
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS eula_version TEXT;   -- (owner) the EULA version agreed to, and when
    ALTER TABLE users ADD COLUMN IF NOT EXISTS eula_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS name_offer TEXT;   -- (owner) a banned name allowed again: offered back (revert or keep)
    ALTER TABLE banned_names ADD COLUMN IF NOT EXISTS owner_id BIGINT;
    ALTER TABLE banned_names ADD COLUMN IF NOT EXISTS pilot_id BIGINT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lang_heat REAL NOT NULL DEFAULT 0;   -- (owner) language heat (language.js)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lang_heat_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lang_alert_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS chat_flags_user_idx ON chat_flags (user_id, id DESC);   -- (owner) the player sees why they must rename
    ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_pic SMALLINT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS users_admin_name_idx ON users (lower(admin_name));
    ALTER TABLE appeal_messages ADD COLUMN IF NOT EXISTS admin_id BIGINT;
    ALTER TABLE appeals ADD COLUMN IF NOT EXISTS admin_id BIGINT;
    ALTER TABLE banned_names ADD COLUMN IF NOT EXISTS admin_id BIGINT;
    -- (owner) Nyssary is a Head Admin (and the only one who makes Head Admins); staff: Head Admins and Moderators ('admin')
    ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_pw_hash TEXT;   -- (owner) a staff member's own panel password (scrypt)
    -- (owner) password reset appeals (resets.js): a temporary password to follow the request with; the Head Admin decides
    CREATE TABLE IF NOT EXISTS reset_requests (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, username TEXT NOT NULL, temp_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed_by BIGINT, closed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS reset_messages (
      id BIGSERIAL PRIMARY KEY, request_id BIGINT NOT NULL REFERENCES reset_requests(id) ON DELETE CASCADE, at TIMESTAMPTZ NOT NULL DEFAULT now(),
      from_admin BOOLEAN NOT NULL DEFAULT false, admin_id BIGINT, name TEXT NOT NULL, text TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_rooms (id TEXT PRIMARY KEY, data JSONB NOT NULL);   -- (owner) staff DM rooms (several people)
    -- (owner) what a Moderator did (mute, timed ban, mute / block between players), for the Admins to review
    CREATE TABLE IF NOT EXISTS mod_reviews (
      id BIGSERIAL PRIMARY KEY, mod_id BIGINT, target_id BIGINT, target_name TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL,
      detail JSONB, status TEXT NOT NULL DEFAULT 'open', at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_by BIGINT, reviewed_at TIMESTAMPTZ
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_from TEXT;      -- (the role they had before it: declining goes back to it)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_pending TEXT;   -- (owner) a promotion not yet accepted: its role has no powers until then
    -- (owner, 2026-10-11) three tiers: 'head' (Nyssary only), 'admin' (Admins), 'mod' (Moderators); once: the old 'admin'
    -- (regular admins, now Moderators) becomes 'mod' and any other Head Admin becomes an Admin
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now());
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM meta WHERE key = 'roles:3tier') THEN
        UPDATE users SET role = 'mod' WHERE role = 'admin';
        UPDATE users SET role = 'admin' WHERE role = 'head' AND lower(username) NOT IN ('nyssary', 'ptr');
        INSERT INTO meta (key, value) VALUES ('roles:3tier', 'done');
      END IF;
    END $$;
    -- (owner, 2026-10-11) once: the old Nyssary account (its login stopped working) is set aside as Nyssary_old_<id> (no role,
    -- admin profile, admin password or sessions; its history stays) so the owner can sign up again as Nyssary
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM meta WHERE key = 'reset:nyssary:1') THEN
        DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE lower(username) = 'nyssary');
        UPDATE users SET username = 'Nyssary_old_' || id, role = NULL, admin_name = NULL, admin_pic = NULL, admin_pw_hash = NULL WHERE lower(username) = 'nyssary';
        INSERT INTO meta (key, value) VALUES ('reset:nyssary:1', 'done');
      END IF;
    END $$;
    UPDATE users SET role = 'admin' WHERE role = 'head' AND lower(username) NOT IN ('nyssary', 'ptr');   -- the Head Admin is Nyssary alone (the PTR tester stands in)
    UPDATE users SET role = 'head' WHERE lower(username) = 'nyssary' AND role IS DISTINCT FROM 'head';
    -- (owner) a Moderator's abilities suspended for 24 hours by another staff member, with a reason; Head Admins are told
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mod_suspended_until TIMESTAMPTZ;
    -- (owner) staff notifications kept for when they're away, the Admin chat, and when each last opened each admin tab
    CREATE TABLE IF NOT EXISTS staff_notes (
      id BIGSERIAL PRIMARY KEY, admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, at TIMESTAMPTZ NOT NULL DEFAULT now(),
      kind TEXT NOT NULL, text TEXT NOT NULL, ref JSONB, read BOOLEAN NOT NULL DEFAULT false
    );
    CREATE INDEX IF NOT EXISTS staff_notes_admin_idx ON staff_notes (admin_id, id DESC);
    CREATE TABLE IF NOT EXISTS staff_chat (id BIGSERIAL PRIMARY KEY, admin_id BIGINT, at TIMESTAMPTZ NOT NULL DEFAULT now(), text TEXT NOT NULL);
    ALTER TABLE staff_chat ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'admin';   -- (owner) 'admin' (Admins) or 'mod' (Moderators, read by Admins)
    CREATE TABLE IF NOT EXISTS staff_seen (admin_id BIGINT NOT NULL, tab TEXT NOT NULL, at TIMESTAMPTZ NOT NULL, PRIMARY KEY (admin_id, tab));
    CREATE TABLE IF NOT EXISTS mod_suspensions (
      id BIGSERIAL PRIMARY KEY, mod_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, by_id BIGINT, reason TEXT NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT now(), until TIMESTAMPTZ NOT NULL, lifted_by BIGINT, lifted_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS mod_susp_seen (susp_id BIGINT NOT NULL REFERENCES mod_suspensions(id) ON DELETE CASCADE, admin_id BIGINT NOT NULL, PRIMARY KEY (susp_id, admin_id));   -- (owner) a staff member's own panel password (scrypt)
    -- (owner) security (security.js): each login (where from, which device), accounts locked on suspected sharing or
    -- compromise, and timeouts for clients sending malformed messages
    CREATE TABLE IF NOT EXISTS logins (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ip TEXT, device TEXT, tz TEXT, city TEXT, country TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION, vpn BOOLEAN NOT NULL DEFAULT false, result TEXT NOT NULL DEFAULT 'ok'
    );
    CREATE INDEX IF NOT EXISTS logins_user_idx ON logins (user_id, id DESC);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS timeouts (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, device TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now(),
      until TIMESTAMPTZ NOT NULL, reason TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS timeouts_user_idx ON timeouts (user_id, until DESC);
    CREATE INDEX IF NOT EXISTS timeouts_device_idx ON timeouts (device, until DESC);
    -- (owner) suspicion (suspicion.js): red flags adding up to notifications and a login hold
    CREATE TABLE IF NOT EXISTS suspicion (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, at TIMESTAMPTZ NOT NULL DEFAULT now(),
      kind TEXT NOT NULL, points REAL NOT NULL, text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS suspicion_user_idx ON suspicion (user_id, id DESC);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS susp_level INT NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS login_hold_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_device TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ip TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_vpn BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS play_seconds BIGINT NOT NULL DEFAULT 0;
    -- (owner) who gave what to whom (watch.js): trades, jettisoned cans picked up, kills and their loot
    CREATE TABLE IF NOT EXISTS ledger (
      id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), from_id BIGINT REFERENCES users(id) ON DELETE CASCADE, to_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, credits BIGINT NOT NULL DEFAULT 0, value BIGINT NOT NULL DEFAULT 0, items JSONB
    );
    CREATE INDEX IF NOT EXISTS ledger_from_idx ON ledger (from_id, at DESC);
    CREATE INDEX IF NOT EXISTS ledger_to_idx ON ledger (to_id, at DESC);
    -- (owner) players who have talked (a DM either way), for "credits from someone they never talked to"
    CREATE TABLE IF NOT EXISTS contacts (a_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, b_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (a_id, b_id));
    -- (owner) Remember Password: a token for one browser (never the password itself)
    CREATE TABLE IF NOT EXISTS remember_tokens (
      token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, device TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), used_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- (owner) a Moderator escalates a report, ticket or appeal to the Admins
    CREATE TABLE IF NOT EXISTS escalations (
      id BIGSERIAL PRIMARY KEY, kind TEXT NOT NULL, ref_id BIGINT NOT NULL, by_id BIGINT, reason TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS escalations_ref_idx ON escalations (kind, ref_id);
    -- (owner) automatic language mutes: a step a day, and whether the current mute is the game's
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lang_mute_step INT NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lang_mute_day TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_auto BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE mod_suspensions ADD COLUMN IF NOT EXISTS end_told BOOLEAN NOT NULL DEFAULT true;   -- (earlier ones count as told)
    ALTER TABLE mod_suspensions ALTER COLUMN end_told SET DEFAULT false;
    -- (owner) staff activity: 90 days without any turns an Admin into a Moderator, then a Moderator into a player; one
    -- who lapsed keeps the Admin button to ask the Head Admin to be reinstated
    ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_active_at TIMESTAMPTZ;
    UPDATE users SET staff_active_at = now() WHERE role IS NOT NULL AND staff_active_at IS NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lapsed_role TEXT;
    CREATE TABLE IF NOT EXISTS reinstatements (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL, reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open', at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_by BIGINT, decided_at TIMESTAMPTZ
    );
  `);
}

/**
 * One-time wipes, run at startup before the game loads. Each tag runs once ever (recorded in the meta table).
 * A wipe keeps accounts (logins, sessions, recovery) and removes every pilot, system (ships, items, cans,
 * licenses unlocked) and credit, so everyone starts over as a new player.
 */
// tag -> what it clears. "full": pilots, systems and credits. "world": ships, hangars, cans and belts only (pilots,
// licenses and credits stay). "pilots": pilots and their ships only (accounts, characters and credits stay).
const WIPES = [["2026-10-09 quick-training reset", "full"], ["2026-10-09 the Expanse", "world"], ["2026-10-10 back to basics", "full"], ["2026-10-10 pilot portraits", "pilots"]];
export async function runWipes() {
  await pool.query(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  for (const [tag, kind] of WIPES) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const { rowCount } = await c.query(`INSERT INTO meta (key, value) VALUES ($1, 'done') ON CONFLICT (key) DO NOTHING`, ["wipe:" + tag]);
      if (!rowCount) { await c.query("ROLLBACK"); continue; }          // already ran
      const p = kind === "full" || kind === "pilots" ? await c.query(`DELETE FROM pilots`) : { rowCount: 0 }, s = await c.query(`DELETE FROM systems`);
      await c.query(`DELETE FROM instances`);
      if (kind === "full") await c.query(`UPDATE users SET credits = 0`);
      await c.query("COMMIT");
      console.log(`[wipe] ${tag}: ${p.rowCount} pilots, ${s.rowCount} systems removed` + (kind === "full" ? ", credits reset" : ""));
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
    finally { c.release(); }
  }
}

/** Delete expired sessions and recovery tokens. Called periodically. */
export async function cleanupExpired() {
  await pool.query(`DELETE FROM sessions WHERE expires_at < now()`);
  await pool.query(`DELETE FROM recovery_tokens WHERE expires_at < now()`);
}
