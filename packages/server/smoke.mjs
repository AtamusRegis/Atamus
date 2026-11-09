// Smoke test (owner, 2026-11-08: required check on every pull request): the shared world loads and its rules hold, and
// the real /pets server (in memory, no database) serves two players end to end. Run: cd packages/server && npm run smoke
// Exits 0 when everything passed, 1 (with what failed) otherwise. Takes a few seconds.
process.env.ATAMUS_PTR = "1";   // no live website to watch
import http from "node:http";
import { WebSocket } from "ws";

const fail = (msg) => { console.error("SMOKE FAILED:", msg); process.exit(1); };
const ok = (cond, msg) => { if (!cond) fail(msg); };
setTimeout(() => fail("timed out"), 20000).unref();

// ---- the world ----
const W = await import("./src/pets-world.js");
const SPECIES = new Set(["pup", "fox", "dragon"]);
const fresh = W.cleanData({}, SPECIES);
ok(fresh.pets.length === 1 && fresh.home.pieces.length > 0, "a new player has a pet and a starter house");
ok(W.petCap(fresh) === W.HOME.baseCap, "pet cap");
ok(W.PLOTS.length === 16 && W.PLOTS.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), "16 plots");
ok(W.houses.length > 50 && W.ROADS.length >= 8, "town generated");
const again = W.cleanData(fresh, SPECIES); ok(JSON.stringify(again) === JSON.stringify(fresh), "cleanData is stable");
const vs = W.makeVehicles(), player = { id: 1, x: vs[0].x + 3, y: W.terrain(vs[0].x + 3, vs[0].z), z: vs[0].z, bag: 2, stars: 0, lastChased: 0, lastStar: 0, immuneUntil: 0 };
let caught = false; for (let i = 0; i < 200 && !caught; i++) caught = W.stepVehicles(vs, [player], 0.1, 100 + i * 0.1).some((e) => e.k === "caught");
ok(caught, "animal control catches a parcel carrier");

// ---- the server ----
const { attachPets } = await import("./src/pets.js");
const server = http.createServer((_q, s) => s.end("ok"));
attachPets(server, { allowLocal: true });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `ws://127.0.0.1:${server.address().port}/pets`;
function client(name) {
  const ws = new WebSocket(url), inbox = [], waiters = [];
  ws.on("message", (d) => { const m = JSON.parse(d); inbox.push(m); for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); } });
  const c = {
    ws, inbox, name,
    send: (o) => ws.send(JSON.stringify(o)),
    wait: (test, what) => { const hit = inbox.find(test); if (hit) { inbox.splice(inbox.indexOf(hit), 1); return Promise.resolve(hit); } return new Promise((res, rej) => { const w = { test, res }; waiters.push(w); setTimeout(() => rej(new Error(`${name}: no ${what}`)), 5000).unref(); }); },
  };
  c.open = new Promise((r) => ws.on("open", r));
  return c;
}
try {
  const a = client("A"), b = client("B"); await Promise.all([a.open, b.open]);
  a.send({ t: "register", user: "smokeA", pass: "pass1234", sp: "pup", lv: 1, x: 0, y: 0, z: 14 });
  const wa = await a.wait((m) => m.t === "welcome", "welcome");
  ok(wa.data.home.pieces.length > 0 && wa.plot >= 0, "A gets a house and a plot");
  b.send({ t: "register", user: "smokeB", pass: "pass1234", sp: "fox", lv: 1, x: 2, y: 0, z: 14 });
  const wb = await b.wait((m) => m.t === "welcome", "welcome");
  ok(wb.players.some((p) => p.name === "smokeA") && wb.plots.some((p) => p.name === "smokeA"), "B sees A and A's house");
  ok(wb.plot >= 0 && wb.plot !== wa.plot, "B gets a different plot");
  await a.wait((m) => m.t === "join" && m.p.name === "smokeB", "join");
  // positions reach the other player
  a.send({ t: "pos", x: 5, y: 0, z: 14, yaw: 0, mv: 1, ct: 1000, bag: 0, ft: 0 });
  await b.wait((m) => m.t === "snap" && m.ps.some((r) => r[0] === wa.id && r[1] === 5), "A's position");
  // a save is taken, and a house change reaches the other player
  const d = wa.data; d.home.pieces.push({ k: "chair", x: 10, z: 10, l: 0, r: 0, c: 0 });
  a.send({ t: "save", rev: wa.rev, data: d });
  const sv = await a.wait((m) => m.t === "saved", "saved"); ok(sv.rev === wa.rev + 1, "save rev");
  await b.wait((m) => m.t === "plot" && m.id === wa.id && m.pieces.some((t) => t.k === "chair"), "A's new chair");
  a.send({ t: "save", rev: wa.rev, data: d }); await a.wait((m) => m.t === "data", "stale save answered with the latest copy");
  // chat
  a.send({ t: "chat", text: "hello" }); await b.wait((m) => m.t === "chat" && m.text === "hello", "chat");
  // (owner, 2026-11-09) admins' quick commands: by name on another player and on yourself; a player's are ignored
  const n = client("N"); await n.open; n.send({ t: "register", user: "Nyssary", pass: "pass1234", sp: "pup", lv: 1, x: 0, y: 0, z: 14 });
  const wn = await n.wait((m) => m.t === "welcome", "owner welcome");
  ok(wn.role === "admin" && wn.environment.weather === "auto" && wn.environment.time === "auto", "the owner is admin and sees the automatic environment");
  n.send({ t: "admin", op: "environment", weather: "storm", time: "night" });
  const env = await b.wait((m) => m.t === "environment", "admin environment change");
  ok(env.environment.weather === "storm" && env.environment.time === "night", "an admin changes weather and time for everyone");
  await n.wait((m) => m.t === "environment", "owner's environment change");
  b.send({ t: "admin", op: "environment", weather: "clear", time: "day" });   // a player: ignored
  n.send({ t: "admin", op: "quick", cmd: "everything", name: "smokeB" });
  const db1 = (await b.wait((m) => m.t === "data", "B's data after Everything")).data;
  ok(db1.coins >= 1e6 && db1.pets.length >= 23 && db1.pets.every((p) => p.lv === 20) && db1.items.ticket >= 100 && db1.treats.dragon >= 100, "Everything gives coins, every pet at 20, items and Treats");
  b.send({ t: "admin", op: "quick", cmd: "coins", n: 5000, name: "smokeB" });   // a player: nothing happens
  n.send({ t: "admin", op: "quick", cmd: "coins", n: 2500, name: "Nyssary" });
  ok((await n.wait((m) => m.t === "data", "owner's own coins")).data.coins === 2500, "quick coins on yourself");
  n.send({ t: "admin", op: "quick", cmd: "unwanted", name: "smokeB" }); await b.wait((m) => m.t === "stars" && m.stars === 0, "wanted cleared");
  ok(b.inbox.every((m) => m.t !== "data" || m.data.coins === db1.coins), "a player's quick command is ignored");
  n.ws.close();
  // logging in again replaces the old connection
  const a2 = client("A2"); await a2.open; a2.send({ t: "resume", token: wa.token, sp: "pup" });
  const wa2 = await a2.wait((m) => m.t === "welcome" && m.name === "smokeA", "resume");
  ok(wa2.environment.weather === "storm" && wa2.environment.time === "night", "a player's environment command is ignored and new logins see the admin setting");
  await a.wait((m) => m.t === "kicked", "old connection kicked");
  for (const c of [a2, b]) c.ws.close();
} catch (e) { fail(e.message); }
console.log("smoke ok");
server.close(); process.exit(0);
