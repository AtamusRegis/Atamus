// Atamus: Saturn ring mining (owner, 2026-10-16: the 2D prototype). One shared world seen from above: Saturn in the
// middle, the station beside it, two asteroid rings, the locked line past them. W / S thrust along the nose, A / D turn,
// Q / E strafe; the mouse aims; the left button holds the mining laser on; the right button uses the module on a ship or
// an asteroid; F switches the module on or off; the wheel zooms. Fly into the station to deliver the hold and use its panel.
// The server decides everything; this page predicts my own ship with the same numbers and draws the rest.
import { C, ART, shipLayout, drawShip, drawStation, drawRock, drawSaturn } from "./shipart.js?v=1792300005";
import { genRock } from "./ringgen.js?v=1792300003";

if (typeof needLogin === "function" && needLogin()) location.replace("login.html");
const $ = (id) => document.getElementById(id);
const statusEl = $("status"), countEl = $("countdown");
const WEB_BUILD = (document.querySelector('meta[name="atamus-build"]') || {}).content || "";
const TAU = Math.PI * 2, hyp = Math.hypot;

// ---- the game's numbers (the hello sends them) ----
let G = null;
const rockR = (n) => G.rock.radiusBase + G.rock.radiusPer * n, towFactor = (n) => Math.max(0.05, G.rock.towBase - (n - 1) * G.rock.towPer);   // (as the server's rules.js)
const sectorOf = (x, y) => (((Math.round(Math.atan2(x, -y) / (Math.PI / 2))) % 4) + 4) % 4;
const ORE_KEYS = ["iron", "nickel", "ice", "titanium", "cobalt", "platinum"];
const kindBit = (k) => 1 << G.kinds.indexOf(k);
const lvlOf = (k) => (ME.upgrades && ME.upgrades[k]) || 0;
const myHull = () => G.hulls[Math.max(0, Math.min(G.hulls.length - 1, ME.hull || 0))];   // (owner, 2026-10-17: every flying number is the hull's)
const myVision = () => Math.min(G.world.loadR, Math.max(myHull().vision, (ME.mods || []).includes("scanner") ? mval("scanner", "range") : 0));   // (the fog: as the server)
const mySpeedMul = () => (ME.mods || []).reduce((m, k) => m * (G.modules[k] ? mval(k, "speed") : 1), 1);
const mval = (k, stat, lv = lvlOf(k)) => { const v = G.modules[k][stat]; return Array.isArray(v) ? v[Math.min(v.length - 1, lv)] : v; };
const oreName = (k, ref) => (ref ? "Refined " : "") + (G && G.ores[k] ? G.ores[k].name : k);   // (owner, 2026-10-17: "Refined Beta")

// ---- state ----
let myId = null, myName = "", amStaff = false, haveMe = false;
const mine = { x: 0, y: 0, vx: 0, vy: 0, h: 0, inSector: -1 };
const corr = { x: 0, y: 0 };
let ME = { fuel: 100, tank: 100, cap: 5, hold: {}, units: [], names: {}, credits: 0, docked: 0, mods: ["miner"], on: ["miner"], hull: 0, slots: 1, upgrades: {}, tow: 0, pump: 0, refine: 0, sos: 0, zone: "" };
let STATION = { storage: {}, queue: [], modules: [] }, SOC = { party: null, corp: null };
let sectors = [1, 1, 1, 1], online = 0, sosList = [], mates = [];   // mates: [id, x, y, bits: 1 party, 2 corporation]
const ships = new Map();                       // id -> { id, name, buf, row, x, y, h, near }
const rocks = new Map();                       // id -> { id, x, y, n, cracks, hp, ore, tow, dx, dy }: built from the two below
const rockCells = new Map();                   // "layer:cx,cy" -> [untouched asteroids built from their seeds (ringgen.js)]
const rockRows = new Map();                    // id -> the asteroids someone has worked on, as the server sends them
const ores = new Map();                        // id -> { id, x, y, o, r }
const names = new Map();                       // id -> name (the roster)
const fx = [];                                 // effects being drawn

// ---- the canvas and camera ----
const cv = $("view"), cx = cv.getContext("2d");
let VW = 0, VH = 0, DPR = 1, zoom = 1.1;
const ZMIN = 0.32, ZMAX = 3;
try { const z = +localStorage.getItem("atamus.zoom"); if (z >= ZMIN && z <= ZMAX) zoom = z; } catch {}
function resize() { DPR = Math.min(devicePixelRatio || 1, 2); VW = innerWidth; VH = innerHeight; cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR); cv.style.width = VW + "px"; cv.style.height = VH + "px"; }
addEventListener("resize", resize); resize();
const cam = { x: 0, y: 0 };
const toScreen = (x, y) => [(x - cam.x) * zoom + VW / 2, (y - cam.y) * zoom + VH / 2];
const toWorld = (sx, sy) => [cam.x + (sx - VW / 2) / zoom, cam.y + (sy - VH / 2) / zoom];
// stars: two layers far below the rings, drifting slower than the world as you fly (tiled so they never run out)
const STARS = [0.06, 0.16].map((k, li) => { let a = 7 + li * 99; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647); return { k, pts: Array.from({ length: 220 }, () => [r() * 2048, r() * 2048, 0.4 + r() * (li ? 1.3 : 0.9), 0.25 + r() * 0.6]) }; });

// ---- input ----
const keys = new Set();
const mouse = { x: 0, y: 0, over: false };
let firing = false;
const typing = () => { const el = document.activeElement; return !!el && ((el.tagName === "INPUT" && !["range", "checkbox", "button"].includes(el.type)) || el.tagName === "TEXTAREA" || el.tagName === "SELECT"); };
addEventListener("keydown", (e) => {
  if (typing()) return;
  if (e.code === "Enter") { e.preventDefault(); openChat(); return; }
  if (e.code === "Escape") hideMenu();
  if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"].includes(e.code)) { keys.add(e.code); e.preventDefault(); }
  if (e.code === "KeyF" && !e.repeat) { send({ t: "mod" }); e.preventDefault(); }
  if (/^Digit[1-4]$/.test(e.code) && !e.repeat) { const k = (ME.mods || [])[+e.code.slice(5) - 1]; if (k) send({ t: "mod", k }); }   // (a module by its slot)
  if (e.key === "Alt") { altDown = true; e.preventDefault(); refreshTip(); }
});
addEventListener("keyup", (e) => { keys.delete(e.code); if (e.key === "Alt") { altDown = false; refreshTip(); } });
addEventListener("blur", () => { keys.clear(); firing = false; altDown = false; });
document.addEventListener("contextmenu", (e) => e.preventDefault());
cv.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.over = true; });
cv.addEventListener("mouseleave", () => { mouse.over = false; });
// what's under the pointer: a loose ore unit, another ship, an asteroid
function oreAt(sx, sy) { const [wx, wy] = toWorld(sx, sy); let best = null, bd = Math.max(9, 12 / zoom); for (const o of ores.values()) { const d = hyp(o.dx - wx, o.dy - wy); if (d < bd) { bd = d; best = o; } } return best; }
function shipAt(sx, sy) { const [wx, wy] = toWorld(sx, sy); let best = null, bd = 34 / Math.min(1, zoom); for (const s of ships.values()) { if (s.id === myId || !s.near) continue; const d = hyp(s.x - wx, s.y - wy); if (d < bd) { bd = d; best = s; } } return best; }
function rockAt(sx, sy) { const [wx, wy] = toWorld(sx, sy); for (const r of rocks.values()) if (hyp(r.dx - wx, r.dy - wy) < rockR(r.n) + 6) return r; return null; }
cv.addEventListener("mousedown", (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (e.button === 0) {                        // a loose ore unit under the pointer is claimed; otherwise the laser fires
    const o = oreAt(e.clientX, e.clientY); if (o) { send({ t: "act", ore: o.id }); return; }
    firing = true;
  }
  if (e.button === 2) {                        // another ship: its menu; an asteroid: what my modules can do to it
    const s = shipAt(e.clientX, e.clientY); if (s) { shipMenu(s, e.clientX, e.clientY); return; }
    const r = rockAt(e.clientX, e.clientY); if (!r) return;
    const ops = [...(ME.mods.includes("scanner") && !r.ore ? [["Scan", "scan"]] : []), ...(ME.mods.includes("tractor") ? [[ME.tow === r.id ? "Release" : "Tow", "tow"]] : [])];
    if (ops.length === 1) send({ t: "act", rock: r.id, op: ops[0][1] });
    else if (ops.length > 1) showMenu(e.clientX, e.clientY, ops.map(([label, op]) => [label, () => send({ t: "act", rock: r.id, op })]));
  }
});
addEventListener("mouseup", (e) => { if (e.button === 0) firing = false; });
cv.addEventListener("wheel", (e) => { e.preventDefault(); zoom = Math.min(ZMAX, Math.max(ZMIN, zoom * (e.deltaY > 0 ? 0.9 : 1.11))); try { localStorage.setItem("atamus.zoom", String(zoom)); } catch {} }, { passive: false });
// ship-relative controls: W thrusts along the nose (nose: (sin h, -cos h)), S backs up, Q / E push sideways, A / D turn
function pushInput() {
  let f = 0, s = 0; if (keys.has("KeyW")) f += 1; if (keys.has("KeyS")) f -= 1; if (keys.has("KeyE")) s += 1; if (keys.has("KeyQ")) s -= 1;
  const h = mine.h; let x = Math.sin(h) * f + Math.cos(h) * s, y = -Math.cos(h) * f + Math.sin(h) * s; const L = hyp(x, y); if (L > 1) { x /= L; y /= L; }
  return { x, y, turn: (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) };
}
const aimAngle = () => { const [sx, sy] = toScreen(mine.x, mine.y); return Math.atan2(mouse.y - sy, mouse.x - sx); };

// ---- the socket ----
let ws = null, srvBuild = "", closedForGood = false, rtt = 80, srvOff = null, pingTimer = 0;
const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const wsUrl = () => { const q = new URLSearchParams(); if (typeof deviceId === "function") q.set("d", deviceId()); const as = new URLSearchParams(location.search).get("as"); if (as) q.set("as", as);
  return (typeof API_BASE !== "undefined" ? API_BASE : location.origin).replace(/^http/, "ws") + "/ws?" + q.toString(); };
