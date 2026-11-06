// Atamus 3D view (owner, 2026-11-03; space, 2026-11-05): the cargo station drawn in 3D with a perspective camera you tilt
// (45° to straight down), turn and zoom. 1 unit = 1 m. Basic shapes for now: the owner will make the models. game.js keeps
// every rule, click and queue; this file draws, moves the camera and says what's under the pointer (3D colliders).
import * as THREE from "./vendor/three.module.min.js";

const R3 = window.ATAMUS_3D, G = R3.game;
const { HR, HW, RZ, PH, CARRY, X0, MW, MH, LANE_Z, UNIT, COLORS, BERTHS, DOCK, STALLS, PARK, SLOTS, SPOTS } = G;
const TAU = Math.PI * 2, clamp = (v, a, b) => (v < a ? a : v > b ? b : v), hyp = Math.hypot;

// ---- renderer, scene, light: deep space, a sun, a planet far below ----
const glc = document.getElementById("gl"), ov = document.getElementById("view"), octx = ov.getContext("2d");
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color("#04060c");
const FOV = 40, camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 4000); camera.rotation.order = "YXZ";
scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x1a1420, 1.1));
const sun = new THREE.DirectionalLight(0xfff2dc, 2.8);
const MIDX = (X0 + MW) / 2, MIDZ = MH / 2;
sun.position.set(MIDX - 40, 80, MIDZ + 30); sun.target.position.set(MIDX, 0, MIDZ); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 60, bottom: -60, near: 1, far: 260 }); sun.shadow.camera.updateProjectionMatrix();
// stars on a far sphere, and a planet far below
{
  const n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, a = Math.random() * TAU, r = 1500, s = Math.sqrt(1 - u * u); pos.set([MIDX + r * s * Math.cos(a), r * u, MIDZ + r * s * Math.sin(a)], i * 3); const w = 0.55 + Math.random() * 0.45, tint = Math.random(); col.set([w * (tint < 0.2 ? 0.8 : 1), w * 0.92, w * (tint > 0.8 ? 0.75 : 1)], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true })));
  const planet = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), new THREE.MeshStandardMaterial({ color: "#2a5a8a", roughness: 0.9, emissive: "#0a1a2e", emissiveIntensity: 0.6 }));
  planet.position.set(MIDX + 300, -1300, MIDZ + 500); scene.add(planet);
  const haze = new THREE.Mesh(new THREE.SphereGeometry(930, 64, 32), new THREE.MeshBasicMaterial({ color: "#5fa8ff", transparent: true, opacity: 0.12, side: THREE.BackSide }));
  haze.position.copy(planet.position); scene.add(haze);
}

const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6, metalness: 0.35 }, o));
const GLOWS = {}, glow = (c) => GLOWS[c] || (GLOWS[c] = new THREE.MeshBasicMaterial({ color: c })), lampM = (c) => new THREE.MeshBasicMaterial({ color: c });
const BOXG = new THREE.BoxGeometry(1, 1, 1);
function box(w, h, d, material, x = 0, y = 0, z = 0, parent) { const b = new THREE.Mesh(BOXG, material); b.scale.set(w, h, d); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; (parent || scene).add(b); return b; }
const hexRingG = (r, w) => { const g = new THREE.RingGeometry(r - w, r, 6, 1); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 6); return g; };   // flat, pointy north–south like the containers
const ringG = (r, w) => { const g = new THREE.RingGeometry(r - w, r, 32, 1); g.rotateX(-Math.PI / 2); return g; };
const COLM = new THREE.MeshBasicMaterial({ visible: false });   // colliders are never drawn
const COLLIDERS = [];
function collider(w, h, d, x, y, z, data) { const c = new THREE.Mesh(BOXG, COLM); c.scale.set(w, h, d); c.position.set(x, y, z); Object.assign(c.userData, data); scene.add(c); COLLIDERS.push(c); return c; }

