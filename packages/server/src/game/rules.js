// (owner, 2026-10-18) Every number of the game. Back to basics (owner, later the same day: "lets start from the
// bottom"): asteroids are cores surrounded by masonry; mine through the masonry to the core; some masonry holds ore
// bits that fly into the core; denser masonry takes longer to mine; breaking the core piñatas every stored ore bit out
// for players to pick up. Miner only for now. Units: m, m/s, seconds. The plane: x east, y south (screen down); north
// is -y. Saturn is at (0, 0).

export const WORLD = {
  saturnR: 1200,            // the planet: nothing flies inside it
  station: [0, -1900],      // the one station, north of the planet
  safeR: 2600,              // around Saturn and the station, outside any sector
  rings: [[3000, 9000], [12000, 18000], [21000, 28000]],  // the three rings (inner, outer radius)
  lockedR: 29000,           // the red dashed line: nobody flies past it
  cell: 700,                // the asteroid grid: one seeded rock slot per cell
  loadR: 3200,              // the hard cap on what a player can ever be sent
};

// (owner, 2026-10-18) the Miner mines; the Scanner, Booster and Hauler fly (and scoop drops into their holds) but have
// no abilities yet
// len: drawn length in m, proportional to the ship sheet (owner, 2026-10-18: the Miner keeps its size, 0.403 m per
// sheet pixel — 200 / 215 / 458 / 773 px); r: the bump radius, scaled the same way from the Miner's 24 m
// (owner, 2026-10-18) bigger ships turn slower (turn, rad/s) and accelerate slower (accel, m/s^2; braking is 2/3 of it) but
// top out faster (speed, m/s). The Hauler is a barge: its hold takes four full jetcans.
export const SHIPS = {
  miner:   { name: "Miner",   art: ["miner"],              hold: 1200, speed: 80, accel: 45, turn: 2.4, laserDps: 15, laserRange: 220, vision: 1000, muzzle: 15.8, len: 80.6, r: 24, pivot: 0.408, hw: 0.178,
    tractor: { span: [0.24, 0.74], depth: 0.5 }, xfer: 500 },   // muzzle: m ahead of the pivot the beam starts (the sheet's red dot)
  scanner: { name: "Scanner", art: ["scanner", "tractor"], hold: 600,  speed: 85, accel: 43, turn: 2.3, vision: 1500, len: 86.7,  r: 26,
    scanDps: 30, scanRange: 260, muzzle: 15.3 },   // (owner, 2026-10-18) the scan beam: scanDps scan points / s, out from the sheet's red dot
  booster: { name: "Booster", art: ["command"],            hold: 600,  speed: 110, accel: 28, turn: 1.4, vision: 1000, len: 184.6, r: 55,
    boost: 1, coolRate: 0.15, coolRange: 220, boostRange: 320 },   // (owner, 2026-10-18) coolant beam (default) / boost beam, F switches
  hauler:  { name: "Hauler",  art: ["refinery", "hauler"], hold: 40000, refineRate: 400, cargoFirst: "in", speed: 140, accel: 16, turn: 0.8, vision: 1000, len: 311.6, r: 93, pivot: 0.405, hw: 0.138,
    tractor: { span: [0.26, 0.72], depth: 0.2 }, xfer: 2000 },
};
export const SHIP_KINDS = Object.keys(SHIPS);
// (owner, 2026-10-18) no push: waves run only when a chunk with ore bits is cut — each bit leaves the chunk as the cut
// passes its share of the chunk's health and rides a wave back down the beam into the ship's hold at this speed (m/s)
export const LASER = { bitSpeed: 140 };
// (owner, 2026-10-18) the Miner's and Hauler's cargo fields: F once opens the deposit field (left side), again swaps to
// the withdraw field (right side), a third time closes both. Withdraw pulls any ore drop or jetcan the pilot may haul
// toward the ship at pull m/s, scooped when it arrives. Deposit streams the hold out, xfer units / s, into a station
// beam the field touches (straight into storage) or into another ship's withdraw field it overlaps. Ore in transit
// belongs to its destination — nobody else can pull it in. Per ship: pivot = the pivot's place along the hull from the
// stern, hw = the hull's half-width, both x len; tractor.span = the field's stretch along the hull (from the stern, x
// len), depth = how far out it reaches past the hull (x len) — a rectangle, straight-sided (owner).
// (owner, 2026-10-18) heat: cutting a chunk heats it (chunkUp / s less its cooling, to 1) and a hotter chunk cuts faster
// (x 1 + speed x heat); chunks cool chunkCool / s when not cut. The core heats from all its warm chunks together: coreIn x
// the sum of their heat^2 per second (coreDirect / s while the laser is on the core itself); it cools coreCool / s. A core
// that reaches 1 overheats: the asteroid shatters, its corium and unmined chunks lost.
export const HEAT = { chunkUp: 0.3, chunkCool: 0.1, speed: 1.5, coreIn: 0.06, coreDirect: 0.08, coreCool: 0.006 };
// (owner, 2026-10-18) a Booster's boost: Miners cut, Boosters cool, Scanners scan and Haulers refine this much faster
export const BOOST = { mult: 1.6, hold: 400 };   // hold: ms a boost lasts after the beam leaves
// (owner, 2026-10-18) a Hauler's refining (R): raw ore in the hold turns refined at refineRate units / s; refined ore
// takes REFINED_SPACE of the room
export const TRACTOR = { pull: 45, xferSpeed: 260 };
// (owner, 2026-10-18) the station's 4 deposit fields: rectangles out of its 4 corner pods (the owner's sketch), w m wide,
// from r0 (the pods' outer edge) to r1 m from the station's center, at angles a0 + k x 90° (deg)
export const STATION_BEAMS = { n: 4, r0: 161, r1: 760, w: 64, a0: 45 };   // (owner: long, like beams)
// shared flying numbers (every hull)
export const FLY = { accel: 45, brake: 30, turn: 2.4, interactR: 200, shipR: 24 };   // (the defaults: each ship's own accel / turn win)

