// The arsenal (owner, 2026-10-13): weapon and ammo definitions made in the in-game Weapon & Ammo Maker
// (import / export as JSON), the player's inventory (ammo counts) and hotbar loadout (equipped weapon,
// loaded ammo, magazine, reload). Testing data, kept in this browser (atamus.arsenal).
//
// Ammo types: bullet (flies straight for its lifetime), missile (homes on a locked target: the longer the
// target was aimed at, the harder it turns), beam (from the ship to the aim point, continuous, no spread).
// Damage is full out to the weapon's optimal range and loses `falloff` percent per 100 m beyond it.

export const AMMO_FIELDS = [
  { k: "name", t: "text", label: "Name" },
  { k: "type", t: "select", label: "Type", opts: ["bullet", "missile", "beam"] },
  { k: "damage", t: "num", label: "Damage", min: 0, max: 5000, step: 1, unit: (a) => (a.type === "beam" ? "/s" : "/hit") },
  { k: "speed", t: "num", label: "Speed", min: 50, max: 5000, step: 10, unit: "m/s", only: ["bullet", "missile"] },
  { k: "lifetime", t: "num", label: "Lifetime", min: 0.05, max: 10, step: 0.05, unit: "s", only: ["bullet", "missile"] },
  { k: "falloff", t: "num", label: "Dmg falloff", min: 0, max: 100, step: 1, unit: "%/100m" },
  { k: "turn", t: "num", label: "Turn", min: 0, max: 720, step: 5, unit: "°/s", only: ["missile"] },
  { k: "lock", t: "num", label: "Lock time", min: 0.1, max: 10, step: 0.1, unit: "s", only: ["missile"] },
];
export const WEAPON_FIELDS = [
  { k: "name", t: "text", label: "Name" },
  { k: "slot", t: "select", label: "Slot type", opts: [1, 2, 3] },
  { k: "ammo", t: "ammo", label: "Ammo" },
  { k: "range", t: "num", label: "Aim range", min: 10, max: 3000, step: 10, unit: "m" },
  { k: "optimal", t: "num", label: "Optimal", min: 10, max: 5000, step: 10, unit: "m" },
  { k: "falloff", t: "num", label: "Spread falloff", min: 0, max: 10, step: 0.5, unit: "°/100m" },
  { k: "spread", t: "num", label: "Spread", min: 0, max: 90, step: 1, unit: "°" },
  { k: "speed", t: "num", label: "Aim speed", min: 0, max: 180, step: 1, unit: "°/s" },
  { k: "move", t: "num", label: "Move spread", min: 0, max: 180, step: 1, unit: "°/s" },
  { k: "rate", t: "num", label: "Rate", min: 0.5, max: 30, step: 0.5, unit: "/s" },
  { k: "auto", t: "bool", label: "Automatic" },
  { k: "interact", t: "bool", label: "Interaction" },
  { k: "mag", t: "num", label: "Magazine", min: 1, max: 1000, step: 1, unit: "" },
  { k: "reload", t: "num", label: "Reload", min: 0, max: 20, step: 0.1, unit: "s" },
];

