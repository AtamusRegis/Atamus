// Slot-based inventories. A dense list of stacks [{item, qty}], limited by
// unique stacks (100) and by volume (m3). Items are defined in ITEMS.
import { ORES } from "./belts.js";

export const MAX_STACKS = 100;
export const ITEMS = {};
for (const o of ORES) ITEMS[o.key] = { key: o.key, name: o.name, kind: "ore", unitM3: o.unitM3, price: o.price, color: o.color, icon: "rock_" + o.rock + "_200" };

export const makeInv = (cap) => ({ cap, slots: [] });
export const usedM3 = (inv) => inv.slots.reduce((s, st) => s + st.qty * (ITEMS[st.item]?.unitM3 || 0), 0);
export const freeM3 = (inv) => Math.max(0, inv.cap - usedM3(inv));

/** How many units of `item` fit right now (volume + stack-count limits). */
export function canAdd(inv, item, qty) {
  const def = ITEMS[item]; if (!def) return 0;
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
  const st = from.slots[fromIdx]; if (!st) return 0;
  qty = Math.min(qty ?? st.qty, st.qty); if (qty <= 0) return 0;
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
/** Take up to qty units out of a slot. Returns the qty removed. */
export function take(inv, idx, qty) {
  const st = inv.slots[idx]; if (!st) return 0;
  const n = Math.max(0, Math.min(Math.floor(qty), st.qty)); if (n <= 0) return 0;
  st.qty -= n; if (st.qty <= 0) inv.slots.splice(idx, 1);
  return n;
}
export function sort(inv) { inv.slots.sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : b.qty - a.qty)); }
export const summary = (inv) => ({ cap: inv.cap, used: +usedM3(inv).toFixed(2), stacks: inv.slots.length, slots: inv.slots });
