// Atamus 3D (owner, 2026-10-12): the game rebuilt in 3D. One flat world with a 2D
// grid; the border is the same flat-top hexagon, 5 miles flat to flat. Each player is
// a 100 m sphere (yours blue, others red) that travels on the ground plane only — no
// up or down. WASD moves it; wherever the camera faces is forward. The middle mouse
// (touch: a one-finger drag) rotates the camera around the player; it sits at a 75°
// angle looking down toward the player. Each player is sent everything within their load circle.
import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

// (owner) returning players come through the log-in page first (live site only)
if (typeof needLogin === "function" && needLogin()) location.replace("login.html");

const statusEl = document.getElementById("status");
const countEl = document.getElementById("countdown");
const WEB_BUILD = (document.querySelector('meta[name="atamus-build"]') || {}).content || "";

// ---- world constants (the server's hello can override them) ----
let HEX_FLAT = 126_000;                        // 126 km flat to flat
let SPHERE_R = 50;                             // 100 m diameter
let SPEED = 200;                               // m/s (owner, 2026-10-13; the server sends it in the hello)
let ACCEL = 200, BRAKE = 400, TURN_ACCEL = 0.3;   // (owner) weight: as on the server (world3d.js)
let STOP_D = 100, brakeA = 0, SPRINT = 1.3;   // SPRINT: (owner) sprint is 30% faster                  // (owner) a stop always ends within STOP_D: the rate is fixed when WASD is let go (as on the server)
const stopRate = (v) => brakeA || Math.max(BRAKE, (v * v) / (2 * STOP_D));
const accelShare = (d) => TURN_ACCEL + (1 - TURN_ACCEL) * ((1 + Math.cos(d)) / 2) ** 2;
const vel = { x: 0, y: 0 };                    // my ship's velocity, predicted the same way the server integrates it
// (owner, 2026-10-13) the capacitor: predicted like the server's, corrected by its 4 Hz private updates
let CAPC = { max: 100, drain: 20, walk: 4, idle: 12, resume: 15 }, cap = 100, capOut = false;
const SQ3 = Math.sqrt(3);
const inside = (x, y, m = SPHERE_R) => { const a = HEX_FLAT / 2 - m; return Math.abs(y) <= a && Math.abs(SQ3 * x + y) <= 2 * a && Math.abs(SQ3 * x - y) <= 2 * a; };

// Game plane: x east, y north. Three: x = x, z = -y, y (three) = up.
const toWorld = (x, y, h = 0) => new THREE.Vector3(x, h, -y);

// ---- scene ----
const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070c);
scene.fog = new THREE.Fog(0x05070c, 3000, 14000);
scene.add(new THREE.HemisphereLight(0x8fa7c8, 0x10141c, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(3000, 5000, 2000); scene.add(sun);

const camera = new THREE.PerspectiveCamera(60, 1, 5, 30000);
let camYaw = 0;                                // around the player
// camera settings: pitch, min / max zoom, rotation speed
const cam = { pitch: 60, zmin: 600, zmax: 1800, rot: 0.6, leash: 700, over: 100,
  dir: { n: 200, ne: 0, e: 200, se: 0, s: 200, sw: 0, w: 200, nw: 0 } };   // (owner) leash: the reticle's max distance (the blue circle);
// over: the base overflow; dir: the per-direction overflow delta (m). Fixed values (the sliders are gone).
let camDist = Math.min(cam.zmax, Math.max(cam.zmin, 500));

// ground with the 2D grid drawn in its own shader: anti-aliased 100 m lines on the surface itself,
// so nothing z-fights or shimmers the way a second layer of rendered lines did
const groundMat = new THREE.ShaderMaterial({
  uniforms: {
    base: { value: new THREE.Color(0x0a0e16) }, gline: { value: new THREE.Color(0x33455f) },
    fogColor: { value: new THREE.Color(0x05070c) }, fogNear: { value: 3000 }, fogFar: { value: 14000 },
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
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4f8fe8, transparent: true, opacity: 0.9 }));
}
const border = hexShapeBand(); border.position.y = 0.3; scene.add(border);

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
const aimLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
// (owner, 2026-10-13) right-click: a dashed white line from the ship's center on the ground plane to the
// ground point under the pointer, ending in a small white dot. Nothing else aims for now.
const aimLineMat = new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, dashSize: 12, gapSize: 8 });
const aimLine = new THREE.Line(aimLineGeo, aimLineMat); aimLine.frustumCulled = false;
const aimEnd = new THREE.Mesh(new THREE.CircleGeometry(2, 24),   // (owner) a small flat filled dot (owner, 2026-10-13: "way thinner", 2 m from 5)
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
aimEnd.rotation.x = -Math.PI / 2; aimEnd.visible = false; scene.add(aimEnd);
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
  for (const p of players.values()) { p.holder.clear(); p.holder.add(makeVisual()); }
}, undefined, (e) => console.warn("[ship] load failed:", e && e.message));
function makeVisual() {
  if (shipTemplate) return shipTemplate.clone(true);
  const m = new THREE.Mesh(sphereGeo, fallbackMat); m.position.y = SPHERE_R; return m;
}

