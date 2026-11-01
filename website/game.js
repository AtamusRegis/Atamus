// Atamus (owner, 2026-10-31): a single-player container port. One big ship docks at a time and its two ship-to-shore cranes
// unload them, one container at a time, onto yard tractors lined up under them; tractors carry the containers to storage
// areas, each with an RTG crane at its end that stacks them three high; customer trucks with a colored cab come for a
// container of that color. You pick a truck and queue where it goes. Trucks follow one-way roads and never overlap: each
// holds the tiles under it and moves on only into free ones. 32 x 32 tiles, placeholder pixel art. Rules in
// docs/FEATURES.md.
"use strict";
(() => {
const $ = (id) => document.getElementById(id);
const cv = $("view"), mainCtx = cv.getContext("2d");
let ctx = mainCtx;   // swapped to an offscreen canvas while a cached layer is drawn
const TAU = Math.PI * 2, rnd = Math.random, hyp = Math.hypot, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---- the port: 54 x 42 tiles of 32 px ----
// rows 0–6 water (the ship's deck on rows 2–6), 7–8 the quay (crane rails), 9–11 the STS lanes, 12–13 the quay road,
// 14–25 storage, 26 the RTGs' rest, 27–28 the RTG lane, 29–32 the RTG bays, 33–34 the yard road, 35–38 the parking lot,
// 39–40 the lot road, 41 the fence. Every road has two lanes (owner). Containers are 3 tiles long (owner).
const T = 32, OX = 7, MW = 64 + OX, MH = 43, QUAY = 7, LINE = 9, LANE_ROWS = [9, 10, 11], QROAD = 12, REST = 26, RLANE = 27, BAY0 = 29, YROAD = 33, LOT0 = 35, LROAD = 39, CL = 3, TL = 4;
const COLORS = [
  { name: "Red", c: "#d23c32" }, { name: "Orange", c: "#e8822a" }, { name: "Yellow", c: "#e8c832" }, { name: "Green", c: "#3aa04a" },
  { name: "Blue", c: "#3a7ad0" }, { name: "Purple", c: "#7a4ac8" }, { name: "White", c: "#d8dcdf" },
  { name: "Gray", c: "#80858c" }, { name: "Black", c: "#3a3d43" },
];
// (owner, 2026-11-01) white, gray and black are everyday cargo any grey truck takes; most containers are one of these
const NEUTRAL = new Set([6, 7, 8]), NEUTRAL_SHARE = 0.6;
const randColor = () => (rnd() < NEUTRAL_SHARE ? pick([6, 7, 8]) : Math.floor(rnd() * 6));
// (perf) keys parsed once and kept
const UNKEY = new Map();
const key = (i, j) => i + "," + j, unkey = (k) => { let v = UNKEY.get(k); if (!v) { v = k.split(",").map(Number); UNKEY.set(k, v); } return v; };
// berths: 12 bays; under each STS crane a 12-tile line holds three trucks (owner)
// (owner) under each STS crane three lanes side by side, one tractor each, so none waits behind another
// (owner) one much larger ship at a single berth: 14 slots across (42 tiles) x 5 rows of deck (rows 2–6); its two STS
// cranes split it, A the west 7 slot columns and B the east 7
const DOCK = { x: 5 + OX, cols: 14, rows: 5, top: 2, ship: null, wait: 1.5 };
// (owner, 2026-11-01) up to 4 STS cranes, A–D, side by side along the quay. Under each, three lanes one truck wide, all
// running west: the top one for auto tractors and the bottom one for manual ones, each a line ending under the crane
// (the tractor being loaded plus 2 waiting), and the middle one a drive-through that loaded tractors pull out into.
// ex: the exit column (west), x + 5: the spot under the crane, ox: the entry column (east)
const LANE_DEEP = 3, BERTH_W = 3 + TL * LANE_DEEP;
const BERTHS = [0, 1, 2, 3].map((id) => { const ex = 9 + id * BERTH_W, x = ex - 3; return { id, ex, x, ox: x + 5 + TL * LANE_DEEP, promised: 0, crane: { x: (x + 6) * T, y: (10 + 0.5) * T, hold: null, ops: [], truck: null } }; });
const PASS_ROW = 10;
for (const b of BERTHS) b.lanes = [{ r: 9, kind: "auto", berth: b, q: [] }, { r: 11, kind: "manual", berth: b, q: [] }];
const laneFor = (b, t) => b.lanes.find((l) => l.kind === (t.auto ? "auto" : "manual"));
const laneHead = (l) => key(l.berth.x + 5, l.r);   // tractors stand under the crane facing west
const laneTiles = (b, r) => [0, 1, 2, 3].map((d) => key(b.x + 5 + d, r));
const laneSpot = (t) => key(t.lane.berth.x + 5 + TL * Math.max(0, t.lane.q.indexOf(t)), t.lane.r);
// a lane's line goes by who is furthest in: tractors already in the lane by how far west, then those on their way
function sortLanes() {
  for (const b of BERTHS) for (const l of b.lanes) {
    const rank = (t) => { const [i, j] = headIJ(t); return t.locked ? -1 : j === l.r && i <= b.x + 5 + TL * LANE_DEEP ? i : 1000 + t.path.length; };
    l.q.sort((a, c) => rank(a) - rank(c));
  }
}
function leaveLane(t) { if (t.lane) t.lane.q = t.lane.q.filter((x) => x !== t); t.lane = null; }
// storage areas (owner): 5 wide, 12 long, vertical; 5 x 4 slots (1 x 3 each), stacked up to 3; 5 RTG bays below, one per column
// (owner, 2026-11-01) the seventh, at the east end, is the export area: export trucks drop containers there, and
// tractors haul them to the ship
const BLOCKS = [4, 12, 20, 28, 36, 44, 52].map((x) => x + OX).map((x, k) => {
  const b = { id: k, x, y: 14, w: 5, h: 12, cols: 5, rows: 4, exp: k === 6 };
  b.slots = Array.from({ length: b.cols }, () => Array.from({ length: b.rows }, () => []));
  b.bays = Array.from({ length: 5 }, (_, c) => ({ i: x + c, claim: null }));
  b.rtg = { x: (x + 2.5) * T, y: (REST + 0.5) * T, hold: null, ops: [], truck: null };
  return b;
});
// (owner, 2026-11-01) a lane down to the RTG lanes east of every storage area, and the east side right after the last
const LANES = BLOCKS.map((b) => b.x + 6), WEST = 2 + OX, EAST = BLOCKS[6].x + 8;
// (owner, 2026-11-01) the tractor parking: one column of horizontal spots west of the port, drive-through westbound
// between two roads; new tractors appear here and idle ones park here
// (2026-11-01) a second block of 9 below the RTG lane (in from the RTG lane down its east aisle, out up its west aisle
// back onto it), so every tractor has a spot: you can own as many tractors as there are spots
const PARK_X = 3, PARK = [...Array(13).keys()].map((k) => ({ j: 14 + k, claim: null })).concat([...Array(9).keys()].map((k) => ({ j: 30 + k, claim: null, low: true })));
const parkTiles = (p) => [0, 1, 2, 3].map((d) => key(PARK_X + d, p.j));
// (owner, 2026-11-01) 48 stalls in groups of 4
const STALLS = [...Array(12).keys()].map((k) => ({ i: 4 + OX + k, claim: null })).concat([...Array(12).keys()].map((k) => ({ i: 20 + OX + k, claim: null })), [...Array(24).keys()].map((k) => ({ i: 36 + OX + k, claim: null })));
// ---- progress (owner, 2026-11-01): start with 1 tractor, 1 STS crane, 1 storage area and 4 parking stalls; customers pay
// for their container; the rest is bought. Locked things show on the map, dimmed with their price: click one to buy it.
let money = 500;   // (owner, 2026-11-01) every game starts with $500
const INCOME = 60;
const BLOCK_PRICE = [0, 600, 900, 1300, 1800, 2400, 1000], CRANE_PRICE = [0, 2000, 3500, 5000], STALL_PRICE = [0, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1400];
BERTHS.forEach((b) => (b.open = b.id === 0)); BLOCKS.forEach((b) => (b.open = b.id === 0)); STALLS.forEach((s, k) => { s.group = Math.floor(k / 4); s.open = s.group === 0; });
const tractorPrice = (auto) => (400 + 50 * (trucks.filter((t) => t.kind === "yard").length - 1)) * (auto ? 4 : 1);   // (owner) +$50 each; auto ones 4x
// which slot columns of the ship a crane works: with only crane A, all of them
// which slot columns of the ship a crane works: split evenly between the open cranes, west to east
const craneCols = (b) => { const op = BERTHS.filter((q) => q.open), i = op.indexOf(b), n = op.length; return i < 0 ? [0, 0] : [Math.round(i * DOCK.cols / n), Math.round((i + 1) * DOCK.cols / n)]; };
function buyAt(i, j) {
  for (const b of BERTHS) if (!b.open && i >= b.ex && i <= b.ox && j >= QUAY && j <= 11) return { price: CRANE_PRICE[b.id], buy: () => { b.open = true; } };
  for (const b of BLOCKS) if (!b.open && i >= b.x && i < b.x + b.w && j >= b.y && j < YROAD) return { price: BLOCK_PRICE[b.id], buy: () => { b.open = true; } };
  if (j >= LOT0 && j < LROAD) { const st = STALLS.find((q) => q.i === i); if (st && !st.open) { const g = STALLS.filter((q) => q.group === st.group); return { price: STALL_PRICE[st.group], buy: () => g.forEach((q) => (q.open = true)) }; } }
  return null;
}
// a bought tractor appears empty in a free STS lane of an open crane or, with those full, in a free RTG bay of an open
// storage area (as if it had just unloaded there)
function tractorSpot(auto) {
  if (trucks.filter((t) => t.kind === "yard").length >= PARK.length) return null;   // one parking spot per tractor
  for (const p of PARK) { const tiles = parkTiles(p); if (!p.claim && !tiles.some((k) => occ.has(k))) return { tiles, park: p }; }
  for (const b of BERTHS) if (b.open) for (const l of b.lanes) { const tiles = laneTiles(b, l.r); if (l.kind === (auto ? "auto" : "manual") && !l.q.length && !tiles.some((k) => occ.has(k))) return { tiles, lane: l }; }
  for (const b of BLOCKS) if (b.open) for (const bay of b.bays) { const tiles = [3, 2, 1, 0].map((d) => key(bay.i, BAY0 + d)); if (!bay.claim && !tiles.some((k) => occ.has(k))) return { tiles, bay }; }
  return null;
}
// (owner, 2026-11-01) two kinds: manual (you send it: a ship container, then an RTG) and auto (you assign it an RTG and
// it shuttles between the ship and that RTG by itself)
function addTractor(auto) {
  const price = tractorPrice(auto), sp = tractorSpot(auto); if (money < price || !sp) return false;
  money -= price; const t = mkTruck("yard", sp.tiles); t.num = trucks.filter((q) => q.kind === "yard").length; t.auto = !!auto;
  if (sp.park) { t.park = sp.park; sp.park.claim = t; } else if (sp.lane) { t.lane = sp.lane; sp.lane.q.push(t); } else { t.bay = sp.bay; sp.bay.claim = t; }
  return true;
}
const AUTO_CAB = "#5fd3d0", EXP_CAB = "#8a94a6", WAIT_CAB = "#5a6068";   // auto tractors' and export trucks' cabs
const floats = [];   // "+$60" over a paid truck

// ---- roads: one-way, a tile at a time (owner: an actual traffic rule), most with two lanes (owner: one for passing) ----
// (owner, 2026-11-01) Tractors: STS lanes (west) → quay road west → down the west side or the lane east of a storage
// area → the tractors' RTG lane (east, one lane) → into an RTG bay from above → out the bottom onto the yard road (west)
// → north up the street beside a storage area to the quay road. Customer trucks going straight to an RTG come in at the
// east gate, west along the yard road and into a bay from below; ones going to park come in at the southeast gate, west
// along the lot road and north into a stall, then leave it north onto the yard road (one bound for an RTG east of its
// stall goes round by the back road, east along the south fence). Loaded, they drive out the top of their bay, across
// the tractors' lane onto the exit lane (west, one lane) and out the west gate. Each two-lane road has a travel lane (the
// right one) and a passing lane; a truck held up by a stopped truck changes lanes to pass. Bays, stalls and STS lanes are
// entered only by the truck going there.
const E = new Map(), CHG = new Map(), SLOW = new Set(), SPOT = new Map(), DIVS = [], EK = new Map();
const add = (a, b, c, d) => { const k = key(a, b), n = key(c, d); if (!E.has(k)) E.set(k, []); if (!E.get(k).includes(n)) E.get(k).push(n); };
// a step only tractors ("y") or only other trucks ("c") take
const only = (a, b, c, d, kind) => { add(a, b, c, d); EK.set(key(a, b) + ">" + key(c, d), kind); };
// a two-lane road: lane 0 from (x, y), lane 1 beside it at (+ox, +oy), n tiles on in direction (dx, dy); a lane change
// moves one tile on into the other lane, and needs the tile beside free too
function road(x, y, dx, dy, n, ox, oy, passing) {
  DIVS.push([x, y, dx, dy, n, ox, oy]);
  for (let s = 0; s < n; s++) for (let l = 0; l < 2; l++) {
    const sg = 1 - 2 * l, ax = x + dx * s + ox * l, ay = y + dy * s + oy * l, cx = ax + dx + ox * sg, cy = ay + dy + oy * sg;
    add(ax, ay, ax + dx, ay + dy); add(ax, ay, cx, cy); CHG.set(key(ax, ay) + ">" + key(cx, cy), key(ax + ox * sg, ay + oy * sg));
    if (l === passing) SLOW.add(key(ax, ay));
  }
}
road(EAST + 1, QROAD, -1, 0, EAST + 1 - (PARK_X + 4), 0, 1, 1);             // quay road, west, on to the tractor parking
road(PARK_X + 4, QROAD + 1, 0, 1, RLANE - QROAD - 1, 1, 0, 1);               // the parking's east road, down to the RTG lanes
road(PARK_X - 2, PARK[0].j, 0, 1, RLANE - PARK[0].j, 1, 0, 1);               // the parking's west road, down to the RTG lanes
for (const p of PARK) { for (let x = PARK_X + 4; x > PARK_X - 1; x--) add(x, p.j, x - 1, p.j); for (const k of parkTiles(p)) SPOT.set(k, "P" + p.j); }
// (2026-11-01) the lower block: in off the back road at its south end and up its east aisle, out up its west aisle onto the
// tractors' lane (the east aisle carries on up to it too)
{ const low = PARK.filter((p) => p.low), j1 = low[low.length - 1].j;
  add(PARK_X + 5, j1, PARK_X + 4, j1);
  for (let j = j1; j > RLANE + 1; j--) add(PARK_X + 4, j, PARK_X + 4, j - 1);   // (bug 2026-11-01) on up onto the tractors' lane, so one sent elsewhere on the way can drive out
  for (let j = j1; j > RLANE + 1; j--) add(PARK_X - 1, j, PARK_X - 1, j - 1); }
for (const c of [PARK_X + 4, PARK_X + 5, PARK_X - 2, PARK_X - 1]) add(c, RLANE, c, RLANE + 1);
add(PARK_X + 4, QROAD, PARK_X + 4, QROAD + 1); add(PARK_X + 5, QROAD, PARK_X + 5, QROAD + 1);
road(WEST, QROAD + 1, 0, 1, RLANE - QROAD - 1, 1, 0, 1);                    // west side, down to the RTG lanes
for (const x of LANES) road(x, QROAD + 1, 0, 1, RLANE - QROAD - 1, 1, 0, 1); // the lanes east of the storage areas, down
for (const x of [WEST, ...LANES]) for (const c of [x, x + 1]) { add(c, QROAD, c, QROAD + 1); add(c, RLANE, c, RLANE + 1); }
// (owner, 2026-11-01) the RTG lanes: the tractors' lane east (row 28), above it the exit lane west (row 27, out the west
// gate; tractors only cross it)
for (let x = PARK_X - 2; x < EAST; x++) add(x, RLANE + 1, x + 1, RLANE + 1);
const EXIT_X0 = BLOCKS[6].x + BLOCKS[6].w - 1, EXIT = key(-6, RLANE);
for (let x = EXIT_X0; x > -6; x--) only(x, RLANE, x - 1, RLANE, "c");
DIVS.push([PARK_X - 2, RLANE, 1, 0, EXIT_X0 - PARK_X + 2, 0, 1]);
road(EAST, RLANE + 1, 0, -1, RLANE + 1 - QROAD, 1, 0, 0);                   // east side, up to the quay road
road(MW + 6, YROAD, -1, 0, MW + 6 - WEST, 0, 1, 1);                         // yard road, west from the east gate
road(WEST, LROAD + 1, 0, -1, LROAD - RLANE, 1, 0, 0);                       // west side, up from the lot road to the tractors' lane
road(EAST + 1, LROAD, -1, 0, EAST + 1 - WEST, 0, 1, 1);                     // lot road, west
road(EAST, MH + 5, 0, -1, MH + 5 - LROAD, 1, 0, 0);                         // in from the southeast gate, up to the lot road
// the back road: off the west end of the yard road, down, east along the south fence and up the east end onto the yard road
const BACK = MH - 2;
add(WEST, YROAD, WEST - 1, YROAD); add(WEST, YROAD + 1, WEST - 1, YROAD + 1);
for (let j = YROAD; j < BACK; j++) add(WEST - 1, j, WEST - 1, j + 1);
for (let x = WEST - 1; x < EAST + 2; x++) add(x, BACK, x + 1, BACK);
for (let j = BACK; j > YROAD; j--) add(EAST + 2, j, EAST + 2, j - 1);
// (owner, 2026-11-01) a street north beside every storage area (east of it, one lane) from the yard road to the quay road
const UP_STREETS = BLOCKS.map((b) => b.x + b.w);
for (const c of UP_STREETS) for (let j = YROAD; j > QROAD + 1; j--) add(c, j, c, j - 1);
// each berth's lanes: in up its east column, west along the three lanes; the auto and manual lanes end under the crane,
// where a loaded tractor pulls out into the middle lane, which runs on to the exit column and down to the quay road
for (const b of BERTHS) {
  const { ex, ox } = b, hx = b.x + 5;
  add(ox, QROAD, ox, 11); add(ox, 11, ox, 10); add(ox, 10, ox, 9);
  for (let x = ox; x > ex; x--) add(x, PASS_ROW, x - 1, PASS_ROW);
  for (const l of b.lanes) { for (let x = ox; x > hx; x--) add(x, l.r, x - 1, l.r); add(hx, l.r, hx - 1, PASS_ROW); }
  add(ex, PASS_ROW, ex, 11); add(ex, 11, ex, QROAD);
  for (const r of LANE_ROWS) for (let x = ex; x <= ox; x++) SPOT.set(key(x, r), "B" + b.id);
}
// (owner, 2026-11-01) RTG bays both ways: tractors in from the tractors' lane above and out the bottom; other trucks in
// from the yard road below and out the top, across the tractors' lane onto the exit lane
for (const b of BLOCKS) for (const bay of b.bays) {
  for (let j = RLANE + 1; j < YROAD; j++) only(bay.i, j, bay.i, j + 1, "y");
  for (let j = YROAD; j > RLANE; j--) only(bay.i, j, bay.i, j - 1, "c");
  for (let j = BAY0; j < YROAD; j++) SPOT.set(key(bay.i, j), "Y" + bay.i);
}
// (owner, 2026-11-01) stalls: in from the lot road below, out the top onto the yard road
for (const s of STALLS) { for (let j = LROAD; j > YROAD + 1; j--) add(s.i, j, s.i, j - 1); for (let j = LOT0; j < LROAD; j++) SPOT.set(key(s.i, j), "S" + s.i); }
const ROADSET = new Set(); for (const [k, l] of E) { ROADSET.add(k); for (const n of l) ROADSET.add(n); }
// (bug 2026-11-01) where roads cross: a truck only drives in with room beyond to clear it
const BOX = new Set();
for (const c of UP_STREETS) for (const j of [RLANE, RLANE + 1]) BOX.add(key(c, j));
// the top of a bay is one only for a truck driving out of it across the tractors' lane
const BAYTOP = new Set(); for (const b of BLOCKS) for (const bay of b.bays) BAYTOP.add(key(bay.i, RLANE + 1));
for (const x of [WEST, ...LANES]) for (const c of [x, x + 1]) if (c <= EXIT_X0) BOX.add(key(c, RLANE));
for (const c of [PARK_X + 4, PARK_X + 5, PARK_X - 2, PARK_X - 1]) BOX.add(key(c, RLANE));
for (const c of [EAST, EAST + 1]) BOX.add(key(c, BACK));
// cheapest way there: a lane change costs a bit more than a step, the passing lane a little more than the travel lane;
// avoid(k) rules tiles out (passing)
const PERF = { routes: 0 };
// (perf 2026-11-01) the road graph as numbered nodes, built once, so routing doesn't hash strings
let G = null;
function graph() {
  if (G) return G;
  const nodes = [...ROADSET], id = new Map(nodes.map((k, i) => [k, i]));
  const adj = nodes.map((k) => (E.get(k) || []).map((n) => id.get(n)));
  const cost = nodes.map((k, i) => adj[i].map((j) => (CHG.has(k + ">" + nodes[j]) ? 1.3 : 1) + (SLOW.has(nodes[j]) ? 0.3 : 0)));
  const spot = nodes.map((k) => SPOT.get(k) || null);
  const ek = nodes.map((k, i) => adj[i].map((j) => ({ y: 1, c: 2 })[EK.get(k + ">" + nodes[j])] || 0));
  G = { nodes, id, adj, cost, spot, ek, dist: new Float64Array(nodes.length), prev: new Int32Array(nodes.length), seen: new Uint32Array(nodes.length), gen: 0 };
  return G;
}
function route(fromK, toK, avoid, yard) {
  PERF.routes++;
  const g = graph(), from = g.id.get(fromK), to = g.id.get(toK); if (from === undefined || to === undefined) return null;
  const gen = ++g.gen, ts = g.spot[to], dist = g.dist, prev = g.prev, seen = g.seen, h = [];
  const push = (d, i) => { h.push(d, i); let c = h.length / 2 - 1; while (c > 0) { const p = (c - 1) >> 1; if (h[2 * p] <= h[2 * c]) break; [h[2 * p], h[2 * c]] = [h[2 * c], h[2 * p]]; [h[2 * p + 1], h[2 * c + 1]] = [h[2 * c + 1], h[2 * p + 1]]; c = p; } };
  const pop = () => { const d = h[0], i = h[1], ld = h[h.length - 2], li = h[h.length - 1]; h.length -= 2; if (h.length) { h[0] = ld; h[1] = li; let c = 0; const n = h.length / 2; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < n && h[2 * l] < h[2 * m]) m = l; if (r < n && h[2 * r] < h[2 * m]) m = r; if (m === c) break; [h[2 * m], h[2 * c]] = [h[2 * c], h[2 * m]]; [h[2 * m + 1], h[2 * c + 1]] = [h[2 * c + 1], h[2 * m + 1]]; c = m; } } return [d, i]; };
  seen[from] = gen; dist[from] = 0; prev[from] = -1; push(0, from);
  while (h.length) {
    const [d, k] = pop(); if (d > dist[k]) continue; if (k === to) break;
    const cs = g.spot[k], adj = g.adj[k], cost = g.cost[k], ek = g.ek[k];
    for (let e = 0; e < adj.length; e++) {
      const n = adj[e], ns = g.spot[n]; if (ns && ns !== cs && ns !== ts) continue;
      if (ek[e] && (ek[e] === 1) !== !!yard) continue;
      if (avoid && n !== to && avoid(g.nodes[n])) continue;
      const nd = d + cost[e];
      if (seen[n] !== gen || nd < dist[n]) { seen[n] = gen; dist[n] = nd; prev[n] = k; push(nd, n); }
    }
  }
  if (seen[to] !== gen) return null;
  const out = []; for (let k = to; k !== from; k = prev[k]) out.push(g.nodes[k]); out.reverse();
  out.cost = dist[to]; return out;
}

