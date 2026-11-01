// Atamus (owner, 2026-10-31): a single-player sci-fi spaceport management game. Rebuilt from scratch: no server, no
// multiplayer. Ships fly in, land on the pads and take off again; click a landed ship to open its cargo grid and drag a
// stack onto a storage unit, and the workers carry it over one item at a time until the stack is gone or the unit is
// full. A 32 x 32 tile grid with placeholder pixel art (to be replaced). Rules in docs/FEATURES.md.
"use strict";
(() => {
const $ = (id) => document.getElementById(id);
const cv = $("view"), ctx = cv.getContext("2d");
const TAU = Math.PI * 2, rnd = Math.random, hyp = Math.hypot, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---- the port: a 36 x 24 grid of 32 px tiles ----
const T = 32, MW = 36, MH = 24;
const PADS = [{ id: 0, x: 4, y: 3, w: 5, h: 5 }, { id: 1, x: 12, y: 3, w: 5, h: 5 }];
for (const p of PADS) { p.cx = (p.x + p.w / 2) * T; p.cy = (p.y + p.h / 2) * T; p.ship = null; p.wait = 2 + rnd() * 4; p.load = [[p.x + 1, p.y + p.h], [p.x + 2, p.y + p.h], [p.x + 3, p.y + p.h]]; }
const STORE_COLORS = ["#d9822b", "#3a8ad0", "#5ab06a", "#b05ab0"];
const STORES = [3, 8, 13, 18].map((x, i) => ({ id: i, name: "Storage " + (i + 1), x, y: 13, w: 3, h: 3, cap: 40, items: {}, incoming: 0, color: STORE_COLORS[i], door: [x + 1, 12] }));
const QUARTERS = { x: 26, y: 13, w: 4, h: 3, door: [27, 16] };
const TOWER = { x: 22, y: 3, w: 2, h: 2 };
const ROAD = [9, 10];

// ---- cargo ----
const ITEMS = {
  ore: { name: "Ore", icon: [[3, 7, 10, 6, "#6d737c"], [4, 5, 5, 3, "#8a9099"], [9, 6, 4, 3, "#7a8089"], [5, 6, 2, 1, "#b0b6be"], [3, 12, 10, 1, "#4a4f57"], [10, 8, 2, 2, "#c08a3a"]] },
  ice: { name: "Ice", icon: [[3, 4, 10, 9, "#9ad6f0"], [4, 5, 8, 7, "#c8ecfa"], [5, 6, 3, 2, "#ffffff"], [3, 12, 10, 1, "#6aa6c0"], [10, 9, 2, 2, "#7ac0e0"]] },
  food: { name: "Food", icon: [[2, 4, 12, 9, "#5a8a3a"], [2, 4, 12, 2, "#7aaa4a"], [2, 8, 12, 1, "#3a5a24"], [7, 4, 2, 9, "#3a5a24"], [4, 10, 2, 2, "#e8d880"]] },
  fuel: { name: "Fuel", icon: [[4, 2, 8, 12, "#d8662a"], [4, 2, 8, 2, "#f0884a"], [6, 1, 4, 1, "#888"], [4, 7, 8, 2, "#1a1a1a"], [5, 10, 2, 3, "#f0a060"]] },
  parts: { name: "Parts", icon: [[5, 3, 6, 10, "#9aa1aa"], [3, 5, 10, 6, "#9aa1aa"], [6, 6, 4, 4, "#3a3f46"], [4, 4, 2, 2, "#c0c6cc"], [10, 10, 2, 2, "#6a7079"]] },
  meds: { name: "Medical", icon: [[3, 3, 10, 10, "#e8ecf0"], [3, 12, 10, 1, "#a8b0b8"], [7, 5, 2, 6, "#d83a3a"], [5, 7, 6, 2, "#d83a3a"]] },
};
const TYPES = Object.keys(ITEMS);
const CARGO_W = 6, CARGO_H = 3;
function drawPix(c, list, x, y, s) { for (const [px, py, w, h, col] of list) { c.fillStyle = col; c.fillRect(x + px * s, y + py * s, w * s, h * s); } }
const ICON = {}; for (const k of TYPES) { const c = document.createElement("canvas"); c.width = c.height = 16; drawPix(c.getContext("2d"), ITEMS[k].icon, 0, 0, 1); ICON[k] = c; }
function iconEl(k) { const c = document.createElement("canvas"); c.width = c.height = 16; if (k) c.getContext("2d").drawImage(ICON[k], 0, 0); return c; }

// ---- pixel helpers for the placeholder art ----
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function seeded(seed) { let s = seed % 233280; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
function noiseFill(g, x, y, w, h, base, amt, seed) {
  const R = seeded(seed), [r, gg, b] = [parseInt(base.slice(1, 3), 16), parseInt(base.slice(3, 5), 16), parseInt(base.slice(5, 7), 16)];
  for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i += 2) { const n = (R() - 0.5) * amt; g.fillStyle = `rgb(${clamp(r + n, 0, 255) | 0},${clamp(gg + n, 0, 255) | 0},${clamp(b + n, 0, 255) | 0})`; g.fillRect(x + i, y + j, 2, 2); }
}

// ---- the static ground, built once ----
const GROUND = canvas(MW * T, MH * T);
function buildGround() {
  const g = GROUND.getContext("2d");
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const x = i * T, y = j * T, edge = i === 0 || j === 0 || i === MW - 1 || j === MH - 1;
    if (edge) { noiseFill(g, x, y, T, T, "#3a3428", 22, i * 31 + j * 17); g.fillStyle = "#1e1e22"; g.fillRect(x + 14, y + 4, 4, 24); g.fillStyle = "#55565c"; g.fillRect(x, y + 10, T, 2); g.fillRect(x, y + 20, T, 2); continue; }
    if (ROAD.includes(j)) { noiseFill(g, x, y, T, T, "#2c2f35", 10, i * 7 + j * 3); if (j === ROAD[0]) { g.fillStyle = "#c9a23a"; g.fillRect(x + 4, y + T - 1, 14, 2); } continue; }
    noiseFill(g, x, y, T, T, "#5a5f66", 12, i * 13 + j * 29);
    g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x, y, T, 1); g.fillRect(x, y, 1, T);
    if ((i * 7 + j * 5) % 11 === 0) { g.fillStyle = "rgba(0,0,0,.15)"; g.fillRect(x + 8 + (i % 3) * 4, y + 10, 6, 4); }
  }
  // landing pads
  for (const p of PADS) {
    const x = p.x * T, y = p.y * T, w = p.w * T, h = p.h * T;
    noiseFill(g, x, y, w, h, "#33363d", 10, p.id * 99 + 5);
    g.fillStyle = "#c9a23a"; for (let k = 0; k < w; k += 16) { g.fillRect(x + k, y, 8, 4); g.fillRect(x + k + 8, y + h - 4, 8, 4); } for (let k = 0; k < h; k += 16) { g.fillRect(x, y + k + 8, 4, 8); g.fillRect(x + w - 4, y + k, 4, 8); }
    g.strokeStyle = "#e8e2d0"; g.lineWidth = 4; g.beginPath(); g.arc(x + w / 2, y + h / 2, 52, 0, TAU); g.stroke();
    g.fillStyle = "#e8e2d0"; g.font = "800 44px 'Big Shoulders Display', Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String.fromCharCode(65 + p.id), x + w / 2, y + h / 2 + 2);
    for (const [cx2, cy2] of [[x + 8, y + 8], [x + w - 12, y + 8], [x + 8, y + h - 12], [x + w - 12, y + h - 12]]) { g.fillStyle = "#7fd88a"; g.fillRect(cx2, cy2, 4, 4); }
    for (const [i, j] of p.load) { g.fillStyle = "rgba(201,162,58,.35)"; g.fillRect(i * T + 4, j * T + 4, T - 8, T - 8); }
  }
  // the control tower and crew quarters (decor for now)
  { const x = TOWER.x * T, y = TOWER.y * T; noiseFill(g, x, y, 64, 64, "#4a5260", 10, 7); g.fillStyle = "#2a3038"; g.fillRect(x + 8, y + 8, 48, 48); g.fillStyle = "#6ab8e8"; g.fillRect(x + 14, y + 14, 36, 36); g.fillStyle = "#2a3038"; g.fillRect(x + 30, y + 14, 4, 36); g.fillRect(x + 14, y + 30, 36, 4); g.fillStyle = "#ff5a4a"; g.fillRect(x + 30, y + 30, 4, 4); }
  { const q = QUARTERS, x = q.x * T, y = q.y * T, w = q.w * T, h = q.h * T; noiseFill(g, x, y, w, h, "#6a6258", 10, 11); g.fillStyle = "#4a443c"; for (let k = 8; k < h; k += 12) g.fillRect(x + 4, y + k, w - 8, 2); g.fillStyle = "#2a2622"; g.fillRect(x + (q.door[0] - q.x) * T + 8, y + h - 8, 16, 8); g.fillStyle = "#e8d880"; g.fillRect(x + 12, y + 12, 6, 6); g.fillRect(x + w - 18, y + 12, 6, 6); }
  // storage units: roofs in their color, a door on the road side
  for (const s of STORES) {
    const x = s.x * T, y = s.y * T, w = s.w * T, h = s.h * T;
    noiseFill(g, x, y, w, h, "#4a4f57", 10, s.id * 7 + 3);
    g.fillStyle = s.color; g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = "rgba(0,0,0,.25)"; for (let k = 12; k < h - 6; k += 10) g.fillRect(x + 6, y + k, w - 12, 2);
    g.fillStyle = "#1a1c20"; g.fillRect(x + T + 4, y, T - 8, 8);
    g.fillStyle = "#1a1c20"; g.font = "800 30px 'Big Shoulders Display', Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(s.id + 1), x + w / 2, y + h / 2 + 2);
    const [di, dj] = s.door; g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(di * T + 4, dj * T + 4, T - 8, T - 8);
  }
}

