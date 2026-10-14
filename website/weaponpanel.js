// (owner, 2026-10-14) The Weapon panel (staff: Nyssary and admins): Z, or the [Z] button left of [X], opens it. Pick a
// weapon in the dropdown to change it, or leave it on "New weapon" to make one from the fields. The name changes in the
// dropdown as it's typed. CHANGE / CREATE saves it on the server (for everyone) and equips it on my ship, and the panel
// stays open showing it as saved; CANCEL closes without saving. Every field is checked again on the server. game3d.js hands it the weapon list and a send function.
(function () {
  const FIELDS = [
    ["optimal", "Optimal Range", 10], ["falloff", "Falloff Rate", 1], ["life", "Lifetime", 0.01], ["speed", "Speed", 10],
    ["rate", "Shot Rate", 0.01], ["dmg", "Damage", 1], ["spread0", "Default Spread", 0.1], ["spreadAdd", "Spread Per Shot", 0.1],
    ["aimSpeed", "Aim Speed", 0.1], ["rotSpeed", "Rotation Speed", 1], ["reload", "Reload Speed", 0.1], ["mag", "Magazine", 1],
  ];
  const DEF = { name: "", type: "bullet", optimal: 0, falloff: 0, life: 0, speed: 0, rate: 0, dmg: 0, spread0: 0, spreadAdd: 0, aimSpeed: 0, rotSpeed: 0, reload: 0, mag: 0 };   // (owner: a new weapon starts at 0 all round)
  const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let api = null, win = null, btn = null, sel, nameIn, typeSel, inputs = {}, okBtn, errEl, current = "", busy = false;

  function mount(a) {
    api = a; if (win) return;
    btn = $("button", "", "Z"); btn.id = "weapon-btn"; btn.type = "button"; btn.title = "Weapons";
    const row = document.getElementById("chat-row"); if (row) row.insertBefore(btn, row.firstChild); else document.body.appendChild(btn);
    btn.addEventListener("click", () => toggle());
    win = $("div"); win.id = "weapon-edit"; win.hidden = true;
    const grid = $("div", "we-grid");
    const field = (label, el) => { grid.append($("label", "we-label", label), el); };
    sel = $("select"); sel.addEventListener("change", () => { current = sel.value; fill(); });
    nameIn = $("input"); nameIn.maxLength = 32; nameIn.addEventListener("input", () => { const o = sel.selectedOptions[0]; if (o && o.value) o.textContent = nameIn.value || "?"; });
    typeSel = $("select"); typeSel.append(new Option("bullet", "bullet"));
    field("Weapon", sel); field("Name", nameIn); field("Type", typeSel);
    for (const [k, label, step] of FIELDS) { const i = $("input"); i.type = "number"; i.step = String(step); inputs[k] = i; field(label, i); }
    errEl = $("p", "we-err"); errEl.hidden = true;
    const btns = $("div", "we-btns"), cancel = $("button", "", "CANCEL"); okBtn = $("button", "we-ok", "CHANGE");
    cancel.type = okBtn.type = "button";
    cancel.addEventListener("click", () => toggle(false));
    okBtn.addEventListener("click", save);
    btns.append(cancel, okBtn);
    // (owner, 2026-10-14) dragged by its top bar (like the Object Editor's); it stays where it's put while the page is open
    const top = $("div", "we-top"); top.append($("span", "we-title", "WEAPONS"));
    top.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; e.preventDefault();
      const r0 = win.getBoundingClientRect(), ox = e.clientX - r0.left, oy = e.clientY - r0.top;
      win.style.transform = "none"; win.style.left = r0.left + "px"; win.style.top = r0.top + "px";
      const move = (ev) => { const r = win.getBoundingClientRect();
        win.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - ox)) + "px"; win.style.top = Math.max(0, Math.min(innerHeight - r.height, ev.clientY - oy)) + "px"; };
      const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
      addEventListener("pointermove", move); addEventListener("pointerup", up);
    });
    win.append(top, grid, errEl, btns); document.body.appendChild(win);
    win.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") toggle(false); });   // typing here never steers the ship
    addEventListener("keydown", (e) => {
      if (e.code !== "KeyZ" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = document.activeElement; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      e.preventDefault(); toggle();
    });
  }
  function options() {
    const list = api.list();
    sel.replaceChildren(new Option("New weapon", ""), ...list.map((w) => new Option(w.name, w.id)));
    if (current && !list.some((w) => w.id === current)) current = "";
    sel.value = current;
  }
  function fill() {
    const w = api.list().find((x) => x.id === current) || DEF;
    nameIn.value = w.name; typeSel.value = w.type || "bullet";
    for (const [k] of FIELDS) inputs[k].value = String(w[k]);
    okBtn.textContent = current ? "CHANGE" : "CREATE"; errEl.hidden = true;
  }
  function toggle(open) {
    if (!win) return;
    const show = open === undefined ? win.hidden : !!open;
    win.hidden = !show; btn.classList.toggle("on", show);
    if (show) { current = api.current() || current; options(); fill(); }
  }
  function save() {
    if (busy) return;
    const w = { name: nameIn.value.trim(), type: typeSel.value };
    if (!w.name) { errEl.textContent = "Give it a name."; errEl.hidden = false; return; }
    for (const [k] of FIELDS) w[k] = Number(inputs[k].value);
    busy = true; okBtn.disabled = true; errEl.hidden = true;
    api.send({ t: "wset", ...(current ? { id: current } : {}), w });
  }
  // the server's answer: saved (now equipped) or refused
  function saved(m) {
    busy = false; if (okBtn) okBtn.disabled = false;
    if (m.error) { errEl.textContent = m.error; errEl.hidden = false; return; }
    current = m.id; if (win && !win.hidden) { options(); fill(); }   // (owner) the panel stays open, showing what was saved
  }
  function refresh() { if (win && !win.hidden && !busy) { options(); } }
  window.WeaponPanel = { mount, refresh, saved, toggle };
})();
