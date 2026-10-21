// Breach.io (owner, 2026-10-20) — a top-down breach-and-clear. Single player for now: pick a callsign and loadout, spawn
// outside a procedurally built house, breach in, kill the whole red team and secure the payload. Vector (SVG) art drawn
// onto a canvas; line-of-sight vision; the red team wanders the rooms, hears gunfire, hunts and shoots back.
"use strict";
(() => {
const TAU = Math.PI * 2, hyp = Math.hypot, rnd = Math.random, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = (id) => document.getElementById(id);
const cv = $("view"), cx = cv.getContext("2d");
let VW = 0, VH = 0, DPR = 1;
function resize() { DPR = Math.min(devicePixelRatio || 1, 2); VW = innerWidth; VH = innerHeight; cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR); }
addEventListener("resize", resize); resize();

// ---------- the loadout ----------
const WEAPONS = {
  rifle:   { name: "Rifle",   dmg: 24, rate: 0.10, auto: true,  mag: 30, reload: 2.0, spread: 0.045, range: 1300, pellets: 1, len: 26, speed: 1, note: "Auto · 30" },
  smg:     { name: "SMG",     dmg: 16, rate: 0.065, auto: true, mag: 32, reload: 1.6, spread: 0.09,  range: 950,  pellets: 1, len: 18, speed: 1.08, note: "Fast · 32" },
  shotgun: { name: "Shotgun", dmg: 15, rate: 0.75, auto: false, mag: 6,  reload: 2.6, spread: 0.24,  range: 520,  pellets: 9, len: 24, speed: 1, note: "9 pellets · 6" },
  sniper:  { name: "Sniper",  dmg: 130, rate: 1.15, auto: false, mag: 5, reload: 2.6, spread: 0.004, range: 2200, pellets: 1, len: 34, speed: 0.88, pierce: true, note: "Pierces · 5" },
  pistol:  { name: "Pistol",  dmg: 28, rate: 0.22, auto: false, mag: 12, reload: 1.2, spread: 0.035, range: 1100, pellets: 1, len: 13, speed: 1.05 },
};
const NADES = { frag: { name: "Frag", note: "Blast · 2" }, flash: { name: "Flashbang", note: "Blinds · 2" } };
const pick = { primary: "rifle", nade: "frag" };
function optButtons(box, list, key) {
  const el = $(box); el.replaceChildren();
  for (const [k, v] of Object.entries(list)) {
    const b = document.createElement("button"); b.type = "button"; b.className = "opt" + (pick[key] === k ? " on" : "");
    b.innerHTML = v.name + "<small>" + v.note + "</small>";
    b.onclick = () => { pick[key] = k; optButtons(box, list, key); };
    el.appendChild(b);
  }
}
optButtons("o-primary", { rifle: WEAPONS.rifle, smg: WEAPONS.smg, shotgun: WEAPONS.shotgun, sniper: WEAPONS.sniper }, "primary");
optButtons("o-nade", NADES, "nade");
try { const s = JSON.parse(localStorage.getItem("breach.loadout") || "{}"); if (s.name) $("name").value = s.name; if (WEAPONS[s.primary]) pick.primary = s.primary; if (NADES[s.nade]) pick.nade = s.nade; if (s.count) $("count").value = s.count; } catch {}
optButtons("o-primary", { rifle: WEAPONS.rifle, smg: WEAPONS.smg, shotgun: WEAPONS.shotgun, sniper: WEAPONS.sniper }, "primary"); optButtons("o-nade", NADES, "nade");
$("count-n").textContent = $("count").value;
$("count").oninput = () => { $("count-n").textContent = $("count").value; };

// ---------- the SVG art (vector sprites, rasterized once) ----------
function svgImg(svg) { const im = new Image(); im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); return im; }
const opSvg = (body, trim, helmet) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="-32 -32 64 64">
  <ellipse cx="-2" cy="0" rx="13" ry="19" fill="${body}" stroke="#0b0e11" stroke-width="2.5"/>
  <rect x="-9" y="-12" width="12" height="24" rx="4" fill="${trim}" stroke="#0b0e11" stroke-width="2"/>
  <circle cx="13" cy="9" r="4.5" fill="${body}" stroke="#0b0e11" stroke-width="2"/>
  <circle cx="7" cy="-8" r="4.5" fill="${body}" stroke="#0b0e11" stroke-width="2"/>
  <circle cx="0" cy="0" r="9" fill="${helmet}" stroke="#0b0e11" stroke-width="2.5"/>
  <path d="M-3 -6 A7 7 0 0 1 6 -1" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-linecap="round"/>