// ---- walking: tiles the workers may cross ----
const solid = Array.from({ length: MH }, (_, j) => Array.from({ length: MW }, (_, i) => i === 0 || j === 0 || i === MW - 1 || j === MH - 1));
for (const b of [...PADS, ...STORES, QUARTERS, TOWER]) for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) solid[j][i] = true;
function findPath(si, sj, ti, tj) {
  const key = (i, j) => j * MW + i, prev = new Map([[key(si, sj), -1]]), q = [[si, sj]];
  while (q.length) {
    const [i, j] = q.shift(); if (i === ti && j === tj) break;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + a, nj = j + b; if (ni < 0 || nj < 0 || ni >= MW || nj >= MH || solid[nj][ni] || prev.has(key(ni, nj))) continue;
      if (a && b && (solid[j][i + a] || solid[j + b][i])) continue;
      prev.set(key(ni, nj), key(i, j)); q.push([ni, nj]);
    }
  }
  if (!prev.has(key(ti, tj))) return null;
  const out = []; let k = key(ti, tj); while (k !== -1 && k !== key(si, sj)) { out.unshift({ x: (k % MW + 0.5) * T, y: (Math.floor(k / MW) + 0.5) * T }); k = prev.get(k); }
  return out;
}

// ---- ships ----
const NAMES = ["Kestrel", "Marrow", "Halcyon", "Brigand", "Tarn", "Vesper", "Corvid", "Lumen", "Dray", "Osprey", "Quill", "Ember", "Saltwind", "Basilisk", "Nadir", "Juno", "Wren", "Talon"];
const PREFIX = ["SV", "MV", "FV", "CSS", "ISV"];
const HULLS = [["#b8c0cc", "#7d8794"], ["#c9a26a", "#8a6a3e"], ["#9ab0a0", "#5e7466"], ["#c08a8a", "#865656"], ["#a0a8c8", "#646c90"]];
function shipSprite(seed) {
  const c = canvas(96, 96), g = c.getContext("2d"), R = seeded(seed * 977 + 13), [hull, dark] = HULLS[seed % HULLS.length];
  const wing = 18 + Math.floor(R() * 14), body = 18 + Math.floor(R() * 8), nose = 10 + Math.floor(R() * 10);
  // nose up: body down the middle, wings, engines at the bottom
  g.fillStyle = dark; g.fillRect(48 - wing - 12, 44, (wing + 12) * 2, 22); g.fillRect(48 - wing - 16, 52, 8, 18); g.fillRect(48 + wing + 8, 52, 8, 18);
  g.fillStyle = hull; g.fillRect(48 - wing - 10, 46, (wing + 10) * 2, 16);
  g.fillStyle = dark; g.fillRect(48 - body / 2 - 2, nose - 2, body + 4, 86 - nose);
  g.fillStyle = hull; g.fillRect(48 - body / 2, nose, body, 82 - nose);
  for (let k = 0; k < 6; k++) { g.fillStyle = hull; g.fillRect(48 - body / 2 + k * 2, nose - 2 - k, body - k * 4, 2); }
  g.fillStyle = "#2a3a4a"; g.fillRect(48 - body / 2 + 4, nose + 4, body - 8, 10); g.fillStyle = "#6ab8e8"; g.fillRect(48 - body / 2 + 5, nose + 5, body - 10, 4);
  g.fillStyle = "rgba(0,0,0,.18)"; for (let y = nose + 20; y < 80; y += 8) g.fillRect(48 - body / 2 + 2, y, body - 4, 2);
  g.fillStyle = "#3a3f46"; g.fillRect(48 - 10, 82, 8, 8); g.fillRect(48 + 2, 82, 8, 8); g.fillRect(48 - wing - 14, 68, 6, 4); g.fillRect(48 + wing + 8, 68, 6, 4);
  g.fillStyle = "#ff5a4a"; g.fillRect(48 - wing - 10, 50, 3, 3); g.fillStyle = "#7fd88a"; g.fillRect(48 + wing + 7, 50, 3, 3);
  return c;
}
let ships = [], shipSeq = 0, served = 0;
function freshName() { for (let k = 0; k < 20; k++) { const n = pick(PREFIX) + " " + pick(NAMES); if (!ships.some((o) => o.name === n)) return n; } return "SV " + shipSeq; }
function newShip(pad) {
  const seed = ++shipSeq, cargo = Array(CARGO_W * CARGO_H).fill(null), n = 3 + Math.floor(rnd() * 4), slots = [...cargo.keys()].sort(() => rnd() - 0.5);
  for (let k = 0; k < n; k++) cargo[slots[k]] = { type: pick(TYPES), count: 4 + Math.floor(rnd() * 13), reserved: 0, to: null };
  const fromX = pad.cx + (rnd() - 0.5) * 600, s = { id: seed, name: freshName(), sprite: shipSprite(seed), pad, x: fromX, y: -220, a: Math.PI / 2, alt: 1, state: "approach", t: 0, cargo, idle: 0 };
  pad.ship = s; ships.push(s); return s;
}
const STATUS = { approach: "Approaching", descend: "Landing", landed: "Landed", ascend: "Taking off", depart: "Departing" };
function shipStep(s, dt) {
  const toward = (tx, ty, sp) => { const dx = tx - s.x, dy = ty - s.y, d = hyp(dx, dy); if (d < sp * dt) { s.x = tx; s.y = ty; return true; } s.x += dx / d * sp * dt; s.y += dy / d * sp * dt; turn(Math.atan2(dy, dx), dt); return false; };
  const turn = (want, dt2) => { let da = ((want - s.a + Math.PI * 3) % TAU) - Math.PI; s.a += clamp(da, -2 * dt2, 2 * dt2); };
  if (s.state === "approach") { if (toward(s.pad.cx, s.pad.cy, 170)) { s.state = "descend"; s.t = 0; } }
  else if (s.state === "descend") { s.t += dt; s.alt = Math.max(0, 1 - s.t / 2.6); turn(-Math.PI / 2, dt); if (s.alt <= 0) { s.state = "landed"; s.a = -Math.PI / 2; refreshShip(s); } }
  else if (s.state === "landed") {
    const busy = workers.some((w) => w.job && w.job.ship === s);
    if (!busy && s.cargo.every((c) => !c || c.count === 0)) { s.idle += dt; if (s.idle > 1.5) takeOff(s); } else s.idle = 0;
  }
  else if (s.state === "ascend") { s.t += dt; s.alt = Math.min(1, s.t / 2.2); if (s.alt >= 1) { s.state = "depart"; s.exit = { x: s.x + (rnd() < 0.5 ? -1 : 1) * 700, y: -260 }; } }
  else if (s.state === "depart") { if (toward(s.exit.x, s.exit.y, 200 + s.t * 40)) { ships.splice(ships.indexOf(s), 1); if (selected === s) select(null); } s.t += dt; }
}
function takeOff(s) {
  if (s.state !== "landed") return;
  for (const w of workers) if (w.job && w.job.ship === s && !w.carry) cancelJob(w);
  for (const c of s.cargo) if (c) c.to = null;
  s.state = "ascend"; s.t = 0; s.pad.ship = null; s.pad.wait = 4 + rnd() * 6; served++;
  if (selected === s) refreshShip(s);
}

