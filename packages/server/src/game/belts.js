// Asteroid belts: generated deterministically per system (seeded by the owner id),
// so a pilot's home belts are the same every login. Static data — sent once in "hello".
import { CELL_APOTHEM_KM as APO } from "./constants.js";
import { STATION_POS, STARGATE_CELLS } from "./geometry.js";

// Five ores, one per rarity tier. Weight = chance a belt carries it.
export const ORES = [
  { key: "ironstone", name: "Ironstone", rarity: "common",    weight: 60, color: "#8d8378" },
  { key: "cuprite",   name: "Cuprite",   rarity: "uncommon",  weight: 25, color: "#c27a46" },
  { key: "cobaltine", name: "Cobaltine", rarity: "rare",      weight: 10, color: "#4f78c8" },
  { key: "iridite",   name: "Iridite",   rarity: "very rare", weight: 4,  color: "#b9a8d6" },
  { key: "starglass", name: "Starglass", rarity: "legendary", weight: 1,  color: "#bfeeff" },
];

export const BELT = {
  count: 5,
  arcRadiusKm: 30,        // crescent line distance from the beacon
  bandMinKm: 2.5, bandMaxKm: 5, // rocks sit this far off the line (either side)
  rocksMin: 75, rocksMax: 150,
  oreMinM3: 400_000, oreMaxM3: 900_000,
};

// small seeded PRNG
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seedOf(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

const NORMALS = [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 2 + k * Math.PI / 3; return [Math.cos(a), Math.sin(a)]; });
const insideHex = (x, y, margin) => NORMALS.every(([nx, ny]) => x * nx + y * ny <= APO - margin);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// rock radius (km) from its ore volume: bigger rocks hold more, with a nice spread
const rockRadiusKm = (m3) => Math.min(0.42, Math.max(0.03, 0.03 * Math.cbrt(m3 / 500)));

export function generateBelts(ownerId) {
  const rnd = mulberry32(seedOf("belts:" + ownerId));
  const pick = (a, b) => a + rnd() * (b - a);
  const reach = BELT.arcRadiusKm + BELT.bandMaxKm + 1;

  // --- place beacons ---
  const beacons = [];
  const avoid = [{ x: STATION_POS.x, y: STATION_POS.y, r: 45 }, { x: 0, y: 0, r: 25 }, ...STARGATE_CELLS.map((g) => ({ x: g.x, y: g.y, r: 40 }))];
  let sep = 68;
  for (let tries = 0; beacons.length < BELT.count && tries < 4000; tries++) {
    if (tries && tries % 800 === 0) sep -= 6;                     // relax if the hex is crowded
    const x = pick(-APO, APO), y = pick(-APO, APO);
    if (!insideHex(x, y, reach)) continue;
    if (avoid.some((a) => dist(x, y, a.x, a.y) < a.r)) continue;
    if (beacons.some((b) => dist(x, y, b.x, b.y) < sep)) continue;
    beacons.push({ x, y });
  }

  const belts = [];
  beacons.forEach((b, bi) => {
    // crescent faces away from the sun (slightly jittered)
    const facing = Math.atan2(b.y, b.x) + pick(-0.4, 0.4);
    // 2–3 ore types, weighted by rarity; primary ore gets the biggest share
    const nTypes = rnd() < 0.5 ? 2 : 3;
    const pool = ORES.slice(); const types = [];
    while (types.length < nTypes && pool.length) {
      const total = pool.reduce((s, o) => s + o.weight, 0); let r = rnd() * total;
      for (let i = 0; i < pool.length; i++) { r -= pool[i].weight; if (r <= 0) { types.push(pool.splice(i, 1)[0]); break; } }
    }
    const shares = types.map((_, i) => (i === 0 ? 1 : 0.35 + rnd() * 0.3)); const sh = shares.reduce((s, v) => s + v, 0);
    const totalM3 = Math.round(pick(BELT.oreMinM3, BELT.oreMaxM3));
    const n = Math.round(pick(BELT.rocksMin, BELT.rocksMax));

    // --- rocks along a half-circle, 30 km out, offset 2.5–5 km off the line, non-overlapping ---
    const rocks = [];
    let raw = [];
    for (let i = 0; i < n; i++) {
      // ore type by share, volume lognormal-ish for size variety
      let r = rnd() * sh, ti = 0; for (let k = 0; k < shares.length; k++) { r -= shares[k]; if (r <= 0) { ti = k; break; } }
      const m3 = Math.exp(pick(0, 2.6));                           // 1..~13.5 relative units
      raw.push({ ti, m3 });
    }
    const rawSum = raw.reduce((s, q) => s + q.m3, 0);
    for (let i = 0; i < n; i++) {
      const q = raw[i];
      const m3 = Math.round((q.m3 / rawSum) * totalM3);
      const rad = rockRadiusKm(m3);
      let placed = false;
      for (let t = 0; t < 60 && !placed; t++) {
        const a = facing + pick(-Math.PI / 2, Math.PI / 2);
        const off = pick(BELT.bandMinKm, BELT.bandMaxKm) * (rnd() < 0.5 ? -1 : 1);
        const d = BELT.arcRadiusKm + off;
        const x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d;
        if (!insideHex(x, y, rad + 0.5)) continue;
        if (rocks.some((o) => dist(x, y, o.x, o.y) < o.r + rad + 0.06)) continue;
        rocks.push({ id: `${bi}:${i}`, x: +x.toFixed(3), y: +y.toFixed(3), r: +rad.toFixed(3), ore: types[q.ti].key, m3, seed: Math.floor(rnd() * 1e6) });
        placed = true;
      }
    }
    belts.push({
      id: "belt:" + bi, x: +b.x.toFixed(2), y: +b.y.toFixed(2), facing: +facing.toFixed(3),
      ores: types.map((t, i) => ({ key: t.key, name: t.name, rarity: t.rarity, m3: rocks.filter((r) => r.ore === t.key).reduce((s, r) => s + r.m3, 0) })),
      totalM3: rocks.reduce((s, r) => s + r.m3, 0), rocks,
    });
  });
  return belts;
}
