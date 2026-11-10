// Pet Delivery Co.: the world, shared by the page (website/pets-world.js) and the server
// (packages/server/src/pets-world.js). The two copies must stay identical (scripts/check.sh compares them).
// (owner, 2026-11-08; rebuilt flat on a grid 2026-11-09) The town is a flat, square floating island: straight streets in a
// grid, houses along them, the round town square in the middle, a deep lake on the west side; islands float round it.
// Animal control vans patrol the roads and chase whoever they spot for a short while, and a player who keeps getting away gets a wanted level that makes them
// easier to spot and chased harder; helicopters circle the sky sweeping searchlights that catch whoever they light.

export const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), hyp = Math.hypot, smooth = (t) => t * t * (3 - 2 * t);
export const DAY_S = 1200;
export function daylightAt(t) {
  const el = Math.sin(((t % DAY_S) / DAY_S) * TAU) + 0.2;
  return smooth(clamp((el + 0.08) / 0.35, 0, 1));
}
export const isDaylight = (t) => daylightAt(t) >= 0.5;

// ---- noise ----
function hash(ix, iz) { let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
function fbm(x, z) { let s = 0, amp = 0.5, f = 1; for (let o = 0; o < 4; o++) { s += noise(x * f, z * f) * amp; amp *= 0.5; f *= 2; } return s / 0.9375; }
export function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// ---- the island (owner, 2026-11-09: flat, symmetric, on a grid): a flat square of land 448 m across ----
export const R_TOWN = 224;
export const edgeR = (a) => R_TOWN / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
export const inside = (x, z, margin = 0) => Math.max(Math.abs(x), Math.abs(z)) < R_TOWN - margin;

// ---- the town square (owner, 2026-11-09): a round paved square in the middle with the Contract Board at its center,
// and the main buildings evenly round it (90° apart since the mount shop closed), each facing the middle with its ring
// in front. yaw turns a building's front (+z) toward the middle ----
export const PLAZA = 60;
const around = (deg, r) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return { x: Math.round(c * r * 100) / 100, z: Math.round(s * r * 100) / 100, yaw: Math.atan2(-c, -s) }; };
export const BOARD = { x: 0, z: 0, r: 3 }, SPAWN = { x: 0, z: -12 };
export const POST = around(-90, 44), PICKUP = { ...around(-90, 30), r: 4 };
export const SHOP_B = around(0, 44), SHOP = { ...around(0, 31), r: 5 };
export const TRAIN = { ...around(180, 40), r: 9 };
export const POUND = around(90, 44), POUND_B = around(90, 47), RELEASE = around(90, 33);

// ---- streets (owner, 2026-11-09): a grid of straight streets edge to edge, two each way on either side of the square,
// making city blocks ----
export const STREETS = [-140, -64, 64, 140];
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
const STREET_END = R_TOWN - 2;
export const ROADS = [...STREETS.map((c) => sampleRoad([[c, -STREET_END], [c, STREET_END]], false)), ...STREETS.map((c) => sampleRoad([[-STREET_END, c], [STREET_END, c]], false))];
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

