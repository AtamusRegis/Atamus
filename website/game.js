// Atamus: Crack, Bank and Haul — the sandbox build live (owner, 2026-10-18). One shared world seen from above: Saturn in
// the middle, the station beside it, three asteroid rings, the locked line past them. Asteroids are hidden masonry,
// thicker and heavier with bedrock deeper in the rings. The beam itself runs blue, yellow, red — only its hot stages
// heat the rock; the Miner overcharges breaking chunks into blasts; the Booster boosts one ship at a time with a held
// beam (green pluses) or cools with a spray; the Hauler refines its own cargo and other ships'. Overflow ore drifts as
// free-for-all drops, picked up by flying over. No chat, no panels beyond the station, no fuel, no money: delivery pays
// ore into station storage. W / S thrust along the nose, A / D turn, Q / E strafe; the mouse aims; the left button holds
// the beam; the right button opens menus; F flips the mode switch; the wheel zooms. On a phone: twin sticks. The server
// decides everything; this page predicts my own ship with the same numbers and draws the rest.
import { C, ART, shipLayout, drawShip, drawStation, drawSaturn } from "./shipart.js?v=1792500001";

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
let myId = null, myName = "", haveMe = false;
const mine = { x: 0, y: 0, vx: 0, vy: 0, h: 0 };
const corr = { x: 0, y: 0 }, errS = { x: 0, y: 0 };
let ME = { cap: 1200, hold: [], docked: 0, ship: "miner", tow: 0, drill: 0, zone: "", storage: {}, boost: 0, mark: 0 };
const ships = new Map();                       // id -> { id, buf, row, x, y, h, near }
const rocks = new Map();                       // id -> { id, x, y, shells, r, broken, hp, tow, heat, fill, dx, dy }
const details = new Map();                     // id -> { v, coreR, c: [[i, r0, r1, a0, a1, bits, d, ore, st, hq]], polys }
const dropsM = new Map();                      // id -> { id, x, y, ore, units, ph, dx, dy }
const names = new Map();                       // id -> name (the roster)
const fx = [];
const parts = [];
// (owner, 2026-10-18) the ship sheet's sprites, one per kind (drawn crisp; the vector art stands in until one loads)
const SPRITES = {};
// (owner, 2026-10-18) marked on the ship sheet: each ship turns around its pivot (pink) — [along from the stern, across
// from the top] as fractions of the sprite — and exhausts from its engines (red), each a fraction across the stern
const SPRITE_META = {
  miner:   { pivot: [0.408, 0.483], engines: [0.191, 0.483, 0.775] },
  scanner: { pivot: [0.343, 0.496], engines: [0.368, 0.617] },
  booster: { pivot: [0.423, 0.488], engines: [0.468, 0.548] },
  hauler:  { pivot: [0.405, 0.504], engines: [0.147, 0.368, 0.500, 0.635, 0.868] },
};
for (const k of ["miner", "scanner", "booster", "hauler"]) { const im = new Image(); im.src = "assets/ships/" + k + ".png?v=2"; SPRITES[k] = im; }
// (owner, 2026-10-18) the jetcan sheet's 66 x 35 sprites, base / party / public, each with its blink frame
const CAN_SPR = ["base", "party", "public"].map((k) => [k, k + "_blink"].map((n) => { const im = new Image(); im.src = "assets/jetcan/" + n + ".png?v=1"; return im; }));
const cansM = new Map();                       // id -> { id, x, y, h, kind, units, mine, haul }
function spawnPart(x, y, o) { if (parts.length > 360) parts.splice(0, 40); parts.push({ x, y, vx: o.vx || 0, vy: o.vy || 0, life: o.life || 0.6, age: 0, size: o.size || 3, color: o.color || "#fff", drag: o.drag ?? 2.5, plus: o.plus }); }
function burst(x, y, n, colors, speed) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = speed * (0.4 + Math.random()); spawnPart(x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.5, size: 2 + Math.random() * 3.5, color: colors[(Math.random() * colors.length) | 0], drag: 3 }); } }
function drawParts(wdt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.age += wdt; if (p.age >= p.life) { parts.splice(i, 1); continue; }
    const k = Math.exp(-wdt * p.drag); p.vx *= k; p.vy *= k; p.x += p.vx * wdt; p.y += p.vy * wdt;
    const f = 1 - p.age / p.life, sz = p.size * (0.5 + 0.5 * f);
    cx.globalAlpha = f; cx.fillStyle = p.color;
    if (p.plus) { cx.fillRect(p.x - sz * 0.75, p.y - sz * 0.25, sz * 1.5, sz * 0.5); cx.fillRect(p.x - sz * 0.25, p.y - sz * 0.75, sz * 0.5, sz * 1.5); }
    else cx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
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
      s: sz * (0.4 + Math.random() * 0.6), color: (DSHADE[c0[6]] || DSHADE[1])[0], age: 0, life: 0.7 + Math.random() * 0.6 });
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
let zoomT = zoom;
function resize() { DPR = Math.min(devicePixelRatio || 1, 2); VW = innerWidth; VH = innerHeight; cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR); cv.style.width = VW + "px"; cv.style.height = VH + "px"; }
addEventListener("resize", resize); resize();
const cam = { x: 0, y: 0 };
const toScreen = (x, y) => [(x - cam.x) * zoom + VW / 2, (y - cam.y) * zoom + VH / 2];
const toWorld = (sx, sy) => [cam.x + (sx - VW / 2) / zoom, cam.y + (sy - VH / 2) / zoom];
const STARS = [0.06, 0.16].map((k, li) => { let a = 7 + li * 99; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647); return { k, pts: Array.from({ length: 220 }, () => [r() * 2048, r() * 2048, 0.4 + r() * (li ? 1.3 : 0.9), 0.25 + r() * 0.6]) }; });

