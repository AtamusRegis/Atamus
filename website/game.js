// Atamus (owner, 2026-11-05): a single-player cargo station in space. A freighter docks at a time and its loader arms
// unload its hexagonal containers, one at a time, onto haulers hovering under them; haulers fly them to honeycomb storage
// platforms, each with a gantry that stacks them three high; customer ships come for one particular container. You pick
// a hauler and queue where it goes. Ships fly freely (no roads): they climb above the cranes, fly over, settle at the
// hover point they're going to, and steer clear of each other. 1 unit = 1 m. Drawn by game3d.js. Rules in
// docs/FEATURES.md.
"use strict";
(() => {
const $ = (id) => document.getElementById(id);
// (2026-11-01) a page the browser kept from an older build loads the live one instead (the build id is stamped into
// game.html and version.json on deploy)
{ const mine = (document.querySelector('meta[name="build"]') || {}).content;
  if (mine && mine !== "__BUILD__" && window.fetch) fetch("version.json", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j && j.v && j.v !== mine && !location.search.includes("b=" + j.v)) location.replace((location.pathname.split("/").pop() || "game.html") + "?b=" + j.v); }).catch(() => {}); }
const R3 = (window.ATAMUS_3D = window.ATAMUS_3D || {});
const TAU = Math.PI * 2, rnd = Math.random, hyp = Math.hypot, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---- the station, in meters (x east, z south, y up) ----
// (owner, 2026-11-05) containers are pucks 2.4 m across, 0.8 m tall, stacked up to 3; the freighter's deck is a honeycomb
// (rows offset by half a container)
const HR = 1.2, HW = Math.sqrt(3) * HR, RZ = 1.5 * HR, PH = 0.8;
// how high a ship hovers at a spot; how far below it the container it carries is (owner, 2026-11-05: on top, so it shows:
// negative)
const HOVER = 1.6, CARRY = -0.6;
const X0 = -18, MW = 112, MH = 66;   // the area the camera keeps to
const N = Math.PI / 2;   // a ship's heading facing north (yaw: its nose at (cos yaw, -sin yaw) on the x–z plane)
const hexX = (x0, c, r) => x0 + c * HW + (r % 2) * HW / 2;
const COLORS = [
  { name: "Red", c: "#d23c32" }, { name: "Orange", c: "#e8822a" }, { name: "Yellow", c: "#e8c832" }, { name: "Green", c: "#3aa04a" },
  { name: "Blue", c: "#3a7ad0" }, { name: "Purple", c: "#7a4ac8" }, { name: "White", c: "#d8dcdf" },
  { name: "Gray", c: "#80858c" }, { name: "Black", c: "#3a3d43" },
];
// (owner, 2026-11-05) every container has a color and a shape: circle, square or hexagon. A storage slot only takes the
// shape set on it (ANY: the export platform's, which take any).
const SHAPES = ["circle", "square", "hex"], ANY = 3;
const randColor = () => Math.floor(rnd() * COLORS.length), randShape = () => Math.floor(rnd() * SHAPES.length);
let ver = 0;   // goes up whenever the layout changes (the view rebuilds it)

// the freighter's cargo deck: a honeycomb of 14 x 5 stacks; small and medium freighters use the part nearest the station
const DOCK = { x0: 10, z0: 3, cols: 14, rows: 5, ship: null, wait: 1.5 };
const shipSlot = (k) => ({ c: k % DOCK.cols, r: Math.floor(k / DOCK.cols) });
const slotPos = (k) => { const q = shipSlot(k); return { x: hexX(DOCK.x0, q.c, q.r) + (DOCK.ship ? DOCK.ship.off : 0), z: DOCK.z0 + q.r * RZ }; };
// loader arms, placed along the docking spine. (owner, 2026-11-05) each has one loading spot under it; haulers waiting for
// it wait at a free dock station (or, with none free, hover in a stack behind the spot)
const LANE_Z = 16, STACK_STEP = 2.3, LANE_BACK = 3.3, BERTH_GAP = 6;
const SPINE = [DOCK.x0 + 1, DOCK.x0 + (DOCK.cols - 1) * HW];
const BERTHS = []; let berthSeq = 0;
function mkBerth(cx) {
  const b = { id: berthSeq++, cx, promised: 0, open: true, crane: { x: cx, z: 9, hold: null, ops: [], truck: null } };
  b.lanes = [{ kind: "any", x: cx, berth: b, q: [] }];
  BERTHS.push(b); BERTHS.sort((p, q) => p.cx - q.cx); ver++; return b;
}
const laneFor = (b) => b.lanes[0];
const laneSpot = (l, k) => (k === 0 ? { x: l.x, y: HOVER, z: LANE_Z, yaw: N } : { x: l.x, y: HOVER + 2 + k * STACK_STEP, z: LANE_Z + LANE_BACK, yaw: N });
// storage (owner, 2026-11-06): built a unit at a time on a 2.7 m grid, anywhere clear: storage slots (each set to one
// shape: circle, square or hexagon; containers stack 3 high), robot arms (cranes), hauler spots (haulers drop imports
// and take exports there) and truck spots (customers pick up, export ships drop off). A crane reaches REACH from its
// unit and works whatever is in reach; cranes hand containers on to each other through slots both reach.
const UNIT = 2.7, REACH = 10.5, MOUNT = UNIT / 2;
const TILES = new Map(), SLOTS = [], CRANES = [], SPOTS = [];
const tileKey = (i, j) => i + "," + j;
let tileSeq = 0;
function mkTile(kind, i, j, shape) {
  const t = { id: tileSeq++, kind, i, j, x: i * UNIT, z: j * UNIT };
  if (kind === "slot") { t.shape = shape; t.stack = []; SLOTS.push(t); }
  else if (kind === "crane") { t.mount = { x: t.x, z: t.z }; t.cr = { x: t.x, z: t.z - 2, hold: null, ops: [], truck: null, res: null }; t.cid = CRANES.length; CRANES.push(t); }
  else { t.claim = null; t.line = []; SPOTS.push(t); }   // "hspot" or "tspot"
  TILES.set(tileKey(i, j), t); ver++; return t;
}
const reaches = (c, p) => hyp(p.x - c.mount.x, p.z - c.mount.z) <= REACH;
// the network: which cranes reach each slot and spot; two units are linked when one crane reaches both. Cached until the
// layout changes.
let netV = -1, NET = null;
function net() {
  if (netV === ver) return NET;
  const by = new Map();
  for (const t of SLOTS.concat(SPOTS)) by.set(t, CRANES.filter((c) => reaches(c, t)));
  NET = { by, from: new Map(), link: (u, v) => { const a = by.get(u), b = by.get(v); return !!a && !!b && a.some((c) => b.includes(c)); } };
  netV = ver; return NET;
}
// the slots of shape s a container could be carried from to spot p (crane to crane, through slots of its shape)
function fromSpot(p, s) {
  const N = net(), key = p.id + ":" + s; if (N.from.has(key)) return N.from.get(key);
  const seen = new Set([p]), q = [p];
  while (q.length) { const u = q.shift(); for (const v of SLOTS) if (v.shape === s && !seen.has(v) && N.link(u, v)) { seen.add(v); q.push(v); } }
  N.from.set(key, seen); return seen;
}
const tspots = () => SPOTS.filter((p) => p.kind === "tspot"), hspots = () => SPOTS.filter((p) => p.kind === "hspot");
const slotOf = (x) => SLOTS.find((v) => v.stack.includes(x)) || null;
// (owner, 2026-11-06) can a container stored here be handed out to a customer (or, an export, to a hauler)?
const canOut = (v, x) => (x.exp ? hspots() : tspots()).some((p) => fromSpot(p, x.s).has(v));
// the shortest chain of crane moves for a container of shape s from unit a to unit goal, through slots of its shape with
// room that no other crane is working: [a, ..., goal], or null
function route(a, goal, s, taken) {
  const N = net(), prev = new Map([[a, null]]), q = [a];
  while (q.length && !prev.has(goal)) {
    const u = q.shift();
    if (N.link(u, goal)) { prev.set(goal, u); break; }
    for (const v of SLOTS) if (!prev.has(v) && v.shape === s && v.stack.length < 3 && !(taken && taken(v)) && N.link(u, v)) { prev.set(v, u); q.push(v); }
  }
  if (!prev.has(goal)) return null;
  const out = []; for (let v = goal; v; v = prev.get(v)) out.unshift(v); return out;
}
// room for a container of shape s that a ship at spot p could hand over (slots of its shape a crane there reaches),
// keeping the last two spaces free so a crane can always dig a container out
const RESERVE = 2;
const dropRoom = (p, s) => { const N = net(); let n = 0; for (const v of SLOTS) if (v.shape === s && v.stack.length < 3 && N.link(p, v)) n += 3 - v.stack.length; return Math.max(0, n - RESERVE); };
const anyRoom = (p) => SHAPES.reduce((n, _, s) => n + dropRoom(p, s), 0);
const isPickup = (t, a) => t.kind === "cust" || !!(a && a.pickup);
// dock stations: each hauler has its own (a new one appears on it); idle haulers park at the nearest free one, and
// haulers waiting for a loader arm or a spot wait at one
const PARK = [];
const mkStation = (x, z) => { const p = { x, z, claim: null, built: true, own: null }; PARK.push(p); ver++; return p; };
// customer pads, placed in groups of 4
const STALLS = []; let padSeq = 0;
function mkPads(cx, cz) { const g = padSeq++; for (let i = 0; i < 4; i++) STALLS.push({ x: cx + (i % 2 ? 1.9 : -1.9), z: cz + (i < 2 ? -1.9 : 1.9), claim: null, group: g, open: true }); ver++; }
const padSpot = (p) => ({ x: p.x, y: HOVER, z: p.z, yaw: N });
// ships come in from deep space to the south and leave the same way
const spawnPoint = () => ({ x: 20 + rnd() * 70, y: 16, z: MH + 50 });
const exitPoint = () => ({ x: -30 + rnd() * 30, y: 16, z: MH + 55 });

