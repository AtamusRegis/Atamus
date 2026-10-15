// (owner, 2026-10-15) The editor windows remember where each account put them (kept on the server, sent with hello):
// CREATOR, RAW ASSETS, the Object Editor and the attributes panel. Moving one saves its spot when the drag ends; showing
// it again puts it back there (pulled inside the screen if the window is smaller now).
(function () {
  let pos = {}, send = () => {};
  const KEYS = ["creator", "assets", "objedit", "attrs"];
  function place(el, key) {
    const p = pos[key]; if (!p || !el || el.hidden) return;
    const r = el.getBoundingClientRect();
    el.style.transform = "none"; el.style.right = "auto"; el.style.bottom = "auto";
    el.style.left = Math.max(0, Math.min(innerWidth - r.width, p.x)) + "px"; el.style.top = Math.max(0, Math.min(innerHeight - r.height, p.y)) + "px";
  }
  function save(el, key) {
    if (!el || !KEYS.includes(key)) return; const r = el.getBoundingClientRect(), x = Math.round(r.left), y = Math.round(r.top);
    const p = pos[key]; if (p && p.x === x && p.y === y) return;
    pos[key] = { x, y }; send({ t: "ui", k: key, x, y });
  }
  // a drag handle: when a drag on it ends, the window's spot is saved
  function watch(handle, el, key) { handle.addEventListener("pointerdown", () => { const up = () => { removeEventListener("pointerup", up, true); setTimeout(() => save(el, key), 0); }; addEventListener("pointerup", up, true); }); }
  window.WinPos = {
    set(o) { pos = {}; if (o && typeof o === "object") for (const k of KEYS) { const p = o[k]; if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) pos[k] = { x: p.x, y: p.y }; } },
    setSend(f) { send = f; }, place, save, watch,
  };
})();
