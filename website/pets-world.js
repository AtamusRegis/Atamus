// Pet Delivery Co.: the world, shared by the page (website/pets-world.js) and the server
// (packages/server/src/pets-world.js). The two copies must stay identical (scripts/check.sh compares them).
// (owner, 2026-11-08) The town is a big floating island: plateaus with cliffs, winding roads cut into the slopes, houses
// along the roads, the plaza in the middle; small islands float off its edge. Animal control vans patrol the roads and
// helicopters the sky; they chase whoever they spot for a short while, and a player who keeps getting away gets a
// wanted level that makes them easier to spot and chased harder.

export const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), hyp = Math.hypot, smooth = (t) => t * t * (3 - 2 * t);

// ---- noise ----
function hash(ix, iz) { let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
function fbm(x, z) { let s = 0, amp = 0.5, f = 1; for (let o = 0; o < 4; o++) { s += noise(x * f, z * f) * amp; amp *= 0.5; f *= 2; } return s / 0.9375; }
export function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// ---- the island's outline ----
export const R_TOWN = 232;
export const edgeR = (a) => R_TOWN + 16 * Math.sin(3 * a + 1) + 9 * Math.sin(7 * a + 2.3) + 4 * Math.sin(13 * a + 0.7);
export const inside = (x, z, margin = 0) => hyp(x, z) < edgeR(Math.atan2(z, x)) - margin;

// ---- the plaza and its buildings ----
export const PLAZA = 50;
export const POST = { x: 0, z: -10 }, PICKUP = { x: 0, z: 4, r: 4 }, BOARD = { x: 11, z: 4, r: 3 };
export const SHOP = { x: 32, z: 2, r: 5 }, SHOP_B = { x: 32, z: -9 }, TRAIN = { x: -31, z: 2, r: 9 };
export const POUND = { x: 0, z: 36 }, RELEASE = { x: 0, z: 26 }, SPAWN = { x: 0, z: 14 };

// ---- the land: rolling ground stepped into plateaus (the steps are cliffs), two big hills, flat at the plaza ----
const PEAKS = [[128, -64, 16, 24], [-118, 96, 15, 22], [-30, -205, 14, 20], [205, 40, 12, 18]];
function rawH(x, z) {
  let h = Math.max(0, fbm(x / 95 + 3.1, z / 95 - 7.7) - 0.36) * 75;
  for (const [px, pz, a, s] of PEAKS) h += a * Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / (2 * s * s));
  const step = 8, L = Math.floor(h / step), f = h / step - L; h = (L + smooth(clamp((f - 0.74) / 0.26, 0, 1))) * step;
  h += (fbm(x / 13, z / 13) - 0.5) * 1.4;
  return Math.max(0, h * smooth(clamp((hyp(x, z) - PLAZA) / 30, 0, 1)));
}

// ---- roads: two winding rings and six winding spokes from the plaza (Catmull-Rom through the points) ----
const ringR = (r0, wob, ph) => (a) => r0 + wob * Math.sin(3 * a + ph) + wob * 0.5 * Math.sin(5 * a + ph * 2);
const RING1 = ringR(100, 13, 0.5), RING2 = ringR(168, 12, 2.0);
function ring(fr, n) { const p = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; p.push([Math.cos(a) * fr(a), Math.sin(a) * fr(a)]); } return p; }
function spoke(k) {
  const a0 = (k / 6) * TAU + 0.26, p = [];
  for (const r of [PLAZA - 2, 72, null, 132, null]) {
    const a = a0 + 0.2 * Math.sin(k * 1.7 + (r || 0) * 0.04);
    const rr = r === null ? (p.length === 2 ? RING1(a) : RING2(a)) : r;
    p.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return p;
}
function sampleRoad(pts, loop) {
  const n = pts.length, P = (i) => pts[loop ? (i + n) % n : clamp(i, 0, n - 1)], out = [];
  const segs = loop ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), steps = Math.max(2, Math.ceil(hyp(p2[0] - p1[0], p2[1] - p1[1]) / 2));
    for (let j = 0; j < steps; j++) {
      const t = j / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!loop) out.push(pts[n - 1].slice());
  const S = [0]; for (let i = 1; i < out.length; i++) S.push(S[i - 1] + hyp(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  const len = S[S.length - 1] + (loop ? hyp(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) : 0);
  return { pts: out, S, len, loop };
}
export const ROADS = [sampleRoad(ring(RING1, 14), true), sampleRoad(ring(RING2, 22), true)];
for (let k = 0; k < 6; k++) ROADS.push(sampleRoad(spoke(k), false));
export const ROAD_HALF = 4;
// where along a road (s metres from its start) and which way it runs there
export function roadAt(R, s) {
  const { pts, S, len, loop } = R; s = loop ? ((s % len) + len) % len : clamp(s, 0, len);
  let lo = 0, hi = S.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m] <= s) lo = m; else hi = m - 1; }
  const a = pts[lo], b = lo + 1 < pts.length ? pts[lo + 1] : loop ? pts[0] : pts[lo], prev = lo > 0 ? pts[lo - 1] : a;
  const segL = hyp(b[0] - a[0], b[1] - a[1]), t = segL > 0 ? (s - S[lo]) / segL : 0;
  let fx = b[0] - a[0], fz = b[1] - a[1]; if (segL === 0) { fx = a[0] - prev[0]; fz = a[1] - prev[1]; }
  const fl = hyp(fx, fz) || 1;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, fx: fx / fl, fz: fz / fl };
}

