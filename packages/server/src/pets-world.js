// Pet Delivery Co.: the world, shared by the page (website/pets-world.js) and the server
// (packages/server/src/pets-world.js). The two copies must stay identical (scripts/check.sh compares them).
// (owner, 2026-11-10) The town is built from blocks by staff (see "the block world" below), round the town square.
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

// ---- the block world (owner, 2026-11-10): the town is built from blocks on a grid of 6 x 6 m tiles, stacked in steps
// of 3 m. A block at level k fills y (k-1)*3 to k*3 (level 0 is the ground's top at 0). Kinds: land (grass), wedge (a
// ramp up one step, rising toward its direction), road (a land block paved on top), ramp (a road wedge), water (a
// block of water, its surface just under the top), corner (owner, 2026-11-10: a flat block cut corner to corner, road
// on one side, grass on the other, to round a road's turn) and half (the road half of that, nothing on the other side).
// and rock (owner, 2026-11-10: a block of stone). Blocks can float with nothing under them (floating islands).
// Things stand on tiles: trees, houses (on a tile, facing a way, with a mailbox at the front of their 3 x 3 lot), lone
// mailboxes, boost pads (on roads), animal control vans (on roads: they roam every road joined to theirs), helicopters
// (anywhere, keeping within a chosen radius); every house is also a lot a player can live on (3 x 3 tiles). Only staff (admin) edit it,
// live, for everyone; the server keeps it. It starts as just the town square: a round island of tiles with the square's
// buildings, which stay where they are. ----
export const TILE = 6, STEP = 3;
export const KINDS = ["land", "wedge", "road", "ramp", "water", "corner", "half", "rock"], THINGS = ["tree", "house", "mailbox", "boost", "van", "heli", "plot", "boulder", "vanpt"];
export const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];   // a direction 0-3: +z, +x, -z, -x
const tkey = (i, j) => i + "," + j, ckey = (i, j, k) => i + "," + j + "," + k;
export const tileOf = (v) => Math.floor(v / TILE), tileMid = (i) => i * TILE + TILE / 2;
const cells = new Map();   // "i,j,k" -> { i, j, k, t, d }
const cols = new Map();    // "i,j" -> its cells, lowest first
let things = [], nextThing = 1;
export const world = { rev: 0 };
export function starterWorld() {
  const c = [];
  for (let i = -12; i < 12; i++) for (let j = -12; j < 12; j++) if (hyp(tileMid(i), tileMid(j)) < 64) c.push([i, j, 0, 0, 0]);
  return { v: 1, cells: c, things: [] };
}
const okInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
function cleanCell(a) { if (!Array.isArray(a)) return null; const [i, j, k, t, d] = a.map((v) => +v); return okInt(i, -200, 200) && okInt(j, -200, 200) && okInt(k, -10, 60) && okInt(t, 0, KINDS.length - 1) && okInt(d | 0, 0, 3) ? { i, j, k, t: KINDS[t], d: d | 0 } : null; }
function cleanThing(o) {
  if (!o || !THINGS.includes(o.k)) return null;
  const i = +o.i, j = +o.j, y = +o.y; if (!okInt(i, -200, 200) || !okInt(j, -200, 200) || !Number.isFinite(y) || Math.abs(y) > 200) return null;
  const t = { id: okInt(+o.id, 1, 1e9) ? +o.id : nextThing++, k: o.k, i, j, y: Math.round(y * 100) / 100, d: okInt(+o.d, 0, 3) ? +o.d : 0 };
  if (t.k === "heli") t.r = okInt(+o.r, 10, 400) ? +o.r : 80;
  if (t.k === "plot") { if (!okInt(+o.p, 0, 999)) return null; t.p = +o.p; }   // (owner, 2026-11-10) old plot markers: kept in the data, no longer used
  nextThing = Math.max(nextThing, t.id + 1); return t;
}
// the whole world from saved data (bad entries dropped)
export function setWorld(data) {
  cells.clear(); things = [];
  const src = data && Array.isArray(data.cells) ? data : starterWorld();
  for (const a of src.cells) { const c = cleanCell(a); if (c) cells.set(ckey(c.i, c.j, c.k), c); }
  for (const o of src.things || []) { const t = cleanThing(o); if (t && !things.some((q) => q.id === t.id)) things.push(t); }
  derive(); world.rev++;
}
export const worldData = () => ({ v: 1, cells: [...cells.values()].map((c) => [c.i, c.j, c.k, KINDS.indexOf(c.t), c.d]), things: things.map((t) => ({ ...t })) });
// edits (from the editor): { op: "put", c: [i, j, k, kind, dir] } | { op: "del", c: [i, j, k] } | { op: "add", t: thing }
// | { op: "rm", id }. Returns the edits that applied (things get their ids), or [] for none.
export function applyEdits(edits) {
  const done = [];
  for (const e of Array.isArray(edits) ? edits.slice(0, 200) : []) {
    if (e && e.op === "put") { const c = cleanCell(e.c); if (c) { cells.set(ckey(c.i, c.j, c.k), c); done.push({ op: "put", c: [c.i, c.j, c.k, KINDS.indexOf(c.t), c.d] }); } }
    else if (e && e.op === "del" && Array.isArray(e.c)) { const k = ckey(+e.c[0], +e.c[1], +e.c[2]); if (cells.delete(k)) done.push({ op: "del", c: [+e.c[0], +e.c[1], +e.c[2]] }); }
    else if (e && e.op === "add") { const t = cleanThing({ ...e.t, id: e.t && e.t.id ? e.t.id : 0 }); if (t && t.k !== "plot") { things = things.filter((q) => q.id !== t.id); things.push(t); done.push({ op: "add", t: { ...t } }); } }
    else if (e && e.op === "rm") { const n = things.length; things = things.filter((q) => q.id !== +e.id); if (things.length < n) done.push({ op: "rm", id: +e.id }); }
  }
  if (done.length) { derive(); world.rev++; }
  return done;
}
export const allThings = () => things;
export const allCells = () => cells.values();
// ---- heights ----
// a cell's top at a point in its tile (a wedge rises across the tile toward its direction)
export function cellTop(c, x, z) {
  if (c.t === "half" && !inHalf(c, x, z)) return -Infinity;   // the empty half
  if (c.t !== "wedge" && c.t !== "ramp") return c.k * STEP - (c.t === "water" ? 0.4 : 0);
  const [dx, dz] = DIRS[c.d], u = clamp(dx ? (x - c.i * TILE) / TILE : (z - c.j * TILE) / TILE, 0, 1), f = dx + dz > 0 ? u : 1 - u;
  return (c.k - 1) * STEP + f * STEP;
}
// is (x, z) on the road side of a corner or half block? The cut runs corner to corner; the road takes the triangle at
// the tile corner between its sides d and d + 1 (d 0: +z and +x, 1: +x and -z, 2: -z and -x, 3: -x and +z)
export function inHalf(c, x, z) {
  const u = (x - c.i * TILE) / TILE, v = (z - c.j * TILE) / TILE;
  return c.d === 0 ? u + v >= 1 - 1e-6 : c.d === 1 ? u >= v - 1e-6 : c.d === 2 ? u + v <= 1 + 1e-6 : v >= u - 1e-6;
}
export const colAt = (x, z) => cols.get(tkey(tileOf(x), tileOf(z))) || null;
// the highest surface here at or a little above y (what you'd stand on); -Infinity over nothing
export function surfaceAt(x, z, y) {
  const col = colAt(x, z); if (!col) return -Infinity;
  let best = -Infinity; for (const c of col) { const t = cellTop(c, x, z); if (t <= y + 1.2 && t > best) best = t; }
  return best;
}
// the top of the highest block here (or -200 off the island)
export function terrain(x, z) { const col = colAt(x, z); if (!col) return -200; let best = -Infinity; for (const c of col) best = Math.max(best, cellTop(c, x, z)); return best === -Infinity ? -200 : best; }
export const smoothTerrain = (x, z) => Math.max(0, terrain(x, z));
export const inside = (x, z) => terrain(x, z) > -200;
export function waterAt(x, z) { const col = colAt(x, z); if (!col) return -Infinity; const top = col[col.length - 1]; return top.t === "water" ? cellTop(top, x, z) : -Infinity; }
export const roadDist = (x, z) => { const col = colAt(x, z); if (!col) return 99; const top = col[col.length - 1]; return top.t === "road" || top.t === "ramp" || ((top.t === "corner" || top.t === "half") && inHalf(top, x, z)) ? 0 : 99; };
// does a block's side stand in the way of someone at y (who can step up 0.6 m)?
function wallAt(x, z, y) {
  const col = colAt(x, z); if (!col) return false;
  for (const c of col) { if (c.t === "water") continue; const top = cellTop(c, x, z), bottom = (c.k - 1) * STEP; if (top > y + 0.6 && bottom < y + 1.8) return true; }
  return false;
}
// ---- the town square (owner, 2026-11-09; the same size on blocks, 2026-11-10): a round paved square in the middle with
// the Contract Board at its center and the main buildings evenly round it, each facing the middle with its ring in front.
// yaw turns a building's front (+z) toward the middle ----
export const PLAZA = 60;
const around = (deg, r) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return { x: Math.round(c * r * 100) / 100, z: Math.round(s * r * 100) / 100, yaw: Math.atan2(-c, -s) }; };
export const BOARD = { x: 0, z: 0, r: 3 }, SPAWN = { x: 0, z: -12 };
export const POST = around(-90, 44), PICKUP = { ...around(-90, 30), r: 4 };
export const SHOP_B = around(0, 44), SHOP = { ...around(0, 31), r: 5 };
export const TRAIN = { ...around(180, 40), r: 9 };
export const POUND = around(90, 44), POUND_B = around(90, 47), RELEASE = around(90, 33);
export const ROAD_HALF = TILE / 2;
export const houses = [], solids = [], trees = [], boosts = [], boulders = [];
// solids: { x, z, c, s (cos / sin of its turn), hw, hd (half sizes), y0, y1 }
const solid = (x, z, yaw, hw, hd, y0, y1) => solids.push({ x, z, c: Math.cos(yaw), s: Math.sin(yaw), hw, hd, y0, y1 });
// ---- housing plots (owner, 2026-11-08; placed by staff, 2026-11-10): 20 x 20 m (5 x 5 squares of 4 m) where players
// build their own houses, seen by everyone. 16 by number: 3 first come, first served, 2 VIP, 5 given out at random, 6 for
// rooms of more than 10 players. A plot not yet placed is nowhere. ----
export const PLOT = 18, CELL = 4, GRID = 5, LEVELS = 3, LEVEL_H = 5.5;   // (owner, 2026-11-09) taller walls, so the camera fits
// (owner, 2026-11-10) every town house stands on a lot of 3 x 3 tiles (PLOT across): a player who joins a room takes a
// random free one, and their own house stands there instead until they leave. PLOTS: the lots, rebuilt with the world
// ({ id: the house's id, x, z, y, yaw (turning the lot's front, -z, to face the house's way), d, placed }); lotById
// finds one by id
export const PLOTS = [], lotById = new Map();
const LOT_YAW = [Math.PI, -Math.PI / 2, 0, Math.PI / 2];
// a point in a lot (lx across, lz from its middle toward its back; the front is -z) in the world
export const lotPoint = (p, lx, lz) => [p.x + lx * Math.cos(p.yaw) + lz * Math.sin(p.yaw), p.z - lx * Math.sin(p.yaw) + lz * Math.cos(p.yaw)];
export const plotAt = (x, z) => PLOTS.find((p) => p.placed && Math.abs(x - p.x) < PLOT / 2 && Math.abs(z - p.z) < PLOT / 2) || null;
export const islandAt = () => null;
// ---- what the blocks and things make: columns, houses (with mailboxes), trees, boosts, plots, the road network ----
const roadTiles = new Map();   // "i,j" -> the road cell on top
function derive() {
  cols.clear(); for (const c of cells.values()) { const k = tkey(c.i, c.j); if (!cols.has(k)) cols.set(k, []); cols.get(k).push(c); }
  for (const col of cols.values()) col.sort((a, b) => a.k - b.k);
  roadTiles.clear(); for (const [k, col] of cols) { const top = col[col.length - 1]; if (top.t === "road" || top.t === "ramp" || top.t === "corner" || top.t === "half") roadTiles.set(k, top); }
  houses.length = 0; solids.length = 0; trees.length = 0; boosts.length = 0; boulders.length = 0; vanPts.clear();
  PLOTS.length = 0; lotById.clear();
  const rnd = rng(7);
  for (const t of things) {
    if (t.k === "house") {   // (owner, 2026-11-10) on its tile, its lot the 3 x 3 tiles round it; the mailbox at the lot's front
      const x = tileMid(t.i), z = tileMid(t.j), [fx, fz] = DIRS[t.d], yaw = Math.atan2(fx, fz);
      houses.push({ x, z, yaw, base: t.y, mx: x + fx * 7.8, mz: z + fz * 7.8, my: t.y, sky: false, r: rnd(), id: t.id });
      solid(x, z, yaw, 4.5, 4.5, t.y - 4, t.y + 4.4);
      const lot = { id: t.id, x, z, y: t.y, yaw: LOT_YAW[t.d], d: t.d, placed: true }; PLOTS.push(lot); lotById.set(t.id, lot);
    } else if (t.k === "mailbox") { const x = tileMid(t.i), z = tileMid(t.j); houses.push({ x, z, yaw: [0, Math.PI / 2, Math.PI, -Math.PI / 2][t.d], base: t.y, mx: x, mz: z, my: t.y, sky: false, r: rnd(), box: true, id: t.id }); }
    else if (t.k === "tree") { const x = tileMid(t.i), z = tileMid(t.j); trees.push({ x, z, y: t.y, s: 0.85 + rnd() * 0.5, id: t.id }); solid(x, z, 0, 0.55, 0.55, t.y - 1, t.y + 12); }   // (owner, 2026-11-10) trees are solid: their trunk stops you
    else if (t.k === "vanpt") vanPts.add(tkey(t.i, t.j));   // (owner, 2026-11-10) a van point on a road tile
    else if (t.k === "boulder") { const x = tileMid(t.i), z = tileMid(t.j), sz = 1.7 + rnd() * 0.8; boulders.push({ x, z, y: t.y, s: sz, yaw: rnd() * 6.28, id: t.id }); solid(x, z, 0, sz * 0.8, sz * 0.8, t.y - 1, t.y + sz * 1.5); }   // (owner, 2026-11-10) a boulder on a tile, like a tree
    else if (t.k === "boost") boosts.push({ x: tileMid(t.i), z: tileMid(t.j), y: t.y, yaw: [0, Math.PI / 2, Math.PI, -Math.PI / 2][t.d], id: t.id });
  }
  for (const h of houses) { h.d = hyp(h.mx - POST.x, h.mz - POST.z); h.sky = h.base > 30; }
  solid(POST.x, POST.z, POST.yaw, 9, 5, -1, 8); solid(SHOP_B.x, SHOP_B.z, SHOP_B.yaw, 6, 4, -1, 9); solid(POUND_B.x, POUND_B.z, POUND_B.yaw, 8, 4, -1, 7);
}
// a road tile's height at the middle of one of its edges (side 0-3 as DIRS), or null where it doesn't join (a ramp's sides)
function edgeY(c, side) {
  if (c.t === "road") return c.k * STEP;
  if (c.t === "corner" || c.t === "half") return side === c.d || side === (c.d + 1) % 4 ? c.k * STEP : null;   // its two road sides
  if (side === c.d) return c.k * STEP; if (side === (c.d + 2) % 4) return (c.k - 1) * STEP; return null;
}
// the road tiles joined to this one (sharing an edge at the same height)
export function roadNext(i, j) {
  const a = roadTiles.get(tkey(i, j)); if (!a) return [];
  const out = [];
  for (let s = 0; s < 4; s++) {
    const ni = i + DIRS[s][0], nj = j + DIRS[s][1], b = roadTiles.get(tkey(ni, nj)); if (!b) continue;
    const ya = edgeY(a, s), yb = edgeY(b, (s + 2) % 4); if (ya !== null && yb !== null && Math.abs(ya - yb) < 0.5) out.push([ni, nj, s]);
  }
  return out;
}
export const isRoad = (i, j) => roadTiles.has(tkey(i, j));
// ---- van points (owner, 2026-11-10): marked road tiles vans drive between, like streets between junctions. Two points
// are joined when a road runs from one to the other without passing another point. ----
const vanPts = new Set();   // "i,j"
export const isVanPt = (i, j) => vanPts.has(tkey(i, j)), vanPointCount = () => vanPts.size;
// the points reachable from tile (i, j) along roads without passing another point, each with the tiles to it
export function vanRoutes(i, j) {
  const start = tkey(i, j), prev = new Map([[start, null]]), q = [[i, j]], found = [];
  for (let n = 0; n < q.length && n < 6000; n++) {
    const [a, b] = q[n], k = tkey(a, b);
    if (k !== start && vanPts.has(k)) { found.push(k); continue; }
    for (const [ni, nj] of roadNext(a, b)) { const nk = tkey(ni, nj); if (!prev.has(nk)) { prev.set(nk, k); q.push([ni, nj]); } }
  }
  return found.map((k) => { const path = []; for (let c = k; c !== start; c = prev.get(c)) path.unshift(c.split(",").map(Number)); return { k, path }; });
}
setWorld(starterWorld());

