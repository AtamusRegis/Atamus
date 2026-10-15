// The 3D world (owner, 2026-10-12: the game rebuilt in 3D, one shared world, no POIs).
// Flat ground plane. One sphere per account, 100 m in diameter, moving on the XY plane
// only (no Z). The border is the same flat-top hexagon, 126 km flat to flat. Everyone
// within its load circle sees each other. Positions persist per account.
import { pool } from "../db.js";
import { safeText } from "../textsafe.js";

export const HEX_FLAT = 2_500;             // 2.5 km flat to flat "for now" (owner, 2026-10-13; was 126 km)
export const SPHERE_R = 50;                  // the player sphere: 100 m in diameter (owner)
// (owner, 2026-10-14) all movement cut to 25% to slow the game down: speed, thrust, braking, the stop distance, the swing
export const SPEED = 50;                     // m/s on the ground (owner: 300, then 200, now 50)
// (owner, 2026-10-13) weight: the ship accelerates toward its input; full ACCEL when the nose points where
// it's being pushed, down to TURN_ACCEL of it when pushing against the nose (it has to come round first)
export const ACCEL = 50;                     // m/s^2: 0 to full speed in 1 s straight
export const BRAKE = 100;                    // m/s^2 (owner): letting go of WASD stops faster than it accelerates, however the nose points
// (owner, 2026-10-13) "no matter the speed, stop within 100 m": when WASD is let go the braking rate is fixed for that stop
// at whichever is harder, BRAKE or the rate that stops the current speed in STOP_D (v^2 / 2 STOP_D); held constant,
// it brings the ship to rest within STOP_D. Pressing WASD again ends the stop.
export const STOP_D = 25;
export const SPRINT = 1.3;                   // (owner, 2026-10-13) sprint is 30% faster (was double), forward only
// (owner, 2026-10-13) top speed by direction relative to the nose: forward 100%, sideways and backward 60%, blended
// (diagonal ~88%). "Forward" for sprinting means within FWD_ARC. (owner, 2026-10-13) Not aiming, every push is forward
// (WASD turns the ship that way); aiming, forward is toward the reticle.
export const SIDE_SPEED = 0.6, FWD_ARC = Math.PI / 4;
export const dirSpeed = (d) => SIDE_SPEED + (1 - SIDE_SPEED) * Math.max(0, Math.cos(d));
const wrapA = (a) => { a %= Math.PI * 2; return a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a; };
export const TURN_ACCEL = 0.3;
// (owner, 2026-10-13) the capacitor, 0-100: sprinting drains it; moving without sprinting recharges it slowly,
// sitting still faster. Run dry and sprint stays off until it's back to CAP_RESUME.
export const CAP_MAX = 100, CAP_DRAIN = 1, CAP_WALK = 4, CAP_IDLE = 12, CAP_RESUME = 15;
// (owner, 2026-10-13) CAP_DRAIN is per 100 m sprinted (was 20 a second): 1% of the bar for every 100 m covered
// (owner, 2026-10-13) the load circle: each player is sent only the players and objects within this distance of their
// ship. (owner, 2026-10-14) It's where the client's distance haze turns solid (the 700 m leash circle + 200 m + 400 m),
// so things load in while still hidden and nothing beyond it is sent at all. Keep it equal to the client's FAR_OUT.
export const LOAD_R = 1300;
// (owner, 2026-10-14) ship bumps: the bounce (0 = dead stop, 1 = full rebound), the closing speed that does no damage
// (m/s), and damage per m/s above it; health
export const BUMP_E = 0.5, BUMP_SAFE = 15, BUMP_DMG = 0.4, HP_MAX = 100;
// (owner, 2026-10-14) the railgun (left click): a fast projectile from the ship's pivot toward the pointer, stopped by the
// first block, Build piece (their Combat Points) or ship (the ship's Combat Points) it meets; a ship hit takes RAIL_DMG. A ship
// the shooter can't see by line of sight (blocks and Build pieces; clouds don't count here) isn't hit: it flies through.
export const RAIL_RANGE = 1000, RAIL_DMG = 25, RAIL_CD = 0.5, RAIL_SPEED = 700;   // (owner, 2026-10-14: every half second)
// (owner, 2026-10-14) spread: each shot widens the shooter's cone by SPREAD_ADD degrees each way, and it narrows back by
// SPREAD_BACK degrees a second; a shot leaves at a random angle inside the cone as it was (the server's dice, not the client's)
export const SPREAD_ADD = 1.5, SPREAD_BACK = 3, SPREAD_MAX = 45;   // (owner, 2026-10-14: 1.5 degrees a shot, was 3)
export const spreadNow = (p, now = Date.now(), back = SPREAD_BACK) => Math.max(0, (p.spread || 0) - back * (now - (p.spreadT || now)) / 1000);
// (owner, 2026-10-14) weapons, made and tuned in the staff Weapon panel (Z): each field with its limits and default (the
// Railgun's). optimal: full damage out to it (m; the aim line's length); falloff: % of the damage lost per 100 m past it;
// life: s before the bullet's gone; speed: m/s; rate: s between shots; dmg: per hit; spread0: the cone's least half-angle
// (degrees); spreadAdd: degrees more each way per shot; aimSpeed: degrees a second it narrows back; rotSpeed: degrees a
// second the aim line turns toward the pointer; reload: s to reload once the magazine's empty; mag: shots per magazine.
export const WEAPON_FIELDS = [["optimal", 50, 3000, 1000], ["falloff", 0, 100, 10], ["life", 0.1, 10, 1.43], ["speed", 50, 3000, 700], ["rate", 0.05, 10, 0.5],
  ["dmg", 0, 1000, 25], ["spread0", 0, 45, 0], ["spreadAdd", 0, 20, 1.5], ["aimSpeed", 0, 90, 3], ["rotSpeed", 1, 1440, 360], ["reload", 0, 20, 2], ["mag", 1, 500, 20]];
