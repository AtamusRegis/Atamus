// Fitting: hardpoints, disposition, capacitor and module licenses. Leaves the test ship fitted with
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

// capacitor: only as many lasers run as the capacitor powers
let r = await atRock(c); let n = c.msgs.length;
c.send({ t: "mine", ship: SHIP, on: true }); await sleep(800);
const running = c.ship().lasers.filter((l) => l.on).length, laserDraw = c.last.hello.cfg.items["module:mining_laser"].draw;
t.ok(running === Math.floor(c.ship().cap.max / laserDraw) && running < hull.fitSlots, "capacitor limits how many lasers run", { running, cap: c.ship().cap });
t.ok(since(n).some((m) => m.includes("not enough capacitor")), "the pilot is told when the capacitor runs out");
t.ok(c.ship().cap.used <= c.ship().cap.max, "capacitor in use never exceeds the maximum");

// fitting needs the ship docked
n = c.msgs.length; c.send({ t: "unfit", ship: SHIP, idx: 0 }); await sleep(300);
t.ok(fitOf().length === hull.fitSlots && since(n).some((m) => m.includes("Dock")), "fitting changes need the ship docked");

// disposition: 4 lasers + auto miner = 55 > 50
await resetShip(c); await unfitAll();
for (let i = 0; i < 4; i++) await fit("module:mining_laser");
n = c.msgs.length; await fit("module:auto_miner");
t.ok(!fitOf().includes("module:auto_miner") && since(n).some((m) => m.includes("disposition")), "can't exceed the hull's disposition");

// batteries raise the capacitor
await unfitAll(); await fit("module:mining_laser"); await sleep(300);
const cap0 = c.ship().cap.max; await fit("module:cap_battery"); await sleep(400);
t.ok(c.ship().cap.max > cap0, "a capacitor battery raises the capacitor", { cap0, cap1: c.ship().cap.max });

// module licenses
c.dev({ cmd: "license", key: "small_mining_laser", level: 0 }); c.send({ t: "licenses" }); await sleep(800);
r = await atRock(c); n = c.msgs.length;
c.send({ t: "laser", ship: SHIP, idx: 0, on: true, rock: r.id }); await sleep(500);
t.ok(!c.ship().lasers[0].on && since(n).some((m) => m.includes("needs")), "running a module needs its license");
c.dev({ cmd: "license", key: "small_mining_laser", level: 5 }); c.send({ t: "licenses" }); await sleep(800);

// restore the standard test fit
await resetShip(c); await unfitAll();
for (const it of ["module:mining_laser", "module:mining_laser", "module:auto_miner"]) await fit(it);
t.ok(fitOf().join(",") === "module:mining_laser,module:mining_laser,module:auto_miner", "test ship back to 2 lasers + auto miner", fitOf());
await c.close();
t.done();