function addPlayer(id, name, x = 0, y = 0) {
  if (players.has(id)) { players.get(id).name = name; return players.get(id); }
  const holder = new THREE.Group();
  holder.position.copy(toWorld(x, y, 0)); holder.add(makeVisual()); scene.add(holder);
  holder.visible = id === myId;                // others show once a snapshot has them inside the load circle
  const p = { id, name, holder, heading: 0, buf: [], to: { x, y }, near: false };   // buf: recent snapshot positions on the server's clock; near: inside my load circle
  players.set(id, p); return p;
}
function dropPlayer(id) { const p = players.get(id); if (!p) return; scene.remove(p.holder); players.delete(id); }
const TURN = 4;                                // rad/s (owner, 2026-10-13: 3x slower than the first 12)
// (owner) with no WASD, the ship keeps its last heading: for my own ship only held
// input re-aims it (correction nudges never do); for others, only a sustained real speed does.
function placeShip(p, x, y, dt, face, moving) {
  const prev = p.holder.position, nx = toWorld(x, y, 0);
  const dx = nx.x - prev.x, dz = nx.z - prev.z;
  prev.copy(nx);
  const spd = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
  p.spd = (p.spd || 0) * 0.85 + spd * 0.15;
  let target = null;
  if (face) target = Math.atan2(face.x - nx.x, face.z - nx.z);        // my own ship: toward the input or the reticle
  else if ((moving === undefined ? p.spd > 30 : moving) && spd > 1) target = Math.atan2(dx, dz);   // only frames that really moved
  if (target !== null) {
    let diff = (target - p.heading) % (Math.PI * 2);                  // shortest arc, valid however far the
    if (diff > Math.PI) diff -= Math.PI * 2;                          // heading has accumulated (circling the
    else if (diff < -Math.PI) diff += Math.PI * 2;                    // aim around the ship adds a turn per lap)
    p.heading += Math.max(-TURN * dt, Math.min(TURN * dt, diff));
    p.heading = ((p.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;   // kept bounded
    p.holder.rotation.y = p.heading;
  }
}

// ---- input: WASD relative to the camera; middle-mouse drag (touch: one-finger drag) orbits it ----
const keys = new Set();
let sprint = false;                            // (owner) Shift = sprint (30% faster)
// (owner) X drops a cube where the player is, as a movement reference on the grid; local to this browser
const cubeGeo = new THREE.BoxGeometry(50, 50, 50);
const cubeMat = new THREE.MeshStandardMaterial({ color: 0x8899bb, roughness: 0.6, metalness: 0.1 });
const cubes = [];
function dropCube() {
  if (!haveMe) return;
  const c = new THREE.Mesh(cubeGeo, cubeMat); c.position.copy(toWorld(me.x, me.y, 25)); scene.add(c); cubes.push(c);
  if (cubes.length > 200) scene.remove(cubes.shift());
}
const typing = () => { const el = document.activeElement; return !!el && ((el.tagName === "INPUT" && !["range", "checkbox", "button", "file"].includes(el.type)) || el.tagName === "TEXTAREA" || el.tagName === "SELECT"); };
addEventListener("keydown", (e) => {
  if (typing()) return;
  if (e.code === "Enter") { e.preventDefault(); openChat(); return; }
});
addEventListener("keydown", (e) => { if (typing()) return; if (e.key === "Shift") sprint = true; if (e.code === "KeyX") dropCube(); if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) { keys.add(e.code); e.preventDefault(); } });
addEventListener("keyup", (e) => { if (e.key === "Shift") sprint = false; keys.delete(e.code); });
addEventListener("blur", () => { keys.clear(); sprint = false; });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());   // (owner) the browser's menu never opens in the game
let orbiting = false, aiming = false, aimPin = null, orbitLock = null;   // aimPin: while orbiting the pointer is locked, so the reticle keeps its screen spot; orbitLock: MMB holds the camera frame
const mouse = { x: 0, y: 0 };
let myAim = null;                              // the reticle (three x / z) while aiming, from the last frame
canvas.addEventListener("mousedown", (e) => { if (e.button === 1) { orbiting = true; aimPin = { x: e.clientX, y: e.clientY };
    orbitLock = { dist: viewDist, len: Math.hypot(focus.x - me.x, focus.y - me.y), ang: Math.atan2(focus.x - me.x, focus.y - me.y) - camYaw }; lockPointer(); e.preventDefault(); }
  if (e.button === 2) { aiming = true; mouse.x = e.clientX; mouse.y = e.clientY; e.preventDefault(); } });
