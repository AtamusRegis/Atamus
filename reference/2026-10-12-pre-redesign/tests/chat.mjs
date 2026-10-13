// Chat (docs/FEATURES.md › Chat): Local / Corp, direct messages, another player's sheet, reports. Part 1 drives the
// World; part 2 the PTR's HTTP API (a second account is added straight to the database for reports).
import { World } from "../../packages/server/src/game/world.js";
import pg from "../../packages/server/node_modules/pg/lib/index.js";
import { suite, BASE } from "./lib.mjs";
const t = suite("chat");
const w = new World(), got = {};
const mk = (id, name) => { got[id] = []; const p = w.addPlayer(id, name, (s) => got[id].push(JSON.parse(s)), null, [{ id: 1, name }]); p.portrait = { gender: "male" }; return p; };
mk("a", "Alice"); mk("b", "Bob"); mk("c", "Cat");
w.cmdChat("a", "  hello   all ", "local");
t.ok(["a", "b", "c"].every((k) => got[k].some((m) => m.ch === "local" && m.text === "hello all" && m.from === "Alice" && m.portrait)), "Local reaches everyone, as the speaker's character");
const shA = [...w.ships.values()].find((x) => x.owner === "a"), shB = [...w.ships.values()].find((x) => x.owner === "b");
w.cmdChat("a", "over here", "local", null, shA.id); w.cmdChat("a", "not mine", "local", null, shB.id); w.cmdChat("a", "corp", "corp", null, shA.id);
t.ok(got.b.some((m) => m.text === "over here" && m.ships.join() === shA.id) && got.b.some((m) => m.text === "not mine" && !m.ships.includes(shB.id)) && got.b.some((m) => m.text === "corp" && !m.ships), "Local names the speaker's own ship for its bubble (owner); never someone else's, and never in Corp");
{ w.setPilots("a", [{ id: 1, name: "Alice" }, { id: 2, name: "Ann" }, { id: 3, name: "Amy" }]); const [x1, x2, x3] = [1, 2, 3].map((n) => w.ships.get("a:ship:" + n));
  Object.assign(x1, { x: 0, y: 0 }); Object.assign(x2, { x: 5, y: 0 }); Object.assign(x3, { x: 3000, y: 0 }); w.cmdChat("a", "two places", "local", null, x2.id);
  const m = got.b.find((q) => q.text === "two places");
  t.ok(m && m.ships.length === 2 && m.ships[0] === x2.id && m.ships.includes(x3.id), "with several of your pilots in one place only one speaks (the selected one first); one in each place (owner)", m); }
w.cmdChat("a", "psst", "dm", "bob");
t.ok(got.b.some((m) => m.ch === "dm" && m.from === "Alice" && m.text === "psst") && got.a.some((m) => m.ch === "dm" && m.to === "bob") && !got.c.some((m) => m.ch === "dm"), "a DM reaches only them (and echoes to you), names in any case");
w.cmdChat("a", "hey", "dm", "Nobody");
t.ok(got.a.some((m) => m.t === "sys" && m.dm === "Nobody" && /not online/.test(m.text)), "a DM to someone offline says so, in that DM's tab");
for (const bad of [null, 5, "", "x".repeat(41), {}]) w.cmdChat("a", "x", "dm", bad);
t.ok(got.b.filter((m) => m.ch === "dm").length === 1, "junk DM targets are ignored");

const q = (path, body) => fetch(BASE + path, body ? { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(body) } : {}).then(async (r) => ({ status: r.status, body: await r.json() }));
let r = await q("/game/player/ptr");
t.ok(r.status === 200 && r.body.username === "PTR" && !("credits" in r.body) && r.body.corp, "Info: anyone's sheet by name, without their credits", r.body);
r = await q("/game/player/nobody-here"); t.ok(r.status === 404, "an unknown name is a 404");
const db = new pg.Pool({ connectionString: "postgres://postgres@127.0.0.1:5433/atamus" });
await db.query(`INSERT INTO users (username, password) VALUES ('ReportMe', '!') ON CONFLICT DO NOTHING`);
const cats = (await q("/game/report-categories")).body;
t.ok(Array.isArray(cats) && cats.includes("Other"), "report categories come from the server", cats);
for (const [b, why] of [[{ target: "PTR", category: "Spam", text: "x" }, "yourself"], [{ target: "ReportMe", category: "Nope", text: "x" }, "a real category"], [{ target: "ReportMe", category: "Spam", text: "   " }, "some text"], [{ target: "ghost", category: "Spam", text: "x" }, "a real player"]]) {
  r = await q("/game/report", b); t.ok(r.status === 400, "a report needs " + why, r.body);
}
r = await q("/game/report", { target: "reportme", category: "Harassment", text: "  said mean   things ", context: "you're bad" });
const row = (await db.query(`SELECT target_name, category, text, context, status FROM reports ORDER BY id DESC LIMIT 1`)).rows[0];
t.ok(r.status === 200 && row && row.target_name === "ReportMe" && row.category === "Harassment" && row.text === "said mean things" && row.context === "you're bad" && row.status === "open", "a report is stored for the admin tools", row);
await db.query(`DELETE FROM reports`); await db.query(`DELETE FROM users WHERE username = 'ReportMe'`); await db.end();
t.done();
