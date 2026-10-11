// The world (docs/FEATURES.md › The world): the Expanse's empty hexagon, one Prospector each, click to fly, the edge
// stops ships, ships don't overlap, what each player is sent, saving and logging off. Part 1 drives the World
// directly; part 2 flies on the PTR.
import { World, insideExpanse, clampToExpanse } from "../../packages/server/src/game/world.js";
import { EXPANSE_APOTHEM_KM, SPAWN_SPREAD_KM, LOGOUT_GRACE_MS, SHIP_TYPES } from "../../packages/server/src/game/constants.js";
import { connect, suite, sleep, SHIP } from "./lib.mjs";
const t = suite("world");
const run = (w, sec) => { for (let i = 0; i < sec * 20; i++) w.tick(0.05); };

const w = new World(), A = EXPANSE_APOTHEM_KM, R = A / Math.cos(Math.PI / 6);
t.ok(A === 10_000, "the hexagon is 20,000 km across, flat to flat (1 AU at the map's 20,000 km per AU)");
t.ok(insideExpanse(0, A - 1) && !insideExpanse(0, A + 1) && insideExpanse(R - 1, 0) && !insideExpanse(R + 1, 0), "flat top and bottom, corners left and right");
const a = w.addPlayer("a", "A", () => {}), sa = w.ships.get("a:ship:0");
t.ok(sa && sa.type === "chisel" && Math.hypot(sa.x, sa.y) <= SPAWN_SPREAD_KM && w.ships.size === 1, "a new player gets one Prospector near the centre");
w.addPlayer("a", "A", () => {}); t.ok(w.ships.size === 1, "and only ever one");

w.cmdMove("b", sa.id, 10, 0); t.ok(!sa.moving, "only the owner can fly it");
for (const [x, y] of [["1", 1], [NaN, 0], [1, Infinity], [null, 2], [{}, []]]) w.cmdMove("a", sa.id, x, y);
t.ok(!sa.moving, "junk coordinates are ignored");
Object.assign(sa, { x: 0, y: 0 }); w.cmdMove("a", sa.id, 3, 4);
run(w, 30); t.ok(Math.hypot(sa.x - 3, sa.y - 4) < 0.05 && !sa.moving && Math.hypot(sa.vx, sa.vy) === 0, "it flies to the point and stops there", [sa.x, sa.y]);
const T = SHIP_TYPES.chisel; let top = 0; Object.assign(sa, { x: 0, y: 0 }); w.cmdMove("a", sa.id, 50, 0);
for (let i = 0; i < 400; i++) { w.tick(0.05); top = Math.max(top, Math.hypot(sa.vx, sa.vy)); }
t.ok(Math.abs(top - T.speedKmps) < 1e-6, "at the Prospector's top speed (" + T.speedKmps * 1000 + " m/s)", top);

// the edge
w.cmdMove("a", sa.id, 0, A + 500);
t.ok(insideExpanse(sa.tx, sa.ty) && Math.abs(sa.ty - (A - T.radiusKm)) < 1e-6, "a target past the edge is pulled inside it", [sa.tx, sa.ty]);
Object.assign(sa, { x: 0, y: A - 0.5, vx: 0, vy: T.speedKmps, moving: false }); run(w, 5);
t.ok(insideExpanse(sa.x, sa.y, T.radiusKm - 1e-6) && sa.vy === 0, "a ship coasting into the edge stops at it", [sa.x, sa.y, sa.vy]);
const c = clampToExpanse(R * 2, R * 2); t.ok(insideExpanse(c.x, c.y), "clamping works from any direction, corners too", c);

// ships don't overlap
const b = w.addPlayer("b", "B", () => {}), sb = w.ships.get("b:ship:0");
Object.assign(sa, { x: 100, y: 100, vx: 0, vy: 0, moving: false }); Object.assign(sb, { x: 100.01, y: 100, vx: 0, vy: 0, moving: false });
w.tick(0.05); t.ok(Math.hypot(sa.x - sb.x, sa.y - sb.y) >= sa.radius + sb.radius - 1e-9, "ships push apart instead of overlapping");

// what each player is sent
w.cmdView("b", 100, 100, 10); t.ok(w.snapshotFor(b).ships.length === 2, "ships in your camera's view are sent");
w.cmdView("b", 3000, 0, 10); const sn = w.snapshotFor(b);
t.ok(sn.ships.length === 1 && sn.ships[0].mine, "ships outside it aren't, but your own always is");
w.cmdView("b", "x", 0, 10); t.ok(w.players.get("b").view === null, "a junk view falls back to around your ship");
w.cmdView("b", 0, 0, 1e12); t.ok(w.players.get("b").view.w === 4 * A, "and a client can't claim a view wider than the map");
w.cmdMove("a", sa.id, 150, 150);
t.ok(!("tx" in (w.snapshotFor(b).ships.find((s) => s.id === "a:ship:0") || {})) && w.ships.get("a:ship:0").moving, "other players' destinations aren't sent");

// saving and logging off
w.cmdMove("a", sa.id, 120, 100); run(w, 2);
const saved = JSON.parse(JSON.stringify(w.exportState("a")));
w.removePlayer("a"); run(w, 0.1); t.ok(w.ships.has(sa.id), "a reload within the grace keeps the ship in space");
w.players.get("a").offlineSince = Date.now() - LOGOUT_GRACE_MS - 1; w.tick(0.05);
t.ok(!w.players.has("a") && !w.ships.has(sa.id), "logging off takes the ship out of the world");
w.addPlayer("a", "A", () => {}, saved); const back = w.ships.get("a:ship:0");
t.ok(Math.abs(back.x - saved.ship.x) < 1e-3 && Math.abs(back.y - saved.ship.y) < 1e-3, "logging back in puts it where it was");
const w2 = new World(); w2.addPlayer("z", "Z", () => {}, { ship: { x: 1e9, y: -1e9, h: 0 } }); const sz = w2.ships.get("z:ship:0");
t.ok(insideExpanse(sz.x, sz.y), "a saved spot outside the edge comes back inside it");

// ---- part 2: on the PTR ----
const ws = await connect();
t.ok(ws.last.hello && ws.last.hello.cfg.expanseApothemKm === A && ws.last.hello.cfg.shipTypes.chisel, "hello carries the world's size and the Prospector");
ws.dev({ cmd: "move", x: 0, y: 0 }); await sleep(400);
ws.send({ t: "move", ship: SHIP, x: 0.5, y: 0 }); await sleep(800);
t.ok(ws.mine().moving && ws.mine().tx === 0.5, "the client sees its order", ws.mine());
await sleep(4000);
t.ok(Math.abs(ws.mine().x - 0.5) < 0.06 && !ws.mine().moving, "and the ship arrives", ws.mine());
ws.dev({ cmd: "move", x: 0, y: 0 }); await sleep(300); await ws.close();
t.done();
