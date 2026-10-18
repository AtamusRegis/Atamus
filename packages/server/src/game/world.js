// (owner, 2026-10-18) The mining redesign's world, from "Crack, Bank and Haul" (draft 9, docs/Atamus_Ring_Mining.html).
// Asteroids are hidden masonry: shells of chunks around a core, seams staggered, thin chunks stacked into towers. The
// miner's laser cuts the first chunk on its line; the scanner reveals one chunk at a time (scanned chunks are glass to
// it); breaking a chunk shocks its neighbors and chains cascade; broken chunks bank their ore into the core, and only
// the pop pays, into the miners' holds, overflowing into cans and party crates. Delivery turns ore into credits: a
// party splits everything evenly. Kept around it: Saturn, two rings, sectors, fog of war, fuel, parties, one role per
// ship. The server decides everything; clients send commands and predict their own ship.
import crypto from "node:crypto";
import { pool } from "../db.js";
import * as R from "./rules.js";

const { WORLD: W, SHIPS, FLY } = R;
const now = () => Date.now();
const hyp = Math.hypot, TAU = Math.PI * 2;
const SECRET = process.env.RING_SECRET || crypto.randomBytes(16).toString("hex");
function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const ringOf = (r) => { for (let i = 0; i < W.rings.length; i++) if (r >= W.rings[i][0] && r <= W.rings[i][1]) return i; return -1; };
export const sectorOf = (x, y) => (((Math.round(Math.atan2(x, -y) / (Math.PI / 2))) % 4) + 4) % 4;
export function zoneOf(x, y) {
  const r = hyp(x, y); if (r < W.safeR) return "Station";
  let ring = W.rings.length;                   // the nearest ring band (the gaps split halfway)
  for (let i = 0; i < W.rings.length; i++) { const next = W.rings[i + 1]; if (!next || r < (W.rings[i][1] + next[0]) / 2) { ring = i + 1; break; } }
  return "Ring " + ring + " · " + R.SECTOR_NAMES[R.SECTORS[sectorOf(x, y)]];
}
const ORE_KEYS = Object.keys(R.ORES);
const normA = (a) => ((a % TAU) + TAU) % TAU;
const spanHas = (c, a) => { const d = normA(a - c.a0); return d >= 0 && d <= normA(c.a1 - c.a0); };
const overlap = (c, d) => { const la = normA(c.a1 - c.a0), lb = normA(d.a1 - d.a0), off = normA(d.a0 - c.a0); return off < la || normA(c.a0 - d.a0) < lb; };
const unitSpace = (e) => e.u * (e.raw ? 1 : R.REFINED_SPACE);

export class World {
  constructor() {
    this.players = new Map();
    this.rocks = new Map();                    // id -> rock (chunks, core); whole rocks move when towed
    this.slots = new Map(); this.cells = new Map(); this.grid = new Map();
    this.cans = new Map(); this.canSeq = 1;    // cans and party crates, loose or aboard a hauler
    this.parties = new Map(); this.partySeq = 1; this.invites = new Map();
    this.msgs = []; this.fx = [];
    this.offline = new Map();                  // account id -> promise chain (credits paid to offline players)
    this.lastDowntime = 0;
    this.ready = this._load();
    const t = setInterval(() => this.saveDirty().catch((e) => console.error("ring save", e)), 10_000); t.unref && t.unref();
    const t2 = setInterval(() => this.minutely().catch((e) => console.error("ring minutely", e)), 60_000); t2.unref && t2.unref();
  }
  async _load() {
    await pool.query(`CREATE TABLE IF NOT EXISTS ring_players (user_id TEXT PRIMARY KEY, x DOUBLE PRECISION NOT NULL, y DOUBLE PRECISION NOT NULL,
      h DOUBLE PRECISION NOT NULL DEFAULT 0, fuel DOUBLE PRECISION NOT NULL, fuel_from JSONB NOT NULL DEFAULT '{}', module TEXT NOT NULL, modules JSONB NOT NULL DEFAULT '[]',
      credits DOUBLE PRECISION NOT NULL DEFAULT 0, storage JSONB NOT NULL DEFAULT '{}', hold JSONB NOT NULL DEFAULT '[]', queue JSONB NOT NULL DEFAULT '[]',
      corp_id INTEGER, logout_at TIMESTAMPTZ, transit JSONB, transit_due TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    // (2026-10-18) the mining redesign: module holds the ship kind, hold the tagged cargo entries; cans/crates and the
    // daily downtime live in their own tables. Older columns stay untouched.
    await pool.query(`ALTER TABLE ring_players ADD COLUMN IF NOT EXISTS mods JSONB, ADD COLUMN IF NOT EXISTS hull INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS upgrades JSONB NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS tutorial INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS fuel_by JSONB NOT NULL DEFAULT '{}'`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ring_cans (id SERIAL PRIMARY KEY, x DOUBLE PRECISION NOT NULL, y DOUBLE PRECISION NOT NULL,
      kind TEXT NOT NULL, contents JSONB NOT NULL, owner TEXT NOT NULL, roster JSONB NOT NULL DEFAULT '[]', share DOUBLE PRECISION,
      held_by TEXT, mode TEXT, lock_until TIMESTAMPTZ, public_until TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ring_meta (k TEXT PRIMARY KEY, v JSONB NOT NULL)`);
    const { rows } = await pool.query(`SELECT * FROM ring_cans`);
    for (const r of rows) this.cans.set(r.id, { id: r.id, x: +r.x, y: +r.y, kind: r.kind, contents: r.contents, owner: r.owner, roster: r.roster || [], share: r.share === null ? null : +r.share,
      heldBy: r.held_by, mode: r.mode || null, rosterKey: (r.roster || []).join(","), lockUntil: r.lock_until ? new Date(r.lock_until).getTime() : 0, publicUntil: r.public_until ? new Date(r.public_until).getTime() : 0, dirty: false });
    this.canSeq = Math.max(1, ...[...this.cans.keys()].map((k) => k + 1));
    const m = await pool.query(`SELECT v FROM ring_meta WHERE k = 'downtime'`); this.lastDowntime = m.rows[0] ? +m.rows[0].v : 0;
  }
  shipOf(p) { return SHIPS[p.ship] || SHIPS.miner; }
  visionOf(p) { return Math.min(W.loadR, this.shipOf(p).vision); }

