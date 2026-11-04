// Atamus 3D view (owner, 2026-11-03): the same game as game.js, drawn in 3D with a perspective camera you tilt (45° to
// straight down), turn and zoom. One map tile is 1 m (1 unit), so a container is 3 x 1 x 1. Basic shapes for now: the owner will
// make the models. game.js keeps every rule, click and queue; this file draws, moves the camera and says what's under
// the pointer (the nearest truck or ship container wins, measured on the screen).
import * as THREE from "./vendor/three.module.min.js";

const R3 = window.ATAMUS_3D, G = R3.game;
const { T, MW, MH, QUAY, YROAD, LOT0, CL, TL, COLORS, BLOCKS, BERTHS, DOCK, STALLS } = G;
const TAU = Math.PI * 2, clamp = (v, a, b) => (v < a ? a : v > b ? b : v), hyp = Math.hypot;
const m = (px) => px / T;   // game pixels to meters

// ---- renderer, scene, light ----
const glc = document.getElementById("gl"), ov = document.getElementById("view"), octx = ov.getContext("2d");
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color("#0b1218");
const FOV = 40, camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 600); camera.rotation.order = "YXZ";
scene.add(new THREE.HemisphereLight(0xdde6f0, 0x40382c, 1.4));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.position.set(MW / 2 - 30, 70, MH / 2 + 35); sun.target.position.set(MW / 2, 0, MH / 2); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 45, bottom: -45, near: 1, far: 220 }); sun.shadow.camera.updateProjectionMatrix();

const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8, metalness: 0.05 }, o));
const BOXG = new THREE.BoxGeometry(1, 1, 1);
function box(w, h, d, material, x = 0, y = 0, z = 0, parent) { const b = new THREE.Mesh(BOXG, material); b.scale.set(w, h, d); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; if (parent) parent.add(b); return b; }

// ---- the ground: the 2D game's painted ground (roads, markings, pads, bays, stalls) on top of the land; the sea ----
const LAND_H = 0.6, DECK = 0.4;
const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat("#1a4a6a", { roughness: 0.35, metalness: 0.1 }));
water.rotation.x = -Math.PI / 2; water.position.set(MW / 2, -LAND_H, MH / 2); water.receiveShadow = true; scene.add(water);
box(MW, LAND_H, MH - QUAY, mat("#6c6e72"), MW / 2, -LAND_H / 2 - 0.005, (QUAY + MH) / 2, scene);
const groundCv = document.createElement("canvas"); groundCv.width = MW * T; groundCv.height = (MH - QUAY) * T;
const groundTex = new THREE.CanvasTexture(groundCv); groundTex.colorSpace = THREE.SRGBColorSpace; groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH - QUAY), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }));
groundMesh.rotation.x = -Math.PI / 2; groundMesh.position.set(MW / 2, 0, (QUAY + MH) / 2); groundMesh.receiveShadow = true; scene.add(groundMesh);
let groundVer = -1;
function syncGround() { if (G.groundVer === groundVer) return; groundVer = G.groundVer; const g = groundCv.getContext("2d"); g.clearRect(0, 0, groundCv.width, groundCv.height); g.drawImage(G.GROUND, 0, QUAY * T, MW * T, (MH - QUAY) * T, 0, 0, MW * T, (MH - QUAY) * T); groundTex.needsUpdate = true; }
// rubber fenders along the quay face
{ const fm = mat("#141518"); for (let i = 0; i < MW; i += 2) box(0.4, 0.45, 0.12, fm, i + 0.5, -0.3, QUAY - 0.06, scene); }

// ---- containers: one instanced box each, 3 x 1 x 1 (a hair smaller so stacks show their seams) ----
const MAXBOX = 4000;
const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(CL - 0.08, 0.94, 0.92), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 }), MAXBOX);
boxes.castShadow = boxes.receiveShadow = true; boxes.frustumCulled = false; scene.add(boxes);
const INST = [];   // per instance: { slot } on the ship, { storage } in a storage area, { truck } on a truck
const dummy = new THREE.Object3D(), tmpC = new THREE.Color(), BASE = COLORS.map((c) => new THREE.Color(c.c)), EXPC = new THREE.Color("#0a1426");
let nBox = 0;
const rgbCol = (s) => { const [r, g, b] = s.split(",").map(Number); return new THREE.Color(r / 255, g / 255, b / 255); };
function putBox(c, x, y, z, along, info, flashRGB) {
  if (nBox >= MAXBOX) return;
  dummy.position.set(x, y, z); dummy.rotation.set(0, along, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); boxes.setMatrixAt(nBox, dummy.matrix);
  tmpC.copy(BASE[c.c]); if (c.exp) tmpC.lerp(EXPC, 0.45);
  const fl = flashRGB || (G.flashing(c) ? "255,255,255" : null);
  if (fl) tmpC.lerp(rgbCol(fl), 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(G.clock * 10)));
  boxes.setColorAt(nBox, tmpC); INST[nBox] = info; nBox++;
}

