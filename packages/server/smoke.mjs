// Smoke test (required check on every pull request): the shared world loads and its rules hold, and the real /pets
// server (in memory, no database) serves couriers end to end: accounts, the conveyor, a delivery and its reward roll,
// a goose, a dog, upgrades, levels, mounts, chat, parties and staff. Run: cd packages/server && npm run smoke
// Exits 0 when everything passed, 1 (with what failed) otherwise. Takes a few seconds.
process.env.ATAMUS_PTR = "1";   // no live website to watch
import http from "node:http";
import { WebSocket } from "ws";

const fail = (msg) => { console.error("SMOKE FAILED:", msg); process.exit(1); };
const ok = (cond, msg) => { if (!cond) fail(msg); };
setTimeout(() => fail("timed out"), 30000).unref();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the world and the rules ----
const W = await import("./src/pets-world.js");
const { TEST_TOWN } = await import("./test-town.mjs");
// (owner, 2026-11-13) the zone builder: no town until one's placed; then mailboxes are addresses, gates close zones
W.setBuild([]); ok(W.build.length === 1 && W.build[0].w === 1 && W.surfaceAt(0.5, 0.5, 1) === 0 && W.surfaceAt(5, 5, 1) === -Infinity && !W.PO.on && W.counterDist(0, 8) === Infinity && !W.inSafeZone(0, 0, 0) && !W.houses.length && !W.dogs.length && !W.geese.length && !W.goats.length && W.rollParcel(3) === null, "with nothing built: one 1 m block in the sky; no post office, animals or parcels");
W.setBuild([...TEST_TOWN, { id: 99, k: "nope" }, { id: 98, k: "block", x: 1e9, z: 0, y: 0, w: 999, h: 0, d: 2, m: "lava" }]);
ok(W.build.length === TEST_TOWN.length + 1 && W.build[W.build.length - 1].w === W.BLOCK_MAX && W.build[W.build.length - 1].m === "grass" && W.build[W.build.length - 1].x === W.GROUND.r, "the build is cleaned: unknown pieces dropped, sizes and places clamped");
W.setBuild(TEST_TOWN);
ok(W.houses.length === 20 && W.housesIn(3).length === 2 && W.addr(1).name === "1 Main Street" && W.addr(2).name === "2 Main Street" && W.addr(5).name === "1 Goose Marsh" && W.buildings.length === 1 && W.gates.length === 1, "mailboxes are the addresses, named by zone; houses and gates placed");
ok(W.surfaceAt(25, -23, 3) === 2 && W.blocked(26, -22, 0) && W.blocked(40, 20, 0) && W.blocked(40, 10, 0) && !W.blocked(45, 10, 0), "a block can be stood on and stops you from the side; houses and mailboxes are solid");
ok(W.gateBlocked(55, 2, 0, 1) && !W.gateBlocked(55, 2, 0, 2) && !W.gateBlocked(55, 9, 0, 1) && !W.gateBlocked(60, 2, 0, 1) && W.gateBlocked(55, 2, 40, 1) && W.gateBlocked(55, 2, -15, 1), "a gate is closed until its zone is open, only across its width, and (owner, 2026-11-14) at any height");
ok(W.PO.on && W.SPAWN.z === 17 && W.PODIUM.spots.length === 3 && W.PODIUM.spots[0].y === 1.6 && W.onStart(2, 24, 0) && !W.onStart(2, 30, 0) && W.boosts.length === 1 && W.trees.length === 1 && W.blocked(-40, -30, 0) && W.inSafeZone(0, 10, 0) && Math.abs(W.counterDist(0, 8) - 2.3) < 1e-9, "the post office, respawn point, podiums, start line, boost and tree are placed too");
ok(W.districtAt(0, 10, 0) === 0 && W.districtAt(102, 9, 0) === 2 && W.districtAt(310, -8, 0) === 9, "where you are: the nearest mailbox's zone");
const fresh = W.cleanData({});
ok(fresh.mounts.length === 1 && fresh.mounts[0].sp === "dog" && fresh.mounts[0].r === 0 && fresh.coins === 0 && fresh.ride === fresh.mounts[0].id, "a new courier has a Common Dog and no coins");
ok(JSON.stringify(W.cleanData(fresh)) === JSON.stringify(fresh), "cleanData is stable");
ok(W.cleanData({ pets: [{ id: 1, sp: "dragon", lv: 20 }], coins: 5e6, home: {} }).mounts[0].sp === "dog", "the old game's data starts a fresh courier");
ok(W.cleanData({ mounts: [{ id: 1, sp: "dragon", lv: 9 }, { id: 2, sp: "owl", lv: 2 }] }).mounts.map((m) => m.sp + m.r).join() === "dog4,dog2" && !("lv" in W.cleanData({ mounts: [{ id: 1, sp: "dragon", lv: 9 }] }).mounts[0]) && !Object.values(W.MOUNTS).some((m) => m.ab === "glide"), "mounts from before became Dogs of their rarity (a Dragon a Legendary Dog, an Owl a Rare Dog)");
{ const gs = [0, 0, 0, 0, 1, 1, 1].map((r, n) => ({ gid: n + 1, r, pt: n % 3 })); let id = 100; const mg = W.mergeGifts(gs, () => id++); ok(mg.length === 2 && gs.length === 1 && gs[0].r === 2 && gs[0].pt === 2, "four gifts of a rarity merge into the next, and on up"); }
ok(W.spawnWeights(5, 1)[4] >= 0.3 - 1e-9 && W.spawnWeights(3, 1)[2] >= 0.3 - 1e-9 && W.spawnWeights(3, 1)[0] > 0 && W.spawnWeights(3, 1)[1] > 0, "at least 30% of parcels go to the farthest open area, the rest in between");
ok(W.shakeOff({ sp: "dog", r: 0 }, 0) === 0 && W.shakeOff({ sp: "dog", r: 4 }, 0) > 0.8 && W.shakeOff({ sp: "dog", r: 4 }, 4) === 0 && W.shakeOff({ sp: "wolf", r: 0 }, 4) === 0 && W.shakeOff({ sp: "wolf", r: 4 }, 4) > 0.5, "a rarer mount outgrows the easier areas' animals");
ok([0, 1, 2, 3, 4].map((r) => W.bagSize({ r })).join() === "1,1,1,1,1" && W.bagSize({ r: 0, cap: 4 }) === 5 && W.petUpCost({ sp: "dog", r: 0, cap: 1 }, "cap") === 4 * W.petUpCost({ sp: "dog", r: 0 }, "cap") && W.petUpCost({ sp: "wolf", r: 4 }, "spd") > W.petUpCost({ sp: "dog", r: 0 }, "spd") && W.cleanData({ v: 2, mounts: [{ id: 1, sp: "cat", r: 3 }] }).mounts[0].cap === 3 && W.spawnWeights(5, 4).reduce((a, p, n) => a + p * n, 0) > W.spawnWeights(5, 0).reduce((a, p, n) => a + p * n, 0) + 0.4 && W.spawnWeights(5, 4)[0] < W.spawnWeights(5, 0)[0] / 2, "every mount carries 1 parcel, Aura raises it to 5 (dearer each level, and for rarer, farther animals; mounts from before keep what they carried); a rarer mount brings pricier parcels");
ok(Math.abs(W.rollOdds(0).reduce((a, b) => a + b, 0) - 1) < 1e-9 && Math.abs(W.rollOdds(0)[4] - 0.01) < 1e-9 && W.rollOdds(1)[4] > 0.05 && Math.abs(W.rollOdds(W.stampLuck(10))[4] - 0.03) < 0.004, "roll odds, tier luck and Lucky Stamps");
ok(!W.levelCost && !W.addXp && W.mountScale({ r: 4 }) === 2 && !W.ABILITY && !W.abilityTier && W.KICK.range > 0 && !W.bonkAura && !W.BIG_JUMP && W.upgradeCost("payout", 0) === 300 && W.upgradeCost("payout", 1) === 540 && !W.UPGRADES.routes && !W.UPGRADES.press, "no mount levels (rarity sets size); no abilities, bonk Aura or Big Jump; upgrade costs (no Route Permits)");
ok(W.spawnWeights(1).join() === "1,0,0,0,0,0,0,0,0,0" && W.openFor({ mounts: W.ZONE_KIND.map((sp) => ({ sp, r: 1 })) }) === 10 && [[{ sp: "dog", r: 0 }], [{ sp: "dog", r: 1 }], [{ sp: "dog", r: 4 }, { sp: "cat", r: 1 }], [{ sp: "cat", r: 4 }, { sp: "gator", r: 4 }], [{ sp: "dog", r: 1 }, { sp: "cat", r: 2 }, { sp: "gator", r: 1 }, { sp: "bear", r: 3 }]].map((mounts) => W.openFor({ mounts })).join() === "1,2,3,1,5" && Math.abs(W.spawnWeights(5)[4] - 0.3) < 1e-9 && W.boxDur(10) === 5, "the next area opens with an Uncommon or better animal from the one before; Sturdy Boxes add durability");
{ const c = W.cleanData({ coins: 10, up: { routes: 2, payout: 1 }, stamp: 40 }); ok(c.coins === 10 + 250 + 450 && c.up.payout === 1 && !("routes" in c.up) && !("stamp" in c) && W.cleanData(c).coins === c.coins, "Route Permits' coins come back once; no Stamp Meter"); }
{ const lo = { v: 2, mounts: [{ id: 1, sp: "dog", r: 1 }, { id: 2, sp: "cat", r: 1 }, { id: 3, sp: "gator", r: 1 }] }, hi = { v: 2, mounts: [{ id: 1, sp: "dog", r: 1, tr: "cloud" }, { id: 2, sp: "cat", r: 1, tr: "nope" }, { id: 3, sp: "gator", r: 1 }, { id: 4, sp: "bear", r: 1 }] };
  ok(!W.trailsFor(lo).length && W.trailsFor(hi).join() === "cloud" && W.cleanData(hi).mounts[0].tr === "cloud" && !("tr" in W.cleanData(hi).mounts[1]), "a trail unlocks every five areas; any mount can wear one"); }