// ---- stacks ----
const count = (b) => b.slots.reduce((a, col) => a + col.reduce((s, st) => s + st.length, 0), 0);
// (owner) every container is its own: { id, c (color), wantedBy (the customer truck that came for it) }
let boxSeq = 0;
const box = (c) => ({ id: ++boxSeq, c, wantedBy: null });
const holds = (b, x) => b.slots.some((col) => col.some((st) => st.includes(x)));
const free = (b) => b.cols * b.rows * 3 - count(b);
const shipCount = (s) => s.bays.reduce((a, st) => a + impCount(st), 0);   // import containers aboard
// a ship slot holds imports or exports, never both (exports only go into slots with no imports)
const impCount = (st) => (st.length && !st[0].exp ? st.length : 0);
let STACK_VER = 1;   // (perf) bumped whenever any stack changes, so cached drawings know to redraw
for (const b of BLOCKS.slice(0, 1)) for (let n = 0; n < 14 + Math.floor(rnd() * 6); n++) { const c = Math.floor(rnd() * b.cols), r = Math.floor(rnd() * b.rows); if (b.slots[c][r].length < 3) b.slots[c][r].push(box(randColor())); }

// ---- ships ----
const HULLS = ["#5a6a7a", "#7a3a3a", "#3a5a4a", "#4a4a6a", "#6a5a3a"];
// (owner, 2026-11-01) small, medium and large ships: slot columns from the west end x deck rows nearest the quay; each
// has until its timer runs out (counting once docked) to be unloaded, then sails with whatever is left
const SIZES = [{ name: "small", cols: 6, rows: 3, w: 0.35 }, { name: "medium", cols: 10, rows: 4, w: 0.4 }, { name: "large", cols: 14, rows: 5, w: 0.25 }];
const onDeck = (s, k) => { const q = shipSlot(k); return q.c < s.cols && q.r >= DOCK.rows - s.rows; };
function newShip() {
  let u = rnd(), z = SIZES[0]; for (const q of SIZES) { if (u < q.w) { z = q; break; } u -= q.w; }
  const s = { off: -60 * T, state: "arrive", size: z.name, cols: z.cols, rows: z.rows, hull: pick(HULLS), bays: Array.from({ length: DOCK.cols * DOCK.rows }, () => []), claims: Array(DOCK.cols * DOCK.rows).fill(0) };   // (owner) 3 x 1 horizontal slots
  s.bays.forEach((st, k) => { if (!onDeck(s, k)) return; const n = Math.floor(rnd() * 4); for (let q = 0; q < n; q++) st.push(box(randColor())); });
  s.time = SHIP_TIME_BASE + SHIP_TIME_PER * shipCount(s); STACK_VER++;
  DOCK.ship = s; return s;
}
const SHIP_TIME_BASE = 90, SHIP_TIME_PER = 8;
// (owner) time's up: no new pickups can be assigned, but the ones already assigned (queued too) are finished; then it
// sails. Then any crane trips left are called off (with the RTG trips that would have nothing to deliver), and customers
// waiting for a container still aboard leave without it.
function shipGone(s) {
  for (const t of trucks) {
    if (t.kind === "yard") {
      if (t.cmd && t.cmd.kind === "sts" && !t.locked) { claim(t, t.cmd, -1); t.cmd = null; t.path = t.next ? [t.next] : []; }
      // (bug 2026-11-01) walk the queue by what the tractor will be carrying: crane trips go; a drop-off of an import stays
      // (an export's waits for the next ship); an import RTG trip stays only with an import to drop, an export pickup only
      // empty-handed
      let l = t.load ? (t.load.exp ? "exp" : "imp") : null; if (t.cmd && t.cmd.kind === "rtg") l = t.kind === "yard" && t.cmd.pickup ? "exp" : null;
      t.queue = t.queue.filter((a) => {
        let keep = true;
        if (a.kind === "sts") keep = false;
        else if (a.kind === "deliver") { if (l === "imp") l = null; }
        else if (a.kind === "rtg") { if (a.pickup) { keep = l === null; if (keep) l = "exp"; } else { keep = l === "imp"; if (keep) l = null; } }
        if (!keep) claim(t, a, -1);
        return keep;
      });
    } else if (!t.exiting && t.load === null && s.bays.some((st) => st.includes(t.want))) {
      if (t.cmd && t.cmd.kind === "park") t.cmd.stall.claim = null;
      if (t.stall && t.stall.claim === t) t.stall.claim = null;
      for (const a of t.queue) claim(t, a, -1);
      t.stall = null; t.cmd = null; t.queue = []; t.exiting = true; t.sad = 2.5; goTo(t, EXIT);
    }
  }
  BERTHS.forEach((b) => { b.promised = 0; });
}
const inReach = (s, b) => { const [c0, c1] = craneCols(b); return s.bays.some((st, k) => impCount(st) && k % DOCK.cols >= c0 && k % DOCK.cols < c1); };
const berthLeft = (b) => { const s = DOCK.ship; if (!s || s.state !== "docked" || !b.open) return 0; const [c0, c1] = craneCols(b); let n = 0; s.bays.forEach((st, k) => { const c = k % DOCK.cols; if (c >= c0 && c < c1) n += impCount(st); }); return n + (b.crane.hold2 ? 1 : 0) - b.promised; };
// room for exports in a crane's columns: slots with no imports, minus exports already on their way
// (bug 2026-11-01) an export is only picked up while a docked ship has room for it at a crane
const shipTakesExports = () => BERTHS.some((b) => exportRoom(b) > 0);
// (bug 2026-11-01) exports reserved in the export area, and exports on their way to a crane, are counted from the trips
// themselves (a running total drifted, which sent export tractors to park)
const trips = (f) => trucks.reduce((n, t) => n + (t.cmd && f(t.cmd) ? 1 : 0) + t.queue.filter(f).length, 0);
const expClaims = (b) => trips((a) => a.kind === "rtg" && a.pickup && a.block === b && !a.served);
const expPromised = (b) => trips((a) => a.kind === "sts" && a.exp && a.berth === b);
const exportRoom = (b) => { const s = DOCK.ship; if (!s || s.state !== "docked" || !b.open) return 0; const [c0, c1] = craneCols(b); let n = 0; s.bays.forEach((st, k) => { const c = k % DOCK.cols; if (c >= c0 && c < c1 && onDeck(s, k) && !impCount(st)) n += 3 - st.length; }); return n - expPromised(b); };
function shipStep(dt) {
  const s = DOCK.ship; if (!s) { DOCK.wait -= dt; if (DOCK.wait <= 0) newShip(); return; }
  if (s.state === "arrive") { s.off += Math.max(50, -s.off * 1.2) * dt; if (s.off >= 0) { s.off = 0; s.state = "docked"; } }
  else if (s.state === "docked") { s.time -= dt; if (!shipCount(s) && BERTHS.every((b) => !b.promised && !expPromised(b) && b.crane.hold === null && !b.crane.hold2)) { s.idle = (s.idle || 0) + dt; if (s.idle > 1.5) s.state = "depart"; } else if (s.time <= 0) s.state = "closing"; }
  else if (s.state === "closing") { if (BERTHS.every((b) => !b.crane.ops.length && b.crane.hold === null && !b.crane.hold2 && !b.crane.truck && (!b.promised || !b.open || !inReach(s, b)))) { shipGone(s); s.state = "depart"; } }
  else if (s.state === "depart") { s.off += (50 + s.off * 0.8) * dt; if (s.off > 64 * T) { DOCK.ship = null; DOCK.wait = 5 + rnd() * 5; } }
}

// ---- trucks: each holds the 4 tiles under it (and the next one while moving into it) ----
const occ = new Map();
let passes = 0, trucks = [], truckSeq = 0, custWait = 2, expWait = 6, delivered = 0, exported = 0, clock = 0;
function mkTruck(kind, tiles, want) { const t = { id: ++truckSeq, kind, tiles, next: null, p: 0, path: [], queue: [], cmd: null, load: null, want, locked: false, stall: null, gone: false }; for (const k of tiles) occ.set(k, t); trucks.push(t); return t; }
{ const p = PARK[0], t = mkTruck("yard", parkTiles(p)); t.num = 1; t.park = p; p.claim = t; }
const head = (t) => t.tiles[0];
const headIJ = (t) => unkey(t.tiles[0]);
function goTo(t, k) { const from = t.next || head(t); t.path = (t.next ? [t.next] : []).concat(route(from, k, null, t.kind === "yard") || []); }
// (owner, 2026-11-01) two kinds of customer truck. Grey ones (most) come for everyday cargo: any white, gray or black
// container. They park, and now and then (every 30–70 s with storage empty, much faster the more unclaimed containers
// are stored, a little faster with more stalls) the longest waiting takes the easiest-to-reach unclaimed one in storage;
// the cab stays grey. Colored ones come for a particular container of their cab's color, on the docked ship (anywhere in
// a slot's stack) or in storage: about a quarter of trucks, more the more of the unclaimed stored containers are colored,
// so colored ones don't pile up.
const coloredShare = () => { const st = storedFree(), c = st.filter((x) => !NEUTRAL.has(x.c)).length; return clamp(0.25 + 0.7 * c / (st.length + 1), 0.2, 0.8); };
// (owner) dynamic: low stacks, few trucks (time to fill); high stacks, many trucks (to empty them). The fuller storage is
// with containers nobody has claimed, the more customers come (a third of the base rate with none, over four times with
// it full), the more of them come grey, and the sooner grey ones pick. 0 with none unclaimed, 1 with every open storage
// area full of them.
const unclaimedFill = () => { const n = BLOCKS.filter((b) => b.open && !b.exp).length * 60; return n ? storedFree().length / n : 0; };
const storedFree = () => { const out = []; for (const b of BLOCKS) if (b.open && !b.exp) for (const col of b.slots) for (const st of col) for (const x of st) if (!x.wantedBy) out.push(x); return out; };
const shipFree = () => { const out = [], s = DOCK.ship; if (s && s.state === "docked") for (const st of s.bays) for (const x of st) if (!x.exp && !x.wantedBy) out.push(x); return out; };
// (owner, 2026-11-01) one whose container is already stored, with a bay of its RTG free, comes in at the east gate and
// drives straight there; any other comes in at the southeast gate and parks
const EAST_GATE = [1, 2, 3, 4].map((d) => key(MW + d, YROAD)), SE_GATE = [1, 2, 3, 4].map((d) => key(EAST + 1, MH + d));
function spawnCustomer() {
  const pool = rnd() < coloredShare() ? shipFree().concat(storedFree()).filter((x) => !NEUTRAL.has(x.c)) : [], want = pool.length ? pick(pool) : null;
  const b = want && BLOCKS.find((q) => q.open && holds(q, want)), bay = b && freeBay(b);
  if (bay) {
    if (EAST_GATE.some((k) => occ.has(k))) return;
    const t = mkTruck("cust", EAST_GATE.slice(), want); want.wantedBy = t; bay.claim = t; startCmd(t, { kind: "rtg", block: b, bay }); return;
  }
  const stall = STALLS.slice().reverse().find((s) => s.open && !s.claim); if (!stall) return;
  if (SE_GATE.some((k) => occ.has(k))) return;
  const t = mkTruck("cust", SE_GATE.slice(), want);
  if (want) want.wantedBy = t; else { t.generic = true; t.since = clock; }
  stall.claim = t; t.cmd = { kind: "park", stall }; goTo(t, key(stall.i, LOT0));
}
let claimWait = 20;
function claimStep(dt) {
  if ((claimWait -= dt) > 0) return;
  const t = trucks.filter((q) => q.kind === "cust" && !q.want && !q.exiting).sort((a, b) => a.since - b.since)[0];
  // the easiest everyday container to reach: the fewest on top of it (ties at random)
  let best = [], depth = 9;
  for (const b of BLOCKS) if (b.open && !b.exp) for (const col of b.slots) for (const st of col) st.forEach((x, i) => { if (!NEUTRAL.has(x.c) || x.wantedBy) return; const d = st.length - 1 - i; if (d < depth) { depth = d; best = [x]; } else if (d === depth) best.push(x); });
  if (!t || !best.length) { claimWait = 4; return; }
  t.want = pick(best); t.want.wantedBy = t;
  claimWait = (30 + rnd() * 40) / (1 + (STALLS.filter((q) => q.open).length - 4) / 32) / (0.6 + 10 * unclaimedFill());
}

