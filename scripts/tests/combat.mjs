// (owner, 2026-10-11) modules in sizes and tiers, combat, wrecks and drones as items. Drives the World directly, on a
// fake clock.
import { suite } from "./lib.mjs";
const t = suite("combat");
let T0 = Date.now(); Date.now = () => T0;
const { World } = await import("../../packages/server/src/game/world.js");
const { MODULES, ITEMS, FAMILIES, SIZES, T2, shipCalc, fitProblem, modStats } = await import("../../packages/server/src/game/modules.js");
const { SHIP_TYPES } = await import("../../packages/server/src/game/constants.js");
const { LICENSES } = await import("../../packages/server/src/licenses.js");
const run = (w, sec) => { for (let i = 0; i < Math.round(sec * 20); i++) { T0 += 50; w.tick(0.05); } };
const P = SHIP_TYPES.chisel;

// ---- the catalog ----
const fams = Object.keys(FAMILIES);
t.ok(["mining_laser", "strip_miner", "drone_link", "tractor_beam", "shield_recharger", "shield_extender", "afterburner", "microwarp_drive", "missile", "beam", "slug", "railgun", "warp_scrambler", "stasis_webifier", "remote_shield_booster", "remote_shield_extender", "repair_drone"].every((f) => FAMILIES[f].slot === "active")
  && ["cargo_upgrade", "yield_upgrade", "cycle_upgrade", "range_upgrade", "target_range_upgrade", "armor_upgrade", "drone_upgrade", "gyroscope", "locking_upgrade", "target_tracker", "speed_upgrade", "drone_bay_extender"].every((f) => FAMILIES[f].slot === "passive"), "every module the owner listed, active and passive");
t.ok(fams.every((f) => SIZES.every((z) => [1, 2].every((n) => MODULES[f + "_" + z + n]))) && Object.keys(MODULES).length === fams.length * 6, "each in S, M and L, I and II (owner)");
t.ok(MODULES.railgun_s1.power < MODULES.railgun_m1.power && MODULES.railgun_m1.power < MODULES.railgun_l1.power && MODULES.railgun_s1.dmg < MODULES.railgun_m1.dmg && MODULES.railgun_m1.rangeKm < MODULES.railgun_l1.rangeKm, "smaller ones use less power and disposition and do less (owner)");
t.ok(Math.abs(MODULES.beam_s2.dmg / MODULES.beam_s1.dmg - T2) < 1e-6 && Math.abs(MODULES.cargo_upgrade_s2.holdBonus / MODULES.cargo_upgrade_s1.holdBonus - T2) < 1e-6 && T2 === 1.3, "a II's bonuses are 30% stronger (owner)");
t.ok(fams.every((f) => LICENSES.some((l) => l.key === FAMILIES[f].license)), "every module family has its license (owner: respective skills)");
t.ok(MODULES.slug_s1.name === "Slug Cannon S I" && MODULES.remote_shield_booster_m2.name === "Remote Shield Recharger M II" && MODULES.mining_laser_s1.icon === "modules/mining_laser.png" && MODULES.mining_laser_s2.icon === "modules/mining_laser_2.png", "names and icons from the owner's sheet");
t.ok(ITEMS.drone && ITEMS.drone_fuel && P.holds.some((h) => h.key === "drones"), "drones and fuel blocks are items; hulls have a drone bay (owner)");
t.ok(!fitProblem(P, "beam_s1", {}) && fitProblem(P, "beam_m1", {}) === "Too large for this hull" && fitProblem(SHIP_TYPES.magistrate, "beam_s1", {}) === null && fitProblem(SHIP_TYPES.constable, "beam_l1", {}) === "Too large for this hull", "a hull fits its own size or smaller (owner)");
t.ok(fitProblem(P, "beam_s2", { beams: 4 }) === "Needs its license at V" && !fitProblem(P, "beam_s2", { beams: 5 }), "a II needs its license at V (owner)");
t.ok(P.armorDR === 0.1 && !("armor" in P) && SHIP_TYPES.adm_magistrate.armorDR === 0.99, "armor is a damage reduction share, not points (owner)");
{ const c = shipCalc(P, { active: [], passive: ["armor_upgrade_s1", "armor_upgrade_s1"] }, {}), one = shipCalc(P, { active: [], passive: ["armor_upgrade_s1"] }, {});
  t.ok(one.armorDR > 0.1 && c.armorDR > one.armorDR && c.armorDR - one.armorDR < one.armorDR - 0.1, "Armor Upgrades raise it, with diminishing returns (owner)", [one.armorDR, c.armorDR]); }
{ const c = shipCalc(P, { active: [], passive: ["target_tracker_s1", "locking_upgrade_s1", "target_range_upgrade_s1", "drone_bay_extender_s1"] }, {});
  t.ok(c.maxTargets === 6 && c.lockMs < P.lockMs && c.targetRange > P.targetRangeKm && c.holds.drones === 15, "Target Tracker, Locking and Targeting Range Upgrades, Drone Bay Extender", c); }