function connect() {
  statusEl.hidden = false; statusEl.textContent = "Connecting…";
  ws = new WebSocket(wsUrl());
  ws.onopen = () => { statusEl.hidden = true; clearInterval(pingTimer); pingTimer = setInterval(() => send({ t: "ping", ts: performance.now() }), 2000); };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMsg(m); };
  ws.onclose = (ev) => {
    if (closedForGood) return;
    if (ev.code === 4001) { location.href = "login.html"; return; }
    if (ev.code === 4002) { closedForGood = true; statusEl.hidden = false; statusEl.textContent = "Playing on another tab or device."; setTimeout(() => (location.href = "play.html"), 1500); return; }
    if (ev.code === 4003 || ev.code === 4005 || ev.code === 4006) {
      closedForGood = true; statusEl.hidden = false;
      statusEl.textContent = ev.code === 4003 ? "Another account is playing on this device." : (ev.code === 4005 ? "Kicked" : "Banned") + (ev.reason ? ": " + ev.reason : ".");
      setTimeout(() => (location.href = ev.code === 4006 ? "login.html" : "play.html"), 3000); return;
    }
    statusEl.hidden = false; statusEl.textContent = "Reconnecting…"; setTimeout(connect, 2000);
  };
}
function onMsg(m) {
  if (m.t === "batch") { for (const x of Array.isArray(m.m) ? m.m : []) onMsg(x); return; }
  if (!G && !["hello", "countdown", "update", "chat", "staff", "pong", "join", "leave", "game"].includes(m.t)) return;   // (nothing that needs the game's numbers before the hello)
  if (m.t === "hello") {
    srvBuild = m.build || "";
    if (m.updating && m.updating.parts) { if (typeof m.updating.to === "string" && /^[0-9a-f]{7,40}$/.test(m.updating.to)) countHead = m.updating.to; goUpdating(m.updating.parts); return; }
    G = m.game; myId = m.you.id; myName = m.you.name; amStaff = !!m.you.staff; if (m.you.dev) devMount();
    mine.x = m.spawn.x; mine.y = m.spawn.y; mine.h = m.spawn.h || 0; mine.vx = mine.vy = 0; corr.x = corr.y = 0; haveMe = true; cam.x = mine.x; cam.y = mine.y;
    sectors = m.sectors || sectors; online = m.online || 0;
    ships.clear(); rocks.clear(); rockCells.clear(); rockRows.clear(); ores.clear(); names.clear(); snapRows = new Map();
    for (const r of m.roster || []) names.set(r.i, r.n);
    if (m.you.staff && window.AdminPanel) window.AdminPanel.mount();
    if (m.countdown) startCountdown(Date.now() + m.countdown.in, m.countdown.parts, m.countdown.head);
    drawPrefix();
  } else if (m.t === "snap") onSnap(m);
  else if (m.t === "rocks") {                  // untouched asteroids come as seeds per cell; worked-on ones as rows
    for (const [key, seeds] of Object.entries(m.c || {})) {
      const [cx, cy] = key.slice(key.indexOf(":") + 1).split(",").map(Number), list = [];
      for (const seed of seeds) { const id = key + ":" + seed, old = rocks.get(id), g = genRock(cx, cy, seed, G.world.cell, G.world.rings, G.ringSizes); if (g) list.push(old && !rockRows.has(id) ? old : { id, x: g.x, y: g.y, n: g.n, cracks: g.n, hp: 100, ore: 0, tow: 0, dx: g.x, dy: g.y }); }
      rockCells.set(key, list);
    }
    for (const key of m.xc || []) rockCells.delete(key);
    for (const r of m.a || []) { const [id, x, y, n, cracks, hp, ore, tow] = r; const o = rockRows.get(id) || rocks.get(id); if (o) { Object.assign(o, { x, y, n, cracks, hp, ore, tow }); rockRows.set(id, o); } else rockRows.set(id, { id, x, y, n, cracks, hp, ore, tow, dx: x, dy: y }); }
    for (const id of m.x || []) rockRows.delete(id);
    rocks.clear();
    for (const list of rockCells.values()) for (const r of list) if (!rockRows.has(r.id)) rocks.set(r.id, r);
    for (const r of rockRows.values()) rocks.set(r.id, r);
  } else if (m.t === "ores") {
    for (const r of m.a || []) { const [id, x, y, oi, ref] = r; const o = ores.get(id); if (o) Object.assign(o, { x, y }); else ores.set(id, { id, x, y, dx: x, dy: y, o: ORE_KEYS[oi] || "iron", r: ref }); }
    for (const id of m.x || []) ores.delete(id);
  } else if (m.t === "me") { const wasDocked = ME.docked; ME = m; if (ME.docked !== wasDocked) drawStation_(); else if (ME.docked) { drawStation_(); drawShop(); } drawHud(); refreshTip(); }
  else if (m.t === "station") { STATION = m; STATION.at = performance.now(); drawStation_(); drawShop(); }
  else if (m.t === "trade") showTrade(m);
  else if (m.t === "invite") showInvite(m);
  else if (m.t === "mates") mates = m.m || [];
  else if (m.t === "game") {                   // (developer panel) the numbers changed: everything that reads them redraws
    G = m.game; hudKey = ""; stKey = ""; shopKey = "";
    if (m.field) { rockCells.clear(); rockRows.clear(); rocks.clear(); }
    drawHud(); drawStation_(); drawShop(); devRefresh();
  }
  else if (m.t === "soc") { SOC = m; drawParty(); }
  else if (m.t === "sectors") { sectors = m.s; online = m.online; }
  else if (m.t === "sos") sosList = m.s || [];
  else if (m.t === "fx") { fx.push({ ...m, t0: performance.now() }); if (m.k === "crack" && hyp(m.x - mine.x, m.y - mine.y) < 600) tutS.cracked = true; }
  else if (m.t === "join") names.set(m.i, m.n);
  else if (m.t === "leave") { ships.delete(m.i); }
  else if (m.t === "teleport") { mine.x = m.x; mine.y = m.y; mine.vx = mine.vy = 0; corr.x = corr.y = 0; }
  else if (m.t === "chat") addChat(m);
  else if (m.t === "staff") location.reload();
  else if (m.t === "pong") rtt = rtt * 0.7 + Math.max(0, performance.now() - m.ts) * 0.3;
  else if (m.t === "countdown") startCountdown(Date.now() + m.in, m.parts, m.head);
  else if (m.t === "update") { if (typeof m.web === "string" && WEB_BUILD && m.web === WEB_BUILD) return; if (typeof m.web === "string" && /^[0-9a-f]{7,40}$/.test(m.web)) countHead = m.web; goUpdating(["web"]); }
}
let snapRows = new Map();
function onSnap(m) {
  { const off = Date.now() - m.ts; srvOff = srvOff === null || off < srvOff ? off : srvOff + (off - srvOff) * 0.01; }
  const full = m.same ? [...snapRows.values()] : [...(m.p || []), ...(m.u || []).map((id) => snapRows.get(id)).filter(Boolean)];
  snapRows = new Map(full.map((r) => [r[0], r]));
  const seen = new Set();
  for (const r of full) {
    const id = r[0], x = r[1] / 10, y = r[2] / 10, h = r[3] / 1000; seen.add(id);
    let s = ships.get(id); if (!s) { s = { id, buf: [], x, y, h, near: false }; ships.set(id, s); }
    s.row = r;
    if (id === myId) {                         // soft-correct my prediction toward where the server will be once it has my input
      const lead = (rtt / 2 + 50) / 1000, tx = x + mine.vx * lead, ty = y + mine.vy * lead, err = hyp(tx - mine.x, ty - mine.y);
      if (err > 60) { mine.x = tx; mine.y = ty; corr.x = corr.y = 0; } else { corr.x = tx - mine.x; corr.y = ty - mine.y; }
      continue;
    }
    if (!s.near) { s.near = true; s.buf = []; s.x = x; s.y = y; s.h = h; }
    s.buf.push({ t: m.ts, x, y, h }); if (s.buf.length > 20) s.buf.shift();
  }
  for (const s of ships.values()) if (s.id !== myId && !seen.has(s.id)) { s.near = false; s.buf = []; }
}

// ---- my ship, predicted as the server integrates it ----
function allowedMe(x, y) {
  const r = hyp(x, y); if (r < G.world.saturnR + myHull().shipR || r > G.world.lockedR) return false;
  if (r < G.world.safeR) return true; const s = sectorOf(x, y); return sectors[s] > 0 || mine.inSector === s;
}
function stepMe(dt, inp) {
  const S = myHull(), empty = ME.fuel <= 0.0001, rock = ME.tow && rocks.get(ME.tow);
  const k = empty ? S.crawl : 1, spd = S.speed * mySpeedMul() * (ME.spdBoost || 1) * k * (rock ? Math.min(1, towFactor(rock.n) * mval("tractor", "tow")) : 1), push = hyp(inp.x, inp.y);
  const a = (push > 0.01 ? S.accel * k : S.brake) * dt;
  let ex = inp.x * spd - mine.vx, ey = inp.y * spd - mine.vy; const el = hyp(ex, ey); if (el > a) { ex *= a / el; ey *= a / el; }
  mine.vx += ex; mine.vy += ey;
  if (push > 0.01 && !empty) ME.fuel = Math.max(0, ME.fuel - S.flyBurn / 60 * push * dt);
  if (mine.vx || mine.vy) {
    const nx = mine.x + mine.vx * dt, ny = mine.y + mine.vy * dt;
    if (allowedMe(nx, ny)) { mine.x = nx; mine.y = ny; } else if (allowedMe(nx, mine.y)) { mine.x = nx; mine.vy = 0; } else if (allowedMe(mine.x, ny)) { mine.y = ny; mine.vx = 0; } else mine.vx = mine.vy = 0;
    for (const r of rocks.values()) {          // bump off asteroids, as the server does
      if (r.id === ME.tow) continue; const d = hyp(mine.x - r.dx, mine.y - r.dy), min = rockR(r.n) + S.shipR;
      if (d < min && d > 0.01) { const ux = (mine.x - r.dx) / d, uy = (mine.y - r.dy) / d; mine.x = r.dx + ux * min; mine.y = r.dy + uy * min; const vn = mine.vx * ux + mine.vy * uy; if (vn < 0) { mine.vx -= vn * ux; mine.vy -= vn * uy; } }
    }
    mine.inSector = hyp(mine.x, mine.y) >= G.world.safeR ? sectorOf(mine.x, mine.y) : -1;
  }
  mine.h = Math.atan2(Math.sin(mine.h + inp.turn * S.turn * dt), Math.cos(mine.h + inp.turn * S.turn * dt));
}
let lastSent = 0, lastKey = "", heartbeat = 0;
function sendInput(inp, t) {
  const a = Math.round(aimAngle() * 100) / 100, f = firing ? 1 : 0;
  const msg = { t: "in", x: Math.round(inp.x * 100) / 100, y: Math.round(inp.y * 100) / 100, h: Math.round(mine.h * 100) / 100, a, f };
  const key = JSON.stringify(msg);
  if ((key !== lastKey && t - lastSent >= 50) || t - heartbeat > 500) { send(msg); lastKey = key; lastSent = heartbeat = t; }
}