// what a truck will carry once its queue is done: null, "imp" or "exp"
function loadAfter(t) { let l = t.load ? (t.load.exp ? "exp" : "imp") : null; for (const a of t.cmd ? [t.cmd, ...t.queue] : t.queue) l = a.kind === "deliver" ? null : a.kind === "sts" ? (a.pick === false ? null : "imp") : a.kind === "rtg" ? (t.kind === "cust" ? "imp" : a.pickup ? "exp" : null) : l; return l; }
// (owner) export trucks come in at the east gate with a container for the export area (when it's open, has room for one
// more and a bay free), drive into a bay from below, drop it and leave by the exit lane
function spawnExport() {
  const b = BLOCKS.find((q) => q.exp && q.open); if (!b) return;
  if (free(b) - trucks.filter((t) => t.kind === "exp" && t.load).length <= 0) return;
  const bay = freeBay(b); if (!bay || EAST_GATE.some((k) => occ.has(k))) return;
  const t = mkTruck("exp", EAST_GATE.slice(), null); t.load = box(randColor()); t.load.exp = true;
  bay.claim = t; startCmd(t, { kind: "rtg", block: b, bay });
}
function targetAt(i, j) {
  // (owner) a ship slot picks which one the crane takes from; the crane or its lanes leave it to the crane (the nearest)
  if (j >= DOCK.top && j < DOCK.top + DOCK.rows) { const c = Math.floor((i - DOCK.x) / CL); if (c < 0 || c >= DOCK.cols || !DOCK.ship || DOCK.ship.state !== "docked") return null; const k = (j - DOCK.top) * DOCK.cols + c; if (!onDeck(DOCK.ship, k)) return null; const b = BERTHS.find((q) => q.open && c >= craneCols(q)[0] && c < craneCols(q)[1]); return b ? { kind: "sts", berth: b, slot: k } : null; }
  if (j >= QUAY && j <= 11) for (const b of BERTHS) if (i >= b.ex && i <= b.ox) return b.open ? { kind: "sts", berth: b } : null;
  for (const b of BLOCKS) if (b.open && i >= b.x && i < b.x + b.w && j >= b.y && j < YROAD) return { kind: "rtg", block: b };
  if (j >= LOT0 && j < LROAD) { const s = STALLS.find((q) => q.i === i && q.open); if (s) return { kind: "park", stall: s }; }
  return null;
}
// (owner) a truck can only be sent where it can be served: an empty yard tractor to an STS with a ship to unload (or to
// a ship slot with a container not yet claimed), a loaded one to an RTG with room, a customer to the RTG holding its
// container, or (customers only) a free parking stall. Queued trips count first; a stall or ship slot is claimed at once,
// an RTG bay when one clears for the truck, an STS lane when the trip starts. The same RTG can be queued any number of
// times.
function planFor(t, i, j) {
  if (t.gone || t.exiting) return null;
  const g = targetAt(i, j); if (!g) return null;
  let la = loadAfter(t); const loaded = la !== null, acts = t.cmd ? [t.cmd, ...t.queue] : t.queue;
  if (t.kind === "cust" && acts.some((a) => a.kind === "rtg")) return null;
  if (g.kind === "park") return t.kind === "cust" && !g.stall.claim ? { kind: "park", stall: g.stall } : null;
  // (owner) a tractor can be given pickups one after another: if it would be carrying an import (or, for the export
  // area, anything), a drop-off step goes in first
  let first = false;
  if (t.kind === "yard" && la !== null && ((g.kind === "sts" && la === "imp") || (g.kind === "rtg" && g.block.exp))) { first = true; la = null; }
  const pre = (a) => { if (a && first) a.deliverFirst = true; return a; };
  if (g.kind === "sts") {
    const b = g.berth; if (t.kind !== "yard" || la === "imp") return null;
    const slotOk = g.slot !== undefined && impCount(DOCK.ship.bays[g.slot]) - DOCK.ship.claims[g.slot] > 0;
    if (la === "exp") { if (exportRoom(b) <= 0) return null; const a = { kind: "sts", berth: b, exp: true, pick: berthLeft(b) > 0 }; if (slotOk && a.pick) a.slot = g.slot; return a; }
    if (berthLeft(b) <= 0) return null; if (g.slot === undefined) return pre({ kind: "sts", berth: b }); return slotOk ? pre({ kind: "sts", berth: b, slot: g.slot }) : null;
  }
  const b = g.block;
  if (t.kind === "yard" && b.exp) return la === null && count(b) - expClaims(b) > 0 && shipTakesExports(t) ? pre({ kind: "rtg", block: b, pickup: true }) : null;
  if (t.kind === "yard") return la === "imp" && free(b) > 0 ? { kind: "rtg", block: b } : null;
  // (owner, 2026-11-01) a customer sent to an RTG drives into a bay of it from below: only with one free (claimed at once)
  const bay = !loaded && holds(b, t.want) && freeBay(b);
  return bay ? { kind: "rtg", block: b, bay } : null;
}
function claim(t, a, d) {
  if (a.kind === "sts") { if (a.pick !== false) a.berth.promised += d; if (a.slot !== undefined && DOCK.ship) DOCK.ship.claims[a.slot] += d; }
  else if (a.kind === "park") a.stall.claim = d > 0 ? t : null;
  else if (a.kind === "rtg" && a.bay && t.kind !== "yard") a.bay.claim = d > 0 ? t : null;
}
function enqueue(t, a) { if (a.deliverFirst) { delete a.deliverFirst; t.queue.push({ kind: "deliver" }); } claim(t, a, 1); t.queue.push(a); }
function unqueueLast(t) { const a = t.queue.pop(); if (a) claim(t, a, -1); if (t.queue.length && t.queue[t.queue.length - 1].kind === "deliver") t.queue.pop(); return !!a; }
// (owner) an RTG's 5 bays are one queue: a tractor heading there waits in line until a bay clears, first come first
// served, then takes it. (2026-11-01) The tractors' RTG lane is one lane, so the line is at the foot of the lane down
// just west of the area, where others can pass it.
const lineKey = (b) => key(b.x - 2, RLANE - 1);
// tractors stop at the bottom of a bay facing south, other trucks at the top facing north
const targetKey = (a, t) => (a.kind === "tpark" ? key(PARK_X, a.spot.j) : a.lane ? laneSpot(t) : a.kind === "rtg" ? (a.bay ? key(a.bay.i, t.kind === "yard" ? BAY0 + 3 : BAY0) : lineKey(a.block)) : key(a.stall.i, LOT0));
const bayTiles = (bay) => [0, 1, 2, 3].map((d) => key(bay.i, BAY0 + d));
const freeBay = (b) => b.bays.find((bay) => !bay.claim && !bayTiles(bay).some((k) => occ.has(k)));
// (2026-11-01) bays work both ways, so a bay is held until the truck it's for has driven all the way out of it (or
// stopped heading there)
function freeBays() {
  for (const b of BLOCKS) for (const bay of b.bays) {
    const t = bay.claim; if (!t) continue;
    const going = !t.gone && ((t.cmd && t.cmd.bay === bay) || t.queue.some((a) => a.bay === bay));
    const inside = !t.gone && t.tiles.concat(t.next ? [t.next] : []).some((k) => { const [i, j] = unkey(k); return i === bay.i && j >= BAY0 && j < YROAD; });
    if (!going && !inside) bay.claim = null;
  }
}
const inLine = (t, b) => t.cmd && t.cmd.kind === "rtg" && !t.cmd.bay && (!b || t.cmd.block === b);
// (stress test 2026-11-01) at most 3 tractors on their way to an RTG's line at once (what the lane holds without backing
// onto the quay road); the rest wait in the tractor parking
const LINE_MAX = 3;
const lineFull = (b, t) => trucks.filter((q) => q !== t && q.kind === "yard" && inLine(q, b)).length >= LINE_MAX && !freeBay(b);
function fillBays() {
  for (const b of BLOCKS) {
    if (!b.open) continue;
    for (const bay of b.bays) {
      if (bay.claim) continue;
      // (bug 2026-11-01) only to a truck that has reached the line (or nearly): a bay held for one still stuck in traffic
      // behind the line could lock it all up
      // (2026-11-01) at the line, or just coming along the tractors' lane toward the bays
      const near = (q) => { const [i, j] = headIJ(q); return j === RLANE + 1 && i < b.x && i >= b.x - 8 ? b.x - i : q.path.length; };
      let t = null; for (const q of trucks) if (q.kind === "yard" && inLine(q, b) && !q.locked && near(q) <= 6 && (!t || near(q) < near(t))) t = q;
      if (!t) break;
      bay.claim = t; t.cmd.bay = bay; goTo(t, key(bay.i, BAY0 + 3));
    }
  }
}
// start a trip: an STS trip (or a wait at a berth) takes one of its free lanes — the one the tractor is already in, if any
function startCmd(t, a) {
  if (a.kind === "sts" || a.kind === "wait") {
    const lane = laneFor(a.berth, t);
    if (lane !== t.lane && lane.q.length >= LANE_DEEP) return false;
    if (t.lane !== lane) { leaveLane(t); lane.q.push(t); }
    t.lane = lane; a.lane = lane;
  } else if (a.kind === "rtg" && t.kind === "yard" && !a.bay && lineFull(a.block, t)) return false;
  else leaveLane(t);
  t.bay = null;
  if (t.park && !(a.kind === "tpark" && a.spot === t.park)) { if (t.park.claim === t) t.park.claim = null; t.park = null; }
  if (t.stall && t.stall.claim === t && !(a.kind === "park" && a.stall === t.stall)) t.stall.claim = null;
  t.stall = null; t.cmd = a; goTo(t, targetKey(a, t));
  return true;
}
// (owner) a customer truck whose container is in a storage area goes to that RTG by itself, from its stall: (2026-11-01)
// the stall is its place in line, so it sets off once a bay there is free
function custStep(t) {
  if (t.kind !== "cust" || t.exiting || t.load !== null || t.queue.length || t.cmd || !t.stall || t.next) return;
  const b = BLOCKS.find((q) => q.open && holds(q, t.want)); if (!b) return;
  const bay = freeBay(b); if (!bay) return;
  bay.claim = t; startCmd(t, { kind: "rtg", block: b, bay });
}
// (owner) a tractor with nothing to do drives to a free tractor parking spot (the nearest to the top first) and parks;
// sent somewhere on the way, it gives the spot up
// can the first queued step start now? (a drop-off needs somewhere to go; a crane trip a free spot in its line and a
// ship to work)
function canStart(t) {
  const a = t.queue[0]; if (!a) return false;
  if (a.kind === "deliver") return !t.load || !!deliverAction(t, false);
  if (a.kind === "sts") { const s = DOCK.ship, l = laneFor(a.berth, t); return !!s && (s.state === "docked" || s.state === "closing") && (t.lane === l || l.q.length < LANE_DEEP); }
  if (a.kind === "rtg" && !a.bay) return !lineFull(a.block, t);
  return true;
}
function idleStep(t) {
  if (t.kind !== "yard" || t.next || t.locked) return;
  const ready = canStart(t);
  if (t.cmd && t.cmd.kind === "tpark" && ready) { t.cmd.spot.claim = null; t.cmd = null; return; }
  if (t.cmd || ready || t.park) return;   // (bug 2026-11-01) a tractor whose next step can't start yet waits in the parking
  // (2026-11-01) the nearer of the two blocks' first free spots
  const cands = [PARK.find((q) => !q.claim && !q.low), PARK.find((q) => !q.claim && q.low)].filter(Boolean); if (!cands.length) return;
  let p = cands[0], best = Infinity;
  for (const q of cands) { const r = route(t.next || head(t), key(PARK_X, q.j), null, true), c = r ? r.cost : Infinity; if (c < best) { best = c; p = q; } }
  p.claim = t; startCmd(t, { kind: "tpark", spot: p });
}
// (owner) an auto tractor with an RTG assigned: loaded, it takes the container there (when its area has room); empty, it
// fetches from the ship: a container a customer is waiting for if one is in reach and unclaimed, otherwise whatever its
// crane takes (the crane with the most left). It works through anything queued first, and parks when there's nothing.
function autoStep(t) {
  if (!t.auto || !t.home || t.load || t.cmd || t.next || t.queue.length || t.locked) return;
  const s = DOCK.ship, room = (b) => laneFor(b, t).q.length < LANE_DEEP;
  // assigned to the export area: fetch an export
  if (t.home.exp) { if (t.home.open && count(t.home) - expClaims(t.home) > 0 && shipTakesExports(t)) enqueue(t, { kind: "rtg", block: t.home, pickup: true }); return; }
  const bs = BERTHS.filter((b) => berthLeft(b) > 0 && room(b)); if (!bs.length) return;
  for (const b of bs) { const [c0, c1] = craneCols(b); for (let k = 0; k < s.bays.length; k++) { const st = s.bays[k], x = st.find((q) => q.wantedBy), c = k % DOCK.cols; if (x && !x.exp && c >= c0 && c < c1 && impCount(st) - s.claims[k] > 0 && !BERTHS.some((q) => q.crane.slot === k)) { enqueue(t, { kind: "sts", berth: b, slot: k }); return; } } }
  enqueue(t, { kind: "sts", berth: bs.reduce((m, b) => (berthLeft(b) > berthLeft(m) ? b : m)) });
}
// (owner) any loaded tractor with nothing queued takes its container where it goes by itself: an import to a storage
// area with room (an auto tractor's own RTG, otherwise the nearest), an export into a crane's line (one with room for it
// on the ship, preferring one that can hand back an import)
// where a loaded tractor's container goes right now (pick: whether a crane taking an export may hand back an import)
function deliverAction(t, pick) {
  if (t.load.exp) { const bs = BERTHS.filter((b) => exportRoom(b) > 0 && laneFor(b, t).q.length < LANE_DEEP); if (!bs.length) return null; const b = bs.find((q) => berthLeft(q) > 0) || bs[0]; return { kind: "sts", berth: b, exp: true, pick: pick && berthLeft(b) > 0 }; }
  const hx = headIJ(t)[0], own = t.auto && t.home && !t.home.exp && t.home.open && free(t.home) > 0 ? t.home : null;
  const dest = own || (t.auto && t.home && !t.home.exp ? null : BLOCKS.filter((b) => b.open && !b.exp && free(b) > 0 && !lineFull(b, t)).reduce((m, b) => (!m || Math.abs(b.x + 2 - hx) < Math.abs(m.x + 2 - hx) ? b : m), null));
  return dest ? { kind: "rtg", block: dest } : null;
}
function deliverStep(t) {
  if (t.kind !== "yard" || !t.load || t.cmd || t.next || t.queue.length || t.locked) return;
  const a = deliverAction(t, true); if (a) enqueue(t, a);
}

