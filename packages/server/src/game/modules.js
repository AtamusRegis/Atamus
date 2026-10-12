// Modules (owner, 2026-10-11): fitted into a hull's active slots (on the hotbar, switched on and off) or passive slots
// (always on). Each costs power and disposition from the hull's maximums.
//
// (owner, second pass) every module comes in three sizes, S, M and L, and two tiers, I and II:
//   - a hull fits modules of its own size class or smaller (frigates S; cruisers S and M; battleships all three);
//   - smaller ones use less power and disposition and do less (SIZE_* below);
//   - a II's bonuses are 30% stronger (T2), and it needs its license trained to V.
// Item keys are family_size+tier ("mining_laser_s1", "railgun_l2"). The keys from before the sizes load as their S I
// (ALIASES). Same-kind passives stack with diminishing returns (EVE's curve: 100%, 87%, 57%, 28%…).
//
// Licenses (licenses.js), 5 levels each: −5% power / disposition of the modules they name per level, and +5% to an
// active module's effect (+10% to a passive's bonus) per level.
// (owner) active modules take a lot of power and a moderate share of disposition; passive ones little power but a lot
// of disposition. The Prospector (40 power / 70 disposition): untrained, two lasers, a Drone Link and an afterburner
// leave power for the passives but disposition for only two of them; the licenses (−5% a level) make room for the third.
export const SIZES = ["s", "m", "l"];
export const SIZE_NAME = { s: "S", m: "M", l: "L" };
export const SIZE_RANK = { s: 0, m: 1, l: 2 };
export const HULL_RANK = { frigate: 0, cruiser: 1, battleship: 2 };
const COST_K = [1, 2.5, 6];        // power and disposition by size
const AMT_K = [1, 2.5, 6];         // amounts (yield, damage, shield, repair, drone bay) by size
const RANGE_K = [1, 1.5, 2.2];     // ranges and pull speed by size
const PCT_K = [1, 1.2, 1.4];       // percentage bonuses by size
const M3 = [5, 10, 25];            // volume by size
export const T2 = 1.3;             // (owner) a II is 30% stronger
const T2_COST = 1.1;               // ...and a little heavier to fit

