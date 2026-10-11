// Objects in space: Lock Target / Unlock Target, Align To, Move towards, Info (docs/FEATURES.md › Objects in space).
// Drives the World directly.
import { World } from "../../packages/server/src/game/world.js";
import { SHIP_TYPES } from "../../packages/server/src/game/constants.js";
import { suite } from "./lib.mjs";
const t = suite("targets");
const T = SHIP_TYPES.chisel;
const sent = { a: [], b: [] };
const w = new World(), mk = (id, pilots) => w.addPlayer(id, id.toUpperCase(), (m) => sent[id].push(JSON.parse(m)), null, pilots);
const a = mk("a", [{ id: 1, name: "Ann", licenses: { mining_frigate: 5 } }, { id: 2, name: "Bea", licenses: { mining_frigate: 5 } }]), b = mk("b", [{ id: 1, name: "Cid", licenses: { mining_frigate: 5 } }]);
w.tick(0.05);
const sa = w.ships.get("a:ship:1"), sa2 = w.ships.get("a:ship:2"), sb = w.ships.get("b:ship:1");
const belt = [...w.pois.values()].find((p) => p.kind === "belt"), k = belt.field.rocks[0], k2 = belt.field.rocks[1];
const put = (s, x, y) => Object.assign(s, { x, y, tx: x, ty: y, vx: 0, vy: 0, moving: false, chase: null });
const solid = k.r;   // (owner) an object's edge: its whole art
// a point d km from the rock's edge, on the belt's centre side (so it's always inside the belt)
const inb = Math.atan2(belt.y - k.y, belt.x - k.x), nearK = (d) => [k.x + Math.cos(inb) * (solid + sa.radius + d), k.y + Math.sin(inb) * (solid + sa.radius + d)];
put(sa, ...nearK(2)); put(sb, sa.x + Math.cos(inb + 1.2), sa.y + Math.sin(inb + 1.2)); put(sa2, sa.x + Math.cos(inb - 1.2), sa.y + Math.sin(inb - 1.2)); w.tick(0.05);
const ticks = (n, dt = 0.05) => { for (let i = 0; i < n; i++) w.tick(dt); };

// locking
w.cmdLock("a", sa.id, "rock", k.id);
t.ok(sa.targets.length === 1 && !sa.targets[0].locked && Math.abs(sa.targets[0].lockAt - w.simAt - T.lockMs) < 5, "Lock Target starts a lock that takes the hull's lock time", sa.targets);
w.cmdUnlock("a", sa.id, "rock", k.id);
t.ok(sa.targets.length === 1, "a lock in progress can't be cancelled (owner)");
sa.targets[0].lockAt = Date.now() - 1; w.tick(0.05);
t.ok(sa.targets[0].locked, "then it's locked");
w.cmdUnlock("a", sa.id, "rock", k.id);
t.ok(!sa.targets.length, "Unlock Target drops a locked target");
w.cmdLock("a", sa.id, "rock", k.id); w.cmdLock("a", sa.id, "rock", k.id);
t.ok(sa.targets.length === 1, "the same object can't be locked twice");

// what can't be locked
const far = belt.field.rocks.find((r) => Math.hypot(r.x - sa.x, r.y - sa.y) - r.r - sa.radius > T.targetRangeKm + 0.5);
w.cmdLock("a", sa.id, "rock", far.id);
t.ok(!sa.targets.some((g) => g.id === far.id), "nothing beyond targeting range (" + T.targetRangeKm + " km)");
w.cmdLock("a", sa.id, "ship", sa.id); w.cmdLock("a", sb.id, "rock", k.id); w.cmdLock("a", sa.id, "station", "x"); w.cmdLock("a", sa.id, "rock", 5); w.cmdLock("a", sa.id, "rock", "x".repeat(200)); w.cmdLock("a", "nope", "rock", k.id);
t.ok(sa.targets.length === 1 && !sb.targets.length, "not itself, not with someone else's ship, nothing hostile");
w.cmdLock("a", sa.id, "ship", sb.id); w.cmdLock("a", sa.id, "ship", sa2.id);
const near = belt.field.rocks.filter((r) => r !== k && Math.hypot(r.x - sa.x, r.y - sa.y) - r.r - sa.radius <= T.targetRangeKm);
for (const r of near) w.cmdLock("a", sa.id, "rock", r.id);
t.ok(sa.targets.length === Math.min(T.maxTargets, 3 + near.length) && sa.targets.length <= T.maxTargets, "up to the hull's " + T.maxTargets + " targets", sa.targets.length);
t.ok(sa.targets[0].id === k.id && sa.targets[1].id === sb.id, "in the order they were locked");

