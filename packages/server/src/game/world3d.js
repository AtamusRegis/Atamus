// The 3D world (owner, 2026-10-12; rebuilt from scratch 2026-10-15). One shared world inside a flat-top hexagon: a ship
// per account on two teams (Blue and Yellow, saved as "blue" / "red"), Build pieces (shapes and nebula clouds), bullets
// and beams. Every ship's numbers are its team's (ships.js, changed live in the Ship Editor). The server decides
// everything; clients send commands and predict their own ship with the same numbers.
import { pool } from "../db.js";
import { TEAMS, defaults, cleanField, curveAt, maxRange } from "./ships.js";

export const HEX_FLAT = 2_500;             // 2.5 km flat to flat "for now" (owner, 2026-10-13)
export const SPHERE_R = 50;                // what the border keeps a ship's center inside by
export const SHIP_R = 45;                  // a ship's footprint is SHIP_R x 2 square (the model's widest side)
export const LOAD_R = 1300;                // the load circle: only what's inside it is sent (where the haze turns solid)
export const SPAWN_MS = 3000;              // a ship materializes over this long (a hologram); meanwhile it can't act or be hurt
export const spawning = (p) => !!p.spawnUntil && Date.now() < p.spawnUntil;
// (owner, 2026-10-14) ship bumps: the bounce, the closing speed that does no damage (m/s), and damage per m/s above it
export const BUMP_E = 0.5, BUMP_SAFE = 15, BUMP_DMG = 0.4;
// movement constants not in the Ship Editor: the acceleration share pushing against the nose, how fast held WASD swings
// the motion round (rad/s), and the forward arc boosting allows
export const TURN_ACCEL = 0.3, VEL_TURN = 0.875, FWD_ARC = Math.PI / 4;
export const wrapA = (a) => { a %= Math.PI * 2; return a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a; };
export const accelShare = (d) => TURN_ACCEL + (1 - TURN_ACCEL) * ((1 + Math.cos(d)) / 2) ** 2;
// top speed by the push's angle off the nose: forward 100%, sideways strafe %, backward reverse % (blended between)
export function dirSpeed(d, S) { const c = Math.cos(d), st = S.strafe / 100; return c >= 0 ? st + (1 - st) * c : st + (S.reverse / 100 - st) * -c; }
// while WASD is held the velocity keeps its speed and swings toward the input at VEL_TURN; pushing more than 120 degrees
// against the motion brakes it and builds up the other way. From rest it starts straight along the input.
export function carry(vx, vy, dx, dy, target, up, down, dt) {
  let v = Math.hypot(vx, vy);
  const want = Math.atan2(dx, -dy), va0 = v > 1 ? Math.atan2(vx, -vy) : want, d = wrapA(want - va0);
  if (Math.abs(d) > Math.PI * 2 / 3 && v > 1) return steer(vx, vy, Math.sin(want) * target, -Math.cos(want) * target, up, down, dt);
  const va = va0 + Math.sign(d) * Math.min(Math.abs(d), VEL_TURN * dt);
  v = v < target ? Math.min(target, v + up * dt) : Math.max(target, v - down * dt);
  return [Math.sin(va) * v, -Math.cos(va) * v];
}
export function steer(vx, vy, tx, ty, a, brake, dt) {
  let ex = tx - vx, ey = ty - vy; const v = Math.hypot(vx, vy);
  if (v > 1e-6) {
    const ux = vx / v, uy = vy / v, par = ex * ux + ey * uy;
    if (par < 0) {                             // slowing down along the current motion brakes at up to `brake`
      const bx = ux * par, by = uy * par, px = ex - bx, py = ey - by, bl = -par, bs = Math.max(a, brake) * dt, pl = Math.hypot(px, py), ps = a * dt;
      const kb = bl > bs ? bs / bl : 1, kp = pl > ps ? ps / pl : 1; return [vx + bx * kb + px * kp, vy + by * kb + py * kp];
    }
  }
  const el = Math.hypot(ex, ey), s = a * dt; if (el > s) { ex *= s / el; ey *= s / el; } return [vx + ex, vy + ey];
}

