// Gameplay rules from docs/FEATURES.md, checked against the running PTR.
import { connect, suite, sleep, resetShip, atRock, SHIP, H0, STATION } from "./lib.mjs";
const t = suite("gameplay");
const c = await connect();
const ORE = { owner: "ship", id: SHIP, inv: "ore" }, CARGO = { owner: "ship", id: SHIP, inv: "cargo" };
const since = (n) => c.msgs.slice(n);

// mining: a cycle delivers ore
await resetShip(c);
let r = await atRock(c);
c.send({ t: "laser", ship: SHIP, idx: 0, on: true, rock: r.id }); await sleep(800);
t.ok(c.ship().lasers[0].on, "laser activates on a locked rock in range");
const dur = c.ship().lasers[0].dur; await sleep(dur + 600);
t.ok(c.inv().ships[SHIP].ore.used > 0, "ore lands at the end of the cycle");
t.ok(c.ship().lasers[0].on, "laser repeats after a cycle");

// out of range: laser stops, target stays
c.dev({ cmd: "move", ship: SHIP, x: r.x + 2, y: r.y }); await sleep(600);
t.ok(!c.ship().lasers[0].on && c.ship().targets.length === 1, "leaving laser range stops the laser and keeps the lock");

// power off: active laser cut at once, can't be activated, auto-miner can't start
c.dev({ cmd: "move", ship: SHIP, x: r.x + 0.4, y: r.y }); await sleep(400);
c.send({ t: "laser", ship: SHIP, idx: 0, on: true, rock: r.id }); await sleep(500);
c.send({ t: "power", ship: SHIP, mod: "laser", idx: 0, on: false }); await sleep(500);
t.ok(!c.ship().lasers[0].on && c.ship().lasers[0].off, "powering off cuts an active laser");
c.send({ t: "laser", ship: SHIP, idx: 0, on: true, rock: r.id }); await sleep(400);
t.ok(!c.ship().lasers[0].on, "a powered-off laser can't be activated");
c.send({ t: "power", ship: SHIP, mod: "auto", on: false }); c.send({ t: "auto", ship: SHIP, on: true }); await sleep(500);
t.ok(!c.ship().auto.on, "a powered-off auto miner can't be activated");
c.send({ t: "power", ship: SHIP, mod: "laser", idx: 0, on: true }); c.send({ t: "power", ship: SHIP, mod: "auto", on: true }); await sleep(300);

// full ore hold refuses to start
await resetShip(c);
c.dev({ cmd: "item", item: "ironstone", qty: 200000 }); await sleep(500);
const ii = c.inv().hangars[0].slots.findIndex((x) => x.item === "ironstone");
c.send({ t: "inv_move", from: { ...H0, slot: ii, item: "ironstone" }, to: ORE }); await sleep(500);
r = await atRock(c); let n = c.msgs.length;
c.send({ t: "laser", ship: SHIP, idx: 0, on: true, rock: r.id }); await sleep(600);
t.ok(!c.ship().lasers[0].on && since(n).some((m) => m.includes("ore hold full")), "a full ore hold refuses activation with a message");

// selling: docked only, ore only, follows a shifted slot
const cr = c.inv().credits;
c.send({ t: "sell", ref: ORE, slot: 0, item: "ironstone", qty: 1 }); await sleep(400);
t.ok(c.inv().credits === cr, "can't sell from a ship in space");
await resetShip(c);
c.dev({ cmd: "item", item: "manual:barges", qty: 1 }); c.dev({ cmd: "item", item: "cuprite", qty: 5 }); await sleep(500);
const slots = c.inv().hangars[0].slots, mi = slots.findIndex((x) => x.item === "manual:barges"), q = (k) => (c.inv().hangars[0].slots.find((x) => x.item === k) || {}).qty || 0;
const m0 = q("manual:barges"), cu0 = q("cuprite");
c.send({ t: "sell", ref: H0, slot: mi, item: "manual:barges", qty: 1 }); await sleep(400);
t.ok(q("manual:barges") === m0, "manuals can't be sold");
c.send({ t: "sell", ref: H0, slot: mi, item: "cuprite", qty: 1 }); await sleep(400);
t.ok(q("cuprite") === cu0 - 1 && q("manual:barges") === m0, "sell follows the named item when the slot holds something else");

