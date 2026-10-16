// (owner, 2026-10-13; rebuilt 2026-10-15) The Build menu, for staff (head admin, admins, developers): [B] (or the B key)
// opens a slot row above the capacitor bar with two slots, Shape and Nebula. Picking a slot gives a blueprint (a
// shimmering hologram) that follows the pointer; a left click places it (the blueprint stays for more; Escape or the slot
// again ends it). With Shape picked, the left / right arrows change it: square, cylinder, triangle. Clicking a placed
// piece selects it (its attributes panel: Rotation, and Width / Depth for a shape or Scale / Theme for a nebula; a
// nebula's outline gets handles); pressing on it again and dragging moves it. Delete removes it; Ctrl+C copies, Ctrl+X
// cuts and Ctrl+V pastes where the pointer is. Pieces belong to the server; this file only sends the edits.
import * as THREE from "./vendor/three.module.js";

export const SHAPES = ["square", "cylinder", "triangle"];
const NAMES = { square: "Square", cylinder: "Cylinder", triangle: "Triangle", cloud: "Nebula", capture: "Capture Point" };
const kindOk = (k) => SHAPES.includes(k) || k === "cloud" || k === "capture";
// (owner, 2026-10-14) nebula color themes: deep, main and highlight colors
export const CLOUD_THEMES = [
  [[0.3, 0.1, 0.5], [0.8, 0.3, 0.75], [1, 0.75, 0.95]],    // violet / pink
  [[0.04, 0.28, 0.38], [0.1, 0.72, 0.8], [0.75, 1, 1]],    // teal
  [[0.45, 0.15, 0.03], [0.95, 0.55, 0.15], [1, 0.9, 0.6]], // amber
  [[0.03, 0.3, 0.14], [0.2, 0.78, 0.45], [0.85, 1, 0.8]],  // emerald
  [[0.4, 0.03, 0.08], [0.9, 0.22, 0.25], [1, 0.75, 0.6]],  // crimson
];
export function cloudPoly(b) { const s = b.w / 100, c = Math.cos(b.r), n = Math.sin(b.r), out = []; for (const [lx, ly] of b.extra.pts) { const x = lx * s, y = ly * s; out.push(b.x + x * c - y * n, b.y + x * n + y * c); } return out; }
const CLOUD_START = [[-150, -150], [150, -150], [150, 150], [-150, 150]];
let BUILD_H = 50;
const MIN = 5, MAX = 1000;

// ---- outlines (as the server works them out): each kind's parts in its own frame, as fractions of its footprint ----
const box = (hx, hy) => [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
const ellipse = (n = 24) => Array.from({ length: n }, (_, i) => [Math.cos(i * Math.PI * 2 / n) * 0.5, Math.sin(i * Math.PI * 2 / n) * 0.5]);
export const COLL_DEFAULT = { square: [box(0.5, 0.5)], cylinder: [ellipse()], triangle: [[[0, -0.5], [0.5, 0.5], [-0.5, 0.5]]], ship: [box(0.33, 0.5556)] };
export const coll = {};                        // kind -> parts (the server's)
export function toWorldPts(o, loc) { const c = Math.cos(o.r), s = Math.sin(o.r), out = []; for (const [ux, uy] of loc) { const lx = ux * o.w, ly = uy * o.d; out.push(o.x + lx * c - ly * s, o.y + lx * s + ly * c); } return out; }
export function partsOf(b) { return (coll[b.k] || COLL_DEFAULT[b.k] || COLL_DEFAULT.square).map((v) => toWorldPts(b, v)); }
export function polyRad(o, v) { let r = 0; for (let i = 0; i < v.length; i += 2) r = Math.max(r, Math.hypot(v[i] - o.x, v[i + 1] - o.y)); return r; }
export function polyMid(v) { let x = 0, y = 0; for (let i = 0; i < v.length; i += 2) { x += v[i]; y += v[i + 1]; } return [x * 2 / v.length, y * 2 / v.length]; }
export function satPush(A, B) {
  let best = Infinity, bx = 0, by = 0;
  for (const P of [A, B]) for (let i = 0; i < P.length; i += 2) {
    let nx = -(P[(i + 3) % P.length] - P[i + 1]), ny = P[(i + 2) % P.length] - P[i]; const L = Math.hypot(nx, ny); if (L < 1e-9) continue; nx /= L; ny /= L;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < A.length; k += 2) { const t = A[k] * nx + A[k + 1] * ny; if (t < a0) a0 = t; if (t > a1) a1 = t; }
    for (let k = 0; k < B.length; k += 2) { const t = B[k] * nx + B[k + 1] * ny; if (t < b0) b0 = t; if (t > b1) b1 = t; }
    const o = Math.min(a1, b1) - Math.max(a0, b0); if (o <= 0) return null; if (o < best) { best = o; bx = nx; by = ny; }
  }
  const [ax, ay] = polyMid(A), [cx, cy] = polyMid(B); if ((ax - cx) * bx + (ay - cy) * by < 0) { bx = -bx; by = -by; }
  return { nx: bx, ny: by, d: best };
}
export function nudge(p, n, d) { p.x += n.nx * d; p.y += n.ny * d; const vn = (p.vx || 0) * n.nx + (p.vy || 0) * n.ny; if (vn < 0) { p.vx -= vn * n.nx; p.vy -= vn * n.ny; } }
export function segPoly(x0, y0, x1, y1, v) {   // where a segment first crosses an outline's edge (0-1), or null
  const dx = x1 - x0, dy = y1 - y0; let best = null;
  for (let i = 0; i < v.length; i += 2) {
    const ax = v[i], ay = v[i + 1], ex = v[(i + 2) % v.length] - ax, ey = v[(i + 3) % v.length] - ay, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - x0) * ey - (ay - y0) * ex) / den, u = ((ax - x0) * dy - (ay - y0) * dx) / den;
    if (t > 1e-4 && t < 1 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}
export const builds = new Map();               // id -> { id, k, x, y, w, d, r, extra, polys, poly, rad, mesh }

