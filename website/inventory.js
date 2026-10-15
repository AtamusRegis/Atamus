// (owner, 2026-10-13) The hotbar (3 slots, bottom center) and the inventory panel (5 x 2 slots), opened and closed with TAB
// when not typing (Escape closes it too). Drag an item between any of the 13 slots (dropping on a filled slot swaps them).
// Drag works with a mouse or a finger. Styled like the old game's hotbar slots. Item names show on hover.
// (owner, 2026-10-14) Kept on the server now (game/items.js): this draws what the server last sent and sends each move
// (shown at once, then the server's answer replaces it). Items from the Item Creator can be dragged in (staff: a copy). Right-click an item: Drop; or drag it out onto the world: the same.
// A dropped item lands in a crate where the ship is; right-clicking a crate (game3d.js) opens the crate panel here, whose
// items drag into the hotbar or inventory.
(function () {
  const HOT = 3, INV = 10;
  const ITEMS = { test: { name: "Test Item" } };
  // slots: "h0".."h2" (hotbar), "i0".."i9" (inventory) -> item key or null
  let slots = {}; for (let i = 0; i < HOT; i++) slots["h" + i] = null; for (let i = 0; i < INV; i++) slots["i" + i] = null;
  let send = () => {}, crate = null;            // crate: the open crate { id, items }
  const nameOf = (id) => (ITEMS[id] ? ITEMS[id].name : (window.Catalog && window.Catalog.item(id) || {}).name || "");

  const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const hotbar = $("div"); hotbar.id = "hotbar";
  const panel = $("div"); panel.id = "inv-panel"; panel.hidden = true;
  const grid = $("div", "inv-grid");
  panel.append($("p", "inv-title", "Inventory"), grid);
  const cpanel = $("div"); cpanel.id = "crate-panel"; cpanel.hidden = true;   // (owner, 2026-10-14) a crate's items
  const cgrid = $("div", "inv-grid crate-grid");
  cpanel.append($("p", "inv-title", "Crate"), cgrid);
  document.body.append(hotbar, panel, cpanel);

  // (owner, 2026-10-15) a slot holds a stack { k: item key, n: how many }; a count shows when there's more than one
  const maxOf = (k) => { const it = window.Catalog && window.Catalog.item(k); return it && it.data.stack ? it.data.max : 1; };
  const itemEl = (st) => {
    const id = st.k, it = $("div", "inv-item"); it.title = nameOf(id); it.dataset.item = id;
    const pic = !ITEMS[id] && window.Catalog && window.Catalog.picture(id, 26); if (pic) { it.classList.add("pic"); it.appendChild(pic); }
    if (st.n > 1) it.appendChild($("span", "inv-count", String(st.n)));
    return it;
  };
  const cell = (key) => {
    const c = $("div", "inv-slot"); c.dataset.slot = key;
    if (key[0] === "h") c.appendChild($("span", "inv-num", String(+key.slice(1) + 1)));
    const st = slots[key];
    if (st) { const it = itemEl(st); it.dataset.slot = key; c.appendChild(it); }
    return c;
  };
  function draw() {
    hotbar.replaceChildren(...Array.from({ length: HOT }, (_, i) => cell("h" + i)));
    grid.replaceChildren(...Array.from({ length: INV }, (_, i) => cell("i" + i)));
    if (crate) {
      const cells = crate.items.map((st, i) => { const c = $("div", "inv-slot"), it = itemEl(st); it.dataset.ci = String(i); c.appendChild(it); return c; });
      for (let i = cells.length; i < Math.max(10, Math.ceil(cells.length / 5) * 5); i++) cells.push($("div", "inv-slot"));
      cgrid.replaceChildren(...cells);
    }
  }
  draw();

  // dragging an item: a ghost follows the pointer; dropped on a slot it moves there (swapping with what's there); from a
  // slot dropped on the world (the game view), it's dropped there
  let drag = null;
  document.addEventListener("pointerdown", (e) => {
    const it = e.target.closest && e.target.closest(".inv-item"); if (!it || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); closeMenu();
    const ghost = it.cloneNode(true); ghost.classList.add("inv-ghost"); document.body.appendChild(ghost);
    drag = { from: it.dataset.slot || null, ci: it.dataset.ci != null ? +it.dataset.ci : null, item: it.dataset.item, ghost, id: e.pointerId };   // (no slot: a copy from the Item Creator, or ci: out of the crate)
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
    const d = drag; drag.ghost.remove(); drag = null; for (const el of document.querySelectorAll(".inv-lifted")) el.classList.remove("inv-lifted"); if (over) { over.classList.remove("drop"); over = null; }
    const k = to && to.dataset.slot;
    if (k && k !== d.from && (k[0] === "h" || !panel.hidden)) {
      if (d.from) {                            // onto the same stackable item: topped up (the rest stays); else swapped
        const a = slots[d.from], b = slots[k];
        if (a && b && a.k === b.k && maxOf(b.k) > 1) { const m = Math.min(Math.max(0, maxOf(b.k) - b.n), a.n); slots[k] = { k: b.k, n: b.n + m }; slots[d.from] = a.n - m > 0 ? { k: a.k, n: a.n - m } : null; }
        else [slots[k], slots[d.from]] = [b, a];
        send({ t: "imove", from: d.from, to: k });
      }
      else if (d.ci != null && crate) { send({ t: "itake", c: crate.id, i: d.ci, to: k }); }
      else if (d.item && d.item !== "test") { const b = slots[k]; slots[k] = b && b.k === d.item && b.n < maxOf(d.item) ? { k: b.k, n: b.n + 1 } : { k: d.item, n: 1 }; send({ t: "igive", item: d.item, to: k }); }   // from the Item Creator: one more of it (a copy)
    } else if (d.from && at && at.id === "view") drop(d.from);   // (owner, 2026-10-14) dragged out onto the world: dropped
    draw();
  };
  document.addEventListener("pointerup", end, true);
  document.addEventListener("pointercancel", end, true);
  function drop(from) { if (!slots[from]) return; slots[from] = null; send({ t: "idrop", from }); draw(); }

  // (owner, 2026-10-14) right-click an item in the hotbar or inventory: Drop
  let menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  document.addEventListener("contextmenu", (e) => {
    const it = e.target.closest && e.target.closest("#hotbar .inv-item, #inv-panel .inv-item"); if (!it) return;
    e.preventDefault(); closeMenu();
    const from = it.dataset.slot; menu = $("div", "we-ctx");
    const b = $("button", "", "Drop"); b.type = "button"; b.addEventListener("click", () => { closeMenu(); drop(from); }); menu.appendChild(b);
    document.body.appendChild(menu); const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(e.clientX, innerWidth - r.width - 4) + "px"; menu.style.top = Math.min(e.clientY - r.height, innerHeight - r.height - 4) + "px";
  });
  addEventListener("pointerdown", (e) => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);

  if (window.Catalog) window.Catalog.on(draw);
  window.Inventory = {
    setSend(f) { send = f; },
    set(s) { if (s && typeof s === "object") { for (const k in slots) { const v = s[k]; slots[k] = v && typeof v.k === "string" ? { k: v.k, n: Math.max(1, Math.floor(+v.n) || 1) } : null; } draw(); } },   // the server's inventory
    toggle(open) { panel.hidden = open === undefined ? !panel.hidden : !open; if (panel.hidden) this.closeCrate(); },
    get open() { return !panel.hidden; },
    // the crate panel (with the inventory beside it)
    openCrate(c) { crate = { id: c.id, items: c.items.slice() }; cpanel.hidden = false; panel.hidden = false; draw(); },
    updateCrate(c) { if (crate && crate.id === c.id) { crate.items = c.items.slice(); draw(); } },
    crateGone(id) { if (crate && crate.id === id) this.closeCrate(); },
    closeCrate() { crate = null; cpanel.hidden = true; },
    get crateId() { return crate ? crate.id : null; },
  };
})();
