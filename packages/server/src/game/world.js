// The Saturn ring-mining world (owner, 2026-10-16: the 2D prototype; design: the "Atamus Ring Mining" design document).
// One shared 2D world: Saturn at the middle, one station beside it, two asteroid rings, a locked line past them, four
// sectors (N, E, S, W) that open as more players come online. Asteroids come from seeds per grid cell and only exist while
// a player is near (or someone has worked on them); clients get each asteroid as its seed and build it themselves
// (ringgen.js). Shards: once all four sectors are open, a zone holds 40 players per copy ("layer"); a ship only meets the
// ships, asteroids and ore of its own layer, and parties stay together. Every crack drops one ore unit carrying the names of everyone who
// helped; when a unit is delivered to the station, every name on it gets a copy. The server decides everything; clients
// send commands (a push, a heading, an aim) and predict their own ship.
import crypto from "node:crypto";
import { pool } from "../db.js";
import * as R from "./rules.js";
import { hash32, rng, genRock } from "./ringgen.js";

const { WORLD: W, SHIP, MODULES } = R;
const now = () => Date.now();
const hyp = Math.hypot;
// ---- seeded randomness: the seeds rotate with a secret only the server knows (so the map can't be learned) ----
const SECRET = process.env.RING_SECRET || crypto.randomBytes(16).toString("hex");
const pickW = (weights, r) => { const keys = Object.keys(weights), tot = keys.reduce((s, k) => s + weights[k], 0); let x = r * tot; for (const k of keys) { x -= weights[k]; if (x <= 0) return k; } return keys[keys.length - 1]; };
// ---- the map ----
export const ringOf = (r) => { for (let i = 0; i < W.rings.length; i++) if (r >= W.rings[i][0] && r <= W.rings[i][1]) return i; return -1; };
export const sectorOf = (x, y) => (((Math.round(Math.atan2(x, -y) / (Math.PI / 2))) % 4) + 4) % 4;   // 0 N, 1 E, 2 S, 3 W
export function zoneOf(x, y) {
  const r = hyp(x, y); if (r < W.safeR) return "Station";
  return "Ring " + (r < (W.rings[0][1] + W.rings[1][0]) / 2 ? 1 : 2) + " · " + R.SECTOR_NAMES[R.SECTORS[sectorOf(x, y)]];
}
const ORE_KEYS = Object.keys(R.ORES);
const unitSpace = (u) => (u.r ? R.REFINED_SPACE : 1);
const holdUsed = (p) => p.hold.reduce((s, u) => s + unitSpace(u), 0);
const storeKey = (o, r) => (r ? o + "+" : o);

