// Fitting: hardpoints, disposition, capacitor, heat and burnout. Leaves the test ship fitted with
// 2 mining lasers + an auto miner (what the other tests expect).
import { connect, suite, sleep, resetShip, atRock, SHIP, H0 } from "./lib.mjs";
const t = suite("fitting");
const c = await connect();
const fitOf = () => c.inv().ships[SHIP].fit;
const slotOf = (item) => c.inv().hangars[0].slots.findIndex((x) => x.item === item);
const fit = async (item) => { c.send({ t: "fit", ship: SHIP, from: { ...H0, slot: slotOf(item), item } }); await sleep(300); };
const unfitAll = async () => { for (let i = fitOf().length - 1; i >= 0; i--) { c.send({ t: "unfit", ship: SHIP, idx: i }); await sleep(200); } await sleep(200); };
const since = (n) => c.msgs.slice(n);
const hull = c.last.hello.cfg.shipTypes.chisel;

await resetShip(c);
c.dev({ cmd: "item", item: "module:mining_laser", qty: 8 }); c.dev({ cmd: "item", item: "module:auto_miner", qty: 2 }); c.dev({ cmd: "item", item: "module:cap_battery", qty: 2 }); await sleep(500);
t.ok(Array.isArray(fitOf()), "ships report their fit");

// unfit returns modules to Hangar 1
const before = (c.inv().hangars[0].slots.find((x) => x.item === "module:mining_laser") || {}).qty || 0, n0 = fitOf().filter((x) => x === "module:mining_laser").length;
await unfitAll();
t.ok(fitOf().length === 0, "unfit empties the fit");
t.ok(((c.inv().hangars[0].slots.find((x) => x.item === "module:mining_laser") || {}).qty || 0) === before + n0, "unfitted modules go back to Hangar 1");

// hardpoints
for (let i = 0; i < hull.fitSlots + 1; i++) await fit("module:mining_laser");
t.ok(fitOf().length === hull.fitSlots, "can't fit more modules than hardpoints", fitOf().length);

// capacitor: everything can run, but past capacity the ship heats up, then powered modules burn
let r = await atRock(c); let n = c.msgs.length;
c.send({ t: "mine", ship: SHIP, on: true }); await sleep(800);
const running = c.ship().lasers.filter((l) => l.on).length;
t.ok(running === hull.fitSlots && c.ship().cap.used > c.ship().cap.max, "all lasers run, past the capacitor", { running, cap: c.ship().cap });
await sleep(1500);
t.ok(c.ship().heat > 0, "running past capacity builds heat", c.ship().heat);
c.dev({ cmd: "heat", ship: SHIP, value: 100 }); c.dev({ cmd: "modhp", ship: SHIP, value: 3 }); await sleep(2500);
t.ok((c.ship().fitHp || []).some((h) => h < 0) && since(n).some((m) => m.includes("burnt out")), "at full heat, overloaded modules burn out", c.ship().fitHp);
const fits = Math.floor(c.ship().cap.max / c.last.hello.cfg.items["module:mining_laser"].draw);
t.ok(c.ship().fitHp.filter((h) => h < 0).length === hull.fitSlots - fits && c.ship().fitHp.filter((h) => h === 3).length === fits, "only the modules past capacity take damage", c.ship().fitHp);
const burntIdx = c.ship().fitHp.findIndex((h) => h < 0); n = c.msgs.length;
c.send({ t: "laser", ship: SHIP, idx: burntIdx, on: true, rock: r.id }); await sleep(400);
t.ok(since(n).some((m) => m.includes("burnt out")), "a burnt-out module can't be switched on");
c.send({ t: "mine", ship: SHIP, on: false }); for (let i = 0; i < hull.fitSlots; i++) c.send({ t: "power", ship: SHIP, mod: "laser", idx: i, on: false }); await sleep(1500);
const h1 = c.ship().heat; await sleep(1200);
t.ok(c.ship().heat < h1, "within capacity the ship cools down", { h1, h2: c.ship().heat });
for (let i = 0; i < hull.fitSlots; i++) c.send({ t: "power", ship: SHIP, mod: "laser", idx: i, on: true });
c.send({ t: "laser", ship: SHIP, idx: 0, on: true, rock: r.id }); await sleep(300);

// fitting needs the ship docked
n = c.msgs.length; c.send({ t: "unfit", ship: SHIP, idx: 0 }); await sleep(300);
t.ok(fitOf().length === hull.fitSlots && since(n).some((m) => m.includes("Dock")), "fitting changes need the ship docked");
await resetShip(c); await sleep(300);
t.ok((c.ship().fitHp || []).every((h) => h === 100) && !c.ship().heat, "docking repairs modules and clears heat", c.ship().fitHp);

// disposition: 4 lasers + auto miner = 55 > 50
await resetShip(c); await unfitAll();
for (let i = 0; i < 4; i++) await fit("module:mining_laser");
n = c.msgs.length; await fit("module:auto_miner");
t.ok(!fitOf().includes("module:auto_miner") && since(n).some((m) => m.includes("disposition")), "can't exceed the hull's disposition");

// batteries raise the capacitor
await unfitAll(); await fit("module:mining_laser"); await sleep(300);
const cap0 = c.ship().cap.max; await fit("module:cap_battery"); await sleep(400);
t.ok(c.ship().cap.max > cap0, "a capacitor battery raises the capacitor", { cap0, cap1: c.ship().cap.max });

// (module licenses: every current module needs a starting license, which every pilot always holds, so there is nothing to test yet)

// restore the standard test fit
// hotbar slots stay put (owner): unfitting one module doesn't move the others; fits fill a chosen or the first free slot; swaps move them
await resetShip(c); await unfitAll();
for (const it of ["module:mining_laser", "module:mining_laser", "module:auto_miner"]) await fit(it);
const slots = () => c.inv().ships[SHIP].slots, autoSlot = () => slots()[fitOf().indexOf("module:auto_miner")];
t.ok(slots().join(",") === "0,1,2", "fitted modules take slots in order", slots());
c.send({ t: "unfit", ship: SHIP, idx: 0 }); await sleep(400);
t.ok(autoSlot() === 2 && slots().join(",") === "1,2", "unfitting a module leaves the others in their slots", slots());
c.send({ t: "fit", ship: SHIP, from: { ...H0, slot: slotOf("module:mining_laser"), item: "module:mining_laser", at: 4 } }); await sleep(400);
t.ok(slots()[fitOf().length - 1] === 4, "a module dropped on a slot is fitted there", slots());
c.send({ t: "fitswap", ship: SHIP, a: 2, b: 0 }); await sleep(400);
t.ok(autoSlot() === 0, "fitswap moves a module to another slot", slots());
c.send({ t: "fitswap", ship: SHIP, a: 0, b: 50 }); c.send({ t: "fitswap", ship: SHIP, a: "x", b: 1 }); await sleep(300);
t.ok(autoSlot() === 0, "bad fitswap slots are ignored", slots());
await unfitAll();
for (const it of ["module:mining_laser", "module:mining_laser", "module:auto_miner"]) await fit(it);
t.ok(fitOf().join(",") === "module:mining_laser,module:mining_laser,module:auto_miner", "test ship back to 2 lasers + auto miner", fitOf());
await c.close();
t.done();
