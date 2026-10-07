// Atamus tech-demo client — multi-system view with fuel-powered stargates.
(() => {
  "use strict";

  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const hudName = document.getElementById("hud-name");
  const hudSystems = document.getElementById("hud-systems");
  const chatLog = document.getElementById("chat-log");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");

  let cfg = null, me = { id: null, name: "" };
  let snap = { systems: [], ships: [], gates: [], stations: [], enemies: false, canSpawn: true };
  let selectedId = null;
  let ws = null, lastFrame = performance.now();
  let camInit = false;
  const rships = new Map();
  const confirming = new Set();       // gate ids awaiting a destroy-confirm click
  let gateButtons = [];               // screen-space hit rects, rebuilt each frame

  const gateImg = new Image(); let gateImgReady = false;
  gateImg.onload = () => (gateImgReady = true);
  gateImg.src = "assets/stargate.png";

  let systemRadius = 250, placeDist = 650;
  function computeSystemRadius() {
    let m = 0; for (const c of cfg.cells) m = Math.max(m, Math.hypot(c.x, c.y));
    systemRadius = m + cfg.cellCircumradius; placeDist = systemRadius * 2.3;
  }

  Api.get("/auth/me").then((u) => { me.name = u.username; hudName.textContent = u.username; connect(); })
    .catch(() => { location.href = "index.html"; });

  function wsUrl() { const base = (typeof API_BASE !== "undefined" ? API_BASE : location.origin); return base.replace(/^http/, "ws") + "/ws"; }
  function setStatus(t, k) { statusEl.textContent = t; statusEl.className = "status" + (k ? " " + k : ""); if (k === "ok") setTimeout(() => statusEl.classList.add("hidden"), 1200); else statusEl.classList.remove("hidden"); }
  function connect() {
    setStatus("Connecting…");
    ws = new WebSocket(wsUrl());
    ws.onopen = () => setStatus("Connected", "ok");
    ws.onclose = () => { setStatus("Disconnected — retrying…", "err"); setTimeout(connect, 2000); };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === "hello") { cfg = m.cfg; me = m.you; hudName.textContent = me.name; computeSystemRadius(); }
      else if (m.t === "snap") onSnap(m);
      else if (m.t === "chat") addChat(m.from, m.text, false);
      else if (m.t === "sys") addChat(null, m.text, true);
    };
  }
  function send(o) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); }

  function onSnap(m) {
    snap = m; hudSystems.textContent = m.systems.length;
    const seen = new Set();
    for (const s of m.ships) { seen.add(s.id); let r = rships.get(s.id); if (!r) { r = { x: s.x, y: s.y, hd: s.hd }; rships.set(s.id, r); } r.tx = s.x; r.ty = s.y; r.thd = s.hd; r.sys = s.sys; r.hp = s.hp; r.o = s.o; r.mine = s.mine; }
    for (const id of [...rships.keys()]) if (!seen.has(id)) rships.delete(id);
    if (selectedId != null && !rships.has(selectedId)) selectedId = null;
    // drop stale confirm states
    for (const id of [...confirming]) { const g = m.gates.find((x) => x.id === id); if (!g || g.state !== "active" || !g.away) confirming.delete(id); }
  }

  function fmt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

  // chat
  function addChat(from, text, sysMsg) {
    const d = document.createElement("div");
    if (sysMsg) { d.className = "sys"; d.textContent = "» " + text; }
    else { const w = document.createElement("span"); w.className = "who"; w.textContent = from + ": "; d.appendChild(w); d.appendChild(document.createTextNode(text)); }
    chatLog.appendChild(d); chatLog.scrollTop = chatLog.scrollHeight; while (chatLog.children.length > 80) chatLog.removeChild(chatLog.firstChild);
  }
  chatForm.addEventListener("submit", (e) => { e.preventDefault(); const t = chatInput.value.trim(); if (t) send({ t: "chat", text: t }); chatInput.value = ""; chatInput.blur(); });

  // placements
  function placements() {
    const place = new Map(); const home = snap.systems.find((s) => s.mine);
    if (home) place.set(home.id, { gx: 0, gy: 0 });
    for (const s of snap.systems) { if (s.mine) continue; let dir = { x: 1, y: 0 }; if (s.fromGateLocal) { const d = Math.hypot(s.fromGateLocal.x, s.fromGateLocal.y) || 1; dir = { x: s.fromGateLocal.x / d, y: s.fromGateLocal.y / d }; } place.set(s.id, { gx: dir.x * placeDist, gy: dir.y * placeDist }); }
    return place;
  }

  // camera: free pan, zoom from 15km (closest) to "fit all systems" (farthest)
  const ZOOM_MIN_W = 15;
  let cam = { cx: 0, cy: 0, viewW: 600 }, curMaxW = 600;
  function resize() { const dpr = window.devicePixelRatio || 1; canvas.width = Math.floor(innerWidth * dpr); canvas.height = Math.floor(innerHeight * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  addEventListener("resize", resize); resize();
  const scale = () => innerWidth / cam.viewW;
  const gx2s = (gx) => innerWidth / 2 + (gx - cam.cx) * scale();
  const gy2s = (gy) => innerHeight / 2 - (gy - cam.cy) * scale();
  const s2gx = (sx) => cam.cx + (sx - innerWidth / 2) / scale();
  const s2gy = (sy) => cam.cy - (sy - innerHeight / 2) / scale();

  function fitWidth(place) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of place.values()) { minX = Math.min(minX, p.gx - systemRadius); maxX = Math.max(maxX, p.gx + systemRadius); minY = Math.min(minY, p.gy - systemRadius); maxY = Math.max(maxY, p.gy + systemRadius); }
    if (!isFinite(minX)) return 600;
    const aspect = innerWidth / innerHeight;
    return Math.max(maxX - minX, (maxY - minY) * aspect) * 1.08;
  }
  function clampCamera(place) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of place.values()) { minX = Math.min(minX, p.gx); maxX = Math.max(maxX, p.gx); minY = Math.min(minY, p.gy); maxY = Math.max(maxY, p.gy); }
    if (!isFinite(minX)) { minX = maxX = minY = maxY = 0; }
    const m = systemRadius * 1.1;
    cam.cx = Math.max(minX - m, Math.min(maxX + m, cam.cx));
    cam.cy = Math.max(minY - m, Math.min(maxY + m, cam.cy));
  }

  const keys = new Set();
  addEventListener("keydown", (e) => {
    if (document.activeElement === chatInput) return;
    const k = e.key.toLowerCase();
    if (k === "w" || k === "a" || k === "s" || k === "d") { keys.add(k); e.preventDefault(); return; }
    if (k === "1" || k === "2" || k === "3") { toggleGateByIndex(+k - 1); }
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => keys.clear());

  document.getElementById("btn-in").addEventListener("click", () => { cam.viewW = Math.max(ZOOM_MIN_W, cam.viewW / 1.3); });
  document.getElementById("btn-out").addEventListener("click", () => { cam.viewW = Math.min(curMaxW, cam.viewW * 1.3); });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.viewW = Math.max(ZOOM_MIN_W, Math.min(curMaxW, cam.viewW * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); }, { passive: false });

  function myGate(idx) { return snap.gates.find((g) => g.mine && g.id.endsWith(":" + idx)); }
  function toggleGate(g) {
    if (!g) return;
    if (g.state !== "active") { send({ t: "gate", gate: g.id, open: true }); setStatus("Opening wormhole…", "ok"); }
    else if (!g.canClose) { setStatus("Can't close — enemies in system", "err"); }
    else if (g.away > 0 && !confirming.has(g.id)) { confirming.add(g.id); setStatus("Confirm: closing destroys " + g.away + " of your ships", "err"); }
    else { send({ t: "gate", gate: g.id, open: false }); confirming.delete(g.id); }
  }
  function toggleGateByIndex(i) { toggleGate(myGate(i)); }

  // input
  function eventPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  let curPlace = new Map();
  function systemAt(gx, gy) { let best = null, bd = systemRadius * systemRadius; for (const [id, p] of curPlace) { const d = (p.gx - gx) ** 2 + (p.gy - gy) ** 2; if (d < bd) { bd = d; best = id; } } return best; }
  function shipAt(sx, sy) { let best = null, bd = 16; for (const [id, r] of rships) { const p = curPlace.get(r.sys); if (!p) continue; const d = Math.hypot(gx2s(p.gx + r.x) - sx, gy2s(p.gy + r.y) - sy); if (d < bd) { bd = d; best = id; } } return best; }

  canvas.addEventListener("click", (e) => {
    const p = eventPos(e);
    // gate buttons first
    for (const b of gateButtons) { if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { const g = snap.gates.find((x) => x.id === b.gateId); if (g) toggleGate(g); return; } }
    const id = shipAt(p.x, p.y);
    if (id != null) { const r = rships.get(id); if (r && r.mine) selectedId = id; return; }
    for (const st of snap.stations) { const pl = curPlace.get(st.sys); if (!pl || st.sys !== mySys()) continue; if (Math.hypot(gx2s(pl.gx + st.x) - p.x, gy2s(pl.gy + st.y) - p.y) < 16) { if (snap.canSpawn) { send({ t: "spawn" }); setStatus("Building ship…", "ok"); } else setStatus("Ship limit reached", "err"); return; } }
  });
  canvas.addEventListener("dblclick", (e) => {
    if (selectedId == null) return; const r = rships.get(selectedId); if (!r) return;
    const p = eventPos(e); const gx = s2gx(p.x), gy = s2gy(p.y); const sys = systemAt(gx, gy);
    if (sys !== r.sys) { setStatus("Move orders only within the ship's system — use a gate to cross", "err"); return; }
    const pl = curPlace.get(sys); send({ t: "move", id: selectedId, x: gx - pl.gx, y: gy - pl.gy });
  });
  canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); selectedId = null; });
  function mySys() { const h = snap.systems.find((s) => s.mine); return h ? h.id : null; }

  // drawing helpers
  function norm(x, y) { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; }
  function hexCorners() { const R = cfg.cellCircumradius, pts = []; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) }); } return pts; }
  function drawCell(cx, cy, round, stroke, fill) {
    const pts = hexCorners(); ctx.beginPath();
    for (let i = 0; i < 6; i++) { const V = pts[i], P = pts[(i + 5) % 6], N = pts[(i + 1) % 6]; const tP = norm(P.x - V.x, P.y - V.y), tN = norm(N.x - V.x, N.y - V.y);
      const Ax = gx2s(cx + V.x + tP.x * round), Ay = gy2s(cy + V.y + tP.y * round); const Bx = gx2s(cx + V.x + tN.x * round), By = gy2s(cy + V.y + tN.y * round); const Vx = gx2s(cx + V.x), Vy = gy2s(cy + V.y);
      if (i === 0) ctx.moveTo(Ax, Ay); else ctx.lineTo(Ax, Ay); ctx.quadraticCurveTo(Vx, Vy, Bx, By); }
    ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.lineWidth = 1; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function systemTheme(s) { if (s.mine) return { line: "rgba(120,170,255,0.5)", fill: "rgba(12,22,40,0.4)", glow: "rgba(14,30,55,0.5)" }; if (s.id === "sys:hub") return { line: "rgba(255,122,42,0.55)", fill: "rgba(30,14,10,0.4)", glow: "rgba(60,20,20,0.45)" }; return { line: "rgba(255,90,90,0.5)", fill: "rgba(34,12,14,0.4)", glow: "rgba(55,15,20,0.45)" }; }

  function drawGate(g, pl) {
    const sx = gx2s(pl.gx + g.lx), sy = gy2s(pl.gy + g.ly);
    const rPx = Math.max(12, Math.min(150, cfg.transferRadius * scale()));
    // ring image (fallback to a diamond)
    if (gateImgReady) {
      const dim = rPx * 2; ctx.save(); ctx.globalAlpha = g.state === "active" ? 1 : 0.65; ctx.drawImage(gateImg, sx - rPx, sy - rPx, dim, dim); ctx.restore();
    } else { ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI / 4); ctx.strokeStyle = "#8a93a0"; ctx.lineWidth = 2; ctx.strokeRect(-rPx * 0.6, -rPx * 0.6, rPx * 1.2, rPx * 1.2); ctx.restore(); }
    // active glow + transfer ring
    if (g.state === "active" && g.connToSys) { ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, cfg.transferRadius * scale(), 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,160,70,0.4)"; ctx.setLineDash([5, 7]); ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
    if (g.mine) drawGateHud(g, sx, sy, rPx);
  }

  function drawGateHud(g, sx, sy, rPx) {
    let y = sy - rPx - 12;
    const active = g.state === "active";
    // toggle / confirm button
    if (confirming.has(g.id) && active && g.canClose && g.away > 0) {
      y = button("DESTROY " + g.away + " & CLOSE", sx, y, "#ff5a5a", g.id);
    } else {
      const disabled = active && !g.canClose;
      const col = disabled ? "#555c68" : (active ? "#ff7a2a" : "#2ab6ff");
      y = button(active ? "CLOSE" : "OPEN", sx, y, col, g.id, disabled);
    }
    // fuel line
    const ms = active ? Math.min(g.fuelMs, g.sessionRemMs ?? g.fuelMs) : g.fuelMs;
    centerText("Fuel " + fmt(ms), sx, y - 8, active ? "#bfe8ff" : "#8d98a8"); y -= 18;
    // enemies error
    if (snap.enemies) { centerText("ENEMIES IN SYSTEM", sx, y - 8, "#ff5a5a"); y -= 16; }
  }

  function button(text, cx, yBottom, color, gateId, disabled) {
    ctx.save(); ctx.font = "11px " + fontFamily(); const w = ctx.measureText(text).width + 18, h = 20, x = cx - w / 2, y = yBottom - h;
    ctx.fillStyle = "rgba(8,12,18,0.9)"; ctx.fillRect(x, y, w, h);
    ctx.lineWidth = 1; ctx.strokeStyle = color; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = disabled ? "#555c68" : color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, cx, y + h / 2);
    ctx.restore();
    if (!disabled) gateButtons.push({ x, y, w, h, gateId });
    return y - 4;
  }
  function centerText(text, cx, yBottom, color) { ctx.save(); ctx.font = "11px " + fontFamily(); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = color || "#fff"; ctx.fillText(text, cx, yBottom); ctx.restore(); }
  function fontFamily() { return getComputedStyle(document.body).fontFamily; }

  function drawStation(st, pl) {
    const sx = gx2s(pl.gx + st.x), sy = gy2s(pl.gy + st.y);
    ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, 11, 0, Math.PI * 2); const grd = ctx.createRadialGradient(sx - 3, sy - 3, 2, sx, sy, 12); grd.addColorStop(0, "#3a4658"); grd.addColorStop(1, "#141a24"); ctx.fillStyle = grd; ctx.fill();
    const own = st.sys === mySys(); ctx.lineWidth = 1.4; ctx.strokeStyle = own && snap.canSpawn ? "rgba(42,182,255,0.9)" : "rgba(141,152,168,0.6)"; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 4, sy); ctx.lineTo(sx + 4, sy); ctx.moveTo(sx, sy - 4); ctx.lineTo(sx, sy + 4); ctx.stroke(); ctx.restore();
  }

  function drawShip(r) {
    const pl = curPlace.get(r.sys); if (!pl) return;
    const sx = gx2s(pl.gx + r.x), sy = gy2s(pl.gy + r.y), ang = -r.hd, L = 10, W = 6.5;
    if (selectedId != null && rships.get(selectedId) === r) { ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI * 2); ctx.strokeStyle = "rgba(42,182,255,0.9)"; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
    const grd = ctx.createLinearGradient(L, 0, -L * 0.7, 0);
    if (r.mine) { grd.addColorStop(0, "#9fe0ff"); grd.addColorStop(1, "#0b4a73"); } else { grd.addColorStop(0, "#ffb199"); grd.addColorStop(1, "#5a0f0f"); }
    ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-L * 0.7, W); ctx.lineTo(-L * 0.7, -W); ctx.closePath(); ctx.fillStyle = grd; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = r.mine ? "rgba(159,224,255,0.9)" : "rgba(255,177,153,0.9)"; ctx.stroke(); ctx.restore();
    centerText(r.o, sx, sy - 16, r.mine ? "rgba(159,224,255,0.95)" : "rgba(255,177,153,0.95)");
    const frac = Math.max(0, Math.min(1, r.hp / (cfg.maxHp || 100))); const bw = 22, bx = sx - bw / 2, by = sy - 12;
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx, by, bw, 3); ctx.fillStyle = frac > 0.5 ? "#39d98a" : frac > 0.25 ? "#ffcc33" : "#ff5a5a"; ctx.fillRect(bx, by, bw * frac, 3);
  }

  function lerpA(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height); gateButtons = [];

    if (cfg && snap.systems.length) {
      const place = placements(); curPlace = place;
      curMaxW = fitWidth(place);
      if (!camInit) { cam.cx = 0; cam.cy = 0; cam.viewW = curMaxW; camInit = true; }
      cam.viewW = Math.max(ZOOM_MIN_W, Math.min(curMaxW, cam.viewW));

      const panKm = cam.viewW * 1.0 * dt;
      if (keys.has("w")) cam.cy += panKm; if (keys.has("s")) cam.cy -= panKm; if (keys.has("a")) cam.cx -= panKm; if (keys.has("d")) cam.cx += panKm;
      clampCamera(place);

      const k = Math.min(1, dt * 12);
      for (const r of rships.values()) { if (r.tx != null) { r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k; r.hd = lerpA(r.hd, r.thd, k); } }

      // link lines
      for (const sE of snap.systems) { if (sE.mine || !sE.fromGateLocal) continue; const home = place.get(mySys()), foreign = place.get(sE.id); if (!home || !foreign) continue;
        const ax = gx2s(home.gx + sE.fromGateLocal.x), ay = gy2s(home.gy + sE.fromGateLocal.y); let bx = gx2s(foreign.gx), by = gy2s(foreign.gy);
        if (sE.partnerGateId) { const pg = snap.gates.find((g) => g.id === sE.partnerGateId); if (pg) { bx = gx2s(foreign.gx + pg.lx); by = gy2s(foreign.gy + pg.ly); } }
        ctx.save(); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.strokeStyle = "rgba(255,170,90,0.5)"; ctx.setLineDash([8, 8]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }

      // systems
      for (const sE of snap.systems) { const pl = place.get(sE.id); if (!pl) continue; const th = systemTheme(sE);
        const cx = gx2s(pl.gx), cy = gy2s(pl.gy), R = systemRadius * scale();
        const gr = ctx.createRadialGradient(cx, cy, 10, cx, cy, R); gr.addColorStop(0, th.glow); gr.addColorStop(1, "rgba(5,8,15,0)"); ctx.fillStyle = gr; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        for (const c of cfg.cells) drawCell(pl.gx + c.x, pl.gy + c.y, cfg.cellCornerRound, th.line, th.fill);
        centerText(sE.mine ? "YOUR SYSTEM" : (sE.id === "sys:hub" ? "PIRATE HUB" : "RIVAL SYSTEM"), cx, cy - R - 6, th.line); }

      for (const g of snap.gates) { const pl = place.get(g.sys); if (pl) drawGate(g, pl); }
      for (const st of snap.stations) { const pl = place.get(st.sys); if (pl) drawStation(st, pl); }
      for (const r of rships.values()) drawShip(r);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