// (bug 2026-11-01) a tractor's RTG trip is called off when it has nothing to deliver, or its storage area has filled up
// meanwhile; it goes to park and takes new orders
function dropTrip(t) {
  t.cmd = null; t.path = t.next ? [t.next] : [];
}
// room to clear a crossing: the tiles beyond it free for a truck's length, and (2026-11-01) past any crossing just
// beyond it too, so its tail is never left standing in one. A truck driving in keeps those tiles for itself until it's
// clear of the crossing, so nobody cuts in.
const RESV = new Map();
const mine = (k, t) => { const q = occ.get(k), r = RESV.get(k); return (!q || q === t) && (!r || r === t); };
function boxClear(t) {
  let need = TL; const ks = [];
  for (let i = 1; i <= need; i++) { const k = t.path[i]; if (k === undefined) break; if (!mine(k, t)) return false; ks.push(k); if (BOX.has(k)) need = i + TL; }
  t.resv = (t.resv || []).concat(ks); for (const k of ks) RESV.set(k, t);
  return true;
}
function unreserve(t, all) {
  if (!t.resv || !t.resv.length) return;
  if (all || (!t.tiles.some((k) => BOX.has(k) || BAYTOP.has(k)) && !(t.next && (BOX.has(t.next) || BAYTOP.has(t.next))))) { for (const k of t.resv) if (RESV.get(k) === t) RESV.delete(k); t.resv = []; }
}
function truckStep(t, dt) {
  if (t.locked) return;
  if (t.kind === "yard" && t.cmd && t.cmd.kind === "sts" && t.load && !t.load.exp && !t.next) { const a = t.cmd; delete a.lane; leaveLane(t); t.cmd = null; t.path = []; t.queue.unshift({ kind: "deliver" }, a); }
  if (t.kind === "yard" && t.cmd && t.cmd.kind === "rtg" && (t.cmd.pickup ? t.load !== null : t.load === null || t.load.exp || free(t.cmd.block) <= 0)) dropTrip(t);
  custStep(t);
  // start the next queued trip once the current one is done
  if (!t.cmd && !t.next) {
    deliverStep(t); autoStep(t);
    // (owner) a queued "drop it off" step becomes a trip to wherever the container goes now (skipped if empty)
    while (t.queue.length && t.queue[0].kind === "deliver") { if (!t.load) { t.queue.shift(); continue; } const a = deliverAction(t, t.queue.length === 1); if (!a) break; claim(t, a, 1); t.queue[0] = a; }
    if (t.queue.length && t.queue[0].kind !== "deliver" && startCmd(t, t.queue[0])) t.queue.shift();
  }
  idleStep(t);
  // in an STS lane's line: move up as the ones ahead leave
  if (t.lane && t.cmd && t.cmd.kind === "sts" && !t.next) { const k = laneSpot(t); if (head(t) !== k && t.path[t.path.length - 1] !== k) goTo(t, k); }
  // traffic: move into the next tile only when no other truck holds it
  if (!t.next && t.path.length) {
    const n = t.path[0], o = occ.get(n), bs = CHG.get(head(t) + ">" + n), ob = bs && occ.get(bs);
    const box = (BOX.has(n) || (BAYTOP.has(n) && t.kind !== "yard")) && !BOX.has(head(t));
    if (mine(n, t) && (!bs || mine(bs, t)) && (!box || boxClear(t))) { occ.set(n, t); t.next = n; t.p = 0; t.blocked = 0; }
    else if ((t.blocked = (t.blocked || 0) + dt) > (t.patience || (t.patience = 0.5 + rnd()))) {   // staggered, so held-up trucks don't all re-plan at once
      t.blocked = 0;
      if (o && o !== t) { if (!o.next) pass(t); }
      else { const r = route(head(t), t.path[t.path.length - 1], (k) => k === n, t.kind === "yard"); if (r && r.length) t.path = r; }   // (bug) two side by side each changing into the other's lane: carry straight on instead
    }
  }
  if (t.next) {
    t.p += 4 * dt;
    if (t.p >= 1) {
      t.tiles.unshift(t.next); const tail = t.tiles.pop(); if (occ.get(tail) === t) occ.delete(tail);
      if (RESV.get(t.next) === t) RESV.delete(t.next); unreserve(t, false);
      t.next = null; t.p = 0; t.path.shift();
      if (t.exiting && !t.path.length) { unreserve(t, true); for (const k of t.tiles) if (occ.get(k) === t) occ.delete(k); t.gone = true; trucks.splice(trucks.indexOf(t), 1); return; }
      if (!t.path.length && t.cmd && t.cmd.kind === "park") { t.stall = t.cmd.stall; t.cmd = null; }
      else if (!t.path.length && t.cmd && t.cmd.kind === "tpark") { t.park = t.cmd.spot; t.cmd = null; }
      else if (!t.path.length && t.cmd && t.cmd.kind === "wait") t.cmd = null;
    }
  }
}
// (owner) held up by a stopped truck: take the other lane round it, if that isn't much longer
function pass(t) {
  const o = occ.get(t.path[0]); if (o && inLine(o) && inLine(t, o.cmd.block)) return;   // no jumping the RTG line
  const goal = t.path[t.path.length - 1], now = route(head(t), goal, null, t.kind === "yard"); if (!now) return;
  const r = route(head(t), goal, (k) => { const o = occ.get(k); return o && o !== t && !o.next; }, t.kind === "yard");
  if (r && r.length && r[0] !== t.path[0] && r.cost <= now.cost + 8) { t.path = r; passes++; }
}
function doneServing(t) {
  const a = t.cmd; t.cmd = null; t.locked = false;
  if (a && a.kind === "rtg") t.bay = a.bay;   // a bay is let go once the truck has driven out of it (freeBays)
  if (t.queue.length) return;
  if (t.kind === "exp") { t.exiting = true; goTo(t, EXIT); }
  if (t.kind === "cust") { t.happy = 1.8; t.exiting = true; delivered++; money += INCOME; const tr = trailerOf(t); floats.push({ x: tr.x, y: tr.y - 20, t: 1.6, text: "+$" + INCOME }); goTo(t, EXIT); }
}

// ---- truck shape: a cab and a trailer bending along the tiles it holds ----
function chainOf(t) {
  const c = (k) => { const [i, j] = unkey(k); return [(i + 0.5) * T, (j + 0.5) * T]; };
  const pts = []; const h0 = c(t.tiles[0]);
  if (t.next) { const n = c(t.next); pts.push([h0[0] + (n[0] - h0[0]) * t.p, h0[1] + (n[1] - h0[1]) * t.p]); }
  for (const k of t.tiles) { const p = c(k); const l = pts[pts.length - 1]; if (!l || hyp(l[0] - p[0], l[1] - p[1]) > 0.01) pts.push(p); }
  return pts;
}
function pointAt(pts, s) {
  s *= T;
  if (pts.length < 2) return pts[0];
  if (s <= 0) { const [a, b] = pts, d = hyp(a[0] - b[0], a[1] - b[1]) || 1; return [a[0] + (a[0] - b[0]) / d * -s, a[1] + (a[1] - b[1]) / d * -s]; }
  for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1], d = hyp(b[0] - a[0], b[1] - a[1]); if (s <= d) return [a[0] + (b[0] - a[0]) * s / d, a[1] + (b[1] - a[1]) * s / d]; s -= d; }
  const a = pts[pts.length - 2], b = pts[pts.length - 1], d = hyp(b[0] - a[0], b[1] - a[1]) || 1; return [b[0] + (b[0] - a[0]) / d * s, b[1] + (b[1] - a[1]) / d * s];
}
function shapeOf(t) { const p = chainOf(t); return { front: pointAt(p, -0.45), cabBack: pointAt(p, 0.5), trFront: pointAt(p, 0.62), trBack: pointAt(p, 3.45) }; }
function trailerOf(t) { const s = shapeOf(t); return { x: (s.trFront[0] + s.trBack[0]) / 2, y: (s.trFront[1] + s.trBack[1]) / 2, a: Math.atan2(s.trFront[1] - s.trBack[1], s.trFront[0] - s.trBack[0]) }; }

