// Critter Courier (owner, 2026-11-11: the game remade from the design document). Grab a parcel off the post office
// conveyor, ride your mount to the address before a dog or a goose (or another courier's boot) gets it, drop it in the
// mailbox and watch the reward roll. The server (packages/server/src/pets.js) decides everything that matters: parcels,
// deliveries, rolls, damage, coins, mounts; this page shows the town (pets-world.js, shared with the server), moves you
// and asks. Phone first: a thumb joystick, drag to look, pinch to zoom, big buttons.
import * as THREE from "./vendor/three.module.min.js";
import * as World from "./pets-world.js?v=1794435581";

const $ = (id) => document.getElementById(id);
const { TAU, clamp, hyp, MOUNTS, TIERS, RARITY, RARITY_C, MODS, EGGS, UPGRADES } = World;
const lerp = (a, b, t) => a + (b - a) * t, pick = (a) => a[Math.floor(Math.random() * a.length)];
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const touchy = matchMedia("(pointer: coarse)").matches;
const fmt = (n) => Math.floor(n).toLocaleString("en-US");
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// ---- the scene ----
const canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchy, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touchy ? 1.5 : 2)); renderer.shadowMap.enabled = !touchy;   // phones keep the soft spots under everyone, not full shadows renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color("#9cc7e6"); scene.fog = new THREE.Fog("#bcd9ec", 220, 760);
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 1600);
scene.add(new THREE.HemisphereLight("#ffffff", "#c9d2bc", 2.05));
const sun = new THREE.DirectionalLight("#fff3d6", 1.25); sun.castShadow = true; sun.shadow.mapSize.set(touchy ? 1024 : 2048, touchy ? 1024 : 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 260 }); scene.add(sun, sun.target);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
const MATS = new Map(), mat = (c) => { if (!MATS.has(c)) MATS.set(c, new THREE.MeshLambertMaterial({ color: c })); return MATS.get(c); };
const BOX = new THREE.BoxGeometry(1, 1, 1);
function box(w, h, d, c, x, y, z, parent, shadow = true) { const m = new THREE.Mesh(BOX, mat(c)); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; (parent || scene).add(m); return m; }
const basic = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: o >= 1 });
function textSprite(text, { size = 40, color = "#23303b", bg = "rgba(255,255,255,.94)", w = 0, glow = "", badge = "" } = {}) {   // a rounded label that always faces the camera
  const c = document.createElement("canvas"), g = c.getContext("2d"); g.font = `800 ${size}px "Big Shoulders Display", system-ui, sans-serif`;
  const tw = g.measureText(text).width + (badge ? size * 0.9 : 0), W = Math.ceil(Math.max(w, tw + size * 1.1)), H = Math.ceil(size * 1.7); c.width = W + 16; c.height = H + 16;
  g.font = `800 ${size}px "Big Shoulders Display", system-ui, sans-serif`;
  if (glow) { g.shadowColor = glow; g.shadowBlur = 14; }
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(8, 8, W, H, H / 2); g.fill(); }
  g.shadowBlur = 0; if (glow) { g.strokeStyle = glow; g.lineWidth = 4; g.beginPath(); g.roundRect(8, 8, W, H, H / 2); g.stroke(); }
  let x = 8 + W / 2; if (badge) { g.fillStyle = badge; const bx = 8 + (W - tw) / 2 + size * 0.3, by = 8 + H / 2; g.beginPath(); g.moveTo(bx - size * 0.3, by - size * 0.36); g.lineTo(bx + size * 0.3, by - size * 0.36); g.lineTo(bx + size * 0.3, by + size * 0.08); g.lineTo(bx, by + size * 0.4); g.lineTo(bx - size * 0.3, by + size * 0.08); g.closePath(); g.fill(); g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 2; g.stroke(); x += size * 0.45; }
  g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, x, 8 + H / 2 + size * 0.04);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set((c.width / c.height) * 1.1, 1.1, 1); s.renderOrder = 6; return s;
}

// ---- the town, drawn from the shared world ----
// (owner, 2026-11-11) the town's colors are kept calm so the delivery marker (POI: the one hot pink thing in town) stands out
const POI = "#ff1f8f";
const KIND_C = { grass: "#78b765", mud: "#75583e", rock: "#9a948b", plank: "#b9905f", isle: "#80bd6c", road: "#84878f", stone: "#a9adb5", roof: "#b9573f" };
const HOUSE_C = [["#efe3cc", "#c8604c"], ["#ecd5b8", "#5c86bd"], ["#cfdcc0", "#7a5a3c"], ["#dcd3c6", "#8368b0"], ["#f1f1ec", "#3fa9a4"]];   // walls and roofs, by district
const houseMesh = [], dogMesh = [], gooseMesh = [], goatMesh = [], sprinklerMesh = [], pipeEyes = [];
function rampGeo(s) {   // a wedge: flat at the bottom, rising along z
  const y0 = Math.min(s.ya, s.yb), g = new THREE.BufferGeometry(), A = [s.x0, y0, s.z0], B = [s.x1, y0, s.z0], C = [s.x1, y0, s.z1], D = [s.x0, y0, s.z1], E = [s.x0, s.ya, s.z0], F = [s.x1, s.ya, s.z0], G = [s.x1, s.yb, s.z1], H = [s.x0, s.yb, s.z1];
  const quads = [[E, H, G, F], [A, E, F, B], [D, C, G, H], [A, D, H, E], [B, F, G, C]], v = [];
  for (const [a, b, c, d] of quads) v.push(...a, ...b, ...c, ...a, ...c, ...d);
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
}
function buildTown() {
  for (const s of World.slabs) {
    const c = KIND_C[s.kind] || "#cccccc";
    if (s.k === 0) { const h = Math.min(s.y - s.b, 46), m = box(s.x1 - s.x0, h, s.z1 - s.z0, c, (s.x0 + s.x1) / 2, s.y - h / 2, (s.z0 + s.z1) / 2); m.castShadow = s.kind === "roof" || s.kind === "stone"; }
    else if (s.k === 2) { const m = new THREE.Mesh(rampGeo(s), new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide })); m.receiveShadow = true; scene.add(m); }
    else {   // an island: grass on top, rock tapering away beneath
      const top = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, 0.8, 40), mat(c)); top.position.set(s.x, s.y - 0.4, s.z); top.receiveShadow = true; scene.add(top);
      const rock = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.98, s.r * 0.25, 13, 20), mat("#9a8f84")); rock.position.set(s.x, s.y - 7.3, s.z); scene.add(rock);
    }
  }
  // roads
  for (const r of World.roads) {
    const len = hyp(r.x1 - r.x0, r.z1 - r.z0), m = box(r.w, 0.06, len, r.alley ? "#c9ab7e" : r.w > 20 ? "#a9adb5" : "#84878f", (r.x0 + r.x1) / 2, 0.03, (r.z0 + r.z1) / 2, null, false); m.rotation.y = Math.atan2(r.x1 - r.x0, r.z1 - r.z0); m.receiveShadow = true;
    if (!r.alley && r.w < 20) for (let u = 3; u < len - 3; u += 9) box(0.25, 0.07, 3.6, "#e8e2c8", r.x0 + ((r.x1 - r.x0) * u) / len, 0.04, r.z0 + ((r.z1 - r.z0) * u) / len, null, false).rotation.y = m.rotation.y;   // the middle line
  }
  // houses and their mailboxes
  for (const h of World.houses) {
    const [wall, roof] = HOUSE_C[h.d], g = new THREE.Group(), s = h.size; g.position.set(h.x, h.y, h.z); g.rotation.y = h.yaw; scene.add(g);
    box(s, 3.2, s, wall, 0, 1.6, 0, g); box(1.3, 2.1, 0.12, roof, 0, 1.05, s / 2 + 0.02, g, false);
    for (const x of [-1, 1]) box(1.1, 1.0, 0.1, "#bfe6ff", x * s * 0.3, 2.0, s / 2 + 0.02, g, false);
    const rf = new THREE.Mesh(new THREE.ConeGeometry(s * 0.8, 2.6, 4), mat(roof)); rf.rotation.y = Math.PI / 4; rf.position.y = 4.5; rf.castShadow = true; g.add(rf);
    const mb = new THREE.Group(); mb.position.set(h.mx, h.my, h.mz); mb.rotation.y = h.yaw; scene.add(mb);
    box(0.14, 1.0, 0.14, "#f4f1ea", 0, 0.5, 0, mb); const bx = box(0.5, 0.42, 0.75, "#3a8ee6", 0, 1.2, 0, mb); box(0.06, 0.34, 0.06, "#e5534b", 0.3, 1.45, 0.2, mb, false);
    houseMesh.push({ g, mb, bx, shake: 0 });
  }
  for (const f of World.fences) { const len = hyp(f.x1 - f.x0, f.z1 - f.z0), m = box(0.14, 1.0, len, "#fbf7ee", (f.x0 + f.x1) / 2, f.y + 0.5, (f.z0 + f.z1) / 2); m.rotation.y = Math.atan2(f.x1 - f.x0, f.z1 - f.z0); }
  // trees (two instanced shapes)
  { const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.36, 2.2, 7), mat("#8a5a34"), World.trees.length), leaf = new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 4.6, 8), mat("#3fa650"), World.trees.length), d = new THREE.Object3D();
    World.trees.forEach((t, n) => { d.position.set(t.x, t.y + 1.1 * t.s, t.z); d.scale.setScalar(t.s); d.updateMatrix(); trunk.setMatrixAt(n, d.matrix); d.position.y = t.y + 4.2 * t.s; d.updateMatrix(); leaf.setMatrixAt(n, d.matrix); });
    trunk.castShadow = leaf.castShadow = true; scene.add(trunk, leaf); }
  for (const p of World.ponds) { const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 36).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#4fb4ee", transparent: true, opacity: 0.88 })); m.position.set(p.x, p.y + 0.07, p.z); scene.add(m); }
  // the post office: the counter with the conveyor round it, under a roof
  { const P = World.PO, c = P.counter * 2;
    box(c, 1.0, c, "#c08a55", P.x, 0.5, P.z); box(c, 0.16, c, "#3d4650", P.x, 1.08, P.z, null, false); box(c - 2.6, 0.5, c - 2.6, "#ead9bd", P.x, 1.4, P.z);
    for (const [x, z, k] of [[-1.6, -1.2, 0], [1.2, 1.5, 1], [0.6, -1.6, 2], [-1.2, 1.4, 3], [0, 0, 4]]) box(1.1, 0.9, 1.1, TIERS[k].c, P.x + x, 2.1, P.z + z);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(1, 7, 1, "#fbf7ee", P.x + sx * P.roof, 3.5, P.z + sz * P.roof);
    for (const [x, z] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) box(x ? 1.6 : P.roof * 2 + 2.6, 1.2, z ? 1.6 : P.roof * 2 + 2.6, "#e0604a", P.x + x * P.roof, 7.6, P.z + z * P.roof);   // an open frame, so the counter's seen from above
    for (const [x, z] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const s = textSprite("POST OFFICE", { size: 56, color: "#ffffff", bg: "#e0604a" }); s.scale.multiplyScalar(1.7); s.position.set(P.x + x * P.roof, 9.3, P.z + z * P.roof); s.material.depthTest = true; scene.add(s); }
  }
  // shortcuts: ziplines, the sewer pipe, the Sky Cannon, jump pads, boost pads, balloons
  for (const z of World.zips) {
    const a = new THREE.Vector3(z.x, z.y + 3, z.z), b = new THREE.Vector3(z.tx, z.ty + 3, z.tz), len = a.distanceTo(b), m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 5), mat("#2b323a"));
    m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); scene.add(m);
    box(0.3, 3.2, 0.3, "#8a5a34", z.x, z.y + 1.6, z.z); box(0.3, 3.2, 0.3, "#8a5a34", z.tx, z.ty + 1.6, z.tz); box(1.6, 0.14, 1.6, "#ffd84a", z.x, z.y + 0.07, z.z, null, false);
  }
  for (const e of [World.PIPE.a, World.PIPE.b]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(World.PIPE.r, World.PIPE.r, 0.6, 20, 1, true), new THREE.MeshLambertMaterial({ color: "#4f9a5a", side: THREE.DoubleSide })); m.position.set(e.x, e.y + 0.3, e.z); m.castShadow = true; scene.add(m);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(World.PIPE.r, 0.22, 8, 24).rotateX(Math.PI / 2), mat("#5fb56b")); lip.position.set(e.x, e.y + 0.6, e.z); scene.add(lip);
    const dark = new THREE.Mesh(new THREE.CircleGeometry(World.PIPE.r - 0.05, 20).rotateX(-Math.PI / 2), basic("#10151a")); dark.position.set(e.x, e.y + 0.42, e.z); scene.add(dark);
    const eyes = new THREE.Group(); for (const x of [-0.35, 0.35]) { const w = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), basic("#ffffff")); w.position.set(x, 0, 0); const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), basic("#10151a")); p.position.set(x, 0.14, 0); eyes.add(w, p); }
    const bill = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 6), basic("#f08a24")); bill.position.set(0, 0.1, 0.3); eyes.add(bill); eyes.position.set(e.x, e.y + 1.0, e.z); scene.add(eyes); pipeEyes.push(eyes);
  }
  { const C = World.CANNON, g = new THREE.Group(); g.position.set(C.x, C.y, C.z); scene.add(g);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(C.r + 0.4, C.r + 0.8, 0.5, 20), mat("#3d4650")); base.position.y = 0.25; g.add(base);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r, 0.1, 20), basic("#9aa8ff")); pad.position.y = 0.55; g.add(pad);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 6, 14, 1, true), new THREE.MeshLambertMaterial({ color: "#5a6472", side: THREE.DoubleSide })); barrel.position.set(-2.6, 2.2, 0); barrel.rotation.z = -0.9; barrel.castShadow = true; g.add(barrel); }
  for (const p of World.pads) { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.16, 18), mat("#35c4de")); m.position.set(p.x, p.y + 0.08, p.z); scene.add(m); const r = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.16, 6, 18).rotateX(Math.PI / 2), mat("#ffffff")); r.position.set(p.x, p.y + 0.16, p.z); scene.add(r); }
  { const cv = document.createElement("canvas"); cv.width = cv.height = 128; const g = cv.getContext("2d"); g.fillStyle = "#ffd84a"; g.fillRect(0, 0, 128, 128); g.strokeStyle = "#e0701a"; g.lineWidth = 14; g.lineCap = "round"; g.lineJoin = "round";
    for (const y of [92, 58, 24]) { g.beginPath(); g.moveTo(30, y + 18); g.lineTo(64, y - 8); g.lineTo(98, y + 18); g.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; const bm = new THREE.MeshLambertMaterial({ map: t });
    for (const b of World.boosts) { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2), bm); m.position.set(b.x, b.y + 0.09, b.z); m.rotation.y = b.yaw + Math.PI; m.receiveShadow = true; scene.add(m); } }
  for (const b of World.balloons) { const g = new THREE.Group(); g.position.set(b.x, b.y, b.z); scene.add(g); box(1.6, 1.0, 1.6, "#b9824f", 0, 0.9, 0, g);
    const top = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), mat("#ff6b6b")); top.position.y = 6; top.scale.y = 1.15; g.add(top); const band = new THREE.Mesh(new THREE.SphereGeometry(2.64, 16, 6, 0, TAU, 1.2, 0.7), mat("#ffffff")); band.position.y = 6; band.scale.y = 1.15; g.add(band);
    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) box(0.05, 3.2, 0.05, "#5a4632", x, 2.8, z, g, false); b.g = g; }
  for (const s of World.sprinklers) { box(0.2, 0.5, 0.2, "#7a828c", s.x, s.y + 0.25, s.z); sprinklerMesh.push(s); }
  // clouds, for somewhere to float
  for (let n = 0; n < 34; n++) { const g = new THREE.Group(), a = n * 2.39, r = 150 + (n * 97) % 620; g.position.set(250 + Math.cos(a) * r, 60 + (n * 37) % 90, Math.sin(a) * r * 0.8);
    for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(SPHERE, basic("#ffffff", 0.92)); m.scale.set(8 + ((n + k) * 5) % 7, 4 + k, 6 + (k * 3) % 4); m.position.set(k * 7 - 10, (k % 2) * 2, (k * 5) % 6); g.add(m); } scene.add(g); }
}

