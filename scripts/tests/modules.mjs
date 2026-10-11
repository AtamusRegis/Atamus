// Modules, mining and the Station (docs/FEATURES.md › Modules, The Station). Drives the World directly.
import { World } from "../../packages/server/src/game/world.js";
import { MODULES, shipCalc, moduleCost, stackPenalty } from "../../packages/server/src/game/modules.js";
import { SHIP_TYPES } from "../../packages/server/src/game/constants.js";
import { STATION } from "../../packages/server/src/game/station.js";
import { suite } from "./lib.mjs";
const t = suite("modules");
const T = SHIP_TYPES.chisel, notes = [];
const w = new World(), a = w.addPlayer("a", "A", (m) => { const x = JSON.parse(m); if (x.t === "notice") notes.push(x.text); }, null, [{ id: 1, name: "Ann", licenses: { mining_frigate: 1 } }]);
w.addPlayer("b", "B", () => {}, null, [{ id: 1, name: "Bo", licenses: {} }]); w.tick(0.05);
const s = w.ships.get("a:ship:1"), sb = w.ships.get("b:ship:1");
const lastNote = () => notes[notes.length - 1];

// the starter kit
t.ok(JSON.stringify(s.holds.cargo) === '{"mining_laser":2,"mining_drones":1,"afterburner_1":1,"cargo_expander":1,"inertia_stabilizer":1,"mining_laser_upgrade":1,"mining_beam_extender":1,"mining_overclocker":1}', "every ship starts with the starter kit in its cargo hold", s.holds.cargo);
t.ok(["mining_laser", "mining_drones", "afterburner_1"].every((k) => MODULES[k].slot === "active") && ["cargo_expander", "inertia_stabilizer", "mining_laser_upgrade", "mining_beam_extender", "mining_overclocker"].every((k) => MODULES[k].slot === "passive"), "lasers, drones and the afterburner are active; the rest passive");

