// Atamus (owner, 2026-10-31): a single-player container port. One big ship docks at a time and its two ship-to-shore cranes
// unload them, one container at a time, onto yard tractors lined up under them; tractors carry the containers to storage
// areas, each with an RTG crane at its end that stacks them three high; customer trucks with a colored cab come for a
// container of that color. You pick a truck and queue where it goes. Trucks follow one-way roads and never overlap: each
// holds the tiles under it and moves on only into free ones. 32 x 32 tiles, placeholder pixel art. Rules in
// docs/FEATURES.md.
"use strict";
(() => {
const $ = (id) => document.getElementById(id);
const cv = $("view"), ctx = cv.getContext("2d");
const TAU = Math.PI * 2, rnd = Math.random, hyp = Math.hypot, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---- the port: 54 x 37 tiles of 32 px ----
// rows 0–6 water (the ship's deck on rows 2–6), 7–8 the quay (crane rails), 9–11 the STS lanes, 12 the quay road, 14–25
// storage, 26 the RTGs' rest, 27 the RTG lane, 28–31 the RTG bays, 32 the yard road, 33–36 the parking lot, 37 the gate
// road, 38 the fence. Containers are 3 tiles long (owner).
const T = 32, MW = 54, MH = 39, QUAY = 7, LINE = 9, LANE_ROWS = [9, 10, 11], QROAD = 12, REST = 26, RLANE = 27, BAY0 = 28, YROAD = 32, LOT0 = 33, GATE = 37, CL = 3, TL = 4;
const inLanes = (j) => j >= LINE && j <= 11;
const COLORS = [
  { name: "Red", c: "#d23c32" }, { name: "Orange", c: "#e8822a" }, { name: "Yellow", c: "#e8c832" }, { name: "Green", c: "#3aa04a" },
  { name: "Blue", c: "#3a7ad0" }, { name: "Purple", c: "#7a4ac8" }, { name: "White", c: "#d8dcdf" },
];
const key = (i, j) => i + "," + j, unkey = (k) => k.split(",").map(Number);
// berths: 12 bays; under each STS crane a 12-tile line holds three trucks (owner)
// (owner) under each STS crane three lanes side by side, one tractor each, so none waits behind another
// (owner) one much larger ship at a single berth: 14 slots across (42 tiles) x 5 rows of deck (rows 2–6); its two STS
// cranes split it, A the west 7 slot columns and B the east 7
const DOCK = { x: 5, cols: 14, rows: 5, top: 2, ship: null, wait: 1.5 };
const BERTHS = [{ id: 0, x: 6, c0: 0 }, { id: 1, x: 30, c0: 7 }].map((b) => ({ ...b, w: 12, promised: 0, crane: { x: (b.x + 6) * T, y: (10 + 0.5) * T, hold: null, ops: [], truck: null } }));
for (const b of BERTHS) b.lanes = LANE_ROWS.map((r) => ({ r, berth: b, claim: null }));
const laneHead = (l) => key(l.berth.x + 8, l.r);
// storage areas (owner): 5 wide, 12 long, vertical; 5 x 4 slots (1 x 3 each), stacked up to 3; 5 RTG bays below, one per column
const BLOCKS = [4, 12, 20, 28, 36, 44].map((x, k) => {
  const b = { id: k, x, y: 14, w: 5, h: 12, cols: 5, rows: 4, incoming: 0, claims: Array(COLORS.length).fill(0) };
  b.slots = Array.from({ length: b.cols }, () => Array.from({ length: b.rows }, () => []));
  b.bays = Array.from({ length: 5 }, (_, c) => ({ i: x + c, claim: null }));
  b.rtg = { x: (x + 2.5) * T, y: (REST + 0.5) * T, hold: null, ops: [], truck: null };
  return b;
});
const LANES = [10, 18, 26, 34, 42], WEST = 2, EAST = 51;
const STALLS = [...Array(12).keys()].map((k) => ({ i: 4 + k, claim: null })).concat([...Array(12).keys()].map((k) => ({ i: 20 + k, claim: null })));
// ---- progress (owner, 2026-11-01): start with 1 tractor, 1 STS crane, 1 storage area and 4 parking stalls; customers pay
// for their container; the rest is bought. Locked things show on the map, dimmed with their price: click one to buy it.
let money = 0;
const INCOME = 60;
const BLOCK_PRICE = [0, 600, 900, 1300, 1800, 2400], CRANE_PRICE = [0, 2000], STALL_PRICE = [0, 200, 300, 400, 500, 600];
BERTHS.forEach((b) => (b.open = b.id === 0)); BLOCKS.forEach((b) => (b.open = b.id === 0)); STALLS.forEach((s, k) => { s.group = Math.floor(k / 4); s.open = s.group === 0; });
const tractorPrice = () => 400 + 300 * (trucks.filter((t) => t.kind === "yard").length - 1);
// which slot columns of the ship a crane works: with only crane A, all of them
const craneCols = (b) => (BERTHS[1].open ? [b.c0, b.c0 + 7] : b.id === 0 ? [0, DOCK.cols] : [0, 0]);
function buyAt(i, j) {
  for (const b of BERTHS) if (!b.open && i >= b.x + 2 && i < b.x + 10 && j >= QUAY && j <= 11) return { price: CRANE_PRICE[b.id], buy: () => { b.open = true; } };
  for (const b of BLOCKS) if (!b.open && i >= b.x && i < b.x + b.w && j >= b.y && j < YROAD) return { price: BLOCK_PRICE[b.id], buy: () => { b.open = true; } };
  if (j >= LOT0 && j < GATE) { const st = STALLS.find((q) => q.i === i); if (st && !st.open) { const g = STALLS.filter((q) => q.group === st.group); return { price: STALL_PRICE[st.group], buy: () => g.forEach((q) => (q.open = true)) }; } }
  return null;
}
function addTractor() {
  const price = tractorPrice(), b = BERTHS.find((q) => q.open && q.lanes.some((l) => !l.claim)); if (money < price || !b) return false;
  const l = b.lanes.find((q) => !q.claim), x = b.x + 8, tiles = [x, x - 1, x - 2, x - 3].map((i) => key(i, l.r));
  if (tiles.some((k) => occ.has(k))) return false;
  money -= price; const t = mkTruck("yard", tiles); t.num = trucks.filter((q) => q.kind === "yard").length; t.lane = l; l.claim = t; return true;
}
const floats = [];   // "+$60" over a paid truck

// ---- roads: one-way, a tile at a time (owner: an actual traffic rule) ----
// quay lanes east → east connector south → yard road west → west connector north; lanes between the storage areas run
// south from the quay road to the RTG lane (east); RTG bays and parking stalls are drive-through, northbound; the gate road
// runs east from the west edge, out past the east connector.
const E = new Map(), add = (a, b, c, d) => { const k = key(a, b); if (!E.has(k)) E.set(k, []); E.get(k).push(key(c, d)); };
for (let x = WEST; x < EAST; x++) { add(x, QROAD, x + 1, QROAD); add(x, RLANE, x + 1, RLANE); }
for (let j = QROAD; j < GATE; j++) add(EAST, j, EAST, j + 1);
for (let j = YROAD; j > QROAD; j--) add(WEST, j, WEST, j - 1);
// each berth's lanes: in from the quay road up a column west of the crane, out down a column east of it
for (const b of BERTHS) {
  const ex = b.x - 3, ox = b.x + b.w + 2;
  add(ex, QROAD, ex, 11); add(ex, 11, ex, 10); add(ex, 10, ex, 9);
  for (const r of LANE_ROWS) for (let x = ex; x < ox; x++) add(x, r, x + 1, r);
  add(ox, 9, ox, 10); add(ox, 10, ox, 11); add(ox, 11, ox, QROAD);
}
for (let j = YROAD; j < GATE; j++) add(WEST, j, WEST, j + 1);
for (const x of LANES) for (let j = QROAD; j < RLANE; j++) add(x, j, x, j + 1);
for (let x = EAST; x > WEST; x--) add(x, YROAD, x - 1, YROAD);
for (const b of BLOCKS) for (const bay of b.bays) { add(bay.i, YROAD, bay.i, YROAD - 1); for (let j = YROAD - 1; j > RLANE; j--) add(bay.i, j, bay.i, j - 1); }
for (const s of STALLS) { add(s.i, GATE, s.i, GATE - 1); for (let j = GATE - 1; j > YROAD; j--) add(s.i, j, s.i, j - 1); }
for (let x = -6; x < MW + 6; x++) add(x, GATE, x + 1, GATE);
const ROADSET = new Set(); for (const [k, l] of E) { ROADSET.add(k); for (const n of l) ROADSET.add(n); }
function route(fromK, toK) {
  const [, tj] = unkey(toK), prev = new Map([[fromK, null]]), q = [fromK];
  while (q.length) { const k = q.shift(); if (k === toK) break; const [, cj] = unkey(k); for (const n of E.get(k) || []) { if (prev.has(n)) continue; const [, nj] = unkey(n); if (inLanes(nj) && !inLanes(cj) && !inLanes(tj)) continue; prev.set(n, k); q.push(n); } }
  if (!prev.has(toK)) return null;
  const out = []; let k = toK; while (k !== fromK) { out.unshift(k); k = prev.get(k); }
  return out;
}

// ---- stacks ----
const count = (b) => b.slots.reduce((a, col) => a + col.reduce((s, st) => s + st.length, 0), 0);
const colorCount = (b, c) => b.slots.reduce((a, col) => a + col.reduce((s, st) => s + st.filter((x) => x === c).length, 0), 0);
const free = (b) => b.cols * b.rows * 3 - count(b) - b.incoming;
const shipCount = (s) => s.bays.reduce((a, st) => a + st.length, 0);
for (const b of BLOCKS.slice(0, 1)) for (let n = 0; n < 14 + Math.floor(rnd() * 6); n++) { const c = Math.floor(rnd() * b.cols), r = Math.floor(rnd() * b.rows); if (b.slots[c][r].length < 3) b.slots[c][r].push(Math.floor(rnd() * COLORS.length)); }

// ---- ships ----
const HULLS = ["#5a6a7a", "#7a3a3a", "#3a5a4a", "#4a4a6a", "#6a5a3a"];
function newShip() {
  const s = { off: -60 * T, state: "arrive", hull: pick(HULLS), bays: Array.from({ length: DOCK.cols * DOCK.rows }, () => []) };   // (owner) 3 x 1 horizontal slots
  for (const st of s.bays) { const k = Math.floor(rnd() * 4); for (let q = 0; q < k; q++) st.push(Math.floor(rnd() * COLORS.length)); }
  DOCK.ship = s; return s;
}
const berthLeft = (b) => { const s = DOCK.ship; if (!s || s.state !== "docked" || !b.open) return 0; const [c0, c1] = craneCols(b); let n = 0; s.bays.forEach((st, k) => { const c = k % DOCK.cols; if (c >= c0 && c < c1) n += st.length; }); return n - b.promised; };
function shipStep(dt) {
  const s = DOCK.ship; if (!s) { DOCK.wait -= dt; if (DOCK.wait <= 0) newShip(); return; }
  if (s.state === "arrive") { s.off += Math.max(50, -s.off * 1.2) * dt; if (s.off >= 0) { s.off = 0; s.state = "docked"; } }
  else if (s.state === "docked") { if (!shipCount(s) && BERTHS.every((b) => !b.promised && b.crane.hold === null)) { s.idle = (s.idle || 0) + dt; if (s.idle > 1.5) s.state = "depart"; } }
  else if (s.state === "depart") { s.off += (50 + s.off * 0.8) * dt; if (s.off > 64 * T) { DOCK.ship = null; DOCK.wait = 5 + rnd() * 5; } }
}

// ---- trucks: each holds the 4 tiles under it (and the next one while moving into it) ----
const occ = new Map();
let trucks = [], truckSeq = 0, custWait = 2, delivered = 0, clock = 0;
function mkTruck(kind, tiles, want) { const t = { id: ++truckSeq, kind, tiles, next: null, p: 0, path: [], queue: [], cmd: null, load: null, want, locked: false, stall: null, gone: false }; for (const k of tiles) occ.set(k, t); trucks.push(t); return t; }
[0].forEach((n) => { const l = BERTHS[0].lanes[n], x = BERTHS[0].x + 8; const t = mkTruck("yard", [x, x - 1, x - 2, x - 3].map((i) => key(i, l.r))); t.num = n + 1; t.lane = l; l.claim = t; });
const head = (t) => t.tiles[0];
const headIJ = (t) => unkey(t.tiles[0]);
function goTo(t, k) { const from = t.next || head(t); t.path = (t.next ? [t.next] : []).concat(route(from, k) || []); }
function spawnCustomer() {
  const stall = STALLS.slice().reverse().find((s) => s.open && !s.claim); if (!stall) return;
  if ([-1, -2, -3, -4, 0, 1].some((x) => occ.has(key(x, GATE)))) return;
  const stored = COLORS.map((_, c) => c).filter((c) => BLOCKS.some((b) => b.open && colorCount(b, c) - b.claims[c] > 0) && !trucks.some((t) => t.kind === "cust" && t.want === c && t.load === null));
  const want = stored.length ? pick(stored) : Math.floor(rnd() * COLORS.length);
  const t = mkTruck("cust", [-1, -2, -3, -4].map((x) => key(x, GATE)), want);
  stall.claim = t; t.cmd = { kind: "park", stall }; goTo(t, key(stall.i, LOT0));
}

// what a truck will carry once its queue is done
function loadedAfter(t) { let l = t.load !== null; for (const a of t.cmd ? [t.cmd, ...t.queue] : t.queue) l = a.kind === "sts" ? true : a.kind === "rtg" ? t.kind === "cust" : l; return l; }
function targetAt(i, j) {
  if (j >= DOCK.top && j <= 11) for (const b of BERTHS) { const [c0, c1] = craneCols(b), x0 = DOCK.x + c0 * CL; if (j <= 6 ? i >= x0 && i < DOCK.x + c1 * CL : i >= b.x + 2 && i < b.x + 10) return b.open ? { kind: "sts", berth: b } : null; }
  for (const b of BLOCKS) if (b.open && i >= b.x && i < b.x + b.w && j >= b.y && j < YROAD) return { kind: "rtg", block: b, col: j >= BAY0 ? i - b.x : -1 };
  if (j >= LOT0 && j < GATE) { const s = STALLS.find((q) => q.i === i && q.open); if (s) return { kind: "park", stall: s }; }
  return null;
}
// (owner) a truck can only be sent where it can be served: an empty yard tractor to an STS with a ship to unload, a loaded
// one to an RTG with a free bay and room, a customer to an RTG with a free bay holding its color, or (customers only) a
// free parking stall. Queued trips count first; each claims its bay, stall, container or slot at once (an STS lane is
// taken when the trip starts).
function planFor(t, i, j) {
  if (t.gone || t.exiting) return null;
  const g = targetAt(i, j); if (!g) return null;
  const loaded = loadedAfter(t), acts = t.cmd ? [t.cmd, ...t.queue] : t.queue;
  if (t.kind === "cust" && acts.some((a) => a.kind === "rtg")) return null;
  if (g.kind === "park") return t.kind === "cust" && !g.stall.claim ? { kind: "park", stall: g.stall } : null;
  if (g.kind === "sts") { const b = g.berth; return t.kind === "yard" && !loaded && berthLeft(b) > 0 ? { kind: "sts", berth: b } : null; }
  const b = g.block, bay = (g.col >= 0 && !b.bays[g.col].claim) ? b.bays[g.col] : b.bays.find((q) => !q.claim);
  if (!bay) return null;
  if (t.kind === "yard") return loaded && free(b) > 0 ? { kind: "rtg", block: b, bay } : null;
  return !loaded && colorCount(b, t.want) - b.claims[t.want] > 0 ? { kind: "rtg", block: b, bay } : null;
}
function claim(t, a, d) {
  if (a.kind === "sts") a.berth.promised += d;
  else if (a.kind === "rtg") { a.bay.claim = d > 0 ? t : null; if (t.kind === "yard") a.block.incoming += d; else a.block.claims[t.want] += d; }
  else if (a.kind === "park") a.stall.claim = d > 0 ? t : null;
}
function enqueue(t, a) { claim(t, a, 1); t.queue.push(a); }
function unqueueLast(t) { const a = t.queue.pop(); if (a) claim(t, a, -1); return !!a; }
const targetKey = (a) => (a.lane ? laneHead(a.lane) : a.kind === "rtg" ? key(a.bay.i, BAY0) : key(a.stall.i, LOT0));
// start a trip: an STS trip (or a wait at a berth) takes one of its free lanes — the one the tractor is already in, if any
function startCmd(t, a) {
  if (a.kind === "sts" || a.kind === "wait") {
    const lane = t.lane && t.lane.berth === a.berth ? t.lane : a.berth.lanes.find((l) => !l.claim);
    if (!lane) return false;
    if (t.lane && t.lane !== lane) t.lane.claim = null;
    lane.claim = t; t.lane = lane; a.lane = lane;
  } else if (t.lane) { t.lane.claim = null; t.lane = null; }
  if (t.bay) { if (t.bay.claim === t) t.bay.claim = null; t.bay = null; }
  if (t.stall && t.stall.claim === t && !(a.kind === "park" && a.stall === t.stall)) t.stall.claim = null;
  t.stall = null; t.cmd = a; goTo(t, targetKey(a)); return true;
}

function truckStep(t, dt) {
  if (t.locked) return;
  // start the next queued trip once the current one is done
  if (!t.cmd && !t.next) {
    if (t.queue.length && startCmd(t, t.queue[0])) t.queue.shift();
  }
  // traffic: move into the next tile only when no other truck holds it
  if (!t.next && t.path.length) { const n = t.path[0], o = occ.get(n); if (!o || o === t) { occ.set(n, t); t.next = n; t.p = 0; } }
  if (t.next) {
    t.p += 4 * dt;
    if (t.p >= 1) {
      t.tiles.unshift(t.next); const tail = t.tiles.pop(); if (occ.get(tail) === t) occ.delete(tail);
      t.next = null; t.p = 0; t.path.shift();
      if (t.exiting && !t.path.length) { for (const k of t.tiles) if (occ.get(k) === t) occ.delete(k); t.gone = true; trucks.splice(trucks.indexOf(t), 1); return; }
      if (!t.path.length && t.cmd && t.cmd.kind === "park") { t.stall = t.cmd.stall; t.cmd = null; }
      else if (!t.path.length && t.cmd && t.cmd.kind === "wait") t.cmd = null;
    }
  }
}
function doneServing(t) {
  const a = t.cmd; t.cmd = null; t.locked = false;
  if (a && a.kind === "rtg") { if (t.kind === "yard") t.bay = a.bay; else a.bay.claim = null; }   // a tractor keeps its bay until its next trip
  if (t.queue.length) return;
  if (t.kind === "cust") { t.happy = 1.8; t.exiting = true; delivered++; money += INCOME; const tr = trailerOf(t); floats.push({ x: tr.x, y: tr.y - 20, t: 1.6, text: "+$" + INCOME }); goTo(t, key(MW + 5, GATE)); }
}

// ---- truck shape: a cab and a trailer bending along the tiles it holds ----
function chainOf(t) {
  const c = (k) => { const [i, j] = unkey(k); return [(i + 0.5) * T, (j + 0.5) * T]; };
  const pts = []; const h0 = c(t.tiles[0]);
  if (t.next) { const n = c(t.next); pts.push([h0[0] + (n[0] - h0[0]) * t.p, h0[1] + (n[1] - h0[1]) * t.p]); }
  for (const k of t.tiles) { const p = c(k); const l = pts[pts.length - 1]; if (!l || hyp(l[0] - p[0], l[1] - p[1]) > 0.01) pts.push(p); }
  return pts;
}
function pointAt(pts, s) {
  s *= T;
  if (pts.length < 2) return pts[0];
  if (s <= 0) { const [a, b] = pts, d = hyp(a[0] - b[0], a[1] - b[1]) || 1; return [a[0] + (a[0] - b[0]) / d * -s, a[1] + (a[1] - b[1]) / d * -s]; }
  for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1], d = hyp(b[0] - a[0], b[1] - a[1]); if (s <= d) return [a[0] + (b[0] - a[0]) * s / d, a[1] + (b[1] - a[1]) * s / d]; s -= d; }
  const a = pts[pts.length - 2], b = pts[pts.length - 1], d = hyp(b[0] - a[0], b[1] - a[1]) || 1; return [b[0] + (b[0] - a[0]) / d * s, b[1] + (b[1] - a[1]) / d * s];
}
function shapeOf(t) { const p = chainOf(t); return { front: pointAt(p, -0.45), cabBack: pointAt(p, 0.5), trFront: pointAt(p, 0.62), trBack: pointAt(p, 3.45) }; }
function trailerOf(t) { const s = shapeOf(t); return { x: (s.trFront[0] + s.trBack[0]) / 2, y: (s.trFront[1] + s.trBack[1]) / 2, a: Math.atan2(s.trFront[1] - s.trBack[1], s.trFront[0] - s.trBack[0]) }; }