// ---- the height grid (2 m): flat land at 0 everywhere, lower only under the water ----
const G = 2, GN = 320, G0 = -320;
const HGT = new Float32Array(GN * GN), DIST = new Float32Array(GN * GN).fill(99);
for (const R of ROADS) for (let k = 0; k < R.pts.length; k++) {
  const [x, z] = R.pts[k], ci = Math.round((x - G0) / G), cj = Math.round((z - G0) / G);
  for (let j = cj - 7; j <= cj + 7; j++) for (let i = ci - 7; i <= ci + 7; i++) { if (i < 0 || j < 0 || i >= GN || j >= GN) continue; const d = hyp(G0 + i * G - x, G0 + j * G - z); if (d < DIST[j * GN + i]) DIST[j * GN + i] = d; }
}
function sample(A, x, z) {
  const fx = clamp((x - G0) / G, 0, GN - 1.001), fz = clamp((z - G0) / G, 0, GN - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * GN + i;
  return A[k] * (1 - u) * (1 - v) + A[k + 1] * u * (1 - v) + A[k + GN] * (1 - u) * v + A[k + GN + 1] * u * v;
}
export const terrain = (x, z) => sample(HGT, x, z);
export const smoothTerrain = (x, z) => Math.max(0, sample(HGT, x, z));
export const roadDist = (x, z) => sample(DIST, x, z);

export const houses = [], solids = [], trees = [];
// solids: { x, z, c, s (cos / sin of its turn), hw, hd (half sizes), y0, y1 }
const solid = (x, z, yaw, hw, hd, y0, y1) => solids.push({ x, z, c: Math.cos(yaw), s: Math.sin(yaw), hw, hd, y0, y1 });
const rand = rng(20261108);
// ---- housing plots (owner, 2026-11-08; placed on the grid 2026-11-09): 20 x 20 m (5 x 5 squares of 4 m) where
// players build their own houses, seen by everyone, each in the middle of a city block: 3 in blocks diagonal to the
// square (first come, first served), 5 around town (given out at random: the fourth diagonal block and the four corner
// blocks), 2 on an island above the square (VIP), and 6 on an island off the edge that appears when a room has more
// than 10 players ----
export const PLOT = 20, CELL = 4, GRID = 5, LEVELS = 3, LEVEL_H = 5.5;   // (owner, 2026-11-09) taller walls, so the camera fits
export const PLOTS = [];
{
  const D = 102, C = 182;   // the middles of the diagonal blocks and the corner blocks
  for (const [x, z] of [[D, -D], [-D, -D], [D, D]]) PLOTS.push({ x, z, y: 0, kind: "center" });
  PLOTS.push({ x: -12, z: 0, y: 62, kind: "vip" }, { x: 12, z: 0, y: 62, kind: "vip" });
  for (const [x, z] of [[-D, D], [C, -C], [-C, -C], [C, C], [-C, C]]) PLOTS.push({ x, z, y: 0, kind: "random" });
  for (let k = 0; k < 6; k++) PLOTS.push({ x: 400 + ((k % 3) - 1) * 24, z: (Math.floor(k / 3) - 0.5) * 24, y: 8, kind: "extra" });
  PLOTS.forEach((p, i) => (p.id = i));
}
export const VIP_ISLAND = { x: 0, z: 0, y: 62, r: 30 }, EXTRA_ISLAND = { x: 400, z: 0, y: 8, r: 48 };
export const plotAt = (x, z) => PLOTS.find((p) => Math.abs(x - p.x) < PLOT / 2 && Math.abs(z - p.z) < PLOT / 2) || null;
const nearPlot = (x, z, m) => PLOTS.some((p) => Math.abs(p.x - x) < PLOT / 2 + m && Math.abs(p.z - z) < PLOT / 2 + m);
// ---- water (owner, 2026-11-09: one big lake on one side): a deep, square-edged lake in the middle block of the west
// side, and a river from it running straight off the island's edge in a waterfall. WAT holds the water's surface on
// the height grid (also a little past the shore, so it reads smoothly); water is wherever the land is under it.
// Swimmers swim (and dive) in it; everyone else can't wade in from the shore ----
const WAT = new Float32Array(GN * GN).fill(-1e9), WETN = new Uint8Array(GN * GN);   // WETN: in the water itself
export const LAKE = { x: -172, z: 0, hw: 24, hd: 52, r: 24, y: -0.4, deep: 8 };
// each: the path (downstream), its half width and depth; outflows end past the edge
export const RIVERS = [{ pts: [[-190, 0], [-205, 0], [-220, 0], [-236, 0]], hw: 5, deep: 3, fall: true }].map((R) => Object.assign(R, sampleRoad(R.pts, false), { y: null }));
for (const R of RIVERS) R.y = R.pts.map(() => LAKE.y);
const sdRect = (x, z, cx, cz, hw, hd) => { const dx = Math.abs(x - cx) - hw, dz = Math.abs(z - cz) - hd; return dx < 0 && dz < 0 ? Math.max(dx, dz) : hyp(Math.max(dx, 0), Math.max(dz, 0)); };
for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
  const x = G0 + i * G, z = G0 + j * G, k = j * GN + i;
  const dl = sdRect(x, z, LAKE.x, LAKE.z, LAKE.hw, LAKE.hd), R = RIVERS[0], dr = sdRect(x, z, (R.pts[0][0] + R.pts[R.pts.length - 1][0]) / 2, 0, Math.abs(R.pts[R.pts.length - 1][0] - R.pts[0][0]) / 2, R.hw);
  if (dl < 0) { HGT[k] = LAKE.y - LAKE.deep; WETN[k] = 1; }
  else if (dr < 0) { HGT[k] = Math.min(HGT[k], LAKE.y - R.deep); WETN[k] = 1; }
  if (Math.min(dl, dr) < 3) WAT[k] = LAKE.y;
}
// the water's surface here, or -Infinity on dry land
export function waterAt(x, z) {
  const fx = (x - G0) / G, fz = (z - G0) / G; if (fx < 0 || fz < 0 || fx >= GN - 1 || fz >= GN - 1) return -Infinity;
  const i = Math.floor(fx), j = Math.floor(fz), k = j * GN + i;
  if (WAT[k] < -1e8 || WAT[k + 1] < -1e8 || WAT[k + GN] < -1e8 || WAT[k + GN + 1] < -1e8) return -Infinity;
  if (!(WETN[k] | WETN[k + 1] | WETN[k + GN] | WETN[k + GN + 1])) return -Infinity;
  const y = sample(WAT, x, z); return terrain(x, z) < y - 0.05 ? y : -Infinity;
}
// the water grid, for drawing it: [x0, step, n, surface heights (-1e9 where there's none)]
export const waterGrid = () => ({ x0: G0, step: G, n: GN, w: WAT, wet: WETN });
const nearWater = (x, z, m) => { for (const [a, b] of [[0, 0], [-m, 0], [m, 0], [0, -m], [0, m], [-m, -m], [m, m], [-m, m], [m, -m]]) if (waterAt(x + a, z + b) > -Infinity) return true; return false; };
// ---- houses (owner, 2026-11-09: on the grid): along both sides of every street, facing it, evenly spaced in each
// stretch between cross streets (clear of the corners), each with a mailbox at the roadside; none in the square or by
// the water ----
{
  const cuts = [-R_TOWN, ...STREETS, R_TOWN];
  for (const [ri, R] of ROADS.entries()) {
    const c = STREETS[ri % 4], alongZ = ri < 4;
    for (let q = 0; q < cuts.length - 1; q++) {
      const a = cuts[q], b = cuts[q + 1], lo = a + (q === 0 ? 14 : 19.5), hi = b - (q === cuts.length - 2 ? 14 : 19.5), n = Math.floor((hi - lo) / 13) + 1, mid = (lo + hi) / 2;
      for (let m = 0; m < n; m++) {
        const u = mid + (m - (n - 1) / 2) * 13;
        for (const side of [-1, 1]) {
          const x = alongZ ? c + side * 13.5 : u, z = alongZ ? u : c + side * 13.5, rx = alongZ ? side : 0, rz = alongZ ? 0 : side;
          if (!inside(x, z, 9) || (Math.abs(x) < PLAZA + 4 && Math.abs(z) < PLAZA + 4) || nearPlot(x, z, 3)) continue;
          const mx = x - rx * 7.5, mz = z - rz * 7.5;
          if (nearWater(x, z, 9) || nearWater(mx, mz, 3)) continue;
          houses.push({ x, z, yaw: Math.atan2(-rx, -rz), base: 0, mx, mz, my: 0, sky: false, r: rand() });
        }
      }
    }
  }
}
for (const h of houses) { h.d = hyp(h.mx - POST.x, h.mz - POST.z); solid(h.x, h.z, h.yaw, 4.5, 4.5, h.base - 4, h.base + 4.4); }   // up to the eaves: the roof above is walked on (owner, 2026-11-09)
// the floating islands (owner, 2026-11-09: a symmetric ring): eight off the edge (one off each side, one off each
// corner), low enough to glide down to, eight in a ring high above the town and one over the middle that only
// flapping fliers reach
const OFF = [[0, 290, 6, 16], [90, 290, 6, 16], [180, 290, 6, 16], [270, 290, 6, 16], [45, 400, 14, 14], [135, 400, 14, 14], [225, 400, 14, 14], [315, 400, 14, 14]];
export const ISLANDS = [
  ...OFF.map(([d, r, y, rr]) => ({ x: Math.round(Math.cos((d * Math.PI) / 180) * r), z: Math.round(Math.sin((d * Math.PI) / 180) * r), y, r: rr })),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const a = ((22.5 + 45 * k) * Math.PI) / 180; return { x: Math.round(Math.cos(a) * 125), z: Math.round(Math.sin(a) * 125), y: 90 + (k % 2) * 16, r: 13, high: true }; }),
  { x: 0, z: 0, y: 124, r: 11, high: true },
];
export const islandAt = (x, z) => ISLANDS.find((i) => hyp(x - i.x, z - i.z) < i.r - 0.6) || [VIP_ISLAND, EXTRA_ISLAND].find((i) => hyp(x - i.x, z - i.z) < i.r - 0.6) || null;
for (const isl of ISLANDS) {
  const out = isl.x || isl.z ? Math.atan2(isl.z, isl.x) : 0;
  for (let k = 0; k < 3; k++) {
    const a = (k * TAU) / 3 + out, hr = isl.r * 0.36, x = isl.x + Math.cos(a) * hr, z = isl.z + Math.sin(a) * hr;
    const mr = Math.min(isl.r - 1.5, hr + 6.5), mx = isl.x + Math.cos(a) * mr, mz = isl.z + Math.sin(a) * mr, yaw = Math.atan2(Math.cos(a), Math.sin(a));
    houses.push({ x, z, yaw, base: isl.y, mx, mz, my: isl.y, sky: true, r: rand(), d: hyp(mx - POST.x, mz - POST.z) });
    solid(x, z, yaw, 4.5, 4.5, isl.y - 1, isl.y + 4.4);
  }
  for (let k = 0; k < 3; k++) { const a = (k * TAU) / 3 + out + Math.PI / 3, x = isl.x + Math.cos(a) * isl.r * 0.75, z = isl.z + Math.sin(a) * isl.r * 0.75; trees.push({ x, z, y: isl.y, s: 0.7 + rand() * 0.4 }); }
}
// the square's buildings
solid(POST.x, POST.z, POST.yaw, 9, 5, -1, 8); solid(SHOP_B.x, SHOP_B.z, SHOP_B.yaw, 6, 4, -1, 9); solid(POUND_B.x, POUND_B.z, POUND_B.yaw, 8, 4, -1, 7);
// trees on open ground, on an 8 m grid, the same on both sides of the town (mirrored)
for (let i = 0; i < 56; i++) for (let j = 0; j < 56; j++) {
  const x = -220 + i * 8, z = -220 + j * 8;
  if (hash(Math.abs(x) + 7, Math.abs(z) + 13) > 0.3 || !inside(x, z, 5) || hyp(x, z) < PLAZA + 3 || roadDist(x, z) < 7.5 || nearWater(x, z, 3)) continue;
  if (houses.some((h) => !h.sky && Math.abs(h.x - x) < 8.5 && Math.abs(h.z - z) < 8.5) || nearPlot(x, z, 3)) continue;
  trees.push({ x, z, y: 0, s: 0.8 + hash(Math.abs(z), Math.abs(x)) * 0.6 });
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
// A van patrols its road (driving on the right, turning round at a road's end). It spots players near it carrying
// parcels (owner, 2026-11-08; only those on the ground) and chases one for a short while, faster for a wanted player, and
// catches you if it touches you. A helicopter circles over town sweeping a searchlight (owner, 2026-11-09): the light
// turns slowly, now one way, now the other, its spot moving in and out over the ground, and a parcel carrier who stays
// in the light for half a second is caught (wherever they are, in the air too). Caught: off to the pound, wanted level
// cleared. Getting away from a van raises your wanted level (up to 5); it drops a star every 25 s nobody's after you.
export const WANTED_MAX = 5, WANTED_COOL = 25, IMMUNE = 7;
const VAN = { patrol: 8, chase: 9.5, perStar: 1.3, spot: 16, front: 5, side: 2, rear: 2, time: 3, timeStar: 0.8, catch: 2.6 };
const VAN_SPEEDS = [0.85, 1, 1.15];   // compact / van / SUV: deliberately slower, standard and faster patrol cars
const HELI = { patrol: 11.5, alt: 26 };
// the searchlight: cone half-angle (rad), turning speed (rad/s, a random 60-140% of it, flipping every 3-8 s), how far
// out the spot goes (m, sideways from under the helicopter), seconds in the light before you're caught
export const BEAM = { half: 0.14, flyHalf: 0.2, turn: 0.45, near: 6, far: 24, hold: 0.5 };
export function makeVehicles() {
  const vs = [];
  const van = (road, s, dir, style) => vs.push({ kind: 0, road, s, dir, style, speed: VAN_SPEEDS[style], x: 0, y: 0, z: 0, yaw: 0, mode: 0, target: 0, t: 0, cool: 0 });
  van(0, 0, 1, 1); van(0, ROADS[0].len / 2, -1, 0); van(1, 0, 1, 2); van(1, ROADS[1].len / 3, -1, 1); van(1, (ROADS[1].len * 2) / 3, 1, 0);
  van(2, 20, 1, 2); van(4, 60, 1, 1); van(6, 40, -1, 2);
  for (const ph of [0, Math.PI]) vs.push({ kind: 1, ph, x: 0, y: 40, z: 0, yaw: 0, mode: 0, target: 0, t: 0, cool: 0, ba: ph, bd: 15, bw: 0, bt: 0, bn: 0, bp: ph });
  for (const v of vs) placePatrol(v, 0, true);
  return vs;
}
function placePatrol(v, dt, snap) {
  let tx, tz, ty, yaw;
  if (v.kind === 0) {
    const R = ROADS[v.road]; v.s += v.dir * VAN.patrol * v.speed * dt;
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
// a helicopter's searchlight from its state { x, y, z, yaw, ba (the light's heading), bd (how far out its spot is) }: the
// lamp under the nose and the unit direction it shines (down to the ground at the spot); the page draws the same beam
export function beamOf(v, out = {}) {
  const lx = v.x + Math.sin(v.yaw) * 1.6, ly = v.y - 1.3, lz = v.z + Math.cos(v.yaw) * 1.6;
  const ax = v.x + Math.sin(v.ba) * v.bd, az = v.z + Math.cos(v.ba) * v.bd, dx = ax - lx, dy = terrain(ax, az) - ly, dz = az - lz, d = hyp(dx, dy, dz) || 1;
  out.lx = lx; out.ly = ly; out.lz = lz; out.dx = dx / d; out.dy = dy / d; out.dz = dz / d; return out;
}
const beamTmp = {};
export function beamHits(b, p) {   // is the player (a 1.6 m ball around their middle) in this light?
  const wx = p.x - b.lx, wy = p.y + 1 - b.ly, wz = p.z - b.lz, along = wx * b.dx + wy * b.dy + wz * b.dz;
  if (along <= 0) return false;
  const off = hyp(wx - b.dx * along, wy - b.dy * along, wz - b.dz * along);
  return off < along * Math.tan(p.airMount ? BEAM.flyHalf : BEAM.half) + 0.8;
}
function stepHeli(v, dt, now) {
  placePatrol(v, dt, false);
  if (!(v.bn > now)) { v.bt = (Math.random() < 0.5 ? -1 : 1) * BEAM.turn * (0.6 + Math.random() * 0.8); v.bn = now + 3 + Math.random() * 5; }
  v.bw += (v.bt - v.bw) * Math.min(1, dt * 0.7);   // eases round to its new way rather than snapping
  v.ba += v.bw * dt; if (v.ba > Math.PI) v.ba -= TAU; else if (v.ba < -Math.PI) v.ba += TAU;
  v.bp += dt * (0.2 + 0.1 * Math.sin(v.ba * 2)); v.bd = (BEAM.near + BEAM.far) / 2 + ((BEAM.far - BEAM.near) / 2) * Math.sin(v.bp);
}
function catchPlayer(p, vs, now, ev) {
  ev.push({ k: "caught", id: p.id }); p.stars = 0; p.immuneUntil = now + IMMUNE; p.litT = 0;
  for (const o of vs) if (o.kind === 0 && o.mode === 1 && o.target === p.id) { o.mode = 2; o.cool = now + 5; }
}
// players: [{ id, x, y, z, bag (parcels carried), stars, lastChased, lastStar, immuneUntil }] (changed in place); returns
// what happened
export function stepVehicles(vs, players, dt, now, daylightOverride) {
  const ev = [];
  for (const p of players) if (p.stars > 0 && now - p.lastChased > WANTED_COOL) { p.stars--; p.lastChased = now; ev.push({ k: "stars", id: p.id, stars: p.stars }); }
  // The helicopters keep circling by day, but their searchlights only work once daylight has faded.
  const daylight = daylightOverride === undefined ? isDaylight(now) : !!daylightOverride;
  const inLight = new Set();
  for (const v of vs) {
    if (v.kind !== 1) continue;
    stepHeli(v, dt, now); v.mode = 0;
    if (daylight) continue;
    beamOf(v, beamTmp);
    for (const p of players) {
      if (p.immuneUntil > now || !insideWorld(p) || !p.bag || !beamHits(beamTmp, p)) continue;
      inLight.add(p); v.mode = 1; v.target = p.id;
    }
  }
  for (const p of players) {
    if (!inLight.has(p)) { p.litT = 0; continue; }
    if (!p.litT) ev.push({ k: "chase", id: p.id });
    p.litT = (p.litT || 0) + dt; p.lastChased = now;
    if (p.litT >= BEAM.hold) catchPlayer(p, vs, now, ev);
  }
  for (const v of vs) {
    if (v.kind !== 0) continue;
    const C = VAN;
    if (v.mode === 1) {
      const p = players.find((q) => q.id === v.target);
      if (!p || p.immuneUntil > now || !insideWorld(p) || !p.bag) { v.mode = 2; v.cool = now + 4; }
      else {
        v.t -= dt; p.lastChased = now;
        const dx = p.x - v.x, dz = p.z - v.z, d = hyp(dx, dz), sp = (C.chase + C.perStar * p.stars) * v.speed;
        if (d > 0.01) { const m = Math.min(d, sp * dt); v.x += (dx / d) * m; v.z += (dz / d) * m; v.yaw = turn(v.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10)); }
        v.y = terrain(v.x, v.z);
        if (d < C.catch && p.y - terrain(p.x, p.z) < 3) catchPlayer(p, vs, now, ev);
        else if (v.t <= 0) {
          v.mode = 2; v.cool = now + 6;
          if (now - p.lastStar > 4 && p.stars < WANTED_MAX) { p.stars++; p.lastStar = now; ev.push({ k: "escaped", id: p.id, stars: p.stars }); }
        }
      }
      if (v.mode === 2) v.rs = nearestS(ROADS[v.road], v.x, v.z);
      continue;
    }
    if (v.mode === 2) {   // back to its road
      const p = roadAt(ROADS[v.road], v.rs), fx = p.fx * v.dir, fz = p.fz * v.dir, tx = p.x - fz * 2, tz = p.z + fx * 2;
      const dx = tx - v.x, dz = tz - v.z, d = hyp(dx, dz), m = Math.min(d, C.patrol * v.speed * 1.4 * dt);
      if (d > 0.01) { v.x += (dx / d) * m; v.z += (dz / d) * m; v.yaw = turn(v.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8)); }
      v.y = terrain(v.x, v.z);
      if (d < 1) { v.mode = 0; v.s = v.rs; }
    } else placePatrol(v, dt, false);
    if (v.mode === 0 && now > v.cool) {   // look around
      let best = null, bd = 1e9;
      for (const p of players) {
        if (p.immuneUntil > now || !insideWorld(p) || !p.bag) continue;
        if (p.y - terrain(p.x, p.z) > 6) continue;
        const dx = p.x - v.x, dz = p.z - v.z, d = hyp(dx, dz);
        if (d < 0.01) { best = p; bd = 0; continue; }
        const forward = (dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw)) / d;
        const sideways = Math.abs(dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw)) / d;
        const sight = vanSight(forward, sideways, p.stars);
        if (d < sight && d < bd) { bd = d; best = p; }
      }
      if (best) { v.mode = 1; v.target = best.id; v.t = C.time + C.timeStar * best.stars; ev.push({ k: "chase", id: best.id }); }
    }
  }
  return ev;
}
const insideWorld = (p) => hyp(p.x, p.z) < 360;
// how far a van sees a courier: farther ahead, a little to the sides, less behind, and 7 m more per wanted star
// (forward / sideways: the unit direction to them along and across the van's heading)
export const vanSight = (forward, sideways, stars) => VAN.spot + Math.max(0, forward) * VAN.front + sideways * VAN.side - Math.max(0, -forward) * VAN.rear + 7 * (stars || 0);
function nearestS(R, x, z) { let best = 0, bd = 1e9; for (let i = 0; i < R.pts.length; i++) { const d = hyp(R.pts[i][0] - x, R.pts[i][1] - z); if (d < bd) { bd = d; best = R.S[i]; } } return best; }

