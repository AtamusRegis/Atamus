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
  pickupR: 50,              // loose ore within this flies into the hold (if it fits)
  shipR: 24,                // for bumping into asteroids
};

// the modules (the station sells each at its basic level); active ones burn fuel while working
export const MODULES = {
  miner:    { name: "Miner",    price: 500,  active: true,  laserDps: 40, burn: 4 },                  // the big laser (fuel a minute while firing)
  hauler:   { name: "Hauler",   price: 800,  hold: 40 },
  fueler:   { name: "Fueler",   price: 800,  tank: 700, pump: 20, range: 150 },                     // pumps 20 a second
  command:  { name: "Command",  price: 1200, active: true, boost: 1.5, radius: 300, burn: 4 },       // mining speed for ships in range
  tractor:  { name: "Tractor",  price: 1000, active: true, range: 200, burn: 6 },                     // burn x (1 + size / 15) while towing
  scanner:  { name: "Scanner",  price: 1000, range: 800 },
  refinery: { name: "Refinery", price: 1500, active: true, unit: 15, burn: 2, range: 150 },           // 15 s and 2 fuel a unit
};
export const MODULE_KINDS = Object.keys(MODULES);
export const towFactor = (n) => 0.6 - (n - 1) * 0.025;   // tow speed share: size 1 0.6 ... size 15 0.25

// ores: raw station price; refined sells for 1.5x and takes a fifth of the space
export const ORES = {
  iron: { name: "Iron", price: 10, color: "#9c6b56" },
  nickel: { name: "Nickel", price: 14, color: "#8f9a86" },
  ice: { name: "Ice", price: 30, color: "#cfe9f3" },
  titanium: { name: "Titanium", price: 30, color: "#b9c0cc" },
  cobalt: { name: "Cobalt", price: 40, color: "#4f74c9" },
  platinum: { name: "Platinum", price: 100, color: "#e9e3d2" },
};
export const REFINED_MUL = 1.5, REFINED_SPACE = 0.2;
// which ores each ring holds (weights) and its asteroid sizes; 15 sizes, size n has n cracks
export const RING_ORES = [{ iron: 45, nickel: 35, ice: 20 }, { titanium: 42, cobalt: 32, ice: 14, platinum: 8, iron: 4 }];
export const RING_SIZES = [[1, 10], [4, 15]];
export const RING_SLOTS = [3, 2];          // asteroid slots per cell
export const rockR = (n) => 10 + 3.3 * n;  // m
export const crackHp = (n) => 80 + 8 * n;  // health of each crack
export const ROCK = { respawn: 180, despawn: 1800, reseed: 6 * 3600 };   // s: a mined-out slot comes back; untouched despawns; seeds rotate

export const FUEL = { stationPrice: 2, pumpPay: 2.5, blockFuel: 25, blockTime: 15 };   // a fuel block (one ice) is 25 fuel, 15 s at the station
export const STATION_REFINE = 60;          // s a unit, free, keeps going while you're away
export const START = { credits: 200, fuel: 100, module: "miner" };
export const SECTORS = ["N", "E", "S", "W"], SECTOR_NAMES = { N: "North", E: "East", S: "South", W: "West" };
// one more sector per 50 online; a closing sector waits 10 min. Shards: once all four sectors are open, a zone holds 40
// players per copy (RING_SECTOR_EVERY / RING_SHARD_CAP override the two for local tests)
export const SECTOR_EVERY = +process.env.RING_SECTOR_EVERY || 50, SECTOR_CLOSE_WAIT = 600;
export const SHARD_CAP = +process.env.RING_SHARD_CAP || 40;
export const PARTY_MAX = 10;
export const OFFLINE_GRACE = 1800;         // s after logging off before a carrier's ore crawls home
export const DESPAWN_ORE = 1800;           // loose ore untouched