const DEFAULT_AMMO = [
  { id: "a_slug", name: "Slug", type: "bullet", damage: 40, speed: 1500, lifetime: 0.6, falloff: 15, turn: 0, lock: 1 },
  { id: "a_seeker", name: "Seeker", type: "missile", damage: 150, speed: 500, lifetime: 4, falloff: 0, turn: 120, lock: 2 },
  { id: "a_cell", name: "Lance Cell", type: "beam", damage: 120, speed: 0, lifetime: 0, falloff: 20, turn: 0, lock: 1 },
];
const DEFAULT_WEAPONS = [
  { id: "w_repeater", name: "Repeater", slot: 1, ammo: ["a_slug"], range: 600, optimal: 400, falloff: 2, spread: 30, speed: 20, move: 10, rate: 8, auto: true, interact: false, mag: 30, reload: 2 },
  { id: "w_launcher", name: "Launcher", slot: 2, ammo: ["a_seeker"], range: 900, optimal: 1200, falloff: 0, spread: 20, speed: 8, move: 6, rate: 1, auto: false, interact: false, mag: 4, reload: 3 },
  { id: "w_lance", name: "Lance", slot: 2, ammo: ["a_cell"], range: 500, optimal: 250, falloff: 0, spread: 0, speed: 0, move: 0, rate: 10, auto: true, interact: false, mag: 100, reload: 2.5 },
  { id: "w_tractor", name: "Tractor", slot: 3, ammo: [], range: 70, optimal: 70, falloff: 0, spread: 45, speed: 60, move: 20, rate: 1, auto: false, interact: true, mag: 1, reload: 0 },
];
const DEFAULT_INV = { a_slug: 600, a_seeker: 24, a_cell: 800 };
const DEFAULT_SLOTS = [{ w: "w_repeater", a: "a_slug", mag: 30 }, { w: "w_launcher", a: "a_seeker", mag: 4 }, { w: "w_tractor", a: null, mag: 0 }];

const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 8);
const clampField = (f, v) => {
  if (f.t === "num") { v = +v; if (!Number.isFinite(v)) v = f.min; return Math.min(f.max, Math.max(f.min, v)); }
  if (f.t === "text") return String(v ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, 32) || "Unnamed";
  if (f.t === "bool") return !!v;
  if (f.t === "select") { const o = f.opts.find((x) => String(x) === String(v)); return o === undefined ? f.opts[0] : o; }
  return v;
};
function cleanAmmo(a) { const o = { id: typeof a.id === "string" && a.id ? a.id.slice(0, 40) : uid("a") }; for (const f of AMMO_FIELDS) o[f.k] = clampField(f, a[f.k] ?? DEFAULT_AMMO[0][f.k]); return o; }
function cleanWeapon(w, ammoIds) {
  const o = { id: typeof w.id === "string" && w.id ? w.id.slice(0, 40) : uid("w") };
  for (const f of WEAPON_FIELDS) o[f.k] = f.t === "ammo" ? (Array.isArray(w.ammo) ? w.ammo.filter((id) => ammoIds.has(id)) : []) : clampField(f, w[f.k] ?? DEFAULT_WEAPONS[0][f.k]);
  return o;
}