// ---- storage ----
const used = (st) => Object.values(st.items).reduce((a, b) => a + b, 0);
const room = (st) => st.cap - used(st) - st.incoming;

// ---- workers: pick up one item, carry it to the unit, come back for the next ----
const SUITS = ["#e07a2a", "#3a8ad0", "#5ab06a", "#c8b040"];
const workers = [0, 1, 2].map((k) => ({ id: k, x: (QUARTERS.door[0] + 0.5 + k * 0.6 - 0.6) * T, y: (QUARTERS.door[1] + 0.5) * T, path: [], job: null, carry: null, t: 0, suit: SUITS[k], step: 0, dir: 1, home: [QUARTERS.door[0] - 1 + k, QUARTERS.door[1] + 1] }));
const tileOf = (w) => [Math.floor(w.x / T), Math.floor(w.y / T)];
function goTo(w, i, j) { const [si, sj] = tileOf(w); w.path = findPath(si, sj, i, j) || []; }
function findJob(w) {
  let best = null, bd = 1e9;
  for (const s of ships) {
    if (s.state !== "landed") continue;
    s.cargo.forEach((c, slot) => {
      if (!c || !c.to || c.count - c.reserved <= 0 || room(c.to) <= 0) return;
      const d = hyp(w.x - s.pad.cx, w.y - s.pad.cy); if (d < bd) { bd = d; best = { ship: s, slot, store: c.to }; }
    });
  }
  return best;
}
function cancelJob(w) { const j = w.job; if (!j) return; if (!w.carry) { const c = j.ship.cargo[j.slot]; if (c) c.reserved = Math.max(0, c.reserved - 1); } j.store.incoming = Math.max(0, j.store.incoming - 1); w.job = null; w.path = []; }
function workerStep(w, dt) {
  if (!w.job && !w.carry) {
    const j = findJob(w);
    if (j) { const c = j.ship.cargo[j.slot]; c.reserved++; j.store.incoming++; w.job = { ...j, stage: "toShip" }; const lt = j.ship.pad.load[w.id % 3]; goTo(w, lt[0], lt[1]); }
    else if (!w.path.length) { const [i, j2] = tileOf(w); if (i !== w.home[0] || j2 !== w.home[1]) goTo(w, w.home[0], w.home[1]); }
  }
  const job = w.job;
  if (job && job.stage === "toShip" && job.ship.state !== "landed") { cancelJob(w); }
  // walk
  if (w.path.length) {
    const n = w.path[0], dx = n.x - w.x, dy = n.y - w.y, d = hyp(dx, dy), sp = 92 * dt;
    if (d <= sp) { w.x = n.x; w.y = n.y; w.path.shift(); } else { w.x += dx / d * sp; w.y += dy / d * sp; if (Math.abs(dx) > 0.5) w.dir = dx > 0 ? 1 : -1; }
    w.step += dt * 10; return;
  }
  if (!w.job) return;
  w.t += dt;
  if (job.stage === "toShip") { job.stage = "pick"; w.t = 0; }
  else if (job.stage === "pick" && w.t > 0.45) {
    const c = job.ship.cargo[job.slot];
    if (!c || c.count <= 0) { cancelJob(w); return; }
    c.count--; c.reserved = Math.max(0, c.reserved - 1); w.carry = c.type; if (c.count === 0) { c.to = null; if (!c.reserved) job.ship.cargo[job.slot] = null; }
    job.stage = "toStore"; goTo(w, job.store.door[0], job.store.door[1]); if (selected === job.ship) refreshShip(job.ship);
  }
  else if (job.stage === "toStore") { job.stage = "drop"; w.t = 0; }
  else if (job.stage === "drop" && w.t > 0.45) {
    const st = job.store; st.items[w.carry] = (st.items[w.carry] || 0) + 1; st.incoming = Math.max(0, st.incoming - 1); st.bump = 0.3;
    w.carry = null; w.job = null; renderStores();
  }
}