// ---- input ----
const keys = new Set();
const mouse = { x: 0, y: 0, over: false };
let firing = false;
const typing = () => { const el = document.activeElement; return !!el && ((el.tagName === "INPUT" && !["range", "checkbox", "button"].includes(el.type)) || el.tagName === "TEXTAREA" || el.tagName === "SELECT"); };
// (owner, 2026-10-18) the mode switch by the hold bar: Mine | Drill (Scanner), Boost | Cool (Booster), Mine | Refine (Hauler)
let modeIdx = 0;
const modeLabels = () => { const S = G && G.ships[ME.ship]; return !S ? null : S.drillSpeed ? ["Mine", "Drill"] : S.boost ? ["Cool", "Boost"] : S.refineUnit ? ["Mine", "Refine"] : null; };
const hasAlt = () => !!modeLabels();
function toggleMode() { if (!hasAlt()) return; modeIdx = (modeIdx + 1) % 2; drawHud(); }
addEventListener("keydown", (e) => {
  if (typing()) return;
  if (e.code === "Escape") hideMenu();
  if (e.code === "KeyR" && !e.repeat && G && myShip().refineRate) { send({ t: "act", op: "refine" }); e.preventDefault(); }   // (owner, 2026-10-18) the Hauler refines
  if (e.code === "KeyF" && !e.repeat) { if (G && myShip().tractor) send({ t: "act", op: "cargo" }); else toggleMode(); e.preventDefault(); }   // (owner, 2026-10-18) F: deposit field → withdraw field → off
  const mn = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];          // 1 / 2 pick the mode switch's segments directly
  if (mn !== undefined) { const labels = modeLabels(); if (labels && mn < labels.length) { modeIdx = mn; drawHud(); e.preventDefault(); } }
  if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"].includes(e.code)) { keys.add(e.code); e.preventDefault(); }
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => { keys.clear(); firing = false; });
document.addEventListener("contextmenu", (e) => e.preventDefault());
cv.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.over = true; });
cv.addEventListener("mouseleave", () => { mouse.over = false; });
function shipAt(sx, sy) { const [wx, wy] = toWorld(sx, sy); let best = null, bd = 34 / Math.min(1, zoom); for (const s of ships.values()) { if (s.id === myId || !s.near) continue; const d = hyp(s.x - wx, s.y - wy); if (d < bd) { bd = d; best = s; } } return best; }
function rockAt(sx, sy) { const [wx, wy] = toWorld(sx, sy); for (const r of rocks.values()) if (hyp(r.dx - wx, r.dy - wy) < r.r + 6) return r; return null; }
function rockMenuItems(r) {
  const S = myShip(), items = [["Mark", () => send({ t: "act", rock: r.id, op: "mark" })]];
  if (S.towRange) items.push([ME.tow === r.id ? "Release" : "Tow", () => send({ t: "act", rock: r.id, op: "tow" })]);
  return items;
}
cv.addEventListener("mousedown", (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (e.button === 0) firing = true;
  if (e.button === 2) {                        // a pilot: party (invite / kick / leave); an asteroid: mark / tow
    const sh = shipMenuAt(e.clientX, e.clientY); if (sh) { showMenu(e.clientX, e.clientY, sh); return; }
    const r = rockAt(e.clientX, e.clientY);
    if (r) showMenu(e.clientX, e.clientY, rockMenuItems(r));
  }
});
addEventListener("mouseup", (e) => { if (e.button === 0) firing = false; });
cv.addEventListener("wheel", (e) => { e.preventDefault(); zoomT = Math.min(ZMAX, Math.max(ZMIN, zoomT * (e.deltaY > 0 ? 0.88 : 1.14))); try { localStorage.setItem("atamus.zoom", String(zoomT)); } catch {} }, { passive: false });
// twin sticks on a touch screen: the left half flies, the right half aims and fires. Holding still for half a second
// opens the thing's menu, as a right-click would; a second finger on a busy half pinches the zoom.
const TOUCH = matchMedia("(pointer: coarse)").matches;
if (TOUCH) document.body.classList.add("touch");
const sticks = { move: null, aim: null };
let touchAim = null, pinch = null;
const touches = new Map();
function shipMenuAt(sx, sy) {               // the party items for the ship under the pointer (mine included)
  const s = shipAt(sx, sy); let id = s ? s.id : null;
  if (!id) { const [wx, wy] = toWorld(sx, sy), S = myShip(); if (hyp(mine.x - wx, mine.y - wy) < Math.max(S.r || 24, 30 / zoom)) id = myId; }
  if (!id) return null; const it = partyItems(id); return it.length ? it : null;
}
function touchMenuAt(x, y) {
  if (!G) return false;
  { const sh = shipMenuAt(x, y); if (sh) { showMenu(x, y, sh); return true; } }
  const r = rockAt(x, y);
  if (!r) return false;
  showMenu(x, y, rockMenuItems(r)); return true;
}
cv.addEventListener("touchstart", (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const side = t.clientX < VW / 2 ? "move" : "aim";
    if (sticks[side] && !pinch) {
      const a = sticks[side], m0 = touches.get(a.id);
      if (m0 && m0.timer) clearTimeout(m0.timer); if (m0) m0.used = true;
      pinch = { aId: a.id, bId: t.identifier, d0: Math.max(20, hyp(t.clientX - a.x, t.clientY - a.y)), z0: zoomT, ax: a.x, ay: a.y };
      sticks[side] = null; if (side === "aim") firing = false;
      touches.set(t.identifier, { used: true, moved: true, t0: performance.now(), x0: t.clientX, y0: t.clientY, side, timer: 0 });
      continue;
    }
    if (!sticks[side]) sticks[side] = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
    const meta = { x0: t.clientX, y0: t.clientY, t0: performance.now(), side, moved: false, used: false, timer: 0 };
    meta.timer = setTimeout(() => {
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
    if (meta && meta.timer) clearTimeout(meta.timer);
    for (const side of ["move", "aim"]) { const s = sticks[side]; if (s && s.id === t.identifier) { sticks[side] = null; if (side === "aim") firing = false; } }
  }
};
cv.addEventListener("touchend", touchEnd); cv.addEventListener("touchcancel", touchEnd);
// holding a finger on the cargo works as its right-click
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
for (const [bid, f2] of [["zoom-in", 1.3], ["zoom-out", 1 / 1.3]]) $(bid).addEventListener("click", () => { zoomT = Math.min(ZMAX, Math.max(ZMIN, zoomT * f2)); try { localStorage.setItem("atamus.zoom", String(zoomT)); } catch {} });
// ship-relative controls: W thrusts along the nose (nose: (sin h, -cos h)), S backs up, Q / E push sideways, A / D turn
function pushInput() {
  const m = sticks.move;
  if (m) { let x = (m.x - m.ox) / 60, y = (m.y - m.oy) / 60; const L = hyp(x, y); if (L > 1) { x /= L; y /= L; } else if (L < 0.15) x = y = 0; return { x, y, turn: 0, stick: true }; }
  let f = 0, s = 0; if (keys.has("KeyW")) f += 1; if (keys.has("KeyS")) f -= 1; if (keys.has("KeyE")) s += 1; if (keys.has("KeyQ")) s -= 1;
  const h = mine.h; let x = Math.sin(h) * f + Math.cos(h) * s, y = -Math.cos(h) * f + Math.sin(h) * s; const L = hyp(x, y); if (L > 1) { x /= L; y /= L; }
  return { x, y, turn: (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) };
}
// (owner, 2026-10-18) abilities originate from the red dot on each ship's sprite: the muzzle, m ahead of center
const muzzleOf = (x, y, h, S) => { const m = (S && S.muzzle) || 0; return [x + Math.sin(h) * m, y - Math.cos(h) * m]; };
const aimAngle = () => { if (sticks.aim && touchAim !== null) return touchAim; const [mx2, my2] = muzzleOf(mine.x, mine.y, mine.h, G && myShip()); const [sx, sy] = toScreen(mx2, my2); return Math.atan2(mouse.y - sy, mouse.x - sx); };

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
    if (ev.code === 4001) { location.href = "play.html"; return; }   // no name yet: the door
    if (ev.code === 4002) { closedForGood = true; statusEl.hidden = false; statusEl.textContent = "Playing on another tab or device."; setTimeout(() => (location.href = "play.html"), 1500); return; }
    if (ev.code === 4003 || ev.code === 4005 || ev.code === 4006) {
      closedForGood = true; statusEl.hidden = false;
      statusEl.textContent = ev.code === 4003 ? "Another pilot is playing on this device." : (ev.code === 4005 ? "Kicked" : "Banned") + (ev.reason ? ": " + ev.reason : ".");
      setTimeout(() => (location.href = "play.html"), 3000); return;
    }
    statusEl.hidden = false; statusEl.textContent = "Reconnecting…"; setTimeout(connect, 2000);
  };
}
function onMsg(m) {
  if (m.t === "batch") { for (const x of Array.isArray(m.m) ? m.m : []) onMsg(x); return; }
  if (!G && !["hello", "countdown", "update", "note", "pong", "join", "leave", "game"].includes(m.t)) return;
  if (m.t === "hello") {
    srvBuild = m.build || "";
    if (m.updating && m.updating.parts) { if (typeof m.updating.to === "string" && /^[0-9a-f]{7,40}$/.test(m.updating.to)) countHead = m.updating.to; goUpdating(m.updating.parts); return; }
    G = m.game; ORE_KEYS = Object.keys(G.ores); myId = m.you.id; myName = m.you.name;
    mine.x = m.spawn.x; mine.y = m.spawn.y; mine.h = m.spawn.h || 0; mine.vx = mine.vy = 0; corr.x = corr.y = 0; haveMe = true; cam.x = mine.x; cam.y = mine.y;
    ships.clear(); rocks.clear(); details.clear(); dropsM.clear(); names.clear(); snapRows = new Map();
    for (const r of m.roster || []) names.set(r.i, r.n);
    if (m.countdown) startCountdown(Date.now() + m.countdown.in, m.countdown.parts, m.countdown.head);
    drawHud();
  } else if (m.t === "snap") onSnap(m);
  else if (m.t === "rocks") {
    for (const row of m.a || []) { const [id, x, y, shells, r, broken, hp, fill, ht, hotL] = row, heat = (ht || 0) / 100, hot = hotL || []; const o = rocks.get(id); if (o) { if (fill > (o.fill || 0)) o.gulpT = performance.now(); Object.assign(o, { x, y, shells, r, broken, hp, fill, heat, hot }); } else rocks.set(id, { id, x, y, shells, r, broken, hp, fill, heat, hot, dx: x, dy: y }); }
    for (const id of m.x || []) { rocks.delete(id); details.delete(id); }
  } else if (m.t === "rockd") {
    if (m.far) { details.delete(m.id); return; }   // (owner, 2026-10-18) out of range: the layers hide again
    const cl = m.c || [], prev = details.get(m.id), rk0 = rocks.get(m.id);
    for (const c0 of cl) c0[5] = c0[5] ? 1 : 2;  // (every chunk shows its density and ore: drawn as the scanned look)
    if (prev && rk0) {                         // chunks that just broke shatter into drifting shards
      let n = 0;
      for (const c0 of cl) { const was = prev.c[c0[0]] || prev.c.find((x) => x[0] === c0[0]); if (was && !(was[5] & 1) && (c0[5] & 1) && n++ < 10) spawnChunkShards(rk0, c0); }
    }
    let polys = prev ? prev.polys : new Map();
    if (Array.isArray(m.g)) {                  // the exact polygons from the server: drawn as-is, and the laser's hitbox
      polys = new Map();
      for (const g of m.g) {
        const pts = []; for (let k = 2; k + 1 < g.length; k += 2) pts.push([g[k], g[k + 1]]);
        pts.nO = g[1]; polyBounds(pts); polys.set(g[0], pts);
      }
    }
    details.set(m.id, { v: m.v, coreR: m.coreR, c: cl, worked: cl.some((x) => x[5] & 1), polys });
  }
  else if (m.t === "drops") {
    for (const row of m.a || []) { const [id, x, y, ore, units, gone] = row; const o = dropsM.get(id); if (o) Object.assign(o, { x, y, ore, units, gone }); else dropsM.set(id, { id, x, y, ore, units, gone, ph: (id * 2.39) % TAU, dx: x, dy: y }); }
    for (const id of m.x || []) dropsM.delete(id);
  } else if (m.t === "cans") {
    for (const row of m.a || []) { const [id, x, y, h, kind, units, mine, haul] = row; cansM.set(id, { id, x, y, h: h / 1000, kind, units, mine, haul }); }
    for (const id of m.x || []) cansM.delete(id);
  } else if (m.t === "me") { const wasDocked = ME.docked, wasShip = ME.ship; ME = m; if (ME.ship !== wasShip) modeIdx = 0; if (!wasDocked && ME.docked) addShake(2.2); drawStation_(); drawHud(); refreshTip(); }
  else if (m.t === "game") {
    G = m.game; ORE_KEYS = Object.keys(G.ores); hudKey = ""; stKey = "";
    if (m.field) { rocks.clear(); details.clear(); }
    drawHud(); drawStation_();
  }
  else if (m.t === "note") note(m.text);
  else if (m.t === "party") { PARTY = m.id ? m : null; drawParty(); }
  else if (m.t === "invite") askConfirm((m.n || "A pilot") + " invites you to their party.", () => send({ t: "act", op: "inviteReply", from: m.from, yes: true }), { yes: "Accept", no: "Decline", calm: true, onNo: () => send({ t: "act", op: "inviteReply", from: m.from, yes: false }) });
  else if (m.t === "canFull") askConfirm("Destroy your oldest jetcan and the ore in it?", () => send({ t: "act", op: "jetcan", replace: true }));   // (owner, 2026-10-18) past 3 cans
  else if (m.t === "fx") {
    if (m.k === "xfer") { xferFx.push({ to: m.to, ore: m.ore, x: m.x, y: m.y, x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, ts: m.ts, dur: m.dur }); return; }
    if (m.k === "bit") { bitWaves.push({ i: m.i, x: m.x, y: m.y, ore: m.ore, ts: m.ts, dur: m.dur }); return; }
    fx.push({ ...m, t0: performance.now() });
    const d = hyp(m.x - mine.x, m.y - mine.y);
    if (m.k === "crack") { burst(m.x, m.y, 8 + Math.min(10, (m.u || 0) / 50), [C.rock, "#fff", C.dim], 60); addShake(1.6 * Math.max(0, 1 - d / 700)); tutEv.cut = tutEv.cut || d < 320; }
    else if (m.k === "pop") {
      burst(m.x, m.y, m.hot ? 46 : 30, m.hot ? ["#ff7a28", "#ff2e18", C.heat, "#fff"] : [C.gold, C.heat, "#fff"], m.hot ? 180 : 140); addShake(5 * Math.max(0, 1 - d / 1400)); tutEv.popped = tutEv.popped || d < 900;
      let popRk = null; for (const r of rocks.values()) if (hyp(r.x - m.x, r.y - m.y) < 20) { popRk = r; break; }
      const popDet = popRk && details.get(popRk.id);
      if (popDet) { let n = 0; for (const c0 of popDet.c) if (!(c0[5] & 1) && n++ < 26) spawnChunkShards(popRk, c0); }
    }
    else if (m.k === "deliver") { burst(m.x, m.y, 14, [C.gold, "#fff"], 65); if (m.i === myId) { addShake(1); tutEv.delivered = true; } }
    else if (m.k === "lance") { addShake(2.5 * Math.max(0, 1 - d / 700)); if (d < 420) tutEv.blast = true; }
    else if (m.k === "canGone") burst(m.x, m.y, 12, [C.signal, "#fff", C.dim], 70);
    else if (m.k === "can") { burst(m.x, m.y, 8, [C.gold, "#fff"], 50); if (m.i === myId) addShake(0.8); }
    else if (m.k === "take") { const oc = G.ores[ORE_KEYS[m.ore]]; burst(m.x, m.y, 5, [oc ? oc.color : "#fff", "#fff"], 45); }
    else if (m.k === "refine") { burst(m.x, m.y, 7, [C.ore, "#fff"], 45); if (m.i === myId) tutEv.refined = true; }
    else if (m.k === "scan") { burst(m.x, m.y, 6, [C.ice, "#fff"], 35); if (m.i === myId) tutEv.scanned = true; }
  }
  else if (m.t === "join") names.set(m.i, m.n);
  else if (m.t === "leave") { ships.delete(m.i); }
  else if (m.t === "teleport") { mine.x = m.x; mine.y = m.y; mine.vx = mine.vy = 0; corr.x = corr.y = 0; }
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
      // (2026-10-18: zoomed in, the ship visibly skipped) lead from the sim step the position is actually from (not a
      // fixed guess), and the error low-passed with a small dead zone, so snapshot timing noise doesn't tug the ship
      const age = m.st ? Math.max(0, Math.min(200, Date.now() - (srvOff || 0) - m.st)) : 50;
      const lead = (rtt / 2 + age) / 1000, tx = x + mine.vx * lead, ty = y + mine.vy * lead, ex = tx - mine.x, ey = ty - mine.y, err = hyp(ex, ey);
      if (err > 60) { mine.x = tx; mine.y = ty; corr.x = corr.y = 0; errS.x = errS.y = 0; }
      else { errS.x += (ex - errS.x) * 0.3; errS.y += (ey - errS.y) * 0.3; const es = hyp(errS.x, errS.y); if (es > 0.8) { corr.x = errS.x; corr.y = errS.y; } else corr.x = corr.y = 0; }
      continue;
    }
    if (!s.near) { s.near = true; s.buf = []; s.x = x; s.y = y; s.h = h; }
    s.buf.push({ t: m.ts, x, y, h }); if (s.buf.length > 20) s.buf.shift();
  }
  for (const s of ships.values()) if (s.id !== myId && !seen.has(s.id)) { s.near = false; s.buf = []; }
}

