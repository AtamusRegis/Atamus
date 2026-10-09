// Ores and rock fields: scattered home rocks (with clusters at the asteroid beacons) and asteroid instance fields.
import { CELL_APOTHEM_KM as APO } from "./constants.js";
import { STATION_POS, STARGATE_CELLS } from "./geometry.js";

// Five ores, one per rarity tier. `rock` = sprite family in assets/rocks/; `price` = credits per unit.
export const ORES = [
  { key: "ironstone", name: "Ironstone", desc: "Dull grey ore, the backbone of hull plating. Found in every belt.", rarity: "common",    tier: 0, color: "#8d8378", unitM3: 0.1, price: 5, rock: "cratered"  },
  { key: "cuprite",   name: "Cuprite",   desc: "Reddish copper ore used in wiring and capacitor coils.", rarity: "uncommon",  tier: 1, color: "#c27a46", unitM3: 0.15, price: 12, rock: "elongated" },
  { key: "cobaltine", name: "Cobaltine", desc: "Blue-veined ore prized for shield emitters and alloys.", rarity: "rare",      tier: 2, color: "#4f78c8", unitM3: 0.3, price: 30, rock: "fractured" },
  { key: "iridite",   name: "Iridite",   desc: "Pale crystalline ore; the core of warp drive lattices.", rarity: "very rare", tier: 3, color: "#b9a8d6", unitM3: 0.6, price: 80, rock: "bubble"    },
  { key: "starglass", name: "Starglass", desc: "Glassy, faintly luminous ore found only in dying belts.", rarity: "legendary", tier: 4, color: "#bfeeff", unitM3: 1.2, price: 220, rock: "layered"   },
];
// rarity roll for an instance's primary ore
const RARITY_W = [50, 28, 14, 6, 2];

// Rock fields (owner): no more belts. A home system has rocks scattered across it, plus small clusters around
// its asteroid beacons (beacons stay hotspots); they respawn slowly. Asteroid instances are small shared hexes
// with one rich field that loses ore passively, so an instance always ends.
export const FIELD = {
  homeScatter: 24, homePerBeacon: 7, homeSpawnPerMin: 2,
  homeOreW: [72, 22, 5, 1, 0], beaconOreW: [45, 30, 16, 7, 2],
  instRocksMin: 70, instRocksMax: 120, instOreMinM3: 250_000, instOreMaxM3: 600_000,
};
const SIZE_W = [{ m: 200, w: 60, m3: [800, 1600] }, { m: 500, w: 32, m3: [4000, 8000] }, { m: 1000, w: 8, m3: [15000, 30000] }];

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seedOf(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const NORMALS = [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 2 + k * Math.PI / 3; return [Math.cos(a), Math.sin(a)]; });
export const insideHex = (x, y, apo, margin) => NORMALS.every(([nx, ny]) => x * nx + y * ny <= apo - margin);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const pickW = (rnd, ws) => { let r = rnd() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return i; } return 0; };

/** A player's asteroid beacons: 2 or 3, at fixed spots in their home hex (deterministic per player). */
export function placeBeacons(ownerId) {
  const rnd = mulberry32(seedOf("beacons:" + ownerId)), n = rnd() < 0.5 ? 2 : 3, out = [];
  const avoid = [{ x: STATION_POS.x, y: STATION_POS.y, r: 25 }, { x: 0, y: 0, r: 25 }, ...STARGATE_CELLS.map((g) => ({ x: g.x, y: g.y, r: 20 }))];
  let sep = 50;
  for (let tries = 0; out.length < n && tries < 5000; tries++) {
    if (tries && tries % 1000 === 0) sep -= 8;
    const x = (rnd() * 2 - 1) * APO, y = (rnd() * 2 - 1) * APO;
    if (!insideHex(x, y, APO, 15) || avoid.some((a) => dist(x, y, a.x, a.y) < a.r) || out.some((b) => dist(x, y, b.x, b.y) < sep)) continue;
    out.push({ id: ownerId + ":b" + out.length, x: +x.toFixed(2), y: +y.toFixed(2) });
  }
  return out;
}

function newRock(f, x, y, oreTier, sizeIdx, m3) {
  const sz = SIZE_W[sizeIdx], o = ORES[oreTier], vol = m3 != null ? m3 : Math.round(sz.m3[0] + Math.random() * (sz.m3[1] - sz.m3[0]));
  return { id: f.sys + "#" + (f.nextId++), x: +x.toFixed(3), y: +y.toFixed(3), r: sz.m / 2000, size: sz.m, ore: o.key, m3: vol, m0: vol, rot: +(Math.random() * Math.PI * 2).toFixed(3) };
}
const clear = (f, x, y, r) => !f.rocks.some((o) => dist(x, y, o.x, o.y) < o.r + r + 0.08);

