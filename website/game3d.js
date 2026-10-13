// Atamus 3D (owner, 2026-10-12): the game rebuilt in 3D. One flat world with a 2D
// grid; the border is the same flat-top hexagon, 5 miles flat to flat. Each player is
// a 100 m sphere (yours blue, others red) that travels on the ground plane only — no
// up or down. WASD moves it; wherever the camera faces is forward. The middle mouse
// (touch: a one-finger drag) rotates the camera around the player; it sits at a 75°
// angle looking down toward the player. Everyone in the world sees everyone.
import * as THREE from "./vendor/three.module.js";

// (owner) returning players come through the log-in page first (live site only)
if (typeof needLogin === "function" && needLogin()) location.replace("login.html");

const statusEl = document.getElementById("status");
const countEl = document.getElementById("countdown");
const WEB_BUILD = (document.querySelector('meta[name="atamus-build"]') || {}).content || "";

// ---- world constants (the server's hello can override them) ----
let HEX_FLAT = 5 * 1609.344;                   // 5 miles flat to flat
let SPHERE_R = 50;                             // 100 m diameter
let SPEED = 60;                                // m/s
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

const camera = new THREE.PerspectiveCamera(60, 1, 1, 30000);
let camYaw = 0;                                // around the player
const CAM_PITCH = THREE.MathUtils.degToRad(75); // (owner) 75° looking down toward the player
let camDist = 500;

// ground + the 2D grid
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ color: 0x0a0e16, roughness: 1, metalness: 0 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const grid = new THREE.GridHelper(16000, 160, 0x33455f, 0x243450);   // 100 m cells
grid.position.y = 0.2; scene.add(grid);

// the hexagon border: a flat glowing band on the ground (flat edges top and bottom, points east and west)
function hexShapeBand() {
  const pts = (r) => { const a = r / Math.cos(Math.PI / 6); const out = []; for (let i = 0; i < 6; i++) { const t = (Math.PI / 3) * i; out.push(new THREE.Vector2(Math.cos(t) * a, Math.sin(t) * a)); } return out; };
  const shape = new THREE.Shape(pts(HEX_FLAT / 2));
  shape.holes.push(new THREE.Path(pts(HEX_FLAT / 2 - 25).reverse()));
  const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4f8fe8, transparent: true, opacity: 0.9 }));
}
const border = hexShapeBand(); border.position.y = 0.3; scene.add(border);

// ---- players ----
const sphereGeo = new THREE.SphereGeometry(SPHERE_R, 48, 32);
const mineMat = new THREE.MeshStandardMaterial({ color: 0x4f8fe8, roughness: 0.35, metalness: 0.15 });
const otherMat = new THREE.MeshStandardMaterial({ color: 0xd05050, roughness: 0.35, metalness: 0.15 });
const players = new Map();                     // id -> { mesh, name, from:{x,y,ts}, to:{x,y,ts} }
let myId = null;
const me = { x: 0, y: 0 };                     // my sphere, predicted locally and corrected by snapshots
let haveMe = false;

function addPlayer(id, name, x = 0, y = 0) {
  if (players.has(id)) { players.get(id).name = name; return players.get(id); }
  const mesh = new THREE.Mesh(sphereGeo, id === myId ? mineMat : otherMat);
  mesh.position.copy(toWorld(x, y, SPHERE_R)); scene.add(mesh);
  const p = { id, name, mesh, from: { x, y, ts: 0 }, to: { x, y, ts: 0 } };
  players.set(id, p); return p;
}
function dropPlayer(id) { const p = players.get(id); if (!p) return; scene.remove(p.mesh); players.delete(id); }
const rollAxis = new THREE.Vector3(), rollQ = new THREE.Quaternion();
function placeSphere(p, x, y) {
  const prev = p.mesh.position, nx = toWorld(x, y, SPHERE_R);
  const dx = nx.x - prev.x, dz = nx.z - prev.z, d = Math.hypot(dx, dz);
  if (d > 0.001) {                             // roll as it travels
    rollAxis.set(dz, 0, -dx).normalize(); rollQ.setFromAxisAngle(rollAxis, d / SPHERE_R);
    p.mesh.quaternion.premultiply(rollQ);
  }
  prev.copy(nx);
}