// ---- my ship, predicted as the server integrates it ----
function allowedMe(x, y) { const r = hyp(x, y); return r >= G.world.saturnR + (myShip().r || G.fly.shipR) && r <= G.world.lockedR; }
function stepMe(dt, inp) {
  const S = myShip(), F = G.fly, rock = ME.tow && rocks.get(ME.tow);
  const spd = S.speed * (rock ? towFactor(rock.r) : 1), push = hyp(inp.x, inp.y);
  const acc = S.accel || F.accel, a = (push > 0.01 ? acc : acc * F.brake / F.accel) * dt;   // (per ship, as the server)
  let ex = inp.x * spd - mine.vx, ey = inp.y * spd - mine.vy; const el = hyp(ex, ey); if (el > 1e-9 && el > a) { ex *= a / el; ey *= a / el; }
  mine.vx += ex; mine.vy += ey;
  if (mine.vx || mine.vy) {
    const nx = mine.x + mine.vx * dt, ny = mine.y + mine.vy * dt;
    if (allowedMe(nx, ny)) { mine.x = nx; mine.y = ny; } else if (allowedMe(nx, mine.y)) { mine.x = nx; mine.vy = 0; } else if (allowedMe(mine.x, ny)) { mine.y = ny; mine.vx = 0; } else mine.vx = mine.vy = 0;
    for (const r of rocks.values()) {
      if (r.id === ME.tow) continue; const d = hyp(mine.x - r.dx, mine.y - r.dy), min = r.r + (S.r || F.shipR);
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
  if (inp.stick) {
    const want = firing && touchAim !== null ? touchAim + Math.PI / 2 : (hyp(inp.x, inp.y) > 0.1 ? Math.atan2(inp.x, -inp.y) : mine.h);
    const d = Math.atan2(Math.sin(want - mine.h), Math.cos(want - mine.h));
    { const tr = S.turn || F.turn; mine.h = Math.atan2(Math.sin(mine.h + Math.max(-tr * dt, Math.min(tr * dt, d))), Math.cos(mine.h + Math.max(-tr * dt, Math.min(tr * dt, d)))); }
  } else { const tr = S.turn || F.turn; mine.h = Math.atan2(Math.sin(mine.h + inp.turn * tr * dt), Math.cos(mine.h + inp.turn * tr * dt)); }
}
let lastSent = 0, lastKey = "", heartbeat = 0;
function sendInput(inp, t) {
  const a = Math.round(aimAngle() * 100) / 100, f = firing ? 1 : 0;
  const msg = { t: "in", x: Math.round(inp.x * 100) / 100, y: Math.round(inp.y * 100) / 100, h: Math.round(mine.h * 100) / 100, a, f, md: modeIdx === 1 && hasAlt() ? 1 : 0 };
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
// ---- the asteroid: its chunk masonry (owner, 2026-10-18: jittered rock-shaped chunks, much darker bedrock, a blue core
// that grows as chunks are stripped, runs orange with heat, and cracks with the mining it has taken) ----
const hex2n = (h) => { if (h.startsWith("rgb")) { const m = h.match(/\d+/g); return (+m[0] << 16) | (+m[1] << 8) | +m[2]; } return parseInt(h.slice(1), 16); };
const mix = (h1, h2, k) => { const a = hex2n(h1), b = hex2n(h2), c = (i) => Math.round(((a >> i) & 255) + ((((b >> i) & 255) - ((a >> i) & 255)) * k)); return `rgb(${c(16)},${c(8)},${c(0)})`; };
// (owner, 2026-10-18) the chunk sheet's densities, D1 lightest .. D3 darkest: [fill, lit edge, shadow edge, speckle]
// (owner, 2026-10-18) grayscale, darker = denser
const DSHADE = [["#a6a6a6", "#c0c0c0", "#8c8c8c", "#7a7a7a"], ["#7e7e7e", "#969696", "#686868", "#5a5a5a"], ["#535353", "#666666", "#424242", "#343434"],
  ["#1e1e1e", "#2e2e2e", "#131313", "#3a3a3a"]];   // [3]: bedrock (owner, 2026-10-18), near-black
const DUNSCAN = ["#6e6a64", "#837e77", "#5d5953", "#66625c"];   // (owner, 2026-10-18) unscanned: one flat stone grey, no density, no bits
const UNSCANNED = "#838999", BEDROCK = "#17090d", OUTLINE = "#05070c";
const h01 = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
function polyBounds(pts) { let cx2 = 0, cy2 = 0; for (const [x, y] of pts) { cx2 += x; cy2 += y; } cx2 /= pts.length; cy2 /= pts.length; let br = 0; for (const [x, y] of pts) br = Math.max(br, hyp(x - cx2, y - cy2)); pts.cx = cx2; pts.cy = cy2; pts.br = br; }
// the ray against a chunk's polygon, exactly as the server's world.js: 0 inside, the nearest edge crossed, or Infinity
function rayPoly(ox, oy, ux, uy, pts) {
  { const dx = pts.cx - ox, dy = pts.cy - oy, along = dx * ux + dy * uy, perp = Math.abs(dx * uy - dy * ux); if (perp > pts.br || along < -pts.br) return Infinity; }
  let inside = false, best = Infinity;
  for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) {
    const [xa, ya] = pts[j], [xb, yb] = pts[k];
    if ((ya > oy) !== (yb > oy) && ox < ((xb - xa) * (oy - ya)) / (yb - ya) + xa) inside = !inside;
    const ex = xb - xa, ey = yb - ya, den = ux * ey - uy * ex; if (Math.abs(den) < 1e-9) continue;
    const wx = xa - ox, wy = ya - oy, t = (wx * ey - wy * ex) / den, s = (wx * uy - wy * ux) / den;
    if (t >= 0 && s >= 0 && s <= 1 && t < best) best = t;
  }
  return inside ? 0 : best;
}
function chunkPoly(det, c0) {                  // the server's exact polygon (a local stand-in only until it arrives)
  let p = det.polys.get(c0[0]); if (p) return p;
  const i = c0[0], r0 = c0[1], r1 = c0[2];
  const b0 = c0[3] / 1000; let b1 = c0[4] / 1000; if (b1 < b0) b1 += TAU;
  const span = b1 - b0, th = r1 - r0;
  const pts = [], nO = Math.max(2, Math.round(span * r1 / 8)), nI = Math.max(2, Math.round(span * r0 / 10));
  for (let k = 0; k <= nO; k++) { const edge = k === 0 || k === nO;
    const a = b0 + span * (k / nO) + (edge ? 0 : (h01(i, k) - 0.5) * span / nO * 0.9);
    const r = r1 + (h01(i, k + 40) - 0.5) * th * (edge ? 0.22 : 0.42);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  pts.nO = nO;
  for (let k = nI; k >= 0; k--) { const edge = k === 0 || k === nI;
    const a = b0 + span * (k / nI) + (edge ? 0 : (h01(i, k + 80) - 0.5) * span / nI * 0.9);
    const r = Math.max(2, r0 + (h01(i, k + 120) - 0.5) * th * (edge ? 0.2 : 0.34));
    pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  polyBounds(pts); det.polys.set(i, pts); return pts;
}
function chunkPath(det, c0, g = cx) { const p = chunkPoly(det, c0); g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let k = 1; k < p.length; k++) g.lineTo(p[k][0], p[k][1]); g.closePath(); }
// (owner, 2026-10-18) the chunk sheet: each chunk a slab in its density's grey with a dark outline, a lit outer edge and a
// shadowed inner one, a few speckles, its ore bits (1-3) as small squares in the ore's color, and cracks as it's cut.
// g: the context to draw on; zl: the zoom its line widths are for
function drawChunk(g, det, c0, zl) {
  const [i, r0, r1, a0, a1, , d, ore, st] = c0, nb = c0[9] || 0;
  const sh = d < 0 ? DUNSCAN : DSHADE[d] || DSHADE[1], oc = ore >= 0 && G.ores[ORE_KEYS[ore]] ? G.ores[ORE_KEYS[ore]].color : null;
  g.fillStyle = d < 0 ? mix(sh[0], "#05070c", h01(i, 7) * 0.12) : sh[0]; chunkPath(det, c0, g); g.fill();
  { const p = chunkPoly(det, c0), nO = p.nO, ins = (k, d) => { const x = p[k][0], y = p[k][1], r = hyp(x, y) || 1, f = (r + d) / r; return [x * f, y * f]; };
    g.lineWidth = 1.1;                         // the lit outer edge and shadowed inner one, drawn just inside (no clip: it's slow)
    g.strokeStyle = sh[1]; g.beginPath(); for (let k = 0; k <= nO; k++) { const [x, y] = ins(k, -0.55); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.strokeStyle = sh[2]; g.beginPath(); for (let k = nO + 1; k < p.length; k++) { const [x, y] = ins(k, 0.55); k > nO + 1 ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  g.strokeStyle = OUTLINE; g.lineWidth = Math.max(0.6, Math.min(1.3, 1.6 / zl)); chunkPath(det, c0, g); g.stroke();
  let b0 = a0 / 1000, b1 = a1 / 1000; if (b1 < b0) b1 += TAU;
  const mid = (r0 + r1) / 2, span = b1 - b0, th = r1 - r0;
  g.fillStyle = sh[3];                         // speckles
  if (d >= 0) for (let j = 0, nj = 2 + Math.floor(span * mid / 12); j < nj; j++) { const aa = b0 + span * (0.12 + 0.76 * h01(i, 200 + j)), rr = r0 + th * (0.25 + 0.5 * h01(i, 260 + j)); g.fillRect(Math.cos(aa) * rr - 0.45, Math.sin(aa) * rr - 0.45, 0.9, 0.9); }
  if (oc && nb > 0) {                          // ore bits: spread along the chunk, a darker lower corner on each
    const dk = mix(oc, "#05070c", 0.3), q = Math.min(2.8, th * 0.42);
    for (let j = 0; j < nb; j++) {
      const aa = b0 + span * ((j + 0.5) / nb + (h01(i, 300 + j) - 0.5) * 0.5 / nb), rr = mid + (h01(i, 340 + j) - 0.5) * Math.max(0, th - q * 2) * 0.8;
      const x = Math.cos(aa) * rr, y = Math.sin(aa) * rr;
      g.fillStyle = oc; g.fillRect(x - q / 2, y - q / 2, q, q);
      g.fillStyle = dk; g.fillRect(x - q / 2 + q * 0.5, y - q / 2 + q * 0.5, q * 0.5, q * 0.5);
    }
  }
  if (st) {                                    // crack lines on a part-cut chunk
    const am = (b0 + b1) / 2; g.strokeStyle = "#11151d"; g.lineWidth = 1.6 / zl; g.lineCap = "round"; g.beginPath();
    for (let j = 0; j < st; j++) { const b = am + Math.sin(i * 9.1 + j * 7.7) * 0.9, L0 = th * (0.3 + 0.2 * j), px = Math.cos(am) * mid, py = Math.sin(am) * mid; g.moveTo(px - Math.cos(b) * L0, py - Math.sin(b) * L0); g.lineTo(px + Math.cos(b) * L0, py + Math.sin(b) * L0); }
    g.stroke();
  }
}
// (2026-10-18: big rocks hold hundreds of chunks) a rock's masonry is drawn once into its own bitmap, redrawn only when
// its layout changes (a new rockd) or the zoom moves a half-octave; every frame just stamps the bitmap
const CACHE_PX = 1536; let bmBudget = 1;
function rockBitmap(det) {
  let R0 = det.R0;
  if (!R0) { R0 = 0; for (const c0 of det.c) { const p = chunkPoly(det, c0); R0 = Math.max(R0, hyp(p.cx, p.cy) + p.br); } R0 = det.R0 = Math.ceil(R0 + 2); }
  const want = Math.pow(2, Math.ceil(Math.log2(Math.max(0.05, zoom * DPR)) * 2) / 2), sc = Math.min(want, CACHE_PX / (2 * R0));
  if (det.bm && det.bmS === sc) return det.bm;
  // (2026-10-18: zooming lagged) while the zoom is easing, or once this frame already rebuilt a rock, keep the old bitmap
  // (stretched) — it's redrawn once the zoom settles, one rock per frame
  if (det.bm && (zoom !== zoomT || bmBudget <= 0)) return det.bm;
  bmBudget--;
  const n = Math.max(2, Math.ceil(2 * R0 * sc)), cvs = det.bm && det.bm.cv.width === n ? det.bm.cv : document.createElement("canvas");
  cvs.width = cvs.height = n;
  const g = cvs.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, n, n);
  g.setTransform(sc, 0, 0, sc, n / 2, n / 2); g.lineJoin = "round";
  // (owner, 2026-10-18) chunks show only once scanned or mined out: everything unscanned is one solid mass — filled and
  // edged in one flat stone color over the gaps, with a single dark outline around it all — and scanned chunks on top
  const hid = det.c.filter((c0) => !(c0[5] & 1) && c0[6] < 0), gap = 2.4;
  g.lineJoin = "round"; g.strokeStyle = OUTLINE; g.lineWidth = gap + 2 * Math.max(0.6, Math.min(1.3, 1.6 / (sc / DPR)));
  for (const c0 of hid) { chunkPath(det, c0, g); g.stroke(); }
  g.fillStyle = g.strokeStyle = DUNSCAN[0]; g.lineWidth = gap;
  for (const c0 of hid) { chunkPath(det, c0, g); g.fill(); g.stroke(); }
  for (const c0 of det.c) if (!(c0[5] & 1) && c0[6] >= 0) drawChunk(g, det, c0, sc / DPR);
  det.bm = { cv: cvs, R: n / 2 / sc }; det.bmS = sc; return det.bm;
}
function drawChunkRock(r, det, ts) {
  const lw = (px) => px / zoom;
  cx.save(); cx.translate(r.dx, r.dy);
  // (owner, 2026-10-18) the chunk under a laser bounces slightly; the rest of the asteroid holds still
  let bI = -1, bx = 0, by = 0;
  const hitNow = performance.now() - (r.hitT || 0) < 130;
  if (hitNow && r.hitI === -1) cx.translate((Math.random() - 0.5) * 2.6 / zoom, (Math.random() - 0.5) * 2.6 / zoom);   // the core under the laser: the whole asteroid shakes
  if (det && hitNow && r.hitI >= 0) {
    const cb = det.c.find((x) => x[0] === r.hitI);
    if (cb && !(cb[5] & 1) && cb[6] >= 0) { const am = (cb[3] + (cb[4] < cb[3] ? cb[4] + TAU * 1000 : cb[4])) / 2000, k = Math.abs(Math.sin(ts * 38)) * Math.max(1.4, 2.4 / zoom);
      bI = r.hitI; bx = Math.cos(am) * k; by = Math.sin(am) * k; }
  }
  if (!det) { cx.fillStyle = DUNSCAN[0]; cx.strokeStyle = OUTLINE; cx.lineWidth = Math.max(0.8, 1.6 / zoom); cx.beginPath(); cx.arc(0, 0, r.r, 0, TAU); cx.fill(); cx.stroke(); cx.restore(); return; }   // (far off: the same unscanned mass)
  // the core: blue, swelling as ore bits bank into it, cracking with the mining it has taken — always in view, beneath the
  // masonry (owner, 2026-10-18: the chunk sheet), so its swelling shows as the layers around it come away
  const frac = (r.fill || 0) / 100, heat = r.heat || 0, hot = Math.min(1, heat * 1.15);   // (owner, 2026-10-18) the core runs blue → orange as it heats
  const gk = r.gulpT ? (performance.now() - r.gulpT) / 300 : 2;
  const cr = det.coreR * (1 + (G.core.grow || 1.5) * frac) * (gk < 1 ? 1 + 0.22 * Math.sin(gk * Math.PI) : 1);
  const over = heat >= 0.8 ? (0.5 + 0.5 * Math.sin(ts * (10 + 30 * (heat - 0.8)))) * (heat - 0.7) * 3 : 0;   // (near overheating it throbs, faster and faster)
  let col = mix("#6fb7d8", "#ff7a28", hot);
  if (over) col = mix(col, "#ff2e18", over * 0.6);
  const gc = mix("#6fb7d8", "#ff7a28", hot).match(/\d+/g).join(",");
  const glowR = cr * (2 + hot * 2) + Math.sin(ts * 3) * 2;
  const g = cx.createRadialGradient(0, 0, cr * 0.4, 0, 0, glowR);
  g.addColorStop(0, "rgba(" + gc + "," + (0.28 + hot * 0.55 + over * 0.15).toFixed(2) + ")");
  g.addColorStop(1, "rgba(" + gc + ",0)");
  cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, glowR, 0, TAU); cx.fill();
  cx.save(); if (hitNow && r.hitI === -1) cx.translate((Math.random() - 0.5) * 2.2 / zoom, (Math.random() - 0.5) * 2.2 / zoom);   // and the core itself shudders harder
  cx.fillStyle = col; cx.beginPath(); cx.arc(0, 0, cr, 0, TAU); cx.fill();
  cx.strokeStyle = mix("#2b5a74", "#7a4a1e", hot); cx.lineWidth = Math.min(1.6, lw(2)); cx.stroke();
  cx.fillStyle = "rgba(255,255,255,.4)"; cx.beginPath(); cx.arc(-cr * 0.3, -cr * 0.3, cr * 0.32, 0, TAU); cx.fill();
  const dmg = Math.min(1, Math.max(0, 1 - (r.hp || 100) / 100));
  if (dmg > 0.03) {                            // cracks show how mined the core is — stripped chunks and the laser both
    cx.strokeStyle = "rgba(8,14,22,.8)"; cx.lineWidth = 1 + dmg; cx.beginPath();
    const nCr = 1 + Math.floor(dmg * 4);
    for (let j = 0; j < nCr; j++) {
      let aa = j / nCr * TAU + Math.sin(j * 17.3) * 0.8, px2 = Math.cos(aa) * cr * 0.15, py2 = Math.sin(aa) * cr * 0.15;
      cx.moveTo(px2, py2);
      const L2 = cr * (0.3 + 0.65 * dmg);
      for (let s2 = 1; s2 <= 3; s2++) { aa += Math.sin(j * 9.7 + s2 * 13.1) * 0.55; px2 += Math.cos(aa) * L2 / 3; py2 += Math.sin(aa) * L2 / 3; cx.lineTo(px2, py2); }
    }
    cx.stroke();
  }
  cx.restore();
  { const bm = rockBitmap(det); cx.drawImage(bm.cv, -bm.R, -bm.R, bm.R * 2, bm.R * 2); }
  for (const [hi, hp2] of r.hot || []) {         // (owner, 2026-10-18) heated chunks glow orange
    const p = det.polys.get(hi); if (!p || hi === bI) continue; const hk = hp2 / 100;
    cx.fillStyle = "rgba(255,122,40," + (0.12 + 0.5 * hk).toFixed(3) + ")"; cx.beginPath(); cx.moveTo(p[0][0], p[0][1]); for (let k = 1; k < p.length; k++) cx.lineTo(p[k][0], p[k][1]); cx.closePath(); cx.fill();
  }
  if (bI >= 0) {                               // the bouncing chunk: its place left as a gap, the chunk drawn shifted
    const cb = det.c.find((x) => x[0] === bI);
    if (cb) { cx.fillStyle = C.void; chunkPath(det, cb); cx.fill(); cx.save(); cx.translate(bx, by); cx.lineJoin = "round"; drawChunk(cx, det, cb, zoom); cx.restore(); }
  }
  if (r.tow) { cx.strokeStyle = C.ice; cx.lineWidth = lw(2); cx.setLineDash([lw(4), lw(4)]); cx.beginPath(); cx.arc(0, 0, r.r + lw(5), 0, TAU); cx.stroke(); cx.setLineDash([]); }
  cx.restore();
}
// the beam's local ray, exactly as the server's: the first unbroken chunk polygon or the core it meets (my own beam is
// drawn from it so it doesn't lag the mouse)
function castLocal(px, py, ang, range, scan) {   // scan: the scan beam passes through chunks already scanned
  const ux = Math.cos(ang), uy = Math.sin(ang);
  let bestT = range || 0, hit = 0, hitRock = null, hitI = -1;
  for (const r of rocks.values()) {
    const det = details.get(r.id), ox = px - r.dx, oy = py - r.dy, reach = r.r * 1.3;
    const along = -(ox * ux + oy * uy), perp = Math.abs(ox * uy - oy * ux);
    if (perp > reach || along < -reach || along - reach > bestT) continue;
    if (!det) { const disc = r.r * r.r - perp * perp, t0 = Math.max(0, along - Math.sqrt(Math.max(0, disc))); if (t0 < bestT) { bestT = t0; hit = 1; } continue; }
    for (const c0 of det.c) {
      if (c0[5] & 1 || (scan && c0[6] >= 0)) continue;
      const t = rayPoly(ox, oy, ux, uy, chunkPoly(det, c0));
      if (t < bestT) { bestT = t; hit = 1; hitRock = r; hitI = c0[0]; }
    }
    { const b = ox * ux + oy * uy, cr = det.coreR, disc = b * b - (ox * ox + oy * oy - cr * cr);
      if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t >= 0 && t < bestT) { bestT = t; hit = 1; hitRock = r; hitI = -1; } } }
  }
  return { len: bestT, hit, rock: hitRock, chunk: hitI };
}
let lastWT = 0;
function drawWorld(t) {
  const W = G.world, ts = t / 1000, wdt = Math.min(0.05, Math.max(0, (t - lastWT) / 1000)); lastWT = t;
  cx.save(); cx.translate(VW / 2 + shk.x, VH / 2 + shk.y); cx.scale(zoom, zoom); cx.translate(-cam.x, -cam.y);
  const lw = (px) => px / zoom;
  for (const [a, b] of W.rings) { cx.strokeStyle = "rgba(216,176,106,0.07)"; cx.lineWidth = b - a; cx.beginPath(); cx.arc(0, 0, (a + b) / 2, 0, TAU); cx.stroke(); }
  cx.strokeStyle = "rgba(38,48,68,0.9)"; cx.lineWidth = lw(1.5); cx.setLineDash([lw(4), lw(10)]); cx.beginPath();
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; cx.moveTo(Math.cos(a) * W.safeR, Math.sin(a) * W.safeR); cx.lineTo(Math.cos(a) * W.lockedR, Math.sin(a) * W.lockedR); } cx.stroke();
  cx.strokeStyle = C.signal; cx.lineWidth = lw(2); cx.setLineDash([lw(14), lw(10)]); cx.beginPath(); cx.arc(0, 0, W.lockedR, 0, TAU); cx.stroke(); cx.setLineDash([]);
  if (hyp(cam.x, cam.y) - W.saturnR < hyp(VW, VH) / zoom) drawSaturn(cx, W.saturnR, ts);
  cx.save(); cx.translate(W.station[0], W.station[1]);
  cx.strokeStyle = C.gold; cx.globalAlpha = ME.docked ? 0.42 + 0.16 * Math.sin(ts * 3) : 0.35; cx.lineWidth = lw(1.5); cx.setLineDash([lw(3), lw(8)]); cx.beginPath(); cx.arc(0, 0, G.econ.dockR, 0, TAU); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1;
  drawStation(cx, ts); cx.restore();
  drawStationBeams(ts);
  const vr = Math.max(VW, VH) / zoom;
  for (const r of rocks.values()) {
    r.dx += (r.x - r.dx) * 0.2; r.dy += (r.y - r.dy) * 0.2;
    if (Math.abs(r.dx - cam.x) > VW / 2 / zoom + r.r * 1.2 + 40 || Math.abs(r.dy - cam.y) > VH / 2 / zoom + r.r * 1.2 + 40) { const d0 = details.get(r.id); if (d0 && d0.bm) { d0.bm = null; d0.bmS = 0; } continue; }
    drawChunkRock(r, details.get(r.id), ts);
  }
  // ore drops adrift: free for anyone — fly over one and it pours in
  for (const o of dropsM.values()) {
    o.dx += (o.x - o.dx) * 0.25; o.dy += (o.y - o.dy) * 0.25;
    const bob = Math.sin(ts * 1.6 + o.ph) * 1.5, oc2 = G.ores[ORE_KEYS[o.ore]] ? G.ores[ORE_KEYS[o.ore]].color : "#fff";
    cx.save(); cx.translate(o.dx, o.dy + bob); cx.rotate(o.ph + ts * 0.3);
    cx.fillStyle = oc2; cx.globalAlpha = 0.22; cx.fillRect(-7, -7, 14, 14); cx.globalAlpha = 1;
    cx.fillRect(-4, -4, 8, 8);
    cx.strokeStyle = "#05070c"; cx.lineWidth = 1; cx.strokeRect(-4, -4, 8, 8);
    cx.restore();
    if (o.gone) {                              // (owner, 2026-10-18) the despawn timer: a small ring that sweeps away over its 5 minutes
      const left = Math.max(0, Math.min(1, (o.gone - (Date.now() - (srvOff || 0))) / ((G.drops.linger || 300) * 1000)));
      cx.strokeStyle = oc2; cx.lineWidth = lw(1.5); cx.globalAlpha = 0.18; cx.beginPath(); cx.arc(o.dx, o.dy + bob, 10, 0, TAU); cx.stroke();
      cx.globalAlpha = 0.75; cx.beginPath(); cx.arc(o.dx, o.dy + bob, 10, -Math.PI / 2, -Math.PI / 2 + TAU * left); cx.stroke(); cx.globalAlpha = 1;
    }
  }
  // (owner, 2026-10-18) jetcans: the sheet's sprite by kind (base / party / public), its light blinking
  for (const c of cansM.values()) {
    const sp = CAN_SPR[c.kind] || CAN_SPR[0], im = sp[(ts + c.id * 0.37) % 1.4 > 1.15 ? 1 : 0];
    if (!im.complete || !im.naturalWidth) continue;
    const len = (G.jetcan && G.jetcan.len) || 26.6, hgt = len * im.naturalHeight / im.naturalWidth, bob = Math.sin(ts * 1.1 + c.id) * 0.8;
    cx.save(); cx.translate(c.x, c.y + bob); cx.rotate(c.h - Math.PI / 2 + Math.sin(ts * 0.4 + c.id) * 0.05); cx.imageSmoothingEnabled = false;
    cx.drawImage(im, -len / 2, -hgt / 2, len, hgt); cx.restore();
  }
  for (const s of ships.values()) if (s.row && (s.id === myId || s.near)) shipFx(s, ts, true);
  for (const s of ships.values()) if (s.row && (s.id === myId || s.near)) {
    const r = s.row, kind = G.kinds[r[4]] || "miner", SP = G.ships[kind], fl = r[5], mods = SP.art;
    const st = { t: ts, raw: (r[8] || 0) / 100, ref: 0, fuel: 1, firing: !!(fl & 2),
      on: { miner: !!(fl & 2) }, busy: {},
      thrust: s.id === myId ? hyp(lastInp.x, lastInp.y) : Math.min(1, (s.spd || 0) / 40) };
    if (st.thrust > 0.15) {
      const meta = SPRITE_META[kind], spr2 = SPRITES[kind];
      const len2 = SP.len || shipLayout(mods).yc * 2 * ART, wid2 = spr2 && spr2.naturalWidth ? spr2.naturalHeight * len2 / spr2.naturalWidth : 0;
      const fwX = Math.sin(s.h), fwY = -Math.cos(s.h), sdX = Math.cos(s.h), sdY = Math.sin(s.h);
      const nozzles = meta && wid2 ? meta.engines.map((fy) => { const ax = -meta.pivot[0] * len2, ay = (fy - meta.pivot[1]) * wid2; return [s.x + fwX * ax + sdX * ay, s.y + fwY * ax + sdY * ay]; })
        : [[s.x - fwX * len2 / 2, s.y - fwY * len2 / 2]];
      s.exA = (s.exA || 0) + wdt * 9 * st.thrust * nozzles.length;   // (more engines, more exhaust)
      while (s.exA >= 1) { s.exA--; const [bx, by] = nozzles[(Math.random() * nozzles.length) | 0]; spawnPart(bx + (Math.random() - 0.5) * 3, by + (Math.random() - 0.5) * 3, { vx: -Math.sin(s.h) * (26 + Math.random() * 18) + (Math.random() - 0.5) * 12, vy: Math.cos(s.h) * (26 + Math.random() * 18) + (Math.random() - 0.5) * 12, life: 0.45 + Math.random() * 0.35, size: 2.4 + Math.random() * 2, color: Math.random() < 0.75 ? C.heat : "#6b7382", drag: 2 }); }
    }
    const spr = SPRITES[kind];
    if (spr && spr.complete && spr.naturalWidth) {   // (owner, 2026-10-18) the pixel-art ship sheet: nose right in the sheet, up in the game
      const len = SP.len || shipLayout(mods).yc * 2 * ART, k = len / spr.naturalWidth;   // (proportional to the ship sheet)
      const pv = (SPRITE_META[kind] || { pivot: [0.5, 0.5] }).pivot, hgt = spr.naturalHeight * k;   // drawn around its pivot: it turns there
      cx.save(); cx.translate(s.x, s.y); cx.rotate(s.h - Math.PI / 2); cx.imageSmoothingEnabled = false;
      { const pk = s.pulseT ? (performance.now() - s.pulseT) / 1000 : 2;   // (owner, 2026-10-18) a bit arrived: the ship swells for a second
        if (pk < 1) { const sc = 1 + 0.14 * (pk < 0.12 ? pk / 0.12 : Math.pow(1 - (pk - 0.12) / 0.88, 2)); cx.scale(sc, sc); } }
      cx.drawImage(spr, -pv[0] * len, -pv[1] * hgt, len, hgt); cx.restore();
    } else { cx.save(); cx.translate(s.x, s.y); cx.rotate(s.h); cx.scale(ART, ART); drawShip(cx, mods, st); cx.restore(); }
  }
  for (const s of ships.values()) if (s.row && (s.id === myId || s.near)) shipFx(s, ts, false);
  drawBitWaves();
  drawXfers();
  drawFx(t);
  drawShards(wdt);
  drawParts(wdt);
  { const V = myVision(), fog = cx.createRadialGradient(mine.x, mine.y, V * 0.78, mine.x, mine.y, V * 1.06);
    fog.addColorStop(0, "rgba(11,14,21,0)"); fog.addColorStop(1, "rgba(11,14,21,0.84)");
    cx.fillStyle = fog; const fr = Math.max(VW, VH) / zoom; cx.fillRect(cam.x - fr, cam.y - fr, fr * 2, fr * 2); }
  cx.restore();
}
// (owner, 2026-10-18) an ore bit riding a wave back down the beam: it leaves the chunk at the tip and runs to the ship's
// emitter — a warm red-to-orange swell carrying the bit in the ore's color; when it arrives the bit is in the hold and the
// ship swells for a second. Timed on the server's clock, so it lands as the server banks it.
const bitWaves = [];
function drawBitWaves() {
  const now = Date.now() - (srvOff || 0), lw = (px) => px / zoom;
  for (let k = bitWaves.length - 1; k >= 0; k--) {
    const b = bitWaves[k], s = ships.get(b.i);
    if (!s || !s.row || now - b.ts > b.dur + 2000) { bitWaves.splice(k, 1); continue; }
    const S2 = G.ships[G.kinds[s.row[4]]] || {}, [mx, my] = muzzleOf(s.x, s.y, s.h, S2), f = Math.max(0, (now - b.ts) / b.dur);
    const oc = G.ores[ORE_KEYS[b.ore]] ? G.ores[ORE_KEYS[b.ore]].color : "#fff";
    if (f >= 1) { s.pulseT = performance.now(); burst(mx, my, 5, [oc, "#fff"], 40); if (b.i === myId) addShake(0.4); bitWaves.splice(k, 1); continue; }
    const L = hyp(mx - b.x, my - b.y) || 1, ux = (mx - b.x) / L, uy = (my - b.y) / L, px = b.x + ux * L * f, py = b.y + uy * L * f, half = 7;
    const g5 = cx.createLinearGradient(px - ux * half, py - uy * half, px + ux * half, py + uy * half);
    g5.addColorStop(0, "rgba(229,96,79,0)"); g5.addColorStop(0.3, "rgba(240,112,88,0.6)"); g5.addColorStop(0.5, "rgba(255,150,105,0.95)"); g5.addColorStop(0.7, "rgba(240,112,88,0.6)"); g5.addColorStop(1, "rgba(229,96,79,0)");
    cx.lineCap = "butt"; cx.strokeStyle = g5; cx.lineWidth = lw(6); cx.beginPath(); cx.moveTo(px - ux * half, py - uy * half); cx.lineTo(px + ux * half, py + uy * half); cx.stroke(); cx.lineCap = "round";
    const q = 2.6; cx.save(); cx.translate(px, py); cx.rotate(Math.atan2(uy, ux));
    cx.fillStyle = oc; cx.fillRect(-q / 2, -q / 2, q, q); cx.fillStyle = mix(oc, "#05070c", 0.3); cx.fillRect(0, 0, q / 2, q / 2); cx.restore();
  }
}
// (owner, 2026-10-18) the cargo fields: a holographic rectangle out of one side of the hull — faint fill fading outward,
// scan lines moving the way the cargo goes, a flickering edge (shape from the ship's rules; same test as the server)
const FIELD_IN = "70,196,226", FIELD_OUT = "232,98,82";   // (owner, 2026-10-18) blue takes in, red puts out
function drawTractor(s, S, ts, dep) {
  // (owner, 2026-10-18) both fields out of the left side: deposit red with lines drifting out, withdraw blue drifting in
  const sd = -1, T = S.tractor, L = S.len, pv = S.pivot ?? 0.5, hw = S.hw || 0.2, lw = (px) => px / zoom;
  const rgb = dep ? FIELD_OUT : FIELD_IN, edge = "rgb(" + rgb + ")";   // (owner, 2026-10-18) a ship's deposit puts out (red), its withdraw takes in (blue)
  cx.save(); cx.translate(s.x, s.y); cx.rotate(s.h);          // ship frame: -y is the nose, x is to starboard
  const x0 = sd * hw * L, x1 = sd * (hw + T.depth) * L, y0 = -(T.span[1] - pv) * L, y1 = -(T.span[0] - pv) * L;
  const g = cx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, "rgba(" + rgb + ",0.22)"); g.addColorStop(1, "rgba(" + rgb + ",0.04)");
  cx.beginPath(); cx.rect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0); cx.fillStyle = g; cx.fill();
  cx.save(); cx.clip(); cx.strokeStyle = "rgba(" + rgb + ",0.5)"; cx.lineWidth = lw(1);
  for (let j = 0; j < 4; j++) { const ph = (ts * 0.6 + j / 4) % 1, kk = dep ? ph : 1 - ph, xo = sd * (hw + T.depth * kk) * L;
    cx.globalAlpha = Math.min(1, ph * 4) * (0.35 + 0.65 * (1 - ph)); cx.beginPath(); cx.moveTo(xo, y0); cx.lineTo(xo, y1); cx.stroke(); }
  cx.restore(); cx.globalAlpha = 0.55 + 0.25 * Math.sin(ts * 9 + sd);
  cx.strokeStyle = edge; cx.lineWidth = lw(1.3); cx.strokeRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0);
  cx.globalAlpha = 1; cx.restore();
}
// (owner, 2026-10-18) the station's deposit fields: blue holographic rectangles out of its 4 corner pods, lines drifting in
function drawStationBeams(ts) {
  const B = G.beams; if (!B) return; const [sx, sy] = G.world.station, lw = (px) => px / zoom;
  for (let k = 0; k < B.n; k++) {
    const a = (B.a0 + k * 360 / B.n) * Math.PI / 180;
    cx.save(); cx.translate(sx, sy); cx.rotate(a);              // +x runs out along the field
    const g = cx.createLinearGradient(B.r0, 0, B.r1, 0); g.addColorStop(0, "rgba(" + FIELD_IN + ",0.24)"); g.addColorStop(1, "rgba(" + FIELD_IN + ",0.05)");
    cx.fillStyle = g; cx.fillRect(B.r0, -B.w / 2, B.r1 - B.r0, B.w);
    cx.strokeStyle = "rgba(" + FIELD_IN + ",0.6)"; cx.lineWidth = lw(1);
    for (let j = 0; j < 5; j++) { const ph = (ts * 0.5 + j / 5) % 1, x = B.r1 - (B.r1 - B.r0) * ph; cx.globalAlpha = Math.min(1, ph * 4) * (0.35 + 0.65 * (1 - ph)); cx.beginPath(); cx.moveTo(x, -B.w / 2); cx.lineTo(x, B.w / 2); cx.stroke(); }
    cx.globalAlpha = 0.6 + 0.2 * Math.sin(ts * 7 + k); cx.strokeStyle = "rgb(" + FIELD_IN + ")"; cx.lineWidth = lw(1.4);
    cx.beginPath(); cx.moveTo(B.r0, -B.w / 2); cx.lineTo(B.r1, -B.w / 2); cx.moveTo(B.r0, B.w / 2); cx.lineTo(B.r1, B.w / 2); cx.moveTo(B.r1, -B.w / 2); cx.lineTo(B.r1, B.w / 2); cx.stroke();
    cx.globalAlpha = 1; cx.restore();
  }
}
// cargo in transit (deposits): a lump flying from the deposit field to the station beam or the receiving ship
const xferFx = [];
function drawXfers() {
  const now = Date.now() - (srvOff || 0);
  for (let k = xferFx.length - 1; k >= 0; k--) {
    const f = xferFx[k], q = (now - f.ts) / f.dur;
    if (q >= 1 || q > 3) { xferFx.splice(k, 1); continue; } if (q < 0) continue;
    const tgt = f.to ? ships.get(f.to) : null, ex = tgt ? tgt.x : f.x1, ey = tgt ? tgt.y : f.y1;
    let px, py;
    if (f.x2 !== undefined) {                  // into a station field: across to it, then along it all the way in to the pod
      const d1 = hyp(f.x1 - f.x, f.y1 - f.y), d2 = hyp(f.x2 - f.x1, f.y2 - f.y1), k1 = d1 / Math.max(1, d1 + d2);
      if (q < k1) { const u = q / k1; px = f.x + (f.x1 - f.x) * u; py = f.y + (f.y1 - f.y) * u; } else { const u = (q - k1) / Math.max(1e-6, 1 - k1); px = f.x1 + (f.x2 - f.x1) * u; py = f.y1 + (f.y2 - f.y1) * u; }
    } else { const e2 = q * q * (3 - 2 * q); px = f.x + (ex - f.x) * e2; py = f.y + (ey - f.y) * e2; }
    const oc = G.ores[ORE_KEYS[f.ore]] ? G.ores[ORE_KEYS[f.ore]].color : "#fff";
    cx.fillStyle = oc; cx.globalAlpha = 0.25; cx.fillRect(px - 5, py - 5, 10, 10); cx.globalAlpha = 1; cx.fillRect(px - 2.5, py - 2.5, 5, 5);
  }
}
// a ship's gear at work: the boost glow under it; over it, the beams — the cutting laser blue-yellow-red by its own
// temperature (white as a Miner's charge winds up), the Booster's boost beam as green pluses, its coolant as a blue
// spray, the Hauler's refine beam purple, the Scanner's drill ice
function shipFx(s, ts, under) {
  const r = s.row, kind = G.kinds[r[4]] || "miner", fl = r[5], lw = (px) => px / zoom, lay = shipLayout(G.ships[kind].art), yc = lay.yc;
  if (under) {
    if (fl & 128 && G.ships[kind].tractor) drawTractor(s, G.ships[kind], ts, true);
    if (fl & 256 && G.ships[kind].tractor) drawTractor(s, G.ships[kind], ts, false);
    if (fl & 32) {                             // boosted: the ship glows blue
      const gr = 48 + Math.sin(ts * 5) * 4, g2 = cx.createRadialGradient(s.x, s.y, 10, s.x, s.y, gr);
      g2.addColorStop(0, "rgba(124,195,214,.5)"); g2.addColorStop(1, "rgba(124,195,214,0)");
      cx.fillStyle = g2; cx.beginPath(); cx.arc(s.x, s.y, gr, 0, TAU); cx.fill();
    }
    return;
  }
  const isMe = s.id === myId, S2 = G.ships[kind] || {}, fireNow = isMe ? firing && !ME.docked : !!(fl & 2);
  if (fl & 512 && Math.random() < 0.5) {         // (owner, 2026-10-18) refining: purple motes drawn in toward the hull's middle
    const L5 = S2.len || 100, a5 = Math.random() * TAU, d5 = L5 * (0.35 + Math.random() * 0.25), px5 = s.x + Math.cos(a5) * d5, py5 = s.y + Math.sin(a5) * d5;
    spawnPart(px5, py5, { vx: (s.x - px5) * 1.4, vy: (s.y - py5) * 1.4, life: 0.6, size: 2.6 + Math.random() * 1.6, color: Math.random() < 0.7 ? C.ore : "#e8d6ff", drag: 0.2 });
  }
  const alt = isMe ? modeIdx === 1 && hasAlt() : !!(fl & 64);
  const drillMode = S2.drillSpeed && alt, coolMode = S2.boost && !alt, boostMode = S2.boost && alt,   /* (owner, 2026-10-18) coolant first, F to boost */ refineMode = S2.refineUnit && alt;
  const [x0, y0] = muzzleOf(s.x, s.y, s.h, S2);   // the beam leaves the sprite's red dot
  const wdt2 = 1 / 60;
  // the cutting laser: blue runs yellow then red as its temperature builds; a winding charge pushes it white
  // (owner, 2026-10-18) the Scanner's scan beam: three thin beams sweeping at random within a small angle and radar
  // crescents running out from the ship toward the cursor — all of them meet, and dissipate, at the chunk being scanned
  if (fireNow && S2.scanDps) {
    let a = r[6] / 1000, len = r[7], hitF = !!(fl & 1);
    if (isMe) { a = aimAngle(); const c3 = castLocal(x0, y0, a, S2.scanRange, true); len = c3.len; hitF = !!c3.hit; }
    if (len > 0) {
      const ex = x0 + Math.cos(a) * len, ey = y0 + Math.sin(a) * len, sid = (s.id || "").length;
      cx.lineCap = "round";
      for (let j = 0; j < 3; j++) {
        const sw = (Math.sin(ts * (2.1 + j * 0.9) + j * 2.3 + sid) + 0.5 * Math.sin(ts * (5.3 + j * 1.7) + j)) * 0.06;
        const aj = a + sw, bx = x0 + Math.cos(aj) * len, by = y0 + Math.sin(aj) * len;
        cx.strokeStyle = C.ice; cx.globalAlpha = 0.18; cx.lineWidth = lw(3.2); cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(bx, by); cx.stroke();
        cx.globalAlpha = 0.8; cx.lineWidth = lw(1.1); cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(bx, by); cx.stroke();
      }
      const nC = 4;
      for (let k = 0; k < nC; k++) {
        const rad = (ts * 110 + k * len / nC) % len, f = rad / len, end = Math.max(0, (f - 0.82) / 0.18);   // (near the chunk they spread and fade out)
        const half = 0.14 + end * 0.22; cx.strokeStyle = C.ice; cx.globalAlpha = (0.25 + 0.5 * Math.sin(Math.PI * Math.min(1, f * 1.2))) * (1 - end); cx.lineWidth = lw(1.6);
        cx.beginPath(); cx.arc(x0, y0, Math.max(1, rad), a - half, a + half); cx.stroke();
      }
      if (hitF) {                               // the dissipation at the chunk
        cx.globalAlpha = 0.35 + 0.25 * Math.sin(ts * 23); cx.fillStyle = C.ice; cx.beginPath(); cx.arc(ex, ey, lw(5) + Math.sin(ts * 11) * lw(1.5), 0, TAU); cx.fill();
        if (Math.random() < 0.35) { const na = a + Math.PI + (Math.random() - 0.5) * 2.4, v = 20 + Math.random() * 30; spawnPart(ex, ey, { vx: Math.cos(na) * v, vy: Math.sin(na) * v, life: 0.3 + Math.random() * 0.3, size: 1.4 + Math.random() * 1.2, color: Math.random() < 0.5 ? C.ice : "#fff", drag: 3 }); }
      }
      cx.globalAlpha = 1;
    }
  }
  if (fireNow && S2.laserDps && !drillMode && !coolMode && !boostMode && !refineMode) {
    const big = kind === "miner";
    let a = r[6] / 1000, len = r[7], hitF = !!(fl & 1);
    let c2 = null;
    if (isMe) { a = aimAngle(); c2 = castLocal(x0, y0, a, S2.laserRange); len = c2.len; hitF = !!c2.hit; }
    else if (hitF) c2 = castLocal(x0, y0, a, len + 3);
    if (hitF && c2 && c2.rock) { c2.rock.hitT = performance.now(); c2.rock.hitI = c2.chunk; }
    const ck = 0, bc = C.signal;                 // (back to basics: one laser, signal red)
    if (len > 0) {
      const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
      // (owner, 2026-10-18) the beam glows: soft wide halos, a red body and a warm hot core, instead of one flat line
      const beamLine = (w, col, a8) => { cx.strokeStyle = col; cx.globalAlpha = a8; cx.lineWidth = w; cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke(); };
      cx.lineCap = "round"; const bw = lw(big ? 2.6 : 1.6);
      const flick = 0.9 + 0.1 * Math.sin(ts * 31);
      beamLine(bw * 7, bc, 0.07 * flick); beamLine(bw * 4.2, bc, 0.13 * flick); beamLine(bw * 2.2, bc, 0.3);
      beamLine(bw, bc, 1); beamLine(bw * 0.45, "#ffb08f", 0.85);
      cx.globalAlpha = 1;
      if (hitF) {
        cx.fillStyle = "#fff"; cx.globalAlpha = (0.6 + 0.4 * Math.sin(ts * 50)) * (0.6 + ck); cx.beginPath(); cx.arc(x1, y1, lw(big ? 5 : 4) * (1 + ck * 1.6), 0, TAU); cx.fill(); cx.globalAlpha = 1;
        if (Math.random() < (big ? 0.6 : 0.3)) { const na = a + Math.PI + (Math.random() - 0.5) * 2.2, v = 40 + Math.random() * 60; spawnPart(x1, y1, { vx: Math.cos(na) * v, vy: Math.sin(na) * v, life: 0.25 + Math.random() * 0.3, size: 1.8 + Math.random() * 2, color: Math.random() < 0.5 ? "#fff" : bc, drag: 4 }); }
      }
    }
  }
  // the Booster's coolant spray: no beam line — a water-like stream of blue squares, splashing over the hot rock
  if (fireNow && coolMode) {
    let a = r[6] / 1000, len = r[7], hitF = !!(fl & 1);
    if (isMe) { a = aimAngle(); const c2 = castLocal(mine.x, mine.y, a, S2.coolRange || 180); len = c2.len; hitF = !!c2.hit; }
    const ux2 = Math.cos(a), uy2 = Math.sin(a);
    for (let j = 0; j < 6; j++) {
      const v = 220 + Math.random() * 80, side = (Math.random() - 0.5) * 26, adv = v * wdt2 * (j / 6);
      spawnPart(x0 + ux2 * adv, y0 + uy2 * adv, { vx: ux2 * v - uy2 * side, vy: uy2 * v + ux2 * side,
        life: Math.max(0.2, (len - 14 - adv) / v + 0.1), size: 2.5 + Math.random() * 2,
        color: ["#7cc3d6", "#9fdcef", "#bfe9ff"][(Math.random() * 3) | 0], drag: 0.05 });
    }
    if (hitF) { const x1 = s.x + ux2 * len, y1 = s.y + uy2 * len;
      for (let j = 0; j < 3; j++) { const s3 = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 110);
        spawnPart(x1, y1, { vx: -uy2 * s3 - ux2 * (10 + Math.random() * 30), vy: ux2 * s3 - uy2 * (10 + Math.random() * 30),
          life: 0.55 + Math.random() * 0.55, size: 2 + Math.random() * 2.5, color: Math.random() < 0.5 ? "#9fdcef" : "#7cc3d6", drag: 2.2 }); } }
  }
  // the targeted ship beams: the Booster's boost (green pluses) and the Hauler's refine (purple squares)
  if (fireNow && (boostMode || refineMode) && r[9]) {
    const q = r[9] === myId ? { x: mine.x, y: mine.y } : ships.get(r[9]);
    if (q && (r[9] === myId || q.near)) {
      const dx3 = q.x - s.x, dy3 = q.y - s.y, L4 = hyp(dx3, dy3) || 1, ux4 = dx3 / L4, uy4 = dy3 / L4;
      for (let j = 0; j < 3; j++) {
        const v = 200 + Math.random() * 70, adv = v * wdt2 * (j / 3), side = (Math.random() - 0.5) * 18;
        spawnPart(s.x + ux4 * (14 + adv), s.y + uy4 * (14 + adv), { vx: ux4 * v - uy4 * side, vy: uy4 * v + ux4 * side,
          life: Math.max(0.2, (L4 - 14 - adv) / v), size: 3.2 + Math.random() * 1.6,
          color: boostMode ? (Math.random() < 0.7 ? "#7ddc8f" : "#b7f0c3") : (Math.random() < 0.7 ? C.ore : "#e8d6ff"), drag: 0.05, plus: boostMode });
      }
    }
  }
  // the drill: anchored into the rock, the bore runs a straight line toward the core
  if (fl & 16 && r[8]) {
    const rk = rocks.get(r[8]);
    if (rk) {
      const ang = Math.atan2(s.y - rk.dy, s.x - rk.dx), depth = r[13] || 0;
      const sx = rk.dx + Math.cos(ang) * rk.r, sy = rk.dy + Math.sin(ang) * rk.r;
      const hx = rk.dx + Math.cos(ang) * Math.max(4, rk.r - depth), hy = rk.dy + Math.sin(ang) * Math.max(4, rk.r - depth);
      cx.strokeStyle = C.ice; cx.lineCap = "round";
      cx.lineWidth = lw(4); cx.globalAlpha = 0.9; cx.beginPath(); cx.moveTo(s.x, s.y); cx.lineTo(sx, sy); cx.stroke();
      cx.globalAlpha = 0.55 + 0.25 * Math.sin(ts * 9); cx.lineWidth = lw(2.4); cx.beginPath(); cx.moveTo(sx, sy); cx.lineTo(hx, hy); cx.stroke();
      cx.globalAlpha = 1; cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(hx, hy, lw(3.5), 0, TAU); cx.fill();
      if (Math.random() < 0.35) spawnPart(hx, hy, { vx: Math.cos(ang) * 25 + (Math.random() - 0.5) * 20, vy: Math.sin(ang) * 25 + (Math.random() - 0.5) * 20, life: 0.3 + Math.random() * 0.3, size: 1.6 + Math.random() * 1.6, color: Math.random() < 0.6 ? C.ice : "#fff", drag: 3 });
    }
  }
  const at = (lx, ly) => { const c = Math.cos(s.h), sn = Math.sin(s.h); return [s.x + lx * c - ly * sn, s.y + lx * sn + ly * c]; };
  if (!(fl & 16) && r[8]) {                    // the scanner's tow leash, from both claw tips back to the asteroid
    const rk = rocks.get(r[8]);
    if (rk) { cx.strokeStyle = C.ice; cx.lineWidth = lw(2); cx.setLineDash([lw(4), lw(5)]); cx.globalAlpha = 0.5 + 0.5 * Math.sin(ts * 4.5); cx.beginPath();
      for (const lx of [35, 145]) { const [px, py] = at((lx - 90) * ART, (318 + (lay.off.tractor || 0) - yc) * ART); cx.moveTo(px, py); cx.lineTo(rk.dx, rk.dy); } cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1; }
  }
  // Cool mode, my own ship: a white ring marks the cursor (clamped to where the spray lands)
  if (isMe && coolMode) {
    let px3, py3;
    if (!TOUCH && mouse.over) { [px3, py3] = toWorld(mouse.x, mouse.y); }
    else { const a = aimAngle(), c2 = firing ? castLocal(mine.x, mine.y, a, S2.coolRange || 180) : { len: S2.coolRange || 180 }; px3 = mine.x + Math.cos(a) * c2.len; py3 = mine.y + Math.sin(a) * c2.len; }
    if (firing) { const a = aimAngle(), c2 = castLocal(mine.x, mine.y, a, S2.coolRange || 180);
      if (c2.hit && c2.len < hyp(px3 - mine.x, py3 - mine.y)) { px3 = mine.x + Math.cos(a) * c2.len; py3 = mine.y + Math.sin(a) * c2.len; } }
    cx.strokeStyle = "#fff"; cx.globalAlpha = 0.85; cx.lineWidth = lw(1.6);
    cx.beginPath(); cx.arc(px3, py3, (6 + Math.sin(ts * 5)) / zoom, 0, TAU); cx.stroke(); cx.globalAlpha = 1;
  }
}
function drawFx(t) {
  const lw = (px) => px / zoom;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i], k = (t - f.t0) / 1000;
    if (f.k === "crack") {
      if (k > 0.7) { fx.splice(i, 1); continue; }
      cx.strokeStyle = C.ink; cx.globalAlpha = 1 - k / 0.7; cx.lineWidth = lw(2); cx.beginPath(); cx.arc(f.x, f.y, 6 + k * 26, 0, TAU); cx.stroke(); cx.globalAlpha = 1;
      if (f.u > 0 && f.rx !== undefined) {
        const q = Math.min(1, k / 0.55), px = f.x + (f.rx - f.x) * q, py = f.y + (f.ry - f.y) * q;
        cx.fillStyle = f.ore && G.ores[f.ore] ? G.ores[f.ore].color : C.gold; cx.globalAlpha = 1 - q * 0.4;
        for (let j = 0; j < Math.min(3, Math.ceil((f.u || 100) / 100)); j++) { const o2 = j * 2.1; cx.fillRect(px - 2 + Math.sin(o2 + k * 9) * 4, py - 2 + Math.cos(o2 + k * 9) * 4, 4, 4); }
        cx.globalAlpha = 1;
      }
    } else if (f.k === "pop") {
      if (k > 1.2) { fx.splice(i, 1); continue; }
      for (const [d, w] of [[0, 3], [0.15, 2]]) { const q = Math.max(0, k - d) / 1.2; if (q <= 0) continue; cx.strokeStyle = q < 0.4 ? C.heat : C.gold; cx.globalAlpha = 1 - q; cx.lineWidth = lw(w); cx.beginPath(); cx.arc(f.x, f.y, (f.r || 40) * 0.3 + q * (f.r || 40) * 3, 0, TAU); cx.stroke(); }
      cx.globalAlpha = 1;
    } else if (f.k === "lance") {              // the Miner's charge shot: a white lance driven into the rock
      if (k > 0.3) { fx.splice(i, 1); continue; }
      cx.strokeStyle = "#fff"; cx.globalAlpha = (1 - k / 0.3) * 0.9; cx.lineCap = "round";
      cx.lineWidth = lw(6 * (1 - k / 0.3) + 1.5); cx.beginPath(); cx.moveTo(f.x, f.y); cx.lineTo(f.x2, f.y2); cx.stroke(); cx.globalAlpha = 1;
    } else if (f.k === "scan") {
      if (k > 0.5) { fx.splice(i, 1); continue; }
      cx.globalAlpha = 1 - k / 0.5; cx.strokeStyle = C.ice; cx.lineWidth = lw(2); cx.beginPath(); cx.arc(f.x, f.y, 4 + k * 24, 0, TAU); cx.stroke(); cx.globalAlpha = 1;
    } else if (f.k === "deliver") {
      if (k > 1) { fx.splice(i, 1); continue; }
      cx.globalAlpha = 1 - k; cx.strokeStyle = C.gold; cx.lineWidth = lw(2.5); cx.beginPath(); cx.arc(f.x, f.y, 14 + k * 70, 0, TAU); cx.stroke(); cx.globalAlpha = 1;
    } else if (f.k === "pay") {               // the pop's payout: ore squares fly from the core to each player it pays
      const dur = 0.7;
      if (k > dur) { if (f.i === myId && !f.done) { f.done = 1; flyOre(f.x, f.y); } fx.splice(i, 1); continue; }
      const q = k / dur, qe = 1 - (1 - q) * (1 - q), ex = f.rx + (f.x - f.rx) * qe, ey = f.ry + (f.y - f.ry) * qe;
      cx.fillStyle = C.gold; cx.globalAlpha = 0.95;
      for (let j = 0, nj = Math.min(3, Math.ceil((f.u || 100) / 100)); j < nj; j++) { const o2 = j * 2.1 + k * 7; cx.fillRect(ex - 2.5 + Math.sin(o2) * 5, ey - 2.5 + Math.cos(o2) * 5, 5, 5); }
      cx.globalAlpha = 1;
    } else if (f.k === "take" || f.k === "refine") { fx.splice(i, 1); }
    else fx.splice(i, 1);
  }
}
// names over other ships, my mark's arrow, the twin sticks
function drawOverlay(t) {
  cx.font = `700 12px "Atkinson Hyperlegible", system-ui, sans-serif`; cx.textAlign = "center";
  const hov = mouse.over ? shipAt(mouse.x, mouse.y) : null;
  for (const s of ships.values()) {
    if (!s.row || s.id === myId || !s.near) continue;
    const [sx, sy] = toScreen(s.x, s.y); if (sx < -50 || sy < -50 || sx > VW + 50 || sy > VH + 50) continue;
    cx.fillStyle = C.ink; cx.globalAlpha = s === hov ? 1 : 0.35;
    const SPn = G.ships[G.kinds[s.row[4]]] || {}, up = Math.max(24, (Math.max(SPn.r || 24, (SPn.len || 0) / 2) + 12) * zoom);   // (above the ship, whatever its size)
    cx.fillText(names.get(s.id) || "", sx, sy - up - 6); cx.globalAlpha = 1;
  }
  if (ME.mark && mine) {                       // (owner, 2026-10-18) a gold arrow circling my ship, pointing at my marked rock;
    const [sx2, sy2] = toScreen(ME.mark[0], ME.mark[1]), [mx2, my2] = toScreen(mine.x, mine.y);   // stays until unmarked or mined out
    const SPm = myShip() || {}, a2 = Math.atan2(sy2 - my2, sx2 - mx2), bob = Math.sin(t / 180) * 4;
    const ring = Math.max(SPm.r || 24, (SPm.len || 0) / 2) * zoom + 34 + bob;
    cx.save(); cx.fillStyle = C.gold; cx.strokeStyle = C.void; cx.lineWidth = 2;
    cx.translate(mx2 + Math.cos(a2) * ring, my2 + Math.sin(a2) * ring); cx.rotate(a2);
    cx.beginPath(); cx.moveTo(14, 0); cx.lineTo(-9, -10); cx.lineTo(-4, 0); cx.lineTo(-9, 10); cx.closePath(); cx.fill(); cx.stroke();
    cx.restore();
  }
  if (sticks.move || sticks.aim) {
    for (const side of ["move", "aim"]) { const s = sticks[side]; if (!s) continue;
      cx.strokeStyle = C.ink; cx.globalAlpha = 0.25; cx.lineWidth = 2; cx.beginPath(); cx.arc(s.ox, s.oy, 54, 0, TAU); cx.stroke();
      cx.fillStyle = C.ink; cx.globalAlpha = 0.4; const d = Math.min(54, hyp(s.x - s.ox, s.y - s.oy)), a = Math.atan2(s.y - s.oy, s.x - s.ox);
      cx.beginPath(); cx.arc(s.ox + Math.cos(a) * d, s.oy + Math.sin(a) * d, 20, 0, TAU); cx.fill(); cx.globalAlpha = 1; }
  }
}

