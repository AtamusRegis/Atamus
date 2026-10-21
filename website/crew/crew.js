// Skeleton Crew (owner, 2026-10-21): a single-player tactical demo. One ship with three decks of rooms; a short crew of
// colored officers (Star Trek division colors, chevrons by rank in their specialty color) sent room to room. You steer
// the ship by waypoint and pick its target; the rooms do the rest when crewed — and fires, damage, boarders and missions
// pull the crew every which way. Rules in docs/CREW.md.
"use strict";
(() => {
const cv = document.getElementById("view"), cx = cv.getContext("2d"), $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2, rnd = Math.random, hyp = Math.hypot, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const angDiff = (a, b) => ((b - a + Math.PI * 3) % TAU) - Math.PI;

// ---- crew specialties: body = division color (red command, gold operations, blue sciences), chevrons = specialty ----
const SPECS = {
  CMD: { name: "Command", body: "#c8102e", chev: "#ff6b6b", tint: "rgba(200,16,46,.10)" },
  TAC: { name: "Tactical", body: "#d9a514", chev: "#ffd84a", tint: "rgba(217,165,20,.08)" },
  ENG: { name: "Engineering", body: "#d9a514", chev: "#ff9a3c", tint: "rgba(255,140,40,.08)" },
  OPS: { name: "Operations", body: "#d9a514", chev: "#f6e7a8", tint: "rgba(240,220,150,.06)" },
  SCI: { name: "Science", body: "#1f6fd1", chev: "#6cb8ff", tint: "rgba(31,111,209,.10)" },
  MED: { name: "Medical", body: "#1f6fd1", chev: "#4fe3d2", tint: "rgba(60,200,190,.09)" },
};
const ALLNAMES = ["Reyes", "Okafor", "Tanaka", "Voss", "Lind", "Abara", "Kim", "Moreau", "Patel", "Haldane", "Ito", "Sorensen", "Vega", "Brandt", "Adeyemi", "Novak", "Quill", "Marsh", "Oduya", "Castell", "Ferro", "Hale", "Yusuf", "Petrov"];
let NAMES = [];

// ---- the ship: three decks, 640 x 200 deck units each; rooms above and below a corridor, a lift at the stern ----
// a room: [id, name, specialty, x, y, w, h, console positions (fractions of its width; one station each)]
const DW = 640, DH = 200, CY = 100, LIFTX = 30;
const DECKS = [
  { name: "Deck 1 · Command", rooms: [["bridge", "Bridge", "CMD", 60, 10, 330, 78, [0.62, 0.82]], ["comms", "Comms", "OPS", 390, 10, 240, 78, [0.42]],
    ["science", "Science", "SCI", 60, 112, 290, 78, [0.26, 0.48]], ["research", "Research", "SCI", 350, 112, 280, 78, [0.2, 0.4]]] },
  { name: "Deck 2 · Tactical", rooms: [["lasers", "Lasers", "TAC", 60, 10, 190, 78, [0.2, 0.8]], ["torpedoes", "Torpedoes", "TAC", 250, 10, 190, 78, [0.16, 0.38]], ["pdc", "Point Defense", "TAC", 440, 10, 190, 78, [0.3]],
    ["medical", "Medical", "MED", 60, 112, 290, 78, [0.1, 0.9]], ["shields", "Shields", "ENG", 350, 112, 280, 78, [0.16, 0.36]]] },
  { name: "Deck 3 · Engineering", rooms: [["engines", "Engines", "ENG", 60, 10, 370, 78, [0.14, 0.3]], ["galley", "Galley", "OPS", 430, 10, 200, 78, [0.24]],
    ["storage", "Storage", "OPS", 60, 112, 570, 78, [0.07, 0.16]]] },
];
const BEDS = [0.32, 0.5, 0.68];
let rooms, R;
function makeRooms() {
  rooms = []; R = {};
  DECKS.forEach((D, d) => D.rooms.forEach(([id, name, spec, x, y, w, h, cons]) => {
    const top = y < CY, r = { id, name, spec, deck: d, x, y, w, h, cons, slots: cons.length, top, hp: 100, fire: 0, power: 0, flash: 0, doorOpen: 0, scorch: [], fx: 0, door: { x: x + w / 2, y: top ? y + h : y } };
    rooms.push(r); R[id] = r;
  }));
  for (const r of rooms) r.adj = rooms.filter((o) => o !== r && o.deck === r.deck && o.top === r.top && (Math.abs(o.x - (r.x + r.w)) < 2 || Math.abs(r.x - (o.x + o.w)) < 2));
}
// spots: the stations first (at the consoles on the back wall), then places to stand (the sickbay's are its beds)
const LY = (r, ly) => (r.top ? r.y + ly : r.y + r.h - ly);
function spotPos(r, i) {
  if (i < r.slots) return { x: r.x + r.w * r.cons[i], y: LY(r, 27) };
  const j = i - r.slots;
  if (r.id === "medical" && j < BEDS.length) return { x: r.x + r.w * BEDS[j], y: LY(r, 40) };
  const ex = [0.25, 0.75, 0.4, 0.6, 0.15, 0.85, 0.32, 0.68];
  return { x: r.x + r.w * ex[j % ex.length], y: LY(r, j >= ex.length ? 44 : 58) };
}

// ---- sound: a few synthesized effects (start with the first click) ----
let AC = null, master = null, NOISE = null, muted = false;
function audioOn() { if (AC) return; try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = 0.4; master.connect(AC.destination); } catch (e) { AC = null; } }
function tone(f0, f1, dur, type, vol, delay) {
  if (!AC || muted) return; const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq) {
  if (!AC || muted) return;
  if (!NOISE) { NOISE = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
  const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = NOISE; f.type = "lowpass"; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(50, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
}
const lastS = {};
function sfx(k, a) {
  const now = performance.now(); if (lastS[k] && now - lastS[k] < ({ pdc: 70, laser: 60, elaser: 80, hit: 90, order: 40 }[k] || 30)) return; lastS[k] = now;
  if (k === "laser") tone(1500, 320, 0.2, "sawtooth", 0.07);
  else if (k === "elaser") tone(420, 110, 0.28, "square", 0.045);
  else if (k === "torp") { tone(180, 50, 0.6, "triangle", 0.18); noise(0.45, 0.12, 1400); }
  else if (k === "missile") tone(300, 900, 0.3, "sawtooth", 0.025);
  else if (k === "boom") { noise(a ? 1.4 : 0.7, a ? 0.55 : 0.32, a ? 900 : 1800); tone(a ? 90 : 140, 30, a ? 1 : 0.5, "sine", a ? 0.4 : 0.2); }
  else if (k === "hit") { noise(0.4, 0.4, 800); tone(110, 35, 0.35, "sine", 0.35); }
  else if (k === "shield") tone(800, 1900, 0.16, "sine", 0.06);
  else if (k === "pdc") noise(0.05, 0.09, 5000);
  else if (k === "order") tone(620, 930, 0.07, "sine", 0.05);
  else if (k === "alarm") { tone(480, 760, 0.34, "square", 0.05); tone(480, 760, 0.34, "square", 0.05, 0.45); }
  else if (k === "good") { tone(660, 660, 0.1, "sine", 0.07); tone(990, 990, 0.16, "sine", 0.07, 0.11); }
  else if (k === "bad") { tone(300, 200, 0.25, "square", 0.05); tone(220, 140, 0.3, "square", 0.05, 0.22); }
  else if (k === "jump") { tone(80, 1600, 1.4, "sawtooth", 0.08); noise(1.4, 0.15, 3000); }
  else if (k === "beam") { tone(1200, 400, 0.6, "sine", 0.06); tone(1500, 500, 0.6, "sine", 0.04, 0.05); }
}

// ---- state ----
let crew, boarders, enemies, shots, parts, iparts, beams, rings, ship, missions, stats, sector, playing = false, paused = false, ended = false;
let target = null, upg, rp, jump, missionT, clock = 0, cid = 0, spaceR, deckR, deckS, deckO = [], cam = { x: 0, y: 0, z: 1 }, shake = 0, deckShake = [0, 0, 0], alertT = 0;

function newCrew(spec) { return { id: ++cid, name: NAMES.splice(Math.floor(rnd() * NAMES.length), 1)[0] || "Crew" + cid, spec, lvl: 1, xp: 0, hp: 100, deck: 0, x: 0, y: 0, room: null, at: null, dest: null, spot: 0, path: [], ride: 0, rideTo: 0, pend: false, sel: false, task: "", bob: rnd() * TAU }; }
function freeSpot(r, c) { const taken = new Set(crew.filter((o) => o !== c && (o.dest || o.room) === r.id).map((o) => o.spot)); let i = 0; while (taken.has(i)) i++; return i; }
function place(c, r, spot) { c.deck = r.deck; c.dest = r.id; c.spot = spot !== undefined ? spot : freeSpot(r, c); const p = spotPos(r, c.spot); c.x = p.x; c.y = p.y; c.room = r.id; c.at = r.id; }
function order(c, r) {
  if (c.room === r.id && !c.path.length && c.ride <= 0) return;
  c.dest = r.id; c.spot = c.hostile ? r.slots + Math.floor(rnd() * 6) : freeSpot(r, c); c.room = null;
  if (c.ride > 0) { c.pend = true; return; }
  buildPath(c);
}
function buildPath(c) {
  const r = R[c.dest], path = [];
  if (c.at) { const a = R[c.at]; path.push({ x: c.x, y: LY(a, 50) }, { x: a.door.x, y: LY(a, 50) }, { x: a.door.x, y: CY, exit: true }); }
  if (r.deck !== c.deck) path.push({ x: LIFTX, y: CY }, { lift: r.deck });
  const sp = spotPos(r, c.spot);
  path.push({ x: r.door.x, y: CY }, { x: r.door.x, y: LY(r, 50), enter: r.id }, { x: sp.x, y: LY(r, 50) }, { x: sp.x, y: sp.y, arrive: r.id });
  c.path = path;
}

function setup() {
  makeRooms(); cid = 0; NAMES = ALLNAMES.slice();
  crew = []; boarders = [];
  for (const [spec, rid] of [["CMD", "bridge"], ["TAC", "lasers"], ["TAC", "torpedoes"], ["ENG", "engines"], ["ENG", "shields"], ["OPS", "storage"], ["SCI", "science"], ["MED", "medical"]]) { const c = newCrew(spec); crew.push(c); place(c, R[rid]); }
  ship = { x: 0, y: 0, a: -Math.PI / 2, v: 0, wp: null, hull: 100, hullMax: 100, shield: 30, shieldMax: 40, torps: 6, torpMax: 8, torpLoad: 0, laserCd: 0, stock: 0, hit: 0, pdcT: 0, hitA: 0 };
  enemies = []; shots = []; parts = []; iparts = []; beams = []; rings = []; missions = []; target = null;
  upg = { laser: false, torp: false, shield: false, hull: false, med: false }; rp = 0; jump = { on: false, p: 0 };
  missionT = 9; clock = 0; sector = 1; stats = { kills: 0, lost: 0, joined: 0, missions: 0, repelled: 0 };
}
function start() {
  audioOn(); setup(); spawnSector(); buildUpgrades();
  playing = true; ended = false; paused = false; $("paused").hidden = true;
  $("menu").hidden = true; $("end").hidden = true; $("hud").hidden = false; $("feed").innerHTML = "";
  feed("Sector 1 — hostiles inbound", "#f2b134"); sfx("alarm"); alertT = 2.5;
}
function spawnSector() {
  const nR = [2, 2, 3, 3, 4][sector - 1], nF = [0, 1, 1, 2, 2][sector - 1];
  for (let i = 0; i < nR + nF; i++) {
    const a = rnd() * TAU, d = 560 + rnd() * 200, fr = i >= nR;
    enemies.push({ kind: fr ? "frigate" : "raider", x: ship.x + Math.cos(a) * d, y: ship.y + Math.sin(a) * d, a: a + Math.PI, hp: fr ? 150 : 45, max: fr ? 150 : 45, cd: 2 + rnd() * 3, board: 10 + rnd() * 8, orbit: rnd() < 0.5 ? 1 : -1, scan: 0, hit: 0 });
  }
}

// ---- upgrades: research points buy each once ----
const UPG = [["laser", "Laser focus", 3], ["torp", "Torpedo racks", 3], ["shield", "Shield emitters", 3], ["hull", "Hull plating", 4], ["med", "Auto-medic", 2]];
function buildUpgrades() {
  const box = $("upg"); box.querySelectorAll(".u").forEach((b) => b.remove());
  for (const [k, name, cost] of UPG) {
    const b = document.createElement("button"); b.className = "chip u"; b.type = "button"; b.dataset.k = k; b.innerHTML = name + "<em>" + cost + "</em>";
    b.onclick = () => {
      if (upg[k] || rp < cost) return; rp -= cost; upg[k] = true; b.classList.add("bought"); sfx("good");
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
  { k: "distress", room: "comms", label: "Distress call", need: 11, t: 55, ok: () => { if (crew.length >= 12) { rp += 2; return "Survivors aboard — no bunks, +2 research"; } const c = newCrew(pick(Object.keys(SPECS))); crew.push(c); place(c, R.comms, freeSpot(R.comms, c)); stats.joined++; sfx("beam"); for (let k = 0; k < 16; k++) ipart(c.deck, c.x, c.y, "#9fe0ff", 40, 0.8); return c.name + " (" + SPECS[c.spec].name + ") beams aboard"; } },
  { k: "anomaly", room: "science", label: "Spatial anomaly", need: 10, t: 50, ok: () => { rp += 3; return "Anomaly charted — +3 research"; } },
  { k: "salvage", room: "storage", label: "Salvage in range", need: 10, t: 50, ok: () => { const n = Math.min(3, ship.torpMax - ship.torps); ship.torps += n; if (n < 3) rp += 1; return "Salvage stowed — +" + n + " torpedoes"; } },
  { k: "leak", room: "engines", label: "Coolant leak", need: 8, t: 28, hazard: true, ok: () => "Coolant leak sealed", fail: () => { R.engines.fire = Math.max(R.engines.fire, 0.7); R.engines.hp = Math.max(0, R.engines.hp - 40); roomHitFx(R.engines); return "Coolant leak ignites the engine room"; } },
  { k: "outbreak", room: "medical", label: "Contagion", need: 10, t: 42, hazard: true, ok: () => "Contagion contained", fail: () => { for (const c of crew) c.hp -= 25; return "Contagion spreads through the ship"; } },
  { k: "decrypt", room: "comms", label: "Enemy chatter", need: 8, t: 38, ok: () => { for (const e of enemies) e.scan = 1; return "Hostile frequencies cracked — all targets scanned"; } },
  { k: "overload", room: "shields", label: "Emitter overload", need: 8, t: 26, hazard: true, ok: () => "Emitters stabilized", fail: () => { ship.shield = 0; R.shields.hp = Math.max(0, R.shields.hp - 50); roomHitFx(R.shields); return "Shield emitters blow out"; } },
];
function spawnMission() {
  const open = MISSIONS.filter((m) => !missions.some((o) => o.room === m.room) && (m.k !== "decrypt" || enemies.length));
  if (!open.length) return;
  const m = pick(open); missions.push({ ...m, prog: 0, left: m.t });
  feed(m.label + " — " + R[m.room].name, m.hazard ? "#ff5a4a" : "#f2b134"); sfx(m.hazard ? "alarm" : "order");
}

// ---- input ----
let ptr = { x: -1, y: -1, down: false, sx: 0, sy: 0, box: false };
const ptOf = (e) => ({ x: e.clientX, y: e.clientY });
const inR = (p, r) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
cv.addEventListener("contextmenu", (e) => e.preventDefault());
cv.addEventListener("pointerdown", (e) => {
  if (!playing) return; const p = ptOf(e);
  if (inR(p, spaceR)) { spaceClick(p, e.button); return; }
  ptr = { ...p, down: true, sx: p.x, sy: p.y, box: false, btn: e.button, shift: e.shiftKey };
  try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
});
cv.addEventListener("pointermove", (e) => { const p = ptOf(e); ptr.x = p.x; ptr.y = p.y; if (ptr.down && hyp(p.x - ptr.sx, p.y - ptr.sy) > 8) ptr.box = true; });
cv.addEventListener("pointerup", (e) => {
  if (!ptr.down) return; ptr.down = false; const p = ptOf(e);
  if (ptr.box) {
    const x0 = Math.min(p.x, ptr.sx), x1 = Math.max(p.x, ptr.sx), y0 = Math.min(p.y, ptr.sy), y1 = Math.max(p.y, ptr.sy);
    if (!ptr.shift) crew.forEach((c) => (c.sel = false));
    for (const c of crew) { const s = entScreen(c); if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) c.sel = true; }
    ptr.box = false; return;
  }
  deckClick(p, ptr.btn, ptr.shift);
});
function deckLocal(p) {
  for (let d = 0; d < 3; d++) { const o = deckO[d], lx = (p.x - o.x) / deckS, ly = (p.y - o.y) / deckS; if (lx >= -10 && lx <= DW + 40 && ly >= -10 && ly <= DH + 10) return { d, x: lx, y: ly }; }
  return null;
}
function roomAt(p) { const l = deckLocal(p); if (!l) return null; return rooms.find((r) => r.deck === l.d && l.x >= r.x && l.x <= r.x + r.w && l.y >= r.y && l.y <= r.y + r.h) || null; }
function crewAt(p) { let best = null, bd = Math.max(12, 10 * deckS); for (const c of crew) { const s = entScreen(c), d = hyp(s.x - p.x, s.y - p.y); if (d < bd) { bd = d; best = c; } } return best; }
function deckClick(p, btn, shift) {
  const c = crewAt(p), sel = crew.filter((o) => o.sel);
  if (c && btn === 0) { if (shift) c.sel = !c.sel; else { crew.forEach((o) => (o.sel = false)); c.sel = true; } sfx("order"); return; }
  const r = roomAt(p);
  if (r) {
    if (sel.length) { sel.forEach((o) => order(o, r)); r.flash = 0.5; sfx("order"); }
    else if (btn === 0) crew.forEach((o) => (o.sel = o.room === r.id || o.dest === r.id));
    return;
  }
  if (!shift) crew.forEach((o) => (o.sel = false));
}
function spaceClick(p, btn) {
  const w = { x: (p.x - spaceR.x - spaceR.w / 2) / cam.z + cam.x, y: (p.y - spaceR.y - spaceR.h / 2) / cam.z + cam.y };
  let best = null, bd = 40 / cam.z;
  for (const e of enemies) { const d = hyp(e.x - w.x, e.y - w.y); if (d < bd) { bd = d; best = e; } }
  if (best && btn === 0) { target = best; sfx("order"); return; }
  ship.wp = w; sfx("order");
}
addEventListener("keydown", (e) => {
  if (!playing) { if (e.code === "Enter" && (!$("menu").hidden || !$("end").hidden)) start(); return; }
  if (e.code === "Space") { e.preventDefault(); togglePause(); }
  if (e.code === "Escape") crew.forEach((c) => (c.sel = false));
  if (e.code === "KeyM") toggleMute();
  if (e.code === "Tab") { e.preventDefault(); if (enemies.length) { const s = [...enemies].sort((a, b) => hyp(a.x - ship.x, a.y - ship.y) - hyp(b.x - ship.x, b.y - ship.y)); target = s[(s.indexOf(target) + 1) % s.length]; } }
  if (/^Digit[1-9]$/.test(e.code)) { const c = crew[+e.code.slice(5) - 1]; if (c) { if (!e.shiftKey) crew.forEach((o) => (o.sel = false)); c.sel = true; } }
});
function togglePause() { paused = !paused; $("paused").hidden = !paused; $("pause").textContent = paused ? "▶" : "❚❚"; }
function toggleMute() { muted = !muted; $("mute").textContent = muted ? "♪̸" : "♪"; }
$("pause").onclick = () => playing && togglePause();
$("mute").onclick = toggleMute;
$("jump").onclick = () => { if (!enemies.length && !boarders.length) { jump.on = true; sfx("order"); } };
$("go").onclick = start; $("again").onclick = start;

// ---- effects ----
function feed(t, col) { const d = document.createElement("div"); d.textContent = t; d.style.color = col || "#e9e6dc"; const f = $("feed"); f.prepend(d); while (f.children.length > (innerWidth < 640 ? 3 : 6)) f.lastChild.remove(); setTimeout(() => d.remove(), 5200); }
function boom(x, y, n, col, sp, big) {
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, s = (0.3 + rnd()) * (sp || 120); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + rnd() * 0.7, c: rnd() < 0.3 ? "#fff3c0" : col, s: 1.5 + rnd() * 2.5 }); }
  if (big !== undefined) {
    rings.push({ x, y, t: 0, max: big ? 140 : 70, life: big ? 0.8 : 0.5 });
    for (let i = 0; i < (big ? 10 : 5); i++) { const a = rnd() * TAU, s = 30 + rnd() * 90; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.2 + rnd(), c: "#5a4a48", s: 3 + rnd() * 4, deb: true, rot: rnd() * TAU, vr: (rnd() - 0.5) * 8 }); }
  }
}
function ipart(d, x, y, c, sp, life, vy) { const a = rnd() * TAU, s = rnd() * (sp || 30); iparts.push({ d, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + (vy || 0), life: life || 0.6, max: life || 0.6, c, s: 1.5 + rnd() * 2 }); }
function roomHitFx(r) {
  r.flash = 0.7; deckShake[r.deck] = 0.4;
  if (r.scorch.length < 7) r.scorch.push({ x: r.x + 14 + rnd() * (r.w - 28), y: r.y + 14 + rnd() * (r.h - 28), s: 7 + rnd() * 10 });
  for (let k = 0; k < 18; k++) ipart(r.deck, r.x + rnd() * r.w, r.y + rnd() * r.h, rnd() < 0.5 ? "#ffd27a" : "#ff8a3a", 80, 0.6);
}

