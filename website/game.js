// Atamus tech-demo client. Canvas 2D, server-authoritative.
// Talks to the game server over WebSocket; renders the player's current
// instance (home hex or the shared hub) and sends commands.

(() => {
  "use strict";

  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const hudName = document.getElementById("hud-name");
  const hudLoc = document.getElementById("hud-loc");
  const hudTimerRow = document.getElementById("hud-timer-row");
  const hudTimer = document.getElementById("hud-timer");
  const btnHome = document.getElementById("btn-home");
  const btnHub = document.getElementById("btn-hub");
  const chatLog = document.getElementById("chat-log");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");

  // ---- state ----
  let cfg = null;                 // server config (hex size, gate, station, etc.)
  let me = { id: null, name: "" };
  let view = "home";              // "home" | "hub"
  let gateActive = false;
  let timerMs = null;
  let canSpawn = true;

  let selectedId = null;
  // Rendered ships: id -> { x, y, hd, tx, ty, thd, hp, o, mine }
  const ships = new Map();

  let ws = null;
  let lastFrame = performance.now();

  // ---- gating: must be logged in ----
  Api.get("/auth/me")
    .then((u) => { me.name = u.username; hudName.textContent = u.username; connect(); })
    .catch(() => { location.href = "index.html"; });

  // ---- websocket ----
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
    ws.onerror = () => {};
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === "hello") onHello(m);
      else if (m.t === "snap") onSnap(m);
      else if (m.t === "chat") addChat(m.from, m.text, false);
      else if (m.t === "sys") addChat(null, m.text, true);
    };
  }

  function send(obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

  function onHello(m) {
    cfg = m.cfg;
    me = m.you;
    hudName.textContent = me.name;
  }

  function onSnap(m) {
    view = m.view;
    gateActive = m.gateActive;
    timerMs = m.timerMs;
    canSpawn = m.canSpawn;

    const seen = new Set();
    for (const s of m.ships) {
      seen.add(s.id);
      let r = ships.get(s.id);
      if (!r) { r = { x: s.x, y: s.y, hd: s.hd }; ships.set(s.id, r); }
      r.tx = s.x; r.ty = s.y; r.thd = s.hd;
      r.hp = s.hp; r.o = s.o; r.mine = s.mine;
    }
    for (const id of [...ships.keys()]) if (!seen.has(id)) ships.delete(id);
    if (selectedId != null && !ships.has(selectedId)) selectedId = null;

    // HUD
    hudLoc.textContent = view === "hub" ? "Pirate Hub" : "Home System";
    btnHome.classList.toggle("is-active", view === "home");
    btnHub.classList.toggle("is-active", view === "hub");
    btnHub.disabled = !gateActive;
    if (timerMs != null) {
      hudTimerRow.hidden = false;
      const s = Math.max(0, Math.round(timerMs / 1000));
      hudTimer.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    } else {
      hudTimerRow.hidden = true;
    }
  }

  // ---- chat ----
  function addChat(from, text, sys) {
    const div = document.createElement("div");
    if (sys) { div.className = "sys"; div.textContent = "» " + text; }
    else {
      const who = document.createElement("span");
      who.className = "who"; who.textContent = from + ": ";
      div.appendChild(who);
      div.appendChild(document.createTextNode(text));
    }
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
    while (chatLog.children.length > 80) chatLog.removeChild(chatLog.firstChild);
  }
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const t = chatInput.value.trim();
    if (t) send({ t: "chat", text: t });
    chatInput.value = "";
    chatInput.blur();
  });

  // ---- view buttons ----
  btnHome.addEventListener("click", () => send({ t: "view", which: "home" }));
  btnHub.addEventListener("click", () => { if (!btnHub.disabled) send({ t: "view", which: "hub" }); });

  // ---- camera ----
  let cam = { cx: 0, cy: 0, scale: 10 };
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  function updateCamera() {
    const w = innerWidth, h = innerHeight;
    cam.cx = w / 2; cam.cy = h / 2;
    const R = cfg ? cfg.circumradius : 29;
    cam.scale = (Math.min(w, h) / 2) * 0.88 / R;   // fit the hex with margin
  }
  const toScreen = (wx, wy) => ({ x: cam.cx + wx * cam.scale, y: cam.cy - wy * cam.scale });
  const toWorld = (sx, sy) => ({ x: (sx - cam.cx) / cam.scale, y: -(sy - cam.cy) / cam.scale });

  // ---- input ----
  function eventPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function shipAt(sx, sy) {
    let best = null, bestD = 16; // px
    for (const [id, r] of ships) {
      const p = toScreen(r.x, r.y);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  canvas.addEventListener("click", (e) => {
    const p = eventPos(e);
    const id = shipAt(p.x, p.y);
    if (id != null) {
      const r = ships.get(id);
      if (r && r.mine) selectedId = id;
      return;
    }
    if (view === "home" && cfg) {
      // gate?
      const g = toScreen(cfg.gate.x, cfg.gate.y);
      if (Math.hypot(p.x - g.x, p.y - g.y) < Math.max(14, cfg.gateRadius * cam.scale * 0.25)) {
        send({ t: "activate" });
        setStatus("Opening wormhole…", "ok");
        return;
      }
      // station?
      const st = toScreen(cfg.station.x, cfg.station.y);
      if (Math.hypot(p.x - st.x, p.y - st.y) < Math.max(16, cfg.stationRadius * cam.scale)) {
        if (canSpawn) { send({ t: "spawn" }); setStatus("Building ship…", "ok"); }
        else setStatus("Ship limit reached", "err");
        return;
      }
    }
  });

  canvas.addEventListener("dblclick", (e) => {
    if (selectedId == null) return;
    const p = eventPos(e);
    const w = toWorld(p.x, p.y);
    send({ t: "move", id: selectedId, x: w.x, y: w.y });
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    selectedId = null;
  });

  // ---- drawing ----
  function roundedHexPath(round) {
    const R = cfg.circumradius;
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;           // flat-top: vertices at 0,60,...
      pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
    }
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const V = pts[i];
      const P = pts[(i + 5) % 6];
      const N = pts[(i + 1) % 6];
      const toP = norm(P.x - V.x, P.y - V.y);
      const toN = norm(N.x - V.x, N.y - V.y);
      const A = toScreen(V.x + toP.x * round, V.y + toP.y * round);
      const B = toScreen(V.x + toN.x * round, V.y + toN.y * round);
      const Vs = toScreen(V.x, V.y);
      if (i === 0) ctx.moveTo(A.x, A.y); else ctx.lineTo(A.x, A.y);
      ctx.quadraticCurveTo(Vs.x, Vs.y, B.x, B.y);
    }
    ctx.closePath();
  }
  function norm(x, y) { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; }

  function drawGate() {
    const g = toScreen(cfg.gate.x, cfg.gate.y);
    // transfer-radius ring (home only)
    if (view === "home") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(g.x, g.y, cfg.gateRadius * cam.scale, 0, Math.PI * 2);
      ctx.strokeStyle = gateActive ? "rgba(255,122,42,0.5)" : "rgba(42,182,255,0.25)";
      ctx.setLineDash([6, 8]); ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    // diamond
    const s = 11;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(Math.PI / 4);
    const grd = ctx.createLinearGradient(-s, -s, s, s);
    grd.addColorStop(0, gateActive ? "#ffd2b5" : "#bfe8ff");
    grd.addColorStop(1, gateActive ? "#ff7a2a" : "#2ab6ff");
    ctx.fillStyle = grd;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.5;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.strokeRect(-s, -s, s * 2, s * 2);
    ctx.restore();
    label(g.x, g.y + 22, view === "hub" ? "HUB GATE" : "STARGATE", "rgba(190,232,255,0.8)");
  }

  function drawStation() {
    if (view !== "home") return;
    const st = toScreen(cfg.station.x, cfg.station.y);
    ctx.save();
    ctx.beginPath();
    ctx.arc(st.x, st.y, 13, 0, Math.PI * 2);
    const grd = ctx.createRadialGradient(st.x - 4, st.y - 4, 2, st.x, st.y, 14);
    grd.addColorStop(0, "#3a4658"); grd.addColorStop(1, "#141a24");
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = canSpawn ? "rgba(42,182,255,0.9)" : "rgba(141,152,168,0.6)";
    ctx.stroke();
    // plus sign
    ctx.strokeStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(st.x - 5, st.y); ctx.lineTo(st.x + 5, st.y);
    ctx.moveTo(st.x, st.y - 5); ctx.lineTo(st.x, st.y + 5);
    ctx.stroke();
    ctx.restore();
    label(st.x, st.y + 24, "STATION", "rgba(141,152,168,0.9)");
  }

  function drawShip(r) {
    const p = toScreen(r.x, r.y);
    const ang = -r.hd;                // screen angle (y is inverted)
    const L = 11, W = 7;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    // selection ring
    if (selectedId != null && ships.get(selectedId) === r) {
      ctx.save(); ctx.rotate(-ang);
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(42,182,255,0.9)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }
    // triangle with gradient for depth
    const grd = ctx.createLinearGradient(L, 0, -L * 0.7, 0);
    if (r.mine) { grd.addColorStop(0, "#9fe0ff"); grd.addColorStop(1, "#0b4a73"); }
    else { grd.addColorStop(0, "#ffb199"); grd.addColorStop(1, "#5a0f0f"); }
    ctx.beginPath();
    ctx.moveTo(L, 0);
    ctx.lineTo(-L * 0.7, W);
    ctx.lineTo(-L * 0.7, -W);
    ctx.closePath();
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = r.mine ? "rgba(159,224,255,0.9)" : "rgba(255,177,153,0.9)";
    ctx.stroke();
    ctx.restore();

    // name
    label(p.x, p.y - 20, r.o, r.mine ? "rgba(159,224,255,0.95)" : "rgba(255,177,153,0.95)");
    // hp bar
    const maxHp = cfg ? cfg.maxHp : 100;
    const frac = Math.max(0, Math.min(1, r.hp / maxHp));
    const bw = 24, bh = 3, bx = p.x - bw / 2, by = p.y - 14;
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = frac > 0.5 ? "#39d98a" : frac > 0.25 ? "#ffcc33" : "#ff5a5a";
    ctx.fillRect(bx, by, bw * frac, bh);
  }

  function label(x, y, text, color) {
    ctx.save();
    ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = color || "#fff";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // angle lerp (shortest path)
  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    updateCamera();

    // interpolate ships toward server targets
    const k = Math.min(1, dt * 12);
    for (const r of ships.values()) {
      if (r.tx != null) { r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k; }
      if (r.thd != null) r.hd = lerpAngle(r.hd, r.thd, k);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (cfg) {
      // backdrop glow
      const grd = ctx.createRadialGradient(cam.cx, cam.cy, 10, cam.cx, cam.cy, Math.max(innerWidth, innerHeight) * 0.6);
      grd.addColorStop(0, view === "hub" ? "rgba(60,20,20,0.5)" : "rgba(14,30,55,0.55)");
      grd.addColorStop(1, "rgba(5,8,15,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, innerWidth, innerHeight);

      // hex boundary
      roundedHexPath(cfg.cornerRound);
      ctx.fillStyle = "rgba(10,16,26,0.45)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = view === "hub" ? "rgba(255,122,42,0.55)" : "rgba(120,170,255,0.5)";
      ctx.stroke();

      drawGate();
      drawStation();
      for (const r of ships.values()) drawShip(r);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