// ---- cranes: a list of moves and lifts, played in order ----
const CRANE_SP = 130, LIFT = 0.55;
function craneStep(cr, dt, onDone) {
  const op = cr.ops[0]; if (!op) return;
  if (op.to) { const [tx, ty] = typeof op.to === "function" ? op.to() : op.to, dx = tx - cr.x, dy = ty - cr.y, sp = CRANE_SP * dt; cr.x += clamp(dx, -sp, sp); cr.y += clamp(dy, -sp, sp); if (Math.abs(tx - cr.x) < 0.5 && Math.abs(ty - cr.y) < 0.5) { cr.x = tx; cr.y = ty; cr.ops.shift(); if (!cr.ops.length) onDone(); } return; }
  op.t = (op.t || 0) + dt; if (op.t < LIFT) return;
  if (op.lift) { const s = op.lift; if (s.stack) cr.hold = s.stack.pop(); else { cr.hold = s.truck.load; s.truck.load = null; } }
  else if (op.lower) { const s = op.lower; if (s.stack) s.stack.push(cr.hold); else s.truck.load = cr.hold; cr.hold = null; if (op.then) op.then(); }
  cr.ops.shift(); if (!cr.ops.length) onDone();
}
// STS (owner: one container at a time): the front-most empty tractor standing in its line gets the nearest container
function stsStep(b, dt) {
  const cr = b.crane, s = DOCK.ship;
  if (!cr.ops.length && !cr.truck && s && s.state === "docked" && berthLeft(b) + b.promised > 0) {
    let t = null, ti = 1e9;
    for (const q of trucks) { if (!q.cmd || q.cmd.kind !== "sts" || q.cmd.berth !== b || q.load !== null || q.next || q.locked || !q.lane || head(q) !== laneHead(q.lane)) continue; const d = Math.abs(q.lane.r + 0.5 - cr.y / T); if (d > ti) continue; ti = d; t = q; }
    if (t) {
      const tr = trailerOf(t); let best = -1, bd = 1e9; s.bays.forEach((st, k) => { const q = shipSlot(k); if (st.length && q.c >= craneCols(b)[0] && q.c < craneCols(b)[1]) { const d = Math.abs((DOCK.x + q.c * CL + 1.5) * T - tr.x) + (DOCK.rows - q.r) * 8; if (d < bd) { bd = d; best = k; } } });
      const q = shipSlot(best), bx = (DOCK.x + q.c * CL + 1.5) * T, by = (DOCK.top + q.r + 0.5) * T;
      t.locked = true; cr.truck = t;
      const ly = (t.lane.r + 0.5) * T;
      cr.ops = [{ to: [bx, cr.y] }, { to: [bx, by] }, { lift: { stack: s.bays[best] } }, { to: [bx, ly] }, { to: () => [trailerOf(t).x, ly] }, { lower: { truck: t } }];
    }
  }
  craneStep(cr, dt, () => { const t = cr.truck; if (!t) return; cr.truck = null; b.promised = Math.max(0, b.promised - 1); doneServing(t); });
}
const slotXY = (b, c, r) => [(b.x + c + 0.5) * T, (b.y + r * CL + 1.5) * T];
// RTG: serves the trucks standing in its bays, one at a time
function rtgStep(b, dt) {
  const cr = b.rtg;
  if (!cr.ops.length && !cr.truck) {
    const t = trucks.find((q) => q.cmd && q.cmd.kind === "rtg" && q.cmd.block === b && !q.next && !q.locked && head(q) === key(q.cmd.bay.i, BAY0));
    if (t) {
      const at = () => { const tr = trailerOf(t); return [tr.x, tr.y]; };
      if (t.kind === "yard" && t.load !== null) {
        let best = null, bs = 1e9;
        for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { const st = b.slots[c][r]; if (st.length >= 3) continue; const sc = st.length * 10 + (b.rows - r) + (st.length && st[st.length - 1] === t.load ? -15 : 0); if (sc < bs) { bs = sc; best = [c, r]; } }
        if (best) { t.locked = true; cr.truck = t; b.incoming = Math.max(0, b.incoming - 1); cr.ops = [{ to: at }, { lift: { truck: t }, }, { to: slotXY(b, best[0], best[1]) }, { lower: { stack: b.slots[best[0]][best[1]] }, then: () => { cr.truck = null; doneServing(t); } }, { to: [slotXY(b, best[0], best[1])[0], (REST + 0.5) * T] }]; }
      } else if (t.kind === "cust" && t.load === null) {
        let src = null, fewest = 1e9;
        for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { const st = b.slots[c][r]; const k = st.lastIndexOf(t.want); if (k >= 0 && st.length - 1 - k < fewest) { fewest = st.length - 1 - k; src = [c, r]; } }
        if (src) {
          const ops = [], h = b.slots.map((col) => col.map((st) => st.length));
          for (let n = 0; n < fewest; n++) {
            let dst = null, ds = 1e9;
            for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { if ((c === src[0] && r === src[1]) || h[c][r] >= 3) continue; const sc = h[c][r] * 4 + Math.abs(c - src[0]) + Math.abs(r - src[1]); if (sc < ds) { ds = sc; dst = [c, r]; } }
            if (!dst) break;
            h[src[0]][src[1]]--; h[dst[0]][dst[1]]++;
            ops.push({ to: slotXY(b, src[0], src[1]) }, { lift: { stack: b.slots[src[0]][src[1]] } }, { to: slotXY(b, dst[0], dst[1]) }, { lower: { stack: b.slots[dst[0]][dst[1]] } });
          }
          ops.push({ to: slotXY(b, src[0], src[1]) }, { lift: { stack: b.slots[src[0]][src[1]] } }, { to: at }, { lower: { truck: t }, then: () => { cr.truck = null; doneServing(t); } }, { to: () => [cr.x, (REST + 0.5) * T] });
          t.locked = true; cr.truck = t; b.claims[t.want] = Math.max(0, b.claims[t.want] - 1); cr.ops = ops;
        }
      }
    }
  }
  craneStep(cr, dt, () => {});
}