// ---- the height grid (2 m): land under roads follows a blurred copy of the land, so roads climb gently and cut ramps
// through the cliffs; the plaza and every house sit flat ----
const G = 2, GN = 320, G0 = -320;
const RAW = new Float32Array(GN * GN), BLUR = new Float32Array(GN * GN), HGT = new Float32Array(GN * GN), DIST = new Float32Array(GN * GN).fill(99);
for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) RAW[j * GN + i] = rawH(G0 + i * G, G0 + j * G);
{ // three box blurs, 54 m wide
  BLUR.set(RAW); const tmp = new Float32Array(GN * GN), r = 13;
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j < GN; j++) { let s = 0; for (let i = -r; i <= r; i++) s += BLUR[j * GN + clamp(i, 0, GN - 1)]; for (let i = 0; i < GN; i++) { tmp[j * GN + i] = s / (2 * r + 1); s += BLUR[j * GN + Math.min(GN - 1, i + r + 1)] - BLUR[j * GN + Math.max(0, i - r)]; } }
    for (let i = 0; i < GN; i++) { let s = 0; for (let j = -r; j <= r; j++) s += tmp[clamp(j, 0, GN - 1) * GN + i]; for (let j = 0; j < GN; j++) { BLUR[j * GN + i] = s / (2 * r + 1); s += tmp[Math.min(GN - 1, j + r + 1) * GN + i] - tmp[Math.max(0, j - r) * GN + i]; } }
  }
}
for (const R of ROADS) for (let k = 0; k < R.pts.length; k++) {
  const [x, z] = R.pts[k], ci = Math.round((x - G0) / G), cj = Math.round((z - G0) / G);
  for (let j = cj - 7; j <= cj + 7; j++) for (let i = ci - 7; i <= ci + 7; i++) { if (i < 0 || j < 0 || i >= GN || j >= GN) continue; const d = hyp(G0 + i * G - x, G0 + j * G - z); if (d < DIST[j * GN + i]) DIST[j * GN + i] = d; }
}
for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
  const k = j * GN + i, w = 1 - smooth(clamp((DIST[k] - 5.5) / 7, 0, 1)), d = hyp(G0 + i * G, G0 + j * G);
  HGT[k] = (RAW[k] + (BLUR[k] - RAW[k]) * w) * smooth(clamp((d - PLAZA + 4) / 40, 0, 1));
}
function sample(A, x, z) {
  const fx = clamp((x - G0) / G, 0, GN - 1.001), fz = clamp((z - G0) / G, 0, GN - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * GN + i;
  return A[k] * (1 - u) * (1 - v) + A[k + 1] * u * (1 - v) + A[k + GN] * (1 - u) * v + A[k + GN + 1] * u * v;
}
export const terrain = (x, z) => sample(HGT, x, z);
export const smoothTerrain = (x, z) => sample(BLUR, x, z);
export const roadDist = (x, z) => sample(DIST, x, z);

// ---- houses: along the roads, both sides, facing them, each with a mailbox at the roadside; 3 on each small island ----
export const houses = [], solids = [], trees = [];
// solids: { x, z, c, s (cos / sin of its turn), hw, hd (half sizes), y0, y1 }
const solid = (x, z, yaw, hw, hd, y0, y1) => solids.push({ x, z, c: Math.cos(yaw), s: Math.sin(yaw), hw, hd, y0, y1 });
const rand = rng(20261108);
function flatten(x, z, yaw, hw, hd, h) {
  const c = Math.cos(yaw), s = Math.sin(yaw), r = Math.max(hw, hd) + 4;
  for (let j = Math.floor((z - r - G0) / G); j <= Math.ceil((z + r - G0) / G); j++) for (let i = Math.floor((x - r - G0) / G); i <= Math.ceil((x + r - G0) / G); i++) {
    if (i < 0 || j < 0 || i >= GN || j >= GN) continue;
    const wx = G0 + i * G - x, wz = G0 + j * G - z, lx = Math.abs(wx * c - wz * s), lz = Math.abs(wx * s + wz * c);
    const out = Math.max(lx - hw - 1, lz - hd - 1, 0), w = 1 - smooth(clamp(out / 3, 0, 1)), k = j * GN + i;
    HGT[k] += (h - HGT[k]) * w;
  }
}
// ---- housing plots (owner, 2026-11-08): 20 x 20 m (5 x 5 squares of 4 m) where players build their own houses,
// seen by everyone: 3 near the middle of town (first come, first served), 5 around town (given out at random), 2 on
// an island above the middle (VIP), and 6 on an island off the edge that appears when a room has more than 10 players.
// The land under a town plot is flattened and kept clear of houses and trees. ----
export const PLOT = 20, CELL = 4, GRID = 5, LEVELS = 3, LEVEL_H = 4.5;
export const PLOTS = [];
{
  const clear = (x, z, r) => { for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) if (roadDist(x + a * r, z + b * r) < 5.6 || !inside(x + a * r, z + b * r, 6)) return false; return roadDist(x, z) > 12; };
  const flatness = (x, z) => { const hs = [[-11, -11], [11, -11], [-11, 11], [11, 11], [0, 0]].map(([a, b]) => terrain(x + a, z + b)); return Math.max(...hs) - Math.min(...hs); };
  const pickPlots = (n, r0, r1, apart, kind) => {
    const cands = [];
    for (let a = 0; a < TAU; a += 0.035) for (let r = r0; r <= r1; r += 4) { const x = Math.cos(a) * r, z = Math.sin(a) * r; if (clear(x, z, 11.5)) { const f = flatness(x, z); if (f < 7) cands.push({ x, z, f: f + Math.abs(r - (r0 + r1) / 2) * 0.05 }); } }
    cands.sort((p, q) => p.f - q.f);
    const got = [];
    for (const c of cands) { if (got.length >= n) break; if ([...PLOTS, ...got].some((p) => hyp(p.x - c.x, p.z - c.z) < apart)) continue; got.push(c); }
    for (const c of got) PLOTS.push({ id: PLOTS.length, x: Math.round(c.x), z: Math.round(c.z), y: 0, kind });
  };
  pickPlots(3, PLAZA + 16, PLAZA + 44, 40, "center");
  // ids 3 and 4: the VIP island; 5-9 around town; 10-15 the extra island
  PLOTS.push({ id: 3, x: -12, z: 30, y: 62, kind: "vip" }, { id: 4, x: 12, z: 30, y: 62, kind: "vip" });
  pickPlots(5, 118, 196, 55, "random");
  for (let k = 0; k < 6; k++) PLOTS.push({ id: 10 + k, x: 400 + ((k % 3) - 1) * 24, z: (Math.floor(k / 3) - 0.5) * 24, y: 8, kind: "extra" });
  PLOTS.forEach((p, i) => (p.id = i));
  for (const p of PLOTS) if (p.kind === "center" || p.kind === "random") { const hs = [[-10, -10], [10, -10], [-10, 10], [10, 10], [0, 0]].map(([a, b]) => terrain(p.x + a, p.z + b)); p.y = Math.round((hs.reduce((a, b) => a + b, 0) / hs.length) * 10) / 10; }
}
export const VIP_ISLAND = { x: 0, z: 30, y: 62, r: 30 }, EXTRA_ISLAND = { x: 400, z: 0, y: 8, r: 48 };
export const plotAt = (x, z) => PLOTS.find((p) => Math.abs(x - p.x) < PLOT / 2 && Math.abs(z - p.z) < PLOT / 2) || null;
const nearPlot = (x, z, m) => PLOTS.some((p) => Math.abs(p.x - x) < PLOT / 2 + m && Math.abs(p.z - z) < PLOT / 2 + m);
for (const R of ROADS) {
  for (let s = 12; s < R.len - 8; s += 15) {
    const p = roadAt(R, s);
    for (const side of [-1, 1]) {
      const rx = -p.fz * side, rz = p.fx * side, x = p.x + rx * 13.5, z = p.z + rz * 13.5;
      if (!inside(x, z, 9) || hyp(x, z) < PLAZA + 9) continue;
      if (houses.some((h) => hyp(h.x - x, h.z - z) < 12.5) || nearPlot(x, z, 7)) continue;
      const yaw = Math.atan2(-rx, -rz), c = Math.cos(yaw), sn = Math.sin(yaw), corners = [[-5, -5], [5, -5], [-5, 5], [5, 5], [0, 0]].map(([lx, lz]) => [x + lx * c + lz * sn, z - lx * sn + lz * c]);
      if (corners.some(([cx, cz]) => roadDist(cx, cz) < 5.2)) continue;
      const hs = corners.map(([cx, cz]) => terrain(cx, cz)), lo = Math.min(...hs);
      if (Math.max(...hs) - lo > 5) continue;
      const mx = p.x + rx * 6, mz = p.z + rz * 6;
      houses.push({ x, z, yaw, base: lo, mx, mz, my: 0, sky: false, r: rand() });
    }
  }
}
for (const h of houses) { flatten(h.x, h.z, h.yaw, 4.5, 4.5, h.base); }
for (const p of PLOTS) if (p.kind === "center" || p.kind === "random") flatten(p.x, p.z, 0, PLOT / 2 + 0.5, PLOT / 2 + 0.5, p.y);
for (const h of houses) { h.my = terrain(h.mx, h.mz); h.d = hyp(h.mx - POST.x, h.mz - POST.z); solid(h.x, h.z, h.yaw, 4.5, 4.5, h.base - 4, h.base + 8); }
// the small floating islands, off the town's edge; only fliers get there
// (owner, 2026-11-08: more, some above the town) off the edge, low enough to glide down to, and a ring high above
// the town that only flapping fliers reach
const OFF = [[0.5, 300, -4, 16], [1.15, 335, 10, 13], [1.75, 300, 6, 15], [2.4, 330, -10, 14], [3.0, 300, -8, 17], [3.6, 335, 14, 13], [4.2, 300, 2, 14], [4.8, 330, -2, 13], [5.4, 300, 10, 13], [5.95, 335, 16, 12]];
const HIGH = [[-60, -40, 84, 15], [95, 70, 96, 14], [-125, -110, 88, 13], [20, 150, 92, 14], [150, -120, 100, 12], [-150, 60, 106, 13], [40, -170, 112, 12], [0, 20, 124, 11]];
export const ISLANDS = [...OFF.map(([a, r, y, rr]) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r, y, r: rr })), ...HIGH.map(([x, z, y, r]) => ({ x, z, y, r, high: true }))];
export const islandAt = (x, z) => ISLANDS.find((i) => hyp(x - i.x, z - i.z) < i.r - 0.6) || [VIP_ISLAND, EXTRA_ISLAND].find((i) => hyp(x - i.x, z - i.z) < i.r - 0.6) || null;
for (const isl of ISLANDS) {
  for (let k = 0; k < 3; k++) {
    const a = (k * TAU) / 3 + isl.x * 0.01, hr = isl.r * 0.36, x = isl.x + Math.cos(a) * hr, z = isl.z + Math.sin(a) * hr;
    const mr = Math.min(isl.r - 1.5, hr + 6.5), mx = isl.x + Math.cos(a) * mr, mz = isl.z + Math.sin(a) * mr, yaw = Math.atan2(Math.cos(a), Math.sin(a));
    houses.push({ x, z, yaw, base: isl.y, mx, mz, my: isl.y, sky: true, r: rand(), d: hyp(mx - POST.x, mz - POST.z) });
    solid(x, z, yaw, 4.5, 4.5, isl.y - 1, isl.y + 8);
  }
  for (let k = 0; k < 3; k++) { const a = (k * TAU) / 3 + 1, x = isl.x + Math.cos(a) * isl.r * 0.75, z = isl.z + Math.sin(a) * isl.r * 0.75; trees.push({ x, z, y: isl.y, s: 0.7 + rand() * 0.4 }); }
}
// the plaza's buildings
solid(POST.x, POST.z, 0, 9, 5, -1, 8); solid(SHOP_B.x, SHOP_B.z, 0, 6, 4, -1, 9); solid(POUND.x, POUND.z + 3, 0, 8, 4, -1, 7);
// trees on open ground
for (let n = 0; n < 1400 && trees.length < 340; n++) {
  const a = rand() * TAU, r = Math.sqrt(rand()) * R_TOWN, x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (!inside(x, z, 5) || r < PLAZA + 4 || roadDist(x, z) < 7.5) continue;
  if (houses.some((h) => !h.sky && hyp(h.x - x, h.z - z) < 8.5) || nearPlot(x, z, 3)) continue;
  const y = terrain(x, z); if (Math.abs(terrain(x + 2, z) - y) + Math.abs(terrain(x, z + 2) - y) > 1.6) continue;
  trees.push({ x, z, y, s: 0.8 + rand() * 0.6 });
}
const RIDER_R = 0.7;
export function blocked(x, z, y) {
  for (const b of solids) {
    const dx = x - b.x, dz = z - b.z; if (dx * dx + dz * dz > 120) continue;
    if (y > b.y1 - 0.3 || y < b.y0 - 2) continue;
    if (Math.abs(dx * b.c - dz * b.s) < b.hw + RIDER_R && Math.abs(dx * b.s + dz * b.c) < b.hd + RIDER_R) return true;
  }
  return false;
}

