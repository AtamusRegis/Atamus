// Modules (owner, 2026-10-11): fitted into a hull's active slots (on the hotbar, switched on and off) or passive
// slots (always on). Each costs power and disposition from the hull's maximums. Balance (owner: "balance it for me"):
//
//   Prospector budget 40 power / 70 disposition, 4 active + 3 passive slots. Untrained, two lasers + drones +
//   afterburner (36 / 51) leave room for one passive; with the module licenses at V (−25% power and disposition)
//   a full fit of 2 lasers, drones, afterburner and three upgrades just fits.
//
// Licenses (licenses.js), 5 levels each, none needed to fit a module:
//   Mining Lasers V    +5% laser yield and range per level; −5% laser power / disposition per level
//   Mining Drones V    +5% drone yield and range per level; −5% drone power / disposition per level
//   Mining Upgrades V  +10% to the yield / range / cycle upgrades' bonuses per level; −5% their power / disposition
//   Engineering Up. V  +10% to the Cargo Expander's and Inertia Stabilizer's bonuses per level; −5% their p/d
//   Engines V          +10% to the afterburner's speed bonus per level; −5% its power / disposition
// (owner) a license's power / disposition cut applies to the modules it names, not to what they upgrade.
// Same-kind passives stack with diminishing returns (EVE's curve: 100%, 87%, 57%, 28%…).
export const MODULES = {
  mining_laser: { name: "Mining Laser", slot: "active", power: 8, disposition: 12, m3: 5, license: "mining_lasers", icon: "modules/mining_laser.png",
    yield: 10, cycleMs: 15_000, rangeKm: 3, desc: "Cuts ore from a locked asteroid. The ore lands in the ore hold when each cycle completes." },
  mining_drones: { name: "Mining Drones", slot: "active", power: 10, disposition: 15, m3: 5, license: "mining_drones", icon: "modules/mining_drones.png",
    yield: 25, cycleMs: 60_000, rangeKm: 5, desc: "A pair of mining drones that fly to a locked asteroid and mine it. The ore lands in the ore hold when each cycle completes." },
  afterburner_1: { name: "Afterburner I", slot: "active", power: 10, disposition: 12, m3: 5, license: "engines", icon: "modules/afterburner.png",
    speedBonus: 0.75, desc: "Burns extra fuel through the engines for more top speed while it's on." },
  cargo_expander: { name: "Cargo Expander", slot: "passive", power: 4, disposition: 10, m3: 5, license: "engineering_upgrades", icon: "modules/cargohold_expansion.png",
    holdBonus: 0.15, desc: "Reinforced bulkheads that make room in the ship's holds." },
  inertia_stabilizer: { name: "Inertia Stabilizer", slot: "passive", power: 4, disposition: 10, m3: 5, license: "engineering_upgrades", icon: "components/gyroscope.png",
    accelBonus: 0.15, desc: "Gyroscopic dampers that let the ship pick up speed and turn sooner." },
  mining_laser_upgrade: { name: "Mining Laser Upgrade", slot: "passive", power: 5, disposition: 10, m3: 5, license: "mining_upgrades", icon: "modules/mining_laser_upgrade.png",
    laserYield: 0.05, desc: "Tunes the mining lasers for more ore each cycle." },
  mining_beam_extender: { name: "Mining Beam Extender", slot: "passive", power: 5, disposition: 10, m3: 5, license: "mining_upgrades", icon: "components/sensor_dish.png",
    laserRange: 0.10, desc: "Focusing optics that let the mining lasers reach farther." },
  mining_overclocker: { name: "Mining Overclocker", slot: "passive", power: 6, disposition: 10, m3: 5, license: "mining_upgrades", icon: "components/processor_chip.png",
    laserCycle: 0.08, desc: "Runs the mining lasers hot for shorter cycles." },
};
for (const [k, m] of Object.entries(MODULES)) m.key = k;
// (owner) every ship starts with these in its cargo hold, once
export const STARTER_KIT = [["mining_laser", 2], ["mining_drones", 1], ["afterburner_1", 1], ["cargo_expander", 1], ["inertia_stabilizer", 1], ["mining_laser_upgrade", 1], ["mining_beam_extender", 1], ["mining_overclocker", 1]];