// ---- cranes: a list of moves and lifts, played in order ----
const CRANE_SP = 145, CRANE_ACC = 420, LIFT = 0.6;
function craneStep(cr, dt, onDone) {
  const op = cr.ops[0]; if (!op) return;
  // (art) it speeds up and brakes instead of starting and stopping dead
  if (op.to) {
    const [tx, ty] = typeof op.to === "function" ? op.to() : op.to, dx = tx - cr.x, dy = ty - cr.y, d = hyp(dx, dy);
    cr.v = Math.min(CRANE_SP, (cr.v || 0) + CRANE_ACC * dt, Math.sqrt(2 * CRANE_ACC * d) + 12); const sp = cr.v * dt;
    if (d <= sp || d < 0.5) { cr.x = tx; cr.y = ty; cr.v = d < 0.5 ? cr.v : cr.v * 0.5; cr.ops.shift(); if (!cr.ops.length) { cr.v = 0; onDone(); } } else { cr.x += dx / d * sp; cr.y += dy / d * sp; }
    return;
  }
  cr.v = 0;
  // (art) the spreader goes down, grabs or lets go at the bottom, and comes back up
  op.t = (op.t || 0) + dt; const ph = Math.min(1, op.t / LIFT); cr.hoist = ph < 0.5 ? ph * 2 : (1 - ph) * 2;
  if (ph >= 0.5 && !op.done) {
    op.done = true; STACK_VER++;
    // (owner) an STS crane can hold a second container (hold2)
    if (op.lift) { const s = op.lift, x = s.stack ? s.stack.pop() : s.truck.load; if (!s.stack) s.truck.load = null; if (s.second) cr.hold2 = x; else cr.hold = x; if (op.then) op.then(); }
    else if (op.lower) { const s = op.lower, x = s.second ? cr.hold2 : cr.hold; if (s.stack) s.stack.push(x); else s.truck.load = x; if (s.second) cr.hold2 = null; else cr.hold = null; if (op.then) op.then(); }
  }
  if (ph < 1) return;
  cr.hoist = 0; cr.ops.shift(); if (!cr.ops.length) onDone();
}
// STS: the front-most empty tractor standing in its line gets the nearest container (two at once with two waiting)
// (owner) a tractor bringing an export: the crane lifts it off onto the ship (a slot with no imports, nearest first; it
// pays then) and on the way back takes an import for the same tractor, so no trip is empty. Tractors bringing exports
// are served first.
function stsStep(b, dt) {
  const cr = b.crane, s = DOCK.ship;
  if (!cr.ops.length && !cr.truck && s && (s.state === "docked" || s.state === "closing") && (berthLeft(b) + b.promised > 0 || expPromised(b) > 0)) {
    const waiting = trucks.filter((q) => q.cmd && q.cmd.kind === "sts" && q.cmd.berth === b && (q.load === null || q.load.exp) && !q.next && !q.locked && q.lane && head(q) === laneHead(q.lane));
    let t = null, ti = 1e9;
    for (const q of waiting) { const d = Math.abs(q.lane.r + 0.5 - cr.y / T) - (q.load ? 100 : 0); if (d > ti) continue; ti = d; t = q; }
    if (t) {
      const a = t.cmd, ly = (t.lane.r + 0.5) * T, [c0, c1] = craneCols(b), ops = [];
      const sx = (k) => (DOCK.x + shipSlot(k).c * CL + 1.5) * T, sy = (k) => (DOCK.top + shipSlot(k).r + 0.5) * T;
      // the slot an import pickup takes from: its own slot if it has one and it still holds an import, else the nearest
      // with an import nobody has claimed (used: a slot already being taken from once in this lift)
      const slotFor = (q, refX, used) => { const sl = q.cmd.slot; if (sl !== undefined && impCount(s.bays[sl]) - (sl === used ? 1 : 0) > 0) return sl; let best = -1, bd = 1e9; s.bays.forEach((st, k) => { const c = k % DOCK.cols; if (impCount(st) - s.claims[k] - (k === used ? 1 : 0) > 0 && c >= c0 && c < c1) { const d = Math.abs(sx(k) - refX) + (DOCK.rows - shipSlot(k).r) * 8; if (d < bd) { bd = d; best = k; } } }); return best; };
      const take = (q) => { const sl = q.cmd.slot; if (sl !== undefined) { s.claims[sl] = Math.max(0, s.claims[sl] - 1); delete q.cmd.slot; } };
      // (owner) each tractor drives off the moment it's done with: loaded, or (an export with nothing to take back) lifted off
      const rel = (q, picked) => () => { if (picked) b.promised = Math.max(0, b.promised - 1); if (cr.truck === q) cr.truck = null; if (cr.truck2 === q) cr.truck2 = null; doneServing(q); };
      let refX = trailerOf(t).x, placed = !t.load, liftOff = null;
      if (t.load) {
        let es = -1, ed = 1e9;
        s.bays.forEach((st, k) => { const q = shipSlot(k); if (!onDeck(s, k) || q.c < c0 || q.c >= c1 || st.length >= 3 || impCount(st)) return; const d = Math.abs(sx(k) - refX) + (DOCK.rows - q.r) * 8; if (d < ed) { ed = d; es = k; } });
        a.exp = false;
        if (es >= 0) { placed = true; liftOff = { lift: { truck: t } }; ops.push({ to: () => [trailerOf(t).x, ly] }, liftOff, { to: [sx(es), sy(es)] }, { lower: { stack: s.bays[es] }, then: () => { money += INCOME; exported++; floats.push({ x: sx(es), y: sy(es) - 20, t: 1.6, text: "+$" + INCOME }); } }); refX = sx(es); }
      }
      let best = -1, t2 = null, best2 = -1, spare = false, extra = -1;
      if (a.pick !== false) {
        if (placed && cr.hold2 && a.slot === undefined) spare = true;   // hand over the one it's holding
        else { if (placed) best = slotFor(t, refX, -1); take(t); if (best < 0) b.promised = Math.max(0, b.promised - 1); }
      }
      if (spare) { ops.push({ to: () => [trailerOf(t).x, ly] }, { lower: { truck: t, second: true }, then: rel(t, true) }); t.locked = true; cr.truck = t; cr.ops = ops; }
      // (owner) holding two: with an empty tractor at the front of the other line too, lift one for each in the same trip;
      // otherwise, with more pickups on their way, lift a spare to hold for the next tractor
      if (!spare && best >= 0 && !ops.length && !cr.hold2) {
        for (const q of waiting) { if (q === t || q.load !== null || q.cmd.pick === false) continue; const k = slotFor(q, sx(best), best); if (k >= 0) { t2 = q; best2 = k; take(q); break; } }
      }
      if (!spare && best >= 0 && !t2 && !cr.hold2 && coming(b, t)) { let bd = 1e9; s.bays.forEach((st, k) => { const c = k % DOCK.cols; if (impCount(st) - s.claims[k] - (k === best ? 1 : 0) > 0 && c >= c0 && c < c1) { const d = Math.abs(sx(k) - sx(best)) + (DOCK.rows - shipSlot(k).r) * 8; if (d < bd) { bd = d; extra = k; } } }); }
      if (!spare && best < 0 && liftOff) liftOff.then = rel(t, false);
      if (!spare && best >= 0) {
        cr.slot = best; cr.slot2 = t2 ? best2 : undefined;
        ops.push(...(ops.length ? [] : [{ to: [sx(best), cr.y] }]), { to: [sx(best), sy(best)] }, { lift: { stack: s.bays[best] } });
        if (t2) { if (best2 !== best) ops.push({ to: [sx(best2), sy(best2)] }); ops.push({ lift: { stack: s.bays[best2], second: true } }); }
        else if (extra >= 0) { if (extra !== best) ops.push({ to: [sx(extra), sy(extra)] }); ops.push({ lift: { stack: s.bays[extra], second: true } }); }
        ops.push({ to: () => [cr.x, ly] }, { to: () => [trailerOf(t).x, ly] }, { lower: { truck: t }, then: rel(t, true) });
        if (t2) { const ly2 = (t2.lane.r + 0.5) * T; ops.push({ to: () => [trailerOf(t2).x, ly2] }, { lower: { truck: t2, second: true }, then: rel(t2, true) }); }
      }
      if (spare) { /* under way */ } else if (ops.length) { t.locked = true; cr.truck = t; if (t2) { t2.locked = true; cr.truck2 = t2; } cr.ops = ops; } else doneServing(t);
    }
  }
  // idle: with pickups on their way, lift a spare to hold ready; with none, put back a spare it's holding; otherwise
  // (owner) dig out buried containers customers want
  if (!cr.ops.length && !cr.truck && s && (s.state === "docked" || s.state === "closing") && b.open) {
    const [c0, c1] = craneCols(b), sx = (k) => (DOCK.x + shipSlot(k).c * CL + 1.5) * T, sy = (k) => (DOCK.top + shipSlot(k).r + 0.5) * T, inCols = (k) => k % DOCK.cols >= c0 && k % DOCK.cols < c1 && onDeck(s, k);
    const nearest = (ok) => { let best = -1, bd = 1e9; s.bays.forEach((st, k) => { if (!inCols(k) || !ok(st, k)) return; const d = Math.abs(sx(k) - cr.x) + Math.abs(sy(k) - cr.y); if (d < bd) { bd = d; best = k; } }); return best; };
    // (owner) it keeps an eye on the tractors on their way: the next one's container comes first, lifted ready in its
    // second slot (one a customer is waiting for, if one is on top within reach); it only sorts or compresses with no
    // tractor coming, or (spare in hand) while the nearest is still a good way off
    const eta = soonest(b), wanted = (st) => { const x = st[st.length - 1]; return x && !x.exp && x.wantedBy ? 1 : 0; };
    if (cr.hold2 && eta === Infinity) { const k = nearest((st) => st.length < 3 && (!st.length || impCount(st))); if (k >= 0) cr.ops = [{ to: [sx(k), sy(k)] }, { lower: { stack: s.bays[k], second: true } }]; }
    else if (!cr.hold2 && eta < Infinity && s.state === "docked") { const free = (st, kk) => impCount(st) - s.claims[kk] > 0 && !BERTHS.some((q) => q.crane.slot === kk || q.crane.slot2 === kk); let k = nearest((st, kk) => free(st, kk) && wanted(st)); if (k < 0) k = nearest(free); if (k >= 0) cr.ops = [{ to: [sx(k), sy(k)] }, { lift: { stack: s.bays[k], second: true } }]; }
    else if (s.state === "docked" && (eta === Infinity || (cr.hold2 && eta > 28)) && sortShip(b)) { /* digging out a wanted container (owner) */ }
    else if (s.state === "docked" && eta === Infinity) compressShip(b);
  }
  craneStep(cr, dt, () => {
    cr.slot = undefined; cr.slot2 = undefined; const t = cr.truck, t2 = cr.truck2; cr.truck = null; cr.truck2 = null;
    if (t) doneServing(t); if (t2) doneServing(t2);
  });
}
// a tractor on its way to this crane right now that could take a spare (empty or bringing an export, not sent for a
// particular slot), other than t
// how many tiles off the nearest such tractor is (Infinity with none)
const soonest = (b) => trucks.reduce((m, q) => (q.cmd && q.cmd.kind === "sts" && q.cmd.berth === b && q.cmd.pick !== false && q.cmd.slot === undefined && !q.locked && (q.load === null || q.load.exp) ? Math.min(m, q.path.length) : m), Infinity);
const coming = (b, t) => trucks.some((q) => q !== t && q.cmd && q.cmd.kind === "sts" && q.cmd.berth === b && q.cmd.pick !== false && q.cmd.slot === undefined && !q.locked && (q.load === null || q.load.exp));
// (owner) an idle STS crane sorts the ship, before anything else: it takes the top container off a slot where a
// customer's container is buried (the least buried first; a slot tractors are queued for only while enough is left for them) and sets it on the nearest low slot of its own columns
// that holds no exports and no wanted container
function sortShip(b) {
  const s = DOCK.ship, cr = b.crane, [c0, c1] = craneCols(b), inCols = (k) => k % DOCK.cols >= c0 && k % DOCK.cols < c1 && onDeck(s, k);
  const busy = (k) => s.claims[k] > 0 || BERTHS.some((q) => q.crane.slot === k || q.crane.slot2 === k);
  let src = -1, sd = 1e9;
  s.bays.forEach((st, k) => { if (!inCols(k) || !impCount(st) || BERTHS.some((q) => q.crane.slot === k || q.crane.slot2 === k) || impCount(st) - 1 < s.claims[k]) return; const i = st.findIndex((x) => x.wantedBy); if (i < 0 || i === st.length - 1) return; if (st.length - 1 - i < sd) { sd = st.length - 1 - i; src = k; } });
  if (src < 0) return false;
  const qs = shipSlot(src); let dst = -1, dd = 1e9;
  s.bays.forEach((st, k) => { if (k === src || !inCols(k) || st.length >= 3 || (st.length && !impCount(st)) || st.some((x) => x.wantedBy) || busy(k)) return; const q = shipSlot(k), d = st.length * 3 + Math.abs(q.c - qs.c) * 2 + Math.abs(q.r - qs.r); if (d < dd) { dd = d; dst = k; } });
  if (dst < 0) return false;
  const sx = (k) => (DOCK.x + shipSlot(k).c * CL + 1.5) * T, sy = (k) => (DOCK.top + shipSlot(k).r + 0.5) * T;
  cr.ops = [{ to: [sx(src), sy(src)] }, { lift: { stack: s.bays[src] } }, { to: [sx(dst), sy(dst)] }, { lower: { stack: s.bays[dst] } }];
  return true;
}
// (owner) with nothing to sort, an idle crane packs the imports in its section toward the section's west end (one crane:
// the whole ship to the left; two: each its half; …): the top container of the easternmost import slot moves to the
// westernmost slot with room (columns first, then the deck rows nearest the quay), never onto exports, a wanted container,
// or a slot a tractor is coming for
function compressShip(b) {
  const s = DOCK.ship, cr = b.crane, [c0, c1] = craneCols(b);
  const busy = (k) => s.claims[k] > 0 || BERTHS.some((q) => q.crane.slot === k || q.crane.slot2 === k);
  const order = s.bays.map((_, k) => k).filter((k) => k % DOCK.cols >= c0 && k % DOCK.cols < c1 && onDeck(s, k)).sort((x, y) => (x % DOCK.cols - y % DOCK.cols) || (shipSlot(y).r - shipSlot(x).r));
  let src = -1, dst = -1;
  for (let n = order.length - 1; n >= 0; n--) { const k = order[n]; if (impCount(s.bays[k]) && !busy(k)) { src = n; break; } }
  if (src < 0) return false;
  for (let n = 0; n < src; n++) { const k = order[n], st = s.bays[k]; if (st.length < 3 && (!st.length || impCount(st)) && !st.some((x) => x.wantedBy) && !busy(k)) { dst = n; break; } }
  if (dst < 0) return false;
  const a = order[src], z = order[dst], sx = (k) => (DOCK.x + shipSlot(k).c * CL + 1.5) * T, sy = (k) => (DOCK.top + shipSlot(k).r + 0.5) * T;
  cr.ops = [{ to: [sx(a), sy(a)] }, { lift: { stack: s.bays[a] } }, { to: [sx(z), sy(z)] }, { lower: { stack: s.bays[z] } }];
  return true;
}
const slotXY = (b, c, r) => [(b.x + c + 0.5) * T, (b.y + r * CL + 1.5) * T];
// RTG: serves the trucks standing in its bays, one at a time, moving as little as it can (owner): it stays where it
// finished instead of going back to rest; at the bays it unloads a tractor next, out in the stacks it digs for a
// customer next; and a tractor's container goes down near the container the next customer wants (never on it), so the
// crane drops it on its way there
function rtgStep(b, dt) {
  if (b.exp) return exportRtgStep(b, dt);
  const cr = b.rtg;
  if (!cr.ops.length && !cr.truck) {
    const ready = trucks.filter((q) => q.cmd && q.cmd.kind === "rtg" && q.cmd.block === b && q.cmd.bay && !q.next && !q.locked && head(q) === targetKey(q.cmd, q));
    const srcOf = (t) => { let src = null, fewest = 1e9; for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { const st = b.slots[c][r], k = st.indexOf(t.want); if (k >= 0 && st.length - 1 - k < fewest) { fewest = st.length - 1 - k; src = [c, r]; } } return src && { src, fewest }; };
    const L = ready.filter((q) => q.kind === "cust" && q.load === null && srcOf(q)), U = free(b) > 0 ? ready.filter((q) => q.kind === "yard" && q.load !== null) : [];
    // (bug 2026-11-01) nearest first, but the longer a truck has waited in its bay the more it counts, so none is passed over
    for (const q of ready) if (q.cmd.readyAt === undefined) q.cmd.readyAt = clock;
    const age = (q) => (clock - q.cmd.readyAt) * 60, near = (list, f) => list.reduce((m, q) => (!m || f(q) - age(q) < f(m) - age(m) ? q : m), null);
    const toTruck = (q) => Math.abs(trailerOf(q).x - cr.x) + Math.abs(trailerOf(q).y - cr.y), toSrc = (q) => { const [c, r] = srcOf(q).src, [x, y] = slotXY(b, c, r); return Math.abs(x - cr.x) + Math.abs(y - cr.y); };
    const atBays = cr.y >= (REST + 0.5) * T - 1, nu = near(U, toTruck), nl = near(L, toSrc);
    const t = atBays ? nu || nl : nl || nu;
    if (t) {
      const at = () => { const tr = trailerOf(t); return [tr.x, tr.y]; };
      if (t.kind === "yard") {
        const next = near(L, (q) => Math.abs(trailerOf(q).x - trailerOf(t).x)), hint = next && srcOf(next).src, cc = clamp(Math.round(trailerOf(t).x / T - 0.5) - b.x, 0, b.cols - 1);
        let best = null, bs = 1e9;
        for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) {
          const st = b.slots[c][r]; if (st.length >= 3 || (hint && c === hint[0] && r === hint[1])) continue;
          const d = hint ? Math.abs(c - hint[0]) + Math.abs(r - hint[1]) * CL : Math.abs(c - cc) + (b.rows - 1 - r) * CL;
          const sc = st.length * 4 + d + (st.some((x) => x.wantedBy) ? 12 : 0); if (sc < bs) { bs = sc; best = [c, r]; }
        }
        if (best) { t.locked = true; cr.truck = t; cr.ops = [{ to: at }, { lift: { truck: t }, then: () => { cr.truck = null; doneServing(t); } }, { to: slotXY(b, best[0], best[1]) }, { lower: { stack: b.slots[best[0]][best[1]] } }]; }   // (owner) the tractor drives off once its container is lifted
      } else {
        const { src, fewest } = srcOf(t), ops = [], h = b.slots.map((col) => col.map((st) => st.length));
        for (let n = 0; n < fewest; n++) {
          let dst = null, ds = 1e9;
          for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { if ((c === src[0] && r === src[1]) || h[c][r] >= 3) continue; const sc = h[c][r] * 4 + Math.abs(c - src[0]) + Math.abs(r - src[1]); if (sc < ds) { ds = sc; dst = [c, r]; } }
          if (!dst) break;
          h[src[0]][src[1]]--; h[dst[0]][dst[1]]++;
          ops.push({ to: slotXY(b, src[0], src[1]) }, { lift: { stack: b.slots[src[0]][src[1]] } }, { to: slotXY(b, dst[0], dst[1]) }, { lower: { stack: b.slots[dst[0]][dst[1]] } });
        }
        ops.push({ to: slotXY(b, src[0], src[1]) }, { lift: { stack: b.slots[src[0]][src[1]] } }, { to: at }, { lower: { truck: t }, then: () => { cr.truck = null; doneServing(t); } });
        t.locked = true; cr.truck = t; cr.ops = ops;
      }
    }
  }
  craneStep(cr, dt, () => {});
}

// the export area's RTG: takes containers off export trucks (onto a low stack near the bays) and puts one onto each
// empty tractor that comes for one (off the top of a tall stack nearby; exports are all alike, so no digging)
function exportRtgStep(b, dt) {
  const cr = b.rtg;
  if (!cr.ops.length && !cr.truck) {
    const ready = trucks.filter((q) => q.cmd && q.cmd.kind === "rtg" && q.cmd.block === b && q.cmd.bay && !q.next && !q.locked && head(q) === targetKey(q.cmd, q));
    const U = free(b) > 0 ? ready.filter((q) => q.kind === "exp" && q.load !== null) : [], L = count(b) > 0 ? ready.filter((q) => q.kind === "yard" && q.load === null) : [];
    for (const q of ready) if (q.cmd.readyAt === undefined) q.cmd.readyAt = clock;
    const sc = (q) => Math.abs(trailerOf(q).x - cr.x) - (clock - q.cmd.readyAt) * 60, near = (list) => list.reduce((m, q) => (!m || sc(q) < sc(m) ? q : m), null);
    const atBays = cr.y >= (REST + 0.5) * T - 1, t = atBays ? near(U) || near(L) : near(L) || near(U);
    if (t) {
      const at = () => { const tr = trailerOf(t); return [tr.x, tr.y]; }, cc = clamp(Math.round(trailerOf(t).x / T - 0.5) - b.x, 0, b.cols - 1);
      let best = null, bs = 1e9;
      for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) {
        const st = b.slots[c][r], d = Math.abs(c - cc) + (b.rows - 1 - r) * CL;
        const sc = t.kind === "exp" ? (st.length >= 3 ? 1e9 : st.length * 4 + d) : (!st.length ? 1e9 : -st.length * 4 + d);
        if (sc < bs) { bs = sc; best = [c, r]; }
      }
      const done = () => { cr.truck = null; doneServing(t); };
      t.locked = true; cr.truck = t;
      if (t.kind === "exp") cr.ops = [{ to: at }, { lift: { truck: t }, then: done }, { to: slotXY(b, best[0], best[1]) }, { lower: { stack: b.slots[best[0]][best[1]] } }];
      else { t.cmd.served = true; cr.ops = [{ to: slotXY(b, best[0], best[1]) }, { lift: { stack: b.slots[best[0]][best[1]] } }, { to: at }, { lower: { truck: t }, then: done }]; }
    }
  }
  craneStep(cr, dt, () => {});
}

// ---- input: pan / zoom; select a truck, then where it goes ----
let VW = 0, VH = 0, DPR = 1, zoom = 1, cam = { x: MW * T / 2, y: MH * T / 2 }, selected = null, hover = null, bad = null;
const keys = {};
addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "Escape") selected = null; const n = /^Digit([1-9])$/.exec(e.code); if (n) { const t = trucks.find((q) => q.num === +n[1]); if (t) selected = t; } });
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
const toWorld = (sx, sy) => ({ x: (sx - VW / 2) / zoom + cam.x, y: (sy - VH / 2) / zoom + cam.y });
const tileAtScreen = (sx, sy) => { const w = toWorld(sx, sy); return [Math.floor(w.x / T), Math.floor(w.y / T)]; };
function segDist(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, u = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l, 0, 1); return hyp(px - a[0] - u * dx, py - a[1] - u * dy); }
function truckAt(sx, sy) { const w = toWorld(sx, sy); for (const t of trucks) { if (t.exiting) continue; const s = shapeOf(t); if (Math.min(segDist(w.x, w.y, s.front, s.cabBack), segDist(w.x, w.y, s.trFront, s.trBack)) < 14) return t; } return null; }
// (owner) an auto tractor told to fetch from a ship slot: if it's already on its way to a crane for a pickup the crane
// hasn't started, that pickup becomes the slot's; it then takes it to its RTG and carries on
function slotSwap(t, i, j) {
  if (t.kind !== "yard" || !t.auto || t.locked || !t.cmd || t.cmd.kind !== "sts" || t.cmd.slot !== undefined || t.load !== null) return null;
  const g = targetAt(i, j); if (!g || g.kind !== "sts" || g.slot === undefined) return null;
  const s = DOCK.ship; if (s.bays[g.slot].length - s.claims[g.slot] <= 0 || (g.berth !== t.cmd.berth && berthLeft(g.berth) <= 0)) return null;
  return { kind: "sts", berth: g.berth, slot: g.slot, swap: true };
}
function doSwap(t, a) {
  claim(t, t.cmd, -1); delete a.swap; claim(t, a, 1);
  t.cmd = null; if (!startCmd(t, a)) t.queue.unshift(a);
}
// an auto tractor is assigned an RTG by clicking its storage area or bays
function homeFor(t, i, j) { if (t.kind !== "yard" || !t.auto) return null; const g = targetAt(i, j); return g && g.kind === "rtg" ? g.block : null; }
function click(sx, sy) {
  const t = truckAt(sx, sy); if (t) { selected = selected === t ? null : t; return; }
  const [i, j] = tileAtScreen(sx, sy), u = buyAt(i, j);
  if (u) { if (money >= u.price) { money -= u.price; u.buy(); } else bad = { i, j, t: 0.5 }; return; }
  if (!selected) return;
  const h = homeFor(selected, i, j); if (h) { selected.home = h; return; }
  const a = planFor(selected, i, j), sw = !a && slotSwap(selected, i, j);
  if (a) enqueue(selected, a); else if (sw) doSwap(selected, sw); else bad = { i, j, t: 0.5 };
}
const pts = new Map(); let gesture = null;
// right click: take back the selected truck's last queued trip (not the one under way); with none left, deselect
cv.addEventListener("contextmenu", (e) => { e.preventDefault(); if (!selected || !unqueueLast(selected)) selected = null; });
cv.addEventListener("pointerdown", (e) => {
  if (e.button === 2) return;
  try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()]; gesture = { pinch: hyp(a.x - b.x, a.y - b.y), zoom, moved: true }; return; }
  gesture = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
});
cv.addEventListener("pointermove", (e) => {
  hover = { tile: tileAtScreen(e.clientX, e.clientY), truck: truckAt(e.clientX, e.clientY) };
  if (!pts.has(e.pointerId) || !gesture) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture.pinch && pts.size === 2) { const [a, b] = [...pts.values()]; setZoom(gesture.zoom * hyp(a.x - b.x, a.y - b.y) / gesture.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
  if (gesture.pinch) return;
  const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy; if (hyp(dx, dy) > 6) gesture.moved = true;
  if (gesture.moved) { cam.x = gesture.cx - dx / zoom; cam.y = gesture.cy - dy / zoom; }
});
cv.addEventListener("pointerup", (e) => { pts.delete(e.pointerId); if (gesture && !gesture.moved && !gesture.pinch) click(e.clientX, e.clientY); if (!pts.size) gesture = null; });
cv.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });
function setZoom(z, sx, sy) { const before = toWorld(sx, sy); zoom = clamp(z, 0.3, 3); const after = toWorld(sx, sy); cam.x += before.x - after.x; cam.y += before.y - after.y; }