// ---- the courier (owner, 2026-11-09): a blocky R6-style figure, matched to the owner's reference. 1 stud = 0.4 m:
// torso 2 x 2 x 1 studs, arms and legs 1 x 2 x 1 with softened edges, a rounded 1.25-stud head with two oval eyes and
// a smile; head and arms skin, torso the shirt, legs dark. It faces +z, feet at y 0; arms and legs swing from the
// shoulders and hips ----
const SKIN = "#f1c9a5", PANTS = "#3d4650", RBOX = new Map();
function roundBox(w, h, d, r, seg) {   // a box with rounded edges; the front (+z) face's UVs are flat, for the face
  const key = [w, h, d, r, seg].join(); if (RBOX.has(key)) return RBOX.get(key);
  const S = seg * 2 + 2, g = new THREE.BoxGeometry(w, h, d, S, S, S), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, half = [w / 2, h / 2, d / 2], c = [0, 0, 0], v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const front = n.getZ(i) > 0.5;
    for (let a = 0; a < 3; a++) {   // bunch the grid toward the edges: seg steps across each rounded edge, the rest flat
      const hf = half[a], k = Math.round(((p.getComponent(i, a) / hf + 1) / 2) * S);
      c[a] = k <= seg ? -hf + (k / seg) * r : k >= S - seg ? hf - ((S - k) / seg) * r : -(hf - r) + ((k - seg) / (S - 2 * seg)) * 2 * (hf - r);
    }
    const ix = clamp(c[0], r - half[0], half[0] - r), iy = clamp(c[1], r - half[1], half[1] - r), iz = clamp(c[2], r - half[2], half[2] - r);
    v.set(c[0] - ix, c[1] - iy, c[2] - iz).normalize(); n.setXYZ(i, v.x, v.y, v.z); v.multiplyScalar(r);
    p.setXYZ(i, ix + v.x, iy + v.y, iz + v.z);
    if (front) uv.setXY(i, (ix + v.x) / w + 0.5, (iy + v.y) / h + 0.5);
  }
  RBOX.set(key, g); return g;
}
const FACES = new Map();
function faceMat(skin, blush) {   // the head's front: skin with two tall oval eyes and a smile (townsfolk: their own skin, maybe rosy cheeks)
  const key = skin + (blush ? "b" : ""); if (FACES.has(key)) return FACES.get(key);
  const cv = document.createElement("canvas"); cv.width = cv.height = 256; const x = cv.getContext("2d");
  x.fillStyle = skin; x.fillRect(0, 0, 256, 256);
  if (blush) { x.fillStyle = "rgba(240,110,120,.45)"; for (const bx of [70, 186]) { x.beginPath(); x.ellipse(bx, 140, 20, 12, 0, 0, TAU); x.fill(); } }
  x.fillStyle = x.strokeStyle = "#16181a";
  for (const ex of [103, 153]) { x.beginPath(); x.ellipse(ex, 88, 8.5, 18, 0, 0, TAU); x.fill(); }
  x.lineWidth = 10; x.lineCap = "round"; x.beginPath(); x.moveTo(86, 172); x.quadraticCurveTo(128, 254, 170, 172); x.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshLambertMaterial({ map: t }); FACES.set(key, m); return m;
}
const FACE_M = faceMat(SKIN);
const BLOB_TEX = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(0,0,0,0.42)"); r.addColorStop(0.6, "rgba(0,0,0,0.22)"); r.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const BLOB_G = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobs = [];
function blobUnder(g, size) { const b = new THREE.Mesh(BLOB_G, new THREE.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); b.renderOrder = 1; scene.add(b); blobs.push({ g, b, size }); return b; }
function blobStep() {
  for (let i = blobs.length - 1; i >= 0; i--) {
    const q = blobs[i]; if (!q.g.parent) { scene.remove(q.b); blobs.splice(i, 1); continue; }
    let vis = q.g.visible; for (let p = q.g.parent; p && vis; p = p.parent) vis = p.visible;
    q.b.visible = vis; if (!vis) continue;
    const x = q.g.position.x, z = q.g.position.z, y = q.g.position.y, f0 = World.surfaceAt(x, z, y + 0.3), f = f0 > -1e9 ? f0 : y - 40, h = y - f, k = clamp(1 - h / 12, 0, 1);
    q.b.position.set(x, f + 0.05, z); const s = q.size * (q.g.scale.x || 1) * (0.6 + 0.4 * k); q.b.scale.set(s, 1, s); q.b.material.opacity = k;
  }
}
function courierModel(shirt, seated, look) {
  const g = new THREE.Group(), legs = [], arms = [];
  const part = (w, h, d, m, x, y, z, parent, r = 0.025, seg = 2) => { const o = new THREE.Mesh(roundBox(w, h, d, r, seg), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  for (const x of [-0.2, 0.2]) {   // legs hang from the hips (y 0.8)
    const l = new THREE.Group(); l.position.set(x, 0.8, 0); g.add(l); legs.push(l); part(0.4, 0.8, 0.4, mat((look && look.pants) || PANTS), 0, -0.4, 0, l);
    if (seated) l.rotation.set(-1.05, 0, Math.sign(x) * 0.5);   // astride the pet: forward, down and out
  }
  part(0.8, 0.8, 0.4, mat(shirt), 0, 1.2, 0, g);
  for (const x of [-0.6, 0.6]) {   // arms swing from the shoulders, a quarter of the way down
    const a = new THREE.Group(); a.position.set(x, 1.4, 0); g.add(a); arms.push(a); part(0.4, 0.8, 0.4, mat((look && (look.sleeve || look.skin)) || SKIN), 0, -0.2, 0, a);
    if (seated) a.rotation.x = -0.55;   // reaching forward to hold on
  }
  const skin = (look && look.skin) || SKIN, sk = mat(skin), head = part(0.5, 0.48, 0.5, [sk, sk, sk, sk, look ? faceMat(skin, look.blush) : FACE_M, sk], 0, 1.84, 0, g, 0.12, 4);
  return { g, legs, arms, head };
}

// ---- a pet (built from simple shapes; it faces +z) with its rider ----
// (owner, 2026-11-08: they all looked alike) each kind has its own build: body shape and size, legs, neck, head and
// snout, ears, tail and its own extras, so each reads at a glance
const SPHERE = new THREE.SphereGeometry(1, 14, 10), CONE = new THREE.ConeGeometry(1, 1, 10), CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
function ball(r, c, x, y, z, parent, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(SPHERE, mat(c)); m.scale.set(r * sx, r * sy, r * sz); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
function cone(r, h, c, x, y, z, parent, rx = 0, rz = 0) { const m = new THREE.Mesh(CONE, mat(c)); m.scale.set(r, h, r); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; parent.add(m); return m; }
// a box from point a to point b (y, z in the body's side view), w wide and t thick
function strut(w, t, c, y0, z0, y1, z1, parent, x = 0) { const len = hyp(y1 - y0, z1 - z0), m = box(w, t, len, c, x, (y0 + y1) / 2, (z0 + z1) / 2, parent); m.rotation.x = -Math.atan2(y1 - y0, z1 - z0); return m; }
// each kind: plan (quad, upright, bird, biped, butterfly), body size [width, height, length], round body, leg length,
// neck length, head size, snout length, ears, tail and extras
const LOOK = {
  pup: { plan: "quad", body: [0.8, 0.62, 1.25], leg: 0.55, head: 0.62, snout: 0.32, ears: "flop", tail: "wag", nose: "#2b1d14" },
  dragon: { plan: "quad", body: [0.95, 0.8, 1.6], leg: 0.7, neck: 0.85, head: 0.55, snout: 0.5, ears: "none", horns: "back", tail: "spade", wings: "bat", spikes: true },
  parrot: { plan: "upright", body: [0.6, 0.95, 0.6], leg: 0.32, head: 0.45, bill: "hook", wings: "feather", tail: "long", crest: true },
  owl: { plan: "upright", round: true, body: [1.0, 1.1, 0.9], leg: 0.22, head: 0.0, bill: "small", eyes: "big", ears: "tufts", wings: "feather" },
  raptor: { plan: "biped", body: [0.7, 0.75, 1.5], leg: 0.95, head: 0.6, snout: 0.45, tail: "long", claws: true, stripes: true },
  trex: { plan: "biped", body: [1.1, 1.05, 1.9], leg: 1.05, legW: 0.5, head: 1.15, snout: 0.6, tail: "long", tiny: true },
  piglet: { plan: "quad", round: true, body: [0.85, 0.72, 1.1], leg: 0.32, head: 0.6, roundHead: true, snout: 0.16, snoutC: "a", ears: "point", tail: "curl" },
  bunny: { plan: "quad", round: true, body: [0.7, 0.7, 0.95], leg: 0.32, head: 0.55, roundHead: true, ears: "long", tail: "puff", hop: true, nose: "#ff8fa6" },
  cat: { plan: "quad", body: [0.58, 0.55, 1.15], leg: 0.5, head: 0.55, roundHead: true, snout: 0.1, ears: "cat", tail: "curl", whiskers: true, nose: "#ff8fa6" },
  fox: { plan: "quad", body: [0.62, 0.55, 1.25], leg: 0.5, head: 0.55, snout: 0.36, snoutC: "a", ears: "big", tail: "bushy", nose: "#1d232a" },
  pony: { plan: "quad", body: [0.8, 0.8, 1.5], leg: 0.85, neck: 0.6, head: 0.5, snout: 0.4, ears: "point", tail: "hair", mane: true, hooves: "#2a1c12" },
  unicorn: { plan: "quad", body: [0.8, 0.8, 1.5], leg: 0.9, neck: 0.65, head: 0.5, snout: 0.4, ears: "point", tail: "rainbow", mane: "rainbow", horn: true, hooves: "#ffd84a" },
  deer: { plan: "quad", body: [0.6, 0.62, 1.25], leg: 0.9, neck: 0.5, head: 0.45, snout: 0.3, ears: "side", antlers: true, tail: "stub", spots: true, nose: "#1d232a" },
  stego: { plan: "quad", body: [1.0, 0.9, 1.7], leg: 0.5, legW: 0.34, head: 0.5, snout: 0.35, low: true, plates: true, tail: "spike" },
  trike: { plan: "quad", body: [1.1, 0.95, 1.7], leg: 0.55, legW: 0.36, head: 0.75, snout: 0.4, low: true, frill: true, tail: "thick" },
  goat: { plan: "quad", body: [0.6, 0.62, 1.1], leg: 0.55, head: 0.5, snout: 0.3, ears: "side", horns: "curl", beard: true, tail: "stub" },
};
const shiny = (c) => "#" + new THREE.Color(c).lerp(new THREE.Color("#ffffff"), 0.45).offsetHSL(0.06, 0.2, 0).getHexString();   // a Shiny's lighter, shifted coat
const RAINBOW = ["#ff6b6b", "#ffb84d", "#ffe66b", "#7ee08a", "#6bb8ff", "#b48cff"];
// (owner, 2026-11-09) a pet grows with its level but its rider stays the same size, so a big pet feels big
function sizePet(m, sc) { m.g.scale.setScalar(sc); if (m.rider) { m.rider.scale.setScalar(0.8 / sc); m.rider.position.y = m.seat - 0.52 / sc; m.top = m.seat * sc + 1.4; } else m.top *= sc; }
function petModel(sp, rider, va) {   // sp: a mount's kind, or { look, c, a, size } for the town's animals; va: 1 Shiny, 2 Golden
  let riderG = null;
  const s = typeof sp === "object" ? sp : World.MOUNTS[sp], L = LOOK[s.look || sp] || LOOK.pup, k = s.size, g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const legs = [], wings = [], tails = [], head = new THREE.Group();
  const C = va === 2 ? "#f6c53a" : va === 1 ? shiny(s.c) : s.c, A = va === 2 ? "#fff3b8" : va === 1 ? shiny(s.a) : s.a;
  let seat = 1, seatZ = -0.1 * k;
  const eyes = (hs, z, big) => { for (const ex of [-1, 1]) { if (big) { ball(hs * 0.2, "#ffffff", ex * hs * 0.24, hs * 0.08, z, head); ball(hs * 0.11, "#1d232a", ex * hs * 0.24, hs * 0.08, z + hs * 0.12, head); } else ball(hs * 0.09, "#1d232a", ex * hs * 0.26, hs * 0.12, z, head); } };
  const tail = (type, y, z) => {
    const t = new THREE.Group(); t.position.set(0, y, z); body.add(t); tails.push(t);
    if (type === "wag") { const m = box(0.14 * k, 0.14 * k, 0.5 * k, C, 0, 0.12 * k, -0.2 * k, t); m.rotation.x = 0.6; }
    else if (type === "curl") { strut(0.1 * k, 0.1 * k, C, 0, 0, 0.35 * k, -0.35 * k, t); strut(0.1 * k, 0.1 * k, C, 0.35 * k, -0.35 * k, 0.75 * k, -0.3 * k, t); }
    else if (type === "puff") ball(0.22 * k, "#ffffff", 0, 0, -0.05 * k, t);
    else if (type === "bushy") { ball(0.26 * k, C, 0, 0.05 * k, -0.45 * k, t, 1, 1, 2); ball(0.18 * k, A, 0, 0.08 * k, -0.95 * k, t, 1, 1, 1.4); }
    else if (type === "stub") ball(0.12 * k, A, 0, 0, -0.05 * k, t);
    else if (type === "hair" || type === "rainbow") { for (let i = 0; i < (type === "rainbow" ? 4 : 3); i++) { const m = box(0.12 * k, 0.9 * k, 0.12 * k, type === "rainbow" ? RAINBOW[i] : A, (i - 1) * 0.07 * k, -0.4 * k, -0.15 * k, t); m.rotation.x = 0.35; } }
    else if (type === "spike" || type === "thick" || type === "spade" || type === "long") {
      const t2 = new THREE.Group(); t2.position.set(0, -0.05 * k, -0.85 * k); t.add(t2); tails.push(t2);
      box(0.45 * k, 0.4 * k, 0.95 * k, C, 0, 0, -0.4 * k, t); box(0.28 * k, 0.26 * k, 0.95 * k, C, 0, 0, -0.4 * k, t2);
      if (type === "spike") for (const x of [-1, 1]) for (const zz of [-0.6, -0.85]) cone(0.06 * k, 0.45 * k, "#f4f1e6", x * 0.2 * k, 0.12 * k, zz * k, t2, 0, -x * 1.1);
      if (type === "spade") { const m = box(0.5 * k, 0.06, 0.4 * k, A, 0, 0, -0.95 * k, t2); m.rotation.y = Math.PI / 4; }
    }
    else if (type === "tuft") { const m = box(0.3 * k, 0.12 * k, 0.3 * k, C, 0, 0.12 * k, -0.1 * k, t); m.rotation.x = 0.5; }
    else if (type === "fire") for (const [x, c, l] of [[-0.18, "#ffd84a", 1.4], [0, "#e5534b", 1.8], [0.18, "#ffd84a", 1.4]]) { const f = box(0.14 * k, 0.05, l * k, c, x * k, 0, -l * 0.5 * k, t); f.rotation.x = -0.15; }
    else if (type === "long" && false) { /* biped handled above */ }
    return t;
  };
  if (L.plan === "quad") {
    const [bw0, bh0, bl0] = L.body, bw = bw0 * k, bh = bh0 * k, bl = bl0 * k, legH = L.leg * k, lw = (L.legW || 0.24) * k;
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const l = new THREE.Group(); l.position.set(lx * bw * 0.32, legH + (L.round ? bh * 0.2 : 0), lz * bl * 0.33); body.add(l); legs.push(l);
      const lh = legH + (L.round ? bh * 0.2 : 0); box(lw, lh, lw, L.socks || C, 0, -lh / 2, 0, l);
      if (L.hooves) box(lw * 1.1, 0.12 * k, lw * 1.1, L.hooves, 0, -lh + 0.06 * k, 0, l);
    }
    const by = legH + bh / 2;
    if (L.round) { ball(1, C, 0, by, 0, body, bw / 2, bh / 2, bl / 2); ball(1, A, 0, by - bh * 0.18, bl * 0.08, body, bw * 0.38, bh * 0.32, bl * 0.4); }
    else { box(bw, bh, bl, C, 0, by, 0, body); box(bw * 0.72, bh * 0.3, bl * 0.62, A, 0, legH + 0.05 * k, 0, body); }
    if (L.spots) for (const [x, y, z] of [[1, 0.25, 0.1], [1, 0.1, -0.25], [-1, 0.2, -0.05], [-1, 0.05, 0.3], [1, -0.05, 0.35]]) ball(0.07 * k, "#fff4e0", x * bw / 2, by + y * bh, z * bl, body);
    if (L.shell) { ball(1, A, 0, by + bh * 0.12, 0, body, bw * 0.56, bh * 0.62, bl * 0.56); for (const [x, z] of [[0, 0], [0.5, 0.45], [-0.5, 0.45], [0.5, -0.45], [-0.5, -0.45], [0, 0.85], [0, -0.85]]) ball(bw * 0.12, "#6b4f2a", x * bw * 0.28, by + bh * (0.62 - 0.12 * hyp(x, z)), z * bl * 0.25, body, 1, 0.35, 1); }   // (owner, 2026-11-09) a turtle's shell
    if (L.plates) for (let n = 0; n < 6; n++) { const p = box(0.08 * k, (0.45 + 0.2 * Math.sin((n / 5) * Math.PI)) * k, 0.4 * k, A, 0, by + bh / 2 + 0.15 * k, (n - 2.5) * bl * 0.17, body); p.rotation.y = Math.PI / 4; }
    if (L.spikes) for (let n = 0; n < 5; n++) cone(0.09 * k, 0.32 * k, L.spikes === "ice" ? "#e8f8ff" : A, 0, by + bh / 2 + 0.12 * k, (n - 2) * bl * 0.2, body);
    // neck and head
    const hs = L.head * k, front = bl / 2;
    let hy = by + bh * (L.low ? 0.0 : 0.35), hz = front + hs * 0.35;
    if (L.neck) { const ny = by + bh * 0.3, nz = front * 0.75; hy = ny + L.neck * k * 0.85; hz = nz + L.neck * k * 0.5; strut(hs * 0.7, hs * 0.75, C, ny, nz, hy, hz, body); }
    head.position.set(0, hy, hz); body.add(head);
    if (L.roundHead) ball(hs / 2, C, 0, 0, 0, head, 1.05, 0.95, 1); else box(hs, hs * 0.9, hs, C, 0, 0, 0, head);
    if (L.snout) box(hs * (L.snout > 0.45 ? 0.55 : 0.6), hs * 0.42, L.snout * k, L.snoutC === "a" ? A : C, 0, -hs * 0.18, hs / 2 + L.snout * k / 2 - 0.02, head);
    if (L.nose) ball(hs * 0.09, L.nose, 0, -hs * 0.05, hs / 2 + (L.snout || 0) * k, head);
    eyes(hs, hs * 0.48);
    const ear = (x, y, z, w, h, d, c) => box(w, h, d, c || C, x, y, z, head);
    if (L.ears === "flop") { ear(-hs * 0.55, -hs * 0.1, -hs * 0.05, 0.12 * k, hs * 0.75, hs * 0.38, A); ear(hs * 0.55, -hs * 0.1, -hs * 0.05, 0.12 * k, hs * 0.75, hs * 0.38, A); }
    else if (L.ears === "cat") for (const x of [-1, 1]) cone(0.12 * k, 0.3 * k, C, x * hs * 0.28, hs * 0.5, 0, head, 0, x * -0.2);
    else if (L.ears === "big") for (const x of [-1, 1]) { cone(0.16 * k, 0.42 * k, C, x * hs * 0.3, hs * 0.6, 0, head, 0, x * -0.15); cone(0.09 * k, 0.28 * k, "#1d232a", x * hs * 0.3, hs * 0.66, 0.04 * k, head, 0, x * -0.15); }
    else if (L.ears === "long") for (const x of [-1, 1]) { ear(x * hs * 0.2, hs * 0.85, -hs * 0.05, 0.16 * k, 0.85 * k, 0.1 * k); ear(x * hs * 0.2, hs * 0.85, -hs * 0.0, 0.09 * k, 0.65 * k, 0.11 * k, A); }
    else if (L.ears === "side") for (const x of [-1, 1]) { const e = ear(x * hs * 0.6, hs * 0.25, -hs * 0.1, 0.32 * k, 0.12 * k, 0.16 * k); e.rotation.z = x * 0.3; }
    else if (L.ears === "round") for (const x of [-1, 1]) ball(0.15 * k, C, x * hs * 0.36, hs * 0.42, -hs * 0.05, head);
    else if (L.ears === "point") for (const x of [-1, 1]) cone(0.08 * k, 0.26 * k, C, x * hs * 0.24, hs * 0.55, -hs * 0.15, head);
    if (L.whiskers) for (const x of [-1, 1]) for (const y of [-0.12, -0.22]) box(0.4 * k, 0.015, 0.015, "#ffffff", x * hs * 0.4, y * hs, hs * 0.48, head);
    if (L.horn) { const h = cone(0.08 * k, 0.7 * k, "#ffe9a8", 0, hs * 0.6, hs * 0.2, head, 0.45); h.position.y = hs * 0.75; }
    if (L.horns === "curl") for (const x of [-1, 1]) { strut(0.1 * k, 0.1 * k, A, hs * 0.45, -hs * 0.1, hs * 0.8, -hs * 0.45, head, x * hs * 0.25); strut(0.1 * k, 0.1 * k, A, hs * 0.8, -hs * 0.45, hs * 0.55, -hs * 0.75, head, x * hs * 0.3); }
    if (L.horns === "back") for (const x of [-1, 1]) cone(0.07 * k, 0.5 * k, L.spikes === "ice" ? "#e8f8ff" : A, x * hs * 0.28, hs * 0.55, -hs * 0.35, head, -1.0);
    if (L.antlers) for (const x of [-1, 1]) { strut(0.07 * k, 0.07 * k, "#c9a27e", hs * 0.4, 0, hs * 1.3, -hs * 0.2, head, x * hs * 0.35); strut(0.06 * k, 0.06 * k, "#c9a27e", hs * 1.0, -hs * 0.12, hs * 1.3, hs * 0.25, head, x * hs * 0.45); strut(0.06 * k, 0.06 * k, "#c9a27e", hs * 1.2, -hs * 0.18, hs * 1.55, -hs * 0.05, head, x * hs * 0.5); }
    if (L.beard) box(0.14 * k, 0.32 * k, 0.12 * k, "#ffffff", 0, -hs * 0.6, hs * 0.5, head);
    if (L.crest) for (let n = 0; n < 3; n++) cone(0.06 * k, 0.3 * k, "#e8f8ff", 0, hs * 0.5, -hs * 0.2 - n * 0.15 * k, head, -0.6);
    if (L.frill) { const f = box(hs * 1.9, hs * 1.4, 0.12 * k, A, 0, hs * 0.5, -hs * 0.55, head); f.rotation.x = -0.3; for (const [x, y] of [[-0.28, 0.55], [0.28, 0.55], [0, -0.05]]) cone(0.09 * k, 0.6 * k, "#f4f1e6", x * hs, y * hs, hs * 0.55, head, 1.2); }
    if (L.mane) { const nl = L.neck ? L.neck * k : 0.5 * k; for (let n = 0; n < 5; n++) { const c = L.mane === "rainbow" ? RAINBOW[n] : A; const t = n / 4; box(0.12 * k, 0.25 * k, 0.25 * k, c, 0, by + bh * 0.45 + (hy - by - bh * 0.45) * t + 0.15 * k, front * 0.7 + (hz - front * 0.7) * t - 0.15 * k, body); } box(0.14 * k, 0.15 * k, 0.25 * k, L.mane === "rainbow" ? RAINBOW[5] : A, 0, hs * 0.5, hs * 0.1, head); void nl; }
    if (L.tail !== "none") tail(L.tail, by + bh * 0.2, -bl / 2);
    if (L.wings) for (const x of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(x * bw / 2, by + bh * 0.4, bl * 0.1); body.add(w); wings.push(w);
      if (L.wings === "bat") { for (let n = 0; n < 3; n++) strut(0.08 * k, 0.08 * k, A, 0, 0, 0.1 * k, -n * 0.45 * k, w, x * (0.5 + n * 0.55) * k); box(1.9 * k, 0.05, 1.1 * k, A, x * 0.95 * k, 0, -0.4 * k, w); box(1.2 * k, 0.06, 0.6 * k, C, x * 0.6 * k, 0.01, -0.1 * k, w); }
      else { box(1.5 * k, 0.08, 0.7 * k, "#ffffff", x * 0.75 * k, 0, 0, w); box(1.1 * k, 0.09, 0.45 * k, A, x * 0.95 * k, 0.01, -0.3 * k, w); }
    }
    seat = legH + bh + (L.round ? 0 : 0) ; seatZ = L.neck ? -0.15 * k : -0.1 * k;
  } else if (L.plan === "upright" || L.plan === "bird") {
    const [bw0, bh0, bl0] = L.body, bw = bw0 * k, bh = bh0 * k, bl = bl0 * k, legH = L.leg * k, up = L.plan === "upright";
    for (const x of [-1, 1]) { const l = new THREE.Group(); l.position.set(x * bw * 0.25, legH, 0); body.add(l); legs.push(l); box(0.08 * k, legH, 0.08 * k, "#f08a24", 0, -legH / 2, 0, l); box(0.22 * k, 0.06 * k, 0.32 * k, "#f08a24", 0, -legH + 0.03, 0.08 * k, l); }
    const by = legH + bh / 2;
    if (L.round || up) ball(1, C, 0, by, 0, body, bw / 2, bh / 2, bl / 2); else box(bw, bh, bl, C, 0, by, 0, body);
    if (L.belly === "front") ball(1, A, 0, by - bh * 0.05, bl * 0.18, body, bw * 0.38, bh * 0.4, bl * 0.35);
    else ball(1, A, 0, by - bh * 0.15, up ? bl * 0.15 : 0, body, bw * 0.35, bh * 0.3, bl * 0.38);
    const hs = (L.head || 0.5) * k;
    let hy, hz;
    if (up) { hy = legH + bh * (L.head ? 1.0 : 0.72); hz = L.head ? bl * 0.08 : bl * 0.15; }
    else if (L.neck) { const ny = by + bh * 0.25, nz = bl * 0.4; hy = ny + L.neck * k * 0.85; hz = nz + L.neck * k * 0.45; strut(hs * 0.45, hs * 0.5, C, ny, nz, hy, hz, body); }
    else { hy = by + bh * 0.45; hz = bl * 0.45; }
    head.position.set(0, hy, hz); body.add(head);
    if (L.head) ball(hs / 2, C, 0, 0, 0, head);
    const face = L.head ? hs / 2 : bl / 2;
    if (L.eyes === "big") { for (const x of [-1, 1]) { ball(0.17 * k, "#ffffff", x * 0.2 * k, 0.05 * k, face * 0.85, head); ball(0.09 * k, "#ffb020", x * 0.2 * k, 0.05 * k, face * 0.85 + 0.1 * k, head); ball(0.05 * k, "#1d232a", x * 0.2 * k, 0.05 * k, face * 0.85 + 0.15 * k, head); } }
    else eyes(hs, face * 0.8);
    if (L.bill === "flat") box(hs * 0.55, hs * 0.14, hs * 0.55, "#f2a33a", 0, -hs * 0.1, face + hs * 0.2, head);
    else if (L.bill === "hook") { cone(hs * 0.16, hs * 0.4, "#f4e6c0", 0, -hs * 0.02, face + hs * 0.12, head, 1.9); }
    else if (L.bill === "long") { cone(hs * 0.13, 1.1 * k, "#e8c9a0", 0, -hs * 0.05, face + 0.5 * k, head, Math.PI / 2); }
    else if (L.bill === "point") cone(hs * 0.12, hs * 0.5, "#ffd84a", 0, -hs * 0.05, face + hs * 0.2, head, Math.PI / 2);
    else cone(0.07 * k, 0.2 * k, "#f2a33a", 0, -0.05 * k, face + 0.06 * k, head, Math.PI / 2);
    if (L.ears === "tufts") for (const x of [-1, 1]) cone(0.08 * k, 0.3 * k, A, x * 0.28 * k, (L.head ? hs * 0.5 : 0.35 * k), 0, head, 0, x * -0.3);
    if (L.crest === "back") { const c = box(0.08 * k, 0.5 * k, 0.9 * k, A, 0, hs * 0.3, -0.45 * k, head); c.rotation.x = 0.35; }
    else if (L.crest) for (let n = 0; n < 3; n++) { const c = box(0.06 * k, 0.4 * k, 0.12 * k, n === 1 ? A : C, 0, hs * 0.5 + 0.15 * k, -n * 0.1 * k, head); c.rotation.x = -0.4 - n * 0.2; }
    if (L.wings) for (const x of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(x * bw * 0.45, by + bh * (up ? 0.15 : 0.3), 0); body.add(w); wings.push(w);
      if (L.wings === "flipper") { const f = box(0.12 * k, bh * 0.6, 0.3 * k, C, x * 0.06 * k, -bh * 0.25, 0, w); f.rotation.z = x * 0.2; }
      else if (L.wings === "bat") { box(2.0 * k, 0.05, 0.9 * k, A, x * 1.0 * k, 0, -0.2 * k, w); for (let n = 0; n < 3; n++) strut(0.07 * k, 0.07 * k, C, 0, 0, 0.05 * k, -n * 0.4 * k, w, x * (0.6 + n * 0.6) * k); }
      else if (up) { const f = box(0.14 * k, bh * 0.7, bl * 0.75, A, x * 0.05 * k, -bh * 0.05, -bl * 0.05, w); f.rotation.x = -0.2; if (sp === "parrot") box(0.15 * k, bh * 0.3, bl * 0.5, "#3a8ee6", x * 0.06 * k, -bh * 0.35, -bl * 0.1, w); }
      else { box(1.4 * k, 0.07, 0.65 * k, A, x * 0.7 * k, 0, 0, w); box(0.9 * k, 0.08, 0.4 * k, "#e5534b", x * 1.0 * k, 0.01, -0.25 * k, w); }
    }
    if (L.tail === "long") { const t = new THREE.Group(); t.position.set(0, by - bh * 0.3, -bl * 0.35); body.add(t); tails.push(t); for (const [x, c] of [[-0.06, "#e5534b"], [0.06, "#3a8ee6"]]) { const f = box(0.1 * k, 0.05, 1.0 * k, c, x * k, -0.25 * k, -0.4 * k, t); f.rotation.x = 0.55; } }
    else if (L.tail && L.tail !== "none") tail(L.tail, by + bh * 0.1, -bl / 2);
    seat = up ? legH + bh * 0.95 : legH + bh; seatZ = up ? -bl * 0.35 : -0.1 * k;
  } else if (L.plan === "biped") {
    const [bw0, bh0, bl0] = L.body, bw = bw0 * k, bh = bh0 * k, bl = bl0 * k, legH = L.leg * k, lw = (L.legW || 0.32) * k;
    for (const x of [-1, 1]) { const l = new THREE.Group(); l.position.set(x * bw * 0.32, legH, -bl * 0.1); body.add(l); legs.push(l); box(lw, legH * 0.6, lw * 1.2, C, 0, -legH * 0.3, 0.05 * k, l); box(lw * 0.7, legH * 0.5, lw * 0.7, C, 0, -legH * 0.72, -0.08 * k, l); box(lw * 1.1, 0.1 * k, lw * 1.6, A, 0, -legH + 0.05, 0.12 * k, l); if (L.claws) cone(0.06 * k, 0.25 * k, "#f4f1e6", x * 0.06 * k, -legH + 0.22 * k, 0.2 * k, l, 0.6); }
    const by = legH + bh / 2;
    const b = box(bw, bh, bl, C, 0, by, 0, body); b.rotation.x = -0.12;
    box(bw * 0.7, bh * 0.35, bl * 0.6, A, 0, by - bh * 0.35, 0.05 * k, body);
    if (L.stripes) for (let n = 0; n < 3; n++) box(bw * 1.02, bh * 0.12, 0.1 * k, "#3a4a1a", 0, by + bh * 0.25, (n - 1) * 0.35 * k, body);
    const hs = L.head * k;
    head.position.set(0, by + bh * 0.55 + hs * 0.1, bl / 2 + hs * 0.25); body.add(head);
    box(hs * 0.8, hs * 0.75, hs * 1.0, C, 0, 0, 0, head); box(hs * 0.7, hs * 0.3, hs * 0.75, A, 0, -hs * 0.4, hs * 0.2, head);
    box(hs * 0.65, hs * 0.38, L.snout * k, C, 0, -hs * 0.02, hs * 0.5 + L.snout * k / 2, head);
    for (let t = -1; t <= 1; t += 0.5) box(0.05 * k, 0.12 * k, 0.05 * k, "#ffffff", t * hs * 0.28, -hs * 0.24, hs * 0.5 + L.snout * k * 0.8, head);
    eyes(hs, hs * 0.51);
    if (sp === "raptor") for (let n = 0; n < 3; n++) { const f = box(0.06 * k, 0.32 * k, 0.12 * k, "#e5534b", 0, hs * 0.45, -n * 0.12 * k, head); f.rotation.x = -0.5; }
    for (const x of [-1, 1]) box(0.11 * k, (L.tiny ? 0.3 : 0.45) * k, 0.11 * k, C, x * bw * 0.48, by - bh * 0.05, bl * 0.42, body);
    tail("long", by + bh * 0.1, -bl / 2);
    seat = legH + bh; seatZ = -0.2 * k;
  } else {   // butterfly
    const legH = 0.6 * k, bh = 0.38 * k, bl = 1.5 * k, bw = 0.4 * k;
    box(bw, bh, bl, "#2b2b35", 0, legH + bh / 2, 0, body);
    head.position.set(0, legH + bh / 2, bl / 2 + 0.2 * k); body.add(head); ball(0.22 * k, "#2b2b35", 0, 0, 0, head); eyes(0.45 * k, 0.18 * k);
    for (const x of [-1, 1]) { const a = box(0.04 * k, 0.6 * k, 0.04 * k, "#1d232a", x * 0.1 * k, 0.3 * k, 0.05 * k, head); a.rotation.z = -x * 0.4; ball(0.06 * k, "#1d232a", x * 0.22 * k, 0.58 * k, 0.05 * k, head); }
    for (const x of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(x * bw / 2, legH + bh / 2, 0); body.add(w); wings.push(w);
      box(1.7 * k, 0.05, 1.3 * k, C, x * 0.85 * k, 0, 0.35 * k, w); ball(0.25 * k, A, x * 1.1 * k, 0.03, 0.45 * k, w, 1, 0.2, 1); box(1.2 * k, 0.05, 1.0 * k, s.c2, x * 0.6 * k, 0, -0.6 * k, w);
    }
    seat = legH + bh;
  }
  let top = seat;
  if (rider) {   // the courier, seated (a little smaller): hips just above the pet's back
    const r = courierModel(rider, true); r.g.scale.setScalar(0.8); r.g.position.set(0, seat - 0.52, seatZ); body.add(r.g); top = seat + 1.4; riderG = r.g;
  }
  return { g, body, legs, wings, head, tails, k, top, seat, rider: riderG, butterfly: L.plan === "butterfly", fly: s.ab === "glide", hop: !!L.hop, plan: L.plan };
}
function animatePet(m, t, moving, speed, airborne) {
  const f = 6 + speed * 0.5, sw = moving && !airborne ? Math.sin(t * f) * 0.6 : 0;
  m.legs.forEach((l, i) => (l.rotation.x = airborne ? 0.6 : m.hop ? -Math.abs(sw) : m.legs.length === 2 ? (i ? sw : -sw) : (i === 0 || i === 3 ? sw : -sw)));
  m.body.position.y = airborne ? Math.sin(t * 3) * 0.25 : moving ? Math.abs(Math.sin(t * f)) * (m.hop ? 0.35 : 0.12) * m.k : (m.butterfly ? 0.3 + Math.sin(t * 3) * 0.1 : Math.sin(t * 2) * 0.02);
  if (m.plan === "upright" && moving && !airborne) m.body.rotation.z = Math.sin(t * f) * 0.08; else m.body.rotation.z = 0;   // a waddle
  const flap = m.butterfly ? 0.25 + Math.sin(t * (airborne ? 14 : 5)) * 0.7 : m.fly ? 0.15 + Math.sin(t * (airborne ? 9 : 3)) * (airborne ? 0.6 : 0.25) : 0.1 + Math.sin(t * (moving ? 12 : 3)) * 0.2;
  for (const [i, w] of m.wings.entries()) w.rotation.z = (i ? -1 : 1) * flap;
  m.tails.forEach((tl, i) => (tl.rotation.y = Math.sin(t * 4 - i * 0.8) * 0.35));
  m.head.rotation.y = Math.sin(t * 0.7) * 0.12;
}
// pet portraits for the menus, drawn once per species
const portraitR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); portraitR.setSize(168, 168);
const pScene = new THREE.Scene(); pScene.add(new THREE.HemisphereLight("#ffffff", "#9a8f80", 1.3)); const pl = new THREE.DirectionalLight("#ffffff", 1); pl.position.set(3, 5, 4); pScene.add(pl);
const pCam = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
const PORTRAITS = {};
function portrait(sp, va = 0) {
  const key = sp + va; if (PORTRAITS[key]) return PORTRAITS[key];
  const m = petModel(sp, null, va); m.g.rotation.y = 0.7; pScene.add(m.g);
  const L = LOOK[sp] || {}, k = World.MOUNTS[sp].size, wide = L.wings === "bat" || L.wings === "feather" && L.plan === "quad" || L.plan === "butterfly" ? 1.35 : 1, tall = (L.neck || 0) + (L.leg || 0.5) > 1.5 ? 1.3 : 1;
  pCam.position.set(0, 2.4 * k * wide * tall, 5.6 * k * wide * tall); pCam.lookAt(0, 1.0 * k * tall, 0);
  portraitR.render(pScene, pCam); pScene.remove(m.g);
  return (PORTRAITS[key] = portraitR.domElement.toDataURL());
}



// ---- the town's animals ----
function gooseModel(sky) {
  const g = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group(), wings = [], legs = [], W = sky ? "#cfe6ff" : "#ffffff"; g.add(body);
  ball(0.42, W, 0, 0.66, 0, body, 0.85, 0.8, 1.3); cone(0.2, 0.5, W, 0, 0.74, -0.62, body, -1.2);
  strut(0.17, 0.17, W, 0.8, 0.36, 1.36, 0.56, body); head.position.set(0, 1.42, 0.6); body.add(head);
  ball(0.18, W, 0, 0, 0, head); cone(0.09, 0.34, "#f08a24", 0, -0.02, 0.26, head, Math.PI / 2); for (const x of [-1, 1]) ball(0.035, "#1d232a", x * 0.11, 0.06, 0.12, head);
  for (const x of [-1, 1]) { const w = new THREE.Group(); w.position.set(x * 0.34, 0.8, 0); body.add(w); wings.push(w); box(0.08, 0.36, 0.78, sky ? "#9db8e0" : "#e8eef2", x * 0.04, -0.12, -0.05, w);
    const l = new THREE.Group(); l.position.set(x * 0.15, 0.34, 0); body.add(l); legs.push(l); box(0.07, 0.34, 0.07, "#f08a24", 0, -0.17, 0, l); box(0.2, 0.05, 0.26, "#f08a24", 0, -0.32, 0.06, l); }
  const slot = new THREE.Group(); slot.position.set(0, -0.05, 0.5); head.add(slot);
  return { g, body, head, wings, legs, slot };
}
function buildAnimals() {
  const DOG_C = [["#8a5a34", "#e9d6b8"], ["#3d4650", "#cfd6dd"], ["#d9a55a", "#fff4e0"]];
  for (const d of World.dogs) { const [c, a] = DOG_C[d.look], m = petModel({ look: "pup", c, a, size: 0.8 }); m.g.position.set(d.hx, d.y, d.hz); scene.add(m.g); blobUnder(m.g, 1.6);
    const bang = textSprite("!", { size: 64, color: "#ffffff", bg: "#e5534b" }); bang.position.y = 2.3; bang.visible = false; m.g.add(bang); dogMesh.push({ m, bang, x: d.hx, z: d.hz, yaw: 0, tx: d.hx, tz: d.hz, tyaw: 0, mode: 0, y: d.y, ty: d.y }); }
  for (const q of World.geese) { const m = gooseModel(); m.g.position.set(q.x, q.y, q.z); scene.add(m.g); blobUnder(m.g, 1.2); gooseMesh.push({ m, x: q.x, y: q.y, z: q.z, yaw: 0, tx: q.x, ty: q.y, tz: q.z, tyaw: 0, mode: 0, carry: -1, box: null }); }
  for (const q of World.goats) { const m = petModel({ look: "goat", c: "#e9e4dc", a: "#8a7a66", size: 0.95 }); m.g.position.set(q.hx, q.y, q.hz); scene.add(m.g); blobUnder(m.g, 1.7); goatMesh.push({ m, x: q.hx, z: q.hz, yaw: Math.PI / 2, tx: q.hx, tz: q.hz, tyaw: Math.PI / 2, mode: 0, y: q.y }); }
}
// a parcel: its tier's color, taped; modifiers show on it
function parcelMesh(tier, mod) {
  const g = new THREE.Group(), s = mod === "heavy" ? 0.92 : 0.72, c = mod === "golden" ? "#ffd23a" : TIERS[tier].c;
  const b = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color: c, emissive: mod === "golden" ? "#a06a00" : "#000000" })); b.scale.setScalar(s); b.position.y = s / 2; b.castShadow = true; g.add(b);
  box(s * 1.02, s * 0.16, s * 1.02, "#fff8e6", 0, s / 2, 0, g, false); box(s * 0.16, s * 1.02, s * 1.02, "#fff8e6", 0, s / 2, 0, g, false);
  if (mod === "fragile") box(s * 1.04, s * 0.3, s * 0.5, "#e5534b", 0, s * 0.8, 0, g, false);
  if (mod === "express") box(s * 0.5, s * 1.04, s * 0.3, "#3a8ee6", 0, s / 2, s * 0.2, g, false);
  if (mod === "heavy") for (const x of [-1, 1]) box(s * 0.12, s * 1.04, s * 1.04, "#3d4650", x * s * 0.36, s / 2, 0, g, false);
  g.userData.s = s; return g;
}