// ---- the frame ----
let lastT = performance.now(), lastInp = { x: 0, y: 0, turn: 0 };
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000)); lastT = now;
  if (G && haveMe) {
    const inp = typing() ? { x: 0, y: 0, turn: 0 } : pushInput(); lastInp = inp;
    stepMe(dt, inp);
    if (corr.x || corr.y) { const k = 1 - Math.exp(-dt * 5), dx = corr.x * k, dy = corr.y * k; if (allowedMe(mine.x + dx, mine.y + dy)) { mine.x += dx; mine.y += dy; } corr.x -= dx; corr.y -= dy; if (hyp(corr.x, corr.y) < 0.05) corr.x = corr.y = 0; }
    sendInput(inp, now);
    const me = ships.get(myId); if (me) { me.x = mine.x; me.y = mine.y; me.h = mine.h; }
    const rt = Date.now() - (srvOff || 0) - 120;
    for (const s of ships.values()) {
      if (s.id === myId || !s.near || !s.buf.length) continue;
      const B = s.buf; let i = B.length - 1; while (i > 0 && B[i].t > rt) i--;
      const a = B[i], b = B[i + 1], px = s.x, py = s.y;
      if (b && rt >= a.t) { const k = (rt - a.t) / Math.max(1, b.t - a.t); s.x = a.x + (b.x - a.x) * k; s.y = a.y + (b.y - a.y) * k; let dh = b.h - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); s.h = a.h + dh * k; }
      else { s.x = a.x; s.y = a.y; s.h = a.h; }
      s.spd = (s.spd || 0) * 0.8 + (dt > 0 ? hyp(s.x - px, s.y - py) / dt : 0) * 0.2;
    }
    const lead = 0.3, lx = Math.max(-140, Math.min(140, mine.vx * lead)), ly = Math.max(-140, Math.min(140, mine.vy * lead));
    cam.x += (mine.x + lx - cam.x) * Math.min(1, dt * 6); cam.y += (mine.y + ly - cam.y) * Math.min(1, dt * 6);
    tutTick(now);
  }
  zoom += (zoomT - zoom) * Math.min(1, dt * 11); if (Math.abs(zoomT - zoom) < 0.002) zoom = zoomT;
  bmBudget = 1;
  shk.a *= Math.exp(-dt * 5.5); if (shk.a < 0.05) shk.a = 0; shk.x = (Math.random() * 2 - 1) * shk.a; shk.y = (Math.random() * 2 - 1) * shk.a;
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawBackground(now);
  if (G) { drawWorld(now); drawOverlay(now); drawMinimap(now); }
  if (countAt) { const left = Math.ceil((countAt - Date.now()) / 1000); if (left <= 0) { countAt = 0; goUpdating(); } else countEl.textContent = "Update incoming — " + left + " s"; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- the HUD: the mode switch by the hold bar, the ship chip, the hold as a square per ore type ----
const hud = { holdRaw: $("hold-raw"), holdRef: $("hold-ref"), holdNum: $("hold-num"), ship: $("ship-chip"), cargo: $("cargo"), zone: $("zone"), modes: $("modes") };
const elx = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text !== undefined) d.textContent = text; return d; };
let hudKey = "";
function drawHud() {
  if (!G) return;
  const cap = ME.cap || 1200;
  let raw = 0, ref = 0; for (const e of ME.hold || []) { if (e.raw) raw += e.u; else ref += e.u * G.refinedSpace; }
  hud.holdRaw.style.width = (raw / cap) * 100 + "%"; hud.holdRef.style.width = (ref / cap) * 100 + "%";
  hud.holdNum.textContent = Math.round(raw + ref) + " / " + cap;
  if (hud.zone.textContent !== (ME.zone || "")) { hud.zone.textContent = ME.zone || ""; hud.zone.classList.remove("zswap"); void hud.zone.offsetWidth; hud.zone.classList.add("zswap"); }
  hud.ship.textContent = myShip().name;
  const key = JSON.stringify([ME.ship, ME.hold, modeIdx, tut.on]); if (key === hudKey) return; hudKey = key;
  drawModes(); drawCargo();
}
function drawModes() {
  const box = hud.modes; box.replaceChildren();
  const labels = modeLabels();
  if (labels) {
    const m = elx("button", "chip"); m.type = "button"; m.id = "mode-sw";
    for (let i = 0; i < labels.length; i++) { const sg = elx("b", i === modeIdx ? "on" : "", labels[i]);
      sg.addEventListener("click", (e) => { e.stopPropagation(); modeIdx = i; drawHud(); }); m.appendChild(sg); }
    m.addEventListener("click", toggleMode); box.appendChild(m);
  }
  const tb = elx("button", "chip" + (tut.on ? " on" : ""), "Tutorial"); tb.type = "button"; tb.id = "tut-chip";
  tb.addEventListener("click", () => (tut.on ? tutStop() : tutStart())); box.appendChild(tb);
}
function drawCargo() {
  hud.cargo.replaceChildren(
    ...(ME.hold || []).map((e) => {
      const sq = elx("i", "slot" + (e.raw ? "" : " ref") + (e.pt ? " pty" : ""));   // (party ore: outlined, can't be dropped or jetcanned)
      sq.style.background = G.ores[e.o] ? G.ores[e.o].color : "#888";
      sq.appendChild(elx("b", "n", e.u > 9999 ? "9999+" : String(e.u)));
      sq.addEventListener("mouseenter", (ev) => showTip(ev, () => oreName(e.o) + (e.raw ? "" : " · refined") + (e.pt ? " · party" : "") + "\n" + fmt(e.u) + (e.u === 1 ? " unit" : " units")));
      sq.addEventListener("mousemove", moveTip); sq.addEventListener("mouseleave", hideTip);
      return sq;
    }));
}
hud.cargo.addEventListener("contextmenu", (e) => {
  e.preventDefault(); if (!G || myShip().refineUnit || !(ME.hold || []).length) return;
  hideTip(); showMenu(e.clientX, e.clientY, [["Jetcan", () => send({ t: "act", op: "jetcan" })], ["Drop cargo", () => send({ t: "act", op: "drop" })]]);
});
// the tooltip: one at a time, following the pointer
const tipEl = $("tip"); let tipFn = null, tipX = 0, tipY = 0;
function placeTip() { tipEl.style.left = Math.min(tipX + 14, innerWidth - tipEl.offsetWidth - 8) + "px"; tipEl.style.top = Math.max(8, tipY - tipEl.offsetHeight - 10) + "px"; }
function showTip(e, fn) { tipFn = fn; tipX = e.clientX; tipY = e.clientY; tipEl.textContent = fn(); tipEl.hidden = false; placeTip(); }
function moveTip(e) { tipX = e.clientX; tipY = e.clientY; placeTip(); }
function hideTip() { tipFn = null; tipEl.hidden = true; }
function refreshTip() { if (tipFn) { tipEl.textContent = tipFn(); placeTip(); } }
let noteT = 0;
function note(text) { const el = $("note"); el.textContent = text; el.style.opacity = 1; clearTimeout(noteT); noteT = setTimeout(() => { el.style.opacity = 0; }, 2600); }

