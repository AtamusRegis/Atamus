// Pathfinding around non-player objects (owner, 2026-10-11): asteroids (circles) and Library props (boxes). Ships fly
// a list of waypoints that goes around them. Ships themselves are never obstacles (they pass over each other).
//
// An Obstacles index holds a POI's objects in a 2 km grid. A path is found on a visibility graph that's discovered
// lazily: start with the objects the straight line hits, put waypoints around each (an octagon around a circle, the
// corners of a box, a little outside the ship's clearance), run A* where every edge is checked against all the
// objects, and add any object that blocked an edge, until a path is found (or it gives up and flies straight).
const CELL = 2, MARGIN = 0.6;   // grid cell (km); objects are filed into every cell their box (+ margin ≥ any pad) touches
const OCT = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]), OCT_K = 1 / Math.cos(Math.PI / 8);

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
  // the grid cells a segment passes through (Amanatides & Woo), each object once
  _along(ax, ay, bx, by) {
    const out = new Set(), visit = (cx, cy) => { const a = this.grid.get(cx + "," + cy); if (a) for (const i of a) out.add(i); };
    let cx = Math.floor(ax / CELL), cy = Math.floor(ay / CELL); const ex = Math.floor(bx / CELL), ey = Math.floor(by / CELL);
    const dx = bx - ax, dy = by - ay, sx = Math.sign(dx), sy = Math.sign(dy);
    let tx = dx ? ((sx > 0 ? (cx + 1) * CELL - ax : ax - cx * CELL) / Math.abs(dx)) : Infinity, ty = dy ? ((sy > 0 ? (cy + 1) * CELL - ay : ay - cy * CELL) / Math.abs(dy)) : Infinity;
    const ddx = dx ? CELL / Math.abs(dx) : Infinity, ddy = dy ? CELL / Math.abs(dy) : Infinity;
    visit(cx, cy);
    for (let n = Math.abs(ex - cx) + Math.abs(ey - cy); n > 0; n--) { if (tx < ty) { cx += sx; tx += ddx; } else { cy += sy; ty += ddy; } visit(cx, cy); }
    return out;
  }
  /** Is (x, y) inside object i grown by pad? */
  insideOne(i, x, y, pad) { const o = this.list[i]; return o.r != null ? (x - o.x) ** 2 + (y - o.y) ** 2 < (o.r + pad) ** 2 - 1e-9 : Math.abs(x - o.x) < o.hx + pad - 1e-9 && Math.abs(y - o.y) < o.hy + pad - 1e-9; }
  containing(x, y, pad) { const a = this.grid.get(Math.floor(x / CELL) + "," + Math.floor(y / CELL)) || []; return a.filter((i) => this.insideOne(i, x, y, pad)); }
  // where a segment (t 0..1) enters object i grown by pad, or null
  _hitT(i, ax, ay, bx, by, pad) {
    const o = this.list[i], dx = bx - ax, dy = by - ay;
    if (o.r != null) {
      const R = o.r + pad, fx = ax - o.x, fy = ay - o.y, A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - R * R;
      if (A < 1e-12) return C < -1e-9 ? 0 : null;
      const disc = B * B - 4 * A * C; if (disc <= 1e-12) return null;
      const s = Math.sqrt(disc), t0 = (-B - s) / (2 * A), t1 = (-B + s) / (2 * A);
      if (t1 <= 1e-9 || t0 >= 1 - 1e-9 || t1 - t0 < 1e-7) return null;
      return Math.max(0, t0);
    }
    let t0 = 0, t1 = 1;                                  // slabs
    for (const [p, d, c, h] of [[ax, dx, o.x, o.hx + pad], [ay, dy, o.y, o.hy + pad]]) {
      if (Math.abs(d) < 1e-12) { if (p <= c - h + 1e-9 || p >= c + h - 1e-9) return null; continue; }
      let a = (c - h - p) / d, b = (c + h - p) / d; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t1 - t0 < 1e-7) return null;
    }
    return t0;
  }
  /** The first object a segment runs into (not counting `skip`), or -1. */
  firstHit(ax, ay, bx, by, pad, skip) {
    let best = -1, bt = Infinity;
    for (const i of this._along(ax, ay, bx, by)) { if (skip && skip.has(i)) continue; const t = this._hitT(i, ax, ay, bx, by, pad); if (t != null && t < bt) { bt = t; best = i; } }
    return best;
  }
  allHits(ax, ay, bx, by, pad, skip) { const out = []; for (const i of this._along(ax, ay, bx, by)) if (!(skip && skip.has(i)) && this._hitT(i, ax, ay, bx, by, pad) != null) out.push(i); return out; }
  // waypoints around object i, just outside it grown by pad
  corners(i, pad) {
    const o = this.list[i], e = 0.01;
    if (o.r != null) { const R = (o.r + pad + e) * OCT_K; return OCT.map(([c, s]) => ({ x: o.x + c * R, y: o.y + s * R })); }
    const hx = o.hx + pad + e, hy = o.hy + pad + e;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: o.x + sx * hx, y: o.y + sy * hy }));
  }
  /** Push a point out of every object grown by pad (a few passes settle neighbours). */
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

/** Waypoints from a to b (not including a) around the objects, or null if none was found. */
export function findPath(ix, a, b, pad, maxNodes = 320) {
  const skip = new Set([...ix.containing(a.x, a.y, pad), ...ix.containing(b.x, b.y, pad)]);   // never trapped by one it's already in
  const hit = (p, q) => ix.firstHit(p.x, p.y, q.x, q.y, pad, skip);
  if (hit(a, b) < 0) return [{ x: b.x, y: b.y }];
  const nodes = [a, b], disc = new Set(), vis = new Map();
  const discover = (i) => {
    if (disc.has(i) || skip.has(i)) return false; disc.add(i);
    for (const p of ix.corners(i, pad)) if (!ix.containing(p.x, p.y, pad).length) nodes.push(p);
    return true;
  };
  for (const i of ix.allHits(a.x, a.y, b.x, b.y, pad, skip)) discover(i);
  for (let iter = 0; iter < 24 && nodes.length <= maxNodes; iter++) {
    const n = nodes.length, g = new Float64Array(n).fill(Infinity), f = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), closed = new Uint8Array(n), open = new Set([0]);
    const h = (i) => Math.hypot(nodes[i].x - b.x, nodes[i].y - b.y);
    g[0] = 0; f[0] = h(0); const blockers = new Set(); let found = false;
    while (open.size) {
      let u = -1; for (const i of open) if (u < 0 || f[i] < f[u]) u = i;
      open.delete(u); closed[u] = 1;
      if (u === 1) { found = true; break; }
      for (let v = 0; v < n; v++) {
        if (closed[v] || v === u) continue;
        const key = u < v ? u * 100003 + v : v * 100003 + u;
        let blk = vis.get(key); if (blk === undefined) { blk = hit(nodes[u], nodes[v]); vis.set(key, blk); }
        if (blk >= 0) { blockers.add(blk); continue; }
        const ng = g[u] + Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
        if (ng < g[v]) { g[v] = ng; f[v] = ng + h(v); from[v] = u; open.add(v); }
      }
    }
    if (found) {
      const path = []; for (let v = 1; v > 0; v = from[v]) path.unshift({ x: nodes[v].x, y: nodes[v].y });
      return path;
    }
    let added = false; for (const i of blockers) added = discover(i) || added;
    if (!added) break;
  }
  return null;
}