ok(W.ATTACK.slots === 2 && W.ATTACK.calm === 3 && W.DROP_S === 15, "two slots and a 3 s calm; 15 s on the ground");
ok(Object.keys(W.MODS).join() === "express" && Array.from({ length: 400 }, (_, k) => W.rollParcel(5, 1, () => (k * 0.618) % 1).mod).every((m) => m === "" || m === "express"), "only timed (Express) parcels as modifiers");
const sp = (s, r, z, spd = 0) => W.mountStats({ sp: s, r, spd }, z).speed, near = (a, b) => Math.abs(a - b) < 1e-9;
ok(near(sp("dog", 1, 0), sp("dog", 0, 0) * 1.2) && near(sp("cat", 0, 0), sp("dog", 0, 0) * 1.05) && near(sp("wolf", 0, 0), sp("dog", 0, 0) * Math.pow(1.05, 4)) && near(sp("wolf", 0, 0), sp("wolf", 0, 9)) && near(sp("dog", 0, 0, 2), sp("dog", 0, 0)) && W.mountStats({ sp: "wolf", r: 4 }).jump === W.mountStats({ sp: "dog", r: 0 }).jump && W.mountStats({ sp: "wolf", r: 4 }).grip === 0 && W.EMPTY_FAST >= 2 && W.GOAT.speed >= 18, "rarity +20% speed; each zone's animal 5% faster than the one before, the same everywhere; no Aura speed levels; every mount jumps and grips the same");
{ const [l0, h0] = W.giftRange(0, 0, 1), [l3, h3] = W.giftRange(0, 3, 4), [l0b, h0b] = W.giftRange(0, 0, 4), [lt, ht] = W.giftRange(0, 0, 40);
  ok(near(h3, h0 * Math.pow(1.05, 3)) && near(l3, l0 * Math.pow(1.05, 3)) && near(h0b, h0) && near(l0b, l0 * Math.pow(1.05, 3)) && near(lt, ht), "a gift's top is 5% higher per zone out; its bottom 5% higher per zone opened past it, up to the top"); }
