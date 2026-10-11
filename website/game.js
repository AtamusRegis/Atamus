// Atamus client (back to basics, owner 2026-10-10): the Expanse's hexagon with asteroid belts, and a Prospector per
// pilot. Single click / tap selects (a ship of yours: its pilot; an asteroid: its name and distance); double click / tap
// on empty space flies the selected pilot's ship there; right-click / hold for menus; drag or WASD to pan; wheel or
// pinch to zoom. The windows live in ui.js. What the client did before the reset is in reference/2026-10-10-pre-reset/.
(() => {
  "use strict";

  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");

  let cfg = null, me = { id: null, name: "" }, ws = null;
  let pois = [], poiById = new Map(), belts = new Map();   // belt POIs on the map; the rock fields of the ones your ships are in
  const bus = new EventTarget();
  // snapshots: the last few, each with the server time its positions are for; ships are drawn RENDER_DELAY_MS in
  // the past, interpolated between the two snapshots around that moment
  const RENDER_DELAY_MS = 110, snaps = []; let clockOffset = null, latest = { ships: [] };
  // follow: the id of the ship the camera follows, or null. Selecting a pilot doesn't move the camera (owner).
  const POI_VIEW_KM = 110;                         // a whole 100 km POI with a little margin
  let warpView = null;                             // the zoom to come back to after following a ship through a warp
  const ZOOM_MIN_W = 3.25;                         // km across the screen at the closest zoom (owner: the Prospector at about 1/25 of the width)
  const cam = { cx: 0, cy: 0, viewW: ZOOM_MIN_W }; let viewWTarget = ZOOM_MIN_W, follow = null, camInit = false, zoomAt = null;
  let lookAt = null;                               // (owner) Look At: { kind: "rock" | "prop", id } the camera follows (a ship is followed by id)
  let selPilot = null;                             // the selected pilot (ui.js keeps it; one is always selected)

  window.Atamus = {
    send: (o) => send(o), bus, get me() { return me; }, get cfg() { return cfg; }, get snap() { return latest; },
    ship: (id) => (latest.ships || []).find((x) => x.id === id) || null, get myShip() { return myShip(); }, get picked() { return picked; },
    get view() { return { cx: +cam.cx.toFixed(3), cy: +cam.cy.toFixed(3), w: +viewWTarget.toFixed(3), follow, lookAt }; },
    get selectedPilot() { return selPilot; },
    selectPilot: (id) => { selPilot = id == null ? null : String(id); bus.dispatchEvent(new CustomEvent("pilotselect", { detail: selPilot })); },
    followShip: (id) => { if (!(latest.ships || []).some((x) => x.id === id)) return false; follow = id; lookAt = null; zoomAt = null; return true; },
    lookAt: (kind, id) => lookAtObj(kind, id),
    // (owner) Tab: centre on that pilot's ship and zoom to show a whole POI around it
    focusShip: (id) => { if (!(latest.ships || []).some((x) => x.id === id)) return false; follow = id; lookAt = null; zoomAt = null; viewWTarget = POI_VIEW_KM * Math.max(1, innerWidth / innerHeight); warpView = null; return true; },
    get pois() { return pois; }, poi: (id) => poiById.get(id) || null, get belts() { return belts; },
    align: (poiId, shipId) => { const sh = shipId ? window.Atamus.ship(shipId) : myShip(); if (sh) send({ t: "align", ship: sh.id, poi: poiId }); },
    warp: (poiId, shipId) => { const sh = shipId ? window.Atamus.ship(shipId) : myShip(); if (sh) send({ t: "warp", ship: sh.id, poi: poiId }); },
    inPoi: (sh, poi) => !!(sh && poi && Math.hypot(sh.x - poi.x, sh.y - poi.y) <= poi.r),
    // objects in space (owner): { kind: "rock" | "ship", id }. Orders go to the selected pilot's ship.
    lock: (kind, id) => { const sh = myShip(); if (sh) send({ t: "lock", ship: sh.id, kind, id }); },
    unlock: (kind, id) => { const sh = myShip(); if (sh) send({ t: "unlock", ship: sh.id, kind, id }); },
    alignTo: (kind, id) => { const sh = myShip(); if (sh) send({ t: "chase", ship: sh.id, kind, id, mode: "align" }); },
    moveTo: (kind, id) => { const sh = myShip(); if (sh) send({ t: "chase", ship: sh.id, kind, id, mode: "approach" }); },
    info: (kind, id) => send({ t: "info", kind, id }),
    objPos: (kind, id) => objPos(kind, id), objName: (kind, id) => objName(kind, id), objIcon: (kind, id) => objIcon(kind, id),
    objItems: (kind, id) => objItems(kind, id), ownShipItems: (id) => ownShipItems(id),
    hoverTarget: null,                               // set by the HUD: a thin grey line runs from your ship to it
    rangeTo: (kind, id) => rangeTo(kind, id),
  };
  const myShip = () => { const own = (latest.ships || []).filter((x) => x.mine); return own.find((x) => x.pilot === selPilot) || own[0] || null; };   // the selected pilot's ship

  // backdrop on its own canvas under the transparent game canvas
  const bgCanvas = document.createElement("canvas"); bgCanvas.id = "bg";
  bgCanvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;";
  canvas.insertAdjacentElement("beforebegin", bgCanvas);
  const bgCtx = bgCanvas.getContext("2d");

  // ---- ship art: drawn at true scale from its sprite; zoomed out, its hull icon. Yours blue, others red ----
  const hull = (type) => (cfg && cfg.shipTypes && cfg.shipTypes[type]) || { name: "Prospector", sprite: "chisel", lengthKm: 0.128 };
  const imgs = {};
  const img = (src) => { if (!imgs[src]) { imgs[src] = new Image(); imgs[src].src = src; } return imgs[src]; };
  const shipArt = (type, mine) => img("assets/ships/" + hull(type).sprite + (mine ? "_blue" : "_red") + ".webp");
  const shipIcon = (type, mine) => img("assets/icons/ships/" + hull(type).sprite + (mine ? "_blue" : "_red") + "_s.png");

  // ---- connection ----
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
      if (m.t === "hello") {
        if (m.build) {
          if (serverBuild && m.build !== serverBuild) {
            // new server is up; if the website is switching too, its push does the one reload
            const webComing = pending && pending.parts.includes("web") && Date.now() < pending.at + 180_000;
            if (!webComing) { reloadForUpdate("s" + m.build); return; }
          }
          serverBuild = m.build;
          if (m.countdown && !pending) { pending = { at: Date.now() + m.countdown.in, parts: m.countdown.parts }; startCountdown(pending.at); }   // joined mid-countdown
        }
        cfg = m.cfg; me = m.you; sentView = ""; setPois(m.pois); setBelts(m.belts); bus.dispatchEvent(new CustomEvent("hello"));
      } else if (m.t === "pois") { setPois(m.pois); bus.dispatchEvent(new CustomEvent("pois"));
      } else if (m.t === "belts") { setBelts(m.belts);
      } else if (m.t === "snap") {
        const now = performance.now(), off = m.st - now;
        clockOffset = clockOffset == null ? off : Math.max(off, clockOffset + (off - clockOffset) * 0.02);   // server clock ≈ local + offset (the freshest arrival)
        snaps.push({ st: m.st, ships: new Map(m.ships.map((s) => [s.id, s])) }); while (snaps.length > 30) snaps.shift();
        latest = m; bus.dispatchEvent(new CustomEvent("snap"));
      } else if (m.t === "info") bus.dispatchEvent(new CustomEvent("info", { detail: m }));
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

  // ---- camera ----
  const scale = () => innerWidth / cam.viewW;     // px per km
  const gx2s = (x) => innerWidth / 2 + (x - cam.cx) * scale();
  const gy2s = (y) => innerHeight / 2 - (y - cam.cy) * scale();
  const s2w = (px, py) => ({ x: cam.cx + (px - innerWidth / 2) / scale(), y: cam.cy - (py - innerHeight / 2) / scale() });
  const HEX_R = () => ((cfg && cfg.expanseApothemKm) || 10000) / Math.cos(Math.PI / 6);   // centre to a corner
  function fitWidth() { const R = HEX_R(), aspect = innerWidth / innerHeight; return Math.max(2 * R, 2 * R * Math.cos(Math.PI / 6) * aspect) * 1.08; }   // the whole hexagon on screen
  function clampCamera() { const R = HEX_R(), d = Math.hypot(cam.cx, cam.cy); if (d > R) { cam.cx = cam.cx / d * R; cam.cy = cam.cy / d * R; } }
  let sentView = "", viewAt = 0;
  function sendView(now) {                        // the server sends the other ships in view
    if (now - viewAt < 250) return; viewAt = now;
    const v = [cam.cx.toFixed(2), cam.cy.toFixed(2), viewWTarget.toFixed(2)].join(","); if (v === sentView) return;
    sentView = v; send({ t: "view", x: +cam.cx.toFixed(2), y: +cam.cy.toFixed(2), w: +Math.max(viewWTarget, cam.viewW).toFixed(2) });
  }

  // ---- where each ship is drawn right now ----
  function shipsNow() {
    if (!snaps.length || clockOffset == null) return [];
    const rt = performance.now() + clockOffset - RENDER_DELAY_MS;
    let a = snaps[0], b = null;
    for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].st <= rt) { a = snaps[i]; b = snaps[i + 1] || null; break; }
    const out = [];
    for (const s of (b || a).ships.values()) {
      const p = a.ships.get(s.id);
      if (!b || !p) { out.push({ ...s }); continue; }
      const k = Math.max(0, Math.min(1, (rt - a.st) / Math.max(1, b.st - a.st)));
      let dh = s.h - p.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      out.push({ ...s, x: p.x + (s.x - p.x) * k, y: p.y + (s.y - p.y) * k, h: p.h + dh * k });
    }
    return out;
  }

  function setPois(list) { pois = list || []; poiById = new Map(pois.map((p) => [p.id, p])); }
  function setBelts(list) { belts = new Map((list || []).map((f) => [f.poi, f])); }

  // ---- input: click / tap = fly the selected ship there (on one of your ships: select its pilot, owner: no centring);
  // right-click or hold = the menu (on a belt's map marker: Warp to / Align to; elsewhere: Center on ship, Belts ›);
  // drag or WASD = pan; wheel / pinch = zoom ----
  const ptrs = new Map(); let drag = null, hold = 0;
  const MARKER_PX = 12;
  const poiAt = (px, py) => { let best = null, bd = MARKER_PX; for (const p of pois) { const d = Math.hypot(px - gx2s(p.x), py - gy2s(p.y)); if (d <= bd) { bd = d; best = p; } } return best; };
  const poiItems = (p) => {                         // a POI's options for the selected pilot's ship
    const own = myShip(), out = [];
    if (own && !window.Atamus.inPoi(own, p)) out.push(["Warp to " + p.name, () => window.Atamus.warp(p.id)]);
    out.push(["Align to " + p.name, () => window.Atamus.align(p.id)]);
    return out;
  };
  function openMenu(px, py) {
    const menu = window.Atamus.ctxMenu; if (!menu) return;
    // one of your ships: its menu (the selected pilot's own: Info) plus Rename (owner)
    const mine = shipAt(px, py, drawn);
    if (mine) { menu(px, py, ownShipItems(mine.id)); return; }
    const ob = objAt(px, py);
    if (ob) { menu(px, py, objItems(ob.kind, ob.id)); return; }
    const pr = propAt(px, py);
    if (pr) { menu(px, py, [["Look At", () => lookAtObj("prop", pr.id)]]); return; }   // a Library prop
    const p = poiAt(px, py);
    if (p && !p.hidden) { menu(px, py, poiItems(p)); return; }
    const belts = pois.filter((q) => q.kind === "belt" && !q.hidden).sort((a, b) => a.name.localeCompare(b.name));
    menu(px, py, [["Center on ship", () => { const own = myShip(); if (own) window.Atamus.followShip(own.id); }],
      ["Belts", belts.map((q) => [q.name, null, { menu: poiItems(q) }])]]);   // (owner) a list: right-click (hold) a belt for its menu
  }
  canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); if (e.ctrlKey && e.button === 0) return; openMenu(e.clientX, e.clientY); });   // (a Mac's Ctrl + click is Align To, not the menu)
  const shipAt = (px, py, ships) => {               // the nearest of your ships under the pointer
    let best = null, bd = Infinity;
    for (const s of ships) { if (!s.mine) continue; const r = Math.max(14, hull(s.type).lengthKm * scale() * 0.6), d = Math.hypot(px - gx2s(s.x), py - gy2s(s.y)); if (d <= r && d < bd) { bd = d; best = s; } }
    return best;
  };
  canvas.addEventListener("pointerdown", (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), w: viewWTarget }; return; }
    if (e.button !== 0) { drag = null; return; }
    drag = { x0: e.clientX, y0: e.clientY, cx: cam.cx, cy: cam.cy, moved: false };
    clearTimeout(hold);
    if (e.pointerType !== "mouse") hold = setTimeout(() => { if (drag && !drag.moved && !drag.pinch) { drag = null; openMenu(e.clientX, e.clientY); } }, 500);   // hold = right-click (owner: mobile parity)
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;
    if (drag.pinch) { if (ptrs.size < 2) return; const [a, b] = [...ptrs.values()]; zoomTo(drag.w * (drag.d || 1) / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) { drag.moved = true; follow = null; lookAt = null; zoomAt = null; clearTimeout(hold); }
    if (drag.moved) { cam.cx = drag.cx - (e.clientX - drag.x0) / scale(); cam.cy = drag.cy + (e.clientY - drag.y0) / scale(); clampCamera(); }
  });
  const up = (e) => {
    ptrs.delete(e.pointerId); clearTimeout(hold);
    const d = drag; if (!d) return;
    if (d.pinch) { if (!ptrs.size) drag = null; return; }
    drag = null; if (d.moved || e.type === "pointercancel") return;
    // (owner) a single click / tap selects what's under it; a double click / tap on empty space flies there, on an
    // object locks it. Ctrl + click an object: Align To; Shift + click: Move towards it (on empty space: fly there).
    const ships = shipsNow(), own = myShip(), now = performance.now(), A = window.Atamus;
    const dbl = lastTap && now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 14;
    lastTap = dbl ? null : { t: now, x: e.clientX, y: e.clientY };
    const hit = shipAt(e.clientX, e.clientY, ships);
    if (hit && !e.ctrlKey && !e.metaKey && !e.shiftKey) { if (hit.pilot !== selPilot) A.selectPilot(hit.pilot); picked = null; return; }   // one of your ships: select its pilot (owner: the camera stays)
    const ob = objAt(e.clientX, e.clientY);          // an asteroid or a ship (not the selected pilot's own)
    if (ob && (e.ctrlKey || e.metaKey)) { A.alignTo(ob.kind, ob.id); return; }
    if (e.shiftKey) {
      if (ob) { A.moveTo(ob.kind, ob.id); return; }
      if (own) { const w = s2w(e.clientX, e.clientY); send({ t: "move", ship: own.id, x: +w.x.toFixed(4), y: +w.y.toFixed(4) }); }
      return;
    }
    if (ob && dbl) { const sel = myShip(); if (!(sel && (sel.targets || []).some((g) => g.kind === ob.kind && g.id === ob.id))) A.lock(ob.kind, ob.id); return; }
    if (ob && ob.kind === "rock") { picked = { kind: "rock", id: ob.id }; return; }   // an asteroid: its name and distance
    if (ob) return;
    const pr = propAt(e.clientX, e.clientY);
    if (pr) { picked = { kind: "prop", id: pr.id }; return; }                      // a Library prop: its name and distance
    if (!dbl) { picked = null; return; }
    if (!own) return;
    const w = s2w(e.clientX, e.clientY); send({ t: "move", ship: own.id, x: +w.x.toFixed(4), y: +w.y.toFixed(4) });
  };
  let lastTap = null, picked = null;                 // picked: the object a single click selected ({ kind: "rock", id })
  function rockAt(px, py) {
    let best = null, bd = Infinity; const sc = scale();
    for (const f of belts.values()) for (const k of f.rocks) { const d = Math.hypot(px - gx2s(k.x), py - gy2s(k.y)), r = Math.max(8, k.size / 1000 * sc * 0.5); if (d <= r && d < bd) { bd = d; best = k; } }
    return best;
  }
  function propAt(px, py) {                         // a Library prop under the pointer (its art's box)
    const sc = scale(); let best = null, bd = Infinity;
    for (const f of belts.values()) for (const o of f.props || []) {
      const dx = Math.abs(px - gx2s(o.x)), dy = Math.abs(py - gy2s(o.y)), hw = Math.max(6, o.w * sc / 2), hh = Math.max(6, o.h * sc / 2);
      if (dx <= hw && dy <= hh) { const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = o; } }
    }
    return best;
  }
  const propById = (id) => { for (const f of belts.values()) { const o = (f.props || []).find((x) => x.id === id); if (o) return o; } return null; };
  const rockById = (id) => { for (const f of belts.values()) { const k = f.rocks.find((x) => x.id === id); if (k) return k; } return null; };
  // ---- objects in space (owner): asteroids and ships. Right-click / hold one: Lock Target (Unlock Target once locked),
  // Align To, Move towards, Info ----
  let drawn = [];                                   // the ships as last drawn (interpolated)
  const ROCK_SOLID = 1;                             // (owner) an object's edge: a rock's whole art
  function objPos(kind, id) {
    if (kind === "rock") { const k = rockById(id); return k ? { x: k.x, y: k.y, r: k.size / 2000 * ROCK_SOLID, size: k.size / 1000 } : null; }
    if (kind === "ship") { const s = drawn.find((x) => x.id === id) || (latest.ships || []).find((x) => x.id === id); return s && !s.warp ? { x: s.x, y: s.y, r: (hull(s.type).radiusKm || 0.09), size: hull(s.type).lengthKm, mine: s.mine, type: s.type } : null; }
    return null;
  }
  const oreOf = (key) => ((cfg && cfg.ores) || []).find((o) => o.key === key);
  function objName(kind, id) {
    if (kind === "rock") { const k = rockById(id), o = k && oreOf(k.ore); return o ? o.name : "Asteroid"; }
    const s = (latest.ships || []).find((x) => x.id === id); return hull(s ? s.type : "chisel").name;
  }
  function objIcon(kind, id) {
    if (kind === "rock") { const k = rockById(id), o = k && oreOf(k.ore), f = o ? o.rock : "cratered"; return "assets/icons/ores/" + (f === "bubble" ? "rubble" : f) + "_s.png"; }
    const s = (latest.ships || []).find((x) => x.id === id); return "assets/icons/ships/" + hull(s ? s.type : "chisel").sprite + (s && s.mine ? "_blue" : "_red") + "_s.png";
  }
  // edge-to-edge distance from the selected pilot's ship (km), or null
  function rangeTo(kind, id) {
    const own = drawn.find((s) => s.mine && s.pilot === selPilot) || myShip(), pos = objPos(kind, id); if (!own || !pos) return null;
    return Math.max(0, Math.hypot(own.x - pos.x, own.y - pos.y) - pos.r - (hull(own.type).radiusKm || 0.09));
  }
  // (owner) Look At: the camera follows the object (zooming about its centre) until you pan or follow something else
  const lookPos = (o) => o.kind === "prop" ? propById(o.id) : objPos(o.kind, o.id);
  function lookAtObj(kind, id) {
    if (kind === "ship") return window.Atamus.followShip(id);
    if (!lookPos({ kind, id })) return false;
    lookAt = { kind, id }; follow = null; zoomAt = null; return true;
  }
  // one of your ships' menu (owner): the selected pilot's own is Look At, Info; another is an object's menu; both add Rename
  function ownShipItems(id) {
    const sh = (latest.ships || []).find((x) => x.id === id); if (!sh) return [];
    const items = sh.pilot === selPilot ? [["Look At", () => lookAtObj("ship", id)], ["Show Fitting", () => bus.dispatchEvent(new CustomEvent("showfitting", { detail: sh.pilot }))], ["Info", () => bus.dispatchEvent(new CustomEvent("objinfo", { detail: { kind: "ship", id } }))]] : objItems("ship", id);
    items.push(["Rename", () => bus.dispatchEvent(new CustomEvent("rename", { detail: id }))]);
    return items;
  }
  function objItems(kind, id) {
    const own = myShip(), out = [], A = window.Atamus;
    if (own && !own.warp) {
      const tg = (own.targets || []).find((g) => g.kind === kind && g.id === id), t = hull(own.type), r = rangeTo(kind, id);
      if (tg) { if (tg.locked) out.push(["Unlock Target", () => A.unlock(kind, id)]); }
      else if (r != null && r <= (t.targetRangeKm || 0) && (own.targets || []).length < (t.maxTargets || 0) && !(kind === "ship" && id === own.id)) out.push(["Lock Target", () => A.lock(kind, id)]);
      if (!(kind === "ship" && id === own.id)) out.push(["Align To", () => A.alignTo(kind, id)], ["Move towards", () => A.moveTo(kind, id)]);
    }
    out.push(["Look At", () => lookAtObj(kind, id)], ["Info", () => bus.dispatchEvent(new CustomEvent("objinfo", { detail: { kind, id } }))]);
    const sh = kind === "ship" && (latest.ships || []).find((x) => x.id === id);
    if (sh && !sh.mine) out.push(["Pilot Info", () => bus.dispatchEvent(new CustomEvent("pilotinfo", { detail: id.split(":")[2] }))]);   // (owner) another player's ship: its pilot
    return out;
  }
  // the object under the pointer: a ship (not the selected pilot's own) or an asteroid
  function objAt(px, py) {
    const sc = scale(); let best = null, bd = Infinity;
    for (const s of drawn) { if (s.warp || (s.mine && s.pilot === selPilot)) continue; const r = Math.max(12, hull(s.type).lengthKm * sc * 0.6), d = Math.hypot(px - gx2s(s.x), py - gy2s(s.y)); if (d <= r && d < bd) { bd = d; best = { kind: "ship", id: s.id }; } }
    if (best) return best;
    const k = rockAt(px, py); return k ? { kind: "rock", id: k.id } : null;
  }
  // (owner) hovering an asteroid or Library prop (touch: while pressing it) shows a light dotted outline of where a
  // destination can't be set: its edge plus the selected ship's radius plus the server's DEST_CLEAR_KM
  const DEST_CLEAR_KM = 0.07, shipR = (s) => (hull(s ? s.type : "chisel").radiusKm || 0.09);
  let hoverObj = null;
  const objUnder = (px, py) => { const k = rockAt(px, py); if (k) return { kind: "rock", id: k.id }; const p = propAt(px, py); return p ? { kind: "prop", id: p.id } : null; };
  canvas.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") hoverObj = objUnder(e.clientX, e.clientY); });
  canvas.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") hoverObj = objUnder(e.clientX, e.clientY); });
  for (const ev of ["pointerup", "pointercancel"]) canvas.addEventListener(ev, (e) => { if (e.pointerType !== "mouse") hoverObj = null; });
  canvas.addEventListener("pointerleave", () => { hoverObj = null; });
  function drawKeepOut(ships) {
    if (!hoverObj) return;
    const own = ships.find((s) => s.mine && s.pilot === selPilot), pad = shipR(own) + DEST_CLEAR_KM, sc = scale();
    ctx.save(); ctx.strokeStyle = "rgba(220,226,236,0.45)"; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.beginPath();
    if (hoverObj.kind === "rock") { const k = rockById(hoverObj.id); if (!k) { hoverObj = null; ctx.restore(); return; } ctx.arc(gx2s(k.x), gy2s(k.y), (k.size / 2000 + pad) * sc, 0, Math.PI * 2); }
    else { const p = propById(hoverObj.id); if (!p) { hoverObj = null; ctx.restore(); return; } const hx = (p.w / 2 + pad) * sc, hy = (p.h / 2 + pad) * sc; ctx.rect(gx2s(p.x) - hx, gy2s(p.y) - hy, hx * 2, hy * 2); }
    ctx.stroke(); ctx.restore();
  }
  const tip = document.getElementById("tooltip"); let mapTip = false;
  canvas.addEventListener("pointermove", (e) => {    // a map marker's name on hover (owner: tooltips show names only)
    if (e.pointerType !== "mouse" || !tip) return;
    const p = poiAt(e.clientX, e.clientY);
    if (p) { tip.textContent = p.name; tip.hidden = false; tip.style.left = (e.clientX + 14) + "px"; tip.style.top = e.clientY + "px"; mapTip = true; }
    else if (mapTip) { tip.hidden = true; mapTip = false; }
  });
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoomTo(viewWTarget * (e.deltaY > 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY); }, { passive: false });
  // zoom toward the pointer (or about your ship while following it)
  function zoomTo(w, px, py) {
    viewWTarget = Math.max(ZOOM_MIN_W, Math.min(fitWidth(), w));
    if (follow || lookAt) { zoomAt = null; return; }   // zoom about what the camera follows
    const p = s2w(px, py); zoomAt = { wx: p.x, wy: p.y, px, py };
  }
  document.addEventListener("contextmenu", (e) => e.preventDefault());   // no browser menu anywhere in the game (owner)
  // WASD pans the camera (owner); it stops following
  const keys = new Set();
  const typing = () => { const t = document.activeElement && document.activeElement.tagName; return t === "INPUT" || t === "TEXTAREA" || t === "SELECT"; };
  addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); if ("wasd".includes(k) && k.length === 1 && !typing() && !e.ctrlKey && !e.metaKey && !e.altKey) keys.add(k); });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => keys.clear());

  // ---- drawing ----
  function drawHex() {                            // the Expanse's edge (owner: the world boundary)
    const R = HEX_R(); ctx.save(); ctx.beginPath();
    for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3, x = gx2s(Math.cos(a) * R), y = gy2s(Math.sin(a) * R); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.strokeStyle = "rgba(140,170,220,0.35)"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  // belts: the map marker always; the zone and the rocks only while one of your ships is inside (owner)
  const mapIcons = { belt: img("assets/icons/map/asteroid_field_s.png"), library: img("assets/icons/map/waypoint_s.png") }, oreBy = () => new Map(((cfg && cfg.ores) || []).map((o) => [o.key, o]));
  const rockArt = (family, size) => img("assets/rocks/rock_" + family + "_" + size + ".webp"), oreIcon = (family) => img("assets/icons/ores/" + (family === "bubble" ? "rubble" : family) + "_s.png");
  function drawBelts(ships) {
    const sc = scale(), ores = oreBy();
    for (const p of pois) {
      const x = gx2s(p.x), y = gy2s(p.y), rPx = p.r * sc, f = belts.get(p.id);
      if (x < -rPx - 40 || y < -rPx - 40 || x > innerWidth + rPx + 40 || y > innerHeight + rPx + 40) continue;
      if (f) {
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, rPx, 0, Math.PI * 2); ctx.strokeStyle = "rgba(140,170,220,0.22)"; ctx.setLineDash([6, 6]); ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
        for (const k of f.rocks) {
          const rx = gx2s(k.x), ry = gy2s(k.y), wPx = k.size / 1000 * sc;
          if (rx < -wPx || ry < -wPx || rx > innerWidth + wPx || ry > innerHeight + wPx) continue;
          const o = ores.get(k.ore) || { rock: "cratered", color: "#888" };
          ctx.save(); ctx.translate(rx, ry); ctx.rotate(k.rot);
          if (wPx < 6) { const ic = oreIcon(o.rock); if (ic.naturalWidth && rPx > 60) { ctx.imageSmoothingEnabled = false; ctx.drawImage(ic, -4, -4, 8, 8); } else { ctx.fillStyle = o.color; ctx.fillRect(-1, -1, 2, 2); } }
          else { const a = rockArt(o.rock, k.size); if (a.naturalWidth) { ctx.imageSmoothingEnabled = wPx > 48; ctx.drawImage(a, -wPx / 2, -wPx / 2 * a.naturalHeight / a.naturalWidth, wPx, wPx * a.naturalHeight / a.naturalWidth); } }
          ctx.restore();
        }
        for (const o of f.props || []) {                // the Library's props (owner): every space object, at true size
          const px = gx2s(o.x), py = gy2s(o.y), w = o.w * sc, h = o.h * sc;
          if (px < -w || py < -h || px > innerWidth + w || py > innerHeight + h || w < 1.5) continue;
          const a = img("assets/" + o.sprite); if (!a.naturalWidth) continue;
          ctx.save(); ctx.imageSmoothingEnabled = w > 48; ctx.drawImage(a, px - w / 2, py - h / 2, w, h); ctx.restore();
        }
      }
      const mapIcon = mapIcons[p.kind] || mapIcons.belt;
      if (!p.hidden && mapIcon.naturalWidth) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = rPx > 200 ? 0.5 : 1; ctx.drawImage(mapIcon, Math.round(x - mapIcon.naturalWidth / 2), Math.round(y - mapIcon.naturalHeight / 2)); ctx.restore(); }
    }
  }
  // the picked asteroid (owner): grey corner brackets, its ore's name and its distance from the selected pilot's ship
  function drawPicked(ships) {
    if (!picked) return;
    const own = ships.find((s) => s.mine && s.pilot === selPilot);
    let x, y, r, name, dist;
    if (picked.kind === "prop") {                     // a Library prop: brackets around its art
      const p = propById(picked.id); if (!p) { picked = null; return; }
      x = gx2s(p.x); y = gy2s(p.y); r = Math.max(9, Math.max(p.w, p.h) * scale() * 0.55); name = p.name;
      dist = own ? Math.max(0, Math.hypot(Math.max(0, Math.abs(own.x - p.x) - p.w / 2), Math.max(0, Math.abs(own.y - p.y) - p.h / 2)) - shipR(own)) : null;
    } else {
      const k = picked.kind === "rock" && rockById(picked.id); if (!k) { picked = null; return; }
      x = gx2s(k.x); y = gy2s(k.y); r = Math.max(9, k.size / 1000 * scale() * 0.55);
      const o = ((cfg && cfg.ores) || []).find((q) => q.key === k.ore); name = o ? o.name : k.ore;
      dist = own ? Math.max(0, Math.hypot(own.x - k.x, own.y - k.y) - k.size / 2000 - shipR(own)) : null;
    }
    ctx.save(); ctx.strokeStyle = "rgba(200,206,216,0.85)"; ctx.lineWidth = 1.5; const c = Math.min(8, r * 0.5);   // (owner) grey = selected; orange is kept for targeted
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(x + sx * r, y + sy * (r - c)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - c), y + sy * r); ctx.stroke(); }
    ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(230,235,245,0.95)"; ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 3;
    ctx.fillText(name + (dist != null ? " - " + (dist < 10 ? dist.toFixed(1) : Math.round(dist)) + " km" : ""), x, y - r - 6);
    ctx.restore();
  }
  // locked targets (owner: orange = targeted): orange corner brackets, blinking while the lock comes on; hovering a
  // target on the HUD draws a thin, faint grey line from your ship to it
  function drawTargets(ships) {
    const own = ships.find((s) => s.mine && s.pilot === selPilot); if (!own) return;
    const sc = scale(), t = performance.now();
    for (const g of own.targets || []) {
      const pos = objPos(g.kind, g.id); if (!pos) continue;
      const x = gx2s(pos.x), y = gy2s(pos.y), r = Math.max(10, pos.size * sc * 0.6) + 3, c = Math.min(8, r * 0.5);
      ctx.save(); ctx.strokeStyle = "rgba(255,160,70," + (g.locked ? 0.95 : 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t / 80))) + ")"; ctx.lineWidth = 1.5;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(x + sx * r, y + sy * (r - c)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - c), y + sy * r); ctx.stroke(); }
      ctx.restore();
    }
    // (owner) from the hovered target's ring on the HUD to the object, thin and faint
    const h = window.Atamus.hoverTarget, hp = h && objPos(h.kind, h.id);
    if (hp && h.el && h.el.isConnected) {
      const r = h.el.getBoundingClientRect();
      ctx.save(); ctx.strokeStyle = "rgba(200,206,216,0.3)"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(r.left + r.width / 2, r.top); ctx.lineTo(gx2s(hp.x), gy2s(hp.y)); ctx.stroke(); ctx.restore();
    }
  }
  function drawWarps(ships) {                       // a ship in warp leaves a fading streak back toward where it entered
    for (const sh of ships) {
      if (!sh.warp) continue;
      const x = gx2s(sh.x), y = gy2s(sh.y), fx = gx2s(sh.warp.fx), fy = gy2s(sh.warp.fy), L = Math.hypot(x - fx, y - fy); if (L < 2) continue;
      const k = Math.min(1, 160 / L), sx = x + (fx - x) * k, sy = y + (fy - y) * k, g = ctx.createLinearGradient(x, y, sx, sy);
      g.addColorStop(0, sh.mine ? "rgba(120,200,255,0.9)" : "rgba(255,120,120,0.9)"); g.addColorStop(1, "rgba(120,200,255,0)");
      ctx.save(); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(sx, sy); ctx.stroke(); ctx.restore();
    }
  }
  function drawShips(ships) {
    const sc = scale();
    for (const sh of ships) {
      const sx = gx2s(sh.x), sy = gy2s(sh.y);
      if (sh.mine && sh.moving && sh.tx != null && !sh.dest) {   // where it's headed (drawn even with the ship off screen)
        const tx = gx2s(sh.tx), ty = gy2s(sh.ty);
        ctx.save(); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty);
        ctx.strokeStyle = "rgba(200,205,215,0.28)"; ctx.lineWidth = 1; ctx.setLineDash([4, 5]); ctx.stroke();
        ctx.setLineDash([]); ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, Math.PI * 2); ctx.fillStyle = "rgba(200,205,215,0.5)"; ctx.fill(); ctx.restore();
      }
      if (sx < -80 || sy < -80 || sx > innerWidth + 80 || sy > innerHeight + 80) continue;
      const wPx = hull(sh.type).lengthKm * sc, art = shipArt(sh.type, sh.mine), ic = shipIcon(sh.type, sh.mine);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(-sh.h);  // sprites face +x; world +y is up
      if (wPx < 10 && ic.naturalWidth) { ctx.imageSmoothingEnabled = false; ctx.drawImage(ic, -ic.naturalWidth / 2, -ic.naturalHeight / 2); }   // zoomed out: its hull icon
      else if (art.naturalWidth) { const hPx = wPx * art.naturalHeight / art.naturalWidth; ctx.imageSmoothingEnabled = wPx > 48; ctx.drawImage(art, -wPx / 2, -hPx / 2, wPx, hPx); }
      else { ctx.fillStyle = sh.mine ? "#4fd2ff" : "#ff5a5a"; ctx.fillRect(-Math.max(2, wPx) / 2, -Math.max(1, wPx / 4), Math.max(2, wPx), Math.max(2, wPx / 2)); }
      ctx.restore();
    }
  }

  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(innerWidth * dpr) || canvas.height !== Math.floor(innerHeight * dpr)) { canvas.width = Math.floor(innerWidth * dpr); canvas.height = Math.floor(innerHeight * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
    const ships = shipsNow(), own = ships.find((s) => s.mine && s.pilot === selPilot) || ships.find((s) => s.mine);
    if (!camInit && own && cfg) {                      // start on your ship (or where you were, after an update reload)
      camInit = true; cam.cx = own.x; cam.cy = own.y;
      follow = own.id;
      try { const v = JSON.parse(sessionStorage.getItem("atamus.view") || "null"); if (v && isFinite(v.cx) && isFinite(v.w)) { cam.cx = v.cx; cam.cy = v.cy; cam.viewW = viewWTarget = Math.max(ZOOM_MIN_W, v.w); follow = typeof v.follow === "string" ? v.follow : null; } } catch {}
    }
    if (cfg) {
      viewWTarget = Math.max(ZOOM_MIN_W, Math.min(fitWidth(), viewWTarget));
      cam.viewW += (viewWTarget - cam.viewW) * (1 - Math.exp(-14 * dt));
      if (zoomAt && !follow) {                         // keep the point under the pointer still while the zoom eases
        const sc = scale(); cam.cx = zoomAt.wx - (zoomAt.px - innerWidth / 2) / sc; cam.cy = zoomAt.wy + (zoomAt.py - innerHeight / 2) / sc;
        if (Math.abs(viewWTarget - cam.viewW) < viewWTarget * 0.002) zoomAt = null;
      }
      if (keys.size) {                                 // WASD
        let dx = 0, dy = 0; if (keys.has("a")) dx -= 1; if (keys.has("d")) dx += 1; if (keys.has("w")) dy += 1; if (keys.has("s")) dy -= 1;
        if (dx || dy) { const l = Math.hypot(dx, dy); follow = null; lookAt = null; zoomAt = null; cam.cx += dx / l * cam.viewW * 0.9 * dt; cam.cy += dy / l * cam.viewW * 0.9 * dt; }
      }
      if (lookAt) { const p = lookPos(lookAt); if (!p) lookAt = null; else { const e = 1 - Math.exp(-12 * dt); cam.cx += (p.x - cam.cx) * e; cam.cy += (p.y - cam.cy) * e; } }   // (owner) Look At
      const fs = follow && ships.find((s) => s.id === follow);
      if (follow && !fs && latest.ships && !latest.ships.some((s) => s.id === follow)) follow = null;   // that ship is gone
      // (owner) following a ship through a warp: zoom all the way out and hold the map still; zoom back onto it after
      if (fs && fs.warp) { if (!warpView) warpView = { w: viewWTarget }; viewWTarget = fitWidth(); const e = 1 - Math.exp(-6 * dt); cam.cx += (0 - cam.cx) * e; cam.cy += (0 - cam.cy) * e; }
      else if (fs) {
        if (warpView) { viewWTarget = warpView.w; warpView = null; }
        const e = 1 - Math.exp(-12 * dt); cam.cx += (fs.x - cam.cx) * e; cam.cy += (fs.y - cam.cy) * e;
      }
      clampCamera();
      sendView(now);
    }
    drawBackground();
    drawn = ships;
    if (cfg) { drawHex(); drawBelts(ships); drawWarps(ships); drawShips(ships); drawTargets(ships); drawKeepOut(ships); drawPicked(ships); }
    requestAnimationFrame(frame);
  }

  // ---- space backdrop (owner): a dark gradient, slow drifting noise, a very thin world grid and three layers of
  // parallax stars that dim and brighten. Redrawn every frame (so a GPU reset can never leave it blank). ----
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
  }  requestAnimationFrame(frame);
})();
