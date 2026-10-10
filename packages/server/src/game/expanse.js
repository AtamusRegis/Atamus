// The Expanse (docs/DESIGN.md): one persistent home system, a flat-top hexagon 1 AU across, made of points of
// interest (POIs). Map positions are in AU (sun at 0,0); inside a POI everything is local km around its centre.
import { ORES } from "./belts.js";

export const EXPANSE_APOTHEM_AU = 0.5;                 // 1 AU across, flat to flat
// POI sizes, in km across (owner: 50-100 km). The boundary is a circle of half that.
export const POI_SIZE_KM = { station: 100, planet: 80, gate: 60, belt: 50, spawn: 20 };
export const POI_KIND_NAMES = { station: "Station", planet: "Planet", gate: "Stargate", belt: "Asteroid Belt", spawn: "Deep Space" };

const deg = (d) => d * Math.PI / 180;
const at = (au, a) => ({ ax: +(Math.cos(deg(a)) * au).toFixed(4), ay: +(Math.sin(deg(a)) * au).toFixed(4) });
const PLANETS = [[0.10, 28], [0.18, 152], [0.27, 262], [0.38, 338]];
const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
const GATE_DIRS = ["North", "Northwest", "Southwest", "South", "Southeast", "Northeast"];   // edge midpoints, 90° + 60°k

/** The fixed POIs: 4 planets, the station beside the second planet, and a stargate in the middle of each edge. */
export function fixedPois() {
  const out = [];
  PLANETS.forEach(([au, a], i) => out.push({ id: "planet:" + (i + 1), kind: "planet", name: "Expanse " + ROMAN[i], ...at(au, a), seed: i + 1 }));
  out.push({ id: "station", kind: "station", name: "Expanse Station", ...at(PLANETS[1][0], PLANETS[1][1] + 9) });
  for (let k = 0; k < 6; k++) out.push({ id: "gate:" + (k + 1), kind: "gate", name: "Stargate " + GATE_DIRS[k], ...at(EXPANSE_APOTHEM_AU * 0.96, 90 + 60 * k), state: "offline" });
  for (const p of out) { p.r = POI_SIZE_KM[p.kind] / 2; p.fixed = true; }
  return out;
}

const NORMALS = [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 2 + k * Math.PI / 3; return [Math.cos(a), Math.sin(a)]; });
export const insideExpanse = (ax, ay, margin = 0) => NORMALS.every(([nx, ny]) => ax * nx + ay * ny <= EXPANSE_APOTHEM_AU - margin);
export const auDist = (a, b) => Math.hypot(a.ax - b.ax, a.ay - b.ay);

/** A free map point for a new POI: inside the hexagon, between `minAu` and `maxAu` from the sun, clear of other POIs. */
export function freeSpot(pois, minAu, maxAu, clearAu = 0.03) {
  for (let t = 0; t < 400; t++) {
    const a = Math.random() * Math.PI * 2, d = minAu + Math.random() * (maxAu - minAu), ax = Math.cos(a) * d, ay = Math.sin(a) * d;
    if (!insideExpanse(ax, ay, 0.03)) continue;
    if ([...pois].some((p) => Math.hypot(p.ax - ax, p.ay - ay) < clearAu)) continue;
    return { ax: +ax.toFixed(4), ay: +ay.toFixed(4) };
  }
  return { ax: +(Math.random() * 0.2 - 0.1).toFixed(4), ay: +(0.25).toFixed(4) };
}

// ---- belt fields ----
const SIZE_W = [{ m: 200, w: 60, m3: [800, 1600] }, { m: 500, w: 32, m3: [4000, 8000] }, { m: 1000, w: 8, m3: [15000, 30000] }];
const RARITY_W = [50, 28, 14, 6, 2];
export const BELT = { rocksMin: 70, rocksMax: 110, oreMinM3: 250_000, oreMaxM3: 600_000, spreadKm: 16 };
const pickW = (rnd, ws) => { let r = rnd() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return i; } return 0; };

/** A belt POI's rock field: one rich field around the POI's centre, primary ore by rarity plus a couple of lower ores. */
export function createBeltField(sys, radiusKm) {
  const rnd = Math.random, tier = pickW(rnd, RARITY_W);
  const lower = ORES.filter((o) => o.tier < tier), types = [ORES[tier]];
  while (types.length < 3 && lower.length) types.push(lower.splice(Math.floor(rnd() * lower.length), 1)[0]);
  if (types.length < 2) types.push(ORES[Math.min(4, tier + 1)]);
  const shares = types.map((_, i) => (i === 0 ? 1 : 0.3 + rnd() * 0.3));
  const f = { sys, kind: "belt", nextId: 0, ver: 1, rocks: [], tier, color: ORES[tier].color };
  const n = Math.round(BELT.rocksMin + rnd() * (BELT.rocksMax - BELT.rocksMin)), total = BELT.oreMinM3 + rnd() * (BELT.oreMaxM3 - BELT.oreMinM3);
  const raw = [];
  for (let i = 0; i < n; i++) { const s = pickW(rnd, SIZE_W.map((q) => q.w)); raw.push({ s, ti: pickW(rnd, shares), w: [1, 6, 25][s] * (0.7 + rnd() * 0.6) }); }
  const sum = raw.reduce((a, q) => a + q.w, 0), spread = Math.min(BELT.spreadKm, radiusKm - 3), stretch = 0.6 + rnd() * 0.5, tilt = rnd() * Math.PI;
  for (const q of raw) {
    const r = SIZE_W[q.s].m / 2000;
    for (let t = 0; t < 80; t++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * spread, u = Math.cos(a) * d, v = Math.sin(a) * d * stretch;
      const x = u * Math.cos(tilt) - v * Math.sin(tilt), y = u * Math.sin(tilt) + v * Math.cos(tilt);
      if (Math.hypot(x, y) > radiusKm - r - 1 || f.rocks.some((o) => Math.hypot(x - o.x, y - o.y) < o.r + r + 0.08)) continue;
      const o = types[q.ti], vol = Math.max(100, Math.round(q.w / sum * total));
      f.rocks.push({ id: sys + "#" + (f.nextId++), x: +x.toFixed(3), y: +y.toFixed(3), r: SIZE_W[q.s].m / 2000, size: SIZE_W[q.s].m, ore: o.key, m3: vol, m0: vol, rot: +(rnd() * Math.PI * 2).toFixed(3) });
      break;
    }
  }
  return f;
}
