// (owner, 2026-10-18) Every number of the mining redesign, from the design document "Crack, Bank and Haul" (draft 9,
// docs/Atamus_Ring_Mining.html). Numbers the document gives are used as given; the rest are placeholders meant to change
// (the developer panel edits all of them live). Units: m, m/s, seconds, credits. The plane: x east, y south (screen
// down); north is -y. Saturn is at (0, 0).

export const WORLD = {
  saturnR: 1200,            // the planet: nothing flies inside it
  station: [0, -1900],      // the one station, north of the planet
  safeR: 2600,              // around Saturn and the station, outside any sector
  rings: [[3000, 9000], [12000, 18000], [21000, 28000]],  // the rings (inner, outer radius); ring 3 (owner, 2026-10-18)
  lockedR: 29000,           // the red dashed line: nobody flies past it
  cell: 700,                // the asteroid grid: one seeded rock slot per cell
  loadR: 3200,              // the hard cap on what a player can ever be sent
};

// (owner, 2026-10-18) each role is its own ship: the old hull with that module's section is how it looks and behaves.
// Every ship has a light laser (the Miner's is the strong one). The Scanner is the core driller (its drill surveys a
// straight line to the core) and also tows (the old tractor). The Hauler has the refinery aboard. The Booster speeds up
// one player's mining at a time, and boosted lasers (or a Booster's own, slowly) are the only thing that cuts bedrock
// cleanly. vision: the fog of war (the Scanner sees furthest).
// (owner, 2026-10-18) ore counts in 100-unit drops now, so holds are a hundred times the old sizes
export const SHIPS = {
  miner:   { name: "Miner",   art: ["miner"],               hold: 1200, tank: 100, speed: 80, laserDps: 15, laserRange: 220, burn: 4, vision: 1000 },
  scanner: { name: "Scanner", art: ["scanner", "tractor"],  hold: 600,  tank: 120, speed: 85, laserDps: 5, laserRange: 180, burn: 4,
             drillSpeed: 9, drillBed: 0.2, drillShock: 0.08, drillRange: 250, vision: 1500,   // the drill: m/s into the rock; x through bedrock; collateral a second on chunks touching drilled bedrock; working reach
             towRange: 250, towBurn: 6, towPull: 2.5, towLeash: 12 },   // towing: fuel a minute x (1 + rock radius / 60)
  booster: { name: "Booster", art: ["command"],             hold: 600,  tank: 140, speed: 85, laserDps: 5, laserRange: 180, burn: 4,
             boost: 1.6, boostRange: 350, boostDur: 8, boostCd: 20, boostFuel: 15, vision: 1000 },   // the pulse: everyone nearby boosted for boostDur s; boostCd s between; fuel per press
  fueler:  { name: "Fueler",  art: ["fueler"],              hold: 600,  tank: 700, speed: 75, laserDps: 5, laserRange: 180, burn: 4, pump: 20, pumpRange: 200, vision: 1000 },
  hauler:  { name: "Hauler",  art: ["refinery", "hauler"],  hold: 6000, tank: 160, speed: 70, laserDps: 5, laserRange: 180, burn: 4, refineUnit: 5, vision: 1000 },   // refines a 100-unit block every refineUnit s while undocked
};
export const SHIP_KINDS = Object.keys(SHIPS);
// shared flying numbers (every hull)
export const FLY = { accel: 45, brake: 30, turn: 2.4, crawl: 0.2, flyBurn: 6, interactR: 200, shipR: 24 };