export const A = {
  ammo: clone(DEFAULT_AMMO), weapons: clone(DEFAULT_WEAPONS), inv: clone(DEFAULT_INV), slots: clone(DEFAULT_SLOTS),
  listeners: [],
  onChange(fn) { this.listeners.push(fn); },
  changed() { this.save(); for (const fn of this.listeners) fn(); },
  save() { try { localStorage.setItem("atamus.arsenal", JSON.stringify({ v: 1, ammo: this.ammo, weapons: this.weapons, inv: this.inv, slots: this.slots.map((s) => ({ w: s.w, a: s.a, mag: s.mag })) })); } catch {} },
  load() {
    try {
      const sv = JSON.parse(localStorage.getItem("atamus.arsenal") || "null");
      if (!sv || sv.v !== 1) return;
      this.setDefs(sv, true);
      if (sv.inv && typeof sv.inv === "object") { this.inv = {}; for (const a of this.ammo) this.inv[a.id] = Math.max(0, Math.floor(+sv.inv[a.id] || 0)); }
      if (Array.isArray(sv.slots)) this.slots = [0, 1, 2].map((i) => { const s = sv.slots[i] || {}; const w = this.weaponById(s.w); const a = w && w.ammo.includes(s.a) ? s.a : null; return { w: w ? w.id : null, a, mag: a ? Math.max(0, Math.min(w.mag, Math.floor(+s.mag || 0))) : 0 }; });
    } catch {}
  },
  // definitions in (import / load): cleaned and clamped; slots and inventory follow what still exists
  setDefs(d, quiet) {
    if (!d || !Array.isArray(d.ammo) || !Array.isArray(d.weapons)) throw new Error("Expected { weapons: [...], ammo: [...] }");
    const ammo = d.ammo.slice(0, 100).map(cleanAmmo), ids = new Set(ammo.map((a) => a.id));
    const weapons = d.weapons.slice(0, 100).map((w) => cleanWeapon(w, ids));
    this.ammo = ammo; this.weapons = weapons;
    for (const a of ammo) if (!(a.id in this.inv)) this.inv[a.id] = 500;
    for (const k of Object.keys(this.inv)) if (!ids.has(k)) delete this.inv[k];
    this.slots = this.slots.map((s, i) => { const w = this.weaponById(s.w); if (!w || w.slot !== i + 1) return { w: null, a: null, mag: 0 }; const a = w.ammo.includes(s.a) ? s.a : null; return { w: w.id, a, mag: a ? Math.min(s.mag, w.mag) : 0 }; });
    if (!quiet) this.changed();
  },
  exportDefs() { return JSON.stringify({ weapons: this.weapons, ammo: this.ammo }, null, 2); },
  weaponById(id) { return this.weapons.find((w) => w.id === id) || null; },
  ammoById(id) { return this.ammo.find((a) => a.id === id) || null; },
  weapon(i) { const s = this.slots[i]; return s ? this.weaponById(s.w) : null; },
  loaded(i) { const s = this.slots[i]; return s && s.a ? this.ammoById(s.a) : null; },
  reloading(i, now = performance.now()) { const s = this.slots[i]; return !!(s && s.reloadUntil && now < s.reloadUntil); },
  equip(i, wid) {
    const w = this.weaponById(wid), s = this.slots[i]; if (!w || !s || w.slot !== i + 1) return false;
    this.unload(i); s.w = w.id; s.a = null; s.mag = 0; s.reloadUntil = 0; this.changed(); return true;
  },
  unequip(i) { const s = this.slots[i]; if (!s || !s.w) return; this.unload(i); s.w = null; this.changed(); },
  unload(i) { const s = this.slots[i]; if (s && s.a && s.mag > 0) this.inv[s.a] = (this.inv[s.a] || 0) + Math.floor(s.mag); if (s) { s.a = null; s.mag = 0; s.reloadUntil = 0; } },
  // dragging ammo onto a slot loads it at once (the old magazine goes back to the inventory)
  loadAmmo(i, aid) {
    const w = this.weapon(i), s = this.slots[i]; if (!w || !w.ammo.includes(aid)) return false;
    this.unload(i); const take = Math.min(w.mag, this.inv[aid] || 0);
    s.a = aid; s.mag = take; this.inv[aid] = (this.inv[aid] || 0) - take; this.changed(); return true;
  },
  // R: refill the magazine from the inventory over the weapon's reload time
  reload(i, now = performance.now()) {
    const w = this.weapon(i), s = this.slots[i]; if (!w || !s || !s.a || this.reloading(i, now)) return false;
    if (s.mag >= w.mag || !(this.inv[s.a] > 0)) return false;
    s.reloadUntil = now + w.reload * 1000; s.reloadStart = now; this.changed(); return true;
  },
  tick(now = performance.now()) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]; if (!s.reloadUntil || now < s.reloadUntil) continue;
      const w = this.weapon(i); s.reloadUntil = 0;
      if (w && s.a) { const take = Math.min(w.mag - Math.floor(s.mag), this.inv[s.a] || 0); s.mag = Math.floor(s.mag) + take; this.inv[s.a] -= take; }
      this.changed();
    }
  },
  // firing uses the magazine (beams fractionally, per second of fire)
  consume(i, n) { const s = this.slots[i]; if (!s || s.mag < n - 1e-9) return false; s.mag = Math.max(0, s.mag - n); return true; },
};