// fitting: the right kind of slot, from the cargo hold, within power and disposition
w.cmdFit("a", s.id, "cargo_expander", "active", 0); w.cmdFit("a", s.id, "mining_laser", "passive", 0); w.cmdFit("b", s.id, "mining_laser", "active", 0); w.cmdFit("a", s.id, "mining_laser", "active", 9); w.cmdFit("a", s.id, "nope", "active", 0);
t.ok(!s.fit.active.some(Boolean) && !s.fit.passive.some(Boolean), "only into a slot of its own kind, on your own ship, a real slot and module");
for (const [k, i] of [["mining_laser", 0], ["mining_laser", 1], ["mining_drones", 2], ["afterburner_1", 3]]) w.cmdFit("a", s.id, k, "active", i);
w.cmdFit("a", s.id, "cargo_expander", "passive", 0);
t.ok(s.fit.active.join() === "mining_laser,mining_laser,mining_drones,afterburner_1" && s.fit.passive[0] === "cargo_expander" && s.calc.power === 40, "untrained, two lasers, drones, an afterburner and a Cargo Expander use exactly the 40 power", s.calc);
w.cmdFit("a", s.id, "mining_laser_upgrade", "passive", 1);
t.ok(!s.fit.passive[1] && lastNote() === "Not enough disposition", "past the hull's disposition it's refused", [s.fit.passive, lastNote()]);
// (owner) power: a module past the power is fitted powered off (disposition only); Power On needs the room
w.cmdUnfit("a", s.id, "passive", 0); w.cmdFit("a", s.id, "mining_laser_upgrade", "passive", 0);
t.ok(s.fit.passive[0] === "mining_laser_upgrade" && s.fit.off.passive[0] && lastNote() === "Not enough power: fitted offline" && s.calc.power === 36 && s.calc.disposition === 61, "past the power, a module is fitted powered off: disposition but no power", [s.fit.off, s.calc.power, s.calc.disposition]);
t.ok(shipCalc(T, s.fit, s.lic).laser.yield === shipCalc(T, { active: s.fit.active, passive: [] }, s.lic).laser.yield, "a powered-off module does nothing");
w.cmdPower("a", s.id, "passive", 0, true); t.ok(s.fit.off.passive[0] && lastNote() === "Not enough power", "Power On needs the power");
w.cmdPower("a", s.id, "active", 3, false); w.cmdPower("a", s.id, "passive", 0, true);
t.ok(s.fit.off.active[3] && !s.fit.off.passive[0] && s.calc.power === 31, "powering one off makes room for another", s.calc.power);
notes.length = 0; w.cmdModule("a", s.id, 3, true); t.ok(!s.act[3] && lastNote() === "Powered off", "a powered-off module can't be switched on");
w.cmdPower("a", s.id, "passive", 0, false); w.cmdPower("a", s.id, "active", 3, true); w.cmdUnfit("a", s.id, "passive", 0); w.cmdFit("a", s.id, "cargo_expander", "passive", 0);
t.ok(!s.fit.off.active[3] && s.fit.passive[0] === "cargo_expander" && !s.fit.off.passive[0] && s.calc.power === 40, "back to the full-power fit", s.calc);
t.ok(!s.holds.cargo.mining_laser && s.holds.cargo.mining_laser_upgrade === 1, "fitting takes the module out of the cargo hold");
const all5 = { mining_frigate: 1, mining_lasers: 5, mining_drones: 5, mining_upgrades: 5, engineering_upgrades: 5, engines: 5 };
const full = shipCalc(T, { active: ["mining_laser", "mining_laser", "mining_drones", "afterburner_1"], passive: ["mining_laser_upgrade", "mining_overclocker", "cargo_expander"] }, all5);
t.ok(full.power <= 40 && full.disposition <= 70, "with the module licenses at V a full seven-module fit fits", full);
t.ok(moduleCost("mining_laser", { mining_lasers: 5 }).power === 6 && moduleCost("mining_laser", { mining_upgrades: 5 }).power === 8 && moduleCost("mining_laser_upgrade", { mining_upgrades: 5 }).power === 3.75, "a license cuts the power of the modules it names, not of what they upgrade (owner)");
// bonuses
const c0 = shipCalc(T, { active: [], passive: [] }, {}), c1 = shipCalc(T, { active: [], passive: ["mining_laser_upgrade"] }, {}), c2 = shipCalc(T, { active: [], passive: ["mining_laser_upgrade", "mining_laser_upgrade"] }, {});
t.ok(Math.abs(c1.laser.yield / c0.laser.yield - 1.05) < 1e-3 && Math.abs(c2.laser.yield / c0.laser.yield - (1 + 0.05 + 0.05 * stackPenalty(1))) < 1e-3, "a Mining Laser Upgrade adds 5% yield; a second counts less (stacking)", [c0.laser, c1.laser, c2.laser]);
t.ok(shipCalc(T, { active: [], passive: ["mining_laser_upgrade"] }, { mining_upgrades: 5 }).laser.yield > c1.laser.yield, "Mining Upgrades strengthens the upgrade's bonus");
t.ok(shipCalc(T, { active: [], passive: [] }, { mining_frigate: 5 }).laser.yield === 12 && c0.drones.yield === 25, "the Prospector's hull bonus: +4% laser yield per Mining Frigate level", shipCalc(T, { active: [], passive: [] }, { mining_frigate: 5 }).laser);
t.ok(shipCalc(T, { active: [], passive: ["mining_overclocker"] }, {}).laser.cycleMs === 13800 && shipCalc(T, { active: [], passive: ["mining_beam_extender"] }, {}).laser.rangeKm === 3.3, "the Overclocker cuts the cycle 8%, the Beam Extender adds 10% range");
t.ok(s.calc.holds.ore === 5750 && s.calc.holds.cargo === 57, "a Cargo Expander adds 15% to both holds", s.calc.holds);
t.ok(shipCalc(T, { active: [], passive: ["inertia_stabilizer"] }, {}).accel > T.accelKmps2, "an Inertia Stabilizer adds acceleration");