// one home rock: scattered (near = null) or around a beacon
function spawnHomeRock(f, near) {
  const sizeIdx = pickW(Math.random, SIZE_W.map((s) => s.w)), r = SIZE_W[sizeIdx].m / 2000;
  for (let t = 0; t < 60; t++) {
    let x, y;
    if (near) { const a = Math.random() * Math.PI * 2, d = 2.5 + Math.random() * 5; x = near.x + Math.cos(a) * d; y = near.y + Math.sin(a) * d; }
    else { x = (Math.random() * 2 - 1) * APO; y = (Math.random() * 2 - 1) * APO; }
    if (!insideHex(x, y, APO, r + 1)) continue;
    if (dist(x, y, STATION_POS.x, STATION_POS.y) < 8 || dist(x, y, 0, 0) < 15 || STARGATE_CELLS.some((g) => dist(x, y, g.x, g.y) < 6)) continue;
    if (f.beacons.some((b) => dist(x, y, b.x, b.y) < 2)) continue;
    if (!clear(f, x, y, r)) continue;
    const rock = newRock(f, x, y, pickW(Math.random, near ? FIELD.beaconOreW : FIELD.homeOreW), sizeIdx);
    if (near) rock.near = near.id;
    f.rocks.push(rock); return true;
  }
  return false;
}
// top a home field up: scattered rocks and each beacon's cluster, at most `max` new rocks
function topUp(f, max) {
  let n = 0;
  for (const b of f.beacons) while (n < max && f.rocks.filter((r) => r.near === b.id).length < FIELD.homePerBeacon && spawnHomeRock(f, b)) n++;
  while (n < max && f.rocks.filter((r) => !r.near).length < FIELD.homeScatter && spawnHomeRock(f, null)) n++;
  if (n) f.ver++;
  return n;
}
/** A home system's rock field, filled up. */
export function createHomeField(sys, beacons, now = Date.now()) {
  const f = { sys, kind: "home", nextId: 0, ver: 1, rocks: [], beacons: beacons.map((b) => ({ id: b.id, x: b.x, y: b.y })), nextSpawn: now + 60000 };
  topUp(f, Infinity); return f;
}
/** Once a minute a home field regrows a couple of rocks. True if it changed. */
export function tickHomeField(f, now = Date.now()) {
  if (now < f.nextSpawn) return false;
  f.nextSpawn = now + 60000;
  return topUp(f, FIELD.homeSpawnPerMin) > 0;
}
/** PTR: fill a home field up at once. */
export function fillHomeField(f) { topUp(f, Infinity); }

/** An asteroid instance's field: one rich cluster, primary ore by rarity, beside the instance's beacon. */
export function createInstField(sys, apo, beaconPos) {
  const rnd = Math.random, tier = pickW(rnd, RARITY_W);
  const lower = ORES.filter((o) => o.tier < tier), types = [ORES[tier]];
  while (types.length < 3 && lower.length) types.push(lower.splice(Math.floor(rnd() * lower.length), 1)[0]);
  if (types.length < 2) types.push(ORES[Math.min(4, tier + 1)]);
  const shares = types.map((_, i) => (i === 0 ? 1 : 0.3 + rnd() * 0.3));
  const f = { sys, kind: "inst", nextId: 0, ver: 1, rocks: [], beacons: [], tier, color: ORES[tier].color };
  const n = Math.round(FIELD.instRocksMin + rnd() * (FIELD.instRocksMax - FIELD.instRocksMin)), total = FIELD.instOreMinM3 + rnd() * (FIELD.instOreMaxM3 - FIELD.instOreMinM3);
  const raw = [];
  for (let i = 0; i < n; i++) { const s = pickW(rnd, SIZE_W.map((q) => q.w)); raw.push({ s, ti: pickW(rnd, shares), w: [1, 6, 25][s] * (0.7 + rnd() * 0.6) }); }
  const sum = raw.reduce((a, q) => a + q.w, 0), cx = beaconPos.x + 18, cy = beaconPos.y;
  for (const q of raw) {
    const r = SIZE_W[q.s].m / 2000;
    for (let t = 0; t < 80; t++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 14, x = cx + Math.cos(a) * d * 1.1, y = cy + Math.sin(a) * d;
      if (!insideHex(x, y, apo, r + 1) || dist(x, y, beaconPos.x, beaconPos.y) < 4 || !clear(f, x, y, r)) continue;
      const types2 = types[q.ti]; f.rocks.push(newRock(f, x, y, types2.tier, q.s, Math.max(100, Math.round(q.w / sum * total)))); break;
    }
  }
  return f;
}
/** Passive ore loss (instances): every rock loses its starting ore over `hours`. Returns the rocks touched. */
export function decayField(f, dtMs, hours) {
  const k = dtMs / (hours * 3600e3), touched = [];
  for (const r of f.rocks) { r.m3 = Math.max(0, +(r.m3 - (r.m0 || r.m3) * k).toFixed(3)); touched.push(r); }
  return touched;
}
