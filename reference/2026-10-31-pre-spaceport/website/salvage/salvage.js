// Salvage (owner, 2026-10-21): an isometric pixel-art sandbox. Your little salvage tug is docked to a derelict; one
// salvager (Branko — the owner's sprite) walks over, takes it apart with hands, screwdriver, saw, blowtorch, cutters
// and charges, and hauls the parts back to the sell pad. Things are wired, bolted, pressurized and powered together, so
// the order you do things in matters. Placeholder art for everything but Branko. Rules in docs/SALVAGE.md.
"use strict";
(() => {
const $ = (id) => document.getElementById(id);
const cv = $("view"), ctx = cv.getContext("2d");
const L = document.createElement("canvas"), g = L.getContext("2d");
const TAU = Math.PI * 2, rnd = Math.random, hyp = Math.hypot, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const TW = 24, TH = 12, WALLH = 15;

// ---- the map: your ship (left), the docking tube, the derelict (right) ----
// ' ' space · S ship wall · , ship floor · $ sell pad · = docking tube · A your airlock
// # derelict bulkhead · . derelict deck · D derelict door · X hull breach · r rubble (a cut-away wall)
const MAP = [
  "                                    ",
  "  SSSSSSS      ###############      ",
  "  S,,,,,S      #.....#.......#      ",
  "  S,$$$,S      #.....#.......#####  ",
  "  S,$$$,SSSSSSS#.....D.......#...#  ",
  "  S,,,,,A======D.....#.......D...X  ",
  "  S,,,,,SSSSSSS#.....#.......#...#  ",
  "  S,,,,,S      ##D########D###...#  ",
  "  SSSSSSS      #.......#.....#####  ",
  "               #.......#.....#      ",
  "               #.......D.....#      ",
  "               #.......#.....#      ",
  "               ###############      ",
  "                                    ",
];
const SPAWN = { x: 5.5, y: 6.3 };
const FLOOR = new Set([",", "$", "=", ".", "r"]);
const isFloor = (c) => FLOOR.has(c);
const isShipTile = (c) => c === "," || c === "$" || c === "=";

// ---- loot ----
const ITEMS = {
  scrap: { name: "Scrap metal", value: 10 }, wire: { name: "Copper wiring", value: 45 }, core: { name: "Data core", value: 260 },
  corrupt: { name: "Corrupted core", value: 60 }, elec: { name: "Electronics", value: 35 }, strap: { name: "Cargo strap", value: 5 },
  panel: { name: "Wall panel", value: 25, big: true }, plate: { name: "Hull plate", value: 90, big: true }, tank: { name: "O₂ tank", value: 70, big: true },
  barrel: { name: "Fuel barrel", value: 110, big: true }, crate: { name: "Cargo crate", value: 20, big: true }, cell: { name: "Fuel cell", value: 450, big: true },
  pipe: { name: "Coolant pipe", value: 55, big: true }, pipecut: { name: "Cut pipe", value: 30, big: true }, slab: { name: "Door slab", value: 65, big: true },
};
// pixel icons, 12 x 10: [x, y, w, h, color]
const ICONS = {
  scrap: [[2, 4, 8, 4, "#6d737c"], [3, 2, 4, 2, "#9aa1aa"], [6, 3, 3, 1, "#b8bec6"], [1, 7, 4, 2, "#50555d"], [8, 7, 3, 1, "#50555d"]],
  wire: [[1, 3, 10, 1, "#d9822b"], [1, 5, 10, 1, "#b8601a"], [1, 7, 10, 1, "#e89a4a"], [1, 3, 1, 5, "#8a4a14"], [10, 3, 1, 5, "#8a4a14"]],
  core: [[3, 2, 6, 6, "#2a3a4a"], [4, 3, 4, 4, "#7fe8ff"], [2, 3, 1, 1, "#aab"], [2, 6, 1, 1, "#aab"], [9, 3, 1, 1, "#aab"], [9, 6, 1, 1, "#aab"], [5, 4, 2, 2, "#e8fbff"]],
  corrupt: [[3, 2, 6, 6, "#2a2a3a"], [4, 3, 4, 4, "#8a5aa8"], [4, 3, 1, 1, "#ff4a4a"], [7, 6, 1, 1, "#ff4a4a"], [5, 4, 2, 2, "#ff6a6a"]],
  elec: [[1, 2, 10, 7, "#2f7a3a"], [2, 3, 3, 2, "#1a1a1a"], [6, 4, 4, 3, "#1a1a1a"], [2, 7, 2, 1, "#e0c060"], [5, 3, 1, 1, "#e0c060"]],
  strap: [[1, 4, 10, 2, "#e07a1a"], [5, 3, 2, 4, "#9aa1aa"]],
  panel: [[1, 1, 10, 8, "#8e959e"], [2, 2, 8, 6, "#a6adb6"], [2, 2, 1, 1, "#555"], [9, 2, 1, 1, "#555"], [2, 7, 1, 1, "#555"], [9, 7, 1, 1, "#555"]],
  plate: [[0, 1, 12, 8, "#4f5b6c"], [1, 2, 10, 6, "#66748a"], [1, 2, 1, 1, "#2a313c"], [10, 2, 1, 1, "#2a313c"], [1, 7, 1, 1, "#2a313c"], [10, 7, 1, 1, "#2a313c"], [5, 4, 2, 2, "#2a313c"]],
  tank: [[4, 0, 4, 10, "#d8e2ec"], [4, 3, 4, 2, "#3a7ad0"], [5, 0, 2, 1, "#888"], [4, 9, 4, 1, "#9aa6b4"]],
  barrel: [[3, 1, 6, 9, "#b83a2a"], [3, 3, 6, 1, "#1a1a1a"], [3, 7, 6, 1, "#1a1a1a"], [4, 4, 4, 2, "#f0c040"], [4, 1, 4, 1, "#d85a4a"]],
  crate: [[1, 2, 10, 7, "#8a5a2a"], [1, 2, 10, 1, "#b07a3a"], [1, 5, 10, 1, "#6a4420"], [5, 2, 2, 7, "#6a4420"]],
  cell: [[4, 0, 4, 10, "#3a4a3a"], [5, 1, 2, 8, "#7aff6a"], [4, 0, 4, 1, "#9aa"], [4, 9, 4, 1, "#9aa"]],
  pipe: [[0, 4, 12, 3, "#3a8a5a"], [0, 4, 12, 1, "#5ab07a"], [3, 3, 1, 5, "#9aa1aa"], [8, 3, 1, 5, "#9aa1aa"]],
  pipecut: [[0, 4, 11, 3, "#3a8a5a"], [0, 4, 11, 1, "#5ab07a"], [10, 3, 2, 1, "#5ab07a"], [11, 6, 1, 2, "#3a8a5a"]],
  slab: [[1, 0, 10, 10, "#c9a227"], [1, 2, 10, 1, "#1a1a1a"], [1, 5, 10, 1, "#1a1a1a"], [1, 8, 10, 1, "#1a1a1a"]],
};
const TOOLS = [
  { k: "hands", name: "Hands", icon: [[3, 3, 6, 6, "#e8b48a"], [3, 1, 1, 3, "#e8b48a"], [5, 0, 1, 4, "#e8b48a"], [7, 1, 1, 3, "#e8b48a"], [9, 4, 2, 2, "#e8b48a"], [3, 8, 6, 2, "#f08a24"]] },
  { k: "screw", name: "Screwdriver", icon: [[1, 8, 4, 2, "#f0c040"], [2, 7, 3, 1, "#f0c040"], [4, 5, 2, 2, "#c0c6cc"], [6, 3, 2, 2, "#c0c6cc"], [8, 1, 2, 2, "#e8eef4"]] },
  { k: "saw", name: "Saw", icon: [[0, 3, 4, 4, "#2a7ad0"], [4, 4, 8, 3, "#c0c6cc"], [4, 7, 1, 1, "#c0c6cc"], [6, 7, 1, 1, "#c0c6cc"], [8, 7, 1, 1, "#c0c6cc"], [10, 7, 1, 1, "#c0c6cc"]] },
  { k: "torch", name: "Blowtorch", icon: [[1, 4, 6, 4, "#d84a2a"], [2, 3, 4, 1, "#888"], [7, 5, 2, 2, "#c0c6cc"], [9, 5, 2, 2, "#7fd8ff"], [11, 5, 1, 2, "#e8fbff"]] },
  { k: "cutters", name: "Cutters", icon: [[1, 7, 2, 3, "#d84a2a"], [5, 7, 2, 3, "#d84a2a"], [2, 4, 2, 3, "#c0c6cc"], [4, 4, 2, 3, "#c0c6cc"], [3, 1, 2, 3, "#e8eef4"]] },
  { k: "charge", name: "Charges", icon: [[2, 3, 8, 6, "#a83a2a"], [3, 4, 6, 4, "#d8c8a0"], [5, 1, 2, 2, "#555"], [8, 3, 2, 1, "#ff3a3a"]] },
];
function drawPix(c, list, x, y, s) { for (const [px, py, w, h, col] of list) { c.fillStyle = col; c.fillRect(x + px * (s || 1), y + py * (s || 1), w * (s || 1), h * (s || 1)); } }

// ---- sound: synthesized ----
let AC = null, master = null, NOISE = null, muted = false;
function audioOn() { if (AC) { if (AC.state === "suspended") AC.resume(); return; } try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = 0.35; master.connect(AC.destination); } catch (e) { AC = null; } }
function tone(f0, f1, dur, type, vol, delay) {
  if (!AC || muted) return; const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), gn = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(gn); gn.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq, hp) {
  if (!AC || muted) return;
  if (!NOISE) { NOISE = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
  const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain();
  s.buffer = NOISE; f.type = hp ? "highpass" : "lowpass"; f.frequency.setValueAtTime(freq, t); if (!hp) f.frequency.exponentialRampToValueAtTime(60, t + dur);
  gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur); s.connect(f); f.connect(gn); gn.connect(master); s.start(t); s.stop(t + dur);
}
const lastS = {};
function sfx(k, a) {
  const now = performance.now(), gap = { saw: 90, torch: 110, screw: 260, crank: 300, hiss: 200, wind: 250, geiger: 60, step: 0, beep: 0, spark: 120 }[k];
  if (gap !== undefined && lastS[k] && now - lastS[k] < gap) return; lastS[k] = now;
  switch (k) {
    case "screw": tone(1800, 1400, 0.04, "square", 0.04); tone(1500, 1200, 0.04, "square", 0.03, 0.08); break;
    case "saw": noise(0.09, 0.08, 2600, true); tone(220 + rnd() * 40, 180, 0.08, "sawtooth", 0.03); break;
    case "torch": noise(0.12, 0.06, 1500, true); break;
    case "snip": tone(2400, 900, 0.05, "square", 0.06); break;
    case "crank": tone(140, 120, 0.12, "square", 0.04); noise(0.08, 0.05, 600); break;
    case "pick": tone(500, 760, 0.06, "sine", 0.06); break;
    case "drop": tone(260, 140, 0.08, "triangle", 0.08); break;
    case "door": noise(0.35, 0.08, 900); tone(160, 90, 0.3, "triangle", 0.06); break;
    case "sell": tone(880, 880, 0.08, "square", 0.04); tone(1320, 1320, 0.14, "square", 0.04, 0.09); break;
    case "boom": noise(a ? 1.6 : 0.8, a ? 0.6 : 0.4, a ? 700 : 1500); tone(a ? 70 : 120, 28, a ? 1.2 : 0.6, "sine", a ? 0.45 : 0.3); break;
    case "zap": noise(0.25, 0.25, 3000, true); tone(90, 60, 0.25, "sawtooth", 0.15); break;
    case "spark": noise(0.05, 0.05, 4000, true); break;
    case "hiss": noise(0.3, 0.05, 2500, true); break;
    case "steam": noise(0.9, 0.18, 3000, true); break;
    case "wind": noise(0.3, 0.07, 500); break;
    case "geiger": noise(0.012, 0.12, 3000, true); break;
    case "beep": tone(1600, 1600, 0.06, "square", 0.05); break;
    case "alarm": tone(500, 800, 0.3, "square", 0.05); tone(500, 800, 0.3, "square", 0.05, 0.38); break;
    case "hurt": tone(300, 120, 0.15, "square", 0.06); break;
    case "power": tone(a ? 60 : 300, a ? 300 : 50, 0.6, "sawtooth", 0.06); break;
    case "pry": noise(0.15, 0.08, 1200); tone(400, 200, 0.12, "triangle", 0.05); break;
  }
}

