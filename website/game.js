// Atamus: Saturn ring mining (owner, 2026-10-16: the 2D prototype). One shared world seen from above: Saturn in the
// middle, the station beside it, two asteroid rings, the locked line past them. W / S thrust along the nose, A / D turn,
// Q / E strafe; the mouse aims; the left button holds the mining laser on; the right button uses the module on a ship or
// an asteroid; F switches the module on or off; the wheel zooms. Fly into the station to deliver the hold and use its panel.
// The server decides everything; this page predicts my own ship with the same numbers and draws the rest.
import { C, ART, hullLen, drawShip, drawStation, drawRock, drawSaturn } from "./shipart.js?v=1792300002";

if (typeof needLogin === "function" && needLogin()) location.replace("login.html");
const $ = (id) => document.getElementById(id);
const statusEl = $("status"), countEl = $("countdown");
const WEB_BUILD = (document.querySelector('meta[name="atamus-build"]') || {}).content || "";
const TAU = Math.PI * 2, hyp = Math.hypot;

// ---- the game's numbers (the hello sends them) ----
let G = null;
const rockR = (n) => 10 + 3.3 * n, crackHp = (n) => 80 + 8 * n, towFactor = (n) => 0.6 - (n - 1) * 0.025;
const sectorOf = (x, y) => (((Math.round(Math.atan2(x, -y) / (Math.PI / 2))) % 4) + 4) % 4;
const ORE_KEYS = ["iron", "nickel", "ice", "titanium", "cobalt", "platinum"];
const oreName = (k) => (G && G.ores[k] ? G.ores[k].name : k);

