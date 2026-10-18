// Atamus: Crack, Bank and Haul (owner, 2026-10-18: the mining redesign). One shared world seen from above: Saturn in the
// middle, the station beside it, two asteroid rings, the locked line past them. Asteroids are hidden masonry: shells of
// chunks around a core, one solid mass until a scanner maps them. The miner's laser cuts the first chunk on its line;
// broken chunks bank their ore into the core, and the pop pays it out into holds, cans and party crates. W / S thrust
// along the nose, A / D turn, Q / E strafe; the mouse aims; the left button holds the beam on (the laser, or the
// scanner's survey); the right button opens menus; the wheel zooms. On a phone: twin sticks, left flies, right aims and
// fires. Fly into the station to deliver and use its panel. The server decides everything; this page predicts my own
// ship with the same numbers and draws the rest.
import { C, ART, shipLayout, drawShip, drawStation, drawSaturn } from "./shipart.js?v=1792300005";

if (typeof needLogin === "function" && needLogin()) location.replace("login.html");
const $ = (id) => document.getElementById(id);
const statusEl = $("status"), countEl = $("countdown");
const WEB_BUILD = (document.querySelector('meta[name="atamus-build"]') || {}).content || "";
const TAU = Math.PI * 2, hyp = Math.hypot;

// ---- the game's numbers (the hello sends them) ----
let G = null;
const sectorOf = (x, y) => (((Math.round(Math.atan2(x, -y) / (Math.PI / 2))) % 4) + 4) % 4;
let ORE_KEYS = [];
const myShip = () => G.ships[ME.ship] || G.ships.miner;
const myVision = () => Math.min(G.world.loadR, myShip().vision);   // (the fog: as the server)
const oreName = (k) => (G && G.ores[k] ? G.ores[k].name : k);
const towFactor = (r) => Math.max(0.2, 60 / (60 + r));             // (as the server's world.js)

// ---- state ----
let myId = null, myName = "", amStaff = false, haveMe = false;
const mine = { x: 0, y: 0, vx: 0, vy: 0, h: 0 };
const corr = { x: 0, y: 0 };
let ME = { fuel: 100, tank: 100, cap: 1200, hold: [], cans: [], myCrates: [], credits: 0, docked: 0, ship: "miner", tow: 0, drill: 0, pump: 0, hire: 0, rate: 0, sos: 0, zone: "", storage: {}, myCan: 0, mark: 0, abilityIn: 0 };
let SOC = { party: null };
let online = 0, sosList = [], mates = [], marks = [];   // marks: [x, y] rocks marked by me and my party      // mates: [id, x, y] (my party, anywhere, for the minimap)
const ships = new Map();                       // id -> { id, buf, row, x, y, h, near }
const rocks = new Map();                       // id -> { id, x, y, size, r, fill, hp, tow, dx, dy }: the summaries
const details = new Map();                     // id -> { v, coreR, c: [[i, r0, r1, a0, a1, bits, d, ore, st]] }: the chunk layouts
const cans = new Map();                        // id -> { id, x, y, crate, st }: 0 locked to another, 1 mine / my party's, 2 public, 3 unlocked
const names = new Map();                       // id -> name (the roster)
const fx = [];                                 // effects being drawn
// (owner, 2026-10-17) small world-space particles: mining sparks, crack debris, engine exhaust, delivery glitter
const parts = [];
function spawnPart(x, y, o) { if (parts.length > 360) parts.splice(0, 40); parts.push({ x, y, vx: o.vx || 0, vy: o.vy || 0, life: o.life || 0.6, age: 0, size: o.size || 3, color: o.color || "#fff", drag: o.drag ?? 2.5 }); }
function burst(x, y, n, colors, speed) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = speed * (0.4 + Math.random()); spawnPart(x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.5, size: 2 + Math.random() * 3.5, color: colors[(Math.random() * colors.length) | 0], drag: 3 }); } }
function drawParts(wdt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.age += wdt; if (p.age >= p.life) { parts.splice(i, 1); continue; }
    const k = Math.exp(-wdt * p.drag); p.vx *= k; p.vy *= k; p.x += p.vx * wdt; p.y += p.vy * wdt;
    const f = 1 - p.age / p.life, sz = p.size * (0.5 + 0.5 * f);
    cx.globalAlpha = f; cx.fillStyle = p.color; cx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
  }
  cx.globalAlpha = 1;
}
// chunks break off and dissipate: triangle shards drifting away from the rock, spinning and fading
const shardsArr = [];
function spawnChunkShards(rk, c0) {
  if (shardsArr.length > 240) return;
  const r0 = c0[1], r1 = c0[2], a0 = c0[3], a1 = c0[4];
  const am = (a0 + (a1 < a0 ? a1 + TAU * 1000 : a1)) / 2000, mid = (r0 + r1) / 2, sz = Math.max(4, (r1 - r0) * 0.5);
  const px = rk.x + Math.cos(am) * mid, py = rk.y + Math.sin(am) * mid;
  for (let j = 0; j < 4; j++) {
    const oa = am + (Math.random() - 0.5) * 0.8, v = 26 + Math.random() * 40;
    shardsArr.push({ x: px + (Math.random() - 0.5) * sz, y: py + (Math.random() - 0.5) * sz,
      vx: Math.cos(oa) * v, vy: Math.sin(oa) * v, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 5,
      s: sz * (0.4 + Math.random() * 0.6), color: UNSCANNED, age: 0, life: 0.7 + Math.random() * 0.6 });
  }
}
function drawShards(wdt) {
  for (let i = shardsArr.length - 1; i >= 0; i--) {
    const p = shardsArr[i]; p.age += wdt; if (p.age >= p.life) { shardsArr.splice(i, 1); continue; }
    p.x += p.vx * wdt; p.y += p.vy * wdt; p.rot += p.vr * wdt;
    const f = 1 - p.age / p.life, sz = p.s * (0.4 + 0.6 * f);
    cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.globalAlpha = f * 0.9; cx.fillStyle = p.color;
    cx.beginPath(); cx.moveTo(sz, 0); cx.lineTo(-sz * 0.6, -sz * 0.7); cx.lineTo(-sz * 0.6, sz * 0.7); cx.closePath(); cx.fill(); cx.restore();
  }
  cx.globalAlpha = 1;
}
// a nudge of screen shake (a crack nearby, a pop, docking, bumping an asteroid), decaying fast
const shk = { a: 0, x: 0, y: 0 };
const addShake = (a) => { shk.a = Math.min(7, shk.a + a); };
let lastBumpT = 0;
// a paid-out unit flies from the rock into the hold bar
function flyOre(wx, wy) {
  const [sx, sy] = toScreen(wx, wy), wrap = $("hold-wrap"), tgt = wrap.getBoundingClientRect();
  const d = document.createElement("i"); d.className = "ore-fly"; d.style.left = sx + "px"; d.style.top = sy + "px"; document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.transform = `translate(${tgt.left + tgt.width / 2 - sx}px, ${tgt.top + 8 - sy}px) scale(.45)`; d.style.opacity = "0.25"; });
  setTimeout(() => { d.remove(); wrap.classList.remove("pop"); void wrap.offsetWidth; wrap.classList.add("pop"); }, 430);
}

