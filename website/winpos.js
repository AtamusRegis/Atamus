// (owner, 2026-10-15) The editor windows remember where each account put them (kept on the server, sent with hello):
// the Object Creator, the Asset Creator, the Object Editor, the ship editor, the attributes panel and the editor pop-ups
// (dragged by their title). Moving one saves its spot when the drag ends; opening it again puts it back there (pulled
// inside the screen if the window is smaller now). (owner, 2026-10-15) Pressing on a window brings it to the front.
(function () {
  let pos = {}, send = () => {}, z = 9;
  const KEYS = ["creator", "assets", "objedit", "attrs", "shipedit", "se-attr", "cr-edit", "imp-pop", "we-creator", "we-pick", "we-item"];
  function place(el, key) {
    if (el && !el.hidden && !el.classList.contains("we-modal")) front(el);   // (opening a window brings it forward)
    const p = pos[key]; if (!p || !el || el.hidden) return;
    const r = el.getBoundingClientRect();
    el.style.transform = "none"; el.style.right = "auto"; el.style.bottom = "auto";
    el.style.left = Math.max(0, Math.min(innerWidth - r.width, p.x)) + "px"; el.style.top = Math.max(0, Math.min(innerHeight - r.height, p.y)) + "px";
  }
  function save(el, key) {
    if (!el || !KEYS.includes(key) || el.hidden || !el.isConnected) return; const r = el.getBoundingClientRect(), x = Math.round(r.left), y = Math.round(r.top);
    if (!r.width || !r.height) return;           // (closed: nothing to save; its × is on the drag bar)
    const p = pos[key]; if (p && p.x === x && p.y === y) return;
    pos[key] = { x, y }; send({ t: "ui", k: key, x, y });
  }
  // the window in front (the editor windows sit between the game and the pop-ups)
  function front(el) { if (!el) return; if (z > 22) { z = 9; for (const w of document.querySelectorAll("[data-winz]")) w.style.zIndex = String(z); } el.dataset.winz = "1"; el.style.zIndex = String(++z); }
  // a drag handle: when a drag on it ends, the window's spot is saved; pressing anywhere on the window brings it forward
  function watch(handle, el, key) {
    handle.addEventListener("pointerdown", (e) => { if (e.button !== 0 || (e.target.closest && e.target.closest("button"))) return; const up = () => { removeEventListener("pointerup", up, true); setTimeout(() => save(el, key), 0); }; addEventListener("pointerup", up, true); });
    el.addEventListener("pointerdown", () => front(el), true);
  }
  // a pop-up (centered on a dim backdrop): dragged by its title, back where it was last time
  function modal(box, key) {
    if (!box || !KEYS.includes(key)) return;
    requestAnimationFrame(() => modalNow(box, key));   // (its content is filled in right after it's made)
  }
  function modalNow(box, key) {
    const title = box.querySelector(".we-title") || box.firstElementChild; if (!title) return;
    title.style.cursor = "move"; title.style.touchAction = "none";
    const fix = () => { const r = box.getBoundingClientRect(); box.style.position = "fixed"; box.style.margin = "0"; box.style.left = r.left + "px"; box.style.top = r.top + "px"; };
    if (pos[key]) { fix(); place(box, key); }
    title.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; e.preventDefault(); fix(); const r0 = box.getBoundingClientRect(), ox = e.clientX - r0.left, oy = e.clientY - r0.top;
      const mv = (ev) => { const r = box.getBoundingClientRect(); box.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - ox)) + "px"; box.style.top = Math.max(0, Math.min(innerHeight - r.height, ev.clientY - oy)) + "px"; };
      const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); save(box, key); };
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    });
  }
  window.WinPos = {
    set(o) { pos = {}; if (o && typeof o === "object") for (const k of KEYS) { const p = o[k]; if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) pos[k] = { x: p.x, y: p.y }; } },
    setSend(f) { send = f; }, place, save, watch, modal, front,
  };
})();
