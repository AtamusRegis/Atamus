// Hostile / malformed input: the server must survive everything, and the ship must stay a sane, finite thing inside
// the hexagon.
import { connect, health, suite, sleep, SHIP } from "./lib.mjs";
import { insideExpanse } from "../../packages/server/src/game/world.js";
const t = suite("fuzz");
const c = await connect();

const bad = [null, 1, "x", [], {}, { t: 5 }, { t: "move" }, { t: "move", ship: SHIP }, { t: "move", ship: "__proto__", x: 1, y: 1 }, { t: "move", ship: [SHIP], x: 1, y: 1 },
  { t: "move", ship: SHIP, x: "1", y: "2" }, { t: "move", ship: SHIP, x: NaN, y: 1 }, { t: "move", ship: SHIP, x: 1e300, y: -1e300 }, { t: "view" }, { t: "view", x: "a" },
  { t: "view", x: 0, y: 0, w: -5 }, { t: "view", x: 1e308, y: 0, w: 1e308 }, { t: "__proto__" }, { t: "constructor" }, { t: "dev", cmd: { a: 1 } }];
for (const b of bad) { c.send(b); await sleep(40); }
await sleep(300);
t.ok(await health(), "server survives malformed messages");

const vals = [0, 1, -1, 2, 0.5, 1e9, -1e12, NaN, null, undefined, "1", "x", "__proto__", [], {}, true, Infinity];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const cmds = [() => ({ t: "move", ship: pick([SHIP, SHIP, "2:ship:0", ...vals]), x: pick(vals), y: pick(vals) }), () => ({ t: "view", x: pick(vals), y: pick(vals), w: pick(vals) })];
// (paced under the flood guard: flooding counts as malformed and times the client out, tested in security.mjs)
for (let i = 0; i < 400; i++) { c.send(cmds[Math.floor(Math.random() * cmds.length)]()); await sleep(30); }
await sleep(1000);
t.ok(await health(), "server survives 400 random commands");
const s = c.mine();
t.ok(s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.h), "the ship's numbers stay finite", s);
t.ok(s && insideExpanse(s.x, s.y), "and it stays inside the hexagon", s);
c.dev({ cmd: "move", x: 0, y: 0 }); await sleep(300); await c.close();
t.done();