// Each family's S I numbers; `scale` says how each number grows with size and tier (amt, range, pct, or none).
const F = (o) => o;
export const FAMILIES = {
  // ---- active ----
  mining_laser: F({ name: "Mining Laser", slot: "active", kind: "mining", license: "mining_lasers", icon: null, power: 8, disposition: 6,
    stats: { yield: 10, cycleMs: 15_000, rangeKm: 3 }, scale: { yield: "amt", rangeKm: "range" }, drone: true,
    desc: "Cuts ore from a locked asteroid. The ore lands in the ore hold when each cycle completes." }),
  strip_miner: F({ name: "Strip Miner", slot: "active", kind: "mining", license: "strip_mining", icon: null, power: 14, disposition: 9,
    stats: { yield: 30, cycleMs: 30_000, rangeKm: 3, waste: 0.6 }, scale: { yield: "amt", rangeKm: "range" },
    desc: "Tears much more ore from a locked asteroid each cycle than a mining laser, but wastes a share of the rock in the process." }),
  drone_link: F({ name: "Drone Link", slot: "active", kind: "drones", license: "mining_drones", icon: null, power: 11, disposition: 7,
    stats: { drones: 2, rangeKm: 20 }, scale: { rangeKm: "range" }, count: [2, 3, 5],
    desc: "Launches drones from the drone bay, each carrying a mining laser or weapon from the cargo hold, and controls them out to its range. Drones burn fuel while out." }),
  tractor_beam: F({ name: "Tractor Beam", slot: "active", kind: "tractor", license: "tractor_beams", icon: null, power: 8, disposition: 5,
    stats: { rangeKm: 10, pullKmps: 0.5 }, scale: { rangeKm: "range", pullKmps: "range" },
    desc: "Pulls a locked wreck in toward the ship." }),
  shield_recharger: F({ name: "Shield Recharger", slot: "active", kind: "shield_rep", license: "shield_operation", icon: null, power: 10, disposition: 6,
    stats: { amount: 20, cycleMs: 5000 }, scale: { amount: "amt" },
    desc: "Restores the ship's shield each cycle while it runs." }),
  shield_extender: F({ name: "Shield Extender", slot: "active", kind: "shield_ext", license: "shield_operation", icon: null, power: 9, disposition: 6,
    stats: { shieldAdd: 150 }, scale: { shieldAdd: "amt" },
    desc: "Raises the ship's shield capacity while it runs." }),
  afterburner: F({ name: "Afterburner", slot: "active", kind: "prop", license: "engines", icon: null, power: 10, disposition: 6,
    stats: { speedBonus: 0.75 }, scale: { speedBonus: "pct" },
    desc: "Burns extra fuel through the engines for more top speed while it's on." }),
  microwarp_drive: F({ name: "Microwarp Drive", slot: "active", kind: "prop", license: "engines", icon: null, power: 16, disposition: 9,
    stats: { speedBonus: 4, mwd: true }, scale: { speedBonus: "pct" },
    desc: "A huge burst of speed while it's on. Fitted, it also lets the warp drive reach beyond the planetary system the ship is in." }),
  missile: F({ name: "Missile Launcher", slot: "active", kind: "weapon", license: "missiles", icon: null, power: 12, disposition: 7,
    stats: { dmg: 30, cycleMs: 6000, rangeKm: 20, flightKmps: 4, shieldK: 1, hullK: 1 }, scale: { dmg: "amt", rangeKm: "range" }, drone: true,
    desc: "Fires a missile at a locked ship each cycle. Long reach; the missile takes time to fly." }),
  beam: F({ name: "Beam Laser", slot: "active", kind: "weapon", license: "beams", icon: null, power: 13, disposition: 6,
    stats: { dmg: 20, cycleMs: 4000, rangeKm: 8, shieldK: 1.2, hullK: 0.8 }, scale: { dmg: "amt", rangeKm: "range" }, drone: true,
    desc: "Burns a locked ship each cycle. Strong against shields, weaker against hulls." }),
  slug: F({ name: "Slug Cannon", slot: "active", kind: "weapon", license: "projectiles", icon: null, power: 10, disposition: 6,
    stats: { dmg: 12, cycleMs: 2000, rangeKm: 4, shieldK: 0.8, hullK: 1.2 }, scale: { dmg: "amt", rangeKm: "range" }, drone: true,
    desc: "Hammers a locked ship with slugs at close range. Fast; strong against hulls, weaker against shields." }),
  railgun: F({ name: "Railgun", slot: "active", kind: "weapon", license: "hybrid_turrets", icon: null, power: 14, disposition: 7,
    stats: { dmg: 45, cycleMs: 8000, rangeKm: 15, shieldK: 1, hullK: 1 }, scale: { dmg: "amt", rangeKm: "range" }, drone: true,
    desc: "Fires a heavy round at a locked ship each cycle. Slow, hard-hitting, long reach." }),
  warp_scrambler: F({ name: "Warp Scrambler", slot: "active", kind: "scram", license: "propulsion_jamming", icon: null, power: 8, disposition: 5,
    stats: { rangeKm: 9 }, scale: { rangeKm: "range" },
    desc: "Keeps a locked ship in range from warping while it runs." }),
  stasis_webifier: F({ name: "Stasis Webifier", slot: "active", kind: "web", license: "propulsion_jamming", icon: null, power: 8, disposition: 5,
    stats: { rangeKm: 10, web: 0.5 }, scale: { rangeKm: "range", web: "pct" },
    desc: "Slows a locked ship in range while it runs." }),
  remote_shield_booster: F({ name: "Remote Shield Recharger", slot: "active", kind: "remote_rep", license: "remote_shields", icon: null, power: 11, disposition: 6,
    stats: { amount: 30, cycleMs: 5000, rangeKm: 8 }, scale: { amount: "amt", rangeKm: "range" },
    desc: "Restores the shield of another locked ship each cycle." }),
  remote_shield_extender: F({ name: "Remote Shield Extender", slot: "active", kind: "remote_ext", license: "remote_shields", icon: null, power: 10, disposition: 6,
    stats: { shieldAdd: 120, rangeKm: 8 }, scale: { shieldAdd: "amt", rangeKm: "range" },
    desc: "Raises the shield capacity of another locked ship while it runs." }),
  repair_drone: F({ name: "Repair Drone", slot: "active", kind: "hull_rep", license: "repair_drones", icon: null, power: 9, disposition: 6,
    stats: { amount: 4, cycleMs: 5000, rangeKm: 8 }, scale: { amount: "amt", rangeKm: "range" },
    desc: "Sends a drone to slowly repair the hull of another locked ship. It can't repair its own ship." }),
  // ---- passive ----
  cargo_upgrade: F({ name: "Cargo Upgrade", slot: "passive", license: "engineering_upgrades", icon: null, power: 1, disposition: 15,
    stats: { holdBonus: 0.15 }, scale: { holdBonus: "pct" }, desc: "Reinforced bulkheads that make room in the ship's cargo and ore holds." }),
  yield_upgrade: F({ name: "Yield Upgrade", slot: "passive", license: "mining_upgrades", icon: null, power: 1, disposition: 16,
    stats: { laserYield: 0.05 }, scale: { laserYield: "pct" }, desc: "Tunes the mining lasers and strip miners for more ore each cycle." }),
  cycle_upgrade: F({ name: "Cycle Upgrade", slot: "passive", license: "mining_upgrades", icon: null, power: 2, disposition: 18,
    stats: { laserCycle: 0.08 }, scale: { laserCycle: "pct" }, desc: "Runs the mining lasers and strip miners hot for shorter cycles." }),
  range_upgrade: F({ name: "Range Upgrade", slot: "passive", license: "mining_upgrades", icon: null, power: 1, disposition: 16,
    stats: { laserRange: 0.10 }, scale: { laserRange: "pct" }, desc: "Focusing optics that let the mining lasers and strip miners reach farther." }),
  target_range_upgrade: F({ name: "Targeting Range Upgrade", slot: "passive", license: "electronics", icon: null, power: 1, disposition: 14,
    stats: { targetRange: 0.15 }, scale: { targetRange: "pct" }, desc: "Stronger sensors: targets can be locked from farther away." }),
  armor_upgrade: F({ name: "Armor Upgrade", slot: "passive", license: "hull_upgrades", icon: null, power: 2, disposition: 18,
    stats: { armorDR: 0.05 }, scale: { armorDR: "pct" }, desc: "Plating that takes more of the damage the hull would." }),
  drone_upgrade: F({ name: "Drone Upgrade", slot: "passive", license: "drone_upgrades", icon: null, power: 1, disposition: 15,
    stats: { droneBonus: 0.10 }, scale: { droneBonus: "pct" }, desc: "Drones fly faster, work harder and burn less fuel." }),
  gyroscope: F({ name: "Gyroscope", slot: "passive", license: "engineering_upgrades", icon: null, power: 1, disposition: 14,
    stats: { accelBonus: 0.15 }, scale: { accelBonus: "pct" }, desc: "Gyroscopic dampers that let the ship pick up speed and turn sooner." }),
  locking_upgrade: F({ name: "Locking Upgrade", slot: "passive", license: "electronics", icon: null, power: 1, disposition: 14,
    stats: { lockBonus: 0.15 }, scale: { lockBonus: "pct" }, desc: "Faster targeting computers: locks complete sooner." }),
  target_tracker: F({ name: "Target Tracker", slot: "passive", license: "electronics", icon: null, power: 1, disposition: 14,
    stats: { targets: 1 }, scale: {}, count: [1, 2, 3], desc: "More targets can be locked at once." }),
  speed_upgrade: F({ name: "Speed Upgrade", slot: "passive", license: "engines", icon: null, power: 1, disposition: 16,
    stats: { propBonus: 0.10 }, scale: { propBonus: "pct" }, desc: "Strengthens the afterburner's and microwarp drive's speed boost." }),
  drone_bay_extender: F({ name: "Drone Bay Extender", slot: "passive", license: "drone_upgrades", icon: null, power: 1, disposition: 14,
    stats: { droneBay: 5 }, scale: { droneBay: "amt" }, desc: "Room for more drones in the drone bay." }),
};
// (owner) items that aren't modules: drones (launched by a Drone Link with a module from the cargo hold) and their fuel
export const ITEMS = {
  drone: { key: "drone", name: "Drone", m3: 5, icon: "modules/drone.png", desc: "A drone hull. Launched by a Drone Link, it carries a mining laser or a weapon from the cargo hold." },
  drone_fuel: { key: "drone_fuel", name: "Drone Fuel Block", m3: 0.1, icon: "modules/drone_fuel.png", desc: "Fuel for a drone: each drone launched takes one block." },
};
const round = (v) => Math.round(v * 1000) / 1000;
export const MODULES = {};
for (const [fam, f] of Object.entries(FAMILIES)) for (const [si, size] of SIZES.entries()) for (const tier of [1, 2]) {
  const key = fam + "_" + size + tier, st = {};
  for (const [k, v] of Object.entries(f.stats)) {
    const sc = f.scale[k];
    if (typeof v !== "number" || !sc) { st[k] = v; continue; }
    const base = sc === "amt" ? v * AMT_K[si] : sc === "range" ? v * RANGE_K[si] : v * PCT_K[si];
    st[k] = round(tier === 2 ? (k === "web" ? Math.min(0.9, base * T2) : base * T2) : base);
  }
  if (f.count) { const n = f.count[si]; if (fam === "drone_link") st.drones = n; else st.targets = n + (tier === 2 ? 1 : 0); }
  const kt = tier === 2 ? T2_COST : 1;
  MODULES[key] = { key, family: fam, size, tier, name: f.name + " " + SIZE_NAME[size] + " " + (tier === 2 ? "II" : "I"), slot: f.slot, kind: f.kind || null, license: f.license, icon: "modules/" + fam + (tier === 2 ? "_2" : "") + ".png",   // (owner's icons: scripts/gen/module_icons.py)
    power: round(f.power * COST_K[si] * kt), disposition: round(f.disposition * COST_K[si] * kt), m3: M3[si], desc: f.desc, ...(f.drone ? { droneable: true } : {}), ...st };
}
// the keys from before sizes and tiers: each is now its S I
export const ALIASES = { mining_laser: "mining_laser_s1", mining_drones: "drone_link_s1", afterburner_1: "afterburner_s1", cargo_expander: "cargo_upgrade_s1", inertia_stabilizer: "gyroscope_s1",
  mining_laser_upgrade: "yield_upgrade_s1", mining_beam_extender: "range_upgrade_s1", microwarp_drive: "microwarp_drive_s1", mining_overclocker: "cycle_upgrade_s1" };