// ---- combat ----
const w = new World({ eta: false }), notes = { a: [], b: [] };
for (const [id, n] of [["a", "Ann"], ["b", "Bea"]]) w.addPlayer(id, id.toUpperCase(), (m) => { const x = JSON.parse(m); notes[id].push(x); }, null, [{ id: id === "a" ? 1 : 2, name: n, start: "earth", licenses: { mining_frigate: 1 } }]);
w.eta.respond = () => {};   // (the ETA is tested in eta.mjs)
run(w, 0.1);
const a = w.ships.get("a:ship:1"), b = w.ships.get("b:ship:2");
const place = (s, x, y) => Object.assign(s, { x, y, tx: x, ty: y, vx: 0, vy: 0, moving: false, docked: false });
place(a, 5000, 5000); place(b, 5003, 5000);
const fit = (s, active, passive = []) => { s.fit.active = [...active, ...Array(4 - active.length).fill(null)]; s.fit.passive = [...passive, ...Array(3 - passive.length).fill(null)]; s.fit.off = { active: Array(4).fill(false), passive: Array(3).fill(false) }; w._recalc(s); };
fit(a, ["beam_s1", "warp_scrambler_s1", "stasis_webifier_s1"]);
w.cmdModule("a", a.id, 0, true); t.ok(a.act[0] && a.act[0].standby, "a weapon with no locked ship waits on standby");
const sh0 = b.shield; w.cmdLock("a", a.id, "ship", b.id); run(w, 3.1);
t.ok(a.act[0].tg === b.id && sh0 - b.shield > 20 * 1.2 - 1 && sh0 - b.shield < 20 * 1.2 + 0.1, "on the lock it fires: a beam's 20 damage, ×1.2 against shields", [sh0, b.shield]);
t.ok(a.crim && w.snapshotFor(w.players.get("a")).ships.find((x) => x.id === a.id).crim === 1, "firing on a ship flags the attacker (ETA)");
w.cmdModule("a", a.id, 1, true); w.cmdModule("a", a.id, 2, true); run(w, 0.1);
t.ok(b.scram && b.web && Math.abs(b.speed - P.speedKmps * 0.5) < 1e-9, "a Warp Scrambler holds it, a Stasis Webifier halves its speed", [b.scram, b.speed]);
w.cmdAlign("b", b.id, "station", true); t.ok(notes.b.some((n) => n.text === "Warp scrambled"), "scrambled, it can't warp");
const snapB = w.snapshotFor(w.players.get("a")).ships.find((x) => x.id === a.id);
t.ok(snapB.targets[0].sh < 1 && snapB.targets[0].hl === 1 && snapB.beams.some((x) => x.m === "beam_s1" && x.tg === b.id), "the attacker sees its target's shield and hull, everyone the shots", snapB.targets);
// shield, then hull less armor
b.shield = 0; const hp0 = b.hp; w._damage(b, 20, 1.2, 0.8, a);
t.ok(Math.abs(hp0 - b.hp - 20 * 0.8 * (1 - 0.1)) < 1e-6, "with the shield down, the hull takes it, less armor damage reduction (and a beam's ×0.8 against hulls)", [hp0, b.hp]);
// remote help, a ship's own shield recharger
const c = w.ships.get("a:ship:1"); w.addPlayer("c", "C", () => {}, null, [{ id: 3, name: "Cy", start: "earth", licenses: {} }]); run(w, 0.05);
const cs = w.ships.get("c:ship:3"); place(cs, 5001, 5002); fit(cs, ["remote_shield_booster_s1", "repair_drone_s1", "shield_recharger_s1"]);
w.cmdLock("c", cs.id, "ship", b.id); w.cmdLock("c", cs.id, "ship", cs.id); run(w, 3.1);
const bs = b.shield, bh = b.hp; w.cmdModule("c", cs.id, 0, true); w.cmdModule("c", cs.id, 1, true); run(w, 0.1);
t.ok(cs.act[0].tg === b.id && cs.act[1].tg === b.id && b.hp > bh && cs.targets.length === 1, "a Remote Shield Recharger and a Repair Drone work on another locked ship (never their own)", [cs.act[1], b.hp, bh]);
cs.shield = 100; w.cmdModule("c", cs.id, 2, true); run(w, 5.1); t.ok(cs.shield > 120, "a Shield Recharger restores the ship's own shield", cs.shield);
for (let i = 0; i < 3; i++) w.cmdModule("c", cs.id, i, false);
// a shield extender
fit(cs, ["shield_extender_s1", "afterburner_s1", "microwarp_drive_s1"]); const sm = cs.shieldMax; w.cmdModule("c", cs.id, 0, true);
t.ok(cs.shieldMax === sm + 150, "a Shield Extender raises shield capacity while it runs", [sm, cs.shieldMax]);
w.cmdModule("c", cs.id, 2, true); t.ok(Math.abs(cs.speed - P.speedKmps * 5) < 1e-9 && cs.calc.mwd, "a Microwarp Drive: +400% while on; fitted, it reaches other planetary systems (owner)", cs.speed);
// destroyed
const r0 = Math.random; let rolls = 0; Math.random = () => (rolls++ % 4 === 0 ? 0.1 : 0.9);   // (one in four: under 25%)
b.holds.cargo = { railgun_s1: 4, drone_fuel: 4 }; b.holds.ore = { "ore:ironstone": 100 };
fit(b, ["mining_laser_s1", "afterburner_s1", "beam_s1", "slug_s1"]); b.shield = 0; b.hp = 1; b.crim = { since: 0, vs: [] };
w._damage(b, 50, 1, 1, a); Math.random = r0;
const wr = [...w.wrecks.values()].find((x) => x.name === "Bea's Prospector Wreck");
t.ok(wr && wr.items.mining_laser_s1 === 1 && !wr.items.afterburner_s1 && wr.items["ore:ironstone"] === 50, "destroyed: a wreck with a share of what it had (fitted modules 25% each, owner)", wr && wr.items);
t.ok(b.docked === "station" && b.hp === P.hp && b.shield === b.shieldMax && b.fit.active[0] === "mining_laser_s1" && !b.fit.active[1] && !Object.keys(b.holds.cargo).length && !b.crim, "its pilot is back docked at their starting station in a new Prospector (the flag gone)", b);
t.ok(notes.b.some((n) => n.text === "Your ship was destroyed") && !a.targets.some((g) => g.id === b.id), "they're told; locks on it are gone");
let killed = null; w.onKill = (k) => { killed = k; }; let looted = null; w.onLoot = (l) => { looted = l; };
place(b, 5003, 5000); b.shield = 0; b.hp = 1; w._damage(b, 50, 1, 1, a); t.ok(killed && killed.killer === "a" && killed.victim === "b", "kills go to the trade watch (owner)");
// wrecks: open beside it, take, tractor
const wid = wr.id; place(a, wr.x + 4.5, wr.y); w.cmdLoot("a", a.id, wid);
t.ok(notes.a.at(-1).t === "wreck" && notes.a.at(-1).far, "a wreck opens only beside it");
fit(a, ["tractor_beam_s1"]); w.cmdLock("a", a.id, "wreck", wid); run(w, 3.1); w.cmdModule("a", a.id, 0, true); run(w, 20);
t.ok(Math.hypot(wr.x - a.x, wr.y - a.y) < 1.2 && w.snapshotFor(w.players.get("a")).wrecks.some((x) => x.id === wid), "a Tractor Beam pulls a locked wreck in", Math.hypot(wr.x - a.x, wr.y - a.y));
w.cmdLoot("a", a.id, wid); t.ok(notes.a.at(-1).items && notes.a.at(-1).items.mining_laser_s1 === 1, "beside it, its contents");
a.holds.cargo = {}; w.cmdTake("a", a.id, wid, "mining_laser_s1"); w.cmdTake("a", a.id, wid, "ore:ironstone");
t.ok(a.holds.cargo.mining_laser_s1 === 1 && a.holds.ore["ore:ironstone"] === 50 && !wr.items.mining_laser_s1 && looted && looted.from === "b" && looted.to === "a", "take: modules to the cargo hold, ore to the ore hold; someone else's wreck is loot (trade watch)", [a.holds, looted]);
a.holds.drones = {}; for (const k of Object.keys(wr.items)) w.cmdTake("a", a.id, wid, k); t.ok(!w.wrecks.has(wid), "an emptied wreck goes", wr.items);

