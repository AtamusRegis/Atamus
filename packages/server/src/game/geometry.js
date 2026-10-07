import {
  CELL_CIRCUMRADIUS_KM as R, CELL_APOTHEM_KM as APO, SYSTEM_RINGS,
} from "./constants.js";

// Flat-top hex cell edge normals (90° + 60°k).
const EDGE_NORMALS = [];
for (let k = 0; k < 6; k++) {
  const a = Math.PI / 2 + k * (Math.PI / 3);
  EDGE_NORMALS.push({ nx: Math.cos(a), ny: Math.sin(a) });
}

// Axial -> world center for a flat-top hex grid, cell size = circumradius R.
function axialToWorld(q, r) {
  return { x: R * 1.5 * q, y: R * Math.sqrt(3) * (r + q / 2) };
}
const hexDist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

// All cell centers within the ring radius, and which are on the outer ring.
export const CELLS = [];
const OUTER = [];
for (let q = -SYSTEM_RINGS; q <= SYSTEM_RINGS; q++) {
  for (let r = -SYSTEM_RINGS; r <= SYSTEM_RINGS; r++) {
    const d = hexDist(q, r);
    if (d > SYSTEM_RINGS) continue;
    const c = axialToWorld(q, r);
    CELLS.push(c);
    if (d === SYSTEM_RINGS) OUTER.push(c);
  }
}

// Three stargate cells, evenly spaced around the outer ring.
OUTER.sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
export const STARGATE_CELLS = [0, 1, 2].map((i) => OUTER[Math.floor((i * OUTER.length) / 3)]);

export const STATION_POS = { x: 0, y: 0 }; // center cell

export function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

function nearestCell(x, y) {
  let best = CELLS[0], bd = Infinity;
  for (const c of CELLS) {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

/** Clamp (x,y) to lie within the honeycomb (inside its nearest cell). */
export function clampToSystem(x, y) {
  const c = nearestCell(x, y);
  let lx = x - c.x, ly = y - c.y;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const { nx, ny } of EDGE_NORMALS) {
      const d = lx * nx + ly * ny;
      if (d > APO) { lx -= (d - APO) * nx; ly -= (d - APO) * ny; moved = true; }
    }
    if (!moved) break;
  }
  return { x: c.x + lx, y: c.y + ly };
}
