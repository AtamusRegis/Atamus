// Atamus (owner, 2026-10-31): a single-player container port. One big ship docks at a time and its two ship-to-shore cranes
// unload them, one container at a time, onto yard tractors lined up under them; tractors carry the containers to storage
// areas, each with an RTG crane at its end that stacks them three high; customer trucks with a colored cab come for a
// container of that color. You pick a truck and queue where it goes. Trucks follow one-way roads and never overlap: each
// holds the tiles under it and moves on only into free ones. 32 x 32 tiles, placeholder pixel art. Rules in
// docs/FEATURES.md.
"use strict";
(() => {
const $ = (id) => document.getElementById(id);
// (2026-11-01) a page the browser kept from an older build loads the live one instead (the build id is stamped into
// game.html and version.json on deploy)
{ const mine = (document.querySelector('meta[name="build"]') || {}).content;
  if (mine && mine !== "__BUILD__" && window.fetch) fetch("version.json", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j && j.v && j.v !== mine && !location.search.includes("b=" + j.v)) location.replace("game.html?b=" + j.v); }).catch(() => {}); }
const cv = $("view"), mainCtx = cv.getContext("2d");
let ctx = mainCtx;   // swapped to an offscreen canvas while a cached layer is drawn
const TAU = Math.PI * 2, rnd = Math.random, hyp = Math.hypot, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---- the port (owner, 2026-11-01: you build it): 72 x 44 tiles of 32 px ----
// rows 0–6 water (the ship's deck on rows 2–6), 7 the quay apron (crane rails), then land on a grid of 4 x 4 tile cells
// from row 8: the quay road along the top cell row, and below it whatever you build. Containers are 3 tiles long (owner).
const T = 32, MW = 72, MH = 44, QUAY = 7, CL = 3, TL = 4, CELL = 4, Y0 = 8, CW = MW / CELL, CH = (MH - Y0) / CELL;
const QROW = Y0;   // the quay road's top row: its westbound lane nearest the water, where the cranes load trucks

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
const DOCK = { x: 12, cols: 14, rows: 5, top: 2, ship: null, wait: 1.5 };
// (owner, 2026-11-01) up to 4 STS cranes, A–D, along the quay. Each loads the truck stopped under it in the quay road's
// lane nearest the water (westbound): its spot is one cell of that lane, and the cell just east of it is where the next
// truck waits; the cell after that is kept clear too (stress test: a junction right behind a waiting truck jammed). None
// of these cells can have a road joining from the south.
const CRANE_CELLS = [3, 6, 9, 12];
const BERTHS = CRANE_CELLS.map((cx, id) => {
  const x = cx * CELL, tiles = [0, 1, 2, 3].map((d) => key(x + d, QROW));
  return { id, cx, x, spot: { head: tiles[0], tiles, claim: null }, line: key(x + CELL, QROW), lines: [key(x + CELL, QROW)], promised: 0, crane: { x: (x + 2) * T, y: (QROW + 0.5) * T, hold: null, ops: [], truck: null } };
});
BERTHS.forEach((b) => { b.spots = [b.spot]; });
const QUAY_KEEP = new Set(CRANE_CELLS.flatMap((cx) => [cx, cx + 1, cx + 2]));   // quay cells no road may join from the south

// ---- progress (owner, 2026-11-01): start with 1 tractor, crane A, one small storage area (5 x 1) with its RTG and a
// tractor parking; everything else you build (roads, storage areas and their rows, parking, a customer lot, the export
// area) or buy (cranes, tractors). Customers pay for their container.
let money = 500;   // (owner, 2026-11-01) every game starts with $500
const INCOME = 60;
const CRANE_PRICE = [0, 2000, 3500, 5000];
const PRICE = { road: 30, storage: 600, row: 250, parking: 150, lot: 120, export: 1000 };
BERTHS.forEach((b) => (b.open = b.id === 0));
const tractorPrice = (auto) => (400 + 50 * (trucks.filter((t) => t.kind === "yard").length - 1)) * (auto ? 4 : 1);   // (owner) +$50 each; auto ones 4x
// which slot columns of the ship a crane works: split evenly between the open cranes, west to east
const craneCols = (b) => { const op = BERTHS.filter((q) => q.open), i = op.indexOf(b), n = op.length; return i < 0 ? [0, 0] : [Math.round(i * DOCK.cols / n), Math.round((i + 1) * DOCK.cols / n)]; };
function buyAt(i, j) {
  for (const b of BERTHS) if (!b.open && j >= QUAY && j <= QROW && i >= b.x - 1 && i <= b.x + CELL) return { price: CRANE_PRICE[b.id], buy: () => { b.open = true; } };
  return null;
}
const AUTO_CAB = "#5fd3d0", EXP_CAB = "#8a94a6", WAIT_CAB = "#5a6068";   // auto tractors' and export trucks' cabs
const floats = [];   // "+$60" over a paid truck

// ---- the grid: road cells and buildings ----
const ckey = (cx, cy) => cx + "," + cy;
const inGrid = (cx, cy) => cx >= 0 && cx < CW && cy >= 0 && cy < CH;
const cellXY = (cx, cy) => [cx * CELL, Y0 + cy * CELL];
const ROADC = new Set();       // road cells
const OCCUPIED = new Map();    // building cells -> the building
const isRoad = (cx, cy) => ROADC.has(ckey(cx, cy));
// a road cell's links: to its road neighbours, and off the map at an edge it runs straight into (a gate; not off the
// top, the quay)
function links(cx, cy) {
  const n = isRoad(cx, cy - 1), s = isRoad(cx, cy + 1), w = isRoad(cx - 1, cy), e = isRoad(cx + 1, cy);
  const gs = cy === CH - 1 && !w && !e, gw = cx === 0 && !n && !s, ge = cx === CW - 1 && !n && !s;
  return { n, s: s || gs, w: w || gw, e: e || ge, gs, gw, ge };
}
const ewOnly = (cx, cy) => { if (!isRoad(cx, cy)) return false; const l = links(cx, cy); return (l.w || l.e) && !l.n && !l.s; };
const nsOnly = (cx, cy) => { if (!isRoad(cx, cy)) return false; const l = links(cx, cy); return (l.n || l.s) && !l.w && !l.e; };
// a building beside a road is served from that road's outer lane on its side, driven along u; v points into the building.
// lane(x0, y0, a): the a-th tile of that lane in the cell at (x0, y0), counted from its upstream end (a can run on into
// the next cells along u)
const SIDES = {
  N: { u: [-1, 0], v: [0, -1], ew: true, lane: (x0, y0, a) => [x0 + 3 - a, y0] },
  S: { u: [1, 0], v: [0, 1], ew: true, lane: (x0, y0, a) => [x0 + a, y0 + 3] },
  W: { u: [0, 1], v: [-1, 0], ew: false, lane: (x0, y0, a) => [x0, y0 + a] },
  E: { u: [0, -1], v: [1, 0], ew: false, lane: (x0, y0, a) => [x0 + 3, y0 + 3 - a] },
};
const straight = (cx, cy, ew) => (ew ? ewOnly(cx, cy) : nsOnly(cx, cy));
// plain road running on both ways (no junction, no dead end): what a storage area's lane needs
const through = (cx, cy, ew) => straight(cx, cy, ew) && (ew ? isRoad(cx - 1, cy) && isRoad(cx + 1, cy) : isRoad(cx, cy - 1) && isRoad(cx, cy + 1));

// ---- storage areas (owner, 2026-11-01): built beside four cells of straight road, 2 cells deep. Its containers lie along
// the road in 5 slots (3 tiles each), in rows going back from the road: 1 row to start, more bought one at a time (up to
// 6), stacked 3 high. Its RTG spans the rows and the road's outer lane beside it, where trucks stop to be served: 4
// spots, one per cell. The next truck waits in the lane just before it (when that cell is plain road).
// The export area is the same, framed blue.
let BLOCKS = [], blockSeq = 0;
const MAX_ROWS = 6;
function makeBlock(r0, side, exp, rows) {
  const S = SIDES[side], [x0, y0] = cellXY(r0[0], r0[1]), L = (a) => S.lane(x0, y0, a), u = S.u, v = S.v;
  const laneCells = [0, 1, 2, 3].map((k) => [r0[0] + u[0] * k, r0[1] + u[1] * k]);
  const cells = laneCells.flatMap(([cx, cy]) => [1, 2].map((d) => [cx + v[0] * d, cy + v[1] * d]));
  const L0 = L(0), b = { id: blockSeq++, exp: !!exp, side, r0, u, v, L, laneCells, cells, rows: rows || 1, cols: 5, open: true };
  b.sx = L0[0] + 0.5 - u[0] * 0.5; b.sy = L0[1] + 0.5 - u[1] * 0.5;   // where the lane starts (tile units)
  b.slots = Array.from({ length: b.cols }, () => Array.from({ length: MAX_ROWS }, () => []));
  b.spots = [0, 1, 2, 3].map((s) => { const tiles = [3, 2, 1, 0].map((d) => key(...L(4 * s + d))); return { head: tiles[0], tiles, claim: null }; });
  const [rx, ry] = [0, 1].map((n) => b.laneCells[0][n] - u[n]);
  b.lineCell = [rx, ry]; b.line = null; b.lines = [];
  const p = bpos(b, 8, 0.5); b.rtg = { x: p[0], y: p[1], hold: null, ops: [], truck: null };
  return b;
}
// a point in a storage area: al tiles along the lane from its upstream end, be tiles back from the lane's middle
const bpos = (b, al, be) => [(b.sx + b.u[0] * al + b.v[0] * be) * T, (b.sy + b.u[1] * al + b.v[1] * be) * T];
const blocal = (b, x, y) => { const px = x / T - b.sx, py = y / T - b.sy; return [px * b.u[0] + py * b.u[1], px * b.v[0] + py * b.v[1]]; };
const slotXY = (b, c, r) => bpos(b, 3 * c + 2, r + 1);
const blockAng = (b) => Math.atan2(b.u[1], b.u[0]);
// the storage area's footprint (and the cells of its lane) in tiles: [x0, y0, x1, y1)
function blockRect(b, withLane) {
  const cs = withLane ? b.cells.concat(b.laneCells) : b.cells, xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]);
  return [Math.min(...xs) * CELL, Y0 + Math.min(...ys) * CELL, (Math.max(...xs) + 1) * CELL, Y0 + (Math.max(...ys) + 1) * CELL];
}

// ---- parking (owner, 2026-11-01): a cell beside a straight road with 2 pull-in pockets: in off the outer lane, round the
// far end and back out onto it. A truck parks nose in, at the far end. Tractor parking holds tractors (you can own as many
// as there are spots); a customer lot holds customer trucks waiting for their container.
let POCKETS = [], pocketSeq = 0;
function makePocketCell(kind, r, side, cell) {
  const S = SIDES[side], [x0, y0] = cellXY(r[0], r[1]), L = (a) => S.lane(x0, y0, a), v = S.v;
  const at = (a, d) => { const [x, y] = L(a); return [x + v[0] * d, y + v[1] * d]; };
  const pc = { id: pocketSeq++, kind, r, side, cell, pockets: [] };
  for (const a0 of [0, 2]) {
    const inT = [1, 2, 3, 4].map((d) => key(...at(a0, d))), outT = [4, 3, 2, 1].map((d) => key(...at(a0 + 1, d)));
    pc.pockets.push({ cellRef: pc, kind, head: inT[3], tiles: [inT[3], inT[2], inT[1], inT[0]], path: [key(...L(a0)), ...inT, ...outT, key(...L(a0 + 1))], claim: null });
  }
  return pc;
}
const tractorPockets = () => POCKETS.filter((p) => p.kind === "park").flatMap((p) => p.pockets);
const lotPockets = () => POCKETS.filter((p) => p.kind === "lot").flatMap((p) => p.pockets);

// a bought tractor appears in a free tractor parking spot; you can own as many as there are spots
function tractorSpot() {
  const ps = tractorPockets(); if (trucks.filter((t) => t.kind === "yard").length >= ps.length) return null;
  for (const p of ps) if (!p.claim && !p.tiles.some((k) => occ.has(k))) return { tiles: p.tiles.slice(), park: p };
  return null;
}
// (owner) two kinds: manual (you send it: a ship container, then an RTG) and auto (you assign it an RTG and it shuttles
// between the ship and that RTG by itself)
function addTractor(auto) {
  const price = tractorPrice(auto), sp = tractorSpot(); if (money < price || !sp) return false;
  money -= price; const t = mkTruck("yard", sp.tiles); t.num = trucks.filter((q) => q.kind === "yard").length; t.auto = !!auto;
  t.park = sp.park; sp.park.claim = t;
  return true;
}