// ---- input: pan / zoom the map, select ships, drag cargo ----
let VW = 0, VH = 0, DPR = 1, zoom = 1, cam = { x: MW * T / 2, y: MH * T / 2 }, selected = null, hoverShip = null;
const keys = {};
addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "Escape") select(null); });
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
const toWorld = (sx, sy) => ({ x: (sx - VW / 2) / zoom + cam.x, y: (sy - VH / 2) / zoom + cam.y });
function shipAt(wx, wy) { for (let k = ships.length - 1; k >= 0; k--) { const s = ships[k], r = 44 * (1 + s.alt * 0.5); if (Math.abs(wx - s.x) < r && Math.abs(wy - s.y) < r) return s; } return null; }
function storeAt(wx, wy) { const i = Math.floor(wx / T), j = Math.floor(wy / T); return STORES.find((s) => i >= s.x && i < s.x + s.w && j >= s.y && j < s.y + s.h) || null; }
const pts = new Map(); let gesture = null;
cv.addEventListener("contextmenu", (e) => e.preventDefault());
cv.addEventListener("pointerdown", (e) => {
  try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()]; gesture = { pinch: hyp(a.x - b.x, a.y - b.y), zoom, moved: true }; return; }
  gesture = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
});
cv.addEventListener("pointermove", (e) => {
  const w = toWorld(e.clientX, e.clientY); hoverShip = shipAt(w.x, w.y);
  if (!pts.has(e.pointerId) || !gesture) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture.pinch && pts.size === 2) { const [a, b] = [...pts.values()]; setZoom(gesture.zoom * hyp(a.x - b.x, a.y - b.y) / gesture.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
  if (gesture.pinch) return;
  const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy; if (hyp(dx, dy) > 6) gesture.moved = true;
  if (gesture.moved) { cam.x = gesture.cx - dx / zoom; cam.y = gesture.cy - dy / zoom; }
});
cv.addEventListener("pointerup", (e) => {
  pts.delete(e.pointerId);
  if (gesture && !gesture.moved && !gesture.pinch) { const w = toWorld(e.clientX, e.clientY), s = shipAt(w.x, w.y), st = storeAt(w.x, w.y); if (s) select(s); else if (st) flashStore(st); else select(null); }
  if (!pts.size) gesture = null;
});
cv.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });
function setZoom(z, sx, sy) { const before = toWorld(sx, sy); zoom = clamp(z, 0.5, 3); const after = toWorld(sx, sy); cam.x += before.x - after.x; cam.y += before.y - after.y; }

