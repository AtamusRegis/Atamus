// Tunable constants for the tech-demo simulation. All distances are in km,
// all times in milliseconds unless noted. Dev-friendly values; not balance.

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
export const SNAPSHOT_HZ = 15;
export const SNAPSHOT_MS = 1000 / SNAPSHOT_HZ;

// Hexagon: flat-top, measured flat side to opposite flat side.
export const HEX_FLAT_TO_FLAT_KM = 50;
export const HEX_APOTHEM_KM = HEX_FLAT_TO_FLAT_KM / 2;            // 25  (center -> flat edge)
export const HEX_CIRCUMRADIUS_KM = HEX_APOTHEM_KM / Math.cos(Math.PI / 6); // ~28.87 (center -> corner)
export const HEX_CORNER_ROUND_KM = 2.5;                           // cosmetic corner rounding

export const SHIP_SPEED_KMPS = 1;
export const SHIP_HP = 100;
export const MAX_SHIPS_PER_PLAYER = 2;

// Stargate at the hex center.
export const GATE_POS = { x: 0, y: 0 };
export const GATE_RADIUS_KM = 10;        // ships within this of the gate transfer to the hub
export const HUB_TIMER_MS = 5 * 60 * 1000;

// Station (spawn point) — offset from center, still well inside the hex.
export const STATION_POS = { x: 0, y: -18 };
export const STATION_RADIUS_KM = 2;      // click target / spawn scatter

// Hub combat.
export const COMBAT_RANGE_KM = 6;        // enemy ships within this damage each other
export const COMBAT_DPS = 8;             // per attacker, per second
export const HUB_ARRIVAL_SCATTER_KM = 6; // arrivals land within this of hub center

export const CLIENT_CONFIG = {
  hexFlatToFlat: HEX_FLAT_TO_FLAT_KM,
  circumradius: HEX_CIRCUMRADIUS_KM,
  cornerRound: HEX_CORNER_ROUND_KM,
  gate: GATE_POS,
  gateRadius: GATE_RADIUS_KM,
  station: STATION_POS,
  stationRadius: STATION_RADIUS_KM,
  maxHp: SHIP_HP,
  speed: SHIP_SPEED_KMPS,
  hubTimerMs: HUB_TIMER_MS,
  maxShips: MAX_SHIPS_PER_PLAYER,
};
