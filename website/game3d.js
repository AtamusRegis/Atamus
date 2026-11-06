// Atamus 3D view (owner, 2026-11-03; space, 2026-11-05): the cargo station drawn in 3D with a perspective camera you tilt
// (45° to straight down), turn and zoom. 1 unit = 1 m. Basic shapes for now: the owner will make the models. game.js keeps
// every rule, click and queue; this file draws, moves the camera and says what's under the pointer (3D colliders).
import * as THREE from "./vendor/three.module.min.js";

const R3 = window.ATAMUS_3D, G = R3.game;
const { HR, HW, RZ, PH, CARRY, X0, MW, MH, LANE_Z, BAY_Z, COLORS, BLOCKS, BERTHS, DOCK, STALLS, PARK } = G;
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
const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
const BOXG = new THREE.BoxGeometry(1, 1, 1);
function box(w, h, d, material, x = 0, y = 0, z = 0, parent) { const b = new THREE.Mesh(BOXG, material); b.scale.set(w, h, d); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; (parent || scene).add(b); return b; }
const hexRingG = (r, w) => { const g = new THREE.RingGeometry(r - w, r, 6, 1); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 6); return g; };   // flat, pointy north–south like the containers
const ringG = (r, w) => { const g = new THREE.RingGeometry(r - w, r, 32, 1); g.rotateX(-Math.PI / 2); return g; };
const COLM = new THREE.MeshBasicMaterial({ visible: false });   // colliders are never drawn
const COLLIDERS = [];
function collider(w, h, d, x, y, z, data) { const c = new THREE.Mesh(BOXG, COLM); c.scale.set(w, h, d); c.position.set(x, y, z); Object.assign(c.userData, data); scene.add(c); COLLIDERS.push(c); return c; }

