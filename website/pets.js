// Critter Courier (owner, 2026-11-11: the game remade from the design document). Grab a parcel off the post office
// conveyor, ride your mount to the address before a dog or a goose (or another courier's boot) gets it, drop it in the
// mailbox and watch the reward roll. The server (packages/server/src/pets.js) decides everything that matters: parcels,
// deliveries, rolls, damage, coins, mounts; this page shows the town (pets-world.js, shared with the server), moves you
// and asks. Phone first: a thumb joystick, drag to look, pinch to zoom, big buttons.
import * as THREE from "./vendor/three.module.min.js";
import { svg, fillIcons, ICON } from "./icons.js?v=3";
import * as World from "./pets-world.js?v=1794639926";

const $ = (id) => document.getElementById(id);
const { TAU, clamp, hyp, MOUNTS, TIERS, RARITY, RARITY_C, MODS, UPGRADES } = World;
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
const KIND_C = { plaza: "#d9d4c8", grass: "#78b765", mud: "#75583e", rock: "#9a948b", plank: "#b9905f", isle: "#80bd6c", road: "#84878f", stone: "#a9adb5", roof: "#b9573f", pod0: "#e8b923", pod1: "#c9d1d9", pod2: "#c98a4b", ice: "#d6f0ff", sand: "#e8cf8f", jungle: "#3f8f4a", basalt: "#4a4446", lava: "#ff5a1f", moon: "#c9c6d9", water: "#3f8fd0", snow: "#f4f8fb", log: "#8a5a34", crater: "#8a86a0" };
const HOUSE_C = [["#efe3cc", "#c8604c"], ["#ecd5b8", "#5c86bd"], ["#cfdcc0", "#7a5a3c"], ["#dcd3c6", "#8368b0"], ["#f1f1ec", "#3fa9a4"], ["#eef6fb", "#5aa0d9"], ["#f0d9a8", "#c8662e"], ["#b9a27a", "#3f7a3f"], ["#5a5050", "#c8401e"], ["#e4e0f0", "#6a4ab0"]];   // walls and roofs, by district
const NOWHERE = { name: "", x: 0, z: 0, y: 0, mx: 0, mz: 0, my: 0, d: 0 }, addrOf = (id) => World.addr(id) || NOWHERE;   // (owner, 2026-11-13) a mailbox may have been taken away
const houseMesh = {}, dogMesh = [], gooseMesh = [], goatMesh = [], sprinklerMesh = [], pipeEyes = [];
function rampGeo(s) {   // a wedge: flat at the bottom, rising along z (k 2) or x (k 3)
  const y0 = Math.min(s.ya, s.yb), g = new THREE.BufferGeometry(), A = [s.x0, y0, s.z0], B = [s.x1, y0, s.z0], C = [s.x1, y0, s.z1], D = [s.x0, y0, s.z1], X = s.k === 3, E = [s.x0, s.ya, s.z0], F = [s.x1, X ? s.yb : s.ya, s.z0], G = [s.x1, s.yb, s.z1], H = [s.x0, X ? s.ya : s.yb, s.z1];
  const quads = [[E, H, G, F], [A, E, F, B], [D, C, G, H], [A, D, H, E], [B, F, G, C]], v = [];
  for (const [a, b, c, d] of quads) v.push(...a, ...b, ...c, ...a, ...c, ...d);
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
}
function buildTown() {
  for (const s of World.slabs) {
    const c = KIND_C[s.kind] || "#cccccc";
    if (s.k === 0) { const h = Math.min(s.y - s.b, 46), m = box(s.x1 - s.x0, h, s.z1 - s.z0, c, (s.x0 + s.x1) / 2, s.y - h / 2, (s.z0 + s.z1) / 2); m.castShadow = s.kind === "roof" || s.kind === "stone"; }
    else if (s.k === 2 || s.k === 3) { const m = new THREE.Mesh(rampGeo(s), new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide })); m.receiveShadow = true; scene.add(m); }
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
    houseMesh[h.id] = { g, mb, bx, shake: 0 };
  }
  for (const f of World.fences) { const len = hyp(f.x1 - f.x0, f.z1 - f.z0), m = f.hedge ? box(0.8, 0.9, len, "#4f8f46", (f.x0 + f.x1) / 2, f.y + 0.45, (f.z0 + f.z1) / 2) : box(0.14, 1.0, len, "#fbf7ee", (f.x0 + f.x1) / 2, f.y + 0.5, (f.z0 + f.z1) / 2); m.rotation.y = Math.atan2(f.x1 - f.x0, f.z1 - f.z0); }

  for (const p of World.ponds) { const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 36).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#4fb4ee", transparent: true, opacity: 0.88 })); m.position.set(p.x, p.y + 0.07, p.z); scene.add(m); }
  // shortcuts: ziplines, the sewer pipe, the Sky Cannon, jump pads, boost pads, balloons
  for (const z of World.zips) {
    const a = new THREE.Vector3(z.x, z.y + 3, z.z), b = new THREE.Vector3(z.tx, z.ty + 3, z.tz), len = a.distanceTo(b), m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 5), mat("#2b323a"));
    m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); scene.add(m);
    box(0.3, 3.2, 0.3, "#8a5a34", z.x, z.y + 1.6, z.z); box(0.3, 3.2, 0.3, "#8a5a34", z.tx, z.ty + 1.6, z.tz); box(1.6, 0.14, 1.6, "#ffd84a", z.x, z.y + 0.07, z.z, null, false);
  }
  for (const e of World.PIPE.off ? [] : [World.PIPE.a, World.PIPE.b]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(World.PIPE.r, World.PIPE.r, 0.6, 20, 1, true), new THREE.MeshLambertMaterial({ color: "#4f9a5a", side: THREE.DoubleSide })); m.position.set(e.x, e.y + 0.3, e.z); m.castShadow = true; scene.add(m);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(World.PIPE.r, 0.22, 8, 24).rotateX(Math.PI / 2), mat("#5fb56b")); lip.position.set(e.x, e.y + 0.6, e.z); scene.add(lip);
    const dark = new THREE.Mesh(new THREE.CircleGeometry(World.PIPE.r - 0.05, 20).rotateX(-Math.PI / 2), basic("#10151a")); dark.position.set(e.x, e.y + 0.42, e.z); scene.add(dark);
    const eyes = new THREE.Group(); for (const x of [-0.35, 0.35]) { const w = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), basic("#ffffff")); w.position.set(x, 0, 0); const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), basic("#10151a")); p.position.set(x, 0.14, 0); eyes.add(w, p); }
    const bill = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 6), basic("#f08a24")); bill.position.set(0, 0.1, 0.3); eyes.add(bill); eyes.position.set(e.x, e.y + 1.0, e.z); scene.add(eyes); pipeEyes.push(eyes);
  }
  if (World.ISLES.length) { const C = World.CANNON, g = new THREE.Group(); g.position.set(C.x, C.y, C.z); scene.add(g);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(C.r + 0.4, C.r + 0.8, 0.5, 20), mat("#3d4650")); base.position.y = 0.25; g.add(base);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r, 0.1, 20), basic("#9aa8ff")); pad.position.y = 0.55; g.add(pad);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 6, 14, 1, true), new THREE.MeshLambertMaterial({ color: "#5a6472", side: THREE.DoubleSide })); barrel.position.set(-2.6, 2.2, 0); barrel.rotation.z = -0.9; barrel.castShadow = true; g.add(barrel); }
  for (const p of World.pads) { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.16, 18), mat("#35c4de")); m.position.set(p.x, p.y + 0.08, p.z); scene.add(m); const r = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.16, 6, 18).rotateX(Math.PI / 2), mat("#ffffff")); r.position.set(p.x, p.y + 0.16, p.z); scene.add(r); }


  for (const b of World.balloons) { const g = new THREE.Group(); g.position.set(b.x, b.y, b.z); scene.add(g); box(1.6, 1.0, 1.6, "#b9824f", 0, 0.9, 0, g);
    const top = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), mat("#ff6b6b")); top.position.y = 6; top.scale.y = 1.15; g.add(top); const band = new THREE.Mesh(new THREE.SphereGeometry(2.64, 16, 6, 0, TAU, 1.2, 0.7), mat("#ffffff")); band.position.y = 6; band.scale.y = 1.15; g.add(band);
    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) box(0.05, 3.2, 0.05, "#5a4632", x, 2.8, z, g, false); b.g = g; g.scale.setScalar(1.8);   // (owner, 2026-11-11) big, and it takes you from anywhere in its ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(BALLOON_R - 0.5, BALLOON_R, 48).rotateX(-Math.PI / 2), basic("#ff6b6b", 0.55)), fill = new THREE.Mesh(new THREE.CircleGeometry(BALLOON_R - 0.5, 48).rotateX(-Math.PI / 2), basic("#ff6b6b", 0.14)); ring.position.set(b.x, b.y + 0.08, b.z); fill.position.set(b.x, b.y + 0.07, b.z); scene.add(ring, fill); }
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
  // (owner, 2026-11-11) each area's chasers: dogs (pup), cats, gators, bears, wolves
  gator: { plan: "quad", body: [0.75, 0.42, 1.9], leg: 0.24, legW: 0.26, head: 0.5, snout: 0.8, low: true, tail: "thick", spikes: true, nose: "#1d232a" },
  bear: { plan: "quad", round: true, body: [1.1, 1.0, 1.45], leg: 0.5, legW: 0.36, head: 0.72, roundHead: true, snout: 0.24, snoutC: "a", ears: "round", tail: "stub", nose: "#1d232a" },
  wolf: { plan: "quad", body: [0.66, 0.62, 1.35], leg: 0.62, head: 0.56, snout: 0.42, ears: "point", tail: "bushy", nose: "#1d232a" },
  goat: { plan: "quad", body: [0.6, 0.62, 1.1], leg: 0.55, head: 0.5, snout: 0.3, ears: "side", horns: "curl", beard: true, tail: "stub" },
};
// (owner, 2026-11-11) a Shiny keeps its coat and sparkles: little stars twinkle on and around it all the time
const SPARK = ["#ffffff", "#fff6c2", "#c9f0ff", "#ffd1f3"];
function sparkle(x, y, z, sc, dt) { if (Math.random() < dt * 10) emit(x, y + 0.9 * sc, z, 1, { colors: SPARK, speed: 0.15, up: 0.3, life: 0.75, grav: 0, size: 0.24, spread: 1.7 * sc, tw: 1 }); }
const RAINBOW = ["#ff6b6b", "#ffb84d", "#ffe66b", "#7ee08a", "#6bb8ff", "#b48cff"];
// (owner, 2026-11-09) a pet grows with its level but its rider stays the same size, so a big pet feels big
function sizePet(m, sc) { m.g.scale.setScalar(sc); if (m.rider) { m.rider.scale.setScalar(0.8 / sc); m.rider.position.y = m.seat - 0.52 / sc; m.top = m.seat * sc + 1.4; } else m.top *= sc; }
function petModel(sp, rider, va, r = 0) {   // sp: a mount's kind (r: its rarity, for its coat), or { look, c, a, size }; va: 1 Shiny (the same coat: it sparkles)
  let riderG = null;
  if (typeof sp !== "object") { const M = World.MOUNTS[sp] || World.MOUNTS.dog, [c, a] = World.coat(sp, r); sp = { look: M.look, c, a, size: M.size }; }
  const s = sp, L = LOOK[s.look] || LOOK.pup, k = s.size, g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const legs = [], wings = [], tails = [], head = new THREE.Group();
  const C = s.c, A = s.a; void va;
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
function portrait(sp, va = 0, r = 0) {
  const key = sp + va + "/" + r; if (PORTRAITS[key]) return PORTRAITS[key];
  const m = petModel(sp, null, va, r); m.g.rotation.y = 0.7; pScene.add(m.g);
  const L = LOOK[(World.MOUNTS[sp] || World.MOUNTS.dog).look] || {}, k = (World.MOUNTS[sp] || World.MOUNTS.dog).size, wide = L.wings === "bat" || L.wings === "feather" && L.plan === "quad" || L.plan === "butterfly" ? 1.35 : 1, tall = (L.neck || 0) + (L.leg || 0.5) > 1.5 ? 1.3 : 1;
  pCam.position.set(0, 2.4 * k * wide * tall, 5.6 * k * wide * tall); pCam.lookAt(0, 1.0 * k * tall, 0);
  portraitR.render(pScene, pCam); pScene.remove(m.g);
  if (!va) return (PORTRAITS[key] = portraitR.domElement.toDataURL());
  // a Shiny's picture has its sparkles: four-pointed stars over it
  const cv = document.createElement("canvas"), W2 = (cv.width = portraitR.domElement.width), H2 = (cv.height = portraitR.domElement.height), x = cv.getContext("2d"); x.drawImage(portraitR.domElement, 0, 0);
  const star = (cx, cy, s, c) => { x.fillStyle = c; x.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, d = i % 2 ? s * 0.28 : s; x.lineTo(cx + Math.sin(a) * d, cy - Math.cos(a) * d); } x.closePath(); x.fill(); };
  for (const [u, v, s, c] of [[0.2, 0.22, 0.09, "#ffffff"], [0.8, 0.3, 0.07, "#fff6c2"], [0.7, 0.75, 0.06, "#c9f0ff"], [0.28, 0.66, 0.05, "#ffd1f3"], [0.55, 0.12, 0.045, "#ffffff"]]) { x.shadowColor = "#ffffff"; x.shadowBlur = W2 * 0.03; star(u * W2, v * H2, s * W2, c); }
  return (PORTRAITS[key] = cv.toDataURL());
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
// (owner, 2026-11-11) each area's chasers (in the coat of the mount of their kind and rarity), and every animal's rarity: a bit bigger for each rank, and a ring of its rarity's
// color at its feet (none for Common); Epic and Legendary ones sparkle
const KIND = {
  dog: { look: "pup", size: 0.8 },
  cat: { look: "cat", size: 0.78 },
  gator: { look: "gator", size: 0.9 },
  bear: { look: "bear", size: 1.05 },
  wolf: { look: "wolf", size: 0.9 },
  fox: { look: "fox", size: 0.85 }, raptor: { look: "raptor", size: 0.85 }, trike: { look: "trike", size: 0.85 }, trex: { look: "trex", size: 0.75 }, unicorn: { look: "unicorn", size: 0.85 },   // (owner, 2026-11-12) zones 6 to 10
};
function rarityRing(g, r, rad) { if (!r) return; const m = new THREE.Mesh(new THREE.RingGeometry(rad * 0.8, rad, 32).rotateX(-Math.PI / 2), basic(RARITY_C[r], 0.75)); m.position.y = 0.06; g.add(m); g.userData.rar = r; }
function buildAnimals() {
  for (const d of World.dogs) { const K = KIND[d.sp], [c, a] = World.coat(d.sp, d.r), m = petModel({ look: K.look, c, a, size: K.size * (1 + 0.08 * d.r) }); /* (owner, 2026-11-11) the same coat as the mount of that kind and rarity */ m.g.position.set(d.hx, d.y, d.hz); scene.add(m.g); blobUnder(m.g, 1.6 * K.size); rarityRing(m.g, d.r, 1.1 * K.size);
    const bang = textSprite("!", { size: 64, color: "#ffffff", bg: "#e5534b" }); bang.position.y = 2.3; bang.visible = false; m.g.add(bang); dogMesh.push({ m, bang, x: d.hx, z: d.hz, yaw: 0, tx: d.hx, tz: d.hz, tyaw: 0, mode: 0, y: d.y, ty: d.y }); }
  for (const q of World.geese) { const m = gooseModel(); m.g.scale.setScalar(1 + 0.08 * q.r); m.g.position.set(q.x, q.y, q.z); scene.add(m.g); blobUnder(m.g, 1.2); rarityRing(m.g, q.r, 0.8); gooseMesh.push({ m, x: q.x, y: q.y, z: q.z, yaw: 0, tx: q.x, ty: q.y, tz: q.z, tyaw: 0, mode: 0, carry: -1, box: null }); }
  for (const q of World.goats) { const m = petModel({ look: "goat", c: "#e9e4dc", a: "#8a7a66", size: 0.95 * (1 + 0.08 * q.r) }); m.g.position.set(q.hx, q.y, q.hz); scene.add(m.g); blobUnder(m.g, 1.7); rarityRing(m.g, q.r, 1.0); goatMesh.push({ m, x: q.hx, z: q.hz, yaw: Math.PI / 2, tx: q.hx, tz: q.hz, tyaw: Math.PI / 2, mode: 0, y: q.y }); }
}
// a parcel: its tier's color, taped; modifiers show on it
function parcelMesh(tier, mod) {
  const g = new THREE.Group(), s = 0.72, c = TIERS[tier].c;
  const b = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color: c })); b.scale.setScalar(s); b.position.y = s / 2; b.castShadow = true; g.add(b);
  box(s * 1.02, s * 0.16, s * 1.02, "#fff8e6", 0, s / 2, 0, g, false); box(s * 0.16, s * 1.02, s * 1.02, "#fff8e6", 0, s / 2, 0, g, false);
  if (mod === "express") box(s * 0.5, s * 1.04, s * 0.3, "#3a8ee6", 0, s / 2, s * 0.2, g, false);
  g.userData.s = s; return g;
}

// ---- little bits that fly: confetti, sparkles, dust, splinters ----
const PN = 900, pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.35), new THREE.MeshBasicMaterial(), PN), parts = [], pDummy = new THREE.Object3D(), pCol = new THREE.Color();
pMesh.frustumCulled = false; pMesh.count = 0; scene.add(pMesh);
function emit(x, y, z, n, { colors = ["#ffffff"], speed = 4, up = 4, life = 0.9, size = 0.16, grav = 12, spread = 0.3, tw = 0, dir = null } = {}) {   // dir: [x, y, z] sends them that way (a gust's streaks) instead of all around
  for (let k = 0; k < n && parts.length < PN; k++) { const a = Math.random() * TAU, v = speed * (0.4 + Math.random() * 0.6);
    parts.push({ x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, z: z + (Math.random() - 0.5) * spread, vx: dir ? dir[0] * v : Math.cos(a) * v, vy: dir ? dir[1] * v : up * (0.5 + Math.random() * 0.8), vz: dir ? dir[2] * v : Math.sin(a) * v, t: 0, life: life * (0.6 + Math.random() * 0.6), size: size * (0.7 + Math.random() * 0.6), grav, c: pick(colors), r: Math.random() * 6, tw }); }
}
function stepParts(dt) {
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += dt; if (p.t >= p.life) { parts.splice(i, 1); continue; } p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
  for (const p of parts) { const k = 1 - p.t / p.life; pDummy.position.set(p.x, p.y, p.z); pDummy.rotation.set(p.r + p.t * 7, p.r * 2 + p.t * 5, 0); pDummy.scale.setScalar(p.size * (p.tw ? Math.sin(Math.PI * p.t / p.life) : 0.4 + 0.6 * k));   /* a sparkle twinkles: grows, then shrinks away */ pDummy.updateMatrix(); pMesh.setMatrixAt(n, pDummy.matrix); pMesh.setColorAt(n, pCol.set(p.c)); n++; }
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
  bark: () => { for (const a of [0, 0.16]) { tone(420, 180, 0.11, { type: "sawtooth", vol: 0.4, at: a }); noise(0.09, { freq: 900, vol: 0.25, at: a }); } },
  meow: () => { tone(700, 1100, 0.12, { type: "triangle", vol: 0.35 }); tone(1100, 600, 0.22, { type: "triangle", vol: 0.35, at: 0.12 }); },   // (owner, 2026-11-11) each area's chasers have their own call
  howl: () => { tone(400, 760, 0.35, { type: "sine", vol: 0.35 }); tone(760, 640, 0.4, { type: "sine", vol: 0.3, at: 0.35 }); }, growl: () => tone(140, 90, 0.4, { type: "sawtooth", vol: 0.3 }),
  crack: () => { noise(0.12, { freq: 2600, vol: 0.6 }); tone(300, 90, 0.15, { type: "square", vol: 0.3 }); }, smash: () => { noise(0.45, { freq: 1800, to: 300, vol: 0.7 }); tone(200, 50, 0.4, { type: "sawtooth", vol: 0.4 }); },
  stun: () => { for (let k = 0; k < 4; k++) tone(900 - k * 90, 1300 - k * 90, 0.12, { at: k * 0.1, vol: 0.2, type: "triangle" }); }, swish: () => noise(0.16, { freq: 700, to: 2600, vol: 0.4 }),
  kick: () => { noise(0.1, { freq: 300, vol: 0.9, type: "lowpass" }); tone(180, 60, 0.18, { type: "square", vol: 0.5 }); }, honk: () => { tone(330, 300, 0.16, { type: "sawtooth", vol: 0.35 }); tone(300, 250, 0.22, { type: "sawtooth", vol: 0.35, at: 0.18 }); },
  busted: () => { for (const [k, f] of [523, 659, 784, 1047].entries()) tone(f, f, 0.14, { at: k * 0.08, type: "square", vol: 0.25 }); }, deliver: () => { for (const [k, f] of [523, 659, 784, 1047, 1319].entries()) tone(f, f, 0.16, { at: k * 0.06, type: "triangle", vol: 0.4 }); },
  coin: () => { tone(1320, 1320, 0.06, { type: "square", vol: 0.15 }); tone(1760, 1760, 0.12, { at: 0.06, type: "square", vol: 0.15 }); }, tick: () => tone(880, 880, 0.03, { type: "square", vol: 0.12 }),
  win: (n) => { const base = [392, 440, 523, 659, 784][n]; for (let k = 0; k < 2 + n; k++) tone(base * [1, 1.25, 1.5, 2, 2.5, 3][k], base * [1, 1.25, 1.5, 2, 2.5, 3][k], 0.22, { at: k * 0.09, type: n >= 3 ? "sawtooth" : "triangle", vol: 0.3 }); },
  beat: () => { tone(90, 60, 0.12, { type: "sine", vol: 0.7 }); tone(80, 55, 0.12, { type: "sine", vol: 0.5, at: 0.14 }); },   // (owner, 2026-11-11) a rare parcel's build-up
  fanfare: (n) => { const ch = [[523, 659, 784], [587, 740, 880], [659, 831, 988], [784, 988, 1175]]; ch.forEach((c, k) => c.forEach((f) => tone(f * (n >= 4 ? 1.5 : 1), f * (n >= 4 ? 1.5 : 1), k === 3 ? 0.7 : 0.16, { at: 0.25 + k * 0.13, type: "square", vol: 0.12 }))); noise(0.6, { freq: 6000, vol: 0.12, at: 0.25 }); },
  unlock: () => { tone(220, 880, 0.6, { type: "sawtooth", vol: 0.18 }); for (const [k, f] of [523, 784, 1047, 1568].entries()) tone(f, f, 0.3, { at: 0.5 + k * 0.1, type: "triangle", vol: 0.3 }); noise(1.0, { freq: 800, to: 4000, vol: 0.15 }); },
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
// (owner, 2026-11-11) the same tune in every area, a little different in each: Main Street as it is; Maple Suburbs with a
// soft chime an octave up; Goose Marsh a touch slower and reedy, with a bluesy note or two; Cliffside brassier over a
// deeper bass; the Floating Islands an octave up, airy, with an echo. It changes at the start of the next loop.
const MUSIC_V = [
  { w: "triangle", k: 1, step: 0.21, vol: 0.5 },
  { w: "triangle", k: 1, step: 0.21, vol: 0.5, chime: true },
  { w: "square", k: 1, step: 0.23, vol: 0.2, swap: { 659: 622, 880: 831 } },
  { w: "sawtooth", k: 1, step: 0.2, vol: 0.22, bassK: 0.5 },
  { w: "sine", k: 2, step: 0.22, vol: 0.42, echo: true },
  { w: "sine", k: 2, step: 0.24, vol: 0.4, chime: true },   // (owner, 2026-11-12) zones 6 to 10: the same tune, each its own sound
  { w: "triangle", k: 1, step: 0.2, vol: 0.45, swap: { 659: 622 } },
  { w: "square", k: 0.5, step: 0.19, vol: 0.18, bassK: 0.5 },
  { w: "sawtooth", k: 0.5, step: 0.18, vol: 0.2, swap: { 784: 740 } },
  { w: "sine", k: 2, step: 0.26, vol: 0.4, echo: true, chime: true },
];
let musicZone = 0;
function startMusic() {   // a bouncy two-bar loop
  const tune = [523, 0, 659, 784, 0, 659, 523, 0, 587, 0, 698, 880, 0, 698, 587, 0], bass = [131, 131, 196, 196, 147, 147, 196, 196]; let n = 0, next = AC.currentTime + 0.2, V = MUSIC_V[0];
  const note = (f, type, at, len, vol) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + len * 0.95); o.connect(g); g.connect(musGain); o.start(at); o.stop(at + len); };
  setInterval(() => { if (!AC || AC.state !== "running") return; while (next < AC.currentTime + 0.5) {
    if (n % tune.length === 0) V = MUSIC_V[musicZone] || MUSIC_V[0];
    const step = V.step, f0 = tune[n % tune.length], f = f0 ? ((V.swap && V.swap[f0]) || f0) * V.k : 0;
    if (f) { note(f, V.w, next, step, V.vol); if (V.chime && n % 4 === 2) note(f * 2, "sine", next, step * 1.6, 0.18); if (V.echo) note(f, "sine", next + step * 1.5, step, 0.14); }
    if (n % 2 === 0) { const o = AC.createOscillator(), g = AC.createGain(); o.type = "sine"; o.frequency.value = bass[(n / 2) % bass.length] * (V.bassK || 1); g.gain.setValueAtTime(0.6, next); g.gain.exponentialRampToValueAtTime(0.0001, next + step * 1.8); o.connect(g); g.connect(musGain); o.start(next); o.stop(next + step * 2); }
    n++; next += step; } }, 200);
}
addEventListener("pointerdown", () => { const a = audio(); if (a && a.state === "suspended") a.resume(); }, { capture: true });
addEventListener("keydown", () => { const a = audio(); if (a && a.state === "suspended") a.resume(); }, { capture: true });

