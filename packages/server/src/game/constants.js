// Tunable constants for the simulation. Distances in km, times in ms. (Back to basics, 2026-10-10: everything else
// the game had is kept for reference in reference/2026-10-10-pre-reset/.)

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
export const SNAPSHOT_HZ = 15;
export const SNAPSHOT_MS = 1000 / SNAPSHOT_HZ;

// ---- the world: the Expanse's hexagon, nothing in it (owner) ----
// The map scale the client always used: 1 AU is drawn as 20,000 km, so the 1 AU-across hexagon is 20,000 km across,
// flat to flat (flat top and bottom). The origin is its centre.
export const AU_KM = 20_000;
export const EXPANSE_APOTHEM_KM = 0.5 * AU_KM;     // centre to the middle of an edge
export const SPAWN_SPREAD_KM = 5;                  // new ships appear within this of the centre

// ---- asteroid belts (belts.js has the field rules) ----
export const BELTS_MIN = 3, PLAYERS_PER_BELT = 12;   // belt POIs: one per this many players online, at least BELTS_MIN

// ---- align and warp (owner) ----
export const ALIGN_SPEED = 0.75;          // aligned at this share of top speed...
export const ALIGN_DEG = 5;               // ...heading within this of the destination
export const WARP_BASE_MS = 2000;         // a warp takes this plus the distance at WARP_KM_PER_S
export const WARP_KM_PER_S = 20_000 / 28; // (owner, before the reset: crossing the system takes about 30 s)
export const WARP_LAND_KM = 30;           // drop out this far from a belt's centre, on the inside of its crescent

// ---- RTS ship movement ----
export const SHIP_ARRIVE_EPS_KM = 0.04;  // "arrived" when this close to the target
export const LOGOUT_GRACE_MS = 20 * 1000; // a closed connection keeps the ship in space this long (a reload), then it despawns

// The Prospector (owner: the only ship for now). Stats as they were; radius drives spacing, mass who pushes whom;
// hp / shield are shown in the fleet window (nothing damages ships yet).
export const SHIP_TYPES = {
  chisel: {
    name: "Prospector", cls: "Mining Frigate", sprite: "chisel", lengthKm: 0.128, speedKmps: 0.335, accelKmps2: 0.15, radiusKm: 0.09, mass: 1.2, hp: 200, shield: 225,
  },
};
