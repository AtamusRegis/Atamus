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
// storage platforms (owner, 2026-11-05): a grid of square slots, 3 high, grown a row or a column at a time (up to 8 x 8).
// Containers come in at the drop-off spots on the north apron and go out at the pickup spots on the south apron.
// (owner, 2026-11-06) robot arms (up to 8 per platform) are built like buildings, on their own mounts beside a platform,
// and only reach so far (REACH, from the mount): an arm only works the slots and spots within its reach.
const CELL = 2.7, APRON = 3.6, SIDE = 0, MAXDIM = 8, MAXARMS = 8, REACH = 10.5, MOUNT = 1.45;
const BLOCKS = []; let blockSeq = 0;
const grid = (cols, rows, f) => Array.from({ length: cols }, () => Array.from({ length: rows }, f));
const bayZ = (b, pickup) => (pickup ? b.z1 + CELL / 2 + APRON / 2 : b.z0 - CELL / 2 - APRON / 2);
const deckOf = (x0, x1, z0, z1) => [x0 - CELL / 2 - 0.4, x1 + CELL / 2 + 0.4, z0 - CELL / 2 - APRON, z1 + CELL / 2 + APRON];
function reshape(b) {   // after it's placed or grown: its edges and its spots
  b.x1 = b.x0 + (b.cols - 1) * CELL; b.z1 = b.z0 + (b.rows - 1) * CELL; b.cx = (b.x0 + b.x1) / 2;
  b.deck = deckOf(b.x0, b.x1, b.z0, b.z1);
  for (const bay of b.bays) bay.z = bayZ(b, bay.pickup);
  ver++;
}
function addArm(b, x, z) { b.arms.push({ id: b.arms.length, mount: { x, z }, cr: { x: b.cx, z: (b.z0 + b.z1) / 2, hold: null, ops: [], truck: null, res: null } }); ver++; }
const reaches = (a, x, z) => hyp(x - a.mount.x, z - a.mount.z) <= REACH;
// (owner, 2026-11-06) what each arm reaches: which slots, which spots. A slot takes deliveries if an arm reaching it also
// reaches a drop-off spot, and hands out if an arm reaching it also reaches a pickup spot.
function reachOf(b) {
  if (b._rv === ver) return b._r;
  const arm = b.arms.map((a) => ({ a, slots: grid(b.cols, b.rows, () => false), drop: b.bays.some((q) => !q.pickup && reaches(a, q.x, q.z)), pick: b.bays.some((q) => q.pickup && reaches(a, q.x, q.z)) }));
  const inS = grid(b.cols, b.rows, () => false), outS = grid(b.cols, b.rows, () => false);
  for (const o of arm) for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { const [x, z] = slotXY(b, c, r); if (!reaches(o.a, x, z)) continue; o.slots[c][r] = true; if (o.drop) inS[c][r] = true; if (o.pick) outS[c][r] = true; }
  b._rv = ver; b._r = { arm, inS, outS }; return b._r;
}
const armReach = (b, a) => reachOf(b).arm.find((o) => o.a === a).slots;
// (owner, 2026-11-05) a new platform is 3 x 3 with one arm, one drop-off spot and one pickup spot; the export platform's
// slots take any shape
function mkBlock(cx, cz, exp) {
  const b = { id: blockSeq++, cols: 3, rows: 3, exp: !!exp, open: true, line: [], bays: [], arms: [], grown: 0, x0: cx - CELL, z0: cz - CELL };
  b.slots = grid(3, 3, () => []); b.shapes = grid(3, 3, () => (exp ? ANY : null));
  reshape(b);
  b.bays.push({ x: b.cx, z: 0, pickup: false, claim: null }, { x: b.cx, z: 0, pickup: true, claim: null });
  BLOCKS.push(b); return b;
}
const slotXY = (b, c, r) => [b.x0 + c * CELL, b.z0 + r * CELL];
const fits = (b, c, r, x) => b.shapes[c][r] === ANY || b.shapes[c][r] === x.s;
// the slot under a point of a platform, if any
const cellAt = (b, x, z) => { const c = Math.round((x - b.x0) / CELL), r = Math.round((z - b.z0) / CELL); return c >= 0 && r >= 0 && c < b.cols && r < b.rows ? [c, r] : null; };
const isPickup = (t, a) => t.kind === "cust" || !!(a && a.pickup);
// dock stations: each hauler has its own (a new one appears on it); idle haulers park at the nearest free one, and
// haulers waiting for a loader arm or a platform wait at one
const PARK = [];
const mkStation = (x, z) => { const p = { x, z, claim: null, built: true, own: null }; PARK.push(p); ver++; return p; };
// customer pads, placed in groups of 4
const STALLS = []; let padSeq = 0;
function mkPads(cx, cz) { const g = padSeq++; for (let i = 0; i < 4; i++) STALLS.push({ x: cx + (i % 2 ? 1.9 : -1.9), z: cz + (i < 2 ? -1.9 : 1.9), claim: null, group: g, open: true }); ver++; }
const padSpot = (p) => ({ x: p.x, y: HOVER, z: p.z, yaw: N });
// ships come in from deep space to the south and leave the same way
const spawnPoint = () => ({ x: 20 + rnd() * 70, y: 16, z: MH + 50 });
const exitPoint = () => ({ x: -30 + rnd() * 30, y: 16, z: MH + 55 });

// ---- progress (owner, 2026-11-05): start with 1 hauler and its dock station, 1 loader arm, one 3 x 3 platform, 4
// customer pads and $500; customers pay for their container; the rest is built
let money = 500;
const INCOME = 60;
// (owner, 2026-11-05) every price at 10% for easier testing: set PRICE_SCALE back to 1 for the real prices
const PRICE_SCALE = 0.1, priced = (n) => Math.round(n * PRICE_SCALE);
const expo = (base, k, n) => priced(base * Math.pow(k, Math.max(0, n)));
const PRICES = {
  arm: () => expo(1200, 2.5, ghost && ghost.kind === "arm" && armBlock(ghost) ? armBlock(ghost).arms.length - 1 : 0),
  block: () => expo(600, 1.5, BLOCKS.filter((b) => !b.exp).length - 1), exp: () => priced(1000),
  pads: () => expo(200, 1.4, padSeq - 1), station: () => expo(250, 1.15, PARK.length - 1) + (ghost && ghost.kind === "station" && ghost.hauler ? tractorPrice(ghost.hauler === "auto") : 0), berth: () => expo(2000, 1.75, BERTHS.length - 1),
};
// (owner, 2026-11-05) a platform's upgrades: a row or a column, another arm (each much dearer than the last), another
// drop-off or pickup spot; setting an empty slot's shape again costs a small fee (setting a new one is free)
const growPrice = (b) => expo(300, 1.6, b.grown);
const bayPrice = (b, pickup) => expo(200, 1.8, b.bays.filter((q) => q.pickup === pickup).length - 1), SHAPE_FEE = priced(50);
const tractorPrice = (auto) => priced((400 + 50 * (crafts.filter((t) => t.kind === "yard").length - 1)) * (auto ? 4 : 1));   // (owner) +$50 each; auto ones 4x
// which deck columns an arm works: each column goes to the nearest arm
const colX = (c) => DOCK.x0 + c * HW + HW / 4;
const colOwner = (c) => BERTHS.reduce((m, b) => (!m || Math.abs(colX(c) - b.cx) < Math.abs(colX(c) - m.cx) ? b : m), null);
const craneCols = (b) => { let c0 = -1, c1 = -1; for (let c = 0; c < DOCK.cols; c++) if (colOwner(c) === b) { if (c0 < 0) c0 = c; c1 = c + 1; } return c0 < 0 ? [0, 0] : [c0, c1]; };