  // ---- the asteroid: shells of chunks around a core ----
  cellKey(cx, cy) { return cx + "," + cy; }
  gridAdd(r) { const k = this.cellKey(Math.floor(r.x / W.cell), Math.floor(r.y / W.cell)); r.gk = k; let s = this.grid.get(k); if (!s) this.grid.set(k, (s = new Set())); s.add(r); }
  gridDel(r) { const s = this.grid.get(r.gk); if (s) { s.delete(r); if (!s.size) this.grid.delete(r.gk); } }
  gridMove(r) { const k = this.cellKey(Math.floor(r.x / W.cell), Math.floor(r.y / W.cell)); if (k !== r.gk) { this.gridDel(r); this.gridAdd(r); } }
  *rocksNear(x, y, rad) {
    const c0 = Math.floor((x - rad) / W.cell), c1 = Math.floor((x + rad) / W.cell), d0 = Math.floor((y - rad) / W.cell), d1 = Math.floor((y + rad) / W.cell);
    for (let cx = c0; cx <= c1; cx++) for (let cy = d0; cy <= d1; cy++) { const s = this.grid.get(cx + "," + cy); if (s) yield* s; }
  }
  genRock(key, cx, cy, gen, epoch) {
    const rand = rng(hash32(SECRET + "|" + epoch + "|" + key + "|" + gen));
    const roll = rand();
    const x = (cx + 0.26 + rand() * 0.48) * W.cell, y = (cy + 0.26 + rand() * 0.48) * W.cell, ring = ringOf(hyp(x, y));   // (kept inward so big rocks in adjacent cells can't overlap)
    if (ring < 0) return null;
    if (roll > R.ROCK.spawnChance * (R.RING_SPAWN[ring] ?? 1)) return null;   // (deeper rings roll rocks rarer)
    const sizes = R.RING_SIZES[ring], sizeIdx = sizes[Math.floor(rand() * sizes.length)], SZ = R.ROCKS[sizeIdx];
    const pool_ = [...R.RING_ORES[ring]]; const types = [];
    for (let i = 0; i < SZ.oreTypes && pool_.length; i++) types.push(pool_.splice(Math.floor(rand() * pool_.length), 1)[0]);
    const C = R.CHUNK, bedW = C.wBed * (R.RING_BED[ring] ?? 1);   // deeper rings run heavier with bedrock
    const freeLine = (R.RING_FREELINE[ring] ?? 1) > 0, freeA = rand() * TAU;   // the guaranteed bore line, where the ring grants one
    // (owner, 2026-10-18) shells of masonry out to the size's radius: shell count and thickness vary by size, and the
    // chunk budget is spread over the shells' circumferences, so chunks stay slab-sized at every depth
    const chunks = [], shells = [];
    const nSh = Math.max(2, SZ.shells || 6), baseTh = Math.max(3, ((SZ.radius || 90) - SZ.coreR - 2) / nSh);
    let circ = 0; { let r2 = SZ.coreR + 2; for (let i2 = 0; i2 < nSh; i2++) { circ += TAU * (r2 + baseTh / 2); r2 += baseTh; } }
    const targetArc = Math.max(6, circ / Math.max(8, SZ.chunks));
    let rr = SZ.coreR + 2;
    for (let shellIdx = 0; shellIdx < nSh; shellIdx++) {
      const th = baseTh * (0.7 + rand() * 0.6), r1 = rr + th, mid = (rr + r1) / 2;
      const nSeg = Math.max(4, Math.round((TAU * mid) / (targetArc * (0.85 + rand() * 0.3)))), off = rand() * TAU, segs = [];
      for (let i = 0; i < nSeg; i++) {
        const a0 = normA(off + (i / nSeg) * TAU), a1 = normA(off + ((i + 1) / nSeg) * TAU);
        const split = th > baseTh && rand() < 0.3;                 // thick shells split into stacked towers
        const bands = split ? [[rr, mid], [mid, r1]] : [[rr, r1]];
        for (const [b0, b1] of bands) {
          const wsum = C.wSoft + C.wNormal + C.wDense + C.wUltra + bedW; let dv = rand() * wsum, d = 0;
          for (const [i2, w] of [C.wSoft, C.wNormal, C.wDense, C.wUltra, bedW].entries()) { dv -= w; if (dv <= 0) { d = i2; break; } }
          const c = { i: chunks.length, sh: shellIdx, r0: b0, r1: b1, a0, a1, d, ore: null, u: 0, broken: false, scanned: false, adj: [] };
          if (c.d === 4 && freeLine && spanHas(c, freeA)) c.d = 1;   // the guaranteed bore line
          c.heat = 0;
          if (c.d === 4) { c.ore = types[Math.floor(rand() * types.length)]; c.u = (C.oreUnit || 100) + C.bedOre; }   // bedrock is rich — but only a boosted laser banks it
          else if (rand() >= C.barren) { c.ore = types[Math.floor(rand() * types.length)]; c.u = (C.oreUnit || 100) + (c.d === 2 ? C.denseOre : c.d === 3 ? C.ultraOre : 0); }
          const span = normA(c.a1 - c.a0) || TAU / nSeg, area = span * ((c.r0 + c.r1) / 2) * (c.r1 - c.r0);
          c.maxHp = Math.max(8, area * C.hpK * [C.soft, 1, C.dense, C.ultra, C.bed || 5][c.d]); c.hp = c.maxHp;
          segs.push(c.i); chunks.push(c);
        }
      }
      shells.push({ r0: rr, r1, segs }); rr = r1;
    }
    // who touches whom (for bursts): stacked pairs, same-shell neighbors, and the shells either side where angles overlap
    for (const c of chunks) for (const d of chunks) {
      if (c === d || c.adj.includes(d.i)) continue;
      const radial = (Math.abs(c.r1 - d.r0) < 0.01 || Math.abs(c.r0 - d.r1) < 0.01) && overlap(c, d);
      const side = c.sh === d.sh && Math.abs(c.r0 - d.r0) < 0.01 && (Math.abs(normA(c.a1 - d.a0)) < 0.02 || Math.abs(normA(d.a1 - c.a0)) < 0.02);
      if (radial || side) { c.adj.push(d.i); d.adj.push(c.i); }
    }
    const total = chunks.reduce((s, c) => s + c.u, 0);
    return { id: key + ":" + gen + ":" + epoch, key, cell: key, gen, x, y, ring, sizeIdx, r: rr, chunks, shells,
      core: { r0: SZ.coreR, hp: SZ.coreHp, maxHp: SZ.coreHp, banked: {}, bankedTotal: 0, total: Math.max(1, total), rareMax: SZ.rareMax, popped: false },
      v: 1, touched: 0, home: true, tow: null };
  }
  wakeCell(cx, cy, t) {
    const key = this.cellKey(cx, cy); let c = this.cells.get(key);
    if (c && c.awake > t) { c.awake = t + 120_000; return; }
    const mx = (cx + 0.5) * W.cell, my = (cy + 0.5) * W.cell, rr = hyp(mx, my);
    if (rr < W.rings[0][0] - W.cell || rr > W.rings[W.rings.length - 1][1] + W.cell) return;
    if (!c) this.cells.set(key, (c = { gen: 0, back: 0, awake: 0 }));
    c.awake = t + 120_000;
    if (this.slots.has(key) || c.back > t) return;
    const rock = this.genRock(key, cx, cy, c.gen, Math.floor(t / 1000 / R.ROCK.reseed));
    if (rock) { this.rocks.set(rock.id, rock); this.slots.set(key, rock); this.gridAdd(rock); }
    else c.back = t + 3600_000;                // (an empty roll stays empty until the next reseed)
  }
  dropRock(r, back) {                          // gone: its slot re-rolls (a new place, size and layout) after `back` seconds
    this.rocks.delete(r.id); this.slots.delete(r.key); this.gridDel(r);
    const c = this.cells.get(r.cell); if (c) { c.gen++; c.back = now() + back * 1000; }
    for (const p of this.players.values()) { if (p.tow === r.id) p.tow = null; if (p.mark && p.mark.rock === r.id) p.mark = null; if (p.drill && p.drill.rock === r.id) p.drill = null; }
  }
  wakeAround(t) {
    const R2 = W.loadR + W.cell;
    for (const p of this.players.values()) {
      const c0 = Math.floor((p.x - R2) / W.cell), c1 = Math.floor((p.x + R2) / W.cell), d0 = Math.floor((p.y - R2) / W.cell), d1 = Math.floor((p.y + R2) / W.cell);
      for (let cx = c0; cx <= c1; cx++) for (let cy = d0; cy <= d1; cy++) this.wakeCell(cx, cy, t);
    }
    for (const [key, c] of this.cells) if (c.awake && c.awake < t) {
      c.awake = 0;
      const r = this.slots.get(key); if (r && r.home && !r.touched) { this.rocks.delete(r.id); this.slots.delete(r.key); this.gridDel(r); }
    }
    // heat cools on its own, chunk by chunk and in the core; an overheated core burns itself down and pops early
    for (const r of [...this.rocks.values()]) {
      if (r.hot && r.hot.size) for (const i of [...r.hot]) { const ch = r.chunks[i]; const s0 = this.heatStage(ch); ch.heat = Math.max(0, (ch.heat || 0) - R.HEAT.cool); if (this.heatStage(ch) !== s0) r.v++; if (ch.heat <= 0) r.hot.delete(i); }
      const c = r.core;
      if ((c.heat || 0) > 0 && !c.popped) {
        if (c.heat >= 1) { c.hp -= c.maxHp * R.HEAT.burn; if (c.hp <= 0) { this.popCore(r, null); continue; } }
        c.heat = Math.max(0, c.heat - R.HEAT.coreCool);
      }
    }
    for (const r of [...this.rocks.values()]) if (r.touched && t - r.touched > R.ROCK.linger * 1000 && !r.tow) this.dropRock(r, R.ROCK.respawn);
    for (const can of [...this.cans.values()]) if (!can.heldBy && can.publicUntil && t > can.publicUntil) this.deleteCan(can);
  }
  allowed(p, x, y) { const r = hyp(x, y); return r >= W.saturnR + FLY.shipR && r <= W.lockedR; }
  resetField() {                               // (the developer panel changed the world's shape: every rock regrows)
    for (const r of [...this.rocks.values()]) this.gridDel(r);
    this.rocks.clear(); this.slots.clear(); this.cells.clear();
    for (const p of this.players.values()) p.tow = null;
  }

