// Tunable constants for the tech-demo simulation. Distances in km, times in ms.

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
export const SNAPSHOT_HZ = 15;
export const SNAPSHOT_MS = 1000 / SNAPSHOT_HZ;

// Each system is a honeycomb of flat-top hex cells, measured flat-to-flat.
export const CELL_FLAT_TO_FLAT_KM = 100;
export const CELL_APOTHEM_KM = CELL_FLAT_TO_FLAT_KM / 2;                 // 50
export const CELL_CIRCUMRADIUS_KM = CELL_APOTHEM_KM / Math.cos(Math.PI / 6); // ~57.74
export const SYSTEM_RINGS = 2;                                          // center + 2 rings = 19 cells
export const CELL_CORNER_ROUND_KM = 5;

export const SHIP_SPEED_KMPS = 1;
export const SHIP_HP = 100;
export const MAX_SHIPS_PER_PLAYER = 2;

export const COMBAT_RANGE_KM = 8;      // enemy ships within this damage each other (in any system)
export const COMBAT_DPS = 8;

// Stargates: 3 on the outer ring. They burn fuel while active.
export const FUEL_START_MS = 30 * 60 * 1000;     // fuel each gate starts with
export const FUEL_SESSION_MAX_MS = 30 * 60 * 1000; // max fuel a single activation can burn
export const HUB_SEEK_INTERVAL_MS = 4000;        // how often a searching gate tries to connect
export const HUB_SEEK_CHANCE = 0.4;              // chance per try to find a hub entrance
export const GATE_TRANSFER_RADIUS_KM = 8;        // a ship this close to a connected gate flies through
export const ARRIVAL_OFFSET_KM = GATE_TRANSFER_RADIUS_KM + 6; // land clear of the partner gate

// Station (ship construction) at the center cell.
export const STATION_RADIUS_KM = 3;

export const HUB_SYS = "sys:hub";
