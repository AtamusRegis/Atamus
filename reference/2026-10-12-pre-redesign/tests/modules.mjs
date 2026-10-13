// Modules, mining and the Station (docs/FEATURES.md › Modules, The Station). Drives the World directly.
import { World } from "../../packages/server/src/game/world.js";
import { MODULES, shipCalc, moduleCost, stackPenalty } from "../../packages/server/src/game/modules.js";
import { SHIP_TYPES, DRONE, droneLegMs } from "../../packages/server/src/game/constants.js";
import { STATION } from "../../packages/server/src/game/station.js";
import { suite } from "./lib.mjs";
const t = suite("modules");
const T = SHIP_TYPES.chisel, notes = [];
const w = new World(), a = w.addPlayer("a", "A", (m) => { const x = JSON.parse(m); if (x.t === "notice") notes.push(x.text); }, null, [{ id: 1, name: "Ann", licenses: { mining_frigate: 1 } }]);
w.addPlayer("b", "B", () => {}, null, [{ id: 1, name: "Bo", licenses: {} }]); w.tick(0.05);
const s = w.ships.get("a:ship:1"), sb = w.ships.get("b:ship:1");
const lastNote = () => notes[notes.length - 1];
const L0 = (c) => c.mods[0];   // (the laser in the first active slot)
const calcL = (passive, lic = {}) => shipCalc(T, { active: ["mining_laser_s1"], passive }, lic).mods[0];

// the starter kit
t.ok(JSON.stringify(s.holds.cargo) === '{"mining_laser_s1":2,"drone_link_s1":1,"afterburner_s1":1,"cargo_upgrade_s1":1,"gyroscope_s1":1,"yield_upgrade_s1":1,"range_upgrade_s1":1,"cycle_upgrade_s1":1,"drone_fuel":10}' && s.holds.drones.drone === 2, "every ship starts with the starter kit in its cargo hold, and 2 drones in its drone bay (owner)", s.holds);
t.ok(["mining_laser_s1", "drone_link_s1", "afterburner_s1"].every((k) => MODULES[k].slot === "active") && ["cargo_upgrade_s1", "gyroscope_s1", "yield_upgrade_s1", "range_upgrade_s1", "cycle_upgrade_s1"].every((k) => MODULES[k].slot === "passive"), "lasers, drones and the afterburner are active; the rest passive");