// ---- the ship panel ----
function select(s) { selected = s; $("ship").hidden = !s; if (s) refreshShip(s); }
$("ship-close").onclick = () => select(null);
$("depart").onclick = () => selected && takeOff(selected);
function refreshShip(s) {
  if (s !== selected) return;
  $("ship-name").textContent = s.name; $("ship-status").textContent = STATUS[s.state] + " · Pad " + String.fromCharCode(65 + s.pad.id);
  $("depart").disabled = s.state !== "landed";
  const box = $("cargo"); box.innerHTML = "";
  s.cargo.forEach((c, k) => {
    const d = document.createElement("div"); d.className = "slot"; d.dataset.slot = k;
    if (c) {
      d.appendChild(iconEl(c.type)); d.title = ITEMS[c.type].name;
      const n = document.createElement("b"); n.textContent = c.count; d.appendChild(n);
      if (c.count > 0) d.classList.add("has"); else d.classList.add("done");
      if (c.to && c.count > 0) { const t = document.createElement("i"); t.textContent = c.to.id + 1; t.style.background = c.to.color; d.appendChild(t); if (room(c.to) <= 0 && c.count - c.reserved > 0) d.classList.add("full"); }
    }
    box.appendChild(d);
  });
}
// ---- the storage strip ----
function renderStores() {
  const box = $("stores");
  if (!box.children.length) for (const st of STORES) {
    const d = document.createElement("div"); d.className = "store"; d.dataset.store = st.id;
    d.innerHTML = `<div class="top"><span class="name" style="color:${st.color}">${st.name}</span><span class="tag fill"></span></div><div class="bar"><i style="background:${st.color}"></i></div><div class="grid"></div>`;
    d.onclick = () => { cam.x = (st.x + st.w / 2) * T; cam.y = (st.y + st.h / 2) * T; };
    box.appendChild(d);
  }
  STORES.forEach((st, k) => {
    const d = box.children[k], u = used(st);
    d.querySelector(".fill").textContent = u + "/" + st.cap; d.querySelector(".bar i").style.width = (100 * u / st.cap) + "%";
    const gr = d.querySelector(".grid"), types = Object.keys(st.items).filter((t) => st.items[t] > 0); gr.innerHTML = "";
    for (let q = 0; q < 8; q++) { const s2 = document.createElement("div"); s2.className = "slot"; const t = types[q]; if (t) { s2.appendChild(iconEl(t)); s2.title = ITEMS[t].name; const n = document.createElement("b"); n.textContent = st.items[t]; s2.appendChild(n); } gr.appendChild(s2); }
  });
  if (selected) refreshShip(selected);
}
function flashStore(st) { const d = $("stores").children[st.id]; d.classList.add("flash"); setTimeout(() => d.classList.remove("flash"), 500); }

