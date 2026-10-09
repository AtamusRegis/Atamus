// Asteroid instances, offline mining and jettison-can privacy (docs/FEATURES.md › Asteroid instances).
// Part 1 drives the World directly with several players (the PTR has only one account);
// part 2 runs the real jump flow against the PTR.
import { World } from "../../packages/server/src/game/world.js";
import * as Inv from "../../packages/server/src/game/inventory.js";
import { INST_MAX_PLAYERS, INST_RETURN_POS, INST_APOTHEM_KM } from "../../packages/server/src/game/constants.js";
import { connect, suite, sleep, resetShip, SHIP } from "./lib.mjs";
const t = suite("instances");

// ---- part 1: the rules, with many players ----
const w = new World();
const LIC = { mining_frigate: 5, small_mining_laser: 1, auto_miner: 1 };
const mk = (id) => { const p = w.addPlayer(id, "P" + id, () => {}); p.pilots = [{ id: "pl" + id, name: "Pilot " + id, licenses: LIC }]; w.assignDefaultPilots(id); return p; };
const shipOf = (id) => [...w.ships.values()].find((s) => s.owner === id);
const atBeacon = (p) => { const s = shipOf(p.id), b = p.beacons[0]; s.docked = false; s.x = b.x + 0.5; s.y = b.y; s.tx = s.x; s.ty = s.y; s.moving = false; return s; };

const a = mk("a");
t.ok(a.beacons.length >= 2 && a.beacons.length <= 3, "a player has 2-3 asteroid beacons", a.beacons.length);
t.ok(a.field.rocks.length >= 20 && a.field.rocks.some((r) => r.near), "home has scattered rocks plus clusters at the beacons", a.field.rocks.length);
t.ok(a.field.rocks.every((r) => r.id.startsWith("sys:a#")), "home rock ids carry their system");
for (let i = 0; i < 3; i++) w._maintainInstances();   // one new instance per pass (every 5 s on the server)
t.ok(w.instances.size >= 2 && a.beacons.every((b) => b.inst), "the server keeps instances ready and links every beacon", w.instances.size);

// jump in: only ships near a linked beacon
const inst = w.instances.get(a.beacons[0].inst), sa = shipOf("a");
sa.docked = false; sa.x = a.beacons[0].x + 10; sa.y = a.beacons[0].y; w.cmdJump("a", a.beacons[0].id, [sa.id]);
t.ok(sa.sys === "sys:a", "a ship out of beacon range can't jump");
atBeacon(a); w.cmdJump("a", a.beacons[0].id, [sa.id]);
t.ok(sa.sys === inst.sys && sa.via === a.beacons[0].id, "a ship in range jumps into the linked instance", sa.sys);
t.ok(w._visibleSystems("a").has(inst.sys), "the instance becomes visible to its player");
w.cmdMove("a", [sa.id], 500, 0, inst.sys); w._tickShips(0.05);
t.ok(Math.abs(sa.tx) <= INST_APOTHEM_KM + 0.01, "move orders are clamped to the small instance hex", sa.tx);
const tx0 = sa.tx; w.cmdMove("a", [sa.id], 0, 0, "sys:a"); t.ok(sa.tx === tx0, "a move order for another system doesn't touch it");
w.cmdDock("a", sa.id, true); t.ok(!sa.docked, "no docking inside an instance");

// cap: 5 players per instance, members always fit
const others = ["b", "c", "d", "e", "f"].map(mk);
for (const p of others) { p.beacons[0].inst = inst.id; atBeacon(p); w.cmdJump(p.id, p.beacons[0].id, [shipOf(p.id).id]); }
t.ok(w._members(inst).size === INST_MAX_PLAYERS, "an instance holds " + INST_MAX_PLAYERS + " players", w._members(inst).size);
t.ok(shipOf("f").sys === "sys:f" && others[4].beacons[0].inst === null, "a 6th player is refused and their beacon looks elsewhere");
w._maintainInstances();
t.ok(a.beacons[0].inst === inst.id && others.every((p) => p.beacons.every((b) => b.inst !== inst.id) || w._members(inst).has(p.id)), "a full instance only stays linked for its members");

// shared field: others see the rocks; mining is fine on the same rock
t.ok(w.fieldsFor(others[0]).fields.some((f) => f.sys === inst.sys), "players in the same instance share its field");

// jettison cans: private for 30 minutes, then anyone for 10
const sb = shipOf("b"); Inv.add(sb.inv.cargo, "ironstone", 5);
w.cmdJettison("b", { owner: "ship", id: sb.id, inv: "cargo" }, 0, 5, "ironstone");
const can = [...w.cans.values()].find((c) => c.owner === "b");
t.ok(can && can.sys === inst.sys, "a can is jettisoned in the instance");
const sc = shipOf("c"); sc.x = can.x + 0.3; sc.y = can.y;
w.cmdInvMove("c", { owner: "can", id: can.id, slot: 0 }, { owner: "ship", id: sc.id, inv: "cargo" });
t.ok(can.inv.slots.length === 1, "someone else can't open a fresh can");
t.ok(!w.inventoriesFor("c").cans[can.id], "a locked can's contents aren't sent to others");
can.publicAt = Date.now() - 1;
w.cmdInvMove("c", { owner: "can", id: can.id, slot: 0 }, { owner: "ship", id: sc.id, inv: "cargo" });
t.ok(can.inv.slots.length === 0, "after 30 minutes anyone can loot it");