// (owner) refitting is done docked: in space a fit or unfit is refused
w.cmdFit("a", s.id, "mining_laser_s1", "active", 0);
t.ok(!s.fit.active[0] && lastNote() === "Dock to refit" && s.holds.cargo.mining_laser_s1 === 2, "in space a module can't be fitted (owner: dock to refit)", lastNote());
s.docked = "station";
// fitting: the right kind of slot, from the cargo hold, within power and disposition
w.cmdFit("a", s.id, "cargo_upgrade_s1", "active", 0); w.cmdFit("a", s.id, "mining_laser_s1", "passive", 0); w.cmdFit("b", s.id, "mining_laser_s1", "active", 0); w.cmdFit("a", s.id, "mining_laser_s1", "active", 9); w.cmdFit("a", s.id, "nope", "active", 0);
t.ok(!s.fit.active.some(Boolean) && !s.fit.passive.some(Boolean), "only into a slot of its own kind, on your own ship, a real slot and module");
for (const [k, i] of [["mining_laser_s1", 0], ["mining_laser_s1", 1], ["drone_link_s1", 2], ["afterburner_s1", 3]]) w.cmdFit("a", s.id, k, "active", i);
w.cmdFit("a", s.id, "cargo_upgrade_s1", "passive", 0);
t.ok(s.fit.active.join() === "mining_laser_s1,mining_laser_s1,drone_link_s1,afterburner_s1" && s.fit.passive[0] === "cargo_upgrade_s1" && s.calc.power === 38 && s.calc.disposition === 40, "untrained, two lasers, a Drone Link, an afterburner and a Cargo Upgrade: actives take the power, passives the disposition (owner)", s.calc);
w.cmdFit("a", s.id, "yield_upgrade_s1", "passive", 1); w.cmdFit("a", s.id, "cycle_upgrade_s1", "passive", 2);
t.ok(s.fit.passive[1] === "yield_upgrade_s1" && !s.fit.passive[2] && lastNote() === "Not enough disposition" && s.calc.disposition === 56, "a second passive fits; past the hull's disposition a third is refused", [s.fit.passive, lastNote()]);
w.cmdUnfit("a", s.id, "passive", 1);
// (owner) power: a module past the power is fitted powered off (disposition only); Power On needs the room
s.holds.cargo.strip_miner_s1 = 1; w.cmdFit("a", s.id, "strip_miner_s1", "active", 1);
t.ok(s.fit.active[1] === "strip_miner_s1" && s.fit.off.active[1] && lastNote() === "Not enough power: fitted offline" && s.calc.power === 30 && s.calc.disposition === 43 && s.holds.cargo.mining_laser_s1 === 1, "past the power, a module is fitted powered off: disposition but no power (the one it replaced back in the cargo hold)", [s.fit.off, s.calc.power, s.calc.disposition]);
w.cmdPower("a", s.id, "active", 1, true); t.ok(s.fit.off.active[1] && lastNote() === "Not enough power", "Power On needs the power");
w.cmdPower("a", s.id, "active", 3, false); w.cmdPower("a", s.id, "active", 1, true);
t.ok(s.fit.off.active[3] && !s.fit.off.active[1] && s.calc.power === 34, "powering one off makes room for another", s.calc.power);
s.docked = false; notes.length = 0; w.cmdModule("a", s.id, 3, true); t.ok(!s.act[3] && lastNote() === "Powered off", "a powered-off module can't be switched on"); s.docked = "station";
w.cmdPower("a", s.id, "active", 1, false); w.cmdPower("a", s.id, "active", 3, true); w.cmdFit("a", s.id, "mining_laser_s1", "active", 1);
t.ok(!s.fit.off.active[3] && s.fit.active[1] === "mining_laser_s1" && !s.fit.off.active[1] && s.calc.power === 38 && s.holds.cargo.strip_miner_s1 === 1, "back to the full fit", s.calc);
t.ok(!s.holds.cargo.mining_laser_s1 && s.holds.cargo.yield_upgrade_s1 === 1, "fitting takes the module out of the cargo hold");
const all5 = { mining_frigate: 1, mining_lasers: 5, mining_drones: 5, mining_upgrades: 5, engineering_upgrades: 5, engines: 5 };
const full = shipCalc(T, { active: ["mining_laser_s1", "mining_laser_s1", "drone_link_s1", "afterburner_s1"], passive: ["yield_upgrade_s1", "cycle_upgrade_s1", "cargo_upgrade_s1"] }, all5);
t.ok(full.power <= 40 && full.disposition <= 70, "with the module licenses at V a full seven-module fit fits", full);
t.ok(moduleCost("mining_laser_s1", { mining_lasers: 5 }).power === 6 && moduleCost("mining_laser_s1", { mining_upgrades: 5 }).power === 8 && moduleCost("yield_upgrade_s1", { mining_upgrades: 5 }).disposition === 12, "a license cuts the power of the modules it names, not of what they upgrade (owner)");
// bonuses
const c0 = calcL([]), c1 = calcL(["yield_upgrade_s1"]), c2 = calcL(["yield_upgrade_s1", "yield_upgrade_s1"]);
t.ok(Math.abs(c1.yield / c0.yield - 1.05) < 1e-2 && Math.abs(c2.yield / c0.yield - (1 + 0.05 + 0.05 * stackPenalty(1))) < 1e-2, "a Yield Upgrade adds 5% yield; a second counts less (stacking)", [c0, c1, c2]);
t.ok(calcL(["yield_upgrade_s1"], { mining_upgrades: 5 }).yield > c1.yield, "Mining Upgrades strengthens the upgrade's bonus");
t.ok(calcL([], { mining_frigate: 5 }).yield === 12, "the Prospector's hull bonus: +4% laser yield per Mining Frigate level", calcL([], { mining_frigate: 5 }));
t.ok(calcL(["cycle_upgrade_s1"]).cycleMs === 13800 && calcL(["range_upgrade_s1"]).rangeKm === 3.3, "the Cycle Upgrade cuts the cycle 8%, the Range Upgrade adds 10% range");
t.ok(s.calc.holds.ore === 5750 && s.calc.holds.cargo === 57, "a Cargo Expander adds 15% to both holds", s.calc.holds);
t.ok(shipCalc(T, { active: [], passive: ["gyroscope_s1"] }, {}).accel > T.accelKmps2, "an Inertia Stabilizer adds acceleration");