// ---- little bits that fly: confetti, sparkles, dust, splinters ----
const PN = 900, pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.35), new THREE.MeshBasicMaterial(), PN), parts = [], pDummy = new THREE.Object3D(), pCol = new THREE.Color();
pMesh.frustumCulled = false; pMesh.count = 0; scene.add(pMesh);
function emit(x, y, z, n, { colors = ["#ffffff"], speed = 4, up = 4, life = 0.9, size = 0.16, grav = 12, spread = 0.3 } = {}) {
  for (let k = 0; k < n && parts.length < PN; k++) { const a = Math.random() * TAU, v = speed * (0.4 + Math.random() * 0.6);
    parts.push({ x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, z: z + (Math.random() - 0.5) * spread, vx: Math.cos(a) * v, vy: up * (0.5 + Math.random() * 0.8), vz: Math.sin(a) * v, t: 0, life: life * (0.6 + Math.random() * 0.6), size: size * (0.7 + Math.random() * 0.6), grav, c: pick(colors), r: Math.random() * 6 }); }
}
function stepParts(dt) {
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += dt; if (p.t >= p.life) { parts.splice(i, 1); continue; } p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
  for (const p of parts) { const k = 1 - p.t / p.life; pDummy.position.set(p.x, p.y, p.z); pDummy.rotation.set(p.r + p.t * 7, p.r * 2 + p.t * 5, 0); pDummy.scale.setScalar(p.size * (0.4 + 0.6 * k)); pDummy.updateMatrix(); pMesh.setMatrixAt(n, pDummy.matrix); pMesh.setColorAt(n, pCol.set(p.c)); n++; }
  pMesh.count = n; pMesh.instanceMatrix.needsUpdate = true; if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
}
const CONFETTI = ["#ff6b6b", "#ffd84a", "#7ee08a", "#6bb8ff", "#b48cff", "#ffffff"];
// ground marks that warn before something lands (a falling rock, a diving sky goose): a dark circle that closes in
const marks = [];
function groundMark(x, y, z, r, s, color, then) { const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 28).rotateX(-Math.PI / 2), basic(color, 0.8)), f = new THREE.Mesh(new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2), basic(color, 0.3)); m.position.set(x, y + 0.12, z); f.position.set(x, y + 0.1, z); scene.add(m, f); marks.push({ m, f, t: 0, s, then, x, y, z }); }
function stepMarks(dt) { for (let i = marks.length - 1; i >= 0; i--) { const k = marks[i]; k.t += dt; const u = clamp(k.t / k.s, 0, 1); k.f.scale.setScalar(0.2 + 0.8 * u); if (k.t >= k.s) { scene.remove(k.m, k.f); marks.splice(i, 1); if (k.then) k.then(k); } } }

