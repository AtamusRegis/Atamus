// (owner, 2026-10-18) Every number of the mining redesign, from the design document "Crack, Bank and Haul" (draft 9,
// docs/Atamus_Ring_Mining.html), reworked 2026-10-18 to the sandbox build the owner iterated: name-and-play, no fuel,
// beam heat stages, the Miner's charge shot, the Booster's one-ship boost beam, free-for-all ore drops. Units: m, m/s,
// seconds. The plane: x east, y south (screen down); north is -y. Saturn is at (0, 0).

export const WORLD = {
  saturnR: 1200,            // the planet: nothing flies inside it
  station: [0, -1900],      // the one station, north of the planet
  safeR: 2600,              // around Saturn and the station, outside any sector
  rings: [[3000, 9000], [12000, 18000], [21000, 28000]],  // the rings (inner, outer radius); ring 3 (owner, 2026-10-18)
  lockedR: 29000,           // the red dashed line: nobody flies past it
  cell: 700,                // the asteroid grid: one seeded rock slot per cell
  loadR: 3200,              // the hard cap on what a player can ever be sent
};

// (owner, 2026-10-18) four ships, each a role of its own. The Miner's laser is the strong one and can overcharge a
// breaking chunk into a blast. The Scanner is the core driller (its drill surveys a straight line to the core) and also
// tows. The Booster carries no laser at all: it boosts one ship at a time with a held beam, or cools rock with a coolant
// spray — boosted lasers are the only thing that cuts bedrock cleanly. The Hauler is the big hold with the refinery
// aboard, compressing its own cargo en route and other ships' with a refine beam. No fueler and no fuel for now (owner).
export const SHIPS = {
  miner:   { name: "Miner",   art: ["miner"],              hold: 1200, speed: 80, laserDps: 15, laserRange: 220, charge: 1, vision: 1000 },
  scanner: { name: "Scanner", art: ["scanner", "tractor"], hold: 600,  speed: 85, laserDps: 5, laserRange: 180,
             drillSpeed: 9, drillBed: 0.2, drillShock: 0.08, drillRange: 250, vision: 1500,   // the drill: m/s into the rock; x through bedrock; collateral a second on chunks touching drilled bedrock; working reach
             towRange: 250, towPull: 2.5, towLeash: 12 },
  booster: { name: "Booster", art: ["command"],            hold: 600,  speed: 85,
             boost: 1.6, boostRange: 350, boostDur: 15, boostAim: 30, coolRange: 180, vision: 1000 },   // the boost beam: one ship at a time, topped up to boostDur s; aim slack m
  hauler:  { name: "Hauler",  art: ["refinery", "hauler"], hold: 6000, speed: 70, laserDps: 5, laserRange: 180,
             refineUnit: 5, refineRange: 200, vision: 1000 },   // refines a 100-unit block every refineUnit s (its own hold en route, or another ship's under its refine beam)
};
export const SHIP_KINDS = Object.keys(SHIPS);
// shared flying numbers (every hull)
export const FLY = { accel: 45, brake: 30, turn: 2.4, interactR: 200, shipR: 24 };

