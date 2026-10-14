// (owner, 2026-10-13) The admin Build menu, for staff: [B] (or the B key) opens a slot row above the capacitor bar.
// Picking a slot puts a ghost of that piece under the pointer; a left click places it. While the menu is open:
// clicking a piece selects it; Q cycles its variation (square, cylinder, triangle); W / E / R pick the Position, Scale
// and Rotate controls drawn over it; Delete removes it; Ctrl+C copies, Ctrl+X cuts (copies and removes) and Ctrl+V
// pastes a copy where the pointer is. The ship doesn't take WASD while the menu is open (W is the Position control).
// Pieces belong to the server (everyone sees them, ships collide with them); this file only sends the edits.
import * as THREE from "./vendor/three.module.js";

export const SHAPES = ["square", "cylinder", "triangle"];
const KINDS = [...SHAPES, "ship"];
const NAMES = { square: "Square", cylinder: "Cylinder", triangle: "Triangle", ship: "Ship" };
let SHIP_D = 90;                               // a test ship's footprint: a circle the size of a real ship's collider
let BUILD_H = 50;
const MIN = 5, MAX = 1000;

// ---- the footprint, as the server works it out (keep the two the same) ----
export function buildPoly(o) {
  const hw = o.w / 2, hd = o.d / 2, c = Math.cos(o.r), s = Math.sin(o.r), out = [];
  const loc = o.k === "triangle" ? [[-hw, -hd], [hw, -hd], [0, hd]] : o.k === "cylinder" || o.k === "ship" ? Array.from({ length: 24 }, (_, i) => [Math.cos(i * Math.PI / 12) * hw, Math.sin(i * Math.PI / 12) * hd]) : [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  for (const [lx, ly] of loc) out.push(o.x + lx * c - ly * s, o.y + lx * s + ly * c);
  return out;
}
export function pushFromPoly(p, v, R, pushOut) {
  const n = v.length / 2; let inside = true, best = Infinity, bx = 0, by = 0, pen = Infinity, pnx = 0, pny = 0;
  for (let i = 0; i < n; i++) {
    const ax = v[2 * i], ay = v[2 * i + 1], ex = v[(2 * i + 2) % v.length] - ax, ey = v[(2 * i + 3) % v.length] - ay, L = Math.hypot(ex, ey) || 1;
    const nx = ey / L, ny = -ex / L, sd = (p.x - ax) * nx + (p.y - ay) * ny;
    if (sd > 0) inside = false; if (-sd < pen) { pen = -sd; pnx = nx; pny = ny; }
    const t = Math.max(0, Math.min(1, ((p.x - ax) * ex + (p.y - ay) * ey) / (L * L))), qx = ax + ex * t, qy = ay + ey * t, d = Math.hypot(p.x - qx, p.y - qy);
    if (d < best) { best = d; bx = qx; by = qy; }
  }
  if (inside) {
    p.x += pnx * (pen + R); p.y += pny * (pen + R);
    const vn = (p.vx || 0) * pnx + (p.vy || 0) * pny; if (vn < 0) { p.vx -= vn * pnx; p.vy -= vn * pny; }
    return true;
  }
  return pushOut(p, bx, by, R);
}
// where a segment first enters a convex polygon (fraction 0-1), or null (Cyrus-Beck)
export function segPoly(x0, y0, x1, y1, v) {
  const dx = x1 - x0, dy = y1 - y0, n = v.length / 2; let tE = 0, tL = 1;
  for (let i = 0; i < n; i++) {
    const ax = v[2 * i], ay = v[2 * i + 1], ex = v[(2 * i + 2) % v.length] - ax, ey = v[(2 * i + 3) % v.length] - ay;
    const nx = ey, ny = -ex, num = (ax - x0) * nx + (ay - y0) * ny, den = dx * nx + dy * ny;
    if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
    const t = num / den; if (den < 0) tE = Math.max(tE, t); else tL = Math.min(tL, t);
    if (tE > tL) return null;
  }
  return tE > 1e-4 && tE < 1 ? tE : null;
}

// ---- meshes: unit footprints, BUILD_H tall, standing on the grid; scaled to w x d and turned r ----
function geos() {
  const box = new THREE.BoxGeometry(1, BUILD_H, 1); box.translate(0, BUILD_H / 2, 0);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, BUILD_H, 40); cyl.translate(0, BUILD_H / 2, 0);
  const sh = new THREE.Shape([new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5), new THREE.Vector2(0, 0.5)]);
  const tri = new THREE.ExtrudeGeometry(sh, { depth: BUILD_H, bevelEnabled: false }); tri.rotateX(-Math.PI / 2);   // shape y -> north, depth -> up
  return { square: box, cylinder: cyl, triangle: tri };
}
let GEO = geos();
const COLOR = 0x8c96aa;
export const builds = new Map();               // id -> { id, k, x, y, w, d, r, poly, rad, mesh }

