// Celestials (owner, 2026-10-11, "modelled after Earth's solar system"): the Sun at the Expanse's center and the eight
// planets on their real orbits (semi-major axis, eccentricity and where the perihelion points; 1 AU = AU_KM), each
// with its real number of moons. Nothing actually orbits: they're laid out once, the same on every start, from a fixed
// seed (where along its orbit each body sits). Body sizes follow the real ones with Earth 100 km in radius (the Sun is
// far smaller than it would be, so Mercury clears it). Moon orbits are squeezed so a whole system fits around its planet: planet radius × √(real distance in planet radii) × MOON_SPREAD.
// The Sun, each planet and each major moon is a POI with an anchor just off it (what you align and warp to); the small
// moons are drawn and have Info, but aren't on the map. Ringed planets (Jupiter, Saturn, Uranus, Neptune) have rings,
// where many asteroid belts spawn (scattered rocks); the rest spawn around planets and moons.
import { AU_KM } from "./constants.js";

export const SUN = { id: "sun", kind: "sun", name: "Sun", x: 0, y: 0, rKm: 2500, r: 2500, clearKm: 4500 };   // nothing spawns within clearKm of the center
export const WORLD_KINDS = ["Ocean", "Desert", "Ice", "Gas giant"];
const ANCHOR = { rKm: 25, planetGapKm: 140, moonGapKm: 50, sunGapKm: 600 };   // an anchor POI is 50 km across, this far off the body's surface
const MOON_SPREAD = 1.3, EARTH_R_KM = 6371, GAME_EARTH_R = 100, kmR = (realKm) => Math.max(0.5, +(realKm / EARTH_R_KM * GAME_EARTH_R).toFixed(2));
const ROMAN = (n) => { let s = ""; for (const [v, r] of [[100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]) while (n >= v) { s += r; n -= v; } return s; };

// [name, a (AU), e, perihelion longitude (deg), real radius (km), world, rings [inner, outer] in planet radii (bright?)]
// moons: named [name, distance (planet radii), real radius (km), major (a POI)], then `more`: [count, from, to (radii), r min, r max] unnamed small ones
const SYSTEM = [
  { name: "Mercury", a: 0.387, e: 0.2056, w: 77.5, R: 2440, world: "Desert", moons: [] },
  { name: "Venus", a: 0.723, e: 0.0068, w: 131.6, R: 6052, world: "Desert", moons: [] },
  { name: "Earth", a: 1.0, e: 0.0167, w: 102.9, R: 6371, world: "Ocean", moons: [["Moon", 60.3, 1737, true]] },
  { name: "Mars", a: 1.524, e: 0.0934, w: 336.0, R: 3390, world: "Desert", moons: [["Phobos", 2.76, 11, true], ["Deimos", 6.92, 6.2, true]] },
  { name: "Jupiter", a: 5.203, e: 0.0484, w: 14.7, R: 69911, world: "Gas giant", rings: [1.29, 1.81, false], total: 95,
    moons: [["Metis", 1.79, 21.5], ["Adrastea", 1.81, 8.2], ["Amalthea", 2.54, 83.5, true], ["Thebe", 3.11, 49.3], ["Io", 5.9, 1822, true], ["Europa", 9.4, 1561, true], ["Ganymede", 15.0, 2634, true], ["Callisto", 26.4, 2410, true],
      ["Themisto", 105, 4], ["Leda", 155, 10], ["Himalia", 160, 85, true], ["Lysithea", 163, 18], ["Elara", 164, 43], ["Carpo", 238, 1.5], ["Ananke", 297, 14], ["Carme", 327, 23], ["Pasiphae", 330, 30], ["Sinope", 333, 19], ["Callirrhoe", 340, 4.3]],
    more: [[76, 100, 360, 0.5, 3]] },
  { name: "Saturn", a: 9.537, e: 0.0539, w: 92.4, R: 58232, world: "Gas giant", rings: [1.24, 2.27, true], total: 146,
    moons: [["Pan", 2.22, 14], ["Daphnis", 2.26, 3.8], ["Atlas", 2.29, 15], ["Prometheus", 2.31, 43], ["Pandora", 2.35, 40], ["Epimetheus", 2.51, 58], ["Janus", 2.51, 89], ["Aegaeon", 2.78, 0.3], ["Mimas", 3.08, 198, true], ["Methone", 3.22, 1.6], ["Anthe", 3.28, 0.9], ["Pallene", 3.52, 2.2],
      ["Enceladus", 3.95, 252, true], ["Tethys", 4.89, 531, true], ["Telesto", 4.89, 12], ["Calypso", 4.89, 10], ["Dione", 6.26, 561, true], ["Helene", 6.26, 18], ["Polydeuces", 6.26, 1.3], ["Rhea", 8.74, 764, true], ["Titan", 20.3, 2575, true], ["Hyperion", 24.6, 135, true], ["Iapetus", 59.1, 735, true], ["Phoebe", 215, 107, true],
      ["Kiviuq", 189, 8], ["Ijiraq", 189, 6], ["Paaliaq", 252, 11], ["Albiorix", 271, 16], ["Skathi", 258, 4], ["Erriapus", 291, 5], ["Siarnaq", 302, 20], ["Tarvos", 302, 7.5], ["Mundilfari", 309, 3.5], ["Narvi", 319, 3.5], ["Bergelmir", 319, 3], ["Suttungr", 323, 3.5], ["Bestla", 334, 3.5], ["Thrymr", 340, 3.5], ["Ymir", 383, 9]],
    more: [[107, 180, 420, 0.5, 3]] },
  { name: "Uranus", a: 19.19, e: 0.0473, w: 170.9, R: 25559, world: "Ice", rings: [1.64, 2.0, false], total: 28,
    moons: [["Cordelia", 1.95, 20], ["Ophelia", 2.1, 21], ["Bianca", 2.32, 26], ["Cressida", 2.42, 40], ["Desdemona", 2.45, 32], ["Juliet", 2.52, 47], ["Portia", 2.59, 68], ["Rosalind", 2.74, 36], ["Cupid", 2.92, 9], ["Belinda", 2.94, 45], ["Perdita", 2.98, 15], ["Puck", 3.37, 81], ["Mab", 3.82, 12],
      ["Miranda", 5.08, 236, true], ["Ariel", 7.47, 579, true], ["Umbriel", 10.4, 585, true], ["Titania", 17.1, 789, true], ["Oberon", 22.8, 761, true],
      ["Francisco", 168, 11], ["Caliban", 281, 36], ["Stephano", 314, 16], ["Trinculo", 335, 9], ["Sycorax", 476, 79], ["Margaret", 562, 10], ["Prospero", 636, 25], ["Setebos", 690, 24], ["Ferdinand", 818, 10]],
    more: [[1, 300, 700, 2, 4]] },
  { name: "Neptune", a: 30.07, e: 0.0086, w: 45.0, R: 24764, world: "Ice", rings: [1.69, 2.54, false], total: 16,
    moons: [["Naiad", 1.95, 33], ["Thalassa", 2.02, 41], ["Despina", 2.13, 75], ["Galatea", 2.5, 88], ["Larissa", 2.97, 97], ["Hippocamp", 4.26, 17], ["Proteus", 4.75, 210, true], ["Triton", 14.33, 1353, true], ["Nereid", 223, 170, true],
      ["Halimede", 664, 31], ["Sao", 902, 22], ["Laomedeia", 950, 21], ["Psamathe", 1871, 20], ["Neso", 1975, 30]],
    more: [[2, 900, 2000, 9, 12]] },
];

function layout(seed = 1337) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return SYSTEM.map((P, i) => {
    const a = P.a * AU_KM, e = P.e, w = P.w * Math.PI / 180, nu = rnd() * Math.PI * 2;   // where along its orbit (true anomaly)
    const rr = a * (1 - e * e) / (1 + e * Math.cos(nu)), ang = w + nu, x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
    const r = kmR(P.R), id = "planet:" + (i + 1), dist = (ratio) => +(r * Math.sqrt(ratio) * MOON_SPREAD).toFixed(2), moons = [];
    const add = (name, ratio, realR, major) => { const mo = dist(ratio), ma = rnd() * Math.PI * 2, n = moons.length + 1;
      moons.push({ id: id + ":moon:" + n, name, kind: "moon", parent: id, x: +(x + Math.cos(ma) * mo).toFixed(2), y: +(y + Math.sin(ma) * mo).toFixed(2), r: kmR(realR), orbit: mo, seed: 100 + i * 1000 + n, world: realR > 1000 ? (rnd() < 0.5 ? "Ice" : "Desert") : rnd() < 0.5 ? "Ice" : "Desert", ...(major ? { major: true } : {}) }); };
    for (const [name, ratio, realR, major] of P.moons) add(name, ratio, realR, !!major);
    let k = P.moons.length;
    for (const [count, from, to, rlo, rhi] of P.more || []) for (let j = 0; j < count; j++) add(P.name + " " + ROMAN(++k), from + rnd() * (to - from), rlo + rnd() * (rhi - rlo), false);
    const rings = P.rings ? { in: +(r * Math.sqrt(P.rings[0]) * MOON_SPREAD).toFixed(2), out: +(r * Math.sqrt(P.rings[1]) * MOON_SPREAD).toFixed(2), bright: P.rings[2] } : null;
    const zone = Math.max(r + 400, ...moons.filter((m) => m.major || m.orbit < r * 6).map((m) => m.orbit + m.r + 250));   // stations keep out of this (the planet and its inner system)
    return { id, name: P.name, kind: "planet", x: +x.toFixed(2), y: +y.toFixed(2), r, orbit: +a.toFixed(0), au: P.a, e, w: +w.toFixed(4), seed: i + 1, world: P.world, moons, zone, ...(rings ? { rings } : {}) };
  });
}
export const PLANETS = layout();
export const MOONS = PLANETS.flatMap((p) => p.moons);
export const CELESTIALS = [...PLANETS, ...MOONS];
export const EARTH = PLANETS.find((p) => p.name === "Earth");
export const RINGED = PLANETS.filter((p) => p.rings);
{ // anchors: a point on a ring just off each POI body, at its own angle
  let s = 4242; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const anchor = (b, gap) => { const t = rnd() * Math.PI * 2, d = b.r + gap; return { x: +(b.x + Math.cos(t) * d).toFixed(2), y: +(b.y + Math.sin(t) * d).toFixed(2), ring: d }; };
  for (const p of PLANETS) { p.anchor = anchor(p, ANCHOR.planetGapKm); for (const m of p.moons) if (m.major) m.anchor = anchor(m, ANCHOR.moonGapKm); }
  SUN.anchor = anchor({ x: 0, y: 0, r: SUN.rKm }, ANCHOR.sunGapKm);
}

