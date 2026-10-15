// (owner, 2026-10-13) The admin Build menu, for staff: [B] (or the B key) opens a slot row above the capacitor bar.
// Picking a slot gives a blueprint (a shimmering hologram) of that piece: it follows the pointer, the wheel scales it,
// holding R turns it slowly, and a left click places it (the blueprint stays for more; Escape or the slot again ends it).
// Clicking a placed piece picks it up the same way (pointer moves it, wheel scales, R turns; click drops it, Escape
// puts it back). (owner, 2026-10-15: the Object Placer) Its slots: each object type from the Object Creator, the test ship and
// the nebula cloud. Delete removes the selected piece; Ctrl+C copies,
// Ctrl+X cuts (copies and removes) and Ctrl+V pastes a copy where the pointer is. The ship flies as usual meanwhile.
// Pieces belong to the server (everyone sees them, ships collide with them); this file only sends the edits.
import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

// (owner, 2026-10-15) the built-in kinds are the test ship and the nebula cloud (the square, cylinder and triangle are gone);
// everything else is an object type made in the Object Creator (head admin), keyed "t:<id>"
const KINDS = ["ship", "cloud"];
const NAMES = { ship: "Ship", cloud: "Nebula Cloud" };
export const types = new Map();                // id -> { id, name, cat, model, item, size, spin, bob }
export const isTypeKey = (k) => typeof k === "string" && /^t:[0-9]{1,9}$/.test(k);
const typeOf = (k) => (isTypeKey(k) ? types.get(k.slice(2)) || null : null);
const kindOk = (k) => KINDS.includes(k) || !!typeOf(k);
// (owner, 2026-10-14) nebula clouds: their own outline (meters around the pivot, before turning and scaling; w = scale %)
// and a color theme (Q). Each theme: deep, main and highlight colors.
export const CLOUD_THEMES = [
  [[0.3, 0.1, 0.5], [0.8, 0.3, 0.75], [1, 0.75, 0.95]],    // violet / pink
  [[0.04, 0.28, 0.38], [0.1, 0.72, 0.8], [0.75, 1, 1]],    // teal
  [[0.45, 0.15, 0.03], [0.95, 0.55, 0.15], [1, 0.9, 0.6]], // amber
  [[0.03, 0.3, 0.14], [0.2, 0.78, 0.45], [0.85, 1, 0.8]],  // emerald
  [[0.4, 0.03, 0.08], [0.9, 0.22, 0.25], [1, 0.75, 0.6]],  // crimson
];
export function cloudPoly(b) { const s = b.w / 100, c = Math.cos(b.r), n = Math.sin(b.r), out = []; for (const [lx, ly] of b.extra.pts) { const x = lx * s, y = ly * s; out.push(b.x + x * c - y * n, b.y + x * n + y * c); } return out; }
const CLOUD_START = [[-150, -150], [150, -150], [150, 150], [-150, 150]];
let SHIP_D = 90;                               // a test ship's footprint: a circle the size of a real ship's collider
let BUILD_H = 50;
const MIN = 5, MAX = 1000;

// ---- the footprint, as the server works it out (keep the two the same) ----
// (owner, 2026-10-14) each kind's collider outline, in the model's own frame as fractions of its footprint (x across
// its width w, y along its depth d; a test ship's footprint is SHIP_R x 2 square). The Object Editor ([X]) can change
// them (any simple outline, concave allowed). (owner) They start as a 4-corner rectangle around the object: the
// shapes' own square, the ship model's 59.4 x 100 m box.
const box = (hx, hy) => [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
// (owner, 2026-10-14) the combat points are parts: each an outline with a type (body, main engine, left engine, right
// engine, weapon emplacement), hit separately. For now every part's hit is plain HP damage.
export const PART_TYPES = ["body", "main", "left", "right", "hardpoint", "critical"];   // (owner, 2026-10-15) Weapon Emplacement became Hardpoint; Critical added
export const COLL_DEFAULT = { square: [{ t: "body", pts: box(0.5, 0.5) }], triangle: [{ t: "body", pts: box(0.5, 0.5) }], cylinder: [{ t: "body", pts: box(0.5, 0.5) }], ship: [{ t: "body", pts: box(0.33, 0.5556) }] };
// (owner, 2026-10-14) each kind's visibility points (Object Editor, Visibility tab): placed freely; each sends a line to the
// other ship's pivot in the mutual visibility test. They start at the box's corners and side middles.
const boxPts = (hx, hy) => [[-hx, -hy], [0, -hy], [hx, -hy], [hx, 0], [hx, hy], [0, hy], [-hx, hy], [-hx, 0]];
export const VIS_DEFAULT = { square: boxPts(0.5, 0.5), triangle: boxPts(0.5, 0.5), cylinder: boxPts(0.5, 0.5), ship: boxPts(0.33, 0.5556) };
// (owner, 2026-10-14) each kind's pivot: the point of the model it turns around, in the same fractions. A piece's
// position (x, y) is where its pivot is; the model and its outline sit around it. Default: the middle.
export function toWorldPts(o, loc, pv) {              // fractions of the footprint, around the pivot, into the world
  const c = Math.cos(o.r), s = Math.sin(o.r), out = [];
  for (const [ux, uy] of loc) { const lx = (ux - pv[0]) * o.w, ly = (uy - pv[1]) * o.d; out.push(o.x + lx * c - ly * s, o.y + lx * s + ly * c); }
  return out;
}
// the combat-points parts in the world, one outline [x0, y0, x1, y1, ...] each (owner, 2026-10-14: they decide line of sight)
export function buildPolys(o, coll, piv) { const pv = (piv && piv[o.k]) || [0, 0]; return ((coll && coll[o.k]) || COLL_DEFAULT[o.k] || COLL_DEFAULT.square).map((p) => toWorldPts(o, p.pts, pv)); }
// (owner, 2026-10-14) the movement collider (ships bump into it): an oval, a box or a capsule (a stadium along its longer
// side) filling the box x0..x1 by y0..y1, in the same fractions; each side moves on its own. It starts as the
// footprint's own oval. In the world, its outline (always convex).
export const MOVE_SHAPES = ["oval", "box", "capsule"];
const mv0 = () => ({ s: "oval", x0: -0.5, x1: 0.5, y0: -0.5, y1: 0.5 });
export const MOVE_DEFAULT = { square: mv0(), triangle: mv0(), cylinder: mv0(), ship: mv0() };
export function moveLoc(m) {                   // its outline in the model's fractions: [[x, y], ...] counterclockwise
  const cx = (m.x0 + m.x1) / 2, cy = (m.y0 + m.y1) / 2, hx = (m.x1 - m.x0) / 2, hy = (m.y1 - m.y0) / 2, out = [];
  if (m.s === "box") return [[m.x0, m.y0], [m.x1, m.y0], [m.x1, m.y1], [m.x0, m.y1]];
  if (m.s === "capsule") {                     // two half circles (radius: half the short side) joined by straight sides
    const r = Math.min(hx, hy), ax = hx - r, ay = hy - r, a0 = hx > hy ? -Math.PI / 2 : 0;
    for (const [sx, sy, a] of [[cx + ax, cy + ay, a0], [cx - ax, cy - ay, a0 + Math.PI]]) for (let i = 0; i <= 12; i++) out.push([sx + Math.cos(a + i * Math.PI / 12) * r, sy + Math.sin(a + i * Math.PI / 12) * r]);
    return out;
  }
  for (let i = 0; i < 24; i++) out.push([cx + Math.cos(i * Math.PI / 12) * hx, cy + Math.sin(i * Math.PI / 12) * hy]);
  return out;
}
export function movePoly(o, mov, piv) {
  return toWorldPts(o, moveLoc((mov && mov[o.k]) || MOVE_DEFAULT[o.k] || MOVE_DEFAULT.square), (piv && piv[o.k]) || [0, 0]);
}
export function cleanMove(m) {                 // a submitted movement collider, checked as hostile (the old ellipse [cx, cy, rx, ry] is read as an oval)
  if (Array.isArray(m)) { if (m.length !== 4) return null; const v = m.map(Number); if (!v.every(Number.isFinite)) return null;
    m = { s: "oval", x0: v[0] - Math.abs(v[2]), x1: v[0] + Math.abs(v[2]), y0: v[1] - Math.abs(v[3]), y1: v[1] + Math.abs(v[3]) }; }
  if (!m || typeof m !== "object" || !MOVE_SHAPES.includes(m.s)) return null;
  const v = [m.x0, m.x1, m.y0, m.y1].map(Number); if (!v.every(Number.isFinite)) return null;
  const r4 = (x) => Math.round(x * 10000) / 10000, cl = (x) => Math.max(-1.5, Math.min(1.5, x)), side = (a, b) => { a = cl(a); b = cl(b); if (b < a) [a, b] = [b, a]; if (b - a < 0.04) { if (a + 0.04 <= 1.5) b = a + 0.04; else a = b - 0.04; } return [r4(a), r4(b)]; };
  const [x0, x1] = side(v[0], v[1]), [y0, y1] = side(v[2], v[3]);
  return { s: m.s, x0, x1, y0, y1 };
}
export function cleanPivot(pv) {               // a submitted pivot, checked as hostile: two finite numbers inside +-1.5
  if (!Array.isArray(pv) || pv.length !== 2) return null; const [x, y] = pv.map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.round(Math.max(-1.5, Math.min(1.5, x)) * 10000) / 10000, Math.round(Math.max(-1.5, Math.min(1.5, y)) * 10000) / 10000];
}
export function polyRad(o, v) { let r = 0; for (let i = 0; i < v.length; i += 2) r = Math.max(r, Math.hypot(v[i] - o.x, v[i + 1] - o.y)); return r; }
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

// ---- (owner, 2026-10-15) object types' models: each uploaded GLB is loaded once and made a unit: its widest side 1 across,
// its middle over the pivot, standing on the grid; a placed one is that scaled to its size. Until it's loaded (or with no
// model) a plain rock stands in. ----
const modelUrl = (f) => (typeof API_BASE !== "undefined" ? API_BASE : location.origin) + "/game/models/" + f;
const units = new Map(), modelWaits = new Set();   // file -> the unit Group (null while loading / failed); listeners for a load
const gltf = new GLTFLoader();
function unitOf(file) {
  if (!file) return null;
  if (units.has(file)) return units.get(file);
  units.set(file, null);
  gltf.load(modelUrl(file), (g) => {
    const obj = g.scene, bx = new THREE.Box3().setFromObject(obj), sz = bx.getSize(new THREE.Vector3()), c = bx.getCenter(new THREE.Vector3());
    const wrap = new THREE.Group(); obj.position.set(-c.x, -bx.min.y, -c.z); wrap.add(obj); wrap.scale.setScalar(1 / Math.max(sz.x, sz.z, 1e-6));
    units.set(file, wrap); for (const f of modelWaits) f(file);
  }, undefined, (e) => console.error("model", file, e));
  return null;
}
const rockGeo = new THREE.IcosahedronGeometry(0.5, 1); rockGeo.translate(0, 0.5, 0);
const COLOR = 0x8c96aa;
const pieceMat = new THREE.MeshStandardMaterial({ color: COLOR, roughness: 0.65, metalness: 0.1 });
// an object type's mesh: an outer group (placed, turned, scaled to the footprint) holding a "spin" group (a node turns and
// bobs it) holding the model; mat(m): each material's stand-in (null keeps the model's own). userData.mk: what it was made from
function typeObject(t, mat) {
  const outer = new THREE.Group(), spin = new THREE.Group(), u = t && unitOf(t.model); outer.add(spin);
  if (u) { const c = u.clone(true); c.rotation.y = (t.front || 0) * Math.PI / 180;   // (owner, 2026-10-15) its model's Front (Raw Assets)
    if (mat) c.traverse((o) => { if (o.isMesh) o.material = mat(o.material); }); spin.add(c); }
  else spin.add(new THREE.Mesh(rockGeo, mat ? mat(pieceMat) : pieceMat));
  outer.userData.spin = spin; outer.userData.mk = (t && t.model || "") + (u ? "+" : "-") + (t && t.front || 0); return outer;
}
const meshKey = (k) => { const t = typeOf(k); return t ? k + "|" + (t.model || "") + (unitOf(t.model) ? "+" : "-") + (t.front || 0) : k; };
export const builds = new Map();
// the server's combat points for a kind, as parts (a bare outline, the old format, is one Body part)
const asParts = (v) => (!Array.isArray(v) || !v.length ? null : Array.isArray(v[0]) ? [{ t: "body", pts: v }] : (v.forEach((p) => { if (p && p.t === "weapon") p.t = "hardpoint"; }), v).every((p) => p && PART_TYPES.includes(p.t) && Array.isArray(p.pts)) ? v : null);
export const colliders = {}, pivots = {}, origins = {}, movers = {}, visOutlines = {}, collExtra = {};   // collExtra: (owner, 2026-10-15) each kind's hardpoint elevation / arc / facing and effects level
export const EXTRA_DEFAULT = { hz: 0.12, arc: 360, dir: 0, fx: 0.1 };
// (owner, 2026-10-15) is (dx, dy) inside a ship's hardpoint rotation limit (as the server works it out)? dir: degrees
// clockwise from the nose (the plan's -y: down in the Object Editor), turned with the heading h; 360 is endless
export function hpInArc(h, ex, dx, dy) {
  if (!ex || !(ex.arc < 360)) return true;
  const t = ex.dir * Math.PI / 180, ux = -Math.sin(t), uy = -Math.cos(t), c = Math.cos(h), s = Math.sin(h), cx = ux * c - uy * s, cy = ux * s + uy * c;
  const L = Math.hypot(dx, dy); if (L < 1e-9) return false;
  return Math.acos(Math.max(-1, Math.min(1, (cx * dx + cy * dy) / L))) * 180 / Math.PI <= ex.arc / 2;
}                 // (owner, 2026-10-14) the Object Editor's outlines by kind (the server's)               // id -> { id, k, x, y, w, d, r, poly, rad, mesh }

