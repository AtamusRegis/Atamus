// (owner, 2026-10-13) The hotbar (3 slots, bottom center) and the inventory panel (5 x 2 slots), opened and closed with TAB
// when not typing (Escape closes it too). For now there's one placeholder item to drag between any of the 13 slots
// (dropping on a filled slot swaps them). Drag works with a mouse or a finger. Kept in this browser for now (nothing on
// the server yet). Item names show on hover.
(function () {
  const HOT = 3, INV = 10, KEY = "atamus.inv";
  const ITEMS = { test: { name: "Test Item" } };
  // slots: "h0".."h2" (hotbar), "i0".."i9" (inventory) -> item id or null
  let slots = {};
  const reset = () => { slots = {}; for (let i = 0; i < HOT; i++) slots["h" + i] = null; for (let i = 0; i < INV; i++) slots["i" + i] = null; slots.i0 = "test"; };
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && typeof v === "object") { reset(); for (const k in slots) if (v[k] in ITEMS) slots[k] = v[k]; else slots[k] = null; if (!Object.values(slots).includes("test")) slots.i0 = "test"; } else reset(); } catch { reset(); }
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
    if (id) { const it = $("div", "inv-item"); it.title = ITEMS[id].name; it.dataset.slot = key; c.appendChild(it); }
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
    drag = { from: it.dataset.slot, ghost, id: e.pointerId };
    it.classList.add("inv-lifted");
    move(e);
  }, true);
  const move = (e) => { if (!drag) return; drag.ghost.style.transform = "translate(" + (e.clientX - 22) + "px," + (e.clientY - 22) + "px)"; };
  document.addEventListener("pointermove", (e) => { if (drag && e.pointerId === drag.id) move(e); }, true);
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const at = document.elementFromPoint(e.clientX, e.clientY), to = at && at.closest && at.closest(".inv-slot");
    const from = drag.from; drag.ghost.remove(); drag = null;
    if (to && to.dataset.slot && to.dataset.slot !== from && (to.dataset.slot[0] === "h" || !panel.hidden)) {
      const k = to.dataset.slot; [slots[k], slots[from]] = [slots[from], slots[k]]; save();
    }
    draw();
  };
  document.addEventListener("pointerup", end, true);
  document.addEventListener("pointercancel", end, true);

  window.Inventory = {
    toggle(open) { panel.hidden = open === undefined ? !panel.hidden : !open; },
    get open() { return !panel.hidden; },
  };
})();