export const itemKey = (k) => (typeof k === "string" ? ALIASES[k] || k : k);
// (owner) every ship starts with these in its cargo hold, once; and (owner: drones are items now) 2 drones in its drone
// bay and 10 fuel blocks
export const STARTER_KIT = [["mining_laser_s1", 2], ["drone_link_s1", 1], ["afterburner_s1", 1], ["cargo_upgrade_s1", 1], ["gyroscope_s1", 1], ["yield_upgrade_s1", 1], ["range_upgrade_s1", 1], ["cycle_upgrade_s1", 1], ["drone_fuel", 10]];
export const STARTER_DRONES = 2;
export const KIT_VERSION = 2;

/** (owner) a fitted module can be powered off: it keeps its disposition, uses no power and does nothing. */
export const isOff = (fit, kind, i) => !!(fit && fit.off && fit.off[kind] && fit.off[kind][i]);
export const stackPenalty = (n) => Math.exp(-((n / 2.67) ** 2));   // the nth (from 0) of the same kind counts this much
export const lv = (lic, k) => Math.max(0, Math.min(5, Math.floor(+((lic || {})[k]) || 0)));
const r2 = (v) => Math.round(v * 100) / 100;
/** A module's power and disposition for this pilot (its license's −5% per level). */
export function moduleCost(key, lic) {
  const m = MODULES[key]; if (!m) return { power: 0, disposition: 0 };
  const k = 1 - 0.05 * lv(lic, m.license);
  return { power: r2(m.power * k), disposition: r2(m.disposition * k) };
}
/** Can this hull fit this module (its size; a II needs its license at V)? null, or why not. */
export function fitProblem(T, key, lic) {
  const m = MODULES[key]; if (!m) return "Not a module";
  if (T.anySlot) return null;                              // (owner) an admin's ETA ship: anything
  if (SIZE_RANK[m.size] > (HULL_RANK[T.size] ?? 0)) return "Too large for this hull";
  if (m.tier === 2 && lv(lic, m.license) < 5) return "Needs its license at V";
  return null;
}
// the passive modules at work: those in passive slots (and, on an admin's ETA ship, owner: passives in active slots too)
const passives = (fit) => [...fit.passive.filter((k, i) => k && !isOff(fit, "passive", i)), ...(fit.any ? fit.active.filter((k, i) => MODULES[k] && MODULES[k].slot === "passive" && !isOff(fit, "active", i)) : [])];
// sum of a passive bonus over fitted modules, with diminishing returns
function stacked(list, field, strengthOf) {
  const vals = list.map((k) => MODULES[k]).filter((m) => m && m[field]).map((m) => m[field] * strengthOf(m)).sort((a, b) => b - a);
  return vals.reduce((t, v, i) => t + v * stackPenalty(i), 0);
}
/** Everything a fitted ship can do, for this pilot: power / disposition used, holds, speed and acceleration, targeting,
 *  armor, shield, the drones' numbers, and each active module's own numbers (`mods`, by active slot). */
