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
  async function refreshState() { state = await Api.get("/game/state"); if (state.serverTime) serverOffset = state.serverTime - Date.now(); ensurePilot(); syncAdminBtn(); syncRenames(); syncNameOffers(); syncPromotion(); renderOpen(); }
  // (owner) the Admin button is only for admins and the Head Admin
  function syncAdminBtn() {
    const staff = !!(state && state.profile && state.profile.role), is = staff || !!(state && state.profile && state.profile.lapsedRole), has = order.includes("admin");   // (owner) staff who lapsed keep it, to ask to be reinstated
    if (staff && !AD.me && !AD.loading) { AD.loading = true; adminLoad(); }   // (the chat's Player / Admin switch needs to know)
    if (is === has) return;
    order = is ? [...order, "admin"] : order.filter((x) => x !== "admin"); renderPanel();
    if (!is && wins.admin && isOpen(wins.admin)) toggleWindow("admin", false);
  }

  // ---- windows ----
  const wins = {};
  // (owner) a dark red overlay blocks the screen behind a window that must be answered: Freeze (the admin DM) and a
  // required rename; only those windows (pinned above it, centered) take input
  let blockEl = null; const blocks = new Set();
  function setBlock(k, on) {
    if (on) blocks.add(k); else blocks.delete(k);
    if (blocks.size && !blockEl) { blockEl = el("div", { class: "frozen-overlay" }); for (const ev of ["pointerdown", "click", "contextmenu", "wheel"]) blockEl.addEventListener(ev, (x) => { x.preventDefault(); x.stopPropagation(); }, { passive: false }); document.body.append(blockEl); }
    else if (!blocks.size && blockEl) { blockEl.remove(); blockEl = null; }
  }
  addEventListener("keydown", (e) => { if (blockEl && !(e.target && e.target.closest && e.target.closest(".admdm-body, .rename-body"))) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);   // no keys but the open window's
  function centerWin(w, dy = 0) { const r = w.win.getBoundingClientRect(); w.win.style.left = Math.max(0, Math.round((innerWidth - r.width) / 2)) + "px"; w.win.style.top = Math.max(0, Math.round((innerHeight - r.height) / 2) + dy) + "px"; }
  const PIN_Z = 2000000005;                          // above everything, the Freeze overlay included (the player's admin conversation)
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
    win.addEventListener("pointerdown", () => { win.style.zIndex = opts.pinTop ? PIN_Z : ++z; });
    if (opts.noClose) close.hidden = true;             // (owner) an admin conversation can't be closed by the player
    dragMove(win, bar, () => persistWin(id));
    addResize(win, opts.minW || 220, opts.minH || 130, () => persistWin(id), opts.dynMin);
    wins[id] = { id, win, body, slot, bar, close, render: opts.render, label: opts.label, groupable: opts.groupable !== false, group: null, pinTop: !!opts.pinTop };
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
    if (show) { w.win.style.zIndex = w.pinTop ? PIN_Z : ++z; if (w.render) w.render(w.body); fitOnScreen(w.win); }
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
    admin: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M9 12l2 2 4-4"/></svg>',
    support: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/></svg>',
    fit: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>',
  };
  // (owner) the game time (UTC), XX:XX AM/PM, at the bottom of the window panel
  const clockText = () => { const d = new Date(), h = d.getUTCHours(), m = d.getUTCMinutes(); return [((h + 11) % 12 + 1) + ":" + String(m).padStart(2, "0"), h < 12 ? "AM" : "PM"]; };
  function paintClock() { let c = panel.querySelector(".panel-clock"); if (!c) { c = el("div", { class: "panel-clock" }); panel.append(c); } const [t, ap] = clockText(); if (c.dataset.t !== t + ap) { c.dataset.t = t + ap; c.innerHTML = ""; c.append(el("div", {}, t), el("div", {}, ap)); } }
  setInterval(paintClock, 5000);
  let order = ["player", "pilot", "chat", "fleet", "inv", "fit", "support"];   // (owner) Support: tickets to the admins
  const META = { player: { name: "Player Sheet", pinned: true }, pilot: { name: "Pilot Info" }, chat: { name: "Chat" }, fleet: { name: "Fleet" }, inv: { name: "Inventory" }, fit: { name: "Fitting" }, support: { name: "Support" }, admin: { name: "Admin" } };
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
    paintClock();
    syncAdminBadge();
    updateBtnActive();
  }
  // (owner) the Admin button's red count: notifications kept while away (read in the panel, with the password)
  function syncAdminBadge() {
    const btn = panel.querySelector('.wbtn[data-id="admin"]'); if (!btn) return;
    const n = (typeof AD !== "undefined" && AD.me && AD.me.notes) || 0; let b = btn.querySelector(".wbadge");
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = el("span", { class: "wbadge" }); btn.append(b); } b.textContent = n > 99 ? "99+" : String(n);
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
    const start = el("select", { class: "base-sel" }, ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"].map((n) => el("option", { value: n.toLowerCase() }, n))); start.value = "earth";   // (owner) the planet they start at
    const submit = async () => { const name = input.value.trim(); if (!name) return; try { await Api.post("/game/pilot/create", { name, start: start.value }); await refreshState(); } catch (e) { err.textContent = e.message; err.hidden = false; } };
    body.append(el("div", { class: "create-pilot" }, el("div", { class: "muted" }, "Name your first pilot:"), input, start, err, el("button", { class: "btn-primary2", onclick: submit }, "Create")));
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
  // (owner) in admin mode an Admin has one more pilot: their admin name, flying their ETA ship
  const allPilots = () => { const ps = (state && state.pilots) || [], sh = pilotShip("admin"); return sh ? [...ps, { id: "admin", name: sh.name || "Admin", admin: true }] : ps; };
  function ensurePilot() {
    const ps = allPilots(); if (!ps.length) return;
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
    const ps = allPilots(); if (ps.length < 2) return;
    const i = ps.findIndex((p) => String(p.id) === String(saved.selPilot)), next = ps[(i + 1) % ps.length];
    selectPilot(next.id);
    const sh = pilotShip(next.id); if (sh) window.Atamus.focusShip(sh.id);   // (owner) Tab centers on them, zoomed to show a whole POI
  });

  // ---- Fleet window (owner): how you switch pilots. Each card: the pilot's portrait on the left; their ship with its
  // shield and hull bars on the right, the pilot's name beneath. Click a card to select that pilot; double-click (or
  // double-tap) it to also center the camera on their ship and follow it. ----
  const pilotShip = (id) => ((window.Atamus.snap && window.Atamus.snap.ships) || []).find((x) => x.mine && String(x.pilot) === String(id)) || null;
  function renderFleet(body) {
    const w = wins.fleet, pilots = allPilots(), cfgT = (window.Atamus.cfg && window.Atamus.cfg.shipTypes) || {};
    const sig = pilots.map((p) => p.id + ":" + p.name + ":" + JSON.stringify(p.portrait) + ":" + ((pilotShip(p.id) || {}).type || "-")).join(",");
    if (sig !== w.fsig) {
      w.fsig = sig; w.cards = {}; body.innerHTML = "";
      const list = el("div", { class: "fleet-list" });
      for (const p of pilots) {
        const sh = pilotShip(p.id), t = sh ? cfgT[sh.type] || {} : {};
        const sf = el("i"), hf = el("i");
        const card = el("button", { class: "fleet-card" },
          p.admin ? el("img", { class: "fc-portrait", src: apicSrc(AD.me && AD.me.persona && AD.me.persona.pic), alt: "", draggable: "false" }) : p.portrait && window.Portrait ? Portrait.canvas(p.portrait, 44, "fc-portrait") : el("span", { class: "fc-portrait" }),
          el("div", { class: "fc-right" },
            el("div", { class: "fc-ship" }, sh ? el("img", { src: "assets/icons/ships/" + (t.icon || (t.sprite || "chisel") + "_blue") + ".png", alt: "", draggable: "false" }) : null),
            el("div", { class: "fc-bars" + (sh ? "" : " empty") }, el("div", { class: "fc-bar fc-sh" }, sf), el("div", { class: "fc-bar fc-hp" }, hf)),
            el("div", { class: "fc-name" }, p.name)));
        card.addEventListener("click", () => selectPilot(p.id));
        // (owner) right-click (hold) a card: its ship's menu, plus Pilot Info
        const cardMenu = (x, y) => { const cur = pilotShip(p.id); const items = cur ? window.Atamus.ownShipItems(cur.id) : []; if (cur && !items.some((it) => it[0] === "Show Fitting")) items.splice(Math.min(1, items.length), 0, ["Show Fitting", () => showFitting(p.id)]);
          showCtxMenu(x, y, p.admin ? items : [...items, ["Pilot Info", () => openPilotInfo(String(p.id))]]); };
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
      // (owner) Undock, while the selected pilot is aboard a docked ship
      w.acts.undock = el("button", { class: "fa-btn fa-dock", "aria-label": "Undock", html: '<svg viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M6 20V9l6-5 6 5v11"/><path d="M12 17V9"/><path d="M9 12l3-3 3 3"/></svg>', onclick: () => { const sh = pilotShip(saved.selPilot); if (sh && sh.docked && !sh.unboarded) window.Atamus.send({ t: "undock", ship: sh.id }); } });
      nameTip(w.acts.undock, "Undock");
      w.acts.row.append(w.acts.align, w.acts.warp, w.acts.dock, w.acts.undock);
      body.append(list, w.acts.row);
      w.win.style.width = "auto"; w.win.style.height = "auto";   // exactly as big as its cards
    }
    {                                                // the actions show while the ship has a destination; Warp only while that POI still advertises itself
      const sh = pilotShip(saved.selPilot), A = window.Atamus, poi = sh && sh.dest ? A.poi(sh.dest) : null;
      const show = !!(sh && sh.dest && !sh.warp && !sh.docked), canWarp = !!(poi && !poi.hidden && !A.inPoi(sh, poi)), canDock = !!(sh && !sh.docked && A.canDock(sh)), canUndock = !!(sh && sh.docked && !sh.unboarded);
      w.acts.row.hidden = !show && !canDock && !canUndock; w.acts.align.hidden = !show; w.acts.warp.hidden = !canWarp || !show; w.acts.dock.hidden = !canDock; w.acts.undock.hidden = !canUndock;
      w.acts.align.classList.toggle("on", show && !sh.warpReq); w.acts.warp.classList.toggle("on", show && !!sh.warpReq);
    }
    for (const p of pilots) {
      const c = w.cards[p.id]; if (!c) continue;
      const sh = pilotShip(p.id), t = sh ? cfgT[sh.type] || {} : {};
      c.sf.style.width = (sh && t.shield ? Math.max(0, Math.min(1, sh.shield / (sh.shieldMax || t.shield))) * 100 : 0) + "%";
      c.hf.style.width = (sh && t.hp ? Math.max(0, Math.min(1, sh.hp / t.hp)) * 100 : 0) + "%";
      c.card.classList.toggle("sel", String(p.id) === String(saved.selPilot));
    }
  }
  window.Atamus.bus.addEventListener("snap", () => { if (saved.selPilot === "admin" && !pilotShip("admin")) ensurePilot(); const w = wins.fleet; if (w && isOpen(w)) renderFleet(w.body); });   // (the admin pilot gone with admin mode)

  // ---- chat (owner): Local and Corp, plus a tab per direct message. You speak as your account's character: its
  // portrait and your username. Right-click (or hold) a name for Info, DM and Report. ----
  const chat = { local: [], corp: [], staff: [], modchat: [] }, unread = {}, dms = []; let chatTab = "local", chatAs = "player", staffLoaded = false;
  const apicSrc = (n) => "assets/admin/" + (Number.isInteger(n) && n >= 1 && n <= 6 ? n : 1) + ".png";
  const canAdminChat = () => !!(AD.me && AD.me.unlocked && AD.me.persona);
  // (owner) the game hears of admin mode: staff see other players' ships only in it (Admins; Moderators never)
  const sendMode = () => { if (chatAs === "admin" && !canAdminChat()) chatAs = "player"; window.Atamus.adminMode = chatAs === "admin"; window.Atamus.send({ t: "mode", admin: chatAs === "admin" }); };
  window.Atamus.bus.addEventListener("hello", () => sendMode());
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
    if (!self) items.push(["DM", () => openDm(name)], ["Report", () => openReport(name, line)], ...relMenuItems(name));   // (owner) Mute / Block
    if (!self && myRole()) items.push([staffWord(), adminMenuByName(name), { cls: "ctx-admin" }]);   // (owner) red   // (owner) an admin's options for this player
    showCtxMenu(x, y, items);
  }
  function appendChatLine(log, msg) {
    if (!log) return;
    let node;
    if (msg.sys) { node = el("div", { class: "sys" + (msg.staff ? " staff-sys" : "") + (msg.ref ? " link" : "") }, "» " + msg.text); if (msg.ref) node.addEventListener("click", () => openNoteRef(msg.ref)); }   // (owner) a staff notification: click to open what it's about
    else if (msg.admin) node = el("div", { class: "chat-line admin rank-" + (msg.rank === "mod" ? "mod" : "admin") + (msg.mention ? " mention" : "") }, (msg.portrait && window.Portrait ? Portrait.canvas(msg.portrait, 22, "chat-portrait") : el("img", { class: "chat-portrait chat-apic", src: apicSrc(msg.pic), alt: "" })), el("div", { class: "chat-msg" }, el("span", { class: "who" }, msg.from + ": "), msg.text));   // (owner) an admin speaking as admin
    else {
      const who = el("span", { class: "who" }, msg.from + ": ");
      who.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); playerMenu(msg.from, e.clientX, e.clientY, msg.text); });
      let t = 0; who.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; e.stopPropagation(); clearTimeout(t); t = setTimeout(() => playerMenu(msg.from, e.clientX, e.clientY, msg.text), 500); });   // hold = right-click
      for (const ev of ["pointerup", "pointercancel", "pointerleave"]) who.addEventListener(ev, () => clearTimeout(t));
      node = el("div", { class: "chat-line" }, msg.portrait && window.Portrait ? Portrait.canvas(msg.portrait, 22, "chat-portrait") : el("span", { class: "chat-portrait" }), el("div", { class: "chat-msg" }, who, msg.text));
    }
    log.append(node); log.scrollTop = log.scrollHeight;
  }
  window.Atamus.bus.addEventListener("chat", (e) => {
    const m = e.detail;
    if (m.ch === "dm") { const other = m.from.toLowerCase() === myName().toLowerCase() ? m.to : m.from; pushChat(ensureDm(other), { from: m.from, portrait: m.portrait, text: m.text }); return; }
    if (m.ch === "staff" || m.ch === "modchat") { const me = AD.me && AD.me.persona && AD.me.persona.name; pushChat(m.ch, { from: m.from, admin: m.admin, pic: m.pic, rank: m.rank, portrait: m.portrait, text: m.text, mention: !!(me && new RegExp("@" + me + "\\b", "i").test(m.text)) }); return; }   // (owner) the Admin chat; @you is highlighted
    pushChat(m.ch === "corp" ? "corp" : "local", { from: m.from, portrait: m.portrait, text: m.text, ...(m.admin ? { admin: m.admin, pic: m.pic, rank: m.rank, portrait: m.portrait } : {}) });
  });
  // (owner) an admin changed their profile: their lines (old ones too) show the new name and picture
  window.Atamus.bus.addEventListener("adminprofile", (e) => {
    const m = e.detail; let any = false;
    for (const k in chat) for (const l of chat[k]) if (l.admin && l.admin === m.key) { l.from = m.name; l.pic = m.pic; l.rank = m.rank; any = true; }
    if (any && wins.chat && isOpen(wins.chat)) renderChat(wins.chat.body);
    for (const [room, c] of admConv) {
      let ch = false;
      for (const l of c.log) if (l.key && l.key === m.key) { l.from = m.name; l.pic = m.pic; l.rank = m.rank; ch = true; }
      if (ch && wins[roomWin(room)]) renderRoom(room, wins[roomWin(room)].body);
    }
  });
  window.Atamus.bus.addEventListener("sys", (e) => { const d = e.detail; pushChat(d.dm ? ensureDm(d.dm) : "local", { sys: true, text: d.text }); });
  function renderChat(body) {
    unread[chatTab] = false;
    if (!chat[chatTab] || ((chatTab === "staff" || chatTab === "modchat") && !canAdminChat()) || (chatTab === "staff" && isMod())) chatTab = "local";
    const slot = wins.chat && wins.chat.slot;
    if (slot) {
      slot.innerHTML = "";
      const row = el("div", { class: "tab-row" });
      for (const [k, label] of [["local", "Local"], ["corp", "Corp"], ...(canAdminChat() ? (isMod() ? [["modchat", "Moderator"]] : [["staff", "Admin"], ["modchat", "Moderator"]]) : []), ...dms.map((d) => [d.k, d.name])]) {   // (owner) staff: the Admin chat
        const b = el("button", { class: "tab" + (k === chatTab ? " active" : ""), "data-ch": k, onclick: () => { chatTab = k; renderChat(body); } }, label);
        if (k === "local" || k === "corp") holdMenu(b, chatMenu);   // (owner) the Muted / Blocked lists
        if (k.startsWith("dm:")) b.append(el("span", { class: "tab-x", onclick: (e) => { e.stopPropagation(); closeDm(k); } }, "×"));
        row.append(b);
      }
      slot.append(row);
    }
    body.innerHTML = "";
    const log = el("div", { class: "chat-log" });
    for (const m of chat[chatTab]) appendChatLine(log, m);
    const dm = dms.find((d) => d.k === chatTab);
    const input = el("input", { class: "text-input", maxlength: "240", placeholder: dm ? dm.name : chatTab === "corp" ? "Deep Core Industries" : chatTab === "staff" ? "Admin" : chatTab === "modchat" ? "Moderator" : "Local" });
    // (owner) an admin's Player / Admin switch: as Admin they speak under their admin profile (a DM becomes an admin DM)
    const asAdmin = () => chatAs === "admin" && canAdminChat();
    const sw = canAdminChat() && chatTab !== "staff" && chatTab !== "modchat" ? el("button", { type: "button", class: "chat-as" + (chatAs === "admin" ? " on" : ""), onclick: () => { chatAs = chatAs === "admin" ? "player" : "admin"; sw.textContent = chatAs === "admin" ? staffWord() : "Player"; sw.classList.toggle("on", chatAs === "admin"); sendMode(); input.focus(); } }, chatAs === "admin" ? "Admin" : "Player") : null;
    const form = el("form", { class: "chat-form", onsubmit: (e) => {
      e.preventDefault(); const t = input.value.trim(); if (!t) return;
      const own = window.Atamus.myShip, as = asAdmin() ? { as: "admin" } : {};
      if (chatTab === "staff" || chatTab === "modchat") { window.Atamus.send({ t: "chat", text: t, channel: chatTab }); input.value = ""; return; }
      window.Atamus.send(dm ? { t: "chat", text: t, channel: "dm", to: dm.name, ...as } : { t: "chat", text: t, channel: chatTab, ...as, ...(own && !as.as ? { ship: own.id } : {}) }); input.value = "";
      if (dm && as.as) startAdmDm(dm.name);
    } }, sw, input);
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

  // ---- the admin panel (owner): for admins and the Head Admin, behind a second password. Players (Players / Admins),
  // right-click (hold) one: Info, DM, Report, Kick, Ban / Unban (and for the Head Admin: Make / Remove Admin); the Info
  // window has the player's details and their pilots' licenses (the Head Admin can raise, lower and reset them, and reset
  // credits and corporation). The Log lists every kick, ban and change with its reason; a ban there can be lifted. ----
  const FLAG_TABS = [["all", "All"], ["racist", "Racist"], ["groups", "Groups"], ["hostile", "Group hostility"], ["slurs", "Slurs"], ["profanity", "Profanity"], ["sexual", "Sexual"], ["extremist", "Extremist"]], FLAG_NAME = Object.fromEntries(FLAG_TABS);
  // (owner) a newly flagged chat line: the Chat tab updates at once
  window.Atamus.bus.addEventListener("chatflag", async () => {
    if (!(AD.me && AD.me.unlocked && wins.admin && isOpen(wins.admin))) return;
    try { AD.flags = await Api.get("/game/admin/chatflags"); drawAdminList(wins.admin.body); } catch {}
  });
  const catSelect = (v) => { const s = el("select", { class: "base-sel" }, FLAG_TABS.slice(1).map(([k, n]) => el("option", { value: k }, n))); if (v) s.value = v; return s; };
  const AD = { me: null, tab: "players", sub: "players", players: null, log: null, sig: "" };
  // (owner) staff: the Head Admin (Nyssary), Admins and Moderators; Admins and the Head Admin are "high"
  const ROLE_NAME = { head: "Head Admin", admin: "Admin", mod: "Moderator" }, isHigh = () => myRole() === "head" || myRole() === "admin";
  // (owner) a Moderator's own screens say Moderator, never Admin
  const isMod = () => myRole() === "mod", staffWord = () => (isMod() ? "Moderator" : "Admin");
  const myRole = () => (state && state.profile && state.profile.role) || null;
  const fmtWhen = (t) => { const d = new Date(t); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); };
  async function adminLoad() {
    if (!myRole()) {                                  // (owner) a lapsed staff member: only the reinstatement request
      AD.me = null; try { AD.lapsed = state && state.profile && state.profile.lapsedRole ? await Api.get("/game/admin/lapsed") : null; } catch { AD.lapsed = null; }
      if (wins.admin && isOpen(wins.admin)) renderLapsed(wins.admin.body); return;
    }
    const could = canAdminChat();
    // (a failed /me no longer loops: the panel says why and tries again a little later, each time longer)
    try { AD.me = await Api.get("/game/admin/me"); AD.meErr = null; AD.retry = 0; } catch (e) { AD.me = null; AD.meErr = e.message || "Can't reach the server."; }
    if (could !== canAdminChat() && wins.chat && isOpen(wins.chat)) renderChat(wins.chat.body);   // (the Player / Admin switch)
    if (AD.me && AD.me.unlocked && AD.me.persona) {   // (all at once; the Head Admin also gets reset requests, Admins the reviews)
      const head = AD.me.role === "head", hi = AD.me.role !== "mod";
      try { [AD.players, AD.log, AD.appeals, AD.flags, AD.names, AD.reports, AD.words, AD.relappeals, AD.tickets, AD.notes, AD.unread, AD.resets, AD.reviews, AD.reins] = await Promise.all([...["players", "log", "appeals", "chatflags", "names", "reports", "words", "relappeals", "tickets", "notes", "unread"].map((x) => Api.get("/game/admin/" + x)), head ? Api.get("/game/admin/resets") : [], hi ? Api.get("/game/admin/reviews") : [], head ? Api.get("/game/admin/reinstatements") : []]); } catch (e) { flash(e.message); }
    }
    syncAdminBadge(); loadStaffChat();
    if (wins.admin && isOpen(wins.admin) && AD.me && AD.me.unlocked) await markAdminSeen();
    if (wins.admin && isOpen(wins.admin)) renderAdmin(wins.admin.body);   // (rebuilt only when something changed)
  }
  // (owner) what's new on a tab clears once its staff member has it open; Notifications clear when opened
  const SEEN_TAB = () => (AD.tab === "players" ? (AD.sub === "disc" ? "disc" : null) : ["reports", "appeals", "chat", "names", "words", "support", "review"].includes(AD.tab) ? AD.tab : null);
  async function markAdminSeen() {
    const k = SEEN_TAB();
    if (k === "disc" && !AD.discOpen && AD.unread && AD.unread.seen) { AD.discOpen = true; AD.discPrev = AD.unread.seen.disc; AD.sig = ""; }   // (what was new when the list was opened stays marked while it's open)
    if (k !== "disc") AD.discOpen = false;
    if (k && AD.unread && (AD.unread[k] || k === "disc")) { AD.unread[k] = 0; try { await Api.post("/game/admin/seen", { tab: k }); } catch {} }
    if (AD.tab === "notes" && AD.me && AD.me.notes) { AD.me.notes = 0; syncAdminBadge(); try { await Api.post("/game/admin/notes/read", {}); } catch {} }
  }
  // the unread counts on the tabs (a small number bar beside each name)
  function paintBadges(body) {
    const set = (btn, n) => { if (!btn) return; let b = btn.querySelector(".tbadge"); if (!n) { if (b) b.remove(); return; } if (!b) { b = el("span", { class: "tbadge" }); btn.append(b); } b.textContent = n > 99 ? "99+" : String(n); };
    const u = AD.unread || {};
    for (const k of ["reports", "appeals", "chat", "names", "words", "support", "review"]) set(body.querySelector('[data-atab="' + k + '"]'), u[k]);
    set(body.querySelector('[data-atab="players"]'), u.disc); set(body.querySelector('[data-asub="disc"]'), u.disc);
    set(body.querySelector('[data-atab="notes"]'), AD.me && AD.me.notes);
  }
  // the tabs (and the search box) are built once per tab; the list under them is redrawn when its data or the search changes
  // (owner) staff who lapsed (90 days without staff activity) ask the Head Admin to be reinstated, saying why
  function renderLapsed(body) {
    const L = AD.lapsed, sig = JSON.stringify(L); if (body.dataset.lapsed === sig) return; body.dataset.lapsed = sig;
    body.innerHTML = ""; body.classList.add("adm-body"); wins.admin.slot.textContent = "Reinstatement";
    if (!L) { body.append(el("div", { class: "muted" }, "Loading…")); return; }
    const err = el("div", { class: "form-err", hidden: "" }), why = el("textarea", { class: "text-input report-text", maxlength: "500", rows: "4" });
    why.addEventListener("keydown", (e) => e.stopPropagation());
    const pending = L.request && L.request.status === "open", last = L.request && L.request.status === "denied" ? el("div", { class: "muted" }, "Your last request was denied.") : null;
    const send = el("button", { class: "btn-primary2", onclick: async () => { if (!why.value.trim()) { err.textContent = "Write why."; err.hidden = false; return; } send.disabled = true;
      try { await Api.post("/game/admin/reinstate", { reason: why.value }); body.dataset.lapsed = ""; await adminLoad(); } catch (e) { err.textContent = e.message; err.hidden = false; } send.disabled = false; } }, "Send");
    body.append(el("div", { class: "adm-lock" }, el("div", { class: "sheet-k" }, "Reinstatement as " + (ROLE_NAME[L.role] || L.role)),
      pending ? el("div", { class: "muted" }, "Sent to the Head Admin " + fmtWhen(L.request.at) + ".") : el("div", { class: "report-form" }, last, el("div", { class: "sheet-k" }, "Why"), why, err, send)));
  }
  function renderAdmin(body, force) {
    if (!myRole()) { renderLapsed(body); return; }
    delete body.dataset.lapsed;
    const shell = JSON.stringify([AD.me, AD.meErr, AD.tab, AD.sub, AD.fcat, AD.apSub]);
    if (force || shell !== AD.shell || !body.querySelector(".adm-list")) {
      AD.shell = shell; AD.sig = ""; wins.admin.slot.textContent = isMod() ? "Moderation" : "Admin"; body.innerHTML = ""; body.classList.add("adm-body");
      if (!AD.me) {
        body.append(el("div", { class: "muted" }, AD.meErr || "Loading…"));
        if (!AD.loadTimer) { const wait = AD.meErr ? Math.min(30000, 2000 * 2 ** (AD.retry = (AD.retry || 0) + 1)) : 0; AD.loadTimer = setTimeout(() => { AD.loadTimer = null; adminLoad(); }, wait); }
        return;
      }
      if (AD.me.suspendedUntil) { body.append(el("div", { class: "adm-lock" }, el("div", { class: "muted" }, "Suspended until " + fmtWhen(AD.me.suspendedUntil)))); return; }   // (owner) a suspended Moderator
      if (!AD.me.unlocked && AD.me.needPassword) {     // (owner) new staff: their own panel password first
        const pw = el("input", { class: "text-input adm-pw", type: "password", autocomplete: "new-password", spellcheck: "false" }), pw2 = el("input", { class: "text-input adm-pw", type: "password", autocomplete: "new-password", spellcheck: "false" }), err = el("div", { class: "form-err", hidden: "" });
        const go = async () => { if (pw.value !== pw2.value) { err.textContent = "Passwords don't match."; err.hidden = false; return; } try { await Api.post("/game/admin/password", { password: pw.value }); pw.value = pw2.value = ""; await adminLoad(); } catch (e) { err.textContent = e.message; err.hidden = false; } };
        for (const x of [pw, pw2]) x.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") go(); });
        body.append(el("div", { class: "adm-lock" }, el("div", { class: "sheet-k adm-pw-head" }, el("span", {}, "New " + staffWord().toLowerCase() + " password")), pw, el("div", { class: "sheet-k" }, "Confirm"), pw2, err, el("button", { class: "btn-primary2", onclick: go }, "Save")));
        setTimeout(() => pw.focus(), 30); return;
      }
      if (!AD.me.unlocked) {                           // the second password (masked; paste works)
        const pw = el("input", { class: "text-input adm-pw", type: "password", autocomplete: "off", spellcheck: "false" }), err = el("div", { class: "form-err", hidden: "" });
        const go = async () => { try { await Api.post("/game/admin/unlock", { password: pw.value }); pw.value = ""; await adminLoad(); } catch (e) { err.textContent = e.message; err.hidden = false; } };
        pw.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
        const lock = el("div", { class: "adm-lock" }, el("div", { class: "sheet-k" }, staffWord() + " password"), pw, err, el("button", { class: "btn-primary2", onclick: go }, "Unlock"));
        if (!AD.me.owner) {                             // (owner) staff who can't get in ask the Head Admin for a reset, saying why
          const why = el("textarea", { class: "text-input report-text", maxlength: "500", rows: "3" }), req = el("div", { class: "report-form", hidden: "" }), done = el("div", { class: "muted", hidden: "" }, "Sent.");
          why.addEventListener("keydown", (e) => e.stopPropagation());
          const send = el("button", { class: "btn-primary2", onclick: async () => { if (!why.value.trim()) { err.textContent = "Write why."; err.hidden = false; return; } send.disabled = true;
            try { await Api.post("/game/admin/pwreset/request", { reason: why.value }); req.hidden = true; done.hidden = false; err.hidden = true; } catch (e) { err.textContent = e.message; err.hidden = false; } send.disabled = false; } }, "Send");
          req.append(el("div", { class: "sheet-k" }, "Why"), why, send);
          lock.append(el("button", { class: "btn-ghost2 adm-mini", onclick: () => { req.hidden = !req.hidden; if (!req.hidden) setTimeout(() => why.focus(), 30); } }, "Request Reset"), req, done);
        }
        body.append(lock);
        setTimeout(() => pw.focus(), 30); return;
      }
      if (!AD.me.persona) { body.append(personaForm(() => { renderAdmin(body, true); adminLoad(); })); return; }   // (owner) first: the admin profile
      body.append(el("div", { class: "tab-row" }, [["players", "Players"], ["reports", "Reports"], ["appeals", "Appeals"], ["chat", "Chat"], ["names", "Names"], ["words", "Words"], ["support", "Support"], ["log", "Log"], ...(AD.me.role === "head" ? [["resets", "Resets"]] : []), ...(AD.me.role !== "mod" ? [["review", "Review"]] : []), ["notes", "Notifications"]].map(([k, n]) => el("button", { class: "tab" + (AD.tab === k ? " active" : ""), "data-atab": k, onclick: () => { AD.tab = k; renderAdmin(body, true); adminLoad(); } }, n))));
      if (AD.tab === "players") {
        body.append(el("div", { class: "tab-row adm-sub" }, [["players", "Players"], ["admins", "Staff"], ["disc", "Disciplined"]].map(([k, n]) => el("button", { class: "tab" + (AD.sub === k ? " active" : ""), "data-asub": k, onclick: () => { AD.sub = k; renderAdmin(body, true); markAdminSeen().then(() => drawAdminList(body)); } }, n))));
        const q = el("input", { class: "text-input adm-search", type: "search", value: AD.q || "", autocomplete: "off", spellcheck: "false" });
        q.addEventListener("input", () => { AD.q = q.value; drawAdminList(body); }); q.addEventListener("keydown", (e) => e.stopPropagation());
        const bar = el("div", { class: "adm-bar" }, q);
        if (AD.sub === "disc") {                       // (owner) sortable by name, date, type
          const sort = el("select", { class: "base-sel adm-sort" }, [["date", "Date"], ["name", "Name"], ["type", "Type"]].map(([v, n]) => el("option", { value: v }, n)));
          sort.value = AD.sort || "date"; sort.addEventListener("change", () => { AD.sort = sort.value; drawAdminList(body); }); bar.append(sort);
        }
        body.append(bar);
      }
      if (AD.tab === "words") {                      // (owner) ask for a word to be added to the filter, in a category
        const w = el("input", { class: "text-input adm-search", maxlength: "30", autocomplete: "off", spellcheck: "false" }), c = catSelect(), err = el("div", { class: "form-err", hidden: "" });
        const go = async () => { if (!w.value.trim()) return; try { await Api.post("/game/admin/words/request", { word: w.value.trim(), cat: c.value }); w.value = ""; err.hidden = true; adminLoad(); } catch (e) { err.textContent = e.message; err.hidden = false; } };
        w.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") go(); });
        const repeal = async () => { if (!w.value.trim()) return; try { await Api.post("/game/admin/words/repeal", { word: w.value.trim() }); w.value = ""; err.hidden = true; adminLoad(); } catch (e) { err.textContent = e.message; err.hidden = false; } };
        body.append(el("div", { class: "adm-bar adm-words" }, w, c, el("button", { class: "btn-ghost2 adm-mini", onclick: go }, "Request"), myRole() === "head" ? el("button", { class: "btn-ghost2 adm-mini", onclick: repeal }, "Repeal") : null), err);
      }
      if (AD.tab === "appeals" && isMod()) AD.apSub = "rel";   // (owner) Moderators: mute / block appeals only
      if (AD.tab === "appeals" && !isMod()) body.append(el("div", { class: "tab-row adm-sub" }, [["bans", "Bans"], ["rel", "Mutes & Blocks"]].map(([k, n]) => el("button", { class: "tab" + ((AD.apSub || "bans") === k ? " active" : ""), onclick: () => { AD.apSub = k; renderAdmin(body, true); } }, n))));
      if (AD.tab === "chat") body.append(el("div", { class: "tab-row adm-sub" }, [["high", "High Profanity"], ...FLAG_TABS].map(([k, n]) => el("button", { class: "tab" + ((AD.fcat || "all") === k ? " active" : ""), onclick: () => { AD.fcat = k; renderAdmin(body, true); } }, n))));
      body.append(el("div", { class: "adm-list" }));
    }
    drawAdminList(body);
  }
  // (owner) the admin profile: an admin name and one of the admin pictures, used whenever they act or speak as admin
  function personaForm(onDone) {
    const cur = AD.me && AD.me.persona; let pic = cur ? cur.pic : 0;
    const name = el("input", { class: "text-input", maxlength: "24", autocomplete: "off", spellcheck: "false", value: cur ? cur.name : "" }), err = el("div", { class: "form-err", hidden: "" });
    const pics = el("div", { class: "apic-row" }, [1, 2, 3, 4, 5, 6].map((n) => el("button", { type: "button", class: "apic" + (n === pic ? " sel" : ""), "data-pic": String(n), onclick: () => { pic = n; for (const b of pics.children) b.classList.toggle("sel", +b.dataset.pic === n); } }, el("img", { src: apicSrc(n), alt: "" }))));
    const go = async () => { try { const r = await Api.post("/game/admin/persona", { name: name.value.trim(), pic }); AD.me.persona = r.persona; if (wins.chat && isOpen(wins.chat)) renderChat(wins.chat.body); onDone(); } catch (e) { err.textContent = e.message; err.hidden = false; } };
    name.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") go(); });
    setTimeout(() => name.focus(), 30);
    return el("div", { class: "report-form apic-form" }, el("div", { class: "sheet-k" }, staffWord() + " name"), name, el("div", { class: "sheet-k" }, staffWord() + " picture"), pics, err, el("button", { class: "btn-primary2", onclick: go }, "Save"));
  }
  function openPersona() {
    if (!wins.aprofile) createWindow("aprofile", { left: Math.round(innerWidth / 2 - 170), top: 140, width: 340, minW: 280, minH: 230, render: () => {}, label: "Admin Profile", groupable: false });
    const w = wins.aprofile; w.slot.textContent = staffWord() + " Profile"; w.body.innerHTML = ""; w.body.append(personaForm(() => { toggleWindow("aprofile", false); adminLoad(); }));
    toggleWindow("aprofile", true);
  }
  // a player's name that acts like their row in the list: click for Info, right-click (hold) for their menu
  function playerLink(id, name) {
    const a = el("span", { class: "adm-link" }, name), p = () => (AD.players || []).find((x) => x.id === id);
    if (!id) return a;
    a.addEventListener("click", (e) => { e.stopPropagation(); openAdminPlayer(id); });
    holdMenu(a, () => { const pl = p(); return pl ? adminMenu(pl) : [["Info", () => openAdminPlayer(id)]]; });
    return a;
  }
  // (owner) a player's language meter: how hot their language has run lately (cooling over time)
  const HEAT_MAX = 10, HEAT_HOT = 6;
  function heatBar(h, big) { const f = Math.max(0, Math.min(1, (h || 0) / HEAT_MAX)); return el("span", { class: "heat" + (big ? " big" : "") }, el("span", { class: "heat-fill", style: "width:" + Math.round(f * 100) + "%;background:hsl(" + Math.round(50 - 50 * f) + ",90%," + Math.round(55 - 8 * f) + "%)" })); }
  // a player's discipline in effect: [type, its label, when it began]
  function disciplines(p) {
    const out = [];
    if (p.ban) out.push([p.ban.perm ? "perma" : "temp", p.ban.perm ? "Permanent ban" : "Temp ban until " + fmtWhen(p.ban.until), p.ban.at, p.ban.reason]);
    if (p.mute) out.push(["mute", p.mute.perm ? "Muted" : "Muted until " + fmtWhen(p.mute.until), p.mute.at, p.mute.reason]);
    if (p.frozen) out.push(["frozen", "Frozen", p.frozen.at, p.frozen.reason]);
    return out;
  }
  function drawAdminList(body) {
    const list = body.querySelector(".adm-list"); if (!list || !AD.me || !AD.me.unlocked) return;
    const sig = JSON.stringify([AD.reins, AD.tab, AD.sub, AD.fcat, AD.q, AD.sort, AD.players, AD.log, AD.appeals, AD.flags, AD.names, AD.reports, AD.words, AD.relappeals, AD.tickets, AD.apSub, AD.notes, AD.unread, AD.me && AD.me.notes, AD.resets, AD.reviews]); if (sig === AD.sig) return; AD.sig = sig;
    const keep = list.scrollTop; list.innerHTML = "";
    paintBadges(body);
    const needle = (AD.q || "").trim().toLowerCase(), match = (n) => !needle || n.toLowerCase().includes(needle);
    if (AD.tab === "players") {
      if (AD.sub === "disc") {
        const rows = [];
        for (const p of AD.players || []) if (match(p.name)) for (const d of disciplines(p)) rows.push({ p, d });
        const order = { perma: 0, temp: 1, mute: 2, frozen: 3 }, srt = AD.sort || "date";
        rows.sort((a, b) => srt === "name" ? a.p.name.localeCompare(b.p.name) : srt === "type" ? order[a.d[0]] - order[b.d[0]] || a.p.name.localeCompare(b.p.name) : new Date(b.d[2] || 0) - new Date(a.d[2] || 0));
        for (const { p, d } of rows) {
          const fresh = AD.discPrev && d[2] && new Date(d[2]) > new Date(AD.discPrev);   // (owner) new since this tab was last opened
          const row = el("div", { class: "adm-row adm-disc" + (fresh ? " fresh" : "") }, el("span", { class: "adm-dot" + (p.online ? " on" : "") }), playerLink(p.id, p.name), el("span", { class: "adm-tag" }, d[1]), el("span", { class: "adm-when" }, d[2] ? fmtWhen(d[2]) : ""), fresh ? el("span", { class: "adm-new" }, "New") : null);
          holdMenu(row, () => adminMenu(p)); list.append(row, d[3] ? el("div", { class: "adm-reason adm-disc-reason" }, d[3]) : "");
        }
      } else {
        if (AD.sub === "admins") for (const r of AD.reins || []) {   // (owner) reinstatement requests: the Head Admin decides
          list.append(el("div", { class: "adm-log open" }, el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(r.at)), el("b", {}, "Reinstate as " + (ROLE_NAME[r.role] || r.role)), playerLink(r.userId, r.name)),
            el("div", { class: "adm-reason" }, r.reason), el("div", { class: "adm-bar adm-words" }, el("button", { class: "btn-ghost2 adm-mini", onclick: () => adminDo("/reinstatement", { id: r.id, approve: true }) }, "Approve"), el("button", { class: "btn-ghost2 adm-mini", onclick: () => adminDo("/reinstatement", { id: r.id, approve: false }) }, "Deny"))));
        }
        for (const p of (AD.players || []).filter((x) => (AD.sub === "admins") === !!x.role && (match(x.name) || (x.adminName && match(x.adminName))))) {
          const tag = (p.role ? ROLE_NAME[p.role] || p.role : disciplines(p).map((d) => d[1]).join(" · ")) + (p.adminName ? " · " + p.adminName : "") + (p.suspendedUntil ? " · Suspended until " + fmtWhen(p.suspendedUntil) : "") + (p.pending ? " · Not accepted yet" : "");
          const row = el("div", { class: "adm-row" + (p.ban ? " banned" : "") }, el("span", { class: "adm-dot" + (p.online ? " on" : "") }), el("span", { class: "adm-name" }, p.name), p.heat >= 0.5 ? heatBar(p.heat) : "", el("span", { class: "adm-tag" }, tag));
          holdMenu(row, () => adminMenu(p)); row.addEventListener("dblclick", () => openAdminPlayer(p.id));
          list.append(row);
        }
      }
    } else if (AD.tab === "chat" && AD.fcat === "high") {   // (owner) players whose language meter is at the alert mark or above, hottest first
      for (const p of (AD.players || []).filter((x) => x.heat >= HEAT_HOT).sort((a, b) => b.heat - a.heat)) {
        const row = el("div", { class: "adm-row" }, el("span", { class: "adm-dot" + (p.online ? " on" : "") }), playerLink(p.id, p.name), heatBar(p.heat), el("span", { class: "heat-n" }, String(p.heat)));
        row.addEventListener("click", (e) => { if (!e.target.closest(".adm-link")) { apTab = "lang"; openAdminPlayer(p.id); } }); holdMenu(row, () => adminMenu(p)); list.append(row);
      }
    } else if (AD.tab === "review") {                  // (owner) what Moderators did: Approve keeps it, Edit re-issues it, Lift undoes it
      const REV = { open: "To review", approved: "Approved", edited: "Edited", lifted: "Lifted" };
      for (const x of AD.reviews || []) {
        const row = el("div", { class: "adm-log" + (x.status === "open" ? " open" : "") },
          el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(x.at)), el("b", {}, x.mod + " " + x.action), playerLink(x.targetId, x.target), el("span", { class: "adm-tag" }, (x.detail && x.detail.text ? x.detail.text + " · " : "") + (REV[x.status] || x.status)), el("span", { class: "adm-by" }, x.by || "")),
          x.reason ? el("div", { class: "adm-reason" }, x.reason) : null);
        if (x.status === "open") {
          const done = (outcome) => adminDo("/review", { id: x.id, outcome }), pl = (AD.players || []).find((q) => q.id === x.targetId) || { id: x.targetId, name: x.target };
          row.append(el("div", { class: "adm-bar adm-words" },
            el("button", { class: "btn-ghost2 adm-mini", onclick: () => done("approved") }, "Approve"),
            x.action === "banned" || x.action === "muted" ? el("button", { class: "btn-ghost2 adm-mini", onclick: () => openBan(pl, x.action === "muted" ? "mute" : "ban", () => done("edited")) }, "Edit") : null,
            el("button", { class: "btn-ghost2 adm-mini", onclick: () => done("lifted") }, "Lift")));
        }
        list.append(row);
      }
    } else if (AD.tab === "resets") {                  // (owner) password reset requests (the Head Admin only): open first
      for (const x of AD.resets || []) {
        const row = el("div", { class: "adm-log adm-appeal" + (x.status === "open" ? " open" : "") }, el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(x.at)), el("b", {}, RESET_ST[x.status] || x.status), playerLink(x.userId, x.name), el("span", { class: "adm-by" }, x.lines + (x.lines === 1 ? " line" : " lines"))));
        row.addEventListener("click", (e) => { if (!e.target.closest(".adm-link")) openAdminReset(x.id); }); list.append(row);
      }
    } else if (AD.tab === "notes") {                   // (owner) notifications kept while away: newest first; click one for what it's about
      for (const n of AD.notes || []) {
        const row = el("div", { class: "adm-log" + (n.read ? "" : " open") }, el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(n.at))), el("div", { class: "adm-reason" }, n.text));
        if (n.ref) { row.style.cursor = "pointer"; row.addEventListener("click", () => openNoteRef(n.ref)); } list.append(row);
      }
    } else if (AD.tab === "chat") {                    // (owner) flagged Local / Corp lines, the flagged words highlighted; a tab per kind of word
      for (const f of (AD.flags || []).filter((x) => !AD.fcat || AD.fcat === "all" || x.cats.includes(AD.fcat))) {
        const text = el("div", { class: "adm-reason" });
        for (const part of f.text.split(/(\s+)/)) text.append(part.trim() && f.words.some((w) => part.includes(w)) ? el("mark", { class: "adm-mark" }, part) : part);
        list.append(el("div", { class: "adm-log" },
          el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(f.at)), playerLink(f.userId, f.name), el("span", { class: "adm-when" }, f.channel === "corp" ? "Corp" : "Local"), el("span", { class: "adm-by" }, f.cats.map((c) => FLAG_NAME[c] || c).join(", "))),
          text));
      }
    } else if (AD.tab === "reports") {                 // (owner) player reports: who about whom, why, their ships then, and the chat saved with it
      for (const r of AD.reports || []) {
        list.append(el("div", { class: "adm-log" + (r.status === "open" ? " open" : "") },
          el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(r.at)), el("b", {}, r.category), playerLink(r.targetId, r.target), el("span", { class: "adm-by" }, "by "), playerLink(r.reporterId, r.reporter)),
          el("div", { class: "adm-reason" }, r.text), r.context ? el("div", { class: "adm-reason adm-dim" }, "Line: " + r.context) : null, shipsLine(r.ships),
          el("div", { class: "adm-acts" }, r.chat ? el("button", { class: "btn-ghost2 adm-unban", onclick: () => openSavedChat("/game/admin/report/" + r.id + "/chat", "Report · " + r.target) }, "Chat (" + r.chat + ")") : null,
            r.status === "open" ? el("button", { class: "btn-ghost2 adm-unban", onclick: () => adminDo("/report/close", { id: r.id }) }, "Close") : el("span", { class: "adm-when" }, "Closed"),
            r.escalated ? el("span", { class: "adm-tag adm-esc" }, "Escalated") : isMod() && r.status === "open" ? escalateBtn("report", r.id) : null)));
      }
    } else if (AD.tab === "names") {                   // (owner) names banned by Ban Name: no one can take them
      for (const n of AD.names || []) {
        list.append(el("div", { class: "adm-log" },
          el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(n.at)), el("b", {}, n.name), el("span", { class: "adm-when" }, n.kind === "pilot" ? "Pilot" : "Player"), el("span", { class: "adm-by" }, n.admin)),
          n.reason ? el("div", { class: "adm-reason" }, n.reason) : null,
          isMod() ? null : el("button", { class: "btn-ghost2 adm-unban", onclick: () => adminReason("Allow " + n.name, (reason) => adminDo("/names/remove", { name: n.name, reason })) }, "Allow")));
      }
    } else if (AD.tab === "words") {                   // (owner) requested filter words: the Head Admin approves (category can change) or denies
      const head = isHigh(), ST = { pending: "Pending", approved: "Approved", denied: "Denied", repealed: "Repealed" }, chief = myRole() === "head";
      for (const x of AD.words || []) {
        const row = el("div", { class: "adm-log" + (x.status === "pending" ? " open" : "") },
          el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(x.at)), el("b", {}, x.word), el("span", { class: "adm-when" }, (x.cat === "builtin" ? "Built in" : FLAG_NAME[x.cat] || x.cat) + (x.cat !== x.askedCat ? " (asked " + (FLAG_NAME[x.askedCat] || x.askedCat) + ")" : "")), el("span", { class: "adm-tag" }, ST[x.status] || x.status), el("span", { class: "adm-by" }, x.by + (x.decidedBy ? " · " + x.decidedBy : ""))));
        if (chief && x.status === "approved") row.append(el("div", { class: "adm-bar adm-words" }, el("button", { class: "btn-ghost2 adm-mini", onclick: () => adminDo("/words/repeal", { word: x.word }) }, "Repeal")));   // (owner) the Head Admin repeals filters
        if (chief && x.status === "repealed") row.append(el("div", { class: "adm-bar adm-words" }, el("button", { class: "btn-ghost2 adm-mini", onclick: () => adminDo("/words/restore", { id: x.id }) }, "Restore")));
        if (head && x.status === "pending") {
          const c = catSelect(x.cat);
          row.append(el("div", { class: "adm-bar adm-words" }, c, el("button", { class: "btn-ghost2 adm-mini", onclick: () => adminDo("/words/decide", { id: x.id, approve: true, cat: c.value }) }, "Approve"), el("button", { class: "btn-ghost2 adm-mini", onclick: () => adminDo("/words/decide", { id: x.id, approve: false }) }, "Deny")));
        }
        list.append(row);
      }
    } else if (AD.tab === "appeals" && AD.apSub === "rel") {   // (owner) appeals of admin-set mutes / blocks
      for (const a of AD.relappeals || []) {
        const row = el("div", { class: "adm-log adm-appeal" + (a.status === "open" ? " open" : "") }, el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(a.at)), el("b", {}, ST2[a.status] || a.status), el("span", { class: "adm-tag" }, KIND[a.kind]), a.escalated ? el("span", { class: "adm-tag adm-esc" }, "Escalated") : null, el("span", { class: "adm-name" }, a.players.join(" · ")), el("span", { class: "adm-by" }, a.lines + (a.lines === 1 ? " line" : " lines"))));
        row.addEventListener("click", () => openAdminRelAppeal(a.id)); list.append(row);
      }
    } else if (AD.tab === "support") {                 // (owner) support tickets: open first, newest activity first; ● waiting on an admin
      for (const x of AD.tickets || []) {
        const row = el("div", { class: "adm-log adm-appeal" + (x.status === "open" ? " open" : "") }, el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(x.updated)), el("b", {}, (x.waiting ? "● " : "") + x.subject), el("span", { class: "adm-tag" }, x.category + " · " + (ST2[x.status] || x.status)), x.escalated ? el("span", { class: "adm-tag adm-esc" }, "Escalated") : null, playerLink(x.userId, x.name), el("span", { class: "adm-by" }, x.lines + (x.lines === 1 ? " line" : " lines"))));
        row.addEventListener("click", (e) => { if (!e.target.closest(".adm-link")) openAdminTicket(x.id); }); list.append(row);
      }
    } else if (AD.tab === "appeals") {                 // (owner) appeal conversations, open ones first: click one to open it
      for (const a of AD.appeals || []) {
        const row = el("div", { class: "adm-log adm-appeal" + (a.status === "open" ? " open" : "") },
          el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(a.at)), el("b", {}, a.status === "open" ? "Open" : a.status === "accepted" ? "Accepted" : "Closed"), playerLink(a.userId, a.name),
            el("span", { class: "adm-by" }, (a.subscribed ? "★ " : "") + a.lines + (a.lines === 1 ? " line" : " lines"))),
          a.last ? el("div", { class: "adm-reason" }, el("b", {}, a.last.name + ": "), a.last.text) : null);
        row.addEventListener("click", (e) => { if (!e.target.closest(".adm-link")) openAppeal(a.id); });
        list.append(row);
      }
    } else {
      for (const r of AD.log || []) {
        const banned = r.action === "ban" && r.targetId && (AD.players || []).some((p) => p.id === r.targetId && p.ban);
        list.append(el("div", { class: "adm-log" },
          el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(r.at)), el("b", {}, r.action), playerLink(r.targetId, r.target), el("span", { class: "adm-by" }, r.admin)),
          r.reason ? el("div", { class: "adm-reason" }, r.reason) : null, shipsLine(r.ships),
          r.chat ? el("button", { class: "btn-ghost2 adm-unban", onclick: () => openSavedChat("/game/admin/log/" + r.id + "/chat", r.action + " · " + r.target) }, "Chat (" + r.chat + ")") : null,
          banned && !isMod() ? el("button", { class: "btn-ghost2 adm-unban", onclick: () => adminReason("Unban " + r.target, (reason) => adminDo("/unban", { id: r.targetId, reason, logId: r.id })) }, "Unban") : null));
      }
    }
    list.scrollTop = keep;
  }
  // (owner) a Moderator escalates a dispute (a report, a ticket, a mute / block appeal) to the Admins, with a reason
  const escalateBtn = (kind, id) => el("button", { class: "btn-ghost2 adm-unban", onclick: (e) => { e.stopPropagation(); adminReason("Escalate", (reason) => adminDo("/escalate", { kind, id, reason })); } }, "Escalate");
  // (owner) a player's ships as named when a report, kick or ban was made
  const shipsLine = (ships) => ships && ships.length ? el("div", { class: "adm-reason adm-dim" }, "Ships: " + ships.map((x) => x.pilot + " · " + x.ship).join(", ")) : null;
  // (owner) the chat saved with a kick, ban or report: the hour before it (Local, Corp, the player's DMs and admin DMs)
  async function openSavedChat(url, title) {
    let lines; try { lines = await Api.get(url); } catch (e) { flash(e.message); return; }
    if (!wins.savedchat) createWindow("savedchat", { left: Math.round(innerWidth / 2 - 210), top: 90, width: 420, height: 420, minW: 300, minH: 200, render: () => {}, label: "Chat", groupable: false });
    const w = wins.savedchat; w.slot.textContent = title; w.body.innerHTML = ""; w.body.classList.add("appeal-body");
    const CH = { local: "Local", corp: "Corp", dm: "DM", admin: "Admin DM" };
    const list = el("div", { class: "appeal-lines" }, lines.map((l) => el("div", { class: "appeal-line" + (l.ch === "admin" ? " admin" : "") }, el("span", { class: "adm-when" }, fmtWhen(l.ts) + " " + (CH[l.ch] || l.ch) + " "), el("b", {}, l.from + (l.to ? " → " + l.to : "") + ": "), l.text)));
    w.body.append(list); toggleWindow("savedchat", true); list.scrollTop = list.scrollHeight;
  }
  // (owner) the admin menu for a player known only by name (chat, an admin DM): found in the player list (the panel must be unlocked)
  function adminMenuByName(name) {
    const p = (AD.players || []).find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    if (p) return adminMenu(p);
    return [["Open Admin", () => { toggleWindow("admin", true); adminLoad(); }]];
  }
  // right-click and hold (touch) both open a row's menu
  function holdMenu(node, items) {
    node.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); showCtxMenu(e.clientX, e.clientY, items()); });
    let h = 0; node.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; clearTimeout(h); h = setTimeout(() => showCtxMenu(e.clientX, e.clientY, items()), 500); });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) node.addEventListener(ev, () => clearTimeout(h));
  }
  function adminMenu(p) {
    const self = state && state.profile && p.name.toLowerCase() === state.profile.username.toLowerCase(), head = isHigh();
    const canAct = !self && !p.role;                 // (owner) staff can't discipline staff
    const out = [["Info", () => openAdminPlayer(p.id)]];
    if (!self) out.push(["DM", () => startAdmDm(p.name)], ["Report", () => openReport(p.name, null)]);   // (owner) an admin DM: its own window, at once
    if (canAct && isMod()) {                          // (owner) Moderators (chat moderators): mute, mute / block between players (the Admins review them), suggest a name ban
      if (!p.mute) out.push(["Mute", () => openBan(p, "mute")]);
      if (!p.ban && !(AD.players || []).some((x) => x.online && (x.role === "admin" || x.role === "head"))) out.push(["Ban", () => openBan(p)]);   // (owner) a timed ban, only while no Admin is online
      out.push(["Set Mute", () => openAdminRel(p, "mute")], ["Set Block", () => openAdminRel(p, "block")]);
      out.push(["Suggest Name Ban", () => openBanName(p, true)]);
    } else if (canAct) {
      out.push(p.frozen ? ["Unfreeze", () => { const r = [...admConv.values()].find((c) => c.staff && c.members.some((x) => !x.staff && x.name.toLowerCase() === p.name.toLowerCase() && x.frozen)); if (r) window.Atamus.send({ t: "admfreeze", room: r.room, to: p.name, on: false }); else adminDo("/freeze", { id: p.id, on: false }); }] : ["Freeze", () => startAdmDm(p.name, true)]);   // (owner) Freeze opens the DM with its box ticked
      out.push(["Kick", () => adminReason("Kick " + p.name, (reason) => adminDo("/kick", { id: p.id, reason }))]);
      out.push(["Ban Name", () => openBanName(p)]);
      out.push(["Set Mute", () => openAdminRel(p, "mute")], ["Set Block", () => openAdminRel(p, "block")]);   // (owner) between this player and another
      out.push(p.mute ? ["Unmute", () => adminReason("Unmute " + p.name, (reason) => adminDo("/unmute", { id: p.id, reason }))] : ["Mute", () => openBan(p, "mute")]);
      out.push(p.ban ? ["Unban", () => adminReason("Unban " + p.name, (reason) => adminDo("/unban", { id: p.id, reason }))] : ["Ban", () => openBan(p)]);
    }
    if (canAct) out.push(["Reset Language", () => adminReason("Reset Language " + p.name, (reason) => adminDo("/language/reset", { id: p.id, reason }))]);   // (owner) the heat and the automatic mutes
    const owner = AD.me && AD.me.owner, nys = p.name.toLowerCase() === "nyssary";
    if (!self && head && p.role === "mod") {          // (owner) Admins suspend for the Head Admin to review; only the Head Admin lifts it
      if (!p.suspendedUntil) out.push(["Suspend 24h", () => adminReason("Suspend " + p.name, (reason) => adminDo("/suspend", { id: p.id, reason }))]);
      else if (myRole() === "head") out.push(["Lift Suspension", () => adminReason("Lift Suspension " + p.name, (reason) => adminDo("/unsuspend", { id: p.id, reason }))]);
    }
    if (myRole() === "head" && !self && (p.role === "admin" || p.role === "mod")) out.push(["Reset Password", () => adminDo("/pwreset", { id: p.id })]);   // (owner) the Head Admin only
    if (owner && !self && !nys) {                     // (owner) only Nyssary makes or removes Moderators and Admins
      if (p.role === "mod") out.push(["Remove Moderator", () => adminDo("/role", { id: p.id, role: null })]);
      else if (!p.role) out.push(["Make Moderator", () => adminDo("/role", { id: p.id, role: "mod" })]);
      if (owner && p.role !== "head") out.push(p.role === "admin" ? ["Remove Admin", () => adminDo("/role", { id: p.id, role: null })] : ["Make Admin", () => adminDo("/role", { id: p.id, role: "admin" })]);   // (owner) only Nyssary makes Admins
    }
    return out;
  }
  async function adminDo(path, body) { try { await Api.post("/game/admin" + path, body); await adminLoad(); if (aplayer && aplayer.id === body.id) openAdminPlayer(body.id); return true; } catch (e) { flash(e.message); return false; } }
  // a small window asking for the reason (kick, unban)
  function adminReason(title, fn) {
    if (!wins.areason) createWindow("areason", { left: Math.round(innerWidth / 2 - 160), top: 160, width: 320, minW: 260, minH: 170, render: () => {}, label: "Reason", groupable: false });
    const w = wins.areason; w.slot.textContent = title; w.body.innerHTML = "";
    const text = el("textarea", { class: "text-input report-text", maxlength: "500", rows: "3" }), err = el("div", { class: "form-err", hidden: "" });
    const ok = el("button", { class: "btn-primary2", onclick: async () => { if (!text.value.trim()) { err.textContent = "Write a reason."; err.hidden = false; return; } ok.disabled = true; if (await fn(text.value)) toggleWindow("areason", false); ok.disabled = false; } }, title.split(" ")[0]);
    w.body.append(el("div", { class: "report-form" }, el("div", { class: "sheet-k" }, "Reason"), text, err, el("div", { class: "report-btns" }, el("button", { class: "btn-ghost2", onclick: () => toggleWindow("areason", false) }, "Cancel"), ok)));
    toggleWindow("areason", true); setTimeout(() => text.focus(), 30);
  }
  // (owner) Ban Name: the player's name or one of their pilots'; it goes on the banned names list and they must rename
  async function openBanName(p, suggest = false) {
    let d; try { d = await Api.get("/game/admin/player/" + encodeURIComponent(p.id)); } catch (e) { flash(e.message); return; }
    if (!wins.abanname) createWindow("abanname", { left: Math.round(innerWidth / 2 - 170), top: 150, width: 340, minW: 280, minH: 210, render: () => {}, label: "Ban Name", groupable: false });
    const w = wins.abanname; w.slot.textContent = suggest ? "Suggest Name Ban" : "Ban Name"; w.body.innerHTML = "";
    const which = el("select", { class: "base-sel" }, el("option", { value: "" }, "Player: " + d.name), ...d.pilots.map((pl) => el("option", { value: pl.id }, "Pilot: " + pl.name)));
    const text = el("textarea", { class: "text-input report-text", maxlength: "500", rows: "3" }), err = el("div", { class: "form-err", hidden: "" });
    const ok = el("button", { class: "btn-primary2", onclick: async () => {
      if (!text.value.trim()) { err.textContent = "Write a reason."; err.hidden = false; return; }
      ok.disabled = true; if (await adminDo(suggest ? "/names/suggest" : "/banname", { id: p.id, reason: text.value, ...(which.value ? { pilotId: which.value } : {}) })) toggleWindow("abanname", false); ok.disabled = false;
    } }, suggest ? "Suggest" : "Ban Name");
    w.body.append(el("div", { class: "report-form" }, which, el("div", { class: "sheet-k" }, "Reason"), text, err, el("div", { class: "report-btns" }, el("button", { class: "btn-ghost2", onclick: () => toggleWindow("abanname", false) }, "Cancel"), ok)));
    toggleWindow("abanname", true);
  }
  // (owner) after a Ban Name the player must pick a new name: a window that can't be closed, for the account or each pilot
  function syncRenames() {
    if (!state) return;
    const need = [];
    if (state.profile && state.profile.renameRequired) need.push({ id: "rename:me", label: "New name", what: "Your name", current: state.profile.username, reason: state.profile.renameReason, send: (name) => Api.post("/game/rename", { name }) });
    for (const pl of state.pilots || []) if (pl.renameRequired) need.push({ id: "rename:" + pl.id, label: "New pilot name", what: "Pilot", current: pl.name, reason: pl.renameReason, send: (name) => Api.post("/game/pilot/rename", { pilotId: pl.id, name }) });
    for (const id of Object.keys(wins)) if (id.startsWith("rename:") && !need.some((n) => n.id === id) && isOpen(wins[id])) toggleWindow(id, false);
    setBlock("rename", need.length > 0);              // (owner) the screen behind is blocked (dark red) until they rename
    need.forEach((n, i) => {
      if (!wins[n.id]) createWindow(n.id, { left: Math.round(innerWidth / 2 - 160), top: 140 + i * 30, width: 320, minW: 260, minH: 150, render: () => {}, label: n.label, groupable: false, noClose: true, pinTop: true });
      const w = wins[n.id]; if (isOpen(w)) return;
      w.slot.textContent = n.label; w.body.innerHTML = ""; w.body.classList.add("rename-body");
      const input = el("input", { class: "text-input", maxlength: "24", autocomplete: "off", spellcheck: "false" }), err = el("div", { class: "form-err", hidden: "" });
      const go = async () => { try { await n.send(input.value.trim()); toggleWindow(n.id, false); await refreshState(); window.Atamus.send({ t: "pilots" }); } catch (e) { err.textContent = e.message; err.hidden = false; } };
      input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") go(); });
      w.body.append(el("div", { class: "report-form" }, el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, n.what), el("span", { class: "sheet-v" }, n.current)),
        n.reason ? el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, "Reason"), el("span", { class: "sheet-v rename-reason" }, n.reason)) : "", input, err, el("button", { class: "btn-primary2", onclick: go }, "Rename")));
      toggleWindow(n.id, true); centerWin(w, i * 30);
    });
  }
  // (owner) a banned name the admins allowed again: its owner may take it back (Revert) or keep the name they have now
  function syncNameOffers() {
    if (!state) return;
    const offers = [];
    if (state.profile && state.profile.nameOffer) offers.push({ id: "nameoffer:me", what: "Your name", now: state.profile.username, old: state.profile.nameOffer, pilotId: null });
    for (const pl of state.pilots || []) if (pl.nameOffer) offers.push({ id: "nameoffer:" + pl.id, what: "Pilot", now: pl.name, old: pl.nameOffer, pilotId: pl.id });
    for (const id of Object.keys(wins)) if (id.startsWith("nameoffer:") && !offers.some((o) => o.id === id) && isOpen(wins[id])) toggleWindow(id, false);
    offers.forEach((o, i) => {
      if (!wins[o.id]) createWindow(o.id, { left: Math.round(innerWidth / 2 - 160), top: 140, width: 320, minW: 260, minH: 150, render: () => {}, label: "Name Allowed", groupable: false, noClose: true, pinTop: true });
      const w = wins[o.id]; if (isOpen(w)) return;
      w.slot.textContent = "Name Allowed"; w.body.innerHTML = "";
      const err = el("div", { class: "form-err", hidden: "" });
      const answer = async (take) => { try { await Api.post("/game/name-offer", { pilotId: o.pilotId, take }); toggleWindow(o.id, false); await refreshState(); window.Atamus.send({ t: "pilots" }); } catch (e) { err.textContent = e.message; err.hidden = false; await refreshState().catch(() => {}); } };
      const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, v));
      w.body.append(el("div", { class: "report-form" }, row(o.what, o.now), row("Allowed", o.old), err,
        el("div", { class: "report-btns" }, el("button", { class: "btn-ghost2", onclick: () => answer(false) }, "Keep " + o.now), el("button", { class: "btn-primary2", onclick: () => answer(true) }, "Revert to " + o.old))));
      toggleWindow(o.id, true); centerWin(w, i * 30);
    });
  }
  // ---- (owner) "You've been promoted": a new Moderator or Admin reads what the role is and accepts it, or declines it
  // (saying why; only the Head Admin is told). The role has no powers until it's accepted. ----
  const PROMO = {
    mod: { title: "You've been promoted to Moderator",
      intro: "You've been invited to join the Atamus moderation team as a Moderator. It's your choice: you can accept, or decline and nothing about your account changes.",
      can: ["See every player, the staff and the disciplined list, language reports, flagged chat, language meters and the full admin log", "Speak in Moderator mode under your own name and portrait (in orange), and talk with the other Moderators and the Admins in the Moderator chat",
        "Open moderator DMs with players", "Mute players, and set mutes and blocks between players who can't get along", "Reset a player's language meter and automatic mutes",
        "Answer mute and block appeals and Language support tickets, and escalate disputes to the Admins", "Suggest name bans and words for the filter (the Admins decide)",
        "Your mutes and blocks are reviewed by the Admins, who may keep, change or lift them", "Free membership while you're active as a Moderator; 90 days without any staff activity and the role lapses (you can ask to be reinstated)"],
      duty: "You don't need to respond to every issue. Help when you can; the tools are there whenever you choose to use them." },
    admin: { title: "You've been promoted to Admin",
      intro: "You've been invited to join the Atamus staff as an Admin. It's your choice: you can accept, or decline and nothing about your account changes.",
      can: ["Act and speak under an anonymous admin name and picture (in red), with the Admin chat and the Moderator chat",
        "Player moderation: admin DMs, freezes, kicks, mutes, bans (permanent too), name bans, appeals and support",
        "Review the Moderators' mutes, bans and blocks: keep, change or lift them",
        "Change players' credits, licenses and items, and reset corporations", "Approve or deny words for the filter",
        "Suspend a Moderator's abilities for the Head Admin to review", "Free membership while you're active as an Admin; 90 days without any staff activity and you become a Moderator (90 more: a player; you can ask to be reinstated)"],
      duty: "Admins are expected to take an active part: review reports, appeals and tickets, and keep an eye on how moderation is going. Staying active is part of keeping the role." },
  };
  const CONDUCT = ["Be fair. Treat every player the same, and never act on a dispute you're part of or for a friend: hand it to someone else.",
    "Use the lightest action that solves the problem, and always give a clear, honest reason.",
    "Keep moderation private. Reports, chat logs, player details and the Admin chat stay within the team.",
    "Never reveal who is behind an admin name.",
    "Stay calm and respectful, even when players aren't.",
    "Your powers are for moderation only, never for gaining an advantage in the game.",
    "Everything you do is logged under your staff name and can be reviewed.",
    "When unsure, ask the other staff before acting.",
    "Staff work is voluntary and unpaid, and the role can be removed or suspended at any time."];
  function syncPromotion() {
    const role = state && state.profile && state.profile.promoPending, id = "promotion";
    if (!role || !PROMO[role]) { if (wins[id] && isOpen(wins[id])) toggleWindow(id, false); return; }
    if (!wins[id]) createWindow(id, { left: Math.round(innerWidth / 2 - 230), top: 60, width: 460, height: Math.min(600, innerHeight - 80), minW: 300, minH: 260, render: () => {}, label: "Promotion", groupable: false, noClose: true, pinTop: true });
    const w = wins[id]; if (isOpen(w) && w.body.dataset.role === role) return;
    const P = PROMO[role]; w.slot.textContent = P.title; w.body.innerHTML = ""; w.body.dataset.role = role; w.body.classList.add("promo-body");
    const err = el("div", { class: "form-err", hidden: "" }), why = el("textarea", { class: "text-input report-text", maxlength: "500", rows: "3" }), decline = el("div", { class: "report-form", hidden: "" });
    why.addEventListener("keydown", (e) => e.stopPropagation());
    const answer = async (accept) => { try { await Api.post("/game/promotion", accept ? { accept: true, reason: note.value } : { accept: false, reason: role === "admin" ? note.value : why.value }); toggleWindow(id, false); await refreshState(); adminLoad(); } catch (e) { err.textContent = e.message; err.hidden = false; } };
    // (owner) an Admin's promotion: a note goes with Accept or Decline (Decline needs it)
    const note = el("textarea", { class: "text-input report-text", maxlength: "500", rows: "3" }); note.addEventListener("keydown", (e) => e.stopPropagation());
    const noteBox = role === "admin" ? el("div", { class: "report-form" }, el("div", { class: "sheet-k" }, "Note"), note) : null;
    const btns = el("div", { class: "report-btns promo-btns" }, el("button", { class: "btn-ghost2", onclick: () => { if (role === "admin") { answer(false); return; } decline.hidden = false; btns.hidden = true; setTimeout(() => why.focus(), 30); } }, "Decline"), el("button", { class: "btn-primary2", onclick: () => answer(true) }, "Accept"));
    decline.append(el("div", { class: "sheet-k" }, "Why"), why, el("div", { class: "report-btns" }, el("button", { class: "btn-ghost2", onclick: () => { decline.hidden = true; btns.hidden = false; } }, "Cancel"), el("button", { class: "btn-primary2", onclick: () => answer(false) }, "Decline")));
    w.body.append(el("div", { class: "promo-text" },
      el("p", {}, P.intro),
      el("h3", {}, "What you can do"), el("ul", {}, P.can.map((x) => el("li", {}, x))),
      el("h3", {}, "Code of conduct"), el("ul", {}, CONDUCT.filter((x) => role !== "mod" || !/admin name/.test(x)).map((x) => el("li", {}, role === "mod" ? x.replace(" under your staff name", "") : x))),   // (owner) Moderators have no staff name to keep
      el("h3", {}, "What's expected"), el("p", {}, P.duty)),
      noteBox, decline, err, btns);
    toggleWindow(id, true); centerWin(w);
  }
  window.Atamus.bus.addEventListener("renamereq", () => refreshState().catch(() => {}));

  // a ban (or, owner: a mute): permanent, or for a number of hours or days; a ban's reason is what the player sees at login
  function openBan(p, what = "ban", after = null) {
    if (!wins.aban) createWindow("aban", { left: Math.round(innerWidth / 2 - 170), top: 150, width: 340, minW: 280, minH: 230, render: () => {}, label: "Ban", groupable: false });
    const w = wins.aban, verb = what === "mute" ? "Mute" : "Ban"; w.slot.textContent = verb + " " + p.name; w.body.innerHTML = "";
    const kind = el("select", { class: "base-sel" }, el("option", { value: "temp" }, "Temporary"), isMod() ? null : el("option", { value: "perm" }, "Permanent"));   // (owner) Moderators: for a time only
    const amount = el("input", { class: "text-input adm-amount", type: "number", min: "1", max: "3650", value: "1" }), unit = el("select", { class: "base-sel" }, el("option", { value: "days" }, "Days"), el("option", { value: "hours" }, "Hours"));
    const len = el("div", { class: "adm-len" }, amount, unit); kind.addEventListener("change", () => { len.hidden = kind.value === "perm"; });
    const text = el("textarea", { class: "text-input report-text", maxlength: "500", rows: "3" }), err = el("div", { class: "form-err", hidden: "" });
    const ok = el("button", { class: "btn-primary2", onclick: async () => {
      if (!text.value.trim()) { err.textContent = what === "mute" ? "Write a reason." : "Write a reason the player will see."; err.hidden = false; return; }
      ok.disabled = true;
      if (await adminDo("/" + what, { id: p.id, reason: text.value, perm: kind.value === "perm", amount: Math.round(+amount.value), unit: unit.value })) { toggleWindow("aban", false); if (after) after(); }
      ok.disabled = false;
    } }, verb);
    w.body.append(el("div", { class: "report-form" }, kind, len, el("div", { class: "sheet-k" }, "Reason"), text, err, el("div", { class: "report-btns" }, el("button", { class: "btn-ghost2", onclick: () => toggleWindow("aban", false) }, "Cancel"), ok)));
    toggleWindow("aban", true);
  }
  // a player's admin Info: details (credits and corporation, with Reset for the Head Admin) and their pilots' licenses
  let aplayer = null, apTab = "info";
  async function openAdminPlayer(id) {
    if (!wins.aplayer) createWindow("aplayer", { left: Math.round(innerWidth / 2 - 180), top: 110, width: 360, minW: 300, minH: 240, render: renderAdminPlayer, label: "Player" });
    try { aplayer = await Api.get("/game/admin/player/" + encodeURIComponent(id)); aplayer.rel = await Api.get("/game/admin/player/" + encodeURIComponent(id) + "/relations"); } catch (e) { flash(e.message); return; }
    toggleWindow("aplayer", true); renderAdminPlayer(wins.aplayer.body);
  }
  function renderAdminPlayer(body) {
    body.innerHTML = ""; const p = aplayer; if (!p) return; wins.aplayer.slot.textContent = p.name;
    const head = isHigh(), row = (k, v, btn) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v), btn || null));
    body.append(el("div", { class: "tab-row" }, [["info", "Player"], ["pilots", "Pilots"], ["lang", "Language"], ...(head ? [["web", "Trades"], ["sec", "Security"]] : [])].map(([k, n]) => el("button", { class: "tab" + (apTab === k ? " active" : ""), onclick: () => { apTab = k; renderAdminPlayer(body); } }, n))));
    const box = el("div", { class: "adm-list" });
    if (apTab === "info") {
      const reset = (what) => head ? el("button", { class: "btn-ghost2 adm-mini", onclick: () => adminDo("/reset", { id: p.id, what }) }, "Reset") : null;
      box.append(row("Role", p.role ? ROLE_NAME[p.role] || p.role : "Player"), row("Online", p.online ? "Yes" : "No"), row("Joined", fmtWhen(p.createdAt)),
        row("Ban", p.ban ? (p.ban.perm ? "Permanent" : "Until " + fmtWhen(p.ban.until)) + " · " + p.ban.reason : "None"), row("Muted", p.mute ? (p.mute.perm ? "Permanent" : "Until " + fmtWhen(p.mute.until)) + " · " + p.mute.reason : "No"), row("Frozen", p.frozen ? "Yes · " + p.frozen.reason : "No"),
        row("Credits", p.credits.toLocaleString(), reset("credits")), row("Corporation", p.corp, reset("corp")));
      for (const r of p.rel || []) box.append(row(KIND[r.kind] + (r.admin ? " (admin)" : ""), r.name, r.admin ? el("button", { class: "btn-ghost2 adm-mini", onclick: () => adminReason("Lift " + KIND[r.kind], (reason) => adminDo("/relation", { id: p.id, otherId: r.id, kind: r.kind, on: false, reason })) }, "Lift") : null));   // (owner) their mutes / blocks
    } else if (apTab === "lang") {                   // (owner) the language meter, then every flagged line of theirs
      box.append(el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, "Language"), el("span", { class: "sheet-v" }, heatBar(p.heat, true), el("span", { class: "heat-n" }, String(p.heat || 0)),
        p.role ? null : el("button", { class: "btn-ghost2 adm-mini", onclick: () => adminReason("Reset Language " + p.name, (reason) => adminDo("/language/reset", { id: p.id, reason })) }, "Reset"))));   // (owner) the heat and the automatic mutes
      if (!p.lang) { Api.get("/game/admin/player/" + encodeURIComponent(p.id) + "/language").then((l) => { if (aplayer === p) { p.lang = l; renderAdminPlayer(wins.aplayer.body); } }).catch((e) => flash(e.message)); }
      if (p.lang) for (const [k, n] of FLAG_TABS.slice(1)) { const kd = p.lang.kinds[k] || { heat: 0, count: 0 };   // (owner) a meter per kind of word
        box.append(el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, n), el("span", { class: "sheet-v" }, heatBar(kd.heat, true), el("span", { class: "heat-n" }, String(kd.count))))); }
      for (const f of p.lang ? p.lang.lines : []) {
        const text = el("div", { class: "adm-reason" });
        for (const part of f.text.split(/(\s+)/)) text.append(part.trim() && f.words.some((w) => part.includes(w)) ? el("mark", { class: "adm-mark" }, part) : part);
        box.append(el("div", { class: "adm-log" }, el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(f.at)), el("span", { class: "adm-when" }, f.channel === "corp" ? "Corp" : "Local"), el("span", { class: "adm-by" }, f.cats.map((c) => FLAG_NAME[c] || c).join(", "))), text));
      }
    } else if (apTab === "web" && head) {             // (owner) the trade web
      if (!p.web) { Api.get("/game/admin/player/" + encodeURIComponent(p.id) + "/web").then((x) => { if (aplayer === p) { p.web = x; renderAdminPlayer(wins.aplayer.body); } }).catch((e) => flash(e.message)); }
      else drawWeb(box, p.web);
    } else if (apTab === "sec" && head) {             // (owner) suspicion, logins, devices, the account's lock and timeouts
      if (!p.sec) { Promise.all([Api.get("/game/admin/player/" + encodeURIComponent(p.id) + "/security"), Api.get("/game/admin/player/" + encodeURIComponent(p.id) + "/suspicion")]).then(([x, su]) => { if (aplayer === p) { p.sec = x; p.sec.susp = su; renderAdminPlayer(wins.aplayer.body); } }).catch((e) => flash(e.message)); }
      else {
        const su = p.sec.susp;
        box.append(row("Suspicion", "", el("span", { class: "susp-n", style: "color:hsl(" + Math.max(0, 120 - su.score * 4) + ",80%,60%)" }, String(su.score))),
          su.hold ? row("Logins on hold", "Until " + fmtWhen(su.hold)) : null);
        if (su.reasons.length || su.hold) box.append(el("div", { class: "adm-bar adm-words" }, el("button", { class: "btn-ghost2 adm-mini", onclick: () => adminReason("Clear suspicion " + p.name, (reason) => adminDo("/suspicion/clear", { id: p.id, reason })) }, "Clear")));
        for (const r of su.reasons) box.append(el("div", { class: "adm-log" }, el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(r.at)), el("b", {}, r.kind), el("span", { class: "adm-by" }, "+" + r.points)), el("div", { class: "adm-reason" }, r.text)));
        box.append(row("Locked", p.sec.locked ? fmtWhen(p.sec.locked.at) + " · " + p.sec.locked.reason : "No", p.sec.locked ? el("button", { class: "btn-ghost2 adm-mini", onclick: () => adminReason("Unlock", (reason) => adminDo("/security/unlock", { id: p.id, reason }).then(() => { p.sec = null; renderAdminPlayer(wins.aplayer.body); })) }, "Unlock") : null),
          row("Devices (30 days)", p.sec.devices30));
        for (const t of p.sec.timeouts) box.append(row("Timed out", fmtWhen(t.at) + " – " + fmtWhen(t.until) + " · " + t.reason));
        for (const l of p.sec.logins) box.append(el("div", { class: "adm-log" }, el("div", { class: "adm-log-head" }, el("span", { class: "adm-when" }, fmtWhen(l.at)), el("span", { class: "adm-when" }, l.device), el("span", { class: "adm-by" }, l.result === "ok" ? "Login" : l.result === "failed" ? "Failed" : l.result === "locked" ? "Locked" : "Unlocked")),
          el("div", { class: "adm-reason" }, [l.place, l.tz, l.vpn ? "VPN" : ""].filter(Boolean).join(" · "))));
      }
    } else renderAdminPilots(box, p, head);
    body.append(box);
  }
  // (owner) the trade web: the player in the middle; around them who they trade with (green: gives to them, orange: they
  // give, red: kills), thicker for more; a step further out, faint; dashed purple: accounts sharing a device or address.
  // Click (tap) a name for their Info. Below, the same as rows.
  const crShort = (n) => n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n);
  function drawWeb(box, web) {
    const NS = "http://www.w3.org/2000/svg", S = (tag, at, ...kids) => { const n = document.createElementNS(NS, tag); for (const k in at) n.setAttribute(k, at[k]); for (const c of kids) n.append(c); return n; };
    const W = 360, H = 300, cx = W / 2, cy = H / 2, svg = S("svg", { viewBox: "0 0 " + W + " " + H, class: "web-svg" });
    const near = web.near, assoc = web.assoc.filter((a) => !near.some((n) => n.id === a.id)), ring1 = [...near, ...assoc.map((a) => ({ ...a, onlyAssoc: true }))];
    const pos = new Map([[web.id, [cx, cy]]]), R1 = 95, R2 = 135;
    ring1.forEach((n, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, ring1.length); pos.set(n.id, [cx + R1 * Math.cos(a), cy + R1 * 0.85 * Math.sin(a)]); });
    const farBy = new Map(); for (const f of web.far) { if (!farBy.has(f.via)) farBy.set(f.via, []); farBy.get(f.via).push(f); }
    for (const [via, list] of farBy) { const [vx, vy] = pos.get(via) || [cx, cy], base = Math.atan2(vy - cy, vx - cx);
      list.forEach((f, i) => { if (pos.has(f.id)) return; const a = base + (i - (list.length - 1) / 2) * 0.32; pos.set(f.id, [cx + R2 * Math.cos(a), cy + R2 * 0.85 * Math.sin(a)]); }); }
    const max = Math.max(1, ...near.map((n) => n.in + n.out), ...web.far.map((n) => n.in + n.out)), width = (v) => 1 + 5 * Math.sqrt(v / max);
    const edges = S("g", {}), nodes = S("g", {});
    const line = (a, b, cls, wd, dy = 0) => { const [x1, y1] = pos.get(a), [x2, y2] = pos.get(b); edges.append(S("line", { x1, y1: y1 + dy, x2, y2: y2 + dy, class: cls, "stroke-width": wd })); };
    for (const n of near) { if (n.in) line(n.id, web.id, "web-in", width(n.in), -1.5); if (n.out) line(n.id, web.id, "web-out", width(n.out), 1.5); if (n.kills || n.deaths) line(n.id, web.id, "web-kill", 1 + Math.min(4, n.kills + n.deaths)); if (!n.in && !n.out && !n.kills && !n.deaths) line(n.id, web.id, "web-in", 1); }
    for (const a of web.assoc) line(a.id, web.id, "web-assoc", 1.5);
    for (const f of web.far) if (pos.has(f.id)) { const g = S("g", { class: "web-far" }); edges.append(g); const [x1, y1] = pos.get(f.id), [x2, y2] = pos.get(f.via); g.append(S("line", { x1, y1, x2, y2, class: f.in >= f.out ? "web-out" : "web-in", "stroke-width": width(f.in + f.out) })); }
    const node = (id, name, r, fill, far) => { const [x, y] = pos.get(id), g = S("g", { class: "web-node" + (far ? " web-far" : "") }); g.append(S("circle", { cx: x, cy: y, r, fill }), S("text", { x, y: y + r + 10, "text-anchor": "middle" }, name)); if (id !== web.id) g.addEventListener("click", () => openAdminPlayer(id)); nodes.append(g); };
    node(web.id, web.name, 9, "#4fb4ff");
    for (const n of ring1) node(n.id, n.name, 6, n.onlyAssoc ? "#b18cff" : "#9aa7bd");
    for (const f of web.far) if (pos.has(f.id) && !ring1.some((n) => n.id === f.id)) node(f.id, f.name, 4, "#6c7890", true);
    svg.append(edges, nodes); box.append(svg);
    for (const n of near) box.append(el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, playerLink(n.id, n.name)), el("span", { class: "sheet-v" },
      ["In " + crShort(n.in) + " (" + n.nIn + ")", "Out " + crShort(n.out) + " (" + n.nOut + ")", n.cans ? "Cans " + n.cans : "", n.kills ? "Killed " + n.kills : "", n.deaths ? "Died " + n.deaths : "", n.loot ? "Loot " + crShort(n.loot) : ""].filter(Boolean).join(" · "))));
    for (const a of web.assoc) box.append(el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, playerLink(a.id, a.name)), el("span", { class: "sheet-v" }, [a.devices ? "Same device" + (a.devices > 1 ? " (" + a.devices + ")" : "") : "", a.ips ? "Same address" + (a.ips > 1 ? " (" + a.ips + ")" : "") : ""].filter(Boolean).join(" · "))));
  }
  // (owner) a player's pilots as on the Pilot window: their cards side by side (pick one), then that pilot's licenses by
  // category with their levels; the Head Admin raises, lowers or resets a level
  let apPilot = null, apCat = null;
  function renderAdminPilots(box, p, head) {
    if (!p.pilots.length) { box.append(el("div", { class: "muted" }, "No pilots.")); return; }
    const pl = p.pilots.find((x) => x.id === apPilot) || p.pilots[0]; apPilot = pl.id;
    const redraw = () => renderAdminPlayer(wins.aplayer.body);
    box.append(el("div", { class: "pilot-pick" }, p.pilots.map((x) => el("button", { class: "pp-card" + (x.id === pl.id ? " sel" : ""), onclick: () => { apPilot = x.id; redraw(); } },
      x.portrait && window.Portrait ? Portrait.canvas(x.portrait, 52, "pp-portrait") : el("span", { class: "pp-portrait" }), el("span", { class: "pp-name" }, x.name)))));
    if (!catalog) return;
    const lv = (key) => pl.licenses[key] || 0;
    const cats = catalog.categories.filter((c) => catalog.licenses.some((l) => l.category === c.key));
    if (!cats.length) return;
    if (!cats.some((c) => c.key === apCat)) apCat = cats[0].key;
    box.append(el("div", { class: "cat-list" }, cats.map((c, i) => {
      const lics = catalog.licenses.filter((l) => l.category === c.key), total = lics.reduce((t, l) => t + l.maxLevel, 0), have = lics.reduce((t, l) => t + lv(l.key), 0);
      return el("div", { class: "cat-row" + (c.key === apCat ? " sel" : "") + (i && c.group !== cats[i - 1].group ? " cat-group-start" : ""), onclick: () => { apCat = c.key; redraw(); } },
        el("span", { class: "cat-name" }, c.name), el("div", { class: "cat-bar" }, el("div", { class: "cat-bar-fill", style: "width:" + (total ? have / total * 100 : 0) + "%" })), el("span", { class: "cat-prog" }, String(lics.length)));
    })));
    const cat = catalog.categories.find((c) => c.key === apCat), sub = el("div", { class: "skills-sub" }, el("div", { class: "skills-sub-head" }, cat.name));
    for (const l of catalog.licenses.filter((x) => x.category === apCat)) {
      const n = lv(l.key), pips = el("div", { class: "pips" }), act = (op) => adminDo("/license", { id: p.id, pilotId: pl.id, key: l.key, op });
      for (let k = 1; k <= l.maxLevel; k++) pips.append(el("span", { class: "pip" + (k <= n ? " on" : "") }));
      sub.append(el("div", { class: "lic-row" }, el("span", { class: "lic-name" }, l.name), pips, el("span", { class: "lic-time" }, n >= l.maxLevel ? "MAX" : ROMAN_LV(n)),
        head ? el("div", { class: "lic-btns" }, el("button", { class: "qbtn minus", onclick: () => act("-") }, "−"), el("button", { class: "qbtn", onclick: () => act("+") }, "+"), el("button", { class: "btn-ghost2 adm-mini", onclick: () => act("reset") }, "Reset")) : el("div", { class: "lic-btns" })));
    }
    box.append(sub);
  }
  // ---- (owner) staff DMs: rooms, each in its own window. Staff can add players or other staff (Add); each player in it has
  // a Freeze box (Admins only). A staff member closing the window leaves the room; a player's can't be closed and stays on
  // top (over the Freeze overlay) until the room ends ----
  const admConv = new Map();                         // room id -> { room, staff (am I staff in it), members, log }
  const roomWin = (room) => "admroom:" + room;
  function openRoom(m) {
    const id = roomWin(m.room), staff = !!m.with || m.admin == null;
    if (!admConv.has(m.room)) admConv.set(m.room, { room: m.room, staff, members: [], log: [] });
    const c = admConv.get(m.room); c.members = m.members || c.members; if (m.log) c.log = m.log.map((l) => ({ ...l }));
    if (!wins[id]) {
      createWindow(id, { left: Math.round(innerWidth / 2 - 180), top: 120, width: 360, height: 320, minW: 260, minH: 200, render: (bd) => renderRoom(m.room, bd), label: "DM", groupable: false, noClose: !staff, pinTop: !staff });
      if (staff) wins[id].close.onclick = () => { window.Atamus.send({ t: "admend", room: m.room }); toggleWindow(id, false); };   // closing it leaves the room
    }
    toggleWindow(id, true); renderRoom(m.room, wins[id].body, true);
    if (!staff && blocks.has("frozen")) centerWin(wins[id]);
  }
  function renderRoom(room, body, rebuildHead = false) {
    const c = admConv.get(room); if (!c) return; const id = roomWin(room);
    const others = c.members.filter((x) => x.name !== (c.staff ? myStaffName() : myName()));
    wins[id].slot.textContent = c.staff ? "DM · " + others.map((x) => x.name).join(", ") : others.filter((x) => x.staff).map((x) => (x.rank === "mod" ? "Moderator · " : "Admin · ") + x.name).join(", ");
    let list = body.querySelector(".admdm-list");
    if (!list) {
      body.innerHTML = ""; body.classList.add("admdm-body");
      body.append(el("div", { class: "admdm-head" }), list = el("div", { class: "admdm-list" }));
      const input = el("input", { class: "text-input admdm-input", maxlength: "500", autocomplete: "off" });
      input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key !== "Enter" || !input.value.trim()) return; window.Atamus.send({ t: "adm", room, text: input.value }); input.value = ""; });
      body.append(input); rebuildHead = true;
    }
    if (rebuildHead) {                               // the members: players (right-click / hold: the admin menu; a Freeze box for Admins) and staff
      const head = body.querySelector(".admdm-head"); head.innerHTML = "";
      for (const x of c.members) {
        const nm = el("span", { class: "admdm-who" + (x.staff ? " rank-" + (x.rank === "mod" ? "mod" : "admin") : " adm-link") }, x.name);
        if (c.staff && !x.staff) holdMenu(nm, () => adminMenuByName(x.name));
        const chip = el("span", { class: "admdm-chip" }, nm);
        if (c.staff && !x.staff && !isMod()) { const box = el("input", { type: "checkbox", class: "admdm-freeze" }); box.checked = !!x.frozen; box.addEventListener("change", () => window.Atamus.send({ t: "admfreeze", room, to: x.name, on: box.checked })); chip.append(el("label", { class: "admdm-freeze-l" }, box, "Freeze")); }
        head.append(chip);
      }
      if (c.staff) {                                 // (owner) add a player or another staff member to the room
        const add = el("input", { class: "text-input admdm-add", maxlength: "40", autocomplete: "off", spellcheck: "false" });
        const go = () => { const n = add.value.trim(); if (n) { window.Atamus.send({ t: "admadd", room, name: n }); add.value = ""; } };
        add.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") go(); });
        head.append(el("span", { class: "admdm-addrow" }, add, el("button", { class: "btn-ghost2 adm-mini", onclick: go }, "Add")));
      }
    }
    list.innerHTML = "";
    for (const l of c.log) {
      const nm = el("b", { class: l.key ? "rank-" + (l.rank === "mod" ? "mod" : "admin") : null }, l.from + ": ");
      if (l.key) nm.prepend(l.portrait && window.Portrait ? Portrait.canvas(l.portrait, 18, "admdm-apic") : el("img", { class: "admdm-apic", src: apicSrc(l.pic), alt: "" }));   // (owner) staff: an Admin's picture, a Moderator's portrait
      else if (c.staff) holdMenu(nm, () => adminMenuByName(l.from));   // (owner) a player's name: the admin menu
      list.append(el("div", { class: "admdm-line" }, nm, l.text));
    }
    list.scrollTop = list.scrollHeight;
  }
  const myStaffName = () => (AD.me && AD.me.persona && AD.me.persona.name) || myName();
  // (owner) staff open a DM with someone: both windows open at once (the player's can't be closed); freeze = tick their box
  function startAdmDm(name, freeze = false) {
    window.Atamus.send({ t: "admstart", to: name });
    if (freeze) window.Atamus.send({ t: "admfreeze", to: name, on: true });
  }
  const A0 = window.Atamus.bus;
  A0.addEventListener("admstate", () => adminLoad());
  A0.addEventListener("admopen", (e) => { if (e.detail.room) openRoom(e.detail); });
  A0.addEventListener("admdm", (e) => {
    const m = e.detail; if (!m.room) return;
    if (!admConv.has(m.room)) return;                  // (its admopen always comes first)
    const c = admConv.get(m.room), id = roomWin(m.room); if (!wins[id] || !isOpen(wins[id])) toggleWindow(id, true);
    c.log.push({ from: m.from, text: m.text, ts: m.ts, ...(m.key ? { key: m.key, pic: m.pic, rank: m.rank, portrait: m.portrait } : {}) }); renderRoom(m.room, wins[id].body);
  });
  A0.addEventListener("admend", (e) => { const m = e.detail, id = roomWin(m.room); admConv.delete(m.room); if (wins[id]) { toggleWindow(id, false); wins[id].body.innerHTML = ""; } });
  // (owner) Freeze: a dark red overlay over the whole screen; only the admin conversation shows above it, centered
  A0.addEventListener("frozen", (e) => { setBlock("frozen", !!e.detail.on); if (e.detail.on) for (const [room, c] of admConv) if (!c.staff && wins[roomWin(room)] && isOpen(wins[roomWin(room)])) centerWin(wins[roomWin(room)]); });

  // ---- (owner) an appeal conversation: the banned player and every admin; answer, Subscribe (be told of new lines),
  // Accept (unban), Deny (close), Timeout (close, and no new appeals for a while) ----
  const appealWins = new Map();                      // appeal id -> its latest data
  async function openAppeal(id) {
    const wid = "appeal:" + id;
    if (!wins[wid]) createWindow(wid, { left: Math.round(innerWidth / 2 - 190), top: 100, width: 380, height: 440, minW: 300, minH: 260, render: () => loadAppeal(id), label: "Appeal", groupable: false });
    toggleWindow(wid, true);
  }
  async function loadAppeal(id) {
    const wid = "appeal:" + id, w = wins[wid]; if (!w || !isOpen(w)) return;
    let d; try { d = await Api.get("/game/admin/appeal/" + encodeURIComponent(id)); } catch (e) { flash(e.message); return; }
    const old = appealWins.get(id); appealWins.set(id, d);
    if (old && JSON.stringify(old) === JSON.stringify(d) && w.body.querySelector(".appeal-lines")) return;   // nothing new: leave it be
    w.slot.textContent = "Appeal · " + d.name;
    const draft = w.body.querySelector(".appeal-input"), keep = draft ? draft.value : "";
    w.body.innerHTML = ""; w.body.classList.add("appeal-body");
    const pl = d.player || {};
    const info = el("div", { class: "appeal-info" },
      el("div", {}, el("span", { class: "sheet-k" }, "Ban "), pl.ban ? (pl.ban.perm ? "permanent" : "until " + fmtWhen(pl.ban.until)) + " · " + (pl.ban.reason || d.banReason) : "ended"),
      el("div", {}, el("span", { class: "sheet-k" }, "Appeals "), pl.used + " made, " + pl.left + " left" + (pl.blockedUntil ? " · none until " + fmtWhen(pl.blockedUntil) : "")));
    const list = el("div", { class: "appeal-lines" });
    for (const l of d.lines) list.append(el("div", { class: "appeal-line" + (l.admin ? " admin" : "") }, el("span", { class: "adm-when" }, fmtWhen(l.at) + " "), el("b", {}, l.name + ": "), l.text));
    const sub = el("button", { class: "btn-ghost2 adm-unban", onclick: async () => { try { await Api.post("/game/admin/appeal/subscribe", { id, on: !d.subscribed }); loadAppeal(id); adminLoad(); } catch (e) { flash(e.message); } } }, d.subscribed ? "Unsubscribe" : "Subscribe");
    const acts = el("div", { class: "adm-acts" }, sub);
    if (d.status === "open" && !isMod()) acts.append(
      el("button", { class: "btn-ghost2 adm-unban", onclick: () => adminReason("Accept " + d.name, async (reason) => { const ok = await adminDo("/appeal", { id, accept: true, reason }); loadAppeal(id); return ok; }) }, "Accept"),
      el("button", { class: "btn-ghost2 adm-unban", onclick: () => adminReason("Deny " + d.name, async (reason) => { const ok = await adminDo("/appeal", { id, accept: false, reason }); loadAppeal(id); return ok; }) }, "Deny"));
    if (!isMod()) acts.append(el("button", { class: "btn-ghost2 adm-unban", onclick: () => openAppealTimeout(id, d.name) }, "Timeout"));
    w.body.append(info, list, acts);
    if (d.status === "open") {
      const input = el("input", { class: "text-input appeal-input", maxlength: "1000", autocomplete: "off" }); input.value = keep;
      input.addEventListener("keydown", async (e) => { e.stopPropagation(); if (e.key !== "Enter" || !input.value.trim()) return; const text = input.value; input.value = ""; try { await Api.post("/game/admin/appeal/say", { id, text }); loadAppeal(id); } catch (er) { flash(er.message); input.value = text; } });
      w.body.append(input);
    } else w.body.append(el("div", { class: "muted" }, d.status === "accepted" ? "Accepted" : "Closed"));
    list.scrollTop = list.scrollHeight;
  }
  // (owner) Timeout: the appeal closes and no new one can be made for days / months / years (then one more is allowed)
  function openAppealTimeout(id, name) {
    if (!wins.atimeout) createWindow("atimeout", { left: Math.round(innerWidth / 2 - 170), top: 160, width: 340, minW: 280, minH: 210, render: () => {}, label: "Timeout", groupable: false });
    const w = wins.atimeout; w.slot.textContent = "Timeout " + name; w.body.innerHTML = "";
    const amount = el("input", { class: "text-input adm-amount", type: "number", min: "1", max: "100", value: "7" }), unit = el("select", { class: "base-sel" }, el("option", { value: "days" }, "Days"), el("option", { value: "months" }, "Months"), el("option", { value: "years" }, "Years"));
    const text = el("textarea", { class: "text-input report-text", maxlength: "500", rows: "3" }), err = el("div", { class: "form-err", hidden: "" });
    const ok = el("button", { class: "btn-primary2", onclick: async () => {
      if (!text.value.trim()) { err.textContent = "Write a reason."; err.hidden = false; return; }
      ok.disabled = true; if (await adminDo("/appeal/timeout", { id, amount: Math.round(+amount.value), unit: unit.value, reason: text.value })) { toggleWindow("atimeout", false); loadAppeal(id); } ok.disabled = false;
    } }, "Timeout");
    w.body.append(el("div", { class: "report-form" }, el("div", { class: "adm-len" }, amount, unit), el("div", { class: "sheet-k" }, "Reason"), text, err, el("div", { class: "report-btns" }, el("button", { class: "btn-ghost2", onclick: () => toggleWindow("atimeout", false) }, "Cancel"), ok)));
    toggleWindow("atimeout", true);
  }
  setInterval(() => { for (const id of appealWins.keys()) if (wins["appeal:" + id] && isOpen(wins["appeal:" + id])) loadAppeal(id); }, 8000);   // (rebuilt only when it changed)

  // ---- (owner) a conversation window (mute / block appeals, support tickets): its lines, actions, and a box to write
  // while it's open; redrawn only when something changed (a draft is kept) ----
  const convos = new Map();                          // window id -> { opts, last }
  function openConvo(wid, opts) {
    if (!wins[wid]) createWindow(wid, { left: Math.round(innerWidth / 2 - 190), top: 100, width: 380, height: 420, minW: 280, minH: 240, render: () => loadConvo(wid), label: opts.label, groupable: false });
    convos.set(wid, { opts, last: null }); toggleWindow(wid, true);
  }
  async function loadConvo(wid) {
    const c = convos.get(wid), w = wins[wid]; if (!c || !w || !isOpen(w)) return;
    let d; try { d = await c.opts.fetch(); } catch (e) { flash(e.message); return; }
    if (!d) return;
    const j = JSON.stringify(d); if (j === c.last && w.body.querySelector(".appeal-lines")) return; c.last = j;
    const o = c.opts; w.slot.textContent = o.title(d);
    const draft = w.body.querySelector(".appeal-input"), keep = draft ? draft.value : "";
    w.body.innerHTML = ""; w.body.classList.add("appeal-body");
    const info = o.info && o.info(d); if (info) w.body.append(info);
    const list = el("div", { class: "appeal-lines" });
    for (const l of o.lines(d)) list.append(el("div", { class: "appeal-line" + (l.admin ? " admin" : "") }, el("span", { class: "adm-when" }, fmtWhen(l.at) + " "), el("b", {}, l.name + ": "), l.text));
    w.body.append(list);
    const acts = o.acts ? o.acts(d) : []; if (acts.length) w.body.append(el("div", { class: "adm-acts" }, acts));
    if (o.canSay(d)) {
      const input = el("input", { class: "text-input appeal-input", maxlength: "1000", autocomplete: "off" }); input.value = keep;
      input.addEventListener("keydown", async (e) => { e.stopPropagation(); if (e.key !== "Enter" || !input.value.trim()) return; const text = input.value; input.value = ""; try { await o.say(d, text); loadConvo(wid); } catch (er) { flash(er.message); input.value = text; } });
      w.body.append(input);
    } else if (o.closedText) { const t = o.closedText(d); if (t) w.body.append(el("div", { class: "muted" }, t)); }
    list.scrollTop = list.scrollHeight;
  }
  setInterval(() => { for (const wid of convos.keys()) if (wins[wid] && isOpen(wins[wid])) loadConvo(wid); }, 8000);
  const reloadConvo = (wid) => { if (wins[wid] && isOpen(wins[wid])) loadConvo(wid); };
  const note = (title, text, onclick, sticky = false) => { const n = el("div", { class: "appeal-note", onclick: () => { n.remove(); onclick(); } }, el("b", {}, title + (text ? ": " : "")), text || ""); document.body.append(n); if (!sticky) setTimeout(() => n.remove(), 12000); };
  const KIND = { mute: "Mute", block: "Block" }, ST2 = { open: "Open", accepted: "Accepted", denied: "Closed", closed: "Closed" };

  // ---- (owner) mutes and blocks: right-click (hold) a name for Mute / Block; the chat window's menu has the lists ----
  const REL = { list: [], appeals: [] };
  async function loadRel() { try { Object.assign(REL, await Api.get("/game/relations")); } catch {} for (const k of ["mute", "block"]) if (wins["rel:" + k] && isOpen(wins["rel:" + k])) renderRel(k); }
  const relOf = (name, kind) => REL.list.find((r) => r.kind === kind && r.name.toLowerCase() === String(name).toLowerCase());
  async function setRel(name, kind, on) { try { await Api.post("/game/relation", { name, kind, on }); await loadRel(); } catch (e) { flash(e.message); } }
  function relMenuItems(name) {
    const out = [];
    for (const k of ["mute", "block"]) { const r = relOf(name, k); if (!r) out.push([KIND[k], () => setRel(name, k, true)]); else if (!r.admin) out.push([k === "mute" ? "Unmute" : "Unblock", () => setRel(name, k, false)]); }
    return out;
  }
  function openRel(kind) {
    const wid = "rel:" + kind;
    if (!wins[wid]) createWindow(wid, { left: Math.round(innerWidth / 2 - 150), top: 120, width: 300, height: 320, minW: 240, minH: 180, render: () => { renderRel(kind); loadRel(); }, label: kind === "mute" ? "Muted" : "Blocked", groupable: false });
    toggleWindow(wid, true);
  }
  function renderRel(kind) {
    const w = wins["rel:" + kind]; if (!w) return; w.slot.textContent = kind === "mute" ? "Muted" : "Blocked";
    const draft = w.body.querySelector(".rel-add input"), keep = draft ? draft.value : "";
    w.body.innerHTML = ""; w.body.classList.add("rel-body");
    const input = el("input", { class: "text-input", maxlength: "24", autocomplete: "off", spellcheck: "false" }); input.value = keep;
    const add = () => { const n = input.value.trim(); if (n) { input.value = ""; setRel(n, kind, true); } };
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") add(); });
    const list = el("div", { class: "adm-list" });
    for (const r of REL.list.filter((x) => x.kind === kind)) {
      const ap = REL.appeals.find((a) => a.kind === kind && a.status === "open" && a.players.some((p) => p.id === r.id));
      const btn = !r.admin ? el("button", { class: "btn-ghost2 adm-mini", onclick: () => setRel(r.name, kind, false) }, "Remove")
        : el("button", { class: "btn-ghost2 adm-mini", onclick: () => (ap ? openRelAppeal(ap.id) : newRelAppeal(r.name, kind)) }, ap ? "View Appeal" : "Appeal");
      list.append(el("div", { class: "adm-row" }, el("span", { class: "adm-name" }, r.name), r.admin ? el("span", { class: "adm-tag" }, "Admin") : "", btn));
    }
    w.body.append(el("div", { class: "adm-bar rel-add adm-words" }, input, el("button", { class: "btn-ghost2 adm-mini", onclick: add }, "Add")), list);
  }
  // an appeal of an admin's mute / block: both players see it; each writes once (more when an admin gives one)
  function newRelAppeal(name, kind) {
    const wid = "relnew"; if (!wins[wid]) createWindow(wid, { left: Math.round(innerWidth / 2 - 170), top: 140, width: 340, minW: 260, minH: 180, render: () => {}, label: "Appeal", groupable: false });
    const w = wins[wid]; w.slot.textContent = "Appeal " + KIND[kind] + " · " + name; w.body.innerHTML = "";
    const text = el("textarea", { class: "text-input report-text", maxlength: "1000", rows: "4" }), err = el("div", { class: "form-err", hidden: "" });
    text.addEventListener("keydown", (e) => e.stopPropagation());
    const ok = el("button", { class: "btn-primary2", onclick: async () => { if (!text.value.trim()) return; ok.disabled = true;
      try { const r = await Api.post("/game/relappeal", { name, kind, text: text.value }); toggleWindow(wid, false); await loadRel(); openRelAppeal(r.id); } catch (e) { err.textContent = e.message; err.hidden = false; } ok.disabled = false; } }, "Send");
    w.body.append(el("div", { class: "report-form" }, text, err, el("div", { class: "report-btns" }, el("button", { class: "btn-ghost2", onclick: () => toggleWindow(wid, false) }, "Cancel"), ok)));
    toggleWindow(wid, true); setTimeout(() => text.focus(), 30);
  }
  const relPlayersInfo = (d) => el("div", { class: "appeal-info" }, el("div", {}, el("span", { class: "sheet-k" }, KIND[d.kind] + " "), d.players.map((p) => p.name).join(" · ") + " · " + (ST2[d.status] || d.status)),
    el("div", {}, el("span", { class: "sheet-k" }, "Messages left "), d.players.map((p) => p.name + " " + p.left).join(" · ")));
  function openRelAppeal(id) {
    const me = () => (state && state.profile && state.profile.username || "").toLowerCase();
    openConvo("relap:" + id, { label: "Appeal",
      fetch: async () => { await loadRel(); return REL.appeals.find((a) => a.id === String(id)) || null; },
      title: (d) => "Appeal " + KIND[d.kind] + " · " + d.players.map((p) => p.name).join(" · "), info: relPlayersInfo, lines: (d) => d.lines,
      canSay: (d) => d.status === "open" && (d.players.find((p) => p.name.toLowerCase() === me()) || {}).left > 0,
      say: (d, text) => Api.post("/game/relappeal/say", { id: d.id, text }), closedText: (d) => (d.status === "open" ? "" : ST2[d.status]) });
  }
  // ---- (owner) support tickets: subject, category, message; then a conversation with the admins ----
  let TK = { categories: [], list: [] };
  async function loadTickets() { try { TK = await Api.get("/game/tickets"); } catch (e) { flash(e.message); } if (wins.support && isOpen(wins.support)) renderSupport(); }
  function openSupport() { toggleWindow("support", true); }
  let supNew = false;
  function renderSupport() {
    const w = wins.support; w.slot.textContent = "Support";
    if (supNew && w.body.querySelector(".tk-form")) return;      // (don't wipe a ticket being written)
    w.body.innerHTML = ""; w.body.classList.add("rel-body");
    if (supNew) {
      const subj = el("input", { class: "text-input", maxlength: "80", autocomplete: "off" }), cat = el("select", { class: "base-sel" }, TK.categories.map((c) => el("option", { value: c }, c)));
      const text = el("textarea", { class: "text-input report-text", maxlength: "1000", rows: "5" }), err = el("div", { class: "form-err", hidden: "" });
      for (const x of [subj, text]) x.addEventListener("keydown", (e) => e.stopPropagation());
      const ok = el("button", { class: "btn-primary2", onclick: async () => { ok.disabled = true;
        try { const r = await Api.post("/game/ticket", { subject: subj.value, category: cat.value, text: text.value }); supNew = false; await loadTickets(); openTicket(r.id); } catch (e) { err.textContent = e.message; err.hidden = false; } ok.disabled = false; } }, "Submit");
      w.body.append(el("div", { class: "report-form tk-form" }, el("div", { class: "sheet-k" }, "Subject"), subj, el("div", { class: "sheet-k" }, "Category"), cat, el("div", { class: "sheet-k" }, "Message"), text, err,
        el("div", { class: "report-btns" }, el("button", { class: "btn-ghost2", onclick: () => { supNew = false; renderSupport(); } }, "Cancel"), ok)));
      return;
    }
    const list = el("div", { class: "adm-list" });
    for (const t of TK.list) list.append(el("div", { class: "adm-row tk-row", onclick: () => openTicket(t.id) }, el("span", { class: "adm-name" }, t.subject), el("span", { class: "adm-tag" }, t.category + " · " + (ST2[t.status] || t.status))));
    w.body.append(el("div", { class: "report-btns" }, el("button", { class: "btn-primary2", onclick: () => { supNew = true; renderSupport(); } }, "New Ticket")), list);
  }
  function openTicket(id) {
    openConvo("ticket:" + id, { label: "Ticket",
      fetch: async () => { await loadTickets(); return TK.list.find((t) => t.id === String(id)) || null; },
      title: (d) => d.subject, info: (d) => el("div", { class: "appeal-info" }, el("div", {}, el("span", { class: "sheet-k" }, d.category + " "), ST2[d.status] || d.status)), lines: (d) => d.lines,
      canSay: (d) => d.status === "open", say: (d, text) => Api.post("/game/ticket/say", { id: d.id, text }), closedText: (d) => ST2[d.status] });
  }
  // (owner) right-click (hold) the Local or Corp tab: the mute and block lists
  function chatMenu() { return [["Muted List", () => openRel("mute")], ["Blocked List", () => openRel("block")]]; }
  // notes: a player's appeal or ticket answered; an admin: new lines in them
  window.Atamus.bus.addEventListener("relappeal", (e) => { const wid = "relap:" + e.detail.id; if (wins[wid] && isOpen(wins[wid])) reloadConvo(wid); else note("Appeal", "", () => openRelAppeal(e.detail.id)); loadRel(); });
  window.Atamus.bus.addEventListener("ticket", (e) => { const wid = "ticket:" + e.detail.id; if (wins[wid] && isOpen(wins[wid])) reloadConvo(wid); else note("Support", e.detail.subject, () => openTicket(e.detail.id)); });
  // ---- the admin side: mute / block appeals (answer, give a player one more message, Accept lifts it, Deny) and tickets ----
  function openAdminRelAppeal(id) {
    openConvo("arelap:" + id, { label: "Appeal",
      fetch: () => Api.get("/game/admin/relappeal/" + encodeURIComponent(id)),
      title: (d) => "Appeal " + KIND[d.kind] + " · " + d.players.map((p) => p.name).join(" · "), info: relPlayersInfo, lines: (d) => d.lines,
      acts: (d) => d.status !== "open" ? [] : isMod() ? [escalateBtn("relappeal", d.id)] : [
        ...d.players.map((p) => el("button", { class: "btn-ghost2 adm-unban", disabled: p.left > 0 ? "" : null, onclick: async () => { try { await Api.post("/game/admin/relappeal/turn", { id: d.id, userId: p.id }); reloadConvo("arelap:" + id); } catch (e) { flash(e.message); } } }, "+1 " + p.name)),
        el("button", { class: "btn-ghost2 adm-unban", onclick: () => adminReason("Accept appeal", async (reason) => { const ok = await adminDo("/relappeal/close", { id: d.id, accept: true, reason }); reloadConvo("arelap:" + id); return ok; }) }, "Accept"),
        el("button", { class: "btn-ghost2 adm-unban", onclick: () => adminReason("Deny appeal", async (reason) => { const ok = await adminDo("/relappeal/close", { id: d.id, accept: false, reason }); reloadConvo("arelap:" + id); return ok; }) }, "Deny")],
      canSay: (d) => d.status === "open", say: (d, text) => Api.post("/game/admin/relappeal/say", { id: d.id, text }), closedText: (d) => ST2[d.status] });
  }
  // (owner) a password reset request: the Head Admin answers, Approves (the temporary password becomes the account's) or Denies
  const RESET_ST = { open: "Open", approved: "Approved", denied: "Denied", disowned: "Not them" };
  function openAdminReset(id) {
    openConvo("areset:" + id, { label: "Password Reset",
      fetch: () => Api.get("/game/admin/reset/" + encodeURIComponent(id)),
      title: (d) => "Password Reset · " + d.name, info: (d) => el("div", { class: "appeal-info" }, el("div", {}, el("span", { class: "sheet-k" }, "Status "), (RESET_ST[d.status] || d.status) + (d.closedBy ? " · " + d.closedBy : ""))), lines: (d) => d.lines,
      acts: (d) => d.status !== "open" ? [] : [
        el("button", { class: "btn-ghost2 adm-unban", onclick: async () => { if (await adminDo("/reset/close", { id: d.id, approve: true })) reloadConvo("areset:" + id); } }, "Approve"),
        el("button", { class: "btn-ghost2 adm-unban", onclick: async () => { if (await adminDo("/reset/close", { id: d.id, approve: false })) reloadConvo("areset:" + id); } }, "Deny")],
      canSay: (d) => d.status === "open", say: (d, text) => Api.post("/game/admin/reset/say", { id: d.id, text }), closedText: (d) => RESET_ST[d.status] });
  }
  function openAdminTicket(id) {
    openConvo("aticket:" + id, { label: "Ticket",
      fetch: () => Api.get("/game/admin/ticket/" + encodeURIComponent(id)),
      title: (d) => d.subject + " · " + d.name, info: (d) => el("div", { class: "appeal-info" }, el("div", {}, el("span", { class: "sheet-k" }, d.category + " "), (ST2[d.status] || d.status) + (d.closedBy ? " · " + d.closedBy : ""))), lines: (d) => d.lines,
      acts: (d) => d.status === "open" ? [el("button", { class: "btn-ghost2 adm-unban", onclick: async () => { if (await adminDo("/ticket/close", { id: d.id })) reloadConvo("aticket:" + id); } }, "Close"), ...(isMod() ? [escalateBtn("ticket", d.id)] : [])] : [],
      canSay: (d) => d.status === "open", say: (d, text) => Api.post("/game/admin/ticket/say", { id: d.id, text }), closedText: (d) => ST2[d.status] });
  }
  // (owner) an admin sets a mute or block between this player and another (both lists; only an appeal lifts it, or an admin)
  function openAdminRel(p, kind) {
    if (!wins.arel) createWindow("arel", { left: Math.round(innerWidth / 2 - 170), top: 150, width: 340, minW: 280, minH: 210, render: () => {}, label: "Mute", groupable: false });
    const w = wins.arel; w.slot.textContent = KIND[kind] + " " + p.name + " and…"; w.body.innerHTML = "";
    const other = el("input", { class: "text-input", maxlength: "24", autocomplete: "off", spellcheck: "false" }), text = el("textarea", { class: "text-input report-text", maxlength: "500", rows: "3" }), err = el("div", { class: "form-err", hidden: "" });
    for (const x of [other, text]) x.addEventListener("keydown", (e) => e.stopPropagation());
    const ok = el("button", { class: "btn-primary2", onclick: async () => { if (!text.value.trim()) { err.textContent = "Write a reason."; err.hidden = false; return; } ok.disabled = true;
      try { await Api.post("/game/admin/relation", { id: p.id, other: other.value.trim(), kind, reason: text.value }); toggleWindow("arel", false); adminLoad(); } catch (e) { err.textContent = e.message; err.hidden = false; } ok.disabled = false; } }, KIND[kind]);
    w.body.append(el("div", { class: "report-form" }, el("div", { class: "sheet-k" }, "Player"), other, el("div", { class: "sheet-k" }, "Reason"), text, err, el("div", { class: "report-btns" }, el("button", { class: "btn-ghost2", onclick: () => toggleWindow("arel", false) }, "Cancel"), ok)));
    toggleWindow("arel", true); setTimeout(() => other.focus(), 30);
  }
  // (owner) staff notifications while online: lines in the Admin chat; kept ones: the Admin button's count
  window.Atamus.bus.addEventListener("staffsys", (e) => { const m = e.detail; pushChat(isMod() ? "modchat" : "staff", { sys: true, staff: true, text: m.text, ref: m.ref }); if (wins.admin && isOpen(wins.admin)) adminLoad(); });
  window.Atamus.bus.addEventListener("staffnotes", (e) => { if (AD.me) AD.me.notes = e.detail.n; syncAdminBadge(); });
  async function loadStaffChat() {                    // (owner) the staff chats' kept lines (to catch up), once the panel is open
    if (staffLoaded || !canAdminChat()) return; staffLoaded = true;
    try {
      const mod = await Api.get("/game/admin/staffchat?ch=mod"); chat.modchat = [...mod.map((l) => ({ ...l, mention: false })), ...chat.modchat];
      if (!isMod()) { const adm = await Api.get("/game/admin/staffchat?ch=admin"); chat.staff = [...adm.map((l) => ({ ...l, mention: false })), ...chat.staff]; }
      if (wins.chat && isOpen(wins.chat)) renderChat(wins.chat.body);
    } catch { staffLoaded = false; }
  }
  // what a notification is about: a player (their Language tab for a language alert), a ticket, an appeal, a tab
  function openNoteRef(ref) {
    if (!ref) return;
    if (ref.player) { if (ref.tab === "high" || ref.tab === "chat") apTab = "lang"; else if (ref.tab === "sec") apTab = "sec"; openAdminPlayer(ref.player); }
    else if (ref.ticket) openAdminTicket(ref.ticket);
    else if (ref.relappeal) openAdminRelAppeal(ref.relappeal);
    else if (ref.appeal) openAppeal(ref.appeal);
    else if (ref.reset) openAdminReset(ref.reset);
    else if (ref.review) { AD.tab = "review"; toggleWindow("admin", true); adminLoad(); }
    else if (ref.tab === "staffchat" || ref.tab === "modchat") { chatTab = ref.tab === "modchat" ? "modchat" : "staff"; toggleWindow("chat", true); renderChat(wins.chat.body); }
    else if (ref.tab) { AD.tab = ref.tab; toggleWindow("admin", true); adminLoad(); }
  }
  const ROMAN_LV = (n) => (n ? ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"][n] || String(n) : "0");

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
  const ITEMDEFS = () => (window.Atamus.cfg && window.Atamus.cfg.items) || {};   // (owner) drones and their fuel
  const itemDef = (k) => MODS()[k] || ITEMDEFS()[k] || null;
  const itemName = (k) => { if (k.startsWith("ore:")) { const o = oreOfItem(k); return o ? o.name : "Ore"; } const m = itemDef(k); return m ? m.name : k; };
  const itemIcon = (k) => { if (k.startsWith("ore:")) { const o = oreOfItem(k), f = o ? o.rock : "cratered"; return "assets/icons/ores/" + (f === "bubble" ? "rubble" : f) + ".png"; } const m = itemDef(k); return m ? "assets/icons/" + m.icon : ""; };
  const itemM3 = (k) => (itemDef(k) ? itemDef(k).m3 : 1);
  const boxUsed = (items) => Object.entries(items || {}).reduce((t, [k, n]) => t + itemM3(k) * n, 0);
  const fmtQty = (k, n) => (itemDef(k) ? String(n) : (n >= 1000 ? Math.round(n).toLocaleString() : String(Math.floor(n * 10) / 10)));
  const licOf = (sh) => ((state && state.pilots.find((p) => String(p.id) === String(sh && sh.pilot))) || {}).licenses || {};
  function modCost(k, lic) { const m = MODS()[k]; if (!m) return { power: 0, disposition: 0 }; const f = 1 - 0.05 * Math.min(5, lic[m.license] || 0); return { power: Math.round(m.power * f * 100) / 100, disposition: Math.round(m.disposition * f * 100) / 100 }; }
  // a container: a station's storage ("hangar": the Station's; "home": your own station's, owner), or a ship's hold { ship, hold }
  const isStore = (c) => c === "hangar" || c === "home";
  const storeAt = (c) => { if (c === "home") return "home"; const all = ((window.Atamus.snap && window.Atamus.snap.ships) || []).filter((x) => x.mine && x.docked), sh = hudShip(); return (sh && sh.docked) || (all[0] && all[0].docked) || "station"; };   // where that storage is: the station the selected ship is docked at (owner: a hangar per station)
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
    if (target.dataset.mslot != null) { const m = MODS()[pl.item], sh = hudShip(), any = !!(sh && ((window.Atamus.cfg.shipTypes || {})[sh.type] || {}).anySlot); return !!m && (m.slot === target.dataset.kind || any) && !!(sh && (sh.docked || any)); }   // (owner) refit docked (an admin's ETA ship: any module, any slot, anywhere)
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
  function toggleModule(i) {
    const A = window.Atamus, sh = hudShip(), k = sh && modsOf(sh, "active")[i]; if (!k) return;
    if ((MODS()[k] || {}).kind === "drones" && !(sh.act && sh.act[i]) && !sh.docked && !sh.warp) { openLaunch(sh, i); return; }   // (owner) drones: pick what they carry first
    A.send({ t: "module", ship: sh.id, slot: i, on: !(sh.act && sh.act[i]) });
  }
  // ---- (owner) launching drones: which module from the cargo hold the drones carry (mining laser or weapon), and how
  // many; with no drones in the drone bay, no such modules or no fuel: "Unable to launch more drones" ----
  let launch = null;
  function openLaunch(sh, slot) {
    launch = { ship: sh.id, slot, item: null, n: 0 };
    if (!wins.launch) createWindow("launch", { left: Math.round(innerWidth / 2 - 150), top: Math.round(innerHeight / 2 - 140), width: 300, minW: 240, minH: 140, render: renderLaunch, label: "Launch Drones", groupable: false });
    toggleWindow("launch", true); renderLaunch(wins.launch.body);
  }
  function renderLaunch(body) {
    const A = window.Atamus, sh = launch && A.ship(launch.ship); body.innerHTML = ""; wins.launch.slot.textContent = "Launch Drones";
    if (!sh) { toggleWindow("launch", false); return; }
    const cargo = (sh.holds && sh.holds.cargo) || {}, bay = Math.floor(((sh.holds && sh.holds.drones) || {}).drone || 0), fuel = Math.floor(cargo.drone_fuel || 0);
    const link = (sh.calc && sh.calc.mods && sh.calc.mods[launch.slot]) || {}, opts = Object.entries(cargo).filter(([k, n]) => { const m = MODS()[k]; return m && m.droneable && m.size === "s" && n >= 1; });
    const max = (k) => Math.max(0, Math.min(link.drones || 0, bay, fuel, Math.floor(cargo[k] || 0)));
    if (!opts.length || !bay || !fuel || !link.drones) { body.append(el("div", { class: "muted launch-none" }, "Unable to launch more drones")); return; }
    if (!launch.item || !opts.some(([k]) => k === launch.item)) { launch.item = opts[0][0]; launch.n = max(launch.item); }
    const list = el("div", { class: "launch-list" }, opts.map(([k, n]) => el("button", { class: "launch-opt" + (k === launch.item ? " sel" : ""), onclick: () => { launch.item = k; launch.n = max(k); renderLaunch(body); } },
      el("img", { src: itemIcon(k), alt: "", draggable: "false" }), el("span", { class: "launch-name" }, itemName(k)), el("span", { class: "launch-qty" }, String(n)))));
    const num = el("span", { class: "launch-n" }, String(launch.n));
    const step = (d) => { launch.n = Math.max(1, Math.min(max(launch.item), launch.n + d)); num.textContent = String(launch.n); };
    const go = el("button", { class: "btn-ghost2 launch-go", onclick: () => { A.send({ t: "module", ship: sh.id, slot: launch.slot, on: true, drones: { item: launch.item, n: launch.n } }); toggleWindow("launch", false); } }, "Launch");
    body.append(list, el("div", { class: "launch-row" }, el("button", { class: "fa-btn", onclick: () => step(-1) }, "−"), num, el("button", { class: "fa-btn", onclick: () => step(1) }, "+"), go));
  }
  // ---- (owner) a wreck: what's in it; Take (right-click or hold an item) or Take All ----
  let wreckOpen = null;
  window.Atamus.bus.addEventListener("openwreck", (e) => { const sh = hudShip(); if (sh) window.Atamus.send({ t: "loot", ship: sh.id, wreck: e.detail }); });
  window.Atamus.bus.addEventListener("wreck", (e) => {
    const m = e.detail;
    if (m.far || m.gone) { if (wreckOpen && wreckOpen.id === m.id && wins.wreck && isOpen(wins.wreck)) { if (m.gone) toggleWindow("wreck", false); else if (m.far && !wreckOpen.told) { wreckOpen.told = true; flash("Too far away"); } } else if (m.far) flash("Too far away"); return; }
    wreckOpen = { id: m.id, name: m.name, items: m.items || {} };
    if (!wins.wreck) createWindow("wreck", { left: Math.round(innerWidth / 2 - 160), top: 150, width: 320, minW: 240, minH: 150, render: renderWreck, label: "Wreck", groupable: false });
    toggleWindow("wreck", true); renderWreck(wins.wreck.body);
  });
  function renderWreck(body) {
    const A = window.Atamus; body.innerHTML = ""; if (!wreckOpen) return; wins.wreck.slot.textContent = wreckOpen.name || "Wreck";
    const take = (k) => { const sh = hudShip(); if (sh) A.send({ t: "take", ship: sh.id, wreck: wreckOpen.id, item: k }); };
    const cells = Object.entries(wreckOpen.items).map(([k, n]) => { const cell = el("div", { class: "si-cell filled", "data-item": k }, el("img", { class: "si-icon", src: itemIcon(k), alt: "", draggable: "false" }), el("span", { class: "si-qty" }, fmtQty(k, n)));
      nameTip(cell, itemName(k)); holdMenu(cell, () => [["Take", () => take(k)], ...(itemDef(k) ? [["Info", () => openModInfo(k)]] : [])]); return cell; });
    body.append(el("div", { class: "st-grid-wrap" }, el("div", { class: "si-grid" }, cells)), el("div", { class: "st-foot" }, el("button", { class: "btn-ghost2", onclick: () => { for (const k of Object.keys(wreckOpen.items)) take(k); } }, "Take All")));
  }
  // an item cell (Inventory and Station windows): its icon and amount; drag it; right-click: Fit (a module in the cargo hold), Move to…, Info
  function itemCell(k, n, from) {
    const cell = el("div", { class: "si-cell filled", "data-item": k }, el("img", { class: "si-icon", src: itemIcon(k), alt: "", draggable: "false" }), el("span", { class: "si-qty" }, fmtQty(k, n)));
    nameTip(cell, itemName(k));
    dragSource(cell, () => ({ item: k, from }), () => {
      const A = window.Atamus, sh = hudShip(), out = [];
      if (MODS()[k] && from.type === "hold" && sh && sh.docked && from.ship === sh.id && from.hold === "cargo") out.push(["Fit", () => fitFirst(sh, k)]);   // (owner) docked only
      const dests = moveTargets(from, k); if (dests.length) out.push(["Move to", dests.map(([label, to]) => [label, () => A.send({ t: "transfer", from: srcCont(from), to, item: k })])]);
      if (itemDef(k)) out.push(["Info", () => openModInfo(k)]);
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
      for (const h of T.holds || []) { const key = x.id + "|" + h.key; if (key === fromKey || (h.key === "ore" && !k.startsWith("ore:")) || (h.key === "drones" && k !== "drone")) continue; out.push([(x.id === (src && src.id) ? "" : shipName(x) + " ") + h.name, { ship: x.id, hold: h.key }]); }
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
  // (owner) a module's (or item's) numbers: as fitted on the selected ship when it is, else as this pilot would run it
  function renderModInfo(body) {
    const m = itemDef(minfoKey); body.innerHTML = ""; if (!m) return;
    wins.minfo.slot.textContent = m.name;
    const head = el("div", { class: "oi-head" }, el("img", { class: "oi-icon", src: itemIcon(minfoKey), alt: "" }), el("span", { class: "ps-name" }, m.name));
    if (!MODS()[minfoKey]) { body.append(head, el("p", { class: "fit-desc" }, m.desc || ""), el("div", { class: "ps-rows" }, [statRow("Volume", m.m3 + " m³")])); return; }
    const sh = hudShip(), lic = licOf(sh), c = modCost(minfoKey, lic), L = (key) => Math.min(5, lic[key] || 0), pct = (v) => "+" + Math.round(v * 1000) / 10 + "%", sec = (ms) => Math.round(ms / 100) / 10 + " s", km = (v) => (Math.round(v * 100) / 100) + " km";
    const slot = sh && (sh.fit && sh.fit.active || []).indexOf(minfoKey), mc = (sh && sh.calc && sh.calc.mods && slot >= 0 && sh.calc.mods[slot]) || null, x = mc || m;
    const lk = 1 + 0.05 * L(m.license), pk = 1 + 0.1 * L(m.license);
    const rows = [statRow("Slot", m.slot === "active" ? "Active" : "Passive"), statRow("Size", (m.size || "s").toUpperCase()), statRow("Power", c.power), statRow("Disposition", c.disposition), statRow("Volume", m.m3 + " m³")];
    const R = (k, v) => rows.push(statRow(k, v));
    if (m.kind === "mining") { R("Yield", (mc ? x.yield : Math.round(m.yield * lk * 100) / 100) + " m³ / cycle"); R("Cycle Time", sec(x.cycleMs)); R("Range", km(mc ? x.rangeKm : m.rangeKm * lk)); if (m.waste) R("Waste", "+" + Math.round(m.waste * 100) + "%"); }
    else if (m.kind === "drones") { R("Drones", m.drones); R("Control Range", km(mc ? x.rangeKm : m.rangeKm * lk)); }
    else if (m.kind === "weapon") { R("Damage", Math.round((mc ? x.dmg : m.dmg * lk) * 10) / 10); R("Cycle Time", sec(m.cycleMs)); R("Range", km(mc ? x.rangeKm : m.rangeKm * lk)); if (m.shieldK !== 1) R("Against Shields", Math.round(m.shieldK * 100) + "%"); if (m.hullK !== 1) R("Against Hulls", Math.round(m.hullK * 100) + "%"); }
    else if (m.kind === "prop") R("Top Speed", pct(mc ? x.speedBonus : m.speedBonus * lk));
    else if (m.kind === "shield_ext" || m.kind === "remote_ext") { R("Shield", "+" + Math.round(m.shieldAdd * lk)); if (m.rangeKm) R("Range", km(m.rangeKm * lk)); }
    else if (m.kind === "shield_rep" || m.kind === "remote_rep") { R("Shield", "+" + Math.round(m.amount * lk) + " / cycle"); R("Cycle Time", sec(m.cycleMs)); if (m.rangeKm) R("Range", km(m.rangeKm * lk)); }
    else if (m.kind === "hull_rep") { R("Hull", "+" + Math.round(m.amount * lk * 10) / 10 + " / cycle"); R("Cycle Time", sec(m.cycleMs)); R("Range", km(m.rangeKm * lk)); }
    else if (m.kind === "scram") R("Range", km(m.rangeKm * lk));
    else if (m.kind === "web") { R("Speed", "−" + Math.round(Math.min(0.9, m.web * lk) * 100) + "%"); R("Range", km(m.rangeKm * lk)); }
    else if (m.kind === "tractor") { R("Range", km(m.rangeKm * lk)); R("Pull Speed", Math.round(m.pullKmps * lk * 1000) + " m/s"); }
    const P = { holdBonus: "Cargo and Ore Holds", laserYield: "Mining Yield", laserRange: "Mining Range", targetRange: "Targeting Range", armorDR: "Armor", droneBonus: "Drones", accelBonus: "Acceleration", propBonus: "Afterburner and Microwarp Drive" };
    for (const [k, n] of Object.entries(P)) if (m[k]) R(n, pct(m[k] * pk));
    if (m.laserCycle) R("Mining Cycle Time", "−" + Math.round(m.laserCycle * pk * 1000) / 10 + "%");
    if (m.lockBonus) R("Locking Time", "−" + Math.round(m.lockBonus * pk * 1000) / 10 + "%");
    if (m.targets) R("Targets", "+" + m.targets);
    if (m.droneBay) R("Drone Bay", "+" + Math.round(m.droneBay * pk * 10) / 10 + " m³");
    const licName = (catalog && (catalog.licenses.find((l) => l.key === m.license) || {}).name) || m.license;
    R("License", licName + (L(m.license) ? " " + ROMAN[L(m.license)] : ""));
    if (m.tier === 2) R("Requires", licName + " V");
    body.append(head, el("p", { class: "fit-desc" }, m.desc), el("div", { class: "ps-rows" }, rows));
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
        let hpb = null; if (g.kind === "ship" && g.locked) { hpb = { sh: el("i"), hl: el("i") }; cell.append(el("div", { class: "tgt-hp" }, el("div", { class: "tgt-bar tgt-sh" }, hpb.sh), el("div", { class: "tgt-bar tgt-hl" }, hpb.hl))); }   // (owner, combat) a locked ship's shield and hull
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
        H.cards[key] = { g, cell, ring, dist, hpb };
        hudTargets.append(cell);
      }
      if (!H.status) {
        const bar = (k, cls) => { const fill = el("div", { class: "hud-fill " + cls }), txt = el("span", { class: "hud-txt" }); H[k] = { fill, txt }; return el("div", { class: "hud-bar" }, el("span", { class: "hud-k" }, k), el("div", { class: "hud-track" }, fill, txt)); };
        H.speed = el("span", { class: "hud-speed" });
        const spd = el("div", { class: "hud-bar hud-spd" }, el("span", { class: "hud-k" }, "Speed"), H.speed);
        nameTip(spd, () => { const s2 = hudShip(), t2 = s2 && A.cfg.shipTypes[s2.type]; return "Max speed " + fmtSpeed((s2 && s2.vmax) || (t2 && t2.speedKmps) || 0); });   // (owner) hover: max speed
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
      if (c.hpb) { c.hpb.sh.style.width = Math.round((g.sh || 0) * 100) + "%"; c.hpb.hl.style.width = Math.round((g.hl || 0) * 100) + "%"; }
    }
    const pct = (v, m) => (m ? Math.max(0, Math.min(1, v / m)) * 100 : 0) + "%";
    const smax = sh.shieldMax || T.shield; H.Shield.fill.style.width = pct(sh.shield, smax); H.Shield.txt.textContent = Math.round(sh.shield) + " / " + smax;
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
    const openSet = saved.stOpen || (saved.stOpen = {});   // (owner) which ships in the Ship Bay are expanded to show their holds
    if (!isStore(sel)) openSet[selC.ship] = true;
    const sig = at + "|" + sel + "|" + JSON.stringify(ships.map((x) => [x.id, x.name || "", x.holds, x.calc && x.calc.holds, !!x.unboarded, openSet[x.id] !== false])) + "|" + JSON.stringify(items) + "|" + JSON.stringify(hangar) + "|" + !!(sh && sh.docked) + "|" + !!(sh && sh.unboarded);
    wins.station.slot.textContent = at === "home" ? (A.homeName() || "Station") : ((A.poi && A.poi(at)) || {}).name || "Station";   // (that planet's station)
    if (wins.station.ssig === sig) return; wins.station.ssig = sig;
    const keepScroll = [...body.querySelectorAll(".st-side, .st-grid-wrap")].map((x) => x.scrollTop);
    body.innerHTML = ""; body.classList.add("st-win");
    const pick = (key) => { saved.stSel = key; persistAll(); wins.station.ssig = null; renderStation(body); };
    const side = el("div", { class: "st-side" }, el("button", { class: "st-entry" + (sel === store ? " active" : ""), "data-cont": store, onclick: () => pick(store) }, "Hangar"));
    if (ships.length) side.append(el("div", { class: "st-bay" }, "Ship Bay"));
    for (const x of ships) {                           // (owner) each ship a tab: click to show its holds; right-click (hold): its menu
      const T = A.cfg.shipTypes[x.type] || {}, open = openSet[x.id] !== false;   // (expanded until you collapse it)
      const tab = el("button", { class: "st-ship-tab" + (open ? " open" : "") + (x.unboarded ? " empty" : ""), onclick: () => { openSet[x.id] = !open; persistAll(); wins.station.ssig = null; renderStation(body); } },
        el("span", { class: "st-caret" }, open ? "▾" : "▸"), el("span", { class: "st-ship-name" }, shipName(x)), x.unboarded ? el("span", { class: "st-ship-tag" }, "No pilot") : null);
      holdMenu(tab, () => bayShipMenu(x));
      side.append(tab);
      if (open) for (const h of T.holds || []) { const key = x.id + "|" + h.key; side.append(el("button", { class: "st-entry st-hold" + (sel === key ? " active" : ""), "data-cont": key, onclick: () => pick(key) }, h.name)); }
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
    if (sh && sh.docked) body.append(el("div", { class: "st-foot" }, el("button", { class: "btn-ghost2 st-undock", disabled: sh.unboarded ? "" : null, onclick: () => A.send({ t: "undock", ship: sh.id }) }, "Undock")));   // (owner) not without its pilot aboard
    [...body.querySelectorAll(".st-side, .st-grid-wrap")].forEach((x, i) => { x.scrollTop = keepScroll[i] || 0; });
  }
  // (owner) a ship in the Ship Bay: its menu (as a ship's), with Board / Unboard Pilot; a pilot not aboard can't undock
  function bayShipMenu(x) {
    const A = window.Atamus, out = [["Show Fitting", () => A.bus.dispatchEvent(new CustomEvent("showfitting", { detail: x.pilot }))], ["Info", () => A.bus.dispatchEvent(new CustomEvent("objinfo", { detail: { kind: "ship", id: x.id } }))], ["Rename", () => openRename(x.id)]];
    if (!x.unboarded) out.push(["Undock", () => A.send({ t: "undock", ship: x.id })]);
    out.push(x.unboarded ? ["Board Pilot", () => A.send({ t: "board", ship: x.id, on: true })] : ["Unboard Pilot", () => A.send({ t: "board", ship: x.id, on: false })]);
    return out;
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
      if (d.kind === "sun") rows.push(row("Type", "Star"), row("Radius", Math.round(d.r).toLocaleString() + " km"), row("Planets", ((cfg.celestials && cfg.celestials.planets) || []).length));
      else rows.push(row("Type", d.kind === "moon" ? "Moon" : "Planet"), row("World", d.world), row("Radius", Math.round(d.r).toLocaleString() + " km"), row("Orbits", parent ? parent.name : (cfg.celestials && cfg.celestials.sun ? cfg.celestials.sun.name : "-")), row("Orbit", d.au ? d.au + " AU" : Math.round(d.orbit).toLocaleString() + " km"));
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
    return [["Shields", (T.shield || 0).toLocaleString()], ["Armor", Math.round((T.armorDR || 0) * 100) + "%"], ["Hull", (T.hp || 0).toLocaleString()], ["Speed", kmM(T.speedKmps || 0) + "/s"],
      ["Targeting Range", (T.targetRangeKm || 0) + " km"], ["Targeting Time", ((T.lockMs || 0) / 1000) + " s"], ["Max Targets", T.maxTargets || 0],
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
        const row = el("div", { class: "ctx-item ctx-has-sub" + (opt && opt.cls ? " " + opt.cls : "") }, label);
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
    createWindow("support", { left: Math.round(innerWidth / 2 - 170), top: 100, width: 340, height: 420, minW: 260, minH: 220, render: () => { renderSupport(); loadTickets(); }, label: "Support", groupable: false });   // (owner) its own panel button
    createWindow("station", { left: Math.max(60, Math.round(innerWidth / 2 - 260)), top: 80, width: 520, height: 360, minW: 380, minH: 220, render: renderStation, label: "Station" });
    createWindow("inv", { left: Math.max(60, Math.round(innerWidth / 2 - 140)), top: Math.max(60, innerHeight - 380), width: 280, minW: 200, minH: 140, render: renderInv, label: "Inventory", dynMin: invMin });
    const phoneUi = document.documentElement.classList.contains("phone");
    createWindow("fit", { left: Math.max(60, Math.round(innerWidth / 2 - (phoneUi ? 240 : 270))), top: phoneUi ? 60 : 90, width: phoneUi ? 470 : 540, minW: 290, minH: 200, render: renderFit, label: "Fitting", dynMin: fitMin });
    { const t = wins.fit.slot, menu = (x, y) => { const sh = hudShip(); if (sh) showCtxMenu(x, y, [["Rename", () => openRename(sh.id)]]); };   // (owner) right-click (hold) the ship's name: Rename
      t.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); menu(e.clientX, e.clientY); });
      let h = 0; t.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; clearTimeout(h); h = setTimeout(() => menu(e.clientX, e.clientY), 500); });
      for (const ev of ["pointerup", "pointercancel", "pointerleave", "pointermove"]) t.addEventListener(ev, () => clearTimeout(h)); }
    createWindow("fleet", { left: Math.max(60, Math.round(innerWidth / 2 - 150)), top: 8, width: 300, minW: 170, minH: 96, render: renderFleet, label: "Fleet" });
    createWindow("admin", { left: Math.max(60, Math.round(innerWidth / 2 - 200)), top: 90, width: 400, height: 420, minW: 300, minH: 200, render: (b) => { const btn = document.querySelector('.wbtn[data-id="admin"]'); if (btn) btn.classList.remove("has-new"); if (AD.me) renderAdmin(b); adminLoad(); }, label: "Admin" });   // (always fresh when opened: the lock may have changed)
    holdMenu(wins.admin.slot, () => (AD.me && AD.me.unlocked && AD.me.persona && !isMod() ? [[staffWord() + " Profile", openPersona]] : []));   // (owner) right-click (hold) the panel: change the admin profile
    setInterval(() => { if (wins.admin && isOpen(wins.admin) && AD.me && AD.me.unlocked) adminLoad(); }, 15000);   // (only rebuilt when something changed)
    if (!saved.win.fleet) saved.win.fleet = { open: true };   // (owner) the fleet window is how you switch pilots: open the first time
    dragMove(wins.fleet.win, wins.fleet.body, () => persistWin("fleet"));   // a bar with no title: dragged by its background
    renderPanel();
    restoreGroups();
    for (const id in wins) { if (saved.win[id] && saved.win[id].open && !wins[id].group) toggleWindow(id, true); }   // windows open last session
    try { await ensureCatalog(); await refreshState(); loadRel(); } catch { /* not logged in handled by game.js */ }
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