// ---- the station panel (docked): the four ships, one to board, and storage ----
const stEl = $("station");
const SHIP_STATS = {
  miner: [["Laser", "laserDps", (v) => v + " / s"], ["Reach", "laserRange", (v) => v + " m"]],
  scanner: [["Laser", "laserDps", (v) => v + " / s"], ["Drill", "drillSpeed", (v) => v + " m/s"], ["Drill reach", "drillRange", (v) => v + " m"], ["Vision", "vision", (v) => fmt(v) + " m"], ["Tow reach", "towRange", (v) => v + " m"]],
  booster: [["Boost", "boost", (v) => "×" + v], ["Boost reach", "boostRange", (v) => v + " m"], ["Boost", "boostDur", (v) => v + " s"]],
  hauler: [["Laser", "laserDps", (v) => v + " / s"], ["Refines", "refineUnit", (v) => "1 / " + v + " s"], ["Refine reach", "refineRange", (v) => v + " m"]],
};
let stKey = "";
function drawStation_() {
  stEl.hidden = !ME.docked; if (!ME.docked || !G) return;
  const key = JSON.stringify([ME.ship, ME.storage, G.ships]); if (key === stKey) return; stKey = key;
  const btn = (label, op, disabled = false, cls = "") => { const b = elx("button", cls, label); b.type = "button"; b.disabled = disabled; b.addEventListener("click", () => { send({ t: "st", ...op }); b.blur(); }); return b; };
  const head = elx("div", "st-head");
  head.append(elx("span", "st-title", "Station"));
  const sec2 = elx("section"); sec2.appendChild(elx("h3", null, "Storage"));
  const entries = Object.entries(ME.storage || {}).filter(([, u]) => u > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) sec2.appendChild(elx("p", "st-empty", "Empty"));
  for (const [o, u] of entries) {
    const row = elx("div", "st-row"), sw = elx("span", "st-sw"); sw.style.background = G.ores[o] ? G.ores[o].color : "#888";
    row.append(sw, elx("span", "st-name", oreName(o)), elx("span", "st-n", fmt(u)));
    sec2.appendChild(row);
  }
  const sec1 = elx("section"); sec1.appendChild(elx("h3", null, "Ships"));
  for (const k of G.kinds) {
    const S = G.ships[k], aboard = ME.ship === k, card = elx("div", "st-ship" + (aboard ? " aboard" : ""));
    const h2 = elx("div", "st-ship-head"); h2.append(elx("span", "st-ship-name", S.name), aboard ? elx("span", "st-tag", "Aboard") : btn("Board", { op: "ship", k }, false, "gold"));
    const st = elx("div", "st-stats");
    for (const [label, stat, f] of [["Hold", "hold", (v) => fmt(v) + " units"], ["Speed", "speed", (v) => v + " m/s"], ...SHIP_STATS[k]]) {
      if (S[stat] === undefined) continue; st.append(elx("span", null, label), elx("b", null, f(S[stat])));
    }
    card.append(h2, st); sec1.appendChild(card);
  }
  stEl.replaceChildren(head, sec2, ...(G.kinds.length > 1 ? [sec1] : []));   // (one ship for now: no board list)
}
stEl.addEventListener("mousedown", (e) => e.stopPropagation());

