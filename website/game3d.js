// Atamus 3D (owner, 2026-10-12): the game rebuilt in 3D. One flat world with a 2D
// grid; the border is the same flat-top hexagon, 5 miles flat to flat. Each player is
// a 100 m sphere (yours blue, others red) that travels on the ground plane only — no
// up or down. WASD moves it; wherever the camera faces is forward. The middle mouse
// (touch: a one-finger drag) rotates the camera around the player; it sits at a 75°
// angle looking down toward the player. Each player is sent everything within their load circle.
import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { initBuild, builds, pushFromPoly, segPoly } from "./build3d.js?v=1791957761";

// (owner) returning players come through the log-in page first (live site only)
if (typeof needLogin === "function" && needLogin()) location.replace("login.html");

const statusEl = document.getElementById("status");
const countEl = document.getElementById("countdown");
const WEB_BUILD = (document.querySelector('meta[name="atamus-build"]') || {}).content || "";

// ---- world constants (the server's hello can override them) ----
let HEX_FLAT = 2_500;                          // 2.5 km flat to flat for now (owner; the server sends it in the hello)
let SPHERE_R = 50;                             // 100 m diameter
let SPEED = 200;                               // m/s (owner, 2026-10-13; the server sends it in the hello)
let ACCEL = 200, BRAKE = 400, TURN_ACCEL = 0.3;   // (owner) weight: as on the server (world3d.js)
let SIDE_SPEED = 0.6, FWD_ARC = Math.PI / 4;   // (owner) forward 100%, sideways / backward 60% (blended); sprint only within FWD_ARC of the nose
const dirSpeed = (d) => SIDE_SPEED + (1 - SIDE_SPEED) * Math.max(0, Math.cos(d));
let STOP_D = 100, brakeA = 0, SPRINT = 1.3;   // SPRINT: (owner) sprint is 30% faster                  // (owner) a stop always ends within STOP_D: the rate is fixed when WASD is let go (as on the server)
const stopRate = (v) => brakeA || Math.max(BRAKE, (v * v) / (2 * STOP_D));
// (owner, 2026-10-13: reversing while moving was far slower than stopping and then going) one step of the velocity
// toward the target (tx, ty): the part of the change that SLOWS the current motion (against the velocity) brakes at
// up to `brake`; the rest (the new direction) thrusts at up to `a`. Reversing then works like letting go and pushing.
let VEL_TURN = 8;                               // (owner) as on the server (world3d.js)
// (owner, 2026-10-13: "keep momentum in the new direction with a quick rotation") while WASD is held the velocity keeps
// its speed and swings toward the input's direction at VEL_TURN (the nose's own turn rate), instead of braking the old
// motion and building up again. Its speed meanwhile eases toward the target: up at `up`, down at `down`. From rest it
// starts straight along the input. A near-reversal (over 150 degrees) swings round the side the nose is turning to
// (`nose`: the ship's heading, same convention), so the ship and its motion turn together.
function carry(vx, vy, dx, dy, target, up, down, dt, nose) {
  let v = Math.hypot(vx, vy);
  const want = Math.atan2(dx, -dy), T2 = Math.PI * 2, wrap = (q) => { q %= T2; return q > Math.PI ? q - T2 : q < -Math.PI ? q + T2 : q; };
  let va = v > 1 ? Math.atan2(vx, -vy) : want;
  const d = wrap(want - va);
  let sign = Math.sign(d), left = Math.abs(d);
  if (left > Math.PI * 5 / 6 && Number.isFinite(nose)) { const s = wrap(nose - va); if (Math.abs(s) > 1e-3 && Math.sign(s) !== sign) { sign = Math.sign(s); left = T2 - left; } }
  va += sign * Math.min(left, VEL_TURN * dt);
  v = v < target ? Math.min(target, v + up * dt) : Math.max(target, v - down * dt);
  return [Math.sin(va) * v, -Math.cos(va) * v];
}
function steer(vx, vy, tx, ty, a, brake, dt) {
  let ex = tx - vx, ey = ty - vy;
  const v = Math.hypot(vx, vy);
  if (v > 1e-6) {
    const ux = vx / v, uy = vy / v, par = ex * ux + ey * uy;
    if (par < 0) {                             // slowing down along the current motion
      const bx = ux * par, by = uy * par, px = ex - bx, py = ey - by;
      const bl = -par, bs = Math.max(a, brake) * dt, pl = Math.hypot(px, py), ps = a * dt;
      const kb = bl > bs ? bs / bl : 1, kp = pl > ps ? ps / pl : 1;
      return [vx + bx * kb + px * kp, vy + by * kb + py * kp];
    }
  }
  const el = Math.hypot(ex, ey), s = a * dt;
  if (el > s) { ex *= s / el; ey *= s / el; }
  return [vx + ex, vy + ey];
}
// (owner, 2026-10-13) colliders, on the ground plane only (x / y; height is ignored): each ship is a circle of SHIP_R,
// each block a square BLOCK_HALF from its center. A ship overlapping one is pushed out along the shortest way, and the
// part of its velocity going into it is dropped (it slides along). Mirrored in the client's prediction.
let SHIP_R = 45, BLOCK_HALF = 25;   // (the server sends both in the hello)
function pushOut(p, cx, cy, minD) {           // p: {x, y, vx, vy}; push p's center to at least minD from (cx, cy)
  let nx = p.x - cx, ny = p.y - cy, d = Math.hypot(nx, ny);
  if (d >= minD) return false;
  if (d < 1e-6) { nx = 1; ny = 0; } else { nx /= d; ny /= d; }
  p.x = cx + nx * minD; p.y = cy + ny * minD;
  const vn = (p.vx || 0) * nx + (p.vy || 0) * ny; if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; }
  return true;
}
function pushFromBlock(p, b) {                 // a ship's circle out of an axis-aligned square
  const qx = Math.max(b.x - BLOCK_HALF, Math.min(b.x + BLOCK_HALF, p.x)), qy = Math.max(b.y - BLOCK_HALF, Math.min(b.y + BLOCK_HALF, p.y));
  if (qx === p.x && qy === p.y) {              // the center is inside the square: out through the nearest side
    const dl = p.x - (b.x - BLOCK_HALF), dr = b.x + BLOCK_HALF - p.x, dd = p.y - (b.y - BLOCK_HALF), du = b.y + BLOCK_HALF - p.y, m = Math.min(dl, dr, dd, du);
    const nx = m === dl ? -1 : m === dr ? 1 : 0, ny = m === dd ? -1 : m === du ? 1 : 0;
    if (nx) p.x = b.x + nx * (BLOCK_HALF + SHIP_R); else p.y = b.y + ny * (BLOCK_HALF + SHIP_R);
    const vn = (p.vx || 0) * nx + (p.vy || 0) * ny; if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; }
    return true;
  }
  return pushOut(p, qx, qy, SHIP_R);
}
const accelShare = (d) => TURN_ACCEL + (1 - TURN_ACCEL) * ((1 + Math.cos(d)) / 2) ** 2;
const vel = { x: 0, y: 0 };                    // my ship's velocity, predicted the same way the server integrates it
// (owner, 2026-10-13) the capacitor: predicted like the server's, corrected by its 4 Hz private updates
let CAPC = { max: 100, drain: 1,   // drain: per 100 m sprinted (owner)
  walk: 4, idle: 12, resume: 15 }, cap = 100, capOut = false;
const SQ3 = Math.sqrt(3);
const inside = (x, y, m = SPHERE_R) => { const a = HEX_FLAT / 2 - m; return Math.abs(y) <= a && Math.abs(SQ3 * x + y) <= 2 * a && Math.abs(SQ3 * x - y) <= 2 * a; };

// Game plane: x east, y north. Three: x = x, z = -y, y (three) = up.
const toWorld = (x, y, h = 0) => new THREE.Vector3(x, h, -y);