// drag a cargo stack: onto a storage card or a storage unit on the map to send it there, onto another slot to move it
let drag = null;
$("cargo").addEventListener("pointerdown", (e) => {
  const el = e.target.closest(".slot"); if (!el || !selected || selected.state !== "landed") return;
  const k = +el.dataset.slot, c = selected.cargo[k]; if (!c || c.count <= 0) return;
  e.preventDefault(); drag = { ship: selected, slot: k, el, id: e.pointerId };
  const gh = $("ghost"); gh.innerHTML = ""; gh.appendChild(iconEl(c.type)); const n = document.createElement("b"); n.textContent = c.count; gh.appendChild(n);
  gh.hidden = false; gh.style.left = e.clientX + "px"; gh.style.top = e.clientY + "px"; el.style.opacity = 0.4;
});
addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const gh = $("ghost"); gh.style.left = e.clientX + "px"; gh.style.top = e.clientY + "px";
  document.querySelectorAll(".over").forEach((o) => o.classList.remove("over"));
  const t = dropTarget(e.clientX, e.clientY); if (t && t.el) t.el.classList.add("over"); dragHover = t && t.store ? t.store : null;
});
let dragHover = null;
addEventListener("pointerup", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const t = dropTarget(e.clientX, e.clientY), s = drag.ship, c = s.cargo[drag.slot];
  if (t && c && s.state === "landed") {
    if (t.store) { c.to = t.store; flashStore(t.store); }
    else if (t.slot !== undefined && t.slot !== drag.slot && c.reserved === 0) { const o = s.cargo[t.slot]; if (!o || o.reserved === 0) { s.cargo[t.slot] = c; s.cargo[drag.slot] = o; } }
  }
  document.querySelectorAll(".over").forEach((o) => o.classList.remove("over"));
  $("ghost").hidden = true; drag.el.style.opacity = ""; drag = null; dragHover = null; refreshShip(s);
});
function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y); if (!el) return null;
  const card = el.closest(".store"); if (card) return { store: STORES[+card.dataset.store], el: card };
  const slot = el.closest("#cargo .slot"); if (slot) return { slot: +slot.dataset.slot, el: slot };
  if (el === cv) { const w = toWorld(x, y), st = storeAt(w.x, w.y); if (st) return { store: st, el: $("stores").children[st.id] }; }
  return null;
}

