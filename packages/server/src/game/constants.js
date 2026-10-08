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

export const SHIP_SPEED_KMPS = 1;
export const SHIP_HP = 100;
export const MAX_SHIPS_PER_PLAYER = 2;

// ---- RTS ship movement (gameplay-tuned; speed is not the doc's realistic
// 335 m/s, which would be far too slow to fly across these hexes) ----
export const SHIP_ARRIVE_EPS_KM = 0.04;  // "arrived" when this close to the target
export const SHIP_SLOW_RADIUS_KM = 0.6;  // start easing to a stop within this range
export const SHIP_STEER = 9;             // velocity-approach rate (1/s), dt-smoothed
// Per-type stats. radius drives spacing/collision; mass drives who pushes whom.
export const SHIP_TYPES = {
  // Chisel: The Reach design doc — 335 m/s max velocity, 1,200,000 kg, 128 m.
  chisel: { speedKmps: 0.335, radiusKm: 0.09, mass: 1.2 },
};

export const COMBAT_RANGE_KM = 8;      // enemy ships within this damage each other (in any system)
export const COMBAT_DPS = 8;

// Stargates: 3 on the outer ring. They burn fuel while active.
export const FUEL_START_MS = 30 * 60 * 1000;     // fuel each gate starts with
export const FUEL_SESSION_MAX_MS = 30 * 60 * 1000; // max fuel a single activation can burn
export const HUB_MIN_WAIT_MS = 3 * 60 * 1000;    // give player-to-player links this long before trying the hub
export const HUB_SEEK_INTERVAL_MS = 4000;        // how often a searching gate tries the hub (after the wait)
export const HUB_SEEK_CHANCE = 0.4;              // chance per try to find a hub entrance
export const GATE_TRANSFER_RADIUS_KM = 8;        // a ship this close to a connected gate flies through
export const ARRIVAL_OFFSET_KM = GATE_TRANSFER_RADIUS_KM + 6; // land clear of the partner gate

// Station (ship construction) at the center cell.
export const STATION_RADIUS_KM = 3;

export const HUB_SYS = "sys:hub";