</svg>`;
const SPR = {
  blue: svgImg(opSvg("#2f6fb8", "#1f4a7c", "#3d86d6")),
  red: svgImg(opSvg("#b83a32", "#7c241f", "#d64b40")),
  dead: svgImg(opSvg("#5a2a26", "#3a1b18", "#6b302b")),
  payload: svgImg(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="44" viewBox="0 0 60 44">
    <rect x="22" y="1" width="16" height="7" rx="2" fill="none" stroke="#0b0e11" stroke-width="3"/>
    <rect x="2" y="6" width="56" height="36" rx="5" fill="#3b4148" stroke="#0b0e11" stroke-width="3"/>
    <path d="M2 18 H58 M2 30 H58" stroke="#f1c04a" stroke-width="4"/>
    <rect x="25" y="20" width="10" height="8" rx="1.5" fill="#f1c04a" stroke="#0b0e11" stroke-width="2"/></svg>`),
  frag: svgImg(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-10 -10 20 20"><circle r="6.5" fill="#4b5a3a" stroke="#0b0e11" stroke-width="2"/><rect x="-2" y="-10" width="4" height="5" fill="#9aa0a6" stroke="#0b0e11" stroke-width="1.5"/></svg>`),
  flash: svgImg(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-10 -10 20 20"><rect x="-4.5" y="-7" width="9" height="14" rx="2" fill="#c9ced4" stroke="#0b0e11" stroke-width="2"/><rect x="-2" y="-10" width="4" height="4" fill="#9aa0a6" stroke="#0b0e11" stroke-width="1.5"/></svg>`),
};

// ---------- the map: open ground, one procedural house (rooms by splitting), doors, windows ----------
const T = 14;                                   // wall thickness
let walls, doors, rooms, house, payload, spawn, ground, floors = [], curF = null, stairs = [];
// (owner, 2026-10-20) the house has floors joined by stairs: each floor its own rooms, doors, windows, nav and decals;
// the code works on one floor at a time (useFloor sets the current one)
function useFloor(F) { curF = F; walls = F.walls; doors = F.doors; rooms = F.rooms; nav = F.nav; decals = F.decals; }
function genMap(nEnemies) {
  floors = []; stairs = [];
  const nF = nEnemies >= 22 ? 3 : 2;
  const W = 1000 + nEnemies * 18 + rnd() * 200, H = 700 + nEnemies * 12 + rnd() * 160;
  house = { x: 600, y: 520, w: Math.round(W), h: Math.round(H) };
  ground = { w: house.x * 2 + house.w, h: house.y * 2 + house.h };
  for (let f = 0; f < nF; f++) {
    walls = []; doors = []; rooms = []; decals = [];
    genFloor(f);
    const F = { i: f, walls, doors, rooms, decals, nav: null };
    useFloor(F); buildNav();
    if (f > 0) for (let j = 0; j < navH; j++) for (let i = 0; i < navW; i++) { const x = i * NC + NC / 2, y = j * NC + NC / 2; if (x < house.x + 14 || x > house.x + house.w - 14 || y < house.y + 14 || y > house.y + house.h - 14) nav[j * navW + i] = 1; }
    F.nav = nav; floors.push(F);
  }
  // stairs: a spot clear on every floor, up to two of them, well apart
  for (let k = 0; k < 2; k++) for (let t = 0; t < 400; t++) {
    const x = house.x + 70 + rnd() * (house.w - 140), y = house.y + 70 + rnd() * (house.h - 140);
    if (stairs.some((st) => hyp(st.x - x, st.y - y) < Math.min(house.w, house.h) * 0.5)) continue;
    if (floors.every((F) => { useFloor(F); return !blocksMove(x, y, 46); })) { stairs.push({ x, y, w: 64, h: 64 }); break; }
  }
  useFloor(floors[0]);
  if (!spawn) spawn = { x: house.x + house.w / 2, y: house.y - 260 };   // (no outer door fitted: in through a window)
  // the payload: on the top floor, in the room farthest from the stairs
  const top = floors[nF - 1], ref = stairs[0] || { x: house.x, y: house.y };
  let far = top.rooms[0], fd = -1;
  for (const r of top.rooms) { const d = hyp(r.x + r.w / 2 - ref.x, r.y + r.h / 2 - ref.y); if (d > fd) { fd = d; far = r; } }
  payload = { x: far.x + far.w / 2, y: far.y + far.h / 2, secured: false, prog: 0, room: far, f: nF - 1 };
}
function genFloor(fi) {
  const MIN = 190;
  // split rooms; each split wall gets a doorway (a door, or now and then an open archway)
  const splits = [];
  const split = (r, d) => {
    const canV = r.w >= MIN * 2, canH = r.h >= MIN * 2;
    if ((!canV && !canH) || (d > 2 && rnd() < 0.25 && r.w * r.h < 160000)) { rooms.push(r); return; }
    const vert = canV && (!canH || r.w > r.h * (0.8 + rnd() * 0.4));
    for (let tries = 0; tries < 12; tries++) {
      const s = vert ? Math.round(r.x + MIN + rnd() * (r.w - MIN * 2)) : Math.round(r.y + MIN + rnd() * (r.h - MIN * 2));
      // keep the new wall clear of doorways already on this room's edges
      const blocked = doors.some((dr) => vert ? Math.abs(dr.cx - s) < 60 && (Math.abs(dr.cy - r.y) < 20 || Math.abs(dr.cy - (r.y + r.h)) < 20)
                                              : Math.abs(dr.cy - s) < 60 && (Math.abs(dr.cx - r.x) < 20 || Math.abs(dr.cx - (r.x + r.w)) < 20));
      if (blocked) continue;
      const len = vert ? r.h : r.w, dw = 66, dp = (vert ? r.y : r.x) + 30 + rnd() * (len - 60 - dw);
      const seg = vert ? { vert, at: s, from: r.y, to: r.y + r.h } : { vert, at: s, from: r.x, to: r.x + r.w };
      buildWall(seg, [{ p: dp, len: dw, type: rnd() < 0.15 ? "arch" : "door" }]);
      splits.push(seg);
      if (vert) { split({ x: r.x, y: r.y, w: s - r.x, h: r.h }, d + 1); split({ x: s, y: r.y, w: r.x + r.w - s, h: r.h }, d + 1); }
      else { split({ x: r.x, y: r.y, w: r.w, h: s - r.y }, d + 1); split({ x: r.x, y: s, w: r.w, h: r.y + r.h - s }, d + 1); }
      return;
    }
    rooms.push(r);
  };
  split({ ...house }, 0);
  // the outer walls: 2-4 doors and a handful of windows, kept off the corners and the inner walls' ends
  const sides = [
    { vert: false, at: house.y, from: house.x, to: house.x + house.w, out: [0, -1] },
    { vert: false, at: house.y + house.h, from: house.x, to: house.x + house.w, out: [0, 1] },
    { vert: true, at: house.x, from: house.y, to: house.y + house.h, out: [-1, 0] },
    { vert: true, at: house.x + house.w, from: house.y, to: house.y + house.h, out: [1, 0] },
  ];
  const nDoors = fi === 0 ? 2 + Math.floor(rnd() * 3) : 0, doorSides = sides.map((_, i) => i).sort(() => rnd() - 0.5).slice(0, nDoors);
  for (let i = 0; i < 4; i++) {
    const sd = sides[i], ops = [], ends = splits.filter((sp) => sp.vert !== sd.vert && (sp.from === sd.at || sp.to === sd.at)).map((sp) => sp.at);
    const free = (p, len) => p > sd.from + 40 && p + len < sd.to - 40 && !ends.some((e) => e > p - 30 && e < p + len + 30) && !ops.some((o) => p < o.p + o.len + 40 && p + len > o.p - 40);
    if (doorSides.includes(i)) for (let t = 0; t < 40; t++) { const p = sd.from + rnd() * (sd.to - sd.from); if (free(p, 66)) { ops.push({ p, len: 66, type: "door", out: sd.out }); break; } }
    const nWin = 1 + Math.floor(rnd() * 3);
    for (let w = 0; w < nWin; w++) for (let t = 0; t < 40; t++) { const len = 70 + rnd() * 50, p = sd.from + rnd() * (sd.to - sd.from); if (free(p, len)) { ops.push({ p, len, type: "glass" }); break; } }
    buildWall({ ...sd, from: sd.from - T / 2, to: sd.to + T / 2 }, ops);
    if (ops.some((o) => o.type === "door")) { const o = ops.find((o2) => o2.type === "door"), mid = o.p + o.len / 2;
      spawn = spawn || (sd.vert ? { x: sd.at + sd.out[0] * 260, y: mid } : { x: mid, y: sd.at + sd.out[1] * 260 }); }
  }
}
// a wall line with its openings: solid stretches become wall boxes; openings become doors, glass or archways
function buildWall(seg, ops) {
  ops.sort((a, b) => a.p - b.p);
  let cur = seg.from;
  const box = (a, b, kind) => { if (b - a < 2) return; const r = seg.vert ? { x: seg.at - T / 2, y: a, w: T, h: b - a } : { x: a, y: seg.at - T / 2, w: b - a, h: T }; r.kind = kind; walls.push(r); return r; };
  for (const o of ops) {
    box(cur, o.p, "wall");
    if (o.type === "door") {
      const r = seg.vert ? { x: seg.at - T / 2 + 3, y: o.p, w: T - 6, h: o.len } : { x: o.p, y: seg.at - T / 2 + 3, w: o.len, h: T - 6 };
      doors.push({ ...r, vert: seg.vert, open: false, hp: 70, broken: false, cx: r.x + r.w / 2, cy: r.y + r.h / 2, swing: 0 });
    } else if (o.type === "glass") { const g = box(o.p, o.p + o.len, "glass"); g.hp = 1; }
    cur = o.p + o.len;
  }
  box(cur, seg.to, "wall");
}

// ---------- geometry ----------
const solidDoor = (d) => !d.open && !d.broken;
function rayRect(ox, oy, dx, dy, r, maxT) {      // slab test: distance along a unit ray to the box, or Infinity
  let t0 = 0, t1 = maxT;
  if (Math.abs(dx) < 1e-9) { if (ox < r.x || ox > r.x + r.w) return Infinity; } else { let a = (r.x - ox) / dx, b = (r.x + r.w - ox) / dx; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return Infinity; }
  if (Math.abs(dy) < 1e-9) { if (oy < r.y || oy > r.y + r.h) return Infinity; } else { let a = (r.y - oy) / dy, b = (r.y + r.h - oy) / dy; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return Infinity; }
  return t0;
}
// what stops sight: walls and shut doors (glass doesn't); what stops bullets: walls, shut doors and glass (which breaks)
function castSight(ox, oy, dx, dy, maxT, list) { let best = maxT; for (const r of list) { const t = rayRect(ox, oy, dx, dy, r, best); if (t < best) best = t; } return best; }
function sightList(x, y, R) {
  const out = [];
  for (const w of walls) if (w.kind === "wall" && w.x < x + R && w.x + w.w > x - R && w.y < y + R && w.y + w.h > y - R) out.push(w);
  for (const d of doors) if (solidDoor(d) && Math.abs(d.cx - x) < R + 60 && Math.abs(d.cy - y) < R + 60) out.push(d);
  return out;
}
function los(ax, ay, bx, by) {
  const L = hyp(bx - ax, by - ay); if (L < 1) return true;
  const dx = (bx - ax) / L, dy = (by - ay) / L;
  for (const w of walls) if (w.kind === "wall" && rayRect(ax, ay, dx, dy, w, L) < L) return false;
  for (const d of doors) if (solidDoor(d) && rayRect(ax, ay, dx, dy, d, L) < L) return false;
  return true;
}
function blocksMove(x, y, r, agent) {           // circle vs walls, glass and shut doors (an AI shoves a shut door open)
  for (const w of walls) if (x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h) {
    const nx = clamp(x, w.x, w.x + w.w), ny = clamp(y, w.y, w.y + w.h); if (hyp(x - nx, y - ny) < r) return true; }
  for (const d of doors) if (solidDoor(d) && x + r > d.x && x - r < d.x + d.w && y + r > d.y && y - r < d.y + d.h) {
    const nx = clamp(x, d.x, d.x + d.w), ny = clamp(y, d.y, d.y + d.h);
    if (hyp(x - nx, y - ny) < r) { if (agent && agent.ai) { openDoor(d, agent); continue; } return true; } }
  if (curF && curF.i > 0 && (x - r < house.x || y - r < house.y || x + r > house.x + house.w || y + r > house.y + house.h)) return true;   // (upstairs: nowhere to go outside)
  return x < r || y < r || x > ground.w - r || y > ground.h - r;
}
function moveAgent(a, vx, vy, dt) {
  const nx = a.x + vx * dt, ny = a.y + vy * dt;
  if (!blocksMove(nx, ny, a.r, a)) { a.x = nx; a.y = ny; return true; }
  if (!blocksMove(nx, a.y, a.r, a)) { a.x = nx; return true; }
  if (!blocksMove(a.x, ny, a.r, a)) { a.y = ny; return true; }
  return false;
}
function openDoor(d, who) { if (d.broken) return; d.open = !d.open; d.swingDir = who ? Math.sign((d.vert ? who.x - d.cx : who.y - d.cy)) || 1 : 1; if (!who || !who.ai) sound(d.cx, d.cy, 260); }

// ---------- navigation: a grid over the ground, walls blocked (doors are passable for the red team, they open them) ----------
const NC = 20; let navW, navH, nav;
function buildNav() {
  navW = Math.ceil(ground.w / NC); navH = Math.ceil(ground.h / NC); nav = new Uint8Array(navW * navH);
  for (let j = 0; j < navH; j++) for (let i = 0; i < navW; i++) {
    const x = i * NC + NC / 2, y = j * NC + NC / 2; let b = 0;
    for (const w of walls) if (x + 14 > w.x && x - 14 < w.x + w.w && y + 14 > w.y && y - 14 < w.y + w.h) { b = 1; break; }
    nav[j * navW + i] = b;
  }
}
function findPath(ax, ay, bx, by) {               // A* on the grid; returns world points
  const si = clamp(Math.floor(ax / NC), 0, navW - 1), sj = clamp(Math.floor(ay / NC), 0, navH - 1), ti = clamp(Math.floor(bx / NC), 0, navW - 1), tj = clamp(Math.floor(by / NC), 0, navH - 1);
  const start = sj * navW + si, goal = tj * navW + ti; if (nav[goal]) return null;
  const g = new Float32Array(navW * navH).fill(1e9), from = new Int32Array(navW * navH).fill(-1), open = [start], inOpen = new Uint8Array(navW * navH);
  g[start] = 0; inOpen[start] = 1; let iter = 0;
  const hh = (k) => hyp(k % navW - ti, Math.floor(k / navW) - tj);
  while (open.length && iter++ < 6000) {
    let bi = 0, bf = 1e9; for (let k = 0; k < open.length; k++) { const f = g[open[k]] + hh(open[k]); if (f < bf) { bf = f; bi = k; } }
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop(); inOpen[cur] = 0;
    if (cur === goal) break;
    const ci = cur % navW, cj = Math.floor(cur / navW);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= navW || nj >= navH) continue;
      const nk = nj * navW + ni; if (nav[nk]) continue; if (di && dj && (nav[cj * navW + ni] || nav[nj * navW + ci])) continue;
      const ng = g[cur] + (di && dj ? 1.414 : 1); if (ng < g[nk]) { g[nk] = ng; from[nk] = cur; if (!inOpen[nk]) { open.push(nk); inOpen[nk] = 1; } }
    }
  }
  if (from[goal] < 0 && goal !== start) return null;
  const pts = []; for (let k = goal; k !== -1 && k !== start; k = from[k]) pts.push({ x: (k % navW) * NC + NC / 2, y: Math.floor(k / navW) * NC + NC / 2 });
  pts.reverse(); return pts;
}