// ---- the minimap: the whole ring system, north up; the station, my ship, ships near me, my mark ----
const mm = $("minimap"), mx = mm.getContext("2d");
let mmZoom = 1; try { const z = +localStorage.getItem("atamus.mmZoom"); if (z >= 1 && z <= 12) mmZoom = z; } catch {}
mm.addEventListener("wheel", (e) => { e.preventDefault(); e.stopPropagation(); mmZoom = Math.min(12, Math.max(1, mmZoom * (e.deltaY > 0 ? 0.8 : 1.25))); try { localStorage.setItem("atamus.mmZoom", String(mmZoom)); } catch {} }, { passive: false });
let mmNext = 0, mmView = null;
function zoneAt(x, y) {
  const W = G.world, r = hyp(x, y); if (r < W.safeR) return "Station"; if (r > W.lockedR) return "";
  let ring = W.rings.length;
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
  for (const s of ships.values()) if (s.id !== myId && s.near) { const [x, y] = P(s.x, s.y); mx.fillStyle = C.ink; mx.beginPath(); mx.arc(x, y, 2, 0, TAU); mx.fill(); }
  if (ME.mark) { const [px, py] = P(ME.mark[0], ME.mark[1]); mx.save(); mx.translate(px, py); mx.rotate(Math.PI / 4); mx.fillStyle = C.gold; mx.strokeStyle = C.void; mx.lineWidth = 1; mx.fillRect(-3.4, -3.4, 6.8, 6.8); mx.strokeRect(-3.4, -3.4, 6.8, 6.8); mx.restore(); }
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

// ---- menus ----
const ctxMenu = $("ctx-menu");
function hideMenu() { ctxMenu.hidden = true; }
function showMenu(x, y, items) {
  ctxMenu.replaceChildren(...items.map(([label, fn]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.addEventListener("click", () => { hideMenu(); fn(); }); return b; }));
  ctxMenu.hidden = false; ctxMenu.style.left = Math.min(x, innerWidth - 180) + "px"; ctxMenu.style.top = Math.min(y, innerHeight - ctxMenu.offsetHeight - 8) + "px";
}
addEventListener("pointerdown", (e) => { if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) hideMenu(); }, true);
// an in-game yes / no (the page's own confirm dialogs aren't used)
function askConfirm(text, yes, opt = {}) {
  const box = $("confirm"), by = $("confirm-yes"), bn = $("confirm-no"); $("confirm-text").textContent = text; box.hidden = false;
  by.textContent = opt.yes || "Destroy"; bn.textContent = opt.no || "Cancel"; by.className = opt.calm ? "gold" : "warn";
  by.onclick = () => { box.hidden = true; yes(); }; bn.onclick = () => { box.hidden = true; if (opt.onNo) opt.onNo(); };
}
// ---- parties (owner, 2026-10-18): right-click a pilot to invite; the party window shows to everyone in it; the leader
// right-clicks a member to kick; you right-click yourself to leave ----
let PARTY = null;                              // { id, leader, members: [{ i, n, on }] } or null
const inMyParty = (id) => !!PARTY && PARTY.members.some((m2) => m2.i === id);
function partyItems(id) {
  if (id === myId) return PARTY ? [["Leave party", () => send({ t: "act", op: "leave" })]] : [];
  if (inMyParty(id)) return PARTY.leader === myId ? [["Kick from party", () => send({ t: "act", op: "kick", who: id })]] : [];
  return !PARTY || PARTY.members.length < 8 ? [["Invite to party", () => send({ t: "act", op: "invite", to: id })]] : [];
}
function drawParty() {
  const el = $("party"); el.hidden = !PARTY; if (!PARTY) return;
  el.replaceChildren(elx("h3", null, "Party"), ...PARTY.members.map((m2) => {
    const row = elx("div", "pm" + (m2.on ? "" : " off") + (m2.i === myId ? " me" : ""));
    row.append(elx("span", "pm-n", m2.n || "?")); if (m2.i === PARTY.leader) row.append(elx("span", "pm-l", "Leader"));
    row.addEventListener("contextmenu", (e) => { e.preventDefault(); const it = partyItems(m2.i); if (it.length) showMenu(e.clientX, e.clientY, it); });
    return row;
  }));
}
// (owner, 2026-10-18) the hamburger: a menu with Settings; Settings offers a respawn at the station
{ const bg = $("burger"), sp = $("settings");
  bg.addEventListener("click", (e) => { e.stopPropagation(); const r = bg.getBoundingClientRect(); showMenu(r.left, r.bottom + 6, [["Settings", () => { sp.hidden = false; }]]); });
  $("settings-x").addEventListener("click", () => { sp.hidden = true; });
  $("respawn").addEventListener("click", () => { send({ t: "act", op: "respawn" }); sp.hidden = true; });
  addEventListener("keydown", (e) => { if (e.code === "Escape") sp.hidden = true; }); }

