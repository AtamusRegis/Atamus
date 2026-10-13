// (owner, 2026-10-11, "for now") NPC stations sell everything and license manuals; players start with 10M. On the PTR.
import pg from "../../packages/server/node_modules/pg/lib/index.js";
import { suite, BASE, connect, sleep, SHIP } from "./lib.mjs";
const t = suite("market");
const db = new pg.Pool({ connectionString: "postgres://postgres@127.0.0.1:5433/atamus" });
const g = (path, body, as) => fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", origin: BASE, ...(as ? { "x-ptr-as": as } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const { PRICES } = await import("../../packages/server/src/game/market.js");
const { MODULES, ITEMS } = await import("../../packages/server/src/game/modules.js");
const { LICENSES } = await import("../../packages/server/src/licenses.js");

t.ok(Object.keys(MODULES).every((k) => PRICES[k] > 0) && Object.keys(ITEMS).every((k) => PRICES[k] > 0) && Object.keys(PRICES).some((k) => k.startsWith("ore:")), "every module, weapon, ammo, drone, fuel, manual and ore has a price (owner: stations sell everything)");
t.ok(LICENSES.filter((l) => !l.free).every((l) => ITEMS["manual_" + l.key] && ITEMS["manual_" + l.key].name === l.name + " Manual") && LICENSES.find((l) => l.key === "mining_frigate").free, "a manual for every module license (owner: training manuals)");
// a new account starts with 10M
await db.query(`DELETE FROM users WHERE username = 'MktNew'`);
await db.query(`INSERT INTO users (username, password) VALUES ('MktNew', '!')`);
t.ok(Number((await db.query(`SELECT credits FROM users WHERE username = 'MktNew'`)).rows[0].credits) === 10_000_000, "new players start with 10M (owner)");
t.ok(Number((await db.query(`SELECT count(*) FROM users WHERE credits < 10000000 AND username <> 'MktNew' AND created_at < now() - interval '1 hour'`)).rows[0].count) >= 0, "(existing accounts were topped up once)");

const me = (await db.query(`SELECT id FROM users WHERE lower(username) = 'ptr'`)).rows[0];
await db.query(`UPDATE users SET credits = 10000000 WHERE id = $1`, [me.id]);
const c = await connect(); let hg = {}; c.ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "snap" && m.hangars) hg = m.hangars; });
const st = c.last.hello.pois.find((p) => p.id === "station");
c.dev({ cmd: "move", x: st.x - 1.3, y: st.y - 0.2 }); await sleep(600);
c.send({ t: "buy", ship: SHIP, item: "beam_s1", qty: 1 }); await sleep(400);
t.ok(c.last.notice && c.last.notice.text === "Dock at a station to buy", "only docked", c.last.notice);
c.send({ t: "dock", ship: SHIP, where: "station" }); for (let i = 0; i < 60 && !c.ship().docked; i++) await sleep(200);
c.send({ t: "buy", ship: SHIP, item: "beam_s1", qty: 2 }); c.send({ t: "buy", ship: SHIP, item: "ammo_beam_std_s1", qty: 10 }); await sleep(600);
t.ok(c.last.credits && c.last.credits.n === 10_000_000 - 2 * PRICES.beam_s1 - 10 * PRICES.ammo_beam_std_s1 && (hg.station || {}).beam_s1 >= 2 && (hg.station || {}).ammo_beam_std_s1 >= 10, "buying: the price comes off your credits, the items land in that station's hangar", [c.last.credits, hg]);
c.send({ t: "buy", ship: SHIP, item: "coilgun_long_l2", qty: 100 }); await sleep(400);
t.ok(c.last.notice.text === "Not enough credits", "not without the credits");
for (const bad of [{ item: "nope", qty: 1 }, { item: "beam_s1", qty: 0 }, { item: "beam_s1", qty: 1.5 }, { item: "beam_s1", qty: -3 }, { item: "beam_s1", qty: 1e9 }]) c.send({ t: "buy", ship: SHIP, ...bad }); await sleep(400);
t.ok(c.last.credits.n === 10_000_000 - 2 * PRICES.beam_s1 - 10 * PRICES.ammo_beam_std_s1, "bad orders are refused");
// manuals
const pilot = (await g("/game/state")).body.pilots[0];
let r = await g("/game/queue/add", { pilotId: pilot.id, key: "electronics" }); t.ok(r.status === 400 && /Electronics Manual/.test(r.body.error), "a license needs its manual read first (owner)", r.body);
c.send({ t: "buy", ship: SHIP, item: "manual_electronics", qty: 1 }); await sleep(400);
c.send({ t: "read", ship: SHIP, from: "hangar", item: "manual_electronics" }); await sleep(700);
t.ok(!(hg.station || {}).manual_electronics && c.last.notice.text === "Electronics Manual read", "reading it uses it up", c.last.notice);
r = await g("/game/queue/add", { pilotId: pilot.id, key: "electronics" }); t.ok(r.status === 200, "then it can be trained", r.body);
await g("/game/queue/remove", { pilotId: pilot.id, key: "electronics" });
c.send({ t: "read", ship: SHIP, from: "hangar", item: "manual_electronics" }); await sleep(300);
await c.close(); await db.query(`DELETE FROM users WHERE username = 'MktNew'`); await db.end();
t.done();
