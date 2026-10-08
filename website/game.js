// Atamus tech-demo client — canvas world (systems + one stargate).
// The windowed UI lives in ui.js; this file exposes a small bridge for chat.
(() => {
  "use strict";

  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");

  let cfg = null, me = { id: null, name: "" };
  let snap = { systems: [], gates: [] }; let belts = []; let invs = { ships: {}, hangars: null };
  let ws = null, lastFrame = performance.now();
  let camInit = false;
  const confirming = new Set();

  // bridge for ui.js (chat)
  const bus = new EventTarget();
  let snapAt = 0;             // when the last snapshot arrived (for smooth cycle progress)
  let selectedUnit = null; // { kind:"gate", id } — structure selected by click (ships use `selected`)
  function unitData() {
    if (!selectedUnit) return null;
    if (selectedUnit.kind === "gate") { const g = snap.gates.find((x) => x.id === selectedUnit.id); return g ? { kind: "gate", name: "Stargate", ...g } : null; }
    if (selectedUnit.kind === "station") return { kind: "station", name: "Station", mine: true };
    if (selectedUnit.kind === "ship") { const sh = (snap.ships || []).find((x) => x.id === selectedUnit.id); if (!sh) return null; const t = (cfg && cfg.shipTypes && cfg.shipTypes[sh.type]) || {}; return { kind: "ship", name: t.name || sh.type, ...sh, stats: t }; }
    return null;
  }
  function selectUnit(u) {
    selectedUnit = u; bus.dispatchEvent(new CustomEvent(u ? "select" : "deselect", { detail: u }));
    try { if (u) localStorage.setItem("atamus.sel", JSON.stringify(u)); else localStorage.removeItem("atamus.sel"); } catch {}
  }
  let selRestored = false;
  function restoreSelection() {                       // bring back last session's selection once the world has arrived
    selRestored = true; let u = null;
    try { u = JSON.parse(localStorage.getItem("atamus.sel") || "null"); } catch {}
    if (!u) return;
    if (u.kind === "ship") { const sh = (snap.ships || []).find((x) => x.id === u.id && x.mine); if (sh) { selected.clear(); selected.add(sh.id); syncShipSelection(); } }
    else if (u.kind === "gate") { if (snap.gates.some((g) => g.id === u.id)) selectUnit(u); }
  }
  window.Atamus = { send: (o) => send(o), bus, get me() { return me; }, get unit() { return unitData(); }, deselectUnit: () => selectUnit(null), selectShip: (id) => { selected.clear(); selected.add(id); syncShipSelection(); }, selectStation: () => { selected.clear(); selectUnit({ kind: "station", id: "station" }); }, get snap() { return snap; }, get belts() { return belts; }, get inv() { return invs; }, get cfg() { return cfg; }, ship: (id) => (snap.ships || []).find((x) => x.id === id) || null, get selectedShips() { return [...selected]; },
    targetInfo: (sh, tg) => targetInfo(sh, tg), hud: { line: null }, get view() { return { cx: +cam.cx.toFixed(3), cy: +cam.cy.toFixed(3), w: +viewWTarget.toFixed(3) }; },
    // centre the camera on a ship (or the station it's docked at)
    locateShip: (id) => {
      const sh = (snap.ships || []).find((x) => x.id === id); if (!sh) return false;
      const pl = curPlace.get(sh.sys) || { gx: 0, gy: 0 };
      const p = sh.docked ? (cfg.station || { x: 0, y: 0 }) : shipPos(sh);
      panVel.x = panVel.y = 0; cam.cx = pl.gx + p.x; cam.cy = pl.gy + p.y; viewWTarget = sh.docked ? 14 : 6;
      if (!sh.docked) { selected.clear(); selected.add(sh.id); syncShipSelection(); follow = true; }   // in space: select it and keep it centred, like [F]
      else follow = false;
      return true;
    } };

  const gateImg = new Image(); let gateImgReady = false;
  gateImg.onload = () => (gateImgReady = true); gateImg.src = "assets/stargate.webp";
  const GATE_LEN_KM = 1.656; // stargate ring, true size

  // backdrop lives on its own canvas under the sun layer; the game canvas is transparent on top
  const bgCanvas = document.createElement("canvas"); bgCanvas.id = "bg";
  bgCanvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;";
  canvas.insertAdjacentElement("beforebegin", bgCanvas);
  const bgCtx = bgCanvas.getContext("2d");
  const bgImg = new Image(); let bgReady = false;
  bgImg.onload = () => { bgReady = true; drawBackground(); }; bgImg.src = "assets/nebula_bg.webp";

  // ---- ship art: each hull is drawn at true scale from its sprite (stats come from the server) ----
  // Own ships render blue, other players' ships red.
  const hull = (type) => (cfg && cfg.shipTypes && cfg.shipTypes[type]) || { name: "Chisel", sprite: "chisel", lengthKm: 0.128 };
  // station: one per system at its centre, drawn at true size (2766 m long)
  const STATION_LEN_KM = 2.766;
  const DOCK_RADIUS_KM = 4;   // ships within this of the station can dock / are anchored
  const stationArt = { blue: new Image(), red: new Image() };
  stationArt.blue.src = "assets/ships/station_blue.webp";
  stationArt.red.src = "assets/ships/station_red.webp";

  const shipArt = {}; // type -> { blue:Image, red:Image }
  function art(type) {
    const spr = hull(type).sprite;
    if (!shipArt[spr]) {
      const b = new Image(); b.src = "assets/ships/" + spr + "_blue.webp";
      const r = new Image(); r.src = "assets/ships/" + spr + "_red.webp";
      shipArt[spr] = { blue: b, red: r };
    }
    return shipArt[spr];
  }

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
      if (m.t === "countdown") { const at = m.in != null ? Date.now() + m.in : m.at; pending = { at, parts: m.parts || ["server", "web"] }; startCountdown(at); return; }
      if (m.t === "update") { if (m.web !== BUILD) reloadForUpdate(m.web); return; }
      if (m.t === "hello" && m.build) {
        if (serverBuild && m.build !== serverBuild) {
          // new server is up; if the website is switching too, its push does the one reload
          const webComing = pending && pending.parts.includes("web") && Date.now() < pending.at + 180_000;
          if (!webComing) { reloadForUpdate("s" + m.build); return; }
        }
        serverBuild = m.build;
      }
      if (m.t === "hello") { cfg = m.cfg; me = m.you; belts = m.belts || []; computeSystemRadius(); }
      else if (m.t === "snap") {
        if (selectedUnit && selectedUnit.kind === "ship") {         // the selected ship just docked: select the station instead
          const was = (snap.ships || []).find((x) => x.id === selectedUnit.id), now = (m.ships || []).find((x) => x.id === selectedUnit.id);
          if (was && !was.docked && now && now.docked) { selected.delete(now.id); selectedUnit = null; setTimeout(() => selectUnit(null), 0); }   // the selected ship docked: drop the selection
        }
        snap = m; snapAt = performance.now(); if (!selRestored && invs.hangars) { restoreSelection(); bus.dispatchEvent(new CustomEvent("worldready")); } bus.dispatchEvent(new CustomEvent("snap")); }
      else if (m.t === "belts") belts = m.belts || [];
      else if (m.t === "inv") { invs = m; bus.dispatchEvent(new CustomEvent("inv")); }
      else if (m.t === "rocks") { for (const u of m.rocks) for (const b of belts) { const i = b.rocks.findIndex((r) => r.id === u.id); if (i >= 0) { if (u.m3 <= 0) b.rocks.splice(i, 1); else b.rocks[i].m3 = u.m3; } } }
      else if (m.t === "chat") bus.dispatchEvent(new CustomEvent("chat", { detail: m }));
      else if (m.t === "sys") bus.dispatchEvent(new CustomEvent("sys", { detail: m }));
    };
  }
  // ---- new build live? reload onto it (UI layout and selection are restored after the reload) ----
  const BUILD = (document.querySelector('meta[name="atamus-build"]') || {}).content;
  let serverBuild = null, reloading = false, pending = null;
  // "Update in 0:30" — the live build switches at zero, then the reload below happens
  // countdown panel near the top of the page; the number does a quick bounce on every tick
  let cdTimer = 0, cdEl = null;
  function startCountdown(at) {
    clearInterval(cdTimer);
    if (!cdEl) {
      cdEl = document.createElement("div"); cdEl.id = "update-cd";
      cdEl.innerHTML = '<div class="ucd-title">Update incoming</div><div class="ucd-num"></div>';
      document.body.appendChild(cdEl);
    }
    const num = cdEl.querySelector(".ucd-num"); let last = -1;
    cdEl.hidden = false; statusEl.classList.add("hidden");
    const tick = () => {
      const left = Math.max(0, Math.ceil((at - Date.now()) / 1000));
      if (left !== last) {
        last = left;
        num.textContent = "0:" + String(left).padStart(2, "0");
        if (left === 0) setTimeout(kickForUpdate, 400);                                    // time's up: everyone out, then the update goes live
        num.classList.remove("bounce"); void num.offsetWidth; num.classList.add("bounce");   // restart the bounce
      }
      if (Date.now() > at + 120_000) { clearInterval(cdTimer); cdEl.hidden = true; }      // nothing arrived: give up quietly
    };
    tick(); cdTimer = setInterval(tick, 200);
  }
  // Log out of the game to the website's welcome page, which waits for the new version to go live.
  function kickForUpdate() {
    if (reloading) return; reloading = true; saveView();
    try { ws.onclose = null; ws.close(); } catch {}
    const q = new URLSearchParams({ updating: "1", web: BUILD || "", srv: serverBuild || "", parts: ((pending && pending.parts) || ["server", "web"]).join(",") });
    location.href = "play.html?" + q;
  }
  function reloadForUpdate(v) {
    if (pending && Date.now() < pending.at + 180_000) return kickForUpdate();   // part of a countdown: log out rather than reload in place
    if (reloading) return; reloading = true; saveView();
    setStatus("Atamus has been updated — reloading…");
    setTimeout(() => location.replace(location.pathname + "?cb=" + String(v || Date.now()).slice(0, 8)), 600);
  }
  // keep the camera where it was across an update reload (same tab only)
  function saveView() { try { sessionStorage.setItem("atamus.view", JSON.stringify({ cx: cam.cx, cy: cam.cy, w: viewWTarget, follow })); } catch {} }
  addEventListener("pagehide", saveView);
  function checkVersion() {
    if (!BUILD || BUILD === "__BUILD__") return;                    // local/dev copy
    fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!j || !j.v || j.v === BUILD) return;
      if (sessionStorage.getItem("atamus.upd") === j.v) return;     // already reloaded for this build once: don't loop
      sessionStorage.setItem("atamus.upd", j.v);
      reloadForUpdate(j.v);
    }).catch(() => {});
  }
  setInterval(checkVersion, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkVersion(); });
  setTimeout(checkVersion, 5000);
  function send(o) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); }

  function fmt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

  function placements() {
    const place = new Map(); const home = snap.systems.find((s) => s.mine);
    if (home) place.set(home.id, { gx: 0, gy: 0 });
    for (const s of snap.systems) { if (s.mine) continue; let dir = { x: 1, y: 0 }; if (s.fromGateLocal) { const d = Math.hypot(s.fromGateLocal.x, s.fromGateLocal.y) || 1; dir = { x: s.fromGateLocal.x / d, y: s.fromGateLocal.y / d }; } place.set(s.id, { gx: dir.x * placeDist, gy: dir.y * placeDist }); }
    return place;
  }

  const ZOOM_MIN_W = 3.75;  // smallest view width (km) = deepest zoom-in
  let cam = { cx: 0, cy: 0, viewW: 600 }, curMaxW = 600, viewWTarget = 600;
  const panVel = { x: 0, y: 0 };
  function resize() { const dpr = window.devicePixelRatio || 1; canvas.width = Math.floor(innerWidth * dpr); canvas.height = Math.floor(innerHeight * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  addEventListener("resize", () => { resize(); drawBackground(); }); resize(); drawBackground();
  if (window.SunFX) window.SunFX.init();
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
    if (k === "w" || k === "a" || k === "s" || k === "d") { keys.add(k); follow = false; e.preventDefault(); return; }
    if (k === "f") { follow = selected.size > 0; e.preventDefault(); return; }  // follow selected ship / group COM
    if (k === "x") { const id = [...selected][0]; const sh = id && (snap.ships || []).find((x) => x.id === id); if (sh) send({ t: "mine", ship: id, on: !sh.mining }); return; }
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => keys.clear());
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); viewWTarget = Math.max(ZOOM_MIN_W, Math.min(curMaxW, viewWTarget * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); }, { passive: false });

  function eventPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  let curPlace = new Map();
  function mySys() { const h = snap.systems.find((s) => s.mine); return h ? h.id : null; }

  // ---- ship selection + movement (semi-RTS) ----
  const selected = new Set();           // selected ship ids
  let drag = null, selBox = null, deselectTimer = 0, follow = false;
  // smoothed render positions so 15 Hz snapshots don't look skippy
  const shipRender = new Map();         // id -> { x, y, h }
  function updateShipRender(dt) {
    const k = 1 - Math.exp(-16 * dt), kh = 1 - Math.exp(-12 * dt), live = new Set();
    for (const sh of snap.ships || []) {
      live.add(sh.id);
      let r = shipRender.get(sh.id);
      if (!r) { shipRender.set(sh.id, { x: sh.x, y: sh.y, h: sh.h != null ? sh.h : Math.PI / 2 }); continue; }
      r.x += (sh.x - r.x) * k; r.y += (sh.y - r.y) * k;
      if (sh.h != null) r.h += Math.atan2(Math.sin(sh.h - r.h), Math.cos(sh.h - r.h)) * kh;
    }
    for (const id of [...shipRender.keys()]) if (!live.has(id)) shipRender.delete(id);
  }
  function shipPos(sh) { return shipRender.get(sh.id) || { x: sh.x, y: sh.y, h: sh.h != null ? sh.h : Math.PI / 2 }; }
  function followAnchor() {
    let n = 0, sx = 0, sy = 0;
    for (const sh of snap.ships || []) { if (!sh.mine || !selected.has(sh.id)) continue; const pl = curPlace.get(sh.sys); if (!pl) continue; const p = shipPos(sh); sx += pl.gx + p.x; sy += pl.gy + p.y; n++; }
    return n ? { x: sx / n, y: sy / n } : null;
  }
  function screenToWorld(px, py) { const s = scale(); return { x: cam.cx + (px - innerWidth / 2) / s, y: cam.cy - (py - innerHeight / 2) / s }; }
  function shipScreen(sh) { const pl = curPlace.get(sh.sys); if (!pl) return null; const p = shipPos(sh); return { x: gx2s(pl.gx + p.x), y: gy2s(pl.gy + p.y) }; }
  function stationAt(p) {
    const pl = curPlace.get(mySys()); if (!pl || !cfg) return false;
    const st = cfg.station || { x: 0, y: 0 }; const sx = gx2s(pl.gx + st.x), sy = gy2s(pl.gy + st.y);
    return Math.hypot(p.x - sx, p.y - sy) <= Math.max(14, STATION_LEN_KM * scale() * 0.4);
  }
  function rockAt(p) {
    const pl = curPlace.get(mySys()); if (!pl) return null;
    let best = null, bd = Infinity;
    for (const b of belts) for (const rk of b.rocks) { const x = gx2s(pl.gx + rk.x), y = gy2s(pl.gy + rk.y); const r = Math.max(8, (rk.size / 1000) * scale() * 0.5 + 3); const d = Math.hypot(p.x - x, p.y - y); if (d <= r && d < bd) { bd = d; best = rk; } }
    return best;
  }
  function anyShipAt(p) {   // any ship, not just mine (for targeting)
    let best = null, bd = Infinity;
    for (const sh of snap.ships || []) { const sp = shipScreen(sh); if (!sp) continue; const r = Math.max(12, hull(sh.type).lengthKm * scale() / 2 + 5); const d = Math.hypot(p.x - sp.x, p.y - sp.y); if (d <= r && d < bd) { bd = d; best = sh; } }
    return best;
  }
  function gateAt(p) {
    for (const g of snap.gates) { const pl = curPlace.get(g.sys); if (!pl) continue; const sx = gx2s(pl.gx + g.lx), sy = gy2s(pl.gy + g.ly); const r = Math.max(14, GATE_LEN_KM * scale() / 2); if (Math.hypot(p.x - sx, p.y - sy) <= r) return g; }
    return null;
  }
  function shipAt(p) {
    let best = null, bestD = Infinity;
    for (const sh of snap.ships || []) { if (!sh.mine || sh.docked) continue; const s = shipScreen(sh); if (!s) continue; const r = Math.max(12, hull(sh.type).lengthKm * scale() / 2 + 5); const d = Math.hypot(p.x - s.x, p.y - s.y); if (d <= r && d < bestD) { bestD = d; best = sh; } }
    return best;
  }
  // exactly one ship selected -> it owns the unit panel
  function syncShipSelection() {
    if (selected.size === 1) selectUnit({ kind: "ship", id: [...selected][0] });
    else if (selectedUnit && selectedUnit.kind === "ship") selectUnit(null);
  }
  function commandMove(p) {
    if (!selected.size) return;
    const pl = curPlace.get(mySys()); if (!pl) return;
    const w = screenToWorld(p.x, p.y);
    send({ t: "move", ships: [...selected], x: w.x - pl.gx, y: w.y - pl.gy });
  }
  // target lock (toggle) at a screen point for the first selected ship; true if something was there
  function lockAt(p) {
    const shipId = [...selected][0]; if (!shipId) return false;
    const rk = rockAt(p); if (rk) { send({ t: "lock", ship: shipId, kind: "rock", id: rk.id }); return true; }
    const g = gateAt(p); if (g) { send({ t: "lock", ship: shipId, kind: "gate", id: g.id }); return true; }
    if (stationAt(p)) { send({ t: "lock", ship: shipId, kind: "station", id: "station" }); return true; }
    const o = anyShipAt(p); if (o && o.id !== shipId) { send({ t: "lock", ship: shipId, kind: "ship", id: o.id }); return true; }
    return false;
  }
  // a click/tap on the map: select what's there, or (empty) deselect after a beat so a double can still move
  function clickAt(p, shift) {
    const can = canAt(p);
    if (can) { bus.dispatchEvent(new CustomEvent("can", { detail: { id: can.id, x: p.x, y: p.y } })); return; }
    const gate = gateAt(p);
    if (gate) { selected.clear(); selectUnit({ kind: "gate", id: gate.id }); return; }
    const ship = shipAt(p);
    if (ship) {
      if (!shift) selected.clear(); if (shift && selected.has(ship.id)) selected.delete(ship.id); else selected.add(ship.id);
      syncShipSelection(); return;
    }
    if (stationAt(p)) { bus.dispatchEvent(new CustomEvent("openstation")); return; }   // clicking the station opens its hangar
    if (selectedUnit && selectedUnit.kind !== "ship") selectUnit(null); // ships deselect on the timer below (dbl-click keeps them)
    clearTimeout(deselectTimer); deselectTimer = setTimeout(() => { selected.clear(); syncShipSelection(); }, 260);
  }
  function boxSelect(x0, y0, x1, y1, shift) {
    if (!shift) selected.clear();
    for (const sh of snap.ships || []) { if (!sh.mine || sh.docked) continue; const s = shipScreen(sh); if (s && s.x >= Math.min(x0, x1) && s.x <= Math.max(x0, x1) && s.y >= Math.min(y0, y1) && s.y <= Math.max(y0, y1)) selected.add(sh.id); }
    syncShipSelection();
  }
  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const p = eventPos(e);
    if (e.ctrlKey || e.metaKey) { lockAt(p); return; }  // target lock (toggle) for the selected ship
    drag = { x0: p.x, y0: p.y, moved: false, ship: shipAt(p), shift: e.shiftKey };
  });
  addEventListener("mousemove", (e) => {
    if (!drag) return;
    const p = eventPos(e);
    if (Math.abs(p.x - drag.x0) > 4 || Math.abs(p.y - drag.y0) > 4) drag.moved = true;
    if (drag.moved && !drag.ship) selBox = { x0: Math.min(drag.x0, p.x), y0: Math.min(drag.y0, p.y), x1: Math.max(drag.x0, p.x), y1: Math.max(drag.y0, p.y) };
  });
  addEventListener("mouseup", (e) => {
    if (e.button !== 0 || !drag) return;
    const p = eventPos(e); const d = drag; drag = null; selBox = null;
    if (d.moved && !d.ship) boxSelect(d.x0, d.y0, p.x, p.y, d.shift);
    else if (!d.moved) clickAt(p, d.shift);
  });
  canvas.addEventListener("dblclick", (e) => {
    if (e.button !== 0) return; const p = eventPos(e);
    clearTimeout(deselectTimer);                  // keep selection for the move order
    if (!gateAt(p) && !shipAt(p)) commandMove(p);
  });

  // ---- touch: tap = click, double-tap = move, drag = pan, hold = lock target (or box-select on empty),
  //      two fingers = pinch zoom + pan ----
  const touch = { pts: new Map(), mode: null, hold: 0, lastTap: 0, lastTapAt: null, pinch: null };
  const tpos = (t) => { const r = canvas.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) touch.pts.set(t.identifier, tpos(t));
    clearTimeout(touch.hold);
    if (touch.pts.size === 1) {
      const p = [...touch.pts.values()][0];
      touch.mode = "tap"; touch.start = p; touch.cur = p; touch.cam = { cx: cam.cx, cy: cam.cy };
      touch.hold = setTimeout(() => {                      // long press
        if (touch.mode !== "tap") return;
        if (lockAt(touch.start)) { touch.mode = "done"; if (navigator.vibrate) navigator.vibrate(15); }
        else { touch.mode = "box"; selBox = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; }
      }, 450);
    } else if (touch.pts.size === 2) {
      const [a, b] = [...touch.pts.values()];
      touch.mode = "pinch"; selBox = null; follow = false;
      touch.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), viewW: viewWTarget, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam: { cx: cam.cx, cy: cam.cy } };
    }
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (touch.pts.has(t.identifier)) touch.pts.set(t.identifier, tpos(t));
    if (touch.mode === "pinch" && touch.pts.size >= 2) {
      const [a, b] = [...touch.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      viewWTarget = Math.max(ZOOM_MIN_W, Math.min(curMaxW, touch.pinch.viewW * touch.pinch.d / d)); cam.viewW = viewWTarget;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, sc = scale();
      cam.cx = touch.pinch.cam.cx - (mid.x - touch.pinch.mid.x) / sc; cam.cy = touch.pinch.cam.cy + (mid.y - touch.pinch.mid.y) / sc;
      return;
    }
    const p = [...touch.pts.values()][0]; if (!p) return; touch.cur = p;
    if (touch.mode === "tap" && Math.hypot(p.x - touch.start.x, p.y - touch.start.y) > 10) { touch.mode = "pan"; clearTimeout(touch.hold); follow = false; }
    if (touch.mode === "pan") { const sc = scale(); cam.cx = touch.cam.cx - (p.x - touch.start.x) / sc; cam.cy = touch.cam.cy + (p.y - touch.start.y) / sc; panVel.x = panVel.y = 0; }
    else if (touch.mode === "box") selBox = { x0: Math.min(touch.start.x, p.x), y0: Math.min(touch.start.y, p.y), x1: Math.max(touch.start.x, p.x), y1: Math.max(touch.start.y, p.y) };
  }, { passive: false });
  const touchEnd = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) touch.pts.delete(t.identifier);
    if (touch.pts.size) { if (touch.mode === "pinch" && touch.pts.size === 1) { touch.mode = "done"; } return; }
    clearTimeout(touch.hold);
    const mode = touch.mode; touch.mode = null;
    if (mode === "box") { boxSelect(selBox.x0, selBox.y0, selBox.x1, selBox.y1, false); selBox = null; return; }
    if (mode !== "tap") return;
    const p = touch.cur, now = performance.now();
    if (touch.lastTapAt && now - touch.lastTap < 320 && Math.hypot(p.x - touch.lastTapAt.x, p.y - touch.lastTapAt.y) < 24) {
      touch.lastTap = 0; clearTimeout(deselectTimer);                 // double-tap: move order
      if (!gateAt(p) && !shipAt(p)) commandMove(p);
      return;
    }
    touch.lastTap = now; touch.lastTapAt = p;
    clickAt(p, false);
  };
  canvas.addEventListener("touchend", touchEnd, { passive: false });
  canvas.addEventListener("touchcancel", touchEnd, { passive: false });

  // ---- drawing ----
  function norm(x, y) { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; }
  function hexCorners() { const R = cfg.cellCircumradius, pts = []; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) }); } return pts; }
  function drawCell(cx, cy, round, stroke, fill) { const pts = hexCorners(); ctx.beginPath(); for (let i = 0; i < 6; i++) { const V = pts[i], P = pts[(i + 5) % 6], N = pts[(i + 1) % 6]; const tP = norm(P.x - V.x, P.y - V.y), tN = norm(N.x - V.x, N.y - V.y); const Ax = gx2s(cx + V.x + tP.x * round), Ay = gy2s(cy + V.y + tP.y * round); const Bx = gx2s(cx + V.x + tN.x * round), By = gy2s(cy + V.y + tN.y * round); const Vx = gx2s(cx + V.x), Vy = gy2s(cy + V.y); if (i === 0) ctx.moveTo(Ax, Ay); else ctx.lineTo(Ax, Ay); ctx.quadraticCurveTo(Vx, Vy, Bx, By); } ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke(); } }
  function systemTheme(s) { const fill = "rgba(0,0,0,0.15)"; if (s.mine) return { line: "rgba(120,170,255,0.55)", fill }; if (s.id === "sys:hub") return { line: "rgba(255,122,42,0.6)", fill }; return { line: "rgba(255,90,90,0.55)", fill }; }

  function drawGate(g, pl) {
    const sx = gx2s(pl.gx + g.lx), sy = gy2s(pl.gy + g.ly);
    const wPx = Math.max(3, GATE_LEN_KM * scale());
    if (gateImgReady && gateImg.naturalWidth) {
      const hPx = wPx * (gateImg.naturalHeight / gateImg.naturalWidth);
      ctx.save(); ctx.imageSmoothingEnabled = wPx > 300; ctx.drawImage(gateImg, sx - wPx / 2, sy - hPx / 2, wPx, hPx); ctx.restore();
    } else { ctx.save(); ctx.strokeStyle = "#8a93a0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, wPx / 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    // gate-use ring: any ship inside can use the stargate (brighter while connected)
    const rPx = cfg.transferRadius * scale();
    if (rPx > 6) { ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, rPx, 0, Math.PI * 2); ctx.setLineDash([6, 7]); ctx.lineWidth = 1;
      ctx.strokeStyle = (g.state === "active" && g.connToSys) ? "rgba(255,170,80,0.6)" : "rgba(220,200,160,0.3)"; ctx.stroke(); ctx.restore(); }
    if (selectedUnit && selectedUnit.kind === "gate" && selectedUnit.id === g.id) drawSelBox(sx, sy, Math.max(12, wPx * 0.58));
  }
  function centerText(text, cx, yBottom, color) { ctx.save(); ctx.font = "11px " + fontFamily(); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = color || "#fff"; ctx.fillText(text, cx, yBottom); ctx.restore(); }
  function fontFamily() { return getComputedStyle(document.body).fontFamily; }

  function drawBackground() {   // static: redrawn on resize / image load only
    const dpr = window.devicePixelRatio || 1;
    bgCanvas.width = Math.floor(innerWidth * dpr); bgCanvas.height = Math.floor(innerHeight * dpr); bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (bgReady && bgImg.naturalWidth) {
      const iw = bgImg.naturalWidth, ih = bgImg.naturalHeight, s = Math.max(innerWidth / iw, innerHeight / ih);
      const w = iw * s, h = ih * s;
      bgCtx.drawImage(bgImg, (innerWidth - w) / 2, (innerHeight - h) / 2, w, h);
    } else { bgCtx.fillStyle = "#05080f"; bgCtx.fillRect(0, 0, innerWidth, innerHeight); }
    bgCtx.fillStyle = "rgba(4,6,12,0.55)"; bgCtx.fillRect(0, 0, innerWidth, innerHeight); // darken
  }

  const SUN_RADIUS_KM = 4;   // stylised star disc; glow/flare scale off it
  function sunRadiusPx() { return Math.max(14, Math.min(0.28 * Math.min(innerWidth, innerHeight), SUN_RADIUS_KM * scale())); }

  // ---- asteroid belts: beacon + crescent of rocks, sprites drawn at true size ----
  const oreRock = {}; const rockArt = {};
  // per-sprite alpha masks so beams can stop on the visible rock surface
  const alphaMasks = new Map();
  function alphaMask(img) {
    let m = alphaMasks.get(img); if (m) return m;
    if (!img.naturalWidth) return null;
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, a = new Uint8Array(c.width * c.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    m = { w: c.width, h: c.height, a }; alphaMasks.set(img, m); return m;
  }
  // first opaque pixel of a rock's sprite along the screen ray (ox,oy)->(tx,ty); null if the ray misses
  function rockHit(home, rk, ox, oy, tx, ty) {
    const o = oreRock[rk.ore] || { rock: "cratered" }, img = rockImg(o.rock, rk.size), m = alphaMask(img); if (!m) return null;
    const cx = gx2s(home.gx + rk.x), cy = gy2s(home.gy + rk.y), wPx = (rk.size / 1000) * scale(), hPx = wPx * (m.h / m.w);
    if (wPx < 2.2) return { x: cx, y: cy };
    const R = Math.hypot(wPx, hPx) / 2, dx = tx - ox, dy = ty - oy, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    // enter / leave the sprite's bounding circle
    const fx = ox - cx, fy = oy - cy, b = fx * ux + fy * uy, cc = fx * fx + fy * fy - R * R, disc = b * b - cc; if (disc < 0) return null;
    const t0 = Math.max(0, -b - Math.sqrt(disc)), t1 = -b + Math.sqrt(disc); if (t1 < 0) return null;
    const cos = Math.cos(-rk.rot), sin = Math.sin(-rk.rot), step = Math.max(0.5, (t1 - t0) / 240);
    for (let t = t0; t <= t1; t += step) {
      const px = ox + ux * t - cx, py = oy + uy * t - cy;
      const u = px * cos - py * sin, v = px * sin + py * cos;          // into the sprite's unrotated frame
      const ix = Math.floor((u / wPx + 0.5) * m.w), iy = Math.floor((v / hPx + 0.5) * m.h);
      if (ix >= 0 && iy >= 0 && ix < m.w && iy < m.h && m.a[iy * m.w + ix] > 128) return { x: ox + ux * t, y: oy + uy * t };
    }
    return null;
  }
  function rockById(id) { for (const b of belts) { const r = b.rocks.find((q) => q.id === id); if (r) return r; } return null; }
  function rockImg(family, size) { const k = family + "_" + size; if (!rockArt[k]) { const i = new Image(); i.src = "assets/rocks/rock_" + k + ".webp"; rockArt[k] = i; } return rockArt[k]; }
  // selection marker: orange box, corners only
  function drawSelBox(cx, cy, half) {
    const L = Math.max(4, half * 0.45); const x0 = cx - half, y0 = cy - half, x1 = cx + half, y1 = cy + half;
    ctx.save(); ctx.strokeStyle = "rgba(255,160,70,0.95)"; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
    ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
    ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
    ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
    ctx.stroke(); ctx.restore();
  }

  // world position (home-system local, km) of a target
  function targetWorld(tg) {
    if (tg.kind === "rock") { for (const b of belts) { const rk = b.rocks.find((r) => r.id === tg.id); if (rk) return { x: rk.x, y: rk.y, rock: rk }; } return null; }
    if (tg.kind === "gate") { const g = snap.gates.find((x) => x.id === tg.id); return g ? { x: g.lx, y: g.ly, gate: g } : null; }
    if (tg.kind === "station") { const st = cfg.station || { x: 0, y: 0 }; return { x: st.x, y: st.y }; }
    if (tg.kind === "ship") { const o = (snap.ships || []).find((x) => x.id === tg.id); if (!o) return null; const p = shipPos(o); return { x: p.x, y: p.y, ship: o }; }
    return null;
  }
  // what the HUD shows for one of a ship's targets: screen point, distance, name, remaining
  function targetInfo(sh, tg) {
    const w = targetWorld(tg); if (!w || !cfg) return null;
    const p = shipPos(sh), dist = Math.hypot(w.x - p.x, w.y - p.y);
    const scr = targetScreen(curPlace, tg);
    let name = tg.kind, sub = "";
    if (w.rock) { const o = (cfg.ores || []).find((q) => q.key === w.rock.ore); name = (o ? o.name : w.rock.ore) + " " + w.rock.size + " m"; sub = Math.round(w.rock.m3).toLocaleString() + " m³ left"; }
    else if (tg.kind === "gate") { name = "Stargate"; }
    else if (tg.kind === "station") { name = "Station"; }
    else if (w.ship) { const t = hull(w.ship.type); name = w.ship.name || t.name || w.ship.type; sub = w.ship.hp != null ? Math.round(w.ship.hp) + " hp" : ""; }
    return { sx: scr ? scr.x : null, sy: scr ? scr.y : null, dist, name, sub, icon: w.rock ? "assets/rocks/rock_" + (((cfg.ores || []).find((q) => q.key === w.rock.ore) || {}).rock || "cratered") + "_200.webp" : tg.kind === "gate" ? "assets/ships/stargate.webp" : tg.kind === "station" ? "assets/ships/station_blue.webp" : w.ship ? "assets/ships/" + hull(w.ship.type).sprite + (w.ship.mine ? "_blue" : "_red") + ".webp" : null };
  }
  function targetScreen(place, tg) {
    const pl = place.get(mySys()); if (!pl) return null;
    if (tg.kind === "rock") { for (const b of belts) { const rk = b.rocks.find((r) => r.id === tg.id); if (rk) return { x: gx2s(pl.gx + rk.x), y: gy2s(pl.gy + rk.y), r: Math.max(9, (rk.size / 1000) * scale() * 0.6) }; } return null; }
    if (tg.kind === "gate") { const g = snap.gates.find((x) => x.id === tg.id); return g ? { x: gx2s(pl.gx + g.lx), y: gy2s(pl.gy + g.ly), r: Math.max(12, GATE_LEN_KM * scale() * 0.6) } : null; }
    if (tg.kind === "station") { const st = cfg.station || { x: 0, y: 0 }; return { x: gx2s(pl.gx + st.x), y: gy2s(pl.gy + st.y), r: Math.max(14, STATION_LEN_KM * scale() * 0.55) }; }
    if (tg.kind === "ship") { const o = (snap.ships || []).find((x) => x.id === tg.id); if (!o) return null; const sp = shipScreen(o); return sp ? { x: sp.x, y: sp.y, r: Math.max(10, hull(o.type).lengthKm * scale() * 0.62) } : null; }
    return null;
  }
  // two half-crescents either side of the target: flashing while locking, orange when locked
  function drawTarget(place, sh, sx, sy, tg) {
    const t = targetScreen(place, tg); if (!t) return;
    const blink = tg.locked ? 1 : (0.35 + 0.65 * Math.abs(Math.sin(performance.now() / 120)));
    ctx.save(); ctx.lineWidth = 1.5; ctx.strokeStyle = tg.locked ? `rgba(255,160,70,${blink})` : `rgba(180,220,255,${blink})`;
    const r = t.r + 3, a = 0.95;
    ctx.beginPath(); ctx.arc(t.x, t.y, r, Math.PI - a, Math.PI + a); ctx.stroke();
    ctx.beginPath(); ctx.arc(t.x, t.y, r, -a, a); ctx.stroke();
    if (!tg.locked && tg.p != null) { ctx.beginPath(); ctx.arc(t.x, t.y, r + 4, -Math.PI / 2, -Math.PI / 2 + tg.p * Math.PI * 2); ctx.strokeStyle = "rgba(180,220,255,0.6)"; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.restore();
  }
  // mining beams: each laser fires from one of the ship's hardpoints to its own spot on the rock's rim
  function drawLasers(place, sh, sx, sy, h) {
    if (!sh.lasers || !sh.lasers.some((l) => l.on)) return;
    const pl = place.get(sh.sys); if (!pl) return;
    const t = (cfg.shipTypes && cfg.shipTypes[sh.type]) || {}, hps = t.hardpoints || [[0, 0]];
    const L = hull(sh.type).lengthKm * scale();
    const c = Math.cos(-h), sn = Math.sin(-h);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const cyc = (cfg.cycleMs || 15000);
    for (const l of sh.lasers) {
      if (!l.on) continue;
      const hp = hps[l.hp] || hps[0];
      const ox = sx + (hp[0] * c - hp[1] * sn) * L, oy = sy + (hp[0] * sn + hp[1] * c) * L;
      let ex = gx2s(pl.gx + l.ax), ey = gy2s(pl.gy + l.ay);
      const rk = rockById(l.rock);
      if (rk) {                                            // stop on the first solid pixel of the rock (aim point, else its centre)
        const h = rockHit(pl, rk, ox, oy, ex, ey) || rockHit(pl, rk, ox, oy, gx2s(pl.gx + rk.x), gy2s(pl.gy + rk.y));
        if (h) { ex = h.x; ey = h.y; }
      }
      ex += (Math.random() - 0.5) * 0.8; ey += (Math.random() - 0.5) * 0.8;
      const col = l.repeat ? "255,140,60" : "200,120,80";
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.strokeStyle = `rgba(${col},0.35)`; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.strokeStyle = "rgba(255,230,180,0.9)"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, ey, 2.2, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,240,200,0.8)"; ctx.fill();
      // the chunk being cut: rides the beam from the rock to the ship over the cycle
      const p = Math.min(1, (l.p || 0) + (performance.now() - snapAt) / (l.dur || cyc));
      const qx = ex + (ox - ex) * p, qy = ey + (oy - ey) * p, qs = Math.max(3, Math.min(7, L * 0.12));
      ctx.save(); ctx.translate(qx, qy); ctx.rotate(p * 6); ctx.fillStyle = "rgba(190,170,140,0.95)"; ctx.fillRect(-qs / 2, -qs / 2, qs, qs); ctx.strokeStyle = "rgba(255,220,170,0.8)"; ctx.lineWidth = 1; ctx.strokeRect(-qs / 2, -qs / 2, qs, qs); ctx.restore();
    }
    ctx.restore();
  }

  function drawBelts(place) {
    const home = place.get(mySys()); if (!home || !cfg) return;
    if (!Object.keys(oreRock).length) for (const o of cfg.ores || []) oreRock[o.key] = { rock: o.rock, color: o.color };
    const s = scale();
    for (const belt of belts) {
      for (const rk of belt.rocks) {
        const x = gx2s(home.gx + rk.x), y = gy2s(home.gy + rk.y);
        const wPx = (rk.size / 1000) * s;                        // rock width at true scale
        if (x < -wPx || y < -wPx || x > innerWidth + wPx || y > innerHeight + wPx) continue;
        const o = oreRock[rk.ore] || { rock: "cratered", color: "#999" };
        if (wPx < 2.2) { ctx.fillStyle = o.color; const d = Math.max(1.2, wPx); ctx.fillRect(x - d / 2, y - d / 2, d, d); continue; }
        const img = rockImg(o.rock, rk.size);
        if (!img.naturalWidth) continue;
        const hPx = wPx * (img.naturalHeight / img.naturalWidth);
        ctx.save(); ctx.translate(x, y); ctx.rotate(rk.rot); ctx.imageSmoothingEnabled = wPx > 40;
        ctx.drawImage(img, -wPx / 2, -hPx / 2, wPx, hPx); ctx.restore();
      }
      // beacon: small fixed-size marker at the belt centre
      const bx = gx2s(home.gx + belt.x), by = gy2s(home.gy + belt.y);
      const bc = belt.color || "#78dcff"; ctx.save(); ctx.strokeStyle = bc; ctx.fillStyle = bc; ctx.globalAlpha = 0.9; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx, by - 7); ctx.lineTo(bx + 7, by); ctx.lineTo(bx, by + 7); ctx.lineTo(bx - 7, by); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  // jettison cans: a small crate glyph (own cans blue, others amber), always at least a few pixels
  function canScreen(c) { const pl = curPlace.get(c.sys); return pl ? { x: gx2s(pl.gx + c.x), y: gy2s(pl.gy + c.y) } : null; }
  function canAt(p) { let best = null, bd = 14; for (const c of snap.cans || []) { const sc = canScreen(c); if (!sc) continue; const d = Math.hypot(p.x - sc.x, p.y - sc.y); if (d < bd) { bd = d; best = c; } } return best; }
  function drawCans() {
    for (const c of snap.cans || []) {
      const sc = canScreen(c); if (!sc) continue;
      const r = Math.max(4, 0.03 * scale());
      ctx.save(); ctx.translate(sc.x, sc.y);
      ctx.fillStyle = c.mine ? "rgba(70,150,220,0.9)" : "rgba(220,160,70,0.9)"; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1;
      ctx.fillRect(-r, -r * 0.75, r * 2, r * 1.5); ctx.strokeRect(-r + 0.5, -r * 0.75 + 0.5, r * 2 - 1, r * 1.5 - 1);
      ctx.beginPath(); ctx.moveTo(-r, -r * 0.25); ctx.lineTo(r, -r * 0.25); ctx.stroke();
      ctx.restore();
    }
  }
  function drawStations(place) {
    for (const sE of snap.systems) {
      if (sE.id === "sys:hub") continue;                 // the pirate hub has no player station
      const pl = place.get(sE.id); if (!pl) continue;
      const st = cfg.station || { x: 0, y: 0 };
      const sx = gx2s(pl.gx + st.x), sy = gy2s(pl.gy + st.y);
      // dock / anchor radius ring
      const rPx = DOCK_RADIUS_KM * scale();
      if (rPx > 6) {
        ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, rPx, 0, Math.PI * 2);
        ctx.setLineDash([6, 7]); ctx.lineWidth = 1;
        ctx.strokeStyle = sE.mine ? "rgba(120,170,255,0.35)" : "rgba(255,110,110,0.3)";
        ctx.stroke(); ctx.restore();
      }
      const img = sE.mine ? stationArt.blue : stationArt.red;
      if (!img.naturalWidth) continue;
      const wPx = STATION_LEN_KM * scale(); if (wPx < 3) continue;  // true 2766 m scale
      const hPx = wPx * (img.naturalHeight / img.naturalWidth);
      ctx.save(); ctx.imageSmoothingEnabled = wPx > 300; ctx.drawImage(img, sx - wPx / 2, sy - hPx / 2, wPx, hPx); ctx.restore();
    }
  }

  function drawShips(place) {
    for (const sh of snap.ships || []) {
      if (sh.docked) continue;                                  // inside the station
      const pl = place.get(sh.sys); if (!pl) continue;
      const p = shipPos(sh);
      const sx = gx2s(pl.gx + p.x), sy = gy2s(pl.gy + p.y);
      // waypoint line for your own moving ships
      if (sh.mine && sh.tx != null) {
        const tx = gx2s(pl.gx + sh.tx), ty = gy2s(pl.gy + sh.ty);
        ctx.save(); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty);
        ctx.strokeStyle = "rgba(200,205,215,0.28)"; ctx.lineWidth = 1; ctx.setLineDash([4, 5]); ctx.stroke();
        ctx.setLineDash([]); ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, Math.PI * 2); ctx.fillStyle = "rgba(200,205,215,0.5)"; ctx.fill(); ctx.restore();
      }
      const type = sh.type;
      const lenKm = hull(type).lengthKm;
      const wPx = Math.max(2, lenKm * scale());           // true metre scale (min 2px so it's never a dead pixel)
      const img = sh.mine ? art(type).blue : art(type).red;
      if (img && img.naturalWidth) {
        const hPx = wPx * (img.naturalHeight / img.naturalWidth);
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(-p.h); // sprite faces +x; world +y is up
        ctx.imageSmoothingEnabled = wPx > 48;             // keep the pixel art crisp when small
        ctx.drawImage(img, -wPx / 2, -hPx / 2, wPx, hPx); ctx.restore();
      } else { ctx.save(); ctx.fillStyle = sh.mine ? "#4fd2ff" : "#ff5a5a"; ctx.fillRect(sx - wPx / 2, sy - wPx / 4, wPx, wPx / 2); ctx.restore(); }
      if (sh.mine && selected.has(sh.id)) {
        drawSelBox(sx, sy, Math.max(10, wPx * 0.62));
        // targeting range
        const tr = ((cfg.shipTypes && cfg.shipTypes[sh.type]) || {}).targetRangeKm || 15, rr = tr * scale(), lr = (sh.laserRange || cfg.laserRange || 5) * scale();
        ctx.save(); ctx.setLineDash([2, 5]); ctx.lineWidth = 1;
        if (rr > 8) { ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.strokeStyle = "rgba(200,210,230,0.22)"; ctx.stroke(); }
        if (lr > 8) { ctx.beginPath(); ctx.arc(sx, sy, lr, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,200,120,0.35)"; ctx.stroke(); }
        ctx.restore();
      }
      if (sh.mine && sh.targets && selected.has(sh.id)) for (const tg of sh.targets) drawTarget(place, sh, sx, sy, tg);
      if (sh.mine) drawLasers(place, sh, sx, sy, p.h);
    }
    // drag selection box
    if (selBox) { ctx.save(); ctx.fillStyle = "rgba(79,210,255,0.08)"; ctx.strokeStyle = "rgba(79,210,255,0.7)"; ctx.lineWidth = 1; ctx.fillRect(selBox.x0, selBox.y0, selBox.x1 - selBox.x0, selBox.y1 - selBox.y0); ctx.strokeRect(selBox.x0 + 0.5, selBox.y0 + 0.5, selBox.x1 - selBox.x0, selBox.y1 - selBox.y0); ctx.restore(); }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!(cfg && snap.systems.length) && window.SunFX) window.SunFX.clear();
    if (cfg && snap.systems.length) {
      const place = placements(); curPlace = place; curMaxW = fitWidth(place);
      if (!camInit) {
        const b = centroidBound(place); cam.cx = b.cx; cam.cy = b.cy; cam.viewW = viewWTarget = curMaxW; camInit = true;
        try { const v = JSON.parse(sessionStorage.getItem("atamus.view") || "null"); if (v && isFinite(v.cx) && isFinite(v.w)) { cam.cx = v.cx; cam.cy = v.cy; cam.viewW = viewWTarget = Math.max(ZOOM_MIN_W, Math.min(curMaxW, v.w)); follow = !!v.follow; } } catch {}
      }
      viewWTarget = Math.max(ZOOM_MIN_W, Math.min(curMaxW, viewWTarget));
      cam.viewW += (viewWTarget - cam.viewW) * (1 - Math.exp(-14 * dt));
      updateShipRender(dt);
      const anchor = follow ? followAnchor() : null;
      if (anchor) {                                    // follow selected ship / group centroid
        const e = 1 - Math.exp(-12 * dt);
        cam.cx += (anchor.x - cam.cx) * e; cam.cy += (anchor.y - cam.cy) * e;
        panVel.x = 0; panVel.y = 0;
      } else {
        follow = false;
        let dx = 0, dy = 0; if (keys.has("a")) dx -= 1; if (keys.has("d")) dx += 1; if (keys.has("w")) dy += 1; if (keys.has("s")) dy -= 1; if (dx || dy) { const l = Math.hypot(dx, dy); dx /= l; dy /= l; }
        const maxSpeed = cam.viewW * 0.9, ease = 1 - Math.exp(-10 * dt);
        panVel.x += (dx * maxSpeed - panVel.x) * ease; panVel.y += (dy * maxSpeed - panVel.y) * ease;
        cam.cx += panVel.x * dt; cam.cy += panVel.y * dt;
      }
      clampCameraCircle(place);

      for (const sE of snap.systems) { if (sE.mine || !sE.fromGateLocal) continue; const home = place.get(mySys()), foreign = place.get(sE.id); if (!home || !foreign) continue; const ax = gx2s(home.gx + sE.fromGateLocal.x), ay = gy2s(home.gy + sE.fromGateLocal.y); let bx = gx2s(foreign.gx), by = gy2s(foreign.gy); if (sE.partnerGateId) { const pg = snap.gates.find((g) => g.id === sE.partnerGateId); if (pg) { bx = gx2s(foreign.gx + pg.lx); by = gy2s(foreign.gy + pg.ly); } } ctx.save(); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.strokeStyle = "rgba(255,170,90,0.5)"; ctx.setLineDash([8, 8]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }
      for (const sE of snap.systems) { const pl = place.get(sE.id); if (!pl) continue; const th = systemTheme(sE); for (const c of cfg.cells) drawCell(pl.gx + c.x, pl.gy + c.y, cfg.cellCornerRound, th.line, th.fill); }
      window.SunFX.render(gx2s(0), gy2s(0), 1 - 0.45 * Math.max(0, Math.min(1, (cam.viewW - 20) / Math.max(1, curMaxW - 20))), now / 1000); // shader sun + lens flare at the system centre
      drawBelts(place);
      drawStations(place);
      for (const g of snap.gates) { const pl = place.get(g.sys); if (pl) drawGate(g, pl); }
      drawCans();
      drawShips(place);
      const hl = window.Atamus.hud.line;                 // thin grey line from the HUD target icon to the target
      if (hl) { const t = targetScreen(place, hl.tg); if (t) { ctx.save(); ctx.beginPath(); ctx.moveTo(hl.x, hl.y); ctx.lineTo(t.x, t.y); ctx.strokeStyle = "rgba(200,205,215,0.22)"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); } }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