// ---- drawing ----
const fmt = (n) => Math.floor(n).toLocaleString("en-US");
function drawBackground(t) {
  cx.fillStyle = C.void; cx.fillRect(0, 0, VW, VH);
  for (const L of STARS) {
    const ox = -cam.x * L.k, oy = -cam.y * L.k;
    for (const [sx, sy, r, a] of L.pts) {
      let x = (sx + ox) % 2048, y = (sy + oy) % 2048; if (x < 0) x += 2048; if (y < 0) y += 2048;
      for (let ix = x; ix < VW; ix += 2048) for (let iy = y; iy < VH; iy += 2048) { cx.globalAlpha = a * (0.7 + 0.3 * Math.sin(t * 0.0007 + sx)); cx.fillStyle = "#dfe8ff"; cx.fillRect(ix, iy, r, r); }
    }
  }
  cx.globalAlpha = 1;
}
function drawWorld(t) {
  const W = G.world, ts = t / 1000;
  cx.save(); cx.translate(VW / 2, VH / 2); cx.scale(zoom, zoom); cx.translate(-cam.x, -cam.y);
  const lw = (px) => px / zoom;
  // rings: soft gold bands; the closed sectors shaded; the sector lines; the locked line
  for (const [a, b] of W.rings) { cx.strokeStyle = "rgba(216,176,106,0.07)"; cx.lineWidth = b - a; cx.beginPath(); cx.arc(0, 0, (a + b) / 2, 0, TAU); cx.stroke(); }
  for (let i = 0; i < 4; i++) if (sectors[i] !== 1) {
    const c0 = -Math.PI / 2 + i * Math.PI / 2 - Math.PI / 4;   // (screen angle: north is up)
    cx.fillStyle = sectors[i] === 2 ? "rgba(229,96,79,0.05)" : "rgba(11,14,21,0.55)";
    cx.beginPath(); cx.arc(0, 0, W.lockedR, c0, c0 + Math.PI / 2); cx.arc(0, 0, W.safeR, c0 + Math.PI / 2, c0, true); cx.closePath(); cx.fill();
  }
  cx.strokeStyle = "rgba(38,48,68,0.9)"; cx.lineWidth = lw(1.5); cx.setLineDash([lw(4), lw(10)]); cx.beginPath();
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; cx.moveTo(Math.cos(a) * W.safeR, Math.sin(a) * W.safeR); cx.lineTo(Math.cos(a) * W.lockedR, Math.sin(a) * W.lockedR); } cx.stroke();
  cx.strokeStyle = C.signal; cx.lineWidth = lw(2); cx.setLineDash([lw(14), lw(10)]); cx.beginPath(); cx.arc(0, 0, W.lockedR, 0, TAU); cx.stroke(); cx.setLineDash([]);
  if (hyp(cam.x, cam.y) - W.saturnR < hyp(VW, VH) / zoom) drawSaturn(cx, W.saturnR, ts);   // (only while it's on screen)
  // the station and its docking circle
  cx.save(); cx.translate(W.station[0], W.station[1]);
  cx.strokeStyle = C.gold; cx.globalAlpha = 0.35; cx.lineWidth = lw(1.5); cx.setLineDash([lw(3), lw(8)]); cx.beginPath(); cx.arc(0, 0, G.econ.dockR, 0, TAU); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1;
  drawStation(cx, ts); cx.restore();
  // asteroids
  const vr = Math.max(VW, VH) / zoom;
  for (const r of rocks.values()) {
    r.dx += (r.x - r.dx) * 0.2; r.dy += (r.y - r.dy) * 0.2;
    if (Math.abs(r.dx - cam.x) > vr || Math.abs(r.dy - cam.y) > vr) continue;
    const R = rockR(r.n); cx.save(); cx.translate(r.dx, r.dy);
    drawRock(cx, r.id, r.n, R, r.n - r.cracks, r.ore ? G.ores[r.ore].color : null, ts, r.tow);
    if (r.hp < 100 && r.hp > 0) { const w = R * 1.6; cx.fillStyle = "rgba(0,0,0,.6)"; cx.fillRect(-w / 2, -R - lw(14), w, lw(5)); cx.fillStyle = C.signal; cx.fillRect(-w / 2, -R - lw(14), w * r.hp / 100, lw(5)); }
    if (r.ore && zoom > 0.5) { cx.fillStyle = C.ink; cx.globalAlpha = 0.85; cx.font = `600 ${lw(11)}px "JetBrains Mono", monospace`; cx.textAlign = "center"; cx.fillText(oreName(r.ore).toUpperCase() + " · " + r.cracks, 0, R + lw(16)); cx.globalAlpha = 1; }
    cx.restore();
  }
  // loose ore: a square in the ore's color (refined: a white edge), waiting to be clicked; the one under the pointer is
  // ringed (gold when it's in reach)
  const hov = mouse.over ? oreAt(mouse.x, mouse.y) : null;
  for (const o of ores.values()) {
    o.dx += (o.x - o.dx) * 0.25; o.dy += (o.y - o.dy) * 0.25; const s = 9, bob = Math.sin(ts * 2 + o.id) * 1.2;
    cx.fillStyle = G.ores[o.o].color; cx.fillRect(o.dx - s / 2, o.dy - s / 2 + bob, s, s);
    cx.strokeStyle = o.r ? "#fff" : "rgba(0,0,0,.45)"; cx.lineWidth = lw(o.r ? 1.6 : 1); cx.strokeRect(o.dx - s / 2, o.dy - s / 2 + bob, s, s);
    if (o === hov) { const near = hyp(o.dx - mine.x, o.dy - mine.y) <= myHull().interactR; cx.strokeStyle = near ? C.gold : C.dim; cx.lineWidth = lw(1.5); cx.beginPath(); cx.arc(o.dx, o.dy + bob, s + 3, 0, TAU); cx.stroke(); }
  }
  // ships: module effects under them, the hull, lasers and links over (refineries at work: some ship's hold is theirs)
  const refining = new Set(); for (const q of ships.values()) if (q.row && q.row[10]) refining.add(q.row[10]);
  for (const s of ships.values()) if (s.row && (s.id === myId || s.near)) shipFx(s, ts, true);
  for (const s of ships.values()) if (s.row && (s.id === myId || s.near)) {
    const r = s.row, fl = r[5], onB = r[15] || 0, on = {}, mods = shipMods(r);
    for (const k of mods) on[k] = !!(onB & kindBit(k));
    const st = { t: ts, raw: r[11] / 100, ref: r[12] / 100, fuel: r[13] / 100, firing: !!(fl & 2), on, busy: { tractor: !!r[8], fueler: !!r[9], refinery: refining.has(s.id) }, thrust: s.id === myId ? hyp(lastInp.x, lastInp.y) : Math.min(1, (s.spd || 0) / 40) };
    if (s.id === myId) { st.fuel = ME.fuel / (ME.tank || 100); }
    cx.save(); cx.translate(s.x, s.y); cx.rotate(s.h); cx.scale(ART, ART); drawShip(cx, mods, st); cx.restore();
  }
  for (const s of ships.values()) if (s.row && (s.id === myId || s.near)) shipFx(s, ts, false);
  // (owner, 2026-10-17) my reach: claiming ore, the laser, fueling, refining, trading
  cx.strokeStyle = C.ink; cx.globalAlpha = 0.14; cx.lineWidth = lw(1.5); cx.setLineDash([lw(3), lw(9)]); cx.beginPath(); cx.arc(mine.x, mine.y, myHull().interactR, 0, TAU); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1;
  drawFx(t);
  // (owner, 2026-10-17) the fog of war: the world fades out past my vision (the server stops sending there too)
  { const V = myVision(), fog = cx.createRadialGradient(mine.x, mine.y, V * 0.78, mine.x, mine.y, V * 1.06);
    fog.addColorStop(0, "rgba(11,14,21,0)"); fog.addColorStop(1, "rgba(11,14,21,0.84)");
    cx.fillStyle = fog; const fr = Math.max(VW, VH) / zoom; cx.fillRect(cam.x - fr, cam.y - fr, fr * 2, fr * 2); }
  cx.restore();
}
// a ship's fitted modules, from the row's bits (the art orders them: see shipLayout)
function shipMods(r) { const b = r[14]; if (b === undefined) return [G.kinds[r[4]]]; return G.kinds.filter((k) => b & kindBit(k)); }
// a ship's modules at work: the command ring under it; over it, the laser, the tractor's leash, the hose, the refine link
function shipFx(s, ts, under) {
  const r = s.row, fl = r[5], lw = (px) => px / zoom, lay = shipLayout(shipMods(r)), yc = lay.yc;
  if (under) {
    if ((r[15] || 0) & kindBit("command")) {
      const R = r[17] || 300;
      cx.save(); cx.translate(s.x, s.y);
      cx.strokeStyle = C.gold; cx.lineWidth = lw(2); cx.globalAlpha = 0.5; cx.setLineDash([lw(26), lw(10), lw(4), lw(10)]); cx.rotate(ts / 20 * TAU); cx.beginPath(); cx.arc(0, 0, R, 0, TAU); cx.stroke();
      cx.setLineDash([]); const k = (ts % 2.6) / 2.6; cx.globalAlpha = 0.6 * (1 - k); cx.beginPath(); cx.arc(0, 0, 20 + (R - 20) * k, 0, TAU); cx.stroke(); cx.restore(); cx.globalAlpha = 1;
    }
    return;
  }
  if (fl & 2) {                                // the mining laser, from the nose along the aim to whatever it hits
    const a = r[6] / 1000, len = r[7], big = (r[15] || 0) & kindBit("miner"), nose = (yc - 30) * ART, x0 = s.x + Math.sin(s.h) * nose, y0 = s.y - Math.cos(s.h) * nose, x1 = s.x + Math.cos(a) * len, y1 = s.y + Math.sin(a) * len;
    cx.strokeStyle = C.signal; cx.lineCap = "round";
    cx.globalAlpha = 0.25; cx.lineWidth = lw(big ? 9 : 5); cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
    cx.globalAlpha = 1; cx.lineWidth = lw(big ? 3 : 1.6); cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
    if (fl & 1) { cx.fillStyle = "#fff"; cx.globalAlpha = 0.6 + 0.4 * Math.sin(ts * 50); cx.beginPath(); cx.arc(x1, y1, lw(big ? 6 : 4), 0, TAU); cx.fill(); cx.globalAlpha = 1; }
  }
  const at = (lx, ly) => { const c = Math.cos(s.h), sn = Math.sin(s.h); return [s.x + lx * c - ly * sn, s.y + lx * sn + ly * c]; };
  if (r[8]) {                                  // the tractor's leash, from both claw tips back to the asteroid
    const rk = rocks.get(r[8]);
    if (rk) { cx.strokeStyle = C.ice; cx.lineWidth = lw(2); cx.setLineDash([lw(4), lw(5)]); cx.globalAlpha = 0.5 + 0.5 * Math.sin(ts * 4.5); cx.beginPath();
      for (const lx of [35, 145]) { const [px, py] = at((lx - 90) * ART, (318 + (lay.off.tractor || 0) - yc) * ART); cx.moveTo(px, py); cx.lineTo(rk.dx, rk.dy); } cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1; }
  }
  const link = (id, color, dash, ly) => { const q = id === myId ? { x: mine.x, y: mine.y } : ships.get(id); if (!q) return; const [px, py] = at(0, ly); cx.strokeStyle = color; cx.lineWidth = lw(2.5); cx.setLineDash(dash.map(lw)); cx.beginPath(); cx.moveTo(px, py); cx.quadraticCurveTo((px + q.x) / 2 + 10, (py + q.y) / 2 - 10, q.x, q.y); cx.stroke(); cx.setLineDash([]); };
  if (r[9]) link(r[9], C.ice, [], (154 + (lay.off.fueler || 0) - yc) * ART);
  if (r[18]) { const rk = rocks.get(r[18]); if (rk) {    // (a scan under way: a soft cone to the asteroid with pings running up it)
    const a = Math.atan2(rk.dy - s.y, rk.dx - s.x), L = hyp(rk.dx - s.x, rk.dy - s.y), w = 0.3, k = (ts * 1.4) % 1;
    cx.save(); cx.translate(s.x, s.y); cx.rotate(a); cx.globalAlpha = 0.1; cx.fillStyle = C.ice; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(L, -L * w); cx.lineTo(L, L * w); cx.closePath(); cx.fill();
    cx.strokeStyle = C.ice; cx.lineWidth = lw(2.5); cx.globalAlpha = 0.8 * (1 - k); cx.beginPath(); cx.arc(k * L - 30, 0, 30 + k * L * w * 0.6, -0.7, 0.7); cx.stroke(); cx.restore(); cx.globalAlpha = 1; } }            // the fueler's hose, from the pump on top of the tank
  if (r[10] && r[10] !== s.id) { const q = r[10] === myId ? { x: mine.x, y: mine.y } : ships.get(r[10]); if (q) { cx.strokeStyle = C.ore; cx.lineWidth = lw(2.5); cx.setLineDash([lw(6), lw(5)]); cx.beginPath(); cx.moveTo(q.x, q.y); cx.quadraticCurveTo((q.x + s.x) / 2 + 10, (q.y + s.y) / 2 - 10, s.x, s.y); cx.stroke(); cx.setLineDash([]); } }   // a refinery working on this ship's hold
}
function drawFx(t) {
  const lw = (px) => px / zoom;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i], k = (t - f.t0) / 1000;
    if (f.k === "crack") {                     // a crack breaks: a flash ring and chips flying off
      if (k > 0.9) { fx.splice(i, 1); continue; }
      const R = f.r * (1 + k * (f.done ? 1.6 : 0.6)); cx.strokeStyle = f.done ? C.gold : C.ink; cx.globalAlpha = 1 - k / 0.9; cx.lineWidth = lw(2); cx.beginPath(); cx.arc(f.x, f.y, R, 0, TAU); cx.stroke();
      cx.fillStyle = C.rock; for (let j = 0; j < (f.done ? 14 : 6); j++) { const a = j * 2.39996 + f.x, d = f.r + k * (f.done ? 120 : 60); cx.fillRect(f.x + Math.cos(a) * d - 2, f.y + Math.sin(a) * d - 2, 4, 4); }
      cx.globalAlpha = 1;
    } else if (f.k === "scan") {               // a scan: the cone up to the asteroid with crescent pings running along it
      if (k > 2.4) { fx.splice(i, 1); continue; }
      const a = Math.atan2(f.y2 - f.y, f.x2 - f.x), L = hyp(f.x2 - f.x, f.y2 - f.y), w = 0.32;
      cx.save(); cx.translate(f.x, f.y); cx.rotate(a);
      cx.globalAlpha = 0.12 * (1 - k / 2.4); cx.fillStyle = C.ice; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(L, -L * w); cx.lineTo(L, L * w); cx.closePath(); cx.fill();
      cx.strokeStyle = C.ice; cx.lineWidth = lw(3); cx.lineCap = "round";
      for (const off of [0, 0.4, 0.8]) { const q = ((k / 1.2) + off) % 1, d = q * L; cx.globalAlpha = 0.9 * (1 - q); cx.beginPath(); cx.arc(d - 30, 0, 30 + d * w * 0.6, -0.7, 0.7); cx.stroke(); }
      cx.restore(); cx.globalAlpha = 1;
    } else if (f.k === "deliver") {            // ore delivered: "+n" rising off the ship
      if (k > 1.6) { fx.splice(i, 1); continue; }
      cx.globalAlpha = 1 - k / 1.6; cx.fillStyle = C.gold; cx.font = `800 ${lw(20)}px "Big Shoulders Display", sans-serif`; cx.textAlign = "center"; cx.fillText("+" + f.n, f.x, f.y - 40 - k * 40 / zoom); cx.globalAlpha = 1;
    } else if (f.k === "hand" || f.k === "refine" || f.k === "pick") {
      if (k > 0.5) { fx.splice(i, 1); continue; }
      cx.globalAlpha = 1 - k / 0.5; cx.strokeStyle = f.k === "refine" ? C.ore : C.gold; cx.lineWidth = lw(2); cx.beginPath(); cx.arc(f.x, f.y, 10 + k * 60, 0, TAU); cx.stroke(); cx.globalAlpha = 1;
    } else fx.splice(i, 1);
  }
}
// names over other ships (party members in gold) and the distress "!" over stranded ones; stranded ships off screen
// get a "!" at the screen's edge pointing at them
function drawOverlay(t) {
  cx.font = `700 12px "Atkinson Hyperlegible", system-ui, sans-serif`; cx.textAlign = "center";
  const party = new Set(SOC.party ? SOC.party.members.map((m) => m[0]) : []);
  const hov = mouse.over ? shipAt(mouse.x, mouse.y) : null;   // (owner, 2026-10-16) names dim, bright while the pointer is over the ship
  for (const s of ships.values()) {
    if (!s.row || s.id === myId || !s.near) continue;
    const [sx, sy] = toScreen(s.x, s.y); if (sx < -50 || sy < -50 || sx > VW + 50 || sy > VH + 50) continue;
    cx.fillStyle = party.has(s.id) ? C.gold : C.ink; cx.globalAlpha = s === hov ? 1 : 0.35; cx.fillText(names.get(s.id) || "", sx, sy - 40 * Math.max(0.6, zoom) - 6); cx.globalAlpha = 1;
  }
  for (const [id, x, y] of sosList) {
    const px = id === myId ? mine.x : x, py = id === myId ? mine.y : y; let [sx, sy] = toScreen(px, py); const off = sx < 16 || sy < 16 || sx > VW - 16 || sy > VH - 16;
    if (off) { const a = Math.atan2(sy - VH / 2, sx - VW / 2), k = Math.min((VW / 2 - 28) / Math.abs(Math.cos(a) || 1e-6), (VH / 2 - 28) / Math.abs(Math.sin(a) || 1e-6)); sx = VW / 2 + Math.cos(a) * k; sy = VH / 2 + Math.sin(a) * k; }
    else sy -= 40 * Math.max(0.6, zoom) + 30;     // (above the name)
    const p = 0.6 + 0.4 * Math.sin(t / 200);
    cx.fillStyle = C.signal; cx.globalAlpha = p; cx.beginPath(); cx.arc(sx, sy, 11, 0, TAU); cx.fill(); cx.globalAlpha = 1;
    cx.fillStyle = C.void; cx.font = `800 16px "Big Shoulders Display", sans-serif`; cx.fillText("!", sx, sy + 6); cx.font = `700 12px "Atkinson Hyperlegible", system-ui, sans-serif`;
  }
}

