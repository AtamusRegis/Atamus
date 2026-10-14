// (owner, 2026-10-13) The admin panel: an Admin button (top right) for staff accounts opens it. Being logged in as a staff
// account is enough (no second password). Two tabs: Players (online players, plus anyone banned or muted: kick, ban,
// unban, mute, unmute, each with a reason) and Appeals (ban appeals: read, reply, accept or deny). Text is always
// inserted as text. Talks to /game/admin/* on the server (packages/server/src/admin.js).
(function () {
  const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const when = (t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const length = (x) => (x.perm ? "permanent" : "until " + when(x.until));
  let root, body, tabBtns = {}, tab = "players", openAppeal = null, timer = 0;

  function mount() {
    if (root) return;
    const btn = $("button", "", "Admin"); btn.id = "admin-btn"; document.body.appendChild(btn);
    root = $("div"); root.id = "admin-panel"; root.hidden = true;
    const head = $("div", "ap-head"), tabs = $("div", "ap-tabs");
    for (const [k, label] of [["players", "Players"], ["appeals", "Appeals"]]) { const b = $("button", "", label); b.addEventListener("click", () => { tab = k; openAppeal = null; draw(); }); tabBtns[k] = b; tabs.appendChild(b); }
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
    try { if (tab === "players") drawPlayers(await Api.get("/game/admin/players")); else if (openAppeal) drawAppeal(await Api.get("/game/admin/appeal/" + openAppeal)); else drawAppeals(await Api.get("/game/admin/appeals")); }
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
      if (!p.staff) {
        if (p.online) acts.appendChild(action("Kick", p, "kick", false));
        acts.appendChild(p.ban ? action("Unban", p, "unban", false) : action("Ban", p, "ban", true));
        acts.appendChild(p.mute ? action("Unmute", p, "unmute", false) : action("Mute", p, "mute", true));
      }
      row.append(name, st, acts); t.appendChild(row);
    }
    body.replaceChildren(t);
  }
  function action(label, p, path, timed) {
    const b = $("button", "", label);
    b.addEventListener("click", () => {
      const row = b.closest(".ap-row"); const old = row.nextElementSibling; if (old && old.classList.contains("ap-form")) old.remove();
      const f = $("form", "ap-form"), reason = $("input"); reason.placeholder = "Reason"; reason.maxLength = 500;
      f.append($("b", "", label + " " + p.name), reason);
      let amount, unit;
      if (timed) {
        amount = $("input"); amount.type = "number"; amount.min = "1"; amount.max = "3650"; amount.value = "1"; amount.className = "ap-n";
        unit = $("select"); for (const [v, l] of [["hours", "hours"], ["days", "days"], ["perm", "permanent"]]) { const o = $("option", "", l); o.value = v; unit.appendChild(o); }
        unit.addEventListener("change", () => { amount.disabled = unit.value === "perm"; });
        f.append(amount, unit);
      }
      const ok = $("button", "", label); ok.type = "submit"; const no = $("button", "", "Cancel"); no.type = "button"; no.addEventListener("click", () => f.remove());
      const e = $("p", "ap-err"); e.hidden = true; f.append(ok, no, e);
      f.addEventListener("submit", async (ev) => {
        ev.preventDefault(); ok.disabled = true;
        const data = { id: p.id, reason: reason.value };
        if (timed) { if (unit.value === "perm") data.perm = true; else { data.amount = +amount.value; data.unit = unit.value; } }
        try { await Api.post("/game/admin/" + path, data); draw(); } catch (x) { err(e, x); ok.disabled = false; }
      });
      row.after(f); reason.focus();
    });
    return b;
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
      const dec = $("form", "ap-form"), reason = $("input"); reason.placeholder = "Reason"; reason.maxLength = 500;
      const acc = $("button", "", "Accept"), den = $("button", "", "Deny"); acc.type = den.type = "button";
      const decide = async (accept) => { try { await Api.post("/game/admin/appeal", { id: a.id, accept, reason: reason.value }); draw(); } catch (x) { err(e, x); } };
      acc.addEventListener("click", () => decide(true)); den.addEventListener("click", () => decide(false));
      dec.append(reason, acc, den);
      wrap.append(say, dec, e);
    }
    body.replaceChildren(wrap);
    lines.scrollTop = lines.scrollHeight;
  }

  window.AdminPanel = { mount };
})();