export const stackPenalty = (n) => Math.exp(-((n / 2.67) ** 2));   // the nth (from 0) of the same kind counts this much
const lv = (lic, k) => Math.max(0, Math.min(5, Math.floor(+((lic || {})[k]) || 0)));
const r2 = (v) => Math.round(v * 100) / 100;
/** A module's power and disposition for this pilot (its license's −5% per level). */
export function moduleCost(key, lic) {
  const m = MODULES[key]; if (!m) return { power: 0, disposition: 0 };
  const k = 1 - 0.05 * lv(lic, m.license);
  return { power: r2(m.power * k), disposition: r2(m.disposition * k) };
}
// sum of a passive bonus over fitted modules of a kind, with diminishing returns
function stacked(fit, field, strength) {
  const vals = fit.passive.map((k) => MODULES[k]).filter((m) => m && m[field]).map((m) => m[field] * strength).sort((a, b) => b - a);
  return vals.reduce((t, v, i) => t + v * stackPenalty(i), 0);
}
/** Everything a fitted ship can do, for this pilot: what's used of power / disposition, the hold capacities, top
 *  speed (and with the afterburner on), acceleration, and each mining module's yield / cycle / range. */
export function shipCalc(T, fit, lic) {
  fit = { active: (fit && fit.active) || [], passive: (fit && fit.passive) || [] };
  let power = 0, disposition = 0;
  for (const k of [...fit.active, ...fit.passive]) if (k) { const c = moduleCost(k, lic); power += c.power; disposition += c.disposition; }
  const MF = lv(lic, T.license), ML = lv(lic, "mining_lasers"), MD = lv(lic, "mining_drones"), MU = lv(lic, "mining_upgrades"), EU = lv(lic, "engineering_upgrades"), EN = lv(lic, "engines");
  const hb = Object.fromEntries((T.bonuses || []).map((b) => [b.key, b.per * MF / 100]));   // the hull's bonuses, per level of its class license
  const mu = 1 + 0.1 * MU, eu = 1 + 0.1 * EU;
  const holdK = 1 + stacked(fit, "holdBonus", eu), accelK = 1 + stacked(fit, "accelBonus", eu);
  const L = MODULES.mining_laser, D = MODULES.mining_drones;
  // the cycle upgrade cuts time: each one multiplies the cycle by (1 − its bonus), with the same diminishing returns
  const cyc = fit.passive.map((k) => MODULES[k]).filter((m) => m && m.laserCycle).map((m) => m.laserCycle * mu).sort((a, b) => b - a).reduce((t, v, i) => t * (1 - v * stackPenalty(i)), 1);
  return {
    power: r2(power), disposition: r2(disposition), powerMax: T.powerMax, dispositionMax: T.dispositionMax,
    holds: Object.fromEntries((T.holds || []).map((h) => [h.key, Math.round(h.m3 * holdK)])),
    accel: T.accelKmps2 * accelK, speed: T.speedKmps, abSpeed: T.speedKmps * (1 + MODULES.afterburner_1.speedBonus * (1 + 0.1 * EN)),
    laser: { yield: r2(L.yield * (1 + (hb.laser_yield || 0)) * (1 + 0.05 * ML) * (1 + stacked(fit, "laserYield", mu))), cycleMs: Math.round(L.cycleMs * cyc), rangeKm: r2(L.rangeKm * (1 + (hb.laser_range || 0)) * (1 + 0.05 * ML) * (1 + stacked(fit, "laserRange", mu))) },
    drones: { yield: r2(D.yield * (1 + (hb.drone_yield || 0)) * (1 + 0.05 * MD)), cycleMs: D.cycleMs, rangeKm: r2(D.rangeKm * (1 + 0.05 * MD)) },
  };
}