export function shipCalc(T, fit, lic) {
  fit = { active: (fit && fit.active) || [], passive: (fit && fit.passive) || [], off: (fit && fit.off) || null, any: !!T.anySlot };
  let power = 0, disposition = 0;
  for (const kind of ["active", "passive"]) fit[kind].forEach((k, i) => { if (!k) return; const c = moduleCost(k, lic); disposition += c.disposition; if (!isOff(fit, kind, i)) power += c.power; });   // (owner) a module powered off uses disposition, not power
  const hb = Object.fromEntries((T.bonuses || []).map((b) => [b.key, b.per * lv(lic, T.license) / 100]));   // the hull's bonuses, per level of its class license
  const pas = passives(fit), pk = (m) => 1 + 0.1 * lv(lic, m.license);   // (a passive's bonus: +10% a level of its license)
  const S = (field) => stacked(pas, field, pk);
  const holdK = 1 + S("holdBonus"), accelK = 1 + S("accelBonus"), yieldK = 1 + S("laserYield"), rangeK = 1 + S("laserRange"), droneK = S("droneBonus");
  const cyc = pas.map((k) => MODULES[k]).filter((m) => m && m.laserCycle).map((m) => m.laserCycle * pk(m)).sort((a, b) => b - a).reduce((t, v, i) => t * (1 - v * stackPenalty(i)), 1);
  const dr = pas.map((k) => MODULES[k]).filter((m) => m && m.armorDR).map((m) => m.armorDR * pk(m)).sort((a, b) => b - a).reduce((t, v, i) => t * (1 - v * stackPenalty(i)), 1 - (T.armorDR || 0));
  const extra = pas.reduce((t, k) => t + ((MODULES[k] && MODULES[k].targets) || 0), 0), bay = pas.reduce((t, k) => t + ((MODULES[k] && MODULES[k].droneBay) || 0) * (MODULES[k] && MODULES[k].droneBay ? pk(MODULES[k]) : 0), 0);
  const holds = {}; for (const h of T.holds || []) holds[h.key] = h.key === "drones" ? Math.round(h.m3 + bay) : Math.round(h.m3 * holdK);
  const drone = { speedK: 1 + droneK, effK: 1 + droneK, fuelMs: Math.round(DRONE_FUEL_MS * (1 + droneK)) };
  const mods = fit.active.map((k) => (k ? modStats(k, lic, { hb, yieldK, rangeK, cyc, propK: 1 + S("propBonus") }) : null));
  return {
    power: r2(power), disposition: r2(disposition), powerMax: T.powerMax, dispositionMax: T.dispositionMax, holds,
    accel: T.accelKmps2 * accelK, speed: T.speedKmps,
    targetRange: r2(T.targetRangeKm * (1 + S("targetRange"))), lockMs: Math.round(T.lockMs * Math.max(0.2, 1 - S("lockBonus"))), maxTargets: T.maxTargets + extra,
    armorDR: r2(1 - dr), shieldMax: T.shield, drone, mods,
    mwd: fit.active.some((k, i) => MODULES[k] && MODULES[k].mwd && !isOff(fit, "active", i)) || fit.passive.some((k, i) => MODULES[k] && MODULES[k].mwd && !isOff(fit, "passive", i)),
  };
}
export const DRONE_FUEL_MS = 300_000;
export const DRONE_EFF = 0.3;            // a drone does this share of what its module would fitted (two mining-laser drones ≈ the old Mining Drones)   // (owner) how long a fuel block keeps a drone flying
/** One module's numbers as this pilot runs it (its license, the hull's bonuses, the ship's upgrades). */
export function modStats(key, lic, up = {}) {
  const m = MODULES[key]; if (!m) return null;
  const L = 1 + 0.05 * lv(lic, m.license), hb = up.hb || {}, o = { key, kind: m.kind };
  if (m.kind === "mining") Object.assign(o, { yield: r2(m.yield * L * (1 + (hb.laser_yield || 0)) * (up.yieldK || 1)), cycleMs: Math.round(m.cycleMs * (up.cyc || 1)), rangeKm: r2(m.rangeKm * L * (1 + (hb.laser_range || 0)) * (up.rangeK || 1)), waste: m.waste || 0 });
  else if (m.kind === "drones") Object.assign(o, { drones: m.drones, rangeKm: r2(m.rangeKm * L) });
  else if (m.kind === "weapon") Object.assign(o, { dmg: r2(m.dmg * L), cycleMs: m.cycleMs, rangeKm: r2(m.rangeKm * L), shieldK: m.shieldK, hullK: m.hullK, flightKmps: m.flightKmps || 0, size: m.size });
  else if (m.kind === "prop") Object.assign(o, { speedBonus: r2(m.speedBonus * L * (up.propK || 1)) });
  else if (m.kind === "shield_ext" || m.kind === "remote_ext") Object.assign(o, { shieldAdd: Math.round(m.shieldAdd * L), rangeKm: m.rangeKm ? r2(m.rangeKm * L) : 0 });
  else if (m.kind === "web") Object.assign(o, { web: Math.min(0.9, r2(m.web * L)), rangeKm: r2(m.rangeKm * L) });
  else if (m.kind === "tractor") Object.assign(o, { rangeKm: r2(m.rangeKm * L), pullKmps: r2(m.pullKmps * L) });
  else Object.assign(o, { amount: m.amount ? r2(m.amount * L) : 0, cycleMs: m.cycleMs || 0, rangeKm: m.rangeKm ? r2(m.rangeKm * L) : 0 });
  return o;
}
export const hullBonuses = (T, lic) => Object.fromEntries((T.bonuses || []).map((b) => [b.key, b.per * lv(lic, T.license) / 100]));
/** What one drone carrying this module does, for this pilot and ship (a mining laser's yield also takes the hull's
 *  drone bonus). */
export function droneStats(key, lic, calc, hb = {}) {
  const o = modStats(key, lic, {}); if (!o) return null; const k = DRONE_EFF * ((calc && calc.drone && calc.drone.effK) || 1);
  if (o.yield) o.yield = r2(o.yield * k * (1 + (hb.drone_yield || 0)));
  if (o.dmg) o.dmg = r2(o.dmg * k);
  return o;
}