// ---- the optional per-ship tutorial (owner, 2026-10-18): each step completes when you actually do it ----
const tutEv = { cut: false, popped: false, delivered: false, blast: false, refined: false };
const nearRock = () => { for (const r of rocks.values()) if (hyp(r.dx - mine.x, r.dy - mine.y) < r.r + 260) return true; return false; };
const TUT = {
  miner: [
    ["Fly out to a ring and up to an asteroid", nearRock],
    ["Hold fire to cut through the masonry — darker chunks are denser and take longer", () => tutEv.cut],
    ["Cut a chunk with ore bits — each bit rides the beam back into your hold", () => (ME.hold || []).length > 0],
    ["Cut a path to the core and break it open", () => tutEv.popped],
    ["Press F twice for the withdraw field and pull in the scattered corium", () => (ME.hold || []).some((e) => e.o === "corium")],
    ["Haul it to the station to deliver", () => tutEv.delivered],
  ],
  scanner: [                                   // (owner, 2026-10-18) the scan beam
    ["Fly out to a ring and up to an asteroid", nearRock],
    ["Hold fire to scan — the beam works toward the core a chunk at a time, revealing density, ore and bedrock for everyone", () => tutEv.scanned],
  ],
  flight: [
    ["Fly out to a ring and up to an asteroid", nearRock],
    ["This ship has no tools yet — fly over a jetcan you may haul from to load up", () => (ME.hold || []).length > 0],
    ["Haul it to the station to deliver", () => tutEv.delivered],
  ],
};
const tut = { on: false, idx: 0, at: 0 };
let tutShipK = "miner";
function tutStart() {
  tut.on = true; tut.idx = 0; tut.at = performance.now(); tutShipK = ME.ship;
  Object.assign(tutEv, { cut: false, popped: false, delivered: false, blast: false, refined: false });
  tutShow(); hudKey = ""; drawHud();
}
function tutStop() { tut.on = false; $("tut").hidden = true; hudKey = ""; drawHud(); }
const tutSteps = () => { const S0 = G && G.ships[tutShipK]; return S0 && S0.laserDps ? TUT.miner : S0 && S0.scanDps ? TUT.scanner : TUT.flight; };
function tutShow() { const steps = tutSteps(); $("tut").hidden = false; $("tut-n").textContent = (tut.idx + 1) + "/" + steps.length; $("tut-text").textContent = steps[tut.idx][0]; }
function tutTick(now) {
  if (!tut.on) return;
  if (ME.ship !== tutShipK) { tutStart(); return; }               // switched ships: that ship's tutorial
  const steps = tutSteps(), st = steps[tut.idx];
  if (!((st[1] && st[1]()) || (st[2] && now - tut.at > st[2] * 1000))) return;
  tut.idx++; tut.at = now;
  if (tut.idx >= steps.length) { tutStop(); note("Tutorial complete"); } else tutShow();
}
$("tut-skip").addEventListener("click", tutStop);