// ---- roads (owner, 2026-11-01): every road is 4 lanes, two each way, the outer one to drive and line up in, the inner
// one to pass; trucks keep right. Built a cell at a time; corners, junctions and dead ends (where trucks turn round) work
// themselves out from which neighbours a cell has. A road reaching the map's edge is a gate.
let E = new Map(), CHG = new Map(), SLOW = new Set(), SPOT = new Map(), BOX = new Set(), ROADSET = new Set(), GATES = [];
const add = (a, b, c, d) => { const k = key(a, b), n = key(c, d); if (!E.has(k)) E.set(k, []); if (!E.get(k).includes(n)) E.get(k).push(n); };
const addK = (k, n) => { if (!E.has(k)) E.set(k, []); if (!E.get(k).includes(n)) E.get(k).push(n); };
// a lane change: one tile on into the lane beside, needing the tile beside free too
const chg = (ax, ay, cx, cy, sx, sy) => { add(ax, ay, cx, cy); CHG.set(key(ax, ay) + ">" + key(cx, cy), key(sx, sy)); };
function buildGraph() {
  E = new Map(); CHG = new Map(); SLOW = new Set(); SPOT = new Map(); BOX = new Set(); GATES = []; G = null;
  for (const ck of ROADC) {
    const [cx, cy] = ck.split(",").map(Number), [x0, y0] = cellXY(cx, cy), l = links(cx, cy), ew = l.w || l.e, ns = l.n || l.s;
    const nl = +l.n + +l.s + +l.w + +l.e;
    if (ew) {
      for (const r of [y0, y0 + 1]) for (let x = x0 + 3; x >= x0; x--) if (x > x0 || l.w) add(x, r, x - 1, r);         // westbound
      for (const r of [y0 + 2, y0 + 3]) for (let x = x0; x <= x0 + 3; x++) if (x < x0 + 3 || l.e) add(x, r, x + 1, r);   // eastbound
      if (!ns) for (let x = x0; x <= x0 + 3; x++) {
        if (x > x0 || l.w) { chg(x, y0, x - 1, y0 + 1, x, y0 + 1); chg(x, y0 + 1, x - 1, y0, x, y0); }
        if (x < x0 + 3 || l.e) { chg(x, y0 + 3, x + 1, y0 + 2, x, y0 + 2); chg(x, y0 + 2, x + 1, y0 + 3, x, y0 + 3); }
      }
      for (let x = x0; x <= x0 + 3; x++) { SLOW.add(key(x, y0 + 1)); SLOW.add(key(x, y0 + 2)); }
    }
    if (ns) {
      for (const c of [x0, x0 + 1]) for (let y = y0; y <= y0 + 3; y++) if (y < y0 + 3 || l.s) add(c, y, c, y + 1);         // southbound
      for (const c of [x0 + 2, x0 + 3]) for (let y = y0 + 3; y >= y0; y--) if (y > y0 || l.n) add(c, y, c, y - 1);       // northbound
      if (!ew) for (let y = y0; y <= y0 + 3; y++) {
        if (y < y0 + 3 || l.s) { chg(x0, y, x0 + 1, y + 1, x0 + 1, y); chg(x0 + 1, y, x0, y + 1, x0, y); }
        if (y > y0 || l.n) { chg(x0 + 3, y, x0 + 2, y - 1, x0 + 2, y); chg(x0 + 2, y, x0 + 3, y - 1, x0 + 3, y); }
      }
      for (let y = y0; y <= y0 + 3; y++) { SLOW.add(key(x0 + 1, y)); SLOW.add(key(x0 + 2, y)); }
    }
    // dead ends (and the gates at the map's edge): turn round at the far end
    const uw = ew && !ns && (!isRoad(cx - 1, cy) || !isRoad(cx + 1, cy)), un = ns && !ew && (!isRoad(cx, cy - 1) || !isRoad(cx, cy + 1));
    if (uw && !isRoad(cx - 1, cy)) for (let r = y0; r < y0 + 3; r++) add(x0, r, x0, r + 1);
    if (uw && !isRoad(cx + 1, cy)) for (let r = y0 + 3; r > y0; r--) add(x0 + 3, r, x0 + 3, r - 1);
    if (un && !isRoad(cx, cy - 1) && cy > 0) for (let c = x0 + 3; c > x0; c--) add(c, y0, c - 1, y0);
    if (un && !isRoad(cx, cy + 1)) for (let c = x0; c < x0 + 3; c++) add(c, y0 + 3, c + 1, y0 + 3);
    if (ew && ns || nl === 1 || uw || un) for (let x = x0; x <= x0 + 3; x++) for (let y = y0; y <= y0 + 3; y++) BOX.add(key(x, y));
    // gates: lanes on off the map's edge (out) and in from it
    if (l.gw) { for (const r of [y0, y0 + 1]) for (let x = x0 - 1; x > -7; x--) add(x, r, x - 1, r); for (const r of [y0 + 2, y0 + 3]) for (let x = -7; x < x0; x++) add(x, r, x + 1, r); GATES.push({ cx, cy, quay: cy === 0, spawn: [-1, -2, -3, -4].map((x) => key(x, y0 + 3)), exit: key(-7, y0) }); }
    if (l.ge) { for (const r of [y0, y0 + 1]) for (let x = MW + 6; x > x0 + 3; x--) add(x, r, x - 1, r); for (const r of [y0 + 2, y0 + 3]) for (let x = x0 + 4; x < MW + 6; x++) add(x, r, x + 1, r); GATES.push({ cx, cy, quay: cy === 0, spawn: [0, 1, 2, 3].map((d) => key(MW + d, y0)), exit: key(MW + 6, y0 + 3) }); }
    if (l.gs) { for (const c of [x0, x0 + 1]) for (let y = y0 + 4; y < MH + 6; y++) add(c, y, c, y + 1); for (const c of [x0 + 2, x0 + 3]) for (let y = MH + 6; y > y0 + 3; y--) add(c, y, c, y - 1); GATES.push({ cx, cy, quay: false, spawn: [0, 1, 2, 3].map((d) => key(x0 + 3, MH + d)), exit: key(x0, MH + 6) }); }
  }
  // the pockets of parking cells: in off the lane, round the far end, back out
  for (const pc of POCKETS) for (const p of pc.pockets) { for (let n = 0; n + 1 < p.path.length; n++) addK(p.path[n], p.path[n + 1]); for (const k of p.path.slice(1, -1)) SPOT.set(k, "P" + pc.id + p.head); }
  ROADSET = new Set(); for (const [k, ns] of E) { ROADSET.add(k); for (const n of ns) ROADSET.add(n); }
  // a storage area's waiting spot: the lane tile just before it, when that cell is plain road the same way
  for (const b of BLOCKS) {
    const [rx, ry] = b.lineCell, ew = SIDES[b.side].ew, [r2x, r2y] = [rx - b.u[0], ry - b.u[1]];
    b.line = straight(rx, ry, ew) ? key(...b.L(-1)) : null;
    b.lines = b.line ? (straight(r2x, r2y, ew) ? [b.line, key(...b.L(-5))] : [b.line]) : [];
  }
}
// cheapest way there: a lane change costs a bit more than a step, the passing lane a little more than the outer one;
// avoid(k) rules tiles out (passing)
const PERF = { routes: 0 };
// (perf 2026-11-01) the road graph as numbered nodes, built once per change, so routing doesn't hash strings
let G = null;
function graph() {
  if (G) return G;
  const nodes = [...ROADSET], id = new Map(nodes.map((k, i) => [k, i]));
  const adj = nodes.map((k) => (E.get(k) || []).map((n) => id.get(n)));
  const cost = nodes.map((k, i) => adj[i].map((j) => (CHG.has(k + ">" + nodes[j]) ? 1.3 : 1) + (SLOW.has(nodes[j]) ? 0.3 : 0)));
  const spot = nodes.map((k) => SPOT.get(k) || null);
  G = { nodes, id, adj, cost, spot, dist: new Float64Array(nodes.length), prev: new Int32Array(nodes.length), seen: new Uint32Array(nodes.length), gen: 0 };
  return G;
}
function route(fromK, toK, avoid) {
  PERF.routes++;
  const g = graph(), from = g.id.get(fromK), to = g.id.get(toK); if (from === undefined || to === undefined) return null;
  const gen = ++g.gen, ts = g.spot[to], dist = g.dist, prev = g.prev, seen = g.seen, h = [];
  const push = (d, i) => { h.push(d, i); let c = h.length / 2 - 1; while (c > 0) { const p = (c - 1) >> 1; if (h[2 * p] <= h[2 * c]) break; [h[2 * p], h[2 * c]] = [h[2 * c], h[2 * p]]; [h[2 * p + 1], h[2 * c + 1]] = [h[2 * c + 1], h[2 * p + 1]]; c = p; } };
  const pop = () => { const d = h[0], i = h[1], ld = h[h.length - 2], li = h[h.length - 1]; h.length -= 2; if (h.length) { h[0] = ld; h[1] = li; let c = 0; const n = h.length / 2; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < n && h[2 * l] < h[2 * m]) m = l; if (r < n && h[2 * r] < h[2 * m]) m = r; if (m === c) break; [h[2 * m], h[2 * c]] = [h[2 * c], h[2 * m]]; [h[2 * m + 1], h[2 * c + 1]] = [h[2 * c + 1], h[2 * m + 1]]; c = m; } } return [d, i]; };
  seen[from] = gen; dist[from] = 0; prev[from] = -1; push(0, from);
  while (h.length) {
    const [d, k] = pop(); if (d > dist[k]) continue; if (k === to) break;
    const cs = g.spot[k], adj = g.adj[k], cost = g.cost[k];
    for (let e = 0; e < adj.length; e++) {
      const n = adj[e], ns = g.spot[n]; if (ns && ns !== cs && ns !== ts) continue;
      if (avoid && n !== to && avoid(g.nodes[n])) continue;
      const nd = d + cost[e];
      if (seen[n] !== gen || nd < dist[n]) { seen[n] = gen; dist[n] = nd; prev[n] = k; push(nd, n); }
    }
  }
  if (seen[to] !== gen) return null;
  const out = []; for (let k = to; k !== from; k = prev[k]) out.push(g.nodes[k]); out.reverse();
  out.cost = dist[to]; return out;
}

// ---- building (owner, 2026-11-01) ----
const cellFree = (cx, cy) => inGrid(cx, cy) && cy > 0 && !isRoad(cx, cy) && !OCCUPIED.has(ckey(cx, cy));
// the road cells a building needs to stay as they are (straight), and its own cells
const servedCells = () => { const out = new Map(); for (const b of BLOCKS) for (const c of b.laneCells) out.set(ckey(...c), SIDES[b.side].ew); for (const p of POCKETS) out.set(ckey(...p.r), SIDES[p.side].ew); return out; };
// what building at a cell would be: { ok, price, cells (to outline), do () }
// (owner, 2026-11-01) a storage area's footprint, 4 cells along the road and 2 deep, for a side of the road it faces
// and the top-left cell of its footprint; the 4 road cells beside it, r0 the first of them along the lane
function blockFoot(side, bx, by) {
  const S = SIDES[side], w = S.ew ? 4 : 2, h = S.ew ? 2 : 4, cells = [];
  for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) cells.push([x, y]);
  const lane = cells.map(([x, y]) => [x - S.v[0], y - S.v[1]]).filter(([x, y]) => !cells.some((c) => c[0] === x && c[1] === y));
  const r0 = lane.reduce((m, c) => (c[0] * S.u[0] + c[1] * S.u[1] < m[0] * S.u[0] + m[1] * S.u[1] ? c : m));
  return { cells, lane, r0, w, h };
}
function planBuild(mode, cx, cy, side) {
  if (!inGrid(cx, cy)) return null;
  if (mode === "road") {
    const price = PRICE.road, cells = [[cx, cy]];
    if (!cellFree(cx, cy)) return { ok: false, price, cells };
    if (cy === 1 && QUAY_KEEP.has(cx)) return { ok: false, price, cells };   // under a crane's spot or its waiting cell
    // a served road cell may not get a road joining it from the side
    const sv = servedCells();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { const k = ckey(cx + dx, cy + dy); if (sv.has(k) && sv.get(k) === (dx === 0)) return { ok: false, price, cells }; }
    return { ok: true, price, cells, do: () => ROADC.add(ckey(cx, cy)) };
  }
  if (mode === "storage" || mode === "export") {
    const ex = OCCUPIED.get(ckey(cx, cy));
    if (ex && ex.slots && !side) { const ok = ex.rows < MAX_ROWS; return { ok, price: PRICE.row, cells: ex.cells, do: () => { ex.rows++; STACK_VER++; } }; }   // another row
    if (side) {   // a blueprint: this footprint, facing the road on this side
      const f = blockFoot(side, cx, cy), S = SIDES[side], price = mode === "export" ? PRICE.export : PRICE.storage;
      const ok = !(mode === "export" && BLOCKS.some((b) => b.exp)) && f.cells.every(([x, y]) => inGrid(x, y) && cellFree(x, y)) && f.lane.every(([x, y]) => through(x, y, S.ew));
      return { ok, price, cells: f.cells, do: () => { const b = makeBlock(f.r0, side, mode === "export", 1); BLOCKS.push(b); for (const c of f.cells) OCCUPIED.set(ckey(...c), b); } };
    }
    if (mode === "export" && BLOCKS.some((b) => b.exp)) return { ok: false, price: PRICE.export, cells: [[cx, cy]] };
    for (const side of ["S", "N", "E", "W"]) for (const depth of [1, 2]) for (let k = 0; k < 4; k++) {
      const S = SIDES[side], lc = [cx - S.v[0] * depth, cy - S.v[1] * depth], r0 = [lc[0] - S.u[0] * k, lc[1] - S.u[1] * k];
      const laneCells = [0, 1, 2, 3].map((n) => [r0[0] + S.u[0] * n, r0[1] + S.u[1] * n]);
      if (!laneCells.every(([x, y]) => through(x, y, S.ew))) continue;
      const cells = laneCells.flatMap(([x, y]) => [1, 2].map((d) => [x + S.v[0] * d, y + S.v[1] * d]));
      if (!cells.every(([x, y]) => cellFree(x, y))) continue;
      const price = mode === "export" ? PRICE.export : PRICE.storage;
      return { ok: true, price, cells, do: () => { const b = makeBlock(r0, side, mode === "export", 1); BLOCKS.push(b); for (const c of cells) OCCUPIED.set(ckey(...c), b); } };
    }
    return { ok: false, price: mode === "export" ? PRICE.export : PRICE.storage, cells: [[cx, cy]] };
  }
  if (mode === "parking" || mode === "lot") {
    const price = PRICE[mode], cells = [[cx, cy]];
    if (!cellFree(cx, cy)) return { ok: false, price, cells };
    for (const sd of side ? [side] : ["S", "N", "E", "W"]) {
      const S = SIDES[sd], r = [cx - S.v[0], cy - S.v[1]];
      if (!isRoad(...r)) continue; const l = links(...r);
      if (S.ew ? !((l.w || l.e) && !l.n && !l.s) : !((l.n || l.s) && !l.w && !l.e)) continue;
      return { ok: true, price, cells, do: () => { const pc = makePocketCell(mode === "parking" ? "park" : "lot", r, sd, [cx, cy]); POCKETS.push(pc); OCCUPIED.set(ckey(cx, cy), pc); } };
    }
    return { ok: false, price, cells };
  }
  if (mode === "bulldoze") {
    const k = ckey(cx, cy), cells = [[cx, cy]];
    if (isRoad(cx, cy)) {
      const [x0, y0] = cellXY(cx, cy), busy = trucks.some((t) => t.tiles.concat(t.next ? [t.next] : []).some((q) => { const [i, j] = unkey(q); return i >= x0 && i < x0 + CELL && j >= y0 && j < y0 + CELL; }));
      const ok = cy > 0 && !busy && !servedCells().has(k);
      return { ok, price: -Math.floor(PRICE.road / 2), cells, do: () => ROADC.delete(k) };
    }
    const bd = OCCUPIED.get(k); if (!bd) return null;
    if (bd.slots) {
      const ok = !count(bd) && !bd.rtg.hold && !bd.rtg.ops.length && !trucks.some((t) => [t.cmd, ...t.queue].some((a) => a && a.block === bd)) && !trucks.some((t) => t.home === bd) && BLOCKS.length > 1;
      return { ok, price: -Math.floor((bd.exp ? PRICE.export : PRICE.storage + (bd.rows - 1) * PRICE.row) / 2), cells: bd.cells, do: () => { BLOCKS = BLOCKS.filter((q) => q !== bd); for (const c of bd.cells) OCCUPIED.delete(ckey(...c)); } };
    }
    const ok = bd.pockets.every((p) => !p.claim && !trucks.some((t) => t.tiles.some((q) => p.path.includes(q)))) && (bd.kind !== "park" || tractorPockets().length - 2 >= trucks.filter((t) => t.kind === "yard").length);
    return { ok, price: -Math.floor(PRICE[bd.kind === "park" ? "parking" : "lot"] / 2), cells, do: () => { POCKETS = POCKETS.filter((q) => q !== bd); OCCUPIED.delete(k); } };
  }
  return null;
}
function doBuild(mode, cx, cy, side) {
  const p = planBuild(mode, cx, cy, side); if (!p || !p.ok || money < p.price) return false;
  money -= p.price; p.do(); rebuilt(); return true;
}
// after the roads or buildings change: the road graph and the ground are redrawn, and every truck plans its way again
function rebuilt() {
  buildGraph(); groundDirty = true; STACK_VER++;
  for (const t of trucks) if (t.path.length) { const goal = t.path[t.path.length - 1]; goTo(t, goal); }
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
      t.stall = null; t.cmd = null; t.queue = []; t.sad = 2.5; leave(t);
    }
  }
  BERTHS.forEach((b) => { b.promised = 0; });
}
// (owner, 2026-11-01) when time runs out, each tractor only finishes its next crane trip (the one it's on, or else the
// first in its queue): any after that (and export pickups) are called off, keeping the drop-offs for what it will
// actually be carrying
function closeQueues() {
  for (const t of trucks) {
    if (t.kind !== "yard") continue;
    let l = t.load ? (t.load.exp ? "exp" : "imp") : null;
    if (t.cmd) l = t.cmd.kind === "sts" ? (t.cmd.pick === false ? null : "imp") : t.cmd.kind === "rtg" ? (t.cmd.pickup ? "exp" : null) : t.cmd.kind === "deliver" ? null : l;
    let one = !!(t.cmd && t.cmd.kind === "sts");
    t.queue = t.queue.filter((a) => {
      let keep = true;
      if (a.kind === "sts" && !one) { one = true; l = a.pick === false ? null : "imp"; }
      else if (a.kind === "sts" || (a.kind === "rtg" && a.pickup)) keep = false;
      else if (a.kind === "deliver") { keep = l !== null; l = null; }
      else if (a.kind === "rtg") { keep = l === "imp"; if (keep) l = null; }
      if (!keep) claim(t, a, -1);
      return keep;
    });
  }
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
  else if (s.state === "docked") { s.time -= dt; if (!shipCount(s) && BERTHS.every((b) => !b.promised && !expPromised(b) && b.crane.hold === null && !b.crane.hold2)) { s.idle = (s.idle || 0) + dt; if (s.idle > 1.5) s.state = "depart"; } else if (s.time <= 0) { s.state = "closing"; closeQueues(); } }
  else if (s.state === "closing") { if (BERTHS.every((b) => !b.crane.ops.length && b.crane.hold === null && !b.crane.hold2 && !b.crane.truck && (!b.promised || !b.open || !inReach(s, b)))) { shipGone(s); s.state = "depart"; } }
  else if (s.state === "depart") { s.off += (50 + s.off * 0.8) * dt; if (s.off > 64 * T) { DOCK.ship = null; DOCK.wait = 5 + rnd() * 5; } }
}