// ---- progress (owner, 2026-11-06): start with 1 hauler and its dock station, 1 loader arm, 9 storage slots (rows of
// circles, squares, hexagons), 1 crane, 1 hauler spot, 1 truck spot, 4 customer pads and $500; customers pay for their
// container; the rest is built
let money = 500;
const INCOME = 60;
// (owner, 2026-11-05) every price at 10% for easier testing: set PRICE_SCALE back to 1 for the real prices
const PRICE_SCALE = 0.1, priced = (n) => Math.round(n * PRICE_SCALE);
const expo = (base, k, n) => priced(base * Math.pow(k, Math.max(0, n)));
const PRICES = {
  slot: () => expo(80, 1.02, SLOTS.length - 9), crane: () => expo(1200, 1.6, CRANES.length - 1),
  hspot: () => expo(200, 1.5, hspots().length - 1), tspot: () => expo(200, 1.5, tspots().length - 1),
  pads: () => expo(200, 1.4, padSeq - 1), station: () => expo(250, 1.15, PARK.length - 1) + (ghost && ghost.kind === "station" && ghost.hauler ? tractorPrice(ghost.hauler === "auto") : 0),
  berth: () => expo(2000, 1.75, BERTHS.length - 1),
};
const SHAPE_FEE = priced(50);
const tractorPrice = (auto) => priced((400 + 50 * (crafts.filter((t) => t.kind === "yard").length - 1)) * (auto ? 4 : 1));   // (owner) +$50 each; auto ones 4x
// which deck columns an arm works: each column goes to the nearest arm
const colX = (c) => DOCK.x0 + c * HW + HW / 4;
const colOwner = (c) => BERTHS.reduce((m, b) => (!m || Math.abs(colX(c) - b.cx) < Math.abs(colX(c) - m.cx) ? b : m), null);
const craneCols = (b) => { let c0 = -1, c1 = -1; for (let c = 0; c < DOCK.cols; c++) if (colOwner(c) === b) { if (c0 < 0) c0 = c; c1 = c + 1; } return c0 < 0 ? [0, 0] : [c0, c1]; };

// ---- building (owner, 2026-11-05): a blueprint you move about the map, red where it can't go, then buy (✓) or drop (✗).
// Units, pad groups and dock stations go anywhere clear (not over the freighter's berth or the loading deck); loader arms
// slide along the spine. (owner, 2026-11-06) A storage slot blueprint is tapped to turn its shape, and after one's bought
// the next one is ready beside it.
const AREA = [X0 + 1, MW - 1, 2, MH];
const LOADING = [DOCK.x0 - 6, DOCK.x0 + DOCK.cols * HW + 6, -30, LANE_Z + 4.5];
const overlaps = (a, b, gap = 0.6) => a[0] < b[1] + gap && b[0] < a[1] + gap && a[2] < b[3] + gap && b[2] < a[3] + gap;
const inside = (a, r) => a[0] >= r[0] && a[1] <= r[1] && a[2] >= r[2] && a[3] <= r[3];
const padsRect = (x, z) => [x - 3.8, x + 3.8, z - 3.8, z + 3.8];
const stationRect = (x, z) => [x - 1.7, x + 1.7, z - 1.7, z + 1.7];
const tileRect = (x, z) => [x - UNIT / 2, x + UNIT / 2, z - UNIT / 2, z + UNIT / 2];
const TILE_KINDS = new Set(["slot", "crane", "hspot", "tspot"]);
function others() {
  const out = [];
  for (let g = 0; g < padSeq; g++) { const s = STALLS.filter((q) => q.group === g); out.push(padsRect((s[0].x + s[1].x) / 2, (s[0].z + s[2].z) / 2)); }
  for (const p of PARK) out.push(stationRect(p.x, p.z));
  return out;
}
const clearAt = (r) => inside(r, AREA) && !overlaps(r, LOADING, 0) && others().every((o) => !overlaps(r, o)) && [...TILES.values()].every((t) => !overlaps(r, tileRect(t.x, t.z)));
let ghost = null;
function ghostRect(g) {
  if (TILE_KINDS.has(g.kind)) return tileRect(g.x, g.z);
  if (g.kind === "pads") return padsRect(g.x, g.z);
  if (g.kind === "station") return stationRect(g.x, g.z);
  return [g.x - 2.5, g.x + 2.5, 11.6, LANE_Z + 2];   // a loader arm
}
function ghostOk(g) {
  if (g.kind === "berth") return BERTHS.every((b) => Math.abs(b.cx - g.x) >= BERTH_GAP);
  if (TILE_KINDS.has(g.kind)) { const r = tileRect(g.x, g.z); return !TILES.has(tileKey(g.i, g.j)) && inside(r, AREA) && !overlaps(r, LOADING, 0) && others().every((o) => !overlaps(r, o)); }
  return clearAt(ghostRect(g));
}
const ghostPrice = (g) => PRICES[g.kind]();
function ghostMove(x, z) {
  const g = ghost; if (!g) return;
  if (g.kind === "berth") { g.x = clamp(Math.round(x * 2) / 2, SPINE[0], SPINE[1]); g.z = LANE_Z; return; }
  if (TILE_KINDS.has(g.kind)) { g.i = Math.round(x / UNIT); g.j = Math.round(z / UNIT); g.x = g.i * UNIT; g.z = g.j * UNIT; return; }
  g.x = Math.round(x * 2) / 2; g.z = Math.round(z * 2) / 2;
}
// a new blueprint starts in the middle of the view, or the nearest clear place to it
function startGhost(kind, at, extra, noFocus) {
  selected = null;
  const c = at || (R3.center ? R3.center() : { x: 20, z: 40 });
  ghost = Object.assign({ kind, x: c.x, z: c.z }, kind === "slot" ? { shape: 0 } : null, extra); ghostMove(c.x, c.z);
  let found = ghostOk(ghost);
  for (let r = 1; r < 70 && !found; r += 1) for (let k = 0; k < 16 && !found; k++) { ghostMove(c.x + r * Math.cos(k / 16 * TAU), c.z + r * Math.sin(k / 16 * TAU)); found = ghostOk(ghost); }
  if (!found) ghostMove(c.x, c.z);
  if (R3.focus && !noFocus) R3.focus(ghost.x, ghost.z);   // the view glides over to it
}
function ghostCancel() { ghost = null; }
function ghostConfirm() {
  const g = ghost; if (!g) return false;
  const p = ghostPrice(g); if (!ghostOk(g) || money < p) { bad = { p: [g.x, 0, g.z], t: 0.5 }; return false; }
  money -= p - (g.hauler ? tractorPrice(g.hauler === "auto") : 0);   // the hauler's part is paid as it's added
  ghost = null;
  if (TILE_KINDS.has(g.kind)) mkTile(g.kind, g.i, g.j, g.shape);
  else if (g.kind === "pads") mkPads(g.x, g.z);
  else if (g.kind === "station") { const s = mkStation(g.x, g.z); if (g.hauler) addTractor(g.hauler === "auto", s); }
  else if (g.kind === "berth") mkBerth(g.x);
  if (g.kind === "slot") {   // the next one, beside it (east, south, west, north)
    for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const n = { kind: "slot", shape: g.shape, i: g.i + di, j: g.j + dj, x: (g.i + di) * UNIT, z: (g.j + dj) * UNIT }; if (ghostOk(n)) { ghost = n; break; } }
    if (!ghost) startGhost("slot", { x: g.x, z: g.z }, { shape: g.shape }, true);
  }
  return true;
}
// tapping a slot blueprint turns its shape
const ghostTurn = () => { if (ghost && ghost.kind === "slot") ghost.shape = (ghost.shape + 1) % SHAPES.length; };
// (owner, 2026-11-05) an empty storage slot's shape can be changed for a small fee: tap it (nothing selected)
function turnShape(v, at) {
  if (v.stack.length || CRANES.some((c) => c.cr.res && c.cr.res.has(v)) || money < SHAPE_FEE) { bad = { p: at, t: 0.5 }; return false; }
  money -= SHAPE_FEE; v.shape = (v.shape + 1) % SHAPES.length; ver++; return true;
}
// (owner, 2026-11-01) two kinds of hauler: manual (you send it: a freighter container, then a hauler spot) and auto (you
// assign it a hauler spot and it shuttles by itself). (owner, 2026-11-06) a hauler is only bought with its own dock
// station: + Manual and + Auto put a dock station blueprint out, and buying it brings the hauler on it.
function addTractor(auto, at) {
  const price = tractorPrice(auto), p = at || PARK.find((q) => !q.own); if (money < price || !p || p.own) return false;
  money -= price; const t = mkCraft("yard", { x: p.x, y: HOVER, z: p.z }); t.num = crafts.filter((q) => q.kind === "yard").length; t.auto = !!auto;
  p.own = t; if (!p.claim) { t.park = p; p.claim = t; }
  return true;
}
const AUTO_CAB = "#5fd3d0", EXP_CAB = "#8a94a6", WAIT_CAB = "#5a6068", MANUAL_CAB = "#e8b432";
const floats = [];   // "+$60" over a paid ship

// ---- containers ----
// (owner) every container is its own: { id, c (color), s (shape), wantedBy (the customer, or hauler, that came for it) }
let boxSeq = 0;
const box = (c, s) => ({ id: ++boxSeq, c, s, wantedBy: null });
const impCount = (st) => (st.length && !st[0].exp ? st.length : 0);   // a deck stack holds imports or exports, never both
const shipCount = (s) => s.bays.reduce((a, st) => a + impCount(st), 0);
const capacity = () => SLOTS.length * 3;

// the start: a loader arm; 9 slots (rows of circles, squares, hexagons), a crane east of them, a hauler spot north, a
// truck spot south; pads; a dock station
mkBerth(DOCK.x0 + 3 * HW);
for (let i = 3; i <= 5; i++) for (let j = 12; j <= 14; j++) mkTile("slot", i, j, j - 12);
mkTile("crane", 6, 13); mkTile("hspot", 4, 11); mkTile("tspot", 4, 15);
for (let n = 0; n < 8 + Math.floor(rnd() * 4); n++) { const v = pick(SLOTS); if (v.stack.length < 3) v.stack.push(box(randColor(), v.shape)); }
mkPads(10, 51); mkStation(-8, 16);