// ---- geometry: outlines are flat lists [x0, y0, x1, y1, ...] on the ground plane ----
export const KINDS = ["square", "cylinder", "triangle", "cloud"];   // (owner, 2026-10-15) the Build menu: shapes and nebulae
export const BUILD_H = 50, BUILD_MIN = 5, BUILD_MAX = 1000, BUILD_CAP = 3000, CLOUD_THEMES = 5;
export const CLOUD_DEEP = 150;             // a nebula hides what's this far in (and its core blocks sight)
const box = (hx, hy) => [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
const boxPts = (hx, hy) => [[-hx, -hy], [0, -hy], [hx, -hy], [hx, 0], [hx, hy], [0, hy], [-hx, hy], [-hx, 0]];
const ellipse = (n = 24) => Array.from({ length: n }, (_, i) => [Math.cos(i * Math.PI * 2 / n) * 0.5, Math.sin(i * Math.PI * 2 / n) * 0.5]);
// each kind's outline in its own frame, as fractions of its footprint (x across w, y along d); the ship's hitbox box, its
// visibility points and its movement oval. A kind's saved outlines (world3d_colliders, made by the old Object Editor) are
// still used; there's no editor for them now.
export const COLL_DEFAULT = { square: [box(0.5, 0.5)], cylinder: [ellipse()], triangle: [[[0, -0.5], [0.5, 0.5], [-0.5, 0.5]]], ship: [box(0.33, 0.5556)] };
export const VIS_DEFAULT = boxPts(0.33, 0.5556);
export function toWorldPts(o, loc, pv = [0, 0]) {
  const c = Math.cos(o.r), s = Math.sin(o.r), out = [];
  for (const [ux, uy] of loc) { const lx = (ux - pv[0]) * o.w, ly = (uy - pv[1]) * o.d; out.push(o.x + lx * c - ly * s, o.y + lx * s + ly * c); }
  return out;
}
export function inPoly(x, y, v) { let c = false; for (let i = 0, n = v.length; i < n; i += 2) { const ax = v[i], ay = v[i + 1], bx = v[(i + 2) % n], by = v[(i + 3) % n]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; }
export function edgeDist(x, y, v) { let best = Infinity; for (let i = 0, n = v.length; i < n; i += 2) { const ax = v[i], ay = v[i + 1], ex = v[(i + 2) % n] - ax, ey = v[(i + 3) % n] - ay, L2 = ex * ex + ey * ey || 1e-9; const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L2)); best = Math.min(best, Math.hypot(x - ax - ex * t, y - ay - ey * t)); } return best; }
export function polyRad(o, v) { let r = 0; for (let i = 0; i < v.length; i += 2) r = Math.max(r, Math.hypot(v[i] - o.x, v[i + 1] - o.y)); return r; }
export function polyMid(v) { let x = 0, y = 0; for (let i = 0; i < v.length; i += 2) { x += v[i]; y += v[i + 1]; } return [x * 2 / v.length, y * 2 / v.length]; }
export function segPoly(x0, y0, x1, y1, v) {   // where a segment first meets an outline (0..1 along it), or null
  let best = null; const dx = x1 - x0, dy = y1 - y0;
  for (let i = 0, n = v.length; i < n; i += 2) {
    const ax = v[i], ay = v[i + 1], ex = v[(i + 2) % n] - ax, ey = v[(i + 3) % n] - ay, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - x0) * ey - (ay - y0) * ex) / den, u = ((ax - x0) * dy - (ay - y0) * dx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}
export function satPush(A, B) {                // convex against convex: how to push A out of B ({ nx, ny, d }) or null
  let best = Infinity, bx = 0, by = 0;
  for (const P of [A, B]) for (let i = 0; i < P.length; i += 2) {
    let nx = -(P[(i + 3) % P.length] - P[i + 1]), ny = P[(i + 2) % P.length] - P[i]; const L = Math.hypot(nx, ny); if (L < 1e-9) continue; nx /= L; ny /= L;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < A.length; k += 2) { const t = A[k] * nx + A[k + 1] * ny; if (t < a0) a0 = t; if (t > a1) a1 = t; }
    for (let k = 0; k < B.length; k += 2) { const t = B[k] * nx + B[k + 1] * ny; if (t < b0) b0 = t; if (t > b1) b1 = t; }
    const o = Math.min(a1, b1) - Math.max(a0, b0); if (o <= 0) return null; if (o < best) { best = o; bx = nx; by = ny; }
  }
  const [ax, ay] = polyMid(A), [cx, cy] = polyMid(B); if ((ax - cx) * bx + (ay - cy) * by < 0) { bx = -bx; by = -by; }
  return { nx: bx, ny: by, d: best };
}
export function nudge(p, n, d) { p.x += n.nx * d; p.y += n.ny * d; const vn = (p.vx || 0) * n.nx + (p.vy || 0) * n.ny; if (vn < 0) { p.vx -= vn * n.nx; p.vy -= vn * n.ny; } }
// the shield: an oval around the ship (its hitbox's box grown by SH_GROW, plus SH_PAD), unturned, in meters
export const SH_GROW = 1.42, SH_PAD = 4;
export function shieldOval(parts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const v of parts) for (const [ux, uy] of v) { x0 = Math.min(x0, ux); x1 = Math.max(x1, ux); y0 = Math.min(y0, uy); y1 = Math.max(y1, uy); }
  const D = 2 * SHIP_R; return { cx: (x0 + x1) / 2 * D, cy: (y0 + y1) / 2 * D, ax: (x1 - x0) / 2 * D * SH_GROW + SH_PAD, ay: (y1 - y0) / 2 * D * SH_GROW + SH_PAD };
}
export function segShield(x0, y0, x1, y1, px, py, h, o) {   // where along a segment it first enters the oval (null: misses, or starts inside)
  const c = Math.cos(h), s = Math.sin(h), ex = px + o.cx * c - o.cy * s, ey = py + o.cx * s + o.cy * c;
  const loc = (x, y) => { const dx = x - ex, dy = y - ey; return [(dx * c + dy * s) / o.ax, (-dx * s + dy * c) / o.ay]; };
  const [ax, ay] = loc(x0, y0), [bx, by] = loc(x1, y1), dx = bx - ax, dy = by - ay, A = dx * dx + dy * dy, B = 2 * (ax * dx + ay * dy), C = ax * ax + ay * ay - 1;
  if (C <= 0 || A < 1e-12) return null; const D = B * B - 4 * A * C; if (D < 0) return null;
  const u = (-B - Math.sqrt(D)) / (2 * A); return u >= 0 && u <= 1 ? u : null;
}
// a saved outline, checked: 3-64 points inside +-1.5 of the footprint (visibility points: 1-32)
function cleanPts(pts, min = 3, max = 64) {
  if (!Array.isArray(pts) || pts.length < min || pts.length > max) return null; const out = [];
  for (const q of pts) { if (!Array.isArray(q) || q.length !== 2) return null; const [x, y] = q.map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) return null; out.push([Math.max(-1.5, Math.min(1.5, x)), Math.max(-1.5, Math.min(1.5, y))]); }
  return out;
}
function cleanParts(v) { if (!Array.isArray(v)) return null; const out = []; for (const p of v.slice(0, 8)) { const c = p && p.pts && cleanPts(p.pts); if (c) out.push(c); } return out.length ? out : null; }   // [{ t, pts }, ...]
function cleanCloud(pts) {
  if (!Array.isArray(pts) || pts.length < 3 || pts.length > 64) return null; const out = [];
  for (const q of pts) { if (!Array.isArray(q) || q.length !== 2) return null; const [x, y] = q.map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) return null; out.push([Math.round(Math.max(-3000, Math.min(3000, x)) * 10) / 10, Math.round(Math.max(-3000, Math.min(3000, y)) * 10) / 10]); }
  return out;
}
export function cloudPoly(b) { const s = b.w / 100, c = Math.cos(b.r), n = Math.sin(b.r), out = []; for (const [lx, ly] of b.extra.pts) { const x = lx * s, y = ly * s; out.push(b.x + x * c - y * n, b.y + x * n + y * c); } return out; }
export const buildMsg = (b) => (b.extra ? [b.id, b.k, b.x, b.y, b.w, b.d, b.r, b.extra] : [b.id, b.k, b.x, b.y, b.w, b.d, b.r]);

