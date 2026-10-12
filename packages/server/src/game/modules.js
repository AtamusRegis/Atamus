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
import { readFileSync } from "node:fs";
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
// ---- (owner) weapons, from The Reach (scripts/gen/weapons_from_reach.mjs → weapons.json): four systems (Missile
// Launchers, Beams, Repeaters, Coilguns), each in four roles (Standard; Shield-breaker, Armor-breaker and Long-reach:
// Scorch / Quake / Cruise, Scatter / Etch / Point, Buckshot / Impact / Longrifle, Static / Breach / Rail), three sizes
// and two tiers; and their ammo in three kinds per size (Swift, standard, Heavy; tier I and II). The Reach's damage is
// scaled down to Atamus's hulls (DPS_K); its ranges are kept (m → km).
export const WEAPONS = JSON.parse(readFileSync(new URL("./weapons.json", import.meta.url), "utf8"));
export const DPS_K = 0.25;                                       // a Small Missile Launcher: ~6 damage a second
const SYS = {   // our weapon systems: base fitting (S I), cycle, license, ammo, and how each fires
  missile: { license: "missiles", power: 11, disposition: 7, cycleMs: 6000, ammo: "Missile", crystal: false, desc: "Fires missiles at a locked ship. They never miss, but take time to fly and do less to targets smaller or faster than their blast." },
  beam: { license: "beams", power: 12, disposition: 6, cycleMs: 1000, focusMs: 4000, ammo: "Beam Crystal", crystal: true, desc: "A continuous beam on a locked ship: it builds to full strength while it stays on one target. Crystals wear out slowly; damage stops almost dead past optimal range." },
  repeater: { license: "repeaters", power: 13, disposition: 7, cycleMs: 1500, spinMs: 2000, crit: 0.1, ammo: "Cartridge", crystal: false, desc: "Fast-firing cartridge guns: a moment to spin up, then the best tracking of any turret, with critical hits for double damage and a long falloff." },
  coilgun: { license: "coilguns", power: 12, disposition: 7, cycleMs: 6000, drPen: 0.15, ammo: "Slug", crystal: false, desc: "Charges, then fires one heavy slug that ignores 15% of the target's armor. Huge hits, slow rhythm." },
};
export const SIG = { frigate: 40, cruiser: 125, battleship: 400 };   // (The Reach) a hull's signature by size
const FLIGHT_KMPS = { s: 4, m: 3.5, l: 3 };                      // missile speed by size
const AMMO_M3 = { s: 0.01, m: 0.025, l: 0.05 }, CRYSTAL_M3 = { s: 0.1, m: 0.25, l: 0.5 };
export const CRYSTAL_SHOTS = 60;                                  // (The Reach: crystals wear out slowly) cycles a beam crystal lasts
const ROLE_KEY = { std: "", shield: "_shield", armor: "_armor", long: "_long" };
for (const [sys, S] of Object.entries(SYS)) {
  const W = WEAPONS.systems[sys];
  for (const role of ["std", "shield", "armor", "long"]) {
    const R = WEAPONS.roles[role], fam = sys + ROLE_KEY[role], base = W.base === "Beam" ? "Beam" : W.base, name = (W.role_n[role] ? W.role_n[role] + " " : "") + base;
    FAMILIES[fam] = { name, slot: "active", kind: "weapon", license: S.license, power: S.power * R.pg, disposition: S.disposition * R.cpu, weapon: true, desc: S.desc + (role === "std" ? "" : " " + WEAPONS.roles[role].n + ".") };
    for (const [si, size] of SIZES.entries()) for (const tier of [1, 2]) {
      const row = W.rows[size][role], h = row.hit, k = tier === 2 ? T2 : 1, kt = tier === 2 ? T2_COST : 1, dps = row.dps * DPS_K * k;
      const st = { sys, role, dps: round(dps), dmg: round(dps * S.cycleMs / 1000), cycleMs: S.cycleMs, rangeKm: round(row.range / 1000), shieldK: round(W.lean.sh * R.sh), hullK: round(W.lean.ar * R.ar) };
      if (sys === "missile") Object.assign(st, { maxKm: round(h.rng / 1000), er: h.er, ev: h.ev, flightKmps: FLIGHT_KMPS[size] });
      else Object.assign(st, { opt: round(h.opt / 1000), fall: round(h.fall / 1000), trk: h.trk, res: h.res, maxKm: round((h.opt + 2 * h.fall) / 1000) });
      if (S.focusMs) st.focusMs = S.focusMs; if (S.spinMs) st.spinMs = S.spinMs; if (S.crit) st.crit = S.crit; if (S.drPen) st.drPen = S.drPen;
      const key = fam + "_" + size + tier;
      MODULES[key] = { key, family: fam, size, tier, name: name + " " + SIZE_NAME[size] + " " + (tier === 2 ? "II" : "I"), slot: "active", kind: "weapon", license: S.license, icon: "modules/" + fam + (tier === 2 ? "_2" : "") + ".png",
        power: round(S.power * R.pg * COST_K[si] * kt), disposition: round(S.disposition * R.cpu * COST_K[si] * kt), m3: M3[si], desc: FAMILIES[fam].desc, droneable: size === "s", ...st };
    }
  }
  // its ammo: Swift (closer, harder, quicker), standard, Heavy (farther, slower); a II's bonuses 30% stronger
  for (const sub of ["swift", "std", "heavy"]) for (const [si, size] of SIZES.entries()) for (const tier of [1, 2]) {
    const U = WEAPONS.subs[sub], b = (v) => round(tier === 2 ? 1 + (v - 1) * T2 : v), key = "ammo_" + sys + "_" + sub + "_" + size + tier;
    ITEMS[key] = { key, ammo: sys, sub, size, tier, name: (sub === "std" ? "" : U.n + " ") + S.ammo + " " + SIZE_NAME[size] + " " + (tier === 2 ? "II" : "I"), m3: (S.crystal ? CRYSTAL_M3 : AMMO_M3)[size],
      icon: "modules/ammo_" + sys + "_" + sub + (tier === 2 ? "_2" : "") + ".png", dmg: sub === "std" && tier === 2 ? 1.05 : b(U.dmg), range: b(U.range), app: b(U.app), cyc: b(U.cyc), vel: b(U.vel),
      desc: S.ammo + " for " + SIZE_NAME[size] + " " + (sys === "missile" ? "missile launchers" : sys + "s") + (S.crystal ? " (each lasts " + CRYSTAL_SHOTS + " cycles)." : ".") };
  }
}
/** The ammo a weapon can load (its system and size). */
export const ammoFits = (wkey, akey) => { const m = MODULES[wkey], a = ITEMS[akey]; return !!(m && a && m.kind === "weapon" && a.ammo === m.sys && a.size === m.size); };

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
  else if (m.kind === "weapon") { const pick = ["sys", "role", "cycleMs", "rangeKm", "maxKm", "opt", "fall", "trk", "res", "er", "ev", "flightKmps", "shieldK", "hullK", "focusMs", "spinMs", "crit", "drPen", "size"]; for (const k of pick) if (m[k] != null) o[k] = m[k]; o.dmg = r2(m.dmg * L); }
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