export function initBuild(ctx) {
  const { scene, camera, canvas, toWorld, send } = ctx;

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
  const holo = (obj, on) => obj.userData.k === "cloud" || obj.traverse((o) => { if (!o.isMesh) return; if (on) { if (!o.userData.mat) o.userData.mat = o.material; o.material = holoMat; } else if (o.userData.mat) { o.material = o.userData.mat; delete o.userData.mat; } });

  // poly / srad: the sight outline; mpoly / rad: the movement ellipse (what ships bump into)
  const hold = (b) => {
    if (gone(b)) { b.polys = []; b.mpoly = []; b.srad = b.rad = 0; return; }   // (owner, 2026-10-15) a mined-out node blocks nothing
    if (b.k === "cloud") { b.poly = b.mpoly = cloudPoly(b); b.srad = b.rad = polyRad(b, b.poly); return; }
    b.polys = buildPolys(b, colliders, pivots); b.srad = Math.max(...b.polys.map((v) => polyRad(b, v))); b.mpoly = movePoly(b, movers, pivots); b.rad = polyRad(b, b.mpoly); };
  const pivotAt = (o) => { const pv = pivots[o.k] || [0, 0], lx = -pv[0] * o.w, ly = -pv[1] * o.d, c = Math.cos(o.r), s = Math.sin(o.r); return [o.x + lx * c - ly * s, o.y + lx * s + ly * c]; };   // where the model's middle goes
  // (owner, 2026-10-15) a node at 0 ore waits out its respawn timer (the server's respawnAt); its spawn zone is around its
  // home (where it was put; it respawns somewhere inside)
  const isRes = (k) => { const t = typeOf(k); return !!t && t.cat === "node"; };   // a Resource: holds ore, depletes and respawns
  const gone = (b) => isRes(b.k) && !!(b.extra && b.extra.respawnAt);
  const homeOf = (b) => (b.extra && Array.isArray(b.extra.home) ? b.extra.home : [b.x, b.y]);
  function place(b) {
    if (b.mesh && b.mesh.userData.k !== meshKey(b.k)) { scene.remove(b.mesh); b.mesh = null; }
    // (owner, 2026-10-14) a test ship is drawn by its stand-in ship (it acts as a player); only while held does it get
    // a hologram of its own here
    if (b.k === "ship" && !(held && held.id === b.id)) { if (b.mesh) { scene.remove(b.mesh); b.mesh = null; } hold(b); return; }
    if (b.k === "cloud") { placeCloud(b); hold(b); if (ctx.onChange) ctx.onChange(); return; }
    if (!b.mesh) {
      // (owner) a test ship: the player ship's model (hidden out of sight like any other ship), parked
      b.mesh = b.k === "ship" ? ctx.makeShip() : typeObject(typeOf(b.k), ctx.farMat);   // (not drawn past the sight limit)
      Object.assign(b.mesh.userData, { k: meshKey(b.k), id: b.id }); scene.add(b.mesh); b.mesh.visible = true;
      if (held && held.id === b.id) holo(b.mesh, true);
    }
    const [mx, my] = pivotAt(b); b.mesh.position.copy(toWorld(mx, my, 0)); if (b.k !== "ship") b.mesh.scale.setScalar(b.w); b.mesh.rotation.y = b.r;
    hold(b); if (ctx.onChange) ctx.onChange();   // (the line-of-sight shadows need redrawing)
  }
  function setBuild([id, k, x, y, w, d, r, extra]) {
    if (held && held.id === id) return;        // the piece I'm holding is ahead of the server's echo
    if (dragPt && dragPt.id === id) return;    // nor the cloud whose point I'm dragging
    if (rDrag && rDrag.id === id) return;      // nor the ship whose route I'm editing
    // (owner, 2026-10-15) nor a piece I've just changed (moved, scaled, turned, its settings): the server's echoes of my
    // earlier, throttled sends would pull it back for a moment (a stutter); my last send settles it
    { const o = builds.get(id); if (o && o.localAt && performance.now() - o.localAt < 600) { if (o.extra && extra && isTypeKey(k) && o.extra.respawnAt !== extra.respawnAt) { o.extra.respawnAt = extra.respawnAt; place(o); } return; } }   // (but a node's respawn timer is the server's)
    const b = builds.get(id) || { id }; Object.assign(b, { k, x, y, w, d, r }); if (extra) b.extra = extra; builds.set(id, b); place(b);
  }
  function unBuild(id) {
    const b = builds.get(id); if (!b) return;
    if (held && held.id === id) { if (b.mesh) holo(b.mesh, false); held = null; }
    if (b.mesh) scene.remove(b.mesh); dropEdge(b); builds.delete(id); if (sel === id) sel = null; if (ctx.onChange) ctx.onChange();
  }

  // ---- state ----
  // picking: the blueprint of a new piece ({ k, w, d, r }); held: a placed piece picked up ({ id, ox, oy, b0 })
  let staff = false, open = false, picking = null, held = null, clip = null, lastSend = 0, sel = null;   // sel: (owner, 2026-10-14) the test ship last picked up (its buttons show over it)
  try { const c = JSON.parse(localStorage.getItem("atamus.buildclip") || "null"); if (c && (KINDS.includes(c.k) || isTypeKey(c.k))) clip = c; } catch {}
  const mouse = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { capture: true, passive: true });

  // ---- UI: [B] and the slot row ----
  const btn = document.createElement("button"); btn.id = "build-btn"; btn.type = "button"; btn.textContent = "B"; btn.title = "Build"; btn.hidden = true;
  btn.addEventListener("click", () => toggle());
  const bar = document.createElement("div"); bar.id = "build-bar"; bar.hidden = true;
  // (owner, 2026-10-15) one slot per category: Resource, Region, Object, Structure, Ship. Each holds a pool (the objects
  // made for it in the Object Creator; Region also has the nebula cloud, Ship the test ship) and shows the one chosen
  // there; while one is picked, the left / right arrows go through its category's pool (up / down: kept for later)
  const CATS = ["node", "region", "object", "structure", "ship"];
  const TYPE_NAMES = { node: "Resource", region: "Region", object: "Object", structure: "Structure", ship: "Ship" };
  const catOf = (k) => (k === "ship" ? "ship" : k === "cloud" ? "region" : (typeOf(k) || {}).cat || null);
  const poolOf = (cat) => [...(cat === "region" ? ["cloud"] : cat === "ship" ? ["ship"] : []), ...[...types.values()].filter((t) => t.cat === cat).sort((a, b) => +a.id - +b.id).map((t) => "t:" + t.id)];
  const catAt = {};                              // category -> the chosen pool entry
  const curOf = (cat) => { const p = poolOf(cat); return p.includes(catAt[cat]) ? catAt[cat] : p[0] || null; };
  let cloudTheme = 0;
  const cloudPic = () => { const c = CLOUD_THEMES[cloudTheme][1].map((v) => Math.round(v * 255)).join(","), d = document.createElement("span");
    d.innerHTML = '<svg viewBox="0 0 30 30" width="30" height="30"><path d="M8 21 Q3 21 4 16 Q5 12 9 13 Q10 7 16 8 Q21 8 22 13 Q27 13 26 18 Q25 22 21 21 Z" fill="rgba(' + c + ',0.5)" stroke="rgb(' + c + ')" stroke-width="1.6"/></svg>'; return d.firstChild; };
  const shipPic = () => { const d = document.createElement("span"); d.innerHTML = '<svg viewBox="0 0 30 30" width="30" height="30" class="build-ico"><path d="M15 3 L23 25 L15 20 L7 25 Z"/></svg>'; return d.firstChild; };
  // an object type's picture: its icon, else its first letter
  const letter = (n, cls) => { const d = document.createElement("span"); d.className = "build-letter" + (cls ? " " + cls : ""); d.textContent = (n || "?").slice(0, 1).toUpperCase(); return d; };
  const typePic = (t, px) => { const ic = t.icon && window.Catalog && window.Catalog.icons.get(t.icon); if (ic) return window.Catalog.svg(ic, px);
    if (t.thumb && window.Assets) return window.Assets.picture(t.thumb, px + 4);   // (owner, 2026-10-15) no icon: its model's rendered icon
    return letter(t.name); };
  const catSlots = CATS.map((cat) => { const d = document.createElement("div"); d.className = "inv-slot build-slot"; d.dataset.cat = cat; bar.appendChild(d);
    d.addEventListener("click", () => { if (picking && catOf(picking.k) === cat) stopPicking(); else { const k = curOf(cat); if (k) startPicking(k); } }); return d; });
  function drawTypeSlots() {
    for (const d of catSlots) {
      const cat = d.dataset.cat, k = curOf(cat), t = typeOf(k);
      d.title = k === "ship" ? NAMES.ship : k === "cloud" ? NAMES.cloud : t ? t.name : TYPE_NAMES[cat]; d.dataset.k = k || "";
      d.replaceChildren(k === "ship" ? shipPic() : k === "cloud" ? cloudPic() : t ? typePic(t, 28) : letter(TYPE_NAMES[cat], "none"));
    }
    drawSlot();
  }
  const drawSlot = () => { const c = picking && catOf(picking.k); for (const d of catSlots) d.classList.toggle("sel", !!c && c === d.dataset.cat); };
  function cycle(dir) {                          // the next / previous object in the picked one's category
    const cat = picking && catOf(picking.k); if (!cat) return; const p = poolOf(cat); if (p.length < 2) return;
    const k = p[(p.indexOf(picking.k) + dir + p.length) % p.length]; startPicking(k);
  }
  document.body.append(bar);
  function mountBtn() { const col = document.getElementById("staff-col") || document.body; if (!btn.parentNode) col.appendChild(btn); }   // (owner, 2026-10-14) the staff column on the right edge

  // (owner, 2026-10-15) v: the Object Placer (head admin, admins, developers); cr: the Object Creator (head admin)
  let creator = false;
  function setStaff(v, cr) { staff = !!v; creator = !!cr; btn.hidden = !staff; if (staff || creator) mountBtn(); if (!staff && open) toggle(false); if (!creator && eOpen) eToggle(false); }
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
    const t = typeOf(k), c = catOf(k); if (c) { catAt[c] = k; drawTypeSlots(); }
    picking = k === "ship" ? { k, w: SHIP_D, d: SHIP_D, r: 0 } : k === "cloud" ? { k, w: 100, d: 100, r: 0, extra: { pts: CLOUD_START.map((q) => q.slice()), v: cloudTheme } }
      : t ? { k, w: 60, d: 60, r: 0, extra: { size: 60 } } : null; drawSlot();
  }
  function stopPicking() { picking = null; if (ghost) { scene.remove(ghost); ghost = null; } drawSlot(); }

  // ---- screen <-> ground ----
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function ndc(cx, cy) { const r = canvas.getBoundingClientRect(); return { x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }; }
  function ground(cx, cy) { ray.setFromCamera(ndc(cx, cy), camera); return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: -hit.z } : null; }


  // ---- (owner, 2026-10-14) nebula clouds: a colored, drifting gradient filling the outline, fading out at its edges ----
  const CLOUD_Y = 4;                           // the outline handles' height
  // (owner, 2026-10-14) a 3D volume: soft puffs (billboards, always facing the camera) scattered through the outline at
  // different heights, smaller and fainter toward the edges. Each puff is a noisy blob that slowly turns and drifts, tinted
  // from the theme. Puffs near my own ship thin out so it stays in view. One instanced draw per cloud.
  const CLOUD_SP = 46, CLOUD_TOP = 70, CLOUD_MAX = 2400;
  // (owner, 2026-10-14: speed) clouds are drawn on their own layer into a picture a third the screen's size that's laid over the scene
  // (game3d.js): soft puffs cost a lot of pixels, a ninth as many there. Their blending keeps that picture's colors
  // premultiplied by its transparency.
  const CLOUD_LAYER = 2, cloudBlend = { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  const cloudT = { value: 0 }, cloudMe = { value: new THREE.Vector2(1e9, 1e9) };
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  function cloudPuffs(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, area = 0;
    pts.forEach(([x, y], i) => { const [u, v] = pts[(i + 1) % pts.length]; area += x * v - u * y; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const sp = Math.max(CLOUD_SP, Math.sqrt(Math.abs(area / 2) * 2 / CLOUD_MAX));
    const inside = (x, y) => { let c = false; for (let i = 0, n = pts.length; i < n; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; };
    const edge = (x, y) => { let d = Infinity; for (let i = 0, n = pts.length; i < n; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n], ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1e-9))); d = Math.min(d, Math.hypot(x - ax - ex * t, y - ay - ey * t)); } return d; };
    const P = [], S = [];
    for (let ix = Math.floor(x0 / sp); ix <= Math.ceil(x1 / sp); ix++) for (let iy = Math.floor(y0 / sp); iy <= Math.ceil(y1 / sp); iy++) for (let l = 0; l < 2; l++) {
      const x = (ix + hash(ix, iy, l * 3 + 1)) * sp, y = (iy + hash(ix, iy, l * 3 + 2)) * sp; if (!inside(x, y) || (l && hash(ix, iy, 29) < 0.5)) continue;
      const d = edge(x, y), k = Math.min(1, d / 90), r = hash(ix, iy, l * 3 + 3);
      P.push(x, y, 4 + (CLOUD_TOP * (0.35 + 0.65 * k)) * hash(ix, iy, l + 9));
      S.push((55 + 55 * r) * (0.5 + 0.5 * k), hash(ix, iy, l + 17), d);
    }
    return { P, S };
  }
  function cloudMesh(pts, v, ghost) {
    const th = CLOUD_THEMES[v] || CLOUD_THEMES[0], { P, S } = cloudPuffs(pts), q = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = q.index; g.setAttribute("position", q.getAttribute("position")); g.setAttribute("uv", q.getAttribute("uv")); q.dispose();
    g.setAttribute("iP", new THREE.InstancedBufferAttribute(new Float32Array(P), 3)); g.setAttribute("iS", new THREE.InstancedBufferAttribute(new Float32Array(S), 3)); g.instanceCount = P.length / 3;
    const m = new THREE.ShaderMaterial({
      uniforms: { nt: { value: ctx.noiseTex }, uT: cloudT, uMe: cloudMe, uS: { value: 1 }, uG: { value: ghost ? 0.5 : 1 },
        c1: { value: new THREE.Vector3(...th[0]) }, c2: { value: new THREE.Vector3(...th[1]) }, c3: { value: new THREE.Vector3(...th[2]) } },
      transparent: true, depthWrite: false, ...cloudBlend,
      vertexShader: `attribute vec3 iP; attribute vec3 iS; uniform float uS, uT; uniform vec2 uMe; varying vec2 vU, vN, vM; varying vec3 vS; varying float vR, vH; varying vec2 vC; uniform sampler2D nt;
        void main() {
          vec4 w = modelMatrix * vec4(iP.x, iP.z / uS, -iP.y, 1.0);          // (heights aren't scaled)
          w.xz += vec2(sin(uT * 0.07 + iS.y * 40.0), cos(uT * 0.05 + iS.y * 23.0)) * 6.0 * uS;   // a slow drift
          vC = vec2(texture2D(nt, w.xz / 520.0 + uT * 0.0015).a, texture2D(nt, w.xz / 260.0 - uT * 0.002).b);   // big swirls of color across the cloud
          float a = iS.y * 6.283 + uT * 0.03 * (iS.y - 0.5), c = cos(a), s = sin(a);
          vU = mat2(c, -s, s, c) * (uv - 0.5); vS = iS; vH = iP.z / ${CLOUD_TOP}.0;
          vec4 e = viewMatrix * w; e.xy += position.xy * iS.x * uS * 2.0;
          gl_Position = projectionMatrix * e;
          // a thinned-out patch on screen around my own ship (still faintly tinted, so it feels inside the cloud)
          vec4 me = projectionMatrix * viewMatrix * vec4(uMe.x, 8.0, -uMe.y, 1.0); float asp = projectionMatrix[1][1] / projectionMatrix[0][0];
          vN = gl_Position.xy / gl_Position.w * vec2(asp, 1.0); vM = me.xy / me.w * vec2(asp, 1.0); vR = 90.0 * projectionMatrix[1][1] / me.w;   // (owner: 4x the area it was)
        }`,
      fragmentShader: `uniform sampler2D nt; uniform float uT, uG; uniform vec3 c1, c2, c3; varying vec2 vU, vN, vM; varying vec3 vS; varying float vR, vH; varying vec2 vC;
        void main() {
          float r = length(vU) * 2.0; if (r > 1.0) discard;
          float n = texture2D(nt, vU * 0.6 + vS.y * 7.3 + uT * 0.002).r, f = texture2D(nt, vU * 1.6 + vS.y * 3.1 - uT * 0.004).g;
          float v = (1.0 - r * r) * (0.55 + (n - 0.5) * 2.6) + (f - 0.5) * 0.7;
          float blob = smoothstep(0.12, 0.75, v);
          float k = smoothstep(0.0, 120.0, vS.z);
          vec3 col = mix(c1, c2, clamp(smoothstep(0.38, 0.62, vC.x) * 0.9 + vH * 0.35 + (n - 0.5) * 1.2 + (vS.y - 0.5) * 0.4, 0.0, 1.0));
          col = mix(col, c3, smoothstep(0.5, 0.85, vC.y * 0.7 + f * 0.4 + vH * 0.3) * 0.7 * blob);
          float me = smoothstep(0.7, 1.5, length(vN - vM) / vR);
          gl_FragColor = vec4(col, blob * (0.12 + 0.12 * k) * (0.35 + 0.65 * smoothstep(0.0, 50.0, vS.z)) * mix(0.3, 1.0, me) * uG);   // (screen colors)
        }`,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.layers.set(CLOUD_LAYER); return mesh;
  }
  // (owner, 2026-10-14) leashed puffs along a cloud's edge, like a wall of tethered balloons: each one is tied to its spot,
  // a ship flying into them knocks them aside (they bounce off its hull), and they float back to where they were. The main
  // cloud stays put. Simulated here on the client, for the clouds near me.
  const EDGE_R = 46, EDGE_K = 5, EDGE_C = 1.8, EDGE_MAX = 2600;   // (owner: lots of small ones)
  // (owner, 2026-10-14) spread from just outside the white edge in to a little past the red line (150 m in), small at the
  // edge and growing toward the red line (bigger ones sparser). Laid out in meters at the cloud's current scale.
  const EDGE_DEEP = 150;
  function edgeAnchors(pts, sc) {
    const W = pts.map(([x, y]) => [x * sc, y * sc]), n = W.length;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of W) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const inside = (x, y) => { let c = false; for (let i = 0; i < n; i++) { const [ax, ay] = W[i], [bx, by] = W[(i + 1) % n]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; };
    const edge = (x, y) => { let d = Infinity; for (let i = 0; i < n; i++) { const [ax, ay] = W[i], [bx, by] = W[(i + 1) % n], ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1e-9))); d = Math.min(d, Math.hypot(x - ax - ex * t, y - ay - ey * t)); } return d; };
    const cand = [], G = 8;
    for (let x = x0 - 16; x <= x1 + 16; x += G) for (let y = y0 - 16; y <= y1 + 16; y += G) {
      const px = x + (Math.random() - 0.5) * G, py = y + (Math.random() - 0.5) * G, e = edge(px, py), d = inside(px, py) ? e : -e;
      if (d < -14 || d > EDGE_DEEP + 15) continue;
      const k = Math.max(0, Math.min(1, d / EDGE_DEEP)), size = (21 + 19 * k) * (0.75 + 0.5 * Math.random());   // (owner: the smallest 3x what they were, the biggest as before)
      if (Math.random() > Math.min(1, 1.3 * (G * G) / (size * size))) continue;   // bigger: sparser
      cand.push(px / sc, py / sc, 4 + Math.random() * (14 + 30 * k), size, Math.random());
    }
    const keep = Math.min(1, EDGE_MAX * 5 / cand.length), A = [];
    for (let i = 0; i < cand.length; i += 5) if (keep >= 1 || Math.random() < keep) A.push(cand[i], cand[i + 1], cand[i + 2], cand[i + 3], cand[i + 4]);
    return A;                                  // [x, y (local), h, size (m), seed] each
  }
  function edgeMesh(b) {
    const A = edgeAnchors(b.extra.pts, b.w / 100), n = A.length / 5, th = CLOUD_THEMES[b.extra.v] || CLOUD_THEMES[0];
    const q = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = q.index; g.setAttribute("position", q.getAttribute("position")); g.setAttribute("uv", q.getAttribute("uv")); q.dispose();
    const P = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); P.setUsage(THREE.DynamicDrawUsage);
    const S = new Float32Array(n * 2); for (let i = 0; i < n; i++) { S[i * 2] = A[i * 5 + 3]; S[i * 2 + 1] = A[i * 5 + 4]; }
    g.setAttribute("iP", P); g.setAttribute("iS", new THREE.InstancedBufferAttribute(S, 2)); g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      uniforms: { nt: { value: ctx.noiseTex }, uT: cloudT, uS: { value: 1 }, c1: { value: new THREE.Vector3(...th[0]) }, c2: { value: new THREE.Vector3(...th[1]) }, c3: { value: new THREE.Vector3(...th[2]) } },
      transparent: true, depthWrite: false, ...cloudBlend,
      vertexShader: `attribute vec3 iP; attribute vec2 iS; uniform float uT, uS; varying vec2 vU; varying float vS, vH;
        void main() {
          float a = iS.y * 6.283 + uT * 0.05 * (iS.y - 0.5), c = cos(a), s = sin(a); vU = mat2(c, -s, s, c) * (uv - 0.5); vS = iS.y; vH = iP.z / 40.0;
          vec4 e = viewMatrix * vec4(iP.x, iP.z, -iP.y, 1.0); e.xy += position.xy * iS.x * uS * 2.0;
          gl_Position = projectionMatrix * e;
        }`,
      fragmentShader: `uniform sampler2D nt; uniform float uT; uniform vec3 c1, c2, c3; varying vec2 vU; varying float vS, vH;
        void main() {
          float r = length(vU) * 2.0; if (r > 1.0) discard;
          float n = texture2D(nt, vU * 0.6 + vS * 7.3 + uT * 0.002).r, f = texture2D(nt, vU * 1.6 + vS * 3.1 - uT * 0.004).g;
          float blob = smoothstep(0.12, 0.75, (1.0 - r * r) * (0.55 + (n - 0.5) * 2.6) + (f - 0.5) * 0.7);
          vec3 col = mix(mix(c1, c2, clamp(vS * 0.7 + vH * 0.4 + (n - 0.5), 0.0, 1.0)), c3, smoothstep(0.55, 0.9, f + vH * 0.2) * 0.55 * blob);
          gl_FragColor = vec4(col * 1.08, blob * 0.45);   // (screen colors; a touch brighter than the main cloud)
        }`,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.layers.set(CLOUD_LAYER);
    return { mesh, A, n, w: b.w, pos: null, vel: new Float32Array(n * 3) };
  }
  // anchors into the world (the cloud can be moved, turned and scaled; the puffs then drift to their new spots)
  function edgeWorld(b, e) {
    const s = b.w / 100, c = Math.cos(b.r), sn = Math.sin(b.r), W = new Float32Array(e.n * 3);
    for (let i = 0; i < e.n; i++) { const lx = e.A[i * 5] * s, ly = e.A[i * 5 + 1] * s; W[i * 3] = b.x + lx * c - ly * sn; W[i * 3 + 1] = b.y + lx * sn + ly * c; W[i * 3 + 2] = e.A[i * 5 + 2]; }
    return W;
  }
  function updateEdges(dt) {
    const me = ctx.myPos ? ctx.myPos() : null, ships = ctx.cloudShips ? ctx.cloudShips() : [];
    for (const b of builds.values()) {
      const e = b.edge; if (b.k !== "cloud" || !e) continue;
      // (owner, 2026-10-14: speed) the anchors are worked out again only when the cloud moves; a cloud whose puffs have
      // settled with no ship near them sleeps (no work, nothing sent to the graphics card)
      const tk = b.x + "," + b.y + "," + b.r + "," + b.w; if (e.tk !== tk) { e.tk = tk; e.W = edgeWorld(b, e); e.awake = true; }
      const W = e.W, P = e.mesh.geometry.attributes.iP.array, V = e.vel;
      if (e.w !== b.w && !(held && held.id === b.id)) { dropEdge(b); b.edge = edgeMesh(b); scene.add(b.edge.mesh); continue; }   // (rescaled: laid out again)
      if (!e.pos) { e.pos = true; P.set(W); }
      if (me && Math.hypot(me.x - b.x, me.y - b.y) > b.rad + 1500) continue;   // far away: left as they are
      const near = ships.filter((sh) => Math.hypot(sh[0] - b.x, sh[1] - b.y) < b.rad + EDGE_R + 40);
      if (!e.awake && !near.some((sh) => Math.hypot(sh[2], sh[3]) > 1)) continue;   // (a parked ship doesn't stir them)
      let moving = 0;
      for (let i = 0; i < e.n; i++) {
        const j = i * 3;
        for (let k = 0; k < 3; k++) { V[j + k] += ((W[j + k] - P[j + k]) * EDGE_K - V[j + k] * EDGE_C) * dt; P[j + k] += V[j + k] * dt; }   // the leash
        for (const sh of near) {               // a ship's hull: pushed out of it, bounced off it
          const dx = P[j] - sh[0], dy = P[j + 1] - sh[1], d = Math.hypot(dx, dy); if (d >= EDGE_R || d < 1e-3) continue;
          // (weights kept as tuned before the small ones grew)
          // (owner) a ship only nudges a puff: it gives it some of its speed as it sweeps into it (nothing holds the puff
          // out of the hull), so the leash always pulls it back home, even with a ship parked on its spot. The bigger the
          // puff, the heavier: small ones get swept along, big ones near the red line barely stir.
          const m = Math.min(0.55, Math.max(0.04, 5 / (7 + (e.A[i * 5 + 3] - 21) * 33 / 19))), nx = dx / d, ny = dy / d, vn = (V[j] - sh[2]) * nx + (V[j + 1] - sh[3]) * ny;
          if (vn < 0) { const k = -vn * m * Math.min(1, dt * 6) * (1 - d / EDGE_R * 0.5); V[j] += nx * k; V[j + 1] += ny * k; V[j + 2] += k * 0.3 * (Math.random() - 0.3); }
        }
      }
      for (let j = 0; j < e.n * 3; j++) moving = Math.max(moving, Math.abs(V[j]), Math.abs(W[j] - P[j]));
      e.awake = moving > 0.02; if (!e.awake) { P.set(W); V.fill(0); }   // settled: exactly home
      e.mesh.geometry.attributes.iP.needsUpdate = true;
    }
  }
  function dropEdge(b) { if (b.edge) { scene.remove(b.edge.mesh); b.edge.mesh.geometry.dispose(); b.edge.mesh.material.dispose(); b.edge = null; } }
  function placeCloud(b) {
    const key = JSON.stringify(b.extra.pts) + "|" + b.extra.v;
    if (b.mesh && b.mesh.userData.key !== key) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); b.mesh = null; dropEdge(b); }
    if (!b.mesh) { dropEdge(b); b.mesh = cloudMesh(b.extra.pts, b.extra.v); Object.assign(b.mesh.userData, { k: "cloud", id: b.id, key }); scene.add(b.mesh); b.edge = edgeMesh(b); scene.add(b.edge.mesh); }
    b.mesh.material.uniforms.uS.value = b.w / 100; b.mesh.material.uniforms.uG.value = held && held.id === b.id ? 0.5 : 1;   // held: see-through
    b.mesh.position.copy(toWorld(b.x, b.y, 0)); b.mesh.scale.setScalar(b.w / 100); b.mesh.rotation.y = b.r;
  }
  // ---- editing a cloud's outline in the world (Build menu open): drag a corner, click an edge's middle dot to add one,
  // right-click a corner to remove it (3 at least). Clicking inside the cloud picks it all up as usual. ----
  const inPolyF = (x, y, v) => { let c = false; for (let i = 0, n = v.length; i < n; i += 2) { const ax = v[i], ay = v[i + 1], bx = v[(i + 2) % n], by = v[(i + 3) % n]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; };
  const NSv = "http://www.w3.org/2000/svg";
  const cLayer = document.createElementNS(NSv, "svg"); cLayer.id = "cloud-handles"; cLayer.setAttribute("width", "100%"); cLayer.setAttribute("height", "100%"); document.body.appendChild(cLayer);
  let dragPt = null, lastPtSend = 0;
  const toLocal = (b, g) => { const s = b.w / 100, c = Math.cos(-b.r), n = Math.sin(-b.r), dx = g.x - b.x, dy = g.y - b.y; return [Math.round((dx * c - dy * n) / s * 10) / 10, Math.round((dx * n + dy * c) / s * 10) / 10]; };
  const scr2 = (x, y) => { const r = canvas.getBoundingClientRect(), v = new THREE.Vector3(x, CLOUD_Y, -y).project(camera); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height, v.z < 1]; };
  // the handles are kept between frames (only moved), and one listener on the layer reads which one was pressed
  let hKey = "";
  function cloudHandles() {
    const list = [];
    if (open && !picking && !held) for (const b of builds.values()) {
      if (b.k !== "cloud" || !b.poly || b.id !== sel) continue;   // (owner, 2026-10-15) only the selected cloud's handles
      const pts = []; for (let i = 0; i < b.poly.length; i += 2) pts.push(scr2(b.poly[i], b.poly[i + 1]));
      // (owner, 2026-10-14) its core outline (where ships are hidden and sight is blocked), drawn red
      const cores = (ctx.cloudCores ? ctx.cloudCores(b) : []).map((v) => { const o = []; for (let i = 0; i < v.length; i += 2) o.push(scr2(v[i], v[i + 1])); return o; });
      if (pts.some((p) => p[2] && p[0] > -50 && p[0] < innerWidth + 50 && p[1] > -50 && p[1] < innerHeight + 50)) list.push([b, pts, cores]);
    }
    const key = list.map(([b, pts, cores]) => b.id + ":" + pts.length + ":" + cores.length).join(",");
    if (key !== hKey) {
      hKey = key; while (cLayer.firstChild) cLayer.removeChild(cLayer.firstChild);
      for (const [b, pts, cores] of list) {
        for (const c of cores) { const cp = document.createElementNS(NSv, "polygon"); cp.setAttribute("class", "ch-core"); cLayer.appendChild(cp); }
        const pl = document.createElementNS(NSv, "polygon"); pl.setAttribute("class", "ch-line"); cLayer.appendChild(pl);
        pts.forEach((p, i) => { const c = document.createElementNS(NSv, "circle"); c.setAttribute("r", 4); c.setAttribute("class", "ch-mid"); c.dataset.id = b.id; c.dataset.i = i; cLayer.appendChild(c); });
        pts.forEach((p, i) => { const c = document.createElementNS(NSv, "circle"); c.setAttribute("r", 6); c.setAttribute("class", "ch-pt"); c.dataset.id = b.id; c.dataset.i = i; cLayer.appendChild(c); });
      }
    }
    let el = cLayer.firstChild;
    for (const [, pts, cores] of list) {
      for (const c of cores) { el.setAttribute("points", c.map((p) => p[0] + "," + p[1]).join(" ")); el = el.nextSibling; }
      el.setAttribute("points", pts.map((p) => p[0] + "," + p[1]).join(" ")); el = el.nextSibling;
      pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; el.setAttribute("cx", (p[0] + q[0]) / 2); el.setAttribute("cy", (p[1] + q[1]) / 2); el = el.nextSibling; });
      pts.forEach((p) => { el.setAttribute("cx", p[0]); el.setAttribute("cy", p[1]); el = el.nextSibling; });
    }
  }
  cLayer.addEventListener("contextmenu", (e) => e.preventDefault());
  cLayer.addEventListener("pointerdown", (e) => {
    const t = e.target, b = t.dataset && builds.get(t.dataset.id); if (!b || b.k !== "cloud") return;
    const i = +t.dataset.i; e.preventDefault(); e.stopPropagation();
    if (t.classList.contains("ch-mid")) {                   // the middle of an edge: a new corner there
      if (e.button !== 0 || b.extra.pts.length >= 64) return;
      const a = b.extra.pts[i], z = b.extra.pts[(i + 1) % b.extra.pts.length]; b.extra.pts.splice(i + 1, 0, [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2]); startPt(e, b, i + 1);
    } else if (e.button === 2) { if (b.extra.pts.length > 3) { b.extra.pts.splice(i, 1); place(b); push(b, true); } }
    else if (e.button === 0) startPt(e, b, i);
  });
  function startPt(e, b, i) { dragPt = { id: b.id, i, pid: e.pointerId }; try { cLayer.setPointerCapture(e.pointerId); } catch {} place(b); }
  cLayer.addEventListener("pointermove", (e) => {
    if (!dragPt || e.pointerId !== dragPt.pid) return; const b = builds.get(dragPt.id), g = ground(e.clientX, e.clientY); if (!b || !g) return;
    b.extra.pts[dragPt.i] = toLocal(b, g); place(b);
    const t = performance.now(); if (t - lastPtSend > 90) { lastPtSend = t; push(b, true); }
  });
  const endPt = (e) => { if (!dragPt || e.pointerId !== dragPt.pid) return; const b = builds.get(dragPt.id); dragPt = null; try { cLayer.releasePointerCapture(e.pointerId); } catch {} if (b) push(b, true); };
  cLayer.addEventListener("pointerup", endPt); cLayer.addEventListener("pointercancel", endPt);

  // ---- (owner, 2026-10-14) test ships' routes and orders. With the Build menu open, the selected test ship (the last one
  // picked up) shows two buttons above it: Add route / Remove route, and Attack player (lit when on). A route is a loop of
  // points that starts and ends at the ship's spawn (where it was placed, marked "S"); drag a point to move it, drag an
  // edge's middle dot to add one, right-click a point to remove it (one at least). Points are kept in meters from the spawn. ----
  const rLayer = document.createElementNS(NSv, "svg"); rLayer.id = "route-handles"; rLayer.setAttribute("width", "100%"); rLayer.setAttribute("height", "100%"); document.body.appendChild(rLayer);
  let rDrag = null, rKey = "", lastRSend = 0;
  const botGoals = new Map();                  // (owner) stand-in id -> [x, y]: where a test ship heading back to its path is going (from the server)
  const ROUTE_START = [[250, 0], [250, 250], [0, 250]];
  // (owner, 2026-10-14) the route as the ship flies it: corners rounded (the same smoothing as the server's smoothRoute)
  const ROUTE_CUT = 90;
  function smoothRoute(P) {
    const n = P.length; if (n < 3) return P.slice();
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = P[(i + n - 1) % n], v = P[i], z = P[(i + 1) % n];
      const l1 = Math.hypot(v[0] - a[0], v[1] - a[1]) || 1, l2 = Math.hypot(z[0] - v[0], z[1] - v[1]) || 1, c1 = Math.min(ROUTE_CUT, l1 / 2), c2 = Math.min(ROUTE_CUT, l2 / 2);
      const s0 = [v[0] - (v[0] - a[0]) / l1 * c1, v[1] - (v[1] - a[1]) / l1 * c1], s1 = [v[0] + (z[0] - v[0]) / l2 * c2, v[1] + (z[1] - v[1]) / l2 * c2];
      for (let k = 0; k <= 8; k++) { const t = k / 8, u = 1 - t; out.push([u * u * s0[0] + 2 * u * t * v[0] + t * t * s1[0], u * u * s0[1] + 2 * u * t * v[1] + t * t * s1[1]]); }
    }
    return out;
  }
  function routeHandles() {
    const list = [];
    if (open && !picking) for (const b of builds.values()) {
      if (b.k !== "ship" || !b.extra || !b.extra.route || (held && held.id === b.id) || b.id !== sel) continue;   // (owner, 2026-10-15) only the selected ship's route
      const pts = [[b.x, b.y], ...b.extra.route.map(([x, y]) => [b.x + x, b.y + y])].map(([x, y]) => scr2(x, y));
      if (pts.some((p) => p[2] && p[0] > -50 && p[0] < innerWidth + 50 && p[1] > -50 && p[1] < innerHeight + 50)) list.push([b, pts]);
    }
    const key = list.map(([b, pts]) => b.id + ":" + pts.length).join(",");
    if (key !== rKey) {
      rKey = key; while (rLayer.firstChild) rLayer.removeChild(rLayer.firstChild);
      for (const [b, pts] of list) {
        const pl = document.createElementNS(NSv, "polygon"); pl.setAttribute("class", "rt-line"); rLayer.appendChild(pl);
        const lz = document.createElementNS(NSv, "line"); lz.setAttribute("class", "rt-leash"); rLayer.appendChild(lz);   // (owner) back to its path, while it's heading there
        pts.forEach((p, i) => { const c = document.createElementNS(NSv, "circle"); c.setAttribute("r", 4); c.setAttribute("class", "rt-mid"); c.dataset.id = b.id; c.dataset.i = i; rLayer.appendChild(c); });
        pts.forEach((p, i) => {
          if (i === 0) {                         // the spawn: an S, not draggable (moving the ship moves it)
            const g = document.createElementNS(NSv, "g"); g.setAttribute("class", "rt-spawn");
            const c = document.createElementNS(NSv, "circle"); c.setAttribute("r", 10); const t = document.createElementNS(NSv, "text"); t.textContent = "S"; t.setAttribute("text-anchor", "middle"); t.setAttribute("dominant-baseline", "central");
            g.append(c, t); rLayer.appendChild(g); return;
          }
          const c = document.createElementNS(NSv, "circle"); c.setAttribute("r", 6); c.setAttribute("class", "rt-pt"); c.dataset.id = b.id; c.dataset.i = i; rLayer.appendChild(c);
        });
        const mv = document.createElementNS(NSv, "g"); mv.setAttribute("class", "rt-moveg");   // the middle handle: a square with a cross
        const sq = document.createElementNS(NSv, "rect"); sq.setAttribute("x", -9); sq.setAttribute("y", -9); sq.setAttribute("width", 18); sq.setAttribute("height", 18); sq.setAttribute("rx", 3); sq.setAttribute("class", "rt-move"); sq.dataset.id = b.id;
        const cr = document.createElementNS(NSv, "path"); cr.setAttribute("d", "M-5 0H5M0 -5V5"); mv.append(sq, cr); rLayer.appendChild(mv);
      }
    }
    let el = rLayer.firstChild;
    for (const [b, pts] of list) {
      const S = smoothRoute([[b.x, b.y], ...b.extra.route.map(([x, y]) => [b.x + x, b.y + y])]).map(([x, y]) => scr2(x, y));
      el.setAttribute("points", S.map((p) => p[0] + "," + p[1]).join(" ")); el = el.nextSibling;   // (the rounded path; the points stay as handles)
      { const gl = botGoals.get("b" + b.id), q = gl && ctx.botPos ? ctx.botPos(b.id) : null;   // the leash: from the ship to where it's going back to
        if (gl && q) { const a = scr2(q.x, q.y), z = scr2(gl[0], gl[1]); el.setAttribute("x1", a[0]); el.setAttribute("y1", a[1]); el.setAttribute("x2", z[0]); el.setAttribute("y2", z[1]); el.style.display = ""; } else el.style.display = "none";
        el = el.nextSibling; }
      pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; el.setAttribute("cx", (p[0] + q[0]) / 2); el.setAttribute("cy", (p[1] + q[1]) / 2); el = el.nextSibling; });
      pts.forEach((p, i) => { if (i === 0) el.setAttribute("transform", "translate(" + p[0] + "," + p[1] + ")"); else { el.setAttribute("cx", p[0]); el.setAttribute("cy", p[1]); } el = el.nextSibling; });
      { let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } el.setAttribute("transform", "translate(" + cx / pts.length + "," + cy / pts.length + ")"); el = el.nextSibling; }   // (the middle of the points)
    }
  }
  rLayer.addEventListener("contextmenu", (e) => e.preventDefault());
  rLayer.addEventListener("pointerdown", (e) => {
    const t = e.target, b = t.dataset && builds.get(t.dataset.id); if (!b || b.k !== "ship" || !b.extra || !b.extra.route) return;
    const i = +t.dataset.i, R = b.extra.route; e.preventDefault(); e.stopPropagation(); sel = b.id;
    if (t.classList.contains("rt-move")) {      // (owner) the middle handle: the whole path (and its spawn) moves; the ship flies back to it
      if (e.button !== 0) return; const g = ground(e.clientX, e.clientY); if (!g) return;
      rDrag = { id: b.id, move: true, gx: g.x, gy: g.y, x0: b.x, y0: b.y, pid: e.pointerId }; try { rLayer.setPointerCapture(e.pointerId); } catch {} return;
    }
    if (t.classList.contains("rt-mid")) {       // a new point in the middle of that leg (point i to i + 1; 0 is the spawn)
      if (e.button !== 0 || R.length >= 32) return;
      const all = [[0, 0], ...R], a = all[i], z = all[(i + 1) % all.length];
      R.splice(i, 0, [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2]); startR(e, b, i + 1);
    } else if (e.button === 2) { if (R.length > 1) { R.splice(i - 1, 1); push(b, true, true); } }
    else if (e.button === 0) startR(e, b, i);
  });
  function startR(e, b, i) { rDrag = { id: b.id, i, pid: e.pointerId }; try { rLayer.setPointerCapture(e.pointerId); } catch {} }
  rLayer.addEventListener("pointermove", (e) => {
    if (!rDrag || e.pointerId !== rDrag.pid) return; const b = builds.get(rDrag.id), g = ground(e.clientX, e.clientY); if (!b || !g || !b.extra || !b.extra.route) return;
    if (rDrag.move) { const nx = rDrag.x0 + g.x - rDrag.gx, ny = rDrag.y0 + g.y - rDrag.gy; if (!ctx.inside(nx, ny)) return; b.x = Math.round(nx * 100) / 100; b.y = Math.round(ny * 100) / 100; hold(b); }
    else b.extra.route[rDrag.i - 1] = [Math.round((g.x - b.x) * 10) / 10, Math.round((g.y - b.y) * 10) / 10];
    const t = performance.now(); if (t - lastRSend > 90) { lastRSend = t; push(b, true, true); }
  });
  const endR = (e) => { if (!rDrag || e.pointerId !== rDrag.pid) return; const b = builds.get(rDrag.id); rDrag = null; try { rLayer.releasePointerCapture(e.pointerId); } catch {} if (b) push(b, true, true); };
  rLayer.addEventListener("pointerup", endR); rLayer.addEventListener("pointercancel", endR);
  // the selected ship's buttons, above it
  const sBox = document.createElement("div"); sBox.id = "ship-btns"; sBox.hidden = true;
  const routeBtn = document.createElement("button"), atkBtn = document.createElement("button"); routeBtn.type = atkBtn.type = "button"; atkBtn.textContent = "Attack player";
  sBox.append(routeBtn, atkBtn); document.body.appendChild(sBox);
  const selShip = () => { const b = sel && builds.get(sel); return b && b.k === "ship" ? b : null; };
  routeBtn.addEventListener("click", () => { const b = selShip(); if (!b) return; b.extra = { ...(b.extra || {}) };
    if (b.extra.route) delete b.extra.route; else b.extra.route = ROUTE_START.map((q) => q.slice());
    if (!b.extra.route && !b.extra.atk) delete b.extra; push(b, true, true); });
  atkBtn.addEventListener("click", () => { const b = selShip(); if (!b) return; b.extra = { ...(b.extra || {}) };
    if (b.extra.atk) delete b.extra.atk; else b.extra.atk = true;
    if (!b.extra.route && !b.extra.atk) delete b.extra; push(b, true, true); });
  for (const bt of [routeBtn, atkBtn]) bt.addEventListener("pointerdown", (e) => e.stopPropagation());
  // (owner, 2026-10-15) the selected object's attributes: a panel dragged by its title (it stays where it's put): a test
  // ship's Add route / Attack player, a resource node's settings
  const aPanel = document.createElement("div"); aPanel.id = "attr-panel"; aPanel.hidden = true;
  const aTop = document.createElement("div"); aTop.className = "attr-top"; aPanel.append(aTop, sBox); document.body.appendChild(aPanel);
  aPanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  if (window.WinPos) window.WinPos.watch(aTop, aPanel, "attrs");   // (owner, 2026-10-15) remembered per account
  aTop.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; e.preventDefault(); const r0 = aPanel.getBoundingClientRect(), ox = e.clientX - r0.left, oy = e.clientY - r0.top;
    const mv = (ev) => { const r = aPanel.getBoundingClientRect(); aPanel.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - ox)) + "px"; aPanel.style.top = Math.max(0, Math.min(innerHeight - r.height, ev.clientY - oy)) + "px"; aPanel.style.right = "auto"; };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); }; addEventListener("pointermove", mv); addEventListener("pointerup", up);
  });
  function shipButtons() {
    const b = open && !picking && !held ? selShip() : null;
    if (!b) { sBox.hidden = true; return; }
    routeBtn.textContent = b.extra && b.extra.route ? "Remove route" : "Add route"; atkBtn.classList.toggle("on", !!(b.extra && b.extra.atk));
    sBox.hidden = false;
  }
  // every object: Rotation (degrees); a cloud also: Scale (%) and Theme
  const gBox = document.createElement("div"); gBox.id = "gen-box"; aPanel.appendChild(gBox);
  const gField = (label, el) => { const l = document.createElement("label"), sp = document.createElement("span"); sp.textContent = label; l.append(sp, el); gBox.appendChild(l); return el; };
  const gRot = gField("Rotation", Object.assign(document.createElement("input"), { type: "number", step: 1 }));
  const gScale = gField("Scale", Object.assign(document.createElement("input"), { type: "number", step: 1, min: 5, max: 1000 }));
  const gTheme = gField("Theme", document.createElement("select")); ["Violet", "Teal", "Amber", "Emerald", "Crimson"].forEach((n, i) => gTheme.append(new Option(n, String(i))));
  const cloudRows = [gScale.parentNode, gTheme.parentNode];
  for (const el of [gRot, gScale, gTheme]) el.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") el.blur(); });
  const rotSet = (now) => { const b = selPiece(), v = Number(gRot.value); if (!b || gRot.value === "" || !Number.isFinite(v)) return; const r = -v * Math.PI / 180; b.r = Math.round(Math.atan2(Math.sin(r), Math.cos(r)) * 10000) / 10000; place(b); push(b, now); };
  const scaleSet = (now) => { const b = selPiece(), v = Number(gScale.value); if (!b || b.k !== "cloud" || gScale.value === "" || !Number.isFinite(v)) return; b.w = b.d = Math.max(MIN, Math.min(MAX, v)); place(b); push(b, now); };
  gRot.addEventListener("input", () => rotSet(false)); gRot.addEventListener("change", () => rotSet(true));   // (owner, 2026-10-15) instant
  gScale.addEventListener("input", () => scaleSet(false)); gScale.addEventListener("change", () => scaleSet(true));
  gTheme.addEventListener("change", () => { const b = selPiece(); if (!b || b.k !== "cloud") return; b.extra = { ...b.extra, v: +gTheme.value }; cloudTheme = b.extra.v; drawTypeSlots(); place(b); push(b, true); gTheme.blur(); });
  let gShown = "";
  function attrPanel() {
    const b = open && !picking && !held ? selPiece() : null;
    const was = aPanel.hidden; aPanel.hidden = !b; if (!b) { gShown = ""; return; }
    if (was && window.WinPos) window.WinPos.place(aPanel, "attrs");
    aTop.textContent = b.k === "ship" ? "Test Ship" : b.k === "cloud" ? NAMES.cloud : (typeOf(b.k) || {}).name || "";
    for (const r of cloudRows) r.hidden = b.k !== "cloud";
    const key = b.id + ":" + b.r + ":" + b.w + ":" + (b.extra && b.extra.v);
    if (key !== gShown && !gBox.contains(document.activeElement)) { gRot.value = String(Math.round(-b.r * 180 / Math.PI * 10) / 10); gScale.value = String(Math.round(b.w)); if (b.k === "cloud") gTheme.value = String(b.extra.v || 0); gShown = key; }
  }

  // ---- (owner, 2026-10-15) resource nodes (the Object Placer): each turns and bobs between two heights (its own settings).
  // The selected one shows its settings: Size (m across; the wheel changes it too), Rotation Speed (deg/s), Bob Speed (bobs a
  // second), Bob Min / Bob Max (m), Respawn (s), Ore (how much it holds now), Ore Min / Ore Max (how much it spawns with); and its spawn zone, an outline drawn on the ground around it: drag a point, drag
  // the dot in the middle of an edge to add one, right-click a point to remove it (3 stay). Each change is saved. ----
  function spinNodes(now, dt) {
    for (const b of builds.values()) {
      const e = isTypeKey(b.k) && b.extra, sp = e && b.mesh && b.mesh.userData.spin; if (!sp) continue;
      // (owner, 2026-10-15) mined out (waiting to respawn): unseen, but a hologram while the Object Placer is open
      const g = gone(b); b.mesh.visible = !g || open;
      if (b.mesh.userData.gone !== g) { b.mesh.userData.gone = g; if (g) holo(b.mesh, true); else if (!(held && held.id === b.id)) holo(b.mesh, false); }
      sp.rotation.y += (e.spin || 0) * Math.PI / 180 * dt;
      b.mesh.position.y = e.bmin + (e.bmax - e.bmin) * (0.5 + 0.5 * Math.sin(now / 1000 * (e.bob || 0) * Math.PI * 2 + (+b.id || 0)));
    }
  }
  const nBox = document.createElement("div"); nBox.id = "node-box"; nBox.hidden = true; aPanel.appendChild(nBox);
  const NODE_F = [["size", "Size"], ["spin", "Rotation Speed"], ["bob", "Bob Speed"], ["bmin", "Bob Min"], ["bmax", "Bob Max"], ["respawn", "Respawn"], ["amount", "Ore"], ["min", "Ore Min"], ["max", "Ore Max"]], nIn = {};
  const RES_F = ["respawn", "amount", "min", "max"];
  const nVal = (b, k) => (b.extra[k] == null ? "" : b.extra[k]);
  for (const [k, label] of NODE_F) {
    const l = document.createElement("label"), sp = document.createElement("span"), i = document.createElement("input"); sp.textContent = label; i.type = "number"; i.step = k === "bob" ? 0.05 : 1; if (["size", "respawn", "amount", "min", "max", "bob"].includes(k)) i.min = 0;
    l.append(sp, i); nBox.appendChild(l); nIn[k] = i;
    // (owner, 2026-10-15) instant: every keystroke or drag applies (sent at most ~10 times a second; the last always goes)
    const apply = (now) => {
      const b = selNode(); if (!b || i.value === "") return; const v = Number(i.value); if (!Number.isFinite(v)) return;
      const e = b.extra = { ...(b.extra || {}) };
      if (k === "size") { e.size = b.w = b.d = Math.max(MIN, Math.min(MAX, v)); }
      else if (k === "amount") { e.amount = Math.max(0, Math.min(e.max, Math.round(v))); }
      else { e[k] = v; if (k === "min" && e.max < v) e.max = v; if (k === "max" && e.min > v) e.min = v; if (k === "bmin" && e.bmax < v) e.bmax = v; if (k === "bmax" && e.bmin > v) e.bmin = v; }
      place(b); push(b, now);
    };
    i.addEventListener("input", () => apply(false)); i.addEventListener("change", () => apply(true));
    i.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") i.blur(); });
  }
  // (owner, 2026-10-15) a mined-out node: how long until it respawns
  const rLab = document.createElement("label"), rOut = document.createElement("span"); { const sp = document.createElement("span"); sp.textContent = "Respawn In"; rOut.className = "nb-val"; rLab.append(sp, rOut); rLab.hidden = true; nBox.appendChild(rLab); }
  const clock = () => (gone.skew || 0) + Date.now();
  nBox.addEventListener("pointerdown", (e) => e.stopPropagation());
  const selNode = () => { const b = sel && builds.get(sel); return b && isTypeKey(b.k) ? b : null; };
  let nShown = null;
  function nodePanel() {
    const b = open && !picking && !held ? selNode() : null;
    zoneHandles(b && isRes(b.k) ? b : null);
    if (!b || !b.extra) { nBox.hidden = true; nShown = null; return; }
    const key = b.id + b.w + JSON.stringify(b.extra);   // (the fields refill only when the settings change, not while typed in)
    if (nShown !== key && !nBox.contains(document.activeElement)) { for (const [k] of NODE_F) nIn[k].value = nVal(b, k); nShown = key; }
    for (const [k] of NODE_F) nIn[k].parentNode.hidden = !isRes(b.k) && RES_F.includes(k);   // (ore and respawn: Resources only)
    rLab.hidden = !gone(b);
    if (gone(b)) { const t = Math.max(0, Math.ceil((b.extra.respawnAt - clock()) / 1000)), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = String(t % 60).padStart(2, "0"); rOut.textContent = h ? h + ":" + String(m).padStart(2, "0") + ":" + sec : m + ":" + sec; }
    nBox.hidden = false;
  }
  // the spawn zone's outline and handles (meters around the node: moving the node moves its zone)
  const zLayer = document.createElementNS(NSv, "svg"); zLayer.id = "zone-handles"; zLayer.setAttribute("width", "100%"); zLayer.setAttribute("height", "100%"); document.body.appendChild(zLayer);
  zLayer.addEventListener("contextmenu", (e) => e.preventDefault());
  let zKey = "", zDrag = null;
  // (owner, 2026-10-15) and, faintly, the spawn zones of the other placed nodes of the same type (thin grey outlines)
  const zoLayer = document.createElementNS(NSv, "svg"); zoLayer.id = "zone-others"; zoLayer.setAttribute("width", "100%"); zoLayer.setAttribute("height", "100%"); document.body.appendChild(zoLayer);
  function otherZones(b) {
    const list = b ? [...builds.values()].filter((o) => o !== b && o.k === b.k && o.extra && o.extra.zone) : [];
    while (zoLayer.children.length > list.length) zoLayer.lastChild.remove();
    while (zoLayer.children.length < list.length) { const pl = document.createElementNS(NSv, "polygon"); pl.setAttribute("class", "zn-other"); zoLayer.appendChild(pl); }
    list.forEach((o, i) => { const [hx, hy] = homeOf(o), pts = o.extra.zone.map(([x, y]) => scr2(hx + x, hy + y)); zoLayer.children[i].setAttribute("points", pts.every((p) => p[2]) ? pts.map((p) => p[0] + "," + p[1]).join(" ") : ""); });
  }
  function zoneHandles(b) {
    otherZones(b);
    const Z = b && b.extra && b.extra.zone, H = b && homeOf(b), pts = Z ? Z.map(([x, y]) => scr2(H[0] + x, H[1] + y)) : [];
    const key = b && Z && pts.every((p) => p[2]) ? b.id + ":" + Z.length : "";
    if (key !== zKey) {
      zKey = key; while (zLayer.firstChild) zLayer.removeChild(zLayer.firstChild); if (!key) return;
      const pl = document.createElementNS(NSv, "polygon"); pl.setAttribute("class", "zn-line"); zLayer.appendChild(pl);
      Z.forEach((_, i) => { const c = document.createElementNS(NSv, "circle"); c.setAttribute("r", 4); c.setAttribute("class", "zn-mid"); c.dataset.i = i; zLayer.appendChild(c); });
      Z.forEach((_, i) => { const c = document.createElementNS(NSv, "circle"); c.setAttribute("r", 6); c.setAttribute("class", "zn-pt"); c.dataset.i = i; zLayer.appendChild(c); });
    }
    if (!key) return;
    let el = zLayer.firstChild; el.setAttribute("points", pts.map((p) => p[0] + "," + p[1]).join(" ")); el = el.nextSibling;
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; el.setAttribute("cx", (p[0] + q[0]) / 2); el.setAttribute("cy", (p[1] + q[1]) / 2); el = el.nextSibling; });
    pts.forEach((p) => { el.setAttribute("cx", p[0]); el.setAttribute("cy", p[1]); el = el.nextSibling; });
  }
  zLayer.addEventListener("pointerdown", (e) => {
    const t = e.target, b = selNode(); if (!b || !b.extra || !b.extra.zone || !t.dataset || t.dataset.i == null) return;
    e.preventDefault(); e.stopPropagation(); const Z = b.extra.zone, i = +t.dataset.i;
    if (t.classList.contains("zn-mid")) { if (e.button !== 0 || Z.length >= 32) return; const a = Z[i], z = Z[(i + 1) % Z.length]; Z.splice(i + 1, 0, [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2]); zDrag = { id: b.id, i: i + 1, pid: e.pointerId }; }
    else if (e.button === 2) { if (Z.length > 3) { Z.splice(i, 1); push(b, true); } return; }
    else if (e.button === 0) zDrag = { id: b.id, i, pid: e.pointerId };
    if (zDrag) try { zLayer.setPointerCapture(e.pointerId); } catch {}
  });
  zLayer.addEventListener("pointermove", (e) => {
    if (!zDrag || e.pointerId !== zDrag.pid) return; const b = builds.get(zDrag.id), g = ground(e.clientX, e.clientY); if (!b || !g || !b.extra || !b.extra.zone) return;
    const [hx, hy] = homeOf(b); b.extra.zone[zDrag.i] = [Math.round((g.x - hx) * 10) / 10, Math.round((g.y - hy) * 10) / 10]; push(b, false);
  });
  const zEnd = (e) => { if (!zDrag || e.pointerId !== zDrag.pid) return; const b = builds.get(zDrag.id); zDrag = null; try { zLayer.releasePointerCapture(e.pointerId); } catch {} if (b) push(b, true); };
  zLayer.addEventListener("pointerup", zEnd); zLayer.addEventListener("pointercancel", zEnd);
  // a model finished loading: the pieces, the blueprint and the Object Creator's view take it
  modelWaits.add(() => { for (const b of builds.values()) if (isTypeKey(b.k)) place(b); if (ghost) { scene.remove(ghost); ghost = null; } eMeshK = null; });
  // (owner, 2026-10-15) the server's object types
  function setTypes(list) {
    types.clear(); for (const t of Array.isArray(list) ? list : []) if (t && typeof t.id === "string") types.set(t.id, t);
    drawTypeSlots(); for (const b of builds.values()) if (isTypeKey(b.k)) place(b);
    if (picking && isTypeKey(picking.k) && !typeOf(picking.k)) stopPicking();
    eMeshK = null; if (eOpen) { if (isTypeKey(eKind) && !typeOf(eKind)) eSetKind("ship"); else drawProps(); }
  }
  if (window.Catalog) window.Catalog.on(() => { drawTypeSlots(); if (eOpen) drawProps(); });

  // ---- picking up and dropping placed pieces ----
  const fields = (b) => (b.extra ? { k: b.k, x: b.x, y: b.y, w: b.w, d: b.d, r: b.r, extra: JSON.parse(JSON.stringify(b.extra)) } : { k: b.k, x: b.x, y: b.y, w: b.w, d: b.d, r: b.r });
  function push(b, now, keep) { const t = performance.now(); b.localAt = t; if (!now && t - lastSend < 90) { pendSend(b, keep); return; } lastSend = t; send({ t: "bset", id: b.id, ...fields(b), ...(keep ? { keep: true } : {}) }); }   // keep: (owner) a route / spawn edit: the ship stays where it is
  // a throttled change still owed: sent when the throttle allows, so the last change always goes out
  let pend = null;
  function pendSend(b, keep) { if (pend) { pend.b = b; pend.keep = keep; return; } pend = { b, keep }; setTimeout(() => { const p = pend; pend = null; if (p && builds.get(p.b.id) === p.b) push(p.b, true, p.keep); }, 100); }
  function create(o) { send({ t: "bnew", ...o }); }
  // (owner, 2026-10-15) clicking a placed object selects it: its attributes panel (where it's turned, sized and the rest; no
  // keys or wheel for those) and its handles (a cloud's outline, a ship's route, a node's spawn zone). Pressing on the
  // selected object again and dragging moves it (no hologram). Delete removes it, Ctrl+C / Ctrl+X copy / cut it; Escape or
  // a click on nothing deselects
  function pickUp(b) {
    stopPicking(); if (!b) return;
    if (b.k === "ship" && ctx.botPos && !(b.extra && b.extra.route)) { const q = ctx.botPos(b.id); if (q) { b.x = q.x; b.y = q.y; b.r = q.h; } }   // where its stand-in is now (a route ship: its spawn stays)
    sel = b.id;
  }
  const selPiece = () => (sel && builds.get(sel)) || null;
  function drop(commit) {                       // commit: keep where it is now; otherwise put it back where it was
    if (!held) return; const b = builds.get(held.id), b0 = held.b0; held = null; if (!b) return;
    if (!commit) Object.assign(b, b0);
    if (b.mesh) holo(b.mesh, false); place(b); push(b, true);
  }

  let oDrag = null;                             // (owner, 2026-10-15) the selected object being dragged
  canvas.addEventListener("pointermove", (e) => {
    if (!oDrag || e.pointerId !== oDrag.pid) return; const b = builds.get(oDrag.id), g = ground(e.clientX, e.clientY); if (!b || !g) return;
    const nx = g.x + oDrag.ox, ny = g.y + oDrag.oy; if (!ctx.inside(nx, ny)) return;
    const x = Math.round(nx * 100) / 100, y = Math.round(ny * 100) / 100;
    if (isTypeKey(b.k) && b.extra) { const [hx, hy] = homeOf(b); b.extra = { ...b.extra, home: [Math.round((hx + x - b.x) * 100) / 100, Math.round((hy + y - b.y) * 100) / 100] }; }   // (its spawn zone comes along)
    b.x = x; b.y = y; place(b); push(b, false);
  });
  const oEnd = (e) => { if (!oDrag || e.pointerId !== oDrag.pid) return; const b = builds.get(oDrag.id); oDrag = null; try { canvas.releasePointerCapture(e.pointerId); } catch {} if (b) push(b, true); };
  canvas.addEventListener("pointerup", oEnd); canvas.addEventListener("pointercancel", oEnd);
  canvas.addEventListener("pointerdown", (e) => {
    if (!open || e.button !== 0) return;
    const g = ground(e.clientX, e.clientY);
    if (picking) { if (g && ctx.inside(g.x, g.y)) create({ k: picking.k, x: g.x, y: g.y, w: picking.w, d: picking.d, r: picking.r, ...(picking.extra ? { extra: picking.extra } : {}) }); return; }
    if (held) { const b = builds.get(held.id); if (b && ctx.inside(b.x, b.y)) drop(true); return; }
    ray.setFromCamera(ndc(e.clientX, e.clientY), camera);
    const hits = ray.intersectObjects([...builds.values()].filter((b) => b.k !== "cloud").map((b) => b.mesh).filter(Boolean).concat(ctx.botObjects ? ctx.botObjects() : []), true);   // (test ships: their stand-ins)
    let o = hits.length ? hits[0].object : null; while (o && !(o.userData && o.userData.id)) o = o.parent;
    let hitB = o && g ? builds.get(o.userData.id) : null;
    // (owner, 2026-10-14) a cloud (puffs, nothing solid to hit): a click on the ground inside its outline
    if (!hitB && g) for (const b of builds.values()) if (b.k === "cloud" && b.poly && inPolyF(g.x, g.y, b.poly)) { hitB = b; break; }
    if (hitB) {
      if (sel !== hitB.id) { pickUp(hitB); return; }   // the first click selects it; pressing on it again drags it
      const sx = hitB.k === "ship" && ctx.botPos && !(hitB.extra && hitB.extra.route) ? ctx.botPos(hitB.id) : null;
      if (sx) { hitB.x = sx.x; hitB.y = sx.y; }
      oDrag = { id: hitB.id, ox: hitB.x - g.x, oy: hitB.y - g.y, pid: e.pointerId }; try { canvas.setPointerCapture(e.pointerId); } catch {} return;
    }
    sel = null;                                  // (clicked nothing: no ship selected)
  });

  // ---- keys (only while the menu is open, and never while typing) ----
  addEventListener("keydown", (e) => {
    if (ctx.typing()) return;
    if (e.code === "KeyB" && !e.ctrlKey && !e.metaKey && !e.altKey) { if (staff) { e.preventDefault(); if (!e.repeat) toggle(); } return; }
    if (!open) return;
    const ctrl = e.ctrlKey || e.metaKey, b = (held && builds.get(held.id)) || selPiece();
    const eat = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (ctrl && e.code === "KeyC") { eat(); if (b) copy(b); return; }
    if (ctrl && e.code === "KeyX") { eat(); if (b) { copy(b); held = null; sel = null; send({ t: "bdel", id: b.id }); } return; }
    if (ctrl && e.code === "KeyV") { eat(); if (clip) { const g = ground(mouse.x, mouse.y); if (g && ctx.inside(g.x, g.y)) create({ ...clip, x: g.x, y: g.y }); } return; }
    if (ctrl) return;
    if (e.code === "Delete") { eat(); if (b) { held = null; sel = null; send({ t: "bdel", id: b.id }); } return; }
    if (e.code === "Escape") { if (picking) stopPicking(); else if (held) drop(false); else if (sel) sel = null; else toggle(false); }
    if ((e.code === "ArrowLeft" || e.code === "ArrowRight") && picking) { eat(); cycle(e.code === "ArrowLeft" ? -1 : 1); }
  }, true);
  function copy(b) { clip = b.extra ? { k: b.k, w: b.w, d: b.d, r: b.r, extra: JSON.parse(JSON.stringify(b.extra)) } : { k: b.k, w: b.w, d: b.d, r: b.r }; try { localStorage.setItem("atamus.buildclip", JSON.stringify(clip)); } catch {} }

  // ---- every frame: the blueprint and the held piece follow the pointer; R turns them ----
  let lastF = performance.now();
  function frame() {
    const now = performance.now(), dt = Math.min(0.1, (now - lastF) / 1000); lastF = now; holoT.value = now / 1000;
    eRender(); gizFrame(); cloudT.value = now / 1000; if (ctx.myPos) { const p = ctx.myPos(); if (p) cloudMe.value.set(p.x, p.y); }
    updateEdges(dt); cloudHandles(); routeHandles(); attrPanel(); shipButtons(); nodePanel(); spinNodes(now, dt);
    if (!open) return;
    const g = ground(mouse.x, mouse.y), turn = 0;   // (owner, 2026-10-15: turning is the attributes panel's)
    if (picking) {
      picking.r = Math.atan2(Math.sin(picking.r - turn), Math.cos(picking.r - turn));
      if (!ghost || ghost.userData.k !== meshKey(picking.k)) {
        if (ghost) scene.remove(ghost);
        ghost = picking.k === "ship" ? ctx.makeShip() : picking.k === "cloud" ? cloudMesh(picking.extra.pts, picking.extra.v, true) : typeObject(typeOf(picking.k), null);
        if (picking.k !== "cloud") holo(ghost, true); ghost.userData.k = meshKey(picking.k); scene.add(ghost);
      }
      ghost.visible = !!g; if (g) { const [mx, my] = pivotAt({ ...picking, x: g.x, y: g.y }); ghost.position.copy(toWorld(mx, my, 0)); if (picking.k === "cloud") { ghost.scale.setScalar(picking.w / 100); ghost.material.uniforms.uS.value = picking.w / 100; } else if (picking.k !== "ship") ghost.scale.setScalar(picking.w); ghost.rotation.y = picking.r; }
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
  // (owner, 2026-10-15) now the Object Creator (head admin): its slots are the player ship and every object type, then +
  // (a new resource node type); right-click a type: Delete (not while any are placed). A type's properties show above the
  // tabs: Name, Model (Upload Model, or drop a GLB on the window; 50 MB at most), Size (m across at scale 1), Item (what the
  // node yields), Rotation Speed (deg/s) and Bob Speed (bobs a second). Each change is saved at once.
  const win = document.createElement("div"); win.id = "coll-edit"; win.hidden = true;
  const VIEW = 400;
  win.innerHTML = '<div class="ce-top"><span class="ce-title">Object Editor</span><button type="button" class="ce-x" title="Close">×</button></div><div class="ce-slots"></div><div class="ce-views"><div class="ce-view ce-topv"><canvas width="' + VIEW + '" height="' + VIEW + '"></canvas><svg width="' + VIEW + '" height="' + VIEW + '"></svg></div><div class="ce-view ce-side" hidden><canvas width="' + VIEW + '" height="' + VIEW + '"></canvas><svg width="' + VIEW + '" height="' + VIEW + '"></svg></div></div>';
  document.body.appendChild(win);
  const ceSlots = win.querySelector(".ce-slots"), ceTop = win.querySelector(".ce-topv"), ceCanvas = ceTop.querySelector("canvas"), ceSvg = ceTop.querySelector("svg");
  const ceSide = win.querySelector(".ce-side"), sdCanvas = ceSide.querySelector("canvas"), sdSvg = ceSide.querySelector("svg");   // (owner, 2026-10-15) the side view
  // (owner, 2026-10-15) the Object Editor window (Edit Object): above the collision tabs, a resource node's Resource Type
  // (the item it yields)
  const props = document.createElement("div"); props.className = "oc-props"; ceSlots.after(props); ceSlots.hidden = true;
  const pIn = {}, pRow = (label, el) => { const l = document.createElement("label"); l.className = "oc-row"; const sp = document.createElement("span"); sp.textContent = label; l.append(sp, el); props.appendChild(l); return el; };
  pIn.model = pRow("Model", document.createElement("select"));   // (owner, 2026-10-15) moved here from the old Object Creator panel: one of the Raw Assets models
  pIn.item = pRow("Resource Type", document.createElement("select"));
  const pErr = document.createElement("p"); pErr.className = "oc-err"; pErr.hidden = true; props.appendChild(pErr);
  const curType = () => typeOf(eKind);
  function drawProps() {
    const t = curType(); props.hidden = !t; win.querySelector(".ce-title").textContent = t ? t.name : NAMES.ship; if (!t) return;
    const models = (window.Assets ? window.Assets.models() : []).slice().sort((a, b) => a.name.localeCompare(b.name));
    pIn.model.replaceChildren(new Option("None", ""), ...models.map((a) => new Option(a.name, a.file))); if (t.model && !models.some((a) => a.file === t.model)) pIn.model.append(new Option(t.mname || t.model, t.model)); pIn.model.value = t.model || "";
    pIn.item.parentNode.hidden = t.cat !== "node";
    pIn.item.replaceChildren(new Option("None", ""), ...((window.Catalog && window.Catalog.items) || []).map((x) => new Option(x.name, x.id))); pIn.item.value = t.item || "";
  }
  function saveType(ch, t = curType()) { if (!t) return; const o = { ...t, ...ch }; delete o.id; send({ t: "tset", id: t.id, type: o }); }
  pIn.model.addEventListener("change", () => { const a = window.Assets && window.Assets.models().find((x) => x.file === pIn.model.value); saveType({ model: pIn.model.value || null, mname: a ? a.name : "" }); pIn.model.blur(); });
  if (window.Assets) window.Assets.on(() => { if (eOpen) drawProps(); });
  pIn.item.addEventListener("change", () => { saveType({ item: pIn.item.value || null }); pIn.item.blur(); });

  function onTypeSaved(m) { if (m.error && eOpen) { pErr.textContent = m.error; pErr.hidden = false; } }   // (the Object Editor's own saves)
  // three things per kind, picked with the buttons over the view (owner, 2026-10-14): Sight (where line of sight is
  // stopped: drag corners, click an edge's middle dot to add one, right-click to remove), Movement (where ships collide:
  // drag its middle to move it, a side handle to stretch it) and Pivot (where the ship turns around). The wheel zooms the
  // view; the header drags the window; Mirrored (on at first) keeps the left and right halves matching; Reset puts the
  // current one back to its start; Ctrl+Z / Ctrl+U undo and redo. While it's open, every piece's colliders (and every
  // ship's) are drawn in the world.
  let eOpen = false, eKind = "ship", eMode = "sight", ePv = [0, 0], eWo = [0, 0], eMv = { ...MOVE_DEFAULT.square }, eDrag = null, eRen = null, eScene = null, eCam = null, eMesh = null, eMeshK = null;
  // (owner, 2026-10-14) Combat Points ("sight": the outline aim lines stop at, and line-of-sight shadows) and Visibility ("vis":
  // free points, each sending a line to the other ship's pivot in the mutual visibility test) share the dragging code
  // (owner, 2026-10-14) Combat Points are parts (eParts, each { t: type, pts }); "sight" is the part being edited (ePart)
  let eParts = [{ t: "body", pts: null }], ePart = 0;
  const EP = { get sight() { return eParts[ePart].pts; }, set sight(v) { eParts[ePart].pts = v; }, vis: null }, pk = () => (eMode === "pts" ? "vis" : "sight");
  const PART_NAMES = { body: "Body", main: "Main Engine", left: "Left Engine", right: "Right Engine", hardpoint: "Hardpoint", critical: "Critical" };
  let eEx = { ...EXTRA_DEFAULT }, sideYaw = Math.PI / 2, sdRen = null, sdCam = null, eMeshH = 1;   // (owner, 2026-10-15) the hardpoint / effects level being edited; the side view's angle
  const MOVE_NAMES = { oval: "Oval", box: "Box", capsule: "Capsule" };
  const cloneParts = (ps) => ps.map((p) => ({ t: p.t, pts: p.pts.map((q) => q.slice()) }));
  let eZoom = 1, mirror = true, past = [], future = [], ePan = [0, 0];   // ePan: (owner) the view's middle, in footprint fractions (middle mouse pans)
  // (owner, 2026-10-14) two rulers: a horizontal and a vertical dashed red line, each dragged on its own; corners, the
  // ellipse's handles and the pivot snap to them when dragged close (in footprint fractions)
  const guide = { x: 0.25, y: 0.25 }, SNAP = 8;
  const modes = document.createElement("div"); modes.className = "ce-modes";
  // (owner, 2026-10-15) Hitboxes and Movement (the top view); Points: the pivot, the visibility points, the hardpoint (ships)
  // and the effects level, in the top view and the side view stacked under it
  for (const [k, label] of [["sight", "Hitboxes"], ["move", "Movement"], ["pts", "Points"]]) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.dataset.m = k; b.addEventListener("click", () => { eMode = k; eDrag = null; drawModes(); eDraw(); }); modes.appendChild(b);
  }
  props.after(modes);
  // (owner, 2026-10-14) under the tabs: Combat Points' parts (pick one, its type, add / remove), Movement's shape
  const sub = document.createElement("div"); sub.className = "ce-sub"; modes.after(sub);
  const subBtn = (text, on, title, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = text; if (on) b.classList.add("on"); if (title) b.title = title; b.addEventListener("click", () => { fn(); b.blur(); }); sub.appendChild(b); return b; };
  function drawSub() {
    sub.replaceChildren(); sub.hidden = eMode !== "sight" && eMode !== "move";
    if (eMode === "move") { for (const k of MOVE_SHAPES) subBtn(MOVE_NAMES[k], eMv.s === k, null, () => { if (eMv.s === k) return; snap(); eMv = { ...eMv, s: k }; eSave(); drawSub(); eDraw(); }); return; }
    if (eMode !== "sight") return;
    eParts.forEach((p, i) => subBtn(PART_NAMES[p.t], i === ePart, null, () => { ePart = i; eDrag = null; drawSub(); eDraw(); }));
    const ty = document.createElement("select"); for (const t of PART_TYPES) ty.append(new Option(PART_NAMES[t], t)); ty.value = eParts[ePart].t;
    ty.addEventListener("change", () => { snap(); eParts[ePart].t = ty.value; ty.blur(); eSave(); drawSub(); }); sub.appendChild(ty);
    if (eParts.length < 8) subBtn("+", false, "Add part", () => {
      snap(); const used = new Set(eParts.map((p) => p.t)); eParts.push({ t: PART_TYPES.find((t) => !used.has(t)) || "body", pts: box(0.12, 0.12) }); ePart = eParts.length - 1; eSave(); drawSub(); eDraw(); });
    if (eParts.length > 1) subBtn("\u2212", false, "Remove part", () => { snap(); eParts.splice(ePart, 1); ePart = Math.max(0, ePart - 1); eSave(); drawSub(); eDraw(); });
  }
  const foot = document.createElement("div"); foot.className = "ce-foot";
  foot.innerHTML = '<label class="ce-mirror"><input type="checkbox" checked> Mirrored</label><button type="button" class="ce-reset">Reset</button>';
  win.appendChild(foot);
  const mirrorBox = foot.querySelector("input"); mirrorBox.addEventListener("change", () => { mirror = mirrorBox.checked; mirrorBox.blur(); });
  foot.querySelector(".ce-reset").addEventListener("click", () => {
    snap();
    if (eMode === "sight") { eParts = cloneParts(dflt(COLL_DEFAULT, eKind)); ePart = 0; } else if (eMode === "pts") { EP.vis = dflt(VIS_DEFAULT, eKind).map((q) => q.slice()); ePv = [0, 0]; eWo = [0, 0]; eEx = { ...EXTRA_DEFAULT }; } else if (eMode === "move") eMv = { ...dflt(MOVE_DEFAULT, eKind) }; else ePv = [0, 0];
    eSave(); drawSub(); eDraw();
  });
  const isShipKind = () => eKind === "ship" || (curType() || {}).cat === "ship";
  const drawModes = () => {
    for (const b of modes.children) b.classList.toggle("on", b.dataset.m === eMode);
    ceSide.hidden = eMode !== "pts"; ceTop.parentNode.classList.toggle("stack", eMode === "pts");
    drawSub(); sDraw();
  };
  // the window drags by its header
  const top = win.querySelector(".ce-top"); let wDrag = null; if (window.WinPos) window.WinPos.watch(top, win, "objedit");   // (owner, 2026-10-15) remembered per account
  top.addEventListener("pointerdown", (e) => { if (e.button !== 0 || e.target.closest("button")) return; const r = win.getBoundingClientRect(); wDrag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top }; top.setPointerCapture(e.pointerId); e.preventDefault(); });
  top.addEventListener("pointermove", (e) => { if (!wDrag || e.pointerId !== wDrag.id) return; const W = win.offsetWidth, Hh = win.offsetHeight;
    win.style.left = Math.max(0, Math.min(innerWidth - W, e.clientX - wDrag.dx)) + "px"; win.style.top = Math.max(0, Math.min(innerHeight - Hh, e.clientY - wDrag.dy)) + "px"; win.style.transform = "none"; });
  const wEnd = (e) => { if (wDrag && e.pointerId === wDrag.id) wDrag = null; }; top.addEventListener("pointerup", wEnd); top.addEventListener("pointercancel", wEnd);

  const dflt = (o, k) => o[k] || o.square;      // (a type's colliders start as the generic square's)
  const fp = () => (eKind === "ship" ? SHIP_D : (curType() || {}).size || 100);   // the footprint shown, m
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
  function drawESlots() {}
  function eSetKind(k) {
    if (!kindOk(k) || k === "cloud") k = "ship";
    eKind = k; pErr.hidden = true;
    eParts = cloneParts(colliders[k] || dflt(COLL_DEFAULT, k)); ePart = 0; EP.vis = (visOutlines[k] || dflt(VIS_DEFAULT, k)).map((q) => q.slice()); ePv = (pivots[k] || [0, 0]).slice(); eWo = (origins[k] || [0, 0]).slice(); eMv = { ...(movers[k] || dflt(MOVE_DEFAULT, k)) }; eEx = { ...EXTRA_DEFAULT, ...(collExtra[k] || {}) };
    eDrag = null; past = []; future = []; ePan = [0, 0]; drawESlots(); drawProps(); drawModes(); eDraw();
  }
  win.querySelector(".ce-x").addEventListener("click", () => eToggle(false));
  function eToggle(v) {
    if (!creator) return;
    eOpen = v === undefined ? !eOpen : !!v; win.hidden = !eOpen;
    if (eOpen) { if (!eRen) eInit(); eSetKind(eKind); if (window.WinPos) window.WinPos.place(win, "objedit"); }
    giz.visible = eOpen;
  }
  function eInit() {
    eRen = new THREE.WebGLRenderer({ canvas: ceCanvas, antialias: true, alpha: true }); eRen.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); eRen.setSize(VIEW, VIEW, false);
    sdRen = new THREE.WebGLRenderer({ canvas: sdCanvas, antialias: true, alpha: true }); sdRen.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); sdRen.setSize(VIEW, VIEW, false);
    sdCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
    eScene = new THREE.Scene(); eScene.add(new THREE.HemisphereLight(0x8fa7c8, 0x10141c, 1.0)); const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(300, 500, 200); eScene.add(sun);
    eCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000); eCam.up.set(0, 0, -1); eCam.position.set(0, 800, 0); eCam.lookAt(0, 0, 0);
  }
  function eRender() {
    if (!eOpen || !eRen) return;
    const key = eKind === "ship" ? "ship:" + ctx.shipReady() : meshKey(eKind) + ":" + fp();
    if (eMeshK !== key) {
      if (eMesh) eScene.remove(eMesh);
      eMesh = eKind === "ship" ? ctx.makeShipPlain() : typeObject(curType(), null);
      if (eKind !== "ship") eMesh.scale.setScalar(fp());
      eScene.add(eMesh); eMeshK = key;
      { const bb = new THREE.Box3().setFromObject(eMesh); eMeshH = Math.max(1, bb.isEmpty() ? fp() * 0.3 : bb.max.y); } sDraw();
    }
    const h = H(), ox = ePan[0] * fp(), oy = ePan[1] * fp(); eCam.left = ox - h; eCam.right = ox + h; eCam.top = oy + h; eCam.bottom = oy - h; eCam.updateProjectionMatrix();
    if (!ceTop.hidden) eRen.render(eScene, eCam);
    if (!ceSide.hidden) { sAim(); sdRen.render(eScene, sdCam); }
  }
  // ---- (owner, 2026-10-15) the side view: the model from the side (the camera kept level; drag the empty view to go
  // around it). The Effects Level is a dashed red line across it, dragged up and down; in Hardpoint, the hardpoint is a dot
  // dragged up and down (its elevation). Heights are footprint units, like the plan ----
  const sMid = () => eMeshH / 2, sH = () => Math.max(H(), eMeshH * 0.75);
  function sAim() {
    const h = sH(), cy = sMid(); sdCam.left = -h; sdCam.right = h; sdCam.top = cy + h; sdCam.bottom = cy - h;
    sdCam.position.set(Math.sin(sideYaw) * 1500, 0, Math.cos(sideYaw) * 1500); sdCam.up.set(0, 1, 0); sdCam.lookAt(0, 0, 0); sdCam.updateProjectionMatrix(); sdCam.updateMatrixWorld();
  }
  const sK = () => VIEW / (2 * sH());                        // px per m
  const sPy = (m) => VIEW / 2 - (m - sMid()) * sK();
  const sPx = (ux, uy) => { const rx = Math.cos(sideYaw), rz = -Math.sin(sideYaw); return VIEW / 2 + (ux * fp() * rx + -uy * fp() * rz) * sK(); };   // a plan spot, across the side view
  const ss = (tag, attrs) => { const n = document.createElementNS(SV, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); sdSvg.appendChild(n); return n; };
  function sDraw() {
    while (sdSvg.firstChild) sdSvg.removeChild(sdSvg.firstChild);
    if (ceSide.hidden) return;
    const fy = sPy(eEx.fx * fp()), hx = sPx(eWo[0], eWo[1]), hy = sPy(eEx.hz * fp());
    ss("line", { x1: 0, y1: fy, x2: VIEW, y2: fy, class: "ce-fx" + (eMode === "pts" ? "" : " dim") });
    if (eMode === "pts") { const hit = ss("line", { x1: 0, y1: fy, x2: VIEW, y2: fy, class: "ce-fx-hit" }); hit.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); snap(); sGrab(e, "fx"); }); }
    if (isShipKind()) {
      const c = ss("circle", { cx: hx, cy: hy, r: 7, class: eMode === "pts" ? "ce-woh" : "ce-woh dim" });
      if (eMode === "pts") c.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); snap(); sGrab(e, "hz"); });
    }
  }
  let sDrag = null;
  function sGrab(e, type) { sDrag = { type, id: e.pointerId, x: e.clientX }; try { sdSvg.setPointerCapture(e.pointerId); } catch {} }
  sdSvg.addEventListener("pointerdown", (e) => { if (e.button !== 0 || e.target !== sdSvg) return; e.preventDefault(); sGrab(e, "rot"); });   // the empty view: go around the model
  sdSvg.addEventListener("pointermove", (e) => {
    if (!sDrag || e.pointerId !== sDrag.id) return;
    const r = sdSvg.getBoundingClientRect(), py = (e.clientY - r.top) * VIEW / r.height, m = Math.max(0, (VIEW / 2 - py) / sK() + sMid()), u = Math.round(m / fp() * 10000) / 10000;
    if (sDrag.type === "rot") { sideYaw -= (e.clientX - sDrag.x) * 0.012; sDrag.x = e.clientX; }
    else if (sDrag.type === "fx") eEx = { ...eEx, fx: Math.min(3, u) };
    else if (sDrag.type === "hz") eEx = { ...eEx, hz: Math.min(3, u) };
    sDraw();
  });
  const sEnd = (e) => { if (!sDrag || e.pointerId !== sDrag.id) return; const t = sDrag.type; sDrag = null; try { sdSvg.releasePointerCapture(e.pointerId); } catch {} if (t !== "rot") eSave(); sDraw(); };
  sdSvg.addEventListener("pointerup", sEnd); sdSvg.addEventListener("pointercancel", sEnd);
  sdSvg.addEventListener("wheel", (e) => { e.preventDefault(); e.stopPropagation(); eZoom = Math.max(0.5, Math.min(8, eZoom * Math.pow(1.1, -e.deltaY / 100))); eDraw(); sDraw(); }, { passive: false });
  // ---- undo / redo: the kind's three things before each change ----
  const state = () => JSON.stringify({ parts: eParts, part: ePart, vis: EP.vis, pv: ePv, wo: eWo, mv: eMv, ex: eEx });
  const apply = (j) => { const o = JSON.parse(j); eParts = o.parts; ePart = Math.min(o.part, eParts.length - 1); EP.vis = o.vis; ePv = o.pv; eWo = o.wo || [0, 0]; eMv = o.mv; eEx = o.ex || { ...EXTRA_DEFAULT }; eSave(); drawSub(); eDraw(); sDraw(); };
  function snap() { past.push(state()); if (past.length > 100) past.shift(); future = []; }
  function undo() { if (!past.length) return; future.push(state()); apply(past.pop()); }
  function redo() { if (!future.length) return; past.push(state()); apply(future.pop()); }
  // ---- mirrored editing: each corner's partner is the corner at its mirror image (left <-> right) ----
  const partner = (i) => { const [x, y] = EP[pk()][i]; if (Math.abs(x) < 0.004) return -2; let best = -1, bd = 0.03;
    EP[pk()].forEach(([a, b], j) => { if (j === i) return; const d = Math.hypot(a + x, b - y); if (d < bd) { bd = d; best = j; } }); return best; };   // -2: on the middle line
  const SV = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs) => { const n = document.createElementNS(SV, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); ceSvg.appendChild(n); return n; };
  const handle = (x, y, r, cls, onDown) => { const c = sv("circle", { cx: x, cy: y, r, class: cls }); c.addEventListener("pointerdown", onDown); return c; };
  function eDraw() {
    while (ceSvg.firstChild) ceSvg.removeChild(ceSvg.firstChild);
    if (!EP[pk()]) return;
    const px = EP[pk()].map(toPx), [vx, vy] = toPx(ePv), [wx, wy] = toPx(eWo);
    const [mx0, my0] = toPx([eMv.x0, eMv.y0]), [mx1, my1] = toPx([eMv.x1, eMv.y1]), mcx = (mx0 + mx1) / 2, mcy = (my0 + my1) / 2;
    // all of them always drawn; the one being edited is bright and has handles (the other combat-points parts fainter)
    eParts.forEach((p, i) => { if (i !== ePart) sv("polygon", { points: p.pts.map(toPx).map((q) => q.join(",")).join(" "), class: "ce-poly" + (eMode === "sight" ? " other" : " dim") }); });
    sv("polygon", { points: EP.sight.map(toPx).map((p) => p.join(",")).join(" "), class: "ce-poly" + (eMode === "sight" ? "" : " dim") });
    sv("polygon", { points: moveLoc(eMv).map(toPx).map((p) => p.join(",")).join(" "), class: "ce-ell" + (eMode === "move" ? "" : " dim") });
    sv("path", { d: `M${vx - 9} ${vy} L${vx + 9} ${vy} M${vx} ${vy - 9} L${vx} ${vy + 9}`, class: "ce-piv" + (eMode === "pts" ? "" : " dim") });
    if (isShipKind() && eMode !== "pts") sv("path", { d: `M${wx - 7} ${wy - 7} L${wx + 7} ${wy + 7} M${wx - 7} ${wy + 7} L${wx + 7} ${wy - 7}`, class: "ce-wo dim" });   // (owner, 2026-10-15) the hardpoint (was the Weapon Origin), faint outside its tab
    const [gx, gy] = toPx([guide.x, guide.y]);   // the rulers
    for (const [x1, y1, x2, y2, ax] of [[0, gy, VIEW, gy, "y"], [gx, 0, gx, VIEW, "x"]]) {
      sv("line", { x1, y1, x2, y2, class: "ce-guide" });
      const hit = sv("line", { x1, y1, x2, y2, class: "ce-guide-hit" + (ax === "x" ? " v" : " h") });
      hit.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.preventDefault(); eGrab(e, "g" + ax); });
    }
    if (eMode !== "pts") for (const [x, y] of EP.vis.map(toPx)) sv("circle", { cx: x, cy: y, r: 3, class: "ce-vdot dim" });   // the visibility points, faint
    if (eMode === "pts") {                       // visibility points: click empty space to add one; drag one to move it; right-click removes it
      px.forEach((p, i) => handle(p[0], p[1], 6, "ce-vpt", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (e.button === 2) { removeCorner(i); return; }
        if (e.button === 0) { snap(); eGrab(e, "pt", i); }
      }));
      handle(vx, vy, 7, "ce-pt", (e) => { if (e.button === 0) { e.preventDefault(); e.stopPropagation(); snap(); eGrab(e, "pv"); } });   // the pivot
      if (isShipKind()) {
      px.forEach((p, i) => {                     // the middle of each edge: click to add a corner there
        const q = px[(i + 1) % px.length];
        handle((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 4, "ce-mid", (e) => { if (e.button !== 0) return; e.preventDefault(); snap(); eGrab(e, "pt", addCorner(i)); });
      });
      px.forEach((p, i) => handle(p[0], p[1], 6, "ce-pt", (e) => {
        e.preventDefault();
        if (e.button === 2) { removeCorner(i); return; }   // right-click removes it
        if (e.button === 0) { snap(); eGrab(e, "pt", i); }
      }));
      // (owner, 2026-10-15) the hardpoint: its spot (drag the dot), its rotation limit (the shaded arc around it: drag an
      // end; all the way round is endless) and its default facing (the arrow: drag its tip)
      const R = 70, rad = (d) => d * Math.PI / 180, at = (d, r) => [wx - Math.sin(rad(d)) * r, wy + Math.cos(rad(d)) * r];   // (degrees clockwise from the nose, which points down here)
      sv("circle", { cx: wx, cy: wy, r: R, class: "ce-arcring" });
      if (eEx.arc >= 360) sv("circle", { cx: wx, cy: wy, r: R, class: "ce-arc" });
      else { const a0 = eEx.dir - eEx.arc / 2, a1 = eEx.dir + eEx.arc / 2, [x0, y0] = at(a0, R), [x1, y1] = at(a1, R); sv("path", { d: `M${wx} ${wy} L${x0} ${y0} A${R} ${R} 0 ${eEx.arc > 180 ? 1 : 0} 1 ${x1} ${y1} Z`, class: "ce-arc" }); }
      const [tx, ty] = at(eEx.dir, R * 0.82), [ha, hb] = [at(eEx.dir - 160, 12), at(eEx.dir + 160, 12)].map(([x, y]) => [x - wx + tx, y - wy + ty]);
      sv("path", { d: `M${wx} ${wy} L${tx} ${ty} M${ha[0]} ${ha[1]} L${tx} ${ty} L${hb[0]} ${hb[1]}`, class: "ce-dir" });
      for (const end of eEx.arc >= 360 ? [eEx.dir + 180] : [eEx.dir - eEx.arc / 2, eEx.dir + eEx.arc / 2]) { const [x, y] = at(end, R); handle(x, y, 6, "ce-sq", (e) => { if (e.button === 0) { e.preventDefault(); e.stopPropagation(); snap(); eGrab(e, "arc"); } }); }
      handle(tx, ty, 6, "ce-pt", (e) => { if (e.button === 0) { e.preventDefault(); e.stopPropagation(); snap(); eGrab(e, "dir"); } });
      handle(wx, wy, 7, "ce-woh", (e) => { if (e.button === 0) { e.preventDefault(); e.stopPropagation(); snap(); eGrab(e, "wo"); } });
      }
    } else if (eMode === "move") {
      handle(mcx, mcy, 6, "ce-pt", (e) => { if (e.button === 0) { e.preventDefault(); snap(); eGrab(e, "mc"); } });
      // (owner, 2026-10-14) a handle on each side, each moving only its own side
      for (const [hx, hy, side] of [[mx1, mcy, "x1"], [mx0, mcy, "x0"], [mcx, my1, "y1"], [mcx, my0, "y0"]])
        handle(hx, hy, 6, "ce-sq", (e) => { if (e.button === 0) { e.preventDefault(); snap(); eGrab(e, "m" + side); } });
    }
  }
  function addCorner(i) {                      // a corner in the middle of edge i (and, mirrored, on its mirror edge); returns its index
    const n = EP[pk()].length, a = EP[pk()][i], b = EP[pk()][(i + 1) % n], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let mi = -1;
    if (mirror) { const pa = partner(i), pb = partner((i + 1) % n); if (pa >= 0 && pb >= 0 && (pb + 1) % n === pa && pb !== i) mi = pb; }   // the mirror edge runs pb -> pa
    if (mi < 0) { EP[pk()].splice(i + 1, 0, m); return i + 1; }
    const mm = [-m[0], m[1]];
    if (mi > i) { EP[pk()].splice(mi + 1, 0, mm); EP[pk()].splice(i + 1, 0, m); return i + 1; }
    EP[pk()].splice(i + 1, 0, m); EP[pk()].splice(mi + 1, 0, mm); return i + 2;
  }
  function removeCorner(i) {
    const j = mirror ? partner(i) : -1, gone = j >= 0 ? [i, j] : [i];
    if (EP[pk()].length - gone.length < (pk() === "vis" ? 1 : 3)) return;   // an outline keeps 3 corners; visibility keeps 1 point
    snap(); EP[pk()] = EP[pk()].filter((_, k) => !gone.includes(k)); eSave(); eDraw();
  }
  // a click on empty space in the Visibility tab adds a point there (mirrored: a pair, or one on the middle line)
  ceSvg.addEventListener("pointerdown", (e) => {
    if (eMode !== "pts" || e.button !== 0 || e.target !== ceSvg || EP.vis.length >= 32) return;
    e.preventDefault(); const r = ceSvg.getBoundingClientRect(); let u = fromPx((e.clientX - r.left) * VIEW / r.width, (e.clientY - r.top) * VIEW / r.height);
    if (Math.abs(u[0] - guide.x) * S() < SNAP) u[0] = guide.x; if (Math.abs(u[1] - guide.y) * S() < SNAP) u[1] = guide.y;
    snap();
    if (mirror && Math.abs(u[0]) * S() < SNAP) u = [0, u[1]];
    EP.vis.push(u); if (mirror && u[0] !== 0 && EP.vis.length < 32) EP.vis.push([-u[0], u[1]]);
    eGrab(e, "pt", EP.vis.indexOf(u));
  });
  function eGrab(e, type, i) { eDrag = { type, i, id: e.pointerId, mate: type === "pt" && mirror ? partner(i) : -1 }; try { ceSvg.setPointerCapture(e.pointerId); } catch {} eDraw(); }
  ceSvg.addEventListener("pointermove", (e) => {
    if (!eDrag || e.pointerId !== eDrag.id) return;
    const r = ceSvg.getBoundingClientRect(), u = fromPx((e.clientX - r.left) * VIEW / r.width, (e.clientY - r.top) * VIEW / r.height);
    if (eDrag.type === "gx") { guide.x = u[0]; eDraw(); return; }
    if (eDrag.type === "arc" || eDrag.type === "dir") {      // (owner, 2026-10-15) an angle around the hardpoint, clockwise from forward
      const [wx, wy] = toPx(eWo), sx = (e.clientX - r.left) * VIEW / r.width, sy = (e.clientY - r.top) * VIEW / r.height, ang = Math.atan2(-(sx - wx), sy - wy) * 180 / Math.PI;
      if (eDrag.type === "dir") eEx = { ...eEx, dir: Math.round(((ang % 360) + 360) % 360) };
      else { let d = Math.abs(((ang - eEx.dir) % 360 + 540) % 360 - 180); eEx = { ...eEx, arc: Math.max(1, Math.min(360, Math.round(d * 2))) }; if (eEx.arc >= 354) eEx.arc = 360; }
      eDraw(); return;
    }
    if (eDrag.type === "gy") { guide.y = u[1]; eDraw(); return; }
    if (Math.abs(u[0] - guide.x) * S() < SNAP) u[0] = guide.x;                 // snap to the rulers
    if (Math.abs(u[1] - guide.y) * S() < SNAP) u[1] = guide.y;
    if (eDrag.type === "pt") {
      const near = Math.abs(u[0]) * S() < SNAP, n = EP[pk()].length;
      if (eDrag.mate === -2) {                   // mirrored, on the middle line: stays on it until dragged clear sideways,
        if (near) EP[pk()][eDrag.i] = [0, u[1]];     // then (owner) it splits into a mirrored pair
        else {
          const i = eDrag.i, prev = EP[pk()][(i - 1 + n) % n], next = EP[pk()][(i + 1) % n], me = u, mm = [-u[0], u[1]];
          // the copy goes on the side of the neighbor that's on its own side, so the outline doesn't cross itself
          if ((prev[0] - next[0]) * u[0] >= 0) { EP[pk()][i] = me; EP[pk()].splice(i + 1, 0, mm); eDrag.mate = i + 1; }
          else { EP[pk()][i] = mm; EP[pk()].splice(i + 1, 0, me); eDrag.i = i + 1; eDrag.mate = i; }
        }
      } else if (eDrag.mate >= 0 && near) {      // (owner) a mirrored pair dragged together merges back into one on the middle line
        const keep = Math.min(eDrag.i, eDrag.mate), gone = Math.max(eDrag.i, eDrag.mate);
        if (n > (pk() === "vis" ? 1 : 3)) { EP[pk()].splice(gone, 1); EP[pk()][keep] = [0, u[1]]; eDrag.i = keep; eDrag.mate = -2; }
        else { EP[pk()][eDrag.i] = u; EP[pk()][eDrag.mate] = [-u[0], u[1]]; }
      } else { EP[pk()][eDrag.i] = u; if (eDrag.mate >= 0) EP[pk()][eDrag.mate] = [-u[0], u[1]]; }
    }
    else if (eDrag.type === "mc") { const hx = (eMv.x1 - eMv.x0) / 2, hy = (eMv.y1 - eMv.y0) / 2; eMv = { ...eMv, x0: u[0] - hx, x1: u[0] + hx, y0: u[1] - hy, y1: u[1] + hy }; }
    else if (eDrag.type === "mx0") eMv.x0 = Math.min(u[0], eMv.x1 - 0.04);
    else if (eDrag.type === "mx1") eMv.x1 = Math.max(u[0], eMv.x0 + 0.04);
    else if (eDrag.type === "my0") eMv.y0 = Math.min(u[1], eMv.y1 - 0.04);
    else if (eDrag.type === "my1") eMv.y1 = Math.max(u[1], eMv.y0 + 0.04);
    else if (eDrag.type === "pv") ePv = [mirror ? 0 : u[0], u[1]];
    else if (eDrag.type === "wo") eWo = [mirror ? 0 : u[0], u[1]];
    eDraw(); if (eDrag.type === "wo") sDraw();
  });
  const eEnd = (e) => { if (!eDrag || e.pointerId !== eDrag.id) return; const g = eDrag.type[0] === "g"; eDrag = null; try { ceSvg.releasePointerCapture(e.pointerId); } catch {} if (!g) eSave(); eDraw(); };
  ceSvg.addEventListener("pointerup", eEnd); ceSvg.addEventListener("pointercancel", eEnd);
  const r4 = (x) => Math.round(x * 10000) / 10000;
  function eSave() { send({ t: "coll", k: eKind, parts: eParts.map((p) => ({ t: p.t, pts: p.pts.map(([x, y]) => [r4(x), r4(y)]) })), vis: EP.vis.map(([x, y]) => [r4(x), r4(y)]), pv: ePv.map(r4), wo: eWo.map(r4), mv: cleanMove(eMv), ex: eEx }); }
  function setColl(k, parts, pv, mv, vis, wo, ex) {
    const ps = asParts(parts); if (!kindOk(k) || !ps) return;
    colliders[k] = ps; if (Array.isArray(vis)) visOutlines[k] = vis; if (Array.isArray(pv)) pivots[k] = pv; if (Array.isArray(wo)) origins[k] = wo; if (ex && typeof ex === "object") collExtra[k] = ex; const m = cleanMove(mv); if (m) movers[k] = m;
    for (const b of builds.values()) if (b.k === k) place(b);
    if (ctx.onPivot) ctx.onPivot();   // (the player ship may be any Ship object, owner 2026-10-15)
    if (eOpen && eKind === k && !eDrag) { eParts = cloneParts(ps); ePart = Math.min(ePart, eParts.length - 1); EP.vis = (visOutlines[k] || dflt(VIS_DEFAULT, k)).map((q) => q.slice()); ePv = (pivots[k] || [0, 0]).slice(); eWo = (origins[k] || [0, 0]).slice(); eMv = { ...(movers[k] || dflt(MOVE_DEFAULT, k)) }; eEx = { ...EXTRA_DEFAULT, ...(collExtra[k] || {}) }; drawSub(); eDraw(); sDraw(); }
  }
  // ---- the colliders in the world while the editor is open: Sight outlines cyan, Movement orange, pivots purple ----
  const gizGeo = new THREE.BufferGeometry(); let gizCap = 0;
  const giz = new THREE.LineSegments(gizGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthTest: false }));
  giz.renderOrder = 10; giz.frustumCulled = false; giz.visible = false; scene.add(giz);
  const C_SIGHT = [0.62, 0.85, 1], C_MOVE = [1, 0.75, 0.35], C_PIV = [0.82, 0.7, 1], C_WO = [1, 0.42, 0.42], C_VIS = [0.45, 1, 0.55];
  function gizFrame() {
    if (!eOpen) return;
    const P = [], C = [];
    const loop = (v, col) => { for (let i = 0; i < v.length; i += 2) { P.push(v[i], 2, -v[i + 1], v[(i + 2) % v.length], 2, -v[(i + 3) % v.length]); C.push(...col, ...col); } };
    const dots = (v) => { const a = 4; for (let i = 0; i < v.length; i += 2) { const x = v[i], y = v[i + 1]; P.push(x - a, 2, -y, x + a, 2, -y, x, 2, -(y - a), x, 2, -(y + a)); for (let k = 0; k < 4; k++) C.push(...C_VIS); } };
    const cross = (x, y) => { const a = 8; P.push(x - a, 2, -y, x + a, 2, -y, x, 2, -(y - a), x, 2, -(y + a)); for (let k = 0; k < 4; k++) C.push(...C_PIV); };
    const ex = (x, y) => { const a = 6; P.push(x - a, 2, -(y - a), x + a, 2, -(y + a), x - a, 2, -(y + a), x + a, 2, -(y - a)); for (let k = 0; k < 4; k++) C.push(...C_WO); };   // a ship's Weapon Origin: a red x
    for (const b of builds.values()) { if (b.k === "ship" || b.k === "cloud") continue; for (const v of b.polys) loop(v, C_SIGHT); loop(b.mpoly, C_MOVE); cross(b.x, b.y); }   // (test ships: drawn with the ships below)
    for (const s of ctx.shipGizmos ? ctx.shipGizmos() : []) { for (const v of s.sight) loop(v, C_SIGHT); loop(s.move, C_MOVE); if (s.vis) dots(s.vis); cross(s.x, s.y); if (s.wo) ex(s.wo[0], s.wo[1]); }
    if (P.length > gizCap) { gizCap = Math.max(P.length, gizCap * 2, 3000); gizGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(gizCap), 3)); gizGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(gizCap), 3)); }
    gizGeo.attributes.position.array.set(P); gizGeo.attributes.color.array.set(C); gizGeo.attributes.position.needsUpdate = gizGeo.attributes.color.needsUpdate = true;
    gizGeo.setDrawRange(0, P.length / 3);
  }
  addEventListener("keydown", (e) => {
    if (ctx.typing() || !creator) return;
    if (eOpen && (e.ctrlKey || e.metaKey) && (e.code === "KeyZ" || e.code === "KeyU")) { e.preventDefault(); e.stopImmediatePropagation(); if (e.code === "KeyZ") undo(); else redo(); return; }   // (owner) Ctrl+Z undo, Ctrl+U redo
    if (e.code === "Escape" && !open && eOpen) eToggle(false);
  }, true);

  function onMsg(m) {
    if (m.t === "build") { setBuild(m.o); return true; }
    if (m.t === "unbuild") { unBuild(m.id); return true; }
    if (m.t === "bnew") return true;
    if (m.t === "botgoals") { botGoals.clear(); for (const g of Array.isArray(m.g) ? m.g : []) if (Array.isArray(g) && g.length === 3) botGoals.set(String(g[0]), [+g[1], +g[2]]); return true; }
    if (m.t === "coll") { setColl(m.k, m.parts, m.pv, m.mv, m.vis, m.wo, m.ex); return true; }
    if (m.t === "types") { setTypes(m.list); return true; }   // (owner, 2026-10-15) object types
    if (m.t === "tsaved") { onTypeSaved(m); return true; }
    return false;
  }
  // the ship model arrived (or changed): rebuild the test ships with it
  function refreshShips() { for (const b of builds.values()) if (b.k === "ship" && b.mesh) { scene.remove(b.mesh); b.mesh = null; place(b); } }
  function load(list, h, shipD, coll, piv, mov, vis, ori, ext) {
    if (shipD) SHIP_D = shipD;
    const keys = (o) => (o && typeof o === "object" ? Object.keys(o).filter(kindOk) : []);   // (the built-in kinds and the object types; setTypes comes first)
    for (const k of Object.keys(colliders)) delete colliders[k]; for (const k of keys(coll)) { const ps = asParts(coll[k]); if (ps) colliders[k] = ps; }
    for (const o of [pivots, origins, movers, visOutlines, collExtra]) for (const k of Object.keys(o)) delete o[k];
    for (const k of keys(ext)) if (ext[k] && typeof ext[k] === "object") collExtra[k] = ext[k];
    for (const k of new Set([...keys(piv), ...keys(ori), ...keys(mov), ...keys(vis)])) { if (piv && Array.isArray(piv[k])) pivots[k] = piv[k]; if (ori && Array.isArray(ori[k])) origins[k] = ori[k]; const m = mov && cleanMove(mov[k]); if (m) movers[k] = m; if (vis && Array.isArray(vis[k])) visOutlines[k] = vis[k]; }
    if (ctx.onPivot) ctx.onPivot();
    if (h && h !== BUILD_H) BUILD_H = h;
    held = null;
    for (const id of [...builds.keys()]) unBuild(id);
    for (const o of list || []) setBuild(o);
  }
  // (owner, 2026-10-15) for the CREATOR (creator.js): an object's picture, and its Object Editor
  const editObject = (k) => { eToggle(true); eSetKind(k); };
  return { typePic: (t, px) => typePic(t, px), shipPic: () => shipPic(), editObject, onMsg, load, frame, setStaff, setClock(t) { if (Number.isFinite(t)) gone.skew = t - Date.now(); }, setTypes, onTypeSaved, refreshShips, get open() { return open; }, get editorOpen() { return eOpen; } };
}
