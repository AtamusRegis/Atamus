// (owner) docking and undocking through a hangar: in range, the ship flies to the front of the Station's U-shaped bay,
// then slowly into it (masked: the snapshot marks it), then it's docked; undocking runs out of the bay, then away at
// full speed, stopping about 5 km out.
import { suite, connect, sleep, SHIP } from "./lib.mjs";
import { STATION } from "../../packages/server/src/game/station.js";
const X0 = STATION.x, Y0 = STATION.y;   // (the Station orbits Earth)
const t = suite("dock");
const c = await connect();
c.dev({ cmd: "move", x: X0 - 3, y: Y0 - 0.2 }); await sleep(600);
c.send({ t: "dock", ship: SHIP, where: "station" });
let sawIn = false, inX = [], docked = false;
for (let i = 0; i < 120 && !docked; i++) { await sleep(150); const s = c.ship(); if (!s) continue; if (s.dk) { sawIn = true; inX.push(s.x); } if (s.docked) docked = true; }
t.ok(sawIn && inX.length >= 2 && inX[inX.length - 1] > inX[0] && inX[0] > X0 - 1.1, "it flies to the bay's mouth on the west, then in, marked for masking (owner)", inX.slice(0, 4));
t.ok(docked, "then it's docked");
c.send({ t: "move", ship: SHIP, x: 10, y: 10 }); await sleep(300); t.ok(c.ship().docked, "(no orders while docked)");
c.send({ t: "undock", ship: SHIP }); await sleep(400);
let s = c.ship(); t.ok(s && !s.docked && s.dk && s.x > X0 - 1.1 && s.x < X0 - 0.6, "undocking starts in the bay, masked (owner)", s && { x: s.x, dk: s.dk });
c.send({ t: "move", ship: SHIP, x: 50, y: 50 }); await sleep(200); s = c.ship(); t.ok(!s.moving || s.dk, "no orders in the hangar's mouth");
let left = null; for (let i = 0; i < 60 && !left; i++) { await sleep(150); s = c.ship(); if (!s.dk) left = { ...s }; }
t.ok(left && left.v > 0.3 && left.x < X0 - 0.9 && left.moving, "out of the bay at full speed, heading west-ish (owner)", left && { v: left.v, x: left.x, tx: left.tx, ty: left.ty });
const out = Math.hypot(left.tx - left.x, left.ty - left.y); t.ok(out > 4.5 && out < 5.5 && Math.abs(Math.atan2(left.ty - left.y, left.tx - left.x)) > Math.PI * 0.8, "stopping about 5 km out, a little off straight west", { out, a: Math.atan2(left.ty - left.y, left.tx - left.x) });
c.dev({ cmd: "move", x: 0, y: 0 }); await sleep(300); await c.close();
t.done();