connect();

// for the test harness and the console
window.Atamus = {
  get me() { return { ...mine, id: myId, name: myName }; }, get state() { return ME; }, get game() { return G; },
  get rocks() { return [...rocks.values()].map((r) => ({ id: r.id, x: r.x, y: r.y, shells: r.shells, r: r.r, broken: r.broken, hp: r.hp, tow: r.tow, heat: r.heat || 0, fill: r.fill || 0 })); },
  chunks: (id) => details.get(id) || null,
  get cans() { return [...cansM.values()]; },
  detail: (id) => { const d = details.get(id); return d ? d.c.map((c0) => ({ i: c0[0], broken: c0[5] & 1, d: c0[6], ore: c0[7], n: c0[9] })) : null; },
  get drops() { return [...dropsM.values()].map((o) => ({ id: o.id, x: o.x, y: o.y, ore: ORE_KEYS[o.ore], units: o.units })); },
  get ships() { return [...ships.values()].filter((s) => s.row).map((s) => ({ id: s.id, x: s.x, y: s.y, near: s.near, ship: G && G.kinds[s.row[4]], fl: s.row[5], len: s.row[7], bt: (s.row[11] || 0) / 100, ck: (s.row[12] || 0) / 100, beamTgt: s.row[9] || 0, drill: s.row[5] & 16 ? { rock: s.row[8], depth: s.row[13] || 0 } : null })); },
  cast: (a) => { const [mx2, my2] = muzzleOf(mine.x, mine.y, mine.h, myShip()); return castLocal(mx2, my2, a, myShip().laserRange); },
  screenOf: (x, y) => { const [sx, sy] = toScreen(x, y); return { x: sx, y: sy }; }, send: (o) => send(o), get zoom() { return zoom; }, set zoom(z) { zoom = zoomT = z; },
  get mode() { return modeIdx; }, set mode(v) { modeIdx = v ? 1 : 0; drawHud(); },
};
