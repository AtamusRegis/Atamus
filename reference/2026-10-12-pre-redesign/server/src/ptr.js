// PTR: a private test copy of Atamus that only runs in Claude's workspace (scripts/ptr.sh, scripts/ptr-run.mjs).
// Enabled solely by ATAMUS_PTR=1, which the live server never sets. With it on there are
// no accounts or passwords: every request is the single "PTR" tester, and dev commands
// (move, offline, update) are accepted over the game socket.
import { pool } from "./db.js";

export const PTR = process.env.ATAMUS_PTR === "1";

let tester = null;
export async function ptrUser() {
  if (!tester) {
    let { rows } = await pool.query(`SELECT id, username, email FROM users WHERE lower(username) = 'ptr'`);
    if (!rows[0]) ({ rows } = await pool.query(`INSERT INTO users (username, password) VALUES ('PTR', '!') RETURNING id, username, email`));
    await pool.query(`UPDATE users SET role = 'head' WHERE id = $1`, [rows[0].id]);   // (the PTR tester starts as the Head Admin, to test the admin panel)
    tester = { ...rows[0], has_recovery: true };
  }
  const { rows } = await pool.query(`SELECT role, frozen, mute_perm, mute_until, mute_reason FROM users WHERE id = $1`, [tester.id]);   // (tests switch it to admin and back)
  return { ...tester, ...(rows[0] || {}), frozen: !!(rows[0] && rows[0].frozen) };
}

/** PTR only: a second test account for the socket (`/ws?as=Name`), to test things between players (admin DMs, Freeze). */
export async function ptrAs(name) {
  if (!PTR || typeof name !== "string" || !/^[A-Za-z0-9_]{3,24}$/.test(name) || name.toLowerCase() === "ptr") return null;
  let { rows } = await pool.query(`SELECT id, username, email, role, frozen, mute_perm, mute_until, mute_reason FROM users WHERE lower(username) = lower($1)`, [name]);
  if (!rows[0]) ({ rows } = await pool.query(`INSERT INTO users (username, password) VALUES ($1, '!') RETURNING id, username, email, role, frozen, mute_perm, mute_until, mute_reason`, [name]));
  return { ...rows[0], has_recovery: true };
}

// Dev commands from the PTR client: Atamus.send({ t: "dev", cmd, ... })
export async function devCommand(world, pid, m) {
  const p = world.players.get(pid); if (!p) return;
  const tell = (text) => p.send(JSON.stringify({ t: "sys", text: "[PTR] " + text }));
  switch (m.cmd) {
    case "move": {                                       // put a ship of yours (m.ship, else the first) at x, y (km), stopped
      const sh = (m.ship && world.ships.get(m.ship) && world.ships.get(m.ship).owner === pid) ? world.ships.get(m.ship) : [...world.ships.values()].find((s) => s.owner === pid), x = +m.x, y = +m.y;
      if (sh && Number.isFinite(x) && Number.isFinite(y)) { Object.assign(sh, { x, y, tx: x, ty: y, vx: 0, vy: 0, moving: false, chase: null, path: null, dest: null, warpReq: false, drift: false, docked: false, dockReq: false, dockSeq: null }); tell("moved"); }
      break;
    }
    case "offline": world.removePlayer(pid); tell("marked offline"); break;
    case "give": {                                       // put items in a ship of yours (m.ship, else the first): m.item, m.n
      const { isItem, holdFor, addItem } = await import("./game/items.js"); const { itemKey } = await import("./game/modules.js");
      const sh = (m.ship && world.ships.get(m.ship) && world.ships.get(m.ship).owner === pid) ? world.ships.get(m.ship) : [...world.ships.values()].find((s) => s.owner === pid && !s.admin);
      const k = itemKey(m.item), n = Number.isFinite(+m.n) && +m.n > 0 ? +m.n : 1;
      if (sh && typeof k === "string" && isItem(k) && sh.holds[holdFor(k)]) { addItem(sh.holds, holdFor(k), k, n); tell("given"); } else tell("no such item");
      break;
    }
    case "give": {                                       // put items in a ship of yours (m.ship, else the first): m.item, m.n
      const { isItem, holdFor, addItem } = await import("./game/items.js"); const { itemKey } = await import("./game/modules.js");
      const sh = (m.ship && world.ships.get(m.ship) && world.ships.get(m.ship).owner === pid) ? world.ships.get(m.ship) : [...world.ships.values()].find((s) => s.owner === pid && !s.admin);
      const k = itemKey(m.item), n = Number.isFinite(+m.n) && +m.n > 0 ? +m.n : 1;
      if (sh && typeof k === "string" && isItem(k) && sh.holds[holdFor(k)]) { addItem(sh.holds, holdFor(k), k, n); tell("given"); } else tell("no such item");
      break;
    }
    case "wreck": {                                      // a wreck with a few things in it, beside your ship (m.ship, else the first in space)
      const sh = [...world.ships.values()].find((s) => s.owner === pid && !s.docked && !s.admin); if (!sh) { tell("no ship in space"); break; }
      world._addWreck(sh.x + 1, sh.y, "Test Wreck", { beam_s1: 1, "ore:ironstone": 20, ammo_beam_std_s1: 3 }, null); tell("wreck"); break;
    }
    // (owner) aggression without weapons: your ship (m.ship, else the first in space) attacks m.victim (a ship id,
    // or no one); pardon clears a flag; killofficer has an ETA ship (m.id, else the nearest) destroyed by your ship
    case "aggress": case "pardon": case "killofficer": {
      const own = (m.ship && world.ships.get(m.ship) && world.ships.get(m.ship).owner === pid) ? world.ships.get(m.ship) : [...world.ships.values()].find((s) => s.owner === pid && !s.docked && !s.admin);
      if (!own) { tell("no ship in space"); break; }
      if (m.cmd === "aggress") tell(world.aggress(own.id, typeof m.victim === "string" ? m.victim : null) ? "flagged" : "not flagged");
      else if (m.cmd === "pardon") tell(world.pardon(own.id) ? "pardoned" : "not flagged");
      else { const o = (typeof m.id === "string" && world.ships.get(m.id)) || world.eta.officers().reduce((b, x) => (!b || Math.hypot(x.x - own.x, x.y - own.y) < Math.hypot(b.x - own.x, b.y - own.y) ? x : b), null);
        if (o && o.npc) { world.eta.officerDown(o.id, own.id); tell("officer down"); } }
      break;
    }
    case "update": {                                     // rehearse a live update on this PTR client
      const ms = Math.max(1000, (+m.seconds || 5) * 1000);
      p.send(JSON.stringify({ t: "countdown", at: Date.now() + ms, in: ms, parts: ["web"] }));
      setTimeout(() => p.send(JSON.stringify({ t: "update", web: "ptr-" + Date.now() })), ms + 4000);   // like live: the new build lands a few seconds after zero
      break;
    }
    default: tell("unknown dev command " + m.cmd);
  }
}