// ---- the canvas and camera ----
const cv = $("view"), cx = cv.getContext("2d");
let VW = 0, VH = 0, DPR = 1, zoom = 1.1;
const ZMIN = 0.32, ZMAX = 3;
try { const z = +localStorage.getItem("atamus.zoom"); if (z >= ZMIN && z <= ZMAX) zoom = z; } catch {}
let zoomT = zoom;                              // (owner, 2026-10-17: the wheel eases the zoom instead of stepping it)
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
let modeAlt = false;                           // (owner, 2026-10-18) the tool switch: the Scanner's Drill / Mine, the Booster's Boost / Cool
const hasAlt = () => { const S = G && G.ships[ME.ship]; return !!(S && (S.drillSpeed || S.boost)); };
function toggleMode() { if (!hasAlt()) return; modeAlt = !modeAlt; drawHud(); }
addEventListener("keydown", (e) => {
  if (typing()) return;
  if (e.code === "Enter") { e.preventDefault(); openChat(); return; }
  if (e.code === "Escape") hideMenu();
  if (e.code === "KeyF" && !e.repeat) { toggleMode(); e.preventDefault(); }
  if (e.code === "Space" && !e.repeat) { sendAbility(); e.preventDefault(); }
  if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"].includes(e.code)) { keys.add(e.code); e.preventDefault(); }
});
function sendAbility() { const S = G && G.ships[ME.ship]; if (S && S.boost && !(ME.abilityIn > 0)) send({ t: "act", op: "ability" }); }
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => { keys.clear(); firing = false; });
document.addEventListener("contextmenu", (e) => e.preventDefault());
cv.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.over = true; });
cv.addEventListener("mouseleave", () => { mouse.over = false; });
// what's under the pointer: a can, another ship, an asteroid
function canAt(sx, sy) { const [wx, wy] = toWorld(sx, sy); let best = null, bd = Math.max(14, 16 / zoom); for (const o of cans.values()) { const d = hyp(o.dx - wx, o.dy - wy); if (d < bd) { bd = d; best = o; } } return best; }
function shipAt(sx, sy) { const [wx, wy] = toWorld(sx, sy); let best = null, bd = 34 / Math.min(1, zoom); for (const s of ships.values()) { if (s.id === myId || !s.near) continue; const d = hyp(s.x - wx, s.y - wy); if (d < bd) { bd = d; best = s; } } return best; }
function rockAt(sx, sy) { const [wx, wy] = toWorld(sx, sy); for (const r of rocks.values()) if (hyp(r.dx - wx, r.dy - wy) < r.r + 6) return r; return null; }
cv.addEventListener("mousedown", (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (e.button === 0) {                        // a can under the pointer is picked up; otherwise the beam fires
    const o = canAt(e.clientX, e.clientY); if (o && hyp(o.dx - mine.x, o.dy - mine.y) <= G.fly.interactR) { send({ t: "act", can: o.id }); return; }
    firing = true;
  }
  if (e.button === 2) {                        // another ship: its menu; an asteroid: drill / tow; a can: pick up / unlock
    const s = shipAt(e.clientX, e.clientY); if (s) { shipMenu(s, e.clientX, e.clientY); return; }
    const o = canAt(e.clientX, e.clientY); if (o) { canMenu(o, e.clientX, e.clientY); return; }
    const r = rockAt(e.clientX, e.clientY), S = myShip();
    if (!r) return;
    const items = [["Mark", () => send({ t: "act", rock: r.id, op: "mark" })]];
    if (S.towRange) items.push([ME.tow === r.id ? "Release" : "Tow", () => send({ t: "act", rock: r.id, op: "tow" })]);
    showMenu(e.clientX, e.clientY, items);
  }
});
addEventListener("mouseup", (e) => { if (e.button === 0) firing = false; });
cv.addEventListener("wheel", (e) => { e.preventDefault(); zoomT = Math.min(ZMAX, Math.max(ZMIN, zoomT * (e.deltaY > 0 ? 0.88 : 1.14))); try { localStorage.setItem("atamus.zoom", String(zoomT)); } catch {} }, { passive: false });
// (owner, 2026-10-18, the design document) twin sticks on a touch screen: the left half flies, the right half aims and
// fires. A tap picks up the can under the finger; holding still for half a second opens the thing's menu, as a
// right-click would; a second finger on a busy half pinches the zoom.
const TOUCH = matchMedia("(pointer: coarse)").matches;
if (TOUCH) document.body.classList.add("touch");
const sticks = { move: null, aim: null };
let touchAim = null, pinch = null;
const touches = new Map();                     // identifier -> { x0, y0, t0, side, moved, used, timer }
function touchMenuAt(x, y) {                   // the long-press: what a right-click would open
  if (!G) return false;
  const s = shipAt(x, y); if (s) { shipMenu(s, x, y); return true; }
  const o = canAt(x, y); if (o) { canMenu(o, x, y); return true; }
  const r = rockAt(x, y), S = myShip();
  if (!r) return false;
  const items = [["Mark", () => send({ t: "act", rock: r.id, op: "mark" })]];
  if (S.towRange) items.push([ME.tow === r.id ? "Release" : "Tow", () => send({ t: "act", rock: r.id, op: "tow" })]);
  showMenu(x, y, items); return true;
}
cv.addEventListener("touchstart", (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const side = t.clientX < VW / 2 ? "move" : "aim";
    if (sticks[side] && !pinch) {              // a second finger on a busy half: pinch the zoom
      const a = sticks[side], m0 = touches.get(a.id);
      if (m0 && m0.timer) clearTimeout(m0.timer); if (m0) m0.used = true;
      pinch = { aId: a.id, bId: t.identifier, d0: Math.max(20, hyp(t.clientX - a.x, t.clientY - a.y)), z0: zoomT, ax: a.x, ay: a.y };
      sticks[side] = null; if (side === "aim") firing = false;
      touches.set(t.identifier, { used: true, moved: true, t0: performance.now(), x0: t.clientX, y0: t.clientY, side, timer: 0 });
      continue;
    }
    if (!sticks[side]) sticks[side] = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
    const meta = { x0: t.clientX, y0: t.clientY, t0: performance.now(), side, moved: false, used: false, timer: 0 };
    meta.timer = setTimeout(() => {            // held still: the menu, and the stick lets go
      if (meta.moved || meta.used) return;
      meta.used = true;
      const s2 = sticks[side]; if (s2 && s2.id === t.identifier) { sticks[side] = null; if (side === "aim") firing = false; }
      touchMenuAt(meta.x0, meta.y0);
    }, 450);
    touches.set(t.identifier, meta);
  }
}, { passive: false });
cv.addEventListener("touchmove", (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const meta = touches.get(t.identifier);
    if (meta && !meta.moved && hyp(t.clientX - meta.x0, t.clientY - meta.y0) > 12) { meta.moved = true; if (meta.timer) clearTimeout(meta.timer); }
    if (pinch && (t.identifier === pinch.aId || t.identifier === pinch.bId)) {
      if (t.identifier === pinch.aId) { pinch.ax = t.clientX; pinch.ay = t.clientY; }
      else { const d = Math.max(20, hyp(t.clientX - pinch.ax, t.clientY - pinch.ay)); zoomT = Math.min(ZMAX, Math.max(ZMIN, pinch.z0 * d / pinch.d0)); try { localStorage.setItem("atamus.zoom", String(zoomT)); } catch {} }
      continue;
    }
    for (const side of ["move", "aim"]) { const s = sticks[side]; if (s && s.id === t.identifier) { s.x = t.clientX; s.y = t.clientY; } }
  }
  const a = sticks.aim;
  if (a) { const dx = a.x - a.ox, dy = a.y - a.oy; if (hyp(dx, dy) > 18) { touchAim = Math.atan2(dy, dx); firing = true; } }
}, { passive: false });
const touchEnd = (e) => {
  for (const t of e.changedTouches) {
    const meta = touches.get(t.identifier); touches.delete(t.identifier);
    if (pinch && (t.identifier === pinch.aId || t.identifier === pinch.bId)) pinch = null;
    if (meta) {
      if (meta.timer) clearTimeout(meta.timer);
      if (!meta.moved && !meta.used && performance.now() - meta.t0 < 300) {   // a tap: pick up the can under the finger
        const o = canAt(meta.x0, meta.y0); if (o && G && hyp(o.dx - mine.x, o.dy - mine.y) <= G.fly.interactR) send({ t: "act", can: o.id });
      }
    }
    for (const side of ["move", "aim"]) { const s = sticks[side]; if (s && s.id === t.identifier) { sticks[side] = null; if (side === "aim") firing = false; } }
  }
};
cv.addEventListener("touchend", touchEnd); cv.addEventListener("touchcancel", touchEnd);
// holding a finger on the cargo, a chat name or a party member works as its right-click
document.addEventListener("touchstart", (e) => {
  if (e.target === cv || !TOUCH) return;
  const t = e.changedTouches[0]; if (!t) return;
  const x0 = t.clientX, y0 = t.clientY, tgt = e.target;
  let moved = false;
  const onMove = (ev) => { const m = [...ev.changedTouches].find((q) => q.identifier === t.identifier); if (m && hyp(m.clientX - x0, m.clientY - y0) > 10) moved = true; };
  const done = () => { clearTimeout(timer); document.removeEventListener("touchmove", onMove); document.removeEventListener("touchend", done); document.removeEventListener("touchcancel", done); };
  const timer = setTimeout(() => { if (!moved) tgt.dispatchEvent(new MouseEvent("contextmenu", { clientX: x0, clientY: y0, bubbles: true, cancelable: true })); done(); }, 480);
  document.addEventListener("touchmove", onMove); document.addEventListener("touchend", done); document.addEventListener("touchcancel", done);
}, { passive: true });
// zoom buttons (touch): pinch works on one half, these always work
for (const [bid, f2] of [["zoom-in", 1.3], ["zoom-out", 1 / 1.3]]) $(bid).addEventListener("click", () => { zoomT = Math.min(ZMAX, Math.max(ZMIN, zoomT * f2)); try { localStorage.setItem("atamus.zoom", String(zoomT)); } catch {} });
// the chat bubble (touch): chat stays folded so the aim half stays clear; the bubble pulses on unread
$("chat-toggle").addEventListener("click", () => {
  const open = document.body.classList.toggle("chat-open");
  $("chat-toggle").classList.remove("new");
  if (open) drawLog();
});
// ship-relative controls: W thrusts along the nose (nose: (sin h, -cos h)), S backs up, Q / E push sideways, A / D turn
function pushInput() {
  const m = sticks.move;
  if (m) { let x = (m.x - m.ox) / 60, y = (m.y - m.oy) / 60; const L = hyp(x, y); if (L > 1) { x /= L; y /= L; } else if (L < 0.15) x = y = 0; return { x, y, turn: 0, stick: true }; }
  let f = 0, s = 0; if (keys.has("KeyW")) f += 1; if (keys.has("KeyS")) f -= 1; if (keys.has("KeyE")) s += 1; if (keys.has("KeyQ")) s -= 1;
  const h = mine.h; let x = Math.sin(h) * f + Math.cos(h) * s, y = -Math.cos(h) * f + Math.sin(h) * s; const L = hyp(x, y); if (L > 1) { x /= L; y /= L; }
  return { x, y, turn: (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) };
}
const aimAngle = () => { if (sticks.aim && touchAim !== null) return touchAim; const [sx, sy] = toScreen(mine.x, mine.y); return Math.atan2(mouse.y - sy, mouse.x - sx); };

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
    G = m.game; ORE_KEYS = Object.keys(G.ores); myId = m.you.id; myName = m.you.name; amStaff = !!m.you.staff; if (m.you.dev) devMount();
    mine.x = m.spawn.x; mine.y = m.spawn.y; mine.h = m.spawn.h || 0; mine.vx = mine.vy = 0; corr.x = corr.y = 0; haveMe = true; cam.x = mine.x; cam.y = mine.y;
    online = m.online || 0;
    ships.clear(); rocks.clear(); details.clear(); cans.clear(); names.clear(); snapRows = new Map();
    for (const r of m.roster || []) names.set(r.i, r.n);
    if (m.you.staff && window.AdminPanel) window.AdminPanel.mount();
    if (m.countdown) startCountdown(Date.now() + m.countdown.in, m.countdown.parts, m.countdown.head);
    drawPrefix();
  } else if (m.t === "snap") onSnap(m);
  else if (m.t === "rocks") {
    for (const row of m.a || []) { const [id, x, y, size, r, fill, hp, tow, heat] = row; const o = rocks.get(id); if (o) { if (fill > (o.fill || 0)) o.gulpT = performance.now(); Object.assign(o, { x, y, size, r, fill, hp, tow, heat }); } else rocks.set(id, { id, x, y, size, r, fill, hp, tow, heat, dx: x, dy: y }); }
    for (const id of m.x || []) { rocks.delete(id); details.delete(id); }
  } else if (m.t === "rockd") {
    const cl = m.c || [], prev = details.get(m.id), rk0 = rocks.get(m.id);
    if (prev && rk0) {                         // chunks that just broke shatter into drifting shards
      let n = 0;
      for (const c0 of cl) { const was = prev.c[c0[0]] || prev.c.find((x) => x[0] === c0[0]); if (was && !(was[5] & 1) && (c0[5] & 1) && n++ < 10) spawnChunkShards(rk0, c0); }
    }
    details.set(m.id, { v: m.v, coreR: m.coreR, c: cl, worked: cl.some((x) => x[5] & 3) });
  }
  else if (m.t === "cans") {
    for (const row of m.a || []) { const [id, x, y, crate, st] = row; const o = cans.get(id); if (o) Object.assign(o, { x, y, crate, st }); else cans.set(id, { id, x, y, crate, st, dx: x, dy: y }); }
    for (const id of m.x || []) cans.delete(id);
  } else if (m.t === "me") { const wasDocked = ME.docked; ME = m; if (!wasDocked && ME.docked) addShake(2.2); drawStation_(); drawHud(); refreshTip(); }
  else if (m.t === "invite") showInvite(m);
  else if (m.t === "mates") { mates = m.m || []; marks = m.marks || []; }
  else if (m.t === "game") {                   // (developer panel) the numbers changed: everything that reads them redraws
    G = m.game; ORE_KEYS = Object.keys(G.ores); hudKey = ""; stKey = "";
    if (m.field) { rocks.clear(); details.clear(); }
    drawHud(); drawStation_(); devRefresh();
  }
  else if (m.t === "soc") { SOC = m; drawParty(); }
  else if (m.t === "sos") sosList = m.s || [];
  else if (m.t === "fx") {
    fx.push({ ...m, t0: performance.now() });
    const d = hyp(m.x - mine.x, m.y - mine.y);
    if (m.k === "crack") { burst(m.x, m.y, 8 + Math.min(10, (m.u || 0) * 3), [C.rock, "#fff", C.dim], 60); addShake(1.6 * Math.max(0, 1 - d / 700)); }
    else if (m.k === "pop") {
      burst(m.x, m.y, 30, [C.gold, C.heat, "#fff"], 140); addShake(5 * Math.max(0, 1 - d / 1400));
      let popRk = null; for (const r of rocks.values()) if (hyp(r.x - m.x, r.y - m.y) < 20) { popRk = r; break; }
      const popDet = popRk && details.get(popRk.id);
      if (popDet) { let n = 0; for (const c0 of popDet.c) if (!(c0[5] & 1) && n++ < 26) spawnChunkShards(popRk, c0); }
    }
    else if (m.k === "deliver") { burst(m.x, m.y, 14, [C.gold, "#fff"], 65); if (m.i === myId) addShake(1); }
    else if (m.k === "pay") { /* drawn as a flight from the core in drawFx; the self hand-off happens when it lands */ }
    else if (m.k === "pulse") { addShake(1.2 * Math.max(0, 1 - d / 900)); }
    else if (m.k === "scan") burst(m.x, m.y, 5, [C.ice, "#fff"], 35);
  }
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
function allowedMe(x, y) { const r = hyp(x, y); return r >= G.world.saturnR + G.fly.shipR && r <= G.world.lockedR; }
function stepMe(dt, inp) {
  const S = myShip(), F = G.fly, empty = ME.fuel <= 0.0001, rock = ME.tow && rocks.get(ME.tow);
  const k = empty ? F.crawl : 1, spd = S.speed * k * (rock ? towFactor(rock.r) : 1), push = hyp(inp.x, inp.y);
  const a = (push > 0.01 ? F.accel * k : F.brake) * dt;
  let ex = inp.x * spd - mine.vx, ey = inp.y * spd - mine.vy; const el = hyp(ex, ey); if (el > a) { ex *= a / el; ey *= a / el; }
  mine.vx += ex; mine.vy += ey;
  if (push > 0.01 && !empty) ME.fuel = Math.max(0, ME.fuel - F.flyBurn / 60 * push * dt);
  if (mine.vx || mine.vy) {
    const nx = mine.x + mine.vx * dt, ny = mine.y + mine.vy * dt;
    if (allowedMe(nx, ny)) { mine.x = nx; mine.y = ny; } else if (allowedMe(nx, mine.y)) { mine.x = nx; mine.vy = 0; } else if (allowedMe(mine.x, ny)) { mine.y = ny; mine.vx = 0; } else mine.vx = mine.vy = 0;
    for (const r of rocks.values()) {          // bump off asteroids, as the server does
      if (r.id === ME.tow) continue; const d = hyp(mine.x - r.dx, mine.y - r.dy), min = r.r + F.shipR;
      if (d < min && d > 0.01) {
        const ux = (mine.x - r.dx) / d, uy = (mine.y - r.dy) / d; mine.x = r.dx + ux * min; mine.y = r.dy + uy * min;
        const vn = mine.vx * ux + mine.vy * uy;
        if (vn < 0) {
          mine.vx -= vn * ux; mine.vy -= vn * uy;
          const now2 = performance.now();
          if (-vn > 28 && now2 - lastBumpT > 260) { lastBumpT = now2; addShake(Math.min(4, -vn / 32)); burst(r.dx + ux * min, r.dy + uy * min, 6, [C.rock, C.dim], 40); }
        }
      }
    }
  }
  if (inp.stick) {                             // twin sticks: the nose follows the aim while firing, else the movement
    const want = firing && touchAim !== null ? touchAim + Math.PI / 2 : (hyp(inp.x, inp.y) > 0.1 ? Math.atan2(inp.x, -inp.y) : mine.h);
    const d = Math.atan2(Math.sin(want - mine.h), Math.cos(want - mine.h));
    mine.h = Math.atan2(Math.sin(mine.h + Math.max(-F.turn * dt, Math.min(F.turn * dt, d))), Math.cos(mine.h + Math.max(-F.turn * dt, Math.min(F.turn * dt, d))));
  } else mine.h = Math.atan2(Math.sin(mine.h + inp.turn * F.turn * dt), Math.cos(mine.h + inp.turn * F.turn * dt));
}
let lastSent = 0, lastKey = "", heartbeat = 0;
function sendInput(inp, t) {
  const a = Math.round(aimAngle() * 100) / 100, f = firing ? 1 : 0;
  const msg = { t: "in", x: Math.round(inp.x * 100) / 100, y: Math.round(inp.y * 100) / 100, h: Math.round(mine.h * 100) / 100, a, f, md: modeAlt && hasAlt() ? 1 : 0 };
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
// ---- the asteroid: its chunk masonry, in the design document's Fig. 1 look (owner, 2026-10-18) ----
// unscanned chunks are one soft solid mass (filled and fatly stroked in their own color, so no seams give the layout
// away); scanned ones are dark-outlined blocks tinted toward their ore, with a pip per ore unit and speckles on dense
// and ultra; bedrock is dark red, hatched; broken ones are holes; the core swells and ripens gold to orange
const hex2n = (h) => { if (h.startsWith("rgb")) { const m = h.match(/\d+/g); return (+m[0] << 16) | (+m[1] << 8) | +m[2]; } return parseInt(h.slice(1), 16); };
const mix = (h1, h2, k) => { const a = hex2n(h1), b = hex2n(h2), c = (i) => Math.round(((a >> i) & 255) + ((((b >> i) & 255) - ((a >> i) & 255)) * k)); return `rgb(${c(16)},${c(8)},${c(0)})`; };
const DGREY = ["#9aa1b0", "#8f96a5", "#6e737f", "#50555f"];      // soft (paler), normal, dense (darker), ultra (darkest)
const UNSCANNED = "#838999", BEDROCK = "#261016", OUTLINE = "#05070c";
function chunkPath(c0) { const [, r0, r1, a0, a1] = c0; const b0 = a0 / 1000, b1 = a1 / 1000; cx.beginPath(); cx.arc(0, 0, r1, b0, b1 < b0 ? b1 + TAU : b1); cx.arc(0, 0, r0, b1 < b0 ? b1 + TAU : b1, b0, true); cx.closePath(); }
function drawChunkRock(r, det, ts) {
  const lw = (px) => px / zoom;
  cx.save(); cx.translate(r.dx, r.dy);
  if (performance.now() - (r.hitT || 0) < 130) cx.translate((Math.random() - 0.5) * 2.4 / zoom, (Math.random() - 0.5) * 2.4 / zoom);   // (shivers under the laser)
  if (!det) { cx.fillStyle = UNSCANNED; cx.beginPath(); cx.arc(0, 0, r.r, 0, TAU); cx.fill(); cx.restore(); return; }
  // unscanned first, filled and edged in the same flat color with rounded joins: one soft mass (mined heat glows through)
  cx.lineWidth = 3; cx.lineJoin = "round";
  for (const c0 of det.c) { const bits = c0[5]; if (bits & 1 || bits & 2) continue;
    const hq = c0[9] || 0, col0 = hq ? mix(UNSCANNED, "#ff7a28", hq / 4 * 0.6) : UNSCANNED;
    cx.fillStyle = cx.strokeStyle = col0; chunkPath(c0); cx.fill(); cx.stroke(); }
  cx.lineJoin = "miter";
  // scanned: density greys tinted toward the ore, a pip per ore unit, speckles on dense and ultra, bedrock hatched
  for (const c0 of det.c) {
    const [i, r0, r1, a0, a1, bits, d, ore] = c0, hq = c0[9] || 0;
    if (bits & 1 || !(bits & 2)) continue;
    const bed = d === 4, oc = ore >= 0 && G.ores[ORE_KEYS[ore]] ? G.ores[ORE_KEYS[ore]].color : null;
    let fillCol = bed ? BEDROCK : oc ? mix(DGREY[d] || DGREY[1], oc, 0.35) : DGREY[d] || DGREY[1];
    if (hq) fillCol = mix(fillCol.startsWith("#") ? fillCol : "#80869a", "#ff7a28", hq / 4 * 0.6);   // mined chunks run orange with heat
    cx.fillStyle = fillCol;
    chunkPath(c0); cx.fill();
    cx.strokeStyle = OUTLINE; cx.lineWidth = Math.min(1.2, lw(2)); cx.stroke();
    const mid = (r0 + r1) / 2, am = (a0 + (a1 < a0 ? a1 + TAU * 1000 : a1)) / 2000;
    const cxm = Math.cos(am) * mid, cym = Math.sin(am) * mid;
    if (bed) {                                 // hatch lines across it
      cx.save(); chunkPath(c0); cx.clip(); cx.strokeStyle = "rgba(229,96,79,.4)"; cx.lineWidth = 1; cx.beginPath();
      const span = (r1 - r0) + 10;
      for (let o = -span; o <= span; o += 4.5) { cx.moveTo(cxm - span + o, cym - span); cx.lineTo(cxm + span + o, cym + span); }
      cx.stroke(); cx.restore();
    } else {
      if (d >= 2) {                            // speckles
        cx.fillStyle = "rgba(0,0,0,.45)";
        for (let j = 0, nj = d === 2 ? 4 : 8; j < nj; j++) { const aa = am + Math.sin(i * 13.7 + j * 5.1) * 0.4, rr = r0 + 1 + ((Math.sin(i * 7.3 + j * 3.9) + 1) / 2) * (r1 - r0 - 2); cx.fillRect(Math.cos(aa) * rr - 0.7, Math.sin(aa) * rr - 0.7, 1.4, 1.4); }
      }
      if (oc) {                                // a pip per ore unit (1, +1 dense, +2 ultra)
        cx.fillStyle = oc;
        const u = 1 + (d === 2 ? 1 : d === 3 ? 2 : 0);
        for (let j = 0; j < u; j++) { const aa = am + Math.sin(i * 5.9 + j * 2.3) * 0.25, rr = Math.max(r0 + 2, Math.min(r1 - 2, mid + Math.cos(i * 3.1 + j * 4.7) * (r1 - r0) * 0.28)); cx.fillRect(Math.cos(aa) * rr - 1.3, Math.sin(aa) * rr - 1.3, 2.6, 2.6); }
      }
    }
  }
  // crack lines on part-cut chunks (the laser's progress; on bedrock they spread, then it turns dark red)
  cx.strokeStyle = "#11151d"; cx.lineWidth = lw(1.6); cx.lineCap = "round";
  for (const c0 of det.c) {
    const [i, r0, r1, a0, a1, bits, , , st] = c0;
    if (bits & 1 || !st) continue;
    const mid = (r0 + r1) / 2, am = (a0 + (a1 < a0 ? a1 + TAU * 1000 : a1)) / 2000;
    cx.beginPath();
    for (let j = 0; j < st; j++) { const b = am + Math.sin(i * 9.1 + j * 7.7) * 0.9, L0 = (r1 - r0) * (0.3 + 0.2 * j); const px = Math.cos(am) * mid, py = Math.sin(am) * mid; cx.moveTo(px - Math.cos(b) * L0, py - Math.sin(b) * L0); cx.lineTo(px + Math.cos(b) * L0, py + Math.sin(b) * L0); }
    cx.stroke();
  }
  // the core: it swells and ripens gold to orange as ore banks in, glowing brighter the fuller it is. An untouched
  // rock shows nothing: unscanned rock is one solid mass.
  if (r.tow) { cx.strokeStyle = C.ice; cx.lineWidth = lw(2); cx.setLineDash([lw(4), lw(4)]); cx.beginPath(); cx.arc(0, 0, r.r + lw(5), 0, TAU); cx.stroke(); cx.setLineDash([]); }
  const fill = (r.fill || 0) / 100, heat = Math.max(0, (r.heat || 0) / 100), hot = Math.min(1, heat);
  if (!det.worked && fill <= 0 && heat <= 0) { cx.restore(); return; }
  // it swells as ore banks in (a little gulp per swallow), and ripens gold to orange with heat; overheated, it seethes
  const gk = r.gulpT ? (performance.now() - r.gulpT) / 300 : 2;
  const cr = det.coreR * (1 + (G.core.grow || 0.5) * fill) * (gk < 1 ? 1 + 0.22 * Math.sin(gk * Math.PI) : 1);
  const col = mix("#e89a3c", "#ff5a1e", hot);
  const over = heat >= 1 ? 0.5 + 0.5 * Math.sin(ts * 14) : 0;
  const glowR = cr * (2 + hot * 2) + Math.sin(ts * 3) * 2;
  const g = cx.createRadialGradient(0, 0, cr * 0.4, 0, 0, glowR);
  g.addColorStop(0, `rgba(255,${Math.round(179 - hot * 90)},${Math.round(71 - hot * 40)},${(0.28 + hot * 0.55 + over * 0.15).toFixed(2)})`); g.addColorStop(1, "rgba(255,120,40,0)");
  cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, glowR, 0, TAU); cx.fill();
  cx.fillStyle = over ? mix(col, "#ff2e18", over * 0.6) : col; cx.beginPath(); cx.arc(0, 0, cr, 0, TAU); cx.fill();
  cx.strokeStyle = "#7a5524"; cx.lineWidth = Math.min(1.6, lw(2)); cx.stroke();
  cx.fillStyle = "rgba(255,255,255,.4)"; cx.beginPath(); cx.arc(-cr * 0.3, -cr * 0.3, cr * 0.32, 0, TAU); cx.fill();
  cx.restore();
}
// the beam's local ray-walk, as the server's (my own beam is drawn from it so it doesn't lag the mouse):
// forScan skips scanned chunks (they're glass to the scanner); otherwise the first unbroken chunk, or the core down a bore
function castLocal(px, py, ang, forScan, range) {
  const ux = Math.cos(ang), uy = Math.sin(ang);
  let bestT = range || 0, hit = 0;
  for (const r of rocks.values()) {
    const dx = px - r.dx, dy = py - r.dy;
    const b = dx * ux + dy * uy, c0 = dx * dx + dy * dy - r.r * r.r;
    const disc = b * b - c0; if (disc < 0) continue;
    const t1 = -b + Math.sqrt(disc); if (t1 < 0) continue;
    const t0 = Math.max(0, -b - Math.sqrt(disc));
    if (t0 > bestT) continue;
    const det = details.get(r.id);
    if (!det) { bestT = t0; hit = 1; continue; }
    for (let t = t0; t <= Math.min(t1, bestT); t += 1.2) {
      const x = px + ux * t - r.dx, y = py + uy * t - r.dy, rr = hyp(x, y);
      if (rr <= det.coreR + 1) { if (!forScan) { bestT = t; hit = 1; } break; }
      let found = null;
      const a = ((Math.atan2(y, x) % TAU) + TAU) % TAU;
      for (const cc of det.c) {
        if (rr < cc[1] || rr > cc[2]) continue;
        const b0 = cc[3] / 1000, span = (((cc[4] - cc[3]) / 1000) % TAU + TAU) % TAU, d2 = ((a - b0) % TAU + TAU) % TAU;
        if (d2 <= (span || 0.001)) { found = cc; break; }
      }
      if (found && !(found[5] & 1) && (!forScan || !(found[5] & 2))) { bestT = t; hit = 1; break; }
    }
  }
  return { len: bestT, hit };
}
let lastWT = 0;
function drawWorld(t) {
  const W = G.world, ts = t / 1000, wdt = Math.min(0.05, Math.max(0, (t - lastWT) / 1000)); lastWT = t;
  cx.save(); cx.translate(VW / 2 + shk.x, VH / 2 + shk.y); cx.scale(zoom, zoom); cx.translate(-cam.x, -cam.y);
  const lw = (px) => px / zoom;
  // rings: soft gold bands; the sector lines; the locked line
  for (const [a, b] of W.rings) { cx.strokeStyle = "rgba(216,176,106,0.07)"; cx.lineWidth = b - a; cx.beginPath(); cx.arc(0, 0, (a + b) / 2, 0, TAU); cx.stroke(); }
  cx.strokeStyle = "rgba(38,48,68,0.9)"; cx.lineWidth = lw(1.5); cx.setLineDash([lw(4), lw(10)]); cx.beginPath();
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; cx.moveTo(Math.cos(a) * W.safeR, Math.sin(a) * W.safeR); cx.lineTo(Math.cos(a) * W.lockedR, Math.sin(a) * W.lockedR); } cx.stroke();
  cx.strokeStyle = C.signal; cx.lineWidth = lw(2); cx.setLineDash([lw(14), lw(10)]); cx.beginPath(); cx.arc(0, 0, W.lockedR, 0, TAU); cx.stroke(); cx.setLineDash([]);
  if (hyp(cam.x, cam.y) - W.saturnR < hyp(VW, VH) / zoom) drawSaturn(cx, W.saturnR, ts);   // (only while it's on screen)
  // the station and its docking circle
  cx.save(); cx.translate(W.station[0], W.station[1]);
  cx.strokeStyle = C.gold; cx.globalAlpha = ME.docked ? 0.42 + 0.16 * Math.sin(ts * 3) : 0.35; cx.lineWidth = lw(1.5); cx.setLineDash([lw(3), lw(8)]); cx.beginPath(); cx.arc(0, 0, G.econ.dockR, 0, TAU); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1;
  drawStation(cx, ts); cx.restore();
  // asteroids, chunk by chunk
  const vr = Math.max(VW, VH) / zoom;
  for (const r of rocks.values()) {
    r.dx += (r.x - r.dx) * 0.2; r.dy += (r.y - r.dy) * 0.2;
    if (Math.abs(r.dx - cam.x) > vr + r.r || Math.abs(r.dy - cam.y) > vr + r.r) continue;
    drawChunkRock(r, details.get(r.id), ts);
  }
  // cans and crates: a little container, edged by whose it is (gold: mine or my party's; ice, pulsing: public;
  // purple: an unlocked crate; dim: locked to someone else); the one under the pointer is ringed when in reach
  const hovCan = mouse.over ? canAt(mouse.x, mouse.y) : null;
  for (const o of cans.values()) {
    o.dx += (o.x - o.dx) * 0.25; o.dy += (o.y - o.dy) * 0.25; const w = o.crate ? 16 : 11, h = o.crate ? 12 : 9, bob = Math.sin(ts * 2 + o.id) * 1.2;
    cx.fillStyle = "#3a4458"; cx.fillRect(o.dx - w / 2, o.dy - h / 2 + bob, w, h);
    const edge = o.st === 1 ? C.gold : o.st === 2 ? C.ice : o.st === 3 ? C.ore : "rgba(156,152,136,.5)";
    cx.strokeStyle = edge; cx.lineWidth = lw(1.6); cx.globalAlpha = o.st === 2 ? 0.55 + 0.45 * Math.sin(ts * 4) : 1;
    cx.strokeRect(o.dx - w / 2, o.dy - h / 2 + bob, w, h); cx.globalAlpha = 1;
    cx.fillStyle = edge; cx.fillRect(o.dx - w / 2, o.dy - 1 + bob, w, 2);
    if (o === hovCan) { const near = hyp(o.dx - mine.x, o.dy - mine.y) <= G.fly.interactR; cx.strokeStyle = near ? C.gold : C.dim; cx.lineWidth = lw(1.5); cx.beginPath(); cx.arc(o.dx, o.dy + bob, w + 4, 0, TAU); cx.stroke(); }
  }
  // ships: boost rings under them, the hull, beams and links over
  for (const s of ships.values()) if (s.row && (s.id === myId || s.near)) shipFx(s, ts, true);
  for (const s of ships.values()) if (s.row && (s.id === myId || s.near)) {
    const r = s.row, kind = G.kinds[r[4]] || "miner", SP = G.ships[kind], fl = r[5], mods = SP.art;
    const st = { t: ts, raw: r[11] / 100, ref: 0, fuel: r[12] / 100, firing: !!(fl & 2),
      on: { miner: !!(fl & 2), scanner: !!(fl & 2), command: !!r[9], fueler: !!r[10], refinery: !(fl & 8) },
      busy: { fueler: !!r[10], tractor: !!r[8], refinery: !(fl & 8) && kind === "hauler" },
      thrust: s.id === myId ? hyp(lastInp.x, lastInp.y) : Math.min(1, (s.spd || 0) / 40) };
    if (s.id === myId) st.fuel = ME.fuel / (ME.tank || 100);
    if (st.thrust > 0.15) {                    // engine exhaust trailing off the stern
      s.exA = (s.exA || 0) + wdt * 15 * st.thrust;
      const rear = shipLayout(mods).yc * ART, bx = s.x - Math.sin(s.h) * rear, by = s.y + Math.cos(s.h) * rear;
      while (s.exA >= 1) { s.exA--; spawnPart(bx + (Math.random() - 0.5) * 5, by + (Math.random() - 0.5) * 5, { vx: -Math.sin(s.h) * (26 + Math.random() * 18) + (Math.random() - 0.5) * 12, vy: Math.cos(s.h) * (26 + Math.random() * 18) + (Math.random() - 0.5) * 12, life: 0.45 + Math.random() * 0.35, size: 2.4 + Math.random() * 2, color: Math.random() < 0.75 ? C.heat : "#6b7382", drag: 2 }); }
    }
    cx.save(); cx.translate(s.x, s.y); cx.rotate(s.h); cx.scale(ART, ART); drawShip(cx, mods, st); cx.restore();
  }
  for (const s of ships.values()) if (s.row && (s.id === myId || s.near)) shipFx(s, ts, false);
  // my reach: picking up cans and other close work
  cx.strokeStyle = C.ink; cx.globalAlpha = 0.14; cx.lineWidth = lw(1.5); cx.setLineDash([lw(3), lw(9)]); cx.beginPath(); cx.arc(mine.x, mine.y, G.fly.interactR, 0, TAU); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1;
  drawFx(t);
  drawShards(wdt);
  drawParts(wdt);
  // (owner, 2026-10-17) the fog of war: the world fades out past my vision (the server stops sending there too)
  { const V = myVision(), fog = cx.createRadialGradient(mine.x, mine.y, V * 0.78, mine.x, mine.y, V * 1.06);
    fog.addColorStop(0, "rgba(11,14,21,0)"); fog.addColorStop(1, "rgba(11,14,21,0.84)");
    cx.fillStyle = fog; const fr = Math.max(VW, VH) / zoom; cx.fillRect(cam.x - fr, cam.y - fr, fr * 2, fr * 2); }
  cx.restore();
}
// a ship's gear at work: the booster's ring under it; over it, the beam (the miner's laser red, the scanner's survey
// blue), the tow leash, the fuel hose, the boost link
function shipFx(s, ts, under) {
  const r = s.row, kind = G.kinds[r[4]] || "miner", fl = r[5], lw = (px) => px / zoom, lay = shipLayout(G.ships[kind].art), yc = lay.yc;
  if (under) {
    if (fl & 32) {                             // boosted: the ship glows blue (owner, 2026-10-18)
      const gr = 48 + Math.sin(ts * 5) * 4, g2 = cx.createRadialGradient(s.x, s.y, 10, s.x, s.y, gr);
      g2.addColorStop(0, "rgba(124,195,214,.5)"); g2.addColorStop(1, "rgba(124,195,214,0)");
      cx.fillStyle = g2; cx.beginPath(); cx.arc(s.x, s.y, gr, 0, TAU); cx.fill();
    }
    return;
  }
  // the beam, from the nose along the aim: every ship's light laser in thin red, the Miner's fat. My own is predicted
  // locally (aim and endpoint from what I see), so it doesn't lag the mouse.
  const isMe = s.id === myId, S2 = G.ships[kind] || {}, fireNow = isMe ? firing && !ME.docked : !!(fl & 2);
  const drillMode = !!(fl & 16) || (isMe && modeAlt && S2.drillSpeed);
  const coolMode = !!(fl & 64) || (isMe && modeAlt && S2.boost);
  if (fireNow && S2.laserDps && !drillMode) {
    const big = kind === "miner";
    let a = r[6] / 1000, len = r[7], hitF = !!(fl & 1);
    if (isMe) { a = aimAngle(); const c2 = castLocal(mine.x, mine.y, a, false, S2.laserRange); len = c2.len; hitF = !!c2.hit; }
    if (len > 0) {
      const nose = (yc - 30) * ART, x0 = s.x + Math.sin(s.h) * nose, y0 = s.y - Math.cos(s.h) * nose, x1 = s.x + Math.cos(a) * len, y1 = s.y + Math.sin(a) * len;
      cx.strokeStyle = coolMode ? C.ice : C.signal; cx.lineCap = "round";
      cx.globalAlpha = 0.25; cx.lineWidth = lw(big ? 8 : 5); cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
      cx.globalAlpha = 1; cx.lineWidth = lw(big ? 2.6 : 1.6); cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
      if (hitF) {
        cx.fillStyle = "#fff"; cx.globalAlpha = 0.6 + 0.4 * Math.sin(ts * 50); cx.beginPath(); cx.arc(x1, y1, lw(big ? 5 : 4), 0, TAU); cx.fill(); cx.globalAlpha = 1;
        if (Math.random() < (big ? 0.6 : 0.3)) { const na = a + Math.PI + (Math.random() - 0.5) * 2.2, v = 40 + Math.random() * 60; spawnPart(x1, y1, { vx: Math.cos(na) * v, vy: Math.sin(na) * v, life: 0.25 + Math.random() * 0.3, size: 1.8 + Math.random() * 2, color: Math.random() < 0.5 ? "#fff" : (Math.random() < 0.5 ? C.signal : C.heat), drag: 4 }); }
        for (const rk of rocks.values()) if (hyp(rk.dx - x1, rk.dy - y1) < rk.r + 8) { rk.hitT = performance.now(); break; }
      }
    }
  }
  // the drill (owner, 2026-10-18): anchored into the rock, the bore runs a straight line toward the core
  if (fl & 16 && r[8]) {
    const rk = rocks.get(r[8]);
    if (rk) {
      const ang = Math.atan2(s.y - rk.dy, s.x - rk.dx), depth = r[14] || 0;
      const sx = rk.dx + Math.cos(ang) * rk.r, sy = rk.dy + Math.sin(ang) * rk.r;
      const hx = rk.dx + Math.cos(ang) * Math.max(4, rk.r - depth), hy = rk.dy + Math.sin(ang) * Math.max(4, rk.r - depth);
      cx.strokeStyle = C.ice; cx.lineCap = "round";
      cx.lineWidth = lw(4); cx.globalAlpha = 0.9; cx.beginPath(); cx.moveTo(s.x, s.y); cx.lineTo(sx, sy); cx.stroke();   // the shaft, ship to surface
      cx.globalAlpha = 0.55 + 0.25 * Math.sin(ts * 9); cx.lineWidth = lw(2.4); cx.beginPath(); cx.moveTo(sx, sy); cx.lineTo(hx, hy); cx.stroke();   // the bore
      cx.globalAlpha = 1; cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(hx, hy, lw(3.5), 0, TAU); cx.fill();
      if (Math.random() < 0.35) spawnPart(hx, hy, { vx: Math.cos(ang) * 25 + (Math.random() - 0.5) * 20, vy: Math.sin(ang) * 25 + (Math.random() - 0.5) * 20, life: 0.3 + Math.random() * 0.3, size: 1.6 + Math.random() * 1.6, color: Math.random() < 0.6 ? C.ice : "#fff", drag: 3 });
      if (Math.random() < 0.15) rk.hitT = performance.now();   // (a gentle tremble, not a constant shake)
    }
  }
  const at = (lx, ly) => { const c = Math.cos(s.h), sn = Math.sin(s.h); return [s.x + lx * c - ly * sn, s.y + lx * sn + ly * c]; };
  if (r[8]) {                                  // the scanner's tow leash, from both claw tips back to the asteroid
    const rk = rocks.get(r[8]);
    if (rk) { cx.strokeStyle = C.ice; cx.lineWidth = lw(2); cx.setLineDash([lw(4), lw(5)]); cx.globalAlpha = 0.5 + 0.5 * Math.sin(ts * 4.5); cx.beginPath();
      for (const lx of [35, 145]) { const [px, py] = at((lx - 90) * ART, (318 + (lay.off.tractor || 0) - yc) * ART); cx.moveTo(px, py); cx.lineTo(rk.dx, rk.dy); } cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1; }
  }
  const link = (id, color, dash, ly) => { const q = id === myId ? { x: mine.x, y: mine.y } : ships.get(id); if (!q || (id !== myId && !q.near)) return; const [px, py] = at(0, ly); cx.strokeStyle = color; cx.lineWidth = lw(2.5); cx.setLineDash(dash.map(lw)); cx.beginPath(); cx.moveTo(px, py); cx.quadraticCurveTo((px + q.x) / 2 + 10, (py + q.y) / 2 - 10, q.x, q.y); cx.stroke(); cx.setLineDash([]); };
  if (r[10]) link(r[10], C.ice, [], (154 + (lay.off.fueler || 0) - yc) * ART);                // the fueler's hose
}
function drawFx(t) {
  const lw = (px) => px / zoom;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i], k = (t - f.t0) / 1000;
    if (f.k === "crack") {                     // a chunk breaks: a flash and, if it held ore, the ore streaking into the core
      if (k > 0.7) { fx.splice(i, 1); continue; }
      cx.strokeStyle = C.ink; cx.globalAlpha = 1 - k / 0.7; cx.lineWidth = lw(2); cx.beginPath(); cx.arc(f.x, f.y, 6 + k * 26, 0, TAU); cx.stroke(); cx.globalAlpha = 1;
      if (f.u > 0 && f.rx !== undefined) {
        const q = Math.min(1, k / 0.55), px = f.x + (f.rx - f.x) * q, py = f.y + (f.ry - f.y) * q;
        cx.fillStyle = f.ore && G.ores[f.ore] ? G.ores[f.ore].color : C.gold; cx.globalAlpha = 1 - q * 0.4;
        for (let j = 0; j < Math.min(3, f.u); j++) { const o2 = j * 2.1; cx.fillRect(px - 2 + Math.sin(o2 + k * 9) * 4, py - 2 + Math.cos(o2 + k * 9) * 4, 4, 4); }
        cx.globalAlpha = 1;
      }
    } else if (f.k === "pop") {                // the core pops: rings bursting out
      if (k > 1.2) { fx.splice(i, 1); continue; }
      for (const [d, w] of [[0, 3], [0.15, 2]]) { const q = Math.max(0, k - d) / 1.2; if (q <= 0) continue; cx.strokeStyle = q < 0.4 ? C.heat : C.gold; cx.globalAlpha = 1 - q; cx.lineWidth = lw(w); cx.beginPath(); cx.arc(f.x, f.y, (f.r || 40) * 0.3 + q * (f.r || 40) * 3, 0, TAU); cx.stroke(); }
      cx.globalAlpha = 1;
    } else if (f.k === "scan") {               // a chunk mapped: a soft ping
      if (k > 0.5) { fx.splice(i, 1); continue; }
      cx.globalAlpha = 1 - k / 0.5; cx.strokeStyle = C.ice; cx.lineWidth = lw(2); cx.beginPath(); cx.arc(f.x, f.y, 4 + k * 24, 0, TAU); cx.stroke(); cx.globalAlpha = 1;
    } else if (f.k === "deliver") {            // delivered: a gold flash at the ship
      if (k > 1) { fx.splice(i, 1); continue; }
      cx.globalAlpha = 1 - k; cx.strokeStyle = C.gold; cx.lineWidth = lw(2.5); cx.beginPath(); cx.arc(f.x, f.y, 14 + k * 70, 0, TAU); cx.stroke(); cx.globalAlpha = 1;
    } else if (f.k === "pay") {               // the pop's payout: ore squares fly from the core to each player it pays
      const dur = 0.7;
      if (k > dur) { if (f.i === myId && !f.done) { f.done = 1; flyOre(f.x, f.y); } fx.splice(i, 1); continue; }
      const q = k / dur, qe = 1 - (1 - q) * (1 - q), ex = f.rx + (f.x - f.rx) * qe, ey = f.ry + (f.y - f.ry) * qe;
      cx.fillStyle = C.gold; cx.globalAlpha = 0.95;
      for (let j = 0, nj = Math.min(3, Math.ceil((f.u || 100) / 100)); j < nj; j++) { const o2 = j * 2.1 + k * 7; cx.fillRect(ex - 2.5 + Math.sin(o2) * 5, ey - 2.5 + Math.cos(o2) * 5, 5, 5); }
      cx.globalAlpha = 1;
    } else if (f.k === "pulse") {             // the Booster's pulse washing over everyone nearby
      if (k > 0.9) { fx.splice(i, 1); continue; }
      cx.strokeStyle = C.ice; cx.globalAlpha = 0.8 * (1 - k / 0.9); cx.lineWidth = lw(3); cx.beginPath(); cx.arc(f.x, f.y, 20 + (f.r || 350) * (k / 0.9), 0, TAU); cx.stroke();
      cx.globalAlpha = 0.3 * (1 - k / 0.9); cx.lineWidth = lw(10); cx.beginPath(); cx.arc(f.x, f.y, 20 + (f.r || 350) * (k / 0.9) * 0.92, 0, TAU); cx.stroke(); cx.globalAlpha = 1;
    } else if (f.k === "hand") {
      if (k > 0.5) { fx.splice(i, 1); continue; }
      cx.globalAlpha = 1 - k / 0.5; cx.strokeStyle = C.gold; cx.lineWidth = lw(2); cx.beginPath(); cx.arc(f.x, f.y, 10 + k * 60, 0, TAU); cx.stroke(); cx.globalAlpha = 1;
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
    cx.fillStyle = party.has(s.id) ? C.gold : C.ink; cx.globalAlpha = s === hov ? 1 : 0.35;
    const rate = (s.row[13] || 0) / 10;
    cx.fillText((names.get(s.id) || "") + (rate > 0 ? " · " + rate + " cr/s" : ""), sx, sy - 40 * Math.max(0.6, zoom) - 6); cx.globalAlpha = 1;
  }
  for (const [id, x, y] of sosList) {
    const px = id === myId ? mine.x : x, py = id === myId ? mine.y : y; let [sx, sy] = toScreen(px, py); const off = sx < 16 || sy < 16 || sx > VW - 16 || sy > VH - 16;
    if (off) { const a = Math.atan2(sy - VH / 2, sx - VW / 2), k = Math.min((VW / 2 - 28) / Math.abs(Math.cos(a) || 1e-6), (VH / 2 - 28) / Math.abs(Math.sin(a) || 1e-6)); sx = VW / 2 + Math.cos(a) * k; sy = VH / 2 + Math.sin(a) * k; }
    else sy -= 40 * Math.max(0.6, zoom) + 30;     // (above the name)
    const p = 0.6 + 0.4 * Math.sin(t / 200);
    cx.fillStyle = C.signal; cx.globalAlpha = p; cx.beginPath(); cx.arc(sx, sy, 11, 0, TAU); cx.fill(); cx.globalAlpha = 1;
    cx.fillStyle = C.void; cx.font = `800 16px "Big Shoulders Display", sans-serif`; cx.fillText("!", sx, sy + 6); cx.font = `700 12px "Atkinson Hyperlegible", system-ui, sans-serif`;
  }
  if (ME.myCan) {                              // (owner, 2026-10-18) a gold arrow to my most recent can
    let [sx2, sy2] = toScreen(ME.myCan.x, ME.myCan.y);
    const off2 = sx2 < 30 || sy2 < 30 || sx2 > VW - 30 || sy2 > VH - 30, bob = Math.sin(t / 180) * 5;
    cx.save(); cx.fillStyle = C.gold; cx.strokeStyle = C.void; cx.lineWidth = 2;
    if (off2) {
      const a2 = Math.atan2(sy2 - VH / 2, sx2 - VW / 2), k2 = Math.min((VW / 2 - 46) / Math.abs(Math.cos(a2) || 1e-6), (VH / 2 - 46) / Math.abs(Math.sin(a2) || 1e-6));
      cx.translate(VW / 2 + Math.cos(a2) * (k2 + bob), VH / 2 + Math.sin(a2) * (k2 + bob)); cx.rotate(a2);
      cx.beginPath(); cx.moveTo(14, 0); cx.lineTo(-9, -10); cx.lineTo(-4, 0); cx.lineTo(-9, 10); cx.closePath(); cx.fill(); cx.stroke();
      cx.rotate(-a2); cx.fillRect(-22, -8, 13, 10); cx.strokeRect(-22, -8, 13, 10);
    } else {
      cx.translate(sx2, sy2 - 22 + bob);
      cx.beginPath(); cx.moveTo(0, 10); cx.lineTo(-10, -5); cx.lineTo(0, -1); cx.lineTo(10, -5); cx.closePath(); cx.fill(); cx.stroke();
    }
    cx.restore();
  }
  if (ME.sos) {                                // out of fuel: the screen's edges breathe signal red
    const p = 0.22 + 0.12 * Math.sin(t / 280), g = cx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.38, VW / 2, VH / 2, Math.max(VW, VH) * 0.74);
    g.addColorStop(0, "rgba(229,96,79,0)"); g.addColorStop(1, `rgba(229,96,79,${p.toFixed(3)})`);
    cx.fillStyle = g; cx.fillRect(0, 0, VW, VH);
  }
  if (sticks.move || sticks.aim) {             // the twin sticks, faint
    for (const side of ["move", "aim"]) { const s = sticks[side]; if (!s) continue;
      cx.strokeStyle = C.ink; cx.globalAlpha = 0.25; cx.lineWidth = 2; cx.beginPath(); cx.arc(s.ox, s.oy, 54, 0, TAU); cx.stroke();
      cx.fillStyle = C.ink; cx.globalAlpha = 0.4; const d = Math.min(54, hyp(s.x - s.ox, s.y - s.oy)), a = Math.atan2(s.y - s.oy, s.x - s.ox);
      cx.beginPath(); cx.arc(s.ox + Math.cos(a) * d, s.oy + Math.sin(a) * d, 20, 0, TAU); cx.fill(); cx.globalAlpha = 1; }
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
    const lead = 0.3, lx = Math.max(-140, Math.min(140, mine.vx * lead)), ly = Math.max(-140, Math.min(140, mine.vy * lead));   // (the camera looks a touch ahead)
    cam.x += (mine.x + lx - cam.x) * Math.min(1, dt * 6); cam.y += (mine.y + ly - cam.y) * Math.min(1, dt * 6);
  }
  zoom += (zoomT - zoom) * Math.min(1, dt * 11); if (Math.abs(zoomT - zoom) < 0.002) zoom = zoomT;
  shk.a *= Math.exp(-dt * 5.5); if (shk.a < 0.05) shk.a = 0; shk.x = (Math.random() * 2 - 1) * shk.a; shk.y = (Math.random() * 2 - 1) * shk.a;
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawBackground(now);
  if (G) { drawWorld(now); drawOverlay(now); drawMinimap(now); drawHudLive(now); }
  if (countAt) { const left = Math.ceil((countAt - Date.now()) / 1000); if (left <= 0) { countAt = 0; goUpdating(); } else countEl.textContent = "Update incoming — " + left + " s"; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- the HUD: my ship, the hold as a square per ore type and a bar, fuel, credits, where I am ----
$("ship-chip").addEventListener("click", toggleMode);
$("ability-btn").addEventListener("click", (e) => { sendAbility(); e.currentTarget.blur(); });
const hud = { holdRaw: $("hold-raw"), holdRef: $("hold-ref"), holdNum: $("hold-num"), fuel: $("fuel-fill"), fuelNum: $("fuel-num"), ship: $("ship-chip"), cargo: $("cargo"), credits: $("credits"), zone: $("zone") };
const elx = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text !== undefined) d.textContent = text; return d; };
const holdUsed = () => (ME.hold || []).reduce((s, e) => s + e.u * (e.raw ? 1 : G.refinedSpace), 0) + (ME.cans || []).reduce((s, c) => s + c.u, 0);
let hudKey = "";
function drawHud() {
  if (!G) return;
  const cap = ME.cap || 12;
  let raw = 0, ref = 0; for (const e of ME.hold || []) { if (e.raw) raw += e.u; else ref += e.u * G.refinedSpace; }
  const canU = (ME.cans || []).reduce((s, c) => s + c.u, 0);
  hud.holdRaw.style.width = ((raw + canU) / cap) * 100 + "%"; hud.holdRef.style.width = (ref / cap) * 100 + "%";
  hud.holdNum.textContent = (Math.round((raw + ref + canU) * 10) / 10) + " / " + cap;
  if (hud.zone.textContent !== (ME.zone || "")) { hud.zone.textContent = ME.zone || ""; hud.zone.classList.remove("zswap"); void hud.zone.offsetWidth; hud.zone.classList.add("zswap"); }
  hud.ship.textContent = myShip().name + (hasAlt() ? " · " + (myShip().drillSpeed ? (modeAlt ? "Drill" : "Mine") : (modeAlt ? "Cool" : "Boost")) : "");
  hud.ship.classList.toggle("switch", hasAlt());
  $("ability-btn").hidden = !myShip().boost;
  const key = JSON.stringify([ME.ship, ME.hold, ME.cans, modeAlt]); if (key === hudKey) return; hudKey = key;
  drawCargo();
}
// the hold (owner, 2026-10-18): one square per ore type (raw / refined / party each their own), in the ore's color with
// its own count; refined squares edged white; party ore dotted gold; cans and crates aboard are their own containers.
// Hovering a square: that square's count and worth. Right-clicking the cargo: Drop cargo (never on a hauler).
function drawCargo() {
  hud.cargo.replaceChildren(
    ...(ME.hold || []).map((e) => {
      const sq = elx("i", "slot" + (e.raw ? "" : " ref") + (e.party ? " party" : ""));
      sq.style.background = G.ores[e.o] ? G.ores[e.o].color : "#888";
      sq.appendChild(elx("b", "n", e.u > 999 ? "999+" : String(e.u)));
      sq.addEventListener("mouseenter", (ev) => showTip(ev, () => cargoTip(e)));
      sq.addEventListener("mousemove", moveTip); sq.addEventListener("mouseleave", hideTip);
      return sq;
    }),
    ...(ME.cans || []).map((c) => {
      const sq = elx("i", "can" + (c.crate ? " crate" : ""));
      sq.appendChild(elx("b", "n", c.u > 999 ? "999+" : String(c.u)));
      sq.addEventListener("mouseenter", (ev) => showTip(ev, () => (c.crate ? "Crate" : "Can") + "\n" + fmt(c.u) + " units · " + fmt(c.v) + " cr"));
      sq.addEventListener("mousemove", moveTip); sq.addEventListener("mouseleave", hideTip);
      return sq;
    }));
}
hud.cargo.addEventListener("contextmenu", (e) => {
  e.preventDefault(); if (!G || myShip().refineUnit || !(ME.hold || []).length) return;
  hideTip(); showMenu(e.clientX, e.clientY, [["Drop cargo", () => send({ t: "act", op: "drop" })]]);
});
function cargoTip(e) {
  let t2 = oreName(e.o) + (e.raw ? "" : " · refined") + "\n" + fmt(e.u) + (e.u === 1 ? " unit · " : " units · ") + fmt(e.u * (G.ores[e.o] ? G.ores[e.o].price : 0)) + " cr";
  if (e.party) t2 += "\nParty ore";
  return t2;
}
// the tooltip: one at a time, following the pointer
const tipEl = $("tip"); let tipFn = null, tipX = 0, tipY = 0;
function placeTip() { tipEl.style.left = Math.min(tipX + 14, innerWidth - tipEl.offsetWidth - 8) + "px"; tipEl.style.top = Math.max(8, tipY - tipEl.offsetHeight - 10) + "px"; }
function showTip(e, fn) { tipFn = fn; tipX = e.clientX; tipY = e.clientY; tipEl.textContent = fn(); tipEl.hidden = false; placeTip(); }
function moveTip(e) { tipX = e.clientX; tipY = e.clientY; placeTip(); }
function hideTip() { tipFn = null; tipEl.hidden = true; }
function refreshTip() { if (tipFn) { tipEl.textContent = tipFn(); placeTip(); } }
let shownCr = null, lastCrFlash = 0;
function drawHudLive(now) {
  const f = Math.max(0, ME.fuel), T = ME.tank || 100;
  hud.fuel.style.width = Math.min(100, f / T * 100) + "%"; hud.fuel.classList.toggle("low", f < T * 0.15);
  hud.fuelNum.textContent = Math.round(f) + " / " + T;
  const ab = $("ability-btn");
  if (!ab.hidden) { const cd = ME.abilityIn || 0; ab.disabled = cd > 0; ab.textContent = cd > 0 ? String(cd) : "BOOST"; }
  const target = ME.credits || 0;              // (owner, 2026-10-17: credits count toward their new value and flash on a gain)
  if (shownCr === null) { shownCr = target; hud.credits.textContent = fmt(target); }
  else if (shownCr !== target) {
    if (target > shownCr && now - lastCrFlash > 700) { lastCrFlash = now; hud.credits.classList.remove("flash"); void hud.credits.offsetWidth; hud.credits.classList.add("flash"); }
    const d = target - shownCr; shownCr = Math.abs(d) < 1 ? target : shownCr + d * 0.16;
    hud.credits.textContent = fmt(Math.round(shownCr));
  }
}

