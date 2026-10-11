// Tunable constants for the simulation. Distances in km, times in ms. (Back to basics, 2026-10-10: everything else
// the game had is kept for reference in reference/2026-10-10-pre-reset/.)

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
export const SNAPSHOT_HZ = 15;
export const SNAPSHOT_MS = 1000 / SNAPSHOT_HZ;

// ---- the world: the Expanse's hexagon, nothing in it (owner) ----
// The map scale the client always used: 1 AU is drawn as 20,000 km, so the 1 AU-across hexagon is 20,000 km across,
// flat to flat (flat top and bottom). The origin is its center.
export const AU_KM = 20_000;
export const EXPANSE_APOTHEM_KM = 0.5 * AU_KM;     // center to the middle of an edge
export const SPAWN_SPREAD_KM = 5;                  // new ships appear within this of the center

// ---- asteroid belts (belts.js has the field rules) ----
export const BELTS_MIN = 3, PLAYERS_PER_BELT = 12;   // belt POIs: one per this many players online, at least BELTS_MIN

// ---- align and warp (owner) ----
export const ALIGN_SPEED = 0.75;          // aligned at this share of top speed...
export const ALIGN_DEG = 5;               // ...heading within this of the destination
export const WARP_BASE_MS = 2000;         // a warp takes this plus the distance at WARP_KM_PER_S
export const WARP_KM_PER_S = 20_000 / 28; // (owner, before the reset: crossing the system takes about 30 s)
export const WARP_LAND_KM = 30;           // drop out this far from a belt's center, on the inside of its crescent

// ---- RTS ship movement ----
export const SHIP_ARRIVE_EPS_KM = 0.04;  // "arrived" when this close to the target
export const LOGOUT_GRACE_MS = 20 * 1000; // a safe log off (every ship docked) leaves after this (a reload comes back in time)
export const UNSAFE_LOGOFF_MS = 5 * 60 * 1000;   // (owner) otherwise the ships carry on this long, then warp to a safe spot and leave
export const SAFE_WARP_KM = 1500;                // how far that safe spot is
// (owner) mining drones fly each cycle's ore to the ship, circle it twice streaming the ore in, and fly back; they're
// slower within DRONE.nearKm of the ship
export const DRONE = { nearKm: 5, nearKmps: 0.75, farKmps: 2, depositMs: 4000 };
/** How long a drone takes to fly between the ship and something dk km away (fast out there, slower near the ship). */
export const droneLegMs = (dk) => Math.max(800, Math.round((Math.min(dk, DRONE.nearKm) / DRONE.nearKmps + Math.max(0, dk - DRONE.nearKm) / DRONE.farKmps) * 1000));

// The Prospector (owner: the only ship for now). Stats as they were; radius drives spacing;
// hp / shield are shown in the fleet window and the HUD (nothing damages ships yet). Targeting: the Prospector's
// numbers from before the reset (owner, balance pass): 5 km, 5 targets, 3 s to lock. cargoM3 (owner: the Prospector
// starts with 5,000 m³).
export const SHIP_TYPES = {
  chisel: {
    name: "Prospector", cls: "Mining Frigate", sprite: "chisel", lengthKm: 0.128, speedKmps: 0.335, accelKmps2: 0.15, radiusKm: 0.09, mass: 1.2, hp: 200, shield: 225,
    targetRangeKm: 5, maxTargets: 5, lockMs: 3000, droneControlKm: 20,   // (owner) drones keep at a target out to their control range once on it
    // (owner) every storage type the ship has: the 5,000 m³ the Prospector starts with is its ore hold; the small cargo
    // hold is as it was before the reset
    holds: [{ key: "ore", name: "Ore Hold", m3: 5000 }, { key: "cargo", name: "Cargo Hold", m3: 50 }],
    // (owner, 2026-10-11: the Fitting window) armor is new (a placeholder until the owner sets it); module slots come in
    // two kinds (owner): active (on the hotbar) and passive, a number of each per hull; power and disposition are the
    // Prospector's capacitor and disposition from before the reset
    armor: 150, activeSlots: 4, passiveSlots: 3, powerMax: 40, dispositionMax: 70,
    // (owner) mining beams leave the hull from these 4 points (ship lengths from the sprite's center, sprite facing +x;
    // as before the reset); each laser fires from one of its arm's two points, picked each cycle
    hardpoints: [[0.338, -0.184], [0.47, -0.14], [0.338, 0.184], [0.47, 0.14]], arms: [[0, 1], [2, 3]],
    license: "mining_frigate",   // its class license: each level adds a step of the hull bonuses
    desc: "Deep Core Industries' entry-level mining frigate: small, nimble, with a modest ore hold. Every mining career starts in one.",
    // (owner) per level of the class license (5 levels: 20% / 5% / 50% at level 5, the bonuses it had before the reset);
    // (modules.js shipCalc applies them)
    bonuses: [{ key: "laser_yield", per: 4, what: "Mining Laser yield" }, { key: "laser_range", per: 1, what: "Mining Laser range" }, { key: "drone_yield", per: 10, what: "Mining Drones yield" }],
    req: { licenses: [["mining_frigate", "Mining Frigate", 1]], ark: ["ark_mini", "Light Ark"] },   // [license key, name, level]; (owner) a ship needs an ark that can carry it: the smallest that can [type, name]
  },
};