// ---- sound: every effect is made here from tones and noise (no files); music is a small looping tune ----
let AC = null, sfxGain = null, musGain = null, noiseBuf = null;
function audio() {
  if (AC) return AC; const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null;
  AC = new Ctx(); sfxGain = AC.createGain(); musGain = AC.createGain(); sfxGain.connect(AC.destination); musGain.connect(AC.destination); setVolumes();
  noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startMusic(); return AC;
}
function setVolumes() { if (!AC) return; sfxGain.gain.value = (save.set.sfx / 10) * 0.5; musGain.gain.value = (save.set.music / 10) * 0.16; }
function tone(f0, f1, dur, { type = "sine", vol = 0.5, at = 0 } = {}) { if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + at; o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.02); }
function noise(dur, { vol = 0.4, freq = 1200, q = 0.8, at = 0, type = "bandpass", to = 0 } = {}) { if (!AC) return; const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), t = AC.currentTime + at; s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.setValueAtTime(freq, t); if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur); f.Q.value = q; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + 0.02); }
const SFX = {
  pop: () => tone(520, 880, 0.09, { type: "triangle" }), grab: () => { tone(330, 660, 0.1, { type: "square", vol: 0.25 }); tone(660, 990, 0.12, { at: 0.07, type: "triangle" }); },
  whistle: () => { tone(1500, 2300, 0.16, { vol: 0.3 }); tone(2300, 1700, 0.2, { at: 0.16, vol: 0.3 }); }, boost: () => { noise(0.5, { freq: 500, to: 3200, vol: 0.35 }); tone(220, 880, 0.4, { type: "sawtooth", vol: 0.18 }); },
  bark: () => { for (const a of [0, 0.16]) { tone(420, 180, 0.11, { type: "sawtooth", vol: 0.4, at: a }); noise(0.09, { freq: 900, vol: 0.25, at: a }); } }, growl: () => tone(140, 90, 0.4, { type: "sawtooth", vol: 0.3 }),
  crack: () => { noise(0.12, { freq: 2600, vol: 0.6 }); tone(300, 90, 0.15, { type: "square", vol: 0.3 }); }, smash: () => { noise(0.45, { freq: 1800, to: 300, vol: 0.7 }); tone(200, 50, 0.4, { type: "sawtooth", vol: 0.4 }); },
  stun: () => { for (let k = 0; k < 4; k++) tone(900 - k * 90, 1300 - k * 90, 0.12, { at: k * 0.1, vol: 0.2, type: "triangle" }); }, swish: () => noise(0.16, { freq: 700, to: 2600, vol: 0.4 }),
  kick: () => { noise(0.1, { freq: 300, vol: 0.9, type: "lowpass" }); tone(180, 60, 0.18, { type: "square", vol: 0.5 }); }, honk: () => { tone(330, 300, 0.16, { type: "sawtooth", vol: 0.35 }); tone(300, 250, 0.22, { type: "sawtooth", vol: 0.35, at: 0.18 }); },
  busted: () => { for (const [k, f] of [523, 659, 784, 1047].entries()) tone(f, f, 0.14, { at: k * 0.08, type: "square", vol: 0.25 }); }, deliver: () => { for (const [k, f] of [523, 659, 784, 1047, 1319].entries()) tone(f, f, 0.16, { at: k * 0.06, type: "triangle", vol: 0.4 }); },
  coin: () => { tone(1320, 1320, 0.06, { type: "square", vol: 0.15 }); tone(1760, 1760, 0.12, { at: 0.06, type: "square", vol: 0.15 }); }, tick: () => tone(880, 880, 0.03, { type: "square", vol: 0.12 }),
  win: (n) => { const base = [392, 440, 523, 659, 784][n]; for (let k = 0; k < 2 + n; k++) tone(base * [1, 1.25, 1.5, 2, 2.5, 3][k], base * [1, 1.25, 1.5, 2, 2.5, 3][k], 0.22, { at: k * 0.09, type: n >= 3 ? "sawtooth" : "triangle", vol: 0.3 }); },
  near: () => { tone(880, 440, 0.5, { type: "triangle", vol: 0.3 }); }, egg: () => { tone(660, 1320, 0.2, { type: "sine", vol: 0.4 }); tone(1320, 1760, 0.25, { at: 0.18, vol: 0.3 }); },
  wobble: () => tone(300, 380, 0.12, { type: "triangle", vol: 0.35 }), hatch: () => { noise(0.2, { freq: 3000, vol: 0.5 }); for (const [k, f] of [659, 784, 988, 1319].entries()) tone(f, f, 0.2, { at: 0.1 + k * 0.09, type: "triangle", vol: 0.35 }); },
  level: () => { for (const [k, f] of [440, 554, 659, 880, 1109].entries()) tone(f, f * 1.01, 0.18, { at: k * 0.07, type: "square", vol: 0.22 }); }, buy: () => { tone(988, 988, 0.08, { type: "square", vol: 0.2 }); tone(1319, 1319, 0.2, { at: 0.08, type: "square", vol: 0.2 }); },
  cannon: () => { noise(0.8, { freq: 200, to: 60, vol: 1, type: "lowpass" }); tone(120, 40, 0.7, { type: "sawtooth", vol: 0.5 }); noise(1.6, { freq: 900, to: 2400, vol: 0.2, at: 0.2 }); },
  zip: () => noise(1.2, { freq: 1800, to: 2600, vol: 0.18, q: 6 }), pipe: () => { tone(500, 120, 0.5, { type: "sine", vol: 0.4 }); noise(0.5, { freq: 400, vol: 0.2, type: "lowpass" }); }, pad: () => tone(260, 1040, 0.3, { type: "triangle", vol: 0.4 }),
  hiss: () => noise(0.5, { freq: 5200, vol: 0.12, q: 0.5 }), rock: () => { noise(0.4, { freq: 240, vol: 0.9, type: "lowpass" }); tone(110, 40, 0.3, { type: "square", vol: 0.4 }); }, stomp: () => { for (const a of [0, 0.22, 0.44]) noise(0.08, { freq: 180, vol: 0.6, type: "lowpass", at: a }); },
  wind: () => noise(2.4, { freq: 500, to: 900, vol: 0.14, q: 1.5 }), shake: () => { for (const a of [0, 0.07, 0.14]) tone(700, 500, 0.05, { type: "square", vol: 0.15, at: a }); }, no: () => tone(200, 150, 0.18, { type: "square", vol: 0.2 }), shiny: () => { for (let k = 0; k < 6; k++) tone(1200 + k * 220, 1300 + k * 220, 0.14, { at: k * 0.05, vol: 0.18 }); },
  jump: () => tone(300, 520, 0.1, { type: "triangle", vol: 0.18 }), dash: () => noise(0.25, { freq: 900, to: 3000, vol: 0.3 }), steal: () => { tone(700, 300, 0.25, { type: "sawtooth", vol: 0.3 }); },
};
const sfx = (k, a) => { if (AC && SFX[k]) SFX[k](a); };
function startMusic() {   // a bouncy two-bar loop
  const tune = [523, 0, 659, 784, 0, 659, 523, 0, 587, 0, 698, 880, 0, 698, 587, 0], bass = [131, 131, 196, 196, 147, 147, 196, 196], step = 0.21; let n = 0, next = AC.currentTime + 0.2;
  setInterval(() => { if (!AC || AC.state !== "running") return; while (next < AC.currentTime + 0.5) {
    const f = tune[n % tune.length]; if (f) { const o = AC.createOscillator(), g = AC.createGain(); o.type = "triangle"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, next); g.gain.linearRampToValueAtTime(0.5, next + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, next + step * 0.95); o.connect(g); g.connect(musGain); o.start(next); o.stop(next + step); }
    if (n % 2 === 0) { const o = AC.createOscillator(), g = AC.createGain(); o.type = "sine"; o.frequency.value = bass[(n / 2) % bass.length]; g.gain.setValueAtTime(0.6, next); g.gain.exponentialRampToValueAtTime(0.0001, next + step * 1.8); o.connect(g); g.connect(musGain); o.start(next); o.stop(next + step * 2); }
    n++; next += step; } }, 200);
}
addEventListener("pointerdown", () => { const a = audio(); if (a && a.state === "suspended") a.resume(); }, { capture: true });
addEventListener("keydown", () => { const a = audio(); if (a && a.state === "suspended") a.resume(); }, { capture: true });

// ---- the courier's data (the server's copy; this page only shows it) and me ----
let save = World.cleanData({});
const riding = () => save.mounts.find((m) => m.id === save.ride) || save.mounts[0];
const myStats = () => { const m = riding(); return World.mountStats(m.sp, m.lv); };
const me = { x: World.SPAWN.x, y: 0, z: World.SPAWN.z, yaw: Math.PI / 2, vx: 0, vz: 0, vy: 0, px: 0, pz: 0, ground: true, moving: false, foot: false, footT: 0, stun: 0, grace: 0, jumps: 0, boost: 0, dash: 0, abilityAt: -99, kickAt: -99, kickT: 0, transit: null, armed: true, mx: 0, my: 0, mz: 0, myaw: 0, hidden: false, glide: false, stepT: 0 };
let mine = null, walker = null, myTag = null, myParcel = null, parcel = null, stolenBy = -1, dropped = null, belt = { ready: null, next: null };
function makeTag(name, rank, lv) { return textSprite(String(name || "Courier").slice(0, 18), { size: 34, badge: rank ? World.RANK_C[rank] : "", glow: lv >= World.MAX_LV ? "#ffd84a" : "" }); }
function rigMount(sp, lv, va, shirt, name, rank) {   // a mount with its rider, name tag and (hidden) walking courier
  const m = petModel(MOUNTS[sp] ? sp : "pup", shirt, va); sizePet(m, World.mountScale(lv)); const tag = makeTag(name, rank, lv); tag.position.y = (m.top + 0.9) / m.g.scale.x; tag.scale.multiplyScalar(1 / m.g.scale.x); m.g.add(tag);
  const w = courierModel(shirt); w.g.visible = false; scene.add(w.g); scene.add(m.g); blobUnder(m.g, 2.2 * (m.k || 1)); blobUnder(w.g, 1.1);
  const slot = new THREE.Group(); slot.position.set(0, m.seat + 0.02, -0.75 * m.k); slot.scale.setScalar(1 / m.g.scale.x); m.body.add(slot);
  return { m, tag, w, slot, sc: m.g.scale.x, va, lv };
}
function unrig(r) { if (!r) return; scene.remove(r.m.g, r.w.g); }
function setCarry(r, c) { r.slot.clear(); if (c) r.slot.add(parcelMesh(c[0], c[1])); }
function remount() { unrig(mine); const q = riding(); mine = rigMount(q.sp, q.lv, q.va, save.set.shirt, myName, World.rankOf(World.upTotal(save.up))); setCarry(mine, parcel ? [parcel.tier, parcel.mod] : null); }