// ---- building (owner, 2026-11-05): a blueprint you move about the map, red where it can't go, then buy (✓) or drop (✗).
// Platforms, customer pads and dock stations go anywhere clear (not over the freighter's berth or the loading deck);
// loader arms slide along the spine; drop-off and pickup spots slide along their platform's apron.
const AREA = [X0 + 1, MW - 1, 2, MH];
const LOADING = [DOCK.x0 - 6, DOCK.x0 + DOCK.cols * HW + 6, -30, LANE_Z + 4.5];
const overlaps = (a, b, gap = 0.6) => a[0] < b[1] + gap && b[0] < a[1] + gap && a[2] < b[3] + gap && b[2] < a[3] + gap;
const inside = (a, r) => a[0] >= r[0] && a[1] <= r[1] && a[2] >= r[2] && a[3] <= r[3];
const platRect = (x0, x1, z0, z1) => { const d = deckOf(x0, x1, z0, z1); return [d[0] - SIDE, d[1] + SIDE, d[2], d[3]]; };
const blockRect = (b) => platRect(b.x0, b.x1, b.z0, b.z1);
const padsRect = (x, z) => [x - 3.8, x + 3.8, z - 3.8, z + 3.8];
const stationRect = (x, z) => [x - 1.7, x + 1.7, z - 1.7, z + 1.7];
const armRect = (x, z) => [x - MOUNT, x + MOUNT, z - MOUNT, z + MOUNT];
// (owner, 2026-11-06) the platform an arm blueprint would join: the nearest with a slot in its reach and fewer than 8 arms
function armBlock(g) {
  let best = null, bd = 1e9;
  for (const b of BLOCKS) {
    if (b.arms.length >= MAXARMS) continue;
    let d = 1e9; for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { const [x, z] = slotXY(b, c, r); d = Math.min(d, hyp(x - g.x, z - g.z)); }
    if (d <= REACH && d < bd) { bd = d; best = b; }
  }
  return best;
}
function rects(skip) {
  const out = BLOCKS.filter((b) => b !== skip).map(blockRect);
  for (let g = 0; g < padSeq; g++) { const s = STALLS.filter((q) => q.group === g); out.push(padsRect((s[0].x + s[1].x) / 2, (s[0].z + s[2].z) / 2)); }
  for (const p of PARK) out.push(stationRect(p.x, p.z));
  for (const b of BLOCKS) for (const a of b.arms) out.push(armRect(a.mount.x, a.mount.z));   // a platform's own arms too: it can't grow over them
  return out;
}
const clearAt = (r, skip) => inside(r, AREA) && !overlaps(r, LOADING, 0) && rects(skip).every((o) => !overlaps(r, o));
let ghost = null, managed = null;
function ghostRect(g) {
  if (g.kind === "block" || g.kind === "exp") return platRect(g.x - CELL, g.x + CELL, g.z - CELL, g.z + CELL);
  if (g.kind === "pads") return padsRect(g.x, g.z);
  if (g.kind === "station") return stationRect(g.x, g.z);
  if (g.kind === "arm") return armRect(g.x, g.z);
  if (g.kind === "berth") return [g.x - 2.5, g.x + 2.5, 11.6, LANE_Z + 2];
  return [g.x - 1.3, g.x + 1.3, g.z - 1.3, g.z + 1.3];   // a drop-off or pickup spot
}
function ghostOk(g) {
  if (g.kind === "berth") return BERTHS.every((b) => Math.abs(b.cx - g.x) >= BERTH_GAP);
  if (g.kind === "bay") return g.block.bays.every((q) => q.pickup !== g.pickup || Math.abs(q.x - g.x) >= 3) && g.block.arms.some((a) => reaches(a, g.x, g.z));
  if (g.kind === "exp" && BLOCKS.some((b) => b.exp)) return false;
  if (g.kind === "arm" && !armBlock(g)) return false;
  return clearAt(ghostRect(g));
}
const ghostPrice = (g) => (g.kind === "bay" ? bayPrice(g.block, g.pickup) : PRICES[g.kind]());
const bayRange = (b) => [b.x0 - CELL / 2 + 1.2, b.x1 + CELL / 2 - 1.2];
function ghostMove(x, z) {
  const g = ghost; if (!g) return;
  if (g.kind === "berth") { g.x = clamp(Math.round(x * 2) / 2, SPINE[0], SPINE[1]); g.z = LANE_Z; return; }
  if (g.kind === "bay") { const [a, b] = bayRange(g.block); g.x = clamp(Math.round(x * 2) / 2, a, b); g.z = bayZ(g.block, g.pickup); return; }
  g.x = Math.round(x * 2) / 2; g.z = Math.round(z * 2) / 2;
}
// a new blueprint starts in the middle of the view, or the nearest clear place to it
function startGhost(kind, at, extra) {
  selected = null; managed = null;
  const c = at || (R3.center ? R3.center() : { x: 20, z: 40 });
  ghost = Object.assign({ kind, x: c.x, z: c.z }, extra); ghostMove(c.x, c.z);
  let found = ghostOk(ghost);
  for (let r = 1; r < 70 && !found; r += 1) for (let k = 0; k < 16 && !found; k++) { ghostMove(c.x + r * Math.cos(k / 16 * TAU), c.z + r * Math.sin(k / 16 * TAU)); found = ghostOk(ghost); }
  if (!found) ghostMove(c.x, c.z);
  if (R3.focus) R3.focus(ghost.x, ghost.z);   // the view glides over to it
}
function ghostCancel() { const g = ghost; ghost = null; if (g && g.kind === "bay") managed = g.block; }
function ghostConfirm() {
  const g = ghost; if (!g) return false;
  const p = ghostPrice(g); if (!ghostOk(g) || money < p) { bad = { p: [g.x, 0, g.z], t: 0.5 }; return false; }
  money -= p - (g.hauler ? tractorPrice(g.hauler === "auto") : 0);   // the hauler's part is paid as it's added
  ghost = null;
  if (g.kind === "block" || g.kind === "exp") mkBlock(g.x, g.z, g.kind === "exp");
  else if (g.kind === "pads") mkPads(g.x, g.z);
  else if (g.kind === "station") { const p = mkStation(g.x, g.z); if (g.hauler) addTractor(g.hauler === "auto", p); }
  else if (g.kind === "arm") addArm(armBlock(g), g.x, g.z);
  else if (g.kind === "berth") mkBerth(g.x);
  else { g.block.bays.push({ x: g.x, z: bayZ(g.block, g.pickup), pickup: g.pickup, claim: null }); ver++; managed = g.block; }
  return true;
}
// growing a platform by a row or column on one side
function growRect(b, dir) { let { x0, x1, z0, z1 } = b; if (dir === "e") x1 += CELL; if (dir === "w") x0 -= CELL; if (dir === "s") z1 += CELL; if (dir === "n") z0 -= CELL; return platRect(x0, x1, z0, z1); }
const growOk = (b, dir) => (dir === "e" || dir === "w" ? b.cols : b.rows) < MAXDIM && clearAt(growRect(b, dir), b);
function grow(b, dir) {
  const fill = () => (b.exp ? ANY : null);
  if (dir === "e" || dir === "w") {
    const col = grid(1, b.rows, () => [])[0], sh = grid(1, b.rows, fill)[0];
    if (dir === "e") { b.slots.push(col); b.shapes.push(sh); } else { b.slots.unshift(col); b.shapes.unshift(sh); b.x0 -= CELL; }
    b.cols++;
  } else {
    for (let c = 0; c < b.cols; c++) { if (dir === "s") { b.slots[c].push([]); b.shapes[c].push(fill()); } else { b.slots[c].unshift([]); b.shapes[c].unshift(fill()); } }
    if (dir === "n") b.z0 -= CELL; b.rows++;
  }
  b.grown++; reshape(b);
}
// where another drop-off (or pickup) spot could go: the nearest place to the middle of its apron clear of the others
function freeBayX(b, pickup) {
  const [a, z] = bayRange(b), bz = bayZ(b, pickup), ok = (x) => b.bays.every((q) => q.pickup !== pickup || Math.abs(q.x - x) >= 3) && b.arms.some((m) => reaches(m, x, bz));
  let best = null; for (let x = a; x <= z + 1e-6; x += 0.5) if (ok(x) && (best === null || Math.abs(x - b.cx) < Math.abs(best - b.cx))) best = x;
  return best;
}
// what a managed platform offers: a row or column on each side, another arm, another drop-off and pickup spot
function offers(b) {
  const out = [], d = b.deck, zc = (b.z0 + b.z1) / 2, gp = growPrice(b);
  for (const [dir, x, z] of [["n", b.cx, d[2] - CELL / 2], ["s", b.cx, d[3] + CELL / 2], ["e", d[1] + SIDE + CELL / 2, zc], ["w", d[0] - SIDE - CELL / 2, zc]])
    if ((dir === "e" || dir === "w" ? b.cols : b.rows) < MAXDIM) out.push({ act: "grow", dir, x, z, price: gp, ok: growOk(b, dir) });
  for (const pickup of [false, true]) { const x = freeBayX(b, pickup); if (x !== null) out.push({ act: "bay", pickup, x, z: bayZ(b, pickup), price: bayPrice(b, pickup), ok: true }); }
  return out;
}
function doOffer(o) {
  const b = managed; if (!b) return;
  if (o.act === "bay") { startGhost("bay", { x: o.x, z: o.z }, { block: b, pickup: o.pickup }); return; }
  if (!o.ok || money < o.price) { bad = { p: [o.x, 0, o.z], t: 0.5 }; return; }
  money -= o.price; grow(b, o.dir);
}
// (owner, 2026-11-05) tapping a slot of a managed platform turns its shape: circle, square, hexagon. A slot with no shape
// yet is set for free; changing one costs a small fee and only while it's empty.
function turnShape(b, c, r, at) {
  if (b.exp) return false;
  const s = b.shapes[c][r], st = b.slots[c][r];
  if (s !== null && (st.length || b.arms.some((a) => a.cr.res && a.cr.res.has(st)) || money < SHAPE_FEE)) { bad = { p: at, t: 0.5 }; return false; }
  if (s !== null) money -= SHAPE_FEE;
  b.shapes[c][r] = s === null ? 0 : (s + 1) % SHAPES.length; ver++; return true;
}
// (owner, 2026-11-01) two kinds of hauler: manual (you send it: a freighter container, then a platform) and auto (you
// assign it a platform and it shuttles by itself). (owner, 2026-11-06) a hauler is only bought with its own dock station:
// + Manual and + Auto put a dock station blueprint out, and buying it brings the hauler on it.
function addTractor(auto, at) {
  const price = tractorPrice(auto), p = at || PARK.find((q) => !q.own); if (money < price || !p || p.own) return false;
  money -= price; const t = mkCraft("yard", { x: p.x, y: HOVER, z: p.z }); t.num = crafts.filter((q) => q.kind === "yard").length; t.auto = !!auto;
  p.own = t; if (!p.claim) { t.park = p; p.claim = t; }
  return true;
}
const AUTO_CAB = "#5fd3d0", EXP_CAB = "#8a94a6", WAIT_CAB = "#5a6068", MANUAL_CAB = "#e8b432";
const floats = [];   // "+$60" over a paid ship

