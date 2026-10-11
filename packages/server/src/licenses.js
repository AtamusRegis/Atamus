// License catalog. Static game design data, served to the client and used
// to validate training. Times are per endorsement level, in milliseconds.

// ---- real design train times (the Expanse design doc) ----
// Authored in HOURS per level. DEV_TIME_SCALE compresses them so training is
// testable during development; set it to 1 for the real multi-week timeline.
const HOUR = 3600 * 1000;
const DEV_TIME_SCALE = 1; // 1 = real design times. (1/3600 trains a design-hour per second for testing.)
const hrs = (...perLevel) => perLevel.map((h) => Math.round(h * HOUR * DEV_TIME_SCALE));
// For now (owner): every license trains fast: level N takes N minutes. The design times above are kept in
// designTimes (manual prices still come from them); set QUICK_TRAINING = false to go back to them.
const QUICK_TRAINING = true;

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
    requirements: [], levelTimes: [1, 2, 3, 4, 5].map((n) => n * 12 * MIN), fixedTimes: true,
  },
  // (owner, 2026-10-11) module licenses, 5 levels each, stepped like Mining Frigate; none is needed to fit a module.
  // Each one's power / disposition cut applies to the modules it names, not to what they upgrade (modules.js).
  ...[
    ["mining_lasers", "Mining Lasers", "mining", "Run mining lasers better and lighter.", "+5% Mining Laser yield and range, −5% Mining Laser power and disposition"],
    ["mining_drones", "Mining Drones", "mining", "Run mining drones better and lighter.", "+5% Mining Drones yield and range, −5% Mining Drones power and disposition"],
    ["mining_upgrades", "Mining Upgrades", "mining", "Get more out of mining laser upgrades.", "+10% to Mining Laser Upgrade, Mining Beam Extender and Mining Overclocker bonuses, −5% their power and disposition"],
    ["engineering_upgrades", "Engineering Upgrades", "engineering", "Get more out of the ship's engineering upgrades.", "+10% to Cargo Expander and Inertia Stabilizer bonuses, −5% their power and disposition"],
    ["engines", "Engines", "engineering", "Push the afterburner harder.", "+10% to the Afterburner's speed bonus, −5% its power and disposition"],
  ].map(([key, name, category, desc, bonus]) => ({ key, name, category, maxLevel: 5, free: true, desc, bonus, requirements: [], levelTimes: [1, 2, 3, 4, 5].map((n) => n * 12 * MIN), fixedTimes: true })),
];
for (const l of LICENSES) { l.designTimes = l.levelTimes; if (QUICK_TRAINING && !l.fixedTimes) l.levelTimes = l.levelTimes.map((_, i) => (i + 1) * MIN); }

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