// ---- the courier's data (the server's copy; this page only shows it) and me ----
let save = World.cleanData({});
const riding = () => save.mounts.find((m) => m.id === save.ride) || save.mounts[0];
const myStats = () => World.mountStats(riding(), World.districtAt(me.x, me.z, me.y));   // (owner, 2026-11-12) faster short of its own zone, slower past it
const me = { x: World.SPAWN.x, y: 0, z: World.SPAWN.z, yaw: Math.PI / 2, vx: 0, vz: 0, vy: 0, px: 0, pz: 0, ground: true, moving: false, foot: false, footT: 0, stun: 0, grace: 0, jumps: 0, boost: 0, dash: 0, abilityAt: -99, bigAt: -99, kickT: 0, transit: null, armed: true, mx: 0, my: 0, mz: 0, myaw: 0, hidden: false, glide: false, stepT: 0 };
let mine = null, walker = null, myTag = null, bag = [], stolen = [], dropped = [], cap = 1, belt = { ready: null, next: null };   // my parcels: on the saddle, with geese, on the ground
function makeTag(name, rank, r) { return textSprite(String(name || "Courier").slice(0, 18), { size: 34, badge: rank ? World.RANK_C[rank] : "", glow: r >= 4 ? "#ffd84a" : "" }); }
function rigMount(sp, va, r, shirt, name, rank) {   // a mount with its rider, name tag and (hidden) walking courier
  const m = petModel(MOUNTS[sp] ? sp : "dog", shirt, va, r); sizePet(m, World.mountScale({ r })); const tag = makeTag(name, rank, r); tag.position.y = (m.top + 0.9) / m.g.scale.x; tag.scale.multiplyScalar(1 / m.g.scale.x); m.g.add(tag);
  const w = courierModel(shirt); w.g.visible = false; scene.add(w.g); scene.add(m.g); blobUnder(m.g, 2.2 * (m.k || 1)); blobUnder(w.g, 1.1);
  const slot = new THREE.Group(); slot.position.set(0, m.seat + 0.02, -0.75 * m.k); slot.scale.setScalar(1 / m.g.scale.x); m.body.add(slot);
  return { m, tag, w, slot, sc: m.g.scale.x, va, r };
}
function unrig(r) { if (!r) return; scene.remove(r.m.g, r.w.g); }
function setCarry(r, c) { r.slot.clear(); let y = 0; for (const [tier, mod] of c || []) { const b = parcelMesh(tier, mod); b.scale.setScalar(1.4); b.position.y = y; b.rotation.y = (y * 1.7) % 0.6 - 0.3; y += b.userData.s * 1.4; r.slot.add(b); } }   // (owner, 2026-11-11) a box for each parcel, stacked, and big
const bagCarry = () => bag.map((q) => [q.tier, q.mod]);
// (owner, 2026-11-12) the podiums by the post office: the server's three best mounts, each with its courier's name
const podMesh = [null, null, null];
let lastPods = [];
function setPods(pods) { lastPods = pods; for (let n = World.PODIUM.spots.length; n < podMesh.length; n++) if (podMesh[n]) { scene.remove(podMesh[n].m.g); podMesh[n] = null; }
  World.PODIUM.spots.forEach((q, n) => { const P = pods[n] || null, o = podMesh[n], key = P ? [P.id, P.sp, P.r, P.va, P.name, q.x, q.y, q.z].join() : "";
    if (o && o.key === key) return; if (o) scene.remove(o.m.g); podMesh[n] = null; if (!P) return;
    const m = petModel(MOUNTS[P.sp] ? P.sp : "dog", null, P.va, P.r); sizePet(m, World.mountScale(P)); m.g.position.set(q.x, q.y, q.z); m.g.rotation.y = 0;
    const tag = textSprite(String(P.name || "").slice(0, 18), { size: 30, glow: P.va ? "#bfe6ff" : P.r >= 4 ? "#ffd84a" : "" }); tag.position.y = (m.top + 0.8) / m.g.scale.x; tag.scale.multiplyScalar(1 / m.g.scale.x); m.g.add(tag);
    scene.add(m.g); podMesh[n] = { m, key, va: P.va, sc: World.mountScale(P) * MOUNTS[P.sp].size, x: q.x, y: q.y, z: q.z }; });
}
function stepPods(dt, t) { for (const P of podMesh) if (P) { P.m.g.rotation.y = Math.sin(t * 0.6) * 0.5; if (P.va) sparkle(P.x, P.y, P.z, P.sc, dt); } }
function remount() { unrig(mine); const q = riding(); mine = rigMount(q.sp, q.va, q.r, save.set.shirt, myName, World.rankOf(World.upTotal(save.up))); setCarry(mine, bagCarry()); }

// ---- moving ----
const keys = new Set(), joy = { id: null, x: 0, y: 0, ox: 0, oy: 0 }, cam = { yaw: -Math.PI / 2, pitch: 0.42, dist: 12, shake: 0 };
let jumpHeld = false, jumpTap = false, hitStop = 0;
const GRAV = 24, now = () => performance.now() / 1000;
let clockOff = 0; const srvNow = () => (Date.now() + clockOff) / 1000;
// (owner, 2026-11-13) coyote time: a jump still works for a moment after running off an edge
const onGround = () => me.ground || me.coyote > 0;
function tryJump() {
  if (me.stun > 0 || me.transit || !onGround()) return; const st = myStats();
  me.vy = me.foot ? 7.5 : st.jump; me.ground = false; me.coyote = 0; sfx("jump"); emit(me.x, me.y + 0.1, me.z, 5, { colors: ["#e9e2d2"], speed: 2, up: 1, life: 0.4, grav: 2 });
}
// (owner, 2026-11-13) the Big Jump, on every mount (instead of the bonk and the animals' abilities)
function bigJump() {
  const t = now(); if (me.stun > 0 || me.transit || me.foot || !onGround() || t < me.bigAt + World.BIG_JUMP.cd) return; me.bigAt = t;
  me.vy = myStats().jump * World.BIG_JUMP.x; me.ground = false; me.coyote = 0; me.squash = 0.2; sfx("jump"); sfx("boost"); cam.shake = Math.max(cam.shake, 0.2);
  emit(me.x, me.y + 0.1, me.z, 22, { colors: ["#e9e2d2", "#ffffff"], speed: 5, up: 2, life: 0.5, grav: 4 });
}
function doWhistle() {   // (owner, 2026-11-11) instant: back on your mount at once, even while stunned
  sfx("whistle"); if (me.transit) return;
  if (me.foot) { me.foot = false; me.footT = 0; mine.m.g.visible = true; emit(me.x, me.y + 0.3, me.z, 14, { colors: ["#e9e2d2", "#ffffff"], speed: 4, up: 1.5, life: 0.5, grav: 3 }); me.vy = 4; me.ground = false; }
  else me.hop = 0.3;
}
function arc(bx, by, bz, T, H, k) { me.transit = { k: "arc", ax: me.x, ay: me.y, az: me.z, bx, by, bz, T, H, t: 0, kind: k }; me.vx = me.vz = me.vy = me.px = me.pz = 0; }
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
let tubeAsk = 0;
// (owner, 2026-11-14) at the respawn point: facing its arrow, the camera straight behind you looking the same way, 30 degrees down
function faceSpawn() { me.yaw = World.SPAWN.yaw; cam.yaw = me.yaw + Math.PI; cam.pitch = Math.PI / 6; cam.d = undefined; camAt.y = me.y + 2.4; }
function stepMe(dt) {
  const t = now(); musicZone = World.districtAt(me.x, me.z, me.y);
  if (me.stun > 0) { me.stun -= dt; if (me.stun <= 0) { me.stun = 0; me.footT = 2.2; } }
  if (me.transit) { stepTransit(dt); return; }
  const st = myStats(), q = riding();
  if (World.blocked(me.x, me.z, me.y)) out: for (let r = 1; r < 16; r++) for (let k = 0; k < 12; k++) { const x = me.x + Math.cos((k / 12) * TAU) * r, z = me.z + Math.sin((k / 12) * TAU) * r; if (!World.blocked(x, z, me.y) && World.surfaceAt(x, z, me.y + 0.5) > -1e9) { me.x = x; me.z = z; break out; } }   // inside something solid (it shouldn't happen): out to the nearest clear spot
  // what the player's asking for, relative to the camera
  let ix = 0, iz = 0;
  if (!chatting && !panelOpen() && !cine && !free && !rewardLock()) {   /* (owner, 2026-11-12) no riding while the reward screen is up */ if (keys.has("KeyW") || keys.has("ArrowUp")) iz += 1; if (keys.has("KeyS") || keys.has("ArrowDown")) iz -= 1; if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1; if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1; }
  if (!cine && !free && !rewardLock()) { ix += joy.x; iz -= joy.y; } const il = hyp(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  let mx = -Math.sin(cam.yaw) * iz + Math.cos(cam.yaw) * ix, mz = -Math.cos(cam.yaw) * iz - Math.sin(cam.yaw) * ix;
  if (me.stun > 0) mx = mz = 0;
  const kind = me.ground ? World.groundKind(me.x, me.z, me.y) : "", mud = kind === "mud" && !World.inPond(me.x, me.z, me.y) ? World.MUD_SLOW : kind === "mud" ? 0.6 : kind === "sand" ? World.SAND_SLOW : kind === "water" ? World.WATER_SLOW : 1;   // (owner, 2026-11-12) sand and the jungle's rivers slow you too
  const zoneNow = World.districtAt(me.x, me.z, me.y);
  if (me.boost > 0) me.boost -= dt;
  // (owner, 2026-11-13) a mount goes its own speed once it's crossed a start line, until it's back at the post office (no start lines: always)
  if (World.inSafeZone(me.x, me.z, me.y)) me.started = false; else if (World.onStart(me.x, me.z, me.y)) me.started = true;
  const real = !World.starts.length || me.started; if (real && !me.real && !me.foot) { sfx("boost"); cam.shake = Math.max(cam.shake, 0.15); emit(me.x, me.y + 1, me.z, 24, { colors: ["#c77dff", "#ffffff", "#e2b8ff"], speed: 4, up: 2, life: 0.6, grav: 0, size: 0.2 }); } me.real = real;
  let speed = me.foot ? 5.5 : (real ? st.speed : World.BASE_SPEED) * (bag.length ? 1 : World.EMPTY_FAST) * mud   // (owner, 2026-11-11) a parcel weighs you down: empty-handed you ride back much faster
    * (me.boost > 0 ? 1.6 : 1);
  const grip = Math.max(70, speed * 7), steer = hyp(mx, mz) > 0.08, acc = (me.ground ? (kind === "ice" ? grip * World.ICE_GRIP : grip) : steer ? Math.max(12, speed * 1.1) : 0) * dt,   /* (owner, 2026-11-13) a jump keeps the speed it left the ground with: no stopping in the air, only a gentle steer */   /* (owner, 2026-11-12) no drifting: quick to speed up and stop however fast it goes */   /* (owner, 2026-11-12) ice: hard to start, turn and stop */ tvx = mx * speed, tvz = mz * speed;
  me.vx += clamp(tvx - me.vx, -acc, acc); me.vz += clamp(tvz - me.vz, -acc, acc);
  me.moving = hyp(me.vx, me.vz) > 0.6;
  if (hyp(mx, mz) > 0.08) me.yaw = angDiff(me.yaw + angDiff(Math.atan2(mx, mz), me.yaw) * Math.min(1, 12 * dt), 0);   // kept within a turn (owner, 2026-11-11: others saw you sideways)
  // jumping, gliding, falling
  if (jumpTap) { jumpTap = false; tryJump(); }
  me.vy -= GRAV * dt;
  if (kind === "lava" && me.vy <= 0 && !me.foot) { me.vy = 11; me.ground = false; sfx("pop"); emit(me.x, me.y + 0.2, me.z, 18, { colors: ["#ff6a1f", "#ffd84a", "#c8401e"], speed: 4, up: 5, life: 0.6, grav: 8, size: 0.2 }); }   // lava bounces you off (the server burns a parcel)
  // sprinklers shove you sideways; wind pushes across the islands
  const sn = srvNow();
  for (const s of World.sprinklers) { const d = hyp(me.x - s.x, me.z - s.z); if (d < World.SPRINKLER.r && Math.abs(me.y - s.y) < 2 && World.sprinklerOn(s, sn)) { const k = World.SPRINKLER.push * dt * 3 / Math.max(d, 0.6); me.px += (me.x - s.x) * k; me.pz += (me.z - s.z) * k; } }

  // (owner, 2026-11-13) a gust blows you the way it's turned while it's on; a turbine's updraft lifts you
  const gu = World.gustAt(me.x, me.z, me.y + 0.5, sn); if (gu) { me.px += gu.dx * gu.pw * dt * 3.2; me.pz += gu.dz * gu.pw * dt * 3.2; }
  if (!me.foot && World.updraftAt(me.x, me.z, me.y)) { me.vy = Math.min(World.TURBINE.max, Math.max(me.vy, 0) + World.TURBINE.lift * dt); me.ground = false; me.coyote = 0; }
  const pl = hyp(me.px, me.pz), PMAX = gu ? Math.max(16, gu.pw) : 16; if (pl > PMAX) { me.px *= PMAX / pl; me.pz *= PMAX / pl; } const dec = Math.exp(-3.2 * dt); me.px *= dec; me.pz *= dec;
  // sideways, stopping at walls
  // (in small steps, riding up slopes as it goes, so a slow frame can't jam you against a ramp)
  // (owner, 2026-11-11) a mount is as wide as it looks: the bigger it's grown, the farther from a wall, hedge or tree it stops
  let BR = me.foot ? 0.55 : clamp(0.55 + 0.32 * (World.mountScale(q) * MOUNTS[q.sp].size - 1), 0.55, 1.05);
  if (BR > 0.55 && World.blocked(me.x, me.z, me.y, BR)) BR = 0.55;
  const OPEN = World.openFor(save), gated = (nx, nz) => World.gateBlocked(nx, nz, me.y, OPEN, BR) && !World.gateBlocked(me.x, me.z, me.y, OPEN, BR);   // (owner, 2026-11-13) a closed gate stops you (already in one: you can walk out)   // (owner, 2026-11-11) a closed area's gate: heading east stops at it (west is always fine)   // already up against something (it just grew, or landed there): the old width until it's clear
  const DX = (me.vx + me.px) * dt, DZ = (me.vz + me.pz) * dt, n = Math.max(1, Math.ceil(hyp(DX, DZ) / 0.3));
  // (owner, 2026-11-13) on the ground with no direction held, you can slide but never off the edge you're on
  // a moving platform you stand on carries you along
  if (me.ground && me.onMv) { const p = World.moverPos(me.onMv.q, sn); if (!World.blocked(me.x + p.x - me.onMv.p.x, me.z + p.z - me.onMv.p.z, me.y, BR)) { me.x += p.x - me.onMv.p.x; me.z += p.z - me.onMv.p.z; } me.y += p.y - me.onMv.p.y; me.onMv.p = p; }
  const topAt = (x, z, y) => { const mv = World.moverUnder(x, z, y, sn); return Math.max(World.surfaceAt(x, z, y), mv ? mv.top : -Infinity); };
  const hold = me.ground && !steer, edge = (nx, nz) => hold && topAt(nx, nz, me.y + 0.1) < me.y - 0.45;
  for (let k = 0; k < n; k++) {
    const dx = DX / n, dz = DZ / n;
    if (me.vx || me.px) { if (!World.blocked(me.x + dx, me.z, me.y, BR) && !gated(me.x + dx, me.z) && !edge(me.x + dx, me.z)) me.x += dx; else { me.vx = 0; me.px = 0; } }
    if (me.vz || me.pz) { if (!World.blocked(me.x, me.z + dz, me.y, BR) && !gated(me.x, me.z + dz) && !edge(me.x, me.z + dz)) me.z += dz; else { me.vz = 0; me.pz = 0; } }
    if (me.ground) { const g = World.surfaceAt(me.x, me.z, me.y + 0.1); if (g > me.y && g - me.y < 0.6) me.y = g; }
  }
  // down (or up a step) onto the ground
  const was = me.ground, y0 = me.y; me.y += me.vy * dt;
  if (World.wallAt(me.x, me.z, me.y) && !World.wallAt(me.x, me.z, y0)) me.y = y0;   // never down into something solid
  const yq = Math.max(y0, me.y) + (was ? 0.1 : 0), mv = World.moverUnder(me.x, me.z, yq, sn); let s = World.surfaceAt(me.x, me.z, yq);   // the ground under where this step began, so a fast fall can't pass through it
  if (mv && mv.top >= s) { s = mv.top; me.onMv = me.onMv && me.onMv.q.id === mv.q.id ? me.onMv : { q: mv.q, p: mv.p }; } else me.onMv = null;
  if (s > -1e9 && me.vy <= 0 && (me.y <= s || (was && me.y - s < 0.45))) { if (!was && me.vy < -9) { emit(me.x, s + 0.1, me.z, 8, { colors: ["#e9e2d2"], speed: 3, up: 1, life: 0.4, grav: 3 }); } me.y = s; me.vy = 0; me.ground = true; me.jumps = 0; me.coyote = World.COYOTE; }
  else { me.ground = false; me.coyote = (me.coyote || 0) - dt; }
  if (me.y < -45) { me.x = World.SPAWN.x; me.z = World.SPAWN.z; me.y = World.SPAWN.y; me.vy = 0; faceSpawn(); }   // nothing below the town (the server sets you back on an island)
  // off the mount after a stun: on foot until the mount's back under you (it comes on its own, or at a whistle)
  if (me.foot && me.stun <= 0) { me.footT -= dt; if (me.footT <= 0 || hyp(me.x - me.mx, me.z - me.mz) < 1.4) doWhistle(); }
  if (!me.armed && !nearTrigger()) me.armed = true;
  if (me.stun <= 0) triggers(t);
  if (me.stun <= 0 && t > tubeAsk) { const p = World.pipeAt(me.x, me.z, me.y); if (p) { tubeAsk = t + 0.5; netSend({ t: "tube", id: p.id }); } }   // (owner, 2026-11-13) riding into a linked pipe's mouth
  if (me.boost > 0 && me.moving) emit(me.x - Math.sin(me.yaw) * 1.4, me.y + 1, me.z - Math.cos(me.yaw) * 1.4, 1, { colors: ["#ffffff", "#ffd84a"], speed: 1, up: 0.3, life: 0.3, grav: 0, size: 0.16, spread: 1.4 });   // speed streaks
  // footsteps: dust; a Legendary leaves sparkles
  if (me.ground && me.moving) { me.stepT -= dt; if (me.stepT <= 0) { me.stepT = 0.16; trail(me.x, me.y, me.z, q, kind); } }
  if (q.va) { const f = me.foot; sparkle(f ? me.mx : me.x, f ? me.my : me.y, f ? me.mz : me.z, World.mountScale(q) * MOUNTS[q.sp].size, dt); }
}
function trail(x, y, z, q, kind) {
  if (q.tr === "spark") emit(x, y + 0.6, z, 2, { colors: ["#ffd84a", "#ffffff", "#ffb347"], speed: 1.6, up: 1.8, life: 0.5, grav: 4, size: 0.1 });   // (owner, 2026-11-12) the Aura trails
  else if (q.tr === "bubble") emit(x + (Math.random() - 0.5) * 0.8, y + 0.5, z + (Math.random() - 0.5) * 0.8, 1, { colors: ["#bfe6ff", "#e8f6ff", "#9fd8ff"], speed: 0.2, up: 0.9, life: 1.4, grav: -0.4, size: 0.3 });
  else if (q.tr === "heart") emit(x, y + 0.7, z, 1, { colors: ["#ff5c8a", "#ff9ab8", "#ffd1e0"], speed: 0.3, up: 1.1, life: 1.1, grav: -0.6, size: 0.24, tw: 1 });
  else if (q.tr === "flame") for (let k = 0; k < 2; k++) emit(x + (Math.random() - 0.5) * 0.6, y + 0.3, z + (Math.random() - 0.5) * 0.6, 1, { colors: ["#ff6a1f", "#ffb347", "#ffd84a", "#c8401e"], speed: 0.3, up: 2.2, life: 0.55, grav: -1.5, size: 0.26 });
  if (q.tr === "comet") emit(x, y + 0.9, z, 2, { colors: ["#ffffff", "#9fe0ff", "#c9a6ff", "#ffd84a"], speed: 0.5, up: 0.3, life: 0.9, grav: 0, size: 0.22, tw: 1 });   // (owner, 2026-11-12) the Comet Trail, at ten zones
  if (q.tr === "cloud") for (let k = 0; k < 2; k++) emit(x + (Math.random() - 0.5) * 0.8, y + 0.35 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.8, 1, { colors: ["#ffffff", "#e8f2ff", "#d6e6fb"], speed: 0.3, up: 0.6, life: 1.3, grav: -0.3, size: 0.42 });   // (owner, 2026-11-11) the Cloud Trail: soft puffs behind
  if (q.r >= 4) emit(x, y + 0.1, z, 2, { colors: ["#ffd84a", "#ffffff"], speed: 1.2, up: 1.5, life: 0.6, grav: 2, size: 0.12 });
  else if (kind === "mud") emit(x, y + 0.1, z, 2, { colors: ["#6b4d33"], speed: 1.5, up: 2, life: 0.4, grav: 9, size: 0.14 });
  else if (Math.random() < 0.4) emit(x, y + 0.1, z, 1, { colors: ["#e9e2d2"], speed: 0.6, up: 0.8, life: 0.35, grav: 1, size: 0.12 });
}
// the conveyor runs round all four sides of the counter: your Ready parcel rides it, your Next one just behind
// (owner, 2026-11-11) the conveyor comes out of the post office's door: your Ready parcel is pushed out along it to the
// end and waits there; your Next one waits just outside the door. Parcels on the belt are big.
const BELT_SC = 1.7, BELT_SLIDE = 1.6; let beltSlide = 0;
const readyAt = () => World.PO.end;
const near = (o, r, dy = 1.6) => hyp(me.x - o.x, me.z - o.z) < r && Math.abs(me.y - o.y) < dy;
function nearTrigger() { return World.zips.some((z) => near(z, 2.6) || near({ x: z.tx, z: z.tz, y: z.ty }, 2.6)) || near(World.PIPE.a, World.PIPE.r + 3.5) || near(World.PIPE.b, World.PIPE.r + 3.5) || World.pads.some((p) => near(p, 2.4) || near({ x: p.tx, z: p.tz, y: p.ty }, 2.4)) || World.balloons.some((b) => near(b, BALLOON_R + 2, 6)); }
let askAt = 0, shakeAt = 0; const BALLOON_R = 9;   // (owner, 2026-11-11: no threading a needle) anywhere within 9 m of the balloon
function triggers(t) {
  if (belt.ready && bag.length + stolen.length + dropped.length < cap && hyp(me.x - readyAt().x, me.z - readyAt().z) < 3.3 && Math.abs(me.y) < 2 && t > askAt) { askAt = t + 0.4; netSend({ t: "grab" }); }
  for (const b of World.boosts) if (near(b, 2) && me.boost < 2) { if (me.boost <= 0) { sfx("boost"); cam.shake = Math.max(cam.shake, 0.12); } me.boost = 2.5; }
  if (bag.length && t > shakeAt) for (const h of World.houses) if (!bag.some((q) => q.house === h.id) && hyp(me.x - h.mx, me.z - h.mz) < World.DELIVER_R - 0.6 && Math.abs(me.y - h.my) < 2) { shakeAt = t + 1.2; if (houseMesh[h.id]) houseMesh[h.id].shake = 0.5; sfx("shake"); break; }   // the wrong mailbox shakes its head
  if (!me.armed) return;
  // (owner, 2026-11-11) nothing takes you into an area that isn't open yet
  const openNow = World.openFor(save), opens = (x, z, y) => World.districtAt(x, z, y) < openNow;
  for (const z of World.zips) if (near(z, 1.5) && opens(z.tx, z.tz, z.ty + 1)) { { const len = hyp(z.tx - z.x, z.ty - z.y, z.tz - z.z); me.transit = { k: "zip", ax: z.x, ay: z.y, az: z.z, bx: z.tx, by: z.ty, bz: z.tz, len, t: 0 }; me.vx = me.vz = me.vy = 0; sfx("zip"); } return; }
  const C = World.CANNON; if (World.ISLES.length && near(C, C.r) && openNow >= 5) { const I = World.ISLES[C.to]; arc(I.x - 9, I.y, I.z, 3.2, 27, "cannon"); sfx("cannon"); cam.shake = 0.9; banner("SKY CANNON!", "#9aa8ff"); emit(C.x, C.y + 1, C.z, 40, { colors: ["#ffffff", "#c9ced6"], speed: 9, up: 5, life: 0.9, grav: 2, size: 0.4 }); return; }
  for (const p of World.pads) if (near(p, 1.7)) { arc(p.tx, p.ty, p.tz, 1.1 + hyp(p.tx - p.x, p.tz - p.z) / 70, 9, "pad"); sfx("pad"); return; }
  // (owner, 2026-11-11) the pipe's mouth and the balloon take you from farther off
  if (!World.PIPE.off && ((near(World.PIPE.a, World.PIPE.r + 1.5) && openNow >= 4) || near(World.PIPE.b, World.PIPE.r + 1.5)) && t > askAt) { askAt = t + 1; netSend({ t: "pipe" }); return; }
  if (World.balloons.some((b) => near(b, BALLOON_R, 6)) && t > askAt) { askAt = t + 1; netSend({ t: "balloon" }); }
}

// ---- the camera: behind and above; drag to look round, pinch or wheel to zoom ----
const camPos = new THREE.Vector3(), camAt = new THREE.Vector3(me.x, 2, me.z);
// (owner, 2026-11-12) the admin's freecam: the camera leaves your courier and flies where you look (WASD or the stick,
// Space up, C down, Shift faster; drag to look); Escape or the Admin panel's button ends it
let free = null;
function setFree(on) { free = on ? { x: camera.position.x, y: camera.position.y, z: camera.position.z } : null; keys.clear(); if (on) closePanel(); }
function stepFree(dt) {
  const cp = Math.cos(cam.pitch), fx = -Math.sin(cam.yaw) * cp, fy = -Math.sin(cam.pitch), fz = -Math.cos(cam.yaw) * cp, rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  let f = joy.y ? -joy.y : 0, r = joy.x || 0, u = 0;
  if (!chatting && !panelOpen()) { if (keys.has("KeyW") || keys.has("ArrowUp")) f += 1; if (keys.has("KeyS") || keys.has("ArrowDown")) f -= 1; if (keys.has("KeyD") || keys.has("ArrowRight")) r += 1; if (keys.has("KeyA") || keys.has("ArrowLeft")) r -= 1; if (keys.has("Space") || keys.has("KeyE")) u += 1; if (keys.has("KeyC") || keys.has("KeyQ")) u -= 1; }   /* (owner, 2026-11-13) Q / E down and up */
  const v = 30 * (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 3 : 1) * dt;
  free.x += (fx * f + rx * r) * v; free.y += (fy * f + u) * v; free.z += (fz * f + rz * r) * v;
  camera.position.set(free.x, free.y, free.z); camera.lookAt(free.x + fx, free.y + fy, free.z + fz);
  sun.position.set(free.x + 60, free.y + 110, free.z + 40); sun.target.position.set(free.x, free.y, free.z);
}
function stepCamera(dt) {
  if (cine && stepCine(dt)) return;
  if (free) { stepFree(dt); return; }
  const sc = mine ? mine.sc : 1, ty = me.y + 1.5 + 0.9 * sc; camAt.x = me.x; camAt.z = me.z; camAt.y += (ty - camAt.y) * Math.min(1, 10 * dt);
  const cp = Math.cos(cam.pitch), ux = Math.sin(cam.yaw) * cp, uy = Math.sin(cam.pitch), uz = Math.cos(cam.yaw) * cp;
  let d = cam.dist * (0.75 + 0.25 * sc); for (let k = 1.5; k < d; k += 0.7) if (World.wallAt(camAt.x + ux * k, camAt.z + uz * k, camAt.y + uy * k - 1)) { d = Math.max(1.5, k - 0.7); break; }   // nothing solid between you and the camera
  cam.d = cam.d === undefined || d < cam.d ? d : cam.d + (d - cam.d) * Math.min(1, 4 * dt); d = cam.d;
  camPos.set(camAt.x + ux * d, camAt.y + uy * d, camAt.z + uz * d);
  const g = World.surfaceAt(camPos.x, camPos.z, camPos.y + 1.5); if (g > -1e9 && camPos.y < g + 0.7) camPos.y = g + 0.7;
  if (cam.shake > 0) { cam.shake = Math.max(0, cam.shake - dt * 1.6); const k = cam.shake * 0.6; camPos.x += (Math.random() - 0.5) * k; camPos.y += (Math.random() - 0.5) * k; camPos.z += (Math.random() - 0.5) * k; }
  const fov = 60 + (me.boost > 0 ? 9 : 0) + (me.transit && me.transit.k !== "pipe" ? 11 : 0); if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, 8 * dt); camera.updateProjectionMatrix(); }
  camera.position.copy(camPos); camera.lookAt(camAt);
  sun.position.set(me.x + 60, me.y + 110, me.z + 40); sun.target.position.set(me.x, me.y, me.z);
}
const drags = new Map(); let pinch = 0, tapStart = null;
const joyEl = $("joy"), knob = $("knob");
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (bm && cine) return;
  if (bm && e.pointerType === "mouse" && e.button === 0 && shotDown(e.clientX, e.clientY)) return;
  if (bm && e.pointerType === "mouse" && e.button === 0) { if (e.shiftKey) pipePick(e.clientX, e.clientY); else paintStart(e.clientX, e.clientY); return; }   // (owner, 2026-11-13) building: the left button places (and keeps placing as you drag); the right one turns the camera
  if (e.pointerType === "touch" && joy.id === null && e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.35) { joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0; joyEl.style.display = "block"; joyEl.style.left = e.clientX - 60 + "px"; joyEl.style.top = e.clientY - 60 + "px"; knob.style.transform = ""; return; }
  drags.set(e.pointerId, { x: e.clientX, y: e.clientY }); tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (drags.size === 2) { const [a, b] = [...drags.values()]; pinch = hyp(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId === joy.id) { let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = hyp(dx, dy), R = 52; if (l > R) { dx *= R / l; dy *= R / l; } joy.x = dx / R; joy.y = dy / R; knob.style.transform = `translate(${dx}px, ${dy}px)`; return; }
  const d = drags.get(e.pointerId); if (!d) return;
  if (drags.size === 2) { const o = { x: e.clientX, y: e.clientY }; drags.set(e.pointerId, o); const [a, b] = [...drags.values()], p = hyp(a.x - b.x, a.y - b.y); if (pinch) cam.dist = clamp(cam.dist * (pinch / p), 5, 26); pinch = p; return; }
  cam.yaw -= (e.clientX - d.x) * 0.006; cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * 0.005, free ? -1.4 : -0.15, free ? 1.5 : 1.35); d.x = e.clientX; d.y = e.clientY;
});
const endPointer = (e) => {
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyEl.style.display = "none"; return; }
  if (drags.delete(e.pointerId) && tapStart && performance.now() - tapStart.t < 300 && hyp(e.clientX - tapStart.x, e.clientY - tapStart.y) < 8) tapAt(e.clientX, e.clientY);
  pinch = 0;
};
canvas.addEventListener("pointermove", (e) => { if (bm && e.pointerType === "mouse") { if (bm.gdrag) shotMove(e.clientX, e.clientY); else if (bm.adrag) areaMove(e.clientX, e.clientY); else if (bm.paint) paintMove(e.clientX, e.clientY); else buildAim(e.clientX, e.clientY); } });
addEventListener("pointerup", (e) => { if (bm && e.button === 0) { if (bm.gdrag) shotUp(); if (bm.adrag) areaEnd(); bm.paint = null; } });
canvas.addEventListener("pointerup", endPointer); canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("wheel", (e) => { cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), 5, 26); e.preventDefault(); }, { passive: false });
addEventListener("contextmenu", (e) => { if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) e.preventDefault(); });   // (owner, 2026-11-13) no browser menu on a right click, anywhere in the game
addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
  if (e.code === "Enter") { openChat(); e.preventDefault(); return; }
  if (e.code === "KeyB" && !e.repeat && myRole === "admin" && !chatting && !e.ctrlKey && !e.metaKey) { if (bm) endBuild(); else startBuild(); return; }   // (owner, 2026-11-14) admins: B opens (and closes) the build menu
  if (e.code === "Escape") { if (bm) { endBuild(); return; } if (free) setFree(false); closePanel(); return; }
  if (bm && !e.repeat && (e.code === "Delete" || e.code === "Backspace") && bm.shotSel !== undefined && shotList()[bm.shotSel]) { const L = shotList(); L.splice(bm.shotSel, 1); bm.shotSel = undefined; saveShots(L); setTimeout(drawAreas, 150); return; }   // (owner, 2026-11-14) a picked shot taken away
  if (bm && !e.repeat && (e.code === "Delete" || e.code === "Backspace") && selArea()) { doDel(selArea()); bm.sel = 0; buildBar(); drawAreas(); return; }
  if (bm && e.code === "KeyR" && !e.ctrlKey && !e.metaKey) { if (bm.tool === "spawn" || bm.tool === "gust") keys.add("KeyR"); else if (!e.repeat) { bm.r = (bm.r + 1) % 4; buildAim(bm.px, bm.py); } return; }   // (owner, 2026-11-13) the respawn point turns while R is held
  if (bm && (e.ctrlKey || e.metaKey) && !chatting) {   // (owner, 2026-11-13) the builder's copy, cut, paste, undo, redo
    const k = e.code; if (["KeyC", "KeyX", "KeyV", "KeyZ", "KeyY"].includes(k)) { e.preventDefault(); if (!e.repeat) { if (k === "KeyC") copyBuild(false); else if (k === "KeyX") copyBuild(true); else if (k === "KeyV") { if (bm.clip) { bm.tool = "paste"; buildBar(); buildAim(bm.px, bm.py); } } else if (k === "KeyY" || e.shiftKey) redoBuild(); else undoBuild(); } return; }
  }
  if (e.repeat) return; keys.add(e.code); if (free) { e.preventDefault(); return; }   // the freecam takes the keys
  if (rewardLock()) return;   // (owner, 2026-11-12) nothing to do while the reward screen is up (or opening)
  if (e.code === "Space") { jumpHeld = true; jumpTap = true; e.preventDefault(); }
  if (e.code === "KeyF") bigJump(); if (e.code === "KeyQ") doWhistle();
});
addEventListener("keyup", (e) => { keys.delete(e.code); if (e.code === "Space") jumpHeld = false; });
addEventListener("blur", () => { keys.clear(); jumpHeld = false; });
function press(id, down, up) { const b = $(id); b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); down(); }); if (up) for (const k of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(k, up); }
press("bbig", bigJump); press("bwhistle", doWhistle); press("bjump", () => { jumpHeld = true; jumpTap = true; }, () => { jumpHeld = false; });

