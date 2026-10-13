// (owner) players' mutes and blocks, an admin's mute / block between two players and its appeal (a message each, more
// when an admin gives one), and support tickets. Two test accounts (the PTR's ?as= socket and x-ptr-as HTTP).
import { suite, BASE, connect, sleep } from "./lib.mjs";
const t = suite("social");
const H = (as) => ({ "content-type": "application/json", origin: BASE, ...(as ? { "x-ptr-as": as } : {}) });
const g = (path, body, as) => fetch(BASE + path, body ? { method: "POST", headers: H(as), body: JSON.stringify(body) } : { headers: H(as) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const PW = "Cinder@Hollow6021=Magnet~Captain%Creek";
await g("/game/admin/unlock", { password: PW });
const me0 = (await g("/game/admin/me")).body; if (!me0.persona) await g("/game/admin/persona", { name: "Warden_S", pic: 1 });
const A = "SocTestAnn", B = "SocTestBen";
const ca = await connect("?as=" + A), cb = await connect("?as=" + B), cp = await connect();
const got = { a: [], b: [], p: [] }; ca.ws.on("message", (x) => got.a.push(JSON.parse(x))); cb.ws.on("message", (x) => got.b.push(JSON.parse(x))); cp.ws.on("message", (x) => got.p.push(JSON.parse(x)));
const heard = (arr, text) => arr.some((m) => m.t === "chat" && m.text === text);
const players = (await g("/game/admin/players")).body, aid = players.find((p) => p.name === A).id, bid = players.find((p) => p.name === B).id;
for (const k of ["mute", "block"]) { await g("/game/admin/relation", { id: aid, otherId: bid, kind: k, on: false, reason: "reset" }); await g("/game/relation", { name: A, kind: k, on: false }); }

// a player's own mute: no Local / Corp lines from them, no DMs; the world is untouched (only chat)
let r = await g("/game/relation", { name: A, kind: "mute", on: true }); t.ok(r.body.ok, "mute a player", r.body);
ca.send({ t: "chat", text: "hello all", channel: "local" }); ca.send({ t: "chat", text: "psst", channel: "dm", to: "PTR" }); await sleep(400);
t.ok(!heard(got.p, "hello all") && heard(got.b, "hello all") && !heard(got.p, "psst") && got.a.some((m) => m.t === "sys" && /isn't taking/.test(m.text)), "a muted player's chat and DMs don't reach you (others still hear them) (owner)");
r = await g("/game/relations"); t.ok(r.body.list.some((x) => x.name === A && x.kind === "mute" && !x.admin), "it's on your Muted list");
await g("/game/relation", { name: A, kind: "mute", on: false }); ca.send({ t: "chat", text: "back again", channel: "local" }); await sleep(300);
t.ok(heard(got.p, "back again"), "unmuted: heard again");
await g("/game/relation", { name: A, kind: "block", on: true }); ca.send({ t: "chat", text: "blocked line", channel: "local" }); await sleep(300);
t.ok(!heard(got.p, "blocked line"), "a block hides their chat too"); await g("/game/relation", { name: A, kind: "block", on: false });
r = await g("/game/relation", { name: "PTR", kind: "mute", on: true }); t.ok(r.status === 400, "not yourself");

// an admin's mute between two players: on both lists, they can't remove it, only appeal
r = await g("/game/admin/relation", { id: aid, other: B, kind: "mute", reason: "feuding" }); t.ok(r.body.ok, "an admin sets a mute between two players", r.body);
ca.send({ t: "chat", text: "ann talks", channel: "local" }); cb.send({ t: "chat", text: "ben talks", channel: "local" }); await sleep(400);
t.ok(!heard(got.b, "ann talks") && !heard(got.a, "ben talks") && heard(got.p, "ann talks"), "neither hears the other");
r = await g("/game/relations", null, A); t.ok(r.body.list.some((x) => x.name === B && x.kind === "mute" && x.admin), "it's on their lists, marked an admin's", r.body.list);
r = await g("/game/relation", { name: B, kind: "mute", on: false }, A); t.ok(r.status === 400 && /appeal/.test(r.body.error), "they can't remove it (owner)", r.body);
r = await g("/game/relappeal", { name: B, kind: "mute", text: "we made up" }, A); const apId = r.body.id; t.ok(apId, "the player appeals it", r.body);
await sleep(300); t.ok(got.b.some((m) => m.t === "relappeal" && m.id === apId), "the other player is told (they see the appeal too)");
r = await g("/game/relappeal/say", { id: apId, text: "please" }, A); t.ok(r.status === 400 && /No messages left/.test(r.body.error), "one message each (owner)", r.body);
r = await g("/game/relappeal/say", { id: apId, text: "fine by me" }, B); t.ok(r.body.ok, "the other player writes their one");
r = await g("/game/relappeal/say", { id: apId, text: "again" }, B); t.ok(r.status === 400, "and no more");
r = await g("/game/admin/relappeal/turn", { id: apId, userId: aid }); r = await g("/game/admin/relappeal/turn", { id: apId, userId: aid });
let v = (await g("/game/admin/relappeal/" + apId)).body; t.ok(v.players.find((p) => p.id === aid).left === 1, "an admin gives one more message, one at a time (owner)", v.players);
r = await g("/game/relappeal/say", { id: apId, text: "thank you" }, A); t.ok(r.body.ok, "then they can write once more");
r = await g("/game/relations", null, B); const seen = r.body.appeals.find((a) => a.id === apId); t.ok(seen && seen.lines.length === 3, "both players see the whole appeal", seen && seen.lines);
r = await g("/game/admin/relappeal/close", { id: apId, accept: true, reason: "ok" }); t.ok(r.body.ok, "an admin accepts it");
ca.send({ t: "chat", text: "ann again", channel: "local" }); await sleep(300); t.ok(heard(got.b, "ann again"), "accepted: the mute is lifted on both lists");

// support tickets
r = await g("/game/ticket", { subject: "", category: "Bug", text: "x" }, A); t.ok(r.status === 400, "a ticket needs a subject");
r = await g("/game/ticket", { subject: "Stuck ship", category: "Nope", text: "x" }, A); t.ok(r.status === 400, "and a category");
r = await g("/game/ticket", { subject: "Stuck ship", category: "Bug", text: "My ship won't undock." }, A); const tk = r.body.id; t.ok(tk, "a player opens a ticket", r.body);
let L = (await g("/game/admin/tickets")).body.find((x) => x.id === tk); t.ok(L && L.waiting && L.category === "Bug" && L.name === A, "admins see it, waiting on them", L);
r = await g("/game/admin/ticket/say", { id: tk, text: "Try docking again." }); await sleep(300);
t.ok(got.a.some((m) => m.t === "ticket" && m.id === tk), "the player is told of the answer");
r = await g("/game/ticket/say", { id: tk, text: "Worked, thanks" }, A); t.ok(r.body.ok, "the player answers");
r = await g("/game/ticket/say", { id: tk, text: "sneaky" }, B); t.ok(r.status === 400, "no one else can write in it");
r = await g("/game/admin/ticket/close", { id: tk }); r = await g("/game/ticket/say", { id: tk, text: "more" }, A); t.ok(r.status === 400, "closed: no more lines");
r = await g("/game/tickets", null, A); const mine = r.body.list.find((x) => x.id === tk); t.ok(mine && mine.status === "closed" && mine.lines.length === 4 && mine.lines[1].admin && mine.lines[1].name === mine.closedBy, "the player's ticket with every line, the admin's under their profile", mine);
await ca.close(); await cb.close(); await cp.close();
t.done();
