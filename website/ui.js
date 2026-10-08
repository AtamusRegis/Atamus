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
    addResize(win, opts.minW || 220, opts.minH || 130, () => persistWin(id));
    wins[id] = { id, win, body, slot, bar, close, render: opts.render, label: opts.label, groupable: opts.groupable !== false, group: null };
    return wins[id];
  }
  function toggleWindow(id, force) {
    const w = wins[id]; if (!w) return;
    const show = force != null ? force : !isOpen(w);
    if (w.group) {                                   // lives in a tab group
      const g = groups[w.group];
      if (show || id === "unit") { setActive(g, id); g.frame.style.zIndex = ++z; }   // the selection window stays in its group
      else removeFromGroup(id, true);
      updateBtnActive(); updateChatGlow(); return;
    }
    w.win.hidden = !show;
    if (show) { w.win.style.zIndex = ++z; if (w.render) w.render(w.body); }
    persistWin(id); updateBtnActive(); updateChatGlow();
  }
  function renderOpen() { for (const id in wins) if (isOpen(wins[id]) && wins[id].render) wins[id].render(wins[id].body); }

  // ---- tab groups: drop a window's title bar onto another window to stack them ----
  const groups = {}; let gseq = 0;
  const persistableInGroup = (id) => ["player", "pilot", "chat", "unit", "market"].includes(id) || id.startsWith("inv:");
  const winLabel = (id) => (wins[id] && wins[id].label) || (META[id] && META[id].name) || id;
  const groupOf = (elm) => { const f = elm && elm.closest(".win-group"); return f ? groups[f.dataset.group] : null; };
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

  function addResize(win, MIN_W, MIN_H, onEnd) {
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
          win.style.width = w + "px"; win.style.height = hh + "px"; win.style.left = l + "px"; win.style.top = t + "px";
          // never shrink horizontally past what the content needs
          if (content && (dir.includes("e") || dir.includes("w"))) {
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
  function updateBtnActive() { for (const b of panel.children) { const w = wins[b.getAttribute("data-id")]; b.classList.toggle("open", !!(w && isOpen(w))); } }

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
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v)));
    content.append(el("div", { class: "ship-hero" }, shipIcon(sh.type, "ship-hero-img")),
      row("Ship", t.name), row("Class", t.cls || "—"), row("Location", where),
      el("div", { class: "unit-btns" },
        el("button", { class: "btn-primary2 unit-btn", onclick: () => A.locateShip(sh.id) }, "Locate"),
        el("button", { class: "btn-primary2 unit-btn off", onclick: () => openShipInfo(sh.type) }, "Ship info")));
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
  // ---- ships & crews ----
  const hullOf = (type) => ((window.Atamus.cfg || {}).shipTypes || {})[type] || { name: type, sprite: "chisel" };
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
    items.push(["Info", () => openShipInfo(sh.type)]);
    showCtxMenu(x, y, items);
  }
  let shipInfoType = null;
  function openShipInfo(type) {
    if (!wins.shipinfo) createWindow("shipinfo", { left: Math.round(innerWidth / 2 - 170), top: 120, width: 340, minW: 280, minH: 200, render: renderShipInfo, groupable: false });
    shipInfoType = type; toggleWindow("shipinfo", true); renderShipInfo(wins.shipinfo.body);
  }
  function renderShipInfo(body) {
    const w = wins.shipinfo, t = hullOf(shipInfoType); body.innerHTML = ""; w.slot.textContent = t.name || "Ship";
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v)));
    const lic = (k) => { const l = catalog && catalog.licenses.find((x) => x.key === k); return l ? l.name : k; };
    body.append(el("div", { class: "ship-hero" }, shipIcon(shipInfoType, "ship-hero-img")),
      el("div", { class: "info-desc" }, el("span", {}, t.desc || "")),
      row("Class", t.cls || "—"), row("Requires", Object.entries(t.req || {}).map(([k, l]) => lic(k) + " " + l).join(", ") || "—"),
      row("Shield / Hull", (t.shield || 0).toLocaleString() + " / " + (t.hp || 0).toLocaleString()),
      row("Max speed", Math.round((t.speedKmps || 0) * 1000) + " m/s"), row("Ore hold", (t.oreM3 || 0).toLocaleString() + " m³"),
      row("Cargo", (t.cargoM3 || 0).toLocaleString() + " m³"), row("Mining lasers", (t.lasers || 0) + " × " + (t.laserM3s || 0) + " m³/s"),
      row("Targeting", (t.targetRangeKm || 0) + " km · " + (t.maxTargets || 0) + " targets"), row("Length", Math.round((t.lengthKm || 0) * 1000) + " m"),
      row("Market price", (t.price || 0).toLocaleString() + " cr"));
  }

  // The panel only rebuilds its DOM when the *structure* changes (unit, buttons);
  // numbers update in place so a button is never replaced mid-click.
  function renderUnit(body) {
    const A = window.Atamus, w = wins.unit, u = A.unit;
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v)));
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
        const st = u.stats || {};
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
          const b = el("button", { class: "hangar-ship", title: "Right-click or hold for crew and options", onclick: () => A.selectShip(sh.id) },
            shipIcon(sh.type), el("span", { class: "hs-name" }, t.name || sh.type), el("span", { class: "hs-pilot" + (who ? "" : " none") }, who || "No pilot"));
          b.addEventListener("contextmenu", (e) => { e.preventDefault(); shipMenu(sh, e.clientX, e.clientY); });
          holdToOpen(b, () => { const r = b.getBoundingClientRect(); shipMenu(sh, r.left + r.width / 2, r.top + r.height / 2); });
          body.append(b);
        }
        body.append(el("div", { class: "unit-btns" },
          el("button", { class: "btn-primary2 unit-btn off", onclick: () => openInventory({ owner: "station", inv: "hangar" }) }, "Inventory"),
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
      const h = A.inv.hangar; if (h) setBar("Hangar", h.used, h.cap, fmtM3(h.used, h.cap));
    } else if (u.kind === "gate") {
      const active = u.state === "active";
      const fuel = active ? Math.min(u.fuelMs, u.sessionRemMs ?? u.fuelMs) : u.fuelMs;
      L.fuel.textContent = fmtClock(fuel); L.status.textContent = active ? (u.connToSys ? "Connected" : "Searching…") : "Offline";
    }
  }
  window.Atamus.bus.addEventListener("select", () => { toggleWindow("unit", true); renderUnit(wins.unit.body); });
  window.Atamus.bus.addEventListener("deselect", () => toggleWindow("unit", false));
  window.Atamus.bus.addEventListener("snap", () => {
    const w = wins.unit; if (w && isOpen(w)) renderUnit(w.body);
    // a docked ship's holds are reached through the station inventory: close its own windows
    for (const key in invWins) { const r = invWins[key].root || invWins[key].ref; if (r.owner !== "ship" || invWins[key].solo || !isOpen(wins[key])) continue; const sh = window.Atamus.ship(r.id); if (!sh || sh.docked) toggleWindow(key, false); }
  });


  // ---- bottom HUD for the selected ship: target icons / status / hotbar ----
  const hud = el("div", { id: "hud", hidden: "" });
  const hudTargets = el("div", { class: "hud-targets" }), hudStatus = el("div", { class: "hud-status" }), hudBar = el("div", { class: "hud-hotbar" });
  hud.append(hudTargets, hudStatus, hudBar); document.body.append(hud);
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
    const A = window.Atamus, L = sh.lasers && sh.lasers[idx]; if (!L) return;
    const rock = selTarget && selTarget.kind === "rock" ? selTarget.id : null;
    if (L.on) { A.send({ t: "laser", ship: sh.id, idx, on: !L.repeat }); return; }   // active: toggle whether it repeats after this cycle
    A.send({ t: "laser", ship: sh.id, idx, on: true, rock });
  }
  // generic reorder drag (mouse via HTML5 DnD, touch via touchDrag) over a row of cells
  function reorderable(cell, kind, index, onDrop) {
    cell.setAttribute("draggable", "true");
    cell.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", JSON.stringify({ [kind]: index })); e.dataTransfer.effectAllowed = "move"; });
    cell.addEventListener("dragover", (e) => { e.preventDefault(); cell.classList.add("drop"); });
    cell.addEventListener("dragleave", () => cell.classList.remove("drop"));
    cell.addEventListener("drop", (e) => { e.preventDefault(); cell.classList.remove("drop"); const d = dragPayload(e); if (d && d[kind] != null) onDrop(d[kind], index); });
    cell.addEventListener("touchdrop", (e) => { const d = e.detail; if (d && d[kind] != null) onDrop(d[kind], index); });
    touchDrag(cell, { [kind]: index }, () => {});
  }
  function renderHud() {
    const A = window.Atamus, sh = hudShipData();
    if (!sh || sh.docked) { if (!hud.hidden) { hud.hidden = true; A.hud.line = null; } hudShip = null; return; }
    if (hudShip !== sh.id) { hudShip = sh.id; selTarget = null; tgOrder = []; }
    hud.hidden = false;
    const t = (A.cfg.shipTypes || {})[sh.type] || {};
    const targets = orderedTargets(sh);
    if (selTarget && !targets.some((x) => x && tgKey(x) === tgKey(selTarget))) selTarget = null;
    const sig = [sh.id, targets.map((x) => tgKey(x) + (x.locked ? 1 : 0)).join(","), selTarget && tgKey(selTarget), (sh.lasers || []).map((l) => (l.on ? 1 : 0) + (l.repeat ? 1 : 0) + (l.rock || "")).join(","), sh.auto && sh.auto.on ? 1 : 0, saved.hotbar.map((h) => h ? h.k + (h.i ?? "") : "-").join(",")].join("|");
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
            slot.classList.add("filled"); if (L.on) slot.classList.add("on"); if (L.on && !L.repeat) slot.classList.add("stopping");
            slot.append(el("div", { class: "hb-icon laser" }, el("span", {}, "ML" + (it.i + 1))));
            slot.title = "Mining Laser " + (it.i + 1) + (L.on ? (L.repeat ? " — cycling" : " — finishing cycle") : "");
            slot.addEventListener("click", () => clickLaser(sh, it.i));
            hudLive.slots.push({ slot, laser: it.i });
          }
        } else if (it && it.k === "auto") {
          slot.classList.add("filled"); if (sh.auto && sh.auto.on) slot.classList.add("on");
          slot.append(el("div", { class: "hb-icon auto" }, el("span", {}, "AM")));
          slot.title = "Auto Miner" + (sh.auto && sh.auto.on ? " — active" : "");
          slot.addEventListener("click", () => A.send({ t: "auto", ship: sh.id, on: !(sh.auto && sh.auto.on) }));
          hudLive.slots.push({ slot, auto: true });
        }
        slot.append(el("span", { class: "hb-num" }, String(idx + 1)));
        reorderable(slot, "hb", idx, (from, to) => { if (from === to) return; const a = saved.hotbar; [a[from], a[to]] = [a[to], a[from]]; persistAll(); hudSig = ""; renderHud(); });
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
    const sig = ((window.Atamus.snap.ships) || []).filter((x) => x.mine).map((x) => x.id + x.pilot + x.docked + x.warp + x.moving).join(",");
    if (sig !== pilotShipSig) { pilotShipSig = sig; renderPilot(wins.pilot.body); }
  });
  window.Atamus.bus.addEventListener("select", renderHud);
  window.Atamus.bus.addEventListener("deselect", renderHud);
  setInterval(renderHud, 500);                       // safety net: never leave the HUD up for a ship that's gone

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
  function watchInvResize(key) { const b = wins[key].body; new ResizeObserver(() => { if (isOpen(wins[key])) renderInventory(key, b); }).observe(b); }
  function makeInvWindow(key, st) {
    if (invWins[key]) return;
    invWins[key] = st;
    createWindow(key, st.solo
      ? { left: 400, top: 200, width: 420, minW: 260, minH: 200, render: (b) => renderInventory(key, b), groupable: false }
      : { left: 360, top: 160, width: 420, minW: 260, minH: 200, render: (b) => renderInventory(key, b), label: key === "inv:station" ? "Station" : "Inventory" });
    watchInvResize(key);
  }
  function openInventory(ref) {
    const sh = ref.owner === "ship" ? window.Atamus.ship(ref.id) : null;
    const viaStation = ref.owner === "station" || (sh && sh.docked);          // a docked ship's holds live under the station window
    const key = viaStation ? "inv:station" : "inv:" + ref.id;                 // one window per holder; tabs switch inside
    makeInvWindow(key, { ref, root: viaStation ? { owner: "station", inv: "hangar" } : ref });
    invWins[key].ref = ref;
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
  function renderInventory(key, body) {
    const w = wins[key], st = invWins[key]; if (!w || !st) return;
    const A = window.Atamus, ref = st.ref, data = invData(ref);
    const items = (A.cfg && A.cfg.items) || {}, maxStacks = (A.cfg && A.cfg.maxStacks) || 100;
    const tabs = st.solo ? [] : invTabsFor(st.root || ref);   // tabs belong to the window's holder, not the tab being viewed
    // slots flow into as many columns as the window fits; rows grow with the contents (plus one spare row)
    const CELL = 36, GAP = 3, cols = Math.max(1, Math.floor((body.clientWidth + GAP) / (CELL + GAP)));
    const n = data ? data.slots.length : 0, total = Math.min(maxStacks, Math.max(cols * 2, (Math.ceil(n / cols) + 1) * cols));
    // rebuild only when the structure changes (tab set, which stacks exist, column count); quantities update in place
    const sig = [invKey(ref), tabs.map(invKey).join(","), data ? data.slots.map((x) => x.item).join(",") : "-", cols, total].join("|");
    if (sig !== st.sig) {
      st.sig = sig; st.live = { qty: [] };
      body.innerHTML = ""; w.slot.innerHTML = "";
      if (!st.solo) {
        const row = el("div", { class: "tab-row" });
        for (const t of tabs) {
          const active = invKey(t) === invKey(ref);
          const b = el("button", { class: "tab" + (active ? " active" : ""), onclick: (e) => { if (e.shiftKey) openInventoryAlone(t); else { st.ref = t; renderInventory(key, body); persistWin(key); } } }, t.owner === "station" ? "Hangar" : (t.inv === "ore" ? "Ore" : "Cargo"));
          b.addEventListener("dragover", (e) => { e.preventDefault(); b.classList.add("drop"); });
          b.addEventListener("dragleave", () => b.classList.remove("drop"));
          b.addEventListener("drop", (e) => { e.preventDefault(); b.classList.remove("drop"); const d = dragPayload(e); if (d) A.send({ t: "inv_move", from: d.ref, to: { ...t, slot: null } }); });
          b.addEventListener("touchdrop", (e) => A.send({ t: "inv_move", from: e.detail.ref, to: { ...t, slot: null } }));
          holdToOpen(b, () => openInventoryAlone(t));
          row.append(b);
        }
        w.slot.append(row);
      } else w.slot.textContent = invLabel(ref);
      if (!data) { body.append(el("div", { class: "muted" }, "No inventory.")); return; }
      const fill = el("div", { class: "inv-cap-fill" }), stat = el("span", { class: "inv-stat" });
      st.live.fill = fill; st.live.stat = stat;
      body.append(el("div", { class: "inv-head" }, el("div", { class: "inv-cap" }, fill), stat,
        el("button", { class: "qbtn minus inv-sort", title: "Sort", onclick: () => A.send({ t: "inv_sort", ref }) }, "⇅")));
      const grid = el("div", { class: "inv-grid", style: "grid-template-columns: repeat(" + cols + ", 1fr)" });
      for (let i = 0; i < total; i++) {
        const stck = data.slots[i];
        const cell = el("div", { class: "inv-cell" + (stck ? " filled" : "") });
        if (stck) {
          const def = items[stck.item] || { name: stck.item, color: "#888" };
          const qty = el("span", { class: "inv-qty" });
          const item = el("div", { class: "inv-item", style: "--c:" + def.color }, def.icon ? el("img", { class: "inv-icon", src: "assets/rocks/" + def.icon + ".webp", draggable: "false", alt: "" }) : el("span", { class: "inv-abbr" }, def.name.slice(0, 3)), qty);
          st.live.qty[i] = { qty, item, def };
          cell.append(item);
          cell.setAttribute("draggable", "true");
          cell.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", JSON.stringify({ ref: { ...ref, slot: i } })); e.dataTransfer.effectAllowed = "move"; });
          cell.addEventListener("contextmenu", (e) => { e.preventDefault(); openItemMenu(ref, i, e.clientX, e.clientY); });
          touchDrag(cell, { ref: { ...ref, slot: i } }, () => { const r = cell.getBoundingClientRect(); openItemMenu(ref, i, r.left + r.width / 2, r.top + r.height / 2); });
        }
        cell.addEventListener("dragover", (e) => { e.preventDefault(); cell.classList.add("drop"); });
        cell.addEventListener("dragleave", () => cell.classList.remove("drop"));
        const dropTo = { ...ref, slot: i < data.slots.length ? i : null };
        cell.addEventListener("drop", (e) => { e.preventDefault(); cell.classList.remove("drop"); const d = dragPayload(e); if (d) A.send({ t: "inv_move", from: d.ref, to: dropTo }); });
        cell.addEventListener("touchdrop", (e) => A.send({ t: "inv_move", from: e.detail.ref, to: dropTo }));
        grid.append(cell);
      }
      body.append(grid);
    }
    if (!data) return;
    const L = st.live;
    L.fill.style.width = Math.min(100, data.used / data.cap * 100) + "%";
    L.stat.textContent = Math.round(data.used).toLocaleString() + " / " + data.cap.toLocaleString() + " m³ · " + data.stacks + "/" + maxStacks;
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
        const under = document.elementFromPoint(t.clientX, t.clientY), tgt = under && under.closest(".inv-cell, .tab, .tgt, .hb-slot");
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

  // ---- item menu: split / jettison / sell / read / info ----
  function openItemMenu(ref, slot, x, y) {
    const A = window.Atamus, data = invData(ref), stck = data && data.slots[slot]; if (!stck) return;
    const def = (A.cfg.items || {})[stck.item] || { name: stck.item };
    const holder = ref.owner === "station" ? null : A.ship(ref.id), atStation = !holder || holder.docked;
    const items = [];
    if (stck.qty > 1) items.push(["Split", () => openSplit(ref, slot)]);
    items.push(["Jettison", () => A.send({ t: "jettison", ref, slot })]);
    if (def.price && def.kind === "ore") items.push([atStation ? "Sell" : "Sell (dock first)", () => { if (atStation) openSell(ref, slot); }]);
    if (def.kind === "manual") items.push(["Read", () => A.send({ t: "read", ref, slot })]);
    items.push(["Info", () => openInfo(stck.item, stck.qty)]);
    showCtxMenu(x, y, items);
  }
  let splitAt = null;
  function openSplit(ref, slot) {
    if (!wins.split) createWindow("split", { left: Math.round(innerWidth / 2 - 140), top: Math.round(innerHeight / 2 - 80), width: 280, minW: 240, minH: 120, render: renderSplit, groupable: false });
    splitAt = { ref, slot }; wins.split.sig = null; toggleWindow("split", true); renderSplit(wins.split.body);
  }
  function renderSplit(body) {
    const A = window.Atamus, w = wins.split;
    const data = splitAt && invData(splitAt.ref), stck = data && data.slots[splitAt.slot];
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
        el("button", { class: "btn-primary2 unit-btn", onclick: () => { A.send({ t: "inv_split", ref: splitAt.ref, slot: splitAt.slot, qty: +num.value }); toggleWindow("split", false); } }, "Split")));
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
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v)));
    const perM3 = def.unitM3 ? def.price / def.unitM3 : 0;
    body.append(el("div", { class: "info-desc" }, def.icon ? el("img", { class: "info-icon", src: "assets/rocks/" + def.icon + ".webp", alt: "" }) : null, el("span", {}, def.desc || "")),
      row("Rarity", def.rarity || "—"), row("Weight", def.unitM3 + " m³ / unit"), row("Price", (def.price || 0).toLocaleString() + " cr / unit"),
      row("Price per m³", Math.round(perM3).toLocaleString() + " cr"), row("Stack", infoItem.qty.toLocaleString() + " × = " + (infoItem.qty * (def.price || 0)).toLocaleString() + " cr · " + (infoItem.qty * def.unitM3).toLocaleString() + " m³"));
  }

  // ---- station market ----
  function openMarket() {
    if (!wins.market) createWindow("market", { left: 300, top: 120, width: 360, minW: 300, minH: 200, render: renderMarket, label: "Market" });
    toggleWindow("market", true); renderMarket(wins.market.body);
  }
  saved.mkOpen = saved.mkOpen || {};                 // which market groups are expanded (remembered)
  function renderMarket(body) {
    const A = window.Atamus, w = wins.market; w.slot.textContent = "Market";
    const items = A.cfg.items || {}, credits = A.inv.credits || 0, unlocked = A.inv.unlocked || {};
    const keep = body.scrollTop; body.innerHTML = "";
    body.append(el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, "Credits"), el("span", { class: "sheet-v" }, credits.toLocaleString() + " cr")));
    const groups = new Map();                          // cat -> sub -> [offers]
    for (const m of A.cfg.market || []) { if (!groups.has(m.cat)) groups.set(m.cat, new Map()); const g = groups.get(m.cat); if (!g.has(m.sub)) g.set(m.sub, []); g.get(m.sub).push(m); }
    const toggle = (k) => { saved.mkOpen[k] = !saved.mkOpen[k]; persistAll(); renderMarket(body); };
    for (const [cat, subs] of groups) {
      const open = !!saved.mkOpen[cat];
      body.append(el("div", { class: "mk-cat" + (open ? " open" : ""), onclick: () => toggle(cat) }, el("span", { class: "mk-caret" }, "▸"), cat, el("span", { class: "mk-count" }, [...subs.values()].reduce((n, a) => n + a.length, 0))));
      if (!open) continue;
      for (const [sub, offers] of subs) {
        const sk = cat + "/" + sub, sopen = !!saved.mkOpen[sk];
        body.append(el("div", { class: "mk-sub-h" + (sopen ? " open" : ""), onclick: () => toggle(sk) }, el("span", { class: "mk-caret" }, "▸"), sub, el("span", { class: "mk-count" }, offers.length)));
        if (!sopen) continue;
        for (const m of offers) {
          const def = items[m.key] || {};
          const known = def.license && unlocked[def.license];
          const name = el("div", { class: "mk-name" }, m.ship ? shipIcon(m.ship, "mk-ship") : null, el("span", {}, m.name || def.name || m.key));
          if (m.ship) { name.style.cursor = "pointer"; name.title = "Ship info"; name.addEventListener("click", () => openShipInfo(m.ship)); }
          if (known) name.append(el("span", { class: "mk-sub" }, "Already read"));
          body.append(el("div", { class: "mk-row" + (known ? " known" : "") }, name,
            el("div", { class: "mk-price" + (credits < m.price ? " poor" : "") }, m.price.toLocaleString() + " cr"),
            el("button", { class: "btn-primary2 unit-btn mk-buy", disabled: credits < m.price ? "" : null, onclick: () => A.send({ t: "buy", item: m.key, qty: 1 }) }, "Buy")));
        }
      }
    }
    body.scrollTop = keep;
  }

  // ---- sell (right-click / hold an ore stack) ----
  let sell = null; // { ref, slot }
  function openSell(ref, slot) {
    const A = window.Atamus, data = invData(ref), stck = data && data.slots[slot]; if (!stck) return;
    const def = (A.cfg.items || {})[stck.item]; if (!def || !def.price) return;
    const holder = ref.owner === "station" ? null : A.ship(ref.id);
    if (holder && !holder.docked) { flash("Dock to sell."); return; }
    if (!wins.sell) createWindow("sell", { left: Math.round(innerWidth / 2 - 150), top: Math.round(innerHeight / 2 - 90), width: 300, minW: 260, minH: 150, render: renderSell, groupable: false });
    sell = { ref, slot }; wins.sell.sig = null;
    toggleWindow("sell", true); renderSell(wins.sell.body);
  }
  function renderSell(body) {
    const A = window.Atamus, w = wins.sell;
    const data = sell && invData(sell.ref), stck = data && data.slots[sell.slot];
    const def = stck && (A.cfg.items || {})[stck.item];
    const sig = stck ? stck.item + ":" + stck.qty : "";
    if (sig === w.sig && body.childElementCount) return;             // stack unchanged: keep the slider as it is
    w.sig = sig; body.innerHTML = "";
    if (!def) { w.slot.textContent = "Sell"; body.append(el("div", { class: "muted" }, "Nothing to sell.")); return; }
    w.slot.textContent = "Sell " + def.name;
    const qty = el("input", { type: "range", class: "sell-range", min: 1, max: stck.qty, value: stck.qty });
    const num = el("input", { type: "number", class: "sell-num", min: 1, max: stck.qty, value: stck.qty });
    const total = el("span", { class: "sheet-v" });
    const upd = () => { const q = Math.max(1, Math.min(stck.qty, Math.round(+num.value || 1))); num.value = q; qty.value = q; total.textContent = (q * def.price).toLocaleString() + " cr"; };
    qty.addEventListener("input", () => { num.value = qty.value; upd(); }); num.addEventListener("input", upd);
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), v.nodeType ? v : el("span", { class: "sheet-v" }, String(v)));
    body.append(row("Price", def.price.toLocaleString() + " cr / unit"), row("Quantity", num), qty, row("You get", total),
      el("div", { class: "unit-btns row2" },
        el("button", { class: "btn-primary2 unit-btn off", onclick: () => toggleWindow("sell", false) }, "Cancel"),
        el("button", { class: "btn-primary2 unit-btn", onclick: () => { A.send({ t: "sell", ref: sell.ref, slot: sell.slot, qty: +num.value }); toggleWindow("sell", false); } }, "Confirm")));
    upd();
  }
  window.Atamus.bus.addEventListener("inv", () => {
    const A = window.Atamus;
    if (state && A.inv.credits != null && state.profile.credits !== A.inv.credits) { state.profile.credits = A.inv.credits; if (wins.player && isOpen(wins.player)) renderPlayer(wins.player.body); }
    if (wins.sell && isOpen(wins.sell)) renderSell(wins.sell.body);
    if (wins.market && isOpen(wins.market)) renderMarket(wins.market.body);
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
    createWindow("unit", { left: 420, top: 120, width: 250, minW: 230, minH: 120, render: renderUnit, label: "Selection" });
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
