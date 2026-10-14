// (owner, 2026-10-13) The admin panel: an Admin button (top right) for staff accounts opens it. Being logged in as a staff
// account is enough (no second password). The sections are floating icon buttons on the panel's left (names on hover):
//   - Players: Online / Offline tabs, a search box for the selected list, then the list (6 rows, then it scrolls under
//     the tabs and search, which stay put; the window shows 6 rows). A row: name (20 characters, monospace) | Mute tag | Ban tag | last played |
//     Discipline (the disciplinary panel). The tags are always there: grayed, or lit while running (mute yellow, ban red)
//     with the time left inside; grayed, they hold the total time served (a lifted one counts only until it was lifted).
//   Every section uses the same window at the same size (the Players size).
//   - Reports: players' reports with the reported player's recent chat.
//   - Appeals: ban appeals (read, reply, accept or deny).
// One window, one size for every section. The disciplinary panel is its own window (AdminPanel.act(id, name), also
// the Admin item on a name in chat): Type (kick, mute, ban, kill, respawn, teleport to me, teleport to player; Unmute /
// Unban when they apply), a reason from a list for mutes and bans, a length slider (5 min, 30 min, 6 h, 1 day, 3 days,
// 7 days, indefinite), an optional note to the player, Cancel / Accept. Text is always inserted as text. Talks to
// /game/admin/* (server admin.js).
(function () {
  const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const when = (t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  // a short span: 25m, 6h, 3d
  const short = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? m + "m" : m < 1440 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d"; };
  const left = (x) => (x.perm ? "∞" : short(new Date(x.until).getTime() - Date.now()));
  // a total: 45m, 3h 20m, 2d 6h
  const dur = (sec) => { const m = Math.floor(sec / 60); if (m < 1) return "<1m"; if (m < 60) return m + "m"; const h = Math.floor(m / 60); if (h < 24) return h + "h" + (m % 60 ? " " + (m % 60) + "m" : ""); const d = Math.floor(h / 24); return d + "d" + (h % 24 ? " " + (h % 24) + "h" : ""); };
  const ago = (t) => (t ? short(Date.now() - new Date(t).getTime()) + " ago" : "never");
  const svg = (d) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); s.appendChild(p); return s; };
  const ICONS = {
    players: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z",
    reports: "M5 2h2v20H5zM8 3h11l-2.5 4.5L19 12H8z",
    appeals: "M4 4h16v11H9l-5 4z",
  };
  let root, rail, body, section = "players", list = "online", query = "", openAppeal = null, timer = 0, searchT = 0;
  let listBox = null;

  function mount() {
    if (root) return;
    const btn = $("button", "", "Admin"); btn.id = "admin-btn"; document.body.appendChild(btn);
    root = $("div"); root.id = "admin-panel"; root.hidden = true;
    rail = $("div", "ap-rail");
    for (const [k, label] of [["players", "Players"], ["reports", "Reports"], ["appeals", "Appeals"]]) {
      const b = $("button"); b.title = label; b.dataset.k = k; b.appendChild(svg(ICONS[k]));
      b.addEventListener("click", () => { section = k; openAppeal = null; build(); });
      rail.appendChild(b);
    }
    const x = $("button", "ap-x", "×"); x.title = "Close"; x.addEventListener("click", () => toggle(false));
    body = $("div", "ap-body");
    root.append(rail, x, body); document.body.appendChild(root);
    btn.addEventListener("click", () => toggle());
  }
  function toggle(open) {
    root.hidden = open === undefined ? !root.hidden : !open;
    clearInterval(timer);
    if (!root.hidden) { build(); timer = setInterval(() => { const a = document.activeElement; if (!a || !root.contains(a) || a.classList.contains("ap-search")) refresh(); }, 5000); }
  }
  const err = (box, e) => { box.textContent = e && e.message ? e.message : String(e); box.hidden = false; };

  // the section's fixed parts (tabs, search), then its contents (which scroll). (owner: no flicker) The new section is
  // built off-screen and swapped in only once its contents have arrived; the window keeps one size for every section.
  let buildSeq = 0;
  async function build() {
    const seq = ++buildSeq;
    for (const b of rail.children) b.classList.toggle("on", b.dataset.k === section);
    const parts = [];
    const box = $("div", "ap-scroll");
    if (section === "players") {
      const tabs = $("div", "ap-tabs");
      for (const [k, label] of [["online", "Online"], ["offline", "Offline"]]) { const b = $("button", k === list ? "on" : "", label); b.addEventListener("click", () => { list = k; build(); }); tabs.appendChild(b); }
      const search = $("input", "ap-search"); search.value = query; search.maxLength = 40;
      search.addEventListener("input", () => { query = search.value; clearTimeout(searchT); searchT = setTimeout(refresh, 200); });
      search.addEventListener("keydown", (e) => e.stopPropagation());
      parts.push(tabs, search);
    }
    parts.push(box);
    const prev = listBox; listBox = box;
    await refresh();
    if (seq !== buildSeq) return;                 // a newer section was picked meanwhile
    body.className = "ap-body" + (section === "players" ? " with-head" : "");
    body.replaceChildren(...parts);
    void prev;
  }
  async function refresh() {
    const box = listBox; if (!box) return;
    try {
      let rows;
      if (section === "players") rows = await Api.get("/game/admin/players?list=" + list + "&q=" + encodeURIComponent(query.trim()));
      else if (section === "reports") rows = await Api.get("/game/admin/reports");
      else if (openAppeal) rows = await Api.get("/game/admin/appeal/" + openAppeal);
      else rows = await Api.get("/game/admin/appeals");
      if (box !== listBox) return;
      if (section === "players") drawPlayers(rows); else if (section === "reports") drawReports(rows); else if (openAppeal) drawAppeal(rows); else drawAppeals(rows);
    } catch (e) { if (box === listBox) box.replaceChildren($("p", "ap-err", e.message)); }
  }

  // ---- players: a table, so the columns (and the window) are as wide as what's in them ----
  function drawPlayers(rows) {
    if (!rows.length) { listBox.replaceChildren($("p", "ap-dim", list === "online" ? "No one online." : "No one.")); return; }
    const t = $("table", "ap-table"), tb = $("tbody");
    for (const p of rows) {
      const tr = $("tr");
      const name = $("td", "ap-mono" + (p.side ? " " + p.side : ""), p.name.slice(0, 20)); name.title = p.name;
      const tot = p.totals || {};
      // (owner) a Mute and a Ban tag on every row: grayed unless running (mute yellow, ban red); inside it, the time left while
      // it runs, else the total time they've spent under it (nothing if never)
      const cell = (label, active, cls, total) => { const td = $("td", "ap-cell");
        td.appendChild($("span", "ap-tag " + cls + (active ? "" : " off"), active ? label + " " + left(active) : total ? label + " " + dur(total) : label)); return td; };
      const mute = cell("Mute", p.mute, "mute", tot.muted), ban = cell("Ban", p.ban, "ban", tot.banned);
      const last = $("td", "ap-dim", p.online ? "now" : ago(p.lastPlayed));
      const d = $("td"), b = $("button", "", "Discipline"); b.addEventListener("click", () => act(p.id, p.name, p)); d.appendChild(b);
      tr.append(name, mute, ban, last, d); tb.appendChild(tr);
    }
    t.appendChild(tb); listBox.replaceChildren(t);
  }

  // ---- the disciplinary panel ----
  const TYPES = [["kick", "Kick"], ["mute", "Mute"], ["ban", "Ban"], ["kill", "Kill"], ["respawn", "Respawn"], ["tpme", "Teleport to me"], ["tpto", "Teleport to player"]];
  const REASONS = { mute: ["Language", "Spam"], ban: ["Language", "Spam", "Disruptive Behavior"] };
  const NOTCHES = [[5, "5 min"], [30, "30 min"], [360, "6 h"], [1440, "1 day"], [4320, "3 days"], [10080, "7 days"], [null, "Indefinite"]];
  let disc = null;
  async function act(id, name, state) {
    if (!disc) { disc = $("div"); disc.id = "disc-panel"; disc.hidden = true; document.body.appendChild(disc); }
    if (!state) { try { state = await Api.get("/game/admin/player/" + id); name = state.name || name; } catch { state = {}; } }
    const types = [...TYPES, ...(state.mute ? [["unmute", "Unmute"]] : []), ...(state.ban ? [["unban", "Unban"]] : [])];
    let type = "kick", reason = null, notch = 0;
    const box = $("div", "dp-box"), title = $("p", "dp-title", name);
    const typeRow = $("div", "dp-seg"), reasonWrap = $("div", "dp-row"), reasonRow = $("div", "dp-seg"), lenWrap = $("div", "dp-row");
    const slider = $("input"); slider.type = "range"; slider.min = "0"; slider.max = String(NOTCHES.length - 1); slider.step = "1"; slider.value = "0";
    const ticks = $("div", "dp-ticks"); for (const [, l] of NOTCHES) ticks.appendChild($("span", "", l));
    const noteWrap = $("div", "dp-row"), noteBtn = $("button", "", "Add note"), note = $("input"); note.maxLength = 300; note.hidden = true;
    const e = $("p", "ap-err"); e.hidden = true;
    const cancel = $("button", "", "Cancel"), ok = $("button", "dp-ok", "Accept");
    const seg = (row, items, cur, pick) => { row.replaceChildren(...items.map(([k, l]) => { const b = $("button", k === cur ? "on" : "", l); b.addEventListener("click", () => pick(k)); return b; })); };
    function redraw() {
      seg(typeRow, types, type, (k) => { type = k; reason = REASONS[k] ? REASONS[k][0] : null; redraw(); });
      const rs = REASONS[type];
      reasonWrap.hidden = lenWrap.hidden = !rs;
      noteWrap.hidden = type === "unmute" || type === "unban";
      if (rs) seg(reasonRow, rs.map((r) => [r, r]), reason, (k) => { reason = k; redraw(); });
      [...ticks.children].forEach((t, i) => t.classList.toggle("on", i === notch));
    }
    slider.addEventListener("input", () => { notch = +slider.value; redraw(); });
    noteBtn.addEventListener("click", () => { note.hidden = !note.hidden; if (!note.hidden) note.focus(); });
    note.addEventListener("keydown", (ev) => ev.stopPropagation());
    cancel.addEventListener("click", () => { disc.hidden = true; });
    ok.addEventListener("click", async () => {
      ok.disabled = true; e.hidden = true;
      try {
        if (type === "unmute" || type === "unban") await Api.post("/game/admin/" + type, { id });
        else {
          const data = { id, type, note: note.hidden ? "" : note.value };
          if (REASONS[type]) { data.reason = reason; data.minutes = NOTCHES[notch][0]; }
          await Api.post("/game/admin/act", data);
        }
        disc.hidden = true; if (root && !root.hidden) refresh();
      } catch (x) { err(e, x); ok.disabled = false; }
    });
    reasonWrap.append($("span", "dp-label", "Reason"), reasonRow);
    lenWrap.append($("span", "dp-label", "Length"), $("div", "dp-len"));
    lenWrap.lastChild.append(slider, ticks);
    const typeWrap = $("div", "dp-row"); typeWrap.append($("span", "dp-label", "Type"), typeRow);
    noteWrap.append(noteBtn, note);
    const btns = $("div", "dp-btns"); btns.append(cancel, ok);
    box.append(title, typeWrap, reasonWrap, lenWrap, noteWrap, e, btns);
    disc.replaceChildren(box); disc.hidden = false; redraw();
  }

  // ---- reports ----
  function drawReports(rows) {
    const t = $("div", "ap-list");
    if (!rows.length) t.appendChild($("p", "ap-dim", "No reports."));
    for (const r of rows) {
      const row = $("div", "ap-row ap-click");
      row.append($("span", "ap-name", r.targetName), $("span", "ap-st", r.status + " · " + when(r.at) + " · " + r.reporter), $("span", "ap-last", r.text));
      const more = $("div", "ap-form ap-report"); more.hidden = true;
      more.append($("p", "ap-text", r.reporter + ": " + r.text));
      const lines = $("div", "ap-lines");
      for (const l of r.chat) { const p = $("p"); p.append($("span", "ap-dim", when(l.at) + " [" + ({ side: "Faction", global: "World", whisper: "Whisper" }[l.ch] || l.ch) + "] "), document.createTextNode(l.text)); lines.appendChild(p); }
      if (r.chat.length) more.append(lines);
      const btns = $("div", "dp-seg");
      if (r.target) { const a = $("button", "", "Discipline"); a.addEventListener("click", (e) => { e.stopPropagation(); act(r.target, r.targetName); }); btns.append(a); }
      if (r.status === "open") { const c = $("button", "", "Close"); c.addEventListener("click", async (e) => { e.stopPropagation(); try { await Api.post("/game/admin/report/close", { id: r.id }); refresh(); } catch {} }); btns.append(c); }
      more.append(btns);
      row.addEventListener("click", () => { more.hidden = !more.hidden; });
      t.append(row, more);
    }
    listBox.replaceChildren(t);
  }

  // ---- appeals ----
  function drawAppeals(rows) {
    const t = $("div", "ap-list");
    if (!rows.length) t.appendChild($("p", "ap-dim", "No appeals."));
    for (const a of rows) {
      const row = $("div", "ap-row ap-click");
      row.append($("span", "ap-name", a.name), $("span", "ap-st", a.status + " · " + when(a.at)), $("span", "ap-last", a.last ? (a.last.admin ? "Admin: " : "") + a.last.text : ""));
      row.addEventListener("click", () => { openAppeal = a.id; refresh(); });
      t.appendChild(row);
    }
    listBox.replaceChildren(t);
  }
  function drawAppeal(a) {
    const wrap = $("div", "ap-appeal"), back = $("button", "", "Back"); back.addEventListener("click", () => { openAppeal = null; refresh(); });
    wrap.append(back, $("p", "ap-title", a.name + " · " + a.status), $("p", "ap-dim", "Ban: " + (a.banReason || "")));
    const lines = $("div", "ap-lines");
    for (const l of a.lines) { const p = $("p", l.admin ? "admin" : ""); p.append($("span", "ap-dim", when(l.at) + " "), $("b", "", l.name + ": "), document.createTextNode(l.text)); lines.appendChild(p); }
    wrap.appendChild(lines);
    if (a.status === "open") {
      const e = $("p", "ap-err"); e.hidden = true;
      const say = $("form", "ap-form"), text = $("input"); text.placeholder = "Reply"; text.maxLength = 1000;
      text.addEventListener("keydown", (ev) => ev.stopPropagation());
      const send = $("button", "", "Send"); send.type = "submit"; say.append(text, send);
      say.addEventListener("submit", async (ev) => { ev.preventDefault(); if (!text.value.trim()) return; try { await Api.post("/game/admin/appeal/say", { id: a.id, text: text.value }); refresh(); } catch (x) { err(e, x); } });
      const dec = $("form", "ap-form"), reason = $("input"); reason.placeholder = "Note"; reason.maxLength = 500;
      reason.addEventListener("keydown", (ev) => ev.stopPropagation());
      const acc = $("button", "", "Accept"), den = $("button", "", "Deny"); acc.type = den.type = "button";
      const decide = async (accept) => { try { await Api.post("/game/admin/appeal", { id: a.id, accept, reason: reason.value }); refresh(); } catch (x) { err(e, x); } };
      acc.addEventListener("click", () => decide(true)); den.addEventListener("click", () => decide(false));
      dec.append(reason, acc, den);
      wrap.append(say, dec, e);
    }
    listBox.replaceChildren(wrap);
    lines.scrollTop = lines.scrollHeight;
  }

  function open(id) { act(String(id), ""); }
  window.AdminPanel = { mount, open, act };
})();
