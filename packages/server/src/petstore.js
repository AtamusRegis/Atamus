// Pet Delivery Co. accounts (owner, 2026-11-08: username / password, player data saved on the server). pgStore keeps
// them in Postgres (tables pet_accounts and pet_tokens, made by db.js); memStore keeps them in memory (local tests).
import crypto from "node:crypto";

const newToken = () => crypto.randomBytes(24).toString("hex");

export function pgStore(pool) {
  const ms = (t) => (t === null || t === undefined ? 0 : t === Infinity || String(t) === "infinity" ? Infinity : new Date(t).getTime());
  const row = (r) => (r ? { id: Number(r.id), name: r.name, pass: r.pass, data: r.data, rev: r.rev, role: r.role || "player", vip: !!r.vip, muteUntil: ms(r.mute_until), banUntil: ms(r.ban_until) } : null);
  const ts = (v) => (!v ? null : v === Infinity ? "infinity" : new Date(v).toISOString());
  return {
    async byName(name) { const { rows } = await pool.query("SELECT * FROM pet_accounts WHERE name_lc = $1", [name.toLowerCase()]); return row(rows[0]); },
    async byId(id) { const { rows } = await pool.query("SELECT * FROM pet_accounts WHERE id = $1", [id]); return row(rows[0]); },
    async create(name, pass, data) {
      const { rows } = await pool.query("INSERT INTO pet_accounts (name, name_lc, pass, data) VALUES ($1, $2, $3, $4) ON CONFLICT (name_lc) DO NOTHING RETURNING *", [name, name.toLowerCase(), pass, data]);
      return row(rows[0]);
    },
    async save(id, data, rev) { await pool.query("UPDATE pet_accounts SET data = $2, rev = $3, updated_at = now() WHERE id = $1", [id, data, rev]); },
    async tokenFor(id) { const t = newToken(); await pool.query("INSERT INTO pet_tokens (token, account_id) VALUES ($1, $2)", [t, id]); return t; },
    async tokenAccount(t) { const { rows } = await pool.query("UPDATE pet_tokens SET last_used = now() WHERE token = $1 RETURNING account_id", [String(t)]); return rows[0] ? Number(rows[0].account_id) : null; },
    // (owner, 2026-11-08) staff
    async setRole(id, role) { await pool.query("UPDATE pet_accounts SET role = $2 WHERE id = $1", [id, role]); },
    async setMute(id, until) { await pool.query("UPDATE pet_accounts SET mute_until = $2 WHERE id = $1", [id, ts(until)]); },
    async setBan(id, until) { await pool.query("UPDATE pet_accounts SET ban_until = $2 WHERE id = $1", [id, ts(until)]); },
    async setVip(id, on) { await pool.query("UPDATE pet_accounts SET vip = $2 WHERE id = $1", [id, !!on]); },
    async search(q) { const { rows } = await pool.query("SELECT * FROM pet_accounts WHERE name_lc LIKE $1 ORDER BY name_lc LIMIT 30", [String(q).toLowerCase().replace(/[%_\\]/g, "\\$&") + "%"]); return rows.map(row); },
    async log(by, target, action, detail) { await pool.query("INSERT INTO pet_admin_log (by_name, target_name, action, detail) VALUES ($1, $2, $3, $4)", [by, target, action, detail || null]); },
  };
}

export function memStore() {
  const accts = new Map(), tokens = new Map(); let next = 1;
  return {
    async byName(name) { for (const a of accts.values()) if (a.name.toLowerCase() === name.toLowerCase()) return { ...a }; return null; },
    async byId(id) { const a = accts.get(id); return a ? { ...a } : null; },
    async create(name, pass, data) { if (await this.byName(name)) return null; const a = { id: next++, name, pass, data, rev: 0, role: "player", muteUntil: 0, banUntil: 0 }; accts.set(a.id, a); return { ...a }; },
    async save(id, data, rev) { const a = accts.get(id); if (a) { a.data = data; a.rev = rev; } },
    async tokenFor(id) { const t = newToken(); tokens.set(t, id); return t; },
    async tokenAccount(t) { return tokens.get(String(t)) || null; },
    async setRole(id, role) { const a = accts.get(id); if (a) a.role = role; },
    async setMute(id, until) { const a = accts.get(id); if (a) a.muteUntil = until || 0; },
    async setBan(id, until) { const a = accts.get(id); if (a) a.banUntil = until || 0; },
    async setVip(id, on) { const a = accts.get(id); if (a) a.vip = !!on; },
    async search(q) { q = String(q).toLowerCase(); return [...accts.values()].filter((a) => a.name.toLowerCase().startsWith(q)).slice(0, 30).map((a) => ({ ...a })); },
    async log() {},
  };
}
