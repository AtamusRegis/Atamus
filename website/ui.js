// Atamus windowed UI (back to basics, owner 2026-10-10): the left panel with the Player, Pilot, Chat and Fleet windows.
// The full UI from before the reset is in reference/2026-10-10-pre-reset/website/ui.js.
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
  const cr = (n) => el("span", { class: "credits" }, Math.round(n || 0).toLocaleString() + " cr");   // credit amounts read gold
  const fmtTime = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(ss).padStart(2, "0"); };
  const licById = (k) => catalog && catalog.licenses.find((l) => l.key === k);
  const catName = (k) => (catalog.categories.find((c) => c.key === k) || {}).name || k;

  // ---- data ----
  let serverOffset = 0; // server epoch - client epoch
  async function ensureCatalog() { if (!catalog) catalog = await Api.get("/game/catalog"); }
  async function refreshState() { state = await Api.get("/game/state"); if (state.serverTime) serverOffset = state.serverTime - Date.now(); ensurePilot(); renderOpen(); }

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
    if (num(s.h) && s.h > 0) win.style.height = s.h + "px"; else if (opts.height) win.style.height = opts.height + "px";
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
    if (elm.offsetWidth > maxW) elm.style.width = maxW + "px";
    if (elm.offsetHeight > innerHeight - 4) elm.style.height = (innerHeight - 4) + "px";
    const l = parseFloat(elm.style.left) || 0, t = parseFloat(elm.style.top) || 0;
    elm.style.left = Math.max(PANEL_W, Math.min(innerWidth - elm.offsetWidth - 2, l)) + "px";
    elm.style.top = Math.max(0, Math.min(innerHeight - elm.offsetHeight - 2, t)) + "px";   // wholly on screen
  }
  addEventListener("resize", () => { for (const w of document.querySelectorAll(".win:not([hidden]), .license-popup")) fitOnScreen(w); });
  function toggleWindow(id, force) {
    const w = wins[id]; if (!w) return;
    const show = force != null ? force : !isOpen(w);
    if (w.group) {                                   // lives in a tab group
      const g = groups[w.group];
      if (show) { setActive(g, id); g.frame.style.zIndex = ++z; fitOnScreen(g.frame); }
      else removeFromGroup(id, true);
      updateBtnActive(); return;
    }
    w.win.hidden = !show;
    if (show) { w.win.style.zIndex = ++z; if (w.render) w.render(w.body); fitOnScreen(w.win); }
    persistWin(id); updateBtnActive(); updateChatGlow();
    if (id === "fit") renderHud();
  }
  function renderOpen() { for (const id in wins) if (isOpen(wins[id]) && wins[id].render) wins[id].render(wins[id].body); }

  // ---- tab groups: drop a window's title bar onto another window to stack them ----
  const groups = {}; let gseq = 0;
  const persistableInGroup = (id) => ["player", "pilot", "chat", "fleet", "inv", "fit", "station"].includes(id);
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
    setActive(g, id); persistWin(id); persistGroups(); updateBtnActive();
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
    persistGroups(); updateBtnActive();
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
    inv: '<svg viewBox="0 0 24 24"><path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4"/><path d="M12 12v9"/></svg>',
    fit: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>',
  };
  let order = ["player", "pilot", "chat", "fleet", "inv", "fit"];
  const META = { player: { name: "Player Sheet", pinned: true }, pilot: { name: "Pilot Info" }, chat: { name: "Chat" }, fleet: { name: "Fleet" }, inv: { name: "Inventory" }, fit: { name: "Fitting" } };
  function renderPanel() {
    panel.innerHTML = "";
    for (const id of order) {
      const m = META[id];
      const btn = el("button", { class: "wbtn", "data-id": id, html: ICONS[id] });
      if (!m.pinned) btn.setAttribute("draggable", "true");
      btn.addEventListener("click", () => toggleWindow(id));
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
    updateBtnActive();
  }
  function reorderBtn(from, to) { order = order.filter((x) => x !== from); let i = order.indexOf(to); if (i < 1) i = 1; order.splice(i, 0, from); renderPanel(); }
  function updateBtnActive() { for (const b of panel.children) { const w = wins[b.getAttribute("data-id")]; b.classList.toggle("open", !!(w && isOpen(w))); } }

  // ---- Player Sheet ----
  function renderPlayer(body) {
    const slot = wins.player && wins.player.slot;
    body.innerHTML = "";
    if (slot) slot.textContent = "Player Sheet";
    body.classList.add("player-body");
    if (!state) { body.append(el("div", { class: "muted" }, "Loading…")); return; }
    const p = state.profile;
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, v && v.nodeType ? v : String(v)));
    const born = new Date(p.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    // (owner) your character's small portrait and your name, then the stats; at the window's smallest only the stats scroll
    body.append(el("div", { class: "ps-head" }, p.portrait && window.Portrait ? Portrait.canvas(p.portrait, 28, "ps-portrait") : el("span", { class: "ps-portrait" }), el("span", { class: "ps-name" }, p.username)),
      el("div", { class: "ps-rows" }, row("Day Born", born), row("Credits", cr(p.credits)), row("Pilots", p.pilotCount), row("Total Endorsement Level", p.totalSkillLevel), row("Corp", p.corp)));
    requestAnimationFrame(() => { const m = playerMin(), e = wins.player.win; if (!m || e.hidden) return; if (e.offsetWidth < m.w) e.style.width = m.w + "px"; if (e.offsetHeight < m.h) e.style.height = m.h + "px"; });   // a saved size from before can't be smaller either
  }
  // (owner) the Player Sheet can't shrink past its name row and three stat rows, or narrower than its widest row
  function playerMin() {
    const w = wins.player, b = w && w.body, rows = b && b.querySelectorAll(".ps-rows .sheet-row"), head = b && b.querySelector(".ps-head");
    if (!rows || rows.length < 3 || !head) return null;
    let rh = 0; for (let i = 0; i < 3; i++) rh += rows[i].offsetHeight;
    // (sizes of the children, never of the stretched rows themselves, or the minimum would chase the window outward)
    let rw = [...head.children].reduce((t, c) => t + c.offsetWidth, 0) + 8; for (const r of rows) rw = Math.max(rw, [...r.children].reduce((a, c) => a + c.scrollWidth, 0) + 14 + 16);
    const cs = getComputedStyle(b), pad = (k) => parseFloat(cs[k]) || 0;
    return { w: Math.ceil(rw + pad("paddingLeft") + pad("paddingRight") + 12), h: Math.ceil(w.bar.offsetHeight + head.offsetHeight + 8 + rh + pad("paddingTop") + pad("paddingBottom") + 2) };
  }

  // ---- Pilot window ----
  let pilotTab = "skills", skillCategory = null;
  const trained = (pilot, key) => (pilot.licenses && pilot.licenses[key]) || 0;
  const queuedCount = (pilot, key) => pilot.queue.filter((q) => q.key === key).length;
  const effLevel = (pilot, key) => trained(pilot, key) + queuedCount(pilot, key);
  function prereqMet(pilot, key) { const l = licById(key); return l.requirements.every((r) => r.type !== "license" || trained(pilot, r.key) >= r.level); }

  function renderPilot(body) {
    const slot = wins.pilot && wins.pilot.slot;
    body.innerHTML = ""; if (slot) slot.innerHTML = "";
    if (slot) slot.textContent = "Pilot Info";   // (owner: renamed from Pilot Sheet)
    if (!state || !catalog) { body.append(el("div", { class: "muted" }, "Loading…")); return; }
    if (!state.pilots.length) { renderCreatePilot(body); return; }
    const pilot = state.pilots.find((p) => String(p.id) === String(saved.selPilot)) || state.pilots[0];
    selectedPilotId = pilot.id;

    // (owner) every pilot side by side (room for 5): portrait, name beneath. Click one to select them (and so their
    // ship) and show their stats below; the camera stays put.
    body.append(el("div", { class: "pilot-pick" }, state.pilots.map((p) => el("button", { class: "pp-card" + (p.id === pilot.id ? " sel" : ""), onclick: () => selectPilot(p.id) },
      p.portrait && window.Portrait ? Portrait.canvas(p.portrait, 52, "pp-portrait") : el("span", { class: "pp-portrait" }), el("span", { class: "pp-name" }, p.name)))));
    const tabs = [["skills", "Licenses"], ["queue", "Training Queue"]];
    if (!tabs.some(([k]) => k === pilotTab)) pilotTab = "skills";
    body.append(el("div", { class: "tab-row tab-row-center" }, tabs.map(([k, n]) => el("button", { class: "tab" + (k === pilotTab ? " active" : ""), onclick: () => { pilotTab = k; renderPilot(body); } }, n))));
    const content = el("div", { class: "tab-content" }); body.append(content);
    if (pilotTab === "skills") renderSkills(content, pilot);
    else renderQueue(content, pilot);
  }
  function renderCreatePilot(body) {
    const input = el("input", { class: "text-input", maxlength: "24", placeholder: "First pilot name" });
    const err = el("div", { class: "form-err", hidden: "" });
    const submit = async () => { const name = input.value.trim(); if (!name) return; try { await Api.post("/game/pilot/create", { name }); await refreshState(); } catch (e) { err.textContent = e.message; err.hidden = false; } };
    body.append(el("div", { class: "create-pilot" }, el("div", { class: "muted" }, "Name your first pilot:"), input, err, el("button", { class: "btn-primary2", onclick: submit }, "Create")));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }

  function renderSkills(content, pilot) {
    const cats = catalog.categories.filter((c) => catalog.licenses.some((l) => l.category === c.key));   // empty categories stay hidden
    if (!cats.length) return;                    // the trainer is empty for now (owner, 2026-10-10)
    if (!cats.some((c) => c.key === skillCategory)) skillCategory = cats[0].key;
    // categories stay visible as selectable slots; ship licenses, then module licenses
    content.append(el("div", { class: "cat-list" }, cats.map((c, i) => {
      const lics = catalog.licenses.filter((l) => l.category === c.key);
      const total = lics.reduce((s, l) => s + l.maxLevel, 0);
      const learned = lics.reduce((s, l) => s + trained(pilot, l.key), 0);
      const frac = total ? learned / total : 0;
      return el("div", { class: "cat-row" + (c.key === skillCategory ? " sel" : "") + (i && c.group !== cats[i - 1].group ? " cat-group-start" : ""), onclick: () => { skillCategory = c.key; renderPilot(wins.pilot.body); } },
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
    if (!pilot.queue.length) { content.append(el("div", { class: "muted" }, "Training queue empty.")); return; }
    const paused = !!pilot.paused;
    const head = el("div", { class: "queue-head" },
      el("span", { class: "q-title" }, "TRAINING QUEUE"),
      el("span", { class: "q-total" }, "Total ", el("b", { "data-total": "1" }, fmtTime(queueTotalMs(pilot)))),
      el("button", { class: "q-pause" + (paused ? " paused" : ""), onclick: () => queuePause(!paused) }, paused ? "Resume" : "Pause"));
    content.append(head);
    const list = el("div", { class: "queue-list" });
    pilot.queue.forEach((q, i) => {
      const l = licById(q.key);
      const active = i === 0;
      const item = el("div", { class: "queue-item" + (active ? " active" : "") + (active && paused ? " paused" : ""), "data-i": i },
        el("span", { class: "q-pos" }, active ? (paused ? "॥" : "▶") : (i + 1)),
        el("span", { class: "q-name" }, l.name + " " + q.level),
        el("span", { class: "q-time", "data-active": active ? "1" : "" }, active && pilot.active ? fmtTime(pilot.active.remainingMs) : fmtTime(l.levelTimes[q.level - 1])),
        el("button", { class: "q-cancel", title: "Cancel this endorsement", onclick: (e) => { e.stopPropagation(); queueCancel(q.key, q.level); } }, "×"));
      sortable(item, () => [...list.querySelectorAll(".queue-item")], (from, to) => reorderQueue(pilot, from, to));   // (owner) drag to reorder
      list.append(item);
    });
    content.append(list);
  }

  // time left on the whole queue: what's left of the active level plus every queued level
  function queueTotalMs(pilot) {
    return pilot.queue.reduce((sum, q, i) => sum + (i === 0 && pilot.active ? Math.max(0, pilot.active.remainingMs) : (licById(q.key).levelTimes[q.level - 1] || 0)), 0);
  }
  async function queuePause(paused) { try { await Api.post("/game/queue/pause", { pilotId: selectedPilotId, paused }); await refreshState(); } catch (e) { flash(e.message); } }
  async function queueCancel(key, level) { try { await Api.post("/game/queue/cancel", { pilotId: selectedPilotId, key, level }); await refreshState(); } catch (e) { flash(e.message); } }

  // false when the order can't be (a license's levels must stay in order), so the drag puts it back
  function reorderQueue(pilot, from, to) {
    if (from === to) return false;
    const arr = pilot.queue.slice(); const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
    const seen = {}; for (const q of arr) { if (seen[q.key] != null && q.level < seen[q.key]) { flash("Can't put a higher level below a lower one"); return false; } seen[q.key] = q.level; }
    (async () => { try { await Api.post("/game/queue/reorder", { pilotId: selectedPilotId, order: arr }); await refreshState(); } catch (e) { flash(e.message); await refreshState(); } })();
    return true;
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
      if (pTab === "licensing") c.append(el("p", { class: "pop-desc" }, l.desc), el("p", { class: "pop-bonus" }, ((l.levelBonus && l.levelBonus[pLevel - 1]) || l.bonus) + (l.hull ? "" : " per level")),
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

  // ---- the selected pilot (owner): one is always selected; it's whose ship a click flies. Selecting doesn't move
  // the camera. Tab steps through the pilots left to right (wrapping). ----
  function ensurePilot() {
    const ps = (state && state.pilots) || []; if (!ps.length) return;
    if (!ps.some((p) => String(p.id) === String(saved.selPilot))) saved.selPilot = String(ps[0].id);
    selectedPilotId = ps.find((p) => String(p.id) === String(saved.selPilot)).id;
    if (window.Atamus.selectedPilot !== String(saved.selPilot)) window.Atamus.selectPilot(String(saved.selPilot));
  }
  function selectPilot(id) {
    saved.selPilot = String(id); persistAll(); ensurePilot();
    if (wins.pilot && isOpen(wins.pilot)) renderPilot(wins.pilot.body);
    if (wins.fleet && isOpen(wins.fleet)) renderFleet(wins.fleet.body);
  }
  window.Atamus.bus.addEventListener("pilotselect", (e) => { if (e.detail != null && String(e.detail) !== String(saved.selPilot)) selectPilot(e.detail); });   // clicked one of your ships
  addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    const t = document.activeElement && document.activeElement.tagName; if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
    e.preventDefault();
    const ps = (state && state.pilots) || []; if (ps.length < 2) return;
    const i = ps.findIndex((p) => String(p.id) === String(saved.selPilot)), next = ps[(i + 1) % ps.length];
    selectPilot(next.id);
    const sh = pilotShip(next.id); if (sh) window.Atamus.focusShip(sh.id);   // (owner) Tab centers on them, zoomed to show a whole POI
  });

  // ---- Fleet window (owner): how you switch pilots. Each card: the pilot's portrait on the left; their ship with its
  // shield and hull bars on the right, the pilot's name beneath. Click a card to select that pilot; double-click (or
  // double-tap) it to also center the camera on their ship and follow it. ----
  const pilotShip = (id) => ((window.Atamus.snap && window.Atamus.snap.ships) || []).find((x) => x.mine && String(x.pilot) === String(id)) || null;
  function renderFleet(body) {
    const w = wins.fleet, pilots = (state && state.pilots) || [], cfgT = (window.Atamus.cfg && window.Atamus.cfg.shipTypes) || {};
    const sig = pilots.map((p) => p.id + ":" + p.name + ":" + JSON.stringify(p.portrait) + ":" + ((pilotShip(p.id) || {}).type || "-")).join(",");
    if (sig !== w.fsig) {
      w.fsig = sig; w.cards = {}; body.innerHTML = "";
      const list = el("div", { class: "fleet-list" });
      for (const p of pilots) {
        const sh = pilotShip(p.id), t = sh ? cfgT[sh.type] || {} : {};
        const sf = el("i"), hf = el("i");
        const card = el("button", { class: "fleet-card" },
          p.portrait && window.Portrait ? Portrait.canvas(p.portrait, 44, "fc-portrait") : el("span", { class: "fc-portrait" }),
          el("div", { class: "fc-right" },
            el("div", { class: "fc-ship" }, sh ? el("img", { src: "assets/icons/ships/" + (t.sprite || "chisel") + "_blue.png", alt: "", draggable: "false" }) : null),
            el("div", { class: "fc-bars" + (sh ? "" : " empty") }, el("div", { class: "fc-bar fc-sh" }, sf), el("div", { class: "fc-bar fc-hp" }, hf)),
            el("div", { class: "fc-name" }, p.name)));
        card.addEventListener("click", () => selectPilot(p.id));
        // (owner) right-click (hold) a card: its ship's menu, plus Pilot Info
        const cardMenu = (x, y) => { const cur = pilotShip(p.id); const items = cur ? window.Atamus.ownShipItems(cur.id) : []; if (cur && !items.some((it) => it[0] === "Show Fitting")) items.splice(Math.min(1, items.length), 0, ["Show Fitting", () => showFitting(p.id)]);
          showCtxMenu(x, y, [...items, ["Pilot Info", () => openPilotInfo(String(p.id))]]); };
        card.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); cardMenu(e.clientX, e.clientY); });
        { let h = 0; card.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; clearTimeout(h); h = setTimeout(() => cardMenu(e.clientX, e.clientY), 500); });
          for (const ev of ["pointerup", "pointercancel", "pointerleave", "pointermove"]) card.addEventListener(ev, () => clearTimeout(h)); }
        card.addEventListener("dblclick", () => { const cur = pilotShip(p.id); if (cur) window.Atamus.followShip(cur.id); });
        w.cards[p.id] = { card, sf, hf };
        list.append(card);
      }
      // (owner) under the fleet: Align and Warp, for the selected pilot's ship and its destination POI
      w.acts = { row: el("div", { class: "fleet-acts2" }) };
      w.acts.align = el("button", { class: "fa-btn", onclick: () => { const sh = pilotShip(saved.selPilot); if (sh && sh.dest) window.Atamus.align(sh.dest, sh.id); } }, "Align");
      w.acts.warp = el("button", { class: "fa-btn", onclick: () => { const sh = pilotShip(saved.selPilot); if (sh && sh.dest) window.Atamus.warp(sh.dest, sh.id); } }, "Warp");
      // (owner) Dock, while the selected pilot's ship is close enough to the station
      w.acts.dock = el("button", { class: "fa-btn fa-dock", "aria-label": "Dock", html: '<svg viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M6 20V9l6-5 6 5v11"/><path d="M10 20v-6h4v6"/></svg>', onclick: () => { const sh = pilotShip(saved.selPilot), where = sh && window.Atamus.canDock(sh); if (where) window.Atamus.send({ t: "dock", ship: sh.id, where }); } });
      nameTip(w.acts.dock, "Dock");
      w.acts.row.append(w.acts.align, w.acts.warp, w.acts.dock);
      body.append(list, w.acts.row);
      w.win.style.width = "auto"; w.win.style.height = "auto";   // exactly as big as its cards
    }
    {                                                // the actions show while the ship has a destination; Warp only while that POI still advertises itself
      const sh = pilotShip(saved.selPilot), A = window.Atamus, poi = sh && sh.dest ? A.poi(sh.dest) : null;
      const show = !!(sh && sh.dest && !sh.warp), canWarp = !!(poi && !poi.hidden && !A.inPoi(sh, poi)), canDock = !!(sh && A.canDock(sh));
      w.acts.row.hidden = !show && !canDock; w.acts.align.hidden = !show; w.acts.warp.hidden = !canWarp; w.acts.dock.hidden = !canDock;
      w.acts.align.classList.toggle("on", show && !sh.warpReq); w.acts.warp.classList.toggle("on", show && !!sh.warpReq);
    }
    for (const p of pilots) {
      const c = w.cards[p.id]; if (!c) continue;
      const sh = pilotShip(p.id), t = sh ? cfgT[sh.type] || {} : {};
      c.sf.style.width = (sh && t.shield ? Math.max(0, Math.min(1, sh.shield / t.shield)) * 100 : 0) + "%";
      c.hf.style.width = (sh && t.hp ? Math.max(0, Math.min(1, sh.hp / t.hp)) * 100 : 0) + "%";
      c.card.classList.toggle("sel", String(p.id) === String(saved.selPilot));
    }
  }
  window.Atamus.bus.addEventListener("snap", () => { const w = wins.fleet; if (w && isOpen(w)) renderFleet(w.body); });

  // ---- chat (owner): Local and Corp, plus a tab per direct message. You speak as your account's character: its
  // portrait and your username. Right-click (or hold) a name for Info, DM and Report. ----
  const chat = { local: [], corp: [] }, unread = {}, dms = []; let chatTab = "local";
  const myName = () => (window.Atamus.me && window.Atamus.me.name) || "";
  const dmKey = (name) => "dm:" + name.toLowerCase();
  const viewing = (ch) => { const w = wins.chat; return w && isOpen(w) && chatTab === ch; };
  function updateChatGlow() {
    const w = wins.chat;
    if (w && isOpen(w) && w.slot) for (const b of w.slot.querySelectorAll(".tab")) b.classList.toggle("unread", b.dataset.ch !== chatTab && !!unread[b.dataset.ch]);
    const btn = panel.querySelector('.wbtn[data-id="chat"]');
    if (btn) btn.classList.toggle("unread", (!w || !isOpen(w)) && Object.values(unread).some(Boolean));
  }
  function ensureDm(name) {
    const k = dmKey(name);
    if (!chat[k]) chat[k] = [];
    if (!dms.some((d) => d.k === k)) { dms.push({ k, name }); if (wins.chat && isOpen(wins.chat)) renderChat(wins.chat.body); }
    return k;
  }
  function openDm(name) { if (!name || name.toLowerCase() === myName().toLowerCase()) return; chatTab = ensureDm(name); toggleWindow("chat", true); renderChat(wins.chat.body); }
  function closeDm(k) { const i = dms.findIndex((d) => d.k === k); if (i >= 0) dms.splice(i, 1); delete unread[k]; if (chatTab === k) chatTab = "local"; if (wins.chat && isOpen(wins.chat)) renderChat(wins.chat.body); }
  function pushChat(ch, msg) {
    if (!chat[ch]) chat[ch] = [];
    chat[ch].push(msg); if (chat[ch].length > 300) chat[ch].shift();
    if (viewing(ch)) appendChatLine(wins.chat.body.querySelector(".chat-log"), msg);
    else { unread[ch] = true; updateChatGlow(); }
  }
  function playerMenu(name, x, y, line) {
    const self = name.toLowerCase() === myName().toLowerCase(), items = [["Info", () => openPlayerInfo(name)]];
    if (!self) items.push(["DM", () => openDm(name)], ["Report", () => openReport(name, line)]);
    showCtxMenu(x, y, items);
  }
  function appendChatLine(log, msg) {
    if (!log) return;
    let node;
    if (msg.sys) node = el("div", { class: "sys" }, "» " + msg.text);
    else {
      const who = el("span", { class: "who" }, msg.from + ": ");
      who.addEventListener("contextmenu", (e) => { e.preventDefault(); playerMenu(msg.from, e.clientX, e.clientY, msg.text); });
      let t = 0; who.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; clearTimeout(t); t = setTimeout(() => playerMenu(msg.from, e.clientX, e.clientY, msg.text), 500); });   // hold = right-click
      for (const ev of ["pointerup", "pointercancel", "pointerleave"]) who.addEventListener(ev, () => clearTimeout(t));
      node = el("div", { class: "chat-line" }, msg.portrait && window.Portrait ? Portrait.canvas(msg.portrait, 22, "chat-portrait") : el("span", { class: "chat-portrait" }), el("div", { class: "chat-msg" }, who, msg.text));
    }
    log.append(node); log.scrollTop = log.scrollHeight;
  }
  window.Atamus.bus.addEventListener("chat", (e) => {
    const m = e.detail;
    if (m.ch === "dm") { const other = m.from.toLowerCase() === myName().toLowerCase() ? m.to : m.from; pushChat(ensureDm(other), { from: m.from, portrait: m.portrait, text: m.text }); return; }
    pushChat(m.ch === "corp" ? "corp" : "local", { from: m.from, portrait: m.portrait, text: m.text });
  });
  window.Atamus.bus.addEventListener("sys", (e) => { const d = e.detail; pushChat(d.dm ? ensureDm(d.dm) : "local", { sys: true, text: d.text }); });
  function renderChat(body) {
    unread[chatTab] = false;
    if (!chat[chatTab]) chatTab = "local";
    const slot = wins.chat && wins.chat.slot;
    if (slot) {
      slot.innerHTML = "";
      const row = el("div", { class: "tab-row" });
      for (const [k, label] of [["local", "Local"], ["corp", "Corp"], ...dms.map((d) => [d.k, d.name])]) {
        const b = el("button", { class: "tab" + (k === chatTab ? " active" : ""), "data-ch": k, onclick: () => { chatTab = k; renderChat(body); } }, label);
        if (k.startsWith("dm:")) b.append(el("span", { class: "tab-x", onclick: (e) => { e.stopPropagation(); closeDm(k); } }, "×"));
        row.append(b);
      }
      slot.append(row);
    }
    body.innerHTML = "";
    const log = el("div", { class: "chat-log" });
    for (const m of chat[chatTab]) appendChatLine(log, m);
    const dm = dms.find((d) => d.k === chatTab);
    const input = el("input", { class: "text-input", maxlength: "240", placeholder: dm ? dm.name : chatTab === "corp" ? "Deep Core Industries" : "Local" });
    const form = el("form", { class: "chat-form", onsubmit: (e) => {
      e.preventDefault(); const t = input.value.trim(); if (!t) return;
      const own = window.Atamus.myShip; window.Atamus.send(dm ? { t: "chat", text: t, channel: "dm", to: dm.name } : { t: "chat", text: t, channel: chatTab, ...(own ? { ship: own.id } : {}) }); input.value = "";
    } }, input);
    body.append(log, form); log.scrollTop = log.scrollHeight;
    updateChatGlow();
  }

  // ---- another player's sheet (owner: Info on a chat name): their portrait and name, then what anyone may see ----
  let infoName = null, infoData = null;
  async function openPlayerInfo(name) {
    infoName = name; infoData = null;
    if (!wins.pinfo) createWindow("pinfo", { left: Math.round(innerWidth / 2 - 130), top: 120, width: 260, minW: 200, minH: 150, render: renderPlayerInfo, label: "Player" });
    toggleWindow("pinfo", true);
    try { infoData = await Api.get("/game/player/" + encodeURIComponent(name)); } catch (e) { infoData = { error: e.message }; }
    if (infoName === name && isOpen(wins.pinfo)) renderPlayerInfo(wins.pinfo.body);
  }
  function renderPlayerInfo(body) {
    if (wins.pinfo.slot) wins.pinfo.slot.textContent = "Player Sheet";
    body.innerHTML = ""; body.classList.add("player-body");
    const p = infoData;
    if (!p) { body.append(el("div", { class: "muted" }, "Loading…")); return; }
    if (p.error) { body.append(el("div", { class: "muted" }, p.error)); return; }
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v)));
    const born = new Date(p.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    body.append(el("div", { class: "ps-head" }, p.portrait && window.Portrait ? Portrait.canvas(p.portrait, 28, "ps-portrait") : el("span", { class: "ps-portrait" }), el("span", { class: "ps-name" }, p.username)),
      el("div", { class: "ps-rows" }, row("Day Born", born), row("Pilots", p.pilotCount), row("Total Endorsement Level", p.totalSkillLevel), row("Corp", p.corp)));
    // (owner) DM / Report at the bottom too, outside the scrolling rows; not on your own sheet
    if (p.username.toLowerCase() !== myName().toLowerCase())
      body.append(el("div", { class: "ps-acts" }, el("button", { class: "btn-ghost2", onclick: () => openDm(p.username) }, "DM"), el("button", { class: "btn-ghost2", onclick: () => openReport(p.username, null) }, "Report")));
  }

  // ---- report a player (owner): what it's about, what happened; stored on the server for admin tools later ----
  let reportCats = null;
  async function openReport(name, line) {
    if (!reportCats) { try { reportCats = await Api.get("/game/report-categories"); } catch { reportCats = ["Other"]; } }
    if (!wins.report) createWindow("report", { left: Math.round(innerWidth / 2 - 160), top: 140, width: 320, minW: 260, minH: 220, render: () => {}, label: "Report", groupable: false });
    const w = wins.report; w.slot.textContent = "Report " + name; w.body.innerHTML = "";
    const sel = el("select", { class: "base-sel report-cat" }, el("option", { value: "" }, "What's it about?"), ...reportCats.map((c) => el("option", { value: c }, c)));
    const text = el("textarea", { class: "text-input report-text", maxlength: "1000", rows: "5" });
    const err = el("div", { class: "form-err", hidden: "" });
    const send = el("button", { class: "btn-primary2", onclick: async () => {
      send.disabled = true;
      try { await Api.post("/game/report", { target: name, category: sel.value, text: text.value, context: line || null }); toggleWindow("report", false); flash("Report sent"); }
      catch (e) { err.textContent = e.message; err.hidden = false; }
      send.disabled = false;
    } }, "Send report");
    w.body.append(el("div", { class: "report-form" }, sel, text, err, el("div", { class: "report-btns" }, el("button", { class: "btn-ghost2", onclick: () => toggleWindow("report", false) }, "Cancel"), send)));
    toggleWindow("report", true);
  }

  // ---- the HUD (owner), bottom center, for the selected pilot's ship: locked targets (priority left to right), then
  // shield, hull and speed, then the hotbar (the hull's active module slots, keys 1-9, 0, -, =; empty slots
  // only show while a module is being dragged) ----
  const HB_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
  // (owner) modules are active (on the hotbar, keyed 1, 2, 3… for as many active slots as the hull has) or passive
  const modsOf = (sh, kind) => ((sh && sh.fit && sh.fit[kind]) || []);
  // ---- items and modules (owner): what's in the holds and the hangar, fitted into slots, dragged between them ----
  const MODS = () => (window.Atamus.cfg && window.Atamus.cfg.modules) || {};
  const oreOfItem = (k) => ((window.Atamus.cfg && window.Atamus.cfg.ores) || []).find((o) => "ore:" + o.key === k);
  const itemName = (k) => { if (k.startsWith("ore:")) { const o = oreOfItem(k); return o ? o.name : "Ore"; } const m = MODS()[k]; return m ? m.name : k; };
  const itemIcon = (k) => { if (k.startsWith("ore:")) { const o = oreOfItem(k), f = o ? o.rock : "cratered"; return "assets/icons/ores/" + (f === "bubble" ? "rubble" : f) + ".png"; } const m = MODS()[k]; return m ? "assets/icons/" + m.icon : ""; };
  const itemM3 = (k) => (MODS()[k] ? MODS()[k].m3 : 1);
  const boxUsed = (items) => Object.entries(items || {}).reduce((t, [k, n]) => t + itemM3(k) * n, 0);
  const fmtQty = (k, n) => (MODS()[k] ? String(n) : (n >= 1000 ? Math.round(n).toLocaleString() : String(Math.floor(n * 10) / 10)));
  const licOf = (sh) => ((state && state.pilots.find((p) => String(p.id) === String(sh && sh.pilot))) || {}).licenses || {};
  function modCost(k, lic) { const m = MODS()[k]; if (!m) return { power: 0, disposition: 0 }; const f = 1 - 0.05 * Math.min(5, lic[m.license] || 0); return { power: Math.round(m.power * f * 100) / 100, disposition: Math.round(m.disposition * f * 100) / 100 }; }
  // a container: a station's storage ("hangar": the Station's; "home": your own station's, owner), or a ship's hold { ship, hold }
  const isStore = (c) => c === "hangar" || c === "home";
  const storeAt = (c) => (c === "home" ? "home" : "station");   // where that storage is (what a ship's docked says)
  const contKey = (c) => (isStore(c) ? c : c.ship + "|" + c.hold);
  const contOf = (key) => { if (isStore(key)) return key; const i = key.lastIndexOf("|"); return { ship: key.slice(0, i), hold: key.slice(i + 1) }; };
  const srcCont = (from) => (isStore(from.type) ? from.type : { ship: from.ship, hold: from.hold });   // an item cell's container
  // Drag an item (mouse or finger): from a hold, the hangar or a module slot, onto a slot (fits it), a container in the
  // station's list or the Inventory window (moves it there; a fitted module goes back into the cargo hold)
  // ---- (owner) drag to reorder (items, the training queue, locked targets): while dragging, the others dim a little and
  // slide to where they'd be; letting go keeps that order ----
  const sortTo = (rects, x, y) => { let best = 0, bd = Infinity; rects.forEach((r, i) => { const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)); if (d < bd) { bd = d; best = i; } }); return best; };
  function sortPreview(items, rects, from, to, moveDragged) {
    items.forEach((e, i) => {
      const j = i === from ? to : i < from ? (i >= to ? i + 1 : i) : (i <= to ? i - 1 : i);
      if (i !== from) e.classList.add("sort-dim"); else if (!moveDragged) return;   // (a dragged entry follows the pointer)
      e.style.transform = "translate(" + (rects[j].left - rects[i].left) + "px," + (rects[j].top - rects[i].top) + "px)";
    });
  }
  function sortClear(items) { for (const e of items) { e.classList.remove("sort-dim", "sort-drag", "sort-ghost"); e.style.transform = ""; } }
  function sortApply(items, from, to) { if (from === to) return; const node = items[from]; node.parentNode.insertBefore(node, to > from ? items[to].nextSibling : items[to]); }
  const eatClick = () => { const h = (c) => { c.stopPropagation(); c.preventDefault(); }; addEventListener("click", h, true); setTimeout(() => removeEventListener("click", h, true), 60); };   // a drag isn't a click
  function sortable(node, getItems, commit) {
    node.style.touchAction = "none";                     // (touch: drag = drag)
    node.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      const st = { x0: e.clientX, y0: e.clientY, pid: e.pointerId, on: false };
      const end = (ev) => {
        if (ev && ev.pointerId !== st.pid) return;
        removeEventListener("pointermove", mv); removeEventListener("pointerup", end); removeEventListener("pointercancel", end);
        if (!st.on) return; sortClear(st.items); eatClick();
        if (ev && ev.type === "pointerup" && st.to !== st.from && commit(st.from, st.to) !== false) sortApply(st.items, st.from, st.to);
      };
      const mv = (ev) => {
        if (ev.pointerId !== st.pid) return;
        if (!st.on) {
          if (Math.hypot(ev.clientX - st.x0, ev.clientY - st.y0) < 6) return;
          st.items = getItems(); st.from = st.items.indexOf(node); if (st.from < 0 || st.items.length < 2) return end();
          st.on = true; st.rects = st.items.map((x) => x.getBoundingClientRect()); st.to = st.from; tooltip.hidden = true;
          node.classList.add("sort-drag"); node.dispatchEvent(new Event("sortstart")); sortPreview(st.items, st.rects, st.from, st.from, false);
        }
        node.style.transform = "translate(" + (ev.clientX - st.x0) + "px," + (ev.clientY - st.y0) + "px)";
        const to = sortTo(st.rects, ev.clientX, ev.clientY); if (to !== st.to) { st.to = to; sortPreview(st.items, st.rects, st.from, to, false); }
      };
      addEventListener("pointermove", mv); addEventListener("pointerup", end); addEventListener("pointercancel", end);
    });
  }
  // (owner) items keep the order you drag them into, per hold (and the hangar), in this browser
  let itemOrder = {}; try { itemOrder = JSON.parse(localStorage.getItem("atamus.itemOrder") || "{}") || {}; } catch {}
  const orderKey = (from) => contKey(srcCont(from));
  const orderedItems = (from, items) => { const o = itemOrder[orderKey(from)] || [], at = (k) => { const i = o.indexOf(k); return i < 0 ? 1e9 : i; }; return Object.entries(items).sort((a, b) => at(a[0]) - at(b[0])); };
  function saveItemOrder(from, grid) { itemOrder[orderKey(from)] = [...grid.querySelectorAll(".si-cell.filled")].map((c) => c.dataset.item); try { localStorage.setItem("atamus.itemOrder", JSON.stringify(itemOrder)); } catch {} }
  function dragSource(elm, payloadFn, menuFn, clickFn) {
    elm.style.touchAction = "none";
    elm.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); const m = menuFn && menuFn(); if (m && m.length) showCtxMenu(e.clientX, e.clientY, m); });
    elm.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; e.stopPropagation();
      const payload = payloadFn(), st = { x0: e.clientX, y0: e.clientY, pid: e.pointerId, started: false, ghost: null, over: null };
      let hold = 0; if (e.pointerType !== "mouse" && menuFn) hold = setTimeout(() => { if (!st.started) { st.held = true; const m = menuFn(); if (m && m.length) showCtxMenu(st.x0, st.y0, m); } }, 500);   // hold = right-click
      const mv = (ev) => {
        if (ev.pointerId !== st.pid) return;
        if (!st.started && payload && Math.hypot(ev.clientX - st.x0, ev.clientY - st.y0) > 6) {
          st.started = true; clearTimeout(hold); tooltip.hidden = true;
          st.ghost = el("img", { class: "inv-ghost", src: itemIcon(payload.item), alt: "" }); document.body.append(st.ghost); hud.classList.add("hb-dragging");
        }
        if (!st.started) return;
        st.ghost.style.left = ev.clientX + "px"; st.ghost.style.top = ev.clientY + "px";
        const t = document.elementFromPoint(ev.clientX, ev.clientY); let over = t && t.closest("[data-mslot], [data-cont], .win[data-id=\"inv\"] .win-body, .win[data-id=\"station\"] .st-main");
        if (over && !accepts(over, payload)) over = null;
        const grid = payload.from && payload.from.type !== "slot" && elm.closest(".si-grid"), gr = grid && grid.getBoundingClientRect();
        if (gr && ev.clientX >= gr.left && ev.clientX <= gr.right && ev.clientY >= gr.top && ev.clientY <= gr.bottom) {   // (owner) over its own grid: show the new order
          if (!st.sort) { const items = [...grid.querySelectorAll(".si-cell.filled")]; st.sort = { grid, items, rects: items.map((x) => x.getBoundingClientRect()), from: items.indexOf(elm), to: -1 }; elm.classList.add("sort-ghost"); }
          const to = sortTo(st.sort.rects, ev.clientX, ev.clientY); if (to !== st.sort.to && st.sort.from >= 0) { st.sort.to = to; sortPreview(st.sort.items, st.sort.rects, st.sort.from, to, true); }
          over = null;
        } else if (st.sort) { sortClear(st.sort.items); st.sort = null; }
        if (over !== st.over) { if (st.over) st.over.classList.remove("drop"); st.over = over; if (over) over.classList.add("drop"); }
      };
      const up = (ev) => {
        if (ev.pointerId !== st.pid) return;
        removeEventListener("pointermove", mv); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); clearTimeout(hold);
        if (st.over) st.over.classList.remove("drop");
        if (st.started && st.sort) {                      // reordered within its grid
          st.ghost.remove(); hud.classList.remove("hb-dragging"); const so = st.sort; sortClear(so.items);
          if (ev.type === "pointerup" && so.to >= 0 && so.to !== so.from) { sortApply(so.items, so.from, so.to); saveItemOrder(payload.from, so.grid); }
        }
        else if (st.started) { st.ghost.remove(); hud.classList.remove("hb-dragging"); if (ev.type === "pointerup") dropItem(payload, document.elementFromPoint(ev.clientX, ev.clientY)); }
        else if (!st.held && ev.type === "pointerup" && clickFn) clickFn();
      };
      addEventListener("pointermove", mv); addEventListener("pointerup", up); addEventListener("pointercancel", up);
    });
  }
  // (owner) a hold only takes what it can hold: the ore hold, only ore; a module slot, only a module of its kind
  function accepts(target, pl) {
    if (target.dataset.mslot != null) { const m = MODS()[pl.item], sh = hudShip(); return !!m && m.slot === target.dataset.kind && !!(sh && sh.docked); }   // (owner) refit docked
    if (target.dataset.cont && target.dataset.cont.endsWith("|ore")) return pl.item.startsWith("ore:") && pl.from.type !== "slot";
    return true;
  }
  function dropItem(pl, t) {
    const A = window.Atamus, sh = hudShip(); if (!t || !sh) return;
    const slotEl = t.closest("[data-mslot]");
    if (slotEl && !accepts(slotEl, pl)) return;
    const contEl = t.closest("[data-cont]"); if (contEl && !accepts(contEl, pl)) return;
    if (slotEl) {                                     // onto a module slot: fit it (from the ship's cargo hold, or from another slot)
      const kind = slotEl.dataset.kind, slot = +slotEl.dataset.mslot;
      if (pl.from.type === "slot") { if (pl.from.kind === kind && pl.from.slot === slot) return; A.send({ t: "unfit", ship: sh.id, kind: pl.from.kind, slot: pl.from.slot }); }
      else if (!(pl.from.type === "hold" && pl.from.ship === sh.id && pl.from.hold === "cargo")) { flash("Only from the cargo hold"); return; }
      A.send({ t: "fit", ship: sh.id, item: pl.item, kind, slot }); return;
    }
    let dest = null;
    const c = t.closest("[data-cont]"); if (c) dest = contOf(c.dataset.cont);
    else if (t.closest('.win[data-id="station"] .st-main')) dest = contOf(stSel());
    else if (t.closest('.win[data-id="inv"]')) dest = { ship: sh.id, hold: invHold(sh) };
    if (!dest) return;
    if (pl.from.type === "slot") { A.send({ t: "unfit", ship: sh.id, kind: pl.from.kind, slot: pl.from.slot }); return; }   // back into the cargo hold
    const from = srcCont(pl.from);
    if (contKey(from) !== contKey(dest)) A.send({ t: "transfer", from, to: dest, item: pl.item });
  }
  // a module slot (Fitting window and hotbar): its icon; drag it out or onto another slot; right-click: Unfit, Info
  function modSlot(sh, kind, i, label, extraCls) {
    const k = modsOf(sh, kind)[i], off = !!(sh.fit && sh.fit.off && sh.fit.off[kind] && sh.fit.off[kind][i]);
    const node = el("div", { class: "hb-slot" + (extraCls === "hb-live" ? "" : " fit-slot") + (k ? " filled" : " hb-empty") + (off ? " off" : "") + (extraCls ? " " + extraCls : ""), "data-mslot": i, "data-kind": kind },
      label ? el("span", { class: "hb-num" }, label) : null, k ? el("img", { class: "hb-img", src: itemIcon(k), alt: "", draggable: "false" }) : null);
    if (k) {
      nameTip(node, itemName(k));
      if (kind === "active") {                           // (owner) hovering it (touch: pressing it) lights up its range around the ship
        node.addEventListener("pointerenter", () => { window.Atamus.hoverModule = { key: k, el: node }; });
        node.addEventListener("pointerleave", () => { const h = window.Atamus.hoverModule; if (h && h.el === node) window.Atamus.hoverModule = null; });
      }
      // (owner) refitting is done docked: in space a slot can't be dragged or unfitted, only powered on / off
      const docked = () => { const x = hudShip(); return !!(x && x.id === sh.id ? x.docked : sh.docked); };   // (live: the slot outlives the snapshot it was built from)
      dragSource(node, () => (docked() ? { item: k, from: { type: "slot", kind, slot: i } } : null), () => [...(docked() ? [["Unfit", () => window.Atamus.send({ t: "unfit", ship: sh.id, kind, slot: i })]] : []),
        [off ? "Power On" : "Power Off", () => window.Atamus.send({ t: "power", ship: sh.id, kind, slot: i, on: off })], ["Info", () => openModInfo(k)]],   // (owner) powered off: disposition only
        kind === "active" && extraCls === "hb-live" ? () => toggleModule(i) : null);
    }
    return node;
  }
  function toggleModule(i) { const A = window.Atamus, sh = hudShip(); if (!sh || !modsOf(sh, "active")[i]) return; A.send({ t: "module", ship: sh.id, slot: i, on: !(sh.act && sh.act[i]) }); }
  // an item cell (Inventory and Station windows): its icon and amount; drag it; right-click: Fit (a module in the cargo hold), Move to…, Info
  function itemCell(k, n, from) {
    const cell = el("div", { class: "si-cell filled", "data-item": k }, el("img", { class: "si-icon", src: itemIcon(k), alt: "", draggable: "false" }), el("span", { class: "si-qty" }, fmtQty(k, n)));
    nameTip(cell, itemName(k));
    dragSource(cell, () => ({ item: k, from }), () => {
      const A = window.Atamus, sh = hudShip(), out = [];
      if (MODS()[k] && from.type === "hold" && sh && sh.docked && from.ship === sh.id && from.hold === "cargo") out.push(["Fit", () => fitFirst(sh, k)]);   // (owner) docked only
      const dests = moveTargets(from, k); if (dests.length) out.push(["Move to", dests.map(([label, to]) => [label, () => A.send({ t: "transfer", from: srcCont(from), to, item: k })])]);
      if (MODS()[k]) out.push(["Info", () => openModInfo(k)]);
      return out;
    });
    return cell;
  }
  function fitFirst(sh, k) { const m = MODS()[k]; const i = modsOf(sh, m.slot).indexOf(null); if (i < 0) { flash("No free " + m.slot + " slot"); return; } window.Atamus.send({ t: "fit", ship: sh.id, item: k, kind: m.slot, slot: i }); }
  // where an item can be moved: the same ship's other holds; docked, that station's hangar and your other ships docked there
  function moveTargets(from, k) {
    const A = window.Atamus, ships = ((A.snap && A.snap.ships) || []).filter((x) => x.mine), out = [], src0 = srcCont(from), fromKey = contKey(src0);
    const src = isStore(src0) ? null : ships.find((x) => x.id === from.ship), at = isStore(src0) ? storeAt(src0) : (src && src.docked) || null, store = at === "home" ? "home" : "hangar";
    if (at && fromKey !== store) out.push(["Hangar", store]);
    for (const x of ships) {
      if (!(x.id === (src && src.id) || (at && x.docked === at))) continue;
      const T = A.cfg.shipTypes[x.type] || {};
      for (const h of T.holds || []) { const key = x.id + "|" + h.key; if (key === fromKey || (h.key === "ore" && !k.startsWith("ore:"))) continue; out.push([(x.id === (src && src.id) ? "" : shipName(x) + " ") + h.name, { ship: x.id, hold: h.key }]); }
    }
    return out;
  }
  // ---- Info on a module (owner): what it does, as this pilot runs it on this ship ----
  let minfoKey = null;
  function openModInfo(k) {
    minfoKey = k;
    if (!wins.minfo) createWindow("minfo", { left: Math.round(innerWidth / 2 + 60), top: 140, width: 260, minW: 220, minH: 140, render: renderModInfo, label: "Info" });
    toggleWindow("minfo", true); renderModInfo(wins.minfo.body);
  }
  function renderModInfo(body) {
    const m = MODS()[minfoKey]; body.innerHTML = ""; if (!m) return;
    const sh = hudShip(), lic = licOf(sh), c = modCost(minfoKey, lic), calc = (sh && sh.calc) || {}, pct = (v) => "+" + Math.round(v * 1000) / 10 + "%";
    const L = (key) => Math.min(5, lic[key] || 0), mu = 1 + 0.1 * L("mining_upgrades"), eu = 1 + 0.1 * L("engineering_upgrades");
    wins.minfo.slot.textContent = m.name;
    const rows = [statRow("Slot", m.slot === "active" ? "Active" : "Passive"), statRow("Power", c.power), statRow("Disposition", c.disposition), statRow("Volume", m.m3 + " m³")];
    const lab = (cl) => cl && [statRow("Yield", cl.yield + " m³ / cycle"), statRow("Cycle Time", Math.round(cl.cycleMs / 100) / 10 + " s"), statRow("Range", cl.rangeKm + " km")];
    if (m.key === "mining_laser" && calc.laser) rows.push(...lab(calc.laser));
    if (m.key === "mining_drones" && calc.drones) rows.push(...lab(calc.drones));
    if (m.speedBonus) rows.push(statRow("Top Speed", pct(calc.speed ? calc.abSpeed / calc.speed - 1 : m.speedBonus)));
    if (m.holdBonus) rows.push(statRow("Holds", pct(m.holdBonus * eu)));
    if (m.accelBonus) rows.push(statRow("Acceleration", pct(m.accelBonus * eu)));
    if (m.laserYield) rows.push(statRow("Mining Laser Yield", pct(m.laserYield * mu)));
    if (m.laserRange) rows.push(statRow("Mining Laser Range", pct(m.laserRange * mu)));
    if (m.laserCycle) rows.push(statRow("Mining Laser Cycle Time", "−" + Math.round(m.laserCycle * mu * 1000) / 10 + "%"));
    const licName = (catalog && (catalog.licenses.find((l) => l.key === m.license) || {}).name) || m.license;
    rows.push(statRow("License", licName + (L(m.license) ? " " + ROMAN[L(m.license)] : "")));
    body.append(el("div", { class: "oi-head" }, el("img", { class: "oi-icon", src: itemIcon(minfoKey), alt: "" }), el("span", { class: "ps-name" }, m.name)), el("p", { class: "fit-desc" }, m.desc), el("div", { class: "ps-rows" }, rows));
  }
  const hudTargets = el("div", { class: "hud-targets" }), hudStatus = el("div", { class: "hud-status" }), hudBar = el("div", { class: "hud-hotbar" });
  const hud = el("div", { id: "hud", hidden: "" }, hudTargets, hudStatus, el("div", { class: "hud-row" }, hudBar));
  document.body.append(hud);
  const hudShip = () => { const A = window.Atamus; return pilotShip(saved.selPilot) || A.myShip; };
  // a name-only tooltip above an element (owner: tooltips show names only)
  function tipAbove(elm, text) { const r = elm.getBoundingClientRect(); tooltip.textContent = text; tooltip.hidden = false; tooltip.style.left = Math.max(4, r.left + r.width / 2 - tooltip.offsetWidth / 2) + "px"; tooltip.style.top = (r.top - 16) + "px"; }
  function nameTip(elm, text) {                     // hover on a mouse; on touch, while the finger is down
    const show = () => tipAbove(elm, typeof text === "function" ? text() : text), hide = () => { tooltip.hidden = true; };
    elm.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(); });
    elm.addEventListener("pointerleave", hide);
    elm.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") show(); });
    for (const ev of ["pointerup", "pointercancel"]) elm.addEventListener(ev, (e) => { if (e.pointerType !== "mouse") hide(); });
  }
  // (owner) the hotbar's empty slots show only while a module is being dragged (dragSource) or the Fitting window is open
  addEventListener("keydown", (e) => {               // hotbar keys
    const i = HB_KEYS.indexOf(e.key); if (i < 0 || hud.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = document.activeElement && document.activeElement.tagName; if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
    const slot = hudBar.children[i]; if (slot && slot.classList.contains("filled")) { e.preventDefault(); toggleModule(i); }
  });
  const fmtSpeed = (kmps) => { const ms = kmps * 1000; return ms >= 10000 ? (kmps >= 100 ? Math.round(kmps).toLocaleString() : kmps.toFixed(1)) + " km/s" : Math.round(ms) + " m/s"; };
  const fmtKm = (d) => d == null ? "" : d < 10 ? d.toFixed(1) + " km" : Math.round(d).toLocaleString() + " km";
  const H = { sig: null, cards: {} };
  function renderHud() {
    const A = window.Atamus, sh = hudShip(), T = sh && A.cfg && A.cfg.shipTypes ? A.cfg.shipTypes[sh.type] || {} : null;
    if (!sh || !T) { hud.hidden = true; A.hoverTarget = null; return; }
    hud.hidden = false;
    hud.classList.toggle("hb-fitting", !!(wins.fit && isOpen(wins.fit)));   // (owner) the Fitting window open: the hotbar's empty slots and keys show
    const tgs = sh.targets || [];
    const sig = sh.id + "|" + tgs.map((g) => g.kind + ":" + g.id + ":" + (g.locked ? 1 : 0)).join(",") + "|" + JSON.stringify(sh.fit || {});
    if (sig !== H.sig) {                              // structure changed: rebuild (owner: never on every snapshot)
      H.sig = sig; H.cards = {}; hudTargets.innerHTML = "";
      if (A.hoverTarget && !tgs.some((g) => g.kind === A.hoverTarget.kind && g.id === A.hoverTarget.id)) { A.hoverTarget = null; tooltip.hidden = true; }
      for (const g of tgs) {
        const key = g.kind + ":" + g.id, ring = el("div", { class: "tgt-ring" }, el("img", { src: A.objIcon(g.kind, g.id), alt: "", draggable: "false" }));
        const dist = el("div", { class: "tgt-dist" }), cell = el("div", { class: "tgt" + (g.locked ? " locked" : "") }, ring);
        if (g.locked) cell.append(el("button", { class: "tgt-x", "aria-label": "Unlock Target", onclick: (e) => { e.stopPropagation(); A.unlock(g.kind, g.id); } }, "×"));   // (owner) a lock in progress can't be canceled
        cell.append(dist);
        const menu = (x, y) => showCtxMenu(x, y, A.objItems(g.kind, g.id));
        cell.addEventListener("contextmenu", (e) => { e.preventDefault(); menu(e.clientX, e.clientY); });
        let hold = 0;
        const over = () => { A.hoverTarget = { kind: g.kind, id: g.id, el: ring };   // (owner) the line runs from this ring to the object
          tipAbove(ring, A.objName(g.kind, g.id)); }, out = () => { if (A.hoverTarget && A.hoverTarget.id === g.id) A.hoverTarget = null; tooltip.hidden = true; };
        cell.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") over(); });
        cell.addEventListener("pointerleave", out);
        cell.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; over(); clearTimeout(hold); hold = setTimeout(() => { out(); menu(e.clientX, e.clientY); }, 500); });   // hold = right-click
        for (const ev of ["pointerup", "pointercancel"]) cell.addEventListener(ev, (e) => { if (e.pointerType === "mouse") return; clearTimeout(hold); out(); });
        cell.dataset.tkey = key; cell.addEventListener("sortstart", () => { clearTimeout(hold); out(); });
        sortable(cell, () => [...hudTargets.querySelectorAll(".tgt")], (from, to) => {   // (owner) drag a target to change its priority
          const keys = [...hudTargets.querySelectorAll(".tgt")].map((c) => c.dataset.tkey), [mv] = keys.splice(from, 1); keys.splice(to, 0, mv);
          A.send({ t: "torder", ship: sh.id, order: keys });
        });
        H.cards[key] = { g, cell, ring, dist };
        hudTargets.append(cell);
      }
      if (!H.status) {
        const bar = (k, cls) => { const fill = el("div", { class: "hud-fill " + cls }), txt = el("span", { class: "hud-txt" }); H[k] = { fill, txt }; return el("div", { class: "hud-bar" }, el("span", { class: "hud-k" }, k), el("div", { class: "hud-track" }, fill, txt)); };
        H.speed = el("span", { class: "hud-speed" });
        const spd = el("div", { class: "hud-bar hud-spd" }, el("span", { class: "hud-k" }, "Speed"), H.speed);
        nameTip(spd, () => { const s2 = hudShip(), t2 = s2 && A.cfg.shipTypes[s2.type]; return "Max speed " + fmtSpeed((s2 && s2.calc && (s2.act || []).some((a, i) => a && (MODS()[modsOf(s2, "active")[i]] || {}).speedBonus) ? s2.calc.abSpeed : (t2 && t2.speedKmps)) || 0); });   // (owner) hover: max speed
        hudStatus.append(bar("Shield", "shield"), bar("Hull", "hull"), spd); H.status = true;
      }
      hudBar.innerHTML = "";
      const mods = modsOf(sh, "active");
      for (let i = 0; i < Math.min(HB_KEYS.length, T.activeSlots || 0); i++) hudBar.append(modSlot(sh, "active", i, HB_KEYS[i], "hb-live"));   // (owner) click or its key: on / off
      hudBar.classList.toggle("none", !mods.some(Boolean));
    }
    for (let i = 0; i < hudBar.children.length; i++) {  // live: which modules are running, and how far through their cycle
      const a = sh.act && sh.act[i], n = hudBar.children[i];
      n.classList.toggle("on", !!a && !a.sb); n.classList.toggle("standby", !!(a && a.sb)); n.style.setProperty("--p", Math.round(((a && a.p) || 0) * 100) + "%");   // (owner) standby: waiting for a lock
    }
    for (const g of tgs) {                            // live: lock progress and distance
      const c = H.cards[g.kind + ":" + g.id]; if (!c) continue;
      c.ring.style.setProperty("--p", Math.round((g.p || 0) * 100) + "%");
      c.dist.textContent = fmtKm(A.rangeTo(g.kind, g.id));
    }
    const pct = (v, m) => (m ? Math.max(0, Math.min(1, v / m)) * 100 : 0) + "%";
    H.Shield.fill.style.width = pct(sh.shield, T.shield); H.Shield.txt.textContent = Math.round(sh.shield) + " / " + T.shield;
    H.Hull.fill.style.width = pct(sh.hp, T.hp); H.Hull.txt.textContent = Math.round(sh.hp) + " / " + T.hp;
    H.speed.textContent = fmtSpeed(sh.v || 0);
  }
  window.Atamus.bus.addEventListener("snap", renderHud);
  window.Atamus.bus.addEventListener("pilotselect", () => { H.sig = null; renderHud(); });

  // ---- ship inventory (owner: the button left of the hotbar): the selected pilot's ship's cargo ----
  // (owner) a ship's name: what it was renamed to, else "Pilot's Hull"
  function shipName(sh) {
    const A = window.Atamus, T = sh && A.cfg && A.cfg.shipTypes ? A.cfg.shipTypes[sh.type] || {} : {};
    if (!sh) return "";
    if (sh.name) return sh.name;
    const pilot = state && state.pilots.find((p) => String(p.id) === String(sh.pilot));
    return (pilot ? pilot.name + "'s " : "") + (T.name || "Ship");
  }
  // ---- Rename a ship (owner: right-click it in space, or its name on the Fitting window) ----
  function openRename(shipId) {
    const A = window.Atamus, sh = A.ship(shipId); if (!sh || !sh.mine) return;
    if (!wins.rename) createWindow("rename", { left: Math.round(innerWidth / 2 - 140), top: 160, width: 280, minW: 240, minH: 120, render: () => {}, label: "Rename Ship", groupable: false });
    const w = wins.rename; w.slot.textContent = "Rename Ship"; w.body.innerHTML = "";
    const input = el("input", { class: "text-input rename-input", maxlength: "24", value: shipName(sh) });
    const save = () => { const v = input.value.trim(); A.send({ t: "rename", ship: shipId, name: v }); toggleWindow("rename", false); };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") toggleWindow("rename", false); });
    w.body.append(el("div", { class: "report-form" }, input, el("div", { class: "report-btns" }, el("button", { class: "btn-ghost2", onclick: () => toggleWindow("rename", false) }, "Cancel"), el("button", { class: "btn-primary2", onclick: save }, "Rename"))));
    toggleWindow("rename", true); input.focus(); input.select();
  }
  window.Atamus.bus.addEventListener("rename", (e) => openRename(e.detail));

  // ---- Inventory (owner): a tab per hold, its fill bar under the tabs; only the slots scroll ----
  const invHold = (sh) => { const A = window.Atamus, T = sh && A.cfg && A.cfg.shipTypes ? A.cfg.shipTypes[sh.type] || {} : {}, holds = T.holds || []; return (holds.find((h) => h.key === saved.invTab) || holds[0] || {}).key; };
  function renderInv(body) {
    const A = window.Atamus, sh = hudShip(), T = sh && A.cfg && A.cfg.shipTypes ? A.cfg.shipTypes[sh.type] || {} : {};
    const holds = T.holds || [], hold = holds.find((h) => h.key === saved.invTab) || holds[0];
    const items = (sh && sh.holds && hold && sh.holds[hold.key]) || {}, cap = (sh && sh.calc && hold && sh.calc.holds[hold.key]) || (hold ? hold.m3 : 0);
    const sig = (sh ? sh.id + ":" + (sh.name || "") + ":" + !!sh.docked : "-") + "|" + (hold ? hold.key : "") + "|" + JSON.stringify(items) + "|" + cap;
    wins.inv.slot.textContent = sh ? shipName(sh) : "Inventory";
    if (wins.inv.isig === sig) return; wins.inv.isig = sig;
    body.innerHTML = ""; body.classList.add("inv-win");
    if (!sh || !hold) { body.append(el("div", { class: "muted" }, "No ship")); return; }
    const used = boxUsed(items);
    body.append(el("div", { class: "tab-row inv-tabs" }, holds.map((h) => el("button", { class: "tab" + (h === hold ? " active" : ""), "data-hold": h.key, "data-cont": sh.id + "|" + h.key, onclick: () => { saved.invTab = h.key; persistAll(); renderInv(body); } }, h.name))),   // (owner) drop an item on a hold's tab to move it there
      el("div", { class: "si-cap" }, el("div", { class: "hud-track" }, el("div", { class: "hud-fill cargo", style: "width:" + (cap ? Math.min(100, used / cap * 100) : 0) + "%" }), el("span", { class: "hud-txt" }, (Math.round(used * 10) / 10).toLocaleString() + " / " + cap.toLocaleString() + " m³"))),
      el("div", { class: "si-scroll" }, el("div", { class: "si-grid" }, orderedItems({ type: "hold", ship: sh.id, hold: hold.key }, items).map(([k, n]) => itemCell(k, n, { type: "hold", ship: sh.id, hold: hold.key })), el("div", { class: "si-cell empty" }))));
    requestAnimationFrame(() => { const m = invMin(), e = wins.inv.win; if (!m || e.hidden || wins.inv.group) return; if (e.offsetHeight < m.h) e.style.height = m.h + "px"; fitOnScreen(e); });
  }
  // (owner) the Inventory window is always tall enough for at least one slot
  function invMin() {
    const w = wins.inv, b = w && w.body, sc = b && b.querySelector(".si-scroll"); if (!sc) return null;
    const cs = getComputedStyle(b);
    return { w: 0, h: Math.ceil(sc.getBoundingClientRect().top - w.win.getBoundingClientRect().top + 48 + (parseFloat(cs.paddingBottom) || 0) + 4) };
  }
  window.Atamus.bus.addEventListener("pilotselect", () => { if (wins.inv && isOpen(wins.inv)) renderInv(wins.inv.body); });

  // ---- the Station (owner, temporary): your hangar (unlimited) and your docked ships' holds. The list on the left and
  // the storage on the right scroll on their own. Opens when the selected pilot's ship docks; closes when none is docked.
  const stSel = () => saved.stSel || "hangar";
  function renderStation(body) {
    // the station the selected pilot's ship is docked at (else the first of yours that's docked): the Station or your own (owner)
    const A = window.Atamus, sh = hudShip(), all = ((A.snap && A.snap.ships) || []).filter((x) => x.mine && x.docked);
    const at = (sh && sh.docked) || (all[0] && all[0].docked) || "station", store = at === "home" ? "home" : "hangar";
    const ships = all.filter((x) => x.docked === at), hangar = (A.snap && A.snap[store]) || {};
    let sel = stSel(); const selC = contOf(sel);
    if (isStore(sel) ? sel !== store : !ships.some((x) => x.id === selC.ship)) sel = store;
    const items = isStore(sel) ? hangar : (((ships.find((x) => x.id === selC.ship) || {}).holds || {})[selC.hold] || {});
    const sig = at + "|" + sel + "|" + JSON.stringify(ships.map((x) => [x.id, x.name || "", x.holds, x.calc && x.calc.holds])) + "|" + JSON.stringify(items) + "|" + JSON.stringify(hangar) + "|" + !!(sh && sh.docked);
    wins.station.slot.textContent = at === "home" ? (A.homeName() || "Station") : "Station";
    if (wins.station.ssig === sig) return; wins.station.ssig = sig;
    const keepScroll = [...body.querySelectorAll(".st-side, .st-grid-wrap")].map((x) => x.scrollTop);
    body.innerHTML = ""; body.classList.add("st-win");
    const pick = (key) => { saved.stSel = key; persistAll(); wins.station.ssig = null; renderStation(body); };
    const side = el("div", { class: "st-side" }, el("button", { class: "st-entry" + (sel === store ? " active" : ""), "data-cont": store, onclick: () => pick(store) }, "Hangar"));
    for (const x of ships) {
      const T = A.cfg.shipTypes[x.type] || {};
      side.append(el("div", { class: "st-ship" }, shipName(x)));
      for (const h of T.holds || []) { const key = x.id + "|" + h.key; side.append(el("button", { class: "st-entry st-hold" + (sel === key ? " active" : ""), "data-cont": key, onclick: () => pick(key) }, h.name)); }
    }
    const main = el("div", { class: "st-main" });
    if (isStore(sel)) main.append(el("div", { class: "st-head" }, el("span", { class: "ps-name" }, "Hangar"), el("span", { class: "st-used" }, (Math.round(boxUsed(items) * 10) / 10).toLocaleString() + " m³")));
    else {
      const x = ships.find((y) => y.id === selC.ship), T = A.cfg.shipTypes[x.type] || {}, h = (T.holds || []).find((y) => y.key === selC.hold) || {}, cap = (x.calc && x.calc.holds[selC.hold]) || h.m3 || 0, used = boxUsed(items);
      main.append(el("div", { class: "st-head" }, el("span", { class: "ps-name" }, shipName(x) + " · " + (h.name || "")), el("div", { class: "hud-track st-bar" }, el("div", { class: "hud-fill cargo", style: "width:" + (cap ? Math.min(100, used / cap * 100) : 0) + "%" }), el("span", { class: "hud-txt" }, (Math.round(used * 10) / 10).toLocaleString() + " / " + cap.toLocaleString() + " m³"))));
    }
    const from = isStore(sel) ? { type: sel } : { type: "hold", ship: selC.ship, hold: selC.hold };
    main.append(el("div", { class: "st-grid-wrap" }, el("div", { class: "si-grid" }, orderedItems(from, items).map(([k, n]) => itemCell(k, n, from)), el("div", { class: "si-cell empty" }))));
    body.append(el("div", { class: "st-split" }, side, main));
    if (sh && sh.docked) body.append(el("div", { class: "st-foot" }, el("button", { class: "btn-ghost2 st-undock", onclick: () => A.send({ t: "undock", ship: sh.id }) }, "Undock")));
    [...body.querySelectorAll(".st-side, .st-grid-wrap")].forEach((x, i) => { x.scrollTop = keepScroll[i] || 0; });
  }
  let wasDocked = null;
  window.Atamus.bus.addEventListener("snap", () => {
    const A = window.Atamus, sh = hudShip(), docked = !!(sh && sh.docked), any = ((A.snap && A.snap.ships) || []).some((x) => x.mine && x.docked);
    if (sh && wasDocked !== true && docked) toggleWindow("station", true);           // (owner) docking (or coming back docked) opens it
    if (!any && wins.station && isOpen(wins.station)) toggleWindow("station", false);   // nothing docked: it closes
    wasDocked = sh ? docked : wasDocked;
    if (wins.station && isOpen(wins.station)) renderStation(wins.station.body);
    if (wins.minfo && isOpen(wins.minfo) && minfoKey) { const k = JSON.stringify((sh && sh.calc) || {}); if (wins.minfo.msig !== k) { wins.minfo.msig = k; renderModInfo(wins.minfo.body); } }
  });
  window.Atamus.bus.addEventListener("openstation", () => toggleWindow("station", true));
  window.Atamus.bus.addEventListener("notice", (e) => flash(e.detail));

  // ---- Info on an object in space (owner): an asteroid's ore and what's left of it, or a ship's hull ----
  let oinfo = null;
  function openObjInfo(kind, id) {
    oinfo = { kind, id, data: null };
    if (!wins.oinfo) createWindow("oinfo", { left: Math.round(innerWidth / 2 + 40), top: 120, width: 240, minW: 200, minH: 120, render: renderObjInfo, label: "Info" });
    toggleWindow("oinfo", true);
    if (kind === "celestial") { oinfo.data = window.Atamus.celestial(id); renderObjInfo(wins.oinfo.body); } else window.Atamus.info(kind, id);   // (a planet or moon: the client has it all)
  }
  window.Atamus.bus.addEventListener("objinfo", (e) => openObjInfo(e.detail.kind, e.detail.id));
  window.Atamus.bus.addEventListener("info", (e) => { const m = e.detail; if (oinfo && m.kind === oinfo.kind && m.id === oinfo.id) { oinfo.data = m; if (isOpen(wins.oinfo)) renderObjInfo(wins.oinfo.body); } });
  function renderObjInfo(body) {
    const A = window.Atamus; body.innerHTML = ""; if (!oinfo) return;
    const { kind, id, data: d } = oinfo, cfg = A.cfg || {};
    wins.oinfo.slot.textContent = A.objName(kind, id);
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v)));
    const head = el("div", { class: "oi-head" }, el("img", { class: "oi-icon", src: A.objIcon(kind, id), alt: "" }), el("span", { class: "ps-name" }, A.objName(kind, id)));
    if (!d) { body.append(head, el("div", { class: "muted" }, "Loading…")); return; }
    const rows = [];
    if (kind === "celestial") {                         // (owner) a planet or moon
      const parent = d.parent ? A.celestial(d.parent) : null;
      rows.push(row("Type", d.kind === "moon" ? "Moon" : "Planet"), row("World", d.world), row("Radius", Math.round(d.r).toLocaleString() + " km"), row("Orbits", parent ? parent.name : (cfg.celestials && cfg.celestials.sun ? cfg.celestials.sun.name : "-")), row("Orbit", Math.round(d.orbit).toLocaleString() + " km"));
      if (d.moons) rows.push(row("Moons", d.moons.length));
    } else if (kind === "rock") {
      const o = (cfg.ores || []).find((q) => q.key === d.ore) || {};
      rows.push(row("Rarity", o.rarity ? o.rarity.charAt(0).toUpperCase() + o.rarity.slice(1) : "-"), row("Ore", Math.round(d.m3).toLocaleString() + " m³"), row("Size", d.size.toLocaleString() + " m"), row("Belt", d.belt));
    } else {
      // (owner) a ship's Info is its hull's
      const t = (cfg.shipTypes || {})[d.type] || {};
      wins.oinfo.slot.textContent = t.name || "Ship"; head.lastChild.textContent = t.name || "Ship";
      rows.push(row("Class", t.cls || "-"), row("Length", kmM(t.lengthKm || 0)), ...generalRows(t));
    }
    body.append(head, el("div", { class: "ps-rows" }, rows));
  }

  // ---- Pilot Info on another player's ship (owner): what anyone may see of its pilot ----
  let ppInfo = null;
  async function openPilotInfo(pilotId) {
    ppInfo = { id: pilotId, data: null };
    if (!wins.ppinfo) createWindow("ppinfo", { left: Math.round(innerWidth / 2 - 130), top: 140, width: 260, minW: 200, minH: 150, render: renderPilotInfo, label: "Pilot Info" });
    toggleWindow("ppinfo", true);
    let d; try { d = await Api.get("/game/pilot-info/" + encodeURIComponent(pilotId)); } catch (e) { d = { error: e.message }; }
    if (ppInfo && ppInfo.id === pilotId) { ppInfo.data = d; if (isOpen(wins.ppinfo)) renderPilotInfo(wins.ppinfo.body); }
  }
  window.Atamus.bus.addEventListener("pilotinfo", (e) => openPilotInfo(e.detail));
  function renderPilotInfo(body) {
    wins.ppinfo.slot.textContent = "Pilot Info"; body.innerHTML = ""; body.classList.add("player-body");
    const p = ppInfo && ppInfo.data;
    if (!p) { body.append(el("div", { class: "muted" }, "Loading…")); return; }
    if (p.error) { body.append(el("div", { class: "muted" }, p.error)); return; }
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v)));
    const born = new Date(p.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    const player = el("span", { class: "sheet-v pi-player" }, p.player);
    player.addEventListener("contextmenu", (e) => { e.preventDefault(); playerMenu(p.player, e.clientX, e.clientY, null); });
    let t = 0; player.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; clearTimeout(t); t = setTimeout(() => playerMenu(p.player, e.clientX, e.clientY, null), 500); });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) player.addEventListener(ev, () => clearTimeout(t));
    body.append(el("div", { class: "ps-head" }, p.portrait && window.Portrait ? Portrait.canvas(p.portrait, 28, "ps-portrait") : el("span", { class: "ps-portrait" }), el("span", { class: "ps-name" }, p.name)),
      el("div", { class: "ps-rows" }, el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, "Player"), player), row("Corp", p.corp), row("Day Born", born), row("Total Endorsement Level", p.totalSkillLevel)));
  }

  // ---- a hull's numbers (owner): the general info the Fitting window and a ship's Info show ----
  const kmM = (km) => Math.round(km * 1000).toLocaleString() + " m";
  const statRow = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v)));
  const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
  // a hull's general stats (owner); max power, disposition and slots are in the Stats tab's Fitting section
  function generalRows(T, calc) {                    // calc: the ship as fitted (holds with expanders), else the hull's own
    return [["Shields", (T.shield || 0).toLocaleString()], ["Armor", (T.armor || 0).toLocaleString()], ["Hull", (T.hp || 0).toLocaleString()], ["Speed", kmM(T.speedKmps || 0) + "/s"],
      ["Targeting Range", (T.targetRangeKm || 0) + " km"], ["Targeting Time", ((T.lockMs || 0) / 1000) + " s"], ["Max Targets", T.maxTargets || 0], ["Drone Control Range", (T.droneControlKm || 0) + " km"],
      ...(T.holds || []).map((h) => [h.name, ((calc && calc.holds && calc.holds[h.key]) || h.m3).toLocaleString() + " m³"])].map(([k, v]) => statRow(k, v));
  }
  const subHead = (t) => el("div", { class: "skills-sub-head fit-head" }, t);

  // ---- Fitting (owner: a window button): Fitting (the ship, its hotbar slots, general stats) · Hull (description and
  // bonuses) · Stats (fitting stats and the ship's own) · Requirements (licenses, and the ark that must carry it) ----
  // (owner) the fitting stats: Power and Disposition as fill bars (used / max)
  function fitBars(T, calc) {
    const used = (k) => Math.round(((calc && calc[k]) || 0) * 100) / 100;
    const bar = (label, cls, u, max) => el("div", { class: "fit-bar" }, el("span", { class: "fit-bar-k" }, label), el("div", { class: "hud-track" }, el("div", { class: "hud-fill " + cls, style: "width:" + (max ? Math.min(100, u / max * 100) : 0) + "%" }), el("span", { class: "hud-txt" }, u + " / " + max)));
    return el("div", { class: "fit-bars" }, bar("Power", "power", used("power"), T.powerMax || 0), bar("Disposition", "disposition", used("disposition"), T.dispositionMax || 0));
  }
  const FIT_TABS = [["fitting", "Fitting"], ["hull", "Hull"], ["stats", "Stats"], ["req", "Requirements"]];
  function renderFit(body) {
    const A = window.Atamus, sh = hudShip(), T = sh && A.cfg && A.cfg.shipTypes ? A.cfg.shipTypes[sh.type] || {} : {};
    const pilot = state && state.pilots.find((p) => String(p.id) === String(saved.selPilot));
    wins.fit.slot.textContent = sh ? shipName(sh) : "Fitting";
    const tab = FIT_TABS.some(([k]) => k === saved.fitTab) ? saved.fitTab : "fitting";
    const owned = new Set(((A.snap && A.snap.ships) || []).filter((x) => x.mine).map((x) => x.type));
    const sig = tab + "|" + (sh ? sh.id + ":" + sh.type + ":" + (sh.name || "") : "-") + "|" + JSON.stringify((sh && sh.fit) || {}) + "|" + JSON.stringify((sh && sh.calc) || {}) + "|" + JSON.stringify((pilot && pilot.licenses) || {}) + "|" + [...owned].join();
    if (wins.fit.fsig === sig) return; wins.fit.fsig = sig;
    body.innerHTML = ""; body.classList.add("fit-win");
    // (owner) the tabs stay at the top; below them only the stats (or a tab's content) scroll
    body.append(el("div", { class: "tab-row tab-row-center fit-tabs" }, FIT_TABS.map(([k, n]) => el("button", { class: "tab" + (k === tab ? " active" : ""), "data-tab": k, onclick: () => { saved.fitTab = k; persistAll(); renderFit(body); } }, n))));
    if (!sh) { body.append(el("div", { class: "muted" }, "No ship")); return; }
    const c = el("div", { class: "fit-body" + (tab === "fitting" ? "" : " fit-scroll") }); body.append(c);
    const act = modsOf(sh, "active"), pas = modsOf(sh, "passive"), mods = [...act, ...pas];
    if (tab === "fitting") {                         // (owner) active slots above the ship (keyed as on the hotbar), passive below, each row labeled
      c.classList.add("fit-split");                  // (owner) the slots, ship and fitting bars on the left, the stats beside them
      c.append(el("div", { class: "fit-left" }, el("div", { class: "fit-slots fit-active" }, el("span", { class: "fit-lab" }, "Active"), HB_KEYS.slice(0, T.activeSlots || 0).map((k, i) => modSlot(sh, "active", i, k))),
        el("div", { class: "fit-hull" }, el("img", { src: "assets/ships/" + (T.sprite || "chisel") + "_blue.webp", alt: "", draggable: "false" })),
        el("div", { class: "fit-slots fit-passive" }, el("span", { class: "fit-lab" }, "Passive"), Array.from({ length: T.passiveSlots || 0 }, (_, i) => modSlot(sh, "passive", i, null))),
        fitBars(T, sh.calc)),
        el("div", { class: "ps-rows fit-rows fit-scroll" }, generalRows(T, sh.calc)));
    } else if (tab === "hull") {
      c.append(el("div", { class: "fit-title" }, el("span", { class: "ps-name" }, T.name || ""), el("span", { class: "fit-cls" }, T.cls || "")),
        el("p", { class: "fit-desc" }, T.desc || ""), subHead("Hull Bonuses"), el("div", { class: "fit-bonuses" }, (T.bonuses || []).map((b) => el("div", { class: "fit-bonus" }, typeof b === "string" ? b : "+" + b.per + "% " + b.what + " per level"))));   // (owner) per level of its class license
    } else if (tab === "stats") {
      // (owner) Fitting: the slots by type and the max power / disposition (not bars); then the ship as its pilot flies it
      c.append(subHead("Fitting"), el("div", { class: "ps-rows fit-rows" }, statRow("Active Slots", T.activeSlots || 0), statRow("Passive Slots", T.passiveSlots || 0), statRow("Max Power", T.powerMax || 0), statRow("Max Disposition", T.dispositionMax || 0)),
        subHead("Ship"), el("div", { class: "ps-rows fit-rows" }, statRow("Class", T.cls || "-"), statRow("Length", kmM(T.lengthKm || 0)), statRow("Acceleration", kmM((sh.calc && sh.calc.accel) || T.accelKmps2 || 0) + "/s²"), generalRows(T, sh.calc)));
    } else {
      // (owner) a green check left of each requirement the player meets: the selected pilot's license level, an ark of that type
      const r = T.req || {}, lic = (pilot && pilot.licenses) || {};
      const reqRow = (ok, k, v) => el("div", { class: "sheet-row req-row" }, el("span", { class: "req-check" + (ok ? " ok" : "") }, ok ? "✓" : ""), el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v)));
      c.append(subHead("Licenses"), el("div", { class: "ps-rows fit-rows" }, (r.licenses || []).map(([key, n, lv]) => reqRow((lic[key] || 0) >= lv, n, ROMAN[lv] || lv))),
        subHead("Ark Ship"), el("div", { class: "ps-rows fit-rows" }, r.ark ? reqRow(owned.has(r.ark[0]), "Carried by", r.ark[1]) : statRow("Carried by", "-")));
    }
    requestAnimationFrame(() => { const m = fitMin(), e = wins.fit.win; if (!m || e.hidden || wins.fit.group) return; if (e.offsetWidth < m.w) e.style.width = m.w + "px"; if (e.offsetHeight < m.h) e.style.height = m.h + "px"; fitOnScreen(e); });   // (then back on screen)
  }
  // (owner) the Fitting window can't be narrower than 6 module slots (plus the stats column), or shorter than its left column (down to the Power / Disposition bars)
  function fitMin() {
    const w = wins.fit, b = w && w.body; if (!b) return null;
    const cs = getComputedStyle(b), px = (k) => parseFloat(cs[k]) || 0;
    const phone = document.documentElement.classList.contains("phone"), slot = phone ? 34 : 40, slotsW = 6 * slot + 5 * 6 + 20;
    const width = Math.ceil(slotsW + 10 + 160 + px("paddingLeft") + px("paddingRight") + 6);   // (owner) the slots, plus the stats column beside them
    const sc = b.querySelector(".fit-rows.fit-scroll"), row = sc && sc.querySelector(".sheet-row"), left = b.querySelector(".fit-left"), top = w.win.getBoundingClientRect().top;
    const bars = left && left.querySelector(".fit-bars");   // (the column stretches with the window: measure to its last item)
    if (bars) w.fitMinH = Math.ceil(bars.getBoundingClientRect().bottom - top + px("paddingBottom") + 4);   // (owner) down to the Power / Disposition bars; the stats beside scroll
    return { w: width, h: w.fitMinH || 360 };
  }
  window.Atamus.bus.addEventListener("pilotselect", () => { if (wins.fit && isOpen(wins.fit)) renderFit(wins.fit.body); });
  // (owner) Show Fitting (a ship's or a fleet card's menu): that pilot selected, the Fitting window on its Fitting tab
  function showFitting(pilotId) { if (String(pilotId) !== String(saved.selPilot)) selectPilot(pilotId); saved.fitTab = "fitting"; persistAll(); if (wins.fit) wins.fit.fsig = null; toggleWindow("fit", true); }
  window.Atamus.bus.addEventListener("showfitting", (e) => showFitting(e.detail));
  window.Atamus.bus.addEventListener("snap", () => { for (const [id, r] of [["fit", renderFit], ["inv", renderInv]]) if (wins[id] && isOpen(wins[id])) r(wins[id].body); });   // only rebuilt when their signature changes

  // ---- right-click / hold menu (owner: placement centered above the press; below it near the top; to the right near
  // the left edge, to the left near the right edge). An item is [label, fn] or [label, [items…]]: a submenu opens beside
  // it on hover or tap, and submenus nest. [label, fn, { menu: [items…] }]: right-click (or hold) that row to open its
  // own menu in place of this one (owner: a list, not a third layer of submenus). ----
  let ctxMenu = null;
  function closeCtxMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
  function showCtxMenu(x, y, items) {
    closeCtxMenu();
    ctxMenu = el("div", { class: "ctx-root" }); ctxMenu.style.zIndex = z + 100000;
    const M = 6, GAP = 8;
    const build = (list, depth) => el("div", { class: "ctx-menu" + (depth ? " ctx-sub" : "") }, list.length ? list.map(([label, fn, opt]) => {
      if (Array.isArray(fn)) {
        const row = el("div", { class: "ctx-item ctx-has-sub" }, label);
        const open = () => {
          for (const o of [...ctxMenu.querySelectorAll(".ctx-sub")]) if (+o.dataset.depth > depth) o.remove();
          const sub = build(fn, depth + 1); sub.dataset.depth = depth + 1; ctxMenu.append(sub);
          const r = row.getBoundingClientRect(), b = sub.getBoundingClientRect();
          let left = r.right + 2; if (left + b.width > innerWidth - M) left = r.left - 2 - b.width;
          sub.style.left = Math.max(M, left) + "px"; sub.style.top = Math.max(M, Math.min(innerHeight - b.height - M, r.top - 4)) + "px";
        };
        row.addEventListener("mouseenter", open); row.addEventListener("click", (e) => { e.stopPropagation(); open(); });
        return row;
      }
      const openOwn = () => {                        // (owner) its own menu opens beside it; the menus before it stay open
        for (const o of [...ctxMenu.querySelectorAll(".ctx-sub")]) if (+o.dataset.depth > depth) o.remove();
        const sub = build(opt.menu, depth + 1); sub.dataset.depth = depth + 1; ctxMenu.append(sub);
        const r = row.getBoundingClientRect(), b = sub.getBoundingClientRect();
        let left = r.right + 2; if (left + b.width > innerWidth - M) left = r.left - 2 - b.width;
        sub.style.left = Math.max(M, left) + "px"; sub.style.top = Math.max(M, Math.min(innerHeight - b.height - M, r.top - 4)) + "px";
        for (const o of row.parentNode.children) o.classList.toggle("ctx-open", o === row);
      };
      const row = el("div", { class: "ctx-item", onclick: (e) => { if (fn) { closeCtxMenu(); fn(); } else if (opt && opt.menu) { e.stopPropagation(); openOwn(); } } }, label);
      row.addEventListener("mouseenter", () => { if (row.classList.contains("ctx-open")) return; for (const o of row.parentNode.children) o.classList.remove("ctx-open"); for (const o of [...ctxMenu.querySelectorAll(".ctx-sub")]) if (+o.dataset.depth > depth) o.remove(); });
      if (opt && opt.menu) {                         // its own menu: right-click, or hold on touch
        row.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); openOwn(); });
        let t = 0; row.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; clearTimeout(t); t = setTimeout(openOwn, 500); });
        for (const ev of ["pointerup", "pointercancel", "pointerleave"]) row.addEventListener(ev, () => clearTimeout(t));
      }
      return row;
    }) : [el("div", { class: "ctx-item ctx-empty" }, "—")]);
    const top = build(items, 0); ctxMenu.append(top); document.body.append(ctxMenu);
    const r = top.getBoundingClientRect();
    let left = x - r.width / 2;
    if (left < M) left = x + GAP; else if (left + r.width > innerWidth - M) left = x - GAP - r.width;
    left = Math.max(M, Math.min(innerWidth - r.width - M, left));
    let tp = y - GAP - r.height; if (tp < M) tp = y + GAP;
    top.style.left = left + "px"; top.style.top = Math.max(M, Math.min(innerHeight - r.height - M, tp)) + "px";
  }
  window.Atamus.ctxMenu = showCtxMenu;
  document.addEventListener("pointerdown", (e) => { if (ctxMenu && !(e.target instanceof Element && e.target.closest(".ctx-root"))) closeCtxMenu(); }, true);
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeCtxMenu(); });

  function flash(text) { const s = document.getElementById("status"); if (!s) return; s.textContent = text; s.className = "status err"; setTimeout(() => s.classList.add("hidden"), 2500); }

  // ---- init ----
  async function init() {
    createWindow("player", { left: 90, top: 70, width: 260, minW: 190, minH: 120, render: renderPlayer, dynMin: playerMin });
    createWindow("pilot", { left: 180, top: 90, width: 440, minW: 390, minH: 300, render: renderPilot });
    createWindow("chat", { left: 280, top: 150, width: 320, minW: 250, minH: 108, render: renderChat });
    createWindow("station", { left: Math.max(60, Math.round(innerWidth / 2 - 260)), top: 80, width: 520, height: 360, minW: 380, minH: 220, render: renderStation, label: "Station" });
    createWindow("inv", { left: Math.max(60, Math.round(innerWidth / 2 - 140)), top: Math.max(60, innerHeight - 380), width: 280, minW: 200, minH: 140, render: renderInv, label: "Inventory", dynMin: invMin });
    const phoneUi = document.documentElement.classList.contains("phone");
    createWindow("fit", { left: Math.max(60, Math.round(innerWidth / 2 - (phoneUi ? 240 : 270))), top: phoneUi ? 60 : 90, width: phoneUi ? 470 : 540, minW: 290, minH: 200, render: renderFit, label: "Fitting", dynMin: fitMin });
    { const t = wins.fit.slot, menu = (x, y) => { const sh = hudShip(); if (sh) showCtxMenu(x, y, [["Rename", () => openRename(sh.id)]]); };   // (owner) right-click (hold) the ship's name: Rename
      t.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); menu(e.clientX, e.clientY); });
      let h = 0; t.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; clearTimeout(h); h = setTimeout(() => menu(e.clientX, e.clientY), 500); });
      for (const ev of ["pointerup", "pointercancel", "pointerleave", "pointermove"]) t.addEventListener(ev, () => clearTimeout(h)); }
    createWindow("fleet", { left: Math.max(60, Math.round(innerWidth / 2 - 150)), top: 8, width: 300, minW: 170, minH: 96, render: renderFleet, label: "Fleet" });
    if (!saved.win.fleet) saved.win.fleet = { open: true };   // (owner) the fleet window is how you switch pilots: open the first time
    dragMove(wins.fleet.win, wins.fleet.body, () => persistWin("fleet"));   // a bar with no title: dragged by its background
    renderPanel();
    restoreGroups();
    for (const id in wins) { if (saved.win[id] && saved.win[id].open && !wins[id].group) toggleWindow(id, true); }   // windows open last session
    try { await ensureCatalog(); await refreshState(); } catch { /* not logged in handled by game.js */ }
    if (state && !state.pilots.length) { location.href = "play.html"; return; }   // pilots are named on the website, not in-game
    // live countdown refresh for the training queue
    setInterval(() => {
      const w = wins.pilot; if (!w || !isOpen(w) || pilotTab !== "queue" || !state) return;
      const pilot = state.pilots.find((p) => p.id === selectedPilotId); if (!pilot || !pilot.active) return;
      pilot.active.remainingMs -= 1000;
      const t = w.body.querySelector('.q-time[data-active="1"]');
      if (t) t.textContent = fmtTime(Math.max(0, pilot.active.remainingMs));
      const tt = w.body.querySelector('[data-total="1"]'); if (tt) tt.textContent = fmtTime(queueTotalMs(pilot));
      if (pilot.active.remainingMs <= 0) refreshState();
    }, 1000);
  }
  init();
})();