// ---- the station: the docking spine and loading deck, and everything built: the storage platforms, the dock stations,
// the customer pads; lights along their edges ----
const hullM = mat("#3a4250"), deckM = mat("#4a5260", { roughness: 0.8 }), expDeckM = mat("#3c4a5e", { roughness: 0.8 }), darkM = mat("#1c2028"), trussM = mat("#59606c", { metalness: 0.6 });
const edgeM = glow("#5fd3ff"), warnM = glow("#f2a93b"), padM = glow("#7fd88a"), custPadM = glow("#c8d0dc"), expLineM = glow("#7fc8ff");
const slotLineM = new THREE.MeshBasicMaterial({ color: "#a8c0e0", transparent: true, opacity: 0.55 }), unsetM = new THREE.MeshBasicMaterial({ color: "#8fa8c8", transparent: true, opacity: 0.16 });
function slab(x0, x1, z0, z1, m2 = deckM, t = 0.5, parent) { box(x1 - x0, t, z1 - z0, m2, (x0 + x1) / 2, -t / 2, (z0 + z1) / 2, parent); for (const z of [z0, z1]) box(x1 - x0, 0.06, 0.08, edgeM, (x0 + x1) / 2, 0.01, z, parent); }
// (owner, 2026-11-05) thruster fire: a glowing cone pointing down from its nozzle (turn it to point elsewhere), an outer
// flame and a hot core, flickering
const FLAMEG = new THREE.ConeGeometry(1, 1, 14, 1, true); FLAMEG.rotateX(Math.PI); FLAMEG.translate(0, -0.5, 0);
const fireM = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const FIRE = { orange: [fireM("#ff7a1a", 0.75), fireM("#ffe7a0", 0.9)], blue: [fireM("#3fa8ff", 0.7), fireM("#e6f6ff", 0.9)] };
function flame(kind, parent, x, y, z) { const f = new THREE.Group(), [a, b] = FIRE[kind]; const o = new THREE.Mesh(FLAMEG, a), i = new THREE.Mesh(FLAMEG, b); i.scale.set(0.45, 0.6, 0.45); f.add(o, i); f.position.set(x, y, z); f.visible = false; (parent || scene).add(f); return f; }
function burn(f, len, r) { if (len <= 0.05) { f.visible = false; return; } f.visible = true; f.scale.set(r, len * (0.82 + 0.36 * Math.random()), r); }
// (owner, 2026-11-05) bought things fly up into place from below on their thrusters: how far below they still are
const RISE = 28, RISE_T = 2.8, rising = new Map();   // thing -> when it started rising
const nowS = () => performance.now() / 1000;
function riseOff(k) { const t0 = rising.get(k); if (t0 === undefined) return 0; const p = (nowS() - t0) / RISE_T; if (p >= 1) { rising.delete(k); return 0; } return -RISE * Math.pow(1 - p, 3); }
const liftFires = (fires, off, r) => { for (const f of fires) burn(f, off < -0.05 ? 2.2 + Math.min(1, -off / 6) * 2.5 : 0, r); };
// the docking spine (the arms' rail) and the loading deck under the arms' spots
const SPX0 = DOCK.x0 - 3, SPX1 = DOCK.x0 + DOCK.cols * HW + 3;
box(SPX1 - SPX0, 0.8, 1.6, hullM, (SPX0 + SPX1) / 2, -0.3, 12.6); box(SPX1 - SPX0, 0.12, 0.2, warnM, (SPX0 + SPX1) / 2, 0.15, 11.85);
slab(SPX0, SPX1, 13.4, LANE_Z + 2.4);
// slot marks: a circle, a square or a hexagon (the containers' shapes); a slot with no shape set yet is a faint square
const sqRingG = (r, w) => { const g = new THREE.RingGeometry(r - w, r, 4, 1); g.rotateZ(Math.PI / 4); g.rotateX(-Math.PI / 2); return g; };
const SLOTG = [ringG(1.05, 0.07), sqRingG(1.27, 0.1), hexRingG(HR * 0.98, 0.07)], UNSETG = sqRingG(1.27, 0.06), INBAYG = ringG(1.3, 0.08), OUTBAYG = hexRingG(1.5, 0.12), LANEG = ringG(1.35, 0.08), PADG = ringG(1.4, 0.08), DOCKRG = hexRingG(1.35, 0.1);
const SHARED = new Set([BOXG, FLAMEG, ...SLOTG, UNSETG, INBAYG, OUTBAYG, LANEG, PADG, DOCKRG]);
// (owner, 2026-11-05) everything built is rebuilt whenever the layout changes (a new piece flies up into place)
let DYN = [], DYNCOL = [], builtVer = -1, firstBuild = true;
const known = new WeakSet(), LSP = new Map(), TILE3 = new Map(), DOCKS = new Map(), PADS = [], CRANES = new Map();
const addDyn = (o) => { scene.add(o); DYN.push(o); return o; };
const dynCollider = (w, h, d, x, y, z, data) => { const c = collider(w, h, d, x, y, z, data); DYNCOL.push(c); return c; };
// (owner, 2026-11-06) a unit of storage: a deck tile, joined at the edges to the units beside it (a glowing edge where
// nothing's built next to it), with its mark: a slot's shape, a hauler spot's ring, a truck spot's yellow hexagon
const TILEM = { slot: deckM, crane: mat("#3a404c", { roughness: 0.8 }), hspot: mat("#4a4a42", { roughness: 0.8 }), tspot: mat("#4c4636", { roughness: 0.8 }) };
function tileObj(t, near) {
  const g = new THREE.Group(), h = UNIT / 2;
  box(UNIT, 0.5, UNIT, TILEM[t.kind], 0, -0.25, 0, g);
  for (const [di, dj, ex, ez, w, d] of [[1, 0, h, 0, 0.08, UNIT], [-1, 0, -h, 0, 0.08, UNIT], [0, 1, 0, h, UNIT, 0.08], [0, -1, 0, -h, UNIT, 0.08]]) if (!near(t.i + di, t.j + dj)) box(w, 0.06, d, edgeM, ex, 0.01, ez, g);
  if (t.kind === "slot") { const m2 = new THREE.Mesh(SLOTG[t.shape], slotLineM); m2.position.y = 0.015; g.add(m2); }
  else if (t.kind === "hspot") { const m2 = new THREE.Mesh(INBAYG, warnM); m2.position.y = 0.02; g.add(m2); }
  else if (t.kind === "tspot") { const m2 = new THREE.Mesh(OUTBAYG, glow("#ffd24a")); m2.position.y = 0.02; g.add(m2); }
  box(0.5, 0.4, 0.5, darkM, 0, -0.7, 0, g); const fires = [flame("orange", g, 0, -0.9, 0)];
  g.position.set(t.x, 0, t.z); addDyn(g); TILE3.set(t, { g, fires });
  dynCollider(UNIT, 1, UNIT, t.x, -0.25, t.z, { tile: t });
  if (t.kind === "crane") platArmObj(t);
}
// (owner, 2026-11-05) a dock station: a pad with a back wall and lights
function dockObj(p) {
  const g = new THREE.Group();
  box(3.2, 0.35, 3.2, deckM, 0, -0.18, 0, g); box(3.2, 0.06, 0.08, edgeM, 0, 0.01, 1.6, g); box(3.2, 0.06, 0.08, edgeM, 0, 0.01, -1.6, g);
  box(0.25, 1.5, 3.2, hullM, -1.6, 0.6, 0, g); box(3.2, 0.45, 0.22, hullM, 0, 0.2, -1.6, g);
  box(0.2, 0.2, 0.2, glow("#ff3a3a"), -1.6, 1.4, -1.6, g); box(0.2, 0.2, 0.2, glow("#3a8aff"), 1.6, 0.25, 1.6, g);
  const r = new THREE.Mesh(DOCKRG, padM); r.position.y = 0.02; g.add(r);
  box(0.5, 0.4, 0.5, darkM, -1, -0.5, 1, g); box(0.5, 0.4, 0.5, darkM, 1, -0.5, -1, g);
  const fires = [flame("orange", g, -1, -0.7, 1), flame("orange", g, 1, -0.7, -1)];
  g.position.set(p.x, 0, p.z); addDyn(g); DOCKS.set(p, { g, fires });
  dynCollider(3.2, 1.2, 3.2, p.x, 0, p.z, { station: p });
}
// a group of 4 customer pads
function padsObj(st) {
  const g = new THREE.Group(), xs = st.map((q) => q.x), zs = st.map((q) => q.z), x0 = Math.min(...xs) - 1.8, x1 = Math.max(...xs) + 1.8, z0 = Math.min(...zs) - 1.8, z1 = Math.max(...zs) + 1.8;
  slab(x0, x1, z0, z1, deckM, 0.5, g);
  for (const s of st) { const r = new THREE.Mesh(PADG, custPadM); r.position.set(s.x, 0.02, s.z); g.add(r); dynCollider(3.4, 1.2, 3.4, s.x, 0.2, s.z, { stall: s }); }
  const fires = [[x0 + 1, z0 + 1], [x1 - 1, z1 - 1]].map(([x, z]) => { box(0.8, 0.4, 0.8, darkM, x, -0.7, z, g); return flame("orange", g, x, -0.9, z); });
  addDyn(g); PADS.push({ key: st[0], g, fires });
}
function rebuild() {
  for (const o of DYN) { scene.remove(o); o.traverse((m) => { if (m.geometry && !SHARED.has(m.geometry)) m.geometry.dispose(); }); }
  for (const c of DYNCOL) { scene.remove(c); COLLIDERS.splice(COLLIDERS.indexOf(c), 1); }
  DYN = []; DYNCOL = []; TILE3.clear(); LSP.clear(); DOCKS.clear(); PADS.length = 0; CRANES.clear();
  const fresh = (k) => { if (!known.has(k)) { known.add(k); if (!firstBuild) rising.set(k, nowS()); } };
  for (const b of BERTHS) {
    fresh(b); armObj(b);
    const r = new THREE.Mesh(LANEG, warnM); r.position.set(b.cx, 0.02, LANE_Z); addDyn(r);
    dynCollider(5, 2.4, LANE_Z + 2.4 - 12, b.cx, 0.8, (12 + LANE_Z + 2.4) / 2, { berth: b });   // its loading spot and the stretch of spine
    // (owner, 2026-11-06) the hauler spots in its line: a deck unit each with its ring
    for (const q of b.lineSpots) {
      fresh(q); const g = new THREE.Group(); box(UNIT, 0.5, UNIT, TILEM.hspot, 0, -0.25, 0, g); for (const [w, d, ex, ez] of [[UNIT, 0.08, 0, UNIT / 2], [UNIT, 0.08, 0, -UNIT / 2], [0.08, UNIT, UNIT / 2, 0], [0.08, UNIT, -UNIT / 2, 0]]) box(w, 0.06, d, edgeM, ex, 0.01, ez, g);
      const m2 = new THREE.Mesh(INBAYG, warnM); m2.position.y = 0.02; g.add(m2);
      box(0.5, 0.4, 0.5, darkM, 0, -0.7, 0, g); const fires = [flame("orange", g, 0, -0.9, 0)];
      g.position.set(q.x, 0, q.z); addDyn(g); LSP.set(q, { g, fires });
      dynCollider(UNIT, 1, UNIT, q.x, -0.25, q.z, { lspot: q });
    }
  }
  const tiles = new Map(); for (const t of [...SLOTS, ...G.CRANES, ...SPOTS]) tiles.set(t.i + "," + t.j, t);
  for (const t of tiles.values()) { fresh(t); tileObj(t, (i, j) => tiles.has(i + "," + j)); }
  for (const p of PARK) { fresh(p); dockObj(p); }
  const groups = new Map(); for (const s of STALLS) { if (!groups.has(s.group)) groups.set(s.group, []); groups.get(s.group).push(s); }
  for (const st of groups.values()) { fresh(st[0]); padsObj(st); }
  firstBuild = false; builtVer = G.ver;
}
function syncBuilt() {
  if (G.ver !== builtVer) rebuild();
  for (const [t, o] of TILE3) { const off = riseOff(t); o.g.position.y = off; liftFires(o.fires, off, 0.3); }
  for (const [t, o] of LSP) { const off = riseOff(t); o.g.position.y = off; liftFires(o.fires, off, 0.3); }
  for (const p of PARK) { const o = DOCKS.get(p), off = riseOff(p); o.g.position.y = off; liftFires(o.fires, off, 0.3); }
  for (const o of PADS) { const off = riseOff(o.key); o.g.position.y = off; liftFires(o.fires, off, 0.34); }
}

// ---- containers (owner, 2026-11-05): circles, squares and hexagons, one instance each ----
const MAXBOX = 3000;
const SHAPEG = [new THREE.CylinderGeometry(1.0, 1.0, PH * 0.94, 28), new THREE.BoxGeometry(1.74, PH * 0.94, 1.74), new THREE.CylinderGeometry(HR * 0.97, HR * 0.97, PH * 0.94, 6)];
const boxes = SHAPEG.map((g) => { const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.25 }), MAXBOX); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; });
const INST = [[], [], []];   // per shape, per instance: { slot } on the freighter, { storage, cell } on a platform, { truck } on a ship, {} on a crane
const dummy = new THREE.Object3D(), tmpC = new THREE.Color(), BASE = COLORS.map((c) => new THREE.Color(c.c)), EXPC = new THREE.Color("#0a1426");
const nBox = [0, 0, 0];
const rgbCol = (s) => { const [r, g, b] = s.split(",").map(Number); return new THREE.Color(r / 255, g / 255, b / 255); };
function putBox(c, x, y, z, yaw, info, flashRGB) {
  const k = c.s === undefined ? 2 : c.s, n = nBox[k]; if (n >= MAXBOX) return;
  dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); boxes[k].setMatrixAt(n, dummy.matrix);
  tmpC.copy(BASE[c.c]); if (c.exp) tmpC.lerp(EXPC, 0.45);
  const fl = flashRGB || (G.flashing(c) ? "255,255,255" : null);
  if (fl) tmpC.lerp(rgbCol(fl), 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(G.clock * 10)));
  boxes[k].setColorAt(n, tmpC); INST[k][n] = info; nBox[k]++;
}

