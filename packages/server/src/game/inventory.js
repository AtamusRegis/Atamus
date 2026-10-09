// Slot-based inventories. A dense list of stacks [{item, qty}], limited by
// unique stacks (100) and by volume (m3). Items are defined in ITEMS.
import { ORES } from "./belts.js";
import { LICENSES, CATEGORIES } from "../licenses.js";
import { SHIP_TYPES, SHIP_CLASSES, SHIP_ROLES, MODULE_CATEGORIES } from "./constants.js";

export const MAX_STACKS = 100;
export const ITEMS = {};
for (const o of ORES) ITEMS[o.key] = { key: o.key, name: o.name, kind: "ore", desc: o.desc, rarity: o.rarity, unitM3: o.unitM3, price: o.price, color: o.color, icon: "assets/icons/ore_" + o.rock + ".png" };
// Training manuals: one per license that isn't granted at birth. Reading one unlocks training that license.
export const MANUAL_PRICE = (lic) => { const hrs = lic.levelTimes.reduce((a, b) => a + b, 0) / 3600000; return Math.round(1_000_000 + hrs * 25_000); };
for (const lic of LICENSES) if (!lic.free) ITEMS["manual:" + lic.key] = { key: "manual:" + lic.key, name: lic.name + " Manual", kind: "manual", license: lic.key, desc: "Training manual. Read it to unlock the " + lic.name + " license for training. " + lic.desc, rarity: "restricted", unitM3: 0.1, price: MANUAL_PRICE(lic), color: "#c9b36a", icon: null };
// Modules: fitted to ships at a station. size counts against the hull's disposition; draw is the capacitor
// a running module uses; cap is capacitor a passive module adds. license: [key, level] needed to activate.
export const MODULES = {
  "module:mining_laser": { name: "Mining Laser", cat: "mining", role: "laser", size: 10, draw: 10, license: ["small_mining_laser", 1], price: 60_000, icon: "assets/icons/mining_laser.png",
    desc: "Cuts ore from a locked asteroid. The ore lands in the ore hold when each cycle completes." },
  "module:auto_miner": { name: "Auto Miner", cat: "automation", role: "auto", size: 15, draw: 5, license: ["auto_miner", 1], price: 250_000, icon: "assets/icons/auto_miner.png",
    desc: "Each cycle, puts every idle mining laser on the first locked asteroid in range." },
  "module:cap_battery": { name: "Capacitor Battery", cat: "power", role: "battery", size: 8, cap: 12, price: 120_000, icon: null,
    desc: "Stores extra power for the ship's capacitor, so more modules can run at once." },
};
for (const [k, m] of Object.entries(MODULES)) ITEMS[k] = { key: k, kind: "module", ...m, rarity: "module", unitM3: 5, color: "#7f8fb0" };
// Packaged ships: bought ships arrive as items in the station's Deliveries; Assemble turns one into a docked ship.
const PACKAGED_M3 = { "Mining Frigate": 2500, "Mining Barge": 3750, "Exhumer": 3750 };
for (const [k, t] of Object.entries(SHIP_TYPES)) ITEMS["ship:" + k] = { key: "ship:" + k, name: t.name, kind: "ship", ship: k, desc: t.desc + " Packaged: assemble it in a station to fly it.", rarity: t.cls, unitM3: PACKAGED_M3[t.cls] || 5000, price: t.price, color: "#6a7fa8", icon: "assets/ships/" + t.sprite + "_blue.webp" };
// What the station market sells. path: the market window's nested groups (Ships > Industry > Mining Frigate).
const catName = (k) => (CATEGORIES.find((c) => c.key === k) || {}).name || k;
export const MARKET = [
  ...Object.entries(SHIP_TYPES).sort((a, b) => SHIP_ROLES.indexOf(a[1].role) - SHIP_ROLES.indexOf(b[1].role) || SHIP_CLASSES.indexOf(a[1].cls) - SHIP_CLASSES.indexOf(b[1].cls) || a[1].price - b[1].price)
    .map(([k, t]) => ({ key: "ship:" + k, name: t.name, price: t.price, path: ["Ships", t.role, t.cls], ship: k })),
  ...Object.entries(MODULES).map(([k, m]) => ({ key: k, name: m.name, price: m.price, path: ["Modules", MODULE_CATEGORIES[m.cat]] })),
  ...Object.values(ITEMS).filter((it) => it.kind === "manual")
    .map((it) => ({ key: it.key, name: it.name, price: it.price, path: ["Training Manuals", catName(LICENSES.find((l) => l.key === it.license).category)] })),
];

