// PTR: a private test copy of Atamus that only runs in Claude's workspace (scripts/ptr.sh, scripts/ptr-run.mjs).
// Enabled solely by ATAMUS_PTR=1, which the live server never sets. With it on there are
// no accounts or passwords: every request is the single "PTR" tester, and dev commands
// (credits, licences, ships, items, belts...) are accepted over the game socket.
import { pool } from "./db.js";

export const PTR = process.env.ATAMUS_PTR === "1";

let tester = null;
export async function ptrUser() {
  if (tester) return tester;
  let { rows } = await pool.query(`SELECT id, username, email FROM users WHERE lower(username) = 'ptr'`);
  if (!rows[0]) ({ rows } = await pool.query(`INSERT INTO users (username, password) VALUES ('PTR', '!') RETURNING id, username, email`));
  tester = { ...rows[0], has_recovery: true };
  return tester;
}

// Dev commands from the PTR client: Atamus.send({ t: "dev", cmd, ... })
export async function devCommand(world, pid, m, refresh) {
  const Inv = await import("./game/inventory.js");
  const { forceBelts } = await import("./game/belts.js");
  const p = world.players.get(pid); if (!p) return;
  const tell = (text) => p.send(JSON.stringify({ t: "sys", text: "[PTR] " + text }));
  switch (m.cmd) {
    case "credits": {
      const n = Math.max(0, Math.floor(+m.amount || 0));
      await pool.query(`UPDATE users SET credits = $1 WHERE id = $2`, [n, pid]); p.credits = n; p.invDirty = true; tell("credits = " + n); break;
    }
    case "license": {                                  // every pilot gets this licence at this level
      const lvl = Math.max(0, Math.min(5, +m.level || 0));
      const { rows } = await pool.query(`SELECT id, data FROM pilots WHERE user_id = $1`, [pid]);
      for (const r of rows) { r.data.licenses[m.key] = lvl; await pool.query(`UPDATE pilots SET data = $1 WHERE id = $2`, [r.data, r.id]); }
      await refresh(); tell(m.key + " = " + lvl); break;
    }
    case "ship": world._buyShip(p, m.type || "chisel"); p.invDirty = true; tell("ship " + (m.type || "chisel") + " docked"); break;
    case "item": { const n = Inv.add(p.hangars[0].inv, m.item, Math.max(1, +m.qty || 1)); p.invDirty = true; tell("+" + n + " " + m.item); break; }
    case "belts": forceBelts(p.beltField, Date.now()); p.send(JSON.stringify({ t: "belts", belts: (await import("./game/belts.js")).fieldBelts(p.beltField) })); tell("all belts spawned"); break;
    case "move": { const sh = world.ships.get(m.ship); if (sh && sh.owner === pid) { sh.docked = false; sh.x = +m.x; sh.y = +m.y; sh.tx = sh.x; sh.ty = sh.y; sh.moving = false; tell("moved"); } break; }
    case "update": {                                     // rehearse a live update on this PTR client
      const ms = Math.max(1000, (+m.seconds || 5) * 1000);
      p.send(JSON.stringify({ t: "countdown", at: Date.now() + ms, in: ms, parts: ["web"] }));
      setTimeout(() => p.send(JSON.stringify({ t: "update", web: "ptr-" + Date.now() })), ms + 4000);   // like live: the new build lands a few seconds after zero
      break;
    }
    default: tell("unknown dev command " + m.cmd);
  }
}
