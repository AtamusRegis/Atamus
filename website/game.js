// Atamus (owner, 2026-10-31): a single-player seaport management game. Boats dock at two berths with containers in ten
// colors; you tell the forklifts which container to move where (click it, then click its spot), and a forklift must be
// able to drive up to both ends. Trucks pull into the bays with their cab colored like the container they want: bring
// them a match and they leave happy. A 32 x 32 tile grid with placeholder pixel art. Rules in docs/FEATURES.md.
"use strict";
(() => {
const $ = (id) => document.getElementById(id);
const cv = $("view"), ctx = cv.getContext("2d");
const TAU = Math.PI * 2, rnd = Math.random, hyp = Math.hypot, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---- the port: 36 x 24 tiles of 32 px ----
// rows 0–6 water (boats dock at rows 5–6), 7–20 the quay and yard, 21–22 the truck road, 23 the fence
const T = 32, MW = 36, MH = 24, QUAY = 7, APRON = 20, ROAD = 21;
const COLORS = [
  { name: "Red", c: "#d23c32" }, { name: "Orange", c: "#e8822a" }, { name: "Yellow", c: "#e8c832" }, { name: "Lime", c: "#8ccf3a" }, { name: "Green", c: "#2e9a4a" },
  { name: "Teal", c: "#2ab0a8" }, { name: "Blue", c: "#3a7ad0" }, { name: "Purple", c: "#7a4ac8" }, { name: "Pink", c: "#e05aa8" }, { name: "White", c: "#d8dcdf" },
];
const BERTHS = [{ id: 0, x: 3, w: 8 }, { id: 1, x: 18, w: 8 }];
for (const b of BERTHS) { b.boat = null; b.wait = 1 + rnd() * 3; }
const BAYS = [3, 9, 15, 21, 27].map((x, i) => ({ id: i, x, truck: null }));   // trailer at (x, ROAD), cab at (x + 1, ROAD)
const DEPOT = [[31, 9], [32, 9], [33, 9]];

const isYard = (i, j) => i >= 1 && i <= MW - 2 && j >= QUAY && j <= APRON;
let containers = [], boats = [], trucks = [], forklifts = [], jobs = [], delivered = 0, clock = 0;
const contAt = (i, j) => containers.find((c) => !c.carried && c.i === i && c.j === j) || null;
function deckBoat(i, j) { for (const b of boats) if (b.state === "docked" && j >= 5 && j <= 6 && i >= b.berth.x && i < b.berth.x + b.berth.w) return b; return null; }
const reserved = new Set(), rk = (i, j) => j * MW + i;
// a forklift can drive over a tile: open yard, or the deck of a docked boat, with no container on it
function drivable(i, j, ignore) { if (!(isYard(i, j) || deckBoat(i, j))) return false; const c = contAt(i, j); return !c || c === ignore; }

// ---- paths: 4-way BFS over drivable tiles ----
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function reachFrom(starts, ignore) {
  const seen = new Map(), q = [];
  for (const [i, j] of starts) { const k = rk(i, j); if (!seen.has(k)) { seen.set(k, -1); q.push([i, j]); } }
  while (q.length) { const [i, j] = q.shift(); for (const [a, b] of N4) { const ni = i + a, nj = j + b, k = rk(ni, nj); if (seen.has(k) || !drivable(ni, nj, ignore)) continue; seen.set(k, rk(i, j)); q.push([ni, nj]); } }
  return seen;
}
function pathTo(seen, i, j) { const out = []; let k = rk(i, j); if (!seen.has(k)) return null; while (k !== -1) { out.unshift([k % MW, Math.floor(k / MW)]); k = seen.get(k); } return out; }
// the free tiles beside a spot that a forklift can reach (the container itself is ignored, it's moving)
function accessFrom(seen, i, j) { return N4.map(([a, b]) => [i + a, j + b]).filter(([x, y]) => seen.has(rk(x, y))); }

// ---- boats ----
const HULLS = ["#5a6a7a", "#7a3a3a", "#3a5a4a", "#4a4a6a", "#6a5a3a"];
function newBoat(berth) {
  const b = { berth, x: -14 * T, state: "arrive", hull: pick(HULLS), name: pick(["Maris", "Cobalt Star", "Northwind", "Halyard", "Saltmere", "Orca", "Tern", "Bellwether", "Kestrel Bay", "Juniper"]) };
  b.tx = berth.x * T; berth.boat = b; boats.push(b);
  const slots = []; for (let i = 0; i < berth.w; i++) for (const j of [5, 6]) slots.push([berth.x + i, j]);
  slots.sort(() => rnd() - 0.5);
  const n = 8 + Math.floor(rnd() * 7);
  for (let k = 0; k < n; k++) containers.push({ id: containers.length + "_" + rnd(), color: Math.floor(rnd() * COLORS.length), i: slots[k][0], j: slots[k][1], boat: b, carried: null, job: null });
  return b;
}
function boatStep(b, dt) {
  if (b.state === "arrive") { b.x += Math.max(30, (b.tx - b.x) * 1.4) * dt; if (b.x >= b.tx) { b.x = b.tx; b.state = "docked"; } }
  else if (b.state === "docked") {
    const busy = containers.some((c) => c.boat === b) || forklifts.some((f) => f.i >= b.berth.x && f.i < b.berth.x + b.berth.w && f.j <= 6);
    if (!busy) { b.idle = (b.idle || 0) + dt; if (b.idle > 2) b.state = "depart"; } else b.idle = 0;
  }
  else if (b.state === "depart") { b.x += (40 + (b.x - b.tx) * 0.8) * dt; if (b.x > (MW + 2) * T) { boats.splice(boats.indexOf(b), 1); b.berth.boat = null; b.berth.wait = 4 + rnd() * 6; } }
}

// ---- trucks: the cab's color is the container it wants ----
let truckWait = 3;
function colorsInPort() { const s = new Set(containers.filter((c) => !c.delivered).map((c) => c.color)); return [...s]; }
function newTruck(bay) {
  const want = trucks.map((t) => t.color), have = colorsInPort(), fresh = have.filter((c) => !want.includes(c));
  const color = fresh.length ? pick(fresh) : have.length ? pick(have) : Math.floor(rnd() * COLORS.length);
  const t = { bay, color, x: (MW + 2) * T, tx: bay.x * T, state: "arrive", t: 0, load: null }; bay.truck = t; trucks.push(t); return t;
}
function truckStep(t, dt) {
  if (t.state === "arrive") { t.x -= Math.max(40, (t.x - t.tx) * 1.6) * dt; if (t.x <= t.tx) { t.x = t.tx; t.state = "wait"; } }
  else if (t.state === "happy") { t.t += dt; if (t.t > 1.6) { t.state = "leave"; t.bay.truck = null; } }
  else if (t.state === "leave") { t.x -= (60 + (t.tx - t.x) * 1.2) * dt; if (t.x < -4 * T) trucks.splice(trucks.indexOf(t), 1); }
}

// ---- forklifts and orders: a container, and where it goes (a yard tile or a truck) ----
forklifts = DEPOT.map(([i, j], k) => ({ id: k, i, j, x: i * T, y: j * T, dir: 3, path: [], job: null, stage: "idle", t: 0, home: [i, j], retry: 0 }));
const tileF = (f) => [Math.round(f.x / T), Math.round(f.y / T)];
const DIRS = { "1,0": 0, "0,1": 1, "-1,0": 2, "0,-1": 3 };
function order(c, ti, tj, truck) {
  if (c.job) { cancel(c.job); }
  const job = { c, ti, tj, truck, f: null }; c.job = job; reserved.add(rk(ti, tj)); if (truck) truck.claimed = job; jobs.push(job); return job;
}
function cancel(job) { if (job.f) return false; jobs.splice(jobs.indexOf(job), 1); job.c.job = null; reserved.delete(rk(job.ti, job.tj)); if (job.truck) job.truck.claimed = null; return true; }
function canOrder(c, ti, tj, truck) {
  if (c.boat && c.boat.state !== "docked") return false;
  if (truck) { if (truck.state !== "wait" || truck.claimed || truck.color !== c.color) return false; }
  else { if (!isYard(ti, tj) || contAt(ti, tj) || reserved.has(rk(ti, tj))) return false; }
  const seen = reachFrom(forklifts.map(tileF), c);
  return accessFrom(seen, c.i, c.j).length > 0 && accessFrom(seen, ti, tj).length > 0;
}
function forkStep(f, dt) {
  // idle: take the oldest order this forklift can reach
  if (!f.job) {
    const seen = jobs.some((jb) => !jb.f) ? reachFrom([tileF(f)], null) : null;
    for (const job of jobs) {
      if (job.f) continue;
      const acc = accessFrom(seen, job.c.i, job.c.j);
      if (!acc.length) continue;
      acc.sort((a, b) => hyp(a[0] - f.x / T, a[1] - f.y / T) - hyp(b[0] - f.x / T, b[1] - f.y / T));
      job.f = f; f.job = job; f.stage = "toPick"; f.path = pathTo(seen, acc[0][0], acc[0][1]) || []; f.path.shift(); break;
    }
    if (!f.job && !f.path.length) { const [i, j] = tileF(f); if (i !== f.home[0] || j !== f.home[1]) { const seen = reachFrom([[i, j]], null), p = pathTo(seen, f.home[0], f.home[1]); if (p) { p.shift(); f.path = p; } } }
  }
  // drive tile to tile, re-pathing when something got in the way
  if (f.path.length) {
    const [ni, nj] = f.path[0];
    if (!drivable(ni, nj, f.job && f.stage === "toDrop" ? null : null)) { f.path = []; f.retry = 0; replan(f); return; }
    const tx = ni * T, ty = nj * T, dx = tx - f.x, dy = ty - f.y, d = hyp(dx, dy), sp = (f.job && f.job.c.carried === f ? 110 : 130) * dt;
    if (dx || dy) f.dir = DIRS[Math.sign(Math.round(dx)) + "," + Math.sign(Math.round(dy))] ?? f.dir;
    if (d <= sp) { f.x = tx; f.y = ty; f.path.shift(); } else { f.x += dx / d * sp; f.y += dy / d * sp; }
    return;
  }
  if (!f.job) return;
  const job = f.job, c = job.c, [fi, fj] = tileF(f);
  const face = (i, j) => { f.dir = DIRS[Math.sign(i - fi) + "," + Math.sign(j - fj)] ?? f.dir; };
  if (f.stage === "toPick") {
    if (Math.abs(c.i - fi) + Math.abs(c.j - fj) !== 1) { replan(f); return; }
    face(c.i, c.j); f.stage = "lift"; f.t = 0;
  } else if (f.stage === "lift") {
    f.t += dt; if (f.t >= 0.45) { c.carried = f; c.boat = null; f.stage = "toDrop"; f.t = 0; replan(f); }
  } else if (f.stage === "toDrop") {
    if (Math.abs(job.ti - fi) + Math.abs(job.tj - fj) !== 1) { replan(f); return; }
    face(job.ti, job.tj); f.stage = "lower"; f.t = 0;
  } else if (f.stage === "lower") {
    f.t += dt;
    if (f.t >= 0.45) {
      c.carried = null; c.i = job.ti; c.j = job.tj; c.job = null; reserved.delete(rk(job.ti, job.tj));
      jobs.splice(jobs.indexOf(job), 1); f.job = null; f.stage = "idle";
      if (job.truck) { const t = job.truck; containers.splice(containers.indexOf(c), 1); t.load = c.color; t.state = "happy"; t.t = 0; t.claimed = null; delivered++; }
      if (selected === c) selected = null;
    }
  }
}
// find a way to the next end of the job; when there's none yet, wait and try again
function replan(f) {
  const job = f.job; if (!job) return;
  const c = job.c, [ti, tj] = f.stage === "toPick" ? [c.i, c.j] : [job.ti, job.tj];
  const seen = reachFrom([tileF(f)], c.carried === f ? null : c), acc = accessFrom(seen, ti, tj);
  if (!acc.length) { f.wait = true; return; }
  f.wait = false; acc.sort((a, b) => hyp(a[0] - f.x / T, a[1] - f.y / T) - hyp(b[0] - f.x / T, b[1] - f.y / T));
  const p = pathTo(seen, acc[0][0], acc[0][1]); if (p) { p.shift(); f.path = p; }
}

// ---- input: pan / zoom, click a container then its destination ----
let VW = 0, VH = 0, DPR = 1, zoom = 1, cam = { x: MW * T / 2, y: MH * T / 2 }, selected = null, hover = null, bad = null;
const keys = {};
addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "Escape") selected = null; });
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
const toWorld = (sx, sy) => ({ x: (sx - VW / 2) / zoom + cam.x, y: (sy - VH / 2) / zoom + cam.y });
const tileAtScreen = (sx, sy) => { const w = toWorld(sx, sy); return [Math.floor(w.x / T), Math.floor(w.y / T)]; };
function truckAt(i, j) { return trucks.find((t) => t.state === "wait" && j === ROAD && (i === t.bay.x || i === t.bay.x + 1)) || null; }
function click(sx, sy) {
  const [i, j] = tileAtScreen(sx, sy), c = contAt(i, j), t = truckAt(i, j);
  if (c && !c.carried && !(c.boat && c.boat.state !== "docked")) {
    if (selected === c) { if (c.job && !c.job.f) cancel(c.job); selected = null; return; }
    if (!(c.job && c.job.f)) { selected = c; return; }
  }
  if (selected) {
    const ok = t ? canOrder(selected, t.bay.x, ROAD, t) : canOrder(selected, i, j, null);
    if (ok) { order(selected, t ? t.bay.x : i, t ? ROAD : j, t); selected = null; }
    else bad = { i, j, t: 0.5 };
    return;
  }
}
const pts = new Map(); let gesture = null;
cv.addEventListener("contextmenu", (e) => { e.preventDefault(); selected = null; });
cv.addEventListener("pointerdown", (e) => {
  if (e.button === 2) return;
  try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()]; gesture = { pinch: hyp(a.x - b.x, a.y - b.y), zoom, moved: true }; return; }
  gesture = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
});
cv.addEventListener("pointermove", (e) => {
  hover = tileAtScreen(e.clientX, e.clientY);
  if (!pts.has(e.pointerId) || !gesture) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture.pinch && pts.size === 2) { const [a, b] = [...pts.values()]; setZoom(gesture.zoom * hyp(a.x - b.x, a.y - b.y) / gesture.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
  if (gesture.pinch) return;
  const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy; if (hyp(dx, dy) > 6) gesture.moved = true;
  if (gesture.moved) { cam.x = gesture.cx - dx / zoom; cam.y = gesture.cy - dy / zoom; }
});
cv.addEventListener("pointerup", (e) => { pts.delete(e.pointerId); if (gesture && !gesture.moved && !gesture.pinch) click(e.clientX, e.clientY); if (!pts.size) gesture = null; });
cv.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });
function setZoom(z, sx, sy) { const before = toWorld(sx, sy); zoom = clamp(z, 0.5, 3); const after = toWorld(sx, sy); cam.x += before.x - after.x; cam.y += before.y - after.y; }

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
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const x = i * T, y = j * T;
    if (j < QUAY) { g.fillStyle = "#1a4a6a"; g.fillRect(x, y, T, T); continue; }
    if (j === MH - 1 || i === 0 || i === MW - 1) { noiseFill(g, x, y, T, T, "#3a3a34", 18, i * 31 + j * 17); g.fillStyle = "#55565c"; g.fillRect(x, y + 10, T, 2); g.fillRect(x, y + 20, T, 2); g.fillStyle = "#1e1e22"; g.fillRect(x + 14, y + 4, 4, 24); continue; }
    if (j >= ROAD) { noiseFill(g, x, y, T, T, "#2c2f35", 10, i * 7 + j * 3); if (j === ROAD + 1) { g.fillStyle = "#c9a23a"; g.fillRect(x + 4, y, 14, 2); } continue; }
    noiseFill(g, x, y, T, T, "#6a6c70", 12, i * 13 + j * 29);
    g.fillStyle = "rgba(0,0,0,.16)"; g.fillRect(x, y, T, 1); g.fillRect(x, y, 1, T);
    if (j === QUAY) { g.fillStyle = "#c9a23a"; for (let k = 0; k < T; k += 8) g.fillRect(x + k, y, 4, 3); if (i % 4 === 2) { g.fillStyle = "#2a2c30"; g.fillRect(x + 12, y + 5, 8, 7); g.fillStyle = "#4a4c52"; g.fillRect(x + 13, y + 6, 6, 3); } }
    if (j === APRON) { g.fillStyle = "rgba(201,162,58,.5)"; g.fillRect(x, y + T - 3, T, 3); }
  }
  for (const b of BAYS) { g.fillStyle = "rgba(255,255,255,.22)"; g.fillRect(b.x * T - 2, ROAD * T + 2, 2, T * 2 - 4); g.fillRect((b.x + 2) * T, ROAD * T + 2, 2, T * 2 - 4); g.fillStyle = "rgba(201,162,58,.35)"; g.fillRect(b.x * T + 4, APRON * T + 4, T - 8, T - 8); }
  for (const b of BERTHS) { g.fillStyle = "#e8e2d0"; g.font = "800 22px 'Big Shoulders Display', Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String.fromCharCode(65 + b.id), (b.x + b.w / 2) * T, QUAY * T + 18); }
  for (const [i, j] of DEPOT) { g.strokeStyle = "rgba(242,169,59,.45)"; g.lineWidth = 2; g.strokeRect(i * T + 3, j * T + 3, T - 6, T - 6); }
}
function drawWater() {
  ctx.fillStyle = "#1a4a6a"; ctx.fillRect(-20 * T, -10 * T, (MW + 40) * T, (QUAY + 10) * T);
  ctx.fillStyle = "rgba(255,255,255,.07)";
  for (let j = -6; j < QUAY; j++) for (let i = -16; i < MW + 16; i += 2) { const o = Math.round(((clock * 12 + j * 37) % 64)) - 32; ctx.fillRect(i * T + o + (j % 2) * 20, j * T + 14, 14, 2); }
}
function drawContainer(color, x, y, lift, ghost) {
  const col = COLORS[color].c;
  if (lift) { ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(x + 4, y + 6, T - 6, T - 6); }
  x -= lift ? 2 : 0; y -= lift ? 4 : 0;
  ctx.globalAlpha = ghost ? 0.45 : 1;
  ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
  ctx.fillStyle = col; ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
  ctx.fillStyle = "rgba(0,0,0,.22)"; for (let k = 6; k < T - 5; k += 4) ctx.fillRect(x + 4, y + k, T - 8, 1);
  ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(x + 3, y + 3, T - 6, 2);
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x + 3, y + T - 5, T - 6, 2);
  ctx.fillStyle = "#2a2c30"; for (const [a, b] of [[3, 3], [T - 6, 3], [3, T - 6], [T - 6, T - 6]]) ctx.fillRect(x + a, y + b, 3, 3);
  ctx.globalAlpha = 1;
}
function drawBoat(b) {
  const x = Math.round(b.x), y = 4 * T + 8, w = b.berth.w * T, h = 3 * T - 8;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x - 10, y + 6, w + 46, h);
  ctx.fillStyle = b.hull; ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(x + w + 8, y); ctx.lineTo(x + w + 40, y + h / 2); ctx.lineTo(x + w + 8, y + h); ctx.lineTo(x - 16, y + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#c8ccd0"; ctx.fillRect(x - 16, y, w + 24, 3); ctx.fillRect(x - 16, y + h - 3, w + 24, 3);
  ctx.fillStyle = "#4a3a2a"; ctx.fillRect(x, 5 * T, w, 2 * T);
  ctx.fillStyle = "rgba(0,0,0,.2)"; for (let k = 0; k < b.berth.w; k++) ctx.fillRect(x + k * T, 5 * T, 1, 2 * T);
  ctx.fillStyle = "#e8e2d0"; ctx.fillRect(x - 14, y + 8, 12, h - 16); ctx.fillStyle = "#6ab8e8"; ctx.fillRect(x - 12, y + 12, 8, 6);
  if (b.state !== "docked") { ctx.fillStyle = "rgba(255,255,255,.35)"; for (let k = 0; k < 4; k++) ctx.fillRect(x - 26 - k * 12 - ((clock * 40) % 12), y + 10 + k * 8, 8, 2); }
}
function drawTruck(t) {
  const x = Math.round(t.x), y = ROAD * T;
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(x + 4, y + 8, T * 2 - 2, T - 6);
  ctx.fillStyle = "#4a4e56"; ctx.fillRect(x + 1, y + 6, T - 2, T - 10); ctx.fillStyle = "#2a2c30"; ctx.fillRect(x + 3, y + 4, 6, 3); ctx.fillRect(x + T - 9, y + 4, 6, 3); ctx.fillRect(x + 3, y + T - 5, 6, 3); ctx.fillRect(x + T - 9, y + T - 5, 6, 3);
  ctx.fillStyle = "#6a6e76"; ctx.fillRect(x + T - 2, y + 12, 4, 8);
  const col = COLORS[t.color].c; ctx.fillStyle = "#1e2024"; ctx.fillRect(x + T + 1, y + 5, T - 4, T - 10);
  ctx.fillStyle = col; ctx.fillRect(x + T + 2, y + 6, T - 6, T - 12); ctx.fillStyle = "#9ad0f0"; ctx.fillRect(x + 2 * T - 9, y + 9, 4, T - 18);
  ctx.fillStyle = "#2a2c30"; ctx.fillRect(x + T + 5, y + 3, 6, 3); ctx.fillRect(x + T + 5, y + T - 6, 6, 3);
  if (t.load !== null) drawContainer(t.load, x, y, false);
  if (t.state === "wait") { const pulse = selected && selected.color === t.color && !t.claimed ? 0.5 + 0.5 * Math.sin(clock * 8) : 0; if (pulse) { ctx.strokeStyle = `rgba(127,216,138,${pulse})`; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y + 1, 2 * T + 2, T - 2); } }
  if (t.state === "happy") { const bx = x + T + 8, by = y - 22 - Math.min(6, t.t * 12); ctx.fillStyle = "#ffffff"; ctx.fillRect(bx, by, 18, 16); ctx.fillRect(bx + 4, by + 16, 4, 3); ctx.fillStyle = "#2e9a4a"; ctx.fillRect(bx + 4, by + 4, 3, 3); ctx.fillRect(bx + 11, by + 4, 3, 3); ctx.fillRect(bx + 4, by + 10, 10, 2); ctx.fillRect(bx + 3, by + 9, 2, 2); ctx.fillRect(bx + 13, by + 9, 2, 2); }
}
function drawForklift(f) {
  const x = Math.round(f.x) + T / 2, y = Math.round(f.y) + T / 2, a = [0, Math.PI / 2, Math.PI, -Math.PI / 2][f.dir];
  const c = f.job && f.job.c.carried === f ? f.job.c : null, raise = f.stage === "lift" ? f.t / 0.45 : f.stage === "lower" ? 1 - f.t / 0.45 : c ? 1 : 0;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(-10, -8, 20, 18);
  ctx.fillStyle = "#2a2c30"; ctx.fillRect(-9, -11, 6, 4); ctx.fillRect(3, -11, 6, 4); ctx.fillRect(-9, 7, 6, 4); ctx.fillRect(3, 7, 6, 4);
  ctx.fillStyle = "#e8b432"; ctx.fillRect(-11, -8, 20, 16); ctx.fillStyle = "#b88a22"; ctx.fillRect(-11, -8, 6, 16);
  ctx.fillStyle = "#1e2024"; ctx.fillRect(-4, -6, 8, 12); ctx.fillStyle = "#3a3e46"; ctx.fillRect(-3, -5, 6, 6);
  ctx.fillStyle = "#55585e"; ctx.fillRect(9, -9, 3, 18);
  ctx.fillStyle = "#9aa0a8"; ctx.fillRect(12, -7, 12, 2); ctx.fillRect(12, 5, 12, 2);
  ctx.restore();
  if (c || (f.job && (f.stage === "lift"))) { const cc = c || f.job.c; if (c) { const off = [[1, 0], [0, 1], [-1, 0], [0, -1]][f.dir]; drawContainer(cc.color, Math.round(f.x) + off[0] * 22, Math.round(f.y) + off[1] * 22, raise > 0.5); } }
  if (f.wait && f.job) { ctx.fillStyle = "#ff5a4a"; ctx.fillRect(x - 2, y - 22, 4, 8); ctx.fillRect(x - 2, y - 12, 4, 3); }
}
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0b1218"; ctx.fillRect(0, 0, VW, VH);
  ctx.setTransform(DPR * zoom, 0, 0, DPR * zoom, Math.round(DPR * (VW / 2 - cam.x * zoom)), Math.round(DPR * (VH / 2 - cam.y * zoom)));
  drawWater();
  for (const b of boats) drawBoat(b);
  ctx.drawImage(GROUND, 0, QUAY * T, MW * T, (MH - QUAY) * T, 0, QUAY * T, MW * T, (MH - QUAY) * T);
  // orders: where each container is headed
  ctx.setLineDash([4, 4]);
  for (const job of jobs) {
    const col = COLORS[job.c.color].c; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.strokeRect(job.ti * T + 3, job.tj * T + 3, T - 6, T - 6);
    if (!job.c.carried) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(job.c.i * T + T / 2, job.c.j * T + T / 2); ctx.lineTo(job.ti * T + T / 2, job.tj * T + T / 2); ctx.stroke(); ctx.globalAlpha = 1; }
  }
  ctx.setLineDash([]);
  for (const t of trucks) drawTruck(t);
  for (const c of containers) if (!c.carried) {
    const onBoat = c.boat && c.boat.state !== "docked", bx = onBoat ? c.boat.x - c.boat.berth.x * T : 0;
    drawContainer(c.color, c.i * T + bx, c.j * T, false);
    if (c.job) { ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(c.i * T + bx + 12, c.j * T + 12, 8, 8); ctx.fillStyle = COLORS[c.color].c; ctx.fillRect(c.i * T + bx + 14, c.j * T + 14, 4, 4); }
  }
  for (const f of forklifts) drawForklift(f);
  // the selection, and where it would go
  if (selected) {
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; const p = 1 + Math.sin(clock * 8); ctx.strokeRect(selected.i * T - p, selected.j * T - p, T + p * 2, T + p * 2);
    if (hover) {
      const [i, j] = hover, t = truckAt(i, j), ok = t ? canOrder(selected, t.bay.x, ROAD, t) : canOrder(selected, i, j, null);
      if (t) { ctx.strokeStyle = ok ? "#7fd88a" : "#ff5a4a"; ctx.strokeRect(t.bay.x * T, ROAD * T, 2 * T, T); }
      else if (i !== selected.i || j !== selected.j) { if (ok) drawContainer(selected.color, i * T, j * T, false, true); ctx.strokeStyle = ok ? "#7fd88a" : "rgba(255,90,74,.8)"; ctx.strokeRect(i * T + 1, j * T + 1, T - 2, T - 2); }
    }
  }
  if (bad) { ctx.strokeStyle = `rgba(255,90,74,${bad.t * 2})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bad.i * T + 8, bad.j * T + 8); ctx.lineTo(bad.i * T + T - 8, bad.j * T + T - 8); ctx.moveTo(bad.i * T + T - 8, bad.j * T + 8); ctx.lineTo(bad.i * T + 8, bad.j * T + T - 8); ctx.stroke(); }
}

// ---- loop ----
let last = performance.now();
function step(dt) {
  clock += dt;
  const pan = 420 / zoom * dt; if (keys.KeyW || keys.ArrowUp) cam.y -= pan; if (keys.KeyS || keys.ArrowDown) cam.y += pan; if (keys.KeyA || keys.ArrowLeft) cam.x -= pan; if (keys.KeyD || keys.ArrowRight) cam.x += pan;
  cam.x = clamp(cam.x, 0, MW * T); cam.y = clamp(cam.y, 0, MH * T);
  for (const b of BERTHS) if (!b.boat) { b.wait -= dt; if (b.wait <= 0) newBoat(b); }
  for (const b of [...boats]) boatStep(b, dt);
  truckWait -= dt; if (truckWait <= 0) { const free = BAYS.filter((b) => !b.truck); if (free.length && colorsInPort().length) newTruck(pick(free)); truckWait = 6 + rnd() * 8; }
  for (const t of [...trucks]) truckStep(t, dt);
  for (const f of forklifts) { if (f.wait) { f.retry = (f.retry || 0) + dt; if (f.retry > 0.5) { f.retry = 0; replan(f); } } forkStep(f, dt); }
  if (bad) { bad.t -= dt; if (bad.t <= 0) bad = null; }
  if (selected && !containers.includes(selected)) selected = null;
}
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); draw(); requestAnimationFrame(frame); }
function resize() { DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight; cv.width = VW * DPR; cv.height = VH * DPR; zoom = clamp(Math.min(VW / (MW * T), VH / ((MH - 2) * T)), 0.5, 3); cam.y = (MH * T) / 2 + T; }
addEventListener("resize", resize); resize();
buildGround();
if (document.fonts && document.fonts.load) document.fonts.load("800 22px 'Big Shoulders Display'").then(buildGround).catch(() => {});
requestAnimationFrame(frame);
window.Atamus = { get state() { return { containers, boats, trucks, forklifts, jobs, delivered, selected }; }, step, order, canOrder, click: (i, j) => { const s = { x: (i + 0.5) * T, y: (j + 0.5) * T }; click((s.x - cam.x) * zoom + VW / 2, (s.y - cam.y) * zoom + VH / 2); } };
})();
