// The admin panel's API (docs/FEATURES.md › Admin panel): the second password, the player list, kick / ban / unban with
// reasons in the admin log, the Head Admin's extra powers. The PTR tester is the Head Admin (switched to admin for a
// moment); test accounts are added straight to the database.
import pg from "../../packages/server/node_modules/pg/lib/index.js";
import { hashSecret } from "../../packages/server/src/hash.js";
import { suite, BASE } from "./lib.mjs";
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
await db.query(`DELETE FROM pilots WHERE user_id IN ($1, $2)`, [bob.id, ann.id]); await db.query(`UPDATE admin_log SET target_id = NULL WHERE target_id IN ($1, $2)`, [bob.id, ann.id]); await db.query(`DELETE FROM users WHERE id IN ($1, $2)`, [bob.id, ann.id]);
await db.end();
t.done();
