// Objects in space: Lock Target / Unlock Target, Align To, Move towards, Info (docs/FEATURES.md › Objects in space).
// Drives the World directly.
import { World } from "../../packages/server/src/game/world.js";
import { SHIP_TYPES } from "../../packages/server/src/game/constants.js";
import { suite } from "./lib.mjs";
const t = suite("targets");
const T = SHIP_TYPES.chisel;
const sent = { a: [], b: [] };
const w = new World(), mk = (id, pilots) => w.addPlayer(id, id.toUpperCase(), (m) => sent[id].push(JSON.parse(m)), null, pilots);
const a = mk("a", [{ id: 1, name: "Ann" }, { id: 2, name: "Bea" }]), b = mk("b", [{ id: 1, name: "Cid" }]);
w.tick(0.05);
const sa = w.ships.get("a:ship:1"), sa2 = w.ships.get("a:ship:2"), sb = w.ships.get("b:ship:1");
const belt = [...w.pois.values()][0], k = belt.field.rocks[0], k2 = belt.field.rocks[1];
const put = (s, x, y) => Object.assign(s, { x, y, tx: x, ty: y, vx: 0, vy: 0, moving: false, chase: null });
const solid = k.r * 0.9;
put(sa, k.x + solid + sa.radius + 2, k.y); put(sb, sa.x, sa.y + 1); put(sa2, sa.x, sa.y - 1); w.tick(0.05);
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
const far = belt.field.rocks.find((r) => Math.hypot(r.x - sa.x, r.y - sa.y) - r.r * 0.9 - sa.radius > T.targetRangeKm + 0.5);
w.cmdLock("a", sa.id, "rock", far.id);
t.ok(!sa.targets.some((g) => g.id === far.id), "nothing beyond targeting range (" + T.targetRangeKm + " km)");
w.cmdLock("a", sa.id, "ship", sa.id); w.cmdLock("a", sb.id, "rock", k.id); w.cmdLock("a", sa.id, "station", "x"); w.cmdLock("a", sa.id, "rock", 5); w.cmdLock("a", sa.id, "rock", "x".repeat(200)); w.cmdLock("a", "nope", "rock", k.id);
t.ok(sa.targets.length === 1 && !sb.targets.length, "not itself, not with someone else's ship, nothing hostile");
w.cmdLock("a", sa.id, "ship", sb.id); w.cmdLock("a", sa.id, "ship", sa2.id);
const near = belt.field.rocks.filter((r) => r !== k && Math.hypot(r.x - sa.x, r.y - sa.y) - r.r * 0.9 - sa.radius <= T.targetRangeKm);
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
const other = [...w.pois.values()].find((p) => p !== belt);
w._startWarp(sa, other, Date.now());
t.ok(!sa.targets.length && !sa.chase, "warping drops every lock");
w.cmdLock("a", sa.id, "rock", k.id);
t.ok(!sa.targets.length, "no locking mid-warp");
sa.wp = null; put(sa, k.x + solid + sa.radius + 2, k.y);

// Move towards: to the object's edge, then stop; Align To: at it at full speed; a move order replaces either
w.cmdChase("a", sa.id, "rock", k.id, "approach"); ticks(600);
const gap = Math.hypot(sa.x - k.x, sa.y - k.y) - solid - sa.radius;
t.ok(gap < 0.15 && Math.hypot(sa.vx, sa.vy) < 0.01, "Move towards stops at the object's edge", { gap, v: Math.hypot(sa.vx, sa.vy) });
put(sb, sa.x + 4, sa.y + 4); w.cmdChase("a", sa.id, "ship", sb.id, "approach"); ticks(400);
t.ok(Math.hypot(sa.x - sb.x, sa.y - sb.y) < sa.radius + sb.radius + 0.2, "and follows a ship to it");
put(sa, sb.x - 40, sb.y); w.cmdChase("a", sa.id, "ship", sb.id, "align"); ticks(80);
t.ok(Math.hypot(sa.vx, sa.vy) > sa.speed * 0.99 && sa.vx > 0, "Align To flies at it at full speed", Math.hypot(sa.vx, sa.vy));
w.cmdMove("a", sa.id, sa.x, sa.y + 1);
t.ok(!sa.chase, "a move order replaces it");
w.cmdChase("a", sa.id, "ship", sa.id, "align"); w.cmdChase("a", sa.id, "ship", sb.id, "orbit"); w.cmdChase("b", sa.id, "ship", sb.id, "align"); w.cmdChase("a", sa.id, "rock", "belt:none#1", "align");
t.ok(!sa.chase, "not at itself, no unknown modes, not someone else's ship, nothing that isn't there");

// Info
put(sa, k.x + solid + sa.radius + 2, k.y); w.tick(0.05); sent.a.length = 0;
w.cmdInfo("a", "rock", k.id); w.cmdInfo("a", "ship", sb.id);
const ri = sent.a.find((m) => m.t === "info" && m.kind === "rock"), si = sent.a.find((m) => m.t === "info" && m.kind === "ship");
t.ok(ri && ri.ore === k.ore && ri.m3 === k.m3 && ri.size === k.size && ri.belt === belt.name, "Info on an asteroid: its ore, what's left, its size and belt", ri);
t.ok(si && si.pilot === "Cid" && si.owner === "B" && si.type === "chisel", "Info on a ship: its hull, its pilot and their player", si);
put(sb, 9000, 0); w.tick(0.05); sent.b.length = 0; w.cmdInfo("b", "rock", k.id); w.cmdInfo("b", "rock", 7); w.cmdInfo("b", "ship", {});
t.ok(!sent.b.length, "no Info on an asteroid in a belt you have no ship in, or on nonsense");
t.done();