// ---- the station panel (docked): the five ships, one to board, and fuel ----
const stEl = $("station");
const SHIP_STATS = {                           // what each ship's row shows, from its live numbers (every ship has a laser)
  miner: [["Laser", "laserDps", (v) => v + " / s"], ["Reach", "laserRange", (v) => v + " m"]],
  scanner: [["Laser", "laserDps", (v) => v + " / s"], ["Drill", "drillSpeed", (v) => v + " m/s"], ["Drill reach", "drillRange", (v) => v + " m"], ["Vision", "vision", (v) => fmt(v) + " m"], ["Tow reach", "towRange", (v) => v + " m"]],
  booster: [["Laser", "laserDps", (v) => v + " / s"], ["Boost", "boost", (v) => "×" + v], ["Pulse reach", "boostRange", (v) => v + " m"], ["Pulse", "boostDur", (v) => v + " s"], ["Cooldown", "boostCd", (v) => v + " s"]],
  fueler: [["Laser", "laserDps", (v) => v + " / s"], ["Pump", "pump", (v) => v + " / s"], ["Reach", "pumpRange", (v) => v + " m"]],
  hauler: [["Laser", "laserDps", (v) => v + " / s"], ["Refines", "refineUnit", (v) => "1 / " + v + " s"]],
};
let stKey = "";
function drawStation_() {
  stEl.hidden = !ME.docked; if (!ME.docked) { amtBox.hidden = true; return; } if (!G) return;
  const key = JSON.stringify([ME.ship, ME.credits, Math.round(ME.fuel), ME.tank, ME.storage, G.ships]); if (key === stKey) return; stKey = key;
  const btn = (label, op, disabled = false, cls = "") => { const b = elx("button", cls, label); b.type = "button"; b.disabled = disabled; b.addEventListener("click", () => { send({ t: "st", ...op }); b.blur(); }); return b; };
  const head = elx("div", "st-head");
  head.append(elx("span", "st-title", "Station"), elx("span", "st-cr", fmt(ME.credits)));
  const sec1 = elx("section"); sec1.appendChild(elx("h3", null, "Ships"));
  for (const k of G.kinds) {
    const S = G.ships[k], aboard = ME.ship === k, card = elx("div", "st-ship" + (aboard ? " aboard" : ""));
    const h2 = elx("div", "st-ship-head"); h2.append(elx("span", "st-ship-name", S.name), aboard ? elx("span", "st-tag", "Aboard") : btn("Board", { op: "ship", k }, false, "gold"));
    const st = elx("div", "st-stats");
    for (const [label, stat, f] of [["Hold", "hold", (v) => v + " units"], ["Tank", "tank", (v) => fmt(v)], ["Speed", "speed", (v) => v + " m/s"], ...SHIP_STATS[k]]) {
      if (S[stat] === undefined) continue; st.append(elx("span", null, label), elx("b", null, f(S[stat])));
    }
    card.append(h2, st); sec1.appendChild(card);
  }
  const sec2 = elx("section"); sec2.appendChild(elx("h3", null, "Storage"));
  const entries = Object.entries(ME.storage || {}).filter(([, u]) => u > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) sec2.appendChild(elx("p", "st-empty", "Empty"));
  for (const [o, u] of entries) {
    const row = elx("div", "st-row"), sw = elx("span", "st-sw"); sw.style.background = G.ores[o] ? G.ores[o].color : "#888"; sw.style.borderRadius = "3px";
    const sell = elx("button", "", "Sell"); sell.type = "button";
    sell.addEventListener("click", () => askAmount("Sell " + oreName(o), "Sell", 1, u, u, (c) => fmt(c * (G.ores[o] ? G.ores[o].price : 0)) + " cr", (c) => send({ t: "st", op: "sell", o, n: c })));
    row.append(sw, elx("span", "st-name", oreName(o)), elx("span", "st-n", fmt(u)), sell);
    sec2.appendChild(row);
  }
  const sec3 = elx("section"); sec3.appendChild(elx("h3", null, "Fuel"));
  { const space = Math.max(0, ME.tank - ME.fuel), cost = Math.ceil(space * G.fuel.stationPrice), row = elx("div", "st-row");
    row.append(elx("span", "st-sw"), elx("span", "st-name", "Tank"), elx("span", "st-n", Math.round(ME.fuel) + " / " + ME.tank), btn("Fill " + fmt(cost), { op: "fuel" }, space < 1 || ME.credits < G.fuel.stationPrice, "gold"));
    sec3.appendChild(row); }
  stEl.replaceChildren(head, sec2, sec1, sec3);
}
stEl.addEventListener("mousedown", (e) => e.stopPropagation());
// the crate unlock slider: the share a deliverer outside the party keeps, locked at pickup
const amtBox = $("amount-box"), amtRange = $("amount-range"); let amtDo = null, amtWorth = null, amtMax = 1;
function askAmount(title, label, min, max, start, worth, go) {
  amtMax = max; amtWorth = worth; amtDo = go;
  $("amount-title").textContent = title; $("amount-go").textContent = label;
  amtRange.min = min; amtRange.max = max; amtRange.value = start; amtRange.disabled = max <= min;
  drawAmount(); amtBox.hidden = false; amtRange.focus();
}
function drawAmount() { const c = +amtRange.value; $("amount-n").textContent = c + " / " + amtMax; $("amount-worth").textContent = amtWorth(c); }
amtRange.addEventListener("input", drawAmount);
$("amount-go").addEventListener("click", () => { if (amtDo) amtDo(+amtRange.value); amtBox.hidden = true; });
$("amount-cancel").addEventListener("click", () => { amtBox.hidden = true; });
amtBox.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") amtBox.hidden = true; if (e.key === "Enter") $("amount-go").click(); });
amtBox.addEventListener("mousedown", (e) => e.stopPropagation());

