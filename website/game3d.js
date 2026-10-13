// Atamus 3D (owner, 2026-10-12): the game rebuilt in 3D. One flat world with a 2D
// grid; the border is the same flat-top hexagon, 5 miles flat to flat. Each player is
// a 100 m sphere (yours blue, others red) that travels on the ground plane only — no
// up or down. WASD moves it; wherever the camera faces is forward. The middle mouse
// (touch: a one-finger drag) rotates the camera around the player; it sits at a 75°
// angle looking down toward the player. Everyone in the world sees everyone.
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
let SPEED = 300;                               // m/s
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
// camera settings (owner: sliders): pitch, min / max zoom, rotation speed; kept in this browser
const cam = { pitch: 60, zmin: 600, zmax: 1800, rot: 0.6 };   // (owner, 2026-10-12) defaults: 60d / 600-1800 m / 60%
try { Object.assign(cam, JSON.parse(localStorage.getItem("atamus.cam") || "{}")); } catch {}
const saveCam = () => { try { localStorage.setItem("atamus.cam", JSON.stringify(cam)); } catch {} };
let camDist = Math.min(cam.zmax, Math.max(cam.zmin, 500));
const LEASH = 700;                             // how far the camera's focus may slide from the player while aiming

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

// right-click aim marker (owner): a circle outline on the ground where the mouse points, and a line from the sphere to it
const aimRing = new THREE.Mesh(new THREE.RingGeometry(26, 30, 48), new THREE.MeshBasicMaterial({ color: 0x4f8fe8, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
aimRing.rotation.x = -Math.PI / 2; aimRing.position.y = 0.4; aimRing.visible = false; scene.add(aimRing);
const aimLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const aimLine = new THREE.Line(aimLineGeo, new THREE.LineBasicMaterial({ color: 0x4f8fe8, transparent: true, opacity: 0.7 }));
aimLine.visible = false; scene.add(aimLine);
const raycaster = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), aimHit = new THREE.Vector3();

// ---- players: the ship (owner, 2026-10-12: Combat_Cruiser.glb, Y up, +Z forward) ----
// Scaled to 100 m long, resting on the grid, facing the way it travels. Until the
// model arrives, a sphere stands in and is swapped the moment it loads.
const sphereGeo = new THREE.SphereGeometry(SPHERE_R, 48, 32);
const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x4f8fe8, roughness: 0.35, metalness: 0.15 });
const players = new Map();                     // id -> { holder, heading, name, from:{x,y,ts}, to:{x,y,ts} }
let myId = null;
const me = { x: 0, y: 0 };                     // my ship, predicted locally and corrected by snapshots
let haveMe = false;
let shipTemplate = null, shipMid = SPHERE_R;   // shipMid: the hull's center height, for the camera and the aim line
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
  const p = { id, name, holder, heading: 0, from: { x, y, ts: 0 }, to: { x, y, ts: 0 } };
  players.set(id, p); return p;
}
function dropPlayer(id) { const p = players.get(id); if (!p) return; scene.remove(p.holder); players.delete(id); }
const TURN = 12;                               // rad/s (owner): almost instant, but a real rotation
// (owner) with no right-click and no WASD, the ship keeps its last heading: for my own ship only held
// input re-aims it (correction nudges never do); for others, only a sustained real speed does.
function placeShip(p, x, y, dt, face, moving) {
  const prev = p.holder.position, nx = toWorld(x, y, 0);
  const dx = nx.x - prev.x, dz = nx.z - prev.z;
  prev.copy(nx);
  const spd = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
  p.spd = (p.spd || 0) * 0.85 + spd * 0.15;
  let target = null;
  if (face) target = Math.atan2(face.x - nx.x, face.z - nx.z);        // (owner) right-click: face the aim point
  else if (moving === undefined ? p.spd > 30 : (moving && spd > 1)) target = Math.atan2(dx, dz);
  if (target !== null) {
    let diff = (target - p.heading) % (Math.PI * 2);                  // shortest arc, valid however far the
    if (diff > Math.PI) diff -= Math.PI * 2;                          // heading has accumulated (circling the
    else if (diff < -Math.PI) diff += Math.PI * 2;                    // aim around the ship adds a turn per lap)
    p.heading += Math.max(-TURN * dt, Math.min(TURN * dt, diff));
    p.heading = ((p.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;   // kept bounded
    p.holder.rotation.y = p.heading;
  }
}
let myAim = null;                              // where my aim circle sits, in world coords, while right-clicking

// ---- input: WASD relative to the camera; middle-mouse drag (touch: one-finger drag) orbits it ----
const keys = new Set();
let sprint = false;                            // (owner) Shift = double speed
// (owner) X drops a cube where the player is, as a movement reference on the grid; local to this browser
const cubeGeo = new THREE.BoxGeometry(50, 50, 50);
const cubeMat = new THREE.MeshStandardMaterial({ color: 0x8899bb, roughness: 0.6, metalness: 0.1 });
const cubes = [];
function dropCube() {
  if (!haveMe) return;
  const c = new THREE.Mesh(cubeGeo, cubeMat); c.position.copy(toWorld(me.x, me.y, 25)); scene.add(c); cubes.push(c);
  if (cubes.length > 200) scene.remove(cubes.shift());
}
addEventListener("keydown", (e) => { if (e.key === "Shift") sprint = true; if (e.code === "KeyX") dropCube(); if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) { keys.add(e.code); e.preventDefault(); } });
addEventListener("keyup", (e) => { if (e.key === "Shift") sprint = false; keys.delete(e.code); });
addEventListener("blur", () => { keys.clear(); sprint = false; });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());   // (owner) the browser's menu never opens in the game
let orbiting = false, aiming = false, aimLock = null, orbitLock = null, aimWorldLock = null;   // orbitLock: MMB holds the camera frame; aimWorldLock: and pins the aim circle to its ground spot
const mouse = { x: 0, y: 0 };
canvas.addEventListener("mousedown", (e) => { if (e.button === 1) { orbiting = true; aimLock = { x: e.clientX, y: e.clientY };
    orbitLock = { dist: viewDist, len: Math.hypot(focus.x - me.x, focus.y - me.y), ang: Math.atan2(focus.x - me.x, focus.y - me.y) - camYaw };
    aimWorldLock = myAim && haveMe ? { ox: myAim.x - me.x, oy: -myAim.z - me.y } : null;   // the circle's offset from the ship, so it travels with WASD
    lockPointer(); e.preventDefault(); } if (e.button === 2) { aiming = true; mouse.x = e.clientX; mouse.y = e.clientY; e.preventDefault(); } });
