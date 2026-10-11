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
// (owner) the admin profile: an admin name (no one else's) and a picture, made first
if (!r.body.persona) { r = await q("/players"); t.ok(r.status === 403 && /admin profile/.test(r.body.error), "nothing else until the admin profile is made", r.body); }
r = await q("/persona", { name: "AdmTestBob", pic: 2 }); t.ok(r.status === 400 && /taken|allowed/.test(r.body.error), "an admin name can't be a player's name", r.body);
r = await q("/persona", { name: "PTR", pic: 2 }); t.ok(r.status === 400, "nor the admin's own name");
r = await q("/persona", { name: "Warden_X", pic: 9 }); t.ok(r.status === 400, "one of the pictures");
r = await q("/persona", { name: "Warden_X", pic: 2 }); t.ok(r.body.ok && r.body.persona.name === "Warden_X", "the admin profile is made", r.body);
const AN = "Warden_X";
r = await q("/me"); t.ok(r.body.persona && r.body.persona.name === AN && r.body.persona.pic === 2, "and kept", r.body);
r = await fetch(BASE + "/game/pilot/create", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ name: AN }) }).then(async (x) => ({ status: x.status, body: await x.json() }));
t.ok(r.status === 400 && /taken/.test(r.body.error), "no one else can take an admin's name", r.body);
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
t.ok(r.body.some((x) => x.action === "kick" && x.reason === "spamming chat" && x.admin === AN) && banRow && banRow.reason === "cheating", "kicks and bans go to the admin log: player, action, reason", r.body.slice(0, 3));
r = await q("/unban", { id: String(bob.id), logId: banRow.id }); t.ok(r.status === 400, "an unban needs a reason too");
r = await q("/unban", { id: String(bob.id), reason: "appeal accepted", logId: banRow.id }); t.ok(r.body.ok, "unban");
r = await q("/log"); t.ok(r.body[0].action === "unban" && r.body[0].reason === "appeal accepted", "the unban is its own log entry with its reason", r.body[0]);
lg = await fetch(BASE + "/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ username: "AdmTestBob", password: "bobpassword1" }) });
t.ok(lg.status === 200, "unbanned: they can log in again", lg.status);
r = await q("/ban", { id: String(me.id), reason: "self", perm: true }); t.ok(r.status === 403, "no one can ban themselves");
// (owner) appeals: a conversation while the ban lasts (the login page gets a token); 3 per ban; Timeout: then 1 more
const login = (u, p) => fetch(BASE + "/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ username: u, password: p }) }).then(async (x) => ({ status: x.status, body: await x.json() }));
const ap = (path, body) => fetch(BASE + "/auth/appeal" + path, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(body) }).then(async (x) => ({ status: x.status, body: await x.json() }));
r = await ap("", { token: "nope", text: "hi" }); t.ok(r.status === 401, "an appeal needs the token a banned login gives");
await q("/ban", { id: String(bob.id), reason: "rude", amount: 3, unit: "hours" });
lg = await login("AdmTestBob", "bobpassword1"); const tok = lg.body.appealToken;
t.ok(lg.status === 403 && tok && lg.body.appeal.canNew && lg.body.appeal.left === 3 && !lg.body.appeal.current, "a banned login: the reason, a token, and 3 appeals to make", lg.body.appeal);
r = await ap("", { token: tok, text: "I was provoked" }); t.ok(r.body.current && r.body.current.status === "open" && r.body.current.messages.length === 1 && r.body.left === 2, "the player opens an appeal", r.body);
const a1 = r.body.current.id;
r = await ap("", { token: tok, text: "please look at the chat logs" }); t.ok(r.body.current.id === a1 && r.body.current.messages.length === 2, "and keeps writing in it while it's open");
{ const adm = await connect(); const seen = []; adm.ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "appealmsg") seen.push(m); });
  r = await q("/appeal/say", { id: a1, text: "Looking into it." }); t.ok(r.body.ok, "an admin answers");
  r = await q("/appeal/" + a1); t.ok(r.body.lines.length === 3 && r.body.lines[2].admin && r.body.lines[2].name === AN && r.body.subscribed, "every admin sees the whole conversation; answering subscribes you", r.body.lines);
  await ap("", { token: tok, text: "thank you" }); await sleep(500);
  t.ok(seen.some((m) => m.id === a1 && m.text === "thank you" && m.name === "AdmTestBob"), "a subscribed admin is told of the player's new line", seen);
  r = await ap("/state", { token: tok }); t.ok(r.body.current.messages.some((l) => l.admin && l.text === "Looking into it."), "the player sees the admins' answers");
  await q("/appeal/subscribe", { id: a1, on: false }); seen.length = 0; await ap("", { token: tok, text: "hello?" }); await sleep(500);
  t.ok(!seen.length, "unsubscribed: no more notes"); await adm.close(); }