// ---- placeholder art ----
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function seeded(seed) { let s = seed % 233280; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
function noiseFill(g, x, y, w, h, base, amt, seed) {
  const R = seeded(seed), r = parseInt(base.slice(1, 3), 16), gg = parseInt(base.slice(3, 5), 16), b = parseInt(base.slice(5, 7), 16);
  for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i += 2) { const n = (R() - 0.5) * amt; g.fillStyle = `rgb(${clamp(r + n, 0, 255) | 0},${clamp(gg + n, 0, 255) | 0},${clamp(b + n, 0, 255) | 0})`; g.fillRect(x + i, y + j, 2, 2); }
}
const GROUND = canvas(MW * T, MH * T);
function arrow(g, i, j, dx, dy) { const cx = (i + 0.5) * T, cy = (j + 0.5) * T; g.save(); g.translate(cx, cy); g.rotate(Math.atan2(dy, dx)); g.fillStyle = "rgba(236,231,220,.22)"; g.fillRect(-8, -1.5, 9, 3); g.beginPath(); g.moveTo(8, 0); g.lineTo(0, -5); g.lineTo(0, 5); g.fill(); g.restore(); }
// (art) painted once: asphalt with grain, oil stains and edge lines; concrete in slabs with joints; the quay edge with its
// hazard stripe and bollards, crane rails along the quay; storage pads with painted slot outlines; a chain-link fence
function buildGround() {
  // (owner, 2026-11-01) no leftover concrete in the yard: any ground below the quay road that isn't a storage pad is paved
  const g = GROUND.getContext("2d"), pad = (i, j) => BLOCKS.some((b) => i >= b.x && i < b.x + b.w && j >= b.y && j <= REST);
  const road = (i, j) => ROADSET.has(key(i, j)) || (j >= QROAD && j < MH - 1 && i > 0 && i < MW - 1 && !pad(i, j)), fence = (i, j) => j === MH - 1 || i === 0 || i === MW - 1;
  for (let j = QUAY; j < MH; j++) for (let i = 0; i < MW; i++) {
    const x = i * T, y = j * T;
    if (road(i, j)) {
      noiseFill(g, x, y, T, T, "#2b2e34", 9, i * 7 + j * 3);
      const R = seeded(i * 131 + j * 71); if (R() < 0.05) { g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.ellipse(x + 8 + R() * 16, y + 8 + R() * 16, 4 + R() * 6, 3 + R() * 4, R() * 3, 0, TAU); g.fill(); }
      if (R() < 0.04) { g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x + R() * T, y + R() * T); g.lineTo(x + R() * T, y + R() * T); g.stroke(); }
      continue;
    }
    if (fence(i, j)) {
      noiseFill(g, x, y, T, T, "#3a3c38", 14, i * 31 + j * 17);
      g.strokeStyle = "rgba(170,176,182,.35)"; g.lineWidth = 1; g.beginPath(); for (let k = -T; k < T; k += 6) { g.moveTo(x + k, y); g.lineTo(x + k + T, y + T); g.moveTo(x + k + T, y); g.lineTo(x + k, y + T); } g.stroke();
      g.fillStyle = "#1e1f22"; g.fillRect(x + 13, y + 13, 6, 6); g.fillStyle = "#6a6e74"; g.fillRect(x + 14, y + 14, 3, 3);
      continue;
    }
    const sl = seeded(Math.floor(i / 2) * 97 + Math.floor(j / 2) * 53)(), tint = Math.round((sl - 0.5) * 10);
    noiseFill(g, x, y, T, T, "#" + [0x6c + tint, 0x6e + tint, 0x72 + tint].map((v) => v.toString(16).padStart(2, "0")).join(""), 10, i * 13 + j * 29);
    g.fillStyle = "rgba(0,0,0,.22)"; if (i % 2 === 0) g.fillRect(x, y, 1, T); if (j % 2 === 0) g.fillRect(x, y, T, 1);
    g.fillStyle = "rgba(255,255,255,.06)"; if (i % 2 === 0) g.fillRect(x + 1, y, 1, T); if (j % 2 === 0) g.fillRect(x, y + 1, T, 1);
  }
  // painted edge lines where a road meets the ground
  g.fillStyle = "rgba(230,226,214,.32)";
  for (const k of ROADSET) { const [i, j] = unkey(k); if (i < 1 || i >= MW - 1 || j < QUAY || j >= MH - 1) continue; const x = i * T, y = j * T;
    if (!road(i, j - 1) && j > QUAY) g.fillRect(x, y + 1, T, 2); if (!road(i, j + 1) && j + 1 < MH - 1) g.fillRect(x, y + T - 3, T, 2);
    if (!road(i - 1, j) && i > 1) g.fillRect(x + 1, y, 2, T); if (!road(i + 1, j) && i + 1 < MW - 1) g.fillRect(x + T - 3, y, 2, T); }
  // the quay edge: a concrete cap with a hazard stripe, bollards; crane rails along the quay
  g.fillStyle = "#8c8e92"; g.fillRect(0, QUAY * T, MW * T, 6);
  for (let x = 0; x < MW * T; x += 16) { g.fillStyle = "#e8b432"; g.beginPath(); g.moveTo(x, QUAY * T + 6); g.lineTo(x + 8, QUAY * T + 6); g.lineTo(x + 12, QUAY * T + 10); g.lineTo(x + 4, QUAY * T + 10); g.fill(); g.fillStyle = "#1e1f22"; g.beginPath(); g.moveTo(x + 8, QUAY * T + 6); g.lineTo(x + 16, QUAY * T + 6); g.lineTo(x + 20, QUAY * T + 10); g.lineTo(x + 12, QUAY * T + 10); g.fill(); }
  for (let i = 1; i < MW; i += 3) { const x = i * T + 16, y = QUAY * T + 18; g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.arc(x + 2, y + 3, 6, 0, TAU); g.fill(); g.fillStyle = "#2a2c30"; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill(); g.fillStyle = "#5a5e66"; g.beginPath(); g.arc(x - 1.5, y - 1.5, 2.5, 0, TAU); g.fill(); }
  for (const ry of [QUAY * T + 30, 12 * T - 6]) { g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, ry - 1, MW * T, 5); g.fillStyle = "#9aa0a6"; g.fillRect(0, ry, MW * T, 2); g.fillStyle = "#cfd4d8"; g.fillRect(0, ry, MW * T, 1); }
  // the dashed line between a road's two lanes, and direction arrows (every few tiles)
  g.strokeStyle = "rgba(236,231,220,.34)"; g.lineWidth = 2; g.setLineDash([10, 10]);
  for (const [x, y, dx, dy, n, ox, oy] of DIVS) { const sx = (x + 0.5 + ox / 2) * T, sy = (y + 0.5 + oy / 2) * T; g.beginPath(); g.moveTo(sx + dx * T / 2, sy + dy * T / 2); g.lineTo(sx + dx * (n - 0.5) * T, sy + dy * (n - 0.5) * T); g.stroke(); }
  g.setLineDash([]);
  for (const [k, l] of E) { const [i, j] = unkey(k); if (i < 0 || i >= MW || (i + j) % 3) continue; for (const n of l) { if (CHG.has(k + ">" + n) || (E.get(n) || []).includes(k)) continue; const [ni, nj] = unkey(n); arrow(g, i, j, ni - i, nj - j); } }
  // the STS lines, the RTG bays, the parking stalls
  for (const b of BERTHS) { g.lineWidth = 2; for (const l of b.lanes) for (let d = 0; d < LANE_DEEP; d++) { const rgb = l.kind === "auto" ? "95,211,208" : "242,169,59"; g.strokeStyle = `rgba(${rgb},${d ? 0.25 : 0.6})`; g.strokeRect((b.x + 5 + TL * d) * T + 2, l.r * T + 2, TL * T - 4, T - 4); } g.fillStyle = "#e8e2d0"; g.font = "800 20px 'Big Shoulders Display', Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String.fromCharCode(65 + b.id), (b.ex + 0.5) * T, (QUAY + 1.5) * T); }
  for (const b of BLOCKS) {
    noiseFill(g, b.x * T, b.y * T, b.w * T, b.h * T, "#5a5d63", 9, b.id * 9 + 1); noiseFill(g, b.x * T, REST * T, b.w * T, T, "#4a4c52", 8, b.id + 3);
    g.fillStyle = "rgba(0,0,0,.16)"; g.fillRect(b.x * T + 2, b.y * T, 4, (b.h + 1) * T); g.fillRect((b.x + b.w) * T - 6, b.y * T, 4, (b.h + 1) * T);   // RTG tyre tracks
    g.strokeStyle = "rgba(255,255,255,.16)"; g.lineWidth = 1; for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) g.strokeRect((b.x + c) * T + 1.5, (b.y + r * CL) * T + 1.5, T - 3, CL * T - 3);
    g.fillStyle = b.exp ? "rgba(127,200,255,.6)" : "rgba(201,162,58,.55)"; g.fillRect(b.x * T, b.y * T, b.w * T, 2); g.fillRect(b.x * T, (b.y + b.h) * T - 2, b.w * T, 2); g.fillRect(b.x * T, b.y * T, 2, b.h * T); g.fillRect((b.x + b.w) * T - 2, b.y * T, 2, b.h * T);
    if (b.exp) { g.fillStyle = "rgba(127,200,255,.45)"; g.font = "800 16px 'Big Shoulders Display', Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("EXPORT", (b.x + b.w / 2) * T, (REST + 0.5) * T); }
    for (const bay of b.bays) { g.fillStyle = "rgba(236,231,220,.3)"; g.fillRect(bay.i * T, BAY0 * T, 1, TL * T); g.fillRect(bay.i * T + T - 1, BAY0 * T, 1, TL * T); g.fillStyle = "rgba(127,200,255,.45)"; g.fillRect(bay.i * T + 4, (BAY0 + TL) * T - 4, T - 8, 2); }
  }
  for (const p of PARK) { g.fillStyle = "rgba(232,180,50,.45)"; g.fillRect(PARK_X * T, p.j * T, TL * T, 1); g.fillRect(PARK_X * T, p.j * T + T - 1, TL * T, 1); g.fillRect(PARK_X * T + 2, p.j * T + 4, 2, T - 8); }
  for (const st of STALLS) { g.fillStyle = "rgba(236,231,220,.32)"; g.fillRect(st.i * T, LOT0 * T, 1, TL * T); g.fillRect(st.i * T + T - 1, LOT0 * T, 1, TL * T); g.fillRect(st.i * T + 4, LOT0 * T + 2, T - 8, 2); }
}
// (perf) the sea and its wave lines are painted once (one wave period wider) and slid along
let WATER = null;
function drawWater() {
  if (!WATER) {
    WATER = canvas((MW + 60) * T + 64, (QUAY + 10) * T); const g = WATER.getContext("2d");
    g.fillStyle = "#1a4a6a"; g.fillRect(0, 0, WATER.width, WATER.height); g.fillStyle = "rgba(255,255,255,.07)";
    for (let j = -6; j < QUAY; j++) for (let i = -32; i < MW + 30; i += 2) { const o = ((j * 37) % 64) - 32; g.fillRect((i + 30) * T + o + (j % 2) * 20, (j + 10) * T + 14, 14, 2); }
  }
  ctx.drawImage(WATER, -30 * T - 64 + Math.round((clock * 12) % 64), -10 * T);
  // (art) glints and foam lapping at the quay
  ctx.fillStyle = "rgba(255,255,255,.12)"; for (let i = -20; i < MW + 20; i++) { const a = Math.sin(clock * 1.7 + i * 1.3); if (a > 0.6) ctx.fillRect(i * T + ((i * 13) % 20), (QUAY - 1) * T + 6 + ((i * 7) % 14), 4, 2); }
  ctx.fillStyle = "rgba(255,255,255,.22)"; for (let i = -20; i < MW + 20; i++) { const o = Math.sin(clock * 2.2 + i * 0.9) * 3; ctx.fillRect(i * T, QUAY * T - 5 + o, 20, 2); }
  ctx.fillStyle = "#141518"; for (let i = 0; i < MW; i += 2) ctx.fillRect(i * T + 10, QUAY * T - 5, 12, 5);   // rubber fenders on the quay face
}
// (owner) a stack drawn as three squares down its 1 x 3 footprint: top square the top of the stack, bottom the bottom
// a ship's slot: the same three squares, left to right (left the top of the stack, right the bottom)
const shipSlot = (k) => ({ c: k % DOCK.cols, r: Math.floor(k / DOCK.cols) });
const slotRect = (k) => { const q = shipSlot(k); return [(DOCK.x + q.c * CL) * T + Math.round(DOCK.ship ? DOCK.ship.off : 0), (DOCK.top + q.r) * T, CL * T, T]; };
// (owner) the selected customer truck's container flashes wherever it is
// (owner) with no customer truck selected, the containers on the ship that a customer is waiting for flash instead
// (owner) a container on the ship that a customer is waiting for flashes until enough tractors are queued for its slot to
// dig down to it (a crane on its way to the slot counts as one)
let CACHING = false;
const flashing = (x, slot, st) => { if (!x || CACHING) return false; if (selected && selected.kind === "cust") return selected.want === x; if (slot === undefined || !x.wantedBy || !DOCK.ship) return false; const need = st.length - st.indexOf(x), have = DOCK.ship.claims[slot] + BERTHS.reduce((n, b) => n + (b.crane.slot === slot ? 1 : 0) + (b.crane.slot2 === slot ? 1 : 0), 0); if (have >= need) return false;
  // (bug 2026-11-01) and only while you could still claim it: not once its crane's containers are all spoken for (it
  // will be fetched anyway), nor with its slot fully claimed
  const c = slot % DOCK.cols, b = BERTHS.find((q) => q.open && c >= craneCols(q)[0] && c < craneCols(q)[1]);
  return !!b && berthLeft(b) > 0 && impCount(st) - DOCK.ship.claims[slot] > 0; };
