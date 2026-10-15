// Atamus 3D (owner, 2026-10-12): the game rebuilt in 3D. One flat world with a 2D
// grid; the border is the same flat-top hexagon, 5 miles flat to flat. Each player is
// a 100 m sphere (yours blue, others red) that travels on the ground plane only — no
// up or down. WASD moves it; wherever the camera faces is forward. The middle mouse
// (touch: a one-finger drag) rotates the camera around the player; it sits at a 75°
// angle looking down toward the player. Each player is sent everything within their load circle.
import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { initBuild, builds, colliders, pivots, origins, movers, visOutlines, VIS_DEFAULT, toWorldPts, buildPolys, movePoly, polyRad, satPush, nudge, squarePoly, segPoly } from "./build3d.js?v=1792039259";

// (owner) returning players come through the log-in page first (live site only)
if (typeof needLogin === "function" && needLogin()) location.replace("login.html");

const statusEl = document.getElementById("status");
const countEl = document.getElementById("countdown");
const WEB_BUILD = (document.querySelector('meta[name="atamus-build"]') || {}).content || "";

// ---- world constants (the server's hello can override them) ----
let HEX_FLAT = 2_500;                          // 2.5 km flat to flat for now (owner; the server sends it in the hello)
let SPHERE_R = 50;                             // 100 m diameter
let SPEED = 50;                               // m/s (owner, 2026-10-13; the server sends it in the hello)
let ACCEL = 50, BRAKE = 100, TURN_ACCEL = 0.3;   // (owner) weight: as on the server (world3d.js)
let SIDE_SPEED = 0.6, FWD_ARC = Math.PI / 4;   // (owner) forward 100%, sideways / backward 60% (blended); sprint only within FWD_ARC of the nose
const dirSpeed = (d) => SIDE_SPEED + (1 - SIDE_SPEED) * Math.max(0, Math.cos(d));
let STOP_D = 25, brakeA = 0, SPRINT = 1.3;   // SPRINT: (owner) sprint is 30% faster                  // (owner) a stop always ends within STOP_D: the rate is fixed when WASD is let go (as on the server)
const stopRate = (v) => brakeA || Math.max(BRAKE, (v * v) / (2 * STOP_D));
// (owner, 2026-10-13: reversing while moving was far slower than stopping and then going) one step of the velocity
// toward the target (tx, ty): the part of the change that SLOWS the current motion (against the velocity) brakes at
// up to `brake`; the rest (the new direction) thrusts at up to `a`. Reversing then works like letting go and pushing.
let VEL_TURN = 0.875;                             // (owner) as on the server (world3d.js); the hello sends it
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
  // (owner, 2026-10-14) with ship-relative controls, pushing more than 120 degrees against the motion (S while flying
  // forward) brakes it and then builds up the other way, instead of swinging the motion round in a long U-turn
  if (left > Math.PI * 2 / 3 && v > 1) return steer(vx, vy, Math.sin(want) * target, -Math.cos(want) * target, up, down, dt);
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
// (owner, 2026-10-13) colliders, on the ground plane only (x / y; height is ignored). A ship's footprint is SHIP_R x 2
// square (its Movement ellipse is a fraction of that, Object Editor); each block a square BLOCK_HALF from its center.
// Overlaps are pushed apart along the shortest way (satPush) and the velocity going in is dropped. Mirrored in the client.
let SHIP_R = 45, BLOCK_HALF = 25;   // (the server sends both in the hello)
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
// (owner, 2026-10-14: speed) MSAA edge smoothing only on ordinary screens; a high-DPI screen's pixels are fine enough without it
const renderer = new THREE.WebGLRenderer({ canvas, antialias: (devicePixelRatio || 1) < 1.25, stencil: true });   // (stencil: the flat shadows mark each pixel once)
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));   // (owner, 2026-10-14: speed) at most 1.5 pixels per screen pixel
const scene = new THREE.Scene();
// (owner, 2026-10-14) deep blue space under the field grid (was dark charcoal)
const SPACE = 0x081538;
scene.background = new THREE.Color(SPACE);
scene.fog = new THREE.Fog(SPACE, 3000, 14000);
scene.add(new THREE.HemisphereLight(0x8fa7c8, 0x10141c, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(3000, 5000, 2000); scene.add(sun);

const camera = new THREE.PerspectiveCamera(60, 1, 5, 30000);
let camYaw = 0;                                // around the player
// camera settings: pitch, min / max zoom, rotation speed
// (owner, 2026-10-13) the wheel zooms in from 600 m down to 200 m (never out past 600); the wheel does nothing while
// aiming, and aiming keeps the wheel zoom inside the dead zone (owner, 2026-10-14)
const cam = { pitch: 60, zmin: 200, zmax: 600, rot: 0.6, leash: 700, over: 100, dead: 300,
  dir: { n: 200, ne: 0, e: 200, se: 0, s: 200, sw: 0, w: 200, nw: 0 } };   // (owner) leash: the reticle's max distance (the blue circle);
// over: the base overflow; dir: the per-direction overflow delta (m). Fixed values (the sliders are gone).
let camDist = cam.zmax, aimExt = 0;   // aimExt: 0-1, the camera reaching out past the aim dead zone (eased)


// (owner, 2026-10-14) the space background (from the owner's reference): a deep blue field with soft cyan glows, very far
// below the grid so it drifts slowest of all as you move. A big plane that follows the camera; its pattern is fixed in
// the world (stretched noise, so the glows run in soft diagonal bands).
// (owner, 2026-10-14) stars far below the grid: thin points that drift slower than the grid as you move (they're deeper),
// each slowly dimming in and out on its own. They tile around the camera so the field never runs out.
const STAR_T = 24000, STAR_N = 6000;
{
  const pos = new Float32Array(STAR_N * 3), ph = new Float32Array(STAR_N), sp = new Float32Array(STAR_N), br = new Float32Array(STAR_N), sz = new Float32Array(STAR_N), hu = new Float32Array(STAR_N);
  for (let i = 0; i < STAR_N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * STAR_T; pos[i * 3 + 1] = -1500 - Math.random() * 4500; pos[i * 3 + 2] = (Math.random() - 0.5) * STAR_T;
    ph[i] = Math.random() * Math.PI * 2; sp[i] = 0.15 + Math.random() * 0.45; br[i] = 0.35 + Math.random() * 0.65;
    sz[i] = Math.random() < 0.03 ? 2.2 + Math.random() * 1.5 : 0.8 + Math.random() * 0.7;   // (owner) thin, a few bigger ones that glow
    hu[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("ph", new THREE.BufferAttribute(ph, 1)); g.setAttribute("sp", new THREE.BufferAttribute(sp, 1));
  g.setAttribute("br", new THREE.BufferAttribute(br, 1)); g.setAttribute("sz", new THREE.BufferAttribute(sz, 1)); g.setAttribute("hu", new THREE.BufferAttribute(hu, 1));
  var starT = { value: 0 };
  const m = new THREE.ShaderMaterial({
    uniforms: { uT: starT, tile: { value: STAR_T }, pr: { value: Math.min(devicePixelRatio || 1, 2) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float ph; attribute float sp; attribute float br; attribute float sz; attribute float hu; uniform float uT, tile, pr; varying float vA; varying vec3 vC; varying float vS;
      void main() {
        vec3 p = position; p.xz += tile * floor((cameraPosition.xz - p.xz) / tile + 0.5);   // the copy of the tile nearest the camera
        float tw = 0.5 + 0.5 * sin(uT * sp + ph); vA = br * (0.15 + 0.85 * tw * tw);
        vC = hu < 0.6 ? vec3(0.88, 0.93, 1.0) : hu < 0.8 ? vec3(0.55, 0.75, 1.0) : hu < 0.92 ? vec3(0.5, 0.95, 1.0) : vec3(1.0, 0.82, 0.5);   // white, blue, cyan, a few gold
        vS = sz; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); gl_PointSize = (sz > 2.0 ? sz * 3.0 : sz) * pr;   // the big ones get room for a glow
      }`,
    fragmentShader: `varying float vA; varying vec3 vC; varying float vS;
      void main() { float d = length(gl_PointCoord - 0.5);
        float a = vS > 2.0 ? vA * (smoothstep(0.17, 0.05, d) + 0.45 * smoothstep(0.5, 0.0, d) * smoothstep(0.5, 0.0, d)) : vA * smoothstep(0.5, 0.15, d);
        if (a < 0.01) discard; gl_FragColor = vec4(vC * a, a); }`,
  });
  const stars = new THREE.Points(g, m); stars.frustumCulled = false; stars.renderOrder = -2; scene.add(stars);
}

// the hexagon border: a flat glowing band on the ground (flat edges top and bottom, points east and west)
function hexShapeBand() {
  const pts = (r) => { const a = r / Math.cos(Math.PI / 6); const out = []; for (let i = 0; i < 6; i++) { const t = (Math.PI / 3) * i; out.push(new THREE.Vector2(Math.cos(t) * a, Math.sin(t) * a)); } return out; };
  const shape = new THREE.Shape(pts(HEX_FLAT / 2));
  shape.holes.push(new THREE.Path(pts(HEX_FLAT / 2 - 25).reverse()));
  const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4f8fe8, transparent: true, opacity: 0.9, depthWrite: false }));
}
let border = hexShapeBand(); border.position.y = 1.5; border.renderOrder = 3; scene.add(border);   // (owner, 2026-10-14) drawn over the haze
function rebuildBorder() { scene.remove(border); border.geometry.dispose(); border = hexShapeBand(); border.position.y = 1.5; border.renderOrder = 3; scene.add(border); }   // when the hello changes the size

// (owner, 2026-10-13) the load circle: the server sends only the players and objects within LOAD_R of this ship
// (2026-10-14: where the distance haze turns solid). Shown on the minimap; no ring on the ground (it'd sit under the haze).
let LOAD_R = 1300;
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
// (owner, 2026-10-14) the aim cone: from my ship toward the reticle, as wide as the spread now (a line when it's 0)
const coneGeo = new THREE.BufferGeometry(); coneGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
const coneEdgeGeo = new THREE.BufferGeometry(); coneEdgeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
const coneEdges = new THREE.LineSegments(coneEdgeGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
cone.frustumCulled = coneEdges.frustumCulled = false; cone.visible = coneEdges.visible = false; cone.renderOrder = coneEdges.renderOrder = 2; scene.add(cone, coneEdges);
const raycaster = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), aimHit = new THREE.Vector3();

// ---- players: the ship (owner, 2026-10-12: Combat_Cruiser.glb, Y up, +Z forward) ----
// Scaled to 100 m long, resting on the grid, facing the way it travels. Until the
// model arrives, a sphere stands in and is swapped the moment it loads.
const sphereGeo = new THREE.SphereGeometry(SPHERE_R, 48, 32);
const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x4f8fe8, roughness: 0.35, metalness: 0.15 });
const players = new Map();                     // id -> { holder, heading, name, from:{x,y,ts}, to:{x,y,ts} }
let myId = null, myName = "", mySide = null;
const me = { x: 0, y: 0 };                     // my ship, predicted locally and corrected by snapshots
const corr = { x: 0, y: 0 };                   // the correction still to work off (a little each frame)
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
  for (const p of players.values()) { p.holder.clear(); p.holder.add(makeVisual(p.id !== myId, p.id === myId)); }
  try { build.refreshShips(); } catch {}
  applyShipPivot();   // the Build menu's test ships
}, undefined, (e) => console.warn("[ship] load failed:", e && e.message));
function makeVisual(remote, own = false) {     // own: my ship (its own materials too, for materializing; always solid otherwise)
  const v = shipTemplate ? shipTemplate.clone(true) : (() => { const m = new THREE.Mesh(sphereGeo, fallbackMat); m.position.y = SPHERE_R; return m; })();
  if (remote || own) {                          // (owner, 2026-10-14) each other ship has its own material copies: its opacity is its visibility
    const va = { value: remote ? 0 : 1 }, mats = [], mine = new Map(), sp = { p: { value: new THREE.Vector4() }, k: { value: 1 }, s: { value: 1 } };
    v.userData.va = remote ? va : null; v.userData.sp = sp; v.userData.mats = mats; if (remote) v.visible = false;   // (fades in once its visibility is known)
    const one = (m) => { if (!mine.has(m)) { const c = losMat(m, va, sp); mine.set(m, c); mats.push(c); } return mine.get(m); };
    v.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material); });
  }
  return v;
}

// ---- (owner, 2026-10-13) line of sight: other ships are drawn only where my ship's center can see them ----
// On the ground plane (height ignored, like the colliders): each block and Build piece (and nebula core) casts a shadow
// away from my ship's center. (owner, 2026-10-14) The shadows are drawn straight onto the ground as a flat 50% black (no
// texture); the stencil buffer marks each pixel once, so overlapping shadows don't get darker.
const VIS_S = 1400;                            // shadows are worked out for objects within this of me (past ~1,300 m is solid haze anyway)
const visGeo = new THREE.BufferGeometry(); let visCap = 0;
const visMesh = new THREE.Mesh(visGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
  stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
visMesh.frustumCulled = false; visMesh.position.y = 0.3; visMesh.renderOrder = -1; scene.add(visMesh);
// (owner, 2026-10-14) sight fades out past the leash circle: the haze ramps from clear at FAR_IN to solid at FAR_OUT
// (400 m further), and nothing past FAR_OUT is drawn (ships, blocks, Build pieces)
const FAR_IN = cam.leash + 200, FAR_OUT = FAR_IN + 400;   // (owner, 2026-10-14) the fade starts 200 m (two grid squares) past the leash circle
const visU = { visC: { value: new THREE.Vector2() }, visFar: { value: FAR_OUT } };
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
// (owner, 2026-10-14) a ship materializing after a respawn: a cyan hologram revealed from its nose to its tail (spK 0..1),
// a bright line at the reveal's edge and drifting scan bands, then it solidifies into the real ship (spS 0..1)
const SP_HALF = 60;                            // how far the reveal runs ahead of / behind the pivot along the ship
function losMat(m, va, sp) {                   // a copy of a ship material: not drawn past the sight limit, and see-through by va (its visibility)
  const c = m.clone();
  c.onBeforeCompile = (sh) => {
    sh.uniforms.visC = visU.visC; sh.uniforms.visFar = visU.visFar; sh.uniforms.visA = va;
    sh.uniforms.spP = sp.p; sh.uniforms.spK = sp.k; sh.uniforms.spS = sp.s; sh.uniforms.spT = skyT;
    sh.vertexShader = "varying vec3 vVisW;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n  vVisW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = "uniform vec2 visC; uniform float visFar; uniform float visA; uniform vec4 spP; uniform float spK; uniform float spS; uniform float spT; varying vec3 vVisW;\n" + sh.fragmentShader
      .replace("void main() {", "void main() {\n  if (length(vec2(vVisW.x, -vVisW.z) - visC) > visFar) discard;\n  float spAl = dot(vVisW.xz - spP.xy, spP.zw), spCut = mix(" + SP_HALF + ".0, -" + SP_HALF + ".0, spK);\n  if (spK < 1.0 && spAl < spCut) discard;")
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>
  if (spS < 1.0) {
    float scan = 0.7 + 0.3 * sin(vVisW.y * 1.6 - spT * 7.0) * sin(spAl * 0.35 + spT * 3.0);
    float edge = spK < 1.0 ? smoothstep(9.0, 0.0, spAl - spCut) : 0.0;
    gl_FragColor.rgb = mix(vec3(0.3, 0.82, 1.0) * scan, gl_FragColor.rgb, spS) + vec3(0.7, 0.97, 1.0) * edge * (1.0 - spS);
    gl_FragColor.a *= mix(0.5 + 0.5 * edge, 1.0, spS);
  }
  gl_FragColor.a *= visA;`);
  };
  c.customProgramCacheKey = () => "losA";
  return c;
}
const skyT = { value: 0 };
// (owner, 2026-10-14) for speed the noise is worked out once, at start, into a 1024 x 1024 texture that tiles seamlessly
// (r: marbled clouds, g / b: two plain cloud noises, a: marbling for the glows); the sky layers and the haze only look it
// up. Before, every pixel ran several layers of noise every frame, which made the game crawl.
const noiseTex = (() => {
  const rt = new THREE.WebGLRenderTarget(1024, 1024, { depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const m = new THREE.ShaderMaterial({
    vertexShader: "varying vec2 vU; void main() { vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `varying vec2 vU;
      vec2 hash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0; }
      vec2 hw(vec2 i, float per) { return hash2(mod(i, per)); }   // the lattice wraps, so the texture tiles
      float gn(vec2 p, float per) { vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        return mix(mix(dot(hw(i, per), f), dot(hw(i + vec2(1.0, 0.0), per), f - vec2(1.0, 0.0)), u.x),
                   mix(dot(hw(i + vec2(0.0, 1.0), per), f - vec2(0.0, 1.0)), dot(hw(i + vec2(1.0, 1.0), per), f - vec2(1.0, 1.0)), u.x), u.y); }
      float fbm(vec2 p, float per) { float v = 0.0, a = 0.55; for (int k = 0; k < 5; k++) { v += a * gn(p, per); p = p * 2.0 + 17.0; per *= 2.0; a *= 0.5; } return 0.5 + 0.5 * v; }
      float marble(vec2 p, float per) { vec2 q = vec2(fbm(p, per), fbm(p + vec2(5.0, 1.0), per)); return fbm(p + 3.2 * q, per); }
      void main() { vec2 p = vU * 4.0;
        gl_FragColor = vec4(marble(p, 4.0), fbm(p + 13.0, 4.0), fbm(p + 51.0, 4.0), marble(p + 31.0, 4.0)); }`,
  });
  const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
  renderer.setRenderTarget(rt); renderer.render(sc, new THREE.OrthographicCamera()); renderer.setRenderTarget(null);
  m.dispose(); return rt.texture;
})();
// (owner, 2026-10-14) the colored space in three parallax layers (a deep blue base at -9,000 m, cyan glows at -6,000 m,
// faint blue wisps at -3,500 m). For speed it's one plane: each pixel finds where its line of sight crosses each layer's
// depth and adds the three up, so they still slide past each other as you move. Pixels behind the solid haze are skipped.
const sky = new THREE.Mesh(new THREE.PlaneGeometry(200000, 200000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: { uT: skyT, nt: { value: noiseTex }, visC: visU.visC, visFar: visU.visFar }, depthWrite: false,
  vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
  fragmentShader: `uniform float uT; uniform sampler2D nt; uniform vec2 visC; uniform float visFar; varying vec3 vW;
    vec2 at(float y) { vec3 c = cameraPosition; float t = (c.y - y) / (c.y - vW.y); return vec2(c.x + (vW.x - c.x) * t, -(c.z + (vW.z - c.z) * t)); }
    void main() {
      if (length(at(0.0) - visC) > visFar + 60.0) discard;   // behind the solid haze anyway
      vec2 g = at(-9000.0);
      float n = texture2D(nt, g / 56000.0 + vec2(uT * 0.00003, 0.0)).r, dust = smoothstep(0.42, 0.62, texture2D(nt, g / 36000.0 + 0.37).g);
      float dark = smoothstep(0.32, 0.58, texture2D(nt, g / 80000.0 + 0.71).b);
      vec3 col = mix(vec3(0.012, 0.035, 0.11), vec3(0.03, 0.17, 0.48), smoothstep(0.4, 0.72, n));
      col = mix(col, vec3(0.09, 0.38, 0.8), smoothstep(0.64, 0.87, n) * 0.6);
      col *= 1.0 - 0.55 * dust * smoothstep(0.45, 0.75, n);
      col *= 0.6 + 0.4 * dark;
      col += vec3(0.07, 0.4, 0.72) * pow(smoothstep(0.55, 0.9, texture2D(nt, at(-6000.0) / 36000.0 + vec2(0.31, -uT * 0.00004)).a), 2.0);   // cyan glows
      col += vec3(0.025, 0.11, 0.29) * smoothstep(0.55, 0.9, texture2D(nt, at(-3500.0) / 20000.0 + vec2(0.77 + uT * 0.0001, 0.5)).r);    // wisps
      gl_FragColor = vec4(col, 1.0);   // (screen colors, no conversion)
    }`,
}));
sky.position.y = -9000; sky.renderOrder = -5; sky.frustumCulled = false; sky.layers.set(3); scene.add(sky);
// (owner, 2026-10-14: speed) the colored space is smooth (its patterns span kilometers), so it's drawn into a picture a
// sixth the screen's size each frame (owner: halved again from a third; a 36th of the pixels) and stretched behind
// everything; the stars stay sharp.
const SKY_DIV = 6, skyRT = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false });
const skyBack = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { t: { value: skyRT.texture } }, depthTest: false, depthWrite: false,
  vertexShader: "varying vec2 vU; void main() { vU = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }",
  fragmentShader: "uniform sampler2D t; varying vec2 vU; void main() { gl_FragColor = vec4(texture2D(t, vU).rgb, 1.0); }",
}));
skyBack.frustumCulled = false; skyBack.renderOrder = -10; scene.add(skyBack);
const skySz = new THREE.Vector2();
function renderSky() {
  renderer.getDrawingBufferSize(skySz); const w = Math.max(2, Math.ceil(skySz.x / SKY_DIV)), h = Math.max(2, Math.ceil(skySz.y / SKY_DIV));
  if (skyRT.width !== w || skyRT.height !== h) skyRT.setSize(w, h);
  camera.layers.set(3); renderer.setRenderTarget(skyRT); renderer.clear(); renderer.render(scene, camera);   // (cleared to the space color)
  renderer.setRenderTarget(null); camera.layers.set(0);
}
// (owner, 2026-10-13) the grid, the haze past the map's edge and the fade into solid haze far out: one layer just above the
// ground, following my ship (the shadows themselves are their own flat shapes, above)
const shadeHex = { value: HEX_FLAT / 2 };   // (owner) everything past the map's edge gets it too
const shadeMat = new THREE.ShaderMaterial({
  uniforms: { ...visU, hexA: shadeHex, farIn: { value: FAR_IN }, gline: { value: new THREE.Vector3(0x46 / 255, 0x46 / 255, 0x4c / 255) } }, transparent: true, depthWrite: false,   // (gline: screen color)
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
  fragmentShader: `uniform vec2 visC; uniform float hexA; uniform float farIn; uniform float visFar; uniform vec3 gline; varying vec3 vW;
    void main() {
      vec2 g = vec2(vW.x, -vW.z); float lit = 1.0;
      float ed = max(abs(g.y), max(abs(1.7320508 * g.x + g.y), abs(1.7320508 * g.x - g.y)) * 0.5) - hexA;   // past the hexagon's edge
      lit = min(lit, 1.0 - smoothstep(0.0, 30.0, ed));
      float far = smoothstep(farIn, visFar, length(g - visC));   // (owner) clear at the leash circle, solid 400 m past it
      // (owner) the grid: soft gray 100 m lines (space shows between them), drawn here under the haze
      vec2 gc = vW.xz / 100.0, gg = abs(fract(gc - 0.5) - 0.5) / fwidth(gc);
      float ga = (1.0 - min(min(gg.x, gg.y), 1.0)) * 0.85;
      if (lit > 0.99 && far <= 0.0) { if (ga < 0.003) discard; gl_FragColor = vec4(gline, ga); return; }
      vec3 col = vec3(0.0);                   // (owner, 2026-10-14) a flat, see-through black (was a drifting dusty texture)
      float ha = mix(0.55 * (1.0 - lit), 1.0, far), oa = ha + ga * (1.0 - ha);   // the haze over the grid
      gl_FragColor = vec4((col * ha + gline * ga * (1.0 - ha)) / max(oa, 1e-4), oa);
    }`,
});
const shade = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), shadeMat);   // (also the grid)
shade.position.y = 0; shade.renderOrder = -1; shade.frustumCulled = false; scene.add(shade);
function inPoly(x, y, v) { let c = false; for (let i = 0, n = v.length; i < n; i += 2) { const ax = v[i], ay = v[i + 1], bx = v[(i + 2) % n], by = v[(i + 3) % n]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; }
function edgeDist(x, y, v) { let best = Infinity; for (let i = 0, n = v.length; i < n; i += 2) { const ax = v[i], ay = v[i + 1], ex = v[(i + 2) % n] - ax, ey = v[(i + 3) % n] - ay, L2 = ex * ex + ey * ey || 1e-9; const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L2)); best = Math.min(best, Math.hypot(x - ax - ex * t, y - ay - ey * t)); } return best; }
// (owner, 2026-10-14) a cloud's thick core (CLOUD_DEEP and more in from its edge, where ships can't be seen) blocks sight like
// a wall (150 m and more in, owner): it casts a shadow from its far side and cuts visibility lines, so nobody sees through a nebula to the other
// side. Its outline is traced once per shape (a grid of distances to the edge, then the 150 m contour), as one or more
// loops. While I'm inside a cloud (anywhere in it), that cloud doesn't block my sight at all; other clouds still do.
function cloudCores(b) {
  const key = b.poly.join(","); if (b._ck === key) return b._cores;
  const v = b.poly, D = CLOUD_DEEP; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < v.length; i += 2) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1]); }
  const cs = Math.max(10, Math.max(x1 - x0, y1 - y0) / 160), nx = Math.ceil((x1 - x0) / cs) + 3, ny = Math.ceil((y1 - y0) / cs) + 3, ox = x0 - cs, oy = y0 - cs;
  const F = (x, y) => (inPoly(x, y, v) ? edgeDist(x, y, v) : -edgeDist(x, y, v)) - D;
  const val = new Float32Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[j * nx + i] = (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) ? -1 : F(ox + i * cs, oy + j * cs);
  const V = (i, j) => val[j * nx + i], pts = new Map(), adj = new Map();
  const pt = (k, ax, ay, va, bx, by, vb) => { if (!pts.has(k)) { const t = va / (va - vb); pts.set(k, [ax + (bx - ax) * t, ay + (by - ay) * t]); } return k; };
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = V(i, j), b2 = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1), m = (a > 0) | ((b2 > 0) << 1) | ((c > 0) << 2) | ((d > 0) << 3);
    if (m === 0 || m === 15) continue;
    const X = ox + i * cs, Y = oy + j * cs;
    const B = () => pt("h" + i + "," + j, X, Y, a, X + cs, Y, b2), R = () => pt("v" + (i + 1) + "," + j, X + cs, Y, b2, X + cs, Y + cs, c);
    const T = () => pt("h" + i + "," + (j + 1), X, Y + cs, d, X + cs, Y + cs, c), L = () => pt("v" + i + "," + j, X, Y, a, X, Y + cs, d);
    const ctr = (a + b2 + c + d) / 4 > 0;
    switch (m) {
      case 1: case 14: link(L(), B()); break; case 2: case 13: link(B(), R()); break; case 3: case 12: link(L(), R()); break;
      case 4: case 11: link(R(), T()); break; case 6: case 9: link(B(), T()); break; case 7: case 8: link(L(), T()); break;
      case 5: if (ctr) { link(B(), R()); link(T(), L()); } else { link(L(), B()); link(R(), T()); } break;
      case 10: if (ctr) { link(L(), B()); link(R(), T()); } else { link(B(), R()); link(T(), L()); } break;
    }
  }
  const out = [], used = new Set();
  for (const start of adj.keys()) {
    if (used.has(start)) continue;
    const loop = []; let prev = null, cur = start;
    while (cur && !used.has(cur)) { used.add(cur); loop.push(pts.get(cur)); const n = adj.get(cur); const nxt = n.find((k) => k !== prev && !used.has(k)); prev = cur; cur = nxt; }
    let L2 = loop;                             // thin out points that sit on a straight run
    for (let pass = 0; pass < 3 && L2.length > 3; pass++) L2 = L2.filter((p, k) => { const a = L2[(k + L2.length - 1) % L2.length], c = L2[(k + 1) % L2.length], ex = c[0] - a[0], ey = c[1] - a[1], l = Math.hypot(ex, ey) || 1; return k % 2 === 1 || Math.abs((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / l > 1.5; });
    if (L2.length < 3) continue;
    const flat = L2.flat(); let cx0 = Infinity, cy0 = Infinity, cx1 = -Infinity, cy1 = -Infinity;
    for (const [x, y] of L2) { cx0 = Math.min(cx0, x); cx1 = Math.max(cx1, x); cy0 = Math.min(cy0, y); cy1 = Math.max(cy1, y); }
    out.push({ v: flat, x0: cx0, x1: cx1, y0: cy0, y1: cy1 });
  }
  b._ck = key; b._cores = out; return out;
}
// the cloud cores that block my sight now
function* coresFor(vx, vy) { for (const b of builds.values()) if (b.k === "cloud" && b.poly && !inPoly(vx, vy, b.poly)) yield* cloudCores(b); }   // (owner) not the cloud I'm in
let visVer = 0, visKey = "";                    // visVer: bumped whenever a block or Build piece changes
function updateVis() {                         // the shadows from where my ship is now
  shade.position.x = me.x; shade.position.z = -me.y; shade.visible = visMesh.visible = haveMe; shadeHex.value = HEX_FLAT / 2;
  // (owner, 2026-10-14: speed) the shadows are only worked out again when my ship has moved or an object changed
  // (speed: worked out again after a meter of movement)
  const key = Math.round(me.x) + "," + Math.round(me.y) + "," + visVer; if (key === visKey) return; visKey = key;
  const vx = me.x, vy = me.y, F = VIS_S * 4, pos = [];
  // (owner, 2026-10-14) shadows start behind the outline, wherever the line of sight can't reach: only the edges facing
  // away from me cast, so the object itself and the ground up to its far side stay clear
  const back = (v, i, sg) => { const ax = v[i], ay = v[i + 1], bx = v[(i + 2) % v.length], by = v[(i + 3) % v.length];
    return ((by - ay) * ((ax + bx) / 2 - vx) - (bx - ax) * ((ay + by) / 2 - vy)) * sg > 0; };
  const turn = (v) => { let a = 0; for (let i = 0; i < v.length; i += 2) a += v[i] * v[(i + 3) % v.length] - v[(i + 2) % v.length] * v[i + 1]; return a >= 0 ? 1 : -1; };
  const edges = (v) => {                       // v: an outline [x0, y0, x1, y1, ...]; each far-side edge's shadow quad
    const sg = turn(v);
    for (let i = 0; i < v.length; i += 2) {
      if (!back(v, i, sg)) continue;
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
  // (owner, 2026-10-14) ships cast no shadows (only blocks and Build pieces do)
  for (const b of builds.values()) if (b.k !== "ship" && b.k !== "cloud" && Math.abs(b.x - vx) <= VIS_S + b.srad && Math.abs(b.y - vy) <= VIS_S + b.srad) for (const v of b.polys) edges(v);
  for (const c of coresFor(vx, vy)) if (c.x1 >= vx - VIS_S && c.x0 <= vx + VIS_S && c.y1 >= vy - VIS_S && c.y0 <= vy + VIS_S) edges(c.v);   // (owner) nebula cores
  if (pos.length > visCap) { visCap = Math.max(pos.length, visCap * 2, 1800); visGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(visCap), 3)); }
  const pa = visGeo.attributes.position; if (pa) { pa.array.set(pos); pa.needsUpdate = true; } visGeo.setDrawRange(0, pos.length / 3);
  visU.visC.value.set(vx, vy);
}
// ---- (owner, 2026-10-14) mutual visibility: if a player can see you, you can see them, and the less of each other you
// can see, the more see-through you are to each other. Each ship's Visibility points (placed in the Object Editor; at most
// 32); lines from each of theirs to my pivot and from each of
// mine to their pivot; the share of those lines no block or Build piece cuts is the visibility, the same both ways. A ship is drawn whole at that
// opacity (fading over about 0.2 s), and on the minimap the same; at 0 it's hidden. Worked out ten times a second. ----
const asPts = (v) => { const out = []; for (let i = 0; i < v.length; i += 2) out.push([v[i], v[i + 1]]); return out; };
const walls = () => {                          // everything that blocks sight, with a bounding box each
  const out = [], h = BLOCK_HALF;
  for (const b of blocks.values()) out.push({ v: [b.x - h, b.y - h, b.x + h, b.y - h, b.x + h, b.y + h, b.x - h, b.y + h], x0: b.x - h, x1: b.x + h, y0: b.y - h, y1: b.y + h });
  for (const b of builds.values()) if (b.k !== "ship" && b.k !== "cloud") for (const v of b.polys) out.push({ v, x0: b.x - b.srad, x1: b.x + b.srad, y0: b.y - b.srad, y1: b.y + b.srad });
  if (haveMe) for (const c of coresFor(me.x, me.y)) out.push(c);   // (owner) nebula cores
  return out;
};
const VIS_LO = 0.25, VIS_HI = 0.75;          // (owner) the visibility at which a ship starts to show / is fully solid
const visTargets = new Map();                  // ship visual -> { a: visibility now, lines: [[x0, y0, x1, y1, clear]] }
let visAt = 0;
// (owner, 2026-10-14) the lines run from each of one ship's points to the other ship's pivot, and from each of the other's
// points to this one's pivot; the share of all of them that's clear is the pair's visibility
// (owner, 2026-10-14) the line between the two pivots counts for PIV_W of the visibility; the points' lines share the rest
const PIV_W = 0.2;
function mutual(A, pa, B, pb, W, keepLines) {  // A, B: point lists; pa, pb: their pivots; W: walls
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of A.concat(B)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const near = W.filter((w) => w.x1 >= x0 && w.x0 <= x1 && w.y1 >= y0 && w.y0 <= y1), lines = keepLines ? [] : null;
  let clear = 0;
  const test = (ax, ay, bx, by, show) => { let ok = true; for (const w of near) if (segPoly(ax, ay, bx, by, w.v) !== null) { ok = false; break; } if (lines && show) lines.push([ax, ay, bx, by, ok]); return ok; };   // show: drawn in the editor (owner: only their lines to my pivot, and the pivot line)
  const piv = test(pa[0], pa[1], pb[0], pb[1], true) ? PIV_W : 0;
  for (const [ax, ay] of A) if (test(ax, ay, pb[0], pb[1], false)) clear++;
  for (const [bx, by] of B) if (test(bx, by, pa[0], pa[1], true)) clear++;
  return { f: piv + (1 - PIV_W) * clear / Math.max(1, A.length + B.length), lines };
}
// (owner, 2026-10-14) nebula clouds hide ships inside them.
// A ship in a cloud fades from solid at the edge to invisible 150 m in (and deeper: the core), for everyone. If I'm in the
// same cloud within 200 m of it, it shows at least at 25% while it moves (or for a moment after I hit it); still, it
// gets only the edge fade (so in the core it's invisible).
const CLOUD_DEEP = 150, CLOUD_IN = 0.25, CLOUD_NEAR = 200, STILL = 3, REVEAL_MS = 3000;
const revealed = new Map();                    // ship id -> when I last hit it
function cloudFactor(x, y, spd, id) {
  let f = 1;
  for (const b of builds.values()) {
    if (b.k !== "cloud" || !b.poly || Math.hypot(x - b.x, y - b.y) > b.rad + 1 || !inPoly(x, y, b.poly)) continue;
    const d = Math.min(1, edgeDist(x, y, b.poly) / CLOUD_DEEP); let c = 1 - d * d * (3 - 2 * d);   // the edge fade, for everyone
    if (haveMe && inPoly(me.x, me.y, b.poly) && Math.hypot(me.x - x, me.y - y) <= CLOUD_NEAR &&   // we're both in this cloud, close
        (spd >= STILL || performance.now() - (revealed.get(id) || -1e9) < REVEAL_MS)) c = Math.max(c, CLOUD_IN);
    f = Math.min(f, c);
  }
  return f;
}
// (owner, 2026-10-14) the ships the clouds' edge puffs bounce off: mine and the ones I can see, near a cloud, with their
// speed (x, y, vx, vy)
let cloudShips = [];
const shipLast = new Map();                    // ship id -> [x, y, time, vx, vy]
function cloudFx(now) {
  cloudShips = []; if (!haveMe) return;
  let any = false; for (const b of builds.values()) if (b.k === "cloud") { any = true; break; }
  if (!any) { shipLast.clear(); return; }
  const seen = new Set();
  const track = (id, x, y) => {
    seen.add(id); const l = shipLast.get(id), dt = l ? (now - l[2]) / 1000 : 0;
    const vx = l && dt > 0.001 ? l[3] + ((x - l[0]) / dt - l[3]) * Math.min(1, dt * 10) : 0, vy = l && dt > 0.001 ? l[4] + ((y - l[1]) / dt - l[4]) * Math.min(1, dt * 10) : 0;
    shipLast.set(id, [x, y, now, vx, vy]); cloudShips.push([x, y, vx, vy]);
  };
  track(myId, me.x, me.y);
  for (const p of players.values()) {
    if (p.id === myId || !p.near) continue; const t = visTargets.get(p.holder.children[0]); if (!t || t.a < 0.05) continue;   // (a hidden ship doesn't give itself away)
    track(p.id, p.holder.position.x, -p.holder.position.z);
  }
  for (const id of [...shipLast.keys()]) if (!seen.has(id)) shipLast.delete(id);
}
// (owner, 2026-10-14) materializing ships: the first 60% of the time reveals the hologram nose to tail, the rest solidifies it
const SPAWN_MS = 3000, spawnEnd = new Map();   // ship id -> when it's done (performance.now)
const amSpawning = () => (spawnEnd.get(myId) || 0) > performance.now();
function updateSpawns(now) {
  for (const p of players.values()) {
    const v = p.holder.children[0], sp = v && v.userData.sp; if (!sp) continue;
    const end = spawnEnd.get(p.id) || 0, e = end > now ? Math.max(0, 1 - (end - now) / SPAWN_MS) : 1;
    sp.k.value = Math.min(1, e / 0.6); sp.s.value = Math.max(0, (e - 0.6) / 0.4);
    if (e >= 1 && end) spawnEnd.delete(p.id);
    if (sp.s.value < 1 || sp.k.value < 1) {
      const h = p.heading || 0; sp.p.value.set(p.holder.position.x, p.holder.position.z, Math.sin(h), Math.cos(h));   // the nose, in the scene (game (sin h, -cos h))
    }
    if (!v.userData.va) for (const m of v.userData.mats) m.transparent = sp.s.value < 1;   // (my ship: see-through only while materializing)
  }
}
function updateShipVis(dt, now) {
  updateSpawns(now);
  const mine = players.get(myId), edit = build.editorOpen;
  if (haveMe && now - visAt > 33) {             // (owner) 30 times a second
    visAt = now;
    const W = walls(), M = asPts(shipVisOutline(me.x, me.y, mine ? mine.heading : 0)), seen = new Set();   // (owner) the Visibility points, not the combat points
    const look = (vis, poly, x, y, spd = 99, id = null) => {
      if (!vis) return; seen.add(vis);
      const far = Math.hypot(x - me.x, y - me.y) > FAR_OUT + 100, r = far ? { f: 0, lines: null } : mutual(M, [me.x, me.y], asPts(poly), [x, y], W, edit);
      const t = visTargets.get(vis) || { a: 0 }; t.f = r.f; t.lines = r.lines; t.x = x; t.y = y; t.cf = cloudFactor(x, y, spd, id); visTargets.set(vis, t);
    };
    for (const p of players.values()) if (p.id !== myId && p.near) look(p.holder.children[0], shipVisOutline(p.holder.position.x, -p.holder.position.z, p.heading), p.holder.position.x, -p.holder.position.z, Math.hypot(p.vx || 0, p.vy || 0), p.id);
    for (const v of [...visTargets.keys()]) if (!seen.has(v)) visTargets.delete(v);
  }
  for (const [v, t] of visTargets) {
    // (owner, 2026-10-14) opacity rises smoothly from 0 at 25% visible to solid at 75% (no steps); it fades in fast
    // (about 0.15 s) and out slowly (about 0.6 s), so ships show promptly but don't flicker at corners
    const x = Math.max(0, Math.min(1, (t.f - VIS_LO) / (VIS_HI - VIS_LO))), goal = x * x * (3 - 2 * x) * (t.cf ?? 1);   // (and the nebula clouds)
    const k = Math.min(1, dt / (goal > t.a ? 0.15 : 0.6));
    t.a += (goal - t.a) * k; if (Math.abs(goal - t.a) < 0.003) t.a = goal;
    if (v.userData.va) { v.userData.va.value = t.a; const sp = v.userData.sp; for (const m of v.userData.mats) m.transparent = t.a < 0.999 || (sp && sp.s.value < 1); }
    v.visible = t.a > 0.01;
  }
  visGizmo(edit); cloudFx(now);
}
// ---- (owner, 2026-10-14) impacts throw out debris and fire sparks where two ships met, more the harder the hit:
// gray-white debris that tumbles out and fades, and bright orange-yellow sparks that fly fast, arc and burn out ----
const SPARK_N = 600, sparkPos = new Float32Array(SPARK_N * 3), sparkCol = new Float32Array(SPARK_N * 3), sparkV = new Float32Array(SPARK_N * 3), sparkLife = new Float32Array(SPARK_N), sparkMax = new Float32Array(SPARK_N), sparkHue = [];
let sparkNext = 0;
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3)); sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 4, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false }));
sparks.frustumCulled = false; sparks.renderOrder = 8; scene.add(sparks);
// (owner, 2026-10-14) black soot among the sparks: its own normally blended points (added light can't be black), fading out
const SOOT_N = 300, sootPos = new Float32Array(SOOT_N * 3), sootCol = new Float32Array(SOOT_N * 4), sootV = new Float32Array(SOOT_N * 3), sootLife = new Float32Array(SOOT_N), sootMax = new Float32Array(SOOT_N);
let sootNext = 0;
const sootGeo = new THREE.BufferGeometry();
sootGeo.setAttribute("position", new THREE.BufferAttribute(sootPos, 3)); sootGeo.setAttribute("color", new THREE.BufferAttribute(sootCol, 4));
const soot = new THREE.Points(sootGeo, new THREE.PointsMaterial({ size: 6, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: false }));
soot.frustumCulled = false; soot.renderOrder = 9; soot.visible = false; scene.add(soot);   // (over the sparks, so the black shows)
// (owner, 2026-10-14) with a direction (dx, dy: back the way the hit came from), the sparks start right at the impact and
// spray out in a cone that way (a narrow core of fast sparks, slower debris a little wider); without one, all round
const CONE = 0.5;                              // the cone's half-angle (radians)
function burst(x, y, s, dx, dy) {
  const n = Math.min(80, Math.round(10 + s * 0.25)), dir = Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > 0.1 ? Math.atan2(-dy, dx) : null;   // (in the scene, z = -y)
  for (let k = 0; k < n; k++) {
    const i = sparkNext; sparkNext = (sparkNext + 1) % SPARK_N;
    const fire = k % 3 !== 0;
    const a = dir === null ? Math.random() * Math.PI * 2 : dir + (Math.random() + Math.random() - 1) * CONE * (fire ? 0.8 : 1.3);   // (clustered toward the middle)
    const sp = (dir === null ? (fire ? 60 + Math.random() * 160 : 20 + Math.random() * 60) : (fire ? 80 + Math.random() * 180 : 25 + Math.random() * 70)) * (0.6 + s / 300);
    const j = dir === null ? 0 : 1.5;          // (a cone starts at one point)
    sparkPos[i * 3] = x + (Math.random() - 0.5) * j; sparkPos[i * 3 + 1] = dir === null ? 15 + Math.random() * 15 : 10 + Math.random() * 6; sparkPos[i * 3 + 2] = -y + (Math.random() - 0.5) * j;
    sparkV[i * 3] = Math.cos(a) * sp; sparkV[i * 3 + 1] = dir === null ? (fire ? 40 : 15) + Math.random() * 60 : (fire ? 15 : 5) + Math.random() * 30; sparkV[i * 3 + 2] = Math.sin(a) * sp;
    sparkLife[i] = sparkMax[i] = fire ? 0.22 + Math.random() * 0.25 : 0.35 + Math.random() * 0.3;   // (owner, 2026-10-14: shorter-lived)
    sparkHue[i] = fire ? [2.2, 1.3 + Math.random() * 0.6, 0.35] : [1.1, 1.1, 1.15];   // (bright: they're added over the dark blue)
  }
  // black soot: about a third as many again, slower, in the same direction
  for (let k = 0, m = Math.round(n * 0.35); k < m; k++) {
    const i = sootNext; sootNext = (sootNext + 1) % SOOT_N;
    const a = dir === null ? Math.random() * Math.PI * 2 : dir + (Math.random() + Math.random() - 1) * CONE * 1.4, sp = (40 + Math.random() * 110) * (0.6 + s / 300);
    sootPos[i * 3] = x + (Math.random() - 0.5) * 2; sootPos[i * 3 + 1] = 10 + Math.random() * 8; sootPos[i * 3 + 2] = -y + (Math.random() - 0.5) * 2;
    sootV[i * 3] = Math.cos(a) * sp; sootV[i * 3 + 1] = 5 + Math.random() * 20; sootV[i * 3 + 2] = Math.sin(a) * sp;
    sootLife[i] = sootMax[i] = 0.3 + Math.random() * 0.3;
  }
}

function updateSparks(dt) {
  let any = false;
  for (let i = 0; i < SPARK_N; i++) {
    if (sparkLife[i] <= 0) { sparkCol[i * 3] = sparkCol[i * 3 + 1] = sparkCol[i * 3 + 2] = 0; continue; }
    any = true; sparkLife[i] -= dt;
    const f = Math.max(0, sparkLife[i] / sparkMax[i]), drag = Math.exp(-dt * 2.5);
    sparkV[i * 3] *= drag; sparkV[i * 3 + 2] *= drag; sparkV[i * 3 + 1] -= 160 * dt;   // they slow and fall
    sparkPos[i * 3] += sparkV[i * 3] * dt; sparkPos[i * 3 + 1] = Math.max(0.5, sparkPos[i * 3 + 1] + sparkV[i * 3 + 1] * dt); sparkPos[i * 3 + 2] += sparkV[i * 3 + 2] * dt;
    const c = sparkHue[i], g = Math.sqrt(f); sparkCol[i * 3] = c[0] * g; sparkCol[i * 3 + 1] = c[1] * f; sparkCol[i * 3 + 2] = c[2] * f;   // sparks cool from yellow to orange-red as they fade
  }
  if (any || sparks.visible) { sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true; }
  sparks.visible = any;
  let anyS = false;
  for (let i = 0; i < SOOT_N; i++) {
    if (sootLife[i] <= 0) { sootCol[i * 4 + 3] = 0; continue; }
    anyS = true; sootLife[i] -= dt;
    const f = Math.max(0, sootLife[i] / sootMax[i]), drag = Math.exp(-dt * 3);
    sootV[i * 3] *= drag; sootV[i * 3 + 2] *= drag; sootV[i * 3 + 1] -= 40 * dt;
    sootPos[i * 3] += sootV[i * 3] * dt; sootPos[i * 3 + 1] = Math.max(0.5, sootPos[i * 3 + 1] + sootV[i * 3 + 1] * dt); sootPos[i * 3 + 2] += sootV[i * 3 + 2] * dt;
    sootCol[i * 4] = sootCol[i * 4 + 1] = sootCol[i * 4 + 2] = 0; sootCol[i * 4 + 3] = Math.min(1, f * 1.8);   // (solid until it fades at the end)
  }
  if (anyS || soot.visible) { sootGeo.attributes.position.needsUpdate = true; sootGeo.attributes.color.needsUpdate = true; }
  soot.visible = anyS;
}
// ---- (owner, 2026-10-14) health bars over damaged ships (mine too); a ship I can't see shows none ----
const hpBars = new Map();                      // player id -> element
function drawHpBars() {
  const r = canvas.getBoundingClientRect(), seen = new Set();
  for (const p of players.values()) {
    if (p.hp === undefined || p.hp >= HP_MAX || !p.near && p.id !== myId) continue;
    const v = p.holder.children[0], t = p.id === myId ? null : visTargets.get(v), a = p.id === myId ? 1 : t ? t.a : 0;
    if (a <= 0.01) continue;
    const x = p.id === myId ? me.x : p.holder.position.x, y = p.id === myId ? me.y : -p.holder.position.z;
    const s3 = new THREE.Vector3(x, shipMid * 2 + 25, -y).project(camera); if (s3.z > 1) continue;
    let el = hpBars.get(p.id); if (!el) { el = document.createElement("div"); el.className = "hp-bar"; el.innerHTML = "<i></i>"; document.body.appendChild(el); hpBars.set(p.id, el); }
    const f = Math.max(0, Math.min(1, p.hp / HP_MAX));
    el.style.transform = "translate(" + (r.left + (s3.x + 1) / 2 * r.width) + "px," + (r.top + (1 - s3.y) / 2 * r.height) + "px)"; el.style.opacity = a;
    el.firstChild.style.width = f * 100 + "%"; el.firstChild.style.background = f > 0.5 ? "#5fd16b" : f > 0.25 ? "#e3b341" : "#e5534b";
    seen.add(p.id);
  }
  for (const [id, el] of hpBars) if (!seen.has(id)) { el.remove(); hpBars.delete(id); }
}
// (owner) with the Object Editor open, the lines behind each number are drawn (clear green, blocked red) with the
// percentage over each ship, for testing
const visGizGeo = new THREE.BufferGeometry(); let visGizCap = 0;
const visGiz = new THREE.LineSegments(visGizGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthTest: false }));
visGiz.renderOrder = 9; visGiz.frustumCulled = false; visGiz.visible = false; scene.add(visGiz);
const visLabels = new Map();                   // ship visual -> label element
function visGizmo(on) {
  visGiz.visible = on;
  for (const [v, el] of visLabels) if (!on || !visTargets.has(v)) { el.remove(); visLabels.delete(v); }
  if (!on) return;
  const P = [], C = [];
  for (const [v, t] of visTargets) {
    for (const [ax, ay, bx, by, ok] of t.lines || []) { P.push(ax, 3, -ay, bx, 3, -by); const c = ok ? [0.3, 1, 0.45] : [1, 0.3, 0.3]; C.push(...c, ...c); }
    let el = visLabels.get(v); if (!el) { el = document.createElement("div"); el.className = "vis-label"; document.body.appendChild(el); visLabels.set(v, el); }
    const s = new THREE.Vector3(t.x, 60, -t.y).project(camera), r = canvas.getBoundingClientRect();
    el.style.transform = "translate(" + (r.left + (s.x + 1) / 2 * r.width) + "px," + (r.top + (1 - s.y) / 2 * r.height) + "px)";
    el.textContent = Math.round(t.f * 100) + "%"; el.hidden = s.z > 1;
  }
  if (P.length > visGizCap) { visGizCap = Math.max(P.length, visGizCap * 2, 6000); visGizGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(visGizCap), 3)); visGizGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(visGizCap), 3)); }
  if (visGizGeo.attributes.position) { visGizGeo.attributes.position.array.set(P); visGizGeo.attributes.color.array.set(C); visGizGeo.attributes.position.needsUpdate = visGizGeo.attributes.color.needsUpdate = true; }
  visGizGeo.setDrawRange(0, P.length / 3);
}
// (owner, 2026-10-14) a ship's Visibility outline in the world (what the mutual visibility test uses; the combat points are separate)
function shipVisOutline(x, y, h) { return visPtsOf({ k: "ship", x, y, w: 2 * SHIP_R, d: 2 * SHIP_R, r: h }); }
// (owner, 2026-10-14) a ship's Weapon Origin in the world, [x, y]: where its aim line and shots start (line of sight stays at the pivot)
function shipOrigin(x, y, h) { return toWorldPts({ k: "ship", x, y, w: 2 * SHIP_R, d: 2 * SHIP_R, r: h }, [origins.ship || [0, 0]], pivots.ship || [0, 0]); }
// an object's visibility points in the world, as [x0, y0, x1, y1, ...]
function visPtsOf(o) { return toWorldPts(o, visOutlines[o.k] || VIS_DEFAULT[o.k], pivots[o.k] || [0, 0]); }
// a player ship's combat-points parts where it's drawn (the ship kind's outlines and pivot, turned with its heading)
function shipSight(p) { return buildPolys({ k: "ship", x: p.holder.position.x, y: -p.holder.position.z, w: 2 * SHIP_R, d: 2 * SHIP_R, r: p.heading }, colliders, pivots); }
// (owner, 2026-10-14) the ship kind's pivot: the point of the model a ship turns around (its position is that point)
function applyShipPivot() {
  const pv = pivots.ship || [0, 0], D = 2 * SHIP_R;
  for (const p of players.values()) { const v = p.holder.children[0]; if (v) { v.position.x = -pv[0] * D; v.position.z = pv[1] * D; } }
}

function addPlayer(id, name, x = 0, y = 0) {
  if (players.has(id)) { players.get(id).name = name; return players.get(id); }
  const holder = new THREE.Group();
  holder.position.copy(toWorld(x, y, 0)); holder.add(makeVisual(id !== myId, id === myId)); scene.add(holder);
  if (/^b[0-9]+$/.test(id)) holder.userData.id = id.slice(1);   // (owner, 2026-10-14) a test ship's stand-in: clicking it in the Build menu picks up the piece
  holder.visible = id === myId;                // others show once a snapshot has them inside the load circle
  const p = { id, name, holder, heading: 0, buf: [], to: { x, y }, near: false };   // buf: recent snapshot positions on the server's clock; near: inside my load circle
  players.set(id, p); applyShipPivot(); return p;
}
function dropPlayer(id) { const p = players.get(id); if (!p) return; scene.remove(p.holder); players.delete(id); }
const TRAIL_MAX = 80, TRAIL_S = 0.4;           // (owner) the camera trail: up to 80 m behind (was 200), 0.4 m per m/s of speed
const TURN = 0.5;                              // rad/s (owner: first 12, then 4, 8, 4, 2, and on 2026-10-14 cut by another 75% to 0.5)
const TURN_A = 2.5, TURN_K = 4, BANK_MAX = 0.32;
const BUMP_E = 0.5;                             // (owner, 2026-10-14) ship bump bounce, as on the server
let HP_MAX = 100;                               // (the server sends it)   // (owner, 2026-10-14) turn spin-up (rad/s^2), easing into the target, the most a ship leans (rad)
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
  // (owner, 2026-10-14: smooth but responsive) the nose turns on a spring: it spins up to TURN fast (TURN_A) and eases
  // into the target instead of starting and stopping dead. A reversal keeps turning the chosen way round.
  const T2 = Math.PI * 2;
  let want = 0;
  if (target !== null && sign) { const r = ((sign * (target - p.heading)) % T2 + T2) % T2; want = r > 1e-3 && r < T2 - 1e-3 ? sign * Math.min(TURN, r * TURN_K, Math.sqrt(2 * TURN_A * r)) : 0; }
  else if (target !== null) {
    let diff = (target - p.heading) % T2;                             // shortest arc, valid however far the
    if (diff > Math.PI) diff -= T2; else if (diff < -Math.PI) diff += T2;   // heading has accumulated
    want = Math.sign(diff) * Math.min(TURN, Math.abs(diff) * TURN_K, Math.sqrt(2 * TURN_A * Math.abs(diff)));   // never faster than it can stop in (no overshoot)
  }
  if (target !== null || p.omega) {
    const dw = want - (p.omega || 0), lim = TURN_A * dt;
    p.omega = (p.omega || 0) + Math.max(-lim, Math.min(lim, dw));
    if (target === null && Math.abs(p.omega) < 0.05) p.omega = 0;
    let step = p.omega * dt;
    if (target !== null && !sign) {             // never step past the target (big frames at a low frame rate)
      let diff = (target - p.heading) % T2; if (diff > Math.PI) diff -= T2; else if (diff < -Math.PI) diff += T2;
      if (Math.abs(step) >= Math.abs(diff) && Math.sign(step) === Math.sign(diff)) { step = diff; p.omega = 0; }
    }
    p.heading = ((p.heading + step + Math.PI) % T2 + T2) % T2 - Math.PI;   // kept bounded
    p.holder.rotation.y = p.heading;
  }
}
// (owner, 2026-10-14) a ship leans into its turns: the model rolls with how fast it's turning (smoothed), up to BANK_MAX
function bank(p, dt) {
  const v = p.holder.children[0]; if (!v) return;
  const h = p.heading; let dh = h - (p.lastH ?? h); if (dh > Math.PI) dh -= Math.PI * 2; else if (dh < -Math.PI) dh += Math.PI * 2; p.lastH = h;
  const w = dt > 0 ? dh / dt : 0; p.turnRate = (p.turnRate || 0) + (w - (p.turnRate || 0)) * Math.min(1, dt * 10);
  const roll = Math.max(-BANK_MAX, Math.min(BANK_MAX, -p.turnRate * 0.64));   // turning left (heading rising) dips the left wing
  v.rotation.z += (roll - v.rotation.z) * Math.min(1, dt * 8);
}

// (owner, 2026-10-13) my ship against the blocks and the other ships (as drawn), as the server does it
function collideMe() {                       // (owner, 2026-10-14) by the ship's Movement ellipse, turned with its heading, like the server
  const q = { x: me.x, y: me.y, vx: vel.x, vy: vel.y }, mine = players.get(myId), h = mine ? mine.heading : 0;
  let P = shipMove(q.x, q.y, h); const R = polyRad(q, P);
  const hitBy = (B) => { const n = satPush(P, B); if (n) { nudge(q, n, n.d); P = shipMove(q.x, q.y, h); } };
  for (const b of blocks.values()) if (Math.abs(q.x - b.x) <= BLOCK_HALF * 1.5 + R && Math.abs(q.y - b.y) <= BLOCK_HALF * 1.5 + R) hitBy(squarePoly(b.x, b.y, BLOCK_HALF));
  for (const b of builds.values()) { if (b.k === "ship" || b.k === "cloud") continue; const dx = q.x - b.x, dy = q.y - b.y, RR = b.rad + R; if (dx * dx + dy * dy <= RR * RR) hitBy(b.mpoly); }   // (test ships: as ships, below)   // Build menu pieces (their movement ellipses)
  for (const p of players.values()) {          // (owner, 2026-10-14) other ships: pushed apart, trading momentum like the server does
    if (p.id === myId || !p.near) continue; const x = p.holder.position.x, y = -p.holder.position.z; if (Math.hypot(x - q.x, y - q.y) > 2 * R + 10) continue;
    const n = satPush(P, shipMove(x, y, p.heading)); if (!n) continue;
    q.x += n.nx * n.d / 2; q.y += n.ny * n.d / 2; P = shipMove(q.x, q.y, h);
    const vn = (q.vx - (p.vx || 0)) * n.nx + (q.vy - (p.vy || 0)) * n.ny;
    if (vn < 0) { const j = -(1 + BUMP_E) * vn / 2; q.vx += j * n.nx; q.vy += j * n.ny; if (!(keys.size)) brakeA = 0; }
  }
  if (inside(q.x, q.y)) { me.x = q.x; me.y = q.y; vel.x = q.vx; vel.y = q.vy; }
}
// (owner, 2026-10-14) every ship's colliders and pivot, for the Object Editor's drawing in the world
function shipGizmos() {
  const out = [];
  for (const p of players.values()) {
    if (p.id !== myId && !p.near) continue;
    const x = p.id === myId ? me.x : p.holder.position.x, y = p.id === myId ? me.y : -p.holder.position.z;
    out.push({ x, y, sight: buildPolys({ k: "ship", x, y, w: 2 * SHIP_R, d: 2 * SHIP_R, r: p.heading }, colliders, pivots), move: shipMove(x, y, p.heading), vis: shipVisOutline(x, y, p.heading), wo: shipOrigin(x, y, p.heading) });
  }
  return out;
}
// a ship's Movement ellipse in the world (the ship kind's, from the Object Editor)
function shipMove(x, y, h) { return movePoly({ k: "ship", x, y, w: 2 * SHIP_R, d: 2 * SHIP_R, r: h }, movers, pivots); }
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
  for (const b of builds.values()) { if (b.k === "ship" || b.k === "cloud") continue; for (const v of b.polys) { const t = segPoly(x0, y0, x1, y1, v); if (t !== null) hit(t); } }   // (test ships: as ships, below)   // Build menu pieces, by their Sight outlines (owner, 2026-10-14); hidden test ships don't count
  for (const p of players.values()) {              // other ships, by their Sight outlines (owner, 2026-10-14)
    if (p.id === myId || !p.near) continue;
    const vt = visTargets.get(p.holder.children[0]); if (!vt || vt.a <= 0.01) continue;   // (owner) a ship I can't see doesn't stop my aim line (it'd give it away)
    for (const v of shipSight(p)) { const t = segPoly(x0, y0, x1, y1, v); if (t !== null) hit(t); }
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
  blocks.set(id, { x, y, mesh }); visVer++;
}
function dropBlock(id) { const b = blocks.get(id); if (b) { scene.remove(b.mesh); blocks.delete(id); visVer++; } }
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
const build = initBuild({ noiseTex, cloudShips: () => cloudShips, cloudCores: (b) => cloudCores(b).map((c) => c.v), myPos: () => (haveMe ? { x: me.x, y: me.y } : null), onChange: () => { visVer++; }, scene, camera, canvas, toWorld, send, typing, farMat, makeShipPlain: () => makeVisual(false), shipReady: () => !!shipTemplate, onPivot: () => applyShipPivot(), shipGizmos: () => shipGizmos(), makeShip: () => makeVisual(true), botObjects: () => [...players.values()].filter((p) => p.holder.userData.id && p.near).map((p) => p.holder),
  botPos: (bid) => { const p = players.get("b" + bid); return p && { x: p.holder.position.x, y: -p.holder.position.z, h: p.heading }; }, inside: (x, y) => inside(x, y, 0), clearKeys: () => keys.clear() });
// ---- (owner, 2026-10-14) the railgun: left click fires a fast projectile from my ship toward the pointer (the server
// flies it, decides what it hits and keeps the 1 s cooldown); everyone near sees the glowing slug, sparks where it hits a
// ship. A ship the shooter can't see (line of sight) isn't hit: the slug flies through it. ----
// (owner, 2026-10-14) weapons (the staff Weapon panel, Z): the list from the server and the one I have. Its numbers drive
// the shot rate, magazine and reload, the spread cone, the aim line's length (the optimal range) and how fast the aim
// line turns toward the pointer; the server keeps all of it, this mirrors it so the screen matches
let weapons = [], myWeapon = null;
const WPN0 = { id: "0", name: "Railgun", type: "bullet", optimal: 1000, falloff: 10, life: 1.43, speed: 700, rate: 0.5, dmg: 25, spread0: 0, spreadAdd: 1.5, aimSpeed: 3, rotSpeed: 360, reload: 2, mag: 20 };
const wpn = () => weapons.find((w) => w.id === myWeapon) || weapons[0] || WPN0;
let railAt = 0, ammo = null, reloadAt = 0;
const SPREAD_MAX = 45;
let spreadDeg = 0, spreadT = 0;                // the extra spread from shooting (over the weapon's default), and when
const spreadNow = (now = performance.now()) => Math.min(SPREAD_MAX, wpn().spread0 + Math.max(0, spreadDeg - wpn().aimSpeed * (now - spreadT) / 1000));
let aimAng = null, aimOx = 0, aimOy = 0;   // aimOx / aimOy: my Weapon Origin this frame (owner, 2026-10-14: the aim line and shots start there)
// aimAng: the aim line's direction (scene x / z angle); it turns toward the pointer at the weapon's rotation speed
const aimDir = () => (aimAng === null ? null : { x: Math.cos(aimAng), y: -Math.sin(aimAng) });   // (on the game plane)
// (owner, 2026-10-14) R reloads the magazine (not while building, where R turns pieces, nor while typing)
function reloadGun() {
  if (!haveMe || !ws || ws.readyState !== 1 || build.open || build.editorOpen || typing()) return;
  const w = wpn(), now = performance.now();
  if (reloadAt) { if (now < reloadAt) return; reloadAt = 0; ammo = w.mag; }
  if (ammo === null || ammo >= w.mag) return;
  reloadAt = now + w.reload * 1000; ws.send(JSON.stringify({ t: "reload" }));
}
addEventListener("keydown", (e) => { if (e.code === "KeyR" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) reloadGun(); });
function fireRail(px, py) {
  if (!haveMe || !ws || ws.readyState !== 1 || build.open || build.editorOpen || typing() || amSpawning()) return;
  const w = wpn(), now = performance.now(); if (now - railAt < w.rate * 1000) return;
  if (reloadAt) { if (now < reloadAt) return; reloadAt = 0; ammo = w.mag; }   // (reloading)
  if (ammo === null) ammo = w.mag;
  if (ammo <= 0) return;                       // (owner, 2026-10-14) empty: R reloads
  const d = aimDir(); if (!d) return;                                       // along the aim line (it lags the pointer by the rotation speed)
  railAt = now; spreadDeg = Math.min(SPREAD_MAX, Math.max(0, spreadDeg - w.aimSpeed * (now - spreadT) / 1000) + w.spreadAdd); spreadT = now;
  ammo--;
  void px; void py;
  ws.send(JSON.stringify({ t: "fire", x: Math.round(d.x * 1000) / 1000, y: Math.round(d.y * 1000) / 1000 }));
}
const projs = new Map();                       // id -> { g, x, y, vx, vy, t0 }
const projCore = new THREE.MeshBasicMaterial({ color: 0xeafcff, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
const projGlow = new THREE.MeshBasicMaterial({ color: 0x3fb8ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
const projTrail = new THREE.MeshBasicMaterial({ color: 0x3fb8ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
const projGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false).rotateZ(Math.PI / 2).translate(-0.5, 0, 0);   // along x, from -1 to 0 (the tip at its origin)
function addProj(m) {
  if (![m.x, m.y, m.vx, m.vy].every(Number.isFinite) || projs.has(m.i)) return;
  const g = new THREE.Group(), core = new THREE.Mesh(projGeo, projCore), glow = new THREE.Mesh(projGeo, projGlow), trail = new THREE.Mesh(projGeo, projTrail);
  core.scale.set(18, 1, 1); glow.scale.set(26, 3, 3); trail.scale.set(70, 1.6, 1.6); g.add(trail, glow, core);
  g.rotation.y = Math.atan2(m.vy, m.vx); g.renderOrder = 3; scene.add(g);
  projs.set(m.i, { g, x: m.x, y: m.y, vx: m.vx, vy: m.vy, t0: performance.now() });
}
function endProj(m) {
  const q = projs.get(m.i); if (q) { scene.remove(q.g); projs.delete(m.i); }
  if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
  const bx = q ? -q.vx : undefined, by = q ? -q.vy : undefined;   // (owner, 2026-10-14) sparks fly back the way the slug came
  if (m.h != null) { burst(m.x, m.y, 260, bx, by); if (q && q.a === myId) revealed.set(m.h, performance.now()); }   // sparks on the ship it hit (a ship I hit shows in a cloud)
  else if (m.s) burst(m.x, m.y, 60, bx, by);   // a small puff of sparks on a wall
}
function updateShots(now) {
  for (const [id, q] of projs) {
    const t = (now - q.t0) / 1000; if (t > 3) { scene.remove(q.g); projs.delete(id); continue; }   // (never told it ended)
    q.g.position.set(q.x + q.vx * t, shipMid, -(q.y + q.vy * t));
  }
}
document.addEventListener("contextmenu", (e) => e.preventDefault());   // (owner) the browser's menu never opens in the game, on the UI either (the game's own menus still do)
let orbiting = false, aiming = false, aimPin = null, orbitLock = null;   // aimPin: while orbiting the pointer is locked, so the reticle keeps its screen spot; orbitLock: MMB holds the camera frame
const mouse = { x: 0, y: 0 };
let myAim = null;                              // the reticle (three x / z) while aiming, from the last frame
canvas.addEventListener("mousedown", (e) => { if (e.button === 1) { orbiting = true; aimPin = { x: e.clientX, y: e.clientY };
    orbitLock = { dist: viewDist, len: Math.hypot(focus.x - me.x, focus.y - me.y), ang: Math.atan2(focus.x - me.x, focus.y - me.y) - camYaw }; lockPointer(); e.preventDefault(); }
  if (e.button === 0) fireRail(e.clientX, e.clientY);
  if (e.button === 2) { aiming = true; mouse.x = e.clientX; mouse.y = e.clientY; e.preventDefault(); } });   // (owner, 2026-10-14) aiming keeps the wheel zoom until the aim point leaves the 300 m dead zone
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

// (owner, 2026-10-14) ship-relative controls: W thrusts the way the ship faces, S flies it backward, A and D turn it.
// The push sent to the server is along the nose (or against it), so the physics is the same as before.
function inputDir() {
  let f = 0, r = 0;
  if (keys.has("KeyW")) f += 1; if (keys.has("KeyS")) f -= 1;
  if (keys.has("KeyD")) r += 1; if (keys.has("KeyA")) r -= 1;
  if (joy.id !== null && Math.hypot(joy.x, joy.y) > 0.15) { f = joy.y; r = joy.x; }   // the joystick: up / down thrust, left / right turn
  const b = sprint ? 1 : 0, mine = players.get(myId), h = mine ? mine.heading : 0, turn = -Math.max(-1, Math.min(1, r));   // turn: + = left (the heading rises)
  if (amSpawning()) return { x: 0, y: 0, b: 0, turn: 0 };   // (owner) materializing: no moving or turning yet
  if (!f) return { x: 0, y: 0, b, turn };
  f = Math.max(-1, Math.min(1, f));
  // (owner, 2026-10-14) reversing, left and right swap: backing up with A swings the ship's tail to the left, the way it
  // goes, like a car in reverse
  return { x: Math.sin(h) * f, y: -Math.cos(h) * f, b, turn: f < 0 ? -turn : turn };   // the nose on the game plane: (sin h, -cos h)
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
    if (m.t === "batch") { for (const x of Array.isArray(m.m) ? m.m : []) ws.onmessage({ data: JSON.stringify(x) }); return; }   // (owner, 2026-10-14) objects entering / leaving the load circle
    if (m.t === "hello") {
      if (Array.isArray(m.weapons)) weapons = m.weapons; if (typeof m.weapon === "string") myWeapon = m.weapon;   // (owner, 2026-10-14) weapons
      srvBuild = m.build || "";
      if (m.cfg) { if (m.cfg.shipR) SHIP_R = m.cfg.shipR; if (m.cfg.blockHalf) BLOCK_HALF = m.cfg.blockHalf; if (m.cfg.hexFlat && m.cfg.hexFlat !== HEX_FLAT) { HEX_FLAT = m.cfg.hexFlat; rebuildBorder(); } SPEED = m.cfg.speed || SPEED; ACCEL = m.cfg.accel || ACCEL; BRAKE = m.cfg.brake || BRAKE; STOP_D = m.cfg.stopD || STOP_D; SPRINT = m.cfg.sprint || SPRINT; VEL_TURN = m.cfg.velTurn || VEL_TURN; SIDE_SPEED = m.cfg.sideSpeed || SIDE_SPEED; FWD_ARC = m.cfg.fwdArc || FWD_ARC; TURN_ACCEL = m.cfg.turnAccel || TURN_ACCEL; if (m.cfg.cap) CAPC = m.cfg.cap; if (m.cfg.loadR) LOAD_R = m.cfg.loadR; if (m.cfg.hpMax) HP_MAX = m.cfg.hpMax; }
      myId = m.you.id; myName = m.you.name; haveMe = false; mySide = null;
      amStaff = !!m.you.staff;
      if (m.you.staff && window.AdminPanel) window.AdminPanel.mount();   // (owner) the Admin button, for staff accounts
      if (m.you.builder && window.WeaponPanel) window.WeaponPanel.mount({ list: () => weapons, current: () => myWeapon, send });   // (owner, 2026-10-14) the Weapon panel (Z)
      build.setStaff(!!m.you.builder); build.load(m.builds, m.cfg && m.cfg.buildH, m.cfg && m.cfg.shipR && 2 * m.cfg.shipR, m.colliders, m.pivots, m.movers, m.visOutlines, m.origins);
      for (const p of [...players.keys()]) dropPlayer(p);
      for (const r of m.roster || []) addPlayer(r.i, r.n).side = r.s;
      for (const id of [...blocks.keys()]) dropBlock(id);
      for (const [id, x, y] of m.blocks || []) addBlock(id, x, y);
      // (owner, 2026-10-13) the side is remembered: re-join it, unless this is the first time or the player ticked
      // Reset faction on the Welcome back page (game.html?reset=1), which shows the picker
      const reset = new URLSearchParams(location.search).get("reset") === "1";
      if (m.side && !reset) sendSide(m.side); else sidePick.hidden = false;
      if (m.countdown) startCountdown(Date.now() + m.countdown.in, m.countdown.parts, m.countdown.head);
    } else if (m.t === "spawn") {
      me.x = m.x; me.y = m.y; haveMe = true; mySide = m.s; sidePick.hidden = true;
      focus.x = me.x; focus.y = me.y;
      { const mp = addPlayer(myId, myName, me.x, me.y); mp.side = m.s; mp.near = true; mp.holder.visible = true; }
      drawPrefix();
    } else if (m.t === "snap") {
      { const off = Date.now() - m.ts; srvOff = srvOff === null || off < srvOff ? off : srvOff + (off - srvOff) * 0.01; }
      const inSnap = new Set();
      for (const [id, cx, cy, ch, hp, sl] of m.p) {
        const x = cx / 100, y = cy / 100;
        inSnap.add(id);
        { const end = Number.isFinite(sl) && sl > 0 ? performance.now() + sl * 10 : 0, was = spawnEnd.get(id) || 0;   // (owner, 2026-10-14) materializing: when it's done
          if (!end) spawnEnd.delete(id); else if (!was || Math.abs(was - end) > 200) spawnEnd.set(id, end); }
        { const pp = players.get(id); if (pp && Number.isFinite(hp)) pp.hp = hp; }   // (owner, 2026-10-14) health
        if (id === myId) {                     // soft-correct my prediction toward where the server will be once
          const lead = (rtt / 2 + 50) / 1000;  // it has heard my latest input (its snapshot is ~half a round trip old)
          const lspd = Math.max(SPEED, Math.hypot(vel.x, vel.y));
          let tx = x + vel.x * lead, ty = y + vel.y * lead;
          if (!inside(tx, ty)) { tx = x; ty = y; }
          const err = Math.hypot(tx - me.x, ty - me.y);
          if (err > lspd * 0.4) { me.x = tx; me.y = ty; corr.x = corr.y = 0; } else { corr.x = tx - me.x; corr.y = ty - me.y; }   // (owner, 2026-10-14) small errors are worked off smoothly every frame, not in jumps
          continue;
        }
        const p = players.get(id) || addPlayer(id, "");
        if (!p.near) { p.near = true; p.buf = []; p.holder.visible = true; p.holder.position.copy(toWorld(x, y, 0)); }   // entering the load circle: start fresh there
        p.buf.push({ x, y, h: (ch || 0) / 1000, t: m.ts }); if (p.buf.length > 30) p.buf.shift();   // a short history, timed by the server
        if (p.buf.length > 1) { const q = p.buf[p.buf.length - 2], dt2 = Math.max(0.001, (m.ts - q.t) / 1000); p.vx = (x - q.x) / dt2; p.vy = (y - q.y) / dt2; }   // its velocity, for bumping into it
        p.to = { x, y };
      }
      for (const p of players.values()) if (p.id !== myId && p.near && !inSnap.has(p.id)) { p.near = false; p.buf = []; p.holder.visible = false; }   // left the load circle
    } else if (m.t === "join") { if (m.i !== myId) addPlayer(m.i, m.n).side = m.s; }
    else if (m.t === "leave") { if (m.i !== myId) dropPlayer(m.i); }
    else if (m.t === "cap") { cap = m.c; capOut = !!m.o; }
    else if (m.t === "weapons") { if (Array.isArray(m.list)) { weapons = m.list; ammo = null; reloadAt = 0; if (window.WeaponPanel) window.WeaponPanel.refresh(); } }
    else if (m.t === "wsaved") { if (typeof m.id === "string") { myWeapon = m.id; ammo = null; reloadAt = 0; spreadDeg = 0; } if (window.WeaponPanel) window.WeaponPanel.saved(m); }
    else if (m.t === "proj") { addProj(m); const q = projs.get(m.i); if (q) q.a = m.a; }
    else if (m.t === "pend") endProj(m);
    else if (m.t === "hit") {                  // (owner, 2026-10-14) an impact: sparks, if I can see either ship (or it's mine)
      const seen = (id) => { if (id === myId) return true; const p = players.get(id), t = p && visTargets.get(p.holder.children[0]); return !!t && t.a > 0.01; };
      if (m.a === myId && m.b != null) revealed.set(m.b, performance.now()); else if (m.b === myId && m.a != null) revealed.set(m.a, performance.now());   // (owner) a ship I hit shows in a cloud
      if (Number.isFinite(m.x) && Number.isFinite(m.y) && (seen(m.a) || seen(m.b))) burst(m.x, m.y, Math.min(600, Math.max(0, +m.s || 0)), +m.dx, +m.dy);
    }
    else if (m.t === "staff") { if (window.AdminPanel) window.AdminPanel.mount(true).then((ok) => { amStaff = ok; }); }   // (owner, 2026-10-14) made (or removed as) a moderator: the panel checks again
    else if (m.t === "chat") addChat(m);
    else if (build.onMsg(m)) { /* Build menu pieces */ }
    else if (m.t === "block") { for (const id of m.gone || []) dropBlock(id); if (m.b) addBlock(m.b[0], m.b[1], m.b[2]); }
    else if (m.t === "teleport") { me.x = m.x; me.y = m.y; vel.x = vel.y = 0; brakeA = 0; focus.x = me.x; focus.y = me.y; }   // (owner) an admin moved this ship
    else if (m.t === "pong") rtt = rtt * 0.7 + Math.max(0, performance.now() - m.ts) * 0.3;
    else if (m.t === "countdown") startCountdown(Date.now() + m.in, m.parts, m.head);
    else if (m.t === "update") { if (typeof m.web === "string" && /^[0-9a-f]{7,40}$/.test(m.web)) countHead = m.web; goUpdating(["web"]); }
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
// (owner, 2026-10-14) "forward" for top speed and sprint is the nose: backing up is at the side / back rate and can't sprint.
// (The reticle is independent of the ship.)
const aimAngle = () => { const mine = players.get(myId); return haveMe && mine ? Math.atan2(Math.sin(mine.heading), -(-Math.cos(mine.heading))) : null; };                   // trailing: settled-state resends still owed after the last change
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
let countAt = 0, countParts = ["server", "web"], countHead = "";   // countHead: (owner, 2026-10-14) the commit going live
function startCountdown(at, parts, head) { countAt = at; if (parts && parts.length) countParts = parts; if (typeof head === "string" && /^[0-9a-f]{7,40}$/.test(head)) countHead = head; countEl.hidden = false; }
function goUpdating(parts) {
  closedForGood = true; try { ws && ws.close(); } catch {}
  const q = new URLSearchParams({ updating: "1", parts: (parts || countParts).join(",") });
  if (WEB_BUILD && WEB_BUILD !== "__" + "BUILD__") q.set("web", WEB_BUILD);
  if (srvBuild) q.set("srv", srvBuild);
  if (countHead) q.set("to", countHead);
  location.href = "play.html?" + q.toString();
}

// ---- frame loop ----
let lastT = performance.now();
const focus = { x: 0, y: 0 };                  // where the camera looks (the player, or toward the aim circle)
let viewDist = camDist;                        // the eased camera distance
// (owner, 2026-10-14: speed) the clouds (their own layer, 2) are drawn into a picture a third the screen's size, then laid over the scene
// (its colors are premultiplied, so it's added as "over"). A ninth of the pixels for the softest, most layered thing on
// screen; they're soft enough not to show it. Skipped when no cloud is on that layer.
const CLOUD_LAYER = 2, CLOUD_DIV = 3, cloudRT = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false });
const cloudComp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { t: { value: cloudRT.texture } }, transparent: true, depthTest: false, depthWrite: false,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  vertexShader: "varying vec2 vU; void main() { vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: "uniform sampler2D t; varying vec2 vU; void main() { gl_FragColor = texture2D(t, vU); }",
}));
cloudComp.frustumCulled = false;
const cloudCompScene = new THREE.Scene(); cloudCompScene.add(cloudComp);
const cloudCompCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), cloudSz = new THREE.Vector2(), clearC = new THREE.Color();
function renderClouds() {
  let any = false; for (const b of builds.values()) if (b.k === "cloud") { any = true; break; }
  if (!any && !build.open) return;
  renderer.getDrawingBufferSize(cloudSz); const w = Math.max(2, Math.ceil(cloudSz.x / CLOUD_DIV)), h = Math.max(2, Math.ceil(cloudSz.y / CLOUD_DIV));
  if (cloudRT.width !== w || cloudRT.height !== h) cloudRT.setSize(w, h);
  const bg = scene.background, ca = renderer.getClearAlpha(); renderer.getClearColor(clearC);
  scene.background = null; camera.layers.set(CLOUD_LAYER); renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(cloudRT); renderer.clear(); renderer.render(scene, camera);
  renderer.setRenderTarget(null); camera.layers.set(0); scene.background = bg; renderer.setClearColor(clearC, ca);
  const ac = renderer.autoClear; renderer.autoClear = false; renderer.render(cloudCompScene, cloudCompCam); renderer.autoClear = ac;
}
// (owner, 2026-10-14: speed, aiming for 60 fps) the resolution adapts: if frames come slower than ~50 a second over a
// couple of seconds the game draws fewer pixels (down to 60% of the screen's), and steps back up when there's room. A
// step up that's undone at once isn't tried again for a minute, so it doesn't keep flickering between the two.
const DPR_MAX = Math.min(devicePixelRatio || 1, 1.5), DPR_MIN = DPR_MAX * 0.6;
let dprNow = DPR_MAX, adAcc = 0, adN = 0, adT = 0, adUpAt = -1e9, adBlock = 0;
function adaptRes(now, ms) {
  if (ms > 250 || document.hidden) return;   // (a paused tab, a hitch: not counted)
  adAcc += ms; adN++; if (now - adT < 2000) return;
  const avg = adAcc / adN; adAcc = 0; adN = 0; adT = now; let next = dprNow;
  if (avg > 20 && dprNow > DPR_MIN + 0.01) { next = Math.max(DPR_MIN, dprNow * 0.85); if (now - adUpAt < 4500) adBlock = now + 60000; }
  else if (avg < 17.6 && dprNow < DPR_MAX - 0.01 && now > adBlock) { next = Math.min(DPR_MAX, dprNow * 1.1); adUpAt = now; }
  if (next !== dprNow) { dprNow = next; renderer.setPixelRatio(dprNow); resize(); }
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
const camOff = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const nowP = performance.now(), dt = Math.min((nowP - lastT) / 1000, 0.1), now = Date.now(); adaptRes(nowP, nowP - lastT); lastT = nowP;

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
  if (haveMe && (corr.x || corr.y)) {           // (owner, 2026-10-14) the server's correction, eased in over about 0.1 s
    const k = 1 - Math.exp(-dt * 10), cx = corr.x * k, cy = corr.y * k;
    if (inside(me.x + cx, me.y + cy)) { me.x += cx; me.y += cy; }
    corr.x -= cx; corr.y -= cy; if (Math.hypot(corr.x, corr.y) < 0.01) corr.x = corr.y = 0;
  }

  // other ships are drawn 150 ms in the past on the server's clock, between the two snapshots around that moment
  // (only the last two used to be kept, older than the render time, so they stepped and never glided)
  const rt = Date.now() - (srvOff || 0) - 150;
  for (const p of players.values()) {
    if (p.id === myId) {                       // (owner, 2026-10-14) A / D turn the ship: the turn spins up and eases off (TURN_A)
      const T2 = Math.PI * 2, want = (d.turn || 0) * TURN, dw = want - (p.omega || 0), lim = TURN_A * dt;
      p.omega = (p.omega || 0) + Math.max(-lim, Math.min(lim, dw)); if (!d.turn && Math.abs(p.omega) < 0.02) p.omega = 0;
      p.heading = ((p.heading + p.omega * dt + Math.PI) % T2 + T2) % T2 - Math.PI;
      p.holder.rotation.y = p.heading; p.holder.position.copy(toWorld(me.x, me.y, 0));
      bank(p, dt); continue;
    }
    const B = p.buf; let x = p.to.x, y = p.to.y, h = null;
    if (B.length) {
      let i = B.length - 1; while (i > 0 && B[i].t > rt) i--;
      const a = B[i], b = B[i + 1];
      if (b && b.t > a.t && rt >= a.t) {
        const t = (rt - a.t) / (b.t - a.t), z = B[i - 1] || a, c = B[i + 2] || b;   // (owner, 2026-10-14) a smooth curve (Catmull-Rom) through the snapshots, not straight lines between them
        const cr = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
        x = cr(z.x, a.x, b.x, c.x); y = cr(z.y, a.y, b.y, c.y);
        let dh = (b.h - a.h) % (Math.PI * 2); if (dh > Math.PI) dh -= Math.PI * 2; else if (dh < -Math.PI) dh += Math.PI * 2; h = a.h + dh * t; }
      else if (!b && i > 0 && rt > a.t) {      // past the newest: carry on along its last motion briefly, then hold
        const z = B[i - 1], k = Math.min(rt - a.t, 120) / Math.max(1, a.t - z.t); x = a.x + (a.x - z.x) * k; y = a.y + (a.y - z.y) * k; h = a.h;
      } else { x = a.x; y = a.y; h = a.h; }
    }
    placeShip(p, x, y, dt);
    if (h !== null) { p.heading = h; p.holder.rotation.y = h; }   // the owner's own heading, as they see it
    bank(p, dt);
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
    return { x: me.x + ux * d, z: -me.y + uz * d, sux: sx, suy: sy, ux, uz, dist: ul };
  }
  const aimPx = () => aimPin ? aimPin : mouse;
  if (aiming && haveMe && !orbitLock) {
    const a = aimAt(aimPx().x, aimPx().y);
    if (a) {
      // (owner, 2026-10-13) the camera is driven ONLY by the pointer's screen position and constants, never by the
      // reticle's ground distance (that looped). One uniform full-press zoom; the leash (focus sliding along the aim)
      // is solved per direction so the screen edge sits exactly the overflow past the circle, the ship kept 80 m
      // inside the opposite edge. (owner, 2026-10-14) A dead zone of cam.dead (300 m) around the ship: with the aim point
      // inside it the camera stays put; beyond it, the camera eases out to the full reach (the focus and zoom ease too).
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
      aimExt += ((a.dist > cam.dead ? 1 : 0) - aimExt) * (1 - Math.exp(-dt * 5)); const ease = aimExt * aimExt * (3 - 2 * aimExt); aimEase = ease;
      wantDist = Math.max(camDist, Math.min(6000, ease * Ddir));
      let lam = 1 - (m * wantDist / denF - O) / R;                       // ahead of the focus: the circle + exactly the gap
      lam = Math.min(lam, (m * wantDist / denB - S) / R);                // behind it: the ship + its margin
      lam = Math.min(1, Math.max(0, lam)) * ease;
      fx = me.x + a.ux * lam * R; fy = me.y + -a.uz * lam * R;
    }
  }
  if (!aiming) aimExt = 0;
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
  if (haveMe) {                                // (owner, 2026-10-14) the aim direction turns toward the pointer at the weapon's rotation speed
    const r0 = aimAt(aimPx().x, aimPx().y);
    const mine = players.get(myId); [aimOx, aimOy] = shipOrigin(me.x, me.y, mine ? mine.heading : 0);   // (owner, 2026-10-14) the aim line runs from the Weapon Origin
    if (r0) { const want = Math.atan2(aimHit.z + aimOy, aimHit.x - aimOx); if (aimAng === null) aimAng = want; else { const d = Math.atan2(Math.sin(want - aimAng), Math.cos(want - aimAng)), st = wpn().rotSpeed * Math.PI / 180 * dt; aimAng += Math.max(-st, Math.min(st, d)); } }
  }
  if (aiming && haveMe && aimAng !== null) {
    const L0 = wpn().optimal, a = { x: aimOx + Math.cos(aimAng) * L0, z: -aimOy + Math.sin(aimAng) * L0 };   // (owner) the line runs the optimal range
    {
      aimShown = true;
      const lp = aimLineGeo.attributes.position, lc = aimLineGeo.attributes.color, sx = aimOx, sz = -aimOy;
      const at = (f) => [sx + (a.x - sx) * f, sz + (a.z - sz) * f];
      const tb = aimBlocked(aimOx, aimOy, a.x, -a.z);
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
  { const sp = Math.min(SPREAD_MAX, spreadNow()) * Math.PI / 180, on = aimShown && myAim && sp > 0.001;   // (the cone, around the aim line)
    cone.visible = coneEdges.visible = !!on;
    if (on) {
      const sx = aimOx, sz = -aimOy, ux = myAim.x - sx, uz = myAim.z - sz, L = Math.hypot(ux, uz) || 1, a = Math.atan2(uz, ux);
      const lx = sx + Math.cos(a - sp) * L, lz = sz + Math.sin(a - sp) * L, rx = sx + Math.cos(a + sp) * L, rz = sz + Math.sin(a + sp) * L;
      coneGeo.attributes.position.array.set([sx, 0.35, sz, lx, 0.35, lz, rx, 0.35, rz]); coneGeo.attributes.position.needsUpdate = true;
      coneEdgeGeo.attributes.position.array.set([sx, 0.38, sz, lx, 0.38, lz, sx, 0.38, sz, rx, 0.38, rz]); coneEdgeGeo.attributes.position.needsUpdate = true;
    } }
  updateShots(nowP);
  drawMinimap(nowP);

  if (countAt) {
    const left = Math.ceil((countAt - now) / 1000);
    if (left <= 0) { countAt = 0; goUpdating(); } else countEl.textContent = "Update incoming — " + left + " s";
  }

  updateShipVis(Math.min(0.1, dt || 0.016), performance.now());
  drawHpBars(); updateSparks(Math.min(0.1, dt || 0.016));
  build.frame(); starT.value = skyT.value = performance.now() / 1000; sky.position.x = camera.position.x; sky.position.z = camera.position.z;
  updateVis();
  renderSky();
  renderer.render(scene, camera);
  renderClouds();
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
    const t = visTargets.get(p.holder.children[0]); if (haveMe && (!t || t.a <= 0.01)) continue;   // (owner) as see-through as the ship itself
    mmx.globalAlpha = t ? t.a : 1; arrow(p.holder.position.x, -p.holder.position.z, p.heading, mySide && p.side === mySide ? "#4f8fe8" : "#e04848", 3, false); mmx.globalAlpha = 1;
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
  // (owner, 2026-10-14) staff badges left of the name: a blue circle with a white m (moderator), a red one with an A (admin)
  const badge = m.r === "m" || m.r === "a" ? document.createElement("span") : null;
  if (badge) { badge.className = "chat-badge " + (m.r === "m" ? "mod" : "adm"); badge.textContent = m.r === "m" ? "m" : "A"; badge.title = m.r === "m" ? "Moderator" : "Admin"; }
  const who = document.createElement("span"); who.className = "chat-who " + (m.s === "red" ? "red" : "blue"); who.textContent = m.n + ": ";
  if (m.i && m.i !== myId) { who.dataset.id = m.i; who.dataset.name = m.n; }
  const txt = document.createElement("span"); txt.textContent = m.text;
  line.append(tag, ...(badge ? [badge] : []), who, txt); return line;
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
window.Atamus = { burst: (x, y, s, dx, dy) => burst(x, y, s, dx, dy), get focus() { return { x: focus.x, y: focus.y }; }, get me() { return { ...me, id: myId }; }, get players() { return [...players.keys()]; }, get near() { return [...players.values()].filter((p) => p.near).map((p) => p.id); }, get ws() { return ws; }, get view() { return viewDist; }, get aim() { return aimLine.visible ? { x: aimHit.x, z: aimHit.z } : null; }, get builds() { return [...builds.values()].map((b) => ({ id: b.id, k: b.k, x: Math.round(b.x), y: Math.round(b.y), w: b.w, d: b.d, r: b.r, ...(b.extra && b.extra.pts ? { n: b.extra.pts.length, v: b.extra.v } : {}), ...(b.k === "ship" && b.extra ? { route: b.extra.route ? b.extra.route.length : 0, atk: !!b.extra.atk } : {}) })); }, get vis() { return [...players.values()].filter((p) => p.id !== myId).map((p) => { const t = visTargets.get(p.holder.children[0]); return { id: p.id, a: t ? +t.a.toFixed(2) : null, cf: t ? +(t.cf ?? 1).toFixed(2) : null }; }); }, get rinfo() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs.length }; }, get blocks() { return [...blocks].map(([id, b]) => ({ id, x: b.x, y: b.y })); }, get drawn() { return [...players.values()].map((p) => ({ id: p.id, x: p.holder.position.x, z: p.holder.position.z, h: p.heading, vis: p.holder.visible })); } };