ok(W.deliveryCoins(0, "", 0, 0, false) === 10 && W.deliveryCoins(4, "", 0, 1, false) === 120 && W.deliveryCoins(1, "express", 0, 0, true) === 20 && W.deliveryCoins(1, "express", 10, 0, false) === 100, "delivery coins");
{ const lo = () => 0.3, up = fresh.up;   // 0.3: a Common roll
  ok(W.rewardRoll(0, up, lo).tier === 0 && W.rewardRoll(0, up, () => 0.999).tier === 4, "a roll is its own (no pity)");
  { const seq = (...v) => { let n = 0; return () => v[Math.min(n++, v.length - 1)]; }, c = W.giftContents(3, 2, up, seq(0.5, 0.04, 0.5)), c2 = W.giftContents(3, 2, up, seq(0.5, 0.15, 0.25, 0.15, 0.5)), c3 = W.giftContents(0, 0, up, seq(0.5, 0.85));
    ok(c.pet && c.pet.sp === "gator" && c.pet.r === 3 && c2.pet.r === 1 && !c3.pet && W.PET_CHANCE.join() === "0.4,0.2,0.1,0.05,0.01", "a parcel tries its own rarity's chance first, then each one below (Epic 5%, Rare 10%, Uncommon 20%, Common 40%)"); }
  ok(Object.keys(W.MOUNTS).join() === "dog,cat,gator,bear,wolf,fox,raptor,trike,trex,unicorn" && W.CHASERS.join() === Object.keys(W.MOUNTS).join() && W.skinRoll(() => 0.00005) === 1 && W.skinRoll(() => 0.0005) === 0 && W.VARIANTS.length === 2 && W.coatName("wolf", 4) === "Spirit" && W.coatName("gator", 3) === "Black" && W.coat("wolf", 4).length === 2 && W.cleanData({ mounts: [{ id: 1, sp: "dog", r: 0, va: 3 }] }).mounts[0].va === 1, "the mounts are the areas' animals, each with its own coat per rarity; one in ten thousand is Shiny, the only other skin (Golden and Rainbow became Shiny)");
  { const old = W.cleanData({ mounts: [{ id: 1, sp: "trex", lv: 7, va: 1 }, { id: 2, sp: "cat", lv: 3 }, { id: 3, sp: "unicorn", lv: 2 }], eggs: { basic: 1, rare: 1, legendary: 1 } });
    ok(old.mounts.map((m) => m.sp + m.r).join() === "dog3,dog1,dog4,dog0,dog2,dog4" && old.mounts[0].va === 1 && !("eggs" in old) && W.cleanData(old).mounts.length === 6, "every mount from before became a Dog of its rarity (level and skin kept); old eggs became Dogs, once"); }
  { const later = W.cleanData({ v: 2, mounts: [{ id: 1, sp: "gator", r: 3, lv: 2 }] }); ok(later.mounts[0].sp === "gator" && W.cleanData({ mounts: [{ id: 1, sp: "gator", r: 3, lv: 2 }] }).mounts[0].sp === "dog", "the change to Dogs happens once (saved data after it keeps its kinds)"); }
  { const c = W.cleanData({ coins: 10, up: { press: 2, payout: 1 }, coupons: 7 }); ok(c.coins === 10 + 400 + 720 && !("press" in c.up) && !("coupons" in c) && W.cleanData(c).coins === c.coins, "the Coupon Press's coins come back once; no Level Coupons"); } }