// ---- moving ----
const keys = new Set(), joy = { id: null, x: 0, y: 0, ox: 0, oy: 0 }, cam = { yaw: -Math.PI / 2, pitch: 0.42, dist: 12, shake: 0 };
let jumpHeld = false, jumpTap = false, hitStop = 0;
const GRAV = 24, now = () => performance.now() / 1000;
let clockOff = 0; const srvNow = () => (Date.now() + clockOff) / 1000;
const heavy = () => parcel && parcel.mod === "heavy";
function tryJump() {
  if (me.stun > 0 || me.transit) return; const st = myStats(), q = riding(), ab = MOUNTS[q.sp].ab, tier = World.abilityTier(q.lv);
  if (me.ground) { me.vy = me.foot ? 7.5 : st.jump; me.ground = false; me.jumps = 0; sfx("jump"); emit(me.x, me.y + 0.1, me.z, 5, { colors: ["#e9e2d2"], speed: 2, up: 1, life: 0.4, grav: 2 }); }
  else if (!me.foot && ab === "jump2" && tier && me.jumps < (tier >= 3 ? 2 : 1)) { me.vy = st.jump * (tier >= 2 ? 1.1 : 0.95); me.jumps++; sfx("jump"); emit(me.x, me.y, me.z, 10, { colors: ["#ffffff", "#bfe6ff"], speed: 3, up: 0.5, life: 0.5, grav: 0 }); }
}
function useAbility() {
  if (me.stun > 0 || me.transit || me.foot) return; const q = riding(), ab = MOUNTS[q.sp].ab, tier = World.abilityTier(q.lv), t = now(); if (!tier) { sfx("no"); return; }
  if (ab === "jump2") { tryJump(); return; }
  if (t < me.abilityAt + World.ABILITY_CD[ab][tier]) return; me.abilityAt = t;
  if (ab === "dash") { me.dash = 0.32 + 0.06 * tier; sfx("dash"); cam.shake = Math.max(cam.shake, 0.15); }
  else { netSend({ t: "ability" }); sfx("bark"); }
}
function doKick() { const t = now(); if (me.stun > 0 || me.transit || t < me.kickAt + World.KICK.cd) return; me.kickAt = t; me.kickT = 0.28; netSend({ t: "kick" }); sfx("swish"); }
function doWhistle() {
  sfx("whistle"); if (me.stun > 0 || me.transit) return;
  if (me.foot) { me.foot = false; me.footT = 0; mine.m.g.visible = true; emit(me.x, me.y + 0.3, me.z, 14, { colors: ["#e9e2d2", "#ffffff"], speed: 4, up: 1.5, life: 0.5, grav: 3 }); me.vy = 4; me.ground = false; }
  else me.hop = 0.3;
}
function arc(bx, by, bz, T, H, k) { me.transit = { k: "arc", ax: me.x, ay: me.y, az: me.z, bx, by, bz, T, H, t: 0, kind: k }; me.vx = me.vz = me.vy = me.px = me.pz = 0; me.dash = 0; }
function stepTransit(dt) {
  const tr = me.transit;
  if (tr.k === "arc") { tr.t += dt; const u = clamp(tr.t / tr.T, 0, 1); me.x = lerp(tr.ax, tr.bx, u); me.z = lerp(tr.az, tr.bz, u); me.y = lerp(tr.ay, tr.by, u) + 4 * tr.H * u * (1 - u); me.yaw = Math.atan2(tr.bx - tr.ax, tr.bz - tr.az);
    if (tr.kind === "cannon") emit(me.x, me.y + 0.5, me.z, 2, { colors: ["#ffffff", "#9aa8ff", "#ffd84a"], speed: 1.5, up: 0, life: 0.9, grav: 0, size: 0.3 });
    if (u >= 1) { me.transit = null; me.ground = true; me.armed = false; emit(me.x, me.y + 0.2, me.z, 16, { colors: ["#e9e2d2", "#ffffff"], speed: 5, up: 2, life: 0.5, grav: 6 }); cam.shake = Math.max(cam.shake, tr.kind === "cannon" ? 0.5 : 0.15); } }
  else if (tr.k === "zip") { tr.t += dt * World.ZIP_SPEED / tr.len; const u = clamp(tr.t, 0, 1); me.x = lerp(tr.ax, tr.bx, u); me.z = lerp(tr.az, tr.bz, u); me.y = lerp(tr.ay, tr.by, u) + 0.4; me.yaw = Math.atan2(tr.bx - tr.ax, tr.bz - tr.az);
    if (Math.random() < 0.5) emit(me.x, me.y + 2.6, me.z, 1, { colors: ["#ffd84a", "#ffffff"], speed: 1, up: 0, life: 0.3, grav: 4, size: 0.1 });
    if (u >= 1) { me.transit = null; me.y = tr.by; me.ground = true; me.armed = false; } }
  else if (tr.k === "pipe") { if (now() >= tr.until) { me.transit = null; me.hidden = false; me.x = tr.x; me.y = tr.y; me.z = tr.z; me.ground = true; me.armed = false; sfx("pop"); emit(me.x, me.y + 0.6, me.z, 18, { colors: ["#5fb56b", "#ffffff"], speed: 4, up: 4, life: 0.6 }); } }
  me.moving = true;
}
function stepMe(dt) {
  const t = now();
  if (me.stun > 0) { me.stun -= dt; if (me.stun <= 0) { me.stun = 0; me.footT = 2.2; } }
  if (me.transit) { stepTransit(dt); return; }
  const st = myStats(), q = riding();
  if (World.blocked(me.x, me.z, me.y)) out: for (let r = 1; r < 16; r++) for (let k = 0; k < 12; k++) { const x = me.x + Math.cos((k / 12) * TAU) * r, z = me.z + Math.sin((k / 12) * TAU) * r; if (!World.blocked(x, z, me.y) && World.surfaceAt(x, z, me.y + 0.5) > -1e9) { me.x = x; me.z = z; break out; } }   // inside something solid (it shouldn't happen): out to the nearest clear spot
  // what the player's asking for, relative to the camera
  let ix = 0, iz = 0;
  if (!chatting && !panelOpen()) { if (keys.has("KeyW") || keys.has("ArrowUp")) iz += 1; if (keys.has("KeyS") || keys.has("ArrowDown")) iz -= 1; if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1; if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1; }
  ix += joy.x; iz -= joy.y; const il = hyp(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  let mx = -Math.sin(cam.yaw) * iz + Math.cos(cam.yaw) * ix, mz = -Math.cos(cam.yaw) * iz - Math.sin(cam.yaw) * ix;
  if (me.stun > 0) mx = mz = 0;
  const kind = me.ground ? World.groundKind(me.x, me.z, me.y) : "", mud = kind === "mud" && !World.inPond(me.x, me.z, me.y) ? World.MUD_SLOW : kind === "mud" ? 0.6 : 1;
  if (me.boost > 0) me.boost -= dt; if (me.dash > 0) me.dash -= dt;
  let speed = me.foot ? 5.5 : st.speed * (heavy() ? World.HEAVY_SLOW : 1) * mud * (me.dash > 0 ? 2.4 : me.boost > 0 ? 1.6 : 1);
  if (me.dash > 0 && hyp(mx, mz) < 0.1) { mx = Math.sin(me.yaw); mz = Math.cos(me.yaw); }
  const acc = (me.ground ? 70 : 26) * dt, tvx = mx * speed, tvz = mz * speed;
  me.vx += clamp(tvx - me.vx, -acc, acc); me.vz += clamp(tvz - me.vz, -acc, acc);
  me.moving = hyp(me.vx, me.vz) > 0.6;
  if (hyp(mx, mz) > 0.08) me.yaw += angDiff(Math.atan2(mx, mz), me.yaw) * Math.min(1, 12 * dt);
  // jumping, gliding, falling
  if (jumpTap) { jumpTap = false; tryJump(); }
  me.vy -= GRAV * dt;
  // sprinklers shove you sideways; wind pushes across the islands
  const sn = srvNow();
  for (const s of World.sprinklers) { const d = hyp(me.x - s.x, me.z - s.z); if (d < World.SPRINKLER.r && Math.abs(me.y - s.y) < 2 && World.sprinklerOn(s, sn)) { const k = World.SPRINKLER.push * dt * 3 / Math.max(d, 0.6); me.px += (me.x - s.x) * k; me.pz += (me.z - s.z) * k; } }
  if (me.x > World.ISLE_X && me.y > World.SKY_Y) { const w = World.windAt(sn); if (w.on) { me.px += w.x * World.WIND.push * dt * 3; me.pz += w.z * World.WIND.push * dt * 3; } }
  const pl = hyp(me.px, me.pz); if (pl > 16) { me.px *= 16 / pl; me.pz *= 16 / pl; } const dec = Math.exp(-3.2 * dt); me.px *= dec; me.pz *= dec;
  // sideways, stopping at walls
  const dx = (me.vx + me.px) * dt, dz = (me.vz + me.pz) * dt;
  if (!World.blocked(me.x + dx, me.z, me.y)) me.x += dx; else { me.vx = 0; me.px = 0; }
  if (!World.blocked(me.x, me.z + dz, me.y)) me.z += dz; else { me.vz = 0; me.pz = 0; }
  // down (or up a step) onto the ground
  const was = me.ground, y0 = me.y; me.y += me.vy * dt;
  if (World.wallAt(me.x, me.z, me.y) && !World.wallAt(me.x, me.z, y0)) me.y = y0;   // never down into something solid
  const s = World.surfaceAt(me.x, me.z, Math.max(y0, me.y) + (was ? 0.1 : 0));   // the ground under where this step began, so a fast fall can't pass through it
  if (s > -1e9 && me.vy <= 0 && (me.y <= s || (was && me.y - s < 0.45))) { if (!was && me.vy < -9) { emit(me.x, s + 0.1, me.z, 8, { colors: ["#e9e2d2"], speed: 3, up: 1, life: 0.4, grav: 3 }); } me.y = s; me.vy = 0; me.ground = true; me.jumps = 0; }
  else me.ground = false;
  if (me.y < -45) { me.x = World.SPAWN.x; me.z = World.SPAWN.z; me.y = 0; me.vy = 0; }   // nothing below the town (the server sets you back on an island)
  // off the mount after a stun: on foot until the mount's back under you (it comes on its own, or at a whistle)
  if (me.foot && me.stun <= 0) { me.footT -= dt; if (me.footT <= 0 || hyp(me.x - me.mx, me.z - me.mz) < 1.4) doWhistle(); }
  if (!me.armed && !nearTrigger()) me.armed = true;
  if (me.stun <= 0) triggers(t);
  if ((me.boost > 0 || me.dash > 0) && me.moving) emit(me.x - Math.sin(me.yaw) * 1.4, me.y + 1, me.z - Math.cos(me.yaw) * 1.4, 1, { colors: ["#ffffff", "#ffd84a"], speed: 1, up: 0.3, life: 0.3, grav: 0, size: 0.16, spread: 1.4 });   // speed streaks
  // footsteps: dust; a level-20 mount leaves sparkles, a Shiny or Golden one a trail
  if (me.ground && me.moving) { me.stepT -= dt; if (me.stepT <= 0) { me.stepT = 0.16; trail(me.x, me.y, me.z, q, kind); } }
}
function trail(x, y, z, q, kind) {
  if (q.va === 2) emit(x, y + 0.5, z, 2, { colors: ["#ffd84a", "#fff3b8"], speed: 0.8, up: 1.2, life: 0.8, grav: -1, size: 0.14 });
  else if (q.va === 1) emit(x, y + 0.5, z, 2, { colors: ["#bfe6ff", "#ffffff", "#ffc7f0"], speed: 0.8, up: 1.2, life: 0.8, grav: -1, size: 0.12 });
  if (q.lv >= World.MAX_LV) emit(x, y + 0.1, z, 2, { colors: ["#ffd84a", "#ffffff"], speed: 1.2, up: 1.5, life: 0.6, grav: 2, size: 0.12 });
  else if (kind === "mud") emit(x, y + 0.1, z, 2, { colors: ["#6b4d33"], speed: 1.5, up: 2, life: 0.4, grav: 9, size: 0.14 });
  else if (Math.random() < 0.4) emit(x, y + 0.1, z, 1, { colors: ["#e9e2d2"], speed: 0.6, up: 0.8, life: 0.35, grav: 1, size: 0.12 });
}
// the conveyor runs round all four sides of the counter: your Ready parcel rides it, your Next one just behind
const BELT_H = World.PO.counter - 0.65, BELT_L = 8 * BELT_H, BELT_GAP = 2.6; let beltLag = 0;
function beltPos(s) { s = ((s % BELT_L) + BELT_L) % BELT_L; const k = Math.floor(s / (2 * BELT_H)), u = s - k * 2 * BELT_H - BELT_H, P = World.PO; return k === 0 ? { x: P.x + u, z: P.z + BELT_H } : k === 1 ? { x: P.x + BELT_H, z: P.z - u } : k === 2 ? { x: P.x - u, z: P.z - BELT_H } : { x: P.x - BELT_H, z: P.z + u }; }
const beltS = () => now() * 1.1 + BELT_H, readyAt = () => beltPos(beltS() - beltLag);
const near = (o, r, dy = 1.6) => hyp(me.x - o.x, me.z - o.z) < r && Math.abs(me.y - o.y) < dy;
function nearTrigger() { return World.zips.some((z) => near(z, 2.6) || near({ x: z.tx, z: z.tz, y: z.ty }, 2.6)) || near(World.PIPE.a, World.PIPE.r + 1) || near(World.PIPE.b, World.PIPE.r + 1) || World.pads.some((p) => near(p, 2.4) || near({ x: p.tx, z: p.tz, y: p.ty }, 2.4)) || World.balloons.some((b) => near(b, 4.2)); }
let askAt = 0, shakeAt = 0;
function triggers(t) {
  if (belt.ready && !parcel && stolenBy < 0 && !dropped && hyp(me.x - readyAt().x, me.z - readyAt().z) < 3.3 && Math.abs(me.y) < 2 && t > askAt) { askAt = t + 0.4; netSend({ t: "grab" }); }
  for (const b of World.boosts) if (near(b, 2) && me.boost < 2) { if (me.boost <= 0) { sfx("boost"); cam.shake = Math.max(cam.shake, 0.12); } me.boost = 2.5; }
  if (parcel && t > shakeAt) for (const h of World.houses) if (h.id !== parcel.house && hyp(me.x - h.mx, me.z - h.mz) < World.DELIVER_R - 0.6 && Math.abs(me.y - h.my) < 2) { shakeAt = t + 1.2; houseMesh[h.id].shake = 0.5; sfx("shake"); break; }   // the wrong mailbox shakes its head
  if (!me.armed) return;
  for (const z of World.zips) if (near(z, 1.5)) { if (heavy()) { if (t > askAt) { askAt = t + 1; sfx("no"); } } else { const len = hyp(z.tx - z.x, z.ty - z.y, z.tz - z.z); me.transit = { k: "zip", ax: z.x, ay: z.y, az: z.z, bx: z.tx, by: z.ty, bz: z.tz, len, t: 0 }; me.vx = me.vz = me.vy = 0; sfx("zip"); } return; }
  const C = World.CANNON; if (near(C, C.r)) { const I = World.ISLES[C.to]; arc(I.x - 9, I.y, I.z, 3.2, 27, "cannon"); sfx("cannon"); cam.shake = 0.9; banner("SKY CANNON!", "#9aa8ff"); emit(C.x, C.y + 1, C.z, 40, { colors: ["#ffffff", "#c9ced6"], speed: 9, up: 5, life: 0.9, grav: 2, size: 0.4 }); return; }
  for (const p of World.pads) if (near(p, 1.7)) { arc(p.tx, p.ty, p.tz, 1.1 + hyp(p.tx - p.x, p.tz - p.z) / 70, 9, "pad"); sfx("pad"); return; }
  if ((near(World.PIPE.a, World.PIPE.r - 0.3) || near(World.PIPE.b, World.PIPE.r - 0.3)) && t > askAt) { askAt = t + 1; netSend({ t: "pipe" }); return; }
  if (World.balloons.some((b) => near(b, 3)) && t > askAt) { askAt = t + 1.5; netSend({ t: "balloon" }); }
}

// ---- the camera: behind and above; drag to look round, pinch or wheel to zoom ----
const camPos = new THREE.Vector3(), camAt = new THREE.Vector3(me.x, 2, me.z);
function stepCamera(dt) {
  const sc = mine ? mine.sc : 1, ty = me.y + 1.5 + 0.9 * sc; camAt.x = me.x; camAt.z = me.z; camAt.y += (ty - camAt.y) * Math.min(1, 10 * dt);
  const cp = Math.cos(cam.pitch), ux = Math.sin(cam.yaw) * cp, uy = Math.sin(cam.pitch), uz = Math.cos(cam.yaw) * cp;
  let d = cam.dist * (0.75 + 0.25 * sc); for (let k = 1.5; k < d; k += 0.7) if (World.wallAt(camAt.x + ux * k, camAt.z + uz * k, camAt.y + uy * k - 1)) { d = Math.max(1.5, k - 0.7); break; }   // nothing solid between you and the camera
  cam.d = cam.d === undefined || d < cam.d ? d : cam.d + (d - cam.d) * Math.min(1, 4 * dt); d = cam.d;
  camPos.set(camAt.x + ux * d, camAt.y + uy * d, camAt.z + uz * d);
  const g = World.surfaceAt(camPos.x, camPos.z, camPos.y + 1.5); if (g > -1e9 && camPos.y < g + 0.7) camPos.y = g + 0.7;
  if (cam.shake > 0) { cam.shake = Math.max(0, cam.shake - dt * 1.6); const k = cam.shake * 0.6; camPos.x += (Math.random() - 0.5) * k; camPos.y += (Math.random() - 0.5) * k; camPos.z += (Math.random() - 0.5) * k; }
  const fov = 60 + (me.boost > 0 ? 9 : 0) + (me.dash > 0 ? 13 : 0) + (me.transit && me.transit.k !== "pipe" ? 11 : 0); if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, 8 * dt); camera.updateProjectionMatrix(); }
  camera.position.copy(camPos); camera.lookAt(camAt);
  sun.position.set(me.x + 60, me.y + 110, me.z + 40); sun.target.position.set(me.x, me.y, me.z);
}
const drags = new Map(); let pinch = 0, tapStart = null;
const joyEl = $("joy"), knob = $("knob");
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (e.pointerType === "touch" && joy.id === null && e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.35) { joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0; joyEl.style.display = "block"; joyEl.style.left = e.clientX - 60 + "px"; joyEl.style.top = e.clientY - 60 + "px"; knob.style.transform = ""; return; }
  drags.set(e.pointerId, { x: e.clientX, y: e.clientY }); tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (drags.size === 2) { const [a, b] = [...drags.values()]; pinch = hyp(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId === joy.id) { let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = hyp(dx, dy), R = 52; if (l > R) { dx *= R / l; dy *= R / l; } joy.x = dx / R; joy.y = dy / R; knob.style.transform = `translate(${dx}px, ${dy}px)`; return; }
  const d = drags.get(e.pointerId); if (!d) return;
  if (drags.size === 2) { const o = { x: e.clientX, y: e.clientY }; drags.set(e.pointerId, o); const [a, b] = [...drags.values()], p = hyp(a.x - b.x, a.y - b.y); if (pinch) cam.dist = clamp(cam.dist * (pinch / p), 5, 26); pinch = p; return; }
  cam.yaw -= (e.clientX - d.x) * 0.006; cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * 0.005, -0.15, 1.35); d.x = e.clientX; d.y = e.clientY;
});
const endPointer = (e) => {
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyEl.style.display = "none"; return; }
  if (drags.delete(e.pointerId) && tapStart && performance.now() - tapStart.t < 300 && hyp(e.clientX - tapStart.x, e.clientY - tapStart.y) < 8) tapAt(e.clientX, e.clientY);
  pinch = 0;
};
canvas.addEventListener("pointerup", endPointer); canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("wheel", (e) => { cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), 5, 26); e.preventDefault(); }, { passive: false });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
  if (e.code === "Enter") { openChat(); e.preventDefault(); return; }
  if (e.code === "Escape") { closePanel(); closeRoll(); return; }
  if (e.repeat) return; keys.add(e.code);
  if (e.code === "Space") { jumpHeld = true; jumpTap = true; e.preventDefault(); }
  if (e.code === "KeyF") doKick(); if (e.code === "KeyQ") doWhistle(); if (e.code === "KeyE" || e.code === "ShiftLeft") useAbility();
});
addEventListener("keyup", (e) => { keys.delete(e.code); if (e.code === "Space") jumpHeld = false; });
addEventListener("blur", () => { keys.clear(); jumpHeld = false; });
function press(id, down, up) { const b = $(id); b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); down(); }); if (up) for (const k of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(k, up); }
press("bkick", doKick); press("bwhistle", doWhistle); press("bability", useAbility); press("bjump", () => { jumpHeld = true; jumpTap = true; }, () => { jumpHeld = false; });