// ---- input: pan / zoom; select a truck, then where it goes ----
let VW = 0, VH = 0, DPR = 1, zoom = 1, cam = { x: MW * T / 2, y: MH * T / 2 }, selected = null, hover = null, bad = null;
const keys = {};
addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "Escape") selected = null; const n = /^Digit([1-9])$/.exec(e.code); if (n) { const t = trucks.find((q) => q.num === +n[1]); if (t) selected = t; } });
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
const toWorld = (sx, sy) => ({ x: (sx - VW / 2) / zoom + cam.x, y: (sy - VH / 2) / zoom + cam.y });
const tileAtScreen = (sx, sy) => { const w = toWorld(sx, sy); return [Math.floor(w.x / T), Math.floor(w.y / T)]; };
function segDist(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, u = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l, 0, 1); return hyp(px - a[0] - u * dx, py - a[1] - u * dy); }
function truckAt(sx, sy) { const w = toWorld(sx, sy); for (const t of trucks) { if (t.exiting) continue; const s = shapeOf(t); if (Math.min(segDist(w.x, w.y, s.front, s.cabBack), segDist(w.x, w.y, s.trFront, s.trBack)) < 14) return t; } return null; }
function click(sx, sy) {
  const t = truckAt(sx, sy); if (t) { selected = selected === t ? null : t; return; }
  const [i, j] = tileAtScreen(sx, sy), u = buyAt(i, j);
  if (u) { if (money >= u.price) { money -= u.price; u.buy(); } else bad = { i, j, t: 0.5 }; return; }
  if (!selected) return;
  const a = planFor(selected, i, j);
  if (a) enqueue(selected, a); else bad = { i, j, t: 0.5 };
}
const pts = new Map(); let gesture = null;
// right click: take back the selected truck's last queued trip (not the one under way); with none left, deselect
cv.addEventListener("contextmenu", (e) => { e.preventDefault(); if (!selected || !unqueueLast(selected)) selected = null; });
cv.addEventListener("pointerdown", (e) => {
  if (e.button === 2) return;
  try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()]; gesture = { pinch: hyp(a.x - b.x, a.y - b.y), zoom, moved: true }; return; }
  gesture = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
});
cv.addEventListener("pointermove", (e) => {
  hover = { tile: tileAtScreen(e.clientX, e.clientY), truck: truckAt(e.clientX, e.clientY) };
  if (!pts.has(e.pointerId) || !gesture) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture.pinch && pts.size === 2) { const [a, b] = [...pts.values()]; setZoom(gesture.zoom * hyp(a.x - b.x, a.y - b.y) / gesture.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
  if (gesture.pinch) return;
  const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy; if (hyp(dx, dy) > 6) gesture.moved = true;
  if (gesture.moved) { cam.x = gesture.cx - dx / zoom; cam.y = gesture.cy - dy / zoom; }
});
cv.addEventListener("pointerup", (e) => { pts.delete(e.pointerId); if (gesture && !gesture.moved && !gesture.pinch) click(e.clientX, e.clientY); if (!pts.size) gesture = null; });
cv.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });
function setZoom(z, sx, sy) { const before = toWorld(sx, sy); zoom = clamp(z, 0.3, 3); const after = toWorld(sx, sy); cam.x += before.x - after.x; cam.y += before.y - after.y; }