// ---- the server ----
const { attachPets } = await import("./src/pets.js");
const server = http.createServer((_q, s) => s.end("ok"));
const { memStore } = await import("./src/petstore.js"), store = memStore(); await store.saveBuild(TEST_TOWN); W.setBuild([]);
const game = attachPets(server, { allowLocal: true, store }).game; await sleep(50);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `ws://127.0.0.1:${server.address().port}/pets`;
function client(name) {
  const ws = new WebSocket(url), inbox = [], waiters = [];
  ws.on("message", (d) => { const m = JSON.parse(d); inbox.push(m); for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); inbox.splice(inbox.indexOf(m), 1); w.res(m); } });
  const c = {
    ws, inbox, name,
    send: (o) => ws.send(JSON.stringify(o)),
    wait: (test, what) => { const hit = inbox.find(test); if (hit) { inbox.splice(inbox.indexOf(hit), 1); return Promise.resolve(hit); } return new Promise((res, rej) => { const w = { test, res }; waiters.push(w); setTimeout(() => rej(new Error(`${name}: no ${what}`)), 5000).unref(); }); },
  };
  c.open = new Promise((r) => ws.on("open", r));
  return c;
}
const who = (name) => [...game.online.values()].find((p) => p.name === name);
const put = (c, name, x, z, y = 0, yaw = 0) => { const p = who(name); p.tpAt = 0; c.send({ t: "pos", x, y, z, yaw, mv: 0, ct: 1 }); return sleep(60).then(() => { p.sus = 0; p.tpAt = 0; }); };   // a test's jump across town isn't a speed hack
try {
  const a = client("A"), b = client("B"); await Promise.all([a.open, b.open]);
  a.send({ t: "register", user: "smokeA", pass: "pass1234" });
  const wa = await a.wait((m) => m.t === "welcome", "welcome");
  for (const r of game.rooms) r.podPay = Infinity;   // the podiums pay only in their own test below
  ok(wa.data.mounts.length === 1 && wa.data.coins === 0 && !wa.geese.length && !wa.dogs.length && wa.build.length === TEST_TOWN.length, "A starts as a new courier, and gets the built town");
  const belt = await a.wait((m) => m.t === "belt", "the conveyor"); ok(belt.ready.tier === 0 && belt.next.tier === 0, "a new courier's conveyor has Bronze parcels");
  b.send({ t: "register", user: "smokeB", pass: "pass1234" });
  const wb = await b.wait((m) => m.t === "welcome", "welcome");
  ok(wb.players.some((p) => p.name === "smokeA" && p.sp === "dog"), "B sees A");
  await a.wait((m) => m.t === "join" && m.p.name === "smokeB", "join");
  await sleep(300); who("smokeA").tpAt = 0; who("smokeB").tpAt = 0;
  // positions reach the other player
  await put(a, "smokeA", 5, 14);
  await b.wait((m) => m.t === "snap" && m.ps.some((r) => r[0] === wa.id && r[1] === 5), "A's position");
  // grabbing: only at the conveyor; the Next parcel moves up
  a.send({ t: "grab" }); await sleep(150); ok(!who("smokeA").bag.length, "no grabbing away from the conveyor");
  await put(a, "smokeA", 0, 7.5); who("smokeA").ready = { tier: 0, mod: "" }; a.send({ t: "grab" });   // a plain parcel, so the numbers below are known
  const got = await a.wait((m) => m.t === "bag" && m.ev.k === "grab", "the parcel"); ok(got.bag.length === 1 && got.cap === 1 && got.bag[0].dur === 3 && W.addr(got.bag[0].house).d === got.bag[0].tier, "a parcel has 3 durability and an address in its district");
  who("smokeA").ready = { tier: 0, mod: "" }; a.send({ t: "grab" }); await sleep(150); ok(who("smokeA").bag.length === 1, "a level 1 mount carries one parcel at a time");
  await b.wait((m) => m.t === "carry" && m.id === wa.id && m.c, "B sees A's parcel");
  await a.wait((m) => m.t === "belt" && m.ready && m.next, "the conveyor refills");
  // (owner, 2026-11-13) no bonking: a "kick" from the page does nothing
  // (owner, 2026-11-14) kicking another courier: thrown off their mount and tumbling, the kicker gets the shot; no parcel damage; then a moment safe
  await put(a, "smokeA", 40, 40); await put(b, "smokeB", 40, 38); b.send({ t: "kick" }); const kk = await a.wait((m) => m.t === "kickfly", "kicked"); const kh = await b.wait((m) => m.t === "kickhit", "the kick landed");
  ok(kk.vz > 10 && kk.vy > 0 && kh.id === who("smokeA").id && who("smokeA").stunUntil > Date.now() && who("smokeA").bag[0].hits === 0, "a kick throws the courier in front off their mount, away from the kicker");
  b.send({ t: "kick" }); await sleep(150); who("smokeB").kickAt = 0; b.send({ t: "kick" }); await sleep(150); ok(!a.inbox.some((m) => m.t === "kickfly" && m !== kk), "one kick at a time, and a kicked courier is safe for a moment");
  who("smokeA").stunUntil = 0; who("smokeA").kickSafe = 0; who("smokeB").kickAt = 0; await put(a, "smokeA", 0, 7.5); await put(b, "smokeB", 0, 5.5); b.send({ t: "kick" }); await sleep(150); ok(!a.inbox.some((m) => m.t === "kickfly" && m !== kk), "no kicking at the post office"); who("smokeB").kickAt = 0;
  b.send({ t: "ability" }); await sleep(100);
  // (owner, 2026-11-14) falling off the town: back to the respawn point, still carrying the parcel
  { const pa = who("smokeA"), pid = pa.bag[0].pid; await put(a, "smokeA", 40, 40, W.EDGE_Y - 5); const tp = await a.wait((m) => m.t === "tp" && m.why === "home", "back from the fall");
    ok(pa.bag.length === 1 && pa.bag[0].pid === pid && Math.abs(tp.x - W.SPAWN.x) < 1 && Math.abs(tp.z - W.SPAWN.z) < 1, "a fall sends you back to the respawn point with your parcel"); await sleep(700); }
  // delivery: the right mailbox, checked by the server; coins, a roll, the Stamp Meter
  { const pa = who("smokeA"), h = W.addr(pa.bag[0].house), wrong = W.houses.find((q) => q.d === 0 && q.id !== h.id);
    for (const g of pa.room.geese) g.cool = Date.now() + 60000;
    for (const d of pa.room.dogs) d.cool = Date.now() + 60000;
    await put(a, "smokeA", wrong.mx, wrong.mz, wrong.my); await sleep(200); ok(pa.bag.length === 1, "the wrong mailbox takes nothing");
    await put(a, "smokeA", h.mx, h.mz, h.my);
    const del = await a.wait((m) => m.t === "delivered", "the delivery");
    ok(!del.gift.m && del.coins === 10 && del.gift.r >= 0 && del.data.coins === 10 && del.data.gifts.length === 1 && del.data.stats.del === 1, "a delivery pays and leaves a gift of a rolled rarity");
    a.send({ t: "open", gids: [del.gift.gid, 99999] }); const op = await a.wait((m) => m.t === "opened", "the opened gift");
    ok(op.list.length === 1 && op.list[0].r === del.gift.r && op.data.gifts.length === 0 && op.data.coins === 10 + op.list[0].coins, "opening a gift adds what's inside (once)");
    await b.wait((m) => m.t === "fx" && m.k === "del" && m.id === wa.id, "B sees the delivery"); }
  // a second delivery
  { const pa = who("smokeA"); pa.stunUntil = 0; pa.graceUntil = 0; await put(a, "smokeA", 0, 7.5); pa.ready = { tier: 0, mod: "" }; a.send({ t: "grab" }); await a.wait((m) => m.t === "bag" && m.ev.k === "grab", "another parcel");
    await sleep(300); const h = W.addr(pa.bag[0].house); pa.stunUntil = 0; await put(a, "smokeA", h.mx, h.mz, h.my);
    const d2 = await a.wait((m) => m.t === "delivered", "the second delivery"); { const nm = d2.data.mounts.find((m) => m.id === d2.gift.m); ok(d2.gift.m && nm.sp === "dog" && nm.r === d2.gift.r, "the second delivery brings a new mount: the parcel's area's animal, at the gift's rarity"); }
    { const rm = pa.acct.data.mounts.find((m) => m.id === pa.acct.data.ride); rm.r = 2; const c0 = pa.acct.data.coins; pa.acct.data.coins = 1e6; a.send({ t: "petup", id: rm.id, k: "cap" }); const pu = await a.wait((m) => m.t === "petup", "an Aura carry level"); ok(pu.data.mounts.find((m) => m.id === rm.id).cap === 1 && pu.data.coins < 1e6, "Aura buys a carry level"); pa.acct.data.coins = c0; rm.cap = 2; } await put(a, "smokeA", 0, 7.5);
    for (let k = 0; k < 3; k++) { pa.ready = { tier: 0, mod: "" }; a.send({ t: "grab" }); await a.wait((m) => m.t === "bag" && m.ev.k === "grab" && m.bag.length === k + 1, "grab " + (k + 1)); await sleep(850); }
    pa.ready = { tier: 0, mod: "" }; a.send({ t: "grab" }); await sleep(300); ok(pa.bag.length === 3, "a mount with two Aura carry levels carries three parcels, each to its own address");
    for (let i = a.inbox.length - 1; i >= 0; i--) if (a.inbox[i].t === "tp") a.inbox.splice(i, 1);   // (earlier runs' trips home)
    for (const q of [...pa.bag]) { const h = W.addr(q.house); pa.stunUntil = 0; await put(a, "smokeA", h.mx, h.mz, h.my); await sleep(250); }
    ok(!pa.bag.length && pa.acct.data.stats.del === 5, "each parcel is delivered at its own mailbox"); { const home = await a.wait((m) => m.t === "tp" && m.why === "home", "back to the post office after the run"); ok(Math.hypot(home.x - W.SPAWN.x, home.z - W.SPAWN.z) < 8, "the run over, back at the post office"); } }
  // (owner, 2026-11-12) off the edge of the town: the run starts over at the post office
  { for (let i = a.inbox.length - 1; i >= 0; i--) if (a.inbox[i].t === "tp") a.inbox.splice(i, 1); await put(a, "smokeA", 60, 40, 0); who("smokeA").tpAt = 0; a.send({ t: "pos", x: 60, y: -25, z: 40, yaw: 0, mv: 4, ct: 1 }); const f = await a.wait((m) => m.t === "tp" && m.why === "home", "riding off the edge");
    ok(Math.hypot(f.x - W.SPAWN.x, f.z - W.SPAWN.z) < 8 && W.PIPE.off && !W.zips.length, "riding off the edge starts the run over at the post office; no pipe or ziplines"); }
  // chat and parties
  a.send({ t: "chat", text: "hello" }); await b.wait((m) => m.t === "chat" && m.text === "hello", "chat");
  a.send({ t: "invite", id: wb.id }); const iv = await b.wait((m) => m.t === "invited", "the invitation"); b.send({ t: "answer", from: iv.from, yes: true });
  ok((await a.wait((m) => m.t === "party" && m.members.length === 2, "the party")).members.some((q) => q.name === "smokeB"), "a party of two");
  b.send({ t: "party_leave" }); await a.wait((m) => m.t === "party" && !m.members.length, "the party ending");
  // staff: the owner's quick commands; a player's are ignored
  const n = client("N"); await n.open; n.send({ t: "register", user: "Nyssary", pass: "pass1234" });
  const wn = await n.wait((m) => m.t === "welcome", "owner welcome"); ok(wn.role === "admin", "the owner is admin");
  // (owner, 2026-11-13) the zone builder: an admin places and erases, everyone gets it, it's saved; a player can't
  { const n0 = W.build.length; b.send({ t: "build", op: "add", piece: { k: "mailbox", x: 5, z: 40, y: 0, zone: 0 } }); await sleep(150); ok(W.build.length === n0, "a player can't build");
    n.send({ t: "build", op: "add", piece: { k: "mailbox", x: 5, z: 40, y: 0, zone: 0 } }); const bb = await b.wait((m) => m.t === "build" && m.build.length === n0 + 1, "the new mailbox"); const id = bb.build[bb.build.length - 1].id;
    ok(W.addr(id) && W.addr(id).name === "3 Main Street" && (await store.loadBuild()).pieces.length === n0 + 1, "an admin places a mailbox: everyone gets it, it's saved, it's an address");
    n.send({ t: "build", op: "del", id }); await b.wait((m) => m.t === "build" && m.build.length === n0, "the mailbox erased"); ok(!W.addr(id) && (await store.loadBuild()).pieces.length === n0, "and erases it"); }
  { n.send({ t: "build", op: "add", piece: { k: "office", x: 0, z: 100, y: 0, r: 1 }, tag: 7 }); const ack = await n.wait((m) => m.t === "buildok" && m.tag === 7, "the builder's id back");
    await sleep(100); ok(W.build.filter((q) => q.k === "office").length === 1 && W.PO.z === 100 && W.PO.yaw === Math.PI / 2 && Math.abs(W.PO.end.x - 3.9) < 1e-9 && W.addr && ack.id > 0, "one post office at a time (a new one replaces it), turnable; the builder gets the new piece's id");
    n.send({ t: "build", op: "del", id: ack.id }); n.send({ t: "build", op: "add", piece: { k: "office", x: 0, z: 0, y: 0, r: 0 } }); await sleep(150); }
  // (owner, 2026-11-13) neighborhoods: bounds decide where a piece belongs, can be moved after; walls close like gates; each neighborhood's name, animal and chances
  { n.send({ t: "build", op: "add", piece: { k: "area", x: -200, z: -200, y: 0, w: 20, d: 20, zone: 4 }, tag: 8 }); const ack = await n.wait((m) => m.t === "buildok" && m.tag === 8, "new bounds");
    n.send({ t: "build", op: "add", piece: { k: "mailbox", x: -190, z: -190, y: 0 } }); await b.wait((m) => m.t === "build" && m.build.some((q) => q.k === "mailbox" && q.x === -190), "a mailbox inside");
    const mb = W.build.find((q) => q.k === "mailbox" && q.x === -190); ok(W.districtAt(-190, -190, 0) === 4 && W.addr(mb.id).d === 4 && / Floating Islands$/.test(W.addr(mb.id).name), "a mailbox inside bounds belongs to their neighborhood");
    n.send({ t: "build", op: "set", piece: { id: ack.id, k: "block", x: -300, z: -200, y: 0, w: 20, d: 20, zone: 4 } }); await b.wait((m) => m.t === "build" && m.build.some((q) => q.id === ack.id && q.x === -300), "the bounds moved");
    ok(W.build.find((q) => q.id === ack.id).k === "area" && W.addr(mb.id).d === 0, "bounds move after the fact (keeping their kind), and what's left outside goes back to Main Street");
    n.send({ t: "build", op: "zone", n: 4, zone: { name: "Hilltop", sp: "gator", chance: [1, 0, 0, 0, 0], shiny: 0.5 } }); const zb = await b.wait((m) => m.t === "build" && m.zones && m.zones[4].name === "Hilltop", "the neighborhood renamed");
    ok(W.zoneName(4) === "Hilltop" && W.zoneSp(4) === "gator" && W.zoneCfg(4).chance[0] === 1 && W.zoneCfg(4).shiny === 0.5 && (await store.loadBuild()).zones[4].name === "Hilltop" && zb.zones.length === W.TIERS.length, "a neighborhood's name, animal, chances and shiny are set and saved");
    n.send({ t: "build", op: "zone", n: 4, zone: { ...W.zoneCfg(4), shots: [...Array.from({ length: 6 }, (_, k) => ({ name: "Wind " + k, x: k * 10, y: 5, z: -3 })), "junk"] } }); await b.wait((m) => m.t === "build" && m.zones && m.zones[4].shots.length, "the neighborhood's shots");
    ok(W.zoneCfg(4).shots.length === 5 && W.zoneCfg(4).shots[1].name === "Wind 1" && W.zoneCfg(4).shots[1].x === 10 && W.zoneCfg(4).name === "Hilltop" && (await store.loadBuild()).zones[4].shots.length === 5 && W.zoneCfg(5).shots.length === 0, "a neighborhood keeps up to 5 cinematic shots, each a name and a point (saved)");
    const g = W.giftContents(0, 4, null, () => 0.3).pet; ok(g && g.sp === "gator" && g.r === 0, "its gifts are its animal");
    b.send({ t: "build", op: "zone", n: 4, zone: { name: "Nope" } }); await sleep(120); ok(W.zoneName(4) === "Hilltop", "a player can't change a neighborhood");
    n.send({ t: "build", op: "zone", n: 4, zone: {} }); n.send({ t: "build", op: "del", id: ack.id }); n.send({ t: "build", op: "del", id: mb.id });
    n.send({ t: "build", op: "add", piece: { k: "wall", x: -250, z: 0, y: 0, r: 0, w: 12, zone: 3 } }); await b.wait((m) => m.t === "build" && m.build.some((q) => q.k === "wall"), "a wall");
    ok(W.gateBlocked(-245, 0, 0, 1, 0.5) && !W.gateBlocked(-235, 0, 0, 1, 0.5) && !W.gateBlocked(-245, 0, 0, 4, 0.5), "a bound wall stops couriers along its length until its neighborhood is open");
    n.send({ t: "build", op: "del", id: W.build.find((q) => q.k === "wall").id }); await sleep(150); }
  // (owner, 2026-11-13) the respawn point turns all the way round (degrees); older ones keep their quarter turns
  ok(W.cleanPiece({ k: "spawn", x: 0, z: 0, y: 0, a: 200 }).a === 200 && W.cleanPiece({ k: "spawn", x: 0, z: 0, y: 0, r: 3 }).a === 270 && W.cleanPiece({ k: "spawn", x: 0, z: 0, y: 0, a: 999 }).a === 359, "the respawn point's angle");
  // (owner, 2026-11-13) a block's top reaches 5% past its sides for standing (its sides still the real block)
  { n.send({ t: "build", op: "add", piece: { k: "block", x: -400, z: -400, y: 10, w: 20, h: 2, d: 20, m: "stone" }, tag: 31 }); const id = (await n.wait((m) => m.t === "buildok" && m.tag === 31, "a block")).id; await sleep(100);
    ok(W.surfaceAt(-400.4, -390, 12.2) === 12 && W.surfaceAt(-379.6, -390, 12.2) === 12 && W.surfaceAt(-400.6, -390, 12.2) === -Infinity && !W.wallAt(-400.3, -390, 10.5) && W.wallAt(-399.7, -390, 10.5) && W.COYOTE > 0, "standing reaches 5% past a block's edges; bumping into it doesn't");
    n.send({ t: "build", op: "del", id }); await sleep(120); }
  // (owner, 2026-11-14) Drop: letting go of every parcel carried, to take new ones
  { const pa = who("smokeA"); await put(a, "smokeA", 0, 7.5); pa.ready = { tier: 0, mod: "" }; a.send({ t: "grab" }); await a.wait((m) => m.t === "bag" && m.ev.k === "grab", "a parcel to drop");
    a.send({ t: "dropall" }); const dr = await a.wait((m) => m.t === "bag" && m.ev.k === "lost" && m.ev.why === "drop", "dropped"); ok(!pa.bag.length && !dr.bag.length, "Drop lets go of the parcels you carry"); await sleep(300); }
  // (owner, 2026-11-13) hazards: mud and turbine blocks, gusts (on for a moment every so often, the way they're turned), platforms between A and B
  { const add = async (piece, tag) => { n.send({ t: "build", op: "add", piece, tag }); return (await n.wait((m) => m.t === "buildok" && m.tag === tag, piece.k)).id; };
    const ids = [await add({ k: "gust", x: -500, z: -500, y: 0, w: 6, h: 4, d: 6, a: 90, iv: 5, pw: 22 }, 41), await add({ k: "block", x: -520, z: -500, y: 0, w: 4, h: 1, d: 4, m: "turbine" }, 42), await add({ k: "mover", x: -540, z: -500, y: 2, w: 4, h: 1, d: 4, bx: 10, by: 0, bz: 0, sp: 5 }, 43), await add({ k: "block", x: -560, z: -500, y: 0, w: 4, h: 1, d: 4, m: "mud" }, 44)]; await sleep(100);
    const g = W.gusts[0]; ok(W.gusts.length === 1 && Math.abs(g.dx - 1) < 1e-9 && Math.abs(g.dz) < 1e-9 && g.pw === 22 && W.gustAt(-497, -497, 1, 10.5) && !W.gustAt(-497, -497, 1, 12.5) && !W.gustAt(-490, -497, 1, 10.5), "a gust blows the way it's turned, for a moment every few seconds, inside its box");
    ok(W.updraftAt(-518, -498, 1.5) && W.updraftAt(-518, -498, 12) && !W.updraftAt(-518, -498, 14) && W.groundKind(-558, -498, 1.1) === "mud", "a turbine's updraft over its top; mud underfoot");
    const mv = W.build.find((q) => q.k === "mover"); ok(W.moverPos(mv, 0).x === -540 && Math.abs(W.moverPos(mv, 2 + W.MOVER.rest).x - -530) < 1e-9 && W.moverUnder(-538, -498, 3.2, 0).top === 3 && !W.moverUnder(-538, -498, 3.2, 2 + W.MOVER.rest), "a platform goes from A to B and back, and can be stood on where it is");
    n.send({ t: "build", op: "set", piece: { ...W.build.find((q) => q.k === "gust"), iv: 2.5, pw: 40 } }); await b.wait((m) => m.t === "build" && m.build.some((q) => q.k === "gust" && q.pw === 40), "the gust edited"); ok(W.gusts[0].iv === 2.5 && W.gusts[0].pw === 40, "a gust's interval and power change after it's placed");
    for (const id of ids) n.send({ t: "build", op: "del", id }); await sleep(150); }
  // (owner, 2026-11-13) pipe shortcuts: two pipes the builder links; riding into one's mouth comes out of the other's, facing out
  { n.send({ t: "build", op: "add", piece: { k: "pipe", x: -120, z: 0, y: 0, r: 0 }, tag: 21 }); const p1 = (await n.wait((m) => m.t === "buildok" && m.tag === 21, "a pipe")).id;
    n.send({ t: "build", op: "add", piece: { k: "pipe", x: -160, z: 30, y: 0, r: 1 }, tag: 22 }); const p2 = (await n.wait((m) => m.t === "buildok" && m.tag === 22, "another pipe")).id; await sleep(100);
    ok(!W.pipeAt(-120, 2.6, 0.5), "an unlinked pipe goes nowhere");
    b.send({ t: "build", op: "link", a: p1, b: p2 }); await sleep(120); ok(!W.tubePartner(W.pipes.find((p) => p.id === p1)), "a player can't link pipes");
    n.send({ t: "build", op: "link", a: p1, b: p2 }); await b.wait((m) => m.t === "build" && m.build.some((q) => q.id === p1 && q.to === p2), "the pipes linked");
    ok(W.pipeAt(-120, 2.6, 0.5) && W.pipeAt(-120, 2.6, 0.5).id === p1 && !W.pipeAt(-120, -2.6, 0.5) && W.blocked(-120, 0, 0.5), "linked: its mouth takes you in (not its back), and its body is solid");
    for (let i = b.inbox.length - 1; i >= 0; i--) if (b.inbox[i].t === "tp") b.inbox.splice(i, 1); await put(b, "smokeB", -120, 2.8); who("smokeB").tpAt = 0; b.send({ t: "tube", id: p1 }); const tp = await b.wait((m) => m.t === "tp" && m.why === "tube", "out of the other pipe");
    ok(Math.abs(tp.x - (-160 + W.TUBE.l / 2 + 2)) < 1e-6 && Math.abs(tp.z - 30) < 1e-6 && Math.abs(tp.yaw - Math.PI / 2) < 1e-9, "a rider comes out of the linked pipe's mouth, facing out of it");
    for (let i = b.inbox.length - 1; i >= 0; i--) if (b.inbox[i].t === "build") b.inbox.splice(i, 1);
    n.send({ t: "build", op: "unlink", a: p2 }); await b.wait((m) => m.t === "build" && m.build.some((q) => q.id === p1 && !q.to), "the pipes parted"); ok(!W.pipeAt(-120, 2.6, 0.5), "unlinked again");
    n.send({ t: "build", op: "del", id: p1 }); n.send({ t: "build", op: "del", id: p2 }); await sleep(150); }
  b.send({ t: "admin", op: "quick", cmd: "coins", n: 5000, name: "smokeB" });   // a player: nothing happens
  n.send({ t: "admin", op: "quick", cmd: "coins", n: 5000, name: "smokeB" });
  ok((await b.wait((m) => m.t === "data", "B's coins")).data.coins === 5000, "an admin gives coins once; a player's command is ignored");
  // (owner, 2026-11-12) the podiums: the room's best mounts stand there and pay Aura
  { const pa = who("smokeA"), pb = who("smokeB"), r = pa.room; pb.acct.data.mounts.push({ id: pb.acct.data.nextId++, sp: "wolf", r: 4, va: 1, cap: 0, spd: 0 }); await sleep(1300);
    const best = r.pods[0] && r.pods.find((q) => q && q.m.sp === "wolf" && q.m.r === 4); ok(r.pods.every(Boolean) && best && best.p === pb, "a rarer mount takes a podium");
    const c0 = pb.acct.data.coins; r.podPay = 0; const au = await b.wait((m) => m.t === "aura", "a podium's Aura"); r.podPay = Infinity; ok(au.n >= W.podiumPay(best.m) && pb.acct.data.coins > c0, "a podium pays its courier Aura"); pb.acct.data.coins = c0; }
  n.send({ t: "admin", op: "give", what: "mount:gator", n: 1, r: 2, name: "smokeB" });
  const gg = await b.wait((m) => m.t === "data" && m.data.mounts.some((k) => k.sp === "gator" && k.r === 2), "B's Rare Gator");
  // upgrades and mounts: the server takes the coins and saves
  b.send({ t: "upgrade", k: "payout" }); const u1 = await b.wait((m) => m.t === "upgraded", "the upgrade"); ok(u1.lv === 1 && u1.data.coins === 4700, "an upgrade costs its price");
  await a.wait((m) => m.t === "rank" && m.id === wb.id && m.rank === 1, "the rank badge");
  const mid = wb.data.mounts[0].id;
  b.send({ t: "level", id: mid }); b.send({ t: "coupon", id: mid }); await sleep(150); ok(who("smokeB").acct.data.coins === 4700, "no levels to buy");
  const ha = { m: gg.data.mounts.find((k) => k.sp === "gator") };
  b.send({ t: "equip", id: ha.m.id }); await a.wait((m) => m.t === "mount" && m.id === wb.id && m.sp === "gator" && m.r === 2, "others see the new mount (and its rarity)");
  // two of the same mount and skin merge into the better one, with the next skin
  n.send({ t: "admin", op: "give", what: "mount:cat", n: 4, r: 1, name: "smokeB" }); const gv = await b.wait((m) => m.t === "data" && m.data.mounts.filter((k) => k.sp === "cat" && k.r === 1 && k.va === 0).length >= 4, "four cats");
  const foxes = gv.data.mounts.filter((k) => k.sp === "cat" && k.r === 1 && k.va === 0), nFox = gv.data.mounts.filter((k) => k.sp === "cat").length; b.send({ t: "fuse", id: foxes[0].id }); const fu = await b.wait((m) => m.t === "fused", "the merge");
  ok(fu.m.va === 0 && fu.m.r === 2 && fu.m.sp === "cat" && fu.data.mounts.filter((k) => k.sp === "cat").length === nFox - 3 && fu.data.mounts.length === gv.data.mounts.length - 3, "four Uncommon Cats merge into one Rare Cat");
  ok(W.fuseSet([1, 2, 3].map((id) => ({ id, sp: "dog", r: 0, va: 0 })), 1).length === 2 && !W.fuseSet([1, 2, 3].map((id) => ({ id, sp: "dog", r: 1, va: 1 })), 1) && W.fuseSet([1, 2, 3, 4].map((id) => ({ id, sp: "dog", r: 1, va: 1 })), 1).length === 4 && W.fuseSet([...Array(16)].map((_, id) => ({ id: id + 1, sp: "dog", r: 3, va: 0 })), 1).length === 16 && !W.fuseSet([1, 2].map((id) => ({ id, sp: "dog", r: 4, va: 0 })), 1) && !W.fuseSet([{ id: 1, sp: "dog", r: 0, va: 1 }, { id: 2, sp: "dog", r: 0, va: 0 }], 1) && !W.fuseSet([{ id: 1, sp: "dog", r: 0, va: 0 }, { id: 2, sp: "dog", r: 1, va: 0 }], 1), "a merge needs 2 / 4 / 8 / 16 the same (coat and skin) by rarity; Legendary is the last");
  { const ms = [...Array(9)].map((_, i) => ({ id: i + 1, sp: "dog", r: 0, va: 0 })).concat([{ id: 20, sp: "cat", r: 0, va: 1 }]), made = W.fuseAll(ms, 3);
    ok(ms.length === 3 && made.length >= 1 && ms.some((k) => k.id === 3 && k.r === 2) && ms.filter((k) => k.sp === "dog" && k.r === 1).length === 0 && ms.some((k) => k.sp === "dog" && k.r === 0) && W.sellPrice({ r: 4, va: 1 }) === W.SELL[4] * 5, "Merge all makes every merge, Commons up, keeping the ridden one; a mount sells by rarity"); }
  { const pb = who("smokeB"), d = pb.acct.data; for (let k = 0; k < 2; k++) d.mounts.push({ id: d.nextId++, sp: "cat", r: 0, va: 0, cap: 0, spd: 0 }); const n0 = d.mounts.length, c0 = d.coins, keep = d.mounts.find((k) => k.id === mid), cap0 = keep.cap; keep.cap = 4;   // the later tests' mount stays (kept as the best of its group)
    b.send({ t: "fuseall" }); const fa = await b.wait((m) => m.t === "fused" && m.n >= 1, "Merge all"); ok(fa.data.mounts.length < n0, "Merge all merges on the server");
    const sale = fa.data.mounts.find((k) => k.id !== fa.data.ride && k.id !== mid); const price = W.sellPrice(sale); b.send({ t: "sell", id: sale.id }); const so = await b.wait((m) => m.t === "sold", "a sale");
    b.send({ t: "sell", id: so.data.ride }); await sleep(150); ok(so.n === price && so.data.coins === c0 + price && !so.data.mounts.some((k) => k.id === sale.id) && d.mounts.some((k) => k.id === d.ride), "a mount sells for Aura (never the ridden one)"); d.coins = c0; keep.cap = cap0; }
  b.send({ t: "trail", id: mid, k: "cloud" }); await sleep(150); ok(!who("smokeB").acct.data.mounts.find((k) => k.id === mid).tr, "a trail that isn't unlocked can't be worn");
  { const dB = who("smokeB").acct.data; dB.mounts.find((k) => k.id === mid).r = 1; for (const sp of ["cat", "gator", "bear"]) dB.mounts.push({ id: dB.nextId++, sp, r: 1, va: 0 }); } /* an Uncommon of each area's animal: all five areas open */ b.send({ t: "trail", id: mid, k: "cloud" }); const tw = await b.wait((m) => m.t === "data" && m.data.mounts.some((k) => k.id === mid && k.tr === "cloud"), "the trail on");
  ok(!!tw, "an unlocked trail goes on a mount");
  b.send({ t: "set", friendly: true }); await a.wait((m) => m.t === "look" && m.id === wb.id && m.friendly, "Friendly");
  n.ws.close();
  // logging in again replaces the old connection and keeps everything
  const b2 = client("B2"); await b2.open; b2.send({ t: "login", user: "smokeB", pass: "pass1234" });
  const wb2 = await b2.wait((m) => m.t === "welcome" && m.name === "smokeB", "login");
  ok(wb2.data.coins === 4700 && wb2.data.mounts.length === fu.data.mounts.length + 3 && wb2.data.mounts.some((k) => k.sp === "cat" && k.r === 2) && wb2.data.up.payout === 1 && wb2.data.set.friendly, "a courier's data is kept");
  await b.wait((m) => m.t === "kicked", "old connection kicked");
  for (const c of [a, b2]) c.ws.close();
} catch (e) { fail(e.message); }
console.log("smoke ok");
server.close(); process.exit(0);