// ---- a player's data (owner, 2026-11-08: saved on the server) and house rules, the same on both sides ----
// data: { coins, pets: [{ id, sp, lv }], ride, items: { snack, ribbon, ticket }, treats: { sp: n }, delivered, nextId,
//   shirt, settings: { followArrowWhenEmpty }, home: { pieces: [...] } }
// (owner, 2026-11-09: houses rebuilt) outside, every lot has one of 5 ready-made houses (ext); its front door leads
// inside, to the house's own space (a 20 x 20 m floor with a black void around it), built freely: pieces anywhere,
// at any angle, up to 3 floors (levels) of 5.5 m. The floor and the front door (in the middle of the front edge, z 0)
// are always there and aren't pieces.
//   { k, x, z (metres 0-20), l (level 0-2), a (degrees 0-359), c (colour), w? (a window's view 0-5), pet?, since? }
//   floor | roof | slope | stairs: a 4 x 4 m tile; wall | window | door: 4 m long; the rest furniture
// (Houses from before, on a 5 x 5 grid of 4 m squares, are moved over as they were: home.v 2 marks the new kind.)
export const EXTERIORS = ["Cottage", "Cabin", "Modern", "Barn", "Tower"];
export const VIEWS = ["Meadow", "Beach", "Mountains", "Night sky", "Forest", "City"];
export const HOME_SIZE = 20, FRONT_DOOR = { x: 10, z: 0 };
export const PIECES = {
  floor: { p: 20, t: "tile" }, roof: { p: 25, t: "tile" }, slope: { p: 35, t: "tile" }, stairs: { p: 80, t: "tile" },
  wall: { p: 30, t: "wall" }, window: { p: 50, t: "wall" }, door: { p: 60, t: "wall" },
  bed: { p: 400, t: "free" }, pen: { p: 800, t: "free" }, chair: { p: 60, t: "free" }, shelf: { p: 90, t: "free" }, table: { p: 100, t: "free" },
  cabinet: { p: 120, t: "free" }, plant: { p: 40, t: "free" }, rug: { p: 50, t: "free" }, poster: { p: 30, t: "free" },
};
export const COLORS = ["#f4ead8", "#ffffff", "#f7cfd8", "#cfe6f7", "#d8f0c8", "#fbe7a8", "#e3d4f5", "#c8553d", "#3b6ea8", "#5a8f3e", "#8a5a3a", "#3d4650"];
export const MAX_PIECES = 300;
export const HOME = { baseCap: 6, perBed: 2, price: 2500, skyPrice: 5000, room: 1500, bed: 400, pen: 800, window: 200 };   // (the last four: what homes before plots cost, refunded)
export const petCap = (d) => HOME.baseCap + HOME.perBed * (d.home ? d.home.pieces.filter((t) => t.k === "bed").length : 0);
export const penPets = (d) => new Set(d.home ? d.home.pieces.filter((t) => t.k === "pen" && t.pet).map((t) => t.pet) : []);
// coins a minute a pet earns in a playpen: by rarity, more with level; it banks up to 8 hours
export const PEN_RATE = [2, 4, 8], PEN_MAX_H = 8;   // coins a minute in a pen, by rarity (Common, Rare, Legendary)
// a house to start with: a 12 x 12 m room round the front door, two windows, a roof
export function starterHouse() {
  const ps = [];
  for (const x of [6, 10, 14]) for (const z of [2, 6, 10]) ps.push({ k: "roof", x, z, l: 0, a: 0, c: 7 });
  ps.push({ k: "wall", x: 6, z: 0, l: 0, a: 0, c: 0 }, { k: "wall", x: 14, z: 0, l: 0, a: 0, c: 0 });
  for (const x of [6, 10, 14]) ps.push({ k: x === 10 ? "window" : "wall", x, z: 12, l: 0, a: 0, c: 0, ...(x === 10 ? { w: 0 } : {}) });
  for (const z of [2, 6, 10]) { ps.push({ k: z === 6 ? "window" : "wall", x: 4, z, l: 0, a: 90, c: 0, ...(z === 6 ? { w: 2 } : {}) }); ps.push({ k: "wall", x: 16, z, l: 0, a: 90, c: 0 }); }
  return ps;
}
// a house from the 5 x 5 grid, piece by piece in metres
function fromGrid(t) {
  const ty = PIECES[t.k] && PIECES[t.k].t;
  if (ty === "tile") return { ...t, x: (t.x | 0) * 4 + 2, z: (t.z | 0) * 4 + 2, a: ((t.r | 0) % 4) * 90 };
  if (ty === "wall") { const [dx, dz] = [[-1, 0], [1, 0], [0, -1], [0, 1]][(t.s | 0) % 4]; return { ...t, x: (t.x | 0) * 4 + 2 + dx * 2, z: (t.z | 0) * 4 + 2 + dz * 2, a: dx ? 90 : 0 }; }
  return { ...t, a: ((t.r | 0) % 4) * 90 };
}
// (owner, 2026-11-09: nine pets) the kinds that were retired, and what each became: the new pet of the same type
// (ground, air, water) and rarity (Epic counts as Rare); levels, training and Treats carry over
export const PET_MOVED = { kitten: "pup", bunny: "pup", fox: "raptor", goat: "raptor", stego: "raptor", deer: "raptor", bear: "raptor", horse: "raptor", trike: "raptor", unicorn: "trex",
  butterfly: "owl", pegasus: "dragon", phoenix: "dragon", ptero: "dragon", icedragon: "dragon", otter: "duck", penguin: "duck" };   // (water pets were scrapped too, 2026-11-09: dropped)
