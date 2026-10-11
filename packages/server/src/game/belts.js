// Asteroid belts (owner, 2026-10-10): belt POIs 100 km across whose rocks lie on a half-moon (crescent) around the
// POI's centre. Five ores, one per rarity tier. Keys are the old names (they may be in player data later).
// `rock` = sprite family in assets/rocks/.
export const ORES = [
  { key: "ironstone", name: "Cryonite",  rarity: "common",    tier: 0, color: "#8d8378", rock: "cratered"  },
  { key: "cuprite",   name: "Pyroxite",  rarity: "uncommon",  tier: 1, color: "#c27a46", rock: "elongated" },
  { key: "cobaltine", name: "Duranite",  rarity: "rare",      tier: 2, color: "#4f78c8", rock: "fractured" },
  { key: "iridite",   name: "Hexite",    rarity: "very rare", tier: 3, color: "#b9a8d6", rock: "bubble"    },
  { key: "starglass", name: "Tantalite", rarity: "legendary", tier: 4, color: "#bfeeff", rock: "layered"   },
];
const ORE_BY_KEY = new Map(ORES.map((o) => [o.key, o]));

export const BELT = {
  radiusKm: 50,                 // (owner) 100 km across
  arcKm: 45, arcJitterKm: 5,    // (owner) the crescent "near 50 km, give or take 5": its middle line at 45 km, rocks up to 5 km either side, so it stays inside the 50 km edge
  minM3: 2_000_000,             // (owner) at least this much ore between all the rocks
  fullMs: 60 * 60 * 1000,       // (owner) untouched for the first hour...
  decayMinMs: 60 * 60 * 1000, decayMaxMs: 3 * 60 * 60 * 1000,   // ...then each rock wastes away to nothing over 1-3 hours of its own
};
// rock sizes (owner: large → medium → small as it loses ore): the sprite size in metres, by ore left
export const ROCK_SIZES = [{ m: 1000, minM3: 20_000 }, { m: 500, minM3: 5_000 }, { m: 200, minM3: 0 }];
export const sizeFor = (m3) => ROCK_SIZES.find((s) => m3 >= s.minM3).m;
const START_M3 = { 1000: [25_000, 60_000], 500: [6_000, 15_000], 200: [1_500, 4_000] };
const SIZE_W = [[1000, 30], [500, 40], [200, 30]];
const RARITY_W = [50, 28, 14, 6, 2];
const pickW = (ws) => { let r = Math.random() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return i; } return 0; };

/** A belt's field: a crescent of rocks around (cx, cy) — a primary ore by rarity plus a couple of lower ones. */
export function createBeltField(id, cx, cy, now = Date.now()) {
  const tier = pickW(RARITY_W), lower = ORES.filter((o) => o.tier < tier), types = [ORES[tier]];
  while (types.length < 3 && lower.length) types.push(lower.splice(Math.floor(Math.random() * lower.length), 1)[0]);
  if (types.length < 2) types.push(ORES[Math.min(4, tier + 1)]);
  const shares = types.map((_, i) => (i === 0 ? 1 : 0.3 + Math.random() * 0.3));
  const dir = Math.random() * Math.PI * 2;      // the way the crescent bulges: its middle is at this angle from the centre
  const f = { dir: +dir.toFixed(4), tier, nextId: 0, ver: 1, rocks: [], total: 0 };
  let guard = 0;
  while (f.total < BELT.minM3 && guard++ < 5000) {
    const size = SIZE_W[pickW(SIZE_W.map((s) => s[1]))][0], r = size / 2000, [lo, hi] = START_M3[size];
    for (let t = 0; t < 60; t++) {
      // a half moon: angles within 90° of the middle; thickest in the middle, tapering toward the horns
      const u = Math.random() * 2 - 1, a = dir + u * Math.PI / 2, thick = BELT.arcJitterKm * Math.cos(u * Math.PI / 2) ** 0.6;
      const d = Math.min(BELT.radiusKm - r - 0.2, BELT.arcKm + (Math.random() * 2 - 1) * thick);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (f.rocks.some((o) => Math.hypot(x - o.x, y - o.y) < o.r + r + 0.15)) continue;
      const m3 = Math.round(lo + Math.random() * (hi - lo)), ore = types[pickW(shares)].key;
      const decay = BELT.decayMinMs + Math.random() * (BELT.decayMaxMs - BELT.decayMinMs);
      f.rocks.push({ id: id + "#" + (f.nextId++), x: +x.toFixed(3), y: +y.toFixed(3), r, size, ore, m3, m0: m3, rot: +(Math.random() * Math.PI * 2).toFixed(3), fadeAt: now + BELT.fullMs, goneAt: now + BELT.fullMs + decay });
      f.total += m3;
      break;
    }
  }
  return f;
}
/** Let time take its toll: after the first hour each rock loses ore steadily until it's gone. Returns true if the
 *  field changed in a way players see (a rock changed size or vanished). */
export function decayField(f, now = Date.now()) {
  let changed = false;
  for (let i = f.rocks.length - 1; i >= 0; i--) {
    const k = f.rocks[i]; if (now <= k.fadeAt) continue;
    k.m3 = Math.max(0, Math.round(k.m0 * (k.goneAt - now) / (k.goneAt - k.fadeAt)) - (k.mined || 0));   // (less what's been mined out of it)
    if (k.m3 <= 0) { f.rocks.splice(i, 1); changed = true; continue; }
    const size = sizeFor(k.m3); if (size !== k.size) { k.size = size; k.r = size / 2000; changed = true; }
  }
  if (changed) f.ver++;
  return changed;
}
export const fieldM3 = (f) => f.rocks.reduce((s, k) => s + k.m3, 0);
export const oreOf = (key) => ORE_BY_KEY.get(key);
