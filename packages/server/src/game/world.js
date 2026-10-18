// (owner, 2026-10-18) The mining world, rebuilt to the sandbox build the owner iterated in the mining sandbox: asteroids
// are hidden masonry (shells of chunks around a core, thicker and heavier with bedrock deeper in the rings), the beam
// itself runs blue-yellow-red and only its hot stages heat the rock, the Miner overcharges breaking chunks into blasts,
// the Booster boosts one ship at a time with a held beam and cools with a spray, the Hauler refines its own cargo and
// other ships' with a beam, and overflow ore drifts as free-for-all drops hauled in as many trips as it takes. No fuel,
// no money, no parties, no cans: delivery pays ore into the deliverer's station storage. The server decides everything;
// clients send commands and predict their own ship.
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
    this.drops = new Map(); this.dropSeq = 1;  // ore adrift: free for anyone, picked up by flying over
    this.msgs = []; this.fx = [];
    this.offline = new Map();                  // player id -> promise chain (ore paid to offline players)
    this.ready = this._load();
    const t = setInterval(() => this.saveDirty().catch((e) => console.error("ring save", e)), 10_000); t.unref && t.unref();
  }
  async _load() {
    await pool.query(`CREATE TABLE IF NOT EXISTS ring_players (user_id TEXT PRIMARY KEY, x DOUBLE PRECISION NOT NULL, y DOUBLE PRECISION NOT NULL,
      h DOUBLE PRECISION NOT NULL DEFAULT 0, fuel DOUBLE PRECISION NOT NULL, fuel_from JSONB NOT NULL DEFAULT '{}', module TEXT NOT NULL, modules JSONB NOT NULL DEFAULT '[]',
      credits DOUBLE PRECISION NOT NULL DEFAULT 0, storage JSONB NOT NULL DEFAULT '{}', hold JSONB NOT NULL DEFAULT '[]', queue JSONB NOT NULL DEFAULT '[]',
      corp_id INTEGER, logout_at TIMESTAMPTZ, transit JSONB, transit_due TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await pool.query(`ALTER TABLE ring_players ADD COLUMN IF NOT EXISTS mods JSONB, ADD COLUMN IF NOT EXISTS hull INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS upgrades JSONB NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS tutorial INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS fuel_by JSONB NOT NULL DEFAULT '{}'`);
    // (owner, 2026-10-18) drifting ore drops replace cans and crates; the old ring_cans rows stay untouched for reference
    await pool.query(`CREATE TABLE IF NOT EXISTS ring_drops (id SERIAL PRIMARY KEY, x DOUBLE PRECISION NOT NULL, y DOUBLE PRECISION NOT NULL,
      ore TEXT NOT NULL, units INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ring_meta (k TEXT PRIMARY KEY, v JSONB NOT NULL)`);
    const { rows } = await pool.query(`SELECT * FROM ring_drops`);
    for (const r of rows) this.drops.set(r.id, { id: r.id, x: +r.x, y: +r.y, ore: r.ore, units: +r.units, born: new Date(r.created_at).getTime(), dirty: false });
    this.dropSeq = Math.max(1, ...[...this.drops.keys()].map((k) => k + 1));
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
    // (owner, 2026-10-18) size is the shell count, rolled per ring: thicker asteroids deeper in
    const [shMin, shMax] = R.RING_SHELLS[ring] || R.RING_SHELLS[0];
    const nSh = shMin + Math.floor(rand() * (shMax - shMin + 1)), SZ = R.ROCK_SIZE(nSh);
    const pool_ = [...R.RING_ORES[ring]]; const types = [];
    for (let i = 0; i < SZ.oreTypes && pool_.length; i++) types.push(pool_.splice(Math.floor(rand() * pool_.length), 1)[0]);
    const C = R.CHUNK, bedW = C.wBed * (R.RING_BED[ring] ?? 1);   // deeper rings run heavier with bedrock
    const freeLine = (R.RING_FREELINE[ring] ?? 1) > 0, freeA = rand() * TAU;   // the guaranteed bore line, where the ring grants one
    const chunks = [], shells = [];
    const baseTh = Math.max(3, ((SZ.radius || 90) - SZ.coreR - 2) / nSh);
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
    return { id: key + ":" + gen + ":" + epoch, key, cell: key, gen, x, y, ring, shellsN: nSh, r: rr, chunks, shells, nBroken: 0,
      core: { r0: SZ.coreR, hp: SZ.coreHp, maxHp: SZ.coreHp, banked: {}, bankedTotal: 0, total: Math.max(1, total), nBreak: chunks.length, rareMax: SZ.rareMax, popped: false },
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
    for (const p of this.players.values()) {
      if (p.tow === r.id) p.tow = null;
      if (p.mark && p.mark.rock === r.id) p.mark = null;
      if (p.drill && p.drill.rock === r.id) p.drill = null;
      if (p.chargeTgt && p.chargeTgt.rock === r.id) { p.chargeTgt = null; p.chargeAmt = 0; }
    }
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
    // heat cools on its own — chunks quick, the core a bit slower — and a share of what the chunks shed seeps into the
    // core (owner, 2026-10-18: heat transfers to the core over time, not only at breaks); an overheated core burns
    // itself down and pops early
    for (const r of [...this.rocks.values()]) {
      if (r.hot && r.hot.size) {
        let seep = 0;
        for (const i of [...r.hot]) { const ch = r.chunks[i]; const s0 = this.heatStage(ch); const shed = Math.min(ch.heat || 0, R.HEAT.cool); ch.heat = (ch.heat || 0) - shed; seep += shed * (R.HEAT.coreSeep || 0); if (this.heatStage(ch) !== s0) r.v++; if (ch.heat <= 0) r.hot.delete(i); }
        if (seep > 0 && !r.core.popped) r.core.heat = Math.min(1.25, (r.core.heat || 0) + seep);
      }
      const c = r.core;
      if ((c.heat || 0) > 0 && !c.popped) {
        if (c.heat >= 1) { c.hp -= c.maxHp * R.HEAT.burn; if (c.hp <= 0) { this.popCore(r, null); continue; } }
        c.heat = Math.max(0, c.heat - R.HEAT.coreCool);
      }
    }
    for (const r of [...this.rocks.values()]) if (r.touched && t - r.touched > R.ROCK.linger * 1000 && !r.tow) this.dropRock(r, R.ROCK.respawn);
    for (const d of [...this.drops.values()]) if (t - d.born > R.DROPS.linger * 1000) this.deleteDrop(d);
  }
  allowed(p, x, y) { const r = hyp(x, y); return r >= W.saturnR + FLY.shipR && r <= W.lockedR; }
  resetField() {                               // (the world's shape changed: every rock regrows)
    for (const r of [...this.rocks.values()]) this.gridDel(r);
    this.rocks.clear(); this.slots.clear(); this.cells.clear();
    for (const p of this.players.values()) { p.tow = null; p.drill = null; p.chargeTgt = null; p.chargeAmt = 0; }
  }

  // ---- players ----
  async join(id, name) {
    id = String(id); let p = this.players.get(id);
    if (p) { p.name = name; return p; }
    await this.ready; await (this.offline.get(id) || Promise.resolve());
    const { rows } = await pool.query(`SELECT * FROM ring_players WHERE user_id = $1`, [id]), r = rows[0];
    const [sx, sy] = W.station;
    p = { id, name, x: sx, y: sy + 120, h: 0, vx: 0, vy: 0, fx: 0, fy: 0, aim: 0, firing: false, ship: R.START.ship,
      hold: [], tow: null, drill: null, toolAlt: false, boostUntil: 0, boostMul: 1, boostBy: null, mark: null, storage: {},
      laserLen: 0, laserOn: false, laserRock: null, laserChunk: -1, beamTgt: null, beamT: 0, beamHot: false,
      chargeTgt: null, chargeAmt: 0, refT: 0, refOtherT: 0, docked: false, dirty: true, hAt: 0, zone: "" };
    if (r) {
      if (r.storage && typeof r.storage === "object") for (const [o, v] of Object.entries(r.storage)) if (R.ORES[o] && Number.isFinite(+v) && +v > 0) p.storage[o] = Math.round(+v);
      Object.assign(p, { x: r.x, y: r.y, h: r.h, ship: SHIPS[r.module] ? r.module : R.START.ship,
        hold: Array.isArray(r.hold) ? r.hold.filter((e) => e && R.ORES[e.o] && Number.isFinite(e.u)).map((e) => ({ o: e.o, u: e.u, raw: e.raw ? 1 : 0 })) : [] });
      if (!this.allowed(p, p.x, p.y)) { p.x = sx; p.y = sy + 120; }
    }
    p.zone = zoneOf(p.x, p.y);
    this.players.set(id, p);
    await pool.query(`INSERT INTO ring_players (user_id, x, y, h, fuel, module, modules) VALUES ($1, $2, $3, $4, 0, $5, '[]')
      ON CONFLICT (user_id) DO UPDATE SET logout_at = NULL`, [id, p.x, p.y, p.h, p.ship]);
    return p;
  }
  async leave(id) {
    const p = this.players.get(String(id)); if (!p) return;
    if (p.tow) { const r = this.rocks.get(p.tow); if (r && r.tow === p.id) r.tow = null; p.tow = null; }
    this.players.delete(p.id);
    await this._save(p); await pool.query(`UPDATE ring_players SET logout_at = now() WHERE user_id = $1`, [p.id]);
  }
  respawn(id) { const p = this.players.get(String(id)); if (!p) return null; const [sx, sy] = W.station; return this.teleport(id, sx, sy + 120); }
  teleport(id, x, y) {
    const p = this.players.get(String(id)); if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (hyp(x, y) < W.saturnR + 60) { const a = Math.atan2(y, x); x = Math.cos(a) * (W.saturnR + 80); y = Math.sin(a) * (W.saturnR + 80); }
    if (p.tow) { const r = this.rocks.get(p.tow); if (r) r.tow = null; p.tow = null; }
    p.drill = null; p.chargeTgt = null; p.chargeAmt = 0;
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

  // walk a ray into a rock. For the laser: the first unbroken chunk (or the core, down an open bore).
  castRock(rock, px, py, ux, uy) {
    const dx = px - rock.x, dy = py - rock.y;
    const b = dx * ux + dy * uy, c0 = dx * dx + dy * dy - rock.r * rock.r;
    const disc = b * b - c0; if (disc < 0) return null;             // the line misses the rock
    const t1 = -b + Math.sqrt(disc); if (t1 < 0) return null;       // the rock is behind
    for (let t = Math.max(0, -b - Math.sqrt(disc)); t <= t1; t += 1.2) {
      const x = px + ux * t - rock.x, y = py + uy * t - rock.y, rr = hyp(x, y);
      if (rr <= rock.core.r0 + 1) return { core: true, t };
      const ch = this.chunkAt(rock, rr, Math.atan2(y, x));
      if (ch && !ch.broken) return { chunk: ch, t };
    }
    return null;
  }
  dmgStage(c) { return Math.min(3, Math.max(0, Math.floor(Math.max(c.d === 4 ? (c.wear || 0) / c.maxHp : 0, 1 - Math.max(0, c.hp) / c.maxHp) * 4))); }
  heatStage(c) { return Math.round(Math.min(1, Math.max(0, c.heat || 0)) * 4); }
  heatChunk(rock, c, amt) {
    const s0 = this.heatStage(c);
    c.heat = Math.max(0, Math.min(1, (c.heat || 0) + amt));
    if (this.heatStage(c) !== s0) rock.v++;
    if (c.heat > 0.001) (rock.hot || (rock.hot = new Set())).add(c.i);
  }
  usedSpace(p) { return p.hold.reduce((s, e) => s + unitSpace(e), 0); }
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
  beamStage(p) { const b = R.BEAM; return (p.beamT || 0) < b.stages[0] ? 0 : p.beamT < b.stages[1] ? 1 : 2; }
  // a targeted ship beam (the Booster's boost, the Hauler's refine): the nearest other ship in front, near the aim line
  aimShip(p, range, slack) {
    const ux = Math.cos(p.aim), uy = Math.sin(p.aim); let best = null, bd = 1e9;
    for (const q of this.players.values()) {
      if (q === p || q.docked) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = hyp(dx, dy);
      if (d > range) continue;
      const along = dx * ux + dy * uy; if (along <= 0) continue;
      if (Math.abs(-dx * uy + dy * ux) > slack) continue;
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  step(dt) {
    const t = now();
    for (const p of this.players.values()) {
      const S = this.shipOf(p), rock = p.tow && this.rocks.get(p.tow);
      const towK = rock ? Math.max(0.2, 60 / (60 + rock.r)) : 1;
      const spd = S.speed * towK, push = hyp(p.fx, p.fy);
      const a = (push > 0.01 ? FLY.accel : FLY.brake) * dt;
      let ex = p.fx * spd - p.vx, ey = p.fy * spd - p.vy; const el = hyp(ex, ey); if (el > 1e-9 && el > a) { ex *= a / el; ey *= a / el; }
      p.vx += ex; p.vy += ey;
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
      if (dock) { p.tow = null; p.drill = null; }
      // ore drops: fly over one and it pours in up to the room aboard; the rest waits for another trip
      if (!dock) for (const d of this.drops.values()) {
        if (hyp(d.x - p.x, d.y - p.y) > 42) continue;
        const room = Math.max(0, Math.floor(this.shipOf(p).hold - this.usedSpace(p))); if (room <= 0) break;
        const take = Math.min(d.units, room);
        let e = p.hold.find((e2) => e2.raw && e2.o === d.ore); if (!e) { e = { o: d.ore, u: 0, raw: 1 }; p.hold.push(e); }
        e.u += take; d.units -= take; d.dirty = true; p.meDirty = true; p.dirty = true;
        this.fx.push({ k: "take", x: d.x, y: d.y, i: p.id, ore: ORE_KEYS.indexOf(d.ore) });
        if (d.units <= 0) this.deleteDrop(d);
      }
      // beams. toolAlt picks the second mode: the Scanner's drill, the Booster's coolant spray, the Hauler's refine beam.
      p.laserOn = false; p.laserLen = 0; p.laserRock = null; p.laserChunk = -1; p.beamTgt = null; p.beamHot = false;
      if (!p.firing) p.lockTgt = null;
      const boosted = (p.boostUntil || 0) > t;
      const boostMul = boosted ? (p.boostMul || 1) : 1;
      const altTool = !!p.toolAlt && !!(S.drillSpeed || S.boost || S.refineUnit);
      // the cutting laser (Miner, Scanner, Hauler): its own temperature sets the pace — blue cuts clean with no heat,
      // yellow and red cut faster but cook the rock; a hot chunk cracks faster still
      if (p.firing && !dock && S.laserDps && !altTool) {
        const ux = Math.cos(p.aim), uy = Math.sin(p.aim); let best = null, bd = S.laserRange;
        for (const r of this.rocksNear(p.x, p.y, S.laserRange + 300)) {
          const hit = this.castRock(r, p.x, p.y, ux, uy);
          if (hit && hit.t <= S.laserRange && hit.t < bd) { bd = hit.t; best = { r, hit }; }
        }
        if (best) {
          p.beamHot = true;
          const bst = this.beamStage(p);
          p.laserOn = true; p.laserLen = best.hit.t; p.laserRock = best.r.id;
          best.r.touched = t; best.r.home = false;
          if (best.hit.core) { this.hitCore(best.r, S.laserDps * boostMul * R.BEAM.dpsF[bst] * dt, p); p.lockTgt = null; }
          else {
            let ch = best.hit.chunk;             // sticky: a wiggle onto a touching chunk keeps cutting the one under way,
            const prev = p.lockTgt && p.lockTgt.rock === best.r.id ? best.r.chunks[p.lockTgt.i] : null;
            if (prev && prev !== ch && !prev.broken && prev.adj.includes(ch.i)
              && this.nearChunk(best.r, prev, p.x + ux * best.hit.t, p.y + uy * best.hit.t, 3)) ch = prev;   // but only while the aim stays by its edge
            p.lockTgt = { rock: best.r.id, i: ch.i };
            p.laserChunk = ch.i; const st0 = this.dmgStage(ch);
            const H = R.HEAT, hFac = [H.hSoft, H.hNormal, H.hDense, H.hUltra, H.hBed][ch.d] || 1;
            const hAmt = H.rate * hFac * (boosted ? Math.max(1, boostMul) : 1) * R.BEAM.heatF[bst] * dt;
            if (hAmt > 0) {
              this.heatChunk(best.r, ch, hAmt);
              for (const ni of ch.adj) { const n = best.r.chunks[ni]; if (!n.broken) this.heatChunk(best.r, n, hAmt * H.spread); }
            }
            const hMul = 1 + ((H.chunkBreak || 1) - 1) * Math.min(1, ch.heat || 0);
            const dps = S.laserDps * boostMul * R.BEAM.dpsF[bst] * hMul;
            if (ch.d !== 4 || boosted) {       // only a boosted laser cuts bedrock, and banks its rich ore
              ch.hp -= dps * dt;
              if (ch.hp <= 0) {
                if (S.charge) {                // (owner, 2026-10-18) the Miner primes the chunk instead: release to blast
                  ch.hp = 0;
                  p.chargeTgt = { rock: best.r.id, i: ch.i, ox: p.x, oy: p.y, ux, uy, t: best.hit.t };
                  p.chargeAmt = Math.min(1, (p.chargeAmt || 0) + dt / R.CHARGE.time);
                  if (hAmt > 0) this.heatChunk(best.r, ch, hAmt);   // overcharging keeps cooking it
                  if (this.dmgStage(ch) !== st0) best.r.v++;
                } else this.breakChunk(best.r, ch, p);
              } else if (this.dmgStage(ch) !== st0) best.r.v++;
            } else {                           // an unboosted laser: bedrock holds — the cracks spread, then it wears bare
              ch.wear = (ch.wear || 0) + dps * dt;
              if (!ch.scanned && ch.wear >= ch.maxHp) { ch.scanned = true; best.r.v++; }
              else if (this.dmgStage(ch) !== st0) best.r.v++;
            }
          }
        } else p.laserLen = S.laserRange;
      }
      // the charge releases the moment the beam lets go of the primed chunk (owner, 2026-10-18): the blast lances on
      // toward the core along the held line, at a heavy heat price
      if (p.chargeTgt) {
        const cT = p.chargeTgt, rk = this.rocks.get(cT.rock), c = rk && rk.chunks[cT.i];
        const still = rk && c && !c.broken && p.firing && p.laserRock === cT.rock && p.laserChunk === cT.i;
        if (!still) {
          const k = p.chargeAmt || 0; p.chargeTgt = null; p.chargeAmt = 0;
          if (rk && c && !c.broken && !rk.core.popped) {
            this.breakChunk(rk, c, p);
            if (k >= (R.CHARGE.blastMin ?? 0.5)) {   // a blast takes a deliberate charge; a slip of the aim just breaks the chunk
              const seen = new Set([c.i]), reach = cT.t + 4 + k * R.CHARGE.depth;
              for (let t2 = cT.t; t2 <= reach; t2 += 1.2) {
                const x2 = cT.ox + cT.ux * t2, y2 = cT.oy + cT.uy * t2, rr = hyp(x2 - rk.x, y2 - rk.y);
                if (rr <= rk.core.r0 + 1) break;
                const c2 = this.chunkAt(rk, rr, Math.atan2(y2 - rk.y, x2 - rk.x));
                if (!c2 || c2.broken || seen.has(c2.i)) continue;
                seen.add(c2.i);
                const st0 = this.dmgStage(c2);
                if (c2.d !== 4) { c2.hp -= c2.maxHp * R.CHARGE.dmg * k; if (c2.hp <= 0 && !c2.broken) this.breakChunk(rk, c2, p); else if (this.dmgStage(c2) !== st0) rk.v++; }
                else { c2.wear = Math.min(c2.maxHp, (c2.wear || 0) + c2.maxHp * R.CHARGE.dmg * k); if (this.dmgStage(c2) !== st0) rk.v++; }
                if (!c2.broken) this.heatChunk(rk, c2, R.CHARGE.heat * k);   // the heat price lands on what survives, not straight into the core
                if (rk.core.popped) break;
              }
              this.fx.push({ k: "lance", x: cT.ox + cT.ux * cT.t, y: cT.oy + cT.uy * cT.t, x2: cT.ox + cT.ux * reach, y2: cT.oy + cT.uy * reach });
            }
          }
        }
      }
      // the beam's temperature: rises held on rock, cools fired into space, snaps back to blue on release
      p.beamT = !p.firing ? 0 : p.beamHot ? Math.min(1, (p.beamT || 0) + dt / R.BEAM.ramp) : Math.max(0, (p.beamT || 0) - dt / R.BEAM.cool);
      // the Booster: a boost beam on one ship at a time (its main mode), or the coolant spray (toolAlt)
      if (p.firing && !dock && S.boost && !altTool) {
        const q = this.aimShip(p, S.boostRange, S.boostAim || 30);
        if (q) {
          q.boostUntil = t + (S.boostDur || 15) * 1000; q.boostMul = S.boost; q.boostBy = p.id; q.meDirty = true;
          p.beamTgt = q.id; p.laserOn = true; p.laserLen = hyp(q.x - p.x, q.y - p.y);
        }
      }
      if (p.firing && !dock && S.boost && altTool) {               // the coolant spray; cooling a chunk pulls core heat too
        const ux = Math.cos(p.aim), uy = Math.sin(p.aim); let best = null, bd = S.coolRange || 180;
        for (const r of this.rocksNear(p.x, p.y, (S.coolRange || 180) + 300)) {
          const hit = this.castRock(r, p.x, p.y, ux, uy);
          if (hit && hit.t <= (S.coolRange || 180) && hit.t < bd) { bd = hit.t; best = { r, hit }; }
        }
        if (best) {
          p.laserOn = true; p.laserLen = best.hit.t; p.laserRock = best.r.id;
          if (best.hit.core) best.r.core.heat = Math.max(0, (best.r.core.heat || 0) - R.HEAT.coolBeam * dt);
          else { this.heatChunk(best.r, best.hit.chunk, -R.HEAT.coolBeam * dt); best.r.core.heat = Math.max(0, (best.r.core.heat || 0) - R.HEAT.coolBeam * 0.5 * dt); }
        } else p.laserLen = S.coolRange || 180;
      }
      // the Hauler's refine beam (toolAlt): compresses another ship's raw ore where it sits, a block per refineUnit s
      if (p.firing && !dock && S.refineUnit && altTool) {
        const q = this.aimShip(p, S.refineRange || 200, S.boostAim || 30);
        if (q) {
          p.beamTgt = q.id; p.laserOn = true; p.laserLen = hyp(q.x - p.x, q.y - p.y);
          p.refOtherT = (p.refOtherT || 0) + dt;
          if (p.refOtherT >= S.refineUnit) { p.refOtherT = 0; this.refineBlock(q); }
        } else p.refOtherT = 0;
      } else p.refOtherT = 0;
      // the Scanner's drill (toolAlt, held): bores a straight radial line toward the core, revealing each chunk the head
      // passes — orbit to sweep columns, let go to stop. Bedrock is slow and shocks its neighbors; that ore is lost.
      if (p.firing && !dock && S.drillSpeed && altTool) {
        let rk = null, bd2 = S.drillRange;
        for (const r of this.rocksNear(p.x, p.y, S.drillRange + 300)) { const d = hyp(p.x - r.x, p.y - r.y) - r.r; if (d < bd2 && !r.core.popped) { bd2 = d; rk = r; } }
        if (!rk) p.drill = null;
        else {
          const ang = Math.atan2(p.y - rk.y, p.x - rk.x);
          let entry = null;                     // the column: the first solid chunk from the surface along this radial
          for (let rr2 = rk.r - 0.6; rr2 > rk.core.r0; rr2 -= 1.2) { const c2 = this.chunkAt(rk, rr2, ang); if (c2 && !c2.broken) { entry = c2; break; } }
          if (!p.drill || p.drill.rock !== rk.id || p.drill.entry !== (entry ? entry.i : -1)) p.drill = { rock: rk.id, entry: entry ? entry.i : -1, depth: 0 };
          p.drill.ang = ang;
          rk.touched = t; rk.home = false;
          const head = Math.max(rk.core.r0 + 1.2, rk.r - p.drill.depth);
          const ch = this.chunkAt(rk, head, ang);
          let speed = S.drillSpeed * boostMul;                     // a boost speeds the drill like everything else
          if (ch && !ch.scanned) { ch.scanned = true; rk.v++; this.fx.push({ k: "scan", x: rk.x + Math.cos(ang) * head, y: rk.y + Math.sin(ang) * head }); }
          if (ch && ch.d === 4 && !ch.broken) {
            speed *= (S.drillBed || 0.2);
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
        if (rock.core.popped || !S.towRange) { p.tow = null; rock.tow = null; }
        else {
          const L = rock.r + S.towLeash + 40, gx = p.x - Math.sin(p.h) * L, gy = p.y + Math.cos(p.h) * L;
          const dx = gx - rock.x, dy = gy - rock.y, d = hyp(dx, dy), pull = Math.min(1, dt * S.towPull);
          if (d > 1 && hyp(rock.x + dx * pull, rock.y + dy * pull) > W.saturnR + rock.r) { rock.x += dx * pull; rock.y += dy * pull; this.gridMove(rock); }
          rock.touched = t;
        }
      }
      if (S.refineUnit && !dock) {             // the hauler's own refinery compresses the cargo on the way home
        p.refT = (p.refT || 0) + dt;
        if (p.refT >= S.refineUnit) { p.refT = 0; this.refineBlock(p); }
      }
      if (p.firing || p.tow || p.drill) p.meDirty = true;
    }
    for (const p of this.players.values()) if (p.meDirty) { p.dirty = true; }
  }
  refineBlock(q) {                             // one 100-unit block of raw ore becomes refined (a fifth of the room)
    const e = q.hold.find((e2) => e2.raw && e2.u > 0); if (!e) return false;
    const n = Math.min(R.CHUNK.oreUnit || 100, e.u); e.u -= n;
    let f = q.hold.find((e2) => !e2.raw && e2.o === e.o); if (!f) { f = { o: e.o, u: 0, raw: 0 }; q.hold.push(f); }
    f.u += n; if (!e.u) q.hold.splice(q.hold.indexOf(e), 1);
    q.meDirty = true; q.dirty = true;
    this.fx.push({ k: "refine", x: q.x, y: q.y, i: q.id });
    return true;
  }

  // breaking a chunk banks its ore into the core (per breaker) and shocks every touching chunk; chains cascade. Shocks
  // never reach bedrock or the core. A lossy break — the drill's collateral — banks nothing, its whole cascade too.
  // (owner, 2026-10-18) every chunk stripped also cracks the core open a little: down to half health, never past.
  breakChunk(rock, ch, breaker, lossy) {
    const queue = [{ c: ch, direct: true }];
    while (queue.length) {
      const { c, direct } = queue.shift(); if (c.broken || (c.d === 4 && !direct)) continue;
      c.broken = true; rock.v++; rock.nBroken++;
      rock.core.heat = Math.min(1.25, (rock.core.heat || 0) + (c.heat || 0) * R.HEAT.coreK);   // the chunk's heat at the break pours into the core
      const cap = rock.core.maxHp * (1 - R.CORE.weaken * rock.nBroken / rock.core.nBreak);
      if (!rock.core.popped && rock.core.hp > cap) rock.core.hp = cap;
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
  hitCore(rock, dmg, p) {                      // a hot core breaks faster
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
  // ore lands in the hold; what doesn't fit scatters as drops by the rock, free for anyone, in as many trips as it takes
  giveOre(p, o, u, rock) {
    if (!p || u <= 0) return;
    const S = this.shipOf(p), room = Math.max(0, Math.floor(S.hold - this.usedSpace(p)));
    const into = Math.min(u, room);
    if (into > 0) { let e = p.hold.find((e2) => e2.raw && e2.o === o); if (!e) { e = { o, u: 0, raw: 1 }; p.hold.push(e); } e.u += into; p.meDirty = true; p.dirty = true; }
    const over = u - into;
    if (over > 0) this.spawnDrops(o, over, rock ? rock.x : p.x, rock ? rock.y : p.y);
    this.fx.push({ k: "pay", x: p.x, y: p.y, rx: rock ? rock.x : p.x, ry: rock ? rock.y : p.y, i: p.id, u });
  }
  spawnDrops(o, u, x, y) {
    while (u > 0) {
      const lump = Math.min(R.DROPS.lump || 100, u); u -= lump;
      const a = Math.random() * TAU, dd = 14 + Math.random() * 46;
      const d = { id: this.dropSeq++, x: x + Math.cos(a) * dd, y: y + Math.sin(a) * dd, ore: o, units: lump, born: now(), dirty: true, fresh: true };
      this.drops.set(d.id, d);
    }
  }
  deleteDrop(d) { this.drops.delete(d.id); pool.query(`DELETE FROM ring_drops WHERE id = $1`, [d.id]).catch(() => {}); }
  async saveDrop(d) {
    if (d.fresh) { d.fresh = false;
      await pool.query(`INSERT INTO ring_drops (id, x, y, ore, units, created_at) VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0)) ON CONFLICT (id) DO UPDATE SET units = $5`,
        [d.id, d.x, d.y, d.ore, d.units, d.born]).catch((e) => console.error("ring drop", e));
      await pool.query(`SELECT setval(pg_get_serial_sequence('ring_drops','id'), GREATEST($1, (SELECT COALESCE(MAX(id),1) FROM ring_drops)))`, [this.dropSeq]).catch(() => {});
    } else await pool.query(`UPDATE ring_drops SET units = $2 WHERE id = $1`, [d.id, d.units]).catch((e) => console.error("ring drop", e));
  }

  // ---- delivery (owner, 2026-10-18): the hold pays straight into the deliverer's station storage; no money ----
  sumText(ores) { return Object.entries(ores).filter(([, u]) => u > 0).map(([o, u]) => Math.round(u) + " " + (R.ORES[o] ? R.ORES[o].name : o)).join(", "); }
  storageAdd(pid, ores, note) {
    if (!Object.entries(ores).some(([o, u]) => u > 0 && R.ORES[o])) return;
    const q = this.players.get(pid);
    if (q) {
      for (const [o, u] of Object.entries(ores)) if (u > 0 && R.ORES[o]) q.storage[o] = (q.storage[o] || 0) + Math.round(u);
      q.meDirty = true; q.dirty = true;
      if (note) this.msgs.push({ to: pid, m: { t: "note", text: note + " " + this.sumText(ores) + " into storage." } });
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
  deliver(p) {
    const ores = {};
    for (const e of p.hold) ores[e.o] = (ores[e.o] || 0) + e.u;
    p.hold = [];
    if (Object.keys(ores).length) this.storageAdd(p.id, ores, "Delivered");
    p.meDirty = true; p.dirty = true;
    this.fx.push({ k: "deliver", x: p.x, y: p.y, i: p.id });
  }
  async banned(id) {                           // (admin) a banned player's hold scatters where they were
    const p = this.players.get(String(id)); if (!p) return;
    for (const e of p.hold) this.spawnDrops(e.o, e.u, p.x, p.y);
    p.hold = [];
  }

  // ---- commands ----
  act(id, m) {
    const p = this.players.get(String(id)); if (!p || !m) return;
    const S = this.shipOf(p);
    if (typeof m.rock === "string") {          // marking, and the scanner's tow
      const r = this.rocks.get(m.rock); if (!r) return;
      if (m.op === "mark") {                   // a marked rock rides my minimap until it's gone
        p.mark = p.mark && p.mark.rock === r.id ? null : { rock: r.id, x: Math.round(r.x), y: Math.round(r.y) };
      } else if (m.op === "tow" && S.towRange) {
        if (p.tow === r.id) { p.tow = null; r.tow = null; }
        else if (!r.core.popped && (!r.tow || !this.players.has(r.tow)) && hyp(r.x - p.x, r.y - p.y) - r.r <= S.towRange) {
          if (p.tow) { const o = this.rocks.get(p.tow); if (o) o.tow = null; }
          p.tow = r.id; r.tow = p.id; r.touched = now(); r.home = false;
        }
      }
    } else if (m.op === "drop") {              // jettison the hold as drops where I sit — haulers never drop
      if (S.refineUnit) { this.msgs.push({ to: p.id, m: { t: "note", text: "Haulers can never drop." } }); return; }
      if (p.docked || !p.hold.length) return;
      for (const e of p.hold) this.spawnDrops(e.o, e.u, p.x, p.y);
      p.hold = []; p.meDirty = true; p.dirty = true;
    }
    p.meDirty = true;
  }
  station(id, m) {                             // docked only: board another ship
    const p = this.players.get(String(id)); if (!p || !p.docked || !m || typeof m.op !== "string") return false;
    if (m.op === "ship") {
      if (!SHIPS[m.k] || p.ship === m.k) return false;
      if (p.hold.length) return false;                             // (cargo was just delivered on docking; belt and braces)
      p.ship = m.k; p.tow = null; p.drill = null; p.toolAlt = false; p.chargeTgt = null; p.chargeAmt = 0; p.beamT = 0;
    } else return false;
    p.meDirty = true; p.dirty = true; return true;
  }

  async _save(p) {
    await this.ready;
    await pool.query(`UPDATE ring_players SET x = $2, y = $3, h = $4, module = $5, hold = $6, storage = $7, updated_at = now() WHERE user_id = $1`,
      [p.id, p.x, p.y, p.h, p.ship, JSON.stringify(p.hold), JSON.stringify(p.storage || {})]);
    p.dirty = false;
  }
  async saveDirty() {
    for (const p of this.players.values()) if (p.dirty) await this._save(p);
    for (const d of [...this.drops.values()]) if (d.dirty) { d.dirty = false; await this.saveDrop(d); }
  }

  // ---- what each player is sent ----
  // ships in vision: [id, x dm, y dm, h mrad, ship idx, flags (1 beam on, 2 firing, 8 docked, 16 drilling, 32 boosted,
  // 64 second mode), aim mrad, beam length, drill rock | tow rock | 0, beam target id | 0, hold %, beam temp %,
  // charge %, drill depth]
  shipRowCache() {
    const out = [], t = Date.now();
    for (const p of this.players.values()) {
      const S = this.shipOf(p), used = this.usedSpace(p);
      out.push({ p, key: "", row: [p.id, Math.round(p.x * 10), Math.round(p.y * 10), Math.round(p.h * 1000), R.SHIP_KINDS.indexOf(p.ship),
        (p.laserOn ? 1 : 0) | (p.firing && !p.docked ? 2 : 0) | (p.docked ? 8 : 0) | (p.drill ? 16 : 0)
          | ((p.boostUntil || 0) > t ? 32 : 0) | (p.toolAlt ? 64 : 0),
        Math.round(p.aim * 1000), Math.round(p.laserLen), p.drill ? p.drill.rock : (p.tow || 0), p.beamTgt || 0,
        Math.round(used / S.hold * 100), Math.round((p.beamT || 0) * 100), Math.round((p.chargeAmt || 0) * 100), Math.round(p.drill ? p.drill.depth : 0)] });
    }
    for (const e of out) e.key = JSON.stringify(e.row);
    return out;
  }
  shipRows(viewer, cache = this.shipRowCache()) {
    const V = this.visionOf(viewer);
    return cache.filter((e) => e.p === viewer || hyp(e.p.x - viewer.x, e.p.y - viewer.y) <= V);
  }
  // rocks in vision, as summaries: [id, x, y, shells, outer r, broken %, core hp %, towed, heat %, fill %]; the chunk
  // layout travels separately (rockDetail) for rocks close to the viewer, re-sent when its version changes
  rockRows(viewer) {
    const out = [], V = this.visionOf(viewer);
    for (const r of this.rocksNear(viewer.x, viewer.y, V + 200)) {
      if (hyp(r.x - viewer.x, r.y - viewer.y) > V + r.r) continue;   // (a big rock's edge can poke into vision)
      out.push([r.id, Math.round(r.x), Math.round(r.y), r.shellsN, Math.round(r.r),
        Math.round(Math.min(1, r.nBroken / r.core.nBreak) * 100), Math.round(Math.max(0, r.core.hp / r.core.maxHp) * 100),
        r.tow ? 1 : 0, Math.round(Math.min(1.25, r.core.heat || 0) * 100), Math.round(Math.min(1, r.core.bankedTotal / r.core.total) * 100)]);
    }
    return out;
  }
  // a chunk: [i, r0, r1, a0 mrad, a1 mrad, bits (1 broken, 2 scanned), density, ore idx | -1, crack stage, heat stage] —
  // density and ore only once scanned (hidden masonry: the layout's look can't be read out of the traffic before a scan)
  rockDetail(r) {
    return { t: "rockd", id: r.id, v: r.v, coreR: r.core.r0, c: r.chunks.map((c) => [c.i, Math.round(c.r0 * 10) / 10, Math.round(c.r1 * 10) / 10, Math.round(normA(c.a0) * 1000), Math.round(normA(c.a1) * 1000),
      (c.broken ? 1 : 0) | (c.scanned ? 2 : 0), c.scanned ? c.d : 0, c.scanned && c.ore ? ORE_KEYS.indexOf(c.ore) : -1, c.broken ? 0 : this.dmgStage(c), c.broken ? 0 : this.heatStage(c)]) };
  }
  dropRows(viewer) {                           // [id, x, y, ore idx, units]
    const out = [], V = this.visionOf(viewer);
    for (const d of this.drops.values()) {
      if (hyp(d.x - viewer.x, d.y - viewer.y) > V) continue;
      out.push([d.id, Math.round(d.x), Math.round(d.y), ORE_KEYS.indexOf(d.ore), d.units]);
    }
    return out;
  }
  meMsg(p) {
    const S = this.shipOf(p);
    const hold = p.hold.map((e) => ({ o: e.o, u: e.u, raw: e.raw ? 1 : 0 }));
    return { t: "me", cap: S.hold, hold, docked: p.docked ? 1 : 0,
      ship: p.ship, tow: p.tow || 0, drill: p.drill ? p.drill.rock : 0, zone: p.zone,
      storage: Object.fromEntries(Object.entries(p.storage).map(([o, u]) => [o, Math.round(u)])),
      boost: Math.max(0, Math.round(((p.boostUntil || 0) - now()) / 100) / 10),
      mark: p.mark ? [p.mark.x, p.mark.y] : 0 };
  }
  roster() { return [...this.players.values()].map((p) => ({ i: p.id, n: p.name })); }
}