// ---- the ship: a hull, its deck and hatch covers, the accommodation block at the stern, the funnel ----
let shipObj = null, shipOf = null;
function buildShip(s) {
  const g = new THREE.Group(), x = DOCK.x * T, y = (DOCK.top + DOCK.rows - s.rows - 1) * T + 14, w = s.cols * CL * T, h = (s.rows + 1) * T + 2;
  const sx0 = m(x) - 2.6, x1 = m(x + w), bow = 2, z0 = m(y), z1 = m(y + h), HB = -2;
  const hullM = mat(s.hull, { roughness: 0.6 });
  box(x1 - sx0, DECK - HB, z1 - z0, hullM, (sx0 + x1) / 2, (DECK + HB) / 2, (z0 + z1) / 2, g);
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(bow * 0.45, 0); sh.quadraticCurveTo(bow, 0, bow, (z1 - z0) / 2); sh.quadraticCurveTo(bow, z1 - z0, bow * 0.45, z1 - z0); sh.lineTo(0, z1 - z0); sh.closePath();
  const bg = new THREE.ExtrudeGeometry(sh, { depth: DECK - HB, bevelEnabled: false }); bg.rotateX(Math.PI / 2);
  const bm = new THREE.Mesh(bg, hullM); bm.position.set(x1, DECK, z0); bm.castShadow = bm.receiveShadow = true; g.add(bm);
  box(x1 - sx0 + 0.2, 0.25, z1 - z0 + 0.05, mat("#6e2620"), (sx0 + x1) / 2, -LAND_H + 0.05, (z0 + z1) / 2, g);   // antifouling at the waterline
  box(x1 - sx0 - 0.3, 0.06, z1 - z0 - 0.3, mat("#3a3f46"), (sx0 + x1) / 2 + 0.1, DECK + 0.02, (z0 + z1) / 2, g);
  const r0 = DOCK.rows - s.rows, hm = mat("#4b525b");
  for (let c = 0; c < s.cols; c++) box(CL - 0.1, 0.06, s.rows - 0.1, hm, m(x) + c * CL + CL / 2, DECK + 0.06, DOCK.top + r0 + s.rows / 2, g);
  const ax = sx0 + 0.45, aw = m(x) - 0.25 - ax, wm = mat("#e6e2d8");
  box(aw, 4.2, z1 - z0 - 0.4, wm, ax + aw / 2, DECK + 2.1, (z0 + z1) / 2, g);
  box(0.32, 0.7, z1 - z0 + 0.2, mat("#d8d4ca"), m(x) - 0.4, DECK + 3.9, (z0 + z1) / 2, g);   // bridge wings
  box(0.06, 0.35, z1 - z0 - 0.5, mat("#29506e"), ax + aw + 0.01, DECK + 3.7, (z0 + z1) / 2, g);   // bridge windows
  const fx = ax + 0.45, fz = (z0 + z1) / 2;
  box(0.55, 2, 0.65, mat("#33363c"), fx, DECK + 5.2, fz, g); box(0.57, 0.3, 0.67, mat("#c83a2e"), fx, DECK + 5.4, fz, g);
  for (const bz of [z0 + 0.15, z1 - 0.15]) box(0.55, 0.3, 0.25, mat("#e8822a"), ax + 0.5, DECK + 2.6, bz, g);   // lifeboats
  scene.add(g); return g;
}
function syncShip() {
  const s = DOCK.ship;
  if (s !== shipOf) { if (shipObj) { scene.remove(shipObj); shipObj.traverse((o) => { if (o.geometry && o.geometry !== BOXG) o.geometry.dispose(); }); } shipObj = s ? buildShip(s) : null; shipOf = s; }
  if (!s) return;
  shipObj.position.x = m(Math.round(s.off));
  const fl = new Map();
  s.bays.forEach((st, k) => { for (let n = st.length - 1; n >= 0; n--) if (st[n].wantedBy && G.flashing(st[n], k, st)) { fl.set(st[n], G.posRGB(st, st[n])); break; } });
  s.bays.forEach((st, k) => {
    if (!G.onDeck(s, k)) return; const [rx, ry] = G.slotRect(k);
    st.forEach((c, n) => putBox(c, m(rx) + CL / 2, DECK + 0.08 + n + 0.47, m(ry) + 0.5, 0, { slot: k }, fl.get(c)));
  });
}

// (owner, 2026-11-04) a flat collider over each slot of the docked ship's deck, so an empty slot can be tapped too
const MAXSLOT = 128, slotCols = new THREE.InstancedMesh(new THREE.BoxGeometry(CL - 0.05, 0.3, 0.98), COLM_SLOT(), MAXSLOT), SLOTK = [];
function COLM_SLOT() { return new THREE.MeshBasicMaterial({ visible: false }); }
slotCols.frustumCulled = false; scene.add(slotCols);
function syncSlotCols() {
  const s = DOCK.ship; let n = 0;
  if (s) s.bays.forEach((st, k) => { if (!G.onDeck(s, k) || n >= MAXSLOT) return; const [rx, ry] = G.slotRect(k); dummy.position.set(m(rx) + CL / 2, DECK + 0.15, m(ry) + 0.5); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); slotCols.setMatrixAt(n, dummy.matrix); SLOTK[n++] = k; });
  slotCols.count = n; slotCols.instanceMatrix.needsUpdate = true; slotCols.computeBoundingSphere();
}