addEventListener("mouseup", (e) => { if (e.button === 1) { orbiting = false; aimPin = null; orbitLock = null; if (document.pointerLockElement === canvas) { try { document.exitPointerLock(); } catch {} } } if (e.button === 2) aiming = false; });
// unadjustedMovement avoids the Windows cursor-wrap path whose movementX spikes once per screen width
function lockPointer() {
  let r; try { r = canvas.requestPointerLock({ unadjustedMovement: true }); } catch { try { r = canvas.requestPointerLock(); } catch {} }
  if (r && r.catch) r.catch(() => { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {} });
}
addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; if (orbiting) { let dx = e.movementX; if (Math.abs(dx) > 200) dx = 0; camYaw += dx * 0.005 * cam.rot; } });   // (owner) inverted; spikes from the pointer-lock cursor wrap are dropped
canvas.addEventListener("wheel", (e) => { e.preventDefault(); camDist = Math.min(cam.zmax, Math.max(cam.zmin, camDist * (e.deltaY > 0 ? 1.12 : 0.9))); }, { passive: false });
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
      if (m.cfg) { HEX_FLAT = m.cfg.hexFlat || HEX_FLAT; SPEED = m.cfg.speed || SPEED; ACCEL = m.cfg.accel || ACCEL; BRAKE = m.cfg.brake || BRAKE; STOP_D = m.cfg.stopD || STOP_D; SPRINT = m.cfg.sprint || SPRINT; TURN_ACCEL = m.cfg.turnAccel || TURN_ACCEL; if (m.cfg.cap) CAPC = m.cfg.cap; if (m.cfg.loadR && m.cfg.loadR !== LOAD_R) { LOAD_R = m.cfg.loadR; loadRingFor(LOAD_R); } }
      myId = m.you.id; myName = m.you.name; haveMe = false; mySide = null;
      for (const p of [...players.keys()]) dropPlayer(p);
      for (const r of m.roster || []) addPlayer(r.i, r.n).side = r.s;
      sidePick.hidden = false;                 // (owner) every time they enter, they choose a side first
      if (m.countdown) startCountdown(Date.now() + m.countdown.in, m.countdown.parts);
    } else if (m.t === "spawn") {
      me.x = m.x; me.y = m.y; haveMe = true; mySide = m.s; sidePick.hidden = true;
      focus.x = me.x; focus.y = me.y;
      { const mp = addPlayer(myId, myName, me.x, me.y); mp.side = m.s; mp.near = true; mp.holder.visible = true; }
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
    else if (m.t === "pong") rtt = rtt * 0.7 + Math.max(0, performance.now() - m.ts) * 0.3;
    else if (m.t === "countdown") startCountdown(Date.now() + m.in, m.parts);
    else if (m.t === "update") goUpdating(["web"]);
  };
  ws.onclose = (ev) => {
    if (closedForGood) return;
    if (ev.code === 4001) { location.href = "login.html"; return; }
    if (ev.code === 4002) { closedForGood = true; statusEl.hidden = false; statusEl.textContent = "Playing on another tab or device."; setTimeout(() => location.href = "play.html", 1500); return; }
    statusEl.hidden = false; statusEl.textContent = "Reconnecting…";
    setTimeout(connect, 2000);
  };
}
connect();
let lastH = 0, trailing = 0;                   // trailing: settled-state resends still owed after the last change
function sendDir(d, now) {
  if (!ws || ws.readyState !== 1) return;
  const mine = players.get(myId), h = mine ? Math.round(mine.heading * 100) / 100 : 0;   // the heading, to 0.01 rad
  const changed = d.x !== lastDir.x || d.y !== lastDir.y || d.b !== lastDir.b || h !== lastH;
  // at most 20 sends a second (the frame loop retries, so the latest state always goes out), a heartbeat while
  // moving, and (owner) after movement or rotation stops, the settled state twice more so the server and
  // everyone else land on the real final position and heading
  let due = false;
  if (changed) { if (now - lastSent >= 50) { due = true; trailing = 2; } }
  else if (trailing > 0) { if (now - lastSent >= 100) { due = true; trailing--; } }
  else if ((d.x || d.y) && now - lastSent >= 500) due = true;
  if (!due) return;
  lastDir = d; lastH = h; lastSent = now;
  ws.send(JSON.stringify({ t: "move", x: d.x, y: d.y, b: d.b, h }));
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
  const sprintOn = !!d.b && movingIn && !capOut;
  if (haveMe) cap = sprintOn ? Math.max(0, cap - CAPC.drain * dt) : Math.min(CAPC.max, cap + (movingIn ? CAPC.walk : CAPC.idle) * dt);
  drawCap();
  if (haveMe && (d.x || d.y || vel.x || vel.y)) {   // predict my own movement exactly as the server integrates it
    const spd = SPEED * (sprintOn ? SPRINT : 1), tx = d.x * spd, ty = d.y * spd;
    let a = ACCEL;                             // letting go brakes harder than thrust accelerates, stopping within STOP_D
    if (d.x || d.y) brakeA = 0; else { brakeA = stopRate(Math.hypot(vel.x, vel.y)); a = brakeA; }
    if (d.x || d.y) {                          // a push off the nose gets only part of the acceleration
      const mine = players.get(myId);
      let dh = (Math.atan2(d.x, -d.y) - (mine ? mine.heading : 0)) % (Math.PI * 2); if (dh > Math.PI) dh -= Math.PI * 2; else if (dh < -Math.PI) dh += Math.PI * 2;
      a *= accelShare(dh);
    }
    let ex = tx - vel.x, ey = ty - vel.y; const el = Math.hypot(ex, ey), sv = a * dt;
    if (el > sv) { ex *= sv / el; ey *= sv / el; }
    vel.x += ex; vel.y += ey;
    if (Math.hypot(vel.x, vel.y) < 0.01 && !d.x && !d.y) { vel.x = vel.y = 0; brakeA = 0; }
    const nx = me.x + vel.x * dt, ny = me.y + vel.y * dt;
    if (inside(nx, ny)) { me.x = nx; me.y = ny; }
    else { let lo = 0, hi = 1; for (let i = 0; i < 10; i++) { const mid = (lo + hi) / 2; inside(me.x + (nx - me.x) * mid, me.y + (ny - me.y) * mid) ? (lo = mid) : (hi = mid); } me.x += (nx - me.x) * lo; me.y += (ny - me.y) * lo; vel.x = vel.y = 0; }
  }

  // other ships are drawn 150 ms in the past on the server's clock, between the two snapshots around that moment
  // (only the last two used to be kept, older than the render time, so they stepped and never glided)
  const rt = Date.now() - (srvOff || 0) - 150;
  for (const p of players.values()) {
    if (p.id === myId) {                       // (owner) the nose turns toward the input, not the drift
      // (owner, 2026-10-13) while aiming (right button, with or without the middle), it turns toward the reticle instead
      const face = aiming && myAim ? myAim : (d.x || d.y) ? { x: me.x + d.x, z: -me.y - d.y } : null;
      placeShip(p, me.x, me.y, dt, face, false); continue;
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
  let fx = haveMe ? me.x : 0, fy = haveMe ? me.y : 0, wantDist = camDist;
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
      const DZ = 0.3, rr = Math.min(1, Math.max(0, (r - DZ) / (0.8 - DZ))), ease = rr * rr * (3 - 2 * rr);
      wantDist = Math.max(camDist, Math.min(6000, ease * Ddir));
      let lam = 1 - (m * wantDist / denF - O) / R;                       // ahead of the focus: the circle + exactly the gap
      lam = Math.min(lam, (m * wantDist / denB - S) / R);                // behind it: the ship + its margin
      lam = Math.min(1, Math.max(0, lam)) * ease;
      fx = me.x + a.ux * lam * R; fy = me.y + -a.uz * lam * R;
    }
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
    rangeRing.visible = true; rangeRing.position.set(me.x, 0.36, -me.y);
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
      aimLineGeo.setFromPoints([new THREE.Vector3(me.x, 0.4, -me.y), new THREE.Vector3(a.x, 0.4, a.z)]);
      aimLine.computeLineDistances();
      const ds = Math.max(1, viewDist / 500); aimLineMat.dashSize = 12 * ds; aimLineMat.gapSize = 8 * ds;   // dashes keep their look zoomed out
      aimEnd.position.set(a.x, 0.5, a.z); aimEnd.scale.set(ds, ds, 1);
      aimHit.set(a.x, 0, a.z); myAim = { x: a.x, z: a.z };
    }
  }
  aimLine.visible = aimEnd.visible = aimShown;
  updateStop();
  drawMinimap(nowP);

  if (countAt) {
    const left = Math.ceil((countAt - now) / 1000);
    if (left <= 0) { countAt = 0; goUpdating(); } else countEl.textContent = "Update incoming — " + left + " s";
  }

  renderer.render(scene, camera);
});

