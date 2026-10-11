// The authoritative simulation (back to basics, owner 2026-10-10): the Expanse's hexagon with nothing in it, and one
// Prospector per player that flies where it's told. Everything else the game had is kept for reference in
// reference/2026-10-10-pre-reset/.
import { SHIP_TYPES, SHIP_ARRIVE_EPS_KM, LOGOUT_GRACE_MS, EXPANSE_APOTHEM_KM, SPAWN_SPREAD_KM } from "./constants.js";

// the hexagon's edges: outward normals (flat top and bottom) — a point is inside when n · p ≤ apothem for all six
const NORMALS = [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 2 + k * Math.PI / 3; return [Math.cos(a), Math.sin(a)]; });
export const insideExpanse = (x, y, margin = 0) => NORMALS.every(([nx, ny]) => x * nx + y * ny <= EXPANSE_APOTHEM_KM - margin + 1e-9);
/** The nearest point inside the hexagon (`margin` km in from its edge). */
export function clampToExpanse(x, y, margin = 0) {
  const A = EXPANSE_APOTHEM_KM - margin;
  for (let i = 0; i < 4; i++) {                       // project onto each edge it's past; a few passes settle the corners
    let moved = false;
    for (const [nx, ny] of NORMALS) { const d = x * nx + y * ny - A; if (d > 0) { x -= nx * d; y -= ny * d; moved = true; } }
    if (!moved) break;
  }
  return { x, y };
}
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const VIEW_MAX_W = 4 * EXPANSE_APOTHEM_KM;            // the widest camera view a client may claim

export class World {
  constructor() {
    this.players = new Map();   // pid -> { id, name, send, offline, offlineSince, view }
    this.ships = new Map();     // sid -> ship
    this.simAt = Date.now();    // the moment the ships' positions are for (snapshots carry it)
  }

  addPlayer(id, name, send, saved = null) {
    const existing = this.players.get(id);
    if (existing) { existing.send = send; existing.offline = false; existing.name = name; this._ensureShip(id, saved); return existing; }
    const p = { id, name, send, offline: false, offlineSince: 0, view: null };
    this.players.set(id, p);
    this._ensureShip(id, saved);
    return p;
  }
  // every player has one Prospector: where they left it, or a fresh one near the centre
  _ensureShip(id, saved) {
    for (const s of this.ships.values()) if (s.owner === id) return s;
    const t = SHIP_TYPES.chisel, sv = saved && saved.ship;
    let x, y, h;
    if (sv && finite(sv.x) && finite(sv.y)) { ({ x, y } = clampToExpanse(sv.x, sv.y, t.radiusKm)); h = finite(sv.h) ? sv.h : Math.PI / 2; }
    else { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * SPAWN_SPREAD_KM; x = Math.cos(a) * d; y = Math.sin(a) * d; h = Math.random() * Math.PI * 2; }
    const sid = `${id}:ship:0`;
    const s = { id: sid, owner: id, type: "chisel", x, y, vx: 0, vy: 0, h, tx: x, ty: y, moving: false, speed: t.speedKmps, accel: t.accelKmps2, radius: t.radiusKm, mass: t.mass };
    this.ships.set(sid, s);
    return s;
  }
  // Logging off (owner: no logged-off presence): after a short grace for reloads the ship leaves the world.
  removePlayer(id) { const p = this.players.get(id); if (!p) return; p.offline = true; p.offlineSince = Date.now(); p.send = () => {}; }
  _purge(id) {
    if (this.onBeforePurge) { try { this.onBeforePurge(id); } catch (e) { console.error("onBeforePurge", e); } }
    for (const [sid, s] of this.ships) if (s.owner === id) this.ships.delete(sid);
    this.players.delete(id);
  }
  /** Everything about a player worth keeping across logins and restarts. */
  exportState(id) {
    const s = [...this.ships.values()].find((x) => x.owner === id);
    return { ship: s ? { x: +s.x.toFixed(4), y: +s.y.toFixed(4), h: +s.h.toFixed(3) } : null, savedAt: Date.now() };
  }

  // ---- commands (every field hostile) ----
  /** Fly your ship to a point (clamped inside the hexagon). */
  cmdMove(pid, shipId, x, y) {
    if (!finite(x) || !finite(y)) return;
    const s = this.ships.get(shipId); if (!s || s.owner !== pid) return;
    const t = clampToExpanse(x, y, s.radius); s.tx = t.x; s.ty = t.y; s.moving = true;
  }
  /** Where the player's camera is: other ships in view get sent to them. */
  cmdView(pid, x, y, w) {
    const p = this.players.get(pid); if (!p) return;
    if (!finite(x) || !finite(y) || !finite(w) || w <= 0) { p.view = null; return; }
    const c = clampToExpanse(x, y); p.view = { x: c.x, y: c.y, w: Math.min(w, VIEW_MAX_W) };
  }

