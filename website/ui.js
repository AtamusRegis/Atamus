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
    elm.style.top = Math.max(0, Math.min(innerHeight - Math.min(elm.offsetHeight, 120), t)) + "px";
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
  const persistableInGroup = (id) => ["player", "pilot", "chat", "fleet"].includes(id);
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
  };
  let order = ["player", "pilot", "chat", "fleet"];
  const META = { player: { name: "Player Sheet", pinned: true }, pilot: { name: "Pilot" }, chat: { name: "Chat" }, fleet: { name: "Fleet" } };
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
    if (!state) { if (slot) slot.textContent = "Player Sheet"; body.append(el("div", { class: "muted" }, "Loading…")); return; }
    const p = state.profile;
    if (slot) slot.textContent = p.username;
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, v && v.nodeType ? v : String(v)));
    const born = new Date(p.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    if (p.portrait && window.Portrait) body.append(el("div", { class: "sheet-portrait" }, Portrait.canvas(p.portrait, 96)));   // the account's character (owner)
    body.append(row("Day Born", born), row("Credits", cr(p.credits)), row("Pilots", p.pilotCount), row("Total Endorsement Level", p.totalSkillLevel), row("Corp", p.corp));
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
    if (!state || !catalog) { if (slot) slot.textContent = "Pilot"; body.append(el("div", { class: "muted" }, "Loading…")); return; }
    if (!state.pilots.length) { if (slot) slot.textContent = "Pilot"; renderCreatePilot(body); return; }
    const pilot = state.pilots.find((p) => String(p.id) === String(saved.selPilot)) || state.pilots[0];
    selectedPilotId = pilot.id;
    if (slot) slot.textContent = pilot.name;

    if (pilot.portrait && window.Portrait) body.append(el("div", { class: "sheet-portrait" }, Portrait.canvas(pilot.portrait, 96)));   // (owner) the pilot's portrait
    const tabs = [["skills", "Licenses"], ["queue", "Training Queue"]];
    if (!tabs.some(([k]) => k === pilotTab)) pilotTab = "skills";
    body.append(el("div", { class: "tab-row" }, tabs.map(([k, n]) => el("button", { class: "tab" + (k === pilotTab ? " active" : ""), onclick: () => { pilotTab = k; renderPilot(body); } }, n))));
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

  // ---- chat (owner): Local and Corp. You speak as your account's character: its portrait and your username. ----
  const chat = { local: [], corp: [] }, unread = {}; let chatTab = "local";
  const viewing = (ch) => { const w = wins.chat; return w && isOpen(w) && chatTab === ch; };
  function updateChatGlow() {
    const w = wins.chat;
    if (w && isOpen(w) && w.slot) for (const b of w.slot.querySelectorAll(".tab")) b.classList.toggle("unread", b.dataset.ch !== chatTab && !!unread[b.dataset.ch]);
    const btn = panel.querySelector('.wbtn[data-id="chat"]');
    if (btn) btn.classList.toggle("unread", (!w || !isOpen(w)) && Object.values(unread).some(Boolean));
  }
  function pushChat(ch, msg) {
    chat[ch].push(msg); if (chat[ch].length > 300) chat[ch].shift();
    if (viewing(ch)) appendChatLine(wins.chat.body.querySelector(".chat-log"), msg);
    else { unread[ch] = true; updateChatGlow(); }
  }
  function appendChatLine(log, msg) {
    if (!log) return;
    const node = msg.sys ? el("div", { class: "sys" }, "» " + msg.text)
      : el("div", { class: "chat-line" }, msg.portrait && window.Portrait ? Portrait.canvas(msg.portrait, 22, "chat-portrait") : el("span", { class: "chat-portrait" }),
        el("div", { class: "chat-msg" }, el("span", { class: "who" }, msg.from + ": "), msg.text));
    log.append(node); log.scrollTop = log.scrollHeight;
  }
  window.Atamus.bus.addEventListener("chat", (e) => { const m = e.detail; pushChat(m.ch === "corp" ? "corp" : "local", { from: m.from, portrait: m.portrait, text: m.text }); });
  window.Atamus.bus.addEventListener("sys", (e) => pushChat("local", { sys: true, text: e.detail.text }));
  function renderChat(body) {
    unread[chatTab] = false;
    const slot = wins.chat && wins.chat.slot;
    if (slot) {
      slot.innerHTML = "";
      slot.append(el("div", { class: "tab-row" }, [["local", "Local"], ["corp", "Corp"]].map(([k, label]) =>
        el("button", { class: "tab" + (k === chatTab ? " active" : ""), "data-ch": k, onclick: () => { chatTab = k; renderChat(body); } }, label))));
    }
    body.innerHTML = "";
    const log = el("div", { class: "chat-log" });
    for (const m of chat[chatTab]) appendChatLine(log, m);
    const input = el("input", { class: "text-input", maxlength: "240", placeholder: chatTab === "corp" ? "Deep Core Industries" : "Local" });
    const form = el("form", { class: "chat-form", onsubmit: (e) => { e.preventDefault(); const t = input.value.trim(); if (!t) return; window.Atamus.send({ t: "chat", text: t, channel: chatTab }); input.value = ""; } }, input);
    body.append(log, form); log.scrollTop = log.scrollHeight;
    updateChatGlow();
  }

  // ---- right-click / hold menu (owner: placement centred above the press; below it near the top; to the right near
  // the left edge, to the left near the right edge). An item is [label, fn] or [label, [items…]]: a submenu opens beside
  // it on hover or tap, and submenus nest. ----
  let ctxMenu = null;
  function closeCtxMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
  function showCtxMenu(x, y, items) {
    closeCtxMenu();
    ctxMenu = el("div", { class: "ctx-root" }); ctxMenu.style.zIndex = z + 100000;
    const M = 6, GAP = 8;
    const build = (list, depth) => el("div", { class: "ctx-menu" + (depth ? " ctx-sub" : "") }, list.length ? list.map(([label, fn]) => {
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
      const row = el("div", { class: "ctx-item", onclick: () => { closeCtxMenu(); fn(); } }, label);
      row.addEventListener("mouseenter", () => { for (const o of [...ctxMenu.querySelectorAll(".ctx-sub")]) if (+o.dataset.depth > depth) o.remove(); });
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
    createWindow("player", { left: 90, top: 70, width: 260, minW: 230, minH: 196, render: renderPlayer });
    createWindow("pilot", { left: 180, top: 90, width: 440, minW: 390, minH: 300, render: renderPilot });
    createWindow("chat", { left: 280, top: 150, width: 320, minW: 250, minH: 108, render: renderChat });
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
