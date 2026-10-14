// The 3D world (owner, 2026-10-12: the game rebuilt in 3D, one shared world, no POIs).
// Flat ground plane. One sphere per account, 100 m in diameter, moving on the XY plane
// only (no Z). The border is the same flat-top hexagon, 126 km flat to flat. Everyone
// within its load circle sees each other. Positions persist per account.
import { pool } from "../db.js";

export const HEX_FLAT = 2_500;             // 2.5 km flat to flat "for now" (owner, 2026-10-13; was 126 km)
export const SPHERE_R = 50;                  // the player sphere: 100 m in diameter (owner)
export const SPEED = 200;                    // m/s on the ground (owner, 2026-10-13; was 300)
// (owner, 2026-10-13) weight: the ship accelerates toward its input; full ACCEL when the nose points where
// it's being pushed, down to TURN_ACCEL of it when pushing against the nose (it has to come round first)
export const ACCEL = 200;                    // m/s^2: 0 to 200 m/s in 1 s straight
export const BRAKE = 400;                    // m/s^2 (owner): letting go of WASD stops faster than it accelerates, however the nose points
// (owner, 2026-10-13) "no matter the speed, stop within 100 m": when WASD is let go the braking rate is fixed for that stop
// at whichever is harder, BRAKE or the rate that stops the current speed in STOP_D (v^2 / 2 STOP_D); held constant,
// it brings the ship to rest within STOP_D. Pressing WASD again ends the stop.
export const STOP_D = 100;
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
// (owner, 2026-10-13) the load circle: each player is sent only the players (and, later, objects) within this
// distance of their ship. It reaches well past the camera, so nothing pops in on screen.
export const LOAD_R = 5000;
// the acceleration share for a push at angle d (radians) off the nose: 1 straight, ~0.48 side-on, 0.3 reversing
// (owner, 2026-10-13: reversing while moving was far slower than stopping and then going) one step of the velocity
// toward the target (tx, ty): the part of the change that SLOWS the current motion (against the velocity) brakes at
// up to `brake`; the rest (the new direction) thrusts at up to `a`. Reversing then works like letting go and pushing.
export const VEL_TURN = 8;                   // rad/s: how fast held WASD swings the motion round (the ship turns as fast)
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
  if (left > Math.PI * 5 / 6 && Number.isFinite(nose)) { const s = wrap(nose - va); if (Math.abs(s) > 1e-3 && Math.sign(s) !== sign) { sign = Math.sign(s); left = T2 - left; } }
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
// (owner, 2026-10-13) colliders, on the ground plane only (x / y; height is ignored): each ship is a circle of SHIP_R,
// each block a square BLOCK_HALF from its center. A ship overlapping one is pushed out along the shortest way, and the
// part of its velocity going into it is dropped (it slides along). Mirrored in the client's prediction.
export const SHIP_R = 45, BLOCK_HALF = 25;
export function pushOut(p, cx, cy, minD) {           // p: {x, y, vx, vy}; push p's center to at least minD from (cx, cy)
  let nx = p.x - cx, ny = p.y - cy, d = Math.hypot(nx, ny);
  if (d >= minD) return false;
  if (d < 1e-6) { nx = 1; ny = 0; } else { nx /= d; ny /= d; }
  p.x = cx + nx * minD; p.y = cy + ny * minD;
  const vn = (p.vx || 0) * nx + (p.vy || 0) * ny; if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; }
  return true;
}
export function pushFromBlock(p, b) {                 // a ship's circle out of an axis-aligned square
  const qx = Math.max(b.x - BLOCK_HALF, Math.min(b.x + BLOCK_HALF, p.x)), qy = Math.max(b.y - BLOCK_HALF, Math.min(b.y + BLOCK_HALF, p.y));
  if (qx === p.x && qy === p.y) {              // the center is inside the square: out through the nearest side
    const dl = p.x - (b.x - BLOCK_HALF), dr = b.x + BLOCK_HALF - p.x, dd = p.y - (b.y - BLOCK_HALF), du = b.y + BLOCK_HALF - p.y, m = Math.min(dl, dr, dd, du);
    const nx = m === dl ? -1 : m === dr ? 1 : 0, ny = m === dd ? -1 : m === du ? 1 : 0;
    if (nx) p.x = b.x + nx * (BLOCK_HALF + SHIP_R); else p.y = b.y + ny * (BLOCK_HALF + SHIP_R);
    const vn = (p.vx || 0) * nx + (p.vy || 0) * ny; if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; }
    return true;
  }
  return pushOut(p, qx, qy, SHIP_R);
}
// (owner, 2026-10-13) the admin Build menu's pieces: a shape (square, cylinder or triangle) with a footprint w (east-west)
// by d (north-south) in meters, turned r radians (counterclockwise seen from above), BUILD_H tall, kept in the database.
// Ships collide with them like blocks: the footprint as a convex polygon (the cylinder as a 24-sided ellipse).
export const SHAPES = ["square", "cylinder", "triangle"], KINDS = [...SHAPES, "ship"], BUILD_H = 50, BUILD_MIN = 5, BUILD_MAX = 1000, BUILD_CAP = 3000;
// (owner, 2026-10-14) each kind's collider outline, in the model's own frame as fractions of its footprint (x across
// its width w, y along its depth d; a test ship's footprint is SHIP_R x 2 square). The Object Editor ([X]) can change
// them (any simple outline, concave allowed). (owner) They start as a 4-corner rectangle around the object: the
// shapes' own square, the ship model's 59.4 x 100 m box.
const box = (hx, hy) => [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
export const COLL_DEFAULT = { square: box(0.5, 0.5), triangle: box(0.5, 0.5), cylinder: box(0.5, 0.5), ship: box(0.33, 0.5556) };
// (owner, 2026-10-14) each kind's pivot: the point of the model it turns around, in the same fractions. A piece's
// position (x, y) is where its pivot is; the model and its outline sit around it. Default: the middle.
function toWorldPts(o, loc, pv) {              // fractions of the footprint, around the pivot, into the world
  const c = Math.cos(o.r), s = Math.sin(o.r), out = [];
  for (const [ux, uy] of loc) { const lx = (ux - pv[0]) * o.w, ly = (uy - pv[1]) * o.d; out.push(o.x + lx * c - ly * s, o.y + lx * s + ly * c); }
  return out;
}
// the sight outline in the world: [x0, y0, x1, y1, ...] (owner, 2026-10-14: it decides line of sight)
export function buildPoly(o, coll, piv) { return toWorldPts(o, (coll && coll[o.k]) || COLL_DEFAULT[o.k] || COLL_DEFAULT.square, (piv && piv[o.k]) || [0, 0]); }
// (owner, 2026-10-14) the movement collider: an ellipse [cx, cy, rx, ry] in the same fractions (ships bump into it),
// editable too; it starts as the footprint's own circle / ellipse. In the world, a 24-sided outline.
export const MOVE_DEFAULT = { square: [0, 0, 0.5, 0.5], triangle: [0, 0, 0.5, 0.5], cylinder: [0, 0, 0.5, 0.5], ship: [0, 0, 0.5, 0.5] };
export function movePoly(o, mov, piv) {
  const m = (mov && mov[o.k]) || MOVE_DEFAULT[o.k] || MOVE_DEFAULT.square, loc = [];
  for (let i = 0; i < 24; i++) loc.push([m[0] + Math.cos(i * Math.PI / 12) * m[2], m[1] + Math.sin(i * Math.PI / 12) * m[3]]);
  return toWorldPts(o, loc, (piv && piv[o.k]) || [0, 0]);
}
export function cleanMove(m) {                 // a submitted ellipse, checked as hostile
  if (!Array.isArray(m) || m.length !== 4) return null; const v = m.map(Number); if (!v.every(Number.isFinite)) return null;
  const r4 = (x) => Math.round(x * 10000) / 10000, cl = (x, a, b) => Math.max(a, Math.min(b, x));
  return [r4(cl(v[0], -1.5, 1.5)), r4(cl(v[1], -1.5, 1.5)), r4(cl(v[2], 0.02, 1.5)), r4(cl(v[3], 0.02, 1.5))];
}
export function cleanPivot(pv) {               // a submitted pivot, checked as hostile: two finite numbers inside +-1.5
  if (!Array.isArray(pv) || pv.length !== 2) return null; const [x, y] = pv.map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.round(Math.max(-1.5, Math.min(1.5, x)) * 10000) / 10000, Math.round(Math.max(-1.5, Math.min(1.5, y)) * 10000) / 10000];
}
export function polyRad(o, v) { let r = 0; for (let i = 0; i < v.length; i += 2) r = Math.max(r, Math.hypot(v[i] - o.x, v[i + 1] - o.y)); return r; }
// a ship's circle (radius R) out of an outline (concave works): out through the nearest edge
export function pushFromPoly(p, v, R) {
  let inside = false, best = Infinity, bx = 0, by = 0;
  for (let i = 0; i < v.length; i += 2) {
    const ax = v[i], ay = v[i + 1], cx = v[(i + 2) % v.length], cy = v[(i + 3) % v.length], ex = cx - ax, ey = cy - ay, L2 = ex * ex + ey * ey || 1e-9;
    if ((ay > p.y) !== (cy > p.y) && p.x < ex * (p.y - ay) / (cy - ay) + ax) inside = !inside;
    const t = Math.max(0, Math.min(1, ((p.x - ax) * ex + (p.y - ay) * ey) / L2)), qx = ax + ex * t, qy = ay + ey * t, d = Math.hypot(p.x - qx, p.y - qy);
    if (d < best) { best = d; bx = qx; by = qy; }
  }
  if (inside) {
    let nx = bx - p.x, ny = by - p.y; const d = Math.hypot(nx, ny); if (d < 1e-6) { nx = 1; ny = 0; } else { nx /= d; ny /= d; }
    p.x = bx + nx * R; p.y = by + ny * R;
    const vn = (p.vx || 0) * nx + (p.vy || 0) * ny; if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; }
    return true;
  }
  return pushOut(p, bx, by, R);
}
// where a segment first crosses an outline's edge (fraction 0-1), or null
export function segPoly(x0, y0, x1, y1, v) {
  const dx = x1 - x0, dy = y1 - y0; let best = null;
  for (let i = 0; i < v.length; i += 2) {
    const ax = v[i], ay = v[i + 1], ex = v[(i + 2) % v.length] - ax, ey = v[(i + 3) % v.length] - ay, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - x0) * ey - (ay - y0) * ex) / den, u = ((ax - x0) * dy - (ay - y0) * dx) / den;
    if (t > 1e-4 && t < 1 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}