const int = (v, lo, hi, d = lo) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.floor(+v))) : d);
export function cleanData(d, species) {
  d = d && typeof d === "object" ? d : {};
  const pets = (Array.isArray(d.pets) ? d.pets : []).map((p) => (p && PET_MOVED[p.sp] ? { ...p, sp: PET_MOVED[p.sp] } : p)).filter((p) => p && species.has(p.sp)).slice(0, 400).map((p) => Object.assign({ id: int(p.id, 1, 1e9), sp: p.sp, lv: int(p.lv, 1, 20, 1) }, int(p.tp, 0, 999, 0) ? { tp: int(p.tp, 0, 999, 0) } : {}));   // tp: training points toward the next level (owner, 2026-11-09)
  const ids = new Set(); const uniq = pets.filter((p) => !ids.has(p.id) && ids.add(p.id));
  if (!uniq.length) uniq.push({ id: 1, sp: "pup", lv: 1 });
  const items = d.items || {}, treats = {};
  for (const [k0, v] of Object.entries(d.treats || {})) { const k = PET_MOVED[k0] || k0; if (species.has(k)) treats[k] = Math.min(1e6, (treats[k] || 0) + int(v, 0, 1e6)); }
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
  } else if (H && Array.isArray(H.pieces)) pieces = H.v === 2 ? H.pieces : H.pieces.map((t) => (t && typeof t === "object" ? fromGrid(t) : t));
  else if (!H) pieces = starterHouse();   // everyone starts with a little house
  const out = [], seen = new Set(), m = (v) => (Number.isFinite(+v) ? Math.round(Math.max(0, Math.min(HOME_SIZE, +v)) * 20) / 20 : HOME_SIZE / 2);
  for (const t of pieces) {
    if (!t || !PIECES[t.k] || out.length >= MAX_PIECES) continue;
    const it = { k: t.k, x: m(t.x), z: m(t.z), l: int(t.l, 0, LEVELS - 1), a: Number.isFinite(+t.a) ? ((Math.round(+t.a) % 360) + 360) % 360 : (int(t.r, 0, 3) * 90), c: int(t.c, 0, COLORS.length - 1, 0) };
    if (t.k === "window") it.w = int(t.w, 0, VIEWS.length - 1, 0);
    if (t.k === "pen" && t.pet && ids.has(t.pet)) { it.pet = t.pet; it.since = Number.isFinite(+t.since) ? +t.since : Date.now(); }
    const key = [it.k, it.x, it.z, it.l, it.a].join(",");   // the very same piece twice is once
    if (seen.has(key)) continue; seen.add(key);
    out.push(it);
  }
  const home = { v: 2, ext: int(H && H.ext, 0, EXTERIORS.length - 1, 0), pieces: out };
  const nextId = Math.max(int(d.nextId, 1, 1e9, 1), ...uniq.map((p) => p.id + 1));
  return {
    coins: Math.max(0, Math.min(1e9, (Number.isFinite(+d.coins) ? +d.coins : 0) + refund)), pets: uniq, ride: uniq.some((p) => p.id === d.ride) ? d.ride : uniq[0].id,
    items: { snack: int(items.snack, 0, 1e6), ribbon: int(items.ribbon, 0, 1e6), ticket: int(items.ticket, 0, 1e6) }, treats,
    delivered: int(d.delivered, 0, 1e9), nextId, shirt: /^#[0-9a-f]{6}$/i.test(d.shirt) ? d.shirt : "#3a8ee6",
    settings: { followArrowWhenEmpty: !(d.settings && d.settings.followArrowWhenEmpty === false) }, home,
  };
}
