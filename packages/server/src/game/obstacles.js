// Non-player objects a destination can't be on (owner, 2026-10-11): asteroids (circles: half their size) and Library
// props (boxes: their art's). An index per POI, in a 2 km grid; ships fly over these, they just can't stop on one.
const CELL = 2, MARGIN = 0.6;   // grid cell (km); objects are filed into every cell their box (+ margin ≥ any pad) touches

export class Obstacles {
  constructor() { this.list = []; this.grid = new Map(); }
  /** o: { x, y, r } (a circle) or { x, y, hx, hy } (a box: half width / height) */
  add(o) {
    const i = this.list.push(o) - 1, hx = (o.r != null ? o.r : o.hx) + MARGIN, hy = (o.r != null ? o.r : o.hy) + MARGIN;
    for (let cx = Math.floor((o.x - hx) / CELL); cx <= Math.floor((o.x + hx) / CELL); cx++)
      for (let cy = Math.floor((o.y - hy) / CELL); cy <= Math.floor((o.y + hy) / CELL); cy++) {
        const k = cx + "," + cy; let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(i);
      }
    return i;
  }
  /** Is (x, y) inside object i grown by pad? */
  insideOne(i, x, y, pad) { const o = this.list[i]; return o.r != null ? (x - o.x) ** 2 + (y - o.y) ** 2 < (o.r + pad) ** 2 - 1e-9 : Math.abs(x - o.x) < o.hx + pad - 1e-9 && Math.abs(y - o.y) < o.hy + pad - 1e-9; }
  containing(x, y, pad) { const a = this.grid.get(Math.floor(x / CELL) + "," + Math.floor(y / CELL)) || []; return a.filter((i) => this.insideOne(i, x, y, pad)); }
  /** Push a point out of every object grown by pad (a few passes settle neighbors). */
  pushOut(p, pad) {
    for (let pass = 0; pass < 4; pass++) {
      const hit = this.containing(p.x, p.y, pad); if (!hit.length) return p;
      for (const i of hit) {
        const o = this.list[i];
        if (o.r != null) { let dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy); if (d < 1e-6) { dx = 1; dy = 0; d = 1; } const R = o.r + pad + 1e-4; p.x = o.x + dx / d * R; p.y = o.y + dy / d * R; }
        else { const dx = p.x - o.x, dy = p.y - o.y, hx = o.hx + pad + 1e-4, hy = o.hy + pad + 1e-4; if (hx - Math.abs(dx) < hy - Math.abs(dy)) p.x = o.x + (dx < 0 ? -hx : hx); else p.y = o.y + (dy < 0 ? -hy : hy); }
      }
    }
    return p;
  }
}