// ---- stacks ----
const count = (b) => b.slots.reduce((a, col) => a + col.reduce((s, st) => s + st.length, 0), 0);
// (owner) every container is its own: { id, c (color), s (shape), wantedBy (the customer that came for it) }
let boxSeq = 0;
const box = (c, s) => ({ id: ++boxSeq, c, s, wantedBy: null });
const holds = (b, x) => b.slots.some((col) => col.some((st) => st.includes(x)));
// room for a container of shape s (any, without one) in the slots that take deliveries (in reach of an arm that also
// reaches a drop-off spot)
const freeFor = (b, s) => { const ins = reachOf(b).inS; let n = 0; for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { const h = b.shapes[c][r]; if (ins[c][r] && h !== null && (s === undefined || h === ANY || h === s)) n += 3 - b.slots[c][r].length; } return n; };
const free = (b) => freeFor(b);
const impCount = (st) => (st.length && !st[0].exp ? st.length : 0);   // a deck stack holds imports or exports, never both
const shipCount = (s) => s.bays.reduce((a, st) => a + impCount(st), 0);

// the start: arm, platform (rows of circles, squares and hexagons), pads, a dock station
mkBerth(DOCK.x0 + 3 * HW);
{ const b = mkBlock(10, 34, false); b.shapes.forEach((col) => col.forEach((_, r) => (col[r] = r))); addArm(b, b.deck[1] + MOUNT + 0.7, (b.z0 + b.z1) / 2);
  for (let n = 0; n < 8 + Math.floor(rnd() * 4); n++) { const c = Math.floor(rnd() * b.cols), r = Math.floor(rnd() * b.rows); if (b.slots[c][r].length < 3) b.slots[c][r].push(box(randColor(), b.shapes[c][r])); } }