// ---------- the game state ----------
let P, enemies, tracers, nades, booms, decals, parts, feed, stats, playing = false, ended = false, tStart = 0;
const keys = new Set(), mouse = { x: 0, y: 0, down: false };
const cam = { x: 0, y: 0 };
function newPlayer(name) {
  const prim = { ...WEAPONS[pick.primary], key: pick.primary }, sec = { ...WEAPONS.pistol, key: "pistol" };
  prim.ammo = prim.mag; sec.ammo = sec.mag; prim.reserve = prim.mag * 4; sec.reserve = Infinity;
  return { name, f: 0, x: spawn.x, y: spawn.y, r: 13, h: 0, hp: 100, guns: [prim, sec], gi: 0, cool: 0, reloading: 0, nade: pick.nade, nades: 2, team: "blue", flash: 0, kick: 0 };
}
function newEnemy(x, y, f) { return { ai: true, f, x, y, r: 13, h: rnd() * TAU, role: rnd() < 0.7 ? "hold" : "roam", post: null, hp: 100, team: "red", state: "wander", path: null, pi: 0, wait: rnd() * 2, react: 0, burst: 0, cool: 0, seen: null, searchT: 0, flash: 0, alert: 0, lastSeenT: 0 }; }
function start() {
  const name = ($("name").value || "Operator").trim().slice(0, 16) || "Operator", n = +$("count").value;
  try { localStorage.setItem("breach.loadout", JSON.stringify({ name, primary: pick.primary, nade: pick.nade, count: n })); } catch {}
  spawn = null; enemies = []; genMap(n);
  P = newPlayer(name);
  // the red team: spread over the floors and rooms (a couple always guard the payload); most hold a post — a spot in
  // their room watching its doorway — and the rest roam (owner, 2026-10-20: they bunker in)
  const guards = Math.min(2, n), allRooms = floors.flatMap((F) => F.rooms.map((r) => ({ r, F })));
  for (let i = 0; i < n; i++) {
    const { r, F } = i < guards ? { r: payload.room, F: floors[payload.f] } : allRooms[Math.floor(rnd() * allRooms.length)];
    useFloor(F);
    for (let t = 0; t < 30; t++) {
      const x = r.x + 30 + rnd() * (r.w - 60), y = r.y + 30 + rnd() * (r.h - 60);
      if (blocksMove(x, y, 14) || (F.i === payload.f && hyp(x - payload.x, y - payload.y) < 40) || enemies.some((o) => o.f === F.i && hyp(o.x - x, o.y - y) < 60)) continue;
      const e = newEnemy(x, y, F.i), dr = F.doors.filter((d) => d.cx >= r.x - 10 && d.cx <= r.x + r.w + 10 && d.cy >= r.y - 10 && d.cy <= r.y + r.h + 10).sort((a, b) => hyp(a.cx - x, a.cy - y) - hyp(b.cx - x, b.cy - y))[0];
      e.post = { x, y, h: dr ? Math.atan2(dr.cy - y, dr.cx - x) : Math.atan2(r.y + r.h / 2 - y, r.x + r.w / 2 - x) }; e.h = e.post.h;
      enemies.push(e); break;
    }
  }
  useFloor(floors[0]);
  tracers = []; nades = []; booms = []; parts = []; feed = [];
  stats = { shots: 0, hits: 0, kills: 0 }; tStart = performance.now(); playing = true; ended = false;
  cam.x = P.x; cam.y = P.y;
  $("menu").hidden = true; $("end").hidden = true; $("hud").hidden = false; $("h-name").textContent = name;
  $("feed").replaceChildren();
}
$("go").onclick = start; $("again").onclick = start;
$("loadout").onclick = () => { $("end").hidden = true; $("menu").hidden = false; $("hud").hidden = true; playing = false; };
$("name").addEventListener("keydown", (e) => { if (e.key === "Enter") start(); });