// ---- the frame ----
let lastT = performance.now(), lastInp = { x: 0, y: 0, turn: 0 };
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (G && haveMe) {
    const inp = typing() ? { x: 0, y: 0, turn: 0 } : pushInput(); lastInp = inp;
    stepMe(dt, inp);
    if (corr.x || corr.y) { const k = 1 - Math.exp(-dt * 10), dx = corr.x * k, dy = corr.y * k; if (allowedMe(mine.x + dx, mine.y + dy)) { mine.x += dx; mine.y += dy; } corr.x -= dx; corr.y -= dy; if (hyp(corr.x, corr.y) < 0.05) corr.x = corr.y = 0; }
    sendInput(inp, now);
    const me = ships.get(myId); if (me) { me.x = mine.x; me.y = mine.y; me.h = mine.h; }
    // other ships: drawn 120 ms in the past on the server's clock, between the two snapshots around that moment
    const rt = Date.now() - (srvOff || 0) - 120;
    for (const s of ships.values()) {
      if (s.id === myId || !s.near || !s.buf.length) continue;
      const B = s.buf; let i = B.length - 1; while (i > 0 && B[i].t > rt) i--;
      const a = B[i], b = B[i + 1], px = s.x, py = s.y;
      if (b && rt >= a.t) { const k = (rt - a.t) / Math.max(1, b.t - a.t); s.x = a.x + (b.x - a.x) * k; s.y = a.y + (b.y - a.y) * k; let dh = b.h - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); s.h = a.h + dh * k; }
      else { s.x = a.x; s.y = a.y; s.h = a.h; }
      s.spd = (s.spd || 0) * 0.8 + (dt > 0 ? hyp(s.x - px, s.y - py) / dt : 0) * 0.2;
    }
    cam.x += (mine.x - cam.x) * Math.min(1, dt * 8); cam.y += (mine.y - cam.y) * Math.min(1, dt * 8);
  }
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawBackground(now);
  if (G) { drawWorld(now); drawOverlay(now); tutArrow(now); drawMinimap(now); drawHudLive(now); tutTick(); }
  if (countAt) { const left = Math.ceil((countAt - Date.now()) / 1000); if (left <= 0) { countAt = 0; goUpdating(); } else countEl.textContent = "Update incoming — " + left + " s"; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- the HUD: a chip per module (a click switches it), the hold as squares and a bar, fuel, credits, where I am ----
$("refine-pop").addEventListener("click", (e) => { send({ t: "act", op: "refineme" }); e.currentTarget.blur(); });
const hud = { holdRaw: $("hold-raw"), holdRef: $("hold-ref"), holdNum: $("hold-num"), fuel: $("fuel-fill"), fuelNum: $("fuel-num"), mods: $("mods"), cargo: $("cargo"), credits: $("credits"), zone: $("zone") };
const elx = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text !== undefined) d.textContent = text; return d; };
function holdCounts() { let raw = 0, ref = 0; for (const [k, n] of Object.entries(ME.hold || {})) { if (k.endsWith("+")) ref += n * G.ores[k.slice(0, -1)].refinedSpace; else raw += n; } return { raw, ref }; }   // (ref: the room refined units take)
const SWITCHES = { miner: 1, command: 1, refinery: 1 };
let hudKey = "";
function drawHud() {
  if (!G) return;
  const { raw, ref } = holdCounts(), cap = ME.cap || 5, used = raw + ref;
  hud.holdRaw.style.width = (raw / cap) * 100 + "%"; hud.holdRef.style.width = (ref / cap) * 100 + "%";
  hud.holdNum.textContent = (Math.round(used * 10) / 10) + " / " + cap;
  hud.credits.textContent = fmt(ME.credits || 0);
  hud.zone.textContent = (ME.zone || "") + (ME.shard ? " · Shard " + ME.shard : "");
  const key = JSON.stringify([ME.mods, ME.on, ME.units, ME.names, ME.refiner, ME.refineBy]); if (key === hudKey) return; hudKey = key;
  hud.mods.replaceChildren(...(ME.mods || []).map((k) => {
    const sw = !!SWITCHES[k], on = (ME.on || []).includes(k);
    const c = elx("div", "mod-chip" + (sw && on ? " on" : "") + (sw ? "" : " fixed"), G.modules[k].name + (sw ? (on ? " · On" : " · Off") : ""));
    if (sw) c.addEventListener("click", () => send({ t: "mod", k }));
    return c;
  }));
  drawCargo();
  const rp = $("refine-pop"); rp.hidden = !ME.refiner; rp.style.bottom = (hud.cargo.offsetHeight + 34) + "px";   // (above the hold bar and the squares)   // (owner, 2026-10-17) a refinery near me is on
}
// the hold, a square per unit in its ore's color; compressed (refined) units go five to a square, edged white (a part
// stack fills part of its square). Hovering a square: how many of that ore and what they sell for; with Alt held, the
// names on those units.
function drawCargo() {
  const groups = [], byOre = new Map();
  const per = (o) => Math.max(1, Math.round(1 / G.ores[o].refinedSpace));   // (refined units to a square: as many as fit in one unit's room)
  (ME.units || []).forEach(([oi, r, n]) => { const o = ORE_KEYS[oi]; if (!r) groups.push({ o, r: 0, units: [n] }); else { let g = byOre.get(o); if (!g || g.units.length >= per(o)) { g = { o, r: 1, units: [] }; byOre.set(o, g); groups.push(g); } g.units.push(n); } });
  hud.cargo.replaceChildren(...groups.map((g) => {
    const sq = elx("i", g.r ? "ref" : ""), fill = elx("b"); fill.style.background = G.ores[g.o].color; fill.style.top = g.r ? (100 - g.units.length / per(g.o) * 100) + "%" : "0";
    sq.appendChild(fill); sq.addEventListener("mouseenter", (e) => showTip(e, () => cargoTip(g))); sq.addEventListener("mousemove", moveTip); sq.addEventListener("mouseleave", hideTip);
    return sq;
  }));
}
function cargoTip(g) {                         // (owner, 2026-10-17) this square's own worth: one unit, or the compressed units in it
  const price = g.r ? G.ores[g.o].refinedPrice : G.ores[g.o].price;
  let t = oreName(g.o, g.r) + "\n" + fmt(g.units.length * price) + " cr";
  if (altDown) { const ids = new Set(); for (const u of g.units) for (const id of u) ids.add(String(id)); t += "\n" + [...ids].map((id) => (ME.names && ME.names[id]) || names.get(id) || "…").join("\n"); }
  return t;
}
// the tooltip: one at a time, following the pointer; Alt redraws it
const tipEl = $("tip"); let altDown = false, tipFn = null, tipX = 0, tipY = 0;
function placeTip() { tipEl.style.left = Math.min(tipX + 14, innerWidth - tipEl.offsetWidth - 8) + "px"; tipEl.style.top = Math.max(8, tipY - tipEl.offsetHeight - 10) + "px"; }
function showTip(e, fn) { tipFn = fn; tipX = e.clientX; tipY = e.clientY; tipEl.textContent = fn(); tipEl.hidden = false; placeTip(); }
function moveTip(e) { tipX = e.clientX; tipY = e.clientY; placeTip(); }
function hideTip() { tipFn = null; tipEl.hidden = true; }
function refreshTip() { if (tipFn) { tipEl.textContent = tipFn(); placeTip(); } }
function drawHudLive() {
  const f = Math.max(0, ME.fuel), T = ME.tank || 100;
  hud.fuel.style.width = Math.min(100, f / T * 100) + "%"; hud.fuel.classList.toggle("low", f < T * 0.15);
  hud.fuelNum.textContent = Math.round(f) + " / " + T;
}

// ---- the station panel (docked): Storage as a grid of slots (right-click one for what can be done with it), the
// queue, fuel, and the Shop button ----
const stEl = $("station");
let stKey = "";
function drawStation_() {
  stEl.hidden = !ME.docked; if (!ME.docked) { shopEl.hidden = true; amtBox.hidden = true; return; } if (!G) return;
  const key = JSON.stringify([STATION.storage, STATION.queue, ME.credits, Math.round(ME.fuel), ME.tank]); if (key === stKey) return; stKey = key;
  const btn = (label, op, disabled = false, cls = "") => { const b = elx("button", cls, label); b.type = "button"; b.disabled = disabled; b.addEventListener("click", () => { send({ t: "st", ...op }); b.blur(); }); return b; };
  const head = elx("div", "st-head"), shopB = elx("button", "gold", "Shop"); shopB.type = "button"; shopB.addEventListener("click", () => { shopEl.hidden = !shopEl.hidden; drawShop(); });
  head.append(elx("span", "st-title", "Station"), shopB, elx("span", "st-cr", fmt(ME.credits)));
  // storage: a slot per kind (raw, refined, fuel blocks)
  const sec1 = elx("section"); sec1.appendChild(elx("h3", null, "Storage"));
  const S = STATION.storage || {}, keys = Object.keys(S).filter((k) => S[k] > 0).sort((a, b) => (a === "fuel") - (b === "fuel") || ORE_KEYS.indexOf(a.replace("+", "")) - ORE_KEYS.indexOf(b.replace("+", "")) || a.length - b.length);
  const grid = elx("div", "st-grid");
  for (let i = 0; i < Math.max(15, Math.ceil(keys.length / 5) * 5); i++) {
    const k = keys[i], slot = elx("div", "st-slot" + (k ? "" : " empty"));
    if (k) {
      const o = k.replace(/\+$/, ""), ref = k.endsWith("+"), sw = elx("i", ref ? "ref" : ""); sw.style.background = k === "fuel" ? "var(--ice)" : G.ores[o].color; if (k === "fuel") sw.classList.add("fuel");
      slot.append(sw, elx("span", "n", fmt(S[k])));
      slot.addEventListener("contextmenu", (e) => { e.preventDefault(); hideTip(); showMenu(e.clientX, e.clientY, slotActions(k)); });
      slot.addEventListener("mouseenter", (e) => showTip(e, () => storeTip(k))); slot.addEventListener("mousemove", moveTip); slot.addEventListener("mouseleave", hideTip);
    }
    grid.appendChild(slot);
  }
  sec1.appendChild(grid);
  // the queue
  const sec2 = elx("section"); sec2.appendChild(elx("h3", null, "Queue"));
  const Q = STATION.queue || []; if (!Q.length) sec2.appendChild(elx("p", "st-empty", "Idle"));
  Q.forEach((j) => {
    const row = elx("div", "st-row q"), dur = (j.k === "fuel" ? G.fuel.blockTime : G.ores[j.o].refineTime) * 1000;
    row.append(elx("span", "st-name", (j.k === "fuel" ? "Fuel blocks" : oreName(j.o, true))), elx("span", "st-n", fmt(j.left)));
    const bar = elx("span", "st-bar" + (j.k === "fuel" ? " fuel" : "")); const fill = elx("i"); bar.appendChild(fill); fill.dataset.at = j.at; fill.dataset.dur = dur; row.appendChild(bar); sec2.appendChild(row);   // (every job runs at once)
  });
  // fuel
  const sec3 = elx("section"); sec3.appendChild(elx("h3", null, "Fuel"));
  { const space = Math.max(0, ME.tank - ME.fuel), cost = Math.ceil(space) * G.fuel.stationPrice, row = elx("div", "st-row");
    row.append(elx("span", "st-sw fuel"), elx("span", "st-name", "Tank"), elx("span", "st-n", Math.round(ME.fuel) + " / " + ME.tank), btn("Fill " + fmt(Math.ceil(cost)), { op: "fuel" }, space < 1 || ME.credits < G.fuel.stationPrice, "gold"));
    sec3.appendChild(row); }
  stEl.replaceChildren(head, sec1, sec2, sec3);
  if (!shopEl.hidden) drawShop();
}
function slotActions(k) {                      // right-click a storage slot: sell, refine, make fuel (each asks how many), fill the tank
  const n = (STATION.storage || {})[k] || 0;
  if (k === "fuel") return [["Fill tank", () => send({ t: "st", op: "blocks" })]];
  const o = k.replace(/\+$/, ""), ref = k.endsWith("+"), price = ref ? G.ores[o].refinedPrice : G.ores[o].price;
  const items = [["Sell", () => askAmount("Sell " + oreName(o, ref), "Sell", n, (c) => fmt(c * price) + " cr", (c) => ({ op: "sell", k, n: c }))]];
  if (!ref) items.push(["Refine", () => askAmount("Refine " + oreName(o), "Refine", n, (c) => fmt(c * G.ores[o].refinedPrice) + " cr", (c) => ({ op: "refine", o, n: c }))]);
  if (o === "ice" && !ref) items.push(["Make fuel", () => askAmount("Make fuel", "Make fuel", n, (c) => fmt(c * G.fuel.blockFuel) + " fuel", (c) => ({ op: "craft", n: c }))]);
  return items;
}
// how many: a slider from 1 to all of them (starting at all), the amount and what it comes to, the action and Cancel
const amtBox = $("amount-box"), amtRange = $("amount-range"); let amtDo = null, amtWorth = null, amtMax = 1;
function askAmount(title, label, max, worth, make) {
  amtMax = Math.max(1, max); amtWorth = worth; amtDo = make;
  $("amount-title").textContent = title; $("amount-go").textContent = label;
  amtRange.min = 1; amtRange.max = amtMax; amtRange.value = amtMax; amtRange.disabled = amtMax <= 1;
  drawAmount(); amtBox.hidden = false; amtRange.focus();
}
function drawAmount() { const c = +amtRange.value; $("amount-n").textContent = fmt(c) + " / " + fmt(amtMax); $("amount-worth").textContent = amtWorth(c); }
amtRange.addEventListener("input", drawAmount);
$("amount-go").addEventListener("click", () => { if (amtDo) send({ t: "st", ...amtDo(+amtRange.value) }); amtBox.hidden = true; });
$("amount-cancel").addEventListener("click", () => { amtBox.hidden = true; });
amtBox.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") amtBox.hidden = true; if (e.key === "Enter") $("amount-go").click(); });
amtBox.addEventListener("mousedown", (e) => e.stopPropagation());
function storeTip(k) {
  const n = (STATION.storage || {})[k] || 0;
  if (k === "fuel") return "Fuel blocks\n" + fmt(n * G.fuel.blockFuel) + " fuel (" + G.fuel.blockFuel + " each)";
  const o = k.replace(/\+$/, ""), each = k.endsWith("+") ? G.ores[o].refinedPrice : G.ores[o].price;
  return oreName(o, k.endsWith("+")) + "\n" + fmt(n * each) + " (" + fmt(each) + " each)";   // (owner, 2026-10-17: the total, then each)
}
setInterval(() => {                            // the running job's bar (between the server's updates)
  for (const f of stEl.querySelectorAll(".st-bar i[data-at]")) { const at = +f.dataset.at, dur = +f.dataset.dur, srvNow = Date.now() - (srvOff || 0); f.style.width = Math.max(0, Math.min(100, (srvNow - at) / dur * 100)) + "%"; }
}, 250);
stEl.addEventListener("mousedown", (e) => e.stopPropagation());

