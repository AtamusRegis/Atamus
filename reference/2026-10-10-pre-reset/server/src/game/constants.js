// Tunable constants for the tech-demo simulation. Distances in km, times in ms.

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
export const SNAPSHOT_HZ = 15;
export const SNAPSHOT_MS = 1000 / SNAPSHOT_HZ;

// ---- RTS ship movement ----
export const SHIP_ARRIVE_EPS_KM = 0.04;  // "arrived" when this close to the target
export const SHIP_SLOW_RADIUS_KM = 0.6;  // start easing to a stop within this range
export const SHIP_STEER = 9;             // velocity-approach rate (1/s), dt-smoothed
export const WARP_MULT = 20;             // warp speed = this × the hull's max speed, constant inside the warp field
export const WARP_OPEN_MS = 900;         // the warp window opens ahead of an aligned ship; it coasts into it this long
export const WARP_MIN_KM = 2;            // shorter hops than this (after aligning and braking room) just fly normally
export const WARP_EXIT_SHOW_MS = 1000;   // the exit window appears only in the last second before the ship comes out (owner)
export const WARP_STOP_MS = 900;          // out of the exit window at full warp speed, then a hard stop to dead still in this long (owner: a fast drop)
export const WARP_EXIT_FX_MS = 2000;     // the exit window and streak linger this long after the ship comes out
export const DOCK_RADIUS_KM = 4;         // inside this of the station: dock / anchored
export const LASER_M3_PER_S = 10 / 15;        // mining laser base yield (per laser), delivered at the end of each cycle; hulls add % bonuses
export const MINING_CYCLE_MS = 15_000;   // one laser cycle; the ore lands when the cycle completes
export const LASER_RANGE_KM = 1;         // a laser needs its rock within this (owner: 1 km for now)
export const AUTO_MINER_BASE_MS = 180_000, AUTO_MINER_STEP_MS = 30_000; // auto-miner cycle: 3:00, -30 s per license level
export const STATION_HANGAR_M3 = 10_000_000;
// Hulls (stats from the Expanse design doc). radius drives spacing/collision; mass (1e6 kg)
// drives who pushes whom. hardpoints: beam origins in ship lengths from the sprite centre
// (sprite faces +x); arms: which hardpoints each laser may fire from. Barges and exhumers
// fire their strip miners from the circular hopper ports along the centre line.
// req: license levels a pilot needs to crew the hull. price: station market (credits).
const PORTS = { xs: [[0.021, 0]], s: [[-0.065, 0], [0.095, 0]], m: [[-0.107, 0], [0.016, 0], [0.148, 0]] };
const ports = (k) => ({ hardpoints: PORTS[k], arms: [PORTS[k].map((_, i) => i), PORTS[k].map((_, i) => i)] });
export const SHIP_TYPES = {
  chisel: {
    name: "Prospector", cls: "Mining Frigate", sprite: "chisel", lengthKm: 0.128, speedKmps: 0.335, accelKmps2: 0.15, radiusKm: 0.09, mass: 1.2, hp: 200, shield: 225,
    cargoM3: 50, oreM3: 5000, targetRangeKm: 3, maxTargets: 5, lockMs: 3000, lasers: 2, bonuses: { "module:mining_laser": { yield: 20, range: 5 } },
    hardpoints: [[0.338, -0.184], [0.47, -0.14], [0.338, 0.184], [0.47, 0.14]], arms: [[0, 1], [2, 3]],
    req: { mining_frigate: 1 }, price: 350_000,
    desc: "Deep Core Industries' entry-level mining frigate: small, nimble, with a modest ore hold. Every mining career starts in one.",
  },
  dragline: {
    name: "Dredger", cls: "Mining Barge", sprite: "barge_s", lengthKm: 0.375, speedKmps: 0.150, accelKmps2: 0.05, radiusKm: 0.16, mass: 15, hp: 3000, shield: 3000,
    cargoM3: 350, oreM3: 9000, targetRangeKm: 8, maxTargets: 6, lockMs: 5000, lasers: 2, bonuses: { "module:mining_laser": { yield: 350, range: 10 } }, ...ports("s"),
    req: { barges: 3 }, price: 18_000_000,
    desc: "The yield barge. Strip miners, a thin hull and the best tons per hour in the barge line.",
  },
  bedrock: {
    name: "Bulwark", cls: "Mining Barge", sprite: "barge_xs", lengthKm: 0.305, speedKmps: 0.100, accelKmps2: 0.04, radiusKm: 0.13, mass: 20, hp: 6000, shield: 6000,
    cargoM3: 350, oreM3: 16000, targetRangeKm: 12, maxTargets: 6, lockMs: 5000, lasers: 2, bonuses: { "module:mining_laser": { yield: 200, range: 5 } }, ...ports("xs"),
    req: { barges: 3 }, price: 20_000_000,
    desc: "The tough barge. Less yield than a Dredger, but shields and hull that can sit through a pirate's opening volley.",
  },
  hopper: {
    name: "Collier", cls: "Mining Barge", sprite: "barge_m", lengthKm: 0.411, speedKmps: 0.125, accelKmps2: 0.045, radiusKm: 0.17, mass: 17.5, hp: 4000, shield: 4000,
    cargoM3: 450, oreM3: 27500, targetRangeKm: 8, maxTargets: 6, lockMs: 5000, lasers: 2, bonuses: { "module:mining_laser": { yield: 275, range: 10 } }, ...ports("m"),
    req: { barges: 3 }, price: 22_000_000,
    desc: "The long-haul barge. A huge ore hold lets a Collier pilot mine alone for hours without a hauler.",
  },
  bucketwheel: {
    name: "Excavator", cls: "Exhumer", sprite: "exhumer_s", lengthKm: 0.375, speedKmps: 0.160, accelKmps2: 0.055, radiusKm: 0.16, mass: 15, hp: 4500, shield: 4500,
    cargoM3: 350, oreM3: 11500, targetRangeKm: 11, maxTargets: 8, lockMs: 5000, lasers: 2, bonuses: { "module:mining_laser": { yield: 500, range: 15 } }, ...ports("s"),
    req: { exumers: 3 }, price: 85_000_000,
    desc: "The Dredger's exhumer: the highest yield in the Deep Core line and the softest target in any belt.",
  },
  keystone: {
    name: "Rampart", cls: "Exhumer", sprite: "exhumer_xs", lengthKm: 0.305, speedKmps: 0.110, accelKmps2: 0.045, radiusKm: 0.13, mass: 20, hp: 6500, shield: 6500,
    cargoM3: 350, oreM3: 18500, targetRangeKm: 13.5, maxTargets: 8, lockMs: 5000, lasers: 2, bonuses: { "module:mining_laser": { yield: 300, range: 10 } }, ...ports("xs"),
    req: { exumers: 3 }, price: 90_000_000,
    desc: "The Bulwark's exhumer. Heavily tanked with a thick shield; it outlasts a pirate cruiser until help arrives.",
  },
  silo: {
    name: "Carrack", cls: "Exhumer", sprite: "exhumer_m", lengthKm: 0.411, speedKmps: 0.130, accelKmps2: 0.05, radiusKm: 0.17, mass: 17.5, hp: 5500, shield: 5500,
    cargoM3: 450, oreM3: 31500, targetRangeKm: 9, maxTargets: 8, lockMs: 5000, lasers: 2, bonuses: { "module:mining_laser": { yield: 400, range: 15 } }, ...ports("m"),
    req: { exumers: 3 }, price: 95_000_000,
    desc: "The Collier's exhumer. An ore hold big enough to swallow a small asteroid, built for long shifts far from the station.",
  },
};
// Arks (owner): mobile bases built in ark yards on the base surface (DESIGN.md). Slow and huge, with big holds. Carrying
// ships and pilots comes later. No license needed to crew one; not sold on the market.
const ARK = (name, sprite, lengthKm, speed, oreM3, cargoM3, hp, slots) => ({ name, cls: "Ark", sprite, lengthKm, speedKmps: speed, accelKmps2: speed / 4, radiusKm: lengthKm * 0.4, mass: 200 * lengthKm * lengthKm, hp, shield: hp,
  cargoM3, oreM3, targetRangeKm: 10, maxTargets: 4, lockMs: 8000, lasers: 0, bonuses: {}, hardpoints: [[0, 0]], arms: [[0], [0]], req: {}, price: 0, fitSlots: slots, disposition: slots * 15, capacitor: slots * 15,
  desc: "A mobile base. Its holds are vast; its hangars and pilot quarters come later." });