// snapshots: your targets (another player's ship too, wherever it is) with their progress; speed
w.cmdView("a", -9000, 0, 10); for (const g of sa.targets) g.lockAt = 0; w.tick(0.05);
const snap = w.snapshotFor(a), me = snap.ships.find((s) => s.id === sa.id);
t.ok(me.targets && me.targets[0].locked && me.targets[0].p === 1 && typeof me.v === "number", "your ship's snapshot carries its targets and speed", me);
t.ok(snap.ships.some((s) => s.id === sb.id), "a ship you've locked is sent even outside your view");
t.ok(!w.snapshotFor(b).ships.find((s) => s.id === sb.id).targets, "nobody else's targets are sent");

// locks break when the object leaves range, or warps; your own warp drops them all
put(sb, sa.x + T.targetRangeKm + 3, sa.y); w.tick(0.05);
t.ok(!sa.targets.some((g) => g.id === sb.id), "a target that leaves range is dropped");
put(sb, sa.x, sa.y + 1); w.cmdLock("a", sa.id, "ship", sb.id); sb.wp = { fx: 0, fy: 0, tx: 0, ty: 0, at: Date.now(), dur: 1e6, poi: belt.id }; w.tick(0.05);
t.ok(!sa.targets.some((g) => g.id === sb.id), "a target that warps away is dropped");
sb.wp = null; put(sb, sa.x, sa.y + 1); w.tick(0.05);
const other = [...w.pois.values()].find((p) => p.kind === "belt" && p !== belt);
w._startWarp(sa, other, Date.now());
t.ok(!sa.targets.length && !sa.chase, "warping drops every lock");
w.cmdLock("a", sa.id, "rock", k.id);
t.ok(!sa.targets.length, "no locking mid-warp");
sa.wp = null; put(sa, ...nearK(2));

// Move towards: to the object's edge, then stop; a move order replaces it (and Align To)
w.cmdChase("a", sa.id, "rock", k.id, "approach"); ticks(600);
const gap = Math.hypot(sa.x - k.x, sa.y - k.y) - solid - sa.radius;
t.ok(gap < 0.15 && Math.hypot(sa.vx, sa.vy) < 0.01, "Move towards stops at the object's edge", { gap, v: Math.hypot(sa.vx, sa.vy) });
put(sa, belt.x - 3, belt.y); put(sb, belt.x + 3, belt.y + 3); w.cmdChase("a", sa.id, "ship", sb.id, "approach"); ticks(900);   // (the belt's middle is clear of rocks)
t.ok(Math.hypot(sa.x - sb.x, sa.y - sb.y) < sa.radius + sb.radius + 0.2, "and follows a ship to it");
// (owner) Align To: face it at the speed it had; standing still it only turns
put(sb, belt.x + 20, belt.y); put(sa, belt.x - 20, belt.y + 5); sa.h = 0; w.cmdChase("a", sa.id, "ship", sb.id, "align"); ticks(40);
t.ok(Math.hypot(sa.x - (belt.x - 20), sa.y - (belt.y + 5)) < 1e-9 && Math.abs(sa.h - Math.atan2(-5, 40)) < 1e-6, "Align To from a standstill only turns the ship to face it", { h: sa.h });
put(sa, belt.x - 20, belt.y + 5); sa.vx = 0; sa.vy = -0.2; w.cmdChase("a", sa.id, "ship", sb.id, "align"); ticks(80);
const av = Math.hypot(sa.vx, sa.vy), adir = Math.atan2(sa.vy, sa.vx), want = Math.atan2(sb.y - sa.y, sb.x - sa.x);
t.ok(Math.abs(av - 0.2) < 0.01 && Math.abs(adir - want) < 0.02, "moving, it turns toward it and keeps its speed", { av, adir, want });
w.cmdMove("a", sa.id, sa.x, sa.y + 1);
t.ok(!sa.chase, "a move order replaces it");
put(sa, ...nearK(3)); sa.vx = Math.cos(inb + Math.PI) * 0.3; sa.vy = Math.sin(inb + Math.PI) * 0.3; w.cmdChase("a", sa.id, "rock", k.id, "align"); ticks(600);
const agap = Math.hypot(sa.x - k.x, sa.y - k.y) - k.r - sa.radius;
t.ok(agap >= 0.07 - 1e-3 && agap < 0.15 && Math.hypot(sa.vx, sa.vy) < 0.01, "Align To an asteroid stops at its no-destination line (owner), not over it", agap);
w.cmdMove("a", sa.id, sa.x, sa.y);
w.cmdChase("a", sa.id, "ship", sa.id, "align"); w.cmdChase("a", sa.id, "ship", sb.id, "orbit"); w.cmdChase("b", sa.id, "ship", sb.id, "align"); w.cmdChase("a", sa.id, "rock", "belt:none#1", "align");
t.ok(!sa.chase, "not at itself, no unknown modes, not someone else's ship, nothing that isn't there");

