// (owner, 2026-10-18) The mining world, back to basics: asteroids are cores surrounded by masonry. The Miner's laser
// cuts the first chunk on its line; denser chunks take longer; a chunk holding ore sends its ore bits flying into the
// core when it breaks; breaking the core piñatas every stored bit out around the rock as drops, free for anyone, picked
// up by flying over them. Delivery pays the hold into the deliverer's station storage. The server decides everything;
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
const unitSpace = (e) => e.u * (e.raw ? 1 : R.REFINED_SPACE);
// (owner, 2026-10-18: "make each chunk have an exact hitbox") every chunk is one jittered rock-shaped polygon, built
// here once; clients draw exactly these points and the laser hits exactly these edges
const h01 = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
function chunkPoly(c) {
  const b0 = c.a0; let b1 = c.a1; if (b1 <= b0) b1 += TAU;
  const span = b1 - b0, th = c.r1 - c.r0, i = c.i;
  const pts = [], nO = Math.max(2, Math.round(span * c.r1 / 8)), nI = Math.max(2, Math.round(span * c.r0 / 10));
  for (let k = 0; k <= nO; k++) { const edge = k === 0 || k === nO;
    const a = b0 + span * (k / nO) + (edge ? 0 : (h01(i, k) - 0.5) * span / nO * 0.9);
    const r = c.r1 + (h01(i, k + 40) - 0.5) * th * (edge ? 0.22 : 0.42);
    pts.push([Math.round(Math.cos(a) * r * 10) / 10, Math.round(Math.sin(a) * r * 10) / 10]); }
  for (let k = nI; k >= 0; k--) { const edge = k === 0 || k === nI;
    const a = b0 + span * (k / nI) + (edge ? 0 : (h01(i, k + 80) - 0.5) * span / nI * 0.9);
    const r = Math.max(2, c.r0 + (h01(i, k + 120) - 0.5) * th * (edge ? 0.2 : 0.34));
    pts.push([Math.round(Math.cos(a) * r * 10) / 10, Math.round(Math.sin(a) * r * 10) / 10]); }
  let cx = 0, cy = 0; for (const [x, y] of pts) { cx += x; cy += y; } cx /= pts.length; cy /= pts.length;
  let br = 0; for (const [x, y] of pts) br = Math.max(br, hyp(x - cx, y - cy));
  return { pts, nO, cx, cy, br };
}
// the ray (origin ox, oy in the rock's frame, unit direction ux, uy) against a polygon: 0 if the origin is inside, the
// distance to the nearest edge it crosses, or Infinity
function rayPoly(ox, oy, ux, uy, P) {
  const pts = P.pts, n = pts.length;
  { const dx = P.cx - ox, dy = P.cy - oy, along = dx * ux + dy * uy, perp = Math.abs(dx * uy - dy * ux);
    if (perp > P.br || along < -P.br) return Infinity; }        // (the chunk's bounding circle is off the line)
  let inside = false, best = Infinity;
  for (let k = 0, j = n - 1; k < n; j = k++) {
    const [xa, ya] = pts[j], [xb, yb] = pts[k];
    if ((ya > oy) !== (yb > oy) && ox < ((xb - xa) * (oy - ya)) / (yb - ya) + xa) inside = !inside;
    const ex = xb - xa, ey = yb - ya, den = ux * ey - uy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const wx = xa - ox, wy = ya - oy, t = (wx * ey - wy * ex) / den, s = (wx * uy - wy * ux) / den;
    if (t >= 0 && s >= 0 && s <= 1 && t < best) best = t;
  }
  return inside ? 0 : best;
}

export class World {
  constructor() {
    this.players = new Map();
    this.rocks = new Map();                    // id -> rock (chunks, core)
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
    await pool.query(`CREATE TABLE IF NOT EXISTS ring_drops (id SERIAL PRIMARY KEY, x DOUBLE PRECISION NOT NULL, y DOUBLE PRECISION NOT NULL,
      ore TEXT NOT NULL, units INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ring_meta (k TEXT PRIMARY KEY, v JSONB NOT NULL)`);
    const { rows } = await pool.query(`SELECT * FROM ring_drops`);
    for (const r of rows) if (R.ORES[r.ore]) this.drops.set(r.id, { id: r.id, x: +r.x, y: +r.y, ore: r.ore, units: +r.units, born: new Date(r.created_at).getTime(), dirty: false });
    this.dropSeq = Math.max(1, ...[...this.drops.keys()].map((k) => k + 1));
  }
  shipOf(p) { return SHIPS[p.ship] || SHIPS.miner; }
  visionOf(p) { return Math.min(W.loadR, this.shipOf(p).vision); }