// ---- input: WASD relative to the camera; middle-mouse drag (touch: one-finger drag) orbits it ----
const keys = new Set();
addEventListener("keydown", (e) => { if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) { keys.add(e.code); e.preventDefault(); } });
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
canvas.addEventListener("contextmenu", (e) => e.preventDefault());   // (owner) the browser's menu never opens in the game
let orbiting = false;
canvas.addEventListener("mousedown", (e) => { if (e.button === 1) { orbiting = true; e.preventDefault(); } });
addEventListener("mouseup", (e) => { if (e.button === 1) orbiting = false; });
addEventListener("mousemove", (e) => { if (orbiting) camYaw -= e.movementX * 0.005; });
canvas.addEventListener("wheel", (e) => { e.preventDefault(); camDist = Math.min(4000, Math.max(180, camDist * (e.deltaY > 0 ? 1.12 : 0.9))); }, { passive: false });
// touch: one finger orbits (drag = drag), two fingers pinch the distance
let touch1 = null, pinch = 0;
canvas.addEventListener("touchstart", (e) => { if (e.touches.length === 1) touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
canvas.addEventListener("touchmove", (e) => {
  if (e.touches.length === 1 && touch1) { camYaw -= (e.touches[0].clientX - touch1.x) * 0.006; touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
  if (e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pinch) camDist = Math.min(4000, Math.max(180, camDist * pinch / d)); pinch = d; }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener("touchend", () => { touch1 = null; pinch = 0; }, { passive: true });

function inputDir() {                          // forward = where the camera faces, on the ground
  let f = 0, r = 0;
  if (keys.has("KeyW")) f += 1; if (keys.has("KeyS")) f -= 1;
  if (keys.has("KeyD")) r += 1; if (keys.has("KeyA")) r -= 1;
  if (!f && !r) return { x: 0, y: 0 };
  const n = Math.hypot(f, r); f /= n; r /= n;
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  return { x: f * sin + r * cos, y: f * cos - r * sin };   // game plane: +y north at yaw 0
}

// ---- socket ----
let ws = null, srvBuild = "", lastDir = { x: 0, y: 0 }, lastSent = 0, closedForGood = false;
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
      for (const p of [...players.keys()]) dropPlayer(p);
      for (const r of m.roster || []) addPlayer(r.i, r.n);
      addPlayer(myId, m.you.name, me.x, me.y).mesh.material = mineMat;
      if (m.countdown) startCountdown(Date.now() + m.countdown.in, m.countdown.parts);
    } else if (m.t === "snap") {
      for (const [id, cx, cy] of m.p) {
        const x = cx / 100, y = cy / 100;
        if (id === myId) {                     // soft-correct my prediction toward where the server will be once
          const lead = (rtt / 2 + 50) / 1000;  // it has heard my latest input (its snapshot is ~half a round trip old)
          let tx = x + lastDir.x * SPEED * lead, ty = y + lastDir.y * SPEED * lead;
          if (!inside(tx, ty)) { tx = x; ty = y; }
          const err = Math.hypot(tx - me.x, ty - me.y);
          if (err > 25) { me.x = tx; me.y = ty; } else { me.x += (tx - me.x) * 0.1; me.y += (ty - me.y) * 0.1; }
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
  const changed = d.x !== lastDir.x || d.y !== lastDir.y;
  // at most 20 sends a second (orbiting the camera while moving changes the direction every mouse move;
  // the frame loop retries, so the latest direction always goes out), plus a heartbeat while moving
  const due = changed ? now - lastSent >= 50 : (d.x || d.y) && now - lastSent >= 500;
  if (!due) return;
  lastDir = d; lastSent = now;
  ws.send(JSON.stringify({ t: "move", x: d.x, y: d.y }));
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
const clock = new THREE.Clock();
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
const camOff = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1), now = Date.now();

  const d = inputDir(); sendDir(d, now);
  if (haveMe && (d.x || d.y)) {                // predict my own movement; the border stops me, as on the server
    const nx = me.x + d.x * SPEED * dt, ny = me.y + d.y * SPEED * dt;
    if (inside(nx, ny)) { me.x = nx; me.y = ny; }
    else { let lo = 0, hi = 1; for (let i = 0; i < 10; i++) { const mid = (lo + hi) / 2; inside(me.x + (nx - me.x) * mid, me.y + (ny - me.y) * mid) ? (lo = mid) : (hi = mid); } me.x += (nx - me.x) * lo; me.y += (ny - me.y) * lo; }
  }

  const rt = performance.now() - 120;          // others: drawn 120 ms in the past, between snapshots
  for (const p of players.values()) {
    if (p.id === myId) { placeSphere(p, me.x, me.y); continue; }
    const span = p.to.ts - p.from.ts;
    let x = p.to.x, y = p.to.y;
    if (span > 0 && rt < p.to.ts) { const t = Math.max(0, (rt - p.from.ts) / span); x = p.from.x + (p.to.x - p.from.x) * t; y = p.from.y + (p.to.y - p.from.y) * t; }
    placeSphere(p, x, y);
  }

  const target = haveMe ? toWorld(me.x, me.y, SPHERE_R) : toWorld(0, 0, SPHERE_R);
  camOff.set(-Math.sin(camYaw), 0, Math.cos(camYaw)).multiplyScalar(Math.cos(CAM_PITCH) * camDist);   // behind the player: W flies toward where the camera faces
  camOff.y = Math.sin(CAM_PITCH) * camDist;
  camera.position.copy(target).add(camOff);
  camera.lookAt(target);

  if (countAt) {
    const left = Math.ceil((countAt - now) / 1000);
    if (left <= 0) { countAt = 0; goUpdating(); } else countEl.textContent = "Update incoming — " + left + " s";
  }

  renderer.render(scene, camera);
});

// for the test harness and the console
window.Atamus = { get me() { return { ...me, id: myId }; }, get players() { return [...players.keys()]; }, get ws() { return ws; } };