// ---- trucks: each holds the 4 tiles under it (and the next one while moving into it) ----
const occ = new Map();
let passes = 0, trucks = [], truckSeq = 0, custWait = 2, expWait = 6, delivered = 0, exported = 0, clock = 0;
function mkTruck(kind, tiles, want) { const t = { id: ++truckSeq, kind, tiles, next: null, p: 0, path: [], queue: [], cmd: null, load: null, want, locked: false, stall: null, gone: false }; for (const k of tiles) occ.set(k, t); trucks.push(t); return t; }
const head = (t) => t.tiles[0];
const headIJ = (t) => unkey(t.tiles[0]);
// (2026-11-01) trucks standing still to be served or waiting their turn are planned round from the start (in the passing
// lane), so nobody queues up behind a line they aren't in
const parkedAt = (q) => !q.next && (q.locked || inLine(q) || (q.cmd && q.cmd.spot && head(q) === q.cmd.spot.head));
function goTo(t, k) {
  const from = t.next || head(t), avoid = (n) => { const q = occ.get(n); return q && q !== t && parkedAt(q); };
  t.path = (t.next ? [t.next] : []).concat(route(from, k, avoid) || route(from, k) || []);
}
// the gate a truck leaves by: the nearest way off the map
function exitOf(t) { let best = null, bc = Infinity; for (const g of GATES) { const r = route(t.next || head(t), g.exit); if (r && r.cost < bc) { bc = r.cost; best = g.exit; } } return best || (GATES[0] && GATES[0].exit); }
function leave(t) { t.exiting = true; const x = exitOf(t); if (x) goTo(t, x); }
// (owner, 2026-11-01) two kinds of customer truck. Grey ones (most) come for everyday cargo: any white, gray or black
// container. Colored ones come for a particular container of their cab's color: about a quarter of trucks, more the
// more of the unclaimed stored containers are colored, so colored ones don't pile up.
const coloredShare = () => { const st = storedFree(), c = st.filter((x) => !NEUTRAL.has(x.c)).length; return clamp(0.25 + 0.7 * c / (st.length + 1), 0.2, 0.8); };
// (owner) dynamic: low stacks, few trucks (time to fill); high stacks, many trucks (to empty them). The fuller storage is
// with containers nobody has claimed, the more customers come. 0 with none unclaimed, 1 with every storage area full of them.
const unclaimedFill = () => { const n = BLOCKS.filter((b) => !b.exp).reduce((a, b) => a + b.cols * b.rows * 3, 0); return n ? storedFree().length / n : 0; };
const storedFree = () => { const out = []; for (const b of BLOCKS) if (!b.exp) for (const col of b.slots) for (const st of col) for (const x of st) if (!x.wantedBy) out.push(x); return out; };
const shipFree = () => { const out = [], s = DOCK.ship; if (s && s.state === "docked") for (const st of s.bays) for (const x of st) if (!x.exp && !x.wantedBy) out.push(x); return out; };
// a gate to come in at: one on land if there is one (the quay road's ends only with none), with its way in clear
function gateIn() { const land = GATES.filter((g) => !g.quay), pool = (land.length ? land : GATES).filter((g) => !g.spawn.some((k) => occ.has(k))); return pool.length ? pick(pool) : null; }
// the easiest everyday container to reach in storage: the fewest on top of it (ties at random)
function easiestEveryday() {
  let best = [], depth = 9;
  for (const b of BLOCKS) if (!b.exp) for (const col of b.slots) for (const st of col) st.forEach((x, i) => { if (!NEUTRAL.has(x.c) || x.wantedBy) return; const d = st.length - 1 - i; if (d < depth) { depth = d; best = [x]; } else if (d === depth) best.push(x); });
  return best.length ? pick(best) : null;
}
// (owner, 2026-11-01) with room in a customer lot, a customer truck comes in and parks there until its container is in
// storage (grey ones pick one now and then, colored ones may want one still on the ship). With no lot (or it full), one
// only comes when a container for it is already stored, and drives straight to that storage area's line.
function spawnCustomer() {
  const g = gateIn(); if (!g) return;
  const stall = lotPockets().find((p) => !p.claim);
  if (stall) {
    const pool = rnd() < coloredShare() ? shipFree().concat(storedFree()).filter((x) => !NEUTRAL.has(x.c)) : [], want = pool.length ? pick(pool) : null;
    const t = mkTruck("cust", g.spawn.slice(), want);
    if (want) want.wantedBy = t; else { t.generic = true; t.since = clock; }
    stall.claim = t; t.cmd = { kind: "park", stall }; goTo(t, stall.head); return;
  }
  const colored = storedFree().filter((x) => !NEUTRAL.has(x.c)), want = rnd() < coloredShare() && colored.length ? pick(colored) : easiestEveryday();
  if (!want) return;
  const b = BLOCKS.find((q) => holds(q, want)); if (!b || lineFull(b, null)) return;
  const t = mkTruck("cust", g.spawn.slice(), want); want.wantedBy = t; if (NEUTRAL.has(want.c)) t.generic = true;
  if (!startCmd(t, { kind: "rtg", block: b })) leave(t);
}
let claimWait = 20;
function claimStep(dt) {
  if ((claimWait -= dt) > 0) return;
  const t = trucks.filter((q) => q.kind === "cust" && !q.want && !q.exiting).sort((a, b) => a.since - b.since)[0];
  const x = t && easiestEveryday();
  if (!t || !x) { claimWait = 4; return; }
  t.want = x; x.wantedBy = t;
  claimWait = (30 + rnd() * 40) / (1 + lotPockets().length / 32) / (0.6 + 10 * unclaimedFill());
}