function flash(x, y, w, h, rgb = "255,255,255") { const a = 0.5 + 0.5 * Math.sin(clock * 10); ctx.fillStyle = `rgba(${rgb},${0.45 * a})`; ctx.fillRect(x, y, w, h); ctx.strokeStyle = `rgba(${rgb},${0.45 + 0.55 * a})`; ctx.lineWidth = 3; ctx.strokeRect(x - 2, y - 2, w + 4, h + 4); }
// (owner) a claimed container in a stack: the stack blinks green with it on top, yellow in the middle, red at the bottom
const posRGB = (st, x) => { const i = st.indexOf(x); return i === st.length - 1 ? "74,222,106" : i === 0 ? "255,74,58" : "242,194,50"; };
// (owner, 2026-11-01) a stack shows its top container at full size, as it looks on a truck
function drawStackAt(cx, cy, ang, st) { if (st.length) drawBox(st[st.length - 1], cx, cy, ang, 0); }
function drawStackH(x, y, st, frame) {   // on the ship
  if (!st.length) { ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1; ctx.strokeRect(x + 2.5, y + 4.5, CL * T - 5, T - 9); return; }
  drawStackAt(x + CL * T / 2, y + T / 2, 0, st);
}
function drawStack(x, y, st) { drawStackAt(x + T / 2, y + CL * T / 2, Math.PI / 2, st); }
// (art) a crane's spreader: a yellow frame the size of a container, hanging at height h
function drawSpreader(cx, cy, ang, h) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(-CL * T / 2 + 4 + 7 * h, -T / 2 + 6 + 9 * h, CL * T - 8, T - 10);
  ctx.translate(-3 * h, -5 * h); const sc = 1 + 0.1 * h; ctx.scale(sc, sc);
  ctx.strokeStyle = "#e8b432"; ctx.lineWidth = 3; ctx.strokeRect(-CL * T / 2 + 4, -T / 2 + 6, CL * T - 8, T - 12);
  ctx.fillStyle = "#3a3c40"; ctx.fillRect(-6, -T / 2 + 6, 12, T - 12);
  ctx.fillStyle = "#e8b432"; for (const sx of [-CL * T / 2 + 3, CL * T / 2 - 7]) for (const sy of [-T / 2 + 5, T / 2 - 9]) ctx.fillRect(sx, sy, 4, 4);
  ctx.restore();
}
// (art) h: how high it hangs (0 on the ground .. 1 up at the trolley): higher, it's drawn a little bigger with its shadow
// further off
function drawBox(c, cx, cy, ang, h) {
  h = h === true ? 1 : h || 0;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
  if (h > 0) { ctx.fillStyle = `rgba(0,0,0,${0.18 + 0.14 * h})`; ctx.fillRect(-CL * T / 2 + 2 + 7 * h, -T / 2 + 4 + 9 * h, CL * T - 4, T - 6); ctx.translate(-3 * h, -5 * h); const sc = 1 + 0.1 * h; ctx.scale(sc, sc); }
  // (art) a container from above: corrugated roof, side rails, a plain front end, the door end with its locking bars,
  // corner castings
  const L = CL * T - 4, W = T - 8, x0 = -L / 2, y0 = -W / 2;
  ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(x0 - 1, y0 - 1, L + 2, W + 2);
  ctx.fillStyle = COLORS[c.c].c; ctx.fillRect(x0, y0, L, W);
  for (let k = x0 + 5; k < x0 + L - 6; k += 3) { ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(k, y0 + 2, 1, W - 4); ctx.fillStyle = "rgba(255,255,255,.13)"; ctx.fillRect(k + 1, y0 + 2, 1, W - 4); }
  ctx.fillStyle = "rgba(255,255,255,.3)"; ctx.fillRect(x0, y0, L, 2); ctx.fillStyle = "rgba(0,0,0,.38)"; ctx.fillRect(x0, y0 + W - 2, L, 2);
  ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(x0, y0, 3, W); ctx.fillRect(x0 + L - 5, y0, 5, W);
  ctx.fillStyle = "rgba(0,0,0,.5)"; for (const by of [y0 + 5, y0 + 9, y0 + W - 10, y0 + W - 6]) ctx.fillRect(x0 + L - 5, by, 5, 1);
  ctx.fillStyle = "#24262a"; ctx.fillRect(x0, y0, 4, 4); ctx.fillRect(x0 + L - 4, y0, 4, 4); ctx.fillRect(x0, y0 + W - 4, 4, 4); ctx.fillRect(x0 + L - 4, y0 + W - 4, 4, 4);
  if (c.exp) { ctx.fillStyle = "rgba(8,16,30,.6)"; ctx.fillRect(x0 + 10, y0 + 6, L - 20, W - 12); }
  if (flashing(c)) flash(x0, y0, L, W);
  ctx.restore();
}
// (art) smoke puffs from the ship's funnel, drifting off on the wind
const SMOKE = [];
let smokeClock = 0;
function drawSmoke() {
  const dt = Math.min(0.1, clock - smokeClock); smokeClock = clock;
  for (let k = SMOKE.length - 1; k >= 0; k--) { const p = SMOKE[k]; p.t += dt; if (p.t > 4) { SMOKE.splice(k, 1); continue; } p.x += (-14 - (p.ship.state === "docked" ? 0 : 30)) * dt; p.y -= 9 * dt; p.r += 5 * dt; ctx.fillStyle = `rgba(190,196,204,${0.35 * (1 - p.t / 4)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
}
function drawShip() {
  const s = DOCK.ship, x = DOCK.x * T + Math.round(s.off), y = (DOCK.top + DOCK.rows - s.rows - 1) * T + 14, w = s.cols * CL * T, h = (s.rows + 1) * T + 2;
  // (art) the hull: a rounded stern, a long body and a curved bow; an antifouling rim, a steel deck with a railing
  const sx0 = x - 2.6 * T, bx = x + w + 2 * T, mid = y + h / 2, moving = s.state !== "docked" && s.state !== "closing";
  const hull = (d) => { ctx.beginPath(); ctx.moveTo(sx0 + 18 + d, y + d); ctx.lineTo(x + w, y + d); ctx.bezierCurveTo(bx - 34, y + d, bx - 4 - d, mid - h * 0.22, bx - d * 1.6, mid); ctx.bezierCurveTo(bx - 4 - d, mid + h * 0.22, bx - 34, y + h - d, x + w, y + h - d); ctx.lineTo(sx0 + 18 + d, y + h - d); ctx.quadraticCurveTo(sx0 + d, y + h - d, sx0 + d, mid); ctx.quadraticCurveTo(sx0 + d, y + d, sx0 + 18 + d, y + d); ctx.closePath(); };
  // wake while moving: a V of foam off the stern, a bow wave
  if (moving) { ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 3; for (let k = 0; k < 5; k++) { const o = ((clock * 30) % 24) + k * 24; ctx.beginPath(); ctx.moveTo(sx0 - o, mid - 10 - o * 0.45); ctx.lineTo(sx0 - o - 14, mid - 14 - o * 0.5); ctx.moveTo(sx0 - o, mid + 10 + o * 0.45); ctx.lineTo(sx0 - o - 14, mid + 14 + o * 0.5); ctx.stroke(); } ctx.fillStyle = "rgba(255,255,255,.3)"; ctx.beginPath(); ctx.ellipse(bx + 2, mid, 8, h * 0.42, 0, -Math.PI / 2, Math.PI / 2); ctx.fill(); }
  ctx.save(); ctx.translate(7, 9); hull(-1); ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fill(); ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,.16)"; for (let k = 0; k < w + 3 * T; k += 9) { const o = Math.sin(clock * 2 + k * 0.31) * 2; ctx.fillRect(sx0 + 14 + k, y + h + 2 + o, 6, 2); ctx.fillRect(sx0 + 14 + k, y - 4 - o, 6, 2); }
  hull(-3); ctx.fillStyle = "#6e2620"; ctx.fill();
  hull(0); ctx.fillStyle = s.hull; ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(sx0 + 16, y + 1, x + w - sx0 - 16, 3);
  hull(6); ctx.fillStyle = "#3a3f46"; ctx.fill();
  hull(5); ctx.strokeStyle = "rgba(225,228,232,.55)"; ctx.lineWidth = 1; ctx.stroke();
  // hatch covers under each slot column, with seams between the rows
  const r0 = DOCK.rows - s.rows;
  for (let c = 0; c < s.cols; c++) { const hx = x + c * CL * T + 1; ctx.fillStyle = "#4b525b"; ctx.fillRect(hx, (DOCK.top + r0) * T + 1, CL * T - 2, s.rows * T - 2); ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(hx, (DOCK.top + r0) * T + 1, CL * T - 2, 2); ctx.fillStyle = "rgba(0,0,0,.3)"; for (let r = 1; r < s.rows; r++) ctx.fillRect(hx, (DOCK.top + r0 + r) * T - 1, CL * T - 2, 2); }
  // forecastle: windlasses and the foremast
  ctx.fillStyle = "#2a2d32"; for (const wy of [mid - 14, mid + 14]) { ctx.beginPath(); ctx.arc(x + w + 18, wy, 5, 0, TAU); ctx.fill(); }
  ctx.fillStyle = "#d8dcdf"; ctx.fillRect(x + w + 30, mid - 1, 10, 2); ctx.fillRect(x + w + 34, mid - 6, 2, 12);
  // the accommodation block at the stern: white, with bridge wings, a band of windows facing forward, lifeboats, the funnel
  const ax = sx0 + 14, aw = x - 8 - ax;
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(ax + 4, y + 10, aw, h - 14);
  ctx.fillStyle = "#e6e2d8"; ctx.fillRect(ax, y + 6, aw, h - 12); ctx.fillStyle = "#c9c4b8"; ctx.fillRect(ax, y + 6, 3, h - 12); ctx.fillRect(ax, y + h - 9, aw, 3);
  ctx.fillStyle = "#d8d4ca"; ctx.fillRect(x - 18, y - 2, 10, h + 4);   // bridge wings, out over the sides
  ctx.fillStyle = "#29506e"; ctx.fillRect(x - 15, y + 1, 4, h - 2); ctx.fillStyle = "#6ab8e8"; for (let wy = y + 3; wy < y + h - 4; wy += 7) ctx.fillRect(x - 15, wy, 4, 4);
  ctx.fillStyle = "#e8822a"; ctx.fillRect(ax + 8, y + 2, 16, 6); ctx.fillRect(ax + 8, y + h - 8, 16, 6);
  ctx.fillStyle = "#9aa0a8"; ctx.fillRect(ax + 30, y + 16, 6, 5); ctx.fillRect(ax + 30, y + h - 21, 6, 5);
  const fx = ax + 14, fy = mid; ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(fx - 5, fy - 7, 16, 18);
  ctx.fillStyle = "#33363c"; ctx.fillRect(fx - 8, fy - 10, 16, 20); ctx.fillStyle = "#c83a2e"; ctx.fillRect(fx - 8, fy - 3, 16, 6); ctx.fillStyle = "#141518"; ctx.fillRect(fx - 5, fy - 7, 10, 14);
  if (clock - (s.lastPuff || 0) > (moving ? 0.3 : 0.9)) { s.lastPuff = clock; SMOKE.push({ x: fx, y: fy, ship: s, r: 5, t: 0 }); }
  // mooring lines to the quay while docked
  if (!moving) { ctx.strokeStyle = "rgba(226,214,180,.8)"; ctx.lineWidth = 1.5; ctx.beginPath(); for (const [hx, qx] of [[sx0 + 20, sx0 - 1.5 * T], [sx0 + 40, sx0 + 1.5 * T], [bx - 40, bx - 3 * T], [bx - 20, bx + 1.5 * T]]) { ctx.moveTo(hx, y + h - 4); ctx.lineTo(qx, QUAY * T + 10); } ctx.stroke(); }
  // (perf) the deck's stacks are drawn once into a cached image, again only when they change; flashing goes on top
  if (!s.deck) { s.deck = canvas(DOCK.cols * CL * T, DOCK.rows * T); s.deckVer = 0; }
  if (s.deckVer !== STACK_VER) {
    s.deckVer = STACK_VER; const g = s.deck.getContext("2d"); g.clearRect(0, 0, s.deck.width, s.deck.height);
    ctx = g; CACHING = true; s.bays.forEach((st, k) => { if (!onDeck(s, k)) return; const q = shipSlot(k); drawStackH(q.c * CL * T, q.r * T, st, "rgba(0,0,0,.4)", k); }); CACHING = false; ctx = mainCtx;
  }
  ctx.drawImage(s.deck, x, DOCK.top * T);
  s.bays.forEach((st, k) => { for (let n = st.length - 1; n >= 0; n--) if (st[n].wantedBy && flashing(st[n], k, st)) { const q = shipSlot(k); flash(x + q.c * CL * T + 2, (DOCK.top + q.r) * T + 4, CL * T - 4, T - 8, posRGB(st, st[n])); break; } });
  // the time it has left
  if (s.state === "docked" || s.state === "closing") {
    const sec = Math.max(0, Math.ceil(s.time)), txt = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"), low = sec <= 30;
    ctx.font = "800 18px 'Big Shoulders Display', Impact, sans-serif"; const tw = ctx.measureText(txt).width + 14, tx = bx + 16 + tw / 2, ty = y + h / 2;
    ctx.fillStyle = "rgba(10,14,20,.85)"; ctx.fillRect(tx - tw / 2, ty - 12, tw, 24); ctx.strokeStyle = low ? "#ff5a4a" : "#6a7080"; ctx.lineWidth = 2; ctx.strokeRect(tx - tw / 2, ty - 12, tw, 24);
    ctx.fillStyle = low && Math.sin(clock * 8) > 0 ? "#ff5a4a" : "#ece7dc"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, tx, ty + 1);
  }
}
function rectBetween(a, b, w, fill) { const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, l = hyp(b[0] - a[0], b[1] - a[1]), an = Math.atan2(a[1] - b[1], a[0] - b[0]); ctx.save(); ctx.translate(cx, cy); ctx.rotate(an); ctx.fillStyle = fill; ctx.fillRect(-l / 2, -w / 2, l, w); ctx.restore(); }
function drawTruck(t) {
  const s = shapeOf(t), sel = t === selected, hov = hover && hover.truck === t;
  if (sel || hov) { ctx.strokeStyle = sel ? "#ffffff" : "rgba(255,255,255,.45)"; ctx.lineWidth = sel ? 28 + 2 * Math.sin(clock * 8) : 26; ctx.lineCap = "round"; ctx.globalAlpha = sel ? 0.5 : 0.25; ctx.beginPath(); ctx.moveTo(s.front[0], s.front[1]); ctx.lineTo(s.cabBack[0], s.cabBack[1]); ctx.lineTo(s.trBack[0], s.trBack[1]); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = "butt"; }
  // (art) shadow, wheels, chassis
  rectBetween([s.trFront[0] + 3, s.trFront[1] + 4], [s.trBack[0] + 3, s.trBack[1] + 4], 24, "rgba(0,0,0,.28)");
  rectBetween([s.front[0] + 3, s.front[1] + 4], [s.cabBack[0] + 3, s.cabBack[1] + 4], 26, "rgba(0,0,0,.28)");
  const tr0 = trailerOf(t), L = hyp(s.trFront[0] - s.trBack[0], s.trFront[1] - s.trBack[1]);
  ctx.save(); ctx.translate(tr0.x, tr0.y); ctx.rotate(tr0.a); ctx.fillStyle = "#141518";
  for (const wx of [-L / 2 + 6, -L / 2 + 16, L / 2 - 10]) { ctx.fillRect(wx, -12, 7, 4); ctx.fillRect(wx, 8, 7, 4); }
  const stopped = !t.next; ctx.restore();
  rectBetween(s.trFront, s.trBack, 18, "#4a4e56");
  ctx.save(); ctx.translate(tr0.x, tr0.y); ctx.rotate(tr0.a); ctx.fillStyle = "#3a3d44"; ctx.fillRect(-L / 2, -2, L, 4);
  ctx.fillStyle = stopped ? "#ff3a2a" : "#7a2a22"; ctx.fillRect(-L / 2 - 1, -8, 3, 4); ctx.fillRect(-L / 2 - 1, 4, 3, 4); ctx.restore();   // brake lights glow when stopped
  rectBetween(s.front, s.cabBack, 24, "#1e2024");
  rectBetween(s.front, s.cabBack, 20, t.kind === "cust" ? (t.generic || !t.want ? WAIT_CAB : COLORS[t.want.c].c) : t.kind === "exp" ? EXP_CAB : t.auto ? AUTO_CAB : "#e8b432");
  const an = Math.atan2(s.front[1] - s.cabBack[1], s.front[0] - s.cabBack[0]); ctx.save(); ctx.translate(s.front[0], s.front[1]); ctx.rotate(an);
  ctx.fillStyle = "#9ad0f0"; ctx.fillRect(-9, -7, 4, 14); ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(-22, -8, 11, 2);   // windscreen, roof highlight
  ctx.fillStyle = "#fff4c0"; ctx.fillRect(-2, -9, 2, 4); ctx.fillRect(-2, 5, 2, 4); ctx.fillStyle = "#141518"; ctx.fillRect(-14, -13, 7, 3); ctx.fillRect(-14, 10, 7, 3);   // headlights, front wheels
  ctx.restore();
  if (t.load !== null) drawBox(t.load, tr0.x, tr0.y, tr0.a, 0);
  if (t.num) { const m = [(s.front[0] + s.cabBack[0]) / 2, (s.front[1] + s.cabBack[1]) / 2]; ctx.fillStyle = "#1e2024"; ctx.fillRect(m[0] - 6, m[1] - 6, 12, 12); ctx.fillStyle = "#ece7dc"; ctx.font = "800 10px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(t.num), m[0], m[1] + 0.5); }
  if (t.sad > 0) { const bx = s.front[0] + 8, by = s.front[1] - 34; ctx.fillStyle = "#ffffff"; ctx.fillRect(bx, by, 18, 16); ctx.fillRect(bx + 4, by + 16, 4, 3); ctx.fillStyle = "#c83a2e"; ctx.fillRect(bx + 4, by + 4, 3, 3); ctx.fillRect(bx + 11, by + 4, 3, 3); ctx.fillRect(bx + 4, by + 10, 10, 2); ctx.fillRect(bx + 3, by + 11, 2, 2); ctx.fillRect(bx + 13, by + 11, 2, 2); }
  if (t.happy > 0) { const bx = s.front[0] + 8, by = s.front[1] - 34; ctx.fillStyle = "#ffffff"; ctx.fillRect(bx, by, 18, 16); ctx.fillRect(bx + 4, by + 16, 4, 3); ctx.fillStyle = "#2e9a4a"; ctx.fillRect(bx + 4, by + 4, 3, 3); ctx.fillRect(bx + 11, by + 4, 3, 3); ctx.fillRect(bx + 4, by + 10, 10, 2); ctx.fillRect(bx + 3, by + 9, 2, 2); ctx.fillRect(bx + 13, by + 9, 2, 2); }
}
function drawSTS(b) {
  const cr = b.crane, x = Math.round(cr.x), ty = Math.round(cr.y), h = 1 - (cr.hoist || 0);
  // shadow, cast down-right
  ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(x - 1, T + 10, 16, 11 * T); for (const lx of [x - 38, x + 42]) ctx.fillRect(lx, QUAY * T + 8, 8, 5 * T); ctx.fillRect(x - 38, QUAY * T + 4, 88, 8); ctx.fillRect(x - 38, 12 * T + 6, 88, 6);
  // portal legs on the quay rails, with sill beams and wheel bogies
  for (const lx of [x - 44, x + 36]) { ctx.fillStyle = "#9a3a22"; ctx.fillRect(lx, QUAY * T, 8, 5 * T); ctx.fillStyle = "#c8502c"; ctx.fillRect(lx + 1, QUAY * T, 3, 5 * T); }
  ctx.fillStyle = "#1e2024"; for (const lx of [x - 48, x + 32]) for (const ly of [QUAY * T - 10, 12 * T - 2]) ctx.fillRect(lx, ly, 16, 6);
  ctx.fillStyle = "#d8552e"; ctx.fillRect(x - 44, QUAY * T - 6, 88, 10); ctx.fillRect(x - 44, 12 * T - 4, 88, 8);
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x - 44, QUAY * T + 2, 88, 2); ctx.fillRect(x - 44, 12 * T + 2, 88, 2);
  // the boom, a lattice girder out over the water, and its back reach
  ctx.fillStyle = "#e8653a"; ctx.fillRect(x - 7, T, 14, 11 * T);
  ctx.fillStyle = "#a8442a"; ctx.fillRect(x - 7, T, 2, 11 * T); ctx.fillRect(x + 5, T, 2, 11 * T);
  ctx.strokeStyle = "rgba(120,40,20,.75)"; ctx.lineWidth = 1.5; ctx.beginPath(); for (let y = T; y < 12 * T; y += 14) { ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y + 7); ctx.lineTo(x - 5, y + 14); } ctx.stroke();
  // machinery house at the back, warning light at the tip
  ctx.fillStyle = "#4a4e56"; ctx.fillRect(x - 12, 12 * T - 2, 24, 18); ctx.fillStyle = "#e8653a"; ctx.fillRect(x - 12, 12 * T - 2, 24, 3); ctx.fillStyle = "#2a2c30"; ctx.fillRect(x - 8, 12 * T + 6, 16, 3);
  ctx.fillStyle = Math.sin(clock * 4 + b.id) > 0.2 ? "#ff4a3a" : "#5a2018"; ctx.fillRect(x - 2, T - 2, 4, 4);
  // trolley, spreader and what it holds
  if (cr.hold2) drawBox(cr.hold2, x + 5, ty + 7, 0, h);
  if (cr.hold !== null) drawBox(cr.hold, x, ty, 0, h); else drawSpreader(x, ty, 0, h);
  ctx.fillStyle = "#2a2c30"; ctx.fillRect(x - 10, ty - 8, 20, 16); ctx.fillStyle = "#e8b432"; ctx.fillRect(x - 10, ty - 8, 20, 2);
}
function drawRTG(b) {
  const cr = b.rtg, gy = Math.round(cr.y), x0 = b.x * T - 6, x1 = (b.x + b.w) * T + 6, tx = Math.round(cr.x), h = 1 - (cr.hoist || 0);
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x0 + 8, gy - 8, x1 - x0, 30);
  // rubber-tyred bogies, legs with hazard stripes, the girder and the operator's cab
  ctx.fillStyle = "#1e2024"; for (const lx of [x0 - 2, x1 - 12]) for (const ly of [gy - 20, gy + 12]) ctx.fillRect(lx, ly, 14, 8);
  ctx.fillStyle = "#3a6ab0"; ctx.fillRect(x0, gy - 14, 10, 28); ctx.fillRect(x1 - 10, gy - 14, 10, 28);
  ctx.fillStyle = "#e8b432"; for (let k = 0; k < 28; k += 8) { ctx.fillRect(x0, gy - 14 + k, 10, 3); ctx.fillRect(x1 - 10, gy - 14 + k, 10, 3); }
  ctx.fillStyle = "#4a7ac8"; ctx.fillRect(x0, gy - 6, x1 - x0, 12); ctx.fillStyle = "#2a4a80"; ctx.fillRect(x0, gy + 4, x1 - x0, 2); ctx.fillStyle = "#6a9ae0"; ctx.fillRect(x0, gy - 6, x1 - x0, 2);
  ctx.fillStyle = "#2a2c30"; ctx.fillRect(x1 - 22, gy - 13, 12, 10); ctx.fillStyle = "#9ad0f0"; ctx.fillRect(x1 - 20, gy - 11, 8, 4);
  // trolley, spreader and what it holds
  if (cr.hold !== null) drawBox(cr.hold, tx, gy, Math.PI / 2, h); else drawSpreader(tx, gy, Math.PI / 2, h * 0.6);
  ctx.fillStyle = "#1e2024"; ctx.fillRect(tx - 9, gy - 9, 18, 18); ctx.fillStyle = "#e8b432"; ctx.fillRect(tx - 9, gy - 9, 18, 2);
}
// locked things: dimmed, with their price
function priceTag(x, y, price) { const ok = money >= price, txt = "$" + price.toLocaleString(); ctx.font = "800 18px 'Big Shoulders Display', Impact, sans-serif"; const w = ctx.measureText(txt).width + 14; ctx.fillStyle = "rgba(10,14,20,.85)"; ctx.fillRect(x - w / 2, y - 12, w, 24); ctx.strokeStyle = ok ? "#7fd88a" : "#6a7080"; ctx.lineWidth = 2; ctx.strokeRect(x - w / 2, y - 12, w, 24); ctx.fillStyle = ok ? "#ece7dc" : "#8b919b"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, x, y + 1); }
function drawLocked() {
  ctx.fillStyle = "rgba(8,12,18,.62)";
  for (const b of BLOCKS) if (!b.open) ctx.fillRect(b.x * T - 4, b.y * T - 4, b.w * T + 8, (YROAD - b.y) * T + 4);
  for (const b of BERTHS) if (!b.open) ctx.fillRect(b.ex * T, QUAY * T, (b.ox - b.ex + 1) * T, 5 * T);
  for (let g = 1; g < STALLS.length / 4; g++) { const st = STALLS.filter((q) => q.group === g); if (!st[0].open) ctx.fillRect(st[0].i * T, LOT0 * T, 4 * T, TL * T); }
  for (const b of BLOCKS) if (!b.open) priceTag((b.x + b.w / 2) * T, (b.y + 6) * T, BLOCK_PRICE[b.id]);
  for (const b of BERTHS) if (!b.open) priceTag((b.ex + b.ox + 1) / 2 * T, (QUAY + 2.5) * T, CRANE_PRICE[b.id]);
  for (let g = 1; g < STALLS.length / 4; g++) { const st = STALLS.filter((q) => q.group === g); if (!st[0].open) priceTag((st[0].i + 2) * T, (LOT0 + 2) * T, STALL_PRICE[g]); }
}
// the money, and buying a tractor
let hudTxt = "";
function hud() {
  const p = tractorPrice(false), pa = tractorPrice(true), sp = !!tractorSpot(), txt = "$" + money.toLocaleString() + "|" + p + "|" + sp; if (txt === hudTxt) return; hudTxt = txt;
  $("money").textContent = "$" + money.toLocaleString();
  for (const [id, name, pr] of [["buy-tractor", "Manual", p], ["buy-auto", "Auto", pa]]) { const b = $(id); b.textContent = "+ " + name + " $" + pr.toLocaleString(); b.disabled = !sp || money < pr; }
}
$("buy-tractor").onclick = () => addTractor(false);
$("buy-auto").onclick = () => addTractor(true);
function spotRect(a) { if (a.kind === "tpark") return [PARK_X * T, a.spot.j * T, TL * T, T]; if (a.slot !== undefined) return slotRect(a.slot); if (a.lane) return [(a.berth.x + 5) * T, a.lane.r * T, TL * T, T]; if (a.kind === "sts" || a.kind === "wait") return [(a.berth.x + 5) * T, LINE * T, TL * T, 3 * T]; if (a.kind === "rtg") return a.bay ? [a.bay.i * T, BAY0 * T, T, TL * T] : [a.block.x * T, BAY0 * T, a.block.w * T, TL * T]; return [a.stall.i * T, LOT0 * T, T, TL * T]; }
// where a container is on the map, if anywhere
function boxAt(x) {
  for (const b of BLOCKS) for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) if (b.slots[c][r].includes(x)) return [(b.x + c + 0.5) * T, (b.y + r * CL + 1.5) * T];
  const s = DOCK.ship; if (s) for (let n = 0; n < s.bays.length; n++) if (s.bays[n].includes(x)) { const q = shipSlot(n); return [(DOCK.x + q.c * CL + 1.5) * T + s.off, (DOCK.top + q.r + 0.5) * T]; }
  for (const t of trucks) if (t.load === x) { const tr = trailerOf(t); return [tr.x, tr.y]; }
  for (const cr of [...BERTHS.map((b) => b.crane), ...BLOCKS.map((b) => b.rtg)]) if (cr.hold === x || cr.hold2 === x) return [cr.x, cr.y];
  return null;
}
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0b1218"; ctx.fillRect(0, 0, VW, VH);
  ctx.setTransform(DPR * zoom, 0, 0, DPR * zoom, Math.round(DPR * (VW / 2 - cam.x * zoom)), Math.round(DPR * (VH / 2 - cam.y * zoom)));
  drawWater();
  if (DOCK.ship) drawShip();
  drawSmoke();
  ctx.drawImage(GROUND, 0, QUAY * T, MW * T, (MH - QUAY) * T, 0, QUAY * T, MW * T, (MH - QUAY) * T);
  // (perf) each storage area's stacks are drawn once into a cached image, again only when its stacks change
  for (const b of BLOCKS) {
    if (!b.layer) { b.layer = canvas(b.cols * T, b.rows * CL * T); b.layerVer = 0; b.layerSig = ""; }
    if (b.layerVer !== STACK_VER) {
      b.layerVer = STACK_VER; const sig = b.slots.map((col) => col.map((st) => st.map((x) => x.id).join(".")).join("|")).join("/");
      if (sig !== b.layerSig) { b.layerSig = sig; const g = b.layer.getContext("2d"); g.clearRect(0, 0, b.layer.width, b.layer.height); ctx = g; CACHING = true; for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) drawStack(c * T, r * CL * T, b.slots[c][r], b.exp ? "rgba(127,200,255,.35)" : "rgba(201,162,58,.35)"); CACHING = false; ctx = mainCtx; }
    }
    ctx.drawImage(b.layer, b.x * T, b.y * T);
  }
  if (selected && selected.kind === "cust" && selected.want) for (const b of BLOCKS) for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) if (b.slots[c][r].includes(selected.want)) flash((b.x + c) * T + 4, (b.y + r * CL) * T + 2, T - 8, CL * T - 4, posRGB(b.slots[c][r], selected.want));
  // (owner) a selected customer truck: a white dotted line to where its container is
  if (selected && selected.kind === "cust" && selected.load === null) {
    const at = boxAt(selected.want);
    if (at) { const tr = trailerOf(selected); ctx.setLineDash([2, 6]); ctx.lineCap = "round"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tr.x, tr.y); ctx.lineTo(at[0], at[1]); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = "butt"; }
  }
  // a selected auto tractor's RTG
  if (selected && selected.auto && selected.home) { const hb = selected.home; ctx.setLineDash([8, 6]); ctx.strokeStyle = "#5fd3d0"; ctx.lineWidth = 3; ctx.strokeRect(hb.x * T - 3, hb.y * T - 3, hb.w * T + 6, (YROAD - hb.y) * T + 6); ctx.setLineDash([]); }
  // the selected truck's queue: numbered spots joined in order
  if (selected) {
    const tr = trailerOf(selected); let px = tr.x, py = tr.y, n = 0; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
    for (const a of selected.cmd ? [selected.cmd, ...selected.queue] : selected.queue) {
      if (a.kind === "deliver") continue;
      const [rx, ry, rw, rh] = spotRect(a), sx = rx + rw / 2, sy = ry + rh / 2; n++;
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke(); px = sx; py = sy;
      ctx.strokeStyle = "#ffffff"; ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
      ctx.setLineDash([]); ctx.fillStyle = "#1e2024"; ctx.fillRect(rx - 4, ry - 4, 13, 13); ctx.fillStyle = "#ece7dc"; ctx.font = "800 10px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(n), rx + 2.5, ry + 3); ctx.setLineDash([5, 5]);
    }
    ctx.setLineDash([]);
  }
  // (perf) only what's on screen
  const vw = VW / 2 / zoom + 6 * T, vh = VH / 2 / zoom + 6 * T, onScreen = (x, y) => Math.abs(x - cam.x) < vw && Math.abs(y - cam.y) < vh;
  for (const t of trucks) { const [i, j] = unkey(t.tiles[0]); if (onScreen((i + 0.5) * T, (j + 0.5) * T)) drawTruck(t); }
  for (const b of BLOCKS) if (b.open) drawRTG(b);
  for (const b of BERTHS) if (b.open) drawSTS(b);
  drawLocked();
  for (const f of floats) { ctx.globalAlpha = Math.min(1, f.t); ctx.fillStyle = "#7fd88a"; ctx.font = "800 18px 'Big Shoulders Display', Impact, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(f.text, f.x, f.y - (1.6 - f.t) * 24); } ctx.globalAlpha = 1;
  if (selected && hover && !hover.truck) {
    const [i, j] = hover.tile, g = targetAt(i, j);
    const hb = homeFor(selected, i, j);
    if (hb) { ctx.strokeStyle = "#7fd88a"; ctx.lineWidth = 3; ctx.strokeRect(hb.x * T, hb.y * T, hb.w * T, (YROAD - hb.y) * T); }
    else if (g) { const a = planFor(selected, i, j) || slotSwap(selected, i, j); ctx.strokeStyle = a ? "#7fd88a" : "#ff5a4a"; ctx.lineWidth = 3; if (a) { const [rx, ry, rw, rh] = spotRect(a); ctx.strokeRect(rx, ry, rw, rh); } else if (g.kind === "sts") { const [rx, ry, rw, rh] = g.slot !== undefined ? slotRect(g.slot) : [(g.berth.x + 5) * T, LINE * T, TL * T, 3 * T]; ctx.strokeRect(rx, ry, rw, rh); } else if (g.kind === "rtg") ctx.strokeRect(g.block.x * T, g.block.y * T, g.block.w * T, (YROAD - g.block.y) * T); else ctx.strokeRect(g.stall.i * T, LOT0 * T, T, TL * T); }
  }
  if (bad) { ctx.strokeStyle = `rgba(255,90,74,${bad.t * 2})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bad.i * T + 8, bad.j * T + 8); ctx.lineTo(bad.i * T + T - 8, bad.j * T + T - 8); ctx.moveTo(bad.i * T + T - 8, bad.j * T + 8); ctx.lineTo(bad.i * T + 8, bad.j * T + T - 8); ctx.stroke(); }
}

