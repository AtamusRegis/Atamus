// Atamus (owner, 2026-10-31): a single-player container port. One big ship docks at a time and its two ship-to-shore cranes
// unload them, one container at a time, onto yard tractors lined up under them; tractors carry the containers to storage
// areas, each with an RTG crane at its end that stacks them three high; customer trucks with a colored cab come for a
// container of that color. You pick a truck and queue where it goes. Trucks follow one-way roads and never overlap: each
// holds the tiles under it and moves on only into free ones. 32 x 32 tiles, placeholder pixel art. Rules in
// docs/FEATURES.md.
"use strict";
(() => {
const $ = (id) => document.getElementById(id);
const cv = $("view"), ctx = cv.getContext("2d");
const TAU = Math.PI * 2, rnd = Math.random, hyp = Math.hypot, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---- the port: 54 x 42 tiles of 32 px ----
// rows 0–6 water (the ship's deck on rows 2–6), 7–8 the quay (crane rails), 9–11 the STS lanes, 12–13 the quay road,
// 14–25 storage, 26 the RTGs' rest, 27–28 the RTG lane, 29–32 the RTG bays, 33–34 the yard road, 35–38 the parking lot,
// 39–40 the lot road, 41 the fence. Every road has two lanes (owner). Containers are 3 tiles long (owner).
const T = 32, OX = 7, EXX = 12, MW = 54 + OX + EXX, MH = 42, QUAY = 7, LINE = 9, LANE_ROWS = [9, 10, 11], QROAD = 12, REST = 26, RLANE = 27, BAY0 = 29, YROAD = 33, LOT0 = 35, LROAD = 39, CL = 3, TL = 4;
const COLORS = [
  { name: "Red", c: "#d23c32" }, { name: "Orange", c: "#e8822a" }, { name: "Yellow", c: "#e8c832" }, { name: "Green", c: "#3aa04a" },
  { name: "Blue", c: "#3a7ad0" }, { name: "Purple", c: "#7a4ac8" }, { name: "White", c: "#d8dcdf" },
];
const key = (i, j) => i + "," + j, unkey = (k) => k.split(",").map(Number);
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
const BERTHS = [0, 1, 2, 3].map((id) => { const ex = 10 + id * BERTH_W, x = ex - 3; return { id, ex, x, ox: x + 5 + TL * LANE_DEEP, promised: 0, crane: { x: (x + 6) * T, y: (10 + 0.5) * T, hold: null, ops: [], truck: null } }; });
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
const LANES = [10, 18, 26, 34, 42].map((x) => x + OX), WEST = 2 + OX, EAST = 51 + OX + EXX;
// (owner, 2026-11-01) the tractor parking: one column of horizontal spots west of the port, drive-through westbound
// between two roads; new tractors appear here and idle ones park here
const PARK_X = 3, PARK = [...Array(13).keys()].map((k) => ({ j: 14 + k, claim: null }));
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

// ---- roads: one-way, a tile at a time (owner: an actual traffic rule), two lanes each (owner: one for passing) ----
// Tractors: STS lanes (west) → quay road west → down the west side or a lane between the storage areas → RTG lane east →
// into an RTG bay (southbound) → yard road east → up the east side → quay road west → into an STS lane. Customers come in
// up the west side from the south gate, take the yard road east and park in a stall (southbound); sent to an RTG, they
// leave by the lot road west, go up the west side to the RTG lane, and after loading leave by the yard road out the east
// gate. Each two-lane road has a travel lane (the right one) and a passing lane; a truck held up by a stopped truck
// changes lanes to pass. Bays, stalls and STS lanes are entered only by the truck going there.
const E = new Map(), CHG = new Map(), SLOW = new Set(), SPOT = new Map(), DIVS = [];
const add = (a, b, c, d) => { const k = key(a, b), n = key(c, d); if (!E.has(k)) E.set(k, []); if (!E.get(k).includes(n)) E.get(k).push(n); };
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
road(PARK_X + 4, QROAD + 1, 0, 1, RLANE - QROAD - 1, 1, 0, 1);               // the parking's east road, down to the RTG lane
road(PARK_X - 2, PARK[0].j, 0, 1, RLANE - PARK[0].j, 1, 0, 1);               // the parking's west road, down to the RTG lane
for (const p of PARK) { for (let x = PARK_X + 4; x > PARK_X - 1; x--) add(x, p.j, x - 1, p.j); for (const k of parkTiles(p)) SPOT.set(k, "P" + p.j); }
for (const c of [PARK_X + 4, PARK_X + 5, PARK_X - 2, PARK_X - 1]) add(c, RLANE, c, RLANE + 1);
add(PARK_X + 4, QROAD, PARK_X + 4, QROAD + 1); add(PARK_X + 5, QROAD, PARK_X + 5, QROAD + 1);
road(WEST, QROAD + 1, 0, 1, RLANE - QROAD - 1, 1, 0, 1);                    // west side, down to the RTG lane
for (const x of [WEST, ...LANES]) for (const c of [x, x + 1]) { add(c, QROAD, c, QROAD + 1); if (x !== WEST) add(c, RLANE, c, RLANE + 1); }
for (const x of LANES) road(x, QROAD + 1, 0, 1, RLANE - QROAD - 1, 1, 0, 1); // the lanes between the storage areas, down
road(PARK_X - 2, RLANE, 1, 0, EAST + 1 - (PARK_X - 2), 0, 1, 0);            // RTG lane, east (from the tractor parking)
road(EAST, YROAD + 1, 0, -1, YROAD + 1 - QROAD, 1, 0, 0);                   // east side, up to the quay road
road(WEST, YROAD, 1, 0, MW + 6 - WEST, 0, 1, 0);                            // yard road, east and out the east gate
road(WEST, MH + 5, 0, -1, MH + 5 - RLANE - 1, 1, 0, 0);                     // west side, up from the south gate to the RTG lane
road(STALLS[STALLS.length - 1].i + 2, LROAD, -1, 0, STALLS[STALLS.length - 1].i + 2 - WEST, 0, 1, 1);   // lot road, west
// (owner, 2026-11-01) two streets north from the yard road to the quay road, in the gaps after storage areas 2 and 4 (one
// lane each: the gap has room for one beside the lanes going down), so tractors can skip the trip round the east side;
// they cross the RTG lane, where a truck can also turn east
const UP_STREETS = [BLOCKS[1].x + 5, BLOCKS[3].x + 5];
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
for (const b of BLOCKS) for (const bay of b.bays) { for (let j = RLANE + 1; j < YROAD; j++) { add(bay.i, j, bay.i, j + 1); if (j > RLANE + 1) SPOT.set(key(bay.i, j), "Y" + bay.i); } SPOT.set(key(bay.i, YROAD - 1), "Y" + bay.i); }
for (const s of STALLS) for (let j = YROAD + 1; j < LROAD; j++) { add(s.i, j, s.i, j + 1); if (j > YROAD + 1) SPOT.set(key(s.i, j), "S" + s.i); }
for (const s of STALLS) SPOT.set(key(s.i, LROAD - 1), "S" + s.i);
const ROADSET = new Set(); for (const [k, l] of E) { ROADSET.add(k); for (const n of l) ROADSET.add(n); }
// cheapest way there: a lane change costs a bit more than a step, the passing lane a little more than the travel lane;
// avoid(k) rules tiles out (passing)
function route(fromK, toK, avoid) {
  const ts = SPOT.get(toK), dist = new Map([[fromK, 0]]), prev = new Map([[fromK, null]]), h = [[0, fromK]];
  const push = (e) => { h.push(e); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
  const pop = () => { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; };
  while (h.length) {
    const [d, k] = pop(); if (d > dist.get(k)) continue; if (k === toK) break;
    const cs = SPOT.get(k);
    for (const n of E.get(k) || []) {
      const ns = SPOT.get(n); if (ns && ns !== cs && ns !== ts) continue;
      if (avoid && n !== toK && avoid(n)) continue;
      const nd = d + (CHG.has(k + ">" + n) ? 1.3 : 1) + (SLOW.has(n) ? 0.3 : 0);
      if (!dist.has(n) || nd < dist.get(n)) { dist.set(n, nd); prev.set(n, k); push([nd, n]); }
    }
  }
  if (!prev.has(toK)) return null;
  const out = []; let k = toK; while (k !== fromK) { out.unshift(k); k = prev.get(k); }
  out.cost = dist.get(toK); return out;
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
for (const b of BLOCKS.slice(0, 1)) for (let n = 0; n < 14 + Math.floor(rnd() * 6); n++) { const c = Math.floor(rnd() * b.cols), r = Math.floor(rnd() * b.rows); if (b.slots[c][r].length < 3) b.slots[c][r].push(box(Math.floor(rnd() * COLORS.length))); }

// ---- ships ----
const HULLS = ["#5a6a7a", "#7a3a3a", "#3a5a4a", "#4a4a6a", "#6a5a3a"];
// (owner, 2026-11-01) small, medium and large ships: slot columns from the west end x deck rows nearest the quay; each
// has until its timer runs out (counting once docked) to be unloaded, then sails with whatever is left
const SIZES = [{ name: "small", cols: 6, rows: 3, w: 0.35 }, { name: "medium", cols: 10, rows: 4, w: 0.4 }, { name: "large", cols: 14, rows: 5, w: 0.25 }];
const onDeck = (s, k) => { const q = shipSlot(k); return q.c < s.cols && q.r >= DOCK.rows - s.rows; };
function newShip() {
  let u = rnd(), z = SIZES[0]; for (const q of SIZES) { if (u < q.w) { z = q; break; } u -= q.w; }
  const s = { off: -60 * T, state: "arrive", size: z.name, cols: z.cols, rows: z.rows, hull: pick(HULLS), bays: Array.from({ length: DOCK.cols * DOCK.rows }, () => []), claims: Array(DOCK.cols * DOCK.rows).fill(0) };   // (owner) 3 x 1 horizontal slots
  s.bays.forEach((st, k) => { if (!onDeck(s, k)) return; const n = Math.floor(rnd() * 4); for (let q = 0; q < n; q++) st.push(box(Math.floor(rnd() * COLORS.length))); });
  s.time = SHIP_TIME_BASE + SHIP_TIME_PER * shipCount(s);
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
      t.stall = null; t.cmd = null; t.queue = []; t.exiting = true; t.sad = 2.5; goTo(t, key(MW + 5, YROAD + 1));
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
function goTo(t, k) { const from = t.next || head(t); t.path = (t.next ? [t.next] : []).concat(route(from, k) || []); }
// (owner, 2026-11-01) most customer trucks come without a container picked (a grey cab) and park; now and then (every
// 30–70 s with storage empty, much faster the more unclaimed containers are stored, a little faster with more stalls) one of them, the longest waiting, picks a container already in
// storage that nobody wants yet, takes its color and goes for it. The rest (CLAIM_SHIP) come
// for a container on the docked ship, anywhere in a slot's stack. So most ship cargo is stored unclaimed and the stacks
// fill up.
const CLAIM_SHIP = 0.3;
// (owner) dynamic: low stacks, few trucks (time to fill); high stacks, many trucks (to empty them). The fuller storage is
// with containers nobody has claimed, the more customers come (a third of the base rate with none, over four times with
// it full), the more of them come grey, and the sooner grey ones pick. 0 with none unclaimed, 1 with every open storage
// area full of them.
const unclaimedFill = () => { const n = BLOCKS.filter((b) => b.open && !b.exp).length * 60; return n ? storedFree().length / n : 0; };
const storedFree = () => { const out = []; for (const b of BLOCKS) if (b.open && !b.exp) for (const col of b.slots) for (const st of col) for (const x of st) if (!x.wantedBy) out.push(x); return out; };
const shipFree = () => { const out = [], s = DOCK.ship; if (s && s.state === "docked") for (const st of s.bays) for (const x of st) if (!x.exp && !x.wantedBy) out.push(x); return out; };
function spawnCustomer() {
  const stall = STALLS.slice().reverse().find((s) => s.open && !s.claim); if (!stall) return;
  const tiles = [1, 2, 3, 4].map((d) => key(WEST + 1, MH + d)); if (tiles.some((k) => occ.has(k))) return;
  const ship = rnd() < CLAIM_SHIP * (1 - unclaimedFill()) ? shipFree() : [], want = ship.length ? pick(ship) : null, t = mkTruck("cust", tiles, want);
  if (want) want.wantedBy = t; else t.since = clock;
  stall.claim = t; t.cmd = { kind: "park", stall }; goTo(t, key(stall.i, LOT0 + 3));
}
let claimWait = 20;
function claimStep(dt) {
  if ((claimWait -= dt) > 0) return;
  const t = trucks.filter((q) => q.kind === "cust" && !q.want && !q.exiting).sort((a, b) => a.since - b.since)[0], pool = storedFree();
  if (!t || !pool.length) { claimWait = 4; return; }
  t.want = pick(pool); t.want.wantedBy = t;
  claimWait = (30 + rnd() * 40) / (1 + (STALLS.filter((q) => q.open).length - 4) / 32) / (0.6 + 10 * unclaimedFill());
}

// what a truck will carry once its queue is done: null, "imp" or "exp"
function loadAfter(t) { let l = t.load ? (t.load.exp ? "exp" : "imp") : null; for (const a of t.cmd ? [t.cmd, ...t.queue] : t.queue) l = a.kind === "deliver" ? null : a.kind === "sts" ? (a.pick === false ? null : "imp") : a.kind === "rtg" ? (t.kind === "cust" ? "imp" : a.pickup ? "exp" : null) : l; return l; }
// (owner) export trucks come in at the southwest gate with a container for the export area (when it's open and has
// room for one more), drop it at its RTG and leave
function spawnExport() {
  const b = BLOCKS.find((q) => q.exp && q.open); if (!b) return;
  if (free(b) - trucks.filter((t) => t.kind === "exp" && t.load).length <= 0) return;
  const tiles = [1, 2, 3, 4].map((d) => key(WEST + 1, MH + d)); if (tiles.some((k) => occ.has(k))) return;
  const t = mkTruck("exp", tiles, null); t.load = box(Math.floor(rnd() * COLORS.length)); t.load.exp = true;
  startCmd(t, { kind: "rtg", block: b });
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
  return !loaded && holds(b, t.want) ? { kind: "rtg", block: b } : null;
}
function claim(t, a, d) {
  if (a.kind === "sts") { if (a.pick !== false) a.berth.promised += d; if (a.slot !== undefined && DOCK.ship) DOCK.ship.claims[a.slot] += d; }
  else if (a.kind === "park") a.stall.claim = d > 0 ? t : null;
}
function enqueue(t, a) { if (a.deliverFirst) { delete a.deliverFirst; t.queue.push({ kind: "deliver" }); } claim(t, a, 1); t.queue.push(a); }
function unqueueLast(t) { const a = t.queue.pop(); if (a) claim(t, a, -1); if (t.queue.length && t.queue[t.queue.length - 1].kind === "deliver") t.queue.pop(); return !!a; }
// (owner) an RTG's 5 bays are one queue: a truck heading there waits in line on the RTG lane at the area's west end
// until a bay clears, first come first served, then takes it
const lineKey = (b) => key(b.x, RLANE + 1);
const targetKey = (a, t) => (a.kind === "tpark" ? key(PARK_X, a.spot.j) : a.lane ? laneSpot(t) : a.kind === "rtg" ? (a.bay ? key(a.bay.i, BAY0 + 3) : lineKey(a.block)) : key(a.stall.i, LOT0 + 3));
const inLine = (t, b) => t.cmd && t.cmd.kind === "rtg" && !t.cmd.bay && (!b || t.cmd.block === b);
function fillBays() {
  for (const b of BLOCKS) {
    if (!b.open) continue;
    for (const bay of b.bays) {
      if (bay.claim) continue;
      let t = null; for (const q of trucks) if (inLine(q, b) && !q.locked && (!t || q.path.length < t.path.length)) t = q;
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
  } else leaveLane(t);
  if (t.bay) { if (t.bay.claim === t) t.bay.claim = null; t.bay = null; }
  if (t.park && !(a.kind === "tpark" && a.spot === t.park)) { if (t.park.claim === t) t.park.claim = null; t.park = null; }
  if (t.stall && t.stall.claim === t && !(a.kind === "park" && a.stall === t.stall)) t.stall.claim = null;
  t.stall = null; t.cmd = a; goTo(t, targetKey(a, t));
  return true;
}
// (owner) a customer truck whose container is in a storage area goes to that RTG by itself: from its stall, or straight
// there if it hasn't parked yet (giving up its stall)
function custStep(t) {
  if (t.kind !== "cust" || t.exiting || t.load !== null || t.queue.length || (t.cmd && t.cmd.kind !== "park")) return;
  const b = BLOCKS.find((q) => q.open && holds(q, t.want)); if (!b) return;
  if (t.cmd) t.cmd.stall.claim = null;
  t.cmd = null; startCmd(t, { kind: "rtg", block: b });
}
// (owner) a tractor with nothing to do drives to a free tractor parking spot (the nearest to the top first) and parks;
// sent somewhere on the way, it gives the spot up
// can the first queued step start now? (a drop-off needs somewhere to go; a crane trip a free spot in its line and a
// ship to work)
function canStart(t) {
  const a = t.queue[0]; if (!a) return false;
  if (a.kind === "deliver") return !t.load || !!deliverAction(t, false);
  if (a.kind === "sts") { const s = DOCK.ship, l = laneFor(a.berth, t); return !!s && (s.state === "docked" || s.state === "closing") && (t.lane === l || l.q.length < LANE_DEEP); }
  return true;
}
function idleStep(t) {
  if (t.kind !== "yard" || t.next || t.locked) return;
  const ready = canStart(t);
  if (t.cmd && t.cmd.kind === "tpark" && ready) { t.cmd.spot.claim = null; t.cmd = null; return; }
  if (t.cmd || ready || t.park) return;   // (bug 2026-11-01) a tractor whose next step can't start yet waits in the parking
  const p = PARK.find((q) => !q.claim); if (!p) return;
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
  const dest = own || (t.auto && t.home && !t.home.exp ? null : BLOCKS.filter((b) => b.open && !b.exp && free(b) > 0).reduce((m, b) => (!m || Math.abs(b.x + 2 - hx) < Math.abs(m.x + 2 - hx) ? b : m), null));
  return dest ? { kind: "rtg", block: dest } : null;
}
function deliverStep(t) {
  if (t.kind !== "yard" || !t.load || t.cmd || t.next || t.queue.length || t.locked) return;
  const a = deliverAction(t, true); if (a) enqueue(t, a);
}

// (bug 2026-11-01) a tractor's RTG trip is called off when it has nothing to deliver, or its storage area has filled up
// meanwhile; it goes to park and takes new orders
function dropTrip(t) {
  if (t.cmd.bay && t.cmd.bay.claim === t) t.cmd.bay.claim = null;
  t.cmd = null; t.path = t.next ? [t.next] : [];
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
    if ((!o || o === t) && (!ob || ob === t)) { occ.set(n, t); t.next = n; t.p = 0; t.blocked = 0; }
    else if ((t.blocked = (t.blocked || 0) + dt) > 0.5) {
      t.blocked = 0;
      if (o && o !== t) { if (!o.next) pass(t); }
      else { const r = route(head(t), t.path[t.path.length - 1], (k) => k === n); if (r && r.length) t.path = r; }   // (bug) two side by side each changing into the other's lane: carry straight on instead
    }
  }
  if (t.next) {
    t.p += 4 * dt;
    if (t.p >= 1) {
      t.tiles.unshift(t.next); const tail = t.tiles.pop(); if (occ.get(tail) === t) occ.delete(tail);
      t.next = null; t.p = 0; t.path.shift();
      if (t.exiting && !t.path.length) { for (const k of t.tiles) if (occ.get(k) === t) occ.delete(k); t.gone = true; trucks.splice(trucks.indexOf(t), 1); return; }
      if (!t.path.length && t.cmd && t.cmd.kind === "park") { t.stall = t.cmd.stall; t.cmd = null; }
      else if (!t.path.length && t.cmd && t.cmd.kind === "tpark") { t.park = t.cmd.spot; t.cmd = null; }
      else if (!t.path.length && t.cmd && t.cmd.kind === "wait") t.cmd = null;
    }
  }
}
// (owner) held up by a stopped truck: take the other lane round it, if that isn't much longer
function pass(t) {
  const o = occ.get(t.path[0]); if (o && inLine(o) && inLine(t, o.cmd.block)) return;   // no jumping the RTG line
  const goal = t.path[t.path.length - 1], now = route(head(t), goal); if (!now) return;
  const r = route(head(t), goal, (k) => { const o = occ.get(k); return o && o !== t && !o.next; });
  if (r && r.length && r[0] !== t.path[0] && r.cost <= now.cost + 8) { t.path = r; passes++; }
}
function doneServing(t) {
  const a = t.cmd; t.cmd = null; t.locked = false;
  if (a && a.kind === "rtg") { if (t.kind === "yard") t.bay = a.bay; else a.bay.claim = null; }   // a tractor keeps its bay until its next trip
  if (t.queue.length) return;
  if (t.kind === "exp") { t.exiting = true; goTo(t, key(MW + 5, YROAD + 1)); }
  if (t.kind === "cust") { t.happy = 1.8; t.exiting = true; delivered++; money += INCOME; const tr = trailerOf(t); floats.push({ x: tr.x, y: tr.y - 20, t: 1.6, text: "+$" + INCOME }); goTo(t, key(MW + 5, YROAD + 1)); }
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
const CRANE_SP = 130, LIFT = 0.55;
function craneStep(cr, dt, onDone) {
  const op = cr.ops[0]; if (!op) return;
  if (op.to) { const [tx, ty] = typeof op.to === "function" ? op.to() : op.to, dx = tx - cr.x, dy = ty - cr.y, sp = CRANE_SP * dt; cr.x += clamp(dx, -sp, sp); cr.y += clamp(dy, -sp, sp); if (Math.abs(tx - cr.x) < 0.5 && Math.abs(ty - cr.y) < 0.5) { cr.x = tx; cr.y = ty; cr.ops.shift(); if (!cr.ops.length) onDone(); } return; }
  op.t = (op.t || 0) + dt; if (op.t < LIFT) return;
  // (owner) an STS crane can hold a second container (hold2)
  if (op.lift) { const s = op.lift, x = s.stack ? s.stack.pop() : s.truck.load; if (!s.stack) s.truck.load = null; if (s.second) cr.hold2 = x; else cr.hold = x; if (op.then) op.then(); }
  else if (op.lower) { const s = op.lower, x = s.second ? cr.hold2 : cr.hold; if (s.stack) s.stack.push(x); else s.truck.load = x; if (s.second) cr.hold2 = null; else cr.hold = null; if (op.then) op.then(); }
  cr.ops.shift(); if (!cr.ops.length) onDone();
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
    if (cr.hold2 && !coming(b)) { const k = nearest((st) => st.length < 3 && (!st.length || impCount(st))); if (k >= 0) cr.ops = [{ to: [sx(k), sy(k)] }, { lower: { stack: s.bays[k], second: true } }]; }
    else if (s.state === "docked" && sortShip(b)) { /* digging out a wanted container comes first (owner) */ }
    else if (!cr.hold2 && coming(b) && s.state === "docked") { const k = nearest((st, kk) => impCount(st) - s.claims[kk] > 0 && !BERTHS.some((q) => q.crane.slot === kk || q.crane.slot2 === kk)); if (k >= 0) cr.ops = [{ to: [sx(k), sy(k)] }, { lift: { stack: s.bays[k], second: true } }]; }
    else if (s.state === "docked") compressShip(b);
  }
  craneStep(cr, dt, () => {
    cr.slot = undefined; cr.slot2 = undefined; const t = cr.truck, t2 = cr.truck2; cr.truck = null; cr.truck2 = null;
    if (t) doneServing(t); if (t2) doneServing(t2);
  });
}
// a tractor on its way to this crane right now that could take a spare (empty or bringing an export, not sent for a
// particular slot), other than t
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
    const ready = trucks.filter((q) => q.cmd && q.cmd.kind === "rtg" && q.cmd.block === b && q.cmd.bay && !q.next && !q.locked && head(q) === key(q.cmd.bay.i, BAY0 + 3));
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
    const ready = trucks.filter((q) => q.cmd && q.cmd.kind === "rtg" && q.cmd.block === b && q.cmd.bay && !q.next && !q.locked && head(q) === key(q.cmd.bay.i, BAY0 + 3));
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
function arrow(g, i, j, dx, dy) { const cx = (i + 0.5) * T, cy = (j + 0.5) * T; g.save(); g.translate(cx, cy); g.rotate(Math.atan2(dy, dx)); g.fillStyle = "rgba(255,255,255,.16)"; g.beginPath(); g.moveTo(7, 0); g.lineTo(-4, -5); g.lineTo(-4, 5); g.fill(); g.restore(); }
function buildGround() {
  const g = GROUND.getContext("2d");
  for (let j = QUAY; j < MH; j++) for (let i = 0; i < MW; i++) {
    const x = i * T, y = j * T;
    if (ROADSET.has(key(i, j))) { noiseFill(g, x, y, T, T, "#2c2f35", 10, i * 7 + j * 3); continue; }
    if (j === MH - 1 || i === 0 || i === MW - 1) { noiseFill(g, x, y, T, T, "#3a3a34", 18, i * 31 + j * 17); g.fillStyle = "#55565c"; g.fillRect(x, y + 10, T, 2); g.fillRect(x, y + 20, T, 2); g.fillStyle = "#1e1e22"; g.fillRect(x + 14, y + 4, 4, 24); continue; }
    noiseFill(g, x, y, T, T, "#6a6c70", 12, i * 13 + j * 29); g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(x, y, T, 1); g.fillRect(x, y, 1, T);
    if (j === QUAY) { g.fillStyle = "#c9a23a"; for (let k = 0; k < T; k += 8) g.fillRect(x + k, y, 4, 3); }
  }
  // the dashed line between a road's two lanes, and direction arrows (every few tiles)
  g.strokeStyle = "rgba(236,231,220,.28)"; g.lineWidth = 2; g.setLineDash([10, 10]);
  for (const [x, y, dx, dy, n, ox, oy] of DIVS) { const sx = (x + 0.5 + ox / 2) * T, sy = (y + 0.5 + oy / 2) * T; g.beginPath(); g.moveTo(sx + dx * T / 2, sy + dy * T / 2); g.lineTo(sx + dx * (n - 0.5) * T, sy + dy * (n - 0.5) * T); g.stroke(); }
  g.setLineDash([]);
  for (const [k, l] of E) { const [i, j] = unkey(k); if (i < 0 || i >= MW || (i + j) % 3) continue; for (const n of l) { if (CHG.has(k + ">" + n)) continue; const [ni, nj] = unkey(n); arrow(g, i, j, ni - i, nj - j); } }
  // the STS lines, the RTG bays, the parking stalls
  for (const b of BERTHS) { g.strokeStyle = "rgba(242,169,59,.55)"; g.lineWidth = 2; for (const l of b.lanes) for (let d = 0; d < LANE_DEEP; d++) { const rgb = l.kind === "auto" ? "95,211,208" : "242,169,59"; g.strokeStyle = `rgba(${rgb},${d ? 0.22 : 0.55})`; g.strokeRect((b.x + 5 + TL * d) * T + 2, l.r * T + 2, TL * T - 4, T - 4); } g.fillStyle = "#e8e2d0"; g.font = "800 20px 'Big Shoulders Display', Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String.fromCharCode(65 + b.id), (b.ex + 0.5) * T, (QUAY + 1) * T); }
  for (const b of BLOCKS) {
    noiseFill(g, b.x * T, b.y * T, b.w * T, b.h * T, "#55575c", 10, b.id * 9 + 1); noiseFill(g, b.x * T, REST * T, b.w * T, T, "#4a4c52", 8, b.id + 3);
    g.fillStyle = b.exp ? "rgba(127,200,255,.6)" : "rgba(201,162,58,.5)"; g.fillRect(b.x * T, b.y * T, b.w * T, 2); g.fillRect(b.x * T, (b.y + b.h) * T - 2, b.w * T, 2); g.fillRect(b.x * T, b.y * T, 2, b.h * T); g.fillRect((b.x + b.w) * T - 2, b.y * T, 2, b.h * T);
    if (b.exp) { g.fillStyle = "rgba(127,200,255,.45)"; g.font = "800 16px 'Big Shoulders Display', Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("EXPORT", (b.x + b.w / 2) * T, (REST + 0.5) * T); }
    for (const bay of b.bays) { g.strokeStyle = "rgba(127,200,255,.35)"; g.lineWidth = 2; g.strokeRect(bay.i * T + 2, BAY0 * T + 2, T - 4, TL * T - 4); }
  }
  for (const p of PARK) { g.strokeStyle = "rgba(232,180,50,.4)"; g.lineWidth = 2; g.strokeRect(PARK_X * T + 2, p.j * T + 2, TL * T - 4, T - 4); }
  for (const s of STALLS) { g.strokeStyle = "rgba(255,255,255,.22)"; g.lineWidth = 2; g.strokeRect(s.i * T + 2, LOT0 * T + 2, T - 4, TL * T - 4); }
}
function drawWater() {
  ctx.fillStyle = "#1a4a6a"; ctx.fillRect(-30 * T, -10 * T, (MW + 60) * T, (QUAY + 10) * T);
  ctx.fillStyle = "rgba(255,255,255,.07)";
  for (let j = -6; j < QUAY; j++) for (let i = -20; i < MW + 20; i += 2) { const o = Math.round(((clock * 12 + j * 37) % 64)) - 32; ctx.fillRect(i * T + o + (j % 2) * 20, j * T + 14, 14, 2); }
}
// (owner) a stack drawn as three squares down its 1 x 3 footprint: top square the top of the stack, bottom the bottom
// a ship's slot: the same three squares, left to right (left the top of the stack, right the bottom)
const shipSlot = (k) => ({ c: k % DOCK.cols, r: Math.floor(k / DOCK.cols) });
const slotRect = (k) => { const q = shipSlot(k); return [(DOCK.x + q.c * CL) * T + Math.round(DOCK.ship ? DOCK.ship.off : 0), (DOCK.top + q.r) * T, CL * T, T]; };
// (owner) the selected customer truck's container flashes wherever it is
// (owner) with no customer truck selected, the containers on the ship that a customer is waiting for flash instead
// (owner) a container on the ship that a customer is waiting for flashes until enough tractors are queued for its slot to
// dig down to it (a crane on its way to the slot counts as one)
const flashing = (x, slot, st) => { if (!x) return false; if (selected && selected.kind === "cust") return selected.want === x; if (slot === undefined || !x.wantedBy || !DOCK.ship) return false; const need = st.length - st.indexOf(x), have = DOCK.ship.claims[slot] + BERTHS.reduce((n, b) => n + (b.crane.slot === slot ? 1 : 0) + (b.crane.slot2 === slot ? 1 : 0), 0); if (have >= need) return false;
  // (bug 2026-11-01) and only while you could still claim it: not once its crane's containers are all spoken for (it
  // will be fetched anyway), nor with its slot fully claimed
  const c = slot % DOCK.cols, b = BERTHS.find((q) => q.open && c >= craneCols(q)[0] && c < craneCols(q)[1]);
  return !!b && berthLeft(b) > 0 && impCount(st) - DOCK.ship.claims[slot] > 0; };
function flash(x, y, w, h) { const a = 0.5 + 0.5 * Math.sin(clock * 10); ctx.fillStyle = `rgba(255,255,255,${0.55 * a})`; ctx.fillRect(x, y, w, h); ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.6 * a})`; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, w + 4, h + 4); }
// (owner) the bottom container of a stack is drawn darker and the top one lighter
const TIER_SHADE = ["rgba(0,0,0,.58)", "rgba(0,0,0,.18)", "rgba(255,255,255,.4)"];
function drawStackH(x, y, st, frame, slot) {   // on the ship
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x + 2, y + 2, CL * T - 4, T - 4);
  for (let k = 0; k < 3; k++) {
    const tier = 2 - k, c = st[tier], sx = x + k * T + 4, sy = y + 4;
    if (c === undefined) { ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(sx, sy, T - 8, T - 8); continue; }
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(sx - 1, sy - 1, T - 6, T - 6);
    ctx.fillStyle = COLORS[c.c].c; ctx.fillRect(sx, sy, T - 8, T - 8);
    ctx.fillStyle = TIER_SHADE[tier]; ctx.fillRect(sx, sy, T - 8, T - 8);
    ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(sx, sy, T - 8, 2); ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(sx, sy + T - 11, T - 8, 3);
    if (c.exp) { ctx.fillStyle = "rgba(8,16,30,.6)"; ctx.fillRect(sx + 6, sy + 6, T - 20, T - 20); }   // exports: a dark center
    if (flashing(c, slot, st)) flash(sx, sy, T - 8, T - 8);
  }
  if (frame) { ctx.strokeStyle = frame; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, CL * T - 3, T - 3); }
}
function drawStack(x, y, st, frame) {
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x + 2, y + 2, T - 4, CL * T - 4);
  for (let k = 0; k < 3; k++) {
    const tier = 2 - k, c = st[tier], sx = x + 4, sy = y + k * T + 4;
    if (c === undefined) { ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(sx, sy, T - 8, T - 8); continue; }
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(sx - 1, sy - 1, T - 6, T - 6);
    ctx.fillStyle = COLORS[c.c].c; ctx.fillRect(sx, sy, T - 8, T - 8);
    ctx.fillStyle = TIER_SHADE[tier]; ctx.fillRect(sx, sy, T - 8, T - 8);
    ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(sx, sy, T - 8, 2); ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(sx, sy + T - 11, T - 8, 3);
    if (c.exp) { ctx.fillStyle = "rgba(8,16,30,.6)"; ctx.fillRect(sx + 6, sy + 6, T - 20, T - 20); }   // exports: a dark center
    if (flashing(c)) flash(sx, sy, T - 8, T - 8);
  }
  if (frame) { ctx.strokeStyle = frame; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, T - 3, CL * T - 3); }
}
function drawBox(c, cx, cy, ang, lifted) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
  if (lifted) { ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(-CL * T / 2 + 6, -T / 2 + 8, CL * T - 4, T - 6); ctx.translate(-3, -5); }
  ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(-CL * T / 2 + 1, -T / 2 + 3, CL * T - 2, T - 6);
  ctx.fillStyle = COLORS[c.c].c; ctx.fillRect(-CL * T / 2 + 2, -T / 2 + 4, CL * T - 4, T - 8);
  ctx.fillStyle = "rgba(0,0,0,.2)"; for (let k = -CL * T / 2 + 6; k < CL * T / 2 - 4; k += 5) ctx.fillRect(k, -T / 2 + 5, 1, T - 10);
  ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fillRect(-CL * T / 2 + 2, -T / 2 + 4, CL * T - 4, 2);
  if (c.exp) { ctx.fillStyle = "rgba(8,16,30,.6)"; ctx.fillRect(-CL * T / 2 + 10, -T / 2 + 10, CL * T - 20, T - 20); }
  if (flashing(c)) flash(-CL * T / 2 + 2, -T / 2 + 4, CL * T - 4, T - 8);
  ctx.restore();
}
function drawShip() {
  const s = DOCK.ship, x = DOCK.x * T + Math.round(s.off), y = (DOCK.top + DOCK.rows - s.rows - 1) * T + 14, w = s.cols * CL * T, h = (s.rows + 1) * T + 2;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x - 10, y + 6, w + 50, h);
  ctx.fillStyle = s.hull; ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(x + w + 8, y); ctx.lineTo(x + w + 44, y + h / 2); ctx.lineTo(x + w + 8, y + h); ctx.lineTo(x - 20, y + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#c8ccd0"; ctx.fillRect(x - 20, y, w + 28, 3); ctx.fillRect(x - 20, y + h - 3, w + 28, 3);
  ctx.fillStyle = "#e8e2d0"; ctx.fillRect(x - 18, y + 10, 14, h - 20); ctx.fillStyle = "#6ab8e8"; ctx.fillRect(x - 15, y + 16, 8, 8);
  s.bays.forEach((st, k) => { if (!onDeck(s, k)) return; const q = shipSlot(k); drawStackH(x + q.c * CL * T, (DOCK.top + q.r) * T, st, "rgba(0,0,0,.4)", k); });
  // the time it has left
  if (s.state === "docked" || s.state === "closing") {
    const sec = Math.max(0, Math.ceil(s.time)), txt = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"), low = sec <= 30;
    ctx.font = "800 18px 'Big Shoulders Display', Impact, sans-serif"; const tw = ctx.measureText(txt).width + 14, tx = x + w + 56 + tw / 2, ty = y + h / 2;
    ctx.fillStyle = "rgba(10,14,20,.85)"; ctx.fillRect(tx - tw / 2, ty - 12, tw, 24); ctx.strokeStyle = low ? "#ff5a4a" : "#6a7080"; ctx.lineWidth = 2; ctx.strokeRect(tx - tw / 2, ty - 12, tw, 24);
    ctx.fillStyle = low && Math.sin(clock * 8) > 0 ? "#ff5a4a" : "#ece7dc"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, tx, ty + 1);
  }
  if (s.state !== "docked") { ctx.fillStyle = "rgba(255,255,255,.35)"; for (let k = 0; k < 4; k++) ctx.fillRect(x - 30 - k * 12 - ((clock * 40) % 12), y + 14 + k * 10, 8, 2); }
}
function rectBetween(a, b, w, fill) { const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, l = hyp(b[0] - a[0], b[1] - a[1]), an = Math.atan2(a[1] - b[1], a[0] - b[0]); ctx.save(); ctx.translate(cx, cy); ctx.rotate(an); ctx.fillStyle = fill; ctx.fillRect(-l / 2, -w / 2, l, w); ctx.restore(); }
function drawTruck(t) {
  const s = shapeOf(t), sel = t === selected, hov = hover && hover.truck === t;
  if (sel || hov) { ctx.strokeStyle = sel ? "#ffffff" : "rgba(255,255,255,.45)"; ctx.lineWidth = sel ? 28 + 2 * Math.sin(clock * 8) : 26; ctx.lineCap = "round"; ctx.globalAlpha = sel ? 0.5 : 0.25; ctx.beginPath(); ctx.moveTo(s.front[0], s.front[1]); ctx.lineTo(s.cabBack[0], s.cabBack[1]); ctx.lineTo(s.trBack[0], s.trBack[1]); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = "butt"; }
  rectBetween([s.trFront[0] + 3, s.trFront[1] + 4], [s.trBack[0] + 3, s.trBack[1] + 4], 22, "rgba(0,0,0,.3)");
  rectBetween(s.trFront, s.trBack, 18, "#4a4e56");
  rectBetween(s.front, s.cabBack, 24, "#1e2024");
  rectBetween(s.front, s.cabBack, 20, t.kind === "cust" ? (t.want ? COLORS[t.want.c].c : WAIT_CAB) : t.kind === "exp" ? EXP_CAB : t.auto ? AUTO_CAB : "#e8b432");
  const an = Math.atan2(s.front[1] - s.cabBack[1], s.front[0] - s.cabBack[0]); ctx.save(); ctx.translate(s.front[0], s.front[1]); ctx.rotate(an); ctx.fillStyle = "#9ad0f0"; ctx.fillRect(-9, -7, 4, 14); ctx.restore();
  if (t.load !== null) { const tr = trailerOf(t); drawBox(t.load, tr.x, tr.y, tr.a, false); }
  if (t.num) { const m = [(s.front[0] + s.cabBack[0]) / 2, (s.front[1] + s.cabBack[1]) / 2]; ctx.fillStyle = "#1e2024"; ctx.fillRect(m[0] - 6, m[1] - 6, 12, 12); ctx.fillStyle = "#ece7dc"; ctx.font = "800 10px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(t.num), m[0], m[1] + 0.5); }
  if (t.sad > 0) { const bx = s.front[0] + 8, by = s.front[1] - 34; ctx.fillStyle = "#ffffff"; ctx.fillRect(bx, by, 18, 16); ctx.fillRect(bx + 4, by + 16, 4, 3); ctx.fillStyle = "#c83a2e"; ctx.fillRect(bx + 4, by + 4, 3, 3); ctx.fillRect(bx + 11, by + 4, 3, 3); ctx.fillRect(bx + 4, by + 10, 10, 2); ctx.fillRect(bx + 3, by + 11, 2, 2); ctx.fillRect(bx + 13, by + 11, 2, 2); }
  if (t.happy > 0) { const bx = s.front[0] + 8, by = s.front[1] - 34; ctx.fillStyle = "#ffffff"; ctx.fillRect(bx, by, 18, 16); ctx.fillRect(bx + 4, by + 16, 4, 3); ctx.fillStyle = "#2e9a4a"; ctx.fillRect(bx + 4, by + 4, 3, 3); ctx.fillRect(bx + 11, by + 4, 3, 3); ctx.fillRect(bx + 4, by + 10, 10, 2); ctx.fillRect(bx + 3, by + 9, 2, 2); ctx.fillRect(bx + 13, by + 9, 2, 2); }
}
function drawSTS(b) {
  const cr = b.crane, x = Math.round(cr.x);
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x - 40, T, 88, 12 * T);
  ctx.fillStyle = "#b8452a"; for (const lx of [x - 44, x + 36]) ctx.fillRect(lx, QUAY * T, 8, 5 * T);
  ctx.fillStyle = "#d8552e"; ctx.fillRect(x - 44, QUAY * T - 6, 88, 10); ctx.fillRect(x - 44, 12 * T - 4, 88, 8);
  ctx.fillStyle = "#e8653a"; ctx.fillRect(x - 6, T, 12, 11 * T); ctx.fillStyle = "#8a3a22"; for (let y = T + 4; y < 12 * T; y += 16) ctx.fillRect(x - 6, y, 12, 2);
  const ty = Math.round(cr.y);
  ctx.fillStyle = "#2a2c30"; ctx.fillRect(x - 12, ty - 10, 24, 20);
  if (cr.hold2) drawBox(cr.hold2, x + 5, ty + 7, 0, true);
  if (cr.hold !== null) drawBox(cr.hold, x, ty, 0, true);
  else { ctx.fillStyle = "#9aa0a8"; ctx.fillRect(x - 3, ty - 30, 6, 60); }
}
function drawRTG(b) {
  const cr = b.rtg, gy = Math.round(cr.y), x0 = b.x * T - 6, x1 = (b.x + b.w) * T + 6;
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(x0 + 6, gy - 12, x1 - x0, 30);
  ctx.fillStyle = "#3a6ab0"; ctx.fillRect(x0, gy - 14, 10, 28); ctx.fillRect(x1 - 10, gy - 14, 10, 28);
  ctx.fillStyle = "#4a7ac8"; ctx.fillRect(x0, gy - 6, x1 - x0, 12); ctx.fillStyle = "#2a4a80"; ctx.fillRect(x0, gy + 4, x1 - x0, 2);
  ctx.fillStyle = "#2a2c30"; ctx.fillRect(x0 + 2, gy - 18, 6, 4); ctx.fillRect(x1 - 8, gy - 18, 6, 4); ctx.fillRect(x0 + 2, gy + 14, 6, 4); ctx.fillRect(x1 - 8, gy + 14, 6, 4);
  const tx = Math.round(cr.x);
  ctx.fillStyle = "#1e2024"; ctx.fillRect(tx - 9, gy - 9, 18, 18);
  if (cr.hold !== null) drawBox(cr.hold, tx, gy, Math.PI / 2, true);
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
  for (const b of BLOCKS) for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { const k = b.slots[c][r].indexOf(x); if (k >= 0) return [(b.x + c + 0.5) * T, (b.y + r * CL + 2 - k + 0.5) * T]; }
  const s = DOCK.ship; if (s) for (let n = 0; n < s.bays.length; n++) { const k = s.bays[n].indexOf(x); if (k >= 0) { const q = shipSlot(n); return [(DOCK.x + q.c * CL + 2 - k + 0.5) * T + s.off, (DOCK.top + q.r + 0.5) * T]; } }
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
  ctx.drawImage(GROUND, 0, QUAY * T, MW * T, (MH - QUAY) * T, 0, QUAY * T, MW * T, (MH - QUAY) * T);
  for (const b of BLOCKS) for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) drawStack((b.x + c) * T, (b.y + r * CL) * T, b.slots[c][r], "rgba(201,162,58,.35)");
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
  for (const t of trucks) drawTruck(t);
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
  sortLanes(); fillBays(); for (const b of BLOCKS) if (b.open) rtgStep(b, dt);
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
window.Atamus = { addMoney: (n) => (money += n), buyAt: (i, j) => { const u = buyAt(i, j); if (u && money >= u.price) { money -= u.price; u.buy(); return true; } return false; }, addTractor, get money() { return money; }, get passes() { return passes; }, get state() { return { trucks, dock: DOCK, berths: BERTHS, blocks: BLOCKS, stalls: STALLS, delivered, selected, occ }; }, get exported() { return exported; }, step, planFor, enqueue, slotSwap, doSwap, route, select: (t) => (selected = t) };
})();