// ---- world state ----
let T, MW, MH, parts, items, fires, puddles, scorch, clouds, charges, later, parts_id = 0, rooms, roomOf, pT, P, credits = 0, sold = 0;
let fx = [], shake = 0, flash = 0, cam = { x: 0, y: 0 }, clock = 0;
const key = (i, j) => i + "," + j;
function part(kind, i, j, props) { return Object.assign({ id: ++parts_id, kind, i, j, w: 1, d: 1, x: i + 0.5, y: j + 0.5, solid: true, wall: null }, props || {}); }
function contents() { const n = 2 + Math.floor(rnd() * 2), out = []; for (let k = 0; k < n; k++) out.push(rnd() < 0.12 ? "core" : pick(["elec", "elec", "wire", "scrap"])); return out; }
function makeWorld() {
  T = MAP.map((r) => r.split("")); MH = T.length; MW = T[0].length;
  parts = []; items = []; fires = new Map(); puddles = new Set(); scorch = new Map(); clouds = []; charges = []; later = []; fx = [];
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    if (T[j][i] === "D") parts.push(part("door", i, j, { open: false, broken: false, solid: false }));
    if (T[j][i] === "A") parts.push(part("airlock", i, j, { open: false, solid: false }));
  }
  // entry corridor
  parts.push(part("crate", 16, 2, { straps: 2, open: false, loot: contents() }));
  parts.push(part("panel", 18, 2, { wall: "n", screws: 4, off: false, solid: false }));
  items.push(item("scrap", 19.3, 5.2));
  // bridge
  parts.push(part("terminal", 24, 2, { wall: "n", screws: 4, open: false, core: true, cables: true }));
  parts.push(part("terminal", 26, 2, { wall: "n", screws: 4, open: false, core: true, cables: true }));
  parts.push(part("panel", 22, 3, { wall: "w", screws: 4, off: false, solid: false }));
  items.push(item("elec", 27.4, 5.4)); items.push(item("scrap", 23.5, 5.6));
  // the breached closet (already in vacuum)
  parts.push(part("breaker", 30, 4, { wall: "n", on: true, broken: false }));
  parts.push(part("crate", 32, 7, { straps: 0, open: false, loot: ["core", "elec"] }));
  // engineering
  parts.push(part("reactor", 18, 9, { w: 2, d: 2, x: 19, y: 10, active: true, hot: 0, bolts: 4, open: false, cell: true }));
  parts.push(part("console", 16, 8, {}));
  parts.push(part("pipe", 21, 8, { wall: "n", clamps: 2, solid: false }));
  parts.push(part("pipe", 22, 8, { wall: "n", clamps: 2, solid: false }));
  items.push(item("scrap", 16.6, 11.3));
  // storage
  parts.push(part("tank", 24, 8, { pressurized: true }));
  parts.push(part("tank", 25, 8, { pressurized: true }));
  parts.push(part("barrel", 27, 8, { full: true }));
  parts.push(part("barrel", 28, 8, { full: true }));
  parts.push(part("barrel", 28, 9, { full: true }));
  parts.push(part("crate", 25, 11, { straps: 2, open: false, loot: contents() }));
  parts.push(part("crate", 27, 11, { straps: 2, open: false, loot: contents() }));
  // air: everything holds pressure except the breached closet
  pT = T.map((r, j) => r.map((c, i) => (isFloor(c) || c === "X" ? (i >= 30 && j >= 4 && j <= 7 ? 0 : 1) : 0)));
  recomputeRooms();
}
function item(type, x, y, extra) { return Object.assign({ type, x, y, vx: 0, vy: 0, padT: 0 }, extra || {}); }
function itemValue(it) { let v = ITEMS[it.type].value; if (it.loot) for (const l of it.loot) v += ITEMS[l].value; return v; }
function newPlayer() { return { x: SPAWN.x, y: SPAWN.y, wx: 0, wy: 0, dir: 0, anim: "idle", animT: 0, hp: 100, o2: 100, stun: 0, carry: null, pack: [], dead: 0, path: null, hurtT: 0 }; }

// ---- rooms and air ----
function recomputeRooms() {
  roomOf = T.map((r) => r.map(() => -1)); rooms = [];
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const c = T[j][i]; if (roomOf[j][i] >= 0 || !(isFloor(c) || c === "X")) continue;
    const id = rooms.length, room = { id, tiles: [], breaches: [], ship: false, p: 0 }; rooms.push(room);
    const st = [[i, j]]; roomOf[j][i] = id;
    while (st.length) {
      const [a, b] = st.pop(); room.tiles.push([a, b]); const ch = T[b][a];
      if (ch === "X") room.breaches.push([a, b]); if (isShipTile(ch)) room.ship = true;
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const na = a + da, nb = b + db; if (na < 0 || nb < 0 || na >= MW || nb >= MH) continue; const nc = T[nb][na]; if (roomOf[nb][na] < 0 && (isFloor(nc) || nc === "X")) { roomOf[nb][na] = id; st.push([na, nb]); } }
    }
    let s = 0, n = 0; for (const [a, b] of room.tiles) { if (pT[b][a] !== undefined) { s += pT[b][a]; n++; } } room.p = n ? s / n : 0;
  }
  for (const p of parts) if (p.kind === "door" || p.kind === "airlock") { const ids = new Set(); for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const r = roomOf[p.j + db] && roomOf[p.j + db][p.i + da]; if (r >= 0) ids.add(r); } p.rooms = [...ids]; }
}
let groups = [];
function updateAir(dt) {
  const parent = rooms.map((r, i) => i), find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  for (const p of parts) if ((p.kind === "door" || p.kind === "airlock") && (p.open || p.broken) && p.rooms.length === 2) parent[find(p.rooms[0])] = find(p.rooms[1]);
  const G = new Map();
  for (const r of rooms) { const k = find(r.id); if (!G.has(k)) G.set(k, { rooms: [], n: 0, s: 0, breaches: [], ship: false }); const gr = G.get(k); gr.rooms.push(r); gr.n += r.tiles.length; gr.s += r.p * r.tiles.length; gr.breaches.push(...r.breaches); if (r.ship) gr.ship = true; }
  groups = [];
  for (const gr of G.values()) {
    let p = gr.s / gr.n;
    if (gr.breaches.length) p = Math.max(0, p - (p + 0.03) * dt * Math.min(3, gr.breaches.length) * 2.6 / Math.sqrt(gr.n));
    else if (gr.ship) p = Math.min(1, p + 0.12 * dt);
    gr.p = p; gr.wind = gr.breaches.length && p > 0.03 ? p : 0;
    for (const r of gr.rooms) { r.p = p; r.g = gr; for (const [a, b] of r.tiles) pT[b][a] = p; }
    groups.push(gr);
  }
}
function roomAt(x, y) { const i = Math.floor(x), j = Math.floor(y); const r = roomOf[j] && roomOf[j][i]; return r >= 0 ? rooms[r] : null; }
function airAt(x, y) { const r = roomAt(x, y); return r ? r.p : 0; }
function windAt(x, y) {
  const r = roomAt(x, y); if (!r || !r.g || !r.g.wind) return null;
  let best = null, bd = 1e9; for (const [a, b] of r.g.breaches) { const d = hyp(a + 0.5 - x, b + 0.5 - y); if (d < bd) { bd = d; best = [a + 0.5, b + 0.5]; } }
  return best ? { x: best[0], y: best[1], d: bd, s: r.g.wind } : null;
}

// ---- power: the reactor runs, the breaker is closed ----
function reactor() { return parts.find((p) => p.kind === "reactor"); }
function powered() { const r = reactor(), b = parts.find((p) => p.kind === "breaker"); return !!(r && r.active && b && b.on && !b.broken); }
function hot() { const r = reactor(); return !!(r && (r.active || r.hot > 0)); }

// ---- tiles ----
const tileAt = (i, j) => (i < 0 || j < 0 || i >= MW || j >= MH ? " " : T[j][i]);
function partsAt(i, j) { return parts.filter((p) => i >= p.i && i < p.i + p.w && j >= p.j && j < p.j + p.d); }
function blocked(i, j) {
  const c = tileAt(i, j);
  if (c === "D" || c === "A") { const d = partsAt(i, j).find((p) => p.kind === "door" || p.kind === "airlock"); return !(d && (d.open || d.broken)); }
  if (!isFloor(c)) return true;
  return parts.some((p) => p.solid && i >= p.i && i < p.i + p.w && j >= p.j && j < p.j + p.d);
}
function blockedAt(x, y, r) { for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (blocked(Math.floor(x + dx), Math.floor(y + dy))) return true; return false; }
function isOuter(i, j) { for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (tileAt(i + a, j + b) === " ") return true; return false; }

