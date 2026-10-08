// Atamus windowed UI: left panel of window buttons + draggable windows.
(() => {
  "use strict";
  const panel = document.getElementById("window-panel");
  const tooltip = document.getElementById("tooltip");

  let catalog = null, state = null, selectedPilotId = null;
  let z = 100;

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
  async function ensureCatalog() { if (!catalog) catalog = await Api.get("/game/catalog"); }
  async function refreshState() { state = await Api.get("/game/state"); if (selectedPilotId == null && state.pilots[0]) selectedPilotId = state.pilots[0].id; renderOpen(); }

  // ---- windows ----
  const wins = {};
  function createWindow(id, title, opts) {
    opts = opts || {};
    const body = el("div", { class: "win-body" });
    const close = el("button", { class: "win-close", "aria-label": "Close", onclick: () => toggleWindow(id, false) }, "×");
    const bar = el("div", { class: "win-title" }, el("span", {}, title), close);
    const win = el("div", { class: "win", hidden: "" }, bar, body);
    win.style.left = (opts.left || 120) + "px"; win.style.top = (opts.top || 70) + "px"; if (opts.width) win.style.width = opts.width + "px";
    document.body.appendChild(win);
    win.addEventListener("mousedown", () => { win.style.zIndex = ++z; });
    dragMove(win, bar, close);
    wins[id] = { win, body, render: opts.render };
    return wins[id];
  }
  function toggleWindow(id, force) {
    const w = wins[id]; if (!w) return;
    const show = force != null ? force : w.win.hidden;
    w.win.hidden = !show;
    if (show) { w.win.style.zIndex = ++z; if (w.render) w.render(w.body); }
    updateBtnActive();
  }
  function renderOpen() { for (const id in wins) if (!wins[id].win.hidden && wins[id].render) wins[id].render(wins[id].body); }

  function dragMove(win, handle, ignore) {
    handle.addEventListener("mousedown", (e) => {
      if (ignore && (e.target === ignore || ignore.contains(e.target))) return;
      e.preventDefault();
      const r = win.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      const mv = (ev) => { win.style.left = Math.max(44, Math.min(innerWidth - 60, ev.clientX - ox)) + "px"; win.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - oy)) + "px"; };
      const up = () => { removeEventListener("mousemove", mv); removeEventListener("mouseup", up); };
      addEventListener("mousemove", mv); addEventListener("mouseup", up);
    });
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
    updateBtnActive();
  }
  function reorderBtn(from, to) { order = order.filter((x) => x !== from); let i = order.indexOf(to); if (i < 1) i = 1; order.splice(i, 0, from); renderPanel(); }
  function updateBtnActive() { for (const b of panel.children) { const w = wins[b.getAttribute("data-id")]; b.classList.toggle("open", !!(w && !w.win.hidden)); } }

  // ---- Player Sheet ----
  function renderPlayer(body) {
    body.innerHTML = "";
    if (!state) { body.append(el("div", { class: "muted" }, "Loading…")); return; }
    const p = state.profile;
    const row = (k, v) => el("div", { class: "sheet-row" }, el("span", { class: "sheet-k" }, k), el("span", { class: "sheet-v" }, String(v)));
    const born = new Date(p.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    body.append(row("Name", p.username), row("Day Born", born), row("Pilots", p.pilotCount), row("Total Skill Level", p.totalSkillLevel), row("Corp", p.corp));
  }

  // ---- Pilot window ----
  let pilotTab = "skills", skillCategory = null;
  const trained = (pilot, key) => (pilot.licenses && pilot.licenses[key]) || 0;
  const queuedCount = (pilot, key) => pilot.queue.filter((q) => q.key === key).length;
  const effLevel = (pilot, key) => trained(pilot, key) + queuedCount(pilot, key);
  function prereqMet(pilot, key) { const l = licById(key); return l.requirements.every((r) => r.type !== "license" || trained(pilot, r.key) >= r.level); }

  function renderPilot(body) {
    body.innerHTML = "";
    if (!state || !catalog) { body.append(el("div", { class: "muted" }, "Loading…")); return; }
    if (!state.pilots.length) { renderCreatePilot(body); return; }
    if (selectedPilotId == null) selectedPilotId = state.pilots[0].id;
    const pilot = state.pilots.find((p) => p.id === selectedPilotId) || state.pilots[0];
    selectedPilotId = pilot.id;

    const sel = el("select", { class: "pilot-select", onchange: (e) => { selectedPilotId = +e.target.value; renderPilot(body); } },
      state.pilots.map((p) => { const o = el("option", { value: p.id }, p.name); if (p.id === pilot.id) o.selected = true; return o; }));
    body.append(el("div", { class: "pilot-head" }, el("span", { class: "pilot-head-label" }, "PILOTS:"), sel));

    const tabs = [["skills", "Skills"], ["queue", "Skill Queue"], ["ship", "Current Ship"], ["items", "Items"]];
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
        el("span", { class: "cat-prog" }, learned + " / " + total));
    })));
    // selected category's licenses shown inline below
    const cat = catalog.categories.find((c) => c.key === skillCategory);
    const lics = catalog.licenses.filter((l) => l.category === skillCategory);
    const sub = el("div", { class: "skills-sub" }, el("div", { class: "skills-sub-head" }, cat.name));
    for (const l of lics) sub.append(licenseRow(pilot, l));
    content.append(sub);
  }

  function licenseRow(pilot, l) {
    const tr = trained(pilot, l.key), eff = effLevel(pilot, l.key), maxed = eff >= l.maxLevel, next = eff + 1;
    const canAdd = !maxed && prereqMet(pilot, l.key);
    const pips = el("div", { class: "pips" });
    for (let lv = 1; lv <= l.maxLevel; lv++) { let cls = "pip"; if (lv <= tr) cls += " on"; else if (lv <= eff) cls += " q"; pips.append(el("span", { class: cls })); }
    const btns = el("div", { class: "lic-btns" });
    if (!maxed) {
      if (queuedCount(pilot, l.key) > 0) btns.append(el("button", { class: "qbtn minus", title: "Remove top queued", onclick: () => queueRemove(l.key) }, "−"));
      btns.append(el("button", { class: "qbtn" + (canAdd ? "" : " disabled"), title: canAdd ? "Queue next" : "Requirements not met", onclick: () => { if (canAdd) queueAdd(l.key); } }, "+"));
    }
    return el("div", { class: "lic-row" },
      el("span", { class: "lic-name", onclick: () => openLicense(l.key, Math.max(1, tr || 1)) }, l.name),
      pips,
      el("span", { class: "lic-time" }, maxed ? "MAX" : fmtTime(l.levelTimes[next - 1])),
      btns);
  }

  async function queueAdd(key) { try { await Api.post("/game/queue/add", { pilotId: selectedPilotId, key }); await refreshState(); } catch (e) { flash(e.message); } }
  async function queueRemove(key) { try { await Api.post("/game/queue/remove", { pilotId: selectedPilotId, key }); await refreshState(); } catch (e) { flash(e.message); } }

  function renderQueue(content, pilot) {
    if (!pilot.queue.length) { content.append(el("div", { class: "muted" }, "Training queue empty. Add licenses from the Skills tab.")); return; }
    const list = el("div", { class: "queue-list" });
    pilot.queue.forEach((q, i) => {
      const l = licById(q.key);
      const item = el("div", { class: "queue-item" + (i === 0 ? " active" : ""), draggable: "true", "data-i": i },
        el("span", { class: "q-pos" }, i === 0 ? "▶" : (i + 1)),
        el("span", { class: "q-name" }, l.name + " " + q.level),
        el("span", { class: "q-time", "data-active": i === 0 ? "1" : "" }, i === 0 && pilot.active ? fmtTime(pilot.active.remainingMs) : fmtTime(l.levelTimes[q.level - 1])));
      item.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", String(i)));
      item.addEventListener("dragover", (e) => e.preventDefault());
      item.addEventListener("drop", (e) => { e.preventDefault(); const from = +e.dataTransfer.getData("text/plain"); reorderQueue(pilot, from, i); });
      list.append(item);
    });
    content.append(list);
  }

  async function reorderQueue(pilot, from, to) {
    if (from === to) return;
    const arr = pilot.queue.slice(); const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
    // validate ascending per license
    const seen = {}; for (const q of arr) { if (seen[q.key] != null && q.level < seen[q.key]) { flash("Can't put a higher level below a lower one"); return; } seen[q.key] = q.level; }
    try { await Api.post("/game/queue/reorder", { pilotId: selectedPilotId, order: arr }); await refreshState(); } catch (e) { flash(e.message); }
  }

  // ---- license popup ----
  let popup = null;
  function openLicense(key, level) {
    const l = licById(key);
    let pTab = "licensing", pLevel = Math.min(l.maxLevel, Math.max(1, level));
    if (popup) popup.remove();
    popup = el("div", { class: "license-popup" });
    popup.style.zIndex = ++z;
    const render = () => {
      const pilot = state.pilots.find((p) => p.id === selectedPilotId);
      popup.innerHTML = "";
      const close = el("button", { class: "win-close", onclick: () => { popup.remove(); popup = null; } }, "×");
      popup.append(el("div", { class: "pop-title" }, el("span", {}, l.name), close));
      // level selector
      const boxes = el("div", { class: "lvl-boxes" });
      for (let lv = 1; lv <= l.maxLevel; lv++) {
        const tr = trained(pilot, key), eff = effLevel(pilot, key);
        let cls = "lvl-box"; if (lv <= tr) cls += " learned"; else if (lv <= eff) cls += " studying";
        if (lv === pLevel) cls += " sel";
        boxes.append(el("div", { class: cls, onclick: () => { pLevel = lv; render(); } }, lv));
      }
      popup.append(boxes);
      // tabs
      const tabs = [["licensing", "Licensing"], ["requirements", "Requirements"], ["requiredFor", "Required For"]];
      popup.append(el("div", { class: "tab-row" }, tabs.map(([k, n]) => el("button", { class: "tab" + (k === pTab ? " active" : ""), onclick: () => { pTab = k; render(); } }, n))));
      const c = el("div", { class: "pop-content" }); popup.append(c);
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
    document.body.appendChild(popup);
  }

  // ---- chat ----
  const chat = { local: [], corp: [] }; let chatTab = "local";
  function pushChat(ch, msg) { chat[ch].push(msg); const w = wins.chat; if (w && !w.win.hidden && chatTab === ch) appendChatLine(w.body.querySelector(".chat-log"), msg); }
  function appendChatLine(log, msg) { if (!log) return; const d = el("div", msg.sys ? { class: "sys" } : {}, msg.sys ? "» " + msg.text : [el("span", { class: "who" }, msg.from + ": "), msg.text]); log.append(d); log.scrollTop = log.scrollHeight; }
  window.Atamus.bus.addEventListener("chat", (e) => { const m = e.detail; const ch = m.ch === "corp" ? "corp" : "local"; pushChat(ch, { from: m.from, text: m.text }); });
  window.Atamus.bus.addEventListener("sys", (e) => pushChat("local", { sys: true, text: e.detail.text }));

  function renderChat(body) {
    body.innerHTML = "";
    body.append(el("div", { class: "tab-row" }, [["local", "Local"], ["corp", "Corp"]].map(([k, n]) =>
      el("button", { class: "tab" + (k === chatTab ? " active" : ""), onclick: () => { chatTab = k; renderChat(body); } }, n))));
    const log = el("div", { class: "chat-log" });
    for (const m of chat[chatTab]) appendChatLine(log, m);
    const input = el("input", { class: "text-input", maxlength: "240", placeholder: "Message " + (chatTab === "corp" ? "Delve Holdings" : "local") + "…" });
    const form = el("form", { class: "chat-form", onsubmit: (e) => { e.preventDefault(); const t = input.value.trim(); if (t) window.Atamus.send({ t: "chat", text: t, channel: chatTab }); input.value = ""; } }, input);
    body.append(log, form); log.scrollTop = log.scrollHeight;
  }

  function flash(text) { const s = document.getElementById("status"); if (!s) return; s.textContent = text; s.className = "status err"; setTimeout(() => s.classList.add("hidden"), 2500); }

  // ---- init ----
  async function init() {
    createWindow("player", "PLAYER SHEET", { left: 90, top: 70, width: 260, render: renderPlayer });
    createWindow("pilot", "PILOT", { left: 170, top: 90, width: 440, render: renderPilot });
    createWindow("chat", "CHAT", { left: 250, top: 140, width: 320, render: renderChat });
    renderPanel();
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