// what a truck will carry once its queue is done: null, "imp" or "exp"
function loadAfter(t) { let l = t.load ? (t.load.exp ? "exp" : "imp") : null; for (const a of t.cmd ? [t.cmd, ...t.queue] : t.queue) l = a.kind === "deliver" ? null : a.kind === "sts" ? (a.pick === false ? null : "imp") : a.kind === "rtg" ? (t.kind === "cust" ? "imp" : a.pickup ? "exp" : null) : l; return l; }
// (owner) export trucks come in with a container for the export area (when there is one with room for one more) and
// drop it at its RTG
function spawnExport() {
  const b = BLOCKS.find((q) => q.exp); if (!b) return;
  if (free(b) - trucks.filter((t) => t.kind === "exp" && t.load).length <= 0 || lineFull(b, null)) return;
  const g = gateIn(); if (!g) return;
  const t = mkTruck("exp", g.spawn.slice(), null); t.load = box(randColor()); t.load.exp = true;
  if (!startCmd(t, { kind: "rtg", block: b })) leave(t);
}
function targetAt(i, j) {
  // (owner) a ship slot picks which one the crane takes from; the crane leaves it to the crane (the nearest)
  if (j >= DOCK.top && j < DOCK.top + DOCK.rows) { const c = Math.floor((i - DOCK.x) / CL); if (c < 0 || c >= DOCK.cols || !DOCK.ship || DOCK.ship.state !== "docked") return null; const k = (j - DOCK.top) * DOCK.cols + c; if (!onDeck(DOCK.ship, k)) return null; const b = BERTHS.find((q) => q.open && c >= craneCols(q)[0] && c < craneCols(q)[1]); return b ? { kind: "sts", berth: b, slot: k } : null; }
  // the crane itself, or its spot on the quay road
  if (j >= QUAY && j <= QROW) for (const b of BERTHS) if (i >= b.x - 1 && i <= b.x + CELL) return b.open ? { kind: "sts", berth: b } : null;
  if (j < Y0) return null;
  const bd = OCCUPIED.get(ckey(Math.floor(i / CELL), Math.floor((j - Y0) / CELL)));
  if (bd && bd.slots) return { kind: "rtg", block: bd };
  if (bd && bd.kind === "lot") { const p = bd.pockets.find((q) => q.path.includes(key(i, j))) || bd.pockets.find((q) => !q.claim) || bd.pockets[0]; return { kind: "park", stall: p }; }
  return null;
}
// (owner) a truck can only be sent where it can be served: an empty yard tractor to an STS with a ship to unload (or to
// a ship slot with a container not yet claimed), a loaded one to an RTG with room, a customer to the RTG holding its
// container, or (customers only) a free lot spot. Queued trips count first; a lot spot or ship container is claimed at
// once, a spot at a crane or RTG when one clears for the truck. The same RTG can be queued any number of times.
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
  return !loaded && holds(b, t.want) && (b.lines.length || freeSpot(b)) ? { kind: "rtg", block: b } : null;
}
// (owner, 2026-11-01) a pickup sent to a ship slot claims a particular container (the top one nobody has claimed yet),
// not the slot: if a crane moves it while sorting or packing, the trip follows it (a.slot is wherever it is now).
// TAKEN marks a container a crane has started a job on, so nobody claims it on its way off the ship.
const TAKEN = { taken: true };
function syncClaims() {
  const s = DOCK.ship; if (!s) return;
  s.claims.fill(0);
  s.bays.forEach((st, k) => { for (const x of st) if (x.claimedBy) { s.claims[k]++; if (x.claimedBy !== TAKEN) x.claimedBy.slot = k; } });
}
// the next container a crane would hand out from a slot unclaimed: the top one (skip: ones already being taken above it)
const pickable = (st, skip = 0) => { const x = st[st.length - 1 - skip]; return !!x && !x.exp && !x.claimedBy; };
function claim(t, a, d) {
  if (a.kind === "sts") {
    if (a.pick !== false) a.berth.promised += d;
    if (d > 0 && a.slot !== undefined && DOCK.ship) { const x = DOCK.ship.bays[a.slot].slice().reverse().find((q) => !q.exp && !q.claimedBy); if (x) { a.box = x; x.claimedBy = a; } }
    if (d < 0 && a.box) { if (a.box.claimedBy === a) a.box.claimedBy = null; delete a.box; }
    syncClaims();
  }
  else if (a.kind === "park") a.stall.claim = d > 0 ? t : null;
}
function enqueue(t, a) { if (a.deliverFirst) { delete a.deliverFirst; t.queue.push({ kind: "deliver" }); } claim(t, a, 1); t.queue.push(a); }
function unqueueLast(t) { const a = t.queue.pop(); if (a) claim(t, a, -1); if (t.queue.length && t.queue[t.queue.length - 1].kind === "deliver") t.queue.pop(); return !!a; }
// ---- stations: a crane or an RTG, with spots where trucks stop to be served, and a waiting spot just before them
// (owner, 2026-11-01: the outer lane is the queue). A truck heading there takes a free spot (the front one first) or
// waits at the waiting spot; as spots clear they go to the nearest waiting truck. With no waiting spot (the cell before
// it isn't plain road), a truck only heads there with a spot free.
const stationOf = (a) => (a.kind === "sts" ? a.berth : a.kind === "rtg" ? a.block : null);
const LINE_MAX = 2;
const inLine = (t, st) => !!t.cmd && (t.cmd.kind === "sts" || t.cmd.kind === "rtg") && !t.cmd.spot && (!st || stationOf(t.cmd) === st);
const freeSpot = (st) => { for (let s = st.spots.length - 1; s >= 0; s--) if (!st.spots[s].claim) return st.spots[s]; return null; };
// (stress test) the waiting spots, front first, one truck length apart: the second waits behind the first, not beside it
const lineFull = (st, t) => !freeSpot(st) && trucks.filter((q) => q !== t && inLine(q, st)).length >= (st.lines || []).length;
// who waits where: by how far each is from the front waiting spot
const lineRank = (q) => q.path.length + 4 * (q.cmd.li || 0);
function sortLines() {
  for (const st of stations()) {
    const ws = trucks.filter((q) => inLine(q, st)).sort((a, b) => lineRank(a) - lineRank(b));
    ws.forEach((q, i) => { const li = Math.min(i, st.lines.length - 1); if (q.cmd.li !== li || !q.path.length && head(q) !== st.lines[li]) { q.cmd.li = li; goTo(q, st.lines[li]); } });
  }
}
const stations = () => BERTHS.filter((b) => b.open).concat(BLOCKS);
const targetKey = (a) => (a.kind === "tpark" ? a.spot.head : a.kind === "park" ? a.stall.head : a.spot ? a.spot.head : stationOf(a).lines[a.li || 0]);
// a spot is let go once the truck it was for stops heading there
function freeSpots() {
  for (const st of stations()) for (const sp of st.spots) { const t = sp.claim; if (t && (t.gone || !((t.cmd && t.cmd.spot === sp) || t.queue.some((a) => a.spot === sp)))) sp.claim = null; }
}
function fillSpots() {
  for (const st of stations()) for (let sp = freeSpot(st); sp; sp = freeSpot(st)) {
    let t = null; for (const q of trucks) if (inLine(q, st) && !q.locked && (!t || lineRank(q) < lineRank(t))) t = q;
    if (!t) break;
    sp.claim = t; t.cmd.spot = sp; goTo(t, sp.head);
  }
}
// start a trip: at a crane or an RTG it takes a free spot, or the waiting spot (a tractor only with room there: at most
// 2 waiting, the rest wait in the tractor parking)
function startCmd(t, a) {
  const st = stationOf(a);
  if (st && !a.spot) {
    const sp = freeSpot(st);
    if (sp) { sp.claim = t; a.spot = sp; }
    else if (!st.lines.length || (t.kind === "yard" && lineFull(st, t))) return false;
    else a.li = Math.min(trucks.filter((q) => q !== t && inLine(q, st)).length, st.lines.length - 1);
  }
  if (t.park && !(a.kind === "tpark" && a.spot === t.park)) { if (t.park.claim === t) t.park.claim = null; t.park = null; }
  if (t.stall && t.stall.claim === t && !(a.kind === "park" && a.stall === t.stall)) t.stall.claim = null;
  t.stall = null; t.cmd = a; goTo(t, targetKey(a));
  return true;
}
// (owner) a customer truck whose container is in a storage area goes to that RTG by itself, from its lot spot, once
// there's room in its line
function custStep(t) {
  if (t.kind !== "cust" || t.exiting || t.load !== null || t.queue.length || t.cmd || !t.stall || t.next) return;
  const b = BLOCKS.find((q) => holds(q, t.want)); if (!b || lineFull(b, t)) return;
  startCmd(t, { kind: "rtg", block: b });
}
// can the first queued step start now? (a drop-off needs somewhere to go; a crane trip a ship to work and room in its
// line, an RTG trip room in its line)
function canStart(t) {
  const a = t.queue[0]; if (!a) return false;
  if (a.kind === "deliver") return !t.load || !!deliverAction(t, false);
  if (a.kind === "sts") { const s = DOCK.ship; return !!s && (s.state === "docked" || s.state === "closing") && !lineFull(a.berth, t); }
  if (a.kind === "rtg") return !lineFull(a.block, t);
  return true;
}
// (owner) a tractor with nothing to do (or whose next step can't start yet) drives to the nearest free tractor parking
// spot and parks; sent somewhere on the way, it gives the spot up
function idleStep(t) {
  if (t.kind !== "yard" || t.next || t.locked) return;
  const ready = canStart(t);
  if (t.cmd && t.cmd.kind === "tpark" && ready) { t.cmd.spot.claim = null; t.cmd = null; return; }
  if (t.cmd || ready || t.park) return;
  const [hi, hj] = headIJ(t), cands = tractorPockets().filter((q) => !q.claim).map((q) => { const [i, j] = unkey(q.head); return [Math.abs(i - hi) + Math.abs(j - hj), q]; }).sort((a, b) => a[0] - b[0]).slice(0, 4);
  let p = null, best = Infinity;
  for (const [, q] of cands) { const r = route(t.next || head(t), q.head), c = r ? r.cost : Infinity; if (c < best) { best = c; p = q; } }
  if (p) { p.claim = t; startCmd(t, { kind: "tpark", spot: p }); }
}
// (owner) an auto tractor with an RTG assigned: loaded, it takes the container there (when its area has room); empty, it
// fetches from the ship: a container a customer is waiting for if one is in reach and unclaimed, otherwise whatever its
// crane takes (the crane with the most left). It works through anything queued first, and parks when there's nothing.
function autoStep(t) {
  if (!t.auto || !t.home || t.load || t.cmd || t.next || t.queue.length || t.locked) return;
  if (!BLOCKS.includes(t.home)) { t.home = null; return; }
  const s = DOCK.ship, room = (b) => !lineFull(b, t);
  // assigned to the export area: fetch an export
  if (t.home.exp) { if (count(t.home) - expClaims(t.home) > 0 && shipTakesExports(t)) enqueue(t, { kind: "rtg", block: t.home, pickup: true }); return; }
  const left = BERTHS.filter((b) => berthLeft(b) > 0), roomy = left.filter(room), bs = roomy.length ? roomy : left; if (!bs.length) return;
  for (const b of bs) { const [c0, c1] = craneCols(b); for (let k = 0; k < s.bays.length; k++) { const st = s.bays[k], x = st.find((q) => q.wantedBy), c = k % DOCK.cols; if (x && !x.exp && c >= c0 && c < c1 && impCount(st) - s.claims[k] > 0 && !BERTHS.some((q) => q.crane.slot === k)) { enqueue(t, { kind: "sts", berth: b, slot: k }); return; } } }
  enqueue(t, { kind: "sts", berth: bs.reduce((m, b) => (berthLeft(b) > berthLeft(m) ? b : m)) });
}
// (owner) any loaded tractor with nothing queued takes its container where it goes by itself: an import to a storage
// area with room (an auto tractor's own RTG, otherwise the nearest), an export to a crane (one with room for it on the
// ship, preferring one with room in its line and one that can hand back an import)
// where a loaded tractor's container goes right now (pick: whether a crane taking an export may hand back an import)
function deliverAction(t, pick) {
  if (t.load.exp) { const ok = BERTHS.filter((b) => exportRoom(b) > 0), roomy = ok.filter((b) => !lineFull(b, t)), bs = roomy.length ? roomy : ok; if (!bs.length) return null; const b = bs.find((q) => berthLeft(q) > 0) || bs[0]; return { kind: "sts", berth: b, exp: true, pick: pick && berthLeft(b) > 0 }; }
  const [hx, hy] = headIJ(t), own = t.auto && t.home && BLOCKS.includes(t.home) && !t.home.exp && free(t.home) > 0 ? t.home : null;
  const dist = (b) => { const [x, y] = slotXY(b, 2, 0); return Math.abs(x / T - hx) + Math.abs(y / T - hy); };
  const dest = own || (t.auto && t.home && !t.home.exp ? null : BLOCKS.filter((b) => !b.exp && free(b) > 0 && !lineFull(b, t)).reduce((m, b) => (!m || dist(b) < dist(m) ? b : m), null));
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
// room to clear a junction: the tiles beyond it free for a truck's length, and past any junction just beyond it too, so
// its tail is never left standing in one. A truck driving in keeps those tiles for itself until it's clear of the
// junction, so nobody cuts in.
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
  if (all || (!t.tiles.some((k) => BOX.has(k)) && !(t.next && BOX.has(t.next)))) { for (const k of t.resv) if (RESV.get(k) === t) RESV.delete(k); t.resv = []; }
}
function truckStep(t, dt) {
  if (t.locked) return;
  if (t.kind === "yard" && t.cmd && t.cmd.kind === "sts" && t.load && !t.load.exp && !t.next) { const a = t.cmd; delete a.spot; t.cmd = null; t.path = []; t.queue.unshift({ kind: "deliver" }, a); }
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
  // traffic: move into the next tile only when no other truck holds it
  if (!t.next && t.path.length) {
    const n = t.path[0], o = occ.get(n), bs = CHG.get(head(t) + ">" + n);
    const box = BOX.has(n) && !BOX.has(head(t));
    // (2026-11-01) a lane change needs the tile beside free, unless what's there is standing still and not about to
    // move into this lane: then a truck can slip in ahead of it (into its spot at a crane or an RTG, say)
    const sideOk = !bs || mine(bs, t) || (occ.get(bs) && !occ.get(bs).next && occ.get(bs).path[0] !== head(t) && !RESV.get(bs));
    if (mine(n, t) && sideOk && (!box || boxClear(t))) { occ.set(n, t); t.next = n; t.p = 0; t.blocked = 0; }
    else if ((t.blocked = (t.blocked || 0) + dt) > (t.patience || (t.patience = 0.5 + rnd()))) {   // staggered, so held-up trucks don't all re-plan at once
      t.blocked = 0;
      if (o && o !== t) { if (!o.next) pass(t); }
      else { const r = route(head(t), t.path[t.path.length - 1], (k) => k === n); if (r && r.length) t.path = r; }   // (bug) two side by side each changing into the other's lane: carry straight on instead
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
    }
  }
}
// (owner) held up by a stopped truck: take the passing lane round it, if that isn't much longer
function pass(t) {
  const o = occ.get(t.path[0]); if (o && inLine(o) && inLine(t, stationOf(o.cmd))) return;   // no jumping the line
  const goal = t.path[t.path.length - 1], now = route(head(t), goal); if (!now) return;
  const r = route(head(t), goal, (k) => { const q = occ.get(k); return q && q !== t && !q.next; });
  if (r && r.length && r[0] !== t.path[0] && r.cost <= now.cost + 8) { t.path = r; passes++; }
}
function doneServing(t) {
  t.cmd = null; t.locked = false;
  if (t.queue.length) return;
  if (t.kind === "exp") leave(t);
  if (t.kind === "cust") { t.happy = 1.8; delivered++; money += INCOME; const tr = trailerOf(t); floats.push({ x: tr.x, y: tr.y - 20, t: 1.6, text: "+$" + INCOME }); leave(t); }
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
    else if (op.lower) { const s = op.lower, x = s.second ? cr.hold2 : cr.hold; if (x && (x.claimedBy === TAKEN || !s.stack)) x.claimedBy = null; if (s.stack) s.stack.push(x); else s.truck.load = x; if (s.second) cr.hold2 = null; else cr.hold = null; if (op.then) op.then(); }
  }
  if (ph < 1) return;
  cr.hoist = 0; cr.ops.shift(); if (!cr.ops.length) onDone();
}
// STS: the front-most empty tractor standing in its line gets the nearest container (two at once with two waiting)
// (owner) a tractor bringing an export: the crane lifts it off onto the ship (a slot with no imports, nearest first; it
// pays then) and on the way back takes an import for the same tractor, so no trip is empty. Tractors bringing exports
// are served first.
// (owner) where a trip's claimed container is: its slot, how many unclaimed containers now sit on top of it (left by
// trips called off: the crane moves them aside first), and which claimed container it gets (its own, or another trip's
// on top of it: the two swap). used: a slot whose top is already being taken in this lift.
function boxPlan(a, used) {
  const s = DOCK.ship; if (!s || !a.box) return null;
  const k = s.bays.findIndex((st) => st.includes(a.box)); if (k < 0) return null;
  const st = s.bays[k]; let dig = 0;
  for (let i = st.length - 1 - (k === used ? 1 : 0); i >= 0; i--) { const x = st[i]; if (x === a.box || (x.claimedBy && x.claimedBy !== TAKEN)) return { k, dig, x }; if (x.claimedBy === TAKEN || x.exp) return null; dig++; }
  return null;
}
function boxSwap(a, p) { if (p.x === a.box) return; const o = p.x.claimedBy; o.box = a.box; a.box.claimedBy = o; a.box = p.x; p.x.claimedBy = a; }
// where to set the n containers on top of slot k aside: the nearest low import slots in the crane's columns with room,
// none claimed or being worked, avoiding ones with a container a customer wants
function digDsts(b, k, n) {
  const s = DOCK.ship, [c0, c1] = craneCols(b), h = s.bays.map((st) => st.length), out = [];
  for (let m = 0; m < n; m++) {
    let best = -1, bd = 1e9;
    s.bays.forEach((st, j) => { const c = j % DOCK.cols; if (j === k || c < c0 || c >= c1 || !onDeck(s, j) || h[j] >= 3 || !impCount(st) || st.some((x) => x.claimedBy) || BERTHS.some((q) => q.crane.slot === j || q.crane.slot2 === j)) return; const d = h[j] * 3 + Math.abs(c - k % DOCK.cols) * 2 + Math.abs(shipSlot(j).r - shipSlot(k).r) + (st.some((x) => x.wantedBy) ? 20 : 0); if (d < bd) { bd = d; best = j; } });
    if (best < 0) return null; h[best]++; out.push(best);
  }
  return out;
}
// can the crane serve this tractor's pickup now? (a claimed container that's gone loses its claim: any will do)
function canServe(b, q) {
  const a = q.cmd; if (!a.box || a.pick === false) return true;
  const s = DOCK.ship; if (b.crane.hold2 === a.box) return true;
  if (!s.bays.some((st) => st.includes(a.box))) { if (a.box.claimedBy === a) a.box.claimedBy = null; delete a.box; delete a.slot; syncClaims(); return true; }
  const p = boxPlan(a, -1); return !!p && (!p.dig || !!digDsts(b, p.k, p.dig));
}
function stsStep(b, dt) {
  const cr = b.crane, s = DOCK.ship;
  if (!cr.ops.length && !cr.truck && s && (s.state === "docked" || s.state === "closing") && (berthLeft(b) + b.promised > 0 || expPromised(b) > 0)) {
    const waiting = trucks.filter((q) => q.cmd && q.cmd.kind === "sts" && q.cmd.berth === b && (q.load === null || q.load.exp) && !q.next && !q.locked && q.cmd.spot && head(q) === q.cmd.spot.head);
    let t = null, ti = 1e9;
    for (const q of waiting) { if (!canServe(b, q)) continue; const d = -(q.load ? 100 : 0); if (d > ti) continue; ti = d; t = q; }
    if (t) {
      const a = t.cmd, ly = (QROW + 0.5) * T, [c0, c1] = craneCols(b), ops = [];
      const sx = (k) => (DOCK.x + shipSlot(k).c * CL + 1.5) * T, sy = (k) => (DOCK.top + shipSlot(k).r + 0.5) * T;
      // the slot an import pickup takes from: (owner) the one its claimed container is in now, if it has one (only with
      // nothing to move aside, when it's the second of a lift), else the nearest with an import nobody has claimed on top
      // (used: a slot already being taken from once in this lift)
      const slotFor = (q, refX, used) => {
        if (q.cmd.box) { const p = boxPlan(q.cmd, used); if (!p || p.dig) return -1; boxSwap(q.cmd, p); return p.k; }
        let best = -1, bd = 1e9; s.bays.forEach((st, k) => { const c = k % DOCK.cols; if (pickable(st, k === used ? 1 : 0) && c >= c0 && c < c1) { const d = Math.abs(sx(k) - refX) + (DOCK.rows - shipSlot(k).r) * 8; if (d < bd) { bd = d; best = k; } } }); return best;
      };
      const take = (q) => { const a = q.cmd; if (a.box) { if (a.box.claimedBy === a) a.box.claimedBy = null; delete a.box; } delete a.slot; syncClaims(); };
      const mark = (k, skip) => { const st = s.bays[k], x = st[st.length - 1 - skip]; if (x) x.claimedBy = TAKEN; syncClaims(); };
      // (owner) each tractor drives off the moment it's done with: loaded, or (an export with nothing to take back) lifted off
      const rel = (q, picked) => () => { if (picked) b.promised = Math.max(0, b.promised - 1); if (cr.truck === q) cr.truck = null; if (cr.truck2 === q) cr.truck2 = null; doneServing(q); };
      let refX = trailerOf(t).x, placed = !t.load, liftOff = null;
      if (t.load) {
        let es = -1, ed = 1e9;
        s.bays.forEach((st, k) => { const q = shipSlot(k); if (!onDeck(s, k) || q.c < c0 || q.c >= c1 || st.length >= 3 || impCount(st)) return; const d = Math.abs(sx(k) - refX) + (DOCK.rows - q.r) * 8; if (d < ed) { ed = d; es = k; } });
        a.exp = false;
        if (es >= 0) { placed = true; liftOff = { lift: { truck: t } }; ops.push({ to: () => [trailerOf(t).x, ly] }, liftOff, { to: [sx(es), sy(es)] }, { lower: { stack: s.bays[es] }, then: () => { money += INCOME; exported++; floats.push({ x: sx(es), y: sy(es) - 20, t: 1.6, text: "+$" + INCOME }); } }); refX = sx(es); }
      }
      let best = -1, t2 = null, best2 = -1, spare = false, extra = -1, dig = [];
      if (a.pick !== false) {
        if (placed && cr.hold2 && (cr.hold2 === a.box || (a.slot === undefined && !(cr.hold2.claimedBy && cr.hold2.claimedBy !== TAKEN)))) spare = true;   // hand over the one it's holding (one kept for a tractor only to that one)
        else {
          if (placed && a.box) { const p = boxPlan(a, -1), d = p && (p.dig ? digDsts(b, p.k, p.dig) : []); if (d) { boxSwap(a, p); best = p.k; dig = d; } }
          else if (placed) best = slotFor(t, refX, -1);
          const bx = a.box; take(t);
          if (best >= 0) { if (bx) { bx.claimedBy = TAKEN; syncClaims(); } else mark(best, 0); } else b.promised = Math.max(0, b.promised - 1);
        }
      }
      if (spare) { ops.push({ to: () => [trailerOf(t).x, ly] }, { lower: { truck: t, second: true }, then: rel(t, true) }); t.locked = true; cr.truck = t; cr.ops = ops; }
      // (owner) holding two: with an empty tractor at the front of the other line too, lift one for each in the same trip;
      // otherwise, with more pickups on their way, lift a spare to hold for the next tractor
      if (false) {   // (2026-11-01) one spot under each crane: no second tractor to lift for
        for (const q of waiting) { if (q === t || q.load !== null || q.cmd.pick === false) continue; const k = slotFor(q, sx(best), best); if (k >= 0) { t2 = q; best2 = k; take(q); mark(k, k === best ? 1 : 0); break; } }
      }
      if (!spare && best >= 0 && !t2 && !dig.length && !cr.hold2 && coming(b, t)) { let bd = 1e9; s.bays.forEach((st, k) => { const c = k % DOCK.cols; if (pickable(st, k === best ? 1 : 0) && c >= c0 && c < c1) { const d = Math.abs(sx(k) - sx(best)) + (DOCK.rows - shipSlot(k).r) * 8; if (d < bd) { bd = d; extra = k; } } }); if (extra >= 0) mark(extra, extra === best ? 1 : 0); }
      if (!spare && best < 0 && liftOff) liftOff.then = rel(t, false);
      if (!spare && best >= 0) {
        cr.slot = best; cr.slot2 = t2 ? best2 : undefined;
        for (const d of dig) ops.push({ to: [sx(best), sy(best)] }, { lift: { stack: s.bays[best] } }, { to: [sx(d), sy(d)] }, { lower: { stack: s.bays[d] } });   // (owner) the ones left on top of it, set aside first
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
    const eta = soonest(b), any = soonestAny(b), nextBox = nextClaimed(b), wanted = (st) => { const x = st[st.length - 1]; return x && !x.exp && x.wantedBy ? 1 : 0; };
    // (owner, 2026-11-01) the next tractor first: the nearest one on its way. Sent for a claimed container, the crane
    // sets aside whatever was left on top of it, then lifts it ready in its second slot, kept for that tractor alone
    const next = comingAny(b).filter((q) => q.cmd.pick !== false).reduce((m, q) => (!m || q.path.length < m.path.length ? q : m), null);
    const kept = cr.hold2 && cr.hold2.claimedBy && cr.hold2.claimedBy !== TAKEN;
    const nb = s.state === "docked" && next && next.cmd.box && cr.hold2 !== next.cmd.box ? boxPlan(next.cmd, -1) : null;
    if (cr.hold2 && !kept && eta === Infinity) { const k = nearest((st) => st.length < 3 && (!st.length || impCount(st)) && !st.some((x) => x.claimedBy)); if (k >= 0) cr.ops = [{ to: [sx(k), sy(k)] }, { lower: { stack: s.bays[k], second: true } }]; }
    else if (nb && nb.dig) { const d = digDsts(b, nb.k, 1); if (d) cr.ops = [{ to: [sx(nb.k), sy(nb.k)] }, { lift: { stack: s.bays[nb.k] } }, { to: [sx(d[0]), sy(d[0])] }, { lower: { stack: s.bays[d[0]] } }]; }
    else if (nb && !cr.hold2) { boxSwap(next.cmd, nb); cr.ops = [{ to: [sx(nb.k), sy(nb.k)] }, { lift: { stack: s.bays[nb.k], second: true } }]; }
    else if (!cr.hold2 && eta < Infinity && s.state === "docked" && !(next && next.cmd.box)) { const free = (st, kk) => pickable(st) && !BERTHS.some((q) => q.crane.slot === kk || q.crane.slot2 === kk); let k = nearest((st, kk) => free(st, kk) && wanted(st)); if (k < 0) k = nearest(free); if (k >= 0) { const st = s.bays[k]; st[st.length - 1].claimedBy = TAKEN; syncClaims(); cr.ops = [{ to: [sx(k), sy(k)] }, { lift: { stack: st, second: true } }]; } }
    // (owner, 2026-11-01) any tractor on its way counts here, one sent for a claimed container too
    else if (s.state === "docked" && (any === Infinity || (cr.hold2 && any > 28)) && sortShip(b)) { /* digging out a wanted container (owner) */ }
    else if (s.state === "docked" && any === Infinity) levelShip(b);
    // the next one's coming for a claimed container: wait over it
    else if (any < Infinity && nextBox) { const k = s.bays.findIndex((st) => st.includes(nextBox)); if (k >= 0 && hyp(sx(k) - cr.x, sy(k) - cr.y) > 2) cr.ops = [{ to: [sx(k), sy(k)] }]; }
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
// (owner, 2026-11-01) how far off the nearest tractor on its way to this crane is, whatever it's coming for, and the
// claimed container of the nearest one sent for one
const comingAny = (b) => trucks.filter((q) => q.cmd && q.cmd.kind === "sts" && q.cmd.berth === b && !q.locked);
const soonestAny = (b) => comingAny(b).reduce((m, q) => Math.min(m, q.path.length), Infinity);
const nextClaimed = (b) => { let best = null, d = Infinity; for (const q of comingAny(b)) if (q.cmd.box && q.cmd.pick !== false && q.path.length < d) { d = q.path.length; best = q.cmd.box; } return best; };
const coming = (b, t) => trucks.some((q) => q !== t && q.cmd && q.cmd.kind === "sts" && q.cmd.berth === b && q.cmd.pick !== false && q.cmd.slot === undefined && !q.locked && (q.load === null || q.load.exp));
// (owner) an idle STS crane sorts the ship, before anything else: it takes the top container off a slot where a
// customer's container is buried (the least buried first; a slot tractors are queued for only while enough is left for them) and sets it on the nearest low slot of its own columns
// that holds no exports and no wanted container
// (owner) a claimed container on top may be moved too: its trip follows it. (owner, 2026-11-01) A container a tractor
// has been sent for, buried under ones nobody has claimed, is dug out the same way.
function sortShip(b) {
  const s = DOCK.ship, cr = b.crane, [c0, c1] = craneCols(b), inCols = (k) => k % DOCK.cols >= c0 && k % DOCK.cols < c1 && onDeck(s, k);
  const busy = (k) => s.claims[k] > 0 || BERTHS.some((q) => q.crane.slot === k || q.crane.slot2 === k);
  let src = -1, sd = 1e9;
  s.bays.forEach((st, k) => { if (!inCols(k) || !impCount(st) || BERTHS.some((q) => q.crane.slot === k || q.crane.slot2 === k) || st[st.length - 1].claimedBy === TAKEN) return; const topC = !!st[st.length - 1].claimedBy, i = st.findIndex((x) => x.wantedBy || (!topC && x.claimedBy && x.claimedBy !== TAKEN)); if (i < 0 || i === st.length - 1) return; if (st.length - 1 - i < sd) { sd = st.length - 1 - i; src = k; } });
  if (src < 0) return false;
  const qs = shipSlot(src); let dst = -1, dd = 1e9;
  s.bays.forEach((st, k) => { if (k === src || !inCols(k) || st.length >= 3 || (st.length && !impCount(st)) || st.some((x) => x.wantedBy) || busy(k)) return; const q = shipSlot(k), d = [3, 0, 8][st.length] + Math.abs(q.c - qs.c) * 2 + Math.abs(q.r - qs.r); if (d < dd) { dd = d; dst = k; } });   // (owner) onto a single first: stacks of two
  if (dst < 0) return false;
  const sx = (k) => (DOCK.x + shipSlot(k).c * CL + 1.5) * T, sy = (k) => (DOCK.top + shipSlot(k).r + 0.5) * T;
  cr.ops = [{ to: [sx(src), sy(src)] }, { lift: { stack: s.bays[src] } }, { to: [sx(dst), sy(dst)] }, { lower: { stack: s.bays[dst] } }];
  return true;
}
// (owner, 2026-11-01) with nothing to sort, an idle crane evens its section out into stacks of two: the top container of
// a stack of three goes onto a single (else an empty slot), and failing that a single goes onto another single (east to
// west), so its containers end up two high. It never buries a claimed or wanted container, never moves one, and leaves
// exports and slots a tractor is coming for alone.
function levelShip(b) {
  const s = DOCK.ship, cr = b.crane, [c0, c1] = craneCols(b);
  const busy = (k) => s.claims[k] > 0 || BERTHS.some((q) => q.crane.slot === k || q.crane.slot2 === k);
  const ks = s.bays.map((_, k) => k).filter((k) => k % DOCK.cols >= c0 && k % DOCK.cols < c1 && onDeck(s, k) && !busy(k) && (!s.bays[k].length || impCount(s.bays[k])));
  const h = (k) => s.bays[k].length, top = (k) => s.bays[k][h(k) - 1], col = (k) => k % DOCK.cols;
  const canTake = (k) => h(k) && !top(k).wantedBy && !top(k).claimedBy, canTo = (k) => !s.bays[k].some((x) => x.wantedBy || x.claimedBy);
  const dist = (a, z) => Math.abs(col(a) - col(z)) * 2 + Math.abs(shipSlot(a).r - shipSlot(z).r);
  let src = -1, dst = -1, best = 1e9;
  for (const a of ks) if (h(a) === 3 && canTake(a)) for (const z of ks) if (z !== a && h(z) < 2 && canTo(z)) { const d = (h(z) === 1 ? 0 : 20) + dist(a, z); if (d < best) { best = d; src = a; dst = z; } }
  if (src < 0) for (const a of ks) if (h(a) === 1 && canTake(a)) for (const z of ks) if (z !== a && h(z) === 1 && canTo(z) && col(z) < col(a)) { const d = dist(a, z); if (d < best) { best = d; src = a; dst = z; } }
  if (src < 0) return false;
  const sx = (k) => (DOCK.x + shipSlot(k).c * CL + 1.5) * T, sy = (k) => (DOCK.top + shipSlot(k).r + 0.5) * T;
  cr.ops = [{ to: [sx(src), sy(src)] }, { lift: { stack: s.bays[src] } }, { to: [sx(dst), sy(dst)] }, { lower: { stack: s.bays[dst] } }];
  return true;
}
// RTG: serves the trucks stopped at its spots in the lane beside it, one at a time, moving as little as it can (owner):
// it stays where it finished instead of going back to rest; over the lane it unloads a tractor next, out in the stacks
// it digs for a customer next; and a tractor's container goes down near the container the next customer wants (never on
// it), so the crane drops it on its way there. Slot columns lie 3 tiles apart along the lane, rows 1 tile apart.
const atSpot = (q, b) => q.cmd && q.cmd.kind === "rtg" && q.cmd.block === b && q.cmd.spot && !q.next && !q.locked && head(q) === q.cmd.spot.head;
const colOf = (b, t) => clamp(Math.round((blocal(b, trailerOf(t).x, trailerOf(t).y)[0] - 2) / 3), 0, b.cols - 1);
function rtgStep(b, dt) {
  if (b.exp) return exportRtgStep(b, dt);
  const cr = b.rtg;
  if (!cr.ops.length && !cr.truck) {
    const ready = trucks.filter((q) => atSpot(q, b));
    const srcOf = (t) => { let src = null, fewest = 1e9; for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { const st = b.slots[c][r], k = st.indexOf(t.want); if (k >= 0 && st.length - 1 - k < fewest) { fewest = st.length - 1 - k; src = [c, r]; } } return src && { src, fewest }; };
    const L = ready.filter((q) => q.kind === "cust" && q.load === null && srcOf(q)), U = free(b) > 0 ? ready.filter((q) => q.kind === "yard" && q.load !== null) : [];
    // (bug 2026-11-01) nearest first, but the longer a truck has waited at its spot the more it counts, so none is passed over
    for (const q of ready) if (q.cmd.readyAt === undefined) q.cmd.readyAt = clock;
    const age = (q) => (clock - q.cmd.readyAt) * 60, near = (list, f) => list.reduce((m, q) => (!m || f(q) - age(q) < f(m) - age(m) ? q : m), null);
    const toTruck = (q) => Math.abs(trailerOf(q).x - cr.x) + Math.abs(trailerOf(q).y - cr.y), toSrc = (q) => { const [c, r] = srcOf(q).src, [x, y] = slotXY(b, c, r); return Math.abs(x - cr.x) + Math.abs(y - cr.y); };
    const atLane = blocal(b, cr.x, cr.y)[1] < 0.5, nu = near(U, toTruck), nl = near(L, toSrc);
    const t = atLane ? nu || nl : nl || nu;
    if (t) {
      const at = () => { const tr = trailerOf(t); return [tr.x, tr.y]; };
      if (t.kind === "yard") {
        const next = near(L, (q) => Math.abs(colOf(b, q) - colOf(b, t))), hint = next && srcOf(next).src, cc = colOf(b, t);
        let best = null, bs = 1e9;
        for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) {
          const st = b.slots[c][r]; if (st.length >= 3 || (hint && c === hint[0] && r === hint[1])) continue;
          const d = hint ? Math.abs(c - hint[0]) * 3 + Math.abs(r - hint[1]) : Math.abs(c - cc) * 3 + r;
          const sc = st.length * 4 + d + (st.some((x) => x.wantedBy) ? 12 : 0); if (sc < bs) { bs = sc; best = [c, r]; }
        }
        if (best) { t.locked = true; cr.truck = t; cr.ops = [{ to: at }, { lift: { truck: t }, then: () => { cr.truck = null; doneServing(t); } }, { to: slotXY(b, best[0], best[1]) }, { lower: { stack: b.slots[best[0]][best[1]] } }]; }   // (owner) the tractor drives off once its container is lifted
      } else {
        const { src, fewest } = srcOf(t), ops = [], h = b.slots.map((col) => col.map((st) => st.length));
        for (let n = 0; n < fewest; n++) {
          let dst = null, ds = 1e9;
          for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { if ((c === src[0] && r === src[1]) || h[c][r] >= 3) continue; const sc = h[c][r] * 4 + Math.abs(c - src[0]) * 3 + Math.abs(r - src[1]); if (sc < ds) { ds = sc; dst = [c, r]; } }
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

// the export area's RTG: takes containers off export trucks (onto a low stack near the lane) and puts one onto each
// empty tractor that comes for one (off the top of a tall stack nearby; exports are all alike, so no digging)
function exportRtgStep(b, dt) {
  const cr = b.rtg;
  if (!cr.ops.length && !cr.truck) {
    const ready = trucks.filter((q) => atSpot(q, b));
    const U = free(b) > 0 ? ready.filter((q) => q.kind === "exp" && q.load !== null) : [], L = count(b) > 0 ? ready.filter((q) => q.kind === "yard" && q.load === null) : [];
    for (const q of ready) if (q.cmd.readyAt === undefined) q.cmd.readyAt = clock;
    const sc = (q) => Math.abs(trailerOf(q).x - cr.x) + Math.abs(trailerOf(q).y - cr.y) - (clock - q.cmd.readyAt) * 60, near = (list) => list.reduce((m, q) => (!m || sc(q) < sc(m) ? q : m), null);
    const atLane = blocal(b, cr.x, cr.y)[1] < 0.5, t = atLane ? near(U) || near(L) : near(L) || near(U);
    if (t) {
      const at = () => { const tr = trailerOf(t); return [tr.x, tr.y]; }, cc = colOf(b, t);
      let best = null, bs = 1e9;
      for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) {
        const st = b.slots[c][r], d = Math.abs(c - cc) * 3 + r;
        const s2 = t.kind === "exp" ? (st.length >= 3 ? 1e9 : st.length * 4 + d) : (!st.length ? 1e9 : -st.length * 4 + d);
        if (s2 < bs) { bs = s2; best = [c, r]; }
      }
      const done = () => { cr.truck = null; doneServing(t); };
      t.locked = true; cr.truck = t;
      if (t.kind === "exp") cr.ops = [{ to: at }, { lift: { truck: t }, then: done }, { to: slotXY(b, best[0], best[1]) }, { lower: { stack: b.slots[best[0]][best[1]] } }];
      else { t.cmd.served = true; cr.ops = [{ to: slotXY(b, best[0], best[1]) }, { lift: { stack: b.slots[best[0]][best[1]] } }, { to: at }, { lower: { truck: t }, then: done }]; }
    }
  }
  craneStep(cr, dt, () => {});
}

// ---- input: pan / zoom; select a truck, then where it goes; or build ----
let VW = 0, VH = 0, DPR = 1, zoom = 1, cam = { x: MW * T / 2, y: MH * T / 2 }, selected = null, hover = null, bad = null;
// (owner, 2026-11-01) build mode: one of the build buttons is on; taps build there (roads and bulldozing also by
// dragging)
let buildMode = null;
// (owner, 2026-11-01) blueprints: a storage area, the export area, parking or a lot is placed as a blueprint first,
// dragged where it goes, turned to face the road on any side, then built with the check mark
let bp = null, ICONS = [];
const BP_MODES = ["storage", "export", "parking", "lot"], TURN = ["S", "W", "N", "E"];
const bpFoot = (b) => (b.mode === "parking" || b.mode === "lot" ? { cells: [[b.cx, b.cy]], w: 1, h: 1 } : blockFoot(b.side, b.cx, b.cy));
const bpPlan = () => bp && planBuild(bp.mode, bp.cx, bp.cy, bp.side);
function bpCenter(cx, cy) { const f = bpFoot(bp); bp.cx = cx - Math.floor((f.w - 1) / 2); bp.cy = cy - Math.floor((f.h - 1) / 2); }
function bpTurn() { if (!bp) return; const f = bpFoot(bp), mx = bp.cx + f.w / 2, my = bp.cy + f.h / 2; bp.side = TURN[(TURN.indexOf(bp.side) + 1) % 4]; const g = bpFoot(bp); bp.cx = Math.round(mx - g.w / 2); bp.cy = Math.round(my - g.h / 2); }
function bpPlace() { if (!bp) return; if (!doBuild(bp.mode, bp.cx, bp.cy, bp.side)) { const [x, y, w, h] = cellsRect(bpFoot(bp).cells); bad = { i: Math.floor((x + w / 2) / T), j: Math.floor((y + h / 2) / T), t: 0.5 }; } }
// a new blueprint starts at the spot nearest the middle of the screen where it would fit
function bpStart(mode) {
  const w = toWorld(VW / 2, VH / 2), mc = [w.x / (CELL * T), (w.y / T - Y0) / CELL];
  let best = null, bd = Infinity;
  for (let cy = 1; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) for (const side of TURN) {
    const p = planBuild(mode, cx, cy, side); if (!p || !p.ok) continue;
    const f = bpFoot({ mode, side, cx, cy }), d = hyp(cx + f.w / 2 - mc[0], cy + f.h / 2 - mc[1]);
    if (d < bd) { bd = d; best = { mode, side, cx, cy }; }
  }
  if (best) return best;
  bp = { mode, side: "S", cx: 0, cy: 0 }; bpCenter(clamp(Math.floor(mc[0]), 0, CW - 1), clamp(Math.floor(mc[1]), 1, CH - 1)); return bp;
}
const bpHas = (cx, cy) => bp && bpFoot(bp).cells.some((c) => c[0] === cx && c[1] === cy);
const iconAt = (sx, sy) => ICONS.find((ic) => hyp(sx - ic.x, sy - ic.y) <= ic.r + (touchy ? 6 : 2));
const keys = {};
addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "Escape") { selected = null; setBuild(null); } if (bp && e.code === "KeyR") bpTurn(); if (bp && (e.code === "Enter" || e.code === "NumpadEnter")) bpPlace(); const n = /^Digit([1-9])$/.exec(e.code); if (n) { const t = trucks.find((q) => q.num === +n[1]); if (t) selected = t; } });
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
const toWorld = (sx, sy) => ({ x: (sx - VW / 2) / zoom + cam.x, y: (sy - VH / 2) / zoom + cam.y });
const tileAtScreen = (sx, sy) => { const w = toWorld(sx, sy); return [Math.floor(w.x / T), Math.floor(w.y / T)]; };
const cellAtScreen = (sx, sy) => { const [i, j] = tileAtScreen(sx, sy); return [Math.floor(i / CELL), Math.floor((j - Y0) / CELL)]; };
function segDist(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, u = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l, 0, 1); return hyp(px - a[0] - u * dx, py - a[1] - u * dy); }
// (owner, 2026-11-01) bigger hit areas, and where they overlap the one nearest the pointer wins: trucks (measured to
// their cab and trailer) and the containers on the docked ship (measured to the middle of the slot), with more reach
// on a touch screen. A queue badge, drawn on top, comes first.
let touchy = false;
function pickAt(sx, sy) {
  const w = toWorld(sx, sy);
  if (selected) for (let k = BADGES.length - 1; k >= 0; k--) { const b = BADGES[k]; if (b.a && Math.abs(w.x - b.x) <= b.r && Math.abs(w.y - b.y) <= b.r) return { badge: b }; }
  let best = null, bd = Infinity;
  const near = (d, r, o) => { if (d <= r && d < bd) { bd = d; best = o; } };
  const tr = touchy ? Math.max(20, 24 / zoom) : Math.max(20, 12 / zoom);
  for (const t of trucks) { if (t.exiting) continue; const q = shapeOf(t); near(Math.min(segDist(w.x, w.y, q.front, q.cabBack), segDist(w.x, w.y, q.trFront, q.trBack)), tr, { truck: t }); }
  const sh = DOCK.ship;
  if (sh && sh.state === "docked") {
    const sr = T / 2 + (touchy ? Math.max(8, 18 / zoom) : Math.max(6, 10 / zoom));
    sh.bays.forEach((st, k) => { if (!onDeck(sh, k)) return; const [x, y, rw] = slotRect(k), cy = y + T / 2; near(segDist(w.x, w.y, [x + T / 2, cy], [x + rw - T / 2, cy]), sr, { slot: k }); });
  }
  return best;
}
function truckAt(sx, sy) { const p = pickAt(sx, sy); return p && p.truck ? p.truck : null; }
// the selected truck's numbered queue badges, as last drawn (world coordinates), for tapping one off
let BADGES = [];
const badgeSize = () => clamp((touchy ? 22 : 16) / zoom, 13, 24);   // never bigger than most of a tile, so the spot under it stays tappable
// take any queued trip back (not the one under way), with the drop-off step that was put in for it
function unqueue(t, a) {
  const i = t.queue.indexOf(a); if (i < 0) return false;
  claim(t, a, -1); t.queue.splice(i, 1);
  if (t.queue[i - 1] && t.queue[i - 1].kind === "deliver" && (!t.queue[i] || t.queue[i].kind === "deliver")) t.queue.splice(i - 1, 1);
  return true;
}
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
// an auto tractor is assigned an RTG by clicking its storage area
function homeFor(t, i, j) { if (t.kind !== "yard" || !t.auto) return null; const g = targetAt(i, j); return g && g.kind === "rtg" ? g.block : null; }
// (owner, 2026-11-01) everything is one tap: tap a truck to select it (again to let go), tap where it goes to queue it,
// tap a numbered badge of its queue to take that trip back, tap open ground to let go of it
function click(sx, sy) {
  if (bp) {   // a tap on a storage area adds a row to it; anywhere else the blueprint moves there
    const [cx, cy] = cellAtScreen(sx, sy), ex = OCCUPIED.get(ckey(cx, cy));
    if (ex && ex.slots && !ex.exp && bp.mode === "storage") { if (!doBuild("storage", cx, cy)) { const [i, j] = tileAtScreen(sx, sy); bad = { i, j, t: 0.5 }; } }
    else if (inGrid(cx, cy)) bpCenter(cx, cy);
    return;
  }
  if (buildMode) { const [cx, cy] = cellAtScreen(sx, sy); if (!doBuild(buildMode, cx, cy)) { const [i, j] = tileAtScreen(sx, sy); bad = { i, j, t: 0.5 }; } return; }
  const pk = pickAt(sx, sy);
  if (pk && pk.badge) { unqueue(selected, pk.badge.a); return; }
  if (pk && pk.truck) { selected = selected === pk.truck ? null : pk.truck; return; }
  const [i, j] = pk && pk.slot !== undefined ? slotTile(pk.slot) : tileAtScreen(sx, sy), u = buyAt(i, j);
  if (u) { if (money >= u.price) { money -= u.price; u.buy(); } else bad = { i, j, t: 0.5 }; return; }
  if (!selected) return;
  const h = homeFor(selected, i, j); if (h) { selected.home = h; return; }
  const a = planFor(selected, i, j), sw = !a && slotSwap(selected, i, j);
  if (a) enqueue(selected, a); else if (sw) doSwap(selected, sw); else if (!targetAt(i, j)) selected = null; else bad = { i, j, t: 0.5 };
}
const pts = new Map(); let gesture = null, painted = null;
// (owner, 2026-11-01) press and hold a container the selected tractor has claimed on the ship to call that pickup off;
// with several of its claims in one stack, the top one goes first. Its trip under way is called off too while the
// crane hasn't started on it.
function unclaimAt(sx, sy) {
  const t = selected, s = DOCK.ship; if (buildMode || !t || t.kind !== "yard" || !s) return false;
  const pk = pickAt(sx, sy), [i, j] = pk && pk.slot !== undefined ? slotTile(pk.slot) : tileAtScreen(sx, sy), g = targetAt(i, j);
  if (!g || g.slot === undefined) return false;
  const st = s.bays[g.slot], mine2 = (t.cmd && t.cmd.kind === "sts" && !t.locked ? [t.cmd] : []).concat(t.queue).filter((a) => a.kind === "sts" && a.box && st.includes(a.box));
  if (!mine2.length) return false;
  const a = mine2.reduce((m, q) => (st.indexOf(q.box) > st.indexOf(m.box) ? q : m));
  if (a === t.cmd) { claim(t, a, -1); t.cmd = null; t.path = t.next ? [t.next] : []; }
  else unqueue(t, a);
  return true;
}
// roads and bulldozing paint along a drag, a cell at a time
const paints = () => buildMode === "road" || buildMode === "bulldoze";
function paintAt(sx, sy) { const [cx, cy] = cellAtScreen(sx, sy), k = ckey(cx, cy); if (painted.has(k)) return; painted.add(k); doBuild(buildMode, cx, cy); }
// right click: take back the selected truck's last queued trip (not the one under way); with none left, deselect
cv.addEventListener("contextmenu", (e) => { e.preventDefault(); if (touchy || buildMode) return; if (!selected || !unqueueLast(selected)) selected = null; });   // a long press on a touch screen does nothing
cv.addEventListener("pointerdown", (e) => {
  touchy = e.pointerType === "touch" || e.pointerType === "pen";
  try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()]; gesture = { pinch: hyp(a.x - b.x, a.y - b.y), zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: cam.x, cy: cam.y, moved: true }; return; }
  // in road or bulldoze mode a drag paints (the right mouse button, or two fingers, still pan)
  gesture = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false, paint: paints() && e.button !== 2 };
  if (gesture.paint) { painted = new Set(); paintAt(e.clientX, e.clientY); return; }
  // a blueprint: its turn and check-mark buttons, or grab it to drag it
  if (bp && e.button !== 2) {
    const ic = iconAt(e.clientX, e.clientY);
    if (ic) { gesture.held = true; if (ic.kind === "turn") bpTurn(); else bpPlace(); return; }
    const [cx, cy] = cellAtScreen(e.clientX, e.clientY);
    if (bpHas(cx, cy)) { gesture.drag = [cx - bp.cx, cy - bp.cy]; gesture.held = true; return; }
  }
  if (e.button === 2) return;
  const g = gesture; setTimeout(() => { if (gesture === g && !g.moved && pts.size === 1 && unclaimAt(g.sx, g.sy)) g.held = true; }, 450);
});
cv.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") { touchy = false; const pk = pickAt(e.clientX, e.clientY); hover = { tile: pk && pk.slot !== undefined ? slotTile(pk.slot) : tileAtScreen(e.clientX, e.clientY), cell: cellAtScreen(e.clientX, e.clientY), truck: pk && pk.truck }; } else hover = null;   // no hover on a touch screen
  if (!pts.has(e.pointerId) || !gesture) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture.pinch && pts.size === 2) { const [a, b] = [...pts.values()]; cam.x = gesture.cx - ((a.x + b.x) / 2 - gesture.mx) / zoom; cam.y = gesture.cy - ((a.y + b.y) / 2 - gesture.my) / zoom; setZoom(gesture.zoom * hyp(a.x - b.x, a.y - b.y) / gesture.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
  if (gesture.pinch) return;
  if (gesture.paint) { paintAt(e.clientX, e.clientY); return; }
  if (gesture.drag) { if (!bp) return; const [cx, cy] = cellAtScreen(e.clientX, e.clientY); bp.cx = cx - gesture.drag[0]; bp.cy = cy - gesture.drag[1]; return; }
  const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy; if (hyp(dx, dy) > (touchy ? 12 : 6)) gesture.moved = true;
  if (gesture.moved) { cam.x = gesture.cx - dx / zoom; cam.y = gesture.cy - dy / zoom; }
});
cv.addEventListener("pointerup", (e) => { pts.delete(e.pointerId); if (gesture && !gesture.moved && !gesture.pinch && !gesture.held && !gesture.paint && e.button !== 2) click(e.clientX, e.clientY); if (!pts.size) gesture = null; });
cv.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); if (!pts.size) gesture = null; });
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
let groundDirty = true;
function arrow(g, i, j, dx, dy) { const cx = (i + 0.5) * T, cy = (j + 0.5) * T; g.save(); g.translate(cx, cy); g.rotate(Math.atan2(dy, dx)); g.fillStyle = "rgba(236,231,220,.22)"; g.fillRect(-8, -1.5, 9, 3); g.beginPath(); g.moveTo(8, 0); g.lineTo(0, -5); g.lineTo(0, 5); g.fill(); g.restore(); }
// (perf) a few asphalt and concrete tiles painted once, stamped across the ground
let TILES = null;
function groundTiles() {
  if (TILES) return TILES;
  TILES = { road: [], conc: [] };
  for (let v = 0; v < 4; v++) {
    const a = canvas(T, T), g = a.getContext("2d"); noiseFill(g, 0, 0, T, T, "#2b2e34", 9, 11 + v * 7);
    const R = seeded(v * 131 + 7); if (v === 1) { g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.ellipse(8 + R() * 16, 8 + R() * 16, 4 + R() * 6, 3 + R() * 4, R() * 3, 0, TAU); g.fill(); }
    if (v === 2) { g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 1; g.beginPath(); g.moveTo(R() * T, R() * T); g.lineTo(R() * T, R() * T); g.stroke(); }
    TILES.road.push(a);
    const c = canvas(T, T), h = c.getContext("2d"), tint = (v - 1.5) * 3;
    noiseFill(h, 0, 0, T, T, "#" + [0x6c + tint, 0x6e + tint, 0x72 + tint].map((n) => Math.round(n).toString(16).padStart(2, "0")).join(""), 10, 29 + v * 13);
    TILES.conc.push(c);
  }
  return TILES;
}
// (art) painted when the port changes: asphalt roads with their lane markings (a double yellow line between the two
// directions, dashed white between a direction's two lanes), concrete elsewhere in slabs with joints; the quay edge with
// its hazard stripe and bollards, crane rails along the quay; storage pads with painted slot outlines; parking pockets
function buildGround() {
  groundDirty = false;
  const g = GROUND.getContext("2d"), tl = groundTiles(), road = (i, j) => j >= Y0 && i >= 0 && i < MW && j < MH && isRoad(Math.floor(i / CELL), Math.floor((j - Y0) / CELL)) || (ROADSET.has(key(i, j)) && SPOT.has(key(i, j)));
  g.clearRect(0, 0, MW * T, MH * T);
  for (let j = QUAY; j < MH; j++) for (let i = 0; i < MW; i++) {
    const x = i * T, y = j * T, v = (i * 7 + j * 13) % 4;
    if (road(i, j)) { g.drawImage(tl.road[v], x, y); continue; }
    g.drawImage(tl.conc[(Math.floor(i / 2) * 3 + Math.floor(j / 2)) % 4], x, y);
    g.fillStyle = "rgba(0,0,0,.22)"; if (i % 2 === 0) g.fillRect(x, y, 1, T); if (j % 2 === 0) g.fillRect(x, y, T, 1);
    g.fillStyle = "rgba(255,255,255,.06)"; if (i % 2 === 0) g.fillRect(x + 1, y, 1, T); if (j % 2 === 0) g.fillRect(x, y + 1, T, 1);
  }
  // painted edge lines where a road meets the ground
  g.fillStyle = "rgba(230,226,214,.32)";
  for (let j = Y0; j < MH; j++) for (let i = 0; i < MW; i++) { if (!road(i, j)) continue; const x = i * T, y = j * T;
    if (!road(i, j - 1) && j > Y0) g.fillRect(x, y + 1, T, 2); if (!road(i, j + 1) && j + 1 < MH) g.fillRect(x, y + T - 3, T, 2);
    if (!road(i - 1, j) && i > 0) g.fillRect(x + 1, y, 2, T); if (!road(i + 1, j) && i + 1 < MW) g.fillRect(x + T - 3, y, 2, T); }
  // lane markings on each road cell, by the way it runs
  for (const ck of ROADC) {
    const [cx, cy] = ck.split(",").map(Number), [x0, y0] = cellXY(cx, cy), l = links(cx, cy), ew = l.w || l.e, ns = l.n || l.s, X = x0 * T, Y = y0 * T, C = CELL * T;
    if (ew && !ns) {
      g.fillStyle = "#c9a227"; g.fillRect(X, Y + 2 * T - 3, C, 2); g.fillRect(X, Y + 2 * T + 1, C, 2);
      g.fillStyle = "rgba(236,231,220,.42)"; for (let k = 0; k < C; k += 20) { g.fillRect(X + k, Y + T - 1, 10, 2); g.fillRect(X + k, Y + 3 * T - 1, 10, 2); }
      if (cx % 2 === 0) { arrow(g, x0 + 1, y0, -1, 0); arrow(g, x0 + 2, y0 + 3, 1, 0); }
    } else if (ns && !ew) {
      g.fillStyle = "#c9a227"; g.fillRect(X + 2 * T - 3, Y, 2, C); g.fillRect(X + 2 * T + 1, Y, 2, C);
      g.fillStyle = "rgba(236,231,220,.42)"; for (let k = 0; k < C; k += 20) { g.fillRect(X + T - 1, Y + k, 2, 10); g.fillRect(X + 3 * T - 1, Y + k, 2, 10); }
      if (cy % 2 === 0) { arrow(g, x0, y0 + 1, 0, 1); arrow(g, x0 + 3, y0 + 2, 0, -1); }
    }
  }
  // the quay edge: a concrete cap with a hazard stripe, bollards; crane rails across the quay road
  g.fillStyle = "#8c8e92"; g.fillRect(0, QUAY * T, MW * T, 6);
  for (let x = 0; x < MW * T; x += 16) { g.fillStyle = "#e8b432"; g.beginPath(); g.moveTo(x, QUAY * T + 6); g.lineTo(x + 8, QUAY * T + 6); g.lineTo(x + 12, QUAY * T + 10); g.lineTo(x + 4, QUAY * T + 10); g.fill(); g.fillStyle = "#1e1f22"; g.beginPath(); g.moveTo(x + 8, QUAY * T + 6); g.lineTo(x + 16, QUAY * T + 6); g.lineTo(x + 20, QUAY * T + 10); g.lineTo(x + 12, QUAY * T + 10); g.fill(); }
  for (let i = 1; i < MW; i += 3) { const x = i * T + 16, y = QUAY * T + 18; g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.arc(x + 2, y + 3, 6, 0, TAU); g.fill(); g.fillStyle = "#2a2c30"; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill(); g.fillStyle = "#5a5e66"; g.beginPath(); g.arc(x - 1.5, y - 1.5, 2.5, 0, TAU); g.fill(); }
  for (const ry of [QUAY * T + 30, (QROW + CELL) * T - 6]) { g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, ry - 1, MW * T, 5); g.fillStyle = "#9aa0a6"; g.fillRect(0, ry, MW * T, 2); g.fillStyle = "#cfd4d8"; g.fillRect(0, ry, MW * T, 1); }
  // each crane's spot and the waiting cell behind it, and its letter
  for (const b of BERTHS) { g.lineWidth = 2; g.strokeStyle = "rgba(242,169,59,.6)"; g.strokeRect(b.x * T + 2, QROW * T + 2, CELL * T - 4, T - 4); g.strokeStyle = "rgba(242,169,59,.22)"; g.strokeRect((b.x + CELL) * T + 2, QROW * T + 2, CELL * T - 4, T - 4); g.fillStyle = "#e8e2d0"; g.font = "800 20px 'Big Shoulders Display', Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String.fromCharCode(65 + b.id), (b.x - 0.5) * T, (QUAY + 0.5) * T); }
  // storage areas: the pad, the RTG's tyre tracks, slot outlines (rows not yet built faint), the spots in the lane
  for (const b of BLOCKS) {
    const [x0, y0, x1, y1] = blockRect(b), ang = blockAng(b);
    g.fillStyle = "#55585e"; g.fillRect(x0 * T, y0 * T, (x1 - x0) * T, (y1 - y0) * T);
    g.fillStyle = "rgba(0,0,0,.14)"; for (const be of [MAX_ROWS + 0.6]) { const a = bpos(b, 0, be), c = bpos(b, 16, be); g.fillRect(Math.min(a[0], c[0]) - 2, Math.min(a[1], c[1]) - 2, Math.abs(c[0] - a[0]) + 4, Math.abs(c[1] - a[1]) + 4); }
    for (let c = 0; c < b.cols; c++) for (let r = 0; r < MAX_ROWS; r++) {
      const [sx, sy] = slotXY(b, c, r); g.save(); g.translate(sx, sy); g.rotate(ang);
      g.strokeStyle = r < b.rows ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.06)"; g.lineWidth = 1; g.strokeRect(-CL * T / 2 + 1.5, -T / 2 + 1.5, CL * T - 3, T - 3); g.restore();
    }
    g.strokeStyle = b.exp ? "rgba(127,200,255,.6)" : "rgba(201,162,58,.55)"; g.lineWidth = 2; g.strokeRect(x0 * T + 1, y0 * T + 1, (x1 - x0) * T - 2, (y1 - y0) * T - 2);
    if (b.exp) { const [lx, ly] = bpos(b, 8, b.rows + 1.2); g.fillStyle = "rgba(127,200,255,.45)"; g.font = "800 16px 'Big Shoulders Display', Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("EXPORT", lx, ly); }
    for (const sp of b.spots) { const ks = sp.tiles.map(unkey), xs = ks.map((q) => q[0]), ys = ks.map((q) => q[1]); g.strokeStyle = b.exp ? "rgba(127,200,255,.35)" : "rgba(201,162,58,.35)"; g.strokeRect(Math.min(...xs) * T + 3, Math.min(...ys) * T + 3, (Math.max(...xs) - Math.min(...xs) + 1) * T - 6, (Math.max(...ys) - Math.min(...ys) + 1) * T - 6); }
  }
  // parking pockets: yellow lines for tractors, white for customers, the far end painted
  for (const pc of POCKETS) for (const p of pc.pockets) {
    const ks = p.path.slice(1, -1).map(unkey), xs = ks.map((q) => q[0]), ys = ks.map((q) => q[1]), x = Math.min(...xs) * T, y = Math.min(...ys) * T, w = (Math.max(...xs) + 1) * T - x, h = (Math.max(...ys) + 1) * T - y;
    g.strokeStyle = pc.kind === "park" ? "rgba(232,180,50,.55)" : "rgba(236,231,220,.4)"; g.lineWidth = 2; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    const [hx, hy] = unkey(p.head); g.fillStyle = pc.kind === "park" ? "rgba(232,180,50,.3)" : "rgba(236,231,220,.22)"; g.fillRect(hx * T + 6, hy * T + 6, T - 12, T - 12);
  }
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
const slotTile = (k) => { const q = shipSlot(k); return [DOCK.x + q.c * CL + 1, DOCK.top + q.r]; };
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
// (art) an RTG: its girder spans the storage rows and the lane beside them, on tyred legs at both ends, and runs along the
// storage area; the trolley rides the girder
function drawRTG(b) {
  const cr = b.rtg, [al] = blocal(b, cr.x, cr.y), A = bpos(b, al, -0.8), B = bpos(b, al, MAX_ROWS + 0.6), h = 1 - (cr.hoist || 0);
  const len = hyp(B[0] - A[0], B[1] - A[1]), va = Math.atan2(B[1] - A[1], B[0] - A[0]);
  ctx.save(); ctx.translate(A[0], A[1]); ctx.rotate(va);
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(8, -8, len, 30);
  ctx.fillStyle = "#1e2024"; for (const lx of [-6, len - 8]) for (const ly of [-20, 12]) ctx.fillRect(lx, ly, 14, 8);
  ctx.fillStyle = "#3a6ab0"; ctx.fillRect(-4, -14, 10, 28); ctx.fillRect(len - 6, -14, 10, 28);
  ctx.fillStyle = "#e8b432"; for (let k = 0; k < 28; k += 8) { ctx.fillRect(-4, -14 + k, 10, 3); ctx.fillRect(len - 6, -14 + k, 10, 3); }
  ctx.fillStyle = "#4a7ac8"; ctx.fillRect(-4, -6, len + 8, 12); ctx.fillStyle = "#2a4a80"; ctx.fillRect(-4, 4, len + 8, 2); ctx.fillStyle = "#6a9ae0"; ctx.fillRect(-4, -6, len + 8, 2);
  ctx.fillStyle = "#2a2c30"; ctx.fillRect(len - 18, -13, 12, 10); ctx.fillStyle = "#9ad0f0"; ctx.fillRect(len - 16, -11, 8, 4);
  ctx.restore();
  // trolley, spreader and what it holds
  const tx = Math.round(cr.x), ty = Math.round(cr.y), ang = blockAng(b);
  if (cr.hold !== null) drawBox(cr.hold, tx, ty, ang, h); else drawSpreader(tx, ty, ang, h * 0.6);
  ctx.fillStyle = "#1e2024"; ctx.fillRect(tx - 9, ty - 9, 18, 18); ctx.fillStyle = "#e8b432"; ctx.fillRect(tx - 9, ty - 9, 18, 2);
}
// locked things: dimmed, with their price
function priceTag(x, y, price) { const ok = money >= price, txt = "$" + price.toLocaleString(); ctx.font = "800 18px 'Big Shoulders Display', Impact, sans-serif"; const w = ctx.measureText(txt).width + 14; ctx.fillStyle = "rgba(10,14,20,.85)"; ctx.fillRect(x - w / 2, y - 12, w, 24); ctx.strokeStyle = ok ? "#7fd88a" : "#6a7080"; ctx.lineWidth = 2; ctx.strokeRect(x - w / 2, y - 12, w, 24); ctx.fillStyle = ok ? "#ece7dc" : "#8b919b"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, x, y + 1); }
function drawLocked() {
  ctx.fillStyle = "rgba(8,12,18,.62)";
  for (const b of BERTHS) if (!b.open) ctx.fillRect((b.x - 1) * T, QUAY * T, (CELL + 2) * T, 2 * T);
  for (const b of BERTHS) if (!b.open) priceTag((b.x + 2) * T, (QUAY + 1) * T, CRANE_PRICE[b.id]);
}
// the money, buying a tractor, and the build buttons (owner, 2026-11-01)
const BUILD = [["road", "Road"], ["storage", "Storage"], ["parking", "Parking"], ["lot", "Lot"], ["export", "Export"], ["bulldoze", "Bulldoze"]];
{ const hudEl = $("hud"); for (const [m, name] of BUILD) { const btn = document.createElement("button"); btn.type = "button"; btn.id = "build-" + m; btn.className = "build"; btn.dataset.name = name; btn.onclick = () => setBuild(buildMode === m ? null : m); hudEl.appendChild(btn); } }
function setBuild(m) { buildMode = m; if (m) selected = null; hudTxt = ""; bp = m && BP_MODES.includes(m) ? bpStart(m) : null; }
let hudTxt = "";
function hud() {
  const p = tractorPrice(false), pa = tractorPrice(true), sp = !!tractorSpot(), txt = "$" + money.toLocaleString() + "|" + p + "|" + sp + "|" + buildMode; if (txt === hudTxt) return; hudTxt = txt;
  $("money").textContent = "$" + money.toLocaleString();
  for (const [id, name, pr] of [["buy-tractor", "Manual", p], ["buy-auto", "Auto", pa]]) { const b = $(id); b.textContent = "+ " + name + " $" + pr.toLocaleString(); b.disabled = !sp || money < pr; }
  for (const [m, name] of BUILD) { const b = $("build-" + m), pr = m === "bulldoze" ? 0 : m === "storage" ? PRICE.storage : PRICE[m]; b.textContent = pr ? name + " $" + pr.toLocaleString() : name; b.classList.toggle("on", buildMode === m); }
}
$("buy-tractor").onclick = () => addTractor(false);
$("buy-auto").onclick = () => addTractor(true);
const tilesRect = (ks) => { const ps = ks.map(unkey), xs = ps.map((q) => q[0]), ys = ps.map((q) => q[1]); const x = Math.min(...xs), y = Math.min(...ys); return [x * T, y * T, (Math.max(...xs) - x + 1) * T, (Math.max(...ys) - y + 1) * T]; };
const cellsRect = (cs) => { const xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]); const x = Math.min(...xs), y = Math.min(...ys); return [x * CELL * T, (Y0 + y * CELL) * T, (Math.max(...xs) - x + 1) * CELL * T, (Math.max(...ys) - y + 1) * CELL * T]; };
function spotRect(a) {
  if (a.kind === "tpark") return tilesRect(a.spot.tiles);
  if (a.kind === "park") return tilesRect(a.stall.tiles);
  if (a.slot !== undefined) return slotRect(a.slot);
  if (a.spot) return tilesRect(a.spot.tiles);
  if (a.kind === "sts") return tilesRect(a.berth.spot.tiles);
  return tilesRect(a.block.spots.flatMap((s) => s.tiles));
}
// where a container is on the map, if anywhere
function boxAt(x) {
  for (const b of BLOCKS) for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) if (b.slots[c][r].includes(x)) return slotXY(b, c, r);
  const s = DOCK.ship; if (s) for (let n = 0; n < s.bays.length; n++) if (s.bays[n].includes(x)) { const q = shipSlot(n); return [(DOCK.x + q.c * CL + 1.5) * T + s.off, (DOCK.top + q.r + 0.5) * T]; }
  for (const t of trucks) if (t.load === x) { const tr = trailerOf(t); return [tr.x, tr.y]; }
  for (const cr of [...BERTHS.map((b) => b.crane), ...BLOCKS.map((b) => b.rtg)]) if (cr.hold === x || cr.hold2 === x) return [cr.x, cr.y];
  return null;
}
const slotFlashRect = (b, c, r) => { const [x, y] = slotXY(b, c, r), along = b.u[0] !== 0, w = along ? CL * T - 4 : T - 8, h = along ? T - 8 : CL * T - 4; return [x - w / 2, y - h / 2, w, h]; };
function draw() {
  if (groundDirty) buildGround();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0b1218"; ctx.fillRect(0, 0, VW, VH);
  ctx.setTransform(DPR * zoom, 0, 0, DPR * zoom, Math.round(DPR * (VW / 2 - cam.x * zoom)), Math.round(DPR * (VH / 2 - cam.y * zoom)));
  drawWater();
  if (DOCK.ship) drawShip();
  drawSmoke();
  ctx.drawImage(GROUND, 0, QUAY * T, MW * T, (MH - QUAY) * T, 0, QUAY * T, MW * T, (MH - QUAY) * T);
  // (perf) each storage area's stacks are drawn once into a cached image, again only when its stacks change
  for (const b of BLOCKS) {
    const [x0, y0, x1, y1] = blockRect(b);
    if (!b.layer) { b.layer = canvas((x1 - x0) * T, (y1 - y0) * T); b.layerSig = ""; }
    if (b.layerVer !== STACK_VER) {
      b.layerVer = STACK_VER; const sig = b.rows + ":" + b.slots.map((col) => col.map((st) => st.map((x) => x.id).join(".")).join("|")).join("/");
      if (sig !== b.layerSig) { b.layerSig = sig; const g = b.layer.getContext("2d"); g.clearRect(0, 0, b.layer.width, b.layer.height); ctx = g; CACHING = true; ctx.translate(-x0 * T, -y0 * T); for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { const [sx, sy] = slotXY(b, c, r); drawStackAt(sx, sy, blockAng(b), b.slots[c][r]); } ctx.setTransform(1, 0, 0, 1, 0, 0); CACHING = false; ctx = mainCtx; }
    }
    ctx.drawImage(b.layer, x0 * T, y0 * T);
  }
  if (selected && selected.kind === "cust" && selected.want) for (const b of BLOCKS) for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) if (b.slots[c][r].includes(selected.want)) flash(...slotFlashRect(b, c, r), posRGB(b.slots[c][r], selected.want));
  // (owner) a selected customer truck: a white dotted line to where its container is
  if (selected && selected.kind === "cust" && selected.load === null) {
    const at = boxAt(selected.want);
    if (at) { const tr = trailerOf(selected); ctx.setLineDash([2, 6]); ctx.lineCap = "round"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tr.x, tr.y); ctx.lineTo(at[0], at[1]); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = "butt"; }
  }
  // a selected auto tractor's RTG
  if (selected && selected.auto && selected.home && BLOCKS.includes(selected.home)) { const [x0, y0, x1, y1] = blockRect(selected.home); ctx.setLineDash([8, 6]); ctx.strokeStyle = "#5fd3d0"; ctx.lineWidth = 3; ctx.strokeRect(x0 * T - 3, y0 * T - 3, (x1 - x0) * T + 6, (y1 - y0) * T + 6); ctx.setLineDash([]); }
  // the selected truck's queue: numbered spots joined in order
  if (!selected) BADGES = [];
  if (selected) {
    const tr = trailerOf(selected); let px = tr.x, py = tr.y, n = 0; ctx.setLineDash([5, 5]); ctx.lineWidth = 2; BADGES = [];
    for (const a of selected.cmd ? [selected.cmd, ...selected.queue] : selected.queue) {
      if (a.kind === "deliver") continue;
      const [rx, ry, rw, rh] = spotRect(a), sx = rx + rw / 2, sy = ry + rh / 2; n++;
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke(); px = sx; py = sy;
      ctx.strokeStyle = "#ffffff"; ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
      const z = badgeSize(), bx = rx - 4 + z / 2, by = ry - 4 + z / 2; BADGES.push({ x: bx, y: by, r: z / 2 + 3 / zoom, a: a === selected.cmd ? null : a });
      ctx.setLineDash([]); ctx.fillStyle = "#1e2024"; ctx.fillRect(rx - 4, ry - 4, z, z); ctx.fillStyle = "#ece7dc"; ctx.font = `800 ${Math.round(z * 0.75)}px 'JetBrains Mono', monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(n), bx, by + 0.5); ctx.setLineDash([5, 5]);
    }
    ctx.setLineDash([]);
  }
  // (perf) only what's on screen
  const vw = VW / 2 / zoom + 6 * T, vh = VH / 2 / zoom + 6 * T, onScreen = (x, y) => Math.abs(x - cam.x) < vw && Math.abs(y - cam.y) < vh;
  for (const t of trucks) { const [i, j] = unkey(t.tiles[0]); if (onScreen((i + 0.5) * T, (j + 0.5) * T)) drawTruck(t); }
  for (const b of BLOCKS) drawRTG(b);
  for (const b of BERTHS) if (b.open) drawSTS(b);
  drawLocked();
  for (const f of floats) { ctx.globalAlpha = Math.min(1, f.t); ctx.fillStyle = "#7fd88a"; ctx.font = "800 18px 'Big Shoulders Display', Impact, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(f.text, f.x, f.y - (1.6 - f.t) * 24); } ctx.globalAlpha = 1;
  // building: what a tap would build under the pointer, green or red, with its price
  ICONS = [];
  if (bp) {
    const p = bpPlan(), f = bpFoot(bp), ok = p && p.ok && money >= p.price, [x, y, w, h] = cellsRect(f.cells);
    ctx.fillStyle = ok ? "rgba(70,140,230,.32)" : "rgba(255,90,74,.25)"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = ok ? "rgba(170,210,255,.35)" : "rgba(255,160,150,.3)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let gx = x + T; gx < x + w; gx += T) { ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); } for (let gy = y + T; gy < y + h; gy += T) { ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); } ctx.stroke();
    ctx.strokeStyle = ok ? "#9cc8ff" : "#ff5a4a"; ctx.lineWidth = 3; ctx.setLineDash([10, 6]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    // the edge that faces the road (the pocket entrances, or where the RTG serves)
    const v = SIDES[bp.side].v; ctx.fillStyle = ok ? "#e8f2ff" : "#ff8a7a";
    if (v[1] === 1) ctx.fillRect(x, y, w, 6); else if (v[1] === -1) ctx.fillRect(x, y + h - 6, w, 6); else if (v[0] === -1) ctx.fillRect(x + w - 6, y, 6, h); else ctx.fillRect(x, y, 6, h);
    if (p && p.price > 0) priceTag(x + w / 2, y + h / 2, p.price);
    // the turn and check-mark buttons, in screen space below it (above it when that's off the screen)
    const r = touchy ? 22 : 17, k = DPR, sx = clamp((x + w / 2 - cam.x) * zoom + VW / 2, 2 * r + 16, VW - 2 * r - 16), top = (y - cam.y) * zoom + VH / 2, bot = (y + h - cam.y) * zoom + VH / 2;
    const iy = clamp(bot + r + 10 + r <= VH ? bot + r + 10 : top - r - 10, r + 8, VH - r - 8);   // kept on the screen
    ICONS = [{ kind: "turn", x: sx - r - 8, y: iy, r }, { kind: "ok", x: sx + r + 8, y: iy, r }];
    ctx.save(); ctx.setTransform(k, 0, 0, k, 0, 0);
    for (const ic of ICONS) {
      ctx.fillStyle = "rgba(10,14,20,.88)"; ctx.beginPath(); ctx.arc(ic.x, ic.y, ic.r, 0, TAU); ctx.fill();
      const col = ic.kind === "ok" ? (ok ? "#7fd88a" : "#6a7080") : "#9cc8ff"; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; const q = ic.r * 0.45;
      if (ic.kind === "ok") { ctx.beginPath(); ctx.moveTo(ic.x - q, ic.y); ctx.lineTo(ic.x - q * 0.25, ic.y + q * 0.75); ctx.lineTo(ic.x + q, ic.y - q * 0.7); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(ic.x, ic.y, q, -Math.PI * 0.15, Math.PI * 1.45); ctx.stroke(); const ax = ic.x + q * Math.cos(-Math.PI * 0.15), ay = ic.y + q * Math.sin(-Math.PI * 0.15); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(ax + 5, ay - 1); ctx.lineTo(ax - 4, ay - 4); ctx.lineTo(ax - 1, ay + 5); ctx.fill(); }
      ctx.lineCap = "butt";
    }
    ctx.restore();
  }
  // roads and bulldozing (and a row for a storage area): what a tap would build under the pointer
  const rowHover = bp && bp.mode === "storage" && hover && hover.cell && (() => { const ex = OCCUPIED.get(ckey(...hover.cell)); return ex && ex.slots && !ex.exp; })();
  if (buildMode && hover && hover.cell && (!bp || rowHover)) {
    const p = planBuild(buildMode, hover.cell[0], hover.cell[1]);
    if (p) { const ok = p.ok && money >= p.price, [x, y, w, h] = cellsRect(p.cells); ctx.fillStyle = ok ? "rgba(127,216,138,.18)" : "rgba(255,90,74,.18)"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = ok ? "#7fd88a" : "#ff5a4a"; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h); if (p.price > 0) priceTag(x + w / 2, y + h / 2, p.price); }
  }
  if (!buildMode && selected && hover && !hover.truck) {
    const [i, j] = hover.tile, g = targetAt(i, j);
    const hb = homeFor(selected, i, j);
    if (hb) { const [x0, y0, x1, y1] = blockRect(hb); ctx.strokeStyle = "#7fd88a"; ctx.lineWidth = 3; ctx.strokeRect(x0 * T, y0 * T, (x1 - x0) * T, (y1 - y0) * T); }
    else if (g) { const a = planFor(selected, i, j) || slotSwap(selected, i, j); ctx.strokeStyle = a ? "#7fd88a" : "#ff5a4a"; ctx.lineWidth = 3; const [rx, ry, rw, rh] = a ? spotRect(a) : g.slot !== undefined ? slotRect(g.slot) : g.kind === "sts" ? tilesRect(g.berth.spot.tiles) : g.kind === "rtg" ? tilesRect(g.block.spots.flatMap((s) => s.tiles)) : tilesRect(g.stall.tiles); ctx.strokeRect(rx, ry, rw, rh); }
  }
  if (bad) { ctx.strokeStyle = `rgba(255,90,74,${bad.t * 2})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bad.i * T + 8, bad.j * T + 8); ctx.lineTo(bad.i * T + T - 8, bad.j * T + T - 8); ctx.moveTo(bad.i * T + T - 8, bad.j * T + 8); ctx.lineTo(bad.i * T + 8, bad.j * T + T - 8); ctx.stroke(); }
}