// ---------- the Weapon & Ammo Maker (the panel) ----------
export function mountEditor(root) {
  let tab = "weapons", sel = null;
  root.innerHTML = `
    <div class="ed-tabs"><button data-tab="weapons">Weapons</button><button data-tab="ammo">Ammo</button></div>
    <div class="ed-list"></div>
    <div class="ed-btns"><button data-act="new">New</button><button data-act="dup">Duplicate</button><button data-act="del">Delete</button></div>
    <div class="ed-fields"></div>
    <div class="ed-io">
      <textarea spellcheck="false" placeholder="JSON"></textarea>
      <div class="ed-btns"><button data-act="export">Export</button><button data-act="import">Import</button><button data-act="download">Download</button><button data-act="upload">Upload</button></div>
      <input type="file" accept=".json,application/json" hidden>
      <div class="ed-msg"></div>
    </div>`;
  const $ = (q) => root.querySelector(q), list = $(".ed-list"), fields = $(".ed-fields"), ta = $("textarea"), msg = $(".ed-msg"), file = $("input[type=file]");
  const items = () => (tab === "weapons" ? A.weapons : A.ammo);
  const say = (t) => { msg.textContent = t; clearTimeout(say.t); say.t = setTimeout(() => (msg.textContent = ""), 3000); };
  function draw() {
    root.querySelectorAll(".ed-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    if (!items().some((x) => x.id === sel)) sel = items()[0] ? items()[0].id : null;
    list.innerHTML = "";
    for (const x of items()) {
      const b = document.createElement("button"); b.textContent = x.name + (tab === "weapons" ? " [" + x.slot + "]" : ""); b.classList.toggle("on", x.id === sel);
      b.onclick = () => { sel = x.id; draw(); }; list.appendChild(b);
    }
    drawFields();
  }
  // every edit looks the item up afresh: applying definitions rebuilds the lists, so an object captured when
  // the fields were drawn goes stale after the first change (only that first edit used to take)
  const cur = () => items().find((i) => i.id === sel);
  function drawFields() {
    fields.innerHTML = ""; const x = cur(); if (!x) return;
    for (const f of tab === "weapons" ? WEAPON_FIELDS : AMMO_FIELDS) {
      if (f.only && !f.only.includes(x.type)) continue;
      const row = document.createElement("label"); row.className = "ed-row";
      const name = document.createElement("span"); name.textContent = f.label; row.appendChild(name);
      let input;
      if (f.t === "text") { input = document.createElement("input"); input.type = "text"; input.maxLength = 32; input.value = x[f.k]; }
      else if (f.t === "num") { input = document.createElement("input"); input.type = "number"; input.min = f.min; input.max = f.max; input.step = f.step; input.value = x[f.k]; }
      else if (f.t === "bool") { input = document.createElement("input"); input.type = "checkbox"; input.checked = !!x[f.k]; }
      else if (f.t === "select") { input = document.createElement("select"); for (const o of f.opts) { const op = document.createElement("option"); op.value = o; op.textContent = o; input.appendChild(op); } input.value = x[f.k]; }
      else if (f.t === "ammo") {
        input = document.createElement("div"); input.className = "ed-ammo";
        for (const a of A.ammo) { const l = document.createElement("label"); const c = document.createElement("input"); c.type = "checkbox"; c.checked = x.ammo.includes(a.id);
          c.onchange = () => { const o = cur(); if (!o) return; o.ammo = c.checked ? [...new Set([...o.ammo, a.id])] : o.ammo.filter((id) => id !== a.id); A.setDefs({ weapons: A.weapons, ammo: A.ammo }); };
          l.append(c, document.createTextNode(" " + a.name)); input.appendChild(l); }
      }
      if (f.t !== "ammo") {
        const commit = () => { const o = cur(); if (!o) return; o[f.k] = clampField(f, f.t === "bool" ? input.checked : input.value); A.setDefs({ weapons: A.weapons, ammo: A.ammo }); if (f.k === "name" || f.k === "slot" || f.k === "type") draw(); };
        input.addEventListener("change", commit);
        if (f.t === "num") input.addEventListener("input", () => { const v = +input.value, o = cur(); if (o && Number.isFinite(v) && v >= f.min && v <= f.max) { o[f.k] = v; A.setDefs({ weapons: A.weapons, ammo: A.ammo }); } });
      }
      row.appendChild(input);
      if (f.unit) { const u = document.createElement("i"); u.textContent = typeof f.unit === "function" ? f.unit(x) : f.unit; row.appendChild(u); }
      fields.appendChild(row);
    }
  }
  root.querySelectorAll(".ed-tabs button").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; sel = null; draw(); }));
  root.querySelector(".ed-btns").addEventListener("click", (e) => {
    const act = e.target.dataset && e.target.dataset.act; if (!act) return;
    const x = items().find((i) => i.id === sel);
    if (act === "new") { const base = tab === "weapons" ? { ...DEFAULT_WEAPONS[0], ammo: [], name: "New weapon" } : { ...DEFAULT_AMMO[0], name: "New ammo" }; base.id = uid(tab === "weapons" ? "w" : "a"); items().push(base); sel = base.id; }
    if (act === "dup" && x) { const c = { ...clone(x), id: uid(tab === "weapons" ? "w" : "a"), name: (x.name + " copy").slice(0, 32) }; items().push(c); sel = c.id; }
    if (act === "del" && x) { const arr = items(); arr.splice(arr.indexOf(x), 1); sel = null; }
    A.setDefs({ weapons: A.weapons, ammo: A.ammo }); draw();
  });
  root.querySelector(".ed-io .ed-btns").addEventListener("click", async (e) => {
    const act = e.target.dataset && e.target.dataset.act; if (!act) return;
    if (act === "export") { ta.value = A.exportDefs(); try { await navigator.clipboard.writeText(ta.value); say("Copied"); } catch { say("Exported"); } }
    if (act === "import") { try { A.setDefs(JSON.parse(ta.value)); sel = null; draw(); say("Imported"); } catch (err) { say("Import failed: " + err.message); } }
    if (act === "download") { const b = new Blob([A.exportDefs()], { type: "application/json" }); const u = URL.createObjectURL(b); const l = document.createElement("a"); l.href = u; l.download = "atamus-arsenal.json"; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
    if (act === "upload") file.click();
  });
  file.onchange = async () => { const f = file.files && file.files[0]; if (!f) return; try { A.setDefs(JSON.parse(await f.text())); sel = null; draw(); say("Imported"); } catch (err) { say("Import failed: " + err.message); } file.value = ""; };
  A.onChange(() => { if (!root.contains(document.activeElement)) draw(); });
  draw();
}