  // ---- players ----
  async join(id, name) {
    id = String(id); let p = this.players.get(id);
    if (p) { p.name = name; return p; }
    await this.ready; await (this.offline.get(id) || Promise.resolve());
    const { rows } = await pool.query(`SELECT * FROM ring_players WHERE user_id = $1`, [id]), r = rows[0];
    const [sx, sy] = W.station;
    p = { id, name, x: sx, y: sy + 120, h: 0, vx: 0, vy: 0, fx: 0, fy: 0, aim: 0, firing: false, fuel: R.ECON.startFuel, ship: R.START.ship,
      credits: R.ECON.startCredits, hold: [], cans: [], rate: 0, payer: null, hire: null, tow: null, pumpTo: null,
      drill: null, toolAlt: false, boostUntil: 0, boostMul: 1, boostBy: null, abilityAt: 0, mark: null, storage: {},
      laserLen: 0, laserOn: false, laserRock: null, laserChunk: -1, docked: false, party: null,
      fuelBy: {}, dirty: true, hAt: 0, zone: "" };
    if (r) {
      if (r.fuel_by && typeof r.fuel_by === "object") for (const [k, v] of Object.entries(r.fuel_by)) if (SHIPS[k] && Number.isFinite(+v)) p.fuelBy[k] = Math.max(0, +v);
      if (r.storage && typeof r.storage === "object") for (const [o, v] of Object.entries(r.storage)) if (R.ORES[o] && Number.isFinite(+v) && +v > 0) p.storage[o] = Math.round(+v);
      Object.assign(p, { x: r.x, y: r.y, h: r.h, fuel: r.fuel, ship: SHIPS[r.module] ? r.module : R.START.ship, credits: +r.credits,
        hold: Array.isArray(r.hold) ? r.hold.filter((e) => e && R.ORES[e.o] && Number.isFinite(e.u)) : [] });
      if (!this.allowed(p, p.x, p.y)) { p.x = sx; p.y = sy + 120; }
      for (const can of this.cans.values()) if (can.heldBy === id) p.cans.push(can.id);
    }
    const S = this.shipOf(p); if (p.fuel > S.tank) p.fuel = S.tank;
    p.zone = zoneOf(p.x, p.y);
    this.players.set(id, p);
    await pool.query(`INSERT INTO ring_players (user_id, x, y, h, fuel, module, modules) VALUES ($1, $2, $3, $4, $5, $6, '[]')
      ON CONFLICT (user_id) DO UPDATE SET logout_at = NULL`, [id, p.x, p.y, p.h, p.fuel, p.ship]);
    return p;
  }
  async leave(id) {
    const p = this.players.get(String(id)); if (!p) return;
    if (p.tow) { const r = this.rocks.get(p.tow); if (r && r.tow === p.id) r.tow = null; p.tow = null; }
    for (const q of this.players.values()) { if (q.pumpTo === p.id) q.pumpTo = null; if (q.payer === p.id) q.payer = null; if (q.hire === p.id) q.hire = null; }
    this.leaveParty(p, true); this.players.delete(p.id);
    await this._save(p); await pool.query(`UPDATE ring_players SET logout_at = now() WHERE user_id = $1`, [p.id]);
  }
  respawn(id) { const p = this.players.get(String(id)); if (!p) return null; const [sx, sy] = W.station; return this.teleport(id, sx, sy + 120); }
  teleport(id, x, y) {
    const p = this.players.get(String(id)); if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (hyp(x, y) < W.saturnR + 60) { const a = Math.atan2(y, x); x = Math.cos(a) * (W.saturnR + 80); y = Math.sin(a) * (W.saturnR + 80); }
    if (p.tow) { const r = this.rocks.get(p.tow); if (r) r.tow = null; p.tow = null; }
    p.drill = null;
    p.x = x; p.y = y; p.vx = p.vy = 0; p.zone = zoneOf(x, y); p.dirty = true;
    this.msgs.push({ to: p.id, m: { t: "teleport", x, y } }); return p;
  }
  setInput(id, m) {
    const p = this.players.get(String(id)); if (!p) return;
    const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    let fx = n(m.x), fy = n(m.y); const L = hyp(fx, fy); if (L > 1) { fx /= L; fy /= L; }
    p.fx = fx; p.fy = fy;
    if (typeof m.h === "number" && Number.isFinite(m.h)) {
      const t = now(), dt = Math.min(0.5, (t - (p.hAt || t)) / 1000) + 0.1, mx = FLY.turn * dt * 1.3, d = Math.atan2(Math.sin(m.h - p.h), Math.cos(m.h - p.h));
      p.h = p.h + Math.max(-mx, Math.min(mx, d)); p.h = Math.atan2(Math.sin(p.h), Math.cos(p.h)); p.hAt = t;
    }
    p.aim = n(m.a); p.firing = m.f === 1; p.toolAlt = m.md === 1;
  }
  burn(p, amt) { p.fuel = Math.max(0, p.fuel - amt); }

  // walk a ray into a rock. For the laser: the first unbroken chunk (or the core, down an open bore). For the scanner:
  // scanned chunks are glass, so the first unbroken chunk not yet scanned (or nothing once the way to the core is mapped).
  castRock(rock, px, py, ux, uy, forScan) {
    const dx = px - rock.x, dy = py - rock.y;
    const b = dx * ux + dy * uy, c0 = dx * dx + dy * dy - rock.r * rock.r;
    const disc = b * b - c0; if (disc < 0) return null;             // the line misses the rock
    const t1 = -b + Math.sqrt(disc); if (t1 < 0) return null;       // the rock is behind
    for (let t = Math.max(0, -b - Math.sqrt(disc)); t <= t1; t += 1.2) {
      const x = px + ux * t - rock.x, y = py + uy * t - rock.y, rr = hyp(x, y);
      if (rr <= rock.core.r0 + 1) return { core: true, t };
      const ch = this.chunkAt(rock, rr, Math.atan2(y, x));
      if (ch && !ch.broken && (!forScan || !ch.scanned)) return { chunk: ch, t };
    }
    return null;
  }
  dmgStage(c) { return Math.min(3, Math.max(0, Math.floor(Math.max(c.d === 4 ? (c.wear || 0) / c.maxHp : 0, 1 - Math.max(0, c.hp) / c.maxHp) * 4))); }
  heatStage(c) { return Math.round(Math.min(1, Math.max(0, c.heat || 0)) * 4); }
  heatChunk(rock, c, amt) {                    // (owner, 2026-10-18) mined chunks run orange; the stage rides to clients
    const s0 = this.heatStage(c);
    c.heat = Math.max(0, Math.min(1, (c.heat || 0) + amt));
    if (this.heatStage(c) !== s0) rock.v++;
    if (c.heat > 0.001) (rock.hot || (rock.hot = new Set())).add(c.i);
  }
  claimedByOther(rock, p) {                    // (owner, 2026-10-18) towing lays claim: only the tower and their party work the rock
    if (!rock.tow || rock.tow === p.id) return false;
    const q = this.players.get(rock.tow);
    return !(q && q.party && q.party === p.party);
  }
  usedSpace(p) { return p.hold.reduce((s, e) => s + unitSpace(e), 0) + p.cans.reduce((s, cid) => { const c = this.cans.get(cid); return s + (c ? this.spaceOf(c) : 0); }, 0); }
  chunkAt(rock, rr, ang) {
    const a = normA(ang);
    for (const sh of rock.shells) {
      if (rr < sh.r0 || rr > sh.r1) continue;
      for (const i of sh.segs) { const c = rock.chunks[i]; if (rr >= c.r0 && rr <= c.r1 && spanHas(c, a)) return c; }
    }
    return null;
  }
  nearChunk(rock, c, x, y, tol) {              // is this world point within tol meters of the chunk's footprint?
    const rr = hyp(x - rock.x, y - rock.y);
    if (rr < c.r0 - tol || rr > c.r1 + tol) return false;
    const a = normA(Math.atan2(y - rock.y, x - rock.x));
    if (spanHas(c, a)) return true;
    const off = Math.min(normA(a - c.a1), normA(c.a0 - a));   // angular gap past either edge
    return off * Math.max(rr, 1) <= tol;
  }