// ---- my party, top left ----
const partyEl = $("party");
function drawParty() {
  const out = [];
  if (SOC.party) {
    const box = elx("div", "pt-list"); box.appendChild(elx("div", "pt-head", "Party"));
    for (const [id, n] of SOC.party.members) {
      const r = elx("div", "pt-mem" + (id === SOC.party.leader ? " lead" : ""), n); box.appendChild(r);
      if (id !== myId) r.addEventListener("contextmenu", (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, [["Whisper", () => whisperTo(id, n)], ...socialItems(id)]); });
    }
    out.push(box);
  }
  partyEl.replaceChildren(...out); partyEl.hidden = !out.length;
}

// ---- the minimap: the whole ring system, north up; the station, my ship, ships near me, my party, distress ----
const mm = $("minimap"), mx = mm.getContext("2d");
let mmZoom = 1; try { const z = +localStorage.getItem("atamus.mmZoom"); if (z >= 1 && z <= 12) mmZoom = z; } catch {}
mm.addEventListener("wheel", (e) => { e.preventDefault(); e.stopPropagation(); mmZoom = Math.min(12, Math.max(1, mmZoom * (e.deltaY > 0 ? 0.8 : 1.25))); try { localStorage.setItem("atamus.mmZoom", String(mmZoom)); } catch {} }, { passive: false });
let mmNext = 0, mmView = null;
// (owner, 2026-10-16) hovering the minimap names the zone under the pointer
function zoneAt(x, y) {
  const W = G.world, r = hyp(x, y); if (r < W.safeR) return "Station"; if (r > W.lockedR) return "";
  let ring = W.rings.length;                   // the nearest ring band (the gaps split halfway), as the server
  for (let i = 0; i < W.rings.length; i++) { const next = W.rings[i + 1]; if (!next || r < (W.rings[i][1] + next[0]) / 2) { ring = i + 1; break; } }
  return "Ring " + ring + " · " + G.sectorNames[G.sectors[sectorOf(x, y)]];
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
  mx.strokeStyle = C.signal; mx.lineWidth = 1; mx.setLineDash([4, 3]); mx.beginPath(); mx.arc(c0, c1, W.lockedR * k, 0, TAU); mx.stroke(); mx.setLineDash([]);
  mx.fillStyle = "#cfa15a"; mx.beginPath(); mx.arc(c0, c1, Math.max(3, W.saturnR * k), 0, TAU); mx.fill();
  { const [sx, sy] = P(W.station[0], W.station[1]); mx.fillStyle = C.gold; mx.fillRect(sx - 2.5, sy - 2.5, 5, 5); }
  const party = new Set(SOC.party ? SOC.party.members.map((m) => m[0]) : []);
  for (const s of ships.values()) if (s.id !== myId && s.near) { const [x, y] = P(s.x, s.y); mx.fillStyle = party.has(s.id) ? C.gold : C.ink; mx.beginPath(); mx.arc(x, y, 2, 0, TAU); mx.fill(); }
  for (const [, x, y] of mates) { const [px, py] = P(x, y); mx.fillStyle = C.gold; mx.strokeStyle = C.void; mx.lineWidth = 1; mx.beginPath(); mx.arc(px, py, 3, 0, TAU); mx.fill(); mx.stroke(); }   // (my party, anywhere)
  for (const [x, y] of marks) { const [px, py] = P(x, y); mx.save(); mx.translate(px, py); mx.rotate(Math.PI / 4); mx.fillStyle = C.gold; mx.strokeStyle = C.void; mx.lineWidth = 1; mx.fillRect(-3.4, -3.4, 6.8, 6.8); mx.strokeRect(-3.4, -3.4, 6.8, 6.8); mx.restore(); }   // marked rocks (mine and my party's)
  for (const [id, x, y] of sosList) { const [px, py] = P(x, y); mx.fillStyle = C.signal; mx.beginPath(); mx.arc(px, py, 4 + Math.sin(now / 200), 0, TAU); mx.fill(); void id; }
  { const [x, y] = P(mine.x, mine.y), h = mine.h; mx.fillStyle = C.ice; mx.beginPath(); mx.moveTo(x + Math.sin(h) * 6, y - Math.cos(h) * 6); mx.lineTo(x - Math.cos(h) * 3.5 - Math.sin(h) * 3, y - Math.sin(h) * 3.5 + Math.cos(h) * 3); mx.lineTo(x + Math.cos(h) * 3.5 - Math.sin(h) * 3, y + Math.sin(h) * 3.5 + Math.cos(h) * 3); mx.closePath(); mx.fill(); }
  mx.restore();
  mx.strokeStyle = C.rule; mx.lineWidth = 1.5; mx.beginPath(); mx.arc(Wd / 2, Hd / 2, R + 3, 0, TAU); mx.stroke();
  mx.font = `800 11px "Big Shoulders Display", sans-serif`; mx.textAlign = "center";
  [["N", 0, -1], ["E", 1, 0], ["S", 0, 1], ["W", -1, 0]].forEach(([l, a, b]) => { mx.fillStyle = C.ink; mx.fillText(l, Wd / 2 + a * (R - 8), Hd / 2 + b * (R - 8) + 4); });
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
// switches the channel (World -> Zone -> Party -> Whisper). Commands: /w Name message, /party invite Name, /party accept,
// /party leave, /rate N (a support ship posts its per-second charge; /rate 0 clears it). Right-click a name: Whisper,
// Invite to party, Report, and for staff Admin. ----
const chatLog = $("chat-log"), chatIn = $("chat-in"), chatTabs = $("chat-tabs"), chatPre = $("chat-pre"), ctxMenu = $("ctx-menu");
const TABS = [["all", "All"], ["global", "World"], ["zone", "Zone"], ["party", "Party"], ["whisper", "Whisper"]];
const CH_NAME = { global: "World", zone: "Zone", party: "Party", whisper: "Whisper" };
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
function cycleChannel() { const chans = ["global", "zone", ...(SOC.party ? ["party"] : []), ...(lastWhisper ? ["whisper"] : [])]; chatCh = chans[(chans.indexOf(chatCh) + 1) % chans.length]; drawPrefix(); }
function openChat() { keys.clear(); firing = false; chatIn.focus(); drawPrefix(); }
function sendChat() {
  const raw = chatIn.value; chatIn.value = ""; chatIn.blur(); const text = raw.trim(); if (!text) return;
  const w = /^\/(?:w|whisper)\s+(?:"([^"]+)"|(\S+))\s+([\s\S]+)$/i.exec(text); if (w) { send({ t: "chat", ch: "whisper", toName: w[1] || w[2], text: w[3] }); return; }
  const p = /^\/party\s+(\w+)\s*(.*)$/i.exec(text); if (p) { const op = p[1].toLowerCase(), arg = p[2].trim(); send({ t: "party", op, ...(arg ? { name: arg } : {}) }); return; }
  const inv = /^\/invite\s+(.+)$/i.exec(text); if (inv) { send({ t: "party", op: "invite", name: inv[1].trim() }); return; }
  const rt = /^\/rate\s+([\d.]+)$/i.exec(text); if (rt) { send({ t: "act", op: "rate", v: +rt[1] }); return; }
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
  if (TOUCH && !document.body.classList.contains("chat-open") && m.i !== myId) $("chat-toggle").classList.add("new");
  drawTabs();
}
drawTabs();
function hideMenu() { ctxMenu.hidden = true; }
function showMenu(x, y, items) {               // items: [label, fn]
  ctxMenu.replaceChildren(...items.map(([label, fn]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.addEventListener("click", () => { hideMenu(); fn(); }); return b; }));
  ctxMenu.hidden = false; ctxMenu.style.left = Math.min(x, innerWidth - 180) + "px"; ctxMenu.style.top = Math.min(y, innerHeight - ctxMenu.offsetHeight - 8) + "px";
}
const whisperTo = (id, name) => { lastWhisper = { id, name }; chatCh = "whisper"; openChat(); };
// a name in chat: Whisper, Invite to party, Report (and Admin for staff)
chatLog.addEventListener("contextmenu", (e) => {
  e.preventDefault(); const who = e.target.closest && e.target.closest(".chat-who[data-id]"); if (!who) return;
  const id = who.dataset.id, name = who.dataset.name;
  showMenu(e.clientX, e.clientY, [["Whisper", () => whisperTo(id, name)], ...socialItems(id), ["Report", () => openReport(id, name)],
    ...(amStaff && window.AdminPanel ? [["Admin", () => window.AdminPanel.act(id, name)]] : [])]);
});
function socialItems(id) {
  const inParty = !!(SOC.party && SOC.party.members.some((m) => m[0] === id)), out = [];
  if (!inParty) out.push(["Invite to party", () => send({ t: "party", op: "invite", to: id })]);
  else if (SOC.party.leader === myId) out.push(["Kick from party", () => send({ t: "party", op: "kick", to: id })]);
  return out;
}
// another ship: Whisper, party, then what my ship can do for it (fuel, boost), and hiring their posted service
function shipMenu(s, x, y) {
  const id = s.id, name = names.get(id) || "?", r = s.row, S = myShip(), items = [["Whisper", () => whisperTo(id, name)], ...socialItems(id)];
  if (S.pump) items.push([ME.pump === id ? "Stop fueling" : "Fuel ship", () => send({ t: "act", ship: id, op: "pump" })]);
  const theirRate = (r[13] || 0) / 10, inParty = !!(SOC.party && SOC.party.members.some((m) => m[0] === id));
  if (ME.hire === id) items.push(["Stop hiring", () => send({ t: "act", ship: id, op: "hire" })]);
  else if (theirRate > 0 && !inParty) items.push(["Hire · " + theirRate + " cr/s", () => send({ t: "act", ship: id, op: "hire" })]);
  items.push(["Report", () => openReport(id, name)]);
  showMenu(x, y, items);
}
// a can or crate: pick it up; my own crate also offers unlocking it for outside haulers (the share locks at pickup)
function canMenu(o, x, y) {
  const items = [["Pick up", () => send({ t: "act", can: o.id })]];
  const mineCrate = (ME.myCrates || []).find((c) => c.id === o.id);
  if (mineCrate) items.push(["Unlock for outsiders", () => {
    const lo = Math.round(G.crateShare[0] * 100), hi = Math.round(G.crateShare[1] * 100);
    askAmount("Deliverer's share", "Unlock", lo, hi, mineCrate.share != null ? Math.round(mineCrate.share * 100) : lo, (c) => c + " %", (c) => send({ t: "act", op: "unlock", canId: o.id, share: c / 100 }));
  }]);
  showMenu(x, y, items);
}
// Accept / Decline prompts, one at a time, top center (party invites); each lapses on its own
const promptBox = $("prompt-box"), prompts = [];
function pushPrompt(text, yes, no, secs) { prompts.push({ text, yes, no, until: Date.now() + secs * 1000 }); drawPrompt(); }
function drawPrompt() {
  while (prompts.length && prompts[0].until < Date.now()) prompts.shift();
  const p = prompts[0]; promptBox.hidden = !p; if (p) $("prompt-text").textContent = p.text;
}
setInterval(drawPrompt, 1000);
function answerPrompt(yes) { const p = prompts.shift(); if (p) (yes ? p.yes : p.no)(); drawPrompt(); }
$("prompt-yes").addEventListener("click", () => answerPrompt(true)); $("prompt-no").addEventListener("click", () => answerPrompt(false));
function showInvite(m) { pushPrompt((m.name || "?") + " invited you to a party", () => send({ t: "party", op: "accept" }), () => send({ t: "party", op: "decline" }), 120); }
addEventListener("pointerdown", (e) => { if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) hideMenu(); }, true);
const reportBox = $("report-box"); let reportFor = null;
function openReport(id, name) { reportFor = id; $("report-title").textContent = "Report " + name; $("report-text").value = ""; reportBox.hidden = false; keys.clear(); $("report-text").focus(); }
$("report-text").addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") reportBox.hidden = true; });
$("report-cancel").addEventListener("click", () => { reportBox.hidden = true; });
$("report-send").addEventListener("click", () => { const text = $("report-text").value.trim(); if (!text || !reportFor) return; send({ t: "report", i: reportFor, text }); reportBox.hidden = true; });

