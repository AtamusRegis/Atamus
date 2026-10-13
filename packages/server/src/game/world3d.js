// The 3D world (owner, 2026-10-12: the game rebuilt in 3D, one shared world, no POIs).
// Flat ground plane. One sphere per account, 100 m in diameter, moving on the XY plane
// only (no Z). The border is the same flat-top hexagon, 126 km flat to flat. Everyone
// sees everyone. Positions persist per account.
import { pool } from "../db.js";

export const HEX_FLAT = 126_000;           // 126 km flat to flat (owner, 2026-10-12)
export const SPHERE_R = 50;                  // the player sphere: 100 m in diameter (owner)
export const SPEED = 300;                    // m/s on the ground (owner, 2026-10-12)
// (owner, 2026-10-13) weight: the ship accelerates toward its input; full ACCEL when the nose points where
// it's being pushed, down to TURN_ACCEL of it when pushing against the nose (it has to come round first)
export const ACCEL = 200;                    // m/s^2: 0 to 300 m/s in 1.5 s straight
export const BRAKE = 400;                    // m/s^2 (owner): letting go of WASD stops faster than it accelerates, however the nose points
export const TURN_ACCEL = 0.3;
// (owner, 2026-10-13) the capacitor, 0-100: sprinting drains it; moving without sprinting recharges it slowly,
// sitting still faster. Run dry and sprint stays off until it's back to CAP_RESUME.
export const CAP_MAX = 100, CAP_DRAIN = 20, CAP_WALK = 4, CAP_IDLE = 12, CAP_RESUME = 15;
// the acceleration share for a push at angle d (radians) off the nose: 1 straight, ~0.48 side-on, 0.3 reversing
// (owner, 2026-10-13) combat: health, hits and respawn. Friendly fire is on. Shots carry their ammo's stats
// from the client's arsenal (testing), clamped here.
export const HP_MAX = 1000, HIT_R = 50, RESPAWN_R = 300;
const clampN = (v, lo, hi, d = lo) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
// damage after falloff: full to the optimal range, minus `fall` percent per 100 m beyond it
export const falloff = (dmg, dist, opt, fall) => dmg * Math.max(0, 1 - (fall / 100) * Math.max(0, dist - opt) / 100);
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
    this.players = new Map();                // id -> { id, name, x, y, dx, dy, dirty }
    this.projectiles = [];                   // bullets and missiles in flight
    this.events = [];                        // hits, downs, respawns for net.js to send
    this.nextId = 1;
    this.beamAcc = new Map();                // "shooter|victim" -> { d, x, y, at }: beam damage gathered between hit messages
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
  }

  async join(id, name, team) {
    id = String(id);
    let p = this.players.get(id);
    if (p) { p.name = name; p.team = team; return p; }
    await this.ready;
    const { rows } = await pool.query(`SELECT x, y FROM world3d WHERE user_id = $1`, [id]);
    let x, y;
    if (rows[0] && inside(rows[0].x, rows[0].y)) ({ x, y } = rows[0]);
    else { const a = Math.random() * Math.PI * 2, d = Math.random() * 300; x = Math.cos(a) * d; y = Math.sin(a) * d; }
    p = { id, name, team, x, y, dx: 0, dy: 0, hp: HP_MAX, dirty: true };   // team: "red" | "blue", picked every time they enter (owner)
    this.players.set(id, p);
    return p;
  }

  async leave(id) {
    const p = this.players.get(String(id));
    if (!p) return;
    this.players.delete(p.id);
    await this._save(p).catch((e) => console.error("world3d leave", e));
  }

  // The client only sends a direction (and whether Shift is held); the server moves the sphere.
  // Hostile input: finite numbers, length clamped to 1, the boost only ever a flag.
  setDir(id, dx, dy, boost, h) {
    const p = this.players.get(String(id));
    if (!p) return false;
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    p.dx = dx; p.dy = dy; p.boost = boost === 1 || boost === true;   // (owner) Shift = double speed
    if (typeof h === "number" && Number.isFinite(h)) p.h = Math.atan2(Math.sin(h), Math.cos(h));   // (owner) the ship's heading, for everyone else's screens
    return true;
  }

  step(dt = TICK) {
    this.stepCombat(dt);
    for (const p of this.players.values()) {
      const moving = !!(p.dx || p.dy);
      if (p.cap === undefined) p.cap = CAP_MAX;
      if (p.cap <= 0) p.capOut = true; else if (p.capOut && p.cap >= CAP_RESUME) p.capOut = false;
      const sprinting = !!p.boost && moving && !p.capOut;
      p.cap = sprinting ? Math.max(0, p.cap - CAP_DRAIN * dt) : Math.min(CAP_MAX, p.cap + (moving ? CAP_WALK : CAP_IDLE) * dt);
      const vx0 = p.vx || 0, vy0 = p.vy || 0;
      if (!moving && !vx0 && !vy0) continue;
      // accelerate toward the input's velocity; a push off the nose gets only part of the acceleration
      const spd = SPEED * (sprinting ? 2 : 1), tx = p.dx * spd, ty = p.dy * spd;
      let a = p.dx || p.dy ? ACCEL : BRAKE;
      if (p.dx || p.dy) {
        const want = Math.atan2(p.dx, -p.dy);  // the input's heading (same convention as the client's)
        let d = (want - (p.h || 0)) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
        a *= accelShare(d);
      }
      let ex = tx - vx0, ey = ty - vy0; const el = Math.hypot(ex, ey), stepV = a * dt;
      if (el > stepV) { ex *= stepV / el; ey *= stepV / el; }
      p.vx = vx0 + ex; p.vy = vy0 + ey;
      if (Math.hypot(p.vx, p.vy) < 0.01 && !p.dx && !p.dy) { p.vx = p.vy = 0; continue; }
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (inside(nx, ny)) { p.x = nx; p.y = ny; }
      else {                                   // the border stops the ship dead: as far along the step as still fits
        let lo = 0, hi = 1;
        for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; inside(p.x + (nx - p.x) * m, p.y + (ny - p.y) * m) ? (lo = m) : (hi = m); }
        p.x += (nx - p.x) * lo; p.y += (ny - p.y) * lo; p.vx = p.vy = 0;
      }
      p.dirty = true;
    }
  }

  async _save(p) {
    await this.ready;
    await pool.query(
      `INSERT INTO world3d (user_id, x, y, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET x = $2, y = $3, updated_at = now()`, [p.id, p.x, p.y]);
    p.dirty = false;
  }
  async saveDirty() { for (const p of this.players.values()) if (p.dirty) await this._save(p); }

  // a shot from the client: a bullet ("b") or a missile ("m"), starting where the server has the ship
  fire(pid, m) {
    const p = this.players.get(pid); if (!p) return null;
    let ux = +m.x, uy = +m.y; const l = Math.hypot(ux, uy); if (!Number.isFinite(l) || l < 1e-6) return null; ux /= l; uy /= l;
    const q = {
      id: this.nextId++, kind: m.k === "m" ? "m" : "b", owner: pid, c: Number.isInteger(m.c) ? m.c : 0,
      x: p.x, y: p.y, ox: p.x, oy: p.y, ux, uy, dist: 0, age: 0,
      spd: clampN(m.spd, 50, 5000, 1500), life: clampN(m.life, 0.05, 10, 1), dmg: clampN(m.dmg, 0, 5000, 0),
      opt: clampN(m.opt, 0, 5000, 0), fall: clampN(m.fall, 0, 100, 0),
      turn: clampN(m.turn, 0, 720, 0) * Math.PI / 180 * clampN(m.lock, 0, 1, 0),   // missiles turn harder the longer they were locked
      tgt: typeof m.tgt === "string" && this.players.has(m.tgt) && m.tgt !== pid ? m.tgt : null,
    };
    this.projectiles.push(q);
    return q;
  }
  // a beam: on while the client keeps sending it (it lapses 300 ms after the last message)
  beam(pid, m) {
    const p = this.players.get(pid); if (!p) return;
    if (!m.on) { p.beam = null; return; }
    let ux = +m.x, uy = +m.y; const l = Math.hypot(ux, uy); if (!Number.isFinite(l) || l < 1e-6) return;
    p.beam = { ux: ux / l, uy: uy / l, len: clampN(m.len, 0, 3000), dps: clampN(m.dps, 0, 5000), opt: clampN(m.opt, 0, 5000), fall: clampN(m.fall, 0, 100), until: Date.now() + 300 };
  }
  damage(victim, by, d, x, y, k) {
    if (!(d > 0)) return;
    victim.hp -= d;
    this.events.push({ t: "hit", i: victim.id, by, d: Math.round(d * 10) / 10, x: Math.round(x), y: Math.round(y), hp: Math.max(0, Math.round(victim.hp)), ...(k ? { k } : {}) });
    if (victim.hp <= 0) {                      // destroyed: back near the center at full health
      const a = Math.random() * Math.PI * 2, r = Math.random() * RESPAWN_R;
      victim.x = Math.cos(a) * r; victim.y = Math.sin(a) * r; victim.vx = victim.vy = 0; victim.hp = HP_MAX; victim.beam = null; victim.dirty = true;
      this.events.push({ t: "down", i: victim.id, by });
      this.events.push({ t: "respawn", to: victim.id, x: victim.x, y: victim.y, hp: HP_MAX });
    }
  }
  // the first ship (not the shooter) a segment from (x0, y0) to (x1, y1) passes within HIT_R of
  firstHit(owner, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9; let best = null, bt = Infinity;
    for (const q of this.players.values()) {
      if (q.id === owner) continue;
      const t = Math.max(0, Math.min(1, ((q.x - x0) * dx + (q.y - y0) * dy) / L2));
      const cx = x0 + dx * t - q.x, cy = y0 + dy * t - q.y;
      if (cx * cx + cy * cy <= HIT_R * HIT_R && t < bt) { bt = t; best = q; }
    }
    return best ? { q: best, t: bt } : null;
  }
  stepCombat(dt) {
    const now = Date.now();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const q = this.projectiles[i];
      if (q.kind === "m" && q.tgt) {           // missiles turn toward their target, up to their (lock-scaled) turn rate
        const t = this.players.get(q.tgt);
        if (t) {
          const want = Math.atan2(t.x - q.x, t.y - q.y), cur = Math.atan2(q.ux, q.uy);
          let d = (want - cur) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
          const h = cur + Math.max(-q.turn * dt, Math.min(q.turn * dt, d)); q.ux = Math.sin(h); q.uy = Math.cos(h);
        }
      }
      const step = q.spd * dt, nx = q.x + q.ux * step, ny = q.y + q.uy * step;
      const hit = this.firstHit(q.owner, q.x, q.y, nx, ny);
      if (hit) {
        const hx = q.x + (nx - q.x) * hit.t, hy = q.y + (ny - q.y) * hit.t, dist = q.dist + step * hit.t;
        this.damage(hit.q, q.owner, falloff(q.dmg, dist, q.opt, q.fall), hx, hy, q.kind === "b" ? q.owner + ":" + q.c : null);
        this.projectiles.splice(i, 1); continue;
      }
      q.x = nx; q.y = ny; q.dist += step; q.age += dt;
      if (q.age >= q.life || !inside(q.x, q.y)) this.projectiles.splice(i, 1);
    }
    for (const p of this.players.values()) {   // beams: the first ship along the ray takes damage per second
      const b = p.beam; if (!b) continue;
      if (now > b.until) { p.beam = null; continue; }
      const hit = this.firstHit(p.id, p.x, p.y, p.x + b.ux * b.len, p.y + b.uy * b.len);
      if (!hit) continue;
      const dist = b.len * hit.t, hx = p.x + b.ux * dist, hy = p.y + b.uy * dist, key = p.id + "|" + hit.q.id;
      const acc = this.beamAcc.get(key) || { d: 0, at: now }; acc.d += falloff(b.dps * dt, dist, b.opt, b.fall); acc.x = hx; acc.y = hy;
      this.beamAcc.set(key, acc);
      hit.q.hpPending = true;
    }
    for (const [key, acc] of this.beamAcc) {   // beam damage is applied as it's dealt, numbered every 250 ms
      if (now - acc.at < 250) continue;
      const [sid, vid] = key.split("|"), v = this.players.get(vid);
      if (v) this.damage(v, sid, acc.d, acc.x, acc.y, null);
      this.beamAcc.delete(key);
    }
  }
  missileSnap() { const out = []; for (const q of this.projectiles) if (q.kind === "m") out.push([q.id, Math.round(q.x * 10), Math.round(q.y * 10), Math.round(Math.atan2(q.ux, -q.uy) * 1000), q.owner]); return out; }

  snapshot() {                                 // compact: [id, x (cm), y (cm), heading (mrad)] per player, everyone to everyone
    const out = [];
    for (const p of this.players.values()) {
      const e = [p.id, Math.round(p.x * 100), Math.round(p.y * 100), Math.round((p.h || 0) * 1000)];
      if (p.beam) e.push(Math.round(p.beam.ux * 1000), Math.round(p.beam.uy * 1000), Math.round(p.beam.len));   // a beam: its direction and length
      out.push(e);
    }
    return out;
  }
  roster() { const out = []; for (const p of this.players.values()) out.push({ i: p.id, n: p.name, s: p.team }); return out; }
}
