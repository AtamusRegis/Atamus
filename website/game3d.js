// Atamus 3D (owner, 2026-10-12): the game rebuilt in 3D. One flat world with a 2D
// grid; the border is the same flat-top hexagon, 5 miles flat to flat. Each player is
// a 100 m sphere (yours blue, others red) that travels on the ground plane only — no
// up or down. WASD moves it; wherever the camera faces is forward. The middle mouse
// (touch: a one-finger drag) rotates the camera around the player; it sits at a 75°
// angle looking down toward the player. Everyone in the world sees everyone.
import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { A, mountEditor, mountInventory } from "./arsenal.js?v=1791905438";

// (owner) returning players come through the log-in page first (live site only)
if (typeof needLogin === "function" && needLogin()) location.replace("login.html");

const statusEl = document.getElementById("status");
const countEl = document.getElementById("countdown");
const WEB_BUILD = (document.querySelector('meta[name="atamus-build"]') || {}).content || "";

// ---- world constants (the server's hello can override them) ----
let HEX_FLAT = 126_000;                        // 126 km flat to flat
let SPHERE_R = 50;                             // 100 m diameter
let SPEED = 300;                               // m/s
let ACCEL = 200, BRAKE = 400, TURN_ACCEL = 0.3;   // (owner) weight: as on the server (world3d.js)
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
// camera settings (owner: sliders): pitch, min / max zoom, rotation speed; kept in this browser
const cam = { pitch: 60, zmin: 600, zmax: 1800, rot: 0.6, leash: 700, over: 100,
  dir: { n: 200, ne: 0, e: 200, se: 0, s: 200, sw: 0, w: 200, nw: 0 } };   // (owner, 2026-10-13) overflow 100, N S E W 200, diagonals 0   // (owner) leash: max reticle distance; over: base overflow; dir: the compass's per-direction overflow delta (m)
// only the shown tuning values are read back from this browser; the hidden settings always use the
// owner's fixed values above
try {
  const sv = JSON.parse(localStorage.getItem("atamus.cam") || "{}");
  if (Number.isFinite(sv.leash)) cam.leash = Math.min(3000, Math.max(100, sv.leash));
  if (sv.dirv === 3 && Number.isFinite(sv.over)) cam.over = Math.min(200, Math.max(0, sv.over));   // v3: the owner's new defaults replace older saved tuning once
} catch {}
const saveCam = () => { try { localStorage.setItem("atamus.cam", JSON.stringify({ leash: cam.leash, over: cam.over, dirv: 3 })); } catch {} };
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