mkPads(10, 55); mkStation(-8, 16);

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
  s.bays.forEach((st, k) => { if (!onDeck(s, k)) return; const n = Math.floor(rnd() * 4); for (let q = 0; q < n; q++) st.push(box(randColor(), randShape())); });
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
const trips = (f) => crafts.reduce((n, t) => n + (t.cmd && f(t.cmd) ? 1 : 0) + t.queue.filter(f).length, 0);
const expClaims = (b) => trips((a) => a.kind === "rtg" && a.pickup && a.block === b && !a.served);
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
// or in storage, that nobody else is waiting for. One whose container is stored, with a pickup spot of its platform free,
// flies straight there; any other waits on a pad.
// (owner) dynamic: the fuller storage is with containers nobody has claimed, the more customers come
const unclaimedFill = () => { const n = BLOCKS.filter((b) => b.open && !b.exp).reduce((a, b) => a + b.cols * b.rows * 3, 0); return n ? storedFree().length / n : 0; };
const storedFree = () => { const out = []; for (const b of BLOCKS) if (b.open && !b.exp) { const os = reachOf(b).outS; b.slots.forEach((col, c) => col.forEach((st, r) => { if (os[c][r]) for (const x of st) if (!x.wantedBy) out.push(x); })); } return out; };
const shipFree = () => { const out = [], s = DOCK.ship; if (s && s.state === "docked") for (const st of s.bays) for (const x of st) if (!x.exp && !x.wantedBy) out.push(x); return out; };
function spawnCustomer() {
  const pool = shipFree().concat(storedFree()); if (!pool.length) return;
  const want = pick(pool), b = BLOCKS.find((q) => q.open && holds(q, want)), bay = b && !pickupLine(b) && freeBay(b, true, { kind: "cust", want });
  if (bay) { const t = mkCraft("cust", spawnPoint(), want); want.wantedBy = t; bay.claim = t; startCmd(t, { kind: "rtg", block: b, bay }); return; }
  const stall = STALLS.slice().reverse().find((q) => q.open && !q.claim); if (!stall) return;
  const t = mkCraft("cust", spawnPoint(), want); want.wantedBy = t;
  stall.claim = t; t.cmd = { kind: "park", stall };
}
// what a hauler will carry once its queue is done: null, "imp" or "exp"
function loadAfter(t) { let l = t.load ? (t.load.exp ? "exp" : "imp") : null; for (const a of t.cmd ? [t.cmd, ...t.queue] : t.queue) l = a.kind === "deliver" ? null : a.kind === "sts" ? (a.pick === false ? null : "imp") : a.kind === "rtg" ? (t.kind === "cust" ? "imp" : a.pickup ? "exp" : null) : l; return l; }
// (owner) export ships bring a container for the export platform (when it's open, has room and a bay free), drop it and leave
function spawnExport() {
  const b = BLOCKS.find((q) => q.exp && q.open); if (!b) return;
  if (free(b) - crafts.filter((t) => t.kind === "exp" && t.load).length <= 0) return;
  const bay = freeBay(b, false, { kind: "exp", load: { exp: true } }); if (!bay) return;
  const t = mkCraft("exp", spawnPoint(), null); t.load = box(randColor(), randShape()); t.load.exp = true;
  bay.claim = t; startCmd(t, { kind: "rtg", block: b, bay });
}
// what tapping something sends a ship to: a freighter slot (which stack its arm takes from), an arm (any), a platform,
// a customer pad
function targetOf(pk) {
  if (!pk) return null;
  if (pk.slot !== undefined) { const s = DOCK.ship; if (!s || s.state !== "docked" || !onDeck(s, pk.slot)) return null; const c = pk.slot % DOCK.cols, b = BERTHS.find((q) => q.open && c >= craneCols(q)[0] && c < craneCols(q)[1]); return b ? { kind: "sts", berth: b, slot: pk.slot } : null; }
  if (pk.berth) return pk.berth.open ? { kind: "sts", berth: pk.berth } : null;
  if (pk.block) return pk.block.open ? { kind: "rtg", block: pk.block } : null;
  if (pk.stall) return pk.stall.open ? { kind: "park", stall: pk.stall } : null;
  return null;
}
// (owner) a ship can only be sent where it can be served: an empty hauler to an arm with a freighter to unload (or to a
// slot with a container not yet claimed), a loaded one to a platform with room, a customer to the platform holding its
// container, or (customers only) a free pad. Queued trips count first.
function planFor(t, g) {
  if (!g || t.gone || t.exiting) return null;
  let la = loadAfter(t); const loaded = la !== null, acts = t.cmd ? [t.cmd, ...t.queue] : t.queue;
  if (t.kind === "cust" && acts.some((a) => a.kind === "rtg")) return null;
  if (g.kind === "park") return t.kind === "cust" && !g.stall.claim ? { kind: "park", stall: g.stall } : null;
  // (owner) a hauler can be given pickups one after another: if it would be carrying an import (or, for the export
  // platform, anything), a drop-off step goes in first
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
  if (t.kind === "yard" && b.exp) return la === null && count(b) - expClaims(b) > 0 && shipTakesExports() ? pre({ kind: "rtg", block: b, pickup: true }) : null;
  // (owner, 2026-11-05) a loaded hauler only to a platform with a free slot of its container's shape
  if (t.kind === "yard") { const known = t.load && !t.load.exp && !acts.some((q) => q.kind === "sts"); return la === "imp" && (known ? freeFor(b, t.load.s) : free(b)) > 0 ? { kind: "rtg", block: b } : null; }
  if (loaded || !holds(b, t.want)) return null;
  const bay = !pickupLine(b) && freeBay(b, true, t);
  return bay ? { kind: "rtg", block: b, bay } : null;
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
// a bay is free when nobody has it and no other ship is hovering in it
const bayBusy = (bay, t) => crafts.some((q) => q !== t && !q.gone && q.y < 5 && hyp(q.x - bay.x, q.z - bay.z) < 2);
// (owner, 2026-11-06) a spot is only given to a ship an arm there can serve: a customer's container in reach of an arm
// that reaches the spot; a delivery with a free slot of its shape in reach of one; an export pickup with exports in reach
function bayOk(b, bay, who) {
  const R = reachOf(b);
  for (const o of R.arm) {
    if (!reaches(o.a, bay.x, bay.z)) continue;
    if (!who) return true;
    for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) {
      if (!o.slots[c][r]) continue; const st = b.slots[c][r];
      if (bay.pickup) { if (who.kind === "cust" ? st.includes(who.want) : st.length) return true; }
      else if (st.length < 3 && b.shapes[c][r] !== null && (!who.load || who.load.exp || fits(b, c, r, who.load))) return true;
    }
  }
  return false;
}
const freeBay = (b, pickup, who) => b.bays.find((bay) => bay.pickup === !!pickup && !bay.claim && !bayBusy(bay) && bayOk(b, bay, who));
function freeBays() {
  for (const b of BLOCKS) for (const bay of b.bays) {
    const t = bay.claim; if (!t) continue;
    const going = !t.gone && ((t.cmd && t.cmd.bay === bay) || t.queue.some((a) => a.bay === bay));
    if (!going && (t.gone || hyp(t.x - bay.x, t.z - bay.z) > 3 || t.y > 5)) bay.claim = null;
  }
}
// (owner) a platform's 5 bays are one line: a hauler heading there waits in it until a bay clears, first come first served
function fillBays() {
  for (const b of BLOCKS) {
    if (!b.open) continue;
    b.line = b.line.filter((t) => !t.gone && t.cmd && t.cmd.kind === "rtg" && t.cmd.block === b && !t.cmd.bay);
    for (const t of b.line.slice()) {
      const a = t.cmd, bay = freeBay(b, isPickup(t, a), t);
      if (bay) { unwait(a); b.line = b.line.filter((q) => q !== t); bay.claim = t; a.bay = bay; continue; }
      // somewhere to wait: (a hauler) a free dock station
      if (!a.waitPad && t.kind === "yard") { const p = nearPad(t); if (p) { p.claim = t; a.waitPad = p; } }
    }
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
const pickupLine = (b) => b.line.some((q) => isPickup(q, q.cmd));
function leaveLines(t) {
  unwait(t.cmd);
  if (t.lane) { t.lane.q = t.lane.q.filter((x) => x !== t); t.lane = null; }
  for (const b of BLOCKS) if (b.line.includes(t)) b.line = b.line.filter((x) => x !== t);
}
function startCmd(t, a) {
  leaveLines(t);
  if (a.kind === "sts") { const l = laneFor(a.berth, t); l.q.push(t); t.lane = l; }
  else if (a.kind === "rtg" && !a.bay) { const pu = isPickup(t, a), bay = freeBay(a.block, pu, t); if (bay && !a.block.line.some((q) => isPickup(q, q.cmd) === pu)) { bay.claim = t; a.bay = bay; } else a.block.line.push(t); }
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
// (owner) a customer whose container is in storage goes to that platform by itself from its pad, once a bay there is free
function custStep(t) {
  if (t.kind !== "cust" || t.exiting || t.load !== null || t.queue.length || t.cmd || !t.stall) return;
  const b = BLOCKS.find((q) => q.open && holds(q, t.want)); if (!b) return;
  const bay = !pickupLine(b) && freeBay(b, true, t);
  if (bay) { bay.claim = t; startCmd(t, { kind: "rtg", block: b, bay }); }
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
// (owner) an auto hauler with a platform assigned: loaded, it takes the container there; empty, it fetches from the
// freighter (a container a customer is waiting for if one is in reach and unclaimed, otherwise whatever its arm takes)
function autoStep(t) {
  if (!t.auto || !t.home || t.load || t.cmd || t.queue.length || t.locked) return;
  const s = DOCK.ship;
  if (t.home.exp) { if (t.home.open && count(t.home) - expClaims(t.home) > 0 && shipTakesExports()) enqueue(t, { kind: "rtg", block: t.home, pickup: true }); return; }
  const bs = BERTHS.filter((b) => berthLeft(b) > 0).sort((a, b) => laneFor(a, t).q.length - laneFor(b, t).q.length); if (!bs.length) return;
  for (const b of bs) { const [c0, c1] = craneCols(b); for (let k = 0; k < s.bays.length; k++) { const st = s.bays[k], x = st.find((q) => q.wantedBy), c = k % DOCK.cols; if (x && !x.exp && c >= c0 && c < c1 && impCount(st) - s.claims[k] > 0 && !BERTHS.some((q) => q.crane.slot === k)) { enqueue(t, { kind: "sts", berth: b, slot: k }); return; } } }
  enqueue(t, { kind: "sts", berth: bs[0] });
}
// (owner) a loaded hauler with nothing queued takes its container where it goes: an import to a platform with room (an
// auto hauler's own, otherwise the nearest), an export to an arm with room for it on the freighter
function deliverAction(t, pickIt) {
  if (t.load.exp) { const ok = BERTHS.filter((b) => exportRoom(b) > 0).sort((a, b) => laneFor(a, t).q.length - laneFor(b, t).q.length); if (!ok.length) return null; const b = ok.find((q) => berthLeft(q) > 0) || ok[0]; return { kind: "sts", berth: b, exp: true, pick: pickIt && berthLeft(b) > 0 }; }
  const own = t.auto && t.home && !t.home.exp && t.home.open && freeFor(t.home, t.load.s) > 0 ? t.home : null;
  const dest = own || (t.auto && t.home && !t.home.exp ? null : BLOCKS.filter((b) => b.open && !b.exp && freeFor(b, t.load.s) > 0).reduce((m, b) => (!m || Math.abs(b.cx - t.x) + b.line.length * 6 < Math.abs(m.cx - t.x) + m.line.length * 6 ? b : m), null));
  return dest ? { kind: "rtg", block: dest } : null;
}
function deliverStep(t) {
  if (t.kind !== "yard" || !t.load || t.cmd || t.queue.length || t.locked) return;
  const a = deliverAction(t, true); if (a) enqueue(t, a);
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
    if (t.kind === "yard" && t.cmd && t.cmd.kind === "rtg" && (t.cmd.pickup ? t.load !== null : t.load === null || t.load.exp || freeFor(t.cmd.block, t.load.s) <= 0)) { leaveLines(t); t.cmd = null; }
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
  const s = DOCK.ship, [c0, c1] = craneCols(b), h = s.bays.map((st) => st.length), out = [];
  for (let m = 0; m < n; m++) {
    let best = -1, bd = 1e9;
    s.bays.forEach((st, j) => { const c = j % DOCK.cols; if (j === k || c < c0 || c >= c1 || !onDeck(s, j) || h[j] >= 3 || !impCount(st) || st.some((x) => x.claimedBy) || BERTHS.some((q) => q.crane.slot === j)) return; const d = h[j] * 3 + slotDist(j, k) + (st.some((x) => x.wantedBy) ? 20 : 0); if (d < bd) { bd = d; best = j; } });
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
// (owner, 2026-11-05) whether a container has a slot of its shape waiting for it: in an auto hauler's platform, else any
const roomFor = (t, x) => (t.auto && t.home && !t.home.exp ? freeFor(t.home, x.s) > 0 : BLOCKS.some((b) => !b.exp && freeFor(b, x.s) > 0));
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
        s.bays.forEach((st, k) => { const q = shipSlot(k); if (!onDeck(s, k) || q.c < c0 || q.c >= c1 || st.length >= 3 || impCount(st)) return; const p = slotPos(k), d = hyp(p.x - ref[0], p.z - ref[1]); if (d < ed) { ed = d; es = k; } });
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
  s.bays.forEach((st, k) => { if (k === src || !inCols(k) || st.length >= 3 || (st.length && !impCount(st)) || st.some((x) => x.wantedBy) || busy(k)) return; const d = [3, 0, 8][st.length] + slotDist(k, src); if (d < dd) { dd = d; dst = k; } });
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
  const canTake = (k) => h(k) && !top(k).wantedBy && !top(k).claimedBy, canTo = (k) => !s.bays[k].some((x) => x.wantedBy || x.claimedBy);
  let src = -1, dst = -1, best = 1e9;
  for (const a of ks) if (h(a) === 3 && canTake(a)) for (const z of ks) if (z !== a && h(z) < 2 && canTo(z)) { const d = (h(z) === 1 ? 0 : 20) + slotDist(a, z); if (d < best) { best = d; src = a; dst = z; } }
  if (src < 0) for (const a of ks) if (h(a) === 1 && canTake(a)) for (const z of ks) if (z !== a && h(z) === 1 && canTo(z) && col(z) < col(a)) { const d = slotDist(a, z); if (d < best) { best = d; src = a; dst = z; } }
  if (src < 0) return false;
  cr.ops = [{ to: sxz(src) }, { lift: { stack: s.bays[src] } }, { to: sxz(dst) }, { lower: { stack: s.bays[dst] } }];
  return true;
}
// a platform's arms: each serves the ships at the spots in its reach one at a time, moving as little as it can (owner):
// it stays where it finished; at the drop-off spots it unloads a hauler next, out over the stacks it digs for a customer
// next; and a hauler's container goes down in a slot of its shape, as low as it can (owner, 2026-11-06), near the
// container the next customer wants (never on it). (owner, 2026-11-05) Each keeps off the stacks the others are working.
// (owner, 2026-11-06) It only works the slots and spots in its reach; with nobody to serve, it flattens its stacks out.
function rtgStep(b, dt) {
  for (const a of b.arms) {
    const cr = a.cr, taken = (st) => b.arms.some((o) => o !== a && o.cr.res && o.cr.res.has(st));
    if (!cr.ops.length && !cr.truck) { const did = (b.exp ? exportServe : serve)(b, a, taken); if (!did && !b.exp) flatten(b, a, taken); }
    craneStep(cr, dt, () => { cr.res = null; });
  }
}
const cellOf = (b, x) => { for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) if (b.slots[c][r].includes(x)) return [c, r]; return null; };
function serve(b, a, taken) {
  const cr = a.cr, R = armReach(b, a), inR = (c, r) => R[c][r];
  const ready = crafts.filter((q) => q.cmd && q.cmd.kind === "rtg" && q.cmd.block === b && q.cmd.bay && !q.locked && atSpot(q) && reaches(a, q.cmd.bay.x, q.cmd.bay.z));
  const srcOf = (t) => { let src = null, fewest = 1e9; for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { if (!inR(c, r)) continue; const st = b.slots[c][r], k = st.indexOf(t.want); if (k >= 0 && st.length - 1 - k < fewest) { fewest = st.length - 1 - k; src = [c, r]; } } return src && { src, fewest }; };
  const roomIn = (x) => { for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) if (inR(c, r) && b.slots[c][r].length < 3 && fits(b, c, r, x) && !taken(b.slots[c][r])) return true; return false; };
  const L = ready.filter((q) => q.kind === "cust" && q.load === null && srcOf(q) && !taken(b.slots[srcOf(q).src[0]][srcOf(q).src[1]]));
  const U = ready.filter((q) => q.kind === "yard" && q.load !== null && !q.load.exp && roomIn(q.load));
  for (const q of ready) if (q.cmd.readyAt === undefined) q.cmd.readyAt = clock;
  const age = (q) => (clock - q.cmd.readyAt) * 2, near = (list, f) => list.reduce((m, q) => (!m || f(q) - age(q) < f(m) - age(m) ? q : m), null);
  const toTruck = (q) => Math.abs(q.x - cr.x) + Math.abs(q.z - cr.z), toSrc = (q) => { const [c, r] = srcOf(q).src, [x, z] = slotXY(b, c, r); return Math.abs(x - cr.x) + Math.abs(z - cr.z); };
  const atDrops = cr.z < b.z0 - CELL / 2, nu = near(U, toTruck), nl = near(L, toSrc);
  const t = atDrops ? nu || nl : nl || nu; if (!t) return false;
  const at = () => [t.x, t.z];
  if (t.kind === "yard") {
    const cs = ready.filter((q) => q.kind === "cust" && q.load === null && srcOf(q)), next = near(cs, (q) => Math.abs(q.x - t.x)), hint = next && srcOf(next).src;
    let best = null, bs = 1e9;
    for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) {
      const st = b.slots[c][r]; if (!inR(c, r) || st.length >= 3 || !fits(b, c, r, t.load) || taken(st) || (hint && c === hint[0] && r === hint[1])) continue;
      const [x, z] = slotXY(b, c, r), d = hint ? hyp(x - slotXY(b, ...hint)[0], z - slotXY(b, ...hint)[1]) : Math.abs(x - t.x) + (z - b.z0) * 0.6;
      const sc = st.length * 8 + d + (st.some((q) => q.wantedBy) ? 8 : 0); if (sc < bs) { bs = sc; best = [c, r]; }
    }
    if (!best) return false;
    const st = b.slots[best[0]][best[1]]; t.locked = true; cr.truck = t; cr.res = new Set([st]); cr.ops = [{ to: at }, { lift: { truck: t }, then: () => { cr.truck = null; doneServing(t); } }, { to: slotXY(b, best[0], best[1]) }, { lower: { stack: st } }];   // (owner) the hauler leaves once its container is lifted
    return true;
  }
  // the ones on top of it are set aside first, each in a slot of its own shape (in reach)
  const { src, fewest } = srcOf(t), ops = [], h = b.slots.map((col) => col.map((st) => st.length)), sst = b.slots[src[0]][src[1]], res = new Set([sst]);
  for (let n = 0; n < fewest; n++) {
    const x = sst[sst.length - 1 - n]; let dst = null, ds = 1e9;
    for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { const st = b.slots[c][r]; if (st === sst || !inR(c, r) || h[c][r] >= 3 || !fits(b, c, r, x) || taken(st)) continue; const [px, pz] = slotXY(b, c, r), [sx, sz] = slotXY(b, src[0], src[1]), sc = h[c][r] * 2.5 + hyp(px - sx, pz - sz); if (sc < ds) { ds = sc; dst = [c, r]; } }
    if (!dst) return false;   // nowhere to set it aside right now: try again later
    h[src[0]][src[1]]--; h[dst[0]][dst[1]]++; res.add(b.slots[dst[0]][dst[1]]);
    ops.push({ to: slotXY(b, src[0], src[1]) }, { lift: { stack: sst } }, { to: slotXY(b, dst[0], dst[1]) }, { lower: { stack: b.slots[dst[0]][dst[1]] } });
  }
  ops.push({ to: slotXY(b, src[0], src[1]) }, { lift: { stack: sst } }, { to: at }, { lower: { truck: t }, then: () => { cr.truck = null; doneServing(t); } });
  t.locked = true; cr.truck = t; cr.res = res; cr.ops = ops;
  return true;
}
// (owner, 2026-11-06) an arm with nobody to serve flattens its stacks out: it takes the top container off a tall stack
// (one burying a container a customer wants first) and sets it on a stack of the same shape at least two lower. It
// never moves a wanted container or puts anything on one, and keeps off stacks other arms are working.
function flatten(b, a, taken) {
  const cr = a.cr, R = armReach(b, a), os = reachOf(b).outS;   // (one that can be handed out stays where it can be)
  let best = null, bs = 1e9;
  for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) {
    const st = b.slots[c][r], top = st[st.length - 1]; if (!R[c][r] || st.length < 2 || top.wantedBy || taken(st)) continue;
    const buries = st.some((x) => x.wantedBy), [sx, sz] = slotXY(b, c, r);
    for (let c2 = 0; c2 < b.cols; c2++) for (let r2 = 0; r2 < b.rows; r2++) {
      const d = b.slots[c2][r2]; if (!R[c2][r2] || (os[c][r] && !os[c2][r2]) || d === st || d.length > st.length - 2 || !fits(b, c2, r2, top) || d.some((x) => x.wantedBy) || taken(d)) continue;
      const [dx, dz] = slotXY(b, c2, r2), sc = -st.length * 4 - (buries ? 20 : 0) + d.length * 4 + hyp(dx - sx, dz - sz) * 0.3 + hyp(sx - cr.x, sz - cr.z) * 0.1;
      if (sc < bs) { bs = sc; best = [st, d, [sx, sz], [dx, dz]]; }
    }
  }
  if (!best) return false;
  const [st, d, p1, p2] = best;
  cr.res = new Set([st, d]); cr.ops = [{ to: p1 }, { lift: { stack: st } }, { to: p2 }, { lower: { stack: d } }];
  return true;
}
// the export platform's arms: take containers off export ships (onto a low stack near the drop-off spots) and put one onto
// each empty hauler at a pickup spot (off the top of a tall stack nearby; exports are all alike, so no digging)
function exportServe(b, a, taken) {
  const cr = a.cr, R = armReach(b, a);
  const ready = crafts.filter((q) => q.cmd && q.cmd.kind === "rtg" && q.cmd.block === b && q.cmd.bay && !q.locked && atSpot(q) && reaches(a, q.cmd.bay.x, q.cmd.bay.z));
  const U = ready.filter((q) => q.kind === "exp" && q.load !== null), L = ready.filter((q) => q.kind === "yard" && q.load === null);
  for (const q of ready) if (q.cmd.readyAt === undefined) q.cmd.readyAt = clock;
  const sc = (q) => Math.abs(q.x - cr.x) - (clock - q.cmd.readyAt) * 2, near = (list) => list.reduce((m, q) => (!m || sc(q) < sc(m) ? q : m), null);
  const pickFor = (t) => {
    let best = null, bs = 1e9;
    for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) {
      const st = b.slots[c][r]; if (!R[c][r] || taken(st)) continue;
      const [x, z] = slotXY(b, c, r), d = Math.abs(x - t.x) + (t.kind === "exp" ? z - b.z0 : b.z1 - z) * 0.6;
      const s2 = t.kind === "exp" ? (st.length >= 3 ? 1e9 : st.length * 2.5 + d) : (!st.length ? 1e9 : -st.length * 2.5 + d);
      if (s2 < bs) { bs = s2; best = [st, x, z]; }
    }
    return bs < 1e9 ? best : null;
  };
  const atDrops = cr.z < b.z0 - CELL / 2, order = atDrops ? [near(U), near(L)] : [near(L), near(U)];
  for (const t of order) {
    const p = t && pickFor(t); if (!p) continue;
    const [st, bx, bz] = p, at = () => [t.x, t.z], done = () => { cr.truck = null; doneServing(t); };
    t.locked = true; cr.truck = t; cr.res = new Set([st]);
    if (t.kind === "exp") cr.ops = [{ to: at }, { lift: { truck: t }, then: done }, { to: [bx, bz] }, { lower: { stack: st } }];
    else { t.cmd.served = true; cr.ops = [{ to: [bx, bz] }, { lift: { stack: st } }, { to: at }, { lower: { truck: t }, then: done }]; }
    return true;
  }
  return false;
}