// ---- the asteroid: masonry around a core (the document's prototype numbers) ----
export const CHUNK = {
  burst: 0.25,              // breaking a chunk shocks every touching chunk for this share of its max health; chains cascade
  hpK: 0.11,                // health = chunk area (m^2) x this x density (chunks got bigger with the 2026-10-18 rocks)
  wSoft: 14, wNormal: 46, wDense: 18, wUltra: 8, wBed: 14,   // density weights, %
  soft: 0.55, dense: 2.3, ultra: 4, bed: 5,       // health x (normal is 1; bedrock only breaks for boosted lasers)
  oreUnit: 100,             // (owner, 2026-10-18) units in one ore drop: splits land on clean percents
  denseOre: 100, ultraOre: 200, // extra ore units in a dense / ultra ore chunk (base is oreUnit)
  bedOre: 200,              // (owner, 2026-10-18) bedrock is rich: always ore, base + this — but only a boosted laser banks it
  barren: 0.5,              // share of breakable chunks with no ore
};
// rock sizes (owner, 2026-10-18: bigger, varied by shells and size): chunks on average, shells of masonry (plus tower
// splits: up to ~14 deep at one angle on a large rock), the rock's radius, core radius, the core's rare ore at full
// strip, core health, how many ore types
export const ROCKS = [
  { name: "Small",  chunks: 60,  shells: 6,  radius: 90,  coreR: 12, rareMax: 800,  coreHp: 260, oreTypes: 1 },
  { name: "Medium", chunks: 80,  shells: 9,  radius: 130, coreR: 16, rareMax: 1600, coreHp: 400, oreTypes: 2 },
  { name: "Large",  chunks: 100, shells: 12, radius: 175, coreR: 20, rareMax: 2200, coreHp: 560, oreTypes: 3 },
];
export const CORE = { grow: 0.5, fastBreak: 4 };   // swells up to +50% full of ore; breaks up to x4 faster fully overheated
// (owner, 2026-10-18) heat: mined chunks run orange and leak heat to their neighbors; a chunk's heat at the moment it
// breaks pours into the core. A hot core mines faster — and an overheated one burns down and pops early, shattering
// everything still attached. Miners manage it by rotating chunks; the Booster's coolant beam sheds it.
export const HEAT = {
  rate: 0.09,               // heat a second the mined chunk gains (x its density's heat factor; a boosted laser heats x its boost)
  hSoft: 1, hNormal: 1, hDense: 1.6, hUltra: 2.2, hBed: 3,   // heat factor per density (denser and bedrock run hotter)
  spread: 0.3,              // share of the mined chunk's heating that leaks to each touching chunk
  cool: 0.02,               // heat a second a chunk sheds on its own
  coreCool: 0.008,          // heat a second the core sheds
  coreK: 0.25,              // core heat gained per chunk broken, x the chunk's heat at the break
  burn: 0.05,               // share of core health burned a second while the core is overheated (heat at 1)
  coolBeam: 0.3,            // heat a second the Booster's coolant beam pulls out of a chunk (or the core, down a bore)
};
export const ROCK = { linger: 1800, respawn: 45, reseed: 6 * 3600, spawnChance: 0.6 };   // s: a part-mined rock lasts after its last touch; a popped slot re-rolls elsewhere; seeds rotate; share of cells with a rock
// which rings hold which sizes (indexes into ROCKS) and which ores (rarer outward); per-ring bedrock weight x, rock
// chance x, and whether a bedrock-free line to the core is guaranteed (owner, 2026-10-18: ring 3's cores can roll
// bedrock-encapsulated, and its bedrock-heavy rocks need boosters or a driller to fully mine)
export const RING_SIZES = [[0, 1], [1, 2], [2, 2]];
export const RING_ORES = [["iron", "ice", "titanium"], ["titanium", "cobalt", "platinum"], ["cobalt", "platinum"]];
export const RING_BED = [1, 1.6, 2.4];
export const RING_SPAWN = [1, 1, 0.7];
export const RING_FREELINE = [1, 1, 0];

// ores. Delivery splits the ore itself between the tagged players (owner, 2026-10-18: no automatic exchange for money);
// price is what the station pays per unit when a player chooses to sell from storage (a 100-unit drop is worth the old
// one-unit price).
export const ORES = {
  iron: { name: "Iron", price: 0.1, color: "#aab3c2" },
  ice: { name: "Ice", price: 0.14, color: "#9fdcef" },
  titanium: { name: "Titanium", price: 0.2, color: "#e3ddc9" },
  cobalt: { name: "Cobalt", price: 0.3, color: "#6f8fe0" },
  platinum: { name: "Platinum", price: 0.6, color: "#b98cf0" },
  core: { name: "Core", price: 0.5, color: "#e89a3c" },           // the core's rare ore
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