  step(dt) {
    const t = now();
    for (const p of this.players.values()) {
      const S = this.shipOf(p), empty = p.fuel <= 0.0001, rock = p.tow && this.rocks.get(p.tow);
      const towK = rock ? Math.max(0.2, 60 / (60 + rock.r)) : 1;
      const k = empty ? FLY.crawl : 1, spd = S.speed * k * towK, push = hyp(p.fx, p.fy);
      const a = (push > 0.01 ? FLY.accel : FLY.brake) * (push > 0.01 ? k : 1) * dt;
      let ex = p.fx * spd - p.vx, ey = p.fy * spd - p.vy; const el = hyp(ex, ey); if (el > a) { ex *= a / el; ey *= a / el; }
      p.vx += ex; p.vy += ey;
      if (push > 0.01 && !empty) this.burn(p, FLY.flyBurn / 60 * push * dt);
      if (p.vx || p.vy) {
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (this.allowed(p, nx, ny)) { p.x = nx; p.y = ny; }
        else if (this.allowed(p, nx, p.y)) { p.x = nx; p.vy = 0; } else if (this.allowed(p, p.x, ny)) { p.y = ny; p.vx = 0; } else { p.vx = p.vy = 0; }
        for (const r of this.rocksNear(p.x, p.y, 220)) {
          if (r.id === p.tow) continue; const d = hyp(p.x - r.x, p.y - r.y), min = r.r + FLY.shipR;
          if (d < min && d > 0.01) { const ux = (p.x - r.x) / d, uy = (p.y - r.y) / d; p.x = r.x + ux * min; p.y = r.y + uy * min; const vn = p.vx * ux + p.vy * uy; if (vn < 0) { p.vx -= vn * ux; p.vy -= vn * uy; } }
        }
        const z = zoneOf(p.x, p.y); if (z !== p.zone) { p.zone = z; p.meDirty = true; }
        p.dirty = true;
      }
      const dock = hyp(p.x - W.station[0], p.y - W.station[1]) < R.ECON.dockR;
      if (dock && !p.docked) this.deliver(p);
      if (dock !== p.docked) { p.docked = dock; p.meDirty = true; }
      if (dock) { p.tow = null; p.pumpTo = null; p.drill = null; }
      // beams. The mode switch (p.toolAlt) picks the Scanner's drill or the Booster's coolant beam over the laser.
      p.laserOn = false; p.laserLen = 0; p.laserRock = null; p.laserChunk = -1;
      if (!p.firing) p.lockTgt = null;
      const boosted = (p.boostUntil || 0) > t || !!S.boost;        // pulsed, or a Booster's own laser (slowly)
      const boostMul = (p.boostUntil || 0) > t ? (p.boostMul || 1) : 1;
      const altTool = !!p.toolAlt && !!(S.drillSpeed || S.boost);
      if (p.firing && !dock && S.laserDps && !altTool) {
        const ux = Math.cos(p.aim), uy = Math.sin(p.aim); let best = null, bd = S.laserRange;
        for (const r of this.rocksNear(p.x, p.y, S.laserRange + 300)) {
          const hit = this.castRock(r, p.x, p.y, ux, uy, false);
          if (hit && hit.t <= S.laserRange && hit.t < bd) { bd = hit.t; best = { r, hit }; }
        }
        if (best) {
          const claimed = this.claimedByOther(best.r, p);          // a towed rock is claimed: only the tower and their party mine it
          const dps = S.laserDps * boostMul;
          this.burn(p, S.burn / 60 * dt);
          p.laserOn = !claimed; p.laserLen = best.hit.t; p.laserRock = best.r.id;
          if (!claimed) {
            best.r.touched = t; best.r.home = false;
            if (best.hit.core) { this.hitCore(best.r, dps * dt, p); p.lockTgt = null; }
            else {
              let ch = best.hit.chunk;             // sticky: a wiggle onto a touching chunk keeps cutting the one under way,
              const prev = p.lockTgt && p.lockTgt.rock === best.r.id ? best.r.chunks[p.lockTgt.i] : null;
              if (prev && prev !== ch && !prev.broken && prev.adj.includes(ch.i)
                && this.nearChunk(best.r, prev, p.x + ux * best.hit.t, p.y + uy * best.hit.t, 3)) ch = prev;   // but only while the aim stays by its edge
              p.lockTgt = { rock: best.r.id, i: ch.i };
              p.laserChunk = ch.i; const st0 = this.dmgStage(ch);
              // (owner, 2026-10-18) heat: the mined chunk runs orange (denser and bedrock hotter, a boosted beam hotter
              // still) and leaks heat to the chunks touching it
              const H = R.HEAT, hFac = [H.hSoft, H.hNormal, H.hDense, H.hUltra, H.hBed][ch.d] || 1;
              const hAmt = H.rate * hFac * (boosted ? Math.max(1, boostMul) : 1) * dt;
              this.heatChunk(best.r, ch, hAmt);
              for (const ni of ch.adj) { const n = best.r.chunks[ni]; if (!n.broken) this.heatChunk(best.r, n, hAmt * H.spread); }
              if (ch.d !== 4 || boosted) {       // only a boosted laser — or a Booster's own — cuts bedrock, and banks its rich ore
                ch.hp -= dps * dt;
                if (ch.hp <= 0) this.breakChunk(best.r, ch, p); else if (this.dmgStage(ch) !== st0) best.r.v++;
              } else {                           // an unboosted laser: bedrock holds — the cracks spread, then it turns dark red
                ch.wear = (ch.wear || 0) + dps * dt;
                if (!ch.scanned && ch.wear >= ch.maxHp) { ch.scanned = true; best.r.v++; }
                else if (this.dmgStage(ch) !== st0) best.r.v++;
              }
            }
          }
        } else p.laserLen = S.laserRange;
      }
      // the Booster's coolant beam (its other mode; owner, 2026-10-18): pulls heat out of the chunk it touches, or the
      // core down a bore
      if (p.firing && !dock && S.boost && altTool) {
        const ux = Math.cos(p.aim), uy = Math.sin(p.aim); let best = null, bd = S.laserRange;
        for (const r of this.rocksNear(p.x, p.y, S.laserRange + 300)) {
          const hit = this.castRock(r, p.x, p.y, ux, uy, false);
          if (hit && hit.t <= S.laserRange && hit.t < bd) { bd = hit.t; best = { r, hit }; }
        }
        if (best) {
          this.burn(p, S.burn / 60 * dt);
          p.laserOn = true; p.laserLen = best.hit.t; p.laserRock = best.r.id;
          if (best.hit.core) best.r.core.heat = Math.max(0, (best.r.core.heat || 0) - R.HEAT.coolBeam * dt);
          else this.heatChunk(best.r, best.hit.chunk, -R.HEAT.coolBeam * dt);
        } else p.laserLen = S.laserRange;
      }
      // the Scanner's drill (its other mode; owner, 2026-10-18: like mining, held on): it bores a straight radial line
      // toward the core from wherever the ship sits, revealing each chunk the head passes — orbit the rock to sweep
      // columns (each new column starts fresh), let go to stop. It takes no ore. Bedrock is slow and shocks the chunks
      // touching it; what breaks that way loses its ore.
      if (p.firing && !dock && S.drillSpeed && altTool && p.fuel > 0.0001) {
        let rk = null, bd2 = S.drillRange;
        for (const r of this.rocksNear(p.x, p.y, S.drillRange + 300)) { const d = hyp(p.x - r.x, p.y - r.y) - r.r; if (d < bd2 && !r.core.popped && !this.claimedByOther(r, p)) { bd2 = d; rk = r; } }
        if (!rk) p.drill = null;
        else {
          const ang = Math.atan2(p.y - rk.y, p.x - rk.x);
          let entry = null;                     // the column: the first solid chunk from the surface along this radial
          for (let rr2 = rk.r - 0.6; rr2 > rk.core.r0; rr2 -= 1.2) { const c2 = this.chunkAt(rk, rr2, ang); if (c2 && !c2.broken) { entry = c2; break; } }
          if (!p.drill || p.drill.rock !== rk.id || p.drill.entry !== (entry ? entry.i : -1)) p.drill = { rock: rk.id, entry: entry ? entry.i : -1, depth: 0 };
          p.drill.ang = ang;
          this.burn(p, S.burn / 60 * dt);
          rk.touched = t; rk.home = false;
          const head = Math.max(rk.core.r0 + 1.2, rk.r - p.drill.depth);
          const ch = this.chunkAt(rk, head, ang);
          let speed = S.drillSpeed;
          if (ch && !ch.scanned) { ch.scanned = true; rk.v++; this.fx.push({ k: "scan", x: rk.x + Math.cos(ang) * head, y: rk.y + Math.sin(ang) * head }); }
          if (ch && ch.d === 4 && !ch.broken) {
            speed = S.drillSpeed * (S.drillBed || 0.2);
            for (const ni of ch.adj) {         // grinding bedrock shocks its neighbors; what breaks this way loses its ore
              const n = rk.chunks[ni]; if (n.broken || n.d === 4) continue;
              const st0 = this.dmgStage(n);
              n.hp -= n.maxHp * (S.drillShock || 0.08) * dt;
              if (n.hp <= 0) this.breakChunk(rk, n, p, true); else if (this.dmgStage(n) !== st0) rk.v++;
            }
          }
          if (rk.r - p.drill.depth > rk.core.r0 + 1) p.drill.depth += speed * dt;
        }
      } else if (S.drillSpeed) p.drill = null;
      if (rock) {                              // the scanner's tow (the old tractor): the rock follows on a leash
        if (rock.core.popped || p.fuel <= 0 || !S.towRange) { p.tow = null; rock.tow = null; }
        else {
          this.burn(p, S.towBurn / 60 * (1 + rock.r / 60) * dt);
          const L = rock.r + S.towLeash + 40, gx = p.x - Math.sin(p.h) * L, gy = p.y + Math.cos(p.h) * L;
          const dx = gx - rock.x, dy = gy - rock.y, d = hyp(dx, dy), pull = Math.min(1, dt * S.towPull);
          if (d > 1 && hyp(rock.x + dx * pull, rock.y + dy * pull) > W.saturnR + rock.r) { rock.x += dx * pull; rock.y += dy * pull; this.gridMove(rock); }
          rock.touched = t;
        }
      }
      if (p.pumpTo) {                          // the fueler
        const q = this.players.get(p.pumpTo), QS = q && this.shipOf(q);
        if (!q || q.docked || !S.pump || hyp(q.x - p.x, q.y - p.y) > S.pumpRange || p.fuel <= 0) p.pumpTo = null;
        else { const amt = Math.min(S.pump * dt, QS.tank - q.fuel, p.fuel); if (amt > 0) { this.burn(p, amt); q.fuel += amt; q.meDirty = true; } }
      }
      if (S.refineUnit && !dock) {             // the hauler's refinery compresses the cargo on the way home, a 100-unit block at a time
        p.refT = (p.refT || 0) + dt;
        if (p.refT >= S.refineUnit) { p.refT = 0; const e = p.hold.find((e2) => e2.raw && e2.u > 0); if (e) { const n = Math.min(R.CHUNK.oreUnit || 100, e.u); e.u -= n; let f = p.hold.find((e2) => !e2.raw && e2.o === e.o && JSON.stringify(e2.tag) === JSON.stringify(e.tag)); if (!f) { f = { o: e.o, u: 0, raw: 0, tag: e.tag }; p.hold.push(f); } f.u += n; if (!e.u) p.hold.splice(p.hold.indexOf(e), 1); p.meDirty = true; p.dirty = true; } }
      }
      // support for hire: strangers pay the posted rate while the service works near them (party members are free)
      if (p.rate > 0 && p.payer) {
        const q = this.players.get(p.payer);
        const active = q && !q.docked && hyp(q.x - p.x, q.y - p.y) <= R.SERVICES.range &&
          ((S.boost && q.boostBy === p.id && (q.boostUntil || 0) > t && q.laserOn) || (S.pump && p.pumpTo === q.id) || (S.drillSpeed && p.drill));
        if (!q) p.payer = null;
        else if (active && !(q.party && q.party === p.party)) {
          const pay = Math.min(q.credits, p.rate * dt);
          if (pay <= 0) { p.payer = null; q.hire = null; this.msgs.push({ to: q.id, m: { t: "chat", ch: "sys", text: "You're out of credits; the hire stopped." } }); }
          else { q.credits -= pay; p.credits += pay; q.meDirty = p.meDirty = true; q.dirty = p.dirty = true; }
        }
      }
      if (p.firing || p.pumpTo || p.tow || p.drill) p.meDirty = true;
      p.sos = p.fuel <= 0.0001 && !p.docked;
    }
    for (const p of this.players.values()) if (p.meDirty) { p.dirty = true; }
  }

