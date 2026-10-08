// Asteroid belts: five belt "slots" per system (deterministic beacon positions per
// owner). Belts spawn into slots uncommonly and drift away after a while, so
// usually only 1-2 are present; each belt rolls a rarity that sets its primary ore.
import { CELL_APOTHEM_KM as APO } from "./constants.js";
import { STATION_POS, STARGATE_CELLS } from "./geometry.js";

// Five ores, one per rarity tier. `rock` = sprite family in assets/rocks/; `price` = credits per unit.
export const ORES = [
  { key: "ironstone", name: "Ironstone", rarity: "common",    tier: 0, color: "#8d8378", unitM3: 0.1, price: 5, rock: "cratered"  },
  { key: "cuprite",   name: "Cuprite",   rarity: "uncommon",  tier: 1, color: "#c27a46", unitM3: 0.15, price: 12, rock: "elongated" },
  { key: "cobaltine", name: "Cobaltine", rarity: "rare",      tier: 2, color: "#4f78c8", unitM3: 0.3, price: 30, rock: "fractured" },
  { key: "iridite",   name: "Iridite",   rarity: "very rare", tier: 3, color: "#b9a8d6", unitM3: 0.6, price: 80, rock: "bubble"    },
  { key: "starglass", name: "Starglass", rarity: "legendary", tier: 4, color: "#bfeeff", unitM3: 1.2, price: 220, rock: "layered"   },
];
// belt rarity roll (which ore is the belt's primary)
const RARITY_W = [50, 28, 14, 6, 2];

export const BELT = {
  slots: 5,
  arcRadiusKm: 15,              // crescent line distance from the beacon
  bandMinKm: 0, bandMaxKm: 2.5, // rocks sit this far off the line (either side)
  rocksMin: 75, rocksMax: 150,
  oreMinM3: 400_000, oreMaxM3: 900_000,
  // spawning: uncommon, so typically 1-2 belts are up at once (can be all 5 by chance)
  initialChance: 0.35,          // chance each slot starts populated (at least one always does)
  spawnChancePerMin: 0.006,     // empty slot -> new belt, rolled once a minute
  lifeMinMin: 60, lifeMaxMin: 120, // a belt drifts away after this long
};

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seedOf(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const NORMALS = [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 2 + k * Math.PI / 3; return [Math.cos(a), Math.sin(a)]; });
const insideHex = (x, y, margin) => NORMALS.every(([nx, ny]) => x * nx + y * ny <= APO - margin);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const SIZES = [{ m: 200, w: 55, vol: 1 }, { m: 500, w: 32, vol: 6 }, { m: 1000, w: 13, vol: 25 }];

function placeSlots(rnd) {
  const pick = (a, b) => a + rnd() * (b - a);
  const reach = BELT.arcRadiusKm + BELT.bandMaxKm + 1;
  const avoid = [{ x: STATION_POS.x, y: STATION_POS.y, r: 30 }, { x: 0, y: 0, r: 22 }, ...STARGATE_CELLS.map((g) => ({ x: g.x, y: g.y, r: 25 }))];
  const slots = []; let sep = 48;
  for (let tries = 0; slots.length < BELT.slots && tries < 4000; tries++) {
    if (tries && tries % 800 === 0) sep -= 5;
    const x = pick(-APO, APO), y = pick(-APO, APO);
    if (!insideHex(x, y, reach)) continue;
    if (avoid.some((a) => dist(x, y, a.x, a.y) < a.r)) continue;
    if (slots.some((b) => dist(x, y, b.x, b.y) < sep)) continue;
    slots.push({ idx: slots.length, x: +x.toFixed(2), y: +y.toFixed(2), facing: +(Math.atan2(y, x) + pick(-0.4, 0.4)).toFixed(3), belt: null });
  }
  return slots;
}

export function fieldRnd(field) { return mulberry32((field.seed ^ Math.imul(++field.step, 0x9E3779B1)) >>> 0)(); }

function rollRarity(rnd) { let r = rnd() * RARITY_W.reduce((s, v) => s + v, 0); for (let i = 0; i < RARITY_W.length; i++) { r -= RARITY_W[i]; if (r <= 0) return i; } return 0; }

