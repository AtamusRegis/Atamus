// Skeleton Crew (owner, 2026-10-21): a single-player tactical demo. One ship with three decks of rooms; a short crew of
// colored officers (Star Trek division colors, chevrons by level in their specialty color) sent room to room. You steer
// the ship by waypoint and pick its target; the rooms do the rest when crewed — and fires, damage and missions pull the
// crew every which way. Rules in docs/CREW.md.
"use strict";
(() => {
const cv = document.getElementById("view"), cx = cv.getContext("2d"), $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2, rnd = Math.random, hyp = Math.hypot, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---- crew specialties: body = division color (red command, gold operations, blue sciences), chevrons = specialty ----
const SPECS = {
  CMD: { name: "Command", body: "#c8102e", chev: "#ff6b6b", tint: "rgba(200,16,46,.13)" },
  TAC: { name: "Tactical", body: "#d9a514", chev: "#ffd84a", tint: "rgba(217,165,20,.11)" },
  ENG: { name: "Engineering", body: "#d9a514", chev: "#ff9a3c", tint: "rgba(255,140,40,.10)" },
  OPS: { name: "Operations", body: "#d9a514", chev: "#f6e7a8", tint: "rgba(240,220,150,.08)" },
  SCI: { name: "Science", body: "#1f6fd1", chev: "#6cb8ff", tint: "rgba(31,111,209,.13)" },
  MED: { name: "Medical", body: "#1f6fd1", chev: "#4fe3d2", tint: "rgba(60,200,190,.11)" },
};
const NAMES = ["Reyes", "Okafor", "Tanaka", "Voss", "Lind", "Abara", "Kim", "Moreau", "Patel", "Haldane", "Ito", "Sorensen", "Vega", "Brandt", "Adeyemi", "Novak", "Quill", "Marsh", "Oduya", "Castell", "Ferro", "Hale", "Yusuf", "Petrov"];

// ---- the ship: three decks, each 640 x 200 in deck units; rooms above and below a central corridor, a lift at the stern ----
const DW = 640, DH = 200, CY = 100, LIFTX = 30;
const DECKS = [
  { name: "Deck 1 · Command", rooms: [["bridge", "Bridge", "CMD", 60, 10, 330, 78, 2], ["comms", "Comms", "OPS", 390, 10, 240, 78, 1],
    ["science", "Science", "SCI", 60, 112, 290, 78, 2], ["research", "Research", "SCI", 350, 112, 280, 78, 2]] },
  { name: "Deck 2 · Tactical", rooms: [["lasers", "Lasers", "TAC", 60, 10, 190, 78, 2], ["torpedoes", "Torpedoes", "TAC", 250, 10, 190, 78, 2], ["pdc", "Point Defense", "TAC", 440, 10, 190, 78, 1],
    ["medical", "Medical", "MED", 60, 112, 290, 78, 2], ["shields", "Shields", "ENG", 350, 112, 280, 78, 2]] },
  { name: "Deck 3 · Engineering", rooms: [["engines", "Engines", "ENG", 60, 10, 370, 78, 2], ["galley", "Galley", "OPS", 430, 10, 200, 78, 1],
    ["storage", "Storage", "OPS", 60, 112, 570, 78, 2]] },
];
let rooms, R;   // rooms list, and by id
function makeRooms() {
  rooms = []; R = {};
  DECKS.forEach((D, d) => D.rooms.forEach(([id, name, spec, x, y, w, h, slots]) => {
    const top = y < CY, r = { id, name, spec, deck: d, x, y, w, h, slots, top, hp: 100, fire: 0, power: 0, flash: 0, door: { x: x + w / 2, y: top ? y + h : y } };
    rooms.push(r); R[id] = r;
  }));
  for (const r of rooms) r.adj = rooms.filter((o) => o !== r && o.deck === r.deck && o.top === r.top && (Math.abs(o.x - (r.x + r.w)) < 2 || Math.abs(r.x - (o.x + o.w)) < 2));
}
function spotPos(r, i) { const cols = r.w >= 280 ? 4 : 3, row = Math.floor(i / cols) % 2, col = i % cols; return { x: r.x + r.w * (col + 1) / (cols + 1), y: r.y + r.h * (row ? 0.36 : 0.7) }; }

// ---- state ----
let crew, enemies, shots, parts, beams, ship, missions, feedT, stats, sector, playing = false, paused = false, ended = false;
let target = null, upg, rp, jump, missionT, clock, cid = 0, spaceR, deckR, deckS, deckO = [], cam = { x: 0, y: 0, z: 1 };

function newCrew(spec, name) { return { id: ++cid, name: name || NAMES.splice(Math.floor(rnd() * NAMES.length), 1)[0] || "Crew" + cid, spec, lvl: 1, xp: 0, hp: 100, deck: 0, x: 0, y: 0, room: null, at: null, dest: null, spot: 0, path: [], ride: 0, rideTo: 0, pend: false, sel: false, task: "" }; }
function freeSpot(r, c) { const taken = new Set(crew.filter((o) => o !== c && (o.dest || o.room) === r.id).map((o) => o.spot)); let i = 0; while (taken.has(i)) i++; return i; }
function place(c, r) { c.deck = r.deck; c.dest = r.id; c.spot = freeSpot(r, c); const p = spotPos(r, c.spot); c.x = p.x; c.y = p.y; c.room = r.id; c.at = r.id; }
function order(c, r) {
  if (c.room === r.id && !c.path.length && c.ride <= 0) return;
  c.dest = r.id; c.spot = freeSpot(r, c); c.room = null;
  if (c.ride > 0) { c.pend = true; return; }
  buildPath(c);
}
function buildPath(c) {
  const r = R[c.dest], path = [];
  if (c.at) { const a = R[c.at]; path.push({ x: a.door.x, y: a.y + a.h / 2 }, { x: a.door.x, y: CY, exit: true }); }
  if (r.deck !== c.deck) path.push({ x: LIFTX, y: CY }, { lift: r.deck });
  const sp = spotPos(r, c.spot);
  path.push({ x: r.door.x, y: CY }, { x: r.door.x, y: r.y + r.h / 2, enter: r.id }, { x: sp.x, y: sp.y, arrive: r.id });
  c.path = path;
}

function start() {
  makeRooms(); cid = 0;
  NAMES.splice(0, NAMES.length, "Reyes", "Okafor", "Tanaka", "Voss", "Lind", "Abara", "Kim", "Moreau", "Patel", "Haldane", "Ito", "Sorensen", "Vega", "Brandt", "Adeyemi", "Novak", "Quill", "Marsh", "Oduya", "Castell", "Ferro", "Hale", "Yusuf", "Petrov");
  crew = [];
  for (const [spec, rid] of [["CMD", "bridge"], ["TAC", "lasers"], ["TAC", "torpedoes"], ["ENG", "engines"], ["ENG", "shields"], ["OPS", "storage"], ["SCI", "science"], ["MED", "medical"]]) { const c = newCrew(spec); crew.push(c); place(c, R[rid]); }
  ship = { x: 0, y: 0, a: -Math.PI / 2, v: 0, wp: null, hull: 100, hullMax: 100, shield: 30, shieldMax: 40, torps: 6, torpMax: 8, torpLoad: 0, laserCd: 0, stock: 0, hit: 0 };
  enemies = []; shots = []; parts = []; beams = []; missions = []; target = null;
  upg = { laser: false, torp: false, shield: false, hull: false, med: false }; rp = 0; jump = { on: false, p: 0 };
  missionT = 14; clock = 0; sector = 1; stats = { kills: 0, lost: 0, joined: 0, missions: 0 };
  spawnSector();
  buildUpgrades();
  playing = true; ended = false; paused = false;
  $("menu").hidden = true; $("end").hidden = true; $("hud").hidden = false; $("feed").innerHTML = "";
  feed("Sector 1 — hostiles inbound", "#f2b134");
}
function spawnSector() {
  const nR = 1 + sector, nF = Math.floor(sector / 2);
  for (let i = 0; i < nR + nF; i++) {
    const a = rnd() * TAU, d = 750 + rnd() * 250, fr = i >= nR;
    enemies.push({ kind: fr ? "frigate" : "raider", x: ship.x + Math.cos(a) * d, y: ship.y + Math.sin(a) * d, a: a + Math.PI, hp: fr ? 140 : 45, max: fr ? 140 : 45, cd: 3 + rnd() * 3, orbit: rnd() < 0.5 ? 1 : -1, scan: 0, hit: 0 });
  }
}

// ---- upgrades: research points buy each once ----
const UPG = [["laser", "Laser focus", 3], ["torp", "Torpedo racks", 3], ["shield", "Shield emitters", 3], ["hull", "Hull plating", 4], ["med", "Auto-medic", 2]];
function buildUpgrades() {
  const box = $("upg"); box.querySelectorAll(".u").forEach((b) => b.remove());
  for (const [k, name, cost] of UPG) {
    const b = document.createElement("button"); b.className = "chip u"; b.type = "button"; b.dataset.k = k; b.innerHTML = name + "<em>" + cost + "</em>";
    b.onclick = () => {
      if (upg[k] || rp < cost) return; rp -= cost; upg[k] = true; b.classList.add("bought");
      if (k === "torp") ship.torpMax += 4;
      if (k === "shield") ship.shieldMax += 25;
      if (k === "hull") { ship.hullMax += 40; ship.hull += 40; }
      feed(name + " installed", "#b9a3e3");
    };
    box.appendChild(b);
  }
}

// ---- missions: a room has to be worked for a while before the clock runs out ----
const MISSIONS = [
  { k: "distress", room: "comms", label: "Distress call", need: 12, t: 60, ok: () => { if (crew.length >= 12) { rp += 2; return "Survivors aboard — no bunks, +2 research"; } const c = newCrew(pick(Object.keys(SPECS))); crew.push(c); place(c, R.comms); stats.joined++; return c.name + " (" + SPECS[c.spec].name + ") joins the crew"; } },
  { k: "anomaly", room: "science", label: "Spatial anomaly", need: 10, t: 50, ok: () => { rp += 3; return "Anomaly charted — +3 research"; } },
  { k: "salvage", room: "storage", label: "Salvage in range", need: 10, t: 55, ok: () => { const n = Math.min(3, ship.torpMax - ship.torps); ship.torps += n; rp += n < 3 ? 1 : 0; return "Salvage stowed — +" + n + " torpedoes"; } },
  { k: "leak", room: "engines", label: "Coolant leak", need: 8, t: 30, hazard: true, ok: () => "Coolant leak sealed", fail: () => { R.engines.fire = Math.max(R.engines.fire, 0.7); R.engines.hp = Math.max(0, R.engines.hp - 40); return "Coolant leak ignites the engine room"; } },
  { k: "outbreak", room: "medical", label: "Contagion", need: 10, t: 45, hazard: true, ok: () => "Contagion contained", fail: () => { for (const c of crew) c.hp -= 25; return "Contagion spreads through the ship"; } },
  { k: "decrypt", room: "comms", label: "Enemy chatter", need: 8, t: 40, ok: () => { for (const e of enemies) e.scan = 1; return "Hostile frequencies cracked — all targets scanned"; } },
];
function spawnMission() {
  const open = MISSIONS.filter((m) => !missions.some((o) => o.room === m.room) && (m.k !== "decrypt" || enemies.length));
  if (!open.length) return;
  const m = pick(open); missions.push({ ...m, prog: 0, left: m.t });
  feed(m.label + " — " + R[m.room].name, m.hazard ? "#ff5a4a" : "#f2b134");
}

// ---- input ----
const keys = {}; let ptr = { x: -1, y: -1, down: false, sx: 0, sy: 0, box: false };
const ptOf = (e) => ({ x: e.clientX, y: e.clientY });
const inR = (p, r) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
cv.addEventListener("contextmenu", (e) => e.preventDefault());
cv.addEventListener("pointerdown", (e) => {
  if (!playing) return; const p = ptOf(e);
  if (inR(p, spaceR)) { spaceClick(p, e.button); return; }
  ptr = { ...p, down: true, sx: p.x, sy: p.y, box: false, btn: e.button, shift: e.shiftKey };
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener("pointermove", (e) => { const p = ptOf(e); ptr.x = p.x; ptr.y = p.y; if (ptr.down && hyp(p.x - ptr.sx, p.y - ptr.sy) > 8) ptr.box = true; });
cv.addEventListener("pointerup", (e) => {
  if (!ptr.down) return; ptr.down = false; const p = ptOf(e);
  if (ptr.box) {
    const x0 = Math.min(p.x, ptr.sx), x1 = Math.max(p.x, ptr.sx), y0 = Math.min(p.y, ptr.sy), y1 = Math.max(p.y, ptr.sy);
    if (!ptr.shift) crew.forEach((c) => (c.sel = false));
    for (const c of crew) { const s = crewScreen(c); if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) c.sel = true; }
    ptr.box = false; return;
  }
  deckClick(p, ptr.btn, ptr.shift);
});
function deckLocal(p) {
  for (let d = 0; d < 3; d++) { const o = deckO[d], lx = (p.x - o.x) / deckS, ly = (p.y - o.y) / deckS; if (lx >= -10 && lx <= DW + 40 && ly >= -10 && ly <= DH + 10) return { d, x: lx, y: ly }; }
  return null;
}
function roomAt(p) { const l = deckLocal(p); if (!l) return null; return rooms.find((r) => r.deck === l.d && l.x >= r.x && l.x <= r.x + r.w && l.y >= r.y && l.y <= r.y + r.h) || null; }
function crewAt(p) { let best = null, bd = Math.max(11, 9 * deckS); for (const c of crew) { const s = crewScreen(c), d = hyp(s.x - p.x, s.y - p.y); if (d < bd) { bd = d; best = c; } } return best; }
function deckClick(p, btn, shift) {
  const c = crewAt(p), sel = crew.filter((o) => o.sel);
  if (c && btn === 0) { if (shift) c.sel = !c.sel; else { crew.forEach((o) => (o.sel = false)); c.sel = true; } return; }
  const r = roomAt(p);
  if (r) {
    if (sel.length) { sel.forEach((o) => order(o, r)); r.flash = 0.5; }
    else if (btn === 0) crew.forEach((o) => (o.sel = o.room === r.id || o.dest === r.id));
    return;
  }
  if (!shift) crew.forEach((o) => (o.sel = false));
}
function spaceClick(p, btn) {
  const w = { x: (p.x - spaceR.x - spaceR.w / 2) / cam.z + cam.x, y: (p.y - spaceR.y - spaceR.h / 2) / cam.z + cam.y };
  let best = null, bd = 30 / cam.z;
  for (const e of enemies) { const d = hyp(e.x - w.x, e.y - w.y); if (d < bd) { bd = d; best = e; } }
  if (best && btn === 0) { target = best; return; }
  ship.wp = w;
}
addEventListener("keydown", (e) => {
  if (!playing) { if (e.code === "Enter" && !$("menu").hidden) start(); return; }
  if (e.code === "Space") { e.preventDefault(); togglePause(); }
  if (e.code === "Escape") crew.forEach((c) => (c.sel = false));
  if (e.code === "Tab") { e.preventDefault(); if (enemies.length) { const s = [...enemies].sort((a, b) => hyp(a.x - ship.x, a.y - ship.y) - hyp(b.x - ship.x, b.y - ship.y)); target = s[(s.indexOf(target) + 1) % s.length]; } }
  if (/^Digit[1-9]$/.test(e.code)) { const c = crew[+e.code.slice(5) - 1]; if (c) { if (!e.shiftKey) crew.forEach((o) => (o.sel = false)); c.sel = true; } }
});
function togglePause() { paused = !paused; $("paused").hidden = !paused; $("pause").textContent = paused ? "▶" : "❚❚"; }
$("pause").onclick = () => playing && togglePause();
$("jump").onclick = () => { if (!enemies.length) jump.on = true; };
$("go").onclick = start; $("again").onclick = start;

// ---- the simulation ----
function eff(c, r, gal) { return (c.spec === r.spec ? 1 : 0.5) * (1 + 0.25 * (c.lvl - 1)) * (c.hp < 35 ? 0.5 : 1) * gal; }
const P = (id) => R[id].power;
function feed(t, col) { const d = document.createElement("div"); d.textContent = t; d.style.color = col || "#e9e6dc"; const f = $("feed"); f.prepend(d); while (f.children.length > 6) f.lastChild.remove(); setTimeout(() => d.remove(), 5200); }
function boom(x, y, n, col, sp) { for (let i = 0; i < n; i++) { const a = rnd() * TAU, s = (0.3 + rnd()) * (sp || 120); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + rnd() * 0.6, c: col, s: 1.5 + rnd() * 2.5 }); } }

function hitShip(dmg) {
  ship.hit = 0.25;
  const sh = Math.min(ship.shield, dmg); ship.shield -= sh; dmg -= sh;
  if (dmg <= 0) return;
  ship.hull -= dmg;
  const r = pick(rooms); r.hp = Math.max(0, r.hp - dmg * 3); r.flash = 0.6;
  for (const c of crew) if (c.at === r.id) c.hp -= dmg * 1.3;
  if (rnd() < 0.35 && !r.fire) { r.fire = 0.3; feed("Fire — " + r.name + ", " + DECKS[r.deck].name.split(" · ")[0], "#ff8a3a"); }
}

function step(dt) {
  clock += dt;
  // rooms: who is fighting fires, repairing, or working the station
  const gal = 1 + 0.2 * R.galley.power;
  for (const r of rooms) r.ops = [];
  for (const c of crew) {
    c.task = "";
    if (!c.room || c.path.length || c.ride > 0) continue;
    const r = R[c.room], e = eff(c, r, gal);
    if (r.fire > 0) { r.fire = Math.max(0, r.fire - 0.2 * e * dt); c.task = "fire"; c.xp += dt; }
    else if (r.hp < 100) { r.hp = Math.min(100, r.hp + (c.spec === "ENG" ? 12 : 6) * e * dt); c.task = "repair"; c.xp += dt; }
    else { r.ops.push({ c, e }); c.task = "op"; c.xp += (enemies.length ? 1 : 0.4) * dt; }
    const lv = c.xp >= 160 ? 3 : c.xp >= 55 ? 2 : 1;
    if (lv > c.lvl) { c.lvl = lv; feed(c.name + " — " + SPECS[c.spec].name + " rank " + lv, SPECS[c.spec].chev); }
  }
  for (const r of rooms) {
    const top = r.ops.sort((a, b) => b.e - a.e).slice(0, r.slots);
    r.power = top.reduce((s, o) => s + o.e, 0) / r.slots * (r.hp / 100) * (r.fire > 0 ? 0.5 : 1);
    r.flash = Math.max(0, r.flash - dt);
    if (r.fire > 0) {
      r.fire = Math.min(1, r.fire + 0.035 * dt); r.hp = Math.max(0, r.hp - 2.5 * r.fire * dt);
      for (const c of crew) if (c.at === r.id) c.hp -= 5 * r.fire * dt;
      if (r.fire > 0.65 && rnd() < 0.05 * dt) { const n = r.adj.filter((o) => !o.fire); if (n.length) { const o = pick(n); o.fire = 0.25; feed("Fire spreads — " + o.name, "#ff8a3a"); } }
    }
  }
  // crew: walking, the lift, the sickbay, the dead
  for (const c of crew) {
    if (c.at === "medical") c.hp = Math.min(100, c.hp + (2 + 12 * P("medical")) * (upg.med ? 2 : 1) * dt);
    if (c.ride > 0) { c.ride -= dt; if (c.ride <= 0) { c.deck = c.rideTo; if (c.pend) { c.pend = false; buildPath(c); } } continue; }
    const n = c.path[0]; if (!n) continue;
    if (n.lift !== undefined) { c.ride = 0.4 + 0.35 * Math.abs(n.lift - c.deck); c.rideTo = n.lift; c.path.shift(); continue; }
    const dx = n.x - c.x, dy = n.y - c.y, d = hyp(dx, dy), sp = (c.hp < 35 ? 60 : 125) * dt;
    if (d <= sp) { c.x = n.x; c.y = n.y; c.path.shift(); if (n.exit) c.at = null; if (n.enter) c.at = n.enter; if (n.arrive) c.room = n.arrive; }
    else { c.x += dx / d * sp; c.y += dy / d * sp; }
  }
  for (let i = crew.length - 1; i >= 0; i--) if (crew[i].hp <= 0) { const c = crew[i]; crew.splice(i, 1); stats.lost++; feed(c.name + " killed — " + SPECS[c.spec].name, "#ff5a4a"); }
  if (!crew.length) return end(false, "All hands lost");

  // the ship: the bridge steers, the engines push
  const helm = Math.min(1, P("bridge")), eng = Math.min(1.3, P("engines")), vmax = 75 * (0.12 + 0.88 * helm) * (0.35 + 0.65 * eng);
  if (ship.wp) {
    const dx = ship.wp.x - ship.x, dy = ship.wp.y - ship.y, d = hyp(dx, dy), want = Math.atan2(dy, dx);
    let da = ((want - ship.a + Math.PI * 3) % TAU) - Math.PI; ship.a += clamp(da, -1.4 * (0.3 + 0.7 * helm) * dt, 1.4 * (0.3 + 0.7 * helm) * dt);
    const tv = d < 12 ? 0 : Math.min(vmax, d * 0.8) * Math.max(0.2, Math.cos(da)); ship.v += clamp(tv - ship.v, -40 * dt, 30 * dt);
    if (d < 12) ship.wp = null;
  } else ship.v = Math.max(0, ship.v - 30 * dt);
  ship.x += Math.cos(ship.a) * ship.v * dt; ship.y += Math.sin(ship.a) * ship.v * dt;
  const evade = 0.35 * helm * (ship.v > 15 ? 1 : 0.5);
  ship.shield = Math.min(ship.shieldMax, ship.shield + 3.2 * P("shields") * dt); ship.hit = Math.max(0, ship.hit - dt);
  rp += P("research") * dt / 12;
  if (ship.torps < ship.torpMax) { ship.stock += P("storage") * dt / 14; if (ship.stock >= 1) { ship.stock = 0; ship.torps++; } }
  // weapons on the target
  if (target && !enemies.includes(target)) target = null;
  if (target) {
    const d = hyp(target.x - ship.x, target.y - ship.y), mul = target.scan >= 1 ? 1.5 : 1;
    target.scan = Math.min(1, target.scan + 0.09 * P("science") * dt);
    ship.laserCd -= dt * P("lasers");
    if (ship.laserCd <= 0 && d < 380 && P("lasers") > 0) { ship.laserCd = 1.5; beams.push({ x0: ship.x, y0: ship.y, x1: target.x, y1: target.y, c: "#ffb347", life: 0.18 }); damage(target, 8 * (upg.laser ? 1.5 : 1) * mul); }
  }
  if (ship.torps > 0) ship.torpLoad = Math.min(1, ship.torpLoad + P("torpedoes") * dt / 4 * (upg.torp ? 1.5 : 1));
  if (target && ship.torpLoad >= 1 && hyp(target.x - ship.x, target.y - ship.y) < 700) { ship.torpLoad = 0; ship.torps--; shots.push({ k: "torp", x: ship.x, y: ship.y, a: ship.a, v: 120, t: target, life: 8 }); }
  // the red side
  for (const e of enemies) {
    const dx = ship.x - e.x, dy = ship.y - e.y, d = hyp(dx, dy), to = Math.atan2(dy, dx);
    e.hit = Math.max(0, e.hit - dt); e.cd -= dt;
    if (e.kind === "raider") {
      const want = to + e.orbit * (d > 300 ? 0.6 : d < 220 ? 2.2 : Math.PI / 2);
      let da = ((want - e.a + Math.PI * 3) % TAU) - Math.PI; e.a += clamp(da, -2 * dt, 2 * dt);
      e.x += Math.cos(e.a) * 85 * dt; e.y += Math.sin(e.a) * 85 * dt;
      if (e.cd <= 0 && d < 460) { e.cd = 3.4 + rnd() * 1.5; shots.push({ k: "missile", x: e.x, y: e.y, a: e.a, v: 150, life: 6 }); }
    } else {
      let da = ((to - e.a + Math.PI * 3) % TAU) - Math.PI; e.a += clamp(da, -0.6 * dt, 0.6 * dt);
      const sp = d > 290 ? 34 : 8; e.x += Math.cos(e.a) * sp * dt; e.y += Math.sin(e.a) * sp * dt;
      if (e.cd <= 0 && d < 340) { e.cd = 2.6 + rnd(); const hit = rnd() > evade; beams.push({ x0: e.x, y0: e.y, x1: ship.x + (hit ? 0 : (rnd() - 0.5) * 120), y1: ship.y + (hit ? 0 : (rnd() - 0.5) * 120), c: "#ff4a4a", life: 0.2 }); if (hit) hitShip(7); }
    }
  }
  // projectiles: missiles home on the ship (point defense picks them off), torpedoes on their target
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.life -= dt;
    const tx = s.k === "torp" ? (s.t && enemies.includes(s.t) ? s.t.x : null) : ship.x, ty = s.k === "torp" ? (s.t ? s.t.y : 0) : ship.y;
    if (tx !== null) { const want = Math.atan2(ty - s.y, tx - s.x); let da = ((want - s.a + Math.PI * 3) % TAU) - Math.PI; s.a += clamp(da, -2.6 * dt, 2.6 * dt); }
    s.v = Math.min(s.k === "torp" ? 260 : 170, s.v + 80 * dt); s.x += Math.cos(s.a) * s.v * dt; s.y += Math.sin(s.a) * s.v * dt;
    if (rnd() < 0.7) parts.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0.35, c: s.k === "torp" ? "#7fe8ff" : "#ff7a4a", s: 1.6 });
    if (s.k === "missile") {
      const d = hyp(ship.x - s.x, ship.y - s.y);
      if (d < 170 && rnd() < 3.2 * P("pdc") * dt) { beams.push({ x0: ship.x, y0: ship.y, x1: s.x, y1: s.y, c: "#fff3b0", life: 0.08, thin: true }); boom(s.x, s.y, 8, "#ffd27a", 70); shots.splice(i, 1); continue; }
      if (d < 26) { shots.splice(i, 1); boom(s.x, s.y, 14, "#ff9a4a"); hitShip(10); continue; }
    } else if (s.t && enemies.includes(s.t) && hyp(s.t.x - s.x, s.t.y - s.y) < 22) { shots.splice(i, 1); boom(s.x, s.y, 20, "#7fe8ff", 160); damage(s.t, 34 * (s.t.scan >= 1 ? 1.5 : 1)); continue; }
    if (s.life <= 0) shots.splice(i, 1);
  }
  for (let i = beams.length - 1; i >= 0; i--) if ((beams[i].life -= dt) <= 0) beams.splice(i, 1);
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; if (p.life <= 0) parts.splice(i, 1); }
  if (ship.hull <= 0) { boom(ship.x, ship.y, 80, "#ffb347", 220); return end(false, "Hull breached"); }
  // missions
  missionT -= dt; if (missionT <= 0) { missionT = 26 + rnd() * 16; if (missions.length < 3) spawnMission(); }
  for (let i = missions.length - 1; i >= 0; i--) {
    const m = missions[i], r = R[m.room]; m.left -= dt; m.prog += r.power * dt;
    if (m.prog >= m.need) { missions.splice(i, 1); stats.missions++; for (const c of crew) if (c.room === r.id) c.xp += 20; feed(m.ok(), "#7fe08a"); }
    else if (m.left <= 0) { missions.splice(i, 1); feed(m.fail ? m.fail() : m.label + " — lost", "#ff5a4a"); }
  }
  // the jump: sector clear, the bridge and the engines spin it up
  if (jump.on) {
    jump.p += Math.min(1, P("bridge")) * Math.min(1, P("engines")) * dt / 6;
    if (jump.p >= 1) {
      jump.on = false; jump.p = 0;
      if (sector >= 5) return end(true, "Through the gauntlet");
      sector++; ship.hull = Math.min(ship.hullMax, ship.hull + 15); shots = []; ship.wp = null;
      spawnSector(); feed("Sector " + sector + " — hostiles inbound", "#f2b134");
    }
  }
}
function damage(e, n) {
  e.hp -= n; e.hit = 0.15;
  if (e.hp <= 0) { enemies.splice(enemies.indexOf(e), 1); stats.kills++; boom(e.x, e.y, e.kind === "frigate" ? 60 : 30, "#ffb347", 180); if (target === e) target = null; if (!enemies.length) feed("Sector clear", "#7fe08a"); }
}
function end(win, why) {
  playing = false; ended = true; $("hud").hidden = true; $("sel").textContent = "";
  $("end-title").innerHTML = win ? "VICTORY" : "<span style='color:#ff5a4a'>SHIP LOST</span>";
  const s = Math.floor(clock);
  $("end-stats").innerHTML = [["", why], ["Sector", sector + " / 5"], ["Hostiles destroyed", stats.kills], ["Missions", stats.missions], ["Joined", stats.joined], ["Crew lost", stats.lost], ["Time", Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0")]].map(([a, b]) => "<span>" + a + "</span><b>" + b + "</b>").join("");
  setTimeout(() => ($("end").hidden = false), 900);
}

// ---- layout ----
let VW, VH, DPR;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight; cv.width = VW * DPR; cv.height = VH * DPR;
  if (VW >= VH * 1.1) { const dw = Math.round(clamp(VW * 0.5, 360, VH * 1.35)); spaceR = { x: 0, y: 0, w: VW - dw, h: VH }; deckR = { x: VW - dw, y: 0, w: dw, h: VH }; }
  else { const sh = Math.round(VH * 0.44); spaceR = { x: 0, y: 0, w: VW, h: sh }; deckR = { x: 0, y: sh, w: VW, h: VH - sh }; }
  const slot = deckR.h / 3;
  deckS = Math.min((deckR.w - 24) / (DW + 30), (slot - 22) / (DH + 6));
  for (let d = 0; d < 3; d++) deckO[d] = { x: deckR.x + (deckR.w - (DW + 30) * deckS) / 2 + 4 * deckS, y: deckR.y + slot * d + 18 + (slot - 20 - DH * deckS) / 2 };
  cam.z = clamp(spaceR.h / 820, 0.5, 1.3);
  const h = $("hud"); h.style.left = spaceR.x + "px"; h.style.top = spaceR.y + "px"; h.style.width = spaceR.w + "px"; h.style.height = spaceR.h + "px";
}
addEventListener("resize", resize); resize();
function crewScreen(c) {
  let x = c.x, y = c.y, d = c.deck;
  if (c.ride > 0) { x = LIFTX; y = CY; }
  return { x: deckO[d].x + x * deckS, y: deckO[d].y + y * deckS };
}

// ---- drawing ----
const STARS = [0.15, 0.35, 0.7].map((k) => ({ k, s: Array.from({ length: 70 }, () => [rnd() * 1024, rnd() * 1024, 0.4 + rnd() * 1.2]) }));
function rr(x, y, w, h, r) { cx.beginPath(); cx.roundRect ? cx.roundRect(x, y, w, h, r) : cx.rect(x, y, w, h); }
function drawSpace() {
  const S = spaceR; cx.save(); cx.beginPath(); cx.rect(S.x, S.y, S.w, S.h); cx.clip();
  cx.fillStyle = "#060912"; cx.fillRect(S.x, S.y, S.w, S.h);
  for (const L of STARS) { cx.fillStyle = "rgba(220,230,255," + (0.25 + L.k * 0.6) + ")"; for (const [sx, sy, r] of L.s) { const x = ((sx - cam.x * L.k) % 1024 + 1024) % 1024, y = ((sy - cam.y * L.k) % 1024 + 1024) % 1024; for (let ox = x; ox < S.w; ox += 1024) for (let oy = y; oy < S.h; oy += 1024) cx.fillRect(S.x + ox, S.y + oy, r, r); } }
  cam.x += (ship.x - cam.x) * 0.1; cam.y += (ship.y - cam.y) * 0.1;
  cx.translate(S.x + S.w / 2, S.y + S.h / 2); cx.scale(cam.z, cam.z); cx.translate(-cam.x, -cam.y);
  // weapon ranges
  cx.setLineDash([4, 8]); cx.lineWidth = 1 / cam.z;
  cx.strokeStyle = "rgba(255,179,71,.18)"; cx.beginPath(); cx.arc(ship.x, ship.y, 380, 0, TAU); cx.stroke();
  cx.strokeStyle = "rgba(127,232,255,.12)"; cx.beginPath(); cx.arc(ship.x, ship.y, 700, 0, TAU); cx.stroke();
  if (ship.wp) { cx.strokeStyle = "rgba(242,177,52,.6)"; cx.beginPath(); cx.moveTo(ship.x, ship.y); cx.lineTo(ship.wp.x, ship.wp.y); cx.stroke(); }
  cx.setLineDash([]);
  if (ship.wp) { cx.save(); cx.translate(ship.wp.x, ship.wp.y); cx.rotate(clock * 1.5); cx.strokeStyle = "#f2b134"; cx.lineWidth = 2 / cam.z; cx.strokeRect(-7, -7, 14, 14); cx.restore(); }
  // hostiles
  for (const e of enemies) {
    cx.save(); cx.translate(e.x, e.y); cx.rotate(e.a);
    cx.fillStyle = e.hit > 0 ? "#fff" : e.kind === "frigate" ? "#7a2b2b" : "#9a3a2a"; cx.strokeStyle = "#ff6a4a"; cx.lineWidth = 1.5;
    cx.beginPath();
    if (e.kind === "raider") { cx.moveTo(16, 0); cx.lineTo(-10, -11); cx.lineTo(-5, 0); cx.lineTo(-10, 11); }
    else { cx.moveTo(30, 0); cx.lineTo(14, -14); cx.lineTo(-22, -16); cx.lineTo(-28, -6); cx.lineTo(-28, 6); cx.lineTo(-22, 16); cx.lineTo(14, 14); }
    cx.closePath(); cx.fill(); cx.stroke();
    cx.fillStyle = "#ffb08a"; cx.fillRect(e.kind === "raider" ? -9 : -30, -2, 3, 4);
    cx.restore();
    const r = e.kind === "frigate" ? 32 : 20;
    cx.fillStyle = "rgba(0,0,0,.6)"; cx.fillRect(e.x - r, e.y - r - 10, r * 2, 4); cx.fillStyle = "#ff5a4a"; cx.fillRect(e.x - r, e.y - r - 10, r * 2 * e.hp / e.max, 4);
    if (e.scan > 0) { cx.fillStyle = e.scan >= 1 ? "#6cb8ff" : "rgba(108,184,255,.5)"; cx.fillRect(e.x - r, e.y - r - 5, r * 2 * e.scan, 2); }
    if (e === target) {
      cx.strokeStyle = "#ffffff"; cx.lineWidth = 2 / cam.z; const b = r + 8, k = 7;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { cx.beginPath(); cx.moveTo(e.x + sx * b, e.y + sy * (b - k)); cx.lineTo(e.x + sx * b, e.y + sy * b); cx.lineTo(e.x + sx * (b - k), e.y + sy * b); cx.stroke(); }
    }
  }
  // our ship: a long hull with its three decks stacked down the spine
  cx.save(); cx.translate(ship.x, ship.y); cx.rotate(ship.a);
  if (ship.v > 5) { cx.fillStyle = "rgba(120,200,255," + (0.3 + 0.3 * Math.random()) + ")"; cx.beginPath(); cx.moveTo(-30, -6); cx.lineTo(-30 - ship.v * 0.35, 0); cx.lineTo(-30, 6); cx.fill(); }
  cx.fillStyle = "#cfd6e2"; cx.strokeStyle = "#1b2433"; cx.lineWidth = 1.5;
  cx.beginPath(); cx.moveTo(38, 0); cx.lineTo(24, -11); cx.lineTo(-24, -13); cx.lineTo(-32, -8); cx.lineTo(-32, 8); cx.lineTo(-24, 13); cx.lineTo(24, 11); cx.closePath(); cx.fill(); cx.stroke();
  cx.fillStyle = "#8e9bb0"; for (let k = 0; k < 3; k++) cx.fillRect(-20 + k * 14, -8, 11, 16);
  cx.fillStyle = "#c8102e"; cx.fillRect(18, -3, 10, 6);
  cx.restore();
  if (ship.shield > 0.5) { cx.strokeStyle = "rgba(95,176,255," + (0.15 + 0.5 * ship.shield / ship.shieldMax) * (ship.hit > 0 ? 1.8 : 1) + ")"; cx.lineWidth = 2 / cam.z; cx.beginPath(); cx.ellipse(ship.x, ship.y, 50, 50, 0, 0, TAU); cx.stroke(); }
  // fire
  for (const b of beams) { cx.strokeStyle = b.c; cx.globalAlpha = Math.min(1, b.life * 8); cx.lineWidth = (b.thin ? 1 : 2.5) / cam.z; cx.beginPath(); cx.moveTo(b.x0, b.y0); cx.lineTo(b.x1, b.y1); cx.stroke(); }
  cx.globalAlpha = 1;
  for (const s of shots) { cx.fillStyle = s.k === "torp" ? "#bff4ff" : "#ffcf9a"; cx.beginPath(); cx.arc(s.x, s.y, s.k === "torp" ? 3.5 : 2.5, 0, TAU); cx.fill(); }
  for (const p of parts) { cx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); cx.fillStyle = p.c; cx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
  cx.globalAlpha = 1;
  cx.restore();
  // off-screen hostiles: edge pips
  for (const e of enemies) {
    const sx = (e.x - cam.x) * cam.z, sy = (e.y - cam.y) * cam.z;
    if (Math.abs(sx) < S.w / 2 - 10 && Math.abs(sy) < S.h / 2 - 10) continue;
    const k = Math.min((S.w / 2 - 14) / Math.abs(sx || 1), (S.h / 2 - 14) / Math.abs(sy || 1));
    cx.fillStyle = e === target ? "#fff" : "#ff5a4a"; cx.beginPath(); cx.arc(S.x + S.w / 2 + sx * k, S.y + S.h / 2 + sy * k, 4, 0, TAU); cx.fill();
  }
}
function drawDecks() {
  const D = deckR, s = deckS;
  cx.fillStyle = "#0a0e17"; cx.fillRect(D.x, D.y, D.w, D.h);
  cx.fillStyle = "#1c2536"; cx.fillRect(D.x, D.y, 2, D.h);
  const hover = playing && crew.some((c) => c.sel) && !ptr.down ? roomAt(ptr) : null;
  for (let d = 0; d < 3; d++) {
    const o = deckO[d];
    cx.save(); cx.translate(o.x, o.y); cx.scale(s, s);
    // hull outline, with the bow to the right
    cx.fillStyle = "#121a28"; cx.strokeStyle = "#34425c"; cx.lineWidth = 2.5;
    cx.beginPath(); cx.moveTo(4, 2); cx.lineTo(600, 2); cx.quadraticCurveTo(DW + 26, 30, DW + 30, CY); cx.quadraticCurveTo(DW + 26, DH - 30, 600, DH - 2); cx.lineTo(4, DH - 2); cx.closePath(); cx.fill(); cx.stroke();
    // corridor and lift
    cx.fillStyle = "#0d131e"; cx.fillRect(50, 88, 580, 24);
    cx.fillStyle = "#1a2232"; cx.fillRect(10, 62, 40, 76); cx.strokeStyle = "#4a5a78"; cx.lineWidth = 1.5; cx.strokeRect(10, 62, 40, 76);
    cx.fillStyle = "#4a5a78"; cx.beginPath(); cx.moveTo(30, 70); cx.lineTo(24, 78); cx.lineTo(36, 78); cx.fill(); cx.beginPath(); cx.moveTo(30, 130); cx.lineTo(24, 122); cx.lineTo(36, 122); cx.fill();
    for (const r of rooms) {
      if (r.deck !== d) continue;
      cx.fillStyle = "#172033"; cx.fillRect(r.x, r.y, r.w, r.h);
      cx.fillStyle = SPECS[r.spec].tint; cx.fillRect(r.x, r.y, r.w, r.h);
      if (r.hp < 100) { cx.fillStyle = "rgba(0,0,0," + (0.45 * (1 - r.hp / 100)) + ")"; cx.fillRect(r.x, r.y, r.w, r.h); }
      if (r.fire > 0) { cx.fillStyle = "rgba(255," + (90 + 60 * Math.sin(clock * 9 + r.x)) + ",30," + (0.15 + 0.35 * r.fire) + ")"; cx.fillRect(r.x, r.y, r.w, r.h); }
      if (r.flash > 0) { cx.fillStyle = "rgba(255,255,255," + r.flash * 0.25 + ")"; cx.fillRect(r.x, r.y, r.w, r.h); }
      if (r === hover) { cx.strokeStyle = "rgba(242,177,52,.8)"; cx.lineWidth = 3; cx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); }
      // walls with a door gap onto the corridor
      cx.strokeStyle = "#5a6a88"; cx.lineWidth = 3; cx.beginPath();
      const dy = r.top ? r.y + r.h : r.y, oy = r.top ? r.y : r.y + r.h;
      cx.moveTo(r.x, oy); cx.lineTo(r.x + r.w, oy); cx.moveTo(r.x, r.y); cx.lineTo(r.x, r.y + r.h); cx.moveTo(r.x + r.w, r.y); cx.lineTo(r.x + r.w, r.y + r.h);
      cx.moveTo(r.x, dy); cx.lineTo(r.door.x - 14, dy); cx.moveTo(r.door.x + 14, dy); cx.lineTo(r.x + r.w, dy); cx.stroke();
      // station pips (lit by power) and the room's condition
      for (let k = 0; k < r.slots; k++) { cx.fillStyle = r.power > k / r.slots + 0.01 ? SPECS[r.spec].chev : "#2a3448"; cx.fillRect(r.x + r.w - 14 - k * 12, r.top ? r.y + 6 : r.y + r.h - 12, 8, 6); }
      if (r.hp < 100) { cx.fillStyle = "rgba(0,0,0,.5)"; cx.fillRect(r.x + 6, r.top ? r.y + r.h - 9 : r.y + 5, r.w - 12, 4); cx.fillStyle = r.hp < 35 ? "#ff5a4a" : "#f2b134"; cx.fillRect(r.x + 6, r.top ? r.y + r.h - 9 : r.y + 5, (r.w - 12) * r.hp / 100, 4); }
      const m = missions.find((q) => q.room === r.id);
      if (m) { const mx = r.x + r.w - 20 - r.slots * 12, my = r.top ? r.y + 9 : r.y + r.h - 9; cx.strokeStyle = m.hazard ? "#ff5a4a" : "#f2b134"; cx.lineWidth = 2.5; cx.beginPath(); cx.arc(mx, my, 6, -Math.PI / 2, -Math.PI / 2 + TAU * m.prog / m.need); cx.stroke(); cx.fillStyle = cx.strokeStyle; cx.beginPath(); cx.arc(mx, my, 2.5, 0, TAU); cx.fill(); }
    }
    cx.restore();
    // labels at a readable size
    cx.font = "600 " + Math.max(9, Math.round(10 * Math.min(1.3, s))) + "px 'JetBrains Mono', monospace"; cx.textBaseline = "top"; cx.textAlign = "left";
    cx.fillStyle = "#6f7a90"; cx.fillText(DECKS[d].name.toUpperCase(), o.x, o.y - 15);
    for (const r of rooms) if (r.deck === d) { cx.fillStyle = r.fire > 0 ? "#ffb070" : "#9aa5bb"; cx.fillText(r.name.toUpperCase(), o.x + (r.x + 6) * s, o.y + (r.top ? r.y + 5 : r.y + r.h - 5) * s - (r.top ? 0 : 11)); }
  }
  // the crew
  const cr = clamp(7 * s, 5, 10);
  cx.textBaseline = "alphabetic"; cx.font = "600 " + Math.max(9, Math.round(9.5 * Math.min(1.3, s))) + "px 'JetBrains Mono', monospace";
  for (const c of crew) {
    const p = crewScreen(c), S = SPECS[c.spec];
    if (c.sel) { cx.strokeStyle = "#ffffff"; cx.lineWidth = 2; cx.beginPath(); cx.arc(p.x, p.y, cr + 4, 0, TAU); cx.stroke(); }
    cx.fillStyle = S.body; cx.strokeStyle = "#05070b"; cx.lineWidth = 2; cx.beginPath(); cx.arc(p.x, p.y, cr, 0, TAU); cx.fill(); cx.stroke();
    if (c.hp < 100) { cx.strokeStyle = c.hp < 35 ? "#ff5a4a" : "#7fe08a"; cx.lineWidth = 2; cx.beginPath(); cx.arc(p.x, p.y, cr + 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * c.hp / 100); cx.stroke(); }
    if (c.task === "fire" || c.task === "repair") { cx.fillStyle = c.task === "fire" ? "#7fd8ff" : "#ffd27a"; cx.beginPath(); cx.arc(p.x + cr * 0.75, p.y + cr * 0.75, 2.5, 0, TAU); cx.fill(); }
    // chevrons (one per rank) in the specialty color, then the name
    const fs = Math.max(9, Math.round(9.5 * Math.min(1.3, s))), tw = cx.measureText(c.name).width, cw = fs * 0.55, total = c.lvl * cw * 0.75 + 3 + tw;
    let x = p.x - total / 2; const y = p.y - cr - 5;
    cx.strokeStyle = S.chev; cx.lineWidth = 1.6;
    for (let k = 0; k < c.lvl; k++) { cx.beginPath(); cx.moveTo(x, y - fs * 0.75); cx.lineTo(x + cw * 0.5, y - fs * 0.4); cx.lineTo(x, y - fs * 0.05); cx.stroke(); x += cw * 0.75; }
    cx.fillStyle = "rgba(0,0,0,.6)"; cx.fillText(c.name, x + 4, y + 1); cx.fillStyle = c.sel ? "#ffffff" : "#d8dce6"; cx.fillText(c.name, x + 3, y);
  }
  if (ptr.down && ptr.box) { cx.strokeStyle = "rgba(242,177,52,.8)"; cx.fillStyle = "rgba(242,177,52,.08)"; cx.lineWidth = 1; cx.fillRect(ptr.sx, ptr.sy, ptr.x - ptr.sx, ptr.y - ptr.sy); cx.strokeRect(ptr.sx, ptr.sy, ptr.x - ptr.sx, ptr.y - ptr.sy); }
}
function hud() {
  $("h-sector").textContent = sector + " / 5";
  $("h-hull").style.width = (100 * Math.max(0, ship.hull) / ship.hullMax) + "%";
  $("h-shield").style.width = (100 * ship.shield / ship.shieldMax) + "%";
  $("h-jump").style.width = (100 * jump.p) + "%";
  $("h-res").textContent = "Torpedoes " + ship.torps + "/" + ship.torpMax + " · Research " + Math.floor(rp) + " · Crew " + crew.length;
  $("jump").hidden = !!enemies.length || jump.on;
  for (const b of document.querySelectorAll("#upg .u")) { const u = UPG.find((q) => q[0] === b.dataset.k); b.disabled = !upg[u[0]] && rp < u[2]; }
  const mh = missions.map((m) => "<div class='mis" + (m.hazard ? " hazard" : "") + "'><b>" + m.label + "</b><span>" + R[m.room].name + " · " + Math.ceil(m.left) + "s</span><div class='bar'><i style='width:" + (100 * m.prog / m.need) + "%;background:" + (m.hazard ? "#ff5a4a" : "#f2b134") + "'></i></div></div>").join("");
  if ($("missions").innerHTML !== mh) $("missions").innerHTML = mh;
  const sel = crew.filter((c) => c.sel), el = $("sel");
  if (sel.length === 1) { const c = sel[0]; el.textContent = c.name + " · " + SPECS[c.spec].name + " · rank " + c.lvl + " · " + Math.ceil(c.hp) + "%"; }
  else el.textContent = sel.length ? sel.length + " selected" : "";
  el.style.left = (deckR.x + 12) + "px"; el.style.top = (deckR.y + deckR.h - 20) + "px";
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (playing && !paused) step(dt);
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (ship) { drawSpace(); drawDecks(); if (playing) hud(); }
  else { cx.fillStyle = "#060912"; cx.fillRect(0, 0, VW, VH); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.Crew = { get state() { return { clock, crew, enemies, rooms, ship, missions, sector, rp, target, playing, ended, deckO, deckS, spaceR }; }, start, order: (c, id) => order(c, R[id]), target: (e) => (target = e), jump: () => (jump.on = true), sim: (t) => { for (let i = 0; i < t * 20 && playing; i++) step(0.05); } };
})();
