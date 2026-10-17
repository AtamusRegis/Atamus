// (owner, 2026-10-16: the Saturn ring-mining prototype) Every fixed number of the game, from the design document's "First
// numbers" (all meant to change once we play). Sent to every client in the hello. Units: m, m/s, seconds, credits.
// The plane: x east, y south (screen down); north is -y. Saturn is at (0, 0).

export const WORLD = {
  saturnR: 1200,            // the planet: nothing flies inside it
  station: [0, -1900],      // the one station, north of the planet
  dockR: 220,               // inside this a ship is docked: its hold is delivered, the station panel opens
  safeR: 2600,              // around Saturn and the station every sector is open
  rings: [[3000, 6000], [9000, 14000]],   // ring 1 and ring 2 (inner, outer radius)
  lockedR: 15000,           // the red dashed line: nobody flies past it
  cell: 400,                // the asteroid grid (seeded per cell)
  loadR: 3200,              // what each player is sent
};

export const SHIP = {
  hold: 5, tank: 100,
  speed: 80, accel: 45, brake: 30, turn: 2.4,   // m/s, m/s^2, m/s^2 when coasting, rad/s
  crawl: 0.2,               // speed and thrust share with an empty tank
  flyBurn: 6,               // fuel a minute at full thrust
  laserDps: 10, laserRange: 170,
  claimR: 200,              // loose ore is claimed by clicking it from within this
  shipR: 24,                // for bumping into asteroids
};

// (owner, 2026-10-16) every price but the ores' is 20% for prototype testing: set back to 1 to restore
export const PRICE_SCALE = 0.2;
const $p = (n) => Math.round(n * PRICE_SCALE);
// the modules: the station sells each at its basic level, then three upgrades (Mk II-IV; owner, 2026-10-16). A number
// given as a list is per level. Active ones burn fuel while working.
export const MODULES = {
  miner:    { name: "Miner",    price: $p(500),  active: true, burn: 4, laserDps: [40, 50, 62, 78] },                    // the big laser (fuel a minute while firing)
  hauler:   { name: "Hauler",   price: $p(800),  hold: [40, 55, 70, 90] },
  fueler:   { name: "Fueler",   price: $p(800),  tank: [700, 900, 1100, 1400], pump: [20, 25, 30, 40], range: 150 },   // pumps a second
  command:  { name: "Command",  price: $p(1200), active: true, burn: 4, boost: [1.5, 1.6, 1.75, 1.9], radius: [300, 350, 400, 450] },
  tractor:  { name: "Tractor",  price: $p(1000), active: true, burn: 6, range: [200, 250, 300, 350], tow: [1, 1.1, 1.2, 1.35] },   // burn x (1 + size / 15) while towing; tow: speed x
  scanner:  { name: "Scanner",  price: $p(1000), range: [800, 1000, 1200, 1500] },
  refinery: { name: "Refinery", price: $p(1500), active: true, burn: 2, unit: [15, 12, 10, 8], range: 150 },           // s and fuel a unit
};
export const UPGRADE_COST = [0.6, 1.2, 2.4];   // Mk II, III, IV: x the module's price
// hulls: each size up costs four times the last and adds a module slot (owner, 2026-10-16)
export const HULLS = [{ name: "Basic", slots: 1, price: $p(0) }, { name: "Small", slots: 2, price: $p(2500) }, { name: "Medium", slots: 3, price: $p(10000) }, { name: "Large", slots: 4, price: $p(40000) }];
export const MODULE_KINDS = Object.keys(MODULES);
export const towFactor = (n) => 0.6 - (n - 1) * 0.025;   // tow speed share: size 1 0.6 ... size 15 0.25

// ores: raw station price; refined sells for 1.5x and takes a fifth of the space
// (owner, 2026-10-16) ice keeps its name; the others are Greek letters, rarer down the alphabet. The keys are the old
// names, kept because players' storage is saved under them.
export const ORES = {
  iron: { name: "Alpha", price: 10, color: "#86c06a" },
  nickel: { name: "Beta", price: 14, color: "#e3913f" },
  ice: { name: "Ice", price: 30, color: "#9fdcef" },
  titanium: { name: "Gamma", price: 30, color: "#de5b52" },
  cobalt: { name: "Delta", price: 40, color: "#a983e0" },
  platinum: { name: "Epsilon", price: 100, color: "#f0cf63" },
};
export const REFINED_MUL = 1.5, REFINED_SPACE = 0.2;
// which ores each ring holds (weights) and its asteroid sizes; 15 sizes, size n has n cracks
export const RING_ORES = [{ iron: 45, nickel: 35, ice: 20 }, { titanium: 42, cobalt: 32, ice: 14, platinum: 8, iron: 4 }];
export const RING_SIZES = [[1, 10], [4, 15]];
export const RING_SLOTS = [3, 2];          // asteroid slots per cell
export const rockR = (n) => 10 + 3.3 * n;  // m
export const crackHp = (n) => 80 + 8 * n;  // health of each crack
export const ROCK = { respawn: 180, despawn: 1800, reseed: 6 * 3600 };   // s: a mined-out slot comes back; untouched despawns; seeds rotate

export const FUEL = { stationPrice: 2 * PRICE_SCALE, pumpPay: 2.5, blockFuel: 25, blockTime: 15 };   // a fuel block (one ice) is 25 fuel, 15 s at the station
export const STATION_REFINE = 60;          // s a unit, free, keeps going while you're away
export const START = { credits: 200, fuel: 100, module: "miner" };
export const SECTORS = ["N", "E", "S", "W"], SECTOR_NAMES = { N: "North", E: "East", S: "South", W: "West" };
// (owner, 2026-10-16) all four sectors are always open. Shards: a zone holds 40 players per copy (RING_SHARD_CAP
// overrides it for local tests)
export const SHARD_CAP = +process.env.RING_SHARD_CAP || 40;
export const PARTY_MAX = 10;
export const TRADE_R = 150, TRADE_WAIT = 30;     // m between a ship and the hauler it asks to take its cargo; s the hauler has to answer
export const OFFLINE_GRACE = 1800;         // s after logging off before a carrier's ore crawls home
export const DESPAWN_ORE = 1800;           // loose ore untouched
