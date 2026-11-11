// Smoke test (required check on every pull request): the shared world loads and its rules hold, and the real /pets
// server (in memory, no database) serves couriers end to end: accounts, the conveyor, a delivery and its reward roll,
// kicks, a goose, a dog, upgrades, levels, eggs, chat, parties and staff. Run: cd packages/server && npm run smoke
// Exits 0 when everything passed, 1 (with what failed) otherwise. Takes a few seconds.
process.env.ATAMUS_PTR = "1";   // no live website to watch
import http from "node:http";
import { WebSocket } from "ws";

const fail = (msg) => { console.error("SMOKE FAILED:", msg); process.exit(1); };
const ok = (cond, msg) => { if (!cond) fail(msg); };
setTimeout(() => fail("timed out"), 30000).unref();

// ---- the world and the rules ----
const W = await import("./src/pets-world.js");
const fresh = W.cleanData({});
ok(fresh.mounts.length === 1 && fresh.mounts[0].sp === "pup" && fresh.coins === 0 && fresh.ride === fresh.mounts[0].id, "a new courier has a Pup and no coins");
ok(JSON.stringify(W.cleanData(fresh)) === JSON.stringify(fresh), "cleanData is stable");
ok(W.cleanData({ pets: [{ id: 1, sp: "dragon", lv: 20 }], coins: 5e6, home: {} }).mounts[0].sp === "pup", "the old game's data starts a fresh courier");
ok(W.cleanData({ mounts: [{ id: 1, sp: "dragon", lv: 9 }, { id: 2, sp: "owl", lv: 2 }] }).mounts.map((m) => m.sp + m.lv).join() === "unicorn9,stego2" && !Object.values(W.MOUNTS).some((m) => m.ab === "glide"), "no flying mounts: a Dragon became a Unicorn, an Owl a Stegosaurus");
for (const q of [...W.pads.flatMap((p) => [[p.x, p.z, p.y], [p.tx, p.tz, p.ty]]), ...W.balloons.map((b) => [b.x, b.z, b.y]), ...W.ISLES.map((s) => [s.x, s.z, s.y])]) ok(!W.blocked(q[0], q[1], q[2], 0.9), "nothing stands on an island's pads, landings, balloon or middle");
{ const gs = [0, 0, 0, 0, 1, 1, 1].map((r, n) => ({ gid: n + 1, r, pt: n % 3 })); let id = 100; const mg = W.mergeGifts(gs, () => id++); ok(mg.length === 2 && gs.length === 1 && gs[0].r === 2 && gs[0].pt === 2, "four gifts of a rarity merge into the next, and on up"); }
ok(W.spawnWeights(8, 1)[4] >= 0.3 - 1e-9 && W.spawnWeights(4, 1)[2] >= 0.3 - 1e-9 && W.spawnWeights(4, 1)[0] > 0 && W.spawnWeights(4, 1)[1] > 0, "at least 30% of parcels go to the farthest open area, the rest in between");
ok(W.shakeOff(1, 0) === 0 && W.shakeOff(12, 0) > 0.8 && W.shakeOff(12, 3) === 0 && W.shakeOff(20, 4) < 0.3, "a mount outgrows the easier areas' animals");
ok(W.dogs.length >= 18 && W.dogs.every((d) => W.roamOk(d.hx, d.hz, d.y, d.d)) && W.geese.length >= 15 && W.goats.length === 4, "dogs, geese and goats all over town");
ok([1, 4, 5, 10, 15, 20].map(W.bagSize).join() === "1,1,2,3,4,5" && W.spawnWeights(8, 20).reduce((a, p, n) => a + p * n, 0) > W.spawnWeights(8, 1).reduce((a, p, n) => a + p * n, 0) + 0.4 && W.spawnWeights(8, 20)[0] < W.spawnWeights(8, 1)[0] / 4, "a mount carries 1 to 5 parcels by level; a higher level brings pricier parcels");
ok([0, 1, 2, 3, 4].map((d) => W.housesIn(d).length).join() === "6,6,6,6,6", "five districts, three houses each side");
for (const h of W.houses) ok(Math.abs(W.surfaceAt(h.mx, h.mz, h.my + 0.3) - h.my) < 0.01 && !W.blocked(h.mx, h.mz, h.my), "mailbox in the open: " + h.name);
ok(W.blocked(W.houses[0].x, W.houses[0].z, 0) && !W.blocked(W.SPAWN.x, W.SPAWN.z, 0) && W.counterDist(0, 8) === 3, "houses are solid, the post office is open");
ok(Math.abs(W.surfaceAt(293, 0, 3) - 3) < 0.01 && W.surfaceAt(310, 0, 6.3) === 6 && W.surfaceAt(500, 30, 80) === -Infinity && W.isleAt(W.ISLES[0].x, 0) === 0, "the Cliffside road climbs its steps and the islands float");
{ let y = 0, x = 20; const hedges = W.fences.filter((f) => f.hedge), zAt = (x) => { const h = hedges.find((f) => Math.abs(f.x0 - x) < 3); return h ? -Math.sign(f_mid(h)) * 2.6 : 0; }, f_mid = (h) => h.z0 + h.z1;   // round the hedges, side to side
  for (; x < W.CANNON.x; x += 0.5) { const z = zAt(x), s = W.surfaceAt(x, z, y + 0.3); if (s === -Infinity || W.blocked(x, z, s, 0.4)) break; y = s; } ok(x >= W.CANNON.x && y === W.CANNON.y, "one road runs from the post office through every district up to the Sky Cannon (" + x + ")"); }
{ const xs = [0, 1, 2, 3, 4].map((d) => W.houses.filter((h) => h.d === d).reduce((a, h) => a + h.x, 0) / W.housesIn(d).length); ok(xs.every((x, d) => !d || x > xs[d - 1]), "each district lies farther out along the line than the last"); }
ok([0, 1, 2, 3].every((d) => W.DOG_D[d + 1].speed >= W.DOG_D[d].speed) && W.dogs.filter((q) => q.d === 0).length < W.dogs.filter((q) => q.d === 1).length, "harder the farther out: more dogs, and quicker");
ok(Math.abs(W.rollOdds(0).reduce((a, b) => a + b, 0) - 1) < 1e-9 && Math.abs(W.rollOdds(0)[4] - 0.01) < 1e-9 && W.rollOdds(1)[4] > 0.05 && Math.abs(W.rollOdds(W.stampLuck(10))[4] - 0.03) < 0.004, "roll odds, tier luck and Lucky Stamps");
ok(W.levelCost(1) === 100 && W.levelCost(5) === 655 && W.levelCost(19) > 470000 && Math.abs(W.mountScale(20) - 2.5) < 0.01 && W.upgradeCost("routes", 0) === 250 && W.upgradeCost("routes", 1) === 450, "level and upgrade costs");
ok(W.spawnWeights(0).join() === "1,0,0,0,0" && W.districtsOpen(8) === 5 && Math.abs(W.spawnWeights(10)[4] - 0.3) < 1e-9 && W.boxDur(10) === 5, "Route Permits open districts; Sturdy Boxes add durability");
ok(W.deliveryCoins(0, "", 0, 0, false) === 10 && W.deliveryCoins(4, "golden", 0, 1, false) === 360 && W.deliveryCoins(1, "express", 0, 0, true) === 20 && W.deliveryCoins(1, "express", 10, 0, false) === 100, "delivery coins");
{ const lo = () => 0.3, up = fresh.up;   // 0.3: a Common roll
  ok(W.rewardRoll(0, "", up, 3, lo).tier === 0 && W.rewardRoll(0, "", up, 3, lo).stamp === 4, "a Common roll adds a stamp");
  ok(W.rewardRoll(0, "", up, 24, lo).tier === 2 && W.rewardRoll(0, "", up, 99, lo).tier === 3 && W.rewardRoll(0, "", up, 99, lo).stamp === 0, "the Stamp Meter guarantees Rare at 25 and Epic at 100");
  ok(W.rewardRoll(0, "golden", up, 3, lo).tier === 2, "a Golden parcel rolls Rare or better");
  const h = W.hatchEgg("legendary", () => 0.999); ok(W.MOUNTS[h.sp].r === 4 && h.va === 0 && W.hatchEgg("basic", () => 0.0005).va === 2, "eggs hatch by their odds; one in a thousand is Golden");
  const m = { sp: "pup", lv: 1, xp: 0 }; ok(W.addXp(m, W.xpNeed(1) + W.xpNeed(2) + 3) === 2 && m.lv === 3 && m.xp === 3, "Training XP levels a mount"); }

