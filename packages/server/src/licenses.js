// License catalog. Static game design data, served to the client and used
// to validate training. Times are per endorsement level, in milliseconds.

const BASE_MS = 30 * 1000; // level 1 train time; doubles each level
const times = (max) => Array.from({ length: max }, (_, i) => BASE_MS * Math.pow(2, i));

export const CATEGORIES = [
  { key: "navigation", name: "Navigation" },
  { key: "stargate", name: "Stargate Operation" },
];

export const LICENSES = [
  {
    key: "speed", name: "Speed", category: "navigation", maxLevel: 5,
    desc: "Advanced thruster tuning for faster sublight travel.",
    effect: "+20% ship speed per endorsement level",
    requirements: [],
    levelTimes: times(5),
  },
  {
    key: "hull", name: "Hull Integrity", category: "navigation", maxLevel: 5,
    desc: "Reinforced plating that toughens the hull.",
    effect: "+10% ship HP per endorsement level",
    requirements: [],
    levelTimes: times(5),
  },
  {
    key: "stargate", name: "Stargate Management", category: "stargate", maxLevel: 5,
    desc: "Optimized traversal routines for crossing stargates.",
    effect: "Cross a stargate 5% faster per endorsement level",
    requirements: [
      { type: "license", key: "speed", level: 3 },
      { type: "test", key: "stargate_operator_exam", name: "Stargate Operator Exam" },
    ],
    levelTimes: times(5),
  },
];

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
