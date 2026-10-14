// The 3D world (owner, 2026-10-12: the game rebuilt in 3D, one shared world, no POIs).
// Flat ground plane. One sphere per account, 100 m in diameter, moving on the XY plane
// only (no Z). The border is the same flat-top hexagon, 126 km flat to flat. Everyone
// within its load circle sees each other. Positions persist per account.
import { pool } from "../db.js";

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
export const BUMP_E = 0.5, BUMP_SAFE = 15, BUMP_DMG = 0.4, HP_MAX = 100;   // (2026-10-14: scaled with the slower speeds, so hits hurt as much as before)
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
export const SHAPES = ["square", "cylinder", "triangle"], KINDS = [...SHAPES, "ship", "cloud"], BUILD_H = 50, BUILD_MIN = 5, BUILD_MAX = 1000, BUILD_CAP = 3000;
// (owner, 2026-10-14) each kind's collider outline, in the model's own frame as fractions of its footprint (x across
// its width w, y along its depth d; a test ship's footprint is SHIP_R x 2 square). The Object Editor ([X]) can change
// them (any simple outline, concave allowed). (owner) They start as a 4-corner rectangle around the object: the
// shapes' own square, the ship model's 59.4 x 100 m box.
const box = (hx, hy) => [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
export const COLL_DEFAULT = { square: box(0.5, 0.5), triangle: box(0.5, 0.5), cylinder: box(0.5, 0.5), ship: box(0.33, 0.5556) };
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
    this.hits = [];                          // (owner, 2026-10-14) this tick's ship impacts, for the clients' sparks
    this.builds = new Map(); this.colliders = {}; this.pivots = {}; this.movers = {}; this.visOutlines = {};   // colliders: (owner, 2026-10-14) the Object Editor's outlines by kind                 // (owner, 2026-10-13) Build menu pieces: id -> { id, k, x, y, w, d, r, poly, rad, dirty }                // id -> { id, name, x, y, dx, dy, dirty }
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
    await pool.query(`ALTER TABLE world3d_colliders ADD COLUMN IF NOT EXISTS vis JSONB`);     // (owner, 2026-10-14) its visibility points
    for (const o of (await pool.query(`SELECT k, pts, pivot, mover, vis FROM world3d_colliders`)).rows) {
      if (!KINDS.includes(o.k)) continue; const c = cleanColl(o.pts), pv = cleanPivot(o.pivot), mv = cleanMove(o.mover), vs = cleanColl(o.vis, 1, 32); if (c) this.colliders[o.k] = c; if (pv) this.pivots[o.k] = pv; if (mv) this.movers[o.k] = mv; if (vs) this.visOutlines[o.k] = vs;
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
    for (const p of this.players.values()) {   // test ships shoved somewhere: the piece follows
      if (!p.bot) continue; const b = this.builds.get(String(p.bot));
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
        if (-vn > 5) this.hits.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, s: Math.round(-vn * 4), a: a.id, b: b.id });   // (owner) sparks where they met (s: the hit's strength, x4 since speeds were cut to 25%)
      }
      polys.set(a, this.shipPoly(a)); polys.set(b, this.shipPoly(b));
    }
  }
  // (owner, 2026-10-14) health: HP_MAX full; at 0 the ship is back at full health near the center
  hurt(p, d) {
    p.hp = (p.hp ?? HP_MAX) - d;
    if (p.hp <= 0) { p.hp = HP_MAX; if (!p.bot) this.respawn(p.id); }   // a test ship just heals where it is
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
    const b = { k: o.k, x: rd(x), y: rd(y), w: ship ? 2 * SHIP_R : rd(cl(w)), d: ship ? 2 * SHIP_R : rd(cl(d)), r: Math.round(wrapA(r) * 10000) / 10000 };
    if (o.k === "cloud") {                   // (owner, 2026-10-14) a nebula cloud: its own outline (meters around its pivot, before
      const e = o.extra || {}, pts = cleanCloud(e.pts);   // turning and scaling; w is the scale in %) and a color theme
      if (!pts) return null; b.extra = { pts, v: Number.isInteger(e.v) && e.v >= 0 && e.v < CLOUD_THEMES ? e.v : 0 }; b.d = b.w;
    }
    return b;
  }
  _put(id, b) { b.id = id; this._shape(b); this.builds.set(id, b); if (b.k === "ship") this._bot(b); return b; }
  // (owner, 2026-10-14) a test ship acts as a player for hitboxes and the rest (no AI): it has a stand-in in the players
  // map ("b" + its id, side "test") that collides, gets shoved, takes damage, shows in snapshots and the roster. A Build
  // menu edit puts it there (stopped); where shoves take it is written back to the piece.
  _bot(b) {
    const id = "b" + b.id; let p = this.players.get(id);
    if (!p) { p = { id, name: "Test Ship", team: "test", bot: b.id, dx: 0, dy: 0, hp: HP_MAX }; this.players.set(id, p); }
    p.x = b.x; p.y = b.y; p.h = b.r; p.vx = p.vy = 0; p.brakeA = 0;
    return p;
  }
  // poly: the sight outline (line of sight is the client's); mpoly / rad: the movement ellipse, what ships bump into
  _shape(b) {
    if (b.k === "cloud") { b.poly = b.mpoly = cloudPoly(b); b.rad = b.far = polyRad(b, b.poly); return; }   // (clouds don't block anything)
    b.poly = buildPoly(b, this.colliders, this.pivots); b.mpoly = movePoly(b, this.movers, this.pivots); b.rad = polyRad(b, b.mpoly); b.far = Math.max(b.rad, polyRad(b, b.poly)); }
  // (owner, 2026-10-14) the Object Editor: a kind's new collider outline; every piece of that kind takes it at once
  async setCollider(k, pts, pivot, mover, vis) {   // (owner) the aim bounds, the pivot, the movement ellipse and the visibility points together
    const c = KINDS.includes(k) && cleanColl(pts), pv = cleanPivot(pivot) || [0, 0], mv = cleanMove(mover) || MOVE_DEFAULT[k], vs = cleanColl(vis, 1, 32) || VIS_DEFAULT[k]; if (!c) return null;
    await this.ready;
    await pool.query(`INSERT INTO world3d_colliders (k, pts, pivot, mover, vis, updated_at) VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (k) DO UPDATE SET pts = $2, pivot = $3, mover = $4, vis = $5, updated_at = now()`, [k, JSON.stringify(c), JSON.stringify(pv), JSON.stringify(mv), JSON.stringify(vs)]);
    this.colliders[k] = c; this.pivots[k] = pv; this.movers[k] = mv; this.visOutlines[k] = vs;
    for (const b of this.builds.values()) if (b.k === k) this._shape(b);
    return { pts: c, pv, mv, vis: vs };
  }
  buildList() { return [...this.builds.values()].map((b) => buildMsg(b)); }
  async addBuild(o, by) {
    const b = this._clean(o); if (!b || this.builds.size >= BUILD_CAP) return null;
    await this.ready;
    const { rows } = await pool.query(`INSERT INTO world3d_builds (k, x, y, w, d, r, by_user, extra) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [b.k, b.x, b.y, b.w, b.d, b.r, String(by), b.extra ? JSON.stringify(b.extra) : null]);
    return this._put(String(rows[0].id), b);
  }
  setBuild(id, o) {                          // an edit: kept at once, written to the database with the next save
    if (!this.builds.has(id)) return null; const b = this._clean(o); if (!b) return null;
    b.dirty = true; return this._put(id, b);
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
      out.push([p.id, Math.round(p.x * 100), Math.round(p.y * 100), Math.round((p.h || 0) * 1000), Math.ceil(p.hp ?? HP_MAX)]);   // + health (owner, 2026-10-14)
    }
    return out;
  }
  roster() { const out = []; for (const p of this.players.values()) out.push({ i: p.id, n: p.name, s: p.team }); return out; }
}
