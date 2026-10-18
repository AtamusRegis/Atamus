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
export const SHIPS = {
  miner:   { name: "Miner",   art: ["miner"],              hold: 1200, speed: 80, laserDps: 15, laserRange: 220, vision: 1000, muzzle: 15.8, len: 80.6, r: 24 },   // muzzle: m ahead of the pivot the beam starts (the sheet's red dot)
  scanner: { name: "Scanner", art: ["scanner", "tractor"], hold: 600,  speed: 85, vision: 1500, len: 86.7,  r: 26 },
  booster: { name: "Booster", art: ["command"],            hold: 600,  speed: 85, vision: 1000, len: 184.6, r: 55 },
  hauler:  { name: "Hauler",  art: ["refinery", "hauler"], hold: 6000, speed: 70, vision: 1000, len: 311.6, r: 93 },
};
export const SHIP_KINDS = Object.keys(SHIPS);
// (owner, 2026-10-18) the laser's waves run emitter to tip; each one that lands on rock pushes the ship back: a kick of
// this many m/s that the ship's braking eases out, fast to slow (~0.9 m at brake 30). Timed on the server's clock.
export const LASER = { waveGap: 34, waveSpeed: 90, kick: 7.3 };
// shared flying numbers (every hull)
export const FLY = { accel: 45, brake: 30, turn: 2.4, interactR: 200, shipR: 24 };

// ---- the asteroid: masonry around a core ----
export const CHUNK = {
  hpK: 0.11,                // health = chunk area (m^2) x this x density
  wSoft: 18, wNormal: 50, wDense: 22, wUltra: 10,   // density weights, %
  soft: 0.55, dense: 2.3, ultra: 4,               // health x (normal is 1): denser takes longer to mine
  oreUnit: 100,             // units in one ore bit
  denseOre: 100, ultraOre: 200, // extra units in a dense / ultra ore chunk (base is oreUnit): denser holds more
  barren: 0.5,              // share of chunks with no ore
};
// rock size from its shell count: 2 shells up to 10 — budget, radius and core all scale with the layers; deeper rings
// roll thicker rocks. Returns { chunks, shells, radius, coreR, coreHp, oreTypes }.
export const ROCK_SIZE = (n) => ({
  chunks: 18 + n * 7, shells: n, radius: 46 + n * 11, coreR: Math.round(10 + n * 0.7),
  coreHp: Math.round(110 + n * 30), oreTypes: n <= 4 ? 1 : n <= 7 ? 2 : 3,
});
export const RING_SHELLS = [[2, 5], [4, 8], [7, 10]];   // shells rolled per ring (min, max): thicker asteroids deeper
export const CORE = { grow: 1.5 };                      // the core swells up to x2.5 as ore bits bank into it
export const ROCK = { linger: 1800, respawn: 45, reseed: 6 * 3600, spawnChance: 0.6 };   // s: a part-mined rock lasts after its last touch; a popped slot re-rolls elsewhere; seeds rotate; share of cells with a rock
// which ores each ring holds (rarer outward) and its rock chance x
export const RING_ORES = [["iron", "ice", "titanium"], ["titanium", "cobalt", "platinum"], ["cobalt", "platinum"]];
export const RING_SPAWN = [1, 1, 0.7];

export const ORES = {
  iron: { name: "Iron", color: "#aab3c2" },
  ice: { name: "Ice", color: "#9fdcef" },
  titanium: { name: "Titanium", color: "#e3ddc9" },
  cobalt: { name: "Cobalt", color: "#6f8fe0" },
  platinum: { name: "Platinum", color: "#b98cf0" },
  core: { name: "Core", color: "#e89a3c" },           // (no longer mined; kept so players' stored core ore survives)
};
export const REFINED_SPACE = 0.2;              // (kept for old refined cargo still in holds)

// ---- ore drops: the core's piñata, free for anyone, picked up by flying over ----
export const DROPS = { linger: 1800, lump: 100, spread: 1.4 };   // s a drop drifts; units per lump; how far out they scatter (x rock radius)

export const ECON = { dockR: 220 };
export const START = { ship: "miner" };
export const SECTORS = ["N", "E", "S", "W"], SECTOR_NAMES = { N: "North", E: "East", S: "South", W: "West" };