// ---- weapon drones, fuel ----
const d = new World({ eta: false }), dn = [];
d.addPlayer("a", "A", (m) => dn.push(JSON.parse(m)), null, [{ id: 1, name: "Ann", start: "earth", licenses: {} }]); d.addPlayer("b", "B", () => {}, null, [{ id: 2, name: "Bea", start: "earth", licenses: {} }]);
d.eta.respond = () => {}; run(d, 0.1);
const da = d.ships.get("a:ship:1"), db = d.ships.get("b:ship:2"); place(da, 9000, 9000); place(db, 9004, 9000);
da.fit.active = ["drone_link_s1", null, null, null]; d._recalc(da); da.holds.cargo.beam_s1 = 3; da.holds.cargo.beam_m1 = 1;
d.cmdModule("a", da.id, 0, true, { item: "beam_m1", n: 2 }); t.ok(!da.act[0] && dn.at(-1).text === "Unable to launch more drones", "drones carry S modules");
d.cmdLock("a", da.id, "ship", db.id); run(d, 3.1);
d.cmdModule("a", da.id, 0, true, { item: "beam_s1", n: 5 });
t.ok(da.act[0] && da.act[0].drones.n === 2 && da.act[0].tg === db.id && da.holds.cargo.beam_s1 === 1, "no more than the link controls (S: 2), each with a module (owner)", da.act[0]);
const s1 = db.shield; run(d, 8); t.ok(db.shield < s1, "weapon drones fly out and fire on the target", [s1, db.shield]);
db.x = da.x + 30; run(d, 0.1); t.ok(da.act[0] && da.act[0].ret, "out past the link's control range they come home");
run(d, 30); t.ok(!da.act[0] && da.holds.drones.drone === 2 && da.holds.cargo.beam_s1 === 3, "home again: drones in the bay, modules in the cargo hold");
db.x = da.x + 4; d.cmdLock("a", da.id, "ship", db.id); run(d, 3.1); d.cmdModule("a", da.id, 0, true, { item: "beam_s1", n: 2 }); run(d, 1); da.act[0].drones.until = T0 - 1; run(d, 0.1);
t.ok(!da.act[0] && [...d.wrecks.values()].some((x) => x.name === "Lost Drones" && x.items.drone === 2 && x.items.beam_s1 === 2) && dn.some((m) => m.text === "Drones ran out of fuel"), "out of fuel before they're home: disconnected, lost to a wreck (owner)");
da.holds.cargo.drone_fuel = 0; da.holds.drones.drone = 2; d.cmdModule("a", da.id, 0, true, { item: "beam_s1", n: 1 }); t.ok(!da.act[0] && dn.at(-1).text === "Unable to launch more drones", "no fuel: unable to launch (owner)");

// ---- the ETA fights back ----
const e = new World(), en = [];
e.addPlayer("a", "A", (m) => en.push(JSON.parse(m)), null, [{ id: 1, name: "Ann", start: "mars", licenses: {} }]); run(e, 0.1);
const ea = e.ships.get("a:ship:1"); e.aggress(ea.id, null);
run(e, 90);
t.ok(en.some((m) => m.text === "Your ship was destroyed") && !ea.crim && ea.docked, "the ETA's officers fire on what they hunt, until it's dead (owner)");
{ const o = e.eta.officers().find((x) => x.role === "ready" && x.type === "deputy"); place(ea, o.x + 2, o.y); ea.docked = false; const n0 = e.eta.officers().length;
  e._damage(o, 1e6, 1, 1, ea); t.ok(!e.ships.has(o.id) && ea.crim && e.eta.cases.get(ea.id) && e.eta.cases.get(ea.id).units.size >= 2 + 3, "an officer destroyed: its killer is flagged and more come (escalation)"); }
t.ok(SHIP_TYPES.deputy.lengthKm < 0.1 && !SHIP_TYPES.deputy.artRot, "the Deputy faces the way every sprite does (owner)");
t.done();
