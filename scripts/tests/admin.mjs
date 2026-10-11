// The admin panel's API (docs/FEATURES.md › Admin panel): the second password, the player list, kick / ban / unban with
// reasons in the admin log, the Head Admin's extra powers. The PTR tester is the Head Admin (switched to admin for a
// moment); test accounts are added straight to the database.
import pg from "../../packages/server/node_modules/pg/lib/index.js";
import { hashSecret } from "../../packages/server/src/hash.js";
import { suite, BASE, connect, sleep } from "./lib.mjs";
const t = suite("admin");
const db = new pg.Pool({ connectionString: "postgres://postgres@127.0.0.1:5433/atamus" });
const q = (path, body) => fetch(BASE + "/game/admin" + path, body ? { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(body) } : {}).then(async (r) => ({ status: r.status, body: await r.json() }));
const PW = "Cinder@Hollow6021=Magnet~Captain%Creek";
const me = (await db.query(`SELECT id FROM users WHERE lower(username) = 'ptr'`)).rows[0];
await db.query(`UPDATE users SET role = 'head' WHERE id = $1`, [me.id]);
// test accounts: a player (with a password, to try logging in) and an admin
const hash = await hashSecret("bobpassword1");
for (const [n, role] of [["AdmTestBob", null], ["AdmTestAnn", "admin"]]) await db.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, $3) ON CONFLICT (lower(username)) DO UPDATE SET role = $3, ban_perm = false, ban_until = NULL, ban_reason = NULL, credits = 500, corp = 'Rogue Co'`, [n, hash, role]);
const bob = (await db.query(`SELECT id FROM users WHERE username = 'AdmTestBob'`)).rows[0], ann = (await db.query(`SELECT id FROM users WHERE username = 'AdmTestAnn'`)).rows[0];
await db.query(`UPDATE users SET credits = 500, corp = 'Rogue Co' WHERE id = $1`, [bob.id]);
await db.query(`DELETE FROM pilots WHERE user_id = $1`, [bob.id]);
const bp = (await db.query(`INSERT INTO pilots (user_id, name, data) VALUES ($1, 'Bob Pilot', $2) RETURNING id`, [bob.id, { licenses: { mining_frigate: 1 }, banked: {}, queue: [{ key: "mining_lasers", level: 1 }], activeStart: null, paused: false }])).rows[0];
await q("/lock", {});

let r = await q("/players"); t.ok(r.status === 403 && r.body.error === "Locked.", "locked until the second password is given", r);
r = await q("/unlock", { password: "nope" }); t.ok(r.status === 403, "a wrong second password is refused");
r = await q("/unlock", { password: PW }); t.ok(r.body.ok, "the right one unlocks it", r.body);
r = await q("/me"); t.ok(r.body.role === "head" && r.body.unlocked, "the PTR tester is the Head Admin", r.body);
r = await q("/players"); const pl = r.body;
t.ok(Array.isArray(pl) && pl.some((p) => p.name === "AdmTestBob" && p.role === null) && pl.some((p) => p.name === "AdmTestAnn" && p.role === "admin"), "the player list has everyone, with their role");
// kick / ban / unban, logged with reasons
r = await q("/kick", { id: String(bob.id) }); t.ok(r.status === 400, "a kick needs a reason");
r = await q("/kick", { id: String(bob.id), reason: "spamming chat" }); t.ok(r.body.ok, "kick");
r = await q("/ban", { id: String(bob.id), reason: "griefing", amount: 2, unit: "days" }); t.ok(r.body.ok, "a temporary ban (days)", r.body);
let lg = await fetch(BASE + "/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ username: "AdmTestBob", password: "bobpassword1" }) }).then(async (x) => ({ status: x.status, body: await x.json() }));
t.ok(lg.status === 403 && /banned until/.test(lg.body.error) && /griefing/.test(lg.body.error), "a banned player is told why and until when at login (owner)", lg.body);
r = await q("/ban", { id: String(bob.id), reason: "x", amount: 0, unit: "days" }); t.ok(r.status === 400, "a timed ban needs a length");
r = await q("/ban", { id: String(bob.id), reason: "cheating", perm: true }); t.ok(r.body.ok, "a permanent ban");
lg = await fetch(BASE + "/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ username: "AdmTestBob", password: "bobpassword1" }) }).then(async (x) => ({ status: x.status, body: await x.json() }));
t.ok(lg.status === 403 && /permanently/.test(lg.body.error) && /cheating/.test(lg.body.error), "permanent: said so at login", lg.body);
r = await q("/log"); const banRow = r.body.find((x) => x.action === "ban" && x.target === "AdmTestBob");
t.ok(r.body.some((x) => x.action === "kick" && x.reason === "spamming chat" && x.admin === "PTR") && banRow && banRow.reason === "cheating", "kicks and bans go to the admin log: player, action, reason", r.body.slice(0, 3));
r = await q("/unban", { id: String(bob.id), logId: banRow.id }); t.ok(r.status === 400, "an unban needs a reason too");
r = await q("/unban", { id: String(bob.id), reason: "appeal accepted", logId: banRow.id }); t.ok(r.body.ok, "unban");
r = await q("/log"); t.ok(r.body[0].action === "unban" && r.body[0].reason === "appeal accepted", "the unban is its own log entry with its reason", r.body[0]);
lg = await fetch(BASE + "/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ username: "AdmTestBob", password: "bobpassword1" }) });
t.ok(lg.status === 200, "unbanned: they can log in again", lg.status);
r = await q("/ban", { id: String(me.id), reason: "self", perm: true }); t.ok(r.status === 403, "no one can ban themselves");
// (owner) appeals: only a banned player, with their password, one open at a time; accepting unbans
const appeal = (body) => fetch(BASE + "/auth/appeal", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(body) }).then(async (x) => ({ status: x.status, body: await x.json() }));
r = await appeal({ username: "AdmTestBob", password: "bobpassword1", text: "please" }); t.ok(r.status === 400 && /isn't banned/.test(r.body.error), "only a banned player can appeal", r.body);
await q("/ban", { id: String(bob.id), reason: "rude", amount: 3, unit: "hours" });
r = await appeal({ username: "AdmTestBob", password: "wrong", text: "please" }); t.ok(r.status === 401, "an appeal needs their password");
r = await appeal({ username: "AdmTestBob", password: "bobpassword1", text: "I was provoked" }); t.ok(r.body.ok, "a banned player sends an appeal (from the login page)", r.body);
r = await appeal({ username: "AdmTestBob", password: "bobpassword1", text: "again" }); t.ok(r.status === 400, "one open appeal at a time");
lg = await fetch(BASE + "/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ username: "AdmTestBob", password: "bobpassword1" }) }).then(async (x) => ({ status: x.status, body: await x.json() }));
t.ok(lg.status === 403 && lg.body.appeal && lg.body.appeal.status === "open", "logging in, they're told it's being reviewed", lg.body);
r = await q("/appeals"); const ap1 = r.body.find((a) => a.name === "AdmTestBob" && a.status === "open");
t.ok(ap1 && ap1.text === "I was provoked" && ap1.banReason === "rude", "the Appeals tab lists it, with the ban's reason", r.body[0]);
r = await q("/appeal", { id: ap1.id, accept: false, reason: "no" }); t.ok(r.body.ok, "deny");
lg = await fetch(BASE + "/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ username: "AdmTestBob", password: "bobpassword1" }) }).then(async (x) => ({ status: x.status, body: await x.json() }));
t.ok(lg.status === 403 && lg.body.appeal.status === "denied" && lg.body.appeal.response === "no", "a denied appeal is shown at login, with the answer", lg.body.appeal);
await appeal({ username: "AdmTestBob", password: "bobpassword1", text: "second try" }); r = await q("/appeals"); const ap2 = r.body.find((a) => a.text === "second try");
r = await q("/appeal", { id: ap2.id, accept: true, reason: "fair enough" }); t.ok(r.body.ok, "accept");
lg = await fetch(BASE + "/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ username: "AdmTestBob", password: "bobpassword1" }) });
t.ok(lg.status === 200, "an accepted appeal unbans");
r = await q("/log"); t.ok(r.body.some((x) => x.action === "appeal denied") && r.body.some((x) => x.action === "appeal accepted" && x.reason === "fair enough"), "appeal answers go to the log");
// (owner) mute: the Disciplined list (temp / perma bans, mutes, Freeze) with when each began
r = await q("/mute", { id: String(bob.id), reason: "spam", amount: 2, unit: "hours" }); t.ok(r.body.ok, "mute (hours)");
await q("/ban", { id: String(bob.id), reason: "later", perm: true });
r = await q("/players"); { const b2 = r.body.find((p) => p.name === "AdmTestBob"); t.ok(b2.mute && !b2.mute.perm && b2.mute.reason === "spam" && b2.mute.at && b2.ban.perm && b2.ban.at, "the list carries each discipline, its kind and when it began", b2); }
await q("/unmute", { id: String(bob.id), reason: "ok" }); await q("/unban", { id: String(bob.id), reason: "ok" });
r = await q("/players"); { const b3 = r.body.find((p) => p.name === "AdmTestBob"); t.ok(!b3.mute && !b3.ban, "unmute and unban clear them", b3); }
// the Head Admin: licenses, credits, corporation, roles
r = await q("/player/" + bob.id); t.ok(r.body.pilots.length === 1 && r.body.credits === 500 && r.body.corp === "Rogue Co" && r.body.licenses.length > 0, "a player's info: pilots and licenses, credits, corporation", r.body);
await q("/license", { id: String(bob.id), pilotId: String(bp.id), key: "mining_lasers", op: "+" }); await q("/license", { id: String(bob.id), pilotId: String(bp.id), key: "mining_lasers", op: "+" });
let d = (await db.query(`SELECT data FROM pilots WHERE id = $1`, [bp.id])).rows[0].data;
t.ok(d.licenses.mining_lasers === 2 && !d.queue.some((x) => x.key === "mining_lasers"), "+ raises a license level (and drops queued levels it now has)", d);
await q("/license", { id: String(bob.id), pilotId: String(bp.id), key: "mining_lasers", op: "-" }); d = (await db.query(`SELECT data FROM pilots WHERE id = $1`, [bp.id])).rows[0].data;
t.ok(d.licenses.mining_lasers === 1, "- lowers it");
await q("/license", { id: String(bob.id), pilotId: String(bp.id), key: "mining_frigate", op: "-" }); await q("/license", { id: String(bob.id), pilotId: String(bp.id), key: "mining_lasers", op: "reset" }); d = (await db.query(`SELECT data FROM pilots WHERE id = $1`, [bp.id])).rows[0].data;
t.ok(d.licenses.mining_frigate === 1 && d.licenses.mining_lasers === 0, "reset puts it back to where everyone starts (never below)", d.licenses);
await q("/reset", { id: String(bob.id), what: "credits" }); await q("/reset", { id: String(bob.id), what: "corp" });
r = await q("/player/" + bob.id); t.ok(r.body.credits === 0 && r.body.corp === "Deep Core Industries", "credits and corporation reset", r.body);
r = await q("/role", { id: String(bob.id), admin: true }); t.ok(r.body.ok && (await db.query(`SELECT role FROM users WHERE id = $1`, [bob.id])).rows[0].role === "admin", "the Head Admin makes admins");
await q("/role", { id: String(bob.id), admin: false });
// a regular admin: kick / ban, nothing else, and not other admins
await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [me.id]);
r = await q("/role", { id: String(bob.id), admin: true }); t.ok(r.status === 403, "an admin can't make admins (owner)", r);
r = await q("/license", { id: String(bob.id), pilotId: String(bp.id), key: "mining_lasers", op: "+" }); t.ok(r.status === 403, "or change licenses");
r = await q("/reset", { id: String(bob.id), what: "credits" }); t.ok(r.status === 403, "or reset credits");
r = await q("/kick", { id: String(ann.id), reason: "x" }); t.ok(r.status === 403, "or kick / ban another admin");
r = await q("/kick", { id: String(bob.id), reason: "afk" }); t.ok(r.body.ok, "but can kick and ban players");
await db.query(`UPDATE users SET role = 'head' WHERE id = $1`, [me.id]);
// (owner) admin DMs and Freeze, between the PTR tester (an unlocked admin) and a second test account on the socket
{ await q("/unlock", { password: PW });
  const adm = await connect(), zed = await connect("?as=AdmTestZed"); const zid = (await db.query(`SELECT id FROM users WHERE username = 'AdmTestZed'`)).rows[0].id;
  const got = { a: [], z: [] }; adm.ws.on("message", (b) => got.a.push(JSON.parse(b))); zed.ws.on("message", (b) => got.z.push(JSON.parse(b)));
  adm.send({ t: "adm", to: "AdmTestZed", text: "hello there" }); await sleep(300);
  t.ok(got.z.some((m) => m.t === "admdm" && m.text === "hello there" && m.admin === "PTR") && got.a.some((m) => m.t === "admdm" && m.with === "AdmTestZed"), "an admin DMs a player: it reaches them as an admin conversation", got.z);
  zed.send({ t: "adm", text: "hi admin" }); zed.send({ t: "adm", to: "PTR", text: "sneaky" }); await sleep(300);
  t.ok(got.a.some((m) => m.t === "admdm" && m.text === "hi admin" && m.from === "AdmTestZed") && !got.a.some((m) => m.text === "sneaky" && m.with !== "AdmTestZed"), "the player answers into it (a player can't start one)", got.a.filter((m) => m.t === "admdm"));
  r = await q("/freeze", { id: String(zid), on: true }); t.ok(r.status === 400, "Freeze needs a reason");
  r = await q("/freeze", { id: String(zid), on: true, reason: "investigating" }); await sleep(300);
  t.ok(r.body.ok && got.z.some((m) => m.t === "frozen" && m.on), "Freeze: the player is told (their screen grays out)", r.body);
  zed.send({ t: "chat", text: "can I talk", channel: "local" }); await sleep(300);
  t.ok(!got.a.some((m) => m.t === "chat" && m.text === "can I talk"), "a frozen player can't chat");
  zed.send({ t: "adm", text: "what happened" }); await sleep(300);
  t.ok(got.a.some((m) => m.t === "admdm" && m.text === "what happened"), "but can still answer the admin");
  r = await q("/players"); t.ok(r.body.some((p) => p.name === "AdmTestZed" && p.frozen && p.online), "the list shows them frozen (and online)");
  await zed.close(); const zed2 = await connect("?as=AdmTestZed"); const got2 = []; zed2.ws.on("message", (b) => got2.push(JSON.parse(b))); await sleep(100);
  t.ok(zed2.last.frozen && zed2.last.frozen.on && zed2.last.admopen && zed2.last.admopen.log.length >= 3, "coming back, still frozen and the conversation still open", { f: zed2.last.frozen, o: zed2.last.admopen });
  await q("/freeze", { id: String(zid), on: false, reason: "cleared" }); await sleep(300);
  t.ok(got2.some((m) => m.t === "frozen" && !m.on), "unfreeze");
  adm.send({ t: "admend", to: "AdmTestZed" }); await sleep(300);
  t.ok(got2.some((m) => m.t === "admend"), "the admin ends the conversation: the player's window closes");
  await q("/mute", { id: String(zid), reason: "quiet", amount: 1, unit: "hours" }); zed2.send({ t: "chat", text: "muted talk", channel: "local" }); await sleep(300);
  t.ok(!got.a.some((m) => m.t === "chat" && m.text === "muted talk") && got2.some((m) => m.t === "notice" && /muted/.test(m.text)), "a muted player can't chat (and is told so) (owner)", got2.filter((m) => m.t === "notice"));
  await q("/unmute", { id: String(zid), reason: "ok" }); zed2.send({ t: "chat", text: "free now", channel: "local" }); await sleep(300);
  t.ok(got.a.some((m) => m.t === "chat" && m.text === "free now"), "unmuted, they can again");
  await q("/kick", { id: String(zid), reason: "testing kick" }); await sleep(400);
  t.ok(zed2.closeCode === 4005 && got2.some((m) => m.t === "kicked" && m.reason === "testing kick"), "kick: the reason, then the game closes", zed2.closeCode);
  r = await q("/log"); t.ok(r.body.some((x) => x.action === "freeze" && x.reason === "investigating") && r.body.some((x) => x.action === "unfreeze"), "freezes go to the admin log");
  await adm.close(); await db.query(`UPDATE admin_log SET target_id = NULL WHERE target_id = $1`, [zid]); await db.query(`DELETE FROM users WHERE id = $1`, [zid]); }
await db.query(`DELETE FROM pilots WHERE user_id IN ($1, $2)`, [bob.id, ann.id]); await db.query(`UPDATE admin_log SET target_id = NULL WHERE target_id IN ($1, $2)`, [bob.id, ann.id]); await db.query(`DELETE FROM users WHERE id IN ($1, $2)`, [bob.id, ann.id]);
await db.end();
t.done();
