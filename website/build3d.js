// (owner, 2026-10-13) The admin Build menu, for staff: [B] (or the B key) opens a slot row above the capacitor bar.
// Picking a slot gives a blueprint (a shimmering hologram) of that piece: it follows the pointer, the wheel scales it,
// holding R turns it slowly, and a left click places it (the blueprint stays for more; Escape or the slot again ends it).
// Clicking a placed piece picks it up the same way (pointer moves it, wheel scales, R turns; click drops it, Escape
// puts it back). Q cycles the variation (square, cylinder, triangle); Delete removes the held piece; Ctrl+C copies,
// Ctrl+X cuts (copies and removes) and Ctrl+V pastes a copy where the pointer is. The ship flies as usual meanwhile.
// Pieces belong to the server (everyone sees them, ships collide with them); this file only sends the edits.
import * as THREE from "./vendor/three.module.js";

export const SHAPES = ["square", "cylinder", "triangle"];
const KINDS = [...SHAPES, "ship"];
const NAMES = { square: "Square", cylinder: "Cylinder", triangle: "Triangle", ship: "Ship" };
let SHIP_D = 90;                               // a test ship's footprint: a circle the size of a real ship's collider
let BUILD_H = 50;
const MIN = 5, MAX = 1000;

// ---- the footprint, as the server works it out (keep the two the same) ----
// (owner, 2026-10-14) each kind's collider outline, in the model's own frame as fractions of its footprint (x across
// its width w, y along its depth d; a test ship's footprint is SHIP_R x 2 square). The Object Editor ([X]) can change
// them (any simple outline, concave allowed). (owner) They start as a 4-corner rectangle around the object: the
// shapes' own square, the ship model's 59.4 x 100 m box.
const box = (hx, hy) => [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
export const COLL_DEFAULT = { square: box(0.5, 0.5), triangle: box(0.5, 0.5), cylinder: box(0.5, 0.5), ship: box(0.33, 0.5556) };
// (owner, 2026-10-14) each kind's pivot: the point of the model it turns around, in the same fractions. A piece's
// position (x, y) is where its pivot is; the model and its outline sit around it. Default: the middle.
function toWorldPts(o, loc, pv) {              // fractions of the footprint, around the pivot, into the world
  const c = Math.cos(o.r), s = Math.sin(o.r), out = [];
  for (const [ux, uy] of loc) { const lx = (ux - pv[0]) * o.w, ly = (uy - pv[1]) * o.d; out.push(o.x + lx * c - ly * s, o.y + lx * s + ly * c); }
  return out;
}
// the sight outline in the world: [x0, y0, x1, y1, ...] (owner, 2026-10-14: it decides line of sight)
export function buildPoly(o, coll, piv) { return toWorldPts(o, (coll && coll[o.k]) || COLL_DEFAULT[o.k] || COLL_DEFAULT.square, (piv && piv[o.k]) || [0, 0]); }
// (owner, 2026-10-14) the movement collider: an ellipse [cx, cy, rx, ry] in the same fractions (ships bump into it),
// editable too; it starts as the footprint's own circle / ellipse. In the world, a 24-sided outline.
export const MOVE_DEFAULT = { square: [0, 0, 0.5, 0.5], triangle: [0, 0, 0.5, 0.5], cylinder: [0, 0, 0.5, 0.5], ship: [0, 0, 0.5, 0.5] };
export function movePoly(o, mov, piv) {
  const m = (mov && mov[o.k]) || MOVE_DEFAULT[o.k] || MOVE_DEFAULT.square, loc = [];
  for (let i = 0; i < 24; i++) loc.push([m[0] + Math.cos(i * Math.PI / 12) * m[2], m[1] + Math.sin(i * Math.PI / 12) * m[3]]);
  return toWorldPts(o, loc, (piv && piv[o.k]) || [0, 0]);
}
export function cleanMove(m) {                 // a submitted ellipse, checked as hostile
  if (!Array.isArray(m) || m.length !== 4) return null; const v = m.map(Number); if (!v.every(Number.isFinite)) return null;
  const r4 = (x) => Math.round(x * 10000) / 10000, cl = (x, a, b) => Math.max(a, Math.min(b, x));
  return [r4(cl(v[0], -1.5, 1.5)), r4(cl(v[1], -1.5, 1.5)), r4(cl(v[2], 0.02, 1.5)), r4(cl(v[3], 0.02, 1.5))];
}
export function cleanPivot(pv) {               // a submitted pivot, checked as hostile: two finite numbers inside +-1.5
  if (!Array.isArray(pv) || pv.length !== 2) return null; const [x, y] = pv.map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.round(Math.max(-1.5, Math.min(1.5, x)) * 10000) / 10000, Math.round(Math.max(-1.5, Math.min(1.5, y)) * 10000) / 10000];
}
export function polyRad(o, v) { let r = 0; for (let i = 0; i < v.length; i += 2) r = Math.max(r, Math.hypot(v[i] - o.x, v[i + 1] - o.y)); return r; }
// a ship's circle (radius R) out of an outline (concave works): out through the nearest edge
export function pushFromPoly(p, v, R, pushOut) {
  let inside = false, best = Infinity, bx = 0, by = 0;
  for (let i = 0; i < v.length; i += 2) {
    const ax = v[i], ay = v[i + 1], cx = v[(i + 2) % v.length], cy = v[(i + 3) % v.length], ex = cx - ax, ey = cy - ay, L2 = ex * ex + ey * ey || 1e-9;
    if ((ay > p.y) !== (cy > p.y) && p.x < ex * (p.y - ay) / (cy - ay) + ax) inside = !inside;
    const t = Math.max(0, Math.min(1, ((p.x - ax) * ex + (p.y - ay) * ey) / L2)), qx = ax + ex * t, qy = ay + ey * t, d = Math.hypot(p.x - qx, p.y - qy);
    if (d < best) { best = d; bx = qx; by = qy; }
  }
  if (inside) {
    let nx = bx - p.x, ny = by - p.y; const d = Math.hypot(nx, ny); if (d < 1e-6) { nx = 1; ny = 0; } else { nx /= d; ny /= d; }
    p.x = bx + nx * R; p.y = by + ny * R;
    const vn = (p.vx || 0) * nx + (p.vy || 0) * ny; if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; }
    return true;
  }
  return pushOut(p, bx, by, R);
}
// (owner, 2026-10-14) ships collide by their Movement ellipse (as a 24-sided outline, turned with the heading): convex
// outline against convex outline by separating axes. Returns how to push A out of B ({ nx, ny, d }) or null.
export function satPush(A, B) {
  let best = Infinity, bx = 0, by = 0;
  for (const P of [A, B]) for (let i = 0; i < P.length; i += 2) {
    let nx = -(P[(i + 3) % P.length] - P[i + 1]), ny = P[(i + 2) % P.length] - P[i]; const L = Math.hypot(nx, ny); if (L < 1e-9) continue; nx /= L; ny /= L;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < A.length; k += 2) { const t = A[k] * nx + A[k + 1] * ny; if (t < a0) a0 = t; if (t > a1) a1 = t; }
    for (let k = 0; k < B.length; k += 2) { const t = B[k] * nx + B[k + 1] * ny; if (t < b0) b0 = t; if (t > b1) b1 = t; }
    const o = Math.min(a1, b1) - Math.max(a0, b0); if (o <= 0) return null;
    if (o < best) { best = o; bx = nx; by = ny; }
  }
  const [ax, ay] = polyMid(A), [cx, cy] = polyMid(B); if ((ax - cx) * bx + (ay - cy) * by < 0) { bx = -bx; by = -by; }
  return { nx: bx, ny: by, d: best };
}
export function polyMid(v) { let x = 0, y = 0; for (let i = 0; i < v.length; i += 2) { x += v[i]; y += v[i + 1]; } return [x * 2 / v.length, y * 2 / v.length]; }
export function nudge(p, n, d) {               // move p by d along n, dropping the part of its velocity going back in
  p.x += n.nx * d; p.y += n.ny * d;
  const vn = (p.vx || 0) * n.nx + (p.vy || 0) * n.ny; if (vn < 0) { p.vx -= vn * n.nx; p.vy -= vn * n.ny; }
}
export const squarePoly = (x, y, h) => [x - h, y - h, x + h, y - h, x + h, y + h, x - h, y + h];
// where a segment first crosses an outline's edge (fraction 0-1), or null
export function segPoly(x0, y0, x1, y1, v) {
  const dx = x1 - x0, dy = y1 - y0; let best = null;
  for (let i = 0; i < v.length; i += 2) {
    const ax = v[i], ay = v[i + 1], ex = v[(i + 2) % v.length] - ax, ey = v[(i + 3) % v.length] - ay, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - x0) * ey - (ay - y0) * ex) / den, u = ((ax - x0) * dy - (ay - y0) * dx) / den;
    if (t > 1e-4 && t < 1 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}