export function initBuild(ctx) {
  const { scene, camera, canvas, toWorld, send } = ctx;
  const hold = (b) => { b.poly = buildPoly(b); b.rad = Math.hypot(b.w, b.d) / 2; };
  function place(b) {
    if (b.mesh && b.mesh.userData.k !== b.k) { scene.remove(b.mesh); b.mesh = null; }
    if (!b.mesh) {
      // (owner) a test ship: the player ship's model (hidden out of sight like any other ship), parked
      b.mesh = b.k === "ship" ? ctx.makeShip() : new THREE.Mesh(GEO[b.k], new THREE.MeshStandardMaterial({ color: COLOR, roughness: 0.65, metalness: 0.1 }));
      b.mesh.userData = { k: b.k, id: b.id }; scene.add(b.mesh);
    }
    b.mesh.position.copy(toWorld(b.x, b.y, 0)); if (b.k !== "ship") b.mesh.scale.set(b.w, 1, b.d); b.mesh.rotation.y = b.r;
    hold(b);
  }
  function setBuild([id, k, x, y, w, d, r]) {
    if (drag && drag.id === id) return;        // my own drag is ahead of the server's echo
    const b = builds.get(id) || { id }; Object.assign(b, { k, x, y, w, d, r }); builds.set(id, b); place(b);
  }
  function unBuild(id) { const b = builds.get(id); if (!b) return; scene.remove(b.mesh); if (b.k !== "ship") b.mesh.material.dispose(); builds.delete(id); if (sel === id) select(null); }

  // ---- state ----
  let staff = false, open = false, picking = null, sel = null, tool = "pos", drag = null, clip = null, reqSeq = 1, pendingSel = 0, lastSend = 0;
  try { const c = JSON.parse(localStorage.getItem("atamus.buildclip") || "null"); if (c && KINDS.includes(c.k)) clip = c; } catch {}
  const mouse = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { capture: true, passive: true });

  // ---- UI: [B], the slot row, the controls layer ----
  const btn = document.createElement("button"); btn.id = "build-btn"; btn.type = "button"; btn.textContent = "B"; btn.title = "Build"; btn.hidden = true;
  btn.addEventListener("click", () => toggle());
  const bar = document.createElement("div"); bar.id = "build-bar"; bar.hidden = true;
  const slot = document.createElement("div"); slot.className = "inv-slot build-slot"; bar.appendChild(slot);
  const shipSlot = document.createElement("div"); shipSlot.className = "inv-slot build-slot"; shipSlot.title = NAMES.ship; bar.appendChild(shipSlot);   // (owner) the second option: test ships
  shipSlot.innerHTML = '<svg viewBox="0 0 30 30" width="30" height="30" class="build-ico"><path d="M15 3 L23 25 L15 20 L7 25 Z"/></svg>';
  shipSlot.addEventListener("click", () => { if (picking && picking.k === "ship") stopPicking(); else startPicking("ship"); });
  let slotShape = "square";
  const ICON = { square: '<rect x="5" y="5" width="20" height="20" rx="1.5"/>', cylinder: '<circle cx="15" cy="15" r="10.5"/>', triangle: '<path d="M15 4 L26 25 L4 25 Z"/>' };
  const drawSlot = () => { slot.innerHTML = '<svg viewBox="0 0 30 30" width="30" height="30" class="build-ico">' + ICON[slotShape] + "</svg>"; slot.title = NAMES[slotShape]; slot.classList.toggle("sel", !!picking && picking.k !== "ship"); shipSlot.classList.toggle("sel", !!picking && picking.k === "ship"); };
  drawSlot();
  slot.addEventListener("click", () => { if (picking && picking.k !== "ship") stopPicking(); else startPicking(slotShape); });
  const NS = "http://www.w3.org/2000/svg";
  const layer = document.createElementNS(NS, "svg"); layer.id = "build-gizmo"; layer.setAttribute("width", "100%"); layer.setAttribute("height", "100%");
  document.body.append(bar, layer);
  function mountBtn() { const row = document.getElementById("chat-row"); if (row && !btn.parentNode) row.insertBefore(btn, row.firstChild); else if (!btn.parentNode) document.body.appendChild(btn); }

  function setStaff(v) { staff = !!v; btn.hidden = !staff; if (staff) mountBtn(); if (!staff && open) toggle(false); }
  function toggle(v) {
    if (!staff) return;
    open = v === undefined ? !open : !!v;
    bar.hidden = !open; btn.classList.toggle("on", open);
    if (open) ctx.clearKeys(); else { stopPicking(); select(null); }
  }

  // ---- the ghost (picking a slot) ----
  let ghost = null;
  const ghostMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.45, depthWrite: false });
  function startPicking(k) { select(null); if (ghost) { scene.remove(ghost); ghost = null; } picking = k === "ship" ? { k, w: SHIP_D, d: SHIP_D, r: 0 } : { k, w: 50, d: 50, r: 0 }; drawSlot(); }
  function stopPicking() { picking = null; if (ghost) { scene.remove(ghost); ghost = null; } drawSlot(); }

  // ---- screen <-> ground ----
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function ndc(cx, cy) { const r = canvas.getBoundingClientRect(); return { x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }; }
  function ground(cx, cy) { ray.setFromCamera(ndc(cx, cy), camera); return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: -hit.z } : null; }
  const v3 = new THREE.Vector3();
  function scr(x, y, h = 0) { const r = canvas.getBoundingClientRect(); v3.set(x, h, -y).project(camera); return { x: r.left + (v3.x + 1) / 2 * r.width, y: r.top + (1 - v3.y) / 2 * r.height, ok: v3.z < 1 }; }

  // ---- selecting and editing ----
  function select(id) {
    const tint = (v) => { const b = sel && builds.get(sel); if (b && b.k !== "ship") b.mesh.material.emissive.setHex(v); };   // (a test ship shares the ship materials: no tint)
    tint(0x000000); sel = id && builds.has(id) ? id : null; drag = null; tint(0x1c3348);
  }
  const fields = (b) => ({ k: b.k, x: b.x, y: b.y, w: b.w, d: b.d, r: b.r });
  function push(b, now) { const t = performance.now(); if (!now && t - lastSend < 90) return; lastSend = t; send({ t: "bset", id: b.id, ...fields(b) }); }
  function create(o) { pendingSel = reqSeq++; send({ t: "bnew", q: pendingSel, ...o }); }

  canvas.addEventListener("pointerdown", (e) => {
    if (!open || e.button !== 0) return;
    const g = ground(e.clientX, e.clientY);
    if (picking) { if (g && ctx.inside(g.x, g.y)) create({ k: picking.k, x: g.x, y: g.y, w: picking.w, d: picking.d, r: picking.r }); stopPicking(); return; }
    ray.setFromCamera(ndc(e.clientX, e.clientY), camera);
    const hits = ray.intersectObjects([...builds.values()].map((b) => b.mesh), true);
    let o = hits.length ? hits[0].object : null; while (o && !(o.userData && o.userData.id)) o = o.parent;
    select(o ? o.userData.id : null);
  });

  // a control is grabbed: what the pointer does to the piece until it's let go
  function grab(e, kind, axis) {
    const b = builds.get(sel); const g = ground(e.clientX, e.clientY); if (!b || !g) return;
    e.preventDefault(); e.stopPropagation();
    drag = { id: b.id, kind, axis, pid: e.pointerId, g0: g, b0: fields(b), a0: Math.atan2(g.y - b.y, g.x - b.x) };
    try { layer.setPointerCapture(e.pointerId); } catch {}
  }
  layer.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const b = builds.get(drag.id), g = ground(e.clientX, e.clientY); if (!b || !g) return;
    const b0 = drag.b0, dx = g.x - drag.g0.x, dy = g.y - drag.g0.y;
    if (drag.kind === "move") {                  // the square: anywhere; an arrow: along north-south or east-west only
      const nx = b0.x + (drag.axis === "ns" ? 0 : dx), ny = b0.y + (drag.axis === "ew" ? 0 : dy);
      if (ctx.inside(nx, ny)) { b.x = nx; b.y = ny; }
    } else if (drag.kind === "scale") {          // an arrow moves its own side; the opposite side stays put
      const c = Math.cos(b0.r), s = Math.sin(b0.r), [ux, uy, sign, along] = { e: [c, s, 1, "w"], w: [c, s, -1, "w"], n: [-s, c, 1, "d"], s: [-s, c, -1, "d"] }[drag.axis];
      const half = b0[along] / 2, ax = b0.x - ux * sign * half, ay = b0.y - uy * sign * half;   // the opposite side's middle
      const len = Math.max(MIN, Math.min(MAX, ((g.x - ax) * ux + (g.y - ay) * uy) * sign));
      const nx = ax + ux * sign * len / 2, ny = ay + uy * sign * len / 2;
      if (ctx.inside(nx, ny)) { b[along] = len; b.x = nx; b.y = ny; }
    } else if (drag.kind === "rot") {            // turns by however far the grabbed point has gone round
      let r = b0.r + (Math.atan2(g.y - b0.y, g.x - b0.x) - drag.a0); r = Math.atan2(Math.sin(r), Math.cos(r)); b.r = r;
    }
    place(b); push(b, false);
  });
  const endDrag = (e) => { if (!drag || e.pointerId !== drag.pid) return; const b = builds.get(drag.id); drag = null; if (b) push(b, true); try { layer.releasePointerCapture(e.pointerId); } catch {} };
  layer.addEventListener("pointerup", endDrag); layer.addEventListener("pointercancel", endDrag);

  // ---- keys (only while the menu is open, and never while typing) ----
  addEventListener("keydown", (e) => {
    if (ctx.typing()) return;
    if (e.code === "KeyB" && !e.ctrlKey && !e.metaKey && !e.altKey) { if (staff) { e.preventDefault(); if (!e.repeat) toggle(); } return; }
    if (!open) return;
    const ctrl = e.ctrlKey || e.metaKey, b = sel && builds.get(sel);
    const eat = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (ctrl && e.code === "KeyC") { eat(); if (b) copy(b); return; }
    if (ctrl && e.code === "KeyX") { eat(); if (b) { copy(b); send({ t: "bdel", id: b.id }); } return; }
    if (ctrl && e.code === "KeyV") { eat(); if (clip) { const g = ground(mouse.x, mouse.y); if (g && ctx.inside(g.x, g.y)) create({ ...clip, x: g.x, y: g.y }); } return; }
    if (ctrl) return;
    if (e.code === "Delete") { eat(); if (b) send({ t: "bdel", id: b.id }); return; }
    if (e.code === "KeyQ") { eat(); if (e.repeat) return;
      if ((picking && picking.k === "ship") || (!picking && b && b.k === "ship")) return;   // a test ship has no variations
      if (picking) { picking.k = slotShape = SHAPES[(SHAPES.indexOf(picking.k) + 1) % SHAPES.length]; if (ghost) { scene.remove(ghost); ghost = null; } drawSlot(); }
      else if (b) { b.k = SHAPES[(SHAPES.indexOf(b.k) + 1) % SHAPES.length]; place(b); select(b.id); push(b, true); }
      else { slotShape = SHAPES[(SHAPES.indexOf(slotShape) + 1) % SHAPES.length]; drawSlot(); }
      return; }
    if (e.code === "KeyW") { eat(); tool = "pos"; return; }
    if (e.code === "KeyE") { eat(); tool = "scale"; return; }
    if (e.code === "KeyR") { eat(); tool = "rot"; return; }
    if (e.code === "KeyA" || e.code === "KeyS" || e.code === "KeyD") { eat(); return; }   // the ship sits still while building
    if (e.code === "Escape") { if (picking) stopPicking(); else if (sel) select(null); else toggle(false); }
  }, true);
  function copy(b) { clip = { k: b.k, w: b.w, d: b.d, r: b.r }; try { localStorage.setItem("atamus.buildclip", JSON.stringify(clip)); } catch {} }

  // ---- the controls over the selected piece: made once, moved every frame ----
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); (parent || layer).appendChild(n); return n; };
  const set = (n, attrs) => { for (const k in attrs) n.setAttribute(k, attrs[k]); };
  // a handle: a line from the piece with an arrowhead (Position) or a square (Scale, owner) at its end
  function makeArrow(parent, kind, axis, square) {
    const g = el("g", { class: "bz-h" }, parent);
    const a = { g, square, hit: el("line", { class: "bz-hit" }, g), line: el("line", { class: "bz-line" }, g), head: el("path", { class: "bz-head" }, g) };
    g.addEventListener("pointerdown", (e) => grab(e, kind, axis));
    return a;
  }
  function putArrow(a, x0, y0, ux, uy, len) {
    const x1 = x0 + ux * len, y1 = y0 + uy * len, px = -uy, py = ux, h = 9;
    set(a.hit, { x1: x0, y1: y0, x2: x1, y2: y1 });
    if (a.square) {                              // a square centered on the line's end, turned with it
      const q = 4.5, cx = x1 - ux * q, cy = y1 - uy * q;
      set(a.line, { x1: x0, y1: y0, x2: cx - ux * q, y2: cy - uy * q });
      set(a.head, { d: `M${cx + ux * q + px * q} ${cy + uy * q + py * q} L${cx + ux * q - px * q} ${cy + uy * q - py * q} L${cx - ux * q - px * q} ${cy - uy * q - py * q} L${cx - ux * q + px * q} ${cy - uy * q + py * q} Z` });
      return;
    }
    set(a.line, { x1: x0, y1: y0, x2: x1 - ux * h * 0.6, y2: y1 - uy * h * 0.6 });
    set(a.head, { d: `M${x1} ${y1} L${x1 - ux * h + px * h * 0.6} ${y1 - uy * h + py * h * 0.6} L${x1 - ux * h - px * h * 0.6} ${y1 - uy * h - py * h * 0.6} Z` });
  }
  const gPos = el("g", {}), gScale = el("g", {}), gRot = el("g", {});
  const posArrows = [[0, 1, "ns"], [0, -1, "ns"], [1, 0, "ew"], [-1, 0, "ew"]].map(([ux, uy, axis]) => ({ ux, uy, a: makeArrow(gPos, "move", axis) }));
  const posSq = el("rect", { width: 16, height: 16, rx: 2, class: "bz-sq" }, gPos); posSq.addEventListener("pointerdown", (e) => grab(e, "move", "free"));
  const scaleArrows = ["e", "w", "n", "s"].map((axis) => ({ axis, a: makeArrow(gScale, "scale", axis, true) }));
  const ringG = el("g", { class: "bz-h" }, gRot), ringHit = el("path", { class: "bz-hit" }, ringG), ringLine = el("path", { class: "bz-ring" }, ringG);
  ringG.addEventListener("pointerdown", (e) => grab(e, "rot"));
  const show = (g, v) => { g.style.display = v ? "" : "none"; };
  function screenDir(x, y, ux, uy) {             // a ground direction at (x, y), as a unit vector on screen
    const a = scr(x, y), b = scr(x + ux * 10, y + uy * 10), dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  }
  function frame() {
    if (open && picking) {                       // the ghost follows the pointer
      const g = ground(mouse.x, mouse.y);
      if (!ghost || ghost.userData.k !== picking.k) {
        if (ghost) scene.remove(ghost);
        if (picking.k === "ship") { ghost = ctx.makeShip(); ghost.traverse((o) => { if (o.isMesh) o.material = ghostMat; }); } else ghost = new THREE.Mesh(GEO[picking.k], ghostMat);
        ghost.userData.k = picking.k; scene.add(ghost);
      }
      ghost.visible = !!g; if (g) { ghost.position.copy(toWorld(g.x, g.y, 0)); if (picking.k !== "ship") ghost.scale.set(picking.w, 1, picking.d); ghost.rotation.y = picking.r; }
    }
    const b = open && sel && builds.get(sel), c = b && scr(b.x, b.y), on = !!(b && c.ok);
    show(gPos, on && tool === "pos"); show(gScale, on && tool === "scale" && b.k !== "ship"); show(gRot, on && tool === "rot");
    if (!on) return;
    if (tool === "pos") {
      for (const p of posArrows) { const [sx, sy] = screenDir(b.x, b.y, p.ux, p.uy); putArrow(p.a, c.x + sx * 14, c.y + sy * 14, sx, sy, 34); }
      set(posSq, { x: c.x - 8, y: c.y - 8 });
    } else if (tool === "scale") {
      const co = Math.cos(b.r), si = Math.sin(b.r), dirs = { e: [co, si, b.w / 2], w: [-co, -si, b.w / 2], n: [-si, co, b.d / 2], s: [si, -co, b.d / 2] };
      for (const p of scaleArrows) {
        const [ux, uy, half] = dirs[p.axis], mx = b.x + ux * half, my = b.y + uy * half, m = scr(mx, my), [sx, sy] = screenDir(mx, my, ux, uy);
        putArrow(p.a, m.x + sx * 6, m.y + sy * 6, sx, sy, 34);
      }
    } else {
      const R = b.rad + 25, pts = [];
      for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2, p = scr(b.x + Math.cos(a) * R, b.y + Math.sin(a) * R); pts.push(p.x.toFixed(1) + " " + p.y.toFixed(1)); }
      const d = "M" + pts.join(" L") + " Z"; set(ringHit, { d }); set(ringLine, { d });
    }
  }

  function onMsg(m) {
    if (m.t === "build") { setBuild(m.o); return true; }
    if (m.t === "unbuild") { unBuild(m.id); return true; }
    if (m.t === "bnew") { if (m.q === pendingSel && open) { select(m.id); tool = "pos"; } return true; }
    return false;
  }
  // the ship model arrived (or changed): rebuild the test ships with it
  function refreshShips() { for (const b of builds.values()) if (b.k === "ship" && b.mesh) { scene.remove(b.mesh); b.mesh = null; place(b); } }
  function load(list, h, shipD) {
    if (shipD) SHIP_D = shipD;
    if (h && h !== BUILD_H) { BUILD_H = h; GEO = geos(); for (const b of builds.values()) { scene.remove(b.mesh); b.mesh = null; } }
    for (const id of [...builds.keys()]) unBuild(id);
    for (const o of list || []) setBuild(o);
  }
  return { onMsg, load, frame, setStaff, refreshShips, get open() { return open; } };
}