// ---- words and numbers that pop up: floating numbers (they rise and fade in 0.8 s), banners, toasts ----
const pops = [], V = new THREE.Vector3();
function toScreen(x, y, z) { V.set(x, y, z).project(camera); return { x: (V.x * 0.5 + 0.5) * innerWidth, y: (-V.y * 0.5 + 0.5) * innerHeight, front: V.z < 1 }; }
// (owner, 2026-11-12) Aura from a bonk pops out of you: an orb and the amount, flung up and out, scaling in with a bounce
function auraPop(n) {
  const d = el("div", "pop aura"); d.appendChild(el("span", "coin")); d.appendChild(el("span", "", "+" + fmt(n))); $("pops").appendChild(d);
  const a = Math.random() * TAU; pops.push({ d, x: me.x, y: me.y + 1.6, z: me.z, t: 0, life: 1.8, aura: 1, vx: Math.cos(a) * 1.6, vz: Math.sin(a) * 1.6 });
  emit(me.x, me.y + 1.6, me.z, 26, { colors: ["#c77dff", "#e2b8ff", "#ffffff", "#a45be0"], speed: 6, up: 6, life: 0.8, grav: 10, size: 0.22 }); sfx("coin"); hudDirty = true;
}
const bounceS = (k) => (k < 0.12 ? 1.7 * (k / 0.12) : k < 0.24 ? 1.7 - 0.85 * ((k - 0.12) / 0.12) : k < 0.34 ? 0.85 + 0.35 * ((k - 0.24) / 0.1) : k < 0.42 ? 1.2 - 0.2 * ((k - 0.34) / 0.08) : 1);
function popup(text, color, x, y, z, big) { const d = el("div", "pop" + (big ? " big" : ""), text); d.style.color = color || "#ffffff"; $("pops").appendChild(d); pops.push({ d, x, y, z, t: 0, life: big ? 1.2 : 0.8 }); }
function stepPops(dt) { for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; if (p.t >= p.life) { p.d.remove(); pops.splice(i, 1); continue; } const k = p.t / p.life, s = p.aura ? toScreen(p.x + p.vx * Math.min(p.t, 0.5), p.y + 3.2 * Math.min(p.t, 0.5) * (2 - Math.min(p.t, 0.5) * 2) + p.t * 0.4, p.z + p.vz * Math.min(p.t, 0.5)) : toScreen(p.x, p.y + p.t * 1.6, p.z); p.d.style.transform = `translate(-50%, -50%) translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) scale(${(p.aura ? bounceS(k) : k < 0.15 ? 0.6 + k * 4 : 1.2 - k * 0.2).toFixed(2)})`; p.d.style.opacity = s.front ? String(p.aura ? (k < 0.7 ? 1 : (1 - k) / 0.3) : Math.min(1, 2.5 * (1 - k))) : "0"; } }
let bannerT = 0;
function banner(text, color, sub) { const b = $("banner"); b.firstChild.textContent = text; b.lastChild.textContent = sub || ""; b.style.color = color || "#ffffff"; b.classList.remove("go"); void b.offsetWidth; b.classList.add("go"); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove("go"), 1500); }
function toast(txt, color) { const d = el("div", "", txt); if (color) d.style.color = color; $("toast").appendChild(d); setTimeout(() => d.remove(), 1900); }
function flash(color) { const f = $("flash"); f.style.background = color; f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
function flyCoins(x, y, z, n) {   // coins fly from the mailbox to the counter on the HUD
  const from = toScreen(x, y, z), to = $("coins").getBoundingClientRect();
  for (let k = 0; k < Math.min(n, 10); k++) { const c = el("div", "flycoin"); c.style.left = from.x + "px"; c.style.top = from.y + "px"; $("pops").appendChild(c);
    c.animate([{ transform: "translate(-50%,-50%) scale(1)", offset: 0 }, { transform: `translate(${(Math.random() - 0.5) * 160}px, ${-60 - Math.random() * 80}px) scale(1.2)`, offset: 0.35 }, { transform: `translate(${to.left + 18 - from.x}px, ${to.top + 16 - from.y}px) scale(0.6)`, offset: 1 }], { duration: 650 + k * 60, easing: "ease-in", delay: k * 45 }).onfinish = () => { c.remove(); sfx("coin"); $("coins").classList.remove("bump"); void $("coins").offsetWidth; $("coins").classList.add("bump"); }; }
}

// ---- delivered parcels (owner, 2026-11-11): each delivery leaves its parcel (a gift, kept on the server) on the left
// of the screen with a small sparkle beside it in the rarity's color (more sparkle the rarer), and the rarity pops up
// over the mailbox. Four of one rarity merge into one of the next, with a little animation. A parcel waits until you
// open it: tap it and it builds up (shakes, its sparkle growing) then shows the prize; tapping while it builds up makes
// it go faster. Open all opens every one at once. What came out stays until the next opening or you close it. ----
let opening = null, merging = false;
const sparkC = (tier) => (tier ? RARITY_C[tier] : "#ffffff");
const waiting = () => save.gifts.filter((g) => !opening || !opening.gids.includes(g.gid));
function parcelTile(g, big) {   // a parcel (its tier's label on the cardboard) and its rarity sparkle
  const t = el(big ? "i" : "button", big ? "gtile big" : "gtile"); t.style.setProperty("--tc", TIERS[g.pt].c); t.style.setProperty("--rc", sparkC(g.r));
  t.appendChild(el("i", "gpar")); t.appendChild(el("i", "spark r" + g.r)); t.dataset.gid = g.gid; return t;
}
function giftsUi(fresh) {
  if (merging) return; const q = $("gq"), list = waiting(); q.innerHTML = "";
  list.slice(0, 12).forEach((g) => { const b = parcelTile(g); b.title = RARITY[g.r]; if (fresh && fresh.includes(g.gid)) b.classList.add("fresh"); q.appendChild(b); });   // (owner, 2026-11-11) they wait here until the run's done
  if (list.length > 12) q.appendChild(el("b", "disp", "+" + (list.length - 12)));
  $("gall").style.display = "none";
  $("gifts").style.display = list.length || opening || $("gres").style.display === "flex" ? "flex" : "none";
}
// a delivery: its rarity over the mailbox, the parcel on the left; merges (four into one) play out before it settles
function delivered(h, gift, near, merges) {
  const c = RARITY_C[gift.r]; popup(RARITY[gift.r] + "!", c, h.mx, h.my + 3.2, h.mz, gift.r >= 2); sfx(near ? "near" : gift.r >= 3 ? "shiny" : "pop");
  if (gift.r >= 2) { emit(h.mx, h.my + 2.6, h.mz, 10 + gift.r * 12, { colors: [c, "#ffffff"], speed: 3 + gift.r, up: 5, life: 1.1, size: 0.18 }); cam.shake = Math.max(cam.shake, 0.08 * gift.r); }
  if (gift.r >= 3) { banner(RARITY[gift.r].toUpperCase() + " PARCEL!", c); flash(c); }
  if (!merges || !merges.length) { giftsUi([gift.gid]); return; }
  merging = true; playMerges(merges.slice());
}
function playMerges(ms) {   // the four slide together, flash, and the next rarity pops out
  const mg = ms.shift(); if (!mg) { merging = false; giftsUi(); return; }
  const later = new Set(ms.flatMap((k) => [k.to.gid])), shown = save.gifts.filter((g) => g.gid !== mg.to.gid && !later.has(g.gid)).concat(mg.from.map((gid) => ({ gid, r: mg.to.r - 1, pt: mg.to.pt })));
  const q = $("gq"); q.innerHTML = ""; for (const g of shown) q.appendChild(parcelTile(g)); $("gifts").style.display = "flex";
  const tiles = mg.from.map((gid) => q.querySelector(`[data-gid="${gid}"]`)).filter(Boolean); if (!tiles.length) { merging = false; giftsUi([mg.to.gid]); return; }
  const r0 = tiles[0].getBoundingClientRect();
  tiles.forEach((t, k) => { const r = t.getBoundingClientRect(); t.animate([{ transform: "none" }, { transform: `translate(${r0.left - r.left}px, ${r0.top - r.top}px) scale(.6)`, opacity: k ? 0.2 : 1 }], { duration: 450, delay: 120, easing: "ease-in", fill: "forwards" }); });
  setTimeout(() => sfx("wobble"), 150);
  setTimeout(() => { sfx("level"); merging = false; giftsUi([mg.to.gid]); const t = q.querySelector(`[data-gid="${mg.to.gid}"]`); if (t) t.classList.add("merged"); if (ms.length) { merging = true; setTimeout(() => playMerges(ms), 450); } }, 620);
}
function openGift(gid) {   // one parcel: it shakes, its sparkle growing, then shows the prize (the server says what's inside)
  if (opening || merging) return; const g = save.gifts.find((k) => k.gid === gid); if (!g) return;
  const o = $("gopen"); opening = { gids: [gid], g, t: 0, shook: 0, speed: 1, res: null }; netSend({ t: "open", gids: [gid] }); o.style.display = "flex"; o.style.setProperty("--rc", sparkC(g.r));
  const slot = $("gbig"); slot.innerHTML = ""; slot.appendChild(parcelTile(g, true)); $("glabel").textContent = RARITY[g.r]; $("glabel").style.color = sparkC(g.r); $("gres").style.display = "none"; giftsUi();
}
function openAll() { if (opening || merging) return; const gids = save.gifts.map((g) => g.gid); if (!gids.length) return; opening = { gids, all: true, t: 0, res: null }; netSend({ t: "open", gids }); giftsUi(); }
function resultRows(list, R) {   // what came out of a gift (or several): coins, mounts
  const row = (icon, text) => { const d = el("div", "grow"); d.appendChild(icon); d.appendChild(el("b", "disp", text)); d.style.animationDelay = list.children.length * 120 + "ms"; list.appendChild(d); };
  row(el("i", "coin"), "+" + fmt(R.coins));
  for (const m of R.mounts) { const i = el("img", "gmount"); i.src = portrait(m.sp, m.va, m.r); row(i, mountName(m)); }
}
function landGifts(list) {   // what the server says came out: totals under the parcels
  const best = Math.max(...list.map((g) => g.r)), c = RARITY_C[best], tot = { coins: 0, mounts: [] };
  for (const g of list) { tot.coins += g.coins; if (g.mount) tot.mounts.push(g.mount); }
  $("gopen").style.display = "none"; $("gopen").style.setProperty("--ray", 0); opening = null;
  sfx("win", best); if (best >= 3) sfx("fanfare", best); confetti(best); if (best >= 2) banner(RARITY[best].toUpperCase() + "!", c); emit(me.x, me.y + 2.4, me.z, 8 + best * 10, { colors: [c, "#ffffff"], speed: 3 + best, up: 5, life: 1, size: 0.16 }); if (best >= 1) { flash(c); cam.shake = Math.max(cam.shake, 0.15 * best); }
  flyCoins(me.x, me.y + 2, me.z, 2 + best * 2); setTimeout(() => sfx("coin"), 200); if (tot.mounts.length) setTimeout(() => sfx("egg"), 350);
  const res = $("gres"), lst = $("glist"); res.style.display = "flex"; res.style.setProperty("--gc", c); lst.innerHTML = "";
  const head = $("gtitle"); head.innerHTML = ""; if (list.length > 1) for (const g of list) { const d = el("i", "gchip"); d.style.background = RARITY_C[g.r]; d.title = RARITY[g.r]; head.appendChild(d); }
  else { const t = el("b", "disp", RARITY[best]); t.style.color = c === "#ffffff" ? "#6f7d8a" : c; head.appendChild(t); }
  resultRows(lst, tot);
  if (tot.mounts.length) { $("mstable").classList.remove("bump"); void $("mstable").offsetWidth; $("mstable").classList.add("bump"); }
  if (tot.mounts.length) setTimeout(() => { selMount = tot.mounts[0].id; for (const mm of tot.mounts) hatchShow("gift", mm); }, 900);   // (owner, 2026-11-11) each mount a parcel dropped, one after another
  hudDirty = true; giftsUi(); if (panel === "stable" || panel === "odds") renderPanel();
}
// (owner, 2026-11-11) confetti from the parcels on a reveal: more, and in the rarity's colors, the rarer it is
function confetti(r, X, Y) {
  const at = $("gifts").getBoundingClientRect(), x0 = X ?? at.left + at.width / 2, y0 = Y ?? at.top + 60, cs = r ? [RARITY_C[r], "#ffffff", RARITY_C[Math.max(1, r - 1)]] : ["#ffffff", "#ffd84a"];
  for (let k = 0; k < 8 + r * 14; k++) { const d = el("i", "confetti"); d.style.left = x0 + "px"; d.style.top = y0 + "px"; d.style.background = cs[k % cs.length]; document.body.appendChild(d);
    const a = Math.random() * TAU, v = 120 + Math.random() * (160 + r * 70); d.animate([{ transform: "translate(-50%,-50%) rotate(0deg)", opacity: 1 }, { transform: `translate(${Math.cos(a) * v}px, ${Math.sin(a) * v * 0.6 - 60}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: 0.5 }, { transform: `translate(${Math.cos(a) * v * 1.2}px, ${Math.sin(a) * v * 0.6 + 220}px) rotate(${Math.random() * 1080}deg)`, opacity: 0 }], { duration: 1300 + Math.random() * 700, easing: "cubic-bezier(.2,.7,.4,1)" }).onfinish = () => d.remove(); }
}
// (owner, 2026-11-11: the loop) delivered parcels wait on the left while you still have parcels to deliver; once none
// are left (delivered or lost), they all open full screen at once (owner, 2026-11-13: right away, as you're sent back
// to the respawn point, and you can't move until you're through them): they crack by themselves, a click cracks them at
// once, and what was inside stays up until another click.
let reveal = null;
const rewardLock = () => !!reveal || !!(opening && opening.run);
function maybeOpenRun() {
  if (opening || reveal || merging || cine || !loggedIn || !save.gifts.length || bag.length + stolen.length + dropped.length || $("hatch").style.display === "flex") return;
  opening = { gids: save.gifts.map((g) => g.gid), all: true, run: true, t: 0, res: null }; netSend({ t: "open", gids: opening.gids });
}
function startReveal(list) {
  opening = null; if (!list.length) return; const best = Math.max(...list.map((g) => g.r)), c = sparkC(best);
  reveal = { list, t: 0, phase: "build", speed: 1, shook: 0, beat: 0, best, cards: [] }; const o = $("reveal"); o.style.display = "flex"; o.style.setProperty("--rc", c); o.style.setProperty("--ray", 0);
  const grid = $("rgrid"); grid.innerHTML = "";
  for (const g of list) { const card = el("div", "rcard"), cc = sparkC(g.r); card.style.setProperty("--cc", cc); card.style.setProperty("--cl", cc); const bx = el("div", "rbox"); bx.appendChild(parcelTile({ gid: g.gid, r: g.r, pt: g.pt | 0 }, true)); card.appendChild(bx); card.appendChild(el("b", "rlab disp", RARITY[g.r])); const rl = el("div", "rlist"); card.appendChild(rl); grid.appendChild(card); reveal.cards.push({ card, box: bx.firstChild, list: rl, g }); }
  giftsUi();
}
function stepReveal(dt) {   // (owner, 2026-11-11) all of the run's parcels open at once, each in its own card
  const R = reveal; if (!R) return; const o = $("reveal"), r = R.best;
  if (R.phase === "build") {
    R.t += dt * R.speed; const T = 1.4 + 0.2 * r, u = Math.min(1, R.t / T);
    const n = Math.floor(u * 3.4); if (n > R.shook && n <= 3) { R.shook = n; sfx("wobble"); for (const C of R.cards) { C.box.classList.remove("shake1", "shake2", "shake3"); void C.box.offsetWidth; C.box.classList.add("shake" + n); } }
    o.style.setProperty("--ray", (u * (0.25 + 0.18 * r)).toFixed(2)); for (const C of R.cards) C.card.style.setProperty("--cg", (u * (6 + 10 * C.g.r)).toFixed(0) + "px");
    if (r >= 2) { R.beat -= dt * R.speed; if (R.beat <= 0) { sfx("beat"); R.beat = 0.7 - u * 0.45; } }
    if (r >= 3) cam.shake = Math.max(cam.shake, u * 0.05 * r);
    if (u >= 1) {   // the reveal: every box at once
      R.phase = "shown"; R.t = 0; sfx("win", r); if (r >= 3) sfx("fanfare", r); if (r >= 1) flash(sparkC(r)); cam.shake = Math.max(cam.shake, 0.12 * r);
      const mounts = [];
      for (const C of R.cards) { C.box.classList.remove("shake1", "shake2", "shake3"); C.box.classList.add("burst"); setTimeout(() => C.card.classList.add("shown"), 450); const b = C.card.getBoundingClientRect(); confetti(C.g.r, b.left + b.width / 2, b.top + 60);
        resultRows(C.list, { coins: C.g.coins, mounts: [] }); if (C.g.mount) { mounts.push(C.g.mount); revealMount(C); } }
      setTimeout(() => sfx("coin"), 200); if (mounts.length) { selMount = mounts[0].id; setTimeout(() => { sfx("hatch"); if (mounts.some((m) => m.va || m.r >= 3)) sfx("fanfare", 3); }, 250); }
    }
  } else R.t += dt;   // (owner, 2026-11-13) stays up until a click
}
// (owner, 2026-11-11: one reward screen) a mount the parcel brought shows in its card: it drops in spinning over rays,
// its name and rarity under it, NEW! for the first of its kind and rarity
function revealMount(C) {
  const m = C.g.mount, wrap = el("div", "rmount"), im = el("img"); im.src = portrait(m.sp, m.va, m.r); im.alt = ""; wrap.appendChild(el("i", "rmrays")); wrap.appendChild(im);
  if (save.mounts.filter((k) => k.sp === m.sp && k.r === m.r).length <= 1) wrap.appendChild(el("b", "rnew disp", "NEW!"));
  wrap.style.setProperty("--mc", m.va ? "#bfe6ff" : RARITY_C[m.r]);
  const nm = el("b", "rmname disp", mountName(m)); nm.style.color = RARITY_C[m.r] === "#ffffff" ? "#ffffff" : RARITY_C[m.r];
  C.card.insertBefore(wrap, C.list); C.card.insertBefore(nm, C.list); 
}
function endReveal() {
  const R = reveal; if (!R) return; reveal = null; $("reveal").style.display = "none"; cam.shake = 0; tutDid("open"); hudDirty = true; giftsUi(); if (panel === "stable" || panel === "odds") renderPanel();
}
$("reveal").addEventListener("pointerdown", (e) => { e.stopPropagation(); const R = reveal; if (!R) return; if (R.phase === "build") R.t = 1e9; else endReveal(); });   // (owner, 2026-11-13) a click cracks them at once; the next closes
function hurryGift() { if (opening && !opening.all) { opening.speed = Math.min(8, opening.speed * 2.5); sfx("tick"); } }   // a tap while it builds up: faster
$("gopen").onclick = hurryGift; $("gall").onclick = openAll; $("gx").onclick = () => { $("gres").style.display = "none"; giftsUi(); };
for (const id of ["gopen", "gall", "gx"]) $(id).addEventListener("pointerdown", (e) => e.stopPropagation());
// ---- the new courier's tutorial (owner, 2026-11-11): five short cards at the bottom of the screen, each pointing at what
// it explains: picking up parcels, dropping them off, opening them, the Stable and Upgrades. The first
// three move on when you do them; the rest with Next. Skip ends it; it's shown once (saved), to couriers with no
// deliveries yet. ----
const TUT = [
  { t: "Pick up parcels", p: "Ride up to your parcel at the end of the post office conveyor. The pink arrow shows the way.", on: "grab" },
  { t: "Drop them off", p: "Follow the pink arrow to the pink beam and ride into the ring by the mailbox.", on: "deliver" },
  { t: "Open your parcels", p: "Delivered parcels wait on the left and open once you've none left to deliver. Tap to hurry them. A parcel can bring its neighborhood's animal: an Uncommon or better one opens the next neighborhood.", on: "open", hi: "gifts" },
  { t: "Stable", p: "Your mounts: ride one, and merge two of the same into a cooler skin. The rarer the mount, the faster it is and the more parcels it carries.", hi: "mstable" },
  { t: "Upgrades", p: "Spend Aura on better pay, luck and sturdier boxes.", hi: "mup" },
];
let tut = -1;
function tutShow(n) {
  for (const s of TUT) if (s.hi) $(s.hi).classList.remove("tuthi");
  tut = n; const c = $("tut"); if (n < 0 || n >= TUT.length) { c.style.display = "none"; if (n >= TUT.length || n === -2) { save.set.tut = true; netSend({ t: "set", tut: true }); } tut = -1; return; }
  const s = TUT[n]; c.style.display = "flex"; $("tutt").textContent = s.t; $("tutp").textContent = s.p; $("tutn").textContent = n + 1 + " / " + TUT.length; $("tutnext").style.display = s.on ? "none" : "block"; if (s.hi) $(s.hi).classList.add("tuthi");
  c.classList.remove("in"); void c.offsetWidth; c.classList.add("in");
}
function tutDid(what) { if (tut >= 0 && TUT[tut].on === what) setTimeout(() => tutShow(tut + 1), what === "open" ? 1800 : 900); }
$("tutnext").onclick = () => tutShow(tut + 1); $("tutskip").onclick = () => tutShow(-2);
for (const id of ["tutnext", "tutskip"]) $(id).addEventListener("pointerdown", (e) => e.stopPropagation());
// (owner, 2026-11-11) a level up also shows the mount on screen: it pops in over golden rays, hops, a shine sweeps across it
function levelFx() { const q = riding(), L = $("lvup"), src = portrait(q.sp, q.va, q.r); $("lvimg").src = src; L.style.setProperty("--lvm", `url(${src})`); $("lvt").textContent = World.VARIANTS[q.va] ? World.VARIANTS[q.va].toUpperCase() + "!" : RARITY[q.r].toUpperCase(); L.classList.remove("go"); void L.offsetWidth; L.classList.add("go"); clearTimeout(levelFx.t); levelFx.t = setTimeout(() => L.classList.remove("go"), 2300);
  if (mine) mine.spin = 0.7; for (let k = 0; k < 16; k++) setTimeout(() => emit(me.x + (Math.random() - 0.5) * 2, me.y + 0.5 + Math.random() * 2.5, me.z + (Math.random() - 0.5) * 2, 3, { colors: ["#ffd84a", "#ffffff", "#fff3b8"], speed: 1.5, up: 2.5, life: 0.9, grav: -0.5, size: 0.16 }), k * 60);
  sfx("level"); popup("LEVEL UP!", "#ffd84a", me.x, me.y + 3.2, me.z, true); for (let k = 0; k < 28; k++) { const a = (k / 28) * TAU; parts.length < PN && parts.push({ x: me.x, y: me.y + 0.3, z: me.z, vx: Math.cos(a) * 6, vy: 2.5, vz: Math.sin(a) * 6, t: 0, life: 0.8, size: 0.2, grav: 3, c: k % 2 ? "#ffd84a" : "#ffffff", r: k }); } }
function stepGifts(dt) {   // the build-up: three shakes, each bigger, the sparkle growing, then the prize (once the server's said)
  const o = opening; if (!o) return; o.t += dt * (o.speed || 1);
  if (o.all) { if (o.res) landGifts(o.res.list); return; }
  // (owner, 2026-11-11: more umph) the rarer, the longer and bigger the build-up: rays behind it, a heartbeat from Rare,
  // the screen shaking from Epic
  const r = o.g.r, T = 2.2 + 0.35 * r, b = $("gbig").firstChild, u = Math.min(1, o.t / T);
  const n = Math.floor(u * 3.4); if (n > o.shook && n <= 3) { o.shook = n; sfx("wobble"); if (b) { b.classList.remove("shake1", "shake2", "shake3"); void b.offsetWidth; b.classList.add("shake" + n); } }
  $("gopen").style.setProperty("--glow", (6 + u * (36 + 14 * r)).toFixed(0) + "px"); $("gopen").style.setProperty("--grow", (1 + u * (1.6 + 0.3 * r)).toFixed(2)); $("gopen").style.setProperty("--ray", (u * (0.2 + 0.2 * r)).toFixed(2));
  if (r >= 2) { o.beat = (o.beat || 0) - dt * (o.speed || 1); if (o.beat <= 0) { sfx("beat"); o.beat = 0.7 - u * 0.45; } }
  if (r >= 3) cam.shake = Math.max(cam.shake, u * 0.05 * r);
  if (o.t >= T && o.res) landGifts(o.res.list);
}
let hudDirty = true, shownCoins = 0, cardKey = "", myName = "", myRole = "player", myId = null, loggedIn = false;
const cdBtn = (id, left, total) => { const b = $(id), k = total > 0 ? clamp(left / total, 0, 1) : 0; b.style.setProperty("--cd", (k * 360).toFixed(0) + "deg"); b.classList.toggle("cool", k > 0); };
function hud(dt) {
  watchZones();
  // coins count up to what the server says
  const coinsNow = save.coins;
  if (shownCoins !== coinsNow) { const d = coinsNow - shownCoins; shownCoins = Math.abs(d) < 1 ? coinsNow : shownCoins + d * Math.min(1, dt * 8); $("coinn").textContent = fmt(Math.round(shownCoins)); }
  const t = now(); cdBtn("bbig", me.bigAt + World.BIG_JUMP.cd - t, World.BIG_JUMP.cd);
  // (owner, 2026-11-14) the parcel counter: how many parcels you're carrying, of how many you can
  const key = bag.length + "/" + cap;
  if (key !== cardKey) { cardKey = key; const c = $("card"); c.style.display = bag.length ? "flex" : "none"; c.innerHTML = svg("parcel") + `<b class="disp">${bag.length} / ${cap}</b>`; }
  // the way there: the arrow on the ground round you points at the nearest address (or a dropped parcel, or a goose with one)
  let tg = null, best = Infinity; const consider = (x, y, z, c) => { const d = hyp(x - me.x, z - me.z); if (d < best) { best = d; tg = { x, y, z, c }; } };
  for (const q of bag) { const h = addrOf(q.house); consider(h.mx, h.my, h.mz, POI); }
  if (!tg) { for (const q of dropped) consider(q.x, q.y, q.z, "#ffd84a"); for (const q of stolen) { const g = gooseMesh[q.goose]; if (g) consider(g.x, g.y, g.z, "#ff3b30"); } }
  if (!tg && tut === 0 && belt.ready) { const q = readyAt(); tg = { x: q.x, y: 1, z: q.z, c: POI }; }   // the tutorial's first step: the arrow points at your parcel on the counter
  stepArrow(t, tg);
  if (!hudDirty) return; hudDirty = false;
}

// ---- menus: Stable, Upgrades, Odds, Settings (and the staff panel) ----
let panel = "", selMount = 0, adminList = [], adminSel = null, adminData = null, adminQ = "";
const panelOpen = () => !!panel;
function openPanel(k) { panel = panel === k ? "" : k; $("panel").style.display = panel ? "flex" : "none"; if (panel) { if (k === "stable") selMount = save.ride; if (k === "admin") netSend({ t: "admin", op: "list", q: adminQ }); renderPanel(); } keys.clear(); }
function closePanel() { panel = ""; $("panel").style.display = "none"; }
const btn = (text, fn, cls) => { const b = el("button", "btn " + (cls || ""), text); b.onclick = fn; return b; };
const ibtn = (ico, name, fn, cls) => { const b = btn("", fn, cls); b.innerHTML = svg(ico); b.title = name; return b; };   // (owner, 2026-11-13) an icon button
fillIcons();
const coinBtn = (cost, fn, ok) => { const b = el("button", "btn buy"); b.appendChild(el("i", "coin")); b.appendChild(document.createTextNode(fmt(cost))); b.disabled = !ok; b.onclick = fn; return b; };
const mountName = (m) => (m.va ? "Shiny " : "") + World.coatName(m.sp, m.r) + " " + MOUNTS[m.sp].name;   // (owner, 2026-11-11) e.g. Shiny Spirit Wolf
const pct = (v) => (v >= 0.1 ? (v * 100).toFixed(0) : v >= 0.01 ? (v * 100).toFixed(1) : (v * 100).toFixed(2)) + "%";
function oddsRow(odds) { const r = el("div", "odds"); odds.forEach((v, n) => { if (v > 0) { const s = el("span", "", pct(v)); s.style.color = RARITY_C[n] === "#ffffff" ? "#6f7d8a" : RARITY_C[n]; s.title = RARITY[n]; r.appendChild(s); } }); return r; }
function renderPanel() {
  const body = $("pbody"); body.innerHTML = ""; body.className = "p-" + panel; $("ptitle").textContent = { stable: "Stable", up: "Upgrades", odds: "Odds", set: "Settings", admin: "Admin" }[panel] || "";
  if (panel === "stable") {
    const grid = el("div", "mgrid"), list = [...save.mounts].sort((a, b) => b.r - a.r || World.ZONE_KIND.indexOf(b.sp) - World.ZONE_KIND.indexOf(a.sp) || b.va - a.va || a.id - b.id);
    // (owner, 2026-11-12) identical mounts (kind, coat, skin, Aura levels, trail) stack in one tile with a count
    const stacks = new Map(); for (const m of list) { const k = [m.sp, m.r, m.va, m.cap | 0, m.spd | 0, m.tr || ""].join(); if (!stacks.has(k)) stacks.set(k, []); stacks.get(k).push(m); }
    for (const ms of stacks.values()) { const pickId = ms.some((k) => k.id === selMount) ? selMount : ms.some((k) => k.id === save.ride) ? save.ride : ms[0].id, m = ms.find((k) => k.id === pickId);
      const t = el("button", "mtile" + (ms.some((k) => k.id === selMount) ? " sel" : "") + (ms.some((k) => k.id === save.ride) ? " ride" : "") + (m.va ? " va" + m.va : "")); t.style.borderColor = RARITY_C[m.r] === "#ffffff" ? "#d7e1ea" : RARITY_C[m.r]; t.title = mountName(m);
      const im = el("img"); im.src = portrait(m.sp, m.va, m.r); im.alt = ""; t.appendChild(im); if (ms.length > 1) t.appendChild(el("b", "", "x" + ms.length)); t.onclick = () => { selMount = m.id; renderPanel(); }; grid.appendChild(t); }
    const m = save.mounts.find((k) => k.id === selMount) || riding(), S = World.mountStats(m), d = el("div", "mdetail");
    const im = el("img", "big"); im.src = portrait(m.sp, m.va, m.r); im.alt = ""; d.appendChild(im);
    const info = el("div", "minfo"); info.appendChild(el("h3", "", mountName(m))); const rr = el("div", "rar", RARITY[m.r]); rr.style.color = RARITY_C[m.r] === "#ffffff" ? "#6f7d8a" : RARITY_C[m.r]; info.appendChild(rr);
    for (const [name, v, max] of [["Speed", S.speed, 33], ["Jump", S.jump, 11], ["Grip", S.grip * 100, 60]]) { const r = el("div", "stat"); r.appendChild(el("span", "", name)); const b = el("div", "bar"), f = el("i"); f.style.width = clamp((v / max) * 100, 4, 100) + "%"; b.appendChild(f); r.appendChild(b); r.appendChild(el("em", "", name === "Grip" ? Math.round(v) + "%" : v.toFixed(1))); info.appendChild(r); }
    const acts = el("div", "acts"); if (m.id !== save.ride) acts.appendChild(btn("Ride", () => netSend({ t: "equip", id: m.id }), "go"));
    if (World.fuseSet(save.mounts, m.id)) acts.appendChild(btn("Merge", () => netSend({ t: "fuse", id: m.id }), "fuse"));   // the same ones: the next coat up
    if (m.id !== save.ride && save.mounts.length > 1) { const b = coinBtn(World.sellPrice(m), () => netSend({ t: "sell", id: m.id }), true); b.insertBefore(document.createTextNode("Sell "), b.firstChild); acts.appendChild(b); }   // (owner, 2026-11-12)
    info.appendChild(acts);
    // (owner, 2026-11-12) Aura on this mount: how much it carries and how fast it goes
    for (const [k, name, lv, max, show] of [["cap", "Carry", m.cap | 0, World.CAP_MAX, World.bagSize(m)], ["spd", "Boost", m.spd | 0, World.SPD_MAX, "+" + (m.spd | 0) * 5 + "%"]]) {
      const r = el("div", "stat pup"); r.appendChild(el("span", "", name)); r.appendChild(el("em", "", String(show)));
      if (lv < max) { const c = World.petUpCost(m, k); r.appendChild(coinBtn(c, () => netSend({ t: "petup", id: m.id, k }), save.coins >= c)); } else r.appendChild(el("span", "max", "MAX"));
      info.appendChild(r); }
    // trails: the ones the zones gave and the ones bought with Aura, on any mount
    const tr = el("div", "acts wrap");
    for (const T of World.TRAILS) { const have = World.trailsFor(save).includes(T.k), on = m.tr === T.k;
      if (have) tr.appendChild(btn(T.name, () => netSend({ t: "trail", id: m.id, k: on ? "" : T.k }), "trail" + (on ? " on" : "")));
      else if (T.cost) { const b = coinBtn(T.cost, () => netSend({ t: "buytrail", k: T.k }), save.coins >= T.cost); b.insertBefore(document.createTextNode(T.name + " "), b.firstChild); b.title = T.name; tr.appendChild(b); } }
    info.appendChild(tr); d.appendChild(info);
    body.appendChild(d);
    if (World.fuseAll(save.mounts.map((k) => ({ ...k })), save.ride).length) { const all = el("div", "acts"); all.appendChild(btn("Merge all", () => netSend({ t: "fuseall" }), "fuse")); body.appendChild(all); }   // (owner, 2026-11-12)
    body.appendChild(grid);
  } else if (panel === "up") {
    const total = World.upTotal(save.up), rk = World.rankOf(total), head = el("div", "rank"); const bd = el("i", "badge"); bd.style.background = rk ? World.RANK_C[rk] : "#d7e1ea"; head.appendChild(bd); head.appendChild(el("b", "", rk ? World.RANKS[rk] + " Postmaster" : "Postmaster")); head.appendChild(el("span", "", total + " / " + World.UP_MAX * Object.keys(UPGRADES).length)); body.appendChild(head);
    const val = { payout: (l) => "+" + l * 10 + "%", stamps: (l) => pct(World.rollOdds(World.stampLuck(l))[4]), press: (l) => "+" + l + "%", boxes: (l) => World.boxDur(l) + " durability" };
    for (const k of Object.keys(UPGRADES)) { const l = save.up[k], r = el("div", "uprow"); r.appendChild(el("b", "", UPGRADES[k].name)); const pp = el("div", "pips"); for (let n = 0; n < World.UP_MAX; n++) pp.appendChild(el("i", n < l ? "on" : "")); r.appendChild(pp); r.appendChild(el("span", "val", val[k](l) + (l < World.UP_MAX && val[k](l + 1) !== val[k](l) ? " → " + val[k](l + 1) : "")));
      if (l < World.UP_MAX) r.appendChild(coinBtn(World.upgradeCost(k, l), () => netSend({ t: "upgrade", k }), save.coins >= World.upgradeCost(k, l))); else r.appendChild(el("span", "max", "MAX")); body.appendChild(r); }
  } else if (panel === "odds") {
    const head = el("div", "orow head"); head.appendChild(el("b", "", "")); const hr = el("div", "odds"); RARITY.forEach((n, i) => { const s = el("span", "", n); s.style.color = RARITY_C[i] === "#ffffff" ? "#6f7d8a" : RARITY_C[i]; hr.appendChild(s); }); head.appendChild(hr); body.appendChild(head);
    const open = World.openFor(save), sw = World.spawnWeights(open, riding().r);
    TIERS.forEach((T, n) => { const r = el("div", "orow" + (n < open ? "" : " off")); const b = el("b", "", World.zoneName(n)); b.style.color = T.c; r.appendChild(b); const full = el("div", "odds"); World.rollOdds(T.luck + World.stampLuck(save.up.stamps)).forEach((v, i) => { const s = el("span", "", pct(v)); s.style.color = RARITY_C[i] === "#ffffff" ? "#6f7d8a" : RARITY_C[i]; full.appendChild(s); }); r.appendChild(full); r.appendChild(el("em", "", "x" + T.mult + " · " + pct(sw[n]))); body.appendChild(r); });
    for (const k of Object.keys(MODS)) { const r = el("div", "orow"); r.appendChild(el("span", "mod " + k, MODS[k].name)); r.appendChild(el("em", "", "+" + MODS[k].bonus * 100 + "%")); body.appendChild(r); }
    const Z = World.zoneCfg(World.districtAt(me.x, me.z, me.y));   // (owner, 2026-11-13) the neighborhood you're in's
    { const r = el("div", "orow"); r.appendChild(el("b", "", "Mount")); const full = el("div", "odds"); Z.chance.forEach((v, i) => { const s = el("span", "", pct(v)); s.style.color = RARITY_C[i] === "#ffffff" ? "#6f7d8a" : RARITY_C[i]; full.appendChild(s); }); r.appendChild(full); body.appendChild(r); }   // (owner, 2026-11-11) each rarity of mount's chance, tried from the parcel's own rarity down
    const vr = el("div", "orow"); vr.appendChild(el("b", "", "Shiny")); vr.appendChild(el("em", "", Z.shiny > 0 ? "1 / " + Math.round(1 / Z.shiny).toLocaleString() : "—")); body.appendChild(vr);
  } else if (panel === "set") {
    const row = (name, node) => { const r = el("label", "setrow"); r.appendChild(el("span", "", name)); r.appendChild(node); body.appendChild(r); };
    for (const [k, name] of [["music", "Music"], ["sfx", "SFX"]]) { const s = el("input"); s.type = "range"; s.min = 0; s.max = 10; s.value = save.set[k]; s.oninput = () => { save.set[k] = +s.value; setVolumes(); }; s.onchange = () => { netSend({ t: "set", [k]: +s.value }); if (k === "sfx") sfx("coin"); }; row(name, s); }
    const sw = el("div", "swatches"); for (const c of ["#f2a33a", "#3a8ee6", "#e5534b", "#3fb36b", "#a352e0", "#2bb3c0", "#ff8fb8", "#3d4650"]) { const b = el("button", c === save.set.shirt ? "on" : ""); b.style.background = c; b.onclick = () => { save.set.shirt = c; netSend({ t: "set", shirt: c }); remount(); renderPanel(); }; sw.appendChild(b); } row("Shirt", sw);
    const acts = el("div", "acts"); if (myRole === "admin" || myRole === "moderator") acts.appendChild(btn("Admin", () => openPanel("admin")));
    acts.appendChild(btn("Log out", () => { setTok(null); setTimeout(() => location.reload(), 100); })); body.appendChild(acts);
  } else if (panel === "admin") renderAdmin(body);
}
function renderAdmin(body) {
  if (myRole === "admin") { const fc = el("div", "acts"); fc.appendChild(btn(free ? "Freecam off" : "Freecam", () => setFree(!free), free ? "go" : "")); body.appendChild(fc); }   // (owner, 2026-11-12)
  const q = el("input"); q.placeholder = "Name"; q.value = adminQ; q.maxLength = 16; q.onchange = () => { adminQ = q.value.trim(); netSend({ t: "admin", op: "list", q: adminQ }); }; body.appendChild(q);
  const list = el("div", "alist"); for (const a of adminList) { const b = el("button", "arow" + (adminSel === a.id ? " sel" : "") + (a.online ? " on" : ""), a.name + (a.role !== "player" ? " · " + a.role : "") + (a.banned ? " · banned" : a.muted ? " · muted" : "")); b.onclick = () => { adminSel = a.id; adminData = null; netSend({ t: "admin", op: "inspect", id: a.id }); renderPanel(); }; list.appendChild(b); } body.appendChild(list);
  const a = adminList.find((k) => k.id === adminSel); if (!a) return;
  const op = (o) => netSend(Object.assign({ t: "admin", id: a.id, q: adminQ }, o)), acts = el("div", "acts wrap");
  const mins = el("select"); for (const [v, n] of [["10", "10 min"], ["60", "1 hour"], ["1440", "1 day"], ["10080", "1 week"], ["perma", "Forever"], ["off", "Off"]]) { const o = el("option", "", n); o.value = v; mins.appendChild(o); } acts.appendChild(mins);
  acts.appendChild(btn("Mute", () => op({ op: "mute", mins: mins.value }))); acts.appendChild(btn("Kick", () => op({ op: "kick" }))); acts.appendChild(btn("Ban", () => op({ op: "ban", mins: mins.value })));
  if (myRole === "admin") {
    const role = el("select"); for (const r of ["player", "moderator", "admin"]) { const o = el("option", "", r); o.value = r; if (a.role === r) o.selected = true; role.appendChild(o); } role.onchange = () => op({ op: "role", role: role.value }); acts.appendChild(role);
    const what = el("select"); for (const [v, n] of [["coins", "Aura"], ...Object.keys(MOUNTS).map((k) => ["mount:" + k, MOUNTS[k].name])]) { const o = el("option", "", n); o.value = v; what.appendChild(o); }
    const n = el("input"); n.type = "number"; n.value = 1; n.min = 1; const va = el("select"); World.VARIANTS.forEach((v, i) => { const o = el("option", "", v || "Normal"); o.value = i; va.appendChild(o); }); const rar = el("select"); RARITY.forEach((v, i) => { const o = el("option", "", v); o.value = i; rar.appendChild(o); });
    const give = el("div", "acts wrap"); give.appendChild(what); give.appendChild(n); give.appendChild(rar); give.appendChild(va); give.appendChild(btn("Give", () => op({ op: "give", what: what.value, n: +n.value, va: +va.value, r: +rar.value }), "go"));
    const quick = el("div", "acts wrap"); for (const [c, name] of [["coins", "+100,000"], ["allmounts", "All mounts"], ["upgrades", "Upgrades"], ["everything", "Everything"], ["reset", "Reset to new player"]]) quick.appendChild(btn(name, () => op({ op: "quick", cmd: c, n: 100000 })));
    body.appendChild(acts); body.appendChild(give); body.appendChild(quick);
    if (adminData) { const ed = el("div", "acts wrap"); const f = {}; for (const k of ["coins"]) { const i = el("input"); i.type = "number"; i.value = adminData[k]; i.title = "Aura"; f[k] = i; const l = el("label", "", "Coins "); l.appendChild(i); ed.appendChild(l); }
      ed.appendChild(btn("Save", () => op({ op: "edit", coins: +f.coins.value }), "go")); ed.appendChild(el("span", "", adminData.mounts.length + " mounts")); body.appendChild(ed); }
  } else body.appendChild(acts);
}
$("pclose").onclick = closePanel; $("panel").addEventListener("pointerdown", (e) => { if (e.target === $("panel")) closePanel(); });
for (const [id, k] of [["mstable", "stable"], ["mup", "up"], ["modds", "odds"], ["mset", "set"]]) $(id).onclick = () => openPanel(k);

// ---- a new mount: its box (or the merge's orb) wobbles three times, opens, and there's your mount; several wait their turn ----
const hatchQ = [];
function hatchShow(kind, m) {
  if ($("hatch").style.display === "flex") { hatchQ.push([kind, m]); return; }
  const o = $("hatch"), egg = $("hegg"), im = $("himg"), nm = $("hname"), rr = $("hrar"), M = { ...MOUNTS[m.sp], r: m.r | 0 }, c = RARITY_C[M.r]; o.classList.remove("won", "first"); o.style.display = "flex"; egg.style.display = "block"; egg.style.background = ""; im.style.display = nm.style.display = rr.style.display = "none"; egg.className = kind === "gift" ? "egg gift wob" : kind === "fuse" ? "egg fuse wob" : "egg wob";   // a new mount as a gift comes in a box
  for (const k of [0, 1, 2]) setTimeout(() => sfx("wobble"), 150 + k * 420);
  setTimeout(() => { egg.style.display = "none"; im.src = portrait(m.sp, m.va, m.r); im.style.display = nm.style.display = rr.style.display = "block"; nm.textContent = mountName(m); rr.textContent = RARITY[M.r]; rr.style.color = c; o.style.setProperty("--glow", m.va ? "#bfe6ff" : c); sfx("hatch"); if (m.va) sfx("shiny"); flash(c);
    // (owner, 2026-11-11) a new mount gets its own moment on top: it drops in spinning over rays, with confetti; the first of its kind says NEW!
    o.classList.add("won"); if (save.mounts.filter((k) => k.sp === m.sp && k.r === m.r).length <= 1) o.classList.add("first"); setTimeout(() => { confetti(Math.max(1, M.r + (m.va ? 1 : 0)), innerWidth / 2, innerHeight / 2); if (M.r >= 3 || m.va) sfx("fanfare", Math.max(3, M.r)); }, 450); }, 1500);
  setTimeout(() => { o.onclick = () => { o.style.display = "none"; o.onclick = null; const nx = hatchQ.shift(); if (nx) hatchShow(...nx); }; }, 1900);
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
const others = new Map(); let party = [], invites = [];
function addOther(p) {
  if (p.id === myId) return; const old = others.get(p.id); if (old) unrig(old.rig);
  const rig = rigMount(p.sp, p.va | 0, p.r | 0, p.shirt || "#3a8ee6", p.name, p.rank | 0); rig.m.g.position.set(p.x, p.y || 0, p.z); setCarry(rig, p.carry);
  others.set(p.id, Object.assign(old || { buf: [], x: p.x, y: p.y || 0, z: p.z, yaw: p.yaw || 0, mv: 0, stunT: 0, graceT: 0, kickT: 0, hideT: 0, stepT: 0, mx: p.x, my: p.y || 0, mz: p.z, myaw: 0, wasFoot: false }, { id: p.id, name: p.name, sp: p.sp, r: p.r | 0, va: p.va | 0, tr: p.tr || "", shirt: p.shirt, rank: p.rank | 0, friendly: !!p.friendly, carry: p.carry || null, rig }));
}
function dropOther(id) { const o = others.get(id); if (!o) return; unrig(o.rig); others.delete(id); }
function renderParty() { const d = $("party"); d.innerHTML = ""; d.style.display = party.length ? "flex" : "none"; for (const q of party) d.appendChild(el("span", q.id === myId ? "me" : "", q.name)); if (party.length) { const x = el("button", ""); x.innerHTML = svg("close"); x.title = "Leave"; x.onclick = () => netSend({ t: "party_leave" }); d.appendChild(x); } }
function renderInvite() { const d = $("invite"), t = performance.now(); invites = invites.filter((i) => i.until > t); const i = invites[0]; d.style.display = i ? "flex" : "none"; if (!i) return; d.innerHTML = ""; d.appendChild(el("b", "", i.name)); d.appendChild(el("span", "", "Party")); const ans = (yes) => { netSend({ t: "answer", from: i.from, yes }); invites.shift(); renderInvite(); }; d.appendChild(btn("✓", () => ans(true), "go")); d.appendChild(btn("✕", () => ans(false))); }
setInterval(() => { if (invites.length) renderInvite(); }, 1000);
// ---- (owner, 2026-11-13) the zone builder (admins): flying freely, a bar of pieces at the bottom; a see-through
// preview shows where the piece goes (red: what Erase takes), a tap or click places it. Blocks go against the face
// pointed at (on top, or beside it), W x H x D metres of a material; houses, mailboxes and gates stand on what's
// pointed at, turned with the turn button (R), each in the zone chosen ----
let bm = null;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3();
$("mbuild").onclick = () => (bm ? endBuild() : startBuild());   // (owner, 2026-11-13) admins: the Build button on screen
function startBuild() { closePanel(); if (!free) setFree(true); if (spawnG) spawnG.visible = true; for (const g of buildOnly) g.visible = true; bm = { tool: "block", a: ((Math.round((World.SPAWN.yaw * 180) / Math.PI) % 360) + 360) % 360, zone: 0, w: 2, h: 1, d: 2, m: "grass", r: 0, wl: 8, ly: 0, sel: 0, px: innerWidth / 2, py: innerHeight / 2, ghost: null, aim: null }; buildBar(); document.body.classList.add("building"); buildAim(bm.px, bm.py); drawAreas(); }
function endBuild() { if (!bm) return; bm.zd = null; if (spawnG) spawnG.visible = false; for (const g of buildOnly) g.visible = false; if (bm.ghost) scene.remove(bm.ghost); if (bm.pselG) scene.remove(bm.pselG); bm = null; $("buildbar").style.display = "none"; $("zpanel").style.display = "none"; $("pprompt").style.display = "none"; drawAreas(); document.body.classList.remove("building"); setFree(false); }
const BUILD_TOOLS = [["block", "Block"], ["house", "House"], ["mailbox", "Mailbox"], ["gate", "Gate"], ["wall", "Wall"], ["tree", "Tree"], ["boost", "Boost"], ["start", "Start Line"], ["podium", "Podium"], ["spawn", "Respawn"], ["office", "Post Office"], ["pipe", "Pipe"], ["gust", "Gust"], ["mover", "Platform"], ["shot", "Shot"], ["area", "Bounds"], ["erase", "Erase"]];
// each tile's picture: the piece itself, drawn once (with the mount portraits' renderer)
const THUMB = {}, THUMB_Q = { block: { w: 2, h: 1, d: 2, m: "grass" }, gate: { zone: 1 }, wall: { w: 6, zone: 1 }, area: { w: 6, d: 6, zone: 1 }, gust: { w: 4, h: 3, d: 4, a: 0, iv: 4, pw: 18 }, mover: { w: 4, h: 1, d: 4, m: "wood", bx: 0, by: 0, bz: 0, sp: 4 } };
function thumb(k) {
  if (THUMB[k]) return THUMB[k];
  if (k === "erase") return (THUMB[k] = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${ICON.erase}</svg>`));
  const q = { id: 0, k, x: 0, y: 0, z: 0, r: 0, ...(THUMB_Q[k] || {}) }; let g;
  if (k === "shot") { g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffd84a", side: THREE.DoubleSide }))); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), mat("#ffffff")); p.position.y = 1.5; g.add(p); box(0.9, 0.6, 1.1, "#23303b", 0, 3.1, 0, g, false); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.4, 10).rotateX(Math.PI / 2), mat("#23303b")); l.position.set(0, 3.1, 0.75); g.add(l); }
  else if (k === "area") { g = new THREE.Group(); const bx = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 6), new THREE.MeshBasicMaterial({ color: World.TIERS[1].c, transparent: true, opacity: 0.35 })); bx.position.y = 1.5; g.add(bx, new THREE.LineSegments(new THREE.EdgesGeometry(bx.geometry), new THREE.LineBasicMaterial({ color: "#23303b" }))); g.children[1].position.y = 1.5; }
  else g = pieceMesh(q, false);
  g.traverse((o) => { if (o.isSprite) o.visible = false; }); pScene.add(g);
  const bb = new THREE.Box3(); g.updateMatrixWorld(true); g.traverse((o) => { if ((o.isMesh || o.isLineSegments) && o.visible) bb.expandByObject(o, true); }); const c = bb.getCenter(new THREE.Vector3()), r = Math.max(1, bb.getSize(new THREE.Vector3()).length() / 2), d = r / Math.sin((pCam.fov * Math.PI) / 360) * 0.95;
  pCam.position.set(c.x + d * 0.6, c.y + d * 0.5, c.z + d * 0.62); pCam.lookAt(c); pCam.far = d * 4; pCam.updateProjectionMatrix();
  portraitR.render(pScene, pCam); pScene.remove(g); pCam.far = 60; pCam.updateProjectionMatrix();
  return (THUMB[k] = portraitR.domElement.toDataURL());
}
const zoneReach = () => { let z = 0; while (z < World.TIERS.length - 1 && World.build.some((q) => q.k === "gate" && q.zone === z + 1)) z++; return z; };
function buildBar() {
  const B = $("buildbar"); B.innerHTML = ""; B.style.display = "flex"; const row0 = el("div", "brow"), row2 = el("div", "brow");
  // (owner, 2026-11-13) every piece a rounded tile with its picture
  for (const [k, name] of BUILD_TOOLS) { const b = btn("", () => { bm.tool = k; if (k !== "area") bm.sel = 0; buildBar(); buildAim(bm.px, bm.py); drawAreas(); }, "btile" + (bm.tool === k ? " on" : "")); const im = document.createElement("img"); im.src = thumb(k); im.alt = ""; b.append(im, el("span", "", name)); b.title = name; row0.appendChild(b); }
  const turnB = (ibtn("rotate", "Turn", () => { if (bm.tool === "spawn") bm.a = (Math.round(bm.a / 45) * 45 + 45) % 360; else bm.r = (bm.r + 1) % 4; buildAim(bm.px, bm.py); }, "bt")), closeB = ibtn("close", "Close", endBuild, "bt"); row0.className = "btiles"; B.appendChild(row0);
  const step = (label, get, set, lo, hi) => { const g = el("div", "bstep" + (label === zLabel ? " zone" : "")); g.appendChild(btn("−", () => { set(clamp(get() - 1, lo, hi)); buildBar(); buildAim(bm.px, bm.py); }, "bt")); g.appendChild(el("span", "", label())); g.appendChild(btn("+", () => { set(clamp(get() + 1, lo, hi)); buildBar(); buildAim(bm.px, bm.py); }, "bt")); row2.appendChild(g); };
  // (owner, 2026-11-13) the neighborhood you're editing: its bounds, gates and walls are placed for it; ⚙ its name, animal and chances
  // (owner, 2026-11-14) the next neighborhood can be edited only once a gate into it is placed
  bm.zone = Math.min(bm.zone, zoneReach()); const zLabel = () => World.zoneName(bm.zone); step(zLabel, () => bm.zone, (v) => { bm.zone = v; bm.zd = null; bm.shotPick = undefined; drawAreas(); if ($("zpanel").style.display === "block") zonePanel(); }, 0, zoneReach());
  row2.lastChild.querySelector("span").style.boxShadow = "inset 0 -4px 0 " + World.TIERS[bm.zone].c; row2.appendChild(ibtn("settings", "Neighborhood", () => { const P = $("zpanel"); if (P.style.display === "block") { P.style.display = "none"; bm.zd = null; bm.shotPick = undefined; drawAreas(); } else zonePanel(); }, "bt"));
  if ((bm.tool === "gust" || bm.tool === "mover") && hazSel()) {   // (owner, 2026-11-13) the selected gust or platform's settings
    const q = hazSel(), ch = (f) => (v) => { const a = { ...q }; f(a, v); doSet(q, a); };
    step(() => "W " + q.w, () => q.w, ch((a, v) => (a.w = v)), 1, World.BLOCK_MAX); step(() => "H " + q.h, () => q.h, ch((a, v) => (a.h = v)), 1, World.BLOCK_MAX); step(() => "D " + q.d, () => q.d, ch((a, v) => (a.d = v)), 1, World.BLOCK_MAX);
    if (q.k === "gust") { step(() => "Every " + q.iv + "s", () => Math.round(q.iv * 2), ch((a, v) => (a.iv = v / 2)), 1, 60); step(() => "Power " + q.pw, () => q.pw, ch((a, v) => (a.pw = v)), 1, 60); }
    else { step(() => "Speed " + q.sp, () => q.sp, ch((a, v) => (a.sp = v)), 1, 30); const pb = ibtn("pin", "B", () => { bm.bPick = !bm.bPick; buildBar(); }, "bt" + (bm.bPick ? " on" : "")); row2.appendChild(pb); }
    row2.appendChild(ibtn("close", "Deselect", () => { bm.hsel = 0; bm.bPick = false; buildBar(); drawHazSel(); }, "bt"));
  } else if (bm.tool === "block" || bm.tool === "gust" || bm.tool === "mover") {
    step(() => "W " + bm.w, () => bm.w, (v) => (bm.w = v), 1, World.BLOCK_MAX); step(() => "H " + bm.h, () => bm.h, (v) => (bm.h = v), 1, World.BLOCK_MAX); step(() => "D " + bm.d, () => bm.d, (v) => (bm.d = v), 1, World.BLOCK_MAX);
    if (bm.tool !== "gust") { const mb = btn(bm.m[0].toUpperCase() + bm.m.slice(1), () => { do bm.m = World.MATS[(World.MATS.indexOf(bm.m) + 1) % World.MATS.length]; while (bm.tool === "mover" && bm.m === "turbine"); buildBar(); buildAim(bm.px, bm.py); }, "bt mat"); mb.style.background = MAT_C[bm.m]; row2.appendChild(mb); }
  } else if (bm.tool === "wall") step(() => "L " + bm.wl, () => bm.wl, (v) => (bm.wl = v), 1, World.BLOCK_MAX);
  else if (bm.tool === "area") { const q = selArea(); if (q) { const ch = (f) => (v) => { const a = { ...q }; f(a, v); doSet(q, a); }; step(() => "W " + q.w, () => q.w, ch((a, v) => (a.w = v)), 1, World.AREA_MAX); step(() => "D " + q.d, () => q.d, ch((a, v) => (a.d = v)), 1, World.AREA_MAX); row2.appendChild(btn("Delete", () => { doDel(q); bm.sel = 0; buildBar(); drawAreas(); }, "bt")); } }
  row2.append(turnB, closeB); B.appendChild(row2);
}
function pieceAt(px, py) {   // what's pointed at: the point, its face's normal and the piece's id (0: the ground)
  ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hits = buildG ? ray.intersectObjects([...buildG.children, ...(poG ? [poG] : [])], true) : []; for (const h of hits) { let o = h.object; while (o && !o.userData.pid && o.parent) o = o.parent; if (o && o.userData.pid) { const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0); return { p: h.point, n, id: o.userData.pid }; } }
  if (ray.ray.intersectPlane(ground, hitV)) return { p: hitV.clone(), n: new THREE.Vector3(0, 1, 0), id: 0 };
  return null;
}
// the box a piece takes: [w, h, d, center x, y, z]
function pieceBox(q) {
  const S = World.HOUSE_S, P = World.PO.b;
  return q.k === "block" || q.k === "gust" || q.k === "mover" ? [q.w, q.h, q.d, q.x + q.w / 2, q.y + q.h / 2, q.z + q.d / 2] : q.k === "pipe" ? [World.TUBE.r * 2, World.TUBE.r * 2, World.TUBE.l, q.x, q.y + World.TUBE.r, q.z] : q.k === "house" ? [S, 5, S, q.x, q.y + 2.5, q.z] : q.k === "gate" ? [World.GATE_W, World.GATE_H, World.GATE_T, q.x, q.y + World.GATE_H / 2, q.z] : q.k === "wall" ? [q.w, World.GATE_H, World.GATE_T, q.x, q.y + World.GATE_H / 2, q.z] : q.k === "area" ? [q.w, 1, q.d, q.x + q.w / 2, q.y, q.z + q.d / 2]
    : q.k === "tree" ? [1.6, 6.5, 1.6, q.x, q.y + 3.25, q.z] : q.k === "boost" ? [3.2, 0.3, 3.2, q.x, q.y + 0.15, q.z] : q.k === "start" ? [World.START_W, 0.3, World.START_D, q.x, q.y + 0.15, q.z] : q.k === "podium" ? [4.4, 1.6, 4.4, q.x, q.y + 0.8, q.z]
    : q.k === "spawn" ? [1.8, 0.3, 1.8, q.x, q.y + 0.15, q.z] : q.k === "office" ? [P.hw * 2, P.h + 2, P.hd * 2 + 10, q.x, q.y + (P.h + 2) / 2, q.z - 9 + (P.hd * 2 + 10) / 2 - P.hd] : [0.6, 1.5, 0.6, q.x, q.y + 0.75, q.z];
}
// (owner, 2026-11-13) the preview is a blueprint hologram of the piece itself: see-through blue with glowing edges (red
// for what Erase or Cut takes)
const HOLO = { blue: [new THREE.MeshBasicMaterial({ color: "#4fc3ff", transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }), new THREE.LineBasicMaterial({ color: "#bff0ff", transparent: true, opacity: 0.9 })],
  red: [new THREE.MeshBasicMaterial({ color: "#ff4a4a", transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }), new THREE.LineBasicMaterial({ color: "#ffd0d0", transparent: true, opacity: 0.9 })] };
function hologram(q, red) {
  const g = pieceMesh(q, false), [fill, edge] = HOLO[red ? "red" : "blue"], meshes = [];
  g.traverse((o) => { if (o.isMesh) meshes.push(o); else if (o.isSprite) o.visible = false; });
  for (const m of meshes) { m.material = fill; m.castShadow = m.receiveShadow = false; m.renderOrder = 2; if (m.geometry.attributes.position.count < 400) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), edge); e.renderOrder = 3; m.add(e); } }
  return g;
}
function buildPiece(a, base) {   // the piece the bar (or the clipboard: base) would place at an aim, turned bm.r more
  const T = base ? base.k : bm.tool, p = a.p, n = a.n, up = n.y > 0.5, down = n.y < -0.5;
  if (T === "block" || T === "gust" || T === "mover") {
    const B = base || { w: bm.w, h: bm.h, d: bm.d, m: bm.m }, w = bm.r % 2 ? B.d : B.w, d = bm.r % 2 ? B.w : B.d, h = B.h;
    let x = Math.round(p.x - w / 2), z = Math.round(p.z - d / 2), y = up ? Math.round(p.y) : down ? Math.round(p.y) - h : Math.floor(p.y + 0.001);
    if (!up && !down) { if (n.x > 0.5) x = Math.round(p.x); else if (n.x < -0.5) x = Math.round(p.x) - w; if (n.z > 0.5) z = Math.round(p.z); else if (n.z < -0.5) z = Math.round(p.z) - d; }
    if (T === "gust") return { k: "gust", x, z, y, w, h, d, a: base ? base.a | 0 : Math.round(bm.a) % 360, iv: base ? base.iv : World.GUST.iv, pw: base ? base.pw : World.GUST.pw };
    if (T === "mover") return { k: "mover", x, z, y, w, h, d, m: B.m === "turbine" ? "wood" : B.m, bx: base ? base.bx : 0, by: base ? base.by : 0, bz: base ? base.bz : 0, sp: base ? base.sp : World.MOVER.sp };
    return { k: "block", x, z, y, w, h, d, m: B.m };
  }
  const x = Math.round(p.x + n.x * 0.3), z = Math.round(p.z + n.z * 0.3), s = World.surfaceAt(x, z, p.y + 0.3), q = { k: T, x, z, y: Math.round(Number.isFinite(s) && s > -1e9 ? s : p.y), r: ((base ? base.r | 0 : 0) + bm.r) % 4 };
  if (T === "gate" || T === "wall") q.zone = base ? base.zone : Math.min(World.TIERS.length - 1, bm.zone + 1);   // (owner, 2026-11-14) the neighborhood you're editing places the gates (and walls) into the next
  if (T === "wall") q.w = base ? base.w : bm.wl;
  if (T === "spawn") q.a = base ? base.a | 0 : Math.round(bm.a) % 360;
  return q;
}
function buildAim(px, py) {
  if (!bm) return; bm.px = px; bm.py = py; if (bm.ghost) { scene.remove(bm.ghost); bm.ghost = null; }
  const a = pieceAt(px, py); bm.aim = a; if (!a) return; let g = null;
  if (bm.tool === "erase" || bm.tool === "cut" || bm.tool === "copy") { const q = a.id && World.build.find((o) => o.id === a.id); if (q) g = hologram(q, bm.tool !== "copy"); }
  else if (bm.tool === "paste") { if (bm.clip) g = hologram({ ...buildPiece(a, bm.clip), id: 0 }); }
  else if (bm.tool !== "area" && bm.tool !== "shot") g = hologram({ ...buildPiece(a), id: 0 });
  if (g) { scene.add(g); bm.ghost = g; }
}
// (owner, 2026-11-13) doing and undoing (a keyboard: building is for computers): every placing and erasing (yours) can be
// undone (Ctrl+Z) and redone (Ctrl+Shift+Z or Ctrl+Y); copy (Ctrl+C), cut (Ctrl+X) and paste (Ctrl+V) the pointed-at piece
let tagN = 0; const pend = new Map(), hist = [], redos = [];
const strip = (q) => { const o = { ...q }; delete o.id; return o; };
function sendAdd(piece, then) { const tag = ++tagN; pend.set(tag, then); netSend({ t: "build", op: "add", piece: strip(piece), tag }); }
function doAdd(piece, then) { const repl = World.ONE_ONLY.includes(piece.k) ? World.build.filter((q) => q.k === piece.k).map((q) => ({ ...q })) : []; sendAdd(piece, (id) => { hist.push({ add: { ...piece, id }, repl }); redos.length = 0; if (then) then(id); }); }
function doSet(before, after) { hist.push({ set: { before: { ...before }, after: { ...after } } }); redos.length = 0; netSend({ t: "build", op: "set", piece: after }); sfx("pad"); }
function doDel(q) { hist.push({ del: { ...q } }); redos.length = 0; netSend({ t: "build", op: "del", id: q.id }); }
function undoBuild() { const e = hist.pop(); if (!e) return; if (e.set) netSend({ t: "build", op: "set", piece: e.set.before }); else if (e.add) { netSend({ t: "build", op: "del", id: e.add.id }); for (const r of e.repl) sendAdd(r, (id) => { r.id = id; }); } else sendAdd(e.del, (id) => { e.del.id = id; }); redos.push(e); sfx("pop"); }
function redoBuild() { const e = redos.pop(); if (!e) return; if (e.set) netSend({ t: "build", op: "set", piece: e.set.after }); else if (e.add) sendAdd(e.add, (id) => { e.add.id = id; }); else netSend({ t: "build", op: "del", id: e.del.id }); hist.push(e); sfx("pad"); }
const aimed = () => bm && bm.aim && bm.aim.id && World.build.find((o) => o.id === bm.aim.id);
function copyBuild(cut) { const q = aimed(); if (!q) return; bm.clip = strip(q); bm.r = 0; if (cut) doDel(q); bm.tool = "paste"; buildBar(); buildAim(bm.px, bm.py); sfx("pad"); }
// painting: a left-button drag keeps placing on the level it started at (or erasing what it passes over), never on top
// of what this same drag just placed
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d && a.y < b.y + b.h && b.y < a.y + a.h;
function paintPiece(px, py) {
  const P = bm.paint; ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -P.y), v = new THREE.Vector3(); if (!ray.ray.intersectPlane(pl, v)) return null;
  const base = bm.tool === "paste" ? bm.clip : null, q = buildPiece({ p: v, n: new THREE.Vector3(0, 1, 0), id: 0 }, base); q.y = P.y; return q;
}
function placeOnce(q) {
  const P = bm.paint, [w0, h, d0, cx, cy, cz] = pieceBox(q), odd = q.k !== "block" && q.k !== "office" && q.r % 2, w = odd ? d0 : w0, d = odd ? w0 : d0, bx = { x: cx - w / 2 + 0.01, z: cz - d / 2 + 0.01, y: cy - h / 2, w: w - 0.02, h, d: d - 0.02 };   // what each piece takes up
  if (P.done.some((o) => overlaps(o, bx))) return; P.done.push(bx); doAdd(q); sfx("pad");
}
function paintStart(px, py) {
  if (bm.shotPick !== undefined && bm.zd && bm.zd.shots[bm.shotPick]) { const a = pieceAt(px, py); if (a) { Object.assign(bm.zd.shots[bm.shotPick], { x: Math.round(a.p.x), y: Math.round(a.p.y), z: Math.round(a.p.z) }); bm.shotPick = undefined; sfx("pad"); zonePanel(); drawAreas(); } return; }   // (owner, 2026-11-13) a shot's point
  if (bm.tool === "area") { areaStart(px, py); return; }
  if (bm.tool === "shot") { const a = pieceAt(px, py), L = shotList(); if (a && L.length < World.SHOTS_MAX) { L.push({ name: "", x: Math.round(a.p.x), y: Math.round(a.p.y), z: Math.round(a.p.z) }); saveShots(L); bm.shotSel = L.length - 1; sfx("pad"); setTimeout(drawAreas, 150); } return; }
  if (bm.tool === "gust" || bm.tool === "mover") {   // (owner, 2026-11-13) click one to select it; with B picking, the click sets the platform's B
    const a = pieceAt(px, py), s = hazSel();
    if (bm.bPick && s && s.k === "mover" && a) { const t = buildPiece(a, { ...s, k: "mover" }); doSet(s, { ...s, bx: t.x - s.x, by: t.y - s.y, bz: t.z - s.z }); bm.bPick = false; sfx("pad"); buildBar(); return; }
    const q = a && a.id && World.build.find((o) => o.id === a.id && o.k === bm.tool); if (q) { bm.hsel = q.id; bm.bPick = false; sfx("tick"); buildBar(); drawHazSel(); return; }
    if (s) { bm.hsel = 0; bm.bPick = false; buildBar(); drawHazSel(); }
  }
  buildAim(px, py); const a = bm.aim; if (!a) return;
  if (bm.tool === "erase") { bm.paint = { erase: new Set() }; paintMove(px, py); return; }
  if (bm.tool === "copy" || bm.tool === "cut") { copyBuild(bm.tool === "cut"); return; }
  if (bm.tool === "paste" && !bm.clip) return;
  const q = buildPiece(a, bm.tool === "paste" ? bm.clip : null); bm.paint = { y: q.y, done: [] }; placeOnce(q);
}
function paintMove(px, py) {
  const P = bm.paint; buildAim(px, py);
  if (P.erase) { const q = aimed(); if (q && !P.erase.has(q.id)) { P.erase.add(q.id); doDel(q); sfx("pop"); } return; }
  const q = paintPiece(px, py); if (!q) return; placeOnce(q);
  if (bm.ghost) scene.remove(bm.ghost); bm.ghost = hologram({ ...q, id: 0 }); scene.add(bm.ghost);
}
function buildTap(px, py) {
  if (bm.tool === "area") return;
  buildAim(px, py); const a = bm.aim; if (!a) return;
  if (bm.tool === "erase") { const q = aimed(); if (q) { doDel(q); sfx("pop"); } return; }
  if (bm.tool === "copy" || bm.tool === "cut") { copyBuild(bm.tool === "cut"); return; }
  if (bm.tool === "paste") { if (bm.clip) { doAdd(buildPiece(a, bm.clip)); sfx("pad"); } return; }
  doAdd(buildPiece(a)); sfx("pad");
}
// (owner, 2026-11-13) a neighborhood's bounds: with Bounds, a left drag on open space draws new ones for the neighborhood
// you're editing; clicking bounds picks them, dragging inside moves them and dragging an edge resizes that side. What's
// inside belongs to that neighborhood (the smallest bounds win where they overlap). Seen only while building.
let areaG = null;
const selArea = () => (bm && bm.sel && World.build.find((q) => q.id === bm.sel && q.k === "area")) || null;
function areaPt(px, py) { ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const v = new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -bm.ly), v) ? v : null; }
const inArea = (q, p, m = 0) => p.x >= q.x - m && p.x <= q.x + q.w + m && p.z >= q.z - m && p.z <= q.z + q.d + m;
function areaStart(px, py) {
  const a = pieceAt(px, py); if (a && a.n.y > 0.5) bm.ly = Math.round(a.p.y); const p = areaPt(px, py); if (!p) return;
  const s = selArea(), E = 1.5; let mode = null, q = null;
  if (s && inArea(s, p, E)) { q = s; const ex = Math.abs(p.x - s.x) <= E ? "x0" : Math.abs(p.x - s.x - s.w) <= E ? "x1" : "", ez = Math.abs(p.z - s.z) <= E ? "z0" : Math.abs(p.z - s.z - s.d) <= E ? "z1" : ""; mode = ex || ez ? { ex, ez } : "move"; }
  else { q = World.build.filter((o) => o.k === "area" && inArea(o, p)).sort((a, b) => a.w * a.d - b.w * b.d)[0] || null; if (q) { mode = "move"; bm.sel = q.id; bm.zone = q.zone; buildBar(); } else { mode = "draw"; if (bm.sel) { bm.sel = 0; buildBar(); } } }
  bm.adrag = { mode, p0: { x: Math.round(p.x), z: Math.round(p.z) }, q0: q && { ...q }, cur: null }; drawAreas();
}
function areaMove(px, py) {
  const D = bm.adrag, p = areaPt(px, py); if (!p) return; const x = Math.round(p.x), z = Math.round(p.z), M = World.AREA_MAX;
  if (D.mode === "draw") { const x0 = Math.min(x, D.p0.x), z0 = Math.min(z, D.p0.z), w = Math.abs(x - D.p0.x), d = Math.abs(z - D.p0.z); D.cur = w && d ? { id: 0, k: "area", x: x0, z: z0, y: 0, w: Math.min(w, M), d: Math.min(d, M), zone: bm.zone } : null; }
  else if (D.mode === "move") D.cur = { ...D.q0, x: D.q0.x + x - D.p0.x, z: D.q0.z + z - D.p0.z };
  else { const q = D.q0; let x0 = q.x, x1 = q.x + q.w, z0 = q.z, z1 = q.z + q.d; if (D.mode.ex === "x0") x0 = Math.min(x, x1 - 1); if (D.mode.ex === "x1") x1 = Math.max(x, x0 + 1); if (D.mode.ez === "z0") z0 = Math.min(z, z1 - 1); if (D.mode.ez === "z1") z1 = Math.max(z, z0 + 1); D.cur = { ...q, x: x0, z: z0, w: Math.min(x1 - x0, M), d: Math.min(z1 - z0, M) }; }
  drawAreas();
}
function areaEnd() {
  const D = bm.adrag; bm.adrag = null; const c = D.cur;
  if (c && D.mode === "draw") { const piece = strip(c); doAdd(piece, (id) => { if (bm) { bm.sel = id; buildBar(); drawAreas(); } }); sfx("pad"); }
  else if (c && (c.x !== D.q0.x || c.z !== D.q0.z || c.w !== D.q0.w || c.d !== D.q0.d)) doSet(D.q0, c);
  drawAreas();
}
// (owner, 2026-11-14) cinematic shots are things in the world while building: the Shot tile places one (up to 5 a
// neighborhood); click one to pick it and drag its arrows (red east-west, blue north-south, green up-down, like an
// editor's move tool) to move it a meter at a time; each move is saved as it's let go
const shotMarks = [], gizmoHandles = []; let gizmoG = null;
const shotList = () => (bm.zd && bm.zd.n === bm.zone ? bm.zd.shots : World.zoneCfg(bm.zone).shots).map((q) => ({ ...q }));
function saveShots(list) { const Z = World.zoneCfg(bm.zone); netSend({ t: "build", op: "zone", n: bm.zone, zone: { name: Z.name, sp: Z.sp, chance: Z.chance, shiny: Z.shiny, shots: list } }); if (bm.zd && bm.zd.n === bm.zone) bm.zd.shots = list.map((q) => ({ ...q })); }
function gizmo(q) {
  gizmoHandles.length = 0; const G = new THREE.Group(); G.position.set(q.x, q.y + 1.5, q.z); areaG.add(G); gizmoG = G; G.scale.setScalar(clamp(camera.position.distanceTo(G.position) / 16, 0.6, 8));
  for (const [ax, c] of [[[1, 0, 0], "#ff4d4d"], [[-1, 0, 0], "#ff4d4d"], [[0, 0, 1], "#3f8cff"], [[0, 0, -1], "#3f8cff"], [[0, 1, 0], "#3fd26a"], [[0, -1, 0], "#3fd26a"]]) {
    const a = new THREE.Vector3(...ax), h = new THREE.Group(); h.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a); G.add(h);
    const m = new THREE.MeshBasicMaterial({ color: c, depthTest: false }), sh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2, 8), m); sh.position.y = 1.4; sh.renderOrder = 5; h.add(sh);
    const hd = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 12), m); hd.position.y = 2.8; hd.renderOrder = 5; h.add(hd);
    const grab = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.8, 8), new THREE.MeshBasicMaterial({ visible: false })); grab.position.y = 1.9; grab.userData.axis = a; h.add(grab); gizmoHandles.push(grab);
  }
}
function axisT(px, py, p0, a) {   // how far along the axis (from p0) the pointer's ray passes closest
  ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const o = ray.ray.origin, d = ray.ray.direction, w = p0.clone().sub(o), b = a.dot(d), den = 1 - b * b;
  return den < 1e-4 ? 0 : (b * d.dot(w) - a.dot(w)) / den;
}
function shotDown(px, py) {   // a gizmo arrow or a shot under the pointer: true if it took the click
  ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const gh = ray.intersectObjects(gizmoHandles, false)[0], list = shotList();
  if (gh && list[bm.shotSel]) { const q = list[bm.shotSel], p0 = new THREE.Vector3(q.x, q.y + 1.5, q.z), a = gh.object.userData.axis; bm.gdrag = { a, p0, t0: axisT(px, py, p0, a), q0: { ...q }, list }; return true; }
  const sh = ray.intersectObjects(shotMarks, false)[0]; if (sh) { bm.shotSel = sh.object.userData.shot; sfx("tick"); drawAreas(); return true; }
  if (bm.shotSel !== undefined && bm.tool !== "shot") { bm.shotSel = undefined; drawAreas(); }
  return false;
}
function shotMove(px, py) {
  const D = bm.gdrag, u = Math.round(axisT(px, py, D.p0, D.a) - D.t0), q = D.list[bm.shotSel]; q.x = D.q0.x + D.a.x * u; q.y = D.q0.y + D.a.y * u; q.z = D.q0.z + D.a.z * u;
  if (bm.zd && bm.zd.n === bm.zone) bm.zd.shots[bm.shotSel] = { ...q }; else { D.live = 1; World.zoneCfg(bm.zone).shots[bm.shotSel] = { ...q }; } drawAreas();
}
function shotUp() { const D = bm.gdrag; bm.gdrag = null; const q = D.list[bm.shotSel]; if (q.x !== D.q0.x || q.y !== D.q0.y || q.z !== D.q0.z) { saveShots(D.list); sfx("pad"); } }
function drawAreas() {
  if (areaG) { scene.remove(areaG); areaG = null; } if (!bm) return; areaG = new THREE.Group(); scene.add(areaG);
  const D = bm.adrag, list = World.build.filter((q) => q.k === "area").map((q) => (D && D.cur && D.cur.id === q.id ? D.cur : q)); if (D && D.cur && !D.cur.id) list.push(D.cur);
  const y = bm.ly + 0.06, H = 6;
  for (const q of list) {
    const c = World.TIERS[q.zone].c, dk = "#" + new THREE.Color(c).multiplyScalar(0.62).getHexString(), sel = q.id && q.id === bm.sel || (D && q === D.cur), on = q.zone === bm.zone;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(q.w, q.d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: sel ? 0.28 : on ? 0.16 : 0.07, depthWrite: false })); f.position.set(q.x + q.w / 2, y, q.z + q.d / 2); f.renderOrder = 2; areaG.add(f);
    const sides = new THREE.Mesh(new THREE.BoxGeometry(q.w, H, q.d), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: sel ? 0.14 : on ? 0.08 : 0.04, depthWrite: false, side: THREE.BackSide })); sides.position.set(q.x + q.w / 2, y + H / 2, q.z + q.d / 2); areaG.add(sides);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(sides.geometry), new THREE.LineBasicMaterial({ color: sel ? "#ffd84a" : dk, transparent: true, opacity: on || sel ? 1 : 0.4 })); e.position.copy(sides.position); areaG.add(e);
    const t = textSprite(World.zoneName(q.zone), { size: 30, color: dk }); t.position.set(q.x + q.w / 2, y + H + 1, q.z + q.d / 2); areaG.add(t);
  }
  // the neighborhood's shot points: a ring and a post with its number and name (what's being edited, if the panel's open)
  const shots = bm.zd && bm.zd.n === bm.zone ? bm.zd.shots : World.zoneCfg(bm.zone).shots, sc = World.TIERS[bm.zone].c;
  shotMarks.length = 0;
  shots.forEach((q, k) => {
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 4, 12), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(q.x, q.y + 2, q.z); hit.userData.shot = k; areaG.add(hit); shotMarks.push(hit);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: bm.shotPick === k || bm.shotSel === k ? "#ffd84a" : sc, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })); ring.position.set(q.x, q.y + 0.08, q.z); areaG.add(ring);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), new THREE.MeshBasicMaterial({ color: "#ffffff" })); post.position.set(q.x, q.y + 1.5, q.z); areaG.add(post);
    const t = textSprite((k + 1) + (q.name ? " · " + q.name : ""), { size: 28 }); t.position.set(q.x, q.y + 3.8, q.z); areaG.add(t);
    const cm = new THREE.Group(); cm.position.set(q.x, q.y + 3, q.z); box(0.7, 0.5, 0.9, "#23303b", 0, 0, 0, cm, false); const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.35, 10).rotateX(Math.PI / 2), mat("#23303b")); lens.position.z = 0.6; cm.add(lens); areaG.add(cm);   // a little camera on the post
    if (bm.shotSel === k) gizmo(q);
  });
}
// the neighborhood panel: its name, the animal it gives, each rarity's chance and the shiny chance
function zonePanel() {   // (what's typed is kept while you pick shot points or the town changes, until Save or another neighborhood)
  const P = $("zpanel"), n = bm.zone, Z = World.zoneCfg(n); P.innerHTML = ""; P.style.display = "block";
  if (!bm.zd || bm.zd.n !== n) bm.zd = { n, name: Z.name, sp: Z.sp, chance: Z.chance.map((v) => +(v * 100).toFixed(3)), shinyN: Z.shiny > 0 ? Math.round(1 / Z.shiny) : 0, shots: Z.shots.map((q) => ({ ...q })) };
  const D = bm.zd, row = (name, node) => { const r = el("label", "zrow"); r.appendChild(el("span", "", name)); r.appendChild(node); P.appendChild(r); return node; };
  const num = (v, step, lo, hi, set) => { const i = document.createElement("input"); i.type = "number"; i.step = step; i.min = lo; i.max = hi; i.value = v; i.oninput = () => set(+i.value || 0); return i; };
  const h = el("b", "", World.zoneName(n)); h.style.boxShadow = "inset 0 -4px 0 " + World.TIERS[n].c; P.appendChild(h);
  const nm = row("Name", document.createElement("input")); nm.maxLength = 24; nm.value = D.name; nm.oninput = () => (D.name = nm.value);
  const sp = row("Animal", document.createElement("select")); for (const k of Object.keys(World.MOUNTS)) { const o = document.createElement("option"); o.value = k; o.textContent = World.MOUNTS[k].name; if (k === D.sp) o.selected = true; sp.appendChild(o); } sp.onchange = () => (D.sp = sp.value);
  World.RARITY.forEach((r, i) => { const inp = row(r + " %", num(D.chance[i], 0.1, 0, 100, (v) => (D.chance[i] = v))); inp.previousSibling.style.color = World.RARITY_C[i] === "#ffffff" ? "" : "#" + new THREE.Color(World.RARITY_C[i]).multiplyScalar(0.8).getHexString(); });
  row("Shiny 1 in", num(D.shinyN, 1, 0, 1e7, (v) => (D.shinyN = v)));
  // (owner, 2026-11-13) the cinematic shots shown when the neighborhood opens: 1 to 5, each a short name and a point the camera circles
  P.appendChild(el("b", "zsub", "Shots"));
  D.shots.forEach((q, k) => {
    const r = el("div", "zshot" + (bm.shotPick === k ? " pick" : "")); r.appendChild(el("i", "", String(k + 1)));
    const t = document.createElement("input"); t.maxLength = 24; t.value = q.name; t.oninput = () => { q.name = t.value; drawAreas(); }; r.appendChild(t);
    r.appendChild(ibtn("play", "Play", () => playShot(q, n), "bt"));
    r.appendChild(ibtn("pin", "Point", () => { bm.shotPick = bm.shotPick === k ? undefined : k; zonePanel(); }, "bt")); r.appendChild(ibtn("close", "Remove", () => { D.shots.splice(k, 1); bm.shotPick = undefined; zonePanel(); drawAreas(); }, "bt")); P.appendChild(r);
  });
  if (D.shots.length < World.SHOTS_MAX) P.appendChild(btn("+", () => { const a = bm.aim ? bm.aim.p : { x: me.x, y: me.y, z: me.z }; D.shots.push({ name: "", x: Math.round(a.x), y: Math.round(a.y), z: Math.round(a.z) }); bm.shotPick = D.shots.length - 1; zonePanel(); drawAreas(); }, "bt zadd"));
  const go = btn("Save", () => { const N = D.shinyN; netSend({ t: "build", op: "zone", n, zone: { name: D.name, sp: D.sp, chance: D.chance.map((v) => v / 100), shiny: N >= 2 ? 1 / N : 0, shots: D.shots } }); sfx("pad"); bm.zd = null; bm.shotPick = undefined; P.style.display = "none"; drawAreas(); }, "go"); P.appendChild(go);
}
function tapAt(sx, sy) {   // tapping a courier: their name and a party invitation
  if (bm) { buildTap(sx, sy); return; }
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
    bag = []; stolen = []; dropped = []; setTargets(); syncDropped(); belt = { ready: null, next: null }; beltShow(); if (mine) setCarry(mine, null); party = []; renderParty(); hudDirty = true;
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
function adopt(d) { const ride = save.ride, q0 = riding(), key = q0.sp + q0.r + q0.va + save.set.shirt + World.upTotal(save.up); save = World.cleanData(d); const q = riding(); if (!mine || ride !== save.ride || key !== q.sp + q.r + q.va + save.set.shirt + World.upTotal(save.up)) remount(); hudDirty = true; setVolumes(); if (panel && panel !== "admin") renderPanel(); }
function sendPos(force) {
  if (!netOk || (me.transit && me.transit.k === "pipe")) return;
  const mv = (me.moving ? 1 : 0) | (me.foot ? 2 : 0) | (me.ground ? 0 : 4) | (me.glide ? 16 : 0), s = [me.x.toFixed(2), me.y.toFixed(2), me.z.toFixed(2), me.yaw.toFixed(2), mv].join();
  if (!force && s === lastPos && performance.now() - lastSent < 1000) return;
  netSend({ t: "pos", x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(2), mv, ct: Math.round(performance.now()) }); lastPos = s; lastSent = performance.now();
}
function setNpc(m) {
  for (const [id, x, z, yaw, mode, y] of m.dogs || []) { const d = dogMesh[id]; if (!d) continue; d.tx = x; d.tz = z; d.tyaw = yaw; if (Number.isFinite(y)) d.ty = y; if (mode !== d.mode) { if (mode === 1 && hyp(x - me.x, z - me.z) < 45) sfx({ dog: "bark", cat: "meow", gator: "hiss", bear: "growl", wolf: "howl" }[World.dogs[id].sp] || "bark"); d.mode = mode; d.bang.visible = mode === 1; } }
  for (const [id, x, z, y, yaw, mode, carry] of m.geese || []) { const g = gooseMesh[id]; if (!g) continue; g.tx = x; g.tz = z; g.ty = y; g.tyaw = yaw; if (mode !== g.mode) { if (mode === 1 && hyp(x - me.x, z - me.z) < 45) sfx("honk"); if (mode === 4) emit(g.x, g.y + 0.8, g.z, 14, { colors: ["#ffffff", "#e8eef2"], speed: 3, up: 3, life: 0.9, grav: 3 }); g.mode = mode; }
    if (carry !== g.carry) { g.carry = carry; g.m.slot.clear(); if (carry >= 0) { const b = parcelMesh(carry, ""); b.scale.setScalar(0.6); g.m.slot.add(b); } } }
  for (const [id, x, z, yaw, mode] of m.goats || []) { const g = goatMesh[id]; if (!g) continue; g.tx = x; g.tz = z; g.tyaw = yaw; if (mode !== g.mode) { if (mode === 1 && hyp(x - me.x, z - me.z) < 45) { sfx("stomp"); emit(x, g.y + 0.1, z, 10, { colors: ["#c9bfae"], speed: 2.5, up: 1.5, life: 0.5, grav: 4 }); } g.mode = mode; } }
}
const whereOf = (id) => (id === myId ? me : others.get(id));
function knockedOff() { if (!me.foot) { me.foot = true; me.mx = me.x; me.my = me.y; me.mz = me.z; me.myaw = me.yaw; const a = Math.random() * TAU; me.px += Math.cos(a) * 7; me.pz += Math.sin(a) * 7; me.vy = 5; me.ground = false; } me.dash = 0; me.boost = 0; }
const dropMeshes = new Map();   // pid -> a dropped parcel on the ground
function syncDropped() { for (const [pid, g] of dropMeshes) if (!dropped.some((q) => q.pid === pid)) { scene.remove(g); dropMeshes.delete(pid); } for (const q of dropped) if (!dropMeshes.has(q.pid)) { const g = parcelMesh(q.tier, q.mod); g.position.set(q.x, q.y, q.z); g.userData.q = q; scene.add(g); dropMeshes.set(q.pid, g); } }
function onNet(m) {
  switch (m.t) {
    case "welcome": {
      if (stale(m.web, false, m.by)) return;
      World.setBuild({ pieces: m.build || [], zones: m.zones || [] }); drawBuild();   // (owner, 2026-11-13) the town the zone builder placed
      setTok(m.token); const again = loggedIn && myName === m.name; myName = m.name; myId = m.id; myRole = m.role || "player"; $("mbuild").hidden = $("modds").hidden = myRole !== "admin"; netOk = true; loggedIn = true; clockOff = m.now - Date.now();
      $("login").style.display = "none"; $("hud").style.display = "block"; if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      save = World.cleanData(m.data); shownCoins = save.coins; $("coinn").textContent = fmt(save.coins); remount(); setVolumes(); giftsUi(); if (!again && !save.set.tut && !save.stats.del && tut < 0) setTimeout(() => tutShow(0), 900);
      if (!again) { me.x = m.x; me.z = m.z; me.y = m.y || 0; faceSpawn(); msgs.innerHTML = ""; }
      me.foot = false; me.stun = 0; me.transit = null; me.hidden = false;
      setPods(m.pods || []); for (const p of m.players) addOther(p); setNpc(m); for (const g of gooseMesh) { g.x = g.tx; g.z = g.tz; g.y = g.ty; } for (const d of dogMesh) { d.x = d.tx; d.z = d.tz; d.y = d.ty; } for (const g of goatMesh) { g.x = g.tx; g.z = g.tz; } hudDirty = true; sendPos(true);
      break;
    }
    case "auth_err": if (m.why === "expired") { setTok(null); showLogin(); } else showLogin(m.why === "banned" ? "Banned" + untilText(m.until) : ERR[m.why] || ERR.server); break;
    case "kicked": kicked = true; loggedIn = false; $("hud").style.display = "none"; showLogin(m.why === "kick" ? "Kicked" : m.why === "banned" ? "Banned" + untilText(m.until) : ERR.kicked); break;
    case "muted": if (m.until) toast("Muted" + untilText(m.until), "#e5534b"); break;
    case "role": myRole = m.role; $("mbuild").hidden = $("modds").hidden = myRole !== "admin"; if (myRole !== "admin" && bm) endBuild(); if (panel) renderPanel(); break;
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
    case "mount": { const o = others.get(m.id); if (o) addOther(Object.assign({}, o, { sp: m.sp, r: m.r | 0, va: m.va, tr: m.tr || "" })); break; }
    case "rank": { const o = others.get(m.id); if (o) addOther(Object.assign({}, o, { rank: m.rank })); else if (m.id === myId) remount(); break; }
    case "look": { const o = others.get(m.id); if (o) addOther(Object.assign({}, o, { friendly: m.friendly, shirt: m.shirt })); break; }
    case "carry": { const o = others.get(m.id); if (o) { o.carry = m.c; setCarry(o.rig, m.c); } break; }
    case "belt": { const pop = !!m.next && JSON.stringify(m.next) !== JSON.stringify(belt.next), slide = belt.next && m.ready && JSON.stringify(m.ready) === JSON.stringify(belt.next); belt = { ready: m.ready, next: m.next }; beltShow(slide, pop); break; }
    case "bag": {   // my parcels changed; ev says how
      const ev = m.ev || {}, before = bag.length; bag = m.bag || []; stolen = m.stolen || []; dropped = m.dropped || []; { const tn = performance.now() / 1000; for (const q of [...stolen, ...dropped]) q.endAt = tn + (q.left || 0); } cap = m.cap || 1; setCarry(mine, bagCarry()); setTargets(); syncDropped(); hudDirty = true; cardKey = "";
      const q = bag.find((k) => k.pid === ev.pid);
      if (ev.k === "grab") { tutDid("grab"); sfx("grab"); me.squash = 0.25; if (bag.length > 1) popup(bag.length + " / " + cap, "#ffffff", me.x, me.y + 3, me.z); }
      else if (ev.k === "pickup") { sfx("grab"); me.squash = 0.25; if (ev.bonus) { popup("+" + ev.bonus, "#d9a6ff", me.x, me.y + 2.6, me.z); save.coins = ev.coins; flyCoins(me.x, me.y + 2, me.z, 3); } }
      else if (ev.k === "crack") { sfx("crack"); cam.shake = Math.max(cam.shake, 0.35); flash("#e5534b"); popup("-20%", "#ff6b6b", me.x, me.y + 2.8, me.z); emit(me.x, me.y + 1.4, me.z, 12, { colors: ["#c89a5e", "#8a5a34"], speed: 4, up: 3, life: 0.6, size: 0.14 }); }
      else if (ev.k === "lost") { sfx("smash"); cam.shake = Math.max(cam.shake, 0.5); flash("#e5534b"); banner(ev.why === "broke" ? "PARCEL BROKE!" : "PARCEL LOST!", "#ff6b6b"); emit(me.x, me.y + 1.4, me.z, 26, { colors: ["#c89a5e", "#8a5a34", "#fff8e6"], speed: 6, up: 5, life: 0.9 }); }
      else if (ev.k === "stolen") { sfx("steal"); sfx("honk"); banner("STOLEN!", "#ff6b6b"); cam.shake = Math.max(cam.shake, 0.3); }
      void before; break;
    }
    case "delivered": {
      const h = addrOf(m.house); sfx("deliver"); emit(h.mx, h.my + 1.6, h.mz, 60, { colors: CONFETTI, speed: 6, up: 8, life: 1.3 }); me.squash = 0.2;
      popup("+" + fmt(m.coins), "#d9a6ff", h.mx, h.my + 2.4, h.mz); flyCoins(h.mx, h.my + 1.6, h.mz, 5); if (houseMesh[m.house]) { houseMesh[m.house].shake = 0.01; houseMesh[m.house].pop = 0.3; }
      save = World.cleanData(m.data); delivered(h, m.gift, m.near, m.merges); tutDid("deliver"); break;
    }
    case "opened": {   // what came out of the parcels I opened
      save = World.cleanData(m.data);
      if (opening && opening.run) startReveal(m.list); else if (opening) { opening.res = { list: m.list }; tutDid("open"); } else { landGifts(m.list); tutDid("open"); } break;
    }
    case "stun": me.stun = m.s; if (me.transit && me.transit.k !== "pipe") me.transit = null; knockedOff(); sfx("stun"); cam.shake = Math.max(cam.shake, 0.5); flash(m.why === "kick" ? "#ffffff" : "#e5534b"); if (m.why === "dog") sfx("growl"); break;
    case "knock": me.px = m.x; me.pz = m.z; me.vy = m.y; me.ground = false; sfx("kick"); cam.shake = Math.max(cam.shake, 0.5); break;
    case "tp": { const sp0 = hyp(me.vx, me.vz); if (m.why === "home" || m.why === "balloon") faceSpawn();   // (owner, 2026-11-13) facing the way the respawn point is turned
      me.x = m.x; me.y = m.y; me.z = m.z; me.vx = me.vz = me.vy = me.px = me.pz = 0; me.transit = null; me.ground = true; me.armed = false; me.foot = false; camAt.y = m.y + 2; if (m.why === "fall") { flash("#ffffff"); sfx("pop"); } else if (m.why === "home") { cam.yaw = -Math.PI / 2; sfx("pad"); } else if (m.why === "tube") { me.yaw = m.yaw; cam.yaw = me.yaw - Math.PI; me.vx = Math.sin(me.yaw) * sp0; me.vz = Math.cos(me.yaw) * sp0; sfx("pipe"); emit(me.x, me.y + 1, me.z, 18, { colors: ["#5fb56b", "#ffffff"], speed: 4, up: 3, life: 0.5 }); } else { flash("#bfe6ff"); sfx("pad"); }   /* tube: (owner, 2026-11-13) out of a pipe shortcut, keeping your speed; home: (owner, 2026-11-11) the run's over, back at the post office */ sendPos(true); break; }
    case "piped": me.transit = { k: "pipe", until: now() + m.s, x: m.x, y: m.y, z: m.z }; me.hidden = true; me.vx = me.vz = me.px = me.pz = 0; sfx("pipe"); if (m.goose) setTimeout(() => sfx("honk"), 600); break;
    case "rock": { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3), mat("#8a8278")); r.position.set(m.x, m.y + 22, m.z); scene.add(r); fallers.push({ g: r, y0: m.y + 22, y1: m.y + 0.8, t: 0, s: m.s });
      groundMark(m.x, m.y, m.z, World.ROCK.r, m.s, "#1d232a", (k) => { if (hyp(k.x - me.x, k.z - me.z) < 60) sfx("rock"); emit(k.x, k.y + 0.3, k.z, 22, { colors: ["#8a8278", "#c9bfae"], speed: 6, up: 4, life: 0.7 }); if (hyp(k.x - me.x, k.z - me.z) < 14) cam.shake = Math.max(cam.shake, 0.4); }); break; }
    case "dive": { const g = gooseModel(true); g.g.position.set(m.x + 9, m.y + 14, m.z); g.g.scale.setScalar(1.4); scene.add(g.g); divers.push({ g, x: m.x, y: m.y, z: m.z, t: 0, s: m.s }); if (hyp(m.x - me.x, m.z - me.z) < 40) sfx("honk"); groundMark(m.x, m.y, m.z, World.SKYGOOSE.r, m.s, "#2b3a66"); break; }
    case "fx": onFx(m); break;
    case "sold": adopt(m.data); selMount = save.ride; if (panel === "stable") renderPanel(); sfx("coin"); popup("+" + fmt(m.n), "#d9a6ff", me.x, me.y + 2.6, me.z); break;
    case "fused": adopt(m.data); selMount = m.m.id; if (panel === "stable") renderPanel(); hatchShow("fuse", m.m); break;
    case "reset": location.reload(); break;   // (owner, 2026-11-11) staff made this a brand new courier
    case "petup": adopt(m.data); remount(); sfx("buy"); if (panel === "stable") renderPanel(); emit(me.x, me.y + 2, me.z, 30, { colors: ["#c77dff", "#ffffff", "#e2b8ff"], speed: 4, up: 5, life: 1 }); break;
    case "buildok": { const f = pend.get(m.tag); pend.delete(m.tag); if (f) f(m.id); break; }
    case "build": World.setBuild({ pieces: m.build || [], zones: m.zones || [] }); drawBuild(); setPods(lastPods); if (bm) { buildAim(bm.px, bm.py); pipeSel(); drawHazSel(); if (bm.sel && !World.build.some((q) => q.id === bm.sel)) bm.sel = 0; drawAreas(); if ($("zpanel").style.display === "block") zonePanel(); } break;   // (owner, 2026-11-13) someone built
    case "aura": save.coins = m.coins; popup("+" + fmt(m.n), "#d9a6ff", me.x, me.y + 2.6, me.z); hudDirty = true; break;   // (owner, 2026-11-12) a podium paid
    case "podiums": setPods(m.pods); break;
    case "upgraded": adopt(m.data); remount(); sfx("buy"); emit(me.x, me.y + 2, me.z, 30, { colors: ["#ffd84a", "#ffffff", "#7ee08a"], speed: 4, up: 5, life: 1 }); break;
    case "announce": { const a = $("announce"); a.textContent = m.name + (m.fused ? " merged a " : " found a ") + mountName(m) + "!"; a.style.color = m.va ? "#bfe6ff" : RARITY_C[m.r | 0]; a.classList.remove("go"); void a.offsetWidth; a.classList.add("go"); sfx("shiny"); break; }
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
    case "stun": if (o && !mineFx) o.stunT = m.s; break;
    case "grace": if (mineFx) me.grace = m.s; else if (o) o.graceT = m.s; break;
    case "crack": if (o && nearMe) { sfx("crack"); emit(o.x, o.y + 1.4, o.z, 10, { colors: ["#c89a5e", "#8a5a34"], speed: 4, up: 3, life: 0.6, size: 0.14 }); } break;
    case "break": if (!mineFx && hyp(m.x - me.x, m.z - me.z) < 50) { sfx("smash"); emit(m.x, m.y + 1.4, m.z, 22, { colors: ["#c89a5e", "#8a5a34", "#fff8e6"], speed: 6, up: 5, life: 0.9 }); } break;
    case "del": { const h = addrOf(m.house); if (h && hyp(h.mx - me.x, h.mz - me.z) < 70) { emit(h.mx, h.my + 1.6, h.mz, 36, { colors: CONFETTI, speed: 5, up: 7, life: 1.2 }); if (m.roll >= 2) setTimeout(() => emit(h.mx, h.my + 2.6, h.mz, 20 + m.roll * 10, { colors: [RARITY_C[m.roll], "#ffffff"], speed: 5, up: 5, life: 1.1 }), 1500); houseMesh[m.house].pop = 0.3; } break; }
    case "busted": popup("GOOSE BUSTED!", "#ffd84a", m.x, m.y + 2, m.z, true); emit(m.x, m.y + 1, m.z, 30, { colors: ["#ffffff", "#e8eef2", "#ffd84a"], speed: 5, up: 5, life: 1.1, grav: 4 }); if (hyp(m.x - me.x, m.z - me.z) < 60) sfx("busted"); if (mineFx) { hitStop = 0.05; cam.shake = Math.max(cam.shake, 0.4); } break;
    case "yelp": { const d = dogMesh[m.dog]; if (d && hyp(d.x - me.x, d.z - me.z) < 45) tone(900, 500, 0.18, { type: "sawtooth", vol: 0.25 }); break; }
    case "bite": { const d = dogMesh[m.dog]; if (d && hyp(d.x - me.x, d.z - me.z) < 45) sfx("growl"); break; }
    case "steal": if (o && nearMe) sfx("steal"); break;
    case "skysteal": if (o && nearMe) sfx("steal"); break;
    case "shake": if (o) { if (mineFx) { popup("SHAKEN OFF!", "#7ee08a", me.x, me.y + 2.8, me.z); sfx("swish"); } emit(o.x, o.y + 1, o.z, 12, { colors: ["#ffffff", "#7ee08a"], speed: 4, up: 2, life: 0.5, size: 0.14 }); } break;
    case "butt": if (o && nearMe && !mineFx) sfx("kick"); break;
    case "pipe": if (o) { o.hideT = m.s; if (nearMe) sfx("pipe"); } break;
  }
}