r = await q("/appeal", { id: a1, accept: false, reason: "no" }); t.ok(r.body.ok, "deny closes it");
r = await ap("", { token: tok, text: "but wait" }); t.ok(r.body.current && r.body.current.id !== a1 && r.body.left === 1, "a closed appeal can't be written in: a new line starts a new appeal", r.body);
const a2 = r.body.current.id; await q("/appeal", { id: a2, accept: false, reason: "still no" });
r = await ap("", { token: tok, text: "third" }); const a3 = r.body.current.id; await q("/appeal", { id: a3, accept: false, reason: "final" });
r = await ap("", { token: tok, text: "fourth?" }); t.ok(r.status === 400 && /No appeals left/.test(r.body.error), "a ban allows 3 appeals", r.body);
r = await q("/appeal/timeout", { id: a3, amount: 7, unit: "days", reason: "cool off" }); t.ok(r.body.ok, "Timeout on an appeal (days / months / years)");
r = await ap("", { token: tok, text: "now?" }); t.ok(r.status === 400 && /No new appeals until/.test(r.body.error), "no new appeal while it lasts", r.body);
await db.query(`UPDATE appeals SET created_at = created_at - interval '2 days' WHERE user_id = $1`, [bob.id]); await db.query(`UPDATE users SET ban_at = ban_at - interval '3 days', appeal_block_until = now() - interval '1 second', appeal_reset_at = now() - interval '1 second' WHERE id = $1`, [bob.id]);   // (as if the timeout had run its course)
r = await ap("/state", { token: tok }); t.ok(r.body.canNew && r.body.left === 1, "after it, one more appeal (owner)", r.body);
r = await ap("", { token: tok, text: "last chance" }); const a4 = r.body.current && r.body.current.id;
r = await q("/appeal", { id: a4, accept: true, reason: "fair enough" }); t.ok(r.body.ok, "accept");
lg = await login("AdmTestBob", "bobpassword1"); t.ok(lg.status === 200, "an accepted appeal unbans");
r = await q("/log"); t.ok(r.body.some((x) => x.action === "appeal denied") && r.body.some((x) => x.action === "appeal accepted" && x.reason === "fair enough") && r.body.some((x) => x.action === "appeal timeout"), "appeal answers and timeouts go to the log");
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
// (owner) Ban Name: the name goes on the list and its owner must rename (player or pilot)
r = await q("/banname", { id: String(bob.id), reason: "offensive" }); t.ok(r.body.ok && (await db.query(`SELECT rename_required FROM users WHERE id = $1`, [bob.id])).rows[0].rename_required, "Ban Name on a player: they must rename", r.body);
r = await q("/banname", { id: String(bob.id), pilotId: String(bp.id), reason: "offensive pilot" }); t.ok(r.body.ok && (await db.query(`SELECT data FROM pilots WHERE id = $1`, [bp.id])).rows[0].data.renameRequired, "on a pilot: that pilot must be renamed");
r = await q("/names"); t.ok(r.body.some((n) => n.name === "AdmTestBob" && n.kind === "player") && r.body.some((n) => n.name === "Bob Pilot" && n.kind === "pilot"), "both names are on the banned names list", r.body.slice(0, 2));
r = await fetch(BASE + "/auth/signup", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ username: "admtestbob", password: "whatever123" }) }).then(async (x) => ({ status: x.status, body: await x.json() }));
t.ok(r.status === 400 && /isn't allowed|taken|exists/i.test(r.body.error), "a banned name can't be signed up with", r.body);
r = await fetch(BASE + "/auth/signup", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ username: "H1tl3r_88", password: "whatever123" }) }).then(async (x) => ({ status: x.status, body: await x.json() }));
t.ok(r.status === 400 && /isn't allowed/.test(r.body.error), "the name filter refuses bad usernames at signup", r.body);
await q("/names/remove", { name: "Bob Pilot", reason: "fine after all" }); r = await q("/names"); t.ok(!r.body.some((n) => n.name === "Bob Pilot"), "a banned name can be allowed again");
// forced renames, as the PTR tester (its own name and pilot flagged straight in the database)
{ const g = (path, body) => fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", origin: BASE }, body: body ? JSON.stringify(body) : undefined }).then(async (x) => ({ status: x.status, body: await x.json() }));
  r = await g("/game/rename", { name: "PTRtest" }); t.ok(r.status === 400, "no rename unless it's required");
  await db.query(`UPDATE users SET rename_required = true WHERE id = $1`, [me.id]);
  r = await g("/game/state"); t.ok(r.body.profile.renameRequired, "the game is told a rename is required");
  r = await g("/game/rename", { name: "Fuck_You" }); t.ok(r.status === 400 && /isn't allowed/.test(r.body.error), "the new name goes through the filter too");
  r = await g("/game/rename", { name: "PTRtest" }); t.ok(r.body.name === "PTRtest" && !(await g("/game/state")).body.profile.renameRequired, "renamed; no longer required", r.body);
  await db.query(`UPDATE users SET username = 'PTR' WHERE id = $1`, [me.id]);
  const vid = (await db.query(`SELECT id, data FROM pilots WHERE user_id = $1 ORDER BY id LIMIT 1`, [me.id])).rows[0];
  if (vid) { const d = vid.data; d.renameRequired = true; await db.query(`UPDATE pilots SET data = $2 WHERE id = $1`, [vid.id, d]);
    r = await g("/game/pilot/rename", { pilotId: String(vid.id), name: "Vera K" }); t.ok(r.body.name === "Vera K", "a pilot flagged by Ban Name is renamed", r.body);
    await db.query(`UPDATE pilots SET name = 'Vera Kestrel' WHERE id = $1`, [vid.id]); } }
// (owner) the Chat log: flagged Local / Corp lines, never DMs
{ const c = await connect(); c.send({ t: "chat", text: "you are a n4zi lol", channel: "local" }); c.send({ t: "chat", text: "porn porn", channel: "dm", to: "Nobody" }); c.send({ t: "chat", text: "nice day", channel: "local" }); await sleep(600);
  r = await q("/chatflags"); t.ok(r.body[0] && r.body[0].text === "you are a n4zi lol" && r.body[0].cats.includes("extremist") && r.body[0].words.includes("n4zi") && !r.body.some((f) => f.text === "porn porn" || f.text === "nice day"), "flagged Local lines go to the admins' Chat log (DMs and clean lines don't)", r.body.slice(0, 2));
  c.send({ t: "rename", ship: "1:ship:1", name: "N1gg3r Hunter" }); await sleep(300); t.ok(!(c.ship() && c.ship().name === "N1gg3r Hunter"), "ship names go through the filter");
  await c.close(); }
// (owner) admin DMs and Freeze, between the PTR tester (an unlocked admin) and a second test account on the socket
{ await q("/unlock", { password: PW });
  const adm = await connect(), zed = await connect("?as=AdmTestZed"); const zid = (await db.query(`SELECT id FROM users WHERE username = 'AdmTestZed'`)).rows[0].id;
  const got = { a: [], z: [] }; adm.ws.on("message", (b) => got.a.push(JSON.parse(b))); zed.ws.on("message", (b) => got.z.push(JSON.parse(b)));
  adm.send({ t: "chat", text: "anyone around?", channel: "local" }); zed.send({ t: "chat", text: "yes, me", channel: "local" }); await sleep(200);
  adm.send({ t: "admstart", to: "AdmTestZed" }); await sleep(400);
  t.ok(got.z.some((m) => m.t === "admopen" && m.admin === AN && m.pic === 2 && m.key) && got.a.some((m) => m.t === "admopen" && m.with === "AdmTestZed" && m.frozen === false), "an admin opens a DM: both windows open at once (owner)", got.z);
  adm.send({ t: "adm", to: "AdmTestZed", text: "hello there" }); await sleep(300);
  t.ok(got.z.some((m) => m.t === "admdm" && m.text === "hello there" && m.admin === AN), "an admin's line reaches the player");
  zed.send({ t: "adm", text: "hi admin" }); zed.send({ t: "adm", to: "PTR", text: "sneaky" }); zed.send({ t: "admfreeze", to: "PTR", on: true }); await sleep(300);
  t.ok(got.a.some((m) => m.t === "admdm" && m.text === "hi admin" && m.from === "AdmTestZed") && !got.a.some((m) => m.text === "sneaky" && m.with !== "AdmTestZed") && !got.a.some((m) => m.t === "frozen"), "the player answers into it (a player can't start one or freeze anyone)");
  r = await q("/freeze", { id: String(zid), on: true }); t.ok(r.status === 400, "Freeze is done in an admin DM, not the panel");
  // (owner) language: each flagged line goes in the player's log and heats their meters; running hot tells the admins
  for (const x of ["you retard", "dirty japs", "what a bitch", "you queer"]) { zed.send({ t: "chat", text: x, channel: "local" }); await sleep(120); }
  await sleep(400);
  { const L = (await q("/player/" + zid + "/language")).body, P = (await q("/players")).body.find((p) => p.name === "AdmTestZed");
    t.ok(L.lines.length === 4 && L.kinds.slurs.count === 2 && L.kinds.racist.count === 1 && L.kinds.profanity.count === 1 && L.kinds.slurs.heat > L.kinds.profanity.heat && P.heat >= 6, "a player's language log, a meter per kind, and the overall meter (owner)", { L: L.kinds, h: P.heat });
    t.ok(got.a.some((m) => m.t === "langalert" && m.name === "AdmTestZed") && got.a.some((m) => m.t === "chatflag"), "running hot: the admins online are told", got.a.filter((m) => m.t === "langalert")); }
  // (owner) the chat's Admin switch: Local under the admin profile (no ship says it); a DM becomes an admin DM
  adm.send({ t: "chat", text: "admin here", channel: "local", as: "admin", ship: "1:ship:1" }); adm.send({ t: "chat", text: "as admin dm", channel: "dm", to: "AdmTestZed", as: "admin" }); await sleep(400);
  const al = got.z.find((m) => m.t === "chat" && m.text === "admin here");
  t.ok(al && al.from === AN && al.pic === 2 && al.admin && !al.ships && !al.portrait, "speaking as admin: the admin name and picture, no ship (owner)", al);
  t.ok(got.z.some((m) => m.t === "admdm" && m.text === "as admin dm" && m.admin === AN), "a DM as admin goes into the admin DM");
  zed.send({ t: "chat", text: "fake", channel: "local", as: "admin" }); await sleep(250); t.ok(!got.a.some((m) => m.t === "chat" && m.text === "fake"), "a player can't speak as admin");
  r = await q("/persona", { name: "Warden_Y", pic: 4 }); await sleep(300);
  t.ok(got.z.some((m) => m.t === "adminprofile" && m.key === al.admin && m.name === "Warden_Y" && m.pic === 4), "a changed profile is sent to everyone, so old lines change too (owner)");
  r = await q("/log"); t.ok(r.body.some((x) => x.action === "kick" && x.admin === "Warden_Y") && r.body.some((x) => x.action === "admin profile changed" && x.detail && x.detail.from === AN), "the log shows the admin's current profile, and the change", r.body.slice(0, 2));
  { const ap = (await q("/appeals")).body.find((a) => a.lines >= 3); if (ap) { const d = (await q("/appeal/" + ap.id)).body; t.ok(d.lines.some((l) => l.admin && l.name === "Warden_Y") && !d.lines.some((l) => l.admin && l.name === AN), "appeal answers show it too"); } }
  adm.send({ t: "admfreeze", to: "AdmTestZed", on: true }); await sleep(400);
  t.ok(got.z.some((m) => m.t === "frozen" && m.on) && got.a.some((m) => m.t === "admstate" && m.frozen), "Freeze: the DM's box, no reason needed; the player's screen grays out (owner)");
  zed.send({ t: "chat", text: "can I talk", channel: "local" }); await sleep(300);
  t.ok(!got.a.some((m) => m.t === "chat" && m.text === "can I talk"), "a frozen player can't chat");
  zed.send({ t: "adm", text: "what happened" }); await sleep(300);
  t.ok(got.a.some((m) => m.t === "admdm" && m.text === "what happened"), "but can still answer the admin");
  r = await q("/players"); t.ok(r.body.some((p) => p.name === "AdmTestZed" && p.frozen && p.online), "the list shows them frozen (and online)");
  r = await q("/log"); t.ok(r.body.some((x) => x.action === "freeze" && x.target === "AdmTestZed" && x.reason === ""), "the freeze is logged (owner)");
  await zed.close(); const zed2 = await connect("?as=AdmTestZed"); const got2 = []; zed2.ws.on("message", (b) => got2.push(JSON.parse(b))); await sleep(100);
  t.ok(zed2.last.frozen && zed2.last.frozen.on && zed2.last.admopen && zed2.last.admopen.log.length >= 3, "coming back, still frozen and the conversation still open", { f: zed2.last.frozen, o: zed2.last.admopen });
  { const d = (await db.query(`SELECT frozen, admin_id FROM admin_dms WHERE player_id = $1`, [zid])).rows[0]; t.ok(d && d.frozen && String(d.admin_id) === String(me.id), "the DM and its freeze are saved (they survive a redeploy, owner)", d); }
  adm.send({ t: "admend", to: "AdmTestZed" }); await sleep(400);
  t.ok(got2.some((m) => m.t === "admend") && got2.some((m) => m.t === "frozen" && !m.on), "closing the DM ends it and thaws the player (owner)");
  r = await q("/log"); t.ok(r.body.some((x) => x.action === "unfreeze" && x.target === "AdmTestZed"), "the thaw is logged");
  await q("/mute", { id: String(zid), reason: "quiet", amount: 1, unit: "hours" }); zed2.send({ t: "chat", text: "muted talk", channel: "local" }); await sleep(300);
  t.ok(!got.a.some((m) => m.t === "chat" && m.text === "muted talk") && got2.some((m) => m.t === "notice" && /muted/.test(m.text)), "a muted player can't chat (and is told so) (owner)", got2.filter((m) => m.t === "notice"));
  await q("/unmute", { id: String(zid), reason: "ok" }); zed2.send({ t: "chat", text: "free now", channel: "local" }); await sleep(300);
  t.ok(got.a.some((m) => m.t === "chat" && m.text === "free now"), "unmuted, they can again");
  // a report on them, then a kick: each keeps the last hour of chat (and their ship names then)
  r = await fetch(BASE + "/game/report", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ target: "AdmTestZed", category: "Spam", text: "testing reports" }) }).then(async (x) => ({ status: x.status, body: await x.json() }));
  const rep = (await q("/reports")).body.find((x) => x.text === "testing reports");
  const repChat = rep && (await q("/report/" + rep.id + "/chat")).body;
  t.ok(rep && rep.chat > 0 && Array.isArray(rep.ships) && repChat.some((l) => l.text === "yes, me" && l.ch === "local") && repChat.some((l) => l.ch === "admin" && l.text === "hello there" && l.from === "Warden_Y"), "a report keeps the last hour of chat (Local / Corp, their DMs and admin DMs) and their ships then (owner)", { rep, n: repChat && repChat.length });
  await q("/report/close", { id: rep.id }); t.ok((await q("/reports")).body.find((x) => x.id === rep.id).status === "closed", "a report can be closed");
  await q("/kick", { id: String(zid), reason: "testing kick" }); await sleep(400);
  t.ok(zed2.closeCode === 4005 && got2.some((m) => m.t === "kicked" && m.reason === "testing kick"), "kick: the reason, then the game closes", zed2.closeCode);
  { const k = (await q("/log")).body.find((x) => x.action === "kick" && x.target === "AdmTestZed"), kc = (await q("/log/" + k.id + "/chat")).body;
    t.ok(k.chat > 0 && kc.some((l) => l.text === "yes, me") && Array.isArray(k.ships), "a kick keeps the last hour of chat too (owner)", k); }
  await q("/persona", { name: AN, pic: 2 });
  await adm.close(); await db.query(`UPDATE admin_log SET target_id = NULL WHERE target_id = $1`, [zid]); await db.query(`DELETE FROM users WHERE id = $1`, [zid]); }
await db.query(`DELETE FROM pilots WHERE user_id IN ($1, $2)`, [bob.id, ann.id]); await db.query(`UPDATE admin_log SET target_id = NULL WHERE target_id IN ($1, $2)`, [bob.id, ann.id]); await db.query(`DELETE FROM users WHERE id IN ($1, $2)`, [bob.id, ann.id]);
await db.end();
t.done();