// ---- the server ----
const { attachPets } = await import("./src/pets.js");
const server = http.createServer((_q, s) => s.end("ok"));
const game = attachPets(server, { allowLocal: true }).game;
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const who = (name) => [...game.online.values()].find((p) => p.name === name);
const put = (c, name, x, z, y = 0, yaw = 0) => { const p = who(name); c.send({ t: "pos", x, y, z, yaw, mv: 0, ct: 1 }); return sleep(60).then(() => { p.sus = 0; p.tpAt = 0; }); };   // a test's jump across town isn't a speed hack
try {
  const a = client("A"), b = client("B"); await Promise.all([a.open, b.open]);
  a.send({ t: "register", user: "smokeA", pass: "pass1234" });
  const wa = await a.wait((m) => m.t === "welcome", "welcome");
  ok(wa.data.mounts.length === 1 && wa.data.coins === 0 && wa.geese.length === W.geese.length, "A starts as a new courier");
  const belt = await a.wait((m) => m.t === "belt", "the conveyor"); ok(belt.ready.tier === 0 && belt.next.tier === 0, "a new courier's conveyor has Bronze parcels");
  b.send({ t: "register", user: "smokeB", pass: "pass1234" });
  const wb = await b.wait((m) => m.t === "welcome", "welcome");
  ok(wb.players.some((p) => p.name === "smokeA" && p.sp === "pup"), "B sees A");
  await a.wait((m) => m.t === "join" && m.p.name === "smokeB", "join");
  await sleep(300); who("smokeA").tpAt = 0; who("smokeB").tpAt = 0;
  // positions reach the other player
  await put(a, "smokeA", 5, 14);
  await b.wait((m) => m.t === "snap" && m.ps.some((r) => r[0] === wa.id && r[1] === 5), "A's position");
  // grabbing: only at the conveyor; the Next parcel moves up
  a.send({ t: "grab" }); await sleep(150); ok(!who("smokeA").bag.length, "no grabbing away from the conveyor");
  await put(a, "smokeA", 0, 7.5); who("smokeA").ready = { tier: 0, mod: "" }; a.send({ t: "grab" });   // a plain parcel, so the numbers below are known
  const got = await a.wait((m) => m.t === "bag" && m.ev.k === "grab", "the parcel"); ok(got.bag.length === 1 && got.cap === 1 && got.bag[0].dur === 3 && W.houses[got.bag[0].house].d === got.bag[0].tier, "a parcel has 3 durability and an address in its district");
  who("smokeA").ready = { tier: 0, mod: "" }; a.send({ t: "grab" }); await sleep(150); ok(who("smokeA").bag.length === 1, "a level 1 mount carries one parcel at a time");
  await b.wait((m) => m.t === "carry" && m.id === wa.id && m.c, "B sees A's parcel");
  await a.wait((m) => m.t === "belt" && m.ready && m.next, "the conveyor refills");
  // a kick: stun, one hit; the same courier can't crack it again inside 30 s; nothing in the post office's safe zone
  await put(b, "smokeB", 0, 5.2); b.send({ t: "kick" }); await sleep(200); ok(who("smokeA").bag[0].hits === 0, "no kicks in the safe zone");
  who("smokeB").kickAt = 0; await put(a, "smokeA", 40, 40); await put(b, "smokeB", 40, 38);
  b.send({ t: "kick" });
  const st = await a.wait((m) => m.t === "stun", "the kick's stun"); ok(st.why === "kick" && st.s > 0.5 && st.s <= 1, "a kick stuns for a second");
  const cracked = await a.wait((m) => m.t === "bag" && m.ev.k === "crack" && m.ev.why === "kick", "the cracked parcel"); ok(cracked.bag[0].dur === 2 && cracked.bag[0].hits === 1, "a kick takes one durability");
  { const pa = who("smokeA"), pb = who("smokeB"); pa.stunUntil = 0; pa.graceUntil = 0; pb.kickAt = 0; b.send({ t: "kick" }); await a.wait((m) => m.t === "stun", "a second kick"); ok(pa.bag[0].hits === 1, "the same courier cracks a parcel once in 30 s"); pa.stunUntil = 0; pa.graceUntil = 0; }
  // a goose steals it; a kick busts the goose; the parcel is picked up whole with a bonus
  { const pa = who("smokeA"), g = pa.room.geese[0]; await put(a, "smokeA", g.x + 3, g.z);
    await a.wait((m) => m.t === "bag" && m.ev.k === "stolen", "the goose's theft"); ok(!pa.bag.length && pa.stolen.length === 1, "a goose takes the parcel");
    who("smokeB").kickAt = 0; const at = () => put(b, "smokeB", g.x, g.z - 1.5); await at(); b.send({ t: "kick" });
    const dr = (await a.wait((m) => m.t === "bag" && m.ev.k === "dropped", "the parcel dropped")).dropped[0]; await put(a, "smokeA", dr.x, dr.z, dr.y);
    const back = await a.wait((m) => m.t === "bag" && m.ev.k === "pickup", "the parcel back"); ok(back.bag[0].hits === 1 && back.ev.bonus === W.GOOSE.bonus && who("smokeB").acct.data.stats.geese === 1, "a busted goose drops the parcel unharmed"); }
  // delivery: the right mailbox, checked by the server; coins, a roll, the Stamp Meter
  { const pa = who("smokeA"), h = W.houses[pa.bag[0].house], wrong = W.houses.find((q) => q.d === 0 && q.id !== h.id);
    for (const g of pa.room.geese) g.cool = Date.now() + 60000;
    for (const d of pa.room.dogs) d.cool = Date.now() + 60000;
    await put(a, "smokeA", wrong.mx, wrong.mz, wrong.my); await sleep(200); ok(pa.bag.length === 1, "the wrong mailbox takes nothing");
    await put(a, "smokeA", h.mx, h.mz, h.my);
    const del = await a.wait((m) => m.t === "delivered", "the delivery");
    ok(!del.gift.m && del.coins === 8 && del.gift.r >= 0 && del.data.coins === W.GOOSE.bonus + 8 && del.data.gifts.length === 1 && del.data.stats.del === 1 && del.data.stamp === (del.gift.r < 2 ? 1 : 0), "a delivery pays (less 20% for the hit) and leaves a gift of a rolled rarity");
    a.send({ t: "open", gids: [del.gift.gid, 99999] }); const op = await a.wait((m) => m.t === "opened", "the opened gift");
    ok(op.list.length === 1 && op.list[0].r === del.gift.r && op.data.gifts.length === 0 && op.data.coins === W.GOOSE.bonus + 8 + op.list[0].coins, "opening a gift adds what's inside (once)");
    await b.wait((m) => m.t === "fx" && m.k === "del" && m.id === wa.id, "B sees the delivery"); }
  // a dog: bark, chase, bite
  { const pa = who("smokeA"), D = W.dogs[0], q = pa.room.dogs[0]; q.cool = 0; pa.stunUntil = 0; pa.graceUntil = 0; await put(a, "smokeA", 0, 7.5); pa.ready = { tier: 0, mod: "" }; a.send({ t: "grab" }); await a.wait((m) => m.t === "bag" && m.ev.k === "grab", "another parcel");
    await put(a, "smokeA", q.x + 0.6, q.z + 0.6, q.y); const bite = await a.wait((m) => m.t === "stun" && m.why === "dog", "the dog's bite"); ok(bite.s > 1 && pa.bag[0].hits === 1, "a dog's bite stuns and cracks the parcel");
    for (const d of pa.room.dogs) d.cool = Date.now() + 60000; await sleep(1200); const h = W.houses[pa.bag[0].house]; pa.stunUntil = 0; await put(a, "smokeA", h.mx, h.mz, h.my);
    const d2 = await a.wait((m) => m.t === "delivered", "the second delivery"); ok(d2.gift.m && W.MOUNTS[d2.data.mounts.find((m) => m.id === d2.gift.m).sp].r === 1 && d2.data.mounts.length === 2, "the second delivery brings a new Uncommon mount (in its gift)");
    pa.acct.data.mounts.find((m) => m.id === pa.acct.data.ride).lv = 10; await put(a, "smokeA", 0, 7.5);
    for (let k = 0; k < 3; k++) { pa.ready = { tier: 0, mod: "" }; a.send({ t: "grab" }); await a.wait((m) => m.t === "bag" && m.ev.k === "grab" && m.bag.length === k + 1, "grab " + (k + 1)); await sleep(850); }
    pa.ready = { tier: 0, mod: "" }; a.send({ t: "grab" }); await sleep(300); ok(pa.bag.length === 3, "a level 10 mount carries three parcels, each to its own address");
    for (const q of [...pa.bag]) { const h = W.houses[q.house]; pa.stunUntil = 0; await put(a, "smokeA", h.mx, h.mz, h.my); await sleep(250); }
    ok(!pa.bag.length && pa.acct.data.stats.del === 5, "each parcel is delivered at its own mailbox"); }
  // chat and parties
  a.send({ t: "chat", text: "hello" }); await b.wait((m) => m.t === "chat" && m.text === "hello", "chat");
  a.send({ t: "invite", id: wb.id }); const iv = await b.wait((m) => m.t === "invited", "the invitation"); b.send({ t: "answer", from: iv.from, yes: true });
  ok((await a.wait((m) => m.t === "party" && m.members.length === 2, "the party")).members.some((q) => q.name === "smokeB"), "a party of two");
  b.send({ t: "party_leave" }); await a.wait((m) => m.t === "party" && !m.members.length, "the party ending");
  // staff: the owner's quick commands; a player's are ignored
  const n = client("N"); await n.open; n.send({ t: "register", user: "Nyssary", pass: "pass1234" });
  const wn = await n.wait((m) => m.t === "welcome", "owner welcome"); ok(wn.role === "admin", "the owner is admin");
  b.send({ t: "admin", op: "quick", cmd: "coins", n: 5000, name: "smokeB" });   // a player: nothing happens
  n.send({ t: "admin", op: "quick", cmd: "coins", n: 5000, name: "smokeB" });
  ok((await b.wait((m) => m.t === "data", "B's coins")).data.coins === 5000, "an admin gives coins once; a player's command is ignored");
  n.send({ t: "admin", op: "give", what: "egg:basic", n: 2, name: "smokeB" }); n.send({ t: "admin", op: "give", what: "coupons", n: 1, name: "smokeB" });
  await b.wait((m) => m.t === "data" && m.data.eggs.basic === 2, "B's eggs"); await b.wait((m) => m.t === "data" && m.data.coupons === 1, "B's coupon");
  // upgrades, levels, coupons, eggs: the server takes the coins and saves
  b.send({ t: "upgrade", k: "routes" }); const u1 = await b.wait((m) => m.t === "upgraded", "the upgrade"); ok(u1.lv === 1 && u1.data.coins === 4750, "an upgrade costs its price");
  await a.wait((m) => m.t === "rank" && m.id === wb.id && m.rank === 1, "the rank badge");
  const mid = wb.data.mounts[0].id;
  b.send({ t: "level", id: mid }); ok((await b.wait((m) => m.t === "leveled", "the level")).data.coins === 4650, "a level costs 100 coins at level 1");
  await a.wait((m) => m.t === "mount" && m.id === wb.id && m.lv === 2, "others see the mount grow");
  b.send({ t: "coupon", id: mid }); const lc = await b.wait((m) => m.t === "leveled", "the coupon's level"); ok(lc.lv === 3 && lc.data.coupons === 0, "a Level Coupon is one level");
  b.send({ t: "coupon", id: mid }); b.send({ t: "hatch", kind: "rare" }); b.send({ t: "hatch", kind: "basic" });
  const ha = await b.wait((m) => m.t === "hatched", "the hatch"); ok(ha.kind === "basic" && ha.data.mounts.length === 2 && ha.data.eggs.basic === 1 && W.MOUNTS[ha.m.sp].r <= 2, "an egg hatches a mount; no egg, no hatch");
  b.send({ t: "equip", id: ha.m.id }); await a.wait((m) => m.t === "mount" && m.id === wb.id && m.sp === ha.m.sp, "others see the new mount");
  b.send({ t: "set", friendly: true }); await a.wait((m) => m.t === "look" && m.id === wb.id && m.friendly, "Friendly");
  { const pa = who("smokeA"), pb = who("smokeB"); pa.stunUntil = 0; pa.graceUntil = 0; pa.kickAt = 0; await put(b, "smokeB", 60, 0); await put(a, "smokeA", 60, -2); a.send({ t: "kick" }); await sleep(200); ok(pb.stunUntil === 0, "Friendly couriers can't be kicked"); }
  n.ws.close();
  // logging in again replaces the old connection and keeps everything
  const b2 = client("B2"); await b2.open; b2.send({ t: "login", user: "smokeB", pass: "pass1234" });
  const wb2 = await b2.wait((m) => m.t === "welcome" && m.name === "smokeB", "login");
  ok(wb2.data.coins === 4650 && wb2.data.mounts.length === 2 && wb2.data.up.routes === 1 && wb2.data.set.friendly, "a courier's data is kept");
  await b.wait((m) => m.t === "kicked", "old connection kicked");
  for (const c of [a, b2]) c.ws.close();
} catch (e) { fail(e.message); }
console.log("smoke ok");
server.close(); process.exit(0);
