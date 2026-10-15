// (owner, 2026-10-15) The CREATOR: C (or the [C] button in the staff column) opens it. It replaced the Item Creator (Z)
// and the Object Creator's list (X). Laid out like RAW ASSETS: one row with a search box ("Search"), a filter button (All
// and each type) and a green CREATE; below, every made thing as a slot (6 a row, scrolling), sorted by name; hover: its
// name. CREATE asks for a Name, an Icon and a Type: Item, Resource, Region, Object, Structure, Ship, SFX, Music Track
// (owner, 2026-10-15: icons are made in RAW ASSETS now); just their name, icon and type for now. Right-click a slot:
// Edit (the same three; the type only changes within its own kind: Resource / Region / Object / Structure / Ship among
// themselves, SFX and Music Track between them) and Delete; an Icon: Edit (the Icon Creator), Rename, Delete; objects also
// keep Edit Object (the Object Editor) and items the Item Editor; the Player Ship has Edit: which Ship object players fly (owner, 2026-10-15). Items drag into
// the hotbar or inventory as before (staff: a copy). Staff (head admin, admins) get Items and Icons; the head admin
// everything. The server checks it all.
const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (text, cls, fn) => { const b = $("button", cls, text); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; };
const C = () => window.Catalog, IC = () => window.ItemCreator;
const TYPES = [["item", "Item"], ["node", "Resource"], ["region", "Region"], ["object", "Object"], ["structure", "Structure"], ["ship", "Ship"], ["sfx", "SFX"], ["music", "Music Track"]];
const NAME = Object.fromEntries(TYPES);
const OBJ = ["node", "region", "object", "structure", "ship"], SND = ["sfx", "music"];
const group = (k) => (OBJ.includes(k) ? OBJ : SND.includes(k) ? SND : [k]);   // what a thing's type can change to

let api = null, build = null, types = null, staff = false, head = false, sounds = [];
let win = null, cbtn = null, grid = null, search = null, fbtn = null, perr = null, tab = "all", menu = null, want = null;
const allowed = () => TYPES.filter(([k]) => head || k === "item");   // (owner, 2026-10-15: icons moved to RAW ASSETS)

function mount(a) {
  api = a.send ? a : api; build = a.build; types = a.types; staff = !!a.staff; head = !!a.head;
  if (win) { cbtn.hidden = !staff; return; }
  cbtn = btn("C"); cbtn.id = "cr-btn"; cbtn.title = "Creator"; cbtn.addEventListener("click", () => toggle());
  (document.getElementById("staff-col") || document.body).appendChild(cbtn);
  win = $("div"); win.id = "cr-panel"; win.hidden = true;
  const top = $("div", "we-top"); top.append($("span", "we-title", "CREATOR"), btn("×", "we-x", () => toggle(false)));
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
  if (C()) {
    for (const it of C().items) out.push({ key: "item:" + it.id, k: "item", id: it.id, name: it.name, o: it, pic: (px) => { const el = $("div", "inv-item pic"); el.dataset.item = "it:" + it.id; el.title = it.name; const p = C().picture("it:" + it.id, px - 8); if (p) el.appendChild(p); return el; } });
  }
  if (head) {
    { const ps = playerShip && types.get(playerShip); out.push({ key: "player", k: "ship", name: "Player Ship", pic: (px) => (ps && ps.cat === "ship" ? build.typePic(ps, px) : build.shipPic()) }); }   // (owner, 2026-10-15) shows the Ship object players fly
    for (const t of types.values()) out.push({ key: "type:" + t.id, k: t.cat, id: t.id, name: t.name, o: t, pic: (px) => build.typePic(t, px) });
    for (const s of sounds) out.push({ key: "sound:" + s.id, k: s.kind, id: s.id, name: s.name, o: s, pic: (px) => iconPic(s.icon, px, () => letter(s.kind === "music" ? "♫" : "♪")) });
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
  if (key === "player") add("Edit", () => playerBox());   // (owner, 2026-10-15) only which Ship object it is: that object's own data does the rest
  else {
    add("Edit", () => editBox(e));
    if (e.k === "item") add("Item Editor", () => IC().itemEditor(C().item("it:" + e.id)));
    if (OBJ.includes(e.k)) add("Edit Object", () => build.editObject("t:" + e.id));
    add("Delete", () => api.send(e.k === "item" ? { t: "itemdel", id: e.id } : OBJ.includes(e.k) ? { t: "tdel", id: e.id } : { t: "sdel", id: e.id }));
  }
  place(menu, x, y);
}

// ---- CREATE / Edit: Name, Icon (Create New Icon, or the [+] box: pick one), Type; CANCEL / CREATE (SAVE). An icon's
// Rename: the name only ----
function editBox(e) {
  const o = IC().overlay("cr-edit"), rename = false;
  let icon = e && !rename ? e.o.icon || null : null;
  o.box.appendChild($("p", "we-title", !e ? "CREATE" : rename ? "RENAME" : "EDIT"));
  const g = $("div", "we-grid"), name = $("input"); name.maxLength = 32; name.value = e ? e.name : "";
  g.append($("label", "we-label", "Name"), name);
  const iRow = $("div", "we-iconrow"), box = btn("", "we-iconbox", () => IC().pickIcon((id) => { icon = id; drawIcon(); })); box.title = "Icon";
  iRow.append(btn("Create New Icon", "", () => IC().newIcon((id) => { icon = id; drawIcon(); })), box);
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

// (owner, 2026-10-15) the Player Ship: which Ship object players fly (its model, hitboxes, pivot, movement, visibility,
// hardpoint and effects level are that object's); None: the built-in ship
let playerShip = null;
function playerBox() {
  const o = IC().overlay("cr-edit"); o.box.appendChild($("p", "we-title", "PLAYER SHIP"));
  const g = $("div", "we-grid"), sel = $("select"); sel.append(new Option("None", ""), ...[...types.values()].filter((t) => t.cat === "ship").sort((a, b) => a.name.localeCompare(b.name)).map((t) => new Option(t.name, t.id)));
  sel.value = playerShip && types.get(playerShip) ? playerShip : ""; g.append($("label", "we-label", "Ship"), sel);
  const ok = btn("SAVE", "we-ok", () => { api.send({ t: "pship", id: sel.value || null }); o.close(); }), btns = $("div", "we-btns"); btns.append(btn("CANCEL", "", () => o.close()), ok);
  o.box.append(g, btns);
}
function setPlayerShip(id) { playerShip = typeof id === "string" ? id : null; draw(); }
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
