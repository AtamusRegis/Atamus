// (owner, 2026-10-15) Number fields drag: press on one and drag sideways to change it (a step every 4 px; Shift: ten
// steps), staying within its min / max. A press without a drag just puts the cursor in the field as usual. Every change
// sends the field's input event, and letting go its change event, so each panel saves as if it was typed.
(function () {
  let d = null;
  document.addEventListener("pointerdown", (e) => {
    const i = e.target; if (!(i instanceof HTMLInputElement) || i.type !== "number" || i.disabled || e.button !== 0 || document.activeElement === i) return;
    const v = Number(i.value);
    d = { i, x: e.clientX, v0: Number.isFinite(v) ? v : 0, on: false, id: e.pointerId };
  }, true);
  document.addEventListener("pointermove", (e) => {
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x; if (!d.on) { if (Math.abs(dx) < 4) return; d.on = true; try { d.i.setPointerCapture(e.pointerId); } catch {} document.body.classList.add("num-dragging"); }
    e.preventDefault();
    const step = Number(d.i.step) > 0 ? Number(d.i.step) : 1, lo = d.i.min !== "" ? Number(d.i.min) : -Infinity, hi = d.i.max !== "" ? Number(d.i.max) : Infinity;
    const dec = (String(step).split(".")[1] || "").length;
    let v = d.v0 + Math.round(dx / 4) * step * (e.shiftKey ? 10 : 1); v = Math.max(lo, Math.min(hi, v)); v = Number(v.toFixed(dec));
    if (String(v) !== d.i.value) { d.i.value = String(v); d.i.dispatchEvent(new Event("input", { bubbles: true })); }
  }, true);
  const end = (e) => {
    if (!d || e.pointerId !== d.id) return; const o = d; d = null;
    if (o.on) { e.preventDefault(); document.body.classList.remove("num-dragging"); try { o.i.releasePointerCapture(e.pointerId); } catch {} o.i.dispatchEvent(new Event("change", { bubbles: true })); o.i.blur(); }
  };
  document.addEventListener("pointerup", end, true); document.addEventListener("pointercancel", end, true);
  // a drag isn't a click into the field
  document.addEventListener("click", (e) => { if (e.target instanceof HTMLInputElement && e.target.type === "number" && document.body.classList.contains("num-dragging")) e.preventDefault(); }, true);
})();