// ---- effects ----
function feed(t, col) { const d = document.createElement("div"); d.textContent = t; d.style.color = col || "#ece6d8"; const f = $("feed"); f.prepend(d); while (f.children.length > 7) f.lastChild.remove(); setTimeout(() => d.remove(), 6200); }
function puff(x, y, z, c, n, sp, life, grav) { for (let k = 0; k < n; k++) { const a = rnd() * TAU, s = rnd() * (sp || 1); fx.push({ x, y, z: z || 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: (grav ? 20 + rnd() * 30 : (rnd() - 0.3) * 10), life: (life || 0.6) * (0.6 + rnd() * 0.6), max: life || 0.6, c, s: rnd() < 0.3 ? 2 : 1, grav: grav || 0 }); } }
function hurt(n, why, kx, ky) {
  if (P.dead) return; P.hp -= n; P.hurtT = 0.3; sfx("hurt"); flash = Math.max(flash, Math.min(0.6, n / 60));
  if (kx !== undefined) { const d = hyp(P.x - kx, P.y - ky) || 1; P.wx += (P.x - kx) / d * n * 0.12; P.wy += (P.y - ky) / d * n * 0.12; }
  if (why && n >= 10) feed(why, "#ff5a4a");
  if (P.hp <= 0) die();
}
function shock(n, x, y) { sfx("zap"); puff(x, y, 8, "#bfe6ff", 22, 2.5, 0.4); puff(x, y, 8, "#ffffff", 8, 1.5, 0.3); hurt(n, "Shocked — the line was live", x, y); P.stun = 0.9; shake = Math.max(shake, 4); }
function steam(x, y) { clouds.push({ x, y, t: 5 }); sfx("steam"); hurt(18, "Scalded — the coolant was hot", x, y); }
function die() {
  P.dead = 2.5; P.hp = 0; $("dead").hidden = false; sfx("alarm");
  if (P.carry) { dropItem(P.carry, P.x, P.y); P.carry = null; }
  for (const t of P.pack) dropItem(t, P.x + (rnd() - 0.5) * 0.6, P.y + (rnd() - 0.5) * 0.6); P.pack = []; renderInv();
}
function dropItem(it, x, y) { it.x = x; it.y = y; it.vx = 0; it.vy = 0; it.padT = 0; items.push(it); }
function ignite(i, j, t) { if (!isFloor(tileAt(i, j))) return; if (airAt(i + 0.5, j + 0.5) < 0.25) return; const k = key(i, j), f = fires.get(k); if (f) f.t = Math.max(f.t, t || 8); else fires.set(k, { i, j, t: t || 8 }); }
function explode(x, y, r, dmg) {
  sfx("boom", r > 3); shake = Math.max(shake, r * 4); flash = Math.max(flash, 0.35 + r * 0.08);
  fx.push({ ring: true, x, y, z: 4, r: 0, max: r, life: 0.5, maxl: 0.5 });
  puff(x, y, 6, "#fff3c0", 30, r * 2.2, 0.5); puff(x, y, 6, "#ffb347", 40, r * 1.8, 0.8); puff(x, y, 6, "#ff5a2a", 30, r * 1.4, 0.9); puff(x, y, 10, "#3a3a40", 25, r, 1.6);
  for (let k = 0; k < 12; k++) puff(x, y, 8, "#6a6058", 1, r * 2.5, 1.2, 160);
  const d = hyp(P.x - x, P.y - y); if (d < r + 0.5) hurt(dmg * (1 - d / (r + 0.5)), "Caught in the blast", x, y);
  for (let i = Math.floor(x - r); i <= x + r; i++) for (let j = Math.floor(y - r); j <= y + r; j++) {
    const dd = hyp(i + 0.5 - x, j + 0.5 - y); if (dd > r) continue;
    if (isFloor(tileAt(i, j)) || tileAt(i, j) === "X") scorch.set(key(i, j), Math.min(1, (scorch.get(key(i, j)) || 0) + 0.7 * (1 - dd / r)));
    if (dd < r * 0.6 && rnd() < 0.5) ignite(i, j, 5);
  }
  // walls close to the blast give way: hull to space, bulkheads to rubble
  let changed = false, holed = false;
  for (let i = Math.floor(x - r); i <= x + r; i++) for (let j = Math.floor(y - r); j <= y + r; j++) {
    if (tileAt(i, j) !== "#" || hyp(i + 0.5 - x, j + 0.5 - y) > r * 0.62) continue;
    T[j][i] = isOuter(i, j) ? "X" : "r"; if (T[j][i] === "X") holed = true; pT[j][i] = undefined; changed = true; puff(i + 0.5, j + 0.5, 8, "#8a7f74", 10, 2, 0.8, 120);
  }
  if (changed) { recomputeRooms(); feed(holed ? "The blast tore the hull open" : "The blast took out a bulkhead", "#ffb070"); }
  for (const p of [...parts]) { const pd = hyp(p.x - x, p.y - y) - Math.max(p.w, p.d) * 0.4; if (pd < r) blast(p, pd); }
  for (const it of [...items]) { const id = hyp(it.x - x, it.y - y); if (id < r * 0.7 && it.type !== "scrap") { it.type = "scrap"; delete it.loot; } if (id < r) { const a = Math.atan2(it.y - y, it.x - x); it.vx += Math.cos(a) * 4; it.vy += Math.sin(a) * 4; } }
}
function blast(p, d) {
  const rm = () => { const i = parts.indexOf(p); if (i >= 0) parts.splice(i, 1); };
  switch (p.kind) {
    case "tank": rm(); if (p.pressurized) later.push({ t: 0.15 + rnd() * 0.2, f: () => { feed("An O₂ tank went up", "#ff8a3a"); explode(p.x, p.y, 2, 45); } }); else items.push(item("scrap", p.x, p.y)); break;
    case "barrel": rm(); if (p.full) later.push({ t: 0.2 + rnd() * 0.2, f: () => barrelBoom(p) }); else items.push(item("scrap", p.x, p.y)); break;
    case "crate": rm(); for (const l of p.loot) items.push(item(rnd() < 0.6 ? "scrap" : l, p.x + (rnd() - 0.5), p.y + (rnd() - 0.5))); items.push(item("scrap", p.x, p.y)); break;
    case "panel": if (!p.off) { p.off = true; p.solid = false; items.push(item("scrap", p.x + 0.3, p.y + 0.3)); } if (d < 1 && !p.wireGone) { p.wireGone = true; } break;
    case "terminal": rm(); items.push(item("elec", p.x, p.y + 0.4)); if (p.core) feed("A data core went with the terminal", "#ff8a3a"); break;
    case "reactor": if (p.active || p.hot > 0) { if (!p.melting) { p.melting = true; later.push({ t: 0.6, f: () => meltdown(p) }); } } else { rm(); items.push(item("scrap", p.x, p.y + 1), item("scrap", p.x + 1, p.y)); if (p.cell) items.push(item("cell", p.x + 0.4, p.y + 0.8)); } break;
    case "console": case "breaker": rm(); items.push(item("scrap", p.x, p.y + 0.3)); if (p.kind === "breaker") { sfx("power", false); feed("The breaker's gone — the derelict is dark", "#ffb070"); } break;
    case "pipe": rm(); items.push(item("pipecut", p.x, p.y + 0.4)); if (hot()) { clouds.push({ x: p.x, y: p.y, t: 5 }); sfx("steam"); } break;
    case "door": if (!p.broken) { p.broken = true; p.open = true; puff(p.x, p.y, 8, "#c9a227", 12, 2, 0.8, 120); } break;
  }
}
function barrelBoom(p) { feed("A fuel barrel went up", "#ff8a3a"); explode(p.x, p.y, 2.4, 60); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { puddles.add(key(Math.floor(p.x) + a, Math.floor(p.y) + b)); ignite(Math.floor(p.x) + a, Math.floor(p.y) + b, 12); } }
function meltdown(p) {
  const i = parts.indexOf(p); if (i >= 0) parts.splice(i, 1);
  feed("REACTOR MELTDOWN", "#ff3a3a"); sfx("alarm");
  explode(p.x, p.y, 4.5, 170); for (let k = 0; k < 10; k++) { const a = rnd() * TAU, rr = 1 + rnd() * 2.5; ignite(Math.floor(p.x + Math.cos(a) * rr), Math.floor(p.y + Math.sin(a) * rr), 14); }
}
function placeCharge(t) { const c = targetPoint(t); charges.push({ x: c.x, y: c.y, t: 3, beep: 0 }); sfx("beep"); }