// ---------- input ----------
addEventListener("keydown", (e) => {
  if (!playing || e.target.tagName === "INPUT") return;
  keys.add(e.code);
  if (e.code === "KeyR") reload();
  if (e.code === "Digit1") switchGun(0);
  if (e.code === "Digit2") switchGun(1);
  if (e.code === "KeyQ") switchGun(1 - P.gi);
  if (e.code === "KeyF") throwNade();   // (owner, 2026-10-20) F throws, right mouse aims
  if (e.code === "KeyE") useKey();
  if (["Space", "Tab"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
cv.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener("mousedown", (e) => { if (e.button === 0) { mouse.down = true; mouse.fresh = true; } if (e.button === 2) mouse.aim = true; });
addEventListener("mouseup", (e) => { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.aim = false; });
addEventListener("blur", () => { mouse.down = mouse.aim = false; keys.clear(); });
cv.addEventListener("contextmenu", (e) => e.preventDefault());
addEventListener("wheel", (e) => { if (playing) switchGun(1 - P.gi); }, { passive: true });
const toWorld = (sx, sy) => [cam.x + (sx - VW / 2) / ZOOM, cam.y + (sy - VH / 2) / ZOOM];
const ZOOM = 1.25;

function gun() { return P.guns[P.gi]; }
function switchGun(i) { if (i === P.gi) return; P.gi = i; P.reloading = 0; P.cool = 0.25; }
function reload() { const g = gun(); if (P.reloading || g.ammo >= g.mag || g.reserve <= 0) return; P.reloading = g.reload; }
function useKey() {
  // (owner, 2026-10-20) on the stairs: up or down a floor
  const st = stairs.find((s2) => Math.abs(P.x - s2.x) < s2.w / 2 + 6 && Math.abs(P.y - s2.y) < s2.h / 2 + 6);
  if (st) { const up = P.f < floors.length - 1, dn = P.f > 0; P.f = up && (!dn || P.y < st.y) ? P.f + 1 : P.f - 1; useFloor(floors[P.f]); P.floorT = 0.35; return; }
  // the nearest door within reach toggles; at the payload, holding E secures it (handled in the step)
  let best = null, bd = 70; for (const d of doors) { if (d.broken) continue; const dd = hyp(d.cx - P.x, d.cy - P.y); if (dd < bd) { bd = dd; best = d; } }
  if (best && (P.f !== payload.f || hyp(payload.x - P.x, payload.y - P.y) > 60)) openDoor(best, P);
}
function throwNade() {
  if (!playing || P.nades <= 0) return; P.nades--;
  const [wx, wy] = toWorld(mouse.x, mouse.y), d = Math.min(520, hyp(wx - P.x, wy - P.y)), a = Math.atan2(wy - P.y, wx - P.x), sp = 2.2 * d + 80;
  nades.push({ f: P.f, kind: P.nade, x: P.x + Math.cos(a) * 18, y: P.y + Math.sin(a) * 18, vx: Math.cos(a) * sp * 0.55, vy: Math.sin(a) * sp * 0.55, fuse: P.nade === "frag" ? 1.7 : 1.3, rot: 0, owner: P });
}

// ---------- shooting ----------
function shoot(from, g, ang, isPlayer) {
  for (let k = 0; k < g.pellets; k++) {
    const a = ang + (rnd() - 0.5) * 2 * g.spread * (isPlayer ? (mouse.aim ? 0.35 : 1) * (keys.has("ShiftLeft") ? 0.7 : 1) : 1);   // (aiming down sights tightens the spread)
    const dx = Math.cos(a), dy = Math.sin(a), ox = from.x + dx * 16, oy = from.y + dy * 16;
    let maxT = g.range, hitWall = null;
    for (const w of walls) { const t = rayRect(ox, oy, dx, dy, w, maxT); if (t < maxT) { maxT = t; hitWall = w; } }
    let hitDoor = null; for (const d of doors) if (solidDoor(d)) { const t = rayRect(ox, oy, dx, dy, d, maxT); if (t < maxT) { maxT = t; hitDoor = d; hitWall = null; } }
    // characters along the ray (the sniper goes through them)
    const targets = (isPlayer ? enemies.filter((e) => e.hp > 0 && e.f === P.f) : (P.hp > 0 && P.f === from.f ? [P] : [])).map((c) => { const ex = c.x - ox, ey = c.y - oy, al = ex * dx + ey * dy, pp = Math.abs(ex * dy - ey * dx); return al > 0 && al < maxT && pp < c.r ? { c, t: al - Math.sqrt(Math.max(0, c.r * c.r - pp * pp)) } : null; }).filter(Boolean).sort((a2, b) => a2.t - b.t);
    let end = maxT, dmg = g.dmg;
    for (const h of targets) {
      const fall = g.pellets > 1 ? clamp(1.25 - h.t / g.range, 0.35, 1) : 1;
      hurt(h.c, dmg * fall, from, a); if (isPlayer) stats.hits++;
      if (!g.pierce) { end = h.t; hitWall = hitDoor = null; break; } dmg *= 0.7;
    }
    if (hitWall && hitWall.kind === "glass") { breakGlass(hitWall); }
    if (hitDoor) { hitDoor.hp -= g.dmg; puff(ox + dx * end, oy + dy * end, "#8a6a44"); if (hitDoor.hp <= 0) { hitDoor.broken = true; for (let j = 0; j < 10; j++) puff(hitDoor.cx, hitDoor.cy, "#8a6a44"); sound(hitDoor.cx, hitDoor.cy, 500); } }
    else if (hitWall && end === maxT) puff(ox + dx * end, oy + dy * end, "#9aa0a6");
    tracers.push({ f: curF.i, x0: ox, y0: oy, x1: ox + dx * end, y1: oy + dy * end, t: 0.07, c: isPlayer ? "#ffe9a8" : "#ff9a8a" });
  }
  if (isPlayer) { stats.shots++; sound(from.x, from.y, 750); P.kick = 1; }
}
function breakGlass(w) { const i = walls.indexOf(w); if (i < 0) return; walls.splice(i, 1); for (let j = 0; j < 14; j++) parts.push({ f: curF.i, x: w.x + rnd() * w.w, y: w.y + rnd() * w.h, vx: (rnd() - 0.5) * 160, vy: (rnd() - 0.5) * 160, life: 0.6 + rnd() * 0.5, c: "#bfe6ff", s: 2.5 }); decals.push({ glass: true, x: w.x, y: w.y, w: w.w, h: w.h }); buildNavPatch(w); sound(w.x + w.w / 2, w.y + w.h / 2, 420); }
function buildNavPatch(w) { for (let j = Math.floor((w.y - 20) / NC); j <= Math.floor((w.y + w.h + 20) / NC); j++) for (let i = Math.floor((w.x - 20) / NC); i <= Math.floor((w.x + w.w + 20) / NC); i++) { if (i < 0 || j < 0 || i >= navW || j >= navH) continue; const x = i * NC + NC / 2, y = j * NC + NC / 2; let b = 0; for (const v of walls) if (x + 14 > v.x && x - 14 < v.x + v.w && y + 14 > v.y && y - 14 < v.y + v.h) { b = 1; break; } nav[j * navW + i] = b; } }
function hurt(c, dmg, from, ang) {
  if (c.hp <= 0) return;
  c.hp -= dmg; for (let j = 0; j < 4; j++) parts.push({ f: curF.i, x: c.x, y: c.y, vx: Math.cos(ang) * 120 + (rnd() - 0.5) * 90, vy: Math.sin(ang) * 120 + (rnd() - 0.5) * 90, life: 0.35, c: "#c0302a", s: 3 });
  if (c.ai && c.hp > 0) { c.state = "combat"; c.seen = { x: from.x, y: from.y }; c.react = Math.min(c.react, 0.15); c.lastSeenT = 0; }
  if (c.hp <= 0) {
    decals.push({ x: c.x + Math.cos(ang) * 10, y: c.y + Math.sin(ang) * 10, r: 16 + rnd() * 10 });
    if (c.ai) { c.deadH = ang; stats.kills++; addFeed(P.name + " ▸ red operator"); sound(c.x, c.y, 300); }
    else lose();
  }
}
function addFeed(t) { const d = document.createElement("div"); d.textContent = t; $("feed").prepend(d); setTimeout(() => d.remove(), 4200); }
function puff(x, y, c) { for (let j = 0; j < 3; j++) parts.push({ f: curF.i, x, y, vx: (rnd() - 0.5) * 90, vy: (rnd() - 0.5) * 90, life: 0.3 + rnd() * 0.2, c, s: 2.2 }); }
// noise: everyone on the red team within earshot (through walls) comes to look
// (owner, 2026-10-20: they bunkered too little and came in packs) only the nearest two go to look — roamers first —
// the rest turn toward the noise and hold, watching
function sound(x, y, R) {
  if (!enemies || !curF) return;
  const near = enemies.filter((e) => e.hp > 0 && e.f === curF.i && e.state !== "combat" && hyp(e.x - x, e.y - y) < R)
    .sort((a, b) => (a.role === "roam" ? 0 : 400) + hyp(a.x - x, a.y - y) - ((b.role === "roam" ? 0 : 400) + hyp(b.x - x, b.y - y)));
  near.forEach((e, k) => {
    if (k < 2 && e.state !== "investigate") { e.state = "investigate"; e.seen = { x: x + (rnd() - 0.5) * 60, y: y + (rnd() - 0.5) * 60 }; e.path = null; }
    else if (e.state !== "investigate") { e.state = "watch"; e.watchT = 6 + rnd() * 4; e.watchH = Math.atan2(y - e.y, x - e.x); e.path = null; }
  });
}

// ---------- the step ----------
function step(dt) {
  if (!playing) return;
  const g = gun();
  // move
  let mx = 0, my = 0; if (keys.has("KeyW")) my--; if (keys.has("KeyS")) my++; if (keys.has("KeyA")) mx--; if (keys.has("KeyD")) mx++;
  const ml = hyp(mx, my), walk = keys.has("ShiftLeft") || keys.has("ShiftRight"), sp = (walk ? 105 : 200) * (g.speed || 1) * (mouse.aim ? 0.6 : 1);   // (aiming slows you)
  if (ml && P.hp > 0) moveAgent(P, mx / ml * sp, my / ml * sp, dt);
  const [wx, wy] = toWorld(mouse.x, mouse.y); P.h = Math.atan2(wy - P.y, wx - P.x);
  // fire / reload
  P.cool -= dt; P.kick = Math.max(0, P.kick - dt * 8);
  if (P.reloading > 0) { P.reloading -= dt; if (P.reloading <= 0) { const need = g.mag - g.ammo, take = Math.min(need, g.reserve); g.ammo += take; if (g.reserve !== Infinity) g.reserve -= take; P.reloading = 0; } }
  else if (mouse.down && P.cool <= 0 && P.hp > 0 && P.flash <= 0.5) {
    if (g.ammo > 0) { if (g.auto || mouse.fresh) { shoot(P, g, P.h, true); g.ammo--; P.cool = g.rate; } }
    else reload();
    mouse.fresh = false;
  }
  if (!mouse.down) mouse.fresh = false;
  P.flash = Math.max(0, P.flash - dt);
  P.floorT = Math.max(0, (P.floorT || 0) - dt);
  // the payload: hold E beside it
  const nearPay = !payload.secured && P.f === payload.f && hyp(payload.x - P.x, payload.y - P.y) < 60;
  if (nearPay && keys.has("KeyE")) { payload.prog = Math.min(1, payload.prog + dt / 3); if (payload.prog >= 1) { payload.secured = true; addFeed("Payload secured"); } }
  else if (!payload.secured) payload.prog = Math.max(0, payload.prog - dt * 0.5);
  $("secure").hidden = !(nearPay || (payload.prog > 0 && !payload.secured)); $("h-sec").style.width = (payload.prog * 100) + "%";
  // the red team
  for (const e of enemies) if (e.hp > 0) { useFloor(floors[e.f]); think(e, dt); }
  // grenades
  for (let i = nades.length - 1; i >= 0; i--) {
    const n = nades[i]; useFloor(floors[n.f]); n.fuse -= dt; n.rot += dt * 10;
    const nx = n.x + n.vx * dt, ny = n.y + n.vy * dt;
    if (blocksMove(nx, n.y, 5)) n.vx *= -0.5; else n.x = nx;
    if (blocksMove(n.x, ny, 5)) n.vy *= -0.5; else n.y = ny;
    const f = Math.pow(0.12, dt); n.vx *= f; n.vy *= f;
    if (n.fuse <= 0) { nades.splice(i, 1); detonate(n); }
  }
  useFloor(floors[P.f]);
  for (let i = booms.length - 1; i >= 0; i--) { booms[i].t += dt; if (booms[i].t > booms[i].life) booms.splice(i, 1); }
  for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].t -= dt; if (tracers[i].t <= 0) tracers.splice(i, 1); }
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; if (p.life <= 0) parts.splice(i, 1); }
  for (const F of floors) for (const d of F.doors) { const want = d.open ? 1 : 0; d.swing += (want - d.swing) * Math.min(1, dt * 12); }
  // the win: every red operator down and the payload secured
  const alive = enemies.filter((e) => e.hp > 0).length;
  if (!ended && alive === 0 && payload.secured) win();
  // hud
  $("h-hp").style.width = Math.max(0, P.hp) + "%"; $("h-red").textContent = alive;
  $("h-pay").textContent = payload.secured ? "SECURED" : "FLOOR " + (payload.f + 1);
  $("h-wpn").textContent = g.name + (P.reloading ? " · reloading" : "");
  $("h-ammo").textContent = g.ammo + " / " + (g.reserve === Infinity ? "∞" : g.reserve);
  $("h-nade").textContent = NADES[P.nade].name + " × " + P.nades;
  const s = Math.floor((performance.now() - tStart) / 1000); $("h-time").textContent = "Floor " + (P.f + 1) + " · " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function detonate(n) {
  booms.push({ f: n.f, x: n.x, y: n.y, t: 0, life: n.kind === "frag" ? 0.5 : 0.35, kind: n.kind });
  if (n.kind === "frag") {
    for (const c of [P, ...enemies]) { if (c.hp <= 0 || c.f !== n.f) continue; const d = hyp(c.x - n.x, c.y - n.y); if (d < 190 && los(n.x, n.y, c.x, c.y)) hurt(c, 130 * (1 - d / 190) + 10, n, Math.atan2(c.y - n.y, c.x - n.x)); }
    for (const w of [...walls]) if (w.kind === "glass" && hyp(w.x + w.w / 2 - n.x, w.y + w.h / 2 - n.y) < 160) breakGlass(w);
    for (const d of doors) if (!d.broken && hyp(d.cx - n.x, d.cy - n.y) < 110) { d.broken = true; for (let j = 0; j < 8; j++) puff(d.cx, d.cy, "#8a6a44"); }
    for (let j = 0; j < 30; j++) { const a = rnd() * TAU, v = 80 + rnd() * 260; parts.push({ f: curF.i, x: n.x, y: n.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + rnd() * 0.4, c: rnd() < 0.5 ? "#ffb347" : "#5c5c5c", s: 3 }); }
    decals.push({ scorch: true, x: n.x, y: n.y, r: 40 });
    sound(n.x, n.y, 900);
  } else {
    for (const c of [P, ...enemies]) { if (c.hp <= 0 || c.f !== n.f) continue; const d = hyp(c.x - n.x, c.y - n.y); if (d < 420 && los(n.x, n.y, c.x, c.y)) c.flash = Math.max(c.flash, 3.2 * (1 - d / 520)); }
    sound(n.x, n.y, 700);
  }
}

// ---------- the red team's mind ----------
function think(e, dt) {
  e.flash = Math.max(0, e.flash - dt); e.cool -= dt;
  const blind = e.flash > 0.3, d = hyp(P.x - e.x, P.y - e.y), toP = Math.atan2(P.y - e.y, P.x - e.x);
  const facing = Math.abs(Math.atan2(Math.sin(toP - e.h), Math.cos(toP - e.h)));
  const onScreen = Math.abs(e.x - cam.x) < VW / 2 / ZOOM - 10 && Math.abs(e.y - cam.y) < VH / 2 / ZOOM - 10;   // (owner, 2026-10-20) they can't see you from anywhere you can't see them
  const sees = P.hp > 0 && e.f === P.f && !blind && onScreen && d < (e.state === "combat" ? 650 : 450) && (facing < 1.15 || d < 140 || e.state === "combat") && los(e.x, e.y, P.x, P.y);
  if (sees) {
    if (e.state !== "combat") { e.react = 0.35 + rnd() * 0.35; e.alert = 0; }
    e.state = "combat"; e.seen = { x: P.x, y: P.y }; e.lastSeenT = 0; e.path = null;
    e.alert = Math.min(1, e.alert + dt * 0.6);
    e.h = turnTo(e.h, toP, dt * 7);
    e.react -= dt;
    if (e.react <= 0 && e.cool <= 0 && facing < 0.25) {
      if (e.burst <= 0) e.burst = 3 + Math.floor(rnd() * 3);
      const moving = keys.has("KeyW") || keys.has("KeyA") || keys.has("KeyS") || keys.has("KeyD");
      shoot(e, { dmg: 8, pellets: 1, spread: (0.08 + (moving ? 0.07 : 0) + d / 7000) * (1.5 - e.alert * 0.6), range: 1000 }, e.h, false);
      e.burst--; e.cool = e.burst > 0 ? 0.11 : 0.55 + rnd() * 0.5;
    }
    // sidestep a little while fighting
    if (!e.strafe || e.strafeT <= 0) { e.strafe = rnd() < 0.5 ? -1 : 1; e.strafeT = 0.6 + rnd(); }
    e.strafeT -= dt; const sa = toP + e.strafe * Math.PI / 2, ss = e.role === "hold" ? 25 : 55; moveAgent(e, Math.cos(sa) * ss, Math.sin(sa) * ss, dt);
    return;
  }
  if (blind) { e.h += dt * 3; moveAgent(e, Math.cos(e.h) * 40, Math.sin(e.h) * 40, dt); return; }
  // lost sight in a fight: a holder stays put, covering where you were; a roamer hunts you down
  if (e.state === "combat" && e.role === "hold") { e.state = "watch"; e.watchT = 7 + rnd() * 5; e.watchH = e.seen ? Math.atan2(e.seen.y - e.y, e.seen.x - e.x) : e.h; }
  if (e.state === "watch") {
    e.watchT -= dt; e.h = turnTo(e.h, e.watchH + Math.sin(performance.now() / 600 + e.x) * 0.25, dt * 4);
    if (e.watchT <= 0) { e.state = "wander"; e.path = null; }
    return;
  }
  if (e.state === "combat" || e.state === "investigate") {
    e.lastSeenT += dt;
    if (!e.path && e.seen) { e.path = findPath(e.x, e.y, e.seen.x, e.seen.y) || []; e.pi = 0; }
    if (followPath(e, e.state === "combat" ? 150 : 115, dt)) { e.state = "search"; e.searchT = 5 + rnd() * 4; e.path = null; }
    return;
  }
  if (e.state === "search") {
    e.searchT -= dt; e.h += Math.sin(performance.now() / 500 + e.x) * dt * 2;
    if (!e.path || e.pi >= e.path.length) { const a = rnd() * TAU, dd = 80 + rnd() * 160; e.path = findPath(e.x, e.y, e.x + Math.cos(a) * dd, e.y + Math.sin(a) * dd) || []; e.pi = 0; }
    followPath(e, 90, dt);
    if (e.searchT <= 0) { e.state = "wander"; e.path = null; }
    return;
  }
  // a holder goes back to its post and watches its doorway
  if (e.role === "hold" && e.post) {
    if (hyp(e.post.x - e.x, e.post.y - e.y) > 14) { if (!e.path || e.pi >= e.path.length) { e.path = findPath(e.x, e.y, e.post.x, e.post.y) || []; e.pi = 0; } if (followPath(e, 80, dt)) e.path = null; }
    else e.h = turnTo(e.h, e.post.h + Math.sin(performance.now() / 900 + e.y) * 0.6, dt * 2);
    return;
  }
  // a roamer wanders room to room, pausing to look around
  if (e.wait > 0) { e.wait -= dt; e.h += Math.sin(performance.now() / 700 + e.y) * dt * 1.2; return; }
  if (!e.path || e.pi >= e.path.length) {
    const r = rnd() < 0.7 ? roomOf(e.x, e.y) || rooms[0] : rooms[Math.floor(rnd() * rooms.length)];
    e.path = findPath(e.x, e.y, r.x + 30 + rnd() * (r.w - 60), r.y + 30 + rnd() * (r.h - 60)) || []; e.pi = 0;
  }
  if (followPath(e, 70, dt)) { e.wait = 1 + rnd() * 3; e.path = null; }
}
function followPath(e, speed, dt) {
  if (!e.path || e.pi >= e.path.length) return true;
  const p = e.path[e.pi], dx = p.x - e.x, dy = p.y - e.y, L = hyp(dx, dy);
  if (L < 8) { e.pi++; return e.pi >= e.path.length; }
  e.h = turnTo(e.h, Math.atan2(dy, dx), dt * 6);
  if (!moveAgent(e, dx / L * speed, dy / L * speed, dt)) { e.stuck = (e.stuck || 0) + dt; if (e.stuck > 0.8) { e.stuck = 0; e.path = null; return true; } } else e.stuck = 0;
  return false;
}
function turnTo(h, want, k) { const d = Math.atan2(Math.sin(want - h), Math.cos(want - h)); return h + clamp(d, -k, k); }
function roomOf(x, y) { return rooms.find((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h); }

function win() { ended = true; playing = false; endScreen("CLEARED", "blue"); }
function lose() { if (ended) return; ended = true; setTimeout(() => { playing = false; endScreen("DOWN", "red"); }, 900); }
function endScreen(title, col) {
  $("end-title").innerHTML = '<span class="' + col + '">' + title + "</span>";
  const s = Math.floor((performance.now() - tStart) / 1000);
  $("end-stats").innerHTML = [["Time", Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0")], ["Kills", stats.kills + " / " + enemies.length], ["Accuracy", stats.shots ? Math.round(Math.min(1, stats.hits / stats.shots) * 100) + "%" : "—"], ["Payload", payload.secured ? "Secured" : "Not secured"]]
    .map(([k, v]) => "<span>" + k + "</span><b>" + v + "</b>").join("");
  $("end").hidden = false; $("hud").hidden = true;
}

// ---------- drawing ----------
const fog = document.createElement("canvas"), fx = fog.getContext("2d");
function visPoly(x, y, R) {
  const list = sightList(x, y, R), pts = [], N = 420;
  for (let i = 0; i < N; i++) { const a = i / N * TAU, dx = Math.cos(a), dy = Math.sin(a), t = castSight(x, y, dx, dy, R, list); pts.push([x + dx * t, y + dy * t]); }
  return pts;
}
function draw(t) {
  cx.setTransform(DPR, 0, 0, DPR, 0, 0); cx.fillStyle = "#0c0f12"; cx.fillRect(0, 0, VW, VH);
  if (!P) return;
  const [wx, wy] = toWorld(mouse.x, mouse.y);
  // (owner, 2026-10-20) the view leans toward the cursor by where it sits on the screen, not by world distance — and
  // further up / down than sideways, since a wide window shows less vertically: the reach evens out what you can see
  const ads = mouse.aim && P.hp > 0, nx = clamp((mouse.x - VW / 2) / (VW / 2), -1, 1), ny = clamp((mouse.y - VH / 2) / (VH / 2), -1, 1);
  const reach = ads ? 0.5 : 0.18, rx = VW / 2 / ZOOM * reach, ry = VH / 2 / ZOOM * reach + Math.max(0, VW - VH) / 2 / ZOOM * (ads ? 0.75 : 0.3);
  const tx = P.x + nx * rx, ty = P.y + ny * ry;
  cam.x += (tx - cam.x) * 0.12; cam.y += (ty - cam.y) * 0.12;
  const shake = booms.reduce((a, b) => a + (b.kind === "frag" ? Math.max(0, 1 - b.t / b.life) * 8 : 0), 0) + P.kick * 1.5;
  cx.save(); cx.translate(VW / 2 + (rnd() - 0.5) * shake, VH / 2 + (rnd() - 0.5) * shake); cx.scale(ZOOM, ZOOM); cx.translate(-cam.x, -cam.y);
  useFloor(floors[P.f]);
  // ground: dark grass with a faint grid (upstairs: the dark drop outside)
  cx.fillStyle = P.f === 0 ? "#1b2418" : "#0e1114"; cx.fillRect(0, 0, ground.w, ground.h);
  cx.strokeStyle = "rgba(255,255,255,.025)"; cx.lineWidth = 1; cx.beginPath();
  for (let x = 0; x <= ground.w; x += 80) { cx.moveTo(x, 0); cx.lineTo(x, ground.h); } for (let y = 0; y <= ground.h; y += 80) { cx.moveTo(0, y); cx.lineTo(ground.w, y); } cx.stroke();
  // floors: each room its own tone, with plank lines
  rooms.forEach((r, i) => {
    cx.fillStyle = ["#3a3128", "#34302c", "#2e3236", "#3b352c", "#30302a"][i % 5]; cx.fillRect(r.x, r.y, r.w, r.h);
    cx.strokeStyle = "rgba(0,0,0,.18)"; cx.beginPath(); for (let y = r.y + 24; y < r.y + r.h; y += 24) { cx.moveTo(r.x, y); cx.lineTo(r.x + r.w, y); } cx.stroke();
  });
  // decals: blood, scorch, broken glass
  for (const d of decals) {
    if (d.glass) { cx.fillStyle = "rgba(191,230,255,.25)"; for (let k = 0; k < 6; k++) cx.fillRect(d.x + rnd() * 0 + (k * 13) % Math.max(1, d.w), d.y + (k * 7) % Math.max(1, d.h), 3, 3); continue; }
    if (d.scorch) { const g = cx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r); g.addColorStop(0, "rgba(0,0,0,.6)"); g.addColorStop(1, "rgba(0,0,0,0)"); cx.fillStyle = g; cx.beginPath(); cx.arc(d.x, d.y, d.r, 0, TAU); cx.fill(); continue; }
    cx.fillStyle = "rgba(120,16,14,.75)"; cx.beginPath(); cx.arc(d.x, d.y, d.r, 0, TAU); cx.fill();
  }
  // stairs: treads, with the way they go
  for (const st of stairs) {
    cx.save(); cx.translate(st.x - st.w / 2, st.y - st.h / 2);
    cx.fillStyle = "#4a4f55"; cx.fillRect(0, 0, st.w, st.h);
    cx.strokeStyle = "#23272b"; cx.lineWidth = 2; for (let k = 1; k < 8; k++) { cx.beginPath(); cx.moveTo(4, k * st.h / 8); cx.lineTo(st.w - 4, k * st.h / 8); cx.stroke(); }
    cx.strokeStyle = "#0b0e11"; cx.lineWidth = 2.5; cx.strokeRect(0, 0, st.w, st.h);
    cx.fillStyle = "#e8e4da"; cx.font = "800 18px 'Big Shoulders Display', Impact, sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText((P.f < floors.length - 1 ? "▲" : "") + (P.f > 0 ? "▼" : ""), st.w / 2, st.h / 2);
    cx.restore();
  }
  // the payload
  if (!payload.secured && payload.f === P.f) cx.drawImage(SPR.payload, payload.x - 22, payload.y - 16, 44, 32);
  // the dead
  for (const e of enemies) if (e.hp <= 0 && e.f === P.f) { cx.save(); cx.translate(e.x, e.y); cx.rotate(e.deadH || 0); cx.globalAlpha = 0.9; cx.drawImage(SPR.dead, -24, -24, 48, 48); cx.restore(); }
  // doors (swinging on their hinge), walls, glass
  for (const d of doors) {
    if (d.broken) { cx.fillStyle = "rgba(110,80,50,.5)"; cx.fillRect(d.x + 4, d.y + 4, Math.max(4, d.w - 8), Math.max(4, d.h - 8)); continue; }
    cx.save();
    const L = d.vert ? d.h : d.w, sw = d.swing * Math.PI / 2 * (d.swingDir || 1) * -1;
    if (d.vert) { cx.translate(d.cx, d.y); cx.rotate(sw); cx.fillStyle = "#8a6a44"; cx.fillRect(-4, 0, 8, L); cx.strokeStyle = "#0b0e11"; cx.lineWidth = 2; cx.strokeRect(-4, 0, 8, L); }
    else { cx.translate(d.x, d.cy); cx.rotate(-sw); cx.fillStyle = "#8a6a44"; cx.fillRect(0, -4, L, 8); cx.strokeStyle = "#0b0e11"; cx.lineWidth = 2; cx.strokeRect(0, -4, L, 8); }
    cx.restore();
  }
  for (const w of walls) {
    if (w.kind === "glass") { cx.fillStyle = "rgba(150,210,255,.35)"; cx.fillRect(w.x, w.y, w.w, w.h); cx.strokeStyle = "rgba(200,235,255,.7)"; cx.lineWidth = 1.5; cx.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2); continue; }
    cx.fillStyle = "#cfc8ba"; cx.fillRect(w.x, w.y, w.w, w.h);
  }
  cx.strokeStyle = "#0b0e11"; cx.lineWidth = 2; for (const w of walls) if (w.kind !== "glass") cx.strokeRect(w.x, w.y, w.w, w.h);
  // what I can see: the red team only inside my sight
  const vis = visPoly(P.x, P.y, 1500);
  for (const e of enemies) if (e.hp > 0 && e.f === P.f && (los(P.x, P.y, e.x, e.y) || hyp(e.x - P.x, e.y - P.y) < 40)) drawOp(e, SPR.red, null);
  // grenades in flight
  for (const n of nades) { if (n.f !== P.f) continue; cx.save(); cx.translate(n.x, n.y); cx.rotate(n.rot); cx.drawImage(SPR[n.kind], -8, -8, 16, 16); cx.restore(); }
  // me
  if (P.hp > 0 && mouse.aim) {                  // aiming down sights: a faint sight line out to what it meets
    const dx = Math.cos(P.h), dy = Math.sin(P.h), ox = P.x + dx * 16, oy = P.y + dy * 16, t = castSight(ox, oy, dx, dy, gun().range, [...sightList(P.x, P.y, gun().range), ...walls.filter((w) => w.kind === "glass")]);
    cx.strokeStyle = "rgba(255,80,60,.35)"; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(ox, oy); cx.lineTo(ox + dx * t, oy + dy * t); cx.stroke();
  }
  if (P.hp > 0) drawOp(P, SPR.blue, gun());
  // tracers, sparks, blasts
  cx.lineCap = "round";
  for (const tr of tracers) { if (tr.f !== P.f) continue; cx.strokeStyle = tr.c; cx.globalAlpha = clamp(tr.t / 0.07, 0, 1); cx.lineWidth = 2; cx.beginPath(); cx.moveTo(tr.x0, tr.y0); cx.lineTo(tr.x1, tr.y1); cx.stroke(); }
  cx.globalAlpha = 1;
  for (const p of parts) { if (p.f !== P.f) continue; cx.fillStyle = p.c; cx.globalAlpha = clamp(p.life * 2, 0, 1); cx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); } cx.globalAlpha = 1;
  for (const b of booms) { if (b.f !== P.f) continue; const k = b.t / b.life; cx.fillStyle = b.kind === "frag" ? "rgba(255,170,60," + (1 - k) * 0.8 + ")" : "rgba(255,255,255," + (1 - k) + ")"; cx.beginPath(); cx.arc(b.x, b.y, (b.kind === "frag" ? 190 : 260) * (0.3 + k * 0.7), 0, TAU); cx.fill(); }
  cx.restore();
  // fog: everything outside my line of sight is darkened (walls stay readable)
  if (fog.width !== cv.width || fog.height !== cv.height) { fog.width = cv.width; fog.height = cv.height; }
  fx.setTransform(1, 0, 0, 1, 0, 0); fx.globalCompositeOperation = "source-over"; fx.clearRect(0, 0, fog.width, fog.height);
  fx.fillStyle = "rgba(6,8,10,.72)"; fx.fillRect(0, 0, fog.width, fog.height);
  fx.setTransform(DPR * ZOOM, 0, 0, DPR * ZOOM, DPR * (VW / 2 - cam.x * ZOOM), DPR * (VH / 2 - cam.y * ZOOM));
  fx.globalCompositeOperation = "destination-out"; fx.beginPath(); fx.moveTo(vis[0][0], vis[0][1]); for (const p of vis) fx.lineTo(p[0], p[1]); fx.closePath(); fx.fill();
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.drawImage(fog, 0, 0);
  // blinded: the screen washes white
  if (P.floorT > 0) { cx.fillStyle = "rgba(0,0,0," + (P.floorT / 0.35) + ")"; cx.fillRect(0, 0, cv.width, cv.height); }   // (a blink between floors)
  if (P.flash > 0) { cx.fillStyle = "rgba(255,255,255," + Math.min(1, P.flash / 1.6) + ")"; cx.fillRect(0, 0, cv.width, cv.height); }
  // the crosshair
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sp = 6 + gun().spread * 120 * (mouse.aim ? 0.35 : 1) + P.kick * 6; cx.strokeStyle = "#e8e4da"; cx.lineWidth = 1.5; cx.beginPath();
  cx.moveTo(mouse.x - sp - 6, mouse.y); cx.lineTo(mouse.x - sp, mouse.y); cx.moveTo(mouse.x + sp, mouse.y); cx.lineTo(mouse.x + sp + 6, mouse.y);
  cx.moveTo(mouse.x, mouse.y - sp - 6); cx.lineTo(mouse.x, mouse.y - sp); cx.moveTo(mouse.x, mouse.y + sp); cx.lineTo(mouse.x, mouse.y + sp + 6); cx.stroke();
  if (P.reloading) { cx.strokeStyle = "#f1c04a"; cx.beginPath(); cx.arc(mouse.x, mouse.y, sp + 10, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - P.reloading / gun().reload)); cx.stroke(); }
}
function drawOp(c, img, g) {
  cx.save(); cx.translate(c.x, c.y); cx.rotate(c.h);
  const len = g ? g.len : 22;                    // the gun, drawn out ahead of the hands
  cx.fillStyle = "#15191d"; cx.fillRect(8 - (c.kick || 0) * 3, 4, len, 5);
  cx.drawImage(img, -24, -24, 48, 48);
  if (c.flash > 0.3) { cx.fillStyle = "rgba(255,255,255,.6)"; cx.beginPath(); cx.arc(0, 0, 12, 0, TAU); cx.fill(); }
  cx.restore();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt); draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.Breach = { get state() { return { P, enemies, payload, rooms, doors, walls, floors, stairs, playing, ended }; }, start, useKey: () => useKey() };
})();