// ---- the freighter: a long hull with the honeycomb cargo deck, a bridge tower and engines at the stern ----
let shipObj = null, shipOf = null;
function buildShip(s) {
  const g = new THREE.Group(), r0 = DOCK.rows - s.rows, x0 = DOCK.x0 - HR - 0.6, x1 = DOCK.x0 + (s.cols - 0.5) * HW + HR + 0.6, z0 = DOCK.z0 + r0 * RZ - HR - 0.6, z1 = DOCK.z0 + (DOCK.rows - 1) * RZ + HR + 0.6;
  const hm = mat(s.hull, { roughness: 0.5, metalness: 0.5 }), zc = (z0 + z1) / 2, w = z1 - z0;
  box(x1 - x0, 2.6, w, hm, (x0 + x1) / 2, -1.4, zc, g);
  box(x1 - x0 - 0.4, 0.1, w - 0.4, mat("#2a2f38"), (x0 + x1) / 2, -0.05, zc, g);
  // the bow: a wedge
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(3.5, w * 0.3); sh.lineTo(3.5, w * 0.7); sh.lineTo(0, w); sh.closePath();
  const bg = new THREE.ExtrudeGeometry(sh, { depth: 2.6, bevelEnabled: false }); bg.rotateX(Math.PI / 2);
  const bm = new THREE.Mesh(bg, hm); bm.position.set(x1, -0.1, z0); bm.castShadow = true; g.add(bm);
  // the stern: the bridge tower and the engines
  box(4, 2.6, w + 0.6, hm, x0 - 2, -1.4, zc, g);
  box(2.6, 4.2, Math.min(w, 6), mat("#d8dce4"), x0 - 1.6, 1.9, zc, g);
  box(0.1, 0.6, Math.min(w, 6) - 0.6, glow("#7fd0ff"), x0 - 0.28, 3.4, zc, g);
  for (const dz of [-w * 0.3, 0, w * 0.3]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.6, 16), darkM); e.rotation.z = Math.PI / 2; e.position.set(x0 - 4.6, -1.4, zc + dz); g.add(e); const f = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16), glow("#6fc8ff")); f.rotation.y = -Math.PI / 2; f.position.set(x0 - 5.42, -1.4, zc + dz); g.add(f); }
  // running lights along the deck edge
  for (const z of [z0 + 0.05, z1 - 0.05]) box(x1 - x0, 0.08, 0.08, glow(s.hull === "#7a3a3a" ? "#ff8a6a" : "#9fd8ff"), (x0 + x1) / 2, 0.02, z, g);
  // (owner, 2026-11-05) fire out of the engines while it docks and leaves; hover thrusters firing under the hull to keep
  // it floating
  g.userData.engines = [-w * 0.3, 0, w * 0.3].map((dz) => { const f = flame("blue", g, x0 - 5.42, -1.4, zc + dz); f.rotation.z = -Math.PI / 2; return f; });
  g.userData.hover = [];
  for (let k = 0; k < 4; k++) for (const z of [z0 + 1, z1 - 1]) { const x = x0 + (x1 - x0) * (k + 0.5) / 4; box(0.7, 0.3, 0.7, darkM, x, -2.85, z, g); g.userData.hover.push(flame("orange", g, x, -3, z)); }
  scene.add(g); return g;
}
// a flat collider over each slot of the docked freighter's deck, so an empty slot can be tapped too
const MAXSLOT = 128, slotCols = new THREE.InstancedMesh(new THREE.CylinderGeometry(HR, HR, 0.3, 6), new THREE.MeshBasicMaterial({ visible: false }), MAXSLOT), SLOTK = [];
slotCols.frustumCulled = false; scene.add(slotCols);
function syncShip() {
  const s = DOCK.ship;
  if (s !== shipOf) { if (shipObj) { scene.remove(shipObj); shipObj.traverse((o) => { if (o.geometry && o.geometry !== BOXG) o.geometry.dispose(); }); } shipObj = s ? buildShip(s) : null; shipOf = s; }
  let n = 0;
  if (s) {
    shipObj.position.x = s.off;
    const moving = s.state === "arrive" || s.state === "depart", eng = moving ? 4.5 + Math.min(3, Math.abs(s.off) / 20) : 0;
    for (const f of shipObj.userData.engines) burn(f, eng, 0.7);
    for (const f of shipObj.userData.hover) burn(f, 1.4, 0.32);
    const fl = new Map();
    s.bays.forEach((st, k) => { for (let i = st.length - 1; i >= 0; i--) if (st[i].wantedBy && G.flashing(st[i], k, st)) { fl.set(st[i], G.posRGB(st, st[i])); break; } });
    s.bays.forEach((st, k) => {
      if (!G.onDeck(s, k)) return; const p = G.slotPos(k);
      st.forEach((c, i) => putBox(c, p.x, i * PH + PH / 2, p.z, 0, { slot: k }, fl.get(c)));
      if (n < MAXSLOT) { dummy.position.set(p.x, 0.15, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); slotCols.setMatrixAt(n, dummy.matrix); SLOTK[n++] = k; }
    });
  }
  slotCols.count = n; slotCols.instanceMatrix.needsUpdate = true; slotCols.computeBoundingSphere();
}
function syncStorage() {
  const sel = G.selected, want = sel && sel.kind === "cust" ? sel.want : null;
  for (const v of SLOTS) {
    const st = v.stack, off = TILE3.has(v) ? TILE3.get(v).g.position.y : 0;
    st.forEach((q, i) => putBox(q, v.x, i * PH + PH / 2 + off, v.z, 0, { storage: v }, want === q ? G.posRGB(st, q) : null));
  }
}

// ---- ships: haulers (a flat cargo frame with a clamp under it), customer ships (their container's color) and export
// ships; each with engine glow and a box collider ----
const CRAFT = new Map(), PICKABLE = [];
const glassM = mat("#9ad0f0", { roughness: 0.1, metalness: 0.2 }), clampM = mat("#2a2e36");
const selRingG = ringG(2.1, 0.22);
function craftObj(t) {
  let o = CRAFT.get(t.id); if (o) return o;
  const g = new THREE.Group(), bodyM = mat("#e8b432", { roughness: 0.45, metalness: 0.4 }), big = t.kind !== "yard";
  // (owner, 2026-11-05) a flat cargo bed with the container riding on top where it can be seen, the cockpit ahead of
  // it, engines behind
  const L = big ? 4.6 : 4.0, W = big ? 2.6 : 2.4;
  box(L, 0.4, W, bodyM, 0, 0, 0, g);                                        // the bed
  box(0.75, 0.5, W * 0.7, bodyM, L / 2 - 0.4, 0.45, 0, g);                  // the cabin
  box(0.3, 0.32, W * 0.55, glassM, L / 2 - 0.12, 0.5, 0, g);                // its windows
  for (const dz of [-W / 2 + 0.08, W / 2 - 0.08]) box(2.2, 0.22, 0.12, clampM, -0.3, 0.3, dz, g);   // rails either side of the container
  for (const dz of [-W * 0.3, W * 0.3]) { box(0.5, 0.36, 0.5, darkM, -L / 2 - 0.15, 0, dz, g); const f = new THREE.Mesh(new THREE.CircleGeometry(0.17, 12), glow(t.kind === "yard" ? "#6fc8ff" : "#ffb86a")); f.rotation.y = -Math.PI / 2; f.position.set(-L / 2 - 0.41, 0, dz); g.add(f); }
  const sel = new THREE.Mesh(selRingG, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); sel.renderOrder = 2; scene.add(sel);
  const col = new THREE.Mesh(BOXG, COLM); col.scale.set(L + 0.6, 1.8, W + 0.4); col.position.y = 0.45; col.userData.truck = t; g.add(col); PICKABLE.push(col);
  scene.add(g); o = { g, bodyM, sel, col }; CRAFT.set(t.id, o); return o;
}
function syncCrafts() {
  const live = new Set();
  for (const t of G.trucks) {
    live.add(t.id); const o = craftObj(t);
    const ride = t.park && rising.has(t.park) ? riseOff(t.park) : 0;   // a new hauler rides up on its dock station
    o.g.position.set(t.x, t.y + ride, t.z); o.g.rotation.set(0, t.yaw, 0);
    o.bodyM.color.set(t.kind === "cust" ? (!t.want ? G.WAIT_CAB : COLORS[t.want.c].c) : t.kind === "exp" ? G.EXP_CAB : t.auto ? G.AUTO_CAB : G.MANUAL_CAB);
    const sel = t === G.selected, hov = G.hover && G.hover.truck === t, op = sel ? 0.55 + 0.25 * Math.sin(G.clock * 8) : hov ? 0.3 : 0;
    o.bodyM.emissive.set(sel ? 0x2a2a2a : 0x000000);
    o.sel.position.set(t.x, t.y - 0.3 + (t.park && rising.has(t.park) ? riseOff(t.park) : 0), t.z); o.sel.material.opacity = op; o.sel.visible = op > 0;
    if (t.load !== null) putBox(t.load, t.x, t.y - CARRY + ride, t.z, t.yaw, { truck: t });
  }
  for (const [id, o] of CRAFT) if (!live.has(id)) { scene.remove(o.g, o.sel); o.bodyM.dispose(); o.sel.material.dispose(); const i = PICKABLE.indexOf(o.col); if (i >= 0) PICKABLE.splice(i, 1); CRAFT.delete(id); }
}