// ---- input (the 3D view works out what's under the pointer and calls these) ----
let selected = null, hover = null, bad = null;
addEventListener("keydown", (e) => { if (e.code === "Escape") { selected = null; managed = null; ghostCancel(); managed = null; } const n = /^Digit([1-9])$/.exec(e.code); if (n) { const t = crafts.find((q) => q.num === +n[1]); if (t) selected = t; } });
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
// an auto hauler is assigned a platform by tapping it
const homeFor = (t, g) => (t.kind === "yard" && t.auto && g && g.kind === "rtg" ? g.block : null);
// (owner, 2026-11-01) everything is one tap: tap a ship to select it (again to let go), tap where it goes to queue it, tap
// a numbered badge of its queue to take that trip back, tap empty space to let go of it. (owner, 2026-11-05) With nothing
// selected, tap a platform to manage it (its offers, and tapping its slots turns their shape). While a blueprint is out,
// a tap moves it there (or buys it, or drops it).
function click(sx, sy) {
  const pk = pickAt(sx, sy);
  if (ghost) {
    if (pk && pk.ghostYes) ghostConfirm(); else if (pk && pk.ghostNo) ghostCancel();
    else { const g = R3.ground ? R3.ground(sx, sy) : null; if (g) ghostMove(g.x, g.z); }
    return;
  }
  if (pk && pk.offer) { doOffer(pk.offer); return; }
  if (pk && pk.badge) { unqueue(selected, pk.badge.a); return; }
  if (pk && pk.truck) { managed = null; selected = selected === pk.truck ? null : pk.truck; return; }
  if (managed && pk && pk.block === managed && pk.cell) { turnShape(managed, pk.cell[0], pk.cell[1], pk.at); return; }
  managed = null;
  if (!selected) { if (pk && pk.block) managed = pk.block; return; }
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
  if (a.kind === "rtg") return a.bay ? { x: a.bay.x, y: 0.05, z: a.bay.z, r: 1.3 } : { x: a.block.cx, y: 0.05, z: (a.block.z0 + a.block.z1) / 2, r: 6.5 };
  if (a.kind === "park") return { x: a.stall.x, y: 0.05, z: a.stall.z, r: 1.5 };
  if (a.kind === "tpark") return { x: a.spot.x, y: 0.05, z: a.spot.z, r: 1.5 };
  return null;
}
// where a container is, if anywhere
function boxAt(x) {
  if (!x) return null;   // (bug 2026-11-05) a grey customer that hasn't picked yet has no container (an empty hauler's load is null too)
  for (const b of BLOCKS) for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) { const st = b.slots[c][r], i = st.indexOf(x); if (i >= 0) { const [px, pz] = slotXY(b, c, r); return [px, i * PH + PH / 2, pz]; } }
  const s = DOCK.ship; if (s) for (let n = 0; n < s.bays.length; n++) { const i = s.bays[n].indexOf(x); if (i >= 0) { const p = slotPos(n); return [p.x, i * PH + PH / 2, p.z]; } }
  for (const t of crafts) if (t.load === x) return [t.x, t.y - CARRY, t.z];
  for (const cr of [...BERTHS.map((b) => b.crane), ...BLOCKS.flatMap((b) => b.arms.map((a) => a.cr))]) if (cr.hold === x) return [cr.x, 3.2, cr.z];
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
const BUILD = [["block", "Platform"], ["exp", "Export platform"], ["arm", "Robot arm"], ["pads", "Pads"], ["station", "Dock station"], ["berth", "Loader arm"]];
function hud() {
  const sp0 = expo(250, 1.15, PARK.length - 1), p = tractorPrice(false) + sp0, pa = tractorPrice(true) + sp0, sp = true, pr = BUILD.map(([k]) => (k === "arm" ? priced(1200) : PRICES[k]()));
  const txt = [money, p, sp, pr.join(), BLOCKS.some((b) => b.exp)].join("|"); if (txt === hudTxt) return; hudTxt = txt;
  $("money").textContent = "$" + money.toLocaleString();
  for (const [id, name, q] of [["buy-tractor", "Manual", p], ["buy-auto", "Auto", pa]]) { const b = $(id); b.textContent = "+ " + name + " $" + q.toLocaleString(); b.disabled = !sp || money < q; }
  BUILD.forEach(([k, name], i) => { const b = $("build-" + k); if (!b) return; b.textContent = name + " $" + pr[i].toLocaleString(); b.disabled = money < pr[i] || (k === "exp" && BLOCKS.some((q) => q.exp)); });
}
$("buy-tractor").onclick = () => startGhost("station", null, { hauler: "manual" });
$("buy-auto").onclick = () => startGhost("station", null, { hauler: "auto" });
for (const [k] of BUILD) { const b = $("build-" + k); if (b) b.onclick = () => startGhost(k); }

