// The 3D world (owner, 2026-10-12; rebuilt from scratch 2026-10-15; "rebuild a bit" 2026-10-15). One shared world inside a
// flat-top hexagon: a ship per account on two teams (Blue and Yellow, saved as "blue" / "red"), every ship the same, each
// player picking two weapons and a charged ability and buying upgrade levels with credits (from asteroids and kills).
// Each team has a station (near it repairs; destroying the enemy's wins the match), capture points give the holding team a
// buff. Build pieces (shapes, nebula clouds, capture points). The server decides everything; clients send commands and
// predict their own ship with the numbers they're sent.
import { pool } from "../db.js";
import { TEAMS, SHIP, WEAPONS, WEAPON_KINDS, ABILITIES, ABILITY_KINDS, UPGRADES, LV_MAX, upCost, UP_STEP, BUFF, CAPTURE_TIME, CREDITS, STATION, MATCH_WAIT, ASTEROIDS, curveAt, maxRange } from "./ships.js";

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
export const KINDS = ["square", "cylinder", "triangle", "cloud", "capture"];   // (owner, 2026-10-15) the Build menu: shapes, nebulae and capture points
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

export const STATION_AT = { blue: [-STATION.x, 0], red: [STATION.x, 0] };   // Blue's station in the west, Yellow's in the east
export const MOB_R = 12;                       // a missile's or drone's hitbox radius
const circle = (x, y, r, n = 16) => { const out = []; for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n; out.push(x + Math.cos(a) * r, y + Math.sin(a) * r); } return out; };
// where a segment first enters a circle (0..1), 0 if it starts inside, or null
function segCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0, fx = x0 - cx, fy = y0 - cy, a = dx * dx + dy * dy, c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0; if (a < 1e-12) return null;
  const b = 2 * (fx * dx + fy * dy), D = b * b - 4 * a * c; if (D < 0) return null;
  const t = (-b - Math.sqrt(D)) / (2 * a); return t >= 0 && t <= 1 ? t : null;
}
const cleanLoad = (v) => { if (!Array.isArray(v) || v.length !== 2 || !WEAPON_KINDS.includes(v[0]) || !WEAPON_KINDS.includes(v[1]) || v[0] === v[1]) return null; return [v[0], v[1]]; };
const freshLv = () => Object.fromEntries(UPGRADES.map(([k]) => [k, 1]));
const cleanLv = (v) => { const o = freshLv(); if (v && typeof v === "object") for (const [k] of UPGRADES) { const n = Math.round(Number(v[k])); if (n >= 1 && n <= LV_MAX) o[k] = n; } return o; };
const isCloaked = (p) => p.abOn && p.ab === "cloak";