// ---- the conveyor's two parcels (yours alone), the address you're riding to ----
let readyMesh = null, nextMesh = null, pusher = null; const beltStripes = [], targetFx = new Map();   // house id -> its marker
function beltShow(slide, pop) {
  if (readyMesh && readyMesh.parent) readyMesh.parent.remove(readyMesh); if (nextMesh && nextMesh.parent) nextMesh.parent.remove(nextMesh); readyMesh = nextMesh = null;
  if (belt.ready) { readyMesh = parcelMesh(belt.ready.tier, belt.ready.mod); readyMesh.scale.setScalar(BELT_SC); (poG || scene).add(readyMesh); beltSlide = slide || pop ? BELT_SLIDE : 0; }
  // (owner, 2026-11-11) one big parcel on the belt: only your Ready one shows (pushed out of the door each time)
  if (belt.ready && (slide || pop) && loggedIn) setTimeout(() => { if (World.PO.on && hyp(me.x - World.PO.x, me.z - World.PO.z) < 40) sfx("pop"); }, 220);
}
function setTargets() {   // a marker over every address I'm carrying a parcel to
  const want = new Set(bag.map((q) => q.house)); for (const [id, g] of targetFx) if (!want.has(id)) { scene.remove(g); targetFx.delete(id); }
  for (const id of want) if (!targetFx.has(id)) targetFx.set(id, targetMarker(addrOf(id)));
}
function targetMarker(h) {
  const fx = new THREE.Group(); fx.position.set(h.mx, h.my, h.mz);
  const flat = (geo, c, o, y) => { const m = new THREE.Mesh(geo.rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false })); m.position.y = y; m.renderOrder = 3; return m; };
  const ring = flat(new THREE.RingGeometry(World.DELIVER_R - 0.55, World.DELIVER_R, 44), POI, 1, 0.16), edge = flat(new THREE.RingGeometry(World.DELIVER_R, World.DELIVER_R + 0.22, 44), "#ffffff", 1, 0.15), fill = flat(new THREE.CircleGeometry(World.DELIVER_R - 0.55, 44), POI, 0.4, 0.13);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 90, 14, 1, true), new THREE.MeshBasicMaterial({ color: POI, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 45;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 90, 8, 1, true), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); core.position.y = 45;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), new THREE.MeshBasicMaterial({ color: POI })); gem.position.y = 4.2; gem.scale.y = 1.4;
  const label = textSprite(h.name, { size: 44, color: "#ffffff", bg: POI, glow: "#ffffff" }); label.position.y = 6.6; label.scale.multiplyScalar(2);
  fx.add(fill, ring, edge, beam, core, gem, label); fx.userData = { ring, label, gem }; scene.add(fx); return fx;
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
  else { if (rig.spin > 0) rig.spin = Math.max(0, rig.spin - dt); const sp = rig.spin > 0 ? 1 - rig.spin / 0.7 : 0;   // a level up: a hop and a full spin
    g.position.set(s.x, s.y + (s.hop > 0 ? Math.sin((s.hop / 0.3) * Math.PI) * 0.5 : 0) + (sp ? Math.sin(sp * Math.PI) * 1.4 : 0), s.z); g.rotation.y = s.yaw + sp * TAU; animatePet(rig.m, t, s.moving, speed, s.air);
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
    if (o.va && !(o.hideT > 0)) { const f = foot; sparkle(f ? o.mx : o.x, f ? o.my : o.y, f ? o.mz : o.z, World.mountScale({ r: o.r | 0 }), dt); }
    if ((o.mv & 1) && !(o.mv & 6) && (o.r >= 4 || o.tr)) { o.stepT -= dt; if (o.stepT <= 0) { o.stepT = 0.18; trail(o.x, o.y, o.z, o, ""); } }
  }
}
function stepNpcs(dt, t) {
  const k = 1 - Math.exp(-14 * dt);
  const far = (o) => { const v = Math.abs(o.x - camera.position.x) < 170 && Math.abs(o.z - camera.position.z) < 170; o.m.g.visible = v; return !v; };   // animals a long way off aren't drawn
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
  for (const h of Object.values(houseMesh)) { if (h.shake > 0) { h.shake -= dt; h.mb.rotation.z = h.shake > 0 ? Math.sin(t * 40) * 0.25 : 0; } if (h.pop > 0) { h.pop -= dt; h.mb.scale.setScalar(1 + Math.max(0, Math.sin((h.pop / 0.3) * Math.PI)) * 0.4); } }
  if (readyMesh) readyMesh.visible = World.PO.on; if (nextMesh) nextMesh.visible = World.PO.on;
  { const P = World.PO_LOCAL, BT = P.belt, top = BT.top, door = BT.z0 - 0.2, endZ = P.end.z, u = beltSlide > 0 ? 1 - beltSlide / BELT_SLIDE : 1, run = beltSlide > 0;
    if (beltSlide > 0) beltSlide = Math.max(0, beltSlide - dt);
    const e = u < 1 ? 1 - Math.pow(1 - u, 2) : 1, rz = door + (endZ - door) * e;
    if (readyMesh) { readyMesh.position.set(P.end.x, top + (run ? 0 : Math.abs(Math.sin(t * 3)) * 0.12), rz); readyMesh.rotation.y = run ? 0 : Math.sin(t * 0.8) * 0.25; }
    if (nextMesh) nextMesh.position.set(P.end.x, Math.max(top, nextMesh.position.y - dt * 14), door + 0.9);
    if (pusher) pusher.position.z = run ? rz - 0.9 * BELT_SC * 0.72 - 0.25 : Math.max(BT.z0 - 0.4, pusher.position.z - dt * 6);   // the pusher follows the parcel out, then goes back in
    const L = BT.z1 - BT.z0; if (run) beltStripes.off = (beltStripes.off || 0) + dt * 4.4; beltStripes.forEach((m, k) => { m.position.z = BT.z0 + (((k / 10) * L + (beltStripes.off || 0)) % L); }); }
  for (const fx of targetFx.values()) { const u = fx.userData; u.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.06); u.gem.position.y = 4.2 + Math.sin(t * 3) * 0.4; u.gem.rotation.y = t * 2; }
  for (const g of dropMeshes.values()) { const dq = g.userData.q; g.position.y = dq.y + 0.3 + Math.abs(Math.sin(t * 4)) * 0.5; g.rotation.y = t * 2; if (Math.random() < 0.2) emit(dq.x, dq.y + 1, dq.z, 1, { colors: ["#ffd84a"], speed: 1, up: 2, life: 0.6, grav: 0, size: 0.1 }); }
  for (const b of World.balloons) b.g.position.y = b.y + Math.sin(t * 1.2 + b.x) * 0.25;
  for (const a of [...dogMesh, ...gooseMesh, ...goatMesh]) { const r = a.m.g.userData.rar; if (r >= 3 && a.m.g.visible && Math.random() < (r === 4 ? 0.12 : 0.06)) emit(a.x + (Math.random() - 0.5), (a.y || 0) + 0.3 + Math.random(), a.z + (Math.random() - 0.5), 1, { colors: [RARITY_C[r], "#ffffff"], speed: 0.6, up: 1.4, life: 0.7, grav: -1, size: 0.12 }); }
  stepTimers(); stepGates(t);
}
// (owner, 2026-11-11) areas you haven't opened: there to see, behind a shimmering wall across the town at their start (a
// bubble over the Sky Cannon for the Floating Islands), with a padlock on it; gone once your mounts open the area
const gates = [];
function lock(g, y) { const L = new THREE.Group(); L.position.y = y; g.add(L); box(1.6, 1.3, 0.5, "#f2b01e", 0, 0, 0, L); const sh = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.14, 8, 18, Math.PI), mat("#c9ced6")); sh.position.y = 0.65; L.add(sh); box(0.22, 0.42, 0.55, "#23303b", 0, -0.05, 0, L, false); return L; }
function buildGates() {}
// ---- (owner, 2026-11-13) the town the zone builder placed: drawn again whenever it changes ----
const MAT_C = { grass: "#7cc36a", dirt: "#a07a52", stone: "#a9adb5", brick: "#b9573f", wood: "#a87a4a", road: "#84878f", sand: "#e8cf8f", snow: "#f4f8fb", ice: "#bfe9ff", water: "#3f8fd0", mud: "#6b4d33", turbine: "#8d99a6" };
  // (owner, 2026-11-11) the post office: a building, its conveyor belt coming out of the door to where your parcel waits
