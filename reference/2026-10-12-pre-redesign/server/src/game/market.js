// The NPC stations' market (owner, 2026-10-11, "for now"): every NPC station sells everything — every module, weapon,
// ammo, drones and fuel, license manuals and ore — at fixed prices, into the buyer's hangar at that station. Nothing is
// bought back yet.
import { MODULES, ITEMS } from "./modules.js";
import { ORES } from "./belts.js";
import { LICENSES } from "../licenses.js";

// (owner) license manuals: read one (it's used up) to be allowed to train that license, account-wide
for (const l of LICENSES) if (!l.free) ITEMS["manual_" + l.key] = { key: "manual_" + l.key, manual: l.key, name: l.name + " Manual", m3: 0.1, icon: "components/circuit_board.png", desc: "Read it to be able to train " + l.name + "." };

const SIZE_K = { s: 1, m: 4, l: 15 }, TIER_K = { 1: 1, 2: 8 };
const KIND_BASE = { weapon: 40_000, mining: 20_000, drones: 30_000 };
const AMMO_BASE = { missile: 20, beam: 400, repeater: 5, coilgun: 12 }, AMMO_SIZE = { s: 1, m: 2.5, l: 6 }, AMMO_TIER = { 1: 1, 2: 4 };
const ORE_PRICE = [10, 30, 80, 200, 500];             // a unit (m³), by rarity tier
export const PRICES = {};
for (const m of Object.values(MODULES)) PRICES[m.key] = Math.round((m.slot === "passive" ? 15_000 : KIND_BASE[m.kind] || 25_000) * SIZE_K[m.size] * TIER_K[m.tier]);
for (const it of Object.values(ITEMS)) {
  if (it.ammo) PRICES[it.key] = Math.round(AMMO_BASE[it.ammo] * AMMO_SIZE[it.size] * AMMO_TIER[it.tier]);
  else if (it.manual) PRICES[it.key] = 100_000;
}
PRICES.drone = 25_000; PRICES.drone_fuel = 200;
for (const o of ORES) PRICES["ore:" + o.key] = ORE_PRICE[o.tier] || 10;
export const priceOf = (k) => (typeof k === "string" && Number.isFinite(PRICES[k]) ? PRICES[k] : null);
export const MAX_BUY = 100_000;                         // the most of one item in one purchase
