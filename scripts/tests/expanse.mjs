// The Expanse (docs/FEATURES.md › The Expanse): POIs, warp-to, belts by population, hidden POIs, logout and login.
// Part 1 drives the World directly with many players (the PTR has only one account); part 2 runs warp-to on the PTR.
import { World } from "../../packages/server/src/game/world.js";
import { LOGOUT_GRACE_MS, BELTS_MIN, PLAYERS_PER_BELT } from "../../packages/server/src/game/constants.js";
import { connect, suite, sleep, resetShip, SHIP } from "./lib.mjs";
const t = suite("expanse");

// ---- part 1: the rules ----
const w = new World();
const LIC = { mining_frigate: 5, small_mining_laser: 1 };
const mk = (id) => { const p = w.addPlayer(id, "P" + id, () => {}); p.pilots = [{ id: "pl" + id, name: "Pilot " + id, licenses: LIC }]; w.assignDefaultPilots(id); return p; };
const shipOf = (id) => [...w.ships.values()].find((s) => s.owner === id);
const kinds = (k) => [...w.pois.values()].filter((p) => p.kind === k);
const liveBelts = () => kinds("belt").filter((b) => !b.retired);
// a warp takes seconds in real time: fast-forward it
const land = (s) => { for (let k = 0; k < 400 && s.wp; k++) { const now = Date.now(); if (s.wp.ph === "palign") { const d = s.wp.dir; s.vx = Math.cos(d) * s.speed; s.vy = Math.sin(d) * s.speed; } else if (s.wp.at) s.wp.at = now - 60000; w._warpTick(s, now); } };
const undock = (s) => { s.docked = false; s.sys = "station"; s.x = 6; s.y = 0; s.tx = 6; s.ty = 0; s.moving = false; };

t.ok(kinds("planet").length === 4 && kinds("station").length === 1 && kinds("gate").length === 6, "the Expanse has 4 planets, 1 station and 6 stargates");
t.ok(kinds("gate").every((g) => Math.abs(Math.hypot(g.ax, g.ay) - 0.48) < 0.001 && g.state === "offline"), "the stargates sit in the middle of each edge, offline for now");
t.ok([...w.pois.values()].filter((p) => p.fixed).every((p) => p.r * 2 >= 50 && p.r * 2 <= 100), "POIs are 50-100 km across");

const a = mk("a"), sa = shipOf("a");
t.ok(sa.docked && sa.sys === "station", "a new player starts docked at the station");
w._maintainPois();
t.ok(liveBelts().length === BELTS_MIN, "with few players there are " + BELTS_MIN + " belts", liveBelts().length);
const crowd = Array.from({ length: 40 }, (_, i) => mk("c" + i));
w._maintainPois();
t.ok(liveBelts().length === Math.ceil(41 / PLAYERS_PER_BELT), "belts grow with the players online", liveBelts().length);
for (const p of crowd) { w.removePlayer(p.id); p.offlineSince = 0; }
w.tick(0.05);
t.ok(crowd.every((p) => !w.players.has(p.id)) && !shipOf("c0"), "logged-off players leave the world after the grace");

// warp-to: align → window → off-POI → drop out inside the target
undock(sa);
const belt = liveBelts()[0];
w.cmdWarpTo("b", [sa.id], belt.id); t.ok(!sa.wp, "only the owner can order a warp");
w.cmdWarpTo("a", [sa.id], "nowhere"); t.ok(!sa.wp, "warp-to needs a real POI");
w.cmdWarpTo("a", [sa.id], belt.id);
t.ok(sa.wp && sa.wp.ph === "palign" && sa.wp.to === belt.id, "a warp-to starts by aligning");
const phases = new Set(); for (let k = 0; k < 400 && sa.wp; k++) { phases.add(sa.wp.ph); const now = Date.now(); if (sa.wp.ph === "palign") { sa.vx = Math.cos(sa.wp.dir) * sa.speed; sa.vy = Math.sin(sa.wp.dir) * sa.speed; } else sa.wp.at = now - 60000; if (sa.wp.ph === "poi") t.ok(sa.sys === null, "off-POI the ship is in no POI"); w._warpTick(sa, now); }
t.ok(["palign", "open", "poi", "exit"].every((p) => phases.has(p)), "warp goes align → window → off-POI → exit", [...phases]);
t.ok(sa.sys === belt.id && Math.hypot(sa.x, sa.y) <= belt.r, "the ship drops out inside the target POI", [sa.sys, sa.x, sa.y]);
w.cmdMove("a", [sa.id], 900, 0, belt.id); w._tickShips(0.05);
t.ok(Math.hypot(sa.tx, sa.ty) <= belt.r + 1e-6, "move orders stay inside the POI's boundary");
w.cmdDock("a", sa.id, true); t.ok(!sa.docked, "no docking outside the station POI");

