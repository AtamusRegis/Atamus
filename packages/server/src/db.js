import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

/**
 * Create the game's tables if they don't exist. Safe to run on every startup.
 * (owner, 2026-11-08) Only the game's tables are declared here. Tables from the older Atamus prototypes stay in
 * the live database untouched (nothing reads or writes them); a new server simply never has them.
 */
export async function migrate() {
  await pool.query(`
    -- (owner, 2026-11-08) accounts: username / password; data is the old game's (Pet Delivery Co.), kept untouched
    CREATE TABLE IF NOT EXISTS pet_accounts (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, name_lc TEXT NOT NULL UNIQUE, pass TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}', rev INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- (owner, 2026-11-08) staff roles (player / moderator / admin), mutes and bans (until; 'infinity' for ever)
    ALTER TABLE pet_accounts ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player';
    ALTER TABLE pet_accounts ADD COLUMN IF NOT EXISTS mute_until TIMESTAMPTZ;
    ALTER TABLE pet_accounts ADD COLUMN IF NOT EXISTS ban_until TIMESTAMPTZ;
    ALTER TABLE pet_accounts ADD COLUMN IF NOT EXISTS vip BOOLEAN NOT NULL DEFAULT false;   -- (owner, 2026-11-08) VIP plots
    CREATE TABLE IF NOT EXISTS pet_admin_log (
      id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), by_name TEXT NOT NULL, target_name TEXT NOT NULL,
      action TEXT NOT NULL, detail TEXT
    );
    -- (owner, 2026-11-11) Critter Courier: the game remade, everyone starting fresh. A courier's data lives in its own
    -- column; the old game's data column (and the pet_world table) stay in the live database untouched, unused.
    ALTER TABLE pet_accounts ADD COLUMN IF NOT EXISTS courier JSONB NOT NULL DEFAULT '{}';
    -- (owner, 2026-11-11) Pet Delivery Co. back at atamus.io/pokemon, everyone starting fresh there too: its player data
    -- and staff's block world have their own column and table (the old data column and pet_world stay untouched)
    ALTER TABLE pet_accounts ADD COLUMN IF NOT EXISTS poke JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE pet_accounts ADD COLUMN IF NOT EXISTS poke_rev INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS poke_world (
      id INT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- (owner, 2026-11-13) Critter Courier's town, placed by admins with the zone builder
    CREATE TABLE IF NOT EXISTS pet_build (
      id INT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS pet_tokens (
      token TEXT PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES pet_accounts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_used TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