// cans
await resetShip(c);
const ci = c.inv().hangars[0].slots.findIndex((x) => x.item === "cuprite");
c.send({ t: "inv_move", from: { ...H0, slot: ci, item: "cuprite" }, to: CARGO }); await sleep(400);
n = c.msgs.length;
c.send({ t: "jettison", ref: CARGO, slot: 0, item: "cuprite", qty: 2 }); await sleep(300);
t.ok(since(n).some((m) => m.includes("Undock")), "can't jettison while docked");
const cans0 = Object.keys(c.inv().cans).length;
c.send({ t: "dock", ship: SHIP, dock: false }); await sleep(500);
c.send({ t: "jettison", ref: CARGO, slot: 0, item: "cuprite", qty: 2 }); await sleep(500);
const cans = Object.keys(c.inv().cans);
t.ok(cans.length === cans0 + 1, "jettison in space creates a can");
n = c.msgs.length;
c.send({ t: "jettison", ref: CARGO, slot: 0, item: "cuprite", qty: 1 }); await sleep(400);
t.ok(since(n).some((m) => m.includes("jettison again")), "one jettison per 30 minutes");
const myCan = cans.find((id) => id.includes(":" + "1:")) || cans[cans.length - 1];
c.dev({ cmd: "move", ship: SHIP, x: c.ship().x + 4, y: c.ship().y }); await sleep(500);
n = c.msgs.length;
c.send({ t: "inv_move", from: { owner: "can", id: myCan, slot: 0 }, to: CARGO }); await sleep(400);
t.ok(since(n).some((m) => m.includes("2.5 km")), "can transfers need a ship within 2.5 km");
c.send({ t: "destroy_can", can: myCan }); await sleep(400);
t.ok(c.inv().jetUntil === 0, "destroying your can resets the jettison cooldown");

// (owner) no warping point to point inside a POI: afterburners and microwarpdrives do that job
await resetShip(c);
c.send({ t: "dock", ship: SHIP, dock: false }); await sleep(600);
{ const s0 = c.ship(); c.send({ t: "move", ships: [SHIP], x: s0.x + 30, y: s0.y - 8 }); await sleep(100); c.send({ t: "warp", ship: SHIP }); await sleep(1500);
  t.ok(!c.ship().wp && !c.ship().warp, "warp inside a POI is refused", c.ship().wp); }
await resetShip(c);

// undocking: out of the bay, flies away and stands still near the edge of the dock ring, facing away
await resetShip(c);
c.send({ t: "dock", ship: SHIP, dock: false }); await sleep(400);
t.ok(c.ship().moving && Math.hypot(c.ship().x - STATION.x, c.ship().y - STATION.y) < 1, "an undocking ship starts at the station, moving");
for (let i = 0; i < 80 && c.ship().moving; i++) await sleep(150);
{ const s = c.ship(), d = Math.hypot(s.x - STATION.x, s.y - STATION.y), away = Math.atan2(s.y - STATION.y, s.x - STATION.x), dh = Math.abs(Math.atan2(Math.sin(s.h - away), Math.cos(s.h - away)));
  t.ok(!s.moving && d > 3 && d < 4, "it stops near the edge of the dock ring", d);
  t.ok(dh < 0.5, "facing away from the station", dh); }

// crew rule
await resetShip(c);
c.send({ t: "decrew", ship: SHIP }); await sleep(400); n = c.msgs.length;
c.send({ t: "dock", ship: SHIP, dock: false }); await sleep(400);
t.ok(c.ship().docked && since(n).some((m) => m.includes("no pilot")), "a ship without a pilot can't undock");
await resetShip(c);

await c.close();
t.done();
