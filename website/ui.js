// Atamus windowed UI: left panel of window buttons + draggable windows.
(() => {
  "use strict";
  const panel = document.getElementById("window-panel");
  const tooltip = document.getElementById("tooltip");

  let catalog = null, state = null, selectedPilotId = null;
  let z = 100;

  // persisted UI layout (window positions/sizes/open-state, panel order, data-popup pos)
  const WKEY = "atamus.ui";
  let saved = (() => { try { return JSON.parse(localStorage.getItem(WKEY) || "{}"); } catch { return {}; } })();
  saved.win = saved.win || {};
  function persistAll() { try { localStorage.setItem(WKEY, JSON.stringify(saved)); } catch {} }
  function persistWin(id) {
    const w = wins[id]; if (!w) return; const e = w.win;
    const prev = saved.win[id] || {};
    // when hidden, offset* read 0 — keep the last known geometry and only flip `open`
    saved.win[id] = e.hidden
      ? { x: prev.x, y: prev.y, w: prev.w, h: prev.h, open: false }
      : { x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight, open: true };
    persistAll();
  }

  // tiny DOM helper
  function el(tag, props, ...kids) {
    const e = document.createElement(tag); props = props || {};
    for (const k in props) {
      const v = props[k]; if (v == null) continue;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v);
    }
    for (const c of kids.flat()) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return e;
  }
  const fmtTime = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(ss).padStart(2, "0"); };
  const licById = (k) => catalog && catalog.licenses.find((l) => l.key === k);
  const catName = (k) => (catalog.categories.find((c) => c.key === k) || {}).name || k;

  // ---- data ----
  let serverOffset = 0; // server epoch - client epoch
  async function ensureCatalog() { if (!catalog) catalog = await Api.get("/game/catalog"); }
  async function refreshState() { state = await Api.get("/game/state"); if (state.serverTime) serverOffset = state.serverTime - Date.now(); if (selectedPilotId == null && state.pilots[0]) selectedPilotId = state.pilots[0].id; renderOpen(); }

  // ---- windows ----
  const wins = {};
  function createWindow(id, opts) {
    opts = opts || {};
    const slot = el("div", { class: "win-title-slot" });
    const close = el("button", { class: "win-close", "aria-label": "Close", onclick: () => toggleWindow(id, false) }, "×");
    const bar = el("div", { class: "win-title" }, slot, close);
    const body = el("div", { class: "win-body" });
    const win = el("div", { class: "win", hidden: "" }, bar, body);
    win.dataset.id = id;
    const s = saved.win[id] || {};
    const num = (v) => typeof v === "number" && isFinite(v);
    win.style.left = (num(s.x) ? s.x : (opts.left || 120)) + "px";
    win.style.top = (num(s.y) ? s.y : (opts.top || 70)) + "px";
    win.style.width = (num(s.w) && s.w > 0 ? s.w : (opts.width || 260)) + "px";
    if (num(s.h) && s.h > 0) win.style.height = s.h + "px";
    document.body.appendChild(win);
    win.addEventListener("mousedown", () => { win.style.zIndex = ++z; });
    dragMove(win, bar, () => persistWin(id));
    addResize(win, opts.minW || 220, opts.minH || 130, () => persistWin(id));
    wins[id] = { win, body, slot, render: opts.render };
    return wins[id];
  }
  function toggleWindow(id, force) {
    const w = wins[id]; if (!w) return;
    const show = force != null ? force : w.win.hidden;
    w.win.hidden = !show;
    if (show) { w.win.style.zIndex = ++z; if (w.render) w.render(w.body); }
    persistWin(id); updateBtnActive(); updateChatGlow();
  }
  function renderOpen() { for (const id in wins) if (!wins[id].win.hidden && wins[id].render) wins[id].render(wins[id].body); }

  function dragMove(win, handle, onEnd) {
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("select,button,input,textarea,option,.tab,.dd")) return;
      e.preventDefault();
      const r = win.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      const mv = (ev) => { win.style.left = Math.max(48, Math.min(innerWidth - 60, ev.clientX - ox)) + "px"; win.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - oy)) + "px"; };
      const up = () => { removeEventListener("mousemove", mv); removeEventListener("mouseup", up); if (onEnd) onEnd(); };
      addEventListener("mousemove", mv); addEventListener("mouseup", up);
    });
  }

  function addResize(win, MIN_W, MIN_H, onEnd) {
    MIN_W = MIN_W || 220; MIN_H = MIN_H || 130;
    for (const dir of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
      const h = el("div", { class: "rz rz-" + dir });
      h.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        const r = win.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, sw = r.width, sh = r.height, sl = r.left, st = r.top;
        win.style.maxHeight = "none";
        const content = win.querySelector(".win-body, .pop-inner");
        const mv = (ev) => {
          const dx = ev.clientX - sx, dy = ev.clientY - sy;
          let w = sw, hh = sh, l = sl, t = st;
          if (dir.includes("e")) w = Math.max(MIN_W, sw + dx);
          if (dir.includes("s")) hh = Math.max(MIN_H, sh + dy);
          if (dir.includes("w")) { w = Math.max(MIN_W, sw - dx); l = sl + (sw - w); }
          if (dir.includes("n")) { hh = Math.max(MIN_H, sh - dy); t = st + (sh - hh); }
          win.style.width = w + "px"; win.style.height = hh + "px"; win.style.left = l + "px"; win.style.top = t + "px";
          // never shrink horizontally past what the content needs
          if (content && (dir.includes("e") || dir.includes("w"))) {
            const over = content.scrollWidth - content.clientWidth;
            if (over > 0) { w += over; if (dir.includes("w")) l -= over; win.style.width = w + "px"; win.style.left = l + "px"; }
          }
        };
        const up = () => { removeEventListener("mousemove", mv); removeEventListener("mouseup", up); if (onEnd) onEnd(); };
        addEventListener("mousemove", mv); addEventListener("mouseup", up);
      });
      win.appendChild(h);
    }
  }

  // ---- window-panel buttons ----
  const ICONS = {
    player: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    pilot: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7v4l-1 3h16l-1-3V9a7 7 0 0 0-7-7z"/><path d="M9 20h6"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M4 4h16v11H9l-5 4z"/></svg>',
  };
  let order = ["player", "pilot", "chat"];
  const META = {
    player: { name: "Player Sheet", pinned: true },
    pilot: { name: "Pilot" },
    chat: { name: "Chat" },
  };
  const clockEl = el("div", { class: "panel-clock" });
  function renderPanel() {
    panel.innerHTML = "";
    for (const id of order) {
      const m = META[id];
      const btn = el("button", { class: "wbtn", "data-id": id, html: ICONS[id] });
      if (!m.pinned) btn.setAttribute("draggable", "true");
      btn.addEventListener("click", () => toggleWindow(id));
      // tooltip
      let t; btn.addEventListener("mouseenter", () => { t = setTimeout(() => { const r = btn.getBoundingClientRect(); tooltip.textContent = m.name; tooltip.hidden = false; tooltip.style.left = (r.right + 8) + "px"; tooltip.style.top = (r.top + r.height / 2) + "px"; }, 500); });
      btn.addEventListener("mouseleave", () => { clearTimeout(t); tooltip.hidden = true; });
      // drag-reorder (not the pinned one)
      if (!m.pinned) {
        btn.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", id); tooltip.hidden = true; });
        btn.addEventListener("dragover", (e) => { e.preventDefault(); });
        btn.addEventListener("drop", (e) => { e.preventDefault(); const from = e.dataTransfer.getData("text/plain"); if (!from || from === id || META[from].pinned) return; reorderBtn(from, id); });
      }
      panel.appendChild(btn);
    }
    panel.appendChild(clockEl);
    updateBtnActive();
  }
  function reorderBtn(from, to) { order = order.filter((x) => x !== from); let i = order.indexOf(to); if (i < 1) i = 1; order.splice(i, 0, from); renderPanel(); }
  function updateBtnActive() { for (const b of panel.children) { const w = wins[b.getAttribute("data-id")]; b.classList.toggle("open", !!(w && !w.win.hidden)); } }

  // ---- Player Sheet ----
  function renderPlayer(body) {
    const slot = wins.player && wins.player.slot;
    body.innerHTML = "";
    if (!state) { if (slot) slot.textContent = "Player Sheet"; body.append(el("div", { class: "muted" }, "Loading…")); return; }
    const p = state.profile;
    if (slot) slot.textContent = p.username;
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v)));
    const born = new Date(p.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    body.append(row("Day Born", born), row("Credits", (p.credits || 0).toLocaleString() + " cr"), row("Pilots", p.pilotCount), row("Total Endorsement Level", p.totalSkillLevel), row("Corp", p.corp));
  }

  // ---- Pilot window ----
  let pilotTab = "skills", skillCategory = null;
  const trained = (pilot, key) => (pilot.licenses && pilot.licenses[key]) || 0;
  const queuedCount = (pilot, key) => pilot.queue.filter((q) => q.key === key).length;
  const effLevel = (pilot, key) => trained(pilot, key) + queuedCount(pilot, key);
  function prereqMet(pilot, key) { const l = licById(key); return l.requirements.every((r) => r.type !== "license" || trained(pilot, r.key) >= r.level); }

  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.hidden = true; openMenu = null; } }
  function pilotDropdown(pilot, body) {
    const wrap = el("div", { class: "dd" });
    const btn = el("button", { class: "dd-btn", type: "button" }, pilot.name);
    const menu = el("div", { class: "dd-menu", hidden: "" });
    for (const p of state.pilots) {
      menu.append(el("div", { class: "dd-item" + (p.id === pilot.id ? " sel" : ""), onclick: (e) => { e.stopPropagation(); closeMenu(); if (p.id !== selectedPilotId) { selectedPilotId = p.id; renderPilot(body); } } }, p.name));
    }
    btn.addEventListener("click", (e) => { e.stopPropagation(); const show = menu.hidden; closeMenu(); if (show) { menu.hidden = false; openMenu = menu; } });
    wrap.append(btn, menu);
    return wrap;
  }

  function renderPilot(body) {
    const slot = wins.pilot && wins.pilot.slot;
    body.innerHTML = ""; if (slot) slot.innerHTML = "";
    if (!state || !catalog) { if (slot) slot.textContent = "Pilot"; body.append(el("div", { class: "muted" }, "Loading…")); return; }
    if (!state.pilots.length) { if (slot) slot.textContent = "Pilot"; renderCreatePilot(body); return; }
    if (selectedPilotId == null) selectedPilotId = state.pilots[0].id;
    const pilot = state.pilots.find((p) => p.id === selectedPilotId) || state.pilots[0];
    selectedPilotId = pilot.id;

    // pilot selector lives in the title bar — custom themed dropdown
    if (slot) slot.append(pilotDropdown(pilot, body));

    const tabs = [["skills", "Licenses"], ["queue", "Training Queue"], ["ship", "Current Ship"], ["items", "Items"]];
    body.append(el("div", { class: "tab-row" }, tabs.map(([k, n]) => {
      const dis = k === "ship" || k === "items";
      return el("button", { class: "tab" + (k === pilotTab ? " active" : "") + (dis ? " disabled" : ""), onclick: () => { if (dis) return; pilotTab = k; renderPilot(body); } }, n);
    })));
    const content = el("div", { class: "tab-content" }); body.append(content);
    if (pilotTab === "skills") renderSkills(content, pilot);
    else if (pilotTab === "queue") renderQueue(content, pilot);
    else content.append(el("div", { class: "muted" }, "Coming soon."));
  }

  function renderCreatePilot(body) {
    const input = el("input", { class: "text-input", maxlength: "24", placeholder: "First pilot name" });
    const err = el("div", { class: "form-err", hidden: "" });
    const submit = async () => { const name = input.value.trim(); if (!name) return; try { await Api.post("/game/pilot/create", { name }); await refreshState(); } catch (e) { err.textContent = e.message; err.hidden = false; } };
    body.append(el("div", { class: "create-pilot" }, el("div", { class: "muted" }, "Name your first pilot:"), input, err, el("button", { class: "btn-primary2", onclick: submit }, "Create")));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }

  function renderSkills(content, pilot) {
    if (skillCategory == null) skillCategory = catalog.categories[0].key;
    // categories stay visible as selectable slots
    content.append(el("div", { class: "cat-list" }, catalog.categories.map((c) => {
      const lics = catalog.licenses.filter((l) => l.category === c.key);
      const total = lics.reduce((s, l) => s + l.maxLevel, 0);
      const learned = lics.reduce((s, l) => s + trained(pilot, l.key), 0);
      const frac = total ? learned / total : 0;
      return el("div", { class: "cat-row" + (c.key === skillCategory ? " sel" : ""), onclick: () => { skillCategory = c.key; renderPilot(wins.pilot.body); } },
        el("span", { class: "cat-name" }, c.name),
        el("div", { class: "cat-bar" }, el("div", { class: "cat-bar-fill", style: "width:" + (frac * 100) + "%" })),
        el("span", { class: "cat-prog" }, String(lics.length)));
    })));
    // selected category's licenses shown inline below
    const cat = catalog.categories.find((c) => c.key === skillCategory);
    const lics = catalog.licenses.filter((l) => l.category === skillCategory);
    const sub = el("div", { class: "skills-sub" }, el("div", { class: "skills-sub-head" }, cat.name));
    for (const l of lics) sub.append(licenseRow(pilot, l));
    content.append(sub);
  }

  function licenseRow(pilot, l) {
    const tr = trained(pilot, l.key), eff = effLevel(pilot, l.key), next = eff + 1;
    const fullyTrained = tr >= l.maxLevel;        // only hide both when actually trained to max
    const qCount = queuedCount(pilot, l.key);
    const canAdd = eff < l.maxLevel && prereqMet(pilot, l.key);
    const learningLevel = (pilot.active && pilot.active.key === l.key) ? pilot.active.level : 0;
    const pips = el("div", { class: "pips" });
    for (let lv = 1; lv <= l.maxLevel; lv++) {
      let cls = "pip";
      if (lv === learningLevel) cls += " learning";
      else if (lv <= tr) cls += " on";
      else if (lv <= eff) cls += " q";
      pips.append(el("span", { class: cls }));
    }
    const btns = el("div", { class: "lic-btns" });
    if (!fullyTrained) {
      if (qCount > 0) btns.append(el("button", { class: "qbtn minus", title: "Remove top queued", onclick: () => queueRemove(l.key) }, "−"));
      if (eff < l.maxLevel) btns.append(el("button", { class: "qbtn" + (canAdd ? "" : " disabled"), title: canAdd ? "Queue next" : "Requirements not met", onclick: () => { if (canAdd) queueAdd(l.key); } }, "+"));
    }
    return el("div", { class: "lic-row" },
      el("span", { class: "lic-name", onclick: (e) => openLicense(l.key, Math.max(1, tr || 1), e.shiftKey) }, l.name),
      pips,
      el("span", { class: "lic-time" }, eff >= l.maxLevel ? (fullyTrained ? "MAX" : "QUEUED") : fmtTime(l.levelTimes[next - 1])),
      btns);
  }

  async function queueAdd(key) { try { await Api.post("/game/queue/add", { pilotId: selectedPilotId, key }); await refreshState(); } catch (e) { flash(e.message); } }
  async function queueRemove(key) { try { await Api.post("/game/queue/remove", { pilotId: selectedPilotId, key }); await refreshState(); } catch (e) { flash(e.message); } }

  function renderQueue(content, pilot) {
    if (!pilot.queue.length) { content.append(el("div", { class: "muted" }, "Training queue empty. Add licenses from the Licenses tab.")); return; }
    const paused = !!pilot.paused;
    const head = el("div", { class: "queue-head" },
      el("span", { class: "q-title" }, "TRAINING QUEUE"),
      el("button", { class: "q-pause" + (paused ? " paused" : ""), onclick: () => queuePause(!paused) }, paused ? "Resume" : "Pause"));
    content.append(head);
    const list = el("div", { class: "queue-list" });
    pilot.queue.forEach((q, i) => {
      const l = licById(q.key);
      const active = i === 0;
      const item = el("div", { class: "queue-item" + (active ? " active" : "") + (active && paused ? " paused" : ""), draggable: "true", "data-i": i },
        el("span", { class: "q-pos" }, active ? (paused ? "॥" : "▶") : (i + 1)),
        el("span", { class: "q-name" }, l.name + " " + q.level),
        el("span", { class: "q-time", "data-active": active ? "1" : "" }, active && pilot.active ? fmtTime(pilot.active.remainingMs) : fmtTime(l.levelTimes[q.level - 1])),
        el("button", { class: "q-cancel", title: "Cancel this endorsement", onclick: (e) => { e.stopPropagation(); queueCancel(q.key, q.level); } }, "×"));
      item.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", String(i)));
      item.addEventListener("dragover", (e) => e.preventDefault());
      item.addEventListener("drop", (e) => { e.preventDefault(); const from = +e.dataTransfer.getData("text/plain"); reorderQueue(pilot, from, i); });
      list.append(item);
    });
    content.append(list);
  }

  async function queuePause(paused) { try { await Api.post("/game/queue/pause", { pilotId: selectedPilotId, paused }); await refreshState(); } catch (e) { flash(e.message); } }
  async function queueCancel(key, level) { try { await Api.post("/game/queue/cancel", { pilotId: selectedPilotId, key, level }); await refreshState(); } catch (e) { flash(e.message); } }

  async function reorderQueue(pilot, from, to) {
    if (from === to) return;
    const arr = pilot.queue.slice(); const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
    // validate ascending per license
    const seen = {}; for (const q of arr) { if (seen[q.key] != null && q.level < seen[q.key]) { flash("Can't put a higher level below a lower one"); return; } seen[q.key] = q.level; }
    try { await Api.post("/game/queue/reorder", { pilotId: selectedPilotId, order: arr }); await refreshState(); } catch (e) { flash(e.message); }
  }

  // ---- license popup (data window) ----
  const popups = [];                       // open data windows
  const DATA_DEF = { x: 440, y: 150 };
  function openLicense(key, level, stack) {
    const l = licById(key);
    let pTab = "licensing", pLevel = Math.min(l.maxLevel, Math.max(1, level));
    if (!stack) { while (popups.length) popups.pop().remove(); }

    // cascade slightly down-right from the last opened position (persisted),
    // wrapping back to the default spot before it would run off-screen
    const PW = 370;
    const maxX = Math.max(20, innerWidth - PW - 10), maxY = Math.max(20, innerHeight - 140);
    const def = { x: Math.min(DATA_DEF.x, maxX), y: Math.min(DATA_DEF.y, maxY) };
    const base = saved.data || def;
    let px = base.x + 24, py = base.y + 24;
    if (px > maxX || py > maxY || px < 48 || py < 0) { px = def.x; py = def.y; }
    saved.data = { x: px, y: py }; persistAll();

    const popup = el("div", { class: "license-popup" });
    popup.style.left = px + "px"; popup.style.top = py + "px"; popup.style.width = "370px"; popup.style.zIndex = ++z;
    const remove = () => { const i = popups.indexOf(popup); if (i >= 0) popups.splice(i, 1); popup.remove(); };
    const close = el("button", { class: "win-close", onclick: remove }, "×");
    const titleBar = el("div", { class: "pop-title" }, el("span", {}, l.name), close);
    const sub = el("div", { class: "pop-sub" }, catName(l.category));
    const inner = el("div", { class: "pop-inner" });
    popup.append(titleBar, sub, inner);
    document.body.appendChild(popup);
    popup.addEventListener("mousedown", () => { popup.style.zIndex = ++z; });
    const savePos = () => { saved.data = { x: popup.offsetLeft, y: popup.offsetTop }; persistAll(); };
    dragMove(popup, titleBar, savePos);
    addResize(popup, 300, 240, savePos);
    popups.push(popup);

    const render = () => {
      const pilot = state.pilots.find((p) => p.id === selectedPilotId);
      inner.innerHTML = "";
      const learningLevel = (pilot && pilot.active && pilot.active.key === key) ? pilot.active.level : 0;
      const boxes = el("div", { class: "lvl-boxes" });
      for (let lv = 1; lv <= l.maxLevel; lv++) {
        const tr = trained(pilot, key), eff = effLevel(pilot, key);
        let cls = "lvl-box";
        if (lv === learningLevel) cls += " learning";
        else if (lv <= tr) cls += " learned";
        else if (lv <= eff) cls += " studying";
        if (lv === pLevel) cls += " sel";
        boxes.append(el("div", { class: cls, onclick: () => { pLevel = lv; render(); } }, lv));
      }
      inner.append(boxes);
      const tabs = [["licensing", "Licensing"], ["requirements", "Requirements"], ["requiredFor", "Required For"]];
      inner.append(el("div", { class: "tab-row" }, tabs.map(([k, n]) => el("button", { class: "tab" + (k === pTab ? " active" : ""), onclick: () => { pTab = k; render(); } }, n))));
      const c = el("div", { class: "pop-content" }); inner.append(c);
      if (pTab === "licensing") c.append(el("p", { class: "pop-desc" }, l.desc), el("p", { class: "pop-effect" }, l.effect), el("div", { class: "pop-traintime" }, "Train time (Lv " + pLevel + "): " + fmtTime(l.levelTimes[pLevel - 1])));
      else if (pTab === "requirements") {
        if (!l.requirements.length) c.append(el("div", { class: "muted" }, "No requirements."));
        else c.append(el("ul", { class: "req-list" }, l.requirements.map((r) => {
          if (r.type === "license") { const rl = licById(r.key); const met = trained(pilot, r.key) >= r.level; return el("li", { class: met ? "met" : "unmet" }, rl.name + " " + r.level); }
          return el("li", { class: "test" }, r.name + " (test)");
        })));
      } else {
        const unlocks = catalog.licenses.filter((o) => o.requirements.some((r) => r.type === "license" && r.key === key && r.level === pLevel));
        if (!unlocks.length) c.append(el("div", { class: "muted" }, "Nothing at this level."));
        else c.append(el("ul", { class: "req-list" }, unlocks.map((o) => el("li", {}, o.name))));
      }
    };
    render();
  }

  // ---- selected unit (structures now; ships later) ----
  const fmtClock = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60; return h + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0"); };
  function renderUnit(body) {
    const w = wins.unit, u = window.Atamus.unit;
    body.innerHTML = "";
    if (!u) { if (w) w.slot.textContent = "Selection"; body.append(el("div", { class: "muted" }, "Nothing selected.")); return; }
    if (w) w.slot.textContent = u.name;
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v)));
    if (u.kind === "ship") {
      const A = window.Atamus, inv = (A.inv.ships || {})[u.id] || {};
      const status = u.docked ? "Docked" : u.warp ? "Warping" : u.mining ? "Mining" : u.moving ? "Moving" : "Idle";
      const st = u.stats || {};
      body.append(row("Type", u.name), row("Status", status), row("Speed", Math.round((st.speedKmps || 0) * 1000) + " m/s"));
      if (inv.ore) body.append(row("Ore hold", Math.round(inv.ore.used).toLocaleString() + " / " + inv.ore.cap.toLocaleString() + " m³"));
      if (inv.cargo) body.append(row("Cargo", Math.round(inv.cargo.used).toLocaleString() + " / " + inv.cargo.cap.toLocaleString() + " m³"));
      body.append(row("Targets", (u.targets || []).length + " / " + (st.maxTargets || 0)));
      const btns = el("div", { class: "unit-btns" });
      const lockedRock = (u.targets || []).some((t) => t.kind === "rock" && t.locked);
      if (u.moving && !u.warp && !u.docked) btns.append(el("button", { class: "btn-primary2 unit-btn", onclick: () => A.send({ t: "warp", ship: u.id }) }, "Warp"));
      if (lockedRock && !u.docked) btns.append(el("button", { class: "btn-primary2 unit-btn" + (u.mining ? " off" : ""), onclick: () => A.send({ t: "mine", ship: u.id, on: !u.mining }) }, u.mining ? "Stop Mining" : "Mine (X)"));
      if (u.docked) btns.append(el("button", { class: "btn-primary2 unit-btn off", onclick: () => A.send({ t: "dock", ship: u.id, dock: false }) }, "Undock"));
      else if (u.canDock) btns.append(el("button", { class: "btn-primary2 unit-btn", onclick: () => A.send({ t: "dock", ship: u.id, dock: true }) }, "Dock"));
      btns.append(el("button", { class: "btn-primary2 unit-btn off", onclick: () => openInventory({ owner: "ship", id: u.id, inv: "ore" }) }, "Inventory"));
      body.append(btns);
    } else if (u.kind === "station") {
      const h = window.Atamus.inv.hangar;
      if (h) body.append(row("Hangar", Math.round(h.used).toLocaleString() + " / " + h.cap.toLocaleString() + " m³"));
      const docked = (window.Atamus.snap.ships || []).filter((sh) => sh.mine && sh.docked);
      body.append(row("Docked ships", docked.length));
      for (const sh of docked) {                                   // click a docked ship to select it (Undock / Inventory)
        const t = (window.Atamus.cfg.shipTypes || {})[sh.type] || {};
        body.append(el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, ""), el("button", { class: "btn-primary2 unit-btn off", onclick: () => window.Atamus.selectShip(sh.id) }, t.name || sh.type)));
      }
      body.append(el("div", { class: "unit-btns" }, el("button", { class: "btn-primary2 unit-btn off", onclick: () => openInventory({ owner: "station", inv: "hangar" }) }, "Inventory")));
    } else if (u.kind === "gate") {
      const active = u.state === "active";
      const fuel = active ? Math.min(u.fuelMs, u.sessionRemMs ?? u.fuelMs) : u.fuelMs;
      body.append(row("Fuel", fmtClock(fuel)), row("Status", active ? (u.connToSys ? "Connected" : "Searching…") : "Offline"));
      if (u.mine) body.append(el("button", { class: "btn-primary2 unit-btn" + (active ? " off" : ""), onclick: () => window.Atamus.send({ t: "gate", gate: u.id, open: !active }) }, active ? "Turn Off" : "Turn On"));
    }
  }
  window.Atamus.bus.addEventListener("select", () => { toggleWindow("unit", true); renderUnit(wins.unit.body); });
  window.Atamus.bus.addEventListener("deselect", () => toggleWindow("unit", false));
  setInterval(() => { const w = wins.unit; if (w && !w.win.hidden) renderUnit(w.body); }, 1000);
  // re-render right away when the selected unit's state changes (status / available buttons)
  let unitSig = "";
  window.Atamus.bus.addEventListener("snap", () => {
    const w = wins.unit; if (!w || w.win.hidden) return;
    const u = window.Atamus.unit;
    const sig = u ? [u.kind, u.id, u.docked, u.warp, u.mining, u.moving, u.canDock, u.state, u.connToSys, (u.targets || []).map((t) => t.kind + t.id + (t.locked ? 1 : 0)).join(",")].join("|") : "";
    if (sig !== unitSig) { unitSig = sig; renderUnit(w.body); }
  });

  // ---- inventories: slot grids with drag/drop ----
  const invKey = (ref) => ref.owner === "station" ? "station:hangar" : "ship:" + ref.id + ":" + ref.inv;
  const invData = (ref) => { const A = window.Atamus; if (ref.owner === "station") return A.inv.hangar; const s = (A.inv.ships || {})[ref.id]; return s ? s[ref.inv] : null; };
  const invLabel = (ref) => ref.owner === "station" ? "Hangar" : ((window.Atamus.ship(ref.id) || {}).type === "chisel" ? "Chisel" : ref.id) + " · " + (ref.inv === "ore" ? "Ore hold" : "Cargo");
  const invWins = {}; // key -> { ref (current tab), id }
  function invTabsFor(ref) {
    const A = window.Atamus;
    if (ref.owner === "station") {
      const tabs = [{ owner: "station", inv: "hangar" }];
      for (const sh of A.snap.ships || []) if (sh.mine && sh.docked) tabs.push({ owner: "ship", id: sh.id, inv: "ore" }, { owner: "ship", id: sh.id, inv: "cargo" });
      return tabs;
    }
    return [{ owner: "ship", id: ref.id, inv: "ore" }, { owner: "ship", id: ref.id, inv: "cargo" }];
  }
  function openInventory(ref) {
    const key = ref.owner === "station" ? "inv:station" : "inv:" + ref.id;   // one window per holder; tabs switch inside
    if (!invWins[key]) {
      createWindow(key, { left: 360, top: 160, width: 420, minW: 400, minH: 300, render: (b) => renderInventory(key, b) });
      invWins[key] = { ref };
    }
    invWins[key].ref = ref;
    toggleWindow(key, true); renderInventory(key, wins[key].body);
  }
  function openInventoryAlone(ref) {           // shift-click a tab: its own window
    const key = "inv:" + invKey(ref);
    if (!invWins[key]) { createWindow(key, { left: 400, top: 200, width: 420, minW: 400, minH: 300, render: (b) => renderInventory(key, b) }); invWins[key] = { ref, solo: true }; }
    toggleWindow(key, true); renderInventory(key, wins[key].body);
  }
  const dragPayload = (e) => { try { return JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return null; } };
  function renderInventory(key, body) {
    const w = wins[key], st = invWins[key]; if (!w || !st) return;
    const A = window.Atamus, ref = st.ref, data = invData(ref);
    body.innerHTML = ""; w.slot.innerHTML = "";
    // tabs in the title (station: hangar + docked ships; ship: ore/cargo)
    if (!st.solo) {
      const row = el("div", { class: "tab-row" });
      for (const t of invTabsFor(ref)) {
        const active = invKey(t) === invKey(ref);
        const b = el("button", { class: "tab" + (active ? " active" : ""), onclick: (e) => { if (e.shiftKey) openInventoryAlone(t); else { st.ref = t; renderInventory(key, body); } } }, t.owner === "station" ? "Hangar" : (t.inv === "ore" ? "Ore" : "Cargo"));
        b.addEventListener("dragover", (e) => { e.preventDefault(); b.classList.add("drop"); });
        b.addEventListener("dragleave", () => b.classList.remove("drop"));
        b.addEventListener("drop", (e) => { e.preventDefault(); b.classList.remove("drop"); const d = dragPayload(e); if (d) A.send({ t: "inv_move", from: d.ref, to: { ...t, slot: null } }); });
        row.append(b);
      }
      w.slot.append(row);
    } else w.slot.textContent = invLabel(ref);
    if (!data) { body.append(el("div", { class: "muted" }, "No inventory.")); return; }
    const cap = data.cap, used = data.used, maxStacks = (A.cfg && A.cfg.maxStacks) || 100;
    body.append(el("div", { class: "inv-head" },
      el("div", { class: "inv-cap" }, el("div", { class: "inv-cap-fill", style: "width:" + Math.min(100, used / cap * 100) + "%" })),
      el("span", { class: "inv-stat" }, Math.round(used).toLocaleString() + " / " + cap.toLocaleString() + " m³ · " + data.stacks + "/" + maxStacks),
      el("button", { class: "qbtn minus inv-sort", title: "Sort", onclick: () => A.send({ t: "inv_sort", ref }) }, "⇅")));
    const grid = el("div", { class: "inv-grid" });
    const items = (A.cfg && A.cfg.items) || {};
    for (let i = 0; i < maxStacks; i++) {
      const stck = data.slots[i];
      const cell = el("div", { class: "inv-cell" + (stck ? " filled" : "") });
      if (stck) {
        const def = items[stck.item] || { name: stck.item, color: "#888" };
        cell.append(el("div", { class: "inv-item", style: "background:" + def.color, title: def.name + " × " + stck.qty + " (" + (stck.qty * (def.unitM3 || 0)).toFixed(1) + " m³)" }, el("span", { class: "inv-abbr" }, def.name.slice(0, 3)), el("span", { class: "inv-qty" }, stck.qty.toLocaleString())));
        cell.setAttribute("draggable", "true");
        cell.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", JSON.stringify({ ref: { ...ref, slot: i } })); e.dataTransfer.effectAllowed = "move"; });
      }
      cell.addEventListener("dragover", (e) => { e.preventDefault(); cell.classList.add("drop"); });
      cell.addEventListener("dragleave", () => cell.classList.remove("drop"));
      cell.addEventListener("drop", (e) => { e.preventDefault(); cell.classList.remove("drop"); const d = dragPayload(e); if (!d) return; A.send({ t: "inv_move", from: d.ref, to: { ...ref, slot: i < data.slots.length ? i : null } }); });
      grid.append(cell);
    }
    body.append(grid);
  }
  window.Atamus.bus.addEventListener("inv", () => { for (const key in invWins) if (wins[key] && !wins[key].win.hidden) renderInventory(key, wins[key].body); const w = wins.unit; if (w && !w.win.hidden) renderUnit(w.body); });

  // ---- chat ----
  const chat = { local: [], corp: [] }; let chatTab = "local";
  const unread = {};                       // keyed by tab id (local / corp / w:Name)
  const whisperPartners = [];              // names with an open whisper thread
  const myName = () => (window.Atamus.me && window.Atamus.me.name) || "";
  const wKey = (name) => "w:" + name;
  function viewing(ch) { const w = wins.chat; return w && !w.win.hidden && chatTab === ch; }
  function updateChatGlow() {
    const w = wins.chat;
    if (w && !w.win.hidden && w.slot) { for (const b of w.slot.querySelectorAll(".tab")) { const k = b.dataset.ch; b.classList.toggle("unread", k !== chatTab && !!unread[k]); } }
    const anyUnread = Object.values(unread).some(Boolean);
    const btn = panel.querySelector('.wbtn[data-id="chat"]');
    if (btn) btn.classList.toggle("unread", (!w || w.win.hidden) && anyUnread);
  }
  function pushChat(ch, msg) {
    if (!chat[ch]) chat[ch] = [];
    chat[ch].push(msg);
    if (viewing(ch)) appendChatLine(wins.chat.body.querySelector(".chat-log"), msg);
    else { unread[ch] = true; updateChatGlow(); }
  }
  function openWhisper(name) {
    if (!name || name === myName()) return;
    if (!chat[wKey(name)]) chat[wKey(name)] = [];
    if (!whisperPartners.includes(name)) whisperPartners.push(name);
    chatTab = wKey(name);
    toggleWindow("chat", true);
    if (wins.chat.render) wins.chat.render(wins.chat.body);
  }
  function closeWhisper(name) {
    const i = whisperPartners.indexOf(name); if (i >= 0) whisperPartners.splice(i, 1);
    delete unread[wKey(name)];
    if (chatTab === wKey(name)) chatTab = "local";
    if (wins.chat && !wins.chat.win.hidden) wins.chat.render(wins.chat.body);
  }
  function appendChatLine(log, msg) {
    if (!log) return;
    let node;
    if (msg.sys) node = el("div", { class: "sys" }, "» " + msg.text);
    else {
      const who = el("span", { class: "who", "data-name": msg.from }, msg.from + ": ");
      who.addEventListener("contextmenu", (e) => { e.preventDefault(); if (msg.from !== myName()) showCtxMenu(e.clientX, e.clientY, [["Whisper " + msg.from, () => openWhisper(msg.from)]]); });
      node = el("div", {}, who, msg.text);
    }
    log.append(node); log.scrollTop = log.scrollHeight;
  }
  window.Atamus.bus.addEventListener("chat", (e) => {
    const m = e.detail;
    if (m.ch === "whisper") {
      const partner = (m.from === myName()) ? m.to : m.from;   // thread is keyed by the other person
      if (!whisperPartners.includes(partner)) whisperPartners.push(partner);
      pushChat(wKey(partner), { from: m.from, text: m.text });
      if (wins.chat && !wins.chat.win.hidden && !viewing(wKey(partner))) wins.chat.render(wins.chat.body);
    } else {
      pushChat(m.ch === "corp" ? "corp" : "local", { from: m.from, text: m.text });
    }
  });
  window.Atamus.bus.addEventListener("sys", (e) => pushChat("local", { sys: true, text: e.detail.text }));

  function renderChat(body) {
    unread[chatTab] = false;               // viewing a channel clears its unread
    const slot = wins.chat && wins.chat.slot;
    if (slot) {
      slot.innerHTML = "";
      const tabs = [["local", "Local"], ["corp", "Corp"], ...whisperPartners.map((n) => [wKey(n), n, n])];
      const row = el("div", { class: "tab-row" });
      for (const [k, label, wn] of tabs) {
        const btn = el("button", { class: "tab" + (k === chatTab ? " active" : "") + (k !== chatTab && unread[k] ? " unread" : ""), "data-ch": k, onclick: () => { chatTab = k; renderChat(body); } }, label);
        if (wn) btn.append(el("span", { class: "tab-x", title: "Close", onclick: (e) => { e.stopPropagation(); closeWhisper(wn); } }, "×"));
        row.append(btn);
      }
      slot.append(row);
    }
    body.innerHTML = "";
    const log = el("div", { class: "chat-log" });
    for (const m of (chat[chatTab] || [])) appendChatLine(log, m);
    const isW = chatTab.startsWith("w:");
    const ph = isW ? "Whisper " + chatTab.slice(2) : "Message " + (chatTab === "corp" ? "Delve Holdings" : "local");
    const input = el("input", { class: "text-input", maxlength: "240", placeholder: ph + "…" });
    const form = el("form", { class: "chat-form", onsubmit: (e) => {
      e.preventDefault(); const t = input.value.trim(); if (!t) return;
      if (isW) window.Atamus.send({ t: "chat", text: t, channel: "whisper", to: chatTab.slice(2) });
      else window.Atamus.send({ t: "chat", text: t, channel: chatTab });
      input.value = "";
    } }, input);
    body.append(log, form); log.scrollTop = log.scrollHeight;
    updateChatGlow();
  }

  // ---- custom right-click context menu ----
  let ctxMenu = null;
  function closeCtxMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
  function showCtxMenu(x, y, items) {
    closeCtxMenu();
    ctxMenu = el("div", { class: "ctx-menu" }, items.map(([label, fn]) => el("div", { class: "ctx-item", onclick: () => { closeCtxMenu(); fn(); } }, label)));
    document.body.appendChild(ctxMenu);
    const r = ctxMenu.getBoundingClientRect();
    ctxMenu.style.left = Math.min(x, innerWidth - r.width - 6) + "px";
    ctxMenu.style.top = Math.min(y, innerHeight - r.height - 6) + "px";
  }

  function flash(text) { const s = document.getElementById("status"); if (!s) return; s.textContent = text; s.className = "status err"; setTimeout(() => s.classList.add("hidden"), 2500); }

  // ---- init ----
  async function init() {
    createWindow("player", { left: 90, top: 70, width: 260, minW: 230, minH: 196, render: renderPlayer });
    createWindow("pilot", { left: 180, top: 90, width: 440, minW: 390, minH: 300, render: renderPilot });
    createWindow("chat", { left: 280, top: 150, width: 320, minW: 250, minH: 108, render: renderChat });
    createWindow("unit", { left: 420, top: 120, width: 250, minW: 230, minH: 120, render: renderUnit });
    wins.unit.win.querySelector(".win-close").addEventListener("click", () => window.Atamus.deselectUnit());
    renderPanel();

    // close any open custom dropdown / context menu when clicking elsewhere
    document.addEventListener("mousedown", (e) => {
      if (openMenu && !(e.target instanceof Element && e.target.closest(".dd"))) closeMenu();
      if (ctxMenu && !(e.target instanceof Element && e.target.closest(".ctx-menu"))) closeCtxMenu();
    });
    addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenu(); closeCtxMenu(); } });
    // right-click is used in-game — suppress the browser's native context menu
    document.addEventListener("contextmenu", (e) => e.preventDefault());

    // restore windows the user had open last session
    for (const id in wins) { if (id !== "unit" && saved.win[id] && saved.win[id].open) toggleWindow(id, true); }

    // clock inside the window panel (HH:MM)
    const tickClock = () => { const d = new Date(Date.now() + serverOffset); const p = (n) => String(n).padStart(2, "0"); clockEl.textContent = p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()); };
    tickClock(); setInterval(tickClock, 1000);

    try { await ensureCatalog(); await refreshState(); } catch { /* not logged in handled by game.js */ }
    if (state && !state.pilots.length) toggleWindow("pilot", true); // prompt first-pilot naming
    // live countdown refresh for the queue
    setInterval(() => {
      const w = wins.pilot; if (!w || w.win.hidden || pilotTab !== "queue" || !state) return;
      const pilot = state.pilots.find((p) => p.id === selectedPilotId); if (!pilot || !pilot.active) return;
      pilot.active.remainingMs -= 1000;
      const t = w.body.querySelector('.q-time[data-active="1"]');
      if (t) t.textContent = fmtTime(Math.max(0, pilot.active.remainingMs));
      if (pilot.active.remainingMs <= 0) refreshState();
    }, 1000);
  }
  init();
})();
