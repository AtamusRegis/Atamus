// (owner, 2026-10-14) The item catalog the server sends: items and icons (made in the Item Creator; owner, 2026-10-15: it
// was weapons and ammo in the Weapon panel). Items are keyed "it:<id>". Icons are shapes on a 64 x 64 grid (never raw SVG): Catalog.svg(icon, px) draws
// one. game3d.js fills it from the server; the inventory and the Weapon panel listen for changes.
(function () {
  const SV = "http://www.w3.org/2000/svg";
  const cat = { items: [], icons: new Map() }, subs = new Set(), got = new Set();
  const changed = () => { for (const f of subs) try { f(); } catch (e) { console.error(e); } };
  // one shape as an SVG element (the colors were checked on the server, and are checked again here)
  const col = (c, d) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : d);
  function shapeEl(s) {
    let el;
    if (s.t === "ellipse") { el = document.createElementNS(SV, "ellipse"); el.setAttribute("cx", s.p[0]); el.setAttribute("cy", s.p[1]); el.setAttribute("rx", s.p[2]); el.setAttribute("ry", s.p[3]); }
    else { el = document.createElementNS(SV, s.t === "line" ? "polyline" : "polygon"); const q = []; for (let i = 0; i + 1 < s.p.length; i += 2) q.push(s.p[i] + "," + s.p[i + 1]); el.setAttribute("points", q.join(" ")); }   // (owner, 2026-10-15) "line": the Pen's open, outline-only shape
    el.setAttribute("fill", s.fon && s.t !== "line" ? col(s.fc, "#ffffff") : "none"); el.setAttribute("fill-opacity", String(Math.max(0, Math.min(1, +s.fo || 0))));
    el.setAttribute("stroke", s.son && +s.sw > 0 ? col(s.sc, "#000000") : "none"); el.setAttribute("stroke-width", String(+s.sw || 0)); el.setAttribute("stroke-linejoin", "round"); el.setAttribute("stroke-linecap", "round");
    return el;
  }
  // (owner, 2026-10-15) a thumbnail icon (img: a picture rendered from a model): an <img>, filled in once it's fetched
  const pics = new Map();
  function picOf(icon, px) {
    const im = document.createElement("img"); im.width = im.height = px; im.alt = ""; im.draggable = false; im.className = "icon-img";
    const base = typeof API_BASE !== "undefined" ? API_BASE : location.origin, f = icon.img, v = pics.get(f);
    if (typeof v === "string") im.src = v;
    else { const p = v || fetch(base + "/game/assets/" + f).then((r) => (r.ok ? r.blob() : Promise.reject())).then((b) => { const u = URL.createObjectURL(b); pics.set(f, u); return u; }).catch(() => { pics.delete(f); });
      pics.set(f, p); p.then((u) => { if (u) im.src = u; }); }
    return im;
  }
  function svg(icon, px) {
    if (icon && typeof icon.img === "string") return picOf(icon, px);
    const e = document.createElementNS(SV, "svg"); e.setAttribute("viewBox", "0 0 64 64"); e.setAttribute("width", px); e.setAttribute("height", px); e.classList.add("icon-svg");
    if (icon && Array.isArray(icon.shapes)) for (const s of icon.shapes) e.appendChild(shapeEl(s));
    return e;
  }
  window.Catalog = {
    shapeEl, svg,
    get ready() { return got.has("items"); },   // (the list has arrived)
    get items() { return cat.items; }, get icons() { return cat.icons; },
    set(kind, list) {
      if (!Array.isArray(list)) return;
      if (kind === "icons") { cat.icons = new Map(list.map((i) => [i.id, i])); } else cat[kind] = list;
      got.add(kind); changed();
    },
    item(key) {                                // "it:3" -> { key, id, name, icon, data } or null
      const m = typeof key === "string" && /^it:([0-9]{1,9})$/.exec(key); if (!m) return null;
      const o = cat.items.find((x) => x.id === m[1]); if (!o) return null;
      return { key, id: o.id, name: o.name, icon: o.icon ? cat.icons.get(o.icon) || null : null, data: o };
    },
    // an item's picture for a slot: its icon, or (none yet) the first letter of its name
    picture(key, px) {
      const it = this.item(key); if (!it) return null;
      if (it.icon) return svg(it.icon, px);
      const d = document.createElement("span"); d.className = "icon-letter"; d.textContent = (it.name || "?").slice(0, 1).toUpperCase(); return d;
    },
    on(f) { subs.add(f); },
  };
})();
