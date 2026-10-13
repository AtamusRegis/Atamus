// The Station (owner, 2026-10-11, temporary): a POI with one station you dock at to reach your hangar (one per
// account, unlimited storage; no market). Ships dock within DOCK_KM of its edge; a docked ship leaves space until it
// undocks. The station is drawn like a Library prop (its art at true size) and a destination can't be on it.
import { PLANETS } from "./celestials.js";
// (owner, 2026-10-11) an NPC station at every planet (trading comes with the market): a pilot starts at the one of the
// planet picked when making them, and each station keeps its own hangar per account. Earth's keeps the id "station".
export const STATIONS = PLANETS.map((p) => { const d = p.r + (p.key === "uranus" ? 200 : 250);   // (clear of Uranus's rings)
  return { id: p.key === "earth" ? "station" : "station:" + p.key, kind: "station", name: p.name + " Station", planet: p.key, x: +(p.x + Math.cos(3.6) * d).toFixed(2), y: +(p.y + Math.sin(3.6) * d).toFixed(2), r: 30 }; });
export const STATION = STATIONS.find((s) => s.planet === "earth");
export const stationById = (id) => STATIONS.find((s) => s.id === id) || null;
export const stationOfPlanet = (key) => STATIONS.find((s) => s.planet === key) || STATION;
export const DOCK_KM = 5;
const W = 1475 * 1.875 / 1000, H = 879 * 1.875 / 1000;   // the station's art at the game's 1.875 m a pixel (2.77 × 1.65 km)
// (owner) hangars: where ships fly in to dock and out to undock. Each, in the art's pixels (y down): the middle of its
// front edge (fx, fy), which way it opens (out, degrees: 0 east, 90 south), how wide it is across (wide) and how deep
// a ship disappears into it (deep). The Station's is its whole U-shaped bay, opening west.
const STATION_HANGARS = [{ fx: 260, fy: 555, out: 180, wide: 314, deep: 795 }];
/** Hangars in km from the prop's middle, the world's way up: the front's middle (ox, oy), the outward direction (out,
 *  radians), half the width across (half) and the depth (depth). */
export function hangarsKm(list, artW, artH, mPerPx, shiftPx = 0) {
  const k = mPerPx / 1000;
  return list.map((h) => ({ ox: +((h.fx + shiftPx - artW / 2) * k).toFixed(4), oy: +(-(h.fy - artH / 2) * k).toFixed(4), out: +(-h.out * Math.PI / 180).toFixed(4), half: +(h.wide / 2 * k).toFixed(4), depth: +(h.deep * k).toFixed(4) }));
}
/** A prop's hangar in world terms: its front's middle (x, y) and the outward unit direction (nx, ny). */
export function hangarAt(prop, i = 0) {
  const h = prop && prop.hangars && prop.hangars[i]; if (!h) return null;
  return { x: prop.x + h.ox, y: prop.y + h.oy, nx: Math.cos(h.out), ny: Math.sin(h.out), half: h.half, depth: h.depth, i };
}
/** The hangar whose front is nearest a point. */
export function nearestHangar(prop, x, y) {
  let best = null; for (let i = 0; i < ((prop && prop.hangars) || []).length; i++) { const h = hangarAt(prop, i), d = Math.hypot(h.x - x, h.y - y); if (!best || d < best.d) best = { ...h, d }; }
  return best;
}
export const stationProps = (st = STATION) => [{ id: st.id + "#0", name: st.name, sprite: "ships/station_blue.webp", w: +W.toFixed(4), h: +H.toFixed(4), x: st.x, y: st.y, station: true, hangars: hangarsKm(STATION_HANGARS, 1475, 879, 1.875) }];
/** Where a warp into the Station drops out: 6 km south of it, give or take a little. */
export const stationLanding = (st = STATION) => ({ x: st.x + (Math.random() - 0.5) * 2, y: st.y - 6 + (Math.random() - 0.5) });
/** Edge-to-edge distance from a ship to the station's box. */
export function stationRange(s, prop) {
  const dx = Math.max(0, Math.abs(s.x - prop.x) - prop.w / 2), dy = Math.max(0, Math.abs(s.y - prop.y) - prop.h / 2);
  return Math.max(0, Math.hypot(dx, dy) - s.radius);
}
