// Asteroid belts, align and warp (docs/FEATURES.md › Asteroid belts, Align and warp). Part 1 drives the World;
// part 2 warps on the PTR.
import { World } from "../../packages/server/src/game/world.js";
import { BELT, ORES, decayField, fieldM3, sizeFor } from "../../packages/server/src/game/belts.js";
import { BELTS_MIN, PLAYERS_PER_BELT, ALIGN_SPEED } from "../../packages/server/src/game/constants.js";
import { connect, suite, sleep, SHIP } from "./lib.mjs";
const t = suite("belts");
const w = new World(), mk = (id) => w.addPlayer(id, id, () => {}, null, [{ id: 1, name: "P" + id }]);
const a = mk("a"), sa = w.ships.get("a:ship:1"); w.tick(0.05);
const belts = () => [...w.pois.values()].filter((p) => p.kind === "belt" && !p.retired);
t.ok(belts().length === BELTS_MIN, "a few players: " + BELTS_MIN + " belts", belts().length);
for (let i = 0; i < 40; i++) mk("c" + i); w.nextPoiTick = 0; w.tick(0.05);
t.ok(belts().length === Math.ceil(41 / PLAYERS_PER_BELT), "more belts with more players online", belts().length);
const b = belts()[0], f = b.field;
t.ok(b.r * 2 === 100, "a belt is 100 km across");
const ds = f.rocks.map((k) => Math.hypot(k.x - b.x, k.y - b.y));
t.ok(Math.min(...ds) >= BELT.arcKm - BELT.arcJitterKm - 0.01 && Math.max(...ds) <= b.r, "its rocks lie 40-50 km out (the crescent's 45 km, give or take 5)", [Math.min(...ds), Math.max(...ds)]);
const off = f.rocks.map((k) => { let d = Math.atan2(k.y - b.y, k.x - b.x) - f.dir; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); });
t.ok(Math.max(...off) <= Math.PI / 2 + 1e-9, "on a half moon: within 90° either side of its middle");
t.ok(fieldM3(f) >= 2_000_000, "with at least 2,000,000 m³ of ore", fieldM3(f));
const all = new Set(); for (const p of belts()) for (const k of p.field.rocks) all.add(k.ore);
t.ok([...all].every((o) => ORES.some((x) => x.key === o)) && ORES.length === 5, "five ore types", [...all]);
t.ok(f.rocks.every((k) => k.size === sizeFor(k.m3)), "a rock's size follows its ore: 1000 m, 500 m, 200 m");

// time: untouched for an hour, then each rock wastes away, shrinking a size at a time
const m0 = fieldM3(f), now = Date.now();
decayField(f, now + 59 * 60e3); t.ok(fieldM3(f) === m0, "untouched for the first hour");
const big = f.rocks.find((k) => k.size === 1000); const v0 = f.ver;
decayField(f, now + 60 * 60e3 + 30 * 60e3); t.ok(fieldM3(f) < m0, "then it slowly loses ore");
const half = big.fadeAt + (big.goneAt - big.fadeAt) * 0.8; decayField(f, half);
t.ok(big.size < 1000 && f.ver > v0, "a large rock shrinks to medium and small as it goes", big.size);
decayField(f, now + 5 * 3600e3); t.ok(!f.rocks.length, "after a few hours it's gone");

// a mined-out belt leaves the map, stays open while ships are inside, then closes
const other = belts()[1]; Object.assign(sa, { x: other.x, y: other.y, tx: other.x, ty: other.y });
decayField(other.field, Date.now() + 10 * 3600e3); w.nextPoiTick = 0; w.tick(0.05);
t.ok(other.retired && w.pois.has(other.id), "a mined-out belt with ships inside stays open");
const c0 = w.players.get("c0");
t.ok(!w.poisFor(c0).some((p) => p.id === other.id) && w.poisFor(a).some((p) => p.id === other.id && p.hidden), "it's off everyone's map but those inside");
t.ok(belts().length >= BELTS_MIN, "and a replacement spawns");
t.ok(w.fieldsFor(a).fields.some((x) => x.poi === other.id) && !w.fieldsFor(c0).fields.length, "rocks are only sent to players with ships in the belt");
Object.assign(sa, { x: 0, y: 0, tx: 0, ty: 0 }); w.nextPoiTick = 0; w.tick(0.05);
t.ok(!w.pois.has(other.id), "once they leave, it closes");

