// (owner, 2026-10-15) The two teams' ships: every number the Ship Editor changes, with its limits and each team's
// starting value. Kept in world3d_settings ("ships") and sent to every client (they predict their own ship with them).
// Units: m, m/s, m/s^2, degrees, seconds, percent (0-100) unless said.
export const TEAMS = ["blue", "red"];              // "red" is shown as Yellow (the key saved in player data)
// [key, min, max, blue, yellow]
export const SHIP_FIELDS = [
  // health
  ["hp", 1, 5000, 100, 150],          // max health
  ["hpRegen", 0, 500, 0, 0],          // health a second, once hpDelay has passed since the last damage
  ["hpDelay", 0, 60, 5, 5],           // s after damage before health regenerates
  ["respawn", 0, 60, 5, 5],           // s dead before the ship comes back
  // movement
  ["speed", 1, 500, 40, 64],          // max speed, m/s (forward)
  ["accel", 1, 1000, 50, 70],         // m/s^2
  ["brake", 1, 1000, 100, 100],       // m/s^2 when no thrust is held
  ["turn", 1, 720, 29, 34],           // degrees a second
  ["turnAccel", 1, 5000, 143, 170],   // degrees a second^2 (how fast turning spins up)
  ["strafe", 0, 200, 60, 60],         // % of max speed pushing sideways
  ["reverse", 0, 200, 60, 60],        // % of max speed backing up
  ["boost", 0, 500, 30, 30],          // % extra speed while boosting (Shift, forward only)
  ["boostCap", 0, 1000, 8, 8],        // capacitor a second while boosting
  ["boostMin", 0, 5000, 15, 15],      // capacitor needed to boost again after running dry
  // defense
  ["armor", 0, 95, 0, 50],            // % of hull damage taken off
  ["shield", 0, 5000, 100, 0],        // max shield (0: none)
  ["shRegen", 0, 500, 8, 0],          // shield a second, once shDelay has passed since the last damage
  ["shDelay", 0, 60, 3, 3],           // s after damage before the shield regenerates
  ["shRestoreCap", 0, 100, 1, 1],     // capacitor per point a broken shield costs to restore (only the capacitor restores it)
  // capacitor
  ["cap", 1, 5000, 100, 100],         // max capacitor
  ["capRegen", 0, 500, 8, 8],         // capacitor a second
  // weapon
  ["wtype", 0, 1, 1, 0],              // 0: bullets, 1: beam
  ["dmg", 0, 5000, 60, 9],            // per bullet; a beam: per second
  ["optimal", 10, 5000, 900, 500],    // full damage out to this
  ["falloff", 0, 5000, 300, 150],     // past optimal: damage drops off over this much more; max range = optimal + falloff
  ["dmgEnd", 0, 100, 35, 40],         // % of the damage left at max range
  ["dmgCurve", 0.1, 10, 1, 1],        // the drop's shape: 1 straight, above 1 holds then drops late, below 1 drops early
  ["mag", 1, 10000, 100, 40],         // ammo per reload
  ["rate", 0.1, 100, 10, 5],          // ammo used a second (bullets: shots a second; a beam: drained while firing)
  ["reload", 0, 60, 3, 2],            // s to reload
  ["bspeed", 10, 10000, 1300, 1300],  // bullet speed, m/s, out to optimal
  ["spdEnd", 0, 100, 10, 10],         // % of the bullet's speed left at max range
  ["spdCurve", 0.1, 10, 1, 1],        // that slowdown's shape (as the damage curve)
  ["spread0", 0, 45, 0, 0],           // degrees each way at rest
  ["spreadMax", 0, 90, 10, 10],       // degrees each way at most
  ["spreadAdd", 0, 45, 0.8, 0.8],     // degrees more each way per bullet
  ["spreadBack", 0, 180, 6, 6],       // degrees a second the spread closes back in
  ["rot", 1, 1440, 100, 540],         // degrees a second the aim turns toward the pointer
  ["capUse", 0, 1000, 0, 0],          // capacitor per bullet; a beam: per second
];
export const FIELD = Object.fromEntries(SHIP_FIELDS.map(([k, lo, hi]) => [k, [lo, hi]]));
export const defaults = () => ({ blue: Object.fromEntries(SHIP_FIELDS.map((f) => [f[0], f[3]])), red: Object.fromEntries(SHIP_FIELDS.map((f) => [f[0], f[4]])) });
// a value from the editor, checked as hostile: a known key, a finite number, clamped; null if not usable
export function cleanField(k, v) {
  const f = FIELD[k]; if (!f) return null; v = Number(v); if (!Number.isFinite(v)) return null;
  v = Math.max(f[0], Math.min(f[1], v)); if (k === "wtype" || k === "mag") v = Math.round(v);
  return Math.round(v * 10000) / 10000;
}
// the shape both damage and bullet speed follow past optimal: 1 out to it, falling to end% at optimal + falloff
export function curveAt(s, S, end, shape) {
  if (s <= S.optimal) return 1;
  const u = S.falloff > 0 ? Math.min(1, (s - S.optimal) / S.falloff) : 1;
  return 1 - (1 - end / 100) * Math.pow(u, shape);
}
export const maxRange = (S) => S.optimal + S.falloff;