// a shape's mesh: its outline parts stood up BUILD_H tall (a unit footprint; the piece scales it to w x d)
const pieceMat = new THREE.MeshStandardMaterial({ color: 0x8c96aa, roughness: 0.65, metalness: 0.1 });
const geoCache = new Map();
// (owner, 2026-10-15) a capture point: a flat circle with a slight fill and a brighter rim (a unit circle, scaled to w)
const capGeo = new THREE.CircleGeometry(0.5, 64).rotateX(-Math.PI / 2), capRimGeo = new THREE.RingGeometry(0.49, 0.5, 96).rotateX(-Math.PI / 2);
const capFill = new THREE.MeshBasicMaterial({ color: 0x5fd1a0, transparent: true, opacity: 0.12, depthWrite: false }), capRim = new THREE.MeshBasicMaterial({ color: 0x7fe8bb, transparent: true, opacity: 0.6, depthWrite: false });
function captureMesh(ghost) { const g = new THREE.Group(), f = new THREE.Mesh(capGeo, ghost ? capFill.clone() : capFill), rim = new THREE.Mesh(capRimGeo, capRim); if (ghost) f.material.opacity = 0.2; g.add(f, rim); g.position.y = 0.6; g.renderOrder = -1; return g; }
function shapeGeos(k) {
  const key = k + "|" + BUILD_H + "|" + JSON.stringify(coll[k] || ""); if (geoCache.has(key)) return geoCache.get(key);
  const geos = (coll[k] || COLL_DEFAULT[k]).map((v) => { const s = new THREE.Shape(v.map(([x, y]) => new THREE.Vector2(x, y))); return new THREE.ExtrudeGeometry(s, { depth: BUILD_H, bevelEnabled: false }).rotateX(-Math.PI / 2); });
  geoCache.set(key, geos); return geos;
}

