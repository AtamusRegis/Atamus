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
    this.blockSeq = 1;                // id -> { id, name, x, y, dx, dy, dirty }
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

  async _save(p) {
    await this.ready;
    await pool.query(
      `INSERT INTO world3d (user_id, x, y, team, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id) DO UPDATE SET x = $2, y = $3, team = $4, updated_at = now()`, [p.id, p.x, p.y, p.team || null]);
    p.dirty = false;
  }
  async saveDirty() { for (const p of this.players.values()) if (p.dirty) await this._save(p); }

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