const A = HEX_FLAT / 2 - SPHERE_R, SQ3 = Math.sqrt(3), TICK = 1 / 20;
export function inside(x, y) { return Math.abs(y) <= A && Math.abs(SQ3 * x + y) <= 2 * A && Math.abs(SQ3 * x - y) <= 2 * A; }
const PIV_W = 0.2, VIS_LO = 0.25;              // mutual visibility, as on the clients: below VIS_LO a ship isn't seen

export class World3D {
  constructor() {
    this.players = new Map();                  // id -> ship
    this.builds = new Map();                   // id -> Build piece
    this.ships = defaults();                   // team -> its numbers (the Ship Editor)
    this.coll = {}; this.vis = null; this.pivot = [0, 0];           // saved outlines by kind (read only), the ship's visibility points
    this.hits = []; this.projs = []; this.projSeq = 1; this.projEv = []; this.deaths = [];
    this.ready = this._load();
    this._saver = setInterval(() => this.saveDirty().catch((e) => console.error("world3d save", e)), 10_000);
    this._saver.unref && this._saver.unref();
  }
  async _load() {
    await pool.query(`CREATE TABLE IF NOT EXISTS world3d (user_id TEXT PRIMARY KEY, x DOUBLE PRECISION NOT NULL, y DOUBLE PRECISION NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await pool.query(`ALTER TABLE world3d ADD COLUMN IF NOT EXISTS team TEXT`);
    await pool.query(`CREATE TABLE IF NOT EXISTS world3d_builds (id BIGSERIAL PRIMARY KEY, k TEXT NOT NULL, x DOUBLE PRECISION NOT NULL, y DOUBLE PRECISION NOT NULL, w DOUBLE PRECISION NOT NULL, d DOUBLE PRECISION NOT NULL, r DOUBLE PRECISION NOT NULL, by_user TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await pool.query(`ALTER TABLE world3d_builds ADD COLUMN IF NOT EXISTS extra JSONB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS world3d_settings (k TEXT PRIMARY KEY, v JSONB)`);
    { const r = (await pool.query(`SELECT v FROM world3d_settings WHERE k = 'ships'`)).rows[0];   // the Ship Editor's numbers over the defaults
      if (r && r.v && typeof r.v === "object") for (const t of TEAMS) for (const [k, v] of Object.entries(r.v[t] || {})) { const c = cleanField(k, v); if (c !== null) this.ships[t][k] = c; } }
    if ((await pool.query(`SELECT to_regclass('world3d_colliders') AS t`)).rows[0].t) {   // the old Object Editor's outlines (kept, no editor now)
      for (const o of (await pool.query(`SELECT k, pts, parts, pivot, vis FROM world3d_colliders`)).rows) {
        if (!COLL_DEFAULT[o.k]) continue; const pv = Array.isArray(o.pivot) && o.pivot.length === 2 ? o.pivot.map(Number) : [0, 0];
        const parts = cleanParts(o.parts) || (cleanPts(o.pts) ? [cleanPts(o.pts)] : null);
        if (parts) this.coll[o.k] = parts.map((v) => v.map(([x, y]) => [x - pv[0], y - pv[1]]));   // (the pivot folded in)
        if (o.k === "ship") { const v = cleanPts(o.vis, 1, 32); if (v) this.vis = v.map(([x, y]) => [x - pv[0], y - pv[1]]); if (pv.every(Number.isFinite)) this.pivot = pv; }
      }
    }
    for (const o of (await pool.query(`SELECT id, k, x, y, w, d, r, extra FROM world3d_builds`)).rows) { const b = this._clean(o); if (b) this._put(String(o.id), b); }
    this.oval = shieldOval(this.coll.ship || COLL_DEFAULT.ship);
  }
  stats(p) { return this.ships[p.team] || this.ships.blue; }
  shipParts(p) { return (this.coll.ship || COLL_DEFAULT.ship).map((v) => toWorldPts({ x: p.x, y: p.y, w: 2 * SHIP_R, d: 2 * SHIP_R, r: p.h || 0 }, v)); }
  // the ship's movement outline: the oval in its footprint (convex), turned with its heading
  shipPoly(p) { const c = Math.cos(p.h || 0), s = Math.sin(p.h || 0), out = []; for (let i = 0; i < 16; i++) { const lx = Math.cos(i * Math.PI / 8) * SHIP_R * 0.62, ly = Math.sin(i * Math.PI / 8) * SHIP_R; out.push(p.x + lx * c - ly * s, p.y + lx * s + ly * c); } return out; }

  // ---- the Ship Editor: one number of a team's ship ----
  setStat(team, k, v) { if (!TEAMS.includes(team)) return false; const c = cleanField(k, v); if (c === null) return false; this.ships[team][k] = c; this.shipsDirty = true; return true; }
  async saveShips() { this.shipsDirty = false; await pool.query(`INSERT INTO world3d_settings (k, v) VALUES ('ships', $1) ON CONFLICT (k) DO UPDATE SET v = $1`, [JSON.stringify(this.ships)]); }

  // ---- players ----
  async savedTeam(id) { await this.ready; const { rows } = await pool.query(`SELECT team FROM world3d WHERE user_id = $1`, [String(id)]); const t = rows[0] && rows[0].team; return TEAMS.includes(t) ? t : null; }
  async join(id, name, team, resetPos = false) {
    id = String(id); let p = this.players.get(id);
    if (p) { p.name = name; if (p.team !== team) this.setTeam(id, team); if (resetPos) this.respawn(id); return p; }
    await this.ready;
    const { rows } = await pool.query(`SELECT x, y FROM world3d WHERE user_id = $1`, [id]);
    let x, y; if (!resetPos && rows[0] && inside(rows[0].x, rows[0].y)) ({ x, y } = rows[0]); else [x, y] = this.spawnSpot();
    p = { id, name, team, x, y, h: 0, dx: 0, dy: 0, vx: 0, vy: 0, dirty: true }; this.refill(p);
    await this._save(p).catch((e) => console.error("world3d join", e)); this.players.set(id, p); return p;
  }
  refill(p) { const S = this.stats(p); p.hp = S.hp; p.sh = S.shield; p.shBroken = false; p.cap = S.cap; p.ammo = S.mag; p.reloadAt = 0; p.capOut = false; p.hurtAt = 0; p.spread = 0; p.beamOn = false; p.beamOut = null; p.dead = false; }
  spawnSpot() { const a = Math.random() * Math.PI * 2, d = Math.random() * 300; return [Math.cos(a) * d, Math.sin(a) * d]; }
  setTeam(id, team) {                          // (owner, 2026-10-15) switching team: full again, materializing where it is
    const p = this.players.get(String(id)); if (!p || !TEAMS.includes(team) || p.team === team) return null;
    p.team = team; this.refill(p); p.spawnUntil = Date.now() + SPAWN_MS; p.dirty = true; return p;
  }
  teleport(id, x, y) {
    const p = this.players.get(String(id)); if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (!inside(x, y)) { const k = 0.98 * (A / Math.max(Math.abs(y), Math.abs(SQ3 * x + y) / 2, Math.abs(SQ3 * x - y) / 2, 1)); x *= Math.min(1, k); y *= Math.min(1, k); }
    p.x = x; p.y = y; p.vx = p.vy = 0; p.dx = p.dy = 0; p.dirty = true; return p;
  }
  respawn(id) { const p = this.players.get(String(id)); if (!p) return null; const [x, y] = this.spawnSpot(); this.teleport(id, x, y); this.refill(p); p.spawnUntil = Date.now() + SPAWN_MS; return p; }
  async leave(id) { const p = this.players.get(String(id)); if (!p) return; this.players.delete(p.id); await this._save(p).catch((e) => console.error("world3d leave", e)); }
  // the client's input, checked as hostile: a push (dx, dy; length clamped to 1), boost a flag, the heading it turned to
  // (no faster than its team's turn speed allows) and its aim direction
  setDir(id, dx, dy, boost, h, aim) {
    const p = this.players.get(String(id)); if (!p) return;
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
    if (spawning(p) || p.dead) { p.dx = p.dy = 0; return; }
    p.dx = dx; p.dy = dy; p.boost = boost === 1 || boost === true;
    if (typeof h === "number" && Number.isFinite(h)) {
      const now = Date.now(), dt = Math.min(0.5, (now - (p.hAt || now)) / 1000) + 0.1, mx = this.stats(p).turn * Math.PI / 180 * dt * 1.3;
      p.h = wrapA((p.h || 0) + Math.max(-mx, Math.min(mx, wrapA(h - (p.h || 0))))); p.hAt = now;
    }
    p.aim = typeof aim === "number" && Number.isFinite(aim) ? wrapA(aim) : null;
  }

  step(dt = TICK) {
    const now = Date.now();
    for (const p of this.players.values()) {
      const S = this.stats(p);
      if (p.dead) { if (now >= p.deadUntil) { this.respawn(p.id); } continue; }
      // capacitor, health and shield
      p.cap = Math.min(S.cap, (p.cap ?? S.cap) + S.capRegen * dt);
      if (p.hp > S.hp) p.hp = S.hp; if (p.sh > S.shield) p.sh = S.shield;
      const quiet = (now - (p.hurtAt || 0)) / 1000;
      if (quiet >= S.hpDelay && p.hp < S.hp) p.hp = Math.min(S.hp, p.hp + S.hpRegen * dt);
      if (S.shield > 0 && quiet >= S.shDelay && p.sh < S.shield) {
        if (!p.shBroken) p.sh = Math.min(S.shield, p.sh + S.shRegen * dt);
        else {                                 // (owner) a broken shield comes back only by spending capacitor
          let add = Math.min(S.shRegen * dt, S.shield - p.sh); if (S.shRestoreCap > 0) add = Math.min(add, p.cap / S.shRestoreCap);
          p.sh += add; p.cap -= add * S.shRestoreCap; if (p.sh >= S.shield - 1e-6) { p.sh = S.shield; p.shBroken = false; }
        }
      }
      if (p.reloadAt && now >= p.reloadAt) { p.reloadAt = 0; p.ammo = S.mag; }
      if (p.ammo > S.mag) p.ammo = S.mag;
      // movement
      const moving = !!(p.dx || p.dy), want = moving ? Math.atan2(p.dx, -p.dy) : 0, d = moving ? wrapA(want - (p.h || 0)) : 0;
      if (p.cap <= 0.001) p.capOut = true; else if (p.capOut && p.cap >= S.boostMin) p.capOut = false;
      const boosting = !!p.boost && moving && Math.abs(d) <= FWD_ARC && !p.capOut && S.boost > 0;
      if (boosting) p.cap = Math.max(0, p.cap - S.boostCap * dt);
      const vx0 = p.vx || 0, vy0 = p.vy || 0;
      if (!moving && !vx0 && !vy0) continue;
      const spd = S.speed * dirSpeed(d, S) * (boosting ? 1 + S.boost / 100 : 1);
      [p.vx, p.vy] = moving ? carry(vx0, vy0, p.dx, p.dy, spd * Math.min(1, Math.hypot(p.dx, p.dy)), S.accel * accelShare(d), S.brake, dt) : steer(vx0, vy0, 0, 0, S.brake, S.brake, dt);
      if (Math.hypot(p.vx, p.vy) < 0.01 && !moving) { p.vx = p.vy = 0; continue; }
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (inside(nx, ny)) { p.x = nx; p.y = ny; }
      else { let lo = 0, hi = 1; for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; inside(p.x + (nx - p.x) * m, p.y + (ny - p.y) * m) ? (lo = m) : (hi = m); } p.x += (nx - p.x) * lo; p.y += (ny - p.y) * lo; p.vx = p.vy = 0; }
      p.dirty = true;
    }
    this.collide();
    this.stepBeams(dt, now);
    this.stepProjs(dt);
  }
  alive(p) { return !p.dead; }
  collide() {
    const ps = [...this.players.values()].filter((p) => !p.dead), keep = (p, f) => { const ox = p.x, oy = p.y; f(); if (!inside(p.x, p.y)) { p.x = ox; p.y = oy; } p.dirty = true; };
    const polys = new Map(ps.map((p) => [p, this.shipPoly(p)]));
    for (const p of ps) for (const b of this.builds.values()) {
      if (b.k === "cloud") continue; const dx = p.x - b.x, dy = p.y - b.y, R = b.rad + SHIP_R; if (dx * dx + dy * dy > R * R) continue;
      for (const v of b.polys) { const n = satPush(polys.get(p), v); if (n) { keep(p, () => nudge(p, n, n.d)); polys.set(p, this.shipPoly(p)); } }
    }
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j]; if (Math.abs(a.x - b.x) > 2 * SHIP_R || Math.abs(a.y - b.y) > 2 * SHIP_R) continue;
      const n = satPush(polys.get(a), polys.get(b)); if (!n) continue;
      keep(a, () => { a.x += n.nx * n.d / 2; a.y += n.ny * n.d / 2; }); keep(b, () => { b.x -= n.nx * n.d / 2; b.y -= n.ny * n.d / 2; });
      const vn = ((a.vx || 0) - (b.vx || 0)) * n.nx + ((a.vy || 0) - (b.vy || 0)) * n.ny;   // closing speed along the contact (negative: closing)
      if (vn < 0) {
        const j2 = -(1 + BUMP_E) * vn / 2; a.vx += j2 * n.nx; a.vy += j2 * n.ny; b.vx -= j2 * n.nx; b.vy -= j2 * n.ny;
        const dmg = Math.max(0, -vn - BUMP_SAFE) * BUMP_DMG, sa = dmg > 0 && this.hurt(a, dmg), sb = dmg > 0 && this.hurt(b, dmg);
        if (-vn > 5) {                         // sparks where they met, spraying back toward the ship that drove in harder
          const sup = (P, dx, dy) => { let bi = 0, bv = -Infinity; for (let k = 0; k < P.length; k += 2) { const v = P[k] * dx + P[k + 1] * dy; if (v > bv) { bv = v; bi = k; } } return [P[bi], P[bi + 1]]; };
          const pa = sup(polys.get(a), -n.nx, -n.ny), pb = sup(polys.get(b), n.nx, n.ny), inA = -(a.vx * n.nx + a.vy * n.ny), inB = b.vx * n.nx + b.vy * n.ny, sg = inA >= inB ? 1 : -1;
          this.hits.push({ x: (pa[0] + pb[0]) / 2, y: (pa[1] + pb[1]) / 2, s: Math.round(-vn * 4), a: a.id, b: b.id, dx: n.nx * sg, dy: n.ny * sg, sa, sb });
        }
      }
      polys.set(a, this.shipPoly(a)); polys.set(b, this.shipPoly(b));
    }
  }
  // damage: the shield takes it first (what's left goes on), then armor takes its share off the hull's. Returns whether
  // the shield took any. At 0 health the ship is dead for its team's respawn time.
  hurt(p, d) {
    if (spawning(p) || p.dead || !(d > 0)) return false;
    const S = this.stats(p); p.hurtAt = Date.now(); let shield = false;
    if (p.sh > 0) { const take = Math.min(p.sh, d); p.sh -= take; d -= take; shield = true; if (p.sh <= 1e-6) { p.sh = 0; p.shBroken = true; } }
    if (d <= 0) return shield;
    p.hp -= d * (1 - S.armor / 100);
    if (p.hp <= 0) { p.hp = 0; p.dead = true; p.deadUntil = Date.now() + S.respawn * 1000; p.vx = p.vy = p.dx = p.dy = 0; p.beamOn = false; p.beamOut = null; this.deaths.push(p.id); }
    return shield;
  }

  // ---- weapons ----
  canFire(p) { return !p.dead && !spawning(p) && !p.reloadAt && p.ammo > 0; }
  // a bullet from a player: (dx, dy) the direction, checked as hostile; its team's rate, ammo, capacitor and spread
  fire(id, dx, dy) {
    const p = this.players.get(String(id)); if (!p || !this.canFire(p)) return null;
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-6) return null;
    const S = this.stats(p), now = Date.now(); if (S.wtype !== 0) return null;
    if (p.lastFire && now - p.lastFire < 1000 / S.rate - 30) return null;
    if (p.cap < S.capUse) return null;
    p.lastFire = now; p.cap -= S.capUse; p.ammo -= 1; if (p.ammo <= 0) { p.ammo = 0; p.reloadAt = now + S.reload * 1000; }   // (empty: it reloads by itself)
    const ex = Math.max(0, (p.spread || 0) - S.spreadBack * (now - (p.spreadT || now)) / 1000), sp = Math.min(S.spreadMax, S.spread0 + ex), off = (Math.random() * 2 - 1) * sp * Math.PI / 180;
    p.spread = Math.min(Math.max(0, S.spreadMax - S.spread0), ex + S.spreadAdd); p.spreadT = now;
    const c = Math.cos(off), s = Math.sin(off), L = Math.hypot(dx, dy); [dx, dy] = [(dx * c - dy * s) / L, (dx * s + dy * c) / L];
    const q = { id: this.projSeq++, a: p.id, team: p.team, x: p.x, y: p.y, ux: dx, uy: dy, went: 0, age: 0, S: { optimal: S.optimal, falloff: S.falloff, bspeed: S.bspeed, spdEnd: S.spdEnd, spdCurve: S.spdCurve, dmg: S.dmg, dmgEnd: S.dmgEnd, dmgCurve: S.dmgCurve } };
    this.projs.push(q); this.projEv.push({ t: "proj", q });
    return q;
  }
  // R: reload (not full, not already reloading)
  reload(id) { const p = this.players.get(String(id)); if (!p || p.dead || p.reloadAt) return false; const S = this.stats(p); if (p.ammo >= S.mag) return false; p.reloadAt = Date.now() + S.reload * 1000; return true; }
  // what a shot / beam meets first along a segment: blocks (Build shapes), then ships (their shield oval while it's up,
  // else their hitbox); a ship the shooter can't see is passed through. { t, hit, shield }
  trace(x0, y0, x1, y1, shooter) {
    let t = 2, hit = null, shield = false;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2;
    for (const b of this.builds.values()) { if (b.k === "cloud" || Math.hypot(b.x - mx, b.y - my) > R + b.rad) continue; for (const v of b.polys) { const u = segPoly(x0, y0, x1, y1, v); if (u !== null && u < t) { t = u; hit = null; shield = false; } } }
    const O = this.oval, OR = Math.max(O.ax, O.ay) + Math.hypot(O.cx, O.cy);
    for (const p of this.players.values()) {
      if (p === shooter || p.dead || spawning(p) || Math.hypot(p.x - mx, p.y - my) > R + OR + SHIP_R) continue;
      let u = null, sh = false;
      if (p.sh > 0) { u = segShield(x0, y0, x1, y1, p.x, p.y, p.h || 0, O); if (u !== null) sh = true; }
      if (u === null) for (const v of this.shipParts(p)) { const w = segPoly(x0, y0, x1, y1, v); if (w !== null && (u === null || w < u)) u = w; }
      if (u === null || u >= t) continue;
      if (shooter && !this.sees(shooter, p)) continue;
      t = u; hit = p; shield = sh;
    }
    return { t, hit, shield };
  }
  stepProjs(dt) {
    for (let k = this.projs.length - 1; k >= 0; k--) {
      const q = this.projs[k], S = q.S, end = maxRange(S), v = S.bspeed * curveAt(q.went, S, S.spdEnd, S.spdCurve);
      q.age += dt; const step = Math.min(end - q.went, Math.max(0, v) * dt);
      const x1 = q.x + q.ux * step, y1 = q.y + q.uy * step, r = this.trace(q.x, q.y, x1, y1, this.players.get(q.a));
      if (r.t <= 1) {
        const x = q.x + (x1 - q.x) * r.t, y = q.y + (y1 - q.y) * r.t, at = q.went + step * r.t;
        if (r.hit) this.hurt(r.hit, S.dmg * curveAt(at, S, S.dmgEnd, S.dmgCurve));
        this.projEv.push({ t: "pend", i: q.id, x, y, h: r.hit ? r.hit.id : null, s: 1, sh: r.shield ? 1 : 0 }); this.projs.splice(k, 1); continue;
      }
      q.x = x1; q.y = y1; q.went += step;
      if (q.went >= end - 0.01 || v < 1 || q.age > 20 || !inside(q.x, q.y)) { this.projEv.push({ t: "pend", i: q.id, x: q.x, y: q.y, h: null, s: 0 }); this.projs.splice(k, 1); }
    }
  }
  // a beam held on: {on, x, y} the wanted direction (checked as hostile); the server turns it there at the team's
  // rotation speed. It drains ammo (rate a second) and capacitor (capUse a second); out of either, it stops.
  setBeam(id, on, dx, dy) {
    const p = this.players.get(String(id)); if (!p) return;
    if (!on || this.stats(p).wtype !== 1) { p.beamOn = false; p.beamOut = null; return; }
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-6) return;
    const want = Math.atan2(dy, dx); if (!p.beamOn) p.beamA = want;   // a new beam starts where you aim
    p.beamOn = true; p.beamWant = want; p.beamSeen = Date.now();
  }
  stepBeams(dt, now) {
    for (const p of this.players.values()) {
      if (!p.beamOn) { p.beamOut = null; continue; }
      const S = this.stats(p);
      if (S.wtype !== 1 || now - (p.beamSeen || 0) > 600 || !this.canFire(p) || p.cap < S.capUse * dt) { p.beamOn = p.beamOn && S.wtype === 1 && now - (p.beamSeen || 0) <= 600; p.beamOut = null; continue; }   // (held but empty / reloading: no beam)
      const st = S.rot * 1.15 * Math.PI / 180 * dt; p.beamA = wrapA(p.beamA + Math.max(-st, Math.min(st, wrapA(p.beamWant - p.beamA))));
      p.ammo -= S.rate * dt; p.cap -= S.capUse * dt; if (p.ammo <= 0) { p.ammo = 0; p.reloadAt = now + S.reload * 1000; }
      const L = maxRange(S), x1 = p.x + Math.cos(p.beamA) * L, y1 = p.y + Math.sin(p.beamA) * L, r = this.trace(p.x, p.y, x1, y1, p);
      const t = Math.min(1, r.t), at = L * t;
      if (r.hit) this.hurt(r.hit, S.dmg * curveAt(at, S, S.dmgEnd, S.dmgCurve) * dt);
      p.beamOut = { a: p.beamA, len: at, hit: r.hit ? (r.shield ? 2 : 1) : 0 };
    }
  }

  // ---- sight: can a and b make each other out (mutual visibility from the visibility points, blocked by Build shapes)?
  _blocked(x0, y0, x1, y1) {
    const X0 = Math.min(x0, x1), X1 = Math.max(x0, x1), Y0 = Math.min(y0, y1), Y1 = Math.max(y0, y1);
    for (const b of this.builds.values()) { if (b.k === "cloud" || b.x + b.rad < X0 || b.x - b.rad > X1 || b.y + b.rad < Y0 || b.y - b.rad > Y1) continue; for (const v of b.polys) if (segPoly(x0, y0, x1, y1, v) !== null) return true; }
    return false;
  }
  sees(a, b) {
    const pts = (p) => toWorldPts({ x: p.x, y: p.y, w: 2 * SHIP_R, d: 2 * SHIP_R, r: p.h || 0 }, this.vis || VIS_DEFAULT);
    const P = pts(a), Q = pts(b); let clear = 0;
    for (let i = 0; i < P.length; i += 2) if (!this._blocked(P[i], P[i + 1], b.x, b.y)) clear++;
    for (let i = 0; i < Q.length; i += 2) if (!this._blocked(Q[i], Q[i + 1], a.x, a.y)) clear++;
    return (this._blocked(a.x, a.y, b.x, b.y) ? 0 : PIV_W) + (1 - PIV_W) * clear / Math.max(1, (P.length + Q.length) / 2) > VIS_LO;
  }

  // ---- (owner, 2026-10-13) Build pieces, checked as hostile: a known kind, finite numbers, inside the map, sizes clamped ----
  _clean(o) {
    if (!o || !KINDS.includes(o.k)) return null;
    const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null), x = n(+o.x), y = n(+o.y), w = n(+o.w), d = n(+o.d), r = n(+o.r);
    if (x === null || y === null || w === null || d === null || r === null || !inside(x, y)) return null;
    const cl = (v) => Math.max(BUILD_MIN, Math.min(BUILD_MAX, v)), rd = (v) => Math.round(v * 100) / 100;
    const b = { k: o.k, x: rd(x), y: rd(y), w: rd(cl(w)), d: rd(cl(d)), r: Math.round(wrapA(r) * 10000) / 10000 };
    if (o.k === "cloud") { const e = o.extra || {}, pts = cleanCloud(e.pts); if (!pts) return null; b.extra = { pts, v: Number.isInteger(e.v) && e.v >= 0 && e.v < CLOUD_THEMES ? e.v : 0 }; b.d = b.w; }
    return b;
  }
  _put(id, b) {
    b.id = id;
    if (b.k === "cloud") { b.poly = cloudPoly(b); b.polys = []; b.rad = polyRad(b, b.poly); }
    else { b.polys = (this.coll[b.k] || COLL_DEFAULT[b.k]).map((v) => toWorldPts(b, v)); b.rad = Math.max(...b.polys.map((v) => polyRad(b, v))); }
    this.builds.set(id, b); return b;
  }
  buildList() { return [...this.builds.values()].map(buildMsg); }
  async addBuild(o, by) {
    const b = this._clean(o); if (!b || this.builds.size >= BUILD_CAP) return null; await this.ready;
    const { rows } = await pool.query(`INSERT INTO world3d_builds (k, x, y, w, d, r, by_user, extra) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [b.k, b.x, b.y, b.w, b.d, b.r, String(by), b.extra ? JSON.stringify(b.extra) : null]);
    return this._put(String(rows[0].id), b);
  }
  setBuild(id, o) { if (!this.builds.has(id)) return null; const b = this._clean(o); if (!b) return null; b.dirty = true; return this._put(id, b); }
  async delBuild(id) { if (!this.builds.delete(id)) return false; await pool.query(`DELETE FROM world3d_builds WHERE id = $1`, [id]); return true; }

  async _save(p) { await this.ready; await pool.query(`INSERT INTO world3d (user_id, x, y, team, updated_at) VALUES ($1, $2, $3, $4, now()) ON CONFLICT (user_id) DO UPDATE SET x = $2, y = $3, team = $4, updated_at = now()`, [p.id, p.x, p.y, p.team || null]); p.dirty = false; }
  async saveDirty() {
    for (const p of this.players.values()) if (p.dirty) await this._save(p);
    for (const b of this.builds.values()) if (b.dirty) { b.dirty = false; await pool.query(`UPDATE world3d_builds SET k = $2, x = $3, y = $4, w = $5, d = $6, r = $7, extra = $8, updated_at = now() WHERE id = $1`, [b.id, b.k, b.x, b.y, b.w, b.d, b.r, b.extra ? JSON.stringify(b.extra) : null]); }
    if (this.shipsDirty) await this.saveShips();
  }
  // every ship in the viewer's load circle: [id, x (cm), y (cm), heading (mrad), health, shield, beam | null, materializing
  // (hundredths of a second left) | null, dead 0 / 1]; beam: [angle (mrad), length (m), hit: 0 nothing / 1 ship / 2 shield]
  snapshotFor(viewer) {
    const out = [], R2 = LOAD_R * LOAD_R, now = Date.now();
    for (const p of this.players.values()) {
      const dx = p.x - viewer.x, dy = p.y - viewer.y; if (p !== viewer && dx * dx + dy * dy > R2) continue;
      out.push([p.id, Math.round(p.x * 100), Math.round(p.y * 100), Math.round((p.h || 0) * 1000), Math.ceil(p.hp), Math.ceil(p.sh),
        p.beamOut ? [Math.round(p.beamOut.a * 1000), Math.round(p.beamOut.len), p.beamOut.hit] : null,
        spawning(p) ? Math.ceil((p.spawnUntil - now) / 10) : null, p.dead ? 1 : 0]);
    }
    return out;
  }
  roster() { return [...this.players.values()].map((p) => ({ i: p.id, n: p.name, s: p.team })); }
}
