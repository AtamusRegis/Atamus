// The Library (owner, 2026-10-11): a POI that shows every space object's art in rows: the ships (yours in blue, then
// others' in red), the NPC law ships, the structures and the asteroids. Its objects are props: drawn at true size,
// solid, nothing else. Sizes come from the art: nearly every sprite is drawn at 1.875 m per pixel (the Prospector's
// 68 px are its 128 m; the station, stargate, turret, can, drone and every ark but the Light Ark match), so objects
// with no size of their own get that scale.
const M_PER_PX = 1.875;
// [name, sprite (under assets/), width px, height px, width km if it has its own]
const SHIPS = [
  ["Prospector", "chisel", 68, 35, 0.128], ["Wick", "wick", 68, 37], ["Bulwark", "barge_xs", 163, 70, 0.305], ["Rampart", "exhumer_xs", 163, 70, 0.305],
  ["Dredger", "barge_s", 200, 70, 0.375], ["Excavator", "exhumer_s", 200, 70, 0.375], ["Collier", "barge_m", 219, 70, 0.411], ["Carrack", "exhumer_m", 219, 70, 0.411],
  ["Beacon", "beacon", 215, 104], ["Light Ark", "mini_ark", 458, 180, 0.559], ["Gleaner", "gleaner", 458, 285], ["Lodestar", "lodestar", 458, 285],
  ["Motherlode", "motherlode", 773, 211], ["Vigil", "vigil", 782, 293], ["Heavy Ark", "small_ark", 817, 298, 1.532], ["Capital Ark", "ark", 3010, 1002, 5.646],
];
const ROWS = [
  SHIPS.map(([n, s, w, h, km]) => [n, "ships/" + s + "_blue.webp", w, h, km]),
  SHIPS.map(([n, s, w, h, km]) => [n, "ships/" + s + "_red.webp", w, h, km]),
  [["Deputy", "ships/deputy.webp", 46, 96], ["Constable", "ships/constable.webp", 231, 164], ["Magistrate", "ships/magistrate.webp", 1004, 376]],
  [["Mining Drone", "ships/drone_blue.webp", 34, 18], ["Mining Drone", "ships/drone_red.webp", 34, 18], ["Jettison Can", "ships/jettison_can_off.png", 37, 26], ["Jettison Can", "ships/jettison_can_on.png", 37, 26],
    ["Turret Base", "ships/turret_base.webp", 227, 220], ["Turret Head", "ships/turret_head.webp", 261, 138], ["Acceleration Gate", "ships/accel_gate.webp", 341, 349],
    ["Stargate", "ships/stargate.webp", 181, 1255], ["Station", "ships/station_blue.webp", 1475, 879], ["Station", "ships/station_red.webp", 1475, 878]],
];
// asteroids: every ore's rock in each size (the rock's size is its width, as in a belt)
const FAMILIES = [["Cryonite", "cratered"], ["Pyroxite", "elongated"], ["Duranite", "fractured"], ["Hexite", "bubble"], ["Tantalite", "layered"]];
const ROCK_PX = { bubble: { 1000: [485, 531], 500: [267, 257], 200: [106, 106] }, cratered: { 1000: [489, 532], 500: [244, 265], 200: [107, 94] }, elongated: { 1000: [533, 324], 500: [267, 188], 200: [107, 87] },
  fractured: { 1000: [533, 440], 500: [218, 265], 200: [88, 106] }, layered: { 1000: [494, 531], 500: [267, 221], 200: [107, 72] } };
ROWS.push(FAMILIES.flatMap(([n, f]) => [200, 500, 1000].map((size) => { const [w, h] = ROCK_PX[f][size]; return [n, "rocks/rock_" + f + "_" + size + ".webp", w, h, size / 1000]; })));

import { EARTH } from "./celestials.js";
export const LIBRARY = { id: "library", kind: "library", name: "Library", x: +(EARTH.x + Math.cos(0.4) * 650).toFixed(2), y: +(EARTH.y + Math.sin(0.4) * 650).toFixed(2), r: 30 };   // (owner, 2026-10-11) near Earth
const GAP_KM = 0.6, ROW_GAP_KM = 1.5, SHELF_UP_KM = 10;
/** The props, laid out in centered rows from the top down (km, relative to the world). */
export function libraryProps() {
  const rows = ROWS.map((row) => row.map(([name, sprite, pw, ph, km]) => { const w = km || pw * M_PER_PX / 1000; return { name, sprite, w: +w.toFixed(4), h: +(w * ph / pw).toFixed(4) }; }));
  const heights = rows.map((r) => Math.max(...r.map((o) => o.h)));
  const total = heights.reduce((a, b) => a + b, 0) + ROW_GAP_KM * (rows.length - 1);
  const out = []; let top = LIBRARY.y + SHELF_UP_KM + total / 2;   // the shelves sit above the center, clear of its map marker
  rows.forEach((row, i) => {
    const cy = top - heights[i] / 2, width = row.reduce((a, o) => a + o.w, 0) + GAP_KM * (row.length - 1);
    let x = LIBRARY.x - width / 2;
    for (const o of row) { out.push({ id: "lib#" + out.length, ...o, x: +(x + o.w / 2).toFixed(4), y: +cy.toFixed(4) }); x += o.w + GAP_KM; }
    top -= heights[i] + ROW_GAP_KM;
  });
  return out;
}
/** Where a warp into the Library drops out: below the bottom row, give or take a little. */
export function libraryLanding(props) {
  const bottom = Math.min(...props.map((o) => o.y - o.h / 2));
  return { x: LIBRARY.x + (Math.random() - 0.5) * 2, y: bottom - 4 + (Math.random() - 0.5) };
}