// a submitted outline, checked as hostile: 3-64 points, finite, inside +-1.5 of the footprint; null if unusable
export function cleanColl(pts) {
  if (!Array.isArray(pts) || pts.length < 3 || pts.length > 64) return null;
  const out = [];
  for (const q of pts) { if (!Array.isArray(q) || q.length !== 2) return null; const [x, y] = q.map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([Math.round(Math.max(-1.5, Math.min(1.5, x)) * 10000) / 10000, Math.round(Math.max(-1.5, Math.min(1.5, y)) * 10000) / 10000]); }
  return out;
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
const pieceMat = new THREE.MeshStandardMaterial({ color: COLOR, roughness: 0.65, metalness: 0.1 });
export const builds = new Map();
export const colliders = {}, pivots = {}, movers = {};                 // (owner, 2026-10-14) the Object Editor's outlines by kind (the server's)               // id -> { id, k, x, y, w, d, r, poly, rad, mesh }

export function initBuild(ctx) {
  const { scene, camera, canvas, toWorld, send } = ctx;
  const ROT_SPEED = Math.PI / 2;               // (owner) R turns a piece slowly: a quarter turn a second

  // ---- the blueprint look (owner): a shimmering hologram ----
  const holoT = { value: 0 };
  const holoMat = new THREE.ShaderMaterial({
    uniforms: { uT: holoT }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vW; varying vec3 vN; varying vec3 vV;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uT; varying vec3 vW; varying vec3 vN; varying vec3 vV;
      float h(float x) { return fract(sin(x * 91.7) * 43758.5); }
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float scan = 0.5 + 0.5 * sin(vW.y * 0.9 - uT * 5.0);                          // bands running up the piece
        float sweep = smoothstep(0.92, 1.0, sin((vW.x + vW.z) * 0.012 - uT * 1.7));   // a bright sheen sweeping across
        float flick = 0.85 + 0.15 * h(floor(uT * 14.0));                              // a faint flicker
        vec3 col = mix(vec3(0.25, 0.75, 1.0), vec3(0.75, 0.95, 1.0), fres);
        float a = (0.22 + 0.55 * fres + 0.15 * scan + 0.35 * sweep) * flick;
        gl_FragColor = vec4(col * a, a);
      }`,
  });
  const holo = (obj, on) => obj.traverse((o) => { if (!o.isMesh) return; if (on) { if (!o.userData.mat) o.userData.mat = o.material; o.material = holoMat; } else if (o.userData.mat) { o.material = o.userData.mat; delete o.userData.mat; } });

  // poly / srad: the sight outline; mpoly / rad: the movement ellipse (what ships bump into)
  const hold = (b) => { b.poly = buildPoly(b, colliders, pivots); b.srad = polyRad(b, b.poly); b.mpoly = movePoly(b, movers, pivots); b.rad = polyRad(b, b.mpoly); };
  const pivotAt = (o) => { const pv = pivots[o.k] || [0, 0], lx = -pv[0] * o.w, ly = -pv[1] * o.d, c = Math.cos(o.r), s = Math.sin(o.r); return [o.x + lx * c - ly * s, o.y + lx * s + ly * c]; };   // where the model's middle goes
  function place(b) {
    if (b.mesh && b.mesh.userData.k !== b.k) { scene.remove(b.mesh); b.mesh = null; }
    if (!b.mesh) {
      // (owner) a test ship: the player ship's model (hidden out of sight like any other ship), parked
      b.mesh = b.k === "ship" ? ctx.makeShip() : new THREE.Mesh(GEO[b.k], ctx.farMat(pieceMat));   // (not drawn past the sight limit)
      Object.assign(b.mesh.userData, { k: b.k, id: b.id }); scene.add(b.mesh);
      if (held && held.id === b.id) holo(b.mesh, true);
    }
    const [mx, my] = pivotAt(b); b.mesh.position.copy(toWorld(mx, my, 0)); if (b.k !== "ship") b.mesh.scale.set(b.w, 1, b.d); b.mesh.rotation.y = b.r;
    hold(b);
  }
  function setBuild([id, k, x, y, w, d, r]) {
    if (held && held.id === id) return;        // the piece I'm holding is ahead of the server's echo
    const b = builds.get(id) || { id }; Object.assign(b, { k, x, y, w, d, r }); builds.set(id, b); place(b);
  }
  function unBuild(id) {
    const b = builds.get(id); if (!b) return;
    if (held && held.id === id) { holo(b.mesh, false); held = null; }
    scene.remove(b.mesh); builds.delete(id);
  }

  // ---- state ----
  // picking: the blueprint of a new piece ({ k, w, d, r }); held: a placed piece picked up ({ id, ox, oy, b0 })
  let staff = false, open = false, picking = null, held = null, clip = null, rDown = false, lastSend = 0;
  try { const c = JSON.parse(localStorage.getItem("atamus.buildclip") || "null"); if (c && KINDS.includes(c.k)) clip = c; } catch {}
  const mouse = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { capture: true, passive: true });

  // ---- UI: [B] and the slot row ----
  const btn = document.createElement("button"); btn.id = "build-btn"; btn.type = "button"; btn.textContent = "B"; btn.title = "Build"; btn.hidden = true;
  btn.addEventListener("click", () => toggle());
  const bar = document.createElement("div"); bar.id = "build-bar"; bar.hidden = true;
  const slot = document.createElement("div"); slot.className = "inv-slot build-slot"; bar.appendChild(slot);
  const shipSlot = document.createElement("div"); shipSlot.className = "inv-slot build-slot"; shipSlot.title = NAMES.ship; bar.appendChild(shipSlot);   // (owner) the second option: test ships
  shipSlot.innerHTML = '<svg viewBox="0 0 30 30" width="30" height="30" class="build-ico"><path d="M15 3 L23 25 L15 20 L7 25 Z"/></svg>';
  let slotShape = "square";
  const ICON = { square: '<rect x="5" y="5" width="20" height="20" rx="1.5"/>', cylinder: '<circle cx="15" cy="15" r="10.5"/>', triangle: '<path d="M15 4 L26 25 L4 25 Z"/>' };
  const drawSlot = () => { slot.innerHTML = '<svg viewBox="0 0 30 30" width="30" height="30" class="build-ico">' + ICON[slotShape] + "</svg>"; slot.title = NAMES[slotShape];
    slot.classList.toggle("sel", !!picking && picking.k !== "ship"); shipSlot.classList.toggle("sel", !!picking && picking.k === "ship"); };
  drawSlot();
  slot.addEventListener("click", () => { if (picking && picking.k !== "ship") stopPicking(); else startPicking(slotShape); });
  shipSlot.addEventListener("click", () => { if (picking && picking.k === "ship") stopPicking(); else startPicking("ship"); });
  document.body.append(bar);
  function mountBtn() { const row = document.getElementById("chat-row") || document.body; if (!btn.parentNode) row.insertBefore(btn, row.firstChild); if (!xbtn.parentNode) row.insertBefore(xbtn, row.firstChild); }

  function setStaff(v) { staff = !!v; btn.hidden = !staff; xbtn.hidden = !staff; if (staff) mountBtn(); if (!staff && open) toggle(false); if (!staff && eOpen) eToggle(false); }
  function toggle(v) {
    if (!staff) return;
    open = v === undefined ? !open : !!v;
    bar.hidden = !open; btn.classList.toggle("on", open);
    if (!open) { stopPicking(); drop(false); }
  }

  // ---- the blueprint of a new piece ----
  let ghost = null;
  function startPicking(k) {
    drop(true); if (ghost) { scene.remove(ghost); ghost = null; }
    const keep = picking && picking.k !== "ship" && k !== "ship" ? picking : null;   // switching shapes keeps the size and turn
    picking = k === "ship" ? { k, w: SHIP_D, d: SHIP_D, r: 0 } : { k, w: keep ? keep.w : 50, d: keep ? keep.d : 50, r: keep ? keep.r : 0 }; drawSlot();
  }
  function stopPicking() { picking = null; if (ghost) { scene.remove(ghost); ghost = null; } drawSlot(); }

  // ---- screen <-> ground ----
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function ndc(cx, cy) { const r = canvas.getBoundingClientRect(); return { x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }; }
  function ground(cx, cy) { ray.setFromCamera(ndc(cx, cy), camera); return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: -hit.z } : null; }

  // ---- picking up and dropping placed pieces ----
  const fields = (b) => ({ k: b.k, x: b.x, y: b.y, w: b.w, d: b.d, r: b.r });
  function push(b, now) { const t = performance.now(); if (!now && t - lastSend < 90) return; lastSend = t; send({ t: "bset", id: b.id, ...fields(b) }); }
  function create(o) { send({ t: "bnew", ...o }); }
  function pickUp(b, g) { stopPicking(); held = { id: b.id, ox: b.x - g.x, oy: b.y - g.y, b0: fields(b) }; holo(b.mesh, true); }
  function drop(commit) {                       // commit: keep where it is now; otherwise put it back where it was
    if (!held) return; const b = builds.get(held.id), b0 = held.b0; held = null; if (!b) return;
    if (!commit) Object.assign(b, b0);
    holo(b.mesh, false); place(b); push(b, true);
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!open || e.button !== 0) return;
    const g = ground(e.clientX, e.clientY);
    if (picking) { if (g && ctx.inside(g.x, g.y)) create({ k: picking.k, x: g.x, y: g.y, w: picking.w, d: picking.d, r: picking.r }); return; }
    if (held) { const b = builds.get(held.id); if (b && ctx.inside(b.x, b.y)) drop(true); return; }
    ray.setFromCamera(ndc(e.clientX, e.clientY), camera);
    const hits = ray.intersectObjects([...builds.values()].map((b) => b.mesh), true);
    let o = hits.length ? hits[0].object : null; while (o && !(o.userData && o.userData.id)) o = o.parent;
    if (o && g) pickUp(builds.get(o.userData.id), g);
  });

  // the wheel scales the blueprint or the held piece (test ships keep their size); it doesn't zoom the camera meanwhile
  addEventListener("wheel", (e) => {
    if (!open || e.target !== canvas) return;
    const t = picking || (held && builds.get(held.id)); if (!t) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (t.k === "ship") return;
    const f = Math.max(MIN / Math.min(t.w, t.d), Math.min(Math.pow(1.1, -e.deltaY / 100), MAX / Math.max(t.w, t.d)));
    t.w *= f; t.d *= f;
    if (held) { place(t); push(t, false); }
  }, { capture: true, passive: false });

  // ---- keys (only while the menu is open, and never while typing) ----
  addEventListener("keydown", (e) => {
    if (ctx.typing()) return;
    if (e.code === "KeyB" && !e.ctrlKey && !e.metaKey && !e.altKey) { if (staff) { e.preventDefault(); if (!e.repeat) toggle(); } return; }
    if (!open) return;
    const ctrl = e.ctrlKey || e.metaKey, b = held && builds.get(held.id);
    const eat = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (ctrl && e.code === "KeyC") { eat(); if (b) copy(b); return; }
    if (ctrl && e.code === "KeyX") { eat(); if (b) { copy(b); held = null; send({ t: "bdel", id: b.id }); } return; }
    if (ctrl && e.code === "KeyV") { eat(); if (clip) { const g = ground(mouse.x, mouse.y); if (g && ctx.inside(g.x, g.y)) create({ ...clip, x: g.x, y: g.y }); } return; }
    if (ctrl) return;
    if (e.code === "Delete") { eat(); if (b) { held = null; send({ t: "bdel", id: b.id }); } return; }
    if (e.code === "KeyR") { eat(); rDown = true; return; }
    if (e.code === "KeyQ") { eat(); if (e.repeat) return;
      if ((picking && picking.k === "ship") || (!picking && b && b.k === "ship")) return;   // a test ship has no variations
      const next = (k) => SHAPES[(SHAPES.indexOf(k) + 1) % SHAPES.length];
      if (picking) { picking.k = slotShape = next(picking.k); if (ghost) { scene.remove(ghost); ghost = null; } drawSlot(); }
      else if (b) { b.k = next(b.k); place(b); push(b, true); }
      else { slotShape = next(slotShape); drawSlot(); }
      return; }
    if (e.code === "Escape") { if (picking) stopPicking(); else if (held) drop(false); else toggle(false); }
  }, true);
  addEventListener("keyup", (e) => { if (e.code === "KeyR") rDown = false; });
  addEventListener("blur", () => { rDown = false; });
  function copy(b) { clip = { k: b.k, w: b.w, d: b.d, r: b.r }; try { localStorage.setItem("atamus.buildclip", JSON.stringify(clip)); } catch {} }

  // ---- every frame: the blueprint and the held piece follow the pointer; R turns them ----
  let lastF = performance.now();
  function frame() {
    const now = performance.now(), dt = Math.min(0.1, (now - lastF) / 1000); lastF = now; holoT.value = now / 1000;
    eRender(); gizFrame();
    if (!open) return;
    const g = ground(mouse.x, mouse.y), turn = rDown ? ROT_SPEED * dt : 0;
    if (picking) {
      picking.r = Math.atan2(Math.sin(picking.r - turn), Math.cos(picking.r - turn));
      if (!ghost || ghost.userData.k !== picking.k) {
        if (ghost) scene.remove(ghost);
        ghost = picking.k === "ship" ? ctx.makeShip() : new THREE.Mesh(GEO[picking.k], holoMat);
        holo(ghost, true); ghost.userData.k = picking.k; scene.add(ghost);
      }
      ghost.visible = !!g; if (g) { const [mx, my] = pivotAt({ ...picking, x: g.x, y: g.y }); ghost.position.copy(toWorld(mx, my, 0)); if (picking.k !== "ship") ghost.scale.set(picking.w, 1, picking.d); ghost.rotation.y = picking.r; }
    } else if (held) {
      const b = builds.get(held.id); if (!b) { held = null; return; }
      let moved = false;
      if (g) { const nx = g.x + held.ox, ny = g.y + held.oy; if ((nx !== b.x || ny !== b.y) && ctx.inside(nx, ny)) { b.x = nx; b.y = ny; moved = true; } }
      if (turn) { b.r = Math.atan2(Math.sin(b.r - turn), Math.cos(b.r - turn)); moved = true; }
      if (moved) { place(b); push(b, false); }
    }
  }


  // ---- (owner, 2026-10-14) the Object Editor: [X] (or the X key) opens a window with the same objects as the Build
  // menu, drawn top down, with its collider outline over it. Drag a corner to move it; click the dot in the middle of
  // an edge to add a corner there (and drag it); right-click a corner to remove it (3 at least). Every change is saved
  // and goes to everyone: all pieces of that kind take the new outline at once.
  const xbtn = document.createElement("button"); xbtn.id = "edit-btn"; xbtn.type = "button"; xbtn.textContent = "X"; xbtn.title = "Object Editor"; xbtn.hidden = true;
  const win = document.createElement("div"); win.id = "coll-edit"; win.hidden = true;
  const VIEW = 400;
  win.innerHTML = '<div class="ce-top"><span class="ce-title">Object Editor</span><button type="button" class="ce-x" title="Close">×</button></div><div class="ce-slots"></div><div class="ce-view"><canvas width="' + VIEW + '" height="' + VIEW + '"></canvas><svg width="' + VIEW + '" height="' + VIEW + '"></svg></div>';
  document.body.appendChild(win);
  const ceSlots = win.querySelector(".ce-slots"), ceCanvas = win.querySelector("canvas"), ceSvg = win.querySelector("svg");
  const ceShape = document.createElement("div"), ceShip = document.createElement("div");
  ceShape.className = ceShip.className = "inv-slot build-slot"; ceShip.title = NAMES.ship; ceShip.innerHTML = shipSlot.innerHTML; ceSlots.append(ceShape, ceShip);
  // three things per kind, picked with the buttons over the view (owner, 2026-10-14): Sight (where line of sight is
  // stopped: drag corners, click an edge's middle dot to add one, right-click to remove), Movement (where ships collide:
  // drag its middle to move it, a side handle to stretch it) and Pivot (where the ship turns around). The wheel zooms the
  // view; the header drags the window; Mirrored (on at first) keeps the left and right halves matching; Reset puts the
  // current one back to its start; Ctrl+Z / Ctrl+U undo and redo. While it's open, every piece's colliders (and every
  // ship's) are drawn in the world.
  let eOpen = false, eKind = "square", eShape = "square", eMode = "sight", ePts = null, ePv = [0, 0], eMv = [0, 0, 0.5, 0.5], eDrag = null, eRen = null, eScene = null, eCam = null, eMesh = null, eMeshK = null;
  let eZoom = 1, mirror = true, past = [], future = [], ePan = [0, 0];   // ePan: (owner) the view's middle, in footprint fractions (middle mouse pans)
  // (owner, 2026-10-14) two rulers: a horizontal and a vertical dashed red line, each dragged on its own; corners, the
  // ellipse's handles and the pivot snap to them when dragged close (in footprint fractions)
  const guide = { x: 0.25, y: 0.25 }, SNAP = 8;
  const modes = document.createElement("div"); modes.className = "ce-modes";
  for (const [k, label] of [["sight", "Sight"], ["move", "Movement"], ["pivot", "Pivot"]]) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.dataset.m = k; b.addEventListener("click", () => { eMode = k; eDrag = null; drawModes(); eDraw(); }); modes.appendChild(b);
  }
  ceSlots.after(modes);
  const foot = document.createElement("div"); foot.className = "ce-foot";
  foot.innerHTML = '<label class="ce-mirror"><input type="checkbox" checked> Mirrored</label><button type="button" class="ce-reset">Reset</button>';
  win.appendChild(foot);
  const mirrorBox = foot.querySelector("input"); mirrorBox.addEventListener("change", () => { mirror = mirrorBox.checked; mirrorBox.blur(); });
  foot.querySelector(".ce-reset").addEventListener("click", () => {
    snap();
    if (eMode === "sight") ePts = COLL_DEFAULT[eKind].map((q) => q.slice()); else if (eMode === "move") eMv = MOVE_DEFAULT[eKind].slice(); else ePv = [0, 0];
    eSave(); eDraw();
  });
  const drawModes = () => { for (const b of modes.children) b.classList.toggle("on", b.dataset.m === eMode); };
  // the window drags by its header
  const top = win.querySelector(".ce-top"); let wDrag = null;
  top.addEventListener("pointerdown", (e) => { if (e.button !== 0 || e.target.closest("button")) return; const r = win.getBoundingClientRect(); wDrag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top }; top.setPointerCapture(e.pointerId); e.preventDefault(); });
  top.addEventListener("pointermove", (e) => { if (!wDrag || e.pointerId !== wDrag.id) return; const W = win.offsetWidth, Hh = win.offsetHeight;
    win.style.left = Math.max(0, Math.min(innerWidth - W, e.clientX - wDrag.dx)) + "px"; win.style.top = Math.max(0, Math.min(innerHeight - Hh, e.clientY - wDrag.dy)) + "px"; win.style.transform = "none"; });
  const wEnd = (e) => { if (wDrag && e.pointerId === wDrag.id) wDrag = null; }; top.addEventListener("pointerup", wEnd); top.addEventListener("pointercancel", wEnd);

  const fp = () => (eKind === "ship" ? SHIP_D : 100);   // the footprint shown, m
  const H = () => fp() / eZoom;                          // half the view, m
  const S = () => fp() * VIEW / (2 * H());               // px per footprint fraction
  const toPx = ([ux, uy]) => [VIEW / 2 + (ux - ePan[0]) * S(), VIEW / 2 - (uy - ePan[1]) * S()];
  const fromPx = (px, py) => { const cl = (v) => Math.max(-1.5, Math.min(1.5, v)); return [cl((px - VIEW / 2) / S() + ePan[0]), cl(-(py - VIEW / 2) / S() + ePan[1])]; };
  ceSvg.addEventListener("wheel", (e) => { e.preventDefault(); e.stopPropagation(); eZoom = Math.max(0.5, Math.min(8, eZoom * Math.pow(1.1, -e.deltaY / 100))); if (eZoom <= 1) ePan = [0, 0]; eDraw(); }, { passive: false });
  // (owner) zoomed in, the middle mouse drags the view around
  let ePanDrag = null;
  ceSvg.addEventListener("pointerdown", (e) => { if (e.button !== 1) return; e.preventDefault(); e.stopPropagation(); ePanDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, p0: ePan.slice() }; try { ceSvg.setPointerCapture(e.pointerId); } catch {} }, true);
  ceSvg.addEventListener("pointermove", (e) => {
    if (!ePanDrag || e.pointerId !== ePanDrag.id) return; e.stopPropagation();
    const r = ceSvg.getBoundingClientRect(), k = VIEW / r.width / S(), cl = (v) => Math.max(-1.5, Math.min(1.5, v));
    ePan = [cl(ePanDrag.p0[0] - (e.clientX - ePanDrag.x) * k), cl(ePanDrag.p0[1] + (e.clientY - ePanDrag.y) * k)]; eDraw();
  }, true);
  const panEnd = (e) => { if (ePanDrag && e.pointerId === ePanDrag.id) { ePanDrag = null; try { ceSvg.releasePointerCapture(e.pointerId); } catch {} } };
  ceSvg.addEventListener("pointerup", panEnd, true); ceSvg.addEventListener("pointercancel", panEnd, true);
  ceSvg.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });   // no browser autoscroll
  const drawESlots = () => { ceShape.innerHTML = '<svg viewBox="0 0 30 30" width="30" height="30" class="build-ico">' + ICON[eShape] + "</svg>"; ceShape.title = NAMES[eShape];
    ceShape.classList.toggle("sel", eKind !== "ship"); ceShip.classList.toggle("sel", eKind === "ship"); };
  function eSetKind(k) {
    eKind = k; if (k !== "ship") eShape = k;
    ePts = (colliders[k] || COLL_DEFAULT[k]).map((q) => q.slice()); ePv = (pivots[k] || [0, 0]).slice(); eMv = (movers[k] || MOVE_DEFAULT[k]).slice();
    eDrag = null; past = []; future = []; ePan = [0, 0]; drawESlots(); drawModes(); eDraw();
  }
  ceShape.addEventListener("click", () => eSetKind(eKind === "ship" ? eShape : SHAPES[(SHAPES.indexOf(eShape) + 1) % SHAPES.length]));
  ceShip.addEventListener("click", () => eSetKind("ship"));
  win.querySelector(".ce-x").addEventListener("click", () => eToggle(false));
  xbtn.addEventListener("click", () => eToggle());
  function eToggle(v) {
    if (!staff) return;
    eOpen = v === undefined ? !eOpen : !!v; win.hidden = !eOpen; xbtn.classList.toggle("on", eOpen);
    if (eOpen) { if (!eRen) eInit(); eSetKind(eKind); }
    giz.visible = eOpen;
  }
  function eInit() {
    eRen = new THREE.WebGLRenderer({ canvas: ceCanvas, antialias: true, alpha: true }); eRen.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); eRen.setSize(VIEW, VIEW, false);
    eScene = new THREE.Scene(); eScene.add(new THREE.HemisphereLight(0x8fa7c8, 0x10141c, 1.0)); const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(300, 500, 200); eScene.add(sun);
    eCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000); eCam.up.set(0, 0, -1); eCam.position.set(0, 800, 0); eCam.lookAt(0, 0, 0);
  }
  function eRender() {
    if (!eOpen || !eRen) return;
    const key = eKind + (eKind === "ship" ? ":" + ctx.shipReady() : "");
    if (eMeshK !== key) {
      if (eMesh) eScene.remove(eMesh);
      eMesh = eKind === "ship" ? ctx.makeShipPlain() : new THREE.Mesh(GEO[eKind], pieceMat);
      if (eKind !== "ship") eMesh.scale.set(fp(), 1, fp());
      eScene.add(eMesh); eMeshK = key;
    }
    const h = H(), ox = ePan[0] * fp(), oy = ePan[1] * fp(); eCam.left = ox - h; eCam.right = ox + h; eCam.top = oy + h; eCam.bottom = oy - h; eCam.updateProjectionMatrix();
    eRen.render(eScene, eCam);
  }
  // ---- undo / redo: the kind's three things before each change ----
  const state = () => JSON.stringify({ pts: ePts, pv: ePv, mv: eMv });
  const apply = (j) => { const o = JSON.parse(j); ePts = o.pts; ePv = o.pv; eMv = o.mv; eSave(); eDraw(); };
  function snap() { past.push(state()); if (past.length > 100) past.shift(); future = []; }
  function undo() { if (!past.length) return; future.push(state()); apply(past.pop()); }
  function redo() { if (!future.length) return; past.push(state()); apply(future.pop()); }
  // ---- mirrored editing: each corner's partner is the corner at its mirror image (left <-> right) ----
  const partner = (i) => { const [x, y] = ePts[i]; if (Math.abs(x) < 0.004) return -2; let best = -1, bd = 0.03;
    ePts.forEach(([a, b], j) => { if (j === i) return; const d = Math.hypot(a + x, b - y); if (d < bd) { bd = d; best = j; } }); return best; };   // -2: on the middle line
  const SV = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs) => { const n = document.createElementNS(SV, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); ceSvg.appendChild(n); return n; };
  const handle = (x, y, r, cls, onDown) => { const c = sv("circle", { cx: x, cy: y, r, class: cls }); c.addEventListener("pointerdown", onDown); return c; };
  function eDraw() {
    while (ceSvg.firstChild) ceSvg.removeChild(ceSvg.firstChild);
    if (!ePts) return;
    const px = ePts.map(toPx), [ex, ey] = toPx([eMv[0], eMv[1]]), erx = eMv[2] * S(), ery = eMv[3] * S(), [vx, vy] = toPx(ePv);
    // all three always drawn; the one being edited is bright and has handles
    sv("polygon", { points: px.map((p) => p.join(",")).join(" "), class: "ce-poly" + (eMode === "sight" ? "" : " dim") });
    sv("ellipse", { cx: ex, cy: ey, rx: erx, ry: ery, class: "ce-ell" + (eMode === "move" ? "" : " dim") });
    sv("path", { d: `M${vx - 9} ${vy} L${vx + 9} ${vy} M${vx} ${vy - 9} L${vx} ${vy + 9}`, class: "ce-piv" + (eMode === "pivot" ? "" : " dim") });
    const [gx, gy] = toPx([guide.x, guide.y]);   // the rulers
    for (const [x1, y1, x2, y2, ax] of [[0, gy, VIEW, gy, "y"], [gx, 0, gx, VIEW, "x"]]) {
      sv("line", { x1, y1, x2, y2, class: "ce-guide" });
      const hit = sv("line", { x1, y1, x2, y2, class: "ce-guide-hit" + (ax === "x" ? " v" : " h") });
      hit.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.preventDefault(); eGrab(e, "g" + ax); });
    }
    if (eMode === "sight") {
      px.forEach((p, i) => {                     // the middle of each edge: click to add a corner there
        const q = px[(i + 1) % px.length];
        handle((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 4, "ce-mid", (e) => { if (e.button !== 0) return; e.preventDefault(); snap(); eGrab(e, "pt", addCorner(i)); });
      });
      px.forEach((p, i) => handle(p[0], p[1], 6, "ce-pt", (e) => {
        e.preventDefault();
        if (e.button === 2) { removeCorner(i); return; }   // right-click removes it
        if (e.button === 0) { snap(); eGrab(e, "pt", i); }
      }));
    } else if (eMode === "move") {
      handle(ex, ey, 6, "ce-pt", (e) => { if (e.button === 0) { e.preventDefault(); snap(); eGrab(e, "mc"); } });
      for (const [hx, hy, ax] of [[ex + erx, ey, "x"], [ex - erx, ey, "x"], [ex, ey - ery, "y"], [ex, ey + ery, "y"]])
        handle(hx, hy, 6, "ce-sq", (e) => { if (e.button === 0) { e.preventDefault(); snap(); eGrab(e, "m" + ax); } });
    } else {
      handle(vx, vy, 7, "ce-pt", (e) => { if (e.button === 0) { e.preventDefault(); snap(); eGrab(e, "pv"); } });
    }
  }
  function addCorner(i) {                      // a corner in the middle of edge i (and, mirrored, on its mirror edge); returns its index
    const n = ePts.length, a = ePts[i], b = ePts[(i + 1) % n], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let mi = -1;
    if (mirror) { const pa = partner(i), pb = partner((i + 1) % n); if (pa >= 0 && pb >= 0 && (pb + 1) % n === pa && pb !== i) mi = pb; }   // the mirror edge runs pb -> pa
    if (mi < 0) { ePts.splice(i + 1, 0, m); return i + 1; }
    const mm = [-m[0], m[1]];
    if (mi > i) { ePts.splice(mi + 1, 0, mm); ePts.splice(i + 1, 0, m); return i + 1; }
    ePts.splice(i + 1, 0, m); ePts.splice(mi + 1, 0, mm); return i + 2;
  }
  function removeCorner(i) {
    const j = mirror ? partner(i) : -1, gone = j >= 0 ? [i, j] : [i];
    if (ePts.length - gone.length < 3) return;
    snap(); ePts = ePts.filter((_, k) => !gone.includes(k)); eSave(); eDraw();
  }
  function eGrab(e, type, i) { eDrag = { type, i, id: e.pointerId, mate: type === "pt" && mirror ? partner(i) : -1 }; try { ceSvg.setPointerCapture(e.pointerId); } catch {} eDraw(); }
  ceSvg.addEventListener("pointermove", (e) => {
    if (!eDrag || e.pointerId !== eDrag.id) return;
    const r = ceSvg.getBoundingClientRect(), u = fromPx((e.clientX - r.left) * VIEW / r.width, (e.clientY - r.top) * VIEW / r.height);
    if (eDrag.type === "gx") { guide.x = u[0]; eDraw(); return; }
    if (eDrag.type === "gy") { guide.y = u[1]; eDraw(); return; }
    if (Math.abs(u[0] - guide.x) * S() < SNAP) u[0] = guide.x;                 // snap to the rulers
    if (Math.abs(u[1] - guide.y) * S() < SNAP) u[1] = guide.y;
    if (eDrag.type === "pt") {
      const near = Math.abs(u[0]) * S() < SNAP, n = ePts.length;
      if (eDrag.mate === -2) {                   // mirrored, on the middle line: stays on it until dragged clear sideways,
        if (near) ePts[eDrag.i] = [0, u[1]];     // then (owner) it splits into a mirrored pair
        else {
          const i = eDrag.i, prev = ePts[(i - 1 + n) % n], next = ePts[(i + 1) % n], me = u, mm = [-u[0], u[1]];
          // the copy goes on the side of the neighbor that's on its own side, so the outline doesn't cross itself
          if ((prev[0] - next[0]) * u[0] >= 0) { ePts[i] = me; ePts.splice(i + 1, 0, mm); eDrag.mate = i + 1; }
          else { ePts[i] = mm; ePts.splice(i + 1, 0, me); eDrag.i = i + 1; eDrag.mate = i; }
        }
      } else if (eDrag.mate >= 0 && near) {      // (owner) a mirrored pair dragged together merges back into one on the middle line
        const keep = Math.min(eDrag.i, eDrag.mate), gone = Math.max(eDrag.i, eDrag.mate);
        if (n > 3) { ePts.splice(gone, 1); ePts[keep] = [0, u[1]]; eDrag.i = keep; eDrag.mate = -2; }
        else { ePts[eDrag.i] = u; ePts[eDrag.mate] = [-u[0], u[1]]; }
      } else { ePts[eDrag.i] = u; if (eDrag.mate >= 0) ePts[eDrag.mate] = [-u[0], u[1]]; }
    }
    else if (eDrag.type === "mc") { eMv[0] = mirror ? 0 : u[0]; eMv[1] = u[1]; }
    else if (eDrag.type === "mx") eMv[2] = Math.max(0.02, Math.abs(u[0] - eMv[0]));
    else if (eDrag.type === "my") eMv[3] = Math.max(0.02, Math.abs(u[1] - eMv[1]));
    else if (eDrag.type === "pv") ePv = [mirror ? 0 : u[0], u[1]];
    eDraw();
  });
  const eEnd = (e) => { if (!eDrag || e.pointerId !== eDrag.id) return; const g = eDrag.type[0] === "g"; eDrag = null; try { ceSvg.releasePointerCapture(e.pointerId); } catch {} if (!g) eSave(); eDraw(); };
  ceSvg.addEventListener("pointerup", eEnd); ceSvg.addEventListener("pointercancel", eEnd);
  const r4 = (x) => Math.round(x * 10000) / 10000;
  function eSave() { send({ t: "coll", k: eKind, pts: ePts.map(([x, y]) => [r4(x), r4(y)]), pv: ePv.map(r4), mv: eMv.map(r4) }); }
  function setColl(k, pts, pv, mv) {
    if (!KINDS.includes(k) || !Array.isArray(pts)) return;
    colliders[k] = pts; if (Array.isArray(pv)) pivots[k] = pv; if (Array.isArray(mv)) movers[k] = mv;
    for (const b of builds.values()) if (b.k === k) place(b);
    if (k === "ship" && ctx.onPivot) ctx.onPivot();
    if (eOpen && eKind === k && !eDrag) { ePts = pts.map((q) => q.slice()); ePv = (pivots[k] || [0, 0]).slice(); eMv = (movers[k] || MOVE_DEFAULT[k]).slice(); eDraw(); }
  }
  // ---- the colliders in the world while the editor is open: Sight outlines cyan, Movement orange, pivots purple ----
  const gizGeo = new THREE.BufferGeometry(); let gizCap = 0;
  const giz = new THREE.LineSegments(gizGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthTest: false }));
  giz.renderOrder = 10; giz.frustumCulled = false; giz.visible = false; scene.add(giz);
  const C_SIGHT = [0.62, 0.85, 1], C_MOVE = [1, 0.75, 0.35], C_PIV = [0.82, 0.7, 1];
  function gizFrame() {
    if (!eOpen) return;
    const P = [], C = [];
    const loop = (v, col) => { for (let i = 0; i < v.length; i += 2) { P.push(v[i], 2, -v[i + 1], v[(i + 2) % v.length], 2, -v[(i + 3) % v.length]); C.push(...col, ...col); } };
    const cross = (x, y) => { const a = 8; P.push(x - a, 2, -y, x + a, 2, -y, x, 2, -(y - a), x, 2, -(y + a)); for (let k = 0; k < 4; k++) C.push(...C_PIV); };
    for (const b of builds.values()) { loop(b.poly, C_SIGHT); loop(b.mpoly, C_MOVE); cross(b.x, b.y); }
    for (const s of ctx.shipGizmos ? ctx.shipGizmos() : []) { loop(s.sight, C_SIGHT); loop(s.move, C_MOVE); cross(s.x, s.y); }
    if (P.length > gizCap) { gizCap = Math.max(P.length, gizCap * 2, 3000); gizGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(gizCap), 3)); gizGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(gizCap), 3)); }
    gizGeo.attributes.position.array.set(P); gizGeo.attributes.color.array.set(C); gizGeo.attributes.position.needsUpdate = gizGeo.attributes.color.needsUpdate = true;
    gizGeo.setDrawRange(0, P.length / 3);
  }
  addEventListener("keydown", (e) => {
    if (ctx.typing() || !staff) return;
    if (e.code === "KeyX" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) eToggle(); return; }   // (staff: X is the editor, not a block)
    if (eOpen && (e.ctrlKey || e.metaKey) && (e.code === "KeyZ" || e.code === "KeyU")) { e.preventDefault(); e.stopImmediatePropagation(); if (e.code === "KeyZ") undo(); else redo(); return; }   // (owner) Ctrl+Z undo, Ctrl+U redo
    if (eOpen && e.code === "Escape" && !open) { eToggle(false); }
    if (eOpen && !open && e.code === "KeyQ" && eKind !== "ship") { e.preventDefault(); eSetKind(SHAPES[(SHAPES.indexOf(eShape) + 1) % SHAPES.length]); }
  }, true);

  function onMsg(m) {
    if (m.t === "build") { setBuild(m.o); return true; }
    if (m.t === "unbuild") { unBuild(m.id); return true; }
    if (m.t === "bnew") return true;
    if (m.t === "coll") { setColl(m.k, m.pts, m.pv, m.mv); return true; }
    return false;
  }
  // the ship model arrived (or changed): rebuild the test ships with it
  function refreshShips() { for (const b of builds.values()) if (b.k === "ship" && b.mesh) { scene.remove(b.mesh); b.mesh = null; place(b); } }
  function load(list, h, shipD, coll, piv, mov) {
    if (shipD) SHIP_D = shipD;
    for (const k of Object.keys(colliders)) delete colliders[k]; if (coll && typeof coll === "object") for (const k of KINDS) if (Array.isArray(coll[k])) colliders[k] = coll[k];
    for (const o of [pivots, movers]) for (const k of Object.keys(o)) delete o[k];
    for (const k of KINDS) { if (piv && Array.isArray(piv[k])) pivots[k] = piv[k]; if (mov && Array.isArray(mov[k])) movers[k] = mov[k]; }
    if (ctx.onPivot) ctx.onPivot();
    if (h && h !== BUILD_H) { BUILD_H = h; GEO = geos(); for (const b of builds.values()) { scene.remove(b.mesh); b.mesh = null; } }
    held = null;
    for (const id of [...builds.keys()]) unBuild(id);
    for (const o of list || []) setBuild(o);
  }
  return { onMsg, load, frame, setStaff, refreshShips, get open() { return open; } };
}