  // ---- the asteroid: shells of chunks around a core ----
  cellKey(cx, cy) { return cx + "," + cy; }
  gridAdd(r) { const k = this.cellKey(Math.floor(r.x / W.cell), Math.floor(r.y / W.cell)); r.gk = k; let s = this.grid.get(k); if (!s) this.grid.set(k, (s = new Set())); s.add(r); }
  gridDel(r) { const s = this.grid.get(r.gk); if (s) { s.delete(r); if (!s.size) this.grid.delete(r.gk); } }
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
    const [shMin, shMax] = R.RING_SHELLS[ring] || R.RING_SHELLS[0];          // thicker asteroids deeper in
    const nSh = shMin + Math.floor(rand() * (shMax - shMin + 1)), SZ = R.ROCK_SIZE(nSh);
    const pool_ = [...R.RING_ORES[ring]]; const types = [];
    for (let i = 0; i < SZ.oreTypes && pool_.length; i++) types.push(pool_.splice(Math.floor(rand() * pool_.length), 1)[0]);
    const C = R.CHUNK, ws = [C.wSoft, C.wNormal, C.wDense, C.wUltra], wsum = ws.reduce((a, b) => a + b, 0);
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
          let dv = rand() * wsum, d = 0;
          for (let i2 = 0; i2 < ws.length; i2++) { dv -= ws[i2]; if (dv <= 0) { d = i2; break; } }
          const c = { i: chunks.length, sh: shellIdx, r0: b0, r1: b1, a0, a1, d, ore: null, u: 0, broken: false };
          if (rand() >= C.barren) { c.ore = types[Math.floor(rand() * types.length)]; c.u = (C.oreUnit || 100) + (d === 2 ? C.denseOre : d === 3 ? C.ultraOre : 0); }
          const span = normA(c.a1 - c.a0) || TAU / nSeg, area = span * ((c.r0 + c.r1) / 2) * (c.r1 - c.r0);
          c.maxHp = Math.max(8, area * C.hpK * [C.soft, 1, C.dense, C.ultra][d]); c.hp = c.maxHp;
          segs.push(c.i); chunks.push(c);
        }
      }
      shells.push({ r0: rr, r1, segs }); rr = r1;
    }
    const total = chunks.reduce((s, c) => s + c.u, 0);
    let reach = rr; for (const c of chunks) { c.poly = chunkPoly(c); reach = Math.max(reach, hyp(c.poly.cx, c.poly.cy) + c.poly.br); }
    return { id: key + ":" + gen + ":" + epoch, key, cell: key, gen, x, y, ring, shellsN: nSh, r: rr, reach, chunks, shells, nBroken: 0,
      core: { r0: SZ.coreR, hp: SZ.coreHp, maxHp: SZ.coreHp, banked: {}, bankedTotal: 0, total: Math.max(1, total), popped: false },
      v: 1, touched: 0, home: true };
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
    for (const p of this.players.values()) if (p.mark && p.mark.rock === r.id) p.mark = null;
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
    for (const r of [...this.rocks.values()]) if (r.touched && t - r.touched > R.ROCK.linger * 1000) this.dropRock(r, R.ROCK.respawn);
    for (const d of [...this.drops.values()]) if (t - d.born > R.DROPS.linger * 1000) this.deleteDrop(d);
  }
  allowed(p, x, y) { const r = hyp(x, y); return r >= W.saturnR + FLY.shipR && r <= W.lockedR; }
  resetField() {                               // (the world's shape changed: every rock regrows)
    for (const r of [...this.rocks.values()]) this.gridDel(r);
    this.rocks.clear(); this.slots.clear(); this.cells.clear();
  }

  // ---- players ----
  async join(id, name) {
    id = String(id); let p = this.players.get(id);
    if (p) { p.name = name; return p; }
    await this.ready; await (this.offline.get(id) || Promise.resolve());
    const { rows } = await pool.query(`SELECT * FROM ring_players WHERE user_id = $1`, [id]), r = rows[0];
    const [sx, sy] = W.station;
    p = { id, name, x: sx, y: sy + 120, h: 0, vx: 0, vy: 0, fx: 0, fy: 0, aim: 0, firing: false, ship: R.START.ship,
      hold: [], mark: null, storage: {}, laserLen: 0, laserOn: false, laserRock: null, laserChunk: -1,
      docked: false, dirty: true, hAt: 0, zone: "" };
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
    this.players.delete(p.id);
    await this._save(p); await pool.query(`UPDATE ring_players SET logout_at = now() WHERE user_id = $1`, [p.id]);
  }
  respawn(id) { const p = this.players.get(String(id)); if (!p) return null; const [sx, sy] = W.station; return this.teleport(id, sx, sy + 120); }
  teleport(id, x, y) {
    const p = this.players.get(String(id)); if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (hyp(x, y) < W.saturnR + 60) { const a = Math.atan2(y, x); x = Math.cos(a) * (W.saturnR + 80); y = Math.sin(a) * (W.saturnR + 80); }
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
    p.aim = n(m.a); p.firing = m.f === 1;
  }

  // the laser's ray into a rock: whatever it meets first — an unbroken chunk's exact polygon, or the core's circle
  castRock(rock, px, py, ux, uy) {
    const ox = px - rock.x, oy = py - rock.y;
    { const along = -(ox * ux + oy * uy), perp = Math.abs(ox * uy - oy * ux);
      if (perp > rock.reach || along < -rock.reach) return null; }   // the line misses the rock entirely
    let best = Infinity, hit = null;
    for (const c of rock.chunks) {
      if (c.broken) continue;
      const t = rayPoly(ox, oy, ux, uy, c.poly);
      if (t < best) { best = t; hit = c; }
    }
    { const b = ox * ux + oy * uy, cr = rock.core.r0, disc = b * b - (ox * ox + oy * oy - cr * cr);   // the core
      if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t >= 0 && t < best) return { core: true, t }; } }
    return hit ? { chunk: hit, t: best } : null;
  }
  dmgStage(c) { return Math.min(3, Math.max(0, Math.floor((1 - Math.max(0, c.hp) / c.maxHp) * 4))); }
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
    const off = Math.min(normA(a - c.a1), normA(c.a0 - a));
    return off * Math.max(rr, 1) <= tol;
  }

  step(dt) {
    const t = now();
    for (const p of this.players.values()) {
      const S = this.shipOf(p), push = hyp(p.fx, p.fy);
      const a = (push > 0.01 ? FLY.accel : FLY.brake) * dt;
      let ex = p.fx * S.speed - p.vx, ey = p.fy * S.speed - p.vy; const el = hyp(ex, ey); if (el > 1e-9 && el > a) { ex *= a / el; ey *= a / el; }
      p.vx += ex; p.vy += ey;
      if (p.vx || p.vy) {
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (this.allowed(p, nx, ny)) { p.x = nx; p.y = ny; }
        else if (this.allowed(p, nx, p.y)) { p.x = nx; p.vy = 0; } else if (this.allowed(p, p.x, ny)) { p.y = ny; p.vx = 0; } else { p.vx = p.vy = 0; }
        for (const r of this.rocksNear(p.x, p.y, 220)) {
          const d = hyp(p.x - r.x, p.y - r.y), min = r.r + FLY.shipR;
          if (d < min && d > 0.01) { const ux = (p.x - r.x) / d, uy = (p.y - r.y) / d; p.x = r.x + ux * min; p.y = r.y + uy * min; const vn = p.vx * ux + p.vy * uy; if (vn < 0) { p.vx -= vn * ux; p.vy -= vn * uy; } }
        }
        const z = zoneOf(p.x, p.y); if (z !== p.zone) { p.zone = z; p.meDirty = true; }
        p.dirty = true;
      }
      const dock = hyp(p.x - W.station[0], p.y - W.station[1]) < R.ECON.dockR;
      if (dock && !p.docked) this.deliver(p);
      if (dock !== p.docked) { p.docked = dock; p.meDirty = true; }
      // ore drops: fly over one and it pours in up to the room aboard; the rest waits for another trip
      if (!dock) for (const d of this.drops.values()) {
        if (hyp(d.x - p.x, d.y - p.y) > 42) continue;
        const room = Math.max(0, Math.floor(S.hold - this.usedSpace(p))); if (room <= 0) break;
        const take = Math.min(d.units, room);
        let e = p.hold.find((e2) => e2.raw && e2.o === d.ore); if (!e) { e = { o: d.ore, u: 0, raw: 1 }; p.hold.push(e); }
        e.u += take; d.units -= take; d.dirty = true; p.meDirty = true; p.dirty = true;
        this.fx.push({ k: "take", x: d.x, y: d.y, i: p.id, ore: ORE_KEYS.indexOf(d.ore) });
        if (d.units <= 0) this.deleteDrop(d);
      }
      // the laser: cuts the first chunk on its line (denser takes longer), or the core down an open bore
      p.laserOn = false; p.laserLen = 0; p.laserRock = null; p.laserChunk = -1;
      if (p.firing && !dock && S.laserDps) {
        const ux = Math.cos(p.aim), uy = Math.sin(p.aim); let best = null, bd = S.laserRange;
        const mz = S.muzzle || 0, mx0 = p.x + Math.sin(p.h) * mz, my0 = p.y - Math.cos(p.h) * mz;   // (owner, 2026-10-18) the beam starts at the ship's red dot
        for (const r of this.rocksNear(mx0, my0, S.laserRange + 360)) {
          const hit = this.castRock(r, mx0, my0, ux, uy);
          if (hit && hit.t <= S.laserRange && hit.t < bd) { bd = hit.t; best = { r, hit }; }
        }
        if (best) {
          const rock = best.r, dmg = S.laserDps * dt;
          p.laserOn = true; p.laserLen = best.hit.t; p.laserRock = rock.id;
          rock.touched = t; rock.home = false;
          if (best.hit.core) this.hitCore(rock, dmg);
          else {
            const ch = best.hit.chunk;           // (owner, 2026-10-18) no anchoring: the laser cuts exactly what it points at
            p.laserChunk = ch.i;
            const st0 = this.dmgStage(ch);
            ch.hp -= dmg;
            if (ch.hp <= 0) this.breakChunk(rock, ch); else if (this.dmgStage(ch) !== st0) rock.v++;
          }
        } else p.laserLen = S.laserRange;
      }
      if (p.firing) p.meDirty = true;
    }
    for (const p of this.players.values()) if (p.meDirty) { p.dirty = true; }
  }

  // a broken chunk's ore bits fly into the core and bank there
  breakChunk(rock, c) {
    if (c.broken) return;
    c.broken = true; rock.v++; rock.nBroken++;
    if (c.u > 0 && c.ore) { rock.core.banked[c.ore] = (rock.core.banked[c.ore] || 0) + c.u; rock.core.bankedTotal += c.u; }
    const mid = (c.r0 + c.r1) / 2, ang = c.a0 + normA(c.a1 - c.a0) / 2;
    this.fx.push({ k: "crack", x: rock.x + Math.cos(ang) * mid, y: rock.y + Math.sin(ang) * mid, rx: rock.x, ry: rock.y, u: c.u, ore: c.ore || 0 });
    rock.touched = now(); rock.home = false;
  }
  hitCore(rock, dmg) {
    rock.core.hp -= dmg;
    rock.touched = now(); rock.home = false;
    if (rock.core.hp <= 0 && !rock.core.popped) this.popCore(rock);
  }
  // the piñata: every stored ore bit bursts out around the rock as drops, free for anyone; the rest of the rock shatters
  popCore(rock) {
    rock.core.popped = true;
    for (const [o, u] of Object.entries(rock.core.banked)) this.spawnDrops(o, u, rock.x, rock.y, rock.r * (R.DROPS.spread || 1.4));
    this.fx.push({ k: "pop", x: rock.x, y: rock.y, r: rock.r });
    this.dropRock(rock, R.ROCK.respawn);
  }
  spawnDrops(o, u, x, y, reach) {
    reach = Math.max(30, reach || 60);
    while (u > 0) {
      const lump = Math.min(R.DROPS.lump || 100, u); u -= lump;
      const a = Math.random() * TAU, dd = reach * (0.25 + Math.random() * 0.75);
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

  // ---- delivery: the hold pays straight into the deliverer's station storage ----
  sumText(ores) { return Object.entries(ores).filter(([, u]) => u > 0).map(([o, u]) => Math.round(u) + " " + (R.ORES[o] ? R.ORES[o].name : o)).join(", "); }
  storageAdd(pid, ores, note) {
    if (!Object.entries(ores).some(([o, u]) => u > 0 && R.ORES[o])) return;
    const q = this.players.get(pid); if (!q) return;
    for (const [o, u] of Object.entries(ores)) if (u > 0 && R.ORES[o]) q.storage[o] = (q.storage[o] || 0) + Math.round(u);
    q.meDirty = true; q.dirty = true;
    if (note) this.msgs.push({ to: pid, m: { t: "note", text: note + " " + this.sumText(ores) + " into storage." } });
  }
  deliver(p) {
    const ores = {};
    for (const e of p.hold) ores[e.o] = (ores[e.o] || 0) + e.u;
    p.hold = [];
    if (Object.keys(ores).length) this.storageAdd(p.id, ores, "Delivered");
    p.meDirty = true; p.dirty = true;
    this.fx.push({ k: "deliver", x: p.x, y: p.y, i: p.id });
  }
  async banned(id) {                           // (admin) a banned pilot's hold scatters where they were
    const p = this.players.get(String(id)); if (!p) return;
    for (const e of p.hold) this.spawnDrops(e.o, e.u, p.x, p.y, 60);
    p.hold = [];
  }

  // ---- commands ----
  act(id, m) {
    const p = this.players.get(String(id)); if (!p || !m) return;
    if (typeof m.rock === "string" && m.op === "mark") {   // a marked rock rides my minimap until it's gone
      const r = this.rocks.get(m.rock); if (!r) return;
      p.mark = p.mark && p.mark.rock === r.id ? null : { rock: r.id, x: Math.round(r.x), y: Math.round(r.y) };
    } else if (m.op === "drop") {              // jettison the hold as drops where I sit
      if (p.docked || !p.hold.length) return;
      for (const e of p.hold) this.spawnDrops(e.o, e.u, p.x, p.y, 60);
      p.hold = []; p.dirty = true;
    }
    p.meDirty = true;
  }
  station(id, m) {                             // docked only: board another ship (one kind for now)
    const p = this.players.get(String(id)); if (!p || !p.docked || !m || typeof m.op !== "string") return false;
    if (m.op === "ship") {
      if (!SHIPS[m.k] || p.ship === m.k || p.hold.length) return false;
      p.ship = m.k;
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
  // ships in vision: [id, x dm, y dm, h mrad, ship idx, flags (1 beam on, 2 firing, 8 docked), aim mrad, beam length, hold %]
  shipRowCache() {
    const out = [];
    for (const p of this.players.values()) {
      const S = this.shipOf(p);
      out.push({ p, key: "", row: [p.id, Math.round(p.x * 10), Math.round(p.y * 10), Math.round(p.h * 1000), R.SHIP_KINDS.indexOf(p.ship),
        (p.laserOn ? 1 : 0) | (p.firing && !p.docked ? 2 : 0) | (p.docked ? 8 : 0),
        Math.round(p.aim * 1000), Math.round(p.laserLen), Math.round(this.usedSpace(p) / S.hold * 100)] });
    }
    for (const e of out) e.key = JSON.stringify(e.row);
    return out;
  }
  shipRows(viewer, cache = this.shipRowCache()) {
    const V = this.visionOf(viewer);
    return cache.filter((e) => e.p === viewer || hyp(e.p.x - viewer.x, e.p.y - viewer.y) <= V);
  }
  // rocks in vision: [id, x, y, shells, outer r, broken %, core hp %, fill %]; the chunk layout travels separately
  rockRows(viewer) {
    const out = [], V = this.visionOf(viewer);
    for (const r of this.rocksNear(viewer.x, viewer.y, V + 200)) {
      if (hyp(r.x - viewer.x, r.y - viewer.y) > V + r.r) continue;
      out.push([r.id, Math.round(r.x), Math.round(r.y), r.shellsN, Math.round(r.r),
        Math.round(Math.min(1, r.nBroken / r.chunks.length) * 100), Math.round(Math.max(0, r.core.hp / r.core.maxHp) * 100),
        Math.round(Math.min(1, r.core.bankedTotal / r.core.total) * 100)]);
    }
    return out;
  }
  // a chunk: [i, r0, r1, a0 mrad, a1 mrad, broken 0/1, density, ore idx | -1, crack stage] — all visible. With geo
  // (first sight per socket): g = each chunk's exact polygon as [i, nO, x0, y0, x1, y1, ...] — the hitbox clients draw.
  rockDetail(r, geo) {
    const m = { t: "rockd", id: r.id, v: r.v, coreR: r.core.r0, c: r.chunks.map((c) => [c.i, Math.round(c.r0 * 10) / 10, Math.round(c.r1 * 10) / 10, Math.round(normA(c.a0) * 1000), Math.round(normA(c.a1) * 1000),
      c.broken ? 1 : 0, c.d, c.ore ? ORE_KEYS.indexOf(c.ore) : -1, c.broken ? 0 : this.dmgStage(c)]) };
    if (geo) m.g = r.chunks.map((c) => [c.i, c.poly.nO, ...c.poly.pts.flat()]);
    return m;
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
    return { t: "me", cap: S.hold, hold: p.hold.map((e) => ({ o: e.o, u: e.u, raw: e.raw ? 1 : 0 })), docked: p.docked ? 1 : 0,
      ship: p.ship, zone: p.zone, storage: Object.fromEntries(Object.entries(p.storage).map(([o, u]) => [o, Math.round(u)])),
      mark: p.mark ? [p.mark.x, p.mark.y] : 0 };
  }
  roster() { return [...this.players.values()].map((p) => ({ i: p.id, n: p.name })); }
}