// ---- cranes: where the spreader hangs (at the top, or down at what it's lifting or putting down) ----
function spreaderY(cr, top) {
  const h = 1 - (cr.hoist || 0), op = cr.ops[0]; if (!op || !(op.lift || op.lower)) return top;
  const s = op.lift || op.lower; let bot;
  if (s.stack) bot = (s.stack.length + (op.lift ? (op.done ? 1 : 0) : (op.done ? 0 : 1))) * PH;
  else bot = s.truck.y - CARRY + PH / 2;
  return bot + (top - bot) * h;
}
const yel = mat("#e8b432"), armM = mat("#d8552e"), armD = mat("#8a3a22"), ganM = mat("#3a6ab0"), ganG = mat("#4a7ac8");
// a loader arm: a tower on the spine, its boom out over the freighter and the front of its lines
const ARM_H = 7.4, ARM_TOP = ARM_H - 1.1;
function armObj(b) {
  const g = new THREE.Group();
  for (const dx of [-0.9, 0.9]) box(0.4, ARM_H + 0.6, 0.6, armD, dx, ARM_H / 2 - 0.2, 12.6, g);
  box(2.4, 0.6, 1.2, armM, 0, ARM_H + 0.1, 12.6, g);
  box(0.55, 0.55, 17.6 - 0.6, armM, 0, ARM_H + 0.45, 0.6 + (17.6 - 0.6) / 2, g);   // the boom
  box(1.2, 1.0, 1.4, mat("#4a4e56"), 0, ARM_H + 1.0, 13.8, g);
  const lamp = box(0.18, 0.18, 0.18, lampM("#ff4a3a"), 0, ARM_H + 0.8, 0.7, g);
  const trolley = box(0.9, 0.35, 0.9, darkM, 0, ARM_H + 0.05, 0, g);
  const cable = box(0.05, 1, 0.05, darkM, 0, 0, 0, g), spr = new THREE.Mesh(hexRingG(HR, 0.22), yel); g.add(spr);
  addDyn(g); const o = { g, trolley, cable, spr, lamp }; CRANES.set(b, o); return o;
}
function syncArms() {
  for (const b of BERTHS) {
    const o = CRANES.get(b); if (!o) continue;
    const cr = b.crane, y = spreaderY(cr, ARM_TOP);
    o.g.position.x = cr.x; o.g.position.y = riseOff(b); o.trolley.position.z = cr.z; o.spr.position.set(0, y + 0.02, cr.z);
    o.cable.position.set(0, (y + ARM_H) / 2, cr.z); o.cable.scale.y = Math.max(0.05, ARM_H - y);
    o.lamp.material.color.set(Math.sin(G.clock * 4 + b.id) > 0.2 ? 0xff4a3a : 0x5a2018);
    if (cr.hold) putBox(cr.hold, cr.x, y - PH / 2, cr.z, 0, {});
  }
}
// (owner, 2026-11-06) a crane: a turret on its unit with an upright arm, a shoulder and an elbow bending in the vertical
// plane (the turret turns to face the work), a wrist at the end and a hoist down to the gripper. Working, the wrist is
// held above where the rules put the gripper (the elbow up); with nothing to do it folds up small beside the turret.
const PA_SH = 1.3, PA_WY = 4.6, PA_L = 5.8, PA_TOP = 3.95, FOLD = [1.42, 1.42 - 2.92];
const paM = mat("#e8b432", { roughness: 0.45 }), paD = mat("#3a3f48");
function link(len, w, h, material, parent) { const m2 = new THREE.Mesh(BOXG, material); m2.scale.set(len, h, w); m2.position.x = len / 2; m2.castShadow = true; parent.add(m2); return m2; }
function platArmObj(a) {
  const pos = a.mount, L = PA_L;
  const g = new THREE.Group(); g.position.set(pos.x, 0, pos.z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.5, 20), paD); base.position.y = 0.25; base.castShadow = true; g.add(base);
  const turret = new THREE.Group(); g.add(turret);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, PA_SH, 16), paM); col.position.y = PA_SH / 2 + 0.3; col.castShadow = true; turret.add(col);
  const sh = new THREE.Group(); sh.position.y = PA_SH + 0.3; turret.add(sh);
  const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.0, 16), paD); joint.rotation.x = Math.PI / 2; sh.add(joint);
  link(L, 0.6, 0.65, paM, sh);
  const el = new THREE.Group(); el.position.x = L; sh.add(el);
  const ej = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 16), paD); ej.rotation.x = Math.PI / 2; el.add(ej);
  link(L, 0.48, 0.5, paM, el);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 12), paD); wrist.position.x = L; el.add(wrist);
  const cable = box(0.06, 1, 0.06, darkM, 0, 0, 0, scene), spr = new THREE.Mesh(hexRingG(HR, 0.22), yel); addDyn(spr); DYN.push(cable);
  const lamp = box(0.2, 0.2, 0.2, lampM("#ff4a3a"), 0, PA_SH + 0.95, 0, turret);
  addDyn(g); const o = { g, turret, sh, el, cable, spr, lamp, pos, yaw: 0, fold: 1 }; CRANES.set(a, o); return o;
}
let armT = performance.now();
function syncPlatArms() {
  const now = performance.now(), dt = clamp((now - armT) / 1000, 0, 0.1); armT = now;
  for (const a of G.CRANES) {
    const cr = a.cr, o = CRANES.get(a); if (!o) continue;
    const lift = TILE3.get(a).g.position.y, L = PA_L; o.g.position.y = lift;
    // folded up when idle, opened out while working
    const busy = cr.ops.length || cr.truck || cr.hold; o.fold = clamp(o.fold + (busy ? -3 : 1.6) * dt, 0, 1);
    const dx = cr.x - o.pos.x, dz = cr.z - o.pos.z, r = Math.max(0.6, hyp(dx, dz));
    if (busy && hyp(dx, dz) > 0.3) { let d = Math.atan2(-dz, dx) - o.yaw; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; o.yaw += d * Math.min(1, dt * 10); }
    // the wrist above the gripper: two links in the vertical plane, the elbow up
    const ty = PA_WY - PA_SH - 0.3, dd = clamp(hyp(r, ty), 0.5, 2 * L - 0.01);
    const a1 = Math.atan2(ty, r) + Math.acos(clamp(dd / (2 * L), -1, 1)), ex = Math.cos(a1) * L, ey = Math.sin(a1) * L, a2 = Math.atan2(ty - ey, r - ex);
    const f = o.fold * o.fold * (3 - 2 * o.fold), b1 = a1 + (FOLD[0] - a1) * f, b2 = a2 + (FOLD[1] - a2) * f;
    o.turret.rotation.y = o.yaw; o.sh.rotation.z = b1; o.el.rotation.z = b2 - b1;
    const wr = Math.cos(b1) * L + Math.cos(b2) * L, wy = PA_SH + 0.3 + Math.sin(b1) * L + Math.sin(b2) * L + lift - 0.3;
    const wx = o.pos.x + Math.cos(o.yaw) * wr, wz = o.pos.z - Math.sin(o.yaw) * wr;
    const y = Math.min(spreaderY(cr, PA_TOP) + lift, wy - 0.4);
    const sx = cr.x + (wx - cr.x) * f, sz = cr.z + (wz - cr.z) * f, sy = y + (wy - 0.4 - y) * f;
    o.spr.position.set(sx, sy + 0.02, sz);
    o.cable.position.set(sx, (sy + wy) / 2, sz); o.cable.scale.y = Math.max(0.05, wy - sy);
    o.lamp.material.color.set(cr.ops.length && Math.sin(G.clock * 6 + a.cid) > 0 ? 0xff4a3a : 0x5a2018);
    if (cr.hold) putBox(cr.hold, sx, sy - PH / 2, sz, 0, {});
  }
}