// ---- interaction: what each tool does to each thing ----
function targetPoint(t) { if (t.type === "part") return { x: t.p.x, y: t.p.y }; if (t.type === "item") return { x: t.it.x, y: t.it.y }; if (t.type === "wall") return { x: t.i + 0.5, y: t.j + 0.5 }; return { x: t.x, y: t.y }; }
function targetDist(t) {
  if (t.type === "part") { const p = t.p, cx2 = clamp(P.x, p.i, p.i + p.w), cy2 = clamp(P.y, p.j, p.j + p.d); return hyp(P.x - cx2, P.y - cy2); }
  if (t.type === "wall") { const cx2 = clamp(P.x, t.i, t.i + 1), cy2 = clamp(P.y, t.j, t.j + 1); return hyp(P.x - cx2, P.y - cy2); }
  const q = targetPoint(t); return hyp(P.x - q.x, P.y - q.y);
}
const REACH = 0.85;
function action(t, tool) {
  const B = (label) => ({ label, bad: true }), A = (label, time, run, fxk) => ({ label, time, run, fx: fxk || tool });
  if (!t) return null;
  if (P.carry && ITEMS[P.carry.type].big && tool !== "hands") return B("Hands full");
  if (t.type === "item") return tool === "hands" ? A("Pick up " + ITEMS[t.it.type].name, 0, () => pickUp(t.it)) : null;
  if (tool === "charge") {
    if (t.type === "wall" && tileAt(t.i, t.j) === "S") return B("Not on your own ship");
    if (t.type === "part" && t.p.kind === "airlock") return B("Not on your own ship");
    if (t.type === "floor" && isShipTile(tileAt(Math.floor(t.x), Math.floor(t.y)))) return B("Not on your own ship");
    return A("Place charge", 0.6, () => placeCharge(t), "none");
  }
  if (t.type === "floor") return null;
  if (t.type === "wall") {
    const c = tileAt(t.i, t.j);
    if (c === "S") return B("Your ship");
    if (c !== "#") return null;
    const outer = isOuter(t.i, t.j);
    if (tool === "torch") return outer ? A("Cut out hull plate", 5, () => cutWall(t.i, t.j, true)) : A("Cut through bulkhead", 6, () => cutWall(t.i, t.j, false));
    return B(outer ? "Hull plating" : "Bulkhead");
  }
  const p = t.p, pw = powered();
  switch (p.kind) {
    case "airlock": return tool === "hands" ? A(p.open ? "Close airlock" : "Open airlock", 0.3, () => { p.open = !p.open; sfx("door"); }, "none") : B("Your airlock");
    case "door":
      if (p.broken) return B("Broken door");
      if (tool === "hands") return pw ? A(p.open ? "Close door" : "Open door", 0.35, () => { p.open = !p.open; sfx("door"); }, "none") : A(p.open ? "Crank door shut" : "Crank door open", 3, () => { p.open = !p.open; sfx("door"); }, "crank");
      if (tool === "torch") return A("Cut through door", 5, () => { p.broken = true; p.open = true; items.push(item("slab", P.x + (p.x - P.x) * 0.4, P.y + (p.y - P.y) * 0.4)); puff(p.x, p.y, 8, "#ffd27a", 16, 1.5, 0.6, 100); });
      return B("Door");
    case "panel":
      if (!p.off) {
        if (tool === "screw") return p.screws > 0 ? A("Unscrew panel (" + p.screws + " left)", 0.7, () => { p.screws--; sfx("screw"); }) : B("Panel — unscrewed");
        if (tool === "hands") return p.screws > 0 ? B("Panel — screwed shut") : A("Pry panel off", 0.6, () => { p.off = true; giveOrDrop(item("panel", p.x, p.y)); sfx("pry"); }, "none");
        if (tool === "saw" || tool === "torch") return A((tool === "saw" ? "Saw" : "Torch") + " panel off", 2.5, () => { p.off = true; items.push(item("scrap", p.x, p.y + 0.3)); p.wireGone = true; if (pw) shock(30, p.x, p.y); else feed("Cut the wiring behind it to pieces", "#ffb070"); });
        return B("Wall panel");
      }
      if (p.wireGone) return B("Empty wall cavity");
      if (tool === "cutters" || tool === "saw" || tool === "hands") return A(tool === "hands" ? "Rip out wiring" : "Cut wiring", tool === "cutters" ? 1 : tool === "saw" ? 2 : 1.6, () => { p.wireGone = true; if (pw) { shock(tool === "hands" ? 40 : 30, p.x, p.y); items.push(item("scrap", p.x, p.y + 0.3)); } else giveOrDrop(item("wire", p.x, p.y)); sfx("snip"); });
      if (tool === "torch") return A("Burn out wiring", 1.4, () => { p.wireGone = true; if (pw) shock(30, p.x, p.y); });
      return B("Wiring");
    case "terminal":
      if (tool === "screw") return p.screws > 0 ? A("Unscrew casing (" + p.screws + " left)", 0.6, () => { p.screws--; sfx("screw"); }) : B("Casing — unscrewed");
      if (tool === "hands") {
        if (p.screws > 0) return B("Casing — screwed shut");
        if (!p.open) return A("Lift casing", 0.5, () => { p.open = true; sfx("pry"); }, "none");
        if (p.core) return A("Pull data core", 1.2, () => { p.core = false; if (pw) { puff(p.x, p.y, 10, "#bfe6ff", 12, 1.5, 0.4); sfx("spark"); feed("Pulled it while it ran — the core is fried", "#ffb070"); giveOrDrop(item("corrupt", p.x, p.y)); } else giveOrDrop(item("core", p.x, p.y)); }, "none");
        return B("Terminal — stripped");
      }
      if (tool === "cutters") return p.open && p.cables ? A("Snip cables", 1, () => { p.cables = false; if (pw) shock(20, p.x, p.y); else giveOrDrop(item("wire", p.x, p.y)); sfx("snip"); }) : B(p.open ? "No cables left" : "Casing — closed");
      if (tool === "saw" || tool === "torch") return A("Cut terminal apart", 3, () => { parts.splice(parts.indexOf(p), 1); items.push(item("elec", p.x, p.y + 0.4), item("scrap", p.x + 0.3, p.y + 0.5)); if (p.core) feed("The data core went with it", "#ffb070"); if (pw) shock(20, p.x, p.y); });
      return B("Terminal");
    case "reactor": {
      const h = p.active || p.hot > 0;
      if (tool === "screw") return p.bolts > 0 ? A("Unbolt housing (" + p.bolts + " left)", 1, () => { p.bolts--; sfx("screw"); }) : B("Housing — unbolted");
      if (tool === "hands") {
        if (p.bolts > 0) return B("Housing — bolted");
        if (!p.open) return A("Open housing", 1, () => { p.open = true; sfx("pry"); if (p.active) feed("Radiation — it's still running", "#ff5a4a"); }, "none");
        if (p.cell) return A("Pull fuel cell", 3, () => {
          if (p.active) { feed("Pulled the cell from a live reactor", "#ff3a3a"); p.melting = true; later.push({ t: 0.8, f: () => meltdown(p) }); sfx("alarm"); return; }
          p.cell = false; if (p.hot > 0) hurt(30, "Burned — the cell was still hot"); giveOrDrop(item("cell", p.x, p.y));
        }, "none");
        return B("Reactor — empty");
      }
      if (tool === "saw" || tool === "torch") return h ? A("Cut into reactor", 4, () => { feed("Cut into a live core", "#ff3a3a"); p.melting = true; later.push({ t: 0.8, f: () => meltdown(p) }); sfx("alarm"); }) : A("Cut reactor apart", 6, () => { parts.splice(parts.indexOf(p), 1); items.push(item("scrap", p.x, p.y + 1), item("scrap", p.x + 1, p.y), item("scrap", p.x - 0.5, p.y + 0.5)); if (p.cell) items.push(item("cell", p.x + 0.4, p.y + 0.8)); });
      return B("Reactor");
    }
    case "console": {
      const r = reactor();
      if (tool === "hands") { if (!r) return B("Console — dead"); if (r.active) return A("SCRAM reactor", 2, () => { r.active = false; r.hot = 10; sfx("power", false); feed("Reactor scrammed — power's down, core cooling", "#7fe08a"); }, "none"); return r.cell ? A("Restart reactor", 3, () => { r.active = true; sfx("power", true); feed("Reactor back up", "#ffb070"); }, "none") : B("No fuel cell"); }
      if (tool === "saw" || tool === "torch") return A("Cut console apart", 3, () => { parts.splice(parts.indexOf(p), 1); items.push(item("elec", p.x, p.y + 0.4)); if (r && r.active) feed("The reactor controls are gone", "#ffb070"); });
      return B("Reactor console");
    }
    case "breaker":
      if (p.broken) return B("Breaker — wrecked");
      if (tool === "hands") return A(p.on ? "Cut power" : "Restore power", 0.6, () => { p.on = !p.on; sfx("power", p.on); }, "none");
      if (tool === "cutters" || tool === "saw" || tool === "torch") return A("Cut breaker out", tool === "cutters" ? 1 : 2, () => { const live = powered(); parts.splice(parts.indexOf(p), 1); items.push(item("elec", p.x, p.y + 0.4)); if (live) shock(30, p.x, p.y); });
      return B("Breaker");
    case "pipe":
      if (tool === "screw") return p.clamps > 0 ? A("Unscrew clamp (" + p.clamps + " left)", 0.8, () => { p.clamps--; sfx("screw"); }) : B("Pipe — unclamped");
      if (tool === "hands") return p.clamps > 0 ? B("Pipe — clamped") : A("Lift pipe out", 0.8, () => { parts.splice(parts.indexOf(p), 1); if (hot()) steam(p.x, p.y); giveOrDrop(item("pipe", p.x, p.y)); }, "none");
      if (tool === "saw" || tool === "torch" || tool === "cutters") return tool === "cutters" ? B("Pipe — too thick") : A((tool === "saw" ? "Saw" : "Torch") + " pipe", 2.2, () => { parts.splice(parts.indexOf(p), 1); if (hot()) steam(p.x, p.y); items.push(item("pipecut", p.x, p.y + 0.4)); });
      return B("Coolant pipe");
    case "tank":
      if (tool === "hands") return p.pressurized ? A("Open valve", 2, () => { p.pressurized = false; sfx("hiss"); puff(p.x, p.y, 16, "#e8f4ff", 20, 1.5, 0.8); }, "none") : A("Pick up O₂ tank", 0, () => { parts.splice(parts.indexOf(p), 1); pickUp(item("tank", p.x, p.y)); });
      if (tool === "saw" || tool === "torch") return A((tool === "saw" ? "Saw" : "Torch") + " tank", tool === "saw" ? 2 : 1.5, () => {
        parts.splice(parts.indexOf(p), 1);
        if (!p.pressurized) { items.push(item("scrap", p.x, p.y), item("scrap", p.x + 0.3, p.y + 0.2)); return; }
        if (tool === "torch") { feed("Torched a full tank", "#ff3a3a"); explode(p.x, p.y, 2, 50); }
        else { feed("Ruptured — it's loose!", "#ff3a3a"); const a = rnd() * TAU; fx.push({ rocket: true, x: p.x, y: p.y, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, t: 1.2 }); sfx("steam"); }
      });
      return B(p.pressurized ? "O₂ tank — pressurized" : "O₂ tank — empty");
    case "barrel":
      if (tool === "hands") return A("Pick up fuel barrel", 0, () => { parts.splice(parts.indexOf(p), 1); pickUp(item("barrel", p.x, p.y)); });
      if (tool === "torch") return A("Torch barrel", 1.2, () => { parts.splice(parts.indexOf(p), 1); feed("Torched a fuel barrel", "#ff3a3a"); barrelBoom(p); });
      if (tool === "saw") return A("Saw barrel", 2, () => { parts.splice(parts.indexOf(p), 1); items.push(item("scrap", p.x, p.y)); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (rnd() < 0.7) puddles.add(key(p.i + a, p.j + b)); feed("Fuel all over the deck", "#ffb070"); });
      return B("Fuel barrel");
    case "crate":
      if (tool === "cutters") return p.straps > 0 ? A("Cut strap (" + p.straps + " left)", 0.7, () => { p.straps--; sfx("snip"); items.push(item("strap", p.x + 0.4, p.y + 0.4)); }) : B("Crate — unstrapped");
      if (tool === "hands") {
        if (!p.open && p.straps > 0) return A("Open lid", 1, () => { p.open = true; sfx("pry"); for (const l of p.loot) items.push(item(l, p.x + (rnd() - 0.5) * 0.8, p.y + 0.6 + rnd() * 0.3)); p.loot = []; }, "none");
        if (p.straps > 0) return B("Crate — strapped down");
        return A(p.open ? "Pick up empty crate" : "Pick up crate", 0, () => { parts.splice(parts.indexOf(p), 1); pickUp(item("crate", p.x, p.y, { loot: p.loot })); });
      }
      if (tool === "saw") return A("Saw crate open", 2.5, () => { p.open = true; for (const l of p.loot) items.push(item(rnd() < 0.5 ? "scrap" : l, p.x + (rnd() - 0.5) * 0.8, p.y + 0.6)); p.loot = []; });
      if (tool === "torch") return A("Burn crate open", 2, () => { parts.splice(parts.indexOf(p), 1); for (const l of p.loot) items.push(item("scrap", p.x + (rnd() - 0.5) * 0.8, p.y + 0.6)); ignite(p.i, p.j, 6); });
      return B("Cargo crate");
  }
  return null;
}
function cutWall(i, j, outer) {
  T[j][i] = outer ? "X" : "r"; pT[j][i] = outer ? 0 : undefined;
  const ox = P.x - (i + 0.5), oy = P.y - (j + 0.5), d = hyp(ox, oy) || 1;
  items.push(item(outer ? "plate" : "scrap", i + 0.5 + ox / d * 0.8, j + 0.5 + oy / d * 0.8));
  recomputeRooms(); puff(i + 0.5, j + 0.5, 8, "#ffd27a", 20, 2, 0.6, 100);
  if (outer) feed("Hull open to space", "#ffb070");
}
function giveOrDrop(it) { if (!pickUp(it, true)) { items.push(it); it.x = P.x; it.y = P.y; } }
function pickUp(it, fresh) {
  const big = ITEMS[it.type].big;
  if (!big && P.pack.length < 6) P.pack.push(it);
  else if (!P.carry) P.carry = it;
  else { if (fresh) feed("Hands full", "#8c8f98"); return false; }
  const i = items.indexOf(it); if (i >= 0) items.splice(i, 1);
  sfx("pick"); renderInv(); return true;
}
function dropCarry() { if (!P.carry) return; const it = P.carry; P.carry = null; dropItem(it, P.x + Math.cos(dirAng()) * 0.35, P.y + Math.sin(dirAng()) * 0.35); sfx("drop"); renderInv(); }
const DIRV = [[1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];   // S, SE, E, NE, N, NW, W, SW in tile space
function dirAng() { const v = DIRV[P.dir]; return Math.atan2(v[1], v[0]); }

// ---- input ----
const keys = {}; let mouse = { x: -1, y: -1, down: false, btn: 0 }, tool = "hands", hover = null, work = null;
addEventListener("keydown", (e) => {
  audioOn(); keys[e.code] = true;
  if (/^Digit[1-6]$/.test(e.code)) setTool(TOOLS[+e.code.slice(5) - 1].k);
  if (e.code === "KeyQ") dropCarry();
  if (e.code === "KeyE" && !work) startWork(hover && action(hover, "hands") && !action(hover, "hands").bad ? hover : nearestUsable(), "hands", "KeyE");
  if (e.code === "KeyM") toggleMute();
  if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => { keys[e.code] = false; if (work && work.key === e.code) work = null; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; mouse.down = false; work = null; });
cv.addEventListener("contextmenu", (e) => e.preventDefault());
cv.addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener("pointerdown", (e) => {
  audioOn(); mouse.x = e.clientX; mouse.y = e.clientY; mouse.down = true; mouse.btn = e.button;
  try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
  if (P.dead) return;
  if (e.button === 2) { dropCarry(); return; }
  hover = pickTarget();
  const a = hover && action(hover, tool);
  if (a && !a.bad) startWork(hover, tool, "mouse");
  else if (!a) { const w = screenToTile(mouse.x, mouse.y); P.path = findPath(w.x, w.y, 0.3); }
});
cv.addEventListener("pointerup", () => { mouse.down = false; if (work && work.key === "mouse") work = null; });
cv.addEventListener("wheel", (e) => { const i = TOOLS.findIndex((t) => t.k === tool); setTool(TOOLS[(i + (e.deltaY > 0 ? 1 : TOOLS.length - 1)) % TOOLS.length].k); }, { passive: true });
function startWork(t, tl, k) { if (!t) return; const a = action(t, tl); if (!a || a.bad) return; work = { t, tool: tl, key: k, prog: 0, sig: a.label }; if (targetDist(t) > REACH) { const q = targetPoint(t); P.path = findPath(q.x, q.y, REACH, t); } }
function nearestUsable() {
  let best = null, bd = REACH + 0.01;
  const cands = [...items.map((it) => ({ type: "item", it })), ...parts.map((p) => ({ type: "part", p }))];
  for (const t of cands) { const d = targetDist(t); if (d < bd) { const a = action(t, "hands"); if (a && !a.bad) { bd = d; best = t; } } }
  return best;
}
function setTool(k) { tool = k; for (const b of document.querySelectorAll("#tools .slot")) b.classList.toggle("on", b.dataset.k === k); }
function toggleMute() { muted = !muted; $("mute").textContent = muted ? "♪̸" : "♪"; }
$("mute").onclick = toggleMute;
$("reset").onclick = () => { makeWorld(); const keepC = credits; P = newPlayer(); credits = keepC; renderInv(); feed("A new derelict drifts in", "#f08a24"); };
$("hands").onclick = () => dropCarry();

// ---- picking: screen -> tile, then the thing under the cursor ----
let S = 3, LW = 0, LH = 0, VW = 0, VH = 0;
const IX = (x, y) => (x - y) * TW / 2, IY = (x, y, z) => (x + y) * TH / 2 - (z || 0);
function screenToTile(sx, sy) {
  const lx = sx / S - LW / 2 + cam.x, ly = sy / S - LH / 2 + cam.y;
  return { x: (lx / (TW / 2) + ly / (TH / 2)) / 2, y: (ly / (TH / 2) - lx / (TW / 2)) / 2 };
}
function pickTarget() {
  if (mouse.x < 0) return null;
  const w = screenToTile(mouse.x, mouse.y);
  // things standing on the deck: test their screen box (they rise above their tile)
  const lx = mouse.x / S - LW / 2 + cam.x, ly = mouse.y / S - LH / 2 + cam.y;
  let best = null, bd = 1e9;
  if (tool === "hands") for (const it of items) { const d = hyp(it.x - w.x, it.y - w.y); if (d < 0.45 && d < bd) { bd = d; best = { type: "item", it }; } }
  if (best) return best;
  for (const p of parts) {
    const h = PH[p.kind] || 10, cx2 = IX(p.x, p.y), cy2 = IY(p.x, p.y);
    const hw = (p.w + p.d) * TW / 4, inBox = Math.abs(lx - cx2) < hw * 0.8 && ly < cy2 + (p.w + p.d) * TH / 4 && ly > cy2 - h - (p.w + p.d) * TH / 4 * 0.5;
    if (inBox) { const d = Math.abs(lx - cx2) + Math.abs(ly - (cy2 - h / 2)) * 0.5; if (d < bd) { bd = d; best = { type: "part", p }; } }
  }
  if (best) return best;
  if (tool !== "hands") for (const it of items) { const d = hyp(it.x - w.x, it.y - w.y); if (d < 0.4 && d < bd) { bd = d; best = { type: "item", it }; } }
  if (best) return best;
  // walls: test the tile under the cursor and the one whose top face it hits
  for (const [ti, tj] of [[Math.floor(w.x + WALLH / TH), Math.floor(w.y + WALLH / TH)], [Math.floor(w.x), Math.floor(w.y)]]) { const c = tileAt(ti, tj); if (c === "#" || c === "S") return { type: "wall", i: ti, j: tj }; }
  return { type: "floor", x: w.x, y: w.y };
}
const PH = { door: WALLH, airlock: WALLH, panel: 12, terminal: 11, reactor: 22, console: 9, breaker: 10, pipe: 8, tank: 16, barrel: 11, crate: 9 };

// ---- paths: BFS over tiles, 8-way without corner cuts ----
function findPath(tx, ty, reach, t) {
  const si = Math.floor(P.x), sj = Math.floor(P.y), prev = new Map(), q = [[si, sj]]; prev.set(key(si, sj), null);
  const goal = (i, j) => { const x = i + 0.5, y = j + 0.5; if (t) { const sx = P.x, sy = P.y; P.x = x; P.y = y; const d = targetDist(t); P.x = sx; P.y = sy; return d <= reach; } return hyp(x - tx, y - ty) <= Math.max(0.75, reach); };
  let end = null;
  while (q.length) {
    const [i, j] = q.shift(); if (goal(i, j)) { end = [i, j]; break; }
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + a, nj = j + b, k = key(ni, nj); if (prev.has(k) || blocked(ni, nj)) continue;
      if (a && b && (blocked(i + a, j) || blocked(i, j + b))) continue;
      prev.set(k, [i, j]); q.push([ni, nj]);
    }
    if (prev.size > 2000) break;
  }
  if (!end) return null;
  const path = []; let c = end; while (c) { path.unshift({ x: c[0] + 0.5, y: c[1] + 0.5 }); c = prev.get(key(c[0], c[1])); }
  path.shift(); if (!t && path.length && hyp(tx - path[path.length - 1].x, ty - path[path.length - 1].y) < 0.7 && !blockedAt(tx, ty, 0.2)) path[path.length - 1] = { x: tx, y: ty };
  return path;
}

// ---- simulation ----
function step(dt) {
  clock += dt;
  for (let i = later.length - 1; i >= 0; i--) if ((later[i].t -= dt) <= 0) { const f = later[i].f; later.splice(i, 1); f(); }
  const r = reactor(); if (r && r.hot > 0 && !r.active) r.hot = Math.max(0, r.hot - dt);
  hover = P.dead ? null : (work ? work.t : pickTarget());
  if (P.dead) { P.dead -= dt; if (P.dead <= 0) { const keepC = credits; P = newPlayer(); credits = keepC; $("dead").hidden = true; renderInv(); feed("Back aboard your ship", "#8c8f98"); } }
  else {
    // moving: WASD in screen directions
    let mx = 0, my = 0;
    if (keys.KeyW || keys.ArrowUp) { mx -= 1; my -= 1; } if (keys.KeyS || keys.ArrowDown) { mx += 1; my += 1; }
    if (keys.KeyA || keys.ArrowLeft) { mx -= 1; my += 1; } if (keys.KeyD || keys.ArrowRight) { mx += 1; my -= 1; }
    if (mx || my) { P.path = null; if (work && work.key !== "KeyE") work = null; }
    else if (P.path && P.path.length) { const n = P.path[0], dx = n.x - P.x, dy = n.y - P.y, d = hyp(dx, dy); if (d < 0.08) P.path.shift(); else { mx = dx / d; my = dy / d; } }
    const m = hyp(mx, my), carrying = P.carry && ITEMS[P.carry.type].big, sp = (carrying ? 1.7 : 2.8) * (P.hp < 30 ? 0.7 : 1);
    let moving = false;
    if (m > 0 && P.stun <= 0) { const vx = mx / m * sp * dt, vy = my / m * sp * dt; if (!blockedAt(P.x + vx, P.y, 0.2)) P.x += vx; if (!blockedAt(P.x, P.y + vy, 0.2)) P.y += vy; moving = true; setDir(mx, my); }
    // wind toward a breach, and knockback
    const wd = windAt(P.x, P.y); if (wd) { const k = wd.s * 6 / Math.max(0.6, wd.d); P.wx += (wd.x - P.x) / wd.d * k * dt; P.wy += (wd.y - P.y) / wd.d * k * dt; if (rnd() < 0.3) sfx("wind"); }
    if (P.wx || P.wy) { const ax = P.wx * dt, ay = P.wy * dt; if (!blockedAt(P.x + ax, P.y, 0.2)) P.x += ax; else P.wx = 0; if (!blockedAt(P.x, P.y + ay, 0.2)) P.y += ay; else P.wy = 0; P.wx *= Math.pow(0.05, dt); P.wy *= Math.pow(0.05, dt); if (Math.abs(P.wx) < 0.02) P.wx = 0; if (Math.abs(P.wy) < 0.02) P.wy = 0; }
    P.stun = Math.max(0, P.stun - dt); P.hurtT = Math.max(0, P.hurtT - dt);
    // working
    let working = false;
    if (work) {
      const a = action(work.t, work.tool);
      if (!a || a.bad || a.label !== work.sig || !stillThere(work.t)) work = null;
      else if (targetDist(work.t) <= REACH + 0.05 && P.stun <= 0) {
        P.path = null; working = true; const q = targetPoint(work.t); setDir(q.x - P.x, q.y - P.y);
        work.prog += a.time > 0 ? dt / a.time : 1; toolFx(a.fx, q);
        if (work.prog >= 1) { const k = work.key; a.run(); work = null; if (k === "mouse" && mouse.down) { const t2 = pickTarget(), a2 = t2 && action(t2, tool); if (a2 && !a2.bad && a2.time > 0) startWork(t2, tool, "mouse"); } }
      } else if (!P.path) { const q = targetPoint(work.t); P.path = findPath(q.x, q.y, REACH, work.t); if (!P.path) work = null; }
    }
    P.anim = working ? "interact" : moving ? "walk" : "idle"; P.animT += dt;
    // hazards
    const air = airAt(P.x, P.y);
    if (air < 0.35) { P.o2 -= dt * 100 / 50; if (P.o2 <= 0) { P.o2 = 0; hurt(12 * dt); } } else if (air > 0.7) P.o2 = Math.min(100, P.o2 + 25 * dt);
    if (fires.has(key(Math.floor(P.x), Math.floor(P.y)))) hurt(16 * dt);
    for (const c of clouds) if (hyp(c.x - P.x, c.y - P.y) < 1.1) hurt(12 * dt);
    if (r && r.open && r.active && hyp(r.x - P.x, r.y - P.y) < 3) { hurt(7 * dt); if (rnd() < 0.5) sfx("geiger"); }
    if (P.carry && P.carry.type === "barrel" && fires.has(key(Math.floor(P.x), Math.floor(P.y)))) { const b = P.carry; P.carry = null; renderInv(); barrelBoom({ x: P.x, y: P.y }); }
    if (P.hp <= 0 && !P.dead) die();
    // the sell pad
    if (tileAt(Math.floor(P.x), Math.floor(P.y)) === "$" && P.pack.length) { for (const it of P.pack) sell(it, true); P.pack = []; renderInv(); }
  }
  // charges
  for (let i = charges.length - 1; i >= 0; i--) { const c = charges[i]; c.t -= dt; c.beep -= dt; if (c.beep <= 0) { c.beep = c.t < 1 ? 0.15 : 0.5; sfx("beep"); } if (c.t <= 0) { charges.splice(i, 1); explode(c.x, c.y, 1.7, 65); } }
  updateAir(dt);
  // loose items: the wind takes them; the pad buys them
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i], wd = windAt(it.x, it.y);
    if (wd) { const k = wd.s * (ITEMS[it.type].big ? 6 : 11) / Math.max(0.5, wd.d); it.vx += (wd.x - it.x) / wd.d * k * dt; it.vy += (wd.y - it.y) / wd.d * k * dt; if (wd.d < 0.6) { items.splice(i, 1); feed("Lost to space: " + ITEMS[it.type].name, "#ff8a3a"); puff(it.x, it.y, 4, "#cfd6e2", 6, 1, 0.5); continue; } }
    if (it.vx || it.vy) {
      const nx = it.x + it.vx * dt, ny = it.y + it.vy * dt;
      if (!blockedAt(nx, it.y, 0.15) || (wd && tileAt(Math.floor(nx), Math.floor(it.y)) === "X")) it.x = nx; else it.vx *= -0.3;
      if (!blockedAt(it.x, ny, 0.15) || (wd && tileAt(Math.floor(it.x), Math.floor(ny)) === "X")) it.y = ny; else it.vy *= -0.3;
      const f = Math.pow(wd ? 0.6 : 0.02, dt); it.vx *= f; it.vy *= f; if (Math.abs(it.vx) + Math.abs(it.vy) < 0.03) { it.vx = 0; it.vy = 0; }
    }
    if (tileAt(Math.floor(it.x), Math.floor(it.y)) === "$") { it.padT += dt; if (it.padT > 0.4) { items.splice(i, 1); sell(it); } }
  }
  // fire: needs air, spreads, cooks off what it touches
  for (const [k, f] of fires) {
    f.t -= dt; const air = airAt(f.i + 0.5, f.j + 0.5);
    if (f.t <= 0 || air < 0.25) { fires.delete(k); if (air < 0.25) puff(f.i + 0.5, f.j + 0.5, 4, "#5a5a60", 6, 0.8, 0.8); continue; }
    if (puddles.has(k)) { f.t = Math.max(f.t, 2); if (rnd() < dt * 0.3) puddles.delete(k); }
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nk = key(f.i + a, f.j + b); if (fires.has(nk)) continue; if (rnd() < dt * (puddles.has(nk) ? 2 : 0.06) * air) ignite(f.i + a, f.j + b, puddles.has(nk) ? 10 : 6); }
    for (const p of partsAt(f.i, f.j)) { p.cook = (p.cook || 0) + dt; if (p.kind === "barrel" && p.full && p.cook > 2) blast(p, 0); else if (p.kind === "tank" && p.pressurized && p.cook > 3) blast(p, 0); else if (p.kind === "crate" && p.cook > 4) { parts.splice(parts.indexOf(p), 1); items.push(item("scrap", p.x, p.y)); } }
    if (rnd() < dt * 14) fx.push({ x: f.i + 0.2 + rnd() * 0.6, y: f.j + 0.2 + rnd() * 0.6, z: 1, vx: 0, vy: 0, vz: 16 + rnd() * 14, life: 0.5, max: 0.5, c: rnd() < 0.5 ? "#ffb347" : "#ff5a2a", s: 2, grav: 0 });
    if (rnd() < dt * 3) fx.push({ x: f.i + 0.5, y: f.j + 0.5, z: 10, vx: 0, vy: 0, vz: 10, life: 1.2, max: 1.2, c: "#2a2a30", s: 3, grav: 0, smoke: true });
  }
  for (let i = clouds.length - 1; i >= 0; i--) { const c = clouds[i]; c.t -= dt; if (rnd() < dt * 20) fx.push({ x: c.x + (rnd() - 0.5), y: c.y + (rnd() - 0.5), z: 4, vx: (rnd() - 0.5) * 0.5, vy: (rnd() - 0.5) * 0.5, vz: 8, life: 1, max: 1, c: "#e8eef4", s: 3, grav: 0, smoke: true }); if (c.t <= 0) clouds.splice(i, 1); }
  // ambient danger cues: live wiring sparks, hot pipes hiss, the wind carries dust
  const pw = powered();
  for (const p of parts) {
    if (p.kind === "panel" && p.off && !p.wireGone && pw && rnd() < dt * 0.8) { puff(p.x, p.y, 8, "#bfe6ff", 4, 1, 0.25); sfx("spark"); }
    if (p.kind === "pipe" && hot() && rnd() < dt * 0.6) fx.push({ x: p.x + (rnd() - 0.5) * 0.6, y: p.y - 0.3, z: 7, vx: 0, vy: 0, vz: 6, life: 0.8, max: 0.8, c: "#cfd6e2", s: 1, grav: 0, smoke: true });
  }
  for (const gr of groups) if (gr.wind > 0.05) for (const rm of gr.rooms) if (rnd() < dt * rm.tiles.length * gr.wind * 0.6) { const [a, b] = pick(rm.tiles), x = a + rnd(), y = b + rnd(); let bd = 1e9, bx = 0, by = 0; for (const [c, d] of gr.breaches) { const dd = hyp(c + 0.5 - x, d + 0.5 - y); if (dd < bd) { bd = dd; bx = c + 0.5; by = d + 0.5; } } fx.push({ x, y, z: 2 + rnd() * 8, vx: (bx - x) / bd * 4, vy: (by - y) / bd * 4, vz: 0, life: 0.6, max: 0.6, c: "#9aa6b4", s: 1, grav: 0 }); }
  // particles
  for (let i = fx.length - 1; i >= 0; i--) {
    const p = fx[i];
    if (p.rocket) { p.t -= dt; const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt; if (blockedAt(nx, ny, 0.15) || p.t <= 0) { fx.splice(i, 1); explode(p.x, p.y, 1.6, 40); continue; } p.x = nx; p.y = ny; puff(p.x, p.y, 6, "#e8f4ff", 2, 0.6, 0.4); continue; }
    if (p.ring) { p.life -= dt; p.r = p.max * (1 - p.life / p.maxl); if (p.life <= 0) fx.splice(i, 1); continue; }
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.grav * dt; if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
    if (p.life <= 0) fx.splice(i, 1);
  }
  shake = Math.max(0, shake - dt * 20); flash = Math.max(0, flash - dt * 1.5);
}
function stillThere(t) { if (t.type === "part") return parts.includes(t.p); if (t.type === "item") return items.includes(t.it); if (t.type === "wall") return tileAt(t.i, t.j) === "#" || tileAt(t.i, t.j) === "S"; return true; }
function setDir(dx, dy) { const sx = dx - dy, sy = (dx + dy) * 0.5; const deg = Math.atan2(sy, sx) * 180 / Math.PI; P.dir = ((Math.round((90 - deg) / 45) % 8) + 8) % 8; }
function toolFx(k, q) {
  const z = 8;
  if (k === "screw") { if (rnd() < 0.1) puff(q.x, q.y, z, "#e8eef4", 1, 0.5, 0.2); sfx("screw"); }
  else if (k === "saw") { puff(q.x, q.y, z, rnd() < 0.5 ? "#ffd27a" : "#ffffff", 2, 2, 0.3, 60); sfx("saw"); }
  else if (k === "torch") { puff(q.x, q.y, z, rnd() < 0.5 ? "#7fd8ff" : "#e8fbff", 2, 0.6, 0.15); puff(q.x, q.y, z, "#ffb347", 1, 2.2, 0.4, 80); sfx("torch"); }
  else if (k === "cutters") { if (rnd() < 0.05) sfx("snip"); }
  else if (k === "crank") sfx("crank");
}
function sell(it, worn) {
  const v = itemValue(it); credits += v; sold++; sfx("sell");
  const s = worn ? toScreen(P.x, P.y, 26) : toScreen(it.x, it.y, 10), d = document.createElement("div"); d.className = "pop"; d.textContent = "+$" + v; d.style.left = s.x + "px"; d.style.top = s.y + "px"; document.body.appendChild(d); setTimeout(() => d.remove(), 1400);
  feed("Sold " + ITEMS[it.type].name + (it.loot && it.loot.length ? " (with contents)" : "") + " — $" + v, "#7fe08a");
}
function toScreen(x, y, z) { return { x: (IX(x, y) - cam.x + LW / 2) * S, y: (IY(x, y, z) - cam.y + LH / 2) * S }; }