export class World {
  constructor() {
    this.players = new Map();                  // account id -> ship
    this.rocks = new Map();                    // asteroid id -> asteroid (only the live ones)
    this.slots = new Map();                    // "layer:cx,cy,slot" -> the asteroid living in that slot (wherever it is now)
    this.cells = new Map();                    // "layer:cx,cy" -> { gen: [], back: [], awake: until }
    this.grid = new Map();                     // asteroids by layer and cell, for lookups
    this.ores = new Map(); this.oreSeq = 1;    // loose ore units
    this.fx = [];                              // effects for nearby players: { k, x, y, ... }
    this.msgs = [];                            // { to: account id | null (everyone), m }
    this.parties = new Map(); this.partySeq = 1; this.invites = new Map();
    this.corps = new Map(); this.corpInvites = new Map();
    this.sectors = R.SECTORS.map((_, i) => ({ open: i === 0, closeAt: 0 }));
    this.offline = new Map();                  // account id -> a promise chain (storage written to offline players)
    this.ready = this._load();
    const t = setInterval(() => this.saveDirty().catch((e) => console.error("ring save", e)), 10_000); t.unref && t.unref();
    const t2 = setInterval(() => this.offlineHolds().catch((e) => console.error("ring transit", e)), 60_000); t2.unref && t2.unref();
  }
  async _load() {
    await pool.query(`CREATE TABLE IF NOT EXISTS ring_players (user_id TEXT PRIMARY KEY, x DOUBLE PRECISION NOT NULL, y DOUBLE PRECISION NOT NULL,
      h DOUBLE PRECISION NOT NULL DEFAULT 0, fuel DOUBLE PRECISION NOT NULL, fuel_from JSONB NOT NULL DEFAULT '{}', module TEXT NOT NULL, modules JSONB NOT NULL,
      credits DOUBLE PRECISION NOT NULL DEFAULT 0, storage JSONB NOT NULL DEFAULT '{}', hold JSONB NOT NULL DEFAULT '[]', queue JSONB NOT NULL DEFAULT '[]',
      corp_id INTEGER, logout_at TIMESTAMPTZ, transit JSONB, transit_due TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ring_corps (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    for (const c of (await pool.query(`SELECT id, name, owner FROM ring_corps`)).rows) this.corps.set(c.id, { id: c.id, name: c.name, owner: c.owner });
  }

  // ---- numbers for a ship: the hull with its module ----
  stats(p) {
    const M = MODULES[p.module] || {};
    return { hold: M.hold || SHIP.hold, tank: M.tank || SHIP.tank };
  }
  // ---- asteroids ----
  cellKey(layer, cx, cy) { return layer + ":" + cx + "," + cy; }
  gridAdd(r) { const k = this.cellKey(r.layer, Math.floor(r.x / W.cell), Math.floor(r.y / W.cell)); r.gk = k; let s = this.grid.get(k); if (!s) this.grid.set(k, (s = new Set())); s.add(r); }
  gridDel(r) { const s = this.grid.get(r.gk); if (s) { s.delete(r); if (!s.size) this.grid.delete(r.gk); } }
  gridMove(r) { const k = this.cellKey(r.layer, Math.floor(r.x / W.cell), Math.floor(r.y / W.cell)); if (k !== r.gk) { this.gridDel(r); this.gridAdd(r); } }
  *rocksNear(x, y, rad, layer) {
    const c0 = Math.floor((x - rad) / W.cell), c1 = Math.floor((x + rad) / W.cell), d0 = Math.floor((y - rad) / W.cell), d1 = Math.floor((y + rad) / W.cell);
    for (let cx = c0; cx <= c1; cx++) for (let cy = d0; cy <= d1; cy++) { const s = this.grid.get(layer + ":" + cx + "," + cy); if (s) yield* s; }
  }
  // a cell comes awake when a player is near: its slots are rolled from the seed (unless a slot's asteroid is still out
  // somewhere, or it was mined out and hasn't come back yet). Nothing new appears in a closed or closing sector.
  // Each asteroid's seed comes from the secret, the 6-hour epoch, the layer, the cell, the slot and the slot's generation;
  // the client is sent the seed (position and size, see ringgen.js), never the ore.
  wakeCell(layer, cx, cy, t) {
    const key = this.cellKey(layer, cx, cy); let c = this.cells.get(key);
    if (c && c.awake > t) { c.awake = t + 120_000; return; }
    const mx = (cx + 0.5) * W.cell, my = (cy + 0.5) * W.cell, rr = hyp(mx, my);
    if (rr < W.rings[0][0] - W.cell || rr > W.rings[W.rings.length - 1][1] + W.cell) return;
    if (!c) this.cells.set(key, (c = { gen: [], back: [], awake: 0 }));
    c.awake = t + 120_000;
    const epoch = Math.floor(t / 1000 / R.ROCK.reseed);
    for (let s = 0; s < Math.max(...R.RING_SLOTS); s++) {
      const sk = key + "," + s; if (this.slots.has(sk) || (c.back[s] || 0) > t) continue;
      const gen = c.gen[s] || 0, seed = hash32(SECRET + "|" + epoch + "|" + key + "|" + s + "|" + gen), g = genRock(cx, cy, seed, W.cell, W.rings, R.RING_SIZES);
      if (!g || s >= R.RING_SLOTS[g.ring] || !this.sectors[sectorOf(g.x, g.y)].open || this.sectors[sectorOf(g.x, g.y)].closeAt) continue;
      const ore = pickW(R.RING_ORES[g.ring], rng(hash32(SECRET + "|ore|" + seed))());
      const rock = { id: key + ":" + seed, seed, sk, cell: key, layer, slot: s, x: g.x, y: g.y, n: g.n, cracks: g.n, hp: R.crackHp(g.n), ore, ring: g.ring,
        scanned: false, cracked: false, names: new Set(), boost: new Set(), lasers: new Set(), tow: null, touched: 0, home: true };
      this.rocks.set(rock.id, rock); this.slots.set(sk, rock); this.gridAdd(rock);
    }
  }
  dropRock(r, back) {                          // gone: its slot rolls again (a new size and ore) after `back` seconds
    this.rocks.delete(r.id); this.slots.delete(r.sk); this.gridDel(r);
    const c = this.cells.get(r.cell); if (c) { c.gen[r.slot] = (c.gen[r.slot] || 0) + 1; c.back[r.slot] = now() + back * 1000; }
    for (const p of this.players.values()) if (p.tow === r.id) p.tow = null;
  }
  wakeAround(t) {
    const R2 = W.loadR + W.cell;
    for (const p of this.players.values()) {
      const c0 = Math.floor((p.x - R2) / W.cell), c1 = Math.floor((p.x + R2) / W.cell), d0 = Math.floor((p.y - R2) / W.cell), d1 = Math.floor((p.y + R2) / W.cell);
      for (let cx = c0; cx <= c1; cx++) for (let cy = d0; cy <= d1; cy++) this.wakeCell(p.layer, cx, cy, t);
    }
    // cells nobody is near fall asleep: their untouched asteroids are let go (the seed brings them back); worked-on ones
    // stay until they've been left alone for 30 minutes
    for (const [key, c] of this.cells) if (c.awake && c.awake < t) {
      c.awake = 0;
      for (let s = 0; s < 3; s++) { const r = this.slots.get(key + "," + s); if (r && !r.touched && r.home) { this.rocks.delete(r.id); this.slots.delete(r.sk); this.gridDel(r); } }
    }
    for (const r of this.rocks.values()) if (r.touched && t - r.touched > R.ROCK.despawn * 1000 && !r.tow) this.dropRock(r, 0);
    for (const o of this.ores.values()) if (t - o.touched > R.DESPAWN_ORE * 1000) this.ores.delete(o.id);
  }
  // ---- sectors: one more opens per 50 online; a closing sector waits 10 minutes ----
  updateSectors(t) {
    const want = Math.min(4, 1 + Math.floor(this.players.size / R.SECTOR_EVERY));
    this.sectors.forEach((s, i) => {
      if (i < want) { if (!s.open || s.closeAt) this.sectorsDirty = true; s.open = true; s.closeAt = 0; }
      else if (s.open) { if (!s.closeAt) { s.closeAt = t + R.SECTOR_CLOSE_WAIT * 1000; this.sectorsDirty = true; } else if (t >= s.closeAt) { s.open = false; s.closeAt = 0; this.sectorsDirty = true; } }
    });
  }
  sectorList() { return this.sectors.map((s) => (s.open ? (s.closeAt ? 2 : 1) : 0)); }   // 1 open, 2 closing, 0 closed
  // ---- shards: only once all four sectors are open (and none is closing), a zone holds SHARD_CAP ships per layer ----
  shardingOn() { return this.sectors.every((s) => s.open && !s.closeAt); }
  // a ship entering a zone (or joining) picks its layer: a party member's already there, else the one it's in while
  // that has room, else the first with room, else a new one. With sharding off, everyone goes back to layer 0.
  placeLayer(p) {
    let L;
    const party = this.partyOf(p);
    if (party) for (const m of party.members) { const q = this.players.get(m); if (q && q !== p && q.zone === p.zone) { L = q.layer; break; } }
    if (L === undefined) {
      if (!this.shardingOn()) L = 0;
      else {
        const cnt = new Map(); for (const q of this.players.values()) if (q !== p && q.zone === p.zone) cnt.set(q.layer, (cnt.get(q.layer) || 0) + 1);
        if ((cnt.get(p.layer) || 0) < R.SHARD_CAP) L = p.layer; else { L = 0; while ((cnt.get(L) || 0) >= R.SHARD_CAP) L++; }
      }
    }
    if (L !== p.layer) this.setLayer(p, L);
  }
  setLayer(p, L) {                             // into another copy: links to other ships drop, a towed asteroid comes along
    p.layer = L; p.pumpTo = null; p.refineTo = null; p.refineT = 0; p.meDirty = true; p.dirty = true;
    const rock = p.tow && this.rocks.get(p.tow); if (rock) { rock.layer = L; this.gridMove(rock); }
  }
  shardOf(p) { return this.shardingOn() || p.layer > 0 ? p.layer + 1 : 0; }   // shown with the zone while it matters
  // may this ship be at (x, y)? Not inside Saturn, not past the locked line, not into a closed sector (unless it's already in it)
  allowed(p, x, y) {
    const r = hyp(x, y); if (r < W.saturnR + SHIP.shipR || r > W.lockedR) return false;
    if (r < W.safeR) return true;
    const s = sectorOf(x, y); return this.sectors[s].open || p.inSector === s;
  }

  // ---- players ----
  async join(id, name) {
    id = String(id); let p = this.players.get(id);
    if (p) { p.name = name; return p; }
    await this.ready; await (this.offline.get(id) || Promise.resolve());
    const { rows } = await pool.query(`SELECT * FROM ring_players WHERE user_id = $1`, [id]), r = rows[0];
    const [sx, sy] = W.station;
    p = { id, name, x: sx, y: sy + 120, h: 0, vx: 0, vy: 0, fx: 0, fy: 0, aim: 0, firing: false, fuel: R.START.fuel, fuelFrom: {}, module: R.START.module,
      modules: new Set([R.START.module]), credits: R.START.credits, storage: {}, queue: [], hold: [], corp: null, modOn: true, tow: null, pumpTo: null, refineTo: null,
      refineT: 0, laserLen: 0, laserOn: false, docked: false, inSector: -1, party: null, dirty: true, hAt: 0, layer: 0, zone: "" };
    if (r) {
      Object.assign(p, { x: r.x, y: r.y, h: r.h, fuel: r.fuel, fuelFrom: r.fuel_from || {}, module: MODULES[r.module] ? r.module : R.START.module,
        modules: new Set((r.modules || []).filter((m) => MODULES[m])), credits: +r.credits, storage: r.storage || {}, queue: r.queue || [], hold: Array.isArray(r.hold) ? r.hold : [] });
      if (!p.modules.size) p.modules.add(p.module);
      if (r.corp_id && this.corps.has(r.corp_id)) p.corp = r.corp_id;
      if (!this.allowed(p, p.x, p.y)) { p.x = sx; p.y = sy + 120; }   // (a sector closed while they were away)
    }
    p.modOn = p.module === "miner";
    const S = this.stats(p); if (p.fuel > S.tank) p.fuel = S.tank;
    p.inSector = hyp(p.x, p.y) >= W.safeR ? sectorOf(p.x, p.y) : -1;
    this.settleQueue(p, now());
    p.zone = zoneOf(p.x, p.y); this.placeLayer(p);
    this.players.set(id, p);
    await pool.query(`INSERT INTO ring_players (user_id, x, y, h, fuel, module, modules) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id) DO UPDATE SET logout_at = NULL`, [id, p.x, p.y, p.h, p.fuel, p.module, JSON.stringify([...p.modules])]);
    return p;
  }
  async leave(id) {
    const p = this.players.get(String(id)); if (!p) return;
    this.leaveParty(p, true); this.players.delete(p.id);
    await this._save(p); await pool.query(`UPDATE ring_players SET logout_at = now() WHERE user_id = $1`, [p.id]);
  }
  respawn(id) { const p = this.players.get(String(id)); if (!p) return null; const [sx, sy] = W.station; return this.teleport(id, sx, sy + 120); }
  teleport(id, x, y, layer) {                  // (layer: into that copy, e.g. teleporting to another player)
    const p = this.players.get(String(id)); if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (hyp(x, y) < W.saturnR + 60) { const a = Math.atan2(y, x); x = Math.cos(a) * (W.saturnR + 80); y = Math.sin(a) * (W.saturnR + 80); }
    if (p.tow) { const r = this.rocks.get(p.tow); if (r) r.tow = null; }
    p.x = x; p.y = y; p.vx = p.vy = 0; p.tow = null; p.inSector = hyp(x, y) >= W.safeR ? sectorOf(x, y) : -1; p.dirty = true;
    p.zone = zoneOf(x, y); if (Number.isInteger(layer) && layer >= 0) { if (layer !== p.layer) this.setLayer(p, layer); } else this.placeLayer(p);
    this.msgs.push({ to: p.id, m: { t: "teleport", x, y } }); return p;
  }
  // the client's input, checked as hostile: a push (fx, fy: world directions, length clamped to 1), the heading it turned
  // to (no faster than the ship turns), its aim and whether the laser is held
  setInput(id, m) {
    const p = this.players.get(String(id)); if (!p) return;
    const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    let fx = n(m.x), fy = n(m.y); const L = hyp(fx, fy); if (L > 1) { fx /= L; fy /= L; }
    p.fx = fx; p.fy = fy;
    if (typeof m.h === "number" && Number.isFinite(m.h)) {
      const t = now(), dt = Math.min(0.5, (t - (p.hAt || t)) / 1000) + 0.1, mx = SHIP.turn * dt * 1.3, d = Math.atan2(Math.sin(m.h - p.h), Math.cos(m.h - p.h));
      p.h = p.h + Math.max(-mx, Math.min(mx, d)); p.h = Math.atan2(Math.sin(p.h), Math.cos(p.h)); p.hAt = t;
    }
    p.aim = n(m.a); p.firing = m.f === 1;
  }
  burn(p, amt) {                               // use fuel; party fuel in the tank goes down in step
    amt = Math.min(amt, p.fuel); if (amt <= 0) return 0;
    const k = p.fuel > 0 ? (p.fuel - amt) / p.fuel : 0;
    for (const f of Object.keys(p.fuelFrom)) { p.fuelFrom[f] *= k; if (p.fuelFrom[f] < 0.01) delete p.fuelFrom[f]; }
    p.fuel -= amt; return amt;
  }
  fuelNames(p) { return Object.keys(p.fuelFrom).filter((f) => p.fuelFrom[f] >= 0.01); }   // party fuelers whose fuel is in the tank

  step(dt) {
    const t = now();
    for (const r of this.rocks.values()) r.lasers.clear();
    for (const p of this.players.values()) {
      const S = this.stats(p), empty = p.fuel <= 0.0001, rock = p.tow && this.rocks.get(p.tow);
      // movement: thrust toward the push, coasting brakes gently; an empty tank crawls; towing slows by the rock's size
      const k = empty ? SHIP.crawl : 1, spd = SHIP.speed * k * (rock ? R.towFactor(rock.n) : 1), push = hyp(p.fx, p.fy);
      const tx = p.fx * spd, ty = p.fy * spd, a = (push > 0.01 ? SHIP.accel : SHIP.brake) * (push > 0.01 ? k : 1) * dt;
      let ex = tx - p.vx, ey = ty - p.vy; const el = hyp(ex, ey); if (el > a) { ex *= a / el; ey *= a / el; }
      p.vx += ex; p.vy += ey;
      if (push > 0.01 && !empty) this.burn(p, SHIP.flyBurn / 60 * push * dt);
      if (p.vx || p.vy) {
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (this.allowed(p, nx, ny)) { p.x = nx; p.y = ny; }
        else if (this.allowed(p, nx, p.y)) { p.x = nx; p.vy = 0; } else if (this.allowed(p, p.x, ny)) { p.y = ny; p.vx = 0; } else { p.vx = p.vy = 0; }
        for (const r of this.rocksNear(p.x, p.y, 80, p.layer)) {   // bump off asteroids (not the one on my own leash)
          if (r.id === p.tow) continue; const d = hyp(p.x - r.x, p.y - r.y), min = R.rockR(r.n) + SHIP.shipR;
          if (d < min && d > 0.01) { const ux = (p.x - r.x) / d, uy = (p.y - r.y) / d, px = r.x + ux * min, py = r.y + uy * min; if (this.allowed(p, px, py)) { p.x = px; p.y = py; } const vn = p.vx * ux + p.vy * uy; if (vn < 0) { p.vx -= vn * ux; p.vy -= vn * uy; } }
        }
        p.inSector = hyp(p.x, p.y) >= W.safeR ? sectorOf(p.x, p.y) : -1; p.dirty = true;
        const z = zoneOf(p.x, p.y); if (z !== p.zone) { p.zone = z; this.placeLayer(p); p.meDirty = true; }
      }
      // docking: entering the station's circle delivers the hold
      const dock = hyp(p.x - W.station[0], p.y - W.station[1]) < W.dockR;
      if (dock && !p.docked && p.hold.length) this.deliver(p, p.hold.splice(0), true);
      if (dock !== p.docked) { p.docked = dock; p.meDirty = true; }
      if (dock) { p.tow = null; p.pumpTo = null; p.refineTo = null; }
      // the laser: the first asteroid along the aim within reach; the big laser (miner, switched on, with fuel) and any
      // command ship boosting nearby make it faster
      p.laserOn = false; p.laserLen = 0;
      if (p.firing && !dock) {
        const ux = Math.cos(p.aim), uy = Math.sin(p.aim); let best = null, bt = SHIP.laserRange;
        for (const r of this.rocksNear(p.x, p.y, SHIP.laserRange + 70, p.layer)) {
          const rr = R.rockR(r.n), fx = r.x - p.x, fy = r.y - p.y, along = fx * ux + fy * uy; if (along < -rr) continue;
          const perp = Math.abs(fx * uy - fy * ux); if (perp > rr) continue;
          const tt = Math.max(0, along - Math.sqrt(rr * rr - perp * perp)); if (tt < bt) { bt = tt; best = r; }
        }
        p.laserLen = best ? bt : SHIP.laserRange; p.laserOn = !!best;
        if (best) {
          let dps = SHIP.laserDps;
          if (p.module === "miner" && p.modOn && p.fuel > 0) { dps = MODULES.miner.laserDps; this.burn(p, MODULES.miner.burn / 60 * dt); }
          let boosted = false;   // (several command ships don't stack, but every one boosting is named)
          for (const q of this.players.values()) if (q.module === "command" && q.modOn && q.fuel > 0 && !q.docked && q.layer === p.layer && hyp(q.x - p.x, q.y - p.y) <= MODULES.command.radius) { boosted = true; best.boost.add(q.id); }
          if (boosted) dps *= MODULES.command.boost;
          best.hp -= dps * dt; best.lasers.add(p.id); best.touched = t; best.home = false;
        }
      }
      // active modules
      if (p.module === "command" && p.modOn && !dock) { if (p.fuel <= 0) p.modOn = false; else this.burn(p, MODULES.command.burn / 60 * dt); }
      if (rock) {                              // the tractor: the asteroid follows on a leash behind the ship
        if (rock.cracked || p.fuel <= 0) { p.tow = null; rock.tow = null; }
        else {
          this.burn(p, MODULES.tractor.burn / 60 * (1 + rock.n / 15) * dt);
          const L = R.rockR(rock.n) + 60, gx = p.x - Math.cos(p.h - Math.PI / 2) * L, gy = p.y - Math.sin(p.h - Math.PI / 2) * L;
          const dx = gx - rock.x, dy = gy - rock.y, d = hyp(dx, dy), pull = Math.min(1, dt * 2.5);
          if (d > 1 && hyp(rock.x + dx * pull, rock.y + dy * pull) > W.saturnR + R.rockR(rock.n)) { rock.x += dx * pull; rock.y += dy * pull; this.gridMove(rock); }
          rock.touched = t;
        }
      }
      if (p.pumpTo) {                          // the fueler: pumps into a ship within reach; the world pays per unit
        const q = this.players.get(p.pumpTo), QS = q && this.stats(q);
        if (!q || q.docked || q.layer !== p.layer || hyp(q.x - p.x, q.y - p.y) > MODULES.fueler.range || p.fuel <= 0) p.pumpTo = null;
        else {
          const amt = Math.min(MODULES.fueler.pump * dt, QS.tank - q.fuel, p.fuel);
          if (amt > 0) { this.burn(p, amt); q.fuel += amt; p.credits += amt * R.FUEL.pumpPay; q.meDirty = true; if (p.party && p.party === q.party) q.fuelFrom[p.id] = (q.fuelFrom[p.id] || 0) + amt; }
        }
      }
      if (p.refineTo) {                        // the refinery: one raw unit at a time, in its own hold or another ship's
        const q = this.players.get(p.refineTo), u = q && q.hold.find((x) => !x.r);
        if (!q || !u || (q !== p && (q.layer !== p.layer || hyp(q.x - p.x, q.y - p.y) > MODULES.refinery.range)) || p.fuel < MODULES.refinery.burn) { p.refineTo = null; p.refineT = 0; }
        else {
          p.refineT += dt;
          if (p.refineT >= MODULES.refinery.unit) { p.refineT = 0; this.burn(p, MODULES.refinery.burn); u.r = 1; if (!u.n.includes(p.id)) u.n.push(p.id); q.meDirty = true; this.fx.push({ k: "refine", x: q.x, y: q.y, l: q.layer }); }
        }
      }
      if (p.firing || p.pumpTo || p.refineTo || p.tow || (p.module === "command" && p.modOn)) p.meDirty = true;
      p.sos = p.fuel <= 0.0001 && !p.docked;
    }
    for (const p of this.players.values()) if (p.meDirty) { p.dirty = true; p.meDirty = false; }   // (anything that changed my state is saved within 10 s)
    // cracks that broke this tick
    for (const r of [...this.rocks.values()]) if (r.hp <= 0 && r.lasers.size) this.breakCrack(r);
    // loose ore: drifts to a stop; flies into the nearest ship within reach that has room
    for (const o of this.ores.values()) {
      if (o.vx || o.vy) { o.x += o.vx * dt; o.y += o.vy * dt; const d = Math.exp(-dt * 1.5); o.vx *= d; o.vy *= d; if (hyp(o.vx, o.vy) < 0.5) o.vx = o.vy = 0; }
      let best = null, bd = SHIP.pickupR;
      for (const p of this.players.values()) { if (p.docked || p.layer !== o.layer) continue; const d = hyp(p.x - o.x, p.y - o.y); if (d < bd && holdUsed(p) + (o.r ? R.REFINED_SPACE : 1) <= this.stats(p).hold + 1e-6) { bd = d; best = p; } }
      if (best) { best.hold.push({ o: o.ore, r: o.r, n: o.names }); best.meDirty = true; best.dirty = true; this.ores.delete(o.id); this.fx.push({ k: "pick", x: o.x, y: o.y, i: best.id, l: o.layer }); }
    }
  }
  // a crack breaks: one ore unit drops, named with every ship lasering the asteroid right now, every command ship that
  // boosted during this crack, whoever scanned or towed it, and the party fuelers whose fuel the miners are burning
  breakCrack(r) {
    const names = new Set(r.names);
    for (const id of r.lasers) { names.add(id); const p = this.players.get(id); if (p) for (const f of this.fuelNames(p)) names.add(f); }
    for (const id of r.boost) names.add(id);
    // the unit drifts out toward the first ship lasering it (a little spread), stopping short of it
    const first = this.players.get([...r.lasers][0]), rr = R.rockR(r.n);
    const a = (first ? Math.atan2(first.y - r.y, first.x - r.x) : Math.random() * 6.28) + (Math.random() - 0.5) * 0.7;
    const travel = first ? Math.max(10, Math.min(160, hyp(first.x - r.x, first.y - r.y) - rr - 30)) : 10, v = travel * 1.5;
    const o = { id: this.oreSeq++, layer: r.layer, ore: r.ore, r: 0, names: [...names], x: r.x + Math.cos(a) * (rr + 6), y: r.y + Math.sin(a) * (rr + 6), vx: Math.cos(a) * v, vy: Math.sin(a) * v, touched: now() };
    this.ores.set(o.id, o);
    r.cracks--; r.cracked = true; r.boost.clear(); r.hp = R.crackHp(r.n); r.touched = now();
    if (r.tow) { const q = this.players.get(r.tow); if (q) q.tow = null; r.tow = null; }
    this.fx.push({ k: "crack", x: r.x, y: r.y, r: rr, done: r.cracks <= 0 ? 1 : 0, l: r.layer });
    if (r.cracks <= 0) this.dropRock(r, R.ROCK.respawn);
  }
  // ---- delivery: every name on a unit gets a copy (the carrier is named as deliverer, as are its party fuelers) ----
  deliver(p, units, asCarrier) {
    const gifts = new Map();                   // account id -> { key: count }
    const extra = asCarrier && p ? [p.id, ...this.fuelNames(p)] : [];
    for (const u of units) {
      const names = new Set(u.n); for (const e of extra) names.add(e);
      const key = storeKey(u.o, u.r);
      for (const id of names) { let g = gifts.get(id); if (!g) gifts.set(id, (g = {})); g[key] = (g[key] || 0) + 1; }
    }
    for (const [id, g] of gifts) this.give(id, g);
    if (p) { p.meDirty = true; p.dirty = true; }
    if (p && units.length) this.fx.push({ k: "deliver", x: p.x, y: p.y, n: units.length, i: p.id, l: p.layer });
  }
  give(id, items) {                            // into station storage, online or not
    const p = this.players.get(String(id));
    if (p) { for (const [k, n] of Object.entries(items)) p.storage[k] = (p.storage[k] || 0) + n; p.stDirty = true; p.dirty = true; return; }
    const chain = (this.offline.get(id) || Promise.resolve()).then(async () => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const { rows } = await c.query(`SELECT storage FROM ring_players WHERE user_id = $1 FOR UPDATE`, [id]);
        if (rows[0]) { const s = rows[0].storage || {}; for (const [k, n] of Object.entries(items)) s[k] = (s[k] || 0) + n; await c.query(`UPDATE ring_players SET storage = $2 WHERE user_id = $1`, [id, JSON.stringify(s)]); }
        await c.query("COMMIT");
      } catch (e) { await c.query("ROLLBACK").catch(() => {}); console.error("ring give", e); } finally { c.release(); }
    });
    this.offline.set(id, chain);
  }
  // a carrier offline for 30 minutes: their ore crawls home by itself (delivered after the time an empty-tanked ship would
  // take from there), to every name on it; the carrier isn't named. Banned or deleted: delivered at once.
  async offlineHolds() {
    await this.ready;
    const crawl = SHIP.speed * SHIP.crawl;
    const { rows } = await pool.query(`SELECT user_id, x, y, hold FROM ring_players WHERE logout_at IS NOT NULL AND logout_at < now() - make_interval(secs => $1) AND hold <> '[]'::jsonb AND transit IS NULL`, [R.OFFLINE_GRACE]);
    for (const r of rows) {
      if (this.players.has(r.user_id)) continue;
      const secs = Math.max(0, hyp(r.x - W.station[0], r.y - W.station[1]) - W.dockR) / crawl;
      await pool.query(`UPDATE ring_players SET transit = hold, hold = '[]'::jsonb, transit_due = now() + make_interval(secs => $2) WHERE user_id = $1 AND transit IS NULL`, [r.user_id, secs]);
    }
    const due = await pool.query(`SELECT user_id, transit FROM ring_players WHERE transit IS NOT NULL AND transit_due <= now()`);
    for (const r of due.rows) {
      await pool.query(`UPDATE ring_players SET transit = NULL, transit_due = NULL WHERE user_id = $1`, [r.user_id]);
      if (Array.isArray(r.transit) && r.transit.length) this.deliver(null, r.transit, false);
    }
  }
  async banned(id) {                           // (admin) a banned account's hold is delivered to everyone named on it
    const p = this.players.get(String(id));
    if (p) { if (p.hold.length) this.deliver(null, p.hold.splice(0), false); return; }
    await pool.query(`UPDATE ring_players SET transit = hold, hold = '[]'::jsonb, transit_due = now() WHERE user_id = $1 AND transit IS NULL AND hold <> '[]'::jsonb`, [String(id)]);
  }

  // ---- commands ----
  toggleModule(id) {                           // F: the big laser, the command boost, refining my own hold
    const p = this.players.get(String(id)); if (!p) return;
    if (p.module === "refinery") { p.refineTo = p.refineTo === p.id ? null : p.id; p.refineT = 0; }
    else if (MODULES[p.module].active && p.module !== "tractor") p.modOn = !p.modOn;
    p.meDirty = true;
  }
  // right-click on a ship or an asteroid: what it does depends on my module (checked as hostile: the target must exist
  // and be in reach)
  act(id, m) {
    const p = this.players.get(String(id)); if (!p || p.docked) return;
    if (typeof m.rock === "string") {
      const r = this.rocks.get(m.rock); if (!r || r.layer !== p.layer) return; const d = hyp(r.x - p.x, r.y - p.y) - R.rockR(r.n);
      if (p.module === "tractor") {
        if (p.tow === r.id) { p.tow = null; r.tow = null; }
        else if (!r.cracked && !r.tow && d <= MODULES.tractor.range && p.fuel > 0) {
          if (p.tow) { const o = this.rocks.get(p.tow); if (o) o.tow = null; }
          p.tow = r.id; r.tow = p.id; r.names.add(p.id); r.touched = now(); r.home = false;
        }
      } else if (p.module === "scanner" && !r.scanned && d <= MODULES.scanner.range) {
        r.scanned = true; r.names.add(p.id); r.touched = now(); r.home = false; this.fx.push({ k: "scan", x: p.x, y: p.y, x2: r.x, y2: r.y, i: p.id, l: p.layer });
      }
    } else if (typeof m.ship === "string") {
      const q = this.players.get(m.ship); if (!q || q === p || q.docked || q.layer !== p.layer) return; const d = hyp(q.x - p.x, q.y - p.y);
      if (p.module === "fueler") { if (d <= MODULES.fueler.range) p.pumpTo = p.pumpTo === q.id ? null : q.id; }
      else if (p.module === "refinery") { if (d <= MODULES.refinery.range) { p.refineTo = p.refineTo === q.id ? null : q.id; p.refineT = 0; } }
      else if (q.module === "hauler" && p.module !== "hauler" && d <= 150 && p.hold.length) {   // one handoff, one way: into a hauler
        const room = this.stats(q).hold - holdUsed(q); let used = 0; const keep = [];
        for (const u of p.hold) { const s = unitSpace(u); if (used + s <= room + 1e-6) { q.hold.push(u); used += s; } else keep.push(u); }
        p.hold = keep; p.meDirty = q.meDirty = true; p.dirty = q.dirty = true; this.fx.push({ k: "hand", x: p.x, y: p.y, x2: q.x, y2: q.y, l: p.layer });
      }
    }
    p.meDirty = true;
  }
  // ---- the station (docked only) ----
  settleQueue(p, t) {
    let changed = false;
    while (p.queue.length) {
      const j = p.queue[0], dur = (j.k === "fuel" ? R.FUEL.blockTime : R.STATION_REFINE) * 1000;
      if (t < j.at + dur) break;
      const key = j.k === "fuel" ? "fuel" : j.o + "+"; p.storage[key] = (p.storage[key] || 0) + 1; j.left--; j.at += dur; changed = true;
      if (j.left <= 0) { p.queue.shift(); if (p.queue[0]) p.queue[0].at = Math.max(p.queue[0].at, j.at); }
    }
    if (changed) { p.stDirty = true; p.dirty = true; }
  }
  station(id, m) {
    const p = this.players.get(String(id)); if (!p || !p.docked || !m || typeof m.op !== "string") return false;
    const S = this.stats(p), cnt = (v, max) => Math.max(0, Math.min(max, Number.isInteger(v) ? v : max));
    if (m.op === "sell") {
      const k = String(m.k || ""), o = k.replace(/\+$/, ""), ref = k.endsWith("+"); if (!R.ORES[o]) return false;
      const n = cnt(m.n, p.storage[k] || 0); if (!n) return false;
      p.storage[k] -= n; if (!p.storage[k]) delete p.storage[k]; p.credits += n * R.ORES[o].price * (ref ? R.REFINED_MUL : 1);
    } else if (m.op === "buy") {
      const M = MODULES[m.m]; if (!M || p.modules.has(m.m) || p.credits < M.price) return false;
      p.credits -= M.price; p.modules.add(m.m);
    } else if (m.op === "equip") {
      if (!p.modules.has(m.m) || p.module === m.m) return false;
      p.module = m.m; p.modOn = m.m === "miner"; p.tow = null; p.pumpTo = null; p.refineTo = null;
      const T = this.stats(p).tank; if (p.fuel > T) { const blocks = Math.floor((p.fuel - T) / R.FUEL.blockFuel); if (blocks) p.storage.fuel = (p.storage.fuel || 0) + blocks; p.fuel = T; }   // (spare fuel kept as fuel blocks)
    } else if (m.op === "fuel") {              // buy fuel into the tank
      const space = S.tank - p.fuel, n = Math.min(space, Math.floor(p.credits / R.FUEL.stationPrice), Number.isFinite(m.n) && m.n > 0 ? m.n : space); if (n <= 0) return false;
      p.fuel += n; p.credits -= n * R.FUEL.stationPrice;
    } else if (m.op === "blocks") {            // fuel blocks from storage into the tank
      const n = Math.min(p.storage.fuel || 0, Math.floor((S.tank - p.fuel) / R.FUEL.blockFuel)); if (n <= 0) return false;
      p.storage.fuel -= n; if (!p.storage.fuel) delete p.storage.fuel; p.fuel += n * R.FUEL.blockFuel;
    } else if (m.op === "refine" || m.op === "craft") {   // queue raw ore to refine (60 s a unit) or ice into fuel blocks (15 s)
      const o = m.op === "craft" ? "ice" : String(m.o || ""); if (!R.ORES[o] || p.queue.length >= 8) return false;
      const n = cnt(m.n, p.storage[o] || 0); if (!n) return false;
      p.storage[o] -= n; if (!p.storage[o]) delete p.storage[o];
      const last = p.queue[p.queue.length - 1], dur = (m.op === "craft" ? R.FUEL.blockTime : R.STATION_REFINE) * 1000;
      const at = last ? last.at + last.left * ((last.k === "fuel" ? R.FUEL.blockTime : R.STATION_REFINE) * 1000) : now(); void dur;
      p.queue.push({ k: m.op === "craft" ? "fuel" : "refine", o, left: n, at: Math.max(at, now()) });
    } else return false;
    p.stDirty = true; p.meDirty = true; p.dirty = true; return true;
  }
  // ---- parties (up to 10, for now) and corporations ----
  partyOf(p) { return p.party ? this.parties.get(p.party) : null; }
  invite(from, toId) {
    const p = this.players.get(from), q = this.players.get(toId); if (!p || !q || p === q) return "That player isn't online.";
    if (q.party && q.party === p.party) return q.name + " is already in your party.";
    const party = this.partyOf(p); if (party && party.members.size >= R.PARTY_MAX) return "Your party is full.";
    this.invites.set(q.id, { from: p.id, at: now() });
    this.msgs.push({ to: q.id, m: { t: "chat", ch: "sys", text: p.name + " invited you to a party. Type /party accept to join." } });
    return "Invited " + q.name + " to your party.";
  }
  acceptParty(id) {
    const q = this.players.get(id), inv = this.invites.get(id); this.invites.delete(id);
    const p = inv && this.players.get(inv.from); if (!q || !p || now() - inv.at > 120_000) return "No party invite waiting.";
    let party = this.partyOf(p);
    if (!party) { party = { id: this.partySeq++, leader: p.id, members: new Set([p.id]) }; this.parties.set(party.id, party); p.party = party.id; p.socDirty = true; }
    if (party.members.size >= R.PARTY_MAX) return "That party is full.";
    this.leaveParty(q, false); party.members.add(q.id); q.party = party.id;
    for (const m of party.members) { const x = this.players.get(m); if (x) x.socDirty = true; }
    this.placeLayer(q);                        // (into a party member's copy of this zone, if one's here)
    this.partyNote(party, q.name + " joined the party.");
    return null;
  }
  // leaving: my name comes off the party fuel in every online member's tank, for good (offline members keep it)
  leaveParty(p, quiet) {
    const party = this.partyOf(p); if (!party) return;
    party.members.delete(p.id); p.party = null; p.socDirty = true;
    for (const m of party.members) { const x = this.players.get(m); if (x) { if (x.fuelFrom[p.id] !== undefined) { delete x.fuelFrom[p.id]; x.dirty = true; } x.socDirty = true; } }
    delete p.fuelFrom; p.fuelFrom = {};
    if (party.leader === p.id) party.leader = [...party.members][0];
    if (party.members.size <= 1) { for (const m of party.members) { const x = this.players.get(m); if (x) { x.party = null; x.socDirty = true; this.msgs.push({ to: m, m: { t: "chat", ch: "sys", text: "The party disbanded." } }); } } this.parties.delete(party.id); }
    else this.partyNote(party, p.name + (quiet ? " went offline and left the party." : " left the party."));
  }
  partyNote(party, text) { for (const m of party.members) this.msgs.push({ to: m, m: { t: "chat", ch: "sys", text } }); }
  async createCorp(id, name) {
    const p = this.players.get(id); if (!p) return "Not in the world.";
    name = String(name || "").replace(/\s+/g, " ").trim().slice(0, 32);
    if (name.length < 3) return "A corporation name needs at least 3 characters.";
    if (p.corp) return "Leave your corporation first.";
    try {
      const { rows } = await pool.query(`INSERT INTO ring_corps (name, owner) VALUES ($1, $2) RETURNING id`, [name, id]);
      this.corps.set(rows[0].id, { id: rows[0].id, name, owner: id }); p.corp = rows[0].id; p.socDirty = true; p.dirty = true;
      await this._save(p); return "Founded " + name + ".";
    } catch (e) { if (String(e.code) === "23505") return "That name is taken."; throw e; }
  }
  corpInvite(from, toId) {
    const p = this.players.get(from), q = this.players.get(toId); if (!p || !p.corp) return "You're not in a corporation.";
    if (!q) return "That player isn't online."; if (q.corp === p.corp) return q.name + " is already in it.";
    this.corpInvites.set(q.id, { corp: p.corp, from: p.id, at: now() });
    this.msgs.push({ to: q.id, m: { t: "chat", ch: "sys", text: p.name + " invited you to " + this.corps.get(p.corp).name + ". Type /corp accept to join." } });
    return "Invited " + q.name + ".";
  }
  async corpAccept(id) {
    const q = this.players.get(id), inv = this.corpInvites.get(id); this.corpInvites.delete(id);
    if (!q || !inv || now() - inv.at > 300_000 || !this.corps.has(inv.corp)) return "No corporation invite waiting.";
    if (q.corp) return "Leave your corporation first.";
    q.corp = inv.corp; q.socDirty = true; q.dirty = true; await this._save(q); return "Joined " + this.corps.get(inv.corp).name + ".";
  }
  async corpLeave(id) {
    const p = this.players.get(id); if (!p || !p.corp) return "You're not in a corporation.";
    const c = this.corps.get(p.corp); p.corp = null; p.socDirty = true; p.dirty = true; await this._save(p);
    if (c) { const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ring_players WHERE corp_id = $1`, [c.id]); if (!rows[0].n) { await pool.query(`DELETE FROM ring_corps WHERE id = $1`, [c.id]); this.corps.delete(c.id); } }
    return "Left " + (c ? c.name : "the corporation") + ".";
  }

  // ---- saving ----
  async _save(p) {
    await this.ready;
    await pool.query(`UPDATE ring_players SET x = $2, y = $3, h = $4, fuel = $5, fuel_from = $6, module = $7, modules = $8, credits = $9, storage = $10, hold = $11, queue = $12, corp_id = $13, updated_at = now() WHERE user_id = $1`,
      [p.id, p.x, p.y, p.h, p.fuel, JSON.stringify(p.fuelFrom), p.module, JSON.stringify([...p.modules]), p.credits, JSON.stringify(p.storage), JSON.stringify(p.hold), JSON.stringify(p.queue), p.corp]);
    p.dirty = false;
  }
  async saveDirty() { for (const p of this.players.values()) { this.settleQueue(p, now()); if (p.dirty) await this._save(p); } }

  // ---- what each player is sent ----
  // ships in the load circle: [id, x (dm), y (dm), heading (mrad), module index, flags, aim (mrad), laser length (m),
  // tow asteroid id | 0, pump target | 0, refine target | 0, hold raw %, hold refined %, fuel %]; flags: 1 laser on an
  // asteroid, 2 laser firing, 4 module switched on, 8 distress, 16 docked
  shipRows(viewer) {
    const out = [];
    for (const p of this.players.values()) {
      if (p !== viewer && (p.layer !== viewer.layer || hyp(p.x - viewer.x, p.y - viewer.y) > W.loadR)) continue;
      const S = this.stats(p), raw = p.hold.filter((u) => !u.r).length, ref = p.hold.filter((u) => u.r).length * R.REFINED_SPACE;
      out.push([p.id, Math.round(p.x * 10), Math.round(p.y * 10), Math.round(p.h * 1000), R.MODULE_KINDS.indexOf(p.module),
        (p.laserOn ? 1 : 0) | (p.firing && !p.docked ? 2 : 0) | (p.modOn || p.refineTo ? 4 : 0) | (p.sos ? 8 : 0) | (p.docked ? 16 : 0),
        Math.round(p.aim * 1000), Math.round(p.laserLen), p.tow || 0, p.pumpTo || 0, p.refineTo || 0,
        Math.round(raw / S.hold * 100), Math.round(ref / S.hold * 100), Math.round(p.fuel / S.tank * 100)]);
    }
    return out;
  }
  // asteroids near a player, in its layer: the untouched ones only as seeds, per cell ({ "layer:cx,cy": [seed, ...] }: the
  // client builds them with ringgen.js and names them "layer:cx,cy:seed"), and the ones someone has worked on (lasered,
  // scanned, towed) as rows: [id, x, y, size, cracks left, crack health %, ore (once scanned) | 0, towed 0 / 1]
  rockView(viewer) {
    const cells = {}, rows = [], L = viewer.layer, R2 = W.loadR + W.cell * 0.71;
    const c0 = Math.floor((viewer.x - R2) / W.cell), c1 = Math.floor((viewer.x + R2) / W.cell), d0 = Math.floor((viewer.y - R2) / W.cell), d1 = Math.floor((viewer.y + R2) / W.cell);
    for (let cx = c0; cx <= c1; cx++) for (let cy = d0; cy <= d1; cy++) {
      if (hyp((cx + 0.5) * W.cell - viewer.x, (cy + 0.5) * W.cell - viewer.y) > R2) continue;
      const key = this.cellKey(L, cx, cy); if (!this.cells.has(key)) continue;
      const seeds = []; for (let s = 0; s < 3; s++) { const r = this.slots.get(key + "," + s); if (r && r.home && !r.touched) seeds.push(r.seed); }
      if (seeds.length) cells[key] = seeds;
    }
    for (const r of this.rocksNear(viewer.x, viewer.y, W.loadR, L)) {
      if ((r.home && !r.touched) || hyp(r.x - viewer.x, r.y - viewer.y) > W.loadR) continue;
      rows.push([r.id, Math.round(r.x), Math.round(r.y), r.n, r.cracks, Math.max(0, Math.round(r.hp / R.crackHp(r.n) * 100)), r.scanned ? r.ore : 0, r.tow ? 1 : 0]);
    }
    return { cells, rows };
  }
  oreRows(viewer) {                            // [id, x, y, ore index, refined 0 / 1]
    const out = [];
    for (const o of this.ores.values()) if (o.layer === viewer.layer && hyp(o.x - viewer.x, o.y - viewer.y) <= W.loadR) out.push([o.id, Math.round(o.x), Math.round(o.y), ORE_KEYS.indexOf(o.ore), o.r]);
    return out;
  }
  meMsg(p) {
    const S = this.stats(p), hold = {};
    for (const u of p.hold) { const k = storeKey(u.o, u.r); hold[k] = (hold[k] || 0) + 1; }
    return { t: "me", fuel: Math.round(p.fuel * 10) / 10, tank: S.tank, cap: S.hold, hold, credits: Math.floor(p.credits), docked: p.docked ? 1 : 0, module: p.module,
      on: p.modOn ? 1 : 0, tow: p.tow || 0, pump: p.pumpTo || 0, refine: p.refineTo || 0, refineT: Math.round(p.refineT * 10) / 10, sos: p.sos ? 1 : 0, zone: p.zone, shard: this.shardOf(p) };
  }
  stationMsg(p) { this.settleQueue(p, now()); return { t: "station", storage: p.storage, queue: p.queue, modules: [...p.modules], now: now() }; }
  socMsg(p) {
    const party = this.partyOf(p), corp = p.corp && this.corps.get(p.corp);
    return { t: "soc", party: party ? { leader: party.leader, members: [...party.members].map((id) => { const q = this.players.get(id); return [id, q ? q.name : "?"]; }) } : null, corp: corp ? corp.name : null };
  }
  sosList() { const out = []; for (const p of this.players.values()) if (p.sos) out.push([p.id, Math.round(p.x), Math.round(p.y), p.layer]); return out; }   // (each player sees its own layer's)
  roster() { return [...this.players.values()].map((p) => ({ i: p.id, n: p.name })); }
}