// ---- loop ----
let last = performance.now();
function step(dt) {
  clock += dt;
  const pan = 520 / zoom * dt; if (keys.KeyW || keys.ArrowUp) cam.y -= pan; if (keys.KeyS || keys.ArrowDown) cam.y += pan; if (keys.KeyA || keys.ArrowLeft) cam.x -= pan; if (keys.KeyD || keys.ArrowRight) cam.x += pan;
  cam.x = clamp(cam.x, 0, MW * T); cam.y = clamp(cam.y, 0, MH * T);
  shipStep(dt); for (const b of BERTHS) if (b.open) stsStep(b, dt);
  sortLanes(); freeBays(); fillBays(); for (const b of BLOCKS) if (b.open) rtgStep(b, dt);
  for (let k = floats.length - 1; k >= 0; k--) if ((floats[k].t -= dt) <= 0) floats.splice(k, 1);
  hud();
  // (owner) customers come faster the more parking stalls are open
  custWait -= dt; if (custWait <= 0) { spawnCustomer(); custWait = (8 + rnd() * 6) / (1 + (STALLS.filter((q) => q.open).length - 4) / 16) / (0.3 + 4 * unclaimedFill()); }
  expWait -= dt; if (expWait <= 0) { spawnExport(); expWait = 10 + rnd() * 6; }
  claimStep(dt);
  for (const t of [...trucks]) { truckStep(t, dt); if (t.happy > 0) t.happy -= dt; if (t.sad > 0) t.sad -= dt; }
  if (selected && (!trucks.includes(selected) || selected.exiting)) selected = null;
  if (bad) { bad.t -= dt; if (bad.t <= 0) bad = null; }
}
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); draw(); requestAnimationFrame(frame); }
function resize() { DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight; cv.width = VW * DPR; cv.height = VH * DPR; zoom = clamp(Math.min(VW / (MW * T), VH / ((MH + 1) * T)), 0.3, 3); cam.y = (MH * T) / 2; }
addEventListener("resize", resize); resize();
buildGround();
if (document.fonts && document.fonts.load) document.fonts.load("800 20px 'Big Shoulders Display'").then(buildGround).catch(() => {});
requestAnimationFrame(frame);
window.Atamus = { addMoney: (n) => (money += n), buyAt: (i, j) => { const u = buyAt(i, j); if (u && money >= u.price) { money -= u.price; u.buy(); return true; } return false; }, addTractor, get money() { return money; }, get passes() { return passes; }, perf: PERF, get state() { return { trucks, dock: DOCK, berths: BERTHS, blocks: BLOCKS, stalls: STALLS, delivered, selected, occ }; }, get exported() { return exported; }, step, planFor, enqueue, slotSwap, doSwap, route, select: (t) => (selected = t) };
})();
