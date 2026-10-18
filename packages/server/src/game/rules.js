// (owner, 2026-10-16: the Saturn ring-mining prototype) Every fixed number of the game, from the design document's "First
// numbers" (all meant to change once we play). Sent to every client in the hello. Units: m, m/s, seconds, credits.
// The plane: x east, y south (screen down); north is -y. Saturn is at (0, 0).

// (owner, 2026-10-17) the world's shape is editable from the developer panel too, except the station's place
export const WORLD = {
  saturnR: 1200,            // the planet: nothing flies inside it
  station: [0, -1900],      // the one station, north of the planet
  safeR: 2600,              // around Saturn and the station every sector is open
  rings: [[3000, 9000], [12000, 18000]],  // ring 1 and ring 2 (inner, outer radius; owner, 2026-10-17: both 6 km wide)
  lockedR: 19000,           // the red dashed line: nobody flies past it
  cell: 400,                // the asteroid grid (seeded per cell)
  loadR: 3200,              // what each player is sent
};

// (owner, 2026-10-17) everything below the world's shape can be changed live from the developer panel (devpanel.js): the
// groups are plain objects whose numbers are edited in place, and the changes are kept in the database (ring_tuning)
// (owner, 2026-10-17) every number a ship flies with belongs to its hull: each size up costs four times the last, adds a
// module slot, and can be tuned on its own
const HULL_BASE = { hold: 5, tank: 100, speed: 80, accel: 45, brake: 30, turn: 2.4, crawl: 0.2, flyBurn: 6, laserDps: 10, interactR: 200, vision: 1000, shipR: 24 };
// hold, tank (units); speed m/s, accel / brake m/s^2, turn rad/s; crawl: speed share with an empty tank; flyBurn: fuel a
// minute at full thrust; laserDps: the free laser; interactR: the reach for the laser, claiming ore and trading (the
// dotted circle); vision: how far the ship sees (owner, 2026-10-17: the fog; a fitted scanner's reach extends it); shipR: bumping

// (owner, 2026-10-16) every price but the ores' starts at 20% for prototype testing
export const PRICE_SCALE = 0.2;
const $p = (n) => Math.round(n * PRICE_SCALE);
export const HULLS = [
  { name: "Basic", price: $p(0), slots: 1, ...HULL_BASE },
  { name: "Small", price: $p(2500), slots: 2, ...HULL_BASE },
  { name: "Medium", price: $p(10000), slots: 3, ...HULL_BASE },
  { name: "Large", price: $p(40000), slots: 4, ...HULL_BASE },
];
// the modules (owner, 2026-10-17): every number is per level, Mk I to IV. price: buying it (Mk I), then each upgrade;
// speed: the ship's speed x while it's fitted. Active ones burn fuel while working.
const L4 = (v) => [v, v, v, v];
const up = (n) => [$p(n), $p(n * 0.6), $p(n * 1.2), $p(n * 2.4)];
export const MODULES = {
  // the big laser: damage a second, fuel a minute while firing, its reach, ore units each crack it breaks drops
  miner:    { name: "Miner",    active: true, price: up(500),  speed: L4(1), laserDps: [40, 50, 62, 78], burn: L4(4), range: L4(200), yield: L4(1) },
  // hold; tradeRange: how near a ship must be to trade it cargo
  hauler:   { name: "Hauler",   price: up(800),  speed: L4(1), hold: [40, 55, 70, 90], tradeRange: L4(200) },
  // pumps a second within its reach; the world pays it per unit pumped
  fueler:   { name: "Fueler",   price: up(800),  speed: L4(1), tank: [700, 900, 1100, 1400], pump: [20, 25, 30, 40], range: L4(200), pay: L4(2.5) },
  // ships within reach mine boost x faster and fly speedBoost x faster; fuel a minute while on
  command:  { name: "Command",  active: true, price: up(1200), speed: L4(1), boost: [1.5, 1.6, 1.75, 1.9], speedBoost: L4(1), radius: [300, 350, 400, 450], burn: L4(4) },
  // latch reach; tow: speed x; fuel a minute towing x (1 + size x sizeBurn); pull: how fast the rock follows (a second);
  // leash: m between the claws and the rock
  tractor:  { name: "Tractor",  active: true, price: up(1000), speed: L4(1), range: [200, 250, 300, 350], tow: [1, 1.1, 1.2, 1.35], burn: L4(6), sizeBurn: L4(0.067), pull: L4(2.5), leash: L4(12), maxSize: L4(15) },
  // scan reach, seconds a scan takes (staying in reach) and fuel a scan
  scanner:  { name: "Scanner",  price: up(1000), speed: L4(1), range: [800, 1000, 1200, 1500], scanTime: [2, 1.5, 1, 0.6], fuel: L4(0) },
  // (owner, 2026-10-17) switched on, it offers to refine the holds of ships within its reach: seconds a unit, in their hold,
  // adding the refiner's name; fuel once each time someone takes it up
  refinery: { name: "Refinery", active: true, price: up(1500), speed: L4(1), unit: L4(1), activation: [10, 8, 6, 4], range: L4(200), targets: [3, 4, 6, 8] },   // targets: ships refined at once
};
export const MODULE_KINDS = Object.keys(MODULES);