// ---- storage: every container in its stack (rows of 3 tiles running north-south) ----
function syncStorage() {
  const sel = G.selected, want = sel && sel.kind === "cust" ? sel.want : null;
  for (const b of BLOCKS) for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) {
    const st = b.slots[c][r];
    st.forEach((x, n) => putBox(x, b.x + c + 0.5, 0.47 + n, b.y + r * CL + CL / 2, Math.PI / 2, { storage: b }, want === x ? G.posRGB(st, x) : null));
  }
}

// ---- trucks: a cab and a trailer, each turned along its own part of the truck ----
const TRUCKS = new Map(), PICKABLE = [];
const darkM = mat("#1e2024"), chassisM = mat("#4a4e56"), glassM = mat("#9ad0f0", { roughness: 0.2 }), tyreM = mat("#141518");
const padG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const COLM = new THREE.MeshBasicMaterial({ visible: false });   // colliders are never drawn
function truckObj(t) {
  let o = TRUCKS.get(t.id); if (o) return o;
  const cabM = mat("#e8b432"), cab = new THREE.Group(), trl = new THREE.Group();
  const body = box(1, 0.95, 0.74, cabM, 0, 0.68, 0, cab); box(1, 0.3, 0.7, darkM, 0, 0.2, 0, cab); const glass = box(0.06, 0.32, 0.6, glassM, 0.5, 0.95, 0, cab);
  const bed = box(1, 0.12, 0.56, chassisM, 0, 0.5, 0, trl); const axle = box(0.95, 0.42, 0.72, tyreM, -0.3, 0.21, 0, trl); axle.userData.rel = true;
  const pads = [0, 1].map(() => { const p = new THREE.Mesh(padG, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); p.position.y = 0.03; p.renderOrder = 1; scene.add(p); return p; });
  // (owner, 2026-11-04) 3D box colliders, a little bigger than what they cover: one around the cab, one around the
  // trailer (up to the top of a container on it); taps and the pointer hit these
  const cabCol = new THREE.Mesh(BOXG, COLM), trlCol = new THREE.Mesh(BOXG, COLM);
  cabCol.position.y = 0.7; trlCol.position.y = 0.8; cab.add(cabCol); trl.add(trlCol);
  for (const q of [cabCol, trlCol]) { q.userData.truck = t; PICKABLE.push(q); }
  scene.add(cab, trl); o = { cab, trl, cabM, body, glass, bed, axle, pads, cabCol, trlCol, parts: [cabCol, trlCol] }; TRUCKS.set(t.id, o); return o;
}
// lay a part between two points (game pixels): mid-point, heading and length
function lay(obj, a, b) { const ax = m(a[0]), az = m(a[1]), bx = m(b[0]), bz = m(b[1]), L = hyp(bx - ax, bz - az) || 0.01; obj.position.set((ax + bx) / 2, 0, (az + bz) / 2); obj.rotation.set(0, Math.atan2(-(az - bz), ax - bx), 0); return L; }
function syncTrucks() {
  const live = new Set();
  for (const t of G.trucks) {
    live.add(t.id); const o = truckObj(t), s = G.shapeOf(t);
    const cl = lay(o.cab, s.front, s.cabBack); o.body.scale.x = cl; o.cab.children[1].scale.x = cl; o.glass.position.x = cl / 2 - 0.02;
    const tl = lay(o.trl, s.trFront, s.trBack); o.bed.scale.x = tl; o.axle.position.x = -tl / 2 + 0.55;
    o.cabCol.scale.set(cl + 0.2, 1.4, 1.0); o.trlCol.scale.set(tl + 0.15, 1.6, 1.0);
    o.cabM.color.set(t.kind === "cust" ? (t.generic || !t.want ? G.WAIT_CAB : COLORS[t.want.c].c) : t.kind === "exp" ? G.EXP_CAB : t.auto ? G.AUTO_CAB : "#e8b432");
    const sel = t === G.selected, hov = G.hover && G.hover.truck === t, op = sel ? 0.42 + 0.12 * Math.sin(G.clock * 8) : hov ? 0.22 : 0;
    o.cabM.emissive.set(sel ? 0x333333 : 0x000000);
    [[s.front, s.cabBack, o.pads[0]], [s.trFront, s.trBack, o.pads[1]]].forEach(([a, b, p]) => { const L = lay(p, a, b); p.position.y = 0.03; p.scale.set(L + 0.7, 1, 1.25); p.material.opacity = op; p.visible = op > 0; });
    if (t.load !== null) { const tr = G.trailerOf(t); putBox(t.load, m(tr.x), 0.56 + 0.47, m(tr.y), -tr.a, { truck: t }); }
  }
  for (const [id, o] of TRUCKS) if (!live.has(id)) {
    scene.remove(o.cab, o.trl, ...o.pads); o.cabM.dispose(); o.pads.forEach((p) => p.material.dispose());
    for (const q of o.parts) { const i = PICKABLE.indexOf(q); if (i >= 0) PICKABLE.splice(i, 1); }
    TRUCKS.delete(id);
  }
}