// swapping and unfitting
w.cmdFit("a", s.id, "inertia_stabilizer", "passive", 0);
t.ok(s.fit.passive[0] === "inertia_stabilizer" && s.holds.cargo.cargo_expander === 1, "fitting onto a used slot swaps the old module back into the cargo hold");
w.cmdUnfit("a", s.id, "passive", 0);
t.ok(!s.fit.passive[0] && s.holds.cargo.inertia_stabilizer === 1, "unfitting puts it back in the cargo hold");
w.cmdUnfit("b", s.id, "active", 0); w.cmdUnfit("a", s.id, "active", 7); t.ok(s.fit.active[0] === "mining_laser", "only your own ship, a real slot");

// running: the afterburner; lasers and drones need a locked rock in range
w.cmdModule("a", s.id, 3, true);
t.ok(Math.abs(s.speed - s.calc.abSpeed) < 1e-9 && s.speed > T.speedKmps * 1.7, "the afterburner raises top speed while it's on", s.speed);
w.cmdModule("a", s.id, 3, false); t.ok(s.speed === T.speedKmps, "and off again");
const belt = [...w.pois.values()].find((p) => p.kind === "belt"), k = belt.field.rocks.find((r) => r.size === 1000) || belt.field.rocks[0];
const inb = Math.atan2(belt.y - k.y, belt.x - k.x);
Object.assign(s, { x: k.x + Math.cos(inb) * (k.r + 1), y: k.y + Math.sin(inb) * (k.r + 1), vx: 0, vy: 0 }); w.tick(0.05);
w.cmdModule("a", s.id, 0, true); w.cmdModule("a", s.id, 2, true);
t.ok(s.act[0] && s.act[0].standby && s.act[2] && s.act[2].standby && w.snapshotFor(a).ships.find((x) => x.id === s.id).act[0].sb === 1, "with no locked asteroid in range, a laser (or drones) waits on standby (owner)", s.act);
w.cmdLock("a", s.id, "rock", k.id); w.tick(0.05);
t.ok(s.act[0].standby, "still waiting while the lock comes on");
s.targets[0].lockAt = 0; w.tick(0.05);
t.ok(s.act[0] && s.act[0].tg === k.id && s.act[2] && s.act[2].tg === k.id, "on the first lock in range they start on it");
t.ok(Number.isFinite(s.act[0].ax) && Math.hypot(s.act[0].ax, s.act[0].ay) < k.r && [0, 1].includes(s.act[0].hp) && [2, 3].includes(w.ships.get(s.id).act[1] ? 2 : 2), "a laser picks a spot inside the rock and one of its arm's hardpoints for the cycle", s.act[0]);
const m0 = k.m3; s.act[0].at -= 15000; w.tick(0.05);
t.ok(Math.abs((s.holds.ore["ore:" + k.ore] || 0) - s.calc.laser.yield) < 1e-6 && Math.abs(k.m3 - (m0 - s.calc.laser.yield)) < 0.02, "each laser cycle moves its yield from the rock into the ore hold", [s.holds.ore, k.m3]);
const m1 = k.m3; s.act[2].at -= 60000; w.tick(0.05);
const h = s.act[2] && s.act[2].haul, hsnap = w.snapshotFor(a).ships.find((x) => x.id === s.id).beams.find((b) => b.m === "mining_drones");
t.ok(h && h.amt === s.calc.drones.yield && Math.abs(k.m3 - (m1 - h.amt)) < 0.02 && Math.abs(s.holds.ore["ore:" + k.ore] - s.calc.laser.yield) < 1e-6 && hsnap && hsnap.hl >= 0 && hsnap.hd === 2 * h.leg, "a drone cycle takes its yield from the rock, and the drones fly it to the ship (owner)", [h, hsnap]);
h.at -= h.leg; w.tick(0.05);
t.ok(Math.abs(s.holds.ore["ore:" + k.ore] - s.calc.laser.yield - s.calc.drones.yield) < 1e-6 && s.act[2].haul, "it lands in the ore hold when they reach the ship, then they fly back", s.holds.ore);
h.at -= h.leg; w.tick(0.05);
t.ok(s.act[2] && !s.act[2].haul && s.act[2].tg === k.id, "back at the rock, the next cycle starts", s.act[2]);
const snap = w.snapshotFor(a).ships.find((x) => x.id === s.id);
t.ok(snap.fit && snap.holds && snap.calc && snap.act[0].tg === k.id && snap.beams.length === 2 && snap.beams.every((b) => Number.isFinite(b.ax) && Number.isFinite(b.p) && b.c > 0), "your ship's snapshot carries its fit, holds, numbers and running modules; everyone sees the beams (spot, hardpoint, cycle)", snap.beams);
s.holds.ore["ore:" + k.ore] = s.calc.holds.ore - 1; s.act[0].at -= 15000; w.tick(0.05);
t.ok(!s.act[0] && Math.abs(Object.values(s.holds.ore).reduce((x, y) => x + y, 0) - s.calc.holds.ore) < 1e-6 && lastNote() === "Ore hold full", "a full ore hold stops the laser (only what fits is taken)", [s.act[0], lastNote()]);
w.cmdModule("a", s.id, 0, true); t.ok(!s.act[0], "and it won't start with the hold full");
s.holds.ore = {}; w.cmdModule("a", s.id, 0, true); w.cmdUnlock("a", s.id, "rock", k.id); w.tick(0.05);
t.ok(!s.act[0] && !s.act[2], "unlocking the rock stops what's mining it");
// (owner) Orbit: it circles the object at full speed, off its no-destination line
{ const ow = new World(); ow.addPlayer("o", "O", () => {}, null, [{ id: 1, name: "O", licenses: {} }]); ow.tick(0.05); const so = ow.ships.get("o:ship:1"), bo = [...ow.pois.values()].find((p) => p.kind === "belt"), ko = bo.field.rocks[0];
  Object.assign(so, { x: ko.x + 3, y: ko.y, vx: 0, vy: 0 }); ow.cmdChase("o", so.id, "rock", ko.id, "orbit");
  let minD = Infinity, maxD = 0, turned = 0, lastA = Math.atan2(so.y - ko.y, so.x - ko.x);
  for (let i = 0; i < 2400; i++) { ow.tick(0.05); if (i > 600) { const d = Math.hypot(so.x - ko.x, so.y - ko.y); minD = Math.min(minD, d); maxD = Math.max(maxD, d); const a2 = Math.atan2(so.y - ko.y, so.x - ko.x); let da = a2 - lastA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; turned += da; lastA = a2; } }
  t.ok(minD > ko.r + so.radius + 0.07 && maxD < ko.r + so.radius + 0.07 + 0.5 + 1.2 && Math.abs(turned) > 2 * Math.PI, "Orbit circles the object, never over it", { minD, maxD, turned, r: ko.r }); }