export const makeInv = (cap) => ({ cap, slots: [] });
// Quantities and slot numbers arrive from clients: whole numbers only, anything else -> fallback.
const int = (v, fallback) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : fallback; };
const slotIdx = (inv, v) => { const i = int(v, -1); return i >= 0 && i < inv.slots.length ? i : -1; };
export const usedM3 = (inv) => inv.slots.reduce((s, st) => s + st.qty * (ITEMS[st.item]?.unitM3 || 0), 0);
export const freeM3 = (inv) => Math.max(0, inv.cap - usedM3(inv));

/** How many units of `item` fit right now (volume + stack-count limits). */
export function canAdd(inv, item, qty) {
  const def = ITEMS[item]; if (!def || !Object.hasOwn(ITEMS, item)) return 0;
  qty = int(qty, 0); if (qty <= 0) return 0;
  const has = inv.slots.some((s) => s.item === item);
  if (!has && inv.slots.length >= MAX_STACKS) return 0;
  return Math.max(0, Math.min(qty, Math.floor(freeM3(inv) / def.unitM3 + 1e-9)));
}
export function add(inv, item, qty) {
  const n = canAdd(inv, item, qty); if (n <= 0) return 0;
  const st = inv.slots.find((s) => s.item === item);
  if (st) st.qty += n; else inv.slots.push({ item, qty: n });
  return n;
}
/** Move a stack (or part of it) from one inventory slot to another inventory/slot. Returns moved qty. */
export function move(from, fromIdx, to, toIdx, qty) {
  fromIdx = slotIdx(from, fromIdx); const st = from.slots[fromIdx]; if (!st) return 0;
  qty = Math.min(qty == null ? st.qty : int(qty, 0), st.qty); if (qty <= 0) return 0;
  if (toIdx != null) { toIdx = int(toIdx, null); if (toIdx != null && toIdx < 0) toIdx = null; }
  if (from === to) {                             // reorder / merge within one inventory
    if (toIdx == null || toIdx >= to.slots.length) { from.slots.splice(fromIdx, 1); to.slots.push(st); return st.qty; }
    const target = to.slots[toIdx];
    if (target === st) return 0;
    if (target.item === st.item) { target.qty += st.qty; from.slots.splice(fromIdx, 1); return st.qty; }
    [from.slots[fromIdx], to.slots[toIdx]] = [target, st]; return st.qty;   // swap
  }
  const target = toIdx != null ? to.slots[toIdx] : (to.slots.find((s) => s.item === st.item) || null); // no slot given: merge into an existing stack
  let n;
  if (target && target.item === st.item) { n = canAdd(to, st.item, qty); if (n <= 0) return 0; target.qty += n; }
  else { n = canAdd(to, st.item, qty); if (n <= 0) return 0; if (toIdx != null && toIdx < to.slots.length) to.slots.splice(toIdx, 0, { item: st.item, qty: n }); else to.slots.push({ item: st.item, qty: n }); }
  st.qty -= n; if (st.qty <= 0) from.slots.splice(fromIdx, 1);
  return n;
}
/** Split qty units off a stack into a new stack (same inventory). Returns the qty split. */
export function split(inv, idx, qty) {
  idx = slotIdx(inv, idx); const st = inv.slots[idx]; if (!st) return 0;
  const n = Math.max(0, Math.min(int(qty, 0), st.qty - 1)); if (n <= 0 || inv.slots.length >= MAX_STACKS) return 0;
  st.qty -= n; inv.slots.splice(idx + 1, 0, { item: st.item, qty: n });
  return n;
}
/** Take up to qty units out of a slot. Returns the qty removed. */
export function take(inv, idx, qty) {
  idx = slotIdx(inv, idx); const st = inv.slots[idx]; if (!st) return 0;
  const n = Math.max(0, Math.min(int(qty, 0), st.qty)); if (n <= 0) return 0;
  st.qty -= n; if (st.qty <= 0) inv.slots.splice(idx, 1);
  return n;
}
export function sort(inv) { inv.slots.sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : b.qty - a.qty)); }
export const summary = (inv) => ({ cap: inv.cap, used: +usedM3(inv).toFixed(2), stacks: inv.slots.length, slots: inv.slots });