export const WEAPON_TYPES = ["bullet"];
export function cleanWeapon(o) {               // a weapon from the panel, checked as hostile; null if unusable
  if (!o || typeof o !== "object") return null;
  const name = safeText(String(o.name || ""), 32).trim(); if (!name) return null;
  const w = { name, type: WEAPON_TYPES.includes(o.type) ? o.type : "bullet", icon: iconRef(o.icon) };
  for (const [k, lo, hi, d] of WEAPON_FIELDS) { const v = Number(o[k]); w[k] = Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; if (k === "mag") w[k] = Math.round(w[k]); else w[k] = Math.round(w[k] * 1000) / 1000; }
  return w;
}
// (owner, 2026-10-14) a reference to an icon (its id), or null
export const iconRef = (v) => (typeof v === "string" && /^[0-9]{1,9}$/.test(v) ? v : null);
// (owner, 2026-10-15) items (the Item Creator's Create New Item): a name and an icon; the Item Editor adds its type (one
// of ITEM_TYPES, or none yet) and whether it stacks (stack) and how many to a slot (max, 2-9,999; 1 when it doesn't)
export const ITEM_TYPES = ["raw", "component"];   // Raw Resource, Component
export function cleanItem(o) {
  if (!o || typeof o !== "object") return null;
  const name = safeText(String(o.name || ""), 32).trim(); if (!name) return null;
  const stack = o.stack === true, mx = Math.floor(Number(o.max));
  return { name, icon: iconRef(o.icon), type: ITEM_TYPES.includes(o.type) ? o.type : null, stack, max: stack ? (Number.isFinite(mx) ? Math.max(2, Math.min(9999, mx)) : 100) : 1 };
}
// (owner, 2026-10-14) icons (the Icon Creator): shapes on a 64 x 64 grid, kept as data (never raw SVG), checked as hostile.
// Each shape: t "ellipse" p [cx, cy, rx, ry], t "poly" p [x, y, ...] (3-24 points) or (owner, 2026-10-15) t "line", the
// Pen's open outline-only line, p [x, y, ...] (2-24 points); its fill (fon: on, fc: #rrggbb, fo:
// how solid, 0-1) and outline (son: on, sc: #rrggbb, sw: thickness 0-8). Listed bottom layer first. At most 40 shapes (a save must fit one 16 KB message).
export const ICON_SHAPES = ["ellipse", "poly", "line"], ICON_MAX = 40, ICON_PTS = 24;
export function cleanIcon(o) {
  const v = o && Array.isArray(o.shapes) ? o.shapes : null; if (!v || !v.length || v.length > ICON_MAX) return null;
  const col = (c) => (typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : null), r2 = (x) => Math.round(x * 100) / 100;
  const out = [];
  for (const s of v) {
    if (!s || typeof s !== "object" || !ICON_SHAPES.includes(s.t) || !Array.isArray(s.p)) return null;
    if (s.t === "ellipse" ? s.p.length !== 4 : s.p.length < (s.t === "line" ? 4 : 6) || s.p.length > ICON_PTS * 2 || s.p.length % 2) return null;
    const p = s.p.map(Number), fo = Number(s.fo), sw = Number(s.sw); if (!p.every(Number.isFinite) || !Number.isFinite(fo) || !Number.isFinite(sw)) return null;
    const fc = col(s.fc), sc = col(s.sc); if (!fc || !sc) return null;
    let q = p.map((x) => Math.round(Math.max(-16, Math.min(80, x)) * 10) / 10);
    if (s.t === "ellipse") q = [q[0], q[1], Math.max(0.5, q[2]), Math.max(0.5, q[3])];
    out.push({ t: s.t, p: q, fon: !!s.fon, fc, fo: r2(Math.max(0, Math.min(1, fo))), son: !!s.son, sc, sw: r2(Math.max(0, Math.min(8, sw))) });
  }
  return { shapes: out };
}
export const CATALOG_CAP = 500;                // items and icons: at most this many each
export const falloffAt = (w, d) => (d <= w.optimal ? 1 : Math.max(0, 1 - (w.falloff / 100) * (d - w.optimal) / 100));
export const PIV_W = 0.2, VIS_LO = 0.25;
// (owner, 2026-10-14) a ship that respawns materializes: a hologram revealed front to back that then solidifies, SPAWN_MS
// in all; until then it can't move, turn or fire (and, half there, takes no damage)
export const SPAWN_MS = 3000;
export const spawning = (p) => !!p.spawnUntil && Date.now() < p.spawnUntil;
// (owner, 2026-10-14) placed (test) ships' behavior: a route (a loop of points around their spawn, which is where the piece
// was placed; meters from it) they fly, and "attack player": shoot at players they can see nearby. A route ship that goes
// after a player remembers where it left its route and chases up to BOT_LEASH from there; past that it goes back.
export const BOT_LEASH = 400, BOT_TURN = 0.9, BOT_CD = 1.6, BOT_ARRIVE = 35, BOT_STANDOFF = 220;
// (owner, 2026-10-14) the test ships see players by the clouds' rules too: a ship in a cloud fades from its edge to
// unseen 150 m in (one in the same cloud within 200 m that's moving still shows faintly), and a cloud's core (150 m and
// more in) blocks sight through it unless the looker is inside that cloud
export const CLOUD_DEEP = 150, CLOUD_NEAR = 200;
export function inPoly(x, y, v) { let c = false; for (let i = 0, n = v.length; i < n; i += 2) { const ax = v[i], ay = v[i + 1], bx = v[(i + 2) % n], by = v[(i + 3) % n]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; }
export function edgeDist(x, y, v) { let best = Infinity; for (let i = 0, n = v.length; i < n; i += 2) { const ax = v[i], ay = v[i + 1], ex = v[(i + 2) % n] - ax, ey = v[(i + 3) % n] - ay, L2 = ex * ex + ey * ey || 1e-9; const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L2)); best = Math.min(best, Math.hypot(x - ax - ex * t, y - ay - ey * t)); } return best; }
// (owner, 2026-10-14) a route's corners are rounded so ships curve through them instead of stopping to turn: each corner is
// cut up to ROUTE_CUT before and after the point (at most half of either leg) and joined by a curve through it. The same
// smoothing draws the route on screen (build3d.js), so the ship flies what's drawn.
export const ROUTE_CUT = 90, ROUTE_LOOK = 110;
export function smoothRoute(P) {               // P: the loop's points (world); returns the rounded loop as points
  const n = P.length; if (n < 3) return P.slice();
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i + n - 1) % n], v = P[i], z = P[(i + 1) % n];
    const l1 = Math.hypot(v[0] - a[0], v[1] - a[1]) || 1, l2 = Math.hypot(z[0] - v[0], z[1] - v[1]) || 1, c1 = Math.min(ROUTE_CUT, l1 / 2), c2 = Math.min(ROUTE_CUT, l2 / 2);
    const s0 = [v[0] - (v[0] - a[0]) / l1 * c1, v[1] - (v[1] - a[1]) / l1 * c1], s1 = [v[0] + (z[0] - v[0]) / l2 * c2, v[1] + (z[1] - v[1]) / l2 * c2];
    for (let k = 0; k <= 8; k++) { const t = k / 8, u = 1 - t; out.push([u * u * s0[0] + 2 * u * t * v[0] + t * t * s1[0], u * u * s0[1] + 2 * u * t * v[1] + t * t * s1[1]]); }
  }
  return out;
}
export function cleanRoute(pts) {
  if (!Array.isArray(pts) || pts.length < 1 || pts.length > 32) return null;
  const out = [];
  for (const q of pts) { if (!Array.isArray(q) || q.length !== 2) return null; const [x, y] = q.map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([Math.round(Math.max(-3000, Math.min(3000, x)) * 10) / 10, Math.round(Math.max(-3000, Math.min(3000, y)) * 10) / 10]); }
  return out;
}   // mutual visibility, as the client works it out: below VIS_LO a ship isn't drawn   // (2026-10-14: scaled with the slower speeds, so hits hurt as much as before)
// the acceleration share for a push at angle d (radians) off the nose: 1 straight, ~0.48 side-on, 0.3 reversing
// (owner, 2026-10-13: reversing while moving was far slower than stopping and then going) one step of the velocity
// toward the target (tx, ty): the part of the change that SLOWS the current motion (against the velocity) brakes at
// up to `brake`; the rest (the new direction) thrusts at up to `a`. Reversing then works like letting go and pushing.
export const VEL_TURN = 0.875;               // rad/s: how fast held WASD swings the motion round (owner, 2026-10-14: was 8, then 3.5 for a slight drift, then cut to 25%)
// (owner, 2026-10-13: "keep momentum in the new direction with a quick rotation") while WASD is held the velocity keeps
// its speed and swings toward the input's direction at VEL_TURN (the nose's own turn rate), instead of braking the old
// motion and building up again. Its speed meanwhile eases toward the target: up at `up`, down at `down`. From rest it
// starts straight along the input. A near-reversal (over 150 degrees) swings round the side the nose is turning to
// (`nose`: the ship's heading, same convention), so the ship and its motion turn together.
export function carry(vx, vy, dx, dy, target, up, down, dt, nose) {
  let v = Math.hypot(vx, vy);
  const want = Math.atan2(dx, -dy), T2 = Math.PI * 2, wrap = (q) => { q %= T2; return q > Math.PI ? q - T2 : q < -Math.PI ? q + T2 : q; };
  let va = v > 1 ? Math.atan2(vx, -vy) : want;
  const d = wrap(want - va);
  let sign = Math.sign(d), left = Math.abs(d);
  // (owner, 2026-10-14) with ship-relative controls, pushing more than 120 degrees against the motion (S while flying
  // forward) brakes it and then builds up the other way, instead of swinging the motion round in a long U-turn
  if (left > Math.PI * 2 / 3 && v > 1) return steer(vx, vy, Math.sin(want) * target, -Math.cos(want) * target, up, down, dt);
  va += sign * Math.min(left, VEL_TURN * dt);
  v = v < target ? Math.min(target, v + up * dt) : Math.max(target, v - down * dt);
  return [Math.sin(va) * v, -Math.cos(va) * v];
}
export function steer(vx, vy, tx, ty, a, brake, dt) {
  let ex = tx - vx, ey = ty - vy;
  const v = Math.hypot(vx, vy);
  if (v > 1e-6) {
    const ux = vx / v, uy = vy / v, par = ex * ux + ey * uy;
    if (par < 0) {                             // slowing down along the current motion
      const bx = ux * par, by = uy * par, px = ex - bx, py = ey - by;
      const bl = -par, bs = Math.max(a, brake) * dt, pl = Math.hypot(px, py), ps = a * dt;
      const kb = bl > bs ? bs / bl : 1, kp = pl > ps ? ps / pl : 1;
      return [vx + bx * kb + px * kp, vy + by * kb + py * kp];
    }
  }
  const el = Math.hypot(ex, ey), s = a * dt;
  if (el > s) { ex *= s / el; ey *= s / el; }
  return [vx + ex, vy + ey];
}
// (owner, 2026-10-13) colliders, on the ground plane only (x / y; height is ignored). A ship's footprint is SHIP_R x 2
// square (its Movement ellipse is a fraction of that, Object Editor); each block a square BLOCK_HALF from its center.
// Overlaps are pushed apart along the shortest way (satPush) and the velocity going in is dropped. Mirrored in the client.
export const SHIP_R = 45, BLOCK_HALF = 25;
// (owner, 2026-10-13) the admin Build menu's pieces: a shape (square, cylinder or triangle) with a footprint w (east-west)
// by d (north-south) in meters, turned r radians (counterclockwise seen from above), BUILD_H tall, kept in the database.
// Ships collide with them like blocks: the footprint as a convex polygon (the cylinder as a 24-sided ellipse).
// (owner, 2026-10-15) the built-in kinds are now only the test ship and clouds (the square, cylinder and triangle are gone;
// their pieces stay in the database, unused); everything else is an object type from the Object Creator, keyed "t:<id>"
export const KINDS = ["ship", "cloud"], BUILD_H = 50, BUILD_MIN = 5, BUILD_MAX = 1000, BUILD_CAP = 3000;
// (owner, 2026-10-14) each kind's collider outline, in the model's own frame as fractions of its footprint (x across
// its width w, y along its depth d; a test ship's footprint is SHIP_R x 2 square). The Object Editor ([X]) can change
// them (any simple outline, concave allowed). (owner) They start as a 4-corner rectangle around the object: the
// shapes' own square, the ship model's 59.4 x 100 m box.
const box = (hx, hy) => [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
// (owner, 2026-10-14) the combat points are parts: each an outline with a type (body, main engine, left engine, right
// engine, weapon emplacement), hit separately. For now every part's hit is plain HP damage.
export const PART_TYPES = ["body", "main", "left", "right", "weapon"];
export const COLL_DEFAULT = { square: [{ t: "body", pts: box(0.5, 0.5) }], triangle: [{ t: "body", pts: box(0.5, 0.5) }], cylinder: [{ t: "body", pts: box(0.5, 0.5) }], ship: [{ t: "body", pts: box(0.33, 0.5556) }] };
// (owner, 2026-10-14) each kind's visibility points (Object Editor, Visibility tab): placed freely; each sends a line to the
// other ship's pivot in the mutual visibility test. They start at the box's corners and side middles.
const boxPts = (hx, hy) => [[-hx, -hy], [0, -hy], [hx, -hy], [hx, 0], [hx, hy], [0, hy], [-hx, hy], [-hx, 0]];
export const VIS_DEFAULT = { square: boxPts(0.5, 0.5), triangle: boxPts(0.5, 0.5), cylinder: boxPts(0.5, 0.5), ship: boxPts(0.33, 0.5556) };
// (owner, 2026-10-14) each kind's pivot: the point of the model it turns around, in the same fractions. A piece's
// position (x, y) is where its pivot is; the model and its outline sit around it. Default: the middle.
export function toWorldPts(o, loc, pv) {              // fractions of the footprint, around the pivot, into the world
  const c = Math.cos(o.r), s = Math.sin(o.r), out = [];
  for (const [ux, uy] of loc) { const lx = (ux - pv[0]) * o.w, ly = (uy - pv[1]) * o.d; out.push(o.x + lx * c - ly * s, o.y + lx * s + ly * c); }
  return out;
}
// the combat-points parts in the world, one outline [x0, y0, x1, y1, ...] each (owner, 2026-10-14: they decide line of sight)
export function buildPolys(o, coll, piv) { const pv = (piv && piv[o.k]) || [0, 0]; return ((coll && coll[o.k]) || COLL_DEFAULT[o.k] || COLL_DEFAULT.square).map((p) => toWorldPts(o, p.pts, pv)); }
// (owner, 2026-10-14) the movement collider (ships bump into it): an oval, a box or a capsule (a stadium along its longer
// side) filling the box x0..x1 by y0..y1, in the same fractions; each side moves on its own. It starts as the
// footprint's own oval. In the world, its outline (always convex).
export const MOVE_SHAPES = ["oval", "box", "capsule"];
const mv0 = () => ({ s: "oval", x0: -0.5, x1: 0.5, y0: -0.5, y1: 0.5 });
export const MOVE_DEFAULT = { square: mv0(), triangle: mv0(), cylinder: mv0(), ship: mv0() };
export function moveLoc(m) {                   // its outline in the model's fractions: [[x, y], ...] counterclockwise
  const cx = (m.x0 + m.x1) / 2, cy = (m.y0 + m.y1) / 2, hx = (m.x1 - m.x0) / 2, hy = (m.y1 - m.y0) / 2, out = [];
  if (m.s === "box") return [[m.x0, m.y0], [m.x1, m.y0], [m.x1, m.y1], [m.x0, m.y1]];
  if (m.s === "capsule") {                     // two half circles (radius: half the short side) joined by straight sides
    const r = Math.min(hx, hy), ax = hx - r, ay = hy - r, a0 = hx > hy ? -Math.PI / 2 : 0;
    for (const [sx, sy, a] of [[cx + ax, cy + ay, a0], [cx - ax, cy - ay, a0 + Math.PI]]) for (let i = 0; i <= 12; i++) out.push([sx + Math.cos(a + i * Math.PI / 12) * r, sy + Math.sin(a + i * Math.PI / 12) * r]);
    return out;
  }
  for (let i = 0; i < 24; i++) out.push([cx + Math.cos(i * Math.PI / 12) * hx, cy + Math.sin(i * Math.PI / 12) * hy]);
  return out;
}
export function movePoly(o, mov, piv) {
  return toWorldPts(o, moveLoc((mov && mov[o.k]) || MOVE_DEFAULT[o.k] || MOVE_DEFAULT.square), (piv && piv[o.k]) || [0, 0]);
}
export function cleanMove(m) {                 // a submitted movement collider, checked as hostile (the old ellipse [cx, cy, rx, ry] is read as an oval)
  if (Array.isArray(m)) { if (m.length !== 4) return null; const v = m.map(Number); if (!v.every(Number.isFinite)) return null;
    m = { s: "oval", x0: v[0] - Math.abs(v[2]), x1: v[0] + Math.abs(v[2]), y0: v[1] - Math.abs(v[3]), y1: v[1] + Math.abs(v[3]) }; }
  if (!m || typeof m !== "object" || !MOVE_SHAPES.includes(m.s)) return null;
  const v = [m.x0, m.x1, m.y0, m.y1].map(Number); if (!v.every(Number.isFinite)) return null;
  const r4 = (x) => Math.round(x * 10000) / 10000, cl = (x) => Math.max(-1.5, Math.min(1.5, x)), side = (a, b) => { a = cl(a); b = cl(b); if (b < a) [a, b] = [b, a]; if (b - a < 0.04) { if (a + 0.04 <= 1.5) b = a + 0.04; else a = b - 0.04; } return [r4(a), r4(b)]; };
  const [x0, x1] = side(v[0], v[1]), [y0, y1] = side(v[2], v[3]);
  return { s: m.s, x0, x1, y0, y1 };
}
export function cleanPivot(pv) {               // a submitted pivot, checked as hostile: two finite numbers inside +-1.5
  if (!Array.isArray(pv) || pv.length !== 2) return null; const [x, y] = pv.map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.round(Math.max(-1.5, Math.min(1.5, x)) * 10000) / 10000, Math.round(Math.max(-1.5, Math.min(1.5, y)) * 10000) / 10000];
}
export function polyRad(o, v) { let r = 0; for (let i = 0; i < v.length; i += 2) r = Math.max(r, Math.hypot(v[i] - o.x, v[i + 1] - o.y)); return r; }
// (owner, 2026-10-14) ships collide by their Movement ellipse (as a 24-sided outline, turned with the heading): convex
// outline against convex outline by separating axes. Returns how to push A out of B ({ nx, ny, d }) or null.
export function satPush(A, B) {
  let best = Infinity, bx = 0, by = 0;
  for (const P of [A, B]) for (let i = 0; i < P.length; i += 2) {
    let nx = -(P[(i + 3) % P.length] - P[i + 1]), ny = P[(i + 2) % P.length] - P[i]; const L = Math.hypot(nx, ny); if (L < 1e-9) continue; nx /= L; ny /= L;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < A.length; k += 2) { const t = A[k] * nx + A[k + 1] * ny; if (t < a0) a0 = t; if (t > a1) a1 = t; }
    for (let k = 0; k < B.length; k += 2) { const t = B[k] * nx + B[k + 1] * ny; if (t < b0) b0 = t; if (t > b1) b1 = t; }
    const o = Math.min(a1, b1) - Math.max(a0, b0); if (o <= 0) return null;
    if (o < best) { best = o; bx = nx; by = ny; }
  }
  const [ax, ay] = polyMid(A), [cx, cy] = polyMid(B); if ((ax - cx) * bx + (ay - cy) * by < 0) { bx = -bx; by = -by; }
  return { nx: bx, ny: by, d: best };
}
// where a segment first meets an outline (0..1 along it), or null
export function segPoly(x0, y0, x1, y1, v) {
  let best = null; const dx = x1 - x0, dy = y1 - y0;
  for (let i = 0, n = v.length; i < n; i += 2) {
    const ax = v[i], ay = v[i + 1], ex = v[(i + 2) % n] - ax, ey = v[(i + 3) % n] - ay, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - x0) * ey - (ay - y0) * ex) / den, u = ((ax - x0) * dy - (ay - y0) * dx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}