function officeMeshes() { const P = World.PO_LOCAL, B = P.b, BT = P.belt, W2 = B.hw * 2, D2 = B.hd * 2, front = B.z + B.hd, door = 3.4;
    box(W2, 0.3, D2, "#c9bda8", B.x, 0.15, B.z);   // the floor
    box(W2, B.h, 0.5, "#f3e6cf", B.x, B.h / 2, B.z - B.hd + 0.25); box(0.5, B.h, D2, "#f3e6cf", B.x - B.hw + 0.25, B.h / 2, B.z); box(0.5, B.h, D2, "#f3e6cf", B.x + B.hw - 0.25, B.h / 2, B.z);   // back and sides
    for (const sx of [-1, 1]) box(B.hw - door / 2, B.h, 0.5, "#f3e6cf", B.x + sx * (door / 2 + (B.hw - door / 2) / 2), B.h / 2, front - 0.25);   // the front, either side of the door
    box(door, B.h - 3.2, 0.5, "#f3e6cf", B.x, 3.2 + (B.h - 3.2) / 2, front - 0.25); box(door + 0.6, 0.3, 0.7, "#e0604a", B.x, 3.25, front - 0.2);   // over the door
    box(door, 3.2, 0.2, "#2a3440", B.x, 1.6, front - 0.55, null, false);   // the dark doorway
    for (const sx of [-1, 1]) for (const wx of [3.2, 6]) { box(1.5, 1.4, 0.2, "#bfe6ff", B.x + sx * wx, 3.4, front + 0.02, null, false); box(1.7, 0.18, 0.3, "#e0604a", B.x + sx * wx, 2.62, front + 0.05, null, false); }
    box(W2 + 0.6, 0.5, D2 + 0.6, "#e0604a", B.x, B.h + 0.25, B.z);   // the eaves
    for (const sz of [-1, 1]) { const r = box(W2 + 0.8, 0.4, B.hd * 1.2, "#c84a37", B.x, B.h + 1.55, B.z + sz * B.hd * 0.5); r.rotation.x = sz * 0.5; }   // the roof
    box(1.0, 2.2, 1.0, "#9a6b4a", B.x + 4.5, B.h + 2.2, B.z - 1.5);   // the chimney
    { const s2 = textSprite("POST OFFICE", { size: 56, color: "#ffffff", bg: "#e0604a" }); s2.scale.multiplyScalar(1.5); s2.position.set(B.x, B.h + 0.9, front + 0.6); s2.material.depthTest = true; scene.add(s2); }
    // the conveyor: legs, side rails, the belt (its stripes move), rollers, a stop at the end
    const L = BT.z1 - BT.z0, mz = (BT.z0 + BT.z1) / 2;
    box(BT.hw * 2, 0.7, L, "#6f7d8a", P.x, 0.35, mz); for (const sx of [-1, 1]) box(0.18, 0.35, L, "#c9ced6", P.x + sx * (BT.hw - 0.09), BT.top + 0.1, mz);
    box(BT.hw * 2 - 0.36, 0.12, L, "#2b333b", P.x, BT.top - 0.05, mz, null, false);
    box(BT.hw * 2, 0.7, 0.3, "#f2b01e", P.x, BT.top + 0.3, BT.z1 - 0.15);   // the stop
    beltStripes.length = 0; for (let k = 0; k < 10; k++) beltStripes.push(box(BT.hw * 2 - 0.4, 0.04, 0.22, "#4a5560", P.x, BT.top + 0.02, BT.z0 + (k / 10) * L, null, false));
    pusher = box(BT.hw * 2 - 0.4, 0.8, 0.3, "#e0604a", P.x, BT.top + 0.4, BT.z0 - 0.4);   // it pushes your parcel out to the end
  }