export class World3D {
  constructor() {
    this.players = new Map();                  // id -> ship
    this.builds = new Map();                   // id -> Build piece
    this.coll = {}; this.vis = null; this.pivot = [0, 0];           // saved outlines by kind (read only), the ship's visibility points
    this.hits = []; this.projs = []; this.projSeq = 1; this.projEv = []; this.deaths = [];
    this.fx = [];                              // effects for the players near them: { k, x, y, ... }
    this.msgs = [];                            // messages: { to: account id (or null: everyone), m }
    this.mobs = []; this.mobSeq = 1;           // missiles and drones in flight
    this.rocks = new Map(); this.rockSeq = 1; this.rockDirty = new Set(); this.rockGone = []; this.rockWait = [];
    this.stations = Object.fromEntries(TEAMS.map((t) => [t, { team: t, x: STATION_AT[t][0], y: STATION_AT[t][1], hp: STATION.hp, poly: circle(STATION_AT[t][0], STATION_AT[t][1], STATION.r, 24) }]));
    this.stDirty = true; this.match = { n: 1, win: null, winAt: 0 }; this.matchDirty = false;
    this.caps = new Map(); this.capDirty = true; this.teamBuffs = { blue: new Set(), red: new Set() };
    this.ready = this._load();
    this._saver = setInterval(() => this.saveDirty().catch((e) => console.error("world3d save", e)), 10_000);
    this._saver.unref && this._saver.unref();
  }
  async _load() {
    await pool.query(`CREATE TABLE IF NOT EXISTS world3d (user_id TEXT PRIMARY KEY, x DOUBLE PRECISION NOT NULL, y DOUBLE PRECISION NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await pool.query(`ALTER TABLE world3d ADD COLUMN IF NOT EXISTS team TEXT`);
    await pool.query(`ALTER TABLE world3d ADD COLUMN IF NOT EXISTS credits DOUBLE PRECISION NOT NULL DEFAULT 0`);   // (the 2D game's credits stay untouched)
    await pool.query(`ALTER TABLE world3d ADD COLUMN IF NOT EXISTS loadout JSONB`);   // { w: [primary, secondary], a: ability }
    await pool.query(`ALTER TABLE world3d ADD COLUMN IF NOT EXISTS levels JSONB`);
    await pool.query(`ALTER TABLE world3d ADD COLUMN IF NOT EXISTS match INTEGER NOT NULL DEFAULT 0`);   // the match its credits and levels belong to
    await pool.query(`CREATE TABLE IF NOT EXISTS world3d_builds (id BIGSERIAL PRIMARY KEY, k TEXT NOT NULL, x DOUBLE PRECISION NOT NULL, y DOUBLE PRECISION NOT NULL, w DOUBLE PRECISION NOT NULL, d DOUBLE PRECISION NOT NULL, r DOUBLE PRECISION NOT NULL, by_user TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await pool.query(`ALTER TABLE world3d_builds ADD COLUMN IF NOT EXISTS extra JSONB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS world3d_settings (k TEXT PRIMARY KEY, v JSONB)`);
    { const r = (await pool.query(`SELECT v FROM world3d_settings WHERE k = 'match'`)).rows[0];   // the match number and the stations' health
      if (r && r.v && typeof r.v === "object") { if (Number.isInteger(r.v.n) && r.v.n > 0) this.match.n = r.v.n; for (const t of TEAMS) { const h = Number(r.v[t]); if (Number.isFinite(h) && h > 0) this.stations[t].hp = Math.min(STATION.hp, h); } } }
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
    for (let i = 0; i < ASTEROIDS.n; i++) this.spawnRock();
  }
  stats(p) { return p.eff || (p.eff = this.computeEff(p)); }
  // a ship's numbers now: the ship, its upgrade levels, its team's capture buffs and its active ability
  computeEff(p) {
    const L = p.lv || freshLv(), B = this.teamBuffs[p.team] || new Set(), a = p.abOn ? p.ab : null, lv = (k) => (L[k] || 1) - 1;
    const e = { ...SHIP };
    e.hp = SHIP.hp * (1 + UP_STEP.hp / 100 * lv("hp")) * (B.has(0) ? 1 + BUFF.hp / 100 : 1);
    const sm = (1 + UP_STEP.speed / 100 * lv("speed")) * (B.has(1) ? 1 + BUFF.speed / 100 : 1) * (a === "speed" ? 1 + ABILITIES.speed.mul / 100 : 1);
    e.speed = SHIP.speed * sm; e.accel = SHIP.accel * sm; e.turn = SHIP.turn * Math.sqrt(sm); e.turnAccel = SHIP.turnAccel * Math.sqrt(sm);
    let arm = Math.min(90, SHIP.armor + UP_STEP.armor * lv("armor") + (B.has(4) ? BUFF.armor : 0));
    if (a === "armor") arm = 100 - (100 - arm) * (1 - ABILITIES.armor.cut / 100);
    e.armor = arm;
    e.dmgMul = (1 + UP_STEP.dmg / 100 * lv("dmg")) * (B.has(3) ? 1 + BUFF.dmg / 100 : 1) * (a === "damage" ? 1 + ABILITIES.damage.mul / 100 : 1);
    e.hpRegen = SHIP.hpRegen + UP_STEP.regen * lv("regen") + (B.has(5) ? BUFF.regen : 0);
    e.capRegen = SHIP.capRegen * (1 + UP_STEP.energy / 100 * lv("energy")) * (B.has(5) ? 1 + BUFF.energy / 100 : 1);
    e.rangeMul = B.has(2) ? 1 + BUFF.range / 100 : 1;
    return e;
  }
  // a weapon's numbers for this ship (its damage and range bonuses in)
  wstat(p, kind) {
    const W = WEAPONS[kind], e = this.stats(p), o = { ...W, dmg: W.dmg * e.dmgMul };
    if (W.optimal !== undefined) { o.optimal = W.optimal * e.rangeMul; o.falloff = W.falloff * e.rangeMul; }
    if (W.life !== undefined) o.life = W.life * e.rangeMul; if (W.seek !== undefined) o.seek = W.seek * e.rangeMul;
    return o;
  }
  shipParts(p) { return (this.coll.ship || COLL_DEFAULT.ship).map((v) => toWorldPts({ x: p.x, y: p.y, w: 2 * SHIP_R, d: 2 * SHIP_R, r: p.h || 0 }, v)); }
  // the ship's movement outline: the oval in its footprint (convex), turned with its heading
  shipPoly(p) { const c = Math.cos(p.h || 0), s = Math.sin(p.h || 0), out = []; for (let i = 0; i < 16; i++) { const lx = Math.cos(i * Math.PI / 8) * SHIP_R * 0.62, ly = Math.sin(i * Math.PI / 8) * SHIP_R; out.push(p.x + lx * c - ly * s, p.y + lx * s + ly * c); } return out; }
  // everything solid a ship bumps into: Build shapes, asteroids, the stations ({ x, y, rad, polys })
  *solids() {
    for (const b of this.builds.values()) if (b.polys.length) yield b;
    for (const r of this.rocks.values()) yield r;
    for (const s of Object.values(this.stations)) yield { x: s.x, y: s.y, rad: STATION.r, polys: [s.poly] };
  }

  // ---- players ----
  async savedTeam(id) { await this.ready; const { rows } = await pool.query(`SELECT team FROM world3d WHERE user_id = $1`, [String(id)]); const t = rows[0] && rows[0].team; return TEAMS.includes(t) ? t : null; }
  async join(id, name, team) {
    id = String(id); let p = this.players.get(id);
    if (p) { p.name = name; if (p.team !== team) this.setTeam(id, team); return p; }
    await this.ready;
    const { rows } = await pool.query(`SELECT credits, loadout, levels, match FROM world3d WHERE user_id = $1`, [id]), r = rows[0] || {};
    const same = r.match === this.match.n, lo = r.loadout || {};   // (credits and levels belong to one match)
    p = { id, name, team, x: 0, y: 0, h: 0, dx: 0, dy: 0, vx: 0, vy: 0, dirty: true, credits: same && Number.isFinite(+r.credits) ? +r.credits : 0,
      lv: same ? cleanLv(r.levels) : freshLv(), load: cleanLoad(lo.w) || ["bullets", "missiles"], ab: ABILITY_KINDS.includes(lo.a) ? lo.a : "shield", w: {}, abCharge: 1e9 };
    this.place(p); this.refill(p);
    await this._save(p).catch((e) => console.error("world3d join", e)); this.players.set(id, p); return p;
  }
  refill(p) {
    p.abOn = false; p.chain = null; p.eff = this.computeEff(p); const S = p.eff;
    p.hp = S.hp; p.hpMax = S.hp; p.sh = 0; p.cap = S.cap; p.hurtAt = 0; p.beamOn = false; p.beamOut = null; p.dead = false;
    for (const k of p.load) p.w[k] = { ammo: WEAPONS[k].mag, reloadAt: 0, last: 0, spread: 0, spreadT: 0 };
    if (p.abCharge > ABILITIES[p.ab].charge) p.abCharge = ABILITIES[p.ab].charge;
  }
  // a spot near the team's station, facing the middle of the map
  place(p) {
    const [sx, sy] = STATION_AT[p.team] || [0, 0], face = Math.atan2(-sy, -sx);
    for (let i = 0; i < 30; i++) {
      const a = face + (Math.random() * 2 - 1) * Math.PI / 3, d = 170 + Math.random() * 110, x = sx + Math.cos(a) * d, y = sy + Math.sin(a) * d;
      if (!inside(x, y)) continue; let ok = true;
      for (const s of this.solids()) if (Math.hypot(s.x - x, s.y - y) < s.rad + SHIP_R) { ok = false; break; }
      if (ok || i === 29) { p.x = x; p.y = y; break; }
    }
    p.h = sx < 0 ? Math.PI / 2 : -Math.PI / 2;   // (the nose is (sin h, -cos h): east +pi/2, west -pi/2)
    p.vx = p.vy = p.dx = p.dy = 0; p.dirty = true;
  }
  setTeam(id, team) {                          // (owner, 2026-10-15) switching team: full again, at the new team's station
    const p = this.players.get(String(id)); if (!p || !TEAMS.includes(team) || p.team === team) return null;
    this.dropMobs(p); p.team = team; this.place(p); this.refill(p); p.spawnUntil = Date.now() + SPAWN_MS; p.dirty = true;
    this.msgs.push({ to: p.id, m: { t: "teleport", x: p.x, y: p.y, h: p.h } }); return p;
  }
  teleport(id, x, y) {
    const p = this.players.get(String(id)); if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (!inside(x, y)) { const k = 0.98 * (A / Math.max(Math.abs(y), Math.abs(SQ3 * x + y) / 2, Math.abs(SQ3 * x - y) / 2, 1)); x *= Math.min(1, k); y *= Math.min(1, k); }
    p.x = x; p.y = y; p.vx = p.vy = 0; p.dx = p.dy = 0; p.dirty = true; return p;
  }
  respawn(id) { const p = this.players.get(String(id)); if (!p) return null; this.place(p); this.refill(p); p.spawnUntil = Date.now() + SPAWN_MS; return p; }
  async leave(id) { const p = this.players.get(String(id)); if (!p) return; this.dropMobs(p); this.players.delete(p.id); await this._save(p).catch((e) => console.error("world3d leave", e)); }
  // the client's input, checked as hostile: a push (dx, dy; length clamped to 1) and the heading it turned to (no faster
  // than the ship's turn speed allows)
  setDir(id, dx, dy, h) {
    const p = this.players.get(String(id)); if (!p) return;
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
    if (spawning(p) || p.dead) { p.dx = p.dy = 0; return; }
    p.dx = dx; p.dy = dy;
    if (typeof h === "number" && Number.isFinite(h)) {
      const now = Date.now(), dt = Math.min(0.5, (now - (p.hAt || now)) / 1000) + 0.1, mx = this.stats(p).turn * Math.PI / 180 * dt * 1.3;
      p.h = wrapA((p.h || 0) + Math.max(-mx, Math.min(mx, wrapA(h - (p.h || 0))))); p.hAt = now;
    }
  }
  // ---- the Hangar: weapons and ability (apply at once), upgrades ----
  setGear(id, w0, w1, ab) {
    const p = this.players.get(String(id)); if (!p) return false;
    const load = cleanLoad([w0, w1]); if (!load || !ABILITY_KINDS.includes(ab)) return false;
    const now = Date.now();
    for (const k of load) if (!p.load.includes(k)) {   // a weapon newly fitted starts reloading
      p.w[k] = { ammo: 0, reloadAt: now + WEAPONS[k].reload * 1000, last: 0, spread: 0, spreadT: 0 };
      if (k === "beam") { p.beamOn = false; p.beamOut = null; }
    }
    for (const k of p.load) if (!load.includes(k)) { delete p.w[k]; if (k === "drones") this.dropMobs(p, 1); }
    if (!load.includes("beam")) { p.beamOn = false; p.beamOut = null; }
    p.load = load;
    if (ab !== p.ab) { if (p.abOn) this.endAbility(p); p.ab = ab; p.abCharge = 0; }
    p.eff = this.computeEff(p); p.dirty = true; return true;
  }
  upgrade(id, k) {
    const p = this.players.get(String(id)); if (!p || !UPGRADES.some(([u]) => u === k)) return false;
    const lv = p.lv[k] || 1, cost = upCost(lv); if (lv >= LV_MAX || p.credits < cost) return false;
    p.credits -= cost; p.lv[k] = lv + 1; p.dirty = true; return true;
  }

  step(dt = TICK) {
    const now = Date.now();
    this.updateCaptures(dt);
    for (const p of this.players.values()) {
      const S = p.eff = this.computeEff(p);
      if (S.hp > (p.hpMax || S.hp) && !p.dead) p.hp += S.hp - p.hpMax;   // more health from a level or a buff: the extra comes full
      p.hpMax = S.hp;
      if (p.dead) { if (now >= p.deadUntil) this.respawn(p.id); continue; }
      // the ability: charging, or running out
      const AB = ABILITIES[p.ab];
      if (p.abOn) { if (now >= p.abUntil) this.endAbility(p); } else if (p.abCharge < AB.charge) p.abCharge = Math.min(AB.charge, p.abCharge + dt);
      // capacitor and health (and a team's station repairs its ships near it)
      p.cap = Math.min(S.cap, (p.cap ?? S.cap) + S.capRegen * dt);
      if (p.hp > S.hp) p.hp = S.hp;
      if ((now - (p.hurtAt || 0)) / 1000 >= S.hpDelay && p.hp < S.hp) p.hp = Math.min(S.hp, p.hp + S.hpRegen * dt);
      { const st = this.stations[p.team]; if (st && st.hp > 0 && Math.hypot(p.x - st.x, p.y - st.y) <= STATION.reach) { p.hp = Math.min(S.hp, p.hp + STATION.heal * dt); p.cap = Math.min(S.cap, p.cap + STATION.healCap * dt); } }
      for (const k of p.load) { const w = p.w[k]; if (w && w.reloadAt && now >= w.reloadAt) { w.reloadAt = 0; w.ammo = WEAPONS[k].mag; } }
      // movement
      const moving = !!(p.dx || p.dy), want = moving ? Math.atan2(p.dx, -p.dy) : 0, d = moving ? wrapA(want - (p.h || 0)) : 0;
      const vx0 = p.vx || 0, vy0 = p.vy || 0;
      if (!moving && !vx0 && !vy0) continue;
      const spd = S.speed * dirSpeed(d, S);
      [p.vx, p.vy] = moving ? carry(vx0, vy0, p.dx, p.dy, spd * Math.min(1, Math.hypot(p.dx, p.dy)), S.accel * accelShare(d), S.brake, dt) : steer(vx0, vy0, 0, 0, S.brake, S.brake, dt);
      if (Math.hypot(p.vx, p.vy) < 0.01 && !moving) { p.vx = p.vy = 0; continue; }
      this.moveBy(p, p.vx * dt, p.vy * dt, true);
    }
    this.stepChains(dt);
    this.collide();
    this.stepBeams(dt, now);
    this.stepProjs(dt);
    this.stepMobs(dt, now);
    while (this.rockWait.length && now >= this.rockWait[0]) { this.rockWait.shift(); this.spawnRock(); }
    if (this.match.win && now >= this.match.winAt) this.resetMatch();
  }
  moveBy(p, mx, my, stop) {                    // moved, kept inside the hexagon (at the edge it stops there)
    const nx = p.x + mx, ny = p.y + my;
    if (inside(nx, ny)) { p.x = nx; p.y = ny; }
    else { let lo = 0, hi = 1; for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; inside(p.x + mx * m, p.y + my * m) ? (lo = m) : (hi = m); } p.x += mx * lo; p.y += my * lo; if (stop) p.vx = p.vy = 0; }
    p.dirty = true;
  }
  collide() {
    const ps = [...this.players.values()].filter((p) => !p.dead), keep = (p, f) => { const ox = p.x, oy = p.y; f(); if (!inside(p.x, p.y)) { p.x = ox; p.y = oy; } p.dirty = true; };
    const polys = new Map(ps.map((p) => [p, this.shipPoly(p)]));
    for (const p of ps) for (const b of this.solids()) {
      const dx = p.x - b.x, dy = p.y - b.y, R = b.rad + SHIP_R; if (dx * dx + dy * dy > R * R) continue;
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
  // damage: an active shield takes it first (what's left goes on), then armor takes its share off the hull's. Returns
  // whether the shield took any. by: who did it ({ team } at least; a player gets the kill's credits). No harm to
  // teammates (bumps, by null, still hurt).
  hurt(p, d, by = null) {
    if (spawning(p) || p.dead || !(d > 0)) return false;
    if (by && by.team === p.team && by !== p) return false;
    const S = this.stats(p); p.hurtAt = Date.now(); let shield = false;
    if (p.sh > 0) { const take = Math.min(p.sh, d); p.sh -= take; d -= take; shield = true; if (p.sh <= 1e-6) { p.sh = 0; if (p.abOn && p.ab === "shield") this.endAbility(p); } }
    if (d <= 0) return shield;
    p.hp -= d * (1 - S.armor / 100);
    if (p.hp <= 0) this.kill(p, by);
    return shield;
  }
  kill(p, by) {
    p.hp = 0; p.dead = true; p.deadUntil = Date.now() + SHIP.respawn * 1000; p.vx = p.vy = p.dx = p.dy = 0; p.beamOn = false; p.beamOut = null;
    if (p.abOn) this.endAbility(p);
    this.dropMobs(p, 1); this.deaths.push(p.id); this.fx.push({ k: "die", x: p.x, y: p.y, i: p.id });
    for (const q of this.players.values()) if (q.chain === p.id) this.endAbility(q);
    const k = by && this.players.get(by.id) === by ? by : null;
    if (k && k.team !== p.team) { k.credits = (k.credits || 0) + CREDITS.kill; k.dirty = true; }
  }
  dropMobs(p, kind = null) { for (const m of this.mobs) if (m.a === p.id && (kind === null || m.k === kind)) { m.gone = true; this.fx.push({ k: "pop", x: m.x, y: m.y }); } }

  // ---- abilities (Shift) ----
  useAbility(id, dx, dy) {
    const p = this.players.get(String(id)); if (!p || p.dead || spawning(p) || p.abOn) return false;
    const A = ABILITIES[p.ab], now = Date.now(); if (p.abCharge < A.charge - 1e-6) return false;
    if (p.ab === "shield") { p.sh = A.hp; }
    else if (p.ab === "blink") { if (!this.blink(p, A.dist)) return false; }
    else if (p.ab === "chain") {
      let ax = Number(dx), ay = Number(dy); if (!Number.isFinite(ax) || !Number.isFinite(ay) || Math.hypot(ax, ay) < 1e-6) { ax = Math.sin(p.h || 0); ay = -Math.cos(p.h || 0); }
      const L = Math.hypot(ax, ay); ax /= L; ay /= L; let best = null, bestA = A.arc * Math.PI / 180;
      for (const q of this.players.values()) {
        if (q.team === p.team || q.dead || spawning(q) || isCloaked(q)) continue;
        const ex = q.x - p.x, ey = q.y - p.y, d = Math.hypot(ex, ey); if (d > A.reach || d < 1) continue;
        const ang = Math.acos(Math.max(-1, Math.min(1, (ex * ax + ey * ay) / d))); if (ang <= bestA && this.sees(p, q)) { best = q; bestA = ang; }
      }
      if (!best) return false; p.chain = best.id;
    }
    p.abCharge = 0;
    if (A.dur > 0) { p.abOn = true; p.abUntil = now + A.dur * 1000; }
    p.eff = this.computeEff(p); return true;
  }
  endAbility(p) { if (p.ab === "shield") p.sh = 0; p.abOn = false; p.chain = null; p.eff = this.computeEff(p); }
  // Teleport: straight ahead along the nose, as far as it goes up to dist (not into anything solid or off the map)
  blink(p, dist) {
    const ux = Math.sin(p.h || 0), uy = -Math.cos(p.h || 0);
    for (let d = dist; d >= 40; d -= 10) {
      const x = p.x + ux * d, y = p.y + uy * d; if (!inside(x, y)) continue;
      const P = this.shipPoly({ x, y, h: p.h }); let hit = false;
      for (const s of this.solids()) { if (Math.hypot(s.x - x, s.y - y) > s.rad + SHIP_R) continue; for (const v of s.polys) if (satPush(P, v)) { hit = true; break; } if (hit) break; }
      if (hit) continue;
      this.fx.push({ k: "blink", x: p.x, y: p.y, x2: x, y2: y }); p.x = x; p.y = y; p.dirty = true;
      this.msgs.push({ to: p.id, m: { t: "teleport", x, y, keep: 1 } }); return true;
    }
    return false;
  }
  stepChains(dt) {                             // Chain: the chained ship is pulled in past the slack
    const A = ABILITIES.chain;
    for (const p of this.players.values()) {
      if (!p.chain) continue; const q = this.players.get(p.chain);
      if (!q || q.dead || p.dead || !p.abOn) { this.endAbility(p); continue; }
      const ex = p.x - q.x, ey = p.y - q.y, d = Math.hypot(ex, ey);
      if (d > A.reach * 1.5) { this.endAbility(p); continue; }
      if (d > A.slack) { const m = Math.min(d - A.slack, A.pull * dt); this.moveBy(q, ex / d * m, ey / d * m, false); }
    }
  }

  // ---- weapons ----
  src(p) { return { team: p.team, p }; }
  // a shot from a player's weapon slot s (0 primary, 1 secondary) toward (dx, dy), checked as hostile; its rate, ammo and capacitor
  fire(id, s, dx, dy) {
    const p = this.players.get(String(id)); if (!p || p.dead || spawning(p) || (s !== 0 && s !== 1)) return null;
    const kind = p.load[s], st = p.w[kind]; if (!st || kind === "beam" || st.reloadAt || st.ammo <= 0) return null;
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-6) return null;
    const W = this.wstat(p, kind), now = Date.now();
    if (st.last && now - st.last < 1000 / W.rate - 30) return null;
    if (p.cap < W.capUse) return null;
    if (kind === "drones" && this.mobs.filter((m) => !m.gone && m.k === 1 && m.a === p.id).length >= W.max) return null;
    st.last = now; p.cap -= W.capUse; st.ammo -= 1; if (st.ammo <= 0) { st.ammo = 0; st.reloadAt = now + W.reload * 1000; }   // (empty: it reloads by itself)
    if (isCloaked(p)) this.endAbility(p);       // (firing ends invisibility)
    const L0 = Math.hypot(dx, dy); dx /= L0; dy /= L0;
    if (kind === "bullets") {
      const ex = Math.max(0, (st.spread || 0) - W.spreadBack * (now - (st.spreadT || now)) / 1000), sp = Math.min(W.spreadMax, W.spread0 + ex), off = (Math.random() * 2 - 1) * sp * Math.PI / 180;
      st.spread = Math.min(Math.max(0, W.spreadMax - W.spread0), ex + W.spreadAdd); st.spreadT = now;
      const c = Math.cos(off), sn = Math.sin(off); [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c];
      const q = { id: this.projSeq++, a: p.id, team: p.team, x: p.x, y: p.y, ux: dx, uy: dy, went: 0, age: 0, S: { optimal: W.optimal, falloff: W.falloff, bspeed: W.bspeed, spdEnd: W.spdEnd, spdCurve: W.spdCurve, dmg: W.dmg, dmgEnd: W.dmgEnd, dmgCurve: W.dmgCurve } };
      this.projs.push(q); this.projEv.push({ t: "proj", q }); return q;
    }
    if (kind === "railgun") {                  // at once, along the whole reach to the first thing in the way
      const L = maxRange(W), r = this.trace(p.x, p.y, p.x + dx * L, p.y + dy * L, this.src(p)), t = Math.min(1, r.t), at = L * t;
      if (r.hit) this.damage(r, W.dmg * curveAt(at, W, W.dmgEnd, W.dmgCurve), p);
      this.fx.push({ k: "rail", x: p.x, y: p.y, x2: p.x + dx * at, y2: p.y + dy * at, h: r.hit ? (r.shield ? 2 : 1) : r.t <= 1 ? 3 : 0, s: p.team }); return true;
    }
    if (kind === "missiles") { this.mobs.push({ id: this.mobSeq++, k: 0, a: p.id, team: p.team, x: p.x + dx * 30, y: p.y + dy * 30, ang: Math.atan2(dy, dx), age: 0, hp: W.hp, W, tgt: null, look: 0 }); return true; }
    if (kind === "drones") {
      const m = { id: this.mobSeq++, k: 1, a: p.id, team: p.team, x: p.x + dx * 30, y: p.y + dy * 30, ang: Math.atan2(dy, dx), vx: dx * W.speed, vy: dy * W.speed, age: 0, hp: W.hp, W, tgt: null, look: 0, orb: Math.random() * Math.PI * 2, shotAt: 0, zapAt: 0 };
      m.tgt = this.aimTarget(p, dx, dy, W.seek, 30); this.mobs.push(m); return true;
    }
    return null;
  }
  // R: reload every fitted weapon that isn't full (and isn't already reloading)
  reload(id) {
    const p = this.players.get(String(id)); if (!p || p.dead) return false; const now = Date.now(); let any = false;
    for (const k of p.load) { const w = p.w[k]; if (w && !w.reloadAt && w.ammo < WEAPONS[k].mag) { w.reloadAt = now + WEAPONS[k].reload * 1000; any = true; } }
    return any;
  }
  // what a shot meets first along a segment: Build shapes, asteroids, the enemy station, enemy missiles / drones, enemy
  // ships (their shield oval while it's up, else their hitbox); a ship the shooter can't see is passed through.
  // { t, hit, ty: "p" ship / "m" missile or drone / "a" asteroid / "s" station / null (a wall), shield }
  trace(x0, y0, x1, y1, src) {
    let t = 2, hit = null, ty = null, shield = false; const team = src && src.team, me = src && src.p;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2;
    const take = (u, h, y, sh = false) => { if (u !== null && u < t) { t = u; hit = h; ty = y; shield = sh; } };
    for (const b of this.builds.values()) { if (!b.polys.length || Math.hypot(b.x - mx, b.y - my) > R + b.rad) continue; for (const v of b.polys) take(segPoly(x0, y0, x1, y1, v), null, null); }
    for (const r of this.rocks.values()) { if (Math.hypot(r.x - mx, r.y - my) > R + r.r) continue; take(segCircle(x0, y0, x1, y1, r.x, r.y, r.r), r, "a"); }
    for (const s of Object.values(this.stations)) { if (s.team === team || s.hp <= 0 || Math.hypot(s.x - mx, s.y - my) > R + STATION.r) continue; take(segCircle(x0, y0, x1, y1, s.x, s.y, STATION.r), s, "s"); }
    for (const m of this.mobs) { if (m.gone || m.team === team || Math.hypot(m.x - mx, m.y - my) > R + MOB_R) continue; take(segCircle(x0, y0, x1, y1, m.x, m.y, MOB_R), m, "m"); }
    const O = this.oval, OR = Math.max(O.ax, O.ay) + Math.hypot(O.cx, O.cy);
    for (const p of this.players.values()) {
      if (p === me || p.team === team || p.dead || spawning(p) || Math.hypot(p.x - mx, p.y - my) > R + OR + SHIP_R) continue;
      let u = null, sh = false;
      if (p.sh > 0) { u = segShield(x0, y0, x1, y1, p.x, p.y, p.h || 0, O); if (u !== null) sh = true; }
      if (u === null) for (const v of this.shipParts(p)) { const w = inPoly(x0, y0, v) ? 0 : segPoly(x0, y0, x1, y1, v); if (w !== null && (u === null || w < u)) u = w; }   // (point-blank: starting inside it hits it)
      if (u === null || u >= t) continue;
      if (me && !this.sees(me, p)) continue;
      t = u; hit = p; ty = "p"; shield = sh;
    }
    return { t, hit, ty, shield };
  }
  damage(r, d, by) {                           // a trace's hit takes damage
    if (r.ty === "p") return this.hurt(r.hit, d, by);
    if (r.ty === "m") return this.hurtMob(r.hit, d, by);
    if (r.ty === "a") return this.hurtRock(r.hit, d, by);
    if (r.ty === "s") return this.hurtStation(r.hit, d, by);
  }
  stepProjs(dt) {
    for (let k = this.projs.length - 1; k >= 0; k--) {
      const q = this.projs[k], S = q.S, end = maxRange(S), v = S.bspeed * curveAt(q.went, S, S.spdEnd, S.spdCurve);
      q.age += dt; const step = Math.min(end - q.went, Math.max(0, v) * dt);
      const shooter = this.players.get(q.a), x1 = q.x + q.ux * step, y1 = q.y + q.uy * step, r = this.trace(q.x, q.y, x1, y1, { team: q.team, p: shooter });
      if (r.t <= 1) {
        const x = q.x + (x1 - q.x) * r.t, y = q.y + (y1 - q.y) * r.t, at = q.went + step * r.t;
        if (r.hit) this.damage(r, S.dmg * curveAt(at, S, S.dmgEnd, S.dmgCurve), shooter || { team: q.team });
        this.projEv.push({ t: "pend", i: q.id, x, y, h: r.ty === "p" ? r.hit.id : null, s: 1, sh: r.shield ? 1 : 0 }); this.projs.splice(k, 1); continue;
      }
      q.x = x1; q.y = y1; q.went += step;
      if (q.went >= end - 0.01 || v < 1 || q.age > 20 || !inside(q.x, q.y)) { this.projEv.push({ t: "pend", i: q.id, x: q.x, y: q.y, h: null, s: 0 }); this.projs.splice(k, 1); }
    }
  }
  // a beam held on: {on, x, y} the wanted direction (checked as hostile); the server turns it there at the beam's
  // rotation speed. It drains ammo (rate a second) and capacitor (capUse a second); out of either, it stops.
  setBeam(id, s, on, dx, dy) {
    const p = this.players.get(String(id)); if (!p) return;
    if (!on || p.load[s] !== "beam") { p.beamOn = false; p.beamOut = null; return; }
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-6) return;
    const want = Math.atan2(dy, dx); if (!p.beamOn) p.beamA = want;   // a new beam starts where you aim
    p.beamOn = true; p.beamWant = want; p.beamSeen = Date.now();
  }
  stepBeams(dt, now) {
    for (const p of this.players.values()) {
      if (!p.beamOn) { p.beamOut = null; continue; }
      const st = p.w.beam; if (!st || p.dead || spawning(p) || now - (p.beamSeen || 0) > 600) { p.beamOn = false; p.beamOut = null; continue; }
      const W = this.wstat(p, "beam");
      if (st.reloadAt || st.ammo <= 0 || p.cap < W.capUse * dt) { p.beamOut = null; continue; }   // (held but empty / reloading: no beam)
      if (isCloaked(p)) this.endAbility(p);
      const sa = W.rot * 1.15 * Math.PI / 180 * dt; p.beamA = wrapA(p.beamA + Math.max(-sa, Math.min(sa, wrapA(p.beamWant - p.beamA))));
      st.ammo -= W.rate * dt; p.cap -= W.capUse * dt; if (st.ammo <= 0) { st.ammo = 0; st.reloadAt = now + W.reload * 1000; }
      const L = maxRange(W), x1 = p.x + Math.cos(p.beamA) * L, y1 = p.y + Math.sin(p.beamA) * L, r = this.trace(p.x, p.y, x1, y1, this.src(p));
      const t = Math.min(1, r.t), at = L * t;
      if (r.hit) this.damage(r, W.dmg * curveAt(at, W, W.dmgEnd, W.dmgCurve) * dt, p);
      p.beamOut = { a: p.beamA, len: at, hit: r.hit ? (r.shield ? 2 : 1) : 0 };
    }
  }
  // ---- missiles and drones ----
  // the enemies a missile or drone can go for: ships (not invisible, materializing or dead) and the enemy station
  *foes(team) {
    for (const q of this.players.values()) if (q.team !== team && !q.dead && !spawning(q) && !isCloaked(q)) yield { ty: "p", o: q, x: q.x, y: q.y, r: SHIP_R * 0.6 };
    for (const s of Object.values(this.stations)) if (s.team !== team && s.hp > 0) yield { ty: "s", o: s, x: s.x, y: s.y, r: STATION.r };
  }
  aimTarget(p, ux, uy, reach, arc) {          // the enemy nearest the aim (within arc degrees), else the nearest one within reach
    let best = null, bestA = arc * Math.PI / 180, near = null, nd = reach;
    for (const f of this.foes(p.team)) {
      const ex = f.x - p.x, ey = f.y - p.y, d = Math.hypot(ex, ey) - (f.ty === "s" ? f.r : 0); if (d > reach) continue;
      const a = Math.acos(Math.max(-1, Math.min(1, (ex * ux + ey * uy) / Math.max(1, Math.hypot(ex, ey))))); if (a <= bestA) { best = f; bestA = a; }
      if (d < nd) { nd = d; near = f; }
    }
    return best || near;
  }
  live(f) {                                    // a target still there, where it is now
    if (!f) return null;
    if (f.ty === "p") { const q = f.o; if (this.players.get(q.id) !== q || q.dead || spawning(q) || isCloaked(q)) return null; f.x = q.x; f.y = q.y; return f; }
    return f.o.hp > 0 ? f : null;
  }
  hurtMob(m, d, by) { if (m.gone || (by && by.team === m.team)) return false; m.hp -= d; if (m.hp <= 0) { m.gone = true; this.fx.push({ k: "pop", x: m.x, y: m.y }); } return false; }
  // a missile's burst: enemy ships (shields take it first), asteroids and the enemy station within radius, less toward the
  // edge; walls shelter
  blast(x, y, W, by, team) {
    const R = W.radius, f = (d) => W.dmg * (1 - 0.5 * Math.max(0, d) / R);
    for (const p of this.players.values()) { if (p.team === team || p.dead) continue; const d = Math.hypot(p.x - x, p.y - y) - SHIP_R * 0.6; if (d <= R && !this._blocked(x, y, p.x, p.y)) this.hurt(p, f(d), by); }
    for (const r of [...this.rocks.values()]) { const d = Math.hypot(r.x - x, r.y - y) - r.r; if (d <= R) this.hurtRock(r, f(d), by); }
    for (const s of Object.values(this.stations)) { if (s.team === team) continue; const d = Math.hypot(s.x - x, s.y - y) - STATION.r; if (d <= R) this.hurtStation(s, f(d), by); }
    this.fx.push({ k: "boom", x, y, r: R });
  }
  stepMobs(dt, now) {
    for (const m of this.mobs) {
      if (m.gone) continue; const W = m.W, owner = this.players.get(m.a), by = owner && owner.team === m.team ? owner : { team: m.team };
      m.age += dt;
      if (m.k === 0) {                         // a missile
        if (m.age >= W.life) { m.gone = true; this.blast(m.x, m.y, W, by, m.team); continue; }
        if ((m.look -= dt) <= 0) {             // the enemy nearest its nose, within 70 degrees
          m.look = 0.25; m.tgt = this.live(m.tgt);
          if (!m.tgt) { const ux = Math.cos(m.ang), uy = Math.sin(m.ang); let best = null, bd = W.seek; for (const f of this.foes(m.team)) { const ex = f.x - m.x, ey = f.y - m.y, d = Math.hypot(ex, ey); if (d < bd && (ex * ux + ey * uy) / Math.max(1, d) > Math.cos(70 * Math.PI / 180)) { bd = d; best = f; } } m.tgt = best; }
        }
        const T = this.live(m.tgt);
        if (T) { const want = Math.atan2(T.y - m.y, T.x - m.x), st = W.turn * Math.PI / 180 * dt; m.ang = wrapA(m.ang + Math.max(-st, Math.min(st, wrapA(want - m.ang)))); }
        const dir = m.ang + Math.sin(m.age * 9) * 0.45, nx = m.x + Math.cos(dir) * W.speed * dt, ny = m.y + Math.sin(dir) * W.speed * dt;
        const r = this.trace(m.x, m.y, nx, ny, { team: m.team, p: null });
        if (r.t <= 1 || !inside(nx, ny) || (T && Math.hypot(T.x - nx, T.y - ny) <= T.r + 10)) { const t = Math.min(1, r.t); m.gone = true; this.blast(m.x + (nx - m.x) * t, m.y + (ny - m.y) * t, W, by, m.team); continue; }
        m.x = nx; m.y = ny; m.h = dir;
      } else {                                 // a drone
        m.hp -= W.decay * dt; if (m.hp <= 0 || !owner || owner.dead || owner.team !== m.team) { m.gone = true; this.fx.push({ k: "pop", x: m.x, y: m.y }); continue; }
        if ((m.look -= dt) <= 0) {
          m.look = 0.5; m.tgt = this.live(m.tgt);
          if (m.tgt && Math.hypot(m.tgt.x - owner.x, m.tgt.y - owner.y) > W.seek * 1.5) m.tgt = null;   // (it doesn't chase off forever)
          if (!m.tgt) { let best = null, bd = W.seek * 0.7; for (const f of this.foes(m.team)) { const d = Math.hypot(f.x - m.x, f.y - m.y) - (f.ty === "s" ? f.r : 0); if (d < bd) { bd = d; best = f; } } m.tgt = best; }
        }
        const T = this.live(m.tgt), cx = T ? T.x : owner.x, cy = T ? T.y : owner.y, rad = T ? W.orbit + (T.ty === "s" ? T.r : 0) : 60;
        m.orb += W.speed / Math.max(40, rad) * dt * 0.8;
        const gx = cx + Math.cos(m.orb) * rad, gy = cy + Math.sin(m.orb) * rad, ex = gx - m.x, ey = gy - m.y, el = Math.hypot(ex, ey) || 1;
        const zig = Math.sin(m.age * 7) * 0.6, tvx = ex / el * W.speed, tvy = ey / el * W.speed, k = Math.min(1, dt * 4);
        m.vx += (tvx * Math.cos(zig) - tvy * Math.sin(zig) - m.vx) * k; m.vy += (tvx * Math.sin(zig) + tvy * Math.cos(zig) - m.vy) * k;
        const nx = m.x + m.vx * dt, ny = m.y + m.vy * dt; if (inside(nx, ny)) { m.x = nx; m.y = ny; }
        m.h = Math.atan2(m.vy, m.vx);
        if (T && now - m.shotAt >= W.every * 1000 && Math.hypot(T.x - m.x, T.y - m.y) - (T.ty === "s" ? T.r : 0) <= W.reach && !this._blocked(m.x, m.y, T.x, T.y)) {
          m.shotAt = now; m.zapAt = now; m.zx = T.x; m.zy = T.y;
          if (T.ty === "p") this.hurt(T.o, W.dmg, by); else this.hurtStation(T.o, W.dmg, by);
        }
      }
    }
    if (this.mobs.some((m) => m.gone)) this.mobs = this.mobs.filter((m) => !m.gone);
  }
  // ---- asteroids: scattered round the map (not near the stations); destroying one pays credits, another turns up later ----
  spawnRock() {
    for (let i = 0; i < 40; i++) {
      const r = ASTEROIDS.rMin + Math.random() * (ASTEROIDS.rMax - ASTEROIDS.rMin), x = (Math.random() * 2 - 1) * HEX_FLAT / 1.8, y = (Math.random() * 2 - 1) * HEX_FLAT / 2;
      if (!inside(x, y) || Math.abs(y) > A - r - 40 || Math.abs(SQ3 * x + y) > 2 * (A - r - 40) || Math.abs(SQ3 * x - y) > 2 * (A - r - 40)) continue;
      let ok = true;
      for (const s of this.solids()) if (Math.hypot(s.x - x, s.y - y) < s.rad + r + 40) { ok = false; break; }
      for (const t of TEAMS) if (Math.hypot(STATION_AT[t][0] - x, STATION_AT[t][1] - y) < STATION.reach + 100) ok = false;
      for (const p of this.players.values()) if (Math.hypot(p.x - x, p.y - y) < r + SHIP_R + 40) ok = false;
      if (!ok) continue;
      const id = String(this.rockSeq++), max = Math.round(r * ASTEROIDS.hpPerR), rk = { id, x: Math.round(x), y: Math.round(y), r: Math.round(r), hp: max, max };
      rk.rad = rk.r; rk.polys = [circle(rk.x, rk.y, rk.r * 0.92, 14)]; this.rocks.set(id, rk); this.rockDirty.add(id); return rk;
    }
    this.rockWait.push(Date.now() + ASTEROIDS.respawn * 1000); return null;   // (no room now: later)
  }
  hurtRock(rk, d, by) {
    if (!this.rocks.has(rk.id) || !(d > 0)) return false;
    rk.hp -= d; this.rockDirty.add(rk.id);
    if (rk.hp <= 0) {
      this.rocks.delete(rk.id); this.rockDirty.delete(rk.id); this.rockGone.push(rk.id); this.rockWait.push(Date.now() + ASTEROIDS.respawn * 1000);
      this.fx.push({ k: "rock", x: rk.x, y: rk.y, r: rk.r });
      const k = by && this.players.get(by.id) === by ? by : null; if (k) { k.credits = (k.credits || 0) + Math.round(rk.r * CREDITS.rock); k.dirty = true; }
    }
    return false;
  }
  rockList() { return [...this.rocks.values()].map((r) => [r.id, r.x, r.y, r.r, Math.ceil(r.hp), r.max]); }
  // ---- the stations and the match ----
  hurtStation(s, d, by) {
    if (this.match.win || !by || by.team === s.team || s.hp <= 0 || !(d > 0)) return false;
    s.hp = Math.max(0, s.hp - d); this.stDirty = true; this.matchDirty = true;
    if (s.hp <= 0) {                           // destroyed: the other team wins; a new match starts MATCH_WAIT s later
      this.match.win = by.team; this.match.winAt = Date.now() + MATCH_WAIT * 1000;
      this.fx.push({ k: "die", x: s.x, y: s.y, big: 1 }); this.msgs.push({ to: null, m: { t: "win", s: by.team, in: MATCH_WAIT * 1000 } });
    }
    return false;
  }
  stationList() { return Object.values(this.stations).map((s) => ({ s: s.team, x: s.x, y: s.y, r: STATION.r, reach: STATION.reach, hp: Math.ceil(s.hp), max: STATION.hp })); }
  resetMatch() {                               // a new match: stations whole, capture points neutral, every ship back home with no credits or levels
    this.match.n++; this.match.win = null; this.match.winAt = 0; this.matchDirty = true;
    for (const s of Object.values(this.stations)) s.hp = STATION.hp; this.stDirty = true;
    for (const c of this.caps.values()) { c.own = null; c.prog = 0; } this.capDirty = true; this.teamBuffs = { blue: new Set(), red: new Set() };
    this.mobs = []; this.projs = [];
    for (const p of this.players.values()) {
      p.credits = 0; p.lv = freshLv(); p.abCharge = 1e9; this.place(p); this.refill(p); p.spawnUntil = Date.now() + SPAWN_MS; p.dirty = true;
      this.msgs.push({ to: p.id, m: { t: "teleport", x: p.x, y: p.y, h: p.h } });
    }
    this.msgs.push({ to: null, m: { t: "match", n: this.match.n } });
  }
  async saveMatch() { this.matchDirty = false; await pool.query(`INSERT INTO world3d_settings (k, v) VALUES ('match', $1) ON CONFLICT (k) DO UPDATE SET v = $1`, [JSON.stringify({ n: this.match.n, blue: this.stations.blue.hp, red: this.stations.red.hp })]); }
  // ---- capture points: one team alone inside pushes it its way; held, its buff goes to that whole team ----
  updateCaptures(dt) {
    const B = { blue: new Set(), red: new Set() };
    for (const b of this.builds.values()) {
      if (b.k !== "capture") continue;
      const c = this.caps.get(b.id) || { own: null, prog: 0 }; this.caps.set(b.id, c);
      let nb = 0, nr = 0;
      for (const p of this.players.values()) if (!p.dead && !spawning(p) && Math.hypot(p.x - b.x, p.y - b.y) <= b.w / 2) { if (p.team === "blue") nb++; else nr++; }
      const was = [c.own, Math.round(c.prog * 50)], rate = dt / CAPTURE_TIME;
      if (nb && !nr) c.prog = Math.min(1, c.prog + rate); else if (nr && !nb) c.prog = Math.max(-1, c.prog - rate);
      else if (!nb && !nr) { const home = c.own === "blue" ? 1 : c.own === "red" ? -1 : 0; c.prog += Math.max(-rate / 2, Math.min(rate / 2, home - c.prog)); }   // (empty: it drifts back to its holder)
      if (c.prog >= 1) c.own = "blue"; else if (c.prog <= -1) c.own = "red";
      else if ((c.own === "blue" && c.prog <= 0) || (c.own === "red" && c.prog >= 0)) c.own = null;
      if (was[0] !== c.own || was[1] !== Math.round(c.prog * 50)) this.capDirty = true;
      if (c.own) B[c.own].add(b.extra && Number.isInteger(b.extra.b) ? b.extra.b : 0);
    }
    for (const id of [...this.caps.keys()]) if (!this.builds.has(id)) { this.caps.delete(id); this.capDirty = true; }
    this.teamBuffs = B;
  }
  capList() { return [...this.caps.entries()].map(([id, c]) => [id, c.own, Math.round(c.prog * 100) / 100]); }

  // ---- sight: can a and b make each other out (mutual visibility from the visibility points, blocked by Build shapes)?
  _blocked(x0, y0, x1, y1) {
    const X0 = Math.min(x0, x1), X1 = Math.max(x0, x1), Y0 = Math.min(y0, y1), Y1 = Math.max(y0, y1);
    for (const b of this.builds.values()) { if (!b.polys.length || b.x + b.rad < X0 || b.x - b.rad > X1 || b.y + b.rad < Y0 || b.y - b.rad > Y1) continue; for (const v of b.polys) if (segPoly(x0, y0, x1, y1, v) !== null) return true; }
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
    if (o.k === "capture") { const e = o.extra || {}; b.extra = { b: Number.isInteger(e.b) && e.b >= 0 && e.b < 6 ? e.b : 0 }; b.d = b.w; }   // (its buff)
    return b;
  }
  _put(id, b) {
    b.id = id;
    if (b.k === "cloud") { b.poly = cloudPoly(b); b.polys = []; b.rad = polyRad(b, b.poly); }
    else if (b.k === "capture") { b.d = b.w; b.polys = []; b.rad = b.w / 2; }   // (blocks nothing)
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

  async _save(p) {
    await this.ready;
    await pool.query(`INSERT INTO world3d (user_id, x, y, team, credits, loadout, levels, match, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
      ON CONFLICT (user_id) DO UPDATE SET x = $2, y = $3, team = $4, credits = $5, loadout = $6, levels = $7, match = $8, updated_at = now()`,
      [p.id, p.x, p.y, p.team || null, p.credits || 0, JSON.stringify({ w: p.load, a: p.ab }), JSON.stringify(p.lv), this.match.n]);
    p.dirty = false;
  }
  async saveDirty() {
    for (const p of this.players.values()) if (p.dirty) await this._save(p);
    for (const b of this.builds.values()) if (b.dirty) { b.dirty = false; await pool.query(`UPDATE world3d_builds SET k = $2, x = $3, y = $4, w = $5, d = $6, r = $7, extra = $8, updated_at = now() WHERE id = $1`, [b.id, b.k, b.x, b.y, b.w, b.d, b.r, b.extra ? JSON.stringify(b.extra) : null]); }
    if (this.matchDirty) await this.saveMatch();
  }
  // every ship in the viewer's load circle (an invisible enemy isn't sent): [id, x (cm), y (cm), heading (mrad), health,
  // shield, beam | null, materializing (hundredths of a second left) | null, dead 0 / 1, max health, active ability (its
  // number + 1, 0: none), chained ship id | null]; beam: [angle (mrad), length (m), hit: 0 nothing / 1 something / 2 shield]
  snapshotFor(viewer) {
    const out = [], R2 = LOAD_R * LOAD_R, now = Date.now();
    for (const p of this.players.values()) {
      const dx = p.x - viewer.x, dy = p.y - viewer.y; if (p !== viewer && dx * dx + dy * dy > R2) continue;
      if (p !== viewer && p.team !== viewer.team && isCloaked(p)) continue;
      out.push([p.id, Math.round(p.x * 100), Math.round(p.y * 100), Math.round((p.h || 0) * 1000), Math.ceil(p.hp), Math.ceil(p.sh),
        p.beamOut ? [Math.round(p.beamOut.a * 1000), Math.round(p.beamOut.len), p.beamOut.hit] : null,
        spawning(p) ? Math.ceil((p.spawnUntil - now) / 10) : null, p.dead ? 1 : 0, Math.round(p.hpMax || SHIP.hp), p.abOn ? ABILITY_KINDS.indexOf(p.ab) + 1 : 0, p.chain || null]);
    }
    return out;
  }
  // the missiles and drones in the viewer's load circle: [id, 0 missile / 1 drone, x (dm), y (dm), heading (mrad), 0 blue /
  // 1 yellow, and a drone shooting: the spot it's shooting at (m) ]
  mobsFor(viewer) {
    const out = [], R = LOAD_R + 100, now = Date.now();
    for (const m of this.mobs) {
      if (m.gone || Math.abs(m.x - viewer.x) > R || Math.abs(m.y - viewer.y) > R) continue;
      const row = [m.id, m.k, Math.round(m.x * 10), Math.round(m.y * 10), Math.round((m.h ?? m.ang) * 1000), m.team === "blue" ? 0 : 1];
      if (m.k === 1 && now - m.zapAt < 160) row.push(Math.round(m.zx), Math.round(m.zy));
      out.push(row);
    }
    return out;
  }
  roster() { return [...this.players.values()].map((p) => ({ i: p.id, n: p.name, s: p.team })); }
}
