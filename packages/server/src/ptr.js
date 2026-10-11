// PTR: a private test copy of Atamus that only runs in Claude's workspace (scripts/ptr.sh, scripts/ptr-run.mjs).
// Enabled solely by ATAMUS_PTR=1, which the live server never sets. With it on there are
// no accounts or passwords: every request is the single "PTR" tester, and dev commands
// (move, offline, update) are accepted over the game socket.
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
export async function devCommand(world, pid, m) {
  const p = world.players.get(pid); if (!p) return;
  const tell = (text) => p.send(JSON.stringify({ t: "sys", text: "[PTR] " + text }));
  switch (m.cmd) {
    case "move": {                                       // put a ship of yours (m.ship, else the first) at x, y (km), stopped
      const sh = (m.ship && world.ships.get(m.ship) && world.ships.get(m.ship).owner === pid) ? world.ships.get(m.ship) : [...world.ships.values()].find((s) => s.owner === pid), x = +m.x, y = +m.y;
      if (sh && Number.isFinite(x) && Number.isFinite(y)) { Object.assign(sh, { x, y, tx: x, ty: y, vx: 0, vy: 0, moving: false, chase: null, dest: null, warpReq: false, drift: false }); tell("moved"); }
      break;
    }
    case "offline": world.removePlayer(pid); tell("marked offline"); break;
    case "update": {                                     // rehearse a live update on this PTR client
      const ms = Math.max(1000, (+m.seconds || 5) * 1000);
      p.send(JSON.stringify({ t: "countdown", at: Date.now() + ms, in: ms, parts: ["web"] }));
      setTimeout(() => p.send(JSON.stringify({ t: "update", web: "ptr-" + Date.now() })), ms + 4000);   // like live: the new build lands a few seconds after zero
      break;
    }
    default: tell("unknown dev command " + m.cmd);
  }
}
