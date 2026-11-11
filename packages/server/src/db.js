import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

/**
 * Create Pet Delivery Co.'s tables if they don't exist. Safe to run on every startup.
 * (owner, 2026-11-08) Only Pet Delivery Co.'s tables are declared here. Tables from the older Atamus prototypes stay in
 * the live database untouched (nothing reads or writes them); a new server simply never has them.
 */
export async function migrate() {
  await pool.query(`
    -- (owner, 2026-11-08) Pet Delivery Co. accounts: username / password, the player's data (pets, coins, home) as JSON
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
    CREATE TABLE IF NOT EXISTS pet_world (
      id INT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS pet_tokens (
      token TEXT PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES pet_accounts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_used TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