w.cmdLock("a", s.id, "rock", k.id); s.targets[0].lockAt = 0; w.tick(0.05); w.cmdModule("a", s.id, 0, true);
w._startWarp(s, [...w.pois.values()].find((p) => p.kind === "belt" && p !== belt), Date.now()); w.tick(0.05);
t.ok(!s.act.some(Boolean), "a warp switches every module off"); s.wp = null;
// a mined-out rock goes
const small = belt.field.rocks.find((r) => r !== k); const ver = belt.field.ver; w._mineRock(small.id, small.m3 + 1);
t.ok(!belt.field.rocks.includes(small) && belt.field.ver > ver, "a rock mined to nothing is gone");

// the Station: dock (flying there first from afar), the hangar, moving items, undock
const st = w.pois.get("station");
t.ok(st && st.kind === "station" && w.poisFor(a).some((p) => p.id === "station"), "the Station is a POI on everyone's map");
Object.assign(s, { x: STATION.x + 40, y: STATION.y, vx: 0, vy: 0, wp: null }); w.cmdDock("a", s.id);
t.ok(!s.docked && s.dockReq && s.moving, "out of range, Dock flies there first");
Object.assign(s, { x: STATION.x, y: STATION.y - 4 }); w.tick(0.05);
t.ok(s.docked && !s.moving && !s.targets.length, "then docks (within 5 km of its edge)");
t.ok(!w.snapshotFor(w.players.get("b")).ships.some((x) => x.id === s.id) && w.snapshotFor(a).ships.find((x) => x.id === s.id).docked, "a docked ship is out of space: others don't see it");
w.cmdMove("a", s.id, 0, 0); w.cmdLock("a", s.id, "rock", k.id); t.ok(!s.moving && !s.targets.length, "no orders while docked");
s.holds.ore = { "ore:ironstone": 100 }; w.cmdTransfer("a", { ship: s.id, hold: "ore" }, "hangar", "ore:ironstone");
t.ok(a.hangar["ore:ironstone"] === 100 && !s.holds.ore["ore:ironstone"], "ore moves from a docked ship into the hangar");
w.cmdTransfer("a", "hangar", { ship: s.id, hold: "cargo" }, "ore:ironstone", 1000);
const free = s.calc.holds.cargo - 45 - (s.holds.cargo.mining_laser_upgrade ? 0 : 0);
t.ok(s.holds.cargo["ore:ironstone"] > 0 && s.holds.cargo["ore:ironstone"] < 100 && a.hangar["ore:ironstone"] > 0, "into a ship's hold only what fits goes; the rest stays", [s.holds.cargo["ore:ironstone"], a.hangar["ore:ironstone"]]);
notes.length = 0; w.cmdTransfer("a", "hangar", { ship: s.id, hold: "ore" }, "mining_laser_upgrade"); w.cmdTransfer("a", { ship: s.id, hold: "cargo" }, { ship: s.id, hold: "ore" }, "mining_laser_upgrade");
t.ok(lastNote() === "The ore hold takes only ore" && s.holds.cargo.mining_laser_upgrade === 1, "the ore hold takes only ore");
w.cmdTransfer("b", "hangar", { ship: s.id, hold: "cargo" }, "ore:ironstone"); w.cmdTransfer("a", "hangar", { ship: sb.id, hold: "cargo" }, "ore:ironstone"); w.cmdTransfer("a", "hangar", "hangar", "ore:ironstone"); w.cmdTransfer("a", "hangar", { ship: s.id, hold: "cargo" }, "gold");
t.ok(!w.players.get("b").hangar["ore:ironstone"] && !sb.holds.cargo["ore:ironstone"], "only your own hangar and ships, real items");
w.cmdUndock("a", s.id); w.cmdTransfer("a", "hangar", { ship: s.id, hold: "ore" }, "ore:ironstone", 1);
t.ok(!s.docked && !s.holds.ore["ore:ironstone"], "undocked: back in space, and no hangar from out there");
const ex = w.exportState("a");
t.ok(ex.hangar["ore:ironstone"] > 0 && ex.ships["1"].fit.active[0] === "mining_laser" && ex.ships["1"].kit, "the hangar, holds and fit are saved");
const w2 = new World(); w2.addPlayer("a", "A", () => {}, ex, [{ id: 1, name: "Ann", licenses: {} }]); const s2 = w2.ships.get("a:ship:1");
t.ok(s2.fit.active[0] === "mining_laser" && JSON.stringify(s2.holds.cargo) === JSON.stringify(s.holds.cargo) && w2.players.get("a").hangar["ore:ironstone"] === ex.hangar["ore:ironstone"], "and come back as they were (no second starter kit)", [s2.holds.cargo, s.holds.cargo]);
t.done();