// ores (owner, 2026-10-17: each with its own numbers): price raw; refinedPrice; refineTime: s a unit at the station;
// refinedSpace: the room a refined unit takes (a fifth: five to a hold square); hardness: crack health x.
// (owner, 2026-10-16) ice keeps its name; the others are Greek letters, rarer down the alphabet. The keys are the old
// names, kept because players' storage is saved under them.
const ore = (name, price, color) => ({ name, color, price, refinedPrice: price * 1.5, refineTime: 60, refinedSpace: 0.2, hardness: 1 });
export const ORES = {
  iron: ore("Alpha", 10, "#86c06a"),
  nickel: ore("Beta", 14, "#e3913f"),
  ice: ore("Ice", 30, "#9fdcef"),
  titanium: ore("Gamma", 30, "#de5b52"),
  cobalt: ore("Delta", 40, "#a983e0"),
  platinum: ore("Epsilon", 100, "#f0cf63"),
};
// which ores each ring holds (weights) and its asteroid sizes; 15 sizes, size n has n cracks
// (owner, 2026-10-17) every ring weighs every ore (0: none of it), so a ring can be made all one ore
export const RING_ORES = [{ iron: 45, nickel: 35, ice: 20, titanium: 0, cobalt: 0, platinum: 0 }, { iron: 4, nickel: 0, ice: 14, titanium: 42, cobalt: 32, platinum: 8 }];
export const RING_SIZES = [[1, 10], [4, 15]];
export const RING_SLOTS = [3, 2];          // asteroid slots per cell
// asteroids: where a crack's ore lands (m past the edge, plus up to spread), radius and crack health by size, tow speed by size (s: a mined-out slot comes back; untouched despawns; seeds rotate)
export const ROCK = { dropGap: 10, dropSpread: 14, radiusBase: 10, radiusPer: 3.3, crackHpBase: 80, crackHpPer: 8, towBase: 0.6, towPer: 0.025, respawn: 180, despawn: 1800, reseed: 6 * 3600 };
export const rockR = (n) => ROCK.radiusBase + ROCK.radiusPer * n;   // m
export const crackHp = (n) => ROCK.crackHpBase + ROCK.crackHpPer * n;
export const towFactor = (n) => Math.max(0.05, ROCK.towBase - (n - 1) * ROCK.towPer);   // tow speed share: size 1 0.6 ... size 15 0.25

export const FUEL = { stationPrice: 2 * PRICE_SCALE, blockFuel: 25, blockTime: 15 };   // a fuel block (one ice) is 25 fuel, 15 s at the station
export const ECON = {
  startCredits: 200, startFuel: 100,
  dockR: 220,                              // m: inside this a ship is docked at the station
  tradeWait: 30,                           // s a hauler has to answer a trade request
  partyInvite: 120, corpInvite: 300,       // s an invite waits for an answer
  offlineGrace: 1800,                      // s after logging off before a carrier's ore crawls home
  despawnOre: 1800,                        // s loose ore lies untouched before it's gone
};
export const START = { module: "miner" };
export const SECTORS = ["N", "E", "S", "W"], SECTOR_NAMES = { N: "North", E: "East", S: "South", W: "West" };
// (owner, 2026-10-16) all four sectors are always open. Shards: a zone holds 40 players per copy (RING_SHARD_CAP
// overrides it for local tests)
export const LIMITS = { shardCap: +process.env.RING_SHARD_CAP || 40, partyMax: 10 };