// (owner, 2026-10-13) choosing a side: Red or Blue, every time the game is entered
const sidePick = document.getElementById("side-pick");
document.querySelectorAll("#side-pick button").forEach((btn) => btn.addEventListener("click", () => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "side", s: btn.dataset.side }));
}));
// (owner, 2026-10-13) the minimap, always north up: the hexagon, your load circle, and every ship inside it as an
// arrow pointing the way it faces (friendlies, your side, blue; enemies red); a tick from yours for where the camera faces
const mm = document.getElementById("minimap"), mmx = mm && mm.getContext("2d");
let mmNext = 0;
function drawMinimap(now) {
  if (!mmx || now < mmNext) return; mmNext = now + 100;
  const dpr = Math.min(devicePixelRatio || 1, 2), W = mm.clientWidth, H = mm.clientHeight;
  if (mm.width !== Math.round(W * dpr)) { mm.width = Math.round(W * dpr); mm.height = Math.round(H * dpr); }
  mmx.setTransform(dpr, 0, 0, dpr, 0, 0); mmx.clearRect(0, 0, W, H);
  const Rv = (HEX_FLAT / 2) / Math.cos(Math.PI / 6), k = (W / 2 - 3) / Rv, cx = W / 2, cy = H / 2;
  const P = (x, y) => [cx + x * k, cy - y * k];
  mmx.beginPath();
  for (let i = 0; i < 6; i++) { const t = (Math.PI / 3) * i, [X, Y] = P(Math.cos(t) * Rv, Math.sin(t) * Rv); i ? mmx.lineTo(X, Y) : mmx.moveTo(X, Y); }
  mmx.closePath(); mmx.fillStyle = "rgba(10,14,22,0.85)"; mmx.fill(); mmx.strokeStyle = "#4f8fe8"; mmx.lineWidth = 1.5; mmx.stroke();
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
    arrow(p.holder.position.x, -p.holder.position.z, p.heading, mySide && p.side === mySide ? "#4f8fe8" : "#e04848", 3, false);
  }
  if (haveMe) {
    const [X, Y] = P(me.x, me.y), mine = players.get(myId);
    mmx.strokeStyle = "#ffffff"; mmx.lineWidth = 1.5; mmx.beginPath(); mmx.moveTo(X, Y); mmx.lineTo(X + Math.sin(camYaw) * 9, Y - Math.cos(camYaw) * 9); mmx.stroke();
    arrow(me.x, me.y, mine ? mine.heading : 0, "#4f8fe8", 4, true);
  }
}
// (owner, 2026-10-13) chat: Global (everyone) and Faction (your side). Enter opens the box and sends; Escape
// or sending an empty line closes it. Lines are inserted as plain text.
const $i = (id) => document.getElementById(id);
const chatLog = $i("chat-log"), chatIn = $i("chat-in");
let chatCh = "global";
document.querySelectorAll("#chat-tabs button").forEach((b) => b.addEventListener("click", () => { chatCh = b.dataset.ch; document.querySelectorAll("#chat-tabs button").forEach((x) => x.classList.toggle("on", x === b)); if (chatIn) chatIn.focus(); }));
function openChat() { if (!chatIn) return; keys.clear(); sprint = false; chatIn.focus(); }
if (chatIn) chatIn.addEventListener("keydown", (e) => {
  if (e.code === "Enter") { e.preventDefault(); const text = chatIn.value; if (text.trim()) send({ t: "chat", ch: chatCh, text }); chatIn.value = ""; chatIn.blur(); }
  else if (e.code === "Escape") { chatIn.value = ""; chatIn.blur(); }
  e.stopPropagation();
});
function addChat(m) {
  if (!chatLog) return;
  const line = document.createElement("div"); line.className = "chat-line";
  const tag = document.createElement("span"); tag.className = "chat-tag"; tag.textContent = m.ch === "side" ? "[Faction] " : "[Global] ";
  const who = document.createElement("span"); who.className = "chat-who " + (m.s === "red" ? "red" : "blue"); who.textContent = m.n + ": ";
  const txt = document.createElement("span"); txt.textContent = m.text;
  line.append(tag, who, txt); chatLog.appendChild(line);
  while (chatLog.children.length > 60) chatLog.firstChild.remove();
  chatLog.scrollTop = chatLog.scrollHeight;
}
// for the test harness and the console
window.Atamus = { get me() { return { ...me, id: myId }; }, get players() { return [...players.keys()]; }, get near() { return [...players.values()].filter((p) => p.near).map((p) => p.id); }, get ws() { return ws; }, get view() { return viewDist; }, get aim() { return aimLine.visible ? { x: aimHit.x, z: aimHit.z } : null; }, get drawn() { return [...players.values()].map((p) => ({ id: p.id, x: p.holder.position.x, z: p.holder.position.z, h: p.heading, vis: p.holder.visible })); } };
