// License catalog. Static game design data, served to the client and used
// to validate training. Times are per endorsement level, in milliseconds.

// ---- real design train times (The Reach) ----
// Authored in HOURS per level. DEV_TIME_SCALE compresses them so training is
// testable during development; set it to 1 for the real multi-week timeline.
const HOUR = 3600 * 1000;
const DEV_TIME_SCALE = 1; // 1 = real design times. (1/3600 trains a design-hour per second for testing.)
const hrs = (...perLevel) => perLevel.map((h) => Math.round(h * HOUR * DEV_TIME_SCALE));

export const CATEGORIES = [
  { key: "industry", name: "Industry" },
  { key: "combat", name: "Combat" },
];

// Helper for the two ship licenses that gate off the previous class at level 5.
import { SHIP_TYPES } from "./game/constants.js";
const reqLic = (...pairs) => pairs.map(([key, level]) => ({ type: "license", key, level }));

// Licenses every new pilot already holds (key -> level).
export const STARTING_LICENSES = { mining_frigate: 1, small_mining_laser: 1, auto_miner: 1 };

// One licence = one kind of upgrade. `bonus` is what each endorsement level adds; `per` is
// its size (used by the game). `flies` lists hulls a level unlocks that aren't in the market yet.
export const LICENSES = [
  // ============================================================
  // Industry — mining modules
  // ============================================================
  {
    key: "small_mining_laser", name: "Mining Laser Yield", category: "industry", maxLevel: 5, free: true,
    desc: "Get more ore out of every mining laser cycle.",
    bonus: "+5% mining laser yield", per: 0.05,
    requirements: [], levelTimes: hrs(1, 3, 6, 12, 20),
  },
  {
    key: "laser_range", name: "Mining Laser Range", category: "industry", maxLevel: 5, free: true,
    desc: "Reach rocks further from the ship with your mining lasers.",
    bonus: "+5% mining laser range", per: 0.05,
    requirements: [], levelTimes: hrs(1, 3, 6, 12, 20),
  },
  {
    key: "laser_cycle", name: "Mining Laser Cycling", category: "industry", maxLevel: 5, free: true,
    desc: "Run mining lasers through their cycles faster.",
    bonus: "−3% mining laser cycle time", per: 0.03,
    requirements: [], levelTimes: hrs(2, 4, 8, 14, 24),
  },
  {
    key: "auto_miner", name: "Automated Mining", category: "industry", maxLevel: 5, free: true,
    desc: "The auto-miner keeps your lasers on your locked rocks, moving on as each one runs dry.",
    bonus: "−30 s auto-miner cycle", per: 30_000,
    requirements: [], levelTimes: hrs(2, 5, 10, 20, 35),
  },
  // ============================================================
  // Industry — Ironvein hulls (fly at Lvl 3, next class at Lvl 5)
  // ============================================================
  {
    key: "mining_frigate", name: "Mining Frigate", category: "industry", maxLevel: 8, free: true,
    desc: "Pilot mining frigates. The start of every Ironvein career.",
    bonus: "efficiency flying Mining Frigates", hull: true,
    requirements: [], levelTimes: hrs(1, 2, 4, 7, 10, 10, 15, 25),
  },
  {
    key: "barges", name: "Mining Barges", category: "industry", maxLevel: 8,
    desc: "Pilot the mining barges.",
    bonus: "efficiency flying Mining Barges", hull: true,
    requirements: reqLic(["mining_frigate", 5]), levelTimes: hrs(5, 15, 30, 60, 80, 20, 40, 60),
  },
  {
    key: "exumers", name: "Exhumers", category: "industry", maxLevel: 8,
    desc: "Pilot the exhumers, the fleet's peak extractors.",
    bonus: "efficiency flying Exhumers", hull: true,
    requirements: reqLic(["barges", 5]), levelTimes: hrs(10, 30, 55, 100, 140, 30, 55, 85),
  },
  {
    key: "gleaner", name: "Hauler", category: "industry", maxLevel: 8,
    desc: "Pilot haulers.",
    bonus: "efficiency flying Haulers", hull: true, flies: { 3: ["Gleaner"] },
    requirements: reqLic(["mining_frigate", 5]), levelTimes: hrs(5, 10, 20, 35, 50, 15, 30, 50),
  },
  {
    key: "lodestar", name: "Industrial Command", category: "industry", maxLevel: 8,
    desc: "Pilot the compact industrial command ship.",
    bonus: "efficiency flying Industrial Command Ships", hull: true, flies: { 3: ["Lodestar"] },
    requirements: reqLic(["barges", 5], ["gleaner", 5]), levelTimes: hrs(10, 25, 50, 85, 120, 25, 50, 70),
  },
  {
    key: "motherlode", name: "Capital Industrial Command", category: "industry", maxLevel: 8,
    desc: "Pilot the flagship industrial command ship.",
    bonus: "efficiency flying Capital Industrial Command Ships", hull: true, flies: { 3: ["Motherlode"] },
    requirements: reqLic(["lodestar", 5], ["exumers", 5]), levelTimes: hrs(15, 40, 80, 150, 200, 25, 50, 70),
  },
  // ============================================================
  // Combat — Lantern Wardens escort line (fly at Lvl 3, next class at Lvl 5)
  // ============================================================
  {
    key: "warden_frigate", name: "Warden Frigate", category: "combat", maxLevel: 8,
    desc: "Pilot Warden frigates.",
    bonus: "efficiency flying Warden Frigates", hull: true, flies: { 3: ["Wick"] },
    requirements: [], levelTimes: hrs(5, 10, 10, 15, 20, 15, 25, 35),
  },
  {
    key: "warden_cruiser", name: "Warden Cruiser", category: "combat", maxLevel: 8,
    desc: "Pilot Warden cruisers.",
    bonus: "efficiency flying Warden Cruisers", hull: true, flies: { 3: ["Beacon"] },
    requirements: reqLic(["warden_frigate", 5]), levelTimes: hrs(15, 30, 50, 65, 80, 30, 50, 65),
  },
  {
    key: "warden_battleship", name: "Warden Battleship", category: "combat", maxLevel: 8,
    desc: "Pilot Warden battleships.",
    bonus: "efficiency flying Warden Battleships", hull: true, flies: { 3: ["Vigil"] },
    requirements: reqLic(["warden_cruiser", 5]), levelTimes: hrs(25, 55, 100, 150, 200, 45, 75, 95),
  },
];

// Hull licences scale how well you fly the hull: Lvl 1-5 add 20% each (Lvl 5 = 100% of the
// hull's stats), Lvl 6-8 add 5% each above that (up to 115%).
export const hullEfficiency = (lvl) => Math.min(lvl, 5) * 0.2 + Math.max(0, lvl - 5) * 0.05;
for (const l of LICENSES) l.levelBonus = Array.from({ length: l.maxLevel }, (_, i) =>
  l.hull ? (i < 5 ? "+20% " : "+5% ") + l.bonus : l.bonus);

// What each endorsement level unlocks: hulls it lets you fly and licences it opens for training.
for (const l of LICENSES) {
  const u = {};
  const add = (lvl, text) => { (u[lvl] ||= []).push(text); };
  for (const [lvl, names] of Object.entries(l.flies || {})) for (const n of names) add(lvl, "Fly the " + n);
  for (const t of Object.values(SHIP_TYPES)) if (t.req && t.req[l.key]) add(t.req[l.key], "Fly the " + t.name);
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