// ---- the Shop (opened from the station): hulls, then every module with what it does, its price and its numbers; an
// owned module shows its next upgrade's numbers and price, and Equip / Unequip ----
const shopEl = $("shop");
const MOD_INFO = {
  miner: "A heavy mining laser. Switch it on to break asteroids much faster. It burns fuel while it fires.",
  hauler: "A big cargo hold. Ships without one can trade you their cargo to carry home.",
  fueler: "A large fuel tank and a pump. Fuel other ships: the station pays you for every unit pumped.",
  tractor: "A tractor beam. Tow an asteroid behind you to wherever it's wanted. Bigger rocks tow slower and burn more fuel.",
  command: "A mining boost. Switch it on and every ship mining near you mines faster. It burns fuel while on.",
  scanner: "A long-range scanner. Reveal the ore inside an asteroid, for everyone.",
  refinery: "A field refinery. Switch it on and ships near you can have the raw ore in their holds refined: a fifth of the space, worth half again as much. Each use costs fuel.",
};
const STATS = {                                 // label, stat, how it reads (Speed shows only when it isn't 1)
  miner: [["Mining", "laserDps", (v) => v + " / s"], ["Reach", "range", (v) => v + " m"], ["Ore per crack", "yield", (v) => v], ["Fuel", "burn", (v) => v + " / min firing"]],
  hauler: [["Hold", "hold", (v) => v + " units"], ["Trade reach", "tradeRange", (v) => v + " m"]],
  fueler: [["Tank", "tank", (v) => fmt(v)], ["Pump", "pump", (v) => v + " / s"], ["Reach", "range", (v) => v + " m"], ["Pay", "pay", (v) => v + " cr / unit"]],
  tractor: [["Reach", "range", (v) => v + " m"], ["Tow speed", "tow", (v) => "×" + v], ["Largest asteroid", "maxSize", (v) => "size " + v], ["Fuel", "burn", (v) => v + "+ / min towing"]],
  command: [["Mining boost", "boost", (v) => "×" + v], ["Speed boost", "speedBoost", (v) => "×" + v], ["Reach", "radius", (v) => v + " m"], ["Fuel", "burn", (v) => v + " / min on"]],
  scanner: [["Reach", "range", (v) => fmt(v) + " m"], ["Scan time", "scanTime", (v) => v + " s"], ["Fuel", "fuel", (v) => v + " / scan"]],
  refinery: [["Per unit", "unit", (v) => v + " s"], ["Fuel", "activation", (v) => v + " / use"], ["Reach", "range", (v) => v + " m"], ["Ships at once", "targets", (v) => v]],
};
const MK = ["Mk I", "Mk II", "Mk III", "Mk IV"];
let shopKey = "";
function drawShop() {
  if (shopEl.hidden || !G) return;
  const key = JSON.stringify([STATION.modules, ME.mods, ME.upgrades, ME.hull, ME.credits]); if (key === shopKey && shopEl.childElementCount) return; shopKey = key;
  const btn = (label, op, disabled = false, cls = "") => { const b = elx("button", cls, label); b.type = "button"; b.disabled = disabled; b.addEventListener("click", () => { send({ t: "st", ...op }); b.blur(); }); return b; };
  const head = elx("div", "st-head"), close = elx("button", "", "Close"); close.type = "button"; close.addEventListener("click", () => { shopEl.hidden = true; });
  head.append(elx("span", "st-title", "Shop"), close, elx("span", "st-cr", fmt(ME.credits)));
  const list = elx("div", "shop-list");
  // hulls
  const hc = elx("div", "shop-card"), H = G.hulls, cur = H[ME.hull || 0], next = H[(ME.hull || 0) + 1];
  hc.append(elx("div", "shop-name", "Hull · " + cur.name), elx("p", "shop-info", "A bigger hull fits more modules at once."));
  const hs = elx("div", "shop-stats"); hs.append(elx("span", null, "Module slots"), elx("b", null, cur.slots + (next ? "  →  " + next.slots : ""))); hc.appendChild(hs);
  const ha = elx("div", "shop-acts"); if (next) ha.appendChild(btn(next.name + " hull · " + fmt(next.price), { op: "hull" }, ME.credits < next.price, "gold")); else ha.appendChild(elx("span", "st-tag", "Largest")); hc.appendChild(ha);
  list.appendChild(hc);
  // modules
  for (const k of G.kinds) {
    const M = G.modules[k], owned = (STATION.modules || []).includes(k), lv = owned ? lvlOf(k) : 0, nextLv = owned && lv < M.price.length - 1 ? lv + 1 : null, fitted = (ME.mods || []).includes(k);
    const card = elx("div", "shop-card" + (fitted ? " fitted" : ""));
    const nm = elx("div", "shop-name", M.name); if (owned) nm.appendChild(elx("span", "st-lv", "  " + MK[lv])); card.append(nm, elx("p", "shop-info", MOD_INFO[k]));
    const st = elx("div", "shop-stats");
    const rows = [...STATS[k]]; if (G.modules[k].speed && G.modules[k].speed.some((v) => v !== 1)) rows.push(["Ship speed", "speed", (v) => "×" + v]);
    for (const [label, stat, f] of rows) { if (G.modules[k][stat] === undefined) continue; const v = mval(k, stat, lv), nv = nextLv !== null ? mval(k, stat, nextLv) : null; st.append(elx("span", null, label), elx("b", null, f(v) + (nv !== null && nv !== v ? "  →  " + f(nv) : ""))); }
    card.appendChild(st);
    const acts = elx("div", "shop-acts");
    if (!owned) acts.appendChild(btn("Buy · " + fmt(M.price[0]), { op: "buy", m: k }, ME.credits < M.price[0], "gold"));
    else {
      if (nextLv !== null) { const cost = M.price[nextLv]; acts.appendChild(btn("Upgrade to " + MK[nextLv] + " · " + fmt(cost), { op: "upgrade", m: k }, ME.credits < cost, "gold")); }
      else acts.appendChild(elx("span", "st-tag", MK[lv]));
      if (fitted) { if ((ME.mods || []).length > 1) acts.appendChild(btn("Unequip", { op: "unequip", m: k })); else acts.appendChild(elx("span", "st-tag", "Equipped")); }
      else acts.appendChild(btn("Equip", { op: "equip", m: k }, (ME.mods || []).length >= (ME.slots || 1) && (ME.slots || 1) > 1));
    }
    card.appendChild(acts); list.appendChild(card);
  }
  const top = shopEl.querySelector(".shop-list") ? shopEl.querySelector(".shop-list").scrollTop : 0;
  shopEl.replaceChildren(head, list); list.scrollTop = top;
}
shopEl.addEventListener("mousedown", (e) => e.stopPropagation());

// ---- my party and corporation, top left ----
const partyEl = $("party");
function drawParty() {
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text !== undefined) d.textContent = text; return d; };
  const out = [];
  if (SOC.corp) out.push(el("div", "pt-corp", SOC.corp));
  if (SOC.party) {
    const box = el("div", "pt-list"); box.appendChild(el("div", "pt-head", "Party"));
    for (const [id, n] of SOC.party.members) {
      const r = el("div", "pt-mem" + (id === SOC.party.leader ? " lead" : ""), n); box.appendChild(r);
      if (id !== myId) r.addEventListener("contextmenu", (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, [["Whisper", () => whisperTo(id, n)], ...socialItems(id)]); });
    }
    out.push(box);
  }
  partyEl.replaceChildren(...out); partyEl.hidden = !out.length;
}

// ---- the minimap: the whole ring system, north up; the open sectors, the station, my ship, ships near me, distress ----
const mm = $("minimap"), mx = mm.getContext("2d");
let mmZoom = 1; try { const z = +localStorage.getItem("atamus.mmZoom"); if (z >= 1 && z <= 12) mmZoom = z; } catch {}
mm.addEventListener("wheel", (e) => { e.preventDefault(); e.stopPropagation(); mmZoom = Math.min(12, Math.max(1, mmZoom * (e.deltaY > 0 ? 0.8 : 1.25))); try { localStorage.setItem("atamus.mmZoom", String(mmZoom)); } catch {} }, { passive: false });
let mmNext = 0, mmView = null;
// (owner, 2026-10-16) hovering the minimap names the zone under the pointer
function zoneAt(x, y) {
  const W = G.world, r = hyp(x, y); if (r < W.safeR) return "Station"; if (r > W.lockedR) return "";
  return "Ring " + (r < (W.rings[0][1] + W.rings[1][0]) / 2 ? 1 : 2) + " · " + G.sectorNames[G.sectors[sectorOf(x, y)]];
}
mm.addEventListener("mousemove", (e) => {
  if (!mmView || !G) return; const b = mm.getBoundingClientRect(), x = mmView.ox + (e.clientX - b.left - mmView.cx) / mmView.k, y = mmView.oy + (e.clientY - b.top - mmView.cy) / mmView.k, z = zoneAt(x, y);
  if (!z) { hideTip(); return; } if (tipEl.hidden || tipFn === null) showTip(e, () => zoneAt(x, y)); else { tipFn = () => z; refreshTip(); moveTip(e); }
});
mm.addEventListener("mouseleave", hideTip);
function drawMinimap(now) {
  if (now < mmNext) return; mmNext = now + 100;
  const d = Math.min(devicePixelRatio || 1, 2), Wd = mm.clientWidth, Hd = mm.clientHeight;
  if (mm.width !== Math.round(Wd * d)) { mm.width = Math.round(Wd * d); mm.height = Math.round(Hd * d); }
  mx.setTransform(d, 0, 0, d, 0, 0); mx.clearRect(0, 0, Wd, Hd);
  const W = G.world, R = Wd / 2 - 4, k = R / W.lockedR * mmZoom, ox = mmZoom > 1.01 ? mine.x : 0, oy = mmZoom > 1.01 ? mine.y : 0;
  const P = (x, y) => [Wd / 2 + (x - ox) * k, Hd / 2 + (y - oy) * k]; mmView = { k, ox, oy, cx: Wd / 2, cy: Hd / 2 };
  mx.save(); mx.beginPath(); mx.arc(Wd / 2, Hd / 2, R + 3, 0, TAU); mx.fillStyle = "rgba(11,14,21,0.88)"; mx.fill(); mx.clip();
  const [c0, c1] = P(0, 0);
  for (const [a, b] of W.rings) { mx.strokeStyle = "rgba(216,176,106,0.18)"; mx.lineWidth = (b - a) * k; mx.beginPath(); mx.arc(c0, c1, (a + b) / 2 * k, 0, TAU); mx.stroke(); }
  for (let i = 0; i < 4; i++) if (sectors[i] !== 1) { const s0 = -Math.PI / 2 + i * Math.PI / 2 - Math.PI / 4; mx.fillStyle = sectors[i] === 2 ? "rgba(229,96,79,0.12)" : "rgba(0,0,0,0.55)"; mx.beginPath(); mx.arc(c0, c1, W.lockedR * k, s0, s0 + Math.PI / 2); mx.arc(c0, c1, W.safeR * k, s0 + Math.PI / 2, s0, true); mx.closePath(); mx.fill(); }
  mx.strokeStyle = C.signal; mx.lineWidth = 1; mx.setLineDash([4, 3]); mx.beginPath(); mx.arc(c0, c1, W.lockedR * k, 0, TAU); mx.stroke(); mx.setLineDash([]);
  mx.fillStyle = "#cfa15a"; mx.beginPath(); mx.arc(c0, c1, Math.max(3, W.saturnR * k), 0, TAU); mx.fill();
  { const [sx, sy] = P(W.station[0], W.station[1]); mx.fillStyle = C.gold; mx.fillRect(sx - 2.5, sy - 2.5, 5, 5); }
  const party = new Set(SOC.party ? SOC.party.members.map((m) => m[0]) : []);
  for (const s of ships.values()) if (s.id !== myId && s.near) { const [x, y] = P(s.x, s.y); mx.fillStyle = party.has(s.id) ? C.gold : C.ink; mx.beginPath(); mx.arc(x, y, 2, 0, TAU); mx.fill(); }
  for (const [, x, y, k] of mates) { const [px, py] = P(x, y); mx.fillStyle = k & 1 ? C.gold : C.ice; mx.strokeStyle = C.void; mx.lineWidth = 1; mx.beginPath(); mx.arc(px, py, 3, 0, TAU); mx.fill(); mx.stroke(); }   // (my party gold, my corporation blue, anywhere)
  for (const [id, x, y] of sosList) { const [px, py] = P(x, y); mx.fillStyle = C.signal; mx.beginPath(); mx.arc(px, py, 4 + Math.sin(now / 200), 0, TAU); mx.fill(); void id; }
  { const [x, y] = P(mine.x, mine.y), h = mine.h; mx.fillStyle = C.ice; mx.beginPath(); mx.moveTo(x + Math.sin(h) * 6, y - Math.cos(h) * 6); mx.lineTo(x - Math.cos(h) * 3.5 - Math.sin(h) * 3, y - Math.sin(h) * 3.5 + Math.cos(h) * 3); mx.lineTo(x + Math.cos(h) * 3.5 - Math.sin(h) * 3, y + Math.sin(h) * 3.5 + Math.cos(h) * 3); mx.closePath(); mx.fill(); }
  mx.restore();
  mx.strokeStyle = C.rule; mx.lineWidth = 1.5; mx.beginPath(); mx.arc(Wd / 2, Hd / 2, R + 3, 0, TAU); mx.stroke();
  mx.font = `800 11px "Big Shoulders Display", sans-serif`; mx.textAlign = "center"; mx.fillStyle = C.dim;
  [["N", 0, -1], ["E", 1, 0], ["S", 0, 1], ["W", -1, 0]].forEach(([l, a, b], i) => { mx.fillStyle = sectors[i] === 1 ? C.ink : sectors[i] === 2 ? C.signal : C.rule; mx.fillText(l, Wd / 2 + a * (R - 8), Hd / 2 + b * (R - 8) + 4); });
}