Object.assign(SHIP_TYPES, {
  ark_mini: ARK("Light Ark", "mini_ark", 0.559, 0.08, 50_000, 10_000, 30_000, 4),
  ark_small: ARK("Heavy Ark", "small_ark", 1.532, 0.05, 250_000, 50_000, 120_000, 6),
  ark: ARK("Capital Ark", "ark", 5.646, 0.03, 1_000_000, 250_000, 500_000, 8),
});
// Fitting: hardpoints = how many modules fit, disposition = their total size, capacitor = shared power
// for running them; accepts = module categories this hull can fit. (`hardpoints` above are beam origins.)
// Per-hull balance pass (owner, 2026-10-10): hardpoints / disposition / capacitor cap a hull's realistic laser count,
// ore holds take about 20 min to fill with a typical fit (about 40 for the haul hulls), and each hull gets a role bonus.
const PROP = { "module:afterburner": { draw: -50 }, "module:microwarpdrive": { draw: -50 } }, HOLD = { "module:cargo_expansion": { bonus: 50 } };
const BALANCE = {
  chisel:      { fitSlots: 8,  disposition: 70,  capacitor: 40, oreM3: 5000,   targetRangeKm: 5, bonuses: { "module:mining_drones": { yield: 50 } } },
  dragline:    { fitSlots: 9,  disposition: 110, capacitor: 60, oreM3: 55000 },
  bedrock:     { fitSlots: 9,  disposition: 105, capacitor: 55, oreM3: 40000,  bonuses: PROP },
  hopper:      { fitSlots: 9,  disposition: 110, capacitor: 55, oreM3: 90000,  bonuses: HOLD },
  bucketwheel: { fitSlots: 10, disposition: 140, capacitor: 85, oreM3: 90000 },
  keystone:    { fitSlots: 10, disposition: 135, capacitor: 75, oreM3: 60000,  bonuses: PROP },
  silo:        { fitSlots: 10, disposition: 140, capacitor: 80, oreM3: 150000, bonuses: HOLD },
};
for (const [k, b] of Object.entries(BALANCE)) { const t = SHIP_TYPES[k]; const { bonuses, ...rest } = b; Object.assign(t, rest); if (bonuses) t.bonuses = { ...t.bonuses, ...bonuses }; }
for (const t of Object.values(SHIP_TYPES)) Object.assign(t, { accepts: ["mining", "drones", "automation", "propulsion", "upgrades", "power"] });
export const MODULE_CATEGORIES = { mining: "Mining", drones: "Drones", automation: "Automation", propulsion: "Propulsion", upgrades: "Upgrades", power: "Power" };
// Stacking penalty (owner: diminishing returns): the nth module of the same kind is this effective (EVE's curve)
export const stackPenalty = (n) => Math.exp(-((n / 2.67) ** 2));
export const SHIP_CLASSES = ["Mining Frigate", "Mining Barge", "Exhumer", "Ark"];
// What each class is for (the market groups hulls by this, then by class).
export const SHIP_ROLES = ["Industry", "Combat"];
const CLASS_ROLE = { "Mining Frigate": "Industry", "Mining Barge": "Industry", "Exhumer": "Industry", "Ark": "Industry" };
for (const t of Object.values(SHIP_TYPES)) t.role = CLASS_ROLE[t.cls] || "Industry";

export const STATION_BAY = { x: -0.155, y: -0.213 }; // the station's docking-bay mouth, relative to the station (its open side faces -x)
export const UNDOCK_STOP_KM = 3.6;                 // undocked ships fly out of the bay and stop this far out (just inside the dock ring)

// ---- the Expanse (docs/DESIGN.md) ----
export const WARP_AU_PER_S = 1 / 28;               // between POIs: the time off-POI is a base plus the map distance at this speed
export const WARP_POI_BASE_MS = 2000;              // (owner: crossing the 1 AU system takes 30 s)
export const BELTS_MIN = 3, PLAYERS_PER_BELT = 12;  // belt POIs: one per this many players online, at least BELTS_MIN
export const BELT_LIFE_MIN_MS = 60 * 60 * 1000, BELT_LIFE_MAX_MS = 120 * 60 * 1000;   // hidden lifetime of a spawned belt
export const LOGOUT_GRACE_MS = 20 * 1000;          // a closed connection keeps the fleet in space this long (a reload), then it despawns
