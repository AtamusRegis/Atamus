// (owner, 2026-10-18) Every number of the mining redesign, from the design document "Crack, Bank and Haul" (draft 9,
// docs/Atamus_Ring_Mining.html). Numbers the document gives are used as given; the rest are placeholders meant to change
// (the developer panel edits all of them live). Units: m, m/s, seconds, credits. The plane: x east, y south (screen
// down); north is -y. Saturn is at (0, 0).

export const WORLD = {
  saturnR: 1200,            // the planet: nothing flies inside it
  station: [0, -1900],      // the one station, north of the planet
  safeR: 2600,              // around Saturn and the station, outside any sector
  rings: [[3000, 9000], [12000, 18000]],  // ring 1 and ring 2 (inner, outer radius)
  lockedR: 19000,           // the red dashed line: nobody flies past it
  cell: 700,                // the asteroid grid: one seeded rock slot per cell
  loadR: 3200,              // the hard cap on what a player can ever be sent
};

// (owner, 2026-10-18) each role is its own ship: the old hull with that module's section is how it looks and behaves.
// Only the Miner cuts rock. The Scanner also tows (the old tractor). The Hauler has the refinery aboard. The Booster
// speeds up one player's mining at a time. vision: the fog of war (the Scanner sees furthest).
// (owner, 2026-10-18) every ship can mine — a light laser on each; the Miner just does a far better job of it
export const SHIPS = {
  miner:   { name: "Miner",   art: ["miner"],               hold: 12, tank: 100, speed: 80, laserDps: 15, laserRange: 220, burn: 4, vision: 1000 },
  scanner: { name: "Scanner", art: ["scanner", "tractor"],  hold: 6,  tank: 120, speed: 85, laserDps: 5, laserRange: 180, burn: 4,
             scanTime: 0.35, scanRange: 600, vision: 1500,
             towRange: 250, towBurn: 6, towPull: 2.5, towLeash: 12 },   // towing: fuel a minute x (1 + rock radius / 60)
  booster: { name: "Booster", art: ["command"],             hold: 6,  tank: 140, speed: 85, laserDps: 5, laserRange: 180, boost: 1.6, boostRange: 350, burn: 4, vision: 1000 },
  fueler:  { name: "Fueler",  art: ["fueler"],              hold: 6,  tank: 700, speed: 75, laserDps: 5, laserRange: 180, burn: 4, pump: 20, pumpRange: 200, vision: 1000 },
  hauler:  { name: "Hauler",  art: ["refinery", "hauler"],  hold: 60, tank: 160, speed: 70, laserDps: 5, laserRange: 180, burn: 4, refineUnit: 5, vision: 1000 },   // refines a raw unit every refineUnit s while undocked
};
export const SHIP_KINDS = Object.keys(SHIPS);
// shared flying numbers (every hull)
export const FLY = { accel: 45, brake: 30, turn: 2.4, crawl: 0.2, flyBurn: 6, interactR: 200, shipR: 24 };

// ---- the asteroid: masonry around a core (the document's prototype numbers) ----
export const CHUNK = {
  burst: 0.25,              // breaking a chunk shocks every touching chunk for this share of its max health; chains cascade
  hpK: 0.11,                // health = chunk area (m^2) x this x density (chunks got bigger with the 2026-10-18 rocks)
  wSoft: 14, wNormal: 46, wDense: 18, wUltra: 8, wBed: 14,   // density weights, %
  soft: 0.55, dense: 2.3, ultra: 4,               // health x (normal is 1; bedrock never breaks)
  denseOre: 1, ultraOre: 2, // extra ore units in a dense / ultra ore chunk (base is 1)
  barren: 0.5,              // share of breakable chunks with no ore
};
// rock sizes (owner, 2026-10-18: bigger, varied by shells and size): chunks on average, shells of masonry (plus tower
// splits: up to ~14 deep at one angle on a large rock), the rock's radius, core radius, the core's rare ore at full
// strip, core health, how many ore types
export const ROCKS = [
  { name: "Small",  chunks: 60,  shells: 6,  radius: 90,  coreR: 12, rareMax: 8,  coreHp: 260, oreTypes: 1 },
  { name: "Medium", chunks: 80,  shells: 9,  radius: 130, coreR: 16, rareMax: 16, coreHp: 400, oreTypes: 2 },
  { name: "Large",  chunks: 100, shells: 12, radius: 175, coreR: 20, rareMax: 22, coreHp: 560, oreTypes: 3 },
];
export const CORE = { grow: 0.5, fastBreak: 4, rarePrice: 50 };   // swells up to +50% full; breaks up to x4 faster full; the rare ore's price
export const ROCK = { linger: 1800, respawn: 45, reseed: 6 * 3600, spawnChance: 0.6 };   // s: a part-mined rock lasts after its last touch; a popped slot re-rolls elsewhere; seeds rotate; share of cells with a rock
// which rings hold which sizes (indexes into ROCKS) and which ores (rarer outward)
export const RING_SIZES = [[0, 1], [1, 2]];
export const RING_ORES = [["iron", "ice", "titanium"], ["titanium", "cobalt", "platinum"]];

// ores: credits a unit, delivered
export const ORES = {
  iron: { name: "Iron", price: 10, color: "#aab3c2" },
  ice: { name: "Ice", price: 14, color: "#9fdcef" },
  titanium: { name: "Titanium", price: 20, color: "#e3ddc9" },
  cobalt: { name: "Cobalt", price: 30, color: "#6f8fe0" },
  platinum: { name: "Platinum", price: 60, color: "#b98cf0" },
  core: { name: "Core", price: 50, color: "#e89a3c" },           // the core's rare ore
};
export const REFINED_SPACE = 0.2;              // a refined unit's share of a raw unit's hold room (the hauler compresses en route)

// ---- cans and crates (where overflow ore goes) ----
export const CANS = { lock: 1800, public: 900 };   // s a can stays locked to its owner, then public before it's gone
export const CRATE_SHARE = [0.05, 0.5];        // the unlock slider: the share a deliverer outside the party keeps
export const DOWNTIME = { hourUTC: 9, logoffGuard: 1800 };   // party crates auto-deliver daily, except aboard ships logged off this close before it

export const FUEL = { stationPrice: 0.4 };     // credits a unit at the station
export const ECON = { startCredits: 200, startFuel: 100, dockR: 220 };
export const START = { ship: "miner" };
export const SERVICES = { maxRate: 50, range: 600 };   // cr/s a support ship may charge strangers; how near the payer must be
export const SECTORS = ["N", "E", "S", "W"], SECTOR_NAMES = { N: "North", E: "East", S: "South", W: "West" };
export const LIMITS = { partyMax: 10 };