// ---- the station: the docking spine and loading deck, the storage platforms, the hangar, the customer pads, the trusses
// joining them; lights along their edges ----
const hullM = mat("#3a4250"), deckM = mat("#4a5260", { roughness: 0.8 }), darkM = mat("#1c2028"), trussM = mat("#59606c", { metalness: 0.6 });
const edgeM = glow("#5fd3ff"), warnM = glow("#f2a93b"), padM = glow("#7fd88a"), custPadM = glow("#c8d0dc"), slotLineM = new THREE.MeshBasicMaterial({ color: "#8fa8c8", transparent: true, opacity: 0.35 });
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
// the docking spine (the arms' rail) and the loading deck under the arms' lines
const SPX0 = DOCK.x0 - 3, SPX1 = DOCK.x0 + DOCK.cols * HW + 3;
box(SPX1 - SPX0, 0.8, 1.6, hullM, (SPX0 + SPX1) / 2, -0.3, 12.6); box(SPX1 - SPX0, 0.12, 0.2, warnM, (SPX0 + SPX1) / 2, 0.15, 11.85);
slab(SPX0, SPX1, 13.4, LANE_Z + 2 * 3.3 + 2.2);
for (const b of BERTHS) for (const l of b.lanes) for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(ringG(1.35, 0.08), l.kind === "auto" ? glow("#5fd3d0") : warnM); r.position.set(l.x, 0.02, LANE_Z + k * 3.3); scene.add(r); }
// storage platforms: a deck with the honeycomb marked on it, rails for the gantry, an apron with the 5 bays
// (owner, 2026-11-05) a platform not bought yet is empty space with an arrow pointing down at it; bought, it flies up
// into place from below on four thrusters
const PLAT = new Map(), ARROWG = new THREE.ConeGeometry(1.6, 3, 4); ARROWG.rotateX(Math.PI);
for (const b of BLOCKS) {
  const g = new THREE.Group(), x0 = b.x0 - HR - 0.4, x1 = b.x0 + 4.5 * HW + HR + 0.4, z0 = b.z0 - HR - 0.4, z1 = BAY_Z + 1.8;
  slab(x0, x1, z0, z1, b.exp ? mat("#3c4a5e", { roughness: 0.8 }) : deckM, 0.5, g);
  for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { const [x, z] = G.slotXY(b, c, r), h = new THREE.Mesh(hexRingG(HR * 0.98, 0.06), b.exp ? glow("#7fc8ff") : slotLineM); h.position.set(x, 0.015, z); g.add(h); }
  for (const bay of b.bays) { const r = new THREE.Mesh(ringG(1.25, 0.08), b.exp ? glow("#7fc8ff") : warnM); r.position.set(bay.x, 0.02, bay.z); g.add(r); }
  for (const x of [x0 + 0.2, x1 - 0.2]) box(0.25, 0.25, BAY_Z + 1.6 - (b.z0 - HR - 0.2), trussM, x, 0.12, (BAY_Z + 1.6 + b.z0 - HR - 0.2) / 2, g);
  const fires = [[x0 + 1.5, z0 + 1.5], [x1 - 1.5, z0 + 1.5], [x0 + 1.5, z1 - 1.5], [x1 - 1.5, z1 - 1.5]].map(([x, z]) => { box(1, 0.5, 1, darkM, x, -0.75, z, g); return flame("orange", g, x, -1, z); });
  const arrow = new THREE.Mesh(ARROWG, glow("#ff7a1a")); arrow.position.set(b.cx, 3, (z0 + z1) / 2); scene.add(arrow);
  g.visible = !!b.open; scene.add(g);
  PLAT.set(b, { g, fires, arrow, was: !!b.open });
  b.deck = [x0, x1, z0, z1];
}
function syncPlatforms() {
  for (const b of BLOCKS) {
    const o = PLAT.get(b);
    if (b.open && !o.was) rising.set(b, nowS()); o.was = !!b.open;
    o.g.visible = !!b.open; o.arrow.visible = !b.open;
    if (!b.open) { o.arrow.position.y = 4.5 + 0.5 * Math.sin(G.clock * 3 + b.id); o.arrow.material.color.set(G.money >= G.BLOCK_PRICE[b.id] ? "#ff7a1a" : "#5a6070"); continue; }
    const off = riseOff(b); o.g.position.y = off;
    for (const f of o.fires) burn(f, off < -0.05 ? 2.2 + Math.min(1, -off / 6) * 2.5 : 0, 0.42);
  }
}
// the hangar and the customer pads
// (owner, 2026-11-05) every hauler bought comes with its own dock station: a pad with a back wall and lights, flying up
// into place with the new hauler on it
const DOCKS = new Map(), redM = glow("#ff3a3a"), blueM = glow("#3a8aff");
function dockObj(p) {
  let o = DOCKS.get(p); if (o) return o;
  const g = new THREE.Group();
  box(3.2, 0.35, 3.2, deckM, 0, -0.18, 0, g); box(3.2, 0.06, 0.08, edgeM, 0, 0.01, 1.6, g); box(3.2, 0.06, 0.08, edgeM, 0, 0.01, -1.6, g);
  box(0.25, 1.5, 3.2, hullM, -1.6, 0.6, 0, g); box(3.2, 0.45, 0.22, hullM, 0, 0.2, -1.6, g);
  box(0.2, 0.2, 0.2, redM, -1.6, 1.4, -1.6, g); box(0.2, 0.2, 0.2, blueM, 1.6, 0.25, 1.6, g);
  const r = new THREE.Mesh(hexRingG(1.35, 0.1), padM); r.position.y = 0.02; g.add(r);
  box(0.5, 0.4, 0.5, darkM, -1, -0.5, 1, g); box(0.5, 0.4, 0.5, darkM, 1, -0.5, -1, g);
  const fires = [flame("orange", g, -1, -0.7, 1), flame("orange", g, 1, -0.7, -1)];
  g.position.set(p.x, 0, p.z); scene.add(g); o = { g, fires }; DOCKS.set(p, o); return o;
}
for (const p of PARK) if (p.built) dockObj(p);   // the ones there from the start don't fly in
function syncDocks() {
  for (const p of PARK) {
    if (!p.built) continue;
    if (!DOCKS.has(p)) { dockObj(p); rising.set(p, nowS()); }
    const o = DOCKS.get(p), off = riseOff(p); o.g.position.y = off;
    for (const f of o.fires) burn(f, off < -0.05 ? 1.6 + Math.min(1, -off / 6) * 1.8 : 0, 0.3);
  }
}
for (let g = 0; g < 12; g++) { const st = STALLS.filter((q) => q.group === g), xs = st.map((q) => q.x), zs = st.map((q) => q.z); slab(Math.min(...xs) - 1.8, Math.max(...xs) + 1.8, Math.min(...zs) - 1.8, Math.max(...zs) + 1.8); }
for (const s of STALLS) { const r = new THREE.Mesh(ringG(1.4, 0.08), custPadM); r.position.set(s.x, 0.02, s.z); scene.add(r); }
// trusses: the main one along the station from the hangar past the last platform, with arms up to the loading deck and
// down to the platforms and the pads
{
  const tz = 26.5; box(MW - X0 - 14, 0.6, 0.6, trussM, (X0 + 4 + MW - 6) / 2, -0.6, tz);
  for (const x of [SPX0 + 2, (SPX0 + SPX1) / 2, SPX1 - 2]) box(0.5, 0.5, tz - (LANE_Z + 8.8), trussM, x, -0.6, (tz + LANE_Z + 8.8) / 2);
  for (const b of BLOCKS) box(0.5, 0.5, b.deck[2] - tz, trussM, b.cx, -0.6, (tz + b.deck[2]) / 2);
  for (const b of BLOCKS) box(0.5, 0.5, 52.2 - b.deck[3], trussM, b.cx, -0.6, (b.deck[3] + 52.2) / 2);
  box(5, 0.5, 0.5, trussM, -6, -0.6, tz);
}
// colliders for what can be tapped: each arm (its lines and the stretch of spine), each platform, each customer pad
for (const b of BERTHS) collider(7.0, 2.4, LANE_Z + 9 - 12, b.cx, 0.8, (12 + LANE_Z + 9) / 2, { berth: b });
for (const b of BLOCKS) { const [x0, x1, z0, z1] = b.deck; collider(x1 - x0, 1, z1 - z0, (x0 + x1) / 2, -0.25, (z0 + z1) / 2, { block: b }); }
for (const s of STALLS) collider(3.4, 1.2, 3.4, s.x, 0.2, s.z, { stall: s });