const RIDER_R = 0.7;
export function blocked(x, z, y) {
  if (wallAt(x, z, y) || wallAt(x + RIDER_R, z, y) || wallAt(x - RIDER_R, z, y) || wallAt(x, z + RIDER_R, y) || wallAt(x, z - RIDER_R, y)) return true;
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
// (owner, 2026-11-10) the vans and helicopters staff placed: a van on a road tile roams the roads joined to it (driving
// on the right, picking a way at each tile, turning round at a dead end); a helicopter circles its spot, keeping within
// its radius
// its radius. old: the vehicles before the world changed (owner, 2026-11-10): those still placed carry on where they are
// (a van only while its road is still there), so building doesn't send them all back to their starting spots
export function makeVehicles(old) {
  const vs = [], fresh = [], keep = new Map((old || []).filter((v) => v.id).map((v) => [v.id, v]));
  for (const t of things) {
    const o = keep.get(t.id);
    if (t.k === "van") {
      if (o && o.kind === 0 && (isRoad(o.i, o.j) || isRoad(o.ni, o.nj))) { vs.push(o); continue; }
      const v = { id: t.id, kind: 0, style: t.id % 3, speed: VAN_SPEEDS[t.id % 3], i: t.i, j: t.j, pi: t.i, pj: t.j, ni: t.i, nj: t.j, x: tileMid(t.i), y: t.y, z: tileMid(t.j), yaw: [0, Math.PI / 2, Math.PI, -Math.PI / 2][t.d], mode: 0, target: 0, t: 0, cool: 0 };
      vs.push(v); fresh.push(v);
    } else if (t.k === "heli") {
      if (o && o.kind === 1) { o.cx = tileMid(t.i); o.cz = tileMid(t.j); o.r = t.r; vs.push(o); continue; }
      const ph = (t.id * 2.4) % TAU, v = { id: t.id, kind: 1, cx: tileMid(t.i), cz: tileMid(t.j), r: t.r, ph, x: tileMid(t.i), y: t.y + HELI.alt, z: tileMid(t.j), yaw: 0, mode: 0, target: 0, t: 0, cool: 0, ba: ph, bd: 15, bw: 0, bt: 0, bn: 0, bp: ph };
      vs.push(v); fresh.push(v);
    }
  }
  for (const v of fresh) placePatrol(v, 0, true);
  return vs;
}
// a van's spot on the right-hand side of its way into tile (ni, nj) from (i, j)
function lane(v) { const fx = Math.sign(v.ni - v.i), fz = Math.sign(v.nj - v.j); return [tileMid(v.ni) - fz * 1.5, tileMid(v.nj) + fx * 1.5]; }
// (owner, 2026-11-10) with van points on its roads a van drives point to point: at a point it picks one joined to it
// (not the one it just came from, unless that's the only one) and follows the road there; off the points it heads to
// the nearest. Returns the next tile, or null when there are no points to go by
function vanStep(v, opts) {
  if (!vanPts.size) return null;
  const ci = v.ni, cj = v.nj, ck = tkey(ci, cj);
  if (v.path && v.path.length && !opts.some(([a, b]) => a === v.path[0][0] && b === v.path[0][1])) v.path = [];   // the road changed under it
  if (!v.path || !v.path.length) {
    const routes = vanRoutes(ci, cj); v.path = [];
    if (vanPts.has(ck)) { const fwd = routes.filter((r) => r.k !== v.fromPt), list = fwd.length ? fwd : routes, r = list[Math.floor(Math.random() * list.length)]; if (r) { v.path = r.path; v.fromPt = ck; } }
    else if (routes.length) { const r = routes.reduce((a, b) => (b.path.length < a.path.length ? b : a)); v.path = r.path; v.fromPt = null; }
  }
  return v.path.length ? v.path.shift() : null;
}
function placePatrol(v, dt, snap) {
  if (v.kind === 0) {
    if (!isRoad(v.ni, v.nj)) { if (isRoad(v.i, v.j)) { v.ni = v.i; v.nj = v.j; } else return; }
    let [tx, tz] = lane(v), dx = tx - v.x, dz = tz - v.z, d = hyp(dx, dz);
    if (d < 0.6 || snap) {   // here: pick the next tile (not straight back unless it's a dead end)
      const opts = roadNext(v.ni, v.nj); let pick = vanStep(v, opts);
      if (!pick) { const fwd = opts.filter(([a, b]) => a !== v.i || b !== v.j); pick = (fwd.length ? fwd : opts)[Math.floor(Math.random() * (fwd.length || opts.length || 1))]; }   // no van points on its roads: it roams
      v.pi = v.i; v.pj = v.j; v.i = v.ni; v.j = v.nj; if (pick) { v.ni = pick[0]; v.nj = pick[1]; }
      if (snap) { v.x = tileMid(v.i); v.z = tileMid(v.j); }
      [tx, tz] = lane(v); dx = tx - v.x; dz = tz - v.z; d = hyp(dx, dz);
    }
    const m = Math.min(d, VAN.patrol * v.speed * dt); if (d > 0.01) { v.x += (dx / d) * m; v.z += (dz / d) * m; v.yaw = turn(v.yaw, Math.atan2(dx, dz), snap ? 1 : Math.min(1, dt * 6)); }
    const gy = surfaceAt(v.x, v.z, v.y + 2); if (gy > -Infinity) v.y += (gy - v.y) * (snap ? 1 : Math.min(1, dt * 10));
    return;
  }
  v.ph += (HELI.patrol / Math.max(30, v.r)) * dt; const r = v.r * (0.7 + 0.3 * Math.sin(v.ph * 2));
  const tx = v.cx + Math.cos(v.ph) * r, tz = v.cz + Math.sin(v.ph) * r, yaw = Math.atan2(-Math.sin(v.ph), Math.cos(v.ph)), ty = Math.max(smoothTerrain(tx, tz), 0) + HELI.alt;
  const k = snap ? 1 : Math.min(1, dt * 6);
  v.x += (tx - v.x) * k; v.z += (tz - v.z) * k; v.y += (ty - v.y) * (snap ? 1 : Math.min(1, dt * 2)); v.yaw = turn(v.yaw, yaw, snap ? 1 : Math.min(1, dt * 8));
}
function turn(a, b, k) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * k; }
// a helicopter's searchlight from its state { x, y, z, yaw, ba (the light's heading), bd (how far out its spot is) }: the
// lamp under the nose and the unit direction it shines (down to the ground at the spot); the page draws the same beam
export function beamOf(v, out = {}) {
  const lx = v.x + Math.sin(v.yaw) * 1.6, ly = v.y - 1.3, lz = v.z + Math.cos(v.yaw) * 1.6;
  const ax = v.x + Math.sin(v.ba) * v.bd, az = v.z + Math.cos(v.ba) * v.bd, gy = terrain(ax, az), dx = ax - lx, dy = (gy > -200 ? gy : 0) - ly, dz = az - lz, d = hyp(dx, dy, dz) || 1;
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
  // (owner, 2026-11-10) the helicopters' searchlights work day and night (daylightOverride no longer matters)
  const inLight = new Set();
  for (const v of vs) {
    if (v.kind !== 1) continue;
    stepHeli(v, dt, now); v.mode = 0;
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
        { const gy = surfaceAt(v.x, v.z, v.y + 2); if (gy > -Infinity) v.y = gy; }
        if (d < C.catch && Math.abs(p.y - v.y) < 3) catchPlayer(p, vs, now, ev);
        else if (v.t <= 0) {
          v.mode = 2; v.cool = now + 6;
          if (now - p.lastStar > 4 && p.stars < WANTED_MAX) { p.stars++; p.lastStar = now; ev.push({ k: "escaped", id: p.id, stars: p.stars }); }
        }
      }
      continue;
    }
    if (v.mode === 2) {   // back to the road tile it left
      const tx = tileMid(v.i), tz = tileMid(v.j);
      const dx = tx - v.x, dz = tz - v.z, d = hyp(dx, dz), m = Math.min(d, C.patrol * v.speed * 1.4 * dt);
      if (d > 0.01) { v.x += (dx / d) * m; v.z += (dz / d) * m; v.yaw = turn(v.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8)); }
      const gy = surfaceAt(v.x, v.z, v.y + 2); if (gy > -Infinity) v.y = gy;
      if (d < 1) { v.mode = 0; v.ni = v.i; v.nj = v.j; v.path = []; }
    } else placePatrol(v, dt, false);
    if (v.mode === 0 && now > v.cool) {   // look around
      let best = null, bd = 1e9;
      for (const p of players) {
        if (p.immuneUntil > now || !insideWorld(p) || !p.bag) continue;
        if (Math.abs(p.y - v.y) > 6) continue;
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
const insideWorld = (p) => !p.inst && p.y > -150;
// how far a van sees a courier: farther ahead, a little to the sides, less behind, and 7 m more per wanted star
// (forward / sideways: the unit direction to them along and across the van's heading)
export const vanSight = (forward, sideways, stars) => VAN.spot + Math.max(0, forward) * VAN.front + sideways * VAN.side - Math.max(0, -forward) * VAN.rear + 7 * (stars || 0);

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
    intro: int(d.intro, 0, 1, 0),   // (owner, 2026-11-09) 1 once the walk-through is done
  };
}