  // breaking a chunk banks its ore into the core and shocks every touching chunk; chains cascade. Shocks never reach
  // bedrock or the core (a direct boosted break is the only way bedrock goes). A lossy break — the drill's collateral —
  // banks nothing, and its whole cascade loses the ore too.
  breakChunk(rock, ch, breaker, lossy) {
    const queue = [{ c: ch, direct: true }];
    while (queue.length) {
      const { c, direct } = queue.shift(); if (c.broken || (c.d === 4 && !direct)) continue;
      c.broken = true; rock.v++;
      rock.core.heat = Math.min(1.25, (rock.core.heat || 0) + (c.heat || 0) * R.HEAT.coreK);   // the chunk's heat at the break pours into the core
      if (!lossy && c.u > 0 && c.ore) {
        const b = rock.core.banked[breaker.id] || (rock.core.banked[breaker.id] = {});
        b[c.ore] = (b[c.ore] || 0) + c.u; rock.core.bankedTotal += c.u;
      }
      const mid = (c.r0 + c.r1) / 2, ang = c.a0 + normA(c.a1 - c.a0) / 2;
      this.fx.push({ k: "crack", x: rock.x + Math.cos(ang) * mid, y: rock.y + Math.sin(ang) * mid, rx: rock.x, ry: rock.y, u: lossy ? 0 : c.u, ore: c.ore || 0 });
      for (const ni of c.adj) {
        const n = rock.chunks[ni]; if (n.broken || n.d === 4) continue;
        n.hp -= n.maxHp * R.CHUNK.burst;
        if (n.hp <= 0) queue.push({ c: n });
      }
    }
    rock.touched = now(); rock.home = false;
  }
  hitCore(rock, dmg, p) {                      // a hot core breaks faster (owner, 2026-10-18: heat, not banked units)
    const heat = Math.min(1, rock.core.heat || 0);
    rock.core.hp -= dmg * (1 + (R.CORE.fastBreak - 1) * heat);
    rock.touched = now(); rock.home = false;
    if (rock.core.hp <= 0 && !rock.core.popped) this.popCore(rock, p);
  }
  // the pop pays everything banked, each miner's bank to them (to the popper if they're gone), plus the rare ore to the
  // popper, scaled by how stripped the rock is; everything still attached shatters and its ore is lost
  popCore(rock, popper) {
    rock.core.popped = true;
    const breakable = rock.chunks.filter((c) => c.d !== 4), strip = breakable.length ? breakable.filter((c) => c.broken).length / breakable.length : 1;
    for (const [pid, ores] of Object.entries(rock.core.banked)) {
      const q = this.players.get(pid), rcv = q && hyp(q.x - rock.x, q.y - rock.y) <= W.loadR ? q : popper;
      if (rcv) for (const [o, u] of Object.entries(ores)) this.giveOre(rcv, o, u, rock);   // (no popper — an overheated core burning down — forfeits the absent)
    }
    const rare = Math.round(rock.core.rareMax * strip);
    if (rare > 0 && popper) this.giveOre(popper, "core", rare, rock);
    this.fx.push({ k: "pop", x: rock.x, y: rock.y, r: rock.r });
    this.dropRock(rock, R.ROCK.respawn);
  }
  // ore lands in the hold; what doesn't fit goes into a can locked to the player, or the party's crate
  giveOre(p, o, u, rock) {
    if (!p || u <= 0) return;
    const party = this.partyOf(p), tag = party ? [...party.members] : [p.id];
    const S = this.shipOf(p), room = Math.max(0, S.hold - this.usedSpace(p));
    const into = Math.min(u, Math.floor(room));
    if (into > 0) { let e = p.hold.find((e2) => e2.raw && e2.o === o && JSON.stringify(e2.tag) === JSON.stringify(tag)); if (!e) { e = { o, u: 0, raw: 1, tag }; p.hold.push(e); } e.u += into; p.meDirty = true; p.dirty = true; }
    const over = u - into;
    if (over > 0) this.intoCan(p, o, over, rock ? rock.x : p.x, rock ? rock.y : p.y, party, tag);
    this.fx.push({ k: "pay", x: p.x, y: p.y, rx: rock ? rock.x : p.x, ry: rock ? rock.y : p.y, i: p.id, u });
  }
  intoCan(p, o, u, x, y, party, tag) {
    const kind = party ? "crate" : "can";
    let can = [...this.cans.values()].find((c) => c.owner === p.id && c.kind === kind && !c.heldBy && (!party || c.rosterKey === tag.join(",")) && hyp(c.x - x, c.y - y) < 120);
    if (!can) {
      if (!party) { const old = [...this.cans.values()].find((c) => c.owner === p.id && c.kind === "can" && !c.heldBy); if (old) this.deleteCan(old); }   // one can per player
      can = { id: this.canSeq++, x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 40, kind, contents: {}, owner: p.id, roster: tag, rosterKey: tag.join(","),
        share: null, heldBy: null, lockUntil: now() + R.CANS.lock * 1000, publicUntil: now() + (R.CANS.lock + R.CANS.public) * 1000, dirty: true };
      this.cans.set(can.id, can);
    }
    can.contents[o] = (can.contents[o] || 0) + u; can.dirty = true; can.lockUntil = now() + R.CANS.lock * 1000; can.publicUntil = now() + (R.CANS.lock + R.CANS.public) * 1000;
  }
  deleteCan(can) { this.cans.delete(can.id); pool.query(`DELETE FROM ring_cans WHERE id = $1`, [can.id]).catch(() => {}); }