// ---------- the TAB inventory and the hotbar ----------
export function mountInventory(inv, hotbar, getSlot, setSlot) {
  inv.innerHTML = `<div class="inv-box"><div class="inv-label">Hotbar</div><div class="inv-row inv-hot"></div>
    <div class="inv-label">Weapons</div><div class="inv-row inv-weapons" data-drop="unequip"></div>
    <div class="inv-label">Ammo</div><div class="inv-row inv-ammo"></div></div>`;
  const hotRow = inv.querySelector(".inv-hot"), wRow = inv.querySelector(".inv-weapons"), aRow = inv.querySelector(".inv-ammo");
  const slotHTML = (i) => {
    const w = A.weapon(i), a = A.loaded(i), s = A.slots[i];
    return `<b>${i + 1}</b><span class="sw">${w ? esc(w.name) : "—"}</span><span class="sa">${w && !w.interact ? (a ? esc(a.name) + " " + Math.floor(s.mag) + "/" + (A.inv[a.id] || 0) : "empty") : ""}</span><span class="rl"></span>`;
  };
  function draw() {
    for (const row of [hotRow, hotbar]) {
      row.innerHTML = "";
      for (let i = 0; i < 3; i++) {
        const el = document.createElement("div"); el.className = "slot"; el.dataset.slot = i; el.innerHTML = slotHTML(i);
        el.classList.toggle("on", i === getSlot());
        el.addEventListener("pointerdown", (e) => { if (row === hotbar || !A.weapon(i)) { setSlot(i); e.preventDefault(); return; } startDrag(e, { kind: "slotw", i }, A.weapon(i).name); });
        row.appendChild(el);
      }
    }
    wRow.innerHTML = "";
    for (const w of A.weapons) { const el = document.createElement("div"); el.className = "card"; el.innerHTML = `<b>${esc(w.name)}</b><span>Slot ${w.slot}</span>`; el.addEventListener("pointerdown", (e) => startDrag(e, { kind: "weapon", id: w.id }, w.name)); wRow.appendChild(el); }
    aRow.innerHTML = "";
    for (const a of A.ammo) { const el = document.createElement("div"); el.className = "card"; el.innerHTML = `<b>${esc(a.name)}</b><span>${a.type} ×${A.inv[a.id] || 0}</span>`; el.addEventListener("pointerdown", (e) => startDrag(e, { kind: "ammo", id: a.id }, a.name)); aRow.appendChild(el); }
  }
  let ghost = null, drag = null;
  function startDrag(e, what, label) {
    e.preventDefault(); drag = what;
    ghost = document.createElement("div"); ghost.className = "drag-ghost"; ghost.textContent = label; document.body.appendChild(ghost);
    move(e); addEventListener("pointermove", move); addEventListener("pointerup", drop, { once: true });
  }
  function move(e) { if (ghost) { ghost.style.left = e.clientX + 8 + "px"; ghost.style.top = e.clientY + 8 + "px"; } }
  function drop(e) {
    removeEventListener("pointermove", move); if (ghost) ghost.remove(); ghost = null;
    const t = document.elementFromPoint(e.clientX, e.clientY), slotEl = t && t.closest("[data-slot]"), d = drag; drag = null;
    if (!d) return;
    if (slotEl) {
      const i = +slotEl.dataset.slot; let ok = false;
      if (d.kind === "weapon") ok = A.equip(i, d.id);
      else if (d.kind === "ammo") ok = A.loadAmmo(i, d.id);
      else if (d.kind === "slotw" && d.i !== i) { const w = A.weapon(d.i); ok = w && A.equip(i, w.id); if (ok) A.unequip(d.i); }
      if (!ok && d.kind !== "slotw") flash(slotEl);
    } else if (d.kind === "slotw" && t && t.closest("[data-drop=unequip]")) A.unequip(d.i);
  }
  function flash(el) { el.classList.add("no"); setTimeout(() => el.classList.remove("no"), 300); }
  A.onChange(draw);
  draw();
  // the reload progress, drawn every frame by the game
  return {
    draw,
    frame(now) {
      for (const row of [hotRow, hotbar]) row.querySelectorAll(".slot").forEach((el) => {
        const i = +el.dataset.slot, s = A.slots[i], rl = el.querySelector(".rl");
        el.classList.toggle("on", i === getSlot());
        if (rl) rl.style.width = s.reloadUntil && now < s.reloadUntil ? ((now - s.reloadStart) / Math.max(1, s.reloadUntil - s.reloadStart)) * 100 + "%" : "0";
        const sa = el.querySelector(".sa"), w = A.weapon(i), a = A.loaded(i);
        if (sa && w && a && !w.interact) { const t = esc(a.name) + " " + Math.floor(s.mag) + "/" + (A.inv[a.id] || 0); if (sa.innerHTML !== t) sa.innerHTML = t; }
      });
    },
  };
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