// ---- scene ----
const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x18181e);   // (owner, 2026-10-13) dark charcoal, from the owner's reference
scene.fog = new THREE.Fog(0x18181e, 3000, 14000);
scene.add(new THREE.HemisphereLight(0x8fa7c8, 0x10141c, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(3000, 5000, 2000); scene.add(sun);

const camera = new THREE.PerspectiveCamera(60, 1, 5, 30000);
let camYaw = 0;                                // around the player
// camera settings: pitch, min / max zoom, rotation speed
// (owner, 2026-10-13) the wheel zooms in from 600 m down to 200 m (never out past 600); starting to aim eases the
// zoom back to 600 m (owner: not a snap), and the wheel does nothing while aiming
const cam = { pitch: 60, zmin: 200, zmax: 600, rot: 0.6, leash: 700, over: 100,
  dir: { n: 200, ne: 0, e: 200, se: 0, s: 200, sw: 0, w: 200, nw: 0 } };   // (owner) leash: the reticle's max distance (the blue circle);
// over: the base overflow; dir: the per-direction overflow delta (m). Fixed values (the sliders are gone).
let camDist = cam.zmax;

// ground with the 2D grid drawn in its own shader: anti-aliased 100 m lines on the surface itself,
// so nothing z-fights or shimmers the way a second layer of rendered lines did
const groundMat = new THREE.ShaderMaterial({
  uniforms: {
    base: { value: new THREE.Color(0x18181e) }, gline: { value: new THREE.Color(0x46464c) },   // (owner) charcoal ground, soft gray lines
    fogColor: { value: new THREE.Color(0x18181e) }, fogNear: { value: 3000 }, fogFar: { value: 14000 },
  },
  vertexShader: `varying vec3 vW; varying float vD;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec3 vW; varying float vD;
    uniform vec3 base, gline, fogColor; uniform float fogNear, fogFar;
    void main() {
      vec2 c = vW.xz / 100.0;
      vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
      float l = 1.0 - min(min(g.x, g.y), 1.0);
      vec3 col = mix(base, gline, l * 0.85);
      col = mix(col, fogColor, smoothstep(fogNear, fogFar, vD));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(140000, 140000), groundMat);
ground.rotation.x = -Math.PI / 2; scene.add(ground);

// the hexagon border: a flat glowing band on the ground (flat edges top and bottom, points east and west)
function hexShapeBand() {
  const pts = (r) => { const a = r / Math.cos(Math.PI / 6); const out = []; for (let i = 0; i < 6; i++) { const t = (Math.PI / 3) * i; out.push(new THREE.Vector2(Math.cos(t) * a, Math.sin(t) * a)); } return out; };
  const shape = new THREE.Shape(pts(HEX_FLAT / 2));
  shape.holes.push(new THREE.Path(pts(HEX_FLAT / 2 - 25).reverse()));
  const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4f8fe8, transparent: true, opacity: 0.9, depthWrite: false }));   // (no depth: the haze always draws over it)
}
let border = hexShapeBand(); border.position.y = 0.3; scene.add(border);
function rebuildBorder() { scene.remove(border); border.geometry.dispose(); border = hexShapeBand(); border.position.y = 0.3; scene.add(border); }   // when the hello changes the size

// (owner, 2026-10-13) the load circle: the server sends only the players (and later objects) within LOAD_R of
// this ship. Drawn for now, a thin ring around the ship.
let LOAD_R = 5000;
const loadRing = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x6f8fb8, transparent: true, opacity: 0.6 }));
function loadRingFor(R) {
  const pts = []; for (let i = 0; i < 360; i++) { const t = (i / 360) * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(t) * R, 0, Math.cos(t) * R)); }
  loadRing.geometry.setFromPoints(pts);
}
loadRingFor(LOAD_R); loadRing.frustumCulled = false; loadRing.visible = false; scene.add(loadRing);
// (owner) the camera leash circle around the player: everywhere the reticle can be aimed (blue)
const rangeRing = new THREE.Mesh(new THREE.RingGeometry(cam.leash - 4, cam.leash, 160), new THREE.MeshBasicMaterial({ color: 0x4f8fe8, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
rangeRing.rotation.x = -Math.PI / 2; rangeRing.visible = false; scene.add(rangeRing);
const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
// (owner, 2026-10-13) right-click: a dashed white line from the ship's center on the ground plane to the reticle,
// fading out over its last stretch (owner: no dot at the end). Three points: full from the ship to AIM_FADE of the
// way, then fading to nothing at the reticle (per-vertex alpha).
// (owner, 2026-10-13) aimed at something with a block or a ship in the way: white to where it would hit, red past it
const AIM_FADE = 0.6;
const aimLineGeo = new THREE.BufferGeometry();
aimLineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
aimLineGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(16), 4));
const aimLineMat = new THREE.LineDashedMaterial({ color: 0xffffff, vertexColors: true, transparent: true, dashSize: 12, gapSize: 8, depthWrite: false });
const aimLine = new THREE.Line(aimLineGeo, aimLineMat); aimLine.frustumCulled = false;
// (owner, 2026-10-13) the weapon UI helpers toggle (top right): the leash circle for now; off by default, kept per browser
let helpers = false;
try { helpers = localStorage.getItem("atamus.helpers") === "1"; } catch {}
// (owner, 2026-10-13) the stop marker: a dashed line to a circle where the ship would come to rest if the
// player let go now (its velocity at the braking rate); only this player sees it
const stopLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const stopLineMat = new THREE.LineDashedMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.8, dashSize: 10, gapSize: 8 });
const stopLine = new THREE.Line(stopLineGeo, stopLineMat); stopLine.frustumCulled = false; stopLine.visible = false; scene.add(stopLine);
const stopRing = new THREE.Mesh(new THREE.CircleGeometry(2, 24),   // (owner) a small flat filled dot (owner, 2026-10-13: "way thinner", 2 m from 5)
  new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
stopRing.rotation.x = -Math.PI / 2; stopRing.visible = false; scene.add(stopRing);
function updateStop() {
  const v = Math.hypot(vel.x, vel.y);
  const on = haveMe && v > 5;
  stopLine.visible = stopRing.visible = on; if (!on) return;
  const dist = (v * v) / (2 * stopRate(v)), sx = me.x + (vel.x / v) * dist, sy = me.y + (vel.y / v) * dist;
  stopLineGeo.setFromPoints([new THREE.Vector3(me.x, 0.7, -me.y), new THREE.Vector3(sx, 0.7, -sy)]); stopLine.computeLineDistances();
  const k = Math.max(1, viewDist / 500); stopLineMat.dashSize = 10 * k; stopLineMat.gapSize = 8 * k;
  stopRing.position.set(sx, 0.7, -sy); stopRing.scale.set(k, k, 1);
}
// the capacitor bar above the hotbar
const capFill = document.getElementById("cap-fill"), capNum = document.getElementById("cap-num");
let capShown = -1;
function drawCap() {
  if (!capFill) return; const v = Math.round(cap);
  if (v === capShown) return; capShown = v;
  capFill.style.width = (cap / CAPC.max) * 100 + "%"; capNum.textContent = v;
  capFill.classList.toggle("out", capOut);
}
aimLine.visible = false; scene.add(aimLine);
const raycaster = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), aimHit = new THREE.Vector3();

// ---- players: the ship (owner, 2026-10-12: Combat_Cruiser.glb, Y up, +Z forward) ----
// Scaled to 100 m long, resting on the grid, facing the way it travels. Until the
// model arrives, a sphere stands in and is swapped the moment it loads.
const sphereGeo = new THREE.SphereGeometry(SPHERE_R, 48, 32);
const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x4f8fe8, roughness: 0.35, metalness: 0.15 });
const players = new Map();                     // id -> { holder, heading, name, from:{x,y,ts}, to:{x,y,ts} }
let myId = null, myName = "", mySide = null;
const me = { x: 0, y: 0 };                     // my ship, predicted locally and corrected by snapshots
let haveMe = false;
let shipTemplate = null, shipMid = SPHERE_R;   // shipMid: the hull's center height, for the camera
new GLTFLoader().load("models/combat_cruiser.glb", (g) => {
  const src = g.scene;
  const box = new THREE.Box3().setFromObject(src), size = box.getSize(new THREE.Vector3());
  src.scale.setScalar(100 / Math.max(size.x, size.y, size.z));
  src.rotation.y = Math.PI;                    // (owner) the model's nose is -Z: flip it to our +Z forward
  const b2 = new THREE.Box3().setFromObject(src), c2 = b2.getCenter(new THREE.Vector3());
  src.position.x -= c2.x; src.position.z -= c2.z;   // pivot at the hull's middle, so turns don't swing it
  src.position.y -= b2.min.y;                  // the hull rests on the grid
  const wrap = new THREE.Group(); wrap.add(src);
  shipTemplate = wrap; shipMid = (b2.max.y - b2.min.y) / 2;
  for (const p of players.values()) { p.holder.clear(); p.holder.add(makeVisual(p.id !== myId)); }
  try { build.refreshShips(); } catch {}   // the Build menu's test ships
}, undefined, (e) => console.warn("[ship] load failed:", e && e.message));
function makeVisual(remote) {
  const v = shipTemplate ? shipTemplate.clone(true) : (() => { const m = new THREE.Mesh(sphereGeo, fallbackMat); m.position.y = SPHERE_R; return m; })();
  if (remote) v.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(losMat) : losMat(o.material); });
  return v;
}

// ---- (owner, 2026-10-13) line of sight: other ships are drawn only where my ship's center can see them ----
// On the ground plane (height ignored, like the colliders): each block and Build piece casts a shadow away from my
// ship's center. The shadows are drawn top-down into a texture around me every frame, and the other ships' materials
// skip every pixel that lies in shadow, so a ship half behind a wall shows only its visible half.
const VIS_S = 2700, VIS_N = 2048;              // the texture covers 2 x VIS_S m square around me (the whole 2.5 km map)
const visRT = new THREE.WebGLRenderTarget(VIS_N, VIS_N, { depthBuffer: false });
const visScene = new THREE.Scene(); visScene.background = new THREE.Color(0xffffff);
const visCam = new THREE.OrthographicCamera(-VIS_S, VIS_S, VIS_S, -VIS_S, 1, 4000); visCam.up.set(0, 0, -1);   // north up, east right
const visGeo = new THREE.BufferGeometry(); let visCap = 0;
const visMesh = new THREE.Mesh(visGeo, new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })); visMesh.frustumCulled = false; visScene.add(visMesh);
// (owner, 2026-10-14) sight fades out past the leash circle: the haze ramps from clear at FAR_IN to solid at FAR_OUT
// (400 m further), and nothing past FAR_OUT is drawn (ships, blocks, Build pieces)
const FAR_IN = cam.leash + 200, FAR_OUT = FAR_IN + 400;   // (owner, 2026-10-14) the fade starts 200 m (two grid squares) past the leash circle
const visU = { visTex: { value: visRT.texture }, visC: { value: new THREE.Vector2() }, visS: { value: VIS_S }, visFar: { value: FAR_OUT } };
const farCache = new Map();
function farMat(m) {                           // a material that isn't drawn past FAR_OUT from my ship
  if (farCache.has(m)) return farCache.get(m);
  const c = m.clone();
  c.onBeforeCompile = (sh) => {
    sh.uniforms.visC = visU.visC; sh.uniforms.visFar = visU.visFar;
    sh.vertexShader = "varying vec3 vFarW;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n  vFarW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = "uniform vec2 visC; uniform float visFar; varying vec3 vFarW;\n" + sh.fragmentShader.replace("void main() {", "void main() {\n  if (length(vec2(vFarW.x, -vFarW.z) - visC) > visFar) discard;");
  };
  c.customProgramCacheKey = () => "far";
  farCache.set(m, c); return c;
}
const losCache = new Map();
function losMat(m) {                           // a copy of a ship material that leaves out the parts in shadow
  if (losCache.has(m)) return losCache.get(m);
  const c = m.clone();
  c.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, visU);
    sh.vertexShader = "varying vec3 vVisW;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n  vVisW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = "uniform sampler2D visTex; uniform vec2 visC; uniform float visS; uniform float visFar; varying vec3 vVisW;\n" + sh.fragmentShader.replace("void main() {",
      "void main() {\n  if (length(vec2(vVisW.x, -vVisW.z) - visC) > visFar) discard;\n  vec2 vuv = vec2((vVisW.x - visC.x), (-vVisW.z - visC.y)) / (2.0 * visS) + 0.5;\n  if (vuv.x > 0.0 && vuv.y > 0.0 && vuv.x < 1.0 && vuv.y < 1.0 && texture2D(visTex, vuv).r < 0.5) discard;");
  };
  c.customProgramCacheKey = () => "los";
  losCache.set(m, c); return c;
}
// (owner, 2026-10-13) the ground I can't see is shaded: a dark see-through layer just above the grid, following my
// ship, drawn only where the shadow texture says it's out of sight
// (owner) a dusty, shifting look: two layers of value noise drifting different ways vary its darkness and tint
const shadeT = { value: 0 }, shadeHex = { value: HEX_FLAT / 2 };   // (owner) everything past the map's edge gets it too
const shadeMat = new THREE.ShaderMaterial({
  uniforms: { ...visU, uT: shadeT, hexA: shadeHex, farIn: { value: FAR_IN }, visPx: { value: 1 / VIS_N } }, transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
  // gradient noise (no grid squares), each octave turned, two layers drifting different ways; colors from near-black
  // navy through dark blue to a dusky purple (owner, 2026-10-14)
  fragmentShader: `uniform sampler2D visTex; uniform vec2 visC; uniform float visS; uniform float uT; uniform float hexA; uniform float farIn; uniform float visFar; uniform float visPx; varying vec3 vW;
    vec2 hash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0; }
    float gn(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      return mix(mix(dot(hash2(i), f), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                 mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y); }
    float fbm(vec2 p) { float v = 0.0, a = 0.55; mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
      for (int k = 0; k < 5; k++) { v += a * gn(p); p = r * p * 2.02 + 11.7; a *= 0.5; } return 0.5 + 0.5 * v; }
    float sightAt(vec2 uv) { return (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) ? texture2D(visTex, uv).r : 1.0; }
    void main() {
      vec2 g = vec2(vW.x, -vW.z), uv = (g - visC) / (2.0 * visS) + 0.5;
      float o = visPx * 1.5;                   // a small blur, so the shadow edges are smooth rather than stepped
      float lit = (sightAt(uv) * 2.0 + sightAt(uv + vec2(o, 0.0)) + sightAt(uv - vec2(o, 0.0)) + sightAt(uv + vec2(0.0, o)) + sightAt(uv - vec2(0.0, o))) / 6.0;
      float ed = max(abs(g.y), max(abs(1.7320508 * g.x + g.y), abs(1.7320508 * g.x - g.y)) * 0.5) - hexA;   // past the hexagon's edge
      lit = min(lit, 1.0 - smoothstep(0.0, 30.0, ed));
      float far = smoothstep(farIn, visFar, length(g - visC));   // (owner) clear at the leash circle, solid 400 m past it
      if (lit > 0.99 && far <= 0.0) discard;
      float a = fbm(g / 300.0 + vec2(uT * 0.018, uT * 0.011)), b = fbm(g / 120.0 - vec2(uT * 0.027, -uT * 0.016));
      float d = clamp(mix(a, b, 0.4) * 1.5 - 0.25, 0.0, 1.0);    // stretched, so the light and dark patches read clearly
      float hue = smoothstep(0.35, 0.7, fbm(g / 520.0 + vec2(-uT * 0.009, uT * 0.006) + 40.0));
      vec3 deep = vec3(0.008, 0.012, 0.035), blue = vec3(0.05, 0.09, 0.24), purple = vec3(0.17, 0.07, 0.24);
      vec3 col = mix(deep, mix(blue, purple, hue), smoothstep(0.15, 0.95, d));
      gl_FragColor = vec4(col, mix((0.28 + 0.5 * d) * (1.0 - lit), 1.0, far));
    }`,
});
const shade = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), shadeMat);
shade.position.y = 1; shade.renderOrder = 2; shade.frustumCulled = false; scene.add(shade);
function updateVis() {                         // the shadows from where my ship is now
  const vx = me.x, vy = me.y, F = VIS_S * 4, pos = [];
  const edges = (v) => {                       // v: a convex outline [x0, y0, x1, y1, ...]; each edge's shadow quad
    for (let i = 0; i < v.length; i += 2) {
      const ax = v[i], ay = v[i + 1], bx = v[(i + 2) % v.length], by = v[(i + 3) % v.length];
      const da = Math.hypot(ax - vx, ay - vy) || 1e-3, db = Math.hypot(bx - vx, by - vy) || 1e-3;
      const fax = vx + (ax - vx) / da * F, fay = vy + (ay - vy) / da * F, fbx = vx + (bx - vx) / db * F, fby = vy + (by - vy) / db * F;
      pos.push(ax, 0, -ay, bx, 0, -by, fbx, 0, -fby, ax, 0, -ay, fbx, 0, -fby, fax, 0, -fay);
    }
  };
  for (const b of blocks.values()) {
    if (Math.abs(b.x - vx) > VIS_S + BLOCK_HALF || Math.abs(b.y - vy) > VIS_S + BLOCK_HALF) continue;
    const h = BLOCK_HALF; edges([b.x - h, b.y - h, b.x + h, b.y - h, b.x + h, b.y + h, b.x - h, b.y + h]);
  }
  for (const b of builds.values()) if (b.k !== "ship" && Math.abs(b.x - vx) <= VIS_S + b.rad && Math.abs(b.y - vy) <= VIS_S + b.rad) edges(b.poly);
  if (pos.length > visCap) { visCap = Math.max(pos.length, visCap * 2, 1800); visGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(visCap), 3)); }
  const pa = visGeo.attributes.position; if (pa) { pa.array.set(pos); pa.needsUpdate = true; } visGeo.setDrawRange(0, pos.length / 3);
  shade.position.x = vx; shade.position.z = -vy; shade.visible = haveMe; shadeHex.value = HEX_FLAT / 2; shadeT.value = performance.now() / 1000;
  visCam.position.set(vx, 2000, -vy); visCam.lookAt(vx, 0, -vy); visU.visC.value.set(vx, vy);
  renderer.setRenderTarget(visRT); renderer.render(visScene, visCam); renderer.setRenderTarget(null);
}
// whether a block or Build piece stands between two points (the minimap hides ships my ship can't see)
function sightBlocked(x0, y0, x1, y1) {
  for (const b of blocks.values()) { const h = BLOCK_HALF; if (segPoly(x0, y0, x1, y1, [b.x - h, b.y - h, b.x + h, b.y - h, b.x + h, b.y + h, b.x - h, b.y + h]) !== null) return true; }
  for (const b of builds.values()) if (b.k !== "ship" && segPoly(x0, y0, x1, y1, b.poly) !== null) return true;   // test ships don't block sight, like ships
  return false;
}

function addPlayer(id, name, x = 0, y = 0) {
  if (players.has(id)) { players.get(id).name = name; return players.get(id); }
  const holder = new THREE.Group();
  holder.position.copy(toWorld(x, y, 0)); holder.add(makeVisual(id !== myId)); scene.add(holder);
  holder.visible = id === myId;                // others show once a snapshot has them inside the load circle
  const p = { id, name, holder, heading: 0, buf: [], to: { x, y }, near: false };   // buf: recent snapshot positions on the server's clock; near: inside my load circle
  players.set(id, p); return p;
}
function dropPlayer(id) { const p = players.get(id); if (!p) return; scene.remove(p.holder); players.delete(id); }
let turnTgt = null, turnMid = null, turnSign = 0;   // my own ship's input direction, the last "middle" direction, a forced turn way
const TRAIL_MAX = 80, TRAIL_S = 0.4;           // (owner) the camera trail: up to 80 m behind (was 200), 0.4 m per m/s of speed
const REVERSAL = THREE.MathUtils.degToRad(170);   // an input change this big counts as a reversal
const TURN = 8;                                // rad/s (owner, 2026-10-13: 3x slower than the first 12, then doubled to 8)
// (owner) with no WASD, the ship keeps its last heading: for my own ship only held
// input re-aims it (correction nudges never do); for others, only a sustained real speed does.
function placeShip(p, x, y, dt, face, moving, sign = 0) {   // sign: a forced turn direction (+1 / -1), 0 = the short way
  const prev = p.holder.position, nx = toWorld(x, y, 0);
  const dx = nx.x - prev.x, dz = nx.z - prev.z;
  prev.copy(nx);
  const spd = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
  p.spd = (p.spd || 0) * 0.85 + spd * 0.15;
  let target = null;
  if (face) target = Math.atan2(face.x - nx.x, face.z - nx.z);        // my own ship: toward the input or the reticle
  else if ((moving === undefined ? p.spd > 30 : moving) && spd > 1) target = Math.atan2(dx, dz);   // only frames that really moved
  if (target !== null && sign) {               // a reversal: keep turning the chosen way round until the nose arrives
    const T2 = Math.PI * 2, r = ((sign * (target - p.heading)) % T2 + T2) % T2;
    if (r > 1e-3 && r < T2 - 1e-3) p.heading += sign * Math.min(TURN * dt, r);
    p.heading = ((p.heading + Math.PI) % T2 + T2) % T2 - Math.PI;
    p.holder.rotation.y = p.heading;
  } else if (target !== null) {
    let diff = (target - p.heading) % (Math.PI * 2);                  // shortest arc, valid however far the
    if (diff > Math.PI) diff -= Math.PI * 2;                          // heading has accumulated (circling the
    else if (diff < -Math.PI) diff += Math.PI * 2;                    // aim around the ship adds a turn per lap)
    p.heading += Math.max(-TURN * dt, Math.min(TURN * dt, diff));
    p.heading = ((p.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;   // kept bounded
    p.holder.rotation.y = p.heading;
  }
}

// (owner, 2026-10-13) my ship against the blocks and the other ships (as drawn), as the server does it
function collideMe() {
  const q = { x: me.x, y: me.y, vx: vel.x, vy: vel.y };
  for (const b of blocks.values()) if (Math.abs(q.x - b.x) <= BLOCK_HALF + SHIP_R && Math.abs(q.y - b.y) <= BLOCK_HALF + SHIP_R) pushFromBlock(q, b);
  for (const b of builds.values()) { const dx = q.x - b.x, dy = q.y - b.y, R = b.rad + SHIP_R; if (dx * dx + dy * dy <= R * R) pushFromPoly(q, b.poly, SHIP_R, pushOut); }   // Build menu pieces
  for (const p of players.values()) { if (p.id === myId || !p.near) continue; pushOut(q, p.holder.position.x, -p.holder.position.z, 2 * SHIP_R); }
  if (inside(q.x, q.y)) { me.x = q.x; me.y = q.y; vel.x = q.vx; vel.y = q.vy; }
}
// (owner) the first thing the aim line runs into, from my ship toward the reticle: a block (its square) or another ship
// (its circle). Returns the fraction of the way (0-1) or null.
function aimBlocked(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0; let best = null;
  const hit = (t) => { if (t > 1e-4 && t < 1 && (best === null || t < best)) best = t; };
  for (const b of blocks.values()) {               // segment vs square (slabs)
    let t0 = 0, t1 = 1, ok = true;
    for (const [o, d, lo, hi] of [[x0, dx, b.x - BLOCK_HALF, b.x + BLOCK_HALF], [y0, dy, b.y - BLOCK_HALF, b.y + BLOCK_HALF]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
      let a = (lo - o) / d, c = (hi - o) / d; if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 > 0) hit(t0);
  }
  for (const b of builds.values()) { const t = segPoly(x0, y0, x1, y1, b.poly); if (t !== null) hit(t); }   // Build menu pieces
  for (const p of players.values()) {              // segment vs circle
    if (p.id === myId || !p.near) continue;
    const cx = p.holder.position.x - x0, cy = -p.holder.position.z - y0, L2 = dx * dx + dy * dy; if (L2 < 1e-9) continue;
    const tc = (cx * dx + cy * dy) / L2, px = dx * tc - cx, py = dy * tc - cy, h2 = SHIP_R * SHIP_R - (px * px + py * py);
    if (h2 < 0) continue; hit(tc - Math.sqrt(h2 / L2));
  }
  return best;
}

// ---- input: WASD relative to the camera; middle-mouse drag (touch: one-finger drag) orbits it ----
const keys = new Set();
let sprint = false;                            // (owner) Shift = sprint (30% faster)
// (owner) X drops a block where the ship is. (owner, 2026-10-13) Blocks are the server's now: everyone sees them and
// ships collide with them (the ship that dropped one is pushed out of it)
const cubeGeo = new THREE.BoxGeometry(50, 50, 50);
const cubeMat = new THREE.MeshStandardMaterial({ color: 0x8899bb, roughness: 0.6, metalness: 0.1 });
const blocks = new Map();                      // id -> { x, y, mesh }
function addBlock(id, x, y) {
  if (blocks.has(id)) return;
  const mesh = new THREE.Mesh(cubeGeo, farMat(cubeMat)); mesh.scale.setScalar(BLOCK_HALF / 25); mesh.position.copy(toWorld(x, y, BLOCK_HALF)); scene.add(mesh);
  blocks.set(id, { x, y, mesh });
}
function dropBlock(id) { const b = blocks.get(id); if (b) { scene.remove(b.mesh); blocks.delete(id); } }
function dropCube() { if (haveMe) send({ t: "block" }); }
const typing = () => { const el = document.activeElement; return !!el && ((el.tagName === "INPUT" && !["range", "checkbox", "button", "file"].includes(el.type)) || el.tagName === "TEXTAREA" || el.tagName === "SELECT"); };
addEventListener("keydown", (e) => {
  if (typing()) return;
  if (e.code === "Enter") { e.preventDefault(); openChat(); return; }
  if (e.code === "Tab" || e.key === "Tab") { e.preventDefault(); if (!e.repeat && window.Inventory) window.Inventory.toggle(); return; }   // (owner) TAB opens / closes the inventory (in the chat input it switches channel)
  if (e.code === "Escape") { hideMenu(); if (window.Inventory && window.Inventory.open) window.Inventory.toggle(false); }
});
addEventListener("keydown", (e) => { if (typing()) return; if (e.key === "Shift") sprint = true; if (e.code === "KeyX") dropCube(); if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) { keys.add(e.code); e.preventDefault(); } });
addEventListener("keyup", (e) => { if (e.key === "Shift") sprint = false; keys.delete(e.code); });
addEventListener("blur", () => { keys.clear(); sprint = false; });
// (owner, 2026-10-13) the admin Build menu (build3d.js): [B] / B for staff
const build = initBuild({ scene, camera, canvas, toWorld, send, typing, farMat, makeShip: () => makeVisual(true), inside: (x, y) => inside(x, y, 0), clearKeys: () => keys.clear() });
document.addEventListener("contextmenu", (e) => e.preventDefault());   // (owner) the browser's menu never opens in the game, on the UI either (the game's own menus still do)
let orbiting = false, aiming = false, aimPin = null, orbitLock = null;   // aimPin: while orbiting the pointer is locked, so the reticle keeps its screen spot; orbitLock: MMB holds the camera frame
const mouse = { x: 0, y: 0 };
let myAim = null;                              // the reticle (three x / z) while aiming, from the last frame
canvas.addEventListener("mousedown", (e) => { if (e.button === 1) { orbiting = true; aimPin = { x: e.clientX, y: e.clientY };
    orbitLock = { dist: viewDist, len: Math.hypot(focus.x - me.x, focus.y - me.y), ang: Math.atan2(focus.x - me.x, focus.y - me.y) - camYaw }; lockPointer(); e.preventDefault(); }
  if (e.button === 2) { aiming = true; mouse.x = e.clientX; mouse.y = e.clientY; camDist = cam.zmax; e.preventDefault(); } });   // (owner) aiming eases the zoom back to 600 m (the usual camera easing)
addEventListener("mouseup", (e) => { if (e.button === 1) { orbiting = false; aimPin = null; orbitLock = null; if (document.pointerLockElement === canvas) { try { document.exitPointerLock(); } catch {} } } if (e.button === 2) aiming = false; });
// unadjustedMovement avoids the Windows cursor-wrap path whose movementX spikes once per screen width
function lockPointer() {
  let r; try { r = canvas.requestPointerLock({ unadjustedMovement: true }); } catch { try { r = canvas.requestPointerLock(); } catch {} }
  if (r && r.catch) r.catch(() => { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {} });
}
// (owner, 2026-10-13) the cursor: the system one is hidden (game.html); this dot sits wherever the pointer is, over the
// UI as well. While the middle mouse holds the pointer lock it stays put; leaving the window hides it.
const cursorEl = document.getElementById("cursor");
addEventListener("pointermove", (e) => { if (!cursorEl || e.pointerType === "touch") return; cursorEl.hidden = false; cursorEl.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, { capture: true, passive: true });
document.addEventListener("mouseleave", () => { if (cursorEl) cursorEl.hidden = true; });
addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; if (orbiting) { let dx = e.movementX; if (Math.abs(dx) > 200) dx = 0; camYaw += dx * 0.005 * cam.rot; } });   // (owner) inverted; spikes from the pointer-lock cursor wrap are dropped
canvas.addEventListener("wheel", (e) => { e.preventDefault(); if (aiming) return; camDist = Math.min(cam.zmax, Math.max(cam.zmin, camDist * (e.deltaY > 0 ? 1.12 : 0.9))); }, { passive: false });
// touch: one finger orbits (drag = drag), two fingers pinch the distance
let touch1 = null, pinch = 0;
canvas.addEventListener("touchstart", (e) => { const t = e.targetTouches; if (t.length === 1) touch1 = { x: t[0].clientX, y: t[0].clientY }; if (t.length === 2) pinch = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }, { passive: true });
canvas.addEventListener("touchmove", (e) => {
  const t = e.targetTouches;                   // only fingers on the world: the joystick's finger is its own
  if (t.length === 1 && touch1) { camYaw += (t[0].clientX - touch1.x) * 0.006 * cam.rot; touch1 = { x: t[0].clientX, y: t[0].clientY }; }
  if (t.length === 2) { const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); if (pinch) camDist = Math.min(cam.zmax, Math.max(cam.zmin, camDist * pinch / d)); pinch = d; touch1 = null; }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener("touchend", (e) => { const t = e.targetTouches; touch1 = t.length === 1 ? { x: t[0].clientX, y: t[0].clientY } : null; pinch = 0; }, { passive: true });

// (owner, 2026-10-13) touch devices get a joystick for WASD (drag elsewhere turns the camera). Right-click stays
// PC-only: phones are just for testing a second account.
const TOUCH = matchMedia("(pointer: coarse)").matches;
const joy = { x: 0, y: 0, id: null };
if (TOUCH) {
  document.documentElement.classList.add("touch");
  const base = document.getElementById("joy"), knob = document.getElementById("joy-knob");
  const R = 50;
  const move = (e) => {
    const r = base.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = "translate(" + dx + "px," + dy + "px)";
    joy.x = dx / R; joy.y = -dy / R;
  };
  base.addEventListener("pointerdown", (e) => { joy.id = e.pointerId; base.setPointerCapture(e.pointerId); move(e); e.preventDefault(); });
  base.addEventListener("pointermove", (e) => { if (e.pointerId === joy.id) move(e); });
  const end = (e) => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ""; };
  base.addEventListener("pointerup", end); base.addEventListener("pointercancel", end);
}

function inputDir() {                          // forward = where the camera faces, on the ground
  let f = 0, r = 0;
  if (keys.has("KeyW")) f += 1; if (keys.has("KeyS")) f -= 1;
  if (keys.has("KeyD")) r += 1; if (keys.has("KeyA")) r -= 1;
  if (joy.id !== null && Math.hypot(joy.x, joy.y) > 0.15) { f = joy.y; r = joy.x; }   // the joystick: analog, a small dead zone
  const b = sprint && !aiming ? 1 : 0;          // (owner, 2026-10-13) no sprinting while aiming
  if (!f && !r) return { x: 0, y: 0, b };
  const n = Math.max(1, Math.hypot(f, r)); f /= n; r /= n;
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  return { x: f * sin + r * cos, y: f * cos - r * sin, b };   // game plane: +y north at yaw 0
}

// ---- socket ----
let ws = null, srvBuild = "", lastDir = { x: 0, y: 0, b: 0 }, lastSent = 0, closedForGood = false;
let rtt = 80, pingTimer = 0, srvOff = null;   // srvOff: local clock minus the server's, from snapshots                   // measured round trip, for latency-compensated correction
const wsUrl = () => { const q = new URLSearchParams(); if (typeof deviceId === "function") q.set("d", deviceId()); const as = new URLSearchParams(location.search).get("as"); if (as) q.set("as", as);   // ?as: the PTR's second-account test hook (ignored live)
  return (typeof API_BASE !== "undefined" ? API_BASE : location.origin).replace(/^http/, "ws") + "/ws?" + q.toString(); };
function connect() {
  statusEl.hidden = false; statusEl.textContent = "Connecting…";
  ws = new WebSocket(wsUrl());
  ws.onopen = () => {
    statusEl.hidden = true;
    clearInterval(pingTimer);
    pingTimer = setInterval(() => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "ping", ts: performance.now() })); }, 2000);
  };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === "hello") {
      srvBuild = m.build || "";
      if (m.cfg) { if (m.cfg.shipR) SHIP_R = m.cfg.shipR; if (m.cfg.blockHalf) BLOCK_HALF = m.cfg.blockHalf; if (m.cfg.hexFlat && m.cfg.hexFlat !== HEX_FLAT) { HEX_FLAT = m.cfg.hexFlat; rebuildBorder(); } SPEED = m.cfg.speed || SPEED; ACCEL = m.cfg.accel || ACCEL; BRAKE = m.cfg.brake || BRAKE; STOP_D = m.cfg.stopD || STOP_D; SPRINT = m.cfg.sprint || SPRINT; VEL_TURN = m.cfg.velTurn || VEL_TURN; SIDE_SPEED = m.cfg.sideSpeed || SIDE_SPEED; FWD_ARC = m.cfg.fwdArc || FWD_ARC; TURN_ACCEL = m.cfg.turnAccel || TURN_ACCEL; if (m.cfg.cap) CAPC = m.cfg.cap; if (m.cfg.loadR && m.cfg.loadR !== LOAD_R) { LOAD_R = m.cfg.loadR; loadRingFor(LOAD_R); } }
      myId = m.you.id; myName = m.you.name; haveMe = false; mySide = null;
      amStaff = !!m.you.staff;
      if (m.you.staff && window.AdminPanel) window.AdminPanel.mount();   // (owner) the Admin button, for staff accounts
      build.setStaff(amStaff); build.load(m.builds, m.cfg && m.cfg.buildH, m.cfg && m.cfg.shipR && 2 * m.cfg.shipR);
      for (const p of [...players.keys()]) dropPlayer(p);
      for (const r of m.roster || []) addPlayer(r.i, r.n).side = r.s;
      for (const id of [...blocks.keys()]) dropBlock(id);
      for (const [id, x, y] of m.blocks || []) addBlock(id, x, y);
      // (owner, 2026-10-13) the side is remembered: re-join it, unless this is the first time or the player ticked
      // Reset faction on the Welcome back page (game.html?reset=1), which shows the picker
      const reset = new URLSearchParams(location.search).get("reset") === "1";
      if (m.side && !reset) sendSide(m.side); else sidePick.hidden = false;
      if (m.countdown) startCountdown(Date.now() + m.countdown.in, m.countdown.parts);
    } else if (m.t === "spawn") {
      me.x = m.x; me.y = m.y; haveMe = true; mySide = m.s; sidePick.hidden = true;
      focus.x = me.x; focus.y = me.y;
      { const mp = addPlayer(myId, myName, me.x, me.y); mp.side = m.s; mp.near = true; mp.holder.visible = true; }
      drawPrefix();
    } else if (m.t === "snap") {
      { const off = Date.now() - m.ts; srvOff = srvOff === null || off < srvOff ? off : srvOff + (off - srvOff) * 0.01; }
      const inSnap = new Set();
      for (const [id, cx, cy, ch] of m.p) {
        const x = cx / 100, y = cy / 100;
        inSnap.add(id);
        if (id === myId) {                     // soft-correct my prediction toward where the server will be once
          const lead = (rtt / 2 + 50) / 1000;  // it has heard my latest input (its snapshot is ~half a round trip old)
          const lspd = Math.max(SPEED, Math.hypot(vel.x, vel.y));
          let tx = x + vel.x * lead, ty = y + vel.y * lead;
          if (!inside(tx, ty)) { tx = x; ty = y; }
          const err = Math.hypot(tx - me.x, ty - me.y);
          if (err > lspd * 0.4) { me.x = tx; me.y = ty; } else { me.x += (tx - me.x) * 0.1; me.y += (ty - me.y) * 0.1; }
          continue;
        }
        const p = players.get(id) || addPlayer(id, "");
        if (!p.near) { p.near = true; p.buf = []; p.holder.visible = true; p.holder.position.copy(toWorld(x, y, 0)); }   // entering the load circle: start fresh there
        p.buf.push({ x, y, h: (ch || 0) / 1000, t: m.ts }); if (p.buf.length > 30) p.buf.shift();   // a short history, timed by the server
        p.to = { x, y };
      }
      for (const p of players.values()) if (p.id !== myId && p.near && !inSnap.has(p.id)) { p.near = false; p.buf = []; p.holder.visible = false; }   // left the load circle
    } else if (m.t === "join") { if (m.i !== myId) addPlayer(m.i, m.n).side = m.s; }
    else if (m.t === "leave") { if (m.i !== myId) dropPlayer(m.i); }
    else if (m.t === "cap") { cap = m.c; capOut = !!m.o; }
    else if (m.t === "chat") addChat(m);
    else if (build.onMsg(m)) { /* Build menu pieces */ }
    else if (m.t === "block") { for (const id of m.gone || []) dropBlock(id); if (m.b) addBlock(m.b[0], m.b[1], m.b[2]); }
    else if (m.t === "teleport") { me.x = m.x; me.y = m.y; vel.x = vel.y = 0; brakeA = 0; focus.x = me.x; focus.y = me.y; }   // (owner) an admin moved this ship
    else if (m.t === "pong") rtt = rtt * 0.7 + Math.max(0, performance.now() - m.ts) * 0.3;
    else if (m.t === "countdown") startCountdown(Date.now() + m.in, m.parts);
    else if (m.t === "update") goUpdating(["web"]);
  };
  ws.onclose = (ev) => {
    if (closedForGood) return;
    if (ev.code === 4001) { location.href = "login.html"; return; }
    if (ev.code === 4002) { closedForGood = true; statusEl.hidden = false; statusEl.textContent = "Playing on another tab or device."; setTimeout(() => location.href = "play.html", 1500); return; }
    // (owner, 2026-10-13) another account on this device, a kick, a ban: say so, then back to the Welcome back page (a ban
    // goes to Log in, which shows it)
    if (ev.code === 4003 || ev.code === 4005 || ev.code === 4006) {
      closedForGood = true; statusEl.hidden = false;
      statusEl.textContent = ev.code === 4003 ? "Another account is playing on this device." : (ev.code === 4005 ? "Kicked" : "Banned") + (ev.reason ? ": " + ev.reason : ".");
      setTimeout(() => location.href = ev.code === 4006 ? "login.html" : "play.html", 3000); return;
    }
    statusEl.hidden = false; statusEl.textContent = "Reconnecting…";
    setTimeout(connect, 2000);
  };
}
connect();
let lastH = 0, lastAim = null, trailing = 0;
// the reticle's direction from my ship (the movement convention: atan2(x, -y) on the game plane), or null when not aiming
const aimAngle = () => aiming && myAim && haveMe ? Math.atan2(myAim.x - me.x, myAim.z + me.y) : null;                   // trailing: settled-state resends still owed after the last change
function sendDir(d, now) {
  if (!ws || ws.readyState !== 1) return;
  const mine = players.get(myId), h = mine ? Math.round(mine.heading * 100) / 100 : 0;   // the heading, to 0.01 rad
  const ag = aimAngle(), aq = ag === null ? null : Math.round(ag * 100) / 100;   // (owner) aiming: forward is the reticle
  const changed = d.x !== lastDir.x || d.y !== lastDir.y || d.b !== lastDir.b || h !== lastH || aq !== lastAim;
  // at most 20 sends a second (the frame loop retries, so the latest state always goes out), a heartbeat while
  // moving, and (owner) after movement or rotation stops, the settled state twice more so the server and
  // everyone else land on the real final position and heading
  let due = false;
  if (changed) { if (now - lastSent >= 50) { due = true; trailing = 2; } }
  else if (trailing > 0) { if (now - lastSent >= 100) { due = true; trailing--; } }
  else if ((d.x || d.y) && now - lastSent >= 500) due = true;
  if (!due) return;
  lastDir = d; lastH = h; lastAim = aq; lastSent = now;
  ws.send(JSON.stringify(aq === null ? { t: "move", x: d.x, y: d.y, b: d.b, h } : { t: "move", x: d.x, y: d.y, b: d.b, h, a: aq }));
}

// ---- deploy countdown (a live push warns everyone ~30 s ahead) ----
let countAt = 0, countParts = ["server", "web"];
function startCountdown(at, parts) { countAt = at; if (parts && parts.length) countParts = parts; countEl.hidden = false; }
function goUpdating(parts) {
  closedForGood = true; try { ws && ws.close(); } catch {}
  const q = new URLSearchParams({ updating: "1", parts: (parts || countParts).join(",") });
  if (WEB_BUILD && WEB_BUILD !== "__" + "BUILD__") q.set("web", WEB_BUILD);
  if (srvBuild) q.set("srv", srvBuild);
  location.href = "play.html?" + q.toString();
}

// ---- frame loop ----
let lastT = performance.now();
const focus = { x: 0, y: 0 };                  // where the camera looks (the player, or toward the aim circle)
let viewDist = camDist;                        // the eased camera distance
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
const camOff = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const nowP = performance.now(), dt = Math.min((nowP - lastT) / 1000, 0.1), now = Date.now(); lastT = nowP;

  const d = inputDir(); sendDir(d, now);
  const movingIn = !!(d.x || d.y);
  if (cap <= 0) capOut = true; else if (capOut && cap >= CAPC.resume) capOut = false;
  const mineP = players.get(myId);
  const wrap = (q) => { q %= Math.PI * 2; return q > Math.PI ? q - Math.PI * 2 : q < -Math.PI ? q + Math.PI * 2 : q; };
  const want = Math.atan2(d.x, -d.y), ag = aimAngle();
  const dh = movingIn ? wrap(want - (mineP ? mineP.heading : 0)) : 0;    // off the nose: the acceleration share (as the server)
  const df = movingIn && ag !== null ? wrap(want - ag) : 0;             // (owner) off "forward": not aiming, everything is forward
  const sprintOn = !!d.b && movingIn && Math.abs(df) <= FWD_ARC && !capOut;   // (owner) sprint only forward
  if (haveMe) cap = sprintOn ? Math.max(0, cap - CAPC.drain * Math.hypot(vel.x, vel.y) * dt / 100) : Math.min(CAPC.max, cap + (movingIn ? CAPC.walk : CAPC.idle) * dt);
  drawCap();
  if (haveMe && (d.x || d.y || vel.x || vel.y)) {   // predict my own movement exactly as the server integrates it
    const spd = SPEED * dirSpeed(df) * (sprintOn ? SPRINT : 1);
    let a = ACCEL;                             // letting go brakes harder than thrust accelerates, stopping within STOP_D
    if (d.x || d.y) brakeA = 0; else { brakeA = stopRate(Math.hypot(vel.x, vel.y)); a = brakeA; }
    if (movingIn) a *= accelShare(dh);         // a push off the nose gets only part of the acceleration
    [vel.x, vel.y] = movingIn ? carry(vel.x, vel.y, d.x, d.y, spd * Math.min(1, Math.hypot(d.x, d.y)), a, BRAKE, dt, mineP ? mineP.heading : 0) : steer(vel.x, vel.y, 0, 0, a, a, dt);   // as on the server
    if (Math.hypot(vel.x, vel.y) < 0.01 && !d.x && !d.y) { vel.x = vel.y = 0; brakeA = 0; }
    const nx = me.x + vel.x * dt, ny = me.y + vel.y * dt;
    if (inside(nx, ny)) { me.x = nx; me.y = ny; }
    else { let lo = 0, hi = 1; for (let i = 0; i < 10; i++) { const mid = (lo + hi) / 2; inside(me.x + (nx - me.x) * mid, me.y + (ny - me.y) * mid) ? (lo = mid) : (hi = mid); } me.x += (nx - me.x) * lo; me.y += (ny - me.y) * lo; vel.x = vel.y = 0; }
    collideMe();
  }

  // other ships are drawn 150 ms in the past on the server's clock, between the two snapshots around that moment
  // (only the last two used to be kept, older than the render time, so they stepped and never glided)
  const rt = Date.now() - (srvOff || 0) - 150;
  for (const p of players.values()) {
    if (p.id === myId) {                       // (owner) the nose turns toward the input, not the drift
      // (owner, 2026-10-13) while aiming (right button, with or without the middle), it turns toward the reticle instead
      const face = aiming && myAim ? myAim : (d.x || d.y) ? { x: me.x + d.x, z: -me.y - d.y } : null;
      // (owner, 2026-10-13) reversals turn through the last "middle" direction: going A W D, then D A D A..., the nose
      // swings over the top (W) every time instead of whichever way is shortest. Each input direction change that
      // isn't a reversal records the direction it came from as the middle; a reversal then picks the turn direction
      // whose arc passes through it, fixed until the input changes again.
      if (!aiming && (d.x || d.y)) {
        const T2 = Math.PI * 2, tgt = Math.atan2(d.x, -d.y), w = (q) => { q %= T2; return q > Math.PI ? q - T2 : q < -Math.PI ? q + T2 : q; };
        if (turnTgt === null) turnTgt = tgt;
        else if (Math.abs(w(tgt - turnTgt)) > 1e-3) {
          if (Math.abs(w(tgt - turnTgt)) > REVERSAL) {
            turnSign = 0;
            if (turnMid !== null) { const r = ((tgt - p.heading) % T2 + T2) % T2, m = ((turnMid - p.heading) % T2 + T2) % T2; turnSign = m < r ? 1 : -1; }
          } else { turnMid = turnTgt; turnSign = 0; }
          turnTgt = tgt;
        }
      } else if (aiming) turnSign = 0;
      placeShip(p, me.x, me.y, dt, face, false, aiming ? 0 : turnSign); continue;
    }
    const B = p.buf; let x = p.to.x, y = p.to.y, h = null;
    if (B.length) {
      let i = B.length - 1; while (i > 0 && B[i].t > rt) i--;
      const a = B[i], b = B[i + 1];
      if (b && b.t > a.t && rt >= a.t) { const t = (rt - a.t) / (b.t - a.t); x = a.x + (b.x - a.x) * t; y = a.y + (b.y - a.y) * t;
        let dh = (b.h - a.h) % (Math.PI * 2); if (dh > Math.PI) dh -= Math.PI * 2; else if (dh < -Math.PI) dh += Math.PI * 2; h = a.h + dh * t; }
      else if (!b && i > 0 && rt > a.t) {      // past the newest: carry on along its last motion briefly, then hold
        const z = B[i - 1], k = Math.min(rt - a.t, 120) / Math.max(1, a.t - z.t); x = a.x + (a.x - z.x) * k; y = a.y + (a.y - z.y) * k; h = a.h;
      } else { x = a.x; y = a.y; h = a.h; }
    }
    placeShip(p, x, y, dt);
    if (h !== null) { p.heading = h; p.holder.rotation.y = h; }   // the owner's own heading, as they see it
  }

  // right-click aiming (owner): the reticle is the ground point under the pointer, CLAMPED to the leash circle (push
  // past it and the reticle rides its edge); the camera's focus slides toward it, zooming out to keep the ship in shot
  let fx = haveMe ? me.x : 0, fy = haveMe ? me.y : 0, wantDist = camDist, aimEase = 0;   // aimEase: how far the aim is steering the camera (0 in the dead zone)
  function aimAt(px, py) {
    const sx = (px / innerWidth) * 2 - 1, sy = -(py / innerHeight) * 2 + 1;
    raycaster.setFromCamera({ x: sx, y: sy }, camera);
    if (!raycaster.ray.intersectPlane(groundPlane, aimHit)) return null;
    let ux = aimHit.x - me.x, uz = aimHit.z + me.y;                      // world; game y is -z
    const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const d = Math.min(ul, cam.leash);
    return { x: me.x + ux * d, z: -me.y + uz * d, sux: sx, suy: sy, ux, uz };
  }
  const aimPx = () => aimPin ? aimPin : mouse;
  if (aiming && haveMe && !orbitLock) {
    const a = aimAt(aimPx().x, aimPx().y);
    if (a) {
      // (owner, 2026-10-13) the camera is driven ONLY by the pointer's screen position and constants, never by the
      // reticle's ground distance (that looped). One uniform full-press zoom; the leash (focus sliding along the aim)
      // is solved per direction so the screen edge sits exactly the overflow past the circle, the ship kept 80 m
      // inside the opposite edge. A dead zone around the screen's center (30%), full at 80% out.
      const R = cam.leash, S = 80, m = 0.85;
      const r = Math.min(1, Math.hypot(a.sux, a.suy));
      const ang = (Math.atan2(a.suy, a.sux) * 180 / Math.PI + 360) % 360;   // 0 = E, 90 = N (screen directions)
      const ring = [cam.dir.e, cam.dir.ne, cam.dir.n, cam.dir.nw, cam.dir.w, cam.dir.sw, cam.dir.s, cam.dir.se];
      const t = ang / 45, i0 = Math.floor(t) % 8, i1 = (i0 + 1) % 8, ft = t - Math.floor(t);
      const O = Math.max(0, cam.over + ring[i0] + (ring[i1] - ring[i0]) * (ft * ft * (3 - 2 * ft)));
      const f2 = Math.PI / 6, ph = THREE.MathUtils.degToRad(cam.pitch);
      const cot = (q) => Math.cos(q) / Math.max(1e-4, Math.sin(q));
      const eTop = Math.max(0.05, -Math.cos(ph) + Math.sin(ph) * cot(Math.max(0.05, ph - f2)));
      const eBot = Math.max(0.05, Math.cos(ph) - Math.sin(ph) * cot(ph + f2));
      const ex = Math.tan(f2) * camera.aspect;
      const uxs = r > 1e-4 ? Math.abs(a.sux) / r : 0, uys = r > 1e-4 ? Math.abs(a.suy) / r : 1;
      const eF = a.suy >= 0 ? eTop : eBot, eB = a.suy >= 0 ? eBot : eTop;
      const denF = Math.max(1e-4, Math.hypot(uxs / ex, uys / eF));       // ellipse boundary ahead, per unit of zoom
      const denB = Math.max(1e-4, Math.hypot(uxs / ex, uys / eB));       // and behind
      const Ddir = (R + O + S) / (m * (1 / denF + 1 / denB));
      const DZ = 0.3, rr = Math.min(1, Math.max(0, (r - DZ) / (0.8 - DZ))), ease = rr * rr * (3 - 2 * rr); aimEase = ease;
      wantDist = Math.max(camDist, Math.min(6000, ease * Ddir));
      let lam = 1 - (m * wantDist / denF - O) / R;                       // ahead of the focus: the circle + exactly the gap
      lam = Math.min(lam, (m * wantDist / denB - S) / R);                // behind it: the ship + its margin
      lam = Math.min(1, Math.max(0, lam)) * ease;
      fx = me.x + a.ux * lam * R; fy = me.y + -a.uz * lam * R;
    }
  }
  // (owner, 2026-10-13) the trail: moving with the aim not steering the camera (not aiming, or the pointer in the dead zone),
  // the focus sits behind the ship along its motion, 0-80 m with speed; it fades out as the
  // aim takes over beyond the dead zone
  if (haveMe && !orbitLock) {
    const v = Math.hypot(vel.x, vel.y);
    // the focus easing below already lags a moving target by v / 6 m, so only the rest is added: the real trail is the 0-80 m
    if (v > 1) { const t = Math.max(0, Math.min(TRAIL_MAX, v * TRAIL_S) - v / 6) * (1 - aimEase) / v; fx -= vel.x * t; fy -= vel.y * t; }
  }
  if (orbitLock && haveMe) {                   // (owner) MMB: the camera and its target orbit the player at the frame they had
    const th = camYaw + orbitLock.ang;
    fx = me.x + Math.sin(th) * orbitLock.len; fy = me.y + Math.cos(th) * orbitLock.len;
    wantDist = orbitLock.dist;
  }
  const k = 1 - Math.exp(-dt * 6);                                       // the focus and zoom ease, in and back
  focus.x += (fx - focus.x) * k; focus.y += (fy - focus.y) * k;
  viewDist += (wantDist - viewDist) * k;
  if (haveMe) {
    loadRing.visible = true; loadRing.position.set(me.x, 0.35, -me.y);
    rangeRing.visible = helpers; rangeRing.position.set(me.x, 0.36, -me.y);
  }
  const target = toWorld(focus.x, focus.y, shipMid);
  const pr = THREE.MathUtils.degToRad(cam.pitch);
  camOff.set(-Math.sin(camYaw), 0, Math.cos(camYaw)).multiplyScalar(Math.cos(pr) * viewDist);   // behind the player: W flies toward where the camera faces
  camOff.y = Math.sin(pr) * viewDist;
  camera.position.copy(target).add(camOff);
  camera.lookAt(target);
  // the line from the ship's center on the ground plane to the reticle, worked out against the camera as it renders
  // this frame so it never trails the pointer
  let aimShown = false; myAim = null;
  if (aiming && haveMe) {
    const a = aimAt(aimPx().x, aimPx().y);
    if (a) {
      aimShown = true;
      const lp = aimLineGeo.attributes.position, lc = aimLineGeo.attributes.color, sx = me.x, sz = -me.y;
      const at = (f) => [sx + (a.x - sx) * f, sz + (a.z - sz) * f];
      const tb = aimBlocked(me.x, me.y, a.x, -a.z);
      // four points: white from the ship, then (blocked) red from the hit to the reticle, else fading out over the last stretch
      const pts = tb === null ? [[0, 1, 1, 1, 0.85], [AIM_FADE, 1, 1, 1, 0.85], [AIM_FADE, 1, 1, 1, 0.85], [1, 1, 1, 1, 0]]
        : [[0, 1, 1, 1, 0.85], [tb, 1, 1, 1, 0.85], [tb, 1, 0.25, 0.2, 0.9], [1, 1, 0.25, 0.2, 0.5]];
      pts.forEach(([f, r, g, bl, al], i) => { const [x, z] = at(f); lp.setXYZ(i, x, 0.4, z); lc.setXYZW(i, r, g, bl, al); });
      lp.needsUpdate = true; lc.needsUpdate = true; aimLine.computeLineDistances();
      const ds = Math.max(1, viewDist / 500); aimLineMat.dashSize = 12 * ds; aimLineMat.gapSize = 8 * ds;   // dashes keep their look zoomed out
      aimHit.set(a.x, 0, a.z); myAim = { x: a.x, z: a.z };
    }
  }
  aimLine.visible = aimShown;
  updateStop();
  drawMinimap(nowP);

  if (countAt) {
    const left = Math.ceil((countAt - now) / 1000);
    if (left <= 0) { countAt = 0; goUpdating(); } else countEl.textContent = "Update incoming — " + left + " s";
  }

  build.frame();
  updateVis();
  renderer.render(scene, camera);
});

// (owner, 2026-10-13) choosing a side: Red or Blue, every time the game is entered
const sidePick = document.getElementById("side-pick");
// joining with a side; (owner) "Reset location" on the Welcome back page (game.html?resetpos=1) puts the ship back near the
// center this once. Both flags leave the address once used, so reconnects just re-join where you are.
function sendSide(side) {
  const u = new URL(location.href), rp = u.searchParams.get("resetpos") === "1";
  send(rp ? { t: "side", s: side, rp: 1 } : { t: "side", s: side });
  if (u.searchParams.has("reset") || u.searchParams.has("resetpos")) { u.searchParams.delete("reset"); u.searchParams.delete("resetpos"); try { history.replaceState(null, "", u); } catch {} }
}
document.querySelectorAll("#side-pick button").forEach((btn) => btn.addEventListener("click", () => {
  sendSide(btn.dataset.side);
}));
// (owner, 2026-10-13) the minimap, always north up: the hexagon, your load circle, and every ship inside it as an
// arrow pointing the way it faces (friendlies, your side, blue; enemies red); a tick from yours for where the camera faces
const mm = document.getElementById("minimap"), mmx = mm && mm.getContext("2d");
let mmNext = 0;
// (owner, 2026-10-13) scrolling over the minimap zooms it (1x the whole hexagon, in until the load circle fills it), not the game
let mmZoom = 1; try { const z = +localStorage.getItem("atamus.mmZoom"); if (z >= 1 && z <= 100) mmZoom = z; } catch {}
// (owner) the closest zoom still shows the whole load circle inside the hexagon (its radius = the frame's inner radius)
const mmMaxZoom = (W) => { const Rv = (HEX_FLAT / 2) / Math.cos(Math.PI / 6), FR = W / 2 - 3; return Math.max(1, (FR * Math.cos(Math.PI / 6) - 2) / (LOAD_R * FR / Rv)); };
if (mm) mm.addEventListener("wheel", (e) => {
  e.preventDefault(); e.stopPropagation();
  mmZoom = Math.min(mmMaxZoom(mm.clientWidth), Math.max(1, mmZoom * (e.deltaY > 0 ? 1 / 1.25 : 1.25)));
  try { localStorage.setItem("atamus.mmZoom", String(mmZoom)); } catch {}
  mmNext = 0;
}, { passive: false });
function drawMinimap(now) {
  if (!mmx || now < mmNext) return; mmNext = now + 100;
  const dpr = Math.min(devicePixelRatio || 1, 2), W = mm.clientWidth, H = mm.clientHeight;
  if (mm.width !== Math.round(W * dpr)) { mm.width = Math.round(W * dpr); mm.height = Math.round(H * dpr); }
  mmx.setTransform(dpr, 0, 0, dpr, 0, 0); mmx.clearRect(0, 0, W, H);
  // (owner) zoom: the wheel over the minimap; zoomed in at all, your ship is at its center. The minimap keeps
  // its hexagon shape at every zoom (the map is drawn inside it); at 1x the frame is the map's own border.
  const Rv = (HEX_FLAT / 2) / Math.cos(Math.PI / 6), FR = W / 2 - 3, cx = W / 2, cy = H / 2;
  mmZoom = Math.min(mmZoom, mmMaxZoom(W));
  const k = FR / Rv * mmZoom;
  const cf = mmZoom > 1.001 ? 1 : 0, ox = haveMe ? me.x * cf : 0, oy = haveMe ? me.y * cf : 0;   // (owner) centered on your ship whenever it isn't fully zoomed out
  const P = (x, y) => [cx + (x - ox) * k, cy - (y - oy) * k];
  const hexPath = (R, at) => { mmx.beginPath(); for (let i = 0; i < 6; i++) { const t = (Math.PI / 3) * i, [X, Y] = at(Math.cos(t) * R, Math.sin(t) * R); i ? mmx.lineTo(X, Y) : mmx.moveTo(X, Y); } mmx.closePath(); };
  const frame = (x, y) => [cx + x, cy - y];
  hexPath(FR, frame); mmx.fillStyle = "rgba(10,14,22,0.85)"; mmx.fill();
  mmx.save(); hexPath(FR, frame); mmx.clip();
  if (mmZoom > 1.001) { hexPath(Rv, P); mmx.strokeStyle = "#8d96a6"; mmx.lineWidth = 1.5; mmx.stroke(); }   // (owner) zoomed in, the map's border in gray where it's in view, so a nearby edge shows
  // a ship's heading h faces three's (sin h, cos h) on x / z: on the map (north up) that's (sin h, cos h) in screen x / y
  const arrow = (x, y, h, col, r, ring) => {
    const [X, Y] = P(x, y), fx = Math.sin(h), fy = Math.cos(h);
    mmx.beginPath(); mmx.moveTo(X + fx * r * 1.6, Y + fy * r * 1.6);
    mmx.lineTo(X - fx * r + fy * r, Y - fy * r - fx * r); mmx.lineTo(X - fx * r * 0.4, Y - fy * r * 0.4); mmx.lineTo(X - fx * r - fy * r, Y - fy * r + fx * r);
    mmx.closePath(); mmx.fillStyle = col; mmx.fill();
    if (ring) { mmx.strokeStyle = "#ffffff"; mmx.lineWidth = 1; mmx.stroke(); }
  };
  if (haveMe) {
    const [X, Y] = P(me.x, me.y);
    mmx.strokeStyle = "rgba(111,143,184,0.8)"; mmx.lineWidth = 1; mmx.beginPath(); mmx.arc(X, Y, LOAD_R * k, 0, Math.PI * 2); mmx.stroke();
  }
  for (const p of players.values()) {
    if (p.id === myId || !p.side || !p.near) continue;
    if (haveMe && (Math.hypot(p.holder.position.x - me.x, -p.holder.position.z - me.y) > FAR_OUT || sightBlocked(me.x, me.y, p.holder.position.x, -p.holder.position.z))) continue;   // (owner) out of my line of sight
    arrow(p.holder.position.x, -p.holder.position.z, p.heading, mySide && p.side === mySide ? "#4f8fe8" : "#e04848", 3, false);
  }
  if (haveMe) {
    const [X, Y] = P(me.x, me.y), mine = players.get(myId);
    mmx.strokeStyle = "#ffffff"; mmx.lineWidth = 1.5; mmx.beginPath(); mmx.moveTo(X, Y); mmx.lineTo(X + Math.sin(camYaw) * 9, Y - Math.cos(camYaw) * 9); mmx.stroke();
    arrow(me.x, me.y, mine ? mine.heading : 0, "#4f8fe8", 4, true);
  }
  mmx.restore();
  hexPath(FR, frame); mmx.strokeStyle = "#4f8fe8"; mmx.lineWidth = 1.5; mmx.stroke();   // the frame
}
const $i = (id) => document.getElementById(id);
if ($i("helpers")) {
  $i("helpers").checked = helpers;
  $i("helpers").addEventListener("change", () => { helpers = $i("helpers").checked; try { localStorage.setItem("atamus.helpers", helpers ? "1" : "0"); } catch {} $i("helpers").blur(); });
}
// (owner, 2026-10-13, Foxhole-style) chat at the bottom right: tabs on top (All | World | Faction | Whisper: which lines
// show), the lines, then the input with its label "[Type] Name:" on the left. The tab picks what you read; the channel
// is where you type, and TAB while typing switches it (World -> Faction -> Whisper to the last person whispered -> World)
// without changing the tab, so you can read World and type to Faction. Picking a tab also points the channel at it (All
// leaves it). All whispers share the Whisper tab. A tab that gets a line while another is shown is marked. Enter sends
// (a phone's Go / Send too); Escape or an empty line closes it. "/whisper Name message" (quotes for names with spaces)
// whispers someone from anywhere. Right-clicking a name: Whisper, Report, and for staff Admin. Lines are inserted as text.
const chatLog = $i("chat-log"), chatIn = $i("chat-in"), chatTabs = $i("chat-tabs"), chatPre = $i("chat-pre"), ctxMenu = $i("ctx-menu");
const CHAT_MAX = 200;
const TABS = [["all", "All"], ["global", "World"], ["side", "Faction"], ["whisper", "Whisper"]];
const lines = [], unread = new Set();
let chatTab = "all", chatCh = "global", amStaff = false;
let lastWhisper = null;                        // { id, name }: the last person whispered (either way), where Whisper sends
const shows = (tab, m) => tab === "all" || m.sys && !m.ch || m.ch === tab;
function drawPrefix() {
  if (!chatPre) return;
  const tag = chatCh === "side" ? "Faction" : chatCh === "whisper" ? "Whisper " + (lastWhisper ? lastWhisper.name : "") : "World";
  chatPre.className = "chat-ch " + (chatCh === "side" ? "side " + (mySide === "red" ? "red" : "blue") : chatCh === "whisper" ? "whisper" : "world");
  chatPre.textContent = "[" + tag + "] " + (myName || "") + ":";
}
// (owner) the +/- at the far right of the tab row: collapses the lines to 2 rows, or back to 10 (kept in this browser)
const chatBox = $i("chat");
let chatSmall = false; try { chatSmall = localStorage.getItem("atamus.chatSmall") === "1"; } catch {}
if (chatBox) chatBox.classList.toggle("small", chatSmall);
function drawTabs() {
  if (!chatTabs) return;
  const size = document.createElement("button"); size.id = "chat-size"; size.textContent = chatSmall ? "+" : "\u2212";
  size.addEventListener("click", () => { chatSmall = !chatSmall; try { localStorage.setItem("atamus.chatSmall", chatSmall ? "1" : "0"); } catch {} if (chatBox) chatBox.classList.toggle("small", chatSmall); drawTabs(); if (chatLog) chatLog.scrollTop = chatLog.scrollHeight; });
  chatTabs.replaceChildren(...TABS.map(([k, label]) => {
    const b = document.createElement("button"); b.className = (k === chatTab ? "on" : "") + (unread.has(k) ? " new" : "");
    b.textContent = label; b.addEventListener("click", () => selectTab(k)); return b;
  }), size);
}
function drawLog() {
  if (!chatLog) return;
  chatLog.replaceChildren(...lines.filter((m) => shows(chatTab, m)).map(lineEl));
  chatLog.scrollTop = chatLog.scrollHeight;
}
function lineEl(m) {
  const line = document.createElement("div"); line.className = "chat-line";
  if (m.sys) { line.classList.add("sys"); line.textContent = m.text; return line; }
  const tag = document.createElement("span");
  tag.className = "chat-ch " + (m.ch === "side" ? "side " + (m.s === "red" ? "red" : "blue") : m.ch === "whisper" ? "whisper" : "world");
  tag.textContent = m.ch === "side" ? "[Faction] " : m.ch === "whisper" ? (m.i === myId ? "[To " + (m.withName || "?") + "] " : "[Whisper] ") : "[World] ";
  const who = document.createElement("span"); who.className = "chat-who " + (m.s === "red" ? "red" : "blue"); who.textContent = m.n + ": ";
  if (m.i && m.i !== myId) { who.dataset.id = m.i; who.dataset.name = m.n; }
  const txt = document.createElement("span"); txt.textContent = m.text;
  line.append(tag, who, txt); return line;
}
function selectTab(k) {
  chatTab = k; unread.delete(k);
  if (k === "global" || k === "side") chatCh = k; else if (k === "whisper" && lastWhisper) chatCh = "whisper";
  drawTabs(); drawLog(); drawPrefix();
}
function setWhisper(id, name) { lastWhisper = { id: String(id), name: name || "?" }; }
// TAB while typing: World -> Faction -> Whisper (when there's someone to whisper) -> World; the tab stays
function cycleChannel() {
  const chans = ["global", "side", ...(lastWhisper ? ["whisper"] : [])];
  chatCh = chans[(chans.indexOf(chatCh) + 1) % chans.length]; drawPrefix();
}
function openChat() { if (!chatIn) return; keys.clear(); sprint = false; chatIn.focus(); drawPrefix(); }
// sending: the form's submit, so a phone keyboard's Go / Send key works as well as Enter (owner)
function sendChat() {
  const raw = chatIn.value; chatIn.value = ""; chatIn.blur();
  const text = raw.trim(); if (!text) return;
  const wm = /^\/whisper\s+(?:"([^"]+)"|(\S+))\s+([\s\S]+)$/i.exec(text);
  if (wm) { send({ t: "chat", ch: "whisper", toName: wm[1] || wm[2], text: wm[3] }); return; }
  if (chatCh === "whisper") { if (lastWhisper) send({ t: "chat", ch: "whisper", to: lastWhisper.id, text: raw }); }
  else send({ t: "chat", ch: chatCh, text: raw });
}
const chatForm = $i("chat-form");
if (chatForm) chatForm.addEventListener("submit", (e) => { e.preventDefault(); sendChat(); });
// Android keyboards report Enter / Go with an empty e.code (only e.key or keyCode 13), and some send it as a line break
// in the input instead of a key at all: every one of those sends. (sendChat empties the box, so a second trigger for the
// same press finds nothing to send.)
if (chatIn) {
  chatIn.addEventListener("keydown", (e) => {
    if (e.code === "Escape" || e.key === "Escape") { chatIn.value = ""; chatIn.blur(); }
    else if (e.key === "Tab" || e.code === "Tab") { e.preventDefault(); cycleChannel(); }   // (owner) TAB switches the channel while typing
    else if (e.key === "Enter" || e.code === "Enter" || e.keyCode === 13) { e.preventDefault(); sendChat(); }
    e.stopPropagation();
  });
  chatIn.addEventListener("beforeinput", (e) => { if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") { e.preventDefault(); sendChat(); } });
}
function addChat(m) {
  if (m.ch === "sys") m = { sys: 1, text: m.text };   // (owner) a line from an admin action
  if (m.ch === "whisper") {
    if (m.sys) { m = { sys: 1, text: (m.withName || (lastWhisper && m.with === lastWhisper.id ? lastWhisper.name : "They")) + " is offline." }; }
    else { setWhisper(m.with, m.withName); if (m.i === myId && chatCh !== "whisper") chatCh = "whisper"; drawPrefix(); }
  }
  lines.push(m); if (lines.length > CHAT_MAX) lines.shift();
  if (shows(chatTab, m)) { if (chatLog) { chatLog.appendChild(lineEl(m)); while (chatLog.children.length > CHAT_MAX) chatLog.firstChild.remove(); chatLog.scrollTop = chatLog.scrollHeight; } }
  if (m.ch && m.i !== myId && chatTab !== "all") for (const [k] of TABS) if (k !== chatTab && k !== "all" && shows(k, m)) unread.add(k);   // (on All you see everything)
  drawTabs();
}
drawTabs();
// the right-click menu on a name
function hideMenu() { if (ctxMenu) ctxMenu.hidden = true; }
if (chatLog) chatLog.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const who = e.target.closest && e.target.closest(".chat-who[data-id]"); if (!who || !ctxMenu) return;
  const id = who.dataset.id, name = who.dataset.name;
  const item = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.addEventListener("click", () => { hideMenu(); fn(); }); return b; };
  ctxMenu.replaceChildren(item("Whisper", () => { setWhisper(id, name); chatCh = "whisper"; openChat(); }), item("Report", () => openReport(id, name)),
    ...(amStaff && window.AdminPanel ? [item("Admin", () => window.AdminPanel.act(id, name))] : []));   // (owner) the disciplinary panel
  ctxMenu.hidden = false;
  ctxMenu.style.left = Math.min(e.clientX, innerWidth - 120) + "px"; ctxMenu.style.top = Math.min(e.clientY, innerHeight - 100) + "px";
});
addEventListener("pointerdown", (e) => { if (ctxMenu && !ctxMenu.hidden && !ctxMenu.contains(e.target)) hideMenu(); }, true);
// reporting a player: a short note to the admins (their recent chat goes with it)
const reportBox = $i("report-box");
let reportFor = null;
function openReport(id, name) {
  if (!reportBox) return; reportFor = id;
  $i("report-title").textContent = "Report " + name; $i("report-text").value = ""; reportBox.hidden = false; keys.clear(); $i("report-text").focus();
}
if (reportBox) {
  $i("report-text").addEventListener("keydown", (e) => { e.stopPropagation(); if (e.code === "Escape") reportBox.hidden = true; });
  $i("report-cancel").addEventListener("click", () => { reportBox.hidden = true; });
  $i("report-send").addEventListener("click", () => {
    const text = $i("report-text").value.trim(); if (!text || !reportFor) return;
    send({ t: "report", i: reportFor, text }); reportBox.hidden = true;
  });
}
// for the test harness and the console
window.Atamus = { get focus() { return { x: focus.x, y: focus.y }; }, get me() { return { ...me, id: myId }; }, get players() { return [...players.keys()]; }, get near() { return [...players.values()].filter((p) => p.near).map((p) => p.id); }, get ws() { return ws; }, get view() { return viewDist; }, get aim() { return aimLine.visible ? { x: aimHit.x, z: aimHit.z } : null; }, get builds() { return [...builds.values()].map((b) => ({ id: b.id, k: b.k, x: Math.round(b.x), y: Math.round(b.y), w: b.w, d: b.d, r: b.r })); }, get blocks() { return [...blocks].map(([id, b]) => ({ id, x: b.x, y: b.y })); }, get drawn() { return [...players.values()].map((p) => ({ id: p.id, x: p.holder.position.x, z: p.holder.position.z, h: p.heading, vis: p.holder.visible })); } };