// ---- drawing ----
const SHEET = new Image(); SHEET.src = "branko.png?v=1";
const FW = 13, FH = 21, ANIMS = { idle: 0, walk: 1, interact: 2 };
const SEQ = { idle: [0, 1, 2, 1], walk: [0, 1, 2, 1], interact: [0, 1, 0, 2] }, RATE = { idle: 0.45, walk: 0.13, interact: 0.14 };
function seededTile(base, edge, seed, extra) {
  const c = document.createElement("canvas"); c.width = TW; c.height = TH; const t = c.getContext("2d"), img = t.createImageData(TW, TH);
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const b = hex(base), e = hex(edge); let s = seed;
  const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const v = Math.abs(x + 0.5 - TW / 2) / (TW / 2) + Math.abs(y + 0.5 - TH / 2) / (TH / 2); if (v > 1) continue;
    const edgeP = v > 0.86, n = (R() - 0.5) * 14, col = edgeP ? e : b, o = (y * TW + x) * 4;
    let [rr, gg, bb] = col; if (extra) [rr, gg, bb] = extra(x, y, rr, gg, bb, R);
    img.data[o] = clamp(rr + n, 0, 255); img.data[o + 1] = clamp(gg + n, 0, 255); img.data[o + 2] = clamp(bb + n, 0, 255); img.data[o + 3] = 255;
  }
  t.putImageData(img, 0, 0); return c;
}
const TILES = {
  ",": [0, 1, 2].map((k) => seededTile("#7d8698", "#5d6576", 11 + k, (x, y, r, gg, b) => (x === 12 || y === 6 ? [r - 14, gg - 14, b - 14] : [r, gg, b]))),
  "=": [seededTile("#636b7c", "#474e5c", 5)],
  "$": [seededTile("#3a3a30", "#2a2a22", 7, (x, y, r, gg, b) => ((Math.floor((x + y * 2) / 4) % 2) ? [210, 160, 40] : [40, 36, 28]))],
  ".": [0, 1, 2, 3].map((k) => seededTile("#4a4540", "#36322e", 21 + k * 7, (x, y, r, gg, b, R) => (R() < 0.05 ? [r - 20, gg - 22, b - 24] : R() < 0.03 ? [r + 30, gg + 10, b - 10] : [r, gg, b]))),
  r: [seededTile("#3a3532", "#2a2624", 41, (x, y, r, gg, b, R) => (R() < 0.18 ? [r + 40, gg + 34, b + 28] : [r, gg, b]))],
  X: [seededTile("#05060a", "#2a2e38", 3, (x, y, r, gg, b, R) => (R() < 0.04 ? [220, 230, 255] : [r, gg, b]))],
};
const TINT = { vac: seededTile("#2a4a8a", "#2a4a8a", 1), scorch: seededTile("#000000", "#000000", 2), fuel: seededTile("#1a1020", "#2a1a30", 3, (x, y, r, gg, b, R) => (R() < 0.1 ? [120, 90, 160] : [r, gg, b])) };
function poly(pts, col) { g.fillStyle = col; g.beginPath(); g.moveTo(Math.round(pts[0][0]), Math.round(pts[0][1])); for (let k = 1; k < pts.length; k++) g.lineTo(Math.round(pts[k][0]), Math.round(pts[k][1])); g.closePath(); g.fill(); }
let OX = 0, OY = 0;
const sp = (x, y, z) => [IX(x, y) + OX, IY(x, y, z) + OY];
function box(x0, y0, w, d, h, z, top, left, right) {
  z = z || 0;
  poly([sp(x0, y0 + d, z + h), sp(x0 + w, y0 + d, z + h), sp(x0 + w, y0 + d, z), sp(x0, y0 + d, z)], left);
  poly([sp(x0 + w, y0, z + h), sp(x0 + w, y0 + d, z + h), sp(x0 + w, y0 + d, z), sp(x0 + w, y0, z)], right);
  poly([sp(x0, y0, z + h), sp(x0 + w, y0, z + h), sp(x0 + w, y0 + d, z + h), sp(x0, y0 + d, z + h)], top);
}
function px(x, y, z, col, w, h) { const [a, b] = sp(x, y, z); g.fillStyle = col; g.fillRect(Math.round(a), Math.round(b), w || 1, h || 1); }
const WALLC = { "#": ["#8a7f74", "#5e554d", "#4a433d"], hull: ["#6d7a8c", "#4a5566", "#39424f"], S: ["#c9d1dc", "#97a2b3", "#7a8597"] };
function drawWall(i, j, ghost) {
  const c = tileAt(i, j), col = c === "S" ? WALLC.S : isOuter(i, j) ? WALLC.hull : WALLC["#"];
  if (ghost) g.globalAlpha = 0.3;
  box(i, j, 1, 1, WALLH, 0, col[0], col[1], col[2]);
  if (c === "#" && isOuter(i, j)) { px(i + 0.2, j + 1, 4, "#2a313c"); px(i + 0.8, j + 1, 4, "#2a313c"); px(i + 0.2, j + 1, 11, "#2a313c"); px(i + 0.8, j + 1, 11, "#2a313c"); }
  if (c === "#" && !isOuter(i, j) && (i * 7 + j * 3) % 5 === 0) px(i + 0.5, j + 1, 8, "#7a3a2a", 2, 2);
  g.globalAlpha = 1;
}
function drawDoor(p, ghost) {
  const i = p.i, j = p.j, alongX = tileAt(i - 1, j) !== "." && !isFloor(tileAt(i - 1, j)) && tileAt(i - 1, j) !== "D";
  const ship = p.kind === "airlock", top = ship ? "#d8e2ec" : "#c9a227", l = ship ? "#9aa8ba" : "#8a6e1a", r = ship ? "#7a8899" : "#6a5414";
  if (ghost) g.globalAlpha = 0.35;
  const posts = (a, b) => { if (alongX) { box(i, j + 0.4, 0.14, 0.2, WALLH, 0, "#5a5048", "#4a423c", "#3a342f"); box(i + 0.86, j + 0.4, 0.14, 0.2, WALLH, 0, "#5a5048", "#4a423c", "#3a342f"); } else { box(i + 0.4, j, 0.2, 0.14, WALLH, 0, "#5a5048", "#4a423c", "#3a342f"); box(i + 0.4, j + 0.86, 0.2, 0.14, WALLH, 0, "#5a5048", "#4a423c", "#3a342f"); } };
  posts();
  if (p.broken) { if (alongX) box(i + 0.2, j + 0.4, 0.3, 0.2, 3, 0, "#6a5a2a", "#4a3e1a", "#3a3014"); else box(i + 0.4, j + 0.2, 0.2, 0.3, 3, 0, "#6a5a2a", "#4a3e1a", "#3a3014"); }
  else if (!p.open) {
    if (alongX) box(i + 0.14, j + 0.42, 0.72, 0.16, WALLH - 1, 0, top, l, r); else box(i + 0.42, j + 0.14, 0.16, 0.72, WALLH - 1, 0, top, l, r);
    if (!ship) for (let k = 0; k < 3; k++) { if (alongX) px(i + 0.25 + k * 0.22, j + 0.58, 4 + k * 3, "#1a1a1a", 3, 1); else px(i + 0.58, j + 0.25 + k * 0.22, 4 + k * 3, "#1a1a1a", 3, 1); }
    const lit = ship || powered(); px(alongX ? i + 0.5 : i + 0.58, alongX ? j + 0.58 : j + 0.5, WALLH - 4, lit ? (p.kind === "door" ? "#7fe08a" : "#6cb8ff") : "#5a1a1a", 2, 1);
  }
  g.globalAlpha = 1;
}
function drawPart(p) {
  const i = p.i, j = p.j, t = clock, pw = powered(), wn = p.wall === "n", wW = p.wall === "w";
  switch (p.kind) {
    case "panel":
      if (!p.off) {
        if (wn) box(i + 0.1, j, 0.8, 0.1, 12, 1, "#a6adb6", "#8e959e", "#767d86"); else box(i, j + 0.1, 0.1, 0.8, 12, 1, "#a6adb6", "#8e959e", "#767d86");
        const sc = [[0.18, 3], [0.82, 3], [0.18, 11], [0.82, 11]];
        for (let k = 0; k < p.screws; k++) { const [f, z] = sc[k]; if (wn) px(i + 0.1 + f * 0.8, j + 0.1, z, "#3a3a3a"); else px(i + 0.1, j + 0.1 + f * 0.8, z, "#3a3a3a"); }
      } else {
        if (wn) box(i + 0.12, j, 0.76, 0.04, 11, 1, "#1a1a1e", "#16161a", "#121216"); else box(i, j + 0.12, 0.04, 0.76, 11, 1, "#1a1a1e", "#16161a", "#121216");
        if (!p.wireGone) for (let k = 0; k < 4; k++) { const col = ["#d9822b", "#3a7ad0", "#d84a2a", "#e0c060"][k]; for (let z = 2; z < 12; z++) { const o = Math.sin(z * 0.9 + k) * 0.03; if (wn) px(i + 0.25 + k * 0.15 + o, j + 0.06, z, col); else px(i + 0.06, j + 0.25 + k * 0.15 + o, z, col); } }
      }
      break;
    case "terminal":
      box(i + 0.15, j + 0.05, 0.7, 0.45, 6, 0, "#5a6270", "#454c58", "#363c46");
      if (!p.open) { box(i + 0.15, j + 0.05, 0.7, 0.2, 11, 0, "#6a7280", "#4e5562", "#3e4450"); poly([sp(i + 0.2, j + 0.25, 10), sp(i + 0.8, j + 0.25, 10), sp(i + 0.8, j + 0.25, 4), sp(i + 0.2, j + 0.25, 4)], pw ? (Math.sin(t * 3 + i) > -0.8 ? "#2a8a5a" : "#3aaa6a") : "#151a1e"); if (pw) for (let k = 0; k < 3; k++) px(i + 0.3 + k * 0.15, j + 0.25, 8 - k * 1.5, "#9affc0", 3, 1); for (let k = 0; k < p.screws; k++) px(i + 0.2 + k * 0.18, j + 0.5, 6, "#2a2a2a"); }
      else { box(i + 0.2, j + 0.1, 0.6, 0.3, 7, 6, "#1a1e24", "#14181c", "#101316"); if (p.core) box(i + 0.4, j + 0.15, 0.2, 0.15, 3, 13, "#7fe8ff", "#4ab8d8", "#3a98b8"); if (p.cables) { px(i + 0.3, j + 0.4, 9, "#d9822b", 1, 3); px(i + 0.7, j + 0.4, 9, "#3a7ad0", 1, 3); } }
      break;
    case "reactor": {
      const glow = p.active ? 0.6 + 0.4 * Math.sin(t * 4) : p.hot > 0 ? p.hot / 10 * 0.6 : 0;
      box(i + 0.1, j + 0.1, 1.8, 1.8, 6, 0, "#5a5048", "#463e38", "#38322c");
      if (!p.open) {
        box(i + 0.3, j + 0.3, 1.4, 1.4, 16, 6, "#7a8290", "#5a626e", "#4a525c");
        poly([sp(i + 0.6, j + 0.6, 22), sp(i + 1.4, j + 0.6, 22), sp(i + 1.4, j + 1.4, 22), sp(i + 0.6, j + 1.4, 22)], glow > 0 ? "rgba(140,255,120," + (0.3 + glow * 0.6) + ")" : "#3a3e44");
        const bp = [[0.35, 0.35], [1.65, 0.35], [1.65, 1.65], [0.35, 1.65]]; for (let k = 0; k < p.bolts; k++) px(i + bp[k][0], j + bp[k][1], 22, "#1a1a1a", 2, 1);
        px(i + 1.7, j + 1.0, 16, p.active ? "#ff3a3a" : "#3a1a1a", 2, 2);
      } else {
        box(i + 0.3, j + 0.3, 1.4, 1.4, 4, 6, "#2a2e34", "#22262a", "#1c1f22");
        if (p.cell) box(i + 0.85, j + 0.85, 0.3, 0.3, 14, 8, glow > 0 ? "#b0ff9a" : "#5a8a50", glow > 0 ? "#7aff6a" : "#3a6a30", glow > 0 ? "#5ad84a" : "#2a5a20");
      }
      if (glow > 0) { const [a, b] = sp(p.x, p.y, 22); const gr = g.createRadialGradient(a, b, 1, a, b, 26); gr.addColorStop(0, "rgba(140,255,120," + glow * 0.35 + ")"); gr.addColorStop(1, "rgba(140,255,120,0)"); g.fillStyle = gr; g.fillRect(a - 26, b - 26, 52, 52); }
      break;
    }
    case "console": box(i + 0.2, j + 0.2, 0.6, 0.6, 9, 0, "#5a6270", "#454c58", "#363c46"); { const r = reactor(); px(i + 0.4, j + 0.4, 9, r && r.active ? "#ff3a3a" : "#7fe08a", 3, 2); px(i + 0.65, j + 0.35, 9, "#e0c060", 2, 1); } break;
    case "breaker":
      box(i + 0.15, j, 0.7, 0.18, 12, 2, "#6a6050", "#56503f", "#463f32");
      px(i + 0.5, j + 0.18, p.on ? 11 : 6, "#d84a2a", 2, 3); px(i + 0.3, j + 0.18, 12, powered() ? "#7fe08a" : "#5a1a1a", 1, 1);
      break;
    case "pipe":
      box(i, j + 0.05, 1, 0.22, 4, 4, "#5ab07a", "#3a8a5a", "#2a6a44");
      for (let k = 0; k < p.clamps; k++) box(i + 0.25 + k * 0.5 - 0.05, j, 0.1, 0.32, 6, 3, "#c0c6cc", "#9aa1aa", "#7a8188");
      break;
    case "tank":
      box(i + 0.3, j + 0.3, 0.4, 0.4, 14, 0, "#e8eef4", "#c8d2dc", "#a8b2bc");
      box(i + 0.3, j + 0.3, 0.4, 0.4, 3, 6, "#3a7ad0", "#2a5aa8", "#1a4a88");
      box(i + 0.45, j + 0.45, 0.1, 0.1, 3, 14, "#888", "#666", "#555");
      px(i + 0.7, j + 0.5, 10, p.pressurized ? "#7fe08a" : "#ff5a4a", 1, 1);
      break;
    case "barrel":
      box(i + 0.25, j + 0.25, 0.5, 0.5, 11, 0, "#d85a4a", "#b83a2a", "#982a1a");
      box(i + 0.25, j + 0.25, 0.5, 0.5, 1, 3, "#1a1a1a", "#1a1a1a", "#1a1a1a"); box(i + 0.25, j + 0.25, 0.5, 0.5, 1, 8, "#1a1a1a", "#1a1a1a", "#1a1a1a");
      px(i + 0.75, j + 0.55, 6, "#f0c040", 2, 2);
      break;
    case "crate":
      box(i + 0.1, j + 0.1, 0.8, 0.8, 9, 0, p.open ? "#3a2614" : "#b07a3a", "#8a5a2a", "#6a4420");
      if (p.open) { box(i + 0.1, j + 0.1, 0.8, 0.12, 10, 9, "#b07a3a", "#8a5a2a", "#6a4420"); for (const l of p.loot) { } }
      for (let k = 0; k < p.straps; k++) { box(i + 0.3 + k * 0.4 - 0.04, j + 0.1, 0.08, 0.8, 9.6, 0, "#e07a1a", "#c0601a", "#a04a10"); }
      break;
  }
}
function drawItem(it) {
  const [a, b] = sp(it.x, it.y, 0), list = ICONS[it.type];
  g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(Math.round(a - 5), Math.round(b - 1), 10, 2);
  drawPix(g, list, Math.round(a - 6), Math.round(b - 9));
}
function drawPlayer(ghostWalls) {
  const [a, b] = sp(P.x, P.y, 0);
  g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(Math.round(a), Math.round(b), 5, 2, 0, 0, TAU); g.fill();
  if (P.dead) return;
  const seq = SEQ[P.anim], f = seq[Math.floor(P.animT / RATE[P.anim]) % seq.length];
  if (SHEET.complete && SHEET.naturalWidth) {
    if (P.hurtT > 0 && Math.floor(clock * 30) % 2) g.globalAlpha = 0.5;
    g.drawImage(SHEET, (ANIMS[P.anim] * 3 + f) * FW, P.dir * FH, FW, FH, Math.round(a - 6), Math.round(b - FH + 1), FW, FH);
    g.globalAlpha = 1;
  } else { g.fillStyle = "#f08a24"; g.fillRect(Math.round(a - 3), Math.round(b - 14), 6, 14); }
  if (P.carry) drawPix(g, ICONS[P.carry.type], Math.round(a - 6), Math.round(b - FH - 9));
}
function draw() {
  g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
  g.fillStyle = "#06070b"; g.fillRect(0, 0, LW, LH);
  // stars
  for (let k = 0; k < 90; k++) { const x = ((k * 97.13 - cam.x * 0.2) % LW + LW) % LW, y = ((k * 53.71 - cam.y * 0.2) % LH + LH) % LH; g.fillStyle = k % 7 === 0 ? "#cfd8ff" : "#5a6078"; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
  const pS = sp(P.x, P.y, 0);
  const tx = IX(P.x, P.y), ty = IY(P.x, P.y, 10); cam.x += (tx - cam.x) * 0.15; cam.y += (ty - cam.y) * 0.15;
  OX = Math.round(LW / 2 - cam.x + (rnd() - 0.5) * shake); OY = Math.round(LH / 2 - cam.y + (rnd() - 0.5) * shake);
  // floors
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const c = T[j][i], set = TILES[c] || (c === "D" ? TILES["."] : c === "A" ? TILES[","] : null); if (!set) continue;
    const [a, b] = sp(i, j, 0), x0 = Math.round(a - TW / 2), y0 = Math.round(b);
    g.drawImage(set[(i * 3 + j * 5) % set.length], x0, y0);
    const k = key(i, j);
    if (puddles.has(k)) { g.globalAlpha = 0.75; g.drawImage(TINT.fuel, x0, y0); g.globalAlpha = 1; }
    if (scorch.has(k)) { g.globalAlpha = scorch.get(k) * 0.6; g.drawImage(TINT.scorch, x0, y0); g.globalAlpha = 1; }
    const p = pT[j][i]; if ((isFloor(c) || c === "X") && p !== undefined && p < 0.9 && c !== "X") { g.globalAlpha = (1 - p) * 0.28; g.drawImage(TINT.vac, x0, y0); g.globalAlpha = 1; }
  }
  // the hover outline and the path
  if (hover && !P.dead) {
    const a = action(hover, work ? work.tool : tool), col = !a ? null : a.bad ? "rgba(140,143,152,.8)" : targetDist(hover) <= REACH + 0.05 ? "#f08a24" : "rgba(240,138,36,.55)";
    if (col) { g.strokeStyle = col; g.lineWidth = 1; let x0, y0, w, d; if (hover.type === "part") { x0 = hover.p.i; y0 = hover.p.j; w = hover.p.w; d = hover.p.d; } else if (hover.type === "wall") { x0 = hover.i; y0 = hover.j; w = 1; d = 1; } else { const q = targetPoint(hover); x0 = Math.floor(q.x); y0 = Math.floor(q.y); w = 1; d = 1; } g.beginPath(); const c1 = sp(x0, y0, 0), c2 = sp(x0 + w, y0, 0), c3 = sp(x0 + w, y0 + d, 0), c4 = sp(x0, y0 + d, 0); g.moveTo(c1[0], c1[1] + 0.5); g.lineTo(c2[0], c2[1] + 0.5); g.lineTo(c3[0], c3[1] + 0.5); g.lineTo(c4[0], c4[1] + 0.5); g.closePath(); g.stroke(); }
  }
  if (P.path && P.path.length) { g.fillStyle = "rgba(240,138,36,.6)"; for (const n of P.path) { const [a, b] = sp(n.x, n.y, 0); g.fillRect(Math.round(a), Math.round(b), 1, 1); } }
  // everything that stands up, back to front
  const list = [], pk = P.x + P.y;
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) { const c = T[j][i]; if (c === "#" || c === "S") { const kk = i + j + 1; let ghost = false; if (kk > pk + 0.2 && kk < pk + 4) { const [a, b] = sp(i + 0.5, j + 0.5, 0); ghost = Math.abs(a - pS[0]) < 22 && b > pS[1] - 4 && b < pS[1] + 34; } list.push({ k: kk, f: () => drawWall(i, j, ghost) }); } }
  for (const p of parts) { const kk = p.x + p.y; if (p.kind === "door" || p.kind === "airlock") { let ghost = false; if (kk > pk + 0.2 && kk < pk + 3) { const [a, b] = sp(p.x, p.y, 0); ghost = Math.abs(a - pS[0]) < 18 && b > pS[1] - 4 && b < pS[1] + 30; } list.push({ k: kk, f: () => drawDoor(p, ghost) }); } else list.push({ k: p.wall ? kk - 0.45 : kk, f: () => drawPart(p) }); }
  for (const it of items) list.push({ k: it.x + it.y - 0.4, f: () => drawItem(it) });
  for (const c of charges) list.push({ k: c.x + c.y, f: () => { const [a, b] = sp(c.x, c.y, 0); g.fillStyle = "#a83a2a"; g.fillRect(Math.round(a - 3), Math.round(b - 4), 6, 4); g.fillStyle = Math.floor(c.t * (c.t < 1 ? 8 : 2)) % 2 ? "#ff3a3a" : "#5a1a1a"; g.fillRect(Math.round(a), Math.round(b - 5), 1, 1); } });
  for (const [, f] of fires) list.push({ k: f.i + f.j + 1.05, f: () => { for (let k = 0; k < 4; k++) { const x = f.i + 0.2 + ((k * 0.37 + clock * 0.3) % 0.6), y = f.j + 0.2 + ((k * 0.53) % 0.6), hgt = 4 + Math.abs(Math.sin(clock * 9 + k * 2)) * 6; const [a, b] = sp(x, y, 0); g.fillStyle = "#ff5a2a"; g.fillRect(Math.round(a - 1), Math.round(b - hgt), 3, Math.round(hgt)); g.fillStyle = "#ffd27a"; g.fillRect(Math.round(a), Math.round(b - hgt * 0.6), 1, Math.round(hgt * 0.6)); } } });
  list.push({ k: pk, f: () => drawPlayer() });
  list.sort((a, b) => a.k - b.k); for (const d of list) d.f();
  // particles
  for (const p of fx) {
    if (p.rocket) { const [a, b] = sp(p.x, p.y, 8); drawPix(g, ICONS.tank, Math.round(a - 6), Math.round(b - 8)); continue; }
    if (p.ring) { const [a, b] = sp(p.x, p.y, 0); g.strokeStyle = "rgba(255,220,160," + (p.life / p.maxl) + ")"; g.lineWidth = 1; g.beginPath(); g.ellipse(a, b, p.r * TW / 2 * 1.2, p.r * TH / 2 * 1.2, 0, 0, TAU); g.stroke(); continue; }
    const [a, b] = sp(p.x, p.y, p.z); g.globalAlpha = clamp(p.life / p.max, 0, 1) * (p.smoke ? 0.5 : 1); g.fillStyle = p.c; const s = p.smoke ? p.s * (2 - p.life / p.max) : p.s; g.fillRect(Math.round(a - s / 2), Math.round(b - s / 2), Math.ceil(s), Math.ceil(s));
  }
  g.globalAlpha = 1;
  // work progress
  if (work && work.prog > 0) { const q = targetPoint(work.t), [a, b] = sp(q.x, q.y, (work.t.type === "part" ? PH[work.t.p.kind] || 10 : 10) + 6); g.fillStyle = "#000"; g.fillRect(Math.round(a - 9), Math.round(b), 18, 3); g.fillStyle = "#f08a24"; g.fillRect(Math.round(a - 8), Math.round(b + 1), Math.round(16 * work.prog), 1); }
  // darkness: no power on the derelict, a headlamp
  const inDerelict = !isShipTile(tileAt(Math.floor(P.x), Math.floor(P.y))) && tileAt(Math.floor(P.x), Math.floor(P.y)) !== "A";
  if (!powered() && inDerelict) {
    const gr = g.createRadialGradient(pS[0], pS[1] - 8, 10, pS[0], pS[1] - 8, 90); gr.addColorStop(0, "rgba(4,5,10,0)"); gr.addColorStop(1, "rgba(4,5,10,.82)"); g.fillStyle = gr; g.fillRect(0, 0, LW, LH);
    for (const [, f] of fires) { const [a, b] = sp(f.i + 0.5, f.j + 0.5, 4); const fg = g.createRadialGradient(a, b, 1, a, b, 30); fg.addColorStop(0, "rgba(255,140,60,.25)"); fg.addColorStop(1, "rgba(255,140,60,0)"); g.fillStyle = fg; g.fillRect(a - 30, b - 30, 60, 60); }
  }
  if (flash > 0) { g.fillStyle = "rgba(255,230,200," + flash * 0.5 + ")"; g.fillRect(0, 0, LW, LH); }
  if (P.hurtT > 0) { g.fillStyle = "rgba(255,40,30," + P.hurtT * 0.4 + ")"; g.fillRect(0, 0, LW, LH); }
  ctx.imageSmoothingEnabled = false; ctx.drawImage(L, 0, 0, LW * S, LH * S);
}

