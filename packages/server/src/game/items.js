// Items in holds and hangars (owner): modules, drones and their fuel (modules.js), and ore ("ore:<key>", 1 m³ a unit).
import { readFileSync } from "node:fs";
import { MODULES, ITEMS, itemKey } from "./modules.js";
import { ORES, oreOf } from "./belts.js";

export const itemM3 = (k) => (MODULES[k] ? MODULES[k].m3 : ITEMS[k] ? ITEMS[k].m3 : 1);
export const isItem = (k) => !!MODULES[k] || !!ITEMS[k] || (typeof k === "string" && k.startsWith("ore:") && ORES.some((o) => "ore:" + o.key === k));
export const isCountable = (k) => !!MODULES[k] || !!ITEMS[k];   // (whole items; ore comes in fractions)
export const holdUsed = (h, hold) => Object.entries(h[hold] || {}).reduce((t, [k, n]) => t + itemM3(k) * n, 0);
export function addItem(h, hold, k, n) { h[hold] ||= {}; h[hold][k] = +((h[hold][k] || 0) + n).toFixed(2); }
export function takeItem(h, hold, k, n) { const v = +(((h[hold] || {})[k] || 0) - n).toFixed(2); if (v <= 0) delete h[hold][k]; else h[hold][k] = v; }
/** The hold an item goes in: ore in the ore hold, drones in the drone bay, the rest in the cargo hold. */
export const holdFor = (k) => (k.startsWith("ore:") ? "ore" : k === "drone" ? "drones" : "cargo");
/** A saved stack list ({ item: qty }), cleaned: real items (old keys as their S I), positive amounts. */
export function loadItems(v) {
  const h = {}; if (!v || typeof v !== "object") return h;
  for (const [k0, n] of Object.entries(v)) { const k = itemKey(k0); if (isItem(k) && Number.isFinite(n) && n > 0) h[k] = +((h[k] || 0) + n).toFixed(2); }
  return h;
}

// (owner) a laser aims only at the rock itself: points well inside each rock sprite's opaque part, as fractions of its
// width from its center (v down, as drawn; scripts/gen/rockmasks.py makes them), turned and scaled like the art
const ROCK_MASKS = JSON.parse(readFileSync(new URL("./rockmasks.json", import.meta.url), "utf8"));
export function aimPoint(k) {
  if (!k) return { ax: 0, ay: 0, size: 0 };
  const pts = ROCK_MASKS[((oreOf(k.ore) || {}).rock || "cratered") + "_" + k.size], w = k.size / 1000;
  const [u, v] = pts && pts.length ? pts[Math.floor(Math.random() * pts.length)] : [0, 0], c = Math.cos(k.rot || 0), sn = Math.sin(k.rot || 0);
  return { ax: +((u * c - v * sn) * w).toFixed(4), ay: +(-(u * sn + v * c) * w).toFixed(4), size: k.size };   // screen y is down, world y up
}