// ---- placeholder art ----
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function seeded(seed) { let s = seed % 233280; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
function noiseFill(g, x, y, w, h, base, amt, seed) {
  const R = seeded(seed), r = parseInt(base.slice(1, 3), 16), gg = parseInt(base.slice(3, 5), 16), b = parseInt(base.slice(5, 7), 16);
  for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i += 2) { const n = (R() - 0.5) * amt; g.fillStyle = `rgb(${clamp(r + n, 0, 255) | 0},${clamp(gg + n, 0, 255) | 0},${clamp(b + n, 0, 255) | 0})`; g.fillRect(x + i, y + j, 2, 2); }
}
const GROUND = canvas(MW * T, MH * T);
function arrow(g, i, j, dx, dy) { const cx = (i + 0.5) * T, cy = (j + 0.5) * T; g.save(); g.translate(cx, cy); g.rotate(Math.atan2(dy, dx)); g.fillStyle = "rgba(255,255,255,.16)"; g.beginPath(); g.moveTo(7, 0); g.lineTo(-4, -5); g.lineTo(-4, 5); g.fill(); g.restore(); }
function buildGround() {
  const g = GROUND.getContext("2d");
  for (let j = QUAY; j < MH; j++) for (let i = 0; i < MW; i++) {
    const x = i * T, y = j * T;
    if (j === MH - 1 || i === 0 || i === MW - 1) { if (j === GATE) { noiseFill(g, x, y, T, T, "#2c2f35", 10, i * 7 + j * 3); continue; } noiseFill(g, x, y, T, T, "#3a3a34", 18, i * 31 + j * 17); g.fillStyle = "#55565c"; g.fillRect(x, y + 10, T, 2); g.fillRect(x, y + 20, T, 2); g.fillStyle = "#1e1e22"; g.fillRect(x + 14, y + 4, 4, 24); continue; }
    if (ROADSET.has(key(i, j))) { noiseFill(g, x, y, T, T, "#2c2f35", 10, i * 7 + j * 3); continue; }
    noiseFill(g, x, y, T, T, "#6a6c70", 12, i * 13 + j * 29); g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(x, y, T, 1); g.fillRect(x, y, 1, T);
    if (j === QUAY) { g.fillStyle = "#c9a23a"; for (let k = 0; k < T; k += 8) g.fillRect(x + k, y, 4, 3); }
  }
  // direction arrows on the roads (every few tiles)
  for (const [k, l] of E) { const [i, j] = unkey(k); if (i < 0 || i >= MW || (i + j) % 3) continue; for (const n of l) { const [ni, nj] = unkey(n); arrow(g, i, j, ni - i, nj - j); } }
  // the STS lines, the RTG bays, the parking stalls
  for (const b of BERTHS) { g.strokeStyle = "rgba(242,169,59,.55)"; g.lineWidth = 2; for (const l of b.lanes) g.strokeRect((b.x + 5) * T + 2, l.r * T + 2, TL * T - 4, T - 4); g.fillStyle = "#e8e2d0"; g.font = "800 20px 'Big Shoulders Display', Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String.fromCharCode(65 + b.id), (b.x - 1) * T, (QUAY + 1) * T); }
  for (const b of BLOCKS) {
    noiseFill(g, b.x * T, b.y * T, b.w * T, b.h * T, "#55575c", 10, b.id * 9 + 1); noiseFill(g, b.x * T, REST * T, b.w * T, T, "#4a4c52", 8, b.id + 3);
    g.fillStyle = "rgba(201,162,58,.5)"; g.fillRect(b.x * T, b.y * T, b.w * T, 2); g.fillRect(b.x * T, (b.y + b.h) * T - 2, b.w * T, 2); g.fillRect(b.x * T, b.y * T, 2, b.h * T); g.fillRect((b.x + b.w) * T - 2, b.y * T, 2, b.h * T);
    for (const bay of b.bays) { g.strokeStyle = "rgba(127,200,255,.35)"; g.lineWidth = 2; g.strokeRect(bay.i * T + 2, BAY0 * T + 2, T - 4, TL * T - 4); }
  }
  for (const s of STALLS) { g.strokeStyle = "rgba(255,255,255,.22)"; g.lineWidth = 2; g.strokeRect(s.i * T + 2, LOT0 * T + 2, T - 4, TL * T - 4); }
}
function drawWater() {
  ctx.fillStyle = "#1a4a6a"; ctx.fillRect(-30 * T, -10 * T, (MW + 60) * T, (QUAY + 10) * T);
  ctx.fillStyle = "rgba(255,255,255,.07)";
  for (let j = -6; j < QUAY; j++) for (let i = -20; i < MW + 20; i += 2) { const o = Math.round(((clock * 12 + j * 37) % 64)) - 32; ctx.fillRect(i * T + o + (j % 2) * 20, j * T + 14, 14, 2); }
}
// (owner) a stack drawn as three squares down its 1 x 3 footprint: top square the top of the stack, bottom the bottom
// a ship's slot: the same three squares, left to right (left the top of the stack, right the bottom)
const shipSlot = (k) => ({ c: k % DOCK.cols, r: Math.floor(k / DOCK.cols) });
function drawStackH(x, y, st, frame) {
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x + 2, y + 2, CL * T - 4, T - 4);
  for (let k = 0; k < 3; k++) {
    const c = st[2 - k], sx = x + k * T + 4, sy = y + 4;
    if (c === undefined) { ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(sx, sy, T - 8, T - 8); continue; }
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(sx - 1, sy - 1, T - 6, T - 6);
    ctx.fillStyle = COLORS[c].c; ctx.fillRect(sx, sy, T - 8, T - 8);
    ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(sx, sy, T - 8, 2); ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(sx, sy + T - 11, T - 8, 3);
  }
  if (frame) { ctx.strokeStyle = frame; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, CL * T - 3, T - 3); }
}
function drawStack(x, y, st, frame) {
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x + 2, y + 2, T - 4, CL * T - 4);
  for (let k = 0; k < 3; k++) {
    const tier = 2 - k, c = st[tier], sx = x + 4, sy = y + k * T + 4;
    if (c === undefined) { ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(sx, sy, T - 8, T - 8); continue; }
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(sx - 1, sy - 1, T - 6, T - 6);
    ctx.fillStyle = COLORS[c].c; ctx.fillRect(sx, sy, T - 8, T - 8);
    ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(sx, sy, T - 8, 2); ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(sx, sy + T - 11, T - 8, 3);
  }
  if (frame) { ctx.strokeStyle = frame; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, T - 3, CL * T - 3); }
}
function drawBox(c, cx, cy, ang, lifted) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
  if (lifted) { ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(-CL * T / 2 + 6, -T / 2 + 8, CL * T - 4, T - 6); ctx.translate(-3, -5); }
  ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(-CL * T / 2 + 1, -T / 2 + 3, CL * T - 2, T - 6);
  ctx.fillStyle = COLORS[c].c; ctx.fillRect(-CL * T / 2 + 2, -T / 2 + 4, CL * T - 4, T - 8);
  ctx.fillStyle = "rgba(0,0,0,.2)"; for (let k = -CL * T / 2 + 6; k < CL * T / 2 - 4; k += 5) ctx.fillRect(k, -T / 2 + 5, 1, T - 10);
  ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fillRect(-CL * T / 2 + 2, -T / 2 + 4, CL * T - 4, 2);
  ctx.restore();
}
function drawShip() {
  const s = DOCK.ship, x = DOCK.x * T + Math.round(s.off), y = (DOCK.top - 1) * T + 14, w = DOCK.cols * CL * T, h = (DOCK.rows + 1) * T + 2;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x - 10, y + 6, w + 50, h);
  ctx.fillStyle = s.hull; ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(x + w + 8, y); ctx.lineTo(x + w + 44, y + h / 2); ctx.lineTo(x + w + 8, y + h); ctx.lineTo(x - 20, y + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#c8ccd0"; ctx.fillRect(x - 20, y, w + 28, 3); ctx.fillRect(x - 20, y + h - 3, w + 28, 3);
  ctx.fillStyle = "#e8e2d0"; ctx.fillRect(x - 18, y + 10, 14, h - 20); ctx.fillStyle = "#6ab8e8"; ctx.fillRect(x - 15, y + 16, 8, 8);
  s.bays.forEach((st, k) => { const q = shipSlot(k); drawStackH(x + q.c * CL * T, (DOCK.top + q.r) * T, st, "rgba(0,0,0,.4)"); });
  if (s.state !== "docked") { ctx.fillStyle = "rgba(255,255,255,.35)"; for (let k = 0; k < 4; k++) ctx.fillRect(x - 30 - k * 12 - ((clock * 40) % 12), y + 14 + k * 10, 8, 2); }
}
function rectBetween(a, b, w, fill) { const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, l = hyp(b[0] - a[0], b[1] - a[1]), an = Math.atan2(a[1] - b[1], a[0] - b[0]); ctx.save(); ctx.translate(cx, cy); ctx.rotate(an); ctx.fillStyle = fill; ctx.fillRect(-l / 2, -w / 2, l, w); ctx.restore(); }
function drawTruck(t) {
  const s = shapeOf(t), sel = t === selected, hov = hover && hover.truck === t;
  if (sel || hov) { ctx.strokeStyle = sel ? "#ffffff" : "rgba(255,255,255,.45)"; ctx.lineWidth = sel ? 28 + 2 * Math.sin(clock * 8) : 26; ctx.lineCap = "round"; ctx.globalAlpha = sel ? 0.5 : 0.25; ctx.beginPath(); ctx.moveTo(s.front[0], s.front[1]); ctx.lineTo(s.cabBack[0], s.cabBack[1]); ctx.lineTo(s.trBack[0], s.trBack[1]); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = "butt"; }
  rectBetween([s.trFront[0] + 3, s.trFront[1] + 4], [s.trBack[0] + 3, s.trBack[1] + 4], 22, "rgba(0,0,0,.3)");
  rectBetween(s.trFront, s.trBack, 18, "#4a4e56");
  rectBetween(s.front, s.cabBack, 24, "#1e2024");
  rectBetween(s.front, s.cabBack, 20, t.kind === "cust" ? COLORS[t.want].c : "#e8b432");
  const an = Math.atan2(s.front[1] - s.cabBack[1], s.front[0] - s.cabBack[0]); ctx.save(); ctx.translate(s.front[0], s.front[1]); ctx.rotate(an); ctx.fillStyle = "#9ad0f0"; ctx.fillRect(-9, -7, 4, 14); ctx.restore();
  if (t.load !== null) { const tr = trailerOf(t); drawBox(t.load, tr.x, tr.y, tr.a, false); }
  if (t.num) { const m = [(s.front[0] + s.cabBack[0]) / 2, (s.front[1] + s.cabBack[1]) / 2]; ctx.fillStyle = "#1e2024"; ctx.fillRect(m[0] - 6, m[1] - 6, 12, 12); ctx.fillStyle = "#ece7dc"; ctx.font = "800 10px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(t.num), m[0], m[1] + 0.5); }
  if (t.happy > 0) { const bx = s.front[0] + 8, by = s.front[1] - 34; ctx.fillStyle = "#ffffff"; ctx.fillRect(bx, by, 18, 16); ctx.fillRect(bx + 4, by + 16, 4, 3); ctx.fillStyle = "#2e9a4a"; ctx.fillRect(bx + 4, by + 4, 3, 3); ctx.fillRect(bx + 11, by + 4, 3, 3); ctx.fillRect(bx + 4, by + 10, 10, 2); ctx.fillRect(bx + 3, by + 9, 2, 2); ctx.fillRect(bx + 13, by + 9, 2, 2); }
}
function drawSTS(b) {
  const cr = b.crane, x = Math.round(cr.x);
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x - 40, T, 88, 12 * T);
  ctx.fillStyle = "#b8452a"; for (const lx of [x - 44, x + 36]) ctx.fillRect(lx, QUAY * T, 8, 5 * T);
  ctx.fillStyle = "#d8552e"; ctx.fillRect(x - 44, QUAY * T - 6, 88, 10); ctx.fillRect(x - 44, 12 * T - 4, 88, 8);
  ctx.fillStyle = "#e8653a"; ctx.fillRect(x - 6, T, 12, 11 * T); ctx.fillStyle = "#8a3a22"; for (let y = T + 4; y < 12 * T; y += 16) ctx.fillRect(x - 6, y, 12, 2);
  const ty = Math.round(cr.y);
  ctx.fillStyle = "#2a2c30"; ctx.fillRect(x - 12, ty - 10, 24, 20);
  if (cr.hold !== null) drawBox(cr.hold, x, ty, 0, true);
  else { ctx.fillStyle = "#9aa0a8"; ctx.fillRect(x - 3, ty - 30, 6, 60); }
}
function drawRTG(b) {
  const cr = b.rtg, gy = Math.round(cr.y), x0 = b.x * T - 6, x1 = (b.x + b.w) * T + 6;
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(x0 + 6, gy - 12, x1 - x0, 30);
  ctx.fillStyle = "#3a6ab0"; ctx.fillRect(x0, gy - 14, 10, 28); ctx.fillRect(x1 - 10, gy - 14, 10, 28);
  ctx.fillStyle = "#4a7ac8"; ctx.fillRect(x0, gy - 6, x1 - x0, 12); ctx.fillStyle = "#2a4a80"; ctx.fillRect(x0, gy + 4, x1 - x0, 2);
  ctx.fillStyle = "#2a2c30"; ctx.fillRect(x0 + 2, gy - 18, 6, 4); ctx.fillRect(x1 - 8, gy - 18, 6, 4); ctx.fillRect(x0 + 2, gy + 14, 6, 4); ctx.fillRect(x1 - 8, gy + 14, 6, 4);
  const tx = Math.round(cr.x);
  ctx.fillStyle = "#1e2024"; ctx.fillRect(tx - 9, gy - 9, 18, 18);
  if (cr.hold !== null) drawBox(cr.hold, tx, gy, Math.PI / 2, true);
}
// locked things: dimmed, with their price
function priceTag(x, y, price) { const ok = money >= price, txt = "$" + price.toLocaleString(); ctx.font = "800 18px 'Big Shoulders Display', Impact, sans-serif"; const w = ctx.measureText(txt).width + 14; ctx.fillStyle = "rgba(10,14,20,.85)"; ctx.fillRect(x - w / 2, y - 12, w, 24); ctx.strokeStyle = ok ? "#7fd88a" : "#6a7080"; ctx.lineWidth = 2; ctx.strokeRect(x - w / 2, y - 12, w, 24); ctx.fillStyle = ok ? "#ece7dc" : "#8b919b"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, x, y + 1); }
function drawLocked() {
  ctx.fillStyle = "rgba(8,12,18,.62)";
  for (const b of BLOCKS) if (!b.open) ctx.fillRect(b.x * T - 4, b.y * T - 4, b.w * T + 8, (YROAD - b.y) * T + 4);
  for (const b of BERTHS) if (!b.open) ctx.fillRect((b.x + 2) * T, QUAY * T, 8 * T, 5 * T);
  for (let g = 1; g < 6; g++) { const st = STALLS.filter((q) => q.group === g); if (!st[0].open) ctx.fillRect(st[0].i * T, LOT0 * T, 4 * T, TL * T); }
  for (const b of BLOCKS) if (!b.open) priceTag((b.x + b.w / 2) * T, (b.y + 6) * T, BLOCK_PRICE[b.id]);
  for (const b of BERTHS) if (!b.open) priceTag((b.x + 6) * T, (QUAY + 2.5) * T, CRANE_PRICE[b.id]);
  for (let g = 1; g < 6; g++) { const st = STALLS.filter((q) => q.group === g); if (!st[0].open) priceTag((st[0].i + 2) * T, (LOT0 + 2) * T, STALL_PRICE[g]); }
}
// the money, and buying a tractor
let hudTxt = "";
function hud() { const p = tractorPrice(), txt = "$" + money.toLocaleString() + "|" + p + "|" + (money >= p); if (txt === hudTxt) return; hudTxt = txt; $("money").textContent = "$" + money.toLocaleString(); const b = $("buy-tractor"); b.textContent = "+ Tractor $" + p.toLocaleString(); b.disabled = money < p; }
$("buy-tractor").onclick = () => addTractor();
function spotRect(a) { if (a.lane) return [(a.berth.x + 5) * T, a.lane.r * T, TL * T, T]; if (a.kind === "sts" || a.kind === "wait") return [(a.berth.x + 5) * T, LINE * T, TL * T, 3 * T]; if (a.kind === "rtg") return [a.bay.i * T, BAY0 * T, T, TL * T]; return [a.stall.i * T, LOT0 * T, T, TL * T]; }
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0b1218"; ctx.fillRect(0, 0, VW, VH);
  ctx.setTransform(DPR * zoom, 0, 0, DPR * zoom, Math.round(DPR * (VW / 2 - cam.x * zoom)), Math.round(DPR * (VH / 2 - cam.y * zoom)));
  drawWater();
  if (DOCK.ship) drawShip();
  ctx.drawImage(GROUND, 0, QUAY * T, MW * T, (MH - QUAY) * T, 0, QUAY * T, MW * T, (MH - QUAY) * T);
  for (const b of BLOCKS) for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) drawStack((b.x + c) * T, (b.y + r * CL) * T, b.slots[c][r], "rgba(201,162,58,.35)");
  // the selected truck's queue: numbered spots joined in order
  if (selected) {
    const tr = trailerOf(selected); let px = tr.x, py = tr.y, n = 0; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
    for (const a of selected.cmd ? [selected.cmd, ...selected.queue] : selected.queue) {
      const [rx, ry, rw, rh] = spotRect(a), sx = rx + rw / 2, sy = ry + rh / 2; n++;
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke(); px = sx; py = sy;
      ctx.strokeStyle = "#ffffff"; ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
      ctx.setLineDash([]); ctx.fillStyle = "#1e2024"; ctx.fillRect(rx - 4, ry - 4, 13, 13); ctx.fillStyle = "#ece7dc"; ctx.font = "800 10px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(n), rx + 2.5, ry + 3); ctx.setLineDash([5, 5]);
    }
    ctx.setLineDash([]);
  }
  for (const t of trucks) drawTruck(t);
  for (const b of BLOCKS) if (b.open) drawRTG(b);
  for (const b of BERTHS) if (b.open) drawSTS(b);
  drawLocked();
  for (const f of floats) { ctx.globalAlpha = Math.min(1, f.t); ctx.fillStyle = "#7fd88a"; ctx.font = "800 18px 'Big Shoulders Display', Impact, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(f.text, f.x, f.y - (1.6 - f.t) * 24); } ctx.globalAlpha = 1;
  if (selected && hover && !hover.truck) {
    const [i, j] = hover.tile, g = targetAt(i, j);
    if (g) { const a = planFor(selected, i, j); ctx.strokeStyle = a ? "#7fd88a" : "#ff5a4a"; ctx.lineWidth = 3; if (a) { const [rx, ry, rw, rh] = spotRect(a); ctx.strokeRect(rx, ry, rw, rh); } else if (g.kind === "sts") ctx.strokeRect((g.berth.x + 5) * T, LINE * T, TL * T, 3 * T); else if (g.kind === "rtg") ctx.strokeRect(g.block.x * T, g.block.y * T, g.block.w * T, (YROAD - g.block.y) * T); else ctx.strokeRect(g.stall.i * T, LOT0 * T, T, TL * T); }
  }
  if (bad) { ctx.strokeStyle = `rgba(255,90,74,${bad.t * 2})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bad.i * T + 8, bad.j * T + 8); ctx.lineTo(bad.i * T + T - 8, bad.j * T + T - 8); ctx.moveTo(bad.i * T + T - 8, bad.j * T + 8); ctx.lineTo(bad.i * T + 8, bad.j * T + T - 8); ctx.stroke(); }
}

// ---- loop ----
let last = performance.now();
function step(dt) {
  clock += dt;
  const pan = 520 / zoom * dt; if (keys.KeyW || keys.ArrowUp) cam.y -= pan; if (keys.KeyS || keys.ArrowDown) cam.y += pan; if (keys.KeyA || keys.ArrowLeft) cam.x -= pan; if (keys.KeyD || keys.ArrowRight) cam.x += pan;
  cam.x = clamp(cam.x, 0, MW * T); cam.y = clamp(cam.y, 0, MH * T);
  shipStep(dt); for (const b of BERTHS) if (b.open) stsStep(b, dt);
  for (const b of BLOCKS) if (b.open) rtgStep(b, dt);
  for (let k = floats.length - 1; k >= 0; k--) if ((floats[k].t -= dt) <= 0) floats.splice(k, 1);
  hud();
  custWait -= dt; if (custWait <= 0) { spawnCustomer(); custWait = 8 + rnd() * 6; }
  for (const t of [...trucks]) { truckStep(t, dt); if (t.happy > 0) t.happy -= dt; }
  if (selected && (!trucks.includes(selected) || selected.exiting)) selected = null;
  if (bad) { bad.t -= dt; if (bad.t <= 0) bad = null; }
}
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); draw(); requestAnimationFrame(frame); }
function resize() { DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight; cv.width = VW * DPR; cv.height = VH * DPR; zoom = clamp(Math.min(VW / (MW * T), VH / ((MH + 1) * T)), 0.3, 3); cam.y = (MH * T) / 2; }
addEventListener("resize", resize); resize();
buildGround();
if (document.fonts && document.fonts.load) document.fonts.load("800 20px 'Big Shoulders Display'").then(buildGround).catch(() => {});
requestAnimationFrame(frame);
window.Atamus = { addMoney: (n) => (money += n), buyAt: (i, j) => { const u = buyAt(i, j); if (u && money >= u.price) { money -= u.price; u.buy(); return true; } return false; }, addTractor, get money() { return money; }, get state() { return { trucks, dock: DOCK, berths: BERTHS, blocks: BLOCKS, stalls: STALLS, delivered, selected, occ }; }, step, planFor, enqueue, select: (t) => (selected = t) };
})();
