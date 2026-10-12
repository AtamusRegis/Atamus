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
  const RENDER_DELAY_MS = 150, snaps = []; let clockOffset = null, latest = { ships: [] }, snapAt = 0;
  const HEAVY = ["fit", "holds", "calc"], heavy = new Map();   // the last fit / holds / stats per own ship, and the hangar
  // follow: the id of the ship the camera follows, or null. Selecting a pilot doesn't move the camera (owner).
  const POI_VIEW_KM = 110;                         // a whole 100 km POI with a little margin
  let warpView = null;                             // the zoom to come back to after following a ship through a warp
  let warpFollowed = null;                         // (owner) the selected pilot's warping ship the camera took up (once)
  const WARP_ZOOM_BACK = 0.85;                     // (owner) how far through a warp the zoom starts coming back in
  const ZOOM_MIN_W = 3.25;                         // km across the screen at the closest zoom (owner: the Prospector at about 1/25 of the width)
  const cam = { cx: 0, cy: 0, viewW: ZOOM_MIN_W }; let viewWTarget = ZOOM_MIN_W, follow = null, camInit = false, zoomAt = null;
  let lookAt = null;                               // (owner) Look At: { kind: "rock" | "prop", id } the camera follows (a ship is followed by id)
  let kickedWhy = null;                            // (owner) the reason an admin gave, kept for the moment the socket closes
  let selPilot = null;                             // the selected pilot (ui.js keeps it; one is always selected)

  window.Atamus = {
    send: (o) => send(o), bus, get me() { return me; }, get cfg() { return cfg; }, get snap() { return latest; },
    get drawn() { return drawn; },                    // the ships as drawn this frame (positions interpolated)
    hoverModule: null,
    adminMode: false,                                // set by the UI (owner: the chat's Player / Admin switch)                               // set by the UI: { key, el } of the active module the pointer is on (its range lights up)
    ship: (id) => (latest.ships || []).find((x) => x.id === id) || null, get myShip() { return myShip(); }, get picked() { return picked; },
    get view() { return { cx: +cam.cx.toFixed(3), cy: +cam.cy.toFixed(3), w: +viewWTarget.toFixed(3), follow, lookAt }; },
    get selectedPilot() { return selPilot; },
    selectPilot: (id) => {
      const was = selPilot; selPilot = id == null ? null : String(id);
      // (owner) switching pilots while the camera is following a ship aligning or warping: it refocuses on the new pilot's ship
      if (was !== selPilot) { const cur = follow && (latest.ships || []).find((x) => x.id === follow);
        if (warpView || (cur && cur.mine && (cur.warp || (cur.warpReq && cur.dest)))) { const nx = (latest.ships || []).find((x) => x.mine && x.pilot === selPilot);
          if (warpView) { viewWTarget = warpView.w; warpView = null; }
          if (nx) { follow = nx.id; lookAt = null; zoomAt = null; warpFollowed = nx.warp || (nx.warpReq && nx.dest) ? nx.id : null; } } }
      bus.dispatchEvent(new CustomEvent("pilotselect", { detail: selPilot }));
    },
    followShip: (id) => { if (!(latest.ships || []).some((x) => x.id === id)) return false; follow = id; lookAt = null; zoomAt = null; return true; },
    lookAt: (kind, id) => lookAtObj(kind, id),
    // (owner) Tab: center on that pilot's ship and zoom to show a whole POI around it
    focusShip: (id) => { if (!(latest.ships || []).some((x) => x.id === id)) return false; follow = id; lookAt = null; zoomAt = null; viewWTarget = POI_VIEW_KM * Math.max(1, innerWidth / innerHeight); warpView = null; return true; },
    get pois() { return pois; }, poi: (id) => poiById.get(id) || null, get belts() { return belts; },
    align: (poiId, shipId) => { const sh = shipId ? window.Atamus.ship(shipId) : myShip(); if (sh) send({ t: "align", ship: sh.id, poi: poiId }); },
    warp: (poiId, shipId) => { const sh = shipId ? window.Atamus.ship(shipId) : myShip(); if (sh) send({ t: "warp", ship: sh.id, poi: poiId }); },
    inPoi: (sh, poi) => { if (!sh || !poi) return false; const a = poi.ax != null ? { x: poi.ax, y: poi.ay, r: poi.ar } : poi; return Math.hypot(sh.x - a.x, sh.y - a.y) <= a.r; },   // (a celestial: at its anchor)
    // objects in space (owner): { kind: "rock" | "ship", id }. Orders go to the selected pilot's ship.
    lock: (kind, id) => { const sh = myShip(); if (sh) send({ t: "lock", ship: sh.id, kind, id }); },
    unlock: (kind, id) => { const sh = myShip(); if (sh) send({ t: "unlock", ship: sh.id, kind, id }); },
    alignTo: (kind, id) => { const sh = myShip(); if (sh) send({ t: "chase", ship: sh.id, kind, id, mode: "align" }); },
    moveTo: (kind, id) => { const sh = myShip(); if (sh) send({ t: "chase", ship: sh.id, kind, id, mode: "approach" }); },
    orbit: (kind, id) => { const sh = myShip(); if (sh) send({ t: "chase", ship: sh.id, kind, id, mode: "orbit" }); },   // (owner) circle it
    info: (kind, id) => send({ t: "info", kind, id }),
    celestial: (id) => celestialById(id),
    objPos: (kind, id) => objPos(kind, id), objName: (kind, id) => objName(kind, id), objIcon: (kind, id) => objIcon(kind, id),
    objItems: (kind, id) => objItems(kind, id), ownShipItems: (id) => ownShipItems(id),
    hoverTarget: null,                               // set by the HUD: a thin gray line runs from your ship to it
    rangeTo: (kind, id) => rangeTo(kind, id),
    // can this ship dock right now (within dockKm of a station's edge, not docked or warping), and where: "station" (the
    // temporary Station) or "home" (your own station, owner)
    canDock: (sh) => {
      if (!sh || sh.docked || sh.warp) return false;
      const near = (st) => { if (!st) return false; const dx = Math.max(0, Math.abs(sh.x - st.x) - st.w / 2), dy = Math.max(0, Math.abs(sh.y - st.y) - st.h / 2); return Math.hypot(dx, dy) - (hull(sh.type).radiusKm || 0.09) <= ((cfg && cfg.dockKm) || 5); };
      if (near(homeProp())) return "home";
      for (const f of belts.values()) for (const o of f.props || []) if (o.station && !o.home && near(o)) return o.id.replace(/#0$/, "");   // (owner) any planet's NPC station: its id
      return false;
    },
    homeName: () => { const h = pois.find((p) => p.kind === "home"); return h ? h.name : null; },
  };
  const myShip = () => { const own = (latest.ships || []).filter((x) => x.mine); return own.find((x) => x.pilot === selPilot) || own[0] || null; };   // the selected pilot's ship

  // backdrop on its own canvas under the transparent game canvas
  const bgCanvas = document.createElement("canvas"); bgCanvas.id = "bg";
  bgCanvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;";
  canvas.insertAdjacentElement("beforebegin", bgCanvas);
  const bgCtx = bgCanvas.getContext("2d");
  if (window.SunFX) window.SunFX.init();             // (owner) the sun's glow and flare: a WebGL layer between the backdrop and the game
  const SUN_BRIGHTNESS = 0.55;                         // (owner, before the reset) the sun was too bright

  // ---- ship art: drawn at true scale from its sprite; zoomed out, its hull icon. Yours blue, others red ----
  const hull = (type) => (cfg && cfg.shipTypes && cfg.shipTypes[type]) || { name: "Prospector", sprite: "chisel", lengthKm: 0.128 };
  const imgs = {};
  const img = (src) => { if (!imgs[src]) { imgs[src] = new Image(); imgs[src].src = src; } return imgs[src]; };
  // (owner) the ETA's hulls have their own art (one color)
  const shipArt = (type, mine) => { const h = hull(type); return img("assets/ships/" + (h.art || h.sprite + (mine ? "_blue" : "_red")) + ".webp"); };
  const iconName = (type, mine) => { const h = hull(type); return h.icon || h.sprite + (mine ? "_blue" : "_red"); };
  const shipIcon = (type, mine) => img("assets/icons/ships/" + iconName(type, mine) + "_s.png");

  // ---- connection ----
  if (needLogin()) { location.replace("login.html"); return; }   // (owner) returning players log in first
  // (owner) logging in to another account in this browser (another tab) changes who the website's requests are for; the
  // game here would still be the first account. Checked now and then and on coming back to the tab: then back to Log in.
  const sameUser = () => { if (!me || !me.name || reloading) return; Api.get("/auth/me").then((u) => { if (u && u.username && me && me.name && u.username.toLowerCase() !== me.name.toLowerCase()) { reloading = true; try { ws && ws.close(); } catch {} location.href = "login.html"; } }).catch(() => {}); };
  setInterval(sameUser, 20000); addEventListener("focus", sameUser); document.addEventListener("visibilitychange", () => { if (!document.hidden) sameUser(); });
  Api.get("/auth/me").then((u) => { me.name = u.username; connect(); }).catch(() => { location.href = "login.html"; });
  function wsUrl() { const base = (typeof API_BASE !== "undefined" ? API_BASE : location.origin); return base.replace(/^http/, "ws") + "/ws?d=" + deviceId(); }
  function setStatus(t, k) { statusEl.textContent = t; statusEl.className = "status" + (k ? " " + k : ""); if (k === "ok") setTimeout(() => statusEl.classList.add("hidden"), 1200); else statusEl.classList.remove("hidden"); }
  function connect() {
    setStatus("Connecting…");
    ws = new WebSocket(wsUrl());
    ws.onopen = () => setStatus("Connected", "ok");
    ws.onclose = (e) => {
      if (e.code === 4001) { location.href = "login.html"; return; }          // signed out (session expired): back to the website
      if (e.code === 4005 || e.code === 4006) {        // (owner) kicked or banned by an admin: say why, then off to the website
        reloading = true; const why = kickedWhy ? ": " + kickedWhy : ""; setStatus((e.code === 4006 ? "Banned" : "Kicked") + why, "err");
        setTimeout(() => { location.href = e.code === 4006 ? "login.html" : "play.html"; }, 5000); return;
      }
      if (e.code === 4007 || e.code === 4008 || e.code === 4009) {   // (owner) timed out (malformed messages), or another account is playing on this device
        reloading = true; setStatus(e.code === 4009 ? "Another account is playing on this device" : "Timed out" + (e.reason && /^\d+$/.test(e.reason) ? " until " + new Date(+e.reason).toLocaleString() : ""), "err");
        setTimeout(() => { location.href = "play.html"; }, 5000); return;
      }
      if (e.code === 4011) { reloading = true; setStatus("Account locked", "err"); setTimeout(() => { location.href = "login.html"; }, 3000); return; }   // (owner) suspected sharing or compromise
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
        heavy.clear(); cfg = m.cfg; me = m.you; sentView = ""; setPois(m.pois); setBelts(m.belts); bus.dispatchEvent(new CustomEvent("hello"));
      } else if (m.t === "pois") { setPois(m.pois); bus.dispatchEvent(new CustomEvent("pois"));
      } else if (m.t === "belts") { setBelts(m.belts);
      } else if (m.t === "snap") {
        const now = performance.now(), off = m.st - now;
        // server clock ≈ local + offset: eased toward the freshest arrivals (never jumped, so motion doesn't skip; a big change, like a sleeping tab, snaps)
        if (clockOffset == null || Math.abs(off - clockOffset) > 1000) clockOffset = off; else clockOffset += (off - clockOffset) * (off > clockOffset ? 0.08 : 0.01);
        for (const s of m.ships) if (s.mine) { const c = heavy.get(s.id) || {}; for (const k of HEAVY) { if (k in s) c[k] = s[k]; else if (k in c) s[k] = c[k]; } heavy.set(s.id, c); }   // the server leaves out what hasn't changed
        if (m.hangars) heavy.set("hangars", m.hangars); else if (m.ships.some((s) => s.mine && s.docked)) m.hangars = heavy.get("hangars") || {};
        { const own = m.ships.filter((s) => s.mine && s.docked), at = (own.find((s) => s.pilot === selPilot) || own[0] || {}).docked;   // (owner) a hangar per station: the selected pilot's station's
          if (at && m.hangars) m.hangar = m.hangars[at] || {}; }
        if (m.home) heavy.set("home", m.home); else if (m.ships.some((s) => s.mine && s.docked === "home")) m.home = heavy.get("home") || {};   // your station's storage
        snaps.push({ st: m.st, ships: new Map(m.ships.map((s) => [s.id, s])) }); while (snaps.length > 30) snaps.shift();
        latest = m; snapAt = performance.now(); bus.dispatchEvent(new CustomEvent("snap"));
      } else if (m.t === "admdm" || m.t === "admopen" || m.t === "admend" || m.t === "frozen" || m.t === "renamereq" || m.t === "appealmsg" || m.t === "admstate" || m.t === "adminprofile" || m.t === "chatflag" || m.t === "langalert" || m.t === "relappeal" || m.t === "relappealadm" || m.t === "ticket" || m.t === "staffsys" || m.t === "staffnotes") { bus.dispatchEvent(new CustomEvent(m.t, { detail: m }));   // (owner) admin DMs, Freeze
      } else if (m.t === "kicked" || m.t === "banned") { kickedWhy = m.reason || "";
      } else if (m.t === "info") bus.dispatchEvent(new CustomEvent("info", { detail: m }));
      else if (m.t === "notice") bus.dispatchEvent(new CustomEvent("notice", { detail: m.text }));
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
  const HEX_R = () => ((cfg && cfg.expanseApothemKm) || 10000) / Math.cos(Math.PI / 6);   // center to a corner
  function fitWidth() { const R = HEX_R(), aspect = innerWidth / innerHeight; return Math.max(2 * R, 2 * R * Math.cos(Math.PI / 6) * aspect) * 1.08; }   // the whole hexagon on screen
  function clampCamera() { const R = HEX_R(), d = Math.hypot(cam.cx, cam.cy); if (d > R) { cam.cx = cam.cx / d * R; cam.cy = cam.cy / d * R; } }
  let sentView = "", viewAt = 0;
  function sendView(now) {                        // the server sends the other ships in view
    if (now - viewAt < 250) return; viewAt = now;
    const v = [cam.cx.toFixed(2), cam.cy.toFixed(2), viewWTarget.toFixed(2)].join(","); if (v === sentView) return;
    sentView = v; send({ t: "view", x: +cam.cx.toFixed(2), y: +cam.cy.toFixed(2), w: +Math.max(viewWTarget, cam.viewW).toFixed(2) });
  }

  // ---- where each ship is drawn right now ----
  const renderTime = () => performance.now() + (clockOffset || 0) - RENDER_DELAY_MS;   // the server moment being drawn
  function shipsNow() {
    if (!snaps.length || clockOffset == null) return [];
    const rt = renderTime();
    let i = snaps.length - 1; while (i > 0 && snaps[i].st > rt) i--;
    const a = snaps[i], b = a.st <= rt ? snaps[i + 1] || null : null, pre = !b && a.st <= rt && i > 0 ? snaps[i - 1] : null;
    const out = [];
    for (const s of (b || a).ships.values()) {
      const p = a.ships.get(s.id);
      if (!b && pre) {                               // a snapshot is late: carry on along the last motion for a moment rather than stop and jump
        const q = pre.ships.get(s.id), f = Math.min(rt - a.st, 150) / Math.max(1, a.st - pre.st);
        if (q && !s.warp && !q.warp && Math.hypot(s.x - q.x, s.y - q.y) < 5) { out.push({ ...s, x: s.x + (s.x - q.x) * f, y: s.y + (s.y - q.y) * f }); continue; }
      }
      if (!b || !p || !!p.docked !== !!s.docked) { out.push({ ...s }); continue; }   // (docking / undocking: no sliding from where it was kept)
      const k = Math.max(0, Math.min(1, (rt - a.st) / Math.max(1, b.st - a.st)));
      let dh = s.h - p.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      out.push({ ...s, x: p.x + (s.x - p.x) * k, y: p.y + (s.y - p.y) * k, h: p.h + dh * k });
    }
    return out;
  }

  function setPois(list) { pois = list || []; poiById = new Map(pois.map((p) => [p.id, p])); }
  function setBelts(list) { belts = new Map((list || []).map((f) => [f.poi, f])); }

  // ---- input: click / tap = fly the selected ship there (on one of your ships: select its pilot, owner: no centering);
  // right-click or hold = the menu (on a belt's map marker: Warp to / Align to; elsewhere: Center on ship, Belts ›);
  // drag or WASD = pan; wheel / pinch = zoom ----
  const ptrs = new Map(); let drag = null, hold = 0;
  const MARKER_PX = 12;
  // (owner, 2026-10-11) zoomed out to the solar view, only the planets (and POIs out in deep space) are on the map: what's
  // inside a planetary system shows once you zoom in on it
  const sysOf = (p) => { if (p._sys !== undefined) return p._sys; if (!celestials().planets.length) return null; const pl = celestials().planets.find((q) => q.sysR && Math.hypot(p.x - q.x, p.y - q.y) <= q.sysR); return (p._sys = pl || null); };
  const poiShown = (p, sc = scale()) => { if (p.kind === "planet" || p.kind === "sun") return true; const pl = sysOf(p); return !pl || pl.sysR * sc >= SYSTEM_SHOW_PX; };
  const SYSTEM_SHOW_PX = 90;                         // a planetary system this big on screen (radius) shows what's in it
  const poiAt = (px, py) => { let best = null, bd = MARKER_PX; for (const p of pois) { if (!poiShown(p)) continue; const d = Math.hypot(px - gx2s(p.x), py - gy2s(p.y)); if (d <= bd) { bd = d; best = p; } } return best; };
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
    const al = alertAt(px, py), adm = (latest.ships || []).find((x) => x.mine && x.admin);
    if (al && adm && !adm.docked) { menu(px, py, [["Warp to " + al.n, () => send({ t: "warppt", x: al.x, y: al.y })]]); return; }   // (owner) a red diamond: the admin ship warps to it
    const ob = objAt(px, py);
    if (ob) { menu(px, py, objItems(ob.kind, ob.id)); return; }
    const pr = propAt(px, py);
    if (pr && pr.station) {                          // (owner) the Station, or a player's station: only your own can be docked at
      const own = myShip(), where = pr.home ? "home" : pr.id.replace(/#0$/, ""), yours = !pr.home || poiById.has("home:" + pr.home), items = [];
      if (yours) items.push(own && own.docked === where ? ["Open Hangar", () => bus.dispatchEvent(new CustomEvent("openstation"))] : ["Dock", () => { if (own) send({ t: "dock", ship: own.id, where }); }]);
      menu(px, py, [...items, ["Look At", () => lookAtObj("prop", pr.id)]]); return;
    }
    if (pr) { menu(px, py, [["Look At", () => lookAtObj("prop", pr.id)]]); return; }   // a Library prop
    const p = poiAt(px, py);
    if (p && !p.hidden && p.ax != null) { const c = celestialById(p.id); if (c) { menu(px, py, celestialItems(c)); return; } }
    if (p && !p.hidden) { menu(px, py, poiItems(p)); return; }
    const cb = celestialAt(px, py);
    if (cb) { menu(px, py, celestialItems(cb)); return; }   // (owner) a planet or moon itself
    const belts = pois.filter((q) => q.kind === "belt" && !q.hidden).sort((a, b) => a.name.localeCompare(b.name));
    menu(px, py, [["Center on ship", () => { const own = myShip(); if (own) window.Atamus.followShip(own.id); }],
      ["Belts", belts.map((q) => [q.name, null, { menu: poiItems(q) }])],   // (owner) a list: right-click (hold) a belt for its menu
      ["Celestials", [...(celestials().sun ? [[celestials().sun.name, null, { menu: celestialItems(celestials().sun) }]] : []), ["Planets", celestials().planets.map((q) => [q.name, null, { menu: [...celestialItems(q), ...(q.moons.some((m) => m.major) ? [["Moons", q.moons.filter((m) => m.major).map((m) => [m.name, null, { menu: celestialItems(m) }])]] : [])] }])]]]]);   // (owner) Celestials › Planets › a planet (and its Moons)
  }
  canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); if (e.ctrlKey && e.button === 0) return; openMenu(e.clientX, e.clientY); });   // (a Mac's Ctrl + click is Align To, not the menu)
  const shipAt = (px, py, ships) => {               // the nearest of your ships under the pointer
    let best = null, bd = Infinity;
    for (const s of ships) { if (!s.mine || s.docked) continue; const r = Math.max(14, hull(s.type).lengthKm * scale() * 0.6), d = Math.hypot(px - gx2s(s.x), py - gy2s(s.y)); if (d <= r && d < bd) { bd = d; best = s; } }
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
    if (ob && (ob.kind === "rock" || ob.kind === "wreck")) { picked = { kind: ob.kind, id: ob.id }; return; }   // an asteroid (or a wreck): its name and distance
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
  const stationProp = () => { for (const f of belts.values()) { const o = (f.props || []).find((x) => x.station && !x.home); if (o) return o; } return null; };
  const homeProp = () => { for (const f of belts.values()) { const o = (f.props || []).find((x) => x.home && poiById.has("home:" + x.home)); if (o) return o; } return null; };   // your own station (only yours is on your map)
  const propById = (id) => { for (const f of belts.values()) { const o = (f.props || []).find((x) => x.id === id); if (o) return o; } return null; };
  const rockById = (id) => { for (const f of belts.values()) { const k = f.rocks.find((x) => x.id === id); if (k) return k; } return null; };
  // ---- objects in space (owner): asteroids and ships. Right-click / hold one: Lock Target (Unlock Target once locked),
  // Align To, Move towards, Info ----
  let drawn = [];                                   // the ships as last drawn (interpolated)
  const ROCK_SOLID = 1;                             // (owner) an object's edge: a rock's whole art
  const wreckById = (id) => (latest.wrecks || []).find((w) => w.id === id) || null;   // (owner, combat) wrecks in view
  const wreckArt = img("assets/ships/jettison_can_off.png");
  const WRECK_KM = 0.06;
  function wreckAt(px, py) { let best = null, bd = Infinity; const sc = scale(); for (const w of latest.wrecks || []) { const d = Math.hypot(px - gx2s(w.x), py - gy2s(w.y)), r = Math.max(9, WRECK_KM * sc * 0.6); if (d <= r && d < bd) { bd = d; best = w; } } return best; }
  function drawWrecks() {
    const sc = scale();
    for (const w of latest.wrecks || []) {
      const x = gx2s(w.x), y = gy2s(w.y); if (x < -30 || y < -30 || x > innerWidth + 30 || y > innerHeight + 30) continue;
      const s0 = Math.max(12, WRECK_KM * sc); if (!wreckArt.naturalWidth) continue;
      const h0 = s0 * wreckArt.naturalHeight / wreckArt.naturalWidth;
      ctx.save(); ctx.imageSmoothingEnabled = s0 > 48; ctx.globalAlpha = 0.85; ctx.drawImage(wreckArt, x - s0 / 2, y - h0 / 2, s0, h0); ctx.restore();
    }
  }
  function objPos(kind, id) {
    if (kind === "wreck") { const w = wreckById(id); return w ? { x: w.x, y: w.y, r: 0.03, size: WRECK_KM } : null; }
    if (kind === "rock") { const k = rockById(id); return k ? { x: k.x, y: k.y, r: k.size / 2000 * ROCK_SOLID, size: k.size / 1000 } : null; }
    if (kind === "ship") { const s = drawn.find((x) => x.id === id) || (latest.ships || []).find((x) => x.id === id); return s && !s.warp ? { x: s.x, y: s.y, r: (hull(s.type).radiusKm || 0.09), size: hull(s.type).lengthKm, mine: s.mine, type: s.type } : null; }
    return null;
  }
  const oreOf = (key) => ((cfg && cfg.ores) || []).find((o) => o.key === key);
  function objName(kind, id) {
    if (kind === "wreck") { const w = wreckById(id); return w ? w.n : "Wreck"; }
    if (kind === "celestial") { const c = celestialById(id); return c ? c.name : "Celestial"; }
    if (kind === "rock") { const k = rockById(id), o = k && oreOf(k.ore); return o ? o.name : "Asteroid"; }
    const s = (latest.ships || []).find((x) => x.id === id); return hull(s ? s.type : "chisel").name;
  }
  function objIcon(kind, id) {
    if (kind === "wreck") return "assets/ships/jettison_can_off.png";
    if (kind === "celestial") {                       // its own surface (the sun: a glowing disc)
      const c = celestialById(id); if (!c) return "";
      if (c.kind === "sun") { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d"), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.35, "#bcd6ff"); gr.addColorStop(1, "rgba(70,130,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return cv.toDataURL(); }
      return planetTexture(c.seed || 1, c.world).c.toDataURL();
    }
    if (kind === "rock") { const k = rockById(id), o = k && oreOf(k.ore), f = o ? o.rock : "cratered"; return "assets/icons/ores/" + (f === "bubble" ? "rubble" : f) + "_s.png"; }
    const s = (latest.ships || []).find((x) => x.id === id); return "assets/icons/ships/" + iconName(s ? s.type : "chisel", s && s.mine) + "_s.png";
  }
  // edge-to-edge distance from the selected pilot's ship (km), or null
  function rangeTo(kind, id) {
    const own = drawn.find((s) => s.mine && s.pilot === selPilot) || myShip(), pos = objPos(kind, id); if (!own || !pos) return null;
    return Math.max(0, Math.hypot(own.x - pos.x, own.y - pos.y) - pos.r - (hull(own.type).radiusKm || 0.09));
  }
  // (owner) Look At: the camera follows the object (zooming about its center) until you pan or follow something else
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
    if (sh.admin) {                                    // (owner) an admin's ETA ship: cloak, and its hull
      if (!sh.docked && !sh.warp) items.push(sh.cloak ? ["Uncloak", () => send({ t: "cloak", on: false })] : ["Cloak", () => send({ t: "cloak", on: true })]);
      if (!sh.docked) items.push(["Hull", ["deputy", "constable", "magistrate"].filter((k) => "adm_" + k !== sh.type).map((k) => [hull("adm_" + k).name, () => send({ t: "ahull", hull: k })])]);
      if (sh.docked && !sh.unboarded) items.unshift(["Undock", () => send({ t: "undock", ship: id })]);
      return items;
    }
    if (sh.docked) { items.unshift(...(sh.unboarded ? [] : [["Undock", () => send({ t: "undock", ship: id })]])); items.push(sh.unboarded ? ["Board Pilot", () => send({ t: "board", ship: id, on: true })] : ["Unboard Pilot", () => send({ t: "board", ship: id, on: false })]); }   // (owner) a pilot not aboard can't undock
    items.push(["Rename", () => bus.dispatchEvent(new CustomEvent("rename", { detail: id }))]);
    return items;
  }
  function objItems(kind, id) {
    const own = myShip(), out = [], A = window.Atamus;
    if (own && !own.warp) {
      const tg = (own.targets || []).find((g) => g.kind === kind && g.id === id), t = hull(own.type), r = rangeTo(kind, id);
      if (tg) { if (tg.locked) out.push(["Unlock Target", () => A.unlock(kind, id)]); }
      else if (r != null && r <= ((own.calc && own.calc.targetRange) || t.targetRangeKm || 0) && (own.targets || []).length < ((own.calc && own.calc.maxTargets) || t.maxTargets || 0) && !(kind === "ship" && id === own.id)) out.push(["Lock Target", () => A.lock(kind, id)]);
      if (!(kind === "ship" && id === own.id)) out.push(["Align To", () => A.alignTo(kind, id)], ["Move towards", () => A.moveTo(kind, id)], ["Orbit", () => A.orbit(kind, id)]);
    }
    if (kind === "wreck") { const r = rangeTo(kind, id); if (own && r != null && r <= 2.5) out.unshift(["Open", () => bus.dispatchEvent(new CustomEvent("openwreck", { detail: id }))]); out.push(["Look At", () => lookAtObj(kind, id)]); return out; }   // (owner) a wreck: open it beside it
    out.push(["Look At", () => lookAtObj(kind, id)], ["Info", () => bus.dispatchEvent(new CustomEvent("objinfo", { detail: { kind, id } }))]);
    const sh = kind === "ship" && (latest.ships || []).find((x) => x.id === id);
    if (sh && !sh.mine && !sh.npc) out.push(["Pilot Info", () => bus.dispatchEvent(new CustomEvent("pilotinfo", { detail: id.split(":")[2] }))]);   // (owner) another player's ship: its pilot
    return out;
  }
  // the object under the pointer: a ship (not the selected pilot's own) or an asteroid
  function objAt(px, py) {
    const sc = scale(); let best = null, bd = Infinity;
    for (const s of drawn) { if (s.warp || s.docked || (s.mine && s.pilot === selPilot)) continue; const r = Math.max(12, hull(s.type).lengthKm * sc * 0.6), d = Math.hypot(px - gx2s(s.x), py - gy2s(s.y)); if (d <= r && d < bd) { bd = d; best = { kind: "ship", id: s.id }; } }
    if (best) return best;
    const wk = wreckAt(px, py); if (wk) return { kind: "wreck", id: wk.id };
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
    const al = alertAt(e.clientX, e.clientY), p = al ? { name: al.n } : poiAt(e.clientX, e.clientY);
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
  const mapIcons = { belt: img("assets/icons/map/asteroid_field_s.png"), library: img("assets/icons/map/waypoint_s.png"), station: img("assets/icons/map/station_s.png"), office: img("assets/icons/map/station_s.png"), home: img("assets/icons/map/station_s.png"), planet: img("assets/icons/map/waypoint_s.png"), moon: img("assets/icons/map/waypoint_s.png") }, oreBy = () => new Map(((cfg && cfg.ores) || []).map((o) => [o.key, o]));
  const rockArt = (family, size) => img("assets/rocks/rock_" + family + "_" + size + ".webp"), oreIcon = (family) => img("assets/icons/ores/" + (family === "bubble" ? "rubble" : family) + "_s.png");
  function drawBelts(ships) {
    const sc = scale(), ores = oreBy();
    for (const p of pois) {
      const x = gx2s(p.x), y = gy2s(p.y), rPx = p.r * sc, f = belts.get(p.id);
      if (x < -rPx - 40 || y < -rPx - 40 || x > innerWidth + rPx + 40 || y > innerHeight + rPx + 40) continue;
      if (!f && !poiShown(p, sc)) continue;
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
        drawProps(f, sc);
      }
      if (p.ax != null) { if (showAnchor(p, sc) && ships.some((x) => x.mine && !x.docked && window.Atamus.inPoi(x, p))) drawAnchor(p); continue; }   // a celestial: the body is its marker; (owner) its anchor marker only once one of your ships is inside it
      const mapIcon = mapIcons[p.kind] || mapIcons.belt;
      if (!p.hidden && mapIcon.naturalWidth) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = rPx > 200 ? 0.5 : 1; ctx.drawImage(mapIcon, Math.round(x - mapIcon.naturalWidth / 2), Math.round(y - mapIcon.naturalHeight / 2)); ctx.restore(); }
    }
    for (const [id, f] of belts) if (!poiById.has(id)) drawProps(f, sc);   // (owner) someone's station you've flown to: there, though not on your map
  }
  // a planet's or moon's anchor icon shows once it's clear of the body on screen (zoomed out, the body itself is what you click)
  function showAnchor(p, sc) { const c = celestialById(p.id); return !!c && Math.hypot(p.ax - c.x, p.ay - c.y) * sc - bodyPx(c, sc) > 14; }
  function drawAnchor(p) { const ic = mapIcons.planet; if (!ic.naturalWidth) return; ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 0.8; ctx.drawImage(ic, Math.round(gx2s(p.ax) - ic.naturalWidth / 2), Math.round(gy2s(p.ay) - ic.naturalHeight / 2)); ctx.restore(); }
  function drawProps(f, sc) {                        // a POI's props (the Library's, the stations): space objects at true size
    for (const o of f.props || []) {
      const px = gx2s(o.x), py = gy2s(o.y), w = o.w * sc, h = o.h * sc;
      if (px < -w || py < -h || px > innerWidth + w || py > innerHeight + h || w < 1.5) continue;
      const a = img("assets/" + o.sprite); if (!a.naturalWidth) continue;
      ctx.save(); ctx.imageSmoothingEnabled = w > 48; ctx.drawImage(a, px - w / 2, py - h / 2, w, h); ctx.restore();
    }
  }
  // the picked asteroid (owner): gray corner brackets, its ore's name and its distance from the selected pilot's ship
  function drawPicked(ships) {
    if (!picked) return;
    const own = ships.find((s) => s.mine && s.pilot === selPilot);
    let x, y, r, name, dist;
    if (picked.kind === "prop") {                     // a Library prop: brackets around its art
      const p = propById(picked.id); if (!p) { picked = null; return; }
      x = gx2s(p.x); y = gy2s(p.y); r = Math.max(9, Math.max(p.w, p.h) * scale() * 0.55); name = p.name;
      dist = own ? Math.max(0, Math.hypot(Math.max(0, Math.abs(own.x - p.x) - p.w / 2), Math.max(0, Math.abs(own.y - p.y) - p.h / 2)) - shipR(own)) : null;
    } else if (picked.kind === "wreck") {             // (owner) a wreck: its name and distance
      const w = wreckById(picked.id); if (!w) { picked = null; return; }
      x = gx2s(w.x); y = gy2s(w.y); r = Math.max(9, WRECK_KM * scale() * 0.55); name = w.n; dist = rangeTo("wreck", w.id);
    } else {
      const k = picked.kind === "rock" && rockById(picked.id); if (!k) { picked = null; return; }
      x = gx2s(k.x); y = gy2s(k.y); r = Math.max(9, k.size / 1000 * scale() * 0.55);
      const o = ((cfg && cfg.ores) || []).find((q) => q.key === k.ore); name = o ? o.name : k.ore;
      dist = own ? Math.max(0, Math.hypot(own.x - k.x, own.y - k.y) - k.size / 2000 - shipR(own)) : null;
    }
    ctx.save(); ctx.strokeStyle = "rgba(200,206,216,0.85)"; ctx.lineWidth = 1.5; const c = Math.min(8, r * 0.5);   // (owner) gray = selected; orange is kept for targeted
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(x + sx * r, y + sy * (r - c)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - c), y + sy * r); ctx.stroke(); }
    ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(230,235,245,0.95)"; ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 3;
    ctx.fillText(name + (dist != null ? " - " + (dist < 10 ? dist.toFixed(1) : Math.round(dist)) + " km" : ""), x, y - r - 6);
    ctx.restore();
  }
  // locked targets (owner: orange = targeted): orange corner brackets, blinking while the lock comes on; hovering a
  // target on the HUD draws a thin, faint gray line from your ship to it
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
  // (owner) modules at work: a mining laser's beam from the ship to its rock; a pair of mining drones circling the rock
  // (owner) a drone looks like what it carries (the owner's drone icons)
  const droneArt = (dm) => { const m = (cfg && cfg.modules && cfg.modules[dm]) || {}, f = m.sys || (m.kind === "mining" ? "mining" : ""); return img("assets/icons/modules/drone" + (f ? "_" + f : "") + ".png"); };
  // (owner) a laser's beam leaves the hull from one of its 4 hardpoints and holds a spot inside the rock for the cycle;
  // a small square (the cycle's ore) rides it from the rock to the ship as the cycle runs. Mining drones circle the rock
  // along its no-destination line, facing it.
  // ---- celestials (owner): the sun at the center, planets on orbit lines around it, moons on orbit lines around their
  // planets (nothing actually moves); each planet's and moon's anchor (its POI) sits just off it ----
  const celestials = () => (cfg && cfg.celestials) || { sun: null, planets: [] };
  function drawSun(now) {
    if (!window.SunFX) return;
    if (!cfg || !cfg.celestials) { window.SunFX.clear(); return; }
    // far off-screen (zoomed in somewhere), only its glow reaches in from that side
    const W = innerWidth, H = innerHeight, dxs = gx2s(0) - W / 2, dys = gy2s(0) - H / 2, ds = Math.hypot(dxs, dys), lim = Math.hypot(W, H) * 0.75, k = ds > lim ? lim / ds : 1;
    window.SunFX.render(W / 2 + dxs * k, H / 2 + dys * k, SUN_BRIGHTNESS * (k < 1 ? 0.7 : 1), now / 1000);
  }
  const onScreenRing = (x, y, r) => { const d = Math.hypot(x - innerWidth / 2, y - innerHeight / 2); return Math.abs(d - r) < Math.hypot(innerWidth, innerHeight) / 2 + 2 && r < 3e6; };
  function ring(x, y, r, color) { if (!onScreenRing(x, y, r)) return; ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  const bodyPx = (c, sc) => Math.max(c.kind === "moon" ? 1.5 : 3, c.r * sc);
  // (owner) a ringed planet's rings: Saturn's bright and banded, the others faint
  function drawRings(p, sc) {
    const R = p.rings, x = gx2s(p.x), y = gy2s(p.y), ri = R.in * sc, ro = R.out * sc; if (ro < 2) return;
    if (x + ro < 0 || y + ro < 0 || x - ro > innerWidth || y - ro > innerHeight) return;
    ctx.save();
    const g = ctx.createRadialGradient(x, y, ri, x, y, ro);
    if (R.bright) { g.addColorStop(0, "rgba(160,140,110,0.18)"); g.addColorStop(0.25, "rgba(215,195,160,0.45)"); g.addColorStop(0.55, "rgba(230,212,175,0.55)"); g.addColorStop(0.62, "rgba(40,35,30,0.1)"); g.addColorStop(0.68, "rgba(220,200,165,0.45)"); g.addColorStop(1, "rgba(200,180,150,0.2)"); }
    else { g.addColorStop(0, "rgba(170,175,190,0.05)"); g.addColorStop(0.5, "rgba(170,175,190,0.16)"); g.addColorStop(1, "rgba(170,175,190,0.05)"); }
    ctx.fillStyle = g;
    if (ro < BIG_PX) { ctx.beginPath(); ctx.arc(x, y, ro, 0, Math.PI * 2); ctx.arc(x, y, Math.max(0, ri), 0, Math.PI * 2, true); ctx.fill("evenodd"); }
    else if (bodyPath(x, y, ro)) { ctx.clip(); if (bodyPath(x, y, ri)) { ctx.rect(-10, -10, innerWidth + 20, innerHeight + 20); ctx.clip("evenodd"); } ctx.fillRect(0, 0, innerWidth, innerHeight); }   // (huge on screen: only what shows)
    ctx.restore();
  }
  function drawCelestials() {
    const sc = scale(), cc = celestials();
    if (cc.sun) { const r = cc.sun.r * sc, x = gx2s(0), y = gy2s(0);   // (the Sun's disc, once it's big enough to see; its glow is SunFX)
      if (r > 6 && x + r > 0 && y + r > 0 && x - r < innerWidth && y - r < innerHeight) { ctx.save(); const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, "rgba(255,252,235,1)"); g.addColorStop(0.8, "rgba(255,226,150,1)"); g.addColorStop(1, "rgba(255,180,80,0.9)"); ctx.fillStyle = g; if (bodyPath(x, y, r)) ctx.fill(); ctx.restore(); } }
    for (const p of cc.planets) if (p.rings) drawRings(p, sc);   // (owner: no orbit lines)
    for (const p of cc.planets) for (const c of [p, ...p.moons]) {
      const x = gx2s(c.x), y = gy2s(c.y), r = bodyPx(c, sc);
      if (x < -r * 1.3 || y < -r * 1.3 || x > innerWidth + r * 1.3 || y > innerHeight + r * 1.3) continue;
      if (c.kind === "moon" && !c.major && c.r * sc < 1.5) { ctx.fillStyle = "rgba(190,195,205,0.55)"; ctx.fillRect(x - 0.5, y - 0.5, 1, 1); continue; }   // (a small moon far off: a speck)
      if (r < 6) { ctx.fillStyle = BODY_DOT[c.world] || "#9aa"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); continue; }   // (small on screen: a plain disc; no texture to make)
      drawPlanet(x, y, r, c);
    }
  }
  const BODY_DOT = { Ocean: "#4f86c6", Desert: "#c79a6a", Ice: "#cfe3ee", "Gas giant": "#c9a27e" };
  // procedural worlds: a texture per body (its seed and kind pick the look), lit from the sun at the center (before the reset)
  const planetTex = new Map();
  const PLANET_KINDS = {
    Ocean: { stops: [[0, "#1d3f6e"], [0.48, "#2f6aa3"], [0.52, "#c9b98a"], [0.6, "#4f7a3c"], [0.8, "#6d6a4a"], [1, "#e8eef2"]], atm: "120,180,255", bands: 0 },
    Desert: { stops: [[0, "#7a4a2a"], [0.4, "#b07443"], [0.7, "#d8a66a"], [1, "#f0d9a8"]], atm: "255,190,130", bands: 0.25 },
    Ice: { stops: [[0, "#8fb4c9"], [0.5, "#cfe3ee"], [1, "#ffffff"]], atm: "200,230,255", bands: 0.1 },
    "Gas giant": { stops: [[0, "#5a3d6e"], [0.3, "#a3735a"], [0.55, "#d9b48a"], [0.8, "#8a5a7a"], [1, "#e8c9a0"]], atm: "230,180,160", bands: 1 },
  };
  function planetTexture(seed, world) {
    const key = seed + ":" + world; if (planetTex.has(key)) return planetTex.get(key);
    const N = 256, c = document.createElement("canvas"); c.width = c.height = N;
    const g = c.getContext("2d"), img = g.createImageData(N, N), kind = PLANET_KINDS[world] || PLANET_KINDS.Desert;
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
    g.putImageData(img, 0, 0); const out = { c, kind }; planetTex.set(key, out); return out;
  }
  // (a body far bigger than the screen, zoomed in on it: only the part that shows is drawn, as a polygon along its
  // visible edge; drawing it whole at that size stalls the browser)
  const BIG_PX = 3000;
  function bodyPath(x, y, r) {
    ctx.beginPath();
    if (r < BIG_PX) { ctx.arc(x, y, r, 0, Math.PI * 2); return true; }
    const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2, dist = Math.hypot(cx - x, cy - y), diag = Math.hypot(W, H) / 2 + 20;
    if (dist - diag > r) return false;                       // nowhere on screen
    if (dist + diag < r) { ctx.rect(-10, -10, W + 20, H + 20); return true; }   // the whole screen inside it
    const phi = Math.atan2(cy - y, cx - x), span = Math.min(Math.PI, 2.2 * diag / r + 0.002), n = 96;
    for (let k = 0; k <= n; k++) { const a = phi - span + 2 * span * k / n; (k ? ctx.lineTo : ctx.moveTo).call(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.lineTo(x + Math.cos(phi) * (r - 3 * diag), y + Math.sin(phi) * (r - 3 * diag)); ctx.closePath();   // (closed well inside it, off screen)
    return true;
  }
  function drawPlanet(x, y, rPx, b) {
    const { c, kind } = planetTexture(b.kind === "moon" && !b.major ? 900 + ((b.seed || 1) % 6) : b.seed || 1, b.world);   // (small moons share a few looks: each texture takes a moment to make)
    const d = Math.hypot(b.x, b.y) || 1, lx = -b.x / d, ly = b.y / d, big = rPx >= BIG_PX, W = innerWidth, H = innerHeight;   // toward the sun (screen y is down)
    ctx.save();
    if (!big) { const atm = ctx.createRadialGradient(x, y, rPx * 0.9, x, y, rPx * 1.25); atm.addColorStop(0, "rgba(" + kind.atm + ",0.35)"); atm.addColorStop(1, "rgba(" + kind.atm + ",0)");
      ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(x, y, rPx * 1.25, 0, Math.PI * 2); ctx.fill(); }
    if (!bodyPath(x, y, rPx)) { ctx.restore(); return; }
    ctx.clip(); ctx.imageSmoothingEnabled = true;
    if (!big) ctx.drawImage(c, x - rPx, y - rPx, rPx * 2, rPx * 2);
    else {                                                   // just the texture under the screen
      const N = c.width, k = N / (2 * rPx), sx = Math.max(0, (0 - (x - rPx)) * k), sy = Math.max(0, (0 - (y - rPx)) * k), ex = Math.min(N, (W - (x - rPx)) * k), ey = Math.min(N, (H - (y - rPx)) * k);
      if (ex > sx && ey > sy) ctx.drawImage(c, sx, sy, Math.max(0.01, ex - sx), Math.max(0.01, ey - sy), x - rPx + sx / k, y - rPx + sy / k, (ex - sx) / k, (ey - sy) / k);
    }
    const sh = ctx.createRadialGradient(x + lx * rPx * 0.45, y + ly * rPx * 0.45, rPx * 0.15, x + lx * rPx * 0.2, y + ly * rPx * 0.2, rPx * 1.45);
    sh.addColorStop(0, "rgba(255,250,240,0.12)"); sh.addColorStop(0.45, "rgba(0,0,0,0.1)"); sh.addColorStop(0.75, "rgba(0,0,8,0.7)"); sh.addColorStop(1, "rgba(0,0,8,0.95)");
    ctx.fillStyle = sh; if (big) ctx.fillRect(0, 0, W, H); else ctx.fillRect(x - rPx, y - rPx, rPx * 2, rPx * 2);
    ctx.restore();
  }
  // the planet or moon under the pointer (its body), for its menu
  function celestialAt(px, py) {
    const sc = scale(); let best = null, bd = Infinity;
    for (const c of allCelestials()) { const d = Math.hypot(px - gx2s(c.x), py - gy2s(c.y)), r = Math.max(8, bodyPx(c, sc)); if (d <= r && d < bd) { bd = d; best = c; } }
    return best;
  }
  const allCelestials = () => { const cc = celestials(), out = cc.sun ? [cc.sun] : []; for (const p of cc.planets) out.push(p, ...p.moons); return out; };
  const celestialById = (id) => allCelestials().find((c) => c.id === id) || null;
  // a planet's or moon's options: warp / align to its anchor, Info
  const celestialItems = (c) => { const poi = poiById.get(c.id); return [...(poi ? poiItems(poi) : []), ["Info", () => bus.dispatchEvent(new CustomEvent("objinfo", { detail: { kind: "celestial", id: c.id } }))]]; };

  // (owner) the selected ship's targeting range (a faint gray dash-dot ring) and, fainter, one dashed ring per kind of
  // fitted module that works on a target; the one under the pointer on the hotbar / Fitting lights up orange
  function drawRanges(own) {
    if (!own || own.docked || own.warp) return;
    const T = hull(own.type), sc = scale(), x = gx2s(own.x), y = gy2s(own.y), rr = T.radiusKm || 0.09, far = Math.hypot(innerWidth, innerHeight) * 3;
    const ring = (km, dash, color, w) => { const r = (km + rr) * sc; if (r < 10 || r > far) return; ctx.save(); ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); };
    const c0 = own.calc || {}; if (c0.targetRange || T.targetRangeKm) ring(c0.targetRange || T.targetRangeKm, [10, 5, 2, 5], "rgba(170,178,190,0.32)", 1);
    let hv = window.Atamus.hoverModule; if (hv && !hv.el.isConnected) hv = window.Atamus.hoverModule = null;
    const mods = (cfg && cfg.modules) || {}, seen = new Set(), c = own.calc || {};
    ((own.fit && own.fit.active) || []).forEach((k, i) => {
      const m = mods[k]; if (!m || !m.rangeKm || seen.has(k)) return; seen.add(k);
      const mc = (c.mods || [])[i], hot = hv && hv.key === k;
      ring((mc && mc.rangeKm) || m.rangeKm, [4, 7], hot ? "rgba(255,150,60,0.75)" : "rgba(170,178,190,0.12)", hot ? 1.5 : 1);
    });
  }
  // (owner) what a pilot says in Local floats over their ship for anyone with a ship near it
  const BUBBLE_MS = 7000, BUBBLE_NEAR_KM = 150, bubbles = new Map();
  bus.addEventListener("chat", (e) => { const m = e.detail; if (m && m.ch === "local") for (const id of m.ships || []) bubbles.set(id, { text: m.text, at: performance.now() }); });
  function drawBubbles(ships) {
    if (!bubbles.size) return;
    const now = performance.now(), mine = ships.filter((s) => s.mine && !s.docked), sc = scale();
    for (const [id, bb] of bubbles) {
      const age = now - bb.at; if (age > BUBBLE_MS) { bubbles.delete(id); continue; }
      const s = ships.find((x) => x.id === id); if (!s || s.docked || !mine.some((o) => Math.hypot(o.x - s.x, o.y - s.y) <= BUBBLE_NEAR_KM)) continue;
      const x = gx2s(s.x), y = gy2s(s.y) - Math.max(14, hull(s.type).lengthKm * sc * 0.6) - 10;
      ctx.save(); ctx.globalAlpha = Math.min(1, (BUBBLE_MS - age) / 800, age / 150); ctx.font = "12px Inter, system-ui, sans-serif";
      const words = bb.text.split(" "), lines = []; let line = "";
      for (const w of words) { const tl = line ? line + " " + w : w; if (ctx.measureText(tl).width > 200 && line) { lines.push(line); line = w; } else line = tl; } if (line) lines.push(line);
      const shown = lines.slice(0, 4); if (lines.length > 4) shown[3] += "…";
      const W = Math.min(216, Math.max(...shown.map((l) => ctx.measureText(l).width)) + 16), H = shown.length * 15 + 10, bx = x - W / 2, by = y - H;
      ctx.fillStyle = "rgba(12,18,30,0.88)"; ctx.strokeStyle = s.mine ? "rgba(120,180,255,0.55)" : "rgba(255,130,130,0.5)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, by, W, H, 6); ctx.moveTo(x - 5, by + H); ctx.lineTo(x, by + H + 6); ctx.lineTo(x + 5, by + H); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#dfe6f2"; ctx.textAlign = "center"; ctx.textBaseline = "top"; shown.forEach((l, i) => ctx.fillText(l, x, by + 6 + i * 15));
      ctx.restore();
    }
  }
  // a square of the rock's ore riding a beam from (fx, fy) to (tx, ty), p of the way through the cycle
  function drawChunk(fx, fy, tx, ty, p, color, qs) {
    ctx.save(); ctx.translate(fx + (tx - fx) * p, fy + (ty - fy) * p); ctx.rotate(p * 6); ctx.fillStyle = color || "#b9a98c"; ctx.fillRect(-qs / 2, -qs / 2, qs, qs); ctx.strokeStyle = "rgba(255,225,180,0.85)"; ctx.lineWidth = 1; ctx.strokeRect(-qs / 2, -qs / 2, qs, qs); ctx.restore();
  }
  // (owner) mining drones. How far along a flight between the ship and something dk km away they are, tau ms in: fast
  // out there, slower within DRONE.nearKm of the ship (toShip: they start far and finish near)
  function legFrac(tau, dk, toShip) {
    const D = (cfg && cfg.drone) || { nearKm: 5, nearKmps: 0.75, farKmps: 2 }, s = Math.max(0, tau) / 1000, nearD = Math.min(dk, D.nearKm), farD = Math.max(0, dk - D.nearKm);
    let d;
    if (toShip) { const T1 = farD / D.farKmps; d = s < T1 ? s * D.farKmps : farD + (s - T1) * D.nearKmps; }
    else { const T1 = nearD / D.nearKmps; d = s < T1 ? s * D.nearKmps : nearD + (s - T1) * D.farKmps; }
    return dk > 0 ? Math.min(1, d / dk) : 1;
  }
  // a pair of drones: circling their rock with a beam to its center (ore squares riding it); flying to another rock;
  // or hauling: out to the ship carrying the ore, twice round it streaming the ore in, then back out (recalled: they stay in)
  function drawDrones(sh, b, n, { sx, sy, sc, now, t, rt, T, qs, ores }) {
    const art = droneArt(b.dm), w = Math.max(5, 0.064 * sc), hgt = art.naturalWidth ? w * art.naturalHeight / art.naturalWidth : w / 2;
    const rad = T.radiusKm || 0.09, Rs = Math.max(10, (rad + 0.06) * sc), cl = (st) => (now + (st - rt)) / 1000;   // a server moment, in this page's seconds
    const N = Math.max(1, Math.min(8, b.n || 2));        // (owner) as many drones as went out
    const orbitAt = (wx, wy, size, d, sec) => { const R = (size / 2000 + rad + 0.07) * sc, a = sec * 0.25 + d * 2 * Math.PI / N + n * 0.7; return [gx2s(wx) + Math.cos(a) * R, gy2s(wy) + Math.sin(a) * R, a]; };
    const lerp = (a, b, f) => a + (b - a) * f, D = (cfg && cfg.drone) || { nearKmps: 0.75 };
    const put = (x, y, face, carry, color) => {
      if (art.naturalWidth) { ctx.save(); ctx.translate(x, y); ctx.rotate(face); ctx.imageSmoothingEnabled = w > 24; ctx.drawImage(art, -w / 2, -hgt / 2, w, hgt); ctx.restore(); }
      if (carry) { const cx = x + Math.cos(face) * w * 0.6, cy = y + Math.sin(face) * w * 0.6; drawChunk(cx, cy, cx, cy, 0, color, qs * 0.8); }   // the ore, carried at its nose
    };
    if (b.h0 != null) {                                  // hauling
      const tau = rt - b.h0, lg = b.lg || 1000, dp = b.dp || 0, o = ores.get(b.ore), color = o && o.color;
      for (let d = 0; d < N; d++) {
        const side = Math.atan2(gy2s(b.ry) - sy, gx2s(b.rx) - sx) + (d - (N - 1) / 2) * 0.4, rx0 = sx + Math.cos(side) * Rs, ry0 = sy + Math.sin(side) * Rs;
        if (tau < lg) {                                  // out to the ship
          const [x0, y0] = orbitAt(b.rx, b.ry, b.rs, d, cl(b.h0)), f = legFrac(tau, b.dk || 0, true);
          put(lerp(x0, rx0, f), lerp(y0, ry0, f), Math.atan2(ry0 - y0, rx0 - x0), b.amt > 0, color);
        } else if (tau < lg + dp) {                      // (owner) twice round the ship, streaming the ore in
          const u = (tau - lg) / dp, a = side + u * Math.PI * 4, x = sx + Math.cos(a) * Rs, y = sy + Math.sin(a) * Rs;
          for (let j = 0; j < 5; j++) { const f = (u * 12 + j / 5) % 1, ue = u - f / 12; if (ue < 0 || ue > 0.85) continue; const qx = lerp(x, sx, f), qy = lerp(y, sy, f); drawChunk(qx, qy, qx, qy, 0, color, qs * 0.55); }
          put(x, y, a + Math.PI / 2, false);
        } else if (b.rc) continue;                       // recalled: they're in
        else if (b.bk) {                                 // back out to their rock
          const [x1, y1] = orbitAt(b.bk.rx, b.bk.ry, b.bk.rs, d, cl(b.h0 + lg + dp + b.bk.lg)), f = legFrac(tau - lg - dp, b.bk.dk || 0, false);
          put(lerp(rx0, x1, f), lerp(ry0, y1, f), Math.atan2(y1 - ry0, x1 - rx0), false);
        } else put(rx0, ry0, side + Math.PI / 2, false); // (a moment at the ship while the next leg is worked out)
      }
      return;
    }
    const k = rockById(b.tg);
    if (!k) {                                            // (owner) weapon drones: out to the ship they're after, circling it and firing
      const tg = drawn.find((x) => x.id === b.tg); if (!tg) return;
      const tx = gx2s(tg.x), ty = gy2s(tg.y), tsize = (hull(tg.type).lengthKm || 0.13) * 1000;
      for (let d = 0; d < N; d++) {
        const [x1, y1, a] = orbitAt(tg.x, tg.y, tsize, d, t);
        let f = 1; if (b.rt) f = 1 - Math.max(0, Math.min(1, (rt - b.rt.t0) / (b.rt.lg || 1000))); else if (b.t0 != null && rt < b.t0) f = 1 - Math.max(0, Math.min(1, (b.t0 - rt) / 3000));
        const x = lerp(sx, x1, f), y = lerp(sy, y1, f);
        if (f >= 1 && b.t0 != null) drawShot(b.dm, x, y, tx, ty, rt - (b.t0 + Math.floor(Math.max(0, rt - b.t0) / (b.c || 4000)) * (b.c || 4000)), b);
        put(x, y, f >= 1 ? a + Math.PI : Math.atan2(y1 - sy, x1 - sx), false);
      }
      return;
    }
    const o = ores.get(k.ore);
    if (b.fx != null && b.t0 != null && rt < b.t0) {     // flying over from the rock they were on
      const dist = Math.hypot(k.x - b.fx, k.y - b.fy), fly = dist / D.nearKmps * 1000, f = Math.max(0, Math.min(1, 1 - (b.t0 - rt) / Math.max(1, fly)));
      for (let d = 0; d < N; d++) {
        const [x0, y0] = orbitAt(b.fx, b.fy, b.fs || k.size, d, cl(b.t0 - fly)), [x1, y1] = orbitAt(k.x, k.y, k.size, d, cl(b.t0));
        put(lerp(x0, x1, f), lerp(y0, y1, f), Math.atan2(y1 - y0, x1 - x0), false);
      }
      return;
    }
    const rx = gx2s(k.x), ry = gy2s(k.y), p = Math.max(0, Math.min(1, b.t0 != null ? (rt - b.t0) / (b.c || 60000) : (b.p || 0)));
    for (let d = 0; d < N; d++) {
      const [x, y, a] = orbitAt(k.x, k.y, k.size, d, t);
      ctx.save(); ctx.strokeStyle = "rgba(90,180,255," + (0.35 + 0.25 * Math.sin(t * 9 + d)) + ")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(rx, ry); ctx.stroke(); ctx.restore();   // (owner) to the rock's center
      drawChunk(rx, ry, x, y, p, o && o.color, qs * 0.8);   // (owner) the drone's yield rides its beam too
      put(x, y, a + Math.PI, false);                     // nose toward the rock
    }
  }
  function drawBeams(ships) {
    const sc = scale(), now = performance.now(), t = now / 1000, ores = oreBy(), rt = renderTime();
    for (const sh of ships) {
      if (!sh.beams || sh.docked || sh.warp) continue;
      const T = hull(sh.type), L = (T.lengthKm || 0.128) * sc, hps = T.hardpoints || [[0, 0]], ch = Math.cos(-sh.h), sn = Math.sin(-sh.h);
      const sx = gx2s(sh.x), sy = gy2s(sh.y);
      let n = 0;
      for (const b of sh.beams) {
        const qs = Math.max(2.5, Math.min(6, L * 0.12));
        const mm = (cfg.modules || {})[b.m] || {}, kind = b.m === "eta_gun" ? "eta_gun" : mm.kind;
        if (kind === "drones") { drawDrones(sh, b, n, { sx, sy, sc, now, t, rt, T, qs, ores }); n++; continue; }
        const hp0 = hps[b.hp] || hps[0], hx = sx + (hp0[0] * ch - hp0[1] * sn) * L, hy = sy + (hp0[0] * sn + hp0[1] * ch) * L;
        if (kind !== "mining") {                         // (owner, combat) weapons and the rest: at a ship (a tractor beam: a wreck)
          const tg = kind === "tractor" ? wreckById(b.tg) : drawn.find((x) => x.id === b.tg); if (!tg) continue;
          const tx = gx2s(tg.x), ty = gy2s(tg.y), age = rt - (b.t0 || 0);
          if (kind === "weapon" || kind === "eta_gun") drawShot(kind === "eta_gun" ? "eta_gun" : b.m, hx, hy, tx, ty, age, b);
          else drawLink(kind, hx, hy, tx, ty, t);
          n++; continue;
        }
        const k = rockById(b.tg); if (!k) continue;
        const p = Math.max(0, Math.min(1, b.t0 != null ? (rt - b.t0) / (b.c || 15000) : (b.p || 0) + (now - snapAt) / (b.c || 15000))), o = ores.get(k.ore);
        const hp = hps[b.hp] || hps[0], ox = sx + (hp[0] * ch - hp[1] * sn) * L, oy = sy + (hp[0] * sn + hp[1] * ch) * L;
        const ex = gx2s(k.x + (b.ax || 0)), ey = gy2s(k.y + (b.ay || 0));
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.strokeStyle = "rgba(60,150,255,0.38)"; ctx.lineWidth = 3.5 + Math.sin(t * 14 + n); ctx.stroke();   // (owner) mining lasers are blue
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.strokeStyle = "rgba(190,225,255,0.92)"; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey, 2.2, 0, Math.PI * 2); ctx.fillStyle = "rgba(210,235,255,0.85)"; ctx.fill();
        ctx.restore();
        drawChunk(ex, ey, ox, oy, p, o && o.color, qs);
        n++;
      }
    }
  }
  // (owner, combat) a weapon's shot from (x, y) to (tx, ty), `age` ms after it fired: a beam laser's burn, a railgun's
  // streak, a slug cannon's tracers, a missile flying in; the ETA's guns are blue beams
  function drawShot(key, x, y, tx, ty, age, b) {
    const fam = key === "eta_gun" ? "eta_gun" : ((cfg.modules || {})[key] || {}).sys; if (!(age >= 0)) return;   // (owner, The Reach) missile, beam, repeater, coilgun
    const flash = (a, r, col) => { ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.fillStyle = col.replace("A", a); ctx.fill(); };
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    if (fam === "beam" || fam === "eta_gun") {
      const a = fam === "beam" ? (age < (b.c || 1000) + 400 ? 0.75 + 0.15 * Math.sin(performance.now() / 60) : 0) : Math.max(0, 1 - age / 450); if (a > 0) { const c = fam === "eta_gun" ? "90,170,255" : "255,90,60";   // (a beam is continuous)
        ctx.strokeStyle = "rgba(" + c + "," + 0.4 * a + ")"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = "rgba(255,235,220," + 0.9 * a + ")"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke(); flash(a * 0.8, 3, "rgba(" + c + ",A)"); }
    } else if (fam === "coilgun") {
      const a = Math.max(0, 1 - age / 250); if (a > 0) { ctx.strokeStyle = "rgba(170,230,255," + a + ")"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke(); flash(a, 4, "rgba(220,245,255,A)"); }
    } else if (fam === "repeater") {
      for (let j = 0; j < 3; j++) { const f = (age - j * 70) / 220; if (f < 0 || f > 1) continue; ctx.fillStyle = "rgba(255,210,110,0.95)"; ctx.fillRect(x + (tx - x) * f - 1.5, y + (ty - y) * f - 1.5, 3, 3); }
      if (age > 220 && age < 400) flash(1 - (age - 220) / 180, 3, "rgba(255,200,120,A)");
    } else if (fam === "missile") {
      const fl = b.fl || 1500, f = age / fl;
      if (f >= 0 && f <= 1) { const mx = x + (tx - x) * f, my = y + (ty - y) * f; ctx.fillStyle = "rgba(255,170,80,0.95)"; ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(255,140,60,0.4)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - (tx - x) * 0.04, my - (ty - y) * 0.04); ctx.stroke(); }
      else if (f > 1 && age < fl + 250) flash(1 - (age - fl) / 250, 5, "rgba(255,160,70,A)");
    }
    ctx.restore();
  }
  // modules that hold on to a target while they run: remote shield / hull repair (green), tractor beams (cyan), warp
  // scramblers (red) and webifiers (purple)
  function drawLink(kind, x, y, tx, ty, t) {
    const col = kind === "tractor" ? "120,220,255" : kind === "scram" ? "255,90,90" : kind === "web" ? "190,120,255" : "110,230,140";
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.setLineDash(kind === "tractor" ? [6, 4] : [3, 5]); ctx.lineDashOffset = -t * 20;
    ctx.strokeStyle = "rgba(" + col + "," + (0.35 + 0.2 * Math.sin(t * 6)) + ")"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.restore();
  }
  function drawWarps(ships) {                       // a ship in warp leaves a fading streak back toward where it entered
    for (const sh of ships) {
      if (!sh.warp || (sh.npc && window.Atamus.adminMode)) continue;   // (owner) admins see the ETA as dots, no trails
      const x = gx2s(sh.x), y = gy2s(sh.y), fx = gx2s(sh.warp.fx), fy = gy2s(sh.warp.fy), L = Math.hypot(x - fx, y - fy); if (L < 2) continue;
      const k = Math.min(1, 160 / L), sx = x + (fx - x) * k, sy = y + (fy - y) * k, g = ctx.createLinearGradient(x, y, sx, sy);
      g.addColorStop(0, sh.mine ? "rgba(120,200,255,0.9)" : "rgba(255,120,120,0.9)"); g.addColorStop(1, "rgba(120,200,255,0)");
      ctx.save(); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(sx, sy); ctx.stroke(); ctx.restore();
    }
  }
  // (owner) a hangar's mouth: everything is drawn but the inside of the hangar (from its front, inward, as wide as it is)
  function maskHangar(dk) {
    const o = propById(dk.prop), h = o && o.hangars && o.hangars[dk.i]; if (!h) return;
    const fx = o.x + h.ox, fy = o.y + h.oy, nx = Math.cos(h.out), ny = Math.sin(h.out), ux = -ny * h.half, uy = nx * h.half;
    const pts = [[fx + ux, fy + uy], [fx - ux, fy - uy], [fx - ux - nx * h.depth, fy - uy - ny * h.depth], [fx + ux - nx * h.depth, fy + uy - ny * h.depth]];
    ctx.beginPath(); ctx.rect(-10, -10, innerWidth + 20, innerHeight + 20);
    pts.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, gx2s(x), gy2s(y))); ctx.closePath(); ctx.clip("evenodd");
  }
  function drawShips(ships) {
    const sc = scale();
    for (const sh of ships) {
      if (sh.docked) continue;                       // (owner) a docked ship is out of space
      const sx = gx2s(sh.x), sy = gy2s(sh.y);
      if (sh.mine && sh.moving && sh.tx != null && !sh.dest && !(sh.chase && sh.chase.mode === "orbit")) {   // where it's headed (drawn even with the ship off screen; owner: not while orbiting)
        const tx = gx2s(sh.tx), ty = gy2s(sh.ty);
        ctx.save(); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty);
        ctx.strokeStyle = "rgba(200,205,215,0.28)"; ctx.lineWidth = 1; ctx.setLineDash([4, 5]); ctx.stroke();
        ctx.setLineDash([]); ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, Math.PI * 2); ctx.fillStyle = "rgba(200,205,215,0.5)"; ctx.fill(); ctx.restore();
      }
      if (sx < -80 || sy < -80 || sx > innerWidth + 80 || sy > innerHeight + 80) continue;
      const T = hull(sh.type), wPx = T.lengthKm * sc, art = shipArt(sh.type, sh.mine), ic = shipIcon(sh.type, sh.mine);
      if (sh.npc && window.Atamus.adminMode && wPx < 10) { etaDot(sx, sy, 1); continue; }   // (owner) admins: the ETA as small blue dots
      if (sh.wi) warpIn(sh, sx, sy, Math.max(wPx, 30));    // (owner) an admin's ship uncloaking: it warps in
      ctx.save();
      if (sh.wi) ctx.globalAlpha = Math.max(0, Math.min(1, 1 - (sh.wi - 600) / 1400));
      if (sh.cloak) ctx.globalAlpha = 0.35;             // (your own admin ship, cloaked)
      if (sh.dk) maskHangar(sh.dk);                    // (owner) flying into / out of a hangar: hidden past its front
      ctx.translate(sx, sy); ctx.rotate(-sh.h);  // sprites face +x; world +y is up
      if (wPx < 10 && ic.naturalWidth) { ctx.imageSmoothingEnabled = false; ctx.drawImage(ic, -ic.naturalWidth / 2, -ic.naturalHeight / 2); }   // zoomed out: its hull icon
      else if (art.naturalWidth) { const hPx = wPx * art.naturalHeight / art.naturalWidth; ctx.imageSmoothingEnabled = wPx > 48; ctx.drawImage(art, -wPx / 2, -hPx / 2, wPx, hPx); }
      else { ctx.fillStyle = sh.mine ? "#4fd2ff" : "#ff5a5a"; ctx.fillRect(-Math.max(2, wPx) / 2, -Math.max(1, wPx / 4), Math.max(2, wPx), Math.max(2, wPx / 2)); }
      ctx.restore();
    }
  }

  // (owner) admins in admin mode: ETA ships zoomed out are small blue dots, and where a warping one is headed another
  function etaDot(x, y, a) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = "rgba(90,170,255,1)"; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  function drawEtaGoals(ships) {
    if (!window.Atamus.adminMode) return;
    for (const sh of ships) if (sh.npc && sh.warp) etaDot(gx2s(sh.warp.tx), gy2s(sh.warp.ty), 0.55);
  }
  // (owner) the warp-in as an admin's ship uncloaks: a blue warp window opening where it arrives (the warp effect from
  // before the reset), the ship coming out of it
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  function warpIn(sh, x, y, L) {
    const p = Math.max(0, Math.min(1, 1 - sh.wi / 2000)), alpha = p < 0.8 ? 1 : (1 - p) / 0.2, grow = Math.min(1, p / 0.15), W = L * 0.75 * (0.15 + 0.85 * grow), Tk = Math.max(3, W * 0.3), t = performance.now();
    ctx.save(); ctx.translate(x, y); ctx.rotate(-sh.h); ctx.translate(-L * 0.55 * (1 - p), 0); ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(70,160,255,0.95)"; ctx.shadowBlur = 16;
    const g = ctx.createLinearGradient(-Tk, 0, Tk, 0); g.addColorStop(0, "rgba(60,140,255,0)"); g.addColorStop(0.5, "rgba(120,200,255,0.45)"); g.addColorStop(1, "rgba(60,140,255,0)");
    ctx.fillStyle = g; ctx.fillRect(-Tk, -W, Tk * 2, W * 2);
    ctx.strokeStyle = "rgba(160,220,255,0.95)"; ctx.lineWidth = 1.5; ctx.strokeRect(-Tk / 2, -W, Tk, W * 2);
    ctx.shadowBlur = 0; ctx.fillStyle = "rgba(200,235,255,0.9)"; ctx.fillRect(-0.75, -W, 1.5, W * 2);
    for (let i = 0; i < 16; i++) { const f = (t * 0.0011 + i / 16 + hash(i) * 0.3) % 1, px = (-1 + 2 * f) * W * 1.3, py = (hash(i + 7) - 0.5) * 1.8 * W; ctx.globalAlpha = alpha * (1 - Math.abs(2 * f - 1)) * 0.9; ctx.fillStyle = "rgba(150,215,255,1)"; ctx.fillRect(px - 1, py - 1, 2, 2); }
    ctx.restore();
  }
  // (owner) red diamonds for Admins in admin mode: open help tickets and reports, at the player who asked (online only)
  const ALERT_PX = 6;
  function drawAlerts() {
    for (const a of latest.alerts || []) {
      const x = gx2s(a.x), y = gy2s(a.y); if (x < -10 || y < -10 || x > innerWidth + 10 || y > innerHeight + 10) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = "rgba(235,60,60,0.95)"; ctx.strokeStyle = "rgba(255,190,190,0.9)"; ctx.lineWidth = 1;
      ctx.fillRect(-ALERT_PX / 2 - 1, -ALERT_PX / 2 - 1, ALERT_PX + 2, ALERT_PX + 2); ctx.strokeRect(-ALERT_PX / 2 - 1, -ALERT_PX / 2 - 1, ALERT_PX + 2, ALERT_PX + 2); ctx.restore();
    }
  }
  const alertAt = (px, py) => { let best = null, bd = 10; for (const a of latest.alerts || []) { const d = Math.hypot(px - gx2s(a.x), py - gy2s(a.y)); if (d <= bd) { bd = d; best = a; } } return best; };
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
      cam.viewW += (viewWTarget - cam.viewW) * (1 - Math.exp(-(warpView ? 2.5 : 14) * dt));   // (owner) a warp's zoom out and back in is slow and smooth
      if (zoomAt && !follow) {                         // keep the point under the pointer still while the zoom eases
        const sc = scale(); cam.cx = zoomAt.wx - (zoomAt.px - innerWidth / 2) / sc; cam.cy = zoomAt.wy + (zoomAt.py - innerHeight / 2) / sc;
        if (Math.abs(viewWTarget - cam.viewW) < viewWTarget * 0.002) zoomAt = null;
      }
      if (keys.size) {                                 // WASD
        let dx = 0, dy = 0; if (keys.has("a")) dx -= 1; if (keys.has("d")) dx += 1; if (keys.has("w")) dy += 1; if (keys.has("s")) dy -= 1;
        if (dx || dy) { const l = Math.hypot(dx, dy); follow = null; lookAt = null; zoomAt = null; cam.cx += dx / l * cam.viewW * 0.9 * dt; cam.cy += dy / l * cam.viewW * 0.9 * dt; }
      }
      if (lookAt) { const p = lookPos(lookAt); if (!p) lookAt = null; else { const e = 1 - Math.exp(-12 * dt); cam.cx += (p.x - cam.cx) * e; cam.cy += (p.y - cam.cy) * e; } }   // (owner) Look At
      // (owner) the selected pilot's ship aligning to warp, or warping: the camera follows it (once: panning away stays away)
      { const sel = ships.find((s) => s.mine && s.pilot === selPilot), going = sel && (sel.warp || (sel.warpReq && sel.dest));
        if (going && warpFollowed !== sel.id) { follow = sel.id; lookAt = null; zoomAt = null; warpFollowed = sel.id; }
        if (!going) warpFollowed = null; }
      const fs = follow && ships.find((s) => s.id === follow);
      if (follow && !fs && latest.ships && !latest.ships.some((s) => s.id === follow)) follow = null;   // that ship is gone
      // (owner) following a ship through a warp: zoom smoothly all the way out and follow it across the map; as it comes
      // out of warp, zoom back in to where the zoom was
      if (fs && fs.warp) {
        if (!warpView) warpView = { w: viewWTarget };
        viewWTarget = fs.warp.p >= WARP_ZOOM_BACK ? warpView.w : fitWidth();
        const e = 1 - Math.exp(-8 * dt); cam.cx += (fs.x - cam.cx) * e; cam.cy += (fs.y - cam.cy) * e;
      }
      else if (fs) {
        if (warpView && Math.abs(cam.viewW - warpView.w) < warpView.w * 0.02) warpView = null;   // (back in: normal zooming again)
        else if (warpView) viewWTarget = warpView.w;
        const e = 1 - Math.exp(-12 * dt); cam.cx += (fs.x - cam.cx) * e; cam.cy += (fs.y - cam.cy) * e;
      }
      else if (warpView) { viewWTarget = warpView.w; warpView = null; }
      clampCamera();
      sendView(now);
    }
    drawBackground();
    drawSun(now);
    drawn = ships;
    if (cfg) { drawHex(); drawCelestials(); drawBelts(ships); drawRanges(own); drawWrecks(); drawWarps(ships); drawBeams(ships); drawShips(ships); drawEtaGoals(ships); drawAlerts(); drawTargets(ships); drawKeepOut(ships); drawPicked(ships); drawBubbles(ships); }
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
    const gr = bgCtx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.hypot(W, H) * 0.7);   // deep blue center to near black
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
      const sc = scale(), steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000]; let step = steps.find((v) => v * sc >= 70) || 1000000;   // (the system is 1.4 million km across)
      const x0 = cam.cx - W / 2 / sc, x1 = cam.cx + W / 2 / sc, y0 = cam.cy - H / 2 / sc, y1 = cam.cy + H / 2 / sc;
      bgCtx.lineWidth = 1;
      for (let gx = Math.floor(x0 / step) * step; gx <= x1; gx += step) { const x = Math.round(gx2s(gx)) + 0.5; bgCtx.strokeStyle = Math.round(gx / step) % 5 === 0 ? "rgba(140,170,220,0.07)" : "rgba(140,170,220,0.035)"; bgCtx.beginPath(); bgCtx.moveTo(x, 0); bgCtx.lineTo(x, H); bgCtx.stroke(); }
      for (let gy = Math.floor(y0 / step) * step; gy <= y1; gy += step) { const y = Math.round(gy2s(gy)) + 0.5; bgCtx.strokeStyle = Math.round(gy / step) % 5 === 0 ? "rgba(140,170,220,0.07)" : "rgba(140,170,220,0.035)"; bgCtx.beginPath(); bgCtx.moveTo(0, y); bgCtx.lineTo(W, y); bgCtx.stroke(); }
    }
  }  requestAnimationFrame(frame);
})();