// ---- deploy countdown (a live push warns everyone ahead) ----
let countAt = 0, countParts = ["server", "web"], countHead = "";
function startCountdown(at, parts, head) { countAt = at; if (parts && parts.length) countParts = parts; if (typeof head === "string" && /^[0-9a-f]{7,40}$/.test(head)) countHead = head; countEl.hidden = false; }
function goUpdating(parts) {
  closedForGood = true; try { ws && ws.close(); } catch {}
  const q = new URLSearchParams({ updating: "1", parts: (parts || countParts).join(",") });
  if (WEB_BUILD && WEB_BUILD !== "__" + "BUILD__") q.set("web", WEB_BUILD);
  if (srvBuild) q.set("srv", srvBuild); if (countHead) q.set("to", countHead);
  location.href = "play.html?" + q.toString();
}

// ---- chat, bottom right: tabs on top (which lines show), the lines, the input with "[Channel] Name:"; TAB while typing
// switches the channel (World -> Zone -> Party -> Corporation -> Whisper). Commands: /w Name message, /party invite Name,
// /party accept, /party leave, /corp create Name, /corp invite Name, /corp accept, /corp leave. Right-click a name: Whisper,
// Invite to party, Invite to corporation, Report, and for staff Admin. ----
const chatLog = $("chat-log"), chatIn = $("chat-in"), chatTabs = $("chat-tabs"), chatPre = $("chat-pre"), ctxMenu = $("ctx-menu");
const TABS = [["all", "All"], ["global", "World"], ["zone", "Zone"], ["party", "Party"], ["corp", "Corp"], ["whisper", "Whisper"]];
const CH_NAME = { global: "World", zone: "Zone", party: "Party", corp: "Corp", whisper: "Whisper" };
const lines = [], unread = new Set(); let chatTab = "all", chatCh = "global", lastWhisper = null;
const shows = (tab, m) => tab === "all" || (m.sys && !m.ch) || m.ch === tab;
function drawPrefix() { if (!chatPre) return; chatPre.className = "chat-ch " + chatCh; chatPre.textContent = "[" + (chatCh === "whisper" ? "Whisper " + (lastWhisper ? lastWhisper.name : "") : CH_NAME[chatCh]) + "] " + (myName || "") + ":"; }
function drawTabs() {
  chatTabs.replaceChildren(...TABS.map(([k, label]) => { const b = document.createElement("button"); b.type = "button"; b.className = (k === chatTab ? "on" : "") + (unread.has(k) ? " new" : ""); b.textContent = label; b.addEventListener("click", () => selectTab(k)); return b; }));
}
function lineEl(m) {
  const line = document.createElement("div"); line.className = "chat-line";
  if (m.sys) { line.classList.add("sys"); line.textContent = m.text; return line; }
  const tag = document.createElement("span"); tag.className = "chat-ch " + m.ch;
  tag.textContent = m.ch === "whisper" ? (m.i === myId ? "[To " + (m.withName || "?") + "] " : "[Whisper] ") : "[" + CH_NAME[m.ch] + "] ";
  const badge = m.r === "m" || m.r === "a" ? document.createElement("span") : null;
  if (badge) { badge.className = "chat-badge " + (m.r === "m" ? "mod" : "adm"); badge.textContent = m.r === "m" ? "m" : "A"; badge.title = m.r === "m" ? "Moderator" : "Admin"; }
  const who = document.createElement("span"); who.className = "chat-who"; who.textContent = m.n + ": "; if (m.i && m.i !== myId) { who.dataset.id = m.i; who.dataset.name = m.n; }
  const txt = document.createElement("span"); txt.textContent = m.text;
  line.append(tag, ...(badge ? [badge] : []), who, txt); return line;
}
function drawLog() { chatLog.replaceChildren(...lines.filter((m) => shows(chatTab, m)).map(lineEl)); chatLog.scrollTop = chatLog.scrollHeight; }
function selectTab(k) { chatTab = k; unread.delete(k); if (k !== "all" && (k !== "whisper" || lastWhisper)) chatCh = k; drawTabs(); drawLog(); drawPrefix(); }
function cycleChannel() { const chans = ["global", "zone", ...(SOC.party ? ["party"] : []), ...(SOC.corp ? ["corp"] : []), ...(lastWhisper ? ["whisper"] : [])]; chatCh = chans[(chans.indexOf(chatCh) + 1) % chans.length]; drawPrefix(); }
function openChat() { keys.clear(); firing = false; chatIn.focus(); drawPrefix(); }
function sendChat() {
  const raw = chatIn.value; chatIn.value = ""; chatIn.blur(); const text = raw.trim(); if (!text) return;
  const w = /^\/(?:w|whisper)\s+(?:"([^"]+)"|(\S+))\s+([\s\S]+)$/i.exec(text); if (w) { send({ t: "chat", ch: "whisper", toName: w[1] || w[2], text: w[3] }); return; }
  const p = /^\/(party|corp)\s+(\w+)\s*(.*)$/i.exec(text); if (p) { const op = p[2].toLowerCase(), arg = p[3].trim(); send({ t: p[1].toLowerCase(), op, ...(arg ? { name: arg } : {}) }); return; }
  const inv = /^\/invite\s+(.+)$/i.exec(text); if (inv) { send({ t: "party", op: "invite", name: inv[1].trim() }); return; }
  if (chatCh === "whisper") { if (lastWhisper) send({ t: "chat", ch: "whisper", to: lastWhisper.id, text: raw }); } else send({ t: "chat", ch: chatCh, text: raw });
}
$("chat-form").addEventListener("submit", (e) => { e.preventDefault(); sendChat(); });
chatIn.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { chatIn.value = ""; chatIn.blur(); }
  else if (e.key === "Tab") { e.preventDefault(); cycleChannel(); }
  else if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); sendChat(); }
  e.stopPropagation();
});
function addChat(m) {
  if (m.ch === "sys") m = { sys: 1, text: m.text };
  if (m.ch === "whisper") { if (m.sys) m = { sys: 1, text: (m.withName || "They") + " is offline." }; else { lastWhisper = { id: String(m.with), name: m.withName || "?" }; if (m.i === myId) chatCh = "whisper"; drawPrefix(); } }
  lines.push(m); if (lines.length > 200) lines.shift();
  if (shows(chatTab, m)) { chatLog.appendChild(lineEl(m)); while (chatLog.children.length > 200) chatLog.firstChild.remove(); chatLog.scrollTop = chatLog.scrollHeight; }
  if (m.ch && m.i !== myId && chatTab !== "all") for (const [k] of TABS) if (k !== chatTab && k !== "all" && shows(k, m)) unread.add(k);
  drawTabs();
}
drawTabs();
function hideMenu() { ctxMenu.hidden = true; }
function showMenu(x, y, items) {               // items: [label, fn]
  ctxMenu.replaceChildren(...items.map(([label, fn]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.addEventListener("click", () => { hideMenu(); fn(); }); return b; }));
  ctxMenu.hidden = false; ctxMenu.style.left = Math.min(x, innerWidth - 180) + "px"; ctxMenu.style.top = Math.min(y, innerHeight - ctxMenu.offsetHeight - 8) + "px";
}
const whisperTo = (id, name) => { lastWhisper = { id, name }; chatCh = "whisper"; openChat(); };
// a name in chat: Whisper, Invite to party, Invite to corporation, Report (and Admin for staff)
chatLog.addEventListener("contextmenu", (e) => {
  e.preventDefault(); const who = e.target.closest && e.target.closest(".chat-who[data-id]"); if (!who) return;
  const id = who.dataset.id, name = who.dataset.name;
  showMenu(e.clientX, e.clientY, [["Whisper", () => whisperTo(id, name)], ...socialItems(id), ["Report", () => openReport(id, name)],
    ...(amStaff && window.AdminPanel ? [["Admin", () => window.AdminPanel.act(id, name)]] : [])]);
});
// (owner, 2026-10-17) invite to (or, for the leader / owner, remove from) my party and corporation
function socialItems(id) {
  const inParty = !!(SOC.party && SOC.party.members.some((m) => m[0] === id)), mate = mates.find((m) => m[0] === id), inCorp = !!(mate && mate[3] & 2), out = [];
  if (!inParty) out.push(["Invite to party", () => send({ t: "party", op: "invite", to: id })]);
  else if (SOC.party.leader === myId) out.push(["Kick from party", () => send({ t: "party", op: "kick", to: id })]);
  if (SOC.corp && !inCorp) out.push(["Invite to corporation", () => send({ t: "corp", op: "invite", to: id })]);
  else if (SOC.corp && inCorp && SOC.corpOwner) out.push(["Kick from corporation", () => send({ t: "corp", op: "kick", to: id })]);
  return out;
}
// (owner, 2026-10-16) another ship: Whisper, party and corporation, then what my modules can do for it: fuel it, or
// (without a hauler, to a hauler) ask it to take my cargo
function shipMenu(s, x, y) {
  const id = s.id, name = names.get(id) || "?", r = s.row, theirs = r[14] || 0, items = [["Whisper", () => whisperTo(id, name)], ...socialItems(id)];
  if (ME.mods.includes("fueler")) items.push([ME.pump === id ? "Stop fueling" : "Fuel ship", () => send({ t: "act", ship: id, op: "fuel" })]);
  if (!ME.mods.includes("hauler") && theirs & kindBit("hauler")) items.push(["Request trade", () => send({ t: "act", ship: id, op: "trade" })]);
  showMenu(x, y, items);
}
// (owner, 2026-10-17) Accept / Decline prompts, one at a time, top center: a ship asking this hauler to take its cargo,
// party and corporation invites; each lapses on its own
const tradeBox = $("trade-box"), prompts = [];
function pushPrompt(text, yes, no, secs) { prompts.push({ text, yes, no, until: Date.now() + secs * 1000 }); drawPrompt(); }
function drawPrompt() {
  while (prompts.length && prompts[0].until < Date.now()) prompts.shift();
  const p = prompts[0]; tradeBox.hidden = !p; if (p) $("trade-text").textContent = p.text;
}
setInterval(drawPrompt, 1000);
function answerPrompt(yes) { const p = prompts.shift(); if (p) (yes ? p.yes : p.no)(); drawPrompt(); }
$("trade-yes").addEventListener("click", () => answerPrompt(true)); $("trade-no").addEventListener("click", () => answerPrompt(false));
function showTrade(m) { pushPrompt((m.name || "?") + " · " + m.n + (m.n === 1 ? " unit" : " units"), () => send({ t: "tradeans", from: m.from, yes: true }), () => send({ t: "tradeans", from: m.from, yes: false }), (G && G.econ.tradeWait) || 30); }
function showInvite(m) {
  if (m.kind === "party") pushPrompt((m.name || "?") + " invited you to a party", () => send({ t: "party", op: "accept" }), () => send({ t: "party", op: "decline" }), G.econ.partyInvite);
  else pushPrompt((m.name || "?") + " invited you to " + (m.corp || "a corporation"), () => send({ t: "corp", op: "accept" }), () => send({ t: "corp", op: "decline" }), G.econ.corpInvite);
}
addEventListener("pointerdown", (e) => { if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) hideMenu(); }, true);
const reportBox = $("report-box"); let reportFor = null;
function openReport(id, name) { reportFor = id; $("report-title").textContent = "Report " + name; $("report-text").value = ""; reportBox.hidden = false; keys.clear(); $("report-text").focus(); }
$("report-text").addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") reportBox.hidden = true; });
$("report-cancel").addEventListener("click", () => { reportBox.hidden = true; });
$("report-send").addEventListener("click", () => { const text = $("report-text").value.trim(); if (!text || !reportFor) return; send({ t: "report", i: reportFor, text }); reportBox.hidden = true; });