// swapping and unfitting
w.cmdFit("a", s.id, "gyroscope_s1", "passive", 0);
t.ok(s.fit.passive[0] === "gyroscope_s1" && s.holds.cargo.cargo_upgrade_s1 === 1, "fitting onto a used slot swaps the old module back into the cargo hold");
w.cmdUnfit("a", s.id, "passive", 0);
t.ok(!s.fit.passive[0] && s.holds.cargo.gyroscope_s1 === 1, "unfitting puts it back in the cargo hold");
w.cmdUnfit("b", s.id, "active", 0); w.cmdUnfit("a", s.id, "active", 7); t.ok(s.fit.active[0] === "mining_laser_s1", "only your own ship, a real slot");

s.docked = false; w.cmdUnfit("a", s.id, "active", 0);
t.ok(s.fit.active[0] === "mining_laser_s1" && lastNote() === "Dock to refit", "or unfitted (power on / off still works in space: below)");
// running: the afterburner; lasers and drones need a locked rock in range
w.cmdModule("a", s.id, 3, true);
t.ok(Math.abs(s.speed - T.speedKmps * 1.75) < 1e-9, "the afterburner raises top speed while it's on (S I: +75%)", s.speed);
w.cmdModule("a", s.id, 3, false); t.ok(s.speed === T.speedKmps, "and off again");
const belt = [...w.pois.values()].find((p) => p.kind === "belt"), k = belt.field.rocks.find((r) => r.size === 1000) || belt.field.rocks[0];
const inb = Math.atan2(belt.y - k.y, belt.x - k.x);
Object.assign(s, { x: k.x + Math.cos(inb) * (k.r + 1), y: k.y + Math.sin(inb) * (k.r + 1), vx: 0, vy: 0 }); w.tick(0.05);
s.holds.cargo.mining_laser_s1 = 2;   // (owner) drones carry a module from the cargo hold
w.cmdModule("a", s.id, 0, true); w.cmdModule("a", s.id, 2, true); t.ok(!s.act[2] && lastNote() === "Unable to launch more drones", "drones launch only with a module to carry"); w.cmdModule("a", s.id, 2, true, { item: "mining_laser_s1", n: 2 });
t.ok(s.holds.drones.drone === undefined && s.holds.cargo.mining_laser_s1 === undefined && s.holds.cargo.drone_fuel === 8 && s.act[2].drones.n === 2, "launching takes the drones from the bay, a module and a fuel block each from the cargo hold (owner)", [s.holds, s.act[2]]);
t.ok(s.act[0] && s.act[0].standby && s.act[2] && s.act[2].standby && w.snapshotFor(a).ships.find((x) => x.id === s.id).act[0].sb === 1, "with no locked asteroid in range, a laser (or drones) waits on standby (owner)", s.act);
w.cmdLock("a", s.id, "rock", k.id); w.tick(0.05);
t.ok(s.act[0].standby, "still waiting while the lock comes on");
s.targets[0].lockAt = 0; w.tick(0.05);
t.ok(s.act[0] && s.act[0].tg === k.id && s.act[2] && s.act[2].tg === k.id, "on the first lock in range they start on it"); s.act[2].at = w.simAt;   // (as if they'd flown out)
t.ok(Number.isFinite(s.act[0].ax) && Math.hypot(s.act[0].ax, s.act[0].ay) < k.r && [0, 1].includes(s.act[0].hp) && [2, 3].includes(w.ships.get(s.id).act[1] ? 2 : 2), "a laser picks a spot inside the rock and one of its arm's hardpoints for the cycle", s.act[0]);
const m0 = k.m3; s.act[0].at -= 15000; w.tick(0.05);
const LY = s.calc.mods[0].yield, DY = w._mcalc(s, 2).yield;
t.ok(Math.abs((s.holds.ore["ore:" + k.ore] || 0) - LY) < 1e-6 && Math.abs(k.m3 - (m0 - LY)) < 0.02, "each laser cycle moves its yield from the rock into the ore hold", [s.holds.ore, k.m3]);
const m1 = k.m3; s.act[2].at -= 15000; w.tick(0.05);
const h = s.act[2] && s.act[2].haul, hsnap = w.snapshotFor(a).ships.find((x) => x.id === s.id).beams.find((b) => b.m === "drone_link_s1");
t.ok(Math.abs(DY - 2 * 0.3 * 10 * 1.1) < 1e-6, "two drones with mining lasers: each 30% of the laser (and the Prospector's drone bonus)", DY);
t.ok(h && h.amt === DY && Math.abs(k.m3 - (m1 - h.amt)) < 0.02 && Math.abs(s.holds.ore["ore:" + k.ore] - LY) < 1e-6 && hsnap && hsnap.h0 === h.at && hsnap.lg === h.leg && hsnap.dp === DRONE.depositMs && hsnap.amt > 0, "a drone cycle takes its yield from the rock, and the drones fly it to the ship (owner)", [h, hsnap]);
t.ok(droneLegMs(4) === Math.round(4 / DRONE.nearKmps * 1000) && droneLegMs(10) === Math.round((5 / DRONE.nearKmps + 5 / DRONE.farKmps) * 1000) && DRONE.nearKmps < DRONE.farKmps, "drones fly slower within 5 km of the ship (owner)");
h.at -= h.leg; w.tick(0.05);
t.ok(Math.abs(s.holds.ore["ore:" + k.ore] - LY) < 1e-6, "at the ship they circle it twice, streaming the ore in: nothing lands until the streams are done (owner)", s.holds.ore);
h.at -= DRONE.depositMs; w.tick(0.05);
t.ok(Math.abs(s.holds.ore["ore:" + k.ore] - LY - DY) < 1e-6 && s.act[2].haul && s.act[2].haul.back && w.snapshotFor(a).ships.find((x) => x.id === s.id).beams.find((b) => b.m === "drone_link_s1").bk, "then it's in the ore hold and they fly back out", s.holds.ore);
h.at -= h.back.leg; w.tick(0.05);
t.ok(s.act[2] && !s.act[2].haul && s.act[2].tg === k.id, "back at the rock, the next cycle starts", s.act[2]);
t.ok(s.calc.mods[2].rangeKm === 20, "a Drone Link S I controls drones out to 20 km");
const snap = w.snapshotFor(a).ships.find((x) => x.id === s.id);
t.ok(snap.fit && snap.holds && snap.calc && snap.act[0].tg === k.id && snap.beams.length === 2 && snap.beams.every((b) => Number.isFinite(b.ax) && Number.isFinite(b.p) && b.c > 0), "your ship's snapshot carries its fit, holds, numbers and running modules; everyone sees the beams (spot, hardpoint, cycle)", snap.beams);
s.holds.ore["ore:" + k.ore] = s.calc.holds.ore - 1; s.act[0].at -= 15000; w.tick(0.05);
t.ok(!s.act[0] && Math.abs(Object.values(s.holds.ore).reduce((x, y) => x + y, 0) - s.calc.holds.ore) < 1e-6 && lastNote() === "Ore hold full", "a full ore hold stops the laser (only what fits is taken)", [s.act[0], lastNote()]);
w.cmdModule("a", s.id, 0, true); t.ok(!s.act[0], "and it won't start with the hold full");
s.holds.ore = {}; w.cmdModule("a", s.id, 0, true); w.cmdUnlock("a", s.id, "rock", k.id); w.tick(0.05);
t.ok(!s.act[0] && s.act[2] && s.act[2].tg === k.id, "unlocking the rock stops a laser, but drones stay on it (owner)", s.act);
{ const k0 = { x: k.x, y: k.y }; k.x = s.x + 12; k.y = s.y; w.tick(0.05);
  t.ok(s.act[2] && s.act[2].tg === k.id, "drones keep at their rock past targeting range, within control range (owner)");
  k.x = s.x + 25; w.tick(0.05); t.ok(s.act[2] && s.act[2].haul && s.act[2].haul.recall, "beyond the control range they come home", s.act[2]); Object.assign(k, k0);
  s.act[2].haul.at -= 1e6; w.tick(0.05); t.ok(!s.act[2] && s.holds.drones.drone === 2 && s.holds.cargo.mining_laser_s1 === 2, "home: the drones back in the bay, their modules in the cargo hold", s.holds);
  w.cmdLock("a", s.id, "rock", k.id); for (const g of s.targets) g.lockAt = 0; w.tick(0.05); w.cmdModule("a", s.id, 2, true, { item: "mining_laser_s1", n: 2 }); w.tick(0.05); }
