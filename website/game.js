// Atamus tech-demo client — canvas world (systems + one stargate).
// The windowed UI lives in ui.js; this file exposes a small bridge for chat.
(() => {
  "use strict";

  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");

  let cfg = null, me = { id: null, name: "" };
  let snap = { systems: [], gates: [] };
  let ws = null, lastFrame = performance.now();
  let camInit = false;
  const confirming = new Set();
  let gateButtons = [];

  // bridge for ui.js (chat)
  const bus = new EventTarget();
  window.Atamus = { send: (o) => send(o), bus, get me() { return me; } };

  const gateImg = new Image(); let gateImgReady = false;
  gateImg.onload = () => (gateImgReady = true); gateImg.src = "assets/stargate.png";

  let systemRadius = 250, placeDist = 650;
  function computeSystemRadius() { let m = 0; for (const c of cfg.cells) m = Math.max(m, Math.hypot(c.x, c.y)); systemRadius = m + cfg.cellCircumradius; placeDist = systemRadius * 2.3; }

  Api.get("/auth/me").then((u) => { me.name = u.username; connect(); }).catch(() => { location.href = "index.html"; });

  function wsUrl() { const base = (typeof API_BASE !== "undefined" ? API_BASE : location.origin); return base.replace(/^http/, "ws") + "/ws"; }
  function setStatus(t, k) { statusEl.textContent = t; statusEl.className = "status" + (k ? " " + k : ""); if (k === "ok") setTimeout(() => statusEl.classList.add("hidden"), 1200); else statusEl.classList.remove("hidden"); }
  function connect() {
    setStatus("Connecting…");
    ws = new WebSocket(wsUrl());
    ws.onopen = () => setStatus("Connected", "ok");
    ws.onclose = () => { setStatus("Disconnected — retrying…", "err"); setTimeout(connect, 2000); };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === "hello") { cfg = m.cfg; me = m.you; computeSystemRadius(); }
      else if (m.t === "snap") snap = m;
      else if (m.t === "chat") bus.dispatchEvent(new CustomEvent("chat", { detail: m }));
      else if (m.t === "sys") bus.dispatchEvent(new CustomEvent("sys", { detail: m }));
    };
  }
  function send(o) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); }

  function fmt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

  function placements() {
    const place = new Map(); const home = snap.systems.find((s) => s.mine);
    if (home) place.set(home.id, { gx: 0, gy: 0 });
    for (const s of snap.systems) { if (s.mine) continue; let dir = { x: 1, y: 0 }; if (s.fromGateLocal) { const d = Math.hypot(s.fromGateLocal.x, s.fromGateLocal.y) || 1; dir = { x: s.fromGateLocal.x / d, y: s.fromGateLocal.y / d }; } place.set(s.id, { gx: dir.x * placeDist, gy: dir.y * placeDist }); }
    return place;
  }

  const ZOOM_MIN_W = 15;
  let cam = { cx: 0, cy: 0, viewW: 600 }, curMaxW = 600, viewWTarget = 600;
  const panVel = { x: 0, y: 0 };
  function resize() { const dpr = window.devicePixelRatio || 1; canvas.width = Math.floor(innerWidth * dpr); canvas.height = Math.floor(innerHeight * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  addEventListener("resize", resize); resize();
  const scale = () => innerWidth / cam.viewW;
  const gx2s = (gx) => innerWidth / 2 + (gx - cam.cx) * scale();
  const gy2s = (gy) => innerHeight / 2 - (gy - cam.cy) * scale();

  function fitWidth(place) { let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity; for (const p of place.values()) { minX = Math.min(minX, p.gx - systemRadius); maxX = Math.max(maxX, p.gx + systemRadius); minY = Math.min(minY, p.gy - systemRadius); maxY = Math.max(maxY, p.gy + systemRadius); } if (!isFinite(minX)) return 600; const aspect = innerWidth / innerHeight; return Math.max(maxX - minX, (maxY - minY) * aspect) * 1.08; }
  function centroidBound(place) { let n = 0, sx = 0, sy = 0; for (const p of place.values()) { sx += p.gx; sy += p.gy; n++; } if (!n) return { cx: 0, cy: 0, r: systemRadius }; const cx = sx / n, cy = sy / n; let maxd = 0; for (const p of place.values()) maxd = Math.max(maxd, Math.hypot(p.gx - cx, p.gy - cy)); return { cx, cy, r: maxd + systemRadius * 1.1 }; }
  function clampCameraCircle(place) { const b = centroidBound(place); const dx = cam.cx - b.cx, dy = cam.cy - b.cy, d = Math.hypot(dx, dy); if (d > b.r) { cam.cx = b.cx + dx / d * b.r; cam.cy = b.cy + dy / d * b.r; } }

  const keys = new Set();
  addEventListener("keydown", (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const k = e.key.toLowerCase();
    if (k === "w" || k === "a" || k === "s" || k === "d") { keys.add(k); e.preventDefault(); return; }
    if (k === "1" || k === "2" || k === "3") toggleGateByIndex(+k - 1);
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => keys.clear());
  document.getElementById("btn-in").addEventListener("click", () => { viewWTarget = Math.max(ZOOM_MIN_W, viewWTarget / 1.3); });
  document.getElementById("btn-out").addEventListener("click", () => { viewWTarget = Math.min(curMaxW, viewWTarget * 1.3); });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); viewWTarget = Math.max(ZOOM_MIN_W, Math.min(curMaxW, viewWTarget * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); }, { passive: false });

  function myGate(idx) { return snap.gates.find((g) => g.mine && g.id.endsWith(":" + idx)); }
  function toggleGate(g) { if (!g) return; if (g.state !== "active") { send({ t: "gate", gate: g.id, open: true }); setStatus("Opening wormhole…", "ok"); } else { send({ t: "gate", gate: g.id, open: false }); } }
  function toggleGateByIndex(i) { toggleGate(myGate(i)); }

  function eventPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  let curPlace = new Map();
  canvas.addEventListener("click", (e) => { const p = eventPos(e); for (const b of gateButtons) { if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { const g = snap.gates.find((x) => x.id === b.gateId); if (g) toggleGate(g); return; } } });
  function mySys() { const h = snap.systems.find((s) => s.mine); return h ? h.id : null; }

  // ---- drawing ----
  function norm(x, y) { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; }
  function hexCorners() { const R = cfg.cellCircumradius, pts = []; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) }); } return pts; }
  function drawCell(cx, cy, round, stroke, fill) { const pts = hexCorners(); ctx.beginPath(); for (let i = 0; i < 6; i++) { const V = pts[i], P = pts[(i + 5) % 6], N = pts[(i + 1) % 6]; const tP = norm(P.x - V.x, P.y - V.y), tN = norm(N.x - V.x, N.y - V.y); const Ax = gx2s(cx + V.x + tP.x * round), Ay = gy2s(cy + V.y + tP.y * round); const Bx = gx2s(cx + V.x + tN.x * round), By = gy2s(cy + V.y + tN.y * round); const Vx = gx2s(cx + V.x), Vy = gy2s(cy + V.y); if (i === 0) ctx.moveTo(Ax, Ay); else ctx.lineTo(Ax, Ay); ctx.quadraticCurveTo(Vx, Vy, Bx, By); } ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.lineWidth = 1; ctx.strokeStyle = stroke; ctx.stroke(); } }
  function systemTheme(s) { if (s.mine) return { line: "rgba(120,170,255,0.5)", fill: "rgba(12,22,40,0.4)", glow: "rgba(14,30,55,0.5)" }; if (s.id === "sys:hub") return { line: "rgba(255,122,42,0.55)", fill: "rgba(30,14,10,0.4)", glow: "rgba(60,20,20,0.45)" }; return { line: "rgba(255,90,90,0.5)", fill: "rgba(34,12,14,0.4)", glow: "rgba(55,15,20,0.45)" }; }

  function drawGate(g, pl) {
    const sx = gx2s(pl.gx + g.lx), sy = gy2s(pl.gy + g.ly), rPx = Math.max(12, Math.min(160, cfg.transferRadius * scale()));
    if (gateImgReady) { const dim = rPx * 2; ctx.save(); ctx.globalAlpha = g.state === "active" ? 1 : 0.65; ctx.drawImage(gateImg, sx - rPx, sy - rPx, dim, dim); ctx.restore(); }
    else { ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI / 4); ctx.strokeStyle = "#8a93a0"; ctx.lineWidth = 2; ctx.strokeRect(-rPx * 0.6, -rPx * 0.6, rPx * 1.2, rPx * 1.2); ctx.restore(); }
    if (g.state === "active" && g.connToSys) { ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, cfg.transferRadius * scale(), 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,160,70,0.4)"; ctx.setLineDash([5, 7]); ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
    if (g.mine) {
      let y = sy - rPx - 12; const active = g.state === "active";
      y = button(active ? "CLOSE" : "OPEN", sx, y, active ? "#ff7a2a" : "#2ab6ff", g.id);
      const ms = active ? Math.min(g.fuelMs, g.sessionRemMs ?? g.fuelMs) : g.fuelMs;
      centerText("Fuel " + fmt(ms), sx, y - 8, active ? "#bfe8ff" : "#8d98a8");
    }
  }
  function button(text, cx, yBottom, color, gateId) { ctx.save(); ctx.font = "11px " + fontFamily(); const w = ctx.measureText(text).width + 18, h = 20, x = cx - w / 2, y = yBottom - h; ctx.fillStyle = "rgba(8,12,18,0.9)"; ctx.fillRect(x, y, w, h); ctx.lineWidth = 1; ctx.strokeStyle = color; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, cx, y + h / 2); ctx.restore(); gateButtons.push({ x, y, w, h, gateId }); return y - 4; }
  function centerText(text, cx, yBottom, color) { ctx.save(); ctx.font = "11px " + fontFamily(); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = color || "#fff"; ctx.fillText(text, cx, yBottom); ctx.restore(); }
  function fontFamily() { return getComputedStyle(document.body).fontFamily; }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height); gateButtons = [];
    if (cfg && snap.systems.length) {
      const place = placements(); curPlace = place; curMaxW = fitWidth(place);
      if (!camInit) { const b = centroidBound(place); cam.cx = b.cx; cam.cy = b.cy; cam.viewW = viewWTarget = curMaxW; camInit = true; }
      viewWTarget = Math.max(ZOOM_MIN_W, Math.min(curMaxW, viewWTarget));
      cam.viewW += (viewWTarget - cam.viewW) * (1 - Math.exp(-14 * dt));
      let dx = 0, dy = 0; if (keys.has("a")) dx -= 1; if (keys.has("d")) dx += 1; if (keys.has("w")) dy += 1; if (keys.has("s")) dy -= 1; if (dx || dy) { const l = Math.hypot(dx, dy); dx /= l; dy /= l; }
      const maxSpeed = cam.viewW * 0.9, ease = 1 - Math.exp(-10 * dt);
      panVel.x += (dx * maxSpeed - panVel.x) * ease; panVel.y += (dy * maxSpeed - panVel.y) * ease;
      cam.cx += panVel.x * dt; cam.cy += panVel.y * dt; clampCameraCircle(place);

      for (const sE of snap.systems) { if (sE.mine || !sE.fromGateLocal) continue; const home = place.get(mySys()), foreign = place.get(sE.id); if (!home || !foreign) continue; const ax = gx2s(home.gx + sE.fromGateLocal.x), ay = gy2s(home.gy + sE.fromGateLocal.y); let bx = gx2s(foreign.gx), by = gy2s(foreign.gy); if (sE.partnerGateId) { const pg = snap.gates.find((g) => g.id === sE.partnerGateId); if (pg) { bx = gx2s(foreign.gx + pg.lx); by = gy2s(foreign.gy + pg.ly); } } ctx.save(); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.strokeStyle = "rgba(255,170,90,0.5)"; ctx.setLineDash([8, 8]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }
      for (const sE of snap.systems) { const pl = place.get(sE.id); if (!pl) continue; const th = systemTheme(sE); const cx = gx2s(pl.gx), cy = gy2s(pl.gy), R = systemRadius * scale(); const gr = ctx.createRadialGradient(cx, cy, 10, cx, cy, R); gr.addColorStop(0, th.glow); gr.addColorStop(1, "rgba(5,8,15,0)"); ctx.fillStyle = gr; ctx.fillRect(cx - R, cy - R, R * 2, R * 2); for (const c of cfg.cells) drawCell(pl.gx + c.x, pl.gy + c.y, cfg.cellCornerRound, th.line, th.fill); centerText(sE.mine ? "YOUR SYSTEM" : (sE.id === "sys:hub" ? "PIRATE HUB" : "RIVAL SYSTEM"), cx, cy - R - 6, th.line); }
      for (const g of snap.gates) { const pl = place.get(g.sys); if (pl) drawGate(g, pl); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