// ---- (owner, 2026-10-17) the developer panel (head admin and admins): every number of the world, the ships, chunks and
// rocks, ores, cans and the economy, changed live for everyone; the server keeps them ----
const devEl = $("dev"); let devTab = "world", devArmed = 0, devShipK = "miner", devSize = 0;
const DEV_TABS = [["world", "World"], ["ships", "Ships"], ["rocks", "Rocks"], ["ores", "Ores"], ["economy", "Economy"]];
const DEV_LABELS = { saturnR: "Saturn radius", safeR: "Safe zone radius", lockedR: "Locked line radius", loadR: "Load circle", cell: "Asteroid cell",
  hold: "Hold", tank: "Tank", speed: "Speed", laserDps: "Laser / s", laserRange: "Laser reach", burn: "Fuel / min working", vision: "Vision",
  drillSpeed: "Drill speed", drillBed: "Drill bedrock ×", drillShock: "Drill collateral / s", drillRange: "Drill reach",
  towRange: "Tow reach", towBurn: "Tow fuel / min", towPull: "Tow pull", towLeash: "Tow leash",
  boost: "Boost ×", boostRange: "Pulse reach", boostDur: "Pulse s", boostCd: "Pulse cooldown s", boostFuel: "Pulse fuel", pump: "Pump / s", pumpRange: "Pump reach", refineUnit: "Seconds a refined unit",
  accel: "Acceleration", brake: "Braking", turn: "Turn rate", crawl: "Crawl share", flyBurn: "Fuel / min flying", interactR: "Reach", shipR: "Bump radius",
  burst: "Burst share", hpK: "Health per area", wSoft: "Soft %", wNormal: "Normal %", wDense: "Dense %", wUltra: "Ultra %", wBed: "Bedrock %",
  soft: "Soft health ×", dense: "Dense health ×", ultra: "Ultra health ×", bed: "Bedrock health ×", oreUnit: "Units per ore drop", denseOre: "Dense extra ore", ultraOre: "Ultra extra ore", bedOre: "Bedrock extra ore", barren: "Barren share",
  rate: "Heat / s mined", hSoft: "Soft heat ×", hNormal: "Normal heat ×", hDense: "Dense heat ×", hUltra: "Ultra heat ×", hBed: "Bedrock heat ×",
  spread: "Neighbor heat share", cool: "Chunk cooling / s", coreCool: "Core cooling / s", coreK: "Core heat per break ×", coolBeam: "Coolant beam / s",
  chunks: "Chunks", shells: "Shells", radius: "Radius", coreR: "Core radius", rareMax: "Rare ore at full strip", coreHp: "Core health", oreTypes: "Ore types",
  grow: "Core swell share", fastBreak: "Full-core break ×", rarePrice: "Rare ore price",
  linger: "Lasts after last touch s", respawn: "Respawn s", reseed: "Reseed s", spawnChance: "Rock chance per cell",
  price: "Price", lock: "Can locked s", public: "Can public s", hourUTC: "Downtime hour (UTC)", logoffGuard: "Logoff guard s",
  stationPrice: "Station fuel price", startCredits: "Starting credits", startFuel: "Starting fuel", dockR: "Docking radius",
  maxRate: "Highest rate cr/s", range: "Service range", partyMax: "Party size" };