  // ---- delivery (owner, 2026-10-18): the ore itself is split between the tagged players — no exchange for money.
  // Each player's share is a whole percent rounded up in their favor (3 players: 34% each). The ore lands in station
  // storage, where its owner can sell it for credits when they choose. ----
  splitPct(n) { return Math.ceil(100 / Math.max(1, n)); }
  sumText(ores) { return Object.entries(ores).filter(([, u]) => u > 0).map(([o, u]) => Math.round(u) + " " + (R.ORES[o] ? R.ORES[o].name : o)).join(", "); }
  storageAdd(pid, ores, note) {
    if (!Object.entries(ores).some(([o, u]) => u > 0 && R.ORES[o])) return;
    const q = this.players.get(pid);
    if (q) {
      for (const [o, u] of Object.entries(ores)) if (u > 0 && R.ORES[o]) q.storage[o] = (q.storage[o] || 0) + Math.round(u);
      q.meDirty = true; q.dirty = true;
      if (note) this.msgs.push({ to: pid, m: { t: "chat", ch: "sys", text: note + " " + this.sumText(ores) + " into storage." } });
    } else {
      const chain = (this.offline.get(pid) || Promise.resolve()).then(async () => {
        const { rows } = await pool.query(`SELECT storage FROM ring_players WHERE user_id = $1`, [pid]);
        const st = rows[0] && rows[0].storage && typeof rows[0].storage === "object" ? rows[0].storage : {};
        for (const [o, u] of Object.entries(ores)) if (u > 0 && R.ORES[o]) st[o] = (+st[o] || 0) + Math.round(u);
        await pool.query(`UPDATE ring_players SET storage = $2 WHERE user_id = $1`, [pid, JSON.stringify(st)]);
      }).catch((e) => console.error("ring pay", e));
      this.offline.set(pid, chain);
    }
  }
  paySplit(roster, contents, note, ofN) {      // each player's share of the ore, at the favorable whole percent
    const pct = this.splitPct(ofN || roster.length);
    for (const pid of roster) { const share = {}; for (const [o, u] of Object.entries(contents)) share[o] = Math.round(u * pct / 100); this.storageAdd(pid, share, note); }
  }
  valueOf(contents) { return Object.entries(contents).reduce((s, [o, u]) => s + (R.ORES[o] ? R.ORES[o].price * u : 0), 0); }
  deliver(p) {
    const rosters = new Map();                 // tag key -> { ore: units }
    const addTo = (m2, o, u) => { m2[o] = (m2[o] || 0) + u; };
    for (const e of p.hold) { const k = e.tag.join(","); if (!rosters.has(k)) rosters.set(k, {}); addTo(rosters.get(k), e.o, e.u); }
    p.hold = [];
    const mineOres = {};
    for (const [k, contents] of rosters) {
      const roster = k.split(",");
      if (roster.length === 1 && roster[0] === p.id) { for (const [o, u] of Object.entries(contents)) addTo(mineOres, o, u); }
      else this.paySplit(roster, contents, "Delivery:");
    }
    for (const id of [...p.cans]) {
      const can = this.cans.get(id); if (!can) continue;
      if (can.mode === "public") { for (const [o, u] of Object.entries(can.contents)) addTo(mineOres, o, u); }
      else if (can.mode === "unlocked") {      // the deliverer keeps their locked share of the ore; the party splits the rest
        const rest = {};
        for (const [o, u] of Object.entries(can.contents)) { const keep = Math.round(u * can.share); addTo(mineOres, o, keep); rest[o] = u - keep; }
        this.paySplit(can.roster, rest, "Delivery:");
      }
      else if (can.kind === "crate") this.paySplit(can.roster, can.contents, "Delivery:");
      else this.storageAdd(can.owner, can.contents, "Delivery:");
      this.deleteCan(can);
    }
    p.cans = [];
    if (Object.keys(mineOres).length) this.storageAdd(p.id, mineOres, "Delivery:");
    p.meDirty = true; p.dirty = true;
    this.fx.push({ k: "deliver", x: p.x, y: p.y, i: p.id });
  }
  async banned(id) {                           // (admin) a banned account's tagged cargo still pays the others on its tags, in ore
    const p = this.players.get(String(id)); if (!p) return;
    for (const e of p.hold) { const roster = e.tag.filter((x) => x !== p.id); if (roster.length) this.paySplit(roster, { [e.o]: e.u }, null, e.tag.length); }
    p.hold = []; for (const id2 of p.cans) { const can = this.cans.get(id2); if (can) { can.heldBy = null; can.x = p.x; can.y = p.y; can.dirty = true; } } p.cans = [];
  }