// ---- cranes: where the spreader hangs (at the top, or down at what it's lifting or putting down) ----
const isShipStack = (st) => !!DOCK.ship && DOCK.ship.bays.includes(st);
function spreaderY(cr, top) {
  const h = 1 - (cr.hoist || 0), op = cr.ops[0]; if (!op || !(op.lift || op.lower)) return top;
  const s = op.lift || op.lower; let bot;
  if (s.stack) { const L = s.stack.length + (op.lift ? (op.done ? 1 : 0) : (op.done ? 0 : 1)); bot = (isShipStack(s.stack) ? DECK + 0.08 : 0) + L; }
  else bot = 0.56 + 1;
  return bot + (top - bot) * h;
}
const yel = mat("#e8b432"), stsM = mat("#d8552e"), stsD = mat("#9a3a22"), boomM = mat("#e8653a"), rtgM = mat("#3a6ab0"), rtgG = mat("#4a7ac8");
const STS_H = 7.6, STS_TOP = STS_H - 0.9;
const CRANES = new Map();
function stsObj(b) {
  let o = CRANES.get(b); if (o) return o;
  const g = new THREE.Group();
  for (const lx of [-1.25, 1.25]) for (const lz of [QUAY + 0.35, 11.75]) box(0.28, STS_H, 0.28, stsD, lx, STS_H / 2, lz, g);
  for (const lz of [QUAY + 0.35, 11.75]) { box(2.9, 0.35, 0.34, stsM, 0, STS_H, lz, g); box(0.6, 0.25, 0.5, darkM, -1.25, 0.12, lz, g); box(0.6, 0.25, 0.5, darkM, 1.25, 0.12, lz, g); }
  for (const lx of [-1.25, 1.25]) box(0.24, 0.24, 11.75 - QUAY, stsM, lx, STS_H * 0.55, (QUAY + 0.35 + 11.75) / 2, g);
  box(0.5, 0.5, 11.8, boomM, 0, STS_H + 0.42, 1 + 11.8 / 2, g);   // the boom, out over the water
  box(0.8, 0.9, 0.7, mat("#4a4e56"), 0, STS_H + 0.9, 12.1, g);   // machinery house
  const lamp = box(0.12, 0.12, 0.12, new THREE.MeshBasicMaterial({ color: 0xff4a3a }), 0, STS_H + 0.75, 1.05, g);
  const trolley = box(0.7, 0.3, 0.7, darkM, 0, STS_H + 0.05, 0, g);
  const cable = box(0.04, 1, 0.04, darkM, 0, 0, 0, g), spr = box(CL - 0.2, 0.12, 0.85, yel, 0, 0, 0, g);
  scene.add(g); o = { g, trolley, cable, spr, lamp }; CRANES.set(b, o); return o;
}
function syncSTS() {
  for (const b of BERTHS) {
    const o = b.open ? stsObj(b) : CRANES.get(b); if (!o) continue; o.g.visible = !!b.open; if (!b.open) continue;
    const cr = b.crane, z = m(cr.y), y = spreaderY(cr, STS_TOP);
    o.g.position.x = m(cr.x); o.trolley.position.z = z; o.spr.position.set(0, y + 0.06, z);
    o.cable.position.set(0, (y + STS_H) / 2, z); o.cable.scale.y = Math.max(0.05, STS_H - y);
    o.lamp.material.color.set(Math.sin(G.clock * 4 + b.id) > 0.2 ? 0xff4a3a : 0x5a2018);
    if (cr.hold2) putBox(cr.hold2, m(cr.x + 5), y - 0.5, z + m(7), 0, {});
    if (cr.hold !== null && cr.hold) putBox(cr.hold, m(cr.x), y - 0.47, z, 0, {});
  }
}
const RTG_H = 4.7, RTG_TOP = 4.25;
function rtgObj(b) {
  let o = CRANES.get(b); if (o) return o;
  const g = new THREE.Group(), x0 = b.x - 0.25, x1 = b.x + b.w + 0.25;
  for (const lx of [x0, x1]) { for (const lz of [-0.5, 0.5]) { box(0.24, RTG_H, 0.24, rtgM, lx, RTG_H / 2, lz, g); box(0.4, 0.4, 0.4, tyreM, lx, 0.2, lz, g); } box(0.24, 0.24, 1.2, rtgM, lx, 0.55, 0, g); }
  for (const lz of [-0.45, 0.45]) box(x1 - x0 + 0.24, 0.34, 0.2, rtgG, (x0 + x1) / 2, RTG_H, lz, g);
  box(0.6, 0.5, 0.5, mat("#2a2c30"), x1 - 0.55, RTG_H - 0.55, 0.62, g);   // operator's cab
  const trolley = box(0.7, 0.3, 1.1, darkM, 0, RTG_H + 0.12, 0, g);
  const cable = box(0.04, 1, 0.04, darkM, 0, 0, 0, g), spr = box(0.85, 0.12, CL - 0.2, yel, 0, 0, 0, g);
  scene.add(g); o = { g, trolley, cable, spr }; CRANES.set(b, o); return o;
}
function syncRTG() {
  for (const b of BLOCKS) {
    const o = b.open ? rtgObj(b) : CRANES.get(b); if (!o) continue; o.g.visible = !!b.open; if (!b.open) continue;
    const cr = b.rtg, x = m(cr.x), y = spreaderY(cr, RTG_TOP);
    o.g.position.z = m(cr.y); o.trolley.position.x = x; o.spr.position.set(x, y + 0.06, 0);
    o.cable.position.set(x, (y + RTG_H) / 2, 0); o.cable.scale.y = Math.max(0.05, RTG_H - y);
    if (cr.hold !== null && cr.hold) putBox(cr.hold, m(cr.x), y - 0.47, m(cr.y), Math.PI / 2, {});
  }
}