const devLabel = (k) => DEV_LABELS[k] || k;
// (owner, 2026-10-17) what each number does, shown in a wrapped window over its name
const DEV_HELP = {
  "world.saturnR": "Saturn's radius in meters: nothing flies inside it.", "world.safeR": "Radius of the open zone around Saturn and the station.",
  "world.rings": "The ring's inner and outer radius in meters. Asteroids only exist between them; changing this regrows them all.",
  "world.lockedR": "The red dashed line's radius: nobody flies past it.", "world.loadR": "The hard cap, in meters, on how far around each player the server sends anything.",
  "world.cell": "The asteroid grid's cell size in meters (each cell rolls one rock slot from the seed); changing it regrows the field.",
  "fly.accel": "How fast every ship speeds up while thrusting, in m/s each second.", "fly.brake": "How fast a ship slows when no key is held, in m/s each second.",
  "fly.turn": "How fast a ship turns, in radians a second (about 57° each).", "fly.crawl": "With an empty tank a ship still moves at this share of its speed.",
  "fly.flyBurn": "Fuel used a minute while thrusting at full power.", "fly.interactR": "Reach in meters for picking up cans (the dotted circle).", "fly.shipR": "A ship's size for bumping into asteroids, in meters.",
  "ships.hold": "Cargo units this ship's hold carries (a refined unit takes a fifth of the room).", "ships.tank": "Fuel this ship's tank holds.", "ships.speed": "This ship's top speed in m/s.",
  "ships.laserDps": "Chunk damage a second from this ship's laser — every ship has one; the Miner's is the strong one.", "ships.laserRange": "How far this ship's laser reaches, in meters.", "ships.burn": "Fuel used a minute while this ship's gear works.",
  "ships.vision": "How far this ship sees, in meters: nothing beyond it is sent or shown (the fog of war).",
  "ships.drillSpeed": "Meters a second the drill bores into the rock, revealing each chunk the head passes (it takes no ore; the ship can't move while drilled in).",
  "ships.drillBed": "The drill's speed through bedrock, as a share of its normal speed.",
  "ships.drillShock": "While the drill grinds bedrock, every chunk touching that bedrock loses this share of its maximum health a second — and anything broken that way loses its ore.",
  "ships.drillRange": "How near the rock's surface the ship must be to drill in.",
  "ships.towRange": "How far the Scanner can latch onto an asteroid to tow it.", "ships.towBurn": "Towing fuel a minute, before the size cost (× (1 + radius / 60)).",
  "ships.towPull": "How quickly a towed asteroid catches up to its place behind the ship.", "ships.towLeash": "Gap in meters between the ship and the towed asteroid.",
  "ships.boost": "Boosted mining is multiplied by this (and only boosted lasers cut bedrock).", "ships.boostRange": "How far the pulse reaches, in meters — everyone inside is boosted.",
  "ships.boostDur": "Seconds a pulse's boost lasts on each ship it caught.", "ships.boostCd": "Seconds between pulses.", "ships.boostFuel": "Fuel one pulse burns.",
  "ships.pump": "Fuel pumped into another ship each second.", "ships.pumpRange": "How far the Fueler reaches a ship to fuel it.",
  "ships.refineUnit": "Seconds the Hauler's onboard refinery takes to compress one raw unit while flying (refined units take a fifth of the room; the value stays the same).",
  "chunk.burst": "Breaking a chunk shocks every touching chunk for this share of its maximum health; chains cascade.",
  "chunk.hpK": "A chunk's health is its area in m² times this, times its density multiplier.",
  "chunk.wSoft": "Weight of soft chunks when a rock is built (against the other weights).", "chunk.wNormal": "Weight of normal chunks.", "chunk.wDense": "Weight of dense chunks.", "chunk.wUltra": "Weight of ultra chunks.", "chunk.wBed": "Weight of bedrock, which never breaks (about one in seven at 14).",
  "chunk.soft": "A soft chunk's health multiplier.", "chunk.dense": "A dense chunk's health multiplier (it also holds extra ore).", "chunk.ultra": "An ultra chunk's health multiplier (it also holds extra ore).",
  "chunk.bed": "Bedrock's health multiplier, for the lasers that can cut it: a boosted miner's, or a Booster's own (slowly). Everyone else's laser just wears it bare.",
  "chunk.denseOre": "Extra ore units in a dense ore chunk (the base is 1).", "chunk.ultraOre": "Extra ore units in an ultra ore chunk.",
  "chunk.bedOre": "Extra ore units in a bedrock chunk (always ore, base + this) — banked only when a boosted laser breaks it; broken any other way, it's lost.",
  "chunk.barren": "Share of breakable chunks with no ore: plain stone that still has to be cleared.",
  "rockSizes.chunks": "Chunks this size of rock is built from, on average (spread over the shells' circumferences).",
  "rockSizes.shells": "Shells of masonry around the core; thick shells split into stacked towers, so the depth at one angle runs a little past this.",
  "rockSizes.radius": "The rock's radius in meters: the shells divide the room between the core and this edge.",
  "rockSizes.coreR": "The core's radius in meters before it swells.",
  "rockSizes.rareMax": "Rare core ore paid at a full strip (scaled down by every chunk still attached at the pop).", "rockSizes.coreHp": "The core's health (it breaks up to ×4 faster as it fills).",
  "rockSizes.oreTypes": "How many ore types this size of rock holds (1 to 3).",
  "core.grow": "How much the core swells as ore banks into it (0.5 = half again its size when full).", "core.fastBreak": "How many times faster a full core breaks.", "core.rarePrice": "Credits a unit of the core's rare ore.",
  "rock.linger": "Seconds a part-mined rock lasts after it was last touched, however far out it is.", "rock.respawn": "Seconds before a popped rock's slot re-rolls somewhere else.",
  "rock.reseed": "Seconds between reshuffles of the untouched field.", "rock.spawnChance": "The chance each grid cell holds a rock.",
  "ringSizes": "The smallest and largest rock size in this ring (0 small, 1 medium, 2 large).",
  "ringBed": "This ring's bedrock weight multiplier: deeper rings run heavier with bedrock.",
  "ringSpawn": "This ring's rock chance multiplier on the cell spawn chance: deeper rings roll rocks rarer.",
  "ringFree": "1: every rock in this ring keeps a bedrock-free line to the core. 0: no guarantee — cores can roll bedrock-encapsulated.",
  "ores.price": "Credits one unit fetches when its owner sells it from station storage (delivery itself pays in ore, not money).",
  "chunk.oreUnit": "Units in one ore drop (100: any split lands on clean percents).",
  "heat.rate": "Heat a second the mined chunk gains, times its density's heat factor (a boosted laser heats times its boost).",
  "heat.hSoft": "A soft chunk's heat factor.", "heat.hNormal": "A normal chunk's heat factor.", "heat.hDense": "A dense chunk's heat factor.", "heat.hUltra": "An ultra chunk's heat factor.", "heat.hBed": "Bedrock's heat factor — lucrative, but it runs hottest.",
  "heat.spread": "The share of the mined chunk's heating that leaks into each chunk touching it.",
  "heat.cool": "Heat a second a chunk sheds on its own — mine a bit, let it cool, mine another.",
  "heat.coreCool": "Heat a second the core sheds on its own.",
  "heat.coreK": "Core heat gained per broken chunk, times the chunk's heat at the moment it broke.",
  "heat.burn": "Share of its health an overheated core (heat at 1) burns a second — left alone, it pops early and everything still attached is lost.",
  "heat.coolBeam": "Heat a second the Booster's coolant beam pulls out of the chunk it touches, or the core down a bore.",
  "cans.lock": "Seconds a can stays locked to its owner before it turns public.", "cans.public": "Seconds a public can sits before it's gone.",
  "crateShare": "The unlock slider's ends: the share of a crate's value a deliverer outside the party keeps (locked at pickup).",
  "downtime.hourUTC": "The daily downtime hour (UTC), when party crates auto-deliver.", "downtime.logoffGuard": "Crates aboard a ship logged off this many seconds before downtime wait for it instead.",
  "fuel.stationPrice": "Credits for one unit of fuel at the station.",
  "econ.startCredits": "Credits a new player starts with.", "econ.startFuel": "Fuel a new player starts with.", "econ.dockR": "How close to the station a ship is docked (delivers everything aboard, opens the panel).",
  "services.maxRate": "The most a support ship may charge strangers, in credits a second.", "services.range": "How near the payer must be for a hired service to charge.",
  "limits.partyMax": "Most players in a party.",
};
function devHelp(path) {
  const [root, a, b] = path;
  if (root === "ships") return DEV_HELP["ships." + b];
  if (root === "rockSizes") return DEV_HELP["rockSizes." + b];
  if (root === "ores") return DEV_HELP["ores." + b];
  if (root === "ringSizes" || root === "ringBed" || root === "ringSpawn" || root === "ringFree" || root === "crateShare") return DEV_HELP[root];
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
function devNumbers(root, obj) { return Object.keys(obj).filter((k) => typeof obj[k] === "number").map((k) => devRow(devLabel(k), devInput([root, k]))); }
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
      ...G.world.rings.map((pair, i) => devRow("Ring " + (i + 1) + " (inner · outer)", devInput(["world", "rings", i, 0]), devInput(["world", "rings", i, 1]))),
      devRow("Locked line radius", devInput(["world", "lockedR"])), devRow("Load circle", devInput(["world", "loadR"])), devRow("Asteroid cell", devInput(["world", "cell"])),
    ]));
    out.push(devGroup("Flying (every ship)", devNumbers("fly", G.fly)));
  } else if (devTab === "ships") {             // a ship at a time: every number it works with
    const pick = elx("div", "dev-pick"); for (const k of G.kinds) { const b = elx("button", k === devShipK ? "on" : "", G.ships[k].name); b.type = "button"; b.addEventListener("click", () => { devShipK = k; devDraw(); }); pick.appendChild(b); }
    const S = G.ships[devShipK], rows = Object.keys(S).filter((k) => typeof S[k] === "number").map((k) => devRow(devLabel(k), devInput(["ships", devShipK, k])));
    const g = devGroup(S.name, rows); g.insertBefore(pick, g.children[1]); out.push(g);
  } else if (devTab === "rocks") {
    out.push(devGroup("Chunks", devNumbers("chunk", G.chunk)));
    const pick = elx("div", "dev-pick"); G.rockSizes.forEach((sz, i) => { const b = elx("button", i === devSize ? "on" : "", sz.name); b.type = "button"; b.addEventListener("click", () => { devSize = i; devDraw(); }); pick.appendChild(b); });
    const SZ = G.rockSizes[devSize], rows = Object.keys(SZ).filter((k) => typeof SZ[k] === "number").map((k) => devRow(devLabel(k), devInput(["rockSizes", devSize, k])));
    const g = devGroup(SZ.name + " rocks", rows); g.insertBefore(pick, g.children[1]); out.push(g);
    out.push(devGroup("The core", devNumbers("core", G.core)));
    out.push(devGroup("Heat", devNumbers("heat", G.heat)));
    out.push(devGroup("The field", devNumbers("rock", G.rock)));
    out.push(devGroup("Rings", G.ringSizes.flatMap((pair, i) => [
      devRow("Ring " + (i + 1) + " sizes (min · max)", devInput(["ringSizes", i, 0]), devInput(["ringSizes", i, 1])),
      devRow("Ring " + (i + 1) + " bedrock ×", devInput(["ringBed", i])),
      devRow("Ring " + (i + 1) + " rock chance ×", devInput(["ringSpawn", i])),
      devRow("Ring " + (i + 1) + " clear line (0 · 1)", devInput(["ringFree", i])),
    ])));
  } else if (devTab === "ores") {
    for (const o of ORE_KEYS) out.push(devGroup(G.ores[o].name, Object.keys(G.ores[o]).filter((k) => typeof G.ores[o][k] === "number").map((k) => devRow(devLabel(k), devInput(["ores", o, k])))));
    out.push(devGroup("Cans", devNumbers("cans", G.cans)));
    out.push(devGroup("Crate unlock share (low · high)", [devRow("Share", devInput(["crateShare", 0]), devInput(["crateShare", 1]))]));
  } else {
    out.push(devGroup("Economy", devNumbers("econ", G.econ)), devGroup("Fuel", devNumbers("fuel", G.fuel)),
      devGroup("Services", devNumbers("services", G.services)), devGroup("Downtime", devNumbers("downtime", G.downtime)), devGroup("Limits", devNumbers("limits", G.limits)));
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

connect();

// for the test harness and the console
window.Atamus = {
  get me() { return { ...mine, id: myId }; }, get state() { return ME; }, get soc() { return SOC; }, get sos() { return sosList; }, get mates() { return mates; }, get game() { return G; },
  get rocks() { return [...rocks.values()].map((r) => ({ id: r.id, x: r.x, y: r.y, size: r.size, r: r.r, fill: r.fill, hp: r.hp, tow: r.tow, heat: r.heat || 0 })); },
  chunks: (id) => details.get(id) || null,
  get cans() { return [...cans.values()].map((o) => ({ id: o.id, x: o.x, y: o.y, crate: o.crate, st: o.st })); },
  get ships() { return [...ships.values()].filter((s) => s.row).map((s) => ({ id: s.id, x: s.x, y: s.y, near: s.near, ship: G && G.kinds[s.row[4]], fl: s.row[5], len: s.row[7], rate: (s.row[13] || 0) / 10, drill: s.row[5] & 16 ? { rock: s.row[8], depth: s.row[14] || 0 } : null })); },
  screenOf: (x, y) => { const [sx, sy] = toScreen(x, y); return { x: sx, y: sy }; }, send: (o) => send(o), get zoom() { return zoom; }, set zoom(z) { zoom = zoomT = z; },
  get marks() { return marks; }, get mode() { return modeAlt; }, set mode(v) { modeAlt = !!v; drawHud(); },
};