  // ---- commands ----
  act(id, m) {
    const p = this.players.get(String(id)); if (!p || !m) return;
    const S = this.shipOf(p), say = (text) => this.msgs.push({ to: p.id, m: { t: "chat", ch: "sys", text } });
    if (typeof m.rock === "string") {          // marking, and the scanner's tow
      const r = this.rocks.get(m.rock); if (!r) return;
      if (m.op === "mark") {                   // (owner, 2026-10-18) a marked rock rides the minimap for me and my party until it's gone
        p.mark = p.mark && p.mark.rock === r.id ? null : { rock: r.id, x: Math.round(r.x), y: Math.round(r.y) };
      } else if (m.op === "tow" && S.towRange) {
        if (p.tow === r.id) { p.tow = null; r.tow = null; }
        else if (!r.core.popped && (!r.tow || !this.players.has(r.tow)) && hyp(r.x - p.x, r.y - p.y) - r.r <= S.towRange && p.fuel > 0) {
          if (p.tow) { const o = this.rocks.get(p.tow); if (o) o.tow = null; }
          p.tow = r.id; r.tow = p.id; r.touched = now(); r.home = false;
        }
      }
    } else if (m.op === "ability") {           // (owner, 2026-10-18) the Booster's pulse: everyone nearby boosted for a short time; fuel per press
      if (!S.boost || p.docked) return;
      const t2 = now();
      if (t2 < (p.abilityAt || 0) + (S.boostCd || 20) * 1000) return;
      if (p.fuel < (S.boostFuel || 0)) { say("Not enough fuel."); return; }
      this.burn(p, S.boostFuel || 0); p.abilityAt = t2;
      for (const q of this.players.values()) if (!q.docked && hyp(q.x - p.x, q.y - p.y) <= S.boostRange) { q.boostUntil = t2 + (S.boostDur || 8) * 1000; q.boostMul = S.boost; q.boostBy = p.id; q.meDirty = true; }
      this.fx.push({ k: "pulse", x: p.x, y: p.y, r: S.boostRange });
    } else if (typeof m.ship === "string") {
      const q = this.players.get(m.ship); if (!q || q === p || q.docked) return; const d = hyp(q.x - p.x, q.y - p.y);
      if (m.op === "pump" && S.pump) { if (d <= S.pumpRange || p.pumpTo === q.id) p.pumpTo = p.pumpTo === q.id ? null : q.id; }
      else if (m.op === "hire") {              // I pay q's posted rate while their service works near me
        if (p.hire === q.id) { p.hire = null; if (q.payer === p.id) q.payer = null; say("Stopped hiring " + q.name + "."); return; }
        if (!(q.rate > 0)) { say(q.name + " hasn't posted a rate."); return; }
        if (q.party && q.party === p.party) { say("Party members are free."); return; }
        if (q.payer && q.payer !== p.id) { say(q.name + " is already hired."); return; }
        p.hire = q.id; q.payer = p.id;
        say("Hiring " + q.name + " at " + q.rate + " cr/s while they work near you.");
        this.msgs.push({ to: q.id, m: { t: "chat", ch: "sys", text: p.name + " hired you at " + q.rate + " cr/s." } });
      }
    } else if (Number.isInteger(m.can)) {      // taking a can or crate aboard (there is no dropping it: delivery is the only way out)
      const can = this.cans.get(m.can); if (!can || can.heldBy || hyp(can.x - p.x, can.y - p.y) > FLY.interactR) return;
      const t = now(), mine = can.owner === p.id, party = can.kind === "crate" && can.roster.includes(p.id);
      const pub = t > can.lockUntil && can.kind === "can", unlocked = can.kind === "crate" && can.share != null && !party;
      if (!(mine || party || pub || unlocked)) { say("That " + (can.kind === "crate" ? "crate" : "can") + " is locked."); return; }
      if (this.spaceOf(can) > S.hold - this.usedSpace(p) + 1e-6) { say("No room aboard."); return; }
      can.heldBy = p.id; can.mode = pub ? "public" : unlocked ? "unlocked" : null; can.dirty = true;   // (the share locks at pickup)
      p.cans.push(can.id); p.meDirty = true;
      this.fx.push({ k: "hand", x: can.x, y: can.y, x2: p.x, y2: p.y });
    } else if (m.op === "unlock" && Number.isInteger(m.canId)) {   // a crate's owner opens it to outside haulers, picking the deliverer's share
      const can = this.cans.get(m.canId); if (!can || can.kind !== "crate" || can.owner !== p.id || can.heldBy) return;
      const sh = Math.max(R.CRATE_SHARE[0], Math.min(R.CRATE_SHARE[1], Number(m.share)));
      if (!Number.isFinite(sh)) return;
      can.share = sh; can.dirty = true; say("Crate unlocked: a deliverer outside the party keeps " + Math.round(sh * 100) + "%.");
    } else if (m.op === "drop") {              // (owner, 2026-10-18) jettison the hold into a can or party crate — haulers never drop
      if (S.refineUnit) { say("Haulers can never drop."); return; }
      if (p.docked || !p.hold.length) return;
      for (const e of p.hold) this.intoCan(p, e.o, e.u, p.x, p.y, e.tag.length > 1, e.tag);
      p.hold = []; p.meDirty = true; p.dirty = true;
      this.fx.push({ k: "hand", x: p.x, y: p.y });
    } else if (m.op === "rate") {              // a support ship posts its price (0 clears it)
      const v = Math.max(0, Math.min(R.SERVICES.maxRate, Number(m.v)));
      if (!Number.isFinite(v)) return;
      p.rate = Math.round(v * 10) / 10; p.meDirty = true;
      if (p.rate === 0 && p.payer) { const q = this.players.get(p.payer); if (q) q.hire = null; p.payer = null; }
      say(p.rate > 0 ? "Your rate is posted: " + p.rate + " cr/s." : "Your rate is cleared.");
    }
    p.meDirty = true;
  }
  station(id, m) {                             // docked only: board another ship, or fill the tank
    const p = this.players.get(String(id)); if (!p || !p.docked || !m || typeof m.op !== "string") return false;
    if (m.op === "ship") {
      if (!SHIPS[m.k] || p.ship === m.k) return false;
      if (p.cans.length || p.hold.length) return false;            // (cargo was just delivered on docking; belt and braces)
      p.fuelBy[p.ship] = p.fuel;                                   // (owner, 2026-10-18) each ship keeps its own tank
      p.ship = m.k; p.tow = null; p.pumpTo = null; p.drill = null; p.rate = 0;
      const T = this.shipOf(p).tank;
      p.fuel = Math.min(T, p.fuelBy[m.k] !== undefined ? p.fuelBy[m.k] : R.ECON.startFuel);
    } else if (m.op === "fuel") {
      const S = this.shipOf(p), space = S.tank - p.fuel, n = Math.min(space, p.credits / R.FUEL.stationPrice); if (n <= 0.01) return false;
      p.fuel += n; p.credits -= n * R.FUEL.stationPrice;
    } else if (m.op === "sell") {              // (owner, 2026-10-18) ore sells only when its owner chooses to, from storage
      const o = typeof m.o === "string" && R.ORES[m.o] ? m.o : null; if (!o) return false;
      const have = Math.floor(p.storage[o] || 0), n = Math.min(have, Math.max(0, Math.floor(Number(m.n) || 0)));
      if (n <= 0) return false;
      p.storage[o] = have - n; if (!p.storage[o]) delete p.storage[o];
      p.credits += n * R.ORES[o].price;
    } else return false;
    p.meDirty = true; p.dirty = true; return true;
  }

  // ---- parties (the only grouping; everything is split evenly on delivery) ----
  partyOf(p) { return p.party ? this.parties.get(p.party) : null; }
  invite(from, toId) {
    const p = this.players.get(from), q = this.players.get(toId); if (!p || !q || p === q) return "That player isn't online.";
    if (q.party && q.party === p.party) return q.name + " is already in your party.";
    const party = this.partyOf(p); if (party && party.members.size >= R.LIMITS.partyMax) return "Your party is full.";
    this.invites.set(q.id, { from: p.id, at: now() });
    this.msgs.push({ to: q.id, m: { t: "invite", kind: "party", from: p.id, name: p.name } });
    return "Invited " + q.name + " to your party.";
  }
  acceptParty(id) {
    const q = this.players.get(id), inv = this.invites.get(id); this.invites.delete(id);
    const p = inv && this.players.get(inv.from); if (!q || !p || now() - inv.at > 120_000) return "No party invite waiting.";
    let party = this.partyOf(p);
    if (!party) { party = { id: this.partySeq++, leader: p.id, members: new Set([p.id]) }; this.parties.set(party.id, party); p.party = party.id; p.socDirty = true; }
    if (party.members.size >= R.LIMITS.partyMax) return "That party is full.";
    this.leaveParty(q, false); party.members.add(q.id); q.party = party.id;
    for (const m of party.members) { const x = this.players.get(m); if (x) x.socDirty = true; }
    this.partyNote(party, q.name + " joined the party.");
    return null;
  }
  declineParty(id) { const inv = this.invites.get(id); this.invites.delete(id); const q = this.players.get(id); if (inv && q) this.msgs.push({ to: inv.from, m: { t: "chat", ch: "sys", text: q.name + " declined your party invite." } }); return null; }
  kickParty(from, toId) {
    const p = this.players.get(from), party = p && this.partyOf(p), q = this.players.get(toId);
    if (!party || party.leader !== p.id) return "Only the party leader can remove members.";
    if (!q || !party.members.has(q.id) || q === p) return "They're not in your party.";
    this.leaveParty(q, false, true); this.msgs.push({ to: q.id, m: { t: "chat", ch: "sys", text: "You were removed from the party." } });
    return null;
  }
  leaveParty(p, quiet, kicked) {               // tags on ore already earned outlast the party
    const party = this.partyOf(p); if (!party) return;
    party.members.delete(p.id); p.party = null; p.socDirty = true;
    for (const m of party.members) { const x = this.players.get(m); if (x) x.socDirty = true; }
    if (party.leader === p.id) party.leader = [...party.members][0];
    if (party.members.size <= 1) { for (const m of party.members) { const x = this.players.get(m); if (x) { x.party = null; x.socDirty = true; this.msgs.push({ to: m, m: { t: "chat", ch: "sys", text: "The party disbanded." } }); } } this.parties.delete(party.id); }
    else this.partyNote(party, p.name + (kicked ? " was removed from the party." : quiet ? " went offline and left the party." : " left the party."));
  }
  partyNote(party, text) { for (const m of party.members) this.msgs.push({ to: m, m: { t: "chat", ch: "sys", text } }); }