// ---- the asteroid: masonry around a core (the document's prototype numbers) ----
export const CHUNK = {
  burst: 0.25,              // breaking a chunk shocks every touching chunk for this share of its max health; chains cascade
  hpK: 0.11,                // health = chunk area (m^2) x this x density
  wSoft: 14, wNormal: 46, wDense: 18, wUltra: 8, wBed: 14,   // density weights, %
  soft: 0.55, dense: 2.3, ultra: 4, bed: 5,       // health x (normal is 1; bedrock only breaks for boosted lasers)
  oreUnit: 100,             // (owner, 2026-10-18) units in one ore drop
  denseOre: 100, ultraOre: 200, // extra ore units in a dense / ultra ore chunk (base is oreUnit)
  bedOre: 200,              // (owner, 2026-10-18) bedrock is rich: always ore, base + this — but only a boosted laser banks it
  barren: 0.5,              // share of breakable chunks with no ore
};
// rock size from its shell count (owner, 2026-10-18: 2 shells up to 10 — budget, radius and core all scale with the
// layers; deeper rings roll thicker rocks). Returns { chunks, shells, radius, coreR, rareMax, coreHp, oreTypes }.
export const ROCK_SIZE = (n) => ({
  chunks: 18 + n * 7, shells: n, radius: 46 + n * 11, coreR: Math.round(10 + n * 0.7),
  rareMax: Math.round(240 + n * 150), coreHp: Math.round(110 + n * 30), oreTypes: n <= 4 ? 1 : n <= 7 ? 2 : 3,
});
export const RING_SHELLS = [[2, 5], [4, 8], [7, 10]];   // shells rolled per ring (min, max): thicker asteroids deeper
export const CORE = { grow: 1.5, fastBreak: 4, weaken: 0.5 };   // swells up to x2.5 as chunks are stripped; breaks up to x4 faster fully overheated; stripping every chunk cracks it down to half health, never past
// (owner, 2026-10-18) heat: a yellow or red beam runs the mined chunk orange (a blue one never does); heat leaks to
// neighbors and pours into the core when a chunk breaks. A hot chunk and a hot core both mine faster — but an overheated
// core burns down and pops early, shattering everything still attached. The Booster's coolant spray sheds it.
export const HEAT = {
  rate: 0.09,               // heat a second the mined chunk gains (x its density's heat factor, x the beam stage, x a boost)
  hSoft: 1, hNormal: 1, hDense: 1.6, hUltra: 2.2, hBed: 3,   // heat factor per density (denser and bedrock run hotter)
  spread: 0.3,              // share of the mined chunk's heating that leaks to each touching chunk
  cool: 0.08,               // heat a second a chunk sheds on its own (owner, 2026-10-18: chunks cool quick)
  coreCool: 0.05,           // heat a second the core sheds (a bit slower than chunks)
  coreSeep: 0.12,           // share of what a chunk sheds that seeps into the core (heat transfers in over time, not only at breaks)
  coreK: 0.25,              // core heat gained per chunk broken, x the chunk's heat at the break
  burn: 0.05,               // share of core health burned a second while the core is overheated (heat at 1)
  coolBeam: 0.3,            // heat a second the coolant spray pulls out of a chunk (or the core, down a bore); cooling a chunk also pulls half that from the core
  chunkBreak: 3,            // a fully hot chunk takes laser damage x this
};
// (owner, 2026-10-18) the beam itself has a temperature: held on rock it runs blue, yellow, red — each stage cuts and
// heats differently (blue adds no heat at all). Letting go snaps it back to blue; firing off the rock cools it.
export const BEAM = { ramp: 14, cool: 3, heatF: [0, 0.6, 2], dpsF: [1, 1.5, 2.2], stages: [0.35, 0.7] };
// (owner, 2026-10-18) the Miner's charge shot: a chunk at its breaking point primes instead of popping while the beam
// holds; released, it blasts damage into the chunks behind it along the beam line, at a heavy heat price.
export const CHARGE = { time: 2, depth: 55, dmg: 0.9, heat: 0.5, blastMin: 0.5 };   // below blastMin charge, release just breaks the chunk — no blast
export const ROCK = { linger: 1800, respawn: 45, reseed: 6 * 3600, spawnChance: 0.6 };   // s: a part-mined rock lasts after its last touch; a popped slot re-rolls elsewhere; seeds rotate; share of cells with a rock
// which ores each ring holds (rarer outward); per-ring bedrock weight x, rock chance x, and whether a bedrock-free line
// to the core is guaranteed (ring 3's cores can roll bedrock-encapsulated)
export const RING_ORES = [["iron", "ice", "titanium"], ["titanium", "cobalt", "platinum"], ["cobalt", "platinum"]];
export const RING_BED = [1, 1.6, 2.4];
export const RING_SPAWN = [1, 1, 0.7];
export const RING_FREELINE = [1, 1, 0];

// ores. Delivery pays the ore itself into the deliverer's station storage (owner, 2026-10-18: no money in this build);
// color is the ore's look everywhere.
export const ORES = {
  iron: { name: "Iron", color: "#aab3c2" },
  ice: { name: "Ice", color: "#9fdcef" },
  titanium: { name: "Titanium", color: "#e3ddc9" },
  cobalt: { name: "Cobalt", color: "#6f8fe0" },
  platinum: { name: "Platinum", color: "#b98cf0" },
  core: { name: "Core", color: "#e89a3c" },           // the core's rare ore
};
export const REFINED_SPACE = 0.2;              // a refined unit's share of a raw unit's hold room

// ---- ore drops (where overflow ore goes: free for anyone, in as many trips as it takes) ----
export const DROPS = { linger: 1800, lump: 100 };   // s a drop drifts before it's gone; units per drifting lump

export const ECON = { dockR: 220 };
export const START = { ship: "miner" };
export const SECTORS = ["N", "E", "S", "W"], SECTOR_NAMES = { N: "North", E: "East", S: "South", W: "West" };