// ---- words and numbers that pop up: floating numbers (they rise and fade in 0.8 s), banners, toasts ----
const pops = [], V = new THREE.Vector3();
function toScreen(x, y, z) { V.set(x, y, z).project(camera); return { x: (V.x * 0.5 + 0.5) * innerWidth, y: (-V.y * 0.5 + 0.5) * innerHeight, front: V.z < 1 }; }
function popup(text, color, x, y, z, big) { const d = el("div", "pop" + (big ? " big" : ""), text); d.style.color = color || "#ffffff"; $("pops").appendChild(d); pops.push({ d, x, y, z, t: 0, life: big ? 1.2 : 0.8 }); }
function stepPops(dt) { for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; if (p.t >= p.life) { p.d.remove(); pops.splice(i, 1); continue; } const s = toScreen(p.x, p.y + p.t * 1.6, p.z), k = p.t / p.life; p.d.style.transform = `translate(-50%, -50%) translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) scale(${(k < 0.15 ? 0.6 + k * 4 : 1.2 - k * 0.2).toFixed(2)})`; p.d.style.opacity = s.front ? String(Math.min(1, 2.5 * (1 - k))) : "0"; } }
let bannerT = 0;
function banner(text, color, sub) { const b = $("banner"); b.firstChild.textContent = text; b.lastChild.textContent = sub || ""; b.style.color = color || "#ffffff"; b.classList.remove("go"); void b.offsetWidth; b.classList.add("go"); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove("go"), 1500); }
function toast(txt, color) { const d = el("div", "", txt); if (color) d.style.color = color; $("toast").appendChild(d); setTimeout(() => d.remove(), 1900); }
function flash(color) { const f = $("flash"); f.style.background = color; f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
function flyCoins(x, y, z, n) {   // coins fly from the mailbox to the counter on the HUD
  const from = toScreen(x, y, z), to = $("coins").getBoundingClientRect();
  for (let k = 0; k < Math.min(n, 10); k++) { const c = el("div", "flycoin"); c.style.left = from.x + "px"; c.style.top = from.y + "px"; $("pops").appendChild(c);
    c.animate([{ transform: "translate(-50%,-50%) scale(1)", offset: 0 }, { transform: `translate(${(Math.random() - 0.5) * 160}px, ${-60 - Math.random() * 80}px) scale(1.2)`, offset: 0.35 }, { transform: `translate(${to.left + 18 - from.x}px, ${to.top + 16 - from.y}px) scale(0.6)`, offset: 1 }], { duration: 650 + k * 60, easing: "ease-in", delay: k * 45 }).onfinish = () => { c.remove(); sfx("coin"); $("coins").classList.remove("bump"); void $("coins").offsetWidth; $("coins").classList.add("bump"); }; }
}

// ---- the reward roll: a slot over the mailbox spins for a second and a half, then lands ----
// (owner, 2026-11-11) the reward roll is on the screen, big: the reel spins and slows for 2.6 s, lands, then a card shows
// what you got and stays until you close it (or grab your next parcel)
let roll = null, gift = null;
function startRoll(h, res, lvUp) { heldCoins = res.coins; roll = { h, res, lvUp, t: 0, last: -1, n: 0, next: 0 }; $("roll").style.display = "flex"; $("reel").style.display = "block"; $("reel").className = "disp"; $("rcard").style.display = "none"; }
function closeRoll() { if (roll && !roll.done) return; roll = null; $("roll").style.display = "none"; if (gift) { const g = gift; gift = null; selMount = g.id; hatchShow("gift", g); } }   // then a new mount, if one came
$("rok").onclick = closeRoll;
function stepRoll(dt) {
  if (!roll) return; roll.t += dt; const r = $("reel"), R = roll.res, c = RARITY_C[R.tier], h = roll.h;
  if (roll.t < 2.6) {
    const tease = R.near && roll.t > 1.9;   // a near miss hangs on Legendary before it lets go
    if (tease) { if (roll.last !== 4) { sfx("near"); roll.last = 4; r.textContent = RARITY[4]; r.style.color = r.style.borderColor = RARITY_C[4]; r.className = "disp tease"; } }
    else if (roll.t >= roll.next) { roll.next = roll.t + 0.05 + roll.t * roll.t * 0.045; roll.n = (roll.n + 1) % 5; roll.last = roll.n; sfx("tick"); r.textContent = RARITY[roll.n]; r.style.color = r.style.borderColor = RARITY_C[roll.n]; r.className = "disp"; void r.offsetWidth; r.className = "disp flip"; }
  } else if (!roll.done) {
    roll.done = true; heldCoins = 0; r.textContent = RARITY[R.tier]; r.style.color = r.style.borderColor = c; r.className = "disp land"; sfx("win", R.tier); flash(c); cam.shake = Math.max(cam.shake, 0.2 + 0.15 * R.tier);
    emit(h.mx, h.my + 2.6, h.mz, 14 + R.tier * 16, { colors: [c, "#ffffff"], speed: 4 + R.tier * 1.5, up: 5, life: 1 + R.tier * 0.2, size: 0.18 }); emit(me.x, me.y + 2.5, me.z, 10 + R.tier * 14, { colors: [c, "#ffffff"], speed: 5 + R.tier, up: 6, life: 1.2, size: 0.18 });
    hudDirty = true; if (panel === "stable" || panel === "odds") renderPanel();
  } else if (!roll.shown && roll.t > 3.5) {
    roll.shown = true; r.style.display = "none"; const card = $("rcard"), list = $("rlist"); card.style.display = "flex"; card.style.setProperty("--rc", c); $("rtitle").textContent = RARITY[R.tier]; $("rtitle").style.background = c; $("rtitle").style.color = R.tier ? "#ffffff" : "#23303b"; list.innerHTML = "";
    const row = (icon, text, delay, snd) => { const d = el("div", "rrow"); d.appendChild(icon); d.appendChild(el("b", "disp", text)); d.style.animationDelay = delay + "ms"; list.appendChild(d); setTimeout(() => { if (roll && roll.res === R) sfx(snd); }, delay); };
    let dl = 150; row(el("i", "coin"), "+" + fmt(R.coins), dl, "coin"); flyCoins(me.x, me.y + 2, me.z, 3 + R.tier * 2);
    if (R.xp) row(el("i", "ixp", "XP"), "+" + R.xp, (dl += 350), "tick");
    if (R.coupons) row(el("i", "icoupon"), "+" + R.coupons + " Level Coupon" + (R.coupons > 1 ? "s" : ""), (dl += 350), "buy");
    if (R.egg) { const e = el("i", "egg"); e.style.background = EGGS[R.egg].c; row(e, EGGS[R.egg].name, (dl += 450), "egg"); $("mstable").classList.remove("bump"); void $("mstable").offsetWidth; $("mstable").classList.add("bump"); }
    if (roll.lvUp) setTimeout(levelFx, dl + 500);
  }
}
function levelFx() { sfx("level"); popup("LEVEL UP!", "#ffd84a", me.x, me.y + 3.2, me.z, true); for (let k = 0; k < 28; k++) { const a = (k / 28) * TAU; parts.length < PN && parts.push({ x: me.x, y: me.y + 0.3, z: me.z, vx: Math.cos(a) * 6, vy: 2.5, vz: Math.sin(a) * 6, t: 0, life: 0.8, size: 0.2, grav: 3, c: k % 2 ? "#ffd84a" : "#ffffff", r: k }); } }

// ---- the HUD ----
let hudDirty = true, shownCoins = 0, heldCoins = 0, cardKey = "", myName = "", myRole = "player", myId = null, loggedIn = false;
const cdBtn = (id, left, total) => { const b = $(id), k = total > 0 ? clamp(left / total, 0, 1) : 0; b.style.setProperty("--cd", (k * 360).toFixed(0) + "deg"); b.classList.toggle("cool", k > 0); };
function hud(dt) {
  // coins count up to what the server says
  const coinsNow = save.coins - heldCoins;   // the roll's coins wait for the roll to land
  if (shownCoins !== coinsNow) { const d = coinsNow - shownCoins; shownCoins = Math.abs(d) < 1 ? coinsNow : shownCoins + d * Math.min(1, dt * 8); $("coinn").textContent = fmt(Math.round(shownCoins)); }
  const t = now(), q = riding(), ab = MOUNTS[q.sp].ab, tier = World.abilityTier(q.lv);
  cdBtn("bkick", me.kickAt + World.KICK.cd - t, World.KICK.cd);
  cdBtn("bability", tier && World.ABILITY_CD[ab][tier] ? me.abilityAt + World.ABILITY_CD[ab][tier] - t : 0, tier ? World.ABILITY_CD[ab][tier] : 0);
  const P = parcel || stolen;
  const key = P ? [P.tier, P.mod, P.dur, P.max, P.house, !!parcel, !!dropped].join() : "";
  if (key !== cardKey) {
    cardKey = key; const c = $("card"); c.style.display = P ? "flex" : "none";
    if (P) { const T = TIERS[P.tier]; $("ctier").textContent = T.name; $("ctier").style.background = P.mod === "golden" ? "#ffd23a" : T.c; c.classList.toggle("gone", !parcel);
      $("cmods").innerHTML = ""; if (P.mod) { const m = el("span", "mod " + P.mod, MODS[P.mod].name); $("cmods").appendChild(m); }
      $("cpips").innerHTML = ""; for (let k = 0; k < P.max; k++) $("cpips").appendChild(el("i", k < P.dur ? "on" : ""));
      $("caddr").textContent = World.houses[P.house].name; }
  }
  if (P && P.mod === "express") { const left = Math.max(0, (P.due - (Date.now() + clockOff)) / 1000); $("ctimer").style.display = "block"; $("ctimer").textContent = left.toFixed(1); $("ctimer").classList.toggle("late", left <= 5); } else $("ctimer").style.display = "none";
  // the way there: the arrow on the ground round you, and how far on the card
  const g = stolenBy >= 0 ? gooseMesh[stolenBy] : null, tg = parcel ? (() => { const h = World.houses[parcel.house]; return { x: h.mx, y: h.my, z: h.mz, c: POI }; })() : dropped ? { x: dropped.x, y: dropped.y, z: dropped.z, c: "#ffd84a" } : g ? { x: g.x, y: g.y, z: g.z, c: "#ff3b30" } : null;
  stepArrow(t, tg); if (tg) $("cdist").textContent = Math.round(hyp(tg.x - me.x, tg.z - me.z, tg.y - me.y)) + " m";
  if (!hudDirty) return; hudDirty = false;
  $("stampn").textContent = save.stamp; $("stampfill").style.height = clamp(save.stamp, 0, 100) + "%";
  const ba = $("bability"); ba.firstChild.textContent = World.ABILITY[ab]; ba.classList.toggle("locked", !tier); ba.dataset.tier = tier;
}

// ---- menus: Stable, Upgrades, Odds, Settings (and the staff panel) ----
let panel = "", selMount = 0, adminList = [], adminSel = null, adminData = null, adminQ = "";
const panelOpen = () => !!panel;
function openPanel(k) { panel = panel === k ? "" : k; $("panel").style.display = panel ? "flex" : "none"; if (panel) { if (k === "stable") selMount = save.ride; if (k === "admin") netSend({ t: "admin", op: "list", q: adminQ }); renderPanel(); } keys.clear(); }
function closePanel() { panel = ""; $("panel").style.display = "none"; }
const btn = (text, fn, cls) => { const b = el("button", "btn " + (cls || ""), text); b.onclick = fn; return b; };
const coinBtn = (cost, fn, ok) => { const b = el("button", "btn buy"); b.appendChild(el("i", "coin")); b.appendChild(document.createTextNode(fmt(cost))); b.disabled = !ok; b.onclick = fn; return b; };
const mountName = (m) => (World.VARIANTS[m.va] ? World.VARIANTS[m.va] + " " : "") + MOUNTS[m.sp].name;
const pct = (v) => (v >= 0.1 ? (v * 100).toFixed(0) : v >= 0.01 ? (v * 100).toFixed(1) : (v * 100).toFixed(2)) + "%";
function oddsRow(odds) { const r = el("div", "odds"); odds.forEach((v, n) => { if (v > 0) { const s = el("span", "", pct(v)); s.style.color = RARITY_C[n] === "#ffffff" ? "#6f7d8a" : RARITY_C[n]; s.title = RARITY[n]; r.appendChild(s); } }); return r; }
function renderPanel() {
  const body = $("pbody"); body.innerHTML = ""; body.className = "p-" + panel; $("ptitle").textContent = { stable: "Stable", up: "Upgrades", odds: "Odds", set: "Settings", admin: "Admin" }[panel] || "";
  if (panel === "stable") {
    const grid = el("div", "mgrid"), list = [...save.mounts].sort((a, b) => MOUNTS[b.sp].r - MOUNTS[a.sp].r || b.lv - a.lv || a.id - b.id);
    for (const m of list) { const t = el("button", "mtile" + (m.id === selMount ? " sel" : "") + (m.id === save.ride ? " ride" : "") + (m.va ? " va" + m.va : "")); t.style.borderColor = RARITY_C[MOUNTS[m.sp].r] === "#ffffff" ? "#d7e1ea" : RARITY_C[MOUNTS[m.sp].r]; t.title = mountName(m);
      const im = el("img"); im.src = portrait(m.sp, m.va); im.alt = ""; t.appendChild(im); t.appendChild(el("b", "", m.lv)); t.onclick = () => { selMount = m.id; renderPanel(); }; grid.appendChild(t); }
    const m = save.mounts.find((k) => k.id === selMount) || riding(), S = World.mountStats(m.sp, m.lv), M = MOUNTS[m.sp], tier = World.abilityTier(m.lv), d = el("div", "mdetail");
    const im = el("img", "big"); im.src = portrait(m.sp, m.va); im.alt = ""; d.appendChild(im);
    const info = el("div", "minfo"); info.appendChild(el("h3", "", mountName(m))); const rr = el("div", "rar", RARITY[M.r]); rr.style.color = RARITY_C[M.r] === "#ffffff" ? "#6f7d8a" : RARITY_C[M.r]; info.appendChild(rr);
    const lv = el("div", "lvrow"); lv.appendChild(el("span", "", "Level " + m.lv)); const bar = el("div", "bar"), fill = el("i"); fill.style.width = (m.lv >= World.MAX_LV ? 100 : (m.xp / World.xpNeed(m.lv)) * 100) + "%"; bar.appendChild(fill); lv.appendChild(bar); info.appendChild(lv);
    for (const [name, v, max] of [["Speed", S.speed, 16], ["Jump", S.jump, 11], ["Grip", S.grip * 100, 60]]) { const r = el("div", "stat"); r.appendChild(el("span", "", name)); const b = el("div", "bar"), f = el("i"); f.style.width = clamp((v / max) * 100, 4, 100) + "%"; b.appendChild(f); r.appendChild(b); r.appendChild(el("em", "", name === "Grip" ? Math.round(v) + "%" : v.toFixed(1))); info.appendChild(r); }
    const ar = el("div", "stat ab" + (tier ? "" : " off")); ar.appendChild(el("span", "", World.ABILITY[M.ab])); const pp = el("div", "pips"); for (const need of [5, 10, 20]) pp.appendChild(el("i", m.lv >= need ? "on" : "", need)); ar.appendChild(pp); info.appendChild(ar);
    const acts = el("div", "acts"); if (m.id !== save.ride) acts.appendChild(btn("Ride", () => netSend({ t: "equip", id: m.id }), "go"));
    if (m.lv < World.MAX_LV) { acts.appendChild(coinBtn(World.levelCost(m.lv), () => netSend({ t: "level", id: m.id }), save.coins >= World.levelCost(m.lv))); const cb = btn("Coupon " + save.coupons, () => netSend({ t: "coupon", id: m.id }), "coupon"); cb.disabled = save.coupons < 1; acts.appendChild(cb); }
    info.appendChild(acts); d.appendChild(info);
    const eggs = el("div", "eggs"); for (const k of Object.keys(EGGS)) { const E = EGGS[k], c = el("div", "eggc"), e = el("i", "egg"); e.style.background = E.c; c.appendChild(e); c.appendChild(el("b", "", E.name)); c.appendChild(oddsRow(E.odds)); const hb = btn("Hatch " + save.eggs[k], () => netSend({ t: "hatch", kind: k }), "go"); hb.disabled = save.eggs[k] < 1 || save.mounts.length >= World.MOUNT_CAP; c.appendChild(hb); eggs.appendChild(c); }
    body.appendChild(d); body.appendChild(eggs); body.appendChild(grid);
  } else if (panel === "up") {
    const total = World.upTotal(save.up), rk = World.rankOf(total), head = el("div", "rank"); const bd = el("i", "badge"); bd.style.background = rk ? World.RANK_C[rk] : "#d7e1ea"; head.appendChild(bd); head.appendChild(el("b", "", rk ? World.RANKS[rk] + " Postmaster" : "Postmaster")); head.appendChild(el("span", "", total + " / 50")); body.appendChild(head);
    const val = { routes: (l) => World.DISTRICTS[World.districtsOpen(l) - 1], payout: (l) => "+" + l * 10 + "%", stamps: (l) => pct(World.rollOdds(World.stampLuck(l))[4]), press: (l) => "+" + l + "%", boxes: (l) => World.boxDur(l) + " durability" };
    for (const k of Object.keys(UPGRADES)) { const l = save.up[k], r = el("div", "uprow"); r.appendChild(el("b", "", UPGRADES[k].name)); const pp = el("div", "pips"); for (let n = 0; n < World.UP_MAX; n++) pp.appendChild(el("i", n < l ? "on" : "")); r.appendChild(pp); r.appendChild(el("span", "val", val[k](l) + (l < World.UP_MAX && val[k](l + 1) !== val[k](l) ? " → " + val[k](l + 1) : "")));
      if (l < World.UP_MAX) r.appendChild(coinBtn(World.upgradeCost(k, l), () => netSend({ t: "upgrade", k }), save.coins >= World.upgradeCost(k, l))); else r.appendChild(el("span", "max", "MAX")); body.appendChild(r); }
  } else if (panel === "odds") {
    const head = el("div", "orow head"); head.appendChild(el("b", "", "")); const hr = el("div", "odds"); RARITY.forEach((n, i) => { const s = el("span", "", n); s.style.color = RARITY_C[i] === "#ffffff" ? "#6f7d8a" : RARITY_C[i]; hr.appendChild(s); }); head.appendChild(hr); body.appendChild(head);
    const open = World.districtsOpen(save.up.routes), sw = World.spawnWeights(save.up.routes);
    TIERS.forEach((T, n) => { const r = el("div", "orow" + (n < open ? "" : " off")); const b = el("b", "", T.name); b.style.color = T.c; r.appendChild(b); const full = el("div", "odds"); World.rollOdds(T.luck + World.stampLuck(save.up.stamps)).forEach((v, i) => { const s = el("span", "", pct(v)); s.style.color = RARITY_C[i] === "#ffffff" ? "#6f7d8a" : RARITY_C[i]; full.appendChild(s); }); r.appendChild(full); r.appendChild(el("em", "", "x" + T.mult + " · " + pct(sw[n]))); body.appendChild(r); });
    const st = el("div", "orow"); st.appendChild(el("b", "", "Stamp Meter")); st.appendChild(el("em", "", save.stamp + " · " + World.PITY_RARE + " Rare · " + World.PITY_EPIC + " Epic")); body.appendChild(st);
    for (const k of Object.keys(MODS)) { const r = el("div", "orow"); r.appendChild(el("span", "mod " + k, MODS[k].name)); r.appendChild(el("em", "", "+" + MODS[k].bonus * 100 + "%")); body.appendChild(r); }
    for (const k of Object.keys(EGGS)) { const r = el("div", "orow"); r.appendChild(el("b", "", EGGS[k].name)); const full = el("div", "odds"); EGGS[k].odds.forEach((v, i) => { const s = el("span", "", v ? pct(v) : "–"); s.style.color = RARITY_C[i] === "#ffffff" ? "#6f7d8a" : RARITY_C[i]; full.appendChild(s); }); r.appendChild(full); body.appendChild(r); }
    const vr = el("div", "orow"); vr.appendChild(el("b", "", "Shiny")); vr.appendChild(el("em", "", "1 / 100")); body.appendChild(vr); const gr = el("div", "orow"); gr.appendChild(el("b", "", "Golden")); gr.appendChild(el("em", "", "1 / 1,000")); body.appendChild(gr);
  } else if (panel === "set") {
    const row = (name, node) => { const r = el("label", "setrow"); r.appendChild(el("span", "", name)); r.appendChild(node); body.appendChild(r); };
    const fr = el("input"); fr.type = "checkbox"; fr.checked = save.set.friendly; fr.onchange = () => { save.set.friendly = fr.checked; netSend({ t: "set", friendly: fr.checked }); }; row("Friendly", fr);
    for (const [k, name] of [["music", "Music"], ["sfx", "SFX"]]) { const s = el("input"); s.type = "range"; s.min = 0; s.max = 10; s.value = save.set[k]; s.oninput = () => { save.set[k] = +s.value; setVolumes(); }; s.onchange = () => { netSend({ t: "set", [k]: +s.value }); if (k === "sfx") sfx("coin"); }; row(name, s); }
    const sw = el("div", "swatches"); for (const c of ["#f2a33a", "#3a8ee6", "#e5534b", "#3fb36b", "#a352e0", "#2bb3c0", "#ff8fb8", "#3d4650"]) { const b = el("button", c === save.set.shirt ? "on" : ""); b.style.background = c; b.onclick = () => { save.set.shirt = c; netSend({ t: "set", shirt: c }); remount(); renderPanel(); }; sw.appendChild(b); } row("Shirt", sw);
    const acts = el("div", "acts"); if (myRole === "admin" || myRole === "moderator") acts.appendChild(btn("Admin", () => openPanel("admin")));
    acts.appendChild(btn("Log out", () => { setTok(null); setTimeout(() => location.reload(), 100); })); body.appendChild(acts);
  } else if (panel === "admin") renderAdmin(body);
}
function renderAdmin(body) {
  const q = el("input"); q.placeholder = "Name"; q.value = adminQ; q.maxLength = 16; q.onchange = () => { adminQ = q.value.trim(); netSend({ t: "admin", op: "list", q: adminQ }); }; body.appendChild(q);
  const list = el("div", "alist"); for (const a of adminList) { const b = el("button", "arow" + (adminSel === a.id ? " sel" : "") + (a.online ? " on" : ""), a.name + (a.role !== "player" ? " · " + a.role : "") + (a.banned ? " · banned" : a.muted ? " · muted" : "")); b.onclick = () => { adminSel = a.id; adminData = null; netSend({ t: "admin", op: "inspect", id: a.id }); renderPanel(); }; list.appendChild(b); } body.appendChild(list);
  const a = adminList.find((k) => k.id === adminSel); if (!a) return;
  const op = (o) => netSend(Object.assign({ t: "admin", id: a.id, q: adminQ }, o)), acts = el("div", "acts wrap");
  const mins = el("select"); for (const [v, n] of [["10", "10 min"], ["60", "1 hour"], ["1440", "1 day"], ["10080", "1 week"], ["perma", "Forever"], ["off", "Off"]]) { const o = el("option", "", n); o.value = v; mins.appendChild(o); } acts.appendChild(mins);
  acts.appendChild(btn("Mute", () => op({ op: "mute", mins: mins.value }))); acts.appendChild(btn("Kick", () => op({ op: "kick" }))); acts.appendChild(btn("Ban", () => op({ op: "ban", mins: mins.value })));
  if (myRole === "admin") {
    const role = el("select"); for (const r of ["player", "moderator", "admin"]) { const o = el("option", "", r); o.value = r; if (a.role === r) o.selected = true; role.appendChild(o); } role.onchange = () => op({ op: "role", role: role.value }); acts.appendChild(role);
    const what = el("select"); for (const [v, n] of [["coins", "Coins"], ["coupons", "Level Coupons"], ...Object.keys(EGGS).map((k) => ["egg:" + k, EGGS[k].name]), ...Object.keys(MOUNTS).map((k) => ["mount:" + k, MOUNTS[k].name])]) { const o = el("option", "", n); o.value = v; what.appendChild(o); }
    const n = el("input"); n.type = "number"; n.value = 1; n.min = 1; const lv = el("input"); lv.type = "number"; lv.value = 1; lv.min = 1; lv.max = 20; lv.title = "Level"; const va = el("select"); World.VARIANTS.forEach((v, i) => { const o = el("option", "", v || "Normal"); o.value = i; va.appendChild(o); });
    const give = el("div", "acts wrap"); give.appendChild(what); give.appendChild(n); give.appendChild(lv); give.appendChild(va); give.appendChild(btn("Give", () => op({ op: "give", what: what.value, n: +n.value, lv: +lv.value, va: +va.value }), "go"));
    const quick = el("div", "acts wrap"); for (const [c, name] of [["coins", "+100,000"], ["allmounts", "All mounts"], ["maxlv", "Max levels"], ["eggs", "Eggs"], ["coupons", "Coupons"], ["upgrades", "Upgrades"], ["everything", "Everything"], ["reset", "Reset"]]) quick.appendChild(btn(name, () => op({ op: "quick", cmd: c, n: 100000 })));
    body.appendChild(acts); body.appendChild(give); body.appendChild(quick);
    if (adminData) { const ed = el("div", "acts wrap"); const f = {}; for (const k of ["coins", "coupons"]) { const i = el("input"); i.type = "number"; i.value = adminData[k]; i.title = k; f[k] = i; const l = el("label", "", k === "coins" ? "Coins " : "Coupons "); l.appendChild(i); ed.appendChild(l); }
      ed.appendChild(btn("Save", () => op({ op: "edit", coins: +f.coins.value, coupons: +f.coupons.value }), "go")); ed.appendChild(el("span", "", adminData.mounts.length + " mounts · stamp " + adminData.stamp)); body.appendChild(ed); }
  } else body.appendChild(acts);
}
$("pclose").onclick = closePanel; $("panel").addEventListener("pointerdown", (e) => { if (e.target === $("panel")) closePanel(); });
for (const [id, k] of [["mstable", "stable"], ["mup", "up"], ["modds", "odds"], ["mset", "set"]]) $(id).onclick = () => openPanel(k);

// ---- hatching: the egg wobbles three times, cracks, and there's your mount ----
function hatchShow(kind, m) {
  const o = $("hatch"), egg = $("hegg"), im = $("himg"), nm = $("hname"), rr = $("hrar"), M = MOUNTS[m.sp], c = RARITY_C[M.r]; o.style.display = "flex"; egg.style.display = "block"; egg.style.background = EGGS[kind] ? EGGS[kind].c : ""; im.style.display = nm.style.display = rr.style.display = "none"; egg.className = kind === "gift" ? "egg gift wob" : "egg wob";   // a new mount as a gift comes in a box
  for (const k of [0, 1, 2]) setTimeout(() => sfx("wobble"), 150 + k * 420);
  setTimeout(() => { egg.style.display = "none"; im.src = portrait(m.sp, m.va); im.style.display = nm.style.display = rr.style.display = "block"; nm.textContent = mountName(m); rr.textContent = RARITY[M.r]; rr.style.color = c; o.style.setProperty("--glow", m.va === 2 ? "#ffd84a" : m.va === 1 ? "#bfe6ff" : c); sfx("hatch"); if (m.va) sfx("shiny"); flash(c); }, 1500);
  setTimeout(() => { o.onclick = () => { o.style.display = "none"; o.onclick = null; }; }, 1900);
}

// ---- chat ----
let chatting = false; const chatIn = $("chatin"), msgs = $("msgs");
function chatLine(name, text) { const d = el("div"); d.appendChild(el("b", "", name + " ")); d.appendChild(document.createTextNode(text)); msgs.appendChild(d); while (msgs.children.length > 40) msgs.firstChild.remove(); msgs.scrollTop = msgs.scrollHeight; msgs.classList.add("show"); clearTimeout(chatLine.t); chatLine.t = setTimeout(() => { if (!chatting) msgs.classList.remove("show"); }, 9000); }
function openChat() { if (!loggedIn) return; chatting = true; $("chatbar").style.display = "flex"; msgs.classList.add("show"); chatIn.focus(); keys.clear(); }
function closeChat() { chatting = false; $("chatbar").style.display = "none"; chatIn.blur(); chatLine.t = setTimeout(() => msgs.classList.remove("show"), 4000); }
$("chatbar").addEventListener("submit", (e) => { e.preventDefault(); const text = chatIn.value.trim(); if (text) { netSend({ t: "chat", text }); chatLine(myName, text); bubble(mine, text); } chatIn.value = ""; closeChat(); });
chatIn.addEventListener("keydown", (e) => { if (e.code === "Escape") { chatIn.value = ""; closeChat(); } e.stopPropagation(); });
$("bchat").onclick = () => (chatting ? closeChat() : openChat());
function bubble(rig, text) { if (!rig) return; if (rig.bub) { rig.m.g.remove(rig.bub); clearTimeout(rig.bubT); } const s = textSprite(text.slice(0, 40), { size: 30 }); s.scale.multiplyScalar(1 / rig.sc); s.position.y = (rig.m.top + 2.2) / rig.sc; rig.m.g.add(s); rig.bub = s; rig.bubT = setTimeout(() => { rig.m.g.remove(s); rig.bub = null; }, 5000); }

// ---- other couriers, parties ----
const others = new Map(); let party = [], invites = [], stolen = null;
function addOther(p) {
  if (p.id === myId) return; const old = others.get(p.id); if (old) unrig(old.rig);
  const rig = rigMount(p.sp, clamp(p.lv | 0, 1, World.MAX_LV), p.va | 0, p.shirt || "#3a8ee6", p.name, p.rank | 0); rig.m.g.position.set(p.x, p.y || 0, p.z); setCarry(rig, p.carry);
  others.set(p.id, Object.assign(old || { buf: [], x: p.x, y: p.y || 0, z: p.z, yaw: p.yaw || 0, mv: 0, stunT: 0, graceT: 0, kickT: 0, hideT: 0, stepT: 0, mx: p.x, my: p.y || 0, mz: p.z, myaw: 0, wasFoot: false }, { id: p.id, name: p.name, sp: p.sp, lv: p.lv, va: p.va | 0, shirt: p.shirt, rank: p.rank | 0, friendly: !!p.friendly, carry: p.carry || null, rig }));
}
function dropOther(id) { const o = others.get(id); if (!o) return; unrig(o.rig); others.delete(id); }
function renderParty() { const d = $("party"); d.innerHTML = ""; d.style.display = party.length ? "flex" : "none"; for (const q of party) d.appendChild(el("span", q.id === myId ? "me" : "", q.name)); if (party.length) { const x = el("button", "", "✕"); x.title = "Leave"; x.onclick = () => netSend({ t: "party_leave" }); d.appendChild(x); } }
function renderInvite() { const d = $("invite"), t = performance.now(); invites = invites.filter((i) => i.until > t); const i = invites[0]; d.style.display = i ? "flex" : "none"; if (!i) return; d.innerHTML = ""; d.appendChild(el("b", "", i.name)); d.appendChild(el("span", "", "Party")); const ans = (yes) => { netSend({ t: "answer", from: i.from, yes }); invites.shift(); renderInvite(); }; d.appendChild(btn("✓", () => ans(true), "go")); d.appendChild(btn("✕", () => ans(false))); }
setInterval(() => { if (invites.length) renderInvite(); }, 1000);
function tapAt(sx, sy) {   // tapping a courier: their name and a party invitation
  const pm = $("pmenu"); let best = null, bd = 70;
  for (const o of others.values()) { const s = toScreen(o.x, o.y + 1.5 * o.rig.sc, o.z); if (!s.front) continue; const d = hyp(s.x - sx, s.y - sy); if (d < bd && hyp(o.x - me.x, o.z - me.z) < 60) { bd = d; best = o; } }
  if (!best) { pm.style.display = "none"; return; }
  pm.innerHTML = ""; pm.appendChild(el("b", "", best.name)); if (!party.some((q) => q.id === best.id)) pm.appendChild(btn("Party", () => { netSend({ t: "invite", id: best.id }); pm.style.display = "none"; }, "go")); pm.style.display = "flex"; pm.style.left = clamp(sx, 80, innerWidth - 80) + "px"; pm.style.top = clamp(sy - 50, 40, innerHeight - 60) + "px";
}

// ---- the server ----
const TOKEN = "petdelivery.token";   // the same key as before the remake, so nobody has to log in again
let ws = null, netOk = false, retry = 1000, kicked = false, pendingAuth = null, lastSent = 0, lastPos = "";
const getTok = () => { try { return localStorage.getItem(TOKEN); } catch (e) { return null; } };
const setTok = (t) => { try { if (t) localStorage.setItem(TOKEN, t); else localStorage.removeItem(TOKEN); } catch (e) { /* private mode */ } };
const ERR = { name: "Names are 3–16 letters, numbers or _", pass: "Passwords need at least 4 characters", taken: "That name is taken", wrong: "Wrong name or password", server: "Something went wrong", kicked: "Logged in somewhere else" };
const untilText = (u) => (u === -1 ? "" : " until " + new Date(u).toLocaleString());
function showLogin(msg) { $("login").style.display = "flex"; $("lerr").textContent = msg || ""; }
function authSend(kind) { const m = { t: kind, user: $("luser").value.trim(), pass: $("lpass").value }; $("lerr").textContent = ""; kicked = false; if (ws && ws.readyState === 1) netSend(m); else { pendingAuth = m; connect(); } }
$("login").addEventListener("submit", (e) => { e.preventDefault(); authSend("login"); });
$("lnew").onclick = () => authSend("register");
const WS_URL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? `ws://${location.host}/pets` : (document.querySelector('meta[name="pets-server"]') || {}).content || "wss://play.atamus.io/pets";
function netSend(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function connect() {
  if (ws || kicked) return;
  try { ws = new WebSocket(WS_URL); } catch (e) { ws = null; setTimeout(connect, retry); return; }
  const sock = ws;
  ws.onopen = () => { retry = 1000; $("lgo").disabled = $("lnew").disabled = false; if (pendingAuth) { netSend(pendingAuth); pendingAuth = null; } else if (getTok()) netSend({ t: "resume", token: getTok() }); else showLogin(); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } onNet(m); };
  ws.onclose = () => {
    if (ws === sock) ws = null; const was = netOk; netOk = false; myId = null; for (const id of [...others.keys()]) dropOther(id);
    parcel = null; stolen = null; stolenBy = -1; setDropped(null); belt = { ready: null, next: null }; beltShow(); if (mine) setCarry(mine, null); party = []; renderParty(); hudDirty = true;
    $("lgo").disabled = $("lnew").disabled = true; if (was && !document.hidden) toast("Offline");
    if (!kicked) { setTimeout(connect, retry); retry = Math.min(15000, retry * 2); }
  };
  ws.onerror = () => {};
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { retry = 1000; last = performance.now(); connect(); } else { keys.clear(); joy.id = null; joy.x = joy.y = 0; joyEl.style.display = "none"; drags.clear(); } });
// updates: when a new build of the page is live, everyone reloads onto it (everything is kept on the server); this
// page's own build is read from version.json when it loads
let myBuild = null;
fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.v) myBuild = j.v; }).catch(() => {});
function stale(web, told, by) {
  if (!told && (!web || !myBuild || web === myBuild)) return false;
  let lastR = 0; try { lastR = +sessionStorage.getItem("crittercourier.reload") || 0; } catch (e) { /* none */ }
  if (Date.now() - lastR < 60000) return false;   // never loop
  try { sessionStorage.setItem("crittercourier.reload", String(Date.now())); } catch (e) { /* private mode */ }
  banner("Updating!", "#ffd35a", by ? by + "'s Update" : ""); setTimeout(() => location.reload(), 1500); return true;
}
function adopt(d) { const ride = save.ride, q0 = riding(), key = q0.sp + q0.lv + q0.va + save.set.shirt + World.upTotal(save.up); save = World.cleanData(d); const q = riding(); if (!mine || ride !== save.ride || key !== q.sp + q.lv + q.va + save.set.shirt + World.upTotal(save.up)) remount(); hudDirty = true; setVolumes(); if (panel && panel !== "admin") renderPanel(); }
function sendPos(force) {
  if (!netOk || (me.transit && me.transit.k === "pipe")) return;
  const mv = (me.moving ? 1 : 0) | (me.foot ? 2 : 0) | (me.ground ? 0 : 4) | (me.glide ? 16 : 0), s = [me.x.toFixed(2), me.y.toFixed(2), me.z.toFixed(2), me.yaw.toFixed(2), mv].join();
  if (!force && s === lastPos && performance.now() - lastSent < 1000) return;
  netSend({ t: "pos", x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(2), mv, ct: Math.round(performance.now()) }); lastPos = s; lastSent = performance.now();
}
function setNpc(m) {
  for (const [id, x, z, yaw, mode, y] of m.dogs || []) { const d = dogMesh[id]; if (!d) continue; d.tx = x; d.tz = z; d.tyaw = yaw; if (Number.isFinite(y)) d.ty = y; if (mode !== d.mode) { if (mode === 1 && hyp(x - me.x, z - me.z) < 45) sfx("bark"); d.mode = mode; d.bang.visible = mode === 1; } }
  for (const [id, x, z, y, yaw, mode, carry] of m.geese || []) { const g = gooseMesh[id]; if (!g) continue; g.tx = x; g.tz = z; g.ty = y; g.tyaw = yaw; if (mode !== g.mode) { if (mode === 1 && hyp(x - me.x, z - me.z) < 45) sfx("honk"); if (mode === 4) emit(g.x, g.y + 0.8, g.z, 14, { colors: ["#ffffff", "#e8eef2"], speed: 3, up: 3, life: 0.9, grav: 3 }); g.mode = mode; }
    if (carry !== g.carry) { g.carry = carry; g.m.slot.clear(); if (carry >= 0) { const b = parcelMesh(carry, ""); b.scale.setScalar(0.6); g.m.slot.add(b); } } }
  for (const [id, x, z, yaw, mode] of m.goats || []) { const g = goatMesh[id]; if (!g) continue; g.tx = x; g.tz = z; g.tyaw = yaw; if (mode !== g.mode) { if (mode === 1 && hyp(x - me.x, z - me.z) < 45) { sfx("stomp"); emit(x, g.y + 0.1, z, 10, { colors: ["#c9bfae"], speed: 2.5, up: 1.5, life: 0.5, grav: 4 }); } g.mode = mode; } }
}
const whereOf = (id) => (id === myId ? me : others.get(id));
function knockedOff() { if (!me.foot) { me.foot = true; me.mx = me.x; me.my = me.y; me.mz = me.z; me.myaw = me.yaw; const a = Math.random() * TAU; me.px += Math.cos(a) * 7; me.pz += Math.sin(a) * 7; me.vy = 5; me.ground = false; } me.dash = 0; me.boost = 0; }
function setDropped(d) { if (dropMesh) { scene.remove(dropMesh); dropMesh = null; } dropped = d; if (d) { dropMesh = parcelMesh(d.tier, d.mod); dropMesh.position.set(d.x, d.y, d.z); scene.add(dropMesh); } }
let dropMesh = null;
function onNet(m) {
  switch (m.t) {
    case "welcome": {
      if (stale(m.web, false, m.by)) return;
      setTok(m.token); const again = loggedIn && myName === m.name; myName = m.name; myId = m.id; myRole = m.role || "player"; netOk = true; loggedIn = true; clockOff = m.now - Date.now();
      $("login").style.display = "none"; $("hud").style.display = "block"; if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      save = World.cleanData(m.data); shownCoins = save.coins; $("coinn").textContent = fmt(save.coins); remount(); setVolumes();
      if (!again) { me.x = m.x; me.z = m.z; me.y = 0; me.yaw = Math.PI / 2; cam.yaw = -Math.PI / 2; msgs.innerHTML = ""; }
      me.foot = false; me.stun = 0; me.transit = null; me.hidden = false;
      for (const p of m.players) addOther(p); setNpc(m); for (const g of gooseMesh) { g.x = g.tx; g.z = g.tz; g.y = g.ty; } for (const d of dogMesh) { d.x = d.tx; d.z = d.tz; d.y = d.ty; } for (const g of goatMesh) { g.x = g.tx; g.z = g.tz; } hudDirty = true; sendPos(true);
      break;
    }
    case "auth_err": if (m.why === "expired") { setTok(null); showLogin(); } else showLogin(m.why === "banned" ? "Banned" + untilText(m.until) : ERR[m.why] || ERR.server); break;
    case "kicked": kicked = true; loggedIn = false; $("hud").style.display = "none"; showLogin(m.why === "kick" ? "Kicked" : m.why === "banned" ? "Banned" + untilText(m.until) : ERR.kicked); break;
    case "muted": if (m.until) toast("Muted" + untilText(m.until), "#e5534b"); break;
    case "role": myRole = m.role; if (panel) renderPanel(); break;
    case "admin_list": adminList = m.list; if (panel === "admin") renderPanel(); break;
    case "admin_msg": toast(m.msg); break;
    case "admin_data": if (adminSel === m.id) { adminData = m.data; if (panel === "admin") renderPanel(); } break;
    case "data": adopt(m.data); break;
    case "join": addOther(m.p); hudDirty = true; break;
    case "leave": dropOther(m.id); hudDirty = true; break;
    case "snap": {
      clockOff = Math.max(clockOff, m.ts - Date.now());
      for (const [id, x, z, yaw, mv, y] of m.ps || []) { const o = others.get(id); if (!o) continue; o.buf.push({ t: m.ts, x, y, z, yaw, mv }); if (o.buf.length > 12) o.buf.shift(); }
      setNpc(m); break;
    }
    case "mount": { const o = others.get(m.id); if (o) addOther(Object.assign({}, o, { sp: m.sp, lv: m.lv, va: m.va })); break; }
    case "rank": { const o = others.get(m.id); if (o) addOther(Object.assign({}, o, { rank: m.rank })); else if (m.id === myId) remount(); break; }
    case "look": { const o = others.get(m.id); if (o) addOther(Object.assign({}, o, { friendly: m.friendly, shirt: m.shirt })); break; }
    case "carry": { const o = others.get(m.id); if (o) { o.carry = m.c; setCarry(o.rig, m.c); } break; }
    case "belt": { const pop = !!m.next && JSON.stringify(m.next) !== JSON.stringify(belt.next), slide = belt.next && m.ready && JSON.stringify(m.ready) === JSON.stringify(belt.next); belt = { ready: m.ready, next: m.next }; beltShow(slide, pop); break; }
    case "parcel": {
      const had = parcel; parcel = m.p; stolen = null; stolenBy = -1; setCarry(mine, [parcel.tier, parcel.mod]); setTarget();
      if (m.why === "grab") { closeRoll(); sfx("grab"); me.squash = 0.25; if (parcel.mod === "golden") { sfx("shiny"); banner("GOLDEN PARCEL!", "#ffd84a"); } }
      else if (m.why === "pickup") { setDropped(null); sfx("grab"); me.squash = 0.25; if (m.bonus) { popup("+" + m.bonus, "#ffd84a", me.x, me.y + 2.6, me.z); save.coins = m.coins; flyCoins(me.x, me.y + 2, me.z, 3); } }
      else if (had) { sfx("crack"); cam.shake = Math.max(cam.shake, 0.35); flash("#e5534b"); popup("-20%", "#ff6b6b", me.x, me.y + 2.8, me.z); emit(me.x, me.y + 1.4, me.z, 12, { colors: ["#c89a5e", "#8a5a34"], speed: 4, up: 3, life: 0.6, size: 0.14 }); }
      break;
    }
    case "lost": {
      parcel = null; stolen = null; stolenBy = -1; setDropped(null); setCarry(mine, null); setTarget(); sfx("smash"); cam.shake = Math.max(cam.shake, 0.5); flash("#e5534b");
      banner(m.why === "broke" ? "PARCEL BROKE!" : "PARCEL LOST!", "#ff6b6b"); emit(me.x, me.y + 1.4, me.z, 26, { colors: ["#c89a5e", "#8a5a34", "#fff8e6"], speed: 6, up: 5, life: 0.9 }); break;
    }
    case "stolen": stolen = parcel; parcel = null; stolenBy = m.goose; setCarry(mine, null); setTarget(); sfx("steal"); sfx("honk"); banner("STOLEN!", "#ff6b6b"); cam.shake = Math.max(cam.shake, 0.3); break;
    case "dropped": if (stolen) setDropped({ x: m.x, y: m.y, z: m.z, tier: stolen.tier, mod: stolen.mod }); stolenBy = -1; break;
    case "delivered": {
      const h = World.houses[m.house]; parcel = null; setCarry(mine, null); setTarget(); sfx("deliver"); emit(h.mx, h.my + 1.6, h.mz, 60, { colors: CONFETTI, speed: 6, up: 8, life: 1.3 }); me.squash = 0.2;
      popup("+" + fmt(m.coins), "#ffd84a", h.mx, h.my + 2.4, h.mz); flyCoins(h.mx, h.my + 1.6, h.mz, 5); houseMesh[m.house].shake = 0.01; houseMesh[m.house].pop = 0.3;
      save = World.cleanData(m.data); if (m.lvUp) remount(); startRoll(h, m.roll, m.lvUp); gift = m.gift || null; break;
    }
    case "stun": me.stun = m.s; if (me.transit && me.transit.k !== "pipe") me.transit = null; knockedOff(); sfx("stun"); cam.shake = Math.max(cam.shake, 0.5); flash(m.why === "kick" ? "#ffffff" : "#e5534b"); if (m.why === "dog") sfx("growl"); break;
    case "knock": me.px = m.x; me.pz = m.z; me.vy = m.y; me.ground = false; sfx("kick"); cam.shake = Math.max(cam.shake, 0.5); break;
    case "tp": me.x = m.x; me.y = m.y; me.z = m.z; me.vx = me.vz = me.vy = me.px = me.pz = 0; me.transit = null; me.ground = true; me.armed = false; me.foot = false; camAt.y = m.y + 2; if (m.why === "fall") { flash("#ffffff"); sfx("pop"); } else { flash("#bfe6ff"); sfx("pad"); } sendPos(true); break;
    case "piped": me.transit = { k: "pipe", until: now() + m.s, x: m.x, y: m.y, z: m.z }; me.hidden = true; me.vx = me.vz = me.px = me.pz = 0; sfx("pipe"); if (m.goose) setTimeout(() => sfx("honk"), 600); break;
    case "rock": { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3), mat("#8a8278")); r.position.set(m.x, m.y + 22, m.z); scene.add(r); fallers.push({ g: r, y0: m.y + 22, y1: m.y + 0.8, t: 0, s: m.s });
      groundMark(m.x, m.y, m.z, World.ROCK.r, m.s, "#1d232a", (k) => { if (hyp(k.x - me.x, k.z - me.z) < 60) sfx("rock"); emit(k.x, k.y + 0.3, k.z, 22, { colors: ["#8a8278", "#c9bfae"], speed: 6, up: 4, life: 0.7 }); if (hyp(k.x - me.x, k.z - me.z) < 14) cam.shake = Math.max(cam.shake, 0.4); }); break; }
    case "dive": { const g = gooseModel(true); g.g.position.set(m.x + 9, m.y + 14, m.z); g.g.scale.setScalar(1.4); scene.add(g.g); divers.push({ g, x: m.x, y: m.y, z: m.z, t: 0, s: m.s }); if (hyp(m.x - me.x, m.z - me.z) < 40) sfx("honk"); groundMark(m.x, m.y, m.z, World.SKYGOOSE.r, m.s, "#2b3a66"); break; }
    case "fx": onFx(m); break;
    case "leveled": { adopt(m.data); if (m.id === save.ride) { remount(); levelFx(); } else sfx("level"); break; }
    case "hatched": adopt(m.data); selMount = m.m.id; if (panel === "stable") renderPanel(); hatchShow(m.kind, m.m); break;
    case "upgraded": adopt(m.data); remount(); sfx("buy"); emit(me.x, me.y + 2, me.z, 30, { colors: ["#ffd84a", "#ffffff", "#7ee08a"], speed: 4, up: 5, life: 1 }); break;
    case "announce": { const a = $("announce"); a.textContent = m.name + " hatched a " + World.VARIANTS[m.va] + " " + MOUNTS[m.sp].name + "!"; a.style.color = m.va === 2 ? "#ffd84a" : "#bfe6ff"; a.classList.remove("go"); void a.offsetWidth; a.classList.add("go"); sfx("shiny"); break; }
    case "chat": { const o = others.get(m.id); chatLine(o ? o.name : m.name, m.text); if (o) bubble(o.rig, m.text); break; }
    case "invited": invites.push({ from: m.from, name: m.name, until: performance.now() + 28000 }); renderInvite(); break;
    case "declined": toast(m.name + " ✕"); break;
    case "party": party = m.members || []; renderParty(); break;
    case "reload": stale(m.web, true, m.by); break;
  }
}
const fallers = [], divers = [];
function onFx(m) {
  const o = whereOf(m.id), mineFx = m.id === myId, nearMe = o && hyp(o.x - me.x, o.z - me.z) < 50;
  switch (m.k) {
    case "kick": if (mineFx) { if (m.hit) { banner("KICK!", "#ffd84a"); hitStop = 0.05; cam.shake = Math.max(cam.shake, 0.45); sfx("kick"); const fx = me.x + Math.sin(me.yaw) * 2, fz = me.z + Math.cos(me.yaw) * 2; emit(fx, me.y + 1, fz, 18, { colors: ["#ffffff", "#ffd84a"], speed: 7, up: 3, life: 0.4, size: 0.2 }); } } else if (o) { o.kickT = 0.28; if (nearMe) sfx(m.hit ? "kick" : "swish"); } break;
    case "stun": if (o && !mineFx) o.stunT = m.s; break;
    case "grace": if (mineFx) me.grace = m.s; else if (o) o.graceT = m.s; break;
    case "crack": if (o && nearMe) { sfx("crack"); emit(o.x, o.y + 1.4, o.z, 10, { colors: ["#c89a5e", "#8a5a34"], speed: 4, up: 3, life: 0.6, size: 0.14 }); } break;
    case "break": if (!mineFx && hyp(m.x - me.x, m.z - me.z) < 50) { sfx("smash"); emit(m.x, m.y + 1.4, m.z, 22, { colors: ["#c89a5e", "#8a5a34", "#fff8e6"], speed: 6, up: 5, life: 0.9 }); } break;
    case "del": { const h = World.houses[m.house]; if (h && hyp(h.mx - me.x, h.mz - me.z) < 70) { emit(h.mx, h.my + 1.6, h.mz, 36, { colors: CONFETTI, speed: 5, up: 7, life: 1.2 }); if (m.roll >= 2) setTimeout(() => emit(h.mx, h.my + 2.6, h.mz, 20 + m.roll * 10, { colors: [RARITY_C[m.roll], "#ffffff"], speed: 5, up: 5, life: 1.1 }), 1500); houseMesh[m.house].pop = 0.3; } break; }
    case "busted": popup("GOOSE BUSTED!", "#ffd84a", m.x, m.y + 2, m.z, true); emit(m.x, m.y + 1, m.z, 30, { colors: ["#ffffff", "#e8eef2", "#ffd84a"], speed: 5, up: 5, life: 1.1, grav: 4 }); if (hyp(m.x - me.x, m.z - me.z) < 60) sfx("busted"); if (mineFx) { hitStop = 0.05; cam.shake = Math.max(cam.shake, 0.4); } break;
    case "yelp": { const d = dogMesh[m.dog]; if (d && hyp(d.x - me.x, d.z - me.z) < 45) tone(900, 500, 0.18, { type: "sawtooth", vol: 0.25 }); break; }
    case "bark": if (o) { if (!mineFx && nearMe) sfx("bark"); for (let k = 0; k < 26; k++) { const a = (k / 26) * TAU; parts.length < PN && parts.push({ x: o.x, y: o.y + 0.6, z: o.z, vx: Math.cos(a) * m.r * 1.6, vy: 0.5, vz: Math.sin(a) * m.r * 1.6, t: 0, life: 0.6, size: 0.22, grav: 0, c: "#ffffff", r: k }); } } break;
    case "bite": { const d = dogMesh[m.dog]; if (d && hyp(d.x - me.x, d.z - me.z) < 45) sfx("growl"); break; }
    case "steal": if (o && nearMe) sfx("steal"); break;
    case "skysteal": if (o && nearMe) sfx("steal"); break;
    case "butt": if (o && nearMe && !mineFx) sfx("kick"); break;
    case "pipe": if (o) { o.hideT = m.s; if (nearMe) sfx("pipe"); } break;
  }
}