// ---- loop ----
let last = performance.now();
function step(dt) {
  clock += dt;
  shipStep(dt); syncClaims(); trimPromises(); for (const b of BERTHS) if (b.open) stsStep(b, dt);
  fillLanes(); freeBays(); fillBays(); for (const b of BLOCKS) if (b.open) rtgStep(b, dt);
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
  addMoney: (n) => (money += n), addTractor, startGhost, ghostMove, ghostConfirm, ghostCancel, ghostOk, grow, growOk, addArm, armBlock, offers, doOffer, turnShape,
  manage: (b) => (managed = b), mkBlock, mkBerth, mkPads, mkStation,
  get money() { return money; }, get state() { return { crafts, dock: DOCK, berths: BERTHS, blocks: BLOCKS, stalls: STALLS, park: PARK, delivered, selected, ghost, managed }; }, get exported() { return exported; },
  step, planFor, targetOf, enqueue, unqueueLast, slotSwap, doSwap, select: (t) => (selected = t), atSpot, spotOf, freeFor, click,
};
// what the 3D view reads and calls
R3.game = {
  HR, HW, RZ, PH, HOVER, CARRY, X0, MW, MH, LANE_Z, LANE_BACK, CELL, SIDE, REACH, MOUNT, ANY, SHAPES, COLORS, AUTO_CAB, EXP_CAB, WAIT_CAB, MANUAL_CAB,
  BLOCKS, BERTHS, DOCK, STALLS, PARK, floats,
  get trucks() { return crafts; }, get selected() { return selected; }, get hover() { return hover; }, get bad() { return bad; },
  get money() { return money; }, get clock() { return clock; }, get ver() { return ver; }, get ghost() { return ghost; }, get managed() { return managed; },
  slotPos, slotXY, shipSlot, onDeck, spotMark, boxAt, flashing, posRGB, targetOf, planFor, slotSwap, homeFor, craneCols, laneFor, cellAt,
  ghostRect, ghostOk, ghostPrice, ghostMove, offers, growRect, armBlock, armReach,
  click, unclaimAt, rightClick: () => { if (ghost) { ghostCancel(); return; } if (!selected || !unqueueLast(selected)) { selected = null; managed = null; } },
  hoverAt: (sx, sy) => { hover = pickAt(sx, sy); },
  noHover: () => { hover = null; },
};
})();