// ---- camera (owner): a perspective camera looking down at 45° to 90° (straight down), turned any way, zoomed. Smooth
// (owner, 2026-11-04): it eases toward where it's headed; a drag moves it with the finger, a flick glides on ----
const PITCH_MIN = Math.PI / 4, PITCH_MAX = Math.PI / 2;
const cam = { x: MIDX, z: MIDZ, yaw: 0, pitch: Math.PI / 3, vh: 60 };
const goal = { ...cam }, flick = { x: 0, z: 0 }, keyV = { x: 0, z: 0, yaw: 0, pitch: 0, zoom: 0 };
let zoomAt = null;
const syncGoal = () => Object.assign(goal, cam);
let VW = 1, VH = 1, DPR = 1;
const TANH = Math.tan(FOV * Math.PI / 360), camDist = () => cam.vh / (2 * TANH);
const VH_MIN = 6, VH_MAX = 140;
function applyCam() {
  cam.pitch = clamp(cam.pitch, PITCH_MIN, PITCH_MAX); cam.vh = clamp(cam.vh, VH_MIN, VH_MAX); cam.x = clamp(cam.x, X0, MW); cam.z = clamp(cam.z, -10, MH + 10);
  camera.aspect = VW / VH; camera.updateProjectionMatrix();
  const D = camDist(), cp = Math.cos(cam.pitch);
  camera.position.set(cam.x + Math.sin(cam.yaw) * cp * D, Math.sin(cam.pitch) * D, cam.z + Math.cos(cam.yaw) * cp * D);
  camera.rotation.set(-cam.pitch, cam.yaw, 0); camera.updateMatrixWorld();
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
function setRay(sx, sy) { ndc.set(sx / VW * 2 - 1, -(sy / VH) * 2 + 1); ray.setFromCamera(ndc, camera); }
function groundAt(sx, sy, y = 0) { setRay(sx, sy); PLANE.constant = -y; return ray.ray.intersectPlane(PLANE, hitP) ? { x: hitP.x, z: hitP.z } : { x: cam.x, z: cam.z }; }
// world to screen; null behind the camera. Shapes on the overlay are cut where they pass behind the camera.
const pv = new THREE.Vector3(), vv = new THREE.Vector3(), ZC = -1;
const view = (x, y, z) => vv.set(x, y, z).applyMatrix4(camera.matrixWorldInverse).clone();
const toScr = (v) => { pv.copy(v).applyMatrix4(camera.projectionMatrix); return [(pv.x + 1) / 2 * VW, (1 - pv.y) / 2 * VH]; };
function scr(x, y, z) { const v = view(x, y, z); return v.z > ZC ? null : toScr(v); }
function clipView(vs, closed) {
  const out = [], n = vs.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = vs[i], b = vs[(i + 1) % n], ain = a.z <= ZC, bin = b.z <= ZC;
    if (ain) out.push(a); if (ain !== bin) out.push(a.clone().lerp(b, (ZC - a.z) / (b.z - a.z)));
    if (!closed && i === n - 2 && bin) out.push(b);
  }
  return out;
}
const fwd = new THREE.Vector3();
function ppmAt(x, y, z) { camera.getWorldDirection(fwd); const d = (x - camera.position.x) * fwd.x + (y - camera.position.y) * fwd.y + (z - camera.position.z) * fwd.z; return VH / (2 * Math.max(0.5, d) * TANH); }
function anchor(before, sx, sy) { applyCam(); const after = groundAt(sx, sy); cam.x += before.x - after.x; cam.z += before.z - after.z; applyCam(); }

// ---- what's under the pointer (owner, 2026-11-04: 3D colliders): a badge of the selected ship's queue first; then the
// first collider the pointer's ray meets: a ship's (a box around it and what it carries), a container's own shape, a
// slot of the docked freighter, an arm's lines, a platform, a customer pad. A container hanging from a crane doesn't
// stop the ray. On a touch screen, with nothing right under the finger, rays a little around it are tried, nearest first.
let touchy = false, BADGES = [], GBTN = [], ABTN = [];
function castAt(sx, sy) {
  setRay(sx, sy);
  const hits = ray.intersectObjects(PICKABLE.concat(boxes, [slotCols], COLLIDERS), false);
  const docked = DOCK.ship && DOCK.ship.state === "docked";
  for (const h of hits) {
    const at = [h.point.x, h.point.y, h.point.z], u = h.object.userData;
    if (u.truck) { if (u.truck.exiting) continue; return { truck: u.truck, at }; }
    if (h.object === slotCols) { if (docked) return { slot: SLOTK[h.instanceId], at }; continue; }
    const bk = boxes.indexOf(h.object);
    if (bk >= 0) {
      const inf = INST[bk][h.instanceId]; if (!inf) continue;
      if (inf.truck) { if (inf.truck.exiting) continue; return { truck: inf.truck, at }; }
      if (inf.slot !== undefined) { if (docked) return { slot: inf.slot, at }; continue; }
      if (inf.storage) return { tile: inf.storage, at };
      continue;   // one hanging from a crane
    }
    if (u.station) return { station: u.station, at };
    if (u.lspot) return { lspot: u.lspot, at };
    if (u.berth) return { berth: u.berth, at }; if (u.tile) return { tile: u.tile, at }; if (u.stall) return { stall: u.stall, at };
  }
  return null;
}
const RING = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)]);
const inBtn = (b, sx, sy) => sx >= b.x0 && sx <= b.x1 && sy >= b.y0 && sy <= b.y1;
R3.pick = (sx, sy) => {
  if (G.ghost) for (const b of GBTN) if (inBtn(b, sx, sy)) return b.yes ? { ghostYes: true } : { ghostNo: true };
  if (G.picked && !G.ghost) for (const b of ABTN) if (inBtn(b, sx, sy)) return { act: b.act, at: b.at };
  if (G.selected) for (let k = BADGES.length - 1; k >= 0; k--) { const b = BADGES[k]; if (b.a && Math.abs(sx - b.x) <= b.r && Math.abs(sy - b.y) <= b.r) return { badge: b }; }
  const hit = castAt(sx, sy); if (hit || !touchy) return hit;
  for (const r of [10, 20]) for (const [cx, cy] of RING) { const h = castAt(sx + cx * r, sy + cy * r); if (h) return h; }
  return null;
};