export function polyMid(v) { let x = 0, y = 0; for (let i = 0; i < v.length; i += 2) { x += v[i]; y += v[i + 1]; } return [x * 2 / v.length, y * 2 / v.length]; }
export function nudge(p, n, d) {               // move p by d along n, dropping the part of its velocity going back in
  p.x += n.nx * d; p.y += n.ny * d;
  const vn = (p.vx || 0) * n.nx + (p.vy || 0) * n.ny; if (vn < 0) { p.vx -= vn * n.nx; p.vy -= vn * n.ny; }
}
export const squarePoly = (x, y, h) => [x - h, y - h, x + h, y - h, x + h, y + h, x - h, y + h];
// a submitted outline, checked as hostile: 3-64 points (visibility points: 1-32), finite, inside +-1.5 of the footprint; null if unusable
export function cleanColl(pts, min = 3, max = 64) {
  if (!Array.isArray(pts) || pts.length < min || pts.length > max) return null;
  const out = [];
  for (const q of pts) { if (!Array.isArray(q) || q.length !== 2) return null; const [x, y] = q.map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([Math.round(Math.max(-1.5, Math.min(1.5, x)) * 10000) / 10000, Math.round(Math.max(-1.5, Math.min(1.5, y)) * 10000) / 10000]); }
  return out;
}
// (owner, 2026-10-14) submitted combat-points parts, checked as hostile: 1-8 parts, each a known type and an outline (a bare
// outline, the old format, is one Body part)
export function cleanParts(v) {
  if (Array.isArray(v) && Array.isArray(v[0])) { const c = cleanColl(v); return c ? [{ t: "body", pts: c }] : null; }
  if (!Array.isArray(v) || v.length < 1 || v.length > 8) return null;
  const out = [];
  for (const p of v) { if (!p || typeof p !== "object" || !PART_TYPES.includes(p.t)) return null; const c = cleanColl(p.pts); if (!c) return null; out.push({ t: p.t, pts: c }); }
  return out;
}
// (owner, 2026-10-14) nebula clouds: an outline of 3-64 points in meters around the cloud's pivot (|coord| up to 3,000),
// turned by r and scaled by w / 100; CLOUD_THEMES color themes. They don't block movement, sight or aim.
export const CLOUD_THEMES = 5;
export function cleanCloud(pts) {
  if (!Array.isArray(pts) || pts.length < 3 || pts.length > 64) return null;
  const out = [];
  for (const q of pts) { if (!Array.isArray(q) || q.length !== 2) return null; const [x, y] = q.map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([Math.round(Math.max(-3000, Math.min(3000, x)) * 10) / 10, Math.round(Math.max(-3000, Math.min(3000, y)) * 10) / 10]); }
  return out;
}
export function cloudPoly(b) { const s = b.w / 100, c = Math.cos(b.r), n = Math.sin(b.r), out = []; for (const [lx, ly] of b.extra.pts) { const x = lx * s, y = ly * s; out.push(b.x + x * c - y * n, b.y + x * n + y * c); } return out; }
// ---- (owner, 2026-10-15) object types (the Object Creator, head admin): "Create Resource Node" makes one: a name, an icon,
// its model (an uploaded GLB, by file name) and the resource it yields (an item); its colliders are the Object Editor's,
// under the type's key ("t:<id>"). Everything about a placed one (size, scale, spin, bob, ore, respawn, its spawn zone)
// is the Object Placer's.
export const TYPE_CATS = ["node"];
export const isTypeKey = (k) => typeof k === "string" && /^t:[0-9]{1,9}$/.test(k);
export const modelRef = (v) => (typeof v === "string" && /^[0-9a-f]{24}\.glb$/.test(v) ? v : null);
export function cleanType(o) {
  if (!o || typeof o !== "object") return null;
  const name = safeText(String(o.name || ""), 32).trim(); if (!name) return null;
  const model = modelRef(o.model);
  return { name, cat: TYPE_CATS.includes(o.cat) ? o.cat : "node", model, mname: model ? safeText(String(o.mname || ""), 64).trim() : "", icon: iconRef(o.icon), item: iconRef(o.item) };
}
// a placed resource node's settings (the Object Placer, owner 2026-10-15): its size (m across: its footprint), how fast it
// turns (deg/s) and bobs (bobs a second) between two heights (m), the ore it holds now (amount; rolled in the range when it
// spawns, at most the max), the ore it spawns with (min-max), its respawn time (s) and its spawn zone: an outline of 3-32
// points in meters around it (where it respawns)
export function cleanNode(e, w) {
  e = e && typeof e === "object" ? e : {};
  const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.round(Math.max(lo, Math.min(hi, v)) * 100) / 100 : d; };
  const int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d));
  const size = num(e.size, BUILD_MIN, BUILD_MAX, w || 60), min = int(e.min, 1, 99999, 50), max = Math.max(min, int(e.max, 1, 99999, 100));
  const bmin = num(e.bmin, -500, 500, 0), bmax = Math.max(bmin, num(e.bmax, -500, 500, 10));
  let zone = null;
  if (Array.isArray(e.zone) && e.zone.length >= 3 && e.zone.length <= 32) { zone = []; for (const q of e.zone) { if (!Array.isArray(q) || q.length !== 2) { zone = null; break; } const [x, y] = q.map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) { zone = null; break; } zone.push([Math.round(Math.max(-3000, Math.min(3000, x)) * 10) / 10, Math.round(Math.max(-3000, Math.min(3000, y)) * 10) / 10]); } }
  if (!zone) zone = [[-size, -size], [size, -size], [size, size], [-size, size]];
  const amount = e.amount == null || !Number.isFinite(Number(e.amount)) ? null : Math.min(max, int(e.amount, 0, 99999, 0));
  return { size, spin: num(e.spin, -720, 720, 10), bob: num(e.bob, 0, 5, 0.3), bmin, bmax, amount, min, max, respawn: int(e.respawn, 0, 86400, 300), zone };
}
export const buildMsg = (b) => (b.extra ? [b.id, b.k, b.x, b.y, b.w, b.d, b.r, b.extra] : [b.id, b.k, b.x, b.y, b.w, b.d, b.r]);
export const accelShare = (d) => TURN_ACCEL + (1 - TURN_ACCEL) * ((1 + Math.cos(d)) / 2) ** 2;
const A = HEX_FLAT / 2 - SPHERE_R;           // inner apothem: the sphere's edge stops on the line
const SQ3 = Math.sqrt(3);
const TICK = 1 / 20;                         // the simulation runs at 20 Hz, as before

