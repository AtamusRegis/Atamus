// (owner, 2026-10-15) The CREATOR (head admin): C (or the [C] button in the staff column) opens it. For now only the ship
// and module creators (owner, 2026-10-15: everything else scrapped): one row with a search box, a filter button (All,
// Ship, Module) and a green CREATE; below, every Ship and Module object as slots (6 a row), sorted by
// name. CREATE asks for a Name, an Icon and a Type (Ship or Module). Right-click a slot: Edit (name, icon; a type stays its
// own), Edit Object (the Object Editor: a ship's model, module, hitboxes, movement and points; a module's model, size and
// points) and Delete. The server checks it all.
const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (text, cls, fn) => { const b = $("button", cls, text); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; };
const C = () => window.Catalog, IC = () => window.ItemCreator;
const TYPES = [["ship", "Ship"], ["hardpoint", "Module"]];   // (owner, 2026-10-15: only the ship and module creators for now; the rest scrapped)
const NAME = Object.fromEntries(TYPES);
const OBJ = ["node", "region", "object", "structure", "ship", "hardpoint"], SND = ["sfx", "music"];   // hardpoint: (owner, 2026-10-15) a module for a ship's hardpoint
const group = (k) => (k === "hardpoint" ? [k] : OBJ.includes(k) ? OBJ.filter((x) => x !== "hardpoint") : SND.includes(k) ? SND : [k]);   // what a thing's type can change to

let api = null, build = null, types = null, staff = false, head = false, sounds = [];
let win = null, cbtn = null, grid = null, search = null, fbtn = null, perr = null, tab = "all", menu = null, want = null;
const allowed = () => (head ? TYPES : []);

function mount(a) {
  api = a.send ? a : api; build = a.build; types = a.types; staff = !!a.staff; head = !!a.head;
  if (win) { cbtn.hidden = !staff; return; }
  cbtn = btn("C"); cbtn.id = "cr-btn"; cbtn.title = "Object Creator"; cbtn.addEventListener("click", () => toggle());
  (document.getElementById("staff-col") || document.body).appendChild(cbtn);
  win = $("div"); win.id = "cr-panel"; win.hidden = true;
  const top = $("div", "we-top"); top.append($("span", "we-title", "OBJECT CREATOR"), btn("×", "we-x", () => toggle(false)));
  if (window.WinPos) window.WinPos.watch(top, win, "creator");   // (owner, 2026-10-15) remembered per account
  top.addEventListener("pointerdown", (e) => {   // dragged by its top bar
    if (e.button !== 0 || e.target.closest("button")) return; e.preventDefault();
    const r0 = win.getBoundingClientRect(), ox = e.clientX - r0.left, oy = e.clientY - r0.top;
    win.style.transform = "none"; win.style.left = r0.left + "px"; win.style.top = r0.top + "px";
    const move = (ev) => { const r = win.getBoundingClientRect(); win.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - ox)) + "px"; win.style.top = Math.max(0, Math.min(innerHeight - r.height, ev.clientY - oy)) + "px"; };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  });
  search = $("input", "imp-search"); search.maxLength = 32; search.placeholder = "Search"; search.addEventListener("input", () => draw());
  fbtn = btn("", "imp-filter", () => filterMenu()); fbtn.title = "Filter";
  fbtn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 3h12l-4.6 5.4V13l-2.8 1.4V8.4Z" fill="currentColor"/></svg>';
  const tools = $("div", "imp-tools"); tools.append(search, fbtn, btn("CREATE", "imp-go", () => editBox(null)));
  grid = $("div", "we-list imp-grid");
  grid.addEventListener("contextmenu", (e) => { e.preventDefault(); const d = e.target.closest("[data-key]"); if (d) openMenu(d.dataset.key, e.clientX, e.clientY); });
  perr = $("p", "we-err"); perr.hidden = true;
  win.append(top, tools, grid, perr); document.body.appendChild(win);
  win.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.code === "KeyC" && e.target.tagName !== "INPUT" && !e.repeat) { toggle(false); return; } if (e.key === "Escape") { if (document.activeElement) document.activeElement.blur(); toggle(false); } });
  addEventListener("keydown", (e) => {
    if (e.code !== "KeyC" || e.ctrlKey || e.metaKey || e.altKey || e.repeat || !staff) return;
    const t = document.activeElement; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (document.querySelector(".we-back")) return;
    e.preventDefault(); toggle();
  });
  addEventListener("pointerdown", (e) => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
  if (C()) C().on(() => draw());
}
function toggle(v) {
  if (!win) return; win.hidden = v === undefined ? !win.hidden : !v; cbtn.classList.toggle("on", !win.hidden);
  if (!win.hidden) { draw(); if (window.WinPos) window.WinPos.place(win, "creator"); } else { closeMenu(); if (document.activeElement && win.contains(document.activeElement)) document.activeElement.blur(); }
}
function showErr(m) { perr.textContent = m; perr.hidden = false; clearTimeout(perr.t); perr.t = setTimeout(() => { perr.hidden = true; }, 4000); }