// (owner) the drone key: a different locked rock in range sends them there; otherwise it recalls them
{ const k2 = belt.field.rocks.find((r) => r !== k && r.m3 > 100);
  Object.assign(k2, { x: s.x + 1.5, y: s.y + 0.5 }); w.cmdLock("a", s.id, "rock", k.id); w.cmdLock("a", s.id, "rock", k2.id); for (const g of s.targets) g.lockAt = 0; w.tick(0.05);
  if (!s.act[2]) w.cmdModule("a", s.id, 2, true, { item: "mining_laser_s1", n: 2 }); s.act[2].at = w.simAt; const first = s.act[2] && s.act[2].tg;
  w.cmdModule("a", s.id, 2, false); const re = s.act[2];
  t.ok(first === k.id && re && re.tg === k2.id && re.at > w.simAt && re.fx === k.x, "with another locked rock in range, the drone key sends them over to it (they fly, then start)", re);
  w.cmdUnlock("a", s.id, "rock", k.id); w.cmdModule("a", s.id, 2, false); const rc = s.act[2] && s.act[2].haul;
  t.ok(rc && rc.recall && rc.amt === 0 && w.snapshotFor(a).ships.find((x) => x.id === s.id).beams.find((b) => b.m === "drone_link_s1").rc === 1, "otherwise the key recalls them: they fly home", rc);
  rc.at -= rc.leg + 1; w.tick(0.05); t.ok(!s.act[2] && s.holds.drones.drone === 2, "and switch off once they're in");
  w.cmdUnlock("a", s.id, "rock", k2.id); }
