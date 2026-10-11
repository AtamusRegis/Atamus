// (owner) account security: failed logins back off per account and device; a login from somewhere the account couldn't
// have travelled to on another device locks it (not through a VPN, and only flagged when the time zone matches); staff
// see logins and unlock; one account per device in the game; a client sending malformed messages is timed out.
// Places come from the PTR's x-ptr-geo / x-ptr-vpn headers.
import { suite, BASE, connect, sleep } from "./lib.mjs";
import pg from "../../packages/server/node_modules/pg/lib/index.js";
const t = suite("security");
const db = new pg.Pool({ connectionString: "postgres://postgres@127.0.0.1:5433/atamus" });
const H = (extra = {}) => ({ "content-type": "application/json", origin: BASE, ...extra });
const post = (path, body, extra) => fetch(BASE + path, { method: "POST", headers: H(extra), body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const g = (path) => fetch(BASE + path, { headers: H() }).then(async (r) => ({ status: r.status, body: await r.json() }));
const dev = () => "test" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const NY = "40.71,-74.00,New York", LON = "51.51,-0.13,London", TOK = "35.68,139.69,Tokyo", SYD = "-33.87,151.21,Sydney";
const U = "SecTestCal", PW = "calpassword1";

// a fresh account each run (its history starts empty)
await db.query(`DELETE FROM users WHERE lower(username) IN ('sectestcal', 'sectestdee')`);
let r = await post("/auth/signup", { username: U, password: PW, eula: true, device: dev(), tz: "America/New_York" }, { "x-ptr-geo": NY });
t.ok(r.status === 201, "sign up (the first login is recorded)", r.body);
const uid = String((await db.query(`SELECT id FROM users WHERE username = $1`, [U])).rows[0].id);
const login = (device, geo, tz, extra = {}) => post("/auth/login", { username: U, password: PW, device, tz }, { "x-ptr-geo": geo, ...extra });

// ---- failed logins: 5 free, then a wait, per device ----
const d1 = dev();
for (let i = 0; i < 5; i++) await post("/auth/login", { username: U, password: "wrong" + i, device: d1 });
r = await post("/auth/login", { username: U, password: PW, device: d1 });
t.ok(r.status === 429 && /Too many failed logins/.test(r.body.error), "after 5 misses a device waits, even with the right password (owner)", r);
const d2 = dev();
r = await login(d2, NY, "America/New_York"); t.ok(r.status === 200, "another device isn't held back (a shared VPN address doesn't lock others out)", r.body);
r = await post("/auth/login", { username: U, password: "x".repeat(300), device: d2 }); t.ok(r.status === 400, "an oversized password is refused outright");

// ---- impossible travel ----
await post("/game/admin/unlock", { password: "Cinder@Hollow6021=Magnet~Captain%Creek" });
if (!(await g("/game/admin/me")).body.persona) await post("/game/admin/persona", { name: "Warden_S", pic: 1 });
await post("/game/admin/notes/read", {});
r = await login(d2, LON, "America/New_York"); t.ok(r.status === 200, "the same device far away (switching a VPN on) isn't locked", r.body);
r = await login(d2, NY, "America/New_York");
r = await login(dev(), TOK, "Asia/Tokyo", { "x-ptr-vpn": "1" }); t.ok(r.status === 200, "a new device far away through a known VPN isn't locked", r.body);
r = await login(d2, NY, "America/New_York");
r = await login(dev(), SYD, "America/New_York"); t.ok(r.status === 200, "a new device far away with the same time zone is only flagged", r.body);
r = await login(dev(), NY, "America/New_York"); t.ok(r.status === 200, "a new device nearby is fine", r.body);
const d3 = dev();
r = await login(d3, LON, "Europe/London"); t.ok(r.status === 403 && r.body.locked, "a new device in London minutes after New York locks the account (owner)", r.body);
r = await login(d2, NY, "America/New_York"); t.ok(r.status === 403 && r.body.locked, "and it stays locked, from anywhere");
let notes = (await g("/game/admin/notes")).body;
t.ok(notes.some((n) => n.kind === "security" && /^Locked: SecTestCal/.test(n.text)), "the Admins are told it was locked", notes.slice(0, 5));
t.ok(notes.some((n) => /^Flagged: SecTestCal.*VPN/.test(n.text)) && notes.some((n) => /^Flagged: SecTestCal.*same time zone/.test(n.text)), "and of the VPN and time zone flags");
t.ok(notes.some((n) => /devices in 30 days/.test(n.text)), "more than 4 devices in 30 days is flagged");
let sec = (await g("/game/admin/player/" + uid + "/security")).body;
t.ok(sec.locked && sec.logins.some((l) => l.result === "locked" && /London/.test(l.place)) && sec.logins.some((l) => l.result === "failed") && sec.devices30 >= 5, "staff see the logins, the lock and the devices", sec);
t.ok(!JSON.stringify(sec).includes(d2), "device ids themselves aren't shown");
r = await post("/game/admin/security/unlock", { id: uid, reason: "" }); t.ok(r.status === 400, "unlocking needs a reason");
r = await post("/game/admin/security/unlock", { id: uid, reason: "verified on Discord" }); t.ok(r.body.ok, "staff unlock it", r.body);
r = await login(d3, LON, "Europe/London"); t.ok(r.status === 200, "the next login after an unlock isn't held to the travel check", r.body);

// recovery questions unlock it too
await db.query(`UPDATE users SET locked_reason = 'test', locked_at = now() WHERE id = $1`, [uid]);
{ const { hashSecret, normalizeAnswer } = await import("../../packages/server/src/hash.js");
  await db.query(`DELETE FROM recovery_questions WHERE user_id = $1`, [uid]);
  for (let i = 0; i < 3; i++) await db.query(`INSERT INTO recovery_questions (user_id, idx, question, answer) VALUES ($1, $2, $3, $4)`, [uid, i, "Q" + i, await hashSecret(normalizeAnswer("a" + i))]); }
r = await post("/auth/recover/start", { username: U });
r = await post("/auth/recover/finish", { token: r.body.token, answers: ["a0", "a1", "a2"], password: PW });
r = await login(d3, LON, "Europe/London"); t.ok(r.status === 200, "the recovery questions unlock a locked account (owner)", r.body);

// ---- one account per device in the game ----
await db.query(`DELETE FROM timeouts WHERE device LIKE 'test%' OR device LIKE 'ptrdevice%'`);
const shared = dev();
const ca = await connect("?as=SecTestCal&d=" + shared);
const cb = await connect("?as=SecTestDee&d=" + shared).catch(() => null);
await sleep(300);
t.ok(ca.closeCode == null && cb && cb.closeCode === 4009, "a second account on the same device is refused (owner)", cb && cb.closeCode);
await ca.close();
const cc = await connect("?as=SecTestDee&d=" + shared); await sleep(200);
t.ok(cc.closeCode == null, "once the first leaves, another account may play on it"); await cc.close();
const c0 = await connect("?as=SecTestDee").catch(() => null); t.ok(c0 && c0.closeCode == null, "(PTR test scripts without a device id still connect)"); if (c0) await c0.close();

// ---- malformed messages time the client out ----
const bot = dev(), cbot = await connect("?as=SecTestDee&d=" + bot);
for (let i = 0; i < 25; i++) cbot.send("not json " + i);
await sleep(800);
t.ok(cbot.closeCode === 4007, "a client sending malformed messages is timed out (owner)", cbot.closeCode);
const again = await connect("?as=SecTestDee&d=" + bot); await sleep(200);
t.ok(again.closeCode === 4008, "and can't come back until it ends", again.closeCode);
const other = await connect("?as=SecTestDee&d=" + dev()); await sleep(200);
t.ok(other.closeCode === 4008, "not on another device either (the account is timed out too)", other.closeCode);
const { rows: to } = await db.query(`SELECT round(extract(epoch FROM until - at) / 60) AS len FROM timeouts WHERE device = $1`, [bot]);
t.ok(to.length === 1 && +to[0].len === 5, "the first timeout is 5 minutes", to);
notes = (await g("/game/admin/notes")).body;
t.ok(notes.some((n) => /^Timed out SecTestDee/.test(n.text)), "staff are told");
const flood = dev(); await db.query(`UPDATE timeouts SET until = now() WHERE user_id = (SELECT id FROM users WHERE username = 'SecTestDee')`);   // (the first one over)
const cf = await connect("?as=SecTestDee&d=" + flood);
for (let i = 0; i < 2000; i++) cf.send({ t: "view", x: 0, y: 0, w: 100 });
await sleep(1200);
t.ok(cf.closeCode === 4007, "flooding counts too", cf.closeCode);
const { rows: to2 } = await db.query(`SELECT round(extract(epoch FROM until - at) / 60) AS len FROM timeouts WHERE device = $1`, [flood]);
t.ok(to2.length === 1 && +to2[0].len === 30, "the second within a week is 30 minutes", to2);
await db.query(`DELETE FROM timeouts WHERE user_id = (SELECT id FROM users WHERE username = 'SecTestDee')`);
const ok = await connect("?as=SecTestDee&d=" + dev()); await sleep(200);
t.ok(ok.closeCode == null, "a normal client isn't bothered"); await ok.close();
await db.end();
t.done();