// ---- HUD ----
function iconCanvas(list, scale) { const c = document.createElement("canvas"); c.width = 12 * (scale || 1); c.height = 12 * (scale || 1); if (list) drawPix(c.getContext("2d"), list, 0, scale || 1, scale || 1); return c; }
function buildTools() {
  const box2 = $("tools"); box2.innerHTML = "";
  TOOLS.forEach((t, i) => { const b = document.createElement("button"); b.className = "slot"; b.type = "button"; b.dataset.k = t.k; b.title = t.name; b.appendChild(iconCanvas(t.icon, 3)); const n = document.createElement("b"); n.textContent = i + 1; b.appendChild(n); b.onclick = () => setTool(t.k); box2.appendChild(b); });
  setTool(tool);
}
function renderInv() {
  const h = $("hands"); h.innerHTML = ""; h.title = P.carry ? ITEMS[P.carry.type].name : ""; h.appendChild(iconCanvas(P.carry ? ICONS[P.carry.type] : null, 3));
  const pk = $("pack"); pk.innerHTML = "";
  for (let k = 0; k < 6; k++) { const it = P.pack[k], d = document.createElement("div"); d.className = "slot pack"; d.title = it ? ITEMS[it.type].name : ""; d.appendChild(iconCanvas(it ? ICONS[it.type] : null, 3)); pk.appendChild(d); }
}
let lastHud = "";
function hud() {
  $("credits").textContent = "$" + credits;
  $("h-hp").style.width = Math.max(0, P.hp) + "%"; $("h-o2").style.width = P.o2 + "%";
  const air = Math.round(airAt(P.x, P.y) * 100), r = reactor(), st = "Power " + (powered() ? "on" : "off") + " · Air " + air + "%" + (r && r.active ? "" : r && r.hot > 0 ? " · Core cooling" : "");
  if (st !== lastHud) { $("h-status").textContent = st; lastHud = st; }
  const pr = $("prompt");
  if (hover && !P.dead && mouse.x >= 0) {
    const a = action(hover, work ? work.tool : tool), tn = TOOLS.find((t) => t.k === (work ? work.tool : tool)).name;
    if (a) { const txt = a.bad ? a.label : "<em>" + tn + "</em> · " + a.label; if (pr.innerHTML !== txt) pr.innerHTML = txt; pr.className = "hud" + (a.bad ? " bad" : ""); }
    else if (pr.innerHTML) pr.innerHTML = "";
    pr.style.left = mouse.x + "px"; pr.style.top = mouse.y + "px";
  } else if (pr.innerHTML) pr.innerHTML = "";
}

// ---- layout + loop ----
function resize() {
  VW = innerWidth; VH = innerHeight; S = Math.max(2, Math.round(Math.min(VW / 420, VH / 250)));
  LW = Math.ceil(VW / S); LH = Math.ceil(VH / S); L.width = LW; L.height = LH; cv.width = LW * S; cv.height = LH * S; cv.style.width = LW * S + "px"; cv.style.height = LH * S + "px";
}
addEventListener("resize", resize); resize();
makeWorld(); P = newPlayer(); buildTools(); renderInv();
cam.x = IX(P.x, P.y); cam.y = IY(P.x, P.y, 10);
let last = performance.now();
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); draw(); hud(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
window.Salvage = { get state() { return { P, parts, items, rooms, groups, fires, credits, T, powered: powered() }; }, step, action, startWork, setTool, pickUp, makeWorld, explode, toScreen, get work() { return work; } };
})();