// ---- (owner, 2026-10-17) the developer panel (head admin and admins): every number of the ship, hulls, modules per
// level, asteroids per ore and per ring, fuel, the economy and limits, changed live for everyone; the server keeps them ----
const devEl = $("dev"); let devTab = "hulls", devArmed = 0;
const DEV_TABS = [["world", "World"], ["hulls", "Hulls"], ["modules", "Modules"], ["asteroids", "Asteroids"], ["economy", "Economy"]];
let devHull = 0; const devLv = {};             // (owner, 2026-10-17) the hull and each module's level being edited
const DEV_LABELS = { hold: "Hold", tank: "Tank", speed: "Speed (× for modules)", accel: "Acceleration", brake: "Braking", turn: "Turn rate", crawl: "Crawl share", flyBurn: "Fuel / min flying", laserDps: "Laser damage / s",
  interactR: "Reach", vision: "Vision", shipR: "Bump radius", price: "Price", slots: "Slots", laserDps: "Mining / s", yield: "Ore per crack", pay: "Pay / unit", fuel: "Fuel / scan", burn: "Fuel / min", pump: "Pump / s", boost: "Boost", radius: "Reach", range: "Reach", tow: "Tow speed", unit: "Seconds / unit",
  activation: "Fuel / use", sizeBurn: "Fuel × per size", pull: "Pull / s", leash: "Leash gap", dropGap: "Ore drop gap", dropSpread: "Ore drop spread", radiusBase: "Radius base", radiusPer: "Radius per size", crackHpBase: "Crack health base", crackHpPer: "Crack health per size", towBase: "Tow share base", towPer: "Tow share per size",
  respawn: "Respawn s", despawn: "Despawn s", reseed: "Reseed s", stationPrice: "Station fuel price", pumpPay: "Pay / unit pumped", blockFuel: "Fuel per block", blockTime: "Seconds per block",
  refinedPrice: "Refined price", refinedSpace: "Refined space", refineTime: "Station refine s", hardness: "Hardness (crack health ×)", startCredits: "Starting credits", startFuel: "Starting fuel", dockR: "Docking radius", tradeWait: "Trade answer s", offlineGrace: "Offline grace s",
  despawnOre: "Loose ore despawn s", shardCap: "Players per shard", partyMax: "Party size" };
Object.assign(DEV_LABELS, { speedBoost: "Ship speed boost ×", maxSize: "Largest asteroid", scanTime: "Seconds a scan", targets: "Ships at once", tradeRange: "Trade reach", partyInvite: "Party invite s", corpInvite: "Corp invite s" });
const devLabel = (k) => DEV_LABELS[k] || k;
// (owner, 2026-10-17) what each number does, shown in a wrapped window over its name
const DEV_HELP = {
  "hull.price": "Credits to buy this hull at the station (the Basic hull is the one everyone starts with).", "hull.slots": "How many modules a ship with this hull can fit at once (1 to 4).",
  "hull.hold": "Cargo units the hold carries without a Hauler module (a Hauler replaces it with its own hold).", "hull.tank": "Fuel the tank holds without a Fueler module (a Fueler replaces it with its own tank).",
  "hull.speed": "Top speed in m/s at full thrust (modules' speed factors and command boosts multiply it).", "hull.accel": "How fast the ship speeds up while thrusting, in m/s each second.",
  "hull.brake": "How fast the ship slows down when no key is held, in m/s each second.", "hull.turn": "How fast the ship turns with A and D, in radians a second (about 57° each).",
  "hull.crawl": "With an empty tank the ship still moves at this share of its speed and thrust (0.2 = a fifth).", "hull.flyBurn": "Fuel used a minute while thrusting at full power (less when thrusting part way).",
  "hull.laserDps": "Crack damage a second from the free laser every ship has (a switched-on Miner replaces it).", "hull.interactR": "Reach in meters for the free laser, clicking ore to claim it and asking a hauler to trade. Shown as the dotted circle.",
  "hull.vision": "How far the ship sees, in meters: ships, asteroids and ore beyond it aren't sent or shown (the fog of war). A fitted scanner's reach extends it when longer.",
  "hull.shipR": "The ship's size for bumping into asteroids, in meters.",
  "module.price": "Level I: credits to buy the module. Levels II to IV: credits to upgrade to that level.", "module.speed": "The ship's top speed is multiplied by this while the module is fitted (1 = no change, 0.8 = 20% slower).",
  "miner.laserDps": "Crack damage a second while the Miner is switched on and firing.", "miner.burn": "Fuel used a minute while the switched-on Miner is firing.",
  "miner.range": "How far the Miner's laser reaches, in meters.", "miner.yield": "Ore units each broken crack drops when this Miner helped break it (the best Miner on the asteroid counts).",
  "hauler.hold": "Cargo units the Hauler's hold carries.", "hauler.tradeRange": "How near, in meters, another ship must be to trade its cargo into this Hauler.",
  "fueler.tank": "Fuel the Fueler's tank holds.", "fueler.pump": "Fuel pumped into another ship each second.", "fueler.range": "How far, in meters, the Fueler can reach a ship to fuel it.", "fueler.pay": "Credits the world pays the Fueler for each unit of fuel pumped.",
  "command.boost": "Ships mining within reach mine this many times faster (several command ships don't stack: the strongest counts).", "command.speedBoost": "Ships within reach fly this many times faster (1 = no speed boost; the strongest counts).",
  "command.radius": "How far the boosts reach, in meters (the rotating ring).", "command.burn": "Fuel used a minute while the Command module is switched on.",
  "tractor.range": "How far, in meters, the tractor can latch onto an asteroid.", "tractor.tow": "Towing speed multiplier on top of the asteroid's size slowdown.",
  "tractor.burn": "Fuel used a minute while towing (before the size cost).", "tractor.sizeBurn": "Extra towing fuel for each asteroid size: the fuel a minute is multiplied by 1 + size × this.",
  "tractor.pull": "How quickly the asteroid catches up to its place behind the ship (higher: a stiffer leash).", "tractor.leash": "Gap in meters between the claws and the towed asteroid.",
  "tractor.maxSize": "The largest asteroid size (1 to 15) this tractor can latch onto.",
  "scanner.range": "How far, in meters, the Scanner reaches an asteroid.", "scanner.scanTime": "Seconds a scan takes; the asteroid must stay in reach until it's done.", "scanner.fuel": "Fuel each finished scan uses.",
  "refinery.unit": "Seconds to refine one unit in a ship's hold.", "refinery.activation": "Fuel the refinery uses each time a ship takes up its Refine ores offer.",
  "refinery.range": "How far, in meters, ships can be to get the Refine ores offer.", "refinery.targets": "How many ships the refinery can work on at the same time.",
  "ore.price": "Credits for one raw unit at the station.", "ore.refinedPrice": "Credits for one refined unit at the station.", "ore.refineTime": "Seconds the station takes to refine one unit (free, keeps going offline).",
  "ore.refinedSpace": "Hold room one refined unit takes (0.2: five refined units fill the room of one raw unit).", "ore.hardness": "Crack health multiplier for asteroids of this ore (2 = twice as long to mine).",
  "ringSizes": "Smallest and largest asteroid size in this ring (a size's number is also its crack count). Smaller sizes are more common.", "ringSlots": "Asteroids rolled per 400 m cell in this ring (0 to 3).",
  "ringOres": "How likely an asteroid in this ring is this ore, against the other weights (0 = never; set all but one to 0 for a ring of one ore).",
  "rock.dropGap": "Meters past the asteroid's edge a broken crack's ore lands.", "rock.dropSpread": "Extra random distance, up to this many meters, on top of the drop gap.",
  "rock.radiusBase": "Asteroid radius in meters before size (radius = base + size × per size).", "rock.radiusPer": "Meters of radius each asteroid size adds.",
  "rock.crackHpBase": "Crack health before size (health = base + size × per size, × the ore's hardness).", "rock.crackHpPer": "Crack health each asteroid size adds.",
  "rock.towBase": "Towing speed share for a size 1 asteroid (each size up takes away the per size amount).", "rock.towPer": "Towing speed share lost for each asteroid size above 1.",
  "rock.respawn": "Seconds before a mined-out asteroid's slot rolls a new asteroid.", "rock.despawn": "Seconds an asteroid someone worked on is left alone before it's gone.", "rock.reseed": "Seconds between reshuffles of the whole asteroid field.",
  "econ.startCredits": "Credits a new player starts with.", "econ.startFuel": "Fuel a new player starts with.", "econ.dockR": "How close to the station, in meters, a ship is docked (delivers its hold, opens the station).",
  "econ.tradeWait": "Seconds a hauler has to accept a trade request.", "econ.partyInvite": "Seconds a party invite waits for an answer.", "econ.corpInvite": "Seconds a corporation invite waits for an answer.",
  "econ.offlineGrace": "Seconds after logging off before a carrier's ore crawls home to the station.", "econ.despawnOre": "Seconds loose ore lies untouched before it's gone.",
  "fuel.stationPrice": "Credits for one unit of fuel bought at the station.", "fuel.blockFuel": "Fuel in one fuel block (made from one ice).", "fuel.blockTime": "Seconds the station takes to make one fuel block.",
  "limits.shardCap": "Players in one zone before newcomers go to another copy of it.", "limits.partyMax": "Most players in a party.",
};
Object.assign(DEV_HELP, {
  "world.saturnR": "Saturn's radius in meters: nothing flies inside it.", "world.safeR": "Radius of the open zone around Saturn and the station, where no ring or sector applies.",
  "world.rings": "The ring's inner and outer radius in meters. Asteroids only exist between them; changing this rebuilds the untouched ones.",
  "world.lockedR": "The red dashed line's radius: nobody flies past it.", "world.loadR": "How far around each player, in meters, the server sends ships, asteroids and ore.",
  "world.cell": "The asteroid grid's cell size in meters (each cell rolls its own asteroids from the seed); changing it rebuilds the untouched field.",
});
function devHelp(path) {
  const [root, a, b] = path;
  if (root === "world") return DEV_HELP["world." + a];
  if (root === "hulls") return DEV_HELP["hull." + b];
  if (root === "modules") return DEV_HELP[a + "." + b] || DEV_HELP["module." + b];
  if (root === "ores") return DEV_HELP["ore." + b];
  if (root === "ringSizes" || root === "ringSlots" || root === "ringOres") return DEV_HELP[root];
  return DEV_HELP[root + "." + a];
}
const devGet = (path) => path.reduce((o, k) => (o == null ? o : o[k]), G);
function devInput(path) {
  const i = document.createElement("input"); i.type = "number"; i.step = "any"; i.dataset.path = JSON.stringify(path); i.value = devGet(path);
  i.addEventListener("change", () => { const v = Number(i.value); if (Number.isFinite(v)) send({ t: "tune", path, value: v }); });
  i.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") i.blur(); });
  return i;
}
function devRow(label, ...inputs) {
  const r = elx("div", "dev-row"), l = elx("span", "dev-l", label); r.append(l, ...inputs);
  const help = inputs[0] && inputs[0].dataset.path && devHelp(JSON.parse(inputs[0].dataset.path));
  if (help) { l.classList.add("has-help"); l.addEventListener("mouseenter", (e) => { tipEl.classList.add("wrap"); showTip(e, () => help); }); l.addEventListener("mousemove", moveTip); l.addEventListener("mouseleave", () => { hideTip(); tipEl.classList.remove("wrap"); }); }
  return r;
}
function devGroup(title, rows) { const g = elx("div", "dev-group"); g.append(elx("div", "dev-h", title), ...rows); return g; }
function devNumbers(root, keys) { return keys.filter((k) => typeof devGet([root, k]) === "number").map((k) => devRow(devLabel(k), devInput([root, k]))); }
function devDraw() {
  if (devEl.hidden || !G) return;
  const head = elx("div", "st-head"), reset = elx("button", "", devArmed ? "Sure?" : "Reset all"), close = elx("button", "", "Close");
  reset.type = close.type = "button";
  reset.addEventListener("click", () => { if (!devArmed) { devArmed = 1; devDraw(); setTimeout(() => { devArmed = 0; devDraw(); }, 3000); } else { devArmed = 0; send({ t: "tune", reset: true }); } });
  close.addEventListener("click", () => { devEl.hidden = true; $("dev-btn").classList.remove("on"); });
  head.append(elx("span", "st-title", "Developer"), reset, close);
  const tabs = elx("div", "dev-tabs");
  for (const [k, label] of DEV_TABS) { const b = elx("button", k === devTab ? "on" : "", label); b.type = "button"; b.addEventListener("click", () => { devTab = k; devDraw(); }); tabs.appendChild(b); }
  const body = elx("div", "dev-body"), out = [];
  if (devTab === "world") {
    out.push(devGroup("The map", [
      devRow("Saturn radius", devInput(["world", "saturnR"])), devRow("Safe zone radius", devInput(["world", "safeR"])),
      devRow("Ring 1 (inner · outer)", devInput(["world", "rings", 0, 0]), devInput(["world", "rings", 0, 1])),
      devRow("Ring 2 (inner · outer)", devInput(["world", "rings", 1, 0]), devInput(["world", "rings", 1, 1])),
      devRow("Locked line radius", devInput(["world", "lockedR"])), devRow("Load circle", devInput(["world", "loadR"])), devRow("Asteroid cell", devInput(["world", "cell"])),
    ]));
  } else if (devTab === "hulls") {                    // a hull at a time: every number it flies with
    const pick = elx("div", "dev-pick"); G.hulls.forEach((h, i) => { const b = elx("button", i === devHull ? "on" : "", h.name); b.type = "button"; b.addEventListener("click", () => { devHull = i; devDraw(); }); pick.appendChild(b); });
    const H = G.hulls[devHull], rows = Object.keys(H).filter((k) => typeof H[k] === "number").map((k) => devRow(devLabel(k), devInput(["hulls", devHull, k])));
    const g = devGroup(H.name + " hull", rows); g.insertBefore(pick, g.children[1]); out.push(g);
  } else if (devTab === "modules") {           // a module at a time per level (Mk I-IV): a row per number
    for (const k of G.kinds) {
      const M = G.modules[k], lv = devLv[k] || 0, pick = elx("div", "dev-pick lv");
      ["I", "II", "III", "IV"].forEach((n, i) => { const b = elx("button", i === lv ? "on" : "", n); b.type = "button"; b.addEventListener("click", () => { devLv[k] = i; devDraw(); }); pick.appendChild(b); });
      const rows = [];
      for (const [stat, v] of Object.entries(M)) {
        if (Array.isArray(v)) rows.push(devRow(devLabel(stat), devInput(["modules", k, stat, Math.min(lv, v.length - 1)])));
        else if (typeof v === "number") rows.push(devRow(devLabel(stat), devInput(["modules", k, stat])));
      }
      const g = devGroup(M.name, rows), h = g.firstChild; h.classList.add("with-pick"); h.appendChild(pick); out.push(g);
    }
  } else if (devTab === "asteroids") {
    for (const o of Object.keys(G.ores)) { const O = G.ores[o]; out.push(devGroup(O.name, Object.keys(O).filter((k) => typeof O[k] === "number").map((k) => devRow(devLabel(k), devInput(["ores", o, k]))))); }
    G.ringSizes.forEach((sz, i) => {
      const rows = [devRow("Sizes (min · max)", devInput(["ringSizes", i, 0]), devInput(["ringSizes", i, 1])), devRow("Asteroids per cell", devInput(["ringSlots", i]))];
      for (const o of Object.keys(G.ringOres[i])) rows.push(devRow(G.ores[o].name + " weight", devInput(["ringOres", i, o])));
      out.push(devGroup("Ring " + (i + 1), rows));
    });
    out.push(devGroup("Asteroids", devNumbers("rock", Object.keys(G.rock))));
  } else {
    out.push(devGroup("Economy", devNumbers("econ", Object.keys(G.econ))), devGroup("Fuel", devNumbers("fuel", Object.keys(G.fuel))), devGroup("Limits", devNumbers("limits", Object.keys(G.limits))));
  }
  body.append(...out);
  const top = devEl.querySelector(".dev-body") ? devEl.querySelector(".dev-body").scrollTop : 0;
  devEl.replaceChildren(head, tabs, body); body.scrollTop = top;
}
function devRefresh() {                        // new numbers from the server: fields not being typed in take them
  if (devEl.hidden) return;
  for (const i of devEl.querySelectorAll("input[data-path]")) if (document.activeElement !== i) i.value = devGet(JSON.parse(i.dataset.path));
}
function devMount() {
  if ($("dev-btn")) return;
  const b = document.createElement("button"); b.id = "dev-btn"; b.type = "button"; b.textContent = "D"; b.title = "Developer";
  b.addEventListener("click", () => { devEl.hidden = !devEl.hidden; b.classList.toggle("on", !devEl.hidden); devDraw(); });
  $("staff-col").appendChild(b);
}
devEl.addEventListener("mousedown", (e) => e.stopPropagation());
devEl.addEventListener("keydown", (e) => e.stopPropagation());

