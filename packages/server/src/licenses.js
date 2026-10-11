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
  { key: "automation", name: "Automation", group: "modules" },
  { key: "power", name: "Power", group: "modules" },
  { key: "missiles", name: "Missiles", group: "modules" },
  { key: "beams", name: "Beams", group: "modules" },
  { key: "hybrid", name: "Hybrid", group: "modules" },
  { key: "projectiles", name: "Projectiles", group: "modules" },
];

// Back to basics (owner, 2026-10-10): the license trainer is empty for now. The full catalog is kept in
// reference/2026-10-10-pre-reset/server/src/licenses.js.
export const STARTING_LICENSES = {};
export const LICENSES = [];

export const hullEfficiency = (lvl) => Math.min(lvl, 5) * 0.2 + Math.max(0, lvl - 5) * 0.05;
for (const l of LICENSES) l.levelBonus = Array.from({ length: l.maxLevel }, (_, i) =>
  l.hull ? (i < 5 ? "+20% " : "+5% ") + l.bonus : l.bonus);

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