// ---- everything made, as { key, k: its type, name, pic(px), ...the thing } ----
const letter = (t, cls) => $("span", "build-letter" + (cls ? " " + cls : ""), t);
const iconPic = (id, px, fallback) => { const ic = id && C() && C().icons.get(id); return ic ? C().svg(ic, px) : fallback(); };
function entries() {
  const out = [];
  if (head) {
    for (const t of types.values()) if (t.cat === "ship" || t.cat === "hardpoint") out.push({ key: "type:" + t.id, k: t.cat, id: t.id, name: t.name, o: t, pic: (px) => build.typePic(t, px) });
  }
  return out;
}
function draw() {
  if (!win || win.hidden) return;
  fbtn.classList.toggle("on", tab !== "all");
  const q = search.value.trim().toLowerCase();
  const list = entries().filter((e) => (tab === "all" || e.k === tab) && (!q || e.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  const cells = list.map((e) => { const d = $("div", "inv-slot imp-slot"); d.dataset.key = e.key; d.title = e.name; d.appendChild(e.pic(34)); return d; });
  for (let i = cells.length; i < Math.max(12, Math.ceil(cells.length / 6) * 6); i++) cells.push($("div", "inv-slot"));
  grid.replaceChildren(...cells);
}
const place = (el, x, y) => { document.body.appendChild(el); const r = el.getBoundingClientRect(); el.style.left = Math.min(x, innerWidth - r.width - 4) + "px"; el.style.top = Math.min(y, innerHeight - r.height - 4) + "px"; };
function filterMenu() {
  closeMenu(); menu = $("div", "we-ctx imp-fmenu");
  for (const [k, label] of [["all", "All"], ...allowed()]) menu.appendChild(btn(label, k === tab ? "on" : "", () => { closeMenu(); tab = k; draw(); }));
  const r = fbtn.getBoundingClientRect(); place(menu, r.left, r.bottom + 4);
}
function closeMenu() { if (menu) { menu.remove(); menu = null; } }
function openMenu(key, x, y) {
  const e = entries().find((o) => o.key === key); if (!e) return; closeMenu();
  menu = $("div", "we-ctx"); const add = (label, fn) => menu.appendChild(btn(label, "", () => { closeMenu(); fn(); }));
  add("Edit Meta", () => editBox(e));   // (owner, 2026-10-15: was Edit)
  add("Edit Object", () => build.editObject("t:" + e.id));
  add("Delete", () => api.send({ t: "tdel", id: e.id }));
  place(menu, x, y);
}

// ---- CREATE / Edit: Name, Icon (Create New Icon, or the [+] box: pick one), Type; CANCEL / CREATE (SAVE). An icon's
// Rename: the name only ----
function editBox(e) {
  const o = IC().overlay("cr-edit"), rename = false;
  let icon = e && !rename ? e.o.icon || null : null;
  o.box.appendChild($("p", "we-title", !e ? "CREATE" : rename ? "RENAME" : "EDIT META"));
  const g = $("div", "we-grid"), name = $("input"); name.maxLength = 32; name.value = e ? e.name : "";
  g.append($("label", "we-label", "Name"), name);
  const iRow = $("div", "we-iconrow"), box = btn("", "we-iconbox", () => IC().pickIcon((id) => { icon = id; drawIcon(); })); box.title = "Icon";
  const mk = btn("Create New Icon", "", () => newIconMenu(mk, (id) => { icon = id; drawIcon(); }));
  iRow.append(mk, box);
  const drawIcon = () => box.replaceChildren(iconPic(icon, 30, () => $("span", "we-plus", "+")));
  const type = $("select"); for (const [k, label] of (e ? allowed().filter(([k]) => group(e.k).includes(k)) : allowed())) type.append(new Option(label, k)); type.value = e ? e.k : allowed()[0][0];
  const iLab = $("label", "we-label", "Icon");
  if (!rename) g.append(iLab, iRow, $("label", "we-label", "Type"), type);
  const syncType = () => { const ic = type.value === "icon"; iLab.hidden = iRow.hidden = ic; };
  type.addEventListener("change", syncType); drawIcon(); syncType();
  const err = $("p", "we-err"); err.hidden = true;
  const ok = btn(e ? "SAVE" : "CREATE", "we-ok", save), btns = $("div", "we-btns"); btns.append(btn("CANCEL", "", () => o.close()), ok);
  o.box.append(g, err, btns);
  o.box.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.tagName === "INPUT") { ev.preventDefault(); save(); } });
  setTimeout(() => { name.focus(); name.select(); }, 0);
  function fail(m) { ok.disabled = false; err.textContent = m; err.hidden = false; }
  function save() {
    if (ok.disabled) return;
    const n = name.value.trim(), k = type.value; if (!n) { fail("Give it a name."); return; }
    if (rename) { ok.disabled = true; want = { t: "isaved", done: () => o.close(), fail }; api.send({ t: "iset", id: e.id, icon: { name: n, shapes: e.o.shapes } }); return; }
    ok.disabled = true; want = { t: k === "item" ? "itemsaved" : OBJ.includes(k) ? "tsaved" : "ssaved", done: () => { o.close(); draw(); }, fail };
    if (k === "item") api.send({ t: "itemset", ...(e ? { id: e.id } : {}), item: { ...(e ? e.o : {}), name: n, icon } });
    else if (OBJ.includes(k)) { const t = e ? { ...e.o } : {}; delete t.id; delete t.thumb; api.send({ t: "tset", ...(e ? { id: e.id } : {}), type: { ...t, name: n, icon, cat: k } }); }
    else api.send({ t: "sset", ...(e ? { id: e.id } : {}), sound: { name: n, icon, kind: k } });
  }
}