// (owner) Orbit: it circles the object at full speed, off its no-destination line
{ const ow = new World(); ow.addPlayer("o", "O", () => {}, null, [{ id: 1, name: "O", licenses: {} }]); ow.tick(0.05); const so = ow.ships.get("o:ship:1"), bo = [...ow.pois.values()].find((p) => p.kind === "belt"), ko = bo.field.rocks[0];
  Object.assign(so, { x: ko.x + 3, y: ko.y, vx: 0, vy: 0 }); ow.cmdChase("o", so.id, "rock", ko.id, "orbit");
  let minD = Infinity, maxD = 0, turned = 0, lastA = Math.atan2(so.y - ko.y, so.x - ko.x);
  for (let i = 0; i < 2400; i++) { ow.tick(0.05); if (i > 600) { const d = Math.hypot(so.x - ko.x, so.y - ko.y); minD = Math.min(minD, d); maxD = Math.max(maxD, d); const a2 = Math.atan2(so.y - ko.y, so.x - ko.x); let da = a2 - lastA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; turned += da; lastA = a2; } }
  t.ok(minD > ko.r + so.radius + 0.07 && maxD < ko.r + so.radius + 0.07 + 0.5 + 1.2 && Math.abs(turned) > 2 * Math.PI, "Orbit circles the object, never over it", { minD, maxD, turned, r: ko.r }); }
w.cmdLock("a", s.id, "rock", k.id); s.targets[0].lockAt = 0; w.tick(0.05); w.cmdModule("a", s.id, 0, true);
w.cmdModule("a", s.id, 2, true, { item: "mining_laser_s1", n: 1 });
w._startWarp(s, [...w.pois.values()].find((p) => p.kind === "belt" && p !== belt), Date.now()); w.tick(0.05);
t.ok(!s.act.some(Boolean) && [...w.wrecks.values()].some((x) => x.name === "Lost Drones" && x.items.drone === 1 && x.items.mining_laser_s1 === 1), "a warp switches every module off; drones out are left behind (a wreck)", [...w.wrecks.values()]); s.wp = null;
// a mined-out rock goes
const small = belt.field.rocks.find((r) => r !== k); const ver = belt.field.ver; w._mineRock(small.id, small.m3 + 1);
t.ok(!belt.field.rocks.includes(small) && belt.field.ver > ver, "a rock mined to nothing is gone");

