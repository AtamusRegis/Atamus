// Atamus tech-demo client — multi-system view.
// Renders the player's own system plus any systems their open wormholes
// connect to, side by side, with link lines between paired gates.

(() => {
  "use strict";

  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const hudName = document.getElementById("hud-name");
  const hudSystems = document.getElementById("hud-systems");
  const gateList = document.getElementById("gate-list");
  const chatLog = document.getElementById("chat-log");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");

  let cfg = null, me = { id: null, name: "" };
  let snap = { systems: [], ships: [], gates: [], stations: [], canSpawn: true };
  let selectedId = null;
  let ws = null, lastFrame = performance.now();

  // Rendered ship interpolation: id -> {x,y,hd,tx,ty,thd,sys}
  const rships = new Map();

  // ---- geometry helpers (derived from cfg) ----
  let systemRadius = 250, placeDist = 650;
  function computeSystemRadius() {
    let m = 0;
    for (const c of cfg.cells) m = Math.max(m, Math.hypot(c.x, c.y));
    systemRadius = m + cfg.cellCircumradius;
    placeDist = systemRadius * 2.3;
  }

  // ---- auth gate ----
  Api.get("/auth/me")
    .then((u) => { me.name = u.username; hudName.textContent = u.username; connect(); })
    .catch(() => { location.href = "index.html"; });

  function wsUrl() {
    const base = (typeof API_BASE !== "undefined" ? API_BASE : location.origin);
    return base.replace(/^http/, "ws") + "/ws";
  }
  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status" + (kind ? " " + kind : "");
    if (kind === "ok") setTimeout(() => statusEl.classList.add("hidden"), 1200);
    else statusEl.classList.remove("hidden");
  }
  function connect() {
    setStatus("Connecting…");
    ws = new WebSocket(wsUrl());
    ws.onopen = () => setStatus("Connected", "ok");
    ws.onclose = () => { setStatus("Disconnected — retrying…", "err"); setTimeout(connect, 2000); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === "hello") { cfg = m.cfg; me = m.you; hudName.textContent = me.name; computeSystemRadius(); }
      else if (m.t === "snap") onSnap(m);
      else if (m.t === "chat") addChat(m.from, m.text, false);
      else if (m.t === "sys") addChat(null, m.text, true);
    };
  }
  function send(o) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); }

  function onSnap(m) {
    snap = m;
    hudSystems.textContent = m.systems.length;

    // reconcile interpolated ships
    const seen = new Set();
    for (const s of m.ships) {
      seen.add(s.id);
      let r = rships.get(s.id);
      if (!r) { r = { x: s.x, y: s.y, hd: s.hd }; rships.set(s.id, r); }
      r.tx = s.x; r.ty = s.y; r.thd = s.hd; r.sys = s.sys; r.hp = s.hp; r.o = s.o; r.mine = s.mine;
    }
    for (const id of [...rships.keys()]) if (!seen.has(id)) rships.delete(id);
    if (selectedId != null && !rships.has(selectedId)) selectedId = null;

    renderGateList();
  }

  function renderGateList() {
    const mine = snap.gates.filter((g) => g.mine);
    gateList.innerHTML = "";
    for (const g of mine) {
      const row = document.createElement("div");
      row.className = "gate-row";
      const n = document.createElement("span"); n.className = "gn"; n.textContent = "Gate " + (g.id.split(":")[1] * 1 + 1);
      const s = document.createElement("span"); s.className = "gs " + g.state;
      if (g.state === "charging") s.textContent = Math.round(g.chargePct * 100) + "%";
      else if (g.state === "connected") s.textContent = fmt(g.connEndsMs);
      else s.textContent = g.state;
      row.appendChild(n); row.appendChild(s); gateList.appendChild(row);
    }
  }
  function fmt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; }

  // ---- chat ----
  function addChat(from, text, sysMsg) {
    const div = document.createElement("div");
    if (sysMsg) { div.className = "sys"; div.textContent = "» " + text; }
    else { const w = document.createElement("span"); w.className = "who"; w.textContent = from + ": "; div.appendChild(w); div.appendChild(document.createTextNode(text)); }
    chatLog.appendChild(div); chatLog.scrollTop = chatLog.scrollHeight;
    while (chatLog.children.length > 80) chatLog.removeChild(chatLog.firstChild);
  }
  chatForm.addEventListener("submit", (e) => { e.preventDefault(); const t = chatInput.value.trim(); if (t) send({ t: "chat", text: t }); chatInput.value = ""; chatInput.blur(); });

  // ---- placements (galaxy coords) ----
  function placements() {
    const place = new Map();
    const home = snap.systems.find((s) => s.mine);
    if (home) place.set(home.id, { gx: 0, gy: 0 });
    for (const s of snap.systems) {
      if (s.mine) continue;
      let dir = { x: 1, y: 0 };
      if (s.fromGateLocal) { const d = Math.hypot(s.fromGateLocal.x, s.fromGateLocal.y) || 1; dir = { x: s.fromGateLocal.x / d, y: s.fromGateLocal.y / d }; }
      place.set(s.id, { gx: dir.x * placeDist, gy: dir.y * placeDist });
    }
    return place;
  }

  // ---- camera ----
  let cam = { ox: 0, oy: 0, scale: 1 };
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(innerWidth * dpr); canvas.height = Math.floor(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", resize); resize();

  function updateCamera(place) {
    let minX = -systemRadius, maxX = systemRadius, minY = -systemRadius, maxY = systemRadius;
    for (const p of place.values()) {
      minX = Math.min(minX, p.gx - systemRadius); maxX = Math.max(maxX, p.gx + systemRadius);
      minY = Math.min(minY, p.gy - systemRadius); maxY = Math.max(maxY, p.gy + systemRadius);
    }
    const w = innerWidth, h = innerHeight, pad = 0.9;
    const bw = maxX - minX, bh = maxY - minY;
    cam.scale = Math.min(w / bw, h / bh) * pad;
    cam.ox = w / 2 - (minX + maxX) / 2 * cam.scale;
    cam.oy = h / 2 + (minY + maxY) / 2 * cam.scale; // y inverted
  }
  const gx2s = (gx) => cam.ox + gx * cam.scale;
  const gy2s = (gy) => cam.oy - gy * cam.scale;
  const s2gx = (sx) => (sx - cam.ox) / cam.scale;
  const s2gy = (sy) => -(sy - cam.oy) / cam.scale;

  // ---- input ----
  function eventPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  let curPlace = new Map();

  function systemAt(gx, gy) {
    let best = null, bd = systemRadius * systemRadius;
    for (const [id, p] of curPlace) {
      const d = (p.gx - gx) ** 2 + (p.gy - gy) ** 2;
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  function shipAt(sx, sy) {
    let best = null, bd = 16;
    for (const [id, r] of rships) {
      const p = curPlace.get(r.sys); if (!p) continue;
      const px = gx2s(p.gx + r.x), py = gy2s(p.gy + r.y);
      const d = Math.hypot(px - sx, py - sy);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  canvas.addEventListener("click", (e) => {
    const p = eventPos(e);
    const id = shipAt(p.x, p.y);
    if (id != null) { const r = rships.get(id); if (r && r.mine) selectedId = id; return; }
    // gates (mine, charged) and stations
    for (const g of snap.gates) {
      if (!g.mine) continue;
      const pl = curPlace.get(g.sys); if (!pl) continue;
      const gx = gx2s(pl.gx + g.lx), gy = gy2s(pl.gy + g.ly);
      if (Math.hypot(p.x - gx, p.y - gy) < 16) {
        if (g.state === "charged") { send({ t: "activate", gate: g.id }); setStatus("Charging wormhole…", "ok"); }
        else setStatus("Gate " + (g.id.split(":")[1] * 1 + 1) + ": " + g.state, "err");
        return;
      }
    }
    for (const st of snap.stations) {
      const pl = curPlace.get(st.sys); if (!pl || st.sys !== mySys()) continue;
      const sx = gx2s(pl.gx + st.x), sy = gy2s(pl.gy + st.y);
      if (Math.hypot(p.x - sx, p.y - sy) < 16) {
        if (snap.canSpawn) { send({ t: "spawn" }); setStatus("Building ship…", "ok"); }
        else setStatus("Ship limit reached", "err");
        return;
      }
    }
  });

  canvas.addEventListener("dblclick", (e) => {
    if (selectedId == null) return;
    const r = rships.get(selectedId); if (!r) return;
    const p = eventPos(e);
    const gx = s2gx(p.x), gy = s2gy(p.y);
    const sys = systemAt(gx, gy);
    if (sys !== r.sys) { setStatus("Move orders only within the ship's system — use a gate to cross", "err"); return; }
    const pl = curPlace.get(sys);
    send({ t: "move", id: selectedId, x: gx - pl.gx, y: gy - pl.gy });
  });

  canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); selectedId = null; });

  function mySys() { const h = snap.systems.find((s) => s.mine); return h ? h.id : null; }

  // ---- drawing ----
  function norm(x, y) { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; }
  function hexCorners() {
    const R = cfg.cellCircumradius, pts = [];
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) }); }
    return pts;
  }
  const HEX = () => hexCorners();

  function drawCell(cx, cy, round, stroke, fill) {
    const pts = HEX();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const V = pts[i], P = pts[(i + 5) % 6], N = pts[(i + 1) % 6];
      const tP = norm(P.x - V.x, P.y - V.y), tN = norm(N.x - V.x, N.y - V.y);
      const Ax = gx2s(cx + V.x + tP.x * round), Ay = gy2s(cy + V.y + tP.y * round);
      const Bx = gx2s(cx + V.x + tN.x * round), By = gy2s(cy + V.y + tN.y * round);
      const Vx = gx2s(cx + V.x), Vy = gy2s(cy + V.y);
      if (i === 0) ctx.moveTo(Ax, Ay); else ctx.lineTo(Ax, Ay);
      ctx.quadraticCurveTo(Vx, Vy, Bx, By);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = 1; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function systemTheme(sysEntry) {
    if (sysEntry.mine) return { line: "rgba(120,170,255,0.5)", fill: "rgba(12,22,40,0.4)", glow: "rgba(14,30,55,0.5)" };
    if (sysEntry.id === "sys:hub") return { line: "rgba(255,122,42,0.55)", fill: "rgba(30,14,10,0.4)", glow: "rgba(60,20,20,0.45)" };
    return { line: "rgba(255,90,90,0.5)", fill: "rgba(34,12,14,0.4)", glow: "rgba(55,15,20,0.45)" };
  }

  function drawGate(g, pl) {
    const x = pl.gx + g.lx, y = pl.gy + g.ly, sx = gx2s(x), sy = gy2s(y), s = 9;
    let col = "#2ab6ff";
    if (g.state === "charging") col = "#5b6675";
    else if (g.state === "seeking") col = "#ffcc33";
    else if (g.state === "connected") col = "#ff7a2a";
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = col; ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1.2;
    ctx.fillRect(-s, -s, s * 2, s * 2); ctx.strokeRect(-s, -s, s * 2, s * 2);
    ctx.restore();
    // transfer-radius ring when connected
    if (g.state === "connected") {
      ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, cfg.transferRadius * cam.scale, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,122,42,0.35)"; ctx.setLineDash([5, 7]); ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    }
  }

  function drawStation(st, pl) {
    const sx = gx2s(pl.gx + st.x), sy = gy2s(pl.gy + st.y);
    ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, 11, 0, Math.PI * 2);
    const grd = ctx.createRadialGradient(sx - 3, sy - 3, 2, sx, sy, 12);
    grd.addColorStop(0, "#3a4658"); grd.addColorStop(1, "#141a24"); ctx.fillStyle = grd; ctx.fill();
    const own = st.sys === mySys();
    ctx.lineWidth = 1.4; ctx.strokeStyle = own && snap.canSpawn ? "rgba(42,182,255,0.9)" : "rgba(141,152,168,0.6)"; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 4, sy); ctx.lineTo(sx + 4, sy); ctx.moveTo(sx, sy - 4); ctx.lineTo(sx, sy + 4); ctx.stroke();
    ctx.restore();
  }

  function drawShip(r) {
    const pl = curPlace.get(r.sys); if (!pl) return;
    const sx = gx2s(pl.gx + r.x), sy = gy2s(pl.gy + r.y), ang = -r.hd, L = 10, W = 6.5;
    if (selectedId != null && rships.get(selectedId) === r) {
      ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI * 2); ctx.strokeStyle = "rgba(42,182,255,0.9)"; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
    const grd = ctx.createLinearGradient(L, 0, -L * 0.7, 0);
    if (r.mine) { grd.addColorStop(0, "#9fe0ff"); grd.addColorStop(1, "#0b4a73"); }
    else { grd.addColorStop(0, "#ffb199"); grd.addColorStop(1, "#5a0f0f"); }
    ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-L * 0.7, W); ctx.lineTo(-L * 0.7, -W); ctx.closePath();
    ctx.fillStyle = grd; ctx.fill(); ctx.lineWidth = 1;
    ctx.strokeStyle = r.mine ? "rgba(159,224,255,0.9)" : "rgba(255,177,153,0.9)"; ctx.stroke();
    ctx.restore();
    label(sx, sy - 18, r.o, r.mine ? "rgba(159,224,255,0.95)" : "rgba(255,177,153,0.95)");
    const frac = Math.max(0, Math.min(1, r.hp / (cfg.maxHp || 100)));
    const bw = 22, bx = sx - bw / 2, by = sy - 12;
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx, by, bw, 3);
    ctx.fillStyle = frac > 0.5 ? "#39d98a" : frac > 0.25 ? "#ffcc33" : "#ff5a5a"; ctx.fillRect(bx, by, bw * frac, 3);
  }

  function label(x, y, text, color) {
    ctx.save(); ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = color || "#fff";
    ctx.fillText(text, x, y); ctx.restore();
  }

  function lerpA(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (cfg && snap.systems.length) {
      const place = placements(); curPlace = place;
      updateCamera(place);

      // interpolate ships
      const k = Math.min(1, dt * 12);
      for (const r of rships.values()) { if (r.tx != null) { r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k; r.hd = lerpA(r.hd, r.thd, k); } }

      // link lines (under systems)
      for (const sEntry of snap.systems) {
        if (sEntry.mine || !sEntry.fromGateLocal) continue;
        const home = place.get(mySys()), foreign = place.get(sEntry.id); if (!home || !foreign) continue;
        const ax = gx2s(home.gx + sEntry.fromGateLocal.x), ay = gy2s(home.gy + sEntry.fromGateLocal.y);
        let bx = gx2s(foreign.gx), by = gy2s(foreign.gy);
        if (sEntry.partnerGateId) {
          const pg = snap.gates.find((g) => g.id === sEntry.partnerGateId);
          if (pg) { bx = gx2s(foreign.gx + pg.lx); by = gy2s(foreign.gy + pg.ly); }
        }
        ctx.save(); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        ctx.strokeStyle = "rgba(255,170,90,0.5)"; ctx.setLineDash([8, 8]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      }

      // systems
      for (const sEntry of snap.systems) {
        const pl = place.get(sEntry.id); if (!pl) continue;
        const th = systemTheme(sEntry);
        // glow
        const cx = gx2s(pl.gx), cy = gy2s(pl.gy);
        const gr = ctx.createRadialGradient(cx, cy, 10, cx, cy, systemRadius * cam.scale);
        gr.addColorStop(0, th.glow); gr.addColorStop(1, "rgba(5,8,15,0)"); ctx.fillStyle = gr;
        ctx.fillRect(cx - systemRadius * cam.scale, cy - systemRadius * cam.scale, systemRadius * cam.scale * 2, systemRadius * cam.scale * 2);
        // cells
        for (const c of cfg.cells) drawCell(pl.gx + c.x, pl.gy + c.y, cfg.cellCornerRound, th.line, th.fill);
        // name
        label(cx, cy - systemRadius * cam.scale - 4, sEntry.mine ? "YOUR SYSTEM" : (sEntry.id === "sys:hub" ? "PIRATE HUB" : "RIVAL SYSTEM"), th.line);
      }

      // gates + stations + ships
      for (const g of snap.gates) { const pl = place.get(g.sys); if (pl) drawGate(g, pl); }
      for (const st of snap.stations) { const pl = place.get(st.sys); if (pl) drawStation(st, pl); }
      for (const r of rships.values()) drawShip(r);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