function hitShip(dmg, fromA) {
  ship.hit = 0.3; ship.hitA = fromA;
  const sh = Math.min(ship.shield, dmg); ship.shield -= sh; dmg -= sh;
  if (sh > 0) sfx("shield");
  if (dmg <= 0) return;
  ship.hull -= dmg; shake = Math.min(14, shake + dmg * 0.9); sfx("hit");
  boom(ship.x + Math.cos(fromA) * 26, ship.y + Math.sin(fromA) * 26, 14, "#ffb347", 110);
  const r = pick(rooms); r.hp = Math.max(0, r.hp - dmg * 3); roomHitFx(r);
  for (const c of crew) if (c.at === r.id) c.hp -= dmg * 1.3;
  if (rnd() < 0.35 && !r.fire) { r.fire = 0.3; feed("Fire — " + r.name + ", " + DECKS[r.deck].name.split(" · ")[0], "#ff8a3a"); }
}

// ---- the simulation ----
function eff(c, r, gal) { return (c.spec === r.spec ? 1 : 0.5) * (1 + 0.25 * (c.lvl - 1)) * (c.hp < 35 ? 0.5 : 1) * gal; }
const P = (id) => R[id].power;
function walk(c, dt) {
  if (c.ride > 0) { c.ride -= dt; if (c.ride <= 0) { c.deck = c.rideTo; if (c.pend) { c.pend = false; buildPath(c); } } return; }
  const n = c.path[0]; if (!n) return;
  if (n.lift !== undefined) { c.ride = 0.4 + 0.35 * Math.abs(n.lift - c.deck); c.rideTo = n.lift; c.path.shift(); return; }
  const dx = n.x - c.x, dy = n.y - c.y, d = hyp(dx, dy), sp = (c.hostile ? 90 : c.hp < 35 ? 60 : 125) * dt;
  c.bob += dt * 14;
  if (d <= sp) { c.x = n.x; c.y = n.y; c.path.shift(); if (n.exit) c.at = null; if (n.enter) c.at = n.enter; if (n.arrive) c.room = n.arrive; }
  else { c.x += dx / d * sp; c.y += dy / d * sp; }
}
function step(dt) {
  clock += dt; alertT = Math.max(0, alertT - dt);
  const gal = 1 + 0.2 * R.galley.power;
  for (const r of rooms) r.ops = [];
  // boarders and crew fight where they meet
  for (const r of rooms) {
    const bs = boarders.filter((b) => b.at === r.id && !b.path.length), cs = crew.filter((c) => c.at === r.id && !c.path.length && c.ride <= 0);
    if (!bs.length) continue;
    for (const c of cs) { const b = pick(bs); b.hp -= (c.spec === "TAC" ? 16 : c.spec === "CMD" ? 10 : 6) * (1 + 0.25 * (c.lvl - 1)) * dt; c.fight = 0.2; c.xp += dt; if (rnd() < 6 * dt) ipart(r.deck, (c.x + b.x) / 2, (c.y + b.y) / 2, "#ffe08a", 40, 0.25); }
    for (const b of bs) { if (cs.length) { const c = pick(cs); c.hp -= 9 * dt; b.fight = 0.2; } else { r.hp = Math.max(0, r.hp - 6 * dt); b.sab = (b.sab || 0) + dt; if (rnd() < 4 * dt) ipart(r.deck, b.x, b.y, "#ff7a4a", 50, 0.4); } }
  }
  for (const c of crew) {
    c.task = ""; c.fight = Math.max(0, (c.fight || 0) - dt);
    if (!c.room || c.path.length || c.ride > 0) continue;
    const r = R[c.room], e = eff(c, r, gal);
    if (c.fight > 0) c.task = "fight";
    else if (r.fire > 0) { r.fire = Math.max(0, r.fire - 0.2 * e * dt); c.task = "fire"; c.xp += dt; if (rnd() < 12 * dt) iparts.push({ d: r.deck, x: c.x, y: c.y, vx: (r.x + r.w / 2 - c.x) * 0.8 + (rnd() - 0.5) * 30, vy: (r.y + r.h / 2 - c.y) * 0.8 + (rnd() - 0.5) * 30, life: 0.5, max: 0.5, c: "#bfefff", s: 2 }); }
    else if (r.hp < 100) { r.hp = Math.min(100, r.hp + (c.spec === "ENG" ? 12 : 6) * e * dt); c.task = "repair"; c.xp += dt; if (rnd() < 6 * dt) ipart(r.deck, c.x + (rnd() - 0.5) * 14, c.y - (r.top ? 12 : -12), "#ffe08a", 50, 0.3); }
    else { r.ops.push({ c, e }); c.task = "op"; c.xp += (enemies.length ? 1 : 0.4) * dt; }
    const lv = c.xp >= 160 ? 3 : c.xp >= 55 ? 2 : 1;
    if (lv > c.lvl) { c.lvl = lv; feed(c.name + " — " + SPECS[c.spec].name + " rank " + lv, SPECS[c.spec].chev); sfx("good"); }
  }
  for (const r of rooms) {
    const top = r.ops.sort((a, b) => b.e - a.e).slice(0, r.slots);
    r.power = top.reduce((s, o) => s + o.e, 0) / r.slots * (r.hp / 100) * (r.fire > 0 ? 0.5 : 1);
    r.flash = Math.max(0, r.flash - dt);
    const near = [...crew, ...boarders].some((c) => c.deck === r.deck && hyp(c.x - r.door.x, c.y - r.door.y) < 22);
    r.doorOpen += ((near ? 1 : 0) - r.doorOpen) * Math.min(1, dt * 10);
    if (r.fire > 0) {
      r.fire = Math.min(1, r.fire + 0.035 * dt); r.hp = Math.max(0, r.hp - 2.5 * r.fire * dt);
      for (const c of crew) if (c.at === r.id) c.hp -= 5 * r.fire * dt;
      if (rnd() < 30 * r.fire * dt) iparts.push({ d: r.deck, x: r.x + 8 + rnd() * (r.w - 16), y: r.y + 8 + rnd() * (r.h - 16), vx: (rnd() - 0.5) * 10, vy: -18 - rnd() * 20, life: 0.6 + rnd() * 0.4, max: 1, c: rnd() < 0.5 ? "#ffb347" : "#ff5a2a", s: 3 + rnd() * 4, flame: true });
      if (rnd() < 6 * r.fire * dt) iparts.push({ d: r.deck, x: r.x + 8 + rnd() * (r.w - 16), y: r.y + 8 + rnd() * (r.h - 16), vx: (rnd() - 0.5) * 8, vy: -10, life: 1.4, max: 1.4, c: "#30343c", s: 6 + rnd() * 6, smoke: true });
      if (r.fire > 0.65 && rnd() < 0.05 * dt) { const n = r.adj.filter((o) => !o.fire); if (n.length) { const o = pick(n); o.fire = 0.25; feed("Fire spreads — " + o.name, "#ff8a3a"); } }
    }
    if (r.hp < 50 && rnd() < (1 - r.hp / 50) * 3 * dt) for (let k = 0; k < 5; k++) ipart(r.deck, r.x + rnd() * r.w, r.y + rnd() * r.h, "#ffe9a0", 70, 0.3);
  }
  // crew: walking, the lift, the sickbay, the dead
  for (const c of crew) { if (c.at === "medical") c.hp = Math.min(100, c.hp + (2 + 12 * P("medical")) * (upg.med ? 2 : 1) * dt); walk(c, dt); }
  for (let i = crew.length - 1; i >= 0; i--) if (crew[i].hp <= 0) { const c = crew[i]; crew.splice(i, 1); stats.lost++; feed(c.name + " killed — " + SPECS[c.spec].name, "#ff5a4a"); sfx("bad"); for (let k = 0; k < 14; k++) ipart(c.deck, c.x, c.y, SPECS[c.spec].body, 40, 0.7); }
  if (!crew.length) return end(false, "All hands lost");
  // boarders: hold a room while it has crew to fight; otherwise wreck it and move on
  for (let i = boarders.length - 1; i >= 0; i--) {
    const b = boarders[i]; b.fight = Math.max(0, (b.fight || 0) - dt);
    if (b.hp <= 0) { boarders.splice(i, 1); stats.repelled++; feed("Boarder down", "#7fe08a"); for (let k = 0; k < 12; k++) ipart(b.deck, b.x, b.y, "#ff4a4a", 40, 0.6); continue; }
    if (!b.path.length && b.ride <= 0 && b.room && (R[b.room].hp <= 0 || (b.sab || 0) > 9)) { b.sab = 0; const r = R[b.room], n = rnd() < 0.6 && r.adj.length ? pick(r.adj) : pick(rooms); order(b, n); }
    walk(b, dt);
  }
  if (!boarders.length && alertT <= 0 && !enemies.length) alertT = 0;

  // the ship: the bridge steers, the engines push
  const helm = Math.min(1, P("bridge")), eng = Math.min(1.3, P("engines")), vmax = 80 * (0.12 + 0.88 * helm) * (0.35 + 0.65 * eng);
  if (ship.wp) {
    const dx = ship.wp.x - ship.x, dy = ship.wp.y - ship.y, d = hyp(dx, dy), da = angDiff(ship.a, Math.atan2(dy, dx)), turn = 1.4 * (0.3 + 0.7 * helm) * dt;
    ship.a += clamp(da, -turn, turn);
    const tv = d < 14 ? 0 : Math.min(vmax, d * 0.8) * Math.max(0.2, Math.cos(da)); ship.v += clamp(tv - ship.v, -40 * dt, 30 * dt);
    if (d < 14) ship.wp = null;
  } else ship.v = Math.max(0, ship.v - 30 * dt);
  ship.x += Math.cos(ship.a) * ship.v * dt; ship.y += Math.sin(ship.a) * ship.v * dt;
  const evade = 0.35 * helm * (ship.v > 15 ? 1 : 0.5);
  ship.shield = Math.min(ship.shieldMax, ship.shield + 3 * P("shields") * dt); ship.hit = Math.max(0, ship.hit - dt); ship.pdcT = Math.max(0, ship.pdcT - dt);
  rp += P("research") * dt / 12;
  if (ship.torps < ship.torpMax) { ship.stock += P("storage") * dt / 14; if (ship.stock >= 1) { ship.stock = 0; ship.torps++; } }
  // weapons on the target
  if (target && !enemies.includes(target)) target = null;
  if (target) {
    const d = hyp(target.x - ship.x, target.y - ship.y), mul = target.scan >= 1 ? 1.5 : 1;
    target.scan = Math.min(1, target.scan + 0.09 * P("science") * dt);
    ship.laserCd -= dt * P("lasers");
    if (ship.laserCd <= 0 && d < 400 && P("lasers") > 0) {
      ship.laserCd = 1.5; R.lasers.fx = 0.3; sfx("laser");
      beams.push({ x0: ship.x, y0: ship.y, x1: target.x, y1: target.y, c: "#ffb347", life: 0.22 });
      boom(target.x, target.y, 6, "#ffd27a", 80);
      damage(target, 8 * (upg.laser ? 1.5 : 1) * mul);
    }
  }
  if (ship.torps > 0) ship.torpLoad = Math.min(1, ship.torpLoad + P("torpedoes") * dt / 4 * (upg.torp ? 1.5 : 1));
  if (target && ship.torpLoad >= 1 && hyp(target.x - ship.x, target.y - ship.y) < 720) { ship.torpLoad = 0; ship.torps--; R.torpedoes.fx = 0.5; sfx("torp"); shots.push({ k: "torp", x: ship.x + Math.cos(ship.a) * 40, y: ship.y + Math.sin(ship.a) * 40, a: ship.a, v: 120, t: target, life: 8 }); }
  // the red side
  for (const e of enemies) {
    const dx = ship.x - e.x, dy = ship.y - e.y, d = hyp(dx, dy), to = Math.atan2(dy, dx);
    e.hit = Math.max(0, e.hit - dt); e.cd -= dt; e.board -= dt;
    if (e.kind === "raider") {
      const want = to + e.orbit * (d > 300 ? 0.6 : d < 210 ? 2.2 : Math.PI / 2);
      e.a += clamp(angDiff(e.a, want), -2 * dt, 2 * dt);
      e.x += Math.cos(e.a) * 88 * dt; e.y += Math.sin(e.a) * 88 * dt;
      if (e.cd <= 0 && d < 470) { e.cd = 3.2 + rnd() * 1.5; sfx("missile"); shots.push({ k: "missile", x: e.x, y: e.y, a: e.a, v: 150, life: 6 }); }
    } else {
      e.a += clamp(angDiff(e.a, to), -0.6 * dt, 0.6 * dt);
      const sp = d > 290 ? 36 : 8; e.x += Math.cos(e.a) * sp * dt; e.y += Math.sin(e.a) * sp * dt;
      if (e.cd <= 0 && d < 350) { e.cd = 2.5 + rnd(); const hit = rnd() > evade; sfx("elaser"); beams.push({ x0: e.x, y0: e.y, x1: ship.x + (hit ? 0 : (rnd() - 0.5) * 140), y1: ship.y + (hit ? 0 : (rnd() - 0.5) * 140), c: "#ff4a4a", life: 0.22 }); if (hit) hitShip(7, Math.atan2(e.y - ship.y, e.x - ship.x)); }
      // boarding: through weakened shields
      if (e.board <= 0 && d < 330 && ship.shield < ship.shieldMax * 0.5 && boarders.length < 6) {
        e.board = 24 + rnd() * 10; const r = pick(rooms);
        for (let k = 0; k < 2; k++) { const b = { hostile: true, hp: 55, deck: r.deck, x: 0, y: 0, room: r.id, at: r.id, dest: r.id, spot: r.slots + 2 + k, path: [], ride: 0, pend: false, bob: rnd() * TAU }; const p = spotPos(r, b.spot); b.x = p.x; b.y = p.y; boarders.push(b); for (let j = 0; j < 14; j++) ipart(r.deck, b.x, b.y, "#ff6a6a", 40, 0.8); }
        feed("Boarders — " + r.name + ", " + DECKS[r.deck].name.split(" · ")[0], "#ff5a4a"); sfx("beam"); sfx("alarm"); alertT = 2.5; r.flash = 0.8;
        beams.push({ x0: e.x, y0: e.y, x1: ship.x, y1: ship.y, c: "#ff9a9a", life: 0.5, thin: true });
      }
    }
  }
  // projectiles: missiles home on the ship (point defense picks them off), torpedoes on their target
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.life -= dt;
    const tgt = s.k === "torp" ? (s.t && enemies.includes(s.t) ? s.t : null) : ship;
    if (tgt) s.a += clamp(angDiff(s.a, Math.atan2(tgt.y - s.y, tgt.x - s.x)), -2.6 * dt, 2.6 * dt);
    s.v = Math.min(s.k === "torp" ? 260 : 170, s.v + 80 * dt); s.x += Math.cos(s.a) * s.v * dt; s.y += Math.sin(s.a) * s.v * dt;
    parts.push({ x: s.x, y: s.y, vx: -Math.cos(s.a) * 20, vy: -Math.sin(s.a) * 20, life: s.k === "torp" ? 0.5 : 0.35, c: s.k === "torp" ? "#7fe8ff" : "#ff7a4a", s: s.k === "torp" ? 2.4 : 1.6 });
    if (s.k === "missile") {
      const d = hyp(ship.x - s.x, ship.y - s.y);
      if (d < 180 && rnd() < 3.2 * P("pdc") * dt) { ship.pdcT = 0.25; R.pdc.fx = 0.3; sfx("pdc"); beams.push({ x0: ship.x, y0: ship.y, x1: s.x, y1: s.y, c: "#fff3b0", life: 0.08, thin: true }); boom(s.x, s.y, 10, "#ffd27a", 70, false); shots.splice(i, 1); continue; }
      if (d < 30) { shots.splice(i, 1); boom(s.x, s.y, 14, "#ff9a4a"); hitShip(10, Math.atan2(s.y - ship.y, s.x - ship.x)); continue; }
    } else if (tgt && hyp(tgt.x - s.x, tgt.y - s.y) < 24) { shots.splice(i, 1); boom(s.x, s.y, 26, "#7fe8ff", 170, false); sfx("boom", false); damage(tgt, 34 * (tgt.scan >= 1 ? 1.5 : 1)); continue; }
    if (s.life <= 0) shots.splice(i, 1);
  }
  for (let i = beams.length - 1; i >= 0; i--) if ((beams[i].life -= dt) <= 0) beams.splice(i, 1);
  for (let i = rings.length - 1; i >= 0; i--) if ((rings[i].t += dt) >= rings[i].life) rings.splice(i, 1);
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; if (p.deb) p.rot += p.vr * dt; if (p.life <= 0) parts.splice(i, 1); }
  for (let i = iparts.length - 1; i >= 0; i--) { const p = iparts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (!p.flame && !p.smoke) { p.vx *= 0.9; p.vy *= 0.9; } if (p.life <= 0) iparts.splice(i, 1); }
  for (const r of rooms) r.fx = Math.max(0, r.fx - dt);
  if (ship.hull <= 0) { boom(ship.x, ship.y, 90, "#ffb347", 230, true); sfx("boom", true); return end(false, "Hull breached"); }
  // missions
  missionT -= dt; if (missionT <= 0) { missionT = 18 + rnd() * 12; if (missions.length < 3) spawnMission(); }
  for (let i = missions.length - 1; i >= 0; i--) {
    const m = missions[i], r = R[m.room]; m.left -= dt; m.prog += r.power * dt;
    if (m.prog >= m.need) { missions.splice(i, 1); stats.missions++; for (const c of crew) if (c.room === r.id) c.xp += 20; feed(m.ok(), "#7fe08a"); sfx("good"); }
    else if (m.left <= 0) { missions.splice(i, 1); feed(m.fail ? m.fail() : m.label + " — lost", "#ff5a4a"); sfx("bad"); }
  }
  // the jump: sector clear, the bridge and the engines spin it up
  if (jump.on) {
    jump.p += Math.min(1, P("bridge")) * Math.min(1, P("engines")) * dt / 4;
    if (jump.p >= 1) {
      jump.on = false; jump.p = 0; sfx("jump");
      if (sector >= 5) return end(true, "Through the gauntlet");
      sector++; ship.hull = Math.min(ship.hullMax, ship.hull + 15); shots = []; ship.wp = null; ship.x += 3000; cam.x = ship.x; cam.y = ship.y;
      spawnSector(); feed("Sector " + sector + " — hostiles inbound", "#f2b134"); sfx("alarm"); alertT = 2.5;
    }
  }
  shake = Math.max(0, shake - dt * 30); for (let d = 0; d < 3; d++) deckShake[d] = Math.max(0, deckShake[d] - dt);
}
function damage(e, n) {
  e.hp -= n; e.hit = 0.15;
  if (e.hp <= 0) {
    enemies.splice(enemies.indexOf(e), 1); stats.kills++; boom(e.x, e.y, e.kind === "frigate" ? 70 : 36, "#ffb347", 200, e.kind === "frigate"); sfx("boom", e.kind === "frigate");
    if (target === e) target = null;
    if (!enemies.length) { feed("Sector clear", "#7fe08a"); sfx("good"); }
  }
}
function end(win, why) {
  playing = false; ended = true; $("hud").hidden = true; $("sel").textContent = "";
  $("end-title").innerHTML = win ? "VICTORY" : "<span style='color:#ff5a4a'>SHIP LOST</span>";
  const s = Math.floor(clock);
  $("end-stats").innerHTML = [["", why], ["Sector", sector + " / 5"], ["Hostiles destroyed", stats.kills], ["Boarders repelled", stats.repelled], ["Missions", stats.missions], ["Joined", stats.joined], ["Crew lost", stats.lost], ["Time", Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0")]].map(([a, b]) => "<span>" + a + "</span><b>" + b + "</b>").join("");
  setTimeout(() => ($("end").hidden = false), 1200);
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
  cam.z = clamp(spaceR.h / 720, 0.5, 1.4);
  const h = $("hud"); h.style.left = spaceR.x + "px"; h.style.top = spaceR.y + "px"; h.style.width = spaceR.w + "px"; h.style.height = spaceR.h + "px";
}
addEventListener("resize", resize); resize();
function entScreen(c) { const x = c.ride > 0 ? LIFTX : c.x, y = c.ride > 0 ? CY : c.y; return { x: deckO[c.deck].x + x * deckS, y: deckO[c.deck].y + y * deckS }; }

// ---- drawing: space ----
const STARS = [0.08, 0.2, 0.45, 0.8].map((k) => ({ k, s: Array.from({ length: 60 }, () => [rnd() * 1024, rnd() * 1024, 0.4 + rnd() * (k > 0.4 ? 1.6 : 1)]) }));
const NEB = document.createElement("canvas"); NEB.width = NEB.height = 1024;
(() => {
  const n = NEB.getContext("2d");
  for (const [x, y, r, c] of [[200, 300, 380, "rgba(110,60,170,.16)"], [760, 620, 420, "rgba(30,120,150,.13)"], [520, 160, 260, "rgba(170,60,90,.10)"], [880, 180, 300, "rgba(60,80,170,.12)"], [120, 860, 320, "rgba(40,130,120,.10)"]])
    for (const ox of [-1024, 0, 1024]) for (const oy of [-1024, 0, 1024]) { const g = n.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); g.addColorStop(0, c); g.addColorStop(1, "rgba(0,0,0,0)"); n.fillStyle = g; n.fillRect(0, 0, 1024, 1024); }
})();
function tileDraw(img, S, ox, oy) { const x0 = ((-ox % 1024) + 1024) % 1024 - 1024, y0 = ((-oy % 1024) + 1024) % 1024 - 1024; for (let x = x0; x < S.w; x += 1024) for (let y = y0; y < S.h; y += 1024) cx.drawImage(img, S.x + x, S.y + y); }
function drawShipArt(s) {
  // our ship, nose at +x: a long hull, three deck bands with lit windows, warp nacelles, a red bow stripe
  cx.save(); cx.scale(s, s);
  const glow = 0.5 + 0.5 * Math.sin(clock * 6);
  for (const sy of [-1, 1]) {
    cx.fillStyle = "#7d8aa0"; cx.fillRect(-30, sy * 15 - 2.5, 26, 5);
    cx.fillStyle = "#aeb8c8"; rr(-48, sy * 19 - 4.5, 40, 9, 4); cx.fill(); cx.strokeStyle = "#1b2433"; cx.lineWidth = 1; cx.stroke();
    cx.fillStyle = "rgba(95,176,255," + (0.5 + 0.3 * glow) + ")"; rr(-44, sy * 19 - 2, 30, 4, 2); cx.fill();
    cx.fillStyle = "#ff6a4a"; cx.fillRect(-10, sy * 19 - 2.5, 3, 5);
  }
  if (ship.v > 4) { const L = 10 + ship.v * 0.45; for (const sy of [-1, 1]) { const g = cx.createLinearGradient(-48, 0, -48 - L, 0); g.addColorStop(0, "rgba(140,210,255,.8)"); g.addColorStop(1, "rgba(140,210,255,0)"); cx.fillStyle = g; cx.beginPath(); cx.moveTo(-48, sy * 19 - 3); cx.lineTo(-48 - L, sy * 19); cx.lineTo(-48, sy * 19 + 3); cx.fill(); } }
  cx.fillStyle = "#d4dae4"; cx.strokeStyle = "#1b2433"; cx.lineWidth = 1.4;
  cx.beginPath(); cx.moveTo(46, 0); cx.quadraticCurveTo(40, -10, 26, -12); cx.lineTo(-30, -11); cx.lineTo(-38, -6); cx.lineTo(-38, 6); cx.lineTo(-30, 11); cx.lineTo(26, 12); cx.quadraticCurveTo(40, 10, 46, 0); cx.closePath(); cx.fill(); cx.stroke();
  cx.fillStyle = "#9aa6b8"; cx.fillRect(-34, -4, 4, 8);
  // deck bands: a window per room, lit by its power
  for (let d = 0; d < 3; d++) {
    const y = -8 + d * 5.5; cx.fillStyle = "#3b4658"; cx.fillRect(-26, y, 52, 4);
    const rs = rooms.filter((r) => r.deck === d);
    rs.forEach((r, i) => { const x = -24 + (i / rs.length) * 48; cx.fillStyle = r.fire > 0 ? "#ff7a2a" : r.power > 0 ? SPECS[r.spec].chev : "#1c2433"; cx.fillRect(x, y + 1, 48 / rs.length - 2, 2); });
  }
  cx.fillStyle = "#c8102e"; cx.beginPath(); cx.moveTo(44, 0); cx.lineTo(34, -5); cx.lineTo(30, -5); cx.lineTo(30, 5); cx.lineTo(34, 5); cx.closePath(); cx.fill();
  cx.fillStyle = "rgba(255,255,255," + (0.4 + 0.6 * glow) + ")"; cx.fillRect(-36, -11, 2, 2); cx.fillRect(-36, 9, 2, 2);
  cx.restore();
}
function drawEnemyArt(e) {
  cx.save(); cx.translate(e.x, e.y); cx.rotate(e.a);
  const hot = e.hit > 0, flick = 0.6 + 0.4 * rnd();
  if (e.kind === "raider") {
    cx.fillStyle = "rgba(255,120,60," + 0.7 * flick + ")"; cx.beginPath(); cx.moveTo(-10, -4); cx.lineTo(-22 - 6 * flick, 0); cx.lineTo(-10, 4); cx.fill();
    cx.fillStyle = hot ? "#ffffff" : "#6e2a22"; cx.strokeStyle = "#ff6a4a"; cx.lineWidth = 1.4;
    cx.beginPath(); cx.moveTo(20, 0); cx.lineTo(-4, -6); cx.lineTo(-12, -16); cx.lineTo(-10, -4); cx.lineTo(-12, 0); cx.lineTo(-10, 4); cx.lineTo(-12, 16); cx.lineTo(-4, 6); cx.closePath(); cx.fill(); cx.stroke();
    cx.fillStyle = "#ffb08a"; cx.beginPath(); cx.arc(6, 0, 2.5, 0, TAU); cx.fill();
  } else {
    for (const sy of [-1, 1]) { cx.fillStyle = "rgba(255,90,60," + 0.6 * flick + ")"; cx.beginPath(); cx.moveTo(-34, sy * 10 - 4); cx.lineTo(-46 - 8 * flick, sy * 10); cx.lineTo(-34, sy * 10 + 4); cx.fill(); }
    cx.fillStyle = hot ? "#ffffff" : "#4f1f22"; cx.strokeStyle = "#ff5a4a"; cx.lineWidth = 1.6;
    cx.beginPath(); cx.moveTo(40, 0); cx.lineTo(26, -10); cx.lineTo(8, -12); cx.lineTo(-6, -22); cx.lineTo(-30, -22); cx.lineTo(-36, -12); cx.lineTo(-36, 12); cx.lineTo(-30, 22); cx.lineTo(-6, 22); cx.lineTo(8, 12); cx.lineTo(26, 10); cx.closePath(); cx.fill(); cx.stroke();
    cx.fillStyle = "#7a2a2a"; cx.fillRect(-24, -6, 34, 12);
    cx.fillStyle = "#ff9a7a"; for (const [tx, ty] of [[-14, -15], [-14, 15], [18, 0]]) { cx.beginPath(); cx.arc(tx, ty, 3, 0, TAU); cx.fill(); }
    cx.strokeStyle = "rgba(255,120,90,.6)"; cx.lineWidth = 1; for (let k = 0; k < 4; k++) { cx.beginPath(); cx.moveTo(-20 + k * 8, -6); cx.lineTo(-20 + k * 8, 6); cx.stroke(); }
  }
  cx.restore();
}
function drawSpace() {
  const S = spaceR; cx.save(); cx.beginPath(); cx.rect(S.x, S.y, S.w, S.h); cx.clip();
  const sx = (rnd() - 0.5) * shake, sy = (rnd() - 0.5) * shake;
  cam.x += (ship.x - cam.x) * 0.1; cam.y += (ship.y - cam.y) * 0.1;
  const bg = cx.createLinearGradient(0, S.y, 0, S.y + S.h); bg.addColorStop(0, "#05070f"); bg.addColorStop(1, "#0a0816"); cx.fillStyle = bg; cx.fillRect(S.x, S.y, S.w, S.h);
  tileDraw(NEB, S, cam.x * 0.05, cam.y * 0.05);
  // a far planet
  const px = S.x + S.w * 0.78 - cam.x * 0.03 % 2000, py = S.y + S.h * 0.22 - cam.y * 0.03, pr = Math.min(S.w, S.h) * 0.22;
  const pg = cx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr); pg.addColorStop(0, "#5a4a7a"); pg.addColorStop(0.7, "#2a2140"); pg.addColorStop(1, "#120e1e");
  cx.fillStyle = pg; cx.beginPath(); cx.arc(px, py, pr, 0, TAU); cx.fill();
  cx.strokeStyle = "rgba(160,140,220,.25)"; cx.lineWidth = 3; cx.beginPath(); cx.arc(px, py, pr + 2, Math.PI * 0.9, Math.PI * 1.6); cx.stroke();
  cx.strokeStyle = "rgba(200,180,240,.18)"; cx.lineWidth = 2; cx.beginPath(); cx.ellipse(px, py, pr * 1.6, pr * 0.35, -0.3, 0, TAU); cx.stroke();
  for (const L of STARS) { cx.fillStyle = "rgba(220,230,255," + (0.25 + L.k * 0.7) + ")"; for (const [x0, y0, r] of L.s) { const x = ((x0 - cam.x * L.k) % 1024 + 1024) % 1024, y = ((y0 - cam.y * L.k) % 1024 + 1024) % 1024; for (let ox = x; ox < S.w; ox += 1024) for (let oy = y; oy < S.h; oy += 1024) cx.fillRect(S.x + ox, S.y + oy, r, r); } }
  cx.translate(S.x + S.w / 2 + sx, S.y + S.h / 2 + sy); cx.scale(cam.z, cam.z); cx.translate(-cam.x, -cam.y);
  // ranges and the waypoint
  cx.setLineDash([3, 9]); cx.lineWidth = 1 / cam.z;
  cx.strokeStyle = "rgba(255,179,71,.2)"; cx.beginPath(); cx.arc(ship.x, ship.y, 400, 0, TAU); cx.stroke();
  cx.strokeStyle = "rgba(127,232,255,.12)"; cx.beginPath(); cx.arc(ship.x, ship.y, 720, 0, TAU); cx.stroke();
  if (ship.wp) { cx.strokeStyle = "rgba(242,177,52,.55)"; cx.beginPath(); cx.moveTo(ship.x, ship.y); cx.lineTo(ship.wp.x, ship.wp.y); cx.stroke(); }
  cx.setLineDash([]);
  if (ship.wp) { cx.save(); cx.translate(ship.wp.x, ship.wp.y); cx.rotate(clock * 1.5); cx.strokeStyle = "#f2b134"; cx.lineWidth = 2 / cam.z; cx.strokeRect(-8, -8, 16, 16); cx.restore(); cx.fillStyle = "#f2b134"; cx.beginPath(); cx.arc(ship.wp.x, ship.wp.y, 2.5, 0, TAU); cx.fill(); }
  // hostiles
  for (const e of enemies) {
    drawEnemyArt(e);
    const r = e.kind === "frigate" ? 40 : 22;
    cx.fillStyle = "rgba(0,0,0,.6)"; cx.fillRect(e.x - r, e.y - r - 12, r * 2, 4); cx.fillStyle = "#ff5a4a"; cx.fillRect(e.x - r, e.y - r - 12, r * 2 * e.hp / e.max, 4);
    if (e.scan > 0) { cx.fillStyle = e.scan >= 1 ? "#6cb8ff" : "rgba(108,184,255,.5)"; cx.fillRect(e.x - r, e.y - r - 7, r * 2 * e.scan, 2); }
    if (e === target) {
      const b = r + 9 + Math.sin(clock * 6) * 2, k = 8; cx.strokeStyle = "#ffffff"; cx.lineWidth = 2 / cam.z;
      for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { cx.beginPath(); cx.moveTo(e.x + qx * b, e.y + qy * (b - k)); cx.lineTo(e.x + qx * b, e.y + qy * b); cx.lineTo(e.x + qx * (b - k), e.y + qy * b); cx.stroke(); }
    }
  }
  // our ship and its shield
  cx.save(); cx.translate(ship.x, ship.y); cx.rotate(ship.a); drawShipArt(1.25); cx.restore();
  if (ship.shield > 0.5) {
    const f = ship.shield / ship.shieldMax, g = cx.createRadialGradient(ship.x, ship.y, 40, ship.x, ship.y, 66);
    g.addColorStop(0, "rgba(95,176,255,0)"); g.addColorStop(1, "rgba(95,176,255," + 0.18 * f + ")"); cx.fillStyle = g; cx.beginPath(); cx.arc(ship.x, ship.y, 66, 0, TAU); cx.fill();
    cx.strokeStyle = "rgba(140,200,255," + (0.15 + 0.4 * f) + ")"; cx.lineWidth = 1.5 / cam.z; cx.beginPath(); cx.arc(ship.x, ship.y, 66, 0, TAU); cx.stroke();
    if (ship.hit > 0) { cx.strokeStyle = "rgba(190,230,255," + ship.hit * 3 + ")"; cx.lineWidth = 5 / cam.z; cx.beginPath(); cx.arc(ship.x, ship.y, 66, ship.hitA - 0.6, ship.hitA + 0.6); cx.stroke(); }
  }
  // beams (a wide glow under a hot core), shots, debris, shockwaves
  cx.lineCap = "round";
  for (const b of beams) {
    const a = Math.min(1, b.life * 7);
    if (!b.thin) { cx.strokeStyle = b.c; cx.globalAlpha = a * 0.35; cx.lineWidth = 7 / cam.z; cx.beginPath(); cx.moveTo(b.x0, b.y0); cx.lineTo(b.x1, b.y1); cx.stroke(); }
    cx.globalAlpha = a; cx.strokeStyle = b.thin ? b.c : "#fff4e0"; cx.lineWidth = (b.thin ? 1.2 : 2) / cam.z; cx.beginPath(); cx.moveTo(b.x0, b.y0); cx.lineTo(b.x1, b.y1); cx.stroke();
  }
  cx.globalAlpha = 1; cx.lineCap = "butt";
  for (const s of shots) {
    cx.save(); cx.translate(s.x, s.y); cx.rotate(s.a);
    if (s.k === "torp") { cx.fillStyle = "rgba(127,232,255,.35)"; cx.beginPath(); cx.arc(0, 0, 8, 0, TAU); cx.fill(); cx.fillStyle = "#e8fbff"; cx.beginPath(); cx.ellipse(0, 0, 6, 3, 0, 0, TAU); cx.fill(); }
    else { cx.fillStyle = "#ffcf9a"; cx.fillRect(-4, -1.5, 8, 3); cx.fillStyle = "#ff5a2a"; cx.fillRect(-6, -1, 2, 2); }
    cx.restore();
  }
  for (const p of parts) {
    cx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); cx.fillStyle = p.c;
    if (p.deb) { cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66); cx.restore(); }
    else cx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
  }
  for (const g of rings) { const k = g.t / g.life; cx.globalAlpha = (1 - k) * 0.8; cx.strokeStyle = "#ffe0a8"; cx.lineWidth = (3 - 2 * k) / cam.z * 2; cx.beginPath(); cx.arc(g.x, g.y, g.max * k, 0, TAU); cx.stroke(); if (k < 0.25) { cx.fillStyle = "rgba(255,240,200," + (1 - k * 4) + ")"; cx.beginPath(); cx.arc(g.x, g.y, g.max * 0.35, 0, TAU); cx.fill(); } }
  cx.globalAlpha = 1;
  cx.restore();
  // off-screen hostiles: edge arrows
  for (const e of enemies) {
    const ex = (e.x - cam.x) * cam.z, ey = (e.y - cam.y) * cam.z;
    if (Math.abs(ex) < S.w / 2 - 10 && Math.abs(ey) < S.h / 2 - 10) continue;
    const k = Math.min((S.w / 2 - 16) / Math.abs(ex || 1), (S.h / 2 - 16) / Math.abs(ey || 1)), a = Math.atan2(ey, ex);
    cx.save(); cx.translate(S.x + S.w / 2 + ex * k, S.y + S.h / 2 + ey * k); cx.rotate(a);
    cx.fillStyle = e === target ? "#ffffff" : "#ff5a4a"; cx.beginPath(); cx.moveTo(8, 0); cx.lineTo(-5, -6); cx.lineTo(-5, 6); cx.fill(); cx.restore();
  }
  // red alert wash on hull damage
  if (ship.hit > 0 && shake > 2) { cx.fillStyle = "rgba(255,40,30," + ship.hit * 0.25 + ")"; cx.fillRect(S.x, S.y, S.w, S.h); }
}

