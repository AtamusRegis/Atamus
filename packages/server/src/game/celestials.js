// Celestials (owner, 2026-10-11): the sun at the Expanse's center, planets on orbit lines around it and moons on orbit
// lines around their planets. Nothing actually orbits: they're laid out once, the same on every start, from a fixed
// seed. Each planet and moon has an anchor, a point on a ring just off it, which is its POI: what you align and warp to.
// Nothing spawns near the sun; player stations keep clear of planets and moons (but may sit along their orbits or in
// deep space); asteroid belts spawn around planets and moons.
export const SUN = { id: "sun", name: "Atamus", rKm: 260, clearKm: 1000 };   // nothing spawns within clearKm of the center
const PLANET_ORBITS_KM = [2300, 3800, 5300, 6800, 8400];
export const WORLD_KINDS = ["Ocean", "Desert", "Ice", "Gas giant"];
const ANCHOR = { rKm: 25, planetGapKm: 140, moonGapKm: 50 };   // an anchor POI is 50 km across, this far off the body's surface
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

function layout(seed = 1337) {
  let a = seed; const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const planets = [];
  PLANET_ORBITS_KM.forEach((orbit, i) => {
    const ang = rnd() * Math.PI * 2, kind = Math.floor(rnd() * WORLD_KINDS.length), gas = WORLD_KINDS[kind] === "Gas giant";
    const r = Math.round(gas ? 150 + rnd() * 60 : 70 + rnd() * 60), x = Math.cos(ang) * orbit, y = Math.sin(ang) * orbit;
    const name = SUN.name + " " + ROMAN[i], id = "planet:" + (i + 1), n = 1 + Math.floor(rnd() * (gas ? 3 : 2.4)), moons = [];
    for (let j = 0; j < n; j++) {
      const mo = Math.round(r + 260 + j * 230 + rnd() * 90), ma = rnd() * Math.PI * 2, mr = Math.round(14 + rnd() * 24);
      moons.push({ id: id + ":moon:" + (j + 1), name: name + " - Moon " + (j + 1), kind: "moon", parent: id, x: +(x + Math.cos(ma) * mo).toFixed(2), y: +(y + Math.sin(ma) * mo).toFixed(2), r: mr, orbit: mo, seed: 100 + i * 10 + j, world: rnd() < 0.5 ? "Ice" : "Desert" });
    }
    const zone = Math.max(r + 400, ...moons.map((m) => m.orbit + m.r + 250));   // stations keep out of this (the planet and its moons)
    planets.push({ id, name, kind: "planet", x: +x.toFixed(2), y: +y.toFixed(2), r, orbit, seed: i + 1, world: WORLD_KINDS[kind], moons, zone });
  });
  // anchors: a point on a ring just off each body, at its own angle (the POI)
  const anchor = (b, gap) => { const t = rnd() * Math.PI * 2, d = b.r + gap; return { x: +(b.x + Math.cos(t) * d).toFixed(2), y: +(b.y + Math.sin(t) * d).toFixed(2), ring: d }; };
  for (const p of planets) { p.anchor = anchor(p, ANCHOR.planetGapKm); for (const m of p.moons) m.anchor = anchor(m, ANCHOR.moonGapKm); }
  return planets;
}
export const PLANETS = layout();
export const MOONS = PLANETS.flatMap((p) => p.moons);
export const CELESTIALS = [...PLANETS, ...MOONS];

/** Each planet's and moon's anchor as a POI (always on everyone's map). */
export const celestialPois = () => CELESTIALS.map((c) => ({ id: c.id, kind: c.kind, name: c.name, x: c.anchor.x, y: c.anchor.y, r: ANCHOR.rKm, createdAt: 0, body: c.id, field: { rocks: [], props: [], dir: 0, ver: 1 }, retired: false }));
/** Where a warp to a planet or moon drops you: at its anchor, give or take a couple of km. */
export const anchorLanding = (poi) => ({ x: poi.x + (Math.random() - 0.5) * 4, y: poi.y + (Math.random() - 0.5) * 4 });
/** How far a point is outside every no-station zone (the sun's, each planet's with its moons); negative = inside one. */
export function celestialClearance(x, y) {
  let m = Math.hypot(x, y) - SUN.clearKm;
  for (const p of PLANETS) m = Math.min(m, Math.hypot(x - p.x, y - p.y) - p.zone);
  return m;
}
/** What the client draws: the sun, and each planet and moon with its orbit (radius around what it circles). */
export const celestialsForClient = () => ({ sun: SUN, planets: PLANETS.map(({ zone, ...p }) => p) });
