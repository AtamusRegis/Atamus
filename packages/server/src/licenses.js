// License catalog. Static game design data, served to the client and used
// to validate training. Times are per endorsement level, in milliseconds.

// (owner) the one knob for training speed: every license level takes its listed time × this. 1 = the real times;
// 0.2 = 5× as fast (for the time being, owner 2026-10-11). Change only this when testing.
export const TRAINING_TIME_MODIFIER = 0.2;

// License categories (owner): ship licenses first, then module licenses. Categories without licenses yet
// (the weapon types) are defined so they slot in later; the client hides empty ones.
export const CATEGORIES = [
  { key: "mining_ships", name: "Mining Ships", group: "ships" },
  { key: "combat_ships", name: "Combat Ships", group: "ships" },
  { key: "industry_ships", name: "Industry Ships", group: "ships" },
  { key: "mining", name: "Mining", group: "modules" },
  { key: "engineering", name: "Engineering", group: "modules" },
  { key: "automation", name: "Automation", group: "modules" },
  { key: "power", name: "Power", group: "modules" },
  { key: "missiles", name: "Missiles", group: "modules" },
  { key: "beams", name: "Beams", group: "modules" },
  { key: "hybrid", name: "Hybrid", group: "modules" },
  { key: "projectiles", name: "Projectiles", group: "modules" },
];

// Back to basics (owner, 2026-10-10): the license trainer is empty for now. The full catalog is kept in
// reference/2026-10-10-pre-reset/server/src/licenses.js.
// Ship-class licenses came back on 2026-10-11 (owner): every pilot starts at level 1 in any frigate class.
const MIN = 60_000;
export const STARTING_LICENSES = { mining_frigate: 1 };
export const LICENSES = [
  {
    key: "mining_frigate", name: "Mining Frigate", category: "mining_ships", maxLevel: 5, free: true,
    desc: "Pilot mining frigates. Where every mining career starts.",
    bonus: "Mining Frigate hull bonuses", hull: true,
    // (owner) 5 levels, the first known from the start; stepped: level N takes N × 12 min (level 5: an hour)
    requirements: [], levelTimes: [1, 2, 3, 4, 5].map((n) => n * 12 * MIN)
  },
  // (owner, 2026-10-11) module licenses, 5 levels each, stepped like Mining Frigate. Each level: −5% power and
  // disposition of the modules it names, +5% to an active module's effect and +10% to a passive's bonus; a II module
  // needs its license at V (modules.js).
  ...[
    ["mining_lasers", "Mining Lasers", "mining", "Run mining lasers better and lighter.", "Mining Laser"],
    ["strip_mining", "Strip Mining", "mining", "Run strip miners better and lighter.", "Strip Miner"],
    ["mining_upgrades", "Mining Upgrades", "mining", "Get more out of mining upgrades.", "Yield, Cycle and Range Upgrade"],
    ["mining_drones", "Drones", "automation", "Control drones better and lighter.", "Drone Link"],
    ["drone_upgrades", "Drone Upgrades", "automation", "Get more out of drone upgrades.", "Drone Upgrade and Drone Bay Extender"],
    ["repair_drones", "Repair Drones", "automation", "Run repair drones better and lighter.", "Repair Drone"],
    ["tractor_beams", "Tractor Beams", "automation", "Run tractor beams better and lighter.", "Tractor Beam"],
    ["engineering_upgrades", "Engineering Upgrades", "engineering", "Get more out of the ship's engineering upgrades.", "Cargo Upgrade and Gyroscope"],
    ["engines", "Engines", "engineering", "Push the engines harder.", "Afterburner, Microwarp Drive and Speed Upgrade"],
    ["electronics", "Electronics", "engineering", "Get more out of targeting upgrades.", "Targeting Range Upgrade, Locking Upgrade and Target Tracker"],
    ["hull_upgrades", "Hull Upgrades", "engineering", "Get more out of armor upgrades.", "Armor Upgrade"],
    ["propulsion_jamming", "Propulsion Jamming", "engineering", "Run warp scramblers and webifiers better and lighter.", "Warp Scrambler and Stasis Webifier"],
    ["shield_operation", "Shield Operation", "power", "Run shield modules better and lighter.", "Shield Recharger and Shield Extender"],
    ["remote_shields", "Remote Shields", "power", "Run remote shield modules better and lighter.", "Remote Shield Recharger and Remote Shield Extender"],
    ["missiles", "Missiles", "missiles", "Fire missile launchers better and lighter.", "Missile Launcher"],
    ["beams", "Beams", "beams", "Fire beam lasers better and lighter.", "Beam Laser"],
    ["hybrid_turrets", "Hybrid Turrets", "hybrid", "Fire railguns better and lighter.", "Railgun"],
    ["projectiles", "Projectiles", "projectiles", "Fire slug cannons better and lighter.", "Slug Cannon"],
  ].map(([key, name, category, desc, what]) => ({ key, name, category, maxLevel: 5, free: true, desc, bonus: "+5% " + what + " effect (passives: +10%), −5% their power and disposition; II modules need V", requirements: [], levelTimes: [1, 2, 3, 4, 5].map((n) => n * 12 * MIN) })),
];
for (const l of LICENSES) l.levelTimes = l.levelTimes.map((ms) => Math.round(ms * TRAINING_TIME_MODIFIER));   // the times everything uses (server and trainer)

// (owner) ships always fly at their full stats; each level of a ship-class license adds one step of that class's hull
// bonuses (each hull lists its bonuses per level)
for (const l of LICENSES) l.levelBonus = Array.from({ length: l.maxLevel }, () => (l.hull ? "+1 level of " : "") + l.bonus);

// What each endorsement level unlocks: licenses it opens for training.
for (const l of LICENSES) {
  const u = {};
  const add = (lvl, text) => { (u[lvl] ||= []).push(text); };
  for (const o of LICENSES) for (const r of o.requirements) if (r.type === "license" && r.key === l.key) add(r.level, "Train " + o.name);
  l.unlocks = u;
}

const BY_KEY = new Map(LICENSES.map((l) => [l.key, l]));
export const getLicense = (k) => BY_KEY.get(k);
export const trainMs = (key, level) => { const l = BY_KEY.get(key); return l ? l.levelTimes[level - 1] : null; };

// The catalog sent to the client (licenses carry their level times + requirements;
// "required for" is derived on the client).
export const CATALOG = { categories: CATEGORIES, licenses: LICENSES };

/**
 * Are the requirements for training `key` met by the pilot's TRAINED levels?
 * License-level requirements are enforced; test (item) requirements are shown
 * but not enforced yet, since inventory does not exist.
 */
export function requirementsMet(key, trainedLevels) {
  const l = BY_KEY.get(key); if (!l) return false;
  for (const r of l.requirements) {
    if (r.type === "license" && (trainedLevels[r.key] || 0) < r.level) return false;
  }
  return true;
}