// ---- input: one finger or the left mouse button pans; two fingers pinch to zoom, twist to turn and slide up or down
// together to tilt; the right (or middle) mouse button drags to turn and tilt; the wheel zooms. A tap selects and sends,
// a long press calls off a claimed container, a right click takes back the last queued trip. ----
const pts = new Map(); let gest = null;
const keys = {};
addEventListener("keydown", (e) => { keys[e.code] = true; });
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
ov.addEventListener("contextmenu", (e) => e.preventDefault());
function startOne(x, y, button, moved) { gest = { sx: x, sy: y, button, moved, g0: groundAt(x, y), yaw0: goal.yaw, pitch0: goal.pitch, lx: cam.x, lz: cam.z, lt: performance.now() }; }
function startTwo() {
  const [a, b] = [...pts.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  gest = { two: true, moved: true, d0: hyp(a.x - b.x, a.y - b.y) || 1, an0: Math.atan2(b.y - a.y, b.x - a.x), mx, my, a0: { ...a }, b0: { ...b }, vh0: cam.vh, yaw0: cam.yaw, pitch0: cam.pitch, g0: groundAt(mx, my), mode: null };
}
ov.addEventListener("pointerdown", (e) => {
  touchy = e.pointerType === "touch" || e.pointerType === "pen";
  try { ov.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  flick.x = flick.z = 0; zoomAt = null; goal.x = cam.x; goal.z = cam.z;   // a touch stops any glide
  if (pts.size === 2) { goal.vh = cam.vh; goal.yaw = cam.yaw; startTwo(); return; }
  if (pts.size > 2) return;
  startOne(e.clientX, e.clientY, e.button, false);
  // (owner, 2026-11-05) a blueprint is dragged by pressing on it (not on its ✓ or ✗)
  const gh = G.ghost;
  if (gh && e.button === 0 && !GBTN.some((b) => inBtn(b, e.clientX, e.clientY))) { const p = groundAt(e.clientX, e.clientY), r = G.ghostRect(gh); if (p.x >= r[0] - 1 && p.x <= r[1] + 1 && p.z >= r[2] - 1 && p.z <= r[3] + 1) gest.drag = { dx: gh.x - p.x, dz: gh.z - p.z }; }
  const g = gest; if (e.button === 0) setTimeout(() => { if (gest === g && !g.moved && pts.size === 1 && G.unclaimAt(g.sx, g.sy)) g.held = true; }, 450);
});
ov.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") { touchy = false; if (!gest || !gest.moved) G.hoverAt(e.clientX, e.clientY); else G.noHover(); } else G.noHover();
  if (!pts.has(e.pointerId) || !gest) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gest.two) {
    if (pts.size < 2) return; const [a, b] = [...pts.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = hyp(a.x - b.x, a.y - b.y) || 1;
    if (!gest.mode) {   // tilt when both fingers slide up or down together without spreading; otherwise pinch, twist and pan
      const ay = a.y - gest.a0.y, by = b.y - gest.b0.y, ax = a.x - gest.a0.x, bx = b.x - gest.b0.x;
      const twist = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - gest.an0), spread = Math.abs(d - gest.d0);
      if (spread < 24 && twist < 0.15 && (Math.hypot(ax, ay) < 8 || Math.hypot(bx, by) < 8)) return;
      gest.mode = ay * by > 0 && Math.abs(ay) > 1.5 * Math.abs(ax) && Math.abs(by) > 1.5 * Math.abs(bx) && spread < 24 && twist < 0.15 ? "tilt" : "pinch";
      gest.a0 = { ...a }; gest.b0 = { ...b }; gest.d0 = d; gest.an0 = Math.atan2(b.y - a.y, b.x - a.x); gest.mx = mx; gest.my = my; gest.g0 = groundAt(mx, my);
    }
    if (gest.mode === "tilt") { goal.pitch = gest.pitch0 + (my - gest.my) * 0.006; return; }
    cam.vh = gest.vh0 * gest.d0 / d; cam.yaw = gest.yaw0 + (Math.atan2(b.y - a.y, b.x - a.x) - gest.an0);
    anchor(gest.g0, mx, my); goal.vh = cam.vh; goal.yaw = cam.yaw; goal.x = cam.x; goal.z = cam.z; return;
  }
  const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy; if (!gest.moved && hyp(dx, dy) > (touchy ? 12 : 5)) gest.moved = true;
  if (!gest.moved) return;
  if (gest.drag) { if (!G.ghost) return; const p = groundAt(e.clientX, e.clientY); G.ghostMove(p.x + gest.drag.dx, p.z + gest.drag.dz); return; }
  if (gest.button === 2 || gest.button === 1) { goal.yaw = gest.yaw0 - dx * 0.008; goal.pitch = gest.pitch0 + dy * 0.006; return; }
  anchor(gest.g0, e.clientX, e.clientY); goal.x = cam.x; goal.z = cam.z;
  const now = performance.now(), ddt = (now - gest.lt) / 1000;
  if (ddt > 0.004) { const vx = (cam.x - gest.lx) / ddt, vz = (cam.z - gest.lz) / ddt, a = Math.min(1, ddt / 0.05); flick.x += (vx - flick.x) * a; flick.z += (vz - flick.z) * a; gest.lx = cam.x; gest.lz = cam.z; gest.lt = now; }
});
function up(e, cancel) {
  pts.delete(e.pointerId);
  if (gest && !gest.two && gest.moved && gest.button === 0 && performance.now() - gest.lt > 80) flick.x = flick.z = 0;   // it had stopped before letting go
  if (gest && (gest.two || !gest.moved || gest.button !== 0)) flick.x = flick.z = 0;
  if (gest && !gest.two && !gest.moved && !gest.held && !cancel) { if (gest.button === 0) G.click(e.clientX, e.clientY); else if (gest.button === 2 && !touchy) G.rightClick(); }
  if (pts.size === 1) { const [p] = [...pts.values()]; startOne(p.x, p.y, 0, true); }   // back to one finger: it pans on
  else if (!pts.size) gest = null;
}
ov.addEventListener("pointerup", (e) => up(e, false));
ov.addEventListener("pointercancel", (e) => up(e, true));
ov.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") G.noHover(); });
ov.addEventListener("wheel", (e) => { e.preventDefault(); flick.x = flick.z = 0; goal.vh *= Math.pow(1.0015, e.deltaY * (e.deltaMode === 1 ? 30 : 1)); zoomAt = { sx: e.clientX, sy: e.clientY, g: groundAt(e.clientX, e.clientY) }; }, { passive: false });
// keys speed the camera up and slow it down instead of starting and stopping dead
function keyCam(dt) {
  const k = (a, b) => (keys[a] || keys[b] ? 1 : 0), fwdIn = k("KeyW", "ArrowUp") - k("KeyS", "ArrowDown"), side = k("KeyD", "ArrowRight") - k("KeyA", "ArrowLeft");
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), sp = cam.vh * 0.9, e = 1 - Math.exp(-dt * 8);
  const tx = (fx * fwdIn - fz * side) * sp, tz = (fz * fwdIn + fx * side) * sp;
  keyV.x += (tx - keyV.x) * e; keyV.z += (tz - keyV.z) * e;
  keyV.yaw += ((k("KeyQ", "KeyQ") - k("KeyE", "KeyE")) * 1.6 - keyV.yaw) * e; keyV.pitch += ((k("KeyR", "KeyR") - k("KeyF", "KeyF")) * 0.9 - keyV.pitch) * e;
  keyV.zoom += ((k("Minus", "NumpadSubtract") - k("Equal", "NumpadAdd")) * 1.5 - keyV.zoom) * e;
  goal.x += keyV.x * dt; goal.z += keyV.z * dt; goal.yaw += keyV.yaw * dt; goal.pitch += keyV.pitch * dt; goal.vh *= Math.exp(keyV.zoom * dt);
}
function easeCam(dt) {
  if (!gest && (flick.x || flick.z)) { goal.x += flick.x * dt; goal.z += flick.z * dt; const f = Math.exp(-dt * 4); flick.x *= f; flick.z *= f; if (hyp(flick.x, flick.z) < 0.05) flick.x = flick.z = 0; }
  goal.pitch = clamp(goal.pitch, PITCH_MIN, PITCH_MAX); goal.vh = clamp(goal.vh, VH_MIN, VH_MAX); goal.x = clamp(goal.x, X0, MW); goal.z = clamp(goal.z, -10, MH + 10);
  const e = 1 - Math.exp(-dt * 14);
  cam.yaw += (goal.yaw - cam.yaw) * e; cam.pitch += (goal.pitch - cam.pitch) * e; cam.vh += (goal.vh - cam.vh) * e;
  if (zoomAt) { anchor(zoomAt.g, zoomAt.sx, zoomAt.sy); goal.x = cam.x; goal.z = cam.z; if (Math.abs(goal.vh - cam.vh) < goal.vh * 0.002) zoomAt = null; }
  else { cam.x += (goal.x - cam.x) * e; cam.z += (goal.z - cam.z) * e; }
  applyCam();
}