function makeBelt(slot, seed, now) {
  const rnd = mulberry32(seed); const pick = (a, b) => a + rnd() * (b - a);
  const tier = rollRarity(rnd);
  // primary ore = the belt's rarity; 1-2 extra ores from lower tiers
  const primary = ORES[tier];
  const lower = ORES.filter((o) => o.tier < tier);
  const extras = []; const nExtra = Math.min(lower.length, rnd() < 0.5 ? 1 : 2);
  while (extras.length < nExtra && lower.length) extras.push(lower.splice(Math.floor(rnd() * lower.length), 1)[0]);
  const types = [primary, ...extras].slice(0, 3);
  if (types.length < 2) { const alt = ORES.find((o) => o.tier === tier + 1) || ORES[0]; if (alt !== primary) types.push(alt); }
  const shares = types.map((_, i) => (i === 0 ? 1 : 0.3 + rnd() * 0.3)); const sh = shares.reduce((s, v) => s + v, 0);
  const totalM3 = Math.round(pick(BELT.oreMinM3, BELT.oreMaxM3));
  const n = Math.round(pick(BELT.rocksMin, BELT.rocksMax));

  const raw = [];
  for (let i = 0; i < n; i++) {
    let r = rnd() * sh, ti = 0; for (let k = 0; k < shares.length; k++) { r -= shares[k]; if (r <= 0) { ti = k; break; } }
    let w = rnd() * 100, sz = SIZES[0]; for (const c of SIZES) { w -= c.w; if (w <= 0) { sz = c; break; } }
    raw.push({ ti, size: sz.m, m3: sz.vol * pick(0.7, 1.3) });
  }
  const rawSum = raw.reduce((s, q) => s + q.m3, 0);
  const rocks = [];
  for (let i = 0; i < n; i++) {
    const q = raw[i], m3 = Math.round((q.m3 / rawSum) * totalM3), rad = q.size / 2000;
    for (let t = 0; t < 60; t++) {
      const a = slot.facing + pick(-Math.PI / 2, Math.PI / 2);
      const off = pick(BELT.bandMinKm, BELT.bandMaxKm) * (rnd() < 0.5 ? -1 : 1);
      const d = BELT.arcRadiusKm + off;
      const x = slot.x + Math.cos(a) * d, y = slot.y + Math.sin(a) * d;
      if (!insideHex(x, y, rad + 0.5)) continue;
      if (rocks.some((o) => dist(x, y, o.x, o.y) < o.r + rad + 0.06)) continue;
      rocks.push({ id: `${slot.idx}:${i}`, x: +x.toFixed(3), y: +y.toFixed(3), r: rad, size: q.size, ore: types[q.ti].key, m3, rot: +(rnd() * Math.PI * 2).toFixed(3) });
      break;
    }
  }
  return {
    id: `belt:${slot.idx}:${seed}`, slot: slot.idx, x: slot.x, y: slot.y, facing: slot.facing,
    rarity: primary.rarity, tier, color: primary.color,
    ores: types.map((t) => ({ key: t.key, name: t.name, rarity: t.rarity, m3: rocks.filter((r) => r.ore === t.key).reduce((s, r) => s + r.m3, 0) })),
    totalM3: rocks.reduce((s, r) => s + r.m3, 0), rocks,
    spawnedAt: now, expiresAt: now + Math.round(pick(BELT.lifeMinMin, BELT.lifeMaxMin) * 60000),
  };
}

/** Create a system's belt field: fixed slots + an initial roll of which are populated. */
export function createBeltField(ownerId, now = Date.now()) {
  const slots = placeSlots(mulberry32(seedOf("belts:" + ownerId)));
  // plain data only (it is persisted): the spawn RNG is seed + step counter
  const field = { slots, seed: seedOf("spawn:" + ownerId + ":" + now), step: 0, nextRoll: now + 60000 };
  const rnd = () => fieldRnd(field);
  for (const s of slots) if (rnd() < BELT.initialChance) s.belt = makeBelt(s, Math.floor(rnd() * 1e9), now);
  if (!slots.some((s) => s.belt) && slots.length) { const s = slots[Math.floor(rnd() * slots.length)]; s.belt = makeBelt(s, Math.floor(rnd() * 1e9), now); }
  return field;
}

/** Once a minute: expire old belts, maybe spawn into empty slots. Returns true if anything changed. */
export function tickBeltField(field, now = Date.now()) {
  let changed = false, guard = 0;
  while (now >= field.nextRoll && guard++ < 2000) {       // catches up missed minutes (e.g. after being offline)
    const at = field.nextRoll; field.nextRoll += 60000;
    for (const s of field.slots) {
      if (s.belt && at >= s.belt.expiresAt) { s.belt = null; changed = true; }
      if (!s.belt && fieldRnd(field) < BELT.spawnChancePerMin) { s.belt = makeBelt(s, Math.floor(fieldRnd(field) * 1e9), at); changed = true; }
    }
  }
  return changed;
}

export const fieldBelts = (field) => field.slots.filter((s) => s.belt).map((s) => s.belt);