// Inside the flat-top hexagon (flat edges top and bottom, points left and right), inset by the sphere's radius.
export function inside(x, y) {
  return Math.abs(y) <= A && Math.abs(SQ3 * x + y) <= 2 * A && Math.abs(SQ3 * x - y) <= 2 * A;
}

export class World3D {
  constructor() {
    this.players = new Map();
    this.blocks = [];                        // (owner, 2026-10-13) blocks dropped with X: { id, x, y, owner }, everyone's, kept until a restart
    this.blockSeq = 1;
    this.weapons = new Map();                // (owner, 2026-10-14) id -> weapon (the Weapon panel's)
    this.catalog = new Map(); this.icons = new Map(); this.types = new Map();   // types: (owner, 2026-10-15) id -> object type   // (owner, 2026-10-15) id -> item (the Item Creator's), id -> icon
    this.hits = []; this.projs = []; this.projSeq = 1; this.projEv = [];   // (owner, 2026-10-14) railgun projectiles in flight, and this tick's starts / ends for the clients
                             // (owner, 2026-10-14) this tick's ship impacts, for the clients' sparks
    this.builds = new Map(); this.colliders = {}; this.pivots = {}; this.origins = {}; this.movers = {}; this.visOutlines = {};   // colliders: (owner, 2026-10-14) the Object Editor's outlines by kind                 // (owner, 2026-10-13) Build menu pieces: id -> { id, k, x, y, w, d, r, poly, rad, dirty }                // id -> { id, name, x, y, dx, dy, dirty }
    this.ready = this._ensure();
    this._saver = setInterval(() => this.saveDirty().catch((e) => console.error("world3d save", e)), 10_000);
    this._saver.unref && this._saver.unref();
  }
  async _ensure() {
    await pool.query(`CREATE TABLE IF NOT EXISTS world3d (
      user_id TEXT PRIMARY KEY,
      x DOUBLE PRECISION NOT NULL,
      y DOUBLE PRECISION NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await pool.query(`ALTER TABLE world3d ADD COLUMN IF NOT EXISTS team TEXT`);   // (owner, 2026-10-13) the side, remembered
    await pool.query(`CREATE TABLE IF NOT EXISTS world3d_builds (
      id BIGSERIAL PRIMARY KEY, k TEXT NOT NULL, x DOUBLE PRECISION NOT NULL, y DOUBLE PRECISION NOT NULL,
      w DOUBLE PRECISION NOT NULL, d DOUBLE PRECISION NOT NULL, r DOUBLE PRECISION NOT NULL, by_user TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS world3d_colliders (k TEXT PRIMARY KEY, pts JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    // (owner, 2026-10-14) the weapons (the Weapon panel); the Railgun is made the first time
    await pool.query(`CREATE TABLE IF NOT EXISTS world3d_weapons (id SERIAL PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    let wr = (await pool.query(`SELECT id, data FROM world3d_weapons ORDER BY id`)).rows;
    if (!wr.length) { await pool.query(`INSERT INTO world3d_weapons (data) VALUES ($1)`, [JSON.stringify(cleanWeapon({ name: "Railgun" }))]); wr = (await pool.query(`SELECT id, data FROM world3d_weapons ORDER BY id`)).rows; }
    for (const o of wr) { const w = cleanWeapon(o.data); if (w) this.weapons.set(String(o.id), { id: String(o.id), ...w }); }
    // (owner, 2026-10-15) items and icons (the Item Creator). The first time, the ammo made in the old Weapon panel becomes
    // items (its table is left as it was)
    const fresh = !(await pool.query(`SELECT to_regclass('world3d_items') AS t`)).rows[0].t;
    await pool.query(`CREATE TABLE IF NOT EXISTS world3d_items (id SERIAL PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    if (fresh && (await pool.query(`SELECT to_regclass('world3d_ammo') AS t`)).rows[0].t) await pool.query(`INSERT INTO world3d_items (data) SELECT data FROM world3d_ammo ORDER BY id`);
    await pool.query(`CREATE TABLE IF NOT EXISTS world3d_icons (id SERIAL PRIMARY KEY, data JSONB NOT NULL, by_user TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    for (const o of (await pool.query(`SELECT id, data FROM world3d_icons ORDER BY id`)).rows) { const ic = cleanIcon(o.data); if (ic) this.icons.set(String(o.id), { id: String(o.id), ...ic }); }
    for (const o of (await pool.query(`SELECT id, data FROM world3d_items ORDER BY id`)).rows) { const a = cleanItem(o.data); if (a) this.catalog.set(String(o.id), { id: String(o.id), ...a }); }
    await pool.query(`CREATE TABLE IF NOT EXISTS world3d_types (id SERIAL PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);   // (owner, 2026-10-15) object types
    for (const o of (await pool.query(`SELECT id, data FROM world3d_types ORDER BY id`)).rows) { const t = cleanType(o.data); if (t) this.types.set(String(o.id), { id: String(o.id), ...t }); }
    await pool.query(`ALTER TABLE world3d_colliders ADD COLUMN IF NOT EXISTS pivot JSONB`);   // (owner, 2026-10-14) the kind's pivot
    await pool.query(`ALTER TABLE world3d_colliders ADD COLUMN IF NOT EXISTS mover JSONB`);   // (owner, 2026-10-14) its movement ellipse
    await pool.query(`ALTER TABLE world3d_colliders ADD COLUMN IF NOT EXISTS vis JSONB`);     // (owner, 2026-10-14) its visibility points
    await pool.query(`ALTER TABLE world3d_colliders ADD COLUMN IF NOT EXISTS origin JSONB`);  // (owner, 2026-10-14) its Weapon Origin (where line of sight starts)
    await pool.query(`ALTER TABLE world3d_colliders ADD COLUMN IF NOT EXISTS parts JSONB`);   // (owner, 2026-10-14) its combat-points parts (pts keeps the first part's outline)
    for (const o of (await pool.query(`SELECT k, pts, parts, pivot, origin, mover, vis FROM world3d_colliders`)).rows) {
      if (!this.kindOk(o.k)) continue; const c = cleanParts(o.parts) || cleanParts(o.pts), pv = cleanPivot(o.pivot), wo = cleanPivot(o.origin), mv = cleanMove(o.mover), vs = cleanColl(o.vis, 1, 32); if (c) this.colliders[o.k] = c; if (pv) this.pivots[o.k] = pv; if (wo) this.origins[o.k] = wo; if (mv) this.movers[o.k] = mv; if (vs) this.visOutlines[o.k] = vs;
    }
    await pool.query(`ALTER TABLE world3d_builds ADD COLUMN IF NOT EXISTS extra JSONB`);   // (owner, 2026-10-14) a nebula cloud's outline and color theme
    const { rows } = await pool.query(`SELECT id, k, x, y, w, d, r, extra FROM world3d_builds`);
    for (const o of rows) { const b = this._clean(o); if (b) this._put(String(o.id), b); }
  }

  // (owner, 2026-10-13) the side this account last chose, or null
  async savedTeam(id) {
    await this.ready;
    const { rows } = await pool.query(`SELECT team FROM world3d WHERE user_id = $1`, [String(id)]);
    const t = rows[0] && rows[0].team; return t === "red" || t === "blue" ? t : null;
  }

  async join(id, name, team, resetPos = false) {   // resetPos: (owner) "Reset location" on the Welcome back page: back near the center
    id = String(id);
    let p = this.players.get(id);
    if (p) { p.name = name; p.team = team; if (resetPos) this.respawn(id); return p; }
    await this.ready;
    const { rows } = await pool.query(`SELECT x, y FROM world3d WHERE user_id = $1`, [id]);
    let x, y;
    if (!resetPos && rows[0] && inside(rows[0].x, rows[0].y)) ({ x, y } = rows[0]);
    else { const a = Math.random() * Math.PI * 2, d = Math.random() * 300; x = Math.cos(a) * d; y = Math.sin(a) * d; }
    p = { id, name, team, x, y, dx: 0, dy: 0, dirty: true };
    await this._save(p).catch((e) => console.error("world3d join", e));   // remembers the side at once   // team: "red" | "blue", picked every time they enter (owner)
    this.players.set(id, p);
    return p;
  }

  // (owner, 2026-10-13) admin actions: put a ship somewhere (stopped), or back at the spawn area near the center
  teleport(id, x, y) {
    const p = this.players.get(String(id)); if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (!inside(x, y)) { const k = 0.98 * (A / Math.max(Math.abs(y), Math.abs(SQ3 * x + y) / 2, Math.abs(SQ3 * x - y) / 2, 1)); x *= Math.min(1, k); y *= Math.min(1, k); }
    p.x = x; p.y = y; p.vx = p.vy = 0; p.dx = p.dy = 0; p.brakeA = 0; p.dirty = true; return p;
  }
  respawn(id) {                              // (owner, 2026-10-14) and it materializes there (SPAWN_MS)
    const a = Math.random() * Math.PI * 2, d = Math.random() * 300, p = this.teleport(id, Math.cos(a) * d, Math.sin(a) * d);
    if (p) p.spawnUntil = Date.now() + SPAWN_MS; return p;
  }

  async leave(id) {
    const p = this.players.get(String(id));
    if (!p) return;
    this.players.delete(p.id);
    await this._save(p).catch((e) => console.error("world3d leave", e));
  }

  // The client only sends a direction (and whether Shift is held); the server moves the sphere.
  // Hostile input: finite numbers, length clamped to 1, the boost only ever a flag.
  setDir(id, dx, dy, boost, h, aim) {
    const p = this.players.get(String(id));
    if (!p) return false;
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    if (spawning(p)) { p.dx = p.dy = 0; return true; }   // (owner) materializing: no moving or turning yet
    p.dx = dx; p.dy = dy; p.boost = boost === 1 || boost === true;   // (owner) Shift = sprint (30% faster)
    if (typeof h === "number" && Number.isFinite(h)) p.h = Math.atan2(Math.sin(h), Math.cos(h));   // (owner) the ship's heading, for everyone else's screens
    p.aim = typeof aim === "number" && Number.isFinite(aim) ? Math.atan2(Math.sin(aim), Math.cos(aim)) : null;   // (owner) aiming: the reticle's direction; absent = not aiming
    return true;
  }

  step(dt = TICK) {
    this.think(dt);
    for (const p of this.players.values()) {
      const moving = !!(p.dx || p.dy);
      if (p.cap === undefined) p.cap = CAP_MAX;
      if (p.cap <= 0) p.capOut = true; else if (p.capOut && p.cap >= CAP_RESUME) p.capOut = false;
      const want = moving ? Math.atan2(p.dx, -p.dy) : 0;                     // the push's direction (client's convention)
      const dh = moving ? wrapA(want - (p.h || 0)) : 0;                      // off the nose: how much acceleration it gets
      const df = moving && p.aim != null ? wrapA(want - p.aim) : 0;         // off "forward": the top speed and sprint
      const sprinting = !!p.boost && moving && Math.abs(df) <= FWD_ARC && !p.capOut;   // (owner) sprint only forward
      p.cap = sprinting ? Math.max(0, p.cap - CAP_DRAIN * Math.hypot(p.vx || 0, p.vy || 0) * dt / 100) : Math.min(CAP_MAX, p.cap + (moving ? CAP_WALK : CAP_IDLE) * dt);
      const vx0 = p.vx || 0, vy0 = p.vy || 0;
      if (!moving && !vx0 && !vy0) continue;
      // accelerate toward the input's velocity; a push off the nose gets only part of the acceleration
      const spd = SPEED * dirSpeed(df) * (sprinting ? SPRINT : 1);
      let a = ACCEL;
      if (p.dx || p.dy) p.brakeA = 0;
      else { if (!p.brakeA) p.brakeA = Math.max(BRAKE, (vx0 * vx0 + vy0 * vy0) / (2 * STOP_D)); a = p.brakeA; }
      if (moving) a *= accelShare(dh);
      [p.vx, p.vy] = moving ? carry(vx0, vy0, p.dx, p.dy, spd * Math.min(1, Math.hypot(p.dx, p.dy)), a, BRAKE, dt, p.h) : steer(vx0, vy0, 0, 0, a, a, dt);
      if (Math.hypot(p.vx, p.vy) < 0.01 && !p.dx && !p.dy) { p.vx = p.vy = 0; p.brakeA = 0; continue; }
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (inside(nx, ny)) { p.x = nx; p.y = ny; }
      else {                                   // the border stops the ship dead: as far along the step as still fits
        let lo = 0, hi = 1;
        for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; inside(p.x + (nx - p.x) * m, p.y + (ny - p.y) * m) ? (lo = m) : (hi = m); }
        p.x += (nx - p.x) * lo; p.y += (ny - p.y) * lo; p.vx = p.vy = 0;
      }
      p.dirty = true;
    }
    this.collide();
    this.stepProjs(dt);
    for (const p of this.players.values()) {   // test ships shoved somewhere: the piece follows
      if (!p.bot) continue; const b = this.builds.get(String(p.bot));
      if (b && b.extra && b.extra.route) continue;   // (a ship flying a route keeps its spawn where it was placed)
      if (b && (b.x !== p.x || b.y !== p.y)) { b.x = Math.round(p.x * 100) / 100; b.y = Math.round(p.y * 100) / 100; b.dirty = true; this._shape(b); }
    }
  }
  // (owner, 2026-10-13) ships against blocks and against each other (two overlapping ships each move half the overlap
  // apart); a push that would leave the hexagon isn't applied
  // (owner, 2026-10-14) each ship by the ship kind's Movement ellipse (Object Editor), turned with its heading
  shipPoly(p) { return movePoly({ k: "ship", x: p.x, y: p.y, w: 2 * SHIP_R, d: 2 * SHIP_R, r: p.h || 0 }, this.movers, this.pivots); }
  collide() {
    const ps = [...this.players.values()], keep = (p, f) => { const ox = p.x, oy = p.y; f(); if (!inside(p.x, p.y)) { p.x = ox; p.y = oy; } p.dirty = true; };
    const polys = new Map(ps.map((p) => [p, this.shipPoly(p)])), rads = new Map(ps.map((p) => [p, polyRad(p, polys.get(p))]));
    for (const p of ps) for (const b of this.blocks) {
      const R = rads.get(p) + BLOCK_HALF * 1.5; if (Math.abs(p.x - b.x) > R || Math.abs(p.y - b.y) > R) continue;
      const n = satPush(polys.get(p), squarePoly(b.x, b.y, BLOCK_HALF)); if (n) { keep(p, () => nudge(p, n, n.d)); polys.set(p, this.shipPoly(p)); }
    }
    for (const p of ps) for (const b of this.builds.values()) {
      if (b.k === "ship" || b.k === "cloud") continue;   // (clouds don't block)           // test ships collide as ships (their stand-in players), below
      const dx = p.x - b.x, dy = p.y - b.y, R = b.rad + rads.get(p); if (dx * dx + dy * dy > R * R) continue;
      const n = satPush(polys.get(p), b.mpoly); if (n) { keep(p, () => nudge(p, n, n.d)); polys.set(p, this.shipPoly(p)); }
    }
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {   // two ships: each moves half the overlap apart
      const a = ps[i], b = ps[j], R = rads.get(a) + rads.get(b); if (Math.abs(a.x - b.x) > R || Math.abs(a.y - b.y) > R) continue;
      const n = satPush(polys.get(a), polys.get(b)); if (!n) continue;
      keep(a, () => { a.x += n.nx * n.d / 2; a.y += n.ny * n.d / 2; }); keep(b, () => { b.x -= n.nx * n.d / 2; b.y -= n.ny * n.d / 2; });
      // (owner, 2026-10-14) ships push each other: an impact trades momentum (equal masses, a little bounce) and both
      // take damage by how hard they closed on each other (nothing for a gentle touch)
      const vn = ((a.vx || 0) - (b.vx || 0)) * n.nx + ((a.vy || 0) - (b.vy || 0)) * n.ny;   // closing speed along the contact (negative = closing)
      if (vn < 0) {
        const j = -(1 + BUMP_E) * vn / 2;
        a.vx = (a.vx || 0) + j * n.nx; a.vy = (a.vy || 0) + j * n.ny; b.vx = (b.vx || 0) - j * n.nx; b.vy = (b.vy || 0) - j * n.ny;
        if (!a.dx && !a.dy) a.brakeA = 0; if (!b.dx && !b.dy) b.brakeA = 0;   // a drifting ship brakes again from its new speed
        const dmg = Math.max(0, -vn - BUMP_SAFE) * BUMP_DMG; if (dmg > 0) { this.hurt(a, dmg); this.hurt(b, dmg); }
        if (-vn > 5) {                         // (owner) sparks where they met (s: the hit's strength, x4 since speeds were cut to 25%)
          // (owner, 2026-10-14) where the hulls touched (between each one's point deepest toward the other), and the way the hit
          // came from: back toward whichever ship drove into the other harder (n points from b toward a)
          const sup = (P, dx, dy) => { let bi = 0, bv = -Infinity; for (let k = 0; k < P.length; k += 2) { const v = P[k] * dx + P[k + 1] * dy; if (v > bv) { bv = v; bi = k; } } return [P[bi], P[bi + 1]]; };
          const pa = sup(polys.get(a), -n.nx, -n.ny), pb = sup(polys.get(b), n.nx, n.ny);
          const inA = -(((a.vx || 0) * n.nx) + ((a.vy || 0) * n.ny)), inB = ((b.vx || 0) * n.nx) + ((b.vy || 0) * n.ny), sg = inA >= inB ? 1 : -1;
          this.hits.push({ x: (pa[0] + pb[0]) / 2, y: (pa[1] + pb[1]) / 2, s: Math.round(-vn * 4), a: a.id, b: b.id, dx: n.nx * sg, dy: n.ny * sg });
        }
      }
      polys.set(a, this.shipPoly(a)); polys.set(b, this.shipPoly(b));
    }
  }
  // (owner, 2026-10-14) health: HP_MAX full; at 0 the ship is back at full health near the center
  // (owner, 2026-10-14) part: the combat-points part a shot hit (body / main / left / right / weapon); for now every part is HP
  hurt(p, d, part) {
    if (spawning(p)) return;                   // (still materializing)
    p.hp = (p.hp ?? HP_MAX) - d;
    if (p.hp <= 0) { p.hp = HP_MAX; if (!p.bot) this.respawn(p.id); else this.respawnBot(p); }   // (owner, 2026-10-14) test ships respawn too, at their spawn
  }
  // (owner, 2026-10-14) weapons: everyone has the first one (the Railgun). (owner, 2026-10-15) Making and editing weapons
  // was scrapped with the Weapon panel; it'll come back as part of the Item Creator
  weaponList() { return [...this.weapons.values()]; }
  defaultWeapon() { let best = null; for (const w of this.weapons.values()) if (!best || +w.id < +best.id) best = w; return best || { id: "0", ...cleanWeapon({ name: "Railgun" }) }; }
  weaponOf(p) { return (p.weapon && this.weapons.get(p.weapon)) || this.defaultWeapon(); }
  // (owner, 2026-10-15) items: made, changed and deleted in the Item Creator
  itemList() { return [...this.catalog.values()]; }
  async setItem(id, o) {
    const a = cleanItem(o); if (!a) return null; await this.ready;
    if (a.icon && !this.icons.has(a.icon)) a.icon = null;
    if (id) { if (!this.catalog.has(id)) return null; await pool.query(`UPDATE world3d_items SET data = $2, updated_at = now() WHERE id = $1`, [id, JSON.stringify(a)]); }
    else { if (this.catalog.size >= CATALOG_CAP) return null; id = String((await pool.query(`INSERT INTO world3d_items (data) VALUES ($1) RETURNING id`, [JSON.stringify(a)])).rows[0].id); }
    const out = { id, ...a }; this.catalog.set(id, out); return out;
  }
  async delItem(id) {
    if (!this.catalog.has(id)) return false; await this.ready;
    await pool.query(`DELETE FROM world3d_items WHERE id = $1`, [id]); this.catalog.delete(id); return true;
  }
  // (owner, 2026-10-14) icons: made in the Icon Creator, picked for items
  iconList() { return [...this.icons.values()]; }
  async setIcon(id, o) {                       // (owner, 2026-10-15) the Icon Editor: an existing icon redrawn
    const ic = cleanIcon(o); if (!ic || !this.icons.has(id)) return null; await this.ready;
    await pool.query(`UPDATE world3d_icons SET data = $2, updated_at = now() WHERE id = $1`, [id, JSON.stringify(ic)]);
    const out = { id, ...ic }; this.icons.set(id, out); return out;
  }
  async addIcon(o, by) {
    const ic = cleanIcon(o); if (!ic || this.icons.size >= CATALOG_CAP) return null; await this.ready;
    const id = String((await pool.query(`INSERT INTO world3d_icons (data, by_user) VALUES ($1, $2) RETURNING id`, [JSON.stringify(ic), by || null])).rows[0].id);
    const out = { id, ...ic }; this.icons.set(id, out); return out;
  }
  // a shot from a player: (dx, dy) the direction, checked as hostile (finite, not zero); their weapon's shot rate, magazine and reload
  fire(id, dx, dy) {
    const p = this.players.get(String(id)); if (!p || p.bot || spawning(p)) return null;
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    const L = Math.hypot(dx, dy); if (L < 1e-6) return null;
    const w = this.weaponOf(p), now = Date.now(); if (p.lastFire && now - p.lastFire < w.rate * 1000 - 50) return null;
    if (p.reloadAt) { if (now < p.reloadAt - 50) return null; p.reloadAt = 0; p.ammo = w.mag; }   // reloading / just reloaded
    if (p.ammo === undefined) p.ammo = w.mag;
    if (p.ammo <= 0) return null;              // (owner, 2026-10-14) empty: R reloads
    const q = this.shoot(p, dx, dy, w); if (!q) return null;
    p.ammo--; return q;
  }
  // (owner, 2026-10-14) R: reload (when the magazine isn't full and it isn't already reloading)
  reload(id) {
    const p = this.players.get(String(id)); if (!p || p.bot) return false;
    const w = this.weaponOf(p), now = Date.now();
    if (p.reloadAt) { if (now < p.reloadAt) return false; p.reloadAt = 0; p.ammo = w.mag; }
    if (p.ammo === undefined || p.ammo >= w.mag) return false;
    p.reloadAt = now + w.reload * 1000; return true;
  }
  shoot(p, dx, dy, w = this.defaultWeapon()) {   // (also the test ships' shots)
    let L = Math.hypot(dx, dy); if (L < 1e-6) return null; const now = Date.now(); p.lastFire = now;
    { const ex = spreadNow(p, now, w.aimSpeed), sp = Math.min(SPREAD_MAX, w.spread0 + ex), off = (Math.random() * 2 - 1) * sp * Math.PI / 180, c = Math.cos(off), n = Math.sin(off);   // somewhere in the cone
      [dx, dy] = [dx * c - dy * n, dx * n + dy * c]; p.spread = Math.min(SPREAD_MAX, ex + w.spreadAdd); p.spreadT = now; L = Math.hypot(dx, dy); }
    const [ox, oy] = this.shipOrigin(p);   // (owner, 2026-10-14) shots leave from the Weapon Origin
    const q = { id: this.projSeq++, a: p.id, x: ox, y: oy, vx: dx / L * w.speed, vy: dy / L * w.speed, sp: w.speed, left: w.speed * w.life, went: 0, w };
    this.projs.push(q); this.projEv.push({ t: "proj", i: q.id, a: q.a, x: q.x, y: q.y, vx: q.vx, vy: q.vy });
    return q;
  }
  // the outlines that block sight (blocks and Build pieces; not ships or clouds)
  _sightBlocked(x0, y0, x1, y1) {
    const lo = (a, b) => Math.min(a, b), hi = (a, b) => Math.max(a, b), X0 = lo(x0, x1), X1 = hi(x0, x1), Y0 = lo(y0, y1), Y1 = hi(y0, y1);
    for (const b of this.blocks) { if (b.x + BLOCK_HALF < X0 || b.x - BLOCK_HALF > X1 || b.y + BLOCK_HALF < Y0 || b.y - BLOCK_HALF > Y1) continue; if (segPoly(x0, y0, x1, y1, squarePoly(b.x, b.y, BLOCK_HALF)) !== null) return true; }
    for (const b of this.builds.values()) { if (b.k === "ship" || b.k === "cloud") continue; const R = b.far || b.rad; if (b.x + R < X0 || b.x - R > X1 || b.y + R < Y0 || b.y - R > Y1) continue; for (const v of b.polys) if (segPoly(x0, y0, x1, y1, v) !== null) return true; }
    return false;
  }
  // (owner, 2026-10-14) a ship's Weapon Origin in the world: where its shots leave from (line of sight stays at the pivot)
  shipOrigin(p) { return toWorldPts({ k: "ship", x: p.x, y: p.y, w: 2 * SHIP_R, d: 2 * SHIP_R, r: p.h || 0 }, [this.origins.ship || [0, 0]], this.pivots.ship || [0, 0]); }
  // can a and b see each other (mutual visibility from the Visibility points, as on the clients; clouds left out)?
  sees(a, b) {
    const pts = (p) => toWorldPts({ k: "ship", x: p.x, y: p.y, w: 2 * SHIP_R, d: 2 * SHIP_R, r: p.h || 0 }, this.visOutlines.ship || VIS_DEFAULT.ship, this.pivots.ship || [0, 0]);
    const A = pts(a), B = pts(b), ax = a.x, ay = a.y, bx = b.x, by = b.y; let clear = 0;   // (owner, 2026-10-14) lines run to each ship's pivot
    const piv = this._sightBlocked(ax, ay, bx, by) ? 0 : PIV_W;
    for (let i = 0; i < A.length; i += 2) if (!this._sightBlocked(A[i], A[i + 1], bx, by)) clear++;
    for (let i = 0; i < B.length; i += 2) if (!this._sightBlocked(B[i], B[i + 1], ax, ay)) clear++;
    return piv + (1 - PIV_W) * clear / Math.max(1, (A.length + B.length) / 2) > VIS_LO;
  }
  // (owner, 2026-10-14) can test ship p make out player q through the clouds (on top of line of sight)?
  cloudSees(p, q) {
    for (const b of this.builds.values()) {
      if (b.k !== "cloud" || !b.poly) continue;
      const qIn = Math.hypot(q.x - b.x, q.y - b.y) <= b.rad + 1 && inPoly(q.x, q.y, b.poly), pIn = Math.hypot(p.x - b.x, p.y - b.y) <= b.rad + 1 && inPoly(p.x, p.y, b.poly);
      if (qIn) {
        const d = Math.min(1, edgeDist(q.x, q.y, b.poly) / CLOUD_DEEP); let c = 1 - d * d * (3 - 2 * d);
        if (pIn && Math.hypot(p.x - q.x, p.y - q.y) <= CLOUD_NEAR && Math.hypot(q.vx || 0, q.vy || 0) >= 3) c = Math.max(c, 0.25);
        if (c < 0.2) return false;   // (unseen, as on a player's screen; the 25% floor still counts)
      }
      if (!pIn) {                              // the core in between blocks the view (sampled along the way)
        const L = Math.hypot(q.x - p.x, q.y - p.y), n = Math.ceil(L / 20);
        for (let i = 1; i < n; i++) { const x = p.x + (q.x - p.x) * i / n, y = p.y + (q.y - p.y) * i / n;
          if (Math.hypot(x - b.x, y - b.y) <= b.rad && inPoly(x, y, b.poly) && edgeDist(x, y, b.poly) >= CLOUD_DEEP) return false; }
      }
    }
    return true;
  }
  // projectiles fly a step each tick; the first thing on the step stops them
  stepProjs(dt) {
    for (let k = this.projs.length - 1; k >= 0; k--) {
      const q = this.projs[k], spd = q.sp || RAIL_SPEED, step = Math.min(q.left, spd * dt), x0 = q.x, y0 = q.y, x1 = x0 + q.vx / spd * step, y1 = y0 + q.vy / spd * step;
      let t = 2, hit = null, part = null;
      const near = (x, y, R) => Math.max(Math.abs(x - (x0 + x1) / 2), Math.abs(y - (y0 + y1) / 2)) <= R + step / 2;
      for (const b of this.blocks) if (near(b.x, b.y, BLOCK_HALF * 1.5)) { const u = segPoly(x0, y0, x1, y1, squarePoly(b.x, b.y, BLOCK_HALF)); if (u !== null && u < t) { t = u; hit = null; } }
      for (const b of this.builds.values()) { if (b.k === "ship" || b.k === "cloud" || !near(b.x, b.y, b.far || b.rad)) continue; for (const v of b.polys) { const u = segPoly(x0, y0, x1, y1, v); if (u !== null && u < t) { t = u; hit = null; } } }
      const shooter = this.players.get(q.a);
      for (const p of this.players.values()) {
        if (p.id === q.a || !near(p.x, p.y, SHIP_R * 1.6)) continue;
        // (owner, 2026-10-14) each combat-points part separately: the first one the shot meets is the part hit
        const parts = this.colliders.ship || COLL_DEFAULT.ship, polys = buildPolys({ k: "ship", x: p.x, y: p.y, w: 2 * SHIP_R, d: 2 * SHIP_R, r: p.h || 0 }, this.colliders, this.pivots);
        let u = null, pi = 0; polys.forEach((v, i) => { const w = segPoly(x0, y0, x1, y1, v); if (w !== null && (u === null || w < u)) { u = w; pi = i; } });
        if (u === null || u >= t) continue;
        if (shooter && !this.sees(shooter, p)) continue;   // (owner) a ship the shooter can't see: the shot flies through it
        t = u; hit = p; part = parts[pi].t;
      }
      if (t <= 1) {
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        if (hit) this.hurt(hit, q.w ? q.w.dmg * falloffAt(q.w, q.went + step * t) : RAIL_DMG, part);   // (owner) full damage out to the optimal range, less past it
        this.projEv.push({ t: "pend", i: q.id, x, y, h: hit ? hit.id : null, s: 1 }); this.projs.splice(k, 1); continue;
      }
      q.x = x1; q.y = y1; q.left -= step; q.went += step;
      if (q.left <= 0.01 || !inside(q.x, q.y)) { this.projEv.push({ t: "pend", i: q.id, x: q.x, y: q.y, h: null, s: 0 }); this.projs.splice(k, 1); }
    }
  }
  respawnBot(p) {
    const b = this.builds.get(String(p.bot)); if (!b) return;
    p.x = b.x; p.y = b.y; p.h = b.r; p.vx = p.vy = 0; p.dx = p.dy = 0; p.brakeA = 0; p.ai = null; p.spawnUntil = Date.now() + SPAWN_MS;
  }
  // (owner, 2026-10-14) the test ships' brains, every tick before they move: fly the route, go after a player, shoot
  think(dt) {
    const now = Date.now();
    for (const p of this.players.values()) {
      if (!p.bot) continue;
      const b = this.builds.get(String(p.bot)); if (!b) continue;
      const e = b.extra || {}, route = e.route ? [[0, 0], ...e.route].map(([x, y]) => [b.x + x, b.y + y]) : null;
      p.dx = p.dy = 0;
      if ((!route && !e.atk) || spawning(p)) continue;
      const ai = p.ai || (p.ai = { wp: route ? 1 % route.length : 0, mode: "patrol", anchor: null }); if (route) ai.wp %= route.length;   // (the route may have been edited shorter)
      // the nearest player it can see within the leash (of where it left its route, or of itself)
      let target = null, best = Infinity; const from = ai.anchor || p;
      if (e.atk) for (const q of this.players.values()) {
        if (q.bot || spawning(q)) continue;
        const dq = Math.hypot(q.x - from.x, q.y - from.y); if (dq > BOT_LEASH || dq >= best) continue;
        if (!this.sees(p, q) || !this.cloudSees(p, q)) continue; best = dq; target = q;
      }
      let goal = null, stop = BOT_ARRIVE;
      if (route) {
        if (target) { if (ai.mode !== "chase") { ai.anchor = ai.anchor || { x: p.x, y: p.y }; ai.mode = "chase"; } goal = target; stop = BOT_STANDOFF; }
        else if (ai.anchor) { ai.mode = "return"; goal = ai.anchor; if (Math.hypot(p.x - ai.anchor.x, p.y - ai.anchor.y) < BOT_ARRIVE) { ai.anchor = null; ai.mode = "patrol"; } }
        if (!goal) {
          const key = route.flat().join(","); if (b._sk !== key) { b._sk = key; b._smooth = smoothRoute(route); }
          const S = b._smooth, n = S.length; if (ai.si == null || ai.si >= n) ai.si = 0;
          if (ai.mode === "rejoin") {             // back to where it was on the path first (straight there), then along it
            const w = S[ai.si]; goal = { x: w[0], y: w[1] };
            if (Math.hypot(p.x - w[0], p.y - w[1]) < 60) ai.mode = "patrol";
          }
          if (ai.mode !== "rejoin") {             // follow the rounded loop: a point a little ahead of where it is on it
            let bi = ai.si, bd = Infinity, bt = 0;
            for (let k = 0; k < 12; k++) { const i = (ai.si + k) % n, A = S[i], B = S[(i + 1) % n], ex = B[0] - A[0], ey = B[1] - A[1], L2 = ex * ex + ey * ey || 1e-9;
              const t = Math.max(0, Math.min(1, ((p.x - A[0]) * ex + (p.y - A[1]) * ey) / L2)), d = Math.hypot(p.x - A[0] - ex * t, p.y - A[1] - ey * t);
              if (d < bd) { bd = d; bi = i; bt = t; } }
            ai.si = bi;
            let i = bi, A = S[i], B = S[(i + 1) % n], px = A[0] + (B[0] - A[0]) * bt, py = A[1] + (B[1] - A[1]) * bt, left = ROUTE_LOOK;
            for (let k = 0; k < n && left > 0; k++) { const sx = B[0] - px, sy = B[1] - py, sl = Math.hypot(sx, sy);
              if (sl >= left) { px += sx / sl * left; py += sy / sl * left; left = 0; break; }
              left -= sl; px = B[0]; py = B[1]; i = (i + 1) % n; B = S[(i + 1) % n]; }
            goal = { x: px, y: py }; stop = 0;
          }
        }
        ai.goal = ai.mode === "return" || ai.mode === "rejoin" ? goal : null;   // (owner) shown to builders as a leash back to the path
      }
      // turn toward what it's after (the target, else where it's going) and thrust when roughly facing it
      const look = target || goal;
      if (look) {
        const ux = look.x - p.x, uy = look.y - p.y;
        if (Math.hypot(ux, uy) > 1) {
          const want = Math.atan2(ux, -uy), err = wrapA(want - (p.h || 0)), step = BOT_TURN * dt;
          p.h = wrapA((p.h || 0) + Math.max(-step, Math.min(step, err)));
        }
      }
      if (goal) {                              // thrust toward it once roughly facing that way (it turns first)
        const gx = goal.x - p.x, gy = goal.y - p.y, want = Math.atan2(gx, -gy);
        if (Math.hypot(gx, gy) > stop && Math.abs(wrapA(want - (p.h || 0))) < 0.9) { p.dx = Math.sin(want); p.dy = -Math.cos(want); }
      }
      p.aim = p.h;
      // shoot at the target when facing it closely enough
      if (target && (!p.lastFire || now - p.lastFire >= BOT_CD * 1000)) {
        const [ox, oy] = this.shipOrigin(p), tx = target.x - ox, ty = target.y - oy, err = Math.abs(wrapA(Math.atan2(tx, -ty) - (p.h || 0)));
        if (err < 0.35 && Math.hypot(tx, ty) <= RAIL_RANGE * 0.8) this.shoot(p, tx, ty);
      }
    }
  }
  // a block where this player's ship is (it gets pushed out); 30 at most each (the oldest goes), 400 in all
  delBlock(id) { const n = this.blocks.length; this.blocks = this.blocks.filter((b) => b.id !== id); return this.blocks.length < n; }   // (owner, 2026-10-14) staff: right-click Delete
  addBlock(pid) {
    const p = this.players.get(pid); if (!p) return null;
    const mine = this.blocks.filter((b) => b.owner === pid), gone = [];
    if (mine.length >= 30) gone.push(mine[0]);
    if (this.blocks.length - gone.length >= 400) gone.push(this.blocks.find((b) => !gone.includes(b)));
    this.blocks = this.blocks.filter((b) => !gone.includes(b));
    const b = { id: this.blockSeq++, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, owner: pid };
    this.blocks.push(b);
    return { b, gone: gone.map((g) => g.id) };
  }

  // (owner, 2026-10-13) Build menu pieces. _clean checks a piece from a client as hostile: a known shape, finite numbers,
  // its center inside the map, sizes clamped, the angle wrapped. null if it isn't usable.
  kindOk(k) { return KINDS.includes(k) || (isTypeKey(k) && this.types.has(k.slice(2))); }
  _clean(o) {
    if (!o || !this.kindOk(o.k)) return null;
    const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null), x = n(+o.x), y = n(+o.y), w = n(+o.w), d = n(+o.d), r = n(+o.r);
    if (x === null || y === null || w === null || d === null || r === null || !inside(x, y)) return null;
    const cl = (v) => Math.max(BUILD_MIN, Math.min(BUILD_MAX, v)), rd = (v) => Math.round(v * 100) / 100;
    const ship = o.k === "ship";            // (owner) a test ship: a parked ship, the size of a real one
    const b = { k: o.k, x: rd(x), y: rd(y), w: ship ? 2 * SHIP_R : rd(cl(w)), d: ship ? 2 * SHIP_R : rd(cl(d)), r: Math.round(wrapA(r) * 10000) / 10000 };
    if (ship && o.extra && typeof o.extra === "object") {   // (owner, 2026-10-14) a test ship's route and attack setting
      const route = o.extra.route == null ? null : cleanRoute(o.extra.route), atk = o.extra.atk === true;
      if (route || atk) b.extra = { ...(route ? { route } : {}), ...(atk ? { atk: true } : {}) };
    }
    if (isTypeKey(o.k)) { b.extra = cleanNode(o.extra, b.w); b.w = b.d = b.extra.size; }   // (owner, 2026-10-15) a placed node: its settings; its footprint is its size (no scale)
    if (o.k === "cloud") {                   // (owner, 2026-10-14) a nebula cloud: its own outline (meters around its pivot, before
      const e = o.extra || {}, pts = cleanCloud(e.pts);   // turning and scaling; w is the scale in %) and a color theme
      if (!pts) return null; b.extra = { pts, v: Number.isInteger(e.v) && e.v >= 0 && e.v < CLOUD_THEMES ? e.v : 0 }; b.d = b.w;
    }
    return b;
  }
  _put(id, b, keep = false) {
    b.id = id;
    if (isTypeKey(b.k) && b.extra.amount == null) { const e = b.extra; e.amount = e.min + Math.floor(Math.random() * (e.max - e.min + 1)); b.dirty = true; }   // (owner, 2026-10-15) a new node rolls the ore it holds
    this._shape(b); this.builds.set(id, b); if (b.k === "ship") this._bot(b, keep); return b;
  }
  // (owner, 2026-10-14) a test ship acts as a player for hitboxes and the rest (no AI): it has a stand-in in the players
  // map ("b" + its id, side "test") that collides, gets shoved, takes damage, shows in snapshots and the roster. A Build
  // menu edit puts it there (stopped); where shoves take it is written back to the piece.
  // keep: (owner, 2026-10-14) its route or spawn was edited: the ship stays where it is and flies back to its route point
  _bot(b, keep = false) {
    const id = "b" + b.id; let p = this.players.get(id);
    if (p && keep) { const si = p.ai ? p.ai.si : 0; p.ai = b.extra && b.extra.route ? { wp: 1, si: si || 0, mode: "rejoin", anchor: null } : null; return p; }   // (si: its place on the rounded path)
    if (!p) { p = { id, name: "Test Ship", team: "test", bot: b.id, dx: 0, dy: 0, hp: HP_MAX }; this.players.set(id, p); }
    p.x = b.x; p.y = b.y; p.h = b.r; p.vx = p.vy = 0; p.brakeA = 0; p.ai = null;   // (moved in the Build menu: starts its route over)
    return p;
  }
  // poly: the sight outline (line of sight is the client's); mpoly / rad: the movement ellipse, what ships bump into
  _shape(b) {
    if (b.k === "cloud") { b.poly = b.mpoly = cloudPoly(b); b.rad = b.far = polyRad(b, b.poly); return; }   // (clouds don't block anything)
    b.polys = buildPolys(b, this.colliders, this.pivots); b.mpoly = movePoly(b, this.movers, this.pivots); b.rad = polyRad(b, b.mpoly); b.far = Math.max(b.rad, ...b.polys.map((v) => polyRad(b, v))); }
  // (owner, 2026-10-14) the Object Editor: a kind's new collider outline; every piece of that kind takes it at once
  async setCollider(k, parts, pivot, mover, vis, origin) {   // (owner) the combat points, the pivot, the movement collider, the visibility points and the weapon origin together
    const c = this.kindOk(k) && cleanParts(parts), pv = cleanPivot(pivot) || [0, 0], wo = cleanPivot(origin) || [0, 0], mv = cleanMove(mover) || MOVE_DEFAULT[k] || MOVE_DEFAULT.square, vs = cleanColl(vis, 1, 32) || VIS_DEFAULT[k] || VIS_DEFAULT.square; if (!c) return null;
    await this.ready;
    await pool.query(`INSERT INTO world3d_colliders (k, pts, parts, pivot, mover, vis, origin, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, now()) ON CONFLICT (k) DO UPDATE SET pts = $2, parts = $3, pivot = $4, mover = $5, vis = $6, origin = $7, updated_at = now()`, [k, JSON.stringify(c[0].pts), JSON.stringify(c), JSON.stringify(pv), JSON.stringify(mv), JSON.stringify(vs), JSON.stringify(wo)]);
    this.colliders[k] = c; this.pivots[k] = pv; this.origins[k] = wo; this.movers[k] = mv; this.visOutlines[k] = vs;
    for (const b of this.builds.values()) if (b.k === k) this._shape(b);
    return { parts: c, pv, mv, vis: vs, wo };
  }
  buildList() { return [...this.builds.values()].map((b) => buildMsg(b)); }
  // (owner, 2026-10-15) object types: made, changed and deleted in the Object Creator (a type can't go while it's placed)
  typeList() { return [...this.types.values()]; }
  async setType(id, o) {
    const t = cleanType(o); if (!t) return null; await this.ready;
    if (t.icon && !this.icons.has(t.icon)) t.icon = null; if (t.item && !this.catalog.has(t.item)) t.item = null;
    if (id) { if (!this.types.has(id)) return null; await pool.query(`UPDATE world3d_types SET data = $2, updated_at = now() WHERE id = $1`, [id, JSON.stringify(t)]); }
    else { if (this.types.size >= CATALOG_CAP) return null; id = String((await pool.query(`INSERT INTO world3d_types (data) VALUES ($1) RETURNING id`, [JSON.stringify(t)])).rows[0].id); }
    const out = { id, ...t }; this.types.set(id, out); return out;
  }
  async delType(id) {
    if (!this.types.has(id)) return { ok: false };
    if ([...this.builds.values()].some((b) => b.k === "t:" + id)) return { ok: false, error: "Remove its placed objects first." };
    await this.ready; await pool.query(`DELETE FROM world3d_types WHERE id = $1`, [id]); this.types.delete(id); return { ok: true };
  }
  async addBuild(o, by) {
    const b = this._clean(o); if (!b || this.builds.size >= BUILD_CAP) return null;
    await this.ready;
    const { rows } = await pool.query(`INSERT INTO world3d_builds (k, x, y, w, d, r, by_user, extra) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [b.k, b.x, b.y, b.w, b.d, b.r, String(by), b.extra ? JSON.stringify(b.extra) : null]);
    return this._put(String(rows[0].id), b);
  }
  setBuild(id, o) {                          // an edit: kept at once, written to the database with the next save
    if (!this.builds.has(id)) return null; const b = this._clean(o); if (!b) return null;
    b.dirty = true; return this._put(id, b, o.keep === true);
  }
  async delBuild(id) {
    if (!this.builds.delete(id)) return false;
    this.players.delete("b" + id);            // its stand-in goes too
    await pool.query(`DELETE FROM world3d_builds WHERE id = $1`, [id]); return true;
  }

  async _save(p) {
    await this.ready;
    await pool.query(
      `INSERT INTO world3d (user_id, x, y, team, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id) DO UPDATE SET x = $2, y = $3, team = $4, updated_at = now()`, [p.id, p.x, p.y, p.team || null]);
    p.dirty = false;
  }
  async saveDirty() {
    for (const p of this.players.values()) if (p.dirty && !p.bot) await this._save(p);
    for (const b of this.builds.values()) if (b.dirty) { b.dirty = false; await pool.query(`UPDATE world3d_builds SET k = $2, x = $3, y = $4, w = $5, d = $6, r = $7, extra = $8, updated_at = now() WHERE id = $1`, [b.id, b.k, b.x, b.y, b.w, b.d, b.r, b.extra ? JSON.stringify(b.extra) : null]); }
  }

  // compact: [id, x (cm), y (cm), heading (mrad)] for every player within the viewer's load circle (themselves included)
  snapshotFor(viewer) {
    const out = [], R2 = LOAD_R * LOAD_R;
    for (const p of this.players.values()) {
      const dx = p.x - viewer.x, dy = p.y - viewer.y;
      if (p !== viewer && dx * dx + dy * dy > R2) continue;
      const row = [p.id, Math.round(p.x * 100), Math.round(p.y * 100), Math.round((p.h || 0) * 1000), Math.ceil(p.hp ?? HP_MAX)];   // + health (owner, 2026-10-14)
      if (spawning(p)) row.push(Math.ceil((p.spawnUntil - Date.now()) / 10));   // (owner, 2026-10-14) still materializing: hundredths of a second left
      out.push(row);
    }
    return out;
  }
  roster() { const out = []; for (const p of this.players.values()) out.push({ i: p.id, n: p.name, s: p.team }); return out; }
}