// ---- the overlay: labels, prices, the selected ship's queue, what a tap would do, drawn flat on the screen ----
const FONT = "'Big Shoulders Display', Impact, sans-serif";
function poly(world, stroke, width, fill, dash) { const pts2 = clipView(world.map((p) => view(...p)), true).map(toScr); if (pts2.length < 3) return; octx.beginPath(); pts2.forEach(([x, y], i) => (i ? octx.lineTo(x, y) : octx.moveTo(x, y))); octx.closePath(); if (fill) { octx.fillStyle = fill; octx.fill(); } if (stroke) { octx.setLineDash(dash || []); octx.strokeStyle = stroke; octx.lineWidth = width; octx.stroke(); octx.setLineDash([]); } }
const rect = (x0, x1, z0, z1, y = 0.05) => [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
const circle = (x, y, z, r, n = 28) => [...Array(n).keys()].map((i) => [x + r * Math.cos(i / n * TAU), y, z + r * Math.sin(i / n * TAU)]);
function seg(a, b, color, width, dash, cap) { const p = clipView([view(...a), view(...b)], false).map(toScr); if (p.length < 2) return; octx.setLineDash(dash || []); octx.lineCap = cap || "butt"; octx.strokeStyle = color; octx.lineWidth = width; octx.beginPath(); octx.moveTo(...p[0]); octx.lineTo(...p[1]); octx.stroke(); octx.setLineDash([]); octx.lineCap = "butt"; }
function tagBox(x, y, txt, edge, ink) { octx.font = `800 18px ${FONT}`; const w = octx.measureText(txt).width + 14, h = touchy ? 34 : 24; octx.fillStyle = "rgba(10,14,20,.88)"; octx.fillRect(x - w / 2, y - h / 2, w, h); octx.strokeStyle = edge; octx.lineWidth = 2; octx.strokeRect(x - w / 2, y - h / 2, w, h); octx.fillStyle = ink; octx.textAlign = "center"; octx.textBaseline = "middle"; octx.fillText(txt, x, y + 1); return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 }; }
function tag(x, y, txt, edge, ink) { octx.font = `800 18px ${FONT}`; const w = octx.measureText(txt).width + 14; octx.fillStyle = "rgba(10,14,20,.85)"; octx.fillRect(x - w / 2, y - 12, w, 24); octx.strokeStyle = edge; octx.lineWidth = 2; octx.strokeRect(x - w / 2, y - 12, w, 24); octx.fillStyle = ink; octx.textAlign = "center"; octx.textBaseline = "middle"; octx.fillText(txt, x, y + 1); }
const price = (at, p) => at && tag(at[0], at[1], "$" + p.toLocaleString(), G.money >= p ? "#7fd88a" : "#6a7080", G.money >= p ? "#ece7dc" : "#8b919b");
function face(x, y, happy) { octx.fillStyle = "#ffffff"; octx.fillRect(x, y, 18, 16); octx.fillRect(x + 4, y + 16, 4, 3); octx.fillStyle = happy ? "#2e9a4a" : "#c83a2e"; octx.fillRect(x + 4, y + 4, 3, 3); octx.fillRect(x + 11, y + 4, 3, 3); octx.fillRect(x + 4, y + 10, 10, 2); const yy = happy ? y + 9 : y + 11; octx.fillRect(x + 3, yy, 2, 2); octx.fillRect(x + 13, yy, 2, 2); }
const berthRect = (b) => rect(b.cx - 2.5, b.cx + 2.5, 12, LANE_Z + 2.4);
function markOf(g) {   // what a target looks like when it can't be used
  if (g.kind === "sts") { if (g.slot !== undefined) { const p = G.slotPos(g.slot), st = DOCK.ship.bays[g.slot]; return circle(p.x, st.length * PH + 0.05, p.z, HR); } return berthRect(g.berth); }
  if (g.kind === "rtg") return rect(g.spot.x - UNIT / 2, g.spot.x + UNIT / 2, g.spot.z - UNIT / 2, g.spot.z + UNIT / 2);
  return circle(g.stall.x, 0.05, g.stall.z, 1.5);
}
function overlay() {
  octx.setTransform(DPR, 0, 0, DPR, 0, 0); octx.clearRect(0, 0, VW, VH);
  const sel = G.selected;
  // a selected customer: a dotted line to its container; a selected auto hauler: its platform
  if (sel && sel.kind === "cust" && sel.load === null && sel.want) { const at = G.boxAt(sel.want); if (at) seg([sel.x, sel.y - CARRY, sel.z], at, "#ffffff", 3, [2, 7], "round"); }
  if (sel && sel.auto && sel.home) for (const h of G.homeSpots(sel)) poly(rect(h.x - UNIT / 2, h.x + UNIT / 2, h.z - UNIT / 2, h.z + UNIT / 2), "#5fd3d0", 3, null, [8, 6]);   // its platform's hauler spots
  // the selected ship's queue: numbered rings joined in order; the numbers can be tapped to take a trip back
  BADGES = [];
  if (sel) {
    let prev = [sel.x, sel.y - CARRY, sel.z], n = 0;
    for (const a of sel.cmd ? [sel.cmd, ...sel.queue] : sel.queue) {
      if (a.kind === "deliver") continue;
      const mk = G.spotMark(a, sel); if (!mk) continue; n++;
      const c = [mk.x, mk.y, mk.z]; seg(prev, c, "rgba(255,255,255,.6)", 2, [5, 5]); prev = c;
      poly(circle(mk.x, mk.y, mk.z, mk.r), "#ffffff", 2, null, [5, 5]);
      const z = touchy ? 26 : 18, bp = scr(mk.x - mk.r * 0.75, mk.y, mk.z - mk.r * 0.75); if (!bp) continue; const [bx, by] = bp;
      BADGES.push({ x: bx, y: by, r: z / 2 + 3, a: a === sel.cmd ? null : a });
      octx.fillStyle = "#1e2024"; octx.fillRect(bx - z / 2, by - z / 2, z, z); octx.strokeStyle = "#ece7dc"; octx.lineWidth = 1; octx.strokeRect(bx - z / 2 + 0.5, by - z / 2 + 0.5, z - 1, z - 1);
      octx.fillStyle = "#ece7dc"; octx.font = `800 ${Math.round(z * 0.7)}px 'JetBrains Mono', monospace`; octx.textAlign = "center"; octx.textBaseline = "middle"; octx.fillText(String(n), bx, by + 1);
    }
  }
  // what a tap would do with the selected ship, under the pointer
  const hv = G.hover;
  if (sel && hv && !hv.truck && !hv.badge) {
    const g = G.targetOf(hv), hb = g && G.homeFor(sel, g);
    if (hb) poly(rect(hb.x - UNIT / 2, hb.x + UNIT / 2, hb.z - UNIT / 2, hb.z + UNIT / 2), "#7fd88a", 3);
    else if (g) { const a = G.planFor(sel, g) || G.slotSwap(sel, g), mk = a && G.spotMark(a, sel); if (mk) poly(circle(mk.x, mk.y, mk.z, mk.r), "#7fd88a", 3); else poly(markOf(g), "#ff5a4a", 3); }
  }
  // hauler numbers, customers' faces, the money they pay
  octx.textAlign = "center"; octx.textBaseline = "middle";
  for (const t of G.trucks) {
    const np = scr(t.x, t.y + 0.9, t.z);
    if (t.num && np) { const [x, y] = np; if (x > -20 && y > -20 && x < VW + 20 && y < VH + 20) { const z = clamp(ppmAt(t.x, t.y, t.z) * 0.8, 12, 20); octx.fillStyle = "#1e2024"; octx.fillRect(x - z / 2, y - z / 2, z, z); octx.fillStyle = "#ece7dc"; octx.font = `800 ${Math.round(z * 0.75)}px 'JetBrains Mono', monospace`; octx.fillText(String(t.num), x, y + 0.5); } }
    if ((t.sad > 0 || t.happy > 0) && np) face(np[0] + 6, np[1] - 30, t.happy > 0);
  }
  for (const f of G.floats) { const fp = scr(f.x, f.y, f.z); if (!fp) continue; const [x, y] = fp; octx.globalAlpha = Math.min(1, f.t); octx.fillStyle = "#7fd88a"; octx.font = `800 18px ${FONT}`; octx.fillText(f.text, x, y - 20 - (1.6 - f.t) * 24); } octx.globalAlpha = 1;
  // the freighter's time left, off its bow
  const s = DOCK.ship;
  if (s && (s.state === "docked" || s.state === "closing")) {
    const sec = Math.max(0, Math.ceil(s.time)), txt = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"), low = sec <= 30;
    const tp = scr(DOCK.x0 + (s.cols - 0.5) * HW + HR + 6 + s.off, 0, DOCK.z0 + (DOCK.rows - s.rows / 2 - 0.5) * RZ);
    if (tp) tag(tp[0], tp[1], txt, low ? "#ff5a4a" : "#6a7080", low && Math.sin(G.clock * 8) > 0 ? "#ff5a4a" : "#ece7dc");
  }
  // (owner, 2026-11-06) something built that's picked: outlined, with its buttons below it (move it, move its whole
  // platform, remove it, turn its shape)
  ABTN = [];
  const gh = G.ghost, pkd = G.picked;
  if (pkd && !gh) {
    const at = G.pickedAt(pkd);
    if (pkd.what === "tile") { for (const t of G.platformOf(pkd.ref)) poly(rect(t.x - UNIT / 2, t.x + UNIT / 2, t.z - UNIT / 2, t.z + UNIT / 2), "rgba(255,255,255,.35)", 1, null, [3, 4]); if (pkd.ref.kind === "crane") poly(circle(at.x, 0.05, at.z, G.REACH, 64), "rgba(232,180,50,.6)", 1.5, null, [4, 6]); }
    poly(rect(at.x - at.r, at.x + at.r, at.z - at.r, at.z + at.r), "#ffffff", 2.5);
    const below = scr(at.x, 0, at.z + at.r), acts = G.acts(pkd);
    if (below) {
      const z = touchy ? 50 : 38, gap = 8, w = acts.length * z + (acts.length - 1) * gap, y = Math.min(VH - z / 2 - 8, below[1] + z / 2 + 10);
      acts.forEach((act, n) => {
        const x = below[0] - w / 2 + z / 2 + n * (z + gap), k = z * 0.24;
        octx.fillStyle = "rgba(10,14,20,.9)"; octx.fillRect(x - z / 2, y - z / 2, z, z); octx.strokeStyle = act === "remove" ? "#ff5a4a" : "#ece7dc"; octx.lineWidth = 2; octx.strokeRect(x - z / 2, y - z / 2, z, z);
        octx.lineWidth = 3; octx.lineCap = "round"; octx.strokeStyle = act === "remove" ? "#ff5a4a" : "#ece7dc"; octx.beginPath();
        const arrows = (r) => { for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { octx.moveTo(x, y); octx.lineTo(x + ax * r, y + ay * r); octx.moveTo(x + ax * r - ay * r * 0.35 - ax * r * 0.35, y + ay * r + ax * r * 0.35 - ay * r * 0.35); octx.lineTo(x + ax * r, y + ay * r); octx.lineTo(x + ax * r + ay * r * 0.35 - ax * r * 0.35, y + ay * r - ax * r * 0.35 - ay * r * 0.35); } };
        if (act === "move") arrows(k * 1.1);
        else if (act === "plat") { octx.rect(x - k * 1.3, y - k * 1.3, k * 2.6, k * 2.6); arrows(k * 0.8); }
        else if (act === "remove") { octx.rect(x - k * 0.8, y - k * 0.6, k * 1.6, k * 1.7); octx.moveTo(x - k * 1.15, y - k * 0.85); octx.lineTo(x + k * 1.15, y - k * 0.85); octx.moveTo(x - k * 0.35, y - k * 1.15); octx.lineTo(x + k * 0.35, y - k * 1.15); }
        else { octx.arc(x - k * 0.6, y, k * 0.55, 0, TAU); octx.moveTo(x + k * 0.1, y - k * 0.55); octx.rect(x + k * 0.1, y - k * 0.55, k * 1.1, k * 1.1); }
        octx.stroke(); octx.lineCap = "butt";
        ABTN.push({ act, at: [at.x, 0, at.z], x0: x - z / 2, x1: x + z / 2, y0: y - z / 2, y1: y + z / 2 });
      });
    }
  }
  // (owner, 2026-11-05) the blueprint: its outline, green where it can go and red where it can't, its price, ✓ and ✗
  GBTN = [];
  if (gh) {
    const r = G.ghostRect(gh), ok = G.ghostOk(gh), c = ok ? "127,216,138" : "255,90,74", p = G.ghostPrice(gh);
    poly(rect(r[0], r[1], r[2], r[3]), `rgb(${c})`, 3, `rgba(${c},.18)`, [8, 5]);
    if (gh.kind === "slot") { const k = gh.shape, rr = 1.0; poly(k === 0 ? circle(gh.x, 0.05, gh.z, rr) : k === 1 ? rect(gh.x - 0.9, gh.x + 0.9, gh.z - 0.9, gh.z + 0.9) : [...Array(6).keys()].map((n) => [gh.x + 1.15 * Math.sin(n * Math.PI / 3), 0.05, gh.z + 1.15 * Math.cos(n * Math.PI / 3)]), `rgba(${c},.95)`, 2.5); }
    else if (gh.kind === "crane") poly(circle(gh.x, 0.05, gh.z, G.REACH, 64), `rgba(${c},.75)`, 2, null, [4, 6]);
    else if (gh.kind === "hspot" || gh.kind === "tspot") poly(circle(gh.x, 0.05, gh.z, gh.kind === "tspot" ? 1.5 : 1.3), `rgba(${c},.8)`, 2);
    else if (gh.kind === "pads") { for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) poly(circle(gh.x + i * 1.9, 0.05, gh.z + j * 1.9, 1.4), `rgba(${c},.7)`, 1.5); }
    else if (gh.kind === "berth" || (gh.kind === "move" && gh.what === "berth")) poly(circle(gh.x, 0.05, LANE_Z, 1.35), `rgba(${c},.8)`, 2);
    else if (gh.kind === "move" && (gh.what === "tile" || gh.what === "plat")) {   // each unit where it would go
      const di = gh.i - gh.ref.i, dj = gh.j - gh.ref.j;
      for (const t of gh.what === "tile" ? [gh.ref] : gh.units) { const x = t.x + di * UNIT, z = t.z + dj * UNIT; poly(rect(x - UNIT / 2 + 0.1, x + UNIT / 2 - 0.1, z - UNIT / 2 + 0.1, z + UNIT / 2 - 0.1), `rgba(${c},.8)`, 1.5, `rgba(${c},.12)`); if (t.kind === "crane") poly(circle(x, 0.05, z, G.REACH, 64), `rgba(${c},.6)`, 1.5, null, [4, 6]); }
    }
    if (gh.kind === "crane" || gh.kind === "slot" || gh.kind === "hspot" || gh.kind === "tspot") for (const a of G.CRANES) poly(circle(a.mount.x, 0.05, a.mount.z, G.REACH, 64), "rgba(232,180,50,.35)", 1.2, null, [4, 6]);   // where the cranes reach
    const top = scr(gh.x, 0, r[2]), mid = scr(gh.x, 0, (r[2] + r[3]) / 2), bot = scr(gh.x, 0, r[3]);
    if (top && mid && bot) {
      const ty = Math.min(top[1], bot[1]), by = Math.max(top[1], bot[1]);
      if (gh.kind !== "move") tag(mid[0], ty - 22, "$" + p.toLocaleString(), ok && G.money >= p ? "#7fd88a" : "#6a7080", ok && G.money >= p ? "#ece7dc" : "#8b919b");
      const z = touchy ? 50 : 38, y = Math.min(VH - z / 2 - 8, by + z / 2 + 10);
      for (const yes of [true, false]) {
        const x = mid[0] + (yes ? 1 : -1) * (z / 2 + 8), live = !yes || (ok && G.money >= p);
        octx.fillStyle = "rgba(10,14,20,.9)"; octx.fillRect(x - z / 2, y - z / 2, z, z); octx.strokeStyle = yes ? (live ? "#7fd88a" : "#6a7080") : "#ff5a4a"; octx.lineWidth = 2; octx.strokeRect(x - z / 2, y - z / 2, z, z);
        octx.lineWidth = 4; octx.lineCap = "round"; octx.beginPath(); const k = z * 0.22;
        if (yes) { octx.moveTo(x - k, y); octx.lineTo(x - k * 0.25, y + k * 0.8); octx.lineTo(x + k, y - k * 0.8); } else { octx.moveTo(x - k, y - k); octx.lineTo(x + k, y + k); octx.moveTo(x + k, y - k); octx.lineTo(x - k, y + k); }
        octx.stroke(); octx.lineCap = "butt";
        GBTN.push({ yes, x0: x - z / 2, x1: x + z / 2, y0: y - z / 2, y1: y + z / 2 });
      }
    }
  }
  const bad = G.bad, bp = bad && bad.p && scr(...bad.p);
  if (bp) { const [x, y] = bp; octx.strokeStyle = `rgba(255,90,74,${bad.t * 2})`; octx.lineWidth = 3; octx.beginPath(); octx.moveTo(x - 9, y - 9); octx.lineTo(x + 9, y + 9); octx.moveTo(x + 9, y - 9); octx.lineTo(x - 9, y + 9); octx.stroke(); }
}