// what each player gets: the POI their camera is on, plus their own ships anywhere
const b = mk("b"), sb = shipOf("b"); undock(sb);
w.cmdView("b", "station");
t.ok(!w.snapshotFor(b).ships.some((s) => s.id === sa.id), "ships in other POIs aren't sent");
w.cmdView("b", belt.id);
t.ok(w.players.get("b").view === null && !w.snapshotFor(b).ships.some((s) => s.id === sa.id) && !w.fieldsFor(b).fields.some((f) => f.sys === belt.id), "nobody sees into a POI without a ship of theirs in it (owner)");
w._buyShip(b, "chisel"); const sb2 = [...w.ships.values()].find((s) => s.owner === "b" && s !== sb); Object.assign(sb2, { docked: false, sys: belt.id, x: -5, y: 5, tx: -5, ty: 5 });
w.cmdView("b", belt.id);
t.ok(w.snapshotFor(b).ships.some((s) => s.id === sa.id) && w.snapshotFor(b).ships.some((s) => s.id === sb.id), "with a ship there, the POI the camera is on is sent in full, and your own ships always");
t.ok(w.fieldsFor(b).fields.some((f) => f.sys === belt.id), "its rocks come with it");
sb2.sys = "station"; sb2.docked = true;
t.ok(!w.snapshotFor(b).ships.some((s) => s.id === sa.id), "once your ships leave, it stops");
// ships in different POIs never collide
sb.x = sa.x; sb.y = sa.y; const bx = sb.x; w._tickShips(0.05); t.ok(Math.abs(sb.x - bx) < 1e-9, "ships in different POIs don't push each other");

// a belt's lifetime runs out while someone's inside: hidden, held open, replaced, then gone once empty
belt.expiresAt = 0; w._maintainPois();
t.ok(belt.retired && w.pois.has(belt.id), "an expired belt with players inside stays open");
t.ok(!w.poisFor(b).some((p) => p.id === belt.id) && w.poisFor(a).some((p) => p.id === belt.id && p.hidden), "it leaves everyone's map but the people inside");
t.ok(liveBelts().length >= BELTS_MIN, "a held belt doesn't count: a replacement spawns", liveBelts().length);
w.cmdView("b", belt.id); t.ok(w.players.get("b").view === null, "nobody new can look into a hidden POI");
w.cmdWarpTo("b", [sb.id], belt.id); t.ok(!sb.wp, "nor warp to it");
const other = liveBelts()[0]; w.cmdWarpTo("a", [sa.id], other.id); land(sa);
w.pois.get(belt.id).createdAt = 0; w._maintainPois();
t.ok(!w.pois.has(belt.id), "once the last ship leaves, the belt is gone");

// logging out and back in: back in the same POI, or a fresh unmarked 20 km POI if it's gone
const saved = JSON.parse(JSON.stringify(w.exportState("a")));
w.removePlayer("a"); w.players.get("a").offlineSince = Date.now() - LOGOUT_GRACE_MS - 1; w.tick(0.05);
t.ok(!w.players.has("a") && !shipOf("a"), "logging off despawns the fleet");
{ const p = w.addPlayer("a", "Pa", () => {}, saved); p.pilots = [{ id: "pla", name: "Pilot a", licenses: LIC }]; }
t.ok(shipOf("a").sys === other.id, "logging in puts the ship back in its POI", shipOf("a").sys);
const save2 = JSON.parse(JSON.stringify(w.exportState("a")));
w.removePlayer("a"); w.players.get("a").offlineSince = 0; w.tick(0.05);
w._removePoi(w.pois.get(other.id));
w.addPlayer("a", "Pa", () => {}, save2);
const spawn = w.pois.get(shipOf("a").sys);
t.ok(spawn && spawn.kind === "spawn" && spawn.hidden && spawn.r === 10 && Math.hypot(shipOf("a").x, shipOf("a").y) <= spawn.r, "if its POI is gone, it arrives in a new 20 km POI", spawn);
t.ok(!w.poisFor(b).some((p) => p.id === spawn.id) && w.poisFor(w.players.get("a")).some((p) => p.id === spawn.id), "a spawn-in POI has no map marker for anyone else");
w.cmdWarpTo("a", [shipOf("a").id], "station"); land(shipOf("a")); spawn.createdAt = 0; w._maintainPois();
t.ok(!w.pois.has(spawn.id), "a spawn-in POI goes once its player leaves");
t.ok(w.loadPoi(w.exportPoi(liveBelts()[0])) === undefined, "a belt survives a save / load round trip");

// local chat reaches the whole Expanse
let heard = 0; const c1 = mk("x"), c2 = mk("y"); c2.send = (m) => { if (m.includes("hello expanse")) heard++; };
w.cmdChat("x", "hello expanse", "local"); t.ok(heard === 1, "local chat reaches everyone in the Expanse");

// ---- part 2: warp-to on the PTR ----
const c = await connect();
t.ok((c.last.hello.pois || []).filter((p) => p.kind === "belt").length >= BELTS_MIN, "the map's POIs arrive with hello", (c.last.hello.pois || []).length);
await resetShip(c);
c.send({ t: "dock", ship: SHIP, dock: false }); await sleep(800);
const target = (c.last.pois?.pois || c.last.hello.pois).find((p) => p.kind === "belt");
c.send({ t: "warpto", ships: [SHIP], poi: target.id });
const seen = new Set(); const t0 = Date.now();
while (Date.now() - t0 < 30000) { await sleep(100); const s = c.ship(); if (s && s.wp) seen.add(s.wp.ph); if (s && s.sys === target.id && !s.wp) break; }
t.ok(["palign", "open", "poi", "exit"].every((p) => seen.has(p)), "the client sees align → window → off-POI → exit", [...seen]);
t.ok(c.ship().sys === target.id, "the ship arrives in the belt", c.ship().sys);
await sleep(600);
t.ok((c.last.belts?.belts || []).some((f) => f.sys === target.id && f.rocks.length > 20), "the belt's rocks arrive");
c.send({ t: "view", poi: "station" }); await sleep(300);
c.send({ t: "view", poi: target.id }); await sleep(300);
await resetShip(c);
await c.close();
t.done();
