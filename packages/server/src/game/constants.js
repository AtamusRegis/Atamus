// Tunable constants for the tech-demo simulation. Distances in km, times in ms.

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
export const SNAPSHOT_HZ = 15;
export const SNAPSHOT_MS = 1000 / SNAPSHOT_HZ;

// Each system is a honeycomb of flat-top hex cells, measured flat-to-flat.
export const CELL_FLAT_TO_FLAT_KM = 200;
export const CELL_APOTHEM_KM = CELL_FLAT_TO_FLAT_KM / 2;                 // 100
export const CELL_CIRCUMRADIUS_KM = CELL_APOTHEM_KM / Math.cos(Math.PI / 6); // ~115.47
export const SYSTEM_RINGS = 0;                                          // one big hexagon, 200 km wide
export const CELL_CORNER_ROUND_KM = 5;

// ---- RTS ship movement ----
export const SHIP_ARRIVE_EPS_KM = 0.04;  // "arrived" when this close to the target
export const SHIP_SLOW_RADIUS_KM = 0.6;  // start easing to a stop within this range
export const SHIP_STEER = 9;             // velocity-approach rate (1/s), dt-smoothed
export const WARP_MULT = 20;             // prototype warp: x speed until arrival
export const DOCK_RADIUS_KM = 4;         // inside this of the station: dock / anchored
export const LASER_M3_PER_S = 2;         // mining laser yield (per laser), delivered at the end of each cycle
export const MINING_CYCLE_MS = 15_000;   // one laser cycle; the ore lands when the cycle completes
export const LASER_RANGE_KM = 5;         // a laser needs its rock within this
export const AUTO_MINER_BASE_MS = 180_000, AUTO_MINER_STEP_MS = 30_000; // auto-miner cycle: 3:00, -30 s per license level
export const STATION_HANGAR_M3 = 10_000_000;
// Hulls (stats from the Expanse design doc). radius drives spacing/collision; mass (1e6 kg)
// drives who pushes whom. hardpoints: beam origins in ship lengths from the sprite centre
// (sprite faces +x); arms: which hardpoints each laser may fire from. Barges and exhumers
// fire their strip miners from the circular hopper ports along the centre line.
// req: licence levels a pilot needs to crew the hull. price: station market (credits).
const PORTS = { xs: [[0.021, 0]], s: [[-0.065, 0], [0.095, 0]], m: [[-0.107, 0], [0.016, 0], [0.148, 0]] };
const ports = (k) => ({ hardpoints: PORTS[k], arms: [PORTS[k].map((_, i) => i), PORTS[k].map((_, i) => i)] });
export const SHIP_TYPES = {
  chisel: {
    name: "Prospector", cls: "Mining Frigate", sprite: "chisel", lengthKm: 0.128, speedKmps: 0.335, radiusKm: 0.09, mass: 1.2, hp: 200, shield: 225,
    cargoM3: 50, oreM3: 5000, targetRangeKm: 15, maxTargets: 5, lockMs: 3000, lasers: 2, laserM3s: 2,
    hardpoints: [[0.338, -0.184], [0.47, -0.14], [0.338, 0.184], [0.47, 0.14]], arms: [[0, 1], [2, 3]],
    req: { mining_frigate: 1 }, price: 350_000,
    desc: "Deep Core Industries' entry-level mining frigate: small, nimble, with a modest ore hold. Every mining career starts in one.",
  },
  dragline: {
    name: "Dredger", cls: "Mining Barge", sprite: "barge_s", lengthKm: 0.375, speedKmps: 0.150, radiusKm: 0.16, mass: 15, hp: 3000, shield: 3000,
    cargoM3: 350, oreM3: 9000, targetRangeKm: 40, maxTargets: 6, lockMs: 5000, lasers: 2, laserM3s: 9, ...ports("s"),
    req: { barges: 3 }, price: 18_000_000,
    desc: "The yield barge. Strip miners, a thin hull and the best tons per hour in the barge line.",
  },
  bedrock: {
    name: "Bulwark", cls: "Mining Barge", sprite: "barge_xs", lengthKm: 0.305, speedKmps: 0.100, radiusKm: 0.13, mass: 20, hp: 6000, shield: 6000,
    cargoM3: 350, oreM3: 16000, targetRangeKm: 60, maxTargets: 6, lockMs: 5000, lasers: 2, laserM3s: 6, ...ports("xs"),
    req: { barges: 3 }, price: 20_000_000,
    desc: "The tough barge. Less yield than a Dredger, but shields and hull that can sit through a pirate's opening volley.",
  },
  hopper: {
    name: "Collier", cls: "Mining Barge", sprite: "barge_m", lengthKm: 0.411, speedKmps: 0.125, radiusKm: 0.17, mass: 17.5, hp: 4000, shield: 4000,
    cargoM3: 450, oreM3: 27500, targetRangeKm: 40, maxTargets: 6, lockMs: 5000, lasers: 2, laserM3s: 7.5, ...ports("m"),
    req: { barges: 3 }, price: 22_000_000,
    desc: "The long-haul barge. A huge ore hold lets a Collier pilot mine alone for hours without a hauler.",
  },
  bucketwheel: {
    name: "Excavator", cls: "Exhumer", sprite: "exhumer_s", lengthKm: 0.375, speedKmps: 0.160, radiusKm: 0.16, mass: 15, hp: 4500, shield: 4500,
    cargoM3: 350, oreM3: 11500, targetRangeKm: 55, maxTargets: 8, lockMs: 5000, lasers: 2, laserM3s: 12, ...ports("s"),
    req: { exumers: 3 }, price: 85_000_000,
    desc: "The Dredger's exhumer: the highest yield in the Deep Core line and the softest target in any belt.",
  },
  keystone: {
    name: "Rampart", cls: "Exhumer", sprite: "exhumer_xs", lengthKm: 0.305, speedKmps: 0.110, radiusKm: 0.13, mass: 20, hp: 6500, shield: 6500,
    cargoM3: 350, oreM3: 18500, targetRangeKm: 67.5, maxTargets: 8, lockMs: 5000, lasers: 2, laserM3s: 8, ...ports("xs"),
    req: { exumers: 3 }, price: 90_000_000,
    desc: "The Bulwark's exhumer. Heavily tanked with a thick shield; it outlasts a pirate cruiser until help arrives.",
  },
  silo: {
    name: "Carrack", cls: "Exhumer", sprite: "exhumer_m", lengthKm: 0.411, speedKmps: 0.130, radiusKm: 0.17, mass: 17.5, hp: 5500, shield: 5500,
    cargoM3: 450, oreM3: 31500, targetRangeKm: 45, maxTargets: 8, lockMs: 5000, lasers: 2, laserM3s: 10, ...ports("m"),
    req: { exumers: 3 }, price: 95_000_000,
    desc: "The Collier's exhumer. An ore hold big enough to swallow a small asteroid, built for long shifts far from the station.",
  },
};
// Fitting: hardpoints = how many modules fit, disposition = their total size, capacitor = shared power
// for running them; accepts = module categories this hull can fit. (`hardpoints` above are beam origins.)
const FIT = {
  "Mining Frigate": { fitSlots: 5, disposition: 50, capacitor: 30 },
  "Mining Barge": { fitSlots: 6, disposition: 90, capacitor: 60 },
  "Exhumer": { fitSlots: 7, disposition: 120, capacitor: 90 },
};
for (const t of Object.values(SHIP_TYPES)) Object.assign(t, FIT[t.cls] || FIT["Mining Frigate"], { accepts: ["mining", "automation", "power"] });
export const MODULE_CATEGORIES = { mining: "Mining", automation: "Automation", power: "Power" };
export const SHIP_CLASSES = ["Mining Frigate", "Mining Barge", "Exhumer"];
// What each class is for (the market groups hulls by this, then by class).
export const SHIP_ROLES = ["Industry", "Combat"];
const CLASS_ROLE = { "Mining Frigate": "Industry", "Mining Barge": "Industry", "Exhumer": "Industry" };
for (const t of Object.values(SHIP_TYPES)) t.role = CLASS_ROLE[t.cls] || "Industry";

// Stargates: 3 on the outer ring. They burn fuel while active.
export const FUEL_START_MS = 30 * 60 * 1000;     // fuel each gate starts with
export const FUEL_SESSION_MAX_MS = 30 * 60 * 1000; // max fuel a single activation can burn
export const HUB_MIN_WAIT_MS = 3 * 60 * 1000;    // give player-to-player links this long before trying the hub
export const HUB_SEEK_INTERVAL_MS = 4000;        // how often a searching gate tries the hub (after the wait)
export const HUB_SEEK_CHANCE = 0.4;              // chance per try to find a hub entrance
export const GATE_TRANSFER_RADIUS_KM = 4;        // a ship inside this ring can use the gate
export const ARRIVAL_OFFSET_KM = GATE_TRANSFER_RADIUS_KM + 6; // land clear of the partner gate

export const HUB_SYS = "sys:hub";