  tick(dtSec) {
    const now = Date.now();
    this._tickShips(dtSec, now);
    for (const p of [...this.players.values()]) if (p.offline && now - p.offlineSince > LOGOUT_GRACE_MS) this._purge(p.id);
  }
  _tickShips(dtSec, now) {
    this.simAt = now;
    const ships = [...this.ships.values()];
    // 1) steer toward the target as fast as it can while still able to brake in time, then integrate
    for (const s of ships) {
      if (s.moving) {
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
        if (d <= SHIP_ARRIVE_EPS_KM) s.moving = false;
        else {
          const spd = Math.min(s.speed, Math.sqrt(2 * s.accel * d) * 0.95);
          const dvx = (dx / d) * spd - s.vx, dvy = (dy / d) * spd - s.vy, dv = Math.hypot(dvx, dvy), step = s.accel * dtSec;
          if (dv <= step) { s.vx += dvx; s.vy += dvy; } else { s.vx += dvx / dv * step; s.vy += dvy / dv * step; }   // acceleration-limited
        }
      }
      if (!s.moving) { const v = Math.hypot(s.vx, s.vy), step = s.accel * dtSec; if (v <= step) { s.vx = 0; s.vy = 0; } else { s.vx -= s.vx / v * step; s.vy -= s.vy / v * step; } }
      s.x += s.vx * dtSec; s.y += s.vy * dtSec;
      if (Math.hypot(s.vx, s.vy) > 0.05) s.h = Math.atan2(s.vy, s.vx);   // face the way it's going
    }
    // 2) ships don't overlap: pairs in the same 1 km cell (or a neighbouring one) push apart, the lighter one more
    const cell = 1, grid = new Map(), key = (i, j) => i + "," + j;
    for (const s of ships) { const k = key(Math.floor(s.x / cell), Math.floor(s.y / cell)); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(s); }
    for (const a of ships) {
      const ci = Math.floor(a.x / cell), cj = Math.floor(a.y / cell);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const b of grid.get(key(ci + di, cj + dj)) || []) {
        if (b.id <= a.id) continue;
        let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); const minD = a.radius + b.radius;
        if (d >= minD) continue;
        if (d < 1e-6) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy) || 1; }
        const nx = dx / d, ny = dy / d, overlap = minD - d, wa = b.mass / (a.mass + b.mass), wb = a.mass / (a.mass + b.mass);
        a.x -= nx * overlap * wa; a.y -= ny * overlap * wa; b.x += nx * overlap * wb; b.y += ny * overlap * wb;
        const avn = a.vx * nx + a.vy * ny; if (avn > 0) { a.vx -= avn * nx; a.vy -= avn * ny; }   // no ramming / jitter
        const bvn = b.vx * nx + b.vy * ny; if (bvn < 0) { b.vx -= bvn * nx; b.vy -= bvn * ny; }
      }
    }
    // 3) the hexagon's edge stops ships (and whatever velocity was carrying them out)
    for (const s of ships) {
      if (insideExpanse(s.x, s.y, s.radius)) continue;
      const c = clampToExpanse(s.x, s.y, s.radius); s.x = c.x; s.y = c.y; s.vx = 0; s.vy = 0;
    }
  }

  // ---- snapshots: your own ship always, other ships inside your camera's view (or near your ship) ----
  snapshotFor(p) {
    const own = [...this.ships.values()].find((s) => s.owner === p.id);
    const v = p.view || (own ? { x: own.x, y: own.y, w: 60 } : null);
    const half = v ? v.w * 0.75 : 0, ships = [];
    for (const s of this.ships.values()) {
      const mine = s.owner === p.id;
      if (!mine && (!v || Math.abs(s.x - v.x) > half || Math.abs(s.y - v.y) > half)) continue;
      const e = { id: s.id, type: s.type, x: +s.x.toFixed(4), y: +s.y.toFixed(4), h: +s.h.toFixed(3), mine };
      if (mine) { e.moving = s.moving; if (s.moving) { e.tx = +s.tx.toFixed(4); e.ty = +s.ty.toFixed(4); } }
      ships.push(e);
    }
    return { t: "snap", st: this.simAt, ships };
  }
}