export function initBuild(ctx) {
  const { scene, camera, canvas, toWorld, send } = ctx;
  // ---- the blueprint look (owner): a shimmering hologram ----
  const holoT = { value: 0 };
  const holoMat = new THREE.ShaderMaterial({
    uniforms: { uT: holoT }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vW; varying vec3 vN; varying vec3 vV;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uT; varying vec3 vW; varying vec3 vN; varying vec3 vV;
      float h(float x) { return fract(sin(x * 91.7) * 43758.5); }
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float scan = 0.5 + 0.5 * sin(vW.y * 0.9 - uT * 5.0);                          // bands running up the piece
        float sweep = smoothstep(0.92, 1.0, sin((vW.x + vW.z) * 0.012 - uT * 1.7));   // a bright sheen sweeping across
        float flick = 0.85 + 0.15 * h(floor(uT * 14.0));                              // a faint flicker
        vec3 col = mix(vec3(0.25, 0.75, 1.0), vec3(0.75, 0.95, 1.0), fres);
        float a = (0.22 + 0.55 * fres + 0.15 * scan + 0.35 * sweep) * flick;
        gl_FragColor = vec4(col * a, a);
      }`,
  });
  const holo = (obj, on) => obj.traverse((o) => { if (!o.isMesh) return; if (on) { if (!o.userData.mat) o.userData.mat = o.material; o.material = holoMat; } else if (o.userData.mat) { o.material = o.userData.mat; delete o.userData.mat; } });

  // ---- screen <-> ground ----
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function ndc(cx, cy) { const r = canvas.getBoundingClientRect(); return { x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }; }
  function ground(cx, cy) { ray.setFromCamera(ndc(cx, cy), camera); return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: -hit.z } : null; }
  // ---- (owner, 2026-10-14) nebula clouds: a colored, drifting gradient filling the outline, fading out at its edges ----
  const CLOUD_Y = 4;                           // the outline handles' height
  // (owner, 2026-10-14) a 3D volume: soft puffs (billboards, always facing the camera) scattered through the outline at
  // different heights, smaller and fainter toward the edges. Each puff is a noisy blob that slowly turns and drifts, tinted
  // from the theme. Puffs near my own ship thin out so it stays in view. One instanced draw per cloud.
  const CLOUD_SP = 46, CLOUD_TOP = 70, CLOUD_MAX = 2400;
  // (owner, 2026-10-14: speed) clouds are drawn on their own layer into a picture a third the screen's size that's laid over the scene
  // (game3d.js): soft puffs cost a lot of pixels, a ninth as many there. Their blending keeps that picture's colors
  // premultiplied by its transparency.
  const CLOUD_LAYER = 2, cloudBlend = { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  const cloudT = { value: 0 }, cloudMe = { value: new THREE.Vector2(1e9, 1e9) };
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  function cloudPuffs(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, area = 0;
    pts.forEach(([x, y], i) => { const [u, v] = pts[(i + 1) % pts.length]; area += x * v - u * y; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const sp = Math.max(CLOUD_SP, Math.sqrt(Math.abs(area / 2) * 2 / CLOUD_MAX));
    const inside = (x, y) => { let c = false; for (let i = 0, n = pts.length; i < n; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; };
    const edge = (x, y) => { let d = Infinity; for (let i = 0, n = pts.length; i < n; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n], ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1e-9))); d = Math.min(d, Math.hypot(x - ax - ex * t, y - ay - ey * t)); } return d; };
    const P = [], S = [];
    for (let ix = Math.floor(x0 / sp); ix <= Math.ceil(x1 / sp); ix++) for (let iy = Math.floor(y0 / sp); iy <= Math.ceil(y1 / sp); iy++) for (let l = 0; l < 2; l++) {
      const x = (ix + hash(ix, iy, l * 3 + 1)) * sp, y = (iy + hash(ix, iy, l * 3 + 2)) * sp; if (!inside(x, y) || (l && hash(ix, iy, 29) < 0.5)) continue;
      const d = edge(x, y), k = Math.min(1, d / 90), r = hash(ix, iy, l * 3 + 3);
      P.push(x, y, 4 + (CLOUD_TOP * (0.35 + 0.65 * k)) * hash(ix, iy, l + 9));
      S.push((55 + 55 * r) * (0.5 + 0.5 * k), hash(ix, iy, l + 17), d);
    }
    return { P, S };
  }
  function cloudMesh(pts, v, ghost) {
    const th = CLOUD_THEMES[v] || CLOUD_THEMES[0], { P, S } = cloudPuffs(pts), q = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = q.index; g.setAttribute("position", q.getAttribute("position")); g.setAttribute("uv", q.getAttribute("uv")); q.dispose();
    g.setAttribute("iP", new THREE.InstancedBufferAttribute(new Float32Array(P), 3)); g.setAttribute("iS", new THREE.InstancedBufferAttribute(new Float32Array(S), 3)); g.instanceCount = P.length / 3;
    const m = new THREE.ShaderMaterial({
      uniforms: { nt: { value: ctx.noiseTex }, uT: cloudT, uMe: cloudMe, uS: { value: 1 }, uG: { value: ghost ? 0.5 : 1 },
        c1: { value: new THREE.Vector3(...th[0]) }, c2: { value: new THREE.Vector3(...th[1]) }, c3: { value: new THREE.Vector3(...th[2]) } },
      transparent: true, depthWrite: false, ...cloudBlend,
      vertexShader: `attribute vec3 iP; attribute vec3 iS; uniform float uS, uT; uniform vec2 uMe; varying vec2 vU, vN, vM; varying vec3 vS; varying float vR, vH; varying vec2 vC; uniform sampler2D nt;
        void main() {
          vec4 w = modelMatrix * vec4(iP.x, iP.z / uS, -iP.y, 1.0);          // (heights aren't scaled)
          w.xz += vec2(sin(uT * 0.07 + iS.y * 40.0), cos(uT * 0.05 + iS.y * 23.0)) * 6.0 * uS;   // a slow drift
          vC = vec2(texture2D(nt, w.xz / 520.0 + uT * 0.0015).a, texture2D(nt, w.xz / 260.0 - uT * 0.002).b);   // big swirls of color across the cloud
          float a = iS.y * 6.283 + uT * 0.03 * (iS.y - 0.5), c = cos(a), s = sin(a);
          vU = mat2(c, -s, s, c) * (uv - 0.5); vS = iS; vH = iP.z / ${CLOUD_TOP}.0;
          vec4 e = viewMatrix * w; e.xy += position.xy * iS.x * uS * 2.0;
          gl_Position = projectionMatrix * e;
          // a thinned-out patch on screen around my own ship (still faintly tinted, so it feels inside the cloud)
          vec4 me = projectionMatrix * viewMatrix * vec4(uMe.x, 8.0, -uMe.y, 1.0); float asp = projectionMatrix[1][1] / projectionMatrix[0][0];
          vN = gl_Position.xy / gl_Position.w * vec2(asp, 1.0); vM = me.xy / me.w * vec2(asp, 1.0); vR = 90.0 * projectionMatrix[1][1] / me.w;   // (owner: 4x the area it was)
        }`,
      fragmentShader: `uniform sampler2D nt; uniform float uT, uG; uniform vec3 c1, c2, c3; varying vec2 vU, vN, vM; varying vec3 vS; varying float vR, vH; varying vec2 vC;
        void main() {
          float r = length(vU) * 2.0; if (r > 1.0) discard;
          float n = texture2D(nt, vU * 0.6 + vS.y * 7.3 + uT * 0.002).r, f = texture2D(nt, vU * 1.6 + vS.y * 3.1 - uT * 0.004).g;
          float v = (1.0 - r * r) * (0.55 + (n - 0.5) * 2.6) + (f - 0.5) * 0.7;
          float blob = smoothstep(0.12, 0.75, v);
          float k = smoothstep(0.0, 120.0, vS.z);
          vec3 col = mix(c1, c2, clamp(smoothstep(0.38, 0.62, vC.x) * 0.9 + vH * 0.35 + (n - 0.5) * 1.2 + (vS.y - 0.5) * 0.4, 0.0, 1.0));
          col = mix(col, c3, smoothstep(0.5, 0.85, vC.y * 0.7 + f * 0.4 + vH * 0.3) * 0.7 * blob);
          float me = smoothstep(0.7, 1.5, length(vN - vM) / vR);
          gl_FragColor = vec4(col, blob * (0.12 + 0.12 * k) * (0.35 + 0.65 * smoothstep(0.0, 50.0, vS.z)) * mix(0.3, 1.0, me) * uG);   // (screen colors)
        }`,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.layers.set(CLOUD_LAYER); return mesh;
  }
  // (owner, 2026-10-14) leashed puffs along a cloud's edge, like a wall of tethered balloons: each one is tied to its spot,
  // a ship flying into them knocks them aside (they bounce off its hull), and they float back to where they were. The main
  // cloud stays put. Simulated here on the client, for the clouds near me.
  const EDGE_R = 46, EDGE_K = 5, EDGE_C = 1.8, EDGE_MAX = 2600;   // (owner: lots of small ones)
  // (owner, 2026-10-14) spread from just outside the white edge in to a little past the red line (150 m in), small at the
  // edge and growing toward the red line (bigger ones sparser). Laid out in meters at the cloud's current scale.
  const EDGE_DEEP = 150;
  function edgeAnchors(pts, sc) {
    const W = pts.map(([x, y]) => [x * sc, y * sc]), n = W.length;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of W) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const inside = (x, y) => { let c = false; for (let i = 0; i < n; i++) { const [ax, ay] = W[i], [bx, by] = W[(i + 1) % n]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; };
    const edge = (x, y) => { let d = Infinity; for (let i = 0; i < n; i++) { const [ax, ay] = W[i], [bx, by] = W[(i + 1) % n], ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1e-9))); d = Math.min(d, Math.hypot(x - ax - ex * t, y - ay - ey * t)); } return d; };
    const cand = [], G = 8;
    for (let x = x0 - 16; x <= x1 + 16; x += G) for (let y = y0 - 16; y <= y1 + 16; y += G) {
      const px = x + (Math.random() - 0.5) * G, py = y + (Math.random() - 0.5) * G, e = edge(px, py), d = inside(px, py) ? e : -e;
      if (d < -14 || d > EDGE_DEEP + 15) continue;
      const k = Math.max(0, Math.min(1, d / EDGE_DEEP)), size = (21 + 19 * k) * (0.75 + 0.5 * Math.random());   // (owner: the smallest 3x what they were, the biggest as before)
      if (Math.random() > Math.min(1, 1.3 * (G * G) / (size * size))) continue;   // bigger: sparser
      cand.push(px / sc, py / sc, 4 + Math.random() * (14 + 30 * k), size, Math.random());
    }
    const keep = Math.min(1, EDGE_MAX * 5 / cand.length), A = [];
    for (let i = 0; i < cand.length; i += 5) if (keep >= 1 || Math.random() < keep) A.push(cand[i], cand[i + 1], cand[i + 2], cand[i + 3], cand[i + 4]);
    return A;                                  // [x, y (local), h, size (m), seed] each
  }
  function edgeMesh(b) {
    const A = edgeAnchors(b.extra.pts, b.w / 100), n = A.length / 5, th = CLOUD_THEMES[b.extra.v] || CLOUD_THEMES[0];
    const q = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = q.index; g.setAttribute("position", q.getAttribute("position")); g.setAttribute("uv", q.getAttribute("uv")); q.dispose();
    const P = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); P.setUsage(THREE.DynamicDrawUsage);
    const S = new Float32Array(n * 2); for (let i = 0; i < n; i++) { S[i * 2] = A[i * 5 + 3]; S[i * 2 + 1] = A[i * 5 + 4]; }
    g.setAttribute("iP", P); g.setAttribute("iS", new THREE.InstancedBufferAttribute(S, 2)); g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      uniforms: { nt: { value: ctx.noiseTex }, uT: cloudT, uS: { value: 1 }, c1: { value: new THREE.Vector3(...th[0]) }, c2: { value: new THREE.Vector3(...th[1]) }, c3: { value: new THREE.Vector3(...th[2]) } },
      transparent: true, depthWrite: false, ...cloudBlend,
      vertexShader: `attribute vec3 iP; attribute vec2 iS; uniform float uT, uS; varying vec2 vU; varying float vS, vH;
        void main() {
          float a = iS.y * 6.283 + uT * 0.05 * (iS.y - 0.5), c = cos(a), s = sin(a); vU = mat2(c, -s, s, c) * (uv - 0.5); vS = iS.y; vH = iP.z / 40.0;
          vec4 e = viewMatrix * vec4(iP.x, iP.z, -iP.y, 1.0); e.xy += position.xy * iS.x * uS * 2.0;
          gl_Position = projectionMatrix * e;
        }`,
      fragmentShader: `uniform sampler2D nt; uniform float uT; uniform vec3 c1, c2, c3; varying vec2 vU; varying float vS, vH;
        void main() {
          float r = length(vU) * 2.0; if (r > 1.0) discard;
          float n = texture2D(nt, vU * 0.6 + vS * 7.3 + uT * 0.002).r, f = texture2D(nt, vU * 1.6 + vS * 3.1 - uT * 0.004).g;
          float blob = smoothstep(0.12, 0.75, (1.0 - r * r) * (0.55 + (n - 0.5) * 2.6) + (f - 0.5) * 0.7);
          vec3 col = mix(mix(c1, c2, clamp(vS * 0.7 + vH * 0.4 + (n - 0.5), 0.0, 1.0)), c3, smoothstep(0.55, 0.9, f + vH * 0.2) * 0.55 * blob);
          gl_FragColor = vec4(col * 1.08, blob * 0.45);   // (screen colors; a touch brighter than the main cloud)
        }`,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.layers.set(CLOUD_LAYER);
    return { mesh, A, n, w: b.w, pos: null, vel: new Float32Array(n * 3) };
  }
  // anchors into the world (the cloud can be moved, turned and scaled; the puffs then drift to their new spots)
  function edgeWorld(b, e) {
    const s = b.w / 100, c = Math.cos(b.r), sn = Math.sin(b.r), W = new Float32Array(e.n * 3);
    for (let i = 0; i < e.n; i++) { const lx = e.A[i * 5] * s, ly = e.A[i * 5 + 1] * s; W[i * 3] = b.x + lx * c - ly * sn; W[i * 3 + 1] = b.y + lx * sn + ly * c; W[i * 3 + 2] = e.A[i * 5 + 2]; }
    return W;
  }
  function updateEdges(dt) {
    const me = ctx.myPos ? ctx.myPos() : null, ships = ctx.cloudShips ? ctx.cloudShips() : [];
    for (const b of builds.values()) {
      const e = b.edge; if (b.k !== "cloud" || !e) continue;
      // (owner, 2026-10-14: speed) the anchors are worked out again only when the cloud moves; a cloud whose puffs have
      // settled with no ship near them sleeps (no work, nothing sent to the graphics card)
      const tk = b.x + "," + b.y + "," + b.r + "," + b.w; if (e.tk !== tk) { e.tk = tk; e.W = edgeWorld(b, e); e.awake = true; }
      const W = e.W, P = e.mesh.geometry.attributes.iP.array, V = e.vel;
      if (e.w !== b.w && !(held && held.id === b.id)) { dropEdge(b); b.edge = edgeMesh(b); scene.add(b.edge.mesh); continue; }   // (rescaled: laid out again)
      if (!e.pos) { e.pos = true; P.set(W); }
      if (me && Math.hypot(me.x - b.x, me.y - b.y) > b.rad + 1500) continue;   // far away: left as they are
      const near = ships.filter((sh) => Math.hypot(sh[0] - b.x, sh[1] - b.y) < b.rad + EDGE_R + 40);
      if (!e.awake && !near.some((sh) => Math.hypot(sh[2], sh[3]) > 1)) continue;   // (a parked ship doesn't stir them)
      let moving = 0;
      for (let i = 0; i < e.n; i++) {
        const j = i * 3;
        for (let k = 0; k < 3; k++) { V[j + k] += ((W[j + k] - P[j + k]) * EDGE_K - V[j + k] * EDGE_C) * dt; P[j + k] += V[j + k] * dt; }   // the leash
        for (const sh of near) {               // a ship's hull: pushed out of it, bounced off it
          const dx = P[j] - sh[0], dy = P[j + 1] - sh[1], d = Math.hypot(dx, dy); if (d >= EDGE_R || d < 1e-3) continue;
          // (weights kept as tuned before the small ones grew)
          // (owner) a ship only nudges a puff: it gives it some of its speed as it sweeps into it (nothing holds the puff
          // out of the hull), so the leash always pulls it back home, even with a ship parked on its spot. The bigger the
          // puff, the heavier: small ones get swept along, big ones near the red line barely stir.
          const m = Math.min(0.55, Math.max(0.04, 5 / (7 + (e.A[i * 5 + 3] - 21) * 33 / 19))), nx = dx / d, ny = dy / d, vn = (V[j] - sh[2]) * nx + (V[j + 1] - sh[3]) * ny;
          if (vn < 0) { const k = -vn * m * Math.min(1, dt * 6) * (1 - d / EDGE_R * 0.5); V[j] += nx * k; V[j + 1] += ny * k; V[j + 2] += k * 0.3 * (Math.random() - 0.3); }
        }
      }
      for (let j = 0; j < e.n * 3; j++) moving = Math.max(moving, Math.abs(V[j]), Math.abs(W[j] - P[j]));
      e.awake = moving > 0.02; if (!e.awake) { P.set(W); V.fill(0); }   // settled: exactly home
      e.mesh.geometry.attributes.iP.needsUpdate = true;
    }
  }
  function dropEdge(b) { if (b.edge) { scene.remove(b.edge.mesh); b.edge.mesh.geometry.dispose(); b.edge.mesh.material.dispose(); b.edge = null; } }
  function placeCloud(b) {
    const key = JSON.stringify(b.extra.pts) + "|" + b.extra.v;
    if (b.mesh && b.mesh.userData.key !== key) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); b.mesh = null; dropEdge(b); }
    if (!b.mesh) { dropEdge(b); b.mesh = cloudMesh(b.extra.pts, b.extra.v); Object.assign(b.mesh.userData, { k: "cloud", id: b.id, key }); scene.add(b.mesh); b.edge = edgeMesh(b); scene.add(b.edge.mesh); }
    b.mesh.material.uniforms.uS.value = b.w / 100; b.mesh.material.uniforms.uG.value = held && held.id === b.id ? 0.5 : 1;   // held: see-through
    b.mesh.position.copy(toWorld(b.x, b.y, 0)); b.mesh.scale.setScalar(b.w / 100); b.mesh.rotation.y = b.r;
  }
  // ---- editing a cloud's outline in the world (Build menu open): drag a corner, click an edge's middle dot to add one,
  // right-click a corner to remove it (3 at least). Clicking inside the cloud picks it all up as usual. ----
  const inPolyF = (x, y, v) => { let c = false; for (let i = 0, n = v.length; i < n; i += 2) { const ax = v[i], ay = v[i + 1], bx = v[(i + 2) % n], by = v[(i + 3) % n]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; };
  const NSv = "http://www.w3.org/2000/svg";
  const cLayer = document.createElementNS(NSv, "svg"); cLayer.id = "cloud-handles"; cLayer.setAttribute("width", "100%"); cLayer.setAttribute("height", "100%"); document.body.appendChild(cLayer);
  let dragPt = null, lastPtSend = 0;
  const toLocal = (b, g) => { const s = b.w / 100, c = Math.cos(-b.r), n = Math.sin(-b.r), dx = g.x - b.x, dy = g.y - b.y; return [Math.round((dx * c - dy * n) / s * 10) / 10, Math.round((dx * n + dy * c) / s * 10) / 10]; };
  const scr2 = (x, y) => { const r = canvas.getBoundingClientRect(), v = new THREE.Vector3(x, CLOUD_Y, -y).project(camera); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height, v.z < 1]; };
  // the handles are kept between frames (only moved), and one listener on the layer reads which one was pressed
  let hKey = "";
  function cloudHandles() {
    const list = [];
    if (open && !picking && !held) for (const b of builds.values()) {
      if (b.k !== "cloud" || !b.poly || b.id !== sel) continue;   // (owner, 2026-10-15) only the selected cloud's handles
      const pts = []; for (let i = 0; i < b.poly.length; i += 2) pts.push(scr2(b.poly[i], b.poly[i + 1]));
      // (owner, 2026-10-14) its core outline (where ships are hidden and sight is blocked), drawn red
      const cores = (ctx.cloudCores ? ctx.cloudCores(b) : []).map((v) => { const o = []; for (let i = 0; i < v.length; i += 2) o.push(scr2(v[i], v[i + 1])); return o; });
      if (pts.some((p) => p[2] && p[0] > -50 && p[0] < innerWidth + 50 && p[1] > -50 && p[1] < innerHeight + 50)) list.push([b, pts, cores]);
    }
    const key = list.map(([b, pts, cores]) => b.id + ":" + pts.length + ":" + cores.length).join(",");
    if (key !== hKey) {
      hKey = key; while (cLayer.firstChild) cLayer.removeChild(cLayer.firstChild);
      for (const [b, pts, cores] of list) {
        for (const c of cores) { const cp = document.createElementNS(NSv, "polygon"); cp.setAttribute("class", "ch-core"); cLayer.appendChild(cp); }
        const pl = document.createElementNS(NSv, "polygon"); pl.setAttribute("class", "ch-line"); cLayer.appendChild(pl);
        pts.forEach((p, i) => { const c = document.createElementNS(NSv, "circle"); c.setAttribute("r", 4); c.setAttribute("class", "ch-mid"); c.dataset.id = b.id; c.dataset.i = i; cLayer.appendChild(c); });
        pts.forEach((p, i) => { const c = document.createElementNS(NSv, "circle"); c.setAttribute("r", 6); c.setAttribute("class", "ch-pt"); c.dataset.id = b.id; c.dataset.i = i; cLayer.appendChild(c); });
      }
    }
    let el = cLayer.firstChild;
    for (const [, pts, cores] of list) {
      for (const c of cores) { el.setAttribute("points", c.map((p) => p[0] + "," + p[1]).join(" ")); el = el.nextSibling; }
      el.setAttribute("points", pts.map((p) => p[0] + "," + p[1]).join(" ")); el = el.nextSibling;
      pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; el.setAttribute("cx", (p[0] + q[0]) / 2); el.setAttribute("cy", (p[1] + q[1]) / 2); el = el.nextSibling; });
      pts.forEach((p) => { el.setAttribute("cx", p[0]); el.setAttribute("cy", p[1]); el = el.nextSibling; });
    }
  }
  cLayer.addEventListener("contextmenu", (e) => e.preventDefault());
  cLayer.addEventListener("pointerdown", (e) => {
    const t = e.target, b = t.dataset && builds.get(t.dataset.id); if (!b || b.k !== "cloud") return;
    const i = +t.dataset.i; e.preventDefault(); e.stopPropagation();
    if (t.classList.contains("ch-mid")) {                   // the middle of an edge: a new corner there
      if (e.button !== 0 || b.extra.pts.length >= 64) return;
      const a = b.extra.pts[i], z = b.extra.pts[(i + 1) % b.extra.pts.length]; b.extra.pts.splice(i + 1, 0, [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2]); startPt(e, b, i + 1);
    } else if (e.button === 2) { if (b.extra.pts.length > 3) { b.extra.pts.splice(i, 1); place(b); push(b, true); } }
    else if (e.button === 0) startPt(e, b, i);
  });
  function startPt(e, b, i) { dragPt = { id: b.id, i, pid: e.pointerId }; try { cLayer.setPointerCapture(e.pointerId); } catch {} place(b); }
  cLayer.addEventListener("pointermove", (e) => {
    if (!dragPt || e.pointerId !== dragPt.pid) return; const b = builds.get(dragPt.id), g = ground(e.clientX, e.clientY); if (!b || !g) return;
    b.extra.pts[dragPt.i] = toLocal(b, g); place(b);
    const t = performance.now(); if (t - lastPtSend > 90) { lastPtSend = t; push(b, true); }
  });
  const endPt = (e) => { if (!dragPt || e.pointerId !== dragPt.pid) return; const b = builds.get(dragPt.id); dragPt = null; try { cLayer.releasePointerCapture(e.pointerId); } catch {} if (b) push(b, true); };
  cLayer.addEventListener("pointerup", endPt); cLayer.addEventListener("pointercancel", endPt);

  // ---- placing pieces ----
  const hold = (b) => {
    if (b.k === "capture") { b.polys = []; b.rad = b.w / 2; return; }   // (blocks nothing)
    if (b.k === "cloud") { b.poly = cloudPoly(b); b.polys = []; b.rad = polyRad(b, b.poly); return; }
    b.polys = partsOf(b); b.rad = Math.max(...b.polys.map((v) => polyRad(b, v)));
  };
  function shapeMesh(k, mat) { const g = new THREE.Group(); for (const geo of shapeGeos(k)) g.add(new THREE.Mesh(geo, mat)); g.userData.key = k + JSON.stringify(coll[k] || ""); return g; }
  function place(b) {
    if (b.k === "cloud") { placeCloud(b); hold(b); if (ctx.onChange) ctx.onChange(); return; }
    if (b.k === "capture") {
      if (!b.mesh) { b.mesh = captureMesh(false); b.mesh.userData.id = b.id; scene.add(b.mesh); }
      b.mesh.position.set(b.x, 0.6, -b.y); b.mesh.scale.set(b.w, 1, b.w); hold(b); return;
    }
    if (b.mesh && b.mesh.userData.key !== b.k + JSON.stringify(coll[b.k] || "")) { scene.remove(b.mesh); b.mesh = null; }
    if (!b.mesh) { b.mesh = shapeMesh(b.k, ctx.farMat ? ctx.farMat(pieceMat) : pieceMat); b.mesh.userData.id = b.id; scene.add(b.mesh); if (held && held.id === b.id) holo(b.mesh, true); }
    b.mesh.position.copy(toWorld(b.x, b.y, 0)); b.mesh.scale.set(b.w, 1, b.d); b.mesh.rotation.y = b.r;
    hold(b); if (ctx.onChange) ctx.onChange();   // (the line-of-sight shadows need redrawing)
  }
  function setBuild([id, k, x, y, w, d, r, extra]) {
    if (!kindOk(k) || (held && held.id === id) || (dragPt && dragPt.id === id)) return;
    { const o = builds.get(id); if (o && o.localAt && performance.now() - o.localAt < 600) return; }   // (my own recent change is ahead of the server's echo)
    const b = builds.get(id) || { id }; Object.assign(b, { k, x, y, w, d, r }); if (extra) b.extra = extra; builds.set(id, b); place(b);
  }
  function unBuild(id) {
    const b = builds.get(id); if (!b) return;
    if (held && held.id === id) held = null;
    if (b.mesh) scene.remove(b.mesh); dropEdge(b); builds.delete(id); if (sel === id) sel = null; if (ctx.onChange) ctx.onChange();
  }

  // ---- state ----
  let staff = false, open = false, picking = null, held = null, clip = null, lastSend = 0, sel = null, shapeAt = "square", cloudTheme = 0;
  try { const c = JSON.parse(localStorage.getItem("atamus.buildclip") || "null"); if (c && kindOk(c.k)) clip = c; } catch {}
  const mouse = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { capture: true, passive: true });

  // ---- UI: [B] and the slot row (Shape, Nebula) ----
  const btn = document.createElement("button"); btn.id = "build-btn"; btn.type = "button"; btn.textContent = "B"; btn.title = "Build"; btn.hidden = true;
  btn.addEventListener("click", () => toggle());
  const bar = document.createElement("div"); bar.id = "build-bar"; bar.hidden = true;
  const svgPic = (inner) => { const d = document.createElement("span"); d.innerHTML = '<svg viewBox="0 0 30 30" width="30" height="30" class="build-ico">' + inner + "</svg>"; return d.firstChild; };
  const PICS = { square: '<rect x="7" y="7" width="16" height="16"/>', cylinder: '<circle cx="15" cy="15" r="8.5"/>', triangle: '<path d="M15 6 L24 23 L6 23 Z"/>' };
  const cloudPic = () => { const c = CLOUD_THEMES[cloudTheme][1].map((v) => Math.round(v * 255)).join(","), d = document.createElement("span");
    d.innerHTML = '<svg viewBox="0 0 30 30" width="30" height="30"><path d="M8 21 Q3 21 4 16 Q5 12 9 13 Q10 7 16 8 Q21 8 22 13 Q27 13 26 18 Q25 22 21 21 Z" fill="rgba(' + c + ',0.5)" stroke="rgb(' + c + ')" stroke-width="1.6"/></svg>'; return d.firstChild; };
  const shapeSlot = document.createElement("div"), cloudSlot = document.createElement("div"), capSlot = document.createElement("div");
  for (const d of [shapeSlot, cloudSlot, capSlot]) { d.className = "inv-slot build-slot"; bar.appendChild(d); }
  capSlot.addEventListener("click", () => { if (picking && picking.k === "capture") stopPicking(); else startPicking("capture"); });
  shapeSlot.addEventListener("click", () => { if (picking && SHAPES.includes(picking.k)) stopPicking(); else startPicking(shapeAt); });
  cloudSlot.addEventListener("click", () => { if (picking && picking.k === "cloud") stopPicking(); else startPicking("cloud"); });
  function drawSlots() {
    shapeSlot.title = NAMES[shapeAt]; shapeSlot.replaceChildren(svgPic(PICS[shapeAt])); cloudSlot.title = NAMES.cloud; cloudSlot.replaceChildren(cloudPic());
    shapeSlot.classList.toggle("sel", !!picking && SHAPES.includes(picking.k)); cloudSlot.classList.toggle("sel", !!picking && picking.k === "cloud");
    capSlot.title = NAMES.capture; capSlot.replaceChildren(svgPic('<circle cx="15" cy="15" r="10" fill="rgba(95,209,160,0.25)" stroke="#7fe8bb" stroke-width="1.6"/>')); capSlot.classList.toggle("sel", !!picking && picking.k === "capture");
  }
  drawSlots(); document.body.append(bar);
  function mountBtn() { const col = document.getElementById("staff-col") || document.body; if (!btn.parentNode) col.appendChild(btn); }
  function setStaff(v) { staff = !!v; btn.hidden = !staff; if (staff) mountBtn(); if (!staff && open) toggle(false); }
  function toggle(v) { if (!staff) return; open = v === undefined ? !open : !!v; bar.hidden = !open; btn.classList.toggle("on", open); if (!open) { stopPicking(); sel = null; } }

  // ---- the blueprint of a new piece ----
  let ghost = null;
  function startPicking(k) {
    if (ghost) { scene.remove(ghost); ghost = null; } if (SHAPES.includes(k)) shapeAt = k; sel = null;
    picking = k === "cloud" ? { k, w: 100, d: 100, r: 0, extra: { pts: CLOUD_START.map((q) => q.slice()), v: cloudTheme } } : k === "capture" ? { k, w: 200, d: 200, r: 0 } : { k, w: 60, d: 60, r: 0 }; drawSlots();
  }
  function stopPicking() { picking = null; if (ghost) { scene.remove(ghost); ghost = null; } drawSlots(); }
  function cycle(dir) { if (!picking || !SHAPES.includes(picking.k)) return; startPicking(SHAPES[(SHAPES.indexOf(picking.k) + dir + SHAPES.length) % SHAPES.length]); }

  // ---- the selected piece's attributes: Rotation (degrees); a shape: Width / Depth (m); a nebula: Scale (%) and Theme ----
  const aPanel = document.createElement("div"); aPanel.id = "attr-panel"; aPanel.hidden = true;
  const aTop = document.createElement("div"); aTop.className = "attr-top"; aPanel.append(aTop); document.body.appendChild(aPanel);
  aPanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  if (window.WinPos) window.WinPos.watch(aTop, aPanel, "attrs");
  aTop.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; e.preventDefault(); const r0 = aPanel.getBoundingClientRect(), ox = e.clientX - r0.left, oy = e.clientY - r0.top;
    const mv = (ev) => { const r = aPanel.getBoundingClientRect(); aPanel.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - ox)) + "px"; aPanel.style.top = Math.max(0, Math.min(innerHeight - r.height, ev.clientY - oy)) + "px"; aPanel.style.right = "auto"; };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); }; addEventListener("pointermove", mv); addEventListener("pointerup", up);
  });
  const gBox = document.createElement("div"); gBox.id = "gen-box"; aPanel.appendChild(gBox);
  const gField = (label, el) => { const l = document.createElement("label"), sp = document.createElement("span"); sp.textContent = label; l.append(sp, el); gBox.appendChild(l); return el; };
  const num = (min, max) => Object.assign(document.createElement("input"), { type: "number", step: 1, ...(min != null ? { min } : {}), ...(max != null ? { max } : {}) });
  const gRot = gField("Rotation", num()), gW = gField("Width", num(MIN, MAX)), gD = gField("Depth", num(MIN, MAX)), gScale = gField("Scale", num(MIN, MAX)), gSize = gField("Size", num(MIN, MAX));
  const gTheme = gField("Theme", document.createElement("select")); ["Violet", "Teal", "Amber", "Emerald", "Crimson"].forEach((n, i) => gTheme.append(new Option(n, String(i))));
  for (const el of [gRot, gW, gD, gScale, gSize, gTheme]) el.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") el.blur(); });
  const selPiece = () => (sel && builds.get(sel)) || null;
  const setNum = (el, f) => { const go = (now) => { const b = selPiece(), v = Number(el.value); if (!b || el.value === "" || !Number.isFinite(v)) return; f(b, v); place(b); push(b, now); }; el.addEventListener("input", () => go(false)); el.addEventListener("change", () => go(true)); };
  setNum(gRot, (b, v) => { const r = -v * Math.PI / 180; b.r = Math.round(Math.atan2(Math.sin(r), Math.cos(r)) * 10000) / 10000; });
  setNum(gW, (b, v) => { if (b.k !== "cloud") b.w = Math.max(MIN, Math.min(MAX, v)); });
  setNum(gD, (b, v) => { if (b.k !== "cloud") b.d = Math.max(MIN, Math.min(MAX, v)); });
  setNum(gScale, (b, v) => { if (b.k === "cloud") b.w = b.d = Math.max(MIN, Math.min(MAX, v)); });
  setNum(gSize, (b, v) => { if (b.k === "capture") b.w = b.d = Math.max(MIN, Math.min(MAX, v)); });   // (a capture point: m across)
  gTheme.addEventListener("change", () => { const b = selPiece(); if (!b || b.k !== "cloud") return; b.extra = { ...b.extra, v: +gTheme.value }; cloudTheme = b.extra.v; drawSlots(); place(b); push(b, true); gTheme.blur(); });
  let gShown = "";
  function attrPanel() {
    const b = open && !picking && !held ? selPiece() : null;
    const was = aPanel.hidden; aPanel.hidden = !b; if (!b) { gShown = ""; return; }
    if (was && window.WinPos) window.WinPos.place(aPanel, "attrs");
    aTop.textContent = NAMES[b.k] || "";
    const cap = b.k === "capture"; gRot.parentNode.hidden = cap; gSize.parentNode.hidden = !cap;
    gW.parentNode.hidden = gD.parentNode.hidden = b.k === "cloud" || cap; gScale.parentNode.hidden = gTheme.parentNode.hidden = b.k !== "cloud";
    const key = b.id + ":" + b.r + ":" + b.w + ":" + b.d + ":" + (b.extra && b.extra.v);
    if (key !== gShown && !gBox.contains(document.activeElement)) { gRot.value = String(Math.round(-b.r * 180 / Math.PI * 10) / 10); gW.value = String(Math.round(b.w)); gD.value = String(Math.round(b.d)); gScale.value = String(Math.round(b.w)); gSize.value = String(Math.round(b.w)); if (b.k === "cloud") gTheme.value = String(b.extra.v || 0); gShown = key; }
  }

  // ---- sending edits (throttled; the last always goes) ----
  const fields = (b) => (b.extra ? { k: b.k, x: b.x, y: b.y, w: b.w, d: b.d, r: b.r, extra: JSON.parse(JSON.stringify(b.extra)) } : { k: b.k, x: b.x, y: b.y, w: b.w, d: b.d, r: b.r });
  function push(b, now) { const t = performance.now(); b.localAt = t; if (!now && t - lastSend < 90) { pendSend(b); return; } lastSend = t; send({ t: "bset", id: b.id, ...fields(b) }); }
  let pend = null;
  function pendSend(b) { if (pend) { pend.b = b; return; } pend = { b }; setTimeout(() => { const p = pend; pend = null; if (p && builds.get(p.b.id) === p.b) push(p.b, true); }, 100); }
  function create(o) { send({ t: "bnew", ...o }); }

  // ---- clicking: place the blueprint, select a piece, drag the selected one ----
  let oDrag = null;
  canvas.addEventListener("pointermove", (e) => {
    if (!oDrag || e.pointerId !== oDrag.pid) return; const b = builds.get(oDrag.id), g = ground(e.clientX, e.clientY); if (!b || !g) return;
    const nx = g.x + oDrag.ox, ny = g.y + oDrag.oy; if (!ctx.inside(nx, ny)) return;
    b.x = Math.round(nx * 100) / 100; b.y = Math.round(ny * 100) / 100; place(b); push(b, false);
  });
  const oEnd = (e) => { if (!oDrag || e.pointerId !== oDrag.pid) return; const b = builds.get(oDrag.id); oDrag = null; try { canvas.releasePointerCapture(e.pointerId); } catch {} if (b) push(b, true); };
  canvas.addEventListener("pointerup", oEnd); canvas.addEventListener("pointercancel", oEnd);
  canvas.addEventListener("pointerdown", (e) => {
    if (!open || e.button !== 0) return;
    const g = ground(e.clientX, e.clientY);
    if (picking) { if (g && ctx.inside(g.x, g.y)) create({ k: picking.k, x: g.x, y: g.y, w: picking.w, d: picking.d, r: picking.r, ...(picking.extra ? { extra: picking.extra } : {}) }); return; }
    ray.setFromCamera(ndc(e.clientX, e.clientY), camera);
    const hits = ray.intersectObjects([...builds.values()].filter((b) => b.k !== "cloud" && b.k !== "capture" && b.mesh).map((b) => b.mesh), true);
    let o = hits.length ? hits[0].object : null; while (o && !(o.userData && o.userData.id)) o = o.parent;
    let hitB = o && g ? builds.get(o.userData.id) : null;
    if (!hitB && g) for (const b of builds.values()) if (b.k === "cloud" && b.poly && inPolyF(g.x, g.y, b.poly)) { hitB = b; break; }   // a nebula: a click inside its outline
    if (!hitB && g) for (const b of builds.values()) if (b.k === "capture" && Math.hypot(g.x - b.x, g.y - b.y) <= b.w / 2) { hitB = b; break; }   // a capture point: inside its circle
    if (hitB) {
      if (sel !== hitB.id) { sel = hitB.id; return; }   // the first click selects it; pressing on it again drags it
      oDrag = { id: hitB.id, ox: hitB.x - g.x, oy: hitB.y - g.y, pid: e.pointerId }; try { canvas.setPointerCapture(e.pointerId); } catch {} return;
    }
    sel = null;
  });

  // ---- keys (only while the menu is open, and never while typing) ----
  addEventListener("keydown", (e) => {
    if (ctx.typing()) return;
    if (e.code === "KeyB" && !e.ctrlKey && !e.metaKey && !e.altKey) { if (staff) { e.preventDefault(); if (!e.repeat) toggle(); } return; }
    if (!open) return;
    const ctrl = e.ctrlKey || e.metaKey, b = selPiece(), eat = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (ctrl && e.code === "KeyC") { eat(); if (b) copy(b); return; }
    if (ctrl && e.code === "KeyX") { eat(); if (b) { copy(b); sel = null; send({ t: "bdel", id: b.id }); } return; }
    if (ctrl && e.code === "KeyV") { eat(); if (clip) { const g = ground(mouse.x, mouse.y); if (g && ctx.inside(g.x, g.y)) create({ ...clip, x: g.x, y: g.y }); } return; }
    if (ctrl) return;
    if (e.code === "Delete") { eat(); if (b) { sel = null; send({ t: "bdel", id: b.id }); } return; }
    if (e.code === "Escape") { if (picking) stopPicking(); else if (sel) sel = null; else toggle(false); }
    if ((e.code === "ArrowLeft" || e.code === "ArrowRight") && picking) { eat(); cycle(e.code === "ArrowLeft" ? -1 : 1); }
  }, true);
  function copy(b) { clip = b.extra ? { k: b.k, w: b.w, d: b.d, r: b.r, extra: JSON.parse(JSON.stringify(b.extra)) } : { k: b.k, w: b.w, d: b.d, r: b.r }; try { localStorage.setItem("atamus.buildclip", JSON.stringify(clip)); } catch {} }

  // ---- every frame: the nebulae, the handles, the panel, the blueprint following the pointer ----
  let lastF = performance.now();
  function frame() {
    const now = performance.now(), dt = Math.min(0.1, (now - lastF) / 1000); lastF = now; holoT.value = now / 1000;
    cloudT.value = now / 1000; if (ctx.myPos) { const p = ctx.myPos(); if (p) cloudMe.value.set(p.x, p.y); }
    updateEdges(dt); cloudHandles(); attrPanel();
    if (!open || !picking) return;
    const g = ground(mouse.x, mouse.y), gk = picking.k === "cloud" || picking.k === "capture" ? picking.k : picking.k + JSON.stringify(coll[picking.k] || "");
    if (!ghost || ghost.userData.gk !== gk) {
      if (ghost) scene.remove(ghost);
      ghost = picking.k === "cloud" ? cloudMesh(picking.extra.pts, picking.extra.v, true) : picking.k === "capture" ? captureMesh(true) : shapeMesh(picking.k, holoMat);
      ghost.userData.gk = gk; scene.add(ghost);
    }
    ghost.visible = !!g;
    if (g) { ghost.position.copy(toWorld(g.x, g.y, picking.k === "capture" ? 0.6 : 0)); ghost.rotation.y = picking.r; if (picking.k === "capture") ghost.scale.set(picking.w, 1, picking.w); else if (picking.k === "cloud") { ghost.scale.setScalar(picking.w / 100); ghost.material.uniforms.uS.value = picking.w / 100; } else ghost.scale.set(picking.w, 1, picking.d); }
  }
  function onMsg(m) {
    if (m.t === "build") { setBuild(m.o); return true; }
    if (m.t === "unbuild") { unBuild(m.id); return true; }
    if (m.t === "bnew") return true;
    return false;
  }
  function load(list, h, c) {
    for (const k of Object.keys(coll)) delete coll[k]; if (c && typeof c === "object") for (const [k, v] of Object.entries(c)) if (Array.isArray(v)) coll[k] = v;
    if (h && h !== BUILD_H) BUILD_H = h;
    held = null; for (const id of [...builds.keys()]) unBuild(id); for (const o of list || []) setBuild(o);
  }
  return { onMsg, load, frame, setStaff, get open() { return open; } };
}