// ---- state ----
let myId = null, myName = "", amStaff = false, haveMe = false;
const mine = { x: 0, y: 0, vx: 0, vy: 0, h: 0, inSector: -1 };
const corr = { x: 0, y: 0 };
let ME = { fuel: 100, tank: 100, cap: 5, hold: {}, credits: 0, docked: 0, module: "miner", on: 1, tow: 0, pump: 0, refine: 0, sos: 0, zone: "" };
let STATION = { storage: {}, queue: [], modules: [] }, SOC = { party: null, corp: null };
let sectors = [1, 0, 0, 0], online = 0, sosList = [];
const ships = new Map();                       // id -> { id, name, buf, row, x, y, h, near }
const rocks = new Map();                       // id -> { id, x, y, n, cracks, hp, ore, tow, dx, dy }
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
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => { keys.clear(); firing = false; });
document.addEventListener("contextmenu", (e) => e.preventDefault());
cv.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.over = true; });
cv.addEventListener("mouseleave", () => { mouse.over = false; });
cv.addEventListener("mousedown", (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (e.button === 0) firing = true;
  if (e.button === 2) {                        // the module, on whatever is under the pointer: another ship, else an asteroid
    const [wx, wy] = toWorld(e.clientX, e.clientY); let best = null, bd = 34 / Math.min(1, zoom);
    for (const s of ships.values()) { if (s.id === myId || !s.near) continue; const d = hyp(s.x - wx, s.y - wy); if (d < bd) { bd = d; best = s; } }
    if (best) { send({ t: "act", ship: best.id }); return; }
    let rk = null; for (const r of rocks.values()) { const d = hyp(r.dx - wx, r.dy - wy); if (d < rockR(r.n) + 6) { rk = r; break; } }
    if (rk) send({ t: "act", rock: rk.id });
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
let resetPos = new URLSearchParams(location.search).get("resetpos") === "1";   // Reset location (play.html): back at the station, on the first connection only
const wsUrl = () => { const q = new URLSearchParams(); if (typeof deviceId === "function") q.set("d", deviceId()); const as = new URLSearchParams(location.search).get("as"); if (as) q.set("as", as); if (resetPos) { q.set("resetpos", "1"); resetPos = false; }
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
  if (m.t === "hello") {
    srvBuild = m.build || "";
    if (m.updating && m.updating.parts) { if (typeof m.updating.to === "string" && /^[0-9a-f]{7,40}$/.test(m.updating.to)) countHead = m.updating.to; goUpdating(m.updating.parts); return; }
    G = m.game; myId = m.you.id; myName = m.you.name; amStaff = !!m.you.staff;
    mine.x = m.spawn.x; mine.y = m.spawn.y; mine.h = m.spawn.h || 0; mine.vx = mine.vy = 0; corr.x = corr.y = 0; haveMe = true; cam.x = mine.x; cam.y = mine.y;
    sectors = m.sectors || sectors; online = m.online || 0;
    ships.clear(); rocks.clear(); ores.clear(); names.clear(); snapRows = new Map();
    for (const r of m.roster || []) names.set(r.i, r.n);
    if (m.you.staff && window.AdminPanel) window.AdminPanel.mount();
    if (m.countdown) startCountdown(Date.now() + m.countdown.in, m.countdown.parts, m.countdown.head);
    drawPrefix();
  } else if (m.t === "snap") onSnap(m);
  else if (m.t === "rocks") {
    for (const r of m.a || []) { const [id, x, y, n, cracks, hp, ore, tow] = r; const o = rocks.get(id); if (o) Object.assign(o, { x, y, n, cracks, hp, ore, tow }); else rocks.set(id, { id, x, y, n, cracks, hp, ore, tow, dx: x, dy: y }); }
    for (const id of m.x || []) rocks.delete(id);
  } else if (m.t === "ores") {
    for (const r of m.a || []) { const [id, x, y, oi, ref] = r; const o = ores.get(id); if (o) Object.assign(o, { x, y }); else ores.set(id, { id, x, y, dx: x, dy: y, o: ORE_KEYS[oi] || "iron", r: ref }); }
    for (const id of m.x || []) ores.delete(id);
  } else if (m.t === "me") { const wasDocked = ME.docked; ME = m; if (ME.docked !== wasDocked) drawStation_(); drawHud(); }
  else if (m.t === "station") { STATION = m; STATION.at = performance.now(); drawStation_(); }
  else if (m.t === "soc") { SOC = m; drawParty(); }
  else if (m.t === "sectors") { sectors = m.s; online = m.online; }
  else if (m.t === "sos") sosList = m.s || [];
  else if (m.t === "fx") fx.push({ ...m, t0: performance.now() });
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
  const r = hyp(x, y); if (r < G.world.saturnR + G.ship.shipR || r > G.world.lockedR) return false;
  if (r < G.world.safeR) return true; const s = sectorOf(x, y); return sectors[s] > 0 || mine.inSector === s;
}
function stepMe(dt, inp) {
  const S = G.ship, empty = ME.fuel <= 0.0001, rock = ME.tow && rocks.get(ME.tow);
  const k = empty ? S.crawl : 1, spd = S.speed * k * (rock ? towFactor(rock.n) : 1), push = hyp(inp.x, inp.y);
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
  drawSaturn(cx, W.saturnR, ts);
  // the station and its docking circle
  cx.save(); cx.translate(W.station[0], W.station[1]);
  cx.strokeStyle = C.gold; cx.globalAlpha = 0.35; cx.lineWidth = lw(1.5); cx.setLineDash([lw(3), lw(8)]); cx.beginPath(); cx.arc(0, 0, W.dockR, 0, TAU); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1;
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
  // loose ore: raw brown, refined purple, edged with the ore's color
  for (const o of ores.values()) { o.dx += (o.x - o.dx) * 0.25; o.dy += (o.y - o.dy) * 0.25; const s = 7; cx.fillStyle = o.r ? C.ore : C.brown; cx.fillRect(o.dx - s / 2, o.dy - s / 2, s, s); cx.strokeStyle = G.ores[o.o].color; cx.lineWidth = lw(1.5); cx.strokeRect(o.dx - s / 2, o.dy - s / 2, s, s); }
  // ships: module effects under them, the hull, lasers and links over
  for (const s of ships.values()) if (s.row && (s.id === myId || s.near)) shipFx(s, ts, true);
  for (const s of ships.values()) if (s.row && (s.id === myId || s.near)) {
    const r = s.row, m = G.kinds[r[4]], fl = r[5], st = { t: ts, raw: r[11] / 100, ref: r[12] / 100, fuel: r[13] / 100, firing: !!(fl & 2), on: !!(fl & 4), busy: !!(r[8] || r[9] || r[10]) || (m === "refinery" && !!(fl & 4)), thrust: s.id === myId ? hyp(lastInp.x, lastInp.y) : Math.min(1, (s.spd || 0) / 40) };
    if (s.id === myId) { st.fuel = ME.fuel / (ME.tank || 100); }
    cx.save(); cx.translate(s.x, s.y); cx.rotate(s.h); cx.scale(ART, ART); drawShip(cx, m, st); cx.restore();
  }
  for (const s of ships.values()) if (s.row && (s.id === myId || s.near)) shipFx(s, ts, false);
  drawFx(t);
  cx.restore();
}
// a ship's module at work: the command ring under it; over it, the laser, the tractor's leash, the hose, the refine link
function shipFx(s, ts, under) {
  const r = s.row, m = G.kinds[r[4]], fl = r[5], lw = (px) => px / zoom;
  if (under) {
    if (m === "command" && fl & 4) {
      const R = G.modules.command.radius;
      cx.save(); cx.translate(s.x, s.y);
      cx.strokeStyle = C.gold; cx.lineWidth = lw(2); cx.globalAlpha = 0.5; cx.setLineDash([lw(26), lw(10), lw(4), lw(10)]); cx.rotate(ts / 20 * TAU); cx.beginPath(); cx.arc(0, 0, R, 0, TAU); cx.stroke();
      cx.setLineDash([]); const k = (ts % 2.6) / 2.6; cx.globalAlpha = 0.6 * (1 - k); cx.beginPath(); cx.arc(0, 0, 20 + (R - 20) * k, 0, TAU); cx.stroke(); cx.restore(); cx.globalAlpha = 1;
    }
    return;
  }
  if (fl & 2) {                                // the mining laser, from the nose along the aim to whatever it hits
    const a = r[6] / 1000, len = r[7], big = m === "miner" && fl & 4, x0 = s.x + Math.sin(s.h) * 20, y0 = s.y - Math.cos(s.h) * 20, x1 = s.x + Math.cos(a) * len, y1 = s.y + Math.sin(a) * len;
    cx.strokeStyle = C.signal; cx.lineCap = "round";
    cx.globalAlpha = 0.25; cx.lineWidth = lw(big ? 9 : 5); cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
    cx.globalAlpha = 1; cx.lineWidth = lw(big ? 3 : 1.6); cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
    if (fl & 1) { cx.fillStyle = "#fff"; cx.globalAlpha = 0.6 + 0.4 * Math.sin(ts * 50); cx.beginPath(); cx.arc(x1, y1, lw(big ? 6 : 4), 0, TAU); cx.fill(); cx.globalAlpha = 1; }
  }
  const at = (lx, ly) => { const c = Math.cos(s.h), sn = Math.sin(s.h); return [s.x + lx * c - ly * sn, s.y + lx * sn + ly * c]; };
  const yc = (10 + 56 + hullLen(m) + 92) / 2;
  if (r[8]) {                                  // the tractor's leash, from both claw tips back to the asteroid
    const rk = rocks.get(r[8]);
    if (rk) { cx.strokeStyle = C.ice; cx.lineWidth = lw(2); cx.setLineDash([lw(4), lw(5)]); cx.globalAlpha = 0.5 + 0.5 * Math.sin(ts * 4.5); cx.beginPath();
      for (const lx of [35, 145]) { const [px, py] = at((lx - 90) * ART, (318 - yc) * ART); cx.moveTo(px, py); cx.lineTo(rk.dx, rk.dy); } cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1; }
  }
  const link = (id, color, dash, ly) => { const q = id === myId ? { x: mine.x, y: mine.y } : ships.get(id); if (!q) return; const [px, py] = at(0, ly); cx.strokeStyle = color; cx.lineWidth = lw(2.5); cx.setLineDash(dash.map(lw)); cx.beginPath(); cx.moveTo(px, py); cx.quadraticCurveTo((px + q.x) / 2 + 10, (py + q.y) / 2 - 10, q.x, q.y); cx.stroke(); cx.setLineDash([]); };
  if (r[9]) link(r[9], C.ice, [], (154 - yc) * ART);            // the fueler's hose, from the pump on top of the tank
  if (r[10] && r[10] !== s.id) link(r[10], C.ore, [6, 5], 0);   // the refinery working on another ship's hold
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
  for (const s of ships.values()) {
    if (!s.row || s.id === myId || !s.near) continue;
    const [sx, sy] = toScreen(s.x, s.y); if (sx < -50 || sy < -50 || sx > VW + 50 || sy > VH + 50) continue;
    cx.fillStyle = party.has(s.id) ? C.gold : C.ink; cx.globalAlpha = 0.9; cx.fillText(names.get(s.id) || "", sx, sy - 40 * Math.max(0.6, zoom) - 6); cx.globalAlpha = 1;
  }
  for (const [id, x, y] of sosList) {
    const px = id === myId ? mine.x : x, py = id === myId ? mine.y : y; let [sx, sy] = toScreen(px, py); const off = sx < 16 || sy < 16 || sx > VW - 16 || sy > VH - 16;
    if (off) { const a = Math.atan2(sy - VH / 2, sx - VW / 2), k = Math.min((VW / 2 - 28) / Math.abs(Math.cos(a) || 1e-6), (VH / 2 - 28) / Math.abs(Math.sin(a) || 1e-6)); sx = VW / 2 + Math.cos(a) * k; sy = VH / 2 + Math.sin(a) * k; }
    else sy -= 56 * Math.max(0.6, zoom);
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
  if (G) { drawWorld(now); drawOverlay(now); drawMinimap(now); drawHudLive(now); }
  if (countAt) { const left = Math.ceil((countAt - Date.now()) / 1000); if (left <= 0) { countAt = 0; goUpdating(); } else countEl.textContent = "Update incoming — " + left + " s"; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- the HUD: the hold (raw brown, refined purple), fuel, the module, credits, where I am ----
const hud = { holdRaw: $("hold-raw"), holdRef: $("hold-ref"), holdNum: $("hold-num"), fuel: $("fuel-fill"), fuelNum: $("fuel-num"), mod: $("mod-chip"), credits: $("credits"), zone: $("zone") };
function holdCounts() { let raw = 0, ref = 0; for (const [k, n] of Object.entries(ME.hold || {})) { if (k.endsWith("+")) ref += n; else raw += n; } return { raw, ref }; }
function drawHud() {
  if (!G) return;
  const { raw, ref } = holdCounts(), cap = ME.cap || 5, used = raw + ref * G.refinedSpace;
  hud.holdRaw.style.width = (raw / cap) * 100 + "%"; hud.holdRef.style.width = (ref * G.refinedSpace / cap) * 100 + "%";
  hud.holdNum.textContent = (Math.round(used * 10) / 10) + " / " + cap;
  const M = G.modules[ME.module] || {}, actv = M.active && ME.module !== "tractor" && ME.module !== "scanner";
  hud.mod.textContent = (M.name || ME.module) + (actv ? (ME.module === "refinery" ? (ME.refine ? " · Refining" : "") : ME.on ? " · On" : " · Off") : "");
  hud.mod.classList.toggle("on", !!(actv && (ME.on || ME.refine)));
  hud.credits.textContent = fmt(ME.credits || 0);
  hud.zone.textContent = ME.zone || "";
}
function drawHudLive() {
  const f = Math.max(0, ME.fuel), T = ME.tank || 100;
  hud.fuel.style.width = Math.min(100, f / T * 100) + "%"; hud.fuel.classList.toggle("low", f < T * 0.15);
  hud.fuelNum.textContent = Math.round(f) + " / " + T;
}

// ---- the station panel (docked) ----
const stEl = $("station");
let stKey = "";
function drawStation_() {
  stEl.hidden = !ME.docked; if (!ME.docked || !G) return;
  const key = JSON.stringify([STATION.storage, STATION.queue, STATION.modules, ME.module, ME.credits, Math.round(ME.fuel), ME.tank]); if (key === stKey) return; stKey = key;
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text !== undefined) d.textContent = text; return d; };
  const btn = (label, op, disabled = false, cls = "") => { const b = el("button", cls, label); b.type = "button"; b.disabled = disabled; b.addEventListener("click", () => { send({ t: "st", ...op }); b.blur(); }); return b; };
  const head = el("div", "st-head"); head.append(el("span", "st-title", "Station"), el("span", "st-cr", fmt(ME.credits)));
  // storage
  const sec1 = el("section"); sec1.appendChild(el("h3", null, "Storage"));
  const S = STATION.storage || {}, rows = Object.keys(S).filter((k) => S[k] > 0).sort();
  if (!rows.length) sec1.appendChild(el("p", "st-empty", "Empty"));
  for (const k of rows) {
    const n = S[k], row = el("div", "st-row");
    if (k === "fuel") { row.append(el("span", "st-sw fuel"), el("span", "st-name", "Fuel blocks"), el("span", "st-n", fmt(n)), btn("Fill tank", { op: "blocks" }, ME.fuel >= ME.tank - G.fuel.blockFuel + 0.01)); }
    else {
      const o = k.replace(/\+$/, ""), ref = k.endsWith("+"), price = G.ores[o].price * (ref ? G.refinedMul : 1);
      const sw = el("span", "st-sw" + (ref ? " ref" : "")); sw.style.borderColor = G.ores[o].color;
      row.append(sw, el("span", "st-name", oreName(o) + (ref ? " · refined" : "")), el("span", "st-n", fmt(n)));
      const acts = el("span", "st-acts");
      acts.append(btn("Sell " + fmt(price * n), { op: "sell", k, n }, false, "gold"));
      if (!ref) acts.append(btn("Refine", { op: "refine", o, n }));
      if (o === "ice" && !ref) acts.append(btn("Make fuel", { op: "craft", n }));
      row.appendChild(acts);
    }
    sec1.appendChild(row);
  }
  // the queue
  const sec2 = el("section"); sec2.appendChild(el("h3", null, "Queue"));
  const Q = STATION.queue || []; if (!Q.length) sec2.appendChild(el("p", "st-empty", "Idle"));
  Q.forEach((j, i) => {
    const row = el("div", "st-row q"), dur = (j.k === "fuel" ? G.fuel.blockTime : G.stationRefine) * 1000;
    row.append(el("span", "st-name", (j.k === "fuel" ? "Fuel blocks" : oreName(j.o) + " · refining")), el("span", "st-n", fmt(j.left)));
    const bar = el("span", "st-bar"); const fill = el("i"); bar.appendChild(fill); if (i === 0) { fill.dataset.at = j.at; fill.dataset.dur = dur; } row.appendChild(bar); sec2.appendChild(row);
  });
  // fuel
  const sec3 = el("section"); sec3.appendChild(el("h3", null, "Fuel"));
  { const space = Math.max(0, ME.tank - ME.fuel), cost = Math.ceil(space) * G.fuel.stationPrice, row = el("div", "st-row");
    row.append(el("span", "st-sw fuel"), el("span", "st-name", "Tank"), el("span", "st-n", Math.round(ME.fuel) + " / " + ME.tank), btn("Fill " + fmt(cost), { op: "fuel" }, space < 1 || ME.credits < G.fuel.stationPrice, "gold"));
    sec3.appendChild(row); }
  // modules
  const sec4 = el("section"); sec4.appendChild(el("h3", null, "Modules"));
  for (const k of G.kinds) {
    const M = G.modules[k], owned = (STATION.modules || []).includes(k), row = el("div", "st-row");
    row.append(el("span", "st-name", M.name));
    if (ME.module === k) row.appendChild(el("span", "st-tag", "Equipped"));
    else if (owned) row.appendChild(btn("Equip", { op: "equip", m: k }));
    else row.appendChild(btn("Buy " + fmt(M.price), { op: "buy", m: k }, ME.credits < M.price, "gold"));
    sec4.appendChild(row);
  }
  stEl.replaceChildren(head, sec1, sec2, sec3, sec4);
}
setInterval(() => {                            // the running job's bar (between the server's updates)
  for (const f of stEl.querySelectorAll(".st-bar i[data-at]")) { const at = +f.dataset.at, dur = +f.dataset.dur, srvNow = Date.now() - (srvOff || 0); f.style.width = Math.max(0, Math.min(100, (srvNow - at) / dur * 100)) + "%"; }
}, 250);
stEl.addEventListener("mousedown", (e) => e.stopPropagation());

// ---- my party and corporation, top left ----
const partyEl = $("party");
function drawParty() {
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text !== undefined) d.textContent = text; return d; };
  const out = [];
  if (SOC.corp) out.push(el("div", "pt-corp", SOC.corp));
  if (SOC.party) { const box = el("div", "pt-list"); box.appendChild(el("div", "pt-head", "Party")); for (const [id, n] of SOC.party.members) { const r = el("div", "pt-mem" + (id === SOC.party.leader ? " lead" : ""), n); box.appendChild(r); } out.push(box); }
  partyEl.replaceChildren(...out); partyEl.hidden = !out.length;
}

// ---- the minimap: the whole ring system, north up; the open sectors, the station, my ship, ships near me, distress ----
const mm = $("minimap"), mx = mm.getContext("2d");
let mmZoom = 1; try { const z = +localStorage.getItem("atamus.mmZoom"); if (z >= 1 && z <= 12) mmZoom = z; } catch {}
mm.addEventListener("wheel", (e) => { e.preventDefault(); e.stopPropagation(); mmZoom = Math.min(12, Math.max(1, mmZoom * (e.deltaY > 0 ? 0.8 : 1.25))); try { localStorage.setItem("atamus.mmZoom", String(mmZoom)); } catch {} }, { passive: false });
let mmNext = 0;
function drawMinimap(now) {
  if (now < mmNext) return; mmNext = now + 100;
  const d = Math.min(devicePixelRatio || 1, 2), Wd = mm.clientWidth, Hd = mm.clientHeight;
  if (mm.width !== Math.round(Wd * d)) { mm.width = Math.round(Wd * d); mm.height = Math.round(Hd * d); }
  mx.setTransform(d, 0, 0, d, 0, 0); mx.clearRect(0, 0, Wd, Hd);
  const W = G.world, R = Wd / 2 - 4, k = R / W.lockedR * mmZoom, ox = mmZoom > 1.01 ? mine.x : 0, oy = mmZoom > 1.01 ? mine.y : 0;
  const P = (x, y) => [Wd / 2 + (x - ox) * k, Hd / 2 + (y - oy) * k];
  mx.save(); mx.beginPath(); mx.arc(Wd / 2, Hd / 2, R + 3, 0, TAU); mx.fillStyle = "rgba(11,14,21,0.88)"; mx.fill(); mx.clip();
  const [c0, c1] = P(0, 0);
  for (const [a, b] of W.rings) { mx.strokeStyle = "rgba(216,176,106,0.18)"; mx.lineWidth = (b - a) * k; mx.beginPath(); mx.arc(c0, c1, (a + b) / 2 * k, 0, TAU); mx.stroke(); }
  for (let i = 0; i < 4; i++) if (sectors[i] !== 1) { const s0 = -Math.PI / 2 + i * Math.PI / 2 - Math.PI / 4; mx.fillStyle = sectors[i] === 2 ? "rgba(229,96,79,0.12)" : "rgba(0,0,0,0.55)"; mx.beginPath(); mx.arc(c0, c1, W.lockedR * k, s0, s0 + Math.PI / 2); mx.arc(c0, c1, W.safeR * k, s0 + Math.PI / 2, s0, true); mx.closePath(); mx.fill(); }
  mx.strokeStyle = C.signal; mx.lineWidth = 1; mx.setLineDash([4, 3]); mx.beginPath(); mx.arc(c0, c1, W.lockedR * k, 0, TAU); mx.stroke(); mx.setLineDash([]);
  mx.fillStyle = "#cfa15a"; mx.beginPath(); mx.arc(c0, c1, Math.max(3, W.saturnR * k), 0, TAU); mx.fill();
  { const [sx, sy] = P(W.station[0], W.station[1]); mx.fillStyle = C.gold; mx.fillRect(sx - 2.5, sy - 2.5, 5, 5); }
  const party = new Set(SOC.party ? SOC.party.members.map((m) => m[0]) : []);
  for (const s of ships.values()) if (s.id !== myId && s.near) { const [x, y] = P(s.x, s.y); mx.fillStyle = party.has(s.id) ? C.gold : C.ink; mx.beginPath(); mx.arc(x, y, 2, 0, TAU); mx.fill(); }
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
chatLog.addEventListener("contextmenu", (e) => {
  e.preventDefault(); const who = e.target.closest && e.target.closest(".chat-who[data-id]"); if (!who) return;
  const id = who.dataset.id, name = who.dataset.name;
  const item = (label, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.addEventListener("click", () => { hideMenu(); fn(); }); return b; };
  ctxMenu.replaceChildren(item("Whisper", () => { lastWhisper = { id, name }; chatCh = "whisper"; openChat(); }), item("Invite to party", () => send({ t: "party", op: "invite", to: id })),
    ...(SOC.corp ? [item("Invite to corporation", () => send({ t: "corp", op: "invite", to: id }))] : []), item("Report", () => openReport(id, name)),
    ...(amStaff && window.AdminPanel ? [item("Admin", () => window.AdminPanel.act(id, name))] : []));
  ctxMenu.hidden = false; ctxMenu.style.left = Math.min(e.clientX, innerWidth - 170) + "px"; ctxMenu.style.top = Math.min(e.clientY, innerHeight - 170) + "px";
});
addEventListener("pointerdown", (e) => { if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) hideMenu(); }, true);
const reportBox = $("report-box"); let reportFor = null;
function openReport(id, name) { reportFor = id; $("report-title").textContent = "Report " + name; $("report-text").value = ""; reportBox.hidden = false; keys.clear(); $("report-text").focus(); }
$("report-text").addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") reportBox.hidden = true; });
$("report-cancel").addEventListener("click", () => { reportBox.hidden = true; });
$("report-send").addEventListener("click", () => { const text = $("report-text").value.trim(); if (!text || !reportFor) return; send({ t: "report", i: reportFor, text }); reportBox.hidden = true; });

connect();

// for the test harness and the console
window.Atamus = {
  get me() { return { ...mine, id: myId }; }, get state() { return ME; }, get station() { return STATION; }, get soc() { return SOC; }, get sectors() { return sectors; },
  get rocks() { return [...rocks.values()].map((r) => ({ id: r.id, x: r.x, y: r.y, n: r.n, cracks: r.cracks, hp: r.hp, ore: r.ore })); }, get ores() { return [...ores.values()]; },
  get ships() { return [...ships.values()].filter((s) => s.row).map((s) => ({ id: s.id, x: s.x, y: s.y, near: s.near, m: G && G.kinds[s.row[4]], fl: s.row[5], len: s.row[7] })); },
  screenOf: (x, y) => { const [sx, sy] = toScreen(x, y); return { x: sx, y: sy }; }, send: (o) => send(o), get zoom() { return zoom; }, set zoom(z) { zoom = z; },
};