/** (owner) The Sun, each planet and each major moon is a POI (on everyone's map) at the body itself; aligning and
 *  warping to it head for its anchor (ax, ay), the point orbiting just off it. */
export const celestialPois = () => [SUN, ...PLANETS, ...MOONS.filter((m) => m.major)].map((c) => ({ id: c.id, kind: c.kind, name: c.name, x: c.x, y: c.y, r: c.r, ax: c.anchor.x, ay: c.anchor.y, ar: ANCHOR.rKm, createdAt: 0, field: { rocks: [], props: [], dir: 0, ver: 1 }, retired: false }));
/** Where a warp to a celestial drops you: at its anchor, give or take a couple of km. */
export const anchorLanding = (poi) => ({ x: poi.ax + (Math.random() - 0.5) * 4, y: poi.ay + (Math.random() - 0.5) * 4 });
/** How far a point is outside every no-station zone (the Sun's, each planet's with its inner moons); negative = inside one. */
export function celestialClearance(x, y) {
  let m = Math.hypot(x, y) - SUN.clearKm;
  for (const p of PLANETS) m = Math.min(m, Math.hypot(x - p.x, y - p.y) - p.zone);
  return m;
}
/** Is a point on (or too near) a body: the Sun, a planet or any moon? */
export function onBody(x, y, padKm) {
  if (Math.hypot(x, y) < SUN.r + padKm) return true;
  for (const p of PLANETS) { const d = Math.hypot(x - p.x, y - p.y); if (d < p.r + padKm) return true;
    if (d < p.zone + 30000) for (const m of p.moons) if (Math.hypot(x - m.x, y - m.y) < m.r + padKm) return true; }
  return false;
}
/** What the client draws: the Sun, and each planet (its orbit: a, e, perihelion; its rings) and moon (its orbit around the planet). */
export const celestialsForClient = () => ({ sun: SUN, planets: PLANETS.map(({ zone, ...p }) => p) });
