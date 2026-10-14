// (owner, 2026-10-13) The admin panel: an Admin button (top right) for staff accounts opens it. Being logged in as a staff
// account is enough (no second password). Three tabs: Players (online players, plus anyone banned or muted: Action opens
// the disciplinary panel; Unban / Unmute lift at once), Reports (players' reports with the reported player's recent chat)
// and Appeals (ban appeals: read, reply, accept or deny). The disciplinary panel is its own window (AdminPanel.act(id,
// name), also the Admin item on a name in chat): Type (kick, mute, ban, kill, respawn, teleport to me, teleport to player),
// a reason from a list for mutes and bans, a length slider (5 min, 30 min, 6 h, 1 day, 3 days, 7 days, indefinite), an
// optional note to the player, Cancel / Accept. Text is always inserted as text. Talks to /game/admin/* (server admin.js).
(function () {
  const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const when = (t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const length = (x) => (x.perm ? "permanent" : "until " + when(x.until));
  let root, body, tabBtns = {}, tab = "players", openAppeal = null, focus = null, timer = 0;

  function mount() {
    if (root) return;
    const btn = $("button", "", "Admin"); btn.id = "admin-btn"; document.body.appendChild(btn);
    root = $("div"); root.id = "admin-panel"; root.hidden = true;
    const head = $("div", "ap-head"), tabs = $("div", "ap-tabs");
    for (const [k, label] of [["players", "Players"], ["reports", "Reports"], ["appeals", "Appeals"]]) { const b = $("button", "", label); b.addEventListener("click", () => { tab = k; openAppeal = null; focus = null; draw(); }); tabBtns[k] = b; tabs.appendChild(b); }
    const x = $("button", "ap-x", "×"); x.title = "Close"; x.addEventListener("click", () => toggle(false));
    head.append(tabs, x); body = $("div", "ap-body"); root.append(head, body); document.body.appendChild(root);
    btn.addEventListener("click", () => toggle());
  }
  function toggle(open) {
    root.hidden = open === undefined ? !root.hidden : !open;
    clearInterval(timer);
    if (!root.hidden) { draw(); timer = setInterval(() => { if (!document.activeElement || !root.contains(document.activeElement)) draw(); }, 5000); }
  }
  const err = (box, e) => { box.textContent = e && e.message ? e.message : String(e); box.hidden = false; };

  async function draw() {
    for (const k in tabBtns) tabBtns[k].classList.toggle("on", k === tab);
    try { if (tab === "players") drawPlayers(await Api.get("/game/admin/players" + (focus ? "?focus=" + focus : ""))); else if (tab === "reports") drawReports(await Api.get("/game/admin/reports")); else if (openAppeal) drawAppeal(await Api.get("/game/admin/appeal/" + openAppeal)); else drawAppeals(await Api.get("/game/admin/appeals")); }
    catch (e) { body.replaceChildren($("p", "ap-err", e.message)); }
  }

  // ---- players ----
  function drawPlayers(list) {
    const t = $("div", "ap-list");
    if (!list.length) t.appendChild($("p", "ap-dim", "No one online."));
    for (const p of list) {
      const row = $("div", "ap-row"), name = $("span", "ap-name" + (p.side ? " " + p.side : ""), p.name);
      const st = $("span", "ap-st", [p.online ? "" : "offline", p.ban ? "banned " + length(p.ban) : "", p.mute ? "muted " + length(p.mute) : ""].filter(Boolean).join(" · "));
      const acts = $("span", "ap-acts");
      { const a = $("button", "", "Action"); a.addEventListener("click", () => act(p.id, p.name)); acts.appendChild(a); }
      if (!p.staff) {
        if (p.ban) acts.appendChild(lift("Unban", p, "unban"));
        if (p.mute) acts.appendChild(lift("Unmute", p, "unmute"));
      }
      if (focus && p.id === focus) row.classList.add("ap-focus");
      row.append(name, st, acts); t.appendChild(row);
    }
    body.replaceChildren(t);
    const f = t.querySelector(".ap-focus"); if (f) f.scrollIntoView({ block: "nearest" });
  }
  function lift(label, p, path) {
    const b = $("button", "", label);
    b.addEventListener("click", async () => { b.disabled = true; try { await Api.post("/game/admin/" + path, { id: p.id }); } catch {} draw(); });
    return b;
  }

  // ---- the disciplinary panel ----
  const TYPES = [["kick", "Kick"], ["mute", "Mute"], ["ban", "Ban"], ["kill", "Kill"], ["respawn", "Respawn"], ["tpme", "Teleport to me"], ["tpto", "Teleport to player"]];
  const REASONS = { mute: ["Language", "Spam"], ban: ["Language", "Spam", "Disruptive Behavior"] };
  const NOTCHES = [[5, "5 min"], [30, "30 min"], [360, "6 h"], [1440, "1 day"], [4320, "3 days"], [10080, "7 days"], [null, "Indefinite"]];
  let disc = null;
  function act(id, name) {
    if (!disc) { disc = $("div"); disc.id = "disc-panel"; disc.hidden = true; document.body.appendChild(disc); }
    let type = "kick", reason = null, notch = 0;
    const box = $("div", "dp-box"), title = $("p", "dp-title", name);
    const typeRow = $("div", "dp-seg"), reasonWrap = $("div", "dp-row"), reasonRow = $("div", "dp-seg"), lenWrap = $("div", "dp-row");
    const slider = $("input"); slider.type = "range"; slider.min = "0"; slider.max = String(NOTCHES.length - 1); slider.step = "1"; slider.value = "0";
    const ticks = $("div", "dp-ticks"); for (const [, l] of NOTCHES) ticks.appendChild($("span", "", l));
    const noteBtn = $("button", "", "Add note"), note = $("input"); note.maxLength = 300; note.hidden = true;
    const e = $("p", "ap-err"); e.hidden = true;
    const cancel = $("button", "", "Cancel"), ok = $("button", "dp-ok", "Accept");
    const seg = (row, items, cur, pick) => { row.replaceChildren(...items.map(([k, l]) => { const b = $("button", k === cur ? "on" : "", l); b.addEventListener("click", () => pick(k)); return b; })); };
    function redraw() {
      seg(typeRow, TYPES, type, (k) => { type = k; reason = REASONS[k] ? REASONS[k][0] : null; redraw(); });
      const rs = REASONS[type];
      reasonWrap.hidden = lenWrap.hidden = !rs;
      if (rs) seg(reasonRow, rs.map((r) => [r, r]), reason, (k) => { reason = k; redraw(); });
      [...ticks.children].forEach((t, i) => t.classList.toggle("on", i === notch));
    }
    slider.addEventListener("input", () => { notch = +slider.value; redraw(); });
    noteBtn.addEventListener("click", () => { note.hidden = !note.hidden; if (!note.hidden) note.focus(); });
    note.addEventListener("keydown", (ev) => ev.stopPropagation());
    cancel.addEventListener("click", () => { disc.hidden = true; });
    ok.addEventListener("click", async () => {
      ok.disabled = true; e.hidden = true;
      const data = { id, type, note: note.hidden ? "" : note.value };
      if (REASONS[type]) { data.reason = reason; data.minutes = NOTCHES[notch][0]; }
      try { await Api.post("/game/admin/act", data); disc.hidden = true; if (root && !root.hidden) draw(); } catch (x) { err(e, x); ok.disabled = false; }
    });
    reasonWrap.append($("span", "dp-label", "Reason"), reasonRow);
    lenWrap.append($("span", "dp-label", "Length"), $("div", "dp-len"));
    lenWrap.lastChild.append(slider, ticks);
    const typeWrap = $("div", "dp-row"); typeWrap.append($("span", "dp-label", "Type"), typeRow);
    const noteWrap = $("div", "dp-row"); noteWrap.append(noteBtn, note);
    const btns = $("div", "dp-btns"); btns.append(cancel, ok);
    box.append(title, typeWrap, reasonWrap, lenWrap, noteWrap, e, btns);
    disc.replaceChildren(box); disc.hidden = false; redraw();
  }

  // ---- reports ----
  function drawReports(list) {
    const t = $("div", "ap-list");
    if (!list.length) t.appendChild($("p", "ap-dim", "No reports."));
    for (const r of list) {
      const row = $("div", "ap-row ap-click");
      row.append($("span", "ap-name", r.targetName), $("span", "ap-st", r.status + " · " + when(r.at) + " · " + r.reporter), $("span", "ap-last", r.text));
      const more = $("div", "ap-form ap-report"); more.hidden = true;
      more.append($("p", "ap-text", r.reporter + ": " + r.text));
      const lines = $("div", "ap-lines");
      for (const l of r.chat) { const p = $("p"); p.append($("span", "ap-dim", when(l.at) + " [" + ({ side: "Faction", global: "World", whisper: "Whisper" }[l.ch] || l.ch) + "] "), document.createTextNode(l.text)); lines.appendChild(p); }
      if (r.chat.length) more.append(lines);
      if (r.target) { const a = $("button", "", "Action"); a.addEventListener("click", (e) => { e.stopPropagation(); act(r.target, r.targetName); }); more.append(a); }
      if (r.status === "open") { const c = $("button", "", "Close"); c.addEventListener("click", async (e) => { e.stopPropagation(); try { await Api.post("/game/admin/report/close", { id: r.id }); draw(); } catch {} }); more.append(c); }
      row.addEventListener("click", () => { more.hidden = !more.hidden; });
      t.append(row, more);
    }
    body.replaceChildren(t);
  }

  // ---- appeals ----
  function drawAppeals(list) {
    const t = $("div", "ap-list");
    if (!list.length) t.appendChild($("p", "ap-dim", "No appeals."));
    for (const a of list) {
      const row = $("div", "ap-row ap-click");
      row.append($("span", "ap-name", a.name), $("span", "ap-st", a.status + " · " + when(a.at)), $("span", "ap-last", a.last ? (a.last.admin ? "Admin: " : "") + a.last.text : ""));
      row.addEventListener("click", () => { openAppeal = a.id; draw(); });
      t.appendChild(row);
    }
    body.replaceChildren(t);
  }
  function drawAppeal(a) {
    const wrap = $("div", "ap-appeal"), back = $("button", "", "Back"); back.addEventListener("click", () => { openAppeal = null; draw(); });
    wrap.append(back, $("p", "ap-title", a.name + " · " + a.status), $("p", "ap-dim", "Ban: " + (a.banReason || "")));
    const lines = $("div", "ap-lines");
    for (const l of a.lines) { const p = $("p", l.admin ? "admin" : ""); p.append($("span", "ap-dim", when(l.at) + " "), $("b", "", l.name + ": "), document.createTextNode(l.text)); lines.appendChild(p); }
    wrap.appendChild(lines);
    if (a.status === "open") {
      const e = $("p", "ap-err"); e.hidden = true;
      const say = $("form", "ap-form"), text = $("input"); text.placeholder = "Reply"; text.maxLength = 1000;
      const send = $("button", "", "Send"); send.type = "submit"; say.append(text, send);
      say.addEventListener("submit", async (ev) => { ev.preventDefault(); if (!text.value.trim()) return; try { await Api.post("/game/admin/appeal/say", { id: a.id, text: text.value }); draw(); } catch (x) { err(e, x); } });
      const dec = $("form", "ap-form"), reason = $("input"); reason.placeholder = "Note"; reason.maxLength = 500;
      const acc = $("button", "", "Accept"), den = $("button", "", "Deny"); acc.type = den.type = "button";
      const decide = async (accept) => { try { await Api.post("/game/admin/appeal", { id: a.id, accept, reason: reason.value }); draw(); } catch (x) { err(e, x); } };
      acc.addEventListener("click", () => decide(true)); den.addEventListener("click", () => decide(false));
      dec.append(reason, acc, den);
      wrap.append(say, dec, e);
    }
    body.replaceChildren(wrap);
    lines.scrollTop = lines.scrollHeight;
  }

  function open(id) { if (!root) return; tab = "players"; openAppeal = null; focus = String(id); toggle(true); }
  window.AdminPanel = { mount, open, act };
})();
