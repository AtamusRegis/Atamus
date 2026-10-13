// Player stations (owner, 2026-10-11): every account has its own station, starting small, somewhere random in the
// Expanse and far from everyone else's. Its POI (HOME.rKm across ×2) is on its owner's map only; anyone else can find it
// only by flying there. You can dock at your own station, keep items in its storage and refit there. Its arms (later:
// parking ark ships) are drawn retracted or extended; the art and where its hub sits in each sprite are in
// stations.json (scripts/gen/stations.py cuts them from the reference sheets).
import { readFileSync } from "node:fs";
import { hangarsKm } from "./station.js";

export const STATION_ART = JSON.parse(readFileSync(new URL("./stations.json", import.meta.url), "utf8"));
export const HOME = {
  rKm: 25,                 // (owner) a 50 km POI
  size: "small",           // (owner) everyone starts with a small station
  apartKm: 1500,           // try to keep at least this far from other players' stations (the farthest spot found wins)
  clearKm: 300,            // and this far beyond any other POI's edge (belts, the Library, the Station)
};
export const homeId = (owner) => "home:" + owner;

// (owner) each station's hangar windows (see station.js hangarsKm), in the retracted art's pixels; the extended art
// adds its arms on the left (small, large: the windows shift right by the difference) or below (medium: no shift)
const HOME_HANGARS = {
  small: [{ fx: 157, fy: 114.5, out: 0, wide: 57, deep: 120 }],
  medium: [{ fx: 2, fy: 227, out: 180, wide: 180, deep: 200 }, { fx: 480, fy: 227, out: 0, wide: 180, deep: 200 }],
  large: [{ fx: 1360, fy: 200, out: -43, wide: 410, deep: 300 }, { fx: 1360, fy: 1201, out: 43, wide: 410, deep: 300 }],
};
/** The station as an object in space: its art at true size, centered so its hub is at the station's position. */
export function homeProps(h) {
  const size = STATION_ART.sizes[h.size] || STATION_ART.sizes.small, art = size[h.arms ? "extended" : "retracted"], k = STATION_ART.mPerPx / 1000;
  const shift = h.size === "medium" ? 0 : art.w - size.retracted.w;
  return [{ id: h.id + "#0", name: h.name, sprite: art.sprite, w: +(art.w * k).toFixed(4), h: +(art.h * k).toFixed(4),
    x: +(h.x + art.dx * k).toFixed(4), y: +(h.y - art.dy * k).toFixed(4), station: true, home: h.owner, hangars: hangarsKm(HOME_HANGARS[h.size] || HOME_HANGARS.small, art.w, art.h, STATION_ART.mPerPx, shift) }];   // (the art's y runs down, the world's up)
}
/** Where a warp to your station drops you: a few km south of it. */
export const homeLanding = (h) => ({ x: h.x + (Math.random() - 0.5) * 2, y: h.y - 4 + (Math.random() - 0.5) });
