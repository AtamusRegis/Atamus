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
    if (id.startsWith("inv:") && invWins[id]) { saved.invs = saved.invs || {}; const st = invWins[id]; saved.invs[id] = { ref: st.ref, root: st.root, solo: !!st.solo, open: isOpen(w) }; }
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
  const cr = (n) => el("span", { class: "credits" }, Math.round(n || 0).toLocaleString() + " cr");   // credit amounts read gold
  const fmtTime = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(ss).padStart(2, "0"); };
  const licById = (k) => catalog && catalog.licenses.find((l) => l.key === k);
  const catName = (k) => (catalog.categories.find((c) => c.key === k) || {}).name || k;

  // ---- data ----
  let serverOffset = 0; // server epoch - client epoch
  async function ensureCatalog() { if (!catalog) catalog = await Api.get("/game/catalog"); }
  async function refreshState() { state = await Api.get("/game/state"); if (state.serverTime) serverOffset = state.serverTime - Date.now(); if (selectedPilotId == null && state.pilots[0]) selectedPilotId = state.pilots[0].id; renderOpen(); }

  // ---- windows ----
  const wins = {};
  const isOpen = (w) => !!w && (w.group ? true : !w.win.hidden);
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
    win.addEventListener("pointerdown", () => { win.style.zIndex = ++z; });
    dragMove(win, bar, () => persistWin(id));
    addResize(win, opts.minW || 220, opts.minH || 130, () => persistWin(id), opts.dynMin);
    wins[id] = { id, win, body, slot, bar, close, render: opts.render, label: opts.label, groupable: opts.groupable !== false, group: null };
    return wins[id];
  }
  // keep a window on screen (phones, or a desktop window that shrank): narrower than the screen, inside it
  const PANEL_W = 48;
  function fitOnScreen(elm) {
    if (!elm || elm.hidden) return;
    const maxW = innerWidth - PANEL_W - 4;
    if (elm.dataset.id !== "fleet" && elm.offsetWidth > maxW) elm.style.width = maxW + "px";
    if (elm.offsetHeight > innerHeight - 4) elm.style.height = (innerHeight - 4) + "px";
    const l = parseFloat(elm.style.left) || 0, t = parseFloat(elm.style.top) || 0;
    elm.style.left = Math.max(PANEL_W, Math.min(innerWidth - elm.offsetWidth - 2, l)) + "px";
    elm.style.top = Math.max(0, Math.min(innerHeight - Math.min(elm.offsetHeight, 120), t)) + "px";
  }
  addEventListener("resize", () => { for (const w of document.querySelectorAll(".win:not([hidden]), .license-popup")) fitOnScreen(w); });
  function toggleWindow(id, force) {
    const w = wins[id]; if (!w) return;
    const show = force != null ? force : !isOpen(w);
    if (w.group) {                                   // lives in a tab group
      const g = groups[w.group];
      if (show || id === "unit") { setActive(g, id); g.frame.style.zIndex = ++z; if (show) fitOnScreen(g.frame); }   // the selection window stays in its group
      else removeFromGroup(id, true);
      updateBtnActive(); updateChatGlow(); return;
    }
    w.win.hidden = !show;
    if (show) { w.win.style.zIndex = ++z; if (w.render) w.render(w.body); fitOnScreen(w.win); }
    persistWin(id); updateBtnActive(); updateChatGlow();
    if (id === "fleet" && typeof renderShipActions === "function") { actSig = ""; renderShipActions(); }
  }
  function renderOpen() { for (const id in wins) if (isOpen(wins[id]) && wins[id].render) wins[id].render(wins[id].body); }

  // ---- tab groups: drop a window's title bar onto another window to stack them ----
  const groups = {}; let gseq = 0;
  const persistableInGroup = (id) => ["player", "pilot", "chat", "unit", "market"].includes(id) || id.startsWith("inv:");
  const winLabel = (id) => (wins[id] && wins[id].label) || (META[id] && META[id].name) || id;
  function createGroupFrame(r) {
    const gid = "g" + (++gseq);
    const tabs = el("div", { class: "wg-tabs" });
    const close = el("button", { class: "win-close", "aria-label": "Close", onclick: () => { const g = groups[gid]; if (g && g.active) removeFromGroup(g.active, true); } }, "×");
    const bar = el("div", { class: "win-title" }, close);
    const frame = el("div", { class: "win win-group" }, tabs, bar);
    frame.dataset.group = gid;
    frame.style.left = r.left + "px"; frame.style.top = r.top + "px"; frame.style.width = r.width + "px"; frame.style.height = r.height + "px";
    document.body.appendChild(frame);
    frame.addEventListener("pointerdown", () => { frame.style.zIndex = ++z; });
    dragMove(frame, bar, persistGroups); dragMove(frame, tabs, persistGroups);
    addResize(frame, 220, 130, persistGroups);
    frame.style.zIndex = ++z;
    return (groups[gid] = { id: gid, frame, tabs, bar, members: [], active: null });
  }
  function addToGroup(g, id) {
    const w = wins[id]; if (!w || !w.groupable || w.group === g.id) return;
    if (w.group) removeFromGroup(id, false);
    w.group = g.id; g.members.push(id);
    w.win.hidden = true;
    g.bar.insertBefore(w.slot, g.bar.lastChild); g.frame.append(w.body);
    setActive(g, id); persistWin(id); persistGroups(); updateBtnActive(); updateChatGlow();
  }
  function removeFromGroup(id, hide) {
    const w = wins[id], g = w && groups[w.group]; if (!g) return;
    g.members = g.members.filter((m) => m !== id); w.group = null;
    w.bar.insertBefore(w.slot, w.close); w.win.append(w.body); w.body.hidden = false; w.slot.hidden = false;
    const r = g.frame.getBoundingClientRect();
    w.win.style.left = r.left + "px"; w.win.style.top = r.top + "px"; w.win.style.width = r.width + "px"; w.win.style.height = r.height + "px";
    w.win.hidden = !!hide; if (!hide) { w.win.style.zIndex = ++z; if (w.render) w.render(w.body); }
    persistWin(id);
    if (g.active === id) setActive(g, g.members[0] || null);
    if (g.members.length < 2 && !g.dissolving) {        // one left: back to a plain window, frame goes away
      g.dissolving = true; for (const m of [...g.members]) removeFromGroup(m, false);
      g.frame.remove(); delete groups[g.id];
    }
    persistGroups(); updateBtnActive(); updateChatGlow();
  }
  function setActive(g, id) {
    g.active = id;
    for (const m of g.members) { const w = wins[m]; w.body.hidden = m !== id; w.slot.hidden = m !== id; }
    renderTabs(g);
    if (id && wins[id].render) wins[id].render(wins[id].body);
  }
  function renderTabs(g) {
    g.tabs.innerHTML = "";
    for (const m of g.members) {
      const t = el("div", { class: "wg-tab" + (m === g.active ? " active" : "") }, winLabel(m));
      t.addEventListener("pointerdown", (e) => {              // click = switch tab; drag away = pull the window out
        if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
        const sx = e.clientX, sy = e.clientY, pid = e.pointerId; let pulled = false;
        const mv = (ev) => {
          if (ev.pointerId !== pid || pulled) return;
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 26) return;
          pulled = true; cleanup();
          const w = wins[m]; removeFromGroup(m, false);
          const r = w.win.getBoundingClientRect();
          startDrag(w.win, ev, Math.min(r.width / 2, 80), 18, () => persistWin(m), true);
        };
        const up = (ev) => { if (ev.pointerId !== pid) return; cleanup(); if (!pulled) { setActive(g, m); g.frame.style.zIndex = ++z; } };
        const cleanup = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); };
        addEventListener("pointermove", mv); addEventListener("pointerup", up); addEventListener("pointercancel", up);
      });
      g.tabs.append(t);
    }
  }
  // merge whatever `moving` is (a window or a group frame) into `target` (a window or a group frame)
  function dropInto(moving, target) {
    const ids = moving.dataset.group ? [...groups[moving.dataset.group].members] : [moving.dataset.id];
    let g = target.dataset.group ? groups[target.dataset.group] : null;
    if (!g) { const tid = target.dataset.id; if (!wins[tid] || !wins[tid].groupable) return; g = createGroupFrame(target.getBoundingClientRect()); addToGroup(g, tid); }
    for (const id of ids) addToGroup(g, id);
  }
  function persistGroups() {
    saved.groups = Object.values(groups).map((g) => { const r = g.frame.getBoundingClientRect(); return { members: g.members.filter(persistableInGroup), active: g.active, x: r.left, y: r.top, w: r.width, h: r.height }; }).filter((g) => g.members.length > 1);
    persistAll();
  }
  function restoreGroups() {
    for (const sg of saved.groups || []) {
      const members = (sg.members || []).filter((m) => wins[m] && !wins[m].group);
      if (members.length < 2) continue;
      const g = createGroupFrame({ left: sg.x || 120, top: sg.y || 70, width: sg.w || 300, height: sg.h || 300 });
      for (const m of members) addToGroup(g, m);
      setActive(g, members.includes(sg.active) ? sg.active : members[0]);
    }
  }

  // pointer events so windows drag/resize with mouse, pen or finger alike
  function startDrag(win, e, ox, oy, onEnd, canGroup) {
    const id = e.pointerId; let target = null;
    const groupable = canGroup && (win.dataset.group ? true : !!(wins[win.dataset.id] && wins[win.dataset.id].groupable));
    win.style.pointerEvents = "none";
    const place = (ev) => { win.style.left = Math.max(48, Math.min(innerWidth - 60, ev.clientX - ox)) + "px"; win.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - oy)) + "px"; };
    const mv = (ev) => {
      if (ev.pointerId !== id) return; place(ev);
      if (!groupable) return;
      const under = document.elementFromPoint(ev.clientX, ev.clientY), f = under && under.closest(".win");
      let t = null;
      if (f && f !== win) {
        const ok = f.dataset.group ? true : !!(wins[f.dataset.id] && wins[f.dataset.id].groupable);
        const r = f.getBoundingClientRect(); if (ok && ev.clientY - r.top < 48) t = f;    // over its title / tab strip
      }
      if (t !== target) { if (target) target.classList.remove("drop-target"); target = t; if (target) target.classList.add("drop-target"); }
    };
    const up = (ev) => {
      if (ev.pointerId !== id) return;
      removeEventListener("pointermove", mv); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
      win.style.pointerEvents = "";
      if (target) { target.classList.remove("drop-target"); dropInto(win, target); }
      if (onEnd) onEnd();
    };
    place(e);
    addEventListener("pointermove", mv); addEventListener("pointerup", up); addEventListener("pointercancel", up);
  }
  function dragMove(win, handle, onEnd) {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("select,button,input,textarea,option,.tab,.dd,.wg-tab")) return;
      e.preventDefault();
      const r = win.getBoundingClientRect();
      startDrag(win, e, e.clientX - r.left, e.clientY - r.top, onEnd, true);
    });
  }

  function addResize(win, MIN_W, MIN_H, onEnd, dynMin) {   // dynMin(): content-driven minimum {w, h}
    MIN_W = MIN_W || 220; MIN_H = MIN_H || 130;
    for (const dir of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
      const h = el("div", { class: "rz rz-" + dir });
      h.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        const r = win.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, sw = r.width, sh = r.height, sl = r.left, st = r.top, id = e.pointerId;
        win.style.maxHeight = "none";
        const content = win.querySelector(".win-body, .pop-inner");
        const mv = (ev) => {
          if (ev.pointerId !== id) return;
          const dx = ev.clientX - sx, dy = ev.clientY - sy;
          let w = sw, hh = sh, l = sl, t = st;
          if (dir.includes("e")) w = Math.max(MIN_W, sw + dx);
          if (dir.includes("s")) hh = Math.max(MIN_H, sh + dy);
          if (dir.includes("w")) { w = Math.max(MIN_W, sw - dx); l = sl + (sw - w); }
          if (dir.includes("n")) { hh = Math.max(MIN_H, sh - dy); t = st + (sh - hh); }
          const dm = dynMin && dynMin();
          if (dm) {
            if (w < dm.w) { if (dir.includes("w")) l -= dm.w - w; w = dm.w; }
            if (hh < dm.h) { if (dir.includes("n")) t -= dm.h - hh; hh = dm.h; }
          }
          win.style.width = w + "px"; win.style.height = hh + "px"; win.style.left = l + "px"; win.style.top = t + "px";
          // never shrink horizontally past what the content needs
          if (content && (dir.includes("e") || dir.includes("w")) && !win.querySelector(".inv-grid")) {   // inventory grids reflow to any width
            const over = content.scrollWidth - content.clientWidth;
            if (over > 0) { w += over; if (dir.includes("w")) l -= over; win.style.width = w + "px"; win.style.left = l + "px"; }
          }
        };
        const up = (ev) => { if (ev.pointerId !== id) return; removeEventListener("pointermove", mv); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); if (onEnd) onEnd(); };
        addEventListener("pointermove", mv); addEventListener("pointerup", up); addEventListener("pointercancel", up);
      });
      win.appendChild(h);
    }
  }

  // ---- window-panel buttons ----
  const ICONS = {
    player: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    pilot: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7v4l-1 3h16l-1-3V9a7 7 0 0 0-7-7z"/><path d="M9 20h6"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M4 4h16v11H9l-5 4z"/></svg>',
    fleet: '<svg viewBox="0 0 24 24"><path d="M3 12l5-3v6z"/><path d="M10 7l5-3v6z"/><path d="M10 17l5-3v6z"/><path d="M17 12l4-2.4v4.8z"/></svg>',
    market: '<svg viewBox="0 0 24 24"><path d="M4 10h16l-1.5-5h-13z"/><path d="M5 10v9h14v-9"/><path d="M10 19v-5h4v5"/></svg>',
  };
  let order = ["player", "pilot", "chat", "fleet", "market"];
  const META = {
    player: { name: "Player Sheet", pinned: true },
    pilot: { name: "Pilot" },
    chat: { name: "Chat" },
    fleet: { name: "Fleet" },
    market: { name: "Market" },
  };
  // press-and-hold (mouse or touch) → fn; the click that ends a hold is swallowed
  function holdPointer(elm, fn) {
    let t = 0, fired = false, x0 = 0, y0 = 0;
    elm.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; fired = false; x0 = e.clientX; y0 = e.clientY; clearTimeout(t); t = setTimeout(() => { fired = true; if (navigator.vibrate) navigator.vibrate(15); fn(); }, 500); });
    const cancel = () => clearTimeout(t);
    elm.addEventListener("pointermove", (e) => { if (Math.hypot(e.clientX - x0, e.clientY - y0) > 8) cancel(); });
    elm.addEventListener("pointerup", cancel); elm.addEventListener("pointerleave", cancel); elm.addEventListener("dragstart", cancel);
    elm.addEventListener("click", (e) => { if (fired) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; } }, true);
  }
  const PANEL_MENUS = {
    fleet: () => [["Horizontal", () => setFleetOrient("h")], ["Vertical", () => setFleetOrient("v")]],
  };
  const clockEl = el("div", { class: "panel-clock" });
  function renderPanel() {
    panel.innerHTML = "";
    for (const id of order) {
      const m = META[id];
      const btn = el("button", { class: "wbtn", "data-id": id, html: ICONS[id] });
      if (!m.pinned) btn.setAttribute("draggable", "true");
      btn.addEventListener("click", () => toggleWindow(id));
      if (PANEL_MENUS[id]) {
        const open = (x, y) => showCtxMenu(x, y, PANEL_MENUS[id]());
        holdPointer(btn, () => { const r = btn.getBoundingClientRect(); open(r.right + 6, r.top); });
        btn.addEventListener("contextmenu", (e) => { e.preventDefault(); open(e.clientX, e.clientY); });
      }
      // tooltip
      const showTip = () => { const r = btn.getBoundingClientRect(); tooltip.textContent = m.name; tooltip.hidden = false; tooltip.style.left = (r.right + 8) + "px"; tooltip.style.top = (r.top + r.height / 2) + "px"; };
      let t;
      btn.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") t = setTimeout(showTip, 500); });
      btn.addEventListener("pointerleave", () => { clearTimeout(t); tooltip.hidden = true; });
      btn.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") { clearTimeout(t); t = setTimeout(showTip, 250); } });
      for (const ev of ["pointerup", "pointercancel"]) btn.addEventListener(ev, (e) => { if (e.pointerType !== "mouse") { clearTimeout(t); tooltip.hidden = true; } });
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
  function updateBtnActive() { for (const b of panel.children) { const w = wins[b.getAttribute("data-id")]; b.classList.toggle("open", !!(w && isOpen(w))); } }

  // ---- Player Sheet ----
  function renderPlayer(body) {
    const slot = wins.player && wins.player.slot;
    body.innerHTML = "";
    if (!state) { if (slot) slot.textContent = "Player Sheet"; body.append(el("div", { class: "muted" }, "Loading…")); return; }
    const p = state.profile;
    if (slot) slot.textContent = p.username;
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, v && v.nodeType ? v : String(v)));
    const born = new Date(p.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    body.append(row("Day Born", born), row("Credits", cr(p.credits)), row("Pilots", p.pilotCount), row("Total Endorsement Level", p.totalSkillLevel), row("Corp", p.corp));
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
    const prof = state.profile || {};
    if (state.pilots.length < (prof.maxPilots || 3)) menu.append(el("div", { class: "dd-item", onclick: (e) => { e.stopPropagation(); closeMenu(); newPilot(body); } }, "New pilot · ", cr(prof.pilotPrice || 1000000)));
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
      const dis = k === "items";
      return el("button", { class: "tab" + (k === pilotTab ? " active" : "") + (dis ? " disabled" : ""), onclick: () => { if (dis) return; pilotTab = k; renderPilot(body); } }, n);
    })));
    const content = el("div", { class: "tab-content" }); body.append(content);
    if (pilotTab === "skills") renderSkills(content, pilot);
    else if (pilotTab === "queue") renderQueue(content, pilot);
    else if (pilotTab === "ship") renderPilotShip(content, pilot);
    else content.append(el("div", { class: "muted" }, "Coming soon."));
  }
  function renderPilotShip(content, pilot) {
    const A = window.Atamus, sh = ((A.snap && A.snap.ships) || []).find((x) => x.mine && String(x.pilot) === String(pilot.id));
    if (!sh) { content.append(el("div", { class: "muted" }, pilot.name + " isn't crewing a ship. Right-click a ship in your station hangar to crew it.")); return; }
    const t = hullOf(sh.type);
    const where = sh.docked ? "Docked at station" : sh.warp ? "Warping" : sh.moving ? "In space · moving" : "In space";
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, v && v.nodeType ? v : String(v)));
    content.append(el("div", { class: "ship-hero" }, shipIcon(sh.type, "ship-hero-img")),
      row("Ship", shipName(sh)), row("Hull", t.name + " · " + (t.cls || "—")), row("Location", where),
      el("div", { class: "unit-btns" },
        el("button", { class: "btn-primary2 unit-btn", onclick: () => A.locateShip(sh.id) }, "Locate"),
        el("button", { class: "btn-primary2 unit-btn off", onclick: () => openShipInfo(sh.type) }, "Ship info")));
  }

  function newPilot(body) {
    askText("New pilot", "", 24, async (name) => {
      if (!name) return;
      try { const r = await Api.post("/game/pilot/create", { name }); await refreshState(); if (r && r.id != null) selectedPilotId = r.id; renderPilot(body); }
      catch (e) { flash(e.message); }
    });
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
    fitOnScreen(popup);
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
        if (l.unlocks && l.unlocks[lv]) cls += " unlock";
        boxes.append(el("div", { class: cls, onclick: () => { pLevel = lv; render(); } }, lv));
      }
      inner.append(boxes);
      const tabs = [["licensing", "Licensing"], ["requirements", "Requirements"], ["requiredFor", "Required For"]];
      inner.append(el("div", { class: "tab-row" }, tabs.map(([k, n]) => el("button", { class: "tab" + (k === pTab ? " active" : ""), onclick: () => { pTab = k; render(); } }, n))));
      const c = el("div", { class: "pop-content" }); inner.append(c);
      if (pTab === "licensing") c.append(el("p", { class: "pop-desc" }, l.desc), el("p", { class: "pop-bonus" }, ((l.levelBonus && l.levelBonus[pLevel - 1]) || l.bonus) + (l.hull ? " (Lv " + pLevel + ": " + Math.round((Math.min(pLevel, 5) * 0.2 + Math.max(0, pLevel - 5) * 0.05) * 100) + "%)" : " per level")),
        ...(l.unlocks && l.unlocks[pLevel] ? [el("div", { class: "pop-unlocks" }, el("span", { class: "pop-unlocks-h" }, "Level " + pLevel + " unlocks"), ...l.unlocks[pLevel].map((t) => el("div", {}, t)))] : []),
        el("div", { class: "pop-traintime" }, "Train time (Lv " + pLevel + "): " + fmtTime(l.levelTimes[pLevel - 1])));
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
  // ---- ships & crews ----
  const hullOf = (type) => ((window.Atamus.cfg || {}).shipTypes || {})[type] || { name: type, sprite: "chisel" };
  const shipName = (sh) => (sh && sh.name) || hullOf(sh && sh.type).name || "Ship";
  const pilotName = (id) => { const p = state && state.pilots.find((x) => String(x.id) === String(id)); return p ? p.name : null; };
  const canFly = (pilot, type) => Object.entries(hullOf(type).req || {}).every(([k, lvl]) => (pilot.licenses[k] || 0) >= lvl);
  const shipIcon = (type, cls) => el("img", { class: cls || "ship-ico", src: "assets/ships/" + hullOf(type).sprite + "_blue.webp", alt: "", draggable: "false" });
  function shipMenu(sh, x, y) {
    const A = window.Atamus, items = [];
    if (sh.docked) {
      if (sh.pilot != null) items.push(["Undock", () => A.send({ t: "dock", ship: sh.id, dock: false })]);
      items.push(["Inventory", () => openInventory({ owner: "ship", id: sh.id, inv: "ore" })]);
      for (const p of (state && state.pilots) || []) {
        if (String(p.id) === String(sh.pilot)) continue;
        const ok = canFly(p, sh.type);
        items.push([(ok ? "Crew: " : "Can't crew: ") + p.name, () => { if (ok) A.send({ t: "crew", ship: sh.id, pilot: p.id }); else flash(p.name + " lacks the licences for the " + hullOf(sh.type).name + "."); }]);
      }
      if (sh.pilot != null) items.push(["Remove pilot (" + (pilotName(sh.pilot) || "pilot") + ")", () => A.send({ t: "decrew", ship: sh.id })]);
    } else items.push(["Locate", () => A.locateShip(sh.id)]);
    items.push(["Rename", () => askText("Rename ship", shipName(sh), 20, (name) => A.send({ t: "rename_ship", ship: sh.id, name }))]);
    items.push(["Info", () => openShipInfo(sh.type)]);
    showCtxMenu(x, y, items);
  }
  // Ship info in three tabs: Description, Stats, Fitting. Used by the ship info window and the market buy window.
  let shipTab = "desc";
  function shipInfoTabs(type, rerender) {
    const t = hullOf(type), wrap = el("div", { class: "ship-tabs" });
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, v && v.nodeType ? v : String(v)));
    const lic = (k) => { const l = catalog && catalog.licenses.find((x) => x.key === k); return l ? l.name : k; };
    const tabs = [["desc", "Description"], ["stats", "Stats"], ["fit", "Fitting"]];
    wrap.append(el("div", { class: "tab-row" }, tabs.map(([k, n]) => el("button", { class: "tab" + (shipTab === k ? " active" : ""), onclick: () => { shipTab = k; rerender(); } }, n))));
    if (shipTab === "stats") wrap.append(
      row("Shield / Hull", (t.shield || 0).toLocaleString() + " / " + (t.hp || 0).toLocaleString()),
      row("Max speed", Math.round((t.speedKmps || 0) * 1000) + " m/s"), row("Ore hold", (t.oreM3 || 0).toLocaleString() + " m³"),
      row("Cargo", (t.cargoM3 || 0).toLocaleString() + " m³"), row("Mining yield", (t.laserM3s || 0) + " m³/s per laser"),
      row("Targeting", (t.targetRangeKm || 0) + " km · " + (t.maxTargets || 0) + " targets"), row("Lock time", ((t.lockMs || 0) / 1000) + " s"),
      row("Length", Math.round((t.lengthKm || 0) * 1000) + " m"));
    else if (shipTab === "fit") {
      const mod = (icon, name, n) => el("div", { class: "fit-row" }, el("img", { class: "fit-ico", src: icon, alt: "", draggable: "false" }), el("span", {}, name), el("span", { class: "fit-n" }, "× " + n));
      wrap.append(el("div", { class: "fit-list" }, mod("assets/icons/mining_laser.png", "Mining Laser", t.lasers || 0), mod("assets/icons/auto_miner.png", "Auto Miner", 1)));
    } else wrap.append(el("div", { class: "ship-hero" }, shipIcon(type, "ship-hero-img")), el("div", { class: "info-desc" }, el("span", {}, t.desc || "")),
      row("Class", t.cls || "—"), row("Requires", Object.entries(t.req || {}).map(([k, l]) => lic(k) + " " + l).join(", ") || "—"));
    return wrap;
  }
  let shipInfoType = null;
  function openShipInfo(type) {
    if (!wins.shipinfo) createWindow("shipinfo", { left: Math.round(innerWidth / 2 - 170), top: 120, width: 340, minW: 280, minH: 200, render: renderShipInfo, groupable: false });
    shipInfoType = type; toggleWindow("shipinfo", true); renderShipInfo(wins.shipinfo.body);
  }
  function renderShipInfo(body) {
    const w = wins.shipinfo, t = hullOf(shipInfoType); body.innerHTML = ""; w.slot.textContent = t.name || "Ship";
    body.append(shipInfoTabs(shipInfoType, () => renderShipInfo(body)));
  }

  // The panel only rebuilds its DOM when the *structure* changes (unit, buttons);
  // numbers update in place so a button is never replaced mid-click.
  function renderUnit(body) {
    const A = window.Atamus, w = wins.unit, u = A.unit;
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, v && v.nodeType ? v : String(v)));
    const fmtM3 = (a, b) => Math.round(a).toLocaleString() + " / " + b.toLocaleString() + " m³";
    const docked = u && u.kind === "station" ? (A.snap.ships || []).filter((sh) => sh.mine && sh.docked) : [];
    const lockedRock = !!(u && (u.targets || []).some((t) => t.kind === "rock" && t.locked));
    const sig = !u ? "" : u.kind === "ship" ? ["ship", u.id, u.docked, u.warp, u.mining, u.moving, u.canDock, lockedRock, u.pilot].join("|")
      : u.kind === "station" ? ["station", docked.map((d) => d.id + ":" + d.pilot).join(","), state ? state.pilots.length : 0].join("|")
      : ["gate", u.id, u.state, u.mine].join("|");
    if (sig !== w.sig) {
      w.sig = sig; w.live = {}; body.innerHTML = "";
      if (!u) { w.slot.textContent = "Selection"; body.append(el("div", { class: "muted" }, "Nothing selected.")); return; }
      w.slot.textContent = u.name;
      const L = w.live;
      const bar = (k, cls) => { const fill = el("div", { class: "ubar-fill " + cls }); const txt = el("span", { class: "ubar-txt" }); L[k] = { fill, txt }; return el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("div", { class: "ubar" }, fill, txt)); };
      if (u.kind === "ship") {
        body.append(row("Type", u.name), row("Pilot", pilotName(u.pilot) || "No pilot"));
        const btns = el("div", { class: "unit-btns" });
        if (u.moving && !u.warp && !u.docked) btns.append(el("button", { class: "btn-primary2 unit-btn", onclick: () => A.send({ t: "warp", ship: u.id }) }, "Warp"));
        if (lockedRock && !u.docked) btns.append(el("button", { class: "btn-primary2 unit-btn" + (u.mining ? " off" : ""), onclick: () => A.send({ t: "mine", ship: u.id, on: !u.mining }) }, u.mining ? "Stop Mining" : "Mine (X)"));
        if (u.docked) btns.append(el("button", { class: "btn-primary2 unit-btn off", onclick: () => A.send({ t: "dock", ship: u.id, dock: false }) }, "Undock"));
        else if (u.canDock) btns.append(el("button", { class: "btn-primary2 unit-btn", onclick: () => A.send({ t: "dock", ship: u.id, dock: true }) }, "Dock"));
        btns.append(el("button", { class: "btn-primary2 unit-btn off", onclick: () => openInventory({ owner: "ship", id: u.id, inv: "ore" }) }, "Inventory"));
        body.append(btns);
      } else if (u.kind === "station") {
        body.append(bar("Hangar", "hold"));
        if (docked.length) body.append(el("div", { class: "hangar-head" }, "Ships in hangar"));
        for (const sh of docked) {                                   // click: select it · right-click / hold: crew, undock, info
          const t = hullOf(sh.type), who = pilotName(sh.pilot);
          const b = el("button", { class: "hangar-ship", onclick: () => A.selectShip(sh.id) },
            shipIcon(sh.type), el("span", { class: "hs-name" }, t.name || sh.type), el("span", { class: "hs-pilot" + (who ? "" : " none") }, who || "No pilot"));
          b.addEventListener("contextmenu", (e) => { e.preventDefault(); shipMenu(sh, e.clientX, e.clientY); });
          holdToOpen(b, () => { const r = b.getBoundingClientRect(); shipMenu(sh, r.left + r.width / 2, r.top + r.height / 2); });
          body.append(b);
        }
        body.append(el("div", { class: "unit-btns" },
          el("button", { class: "btn-primary2 unit-btn off", onclick: () => openInventory({ owner: "station", inv: "hangar", h: 0 }) }, "Inventory"),
          el("button", { class: "btn-primary2 unit-btn off", onclick: openMarket }, "Market")));
      } else if (u.kind === "gate") {
        const fuel = row("Fuel", ""), status = row("Status", ""); L.fuel = fuel.lastChild; L.status = status.lastChild;
        body.append(fuel, status);
        const active = u.state === "active";
        if (u.mine) body.append(el("button", { class: "btn-primary2 unit-btn" + (active ? " off" : ""), onclick: () => A.send({ t: "gate", gate: u.id, open: !active }) }, active ? "Turn Off" : "Turn On"));
      }
    }
    if (!u) return;
    const L = w.live, setBar = (k, a, b, txt) => { const x = L[k]; if (!x) return; x.fill.style.width = (b > 0 ? Math.max(0, Math.min(100, a / b * 100)) : 0) + "%"; x.txt.textContent = txt; };
    if (u.kind === "station") {
      const hs = A.inv.hangars || []; if (hs.length) { const used = hs.reduce((a, h) => a + h.used, 0), cap = hs.reduce((a, h) => a + h.cap, 0); setBar("Hangar", used, cap, fmtM3(used, cap)); }
    } else if (u.kind === "gate") {
      const active = u.state === "active";
      const fuel = active ? Math.min(u.fuelMs, u.sessionRemMs ?? u.fuelMs) : u.fuelMs;
      L.fuel.textContent = fmtClock(fuel); L.status.textContent = active ? (u.connToSys ? "Connected" : "Searching…") : "Offline";
    }
  }
  // ships are run from the HUD (targets / hotbar / action buttons) — the selection window is for structures
  window.Atamus.bus.addEventListener("select", (e) => {
    const kind = e.detail && e.detail.kind;
    if (kind === "station") { openInventory({ owner: "station", inv: "hangar", h: 0 }); toggleWindow("unit", false); return; }
    if (kind === "ship" && !wins.unit.group) { toggleWindow("unit", false); return; }
    toggleWindow("unit", true); renderUnit(wins.unit.body);
  });
  window.Atamus.bus.addEventListener("deselect", () => toggleWindow("unit", false));
  // inventories follow the selection: a ship in space shows only its own; the station's (and docked ships' holds)
  // stay up only while the station or a docked ship is selected
  const closeUnselectedInvs = (u) => {
    const A = window.Atamus, keep = u && u.kind === "ship" ? u.id : null, keepShip = keep != null ? A.ship(keep) : null;
    const stationKept = !!u && (u.kind === "station" || !!(keepShip && keepShip.docked));
    for (const key in invWins) {
      if (!isOpen(wins[key])) continue;
      const r = invWins[key].root || invWins[key].ref, sh = r.owner === "ship" ? A.ship(r.id) : null;
      const atStation = r.owner === "station" || !!(sh && sh.docked);
      if (atStation ? !stationKept : (r.owner === "ship" && r.id !== keep)) toggleWindow(key, false);
    }
  };
  const closeOtherShipInvs = (e) => closeUnselectedInvs(e.detail);
  let selDocked = null;                                    // the selected ship just undocked: the station's windows go
  window.Atamus.bus.addEventListener("snap", () => {
    const u = window.Atamus.selectedUnit, sh = u && u.kind === "ship" ? window.Atamus.ship(u.id) : null;
    const d = sh ? sh.id + ":" + sh.docked : null;
    if (d !== selDocked) { const was = selDocked; selDocked = d; if (was && sh && was === sh.id + ":true" && !sh.docked) closeUnselectedInvs(u); }
  });
  window.Atamus.bus.addEventListener("select", closeOtherShipInvs);
  window.Atamus.bus.addEventListener("deselect", closeOtherShipInvs);
  window.Atamus.bus.addEventListener("openstation", () => openInventory({ owner: "station", inv: "hangar", h: 0 }));
  window.Atamus.bus.addEventListener("snap", () => {
    const w = wins.unit; if (w && isOpen(w)) renderUnit(w.body);
    // a docked ship's holds are reached through the station inventory: close its own windows
    for (const key in invWins) { const r = invWins[key].root || invWins[key].ref; if (r.owner !== "ship" || invWins[key].solo || !isOpen(wins[key])) continue; const sh = window.Atamus.ship(r.id); if (!sh || sh.docked) toggleWindow(key, false); }
  });


  // ---- bottom HUD for the selected ship: target icons / status / hotbar ----
  const hud = el("div", { id: "hud", hidden: "" });
  const hudTargets = el("div", { class: "hud-targets" }), hudStatus = el("div", { class: "hud-status" }), hudBar = el("div", { class: "hud-hotbar" });
  const hudAct = el("div", { class: "hud-actions", hidden: "" });   // fallback home for ship actions when the fleet bar is closed
  hud.append(hudTargets, hudStatus, el("div", { class: "hud-row" }, hudBar, hudAct)); document.body.append(hud);
  const ICO = {
    inv: '<svg viewBox="0 0 24 24"><path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>',
    dock: '<svg viewBox="0 0 24 24"><path d="M12 3v11M7 9l5 5 5-5"/><path d="M4 17h16v3H4z"/></svg>',
    warp: '<svg viewBox="0 0 24 24"><path d="M3 12h11M10 7l5 5-5 5"/><path d="M17 6v12M21 8v8"/></svg>',
  };
  const HB_SLOTS = 8;
  saved.hotbar = Array.isArray(saved.hotbar) && saved.hotbar.length === HB_SLOTS ? saved.hotbar : [{ k: "laser", i: 0 }, { k: "laser", i: 1 }, { k: "auto" }, null, null, null, null, null];
  if (!saved.hotbar.some((h) => h && h.k === "auto")) { const i = saved.hotbar.findIndex((h) => !h); if (i >= 0) saved.hotbar[i] = { k: "auto" }; }
  const tgKey = (tg) => tg.kind + ":" + tg.id;
  let hudShip = null, selTarget = null, hudSig = "", hudLive = {}, tgOrder = [];
  const H = {};  // status row live elements
  function hudShipData() { const A = window.Atamus, u = A.unit; return u && u.kind === "ship" ? A.ship(u.id) : null; }
  function orderedTargets(sh) {
    const keys = (sh.targets || []).map(tgKey);
    tgOrder = tgOrder.filter((k) => keys.includes(k)); for (const k of keys) if (!tgOrder.includes(k)) tgOrder.push(k);
    return tgOrder.map((k) => sh.targets.find((t) => tgKey(t) === k));
  }
  function clickLaser(sh, idx) {
    const A = window.Atamus, L = sh.lasers && sh.lasers[idx]; if (!L || L.off) return;
    const rock = selTarget && selTarget.kind === "rock" ? selTarget.id : null;
    if (L.on) { A.send({ t: "laser", ship: sh.id, idx, on: !L.repeat }); return; }   // active: toggle whether it repeats after this cycle
    A.send({ t: "laser", ship: sh.id, idx, on: true, rock });
  }
  // generic reorder drag (mouse via HTML5 DnD, touch via touchDrag) over a row of cells
  function reorderable(cell, kind, index, onDrop, onHold) {
    cell.setAttribute("draggable", "true");
    cell.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", JSON.stringify({ [kind]: index })); e.dataTransfer.effectAllowed = "move"; });
    cell.addEventListener("dragover", (e) => { e.preventDefault(); cell.classList.add("drop"); });
    cell.addEventListener("dragleave", () => cell.classList.remove("drop"));
    cell.addEventListener("drop", (e) => { e.preventDefault(); cell.classList.remove("drop"); const d = dragPayload(e); if (d && d[kind] != null) onDrop(d[kind], index); });
    cell.addEventListener("touchdrop", (e) => { const d = e.detail; if (d && d[kind] != null) onDrop(d[kind], index); });
    touchDrag(cell, { [kind]: index }, onHold || (() => {}));
  }
  // ---- hotbar module menu (right-click / hold): activate, power, info ----
  const modName = (it) => it.k === "auto" ? "Auto Miner" : "Mining Laser " + (it.i + 1);
  function moduleMenu(sh, it, x, y) {
    const A = window.Atamus, items = [];
    if (it.k === "laser") {
      const L = (sh.lasers || [])[it.i]; if (!L) return;
      if (!L.off) {
        if (!L.on) items.push(["Activate", () => clickLaser(sh, it.i)]);
        else items.push([L.repeat ? "Deactivate" : "Keep cycling", () => A.send({ t: "laser", ship: sh.id, idx: it.i, on: !L.repeat })]);
      }
      items.push([L.off ? "Power on" : "Power off", () => A.send({ t: "power", ship: sh.id, mod: "laser", idx: it.i, on: !!L.off })]);
    } else {
      const au = sh.auto || {};
      if (!au.off) items.push([au.on ? "Deactivate" : "Activate", () => A.send({ t: "auto", ship: sh.id, on: !au.on })]);
      items.push([au.off ? "Power on" : "Power off", () => A.send({ t: "power", ship: sh.id, mod: "auto", on: !!au.off })]);
    }
    items.push(["Info", () => openModuleInfo(sh.id, it)]);
    showCtxMenu(x, y, items);
  }
  let modInfo = null;
  function openModuleInfo(shipId, it) {
    if (!wins.modinfo) createWindow("modinfo", { left: Math.round(innerWidth / 2 - 160), top: Math.round(innerHeight / 2 - 140), width: 320, minW: 260, minH: 160, render: renderModuleInfo, groupable: false });
    modInfo = { shipId, it }; wins.modinfo.sig = null; toggleWindow("modinfo", true); renderModuleInfo(wins.modinfo.body);
  }
  function renderModuleInfo(body) {
    const A = window.Atamus, w = wins.modinfo, sh = modInfo && A.ship(modInfo.shipId); if (!sh) return;
    const it = modInfo.it, L = it.k === "laser" ? (sh.lasers || [])[it.i] : null, au = sh.auto || {};
    const state = it.k === "laser" ? (!L ? "—" : L.off ? "Powered off" : L.on ? (L.repeat ? "Cycling" : "Finishing cycle") : "Idle")
      : au.off ? "Powered off" : au.on ? "Active" : "Idle";
    const rock = L && L.on && L.rock ? (A.targetInfo(sh, { kind: "rock", id: L.rock }) || {}).name : null;
    const sig = [sh.id, it.k, it.i, state, rock, sh.yieldM3s, sh.laserRange, L && L.dur, au.cyc].join("|");
    if (sig === w.sig && body.childElementCount) return; w.sig = sig; body.innerHTML = "";
    w.slot.textContent = modName(it);
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v)));
    const secs = (ms) => (ms / 1000 >= 60 ? Math.floor(ms / 60000) + ":" + String(Math.round(ms / 1000) % 60).padStart(2, "0") : (ms / 1000).toFixed(1) + " s");
    const icon = it.k === "auto" ? "assets/icons/auto_miner.png" : "assets/icons/mining_laser.png";
    if (it.k === "laser") {
      const dur = (L && L.dur) || A.cfg.cycleMs || 15000;
      body.append(el("div", { class: "info-desc" }, el("img", { class: "info-icon", src: icon, alt: "" }), el("span", {}, "Cuts ore from a locked asteroid. The ore lands in the ore hold when each cycle completes.")),
        row("Ship", shipName(sh)), row("Status", state), ...(rock ? [row("Target", rock)] : []),
        row("Cycle time", secs(dur)), row("Yield per cycle", ((sh.yieldM3s || 0) * dur / 1000).toFixed(1) + " m³"),
        row("Range", (sh.laserRange || A.cfg.laserRange || 0).toFixed(2) + " km"));
    } else {
      body.append(el("div", { class: "info-desc" }, el("img", { class: "info-icon", src: icon, alt: "" }), el("span", {}, "Each cycle, puts every idle mining laser on the first locked asteroid in range.")),
        row("Ship", shipName(sh)), row("Status", state), row("Cycle time", secs(au.cyc || 180000)));
    }
  }
  window.Atamus.bus.addEventListener("snap", () => { const w = wins.modinfo; if (w && isOpen(w)) renderModuleInfo(w.body); });
  function renderHud() {
    const A = window.Atamus, sh = hudShipData();
    renderShipActions();
    if (!sh || sh.docked) { if (!hud.hidden) { hud.hidden = true; A.hud.line = null; } hudShip = null; return; }
    if (hudShip !== sh.id) { hudShip = sh.id; selTarget = null; tgOrder = []; }
    hud.hidden = false;
    const t = (A.cfg.shipTypes || {})[sh.type] || {};
    const targets = orderedTargets(sh);
    if (selTarget && !targets.some((x) => x && tgKey(x) === tgKey(selTarget))) selTarget = null;
    const sig = [sh.id, sh.canDock, sh.moving && !sh.warp, targets.map((x) => tgKey(x) + (x.locked ? 1 : 0)).join(","), selTarget && tgKey(selTarget), (sh.lasers || []).map((l) => (l.on ? 1 : 0) + (l.repeat ? 1 : 0) + (l.off ? "x" : "") + (l.rock || "")).join(","), sh.auto && sh.auto.on ? 1 : 0, sh.auto && sh.auto.off ? 1 : 0, saved.hotbar.map((h) => h ? h.k + (h.i ?? "") : "-").join(",")].join("|");
    if (sig !== hudSig) {
      hudSig = sig; hudLive = { dist: {}, tip: null };
      // targets
      hudTargets.innerHTML = "";
      targets.forEach((tg, idx) => {
        const info = A.targetInfo(sh, tg) || {};
        const isSel = selTarget && tgKey(selTarget) === tgKey(tg);
        const cell = el("div", { class: "tgt" + (tg.locked ? " locked" : "") + (isSel ? " sel" : "") });
        const ring = el("div", { class: "tgt-ring" }, info.icon ? el("img", { src: info.icon, alt: "", draggable: "false" }) : null);
        const x = el("button", { class: "tgt-x", title: "Untarget", onclick: (e) => { e.stopPropagation(); A.send({ t: "lock", ship: sh.id, kind: tg.kind, id: tg.id }); } }, "×");
        const dist = el("div", { class: "tgt-dist" });
        hudLive.dist[tgKey(tg)] = dist;
        cell.append(ring, x, dist);
        if (isSel) { const tip = el("div", { class: "tgt-tip" }, el("div", { class: "tgt-tip-name" }, info.name || ""), el("div", { class: "tgt-tip-sub" })); hudLive.tip = tip.lastChild; hudLive.tipCell = cell; cell.append(tip); }
        cell.addEventListener("click", () => { selTarget = isSel ? null : { kind: tg.kind, id: tg.id }; renderHud(); });
        reorderable(cell, "tg", idx, (from, to) => { const k = tgOrder.splice(from, 1)[0]; tgOrder.splice(to, 0, k); hudSig = ""; renderHud(); });
        hudTargets.append(cell);
      });
      // status
      hudStatus.innerHTML = "";
      const bar = (k, cls) => { const fill = el("div", { class: "ubar-fill " + cls }); const txt = el("span", { class: "ubar-txt" }); H[k] = { fill, txt }; return el("div", { class: "hud-bar" }, el("span", { class: "hud-k" }, k), el("div", { class: "ubar" }, fill, txt)); };
      H.speed = el("span", { class: "hud-speed" });
      hudStatus.append(bar("Shield", "shield"), bar("Hull", "hull"), el("div", { class: "hud-bar" }, el("span", { class: "hud-k" }, "Speed"), H.speed));
      // hotbar
      hudBar.innerHTML = ""; hudLive.slots = [];
      saved.hotbar.forEach((it, idx) => {
        const slot = el("div", { class: "hb-slot" });
        if (it && it.k === "laser") {
          const L = (sh.lasers || [])[it.i];
          if (L) {
            slot.classList.add("filled"); if (L.on) slot.classList.add("on"); if (L.on && !L.repeat) slot.classList.add("stopping"); if (L.off) slot.classList.add("off");
            slot.append(el("img", { class: "hb-img", src: "assets/icons/mining_laser.png", alt: "", draggable: "false" }), el("span", { class: "hb-badge" }, String(it.i + 1)));
            slot.title = "Mining Laser " + (it.i + 1) + (L.on ? (L.repeat ? " — cycling" : " — finishing cycle") : "");
            slot.addEventListener("click", () => clickLaser(sh, it.i));
            hudLive.slots.push({ slot, laser: it.i });
          }
        } else if (it && it.k === "auto") {
          slot.classList.add("filled"); if (sh.auto && sh.auto.on) slot.classList.add("on"); if (sh.auto && sh.auto.off) slot.classList.add("off");
          slot.append(el("img", { class: "hb-img", src: "assets/icons/auto_miner.png", alt: "", draggable: "false" }));
          slot.title = "Auto Miner" + (sh.auto && sh.auto.on ? " — active" : "");
          slot.addEventListener("click", () => A.send({ t: "auto", ship: sh.id, on: !(sh.auto && sh.auto.on) }));
          hudLive.slots.push({ slot, auto: true });
        }
        slot.append(el("span", { class: "hb-num" }, String(idx + 1)));
        const menu = it && slot.classList.contains("filled") ? () => { const r = slot.getBoundingClientRect(); moduleMenu(hudShipData() || sh, it, r.left, r.top - 4); } : null;
        if (menu) slot.addEventListener("contextmenu", (e) => { e.preventDefault(); const live = hudShipData() || sh; moduleMenu(live, it, e.clientX, e.clientY); });
        reorderable(slot, "hb", idx, (from, to) => { if (from === to) return; const a = saved.hotbar; [a[from], a[to]] = [a[to], a[from]]; persistAll(); hudSig = ""; renderHud(); }, menu);
        hudBar.append(slot);
      });
    }
    // live values
    for (const tg of targets) { const d = hudLive.dist[tgKey(tg)]; const info = A.targetInfo(sh, tg); if (d && info) d.textContent = info.dist < 10 ? info.dist.toFixed(1) + " km" : Math.round(info.dist) + " km"; }
    if (hudLive.tip && selTarget) { const info = A.targetInfo(sh, selTarget); if (info) hudLive.tip.textContent = (info.dist < 10 ? info.dist.toFixed(2) : Math.round(info.dist)) + " km" + (info.sub ? " · " + info.sub : ""); }
    const setBar = (k, a, b, txt) => { const x = H[k]; if (!x) return; x.fill.style.width = (b > 0 ? Math.max(0, Math.min(100, a / b * 100)) : 0) + "%"; x.txt.textContent = txt; };
    const maxS = t.shield || 0, maxH = t.hp || 0;
    setBar("Shield", sh.shield ?? maxS, maxS, Math.round(sh.shield ?? maxS) + " / " + maxS); setBar("Hull", sh.hp ?? maxH, maxH, Math.round(sh.hp ?? maxH) + " / " + maxH);
    H.speed.textContent = Math.round((sh.spd || 0) * 1000) + " / " + Math.round((t.speedKmps || 0) * 1000) + " m/s";
    for (const q of hudLive.slots || []) { const p = q.auto ? (sh.auto ? sh.auto.p : 0) : ((sh.lasers[q.laser] || {}).p || 0); q.slot.style.setProperty("--p", (p * 100).toFixed(1) + "%"); }
    // line from the selected target's icon to the target on the map
    if (selTarget && hudLive.tipCell) { const r = hudLive.tipCell.querySelector(".tgt-ring").getBoundingClientRect(); A.hud.line = { x: r.left + r.width / 2, y: r.top + r.height / 2, tg: selTarget }; }
    else A.hud.line = null;
  }
  window.Atamus.bus.addEventListener("snap", renderHud);
  let pilotShipSig = "";                              // keep the pilot's Current Ship tab live (location changes)
  window.Atamus.bus.addEventListener("snap", () => {
    if (!wins.pilot || !isOpen(wins.pilot) || pilotTab !== "ship") return;
    const sig = ((window.Atamus.snap.ships) || []).filter((x) => x.mine).map((x) => x.id + x.pilot + x.docked + x.warp + x.moving + (x.name || "")).join(",");
    if (sig !== pilotShipSig) { pilotShipSig = sig; renderPilot(wins.pilot.body); }
  });
  window.Atamus.bus.addEventListener("select", renderHud);
  window.Atamus.bus.addEventListener("deselect", renderHud);
  setInterval(renderHud, 500);                       // safety net: never leave the HUD up for a ship that's gone

  // actions for the selected ship: anchored to the fleet bar (or beside the hotbar if the bar is closed)
  let actSig = "";
  function renderShipActions() {
    const A = window.Atamus, u = A.unit, sh = u && u.kind === "ship" ? A.ship(u.id) : null;
    const fleetOpen = wins.fleet && isOpen(wins.fleet);
    const host = fleetOpen ? wins.fleet.acts : hudAct;
    const sig = [fleetOpen, sh && sh.id, sh && sh.docked, sh && sh.canDock, sh && sh.moving && !sh.warp].join("|");
    if (sig === actSig) return; actSig = sig;
    for (const h of [hudAct, wins.fleet && wins.fleet.acts]) if (h) { h.innerHTML = ""; h.hidden = true; }
    if (!sh || sh.docked) return;
    const act = (ico, title, fn) => el("button", { class: "hud-act", title, "aria-label": title, html: ICO[ico], onclick: fn });
    host.append(act("inv", "Inventory", () => { const w = wins["inv:" + sh.id]; if (w && isOpen(w)) toggleWindow("inv:" + sh.id, false); else openInventory({ owner: "ship", id: sh.id, inv: "ore" }); }));
    if (sh.canDock) host.append(act("dock", "Dock", () => A.send({ t: "dock", ship: sh.id, dock: true })));
    if (sh.moving && !sh.warp) host.append(act("warp", "Warp", () => A.send({ t: "warp", ship: sh.id })));
    host.hidden = false;
  }
  saved.fleetOrient = saved.fleetOrient === "v" ? "v" : "h";
  function setFleetOrient(o) {
    saved.fleetOrient = o; const w = wins.fleet; if (!w) return;
    toggleWindow("fleet", true); persistWin("fleet"); w.fsig = null; renderFleet(w.body); actSig = ""; renderShipActions();
  }

  // ---- fleet bar: every crewed ship, docked or not, with a split shield|hull bar ----
  // Resize it wide for a horizontal bar or tall for a vertical one; grips at both ends move it.
  function renderFleet(body) {
    const A = window.Atamus, w = wins.fleet;
    const ships = ((A.snap && A.snap.ships) || []).filter((x) => x.mine && x.pilot != null);
    const sel = new Set(A.selectedShips || []);
    const sig = ships.map((x) => x.id + x.type + x.pilot + (x.name || "") + (x.docked ? "d" : "")).join(",");
    if (sig !== w.fsig) {
      w.fsig = sig; w.cards = {}; body.innerHTML = "";
      const list = el("div", { class: "fleet-list" });
      if (!ships.length) list.append(el("div", { class: "fleet-empty" }, "No crewed ships"));
      for (const sh of ships) {
        const t = hullOf(sh.type), sf = el("div", { class: "fb-sh" }), hf = el("div", { class: "fb-hp" });
        const card = el("button", { class: "fleet-card" },
          el("div", { class: "fleet-img" }, shipIcon(sh.type, "fleet-ship")),
          el("div", { class: "fleet-bar" }, el("div", { class: "fb-half" }, sf), el("div", { class: "fb-half" }, hf)),
          el("div", { class: "fleet-name" }, sh.name || pilotName(sh.pilot) || t.name));
        card.addEventListener("click", () => { const cur = A.ship(sh.id); if (!cur) return; if (cur.docked) openInventory({ owner: "ship", id: cur.id, inv: "ore" }); else A.selectShip(sh.id); });
        card.addEventListener("dblclick", () => A.locateShip(sh.id));
        card.addEventListener("contextmenu", (e) => { e.preventDefault(); const cur = A.ship(sh.id); if (cur) shipMenu(cur, e.clientX, e.clientY); });
        holdToOpen(card, () => { const cur = A.ship(sh.id), r = card.getBoundingClientRect(); if (cur) shipMenu(cur, r.left + r.width / 2, r.bottom); });
        w.cards[sh.id] = { card, sf, hf };
        list.append(card);
      }
      body.append(list);
    }
    for (const sh of ships) {
      const c = w.cards[sh.id]; if (!c) continue; const t = hullOf(sh.type);
      c.sf.style.width = (t.shield ? Math.max(0, Math.min(1, (sh.shield ?? t.shield) / t.shield)) * 100 : 0) + "%";
      c.hf.style.width = (t.hp ? Math.max(0, Math.min(1, (sh.hp ?? t.hp) / t.hp)) * 100 : 0) + "%";
      c.card.classList.toggle("sel", sel.has(sh.id)); c.card.classList.toggle("docked", !!sh.docked);
    }
    // the bar is exactly as big as its ships; it only wraps to a second row/column when it would leave the screen
    const vert = saved.fleetOrient === "v"; w.win.classList.toggle("vertical", vert);
    const list = body.querySelector(".fleet-list"), r = w.win.getBoundingClientRect(), n = Math.max(1, ships.length);
    if (vert) { const fit = Math.max(1, Math.floor((innerHeight - r.top - 16) / 62)); list.style.gridAutoFlow = "column"; list.style.gridTemplateRows = "repeat(" + Math.min(n, fit) + ", auto)"; list.style.gridTemplateColumns = ""; }
    else { const fit = Math.max(1, Math.floor((innerWidth - r.left - 16) / 70)); list.style.gridAutoFlow = "row"; list.style.gridTemplateColumns = "repeat(" + Math.min(n, fit) + ", 66px)"; list.style.gridTemplateRows = ""; }
    w.win.style.width = "auto"; w.win.style.height = "auto";
    const b = w.win.getBoundingClientRect(), side = vert ? (b.left + b.width / 2 < innerWidth / 2 ? "right" : "left") : (b.top + b.height / 2 < innerHeight / 2 ? "below" : "above");
    for (const k of ["above", "below", "left", "right"]) w.win.classList.toggle("acts-" + k, k === side);
  }
  window.Atamus.bus.addEventListener("snap", () => { const w = wins.fleet; if (w && isOpen(w)) renderFleet(w.body); });
  window.Atamus.bus.addEventListener("select", () => { actSig = ""; renderShipActions(); });
  window.Atamus.bus.addEventListener("deselect", () => { actSig = ""; renderShipActions(); });

  // ---- inventories: slot grids with drag/drop ----
  const invKey = (ref) => ref.owner === "can" ? "can:" + ref.id : ref.owner === "station" ? (ref.inv === "delivery" ? "station:delivery" : "station:hangar:" + (ref.h | 0)) : "ship:" + ref.id + ":" + ref.inv;
  const invData = (ref) => { const A = window.Atamus; if (ref.owner === "can") return (A.inv.cans || {})[ref.id] || null; if (ref.owner === "station" && ref.inv === "delivery") return A.inv.delivery || null; if (ref.owner === "station") return (A.inv.hangars || [])[ref.h | 0] || null; const s = (A.inv.ships || {})[ref.id]; return s ? s[ref.inv] : null; };
  const hangarName = (h) => (((window.Atamus.inv.hangars || [])[h | 0]) || {}).name || "Hangar " + ((h | 0) + 1);
  const holdName = (inv) => inv === "ore" ? "Ore hold" : inv === "cargo" ? "Cargo" : inv;
  const invLabel = (ref) => ref.owner === "can" ? "Jettison can" : ref.owner === "station" ? (ref.inv === "delivery" ? "Deliveries" : hangarName(ref.h)) : shipName(window.Atamus.ship(ref.id)) + " · " + holdName(ref.inv);
  const invWins = {}; // key -> { ref (what's shown), root (the window's holder), solo }
  const shipHolds = (id) => { const s = (window.Atamus.inv.ships || {})[id] || {}; return ["ore", "cargo"].filter((k) => s[k] && s[k].cap > 0); };
  function invTabsFor(ref) {
    if (ref.owner === "can") return [ref];
    if (ref.owner === "station") return ((window.Atamus.inv.hangars) || [{}]).map((_, h) => ({ owner: "station", inv: "hangar", h }));
    return shipHolds(ref.id).map((inv) => ({ owner: "ship", id: ref.id, inv }));
  }
  saved.invOpen = saved.invOpen || {};               // which ships are expanded in the station inventory's ship list
  function renameHangar(tabEl, h) {
    const input = el("input", { class: "tab-rename", value: hangarName(h), maxlength: "20" });
    tabEl.replaceChildren(input); input.focus(); input.select();
    const done = (ok) => { if (ok && input.value.trim()) window.Atamus.send({ t: "rename_hangar", h, name: input.value }); for (const k in invWins) invWins[k].sig = null; for (const k in invWins) if (isOpen(wins[k])) renderInventory(k, wins[k].body); };
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); });
    input.addEventListener("blur", () => done(true));
    input.addEventListener("click", (e) => e.stopPropagation());
  }
  function watchInvResize(key) { const b = wins[key].body; new ResizeObserver(() => { if (isOpen(wins[key])) renderInventory(key, b); }).observe(b); }
  // An inventory window must keep its tabs (hangars / holds) and at least one slot in view.
  function invMinSize(key) {
    const w = wins[key]; if (!w) return null;
    const win = w.win, wr = win.getBoundingClientRect(), body = w.body;
    const tabs = w.slot.querySelector(".tab-row"), close = w.close;
    const titlePad = 22 + 8 + (close ? close.offsetWidth : 20);
    let minW = 66;
    if (tabs) { const kids = [...tabs.children]; minW = Math.max(minW, kids.reduce((a, k) => a + k.offsetWidth, 0) + 3 * Math.max(0, kids.length - 1) + titlePad); }   // every tab at full width
    let minH = 90;
    const cell = body.querySelector(".inv-cell");
    if (cell) minH = Math.max(minH, Math.ceil(cell.getBoundingClientRect().bottom - wr.top + body.scrollTop + 12));
    return { w: Math.ceil(minW), h: minH };
  }
  function enforceInvMin(key) {
    const w = wins[key], m = invMinSize(key); if (!w || !m || !isOpen(w)) return;
    const win = w.win, r = win.getBoundingClientRect();
    if (r.width < m.w - 0.5) win.style.width = m.w + "px";
    if (win.style.height && r.height < m.h - 0.5) win.style.height = m.h + "px";
  }
  function makeInvWindow(key, st) {
    if (invWins[key]) return;
    invWins[key] = st;
    createWindow(key, st.solo
      ? { left: 400, top: 200, width: 420, minW: 66, minH: 90, render: (b) => renderInventory(key, b), groupable: false, dynMin: () => invMinSize(key) }
      : { left: 360, top: 160, width: 420, minW: 66, minH: 90, render: (b) => renderInventory(key, b), label: key === "inv:station" ? "Station" : "Inventory", dynMin: () => invMinSize(key) });   // down to tabs + one slot
    watchInvResize(key);
  }
  function openInventory(ref) {
    const sh = ref.owner === "ship" ? window.Atamus.ship(ref.id) : null;
    const viaStation = ref.owner === "station" || (sh && sh.docked);          // a docked ship's holds live under the station window
    const key = viaStation ? "inv:station" : "inv:" + ref.id;                 // one window per holder; tabs switch inside
    makeInvWindow(key, { ref, root: viaStation ? { owner: "station", inv: "hangar", h: 0 } : ref });
    invWins[key].ref = ref; invWins[key].sig = null;
    if (viaStation && ref.owner === "ship") { saved.invOpen[ref.id] = true; persistAll(); }
    toggleWindow(key, true); renderInventory(key, wins[key].body);
  }
  function openInventoryAlone(ref) {           // shift-click a tab: its own window
    const key = "inv:" + invKey(ref);
    makeInvWindow(key, { ref, solo: true });
    toggleWindow(key, true); renderInventory(key, wins[key].body);
  }
  // after a reload: reopen the inventories (and market) that were open, then rebuild tab groups
  function restoreWorldWindows() {
    const A = window.Atamus;
    for (const [key, st] of Object.entries(saved.invs || {})) {
      if (!st || !st.open || !st.ref) continue;
      const holder = st.solo ? st.ref : (st.root || st.ref);
      if (holder.owner === "ship" && !A.ship(holder.id)) continue;                         // ship is gone
      if (!st.solo && key !== "inv:station" && A.ship(holder.id) && A.ship(holder.id).docked) continue; // its holds now live under the station
      makeInvWindow(key, { ref: st.ref, root: st.root, solo: st.solo });
      toggleWindow(key, true);
    }
    if (saved.win.market && saved.win.market.open) openMarket();
    restoreGroups();
  }
  window.Atamus.bus.addEventListener("worldready", restoreWorldWindows, { once: true });
  const dragPayload = (e) => { try { return JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return null; } };
  function dropTarget(elm, to, A) {
    elm.addEventListener("dragover", (e) => { e.preventDefault(); elm.classList.add("drop"); });
    elm.addEventListener("dragleave", () => elm.classList.remove("drop"));
    elm.addEventListener("drop", (e) => { e.preventDefault(); e.stopPropagation(); elm.classList.remove("drop"); const d = dragPayload(e); if (d && d.ref) A.send({ t: "inv_move", from: d.ref, to }); });
    elm.addEventListener("touchdrop", (e) => { e.stopPropagation(); if (e.detail && e.detail.ref) A.send({ t: "inv_move", from: e.detail.ref, to }); });
  }
  function renderInventory(key, body) {
    const w = wins[key], st = invWins[key]; if (!w || !st) return;
    const A = window.Atamus, ref = st.ref, data = invData(ref);
    const items = (A.cfg && A.cfg.items) || {}, maxStacks = (A.cfg && A.cfg.maxStacks) || 100;
    const root = st.root || ref, station = !st.solo && root.owner === "station";
    const tabs = st.solo ? [] : invTabsFor(root);              // tabs belong to the window's holder, not the tab being viewed
    const docked = station ? (A.snap.ships || []).filter((x) => x.mine && x.docked) : [];
    // slots flow into as many columns as the grid area fits: one cell per stack plus one empty cell to drop into
    const stacked = station && body.clientWidth < 230;           // too narrow for the ship list beside the grid: it goes above
    const SIDE = station && !stacked ? 128 : 0, CELL = 36, GAP = 3, cols = Math.max(1, Math.floor((body.clientWidth - SIDE + GAP) / (CELL + GAP)));
    const n = data ? data.slots.length : 0, total = Math.min(maxStacks, n + 1);
    // rebuild only when the structure changes; quantities update in place
    const deliv = A.inv.delivery;
    const sig = [invKey(ref), deliv ? deliv.stacks : 0, docked.map((d) => d.name || "").join(","), tabs.map((t) => invKey(t) + (t.owner === "station" ? hangarName(t.h) : "")).join(","), docked.map((d) => d.id + (saved.invOpen[d.id] ? 1 : 0) + shipHolds(d.id).join("")).join(","),
      data ? data.slots.map((x) => x.item).join(",") : "-", cols, total, stacked].join("|");
    if (sig !== st.sig) {
      st.sig = sig; st.live = { qty: [] };
      body.innerHTML = ""; w.slot.innerHTML = "";
      if (!st.solo) {
        const row = el("div", { class: "tab-row" });
        for (const t of tabs) {
          const active = invKey(t) === invKey(ref);
          const label = t.owner === "can" ? "Jettison can" : t.owner === "station" ? hangarName(t.h) : (t.inv === "ore" ? "Ore" : "Cargo");
          const b = el("button", { class: "tab" + (active ? " active" : ""), onclick: (e) => { if (e.shiftKey) openInventoryAlone(t); else { st.ref = t; renderInventory(key, body); persistWin(key); } } }, label);
          dropTarget(b, { ...t, slot: null }, A);
          const menu = (x, y) => showCtxMenu(x, y, [["Open in new window", () => openInventoryAlone(t)], ...(t.owner === "station" ? [["Rename", () => renameHangar(b, t.h)]] : [])]);
          b.addEventListener("contextmenu", (e) => { e.preventDefault(); menu(e.clientX, e.clientY); });
          if (t.owner === "station") b.addEventListener("dblclick", () => renameHangar(b, t.h));
          holdToOpen(b, () => { const r = b.getBoundingClientRect(); menu(r.left + r.width / 2, r.bottom); });
          row.append(b);
        }
        w.slot.append(row);
      } else w.slot.textContent = invLabel(ref);
      let main = body;
      if (station) {                                   // ships docked here, each with its holds; click to view, drop to move
        const side = el("div", { class: "inv-side" }, el("div", { class: "inv-side-h" }, "Ships"));
        if (!docked.length) side.append(el("div", { class: "inv-side-empty" }, "No ships docked"));
        for (const d of docked) {
          const open = !!saved.invOpen[d.id];
          const head = el("button", { class: "inv-side-ship" + (open ? " open" : ""), onclick: () => { saved.invOpen[d.id] = !open; persistAll(); renderInventory(key, body); } },
            el("span", { class: "mk-caret" }, "▸"), shipIcon(d.type), el("span", { class: "iss-name" }, shipName(d)));
          head.addEventListener("contextmenu", (e) => { e.preventDefault(); shipMenu(d, e.clientX, e.clientY); });
          holdToOpen(head, () => { const r = head.getBoundingClientRect(); shipMenu(d, r.left + r.width / 2, r.bottom); });
          side.append(head);
          if (!open) continue;
          for (const inv of shipHolds(d.id)) {
            const cref = { owner: "ship", id: d.id, inv };
            const c = el("button", { class: "inv-side-c" + (invKey(cref) === invKey(ref) ? " active" : ""), onclick: (e) => { if (e.shiftKey) openInventoryAlone(cref); else { st.ref = cref; renderInventory(key, body); persistWin(key); } } }, holdName(inv));
            dropTarget(c, { ...cref, slot: null }, A);
            c.addEventListener("contextmenu", (e) => { e.preventDefault(); showCtxMenu(e.clientX, e.clientY, [["Open in new window", () => openInventoryAlone(cref)]]); });
            side.append(c);
          }
        }
        const dref = { owner: "station", inv: "delivery" };
        const dl = el("button", { class: "inv-side-deliv" + (invKey(dref) === invKey(ref) ? " active" : ""), onclick: (e) => { if (e.shiftKey) openInventoryAlone(dref); else { st.ref = dref; renderInventory(key, body); persistWin(key); } } },
          el("span", {}, "Deliveries"), deliv && deliv.stacks ? el("span", { class: "deliv-count" }, deliv.stacks) : null);
        dropTarget(dl, { ...dref, slot: null }, A);
        dl.addEventListener("contextmenu", (e) => { e.preventDefault(); showCtxMenu(e.clientX, e.clientY, [["Open in new window", () => openInventoryAlone(dref)]]); });
        side.append(el("div", { class: "inv-side-fill" }), el("div", { class: "inv-side-div" }), dl);
        main = el("div", { class: "inv-main" });
        body.append(el("div", { class: "inv-split" + (stacked ? " stacked" : "") }, side, main));
        if (ref.owner === "ship" || ref.inv === "delivery") main.append(el("div", { class: "inv-viewing" }, invLabel(ref)));
      }
      if (!data) { main.append(el("div", { class: "muted" }, "No inventory.")); return; }
      const fill = el("div", { class: "inv-cap-fill" }), stat = el("span", { class: "inv-stat" });
      st.live.fill = fill; st.live.stat = stat;
      main.append(el("div", { class: "inv-head" }, el("div", { class: "inv-cap" }, fill), stat,
        el("button", { class: "qbtn minus inv-sort", title: "Sort", onclick: () => A.send({ t: "inv_sort", ref }) }, "⇅")));
      const grid = el("div", { class: "inv-grid", style: "grid-template-columns: repeat(" + cols + ", " + CELL + "px)" });
      dropTarget(grid, { ...ref, slot: null }, A);                // anywhere in the grid: add to this inventory
      for (let i = 0; i < total; i++) {
        const stck = data.slots[i];
        const cell = el("div", { class: "inv-cell" + (stck ? " filled" : "") });
        if (stck) {
          const def = items[stck.item] || { name: stck.item, color: "#888" };
          const qty = el("span", { class: "inv-qty" });
          const item = el("div", { class: "inv-item", style: "--c:" + def.color }, def.icon ? el("img", { class: "inv-icon", src: def.icon, draggable: "false", alt: "" }) : el("span", { class: "inv-abbr" }, def.name.slice(0, 3)), qty);
          st.live.qty[i] = { qty, item, def };
          cell.append(item);
          cell.setAttribute("draggable", "true");
          cell.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", JSON.stringify({ ref: { ...ref, slot: i, item: stck.item } })); e.dataTransfer.effectAllowed = "move"; });
          cell.addEventListener("contextmenu", (e) => { e.preventDefault(); openItemMenu(ref, i, e.clientX, e.clientY); });
          touchDrag(cell, { ref: { ...ref, slot: i, item: stck.item } }, () => { const r = cell.getBoundingClientRect(); openItemMenu(ref, i, r.left + r.width / 2, r.top + r.height / 2); });
        }
        dropTarget(cell, { ...ref, slot: i < data.slots.length ? i : null }, A);
        grid.append(cell);
      }
      main.append(grid);
      requestAnimationFrame(() => enforceInvMin(key));             // a restored or rebuilt window never sits below its minimum
    }
    if (!data) return;
    const L = st.live;
    L.fill.style.width = Math.min(100, data.used / data.cap * 100) + "%";
    L.stat.textContent = Math.round(data.used).toLocaleString() + " / " + data.cap.toLocaleString() + " m³";
    data.slots.forEach((stck, i) => { const c = L.qty[i]; if (!c) return; c.qty.textContent = stck.qty.toLocaleString(); c.item.title = c.def.name + " × " + stck.qty + " (" + (stck.qty * (c.def.unitM3 || 0)).toFixed(1) + " m³)"; });
  }
  // Touch fallback for HTML5 drag/drop: move the finger to drag a stack (ghost follows), hold still to open the sell panel.
  function touchDrag(cell, payload, onHold) {
    cell.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      const t0 = e.touches[0]; let ghost = null, moved = false, over = null;
      const hold = setTimeout(() => { if (!moved) { done(); if (navigator.vibrate) navigator.vibrate(15); onHold(); } }, 500);
      const mv = (ev) => {
        const t = ev.touches[0]; if (!t) return;
        if (!moved && Math.hypot(t.clientX - t0.clientX, t.clientY - t0.clientY) < 8) return;
        ev.preventDefault(); clearTimeout(hold);
        if (!moved) { moved = true; ghost = cell.firstChild.cloneNode(true); ghost.className += " inv-ghost"; document.body.append(ghost); }
        ghost.style.left = t.clientX + "px"; ghost.style.top = t.clientY + "px";
        const under = document.elementFromPoint(t.clientX, t.clientY), tgt = under && under.closest(".inv-cell, .tab, .inv-side-c, .inv-side-deliv, .tgt, .hb-slot, .inv-grid");
        if (over && over !== tgt) over.classList.remove("drop"); over = tgt; if (over) over.classList.add("drop");
      };
      const done = () => { clearTimeout(hold); cell.removeEventListener("touchmove", mv); cell.removeEventListener("touchend", end); cell.removeEventListener("touchcancel", done); if (ghost) ghost.remove(); if (over) over.classList.remove("drop"); };
      const end = () => { const tgt = over; done(); if (moved && tgt) tgt.dispatchEvent(new CustomEvent("touchdrop", { detail: payload })); };
      cell.addEventListener("touchmove", mv, { passive: false }); cell.addEventListener("touchend", end); cell.addEventListener("touchcancel", done);
    }, { passive: true });
  }

  // Touch: hold a tab to open it as its own window (desktop uses shift-click).
  function holdToOpen(elm, fn) {
    elm.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      const t0 = e.touches[0]; let fired = false;
      const hold = setTimeout(() => { fired = true; if (navigator.vibrate) navigator.vibrate(15); fn(); }, 500);
      const mv = (ev) => { const t = ev.touches[0]; if (t && Math.hypot(t.clientX - t0.clientX, t.clientY - t0.clientY) > 8) done(); };
      const done = () => { clearTimeout(hold); elm.removeEventListener("touchmove", mv); elm.removeEventListener("touchend", end); elm.removeEventListener("touchcancel", done); };
      const end = (ev) => { done(); if (fired) ev.preventDefault(); };
      elm.addEventListener("touchmove", mv, { passive: true }); elm.addEventListener("touchend", end); elm.addEventListener("touchcancel", done);
    }, { passive: true });
  }

  // ---- small dialogs ----
  function dialog(id, title, build) {
    if (!wins[id]) createWindow(id, { left: Math.round(innerWidth / 2 - 150), top: Math.round(innerHeight / 2 - 80), width: 300, minW: 240, minH: 110, groupable: false });
    const w = wins[id]; w.render = null; w.slot.textContent = title; w.body.innerHTML = ""; build(w.body, () => toggleWindow(id, false));
    toggleWindow(id, true);
  }
  function askText(title, value, max, onOk) {
    dialog("ask", title, (body, close) => {
      const input = el("input", { class: "text-input ask-input", value: value || "", maxlength: String(max) });
      const ok = () => { onOk(input.value.trim()); close(); };
      input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") ok(); if (e.key === "Escape") close(); });
      body.append(input, el("div", { class: "unit-btns row2" }, el("button", { class: "btn-primary2 unit-btn off", onclick: close }, "Cancel"), el("button", { class: "btn-primary2 unit-btn", onclick: ok }, "Save")));
      setTimeout(() => { input.focus(); input.select(); }, 0);
    });
  }
  function confirmBox(title, text, okLabel, onOk) {
    dialog("confirm", title, (body, close) => body.append(el("div", { class: "info-desc" }, el("span", {}, text)),
      el("div", { class: "unit-btns row2" }, el("button", { class: "btn-primary2 unit-btn off", onclick: close }, "Cancel"), el("button", { class: "btn-primary2 unit-btn danger", onclick: () => { onOk(); close(); } }, okLabel))));
  }
  // clicking a jettison can in space
  window.Atamus.bus.addEventListener("can", (e) => {
    const A = window.Atamus, c = (A.snap.cans || []).find((x) => x.id === e.detail.id); if (!c) return;
    const mins = Math.ceil(c.left / 60000), items = [["Open", () => openInventory({ owner: "can", id: c.id })]];
    if (c.mine || c.empty) items.push(["Destroy", () => c.empty ? A.send({ t: "destroy_can", can: c.id }) : confirmBox("Destroy can", "Destroy this jettison can and everything in it?", "Destroy", () => A.send({ t: "destroy_can", can: c.id }))]);
    items.push([(c.mine ? "Your can" : c.owner + "'s can") + " · " + mins + " min left", () => {}]);
    showCtxMenu(e.detail.x, e.detail.y, items);
  });
  // a can that's gone takes its window with it
  window.Atamus.bus.addEventListener("snap", () => {
    const live = new Set(((window.Atamus.snap.cans) || []).map((c) => c.id));
    for (const k in invWins) { const r = invWins[k].root || invWins[k].ref; if (r.owner === "can" && !live.has(r.id) && isOpen(wins[k])) toggleWindow(k, false); }
  });

  // ---- item menu: split / jettison / sell / read / info ----
  function openItemMenu(ref, slot, x, y) {
    const A = window.Atamus, data = invData(ref), stck = data && data.slots[slot]; if (!stck) return;
    const def = (A.cfg.items || {})[stck.item] || { name: stck.item };
    const holder = ref.owner === "ship" ? A.ship(ref.id) : null, atStation = ref.owner === "station" || !!(holder && holder.docked);
    const items = [];
    if (stck.qty > 1) items.push(["Split", () => openSplit(ref, slot)]);
    if (ref.owner === "ship" && holder && !holder.docked) items.push(["Jettison", () => A.send({ t: "jettison", ref, slot, item: stck.item })]);
    if (def.price && def.kind === "ore") items.push([atStation ? "Sell" : "Sell (dock first)", () => { if (atStation) openSell(ref, slot); }]);
    if (def.kind === "manual") items.push(["Read", () => A.send({ t: "read", ref, slot, item: stck.item })]);
    if (def.kind === "ship") items.push([ref.owner === "station" ? "Assemble" : "Assemble (in a station)", () => { if (ref.owner === "station") A.send({ t: "assemble", ref, slot, item: stck.item }); }]);
    items.push(["Info", () => def.kind === "ship" ? openShipInfo(def.ship) : openInfo(stck.item, stck.qty)]);
    showCtxMenu(x, y, items);
  }
  let splitAt = null;
  function openSplit(ref, slot) {
    if (!wins.split) createWindow("split", { left: Math.round(innerWidth / 2 - 140), top: Math.round(innerHeight / 2 - 80), width: 280, minW: 240, minH: 120, render: renderSplit, groupable: false });
    splitAt = { ref, slot, item: ((invData(ref) || {}).slots || [])[slot]?.item }; wins.split.sig = null; toggleWindow("split", true); renderSplit(wins.split.body);
  }
  function renderSplit(body) {
    const A = window.Atamus, w = wins.split;
    const data = splitAt && invData(splitAt.ref);
    if (data && splitAt.item && (data.slots[splitAt.slot] || {}).item !== splitAt.item) splitAt.slot = data.slots.findIndex((x) => x.item === splitAt.item);   // follow the stack if it moved
    const stck = data && data.slots[splitAt.slot];
    const sig = stck ? stck.item + ":" + stck.qty : ""; if (sig === w.sig && body.childElementCount) return; w.sig = sig; body.innerHTML = "";
    if (!stck || stck.qty < 2) { w.slot.textContent = "Split"; body.append(el("div", { class: "muted" }, "Nothing to split.")); return; }
    const def = (A.cfg.items || {})[stck.item] || { name: stck.item };
    w.slot.textContent = "Split " + def.name;
    const max = stck.qty - 1, start = Math.max(1, Math.floor(stck.qty / 2));
    const range = el("input", { type: "range", class: "sell-range", min: 1, max, value: start });
    const num = el("input", { type: "number", class: "sell-num", min: 1, max, value: start });
    const upd = () => { const q = Math.max(1, Math.min(max, Math.round(+num.value || 1))); num.value = q; range.value = q; };
    range.addEventListener("input", () => { num.value = range.value; }); num.addEventListener("input", upd);
    body.append(el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, "Take off"), num), range,
      el("div", { class: "unit-btns row2" },
        el("button", { class: "btn-primary2 unit-btn off", onclick: () => toggleWindow("split", false) }, "Cancel"),
        el("button", { class: "btn-primary2 unit-btn", onclick: () => { A.send({ t: "inv_split", ref: splitAt.ref, slot: splitAt.slot, item: splitAt.item, qty: +num.value }); toggleWindow("split", false); } }, "Split")));
  }
  let infoItem = null;
  function openInfo(key, qty) {
    if (!wins.info) createWindow("info", { left: Math.round(innerWidth / 2 - 160), top: Math.round(innerHeight / 2 - 120), width: 320, minW: 260, minH: 160, render: renderInfo, groupable: false });
    infoItem = { key, qty }; toggleWindow("info", true); renderInfo(wins.info.body);
  }
  function renderInfo(body) {
    const A = window.Atamus, w = wins.info; body.innerHTML = "";
    const def = infoItem && (A.cfg.items || {})[infoItem.key]; if (!def) { w.slot.textContent = "Info"; return; }
    w.slot.textContent = def.name;
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, v && v.nodeType ? v : String(v)));
    const q = infoItem.qty || 1, m3 = (v) => (+v.toFixed(2)).toLocaleString() + " m³";
    body.append(el("div", { class: "info-desc" }, def.icon ? el("img", { class: "info-icon", src: def.icon, alt: "" }) : null, el("span", {}, def.desc || "")),
      row("Weight", m3(def.unitM3) + " / " + m3(def.unitM3 * q)),
      row("Price", el("span", {}, cr(def.price), " / ", cr(def.price * q))));
  }

  // ---- station market ----
  function openMarket() { toggleWindow("market", true); }
  saved.mkOpen = saved.mkOpen || {};                 // which market groups are expanded (remembered)
  let mkQuery = "";
  function renderMarket(body) {
    const A = window.Atamus, w = wins.market; w.slot.textContent = "Market";
    const items = A.cfg.items || {}, unlocked = A.inv.unlocked || {};
    // the search field is built once and never re-rendered (it keeps focus while typing); only the list below it rebuilds
    let list = body.querySelector(".mk-list");
    if (!list) {
      body.innerHTML = "";
      const search = el("input", { class: "text-input mk-search", type: "search", placeholder: "Search", value: mkQuery });
      search.addEventListener("input", () => { mkQuery = search.value; renderMarket(body); });
      search.addEventListener("keydown", (e) => e.stopPropagation());
      list = el("div", { class: "mk-list" });
      body.append(search, list);
    }
    const keep = body.scrollTop; list.innerHTML = "";
    const offerRow = (m) => {
      const def = items[m.key] || {}, known = def.license && unlocked[def.license];
      const name = el("div", { class: "mk-name" }, m.ship ? shipIcon(m.ship, "mk-ship") : null, el("span", {}, m.name || def.name || m.key));
      if (known) name.append(el("span", { class: "mk-sub" }, "Already read"));
      return el("div", { class: "mk-row" + (known ? " known" : ""), onclick: () => openBuy(m) }, name, el("div", { class: "mk-price" }, cr(m.price)));
    };
    const q = mkQuery.trim().toLowerCase();
    if (q) {                                                     // searching: a flat list of matches
      const hits = (A.cfg.market || []).filter((m) => ((m.name || "") + " " + (m.path || []).join(" ")).toLowerCase().includes(q));
      for (const m of hits) list.append(offerRow(m));
      if (!hits.length) list.append(el("div", { class: "muted" }, "No matches."));
      body.scrollTop = keep; return;
    }
    const tree = { kids: new Map(), offers: [], n: 0 };         // nested groups from each offer's path
    for (const m of A.cfg.market || []) {
      let node = tree; node.n++;
      for (const name of m.path || ["Other"]) { if (!node.kids.has(name)) node.kids.set(name, { kids: new Map(), offers: [], n: 0 }); node = node.kids.get(name); node.n++; }
      node.offers.push(m);
    }
    const toggle = (k) => { saved.mkOpen[k] = !saved.mkOpen[k]; persistAll(); renderMarket(body); };
    const walk = (node, keyPath, depth) => {
      for (const [name, kid] of node.kids) {
        const k = keyPath ? keyPath + "/" + name : name, open = !!saved.mkOpen[k];
        const h = el("div", { class: (depth ? "mk-sub-h" : "mk-cat") + (open ? " open" : ""), onclick: () => toggle(k) }, el("span", { class: "mk-caret" }, "▸"), name, el("span", { class: "mk-count" }, kid.n));
        if (depth > 1) h.style.marginLeft = (10 + (depth - 1) * 12) + "px";
        list.append(h);
        if (open) { walk(kid, k, depth + 1); for (const m of kid.offers) list.append(offerRow(m)); }
      }
    };
    walk(tree, "", 0);
    body.scrollTop = keep;
  }

  // ---- market purchase popup: full info, quantity slider, your credits ----
  let buyOffer = null;
  function openBuy(m) {
    if (!wins.buy) createWindow("buy", { left: Math.round(innerWidth / 2 - 170), top: 90, width: 340, minW: 280, minH: 220, render: renderBuy, groupable: false });
    buyOffer = m; wins.buy.sig = null; toggleWindow("buy", true); renderBuy(wins.buy.body);
  }
  function renderBuy(body) {
    const A = window.Atamus, w = wins.buy, m = buyOffer; if (!m) return;
    const credits = A.inv.credits || 0, sig = m.key + ":" + credits;
    if (sig === w.sig && body.childElementCount) return;
    const keepQ = w.sig && w.sig.split(":").slice(0, -1).join(":") === m.key ? w.q : 1;   // credits changed: keep the quantity being typed
    w.sig = sig; body.innerHTML = "";
    const def = (A.cfg.items || {})[m.key] || {};
    w.slot.textContent = "Buy " + (m.name || def.name);
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, v && v.nodeType ? v : String(v)));
    // icon + description; the full info opens in its own window
    const icon = m.ship ? shipIcon(m.ship, "info-icon buy-ship-ico") : def.icon ? el("img", { class: "info-icon", src: def.icon, alt: "" }) : null;
    const desc = m.ship ? (hullOf(m.ship).desc || "") : (def.desc || "");
    body.append(el("div", { class: "info-desc" }, icon, el("span", {}, desc)),
      el("div", { class: "unit-btns" }, el("button", { class: "btn-primary2 unit-btn off", onclick: () => (m.ship ? openShipInfo(m.ship) : openInfo(m.key, 1)) }, "Info")));
    body.append(el("div", { class: "buy-div" }));
    // quantity: [-] [count] [+], any whole number
    const num = el("input", { type: "number", class: "sell-num buy-num", min: 1, step: 1, value: keepQ || 1, inputmode: "numeric" });
    const step = (d) => { num.value = Math.max(1, (Math.floor(+num.value) || 1) + d); upd(); };
    const qty = el("div", { class: "buy-qty" }, el("button", { class: "qbtn minus", onclick: () => step(-1) }, "−"), num, el("button", { class: "qbtn", onclick: () => step(1) }, "+"));
    const cost = el("span", { class: "credits" }), total = el("span", {}, cost, " / ", cr(credits));
    const buyBtn = el("button", { class: "btn-primary2 unit-btn" }, "Buy");
    const qOf = () => Math.max(1, Math.floor(+num.value) || 1);
    const upd = () => { const q = qOf(); w.q = q; cost.textContent = (q * m.price).toLocaleString() + " cr"; const poor = q * m.price > credits; cost.classList.toggle("poor", poor); buyBtn.disabled = poor; buyBtn.classList.toggle("off", poor); };
    num.addEventListener("input", upd); num.addEventListener("blur", () => { num.value = qOf(); upd(); }); num.addEventListener("keydown", (e) => e.stopPropagation());
    buyBtn.addEventListener("click", () => { if (buyBtn.disabled) return; A.send({ t: "buy", item: m.key, qty: qOf() }); toggleWindow("buy", false); });
    body.append(row("Price", el("span", {}, cr(m.price), " each")), row("Quantity", qty), row("Total", total), row("Deliver to", "Home Station · Deliveries"),
      el("div", { class: "unit-btns row2" }, el("button", { class: "btn-primary2 unit-btn off", onclick: () => toggleWindow("buy", false) }, "Cancel"), buyBtn));
    upd();
  }

  // ---- sell (right-click / hold an ore stack) ----
  let sell = null; // { ref, slot }
  function openSell(ref, slot) {
    const A = window.Atamus, data = invData(ref), stck = data && data.slots[slot]; if (!stck) return;
    const def = (A.cfg.items || {})[stck.item]; if (!def || !def.price) return;
    const holder = ref.owner === "station" ? null : A.ship(ref.id);
    if (holder && !holder.docked) { flash("Dock to sell."); return; }
    if (!wins.sell) createWindow("sell", { left: Math.round(innerWidth / 2 - 150), top: Math.round(innerHeight / 2 - 90), width: 300, minW: 260, minH: 150, render: renderSell, groupable: false });
    sell = { ref, slot, item: stck.item }; wins.sell.sig = null;
    toggleWindow("sell", true); renderSell(wins.sell.body);
  }
  function renderSell(body) {
    const A = window.Atamus, w = wins.sell;
    const data = sell && invData(sell.ref);
    if (data && sell.item && (data.slots[sell.slot] || {}).item !== sell.item) sell.slot = data.slots.findIndex((x) => x.item === sell.item);   // follow the stack if it moved
    const stck = data && data.slots[sell.slot];
    const def = stck && (A.cfg.items || {})[stck.item];
    const sig = stck ? stck.item + ":" + stck.qty : "";
    if (sig === w.sig && body.childElementCount) return;             // stack unchanged: keep the slider as it is
    w.sig = sig; body.innerHTML = "";
    if (!def) { w.slot.textContent = "Sell"; body.append(el("div", { class: "muted" }, "Nothing to sell.")); return; }
    w.slot.textContent = "Sell " + def.name;
    const qty = el("input", { type: "range", class: "sell-range", min: 1, max: stck.qty, value: stck.qty });
    const num = el("input", { type: "number", class: "sell-num", min: 1, max: stck.qty, value: stck.qty });
    const total = el("span", { class: "sheet-v credits" });
    const upd = () => { const q = Math.max(1, Math.min(stck.qty, Math.round(+num.value || 1))); num.value = q; qty.value = q; total.textContent = (q * def.price).toLocaleString() + " cr"; };
    qty.addEventListener("input", () => { num.value = qty.value; upd(); }); num.addEventListener("input", upd);
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), v.nodeType ? v : el("span", { class: "sheet-v" }, v && v.nodeType ? v : String(v)));
    body.append(row("Price", el("span", {}, cr(def.price), " / unit")), row("Quantity", num), qty, row("You get", total),
      el("div", { class: "unit-btns row2" },
        el("button", { class: "btn-primary2 unit-btn off", onclick: () => toggleWindow("sell", false) }, "Cancel"),
        el("button", { class: "btn-primary2 unit-btn", onclick: () => { A.send({ t: "sell", ref: sell.ref, slot: sell.slot, item: sell.item, qty: +num.value }); toggleWindow("sell", false); } }, "Confirm")));
    upd();
  }
  window.Atamus.bus.addEventListener("inv", () => {
    const A = window.Atamus;
    if (state && A.inv.credits != null && state.profile.credits !== A.inv.credits) { state.profile.credits = A.inv.credits; if (wins.player && isOpen(wins.player)) renderPlayer(wins.player.body); }
    if (wins.sell && isOpen(wins.sell)) renderSell(wins.sell.body);
    if (wins.market && isOpen(wins.market)) renderMarket(wins.market.body);
    if (wins.buy && isOpen(wins.buy)) renderBuy(wins.buy.body);
    if (wins.pilot && isOpen(wins.pilot) && pilotTab === "ship") renderPilot(wins.pilot.body);
    if (wins.split && isOpen(wins.split)) renderSplit(wins.split.body);
    for (const key in invWins) if (wins[key] && isOpen(wins[key])) renderInventory(key, wins[key].body); const w = wins.unit; if (w && isOpen(w)) renderUnit(w.body); });

  // ---- chat ----
  const chat = { local: [], corp: [] }; let chatTab = "local";
  const unread = {};                       // keyed by tab id (local / corp / w:Name)
  const whisperPartners = [];              // names with an open whisper thread
  const myName = () => (window.Atamus.me && window.Atamus.me.name) || "";
  const wKey = (name) => "w:" + name;
  function viewing(ch) { const w = wins.chat; return w && isOpen(w) && chatTab === ch; }
  function updateChatGlow() {
    const w = wins.chat;
    if (w && isOpen(w) && w.slot) { for (const b of w.slot.querySelectorAll(".tab")) { const k = b.dataset.ch; b.classList.toggle("unread", k !== chatTab && !!unread[k]); } }
    const anyUnread = Object.values(unread).some(Boolean);
    const btn = panel.querySelector('.wbtn[data-id="chat"]');
    if (btn) btn.classList.toggle("unread", (!w || !isOpen(w)) && anyUnread);
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
    if (wins.chat && isOpen(wins.chat)) wins.chat.render(wins.chat.body);
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
      if (wins.chat && isOpen(wins.chat) && !viewing(wKey(partner))) wins.chat.render(wins.chat.body);
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
    const ph = isW ? "Whisper " + chatTab.slice(2) : "Message " + (chatTab === "corp" ? "Deep Core Industries" : "local");
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
    ctxMenu = el("div", { class: "ctx-menu", style: "z-index:" + (z + 100000) }, items.map(([label, fn]) => el("div", { class: "ctx-item", onclick: () => { closeCtxMenu(); fn(); } }, label)));
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
    createWindow("fleet", { left: 300, top: 6, width: 420, minW: 64, minH: 64, render: renderFleet, label: "Fleet", groupable: false });
    wins.fleet.acts = el("div", { class: "fleet-acts", hidden: "" }); wins.fleet.win.append(wins.fleet.acts);
    dragMove(wins.fleet.win, wins.fleet.body, () => { persistWin("fleet"); wins.fleet.fsig = null; renderFleet(wins.fleet.body); });   // drag the bar by its background
    addEventListener("resize", () => { if (isOpen(wins.fleet)) { wins.fleet.fsig = null; renderFleet(wins.fleet.body); } });
    wins.fleet.win.addEventListener("pointerup", () => { actSig = ""; renderShipActions(); });
    createWindow("market", { left: 300, top: 120, width: 380, minW: 300, minH: 200, render: renderMarket, label: "Market" });
    createWindow("unit", { left: 420, top: 120, width: 250, minW: 230, minH: 120, render: renderUnit, label: "Selection" });
    wins.unit.win.querySelector(".win-close").addEventListener("click", () => window.Atamus.deselectUnit());
    renderPanel();

    // close any open custom dropdown / context menu when clicking elsewhere
    document.addEventListener("pointerdown", (e) => {
      if (openMenu && !(e.target instanceof Element && e.target.closest(".dd"))) closeMenu();
      if (ctxMenu && !(e.target instanceof Element && e.target.closest(".ctx-menu"))) closeCtxMenu();
    }, true);
    addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenu(); closeCtxMenu(); } });
    // right-click is used in-game — suppress the browser's native context menu
    document.addEventListener("contextmenu", (e) => e.preventDefault());

    // restore windows the user had open last session
    for (const id in wins) { if (id !== "unit" && saved.win[id] && saved.win[id].open) toggleWindow(id, true); }

    // clock inside the window panel (HH:MM)
    const tickClock = () => { const d = new Date(Date.now() + serverOffset); const p = (n) => String(n).padStart(2, "0"); clockEl.textContent = p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()); };
    tickClock(); setInterval(tickClock, 1000);

    try { await ensureCatalog(); await refreshState(); } catch { /* not logged in handled by game.js */ }
    if (state && !state.pilots.length) { location.href = "play.html"; return; }   // pilots are named on the website, not in-game
    // live countdown refresh for the queue
    setInterval(() => {
      const w = wins.pilot; if (!w || !isOpen(w) || pilotTab !== "queue" || !state) return;
      const pilot = state.pilots.find((p) => p.id === selectedPilotId); if (!pilot || !pilot.active) return;
      pilot.active.remainingMs -= 1000;
      const t = w.body.querySelector('.q-time[data-active="1"]');
      if (t) t.textContent = fmtTime(Math.max(0, pilot.active.remainingMs));
      if (pilot.active.remainingMs <= 0) refreshState();
    }, 1000);
  }
  init();
})();
