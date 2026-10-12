// Pilots: first is free, each extra costs the pilot price, 3 per account. The trainer has the Mining Frigate license.
import { suite, sleep, BASE } from "./lib.mjs";
import pg from "../../packages/server/node_modules/pg/lib/index.js";
const db = new pg.Pool({ connectionString: "postgres://postgres@127.0.0.1:5433/atamus" });
await db.query(`UPDATE users SET credits = 0 WHERE lower(username) = 'ptr'`);   // (players start with 10M: none here, to check the price)
const t = suite("pilots");
const post = (path, body) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, body: await r.json() }));
const state = async () => (await fetch(BASE + "/game/state")).json();
const catalog = await (await fetch(BASE + "/game/catalog")).json();
t.ok(Array.isArray(catalog.licenses) && catalog.licenses[0].key === "mining_frigate" && catalog.licenses.length === 19 && catalog.licenses.every((l) => l.maxLevel === 5) && ["mining_lasers", "mining_drones", "beams", "missiles", "coilguns", "repeaters", "propulsion_jamming", "electronics"].every((k) => catalog.licenses.some((l) => l.key === k)), "the trainer: Mining Frigate and a license per module family, 5 levels each (owner, 2026-10-11)", catalog.licenses.map((l) => l.key));
const st0 = await state(), price = st0.profile.pilotPrice, max = st0.profile.maxPilots;
t.ok(price === 1_000_000 && max === 3, "price 1M, max 3", { price, max });
t.ok(st0.pilots.length === 1 && JSON.stringify(st0.pilots[0].licenses) === '{"mining_frigate":1}', "PTR starts with one pilot, Mining Frigate I known (run a PTR reset if not)", st0.pilots[0].licenses);
let r = await post("/game/pilot/create", { name: "Test Pilot A" });
t.ok(!r.ok && /costs/.test(r.body.error), "a second pilot needs credits", r);
r = await post("/game/queue/add", { pilotId: st0.pilots[0].id, key: "small_mining_laser" });
t.ok(!r.ok, "a license that isn't in the trainer can't be trained", r);
r = await post("/game/queue/add", { pilotId: st0.pilots[0].id, key: "mining_frigate" });
const q = (await state()).pilots[0].queue;
t.ok(r.ok && q.length === 1 && q[0].level === 2, "Mining Frigate II can be queued", { r, q });
await post("/game/queue/remove", { pilotId: st0.pilots[0].id, key: "mining_frigate" });

// portraits (owner): the account's character and each pilot's, checked against the server's part lists
const parts = await (await fetch(BASE + "/game/portraits")).json();
t.ok(parts.background.length === 25 && parts.skin.length === 5 && parts.hair.male.length && parts.hair.female.length, "the portrait parts come from the server", Object.keys(parts));
t.ok(st0.pilots[0].portrait && st0.pilots[0].portrait.gender, "a pilot made without one gets a random portrait", st0.pilots[0].portrait);
const good = { gender: "female", background: "nebula", skin: "tan", hair: "long", hairColor: "pink", shirt: "uniform", shirtColor: "red" };
for (const bad of [null, "x", { ...good, gender: "other" }, { ...good, hair: "buzz" }, { ...good, skin: "../../x" }, { ...good, background: "__proto__" }]) {
  r = await post("/game/character", { portrait: bad }); t.ok(!r.ok, "a bad portrait is refused", bad);
}
r = await post("/game/pilot/create", { name: "Test Pilot B", portrait: { ...good, hair: "mohawk", gender: "male", extra: 1 } });
t.ok(!r.ok, "a new pilot's portrait is checked too (and still needs the credits)", r);
r = await post("/game/character", { portrait: { ...good, extra: "x" } }); const st1 = await state();
const same = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b).sort());
t.ok(r.ok && same(st1.profile.portrait, good), "the account's character is saved, nothing extra kept", st1.profile.portrait);
await db.query(`UPDATE users SET credits = 10000000 WHERE lower(username) = 'ptr'`); await db.end();
await sleep(100);
t.done();