// ---- (owner, 2026-10-17) the tutorial: a step at a time, each waiting for the player to do it; an arrow points at what to
// fly to and the panel buttons to use glow. Saved per account (the server keeps the step; -1: done or skipped). ----
const tutEl = $("tut"); let tut = null, tutS = {}, tutSent = null;
const holdN = () => (ME.units || []).length;
const storeN = (raw) => Object.entries(STATION.storage || {}).reduce((n, [k, v]) => n + (k === "fuel" || (raw && k.endsWith("+")) ? 0 : v), 0);
function nearestRock() { let b = null, bd = Infinity; for (const r of rocks.values()) { if (r.cracks <= 0) continue; const d = hyp(r.dx - mine.x, r.dy - mine.y) - rockR(r.n); if (d < bd) { bd = d; b = r; } } return b; }
function nearestOre() { let b = null, bd = Infinity; for (const o of ores.values()) { const d = hyp(o.dx - mine.x, o.dy - mine.y); if (d < bd) { bd = d; b = o; } } return b; }
const STATION_PT = () => ({ x: G.world.station[0], y: G.world.station[1] });
const TUT = [
  { text: "Fly with W and S and turn with A and D. Q and E slide sideways.", start: (s) => { s.x = mine.x; s.y = mine.y; }, done: (s) => hyp(mine.x - s.x, mine.y - s.y) > 150 },
  { text: "Fly to an asteroid. Follow the arrow.", target: () => { const r = nearestRock(); if (r) return { x: r.dx, y: r.dy, r: rockR(r.n) }; const d = hyp(mine.x, mine.y) || 1, k = (G.world.rings[0][0] + 400) / d; return d < G.world.rings[0][0] + 200 ? { x: mine.x * k, y: mine.y * k, r: 60 } : null; }, done: () => { const r = nearestRock(); return !!r && hyp(r.dx - mine.x, r.dy - mine.y) - rockR(r.n) < myHull().interactR - 30; } },
  { text: "Aim at it with the mouse and hold the left button to mine. Every crack you break drops ore.", target: () => { const r = nearestRock(); return r && { x: r.dx, y: r.dy, r: rockR(r.n) }; }, start: (s) => { s.cracked = false; }, done: (s) => s.cracked },
  { text: "Your Miner module mines faster but burns fuel. Press F, or click its button, to switch it.", glow: ".mod-chip", start: (s) => { s.on = JSON.stringify(ME.on); }, done: (s) => JSON.stringify(ME.on) !== s.on },
  { text: "Click the ore beside the asteroid to claim it. You can reach anything inside the dotted circle.", target: () => { const o = nearestOre(); return o && { x: o.dx, y: o.dy, r: 8 }; }, start: (s) => { s.h = holdN(); }, done: (s) => holdN() > s.h, skip: () => !ores.size && holdN() > 0 },
  { text: "Fly into the station to deliver your hold. Everyone who helped mine it gets a copy.", target: () => ({ ...STATION_PT(), r: 140 }), done: () => !!ME.docked && storeN() > 0 },
  { text: "Right-click an ore in Storage, choose Refine and slide to how many. Refined ore takes less room and sells for more.", dock: true, glow: ".st-slot:not(.empty)", done: () => (STATION.queue || []).some((j) => j.k === "refine"), skip: () => !!ME.docked && storeN(true) === 0 },
  { text: "Right-click an ore and choose Sell.", wait: () => storeN() === 0 && (STATION.queue || []).length > 0, waitText: "Your refined ore comes out of the Queue into Storage. Sell it once it arrives.", dock: true, glow: ".st-slot:not(.empty)", start: (s) => { s.c = ME.credits; }, done: (s) => ME.credits > s.c, skip: () => !!ME.docked && storeN() === 0 && !(STATION.queue || []).length },
  { text: "Top up your fuel tank with Fill.", dock: true, glow: "#station .st-row button.gold", done: () => ME.fuel >= ME.tank - 0.5 },
  { text: "Open the Shop and upgrade your Miner.", dock: true, glow: "#station .st-head button.gold, .shop-card.fitted button.gold", done: () => Object.values(ME.upgrades || {}).some((v) => v > 0) },
  { text: "That's the basics. Good mining out in the rings!", final: true },
];
function tutGo(step) {                         // move to a step (or -1: finished) and tell the server
  tut = step; tutS = {}; if (tut >= 0 && TUT[tut] && TUT[tut].start) TUT[tut].start(tutS);
  if (tutSent !== tut) { tutSent = tut; send({ t: "tut", step: tut }); }
  tutDraw();
}
function tutDraw() {
  tutEl.hidden = tut === null || tut < 0 || !TUT[tut]; if (tutEl.hidden) { document.querySelectorAll(".tut-glow").forEach((e) => e.classList.remove("tut-glow")); return; }
  const st = TUT[tut], undocked = st.dock && !ME.docked;
  $("tut-n").textContent = (tut + 1) + " / " + TUT.length;
  $("tut-text").textContent = undocked ? "Fly back into the station." : st.wait && st.wait() ? st.waitText : st.text;
  $("tut-skip").textContent = st.final ? "Done" : "Skip";
}
$("tut-skip").addEventListener("click", (e) => { e.currentTarget.blur(); tutGo(-1); });
tutEl.addEventListener("mousedown", (e) => e.stopPropagation());
function tutTick() {                           // every frame: has the player done the step? which buttons glow?
  if (tut === null && haveMe && ME.tut !== undefined && G) tutGo(ME.tut);
  if (tut === null || tut < 0 || !TUT[tut]) return;
  const st = TUT[tut];
  if (!st.final && ((st.skip && st.skip(tutS)) || (!(st.dock && !ME.docked) && st.done(tutS)))) { tutGo(tut + 1); return; }
  const want = st.glow && !(st.dock && !ME.docked) ? new Set(document.querySelectorAll(st.glow)) : new Set();
  document.querySelectorAll(".tut-glow").forEach((e) => { if (!want.has(e)) e.classList.remove("tut-glow"); });
  for (const e of want) e.classList.add("tut-glow");
  if (st.dock || st.wait) { const want = st.dock && !ME.docked ? "Fly back into the station." : st.wait && st.wait() ? st.waitText : st.text; if ($("tut-text").textContent !== want) tutDraw(); }
}
function tutTarget() { if (tut === null || tut < 0 || !TUT[tut]) return null; const st = TUT[tut]; if (st.dock && !ME.docked) return { ...STATION_PT(), r: 140 }; return st.target ? st.target() : null; }
function tutArrow(t) {                         // a gold chevron over the target, or at the screen's edge pointing at it
  const g = tutTarget(); if (!g) return;
  { const [mx0, my0] = toScreen(mine.x, mine.y), [tx, ty] = toScreen(g.x, g.y), d = hyp(tx - mx0, ty - my0), gap = (g.r || 0) * zoom + 10;   // a faint guide line from my ship toward it
    if (d > 80 + gap) { const ux = (tx - mx0) / d, uy = (ty - my0) / d; cx.save(); cx.strokeStyle = C.gold; cx.globalAlpha = 0.35; cx.lineWidth = 2; cx.setLineDash([6, 8]); cx.lineDashOffset = -t / 40; cx.beginPath(); cx.moveTo(mx0 + ux * 46, my0 + uy * 46); cx.lineTo(tx - ux * gap, ty - uy * gap); cx.stroke(); cx.restore(); } }
  let [sx, sy] = toScreen(g.x, g.y); const off = sx < 30 || sy < 30 || sx > VW - 30 || sy > VH - 30, bob = Math.sin(t / 180) * 5;
  cx.save(); cx.fillStyle = C.gold; cx.strokeStyle = C.void; cx.lineWidth = 2;
  if (off) {
    const a = Math.atan2(sy - VH / 2, sx - VW / 2), k = Math.min((VW / 2 - 46) / Math.abs(Math.cos(a) || 1e-6), (VH / 2 - 46) / Math.abs(Math.sin(a) || 1e-6));
    cx.translate(VW / 2 + Math.cos(a) * (k + bob), VH / 2 + Math.sin(a) * (k + bob)); cx.rotate(a);
    cx.beginPath(); cx.moveTo(16, 0); cx.lineTo(-10, -12); cx.lineTo(-4, 0); cx.lineTo(-10, 12); cx.closePath(); cx.fill(); cx.stroke();
  } else {
    cx.translate(sx, sy - (g.r || 0) * zoom - 18 + bob);
    cx.beginPath(); cx.moveTo(0, 12); cx.lineTo(-12, -6); cx.lineTo(0, -1); cx.lineTo(12, -6); cx.closePath(); cx.fill(); cx.stroke();
  }
  cx.restore();
}

connect();

// for the test harness and the console
window.Atamus = {
  get me() { return { ...mine, id: myId }; }, get state() { return ME; }, get station() { return STATION; }, get soc() { return SOC; }, get sectors() { return sectors; }, get sos() { return sosList; }, get mates() { return mates; }, get game() { return G; },
  get rocks() { return [...rocks.values()].map((r) => ({ id: r.id, x: r.x, y: r.y, n: r.n, cracks: r.cracks, hp: r.hp, ore: r.ore })); }, get ores() { return [...ores.values()]; },
  get ships() { return [...ships.values()].filter((s) => s.row).map((s) => ({ id: s.id, x: s.x, y: s.y, near: s.near, m: G && G.kinds[s.row[4]], fl: s.row[5], len: s.row[7] })); },
  screenOf: (x, y) => { const [sx, sy] = toScreen(x, y); return { x: sx, y: sy }; }, send: (o) => send(o), get zoom() { return zoom; }, set zoom(z) { zoom = z; },
};