// ---- the freighter ----
const HULLS = ["#5a6a7a", "#7a3a3a", "#3a5a4a", "#4a4a6a", "#6a5a3a"];
// (owner, 2026-11-01) small, medium and large: deck columns from the west end x rows nearest the station; each has until
// its timer runs out (counting once docked) to be unloaded, then leaves with whatever is left
const SIZES = [{ name: "small", cols: 6, rows: 3, w: 0.35 }, { name: "medium", cols: 10, rows: 4, w: 0.4 }, { name: "large", cols: 14, rows: 5, w: 0.25 }];
const onDeck = (s, k) => { const q = shipSlot(k); return q.c < s.cols && q.r >= DOCK.rows - s.rows; };
const SHIP_TIME_BASE = 90, SHIP_TIME_PER = 8;
function newShip() {
  let u = rnd(), z = SIZES[0]; for (const q of SIZES) { if (u < q.w) { z = q; break; } u -= q.w; }
  const s = { off: -110, state: "arrive", size: z.name, cols: z.cols, rows: z.rows, hull: pick(HULLS), bays: Array.from({ length: DOCK.cols * DOCK.rows }, () => []), claims: Array(DOCK.cols * DOCK.rows).fill(0) };
  s.bays.forEach((st, k) => { if (!onDeck(s, k)) return; const n = Math.floor(rnd() * 4), sh = randShape(); for (let q = 0; q < n; q++) st.push(box(randColor(), sh)); });   // (owner, 2026-11-06) one shape per stack
  s.time = SHIP_TIME_BASE + SHIP_TIME_PER * shipCount(s);
  DOCK.ship = s; return s;
}
// (owner) time's up: no new pickups, but the ones already given are finished; then it leaves. Any arm trips left are
// called off (with the platform trips that would have nothing to deliver), and customers waiting for a container still
// aboard leave without it.
function shipGone(s) {
  for (const t of crafts) {
    if (t.kind === "yard") {
      if (t.cmd && t.cmd.kind === "sts" && !t.locked) { claim(t, t.cmd, -1); leaveLines(t); t.cmd = null; }
      let l = t.load ? (t.load.exp ? "exp" : "imp") : null; if (t.cmd && t.cmd.kind === "rtg") l = t.cmd.pickup ? "exp" : null;
      t.queue = t.queue.filter((a) => {
        let keep = true;
        if (a.kind === "sts") keep = false;
        else if (a.kind === "deliver") { if (l === "imp") l = null; }
        else if (a.kind === "rtg") { if (a.pickup) { keep = l === null; if (keep) l = "exp"; } else { keep = l === "imp"; if (keep) l = null; } }
        if (!keep) claim(t, a, -1);
        return keep;
      });
    } else if (!t.exiting && t.load === null && s.bays.some((st) => st.includes(t.want))) { t.sad = 2.5; leave(t); }
  }
  BERTHS.forEach((b) => { b.promised = 0; });
}
// (owner, 2026-11-01) when time runs out, each hauler only finishes its next arm trip; any after that (and export
// pickups) are called off, keeping the drop-offs for what it will actually be carrying
function closeQueues() {
  for (const t of crafts) {
    if (t.kind !== "yard") continue;
    let l = t.load ? (t.load.exp ? "exp" : "imp") : null;
    if (t.cmd) l = t.cmd.kind === "sts" ? (t.cmd.pick === false ? null : "imp") : t.cmd.kind === "rtg" ? (t.cmd.pickup ? "exp" : null) : l;
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
const berthLeft = (b) => { const s = DOCK.ship; if (!s || s.state !== "docked" || !b.open) return 0; const [c0, c1] = craneCols(b); let n = 0; s.bays.forEach((st, k) => { const c = k % DOCK.cols; if (c >= c0 && c < c1) n += impCount(st); }); return n - b.promised; };
const shipTakesExports = () => BERTHS.some((b) => exportRoom(b) > 0);
const expPromised = (b) => trips((a) => a.kind === "sts" && a.exp && a.berth === b);
const exportRoom = (b) => { const s = DOCK.ship; if (!s || s.state !== "docked" || !b.open) return 0; const [c0, c1] = craneCols(b); let n = 0; s.bays.forEach((st, k) => { const c = k % DOCK.cols; if (c >= c0 && c < c1 && onDeck(s, k) && !impCount(st)) n += 3 - st.length; }); return n - expPromised(b); };
// (owner, 2026-11-05) haulers in an arm's line don't wait on containers that aren't there: when an arm has more pickups
// promised than imports left in its columns (the freighter's emptied, or an arm bought since took some columns), the
// trips furthest back are called off: queued ones first, then the back of its lines. One bringing an export still
// delivers it (it just takes nothing back). Auto haulers then go to an arm with containers left; manual ones carry on
// with their queue or park.
function trimPromises() {
  const s = DOCK.ship; if (!s || s.state !== "docked") return;
  for (const b of BERTHS) {
    if (!b.open) continue;
    const [c0, c1] = craneCols(b); let avail = b.crane.hold && !b.crane.hold.exp ? 1 : 0;
    s.bays.forEach((st, k) => { const c = k % DOCK.cols; if (c >= c0 && c < c1) avail += impCount(st); });
    let excess = b.promised - avail; if (excess <= 0) continue;
    const drop = (t, a) => {
      if (a.exp) { claim(t, a, -1); a.pick = false; return; }   // keeps its export trip, takes nothing back
      if (a === t.cmd) { claim(t, a, -1); leaveLines(t); t.cmd = null; } else unqueue(t, a);
    };
    for (const t of crafts) for (let i = t.queue.length - 1; i >= 0 && excess > 0; i--) { const a = t.queue[i]; if (a.kind === "sts" && a.berth === b && a.pick !== false) { drop(t, a); excess--; } }
    for (const l of b.lanes) for (let i = l.q.length - 1; i >= 0 && excess > 0; i--) { const t = l.q[i], a = t.cmd; if (!t.locked && a && a.kind === "sts" && a.berth === b && a.pick !== false && b.crane.truck !== t) { drop(t, a); excess--; } }
  }
}
function shipStep(dt) {
  const s = DOCK.ship; if (!s) { DOCK.wait -= dt; if (DOCK.wait <= 0) newShip(); return; }
  if (s.state === "arrive") { s.off += Math.max(1.6, -s.off * 1.2) * dt; if (s.off >= 0) { s.off = 0; s.state = "docked"; } }
  else if (s.state === "docked") { s.time -= dt; if (!shipCount(s) && BERTHS.every((b) => !b.promised && !expPromised(b) && b.crane.hold === null)) { s.idle = (s.idle || 0) + dt; if (s.idle > 1.5) s.state = "depart"; } else if (s.time <= 0) { s.state = "closing"; closeQueues(); } }
  else if (s.state === "closing") { if (BERTHS.every((b) => !b.crane.ops.length && b.crane.hold === null && !b.crane.truck && (!b.promised || !b.open || !inReach(s, b)))) { shipGone(s); s.state = "depart"; } }
  else if (s.state === "depart") { s.off += (1.6 + s.off * 0.8) * dt; if (s.off > 130) { DOCK.ship = null; DOCK.wait = 5 + rnd() * 5; } }
}

// ---- ships: haulers ("yard"), customers ("cust") and export ships ("exp") ----
let crafts = [], craftSeq = 0, custWait = 2, expWait = 6, delivered = 0, exported = 0, clock = 0;
function mkCraft(kind, p, want) { const t = { id: ++craftSeq, kind, x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, yaw: N, queue: [], cmd: null, load: null, want, locked: false, stall: null, park: null, lane: null, gone: false }; crafts.push(t); return t; }
{ const p = PARK[0], t = mkCraft("yard", { x: p.x, y: HOVER, z: p.z }); t.num = 1; t.park = p; p.claim = t; p.own = t; }
function leave(t) {
  if (t.stall && t.stall.claim === t) t.stall.claim = null; if (t.cmd && t.cmd.kind === "park") t.cmd.stall.claim = null;
  for (const a of t.queue) claim(t, a, -1);
  leaveLines(t); t.stall = null; t.cmd = null; t.queue = []; t.exiting = exitPoint();
}
// (owner, 2026-11-05) every customer comes for one particular container (its color and shape), on the docked freighter
// or in storage where it can be handed out, that nobody else is waiting for. One whose container is stored, with a truck
// spot free it can be brought to, flies straight there; any other waits on a pad.
// (owner) dynamic: the fuller storage is with containers nobody has claimed, the more customers come
const unclaimedFill = () => { const n = capacity(); return n ? storedFree().length / n : 0; };
const storedFree = () => { const out = []; for (const v of SLOTS) for (const x of v.stack) if (!x.exp && !x.wantedBy && canOut(v, x)) out.push(x); return out; };
const shipFree = () => { const out = [], s = DOCK.ship; if (s && s.state === "docked") for (const st of s.bays) for (const x of st) if (!x.exp && !x.wantedBy) out.push(x); return out; };
// a truck spot free for a customer, its container able to be brought there
const custSpot = (t, want) => { const v = slotOf(want); return v ? tspots().find((p) => spotFree(p, t) && fromSpot(p, want.s).has(v)) : null; };
function spawnCustomer() {
  const pool = shipFree().concat(storedFree()); if (!pool.length) return;
  const want = pick(pool), p = custSpot(null, want);
  if (p) { const t = mkCraft("cust", spawnPoint(), want); want.wantedBy = t; p.claim = t; startCmd(t, { kind: "rtg", spot: p, bay: p }); return; }
  const stall = STALLS.slice().reverse().find((q) => q.open && !q.claim); if (!stall) return;
  const t = mkCraft("cust", spawnPoint(), want); want.wantedBy = t;
  stall.claim = t; t.cmd = { kind: "park", stall };
}
// what a hauler will carry once its queue is done: null, "imp" or "exp"
function loadAfter(t) { let l = t.load ? (t.load.exp ? "exp" : "imp") : null; for (const a of t.cmd ? [t.cmd, ...t.queue] : t.queue) l = a.kind === "deliver" ? null : a.kind === "sts" ? (a.pick === false ? null : "imp") : a.kind === "rtg" ? (t.kind === "cust" ? "imp" : a.pickup ? "exp" : null) : l; return l; }
// (owner) export ships bring a container to a truck spot (one free with room for its shape in reach), drop it and leave;
// (owner, 2026-11-06) while there's a hauler spot to take exports out from, and exports fill under an eighth of storage
const exportsStored = () => SLOTS.reduce((n, v) => n + v.stack.filter((x) => x.exp).length, 0);
function spawnExport() {
  if (!hspots().length || exportsStored() + crafts.filter((t) => t.kind === "exp" && t.load).length >= Math.max(2, capacity() / 8)) return;
  const x = box(randColor(), randShape()); x.exp = true;
  const p = tspots().find((q) => spotFree(q, null) && dropRoom(q, x.s) > 0); if (!p) return;
  const t = mkCraft("exp", spawnPoint(), null); t.load = x;
  p.claim = t; startCmd(t, { kind: "rtg", spot: p, bay: p });
}
// exports a hauler at spot p could be handed (not already someone's)
const exportsAt = (p) => { let n = 0; for (const v of SLOTS) for (const x of v.stack) if (x.exp && !x.wantedBy && fromSpot(p, x.s).has(v)) n++; return n; };
const trips = (f) => crafts.reduce((n, t) => n + (t.cmd && f(t.cmd) ? 1 : 0) + t.queue.filter(f).length, 0);
const pickupTrips = (p) => trips((a) => a.kind === "rtg" && a.pickup && a.spot === p && !a.want);
// the export a hauler at spot p takes: the nearest by crane moves
function chooseExport(t, a) {
  let best = null, bl = 1e9;
  for (const v of SLOTS) for (const x of v.stack) if (x.exp && !x.wantedBy && fromSpot(a.spot, x.s).has(v)) { const r = route(v, a.spot, x.s), l = (r ? r.length : 20) * 10 + (v.stack.length - 1 - v.stack.indexOf(x)); if (l < bl) { bl = l; best = x; } }
  if (best) { best.wantedBy = t; a.want = best; }
  return best;
}
// what tapping something sends a ship to: a freighter slot (which stack its arm takes from), an arm (any), a hauler or
// truck spot, a customer pad
function targetOf(pk) {
  if (!pk) return null;
  if (pk.slot !== undefined) { const s = DOCK.ship; if (!s || s.state !== "docked" || !onDeck(s, pk.slot)) return null; const c = pk.slot % DOCK.cols, b = BERTHS.find((q) => q.open && c >= craneCols(q)[0] && c < craneCols(q)[1]); return b ? { kind: "sts", berth: b, slot: pk.slot } : null; }
  if (pk.berth) return pk.berth.open ? { kind: "sts", berth: pk.berth } : null;
  if (pk.tile && (pk.tile.kind === "hspot" || pk.tile.kind === "tspot")) return { kind: "rtg", spot: pk.tile };
  if (pk.stall) return pk.stall.open ? { kind: "park", stall: pk.stall } : null;
  return null;
}
// (owner) a ship can only be sent where it can be served: an empty hauler to an arm with a freighter to unload (or to a
// slot with a container not yet claimed), a loaded one to a hauler spot with room for its shape in reach, an empty one
// to a hauler spot with exports to take, a customer to a free truck spot its container can be brought to, or (customers
// only) a free pad. Queued trips count first.
function planFor(t, g) {
  if (!g || t.gone || t.exiting) return null;
  let la = loadAfter(t); const loaded = la !== null, acts = t.cmd ? [t.cmd, ...t.queue] : t.queue;
  if (t.kind === "cust" && acts.some((a) => a.kind === "rtg")) return null;
  if (g.kind === "park") return t.kind === "cust" && !g.stall.claim ? { kind: "park", stall: g.stall } : null;
  // (owner) a hauler can be given pickups one after another: if it would be carrying an import, a drop-off step goes in
  // first
  let first = false;
  if (t.kind === "yard" && la === "imp" && g.kind === "sts") { first = true; la = null; }
  const pre = (a) => { if (a && first) a.deliverFirst = true; return a; };
  if (g.kind === "sts") {
    const b = g.berth; if (t.kind !== "yard" || la === "imp") return null;
    const slotOk = g.slot !== undefined && impCount(DOCK.ship.bays[g.slot]) - DOCK.ship.claims[g.slot] > 0;
    if (la === "exp") { if (exportRoom(b) <= 0) return null; const a = { kind: "sts", berth: b, exp: true, pick: berthLeft(b) > 0 }; if (slotOk && a.pick) a.slot = g.slot; return a; }
    if (berthLeft(b) <= 0) return null; if (g.slot === undefined) return pre({ kind: "sts", berth: b }); return slotOk ? pre({ kind: "sts", berth: b, slot: g.slot }) : null;
  }
  const p = g.spot;
  if (t.kind === "cust") return p.kind === "tspot" && !loaded && slotOf(t.want) && fromSpot(p, t.want.s).has(slotOf(t.want)) && spotFree(p, t) ? { kind: "rtg", spot: p, bay: p } : null;
  if (t.kind !== "yard" || p.kind !== "hspot") return null;
  // (owner, 2026-11-05) a loaded hauler only to a spot with a free slot of its container's shape in reach
  if (la === "imp") { const known = t.load && !t.load.exp && !acts.some((q) => q.kind === "sts"); return (known ? dropRoom(p, t.load.s) : anyRoom(p)) > 0 ? { kind: "rtg", spot: p } : null; }
  if (la === null) return exportsAt(p) - pickupTrips(p) > 0 && shipTakesExports() ? { kind: "rtg", spot: p, pickup: true } : null;
  return null;
}
// (owner, 2026-11-01) a pickup sent to a freighter slot claims a particular container (the top one nobody has claimed),
// not the slot: if an arm moves it while sorting, the trip follows it. TAKEN marks one an arm has started a job on.
const TAKEN = { taken: true };
function syncClaims() {
  const s = DOCK.ship; if (!s) return;
  s.claims.fill(0);
  s.bays.forEach((st, k) => { for (const x of st) if (x.claimedBy) { s.claims[k]++; if (x.claimedBy !== TAKEN) x.claimedBy.slot = k; } });
}
const pickable = (st) => { const x = st[st.length - 1]; return !!x && !x.exp && !x.claimedBy; };
function claim(t, a, d) {
  if (a.kind === "sts") {
    if (a.pick !== false) a.berth.promised += d;
    if (d > 0 && a.slot !== undefined && DOCK.ship) { const x = DOCK.ship.bays[a.slot].slice().reverse().find((q) => !q.exp && !q.claimedBy); if (x) { a.box = x; x.claimedBy = a; } }
    if (d < 0 && a.box) { if (a.box.claimedBy === a) a.box.claimedBy = null; delete a.box; }
    syncClaims();
  }
  else if (a.kind === "park") a.stall.claim = d > 0 ? t : null;
  else if (a.kind === "rtg" && a.bay && t.kind !== "yard") a.bay.claim = d > 0 ? t : null;
}
function enqueue(t, a) { if (a.deliverFirst) { delete a.deliverFirst; t.queue.push({ kind: "deliver" }); } claim(t, a, 1); t.queue.push(a); }
function unqueueLast(t) { const a = t.queue.pop(); if (a) claim(t, a, -1); if (t.queue.length && t.queue[t.queue.length - 1].kind === "deliver") t.queue.pop(); return !!a; }
// a spot is free when nobody has it, nobody's waiting for it and no other ship is hovering in it
const bayBusy = (p, t) => crafts.some((q) => q !== t && !q.gone && q.y < 5 && hyp(q.x - p.x, q.z - p.z) < 2);
const spotFree = (p, t) => !p.claim && !bayBusy(p, t) && !p.line.some((q) => q !== t);
// whether a crane there can serve this ship now: room for what it brings, or something for it to take
function spotOk(p, t) {
  if (t.kind === "cust") return !!slotOf(t.want) && fromSpot(p, t.want.s).has(slotOf(t.want));
  if (t.load) return dropRoom(p, t.load.s) > 0;
  return !!(t.cmd && t.cmd.want) || exportsAt(p) > 0;
}
function freeBays() {
  for (const p of SPOTS) {
    const t = p.claim; if (!t) continue;
    const going = !t.gone && ((t.cmd && t.cmd.bay === p) || t.queue.some((a) => a.bay === p));
    if (!going && (t.gone || hyp(t.x - p.x, t.z - p.z) > 3 || t.y > 5)) p.claim = null;
  }
}
// (owner) a ship heading for a spot that's taken waits its turn, first come first served (a hauler at a free dock station)
function fillBays() {
  for (const p of SPOTS) {
    p.line = p.line.filter((t) => !t.gone && t.cmd && t.cmd.kind === "rtg" && t.cmd.spot === p && !t.cmd.bay);
    p.line.forEach((t, k) => {
      const a = t.cmd;
      if (k === 0 && !p.claim && !bayBusy(p, t) && spotOk(p, t)) { unwait(a); p.line.shift(); p.claim = t; a.bay = p; if (a.pickup && !a.want) chooseExport(t, a); return; }
      if (!a.waitPad && t.kind === "yard") { const w = nearPad(t); if (w) { w.claim = t; a.waitPad = w; } }
    });
  }
}
const nearPad = (t) => PARK.filter((q) => !q.claim).reduce((m, q) => (!m || hyp(q.x - t.x, q.z - t.z) < hyp(m.x - t.x, m.z - t.z) ? q : m), null);
// (owner, 2026-11-05) a loader arm has one loading spot: the hauler at the front of its line hovers there, the others
// wait at a free dock station (or stack up in the air behind the spot)
function fillLanes() {
  for (const b of BERTHS) for (const l of b.lanes) {
    l.q = l.q.filter((t) => !t.gone && t.lane === l);
    l.q.forEach((t, k) => {
      const a = t.cmd; if (!a || t.locked) return;
      if (k === 0) { if (a.waitPad) { a.waitPad.claim = null; a.waitPad = null; } return; }
      if (!a.waitPad) { const p = nearPad(t); if (p) { p.claim = t; a.waitPad = p; } }
    });
  }
}
function unwait(a) { if (!a) return; if (a.waitPad) { a.waitPad.claim = null; a.waitPad = null; } }
function leaveLines(t) {
  unwait(t.cmd);
  if (t.lane) { t.lane.q = t.lane.q.filter((x) => x !== t); t.lane = null; }
  for (const p of SPOTS) if (p.line.includes(t)) p.line = p.line.filter((x) => x !== t);
}
function startCmd(t, a) {
  leaveLines(t);
  if (a.kind === "sts") { const l = laneFor(a.berth, t); l.q.push(t); t.lane = l; }
  else if (a.kind === "rtg" && !a.bay) { if (spotFree(a.spot, t) && spotOk(a.spot, t)) { a.spot.claim = t; a.bay = a.spot; if (a.pickup && !a.want) chooseExport(t, a); } else a.spot.line.push(t); }
  if (t.park && !(a.kind === "tpark" && a.spot === t.park)) { if (t.park.claim === t) t.park.claim = null; t.park = null; }
  if (t.stall && t.stall.claim === t && !(a.kind === "park" && a.stall === t.stall)) t.stall.claim = null;
  t.stall = null; t.cmd = a;
  return true;
}
// where a ship is headed right now: a hover point and the way to face there
function spotOf(t) {
  if (t.exiting) return { ...t.exiting, yaw: null };
  const a = t.cmd;
  if (!a) return t.park ? padSpot(t.park) : t.stall ? padSpot(t.stall) : null;
  if (a.kind === "sts") return a.waitPad ? padSpot(a.waitPad) : t.lane ? laneSpot(t.lane, Math.max(0, t.lane.q.indexOf(t))) : null;
  if (a.kind === "rtg") return a.bay ? { x: a.bay.x, y: HOVER, z: a.bay.z, yaw: N } : a.waitPad ? padSpot(a.waitPad) : null;
  if (a.kind === "park") return padSpot(a.stall);
  if (a.kind === "tpark") return padSpot(a.spot);
  return null;
}
const speedOf = (t) => hyp(t.vx, t.vy, t.vz);
const atSpot = (t) => { const p = spotOf(t); return !!p && hyp(p.x - t.x, p.y - t.y, p.z - t.z) < 0.3 && speedOf(t) < 0.6; };
// (owner) a customer whose container is in storage goes by itself from its pad to a free truck spot it can be brought to
function custStep(t) {
  if (t.kind !== "cust" || t.exiting || t.load !== null || t.queue.length || t.cmd || !t.stall) return;
  const p = custSpot(t, t.want);
  if (p) { p.claim = t; startCmd(t, { kind: "rtg", spot: p, bay: p }); }
}
function canStart(t) {
  const a = t.queue[0]; if (!a) return false;
  if (a.kind === "deliver") return !t.load || !!deliverAction(t, false);
  if (a.kind === "sts") { const s = DOCK.ship; return !!s && (s.state === "docked" || s.state === "closing"); }
  return true;
}
// a hauler with nothing to do flies to the nearest free dock station and parks
function idleStep(t) {
  if (t.kind !== "yard" || t.locked) return;
  const ready = canStart(t);
  if (t.cmd && t.cmd.kind === "tpark" && ready) { t.cmd.spot.claim = null; t.cmd = null; return; }
  if (t.cmd || ready || t.park) return;
  const p = nearPad(t); if (!p) return;
  p.claim = t; startCmd(t, { kind: "tpark", spot: p });
}
// (owner) an auto hauler with a hauler spot assigned: loaded, it takes the container there; empty, it takes an export
// from there if one's waiting and the freighter has room, else fetches from the freighter (a container a customer is
// waiting for if one is in reach and unclaimed, otherwise whatever its arm takes)
function autoStep(t) {
  if (!t.auto || !t.home || t.load || t.cmd || t.queue.length || t.locked) return;
  const s = DOCK.ship;
  if (exportsAt(t.home) - pickupTrips(t.home) > 0 && shipTakesExports()) { enqueue(t, { kind: "rtg", spot: t.home, pickup: true }); return; }
  const bs = BERTHS.filter((b) => berthLeft(b) > 0).sort((a, b) => laneFor(a, t).q.length - laneFor(b, t).q.length); if (!bs.length) return;
  for (const b of bs) { const [c0, c1] = craneCols(b); for (let k = 0; k < s.bays.length; k++) { const st = s.bays[k], x = st.find((q) => q.wantedBy), c = k % DOCK.cols; if (x && !x.exp && c >= c0 && c < c1 && impCount(st) - s.claims[k] > 0 && !BERTHS.some((q) => q.crane.slot === k)) { enqueue(t, { kind: "sts", berth: b, slot: k }); return; } } }
  enqueue(t, { kind: "sts", berth: bs[0] });
}
// (owner) a loaded hauler with nothing queued takes its container where it goes: an import to a hauler spot with room
// for its shape in reach (an auto hauler's own if it has room, otherwise the nearest, a shorter line counting), an
// export to an arm with room for it on the freighter
function deliverAction(t, pickIt) {
  if (t.load.exp) { const ok = BERTHS.filter((b) => exportRoom(b) > 0).sort((a, b) => laneFor(a, t).q.length - laneFor(b, t).q.length); if (!ok.length) return null; const b = ok.find((q) => berthLeft(q) > 0) || ok[0]; return { kind: "sts", berth: b, exp: true, pick: pickIt && berthLeft(b) > 0 }; }
  const ok = (p) => dropRoom(p, t.load.s) > 0;
  const dest = (t.auto && t.home && ok(t.home) ? t.home : null) || hspots().filter(ok).reduce((m, p) => (!m || hyp(p.x - t.x, p.z - t.z) + p.line.length * 6 < hyp(m.x - t.x, m.z - t.z) + m.line.length * 6 ? p : m), null);
  return dest ? { kind: "rtg", spot: dest } : null;
}
function deliverStep(t) {
  if (t.kind !== "yard" || !t.load || t.cmd || t.queue.length || t.locked) return;
  const a = deliverAction(t, true); if (a) enqueue(t, a);
}
// containers come back to nobody once whoever wanted them is gone or no longer coming for them
function sweepWants() {
  const free = (x) => { const t = x.wantedBy; if (!t) return; if (t.gone || (t.exiting && t.load !== x) || (t.kind === "yard" && !(t.cmd && t.cmd.want === x) && t.load !== x)) x.wantedBy = null; };
  for (const v of SLOTS) v.stack.forEach(free);
  const s = DOCK.ship; if (s) for (const st of s.bays) st.forEach(free);
}
// ---- flying (owner, 2026-11-05: free-flying ships, no roads) ----
// a ship heads for its hover point: further than a few meters off, it climbs to its cruising height (above the arms and
// gantries; haulers a little lower than customers, each a little different) before flying level, and comes down near
// the spot. It eases off as it arrives, keeps clear of other ships, and turns to face where it's going (and north at its
// spot).
const VMAX = { yard: 9, cust: 8, exp: 8 }, ACC = 8, CLEAR = 3.0;
function fly(t, dt) {
  if (t.locked) { t.vx *= 0.8; t.vy *= 0.8; t.vz *= 0.8; return; }
  const sp = spotOf(t) || { x: t.x, y: Math.max(t.y, HOVER), z: t.z, yaw: null };
  const dx = sp.x - t.x, dz = sp.z - t.z, dh = hyp(dx, dz), cruise = (t.kind === "yard" ? 8.5 : 11) + (t.id % 3) * 1.1;
  const far = dh > 5, wantY = far ? Math.max(sp.y, cruise) : sp.y;
  const climb = far ? clamp((t.y - 2) / (cruise - 3), 0.12, 1) : 1;
  const hv = Math.min(VMAX[t.kind], dh * 1.5) * climb;
  let wx = dh > 0.001 ? dx / dh * hv : 0, wz = dh > 0.001 ? dz / dh * hv : 0, wy = clamp((wantY - t.y) * 1.8, -4, 4);
  // keep clear of other ships (not while settling into its own spot)
  if (dh > 1.2 || Math.abs(sp.y - t.y) > 1) for (const o of crafts) {
    if (o === t || o.gone) continue;
    const ox = t.x - o.x, oy = (t.y - o.y) * 1.3, oz = t.z - o.z, d = hyp(ox, oy, oz);
    if (d < CLEAR && d > 0.001) { const f = (CLEAR - d) / CLEAR * 6; wx += ox / d * f; wy += oy / d * f * 0.6; wz += oz / d * f; }
  }
  const ax = wx - t.vx, ay = wy - t.vy, az = wz - t.vz, a = hyp(ax, ay, az), lim = ACC * dt, k = a > lim && a > 1e-9 ? lim / a : 1;
  t.vx += ax * k; t.vy += ay * k; t.vz += az * k;
  t.x += t.vx * dt; t.y = Math.max(0.9, t.y + t.vy * dt); t.z += t.vz * dt;
  // facing: along its way when moving, north (or as its spot says) when settled
  const hs = hyp(t.vx, t.vz), want = hs > 1.2 ? Math.atan2(-t.vz, t.vx) : sp.yaw !== null && sp.yaw !== undefined && dh < 3 ? sp.yaw : t.yaw;
  let d = want - t.yaw; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; t.yaw += clamp(d, -3 * dt, 3 * dt);
}
function craftStep(t, dt) {
  if (!t.locked) {
    if (t.kind === "yard" && t.cmd && t.cmd.kind === "rtg" && (t.cmd.pickup ? t.load !== null || (!t.cmd.want && !exportsAt(t.cmd.spot)) : t.load === null || t.load.exp || dropRoom(t.cmd.spot, t.load.s) <= 0)) { if (t.cmd.bay && t.cmd.bay.claim === t) t.cmd.bay.claim = null; leaveLines(t); t.cmd = null; }
    custStep(t);
    if (!t.cmd && !t.exiting) {
      deliverStep(t); autoStep(t);
      // (owner) a queued "drop it off" step becomes a trip to wherever the container goes now (skipped if empty)
      while (t.queue.length && t.queue[0].kind === "deliver") { if (!t.load) { t.queue.shift(); continue; } const a = deliverAction(t, t.queue.length === 1); if (!a) break; claim(t, a, 1); t.queue[0] = a; }
      if (t.queue.length && t.queue[0].kind !== "deliver" && canStart(t)) startCmd(t, t.queue.shift());
    }
    idleStep(t);
  }
  fly(t, dt);
  if (t.exiting) { if (hyp(t.x - t.exiting.x, t.z - t.exiting.z) < 4) { t.gone = true; crafts.splice(crafts.indexOf(t), 1); } return; }
  if (!t.locked && t.cmd && atSpot(t)) {
    if (t.cmd.kind === "park") { t.stall = t.cmd.stall; t.cmd = null; }
    else if (t.cmd.kind === "tpark") { t.park = t.cmd.spot; t.cmd = null; }
  }
}
function doneServing(t) {
  const a = t.cmd; t.cmd = null; t.locked = false; leaveLines(t);
  if (t.queue.length) return;
  if (t.kind === "exp") leave(t);
  if (t.kind === "cust") { t.happy = 1.8; delivered++; money += INCOME; floats.push({ x: t.x, y: t.y + 1, z: t.z, t: 1.6, text: "+$" + INCOME }); leave(t); }
  return a;
}

// ---- cranes: a list of moves and lifts, played in order (positions in meters on the x–z plane) ----
const CRANE_SP = 5, CRANE_ACC = 14, LIFT = 0.6;
function craneStep(cr, dt, onDone) {
  const op = cr.ops[0]; if (!op) return;
  if (op.to) {
    const [tx, tz] = typeof op.to === "function" ? op.to() : op.to, dx = tx - cr.x, dz = tz - cr.z, d = hyp(dx, dz);
    cr.v = Math.min(CRANE_SP, (cr.v || 0) + CRANE_ACC * dt, Math.sqrt(2 * CRANE_ACC * d) + 0.4); const sp = cr.v * dt;
    if (d <= sp || d < 0.02) { cr.x = tx; cr.z = tz; cr.v = d < 0.02 ? cr.v : cr.v * 0.5; cr.ops.shift(); if (!cr.ops.length) { cr.v = 0; onDone(); } } else { cr.x += dx / d * sp; cr.z += dz / d * sp; }
    return;
  }
  cr.v = 0;
  // the spreader goes down, grabs or lets go at the bottom, and comes back up
  op.t = (op.t || 0) + dt; const ph = Math.min(1, op.t / LIFT); cr.hoist = ph < 0.5 ? ph * 2 : (1 - ph) * 2;
  if (ph >= 0.5 && !op.done) {
    op.done = true;
    if (op.lift) { const s = op.lift, x = s.stack ? s.stack.pop() : s.truck.load; if (!s.stack) s.truck.load = null; cr.hold = x; if (op.then) op.then(); }
    else if (op.lower) { const s = op.lower, x = cr.hold; if (x && (x.claimedBy === TAKEN || !s.stack)) x.claimedBy = null; if (s.stack) s.stack.push(x); else s.truck.load = x; cr.hold = null; if (op.then) op.then(); }
  }
  if (ph < 1) return;
  cr.hoist = 0; cr.ops.shift(); if (!cr.ops.length) onDone();
}
// where a trip's claimed container is: its slot, how many unclaimed containers sit on top of it (left by trips called off:
// the arm moves them aside first), and which claimed container it gets (its own, or another trip's on top: they swap)
function boxPlan(a) {
  const s = DOCK.ship; if (!s || !a.box) return null;
  const k = s.bays.findIndex((st) => st.includes(a.box)); if (k < 0) return null;
  const st = s.bays[k]; let dig = 0;
  for (let i = st.length - 1; i >= 0; i--) { const x = st[i]; if (x === a.box || (x.claimedBy && x.claimedBy !== TAKEN)) return { k, dig, x }; if (x.claimedBy === TAKEN || x.exp) return null; dig++; }
  return null;
}
function boxSwap(a, p) { if (p.x === a.box) return; const o = p.x.claimedBy; o.box = a.box; a.box.claimedBy = o; a.box = p.x; p.x.claimedBy = a; }
const slotDist = (j, k) => { const a = slotPos(j), b = slotPos(k); return hyp(a.x - b.x, a.z - b.z); };
// where to set n containers aside: the nearest low import stacks in the arm's columns with room, none claimed or being
// worked, avoiding ones with a container a customer wants
function digDsts(b, k, n) {
  const s = DOCK.ship, [c0, c1] = craneCols(b), h = s.bays.map((st) => st.length), out = [], shp = s.bays[k][0].s;   // (owner, 2026-11-06) each freighter stack is one shape
  for (let m = 0; m < n; m++) {
    let best = -1, bd = 1e9;
    s.bays.forEach((st, j) => { const c = j % DOCK.cols; if (j === k || c < c0 || c >= c1 || !onDeck(s, j) || h[j] >= 3 || !impCount(st) || st[0].s !== shp || st.some((x) => x.claimedBy) || BERTHS.some((q) => q.crane.slot === j)) return; const d = h[j] * 3 + slotDist(j, k) + (st.some((x) => x.wantedBy) ? 20 : 0); if (d < bd) { bd = d; best = j; } });
    if (best < 0) return null; h[best]++; out.push(best);
  }
  return out;
}
function canServe(b, q) {
  const a = q.cmd; if (!a.box || a.pick === false) return true;
  const s = DOCK.ship;
  if (!s.bays.some((st) => st.includes(a.box))) { if (a.box.claimedBy === a) a.box.claimedBy = null; delete a.box; delete a.slot; syncClaims(); return true; }
  const p = boxPlan(a); return !!p && (!p.dig || !!digDsts(b, p.k, p.dig));
}
const sxz = (k) => { const p = slotPos(k); return [p.x, p.z]; };
// (owner, 2026-11-05) whether a container has a slot of its shape waiting for it, in reach of a hauler spot
const roomFor = (t, x) => hspots().some((p) => dropRoom(p, x.s) > 0);
// the loader arm: serves the hauler at the front of either of its lines (one bringing an export first). An export goes
// onto the freighter (a stack with no imports, nearest first; it pays then) and, on the way back, an import for the same
// hauler. A pickup takes its claimed container (setting aside whatever was left on top of it), else the nearest unclaimed
// top container in the arm's columns.
function stsStep(b, dt) {
  const cr = b.crane, s = DOCK.ship;
  if (!cr.ops.length && !cr.truck && s && (s.state === "docked" || s.state === "closing") && (berthLeft(b) + b.promised > 0 || expPromised(b) > 0)) {
    const waiting = b.lanes.map((l) => l.q[0]).filter((q) => q && q.cmd && q.cmd.kind === "sts" && q.cmd.berth === b && (q.load === null || q.load.exp) && !q.locked && atSpot(q));
    let t = null, ti = 1e9;
    for (const q of waiting) { if (!canServe(b, q)) continue; const d = hyp(q.x - cr.x, q.z - cr.z) - (q.load ? 100 : 0); if (d < ti) { ti = d; t = q; } }
    if (t) {
      const a = t.cmd, [c0, c1] = craneCols(b), ops = [], at = () => [t.x, t.z];
      const rel = (q, picked) => () => { if (picked) b.promised = Math.max(0, b.promised - 1); if (cr.truck === q) cr.truck = null; doneServing(q); };
      let ref = [t.x, t.z], placed = !t.load, liftOff = null;
      if (t.load) {
        let es = -1, ed = 1e9;
        s.bays.forEach((st, k) => { const q = shipSlot(k); if (!onDeck(s, k) || q.c < c0 || q.c >= c1 || st.length >= 3 || impCount(st) || (st.length && st[0].s !== t.load.s)) return; const p = slotPos(k), d = hyp(p.x - ref[0], p.z - ref[1]); if (d < ed) { ed = d; es = k; } });
        a.exp = false;
        if (es >= 0) { placed = true; liftOff = { lift: { truck: t } }; ops.push({ to: at }, liftOff, { to: sxz(es) }, { lower: { stack: s.bays[es] }, then: () => { money += INCOME; exported++; const p = slotPos(es); floats.push({ x: p.x, y: 2, z: p.z, t: 1.6, text: "+$" + INCOME }); } }); ref = sxz(es); }
      }
      let best = -1, dig = [];
      if (a.pick !== false && placed) {
        if (a.box) { const p = boxPlan(a), d = p && (p.dig ? digDsts(b, p.k, p.dig) : []); if (d) { boxSwap(a, p); best = p.k; dig = d; } }
        else { let bd = 1e9; s.bays.forEach((st, k) => { const c = k % DOCK.cols; if (pickable(st) && c >= c0 && c < c1 && !BERTHS.some((q) => q !== b && q.crane.slot === k)) { const p = slotPos(k), d = hyp(p.x - ref[0], p.z - ref[1]) + (roomFor(t, st[st.length - 1]) ? 0 : 60); if (d < bd) { bd = d; best = k; } } }); }
        const bx = a.box; if (a.box) { if (a.box.claimedBy === a) a.box.claimedBy = null; delete a.box; } delete a.slot;
        if (best >= 0) { const st = s.bays[best], x = bx && st.includes(bx) ? bx : st[st.length - 1]; if (x) x.claimedBy = TAKEN; } else b.promised = Math.max(0, b.promised - 1);
        syncClaims();
      }
      if (best < 0 && liftOff) liftOff.then = rel(t, false);
      if (best >= 0) {
        cr.slot = best;
        for (const d of dig) ops.push({ to: sxz(best) }, { lift: { stack: s.bays[best] } }, { to: sxz(d) }, { lower: { stack: s.bays[d] } });   // (owner) the ones left on top of it, set aside first
        ops.push({ to: sxz(best) }, { lift: { stack: s.bays[best] } }, { to: at }, { lower: { truck: t }, then: rel(t, true) });
      }
      if (ops.length) { t.locked = true; cr.truck = t; cr.ops = ops; } else doneServing(t);
    }
  }
  // idle (owner): the next hauler first (a container it's coming for, buried, is dug out ready); with none coming, dig
  // out buried containers customers want, then even its columns out into stacks of two
  if (!cr.ops.length && !cr.truck && s && s.state === "docked" && b.open) {
    const coming = crafts.filter((q) => q.cmd && q.cmd.kind === "sts" && q.cmd.berth === b && !q.locked);
    const next = coming.filter((q) => q.cmd.box && q.cmd.pick !== false).reduce((m, q) => (!m || hyp(q.x - cr.x, q.z - cr.z) < hyp(m.x - cr.x, m.z - cr.z) ? q : m), null);
    const nb = next ? boxPlan(next.cmd) : null;
    if (nb && nb.dig) { const d = digDsts(b, nb.k, 1); if (d) cr.ops = [{ to: sxz(nb.k) }, { lift: { stack: s.bays[nb.k] } }, { to: sxz(d[0]) }, { lower: { stack: s.bays[d[0]] } }]; }
    else if (!coming.length && !sortShip(b)) levelShip(b);
    else if (next && nb) { const p = sxz(nb.k); if (hyp(p[0] - cr.x, p[1] - cr.z) > 0.2) cr.ops = [{ to: p }]; }
  }
  craneStep(cr, dt, () => { cr.slot = undefined; const t = cr.truck; cr.truck = null; if (t) doneServing(t); });
}
// (owner) an idle arm sorts the freighter: it takes the top container off a stack where a customer's container is buried
// (the least buried first) and sets it on the nearest low stack of its own columns that holds no exports and no wanted one
function sortShip(b) {
  const s = DOCK.ship, cr = b.crane, [c0, c1] = craneCols(b), inCols = (k) => k % DOCK.cols >= c0 && k % DOCK.cols < c1 && onDeck(s, k);
  const busy = (k) => s.claims[k] > 0 || BERTHS.some((q) => q.crane.slot === k);
  let src = -1, sd = 1e9;
  s.bays.forEach((st, k) => { if (!inCols(k) || !impCount(st) || busy(k)) return; const i = st.findIndex((x) => x.wantedBy); if (i < 0 || i === st.length - 1) return; if (st.length - 1 - i < sd) { sd = st.length - 1 - i; src = k; } });
  if (src < 0) return false;
  let dst = -1, dd = 1e9;
  const shp = s.bays[src][0].s;
  s.bays.forEach((st, k) => { if (k === src || !inCols(k) || st.length >= 3 || (st.length && (!impCount(st) || st[0].s !== shp)) || st.some((x) => x.wantedBy) || busy(k)) return; const d = [3, 0, 8][st.length] + slotDist(k, src); if (d < dd) { dd = d; dst = k; } });
  if (dst < 0) return false;
  cr.ops = [{ to: sxz(src) }, { lift: { stack: s.bays[src] } }, { to: sxz(dst) }, { lower: { stack: s.bays[dst] } }];
  return true;
}
// (owner, 2026-11-01) with nothing to sort, an idle arm evens its columns out into stacks of two; it never buries or
// moves a claimed or wanted container
function levelShip(b) {
  const s = DOCK.ship, cr = b.crane, [c0, c1] = craneCols(b);
  const busy = (k) => s.claims[k] > 0 || BERTHS.some((q) => q.crane.slot === k);
  const ks = s.bays.map((_, k) => k).filter((k) => k % DOCK.cols >= c0 && k % DOCK.cols < c1 && onDeck(s, k) && !busy(k) && (!s.bays[k].length || impCount(s.bays[k])));
  const h = (k) => s.bays[k].length, top = (k) => s.bays[k][h(k) - 1], col = (k) => k % DOCK.cols;
  const canTake = (k) => h(k) && !top(k).wantedBy && !top(k).claimedBy, canTo = (k, a) => !s.bays[k].some((x) => x.wantedBy || x.claimedBy) && (!h(k) || s.bays[k][0].s === s.bays[a][0].s);
  let src = -1, dst = -1, best = 1e9;
  for (const a of ks) if (h(a) === 3 && canTake(a)) for (const z of ks) if (z !== a && h(z) < 2 && canTo(z, a)) { const d = (h(z) === 1 ? 0 : 20) + slotDist(a, z); if (d < best) { best = d; src = a; dst = z; } }
  if (src < 0) for (const a of ks) if (h(a) === 1 && canTake(a)) for (const z of ks) if (z !== a && h(z) === 1 && canTo(z, a) && col(z) < col(a)) { const d = slotDist(a, z); if (d < best) { best = d; src = a; dst = z; } }
  if (src < 0) return false;
  cr.ops = [{ to: sxz(src) }, { lift: { stack: s.bays[src] } }, { to: sxz(dst) }, { lower: { stack: s.bays[dst] } }];
  return true;
}
// ---- storage cranes (owner, 2026-11-06): each works whatever is in its reach, and they work together ----
// An idle crane looks (a few times a second) for, in order: a ship at a spot in its reach it can serve (unload a hauler's
// import or an export ship's export into a slot of its shape, as low as it can; hand a customer its container or a
// hauler its export, digging out whatever's on top); a wanted container (a customer's, or an export a hauler is coming
// for) to bring one move closer to its spot, through a slot of its shape another crane also reaches; else it flattens
// its stacks out. Each keeps off the units the others are working.
const CRANE_THINK = 0.25;
function cranesStep(dt) {
  for (const c of CRANES) {
    const cr = c.cr;
    if (!cr.ops.length && !cr.truck && (cr.think = (cr.think || 0) - dt) <= 0) { cr.think = CRANE_THINK; craneWork(c); }
    craneStep(cr, dt, () => { cr.res = null; });
  }
}
function craneWork(c) {
  const N = net(), cr = c.cr, tk = (v) => CRANES.some((o) => o !== c && o.cr.res && o.cr.res.has(v)), mine = (v) => N.by.has(v) && N.by.get(v).includes(c);
  const ready = crafts.filter((q) => q.cmd && q.cmd.kind === "rtg" && q.cmd.bay && !q.locked && atSpot(q) && mine(q.cmd.bay));
  for (const q of ready) if (q.cmd.readyAt === undefined) q.cmd.readyAt = clock;
  const score = (q) => hyp(q.x - cr.x, q.z - cr.z) - (clock - q.cmd.readyAt) * 2;
  ready.sort((a, b) => score(a) - score(b));
  for (const q of ready) if (serveShip(c, q, tk, mine)) return;
  if (relay(c, tk, mine)) return;
  flatten(c, tk, mine);
}
// lifting x out of slot v: whatever's on top is set aside first, each into a slot of its own shape in this crane's reach
function digOps(c, x, v, keep, tk, mine) {
  const st = v.stack, above = st.slice(st.indexOf(x) + 1).reverse(), ops = [], res = new Set([v, ...keep]), h = new Map();
  for (const y of above) {
    let w = null, ws = 1e9;
    for (const u of SLOTS) {
      if (u === v || keep.includes(u) || !mine(u) || u.shape !== y.s || tk(u)) continue;
      const hh = h.has(u) ? h.get(u) : u.stack.length; if (hh >= 3) continue;
      const sc = hh * 2.5 + hyp(u.x - v.x, u.z - v.z) + (u.stack.some((z) => z.wantedBy) ? 20 : 0); if (sc < ws) { ws = sc; w = u; }
    }
    if (!w) return null;   // nowhere to set it aside right now: try again later
    h.set(w, (h.has(w) ? h.get(w) : w.stack.length) + 1); res.add(w);
    ops.push({ to: [v.x, v.z] }, { lift: { stack: st } }, { to: [w.x, w.z] }, { lower: { stack: w.stack } });
  }
  ops.push({ to: [v.x, v.z] }, { lift: { stack: st } });
  return { ops, res };
}
function serveShip(c, q, tk, mine) {
  const cr = c.cr, a = q.cmd, at = () => [q.x, q.z], done = () => { cr.truck = null; doneServing(q); };
  if (q.load && (q.kind === "exp" || (q.kind === "yard" && !q.load.exp))) {
    const x = q.load, N = net(); let w = null, ws = 1e9;
    for (const v of SLOTS) {
      if (!mine(v) || v.shape !== x.s || v.stack.length >= 3 || tk(v)) continue;
      const sc = v.stack.length * 8 + hyp(v.x - q.x, v.z - q.z) * 0.5 + (canOut(v, x) ? 0 : 30) + (v.stack.some((z) => z.wantedBy) ? 8 : 0); if (sc < ws) { ws = sc; w = v; }
    }
    if (!w) return false;
    q.locked = true; cr.truck = q; cr.res = new Set([w]);
    cr.ops = [{ to: at }, { lift: { truck: q }, then: done }, { to: [w.x, w.z] }, { lower: { stack: w.stack } }];   // (owner) the ship leaves once its container is lifted
    return true;
  }
  if (q.load) return false;
  if (q.kind === "yard" && a.pickup && !a.want) chooseExport(q, a);
  const x = q.kind === "cust" ? q.want : a.pickup ? a.want : null; if (!x) return false;
  const v = slotOf(x); if (!v || !mine(v) || tk(v)) return false;
  const m = digOps(c, x, v, [], tk, mine); if (!m) return false;
  m.ops.push({ to: at }, { lower: { truck: q }, then: done });
  q.locked = true; cr.truck = q; cr.res = m.res; cr.ops = m.ops;
  return true;
}
// wanted containers and where they're going: a customer's to its truck spot (or, while it waits on a pad, the nearest);
// an export to the hauler spot of the hauler coming for it
function goals() {
  const out = [];
  for (const t of crafts) {
    if (t.gone || t.exiting || t.load) continue;
    if (t.kind === "cust" && t.want) out.push([t.want, t.cmd && t.cmd.kind === "rtg" ? t.cmd.spot : null]);
    else if (t.kind === "yard" && t.cmd && t.cmd.kind === "rtg" && t.cmd.pickup && t.cmd.want) out.push([t.cmd.want, t.cmd.spot]);
  }
  return out;
}
function relay(c, tk, mine) {
  for (const [x, g] of goals()) {
    const v = slotOf(x); if (!v || !mine(v) || tk(v)) continue;
    let best = null;
    for (const p of g ? [g] : tspots()) { const r = route(v, p, x.s, tk); if (r && (!best || r.length < best.length)) best = r; }
    if (!best || best.length <= 2) continue;   // already one move from its spot: that move is for the ship there
    const w = best[1]; if (!mine(w)) continue;   // the next move is another crane's
    const m = digOps(c, x, v, [w], tk, mine); if (!m) continue;
    m.ops.push({ to: [w.x, w.z] }, { lower: { stack: w.stack } });
    c.cr.res = m.res; c.cr.ops = m.ops;
    return true;
  }
  return false;
}
// (owner, 2026-11-06) a crane with nothing else to do flattens its stacks out: it takes the top container off a tall
// stack (one burying a wanted container first) and sets it on a slot of the same shape at least two lower. It never moves
// a wanted container or puts anything on one, and never moves one out of where it can be handed out.
function flatten(c, tk, mine) {
  const cr = c.cr; let best = null, bs = 1e9;
  for (const v of SLOTS) {
    const st = v.stack, top = st[st.length - 1]; if (!mine(v) || st.length < 2 || top.wantedBy || tk(v)) continue;
    const buries = st.some((x) => x.wantedBy), out = canOut(v, top);
    for (const w of SLOTS) {
      if (w === v || !mine(w) || w.shape !== top.s || w.stack.length > st.length - 2 || w.stack.some((x) => x.wantedBy) || tk(w) || (out && !canOut(w, top))) continue;
      const sc = -st.length * 4 - (buries ? 20 : 0) + w.stack.length * 4 + hyp(w.x - v.x, w.z - v.z) * 0.3 + hyp(v.x - cr.x, v.z - cr.z) * 0.1;
      if (sc < bs) { bs = sc; best = [v, w]; }
    }
  }
  if (!best) return false;
  const [v, w] = best;
  cr.res = new Set([v, w]); cr.ops = [{ to: [v.x, v.z] }, { lift: { stack: v.stack } }, { to: [w.x, w.z] }, { lower: { stack: w.stack } }];
  return true;
}

// ---- input (the 3D view works out what's under the pointer and calls these) ----
let selected = null, hover = null, bad = null;
addEventListener("keydown", (e) => { if (e.code === "Escape") { selected = null; ghostCancel(); } const n = /^Digit([1-9])$/.exec(e.code); if (n) { const t = crafts.find((q) => q.num === +n[1]); if (t) selected = t; } });
const pickAt = (sx, sy) => (R3.pick ? R3.pick(sx, sy) : null);
// take any queued trip back (not the one under way), with the drop-off step that was put in for it
function unqueue(t, a) {
  const i = t.queue.indexOf(a); if (i < 0) return false;
  claim(t, a, -1); t.queue.splice(i, 1);
  if (t.queue[i - 1] && t.queue[i - 1].kind === "deliver" && (!t.queue[i] || t.queue[i].kind === "deliver")) t.queue.splice(i - 1, 1);
  return true;
}
// (owner) an auto hauler told to fetch from a freighter slot: if it's already on its way to an arm for a pickup the arm
// hasn't started, that pickup becomes the slot's
function slotSwap(t, g) {
  if (!g || t.kind !== "yard" || !t.auto || t.locked || !t.cmd || t.cmd.kind !== "sts" || t.cmd.slot !== undefined || t.load !== null) return null;
  if (g.kind !== "sts" || g.slot === undefined) return null;
  const s = DOCK.ship; if (s.bays[g.slot].length - s.claims[g.slot] <= 0 || (g.berth !== t.cmd.berth && berthLeft(g.berth) <= 0)) return null;
  return { kind: "sts", berth: g.berth, slot: g.slot, swap: true };
}
function doSwap(t, a) { claim(t, t.cmd, -1); delete a.swap; claim(t, a, 1); startCmd(t, a); }
// (owner, 2026-11-06) an auto hauler is assigned a hauler spot by tapping it
const homeFor = (t, g) => (t.kind === "yard" && t.auto && g && g.kind === "rtg" && g.spot.kind === "hspot" ? g.spot : null);
// (owner, 2026-11-01) everything is one tap: tap a ship to select it (again to let go), tap where it goes to queue it, tap
// a numbered badge of its queue to take that trip back, tap empty space to let go of it. (owner, 2026-11-06) With nothing
// selected, tap an empty storage slot to change its shape. While a blueprint is out, a tap moves it there (on a slot
// blueprint, turns its shape), or buys it, or drops it.
function click(sx, sy) {
  const pk = pickAt(sx, sy);
  if (ghost) {
    if (pk && pk.ghostYes) ghostConfirm(); else if (pk && pk.ghostNo) ghostCancel();
    else { const g = R3.ground ? R3.ground(sx, sy) : null; if (!g) return; const r = ghostRect(ghost); if (ghost.kind === "slot" && g.x >= r[0] && g.x <= r[1] && g.z >= r[2] && g.z <= r[3]) ghostTurn(); else ghostMove(g.x, g.z); }
    return;
  }
  if (pk && pk.badge) { unqueue(selected, pk.badge.a); return; }
  if (pk && pk.truck) { selected = selected === pk.truck ? null : pk.truck; return; }
  if (!selected) { if (pk && pk.tile && pk.tile.kind === "slot") turnShape(pk.tile, pk.at); return; }
  const g = targetOf(pk), h = homeFor(selected, g); if (h) { selected.home = h; return; }
  const a = planFor(selected, g), sw = !a && slotSwap(selected, g);
  if (a) enqueue(selected, a); else if (sw) doSwap(selected, sw); else if (!g) selected = null; else bad = { p: pk.at, t: 0.5 };
}
// (owner, 2026-11-01) press and hold a freighter container the selected hauler has claimed to call that pickup off; with
// several of its claims in one stack, the top one goes first
function unclaimAt(sx, sy) {
  const t = selected, s = DOCK.ship; if (!t || t.kind !== "yard" || !s) return false;
  const pk = pickAt(sx, sy); if (!pk || pk.slot === undefined) return false;
  const st = s.bays[pk.slot], mine = (t.cmd && t.cmd.kind === "sts" && !t.locked ? [t.cmd] : []).concat(t.queue).filter((a) => a.kind === "sts" && a.box && st.includes(a.box));
  if (!mine.length) return false;
  const a = mine.reduce((m, q) => (st.indexOf(q.box) > st.indexOf(m.box) ? q : m));
  if (a === t.cmd) { claim(t, a, -1); leaveLines(t); t.cmd = null; } else unqueue(t, a);
  return true;
}
// what a trip's spot looks like on the map: a point and how big a ring to draw round it
function spotMark(a, t) {
  if (a.slot !== undefined && DOCK.ship) { const p = slotPos(a.slot), st = DOCK.ship.bays[a.slot]; return { x: p.x, y: st.length * PH + 0.05, z: p.z, r: HR }; }
  if (a.kind === "sts") { const l = laneFor(a.berth, t); return { x: l.x, y: 0.05, z: LANE_Z, r: 1.4 }; }
  if (a.kind === "rtg") return { x: a.spot.x, y: 0.05, z: a.spot.z, r: 1.3 };
  if (a.kind === "park") return { x: a.stall.x, y: 0.05, z: a.stall.z, r: 1.5 };
  if (a.kind === "tpark") return { x: a.spot.x, y: 0.05, z: a.spot.z, r: 1.5 };
  return null;
}
// where a container is, if anywhere
function boxAt(x) {
  if (!x) return null;   // (bug 2026-11-05) a grey customer that hasn't picked yet has no container (an empty hauler's load is null too)
  for (const v of SLOTS) { const i = v.stack.indexOf(x); if (i >= 0) return [v.x, i * PH + PH / 2, v.z]; }
  const s = DOCK.ship; if (s) for (let n = 0; n < s.bays.length; n++) { const i = s.bays[n].indexOf(x); if (i >= 0) { const p = slotPos(n); return [p.x, i * PH + PH / 2, p.z]; } }
  for (const t of crafts) if (t.load === x) return [t.x, t.y - CARRY, t.z];
  for (const cr of [...BERTHS.map((b) => b.crane), ...CRANES.map((c) => c.cr)]) if (cr.hold === x) return [cr.x, 3.2, cr.z];
  return null;
}
// (owner) a claimed container in the freighter flashes while it could still be claimed; a selected customer's flashes
const flashing = (x, slot, st) => {
  if (!x) return false; if (selected && selected.kind === "cust") return selected.want === x;
  if (slot === undefined || !x.wantedBy || !DOCK.ship) return false;
  const need = st.length - st.indexOf(x), have = DOCK.ship.claims[slot] + BERTHS.reduce((n, b) => n + (b.crane.slot === slot ? 1 : 0), 0); if (have >= need) return false;
  const c = slot % DOCK.cols, b = BERTHS.find((q) => q.open && c >= craneCols(q)[0] && c < craneCols(q)[1]);
  return !!b && berthLeft(b) > 0 && impCount(st) - DOCK.ship.claims[slot] > 0;
};
// (owner) where it sits in its stack: green on top, yellow in the middle, red at the bottom
const posRGB = (st, x) => { const i = st.indexOf(x); return i === st.length - 1 ? "74,222,106" : i === 0 ? "255,74,58" : "242,194,50"; };
let hudTxt = "";
const BUILD = [["slot", "Storage"], ["crane", "Crane"], ["hspot", "Hauler spot"], ["tspot", "Truck spot"], ["pads", "Pads"], ["station", "Dock station"], ["berth", "Loader arm"]];
function hud() {
  const sp0 = expo(250, 1.15, PARK.length - 1), p = tractorPrice(false) + sp0, pa = tractorPrice(true) + sp0, sp = true, pr = BUILD.map(([k]) => PRICES[k]());
  const txt = [money, p, sp, pr.join()].join("|"); if (txt === hudTxt) return; hudTxt = txt;
  $("money").textContent = "$" + money.toLocaleString();
  for (const [id, name, q] of [["buy-tractor", "Manual", p], ["buy-auto", "Auto", pa]]) { const b = $(id); b.textContent = "+ " + name + " $" + q.toLocaleString(); b.disabled = !sp || money < q; }
  BUILD.forEach(([k, name], i) => { const b = $("build-" + k); if (!b) return; b.textContent = name + " $" + pr[i].toLocaleString(); b.disabled = money < pr[i]; });
}
$("buy-tractor").onclick = () => startGhost("station", null, { hauler: "manual" });
$("buy-auto").onclick = () => startGhost("station", null, { hauler: "auto" });
for (const [k] of BUILD) { const b = $("build-" + k); if (b) b.onclick = () => startGhost(k); }

// ---- loop ----
let last = performance.now();
function step(dt) {
  clock += dt;
  shipStep(dt); syncClaims(); trimPromises(); for (const b of BERTHS) if (b.open) stsStep(b, dt);
  fillLanes(); freeBays(); fillBays(); sweepWants(); cranesStep(dt);
  for (let k = floats.length - 1; k >= 0; k--) if ((floats[k].t -= dt) <= 0) floats.splice(k, 1);
  hud();
  // (owner) customers come faster the more pads are open
  custWait -= dt; if (custWait <= 0) { spawnCustomer(); custWait = (8 + rnd() * 6) / (1 + (STALLS.filter((q) => q.open).length - 4) / 16) / (0.3 + 4 * unclaimedFill()); }
  expWait -= dt; if (expWait <= 0) { spawnExport(); expWait = 10 + rnd() * 6; }
  for (const t of [...crafts]) { craftStep(t, dt); if (t.happy > 0) t.happy -= dt; if (t.sad > 0) t.sad -= dt; }
  if (selected && (!crafts.includes(selected) || selected.exiting)) selected = null;
  if (bad) { bad.t -= dt; if (bad.t <= 0) bad = null; }
}
// (bug 2026-11-05) the first frame's time can come before the start: never a step back
function frame(now) { const dt = clamp((now - last) / 1000, 0, 0.05); last = now; step(dt); if (R3.draw) R3.draw(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
window.Atamus = {
  addMoney: (n) => (money += n), addTractor, startGhost, ghostMove, ghostConfirm, ghostCancel, ghostOk, ghostTurn, turnShape, mkTile, mkBerth, mkPads, mkStation,
  get money() { return money; }, get state() { return { crafts, dock: DOCK, berths: BERTHS, slots: SLOTS, cranes: CRANES, spots: SPOTS, tiles: TILES, stalls: STALLS, park: PARK, delivered, selected, ghost }; }, get exported() { return exported; },
  step, planFor, targetOf, enqueue, unqueueLast, slotSwap, doSwap, select: (t) => (selected = t), atSpot, spotOf, dropRoom, route, fromSpot, click, slotOf,
};
// what the 3D view reads and calls
R3.game = {
  HR, HW, RZ, PH, HOVER, CARRY, X0, MW, MH, LANE_Z, LANE_BACK, UNIT, REACH, MOUNT, SHAPES, COLORS, AUTO_CAB, EXP_CAB, WAIT_CAB, MANUAL_CAB,
  BERTHS, DOCK, STALLS, PARK, SLOTS, CRANES, SPOTS, floats,
  get trucks() { return crafts; }, get selected() { return selected; }, get hover() { return hover; }, get bad() { return bad; },
  get money() { return money; }, get clock() { return clock; }, get ver() { return ver; }, get ghost() { return ghost; },
  slotPos, shipSlot, onDeck, spotMark, boxAt, flashing, posRGB, targetOf, planFor, slotSwap, homeFor, craneCols, laneFor,
  ghostRect, ghostOk, ghostPrice, ghostMove,
  click, unclaimAt, rightClick: () => { if (ghost) { ghostCancel(); return; } if (!selected || !unqueueLast(selected)) selected = null; },
  hoverAt: (sx, sy) => { hover = pickAt(sx, sy); },
  noHover: () => { hover = null; },
};
})();
