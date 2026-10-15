// (owner, 2026-10-14) The item catalog the server sends: weapons, ammo and icons (made in the Weapon panel). Items are keyed
// "w:<id>" (a weapon) or "a:<id>" (ammo). Icons are shapes on a 64 x 64 grid (never raw SVG): Catalog.svg(icon, px) draws
// one. game3d.js fills it from the server; the inventory and the Weapon panel listen for changes.
(function () {
  const SV = "http://www.w3.org/2000/svg";
  const cat = { weapons: [], ammo: [], icons: new Map() }, subs = new Set(), got = new Set();
  const changed = () => { for (const f of subs) try { f(); } catch (e) { console.error(e); } };
  // one shape as an SVG element (the colors were checked on the server, and are checked again here)
  const col = (c, d) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : d);
  function shapeEl(s) {
    let el;
    if (s.t === "ellipse") { el = document.createElementNS(SV, "ellipse"); el.setAttribute("cx", s.p[0]); el.setAttribute("cy", s.p[1]); el.setAttribute("rx", s.p[2]); el.setAttribute("ry", s.p[3]); }
    else { el = document.createElementNS(SV, "polygon"); const q = []; for (let i = 0; i + 1 < s.p.length; i += 2) q.push(s.p[i] + "," + s.p[i + 1]); el.setAttribute("points", q.join(" ")); }
    el.setAttribute("fill", s.fon ? col(s.fc, "#ffffff") : "none"); el.setAttribute("fill-opacity", String(Math.max(0, Math.min(1, +s.fo || 0))));
    el.setAttribute("stroke", s.son && +s.sw > 0 ? col(s.sc, "#000000") : "none"); el.setAttribute("stroke-width", String(+s.sw || 0)); el.setAttribute("stroke-linejoin", "round");
    return el;
  }
  function svg(icon, px) {
    const e = document.createElementNS(SV, "svg"); e.setAttribute("viewBox", "0 0 64 64"); e.setAttribute("width", px); e.setAttribute("height", px); e.classList.add("icon-svg");
    if (icon && Array.isArray(icon.shapes)) for (const s of icon.shapes) e.appendChild(shapeEl(s));
    return e;
  }
  window.Catalog = {
    shapeEl, svg,
    get ready() { return got.has("weapons") && got.has("ammo"); },   // (both lists have arrived)
    get weapons() { return cat.weapons; }, get ammo() { return cat.ammo; }, get icons() { return cat.icons; },
    set(kind, list) {
      if (!Array.isArray(list)) return;
      if (kind === "icons") { cat.icons = new Map(list.map((i) => [i.id, i])); } else cat[kind] = list;
      got.add(kind); changed();
    },
    item(key) {                                // "w:3" / "a:2" -> { key, kind, name, icon } or null
      if (typeof key !== "string") return null;
      const [k, id] = key.split(":"), list = k === "w" ? cat.weapons : k === "a" ? cat.ammo : null;
      const o = list && list.find((x) => x.id === id); if (!o) return null;
      return { key, kind: k, id, name: o.name, icon: o.icon ? cat.icons.get(o.icon) || null : null, data: o };
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