// the Station: dock (flying there first from afar), the hangar, moving items, undock
const st = w.pois.get("station");
t.ok(st && st.kind === "station" && w.poisFor(a).some((p) => p.id === "station"), "the Station is a POI on everyone's map");
Object.assign(s, { x: STATION.x + 40, y: STATION.y, vx: 0, vy: 0, wp: null }); w.cmdDock("a", s.id);
t.ok(!s.docked && s.dockReq && s.moving, "out of range, Dock flies there first");
Object.assign(s, { x: STATION.x, y: STATION.y - 4 }); for (let i = 0; i < 4000 && !s.docked; i++) w.tick(0.05);
t.ok(s.docked && !s.moving && !s.targets.length, "then docks (within 5 km of its edge), through the hangar");
t.ok(!w.snapshotFor(w.players.get("b")).ships.some((x) => x.id === s.id) && w.snapshotFor(a).ships.find((x) => x.id === s.id).docked, "a docked ship is out of space: others don't see it");
w.cmdMove("a", s.id, 0, 0); w.cmdLock("a", s.id, "rock", k.id); t.ok(!s.moving && !s.targets.length, "no orders while docked");
s.holds.ore = { "ore:ironstone": 100 }; w.cmdTransfer("a", { ship: s.id, hold: "ore" }, "hangar", "ore:ironstone");
t.ok(a.hangars.station["ore:ironstone"] === 100 && !s.holds.ore["ore:ironstone"], "ore moves from a docked ship into the hangar");
w.cmdTransfer("a", "hangar", { ship: s.id, hold: "cargo" }, "ore:ironstone", 1000);
const free = s.calc.holds.cargo - 45 - (s.holds.cargo.yield_upgrade_s1 ? 0 : 0);
t.ok(s.holds.cargo["ore:ironstone"] > 0 && s.holds.cargo["ore:ironstone"] < 100 && a.hangars.station["ore:ironstone"] > 0, "into a ship's hold only what fits goes; the rest stays", [s.holds.cargo["ore:ironstone"], a.hangars.station["ore:ironstone"]]);
notes.length = 0; w.cmdTransfer("a", "hangar", { ship: s.id, hold: "ore" }, "yield_upgrade_s1"); w.cmdTransfer("a", { ship: s.id, hold: "cargo" }, { ship: s.id, hold: "ore" }, "yield_upgrade_s1");
t.ok(lastNote() === "The ore hold takes only ore" && s.holds.cargo.yield_upgrade_s1 === 1, "the ore hold takes only ore");
w.cmdTransfer("b", "hangar", { ship: s.id, hold: "cargo" }, "ore:ironstone"); w.cmdTransfer("a", "hangar", { ship: sb.id, hold: "cargo" }, "ore:ironstone"); w.cmdTransfer("a", "hangar", "hangar", "ore:ironstone"); w.cmdTransfer("a", "hangar", { ship: s.id, hold: "cargo" }, "gold");
t.ok(!(w.players.get("b").hangars.station || {})["ore:ironstone"] && !sb.holds.cargo["ore:ironstone"], "only your own hangar and ships, real items");
w.cmdUndock("a", s.id); w.cmdTransfer("a", "hangar", { ship: s.id, hold: "ore" }, "ore:ironstone", 1);
t.ok(!s.docked && !s.holds.ore["ore:ironstone"], "undocked: back in space, and no hangar from out there");
for (let i = 0; i < 400 && s.dockSeq; i++) w.tick(0.05);   // (out of the hangar first)
const ex = w.exportState("a");
t.ok(ex.hangars.station["ore:ironstone"] > 0 && ex.ships["1"].fit.active[0] === "mining_laser_s1" && ex.ships["1"].kit, "the hangar, holds and fit are saved");
{ const wo = new World({ eta: false }); wo.addPlayer("o", "O", () => {}, { ships: { 1: { x: 100, y: 100, h: 0, kit: true, holds: { cargo: { mining_laser: 1, cargo_expander: 2 } }, fit: { active: ["mining_laser", "mining_drones", null, null], passive: ["mining_overclocker", null, null] } } } }, [{ id: 1, name: "O", licenses: {} }]);
  const so = wo.ships.get("o:ship:1");
  t.ok(so.holds.cargo.mining_laser_s1 === 1 && so.holds.cargo.cargo_upgrade_s1 === 2 && so.fit.active.join() === "mining_laser_s1,drone_link_s1,," && so.fit.passive[0] === "cycle_upgrade_s1", "the modules from before sizes load as their S I (owner)", so.fit);
  t.ok(so.holds.drones.drone === 2 && so.holds.cargo.drone_fuel === 10 && so.kitV === 2, "a ship from before drones were items gets its 2 drones and 10 fuel blocks, once (owner)", so.holds); }
const w2 = new World(); w2.addPlayer("a", "A", () => {}, ex, [{ id: 1, name: "Ann", licenses: {} }]); const s2 = w2.ships.get("a:ship:1");
t.ok(s2.fit.active[0] === "mining_laser_s1" && JSON.stringify(s2.holds.cargo) === JSON.stringify(s.holds.cargo) && w2.players.get("a").hangars.station["ore:ironstone"] === ex.hangars.station["ore:ironstone"], "and come back as they were (no second starter kit)", [s2.holds.cargo, s.holds.cargo]);
t.done();
