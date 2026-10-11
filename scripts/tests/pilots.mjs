// Pilots: first is free, each extra costs the pilot price, 3 per account. The license trainer is empty for now.
import { suite, sleep, BASE } from "./lib.mjs";
const t = suite("pilots");
const post = (path, body) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, body: await r.json() }));
const state = async () => (await fetch(BASE + "/game/state")).json();
const catalog = await (await fetch(BASE + "/game/catalog")).json();
t.ok(Array.isArray(catalog.licenses) && catalog.licenses.length === 0, "the license catalog is empty (owner, 2026-10-10)", catalog.licenses.length);
const st0 = await state(), price = st0.profile.pilotPrice, max = st0.profile.maxPilots;
t.ok(price === 1_000_000 && max === 3, "price 1M, max 3", { price, max });
t.ok(st0.pilots.length === 1 && Object.keys(st0.pilots[0].licenses).length === 0, "PTR starts with one pilot, no licenses (run a PTR reset if not)", st0.pilots);
let r = await post("/game/pilot/create", { name: "Test Pilot A" });
t.ok(!r.ok && /costs/.test(r.body.error), "a second pilot needs credits", r);
r = await post("/game/queue/add", { pilotId: st0.pilots[0].id, key: "small_mining_laser" });
t.ok(!r.ok, "nothing can be trained", r);

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
await sleep(100);
t.done();
