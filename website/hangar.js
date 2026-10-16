// (owner, 2026-10-15) the Hangar (H, or its button): the primary and secondary weapons and the ability (each applies at
// once), and the upgrades bought with credits, levels 1-10. Picking for one weapon slot what the other has swaps them.
export function initHangar({ send, def, gear, credits }) {
  const btn = document.getElementById("hangar-btn");
  const panel = document.createElement("div"); panel.id = "hangar"; panel.hidden = true; document.body.appendChild(panel);
  panel.addEventListener("pointerdown", (e) => e.stopPropagation());
  panel.addEventListener("mousedown", (e) => e.stopPropagation());
  let open = false;
  function toggle(v) { open = v === undefined ? !open : !!v; panel.hidden = !open; if (btn) btn.classList.toggle("on", open); draw(); }
  if (btn) btn.addEventListener("click", () => { toggle(); btn.blur(); });
  addEventListener("keydown", (e) => { if (open && e.code === "Escape") toggle(false); });
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text !== undefined) d.textContent = text; return d; };
  function pickRow(title, kinds, names, cur, onPick) {
    const sec = el("div", "hg-sec"); sec.appendChild(el("div", "hg-head", title));
    const row = el("div", "hg-row");
    for (const k of kinds) { const b = el("button", "hg-pick" + (k === cur ? " on" : ""), names(k)); b.type = "button"; b.addEventListener("click", () => { if (k !== cur) onPick(k); b.blur(); }); row.appendChild(b); }
    sec.appendChild(row); return sec;
  }
  function draw() {
    if (btn) btn.hidden = false;
    if (!open) return;
    const D = def(), G = gear(), cr = credits();
    const top = el("div", "hg-top"); top.append(el("span", "hg-title", "Hangar"), el("span", "hg-cr", cr.toLocaleString("en-US")));
    const x = el("button", "hg-x", "×"); x.type = "button"; x.addEventListener("click", () => toggle(false)); top.appendChild(x);
    const wname = (k) => (D.weapons[k] || {}).name || k;
    const setW = (s, k) => { const w = G.w.slice(); const o = w.indexOf(k); if (o >= 0 && o !== s) w[o] = w[s]; w[s] = k; send({ t: "gear", p: w[0], s: w[1], a: G.a }); };
    const prim = pickRow("Primary", D.wk, wname, G.w[0], (k) => setW(0, k));
    const sec = pickRow("Secondary", D.wk, wname, G.w[1], (k) => setW(1, k));
    const abil = pickRow("Ability", D.ak, (k) => (D.abilities[k] || {}).name || k, G.a, (k) => send({ t: "gear", p: G.w[0], s: G.w[1], a: k }));
    const ups = el("div", "hg-sec"); ups.appendChild(el("div", "hg-head", "Upgrades"));
    for (const [k, name] of D.upgrades) {
      const lv = (G.lv && G.lv[k]) || 1, row = el("div", "hg-up");
      const pips = el("span", "hg-pips"); for (let i = 1; i <= D.lvMax; i++) pips.appendChild(el("i", i <= lv ? "on" : ""));
      const cost = D.costs[lv - 1], max = lv >= D.lvMax, b = el("button", "hg-buy", max ? "Max" : cost.toLocaleString("en-US")); b.type = "button";
      b.disabled = max || cr < cost; b.addEventListener("click", () => { send({ t: "up", k }); b.blur(); });
      row.append(el("span", "hg-name", name), el("span", "hg-lv", String(lv)), pips, b); ups.appendChild(row);
    }
    panel.replaceChildren(top, prim, sec, abil, ups);
  }
  return { toggle, draw, get open() { return open; } };
}
