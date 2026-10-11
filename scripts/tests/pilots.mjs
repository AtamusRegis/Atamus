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
await sleep(100);
t.done();