// ---- containers: hexagonal pucks, one instance each ----
const MAXBOX = 3000;
const boxes = new THREE.InstancedMesh(new THREE.CylinderGeometry(HR * 0.97, HR * 0.97, PH * 0.94, 6), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.25 }), MAXBOX);
boxes.castShadow = boxes.receiveShadow = true; boxes.frustumCulled = false; scene.add(boxes);
const INST = [];   // per instance: { slot } on the freighter, { storage } on a platform, { truck } on a ship, {} on a crane
const dummy = new THREE.Object3D(), tmpC = new THREE.Color(), BASE = COLORS.map((c) => new THREE.Color(c.c)), EXPC = new THREE.Color("#0a1426");
let nBox = 0;
const rgbCol = (s) => { const [r, g, b] = s.split(",").map(Number); return new THREE.Color(r / 255, g / 255, b / 255); };
function putBox(c, x, y, z, yaw, info, flashRGB) {
  if (nBox >= MAXBOX) return;
  dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); boxes.setMatrixAt(nBox, dummy.matrix);
  tmpC.copy(BASE[c.c]); if (c.exp) tmpC.lerp(EXPC, 0.45);
  const fl = flashRGB || (G.flashing(c) ? "255,255,255" : null);
  if (fl) tmpC.lerp(rgbCol(fl), 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(G.clock * 10)));
  boxes.setColorAt(nBox, tmpC); INST[nBox] = info; nBox++;
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
  for (const b of BLOCKS) for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) {
    const st = b.slots[c][r], [x, z] = G.slotXY(b, c, r);
    st.forEach((q, i) => putBox(q, x, i * PH + PH / 2, z, 0, { storage: b }, want === q ? G.posRGB(st, q) : null));
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
  const L = big ? 3.6 : 2.8, W = big ? 2.2 : 1.9;
  box(L, 0.55, W, bodyM, 0, 0, 0, g);                       // the body
  box(L * 0.32, 0.4, W * 0.6, glassM, L * 0.3, 0.4, 0, g);  // the cockpit
  box(L * 0.5, 0.3, W * 1.25, bodyM, -L * 0.2, 0.05, 0, g); // the outriggers
  for (const dz of [-W * 0.35, W * 0.35]) { box(0.5, 0.36, 0.5, darkM, -L / 2 - 0.15, 0, dz, g); const f = new THREE.Mesh(new THREE.CircleGeometry(0.17, 12), glow(t.kind === "yard" ? "#6fc8ff" : "#ffb86a")); f.rotation.y = -Math.PI / 2; f.position.set(-L / 2 - 0.41, 0, dz); g.add(f); }
  for (const dz of [-0.95, 0.95]) box(1.7, 0.4, 0.14, clampM, 0, -0.42, dz * (W / 1.9), g);   // the clamp's jaws
  const sel = new THREE.Mesh(selRingG, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); sel.renderOrder = 2; scene.add(sel);
  const col = new THREE.Mesh(BOXG, COLM); col.scale.set(L + 0.6, 2.2, Math.max(W * 1.25, 2.6) + 0.3); col.position.y = -0.5; col.userData.truck = t; g.add(col); PICKABLE.push(col);
  scene.add(g); o = { g, bodyM, sel, col }; CRAFT.set(t.id, o); return o;
}
function syncCrafts() {
  const live = new Set();
  for (const t of G.trucks) {
    live.add(t.id); const o = craftObj(t);
    const ride = t.park && rising.has(t.park) ? riseOff(t.park) : 0;   // a new hauler rides up on its dock station
    o.g.position.set(t.x, t.y + ride, t.z); o.g.rotation.set(0, t.yaw, 0);
    o.bodyM.color.set(t.kind === "cust" ? (t.generic || !t.want ? G.WAIT_CAB : COLORS[t.want.c].c) : t.kind === "exp" ? G.EXP_CAB : t.auto ? G.AUTO_CAB : G.MANUAL_CAB);
    const sel = t === G.selected, hov = G.hover && G.hover.truck === t, op = sel ? 0.55 + 0.25 * Math.sin(G.clock * 8) : hov ? 0.3 : 0;
    o.bodyM.emissive.set(sel ? 0x2a2a2a : 0x000000);
    o.sel.position.set(t.x, t.y - CARRY - PH / 2 - 0.05, t.z); o.sel.material.opacity = op; o.sel.visible = op > 0;
    if (t.load !== null) putBox(t.load, t.x, t.y - CARRY, t.z, t.yaw, { truck: t });
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
const CRANES = new Map();
function armObj(b) {
  let o = CRANES.get(b); if (o) return o;
  const g = new THREE.Group();
  for (const dx of [-0.9, 0.9]) box(0.4, ARM_H + 0.6, 0.6, armD, dx, ARM_H / 2 - 0.2, 12.6, g);
  box(2.4, 0.6, 1.2, armM, 0, ARM_H + 0.1, 12.6, g);
  box(0.55, 0.55, 17.6 - 0.6, armM, 0, ARM_H + 0.45, 0.6 + (17.6 - 0.6) / 2, g);   // the boom
  box(1.2, 1.0, 1.4, mat("#4a4e56"), 0, ARM_H + 1.0, 13.8, g);
  const lamp = box(0.18, 0.18, 0.18, glow("#ff4a3a"), 0, ARM_H + 0.8, 0.7, g);
  const trolley = box(0.9, 0.35, 0.9, darkM, 0, ARM_H + 0.05, 0, g);
  const cable = box(0.05, 1, 0.05, darkM, 0, 0, 0, g), spr = new THREE.Mesh(hexRingG(HR, 0.22), yel); g.add(spr);
  scene.add(g); o = { g, trolley, cable, spr, lamp }; CRANES.set(b, o); return o;
}
function syncArms() {
  for (const b of BERTHS) {
    const o = b.open ? armObj(b) : CRANES.get(b); if (!o) continue; o.g.visible = !!b.open; if (!b.open) continue;
    const cr = b.crane, y = spreaderY(cr, ARM_TOP);
    o.g.position.x = cr.x; o.trolley.position.z = cr.z; o.spr.position.set(0, y + 0.02, cr.z);
    o.cable.position.set(0, (y + ARM_H) / 2, cr.z); o.cable.scale.y = Math.max(0.05, ARM_H - y);
    o.lamp.material.color.set(Math.sin(G.clock * 4 + b.id) > 0.2 ? 0xff4a3a : 0x5a2018);
    if (cr.hold) putBox(cr.hold, cr.x, y - PH / 2, cr.z, 0, {});
  }
}
// a platform's gantry: a bridge across the platform on its two rails, moving north–south; its trolley east–west
const GAN_H = 4.6, GAN_TOP = 3.95;
function ganObj(b) {
  let o = CRANES.get(b); if (o) return o;
  const g = new THREE.Group(), [x0, x1] = b.deck;
  for (const lx of [x0 + 0.2, x1 - 0.2]) { for (const lz of [-0.45, 0.45]) box(0.24, GAN_H, 0.24, ganM, lx, GAN_H / 2, lz, g); box(0.5, 0.3, 1.4, darkM, lx, 0.25, 0, g); }
  for (const lz of [-0.4, 0.4]) box(x1 - x0, 0.32, 0.2, ganG, (x0 + x1) / 2, GAN_H, lz, g);
  box(0.7, 0.5, 0.6, mat("#2a2c30"), x1 - 0.8, GAN_H - 0.5, 0.65, g);
  const trolley = box(0.9, 0.3, 1.1, darkM, 0, GAN_H + 0.12, 0, g);
  const cable = box(0.05, 1, 0.05, darkM, 0, 0, 0, g), spr = new THREE.Mesh(hexRingG(HR, 0.22), yel); g.add(spr);
  scene.add(g); o = { g, trolley, cable, spr }; CRANES.set(b, o); return o;
}
function syncGantries() {
  for (const b of BLOCKS) {
    const o = b.open ? ganObj(b) : CRANES.get(b); if (!o) continue; o.g.visible = !!b.open; if (!b.open) continue;
    const cr = b.rtg, y = spreaderY(cr, GAN_TOP);
    o.g.position.z = cr.z; o.g.position.y = PLAT.get(b).g.position.y; o.trolley.position.x = cr.x; o.spr.position.set(cr.x, y + 0.02, 0);
    o.cable.position.set(cr.x, (y + GAN_H) / 2, 0); o.cable.scale.y = Math.max(0.05, GAN_H - y);
    if (cr.hold) putBox(cr.hold, cr.x, y - PH / 2, cr.z, 0, {});
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
let touchy = false, BADGES = [];
function castAt(sx, sy) {
  setRay(sx, sy);
  const hits = ray.intersectObjects(PICKABLE.concat([boxes, slotCols], COLLIDERS), false);
  const docked = DOCK.ship && DOCK.ship.state === "docked";
  for (const h of hits) {
    const at = [h.point.x, h.point.y, h.point.z], u = h.object.userData;
    if (u.truck) { if (u.truck.exiting) continue; return { truck: u.truck, at }; }
    if (h.object === slotCols) { if (docked) return { slot: SLOTK[h.instanceId], at }; continue; }
    if (h.object === boxes) {
      const inf = INST[h.instanceId]; if (!inf) continue;
      if (inf.truck) { if (inf.truck.exiting) continue; return { truck: inf.truck, at }; }
      if (inf.slot !== undefined) { if (docked) return { slot: inf.slot, at }; continue; }
      if (inf.storage) return { block: inf.storage, at };
      continue;   // one hanging from a crane
    }
    if (u.berth) return { berth: u.berth, at }; if (u.block) return { block: u.block, at }; if (u.stall) return { stall: u.stall, at };
  }
  return null;
}
const RING = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)]);
R3.pick = (sx, sy) => {
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
function tag(x, y, txt, edge, ink) { octx.font = `800 18px ${FONT}`; const w = octx.measureText(txt).width + 14; octx.fillStyle = "rgba(10,14,20,.85)"; octx.fillRect(x - w / 2, y - 12, w, 24); octx.strokeStyle = edge; octx.lineWidth = 2; octx.strokeRect(x - w / 2, y - 12, w, 24); octx.fillStyle = ink; octx.textAlign = "center"; octx.textBaseline = "middle"; octx.fillText(txt, x, y + 1); }
const price = (at, p) => at && tag(at[0], at[1], "$" + p.toLocaleString(), G.money >= p ? "#7fd88a" : "#6a7080", G.money >= p ? "#ece7dc" : "#8b919b");
function face(x, y, happy) { octx.fillStyle = "#ffffff"; octx.fillRect(x, y, 18, 16); octx.fillRect(x + 4, y + 16, 4, 3); octx.fillStyle = happy ? "#2e9a4a" : "#c83a2e"; octx.fillRect(x + 4, y + 4, 3, 3); octx.fillRect(x + 11, y + 4, 3, 3); octx.fillRect(x + 4, y + 10, 10, 2); const yy = happy ? y + 9 : y + 11; octx.fillRect(x + 3, yy, 2, 2); octx.fillRect(x + 13, yy, 2, 2); }
const DIM = "rgba(4,6,12,.62)";
const berthRect = (b) => rect(b.cx - 3.5, b.cx + 3.5, 12, LANE_Z + 8.8);
function markOf(g) {   // what a target looks like when it can't be used
  if (g.kind === "sts") { if (g.slot !== undefined) { const p = G.slotPos(g.slot), st = DOCK.ship.bays[g.slot]; return circle(p.x, st.length * PH + 0.05, p.z, HR); } return berthRect(g.berth); }
  if (g.kind === "rtg") { const [x0, x1, z0, z1] = g.block.deck; return rect(x0, x1, z0, z1); }
  return circle(g.stall.x, 0.05, g.stall.z, 1.5);
}
function overlay() {
  octx.setTransform(DPR, 0, 0, DPR, 0, 0); octx.clearRect(0, 0, VW, VH);
  const sel = G.selected;
  // locked things, dimmed with their price
  for (const b of BERTHS) if (!b.open) poly(berthRect(b), null, 0, DIM);
  const groups = []; for (const s of STALLS) if (!s.open && !groups[s.group]) groups[s.group] = STALLS.filter((q) => q.group === s.group);
  for (const g of groups) if (g) { const xs = g.map((q) => q.x), zs = g.map((q) => q.z); poly(rect(Math.min(...xs) - 1.8, Math.max(...xs) + 1.8, Math.min(...zs) - 1.8, Math.max(...zs) + 1.8), null, 0, DIM); }
  for (const b of BERTHS) if (!b.open) price(scr(b.cx, 0, LANE_Z + 3), G.CRANE_PRICE[b.id]);
  groups.forEach((g, k) => { if (g) price(scr((g[0].x + g[3].x) / 2, 0, (g[0].z + g[3].z) / 2), G.STALL_PRICE[k]); });
  // a selected customer: a dotted line to its container; a selected auto hauler: its platform
  if (sel && sel.kind === "cust" && sel.load === null && sel.want) { const at = G.boxAt(sel.want); if (at) seg([sel.x, sel.y - CARRY, sel.z], at, "#ffffff", 3, [2, 7], "round"); }
  if (sel && sel.auto && sel.home) { const [x0, x1, z0, z1] = sel.home.deck; poly(rect(x0, x1, z0, z1), "#5fd3d0", 3, null, [8, 6]); }
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
    if (hb) { const [x0, x1, z0, z1] = hb.deck; poly(rect(x0, x1, z0, z1), "#7fd88a", 3); }
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
  const bad = G.bad, bp = bad && bad.p && scr(...bad.p);
  if (bp) { const [x, y] = bp; octx.strokeStyle = `rgba(255,90,74,${bad.t * 2})`; octx.lineWidth = 3; octx.beginPath(); octx.moveTo(x - 9, y - 9); octx.lineTo(x + 9, y + 9); octx.moveTo(x + 9, y - 9); octx.lineTo(x - 9, y + 9); octx.stroke(); }
}

// ---- each frame ----
let sized = false, lastT = performance.now();
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight;
  renderer.setPixelRatio(DPR); renderer.setSize(VW, VH, false); ov.width = VW * DPR; ov.height = VH * DPR;
  if (!sized) {   // it starts over the whole station; on a touch screen close up over arm A and platform 1
    sized = true; cam.x = (X0 + MW) / 2; cam.z = MH / 2 - 2; cam.vh = clamp(Math.max(MH * Math.sin(cam.pitch) + 6, (MW - X0) * VH / VW), VH_MIN, VH_MAX);
    if (matchMedia && matchMedia("(pointer: coarse)").matches) { touchy = true; cam.vh = 34; cam.x = 12; cam.z = 26; }
    syncGoal();
  }
  applyCam();
}
addEventListener("resize", resize); resize();
R3.draw = () => {
  const now = performance.now(), dt = clamp((now - lastT) / 1000, 0, 0.05); lastT = now;
  if (innerWidth !== VW || innerHeight !== VH) resize();
  keyCam(dt); easeCam(dt);
  nBox = 0; INST.length = 0;
  syncPlatforms(); syncDocks(); syncShip(); syncStorage(); syncCrafts(); syncArms(); syncGantries();
  boxes.count = nBox; boxes.instanceMatrix.needsUpdate = true; if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true; boxes.computeBoundingSphere();
  renderer.render(scene, camera);
  overlay();
};
// for tests
R3.cam = cam; R3.goal = goal; R3.applyCam = () => { applyCam(); syncGoal(); }; R3.scr = scr; R3.badges = () => BADGES; R3.camera = camera;
R3.screenOfCraft = (t) => { const [x, y] = scr(t.x, t.y - 0.4, t.z) || [-1, -1]; return { x, y }; };
R3.screenOfSlot = (k) => { const p = G.slotPos(k), st = DOCK.ship.bays[k]; const [x, y] = scr(p.x, st.length ? st.length * PH - 0.15 : 0.25, p.z) || [-1, -1]; return { x, y }; };
R3.screenOf = (x, y, z) => { const [a, b] = scr(x, y, z) || [-1, -1]; return { x: a, y: b }; };