// align, then warp
const tgt = belts()[0]; Object.assign(sa, { x: 0, y: 0, vx: 0, vy: 0, moving: false });
w.cmdAlign("c1", sa.id, tgt.id); t.ok(!sa.dest, "only the owner can order it");
w.cmdAlign("a", sa.id, "nowhere"); t.ok(!sa.dest, "only to a real POI");
w.cmdAlign("a", sa.id, tgt.id); t.ok(sa.dest === tgt.id && !sa.warpReq && sa.moving, "Align: the POI becomes the destination");
for (let i = 0; i < 100; i++) w.tick(0.05);
t.ok(!sa.wp && Math.hypot(sa.vx, sa.vy) <= sa.speed + 1e-9, "aligning flies at regular speed, no warp", Math.hypot(sa.vx, sa.vy));
w.cmdWarp("a", sa.id); t.ok(sa.warpReq, "Warp to the destination");
for (let i = 0; i < 60 && !sa.wp; i++) w.tick(0.05);
t.ok(sa.wp && sa.wp.poi === tgt.id, "aligned (≥ " + ALIGN_SPEED * 100 + "% speed, on heading): it warps");
w.cmdMove("a", sa.id, 0, 0); t.ok(!sa.moving, "no new orders mid-warp");
for (let i = 0; i < 200 && sa.wp; i++) { sa.wp.at -= 60000; w.tick(0.05); }
t.ok(!sa.wp && w._inPoi(sa, tgt) && !sa.dest, "it drops out inside the belt", Math.hypot(sa.x - tgt.x, sa.y - tgt.y));
w.cmdWarp("a", sa.id, tgt.id); t.ok(!sa.warpReq, "no warping to the POI you're already in");
const t2 = belts()[1]; Object.assign(sa, { x: 300, y: -300, vx: 0, vy: 0 });   // (clear of everyone else's ships near the centre)
w.cmdAlign("a", sa.id, t2.id); for (let i = 0; i < 80; i++) w.tick(0.05);
const v = Math.hypot(sa.vx, sa.vy); decayField(t2.field, Date.now() + 10 * 3600e3); w.nextPoiTick = 0; w.tick(0.05);
for (let i = 0; i < 40; i++) w.tick(0.05);
t.ok(!sa.dest && sa.drift && Math.abs(Math.hypot(sa.vx, sa.vy) - v) < 1e-6, "when the POI stops showing, the destination goes and the ship drifts on", [v, Math.hypot(sa.vx, sa.vy)]);
w.cmdWarp("a", sa.id, t2.id); t.ok(!sa.warpReq, "and it can't warp there");

// (owner) asteroids are solid out to their whole art: a ship flies around one (pathfinding), never closer than its
// edge, and can't be ordered inside it; only a warp passes through
{ const wb = new World(); wb.addPlayer("z", "Z", () => {}, null, [{ id: 1, name: "Z" }]); wb.tick(0.05);
  const bz = [...wb.pois.values()].find((p) => p.kind === "belt"), rock = bz.field.rocks.find((k) => k.size === 1000) || bz.field.rocks[0], sz = wb.ships.get("z:ship:1");
  Object.assign(sz, { x: rock.x - 3, y: rock.y, tx: rock.x - 3, ty: rock.y, vx: 0, vy: 0, moving: false });
  for (const k of bz.field.rocks) if (k !== rock && Math.hypot(k.x - rock.x, k.y - rock.y) < 8) k.x += 1000;   // clear the neighbours
  bz.field.ver++;
  wb.cmdMove("z", sz.id, rock.x + 3, rock.y); let minD = Infinity;
  t.ok(sz.path && sz.path.length > 1, "a move order past a rock gets a path around it", sz.path);
  for (let i = 0; i < 600; i++) { wb.tick(0.05); minD = Math.min(minD, Math.hypot(sz.x - rock.x, sz.y - rock.y)); }
  t.ok(minD >= rock.r + sz.radius - 1e-6, "a ship never gets closer than the rock's edge", [minD, rock.r]);
  t.ok(Math.hypot(sz.x - rock.x - 3, sz.y - rock.y) < 0.05, "and arrives on the far side", [sz.x - rock.x, sz.y - rock.y]);
  wb.cmdMove("z", sz.id, rock.x, rock.y); const end = sz.path[sz.path.length - 1];
  t.ok(Math.hypot(end.x - rock.x, end.y - rock.y) >= rock.r + sz.radius + 0.07 - 1e-6, "an order into a rock stops outside its bounds"); }

// ---- part 2: on the PTR ----
const c = await connect();
t.ok((c.last.hello.pois || []).filter((p) => p.kind === "belt").length >= BELTS_MIN, "the map's belts arrive with hello");
c.dev({ cmd: "move", x: 0, y: 0 }); await sleep(400);
const target = c.last.hello.pois.find((p) => p.kind === "belt");
c.send({ t: "warp", ship: SHIP, poi: target.id });
const t0 = Date.now(); let saw = false;
while (Date.now() - t0 < 45000) { await sleep(200); const s = c.mine(); if (s && s.warp) saw = true; if (saw && s && !s.warp) break; }
t.ok(saw, "the client sees the warp");
await sleep(800);
t.ok(Math.hypot(c.mine().x - target.x, c.mine().y - target.y) <= target.r && (c.last.belts?.belts || []).some((x) => x.poi === target.id && x.rocks.length > 20), "it lands in the belt and the rocks arrive", c.mine());
c.dev({ cmd: "move", x: 0, y: 0 }); await sleep(300); await c.close();
t.done();