// ---- drawing ----
function drawShip(s) {
  const sc = 1 + s.alt * 0.5, off = s.alt * 46;
  ctx.save(); ctx.translate(s.x + off, s.y + off); ctx.rotate(s.a + Math.PI / 2); ctx.globalAlpha = 0.35 - s.alt * 0.15; ctx.filter = "brightness(0)";
  ctx.drawImage(s.sprite, -48 * sc, -48 * sc, 96 * sc, 96 * sc); ctx.restore(); ctx.filter = "none";
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a + Math.PI / 2);
  if (s.state !== "landed") { const f = 0.6 + 0.4 * rnd(); ctx.fillStyle = `rgba(140,200,255,${0.7 * f})`; ctx.fillRect(-10 * sc, 42 * sc, 8 * sc, (8 + 10 * f) * sc); ctx.fillRect(2 * sc, 42 * sc, 8 * sc, (8 + 10 * f) * sc); ctx.fillStyle = `rgba(255,255,255,${0.8 * f})`; ctx.fillRect(-8 * sc, 42 * sc, 4 * sc, 6 * sc); ctx.fillRect(4 * sc, 42 * sc, 4 * sc, 6 * sc); }
  ctx.drawImage(s.sprite, -48 * sc, -48 * sc, 96 * sc, 96 * sc);
  ctx.restore();
  if (s === selected || s === hoverShip) { const r = 50 * sc; ctx.strokeStyle = s === selected ? "#f2a93b" : "rgba(242,169,59,.5)"; ctx.lineWidth = 2 / zoom; const k = 12; for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(s.x + qx * r, s.y + qy * (r - k)); ctx.lineTo(s.x + qx * r, s.y + qy * r); ctx.lineTo(s.x + qx * (r - k), s.y + qy * r); ctx.stroke(); } }
}
function drawWorker(w) {
  const x = Math.round(w.x), y = Math.round(w.y), walking = w.path.length > 0, bob = walking ? Math.round(Math.sin(w.step) * 1) : 0, legs = walking ? Math.round(Math.sin(w.step) * 2) : 0;
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x - 6, y + 9, 12, 3);
  ctx.fillStyle = "#2a2e36"; ctx.fillRect(x - 4, y + 4 + bob, 3, 6 + legs); ctx.fillRect(x + 1, y + 4 + bob, 3, 6 - legs);
  ctx.fillStyle = w.suit; ctx.fillRect(x - 5, y - 5 + bob, 10, 10);
  ctx.fillStyle = "#e8b48a"; ctx.fillRect(x - 4, y - 13 + bob, 8, 8);
  ctx.fillStyle = "#3a2a1a"; ctx.fillRect(x - 4, y - 14 + bob, 8, 3);
  ctx.fillStyle = "#1a1a1a"; ctx.fillRect(x + (w.dir > 0 ? 1 : -3), y - 10 + bob, 2, 2);
  if (w.carry) { ctx.drawImage(ICON[w.carry], x - 8, y - 32 + bob, 16, 16); ctx.fillStyle = "#e8b48a"; ctx.fillRect(x - 6, y - 18 + bob, 2, 4); ctx.fillRect(x + 4, y - 18 + bob, 2, 4); }
  else if (w.job && (w.job.stage === "pick" || w.job.stage === "drop")) { ctx.fillStyle = "#f2a93b"; ctx.fillRect(x - 7, y - 20 + bob, Math.round(14 * Math.min(1, w.t / 0.45)), 2); }
}
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0b0d10"; ctx.fillRect(0, 0, VW, VH);
  ctx.setTransform(DPR * zoom, 0, 0, DPR * zoom, Math.round(DPR * (VW / 2 - cam.x * zoom)), Math.round(DPR * (VH / 2 - cam.y * zoom)));
  ctx.drawImage(GROUND, 0, 0);
  // storage fill on the roofs, and the drop highlight
  for (const st of STORES) {
    const x = st.x * T, y = st.y * T, u = used(st), f = u / st.cap;
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(x + 10, y + st.h * T - 14, st.w * T - 20, 6); ctx.fillStyle = f >= 1 ? "#ff5a4a" : "#ece7dc"; ctx.fillRect(x + 10, y + st.h * T - 14, Math.round((st.w * T - 20) * f), 6);
    if (st.bump > 0) { ctx.fillStyle = `rgba(255,255,255,${st.bump})`; ctx.fillRect(x, y, st.w * T, st.h * T); }
    if (dragHover === st) { ctx.strokeStyle = "#f2a93b"; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, st.w * T - 3, st.h * T - 3); }
  }
  // landing guidance: a pad lights while a ship is inbound
  for (const p of PADS) if (p.ship && p.ship.state !== "landed") { ctx.strokeStyle = `rgba(127,216,138,${0.4 + 0.4 * Math.sin(clock * 6)})`; ctx.lineWidth = 3; ctx.strokeRect(p.x * T + 6, p.y * T + 6, p.w * T - 12, p.h * T - 12); }
  // landed ships under the workers; ships in the air over everything
  for (const s of ships) if (s.alt === 0) drawShip(s);
  for (const w of [...workers].sort((a, b) => a.y - b.y)) drawWorker(w);
  for (const s of ships) if (s.alt > 0) drawShip(s);
}

