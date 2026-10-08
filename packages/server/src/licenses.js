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
const reqLic = (...pairs) => pairs.map(([key, level]) => ({ type: "license", key, level }));

// Licenses every new pilot already holds (key -> level).
export const STARTING_LICENSES = { mining_frigate: 1, small_mining_laser: 1, auto_miner: 1 };

export const LICENSES = [
  // ============================================================
  // Industry — Ironvein mining line (fly at Lvl 3, unlock next at Lvl 5; Lvl 6–8 deepen the hull)
  // ============================================================
  {
    key: "auto_miner", name: "Automated Mining", category: "industry", maxLevel: 5, free: true,
    desc: "Operate the auto-miner module: it keeps your lasers on your locked rocks, moving on as each one runs dry.",
    effect: "Auto-miner cycle 3:00 at Lvl 1, −30 s per level (Lvl 1 is granted to every pilot)",
    requirements: [], levelTimes: hrs(2, 5, 10, 20, 35),
  },
  {
    key: "small_mining_laser", name: "Small Mining Laser", category: "industry", maxLevel: 5, free: true,
    desc: "Operate small mining lasers — the frigate-class laser the Chisel carries two of.",
    effect: "+5% mining laser yield per level · fit small mining lasers (Lvl 1 is granted to every pilot)",
    requirements: [], levelTimes: hrs(1, 3, 6, 12, 20),
  },
  {
    key: "mining_frigate", name: "Mining Frigate", category: "industry", maxLevel: 8, free: true,
    desc: "Pilot the Chisel mining frigate. The start of every Ironvein career.",
    effect: "+5% mining yield per level · fly the Chisel (starts flyable at Lvl 1) · Lvl 6–8: deeper Mining Frigate",
    requirements: [], levelTimes: hrs(1, 2, 4, 7, 10, 10, 15, 25),
  },
  {
    key: "gleaner", name: "Gleaner", category: "industry", maxLevel: 8,
    desc: "Pilot the Gleaner — Ironvein's hauler and salvager.",
    effect: "−5% tractor/salvager cycle, +60% tractor range & velocity per level · fly at Lvl 3 · Lvl 6–8: deeper Gleaner",
    requirements: reqLic(["mining_frigate", 5]), levelTimes: hrs(5, 10, 20, 35, 50, 15, 30, 50),
  },
  {
    key: "barges", name: "Mining Barges", category: "industry", maxLevel: 8,
    desc: "Pilot the mining barges: Dragline (yield), Bedrock (tank), Hopper (hold).",
    effect: "Strip-miner yield / shield / ore-hold per hull · fly a barge at Lvl 3 · Lvl 6–8: deeper Mining Barge; gates T2 strip miners",
    requirements: reqLic(["mining_frigate", 5]), levelTimes: hrs(5, 15, 30, 60, 80, 20, 40, 60),
  },
  {
    key: "exumers", name: "Exhumers", category: "industry", maxLevel: 8,
    desc: "Pilot the exhumers: Bucketwheel, Silo, Keystone — the fleet's peak extractors.",
    effect: "+shield DR, strip/ice yield & cycle per level (stacks on Barge bonuses) · fly at Lvl 3 · Lvl 6–8: deeper Exhumer",
    requirements: reqLic(["barges", 5]), levelTimes: hrs(10, 30, 55, 100, 140, 30, 55, 85),
  },
  {
    key: "lodestar", name: "Lodestar", category: "industry", maxLevel: 8,
    desc: "Pilot the Lodestar — a compact industrial command ship for small crews.",
    effect: "+ore hold, Mining Foreman Burst strength & range per level · fly at Lvl 3 · Lvl 6–8: deeper Lodestar command",
    requirements: reqLic(["barges", 5], ["gleaner", 5]), levelTimes: hrs(10, 25, 50, 85, 120, 25, 50, 70),
  },
  {
    key: "motherlode", name: "Motherlode", category: "industry", maxLevel: 8,
    desc: "Pilot the Motherlode — the flagship industrial command ship.",
    effect: "+cargo/ore hold, fleet command & mining bursts per level · fly at Lvl 3 · Lvl 6–8: deeper Motherlode command; gates T2 command bursts",
    requirements: reqLic(["lodestar", 5], ["exumers", 5]), levelTimes: hrs(15, 40, 80, 150, 200, 25, 50, 70),
  },


  // ============================================================
  // Combat — Lantern Wardens escort line (fly at Lvl 3, unlock next at Lvl 5; Lvl 6–8 deepen the hull)
  // ============================================================
  {
    key: "warden_frigate", name: "Warden Frigate", category: "combat", maxLevel: 8,
    desc: "Pilot the Wick — the Wardens' cloaky scout and first responder.",
    effect: "+faction weapon tracking & armor DR per level · fly the Wick at Lvl 3 · Lvl 6–8: deeper Warden Frigate",
    requirements: [], levelTimes: hrs(5, 10, 10, 15, 20, 15, 25, 35),
  },
  {
    key: "warden_cruiser", name: "Warden Cruiser", category: "combat", maxLevel: 8,
    desc: "Pilot the Beacon — the Wardens' standard barge escort.",
    effect: "+medium faction weapon damage & range per level · fly the Beacon at Lvl 3 · Lvl 6–8: deeper Warden Cruiser",
    requirements: reqLic(["warden_frigate", 5]), levelTimes: hrs(15, 30, 50, 65, 80, 30, 50, 65),
  },
  {
    key: "warden_battleship", name: "Warden Battleship", category: "combat", maxLevel: 8,
    desc: "Pilot the Vigil — the Wardens' heavy anchor with remote shield repair.",
    effect: "+large faction weapon, remote shield & tank per level · fly the Vigil at Lvl 3 · Lvl 6–8: deeper Warden Battleship",
    requirements: reqLic(["warden_cruiser", 5]), levelTimes: hrs(25, 55, 100, 150, 200, 45, 75, 95),
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
