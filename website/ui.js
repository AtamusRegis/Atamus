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
  }
  function renderOpen() { for (const id in wins) if (isOpen(wins[id]) && wins[id].render) wins[id].render(wins[id].body); }

  // ---- tab groups: drop a window's title bar onto another window to stack them ----
  const groups = {}; let gseq = 0;
  const persistableInGroup = (id) => ["player", "pilot", "chat", "fleet", "inv", "fit"].includes(id);
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

  // time left on the whole queue: what's left of the active level plus every queued level
  function queueTotalMs(pilot) {
    return pilot.queue.reduce((sum, q, i) => sum + (i === 0 && pilot.active ? Math.max(0, pilot.active.remainingMs) : (licById(q.key).levelTimes[q.level - 1] || 0)), 0);
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
    const sh = pilotShip(next.id); if (sh) window.Atamus.focusShip(sh.id);   // (owner) Tab centres on them, zoomed to show a whole POI
  });

  // ---- Fleet window (owner): how you switch pilots. Each card: the pilot's portrait on the left; their ship with its
  // shield and hull bars on the right, the pilot's name beneath. Click a card to select that pilot; double-click (or
  // double-tap) it to also centre the camera on their ship and follow it. ----
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
        card.addEventListener("dblclick", () => { const cur = pilotShip(p.id); if (cur) window.Atamus.followShip(cur.id); });
        w.cards[p.id] = { card, sf, hf };
        list.append(card);
      }
      // (owner) under the fleet: Align and Warp, for the selected pilot's ship and its destination POI
      w.acts = { row: el("div", { class: "fleet-acts2" }) };
      w.acts.align = el("button", { class: "fa-btn", onclick: () => { const sh = pilotShip(saved.selPilot); if (sh && sh.dest) window.Atamus.align(sh.dest, sh.id); } }, "Align");
      w.acts.warp = el("button", { class: "fa-btn", onclick: () => { const sh = pilotShip(saved.selPilot); if (sh && sh.dest) window.Atamus.warp(sh.dest, sh.id); } }, "Warp");
      w.acts.row.append(w.acts.align, w.acts.warp);
      body.append(list, w.acts.row);
      w.win.style.width = "auto"; w.win.style.height = "auto";   // exactly as big as its cards
    }
    {                                                // the actions show while the ship has a destination; Warp only while that POI still advertises itself
      const sh = pilotShip(saved.selPilot), A = window.Atamus, poi = sh && sh.dest ? A.poi(sh.dest) : null;
      const show = !!(sh && sh.dest && !sh.warp), canWarp = !!(poi && !poi.hidden && !A.inPoi(sh, poi));
      w.acts.row.hidden = !show; w.acts.warp.hidden = !canWarp;
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
      window.Atamus.send(dm ? { t: "chat", text: t, channel: "dm", to: dm.name } : { t: "chat", text: t, channel: chatTab }); input.value = "";
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

  // ---- the HUD (owner), bottom centre, for the selected pilot's ship: locked targets (priority left to right), then
  // shield, hull and speed, then the Inventory button and the hotbar (12 module slots, keys 1-9, 0, -, =; empty slots
  // only show while a module is being dragged) ----
  const HB_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
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
  // (owner) the hotbar's empty slots show only while a module is being dragged
  addEventListener("dragstart", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("atamus/module")) hud.classList.add("hb-dragging"); });
  for (const ev of ["dragend", "drop"]) addEventListener(ev, () => hud.classList.remove("hb-dragging"));
  addEventListener("keydown", (e) => {               // hotbar keys
    const i = HB_KEYS.indexOf(e.key); if (i < 0 || hud.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = document.activeElement && document.activeElement.tagName; if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
    const slot = hudBar.children[i]; if (slot && slot.classList.contains("filled")) { e.preventDefault(); slot.click(); }
  });
  const fmtSpeed = (kmps) => { const ms = kmps * 1000; return ms >= 10000 ? (kmps >= 100 ? Math.round(kmps).toLocaleString() : kmps.toFixed(1)) + " km/s" : Math.round(ms) + " m/s"; };
  const fmtKm = (d) => d == null ? "" : d < 10 ? d.toFixed(1) + " km" : Math.round(d).toLocaleString() + " km";
  const H = { sig: null, cards: {} };
  function renderHud() {
    const A = window.Atamus, sh = hudShip(), T = sh && A.cfg && A.cfg.shipTypes ? A.cfg.shipTypes[sh.type] || {} : null;
    if (!sh || !T) { hud.hidden = true; A.hoverTarget = null; return; }
    hud.hidden = false;
    const tgs = sh.targets || [];
    const sig = sh.id + "|" + tgs.map((g) => g.kind + ":" + g.id + ":" + (g.locked ? 1 : 0)).join(",") + "|" + JSON.stringify(sh.mods || []);
    if (sig !== H.sig) {                              // structure changed: rebuild (owner: never on every snapshot)
      H.sig = sig; H.cards = {}; hudTargets.innerHTML = "";
      if (A.hoverTarget && !tgs.some((g) => g.kind === A.hoverTarget.kind && g.id === A.hoverTarget.id)) { A.hoverTarget = null; tooltip.hidden = true; }
      for (const g of tgs) {
        const key = g.kind + ":" + g.id, ring = el("div", { class: "tgt-ring" }, el("img", { src: A.objIcon(g.kind, g.id), alt: "", draggable: "false" }));
        const dist = el("div", { class: "tgt-dist" }), cell = el("div", { class: "tgt" + (g.locked ? " locked" : "") }, ring);
        if (g.locked) cell.append(el("button", { class: "tgt-x", "aria-label": "Unlock Target", onclick: (e) => { e.stopPropagation(); A.unlock(g.kind, g.id); } }, "×"));   // (owner) a lock in progress can't be cancelled
        cell.append(dist);
        const menu = (x, y) => showCtxMenu(x, y, A.objItems(g.kind, g.id));
        cell.addEventListener("contextmenu", (e) => { e.preventDefault(); menu(e.clientX, e.clientY); });
        let hold = 0;
        const over = () => { A.hoverTarget = { kind: g.kind, id: g.id }; tipAbove(ring, A.objName(g.kind, g.id)); }, out = () => { if (A.hoverTarget && A.hoverTarget.id === g.id) A.hoverTarget = null; tooltip.hidden = true; };
        cell.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") over(); });
        cell.addEventListener("pointerleave", out);
        cell.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; over(); clearTimeout(hold); hold = setTimeout(() => { out(); menu(e.clientX, e.clientY); }, 500); });   // hold = right-click
        for (const ev of ["pointerup", "pointercancel"]) cell.addEventListener(ev, (e) => { if (e.pointerType === "mouse") return; clearTimeout(hold); out(); });
        H.cards[key] = { g, cell, ring, dist };
        hudTargets.append(cell);
      }
      if (!H.status) {
        const bar = (k, cls) => { const fill = el("div", { class: "hud-fill " + cls }), txt = el("span", { class: "hud-txt" }); H[k] = { fill, txt }; return el("div", { class: "hud-bar" }, el("span", { class: "hud-k" }, k), el("div", { class: "hud-track" }, fill, txt)); };
        H.speed = el("span", { class: "hud-speed" });
        const spd = el("div", { class: "hud-bar hud-spd" }, el("span", { class: "hud-k" }, "Speed"), H.speed);
        nameTip(spd, () => { const s2 = hudShip(), t2 = s2 && A.cfg.shipTypes[s2.type]; return "Max speed " + fmtSpeed((t2 && t2.speedKmps) || 0); });   // (owner) hover: max speed
        hudStatus.append(bar("Shield", "shield"), bar("Hull", "hull"), spd); H.status = true;
      }
      hudBar.innerHTML = "";
      const mods = sh.mods || [];
      for (let i = 0; i < HB_KEYS.length; i++) {
        const m = mods[i];
        hudBar.append(el("div", { class: "hb-slot" + (m ? " filled" : " hb-empty") }, el("span", { class: "hb-num" }, HB_KEYS[i])));
      }
      hudBar.classList.toggle("none", !mods.some(Boolean));
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
  function renderInv(body) {
    const A = window.Atamus, sh = hudShip(), T = sh && A.cfg && A.cfg.shipTypes ? A.cfg.shipTypes[sh.type] || {} : {};
    const pilot = state && state.pilots.find((p) => String(p.id) === String(saved.selPilot));
    const sig = (sh ? sh.id : "-") + "|" + JSON.stringify((sh && sh.inv) || []);
    wins.inv.slot.textContent = pilot ? pilot.name + "'s " + (T.name || "Ship") : "Inventory";
    if (wins.inv.isig === sig) return; wins.inv.isig = sig;
    body.innerHTML = "";
    if (!sh) { body.append(el("div", { class: "muted" }, "No ship")); return; }
    const items = sh.inv || [], used = items.reduce((t, it) => t + (it.m3 || 0), 0), cap = T.cargoM3 || 0;
    body.append(el("div", { class: "si-cap" }, el("div", { class: "hud-track" }, el("div", { class: "hud-fill cargo", style: "width:" + (cap ? Math.min(100, used / cap * 100) : 0) + "%" }), el("span", { class: "hud-txt" }, Math.round(used).toLocaleString() + " / " + cap.toLocaleString() + " m³"))),
      el("div", { class: "si-grid" }, items.map((it) => el("div", { class: "si-cell" }, it.name || "")), el("div", { class: "si-cell empty" })));
  }
  window.Atamus.bus.addEventListener("pilotselect", () => { if (wins.inv && isOpen(wins.inv)) renderInv(wins.inv.body); });

  // ---- Info on an object in space (owner): an asteroid's ore and what's left of it, or a ship's hull ----
  let oinfo = null;
  function openObjInfo(kind, id) {
    oinfo = { kind, id, data: null };
    if (!wins.oinfo) createWindow("oinfo", { left: Math.round(innerWidth / 2 + 40), top: 120, width: 240, minW: 200, minH: 120, render: renderObjInfo, label: "Info" });
    toggleWindow("oinfo", true); window.Atamus.info(kind, id);
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
    if (kind === "rock") {
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
  function generalRows(T) {
    return [["Shields", (T.shield || 0).toLocaleString()], ["Armor", (T.armor || 0).toLocaleString()], ["Hull", (T.hp || 0).toLocaleString()], ["Speed", kmM(T.speedKmps || 0) + "/s"],
      ["Targeting Range", (T.targetRangeKm || 0) + " km"], ["Targeting Time", ((T.lockMs || 0) / 1000) + " s"], ["Max Targets", T.maxTargets || 0], ["Storage", (T.cargoM3 || 0).toLocaleString() + " m³"],
      ["Max Power", T.powerMax || 0], ["Max Disposition", T.dispositionMax || 0]].map(([k, v]) => statRow(k, v));
  }
  const subHead = (t) => el("div", { class: "skills-sub-head fit-head" }, t);

  // ---- Fitting (owner: a window button): Fitting (the ship, its hotbar slots, general stats) · Hull (description and
  // bonuses) · Stats (fitting stats and the ship's own) · Requirements (licenses, and the ark that must carry it) ----
  const FIT_TABS = [["fitting", "Fitting"], ["hull", "Hull"], ["stats", "Stats"], ["req", "Requirements"]];
  function renderFit(body) {
    const A = window.Atamus, sh = hudShip(), T = sh && A.cfg && A.cfg.shipTypes ? A.cfg.shipTypes[sh.type] || {} : {};
    const pilot = state && state.pilots.find((p) => String(p.id) === String(saved.selPilot));
    wins.fit.slot.textContent = pilot ? pilot.name + "'s " + (T.name || "Ship") : "Fitting";
    const tab = FIT_TABS.some(([k]) => k === saved.fitTab) ? saved.fitTab : "fitting";
    const sig = tab + "|" + (sh ? sh.id + ":" + sh.type : "-") + "|" + JSON.stringify((sh && sh.mods) || []);
    if (wins.fit.fsig === sig) return; wins.fit.fsig = sig;
    body.innerHTML = "";
    body.append(el("div", { class: "tab-row tab-row-center" }, FIT_TABS.map(([k, n]) => el("button", { class: "tab" + (k === tab ? " active" : ""), "data-tab": k, onclick: () => { saved.fitTab = k; persistAll(); renderFit(body); } }, n))));
    if (!sh) { body.append(el("div", { class: "muted" }, "No ship")); return; }
    const c = el("div", { class: "fit-body" }); body.append(c);
    const mods = sh.mods || [];
    if (tab === "fitting") {
      c.append(el("div", { class: "fit-hull" }, el("img", { src: "assets/ships/" + (T.sprite || "chisel") + "_blue.webp", alt: "", draggable: "false" })),
        el("div", { class: "fit-slots" }, HB_KEYS.slice(0, T.slots || 12).map((k, i) => el("div", { class: "hb-slot fit-slot" + (mods[i] ? " filled" : "") }, el("span", { class: "hb-num" }, k)))),
        el("div", { class: "ps-rows fit-rows" }, generalRows(T)));
    } else if (tab === "hull") {
      c.append(el("div", { class: "fit-title" }, el("span", { class: "ps-name" }, T.name || ""), el("span", { class: "fit-cls" }, T.cls || "")),
        el("p", { class: "fit-desc" }, T.desc || ""), subHead("Hull Bonuses"), el("div", { class: "fit-bonuses" }, (T.bonuses || []).map((b) => el("div", { class: "fit-bonus" }, b))));
    } else if (tab === "stats") {
      const used = (k) => mods.reduce((t, m) => t + ((m && m[k]) || 0), 0);
      c.append(subHead("Fitting"), el("div", { class: "ps-rows fit-rows" }, statRow("Module Slots", mods.filter(Boolean).length + " / " + (T.slots || 12)), statRow("Power", used("power") + " / " + (T.powerMax || 0)), statRow("Disposition", used("disposition") + " / " + (T.dispositionMax || 0))),
        subHead("Ship"), el("div", { class: "ps-rows fit-rows" }, statRow("Class", T.cls || "-"), statRow("Length", kmM(T.lengthKm || 0)), statRow("Acceleration", kmM(T.accelKmps2 || 0) + "/s²"), generalRows(T)));
    } else {
      const r = T.req || {};
      c.append(subHead("Licenses"), el("div", { class: "ps-rows fit-rows" }, (r.licenses || []).map(([n, lv]) => statRow(n, ROMAN[lv] || lv))),
        subHead("Ark Ship"), el("div", { class: "ps-rows fit-rows" }, statRow("Carried by", r.ark || "-")));
    }
  }
  window.Atamus.bus.addEventListener("pilotselect", () => { if (wins.fit && isOpen(wins.fit)) renderFit(wins.fit.body); });
  window.Atamus.bus.addEventListener("snap", () => { for (const [id, r] of [["fit", renderFit], ["inv", renderInv]]) if (wins[id] && isOpen(wins[id])) r(wins[id].body); });   // only rebuilt when their signature changes

  // ---- right-click / hold menu (owner: placement centred above the press; below it near the top; to the right near
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
    createWindow("inv", { left: Math.max(60, Math.round(innerWidth / 2 - 140)), top: Math.max(60, innerHeight - 380), width: 280, minW: 200, minH: 140, render: renderInv, label: "Inventory" });
    createWindow("fit", { left: Math.max(60, Math.round(innerWidth / 2 - 160)), top: 90, width: 320, minW: 290, minH: 200, render: renderFit, label: "Fitting" });
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