// ---- the start (owner, 2026-11-01): the quay road; a loop down from it past a 5 x 1 storage area (down the west side,
// along, up the east side, so trucks reach the cranes heading west); a road down to a gate at the bottom; a tractor
// parking of 3 cells (6 spots); one tractor ----
for (let cx = 0; cx < CW; cx++) ROADC.add(ckey(cx, 0));
for (let cy = 1; cy <= 4; cy++) { ROADC.add(ckey(2, cy)); ROADC.add(ckey(15, cy)); }
for (let cx = 3; cx <= 14; cx++) ROADC.add(ckey(cx, 4));
for (let cy = 5; cy < CH; cy++) ROADC.add(ckey(11, cy));
{ const b = makeBlock([7, 4], "S", false, 1); BLOCKS.push(b); for (const c of b.cells) OCCUPIED.set(ckey(...c), b);
  for (let n = 0; n < 6; n++) { const c = Math.floor(rnd() * b.cols); if (b.slots[c][0].length < 3) b.slots[c][0].push(box(randColor())); } }
for (const cy of [1, 2, 3]) { const pc = makePocketCell("park", [2, cy], "W", [1, cy]); POCKETS.push(pc); OCCUPIED.set(ckey(1, cy), pc); }
buildGraph();
{ const p = tractorPockets()[0], t = mkTruck("yard", p.tiles.slice()); t.num = 1; t.park = p; p.claim = t; }

