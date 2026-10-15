// (owner, 2026-10-14) The Weapon panel (staff: Nyssary and admins): Z, or the [Z] button in the staff column, opens it.
// A scrollable grid of item slots (5 a row): every weapon, then every ammo. A slot drags into the hotbar (the first slot
// is the primary weapon) or the inventory (inventory.js does the dragging: these slots hand out copies). Right-click a
// slot: Edit / Delete. Below: Create New Weapon / Create New Ammo, each a pop-up with a name, an icon box ([+]: pick one
// of the existing icons) with Create New Icon on its left (the Icon Creator), then Cancel / Create. Edit opens the same
// pop-up (a weapon's also has its numbers: outlined green if a change is better, red if worse, white if neither; ENTER
// saves). Everything is saved on the server and checked again there. game3d.js hands it a send function; the lists come
// from the Catalog (icons.js).
(function () {
  const FIELDS = [
    ["optimal", "Optimal Range", 10], ["falloff", "Falloff Rate", 1], ["life", "Lifetime", 0.01], ["speed", "Speed", 10],
    ["rate", "Shot Rate", 0.01], ["dmg", "Damage", 1], ["spread0", "Default Spread", 0.1], ["spreadAdd", "Spread Per Shot", 0.1],
    ["aimSpeed", "Aim Speed", 0.1], ["rotSpeed", "Rotation Speed", 1], ["reload", "Reload Speed", 0.1], ["mag", "Magazine", 1],
  ];
  // which way is better for each number: +1 more is better, -1 less is better
  const BETTER = { optimal: 1, falloff: -1, life: 1, speed: 1, rate: -1, dmg: 1, spread0: -1, spreadAdd: -1, aimSpeed: 1, rotSpeed: 1, reload: -1, mag: 1 };
  const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (text, cls, fn) => { const b = $("button", cls, text); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; };
  const C = () => window.Catalog;
  let api = null, win = null, zbtn = null, list = null, ctx = null, pending = null;
  const overlays = [];                          // open pop-ups, top last: { el, close, key }

  // ---- pop-up plumbing: a dim backdrop, the box in the middle; Escape closes the top one ----
  function overlay(cls, onKey) {
    const back = $("div", "we-back"), box = $("div", "we-modal " + cls); back.appendChild(box); document.body.appendChild(back);
    const o = { el: back, box, key: onKey, close() { back.remove(); const i = overlays.indexOf(o); if (i >= 0) overlays.splice(i, 1); } };
    back.addEventListener("pointerdown", (e) => { if (e.target === back) o.close(); });
    back.addEventListener("keydown", (e) => e.stopPropagation());   // typing in a pop-up never reaches the game
    back.addEventListener("contextmenu", (e) => e.preventDefault());
    overlays.push(o); return o;
  }
  const textInput = (el) => el && el.tagName === "INPUT" && !["range", "checkbox", "button", "color"].includes(el.type);
  // while a pop-up is open the game hears no keys (registered before the game's own listeners, so it runs first)
  addEventListener("keydown", (e) => {
    const top = overlays[overlays.length - 1]; if (!top) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); top.close(); return; }
    if (top.key && top.key(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!textInput(e.target)) e.stopImmediatePropagation();
  }, true);

  // ---- the main window ----
  function mount(a) {
    api = a; if (win) return;
    zbtn = btn("Z"); zbtn.id = "weapon-btn"; zbtn.title = "Weapons";
    (document.getElementById("staff-col") || document.body).appendChild(zbtn);   // (owner, 2026-10-14) the staff column on the right edge
    zbtn.addEventListener("click", () => toggle());
    win = $("div"); win.id = "weapon-edit"; win.hidden = true;
    const top = $("div", "we-top"); top.append($("span", "we-title", "WEAPONS"), btn("×", "we-x", () => toggle(false)));
    top.addEventListener("pointerdown", (e) => {   // (owner, 2026-10-14) dragged by its top bar
      if (e.button !== 0 || e.target.closest("button")) return; e.preventDefault();
      const r0 = win.getBoundingClientRect(), ox = e.clientX - r0.left, oy = e.clientY - r0.top;
      win.style.transform = "none"; win.style.left = r0.left + "px"; win.style.top = r0.top + "px";
      const move = (ev) => { const r = win.getBoundingClientRect();
        win.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - ox)) + "px"; win.style.top = Math.max(0, Math.min(innerHeight - r.height, ev.clientY - oy)) + "px"; };
      const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
      addEventListener("pointermove", move); addEventListener("pointerup", up);
    });
    list = $("div", "we-list");
    list.addEventListener("contextmenu", (e) => { e.preventDefault(); const it = e.target.closest(".inv-item"); if (it) menu(it.dataset.item, e.clientX, e.clientY); });
    const make = $("div", "we-make"); make.append(btn("Create New Weapon", "", () => itemBox("w")), btn("Create New Ammo", "", () => itemBox("a")));
    win.append(top, list, make); document.body.appendChild(win);
    win.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") toggle(false); });
    addEventListener("keydown", (e) => {
      if (e.code !== "KeyZ" || e.ctrlKey || e.metaKey || e.altKey || e.repeat || overlays.length) return;
      const t = document.activeElement; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      e.preventDefault(); toggle();
    });
    C().on(() => { if (!win.hidden) drawList(); });
    addEventListener("pointerdown", (e) => { if (ctx && !ctx.contains(e.target)) closeMenu(); }, true);
  }
  function drawList() {
    const keys = [...C().weapons.map((w) => "w:" + w.id), ...C().ammo.map((a) => "a:" + a.id)];
    const cells = keys.map((k) => {
      const c = $("div", "inv-slot"), it = C().item(k), el = $("div", "inv-item pic"); el.dataset.item = k; el.title = it ? it.name : "";
      const pic = C().picture(k, 26); if (pic) el.appendChild(pic); c.appendChild(el); return c;
    });
    for (let i = keys.length; i < Math.max(10, Math.ceil(keys.length / 5) * 5); i++) cells.push($("div", "inv-slot"));   // the row filled out with empty slots
    list.replaceChildren(...cells);
  }
  function toggle(open) {
    if (!win) return;
    const show = open === undefined ? win.hidden : !!open;
    win.hidden = !show; zbtn.classList.toggle("on", show);
    if (!show) { closeMenu(); while (overlays.length) overlays[overlays.length - 1].close(); if (document.activeElement && win.contains(document.activeElement)) document.activeElement.blur(); }
    else drawList();
  }
  // ---- right-click: Edit / Delete ----
  function closeMenu() { if (ctx) { ctx.remove(); ctx = null; } }
  function menu(key, x, y) {
    closeMenu(); const it = C().item(key); if (!it) return;
    ctx = $("div", "we-ctx");
    ctx.appendChild(btn("Edit", "", () => { closeMenu(); itemBox(it.kind, it); }));
    const first = it.kind === "w" && C().weapons.length && it.id === C().weapons.reduce((m, w) => (+w.id < +m.id ? w : m)).id;   // (the first weapon is everyone's: it stays)
    if (!first) ctx.appendChild(btn("Delete", "", () => { closeMenu(); api.send({ t: it.kind === "w" ? "wdel" : "adel", id: it.id }); }));
    document.body.appendChild(ctx);
    const r = ctx.getBoundingClientRect(); ctx.style.left = Math.min(x, innerWidth - r.width - 4) + "px"; ctx.style.top = Math.min(y, innerHeight - r.height - 4) + "px";
  }

  // ---- Create New Weapon / Ammo, and Edit: name, icon, (a weapon being edited: its numbers), Cancel / Create ----
  function itemBox(kind, edit) {
    const o = overlay("we-item"), base = edit && edit.data; let icon = base ? base.icon || null : null;
    o.box.appendChild($("p", "we-title", (edit ? "EDIT " : "NEW ") + (kind === "w" ? "WEAPON" : "AMMO")));
    const name = $("input"); name.maxLength = 32; name.value = base ? base.name : "";
    const grid = $("div", "we-grid"); grid.append($("label", "we-label", "Name"), name);
    const iconRow = $("div", "we-iconrow"), mk = btn("Create New Icon", "", () => creator((id) => { icon = id; drawIcon(); })), box = btn("", "we-iconbox", () => picker((id) => { icon = id; drawIcon(); }));
    box.title = "Icon";
    const drawIcon = () => { const ic = icon && C().icons.get(icon); box.replaceChildren(ic ? C().svg(ic, 30) : $("span", "we-plus", "+")); };
    drawIcon(); iconRow.append(mk, box);
    const inputs = {}, stats = $("div", "we-grid");
    if (kind === "w" && base) for (const [k, label, step] of FIELDS) {
      const i = $("input"); i.type = "number"; i.step = String(step); i.value = String(base[k]); inputs[k] = i; stats.append($("label", "we-label", label), i);
      i.addEventListener("input", () => { const v = Number(i.value), d = v - base[k]; i.classList.remove("we-up", "we-down"); if (Number.isFinite(v) && Math.abs(d) > 1e-9) i.classList.add(d * BETTER[k] > 0 ? "we-up" : "we-down"); });
    }
    if (base) name.addEventListener("input", () => name.classList.toggle("we-diff", name.value.trim() !== base.name));
    const err = $("p", "we-err"); err.hidden = true;
    const ok = btn(edit ? "SAVE" : "CREATE", "we-ok", save), btns = $("div", "we-btns"); btns.append(btn("CANCEL", "", () => o.close()), ok);
    o.box.append(grid, iconRow); if (stats.children.length) o.box.appendChild(stats); o.box.append(err, btns);
    o.box.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } });   // (owner) ENTER saves
    setTimeout(() => name.focus(), 0);
    function save() {
      if (ok.disabled) return;
      const n = name.value.trim(); if (!n) { err.textContent = "Give it a name."; err.hidden = false; return; }
      let msg;
      if (kind === "w") { const w = base ? { ...base, name: n, icon } : { name: n, icon }; for (const k in inputs) w[k] = Number(inputs[k].value); delete w.id; msg = { t: "wset", ...(edit ? { id: edit.id } : {}), w }; }
      else msg = { t: "aset", ...(edit ? { id: edit.id } : {}), a: { name: n, icon } };
      ok.disabled = true; err.hidden = true;
      pending = { type: kind === "w" ? "wsaved" : "asaved", done: () => o.close(), fail: (t) => { ok.disabled = false; err.textContent = t; err.hidden = false; } };
      api.send(msg);
    }
    o.box.dataset.k = kind;
  }
  // ---- the [+] box: pick one of the existing icons ----
  function picker(onPick) {
    const o = overlay("we-pick"); o.box.appendChild($("p", "we-title", "ICONS"));
    const g = $("div", "we-list");
    const draw = () => {
      const cells = [...C().icons.values()].map((ic) => { const c = btn("", "inv-slot we-pickslot", () => { onPick(ic.id); o.close(); }); c.appendChild(C().svg(ic, 34)); return c; });
      for (let i = cells.length; i < 10; i++) cells.push($("div", "inv-slot"));
      g.replaceChildren(...cells);
    };
    draw(); o.box.append(g, (() => { const b = $("div", "we-btns"); b.appendChild(btn("CANCEL", "", () => o.close())); return b; })());
  }

  // ---- the Icon Creator: an SVG editor on a 64 x 64 grid ----
  // (owner, 2026-10-14) basic shapes to add (circle, square, triangle) and a polygon tool to draw new ones; click a shape to
  // select it, drag it to move it, drag its corner handles to reshape it (a dot in the middle of an edge adds a corner there,
  // right-click a corner removes it), an ellipse's side handles stretch it. Each shape has an outline (on / off, color,
  // thickness) and a fill (on / off, color, thickness = how solid). [ moves the selected shape a layer up, ] a layer down;
  // Delete removes it; Ctrl+Z undoes. Cancel / Save (a saved icon is picked for the item at once).
  const SV = "http://www.w3.org/2000/svg", MAX_SHAPES = 40, MAX_PTS = 24;
  const sv = (tag, attrs, parent) => { const n = document.createElementNS(SV, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const BASICS = {
    circle: () => ({ t: "ellipse", p: [32, 32, 14, 14] }),
    square: () => ({ t: "poly", p: [18, 18, 46, 18, 46, 46, 18, 46] }),
    triangle: () => ({ t: "poly", p: [32, 16, 48, 46, 16, 46] }),
  };
  const BASIC_NAMES = { circle: "Circle", square: "Square", triangle: "Triangle", poly: "Polygon" };
  const BASIC_ICONS = { circle: '<circle cx="12" cy="12" r="7"/>', square: '<rect x="5" y="5" width="14" height="14"/>', triangle: '<polygon points="12,4 20,19 4,19"/>', poly: '<polygon points="5,9 12,4 19,8 17,19 7,18"/>' };
  function creator(onSaved) {
    const style = { son: true, sc: "#0b1220", sw: 2, fon: true, fc: "#9fb3cf", fo: 1 };
    let shapes = [], sel = -1, tool = "", draft = [], drag = null, past = [];
    const o = overlay("we-creator", keys);
    o.box.appendChild($("p", "we-title", "ICON CREATOR"));
    const body = $("div", "ic-body");
    // the shapes to add
    const tools = $("div", "ic-tools");
    for (const k of ["circle", "square", "triangle", "poly"]) {
      const b = btn("", "ic-tool", () => { if (k === "poly") { tool = tool === "poly" ? "" : "poly"; draft = []; sel = -1; } else addShape(BASICS[k]()); drawTools(); render(); });
      b.title = BASIC_NAMES[k]; b.dataset.k = k; b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22">' + BASIC_ICONS[k] + "</svg>"; tools.appendChild(b);
    }
    const drawTools = () => { for (const b of tools.children) b.classList.toggle("on", b.dataset.k === "poly" && tool === "poly"); };
    // the canvas
    const PX = 384, cv = sv("svg", { viewBox: "0 0 64 64", width: PX, height: PX, class: "ic-canvas" });
    // the properties
    const props = $("div", "ic-props");
    const field = (label, el) => { const l = $("label", "ic-field"); l.append($("span", "", label), el); props.appendChild(l); return el; };
    const chk = () => { const i = $("input"); i.type = "checkbox"; return i; }, color = () => { const i = $("input"); i.type = "color"; return i; };
    const num = (min, max, step) => { const i = $("input"); i.type = "number"; i.min = min; i.max = max; i.step = step; return i; };
    const rng = () => { const i = $("input"); i.type = "range"; i.min = 0; i.max = 100; i.step = 1; return i; };
    const P = { son: field("Outline", chk()), sc: field("Outline Color", color()), sw: field("Outline Thickness", num(0, 8, 0.5)), fon: field("Fill", chk()), fc: field("Fill Color", color()), fo: field("Fill Thickness", rng()) };
    const readProps = () => ({ son: P.son.checked, sc: P.sc.value, sw: Math.max(0, Math.min(8, Number(P.sw.value) || 0)), fon: P.fon.checked, fc: P.fc.value, fo: Math.max(0, Math.min(1, Number(P.fo.value) / 100)) });
    const showProps = (s) => { P.son.checked = s.son; P.sc.value = s.sc; P.sw.value = s.sw; P.fon.checked = s.fon; P.fc.value = s.fc; P.fo.value = Math.round(s.fo * 100); };
    showProps(style);
    for (const k in P) {
      P[k].addEventListener("focus", () => { if (sel >= 0) snap(); });
      P[k].addEventListener(P[k].type === "checkbox" ? "change" : "input", () => {
        if (P[k].type === "checkbox" && sel >= 0) snap();
        const v = readProps(); Object.assign(style, v); if (sel >= 0) Object.assign(shapes[sel], v); render();
      });
    }
    body.append(tools, cv, props);
    const err = $("p", "we-err"); err.hidden = true;
    const ok = btn("SAVE", "we-ok", save), btns = $("div", "we-btns"); btns.append(btn("CANCEL", "", () => o.close()), ok);
    o.box.append(body, err, btns);

    function snap() { past.push(JSON.stringify(shapes)); if (past.length > 100) past.shift(); }
    function addShape(geo) { if (shapes.length >= MAX_SHAPES) return; snap(); shapes.push({ ...geo, ...style }); sel = shapes.length - 1; tool = ""; draft = []; }
    const unit = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 64, (e.clientY - r.top) / r.height * 64]; };
    const sn = (v) => Math.round(Math.max(-16, Math.min(80, v)) * 2) / 2;      // (half-unit steps)
    function render() {
      while (cv.firstChild) cv.removeChild(cv.firstChild);
      sv("rect", { x: 0, y: 0, width: 64, height: 64, class: "ic-bg" }, cv);
      for (let i = 8; i < 64; i += 8) { sv("line", { x1: i, y1: 0, x2: i, y2: 64, class: "ic-grid" + (i === 32 ? " mid" : "") }, cv); sv("line", { x1: 0, y1: i, x2: 64, y2: i, class: "ic-grid" + (i === 32 ? " mid" : "") }, cv); }
      shapes.forEach((s, i) => {
        const el = C().shapeEl(s); el.classList.add("ic-shape"); cv.appendChild(el);
        el.addEventListener("pointerdown", (e) => {
          if (tool === "poly" || e.button !== 0) return; e.preventDefault(); e.stopPropagation();
          sel = i; showProps(shapes[i]); snap(); grab(e, { type: "move", u0: unit(e), p0: shapes[i].p.slice() }); render();
        });
      });
      if (sel >= 0 && shapes[sel]) handles(shapes[sel]);
      if (tool === "poly" && draft.length) {
        sv("polyline", { points: draft.map((q) => q.join(",")).join(" "), class: "ic-draft" }, cv);
        draft.forEach((q, k) => sv("circle", { cx: q[0], cy: q[1], r: k === 0 ? 1.4 : 1, class: "ic-dpt" + (k === 0 ? " first" : "") }, cv));
      }
    }
    function handle(x, y, cls, onDown) { const c = sv("circle", { cx: x, cy: y, r: cls === "ic-mid" ? 0.9 : 1.3, class: cls }, cv); c.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); onDown(e); }); return c; }
    function handles(s) {
      if (s.t === "ellipse") {
        const [cx, cy, rx, ry] = s.p;
        sv("rect", { x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry, class: "ic-sel" }, cv);
        for (const [x, y, ax] of [[cx + rx, cy, "x"], [cx - rx, cy, "x"], [cx, cy + ry, "y"], [cx, cy - ry, "y"]]) handle(x, y, "ic-h", (e) => { if (e.button !== 0) return; snap(); grab(e, { type: "e" + ax }); });
        return;
      }
      const n = s.p.length / 2;
      for (let k = 0; k < n; k++) {   // the middle of each edge: drag to add a corner there
        const a = k * 2, b = ((k + 1) % n) * 2;
        if (n < MAX_PTS) handle((s.p[a] + s.p[b]) / 2, (s.p[a + 1] + s.p[b + 1]) / 2, "ic-mid", (e) => { if (e.button !== 0) return; snap(); s.p.splice(b === 0 ? s.p.length : b, 0, (s.p[a] + s.p[b]) / 2, (s.p[a + 1] + s.p[b + 1]) / 2); grab(e, { type: "v", k: k + 1 }); render(); });
      }
      for (let k = 0; k < n; k++) handle(s.p[k * 2], s.p[k * 2 + 1], "ic-h", (e) => {
        if (e.button === 2) { if (n > 3) { snap(); s.p.splice(k * 2, 2); render(); } return; }   // right-click removes a corner (3 stay)
        if (e.button === 0) { snap(); grab(e, { type: "v", k }); }
      });
    }
    function grab(e, d) { drag = { ...d, id: e.pointerId }; try { cv.setPointerCapture(e.pointerId); } catch {} }
    cv.addEventListener("pointerdown", (e) => {     // empty canvas: deselect, or (polygon tool) a new corner
      if (e.button !== 0) return; e.preventDefault();
      const [x, y] = unit(e), q = [sn(x), sn(y)];
      if (tool === "poly") {
        if (draft.length >= 3 && Math.hypot(q[0] - draft[0][0], q[1] - draft[0][1]) < 2) { finishPoly(); return; }
        if (draft.length < MAX_PTS) draft.push(q); render(); return;
      }
      sel = -1; showProps(style); render();
    });
    cv.addEventListener("dblclick", () => { if (tool === "poly") finishPoly(); });
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    function finishPoly() { if (draft.length >= 3) { const p = []; for (const q of draft) p.push(q[0], q[1]); addShape({ t: "poly", p }); } draft = []; tool = ""; drawTools(); render(); }
    cv.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id || sel < 0) return;
      const s = shapes[sel], [x, y] = unit(e);
      if (drag.type === "move") { const dx = sn(x - drag.u0[0]), dy = sn(y - drag.u0[1]); if (s.t === "ellipse") { s.p[0] = drag.p0[0] + dx; s.p[1] = drag.p0[1] + dy; } else for (let k = 0; k < s.p.length; k += 2) { s.p[k] = drag.p0[k] + dx; s.p[k + 1] = drag.p0[k + 1] + dy; } }
      else if (drag.type === "v") { s.p[drag.k * 2] = sn(x); s.p[drag.k * 2 + 1] = sn(y); }
      else if (drag.type === "ex") s.p[2] = Math.max(0.5, Math.abs(sn(x) - s.p[0]));
      else if (drag.type === "ey") s.p[3] = Math.max(0.5, Math.abs(sn(y) - s.p[1]));
      render();
    });
    const end = (e) => { if (drag && e.pointerId === drag.id) { drag = null; try { cv.releasePointerCapture(e.pointerId); } catch {} render(); } };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    // keys while it's open: [ / ] layers, Delete, Ctrl+Z, Enter finishes a polygon (Escape: cancels a polygon, else closes)
    function keys(e) {
      if (textInput(e.target)) return false;
      if (e.key === "[" || e.key === "]") {
        if (sel < 0) return true; const to = e.key === "[" ? sel + 1 : sel - 1; if (to < 0 || to >= shapes.length) return true;
        snap(); [shapes[sel], shapes[to]] = [shapes[to], shapes[sel]]; sel = to; render(); return true;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && sel >= 0) { snap(); shapes.splice(sel, 1); sel = -1; render(); return true; }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { if (past.length) { shapes = JSON.parse(past.pop()); sel = -1; render(); } return true; }
      if (e.key === "Enter" && tool === "poly") { finishPoly(); return true; }
      return false;
    }
    const closeIt = o.close; o.close = () => { if (tool === "poly" && draft.length) { draft = []; tool = ""; drawTools(); render(); return; } closeIt(); };
    function save() {
      if (ok.disabled) return;
      if (!shapes.length) { err.textContent = "Add a shape first."; err.hidden = false; return; }
      const icon = { shapes: shapes.map((s) => ({ t: s.t, p: s.p.map((v) => Math.round(v * 10) / 10), fon: s.fon, fc: s.fc, fo: Math.round(s.fo * 100) / 100, son: s.son, sc: s.sc, sw: s.sw })) };
      if (JSON.stringify(icon).length > 15000) { err.textContent = "Too many shapes or corners to save."; err.hidden = false; return; }
      ok.disabled = true; err.hidden = true;
      pending = { type: "isaved", done: (m) => { closeIt(); onSaved(m.id); }, fail: (t) => { ok.disabled = false; err.textContent = t; err.hidden = false; } };
      api.send({ t: "iset", icon });
    }
    render();
  }

  // the server's answer to a save: done (the new id) or refused
  function saved(m) {
    if (!pending || pending.type !== m.t) return;
    const p = pending; pending = null;
    if (m.error) p.fail(m.error); else p.done(m);
  }
  window.WeaponPanel = { mount, saved, toggle, refresh() {} };
})();
