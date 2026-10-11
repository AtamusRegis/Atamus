// Hostile / malformed input: the server must survive everything, and inventories and credits must stay sane.
import { connect, health, suite, sleep, SHIP, H0 } from "./lib.mjs";
const t = suite("fuzz");
const c = await connect();

// 1) specific malformed messages that once crashed or corrupted the server
const bad = [null, 1, "x", [], {}, { t: 5 }, { t: "inv_move" }, { t: "inv_move", from: null, to: null }, { t: "sell" }, { t: "jettison" }, { t: "read" }, { t: "assemble" },
  { t: "inv_sort" }, { t: "inv_split" }, { t: "inv_move", from: { ...H0, slot: 0 }, to: { ...H0, slot: -1 } }, { t: "inv_move", from: { ...H0, slot: 0 }, to: { ...H0, slot: "x" } },
  { t: "inv_move", from: { owner: "ship", id: SHIP, inv: "__proto__", slot: 0 }, to: H0 }, { t: "move", ships: "x" }, { t: "move", ships: [null, {}], x: 1, y: 1 }, { t: "lock" },
  { t: "laser", idx: "__proto__" }, { t: "chat", text: { a: 1 } }, { t: "buy", item: "__proto__" }, { t: "buy", item: "constructor" }, { t: "crew" }, { t: "rename_hangar", h: "x", name: "y" },
  { t: "view", poi: "__proto__" }, { t: "view", poi: 5 }, { t: "warpto", ships: [SHIP], poi: "__proto__" }, { t: "warpto", ships: "x", poi: "station" }, { t: "warpto", ships: [SHIP, SHIP, null], poi: { id: 1 } }, { t: "power", ship: SHIP, mod: "laser", idx: "x" }, { t: "power" }];
for (const b of bad) { c.send(b); await sleep(60); }
await sleep(300);
t.ok(await health(), "server survives malformed messages");

// 2) junk quantities never corrupt stacks or credits
c.dev({ cmd: "item", item: "cuprite", qty: 50 }); await sleep(400);
const cr0 = c.inv().credits;
for (const qty of ["abc", 0.5, -3, null, {}, 1e99]) {
  c.send({ t: "sell", ref: H0, slot: 0, qty }); c.send({ t: "inv_split", ref: H0, slot: 0, qty }); c.send({ t: "inv_move", from: { ...H0, slot: 0 }, to: { ...H0, h: 1 }, qty });
}
await sleep(600);
t.ok(Number.isFinite(c.inv().credits) && c.inv().credits >= cr0, "credits stay a finite number", c.inv().credits);

// 3) thousands of random commands, then check every inventory
const vals = [0, 1, -1, 2, 0.5, 1e9, NaN, null, undefined, "1", "x", "__proto__", [], {}, true, Infinity];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ships = () => (c.last.snap?.ships || []).filter((x) => x.mine).map((x) => x.id);
const ref = () => pick([{ ...H0, h: pick(vals) }, { owner: "station", inv: "delivery" }, { owner: "ship", id: pick(ships()), inv: pick(["ore", "cargo", "x"]) }, { owner: "can", id: "x" }, pick(vals)]);
const withSlot = () => { const r = ref(); return r && typeof r === "object" ? { ...r, slot: pick([0, 1, 2, ...vals]), item: pick(["cuprite", undefined, 3]) } : r; };
const cmds = [() => ({ t: "inv_move", from: withSlot(), to: withSlot(), qty: pick(vals) }), () => ({ t: "inv_split", ref: ref(), slot: pick(vals), qty: pick(vals) }),
  () => ({ t: "sell", ref: ref(), slot: pick([0, 1, ...vals]), qty: pick(vals) }), () => ({ t: "jettison", ref: ref(), slot: pick([0, ...vals]), qty: pick(vals) }),
  () => ({ t: "buy", item: pick(["ship:chisel", "manual:barges", "x", ...vals]), qty: pick(vals) }), () => ({ t: "read", ref: ref(), slot: pick(vals) }),
  () => ({ t: "assemble", ref: ref(), slot: pick([0, 1, ...vals]) }), () => ({ t: "dock", ship: pick(ships()), dock: pick(vals) }),
  () => ({ t: "move", ships: [pick(ships())], x: pick(vals), y: pick(vals) }), () => ({ t: "rename_ship", ship: pick(ships()), name: pick(vals) }),
  () => ({ t: "laser", ship: pick(ships()), idx: pick(vals), on: pick(vals), rock: pick(vals) }), () => ({ t: "lock", ship: pick(ships()), kind: pick(["rock", "ship", "x"]), id: pick(vals) }),
  () => ({ t: "power", ship: pick(ships()), mod: pick(["laser", "auto", "x"]), idx: pick(vals), on: pick(vals) }), () => ({ t: "chat", text: pick(vals), channel: pick(["local", "corp", "whisper"]), to: pick(vals) })];
for (let i = 0; i < 3000; i++) { c.send(cmds[Math.floor(Math.random() * cmds.length)]()); if (i % 30 === 0) await sleep(40); }
await sleep(1500);
t.ok(await health(), "server survives 3000 random commands");
const bad2 = [];
const chk = (where, i) => { if (!i) return; for (const st of i.slots) if (!Number.isInteger(st.qty) || st.qty <= 0 || typeof st.item !== "string") bad2.push(where); if (!(i.used <= i.cap + 1e-6)) bad2.push(where + " over cap"); if (i.slots.length > 100) bad2.push(where + " stacks"); };
const inv = c.inv(); inv.hangars.forEach((h, k) => chk("hangar" + k, h)); chk("delivery", inv.delivery);
for (const [id, sh] of Object.entries(inv.ships)) { chk(id + ".ore", sh.ore); chk(id + ".cargo", sh.cargo); }
t.ok(!bad2.length, "every stack is a whole positive number within capacity", bad2.slice(0, 5));
t.ok(inv.hangars.every((h) => typeof h.name === "string" && !h.name.includes("[object")), "hangar names stay strings");

// tidy the PTR back up
for (let h = 0; h < 4; h++) c.send({ t: "rename_hangar", h, name: "Hangar " + (h + 1) });
for (const id of ships()) { c.send({ t: "rename_ship", ship: id, name: "" }); for (const idx of [0, 1]) c.send({ t: "power", ship: id, mod: "laser", idx, on: true }); c.send({ t: "power", ship: id, mod: "auto", on: true }); }
await sleep(400); await c.close();
t.done();