// ---- animal control (owner, 2026-11-08) ----
// A van patrols its road (driving on the right, turning round at a road's end); a helicopter circles over town. Each
// spots players near it carrying parcels (owner, 2026-11-08; vans only those on the ground) and chases one for a short while, faster for a wanted player;
// a van catches you on the ground, a helicopter anywhere. Caught: off to the pound, wanted level cleared. Getting away
// raises your wanted level (up to 5); it drops a star every 25 s nobody's chasing you.
export const WANTED_MAX = 5, WANTED_COOL = 25, IMMUNE = 7;
const VAN = { patrol: 8, chase: 9.5, perStar: 1.3, spot: 16, time: 3, timeStar: 0.8, catch: 2.6 };
const HELI = { patrol: 10, chase: 11, perStar: 1.6, spot: 22, time: 3.5, timeStar: 0.8, catch: 3.4, alt: 26 };
export function makeVehicles() {
  const vs = [];
  const van = (road, s, dir) => vs.push({ kind: 0, road, s, dir, x: 0, y: 0, z: 0, yaw: 0, mode: 0, target: 0, t: 0, cool: 0 });
  van(0, 0, 1); van(0, ROADS[0].len / 2, -1); van(1, 0, 1); van(1, ROADS[1].len / 3, -1); van(1, (ROADS[1].len * 2) / 3, 1);
  van(2, 20, 1); van(4, 60, 1); van(6, 40, -1);
  for (const ph of [0, Math.PI]) vs.push({ kind: 1, ph, x: 0, y: 40, z: 0, yaw: 0, mode: 0, target: 0, t: 0, cool: 0 });
  for (const v of vs) placePatrol(v, 0, true);
  return vs;
}
function placePatrol(v, dt, snap) {
  let tx, tz, ty, yaw;
  if (v.kind === 0) {
    const R = ROADS[v.road]; v.s += v.dir * VAN.patrol * dt;
    if (R.loop) v.s = ((v.s % R.len) + R.len) % R.len; else if (v.s > R.len) { v.s = R.len; v.dir = -1; } else if (v.s < 0) { v.s = 0; v.dir = 1; }
    const p = roadAt(R, v.s), fx = p.fx * v.dir, fz = p.fz * v.dir;
    tx = p.x - fz * 2; tz = p.z + fx * 2; yaw = Math.atan2(fx, fz); ty = terrain(tx, tz);
  } else {
    v.ph += (HELI.patrol / 140) * dt; const r = 140 + 30 * Math.sin(v.ph * 2);
    tx = Math.cos(v.ph) * r; tz = Math.sin(v.ph) * r; yaw = Math.atan2(-Math.sin(v.ph), Math.cos(v.ph)); ty = Math.max(smoothTerrain(tx, tz), 0) + HELI.alt;
  }
  const k = snap ? 1 : Math.min(1, dt * 6);
  v.x += (tx - v.x) * k; v.z += (tz - v.z) * k; v.y += (ty - v.y) * (snap ? 1 : Math.min(1, dt * 2)); v.yaw = turn(v.yaw, yaw, snap ? 1 : Math.min(1, dt * 8));
}
function turn(a, b, k) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * k; }
// players: [{ id, x, y, z, bag (parcels carried), stars, lastChased, lastStar, immuneUntil }] (changed in place); returns
// what happened
export function stepVehicles(vs, players, dt, now) {
  const ev = [];
  for (const p of players) if (p.stars > 0 && now - p.lastChased > WANTED_COOL) { p.stars--; p.lastChased = now; ev.push({ k: "stars", id: p.id, stars: p.stars }); }
  for (const v of vs) {
    const C = v.kind ? HELI : VAN;
    if (v.mode === 1) {
      const p = players.find((q) => q.id === v.target);
      if (!p || p.immuneUntil > now || !insideWorld(p) || !p.bag) { v.mode = 2; v.cool = now + 4; }
      else {
        v.t -= dt; p.lastChased = now;
        const dx = p.x - v.x, dz = p.z - v.z, d = hyp(dx, dz), sp = C.chase + C.perStar * p.stars;
        if (d > 0.01) { const m = Math.min(d, sp * dt); v.x += (dx / d) * m; v.z += (dz / d) * m; v.yaw = turn(v.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10)); }
        if (v.kind === 0) v.y = terrain(v.x, v.z); else v.y += (Math.max(p.y + 2.4, smoothTerrain(v.x, v.z) + 3) - v.y) * Math.min(1, dt * 2.5);
        const got = v.kind === 0 ? d < C.catch && p.y - terrain(p.x, p.z) < 3 : hyp(d, v.y - (p.y + 1.5)) < C.catch;
        if (got) {
          ev.push({ k: "caught", id: p.id }); p.stars = 0; p.immuneUntil = now + IMMUNE;
          for (const o of vs) if (o.mode === 1 && o.target === p.id) { o.mode = 2; o.cool = now + 5; }
        } else if (v.t <= 0) {
          v.mode = 2; v.cool = now + 6;
          if (now - p.lastStar > 4 && p.stars < WANTED_MAX) { p.stars++; p.lastStar = now; ev.push({ k: "escaped", id: p.id, stars: p.stars }); }
        }
      }
      if (v.mode === 2 && v.kind === 0) v.rs = nearestS(ROADS[v.road], v.x, v.z);
      continue;
    }
    if (v.mode === 2) {   // back to its road (or up to its circuit)
      let tx, tz;
      if (v.kind === 0) { const p = roadAt(ROADS[v.road], v.rs), fx = p.fx * v.dir, fz = p.fz * v.dir; tx = p.x - fz * 2; tz = p.z + fx * 2; }
      else { const r = 140 + 30 * Math.sin(v.ph * 2); tx = Math.cos(v.ph) * r; tz = Math.sin(v.ph) * r; }
      const dx = tx - v.x, dz = tz - v.z, d = hyp(dx, dz), m = Math.min(d, C.patrol * 1.4 * dt);
      if (d > 0.01) { v.x += (dx / d) * m; v.z += (dz / d) * m; v.yaw = turn(v.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8)); }
      v.y = v.kind === 0 ? terrain(v.x, v.z) : v.y + (Math.max(smoothTerrain(v.x, v.z), 0) + HELI.alt - v.y) * Math.min(1, dt * 1.5);
      if (d < 1) { v.mode = 0; if (v.kind === 0) v.s = v.rs; }
    } else placePatrol(v, dt, false);
    if (v.mode === 0 && now > v.cool) {   // look around
      let best = null, bd = 1e9;
      for (const p of players) {
        if (p.immuneUntil > now || !insideWorld(p) || !p.bag) continue;
        if (v.kind === 0 && p.y - terrain(p.x, p.z) > 6) continue;
        const d = v.kind ? hyp(p.x - v.x, p.z - v.z, (p.y - v.y) * 0.5) : hyp(p.x - v.x, p.z - v.z);
        if (d < C.spot + 7 * p.stars && d < bd) { bd = d; best = p; }
      }
      if (best) { v.mode = 1; v.target = best.id; v.t = C.time + C.timeStar * best.stars; ev.push({ k: "chase", id: best.id }); }
    }
  }
  return ev;
}
const insideWorld = (p) => hyp(p.x, p.z) < 360;
function nearestS(R, x, z) { let best = 0, bd = 1e9; for (let i = 0; i < R.pts.length; i++) { const d = hyp(R.pts[i][0] - x, R.pts[i][1] - z); if (d < bd) { bd = d; best = R.S[i]; } } return best; }