// ---- the asteroid: masonry around a core ----
// (owner, 2026-10-18) the chunk sheet: a core, then layers of masonry, every layer the same thickness with a gap between.
// Each layer splits into equal full-length slots (its arc, from the sheet); a slot holds one full chunk, or splits
// across its width (inner + outer halves) and/or along its length (two halves side by side).
export const LAYOUT = { coreR: 22.5, layer: 10, gap: 1, arcs: [60, 45, 36, 30, 24, 20, 18, 15, 15, 12], splitW: 0.3, splitL: 0.35 };
export const CHUNK = {
  hpK: 0.11,                // health = chunk area (m^2) x this x density
  wD1: 40, wD2: 38, wD3: 22, // density weights, % (D1 lightest .. D3 darkest)
  d1: 0.8, d2: 1.6, d3: 3,  // health x per density: denser takes longer to mine
  oreUnit: 100,             // units in one ore bit
  barren: 0.5,              // share of chunks with no ore
  b1: 45, b2: 35, b3: 20,   // an ore chunk's bits, 1 / 2 / 3, weights %
  // (owner, 2026-10-18) scanning: a chunk hides its density and bits until scanned; its scan takes area x scanK x its
  // density's factor scan points (denser takes longer; bedrock very long)
  scanK: 0.1, s1: 0.6, s2: 1, s3: 1.6, sBed: 8,
};
// (owner, 2026-10-18) bedrock: a chunk the Miner can't cut (its laser stops on it), no ore, near-black once scanned;
// the share of chunks that are bedrock per ring, more deeper out
export const RING_BEDROCK = [0.06, 0.12, 0.2];
// rock size from its layer count (2 up to 10; deeper rings roll thicker rocks). Returns { shells, radius, coreR, coreHp, oreTypes }.
export const ROCK_SIZE = (n) => ({
  shells: n, radius: LAYOUT.coreR + n * (LAYOUT.layer + LAYOUT.gap), coreR: LAYOUT.coreR,
  coreHp: Math.round(110 + n * 30), oreTypes: n <= 4 ? 1 : n <= 7 ? 2 : 3,
});
export const RING_SHELLS = [[2, 5], [4, 8], [7, 10]];   // layers rolled per ring (min, max): thicker asteroids deeper
export const CORE = { grow: 1.5 };                      // the core swells up to x2.5 as the masonry around it comes away (drawn beneath it)
// (owner, 2026-10-18) the core's corium: deeper asteroids and asteroids with more layers drop more. Units = perLayer x
// layers x the ring's factor (rounded to whole lumps); all of it piñatas out as drops when the core breaks.
export const CORIUM = { perLayer: 100, ring: [1, 1.5, 2] };
export const ROCK = { linger: 1800, respawn: 45, reseed: 6 * 3600, spawnChance: 0.6, detailR: 300 };   // detailR (owner, 2026-10-18): a rock's layers show only to pilots within this of its edge   // s: a part-mined rock lasts after its last touch; a popped slot re-rolls elsewhere; seeds rotate; share of cells with a rock
// which ores each ring holds (rarer outward) and its rock chance x
export const RING_ORES = [["iron", "ice", "titanium"], ["titanium", "cobalt", "platinum"], ["cobalt", "platinum"]];
export const RING_SPAWN = [1, 1, 0.7];

// (owner, 2026-10-18) ore colors from the owner's chunk mockup: bright bits that read on grey masonry
export const ORES = {
  iron: { name: "Iron", color: "#ff9a4a" },
  ice: { name: "Ice", color: "#78dcff" },
  titanium: { name: "Titanium", color: "#ffc446" },
  cobalt: { name: "Cobalt", color: "#78f08c" },
  platinum: { name: "Platinum", color: "#f06ec8" },
  corium: { name: "Corium", color: "#a98bff" },       // (owner, 2026-10-18) the core's own ore: only the piñata drops it
  core: { name: "Core", color: "#e89a3c" },           // (no longer mined; kept so players' stored core ore survives)
};
export const REFINED_SPACE = 0.2;              // (kept for old refined cargo still in holds)

// ---- ore drops: the core's piñata, free for anyone, picked up by flying over ----
export const DROPS = { linger: 300, lump: 100, spread: 1.4 };   // s a drop drifts (owner, 2026-10-18: 5 minutes, a shrinking ring shows it); units per lump; how far out they scatter (x rock radius)
// (owner, 2026-10-18) jetcans: a pilot sends one out from the hold — up to 100 ore bits each. Solo pilots make
// base cans (only they can haul from them), party members party cans (only that party); either turns public (anyone)
// after privateFor s, a party can also when its party disbands. A public can lasts publicFor s, then it's gone.
// len: drawn length (m, the sheet's 66 px at the ships' 0.403 m/px); pickR: fly within this to haul from it; ownerAway:
// the owner hauls from their own can only after flying this far from it (no re-scooping it on the spot); max: private
// cans a pilot may have out before a new one asks to destroy the oldest (owner, 2026-10-18).
export const JETCAN = { bits: 100, max: 3, privateFor: 1800, publicFor: 900, len: 26.6, pickR: 40, ownerAway: 100 };

export const ECON = { dockR: 220 };
export const START = { ship: "miner" };
export const SECTORS = ["N", "E", "S", "W"], SECTOR_NAMES = { N: "North", E: "East", S: "South", W: "West" };