// ---- camera (owner): looking down at 45° to 90° (straight down), turned any way, zoomed ----
const PITCH_MIN = Math.PI / 4, PITCH_MAX = Math.PI / 2;
const cam = { x: MW / 2, z: (QUAY + MH) / 2, yaw: 0, pitch: Math.PI / 3, vh: 40 };
// (owner, 2026-11-04) smoother: the camera eases toward where it's headed (goal) instead of jumping; a drag still moves
// it with the finger, and a flick keeps it gliding a moment after letting go
const goal = { ...cam }, flick = { x: 0, z: 0 }, keyV = { x: 0, z: 0, yaw: 0, pitch: 0, zoom: 0 };
let zoomAt = null;   // the wheel zooms toward the point under the pointer, kept there while it eases
const syncGoal = () => Object.assign(goal, cam);
let VW = 1, VH = 1, DPR = 1;
// (owner, 2026-11-03) a perspective camera: zoom is how far it stands back, given as how many meters of ground show from
// the top of the screen to the bottom at the point it looks at (vh)
const TANH = Math.tan(FOV * Math.PI / 360), camDist = () => cam.vh / (2 * TANH);
function applyCam() {
  cam.pitch = clamp(cam.pitch, PITCH_MIN, PITCH_MAX); cam.vh = clamp(cam.vh, 5, 80); cam.x = clamp(cam.x, 0, MW); cam.z = clamp(cam.z, 0, MH);
  camera.aspect = VW / VH; camera.updateProjectionMatrix();
  const D = camDist(), cp = Math.cos(cam.pitch);
  camera.position.set(cam.x + Math.sin(cam.yaw) * cp * D, Math.sin(cam.pitch) * D, cam.z + Math.cos(cam.yaw) * cp * D);
  camera.rotation.set(-cam.pitch, cam.yaw, 0); camera.updateMatrixWorld();
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
function setRay(sx, sy) { ndc.set(sx / VW * 2 - 1, -(sy / VH) * 2 + 1); ray.setFromCamera(ndc, camera); }
function groundAt(sx, sy, y = 0) { setRay(sx, sy); PLANE.constant = -y; return ray.ray.intersectPlane(PLANE, hitP) ? { x: hitP.x, z: hitP.z } : { x: cam.x, z: cam.z }; }
const pv = new THREE.Vector3();
// world to screen; null for a point behind the camera (so nothing is drawn or picked from there). Shapes on the overlay
// are cut where they pass behind the camera before they're projected, or they'd turn inside out across the screen.
const vv = new THREE.Vector3(), ZC = -1;
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
const ppm = () => VH / cam.vh;   // screen pixels per meter where the camera looks
const fwd = new THREE.Vector3();
function ppmAt(x, y, z) { camera.getWorldDirection(fwd); const d = (x - camera.position.x) * fwd.x + (y - camera.position.y) * fwd.y + (z - camera.position.z) * fwd.z; return VH / (2 * Math.max(0.5, d) * TANH); }   // nearer is bigger
// keep the ground point that was under (sx, sy) there after the camera changed
function anchor(before, sx, sy) { applyCam(); const after = groundAt(sx, sy); cam.x += before.x - after.x; cam.z += before.z - after.z; applyCam(); }

// ---- what's under the pointer (owner, 2026-11-04: 3D colliders, not the 2D grid): a badge of the selected truck's queue
// first; then the first collider the pointer's ray meets: a truck's (its cab, its trailer and the container on it), a
// container's own box, or a slot of the docked ship. A container in storage stops the ray (it's the tile under it that
// counts then); one hanging from a crane doesn't. On a touch screen, with nothing right under the finger, rays a little around it are
// tried too, nearest first.
let touchy = false, BADGES = [];
function castAt(sx, sy) {
  setRay(sx, sy);
  const hits = ray.intersectObjects(PICKABLE.concat([boxes, slotCols]), false);
  const docked = DOCK.ship && DOCK.ship.state === "docked";
  for (const h of hits) {
    const t = h.object.userData.truck; if (t) { if (t.exiting) continue; return { truck: t }; }
    if (h.object === slotCols) return docked ? { slot: SLOTK[h.instanceId] } : null;
    const inf = INST[h.instanceId]; if (!inf) continue;
    if (inf.truck) { if (inf.truck.exiting) continue; return { truck: inf.truck }; }
    if (inf.slot !== undefined) return docked ? { slot: inf.slot } : null;
    if (inf.storage) return null;   // a stored container stops the ray; one hanging from a crane doesn't
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
// the tile under the pointer: where the ray meets a stored container (the top of a stack), else the ground
R3.tileAt = (sx, sy) => {
  setRay(sx, sy);
  for (const h of ray.intersectObject(boxes, false)) { const inf = INST[h.instanceId]; if (inf && inf.storage) { const q = h.point.clone().addScaledVector(ray.ray.direction, 0.02); return [Math.floor(q.x), Math.floor(q.z)]; } if (inf && inf.slot !== undefined) break; }
  const p = groundAt(sx, sy); return [Math.floor(p.x), Math.floor(p.z)];
};

// ---- input: one finger or the left mouse button pans; two fingers pinch to zoom, twist to turn and slide up or down
// together to tilt; the right (or middle) mouse button drags to turn and tilt; the wheel zooms. A tap or click selects
// and sends (as in 2D), a long press calls off a claimed container, a right click takes back the last queued trip.
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
      // each finger's move comes on its own, so wait until both have moved (or the fingers clearly spread or twist)
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
  // how fast it's being dragged, for the glide after letting go
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
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), sp = cam.vh * 0.9, e = 1 - Math.exp(-dt * 8);   // forward on the ground: up the screen
  const tx = (fx * fwdIn - fz * side) * sp, tz = (fz * fwdIn + fx * side) * sp;
  keyV.x += (tx - keyV.x) * e; keyV.z += (tz - keyV.z) * e;
  keyV.yaw += ((k("KeyQ", "KeyQ") - k("KeyE", "KeyE")) * 1.6 - keyV.yaw) * e; keyV.pitch += ((k("KeyR", "KeyR") - k("KeyF", "KeyF")) * 0.9 - keyV.pitch) * e;
  keyV.zoom += ((k("Minus", "NumpadSubtract") - k("Equal", "NumpadAdd")) * 1.5 - keyV.zoom) * e;
  goal.x += keyV.x * dt; goal.z += keyV.z * dt; goal.yaw += keyV.yaw * dt; goal.pitch += keyV.pitch * dt; goal.vh *= Math.exp(keyV.zoom * dt);
}
// each frame: a flick glides on and slows down; the camera eases toward its goal
function easeCam(dt) {
  if (!gest && (flick.x || flick.z)) { goal.x += flick.x * dt; goal.z += flick.z * dt; const f = Math.exp(-dt * 4); flick.x *= f; flick.z *= f; if (hyp(flick.x, flick.z) < 0.05) flick.x = flick.z = 0; }
  goal.pitch = clamp(goal.pitch, PITCH_MIN, PITCH_MAX); goal.vh = clamp(goal.vh, 5, 80); goal.x = clamp(goal.x, 0, MW); goal.z = clamp(goal.z, 0, MH);
  const e = 1 - Math.exp(-dt * 14);
  cam.yaw += (goal.yaw - cam.yaw) * e; cam.pitch += (goal.pitch - cam.pitch) * e; cam.vh += (goal.vh - cam.vh) * e;
  if (zoomAt) { anchor(zoomAt.g, zoomAt.sx, zoomAt.sy); goal.x = cam.x; goal.z = cam.z; if (Math.abs(goal.vh - cam.vh) < goal.vh * 0.002) zoomAt = null; }
  else { cam.x += (goal.x - cam.x) * e; cam.z += (goal.z - cam.z) * e; }
  applyCam();
}

// ---- the overlay: labels, prices, the selected truck's queue, what a click would do, drawn flat on the screen ----
const FONT = "'Big Shoulders Display', Impact, sans-serif";
function poly(world, stroke, width, fill, dash) { const pts2 = clipView(world.map((p) => view(...p)), true).map(toScr); if (pts2.length < 3) return; octx.beginPath(); pts2.forEach(([x, y], i) => (i ? octx.lineTo(x, y) : octx.moveTo(x, y))); octx.closePath(); if (fill) { octx.fillStyle = fill; octx.fill(); } if (stroke) { octx.setLineDash(dash || []); octx.strokeStyle = stroke; octx.lineWidth = width; octx.stroke(); octx.setLineDash([]); } }
const rectPts = ([x, y, w, h], yy = 0.04) => [[m(x), yy, m(y)], [m(x + w), yy, m(y)], [m(x + w), yy, m(y + h)], [m(x), yy, m(y + h)]];
function seg(a, b, color, width, dash, cap) { const p = clipView([view(...a), view(...b)], false).map(toScr); if (p.length < 2) return; octx.setLineDash(dash || []); octx.lineCap = cap || "butt"; octx.strokeStyle = color; octx.lineWidth = width; octx.beginPath(); octx.moveTo(...p[0]); octx.lineTo(...p[1]); octx.stroke(); octx.setLineDash([]); octx.lineCap = "butt"; }
function tag(x, y, txt, edge, ink) { octx.font = `800 18px ${FONT}`; const w = octx.measureText(txt).width + 14; octx.fillStyle = "rgba(10,14,20,.85)"; octx.fillRect(x - w / 2, y - 12, w, 24); octx.strokeStyle = edge; octx.lineWidth = 2; octx.strokeRect(x - w / 2, y - 12, w, 24); octx.fillStyle = ink; octx.textAlign = "center"; octx.textBaseline = "middle"; octx.fillText(txt, x, y + 1); }
const price = (at, p) => at && tag(at[0], at[1], "$" + p.toLocaleString(), G.money >= p ? "#7fd88a" : "#6a7080", G.money >= p ? "#ece7dc" : "#8b919b");
function face(x, y, happy) { octx.fillStyle = "#ffffff"; octx.fillRect(x, y, 18, 16); octx.fillRect(x + 4, y + 16, 4, 3); octx.fillStyle = happy ? "#2e9a4a" : "#c83a2e"; octx.fillRect(x + 4, y + 4, 3, 3); octx.fillRect(x + 11, y + 4, 3, 3); octx.fillRect(x + 4, y + 10, 10, 2); const yy = happy ? y + 9 : y + 11; octx.fillRect(x + 3, yy, 2, 2); octx.fillRect(x + 13, yy, 2, 2); }
function overlay() {
  octx.setTransform(DPR, 0, 0, DPR, 0, 0); octx.clearRect(0, 0, VW, VH);
  const sel = G.selected;
  // locked things, dimmed with their price
  for (const b of BLOCKS) if (!b.open) poly(rectPts([b.x * T - 4, b.y * T - 4, b.w * T + 8, (YROAD - b.y) * T + 4]), null, 0, "rgba(8,12,18,.55)");
  for (const b of BERTHS) if (!b.open) poly(rectPts([b.ex * T, QUAY * T, (b.ox - b.ex + 1) * T, 5 * T]), null, 0, "rgba(8,12,18,.55)");
  const groups = []; for (const st of STALLS) if (!st.open && st.group > 0 && !groups[st.group]) groups[st.group] = st;
  for (const st of groups) if (st) poly(rectPts([st.i * T, LOT0 * T, 4 * T, TL * T]), null, 0, "rgba(8,12,18,.55)");
  for (const b of BLOCKS) if (!b.open) price(scr(b.x + b.w / 2, 0, b.y + 6), G.BLOCK_PRICE[b.id]);
  for (const b of BERTHS) if (!b.open) price(scr((b.ex + b.ox + 1) / 2, 0, QUAY + 2.5), G.CRANE_PRICE[b.id]);
  groups.forEach((st, g) => { if (st) price(scr(st.i + 2, 0, LOT0 + 2), G.STALL_PRICE[g]); });
  // a selected customer truck: a dotted line to its container; a selected auto tractor: its RTG
  if (sel && sel.kind === "cust" && sel.load === null) { const at = G.boxAt(sel.want); if (at) { const tr = G.trailerOf(sel); seg([m(tr.x), 1.1, m(tr.y)], [m(at[0]), 1.2, m(at[1])], "#ffffff", 3, [2, 7], "round"); } }
  if (sel && sel.auto && sel.home) { const hb = sel.home; poly(rectPts([hb.x * T - 3, hb.y * T - 3, hb.w * T + 6, (YROAD - hb.y) * T + 6]), "#5fd3d0", 3, null, [8, 6]); }
  // the selected truck's queue: numbered spots joined in order; the numbers can be tapped to take a trip back
  BADGES = [];
  if (sel) {
    const tr = G.trailerOf(sel); let prev = [m(tr.x), 0.05, m(tr.y)], n = 0;
    for (const a of sel.cmd ? [sel.cmd, ...sel.queue] : sel.queue) {
      if (a.kind === "deliver" || a.kind === "qwait") continue;
      const r = G.spotRect(a), c = [m(r[0] + r[2] / 2), 0.05, m(r[1] + r[3] / 2)]; n++;
      seg(prev, c, "rgba(255,255,255,.6)", 2, [5, 5]); prev = c;
      poly(rectPts(r), "#ffffff", 2, null, [5, 5]);
      const z = touchy ? 26 : 18, bp = scr(m(r[0]), 0.05, m(r[1])); if (!bp) continue; const [bx, by] = bp;
      BADGES.push({ x: bx, y: by, r: z / 2 + 3, a: a === sel.cmd ? null : a });
      octx.fillStyle = "#1e2024"; octx.fillRect(bx - z / 2, by - z / 2, z, z); octx.strokeStyle = "#ece7dc"; octx.lineWidth = 1; octx.strokeRect(bx - z / 2 + 0.5, by - z / 2 + 0.5, z - 1, z - 1);
      octx.fillStyle = "#ece7dc"; octx.font = `800 ${Math.round(z * 0.7)}px 'JetBrains Mono', monospace`; octx.textAlign = "center"; octx.textBaseline = "middle"; octx.fillText(String(n), bx, by + 1);
    }
  }
  // what a click would do with the selected truck, under the pointer
  const hv = G.hover;
  if (sel && hv && !hv.truck) {
    const [i, j] = hv.tile, g = G.targetAt(i, j), hb = G.homeFor(sel, i, j);
    if (hb) poly(rectPts([hb.x * T, hb.y * T, hb.w * T, (YROAD - hb.y) * T]), "#7fd88a", 3);
    else if (g) {
      const a = G.planFor(sel, i, j) || G.slotSwap(sel, i, j), col = a ? "#7fd88a" : "#ff5a4a";
      const r = a ? G.spotRect(a) : g.kind === "sts" ? (g.slot !== undefined ? G.slotRect(g.slot) : [(g.berth.x + 5) * T, G.LINE * T, TL * T, 3 * T]) : g.kind === "rtg" ? [g.block.x * T, g.block.y * T, g.block.w * T, (YROAD - g.block.y) * T] : [g.stall.i * T, LOT0 * T, T, TL * T];
      poly(rectPts(r, g.slot !== undefined ? DECK + 0.1 : 0.04), col, 3);
    }
  }
  // tractor numbers on their cabs, customers' faces, the money they pay
  octx.textAlign = "center"; octx.textBaseline = "middle";
  for (const t of G.trucks) {
    const s = G.shapeOf(t), cx = m((s.front[0] + s.cabBack[0]) / 2), cz = m((s.front[1] + s.cabBack[1]) / 2);
    const np = scr(cx, 1.2, cz);
    if (t.num && np) { const [x, y] = np; if (x > -20 && y > -20 && x < VW + 20 && y < VH + 20) { const z = clamp(ppmAt(cx, 1.2, cz) * 0.45, 12, 20); octx.fillStyle = "#1e2024"; octx.fillRect(x - z / 2, y - z / 2, z, z); octx.fillStyle = "#ece7dc"; octx.font = `800 ${Math.round(z * 0.75)}px 'JetBrains Mono', monospace`; octx.fillText(String(t.num), x, y + 0.5); } }
    if (t.sad > 0 || t.happy > 0) { const fp = scr(m(s.front[0]), 1.4, m(s.front[1])); if (fp) face(fp[0] + 6, fp[1] - 30, t.happy > 0); }
  }
  for (const f of G.floats) { const fp = scr(m(f.x), 1.6, m(f.y)); if (!fp) continue; const [x, y] = fp; octx.globalAlpha = Math.min(1, f.t); octx.fillStyle = "#7fd88a"; octx.font = `800 18px ${FONT}`; octx.fillText(f.text, x, y - 20 - (1.6 - f.t) * 24); } octx.globalAlpha = 1;
  // the ship's time left, off its bow
  const s = DOCK.ship;
  if (s && (s.state === "docked" || s.state === "closing")) {
    const sec = Math.max(0, Math.ceil(s.time)), txt = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"), low = sec <= 30, y = (DOCK.top + DOCK.rows - s.rows - 1) * T + 14, h = (s.rows + 1) * T + 2;
    const tp = scr(m(DOCK.x * T + Math.round(s.off) + s.cols * CL * T) + 3.5, DECK, m(y + h / 2));
    if (tp) { const [x0, y0] = tp;
    tag(x0, y0, txt, low ? "#ff5a4a" : "#6a7080", low && Math.sin(G.clock * 8) > 0 ? "#ff5a4a" : "#ece7dc"); }
  }
  const bad = G.bad; if (bad && scr(bad.i + 0.5, 0.05, bad.j + 0.5)) { const [x, y] = scr(bad.i + 0.5, 0.05, bad.j + 0.5); octx.strokeStyle = `rgba(255,90,74,${bad.t * 2})`; octx.lineWidth = 3; octx.beginPath(); octx.moveTo(x - 9, y - 9); octx.lineTo(x + 9, y + 9); octx.moveTo(x + 9, y - 9); octx.lineTo(x - 9, y + 9); octx.stroke(); }
}

// ---- each frame ----
let sized = false, lastT = performance.now();
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight;
  renderer.setPixelRatio(DPR); renderer.setSize(VW, VH, false); ov.width = VW * DPR; ov.height = VH * DPR;
  if (!sized) {   // it starts over the whole port; on a touch screen close enough for a fingertip, over where the port starts
    sized = true; cam.z = MH / 2 - 1; cam.vh = clamp(Math.max(MH * Math.sin(cam.pitch) + 4, (MW + 2) * VH / VW), 5, 80);
    if (matchMedia && matchMedia("(pointer: coarse)").matches) { touchy = true; cam.vh = 24; cam.x = 15; cam.z = 18; }
    syncGoal();
  }
  applyCam();
}
addEventListener("resize", resize); resize();
R3.draw = () => {
  const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (innerWidth !== VW || innerHeight !== VH) resize();
  keyCam(dt); easeCam(dt); syncGround();
  nBox = 0; INST.length = 0;
  syncShip(); syncSlotCols(); syncStorage(); syncTrucks(); syncSTS(); syncRTG();
  boxes.count = nBox; boxes.instanceMatrix.needsUpdate = true; if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true; boxes.computeBoundingSphere();
  renderer.render(scene, camera);
  overlay();
};
// for tests
R3.cam = cam; R3.goal = goal; R3.applyCam = () => { applyCam(); syncGoal(); }; R3.scr = scr; R3.badges = () => BADGES;
R3.screenOfTruck = (t) => { const tr = G.trailerOf(t); const [x, y] = scr(m(tr.x), 1, m(tr.y)) || [-1, -1]; return { x, y }; };
R3.screenOfSlot = (k) => { const [rx, ry] = G.slotRect(k), st = DOCK.ship.bays[k]; const [x, y] = scr(m(rx) + CL / 2, DECK + (st.length ? st.length - 0.2 : 0.25), m(ry) + 0.5) || [-1, -1]; return { x, y }; };
R3.screenOfTile = (i, j, y = 0) => { const [x, yy] = scr(i + 0.5, y, j + 0.5) || [-1, -1]; return { x, y: yy }; };
R3.camera = camera; R3.firstHitDist = (sx, sy) => { setRay(sx, sy); const h = ray.intersectObjects(PICKABLE.concat([boxes, slotCols]), false)[0]; return h ? h.distance : Infinity; };