const chevrons = (bg, fg, right) => { const cv = document.createElement("canvas"); cv.width = cv.height = 128; const g = cv.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, 128, 128); g.strokeStyle = fg; g.lineWidth = 14; g.lineCap = "round"; g.lineJoin = "round";
  for (const v of [92, 58, 24]) { g.beginPath(); if (right) { g.moveTo(128 - v - 18, 30); g.lineTo(128 - v + 8, 64); g.lineTo(128 - v - 18, 98); } else { g.moveTo(30, v + 18); g.lineTo(64, v - 8); g.lineTo(98, v + 18); } g.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
const BOOST_M = new THREE.MeshLambertMaterial({ map: chevrons("#ffd84a", "#e0701a") }), START_T = chevrons("#a45be0", "#f3e3ff"), POD_C = ["#e8b923", "#c9d1d9", "#c98a4b"];
let buildG = null, poG = null;
// one piece's model (live: the real one, registered for mailbox shakes and gate locks; else a blueprint)
function pieceMesh(q, live) {
  const G = new THREE.Group();
  if (q.k === "office") {   // built as if at (0, 0) facing +z, then moved and turned as it stands
    const keep = [beltStripes.slice(), pusher], n0 = scene.children.length; officeMeshes(); for (const o of scene.children.slice(n0)) G.add(o);
    G.position.set(q.x, q.y, q.z); G.rotation.y = (q.r | 0) * Math.PI / 2; if (!live) { beltStripes.length = 0; beltStripes.push(...keep[0]); pusher = keep[1]; }
  }
    else if (q.k === "block") { const m = box(q.w, q.h, q.d, MAT_C[q.m], q.x + q.w / 2, q.y + q.h / 2, q.z + q.d / 2, G); if (q.m === "water" || q.m === "ice") { m.material = new THREE.MeshLambertMaterial({ color: MAT_C[q.m], transparent: true, opacity: q.m === "water" ? 0.6 : 0.85, depthWrite: q.m !== "water" }); } m.userData.pid = q.id;
      if (q.m === "turbine") {   // (owner, 2026-11-13) a fan on top, spinning, that blows you up into the air
        const f = new THREE.Group(); f.position.set(q.x + q.w / 2, q.y + q.h + 0.08, q.z + q.d / 2); G.add(f); const R0 = Math.min(q.w, q.d) * 0.45;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R0, 0.12, 6, 28).rotateX(Math.PI / 2), mat("#4d5863")); f.add(ring); const hub = new THREE.Mesh(new THREE.CylinderGeometry(R0 * 0.18, R0 * 0.18, 0.2, 10), mat("#4d5863")); f.add(hub);
        const bl = new THREE.Group(); f.add(bl); for (let k = 0; k < 3; k++) { const b = box(R0 * 0.9, 0.06, R0 * 0.3, "#dfe6ec", 0, 0.05, 0, null, false); b.geometry = BOX; b.position.set(Math.cos((k * TAU) / 3) * R0 * 0.48, 0.05, Math.sin((k * TAU) / 3) * R0 * 0.48); b.rotation.y = -(k * TAU) / 3; b.rotation.x = 0.35; bl.add(b); }
        if (live) fans.push({ g: bl, q });
      } }
    else if (q.k === "gust") {   // (owner, 2026-11-13) its box and an arrow the way it blows: only builders see these (players see the wind)
      const a = (q.a * Math.PI) / 180, b = new THREE.Mesh(new THREE.BoxGeometry(q.w, q.h, q.d), new THREE.MeshBasicMaterial({ color: "#cfeeff", transparent: true, opacity: 0.18, depthWrite: false })); b.position.set(q.x + q.w / 2, q.y + q.h / 2, q.z + q.d / 2); G.add(b);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(b.geometry), new THREE.LineBasicMaterial({ color: "#5fb8e8" })); e.position.copy(b.position); G.add(e);
      const ar = new THREE.Group(); ar.position.copy(b.position); ar.rotation.y = a; G.add(ar); const L = Math.max(1.5, Math.min(q.w, q.d) * 0.7);
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, L, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#2f8fd0" })); ar.add(sh); const hd = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 10).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#2f8fd0" })); hd.position.z = L / 2 + 0.4; ar.add(hd);
      if (live) { G.visible = !!bm; buildOnly.push(G); }
    }
    else if (q.k === "mover") {   // (owner, 2026-11-13) a platform going between A (where it was placed) and B; builders see B as a ghost and a line
      const g = new THREE.Group(); g.position.set(q.x, q.y, q.z); G.add(g); const m = box(q.w, q.h, q.d, MAT_C[q.m] || MAT_C.wood, q.w / 2, q.h / 2, q.d / 2, g);
      const st = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(q.w, q.h, q.d)), new THREE.LineBasicMaterial({ color: "#ffd84a" })); st.position.set(q.w / 2, q.h / 2, q.d / 2); g.add(st); void m;
      if (live) {
        moverMeshes.push({ g, q });
        const B = new THREE.Group(); const gb = new THREE.Mesh(new THREE.BoxGeometry(q.w, q.h, q.d), new THREE.MeshBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0.22, depthWrite: false })); gb.position.set(q.x + q.bx + q.w / 2, q.y + q.by + q.h / 2, q.z + q.bz + q.d / 2); B.add(gb);
        const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(q.x + q.w / 2, q.y + q.h, q.z + q.d / 2), new THREE.Vector3(q.x + q.bx + q.w / 2, q.y + q.by + q.h, q.z + q.bz + q.d / 2)]), new THREE.LineDashedMaterial({ color: "#ffd84a", dashSize: 0.6, gapSize: 0.4 })); ln.computeLineDistances(); B.add(ln);
        B.visible = !!bm; buildOnly.push(B); G.add(B); B.traverse((o) => { o.userData.noPick = 1; });
      }
    }
    else if (q.k === "house") {
      const hb = World.buildings.find((b) => b.id === q.id), [wall, roof] = HOUSE_C[hb ? hb.d : World.districtAt(q.x, q.z, q.y)] || HOUSE_C[0], g = new THREE.Group(), S = World.HOUSE_S; g.position.set(q.x, q.y, q.z); g.rotation.y = (q.r | 0) * Math.PI / 2; G.add(g);
      box(S, 3.2, S, wall, 0, 1.6, 0, g).userData.pid = q.id; box(1.3, 2.1, 0.12, roof, 0, 1.05, S / 2 + 0.02, g, false);
      for (const x of [-1, 1]) box(1.1, 1.0, 0.1, "#bfe6ff", x * S * 0.3, 2.0, S / 2 + 0.02, g, false);
      const rf = new THREE.Mesh(new THREE.ConeGeometry(S * 0.8, 2.6, 4), mat(roof)); rf.rotation.y = Math.PI / 4; rf.position.y = 4.5; rf.castShadow = true; rf.userData.pid = q.id; g.add(rf);
    }
    else if (q.k === "mailbox") {
      const mb = new THREE.Group(); mb.position.set(q.x, q.y, q.z); mb.rotation.y = (q.r | 0) * Math.PI / 2; G.add(mb);
      box(0.14, 1.0, 0.14, "#f4f1ea", 0, 0.5, 0, mb).userData.pid = q.id; const bx = box(0.5, 0.42, 0.75, "#3a8ee6", 0, 1.2, 0, mb); bx.userData.pid = q.id; box(0.06, 0.34, 0.06, "#e5534b", 0.3, 1.45, 0.2, mb, false);
      if (live) houseMesh[q.id] = { mb, bx, shake: 0 };
    }
    else if (q.k === "gate" || q.k === "wall") {   // (owner, 2026-11-13) a blue holographic boundary while it's closed to you: a gate has posts, a beam and a padlock; a bound wall is just the boundary
      const g = new THREE.Group(), W2 = q.k === "gate" ? World.GATE_W : q.w, H = World.GATE_H; g.position.set(q.x, q.y, q.z); g.rotation.y = (q.r | 0) * Math.PI / 2; G.add(g);
      if (q.k === "gate") { for (const x of [-W2 / 2, W2 / 2]) box(0.7, H, 0.7, "#6f7d8a", x, H / 2, 0, g); box(W2 + 0.7, 0.6, 0.7, "#6f7d8a", 0, H, 0, g); }
      const sh = new THREE.Group(); g.add(sh); const w = holoWall(W2, H, gateC(q.zone)); w.position.y = H / 2; sh.add(w);
      for (const y of [0.05, H]) { const e = new THREE.Mesh(new THREE.BoxGeometry(W2, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(gateC(q.zone)).lerp(new THREE.Color("#ffffff"), 0.5) })); e.position.y = y; sh.add(e); }
      const L = q.k === "gate" ? lock(sh, H / 2) : null; if (live) gates.push({ g: sh, w, L, d: q.zone, built: 1, at: q });
    }
    else if (q.k === "pipe") {   // (owner, 2026-11-13) on its side, its mouth the way it's turned; bright green once linked
      const g = new THREE.Group(), R = World.TUBE.r, L = World.TUBE.l, on = live && World.tubePartner(World.pipes.find((p) => p.id === q.id)); g.position.set(q.x, q.y, q.z); g.rotation.y = (q.r | 0) * Math.PI / 2; G.add(g);
      const c = on ? "#3fb34f" : "#7d9482", body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 20, 1, true).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide })); body.position.y = R; body.castShadow = true; g.add(body);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.28, 8, 24), mat(on ? "#56d066" : "#90a895")); rim.position.set(0, R, L / 2); g.add(rim);
      const back = new THREE.Mesh(new THREE.CircleGeometry(R, 20), new THREE.MeshBasicMaterial({ color: "#10241a" })); back.position.set(0, R, -L / 2 + 0.05); g.add(back);
    }
    else if (q.k === "tree") { const g = new THREE.Group(); g.position.set(q.x, q.y, q.z); g.rotation.y = (q.r | 0) * Math.PI / 2; G.add(g); const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 2.2, 7), mat("#8a5a34")); tr.position.y = 1.1; tr.castShadow = true; g.add(tr); const lf = new THREE.Mesh(new THREE.ConeGeometry(1.9, 4.6, 8), mat("#3fa650")); lf.position.y = 4.2; lf.castShadow = true; g.add(lf); tr.userData.pid = lf.userData.pid = q.id; }
    else if (q.k === "boost") { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2), BOOST_M); m.position.set(q.x, q.y + 0.09, q.z); m.rotation.y = (q.r | 0) * Math.PI / 2 + Math.PI; m.receiveShadow = true; m.userData.pid = q.id; G.add(m); }
    else if (q.k === "start") { const t = START_T.clone(); t.needsUpdate = true; t.repeat.set(World.START_W / 2, 1); const m = new THREE.Mesh(new THREE.PlaneGeometry(World.START_W, World.START_D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t })); m.position.set(q.x, q.y + 0.1, q.z); m.rotation.y = (q.r | 0) * Math.PI / 2; m.userData.pid = q.id; G.add(m); }
    else if (q.k === "podium") { let n = World.PODIUM.spots.findIndex((p) => p.id === q.id); if (!live && n < 0) n = Math.min(2, World.PODIUM.spots.length); if (n >= 0) { const h = [1.6, 1.1, 0.7][n]; box(4.4, h, 4.4, POD_C[n], q.x, q.y + h / 2, q.z, G).userData.pid = q.id; } }
    else if (q.k === "spawn") { const g = new THREE.Group(); g.position.set(q.x, q.y + 0.08, q.z); g.rotation.y = q.a !== undefined ? (q.a * Math.PI) / 180 : (q.r | 0) * Math.PI / 2; G.add(g); if (live) { G.visible = !!bm; spawnG = G; }   /* (owner, 2026-11-13) only builders see it */ const sm = new THREE.MeshBasicMaterial({ color: "#7ef0c8", transparent: true, opacity: 0.85 });
      g.add(new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 24).rotateX(-Math.PI / 2), sm)); const ar = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 3).rotateX(Math.PI / 2), sm); ar.position.set(0, 0.05, 1.4); ar.scale.y = 0.15; g.add(ar); }   // which way couriers face
  G.traverse((o) => { o.userData.pid = q.id; });
  return G;
}
// (owner, 2026-11-13) shift-click two pipes, then Link joins them into a shortcut (Unlink parts two already joined)
function pipePick(px, py) {
  buildAim(px, py); const q = aimed(); if (!q || q.k !== "pipe") return; const L = bm.psel || []; bm.psel = L.includes(q.id) ? L.filter((id) => id !== q.id) : [...L, q.id].slice(-2); sfx("tick"); pipeSel();
}
function pipeSel() {
  if (bm && bm.pselG) { scene.remove(bm.pselG); bm.pselG = null; } const P = $("pprompt"); P.style.display = "none"; if (!bm || !bm.psel) return;
  bm.psel = bm.psel.filter((id) => World.build.some((q) => q.id === id && q.k === "pipe")); bm.pselG = new THREE.Group(); scene.add(bm.pselG);
  for (const id of bm.psel) bm.pselG.add(hologram(World.build.find((q) => q.id === id)));
  if (bm.psel.length < 2) return; const [a, b] = bm.psel, A = World.build.find((q) => q.id === a), joined = A.to === b && World.build.find((q) => q.id === b).to === a;
  P.innerHTML = ""; P.appendChild(btn(joined ? "Unlink" : "Link", () => { netSend(joined ? { t: "build", op: "unlink", a } : { t: "build", op: "link", a, b }); sfx("pad"); bm.psel = []; pipeSel(); }, "go")); P.appendChild(ibtn("close", "Close", () => { bm.psel = []; pipeSel(); }, "bt")); P.style.display = "flex";
}
let spawnG = null; const buildOnly = [], fans = [], moverMeshes = [];   // (owner, 2026-11-13) what only builders see; turbines' fans; moving platforms
const hazSel = () => (bm && bm.hsel && World.build.find((q) => q.id === bm.hsel && (q.k === "gust" || q.k === "mover"))) || null;
function drawHazSel() { if (bm && bm.hselG) { scene.remove(bm.hselG); bm.hselG = null; } const q = hazSel(); if (!q) return; const [w, h, d, x, y, z] = pieceBox(q); const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.2, h + 0.2, d + 0.2)), new THREE.LineBasicMaterial({ color: "#ffd84a" })); e.position.set(x, y, z); bm.hselG = e; scene.add(e); }
// each frame: moving platforms where they are now, fans spinning, a gust's wind while it blows, a turbine's updraft
function stepHazards(dt) {
  const t = srvNow(), P = camera.position;
  if (gizmoG && gizmoG.parent && bm) gizmoG.scale.setScalar(clamp(P.distanceTo(gizmoG.position) / 16, 0.6, 8));   // the move arrows stay the same size on screen
  for (const m of moverMeshes) { const p = World.moverPos(m.q, t); m.g.position.set(p.x, p.y, p.z); }
  for (const f of fans) f.g.rotation.y += dt * 9;
  for (const g of World.gusts) { const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2; if (hyp(cx - P.x, cz - P.z) > 90) continue; const on = World.gustOn(g, t), n = on ? Math.min(6, (g.x1 - g.x0) * (g.z1 - g.z0) * (g.y1 - g.y0) * dt * 0.8) : 0;
    for (let k = 0; k < n || (k === 0 && Math.random() < n); k++) emit(g.x0 + Math.random() * (g.x1 - g.x0), g.y0 + 0.3 + Math.random() * (g.y1 - g.y0 - 0.3), g.z0 + Math.random() * (g.z1 - g.z0), 1, { colors: ["#ffffff", "#e3f4ff"], dir: [g.dx, 0, g.dz], speed: 6 + g.pw * 0.5, grav: 0, life: 0.5, size: 0.09, spread: 0 }); }
  for (const u of World.updrafts) { const cx = (u.x0 + u.x1) / 2, cz = (u.z0 + u.z1) / 2; if (hyp(cx - P.x, cz - P.z) > 90 || Math.random() > dt * 14) continue; emit(u.x0 + Math.random() * (u.x1 - u.x0), u.y0 + 0.3, u.z0 + Math.random() * (u.z1 - u.z0), 1, { colors: ["#ffffff", "#dfe9f2"], dir: [0, 1, 0], speed: 10, grav: 0, life: 0.9, size: 0.1, spread: 0 }); }
}
function drawBuild() {
  buildOnly.length = 0; fans.length = 0; moverMeshes.length = 0;
  if (poG) { scene.remove(poG); poG = null; }
  if (buildG) scene.remove(buildG); buildG = new THREE.Group(); scene.add(buildG);
  for (const k of Object.keys(houseMesh)) delete houseMesh[k]; for (let n = gates.length - 1; n >= 0; n--) if (gates[n].built) gates.splice(n, 1);
  const office = World.PO.on ? [...World.build].reverse().find((q) => q.k === "office") : null;
  for (const q of World.build) { if (q.k === "office" && q !== office) continue; const g = pieceMesh(q, true); if (q === office) { poG = g; scene.add(g); } else buildG.add(g); }
  if (readyMesh && poG) poG.add(readyMesh); if (nextMesh && poG) poG.add(nextMesh);
}
// the holographic boundary: see-through blue with scan lines that drift up and a fine grid
const HOLO_TEX = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d"); g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(0, 0, 64, 64); g.fillStyle = "rgba(255,255,255,1)"; g.fillRect(0, 0, 64, 3); g.fillRect(0, 30, 64, 2); g.fillStyle = "rgba(255,255,255,0.7)"; g.fillRect(0, 0, 2, 64); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
// (owner, 2026-11-14) each neighborhood's gates (and walls) their own color, never the same as the one before
const GATE_C = ["#3fa9ff", "#ff5fa8", "#ffd23f", "#46e07a", "#a970ff", "#ff8a3d", "#2fe0d6", "#ff4f4f", "#b5f23d"], gateC = (d) => GATE_C[(Math.max(1, d) - 1) % GATE_C.length];
function holoWall(w, h, c = GATE_C[0]) { const t = HOLO_TEX.clone(); t.needsUpdate = true; t.repeat.set(w / 2, h / 2); return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, color: c, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); }
function stepGates(t) { const open = World.openFor(save); for (const q of gates) { q.g.visible = q.d >= open || q.d === gateHold || !!bm; if (q.g.visible) { q.w.material.opacity = 0.62 + Math.sin(t * 2 + q.d) * 0.1; q.w.material.map.offset.y = -t * 0.25; if (q.L) q.L.rotation.y = Math.sin(t * 0.8 + q.d) * 0.4; } } }
// (owner, 2026-11-11) a newly opened area gets a short showing: letterbox bars, the camera flies to its gate as it
// bursts open, then to its chasers (the rarest one), then to its other dangers. A tap or a key skips it. Your mount stays put.
let cine = null, gateHold = -1, lastOpen = 0, lastOpenFor = "", zoneCalm = 0;
// (owner, 2026-11-13) the showing flies to the zone's gate (if one's been placed) as it opens
function zoneShow(d) {
  const G = World.gates.find((q) => q.d === d), gx = G ? G.x : me.x, gy = G ? G.y : me.y, gz = G ? G.z : me.z, nx = G ? G.s : 1, nz = G ? G.c : 0, wx = G ? G.c : 0, wz = G ? -G.s : 1;
  return [{ dur: 2.6, cam: (u) => ({ x: gx - nx * (20 - 8 * u) + wx * 6, y: gy + 10 - 3 * u, z: gz - nz * (20 - 8 * u) + wz * 6 }), look: () => ({ x: gx, y: gy + 2, z: gz }), title: World.zoneName(d).toUpperCase(), sub: "OPEN!", at: 1.0,
    fx: () => { gateHold = -1; sfx("unlock"); flash("#ffffff"); cam.shake = 0.5; for (let k = 0; k < 60; k++) { const u = (Math.random() - 0.5) * World.GATE_W; emit(gx + wx * u, gy + 1 + Math.random() * 6, gz + wz * u, 1, { colors: ["#9aa8ff", "#ffffff", "#ffd84a"], speed: 6, up: 4, life: 1.2, size: 0.3 }); } } },
    // (owner, 2026-11-13) then each of the neighborhood's shots the builder set: the camera circles its point, its name up
    ...World.zoneCfg(d).shots.map((q, k) => shotView(q, d, k * 2.1 + Math.atan2(q.x - gx, q.z - gz)))];
}
// one shot: the camera circles its point, its name up
const shotView = (q, d, a0) => ({ dur: 4.2, cam: (u) => { const a = a0 + u * 2.2; return { x: q.x + Math.sin(a) * 15, y: q.y + 8 - 2 * u, z: q.z + Math.cos(a) * 15 }; }, look: () => ({ x: q.x, y: q.y + 1, z: q.z }), title: (q.name || World.zoneName(d)).toUpperCase(), sub: q.name ? World.zoneName(d) : "" });
function playShot(q, d) { cine = { shots: [shotView(q, d, Math.atan2(q.x - camera.position.x, q.z - camera.position.z) + Math.PI)], i: 0, t: 0 }; $("cine").classList.add("on"); document.body.classList.add("cinema"); keys.clear(); }   // (owner, 2026-11-13) the builder's ▶
function playZones(ds) { if (!ds.length) return; const shots = ds.flatMap(zoneShow); gateHold = ds[0]; cine = { shots, i: 0, t: 0 }; $("cine").classList.add("on"); document.body.classList.add("cinema"); keys.clear(); }
function endCine() { cine = null; gateHold = -1; $("cine").classList.remove("on"); document.body.classList.remove("cinema"); cam.d = undefined; }
function stepCine(dt) {
  const c = cine, S = c.shots[c.i]; if (!S) { endCine(); return false; }
  if (c.t === 0) { if (S.title) setTimeout(() => banner(S.title, "#ffffff", S.sub || ""), 120); if (S.subC) setTimeout(() => { $("banner").lastChild.style.color = S.subC; }, 140); }
  const was = c.t; c.t += dt; if (S.fx && was < S.at && c.t >= S.at) S.fx();
  const u = Math.min(1, c.t / S.dur), e = u * u * (3 - 2 * u), P = S.cam(e), L = S.look();
  camPos.set(P.x, P.y, P.z); if (cam.shake > 0) { cam.shake = Math.max(0, cam.shake - dt * 1.6); camPos.x += (Math.random() - 0.5) * cam.shake * 0.6; camPos.y += (Math.random() - 0.5) * cam.shake * 0.6; }
  camera.position.copy(camPos); camera.lookAt(L.x, L.y, L.z); sun.position.set(L.x + 60, L.y + 110, L.z + 40); sun.target.position.set(L.x, L.y, L.z);
  if (c.t >= S.dur) { c.i++; c.t = 0; if (c.i >= c.shots.length) endCine(); }
  return true;
}
function watchZones() {   // a new area opened (not on logging in): show it
  const o = World.openFor(save); if (lastOpenFor !== myName) { lastOpenFor = myName; lastOpen = o; return; }
  // (owner, 2026-11-12) only once every parcel's been opened and every window is closed (the reward screen, a new mount,
  // a merge, the menus), and it's stayed that way for a moment
  const t = performance.now(); if (cine || reveal || opening || merging || save.gifts.length || hatchQ.length || panel || $("hatch").style.display === "flex") { zoneCalm = t; return; }
  if (o > lastOpen && t - zoneCalm > 1200) { const ds = []; for (let d = lastOpen; d < o; d++) ds.push(d); lastOpen = o; playZones(ds); }
}
addEventListener("pointerdown", () => { if (cine && (cine.i > 0 || cine.t > 0.8)) endCine(); });
addEventListener("keydown", (e) => { if (cine && (e.code === "Escape" || e.code === "Space" || e.code === "Enter")) endCine(); });
// (owner, 2026-11-11) a stolen parcel's time to get it back, over the goose; a dropped one's, over the parcel
const timerTags = new Map();   // pid -> { s: sprite, n: the number shown }
function stepTimers() {
  const tn = performance.now() / 1000, want = new Map();
  for (const q of stolen) { const g = gooseMesh[q.goose]; if (g) want.set(q.pid, { x: g.x, y: g.y + 2.4, z: g.z, left: q.endAt - tn }); }
  for (const q of dropped) want.set(q.pid, { x: q.x, y: q.y + 2.2, z: q.z, left: q.endAt - tn });
  for (const [pid, o] of timerTags) if (!want.has(pid)) { scene.remove(o.s); o.s.material.map.dispose(); o.s.material.dispose(); timerTags.delete(pid); }
  for (const [pid, w] of want) { const n = Math.max(0, Math.ceil(w.left)); let o = timerTags.get(pid);
    if (!o || o.n !== n) { if (o) { scene.remove(o.s); o.s.material.map.dispose(); o.s.material.dispose(); } const sp = textSprite(String(n), { size: 56, color: "#ffffff", bg: n <= 5 ? "#e5534b" : "#23303b" }); sp.scale.multiplyScalar(0.9); scene.add(sp); o = { s: sp, n }; timerTags.set(pid, o); }
    o.s.position.set(w.x, w.y, w.z); }
}
let windOn = false;