  // ---- the daily downtime: party crates auto-deliver, unless aboard a ship that logged off just before it ----
  async minutely() {
    await this.ready;
    const t = now(), d = new Date(t), due = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), R.DOWNTIME.hourUTC);
    for (const can of this.cans.values()) if (can.dirty) { can.dirty = false; await this.saveCan(can); }
    if (t < due || this.lastDowntime >= due) return;
    this.lastDowntime = due;
    await pool.query(`INSERT INTO ring_meta (k, v) VALUES ('downtime', $1) ON CONFLICT (k) DO UPDATE SET v = $1`, [String(due)]);
    for (const can of [...this.cans.values()]) {
      if (can.kind !== "crate") continue;
      if (can.heldBy && !this.players.has(can.heldBy)) {
        const { rows } = await pool.query(`SELECT logout_at FROM ring_players WHERE user_id = $1`, [can.heldBy]);
        const off = rows[0] && rows[0].logout_at ? new Date(rows[0].logout_at).getTime() : 0;
        if (off > due - R.DOWNTIME.logoffGuard * 1000) continue;   // grabbed and logged off at the last minute: it waits for them
      }
      this.paySplit(can.roster, can.contents, "Downtime delivery:");
      const holder = can.heldBy && this.players.get(can.heldBy); if (holder) { holder.cans = holder.cans.filter((x) => x !== can.id); holder.meDirty = true; }
      this.deleteCan(can);
    }
  }
  async saveCan(can) {
    await pool.query(`INSERT INTO ring_cans (id, x, y, kind, contents, owner, roster, share, held_by, mode, lock_until, public_until)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, to_timestamp($11 / 1000.0), to_timestamp($12 / 1000.0))
      ON CONFLICT (id) DO UPDATE SET x = $2, y = $3, contents = $5, roster = $7, share = $8, held_by = $9, mode = $10, lock_until = to_timestamp($11 / 1000.0), public_until = to_timestamp($12 / 1000.0)`,
      [can.id, can.x, can.y, can.kind, JSON.stringify(can.contents), can.owner, JSON.stringify(can.roster), can.share, can.heldBy, can.mode || null, can.lockUntil, can.publicUntil]).catch((e) => console.error("ring can", e));
  }
  async _save(p) {
    await this.ready;
    await pool.query(`UPDATE ring_players SET x = $2, y = $3, h = $4, fuel = $5, module = $6, credits = $7, hold = $8, fuel_by = $9, storage = $10, updated_at = now() WHERE user_id = $1`,
      [p.id, p.x, p.y, p.h, p.fuel, p.ship, p.credits, JSON.stringify(p.hold), JSON.stringify(p.fuelBy || {}), JSON.stringify(p.storage || {})]);
    p.dirty = false;
  }
  async saveDirty() { for (const p of this.players.values()) if (p.dirty) await this._save(p); }
  spaceOf(can) { return Object.values(can.contents).reduce((s, u) => s + u, 0); }

  // ---- what each player is sent ----
  // ships in vision: [id, x dm, y dm, h mrad, ship idx, flags (1 beam on target, 2 firing, 4 sos, 8 docked), aim mrad,
  // beam length, tow rock | 0, boost target | 0, pump target | 0, hold %, fuel %, rate x10]
  shipRowCache() {
    const out = [];
    for (const p of this.players.values()) {
      const S = this.shipOf(p), used = this.usedSpace(p);
      out.push({ p, key: "", row: [p.id, Math.round(p.x * 10), Math.round(p.y * 10), Math.round(p.h * 1000), R.SHIP_KINDS.indexOf(p.ship),
        (p.laserOn ? 1 : 0) | (p.firing && !p.docked ? 2 : 0) | (p.sos ? 4 : 0) | (p.docked ? 8 : 0) | (p.drill ? 16 : 0)
          | ((p.boostUntil || 0) > Date.now() ? 32 : 0) | (p.toolAlt && S.boost ? 64 : 0),
        Math.round(p.aim * 1000), Math.round(p.laserLen), p.drill ? p.drill.rock : (p.tow || 0), 0, p.pumpTo || 0,
        Math.round(used / S.hold * 100), Math.round(p.fuel / S.tank * 100), Math.round((p.rate || 0) * 10), Math.round(p.drill ? p.drill.depth : 0)] });
    }
    for (const e of out) e.key = JSON.stringify(e.row);
    return out;
  }
  shipRows(viewer, cache = this.shipRowCache()) {
    const V = this.visionOf(viewer);
    return cache.filter((e) => e.p === viewer || hyp(e.p.x - viewer.x, e.p.y - viewer.y) <= V);
  }
  // rocks in vision, as summaries: [id, x, y, size, outer r, core fill %, core hp %, towed]; the chunk layout travels
  // separately (rockDetail) for rocks close to the viewer, re-sent when its version changes
  rockRows(viewer) {
    const out = [], V = this.visionOf(viewer);
    for (const r of this.rocksNear(viewer.x, viewer.y, V + 200)) {
      if (hyp(r.x - viewer.x, r.y - viewer.y) > V + r.r) continue;   // (a big rock's edge can poke into vision)
      out.push([r.id, Math.round(r.x), Math.round(r.y), r.sizeIdx, Math.round(r.r), Math.round(Math.min(1, r.core.bankedTotal / r.core.total) * 100), Math.round(Math.max(0, r.core.hp / r.core.maxHp) * 100), r.tow ? 1 : 0, Math.round(Math.min(1.25, r.core.heat || 0) * 100)]);
    }
    return out;
  }
  // a chunk: [i, r0, r1, a0 mrad, a1 mrad, bits (1 broken, 2 scanned), density, ore idx | -1] — density and ore only
  // once scanned (hidden masonry: the layout's look can't be read out of the traffic before a scan)
  rockDetail(r) {
    return { t: "rockd", id: r.id, v: r.v, coreR: r.core.r0, c: r.chunks.map((c) => [c.i, Math.round(c.r0 * 10) / 10, Math.round(c.r1 * 10) / 10, Math.round(normA(c.a0) * 1000), Math.round(normA(c.a1) * 1000),
      (c.broken ? 1 : 0) | (c.scanned ? 2 : 0), c.scanned ? c.d : 0, c.scanned && c.ore ? ORE_KEYS.indexOf(c.ore) : -1, c.broken ? 0 : this.dmgStage(c), c.broken ? 0 : this.heatStage(c)]) };
  }
  canRows(viewer) {                            // [id, x, y, crate 0/1, state (0 locked to another, 1 yours/your party's, 2 public, 3 unlocked), held 0/1]
    const out = [], V = this.visionOf(viewer), t = now();
    for (const can of this.cans.values()) {
      if (can.heldBy) continue;
      if (hyp(can.x - viewer.x, can.y - viewer.y) > V) continue;
      const mine = can.owner === viewer.id || (can.kind === "crate" && can.roster.includes(viewer.id));
      const st = mine ? 1 : can.kind === "can" && t > can.lockUntil ? 2 : can.kind === "crate" && can.share != null ? 3 : 0;
      out.push([can.id, Math.round(can.x), Math.round(can.y), can.kind === "crate" ? 1 : 0, st, 0]);
    }
    return out;
  }
  meMsg(p) {
    const S = this.shipOf(p);
    const hold = p.hold.map((e) => ({ o: e.o, u: e.u, raw: e.raw ? 1 : 0, party: e.tag.length > 1 ? 1 : 0 }));
    const cans = p.cans.map((cid) => { const c = this.cans.get(cid); return c ? { id: c.id, crate: c.kind === "crate" ? 1 : 0, u: this.spaceOf(c), v: Math.round(this.valueOf(c.contents)) } : null; }).filter(Boolean);
    const myCrates = [...this.cans.values()].filter((c) => c.kind === "crate" && c.owner === p.id && !c.heldBy).map((c) => ({ id: c.id, u: this.spaceOf(c), share: c.share }));
    let myCan = null; for (const c of this.cans.values()) if (c.owner === p.id && !c.heldBy && (!myCan || c.id > myCan.id)) myCan = c;
    return { t: "me", fuel: Math.round(p.fuel * 10) / 10, tank: S.tank, cap: S.hold, hold, cans, myCrates, credits: Math.floor(p.credits), docked: p.docked ? 1 : 0,
      ship: p.ship, tow: p.tow || 0, drill: p.drill ? p.drill.rock : 0, pump: p.pumpTo || 0, hire: p.hire || 0, rate: p.rate || 0, sos: p.sos ? 1 : 0, zone: p.zone,
      storage: Object.fromEntries(Object.entries(p.storage).map(([o, u]) => [o, Math.round(u)])),
      myCan: myCan ? { id: myCan.id, x: Math.round(myCan.x), y: Math.round(myCan.y) } : 0,
      mark: p.mark ? 1 : 0,
      abilityIn: S.boostCd ? Math.max(0, Math.ceil(((p.abilityAt || 0) + S.boostCd * 1000 - now()) / 1000)) : 0 };
  }
  socMsg(p) {
    const party = this.partyOf(p);
    return { t: "soc", party: party ? { leader: party.leader, members: [...party.members].map((id) => { const q = this.players.get(id); return [id, q ? q.name : "?"]; }) } : null };
  }
  marksOf(p) {                               // my mark and my party's, for the minimap
    const out = []; if (p.mark) out.push([p.mark.x, p.mark.y]);
    if (p.party) for (const q of this.players.values()) if (q !== p && q.party === p.party && q.mark) out.push([q.mark.x, q.mark.y]);
    return out;
  }
  mates(p) { const out = []; if (!p.party) return out; for (const q of this.players.values()) { if (q !== p && q.party === p.party) out.push([q.id, Math.round(q.x), Math.round(q.y)]); } return out; }
  sosList() { const out = []; for (const p of this.players.values()) if (p.sos) out.push([p.id, Math.round(p.x), Math.round(p.y)]); return out; }
  roster() { return [...this.players.values()].map((p) => ({ i: p.id, n: p.name })); }
}
