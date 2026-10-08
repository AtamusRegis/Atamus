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
export const LASER_M3_PER_S = 2;         // prototype mining laser yield (per laser)
export const MINING_CYCLE_MS = 30_000;   // a laser re-aims at a new spot on the rock every cycle
export const STATION_HANGAR_M3 = 10_000_000;
// Per-type stats. radius drives spacing/collision; mass drives who pushes whom.
// hardpoints: beam origins in ship lengths from the sprite centre (sprite faces +x,
// +y is the sprite's "down" side); arms: which hardpoints each laser may fire from.
// Barges/exhumers (later) fire from their circular hopper ports along the centreline.
export const SHIP_TYPES = {
  // Chisel: The Reach design doc — 335 m/s max velocity, 1,200,000 kg, 128 m.
  chisel: {
    name: "Chisel", speedKmps: 0.335, lengthKm: 0.128, radiusKm: 0.09, mass: 1.2, hp: 350, shield: 200,
    cargoM3: 50, oreM3: 5000, targetRangeKm: 15, maxTargets: 5, lockMs: 3000,
    lasers: 2, hardpoints: [[0.338, -0.184], [0.47, -0.14], [0.338, 0.184], [0.47, 0.14]], arms: [[0, 1], [2, 3]],
  },
};

// Stargates: 3 on the outer ring. They burn fuel while active.
export const FUEL_START_MS = 30 * 60 * 1000;     // fuel each gate starts with
export const FUEL_SESSION_MAX_MS = 30 * 60 * 1000; // max fuel a single activation can burn
export const HUB_MIN_WAIT_MS = 3 * 60 * 1000;    // give player-to-player links this long before trying the hub
export const HUB_SEEK_INTERVAL_MS = 4000;        // how often a searching gate tries the hub (after the wait)
export const HUB_SEEK_CHANCE = 0.4;              // chance per try to find a hub entrance
export const GATE_TRANSFER_RADIUS_KM = 4;        // a ship inside this ring can use the gate
export const ARRIVAL_OFFSET_KM = GATE_TRANSFER_RADIUS_KM + 6; // land clear of the partner gate

export const HUB_SYS = "sys:hub";
