// Atamus (owner, 2026-10-31): a single-player container port. Ships dock at two berths and their ship-to-shore cranes
// unload them onto your yard trucks; the trucks carry the containers to storage areas, each with an RTG crane at its end
// that stacks them three high; customer trucks with a colored cab come for a container of that color, and the RTG digs it
// out and loads it. You pick a truck and queue where it parks. 32 x 32 tiles, placeholder pixel art. Rules in
// docs/FEATURES.md.
"use strict";
(() => {
const $ = (id) => document.getElementById(id);
const cv = $("view"), ctx = cv.getContext("2d");
const TAU = Math.PI * 2, rnd = Math.random, hyp = Math.hypot, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---- the port: 36 x 24 tiles of 32 px ----
// rows 0–5 water (ships dock with their decks on rows 3–5), 6–7 the quay, 8 the quay road, 9–20 storage, 21 the RTGs'
// end, 22 the yard road, 23 the fence. Containers are 3 tiles long (owner).
const T = 32, MW = 36, MH = 24, QUAY = 6, QROAD = 8, YROAD = 22, CL = 3;
const COLORS = [
  { name: "Red", c: "#d23c32" }, { name: "Orange", c: "#e8822a" }, { name: "Yellow", c: "#e8c832" }, { name: "Green", c: "#3aa04a" },
  { name: "Blue", c: "#3a7ad0" }, { name: "Purple", c: "#7a4ac8" }, { name: "White", c: "#d8dcdf" },
];
const BERTHS = [{ id: 0, x: 4, w: 10 }, { id: 1, x: 19, w: 10 }].map((b) => ({ ...b, ship: null, wait: 1 + rnd() * 2, spot: { i: b.x + 5, j: QROAD, occ: null }, crane: { x: (b.x + 5.5) * T, y: (QROAD + 0.5) * T, hold: null, ops: [], truck: null } }));
// storage areas (owner): 5 wide, 12 long, vertical; each slot is one container footprint (1 x 3) stacked up to 3 high
const BLOCKS = [2, 9, 16, 23].map((x, k) => {
  const b = { id: k, x, y: 9, w: 5, h: 12, cols: 5, rows: 4, incoming: 0, claims: Array(COLORS.length).fill(0), spot: { i: x + 2, j: YROAD, occ: null } };
  b.slots = Array.from({ length: b.cols }, () => Array.from({ length: b.rows }, () => []));
  b.rtg = { x: (x + 2.5) * T, y: (YROAD - 1 + 0.5) * T, hold: null, ops: [], truck: null };
  return b;
});
const STUBS = [10, 12, 14, 16, 18, 20].map((j) => ({ i: 32, j, occ: null }));   // parking stubs off the east road

// roads: the quay road, the yard road, the lanes between the storage areas, and the parking stubs
const ROADS = new Set(), rk = (i, j) => j * MW + i, isRoad = (i, j) => ROADS.has(rk(i, j));
for (let i = 1; i <= 34; i++) { ROADS.add(rk(i, QROAD)); ROADS.add(rk(i, YROAD)); }
for (const x of [1, 8, 15, 22, 29]) for (let j = QROAD; j <= YROAD; j++) ROADS.add(rk(x, j));
for (const s of STUBS) for (let i = 30; i <= 34; i++) ROADS.add(rk(i, s.j));
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function roadPath(si, sj, ti, tj) {
  const prev = new Map([[rk(si, sj), -1]]), q = [[si, sj]];
  while (q.length) { const [i, j] = q.shift(); if (i === ti && j === tj) break; for (const [a, b] of N4) { const ni = i + a, nj = j + b, k = rk(ni, nj); if (prev.has(k) || !isRoad(ni, nj)) continue; prev.set(k, rk(i, j)); q.push([ni, nj]); } }
  if (!prev.has(rk(ti, tj))) return null;
  const out = []; let k = rk(ti, tj); while (k !== -1) { out.unshift({ x: (k % MW + 0.5) * T, y: (Math.floor(k / MW) + 0.5) * T }); k = prev.get(k); }
  return out.slice(1);
}

// ---- stacks ----
const count = (b) => b.slots.reduce((a, col) => a + col.reduce((s, st) => s + st.length, 0), 0);
const colorCount = (b, c) => b.slots.reduce((a, col) => a + col.reduce((s, st) => s + st.filter((x) => x === c).length, 0), 0);
const free = (b) => b.cols * b.rows * 3 - count(b) - b.incoming;
const shipCount = (s) => s.bays.reduce((a, st) => a + st.length, 0);
for (const b of BLOCKS) for (let n = 0; n < 8 + Math.floor(rnd() * 8); n++) { const c = Math.floor(rnd() * b.cols), r = Math.floor(rnd() * b.rows); if (b.slots[c][r].length < 3) b.slots[c][r].push(Math.floor(rnd() * COLORS.length)); }

// ---- ships ----
const HULLS = ["#5a6a7a", "#7a3a3a", "#3a5a4a", "#4a4a6a", "#6a5a3a"];
function newShip(berth) {
  const s = { berth, off: -18 * T, state: "arrive", hull: pick(HULLS), promised: 0, bays: Array.from({ length: berth.w }, () => []) };
  let n = 0; while (n < 12) for (const st of s.bays) { const k = Math.floor(rnd() * 4); for (let q = 0; q < k && st.length < 3; q++) { st.push(Math.floor(rnd() * COLORS.length)); n++; } }
  berth.ship = s; return s;
}
function shipStep(b, dt) {
  const s = b.ship; if (!s) { b.wait -= dt; if (b.wait <= 0) newShip(b); return; }
  if (s.state === "arrive") { s.off += Math.max(40, -s.off * 1.3) * dt; if (s.off >= 0) { s.off = 0; s.state = "docked"; } }
  else if (s.state === "docked") { if (!shipCount(s) && !s.promised && b.crane.hold === null) { s.idle = (s.idle || 0) + dt; if (s.idle > 1.5) s.state = "depart"; } }
  else if (s.state === "depart") { s.off += (40 + s.off * 0.9) * dt; if (s.off > 30 * T) { b.ship = null; b.wait = 4 + rnd() * 5; } }
}

// ---- trucks: your yard trucks, and customer trucks whose cab is the color they want ----
let trucks = [], truckSeq = 0, custWait = 2, delivered = 0, clock = 0;
function mkTruck(kind, x, y, want) { const t = { id: ++truckSeq, kind, x, y, a: Math.PI, path: [], queue: [], cmd: null, load: null, want, state: "idle", stub: null }; trucks.push(t); return t; }
[10, 12, 14].forEach((j, k) => { const t = mkTruck("yard", 32.5 * T, (j + 0.5) * T); t.num = k + 1; t.stub = STUBS[k]; STUBS[k].occ = t; });
function spawnCustomer() {
  const stub = STUBS.slice(3).find((s) => !s.occ); if (!stub) return;
  const stored = COLORS.map((_, c) => c).filter((c) => BLOCKS.some((b) => colorCount(b, c) - b.claims[c] > 0) && !trucks.some((t) => t.kind === "cust" && t.want === c && t.load === null));
  const want = stored.length ? pick(stored) : Math.floor(rnd() * COLORS.length);
  const t = mkTruck("cust", 38 * T, (YROAD + 0.5) * T, want); t.stub = stub; stub.occ = t; t.state = "arriving";
  t.path = [{ x: 34.5 * T, y: (YROAD + 0.5) * T }, ...(roadPath(34, YROAD, stub.i, stub.j) || [])];
}
const tileOf = (t) => [Math.floor(t.x / T), Math.floor(t.y / T)];

// what a truck will carry once its queue is done
function loadedAfter(t) { let l = t.load !== null; for (const a of t.cmd ? [t.cmd, ...t.queue] : t.queue) l = a.kind === "sts" ? true : a.kind === "rtg" ? t.kind === "cust" : l; return l; }
function targetAt(i, j) {
  for (const b of BERTHS) if (Math.abs(i - b.spot.i) <= 2 && j >= QUAY - 4 && j <= QROAD) return { kind: "sts", berth: b, spot: b.spot };
  for (const b of BLOCKS) if (i >= b.x && i < b.x + b.w && j >= b.y && j <= YROAD) return { kind: "rtg", block: b, spot: b.spot };
  return null;
}
// (owner) a truck can only be sent where it can be served: an empty yard truck to a crane with a ship to unload, a loaded
// one to an RTG with room, a customer to an RTG holding its color. Queued trips count: each one claims its container or slot.
function planFor(t, i, j) {
  if (t.state === "leaving" || t.state === "arriving" || t.state === "gone") return null;
  const g = targetAt(i, j); if (!g) return null;
  const loaded = loadedAfter(t);
  if (t.kind === "cust" && (loaded || t.cmd || t.queue.length)) return null;
  if (g.kind === "sts") { const s = g.berth.ship; return t.kind === "yard" && !loaded && s && s.state === "docked" && shipCount(s) - s.promised > 0 ? g : null; }
  if (t.kind === "yard") return loaded && free(g.block) > 0 ? g : null;
  return colorCount(g.block, t.want) - g.block.claims[t.want] > 0 ? g : null;
}
function claim(t, a, d) { if (a.kind === "sts") a.berth.ship.promised += d; else if (t.kind === "yard") a.block.incoming += d; else a.block.claims[t.want] += d; }
function enqueue(t, g) { const a = { ...g, ship: g.berth && g.berth.ship }; claim(t, a, 1); t.queue.push(a); }
function unqueueLast(t) { const a = t.queue.pop(); if (a) claim(t, a, -1); return !!a; }

function truckStep(t, dt) {
  if (!t.cmd && t.queue.length && !t.path.length && t.state === "idle") {
    t.cmd = t.queue.shift(); if (t.stub) { t.stub.occ = null; t.stub = null; }
    const [i, j] = tileOf(t); t.path = roadPath(i, j, t.cmd.spot.i, t.cmd.spot.j) || []; t.state = "driving";
    if (!t.path.length) { t.cmd.spot.occ = t.cmd.spot.occ || t; t.state = "served"; }
  }
  // drive the path; wait back from a spot another truck is using
  if (t.path.length) {
    if (t.cmd && t.state === "driving" && t.cmd.spot.occ && t.cmd.spot.occ !== t && t.path.length <= 4) return;
    const n = t.path[0], dx = n.x - t.x, dy = n.y - t.y, d = hyp(dx, dy), sp = 150 * dt;
    if (d > 0.5) { const want = Math.atan2(dy, dx); let da = ((want - t.a + Math.PI * 3) % TAU) - Math.PI; t.a += clamp(da, -8 * dt, 8 * dt); }
    if (d <= sp) { t.x = n.x; t.y = n.y; t.path.shift(); } else { t.x += dx / d * sp; t.y += dy / d * sp; }
    if (!t.path.length) {
      if (t.state === "arriving") t.state = "idle";
      else if (t.state === "leaving") { t.path = [{ x: 40 * T, y: t.y }]; t.state = "gone"; }
      else if (t.state === "gone") trucks.splice(trucks.indexOf(t), 1);
      else if (t.cmd) { if (t.cmd.spot.occ && t.cmd.spot.occ !== t) { t.path = [{ x: t.x, y: t.y }]; return; } t.cmd.spot.occ = t; t.state = "served"; }
    }
  }
}
function doneServing(t) {
  const a = t.cmd; a.spot.occ = null; t.cmd = null; t.state = "idle";
  if (t.kind === "cust") { t.happy = 1.6; t.state = "leaving"; const [i, j] = tileOf(t); t.path = roadPath(i, j, 34, YROAD) || [{ x: 34.5 * T, y: (YROAD + 0.5) * T }]; delivered++; }
}

// ---- cranes: a list of moves and lifts, played in order ----
// STS: travels along the quay and runs its trolley out over the ship; RTG: its gantry runs along the storage area and its
// trolley across it. A lift / lower takes a moment.
const CRANE_SP = 120, LIFT = 0.55;
function craneStep(cr, dt, onDone) {
  const op = cr.ops[0]; if (!op) return;
  if (op.to) { const [tx, ty] = op.to, dx = tx - cr.x, dy = ty - cr.y, sp = CRANE_SP * dt; cr.x += clamp(dx, -sp, sp); cr.y += clamp(dy, -sp, sp); if (Math.abs(tx - cr.x) < 0.5 && Math.abs(ty - cr.y) < 0.5) { cr.x = tx; cr.y = ty; cr.ops.shift(); if (!cr.ops.length) onDone(); } return; }
  op.t = (op.t || 0) + dt;
  if (op.t < LIFT) return;
  if (op.lift) { const s = op.lift; if (s.stack) cr.hold = s.stack.pop(); else { cr.hold = s.truck.load; s.truck.load = null; } }
  else if (op.lower) { const s = op.lower; if (s.stack) s.stack.push(cr.hold); else s.truck.load = cr.hold; cr.hold = null; }
  cr.ops.shift(); if (!cr.ops.length) onDone();
}
function stsStep(b, dt) {
  const cr = b.crane, s = b.ship;
  if (!cr.ops.length && !cr.truck) {
    const t = b.spot.occ;
    if (t && t.state === "served" && t.load === null && s && s.state === "docked" && shipCount(s)) {
      let best = -1, bd = 1e9; s.bays.forEach((st, k) => { if (st.length) { const d = Math.abs(b.x + k - b.spot.i); if (d < bd) { bd = d; best = k; } } });
      const bx = (b.x + best + 0.5) * T, home = [(b.spot.i + 0.5) * T, (QROAD + 0.5) * T];
      cr.truck = t; cr.ops = [{ to: [bx, cr.y] }, { to: [bx, 4.5 * T] }, { lift: { stack: s.bays[best] } }, { to: [bx, home[1]] }, { to: home }, { lower: { truck: t } }];
    }
  }
  craneStep(cr, dt, () => { const t = cr.truck; if (!t) return; cr.truck = null; if (s) s.promised = Math.max(0, s.promised - 1); doneServing(t); });
}
const slotXY = (b, c, r) => [(b.x + c + 0.5) * T, (b.y + r * CL + 1.5) * T];
function rtgStep(b, dt) {
  const cr = b.rtg;
  if (!cr.ops.length && !cr.truck) {
    const t = b.spot.occ, home = [(b.spot.i + 0.5) * T, (YROAD + 0.5) * T], rest = [home[0], (YROAD - 0.5) * T];   // it rests at the storage end, clear of the truck
    if (t && t.state === "served") {
      if (t.kind === "yard" && t.load !== null) {
        // put it on the lowest stack nearest the road end (topping a matching color first)
        let best = null, bs = 1e9;
        for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { const st = b.slots[c][r]; if (st.length >= 3) continue; const sc = st.length * 10 + (b.rows - r) + (st.length && st[st.length - 1] === t.load ? -15 : 0); if (sc < bs) { bs = sc; best = [c, r]; } }
        if (best) { cr.truck = t; b.incoming = Math.max(0, b.incoming - 1); cr.ops = [{ to: home }, { lift: { truck: t } }, { to: slotXY(b, best[0], best[1]) }, { lower: { stack: b.slots[best[0]][best[1]] } }, { to: rest }]; }
      } else if (t.kind === "cust" && t.load === null) {
        // dig: the matching container with the fewest on top; move those aside, then load it
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
          ops.push({ to: slotXY(b, src[0], src[1]) }, { lift: { stack: b.slots[src[0]][src[1]] } }, { to: home }, { lower: { truck: t } }, { to: rest });
          cr.truck = t; b.claims[t.want] = Math.max(0, b.claims[t.want] - 1); cr.ops = ops;
        }
      }
    }
  }
  craneStep(cr, dt, () => { const t = cr.truck; if (!t) return; cr.truck = null; doneServing(t); });
}

// ---- input: pan / zoom; select a truck, then where it parks ----
let VW = 0, VH = 0, DPR = 1, zoom = 1, cam = { x: MW * T / 2, y: MH * T / 2 }, selected = null, hover = null, bad = null;
const keys = {};
addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "Escape") selected = null; const n = /^Digit([1-9])$/.exec(e.code); if (n) { const t = trucks.find((q) => q.num === +n[1]); if (t) selected = t; } });
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
const toWorld = (sx, sy) => ({ x: (sx - VW / 2) / zoom + cam.x, y: (sy - VH / 2) / zoom + cam.y });
const tileAtScreen = (sx, sy) => { const w = toWorld(sx, sy); return [Math.floor(w.x / T), Math.floor(w.y / T)]; };
function truckAt(sx, sy) {
  const w = toWorld(sx, sy);
  for (const t of trucks) { if (t.state === "gone" || t.state === "leaving") continue; const dx = w.x - t.x, dy = w.y - t.y, ca = Math.cos(-t.a), sa = Math.sin(-t.a), lx = dx * ca - dy * sa, ly = dx * sa + dy * ca; if (Math.abs(lx) < 2 * T && Math.abs(ly) < 14) return t; }
  return null;
}
function click(sx, sy) {
  const t = truckAt(sx, sy); if (t) { selected = selected === t ? null : t; return; }
  if (!selected) return;
  const [i, j] = tileAtScreen(sx, sy), g = planFor(selected, i, j);
  if (g) enqueue(selected, g); else bad = { i, j, t: 0.5 };
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
function setZoom(z, sx, sy) { const before = toWorld(sx, sy); zoom = clamp(z, 0.4, 3); const after = toWorld(sx, sy); cam.x += before.x - after.x; cam.y += before.y - after.y; }

// ---- placeholder art ----
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function seeded(seed) { let s = seed % 233280; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
function noiseFill(g, x, y, w, h, base, amt, seed) {
  const R = seeded(seed), r = parseInt(base.slice(1, 3), 16), gg = parseInt(base.slice(3, 5), 16), b = parseInt(base.slice(5, 7), 16);
  for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i += 2) { const n = (R() - 0.5) * amt; g.fillStyle = `rgb(${clamp(r + n, 0, 255) | 0},${clamp(gg + n, 0, 255) | 0},${clamp(b + n, 0, 255) | 0})`; g.fillRect(x + i, y + j, 2, 2); }
}
const GROUND = canvas(MW * T, MH * T);
function buildGround() {
  const g = GROUND.getContext("2d");
  for (let j = QUAY; j < MH; j++) for (let i = 0; i < MW; i++) {
    const x = i * T, y = j * T;
    if (j === MH - 1 || i === 0 || i === MW - 1) { noiseFill(g, x, y, T, T, "#3a3a34", 18, i * 31 + j * 17); g.fillStyle = "#55565c"; g.fillRect(x, y + 10, T, 2); g.fillRect(x, y + 20, T, 2); g.fillStyle = "#1e1e22"; g.fillRect(x + 14, y + 4, 4, 24); continue; }
    if (isRoad(i, j)) { noiseFill(g, x, y, T, T, "#2c2f35", 10, i * 7 + j * 3); continue; }
    noiseFill(g, x, y, T, T, "#6a6c70", 12, i * 13 + j * 29); g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(x, y, T, 1); g.fillRect(x, y, 1, T);
    if (j === QUAY) { g.fillStyle = "#c9a23a"; for (let k = 0; k < T; k += 8) g.fillRect(x + k, y, 4, 3); }
  }
  g.fillStyle = "#c9a23a"; for (let i = 1; i <= 34; i++) for (const j of [QROAD, YROAD]) if (i % 2) g.fillRect(i * T + 6, j * T + 15, 14, 2);
  g.fillStyle = "#3a3c40"; g.fillRect(T, (QUAY + 0.3) * T, 34 * T, 3); g.fillRect(T, (QROAD + 1) * T - 3, 34 * T, 3);
  for (const b of BLOCKS) { noiseFill(g, b.x * T, b.y * T, b.w * T, b.h * T, "#55575c", 10, b.id * 9 + 1); noiseFill(g, b.x * T, (YROAD - 1) * T, b.w * T, T, "#4a4c52", 8, b.id + 3); g.fillStyle = "rgba(201,162,58,.5)"; g.fillRect(b.x * T, b.y * T, b.w * T, 2); g.fillRect(b.x * T, (b.y + b.h) * T - 2, b.w * T, 2); g.fillRect(b.x * T, b.y * T, 2, b.h * T); g.fillRect((b.x + b.w) * T - 2, b.y * T, 2, b.h * T); }
  for (const s of STUBS) { g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(30 * T, s.j * T, 5 * T, 2); g.fillRect(30 * T, (s.j + 1) * T - 2, 5 * T, 2); }
  for (const b of BERTHS) { g.fillStyle = "#e8e2d0"; g.font = "800 20px 'Big Shoulders Display', Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String.fromCharCode(65 + b.id), (b.x + 1) * T, (QUAY + 1) * T + 4); }
}
function drawWater() {
  ctx.fillStyle = "#1a4a6a"; ctx.fillRect(-20 * T, -10 * T, (MW + 40) * T, (QUAY + 10) * T);
  ctx.fillStyle = "rgba(255,255,255,.07)";
  for (let j = -6; j < QUAY; j++) for (let i = -16; i < MW + 16; i += 2) { const o = Math.round(((clock * 12 + j * 37) % 64)) - 32; ctx.fillRect(i * T + o + (j % 2) * 20, j * T + 14, 14, 2); }
}
// (owner) a stack drawn as three squares down its 1 x 3 footprint: top square the top of the stack, bottom the bottom
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
// a container in transit: 3 tiles long, along its own axis
function drawBox(c, cx, cy, ang, lifted) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
  if (lifted) { ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(-CL * T / 2 + 6, -T / 2 + 8, CL * T - 4, T - 6); ctx.translate(-3, -5); }
  ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(-CL * T / 2 + 1, -T / 2 + 3, CL * T - 2, T - 6);
  ctx.fillStyle = COLORS[c].c; ctx.fillRect(-CL * T / 2 + 2, -T / 2 + 4, CL * T - 4, T - 8);
  ctx.fillStyle = "rgba(0,0,0,.2)"; for (let k = -CL * T / 2 + 6; k < CL * T / 2 - 4; k += 5) ctx.fillRect(k, -T / 2 + 5, 1, T - 10);
  ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fillRect(-CL * T / 2 + 2, -T / 2 + 4, CL * T - 4, 2);
  ctx.restore();
}
function drawShip(b) {
  const s = b.ship, x = b.x * T + Math.round(s.off), y = 2 * T + 10, w = b.w * T, h = 4 * T - 12;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x - 10, y + 6, w + 50, h);
  ctx.fillStyle = s.hull; ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(x + w + 8, y); ctx.lineTo(x + w + 44, y + h / 2); ctx.lineTo(x + w + 8, y + h); ctx.lineTo(x - 20, y + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#c8ccd0"; ctx.fillRect(x - 20, y, w + 28, 3); ctx.fillRect(x - 20, y + h - 3, w + 28, 3);
  ctx.fillStyle = "#e8e2d0"; ctx.fillRect(x - 18, y + 10, 14, h - 20); ctx.fillStyle = "#6ab8e8"; ctx.fillRect(x - 15, y + 16, 8, 8);
  s.bays.forEach((st, k) => drawStack(x + k * T, 3 * T, st, "rgba(0,0,0,.4)"));
  if (s.state !== "docked") { ctx.fillStyle = "rgba(255,255,255,.35)"; for (let k = 0; k < 4; k++) ctx.fillRect(x - 30 - k * 12 - ((clock * 40) % 12), y + 14 + k * 10, 8, 2); }
}
function drawTruck(t) {
  ctx.save(); ctx.translate(Math.round(t.x), Math.round(t.y)); ctx.rotate(t.a);
  const L = 4 * T;
  if (t === selected) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; const p = 1 + Math.sin(clock * 8); ctx.strokeRect(-L / 2 - p, -14 - p, L + p * 2, 28 + p * 2); }
  else if (hover && hover.truck === t) { ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 2; ctx.strokeRect(-L / 2, -14, L, 28); }
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(-L / 2 + 4, -10, L, 24);
  ctx.fillStyle = "#2a2c30"; for (const wx of [-L / 2 + 6, -L / 2 + 22, T - 14, L / 2 - 20]) { ctx.fillRect(wx, -13, 9, 4); ctx.fillRect(wx, 9, 9, 4); }
  ctx.fillStyle = "#4a4e56"; ctx.fillRect(-L / 2 + 2, -9, CL * T - 4, 18);
  ctx.fillStyle = "#1e2024"; ctx.fillRect(T - 2, -11, T - 2, 22);
  ctx.fillStyle = t.kind === "cust" ? COLORS[t.want].c : "#e8b432"; ctx.fillRect(T, -10, T - 6, 20);
  ctx.fillStyle = "#9ad0f0"; ctx.fillRect(2 * T - 12, -7, 4, 14);
  ctx.restore();
  if (t.load !== null) drawBox(t.load, t.x - Math.cos(t.a) * T / 2, t.y - Math.sin(t.a) * T / 2, t.a, false);
  if (t.num) { const nx = Math.round(t.x + Math.cos(t.a) * 1.5 * T), ny = Math.round(t.y + Math.sin(t.a) * 1.5 * T); ctx.fillStyle = "#1e2024"; ctx.fillRect(nx - 6, ny - 6, 12, 12); ctx.fillStyle = "#ece7dc"; ctx.font = "800 10px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(t.num), nx, ny + 0.5); }
  if (t.happy > 0) { const bx = t.x + 10, by = t.y - 40; ctx.fillStyle = "#ffffff"; ctx.fillRect(bx, by, 18, 16); ctx.fillRect(bx + 4, by + 16, 4, 3); ctx.fillStyle = "#2e9a4a"; ctx.fillRect(bx + 4, by + 4, 3, 3); ctx.fillRect(bx + 11, by + 4, 3, 3); ctx.fillRect(bx + 4, by + 10, 10, 2); ctx.fillRect(bx + 3, by + 9, 2, 2); ctx.fillRect(bx + 13, by + 9, 2, 2); }
}
function drawSTS(b) {
  const cr = b.crane, x = Math.round(cr.x);
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x - 40, 0, 88, (QROAD + 1) * T);
  ctx.fillStyle = "#b8452a"; for (const lx of [x - 44, x + 36]) ctx.fillRect(lx, QUAY * T, 8, 3 * T);
  ctx.fillStyle = "#d8552e"; ctx.fillRect(x - 44, QUAY * T - 6, 88, 10); ctx.fillRect(x - 44, (QROAD + 1) * T - 10, 88, 8);
  ctx.fillStyle = "#e8653a"; ctx.fillRect(x - 6, 0, 12, (QROAD + 1) * T); ctx.fillStyle = "#8a3a22"; for (let y = 4; y < (QROAD + 1) * T; y += 16) ctx.fillRect(x - 6, y, 12, 2);
  const ty = Math.round(cr.y);
  ctx.fillStyle = "#2a2c30"; ctx.fillRect(x - 12, ty - 10, 24, 20);
  if (cr.hold !== null) drawBox(cr.hold, x, ty, Math.PI / 2, true);
  else { ctx.fillStyle = "#9aa0a8"; ctx.fillRect(x - 3, ty - CL * T / 2 + 4, 6, CL * T - 8); }
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
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0b1218"; ctx.fillRect(0, 0, VW, VH);
  ctx.setTransform(DPR * zoom, 0, 0, DPR * zoom, Math.round(DPR * (VW / 2 - cam.x * zoom)), Math.round(DPR * (VH / 2 - cam.y * zoom)));
  drawWater();
  for (const b of BERTHS) if (b.ship) drawShip(b);
  ctx.drawImage(GROUND, 0, QUAY * T, MW * T, (MH - QUAY) * T, 0, QUAY * T, MW * T, (MH - QUAY) * T);
  for (const b of BLOCKS) for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) drawStack((b.x + c) * T, (b.y + r * CL) * T, b.slots[c][r], "rgba(201,162,58,.35)");
  // the selected truck's queue: numbered parking spots joined in order
  if (selected) {
    let px = selected.x, py = selected.y, n = 0; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
    for (const a of selected.cmd ? [selected.cmd, ...selected.queue] : selected.queue) {
      const sx = (a.spot.i + 0.5) * T, sy = (a.spot.j + 0.5) * T; n++;
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke(); px = sx; py = sy;
      ctx.strokeStyle = "#ffffff"; ctx.strokeRect(sx - 2 * T, sy - 14, 4 * T, 28);
      ctx.setLineDash([]); ctx.fillStyle = "#1e2024"; ctx.fillRect(sx - 2 * T - 6, sy - 20, 13, 13); ctx.fillStyle = "#ece7dc"; ctx.font = "800 10px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(n), sx - 2 * T + 0.5, sy - 13); ctx.setLineDash([5, 5]);
    }
    ctx.setLineDash([]);
  }
  for (const t of trucks) drawTruck(t);
  for (const b of BLOCKS) drawRTG(b);
  for (const b of BERTHS) drawSTS(b);
  // the target under the cursor for the selected truck: green if it can go there, red if not
  if (selected && hover && !hover.truck) {
    const [i, j] = hover.tile, g = targetAt(i, j);
    if (g) { const ok = !!planFor(selected, i, j); ctx.strokeStyle = ok ? "#7fd88a" : "#ff5a4a"; ctx.lineWidth = 3; if (g.kind === "rtg") ctx.strokeRect(g.block.x * T, g.block.y * T, g.block.w * T, (YROAD - g.block.y + 1) * T); else ctx.strokeRect((g.spot.i - 2) * T, 0, 5 * T, (QROAD + 1) * T); }
  }
  if (bad) { ctx.strokeStyle = `rgba(255,90,74,${bad.t * 2})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bad.i * T + 8, bad.j * T + 8); ctx.lineTo(bad.i * T + T - 8, bad.j * T + T - 8); ctx.moveTo(bad.i * T + T - 8, bad.j * T + 8); ctx.lineTo(bad.i * T + 8, bad.j * T + T - 8); ctx.stroke(); }
}

// ---- loop ----
let last = performance.now();
function step(dt) {
  clock += dt;
  const pan = 420 / zoom * dt; if (keys.KeyW || keys.ArrowUp) cam.y -= pan; if (keys.KeyS || keys.ArrowDown) cam.y += pan; if (keys.KeyA || keys.ArrowLeft) cam.x -= pan; if (keys.KeyD || keys.ArrowRight) cam.x += pan;
  cam.x = clamp(cam.x, 0, MW * T); cam.y = clamp(cam.y, 0, MH * T);
  for (const b of BERTHS) { shipStep(b, dt); stsStep(b, dt); }
  for (const b of BLOCKS) rtgStep(b, dt);
  custWait -= dt; if (custWait <= 0) { spawnCustomer(); custWait = 9 + rnd() * 7; }
  for (const t of [...trucks]) { truckStep(t, dt); if (t.happy > 0) t.happy -= dt; }
  if (selected && (!trucks.includes(selected) || selected.state === "leaving" || selected.state === "gone")) selected = null;
  if (bad) { bad.t -= dt; if (bad.t <= 0) bad = null; }
}
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); draw(); requestAnimationFrame(frame); }
function resize() { DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight; cv.width = VW * DPR; cv.height = VH * DPR; zoom = clamp(Math.min(VW / (MW * T), VH / ((MH + 1) * T)), 0.4, 3); cam.y = (MH * T) / 2; }
addEventListener("resize", resize); resize();
buildGround();
if (document.fonts && document.fonts.load) document.fonts.load("800 20px 'Big Shoulders Display'").then(buildGround).catch(() => {});
requestAnimationFrame(frame);
window.Atamus = { get state() { return { trucks, berths: BERTHS, blocks: BLOCKS, delivered, selected }; }, step, planFor, enqueue, select: (t) => (selected = t) };
})();