// ---- a player's data (owner, 2026-11-08: saved on the server) and house rules, the same on both sides ----
// data: { coins, pets: [{ id, sp, lv }], ride, items: { snack, ribbon, ticket }, treats: { sp: n }, delivered, nextId,
//   shirt, home: { pieces: [...] } }
// (owner, 2026-11-08: houses on plots, built however you like) a house is a list of pieces on a 5 x 5 grid of 4 m
// squares, up to 3 floors (levels) of 4.5 m:
//   cell pieces { k: floor | roof | slope | stairs, x, z (square 0-4), l (level 0-2), r (quarter turns), c (colour) }
//   edge pieces { k: wall | window | door, x, z, l, s (side of the square: 0 west, 1 east, 2 south, 3 north), c }
//   furniture   { k: bed | pen | chair | shelf | table | cabinet | plant | rug | poster, x, z (metres 0-20, half-metre
//                 steps), l, r, c, pet? (a pen's pet), since? }
export const PIECES = {
  floor: { p: 20, t: "cell" }, roof: { p: 25, t: "cell" }, slope: { p: 35, t: "cell" }, stairs: { p: 80, t: "cell" },
  wall: { p: 30, t: "edge" }, window: { p: 50, t: "edge" }, door: { p: 60, t: "edge" },
  bed: { p: 400, t: "free" }, pen: { p: 800, t: "free" }, chair: { p: 60, t: "free" }, shelf: { p: 90, t: "free" }, table: { p: 100, t: "free" },
  cabinet: { p: 120, t: "free" }, plant: { p: 40, t: "free" }, rug: { p: 50, t: "free" }, poster: { p: 30, t: "free" },
};
export const COLORS = ["#f4ead8", "#ffffff", "#f7cfd8", "#cfe6f7", "#d8f0c8", "#fbe7a8", "#e3d4f5", "#c8553d", "#3b6ea8", "#5a8f3e", "#8a5a3a", "#3d4650"];
export const MAX_PIECES = 300;
export const HOME = { baseCap: 6, perBed: 2, price: 2500, skyPrice: 5000, room: 1500, bed: 400, pen: 800, window: 200 };   // (the last four: what homes before plots cost, refunded)
export const petCap = (d) => HOME.baseCap + HOME.perBed * (d.home ? d.home.pieces.filter((t) => t.k === "bed").length : 0);
export const penPets = (d) => new Set(d.home ? d.home.pieces.filter((t) => t.k === "pen" && t.pet).map((t) => t.pet) : []);
// coins a minute a pet earns in a playpen: by rarity, more with level; it banks up to 8 hours
export const PEN_RATE = [2, 3.5, 5.5, 8], PEN_MAX_H = 8;
// a house to start with: a 3 x 3 room with a door, two windows and a roof
export function starterHouse() {
  const ps = [];
  for (let x = 1; x <= 3; x++) for (let z = 1; z <= 3; z++) { ps.push({ k: "floor", x, z, l: 0, r: 0, c: 10 }); ps.push({ k: "roof", x, z, l: 0, r: 0, c: 7 }); }
  for (let i = 1; i <= 3; i++) {
    ps.push({ k: i === 2 ? "door" : "wall", x: i, z: 1, l: 0, s: 2, c: 0 }); ps.push({ k: i === 2 ? "window" : "wall", x: i, z: 3, l: 0, s: 3, c: 0 });
    ps.push({ k: i === 2 ? "window" : "wall", x: 1, z: i, l: 0, s: 0, c: 0 }); ps.push({ k: "wall", x: 3, z: i, l: 0, s: 1, c: 0 });
  }
  return ps;
}
const int = (v, lo, hi, d = lo) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.floor(+v))) : d);
export function cleanData(d, species) {
  d = d && typeof d === "object" ? d : {};
  const pets = (Array.isArray(d.pets) ? d.pets : []).filter((p) => p && species.has(p.sp)).slice(0, 400).map((p) => ({ id: int(p.id, 1, 1e9), sp: p.sp, lv: int(p.lv, 1, 20, 1) }));
  const ids = new Set(); const uniq = pets.filter((p) => !ids.has(p.id) && ids.add(p.id));
  if (!uniq.length) uniq.push({ id: 1, sp: "pup", lv: 1 });
  const items = d.items || {}, treats = {};
  for (const [k, v] of Object.entries(d.treats || {})) if (species.has(k)) treats[k] = int(v, 0, 1e6);
  // the house: pieces checked one by one; a home from before plots becomes the starter house (its beds and pens kept
  // inside it, what was paid for the rest given back)
  let pieces = [], refund = 0;
  const H = d.home && typeof d.home === "object" ? d.home : null;
  if (H && !Array.isArray(H.pieces) && Number.isInteger(H.house)) {
    pieces = starterHouse();
    refund += houses[H.house] && houses[H.house].sky ? HOME.skyPrice : HOME.price;
    const n = Array.isArray(H.cells) ? H.cells.length : int(H.rooms, 1, 6, 1); for (let k = 1; k < n; k++) refund += HOME.room * k;
    let spot = 0;
    for (const t of Array.isArray(H.items) ? H.items : []) {
      if (t && t.k === "window") { refund += HOME.window; continue; }
      if (!t || (t.k !== "bed" && t.k !== "pen")) continue;
      const at = [[6, 6], [10, 6], [14, 6], [6, 14], [10, 14], [14, 14], [2, 18], [18, 18], [18, 2], [2, 2]][spot++];
      if (!at) { refund += t.k === "bed" ? HOME.bed : HOME.pen; continue; }
      pieces.push({ k: t.k, x: at[0], z: at[1], l: 0, r: 0, c: 0, pet: t.pet, since: t.since });
    }
  } else if (H && Array.isArray(H.pieces)) pieces = H.pieces;
  else if (!H) pieces = starterHouse();   // everyone starts with a little house
  const out = [], seen = new Set();
  for (const t of pieces) {
    if (!t || !PIECES[t.k] || out.length >= MAX_PIECES) continue;
    const ty = PIECES[t.k].t, l = int(t.l, 0, LEVELS - 1), c = int(t.c, 0, COLORS.length - 1, 0);
    let it;
    if (ty === "cell") it = { k: t.k, x: int(t.x, 0, GRID - 1), z: int(t.z, 0, GRID - 1), l, r: int(t.r, 0, 3), c };
    else if (ty === "edge") it = { k: t.k, x: int(t.x, 0, GRID - 1), z: int(t.z, 0, GRID - 1), l, s: int(t.s, 0, 3), c };
    else {
      const x = Number.isFinite(+t.x) ? Math.round(Math.max(0, Math.min(PLOT, +t.x)) * 2) / 2 : 10, z = Number.isFinite(+t.z) ? Math.round(Math.max(0, Math.min(PLOT, +t.z)) * 2) / 2 : 10;
      it = { k: t.k, x, z, l, r: int(t.r, 0, 3), c };
      if (t.k === "pen" && t.pet && ids.has(t.pet)) { it.pet = t.pet; it.since = Number.isFinite(+t.since) ? +t.since : Date.now(); }
    }
    if (ty !== "free") {   // one of each structural piece per place (an edge belongs to the squares either side of it)
      let key = it.k === "floor" || it.k === "roof" || it.k === "slope" ? "c" + it.x + "," + it.z + "," + it.l + (it.k === "floor" ? "f" : "r") : ty === "cell" ? "s" + it.x + "," + it.z + "," + it.l : null;
      if (ty === "edge") { const [dx, dz] = [[-1, 0], [1, 0], [0, -1], [0, 1]][it.s], ex = it.x * 2 + 1 + dx, ez = it.z * 2 + 1 + dz; key = "e" + ex + "," + ez + "," + it.l; }
      if (seen.has(key)) continue; seen.add(key);
    }
    out.push(it);
  }
  const home = { pieces: out };
  const nextId = Math.max(int(d.nextId, 1, 1e9, 1), ...uniq.map((p) => p.id + 1));
  return {
    coins: Math.max(0, Math.min(1e9, (Number.isFinite(+d.coins) ? +d.coins : 0) + refund)), pets: uniq, ride: uniq.some((p) => p.id === d.ride) ? d.ride : uniq[0].id,
    items: { snack: int(items.snack, 0, 1e6), ribbon: int(items.ribbon, 0, 1e6), ticket: int(items.ticket, 0, 1e6) }, treats,
    delivered: int(d.delivered, 0, 1e9), nextId, shirt: /^#[0-9a-f]{6}$/i.test(d.shirt) ? d.shirt : "#3a8ee6", home,
  };
}
