// (owner, 2026-10-14) The Weapon panel (staff: Nyssary and admins): Z, or the [Z] button left of [X], opens it. Pick a
// weapon in the dropdown to change it, or leave it on "New weapon" to make one from the fields. The name changes in the
// dropdown as it's typed. CHANGE / CREATE saves it on the server (for everyone) and equips it on my ship, and the panel
// stays open showing it as saved; CANCEL closes without saving. Every field is checked again on the server. game3d.js
// hands it the weapon list and a send function. (owner, 2026-10-14) ENTER in a field saves too. Each weapon's stats when
// the panel opened are its defaults while it stays open: a field that differs from them is outlined green if the change
// is better, red if worse, white if it's neither (name, type). REVERT (next to CHANGE / CREATE) puts the weapon back to
// its defaults (a weapon made while the panel is open goes away again). Closing the panel makes the stats as they are
// the new defaults.
(function () {
  const FIELDS = [
    ["optimal", "Optimal Range", 10], ["falloff", "Falloff Rate", 1], ["life", "Lifetime", 0.01], ["speed", "Speed", 10],
    ["rate", "Shot Rate", 0.01], ["dmg", "Damage", 1], ["spread0", "Default Spread", 0.1], ["spreadAdd", "Spread Per Shot", 0.1],
    ["aimSpeed", "Aim Speed", 0.1], ["rotSpeed", "Rotation Speed", 1], ["reload", "Reload Speed", 0.1], ["mag", "Magazine", 1],
  ];
  const DEF = { name: "", type: "bullet", optimal: 0, falloff: 0, life: 0, speed: 0, rate: 0, dmg: 0, spread0: 0, spreadAdd: 0, aimSpeed: 0, rotSpeed: 0, reload: 0, mag: 0 };   // (owner: a new weapon starts at 0 all round)
  const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let api = null, win = null, btn = null, sel, nameIn, typeSel, inputs = {}, okBtn, errEl, current = "", busy = false;
  const base = new Map();                       // weapon id -> its stats when the panel opened (its defaults while it's open)
  // which way is better for each number: +1 more is better, -1 less is better
  const BETTER = { optimal: 1, falloff: -1, life: 1, speed: 1, rate: -1, dmg: 1, spread0: -1, spreadAdd: -1, aimSpeed: 1, rotSpeed: 1, reload: -1, mag: 1 };

  function mount(a) {
    api = a; if (win) return;
    btn = $("button", "", "Z"); btn.id = "weapon-btn"; btn.type = "button"; btn.title = "Weapons";
    (document.getElementById("staff-col") || document.body).appendChild(btn);   // (owner, 2026-10-14) the staff column on the right edge
    btn.addEventListener("click", () => toggle());
    win = $("div"); win.id = "weapon-edit"; win.hidden = true;
    const grid = $("div", "we-grid");
    const field = (label, el) => { grid.append($("label", "we-label", label), el); };
    sel = $("select"); sel.addEventListener("change", () => { current = sel.value; fill(); });
    nameIn = $("input"); nameIn.maxLength = 32; nameIn.addEventListener("input", () => { const o = sel.selectedOptions[0]; if (o && o.value) o.textContent = nameIn.value || "?"; });
    typeSel = $("select"); typeSel.append(new Option("bullet", "bullet"));
    field("Weapon", sel); field("Name", nameIn); field("Type", typeSel);
    for (const [k, label, step] of FIELDS) { const i = $("input"); i.type = "number"; i.step = String(step); inputs[k] = i; field(label, i); i.addEventListener("input", marks); }
    nameIn.addEventListener("input", marks); typeSel.addEventListener("change", marks);
    errEl = $("p", "we-err"); errEl.hidden = true;
    const btns = $("div", "we-btns"), cancel = $("button", "", "CANCEL"), revert = $("button", "", "REVERT"); okBtn = $("button", "we-ok", "CHANGE");
    cancel.type = revert.type = okBtn.type = "button";
    cancel.addEventListener("click", () => toggle(false));
    revert.addEventListener("click", undo);
    okBtn.addEventListener("click", save);
    btns.append(cancel, revert, okBtn);
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
    win.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") toggle(false);   // typing here never steers the ship
      if (e.key === "Enter" && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) { e.preventDefault(); save(); } });   // (owner) ENTER applies
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
    okBtn.textContent = current ? "CHANGE" : "CREATE"; errEl.hidden = true; marks();
  }
  // the outlines: each field against the weapon's defaults (none for a weapon that wasn't there when the panel opened)
  function marks() {
    const b = current && base.get(current);
    const set = (el, c) => { el.classList.remove("we-up", "we-down", "we-diff"); if (c) el.classList.add(c); };
    set(nameIn, b && nameIn.value.trim() !== b.name ? "we-diff" : null); set(typeSel, b && typeSel.value !== b.type ? "we-diff" : null);
    for (const [k] of FIELDS) {
      const v = Number(inputs[k].value), d = b ? v - b[k] : 0;
      set(inputs[k], !b || !Number.isFinite(v) || Math.abs(d) < 1e-9 ? null : d * BETTER[k] > 0 ? "we-up" : "we-down");
    }
  }
  function toggle(open) {
    if (!win) return;
    const show = open === undefined ? win.hidden : !!open;
    win.hidden = !show; btn.classList.toggle("on", show);
    base.clear();                              // (closed: what's there now is the next opening's defaults)
    if (!show && document.activeElement && win.contains(document.activeElement)) document.activeElement.blur();   // (closed: the keys go back to the game)
    if (show) { for (const w of api.list()) base.set(w.id, strip(w)); current = api.current() || current; options(); fill(); }
  }
  function save() {
    if (busy) return;
    const w = { name: nameIn.value.trim(), type: typeSel.value };
    if (!w.name) { errEl.textContent = "Give it a name."; errEl.hidden = false; return; }
    for (const [k] of FIELDS) w[k] = Number(inputs[k].value);
    busy = true; okBtn.disabled = true; errEl.hidden = true;
    api.send({ t: "wset", ...(current ? { id: current } : {}), w });
  }
  const strip = (w) => { const o = { name: w.name, type: w.type }; for (const [k] of FIELDS) o[k] = w[k]; return o; };
  function undo() {
    if (busy) return;
    if (!current) { fill(); return; }          // "New weapon": the fields back to 0s
    const b = base.get(current), now = api.list().find((x) => x.id === current);
    busy = true; okBtn.disabled = true; errEl.hidden = true;
    if (!b) { api.send({ t: "wdel", id: current }); return; }      // made while the panel's open: gone again
    if (now && FIELDS.every(([k]) => now[k] === b[k]) && now.name === b.name && now.type === b.type) { busy = false; okBtn.disabled = false; fill(); return; }   // saved as the defaults: just the fields
    api.send({ t: "wset", id: current, w: b });
  }
  // the server's answer: saved (now equipped) or refused
  function saved(m) {
    busy = false; if (okBtn) okBtn.disabled = false;
    if (m.error) { errEl.textContent = m.error; errEl.hidden = false; return; }
    if (m.deleted) current = ""; else current = m.id;
    if (win && !win.hidden) { options(); fill(); }   // (owner) the panel stays open, showing what was saved
  }
  function refresh() { if (win && !win.hidden && !busy) { options(); } }
  window.WeaponPanel = { mount, refresh, saved, toggle };
})();
