// Atamus client (back to basics, owner 2026-10-10): the Expanse's hexagon, empty, and your Prospector. Click or tap
// to fly; drag to pan; wheel or pinch to zoom; click / tap your ship to follow it again. The Player and Pilot windows
// live in ui.js. What the client did before the reset is in reference/2026-10-10-pre-reset/website/.
(() => {
  "use strict";

  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");

  let cfg = null, me = { id: null, name: "" }, ws = null;
  const bus = new EventTarget();
  // snapshots: the last few, each with the server time its positions are for; ships are drawn RENDER_DELAY_MS in
  // the past, interpolated between the two snapshots around that moment
  const RENDER_DELAY_MS = 110, snaps = []; let clockOffset = null, latest = { ships: [] };
  const cam = { cx: 0, cy: 0, viewW: 2 }; let viewWTarget = 2, follow = true, camInit = false, zoomAt = null;
  const ZOOM_MIN_W = 0.4;                          // km across the screen at the closest zoom

  window.Atamus = {
    send: (o) => send(o), bus, get me() { return me; }, get cfg() { return cfg; }, get snap() { return latest; },
    ship: (id) => (latest.ships || []).find((x) => x.id === id) || null, get myShip() { return myShip(); },
    get view() { return { cx: +cam.cx.toFixed(3), cy: +cam.cy.toFixed(3), w: +viewWTarget.toFixed(3), follow }; },
  };
  const myShip = () => (latest.ships || []).find((x) => x.mine) || null;

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
        cfg = m.cfg; me = m.you; sentView = ""; bus.dispatchEvent(new CustomEvent("hello"));
      } else if (m.t === "snap") {
        const now = performance.now(), off = m.st - now;
        clockOffset = clockOffset == null ? off : Math.max(off, clockOffset + (off - clockOffset) * 0.02);   // server clock ≈ local + offset (the freshest arrival)
        snaps.push({ st: m.st, ships: new Map(m.ships.map((s) => [s.id, s])) }); while (snaps.length > 30) snaps.shift();
        latest = m; bus.dispatchEvent(new CustomEvent("snap"));
      } else if (m.t === "sys") bus.dispatchEvent(new CustomEvent("sys", { detail: m }));
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

  // ---- input: click / tap = fly there (or follow your ship, on it); drag = pan; wheel / pinch = zoom ----
  const ptrs = new Map(); let drag = null;
  const shipAt = (px, py, ships) => { const own = ships.find((s) => s.mine); if (!own) return null; const r = Math.max(14, hull(own.type).lengthKm * scale() * 0.6); return Math.hypot(px - gx2s(own.x), py - gy2s(own.y)) <= r ? own : null; };
  canvas.addEventListener("pointerdown", (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), w: viewWTarget }; return; }
    if (e.button !== 0) { drag = null; return; }
    drag = { x0: e.clientX, y0: e.clientY, cx: cam.cx, cy: cam.cy, moved: false };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;
    if (drag.pinch) { if (ptrs.size < 2) return; const [a, b] = [...ptrs.values()]; zoomTo(drag.w * (drag.d || 1) / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) { drag.moved = true; follow = false; zoomAt = null; }
    if (drag.moved) { cam.cx = drag.cx - (e.clientX - drag.x0) / scale(); cam.cy = drag.cy + (e.clientY - drag.y0) / scale(); clampCamera(); }
  });
  const up = (e) => {
    ptrs.delete(e.pointerId);
    const d = drag; if (!d) return;
    if (d.pinch) { if (!ptrs.size) drag = null; return; }
    drag = null; if (d.moved || e.type === "pointercancel") return;
    const ships = shipsNow(), own = myShip();
    if (shipAt(e.clientX, e.clientY, ships)) { follow = true; zoomAt = null; return; }   // your ship: the camera follows it again
    if (!own) return;
    const w = s2w(e.clientX, e.clientY); send({ t: "move", ship: own.id, x: +w.x.toFixed(4), y: +w.y.toFixed(4) });
  };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoomTo(viewWTarget * (e.deltaY > 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY); }, { passive: false });
  // zoom toward the pointer (or about your ship while following it)
  function zoomTo(w, px, py) {
    viewWTarget = Math.max(ZOOM_MIN_W, Math.min(fitWidth(), w));
    if (follow) { zoomAt = null; return; }
    const p = s2w(px, py); zoomAt = { wx: p.x, wy: p.y, px, py };
  }
  document.addEventListener("contextmenu", (e) => { if (e.target === canvas) e.preventDefault(); });

  // ---- drawing ----
  function drawHex() {                            // the Expanse's edge (owner: the world boundary)
    const R = HEX_R(); ctx.save(); ctx.beginPath();
    for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3, x = gx2s(Math.cos(a) * R), y = gy2s(Math.sin(a) * R); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.strokeStyle = "rgba(140,170,220,0.35)"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  function drawShips(ships) {
    const sc = scale();
    for (const sh of ships) {
      const sx = gx2s(sh.x), sy = gy2s(sh.y);
      if (sx < -80 || sy < -80 || sx > innerWidth + 80 || sy > innerHeight + 80) continue;
      if (sh.mine && sh.moving && sh.tx != null) {          // where it's headed
        const tx = gx2s(sh.tx), ty = gy2s(sh.ty); ctx.save(); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty);
        ctx.strokeStyle = "rgba(200,205,215,0.28)"; ctx.lineWidth = 1; ctx.setLineDash([4, 5]); ctx.stroke();
        ctx.setLineDash([]); ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, Math.PI * 2); ctx.fillStyle = "rgba(200,205,215,0.5)"; ctx.fill(); ctx.restore();
      }
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
    const ships = shipsNow(), own = ships.find((s) => s.mine);
    if (!camInit && own && cfg) {                      // start on your ship (or where you were, after an update reload)
      camInit = true; cam.cx = own.x; cam.cy = own.y;
      try { const v = JSON.parse(sessionStorage.getItem("atamus.view") || "null"); if (v && isFinite(v.cx) && isFinite(v.w)) { cam.cx = v.cx; cam.cy = v.cy; cam.viewW = viewWTarget = Math.max(ZOOM_MIN_W, v.w); follow = !!v.follow; } } catch {}
    }
    if (cfg) {
      viewWTarget = Math.max(ZOOM_MIN_W, Math.min(fitWidth(), viewWTarget));
      cam.viewW += (viewWTarget - cam.viewW) * (1 - Math.exp(-14 * dt));
      if (zoomAt && !follow) {                         // keep the point under the pointer still while the zoom eases
        const sc = scale(); cam.cx = zoomAt.wx - (zoomAt.px - innerWidth / 2) / sc; cam.cy = zoomAt.wy + (zoomAt.py - innerHeight / 2) / sc;
        if (Math.abs(viewWTarget - cam.viewW) < viewWTarget * 0.002) zoomAt = null;
      }
      if (follow && own) { const e = 1 - Math.exp(-12 * dt); cam.cx += (own.x - cam.cx) * e; cam.cy += (own.y - cam.cy) * e; }
      clampCamera();
      sendView(now);
    }
    drawBackground();
    if (cfg) { drawHex(); drawShips(ships); }
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