// ---- drawing: the decks ----
function rr(x, y, w, h, r) { cx.beginPath(); if (cx.roundRect) cx.roundRect(x, y, w, h, r); else cx.rect(x, y, w, h); }
function blink(seed, rate) { return Math.sin(clock * rate + seed * 12.9898) > 0.2; }
function drawRoomDeco(r) {
  // local space, the back wall at y = 0 (bottom rooms are flipped so their back wall is the hull)
  const w = r.w, k = r.power, t = clock, sc = SPECS[r.spec].chev;
  // consoles on the back wall; a screen lights while someone works it
  r.cons.forEach((f, i) => {
    const x = w * f, on = crew.some((c) => c.room === r.id && c.spot === i && c.task === "op");
    cx.fillStyle = "#2a3650"; rr(x - 15, 3, 30, 12, 3); cx.fill();
    cx.fillStyle = on ? sc : "#18202f"; cx.globalAlpha = on ? 0.55 + 0.35 * Math.sin(t * 4 + i) : 1; cx.fillRect(x - 11, 5, 22, 5); cx.globalAlpha = 1;
    if (on) { cx.fillStyle = "#ffffff"; for (let j = 0; j < 4; j++) if (blink(i * 7 + j + r.x, 3 + j)) cx.fillRect(x - 10 + j * 6, 12, 2, 1.5); }
  });
  const id = r.id;
  if (id === "bridge") {
    cx.fillStyle = "#3a2430"; cx.beginPath(); cx.arc(w * 0.38, 40, 10, 0, TAU); cx.fill(); cx.fillStyle = "#5a2a3a"; cx.beginPath(); cx.arc(w * 0.38, 40, 10, Math.PI * 1.15, Math.PI * 1.85); cx.lineTo(w * 0.38, 40); cx.fill();
    cx.strokeStyle = "#4a3a50"; cx.lineWidth = 2; cx.beginPath(); cx.arc(w * 0.14, 42, 16, 0, TAU); cx.stroke();
    cx.fillStyle = "rgba(255,107,107," + (0.2 + 0.4 * k) + ")"; for (let j = 0; j < 9; j++) { const a = t * 0.3 + j * 0.7, rr2 = 4 + (j * 5) % 12; cx.fillRect(w * 0.14 + Math.cos(a) * rr2, 42 + Math.sin(a) * rr2, 2, 2); }
  } else if (id === "comms") {
    cx.strokeStyle = "#4a5a78"; cx.lineWidth = 2; cx.beginPath(); cx.arc(w * 0.8, 42, 14, 0, TAU); cx.stroke();
    if (k > 0) { cx.strokeStyle = "rgba(246,231,168,.7)"; cx.beginPath(); cx.moveTo(w * 0.8, 42); cx.lineTo(w * 0.8 + Math.cos(t * 2) * 14, 42 + Math.sin(t * 2) * 14); cx.stroke(); }
    cx.fillStyle = "#222c40"; cx.fillRect(w * 0.08, 22, 18, 40); for (let j = 0; j < 6; j++) { cx.fillStyle = blink(j + 3, 2 + j) && k > 0 ? "#f6e7a8" : "#3a4458"; cx.fillRect(w * 0.08 + 4, 26 + j * 6, 3, 3); cx.fillRect(w * 0.08 + 11, 26 + j * 6, 3, 3); }
  } else if (id === "science") {
    const ox = w * 0.8; cx.fillStyle = "rgba(108,184,255," + (0.25 + 0.4 * k) + ")"; cx.beginPath(); cx.arc(ox, 42, 9, 0, TAU); cx.fill();
    cx.strokeStyle = "rgba(108,184,255,.7)"; cx.lineWidth = 1.5; for (let j = 0; j < 2; j++) { cx.beginPath(); cx.ellipse(ox, 42, 18, 6, t * (0.4 + k) * (j ? -1 : 1) + j, 0, TAU); cx.stroke(); }
  } else if (id === "research") {
    for (let q = 0; q < 4; q++) { const x = w * 0.6 + q * 22; cx.fillStyle = "#1f2840"; cx.fillRect(x, 20, 16, 44); for (let j = 0; j < 7; j++) { cx.fillStyle = k > 0 && blink(q * 9 + j, 4 + q) ? "#6cb8ff" : "#2c3852"; cx.fillRect(x + 3, 24 + j * 5.5, 10, 2); } }
  } else if (id === "lasers") {
    const ch = clamp(1 - ship.laserCd / 1.5, 0, 1) * (k > 0 ? 1 : 0), x = w * 0.5;
    cx.strokeStyle = "#5a4a30"; cx.lineWidth = 3; for (let j = 0; j < 4; j++) { cx.beginPath(); cx.arc(x, 40, 6 + j * 4, 0, TAU); cx.stroke(); }
    cx.fillStyle = "rgba(255,179,71," + (0.15 + 0.6 * ch + (r.fx > 0 ? 0.6 : 0)) + ")"; cx.beginPath(); cx.arc(x, 40, 9 + (r.fx > 0 ? 6 : 0), 0, TAU); cx.fill();
  } else if (id === "torpedoes") {
    const x0 = w * 0.55, x1 = w - 8; cx.fillStyle = "#1c2436"; rr(x0, 26, x1 - x0, 14, 7); cx.fill(); cx.strokeStyle = "#4a5a78"; cx.lineWidth = 1.5; cx.stroke();
    const L = (x1 - x0 - 6) * ship.torpLoad; if (ship.torps > 0 || ship.torpLoad > 0) { cx.fillStyle = "#8ea0b8"; rr(x0 + 3, 29, Math.max(4, L), 8, 4); cx.fill(); cx.fillStyle = ship.torpLoad >= 1 ? "#7fe8ff" : "#4a6a80"; cx.beginPath(); cx.arc(x0 + 3 + L, 33, 4, 0, TAU); cx.fill(); }
    if (r.fx > 0) { cx.fillStyle = "rgba(127,232,255," + r.fx * 1.5 + ")"; cx.beginPath(); cx.arc(x1, 33, 12, 0, TAU); cx.fill(); }
    for (let j = 0; j < Math.min(ship.torps, 12); j++) { cx.fillStyle = "#6a7d96"; rr(x0 + (j % 6) * 12, 46 + Math.floor(j / 6) * 9, 10, 6, 3); cx.fill(); cx.fillStyle = "#7fe8ff"; cx.fillRect(x0 + (j % 6) * 12 + 7, 47 + Math.floor(j / 6) * 9, 2, 4); }
  } else if (id === "pdc") {
    const x = w * 0.7; cx.strokeStyle = "#5a5a40"; cx.lineWidth = 2; cx.beginPath(); cx.arc(x, 42, 14, 0, TAU); cx.stroke();
    const sp = t * (ship.pdcT > 0 ? 30 : 1); for (let j = 0; j < 6; j++) { cx.beginPath(); cx.moveTo(x, 42); cx.lineTo(x + Math.cos(sp + j) * 12, 42 + Math.sin(sp + j) * 12); cx.stroke(); }
    if (ship.pdcT > 0) { cx.fillStyle = "rgba(255,243,176,.6)"; cx.beginPath(); cx.arc(x, 42, 6, 0, TAU); cx.fill(); }
    cx.strokeStyle = "#4a4a38"; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(w * 0.3 + 15, 9); cx.quadraticCurveTo(w * 0.5, 30, x - 14, 42); cx.stroke();
  } else if (id === "medical") {
    BEDS.forEach((f, i) => {
      const x = w * f, occ = crew.some((c) => c.at === "medical" && !c.path.length && c.spot === r.slots + i);
      cx.fillStyle = "#26344a"; rr(x - 12, 22, 24, 34, 4); cx.fill(); cx.fillStyle = "#3a4c66"; rr(x - 9, 24, 18, 8, 3); cx.fill();
      if (occ) { cx.strokeStyle = "rgba(79,227,210," + (0.4 + 0.4 * Math.sin(t * 5 + i)) + ")"; cx.lineWidth = 2; cx.beginPath(); cx.arc(x, 40, 13, 0, TAU); cx.stroke(); }
    });
    cx.fillStyle = "rgba(79,227,210,.5)"; cx.fillRect(w * 0.5 - 2, 64, 4, 10); cx.fillRect(w * 0.5 - 5, 67, 10, 4);
  } else if (id === "shields") {
    const x = w * 0.72, f = ship.shield / ship.shieldMax;
    for (let j = 0; j < 3; j++) { cx.strokeStyle = "rgba(95,176,255," + (0.15 + 0.5 * f * (0.6 + 0.4 * Math.sin(t * 3 - j))) + ")"; cx.lineWidth = 2; cx.beginPath(); cx.arc(x, 40, 7 + j * 7, 0, TAU); cx.stroke(); }
    cx.fillStyle = "#5fb0ff"; cx.globalAlpha = 0.3 + 0.7 * f; cx.beginPath(); cx.arc(x, 40, 4, 0, TAU); cx.fill(); cx.globalAlpha = 1;
  } else if (id === "engines") {
    const x = w * 0.66, pulse = 0.5 + 0.5 * Math.sin(t * (2 + 6 * k)), g = cx.createRadialGradient(x, 40, 2, x, 40, 26);
    g.addColorStop(0, k > 0 ? "rgba(255,240,200," + (0.7 + 0.3 * pulse) + ")" : "rgba(120,120,130,.5)"); g.addColorStop(0.5, k > 0 ? "rgba(255,150,60," + (0.35 + 0.3 * pulse) + ")" : "rgba(60,60,70,.4)"); g.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = g; cx.beginPath(); cx.arc(x, 40, 26, 0, TAU); cx.fill();
    cx.strokeStyle = "#5a4a40"; cx.lineWidth = 2.5; cx.beginPath(); cx.arc(x, 40, 15, 0, TAU); cx.stroke();
    cx.strokeStyle = "#3e3a40"; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(x - 15, 40); cx.lineTo(w * 0.42, 40); cx.moveTo(x + 15, 40); cx.lineTo(w - 6, 40); cx.stroke();
  } else if (id === "galley") {
    for (const f of [0.6, 0.85]) { const x = w * f; cx.fillStyle = "#3a3428"; cx.beginPath(); cx.arc(x, 44, 9, 0, TAU); cx.fill(); cx.fillStyle = "#4e4636"; for (let j = 0; j < 3; j++) { const a = j * TAU / 3 + 0.5; cx.beginPath(); cx.arc(x + Math.cos(a) * 15, 44 + Math.sin(a) * 15, 3.5, 0, TAU); cx.fill(); } }
    if (k > 0) { cx.fillStyle = "rgba(255,220,160,.4)"; for (let j = 0; j < 3; j++) cx.fillRect(w * 0.24 - 6 + j * 5, 0 - ((t * 10 + j * 4) % 8), 1.5, 3); }
  } else if (id === "storage") {
    let n = 0;
    for (let q = 0; q < 26; q++) {
      const col = q % 13, row = Math.floor(q / 13), x = w * 0.26 + col * 30, y = 18 + row * 22; if (x > w - 26) continue;
      const torp = n < ship.torps && (q * 7) % 3 === 0; if (torp) n++;
      cx.fillStyle = torp ? "#2a4a5a" : (q * 5) % 4 === 0 ? "#3a3428" : "#2e3446"; cx.fillRect(x, y, 22, 16); cx.strokeStyle = "#0d121b"; cx.lineWidth = 1; cx.strokeRect(x, y, 22, 16);
      if (torp) { cx.fillStyle = "#7fe8ff"; cx.fillRect(x + 4, y + 7, 14, 2); } else { cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + 22, y + 16); cx.moveTo(x + 22, y); cx.lineTo(x, y + 16); cx.strokeStyle = "rgba(255,255,255,.05)"; cx.stroke(); }
    }
  }
}
function drawEnt(c, cr) {
  const p = entScreen(c), moving = c.path.length > 0, bob = moving ? Math.sin(c.bob) * 1.2 : 0;
  if (c.hostile) {
    cx.fillStyle = "rgba(255,60,60," + (0.25 + 0.2 * Math.sin(clock * 8)) + ")"; cx.beginPath(); cx.arc(p.x, p.y + bob, cr + 4, 0, TAU); cx.fill();
    cx.fillStyle = "#2a0606"; cx.strokeStyle = "#ff3a3a"; cx.lineWidth = 2; cx.beginPath(); cx.arc(p.x, p.y + bob, cr, 0, TAU); cx.fill(); cx.stroke();
    cx.strokeStyle = "#ff6a6a"; cx.lineWidth = 1.6; cx.beginPath(); cx.moveTo(p.x - cr * 0.45, p.y + bob - cr * 0.45); cx.lineTo(p.x + cr * 0.45, p.y + bob + cr * 0.45); cx.moveTo(p.x + cr * 0.45, p.y + bob - cr * 0.45); cx.lineTo(p.x - cr * 0.45, p.y + bob + cr * 0.45); cx.stroke();
    if (c.hp < 55) { cx.strokeStyle = "#ff5a4a"; cx.lineWidth = 2; cx.beginPath(); cx.arc(p.x, p.y + bob, cr + 2, -Math.PI / 2, -Math.PI / 2 + TAU * c.hp / 55); cx.stroke(); }
    return;
  }
  const S = SPECS[c.spec];
  cx.fillStyle = "rgba(0,0,0,.4)"; cx.beginPath(); cx.ellipse(p.x, p.y + cr * 0.8, cr * 0.9, cr * 0.35, 0, 0, TAU); cx.fill();
  if (c.sel) { cx.strokeStyle = "#ffffff"; cx.lineWidth = 2; cx.setLineDash([4, 3]); cx.lineDashOffset = -clock * 12; cx.beginPath(); cx.arc(p.x, p.y + bob, cr + 4.5, 0, TAU); cx.stroke(); cx.setLineDash([]); }
  if (c.task === "op") { cx.strokeStyle = S.chev; cx.globalAlpha = 0.35 + 0.25 * Math.sin(clock * 4 + c.id); cx.lineWidth = 1.5; cx.beginPath(); cx.arc(p.x, p.y, cr + 2.5, 0, TAU); cx.stroke(); cx.globalAlpha = 1; }
  const g = cx.createRadialGradient(p.x - cr * 0.35, p.y + bob - cr * 0.35, cr * 0.1, p.x, p.y + bob, cr);
  g.addColorStop(0, "#ffffff"); g.addColorStop(0.25, S.body); g.addColorStop(1, S.body);
  cx.fillStyle = g; cx.strokeStyle = "#05070b"; cx.lineWidth = 2; cx.beginPath(); cx.arc(p.x, p.y + bob, cr, 0, TAU); cx.fill(); cx.stroke();
  if (c.hp < 100) { cx.strokeStyle = c.hp < 35 ? "#ff5a4a" : "#7fe08a"; cx.lineWidth = 2; cx.beginPath(); cx.arc(p.x, p.y + bob, cr + 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * c.hp / 100); cx.stroke(); }
  if (c.task === "fight") { cx.fillStyle = "#ffe08a"; cx.beginPath(); cx.arc(p.x + cr, p.y - cr * 0.2, 2, 0, TAU); cx.fill(); }
  // chevrons (one per rank) in the specialty color, then the name
  const fs = Math.max(9, Math.round(9.5 * Math.min(1.3, deckS))), tw = cx.measureText(c.name).width, cw = fs * 0.55, total = c.lvl * cw * 0.75 + 3 + tw;
  let x = p.x - total / 2; const y = p.y + bob - cr - 5;
  cx.strokeStyle = S.chev; cx.lineWidth = 1.7;
  for (let k = 0; k < c.lvl; k++) { cx.beginPath(); cx.moveTo(x, y - fs * 0.75); cx.lineTo(x + cw * 0.5, y - fs * 0.4); cx.lineTo(x, y - fs * 0.05); cx.stroke(); x += cw * 0.75; }
  cx.fillStyle = "rgba(0,0,0,.7)"; cx.fillText(c.name, x + 4, y + 1); cx.fillStyle = c.sel ? "#ffffff" : "#d8dce6"; cx.fillText(c.name, x + 3, y);
}
function drawDecks() {
  const D = deckR, s = deckS, alert = enemies.length > 0 || boarders.length > 0, pulse = 0.5 + 0.5 * Math.sin(clock * 4);
  cx.fillStyle = "#080b13"; cx.fillRect(D.x, D.y, D.w, D.h);
  cx.fillStyle = alert ? "rgba(255,50,40," + (0.35 + 0.4 * pulse) + ")" : "#1c2536"; cx.fillRect(D.x, D.y, 2, D.h);
  const hover = playing && crew.some((c) => c.sel) && !ptr.down ? roomAt(ptr) : null;
  for (let d = 0; d < 3; d++) {
    const o = deckO[d], jx = (rnd() - 0.5) * deckShake[d] * 14, jy = (rnd() - 0.5) * deckShake[d] * 14;
    cx.save(); cx.translate(o.x + jx, o.y + jy); cx.scale(s, s);
    // the hull, bow to the right
    cx.beginPath(); cx.moveTo(4, 2); cx.lineTo(600, 2); cx.quadraticCurveTo(DW + 26, 30, DW + 30, CY); cx.quadraticCurveTo(DW + 26, DH - 30, 600, DH - 2); cx.lineTo(4, DH - 2); cx.closePath();
    cx.fillStyle = "#101826"; cx.fill(); cx.strokeStyle = alert ? "rgba(255,70,60," + (0.45 + 0.4 * pulse) + ")" : "#34425c"; cx.lineWidth = 3; cx.stroke();
    cx.strokeStyle = "rgba(255,255,255,.04)"; cx.lineWidth = 1; for (let k = 0; k < 6; k++) { cx.beginPath(); cx.moveTo(4 + k * 3, 6 + k * 2); cx.lineTo(4 + k * 3, DH - 6 - k * 2); cx.stroke(); }
    // corridor (with running lights) and the lift
    cx.fillStyle = "#0c111b"; cx.fillRect(50, 88, 580, 24);
    for (let x = 60; x < 630; x += 20) { cx.fillStyle = alert ? (Math.floor(clock * 6 + x / 20) % 6 === 0 ? "#ff4a3a" : "#3a1a1a") : (Math.floor(clock * 3 + x / 20) % 8 === 0 ? "#5a7aa8" : "#1c2638"); cx.fillRect(x, 99, 6, 2); }
    cx.fillStyle = "#161e2e"; cx.fillRect(10, 62, 40, 76); cx.strokeStyle = "#4a5a78"; cx.lineWidth = 2; cx.strokeRect(10, 62, 40, 76);
    const lifting = crew.some((c) => c.ride > 0 && (c.deck === d || c.rideTo === d)) || boarders.some((c) => c.ride > 0 && (c.deck === d || c.rideTo === d));
    cx.fillStyle = lifting ? "#f2b134" : "#4a5a78"; cx.beginPath(); cx.moveTo(30, 68); cx.lineTo(23, 77); cx.lineTo(37, 77); cx.fill(); cx.beginPath(); cx.moveTo(30, 132); cx.lineTo(23, 123); cx.lineTo(37, 123); cx.fill();
    cx.strokeStyle = "#232e44"; cx.lineWidth = 1; for (let y = 82; y < 120; y += 6) { cx.beginPath(); cx.moveTo(14, y); cx.lineTo(46, y); cx.stroke(); }
    for (const r of rooms) {
      if (r.deck !== d) continue;
      // floor: plates, the division tint, scorch marks
      cx.fillStyle = "#172033"; cx.fillRect(r.x, r.y, r.w, r.h);
      cx.fillStyle = SPECS[r.spec].tint; cx.fillRect(r.x, r.y, r.w, r.h);
      cx.strokeStyle = "rgba(255,255,255,.035)"; cx.lineWidth = 1; cx.beginPath();
      for (let x = r.x + 16; x < r.x + r.w; x += 16) { cx.moveTo(x, r.y); cx.lineTo(x, r.y + r.h); }
      for (let y = r.y + 16; y < r.y + r.h; y += 16) { cx.moveTo(r.x, y); cx.lineTo(r.x + r.w, y); }
      cx.stroke();
      for (const sc of r.scorch) { const g = cx.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, sc.s); g.addColorStop(0, "rgba(0,0,0,.55)"); g.addColorStop(1, "rgba(0,0,0,0)"); cx.fillStyle = g; cx.fillRect(sc.x - sc.s, sc.y - sc.s, sc.s * 2, sc.s * 2); }
      cx.save(); cx.beginPath(); cx.rect(r.x, r.y, r.w, r.h); cx.clip();
      if (r.top) cx.translate(r.x, r.y); else { cx.translate(r.x, r.y + r.h); cx.scale(1, -1); }
      drawRoomDeco(r);
      cx.restore();
      // lighting: dark when nobody works it, red under alert, fire, hits
      if (r.power <= 0) { cx.fillStyle = "rgba(2,4,8,.38)"; cx.fillRect(r.x, r.y, r.w, r.h); }
      if (r.hp < 100) { cx.fillStyle = "rgba(0,0,0," + (0.35 * (1 - r.hp / 100)) + ")"; cx.fillRect(r.x, r.y, r.w, r.h); }
      if (alert) { cx.fillStyle = "rgba(255,30,20," + (0.035 + 0.04 * pulse) + ")"; cx.fillRect(r.x, r.y, r.w, r.h); }
      if (r.fire > 0) { cx.fillStyle = "rgba(255," + (80 + 50 * Math.sin(clock * 9 + r.x)) + ",20," + (0.12 + 0.25 * r.fire) + ")"; cx.fillRect(r.x, r.y, r.w, r.h); }
      if (r.flash > 0) { cx.fillStyle = "rgba(255,230,200," + r.flash * 0.3 + ")"; cx.fillRect(r.x, r.y, r.w, r.h); }
      if (r === hover) { cx.strokeStyle = "rgba(242,177,52," + (0.6 + 0.3 * pulse) + ")"; cx.lineWidth = 3; cx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); }
      // walls, and a sliding door onto the corridor
      const dy = r.top ? r.y + r.h : r.y, oy = r.top ? r.y : r.y + r.h;
      cx.strokeStyle = "#62728f"; cx.lineWidth = 3.5; cx.beginPath();
      cx.moveTo(r.x, oy); cx.lineTo(r.x + r.w, oy); cx.moveTo(r.x, r.y); cx.lineTo(r.x, r.y + r.h); cx.moveTo(r.x + r.w, r.y); cx.lineTo(r.x + r.w, r.y + r.h);
      cx.moveTo(r.x, dy); cx.lineTo(r.door.x - 13, dy); cx.moveTo(r.door.x + 13, dy); cx.lineTo(r.x + r.w, dy); cx.stroke();
      const op = r.doorOpen * 11; cx.strokeStyle = r.fire > 0 ? "#ff8a3a" : "#8a9ab8"; cx.lineWidth = 2.5; cx.beginPath(); cx.moveTo(r.door.x - 13, dy); cx.lineTo(r.door.x - 1 - op, dy); cx.moveTo(r.door.x + 1 + op, dy); cx.lineTo(r.door.x + 13, dy); cx.stroke();
      // station pips (lit by power), the room's condition, and its mission
      for (let k = 0; k < r.slots; k++) { cx.fillStyle = r.power > k / r.slots + 0.01 ? SPECS[r.spec].chev : "#2a3448"; cx.fillRect(r.x + r.w - 14 - k * 12, r.top ? r.y + r.h - 12 : r.y + 6, 8, 6); }
      if (r.hp < 100) { const by = r.top ? r.y + r.h - 20 : r.y + 14; cx.fillStyle = "rgba(0,0,0,.6)"; cx.fillRect(r.x + r.w - 70, by, 56, 4); cx.fillStyle = r.hp < 35 ? "#ff5a4a" : "#f2b134"; cx.fillRect(r.x + r.w - 70, by, 56 * r.hp / 100, 4); }
      const m = missions.find((q) => q.room === r.id);
      if (m) {
        const mx = r.x + r.w - 22 - r.slots * 12, my = r.top ? r.y + r.h - 9 : r.y + 9, col = m.hazard ? "#ff5a4a" : "#f2b134";
        cx.strokeStyle = col; cx.globalAlpha = 0.25 + 0.25 * pulse; cx.lineWidth = 4; cx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); cx.globalAlpha = 1;
        cx.lineWidth = 2.5; cx.beginPath(); cx.arc(mx, my, 6, -Math.PI / 2, -Math.PI / 2 + TAU * m.prog / m.need); cx.stroke(); cx.fillStyle = col; cx.beginPath(); cx.arc(mx, my, 2.5, 0, TAU); cx.fill();
      }
    }
    // particles: flames, smoke, sparks, spray
    for (const p of iparts) {
      if (p.d !== d) continue; const a = clamp(p.life / p.max, 0, 1);
      if (p.smoke) { cx.globalAlpha = a * 0.5; cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y, p.s * (1.6 - a), 0, TAU); cx.fill(); }
      else if (p.flame) { cx.globalAlpha = a; cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y, p.s * a, 0, TAU); cx.fill(); }
      else { cx.globalAlpha = a; cx.fillStyle = p.c; cx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    }
    cx.globalAlpha = 1;
    cx.restore();
    // labels at a readable size
    cx.font = "600 " + Math.max(9, Math.round(10 * Math.min(1.3, s))) + "px 'JetBrains Mono', monospace"; cx.textBaseline = "top"; cx.textAlign = "left";
    cx.fillStyle = alert ? "rgba(255,110,100," + (0.6 + 0.4 * pulse) + ")" : "#6f7a90"; cx.fillText(DECKS[d].name.toUpperCase(), o.x, o.y - 15);
    for (const r of rooms) if (r.deck === d) { cx.fillStyle = r.fire > 0 ? "#ffb070" : r.power > 0 ? "#b8c2d6" : "#6a7488"; cx.fillText(r.name.toUpperCase(), o.x + (r.x + 6) * s + jx, o.y + (r.top ? r.y + r.h - 5 : r.y + 5) * s - (r.top ? 11 : 0) + jy); }
  }
  // red alert banner
  if (alert) { cx.font = "800 " + Math.round(clamp(16 * s, 13, 22)) + "px 'Big Shoulders Display', Impact, sans-serif"; cx.textAlign = "right"; cx.textBaseline = "top"; cx.fillStyle = "rgba(255,70,60," + (0.5 + 0.5 * pulse) + ")"; cx.fillText(boarders.length ? "INTRUDER ALERT" : "RED ALERT", D.x + D.w - 14, D.y + 8); cx.textAlign = "left"; }
  // people
  const cr = clamp(7.5 * s, 6, 11);
  cx.textBaseline = "alphabetic"; cx.font = "600 " + Math.max(9, Math.round(9.5 * Math.min(1.3, s))) + "px 'JetBrains Mono', monospace";
  for (const b of boarders) drawEnt(b, cr);
  for (const c of crew) drawEnt(c, cr);
  if (ptr.down && ptr.box) { cx.strokeStyle = "rgba(242,177,52,.8)"; cx.fillStyle = "rgba(242,177,52,.08)"; cx.lineWidth = 1; cx.fillRect(ptr.sx, ptr.sy, ptr.x - ptr.sx, ptr.y - ptr.sy); cx.strokeRect(ptr.sx, ptr.sy, ptr.x - ptr.sx, ptr.y - ptr.sy); }
}
function hud() {
  $("h-sector").textContent = sector + " / 5";
  const hf = Math.max(0, ship.hull) / ship.hullMax, hb = $("h-hull"); hb.style.width = (100 * hf) + "%"; hb.style.background = hf < 0.35 ? "#ff5a4a" : "#e9e6dc";
  $("h-shield").style.width = (100 * ship.shield / ship.shieldMax) + "%";
  $("h-jump").style.width = (100 * jump.p) + "%";
  $("h-res").textContent = "Torpedoes " + ship.torps + "/" + ship.torpMax + " · Research " + Math.floor(rp) + " · Crew " + crew.length;
  $("jump").hidden = !!enemies.length || !!boarders.length || jump.on;
  for (const b of document.querySelectorAll("#upg .u")) { const u = UPG.find((q) => q[0] === b.dataset.k); b.disabled = !upg[u[0]] && rp < u[2]; }
  const mh = missions.map((m) => "<div class='mis" + (m.hazard ? " hazard" : "") + "'><b>" + m.label + "</b><span>" + R[m.room].name + " · " + Math.ceil(m.left) + "s</span><div class='bar'><i style='width:" + (100 * m.prog / m.need) + "%;background:" + (m.hazard ? "#ff5a4a" : "#f2b134") + "'></i></div></div>").join("");
  if ($("missions").innerHTML !== mh) $("missions").innerHTML = mh;
  const sel = crew.filter((c) => c.sel), el = $("sel");
  if (sel.length === 1) { const c = sel[0]; el.textContent = c.name + " · " + SPECS[c.spec].name + " · rank " + c.lvl + " · " + Math.ceil(c.hp) + "%"; }
  else el.textContent = sel.length ? sel.length + " selected" : "";
  el.style.left = (deckR.x + 12) + "px"; el.style.top = (deckR.y + deckR.h - 20) + "px";
}

let last = performance.now();
setup();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (playing && !paused) step(dt);
  else if (!playing) { clock += dt; for (const r of rooms) r.power = crew.some((c) => c.room === r.id) ? 1 : 0; for (const c of crew) c.task = "op"; ship.a += dt * 0.05; ship.v = 20; }
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawSpace(); drawDecks(); if (playing) hud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.Crew = { get state() { return { clock, crew, boarders, enemies, rooms, ship, missions, sector, rp, target, playing, ended, deckO, deckS, spaceR }; }, start, order: (c, id) => order(c, R[id]), target: (e) => (target = e), jump: () => (jump.on = true), sim: (t) => { for (let i = 0; i < t * 20 && playing; i++) step(0.05); } };
})();
