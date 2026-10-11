// The Station (owner, 2026-10-11, temporary): a POI with one station you dock at to reach your hangar (one per
// account, unlimited storage; no market). Ships dock within DOCK_KM of its edge; a docked ship leaves space until it
// undocks. The station is drawn like a Library prop (its art at true size) and a destination can't be on it.
export const STATION = { id: "station", kind: "station", name: "Station", x: 0, y: -1200, r: 30 };
export const DOCK_KM = 5;
const W = 1475 * 1.875 / 1000, H = 879 * 1.875 / 1000;   // the station's art at the game's 1.875 m a pixel (2.77 × 1.65 km)
export const stationProps = () => [{ id: "station#0", name: "Station", sprite: "ships/station_blue.webp", w: +W.toFixed(4), h: +H.toFixed(4), x: STATION.x, y: STATION.y, station: true }];
/** Where a warp into the Station drops out: 6 km south of it, give or take a little. */
export const stationLanding = () => ({ x: STATION.x + (Math.random() - 0.5) * 2, y: STATION.y - 6 + (Math.random() - 0.5) });
/** Edge-to-edge distance from a ship to the station's box. */
export function stationRange(s, prop) {
  const dx = Math.max(0, Math.abs(s.x - prop.x) - prop.w / 2), dy = Math.max(0, Math.abs(s.y - prop.y) - prop.h / 2);
  return Math.max(0, Math.hypot(dx, dy) - s.radius);
}
