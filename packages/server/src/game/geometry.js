import { HEX_APOTHEM_KM } from "./constants.js";

// Flat-top hexagon: six edges whose outward normals point at 90°, 150°, ... 30°.
// Each edge is the line { p : p·n = apothem }.
const EDGE_NORMALS = [];
for (let k = 0; k < 6; k++) {
  const a = (Math.PI / 2) + k * (Math.PI / 3); // 90° + 60°k
  EDGE_NORMALS.push({ nx: Math.cos(a), ny: Math.sin(a) });
}

/** True if (x,y) is inside the hexagon (within the apothem of every edge). */
export function insideHex(x, y, apothem = HEX_APOTHEM_KM) {
  for (const { nx, ny } of EDGE_NORMALS) {
    if (x * nx + y * ny > apothem + 1e-9) return false;
  }
  return true;
}

/** Clamp (x,y) to lie inside the hexagon. Returns a new {x,y}. */
export function clampToHex(x, y, apothem = HEX_APOTHEM_KM) {
  // A few relaxation passes handle corners where two edges are violated.
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const { nx, ny } of EDGE_NORMALS) {
      const d = x * nx + y * ny;
      if (d > apothem) {
        const over = d - apothem;
        x -= over * nx;
        y -= over * ny;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, y };
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