addEventListener("mouseup", (e) => { if (e.button === 1) { orbiting = false; aimLock = null; orbitLock = null; aimWorldLock = null; if (document.pointerLockElement === canvas) { try { document.exitPointerLock(); } catch {} } } if (e.button === 2) { aiming = false; aimWorldLock = null; } });
// unadjustedMovement avoids the Windows cursor-wrap path whose movementX spikes once per screen width
function lockPointer() {
  let r; try { r = canvas.requestPointerLock({ unadjustedMovement: true }); } catch { try { r = canvas.requestPointerLock(); } catch {} }
  if (r && r.catch) r.catch(() => { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {} });
}
addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; if (orbiting) { let dx = e.movementX; if (Math.abs(dx) > 200) dx = 0; camYaw += dx * 0.005 * cam.rot; } });   // (owner) inverted; spikes from the pointer-lock cursor wrap are dropped
canvas.addEventListener("wheel", (e) => { e.preventDefault(); camDist = Math.min(cam.zmax, Math.max(cam.zmin, camDist * (e.deltaY > 0 ? 1.12 : 0.9))); }, { passive: false });
// touch: one finger orbits (drag = drag), two fingers pinch the distance
let touch1 = null, pinch = 0;
canvas.addEventListener("touchstart", (e) => { if (e.touches.length === 1) touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
canvas.addEventListener("touchmove", (e) => {
  if (e.touches.length === 1 && touch1) { camYaw += (e.touches[0].clientX - touch1.x) * 0.006 * cam.rot; touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
  if (e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pinch) camDist = Math.min(cam.zmax, Math.max(cam.zmin, camDist * pinch / d)); pinch = d; }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener("touchend", () => { touch1 = null; pinch = 0; }, { passive: true });

function inputDir() {                          // forward = where the camera faces, on the ground
  let f = 0, r = 0;
  if (keys.has("KeyW")) f += 1; if (keys.has("KeyS")) f -= 1;
  if (keys.has("KeyD")) r += 1; if (keys.has("KeyA")) r -= 1;
  if (!f && !r) return { x: 0, y: 0, b: sprint ? 1 : 0 };
  const n = Math.hypot(f, r); f /= n; r /= n;
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  return { x: f * sin + r * cos, y: f * cos - r * sin, b: sprint ? 1 : 0 };   // game plane: +y north at yaw 0
}

// ---- socket ----
let ws = null, srvBuild = "", lastDir = { x: 0, y: 0, b: 0 }, lastSent = 0, closedForGood = false;
let rtt = 80, pingTimer = 0;                   // measured round trip, for latency-compensated correction
const wsUrl = () => (typeof API_BASE !== "undefined" ? API_BASE : location.origin).replace(/^http/, "ws") + "/ws" + (typeof deviceId === "function" ? "?d=" + deviceId() : "");
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
      if (m.cfg) { HEX_FLAT = m.cfg.hexFlat || HEX_FLAT; SPEED = m.cfg.speed || SPEED; }
      myId = m.you.id; me.x = m.you.x; me.y = m.you.y; haveMe = true;
      focus.x = me.x; focus.y = me.y;
      for (const p of [...players.keys()]) dropPlayer(p);
      for (const r of m.roster || []) addPlayer(r.i, r.n);
      addPlayer(myId, m.you.name, me.x, me.y);
      if (m.countdown) startCountdown(Date.now() + m.countdown.in, m.countdown.parts);
    } else if (m.t === "snap") {
      for (const [id, cx, cy] of m.p) {
        const x = cx / 100, y = cy / 100;
        if (id === myId) {                     // soft-correct my prediction toward where the server will be once
          const lead = (rtt / 2 + 50) / 1000;  // it has heard my latest input (its snapshot is ~half a round trip old)
          const lspd = SPEED * (lastDir.b ? 2 : 1);
          let tx = x + lastDir.x * lspd * lead, ty = y + lastDir.y * lspd * lead;
          if (!inside(tx, ty)) { tx = x; ty = y; }
          const err = Math.hypot(tx - me.x, ty - me.y);
          if (err > lspd * 0.4) { me.x = tx; me.y = ty; } else { me.x += (tx - me.x) * 0.1; me.y += (ty - me.y) * 0.1; }
          continue;
        }
        const p = players.get(id) || addPlayer(id, "");
        p.from = p.to; p.to = { x, y, ts: performance.now() };   // our own clock: no server skew in the interpolation
      }
    } else if (m.t === "join") { if (m.i !== myId) addPlayer(m.i, m.n); }
    else if (m.t === "leave") { if (m.i !== myId) dropPlayer(m.i); }
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
function sendDir(d, now) {
  if (!ws || ws.readyState !== 1) return;
  const changed = d.x !== lastDir.x || d.y !== lastDir.y || d.b !== lastDir.b;
  // at most 20 sends a second (orbiting the camera while moving changes the direction every mouse move;
  // the frame loop retries, so the latest direction always goes out), plus a heartbeat while moving
  const due = changed ? now - lastSent >= 50 : (d.x || d.y) && now - lastSent >= 500;
  if (!due) return;
  lastDir = d; lastSent = now;
  ws.send(JSON.stringify({ t: "move", x: d.x, y: d.y, b: d.b }));
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
  if (haveMe && (d.x || d.y)) {                // predict my own movement; the border stops me, as on the server
    const spd = SPEED * (d.b ? 2 : 1);
    const nx = me.x + d.x * spd * dt, ny = me.y + d.y * spd * dt;
    if (inside(nx, ny)) { me.x = nx; me.y = ny; }
    else { let lo = 0, hi = 1; for (let i = 0; i < 10; i++) { const mid = (lo + hi) / 2; inside(me.x + (nx - me.x) * mid, me.y + (ny - me.y) * mid) ? (lo = mid) : (hi = mid); } me.x += (nx - me.x) * lo; me.y += (ny - me.y) * lo; }
  }

  const rt = performance.now() - 120;          // others: drawn 120 ms in the past, between snapshots
  for (const p of players.values()) {
    if (p.id === myId) { placeShip(p, me.x, me.y, dt, myAim, !!(d.x || d.y)); continue; }   // (owner) the ship always faces the circle while it's active
    const span = p.to.ts - p.from.ts;
    let x = p.to.x, y = p.to.y;
    if (span > 0 && rt < p.to.ts) { const t = Math.max(0, (rt - p.from.ts) / span); x = p.from.x + (p.to.x - p.from.x) * t; y = p.from.y + (p.to.y - p.from.y) * t; }
    placeShip(p, x, y, dt);
  }

  // right-click aiming (owner): a circle where the mouse points on the ground, a line from the sphere to it; the
  // camera's focus slides toward a point between the player and the circle, zooming out to keep the player in shot
  let fx = haveMe ? me.x : 0, fy = haveMe ? me.y : 0, wantDist = camDist, hit = false;
  myAim = null;
  if (aiming && haveMe) {
    let gx, gy;
    if (orbiting && aimWorldLock) { gx = me.x + aimWorldLock.ox; gy = me.y + aimWorldLock.oy; hit = true; }   // (owner) MMB pins the circle at its offset from the ship: a fixed ground spot standing still, riding along under WASD, never swept by the orbit
    else {
      const px = aimLock ? aimLock.x : mouse.x, py = aimLock ? aimLock.y : mouse.y;
      raycaster.setFromCamera({ x: (px / innerWidth) * 2 - 1, y: -(py / innerHeight) * 2 + 1 }, camera);
      if (raycaster.ray.intersectPlane(groundPlane, aimHit)) { hit = true; gx = aimHit.x; gy = -aimHit.z; if (orbiting) aimWorldLock = { ox: gx - me.x, oy: gy - me.y }; }
    }
    if (hit) {
      aimRing.position.set(gx, 0.4, -gy);
      const rs = Math.max(1, viewDist / 500); aimRing.scale.set(rs, rs, 1);   // stays readable zoomed out
      myAim = { x: gx, z: -gy };
      aimLineGeo.setFromPoints([toWorld(me.x, me.y, shipMid), new THREE.Vector3(gx, 0.4, -gy)]);
      if (!orbitLock) {                                                // orbiting holds the frame: the aim stops steering it
        let ox = (gx - me.x) / 2, oy = (gy - me.y) / 2;                  // between the player and the circle
        const ol = Math.hypot(ox, oy);
        if (ol > LEASH) { ox *= LEASH / ol; oy *= LEASH / ol; }          // leashed: never super far out
        fx = me.x + ox; fy = me.y + oy;
        wantDist = Math.min(cam.zmax, Math.max(camDist, Math.min(ol, LEASH) * 3));   // player stays in the shot
      }
    }
  }
  if (orbitLock && haveMe) {                   // (owner) MMB: the camera and its target orbit the player at the settings they had
    const th = camYaw + orbitLock.ang;
    fx = me.x + Math.sin(th) * orbitLock.len; fy = me.y + Math.cos(th) * orbitLock.len;
    wantDist = orbitLock.dist;
  }
  aimRing.visible = aimLine.visible = aiming && hit;
  const k = 1 - Math.exp(-dt * 6);                                       // the focus and zoom ease, in and back
  focus.x += (fx - focus.x) * k; focus.y += (fy - focus.y) * k;
  viewDist += (wantDist - viewDist) * k;

  const target = toWorld(focus.x, focus.y, shipMid);
  const pr = THREE.MathUtils.degToRad(cam.pitch);
  camOff.set(-Math.sin(camYaw), 0, Math.cos(camYaw)).multiplyScalar(Math.cos(pr) * viewDist);   // behind the player: W flies toward where the camera faces
  camOff.y = Math.sin(pr) * viewDist;
  camera.position.copy(target).add(camOff);
  camera.lookAt(target);

  if (countAt) {
    const left = Math.ceil((countAt - now) / 1000);
    if (left <= 0) { countAt = 0; goUpdating(); } else countEl.textContent = "Update incoming — " + left + " s";
  }

  renderer.render(scene, camera);
});

// (owner) camera sliders: pitch, min / max zoom (a two-handle slider), rotation speed
const $ = (id) => document.getElementById(id);
const sl = { pitch: $("sl-pitch"), zmin: $("sl-zmin"), zmax: $("sl-zmax"), rot: $("sl-rot"),
             pitchV: $("sl-pitch-v"), zoomV: $("sl-zoom-v"), rotV: $("sl-rot-v") };
function showCam() {
  sl.pitch.value = cam.pitch; sl.zmin.value = cam.zmin; sl.zmax.value = cam.zmax; sl.rot.value = Math.round(cam.rot * 100);
  sl.pitchV.textContent = cam.pitch + "\u00b0"; sl.zoomV.textContent = cam.zmin + "\u2013" + cam.zmax + " m"; sl.rotV.textContent = Math.round(cam.rot * 100) + "%";
}
if (sl.pitch) {
  showCam();
  sl.pitch.addEventListener("input", () => { cam.pitch = Math.min(89, Math.max(15, +sl.pitch.value || 75)); saveCam(); showCam(); });
  sl.rot.addEventListener("input", () => { cam.rot = Math.min(3, Math.max(0.1, (+sl.rot.value || 100) / 100)); saveCam(); showCam(); });
  const zoom = () => {
    let a = +sl.zmin.value || 180, b = +sl.zmax.value || 2200;
    if (a > b - 100) { if (document.activeElement === sl.zmin) a = b - 100; else b = a + 100; }
    cam.zmin = Math.max(100, a); cam.zmax = Math.min(8000, b);
    camDist = Math.min(cam.zmax, Math.max(cam.zmin, camDist)); saveCam(); showCam();
  };
  sl.zmin.addEventListener("input", zoom); sl.zmax.addEventListener("input", zoom);
}

// for the test harness and the console
window.Atamus = { get me() { return { ...me, id: myId }; }, get players() { return [...players.keys()]; }, get ws() { return ws; } };