// ---- the conveyor's two parcels (yours alone), the address you're riding to ----
let readyMesh = null, nextMesh = null, targetFx = null;
function beltShow(slide, pop) {
  if (readyMesh) scene.remove(readyMesh); if (nextMesh) scene.remove(nextMesh); readyMesh = nextMesh = null;
  if (belt.ready) { readyMesh = parcelMesh(belt.ready.tier, belt.ready.mod); scene.add(readyMesh); beltLag = slide ? BELT_GAP : 0; }
  if (belt.next) { nextMesh = parcelMesh(belt.next.tier, belt.next.mod); nextMesh.position.y = pop ? 4 : 1.16; nextMesh.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.45; } }); scene.add(nextMesh); if (pop && loggedIn) setTimeout(() => { if (hyp(me.x, me.z) < 40) sfx("pop"); }, 220); }
}
function setTarget() {
  if (targetFx) { scene.remove(targetFx); targetFx = null; } if (!parcel) return; const h = World.houses[parcel.house];
  targetFx = new THREE.Group(); targetFx.position.set(h.mx, h.my, h.mz);
  const flat = (geo, c, o, y) => { const m = new THREE.Mesh(geo.rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false })); m.position.y = y; m.renderOrder = 3; return m; };
  const ring = flat(new THREE.RingGeometry(World.DELIVER_R - 0.55, World.DELIVER_R, 44), POI, 1, 0.16), edge = flat(new THREE.RingGeometry(World.DELIVER_R, World.DELIVER_R + 0.22, 44), "#ffffff", 1, 0.15), fill = flat(new THREE.CircleGeometry(World.DELIVER_R - 0.55, 44), POI, 0.4, 0.13);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 90, 14, 1, true), new THREE.MeshBasicMaterial({ color: POI, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 45;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 90, 8, 1, true), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); core.position.y = 45;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), new THREE.MeshBasicMaterial({ color: POI })); gem.position.y = 4.2; gem.scale.y = 1.4;
  const label = textSprite(h.name, { size: 44, color: "#ffffff", bg: POI, glow: "#ffffff" }); label.position.y = 6.6; label.scale.multiplyScalar(2);
  targetFx.add(fill, ring, edge, beam, core, gem, label); targetFx.userData = { ring, label, gem }; scene.add(targetFx);
}
// the guide arrow: on the ground a little way out from you, pointing at where to go (owner, 2026-11-11: like the old game's)
const wayArrow = (() => {
  const sh = new THREE.Shape(); sh.moveTo(0, 1.7); sh.lineTo(1.25, 0.15); sh.lineTo(0.5, 0.15); sh.lineTo(0.5, -1.2); sh.lineTo(-0.5, -1.2); sh.lineTo(-0.5, 0.15); sh.lineTo(-1.25, 0.15); sh.closePath();
  const geo = new THREE.ShapeGeometry(sh).rotateX(Math.PI / 2), g = new THREE.Group(), mk = (c, k, o) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, depthTest: false, transparent: true })); m.scale.setScalar(k); m.renderOrder = o; g.add(m); return m; };
  mk("#ffffff", 1.28, 7); g.userData.fill = mk(POI, 1, 8); g.visible = false; scene.add(g); return g;
})();
function stepArrow(t, tg) {
  const d = tg ? hyp(tg.x - me.x, tg.z - me.z) : 0; wayArrow.visible = !!tg && d > 5 && !me.hidden; if (!wayArrow.visible) return;
  const sc = mine ? mine.sc : 1, R = 3 + 1.3 * sc + Math.sin(t * 5) * 0.35, ux = (tg.x - me.x) / d, uz = (tg.z - me.z) / d;
  wayArrow.position.set(me.x + ux * R, me.y + 0.3, me.z + uz * R); wayArrow.rotation.y = Math.atan2(ux, uz); wayArrow.scale.setScalar(0.8 + 0.2 * sc); wayArrow.userData.fill.material.color.set(tg.c);
}

