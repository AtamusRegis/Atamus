// The tutorial shard (docs/FEATURES.md › Tutorial shard): a throwaway World per tester, its steps in order, nothing
// saved. Part 1 drives a tutorial directly; part 2 joins it on the PTR.
import { createTutorial, STEPS, TUTORIAL_BASE_SPEED } from "../../packages/server/src/game/tutorial.js";
import { canTutorial } from "../../packages/server/src/testers.js";
import * as Base from "../../packages/server/src/game/base.js";
import * as Inv from "../../packages/server/src/game/inventory.js";
import { connect, suite, sleep } from "./lib.mjs";
const t = suite("tutorial");

t.ok(canTutorial("Nyssary") && canTutorial("nyssary") && !canTutorial("someone") && canTutorial("PTR", true), "only Nyssary (and the PTR) may pick the tutorial");
const msgs = [], T = createTutorial(), w = T.world, pid = "9";
const p = T.join(pid, "Nyssary", (s) => msgs.push(JSON.parse(s)));
const sh = [...w.ships.values()].find((s) => s.owner === pid), tutMsg = () => msgs.filter((m) => m.t === "tut").pop();
const at = () => { T.tick(p); return tutMsg(); };
t.ok(at().i === 0 && at().n === STEPS.length && p.credits === 10_000_000 && sh.docked && sh.pilot === "tutorial", "it starts at step 1, docked, with credits and a pilot");
t.ok(w.baseSpeed === TUTORIAL_BASE_SPEED && Base.homeOf(p.base).store.ironstone > 0 && p.base.buildings.some((q) => q.label === "Supply Depot" && q.store.hull_plating === 10), "the base runs faster and starts with ore and a stocked Supply Depot");
const step = (name) => STEPS.findIndex((s) => s[0] === name);
w.cmdDock(pid, sh.id, false); t.ok(at().i === step("Warp to a belt"), "undocking moves it on", at());
const belt = [...w.pois.values()].find((q) => q.kind === "belt"); Object.assign(sh, { sys: belt.id, x: 0, y: 0, tx: 0, ty: 0 });
t.ok(at().i === step("Lock an asteroid"), "arriving at a belt moves it on", at());
sh.targets.push({ kind: "rock", id: "x" }); sh.lasers[0].on = true; t.ok(at().i === step("Fill up"), "locking and mining move it on", at());
Inv.add(sh.inv.ore, "ironstone", 1000); sh.lasers[0].on = false; sh.targets.length = 0;
Object.assign(sh, { sys: "station", x: 3, y: 0 }); t.ok(at().i === step("Dock"), "100 m³, then back at the station", at());
w.cmdDock(pid, sh.id, true); t.ok(at().i === step("Sell some ore"), "docked");
w.cmdSell(pid, { owner: "ship", id: sh.id, inv: "ore" }, 0, 100, "ironstone"); t.ok(at().i === step("Buy a module"), "selling moves it on", at());
w.cmdBuy(pid, "module:laser_upgrade", 1); t.ok(at().i === step("Fit it"), "buying moves it on", at());
w.cmdFit(pid, sh.id, { owner: "station", inv: "delivery", slot: 0, item: "module:laser_upgrade" }); t.ok(at().i === step("Fly home"), "fitting moves it on", [at(), sh.fit.length]);
w.cmdDock(pid, sh.id, false); Object.assign(sh, { sys: p.home, x: 3, y: 0 }); t.ok(at().i === step("Dock at home"), "home", at());
w.cmdDock(pid, sh.id, true); t.ok(at().i === step("Open your base") && Base.homeOf(p.base).store.ironstone >= 20_900, "docking home unloads the ore", Base.homeOf(p.base).store);
w.cmdBaseOpen(pid, true); w.cmdBasePlace(pid, "refinery", 35, 30); t.ok(at().i === step("Pipe ore to it"), "a refinery", at());
w.cmdBasePipes(pid, [[33, 31], [34, 31], [35, 31]]); t.ok(at().i === step("Store the iums"), "piped from the Home Base", at());
// the Supply Depot (24,31; sockets N1 → 25,30 and E0 → 26,31): from the refinery's south socket (36,33) along y = 34
const row = []; for (let x = 35; x >= 26; x--) row.push([x, 34]);
w.cmdBasePipes(pid, [[36, 32], [36, 33], [36, 34], ...row, [26, 33], [26, 32], [26, 31], [25, 31]]);
t.ok(at().i === step("Build a factory"), "piped into the depot", at());
const dep = p.base.buildings.find((q) => q.label === "Supply Depot");
w.cmdBasePlace(pid, "factory", 20, 30); const fac = p.base.buildings.find((q) => q.type === "factory");
w.cmdBasePipes(pid, [[25, 31], [25, 30], [25, 29], [24, 29], [23, 29], [22, 29], [21, 29], [20, 29], [20, 30]]);   // depot north socket → factory north socket (20,29)
w.cmdBaseSet(pid, fac.id, { recipe: "steel_plate" });
t.ok(Base.links(p.base).up.get(fac).has(dep) && at().i === step("Make a Steel Plate"), "a factory fed from storage, making Steel Plate", at());
w.tick(0.05); for (let k = 0; k < 40 && at().i === step("Make a Steel Plate"); k++) { p.baseAt -= 2000; w.tick(0.05); }
t.ok(at().i === step("Build a shipyard"), "it makes one, fast", [at(), fac.idle, fac.made, Base.links(p.base).up.get(fac).size, dep.store]);
w.cmdBasePlace(pid, "dock_frigate", 27, 26);   // 27-29 × 26-27, sockets W1 → 26,27 · E1 → 30,27 · S1 → 28,28
w.cmdBasePipes(pid, [[25, 29], [25, 28], [25, 27], [26, 27], [27, 27]]);           // a branch off the depot's line to the factory
t.ok(at().i === step("Start a build"), "a shipyard fed from the depot", at());
const yard = p.base.buildings.find((q) => q.type === "dock_frigate");
w.cmdBaseSet(pid, yard.id, { recipe: "chisel", mode: "count", count: 1 });
for (let k = 0; k < 5 && at().i === step("Start a build"); k++) { p.baseAt -= 2000; w.tick(0.05); }
t.ok(at().i === step("Launch it") && yard.job, "the build starts", [at(), yard.idle]);
for (let k = 0; k < 200 && !at().done; k++) { p.baseAt -= 2000; w.tick(0.05); }
t.ok(at().done && [...w.ships.values()].filter((s) => s.owner === pid).length === 2, "two minutes later the Prospector is out and the tutorial is done", at());

// ---- part 2: on the PTR ----
const c = await connect("?shard=tutorial&new=1");
await sleep(600);
t.ok(c.last.hello && c.last.hello.shard === "tutorial" && c.last.tut && c.last.tut.i === 0, "the PTR's tester joins the tutorial at step 1", c.last.tut);
const credits = c.last.inv && c.last.inv.credits; t.ok(credits === 10_000_000, "with tutorial credits", credits);
c.send({ t: "dock", ship: c.last.snap.ships.find((s) => s.mine).id, dock: false }); await sleep(800);
t.ok(c.last.tut.i === 1, "and it follows along", c.last.tut);
await c.close();
const c2 = await connect("?shard=tutorial"); await sleep(600);
t.ok(c2.last.tut && c2.last.tut.i === 1, "a reload rejoins the same tutorial", c2.last.tut); await c2.close();
const c3 = await connect("?shard=tutorial&new=1"); await sleep(600);
t.ok(c3.last.tut && c3.last.tut.i === 0, "entering from the website starts it fresh", c3.last.tut); await c3.close();
const live = await connect(); t.ok(live.last.hello && !live.last.hello.shard && !live.last.tut, "the live server is its own world"); await live.close();
t.done();