// (owner, 2026-10-15: the Player Ship slot is gone from here; the server keeps the ship last picked)
let playerShip = null;
function setPlayerShip(id) { playerShip = typeof id === "string" ? id : null; draw(); }
// (owner, 2026-10-15) Create New Icon: an SVG Icon (the Icon Creator) or a thumbnail from a RAW ASSETS model (pick one:
// its rendered picture becomes the icon)
function newIconMenu(at, done) {
  const m = $("div", "we-ctx cr-imenu"), close = () => { m.remove(); removeEventListener("pointerdown", off, true); };
  const off = (e) => { if (!m.contains(e.target)) close(); };
  m.append(btn("SVG Icon", "", () => { close(); IC().newIcon(done); }), btn("From Object", "", () => { close(); objectPicker(done); }));
  document.body.appendChild(m); const r = at.getBoundingClientRect(); place(m, r.left, r.bottom + 4); m.style.zIndex = "40";
  setTimeout(() => addEventListener("pointerdown", off, true), 0);
}
function objectPicker(done) {
  const o = IC().overlay("we-pick"); o.box.appendChild($("p", "we-title", "FROM OBJECT"));
  const g = $("div", "we-list"), models = (window.Assets ? window.Assets.models() : []).filter((a) => a.thumb).sort((a, b) => a.name.localeCompare(b.name));
  const cells = models.map((a) => { const c = btn("", "inv-slot we-pickslot", () => { o.close(); want = { t: "isaved", done: (m) => done(m.id), fail: () => {} }; api.send({ t: "iset", icon: { name: a.name, img: a.thumb } }); }); c.title = a.name; c.appendChild(window.Assets.picture(a.thumb, 34)); c.appendChild($("span", "raw-mark", "m")); return c; });
  for (let i = cells.length; i < 10; i++) cells.push($("div", "inv-slot"));
  g.replaceChildren(...cells); o.box.append(g, (() => { const b = $("div", "we-btns"); b.appendChild(btn("CANCEL", "", () => o.close())); return b; })());
}
// the server's answers: a list, or the answer to a save this panel is waiting for (true: handled here)
function onMsg(m) {
  if (m.t === "sounds") { sounds = Array.isArray(m.list) ? m.list : []; draw(); return true; }
  if (m.t === "types") { setTimeout(draw, 0); return false; }   // (the Object Placer takes them too)
  if (want && want.t === m.t) { const w = want; want = null; if (m.error) w.fail(m.error); else w.done(m); return true; }
  if (m.error && ["itemsaved", "tsaved", "ssaved", "isaved"].includes(m.t) && !(IC() && IC().busy) && win && !win.hidden) { showErr(m.error); return m.t !== "tsaved"; }
  return false;
}
function setSounds(list) { sounds = Array.isArray(list) ? list : []; draw(); }
export const Creator = { mount, onMsg, setSounds, setPlayerShip, toggle };