// ---- drawing everyone ----
function pose(rig, s, dt, t, speed) {   // s: { x, y, z, yaw, moving, foot, air, stun, mx, my, mz, myaw, kickT, hidden, squash, hop, glide }
  const g = rig.m.g, w = rig.w;
  g.visible = !s.hidden; w.g.visible = !s.hidden && s.foot; if (rig.m.rider) rig.m.rider.visible = !s.foot;
  if (s.foot) { g.position.set(s.mx, s.my, s.mz); g.rotation.y = s.myaw; animatePet(rig.m, t, false, 0, false);
    w.g.position.set(s.x, s.y, s.z); w.g.rotation.set(0, s.yaw, 0);
    if (s.stun > 0) { w.g.rotation.x = -Math.PI / 2; w.g.rotation.z = t * 6; w.g.position.y = s.y + 0.35; }
    else { const sw = s.moving ? Math.sin(t * 12) * 0.8 : 0; w.legs[0].rotation.x = sw; w.legs[1].rotation.x = -sw; w.arms[0].rotation.x = -sw; w.arms[1].rotation.x = sw; } }
  else { g.position.set(s.x, s.y + (s.hop > 0 ? Math.sin((s.hop / 0.3) * Math.PI) * 0.5 : 0), s.z); g.rotation.y = s.yaw; animatePet(rig.m, t, s.moving, speed, s.air);
    rig.m.body.rotation.x = s.kickT > 0 ? Math.sin((s.kickT / 0.28) * Math.PI) * 0.5 : s.glide ? 0.18 : 0; if (s.kickT > 0) rig.m.body.position.z = Math.sin((s.kickT / 0.28) * Math.PI) * 0.9; else rig.m.body.position.z = 0;
    const q = s.squash > 0 ? 1 + Math.sin((s.squash / 0.25) * Math.PI) * 0.22 : 1; g.scale.set(rig.sc / Math.sqrt(q), rig.sc * q, rig.sc / Math.sqrt(q)); }
  if (rig.slot.children.length) rig.slot.rotation.z = Math.sin(t * 9) * (s.moving ? 0.07 : 0.02);
}
function stepOthers(dt, t) {
  const rt = Date.now() + clockOff - 160;
  for (const o of others.values()) {
    const b = o.buf; while (b.length > 2 && b[1].t <= rt) b.shift();
    if (b.length >= 2 && b[0].t <= rt && b[1].t > rt) { const u = (rt - b[0].t) / (b[1].t - b[0].t); o.x = lerp(b[0].x, b[1].x, u); o.y = lerp(b[0].y, b[1].y, u); o.z = lerp(b[0].z, b[1].z, u); o.yaw = b[0].yaw + angDiff(b[1].yaw, b[0].yaw) * u; o.mv = b[1].mv; }
    else if (b.length) { const s = b[b.length - 1].t <= rt ? b[b.length - 1] : b[0]; const k = Math.min(1, 10 * dt); o.x += (s.x - o.x) * k; o.y += (s.y - o.y) * k; o.z += (s.z - o.z) * k; o.yaw += angDiff(s.yaw, o.yaw) * k; o.mv = b[b.length - 1].t <= rt ? s.mv & ~1 : s.mv; }
    const foot = !!(o.mv & 2); if (foot && !o.wasFoot) { o.mx = o.x; o.my = o.y; o.mz = o.z; o.myaw = o.yaw; } o.wasFoot = foot;
    if (o.stunT > 0) { o.stunT -= dt; if (Math.random() < 0.3) emit(o.x, o.y + 2.2, o.z, 1, { colors: ["#ffd84a"], speed: 1.5, up: 0.5, life: 0.5, grav: 0, size: 0.16 }); }
    if (o.graceT > 0) { o.graceT -= dt; if (Math.random() < 0.4) emit(o.x, o.y + 1.2, o.z, 1, { colors: ["#ffffff", "#bfe6ff"], speed: 1.2, up: 1, life: 0.5, grav: -1, size: 0.1, spread: 1.6 }); }
    if (o.kickT > 0) o.kickT -= dt; if (o.hideT > 0) o.hideT -= dt;
    pose(o.rig, { x: o.x, y: o.y, z: o.z, yaw: o.yaw, moving: !!(o.mv & 1), foot, air: !!(o.mv & 4), stun: o.stunT, mx: o.mx, my: o.my, mz: o.mz, myaw: o.myaw, kickT: o.kickT, hidden: o.hideT > 0, glide: !!(o.mv & 16) }, dt, t, 10);
    if ((o.mv & 1) && !(o.mv & 6) && (o.va || o.lv >= World.MAX_LV)) { o.stepT -= dt; if (o.stepT <= 0) { o.stepT = 0.18; trail(o.x, o.y, o.z, o, ""); } }
  }
}
function stepNpcs(dt, t) {
  const k = 1 - Math.exp(-14 * dt);
  const far = (o) => { const v = Math.abs(o.x - me.x) < 170 && Math.abs(o.z - me.z) < 170; o.m.g.visible = v; return !v; };   // animals a long way off aren't drawn
  for (const d of dogMesh) { if (far(d)) { d.x = d.tx; d.z = d.tz; d.y = d.ty; continue; } const mv = hyp(d.tx - d.x, d.tz - d.z) > 0.02; d.x += (d.tx - d.x) * k; d.z += (d.tz - d.z) * k; d.y += (d.ty - d.y) * k; d.yaw += angDiff(d.tyaw, d.yaw) * k; d.m.g.position.set(d.x, d.y, d.z); d.m.g.rotation.y = d.yaw; animatePet(d.m, t + d.x, mv, 11, false); if (d.mode === 1) d.m.g.position.y = d.y + Math.abs(Math.sin(t * 22)) * 0.25; }
  for (const g of gooseMesh) { if (far(g)) { g.x = g.tx; g.z = g.tz; g.y = g.ty; continue; } const mv = hyp(g.tx - g.x, g.tz - g.z) > 0.03; g.x += (g.tx - g.x) * k; g.z += (g.tz - g.z) * k; g.y += (g.ty - g.y) * k; g.yaw += angDiff(g.tyaw, g.yaw) * k; const m = g.m; m.g.position.set(g.x, g.y, g.z); m.g.rotation.y = g.yaw;
    const sw = mv ? Math.sin(t * (g.mode >= 2 ? 22 : 9) + g.x) * 0.6 : 0; m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw; m.body.rotation.z = mv ? Math.sin(t * 9 + g.x) * 0.1 : 0;
    const flap = g.mode === 1 ? 0.9 + Math.sin(t * 30) * 0.7 : g.mode === 2 ? 0.7 : 0.05; m.wings[0].rotation.z = -flap; m.wings[1].rotation.z = flap; m.head.rotation.x = g.mode === 1 ? -0.5 : g.mode === 4 ? Math.sin(t * 14) * 0.5 : 0; m.g.rotation.z = g.mode === 4 ? Math.sin(t * 10) * 0.3 : 0; if (g.mode === 5) { m.g.position.y = g.y - 0.25 + Math.sin(t * 9) * 0.12; m.head.rotation.x = 0.5 + Math.sin(t * 9) * 0.4; } }
  for (const g of goatMesh) { if (far(g)) { g.x = g.tx; g.z = g.tz; continue; } const mv = hyp(g.tx - g.x, g.tz - g.z) > 0.05; g.x += (g.tx - g.x) * k; g.z += (g.tz - g.z) * k; g.yaw += angDiff(g.tyaw, g.yaw) * k; g.m.g.position.set(g.x, g.y, g.z); g.m.g.rotation.y = g.yaw; animatePet(g.m, t, mv, 13, false); g.m.head.rotation.x = g.mode === 1 ? 0.5 + Math.sin(t * 26) * 0.15 : g.mode === 2 ? 0.6 : 0; }
  const sn = srvNow(), goose = World.pipeGoose(sn); for (const e of pipeEyes) { e.visible = goose; e.position.y = (e === pipeEyes[0] ? World.PIPE.a.y : World.PIPE.b.y) + 0.75 + Math.sin(t * 3) * 0.08; }
  for (const s of sprinklerMesh) if (World.sprinklerOn(s, sn) && hyp(s.x - me.x, s.z - me.z) < 90) { emit(s.x, s.y + 0.6, s.z, 2, { colors: ["#bfe6ff", "#ffffff"], speed: 5.5, up: 4, life: 0.7, grav: 10, size: 0.1 }); if (hyp(s.x - me.x, s.z - me.z) < 14 && Math.random() < 0.03) sfx("hiss"); }
  if (me.x > World.ISLE_X - 20 && me.y > World.SKY_Y) { const w = World.windAt(sn); if (w.on) { if (!windOn) sfx("wind"); for (let n = 0; n < 2; n++) { const a = Math.random() * TAU, r = Math.random() * 22; parts.length < PN && parts.push({ x: me.x + Math.cos(a) * r - w.x * 8, y: me.y + 0.5 + Math.random() * 4, z: me.z + Math.sin(a) * r - w.z * 8, vx: w.x * 16, vy: Math.sin(t * 5 + n) * 1.5, vz: w.z * 16, t: 0, life: 0.8, size: 0.12, grav: 0, c: "#ffffff", r: n }); } } windOn = w.on; }
  for (let i = fallers.length - 1; i >= 0; i--) { const f = fallers[i]; f.t += dt; const u = clamp(f.t / f.s, 0, 1); f.g.position.y = lerp(f.y0, f.y1, u * u); f.g.rotation.x += dt * 4; if (f.t > f.s + 1.2) { scene.remove(f.g); fallers.splice(i, 1); } }
  for (let i = divers.length - 1; i >= 0; i--) { const d = divers[i]; d.t += dt; const u = d.t / d.s, g = d.g.g; if (u < 1) g.position.set(d.x + 9 * (1 - u), d.y + 0.6 + 14 * (1 - u) * (1 - u), d.z); else g.position.set(d.x - 12 * (u - 1), d.y + 0.6 + 16 * (u - 1), d.z); g.rotation.y = -Math.PI / 2; d.g.wings[0].rotation.z = -1.2 + Math.sin(d.t * 20) * 0.4; d.g.wings[1].rotation.z = 1.2 - Math.sin(d.t * 20) * 0.4; if (u > 2) { scene.remove(g); divers.splice(i, 1); } }
  for (const h of houseMesh) { if (h.shake > 0) { h.shake -= dt; h.mb.rotation.z = h.shake > 0 ? Math.sin(t * 40) * 0.25 : 0; } if (h.pop > 0) { h.pop -= dt; h.mb.scale.setScalar(1 + Math.max(0, Math.sin((h.pop / 0.3) * Math.PI)) * 0.4); } }
  beltLag *= Math.exp(-7 * dt);
  if (readyMesh) { const q = readyAt(); readyMesh.position.set(q.x, 1.16 + Math.abs(Math.sin(t * 3)) * 0.18, q.z); readyMesh.rotation.y = t * 0.8; }
  if (nextMesh) { const q = beltPos(beltS() - BELT_GAP - beltLag); nextMesh.position.set(q.x, Math.max(1.16, nextMesh.position.y - dt * 14), q.z); }
  if (targetFx) { const u = targetFx.userData; u.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.06); u.gem.position.y = 4.2 + Math.sin(t * 3) * 0.4; u.gem.rotation.y = t * 2; }
  if (dropMesh) { dropMesh.position.y = dropped.y + 0.3 + Math.abs(Math.sin(t * 4)) * 0.5; dropMesh.rotation.y = t * 2; if (Math.random() < 0.2) emit(dropped.x, dropped.y + 1, dropped.z, 1, { colors: ["#ffd84a"], speed: 1, up: 2, life: 0.6, grav: 0, size: 0.1 }); }
  for (const b of World.balloons) b.g.position.y = b.y + Math.sin(t * 1.2 + b.x) * 0.25;
}
let windOn = false;

// ---- every frame ----
let last = performance.now();
function frame(tms) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.08, (tms - last) / 1000); last = tms; const t = tms / 1000;
  if (hitStop > 0) { hitStop -= dt; renderer.render(scene, camera); return; }   // a landed kick holds the picture for a beat
  if (loggedIn) {
    stepMe(dt);
    if (me.kickT > 0) me.kickT -= dt; if (me.squash > 0) me.squash -= dt; if (me.hop > 0) me.hop -= dt;
    if (me.stun > 0 && Math.random() < 0.35) emit(me.x, me.y + 2.2, me.z, 1, { colors: ["#ffd84a"], speed: 1.5, up: 0.5, life: 0.5, grav: 0, size: 0.16 });
    if (me.grace > 0) { me.grace -= dt; if (Math.random() < 0.5) emit(me.x, me.y + 1.2, me.z, 1, { colors: ["#ffffff", "#bfe6ff"], speed: 1.2, up: 1, life: 0.5, grav: -1, size: 0.1, spread: 1.6 }); }
    if (mine) pose(mine, { x: me.x, y: me.y, z: me.z, yaw: me.yaw, moving: me.moving, foot: me.foot, air: !me.ground, stun: me.stun, mx: me.mx, my: me.my, mz: me.mz, myaw: me.myaw, kickT: me.kickT, hidden: me.hidden, squash: me.squash, hop: me.hop, glide: me.glide }, dt, t, myStats().speed);
    if (tms - lastSent > 66) sendPos();
  }
  stepOthers(dt, t); stepNpcs(dt, t); stepParts(dt); stepMarks(dt); blobStep(); stepCamera(dt);
  renderer.render(scene, camera);
  if (loggedIn) { hud(dt); stepRoll(dt); } stepPops(dt);
}
buildTown(); buildAnimals(); beltShow(); stepCamera(0.016);
// for the tests and the console
window.Pets = { World, me, cam, others, get save() { return save; }, get parcel() { return parcel; }, get belt() { return belt; }, get stolen() { return stolen; }, get dropped() { return dropped; }, get loggedIn() { return loggedIn; }, get panel() { return panel; }, dogMesh, gooseMesh, goatMesh, get arrow() { return wayArrow; }, readyAt, onNet, teleport(x, z, y = 0) { me.x = x; me.z = z; me.y = y; me.vx = me.vz = me.vy = 0; me.transit = null; me.ground = false; sendPos(true); }, netSend, openPanel };
$("lgo").disabled = $("lnew").disabled = true;
connect(); requestAnimationFrame(frame);