// Info
put(sa, ...nearK(2)); w.tick(0.05); sent.a.length = 0;
w.cmdInfo("a", "rock", k.id); w.cmdInfo("a", "ship", sb.id);
const ri = sent.a.find((m) => m.t === "info" && m.kind === "rock"), si = sent.a.find((m) => m.t === "info" && m.kind === "ship");
t.ok(ri && ri.ore === k.ore && ri.m3 === k.m3 && ri.size === k.size && ri.belt === belt.name, "Info on an asteroid: its ore, what's left, its size and belt", ri);
t.ok(si && si.pilot === "Cid" && si.owner === "B" && si.type === "chisel", "Info on a ship: its hull, its pilot and their player", si);
put(sb, 9000, 0); w.tick(0.05); sent.b.length = 0; w.cmdInfo("b", "rock", k.id); w.cmdInfo("b", "rock", 7); w.cmdInfo("b", "ship", {});
t.ok(!sent.b.length, "no Info on an asteroid in a belt you have no ship in, or on nonsense");
// (owner) renaming a ship: only your own, cleaned up; kept with the ship
w.cmdRename("a", sa.id, "  Big\n Rig\u200b "); w.cmdRename("b", sa.id, "Stolen"); w.cmdRename("a", sb.id, "Mine now"); w.cmdRename("a", sa2.id, { x: 1 }); w.cmdRename("a", sa2.id, 42);
t.ok(sa.name === "Big Rig" && !sb.name && !sa2.name, "only your own ships can be renamed, and names are cleaned up", [sa.name, sb.name, sa2.name]);
t.ok(w.exportState("a").ships["1"].name === "Big Rig" && w.snapshotFor(a).ships.find((x) => x.id === sa.id).name === "Big Rig", "the name is saved and sent to you");
w.cmdRename("a", sa.id, "x".repeat(40)); t.ok(sa.name.length === 24, "at most 24 characters");
w.cmdRename("a", sa.id, "   "); t.ok(sa.name === null, "an empty name puts back the default");
// (owner) ships always fly at their full stats; the Mining Frigate license (5 levels, level 1 known from the start,
// level N taking N × 12 min) adds a step of the hull bonuses per level
{ const L = await import("../../packages/server/src/licenses.js"), mf = L.getLicense("mining_frigate");
  const we = new World(); we.addPlayer("e", "E", () => {}, null, [{ id: 1, name: "E", licenses: {} }]); const se = we.ships.get("e:ship:1");
  t.ok(se.speed === T.speedKmps && se.hp === T.hp && se.maxTargets === T.maxTargets && se.targetRange === T.targetRangeKm && se.lockMs === T.lockMs, "a ship always has its hull's full stats, whatever the pilot's license", se);
  t.ok(mf && mf.maxLevel === 5 && L.STARTING_LICENSES.mining_frigate === 1 && mf.levelTimes.map((x) => x / 60000).join() === "12,24,36,48,60", "Mining Frigate: 5 levels, the first known from the start, stepped (level 5 an hour)", mf && mf.levelTimes);
  t.ok(T.bonuses.map((b) => b.per + ":" + b.what).join() === "4:Mining Laser yield,1:Mining Laser range,10:Mining Drones yield", "the Prospector's hull bonuses are per level", T.bonuses); }
t.done();
