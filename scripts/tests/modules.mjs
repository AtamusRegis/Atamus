// Drones, propulsion and upgrades (docs/FEATURES.md › Fitting and power). Drives the World directly.
import { World } from "../../packages/server/src/game/world.js";
import * as Inv from "../../packages/server/src/game/inventory.js";
import { SHIP_TYPES, stackPenalty } from "../../packages/server/src/game/constants.js";
import { suite } from "./lib.mjs";
const t = suite("modules");
const w = new World();
const p = w.addPlayer("a", "A", () => {}); p.pilots = [{ id: "pl", name: "P", licenses: { mining_frigate: 5, small_mining_laser: 1 } }]; w.assignDefaultPilots("a");
const s = w.ships.get("a:ship:0"), T = SHIP_TYPES.chisel;
const fit = (...items) => { s.fit = s.fit.filter((f) => Inv.MODULES[f.item].role === "laser"); for (const it of items) s.fit.push({ item: it, hp: 100 }); w._refit(s); };

// upgrades, with diminishing returns
const y0 = w._yieldM3s(s);
fit("module:laser_upgrade"); const y1 = w._yieldM3s(s);
fit("module:laser_upgrade", "module:laser_upgrade"); const y2 = w._yieldM3s(s);
t.ok(Math.abs(y1 / y0 - 1.05) < 1e-9, "a mining laser upgrade adds 5% yield", y1 / y0);
t.ok(Math.abs(y2 / y0 - (1 + 0.05 + 0.05 * stackPenalty(1))) < 1e-9 && y2 / y0 < 1.1, "a second one adds less", y2 / y0);
fit("module:cargo_expansion"); t.ok(s.inv.cargo.cap === Math.round(T.cargoM3 * 1.15) && s.inv.ore.cap === Math.round(T.oreM3 * 1.15), "a cargohold expansion adds 15% to both holds", [s.inv.cargo.cap, s.inv.ore.cap]);
fit("module:cargo_expansion", "module:cargo_expansion"); t.ok(s.inv.ore.cap === Math.round(T.oreM3 * (1.15 + 0.15 * stackPenalty(1))), "a second one adds less", s.inv.ore.cap);
fit(); t.ok(s.inv.ore.cap === T.oreM3, "unfitting them restores the holds");

// propulsion: one at a time, raises top speed, draws power
fit("module:afterburner", "module:microwarpdrive");
const ab = s.fit.findIndex((f) => f.item === "module:afterburner"), mwd = s.fit.findIndex((f) => f.item === "module:microwarpdrive");
w.cmdProp("a", s.id, ab, true); t.ok(s.prop.fi === -1, "propulsion can't run docked");
Object.assign(s, { docked: false, sys: "station", x: 10, y: 0, tx: 45, ty: 0, moving: true });
w.cmdProp("a", s.id, ab, true); t.ok(s.prop.fi === ab && w._capUsed(s) === Inv.MODULES["module:afterburner"].draw, "the afterburner runs and draws power");
for (let k = 0; k < 300; k++) w._tickShips(0.05);
t.ok(Math.abs(Math.hypot(s.vx, s.vy) - s.speed * 1.75) < 0.01, "an afterburner raises top speed 75%", Math.hypot(s.vx, s.vy) / s.speed);
w.cmdProp("a", s.id, mwd, true); t.ok(s.prop.fi === mwd, "switching on the microwarpdrive switches the afterburner off");
Object.assign(s, { x: 0, y: 0, tx: 45, ty: 0 }); for (let k = 0; k < 400; k++) w._tickShips(0.05);
t.ok(Math.hypot(s.vx, s.vy) > s.speed * 3, "a microwarpdrive is much faster", Math.hypot(s.vx, s.vy) / s.speed);
w.cmdPower("a", s.id, "prop", mwd, false); t.ok(s.prop.fi === -1 && s.fit[mwd].off, "powering it off stops it");
w.cmdWarp("a", s.id); t.ok(!s.wp, "no warping point to point inside a POI");

// mining drones: launch, engage the target with F, mine in cycles, recall
fit("module:mining_drones");
w._maintainPois(); const belt = [...w.pois.values()].find((q) => q.kind === "belt"), rock = belt.field.rocks[0];
Object.assign(s, { sys: belt.id, x: rock.x + 2, y: rock.y, tx: rock.x + 2, ty: rock.y, moving: false, vx: 0, vy: 0 });
s.targets = [{ kind: "rock", id: rock.id, locked: true, lockAt: 0 }];
w.cmdDronesEngage("a", s.id, rock.id); t.ok(!s.drones.rock, "drones must be launched first");
w.cmdDrones("a", s.id, true); t.ok(s.drones.on && w._capUsed(s) === Inv.MODULES["module:mining_drones"].draw, "activating the module launches the drones (they draw power while out)");
w.cmdDronesEngage("a", s.id, rock.id); t.ok(s.drones.rock === rock.id, "F sends them at the target (2 km away: inside drone range, outside laser range)");
const before = Inv.usedM3(s.inv.ore); s.drones.until = 0; w._tickDrones(s, Date.now());
t.ok(Inv.usedM3(s.inv.ore) > before, "a drone cycle puts ore in the hold", Inv.usedM3(s.inv.ore));
s.x = rock.x + 9; w._tickDrones(s, Date.now()); t.ok(s.drones.on && !s.drones.rock, "out of range they stop and wait");
const snap = w.snapshotFor(p).ships.find((x) => x.id === s.id); t.ok(snap.drones && snap.drones.on, "the drones show in the snapshot");
w.cmdWarpTo("a", [s.id], "station"); t.ok(!s.drones.on, "warping recalls them");
t.done();