// ---- every frame ----
let last = performance.now();
// (owner, 2026-11-12) the far zones' scenery, sky and air: each its own place
const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
function mesh(geo, material, x, y, z, parent) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || scene).add(m); return m; }
const volcanoes = [];
function buildProps() {
  for (const P of World.props) {
    const g = new THREE.Group(); g.position.set(P.x, P.y, P.z); g.scale.setScalar(P.k === "pyramid" || P.k === "volcano" || P.k === "crater" ? 1 : P.s); g.rotation.y = (P.x * 7.3 + P.z * 3.1) % TAU; scene.add(g);
    if (P.k === "spike") { for (const [dx, dz, h] of [[0, 0, 3], [0.7, 0.3, 1.8], [-0.5, 0.6, 1.4]]) { const m = mesh(new THREE.ConeGeometry(0.45, h, 5), mat("#bfe9ff"), dx, h / 2, dz, g); m.rotation.z = dx * 0.2; } }
    else if (P.k === "snowman") { mesh(new THREE.SphereGeometry(0.7, 12, 10), mat("#ffffff"), 0, 0.65, 0, g); mesh(new THREE.SphereGeometry(0.5, 12, 10), mat("#ffffff"), 0, 1.65, 0, g); mesh(new THREE.SphereGeometry(0.36, 12, 10), mat("#ffffff"), 0, 2.4, 0, g); const n = mesh(new THREE.ConeGeometry(0.08, 0.4, 6), mat("#f08a24"), 0, 2.4, 0.42, g); n.rotation.x = Math.PI / 2; for (const x of [-0.13, 0.13]) box(0.07, 0.07, 0.05, "#1d232a", x, 2.5, 0.33, g, false); box(0.9, 0.16, 0.16, "#c8401e", 0, 2.05, 0, g); }
    else if (P.k === "pine") { box(0.4, 2, 0.4, "#6b4a2e", 0, 1, 0, g); mesh(new THREE.ConeGeometry(1.8, 3.6, 8), mat("#2f6a4a"), 0, 3.4, 0, g); mesh(new THREE.ConeGeometry(1.2, 2.6, 8), mat("#2f6a4a"), 0, 5.2, 0, g); mesh(new THREE.ConeGeometry(0.75, 1.3, 8), mat("#ffffff"), 0, 6.2, 0, g); mesh(new THREE.ConeGeometry(1.85, 0.9, 8), mat("#ffffff"), 0, 4.95, 0, g); }
    else if (P.k === "cactus") { box(0.6, 3.4, 0.6, "#4f9a5a", 0, 1.7, 0, g); box(0.4, 1.2, 0.4, "#4f9a5a", 0.6, 1.9, 0, g); box(0.5, 0.4, 0.4, "#4f9a5a", 0.4, 1.4, 0, g); box(0.4, 1, 0.4, "#4f9a5a", -0.6, 2.4, 0, g); box(0.5, 0.4, 0.4, "#4f9a5a", -0.4, 2, 0, g); box(0.25, 0.25, 0.25, "#ff8fd9", 0, 3.5, 0, g); }
    else if (P.k === "palm") { const tr = mesh(new THREE.CylinderGeometry(0.22, 0.32, 5.5, 7), mat("#9a7448"), 0.4, 2.7, 0, g); tr.rotation.z = -0.15; for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, l = box(2.6, 0.1, 0.7, "#3f9a4a", 0.8 + Math.cos(a) * 1.1, 5.4, Math.sin(a) * 1.1, g); l.rotation.y = -a; l.rotation.z = -0.35; } }
    else if (P.k === "pyramid") { const m = mesh(new THREE.ConeGeometry(P.s, P.s * 0.95, 4), mat("#e2c07a"), 0, P.s * 0.47, 0, g); m.rotation.y = Math.PI / 4; }
    else if (P.k === "temple") { box(4, 2.6, 4, "#9a9488", 0, 4.2 + 1.3, 0, g); box(1.4, 1.8, 0.2, "#2a2f2a", 0, 4.2 + 0.9, 2.02, g, false); for (const [x, z] of [[-2, 2], [2, 2], [-2, -2], [2, -2]]) box(0.5, 3.2, 0.5, "#b9b2a2", x, 4.2 + 1.6, z, g); box(4.6, 0.4, 4.6, "#3f8a4a", 0, 4.2 + 2.8, 0, g); }
    else if (P.k === "pillar") { const h = P.s < 0.9 ? 2.2 : 4.2; mesh(new THREE.CylinderGeometry(0.5, 0.55, h, 8), mat("#b9b2a2"), 0, h / 2, 0, g); box(1.3, 0.35, 1.3, "#a9a294", 0, h + 0.17, 0, g); box(1.35, 0.15, 1.35, "#3f8a4a", 0, h + 0.4, 0, g); }
    else if (P.k === "spire") { mesh(new THREE.ConeGeometry(1, 5, 6), mat("#3a3436"), 0, 2.5, 0, g); mesh(new THREE.ConeGeometry(0.6, 2.6, 6), mat("#2a2426"), 0.7, 1.3, 0.4, g); box(0.12, 1.6, 0.12, "#ff6a1f", 0.55, 1.4, 0.75, g, false).material = glow("#ff6a1f"); }
    else if (P.k === "volcano") { mesh(new THREE.CylinderGeometry(P.s * 0.14, P.s, P.s * 0.8, 12), mat("#4a3a36"), 0, P.s * 0.4, 0, g); const top = new THREE.Mesh(new THREE.CircleGeometry(P.s * 0.13, 14).rotateX(-Math.PI / 2), glow("#ff5a1f")); top.position.y = P.s * 0.8 + 0.1; g.add(top); for (let k = 0; k < 5; k++) { const a = k * 1.3, st = box(1.6, P.s * 0.5, 1, "#ff5a1f", Math.cos(a) * P.s * 0.4, P.s * 0.42, Math.sin(a) * P.s * 0.4, g, false); st.material = glow("#ff6a1f"); st.lookAt(g.position.x, P.s, g.position.z); } volcanoes.push({ x: P.x, y: P.s * 0.8, z: P.z, s: P.s }); }
    else if (P.k === "crater") { const rim = mesh(new THREE.TorusGeometry(P.s, 0.45, 6, 28).rotateX(Math.PI / 2), mat("#d9d6e8"), 0, 0.45, 0, g); rim.castShadow = false; }
    else if (P.k === "crystal") { const c = (P.x | 0) % 2 ? "#9fe0ff" : "#c9a6ff"; for (const [dx, dz, h, tilt] of [[0, 0, 2.2, 0], [0.6, 0.2, 1.4, 0.4], [-0.5, 0.4, 1.1, -0.5]]) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), glow(c)); m.scale.set(1, h, 1); m.position.set(dx, h * 0.45, dz); m.rotation.z = tilt; g.add(m); } }
    else if (P.k === "shroom") { mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 7), mat("#f4f1ea"), 0, 0.6, 0, g); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8, 0, TAU, 0, Math.PI / 2), glow((P.z | 0) % 2 ? "#ff8fd9" : "#7ef0c8")); cap.position.y = 1.15; g.add(cap); }
  }
  // the Moon Garden's stars
  const n = 500, pos = new Float32Array(n * 3); for (let k = 0; k < n; k++) { const a = Math.random() * TAU, e = 0.15 + Math.random() * 1.2, r = 700; pos[k * 3] = World.farX(9) + 50 + Math.cos(a) * Math.cos(e) * r; pos[k * 3 + 1] = Math.sin(e) * r; pos[k * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#ffffff", size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 })); scene.add(stars);
}
let stars = null;
const SKY = { 5: ["#cfe6f5", "#eef6fb"], 6: ["#f2c98a", "#f6dcae"], 7: ["#8fc7a0", "#b9dcc0"], 8: ["#5a2e28", "#7a3a2a"], 9: ["#141a3a", "#2a2f5a"] }, SKY0 = ["#9cc7e6", "#bcd9ec"], skyC = [new THREE.Color(SKY0[0]), new THREE.Color(SKY0[1])], tmpC = new THREE.Color();
function stepAir(dt) {
  const z = World.districtAt(me.x, me.z, me.y), S = SKY[z] || SKY0, k = Math.min(1, dt * 1.5);
  scene.background.lerp(tmpC.set(S[0]), k); scene.fog.color.lerp(tmpC.set(S[1]), k);
  if (stars) stars.material.opacity += ((z === 9 ? 1 : 0) - stars.material.opacity) * k;
  // (owner, 2026-11-13) the zones' own air (snow, sand, fireflies, embers, motes) went with the hand-built town
}
function frame(tms) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.08, (tms - last) / 1000); last = tms; const t = tms / 1000;
  if (hitStop > 0) { hitStop -= dt; renderer.render(scene, camera); return; }   // a landed kick holds the picture for a beat
  if (loggedIn) {
    stepMe(dt);
    if (bm && (bm.tool === "spawn" || bm.tool === "gust") && keys.has("KeyR")) { const s = hazSel(); if (s && s.k === "gust") { bm.hdraft = { ...(bm.hdraft || s), a: Math.round(((bm.hdraft || s).a + 120 * dt) % 360) }; } else { bm.a = (bm.a + 120 * dt) % 360; buildAim(bm.px, bm.py); } }
    else if (bm && bm.hdraft) { const s = hazSel(); if (s) doSet(s, bm.hdraft); bm.hdraft = null; }   // a selected gust turned with R: sent when R comes up
    stepHazards(dt);
    if (me.kickT > 0) me.kickT -= dt; if (me.squash > 0) me.squash -= dt; if (me.hop > 0) me.hop -= dt;
    if (me.stun > 0 && Math.random() < 0.35) emit(me.x, me.y + 2.2, me.z, 1, { colors: ["#ffd84a"], speed: 1.5, up: 0.5, life: 0.5, grav: 0, size: 0.16 });
    if (me.grace > 0) { me.grace -= dt; if (Math.random() < 0.5) emit(me.x, me.y + 1.2, me.z, 1, { colors: ["#ffffff", "#bfe6ff"], speed: 1.2, up: 1, life: 0.5, grav: -1, size: 0.1, spread: 1.6 }); }
    if (mine) pose(mine, { x: me.x, y: me.y, z: me.z, yaw: me.yaw, moving: me.moving, foot: me.foot, air: !me.ground, stun: me.stun, mx: me.mx, my: me.my, mz: me.mz, myaw: me.myaw, kickT: me.kickT, hidden: me.hidden, squash: me.squash, hop: me.hop, glide: me.glide }, dt, t, myStats().speed);
    if (tms - lastSent > 66) sendPos();
  }
  if (loggedIn) stepAir(dt); stepOthers(dt, t); stepNpcs(dt, t); stepPods(dt, t); stepParts(dt); stepMarks(dt); blobStep(); stepCamera(dt);
  renderer.render(scene, camera);
  if (loggedIn) { hud(dt); stepGifts(dt); stepReveal(dt); maybeOpenRun(); } stepPops(dt);
}
buildTown(); buildProps(); buildAnimals(); buildGates(); beltShow(); stepCamera(0.016);
// for the tests and the console
window.Pets = { World, me, cam, others, show: { playZones, levelFx, hatchShow, startReveal, auraPop, get cine() { return cine; } }, get save() { return save; }, get parcel() { return bag[0] || null; }, get bag() { return bag; }, get cap() { return cap; }, get belt() { return belt; }, get stolen() { return stolen; }, get dropped() { return dropped; }, get loggedIn() { return loggedIn; }, get role() { return myRole; }, THREE, camera, get panel() { return panel; }, dogMesh, gooseMesh, goatMesh, get arrow() { return wayArrow; }, readyAt, onNet, teleport(x, z, y = 0) { me.x = x; me.z = z; me.y = y; me.vx = me.vz = me.vy = 0; me.transit = null; me.ground = false; sendPos(true); }, netSend, openPanel };
$("lgo").disabled = $("lnew").disabled = true;
connect(); requestAnimationFrame(frame);