// offline: idle ships go home through their beacon; ships still mining stay and keep their owner awake
const sd = shipOf("d"), rock = inst.field.rocks[0];
sd.x = rock.x + 0.4; sd.y = rock.y; sd.targets = [{ kind: "rock", id: rock.id, locked: true, lockAt: 0 }];
w.cmdLaser("d", sd.id, 0, true, rock.id);
t.ok(sd.lasers[0].on, "a ship in the instance mines its rock");
for (const id of ["d", "e"]) { w.removePlayer(id); w.players.get(id).offlineSince = Date.now() - 120000; }
w.tick(0.05);
t.ok(shipOf("e") === undefined || shipOf("e").sys === "sys:e", "an offline player's idle ship is returned home", shipOf("e") && shipOf("e").sys);
t.ok(!w.players.has("e"), "with nothing left to do, the offline player hibernates");
t.ok(w.players.has("d") && shipOf("d").sys === inst.sys, "an offline player's mining ship stays and keeps mining");
sd.inv.ore.cap = Inv.usedM3(sd.inv.ore); for (let i = 0; i < 3; i++) { sd.lasers[0].until = 0; w.tick(0.05); }
t.ok(!sd.lasers[0].on && !w.players.has("d"), "once its hold is full it goes home and its owner hibernates");

// passive ore loss, and closing a mined-out instance
const before = inst.field.rocks[0].m3; w._decayInstances(3600e3);
t.ok(inst.field.rocks[0].m3 < before, "instance rocks lose ore over time", [before, inst.field.rocks[0].m3]);
for (const r of [...inst.field.rocks]) w._removeRock(inst.field, r);
w._decayInstances(1);
t.ok(!w.instances.has(inst.id) && sa.sys === "sys:a" && Math.hypot(sa.x - a.beacons[0].x, sa.y - a.beacons[0].y) < 3, "a mined-out instance closes and its ships return beside their beacons");
t.ok(a.beacons[0].inst !== inst.id, "beacons drop the closed instance");
t.ok(w.loadInstance(w.exportInstance({ id: "inst:x", field: { rocks: [{ id: "inst:x#0", m3: 5 }] }, createdAt: 1 })) === undefined && w.instances.has("inst:x"), "an instance survives a save / load round trip");

// ---- part 2: the jump flow on the PTR ----
const c = await connect();
await resetShip(c);
c.send({ t: "dock", ship: SHIP, dock: false }); await sleep(500);
c.dev({ cmd: "inst" }); await sleep(800);
const bc = (c.last.snap.beacons || []).find((b) => !b.back);
t.ok(bc && bc.linked, "your beacons show as linked", c.last.snap.beacons);
c.dev({ cmd: "move", ship: SHIP, x: bc.x + 0.6, y: bc.y }); await sleep(600);
t.ok(c.ship().jump === bc.id, "a ship by a linked beacon can jump", c.ship().jump);
c.send({ t: "jump", beacon: bc.id, ships: [SHIP] }); await sleep(800);
const isys = c.ship().sys;
t.ok(isys && isys.startsWith("inst:") && c.last.snap.systems.some((s) => s.id === isys && s.inst), "the ship lands in the instance, which shows on the map", isys);
const fld = (c.last.belts?.belts || []).find((f) => f.sys === isys);
t.ok(fld && fld.rocks.length > 20, "the instance's rocks arrive");
const rk = fld.rocks.slice().sort((p, q) => Math.hypot(p.x - c.ship().x, p.y - c.ship().y) - Math.hypot(q.x - c.ship().x, q.y - c.ship().y))[0];
c.dev({ cmd: "move", ship: SHIP, x: rk.x + 0.4, y: rk.y, sys: isys }); await sleep(400);
c.send({ t: "lock", ship: SHIP, kind: "rock", id: rk.id }); await sleep(3600);
c.send({ t: "laser", ship: SHIP, idx: 0, on: true, rock: rk.id }); await sleep(800);
t.ok(c.ship().lasers[0].on, "lasers work on instance rocks");
c.dev({ cmd: "move", ship: SHIP, x: INST_RETURN_POS.x + 0.5, y: INST_RETURN_POS.y, sys: isys }); await sleep(600);
t.ok(c.ship().jump === isys + ":ret", "the instance's beacon leads home", c.ship().jump);
c.send({ t: "jump", beacon: isys + ":ret", ships: [SHIP] }); await sleep(800);
t.ok(c.ship().sys.startsWith("sys:") && Math.hypot(c.ship().x - bc.x, c.ship().y - bc.y) < 3, "jumping back lands beside the beacon you came through");
await resetShip(c);
await c.close();
t.done();
