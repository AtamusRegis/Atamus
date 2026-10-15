// (owner, 2026-10-13) The hotbar (3 slots, bottom center) and the inventory panel (5 x 2 slots), opened and closed with TAB
// when not typing (Escape closes it too). For now there's one placeholder item to drag between any of the 13 slots
// (dropping on a filled slot swaps them). Drag works with a mouse or a finger. Styled like the old game's hotbar slots. Kept in this browser for now (nothing on
// the server yet). Item names show on hover. (owner, 2026-10-14) Weapons and ammo from the Weapon panel can be dragged in
// too (copied from the panel's slots, keys "w:<id>" / "a:<id>", pictures from the Catalog); the first hotbar slot is the
// primary weapon: a weapon put there is the one I fire (game3d.js tells the server). An item deleted from the catalog goes.
(function () {
  const HOT = 3, INV = 10, KEY = "atamus.inv";
  const ITEMS = { test: { name: "Test Item" } };
  // slots: "h0".."h2" (hotbar), "i0".."i9" (inventory) -> item id or null
  let slots = {};
  const reset = () => { slots = {}; for (let i = 0; i < HOT; i++) slots["h" + i] = null; for (let i = 0; i < INV; i++) slots["i" + i] = null; slots.i0 = "test"; };
  const okKey = (v) => v in ITEMS || (typeof v === "string" && /^[wa]:[0-9]{1,9}$/.test(v));
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && typeof v === "object") { reset(); for (const k in slots) slots[k] = okKey(v[k]) ? v[k] : null; if (!Object.values(slots).includes("test")) { const free = Object.keys(slots).find((k) => k[0] === "i" && !slots[k]); if (free) slots[free] = "test"; } } else reset(); } catch { reset(); }
  const nameOf = (id) => (ITEMS[id] ? ITEMS[id].name : (window.Catalog && window.Catalog.item(id) || {}).name || "");
  let primary = slots.h0, onPrimary = null;
  const primaryChanged = () => { if (slots.h0 !== primary) { primary = slots.h0; if (onPrimary) onPrimary(primary); } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(slots)); } catch {} };

  const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const hotbar = $("div"); hotbar.id = "hotbar";
  const panel = $("div"); panel.id = "inv-panel"; panel.hidden = true;
  const grid = $("div", "inv-grid");
  panel.append($("p", "inv-title", "Inventory"), grid);
  document.body.append(hotbar, panel);

  const cell = (key) => {
    const c = $("div", "inv-slot"); c.dataset.slot = key;
    if (key[0] === "h") c.appendChild($("span", "inv-num", String(+key.slice(1) + 1)));
    const id = slots[key];
    if (id) {
      const it = $("div", "inv-item"); it.title = nameOf(id); it.dataset.slot = key; it.dataset.item = id;
      const pic = !ITEMS[id] && window.Catalog && window.Catalog.picture(id, 26); if (pic) { it.classList.add("pic"); it.appendChild(pic); }
      c.appendChild(it);
    }
    return c;
  };
  function draw() {
    hotbar.replaceChildren(...Array.from({ length: HOT }, (_, i) => cell("h" + i)));
    grid.replaceChildren(...Array.from({ length: INV }, (_, i) => cell("i" + i)));
  }
  draw();

  // dragging an item: a ghost follows the pointer; dropped on a slot it moves there (swapping with what's there)
  let drag = null;
  document.addEventListener("pointerdown", (e) => {
    const it = e.target.closest && e.target.closest(".inv-item"); if (!it || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const ghost = it.cloneNode(true); ghost.classList.add("inv-ghost"); document.body.appendChild(ghost);
    drag = { from: it.dataset.slot || null, item: it.dataset.item, ghost, id: e.pointerId };   // (from: none for the Weapon panel's slots: a copy)
    it.classList.add("inv-lifted");
    move(e);
  }, true);
  let over = null;                             // the slot under a dragged item (outlined)
  const move = (e) => {
    if (!drag) return; drag.ghost.style.transform = "translate(" + (e.clientX - 15) + "px," + (e.clientY - 15) + "px)";
    const at = document.elementFromPoint(e.clientX, e.clientY), sl = at && at.closest && at.closest(".inv-slot");
    if (sl !== over) { if (over) over.classList.remove("drop"); over = sl; if (over) over.classList.add("drop"); }
  };
  document.addEventListener("pointermove", (e) => { if (drag && e.pointerId === drag.id) move(e); }, true);
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const at = document.elementFromPoint(e.clientX, e.clientY), to = at && at.closest && at.closest(".inv-slot");
    const from = drag.from, item = drag.item; drag.ghost.remove(); drag = null; for (const el of document.querySelectorAll(".inv-lifted")) el.classList.remove("inv-lifted"); if (over) { over.classList.remove("drop"); over = null; }
    const k = to && to.dataset.slot;
    if (k && (k[0] === "h" || k[0] === "i") && k !== from && (k[0] === "h" || !panel.hidden)) {
      if (from) [slots[k], slots[from]] = [slots[from], slots[k]];
      else if (okKey(item) && item !== "test") slots[k] = item;      // from the Weapon panel: a copy of it goes in
      save(); primaryChanged();
    }
    draw();
  };
  document.addEventListener("pointerup", end, true);
  document.addEventListener("pointercancel", end, true);

  // the catalog changed: redraw, and drop items that no longer exist (once it has arrived)
  if (window.Catalog) window.Catalog.on(() => {
    if (window.Catalog.ready) { let gone = false; for (const k in slots) if (slots[k] && !ITEMS[slots[k]] && !window.Catalog.item(slots[k])) { slots[k] = null; gone = true; } if (gone) { save(); primaryChanged(); } }
    draw();
  });
  window.Inventory = {
    // (owner, 2026-10-14) the primary weapon slot (the first hotbar slot): f(key) now and whenever it changes
    onPrimary(f) { onPrimary = f; primary = slots.h0; f(primary); },
    toggle(open) { panel.hidden = open === undefined ? !panel.hidden : !open; },
    get open() { return !panel.hidden; },
  };
})();
