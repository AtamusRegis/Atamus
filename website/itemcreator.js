// (owner, 2026-10-15) The Item Creator (was the Weapon panel; staff: Nyssary and admins): Z, or the [Z] button in the
// staff column, opens it. A scrollable grid of item slots (5 a row), every item. A slot drags into the hotbar or the
// inventory (inventory.js does the dragging: these slots hand out copies). Right-click a slot: Edit Item / Delete.
// Below: Create New Item, a pop-up with a name, an icon box ([+]: pick one of the existing icons) with Create New Icon on
// its left (the Icon Creator), then Cancel / Create. Edit Item opens the item's own menu (its properties: the name and
// icon for now; what an item does will be made there). ENTER saves. Everything is saved on the server and checked again
// there. (owner, 2026-10-15) Making weapons (and their numbers) was scrapped from here for now: it comes back as part of
// this. game3d.js hands it a send function; the lists come from the Catalog (icons.js).
(function () {
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
    zbtn = btn("Z"); zbtn.id = "item-btn"; zbtn.title = "Item Creator";
    (document.getElementById("staff-col") || document.body).appendChild(zbtn);   // (owner, 2026-10-14) the staff column on the right edge
    zbtn.addEventListener("click", () => toggle());
    win = $("div"); win.id = "item-edit"; win.hidden = true;
    const top = $("div", "we-top"); top.append($("span", "we-title", "ITEM CREATOR"), btn("\u00d7", "we-x", () => toggle(false)));
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
    const make = $("div", "we-make"); make.append(btn("Create New Item", "", () => itemBox(null)));
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
    const keys = C().items.map((x) => "it:" + x.id);
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
  // ---- right-click: Edit Item / Delete ----
  function closeMenu() { if (ctx) { ctx.remove(); ctx = null; } }
  function menu(key, x, y) {
    closeMenu(); const it = C().item(key); if (!it) return;
    ctx = $("div", "we-ctx");
    ctx.appendChild(btn("Edit Item", "", () => { closeMenu(); itemBox(it); }));
    ctx.appendChild(btn("Delete", "", () => { closeMenu(); api.send({ t: "itemdel", id: it.id }); }));
    document.body.appendChild(ctx);
    const r = ctx.getBoundingClientRect(); ctx.style.left = Math.min(x, innerWidth - r.width - 4) + "px"; ctx.style.top = Math.min(y, innerHeight - r.height - 4) + "px";
  }

  // ---- Create New Item (and Edit Item: the item's menu): name, icon, Cancel / Create ----
  function itemBox(edit) {
    const o = overlay("we-item"), base = edit && edit.data; let icon = base ? base.icon || null : null;
    o.box.appendChild($("p", "we-title", edit ? "ITEM PROPERTIES" : "NEW ITEM"));
    const name = $("input"); name.maxLength = 32; name.value = base ? base.name : "";
    const grid = $("div", "we-grid"); grid.append($("label", "we-label", "Name"), name);
    const iconRow = $("div", "we-iconrow"), mk = btn("Create New Icon", "", () => creator((id) => { icon = id; drawIcon(); })), box = btn("", "we-iconbox", () => picker((id) => { icon = id; drawIcon(); }));
    box.title = "Icon";
    const drawIcon = () => { const ic = icon && C().icons.get(icon); box.replaceChildren(ic ? C().svg(ic, 30) : $("span", "we-plus", "+")); };
    drawIcon(); iconRow.append(mk, box);
    const err = $("p", "we-err"); err.hidden = true;
    const ok = btn(edit ? "SAVE" : "CREATE", "we-ok", save), btns = $("div", "we-btns"); btns.append(btn("CANCEL", "", () => o.close()), ok);
    o.box.append(grid, iconRow, err, btns);
    o.box.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } });   // (owner) ENTER saves
    setTimeout(() => name.focus(), 0);
    function save() {
      if (ok.disabled) return;
      const n = name.value.trim(); if (!n) { err.textContent = "Give it a name."; err.hidden = false; return; }
      ok.disabled = true; err.hidden = true;
      pending = { type: "itemsaved", done: () => o.close(), fail: (t) => { ok.disabled = false; err.textContent = t; err.hidden = false; } };
      api.send({ t: "itemset", ...(edit ? { id: edit.id } : {}), item: { name: n, icon } });
    }
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
  // thickness) and a fill (on / off, color, thickness = how solid). [ moves the selected shape a layer up, ] a layer down.
  // (owner, 2026-10-14) With a shape selected: drag a box on empty space to select its corners (Shift adds, Ctrl takes
  // away), Shift+click a corner adds it, Ctrl+click takes it away; dragging moves every selected corner, snapping into line
  // (across or up and down) with other corners nearby. Arrow keys (and the X / Y fields) move the selected corners, or the
  // shape. Copy / Cut / Paste / Delete (Ctrl+C / X / V, Delete, or right-click) and Flip X / Flip Y. Ctrl+Z undoes.
  // Cancel / Save (a saved icon is picked for the item at once).
  const SV = "http://www.w3.org/2000/svg", MAX_SHAPES = 40, MAX_PTS = 24, ALIGN = 1.2;
  const sv = (tag, attrs, parent) => { const n = document.createElementNS(SV, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const BASICS = {
    circle: () => ({ t: "ellipse", p: [32, 32, 14, 14] }),
    square: () => ({ t: "poly", p: [18, 18, 46, 18, 46, 46, 18, 46] }),
    triangle: () => ({ t: "poly", p: [32, 16, 48, 46, 16, 46] }),
  };
  const BASIC_NAMES = { circle: "Circle", square: "Square", triangle: "Triangle", poly: "Polygon" };
  const BASIC_ICONS = { circle: '<circle cx="12" cy="12" r="7"/>', square: '<rect x="5" y="5" width="14" height="14"/>', triangle: '<polygon points="12,4 20,19 4,19"/>', poly: '<polygon points="5,9 12,4 19,8 17,19 7,18"/>' };
  let clip = null;                              // the copied shape (kept while the page is open)
  function creator(onSaved) {
    const style = { son: true, sc: "#0b1220", sw: 2, fon: true, fc: "#9fb3cf", fo: 1 };
    let shapes = [], sel = -1, pts = new Set(), tool = "", draft = [], drag = null, past = [], marq = null, guides = [], cmenu = null;
    const o = overlay("we-creator", keys);
    o.box.appendChild($("p", "we-title", "ICON CREATOR"));
    const body = $("div", "ic-body");
    // the shapes to add
    const tools = $("div", "ic-tools");
    for (const k of ["circle", "square", "triangle", "poly"]) {
      const b = btn("", "ic-tool", () => { if (k === "poly") { tool = tool === "poly" ? "" : "poly"; draft = []; select(-1); } else addShape(BASICS[k]()); drawTools(); render(); });
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
    const PX_ = field("X", num(-16, 80, 1)), PY_ = field("Y", num(-16, 80, 1));
    const flips = $("div", "ic-flips"); flips.append(btn("Flip X", "", () => flip("x")), btn("Flip Y", "", () => flip("y"))); props.appendChild(flips);
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
    // X / Y: where the selected corners (their middle) or the shape (its middle) are; typing or the arrows moves them there
    for (const [el, ax] of [[PX_, 0], [PY_, 1]]) {
      el.addEventListener("focus", () => { if (sel >= 0) snap(); });
      el.addEventListener("input", () => { const v = Math.round(Number(el.value)), c = where(); if (!c || !Number.isFinite(v)) return; moveSel(ax === 0 ? v - c[0] : 0, ax === 1 ? v - c[1] : 0); render(false); });
    }
    body.append(tools, cv, props);
    const err = $("p", "we-err"); err.hidden = true;
    const ok = btn("SAVE", "we-ok", save), btns = $("div", "we-btns"); btns.append(btn("CANCEL", "", () => o.close()), ok);
    o.box.append(body, err, btns);

    function snap() { past.push(JSON.stringify(shapes)); if (past.length > 100) past.shift(); }
    function select(i) { sel = i; pts = new Set(); if (i >= 0) showProps(shapes[i]); else showProps(style); }
    function addShape(geo) { if (shapes.length >= MAX_SHAPES) return; snap(); shapes.push({ ...geo, ...style }); select(shapes.length - 1); tool = ""; draft = []; }
    const unit = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 64, (e.clientY - r.top) / r.height * 64]; };
    const sn = (v) => Math.round(Math.max(-16, Math.min(80, v)));      // (owner, 2026-10-14) whole grid units only
    const isPoly = () => sel >= 0 && shapes[sel] && shapes[sel].t === "poly";
    // the middle of the selection: the selected corners, else the shape (an ellipse's center, a polygon's box)
    function where() {
      if (sel < 0) return null; const s = shapes[sel];
      if (pts.size && s.t === "poly") { let x = 0, y = 0; for (const k of pts) { x += s.p[k * 2]; y += s.p[k * 2 + 1]; } return [x / pts.size, y / pts.size]; }
      if (s.t === "ellipse") return [s.p[0], s.p[1]];
      const b = bbox(s); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    }
    function bbox(s) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let k = 0; k < s.p.length; k += 2) { x0 = Math.min(x0, s.p[k]); x1 = Math.max(x1, s.p[k]); y0 = Math.min(y0, s.p[k + 1]); y1 = Math.max(y1, s.p[k + 1]); } return [x0, y0, x1, y1]; }
    function moveSel(dx, dy) {                  // the selected corners, else the whole shape
      if (sel < 0) return; const s = shapes[sel], cl = (v) => Math.max(-16, Math.min(80, v));
      if (s.t === "ellipse") { s.p[0] = cl(s.p[0] + dx); s.p[1] = cl(s.p[1] + dy); return; }
      const ks = pts.size ? [...pts] : Array.from({ length: s.p.length / 2 }, (_, k) => k);
      for (const k of ks) { s.p[k * 2] = cl(s.p[k * 2] + dx); s.p[k * 2 + 1] = cl(s.p[k * 2 + 1] + dy); }
    }
    function flip(ax) {
      if (sel < 0) return; const s = shapes[sel]; if (s.t === "ellipse") return;   // (an ellipse is the same flipped)
      snap(); const b = bbox(s), c = ax === "x" ? b[0] + b[2] : b[1] + b[3], o0 = ax === "x" ? 0 : 1;
      for (let k = o0; k < s.p.length; k += 2) s.p[k] = c - s.p[k];
      render();
    }
    // copy / cut / paste / delete
    const copy = () => { if (sel >= 0) clip = JSON.parse(JSON.stringify(shapes[sel])); };
    function del() {
      if (sel < 0) return; const s = shapes[sel]; snap();
      if (s.t === "poly" && pts.size && s.p.length / 2 - pts.size >= 3) { s.p = s.p.filter((_, i) => !pts.has(i >> 1)); pts = new Set(); }   // selected corners (3 stay)
      else { shapes.splice(sel, 1); select(-1); }
      render();
    }
    function paste() {
      if (!clip || shapes.length >= MAX_SHAPES) return; snap();
      const s = JSON.parse(JSON.stringify(clip)); if (s.t === "ellipse") { s.p[0] += 2; s.p[1] += 2; } else for (let k = 0; k < s.p.length; k++) s.p[k] += 2;
      clip = JSON.parse(JSON.stringify(s)); shapes.push(s); select(shapes.length - 1); render();
    }
    function menu(x, y, onShape) {
      closeMenu(); cmenu = $("div", "we-ctx");
      if (onShape) { cmenu.append(btn("Copy", "", () => { copy(); closeMenu(); }), btn("Cut", "", () => { copy(); pts = new Set(); del(); closeMenu(); })); }
      if (clip) cmenu.appendChild(btn("Paste", "", () => { paste(); closeMenu(); }));
      if (onShape) { cmenu.append(btn("Delete", "", () => { pts = new Set(); del(); closeMenu(); }), btn("Flip X", "", () => { flip("x"); closeMenu(); }), btn("Flip Y", "", () => { flip("y"); closeMenu(); })); }
      if (!cmenu.children.length) { cmenu = null; return; }
      document.body.appendChild(cmenu); const r = cmenu.getBoundingClientRect();
      cmenu.style.left = Math.min(x, innerWidth - r.width - 4) + "px"; cmenu.style.top = Math.min(y, innerHeight - r.height - 4) + "px";
    }
    function closeMenu() { if (cmenu) { cmenu.remove(); cmenu = null; } }
    addEventListener("pointerdown", (e) => { if (cmenu && !cmenu.contains(e.target)) closeMenu(); }, true);

    function render(showXY = true) {
      while (cv.firstChild) cv.removeChild(cv.firstChild);
      sv("rect", { x: 0, y: 0, width: 64, height: 64, class: "ic-bg" }, cv);
      for (let i = 8; i < 64; i += 8) { sv("line", { x1: i, y1: 0, x2: i, y2: 64, class: "ic-grid" + (i === 32 ? " mid" : "") }, cv); sv("line", { x1: 0, y1: i, x2: 64, y2: i, class: "ic-grid" + (i === 32 ? " mid" : "") }, cv); }
      shapes.forEach((s, i) => {
        const el = C().shapeEl(s); el.classList.add("ic-shape"); cv.appendChild(el);
        el.addEventListener("pointerdown", (e) => {
          if (tool === "poly") return; e.preventDefault(); e.stopPropagation();
          if (i !== sel) select(i);
          if (e.button === 2) { render(); menu(e.clientX, e.clientY, true); return; }
          if (e.button !== 0) return;
          snap(); grab(e, { type: "move", u0: unit(e), p0: shapes[i].p.slice() }); render();
        });
      });
      for (const g of guides) sv("line", g[0] === "x" ? { x1: g[1], y1: -16, x2: g[1], y2: 80, class: "ic-guide" } : { x1: -16, y1: g[1], x2: 80, y2: g[1], class: "ic-guide" }, cv);
      if (sel >= 0 && shapes[sel]) handles(shapes[sel]);
      if (marq) { const [a, b] = marq; sv("rect", { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]), class: "ic-marq" }, cv); }
      if (tool === "poly" && draft.length) {
        sv("polyline", { points: draft.map((q) => q.join(",")).join(" "), class: "ic-draft" }, cv);
        draft.forEach((q, k) => sv("circle", { cx: q[0], cy: q[1], r: k === 0 ? 1.4 : 1, class: "ic-dpt" + (k === 0 ? " first" : "") }, cv));
      }
      if (showXY) { const c = where(); PX_.disabled = PY_.disabled = !c; PX_.value = c ? Math.round(c[0]) : ""; PY_.value = c ? Math.round(c[1]) : ""; }
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
        if (n < MAX_PTS) handle((s.p[a] + s.p[b]) / 2, (s.p[a + 1] + s.p[b + 1]) / 2, "ic-mid", (e) => {
          if (e.button !== 0) return; snap(); const at = b === 0 ? n : k + 1;
          s.p.splice(at * 2, 0, Math.round((s.p[a] + s.p[b]) / 2), Math.round((s.p[a + 1] + s.p[b + 1]) / 2));
          pts = new Set([at]); grabPts(e, at); render();
        });
      }
      for (let k = 0; k < n; k++) handle(s.p[k * 2], s.p[k * 2 + 1], "ic-h" + (pts.has(k) ? " on" : ""), (e) => {
        if (e.button === 2) { if (n > 3) { snap(); s.p.splice(k * 2, 2); pts = new Set(); render(); } return; }   // right-click removes a corner (3 stay)
        if (e.button !== 0) return;
        if (e.ctrlKey || e.metaKey) { pts.delete(k); render(); return; }   // (owner) Ctrl+click takes a corner out of the selection
        if (e.shiftKey) pts.add(k); else if (!pts.has(k)) pts = new Set([k]);   // Shift+click adds it
        snap(); grabPts(e, k); render();
      });
    }
    function grab(e, d) { drag = { ...d, id: e.pointerId }; try { cv.setPointerCapture(e.pointerId); } catch {} }
    function grabPts(e, k) { const s = shapes[sel]; grab(e, { type: "pts", k, u0: unit(e), p0: s.p.slice() }); }
    // the corners the moving ones may line up with: every other corner (and ellipse middle)
    function targets() {
      const xs = [], ys = [];
      shapes.forEach((s, i) => {
        if (s.t === "ellipse") { xs.push(s.p[0]); ys.push(s.p[1]); return; }
        for (let k = 0; k < s.p.length; k += 2) { if (i === sel && pts.has(k >> 1)) continue; xs.push(s.p[k]); ys.push(s.p[k + 1]); }
      });
      return [xs, ys];
    }
    cv.addEventListener("pointerdown", (e) => {     // empty canvas: (polygon tool) a new corner; (a polygon selected) a selection box; else deselect
      if (e.target.closest && e.target.closest(".ic-shape, .ic-h, .ic-mid")) return;
      if (e.button === 2) { e.preventDefault(); menu(e.clientX, e.clientY, false); return; }
      if (e.button !== 0) return; e.preventDefault();
      const u = unit(e), q = [sn(u[0]), sn(u[1])];
      if (tool === "poly") {
        if (draft.length >= 3 && Math.hypot(q[0] - draft[0][0], q[1] - draft[0][1]) < 2) { finishPoly(); return; }
        if (draft.length < MAX_PTS) draft.push(q); render(); return;
      }
      if (isPoly()) { marq = [u, u]; grab(e, { type: "marq", shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }); render(); return; }
      select(-1); render();
    });
    cv.addEventListener("dblclick", () => { if (tool === "poly") finishPoly(); });
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    function finishPoly() { if (draft.length >= 3) { const p = []; for (const q of draft) p.push(q[0], q[1]); addShape({ t: "poly", p }); } draft = []; tool = ""; drawTools(); render(); }
    cv.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const u = unit(e), [x, y] = u;
      if (drag.type === "marq") { marq[1] = u; render(); return; }
      if (sel < 0) return; const s = shapes[sel];
      if (drag.type === "move") { const dx = sn(x - drag.u0[0]), dy = sn(y - drag.u0[1]); if (s.t === "ellipse") { s.p[0] = drag.p0[0] + dx; s.p[1] = drag.p0[1] + dy; } else for (let k = 0; k < s.p.length; k += 2) { s.p[k] = drag.p0[k] + dx; s.p[k + 1] = drag.p0[k + 1] + dy; } }
      else if (drag.type === "pts") {
        // the grabbed corner follows the pointer in half-unit steps, lining up with another corner across or up and down
        // when close; every selected corner moves the same way
        let gx = sn(drag.p0[drag.k * 2] + x - drag.u0[0]), gy = sn(drag.p0[drag.k * 2 + 1] + y - drag.u0[1]);
        const [xs, ys] = targets(); guides = [];
        let bx = ALIGN, by = ALIGN, ax = null, ay = null;
        for (const v of xs) { const d = Math.abs(v - gx); if (d < bx) { bx = d; ax = v; } }
        for (const v of ys) { const d = Math.abs(v - gy); if (d < by) { by = d; ay = v; } }
        if (ax !== null) { gx = ax; guides.push(["x", ax]); } if (ay !== null) { gy = ay; guides.push(["y", ay]); }
        const dx = gx - drag.p0[drag.k * 2], dy = gy - drag.p0[drag.k * 2 + 1];
        for (const k of pts) { s.p[k * 2] = drag.p0[k * 2] + dx; s.p[k * 2 + 1] = drag.p0[k * 2 + 1] + dy; }
      }
      else if (drag.type === "ex") s.p[2] = Math.max(1, Math.abs(sn(x) - s.p[0]));
      else if (drag.type === "ey") s.p[3] = Math.max(1, Math.abs(sn(y) - s.p[1]));
      render();
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.type === "marq") {
        const [a, b] = marq, x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
        if (x1 - x0 < 0.6 && y1 - y0 < 0.6) { if (!drag.shift && !drag.ctrl) select(-1); }   // a plain click: deselect
        else {
          const s = shapes[sel], hit = []; for (let k = 0; k < s.p.length; k += 2) if (s.p[k] >= x0 && s.p[k] <= x1 && s.p[k + 1] >= y0 && s.p[k + 1] <= y1) hit.push(k >> 1);
          if (drag.ctrl) for (const k of hit) pts.delete(k); else { if (!drag.shift) pts = new Set(); for (const k of hit) pts.add(k); }
        }
        marq = null;
      }
      drag = null; guides = []; try { cv.releasePointerCapture(e.pointerId); } catch {} render();
    };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    // keys while it's open: [ / ] layers, Delete, Ctrl+C / X / V / Z, arrows move, Enter finishes a polygon (Escape: cancels a
    // polygon, else closes)
    function keys(e) {
      if (textInput(e.target) || (e.target && e.target.type === "number")) return false;
      const ctl = e.ctrlKey || e.metaKey;
      if (e.key === "[" || e.key === "]") {
        if (sel < 0) return true; const to = e.key === "[" ? sel + 1 : sel - 1; if (to < 0 || to >= shapes.length) return true;
        snap(); [shapes[sel], shapes[to]] = [shapes[to], shapes[sel]]; sel = to; render(); return true;
      }
      if (e.key === "Delete" || e.key === "Backspace") { del(); return true; }
      if (ctl && e.code === "KeyC") { copy(); return true; }
      if (ctl && e.code === "KeyX") { copy(); pts = new Set(); del(); return true; }
      if (ctl && e.code === "KeyV") { paste(); return true; }
      if (ctl && e.code === "KeyZ") { if (past.length) { shapes = JSON.parse(past.pop()); select(-1); render(); } return true; }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (arrows) { if (sel >= 0) { if (!e.repeat) snap(); const st = e.shiftKey ? 4 : 1; moveSel(arrows[0] * st, arrows[1] * st); render(); } return true; }
      if (e.key === "Enter" && tool === "poly") { finishPoly(); return true; }
      return false;
    }
    const closeIt = o.close; o.close = () => {
      if (cmenu) { closeMenu(); return; }
      if (tool === "poly" && draft.length) { draft = []; tool = ""; drawTools(); render(); return; }
      closeIt();
    };
    function save() {
      if (ok.disabled) return;
      if (!shapes.length) { err.textContent = "Add a shape first."; err.hidden = false; return; }
      const icon = { shapes: shapes.map((s) => ({ t: s.t, p: s.p.map((v) => Math.round(v)), fon: s.fon, fc: s.fc, fo: Math.round(s.fo * 100) / 100, son: s.son, sc: s.sc, sw: s.sw })) };
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
  window.ItemCreator = { mount, saved, toggle };
})();
