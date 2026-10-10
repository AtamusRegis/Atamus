// Atamus client: the canvas world (the Expanse: POIs on a solar map, each its own local space).
// The windowed UI lives in ui.js; this file exposes a small bridge for chat.
(() => {
  "use strict";

  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");

  let cfg = null, me = { id: null, name: "" };
  let snap = { ships: [], gates: [] }; let belts = []; let pois = [], poiById = new Map(); let invs = { ships: {}, hangars: null };
  let ws = null, lastFrame = performance.now();
  let camInit = false;

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
    else if (u.kind === "station") selectUnit(u);
  }
  window.Atamus = { send: (o) => send(o), bus, get me() { return me; }, get unit() { return unitData(); }, deselectUnit: () => selectUnit(null), selectShip: (id) => { selected.clear(); selected.add(id); syncShipSelection(); }, selectStation: () => { selected.clear(); selectUnit({ kind: "station", id: "station" }); }, get snap() { return snap; }, get belts() { return belts; }, get pois() { return pois; }, get camPoi() { return camPoi; }, warpTo: (poiId, ids) => warpTo(poiId, ids), get inv() { return invs; }, get cfg() { return cfg; }, ship: (id) => (snap.ships || []).find((x) => x.id === id) || null, get selectedShips() { return [...selected]; }, get selectedUnit() { return selectedUnit; },
    targetInfo: (sh, tg) => targetInfo(sh, tg), hud: { line: null }, get view() { return { cx: +cam.cx.toFixed(3), cy: +cam.cy.toFixed(3), w: +viewWTarget.toFixed(3) }; },
    // centre the camera on a ship (or the station it's docked at)
    locateShip: (id) => {
      const sh = (snap.ships || []).find((x) => x.id === id); if (!sh) return false;
      const w = shipWorld(sh); if (!w) return false;
      panVel.x = panVel.y = 0; zoomAt = null; cam.cx = w.x; cam.cy = w.y; viewWTarget = sh.docked ? 14 : 6;
      if (!sh.docked) { selected.clear(); selected.add(sh.id); syncShipSelection(); follow = true; }   // in space: select it and keep it centred, like [F]
      else follow = false;
      return true;
    } };

  const gateImg = new Image(); let gateImgReady = false;
  gateImg.onload = () => (gateImgReady = true); gateImg.src = "assets/stargate.webp";
  const GATE_LEN_KM = 1.656; // stargate ring, true size
  // The Expanse's map: POI positions come in AU; the map draws 1 AU as AU_KM km, so zooming out from a POI (true km
  // scale) reaches the whole system. Inside a POI everything is local km around its centre.
  const AU_KM = 20000, PLANET_R_KM = 8, ICON_PX = 14, RING_MIN_PX = 16;

  // backdrop lives on its own canvas under the sun layer; the game canvas is transparent on top
  const bgCanvas = document.createElement("canvas"); bgCanvas.id = "bg";
  bgCanvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;";
  canvas.insertAdjacentElement("beforebegin", bgCanvas);
  const bgCtx = bgCanvas.getContext("2d");

  // ---- ship art: each hull is drawn at true scale from its sprite (stats come from the server) ----
  // Own ships render blue, other players' ships red.
  const hull = (type) => (cfg && cfg.shipTypes && cfg.shipTypes[type]) || { name: "Prospector", sprite: "chisel", lengthKm: 0.128 };
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


  Api.get("/auth/me").then((u) => { me.name = u.username; connect(); }).catch(() => { location.href = "login.html"; });

  function wsUrl() { const base = (typeof API_BASE !== "undefined" ? API_BASE : location.origin); return base.replace(/^http/, "ws") + "/ws"; }
  function setStatus(t, k) { statusEl.textContent = t; statusEl.className = "status" + (k ? " " + k : ""); if (k === "ok") setTimeout(() => statusEl.classList.add("hidden"), 1200); else statusEl.classList.remove("hidden"); }
  function connect() {
    setStatus("Connecting…");
    ws = new WebSocket(wsUrl());
    ws.onopen = () => setStatus("Connected", "ok");
    ws.onclose = (e) => {
      if (e.code === 4001) { location.href = "login.html"; return; }          // signed out (session expired): back to the website
      if (e.code === 4002) { reloading = true; setStatus("Playing on another tab or device", "err"); setTimeout(() => { location.href = "play.html"; }, 2500); return; }   // one session per account
      setStatus("Disconnected — retrying…", "err"); setTimeout(connect, 2000);
    };
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
        if (m.countdown && !pending) { pending = { at: Date.now() + m.countdown.in, parts: m.countdown.parts }; startCountdown(pending.at); }   // joined mid-countdown
      }
      if (m.t === "hello") { cfg = m.cfg; me = m.you; belts = m.belts || []; indexRocks(); pois = m.pois || []; poiById = new Map(pois.map((p) => [p.id, p])); sentView = undefined; }
      else if (m.t === "pois") { pois = m.pois || []; poiById = new Map(pois.map((p) => [p.id, p])); bus.dispatchEvent(new CustomEvent("pois")); }
      else if (m.t === "snap") {
        if (selectedUnit && selectedUnit.kind === "ship") {         // the selected ship just docked: select the station instead
          const was = (snap.ships || []).find((x) => x.id === selectedUnit.id), now = (m.ships || []).find((x) => x.id === selectedUnit.id);
          // (a docked ship stays selected: its pilot is still the selected pilot; the HUD just hides)
        }
        m.gates = pois.filter((p) => p.kind === "gate").map((p) => ({ id: p.id, sys: p.id, lx: 0, ly: 0, state: p.state || "offline", name: p.name }));   // the stargate in each gate POI
        snap = m; snapAt = performance.now(); recordSnap(m, snapAt); if (!selRestored && invs.hangars) { restoreSelection(); bus.dispatchEvent(new CustomEvent("worldready")); } bus.dispatchEvent(new CustomEvent("snap")); }
      else if (m.t === "belts") { belts = m.belts || []; indexRocks(); }
      else if (m.t === "inv") { invs = m; bus.dispatchEvent(new CustomEvent("inv")); }
      else if (m.t === "rocks") { for (const u of m.rocks) { const r = rockIdx.get(u.id); if (!r) continue; if (u.m3 > 0) { r.m3 = u.m3; continue; } for (const b of belts) { const i = b.rocks.indexOf(r); if (i >= 0) b.rocks.splice(i, 1); } rockIdx.delete(u.id); } }
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


  // where each POI sits on the map (km); k > 1 enlarges a POI your ships are in when zoomed out, so its boundary and
  // your ships stay visible at solar scale (owner)
  function placements() {
    const place = new Map(), sc = scale(), mineIn = new Set(), active = new Set();
    for (const sh of snap.ships || []) if (sh.mine && sh.sys) { active.add(sh.sys); if (!sh.docked) mineIn.add(sh.sys); }
    for (const poi of pois) {
      const rPx = poi.r * sc, k = mineIn.has(poi.id) && rPx < RING_MIN_PX ? RING_MIN_PX / Math.max(1e-6, rPx) : 1;
      place.set(poi.id, { gx: poi.ax * AU_KM, gy: poi.ay * AU_KM, r: poi.r, k, poi, active: active.has(poi.id) });   // active: you have a ship there (owner: only then are its zone and contents shown)
    }
    return place;
  }
  // which POI a map point falls in (inside its boundary)
  function sysAtWorld(w) { let best = null, bd = Infinity; for (const [id, pl] of curPlace) { if (!pl.active) continue; const d = Math.hypot(w.x - pl.gx, w.y - pl.gy) / (pl.r * pl.k); if (d <= 1 && d < bd) { bd = d; best = { id, pl }; } } return best; }
  // a ship's map position: in its POI, or (warping between POIs) on its way across the map
  function shipWorld(sh) {
    if (sh.sys) { const pl = curPlace.get(sh.sys); if (!pl) { const poi = poiById.get(sh.sys); if (!poi) return null; return { x: poi.ax * AU_KM + (sh.docked ? 0 : sh.x), y: poi.ay * AU_KM + (sh.docked ? 0 : sh.y) }; } if (sh.docked) return { x: pl.gx, y: pl.gy }; const p = shipPos(sh); return { x: pl.gx + p.x * pl.k, y: pl.gy + p.y * pl.k }; }
    const w = sh.wp; if (!w || w.ph !== "poi") return null;
    const a = poiById.get(w.from), b = poiById.get(w.to); if (!a || !b) return null;
    // constant warp speed from the entry window in the source POI to the exit window in the target
    const u = Math.min(1, (w.el + (performance.now() - snapAt)) / (w.dur || 1)), ax = a.ax * AU_KM + (w.fx || 0), ay = a.ay * AU_KM + (w.fy || 0), bx = b.ax * AU_KM + (w.ex || 0), by = b.ay * AU_KM + (w.ey || 0);
    return { x: ax + (bx - ax) * u, y: ay + (by - ay) * u, u, ball: true };
  }
  // the POI the camera is looking at: the server sends every ship in it (plus your own everywhere)
  let camPoi = null, sentView;
  function updateCamPoi() {
    let best = null, bd = Infinity;
    for (const pl of curPlace.values()) { if (!pl.active) continue; const d = Math.hypot(cam.cx - pl.gx, cam.cy - pl.gy) / (pl.r * pl.k); if (d < 1.5 && d < bd && pl.r * 2 * scale() > 40) { bd = d; best = pl.poi.id; } }
    camPoi = best;
    if (camPoi !== sentView && ws && ws.readyState === WebSocket.OPEN) { sentView = camPoi; send({ t: "view", poi: camPoi }); }
  }
  // warp-to (right-click / hold a POI on the map): the given ships, or the selected ones
  function warpers(poiId, ids) { return (ids || [...selected]).map((id) => (snap.ships || []).find((x) => x.id === id)).filter((sh) => sh && sh.mine && !sh.docked && sh.sys && sh.sys !== poiId && !(sh.wp && (sh.wp.ph === "open" || sh.wp.ph === "transit" || sh.wp.ph === "poi"))); }
  function warpTo(poiId, ids) { const list = warpers(poiId, ids); if (list.length) send({ t: "warpto", ships: list.map((x) => x.id), poi: poiId }); return list.length; }
  function poiMenu(poi, x, y) {
    if (!poi || !warpers(poi.id).length || !window.Atamus.ctxMenu) return false;
    window.Atamus.ctxMenu(x, y, [["Warp to " + poi.name, () => warpTo(poi.id)]]);
    return true;
  }
  // a POI's map icon under a screen point (only drawn as an icon while the POI is small on screen)
  function poiAt(p) {
    let best = null, bd = ICON_PX;
    for (const pl of curPlace.values()) { if (pl.poi.hidden || (pl.active && pl.r * scale() >= 40)) continue; const d = Math.hypot(p.x - gx2s(pl.gx), p.y - gy2s(pl.gy)); if (d < bd) { bd = d; best = pl.poi; } }
    return best;
  }

  const ZOOM_MIN_W = 3.75;  // smallest view width (km) = deepest zoom-in
  let cam = { cx: 0, cy: 0, viewW: 600 }, curMaxW = 600, viewWTarget = 600;
  const panVel = { x: 0, y: 0 };
  function resize() { const dpr = window.devicePixelRatio || 1; canvas.width = Math.floor(innerWidth * dpr); canvas.height = Math.floor(innerHeight * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  addEventListener("resize", resize); resize();
  if (window.SunFX) window.SunFX.init();
  const scale = () => innerWidth / cam.viewW;
  const gx2s = (gx) => innerWidth / 2 + (gx - cam.cx) * scale();
  const gy2s = (gy) => innerHeight / 2 - (gy - cam.cy) * scale();

  // the whole Expanse fits at the widest zoom; the camera stays over the hexagon
  const HEX_R_AU = () => ((cfg && cfg.expanseApothemAu) || 0.5) / Math.cos(Math.PI / 6);
  function fitWidth() { const R = HEX_R_AU() * AU_KM, aspect = innerWidth / innerHeight; return Math.max(2 * R, 2 * R * Math.cos(Math.PI / 6) * aspect) * 1.08; }
  function clampCamera() { const R = HEX_R_AU() * AU_KM, d = Math.hypot(cam.cx, cam.cy); if (d > R) { cam.cx = cam.cx / d * R; cam.cy = cam.cy / d * R; } }

  const keys = new Set();
  addEventListener("keydown", (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const k = e.key.toLowerCase();
    if (k === "w" || k === "a" || k === "s" || k === "d") { keys.add(k); follow = false; zoomAt = null; e.preventDefault(); return; }
    if (k === "f") { follow = selected.size > 0; e.preventDefault(); return; }  // follow selected ship / group COM
    if (k === "x") { const id = [...selected][0]; const sh = id && (snap.ships || []).find((x) => x.id === id); if (sh) send({ t: "mine", ship: id, on: !sh.mining }); return; }
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => keys.clear());
  // wheel zoom: bigger steps out at map scale; toward the point under the mouse unless the camera follows a ship (owner)
  let zoomAt = null;
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault(); const f = viewWTarget > 300 ? 1.3 : 1.12; viewWTarget = Math.max(ZOOM_MIN_W, Math.min(curMaxW, viewWTarget * (e.deltaY > 0 ? f : 1 / f)));
    if (!follow) { const p = eventPos(e), w = screenToWorld(p.x, p.y); zoomAt = { px: p.x, py: p.y, wx: w.x, wy: w.y }; } else zoomAt = null;
  }, { passive: false });

  function eventPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  let curPlace = new Map();

  // ---- ship selection + movement (semi-RTS) ----
  const selected = new Set();           // selected ship ids
  let drag = null, selBox = null, deselectTimer = 0, follow = false, hoverAt = null;
  // Interpolated render positions: ships are drawn INTERP_MS in the past, between the two server snapshots
  // around that moment (server timestamps, so network jitter doesn't show), so motion is smooth at any speed.
  const INTERP_MS = 110;
  const shipHist = new Map();           // id -> [{ t, x, y, h, sys }] (server time, oldest first; restarts when the ship changes POI)
  const shipRender = new Map();         // id -> { x, y, h } for this frame
  let clockOff = null;                  // local time − server time, tracking the fastest-arriving snapshot
  function recordSnap(m, at) {
    if (m.st == null) return;
    const o = at - m.st; clockOff = clockOff == null ? o : Math.min(o, clockOff + 0.5);   // creeps up slowly to follow clock drift
    const live = new Set();
    for (const sh of m.ships || []) {
      live.add(sh.id); let h = shipHist.get(sh.id); if (!h || (h.length && h[h.length - 1].sys !== sh.sys)) shipHist.set(sh.id, (h = []));
      h.push({ t: m.st, x: sh.x, y: sh.y, h: sh.h != null ? sh.h : Math.PI / 2, sys: sh.sys }); if (h.length > 8) h.shift();
    }
    for (const id of [...shipHist.keys()]) if (!live.has(id)) { shipHist.delete(id); shipRender.delete(id); }
  }
  function updateShipRender() {
    const rt = performance.now() - (clockOff || 0) - INTERP_MS;
    for (const [id, h] of shipHist) {
      const n = h.length; let a, b, u;
      if (n === 1 || rt <= h[0].t) { a = b = h[0]; u = 0; }
      else if (rt >= h[n - 1].t) { a = h[n - 2]; b = h[n - 1]; u = 1 + Math.min(0.5, (rt - b.t) / Math.max(1, b.t - a.t)); }   // late snapshot: extrapolate a little
      else { let i = 0; while (h[i + 1].t < rt) i++; a = h[i]; b = h[i + 1]; u = (rt - a.t) / Math.max(1, b.t - a.t); }
      const dh = Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h));
      shipRender.set(id, { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, h: a.h + dh * Math.min(1, u) });
    }
  }
  function shipPos(sh) { return shipRender.get(sh.id) || { x: sh.x, y: sh.y, h: sh.h != null ? sh.h : Math.PI / 2 }; }
  function followAnchor() {
    let n = 0, sx = 0, sy = 0;
    let fast = false;
    for (const sh of snap.ships || []) { if (!sh.mine || !selected.has(sh.id)) continue; const w = shipWorld(sh); if (!w) continue; sx += w.x; sy += w.y; n++; if (sh.wp && (sh.wp.ph === "poi" || sh.wp.ph === "transit")) fast = true; }
    return n ? { x: sx / n, y: sy / n, fast } : null;
  }
  function screenToWorld(px, py) { const s = scale(); return { x: cam.cx + (px - innerWidth / 2) / s, y: cam.cy - (py - innerHeight / 2) / s }; }
  function shipScreen(sh) { const w = shipWorld(sh); return w ? { x: gx2s(w.x), y: gy2s(w.y) } : null; }
  // the station structure (in the station POI), only while zoomed in far enough to see it
  function stationAt(p) {
    const pl = curPlace.get("station"); if (!pl || !pl.active || !cfg || STATION_LEN_KM * scale() < 3) return false;
    return Math.hypot(p.x - gx2s(pl.gx), p.y - gy2s(pl.gy)) <= Math.max(14, STATION_LEN_KM * scale() * 0.4);
  }
  function rockAt(p) {
    let best = null, bd = Infinity;
    for (const b of belts) { const pl = curPlace.get(b.sys); if (!pl || pl.r * scale() < 40) continue; for (const rk of b.rocks) { const x = gx2s(pl.gx + rk.x * pl.k), y = gy2s(pl.gy + rk.y * pl.k); const r = Math.max(8, (rk.size / 1000) * scale() * 0.5 + 3); const d = Math.hypot(p.x - x, p.y - y); if (d <= r && d < bd) { bd = d; best = rk; } } }
    return best;
  }
  function anyShipAt(p) {   // any ship, not just mine (for targeting)
    let best = null, bd = Infinity;
    for (const sh of snap.ships || []) { const sp = shipScreen(sh); if (!sp) continue; const r = Math.max(12, hull(sh.type).lengthKm * scale() / 2 + 5); const d = Math.hypot(p.x - sp.x, p.y - sp.y); if (d <= r && d < bd) { bd = d; best = sh; } }
    return best;
  }
  function gateAt(p) {
    if (GATE_LEN_KM * scale() < 3) return null;                                // only while zoomed in on a gate POI
    for (const g of snap.gates) { const pl = curPlace.get(g.sys); if (!pl || !pl.active) continue; const sx = gx2s(pl.gx + g.lx * pl.k), sy = gy2s(pl.gy + g.ly * pl.k); const r = Math.max(14, GATE_LEN_KM * scale() / 2); if (Math.hypot(p.x - sx, p.y - sy) <= r) return g; }
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
  // a move order goes to the selected ships in the POI that was clicked (ships elsewhere stay put)
  function commandMove(p) {
    if (!selected.size) return;
    const w = screenToWorld(p.x, p.y), at = sysAtWorld(w); if (!at) return;
    const ids = [...selected].filter((id) => { const sh = (snap.ships || []).find((x) => x.id === id); return sh && sh.sys === at.id; }); if (!ids.length) return;
    send({ t: "move", ships: ids, x: (w.x - at.pl.gx) / at.pl.k, y: (w.y - at.pl.gy) / at.pl.k, sys: at.id });
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
    if (gate) { bus.dispatchEvent(new CustomEvent("opengate", { detail: { id: gate.id } })); return; }   // like the station: opens its window, the selection stays
    const ship = shipAt(p);
    if (ship) {
      if (!shift) selected.clear(); if (shift && selected.has(ship.id)) selected.delete(ship.id); else selected.add(ship.id);
      syncShipSelection(); return;
    }
    if (stationAt(p)) { bus.dispatchEvent(new CustomEvent("openstation")); return; }   // clicking the station opens its hangar
    if (selectedUnit && selectedUnit.kind !== "ship") selectUnit(null); // a selected pilot's ship is never dropped by clicking empty space
  }
  function boxSelect(x0, y0, x1, y1, shift) {
    const hit = (snap.ships || []).filter((sh) => { if (!sh.mine || sh.docked) return false; const s = shipScreen(sh); return s && s.x >= Math.min(x0, x1) && s.x <= Math.max(x0, x1) && s.y >= Math.min(y0, y1) && s.y <= Math.max(y0, y1); });
    if (!hit.length) return;                                       // an empty box keeps the current selection
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
  canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); const p = eventPos(e); poiMenu(poiAt(p), e.clientX, e.clientY); });   // right-click a POI on the map: warp to it
  canvas.addEventListener("mousemove", (e) => { hoverAt = eventPos(e); });
  canvas.addEventListener("mouseleave", () => { hoverAt = null; });
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
        const poi = poiAt(touch.start);                                  // hold a POI on the map = right-click: warp to it
        if (poi) { touch.mode = "done"; const r = canvas.getBoundingClientRect(); poiMenu(poi, touch.start.x + r.left, touch.start.y + r.top); return; }
        if (lockAt(touch.start)) { touch.mode = "done"; if (navigator.vibrate) navigator.vibrate(15); }
        else { touch.mode = "box"; selBox = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; }
      }, 450);
    } else if (touch.pts.size === 2) {
      const [a, b] = [...touch.pts.values()];
      touch.mode = "pinch"; selBox = null; follow = false; zoomAt = null;
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
    if (touch.mode === "tap" && Math.hypot(p.x - touch.start.x, p.y - touch.start.y) > 10) { touch.mode = "pan"; clearTimeout(touch.hold); follow = false; zoomAt = null; }
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
  function drawGate(g, pl) {
    const sx = gx2s(pl.gx + g.lx * pl.k), sy = gy2s(pl.gy + g.ly * pl.k);
    const wPx = Math.max(3, GATE_LEN_KM * scale());
    if (gateImgReady && gateImg.naturalWidth) {
      const hPx = wPx * (gateImg.naturalHeight / gateImg.naturalWidth);
      ctx.save(); ctx.imageSmoothingEnabled = wPx > 300; ctx.drawImage(gateImg, sx - wPx / 2, sy - hPx / 2, wPx, hPx); ctx.restore();
    } else { ctx.save(); ctx.strokeStyle = "#8a93a0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, wPx / 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    if (window.Atamus.hud && window.Atamus.hud.gate === g.id) drawSelBox(sx, sy, Math.max(12, wPx * 0.58));
    if (gateImg.naturalWidth && wPx >= 40) drawGateFx(sx, sy, wPx, g);
  }
  // stargate life (owner): slow blinking lights; powered = drifting motes of light in the ring; connected = a turning swirl
  const GATE_BLINK = [[378, 20, "r", 0], [757, 36, "w", 0.4], [10, 403, "r", 0.7], [865, 465, "w", 0.2], [127, 785, "r", 0.55], [380, 775, "w", 0.85]];
  const GATE_NODES = [[350, 187], [540, 187], [215, 322], [675, 322], [215, 512], [675, 512], [350, 648], [540, 648]];
  function drawGateFx(sx, sy, wPx, g) {
    const t = performance.now() / 1000, k = wPx / gateImg.naturalWidth, hPx = wPx * gateImg.naturalHeight / gateImg.naturalWidth;
    const ox = sx - wPx / 2, oy = sy - hPx / 2, cx = ox + 445 * k, cy = oy + 417 * k, R = 243 * k;
    const glow = (x, y, rgb, a, rad) => { const gr = ctx.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, "rgba(" + rgb + "," + a + ")"); gr.addColorStop(1, "rgba(" + rgb + ",0)"); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); };
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const [ix, iy, c, ph] of GATE_BLINK) { const f = (t / 5.5 + ph) % 1; if (f < 0.025 || (f > 0.06 && f < 0.085)) glow(ox + ix * k, oy + iy * k, c === "r" ? "255,70,60" : "235,245,255", 1, Math.max(3, 14 * k)); }
    const powered = g.state === "active", linked = powered && !!g.connToSys;
    if (powered) {
      for (const [ix, iy] of GATE_NODES) glow(ox + ix * k, oy + iy * k, "120,200,255", 0.7 + 0.3 * Math.sin(t * 2 + ix), Math.max(3, 16 * k));
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      glow(cx, cy, linked ? "90,170,255" : "80,150,255", linked ? 0.35 : 0.12, R);
      if (linked) {                                                     // connected: spiral arms turning into the middle
        ctx.lineCap = "round";
        for (let arm = 0; arm < 5; arm++) {
          ctx.beginPath();
          for (let q = 0; q <= 40; q++) { const u = q / 40, r = R * (1 - u * 0.95), a = arm * Math.PI * 2 / 5 + u * 3.2 - t * 1.4; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (q) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.strokeStyle = "rgba(130,200,255,0.22)"; ctx.lineWidth = R * 0.12; ctx.stroke(); ctx.strokeStyle = "rgba(210,240,255,0.35)"; ctx.lineWidth = R * 0.025; ctx.stroke();
        }
        glow(cx, cy, "235,248,255", 0.6, R * 0.3);
      }
      for (let i = 0; i < 46; i++) {                                    // motes: drifting round (and, connected, falling inward)
        const h1 = Math.sin(i * 91.7) * 43758.5453 % 1, h2 = Math.abs(Math.sin(i * 12.9) * 9631.1 % 1);
        const r = linked ? R * (1 - ((t * 0.12 + Math.abs(h1)) % 1)) : R * (0.25 + 0.7 * Math.abs(h2)), a = Math.abs(h1) * 6.283 + t * (linked ? 1.4 : 0.15) * (0.6 + Math.abs(h2));
        ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(t * 1.3 + i)); ctx.fillStyle = "rgba(170,225,255,1)"; const d = Math.max(1.2, 3 * k * 3);
        ctx.fillRect(cx + Math.cos(a) * r - d / 2, cy + Math.sin(a) * r - d / 2, d, d);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- space backdrop (owner): a dark gradient, slow drifting noise, a very thin world grid and three layers of
  // parallax stars that dim and brighten. Redrawn every frame (so a GPU reset can never leave it blank). ----
  const SUN_BRIGHTNESS = 0.55;                           // owner: the sun was too bright
  const PARALLAX_K = 0.25;                               // how far the backdrop drifts per screen pixel the camera pans (depth-scaled); jumps are capped per frame
  const bgPan = { x: 0, y: 0 }; let lastCam = null;
  function makeNoise(seed, tint) {                       // a tileable soft value-noise texture (low-res, drawn scaled up)
    const N = 96, c = document.createElement("canvas"); c.width = c.height = N;
    let a = seed; const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    const lat = (g) => { const v = []; for (let i = 0; i < g * g; i++) v.push(rnd()); return (x, y) => { const x0 = Math.floor(x) % g, y0 = Math.floor(y) % g, x1 = (x0 + 1) % g, y1 = (y0 + 1) % g, fx = x - Math.floor(x), fy = y - Math.floor(y), sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); const top = v[y0 * g + x0] * (1 - sx) + v[y0 * g + x1] * sx, bot = v[y1 * g + x0] * (1 - sx) + v[y1 * g + x1] * sx; return top * (1 - sy) + bot * sy; }; };
    const octs = [lat(4), lat(8), lat(16)], g = c.getContext("2d"), img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = octs[0](x / N * 4, y / N * 4) * 0.55 + octs[1](x / N * 8, y / N * 8) * 0.3 + octs[2](x / N * 16, y / N * 16) * 0.15, v = Math.max(0, n - 0.42) / 0.58, k = (y * N + x) * 4;
      img.data[k] = tint[0]; img.data[k + 1] = tint[1]; img.data[k + 2] = tint[2]; img.data[k + 3] = Math.round(v * v * 255);
    }
    g.putImageData(img, 0, 0); return c;
  }
  const noiseA = makeNoise(1337, [70, 110, 200]), noiseB = makeNoise(4242, [110, 70, 170]);
  const STAR_LAYERS = [{ depth: 0.12, n: 260, size: 1, a: 0.4 }, { depth: 0.3, n: 130, size: 1, a: 0.6 }, { depth: 0.6, n: 50, size: 2, a: 0.85 }].map((L, li) => {
    let a = 97 + li * 7919; const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    return { ...L, stars: Array.from({ length: L.n }, () => ({ x: rnd() * 2048, y: rnd() * 2048, s: L.size === 2 && rnd() < 0.5 ? 1 : L.size, b: 0.4 + rnd() * 0.6, sp: 0.15 + rnd() * 0.6, ph: rnd() * 6.283, tint: rnd() })) };
  });
  function drawBackground() {
    const dpr = window.devicePixelRatio || 1, W = innerWidth, H = innerHeight;
    if (bgCanvas.width !== Math.floor(W * dpr) || bgCanvas.height !== Math.floor(H * dpr)) { bgCanvas.width = Math.floor(W * dpr); bgCanvas.height = Math.floor(H * dpr); }
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (lastCam) { const sc = scale(), cl = (v) => Math.max(-80, Math.min(80, v)); bgPan.x += cl((cam.cx - lastCam.x) * sc); bgPan.y += cl(-(cam.cy - lastCam.y) * sc); }
    lastCam = { x: cam.cx, y: cam.cy };
    const t = performance.now() / 1000, px = bgPan.x * PARALLAX_K, py = bgPan.y * PARALLAX_K;
    const gr = bgCtx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.hypot(W, H) * 0.7);   // deep blue centre to near black
    gr.addColorStop(0, "#09111f"); gr.addColorStop(0.55, "#050912"); gr.addColorStop(1, "#010205");
    bgCtx.fillStyle = gr; bgCtx.fillRect(0, 0, W, H);
    // slow drifting noise: two layers moving different ways, barely there
    bgCtx.imageSmoothingEnabled = true;
    for (const [tex, sc, vx, vy, depth, al] of [[noiseA, 9, 3.2, 1.1, 0.05, 0.16], [noiseB, 13, -2.1, 1.7, 0.08, 0.11]]) {
      const T = tex.width * sc, ox = (((t * vx - px * depth) % T) + T) % T, oy = (((t * vy - py * depth) % T) + T) % T;
      bgCtx.globalAlpha = al * (0.85 + 0.15 * Math.sin(t * 0.07 + sc));
      for (let x = ox - T; x < W; x += T) for (let y = oy - T; y < H; y += T) bgCtx.drawImage(tex, x, y, T, T);
    }
    bgCtx.globalAlpha = 1;
    // parallax stars, each slowly dimming and brightening: crisp 1-2 device-pixel points (owner: no big blurry dots)
    bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    for (const L of STAR_LAYERS) {
      const ox = ((-px * L.depth) % 2048 + 2048) % 2048, oy = ((-py * L.depth) % 2048 + 2048) % 2048;
      for (const st of L.stars) {
        const a = L.a * st.b * (0.55 + 0.45 * Math.sin(t * st.sp + st.ph)); if (a < 0.04) continue;
        for (let x = (st.x + ox) % 2048; x < W; x += 2048) for (let y = (st.y + oy) % 2048; y < H; y += 2048) {
          bgCtx.globalAlpha = a; bgCtx.fillStyle = st.tint > 0.8 ? "#ffe6c8" : st.tint < 0.2 ? "#c8dcff" : "#eef3ff";
          bgCtx.fillRect(Math.round(x * dpr), Math.round(y * dpr), st.s, st.s);
        }
      }
    }
    bgCtx.globalAlpha = 1; bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // a very thin world grid (step chosen so lines sit ~70+ px apart; every 5th line a touch brighter)
    if (cfg) {
      const sc = scale(), steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]; let step = steps.find((v) => v * sc >= 70) || 20000;
      const x0 = cam.cx - W / 2 / sc, x1 = cam.cx + W / 2 / sc, y0 = cam.cy - H / 2 / sc, y1 = cam.cy + H / 2 / sc;
      bgCtx.lineWidth = 1;
      for (let gx = Math.floor(x0 / step) * step; gx <= x1; gx += step) { const x = Math.round(gx2s(gx)) + 0.5; bgCtx.strokeStyle = Math.round(gx / step) % 5 === 0 ? "rgba(140,170,220,0.07)" : "rgba(140,170,220,0.035)"; bgCtx.beginPath(); bgCtx.moveTo(x, 0); bgCtx.lineTo(x, H); bgCtx.stroke(); }
      for (let gy = Math.floor(y0 / step) * step; gy <= y1; gy += step) { const y = Math.round(gy2s(gy)) + 0.5; bgCtx.strokeStyle = Math.round(gy / step) % 5 === 0 ? "rgba(140,170,220,0.07)" : "rgba(140,170,220,0.035)"; bgCtx.beginPath(); bgCtx.moveTo(0, y); bgCtx.lineTo(W, y); bgCtx.stroke(); }
    }
  }


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
    const cx = gx2s(home.gx + rk.x * home.k), cy = gy2s(home.gy + rk.y * home.k), wPx = (rk.size / 1000) * scale(), hPx = wPx * (m.h / m.w);
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
  const rockIdx = new Map(), rockSys = new Map();              // rock id -> rock / its system, rebuilt whenever the fields arrive
  function indexRocks() { rockIdx.clear(); rockSys.clear(); for (const b of belts) for (const r of b.rocks) { rockIdx.set(r.id, r); rockSys.set(r.id, b.sys); } }
  function rockById(id) { return rockIdx.get(id) || null; }
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
    if (tg.kind === "rock") { const rk = rockById(tg.id); return rk ? { x: rk.x, y: rk.y, rock: rk } : null; }
    if (tg.kind === "gate") { const g = snap.gates.find((x) => x.id === tg.id); return g ? { x: g.lx, y: g.ly, gate: g } : null; }
    if (tg.kind === "station") return { x: 0, y: 0 };
    if (tg.kind === "ship") { const o = (snap.ships || []).find((x) => x.id === tg.id); if (!o) return null; const p = shipPos(o); return { x: p.x, y: p.y, ship: o }; }
    return null;
  }
  // what the HUD shows for one of a ship's targets: screen point, distance, name, remaining
  function targetInfo(sh, tg) {
    const w = targetWorld(tg); if (!w || !cfg) return null;
    const p = shipPos(sh), dist = Math.hypot(w.x - p.x, w.y - p.y);
    const scr = targetScreen(curPlace, tg);
    let name = tg.kind, sub = "";
    if (w.rock) { const o = (cfg.ores || []).find((q) => q.key === w.rock.ore); name = o ? o.name : w.rock.ore; sub = Math.round(w.rock.m3).toLocaleString() + " m³ left"; }
    else if (tg.kind === "gate") { name = "Stargate"; }
    else if (tg.kind === "station") { name = "Station"; }
    else if (w.ship) { const t = hull(w.ship.type); name = w.ship.name || t.name || w.ship.type; sub = w.ship.hp != null ? Math.round(w.ship.hp) + " hp" : ""; }
    return { sx: scr ? scr.x : null, sy: scr ? scr.y : null, dist, name, sub, icon: w.rock ? "assets/rocks/rock_" + (((cfg.ores || []).find((q) => q.key === w.rock.ore) || {}).rock || "cratered") + "_200.webp" : tg.kind === "gate" ? "assets/ships/stargate.webp" : tg.kind === "station" ? "assets/ships/station_blue.webp" : w.ship ? "assets/ships/" + hull(w.ship.type).sprite + (w.ship.mine ? "_blue" : "_red") + ".webp" : null };
  }
  function targetScreen(place, tg) {
    const sysOf = tg.kind === "rock" ? rockSys.get(tg.id) : tg.kind === "gate" ? tg.id : "station";
    const pl = place.get(sysOf); if (!pl && tg.kind !== "ship") return null;
    if (tg.kind === "rock") { const rk = rockById(tg.id); return rk ? { x: gx2s(pl.gx + rk.x * pl.k), y: gy2s(pl.gy + rk.y * pl.k), r: Math.max(9, (rk.size / 1000) * scale() * 0.6) } : null; }
    if (tg.kind === "gate") { const g = snap.gates.find((x) => x.id === tg.id); return g ? { x: gx2s(pl.gx + g.lx * pl.k), y: gy2s(pl.gy + g.ly * pl.k), r: Math.max(12, GATE_LEN_KM * scale() * 0.6) } : null; }
    if (tg.kind === "station") return { x: gx2s(pl.gx), y: gy2s(pl.gy), r: Math.max(14, STATION_LEN_KM * scale() * 0.55) };
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
      let ex = gx2s(pl.gx + l.ax * pl.k), ey = gy2s(pl.gy + l.ay * pl.k);
      const rk = rockById(l.rock);
      if (rk) {                                            // stop on the first solid pixel of the rock (aim point, else its centre)
        const h = rockHit(pl, rk, ox, oy, ex, ey) || rockHit(pl, rk, ox, oy, gx2s(pl.gx + rk.x * pl.k), gy2s(pl.gy + rk.y * pl.k));
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
    if (!cfg) return;
    if (!Object.keys(oreRock).length) for (const o of cfg.ores || []) oreRock[o.key] = { rock: o.rock, color: o.color };
    const s = scale();
    for (const belt of belts) {
      const home = place.get(belt.sys); if (!home || !home.active) continue;
      for (const rk of belt.rocks) {
        const x = gx2s(home.gx + rk.x * home.k), y = gy2s(home.gy + rk.y * home.k);
        const wPx = (rk.size / 1000) * s;                        // rock width at true scale
        if (x < -wPx || y < -wPx || x > innerWidth + wPx || y > innerHeight + wPx) continue;
        const o = oreRock[rk.ore] || { rock: "cratered", color: "#999" };
        if (home.k > 1) continue;                                // a POI shrunk to a ring on the map: no rocks
        if (wPx < 6) { const ic = oreIconImg(o.rock); if (ic.naturalWidth) { ctx.save(); ctx.translate(x, y); ctx.rotate(rk.rot); ctx.drawImage(ic, -5, -5 * ic.naturalHeight / ic.naturalWidth, 10, 10 * ic.naturalHeight / ic.naturalWidth); ctx.restore(); } else { ctx.fillStyle = o.color; ctx.fillRect(x - 1, y - 1, 2, 2); } continue; }
        const img = rockImg(o.rock, rk.size);
        if (!img.naturalWidth) continue;
        const hPx = wPx * (img.naturalHeight / img.naturalWidth);
        ctx.save(); ctx.translate(x, y); ctx.rotate(rk.rot); ctx.imageSmoothingEnabled = wPx > 40;
        ctx.drawImage(img, -wPx / 2, -hPx / 2, wPx, hPx); ctx.restore();
      }
    }
  }
  // jettison cans: a small crate glyph (own cans blue, others amber), always at least a few pixels
  function canScreen(c) { const pl = curPlace.get(c.sys); return pl ? { x: gx2s(pl.gx + c.x * pl.k), y: gy2s(pl.gy + c.y * pl.k) } : null; }
  function canAt(p) { let best = null, bd = 18; for (const c of snap.cans || []) { const sc = canScreen(c); if (!sc) continue; const d = Math.hypot(p.x - sc.x, p.y - sc.y); if (d < bd) { bd = d; best = c; } } return best; }
  const canArt = { on: new Image(), off: new Image() };
  canArt.on.src = "assets/ships/jettison_can_on.png"; canArt.off.src = "assets/ships/jettison_can_off.png";
  const CAN_LEN_KM = 0.069;
  function drawCans() {
    const t = performance.now();
    for (const c of snap.cans || []) {
      const sc = canScreen(c); if (!sc) continue;
      // each can blinks its beacon on its own beat (~every 2 s, lit for ~0.25 s) so cans are easy to spot
      const phase = (t + (c.id.charCodeAt(c.id.length - 1) * 137)) % 2000, lit = phase < 250;
      const img = lit ? canArt.on : canArt.off; if (!img.naturalWidth) continue;
      const w = Math.max(18, CAN_LEN_KM * scale()), h = w * img.naturalHeight / img.naturalWidth;
      ctx.save(); ctx.imageSmoothingEnabled = w > 74;
      ctx.drawImage(img, sc.x - w / 2, sc.y - h / 2, w, h);
      if (lit) {                                         // soft glow at the beacon so the blink reads even when tiny
        const bx = sc.x - w / 2 + w * 0.88, by = sc.y - h / 2 + h * 0.12, g = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(8, w * 0.35));
        g.addColorStop(0, "rgba(255,190,90,0.9)"); g.addColorStop(1, "rgba(255,150,40,0)");
        ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, Math.max(8, w * 0.35), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
  // the Expanse station, at the centre of its POI (true 2766 m scale)
  function drawStations(place) {
    const pl = place.get("station"); if (!pl || !pl.active) return;
    const sx = gx2s(pl.gx), sy = gy2s(pl.gy);
    const rPx = DOCK_RADIUS_KM * scale();                     // dock ring
    if (rPx > 6) { ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, rPx, 0, Math.PI * 2); ctx.setLineDash([6, 7]); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(120,170,255,0.35)"; ctx.stroke(); ctx.restore(); }
    const img = stationArt.blue; if (!img.naturalWidth) return;
    const wPx = STATION_LEN_KM * scale(); if (wPx < 3) return;
    const hPx = wPx * (img.naturalHeight / img.naturalWidth);
    const gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, wPx * 0.62);   // a soft glow behind the station
    gl.addColorStop(0, "rgba(90,160,255,0.16)"); gl.addColorStop(1, "rgba(90,160,255,0)");
    ctx.save(); ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(sx, sy, wPx * 0.62, hPx * 0.75, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.imageSmoothingEnabled = wPx > 300; ctx.drawImage(img, sx - wPx / 2, sy - hPx / 2, wPx, hPx); ctx.restore();
    if (wPx >= 70) drawStationLights(sx - wPx / 2, sy - hPx / 2, wPx / img.naturalWidth, true);
  }
  // station lights, in sprite pixels (1475×879): blinking beacons on the masts and arm tips, and running lights chasing
  // along both edges of the docking bay toward its back wall
  const BEACONS = [[434, 150, "r", 0], [678, 156, "r", 0.5], [748, 2, "w", 0.25], [1145, 203, "r", 0.75], [10, 748, "w", 0.6], [1465, 748, "w", 0.1], [252, 338, "r", 0.35], [1318, 462, "r", 0.85], [1118, 850, "w", 0.4]];
  function drawStationLights(ox, oy, k, mine) {
    const t = performance.now() / 1000, r = Math.max(1.2, 5 * k);
    const dot = (ix, iy, rgb, a, rad) => {
      if (a <= 0.02) return; const x = ox + ix * k, y = oy + iy * k, R = rad * 3.2;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, "rgba(" + rgb + "," + a + ")"); g.addColorStop(0.25, "rgba(" + rgb + "," + a * 0.6 + ")"); g.addColorStop(1, "rgba(" + rgb + ",0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    };
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const [ix, iy, c, ph] of BEACONS) {                                       // a short double flash now and then (every ~6 s, staggered)
      const f = (t / 6 + ph) % 1, on = f < 0.02 || (f > 0.045 && f < 0.065);
      dot(ix, iy, c === "r" ? "255,70,60" : "235,245,255", on ? 1 : 0.12, r * 1.3);
    }
    const run = mine ? "120,200,255" : "255,150,90", N = 14, step = Math.floor(t * 1.4);   // running lights: a chase into the bay, every third light lit
    for (let i = 0; i < N; i++) {
      const ix = 290 + i * (740 / (N - 1)), lit = ((i - step) % 3 + 3) % 3 === 0, a = lit ? 0.95 : 0.15;
      dot(ix, 398, run, a, r); dot(ix, 709, run, a, r);
    }
    ctx.restore();
  }

  // ---- warp effects (all blue): a window ahead of the aligned ship, a glowing ball in transit, an exit window and a dissipating streak ----
  const warpSeen = new Map();   // "shipId:entry|exit" -> when that window first showed (for its opening animation)
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  function warpWindow(key, x, y, dir, halfW, alpha, t) {
    if (alpha <= 0.01) return;
    const now = performance.now(); if (!warpSeen.has(key)) warpSeen.set(key, now);
    const grow = Math.min(1, (now - warpSeen.get(key)) / 280), W = halfW * (0.15 + 0.85 * grow), T = Math.max(3, halfW * 0.3);
    ctx.save(); ctx.translate(x, y); ctx.rotate(-dir); ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(70,160,255,0.95)"; ctx.shadowBlur = 16;
    const g = ctx.createLinearGradient(-T, 0, T, 0); g.addColorStop(0, "rgba(60,140,255,0)"); g.addColorStop(0.5, "rgba(120,200,255,0.45)"); g.addColorStop(1, "rgba(60,140,255,0)");
    ctx.fillStyle = g; ctx.fillRect(-T, -W, T * 2, W * 2);
    ctx.strokeStyle = "rgba(160,220,255,0.95)"; ctx.lineWidth = 1.5; ctx.strokeRect(-T / 2, -W, T, W * 2);
    ctx.shadowBlur = 0; ctx.fillStyle = "rgba(200,235,255,0.9)"; ctx.fillRect(-0.75, -W, 1.5, W * 2);
    for (let i = 0; i < 16; i++) {                                          // particles stream in one side and out the other
      const f = (t * 0.0011 + i / 16 + hash(i) * 0.3) % 1, px = (-1 + 2 * f) * W * 1.3, py = (hash(i + 7) - 0.5) * 1.8 * W;
      ctx.globalAlpha = alpha * (1 - Math.abs(2 * f - 1)) * 0.9; ctx.fillStyle = "rgba(150,215,255,1)"; ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    ctx.restore();
  }
  function drawWarp(pl, sh, p, sx, sy, halfW) {
    const w = sh.wp; if (!w) { warpSeen.delete(sh.id + ":entry"); warpSeen.delete(sh.id + ":exit"); return; }
    if (w.ph === "poi" || w.ph === "palign" || w.fx == null) return;          // aligning, or off between POIs (drawn as the ball on the map)
    const el = w.el + (performance.now() - snapAt), t = performance.now();
    const fx = gx2s(pl.gx + w.fx * pl.k), fy = gy2s(pl.gy + w.fy * pl.k), hasExit = w.ex != null, ex = hasExit ? gx2s(pl.gx + w.ex * pl.k) : 0, ey = hasExit ? gy2s(pl.gy + w.ey * pl.k) : 0;
    // progress line for your selected ship: start window → exit window, lit up to where it is now
    if (sh.mine && selected.has(sh.id) && hasExit && w.ph !== "exit") {
      ctx.save(); ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.strokeStyle = "rgba(110,180,255,0.35)"; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(ex, ey); ctx.stroke();
      if (w.ph === "transit") { ctx.setLineDash([]); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(130,205,255,0.5)"; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(sx, sy); ctx.stroke(); }
      ctx.restore();
    }
    const entryA = w.ph === "open" ? 1 : w.ph === "transit" ? 1 - el / 1200 : 0;
    warpWindow(sh.id + ":entry", fx, fy, w.dir, halfW, entryA, t);
    const exitShown = !w.g && (w.ph === "exit" || (w.ph === "transit" && w.dur - el <= (cfg.warpExitShowMs || 1000)));   // (a gate exit has the gate itself, no window)   // the exit window opens only in the last second (owner)
    if (hasExit && exitShown) warpWindow(sh.id + ":exit", ex, ey, w.dir, halfW, w.ph === "exit" ? 1 - el / 2000 : 1, t);
    if (w.ph === "transit") {                                                 // the ship is a glowing ball between the windows
      const R = Math.max(4, halfW * 0.45), back = Math.min(Math.hypot(sx - fx, sy - fy), R * 9), ux = Math.cos(w.dir), uy = -Math.sin(w.dir);
      ctx.save();
      const tg = ctx.createLinearGradient(sx, sy, sx - ux * back, sy - uy * back); tg.addColorStop(0, "rgba(140,210,255,0.8)"); tg.addColorStop(1, "rgba(60,140,255,0)");
      ctx.strokeStyle = tg; ctx.lineWidth = R * 0.9; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - ux * back, sy - uy * back); ctx.stroke();
      const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 2.2); rg.addColorStop(0, "rgba(235,248,255,1)"); rg.addColorStop(0.3, "rgba(120,200,255,0.9)"); rg.addColorStop(1, "rgba(50,130,255,0)");
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(sx, sy, R * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (w.ph === "exit" && hasExit) {                                   // a blue streak and particles dissipating behind the ship
      const k = Math.max(0, 1 - el / 1600), ux = Math.cos(w.dir), uy = -Math.sin(w.dir), px = -uy, py = ux;
      ctx.save();
      const sg = ctx.createLinearGradient(sx, sy, ex - ux * halfW * 2, ey - uy * halfW * 2); sg.addColorStop(0, "rgba(140,210,255," + 0.7 * k + ")"); sg.addColorStop(1, "rgba(60,140,255,0)");
      ctx.strokeStyle = sg; ctx.lineWidth = Math.max(2, halfW * 0.35) * k; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex - ux * halfW * 2, ey - uy * halfW * 2); ctx.stroke();
      for (let i = 0; i < 22; i++) {
        const a = hash(i + 3), along = a * Math.hypot(sx - ex, sy - ey) + (hash(i + 11) - 0.3) * halfW, drift = (hash(i + 19) - 0.5) * halfW * 2.5 * (el / 1000 + 0.2);
        ctx.globalAlpha = k * (0.4 + 0.6 * hash(i + 23)); ctx.fillStyle = "rgba(150,215,255,1)";
        ctx.fillRect(ex + ux * along + px * drift - 1, ey + uy * along + py * drift - 1, 2, 2);
      }
      ctx.restore();
    }
  }

  // POIs on the map: a dashed boundary once it's big enough to see, an icon while it's small (hidden POIs have none)
  const POI_COL = { station: "120,170,255", planet: "130,200,170", gate: "220,200,160", belt: "230,170,90", spawn: "170,180,195" };
  function drawPois(place) {
    const sc = scale(); let hover = null;
    { const R = HEX_R_AU() * AU_KM; ctx.save(); ctx.beginPath(); for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3, x = gx2s(Math.cos(a) * R), y = gy2s(Math.sin(a) * R); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.strokeStyle = "rgba(140,170,220,0.22)"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }   // the Expanse's edge
    for (const pl of place.values()) {
      const poi = pl.poi, x = gx2s(pl.gx), y = gy2s(pl.gy), rPx = pl.r * sc * pl.k, col = POI_COL[poi.kind] || POI_COL.spawn;
      if (x < -rPx - 60 || y < -rPx - 60 || x > innerWidth + rPx + 60 || y > innerHeight + rPx + 60) continue;
      if (pl.active && rPx >= 10) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, rPx, 0, Math.PI * 2); ctx.setLineDash(rPx > 200 ? [10, 10] : [4, 5]); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(" + col + "," + (rPx > 200 ? 0.25 : 0.45) + ")"; ctx.stroke(); ctx.restore(); }
      if (poi.kind === "planet") drawPlanet(x, y, pl.active ? Math.max(ICON_PX * 0.5, PLANET_R_KM * sc * pl.k) : ICON_PX * 0.5, poi);
      const small = !pl.active || pl.r * sc < 40;                // a POI without your ships is only ever its icon (owner)
      if (small && !poi.hidden) drawPoiIcon(poi, x, y);
      if (small && !poi.hidden && hoverAt && Math.hypot(hoverAt.x - x, hoverAt.y - y) < ICON_PX) hover = { poi, x, y };
    }
    if (hover) { ctx.save(); ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(225,232,245,0.9)"; ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 4; ctx.fillText(hover.poi.name, hover.x, hover.y + ICON_PX + 8); ctx.restore(); }
  }
  // map icons (owner's pixel art, drawn crisp at their own size)
  const mapIcon = {}; for (const [k, f] of [["belt", "asteroid_field"], ["gate", "stargate"], ["station", "station"]]) { mapIcon[k] = new Image(); mapIcon[k].src = "assets/icons/map/" + f + "_s.png"; }
  // zoomed out (owner): rocks become their ore family's icon, ships their class icon (tinted blue for yours, red for others)
  const ORE_ICON = { bubble: "rubble" }, oreIcon = {};
  function oreIconImg(family) { const f = ORE_ICON[family] || family; if (!oreIcon[f]) { oreIcon[f] = new Image(); oreIcon[f].src = "assets/icons/ores/" + f + "_s.png"; } return oreIcon[f]; }
  const CLASS_ICON = { "Mining Frigate": "frigate", "Mining Barge": "cruiser", "Exhumer": "cruiser" }, classIcon = {}, classTint = new Map();
  function classIconFor(type, mine) {
    const k = CLASS_ICON[hull(type).cls] || "frigate";
    if (!classIcon[k]) { classIcon[k] = new Image(); classIcon[k].src = "assets/icons/classes/" + k + "_s.png"; }
    const img = classIcon[k]; if (!img.naturalWidth) return null;
    const key = k + (mine ? ":b" : ":r"); let c = classTint.get(key);
    if (!c) { c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; const g2 = c.getContext("2d"); g2.drawImage(img, 0, 0); g2.globalCompositeOperation = "source-atop"; g2.fillStyle = mine ? "rgba(80,170,255,0.55)" : "rgba(255,80,80,0.55)"; g2.fillRect(0, 0, c.width, c.height); classTint.set(key, c); }
    return c;
  }
  function drawPoiIcon(poi, x, y) {
    const img = mapIcon[poi.kind]; if (!img || !img.naturalWidth) return;
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, Math.round(x - img.naturalWidth / 2), Math.round(y - img.naturalHeight / 2)); ctx.restore();
  }
  // procedural planets: a texture per planet (its seed picks the kind and colours), lit from the sun at the map's centre
  const planetTex = new Map();
  const PLANET_KINDS = [
    { stops: [[0, "#1d3f6e"], [0.48, "#2f6aa3"], [0.52, "#c9b98a"], [0.6, "#4f7a3c"], [0.8, "#6d6a4a"], [1, "#e8eef2"]], atm: "120,180,255", bands: 0 },   // ocean world
    { stops: [[0, "#7a4a2a"], [0.4, "#b07443"], [0.7, "#d8a66a"], [1, "#f0d9a8"]], atm: "255,190,130", bands: 0.25 },                                     // desert
    { stops: [[0, "#8fb4c9"], [0.5, "#cfe3ee"], [1, "#ffffff"]], atm: "200,230,255", bands: 0.1 },                                                       // ice
    { stops: [[0, "#5a3d6e"], [0.3, "#a3735a"], [0.55, "#d9b48a"], [0.8, "#8a5a7a"], [1, "#e8c9a0"]], atm: "230,180,160", bands: 1 },                    // gas giant
  ];
  function planetTexture(seed) {
    if (planetTex.has(seed)) return planetTex.get(seed);
    const N = 256, c = document.createElement("canvas"); c.width = c.height = N;
    const g = c.getContext("2d"), img = g.createImageData(N, N), kind = PLANET_KINDS[(seed - 1) % PLANET_KINDS.length];
    let a = 1000 + seed * 7919; const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    const lat = (n) => { const v = []; for (let i = 0; i < n * n; i++) v.push(rnd()); return (x, y) => { const x0 = Math.floor(x) % n, y0 = Math.floor(y) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n, fx = x - Math.floor(x), fy = y - Math.floor(y), sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return (v[y0 * n + x0] * (1 - sx) + v[y0 * n + x1] * sx) * (1 - sy) + (v[y1 * n + x0] * (1 - sx) + v[y1 * n + x1] * sx) * sy; }; };
    const o = [lat(4), lat(8), lat(16), lat(32), lat(64)];
    const col = (t) => { const st = kind.stops; let i = 0; while (i < st.length - 2 && t > st[i + 1][0]) i++; const [t0, c0] = st[i], [t1, c1] = st[i + 1], u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))); const h = (cc, k) => parseInt(cc.slice(1 + k * 2, 3 + k * 2), 16); return [0, 1, 2].map((k) => h(c0, k) + (h(c1, k) - h(c0, k)) * u); };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, n = o[0](u * 4, v * 4) * 0.48 + o[1](u * 8, v * 8) * 0.24 + o[2](u * 16, v * 16) * 0.14 + o[3](u * 32, v * 32) * 0.09 + o[4](u * 64, v * 64) * 0.05;
      const t = kind.bands ? (Math.sin(v * 28 + n * 6 * kind.bands + seed) * 0.5 + 0.5) * kind.bands + n * (1 - kind.bands) : n;
      const cc = col(Math.max(0, Math.min(1, (t - 0.25) / 0.5))), k = (y * N + x) * 4;
      img.data[k] = cc[0]; img.data[k + 1] = cc[1]; img.data[k + 2] = cc[2]; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0); const out = { c, kind }; planetTex.set(seed, out); return out;
  }
  function drawPlanet(x, y, rPx, poi) {
    const { c, kind } = planetTexture(poi.seed || 1), d = Math.hypot(poi.ax, poi.ay) || 1, lx = -poi.ax / d, ly = poi.ay / d;   // toward the sun (screen y is down)
    ctx.save();
    const atm = ctx.createRadialGradient(x, y, rPx * 0.9, x, y, rPx * 1.25); atm.addColorStop(0, "rgba(" + kind.atm + ",0.35)"); atm.addColorStop(1, "rgba(" + kind.atm + ",0)");
    ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(x, y, rPx * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, rPx, 0, Math.PI * 2); ctx.clip();
    ctx.imageSmoothingEnabled = true; ctx.drawImage(c, x - rPx, y - rPx, rPx * 2, rPx * 2);
    const sh = ctx.createRadialGradient(x + lx * rPx * 0.45, y + ly * rPx * 0.45, rPx * 0.15, x + lx * rPx * 0.2, y + ly * rPx * 0.2, rPx * 1.45);
    sh.addColorStop(0, "rgba(255,250,240,0.12)"); sh.addColorStop(0.45, "rgba(0,0,0,0.1)"); sh.addColorStop(0.75, "rgba(0,0,8,0.7)"); sh.addColorStop(1, "rgba(0,0,8,0.95)");
    ctx.fillStyle = sh; ctx.fillRect(x - rPx, y - rPx, rPx * 2, rPx * 2);
    ctx.restore();
  }
  // a ship between POIs: a glowing ball crossing the map
  function drawMapBall(sh) {
    const w = shipWorld(sh); if (!w) return;
    const a = poiById.get(sh.wp.from), b = poiById.get(sh.wp.to); if (!a || !b) return;
    const x = gx2s(w.x), y = gy2s(w.y), dx = b.ax - a.ax, dy = -(b.ay - a.ay), d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, R = 4;
    ctx.save();
    const tg = ctx.createLinearGradient(x, y, x - ux * 40, y - uy * 40); tg.addColorStop(0, "rgba(140,210,255,0.8)"); tg.addColorStop(1, "rgba(60,140,255,0)");
    ctx.strokeStyle = tg; ctx.lineWidth = R * 0.9; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * 40, y - uy * 40); ctx.stroke();
    const rg = ctx.createRadialGradient(x, y, 0, x, y, R * 2.2); rg.addColorStop(0, "rgba(235,248,255,1)"); rg.addColorStop(0.3, "rgba(120,200,255,0.9)"); rg.addColorStop(1, "rgba(50,130,255,0)");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, R * 2.2, 0, Math.PI * 2); ctx.fill();
    if (selected.has(sh.id)) drawSelBox(x, y, 10);
    ctx.restore();
  }

  function drawShips(place) {
    for (const sh of snap.ships || []) {
      if (sh.docked) continue;                                  // inside the station
      if (!sh.sys) { if (sh.mine && sh.wp && sh.wp.ph === "poi") drawMapBall(sh); continue; }
      const pl = place.get(sh.sys); if (!pl) continue;
      const p = shipPos(sh);
      const sx = gx2s(pl.gx + p.x * pl.k), sy = gy2s(pl.gy + p.y * pl.k);
      const inTransit = !!(sh.wp && sh.wp.ph === "transit");
      drawWarp(pl, sh, p, sx, sy, Math.max(9, hull(sh.type).lengthKm * 1.6 * scale()));
      // waypoint line for your own moving ships
      if (sh.mine && sh.tx != null && !inTransit) {
        const tx = gx2s(pl.gx + sh.tx * pl.k), ty = gy2s(pl.gy + sh.ty * pl.k);
        ctx.save(); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty);
        ctx.strokeStyle = "rgba(200,205,215,0.28)"; ctx.lineWidth = 1; ctx.setLineDash([4, 5]); ctx.stroke();
        ctx.setLineDash([]); ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, Math.PI * 2); ctx.fillStyle = "rgba(200,205,215,0.5)"; ctx.fill(); ctx.restore();
      }
      const type = sh.type;
      const lenKm = hull(type).lengthKm;
      const wPx = Math.max(2, lenKm * scale());           // true metre scale (min 2px so it's never a dead pixel)
      const img = sh.mine ? art(type).blue : art(type).red;
      if (inTransit) { /* drawn as the warp ball */ }
      else if ((pl.k > 1 || wPx < 8) && classIconFor(type, sh.mine)) {   // zoomed out: the hull's class icon instead of a speck
        const ic = classIconFor(type, sh.mine); ctx.save(); ctx.translate(sx, sy); ctx.rotate(-p.h); ctx.drawImage(ic, -ic.width / 2, -ic.height / 2); ctx.restore(); }
      else if (img && img.naturalWidth) {
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
    if (!(cfg && pois.length)) { if (window.SunFX) window.SunFX.clear(); drawBackground(); }
    if (cfg && pois.length) {
      let place = placements(); curPlace = place; curMaxW = fitWidth();
      if (!camInit && snap.st) {                         // start on your ship (or the station), at POI scale
        camInit = true;
        const sh = (snap.ships || []).find((x) => x.mine && !x.docked && x.sys) || (snap.ships || []).find((x) => x.mine), w = sh && shipWorld(sh), st = place.get("station");
        cam.cx = w ? w.x : st ? st.gx : 0; cam.cy = w ? w.y : st ? st.gy : 0; cam.viewW = viewWTarget = 60;
        try { const v = JSON.parse(sessionStorage.getItem("atamus.view") || "null"); if (v && isFinite(v.cx) && isFinite(v.w)) { cam.cx = v.cx; cam.cy = v.cy; cam.viewW = viewWTarget = Math.max(ZOOM_MIN_W, Math.min(curMaxW, v.w)); follow = !!v.follow; } } catch {}
      }
      viewWTarget = Math.max(ZOOM_MIN_W, Math.min(curMaxW, viewWTarget));
      cam.viewW += (viewWTarget - cam.viewW) * (1 - Math.exp(-14 * dt));
      if (zoomAt && !follow) {                         // keep the world point under the mouse where it was while the zoom eases
        const sc = scale(); cam.cx = zoomAt.wx - (zoomAt.px - innerWidth / 2) / sc; cam.cy = zoomAt.wy + (zoomAt.py - innerHeight / 2) / sc;
        if (Math.abs(viewWTarget - cam.viewW) < viewWTarget * 0.002) zoomAt = null;
      } else zoomAt = null;
      place = placements(); curPlace = place;
      updateShipRender();
      const anchor = follow ? followAnchor() : null;
      if (anchor) {                                    // follow selected ship / group centroid
        const e = anchor.fast ? 1 : 1 - Math.exp(-12 * dt);   // at warp the camera locks onto the ship (easing would leave it behind)
        cam.cx += (anchor.x - cam.cx) * e; cam.cy += (anchor.y - cam.cy) * e;
        panVel.x = 0; panVel.y = 0;
      } else {
        follow = false;
        let dx = 0, dy = 0; if (keys.has("a")) dx -= 1; if (keys.has("d")) dx += 1; if (keys.has("w")) dy += 1; if (keys.has("s")) dy -= 1; if (dx || dy) { const l = Math.hypot(dx, dy); dx /= l; dy /= l; }
        const maxSpeed = cam.viewW * 0.9, ease = 1 - Math.exp(-10 * dt);
        panVel.x += (dx * maxSpeed - panVel.x) * ease; panVel.y += (dy * maxSpeed - panVel.y) * ease;
        cam.cx += panVel.x * dt; cam.cy += panVel.y * dt;
      }
      clampCamera();
      updateCamPoi();
      drawBackground();                                // after the camera settled: the backdrop never runs past the pan limit
      // the sun at the map's centre; seen from inside a POI it's far off-screen, so only its glow reaches in from that side
      const W = innerWidth, H = innerHeight, sx0 = gx2s(0), sy0 = gy2s(0), dxs = sx0 - W / 2, dys = sy0 - H / 2, ds = Math.hypot(dxs, dys), lim = Math.hypot(W, H) * 0.75, kS = ds > lim ? lim / ds : 1;
      window.SunFX.render(W / 2 + dxs * kS, H / 2 + dys * kS, SUN_BRIGHTNESS * (kS < 1 ? 0.7 : 1), now / 1000);
      drawPois(place);
      drawBelts(place);
      drawStations(place);
      if (GATE_LEN_KM * scale() >= 2) for (const g of snap.gates) { const pl = place.get(g.sys); if (pl && pl.active) drawGate(g, pl); }
      drawCans();
      drawShips(place);
      const hl = window.Atamus.hud.line;                 // thin grey line from the HUD target icon to the target
      if (hl) { const t = targetScreen(place, hl.tg); if (t) { ctx.save(); ctx.beginPath(); ctx.moveTo(hl.x, hl.y); ctx.lineTo(t.x, t.y); ctx.strokeStyle = "rgba(200,205,215,0.22)"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); } }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