// ---- loop ----
let last = performance.now();
function step(dt) {
  clock += dt;
  const pan = 520 / zoom * dt; if (keys.KeyW || keys.ArrowUp) cam.y -= pan; if (keys.KeyS || keys.ArrowDown) cam.y += pan; if (keys.KeyA || keys.ArrowLeft) cam.x -= pan; if (keys.KeyD || keys.ArrowRight) cam.x += pan;
  cam.x = clamp(cam.x, 0, MW * T); cam.y = clamp(cam.y, 0, MH * T);
  shipStep(dt); syncClaims(); for (const b of BERTHS) if (b.open) stsStep(b, dt);
  freeSpots(); fillSpots(); sortLines(); for (const b of BLOCKS) rtgStep(b, dt);
  for (let k = floats.length - 1; k >= 0; k--) if ((floats[k].t -= dt) <= 0) floats.splice(k, 1);
  hud();
  // (owner) customers come faster the more lot spots there are
  custWait -= dt; if (custWait <= 0) { spawnCustomer(); custWait = (8 + rnd() * 6) / (1 + lotPockets().length / 16) / (0.3 + 4 * unclaimedFill()); }
  expWait -= dt; if (expWait <= 0) { spawnExport(); expWait = 10 + rnd() * 6; }
  claimStep(dt);
  for (const t of [...trucks]) { truckStep(t, dt); if (t.happy > 0) t.happy -= dt; if (t.sad > 0) t.sad -= dt; }
  if (selected && (!trucks.includes(selected) || selected.exiting)) selected = null;
  if (bad) { bad.t -= dt; if (bad.t <= 0) bad = null; }
}
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); draw(); requestAnimationFrame(frame); }
// it starts fitted to the screen; (owner, 2026-11-01) on a touch screen close enough for a fingertip, over where the
// port starts. Later resizes (a phone's address bar sliding away, turning it) keep the view as it is.
let sized = false;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight; cv.width = VW * DPR; cv.height = VH * DPR;
  if (sized) return; sized = true;
  zoom = clamp(Math.min(VW / (MW * T), VH / ((MH + 1) * T)), 0.3, 3); cam.y = (MH * T) / 2;
  if (matchMedia && matchMedia("(pointer: coarse)").matches) { touchy = true; zoom = Math.max(zoom, 0.6); cam.x = 16 * T; cam.y = 18 * T; }
}
addEventListener("resize", resize); resize();
if (document.fonts && document.fonts.load) document.fonts.load("800 20px 'Big Shoulders Display'").then(() => { groundDirty = true; }).catch(() => {});
requestAnimationFrame(frame);
window.Atamus = { addMoney: (n) => (money += n), buyAt: (i, j) => { const u = buyAt(i, j); if (u && money >= u.price) { money -= u.price; u.buy(); return true; } return false; }, addTractor, get money() { return money; }, get passes() { return passes; }, perf: PERF, get state() { return { trucks, dock: DOCK, berths: BERTHS, blocks: BLOCKS, pockets: POCKETS, gates: GATES, delivered, selected, occ }; }, get exported() { return exported; }, step, planFor, enqueue, unqueueLast, badges: () => BADGES, cam, screenOf: (x, y) => ({ x: (x - cam.x) * zoom + VW / 2, y: (y - cam.y) * zoom + VH / 2 }), screenOfTruck: (t) => { const s = trailerOf(t); return { x: (s.x - cam.x) * zoom + VW / 2, y: (s.y - cam.y) * zoom + VH / 2 }; }, slotSwap, doSwap, route, select: (t) => (selected = t), build: doBuild, planBuild, setBuild, isRoad, slotXY, get bp() { return bp; }, icons: () => ICONS, cellsRect };
})();