// right-click aim marker (owner): a circle outline on the ground where the mouse points, and a line from the sphere to it
const aimRing = new THREE.Mesh(new THREE.RingGeometry(26, 30, 48), new THREE.MeshBasicMaterial({ color: 0x4f8fe8, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
aimRing.rotation.x = -Math.PI / 2; aimRing.position.y = 0.4; aimRing.visible = false; scene.add(aimRing);
// (owner) the range circle around the player: everywhere the reticle can be aimed (visible for now)
let rangeRing = null, rangeRingR = 0;
// (owner, 2026-10-13) the interaction circle: 20 m out from the hull (the ship is 100 m long, so 70 m from its center)
const INTERACT_R = 70;
const interactRing = new THREE.Mesh(new THREE.RingGeometry(INTERACT_R - 2, INTERACT_R, 96), new THREE.MeshBasicMaterial({ color: 0x5fd0a0, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
interactRing.rotation.x = -Math.PI / 2; interactRing.visible = false; scene.add(interactRing);
// (owner, 2026-10-13) the hotbar's weapons come from the arsenal (arsenal.js): each equipped weapon has an aim
// range, optimal range, spread falloff, spread, aim speed, move spread, rate, auto, interaction, magazine and
// reload; the loaded ammo decides what it fires (bullet, missile, beam). An empty slot aims but does nothing.
A.load();
let slot = 0;
const NOWEAPON = { name: "", slot: 0, ammo: [], range: 0, optimal: 1e9, falloff: 0, spread: 0, speed: 0, move: 0, rate: 1, auto: false, interact: false, mag: 0, reload: 0 };
const W = () => A.weapon(slot) || NOWEAPON;
const AM = () => A.loaded(slot);
const isBeam = () => { const a = AM(); return !!(a && a.type === "beam"); };
// the spread lines: red at full spread, orange midway, green as they close on the aim line; a light fill between
const spreadMat = new THREE.LineBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.95 });
const mkLine = () => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)); const l = new THREE.Line(g, spreadMat); l.visible = false; l.frustumCulled = false; scene.add(l); return l; };
const spreadL = mkLine(), spreadR = mkLine();
const FAN = 32;
const fanGeo = new THREE.BufferGeometry();
fanGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((FAN + 2) * 3), 3));
{ const idx = []; for (let i = 1; i <= FAN; i++) idx.push(0, i, i + 1); fanGeo.setIndex(idx); }
const fanMat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
const spreadFan = new THREE.Mesh(fanGeo, fanMat); spreadFan.visible = false; spreadFan.frustumCulled = false; scene.add(spreadFan);
// (owner's diagram) the wedge is closed by an arc at the aim range; the aim line itself runs on to the reticle
const arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((FAN + 1) * 3), 3));
const spreadArc = new THREE.Line(arcGeo, spreadMat); spreadArc.visible = false; spreadArc.frustumCulled = false; scene.add(spreadArc);
let spreadCur = 0, lastBearing = null, wasAiming = false, aimSlot = -1;
// (owner, 2026-10-13) each item's optimal range: a dotted, transparent gray circle while aiming. Inside it the
// aim line is a single line; past it the line opens into its own wedge, 0.5 degrees either side at the optimal
// range and wider by the item's falloff (degrees per 100 m) beyond, the spread a shot would get past optimal
let optRing = null, optR = 0;
const optMat = new THREE.LineDashedMaterial({ color: 0xa0a8b4, transparent: true, opacity: 0.45, dashSize: 4, gapSize: 6 });
function optRingFor(R) {
  if (optRing && optR === R) return;
  if (optRing) { scene.remove(optRing); optRing.geometry.dispose(); }
  const pts = []; for (let i = 0; i <= 180; i++) { const t = (i / 180) * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(t) * R, 0, Math.cos(t) * R)); }
  optRing = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), optMat); optRing.computeLineDistances();
  optRing.frustumCulled = false; optRing.visible = false; optR = R; scene.add(optRing);
}
const coneMat = new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, dashSize: 12, gapSize: 8 });
const mkCone = () => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)); const l = new THREE.Line(g, coneMat); l.visible = false; l.frustumCulled = false; scene.add(l); return l; };
const coneL = mkCone(), coneR = mkCone();
const coneFanGeo = new THREE.BufferGeometry();
coneFanGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
const coneFan = new THREE.Mesh(coneFanGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
coneFan.visible = false; coneFan.frustumCulled = false; scene.add(coneFan);
let aimCone = 0;                               // the aim line's own half-angle (degrees), 0 inside optimal range
// (owner, 2026-10-13) combat. Left click while aiming fires the equipped weapon's loaded ammo:
// - bullets fly straight from the ship for their lifetime, in a random direction inside the spread;
// - missiles home on the locked target (the ship nearest the reticle; the longer it's held there, the harder the
//   missile turns), simulated by the server and drawn from its snapshots;
// - beams run from the ship to the aim point (no spread) while the button is held, using ammo per second.
// Each bullet or missile shot widens the spread 1 degree either side. The server checks hits and applies damage
// (full to the weapon's optimal range, minus the ammo's falloff percent per 100 m beyond); friendly fire is on.
let BULLET_SPEED = 1500;
const shots = [];                              // bullets in flight: { key, m, x, y, ux, uy, spd, life, age }
const bulletGeo = new THREE.BoxGeometry(3, 3, 40);
const bulletMats = { mine: new THREE.MeshBasicMaterial({ color: 0xbfefff }), friend: new THREE.MeshBasicMaterial({ color: 0x6fa8ff }), enemy: new THREE.MeshBasicMaterial({ color: 0xff6a50 }) };
function spawnShot(key, x, y, ux, uy, spd, life, kind) {
  const m = new THREE.Mesh(bulletGeo, bulletMats[kind]); m.rotation.y = Math.atan2(ux, -uy); m.frustumCulled = false;
  m.position.set(x, shipMid, -y); scene.add(m);
  shots.push({ key, m, x, y, ux, uy, spd, life, age: 0 });
}
function removeShot(key) { const i = shots.findIndex((q) => q.key === key); if (i >= 0) { scene.remove(shots[i].m); shots.splice(i, 1); } }
function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const q = shots[i]; q.age += dt;
    if (q.age >= q.life) { scene.remove(q.m); shots.splice(i, 1); continue; }
    const d = q.spd * q.age; q.m.position.set(q.x + q.ux * d, shipMid, -(q.y + q.uy * d));
  }
}
// missiles, from the server's snapshots (extrapolated along their last motion between snapshots)
const missileGeo = new THREE.ConeGeometry(7, 34, 10); missileGeo.rotateX(Math.PI / 2);
const missileMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
const missiles = new Map();                    // id -> { m, x, y, vx, vy, t }
function missileSnap(list, ts) {
  const seen = new Set();
  for (const [id, x10, y10, h1000] of list || []) {
    seen.add(id); const x = x10 / 10, y = y10 / 10, h = h1000 / 1000;
    let q = missiles.get(id);
    if (!q) { const m = new THREE.Mesh(missileGeo, missileMat); m.frustumCulled = false; scene.add(m); q = { m, x, y, vx: 0, vy: 0, t: ts }; missiles.set(id, q); }
    else { const dtq = Math.max(1, ts - q.t) / 1000; q.vx = (x - q.x) / dtq; q.vy = (y - q.y) / dtq; }
    q.x = x; q.y = y; q.t = ts; q.m.rotation.y = h;
  }
  for (const [id, q] of missiles) if (!seen.has(id)) { scene.remove(q.m); missiles.delete(id); }
}
function updateMissiles() {
  const st = Date.now() - (srvOff || 0);
  for (const q of missiles.values()) { const e = Math.min(0.2, Math.max(0, (st - q.t) / 1000)); q.m.position.set(q.x + q.vx * e, shipMid, -(q.y + q.vy * e)); }
}
// missile lock: the ship nearest the reticle (within a radius that grows with zoom); held there it locks
let lockTgt = null, lockT = 0;
const lockRing = new THREE.Mesh(new THREE.RingGeometry(70, 77, 48), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
lockRing.rotation.x = -Math.PI / 2; lockRing.visible = false; scene.add(lockRing);
const lockAmount = () => { const am = AM(); return lockTgt && am ? Math.min(1, lockT / am.lock) : 0; };
function updateLock(dt) {
  const am = AM(), on = aiming && haveMe && !!myAim && !!A.weapon(slot) && !!am && am.type === "missile";
  if (!on) { lockTgt = null; lockT = 0; lockRing.visible = false; return; }
  let best = null, bd = Math.max(120, viewDist / 6);
  for (const p of players.values()) {
    if (p.id === myId) continue; const q = p.holder.position, d = Math.hypot(q.x - myAim.x, q.z - myAim.z);
    if (d < bd) { bd = d; best = p; }
  }
  if (!best) { lockTgt = null; lockT = 0; lockRing.visible = false; return; }
  if (best.id !== lockTgt) { lockTgt = best.id; lockT = 0; }
  lockT += dt;
  const lk = lockAmount(), q = best.holder.position, k = 1 + (1 - lk) * 0.6;
  lockRing.visible = true; lockRing.position.set(q.x, 0.8, q.z); lockRing.scale.set(k, k, 1);
  lockRing.material.opacity = 0.25 + 0.6 * lk; lockRing.material.color.setHex(lk >= 1 ? 0xff3020 : 0xffa040);
}
// beams: a bright bar from the ship toward the aim (others' from the server's snapshots)
const beamGeo = new THREE.BoxGeometry(1, 1, 1);
const mkBeam = (color) => { const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })); m.visible = false; m.frustumCulled = false; scene.add(m); return m; };
function placeBeam(m, x, y, ux, uy, len) {
  m.visible = len > 1; if (!m.visible) return;
  m.position.set(x + ux * len / 2, shipMid, -(y + uy * len / 2)); m.rotation.y = Math.atan2(ux, -uy); m.scale.set(6, 3, len);
}
const myBeam = mkBeam(0xffe08a);
let beamOn = false, beamSent = 0;
const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
function beamOff() { if (beamOn) send({ t: "beam", on: 0 }); beamOn = false; myBeam.visible = false; }
let firing = false, firePending = false, lastShot = -1e9, aimSteady = true, steadyNow = true, cid = 0;
function tryFire(now, dt) {
  const w = A.weapon(slot), am = AM();
  const want = firing && aiming && !!myAim && haveMe && !!w && !w.interact && !invOpen;
  if (am && am.type === "beam") {
    if (want && !A.reloading(slot, now) && A.consume(slot, w.rate * dt)) {
      const bx = myAim.x - me.x, by = -myAim.z - me.y, l = Math.hypot(bx, by) || 1, ux = bx / l, uy = by / l, len = Math.min(w.range, l);
      placeBeam(myBeam, me.x, me.y, ux, uy, len); beamOn = true; lastShot = now;
      if (now - beamSent > 100) { beamSent = now; send({ t: "beam", on: 1, x: ux, y: uy, len, dps: am.damage, opt: w.optimal, fall: am.falloff }); }
    } else beamOff();
    return;
  }
  beamOff();
  if (!want || !am || A.reloading(slot, now)) return;
  if (now - lastShot < 1000 / w.rate || (!w.auto && !firePending)) return;
  firePending = false;
  if (!A.consume(slot, 1)) return;             // an empty magazine: R reloads
  lastShot = now;
  const b = Math.atan2(myAim.x - me.x, myAim.z + me.y);                 // the aim's bearing (three: x, z)
  const h = THREE.MathUtils.degToRad(Math.max(spreadCur, aimCone));
  const ang = b + (Math.random() * 2 - 1) * h;                         // somewhere inside the spread
  const ux = Math.sin(ang), uy = -Math.cos(ang);                       // game plane: +y is -z
  const c = ++cid;
  if (am.type === "bullet") spawnShot(myId + ":" + c, me.x, me.y, ux, uy, am.speed, am.lifetime, "mine");
  send({ t: "fire", k: am.type === "missile" ? "m" : "b", c, x: ux, y: uy, spd: am.speed, life: am.lifetime, dmg: am.damage, opt: w.optimal, fall: am.falloff, turn: am.turn, lock: lockAmount(), tgt: lockTgt });
  // each shot opens the spread 1 degree; holding still and steady (no WASD, no aim swing) it opens only up to
  // the yellow point (owner), moving or swinging the aim lets it open to the full spread
  const top = steadyNow ? w.spread * YELLOW : w.spread;
  spreadCur = Math.min(Math.max(top, aimCone), Math.max(spreadCur, Math.min(aimCone, top)) + 1);
}
// health and damage numbers
let HP_MAX = 1000, myHp = 1000;
const hpFill = document.getElementById("hp-fill"), hpNum = document.getElementById("hp-num");
function drawHp() { if (!hpFill) return; hpFill.style.width = Math.max(0, myHp / HP_MAX) * 100 + "%"; hpNum.textContent = Math.max(0, Math.round(myHp)); }
const dmgLayer = document.getElementById("dmg"), dmgs = [], projV = new THREE.Vector3();
function dmgNumber(x, y, amount, mine) {
  if (!dmgLayer || amount <= 0) return;
  const el = document.createElement("div"); el.className = "dmg" + (mine ? "" : " taken"); el.textContent = Math.round(amount); dmgLayer.appendChild(el);
  dmgs.push({ el, x, y, t0: performance.now() });
}
function updateDmg(now) {
  for (let i = dmgs.length - 1; i >= 0; i--) {
    const q = dmgs[i], age = (now - q.t0) / 1000;
    if (age > 1.2) { q.el.remove(); dmgs.splice(i, 1); continue; }
    projV.set(q.x, shipMid * 2, -q.y).project(camera);
    q.el.style.transform = "translate(" + ((projV.x + 1) / 2 * innerWidth) + "px," + ((1 - projV.y) / 2 * innerHeight - age * 50) + "px) translate(-50%,-50%)";
    q.el.style.opacity = age < 0.8 ? 1 : (1.2 - age) / 0.4;
  }
}
function updateAimCone() {
  const it = W(), on = aiming && haveMe && !!myAim, armed = on && !!A.weapon(slot);
  optRingFor(Math.min(it.optimal, 6000));
  optRing.visible = armed && assists;
  if (on) { optRing.position.set(me.x, 0.45, -me.y); const k = Math.max(1, viewDist / 500); optMat.dashSize = 4 * k; optMat.gapSize = 6 * k; }
  const bx = on ? myAim.x - me.x : 0, bz = on ? myAim.z + me.y : 0, dist = Math.hypot(bx, bz);
  aimCone = armed && !isBeam() && dist > it.optimal ? 0.5 + it.falloff * (dist - it.optimal) / 100 : 0;   // beams: just the line
  const wedge = aimCone > 0;
  coneL.visible = coneR.visible = coneFan.visible = wedge;
  aimLine.visible = on && !wedge;              // inside optimal range: just the line
  if (!wedge) return;
  const b = Math.atan2(bx, bz), ha = THREE.MathUtils.degToRad(aimCone), ox = me.x, oz = -me.y, y = 0.55;
  const k = Math.max(1, viewDist / 500); coneMat.dashSize = 12 * k; coneMat.gapSize = 8 * k;
  const set = (line, a) => { const g = line.geometry.attributes.position; g.setXYZ(0, ox, y, oz); g.setXYZ(1, ox + Math.sin(a) * dist, y, oz + Math.cos(a) * dist); g.needsUpdate = true; line.computeLineDistances(); };
  set(coneL, b - ha); set(coneR, b + ha);
  const f = coneFanGeo.attributes.position;
  f.setXYZ(0, ox, y, oz); f.setXYZ(1, ox + Math.sin(b - ha) * dist, y, oz + Math.cos(b - ha) * dist); f.setXYZ(2, ox + Math.sin(b + ha) * dist, y, oz + Math.cos(b + ha) * dist);
  f.needsUpdate = true; coneFanGeo.computeBoundingSphere();
}
const spreadColor = new THREE.Color();
const YELLOW = 1 / 3;                          // the share of full spread where the color passes yellow
const SPRINT_SPREAD = 2;                       // sprinting opens the movement spread this much faster
function updateSpread(dt, moving, sprinting) {
  const it = W();
  const on = aiming && haveMe && !!myAim && !!A.weapon(slot) && !isBeam();   // beams have no spread (owner)
  spreadL.visible = spreadR.visible = spreadFan.visible = spreadArc.visible = on && assists;
  if (!on) { wasAiming = false; return; }
  const bx = myAim.x - me.x, bz = myAim.z + me.y;                     // world, from the ship to the reticle
  const bearing = Math.atan2(bx, bz);
  if (!wasAiming || aimSlot !== slot) { spreadCur = it.spread; lastBearing = null; }   // a new aim (or item) starts wide
  wasAiming = true; aimSlot = slot;
  if (lastBearing !== null) {                                         // swinging the aim reopens it: 180 degrees
    let d = (bearing - lastBearing) % (Math.PI * 2);                  // fully, 90 by half, 45 by a quarter
    if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
    spreadCur = Math.min(it.spread, spreadCur + (Math.abs(d) / Math.PI) * it.spread);
    aimSteady = dt > 0 && Math.abs(d) / dt < 0.05;                    // under ~3 degrees a second: not swinging
  }
  lastBearing = bearing;
  steadyNow = aimSteady && !moving;
  // (owner, 2026-10-13) moving opens the spread at the item's movement spread speed instead of closing it:
  // walking up to the yellow point at most (above it, it keeps closing down to there), sprinting faster
  // and up to full spread. Standing still, it closes at the aim speed.
  if (moving && sprinting) spreadCur = Math.min(it.spread, spreadCur + it.move * SPRINT_SPREAD * dt);
  else if (moving) { const cap = it.spread * YELLOW;
    spreadCur = spreadCur < cap ? Math.min(cap, spreadCur + it.move * dt) : Math.max(cap, spreadCur - it.speed * dt); }
  else if (performance.now() - lastShot < Math.max(300, 1500 / it.rate)) {   // (owner) firing steadily while still: settles
    const cap = it.spread * YELLOW;                                    // at the yellow point, closing no further than it
    if (spreadCur > cap) spreadCur = Math.max(cap, spreadCur - it.speed * dt);
  }
  else spreadCur = Math.max(0, spreadCur - it.speed * dt);
  const t = it.spread > 0 ? spreadCur / it.spread : 0;
  const hue = t > 0.5 ? 30 * (1 - (t - 0.5) * 2) : 30 + 90 * (1 - t * 2);   // red -> orange -> green
  spreadColor.setHSL(hue / 360, 0.95, 0.55); spreadMat.color.copy(spreadColor); fanMat.color.copy(spreadColor);
  const ox = me.x, oz = -me.y, y = 0.6, L = it.range, sr = THREE.MathUtils.degToRad(Math.max(spreadCur, aimCone));   // (owner) the spread lines stop at the aim line's own wedge past optimal range
  const set = (line, b) => { const a = line.geometry.attributes.position; a.setXYZ(0, ox, y, oz); a.setXYZ(1, ox + Math.sin(b) * L, y, oz + Math.cos(b) * L); a.needsUpdate = true; };
  set(spreadL, bearing - sr); set(spreadR, bearing + sr);
  const fp = fanGeo.attributes.position; fp.setXYZ(0, ox, y - 0.1, oz);
  const ap = arcGeo.attributes.position;
  for (let i = 0; i <= FAN; i++) { const b = bearing - sr + (2 * sr * i) / FAN, X = ox + Math.sin(b) * L, Z = oz + Math.cos(b) * L; fp.setXYZ(i + 1, X, y - 0.1, Z); ap.setXYZ(i, X, y, Z); }
  fp.needsUpdate = true; ap.needsUpdate = true;
}
function rangeRingFor(R) {
  if (rangeRing && rangeRingR === R) return;
  if (rangeRing) { scene.remove(rangeRing); rangeRing.geometry.dispose(); }
  rangeRing = new THREE.Mesh(new THREE.RingGeometry(R - 4, R, 160), new THREE.MeshBasicMaterial({ color: 0x4f8fe8, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  rangeRing.rotation.x = -Math.PI / 2; rangeRing.position.y = 0.35; rangeRingR = R; scene.add(rangeRing);
}
const aimLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
// (owner, 2026-10-13) the aim line: dashed white toward the pointer, ending in a white circle (the old
// blue reticle ring is hidden)
const aimLineMat = new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, dashSize: 12, gapSize: 8 });
const aimLine = new THREE.Line(aimLineGeo, aimLineMat); aimLine.frustumCulled = false;
const aimEnd = new THREE.Mesh(new THREE.CircleGeometry(5, 32),   // (owner) a small flat filled dot
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
aimEnd.rotation.x = -Math.PI / 2; aimEnd.visible = false; scene.add(aimEnd);
// (owner, 2026-10-13) the stop marker: a dashed line to a circle where the ship would come to rest if the
// player let go now (its velocity at the braking rate); only this player sees it
const stopLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const stopLineMat = new THREE.LineDashedMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.8, dashSize: 10, gapSize: 8 });
const stopLine = new THREE.Line(stopLineGeo, stopLineMat); stopLine.frustumCulled = false; stopLine.visible = false; scene.add(stopLine);
const stopRing = new THREE.Mesh(new THREE.CircleGeometry(5, 32),   // (owner) a small flat filled dot
  new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
stopRing.rotation.x = -Math.PI / 2; stopRing.visible = false; scene.add(stopRing);
function updateStop() {
  const v = Math.hypot(vel.x, vel.y);
  const on = haveMe && v > 5;
  stopLine.visible = stopRing.visible = on; if (!on) return;
  const dist = (v * v) / (2 * BRAKE), sx = me.x + (vel.x / v) * dist, sy = me.y + (vel.y / v) * dist;
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
// (owner) the Assists toggle: the distance circle and the slot's spread lines on or off (the aim line always shows)
let assists = true;
try { assists = localStorage.getItem("atamus.assists") !== "0"; } catch {}
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
  const p = { id, name, holder, heading: 0, buf: [], to: { x, y } };   // buf: recent snapshot positions on the server's clock
  players.set(id, p); return p;
}
function dropPlayer(id) { const p = players.get(id); if (!p) return; scene.remove(p.holder); if (p.beamMesh) scene.remove(p.beamMesh); players.delete(id); }
const TURN = 4;                                // rad/s (owner, 2026-10-13: 3x slower than the first 12)
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
const typing = () => { const el = document.activeElement; return !!el && ((el.tagName === "INPUT" && !["range", "checkbox", "button", "file"].includes(el.type)) || el.tagName === "TEXTAREA" || el.tagName === "SELECT"); };
addEventListener("keydown", (e) => {
  if (typing()) return;
  if (e.code === "Enter") { e.preventDefault(); openChat(); return; }
  if (e.code === "Tab") { e.preventDefault(); if (!e.repeat) toggleInv(); return; }
  if (e.code === "Escape" && invOpen) { toggleInv(false); return; }
  if (e.code === "KeyR" && !e.repeat) A.reload(slot);
});
addEventListener("keydown", (e) => { if (typing()) return; if (e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3") selectSlot(+e.code.slice(5) - 1); if (e.key === "Shift") sprint = true; if (e.code === "KeyX") dropCube(); if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) { keys.add(e.code); e.preventDefault(); } });
addEventListener("keyup", (e) => { if (e.key === "Shift") sprint = false; keys.delete(e.code); });
addEventListener("blur", () => { keys.clear(); sprint = false; });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());   // (owner) the browser's menu never opens in the game
let orbiting = false, aiming = false, aimLock = null, orbitLock = null;   // orbitLock: MMB holds the camera frame
const mouse = { x: 0, y: 0 };
canvas.addEventListener("mousedown", (e) => { if (e.button === 0 && aiming) { firing = true; firePending = true; e.preventDefault(); } });
addEventListener("mouseup", (e) => { if (e.button === 0) firing = false; });
canvas.addEventListener("mousedown", (e) => { if (e.button === 1) { orbiting = true; aimLock = { x: e.clientX, y: e.clientY };
    orbitLock = { dist: viewDist, len: Math.hypot(focus.x - me.x, focus.y - me.y), ang: Math.atan2(focus.x - me.x, focus.y - me.y) - camYaw };
    lockPointer(); e.preventDefault(); } if (e.button === 2) { aiming = true; mouse.x = e.clientX; mouse.y = e.clientY; e.preventDefault(); } });
addEventListener("mouseup", (e) => { if (e.button === 1) { orbiting = false; aimLock = null; orbitLock = null; if (document.pointerLockElement === canvas) { try { document.exitPointerLock(); } catch {} } } if (e.button === 2) aiming = false; });
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

// (owner, 2026-10-13) touch devices get a joystick for WASD (drag elsewhere turns the camera). Aiming stays
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
  if (!f && !r) return { x: 0, y: 0, b: sprint ? 1 : 0 };
  const n = Math.max(1, Math.hypot(f, r)); f /= n; r /= n;
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  return { x: f * sin + r * cos, y: f * cos - r * sin, b: sprint ? 1 : 0 };   // game plane: +y north at yaw 0
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
      if (m.cfg) { HEX_FLAT = m.cfg.hexFlat || HEX_FLAT; SPEED = m.cfg.speed || SPEED; ACCEL = m.cfg.accel || ACCEL; BRAKE = m.cfg.brake || BRAKE; TURN_ACCEL = m.cfg.turnAccel || TURN_ACCEL; if (m.cfg.cap) CAPC = m.cfg.cap; if (m.cfg.bulletSpeed) BULLET_SPEED = m.cfg.bulletSpeed; if (m.cfg.hpMax) { HP_MAX = m.cfg.hpMax; myHp = HP_MAX; drawHp(); } }
      myId = m.you.id; myName = m.you.name; haveMe = false; mySide = null;
      for (const p of [...players.keys()]) dropPlayer(p);
      for (const r of m.roster || []) addPlayer(r.i, r.n).side = r.s;
      sidePick.hidden = false;                 // (owner) every time they enter, they choose a side first
      if (m.countdown) startCountdown(Date.now() + m.countdown.in, m.countdown.parts);
    } else if (m.t === "spawn") {
      me.x = m.x; me.y = m.y; haveMe = true; mySide = m.s; sidePick.hidden = true;
      focus.x = me.x; focus.y = me.y;
      addPlayer(myId, myName, me.x, me.y).side = m.s;
    } else if (m.t === "snap") {
      { const off = Date.now() - m.ts; srvOff = srvOff === null || off < srvOff ? off : srvOff + (off - srvOff) * 0.01; }
      missileSnap(m.m, m.ts);
      for (const [id, cx, cy, ch, bx, by, bl] of m.p) {
        const x = cx / 100, y = cy / 100;
        if (id !== myId) { const pb = players.get(id); if (pb) pb.beam = bl ? { ux: bx / 1000, uy: by / 1000, len: bl } : null; }
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
        p.buf.push({ x, y, h: (ch || 0) / 1000, t: m.ts }); if (p.buf.length > 30) p.buf.shift();   // a short history, timed by the server
        p.to = { x, y };
      }
    } else if (m.t === "join") { if (m.i !== myId) addPlayer(m.i, m.n).side = m.s; }
    else if (m.t === "leave") { if (m.i !== myId) dropPlayer(m.i); }
    else if (m.t === "cap") { cap = m.c; capOut = !!m.o; if (Number.isFinite(m.hp)) { myHp = m.hp; drawHp(); } }
    else if (m.t === "shot") { if (m.i !== myId) spawnShot(m.i + ":" + m.c, m.x, m.y, m.ux, m.uy, m.spd, m.life, mySide && m.s === mySide ? "friend" : "enemy"); }
    else if (m.t === "hit") {                  // the server's damage: drop the bullet, number it for the shooter and the victim
      if (m.k) removeShot(m.k);
      if (m.by === myId || m.i === myId) dmgNumber(m.x, m.y, m.d, m.by === myId && m.i !== myId);
      if (m.i === myId && Number.isFinite(m.hp)) { myHp = m.hp; drawHp(); }
    }
    else if (m.t === "down") { const pd = players.get(m.i); if (pd) pd.buf = []; }   // a destroyed ship jumps to its respawn
    else if (m.t === "respawn") { me.x = m.x; me.y = m.y; vel.x = vel.y = 0; focus.x = me.x; focus.y = me.y; myHp = m.hp; drawHp(); beamOff(); }
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
    const spd = SPEED * (sprintOn ? 2 : 1), tx = d.x * spd, ty = d.y * spd;
    let a = d.x || d.y ? ACCEL : BRAKE;        // letting go brakes harder than thrust accelerates
    if (d.x || d.y) {                          // a push off the nose gets only part of the acceleration
      const mine = players.get(myId);
      let dh = (Math.atan2(d.x, -d.y) - (mine ? mine.heading : 0)) % (Math.PI * 2); if (dh > Math.PI) dh -= Math.PI * 2; else if (dh < -Math.PI) dh += Math.PI * 2;
      a *= accelShare(dh);
    }
    let ex = tx - vel.x, ey = ty - vel.y; const el = Math.hypot(ex, ey), sv = a * dt;
    if (el > sv) { ex *= sv / el; ey *= sv / el; }
    vel.x += ex; vel.y += ey;
    if (Math.hypot(vel.x, vel.y) < 0.01 && !d.x && !d.y) { vel.x = vel.y = 0; }
    const nx = me.x + vel.x * dt, ny = me.y + vel.y * dt;
    if (inside(nx, ny)) { me.x = nx; me.y = ny; }
    else { let lo = 0, hi = 1; for (let i = 0; i < 10; i++) { const mid = (lo + hi) / 2; inside(me.x + (nx - me.x) * mid, me.y + (ny - me.y) * mid) ? (lo = mid) : (hi = mid); } me.x += (nx - me.x) * lo; me.y += (ny - me.y) * lo; vel.x = vel.y = 0; }
  }

  // other ships are drawn 150 ms in the past on the server's clock, between the two snapshots around that moment
  // (only the last two used to be kept, older than the render time, so they stepped and never glided)
  const rt = Date.now() - (srvOff || 0) - 150;
  for (const p of players.values()) {
    if (p.id === myId) {                       // (owner) the nose turns toward the input, not the drift; an interaction item faces the pointer
      // (owner, 2026-10-13) with no WASD held, aiming turns the ship toward the aim point (any item)
      const face = aiming && W().interact ? myAim : (d.x || d.y) ? { x: me.x + d.x, z: -me.y - d.y } : aiming ? myAim : null;
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

  // right-click aiming (owner): a circle where the mouse points on the ground, a line from the sphere to it; the
  // camera's focus slides toward a point between the player and the circle, zooming out to keep the player in shot
  let fx = haveMe ? me.x : 0, fy = haveMe ? me.y : 0, wantDist = camDist, hit = false;
  myAim = null;
  // (owner) the reticle is the ground point under the pointer, CLAMPED to the range circle: push the
  // pointer past the circle and the reticle rides its edge in that direction.
  function aimAt(px, py) {
    const sx = (px / innerWidth) * 2 - 1, sy = -(py / innerHeight) * 2 + 1;
    raycaster.setFromCamera({ x: sx, y: sy }, camera);
    if (!raycaster.ray.intersectPlane(groundPlane, aimHit)) return null;
    let ux = aimHit.x - me.x, uz = aimHit.z + me.y;                      // world; game y is -z
    const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const d = Math.min(ul, cam.leash);
    return { x: me.x + ux * d, z: -me.y + uz * d, d, sux: sx, suy: sy, ux, uz };
  }
  function drawAim(a) {
    aimRing.position.set(a.x, 0.4, a.z);
    const rs = Math.max(1, viewDist / 500); aimRing.scale.set(rs, rs, 1);   // stays readable zoomed out
    myAim = { x: a.x, z: a.z };
    aimLineGeo.setFromPoints([toWorld(me.x, me.y, shipMid), new THREE.Vector3(a.x, 0.4, a.z)]);
    aimLine.computeLineDistances();
    const ds = Math.max(1, viewDist / 500); aimLineMat.dashSize = 12 * ds; aimLineMat.gapSize = 8 * ds;   // dashes keep their look zoomed out
    aimEnd.position.set(a.x, 0.5, a.z); aimEnd.scale.set(ds, ds, 1);
  }
  if (aiming && haveMe) {
    const px = aimLock ? aimLock.x : mouse.x, py = aimLock ? aimLock.y : mouse.y;   // (owner) MMB: the circle keeps the pinned SCREEN spot, through orbits and WASD alike
    const a = aimAt(px, py);
    if (a) {
      hit = true; drawAim(a);
      if (!orbitLock) {                                                  // orbiting holds the frame: the aim stops steering it
        // (owner) the camera is driven ONLY by the pointer's screen position and the circle's constant
        // radius - never by the reticle's camera-dependent ground distance, which looped (zoom moved
        // the ground under the pixel, which moved the zoom). Pressing toward a screen edge ramps the
        // zoom so a full press shows the circle plus 20 m of lead on that axis; the focus slides out
        // along the aim by the same screen fraction, up to halfway to the circle.
        // (owner, 2026-10-13: "start extending the camera leash" instead of super zoom) the focus
        // slides ASYMMETRICALLY along the aim: each pressed screen axis must show the circle plus
        // overflow ahead of the focus AND the ship plus a margin behind it, and the zoom and the
        // focus fraction are solved together from the view's exact ground extents - so aiming into
        // a cramped direction (screen-down, where the bottom ray plunges toward the camera) pushes
        // the ship toward the roomy opposite edge instead of zooming the world away.
        // (owner, 2026-10-13: diagonals showed less overflow, and front / back zoomed far more than
        // the sides) the solution is DIRECTION-INDEPENDENT: one full-press zoom, fixed by the worst
        // (vertical) extent pair, and the leash chosen per direction so the boundary ahead of the
        // reticle is exactly the overflow - measured on the ellipse inscribed in the screen, so a
        // diagonal gets the same guaranteed gap as a cardinal. Uniform zoom, uniform overflow.
        const R = cam.leash, S = 80, m = 0.85;                           // margin behind the ship
        const r = Math.min(1, Math.hypot(a.sux, a.suy));                 // how far the pointer presses outward
        // (owner, 2026-10-13, the diagram) the compass sets the OVERFLOW per direction: its slider
        // plus the base Overflow is how far the camera bounds sit past the circle's edge when aiming
        // that way, blended smoothly between neighboring directions; zoom and leash are solved
        // together along the aim so the gap comes out exact, the ship kept behind the focus.
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
        const denF = Math.max(1e-4, Math.hypot(uxs / ex, uys / eF));     // ellipse boundary ahead, per unit of zoom
        const denB = Math.max(1e-4, Math.hypot(uxs / ex, uys / eB));     // and behind (the vertical half flips)
        const Ddir = (R + O + S) / (m * (1 / denF + 1 / denB));          // the zoom this direction and its gap need
        // (owner, 2026-10-13) a dead zone around the screen's center: aiming near the ship neither zooms nor
        // leashes (there, a tiny pointer move flips the aim's direction, the camera chased it and the ship
        // and pointer pulled at each other like magnets); beyond it the press eases in, full at 80% out
        const DZ = 0.3, rr = Math.min(1, Math.max(0, (r - DZ) / (0.8 - DZ))), ease = rr * rr * (3 - 2 * rr);
        wantDist = Math.max(camDist, Math.min(6000, ease * Ddir));
        let lam = 1 - (m * wantDist / denF - O) / R;                     // ahead of the focus: the circle + exactly the gap
        lam = Math.min(lam, (m * wantDist / denB - S) / R);              // behind it: the ship + its margin
        lam = Math.min(1, Math.max(0, lam)) * ease;                      // and no leash at all inside the dead zone
        fx = me.x + a.ux * lam * R; fy = me.y + -a.uz * lam * R;         // the focus: the extending leash
      }
    }
  }
  if (orbitLock && haveMe) {                   // (owner) MMB: the camera and its target orbit the player at the settings they had
    const th = camYaw + orbitLock.ang;
    fx = me.x + Math.sin(th) * orbitLock.len; fy = me.y + Math.cos(th) * orbitLock.len;
    wantDist = orbitLock.dist;
  }
  aimRing.visible = false;
  aimLine.visible = aimEnd.visible = aiming && hit;
  const k = 1 - Math.exp(-dt * 6);                                       // the focus and zoom ease, in and back
  focus.x += (fx - focus.x) * k; focus.y += (fy - focus.y) * k;
  viewDist += (wantDist - viewDist) * k;

  if (haveMe) { rangeRingFor(cam.leash); rangeRing.position.set(me.x, 0.35, -me.y); rangeRing.visible = assists; interactRing.visible = true; interactRing.position.set(me.x, 0.4, -me.y); }
  const target = toWorld(focus.x, focus.y, shipMid);
  const pr = THREE.MathUtils.degToRad(cam.pitch);
  camOff.set(-Math.sin(camYaw), 0, Math.cos(camYaw)).multiplyScalar(Math.cos(pr) * viewDist);   // behind the player: W flies toward where the camera faces
  camOff.y = Math.sin(pr) * viewDist;
  camera.position.copy(target).add(camOff);
  camera.lookAt(target);
  if (aiming && haveMe && hit) {               // re-project against the camera as it will RENDER this frame,
    const px = aimLock ? aimLock.x : mouse.x, py = aimLock ? aimLock.y : mouse.y;   // so the circle never trails the pointer while the camera eases or orbits
    const a2 = aimAt(px, py);
    if (a2) drawAim(a2);
  }
  updateAimCone();
  updateSpread(dt, !!(d.x || d.y), sprintOn);
  A.tick(nowP);
  updateLock(dt);
  tryFire(nowP, dt);
  updateShots(dt);
  updateMissiles();
  for (const pb of players.values()) {           // others' beams, from their drawn positions
    if (pb.id === myId) continue;
    if (!pb.beamMesh) pb.beamMesh = mkBeam(0xffb070);
    if (pb.beam) placeBeam(pb.beamMesh, pb.holder.position.x, -pb.holder.position.z, pb.beam.ux, pb.beam.uy, pb.beam.len); else pb.beamMesh.visible = false;
  }
  updateDmg(nowP);
  if (invUI) invUI.frame(nowP);
  updateStop();
  drawMinimap(nowP);

  if (countAt) {
    const left = Math.ceil((countAt - now) / 1000);
    if (left <= 0) { countAt = 0; goUpdating(); } else countEl.textContent = "Update incoming — " + left + " s";
  }

  renderer.render(scene, camera);
});

// (owner) the tuning panel: Reticle (max distance), Overflow, and the compass of eight
// per-direction leash trims; every slide applies live and is kept in this browser
const $i = (id) => document.getElementById(id);
const sl = { leash: $i("sl-leash"), leashV: $i("sl-leash-v"), over: $i("sl-over"), overV: $i("sl-over-v") };
if (sl.leash) {
  const show = () => {
    sl.leash.value = cam.leash; sl.leashV.textContent = cam.leash + " m";
    sl.over.value = cam.over; sl.overV.textContent = cam.over + " m";
  };
  show();
  sl.leash.addEventListener("input", () => { cam.leash = Math.min(3000, Math.max(100, +sl.leash.value || 700)); saveCam(); show(); });
  sl.over.addEventListener("input", () => { cam.over = Math.min(200, Math.max(0, +sl.over.value || 0)); saveCam(); show(); });
}

// (owner, 2026-10-13) the Weapon & Ammo Maker (the panel) and the TAB inventory with the hotbar
const edRoot = $i("arsenal-ed"); if (edRoot) mountEditor(edRoot);
const invEl = $i("inv"); let invOpen = false;
const invUI = invEl ? mountInventory(invEl, $i("hotbar"), () => slot, (i) => selectSlot(i)) : null;
function toggleInv(open) { invOpen = open === undefined ? !invOpen : open; if (invEl) invEl.hidden = !invOpen; if (invOpen) { firing = false; beamOff(); } }
if ($i("sl-assists")) {
  $i("sl-assists").checked = assists;
  $i("sl-assists").addEventListener("change", () => { assists = $i("sl-assists").checked; try { localStorage.setItem("atamus.assists", assists ? "1" : "0"); } catch {} });
}
// (owner, 2026-10-13) choosing a side: Red or Blue, every time the game is entered
const sidePick = document.getElementById("side-pick");
document.querySelectorAll("#side-pick button").forEach((btn) => btn.addEventListener("click", () => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "side", s: btn.dataset.side }));
}));
// (owner, 2026-10-13) the minimap: the hexagon, friendlies (your side) blue, enemies red; north up, with a
// tick on your dot for where the camera faces
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
  const dot = (x, y, col, r) => { const [X, Y] = P(x, y); mmx.beginPath(); mmx.arc(X, Y, r, 0, Math.PI * 2); mmx.fillStyle = col; mmx.fill(); };
  for (const p of players.values()) {
    if (p.id === myId || !p.side) continue;
    dot(p.to.x, p.to.y, mySide && p.side === mySide ? "#4f8fe8" : "#e04848", 2.5);
  }
  if (haveMe) {
    const [X, Y] = P(me.x, me.y);
    mmx.strokeStyle = "#ffffff"; mmx.lineWidth = 1.5; mmx.beginPath(); mmx.moveTo(X, Y); mmx.lineTo(X + Math.sin(camYaw) * 9, Y - Math.cos(camYaw) * 9); mmx.stroke();
    dot(me.x, me.y, "#4f8fe8", 3.5); mmx.strokeStyle = "#ffffff"; mmx.lineWidth = 1; mmx.beginPath(); mmx.arc(X, Y, 3.5, 0, Math.PI * 2); mmx.stroke();
  }
}
// (owner, 2026-10-13) chat: Global (everyone) and Faction (your side). Enter opens the box and sends; Escape
// or sending an empty line closes it. Lines are inserted as plain text.
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
// (owner) the hotbar: keys 1-3, or a click / tap on a slot
function selectSlot(i) { if (!(i >= 0 && i < 3)) return; slot = i; }

// for the test harness and the console
window.Atamus = { get me() { return { ...me, id: myId }; }, get players() { return [...players.keys()]; }, get ws() { return ws; }, get aim() { return myAim; }, get view() { return viewDist; }, get spread() { return spreadCur; }, get slot() { return slot; }, get cone() { return aimCone; }, get shots() { return shots.length; }, get hp() { return myHp; }, get lock() { return lockAmount(); }, get missiles() { return missiles.size; }, A, scr(x, z) { projV.set(x, shipMid, z).project(camera); return { x: (projV.x + 1) / 2 * innerWidth, y: (1 - projV.y) / 2 * innerHeight }; }, get drawn() { return [...players.values()].map((p) => ({ id: p.id, x: p.holder.position.x, z: p.holder.position.z, h: p.heading })); } };