// ---- loop ----
let clock = 0, last = performance.now();
function step(dt) {
  clock += dt;
  const pan = 420 / zoom * dt; if (keys.KeyW || keys.ArrowUp) cam.y -= pan; if (keys.KeyS || keys.ArrowDown) cam.y += pan; if (keys.KeyA || keys.ArrowLeft) cam.x -= pan; if (keys.KeyD || keys.ArrowRight) cam.x += pan;
  cam.x = clamp(cam.x, 0, MW * T); cam.y = clamp(cam.y, -200, MH * T);
  for (const p of PADS) if (!p.ship) { p.wait -= dt; if (p.wait <= 0) newShip(p); }
  for (const s of [...ships]) shipStep(s, dt);
  for (const w of workers) workerStep(w, dt);
  for (const st of STORES) st.bump = Math.max(0, (st.bump || 0) - dt);
  if (selected) { const el = $("ship-status"), txt = STATUS[selected.state] + " · Pad " + String.fromCharCode(65 + selected.pad.id); if (el.textContent !== txt) refreshShip(selected); }
}
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); draw(); requestAnimationFrame(frame); }
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight; cv.width = VW * DPR; cv.height = VH * DPR;
  zoom = clamp(Math.min(VW / (MW * T), (VH - 140) / (MH * T)) * 1.05, 0.5, 3);
}
addEventListener("resize", resize); resize();
buildGround(); renderStores();
if (document.fonts && document.fonts.load) document.fonts.load("800 30px 'Big Shoulders Display'").then(buildGround).catch(() => {});
requestAnimationFrame(frame);
window.Atamus = { get state() { return { ships, workers, stores: STORES, pads: PADS, selected, served }; }, step, select, takeOff };
})();