// ---- each frame ----
let sized = false, lastT = performance.now();
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight;
  renderer.setPixelRatio(DPR); renderer.setSize(VW, VH, false); ov.width = VW * DPR; ov.height = VH * DPR;
  if (!sized) {   // it starts over the whole station; on a touch screen close up over arm A and platform 1
    sized = true; cam.x = 12; cam.z = 32; cam.vh = clamp(Math.max(52, 70 * VH / VW), VH_MIN, VH_MAX);   // over the start: the loader arm, the platform, the pads
    if (matchMedia && matchMedia("(pointer: coarse)").matches) { touchy = true; cam.vh = 40; cam.x = 10; cam.z = 32; }
    syncGoal();
  }
  applyCam();
}
addEventListener("resize", resize); resize();
R3.draw = () => {
  const now = performance.now(), dt = clamp((now - lastT) / 1000, 0, 0.05); lastT = now;
  if (innerWidth !== VW || innerHeight !== VH) resize();
  keyCam(dt); easeCam(dt);
  nBox.fill(0); for (const l of INST) l.length = 0;
  syncBuilt(); syncShip(); syncStorage(); syncCrafts(); syncArms(); syncPlatArms();
  boxes.forEach((m, k) => { m.count = nBox[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); });
  renderer.render(scene, camera);
  overlay();
};
// for tests
R3.abtn = () => ABTN; R3.center = () => ({ x: cam.x, z: cam.z }); R3.focus = (x, z) => { flick.x = flick.z = 0; zoomAt = null; goal.x = x; goal.z = z; }; R3.ground = (sx, sy) => groundAt(sx, sy); R3.gbtn = () => GBTN;
R3.cam = cam; R3.goal = goal; R3.applyCam = () => { applyCam(); syncGoal(); }; R3.scr = scr; R3.badges = () => BADGES; R3.camera = camera;
R3.screenOfCraft = (t) => { const [x, y] = scr(t.x, t.y - 0.4, t.z) || [-1, -1]; return { x, y }; };
R3.screenOfSlot = (k) => { const p = G.slotPos(k), st = DOCK.ship.bays[k]; const [x, y] = scr(p.x, st.length ? st.length * PH - 0.15 : 0.25, p.z) || [-1, -1]; return { x, y }; };
R3.screenOf = (x, y, z) => { const [a, b] = scr(x, y, z) || [-1, -1]; return { x: a, y: b }; };
