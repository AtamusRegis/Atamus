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
// (owner, 2026-10-18: "make each chunk have an exact hitbox") every chunk is one polygon, built here once; clients draw
// exactly these points and the laser hits exactly these edges. The chunk sheet's shape: a clean slab of its layer's
// ring, a half-gap in from every side, edges roughened by a fraction of a meter.
const h01 = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
function chunkPoly(c) {
  const g = (R.LAYOUT.gap || 0) / 2, r0 = c.r0 + g, r1 = c.r1 - g, i = c.i;
  let a0 = c.a0, a1 = c.a1; if (a1 <= a0) a1 += TAU;
  const mid = (r0 + r1) / 2, ga = g / mid; a0 += ga; a1 -= ga;
  const span = a1 - a0, pts = [], nO = Math.max(2, Math.round(span * r1 / 4)), nI = Math.max(2, Math.round(span * r0 / 4));
  const rough = (k, edge) => edge ? 0 : (h01(i, k) - 0.5) * 0.5;
  for (let k = 0; k <= nO; k++) { const a = a0 + span * k / nO, r = r1 + rough(k + 40, k === 0 || k === nO);
    pts.push([Math.round(Math.cos(a) * r * 10) / 10, Math.round(Math.sin(a) * r * 10) / 10]); }
  for (let k = nI; k >= 0; k--) { const a = a0 + span * k / nI, r = Math.max(1, r0 + rough(k + 120, k === 0 || k === nI));
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
    this.drops = new Map(); this.dropSeq = 1; this.bits = []; this.xfers = []; this.hotRocks = new Set();
    this.cans = new Map(); this.canSeq = 1;   // (owner, 2026-10-18) jetcans
    this.parties = new Map(); this.memberParty = new Map(); this.invites = new Map();   // (owner, 2026-10-18) parties: id -> { id, leader, members [{ i, n }] }; pilot -> party; invitee -> { from, at }  // ore adrift: free for anyone, picked up by flying over
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
    // (owner, 2026-10-18: loot and jetcans persist updates and restarts) the clocks stop while the server is down: every
    // timer is pushed forward by the downtime (the last heartbeat saved in ring_meta), so nothing expires during an update
    let down = 0;
    { const hb = await pool.query(`SELECT v FROM ring_meta WHERE k = 'alive'`); const at = hb.rows[0] && +hb.rows[0].v; if (at > 0) down = Math.max(0, Math.min(7 * 86400e3, Date.now() - at)); }
    this.downMs = down;
    if (down > 0) await pool.query(`UPDATE ring_drops SET created_at = created_at + $1 * interval '1 millisecond'`, [down]);
    const { rows } = await pool.query(`SELECT * FROM ring_drops`);
    for (const r of rows) if (R.ORES[r.ore]) this.drops.set(r.id, { id: r.id, x: +r.x, y: +r.y, ore: r.ore, units: +r.units, born: new Date(r.created_at).getTime(), dirty: false });
    this.dropSeq = Math.max(1, ...[...this.drops.keys()].map((k) => k + 1));
    await pool.query(`CREATE TABLE IF NOT EXISTS ring_jetcans (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, party TEXT, x DOUBLE PRECISION NOT NULL,
      y DOUBLE PRECISION NOT NULL, h DOUBLE PRECISION NOT NULL DEFAULT 0, hold JSONB NOT NULL DEFAULT '{}', born TIMESTAMPTZ NOT NULL DEFAULT now(), public_at TIMESTAMPTZ)`);
    if (down > 0) await pool.query(`UPDATE ring_jetcans SET born = born + $1 * interval '1 millisecond', public_at = public_at + $1 * interval '1 millisecond'`, [down]);
    await this.heartbeat();
    await pool.query(`ALTER TABLE ring_jetcans ADD COLUMN IF NOT EXISTS split JSONB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ring_parties (id TEXT PRIMARY KEY, leader TEXT NOT NULL, members JSONB NOT NULL DEFAULT '[]')`);
    for (const r of (await pool.query(`SELECT * FROM ring_parties`)).rows) {
      const members = (Array.isArray(r.members) ? r.members : []).filter((m2) => m2 && typeof m2.i === "string").map((m2) => ({ i: m2.i, n: String(m2.n || "") }));
      if (members.length < 2) { pool.query(`DELETE FROM ring_parties WHERE id = $1`, [r.id]).catch(() => {}); continue; }
      this.parties.set(r.id, { id: r.id, leader: members.some((m2) => m2.i === r.leader) ? r.leader : members[0].i, members });
      for (const m2 of members) this.memberParty.set(m2.i, r.id);
    }
    const jc = await pool.query(`SELECT * FROM ring_jetcans`);
    for (const r of jc.rows) this.cans.set(r.id, { id: r.id, owner: r.owner, party: r.party || null, split: Array.isArray(r.split) ? r.split.map(String) : null, x: +r.x, y: +r.y, h: +r.h, hold: r.hold || {},
      born: new Date(r.born).getTime(), publicAt: r.public_at ? new Date(r.public_at).getTime() : 0, armed: true, dirty: false });
    this.canSeq = Math.max(1, ...[...this.cans.keys()].map((k) => k + 1));
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
    // (owner, 2026-10-18) the chunk sheet: layers of equal thickness around the core; each layer's slots are its arc
    // wide; a slot is one chunk, or split across its width (inner / outer halves) and/or along its length (two halves).
    // Each chunk rolls a density (D1 light .. D3 dark: denser takes longer) and, if it has ore, 1-3 bits.
    const C = R.CHUNK, L = R.LAYOUT, ws = [C.wD1, C.wD2, C.wD3], bw = [C.b1, C.b2, C.b3];
    const pick = (w) => { let v = rand() * w.reduce((a, b) => a + b, 0); for (let k = 0; k < w.length; k++) { v -= w[k]; if (v <= 0) return k; } return w.length - 1; };
    const chunks = [], shells = [];
    let rr = SZ.coreR;
    for (let shellIdx = 0; shellIdx < nSh; shellIdx++) {
      const r0 = rr + L.gap, r1 = r0 + L.layer, mid = (r0 + r1) / 2, segs = [];
      const arc = L.arcs[Math.min(shellIdx, L.arcs.length - 1)] || 12, nSlot = Math.max(3, Math.round(360 / arc)), off = rand() * TAU;
      for (let s0 = 0; s0 < nSlot; s0++) {
        const b0 = off + (s0 / nSlot) * TAU, b1 = off + ((s0 + 1) / nSlot) * TAU, bm = (b0 + b1) / 2;
        const bands = rand() < L.splitW ? [[r0, mid], [mid, r1]] : [[r0, r1]];
        for (const [q0, q1] of bands) {
          const spans = rand() < L.splitL ? [[b0, bm], [bm, b1]] : [[b0, b1]];
          for (const [e0, e1] of spans) {
            const bed = rand() < (R.RING_BEDROCK[ring] ?? 0.1);   // (owner, 2026-10-18) bedrock: d 3, no ore, the Miner can't cut it
            const d = bed ? 3 : pick(ws), c = { i: chunks.length, sh: shellIdx, r0: q0, r1: q1, a0: normA(e0), a1: normA(e1), d, ore: null, u: 0, n: 0, broken: false, scanned: false };
            if (!bed && rand() >= C.barren) { c.ore = types[Math.floor(rand() * types.length)]; c.n = 1 + pick(bw); c.u = c.n * (C.oreUnit || 100); }
            const area = (e1 - e0) * ((q0 + q1) / 2) * (q1 - q0);
            c.maxHp = Math.max(8, area * C.hpK * [C.d1, C.d2, C.d3, 99][d]); c.hp = c.maxHp;
            c.scanHp = Math.max(4, area * C.scanK * [C.s1, C.s2, C.s3, C.sBed][d]);
            segs.push(c.i); chunks.push(c);
          }
        }
      }
      shells.push({ r0, r1, segs }); rr = r1;
    }
    const CO = R.CORIUM, lump = R.DROPS.lump || 100;   // (owner, 2026-10-18) the core's own corium: more layers, deeper rings, more
    const corium = Math.max(lump, Math.round((CO.perLayer * nSh * (CO.ring[ring] ?? 1)) / lump) * lump);
    let reach = rr; for (const c of chunks) { c.poly = chunkPoly(c); reach = Math.max(reach, hyp(c.poly.cx, c.poly.cy) + c.poly.br); }
    return { id: key + ":" + gen + ":" + epoch, key, cell: key, gen, x, y, ring, shellsN: nSh, r: rr, reach, chunks, shells, nBroken: 0,
      core: { r0: SZ.coreR, hp: SZ.coreHp, maxHp: SZ.coreHp, banked: { corium }, bankedTotal: corium, total: corium, popped: false },
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
    const J = R.JETCAN;                        // jetcans: private ones turn public on time (a party's also when it disbands); public ones expire
    for (const c of [...this.cans.values()]) {
      if (!c.publicAt && (t - c.born > J.privateFor * 1000 || (c.party && !this.partyAlive(c.party)))) { c.publicAt = t; c.dirty = true; }
      if (c.publicAt && t - c.publicAt > J.publicFor * 1000) this.deleteCan(c);
    }
  }
  partyOf(pid) { return this.memberParty.get(String(pid)) || null; }
  partyAlive(id) { return this.parties.has(id); }
  canUnits(c) { return Object.values(c.hold).reduce((a, u) => a + u, 0); }
  canKind(c) { return c.publicAt ? 2 : c.party ? 1 : 0; }
  canHaul(p, c) { return c.publicAt ? true : c.party ? this.partyOf(p.id) === c.party || p.ship === "hauler" : c.owner === p.id; }   // (any Hauler can carry a party's can: its ore still goes to the party)
  deleteCan(c) { this.cans.delete(c.id); pool.query(`DELETE FROM ring_jetcans WHERE id = $1`, [c.id]).catch(() => {}); }
  async saveCan(c) {
    await pool.query(`INSERT INTO ring_jetcans (id, owner, party, x, y, h, hold, born, public_at, split) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0), $9, $10)
      ON CONFLICT (id) DO UPDATE SET hold = $7, public_at = $9, x = $4, y = $5`, [c.id, c.owner, c.party, c.x, c.y, c.h, JSON.stringify(c.hold), c.born, c.publicAt ? new Date(c.publicAt) : null, c.split ? JSON.stringify(c.split) : null])
      .catch((e) => console.error("ring jetcan", e));
  }
  // (owner, 2026-10-18) send out a jetcan: the hold pours into a new can behind the ship, up to 100 ore bits. Up to 3
  // private cans per pilot; past that the pilot is asked first, and replace: true destroys the oldest (ore and all)
  sendJetcan(p, replace) {
    if (p.docked || !p.hold.some((e) => !e.sp)) return;   // (party ore can't be jetcanned)
    const J = R.JETCAN, cap = J.bits * (R.CHUNK.oreUnit || 100);
    const mine = [...this.cans.values()].filter((c2) => c2.owner === p.id && !c2.publicAt).sort((a, b) => a.born - b.born);
    if (mine.length >= J.max) {
      if (!replace) { this.msgs.push({ to: p.id, m: { t: "canFull", n: mine.length } }); return; }
      for (const old of mine.slice(0, mine.length - J.max + 1)) { this.fx.push({ k: "canGone", x: old.x, y: old.y }); this.deleteCan(old); }
    }
    const back = (this.shipOf(p).len || 60) * 0.6;
    const pty = this.partyOf(p.id), c = { id: this.canSeq++, owner: p.id, party: pty, split: pty && this.parties.get(pty) ? this.parties.get(pty).members.map((m2) => m2.i) : null, x: p.x - Math.sin(p.h) * back, y: p.y + Math.cos(p.h) * back, h: p.h, hold: {}, born: now(), publicAt: 0, armed: false, dirty: true };
    let room = cap;
    for (const e of p.hold) { if (room <= 0) break; if (e.sp) continue; const u = Math.min(e.u, room); c.hold[e.o] = (c.hold[e.o] || 0) + u; e.u -= u; room -= u; }
    p.hold = p.hold.filter((e) => e.u > 0);
    this.cans.set(c.id, c); p.meDirty = true; p.dirty = true;
    this.fx.push({ k: "can", x: c.x, y: c.y, i: p.id });
  }
  // ---- parties (owner, 2026-10-18): right-click a pilot to invite (they accept or decline); the leader right-clicks a
  // member to kick; a member right-clicks themselves to leave. A party of one disbands (its cans turn public). ----
  partyTell(pt) {
    const view = { t: "party", id: pt.id, leader: pt.leader, members: pt.members.map((m2) => ({ i: m2.i, n: m2.n, on: this.players.has(m2.i) ? 1 : 0 })) };
    for (const m2 of pt.members) if (this.players.has(m2.i)) this.msgs.push({ to: m2.i, m: view });
  }
  partySave(pt) { pool.query(`INSERT INTO ring_parties (id, leader, members) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET leader = $2, members = $3`, [pt.id, pt.leader, JSON.stringify(pt.members)]).catch((e) => console.error("party save", e)); }
  partyRemove(pt, pid) {
    pt.members = pt.members.filter((m2) => m2.i !== pid); this.memberParty.delete(pid);
    this.msgs.push({ to: pid, m: { t: "party", id: null } });
    if (pt.members.length < 2) {               // disbanded: the last one out too; its private cans turn public on the next tick
      for (const m2 of pt.members) { this.memberParty.delete(m2.i); this.msgs.push({ to: m2.i, m: { t: "party", id: null } }); }
      this.parties.delete(pt.id); pool.query(`DELETE FROM ring_parties WHERE id = $1`, [pt.id]).catch(() => {});
      return;
    }
    if (pt.leader === pid) pt.leader = pt.members[0].i;
    this.partySave(pt); this.partyTell(pt);
  }
  partyAct(p, m) {
    const t = now();
    if (m.op === "invite" && typeof m.to === "string") {
      const q = this.players.get(m.to); if (!q || q.id === p.id || this.partyOf(q.id)) return;
      const mine = this.parties.get(this.partyOf(p.id)); if (mine && mine.members.length >= 8) return;
      this.invites.set(q.id, { from: p.id, at: t });
      this.msgs.push({ to: q.id, m: { t: "invite", from: p.id, n: p.name } });
    } else if (m.op === "inviteReply" && typeof m.from === "string") {
      const inv = this.invites.get(p.id); this.invites.delete(p.id);
      if (!inv || inv.from !== m.from || t - inv.at > 60000 || m.yes !== true || this.partyOf(p.id)) return;
      const q = this.players.get(m.from); let pt = this.parties.get(this.partyOf(m.from));
      if (!pt) { if (!q) return; pt = { id: "p" + t.toString(36) + Math.floor(Math.random() * 1e6).toString(36), leader: q.id, members: [{ i: q.id, n: q.name }] }; this.parties.set(pt.id, pt); this.memberParty.set(q.id, pt.id); }
      if (pt.members.length >= 8) return;
      pt.members.push({ i: p.id, n: p.name }); this.memberParty.set(p.id, pt.id);
      this.partySave(pt); this.partyTell(pt);
    } else if (m.op === "kick" && typeof m.who === "string") {
      const pt = this.parties.get(this.partyOf(p.id)); if (!pt || pt.leader !== p.id || m.who === p.id || !pt.members.some((m2) => m2.i === m.who)) return;
      this.partyRemove(pt, m.who);
    } else if (m.op === "leave") {
      const pt = this.parties.get(this.partyOf(p.id)); if (pt) this.partyRemove(pt, p.id);
    }
  }
  allowed(p, x, y) { const r = hyp(x, y); return r >= W.saturnR + (this.shipOf(p).r || FLY.shipR) && r <= W.lockedR; }
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
        hold: Array.isArray(r.hold) ? r.hold.filter((e) => e && R.ORES[e.o] && Number.isFinite(e.u)).map((e) => { const e2 = { o: e.o, u: e.u, raw: e.raw ? 1 : 0 }; if (Array.isArray(e.sp) && e.sp.length) e2.sp = e.sp.map(String); return e2; }) : [] });
      if (!this.allowed(p, p.x, p.y)) { p.x = sx; p.y = sy + 120; }
    }
    p.zone = zoneOf(p.x, p.y);
    this.players.set(id, p);
    { const pt = this.parties.get(this.partyOf(id)); if (pt) { const m2 = pt.members.find((x) => x.i === id); if (m2) m2.n = name; this.partyTell(pt); } }
    await pool.query(`INSERT INTO ring_players (user_id, x, y, h, fuel, module, modules) VALUES ($1, $2, $3, $4, 0, $5, '[]')
      ON CONFLICT (user_id) DO UPDATE SET logout_at = NULL`, [id, p.x, p.y, p.h, p.ship]);
    return p;
  }
  async leave(id) {
    const p = this.players.get(String(id)); if (!p) return;
    this.players.delete(p.id);
    { const pt = this.parties.get(this.partyOf(p.id)); if (pt) this.partyTell(pt); }
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
      const t = now(), dt = Math.min(0.5, (t - (p.hAt || t)) / 1000) + 0.1, mx = (this.shipOf(p).turn || FLY.turn) * dt * 1.3, d = Math.atan2(Math.sin(m.h - p.h), Math.cos(m.h - p.h));
      p.h = p.h + Math.max(-mx, Math.min(mx, d)); p.h = Math.atan2(Math.sin(p.h), Math.cos(p.h)); p.hAt = t;
    }
    p.aim = n(m.a); p.firing = m.f === 1; p.alt = m.md === 1;   // alt: the Booster's boost beam (else its coolant)
  }

  // the laser's ray into a rock: whatever it meets first — an unbroken chunk's exact polygon, or the core's circle
  castRock(rock, px, py, ux, uy, scan) {   // scan: pass through chunks already scanned (the scan beam goes on inward)
    const ox = px - rock.x, oy = py - rock.y;
    { const along = -(ox * ux + oy * uy), perp = Math.abs(ox * uy - oy * ux);
      if (perp > rock.reach || along < -rock.reach) return null; }   // the line misses the rock entirely
    let best = Infinity, hit = null;
    for (const c of rock.chunks) {
      if (c.broken || (scan && c.scanned)) continue;
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
    const t = now(); this.simT = t;
    for (const p of this.players.values()) {
      const S = this.shipOf(p), push = hyp(p.fx, p.fy);
      const acc = S.accel || FLY.accel, a = (push > 0.01 ? acc : acc * FLY.brake / FLY.accel) * dt;   // (per ship: bigger is slower to speed up)
      let ex = p.fx * S.speed - p.vx, ey = p.fy * S.speed - p.vy; const el = hyp(ex, ey); if (el > 1e-9 && el > a) { ex *= a / el; ey *= a / el; }
      p.vx += ex; p.vy += ey;
      if (p.vx || p.vy) {
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (this.allowed(p, nx, ny)) { p.x = nx; p.y = ny; }
        else if (this.allowed(p, nx, p.y)) { p.x = nx; p.vy = 0; } else if (this.allowed(p, p.x, ny)) { p.y = ny; p.vx = 0; } else { p.vx = p.vy = 0; }
        for (const r of this.rocksNear(p.x, p.y, 220 + (S.r || 0))) {
          const d = hyp(p.x - r.x, p.y - r.y), min = r.r + (S.r || FLY.shipR);   // (each ship bumps at its own size)
          if (d < min && d > 0.01) { const ux = (p.x - r.x) / d, uy = (p.y - r.y) / d; p.x = r.x + ux * min; p.y = r.y + uy * min; const vn = p.vx * ux + p.vy * uy; if (vn < 0) { p.vx -= vn * ux; p.vy -= vn * uy; } }
        }
        const z = zoneOf(p.x, p.y); if (z !== p.zone) { p.zone = z; p.meDirty = true; }
        p.dirty = true;
      }
      const dock = hyp(p.x - W.station[0], p.y - W.station[1]) < R.ECON.dockR;
      if (dock && !p.docked) this.deliver(p);
      if (dock !== p.docked) { p.docked = dock; p.meDirty = true; }
      // ore drops: only with the tractor field on (owner, 2026-10-18: running over them doesn't pick them up) — one that
      // reaches the ship pours in up to the room aboard; the rest waits for another trip
      if (!dock && p.cargo === 2 && S.tractor) for (const d of this.drops.values()) {
        if (hyp(d.x - p.x, d.y - p.y) > Math.max(42, S.r || 0)) continue;   // (a big hull scoops what reaches its hull)
        const room = Math.max(0, Math.floor(S.hold - this.usedSpace(p))); if (room <= 0) break;
        const take = Math.min(d.units, room);
        let e = p.hold.find((e2) => e2.raw && !e2.sp && e2.o === d.ore); if (!e) { e = { o: d.ore, u: 0, raw: 1 }; p.hold.push(e); }
        e.u += take; d.units -= take; d.dirty = true; p.meDirty = true; p.dirty = true;
        this.fx.push({ k: "take", x: d.x, y: d.y, i: p.id, ore: ORE_KEYS.indexOf(d.ore) });
        if (d.units <= 0) this.deleteDrop(d);
      }
      // (owner, 2026-10-18) the withdraw field: drops and haulable jetcans inside it drift in to be scooped
      if (p.cargo === 2 && S.tractor && !dock && this.usedSpace(p) < S.hold - 0.5) {
        const pull = (R.TRACTOR.pull || 45) * dt, reach = S.len * (1 + S.tractor.depth + (S.hw || 0.2));
        const drag = (o) => { const dx = p.x - o.x, dy = p.y - o.y, L = hyp(dx, dy); if (L < 1) return false; const k = Math.min(L, pull) / L; o.x += dx * k; o.y += dy * k; return true; };
        for (const d of this.drops.values()) if (Math.abs(d.x - p.x) < reach && Math.abs(d.y - p.y) < reach && this.inTractor(p, S, d.x, d.y, -1) && drag(d)) d.dirty = true;
        for (const c of this.cans.values()) if ((c.owner !== p.id || c.armed) && this.canHaul(p, c) && Math.abs(c.x - p.x) < reach && Math.abs(c.y - p.y) < reach && this.inTractor(p, S, c.x, c.y, -1) && drag(c)) c.dirty = true;
      }
      // (owner, 2026-10-18) the deposit field: the hold streams out into a station beam it touches, or into another ship's
      // withdraw field it overlaps
      if (p.cargo === 1 && S.tractor && !dock && p.hold.length) {
        p.xferAcc = Math.min(1000, (p.xferAcc || 0) + (S.xfer || 500) * dt);
        const lump = R.DROPS.lump || 100;
        while (p.xferAcc >= lump && p.hold.length) {
          const to = this.depositTarget(p, S, lump); if (!to) { p.xferAcc = 0; break; }
          const e = p.hold[0], u = Math.min(lump, e.u); e.u -= u; if (e.u <= 0) p.hold.shift(); p.xferAcc -= lump;
          // (owner, 2026-10-18) into a station field, the lump rides it all the way in to the station's pod
          const [ox, oy] = this.fieldMid(p, S, -1), dist = hyp(to.x - ox, to.y - oy) + (to.px !== undefined ? hyp(to.px - to.x, to.py - to.y) : 0), dur = Math.max(0.2, dist / (R.TRACTOR.xferSpeed || 260));
          this.xfers.push({ from: p.id, to: to.id, ore: e.o, u, sp: e.sp || null, due: t + dur * 1000, x: to.x, y: to.y });
          this.fx.push({ k: "xfer", i: p.id, to: to.id === "st" ? 0 : to.id, ore: ORE_KEYS.indexOf(e.o), x: Math.round(ox), y: Math.round(oy), x1: Math.round(to.x), y1: Math.round(to.y), ...(to.px !== undefined ? { x2: Math.round(to.px), y2: Math.round(to.py) } : {}), ts: t, dur: Math.round(dur * 1000) });
          p.meDirty = true; p.dirty = true;
        }
      } else p.xferAcc = 0;
      // jetcans: fly up to one you may haul from and it pours in up to the room aboard (your own only once you've flown off)
      for (const c of [...this.cans.values()]) {
        const dc = hyp(c.x - p.x, c.y - p.y);
        if (c.owner === p.id && !c.armed) { if (dc > R.JETCAN.ownerAway) c.armed = true; continue; }
        if (dock || dc > Math.max(R.JETCAN.pickR, S.r || 0) || !this.canHaul(p, c)) continue;
        let room = Math.max(0, Math.floor(S.hold - this.usedSpace(p))); if (room <= 0) break;
        for (const [o, u] of Object.entries(c.hold)) {
          if (room <= 0) break; const take = Math.min(u, room); if (take <= 0) continue;
          // a party can's ore stays the party's: tagged with who was in the party when the can was made, it can't be
          // dropped or jetcanned, and its delivery is split evenly among them (owner, 2026-10-18)
          const sp = c.party && !c.publicAt && Array.isArray(c.split) && c.split.length ? c.split : null, key = sp ? sp.join(",") : "";
          let e = p.hold.find((e2) => e2.raw && e2.o === o && (e2.sp ? e2.sp.join(",") : "") === key); if (!e) { e = { o, u: 0, raw: 1 }; if (sp) e.sp = [...sp]; p.hold.push(e); }
          e.u += take; room -= take; c.hold[o] = u - take; if (c.hold[o] <= 0) delete c.hold[o];
          p.meDirty = true; p.dirty = true; c.dirty = true;
        }
        if (c.dirty) this.fx.push({ k: "take", x: c.x, y: c.y, i: p.id, ore: 0 });
        if (!Object.keys(c.hold).length) this.deleteCan(c);
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
          const rock = best.r, H = R.HEAT; let dmg = S.laserDps * dt * this.boostOf(p, t);
          p.laserOn = true; p.laserLen = best.hit.t; p.laserRock = rock.id;
          rock.touched = t; rock.home = false;
          if (best.hit.core) { this.heatCore(rock, H.coreDirect * dt); this.hitCore(rock, dmg); }
          else {
            const ch = best.hit.chunk;           // (owner, 2026-10-18) no anchoring: the laser cuts exactly what it points at
            p.laserChunk = ch.i;
            if (ch.d === 3) {                    // bedrock: the Miner's laser stops on it, uncut — but it still heats and glows (owner, 2026-10-18)
              ch.heat = Math.min(1, (ch.heat || 0) + R.HEAT.chunkUp * dt); this.hotRocks.add(rock);
              if (!ch.hit) { ch.hit = true; rock.v++; }
            } else {
            // (owner, 2026-10-18) heat: the cut heats the chunk, a hot chunk cuts faster, and its heat seeps into the core
            ch.heat = Math.min(1, (ch.heat || 0) + H.chunkUp * dt); dmg *= 1 + H.speed * ch.heat;
            this.hotRocks.add(rock);
            const st0 = this.dmgStage(ch);
            ch.hp -= dmg;
            if (!ch.hit) { ch.hit = true; rock.v++; }   // (owner, 2026-10-18) a chunk the laser has touched shows its border, scanned or not
            // (owner, 2026-10-18) each ore bit leaves as the cut passes its share of the chunk (the last at the break)
            // and rides a wave back down the beam into my hold
            if (ch.n > 0 && ch.ore) {
              const due = ch.hp <= 0 ? ch.n : Math.min(ch.n, Math.floor((1 - ch.hp / ch.maxHp) * ch.n + 1e-6));
              while ((ch.out || 0) < due) { ch.out = (ch.out || 0) + 1; this.sendBit(p, ch.ore, Math.round(ch.u / ch.n), mx0 + ux * best.hit.t, my0 + uy * best.hit.t, best.hit.t, t); }
            }
            if (ch.hp <= 0) this.breakChunk(rock, ch); else if (this.dmgStage(ch) !== st0) rock.v++;
            }
            if (rock.core.heat >= 1 && !rock.core.popped) this.overheat(rock);
          }
        } else p.laserLen = S.laserRange;
      }
      // (owner, 2026-10-18) the Scanner's scan beam: through the chunks already scanned, onto the first unscanned one on its
      // line, toward the core one chunk at a time; denser takes longer, bedrock much longer. Scans are shared by everyone.
      if (p.firing && !dock && S.scanDps) {
        const ux = Math.cos(p.aim), uy = Math.sin(p.aim); let best = null, bd = S.scanRange;
        const mz = S.muzzle || 0, mx0 = p.x + Math.sin(p.h) * mz, my0 = p.y - Math.cos(p.h) * mz;
        for (const r of this.rocksNear(mx0, my0, S.scanRange + 360)) {
          const hit = this.castRock(r, mx0, my0, ux, uy, true);
          if (hit && hit.t <= S.scanRange && hit.t < bd) { bd = hit.t; best = { r, hit }; }
        }
        p.laserLen = best ? best.hit.t : S.scanRange;
        if (best && !best.hit.core) {
          const rock = best.r, ch = best.hit.chunk; p.laserOn = true; p.laserRock = rock.id; p.laserChunk = ch.i; rock.touched = t; rock.home = false;
          ch.scanHp -= S.scanDps * dt * this.boostOf(p, t);
          if (ch.scanHp <= 0 && !ch.scanned) {
            ch.scanned = true; rock.v++;
            const mid = (ch.r0 + ch.r1) / 2, ang = ch.a0 + normA(ch.a1 - ch.a0) / 2;
            this.fx.push({ k: "scan", x: rock.x + Math.cos(ang) * mid, y: rock.y + Math.sin(ang) * mid, i: p.id });
          }
        }
      }
      // (owner, 2026-10-18) the Booster: its coolant beam (default) cools the core of the rock it meets (and the chunk it
      // lands on); F switches to the boost beam — one ship it points at cuts / cools / scans / refines faster
      p.beamTgt = null;
      if (p.firing && !dock && S.boost) {
        const ux = Math.cos(p.aim), uy = Math.sin(p.aim), mz = S.muzzle || 0, mx0 = p.x + Math.sin(p.h) * mz, my0 = p.y - Math.cos(p.h) * mz;
        if (!p.alt) {
          let best = null, bd = S.coolRange;
          for (const r of this.rocksNear(mx0, my0, S.coolRange + 360)) { const hit = this.castRock(r, mx0, my0, ux, uy); if (hit && hit.t <= S.coolRange && hit.t < bd) { bd = hit.t; best = { r, hit }; } }
          p.laserLen = best ? best.hit.t : S.coolRange;
          if (best) {
            const rock = best.r, k = S.coolRate * dt * this.boostOf(p, t); p.laserOn = true; p.laserRock = rock.id; rock.touched = t;
            rock.core.heat = Math.max(0, (rock.core.heat || 0) - k);
            if (best.hit.chunk) best.hit.chunk.heat = Math.max(0, (best.hit.chunk.heat || 0) - k * 3);
          }
        } else {
          let best = null, bd = Infinity;
          for (const q of this.players.values()) {
            if (q === p || q.docked) continue; const dx = q.x - mx0, dy = q.y - my0, along = dx * ux + dy * uy;
            if (along < 0 || along > S.boostRange) continue; const perp = Math.abs(dx * uy - dy * ux), QS = this.shipOf(q);
            if (perp > (QS.r || 24) + 30) continue; if (along < bd) { bd = along; best = q; }
          }
          p.laserLen = best ? bd : S.boostRange;
          if (best) { p.beamTgt = best.id; p.laserOn = true; best.boostUntil = t + (R.BOOST.hold || 400); }
        }
      }
      // (owner, 2026-10-18) the Hauler's refining (R): raw ore turns refined, taking less room
      if (p.refining && S.refineRate && !dock) {
        let left = S.refineRate * dt * this.boostOf(p, t);
        for (const e of [...p.hold]) {
          if (left <= 0) break; if (!e.raw || e.u <= 0) continue;
          const u = Math.min(e.u, left); e.u -= u; left -= u;
          const key = e.sp ? e.sp.join(",") : "";
          let f = p.hold.find((e2) => !e2.raw && e2.o === e.o && (e2.sp ? e2.sp.join(",") : "") === key); if (!f) { f = { o: e.o, u: 0, raw: 0 }; if (e.sp) f.sp = [...e.sp]; p.hold.push(f); }
          f.u += u; p.meDirty = true; p.dirty = true;
        }
        if (p.meDirty) { p.hold = p.hold.filter((e) => e.u > 0.001); for (const e of p.hold) e.u = Math.round(e.u * 1000) / 1000; }
      }
      if (p.firing) p.meDirty = true;
    }
    // heat cools: every rock still warm loses a little each tick
    if (this.hotRocks.size) for (const rock of [...this.hotRocks]) {
      const H = R.HEAT; let warm = false;
      // (owner, 2026-10-18) the core heats from all its warm chunks together: the more of them and the hotter, the faster
      { let sum = 0; for (const c of rock.chunks) if (c.heat > 0 && !c.broken) sum += c.heat * c.heat; if (sum > 0) rock.core.heat = Math.min(1, (rock.core.heat || 0) + H.coreIn * sum * dt); }
      if (rock.core.heat >= 1 && !rock.core.popped) { this.overheat(rock); continue; }
      if (rock.core.heat > 0) { rock.core.heat = Math.max(0, rock.core.heat - H.coreCool * dt); warm = warm || rock.core.heat > 0; }
      for (const c of rock.chunks) if (c.heat > 0) { c.heat = c.broken ? 0 : Math.max(0, c.heat - H.chunkCool * dt); warm = warm || c.heat > 0; }
      if (!warm || !this.rocks.has(rock.id)) this.hotRocks.delete(rock);
    }
    if (this.bits.length) {                    // ore bits arriving down the beam: into the hold, any overflow adrift by the ship
      const keep = [];
      for (const b of this.bits) {
        if (b.due > t) { keep.push(b); continue; }
        const p = this.players.get(b.pid);
        if (!p) { this.spawnDrops(b.ore, b.u, b.x, b.y, 20); continue; }
        const room = Math.max(0, Math.floor(this.shipOf(p).hold - this.usedSpace(p))), take = Math.min(b.u, room);
        if (take > 0) { let e = p.hold.find((e2) => e2.raw && !e2.sp && e2.o === b.ore); if (!e) { e = { o: b.ore, u: 0, raw: 1 }; p.hold.push(e); } e.u += take; p.meDirty = true; p.dirty = true; }
        if (b.u - take > 0) this.spawnDrops(b.ore, b.u - take, p.x, p.y, 30);
      }
      this.bits = keep;
    }
    if (this.xfers.length) {                   // cargo in transit: into station storage, or the receiving ship's hold
      const keep = [];
      for (const x of this.xfers) {
        if (x.due > t) { keep.push(x); continue; }
        const from = this.players.get(x.from);
        if (x.to === "st") { this.deliverEntries(from || { id: x.from }, [{ o: x.ore, u: x.u, sp: x.sp }], true); continue; }
        const q = this.players.get(x.to), Q = q && this.shipOf(q);
        const back = from || null, dest = q && this.usedSpace(q) + x.u <= Q.hold ? q : back && this.usedSpace(back) + x.u <= this.shipOf(back).hold ? back : null;
        if (!dest) { if (!x.sp) this.spawnDrops(x.ore, x.u, x.x, x.y, 20); else if (back) back.hold.push({ o: x.ore, u: x.u, raw: 1, sp: x.sp }); continue; }
        const key = x.sp ? x.sp.join(",") : "";
        let e = dest.hold.find((e2) => e2.raw && e2.o === x.ore && (e2.sp ? e2.sp.join(",") : "") === key); if (!e) { e = { o: x.ore, u: 0, raw: 1 }; if (x.sp) e.sp = [...x.sp]; dest.hold.push(e); }
        e.u += x.u; dest.meDirty = true; dest.dirty = true;
      }
      this.xfers = keep;
    }
    for (const p of this.players.values()) if (p.meDirty) { p.dirty = true; }
  }
  // is a world point inside this ship's cargo field on side sd (-1 left — both fields now, owner 2026-10-18; 1 right)? The ship's frame:
  // along = toward the nose, side = to starboard; the field a rectangle from the hull's side out to depth
  inTractor(p, S, x, y, sd) {
    const T = S.tractor, L = S.len, fx = Math.sin(p.h), fy = -Math.cos(p.h), dx = x - p.x, dy = y - p.y;
    const along = (dx * fx + dy * fy) / L + (S.pivot ?? 0.5), side = sd * (dy * fx - dx * fy) / L - (S.hw || 0.2);
    return side >= 0 && side <= T.depth && along >= T.span[0] && along <= T.span[1];
  }
  fieldMid(p, S, sd) {                         // the middle of a side's field, in the world
    const T = S.tractor, L = S.len, fx = Math.sin(p.h), fy = -Math.cos(p.h), al = ((T.span[0] + T.span[1]) / 2 - (S.pivot ?? 0.5)) * L, sdist = sd * ((S.hw || 0.2) + T.depth / 2) * L;
    return [p.x + fx * al - fy * sdist, p.y + fy * al + fx * sdist];
  }
  // where a deposit goes: a station beam the deposit field touches (into storage), else a ship whose withdraw field
  // overlaps mine and has room (counting what's already on its way)
  depositTarget(p, S, u) {
    const B = R.STATION_BEAMS, [sx, sy] = W.station;   // a station deposit field: any of a grid of its points inside my deposit field, or my field's middle inside it
    if (hyp(p.x - sx, p.y - sy) < B.r1 + S.len * 2) {
      const [fx, fy] = this.fieldMid(p, S, -1);
      for (let k = 0; k < B.n; k++) {
        const a = (B.a0 + k * 360 / B.n) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
        const ra = (fx - sx) * ux + (fy - sy) * uy, rb = (fx - sx) * vx + (fy - sy) * vy;
        if (ra >= B.r0 && ra <= B.r1 && Math.abs(rb) <= B.w / 2) return { id: "st", x: sx + ux * ra, y: sy + uy * ra, px: sx + ux * B.r0, py: sy + uy * B.r0 };
        for (let r = B.r0; r <= B.r1; r += 10) for (const o of [-B.w / 2, 0, B.w / 2]) {
          const x = sx + ux * r + vx * o, y = sy + uy * r + vy * o; if (this.inTractor(p, S, x, y, -1)) return { id: "st", x: sx + ux * r, y: sy + uy * r, px: sx + ux * B.r0, py: sy + uy * B.r0 };
        }
      }
    }
    const [mx, my] = this.fieldMid(p, S, -1);
    for (const q of this.players.values()) {
      if (q === p || q.cargo !== 2 || q.docked) continue; const Q = this.shipOf(q); if (!Q.tractor || hyp(q.x - p.x, q.y - p.y) > (S.len + Q.len) * 1.5) continue;
      const [qx, qy] = this.fieldMid(q, Q, -1);
      if (!this.inTractor(q, Q, mx, my, -1) && !this.inTractor(p, S, qx, qy, -1)) continue;
      const coming = this.xfers.reduce((a, x) => a + (x.to === q.id ? x.u : 0), 0);
      if (this.usedSpace(q) + coming + u > Q.hold) continue;
      return { id: q.id, x: qx, y: qy };
    }
    return null;
  }
  // a bit leaves the chunk at the beam's tip and rides a wave back to the ship: in the hold when it arrives
  sendBit(p, ore, u, x, y, dist, t) {
    const dur = Math.max(0.15, (dist + (this.shipOf(p).muzzle || 0)) / (R.LASER.bitSpeed || 140));
    this.bits.push({ pid: p.id, ore, u, x, y, due: t + dur * 1000 });
    this.fx.push({ k: "bit", i: p.id, x: Math.round(x), y: Math.round(y), ore: ORE_KEYS.indexOf(ore), ts: t, dur: Math.round(dur * 1000) });
  }

  // a broken chunk (its ore bits already sent down the beam)
  breakChunk(rock, c) {
    if (c.broken) return;
    c.broken = true; rock.v++; rock.nBroken++;
    const mid = (c.r0 + c.r1) / 2, ang = c.a0 + normA(c.a1 - c.a0) / 2;
    this.fx.push({ k: "crack", x: rock.x + Math.cos(ang) * mid, y: rock.y + Math.sin(ang) * mid, rx: rock.x, ry: rock.y, u: 0, ore: 0 });
    rock.touched = now(); rock.home = false;
  }
  boostOf(p, t) { return p.boostUntil > t ? R.BOOST.mult || 1.6 : 1; }
  heatCore(rock, k) { rock.core.heat = Math.min(1, (rock.core.heat || 0) + k); this.hotRocks.add(rock); }
  // (owner, 2026-10-18) an overheated core: the asteroid shatters — its corium and its unmined chunks are lost
  overheat(rock) {
    rock.core.popped = true;
    this.fx.push({ k: "pop", x: rock.x, y: rock.y, r: rock.r, hot: 1 });
    this.dropRock(rock, R.ROCK.respawn); this.hotRocks.delete(rock);
  }
  hitCore(rock, dmg) {
    rock.core.hp -= dmg;
    rock.touched = now(); rock.home = false;
    if (rock.core.hp <= 0 && !rock.core.popped) this.popCore(rock);
  }
  // the piñata: the core's corium bursts out around the rock as drops, free for anyone; the rest of the rock shatters
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
      await pool.query(`INSERT INTO ring_drops (id, x, y, ore, units, created_at) VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0)) ON CONFLICT (id) DO UPDATE SET units = $5, x = $2, y = $3`,
        [d.id, d.x, d.y, d.ore, d.units, d.born]).catch((e) => console.error("ring drop", e));
      await pool.query(`SELECT setval(pg_get_serial_sequence('ring_drops','id'), GREATEST($1, (SELECT COALESCE(MAX(id),1) FROM ring_drops)))`, [this.dropSeq]).catch(() => {});
    } else await pool.query(`UPDATE ring_drops SET units = $2, x = $3, y = $4 WHERE id = $1`, [d.id, d.units, d.x, d.y]).catch((e) => console.error("ring drop", e));
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
  // credit any pilot's station storage, online or not (offline: queued straight into their saved row)
  storageAddAny(pid, ores, note) {
    if (this.players.has(pid)) return this.storageAdd(pid, ores, note);
    const prev = this.offline.get(pid) || Promise.resolve();
    const next = prev.then(async () => {
      const { rows } = await pool.query(`SELECT storage FROM ring_players WHERE user_id = $1`, [pid]); if (!rows[0]) return;
      const st = rows[0].storage && typeof rows[0].storage === "object" ? rows[0].storage : {};
      for (const [o, u] of Object.entries(ores)) if (u > 0 && R.ORES[o]) st[o] = Math.round((+st[o] || 0) + u);
      await pool.query(`UPDATE ring_players SET storage = $2 WHERE user_id = $1`, [pid, JSON.stringify(st)]);
    }).catch((e) => console.error("offline storage", e));
    this.offline.set(pid, next);
  }
  deliver(p) {
    this.deliverEntries(p, p.hold, false);
    p.hold = []; p.meDirty = true; p.dirty = true;
    this.fx.push({ k: "deliver", x: p.x, y: p.y, i: p.id });
  }
  // hold entries into station storage: plain ore to the deliverer, party ore split among its can's members (quiet: no
  // notes — the deposit beams stream it in lump by lump)
  deliverEntries(p, entries, quiet) {
    const ores = {}, split = new Map();
    for (const e of entries) {
      if (e.sp) { const k = e.sp.join(","); if (!split.has(k)) split.set(k, { ids: e.sp, ores: {} }); const so = split.get(k).ores; so[e.o] = (so[e.o] || 0) + e.u; continue; }
      ores[e.o] = (ores[e.o] || 0) + e.u;
    }
    // (owner, 2026-10-18) party ore: split evenly among everyone who was in the party when its can was made (remainders a
    // unit at a time, from a random member)
    for (const { ids, ores: so } of split.values()) {
      const shares = ids.map(() => ({})), n = ids.length;
      for (const [o, u] of Object.entries(so)) { const per = Math.floor(u / n), start = Math.floor(Math.random() * n);
        for (let k = 0; k < n; k++) shares[k][o] = per + (((k - start + n) % n) < u - per * n ? 1 : 0); }
      ids.forEach((id, k) => this.storageAddAny(id, shares[k], quiet ? null : "Party share:"));
      if (!quiet && !ids.includes(p.id)) this.msgs.push({ to: p.id, m: { t: "note", text: "Delivered " + this.sumText(so) + " to a party (" + n + " ways)." } });
    }
    if (Object.keys(ores).length) this.storageAddAny(p.id, ores, quiet ? null : "Delivered");
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
    } else if (m.op === "jetcan") this.sendJetcan(p, m.replace === true);
    else if (["invite", "inviteReply", "kick", "leave"].includes(m.op)) this.partyAct(p, m);
    else if (m.op === "refine") { if (this.shipOf(p).refineRate) p.refining = !p.refining; }   // (owner, 2026-10-18) the Hauler's R
    else if (m.op === "respawn") { this.respawn(p.id); p.cargo = 0; }   // (owner, 2026-10-18) Settings → respawn at the station (the hold stays aboard)
    else if (m.op === "cargo" || m.op === "tractor") {   // (owner, 2026-10-18) F cycles the field: the Miner opens on deposit (output) first, the Hauler on withdraw (intake)
      const S0 = this.shipOf(p); if (!S0.tractor) return;
      const order = S0.cargoFirst === "in" ? [0, 2, 1] : [0, 1, 2], i = order.indexOf(p.cargo || 0);
      p.cargo = order[(i + 1) % 3];
    }
    else if (m.op === "drop") {              // jettison the hold as drops where I sit
      if (p.docked || !p.hold.some((e) => !e.sp)) return;
      for (const e of p.hold) if (!e.sp) this.spawnDrops(e.o, e.u, p.x, p.y, 60);
      p.hold = p.hold.filter((e) => e.sp); p.dirty = true;   // (party ore can't be dropped)
    }
    p.meDirty = true;
  }
  station(id, m) {                             // docked only: board another ship (one kind for now)
    const p = this.players.get(String(id)); if (!p || !p.docked || !m || typeof m.op !== "string") return false;
    if (m.op === "ship") {
      if (!SHIPS[m.k] || p.ship === m.k || p.hold.length) return false;
      p.ship = m.k; p.cargo = 0; p.refining = false;
    } else return false;
    p.meDirty = true; p.dirty = true; return true;
  }

  async _save(p) {
    await this.ready;
    await pool.query(`UPDATE ring_players SET x = $2, y = $3, h = $4, module = $5, hold = $6, storage = $7, updated_at = now() WHERE user_id = $1`,
      [p.id, p.x, p.y, p.h, p.ship, JSON.stringify(p.hold), JSON.stringify(p.storage || {})]);
    p.dirty = false;
  }
  async heartbeat() { await pool.query(`INSERT INTO ring_meta (k, v) VALUES ('alive', $1) ON CONFLICT (k) DO UPDATE SET v = $1`, [JSON.stringify(Date.now())]); }
  // everything unsaved, now (the shutdown on a deploy calls this, so the last seconds of loot and cans aren't lost)
  async flush() { await this.ready; await this.saveDirty(); await this.heartbeat(); }
  async saveDirty() {
    this.heartbeat().catch(() => {});
    for (const p of this.players.values()) if (p.dirty) await this._save(p);
    for (const d of [...this.drops.values()]) if (d.dirty) { d.dirty = false; await this.saveDrop(d); }
    for (const c of [...this.cans.values()]) if (c.dirty) { c.dirty = false; await this.saveCan(c); }
  }

  // ---- what each player is sent ----
  // ships in vision: [id, x dm, y dm, h mrad, ship idx, flags (1 beam on, 2 firing, 8 docked), aim mrad, beam length, hold %]
  shipRowCache() {
    const out = [];
    for (const p of this.players.values()) {
      const S = this.shipOf(p);
      out.push({ p, key: "", row: [p.id, Math.round(p.x * 10), Math.round(p.y * 10), Math.round(p.h * 1000), R.SHIP_KINDS.indexOf(p.ship),
        (p.laserOn ? 1 : 0) | (p.firing && !p.docked ? 2 : 0) | (p.docked ? 8 : 0) | (p.cargo === 1 && !p.docked ? 128 : 0) | (p.cargo === 2 && !p.docked ? 256 : 0) | (p.boostUntil > now() ? 32 : 0) | (p.alt ? 64 : 0) | (p.refining && !p.docked ? 512 : 0),
        Math.round(p.aim * 1000), Math.round(p.laserLen), Math.round(this.usedSpace(p) / S.hold * 100), p.beamTgt || 0] });
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
        Math.round(Math.min(1, r.nBroken / Math.max(1, r.chunks.length)) * 100),   // fill: how much masonry is gone (the core swells with it)
        Math.round((r.core.heat || 0) * 100), r.chunks.filter((c) => c.heat > 0.03 && !c.broken).map((c) => [c.i, Math.round(c.heat * 100)])]);   // core heat %, the warm chunks [i, heat %]
    }
    return out;
  }
  // a chunk: [i, r0, r1, a0 mrad, a1 mrad, broken 0/1, density, ore idx | -1, crack stage] — all visible. With geo
  // (first sight per socket): g = each chunk's exact polygon as [i, nO, x0, y0, x1, y1, ...] — the hitbox clients draw.
  rockDetail(r, geo) {
    const m = { t: "rockd", id: r.id, v: r.v, coreR: r.core.r0, c: r.chunks.map((c) => [c.i, Math.round(c.r0 * 10) / 10, Math.round(c.r1 * 10) / 10, Math.round(normA(c.a0) * 1000), Math.round(normA(c.a1) * 1000),
      c.broken ? 1 : 0, c.scanned ? c.d : -1, c.scanned && c.ore ? ORE_KEYS.indexOf(c.ore) : -1, c.broken ? 0 : this.dmgStage(c), c.scanned ? c.n || 0 : 0, c.hit ? 1 : 0]) };   // (owner, 2026-10-18) density and bits only once scanned
    if (geo) m.g = r.chunks.map((c) => [c.i, c.poly.nO, ...c.poly.pts.flat()]);
    return m;
  }
  dropRows(viewer) {                           // [id, x, y, ore idx, units, gone at (server ms)]
    const out = [], V = this.visionOf(viewer);
    for (const d of this.drops.values()) {
      if (hyp(d.x - viewer.x, d.y - viewer.y) > V) continue;
      out.push([d.id, Math.round(d.x), Math.round(d.y), ORE_KEYS.indexOf(d.ore), d.units, d.born + R.DROPS.linger * 1000]);
    }
    return out;
  }
  canRows(viewer) {                            // jetcans: [id, x, y, h mrad, kind (0 base, 1 party, 2 public), units, mine 0/1, can haul 0/1]
    const out = [], V = this.visionOf(viewer);
    for (const c of this.cans.values()) {
      if (hyp(c.x - viewer.x, c.y - viewer.y) > V) continue;
      out.push([c.id, Math.round(c.x), Math.round(c.y), Math.round(c.h * 1000), this.canKind(c), this.canUnits(c), c.owner === viewer.id ? 1 : 0, this.canHaul(viewer, c) ? 1 : 0]);
    }
    return out;
  }
  meMsg(p) {
    const S = this.shipOf(p);
    return { t: "me", cap: S.hold, hold: p.hold.map((e) => ({ o: e.o, u: e.u, raw: e.raw ? 1 : 0, pt: e.sp ? 1 : 0 })), docked: p.docked ? 1 : 0,
      ship: p.ship, zone: p.zone, storage: Object.fromEntries(Object.entries(p.storage).map(([o, u]) => [o, Math.round(u)])),
      mark: p.mark ? [p.mark.x, p.mark.y] : 0, cargo: p.cargo || 0, refining: p.refining ? 1 : 0 };
  }
  roster() { return [...this.players.values()].map((p) => ({ i: p.id, n: p.name })); }
}