// a submitted outline, checked as hostile: 3-64 points, finite, inside +-1.5 of the footprint; null if unusable
export function cleanColl(pts) {
  if (!Array.isArray(pts) || pts.length < 3 || pts.length > 64) return null;
  const out = [];
  for (const q of pts) { if (!Array.isArray(q) || q.length !== 2) return null; const [x, y] = q.map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([Math.round(Math.max(-1.5, Math.min(1.5, x)) * 10000) / 10000, Math.round(Math.max(-1.5, Math.min(1.5, y)) * 10000) / 10000]); }
  return out;
}
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
    this.builds = new Map(); this.colliders = {}; this.pivots = {}; this.movers = {};   // colliders: (owner, 2026-10-14) the Object Editor's outlines by kind                 // (owner, 2026-10-13) Build menu pieces: id -> { id, k, x, y, w, d, r, poly, rad, dirty }                // id -> { id, name, x, y, dx, dy, dirty }
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
    await pool.query(`ALTER TABLE world3d_colliders ADD COLUMN IF NOT EXISTS pivot JSONB`);   // (owner, 2026-10-14) the kind's pivot
    await pool.query(`ALTER TABLE world3d_colliders ADD COLUMN IF NOT EXISTS mover JSONB`);   // (owner, 2026-10-14) its movement ellipse
    for (const o of (await pool.query(`SELECT k, pts, pivot, mover FROM world3d_colliders`)).rows) {
      if (!KINDS.includes(o.k)) continue; const c = cleanColl(o.pts), pv = cleanPivot(o.pivot), mv = cleanMove(o.mover); if (c) this.colliders[o.k] = c; if (pv) this.pivots[o.k] = pv; if (mv) this.movers[o.k] = mv;
    }
    const { rows } = await pool.query(`SELECT id, k, x, y, w, d, r FROM world3d_builds`);
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
  respawn(id) { const a = Math.random() * Math.PI * 2, d = Math.random() * 300; return this.teleport(id, Math.cos(a) * d, Math.sin(a) * d); }

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
    p.dx = dx; p.dy = dy; p.boost = boost === 1 || boost === true;   // (owner) Shift = sprint (30% faster)
    if (typeof h === "number" && Number.isFinite(h)) p.h = Math.atan2(Math.sin(h), Math.cos(h));   // (owner) the ship's heading, for everyone else's screens
    p.aim = typeof aim === "number" && Number.isFinite(aim) ? Math.atan2(Math.sin(aim), Math.cos(aim)) : null;   // (owner) aiming: the reticle's direction; absent = not aiming
    return true;
  }

  step(dt = TICK) {
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
  }
  // (owner, 2026-10-13) ships against blocks and against each other (two overlapping ships each move half the overlap
  // apart); a push that would leave the hexagon isn't applied
  collide() {
    const ps = [...this.players.values()];
    for (const p of ps) for (const b of this.blocks) {
      if (Math.abs(p.x - b.x) > BLOCK_HALF + SHIP_R || Math.abs(p.y - b.y) > BLOCK_HALF + SHIP_R) continue;
      const ox = p.x, oy = p.y; if (pushFromBlock(p, b)) { if (!inside(p.x, p.y)) { p.x = ox; p.y = oy; } p.dirty = true; }
    }
    for (const p of ps) for (const b of this.builds.values()) {
      const dx = p.x - b.x, dy = p.y - b.y, R = b.rad + SHIP_R; if (dx * dx + dy * dy > R * R) continue;
      const ox = p.x, oy = p.y; if (pushFromPoly(p, b.mpoly, SHIP_R)) { if (!inside(p.x, p.y)) { p.x = ox; p.y = oy; } p.dirty = true; }
    }
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= 2 * SHIP_R) continue;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ax = a.x, ay = a.y, bx = b.x, by = b.y;
      pushOut(a, mx + (d < 1e-6 ? 1e-3 : 0), my, SHIP_R); pushOut(b, mx, my, SHIP_R);
      if (!inside(a.x, a.y)) { a.x = ax; a.y = ay; } if (!inside(b.x, b.y)) { b.x = bx; b.y = by; }
      a.dirty = b.dirty = true;
    }
  }
  // a block where this player's ship is (it gets pushed out); 30 at most each (the oldest goes), 400 in all
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
  _clean(o) {
    if (!o || !KINDS.includes(o.k)) return null;
    const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null), x = n(+o.x), y = n(+o.y), w = n(+o.w), d = n(+o.d), r = n(+o.r);
    if (x === null || y === null || w === null || d === null || r === null || !inside(x, y)) return null;
    const cl = (v) => Math.max(BUILD_MIN, Math.min(BUILD_MAX, v)), rd = (v) => Math.round(v * 100) / 100;
    const ship = o.k === "ship";            // (owner) a test ship: a parked ship, the size of a real one
    return { k: o.k, x: rd(x), y: rd(y), w: ship ? 2 * SHIP_R : rd(cl(w)), d: ship ? 2 * SHIP_R : rd(cl(d)), r: Math.round(wrapA(r) * 10000) / 10000 };
  }
  _put(id, b) { b.id = id; this._shape(b); this.builds.set(id, b); return b; }
  // poly: the sight outline (line of sight is the client's); mpoly / rad: the movement ellipse, what ships bump into
  _shape(b) { b.poly = buildPoly(b, this.colliders, this.pivots); b.mpoly = movePoly(b, this.movers, this.pivots); b.rad = polyRad(b, b.mpoly); }
  // (owner, 2026-10-14) the Object Editor: a kind's new collider outline; every piece of that kind takes it at once
  async setCollider(k, pts, pivot, mover) {   // (owner) the sight outline, the pivot and the movement ellipse together
    const c = KINDS.includes(k) && cleanColl(pts), pv = cleanPivot(pivot) || [0, 0], mv = cleanMove(mover) || MOVE_DEFAULT[k]; if (!c) return null;
    await this.ready;
    await pool.query(`INSERT INTO world3d_colliders (k, pts, pivot, mover, updated_at) VALUES ($1, $2, $3, $4, now()) ON CONFLICT (k) DO UPDATE SET pts = $2, pivot = $3, mover = $4, updated_at = now()`, [k, JSON.stringify(c), JSON.stringify(pv), JSON.stringify(mv)]);
    this.colliders[k] = c; this.pivots[k] = pv; this.movers[k] = mv;
    for (const b of this.builds.values()) if (b.k === k) this._shape(b);
    return { pts: c, pv, mv };
  }
  buildList() { return [...this.builds.values()].map((b) => [b.id, b.k, b.x, b.y, b.w, b.d, b.r]); }
  async addBuild(o, by) {
    const b = this._clean(o); if (!b || this.builds.size >= BUILD_CAP) return null;
    await this.ready;
    const { rows } = await pool.query(`INSERT INTO world3d_builds (k, x, y, w, d, r, by_user) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [b.k, b.x, b.y, b.w, b.d, b.r, String(by)]);
    return this._put(String(rows[0].id), b);
  }
  setBuild(id, o) {                          // an edit: kept at once, written to the database with the next save
    if (!this.builds.has(id)) return null; const b = this._clean(o); if (!b) return null;
    b.dirty = true; return this._put(id, b);
  }
  async delBuild(id) {
    if (!this.builds.delete(id)) return false;
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
    for (const p of this.players.values()) if (p.dirty) await this._save(p);
    for (const b of this.builds.values()) if (b.dirty) { b.dirty = false; await pool.query(`UPDATE world3d_builds SET k = $2, x = $3, y = $4, w = $5, d = $6, r = $7, updated_at = now() WHERE id = $1`, [b.id, b.k, b.x, b.y, b.w, b.d, b.r]); }
  }

  // compact: [id, x (cm), y (cm), heading (mrad)] for every player within the viewer's load circle (themselves included)
  snapshotFor(viewer) {
    const out = [], R2 = LOAD_R * LOAD_R;
    for (const p of this.players.values()) {
      const dx = p.x - viewer.x, dy = p.y - viewer.y;
      if (p !== viewer && dx * dx + dy * dy > R2) continue;
      out.push([p.id, Math.round(p.x * 100), Math.round(p.y * 100), Math.round((p.h || 0) * 1000)]);
    }
    return out;
  }
  roster() { const out = []; for (const p of this.players.values()) out.push({ i: p.id, n: p.name, s: p.team }); return out; }
}
