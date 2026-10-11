// (owner) chat Moderators, the trade watch and suspicion, automatic language mutes, Remember Password, repealed words,
// and what staff see on the map. Test accounts are made through the PTR's x-ptr-as / ?as=; the PTR tester is the Head Admin.
import pg from "../../packages/server/node_modules/pg/lib/index.js";
import { hashSecret } from "../../packages/server/src/hash.js";
import { suite, BASE, connect, sleep } from "./lib.mjs";
const t = suite("watch");
const db = new pg.Pool({ connectionString: "postgres://postgres@127.0.0.1:5433/atamus" });
const H = (as) => ({ "content-type": "application/json", origin: BASE, ...(as ? { "x-ptr-as": as } : {}) });
const g = (path, body, as) => fetch(BASE + path, body ? { method: "POST", headers: H(as), body: JSON.stringify(body) } : { headers: H(as) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const PW = "Cinder@Hollow6021=Magnet~Captain%Creek", MPW = "Mod#Wat2026";
await g("/game/admin/unlock", { password: PW });
if (!(await g("/game/admin/me")).body.persona) await g("/game/admin/persona", { name: "Warden_W", pic: 1 });
const id = async (n) => { await g("/game/state", null, n); return String((await db.query(`SELECT id FROM users WHERE lower(username) = lower($1)`, [n])).rows[0].id); };
const [mod, pa, pb, pc] = [await id("WatMod"), await id("WatAnn"), await id("WatBen"), await id("WatCid")];
await db.query(`UPDATE users SET role = 'mod', promo_pending = NULL, admin_pw_hash = $2, mod_suspended_until = NULL WHERE id = $1`, [mod, await hashSecret(MPW)]);
for (const x of [pa, pb, pc]) await db.query(`UPDATE users SET role = NULL, mute_perm = false, mute_until = NULL, ban_until = NULL, login_hold_until = NULL, susp_level = 0 WHERE id = $1`, [x]);
await db.query(`DELETE FROM suspicion WHERE user_id = ANY($1)`, [[pa, pb, pc]]); await db.query(`DELETE FROM ledger WHERE from_id = ANY($1) OR to_id = ANY($1)`, [[pa, pb, pc]]); await db.query(`DELETE FROM contacts WHERE a_id = ANY($1) OR b_id = ANY($1)`, [[pa, pb, pc]]);
const m = (path, body) => g("/game/admin" + path, body, "WatMod");
let r = await m("/unlock", { password: MPW }); t.ok(r.body.ok, "a Moderator unlocks their panel", r.body);

// ---- Moderators are chat moderators (owner) ----
{ const head = await connect(); await sleep(300);
  r = await m("/ban", { id: pa, reason: "x", amount: 1, unit: "hours" }); t.ok(r.status === 403 && /no Admin is online/.test(r.body.error), "a Moderator can't ban while an Admin is online (owner)", r.body);
  await head.close(); await sleep(1500); }
r = await m("/ban", { id: pa, reason: "x", perm: true }); t.ok(r.status === 403, "never for good");
r = await m("/ban", { id: pa, reason: "spam", amount: 1, unit: "hours" }); t.ok(r.body.ok, "but for a time while none is (owner)", r.body);
await g("/game/admin/unban", { id: pa, reason: "test" });
r = await m("/mute", { id: pa, reason: "language", amount: 1, unit: "hours" }); t.ok(r.body.ok, "but can mute", r.body);
await g("/game/admin/unmute", { id: pa, reason: "test" });
r = await m("/relation", { id: pa, other: "WatBen", kind: "block", reason: "feud" }); t.ok(r.body.ok, "and block two players from each other", r.body);
await g("/game/admin/relation", { id: pa, otherId: pb, kind: "block", on: false, reason: "test" });
r = await m("/appeals"); t.ok(Array.isArray(r.body) && r.body.length === 0, "no ban appeals for Moderators");
r = await m("/names/remove", { name: "x", reason: "x" }); t.ok(r.status === 403, "they can't allow a banned name");
r = await m("/names/suggest", { id: pa, reason: "rude name" }); t.ok(r.body.ok, "they suggest a name ban", r.body);
let notes = (await g("/game/admin/notes")).body; t.ok(notes.some((n) => n.kind === "names" && /Name ban suggested by WatMod: WatAnn/.test(n.text)), "the Admins are told");
r = await m("/words/request", { word: "zorbleflux", cat: "profanity" }); t.ok(r.body.ok || /already/.test(r.body.error), "they suggest words", r.body);
await g("/game/report", { target: "WatAnn", category: "Language", text: "swearing" }, "WatBen");
await g("/game/report", { target: "WatAnn", category: "Cheating", text: "botting" }, "WatBen");
r = await m("/reports"); t.ok(r.body.some((x) => x.category === "Language") && !r.body.some((x) => x.category === "Cheating"), "they see language reports only (owner)", r.body.map((x) => x.category));
const rep = r.body.find((x) => x.category === "Language");
r = await m("/escalate", { kind: "report", id: rep.id, reason: "needs an Admin" }); t.ok(r.body.ok, "they escalate a dispute", r.body);
r = await g("/game/admin/reports"); t.ok(r.body.find((x) => x.id === rep.id).escalated && r.body.some((x) => x.category === "Cheating"), "Admins see it marked, and every report");
notes = (await g("/game/admin/notes")).body; t.ok(notes.some((n) => n.kind === "escalation" && /WatMod/.test(n.text)), "and are told");
await db.query(`UPDATE tickets SET status = 'closed' WHERE user_id = $1`, [pb]);
const tk1 = (await g("/game/ticket", { subject: "bad words", category: "Language", text: "he swore" }, "WatBen")).body.id, tk2 = (await g("/game/ticket", { subject: "bug", category: "Bug", text: "it broke" }, "WatBen")).body.id;
r = await m("/tickets"); t.ok(r.body.some((x) => x.id === tk1) && !r.body.some((x) => x.id === tk2), "Language tickets only (owner)");
r = await m("/ticket/" + tk2); t.ok(r.status === 403, "not even by id");
r = await m("/log"); t.ok(Array.isArray(r.body) && r.body.length > 0, "the full admin log");
r = await m("/player/" + pa + "/web"); t.ok(r.status === 403, "not the trade web");

// ---- automatic language mutes (owner): a step a day; groups alone never mute; contempt before a group does ----
await db.query(`UPDATE users SET lang_heat = 0, lang_mute_step = 0, mute_until = NULL, mute_auto = false WHERE id = $1`, [pc]);
const cc = await connect("?as=WatCid"), got = []; cc.ws.on("message", (b) => got.push(JSON.parse(b)));
for (const x of ["i love mexican food", "the irish are here", "polish people", "indian curry", "russian winter", "korean bbq", "japanese art", "chinese new year", "asian food", "arab horses", "jewish deli", "hispanic music"]) { cc.send({ t: "chat", text: x, channel: "local" }); await sleep(60); }
await sleep(400);
let u = (await db.query(`SELECT mute_until, lang_heat FROM users WHERE id = $1`, [pc])).rows[0]; t.ok(!u.mute_until, "naming peoples, however often, never mutes", u);
cc.send({ t: "chat", text: "those dirty mexicans", channel: "local" }); await sleep(300);
let fl = (await g("/game/admin/chatflags")).body.find((f) => f.text === "those dirty mexicans"); t.ok(fl && fl.cats.includes("hostile"), "a contemptuous word before a people: group hostility", fl);
notes = (await g("/game/admin/notes")).body; t.ok(notes.some((n) => /Group hostility: WatCid/.test(n.text) || /High profanity: WatCid/.test(n.text)), "the staff are told at once");
for (const x of ["you retard", "filthy jews"]) { cc.send({ t: "chat", text: x, channel: "local" }); await sleep(150); }
await sleep(300);
u = (await db.query(`SELECT mute_until, mute_auto, lang_mute_step FROM users WHERE id = $1`, [pc])).rows[0];
t.ok(u.mute_auto && u.lang_mute_step === 1 && Math.abs(new Date(u.mute_until) - Date.now() - 60_000) < 5000, "running hot: muted for a minute", u);
await db.query(`UPDATE users SET mute_until = now() WHERE id = $1`, [pc]); await g("/game/admin/unmute", { id: pc, reason: "test" });
await db.query(`UPDATE users SET mute_auto = false WHERE id = $1`, [pc]);
cc.send({ t: "chat", text: "still a retard", channel: "local" }); await sleep(400);   // (the heat hasn't reset: the next step)
u = (await db.query(`SELECT mute_until, lang_mute_step FROM users WHERE id = $1`, [pc])).rows[0];
t.ok(u.lang_mute_step === 2 && Math.abs(new Date(u.mute_until) - Date.now() - 300_000) < 5000, "the next flagged line while hot: 5 minutes (owner)", u);
for (const st of [2, 3, 4]) { await db.query(`UPDATE users SET mute_until = NULL, mute_auto = false, lang_mute_step = $2, lang_heat = 9, lang_heat_at = now() WHERE id = $1`, [pc, st]); await g("/game/admin/unmute", { id: pc, reason: "t" }); cc.send({ t: "chat", text: "you retard " + st, channel: "local" }); await sleep(350); }
notes = (await g("/game/admin/notes")).body; t.ok(notes.some((n) => /Auto mute: WatCid muted for an hour/.test(n.text)) && !notes.some((n) => /Auto mute: WatCid muted for 10 minutes/.test(n.text)), "past 30 minutes, staff are told (owner)", notes.filter((n) => /Auto mute/.test(n.text)).map((n) => n.text));
r = await m("/language/reset", { id: pc, reason: "calmed down" }); u = (await db.query(`SELECT mute_until, lang_mute_step, lang_heat FROM users WHERE id = $1`, [pc])).rows[0];
t.ok(r.body.ok && !u.mute_until && u.lang_mute_step === 0 && u.lang_heat === 0, "a Moderator resets the timers and the heat (owner)", u);
await cc.close();

// ---- the trade web and its red flags ----
await g("/game/dev/flow", { from: "WatAnn", to: "WatBen", kind: "trade", credits: 2_000_000 });
let s = (await g("/game/admin/player/" + pb + "/suspicion")).body; t.ok(s.reasons.some((x) => x.kind === "Credits from a stranger"), "a large sum from someone they never talked to is a red flag (owner)", s);
await db.query(`DELETE FROM suspicion WHERE user_id = $1`, [pc]);
{ const ca = await connect("?as=WatAnn"), cx = await connect("?as=WatCid"); ca.send({ t: "chat", text: "hey", channel: "dm", to: "WatCid" }); await sleep(400); await ca.close(); await cx.close(); }
await g("/game/dev/flow", { from: "WatAnn", to: "WatCid", kind: "trade", credits: 3_000_000 });
s = (await g("/game/admin/player/" + pc + "/suspicion")).body; t.ok(!s.reasons.some((x) => x.kind === "Credits from a stranger" && /3,000,000/.test(x.text)), "not from someone they've talked to", s.reasons);
for (let i = 0; i < 3; i++) await g("/game/dev/flow", { from: "WatBen", to: "WatAnn", kind: "kill" });
s = (await g("/game/admin/player/" + pa + "/suspicion")).body; t.ok(s.reasons.some((x) => x.kind === "Same players killed"), "the same player killed again and again (owner)");
await g("/game/dev/flow", { from: "WatBen", to: "WatAnn", kind: "loot", value: 6_000_000 });
s = (await g("/game/admin/player/" + pa + "/suspicion")).body; t.ok(s.reasons.some((x) => x.kind === "Large player loot"), "large player loot (owner)");
await g("/game/dev/flow", { from: "WatCid", to: "WatAnn", kind: "can", credits: 0, value: 1000 });
r = await g("/game/admin/player/" + pa + "/web"); const web = r.body, ben = web.near.find((n) => n.name === "WatBen");
t.ok(ben && ben.out === 2_000_000 && ben.kills === 3 && ben.loot === 6_000_000 && web.near.some((n) => n.name === "WatCid" && n.cans === 1), "the web: who they trade with, in and out, kills, loot and cans (owner)", web.near);
t.ok(web.far.length === 0 || web.far.every((f) => f.via), "a step further out, through someone");

// ---- suspicion adds up: told at 10, logins on hold at 30 ----
await db.query(`DELETE FROM suspicion WHERE user_id = $1`, [pb]); await db.query(`UPDATE users SET susp_level = 0 WHERE id = $1`, [pb]);
for (let i = 0; i < 5; i++) await g("/game/dev/flow", { from: "WatCid", to: "WatBen", kind: "gift", credits: 9_000_000 + i });   // (no contact: 10 points a time)
s = (await g("/game/admin/player/" + pb + "/suspicion")).body; t.ok(s.score >= 30 && s.hold, "enough red flags put logins on hold (owner)", s);
notes = (await g("/game/admin/notes")).body; t.ok(notes.some((n) => /Suspicious activity: WatBen/.test(n.text)) && notes.some((n) => /Logins on hold for a day: WatBen/.test(n.text)), "the Admins are told, then of the hold");
r = await g("/game/admin/suspicion/clear", { id: pb, reason: "checked" }); s = (await g("/game/admin/player/" + pb + "/suspicion")).body;
t.ok(r.body.ok && s.score === 0 && !s.hold, "staff clear it and lift the hold", s);

// ---- several new accounts on one device ----
const dev = "watdev" + Date.now();
await db.query(`DELETE FROM users WHERE lower(username) IN ('watnewa', 'watnewb')`);
for (const n of ["WatNewA", "WatNewB"]) await g("/auth/signup", { username: n, password: "watpassword1", eula: true, device: dev });
const nb = (await db.query(`SELECT id FROM users WHERE username = 'WatNewB'`)).rows[0].id;
s = (await g("/game/admin/player/" + nb + "/suspicion")).body; t.ok(s.reasons.some((x) => x.kind === "Several new accounts"), "several new accounts on one device (owner)", s);
r = await g("/game/admin/player/" + nb + "/web"); t.ok(r.body.assoc.some((a) => a.name === "WatNewA" && a.devices >= 1), "and the web links them (owner)", r.body.assoc);

// ---- training without play (the sweep) ----
await db.query(`DELETE FROM pilots WHERE user_id = $1`, [nb]);
const lic = (await g("/game/catalog")).body; const L = (lic.licenses || [])[0];
if (L) { await db.query(`INSERT INTO pilots (user_id, name, data) VALUES ($1, 'Farm Pilot', $2)`, [nb, { licenses: {}, banked: {}, queue: Array.from({ length: 5 }, (_, i) => ({ key: L.key, level: i + 1 })), activeStart: null, paused: false }]);
  await g("/game/dev/sweep", {}); s = (await g("/game/admin/player/" + nb + "/suspicion")).body;
  t.ok(s.reasons.some((x) => x.kind === "Training without play") || (L.levelTimes || []).reduce((a, b) => a + b, 0) < 48 * 3600_000, "training far beyond the time played (owner)", s.reasons); }

// ---- Remember Password ----
const rd = "remdev" + Date.now() + "abcdef";
await db.query(`UPDATE users SET password = $2 WHERE id = $1`, [nb, await hashSecret("watpassword1")]);
r = await g("/auth/login", { username: "WatNewB", password: "watpassword1", device: rd, remember: true }); const tok = r.body.remember;
t.ok(r.status === 200 && typeof tok === "string" && tok.length > 20, "Remember Password: a token, never the password (owner)", r.body);
r = await g("/auth/login", { username: "WatNewB", token: tok, device: rd, remember: true }); t.ok(r.status === 200, "it logs in on that browser", r.body);
r = await g("/auth/login", { username: "WatNewB", token: tok, device: rd + "x", remember: true }); t.ok(r.status === 401 && r.body.forget, "not on another");
r = await g("/auth/remember/forget", { token: tok }); r = await g("/auth/login", { username: "WatNewB", token: tok, device: rd, remember: true }); t.ok(r.status === 401, "unticking forgets it");

// ---- the Head Admin repeals a filtered word ----
r = await g("/game/admin/words/repeal", { word: "damn" }); t.ok(r.body.ok || /already/.test(r.body.error), "the Head Admin repeals a word (owner)", r.body);
{ const c2 = await connect("?as=WatAnn"), hh = []; c2.ws.on("message", (b) => hh.push(JSON.parse(b))); c2.send({ t: "chat", text: "damn it", channel: "local" }); await sleep(400);
  t.ok(hh.some((x) => x.t === "chat" && x.text === "damn it"), "it's no longer filtered", hh.filter((x) => x.t === "chat").map((x) => x.text));
  const w = (await g("/game/admin/words")).body.find((x) => x.word === "damn" && x.status === "repealed"); r = await g("/game/admin/words/restore", { id: w.id }); t.ok(r.body.ok, "and can restore it");
  c2.send({ t: "chat", text: "damn again", channel: "local" }); await sleep(400); t.ok(hh.some((x) => x.t === "chat" && x.text === "**** again"), "filtered again"); await c2.close(); }
r = await m("/words/repeal", { word: "crap" }); t.ok(r.status === 403, "Moderators can't");

// ---- staff activity (owner): 90 days without any and an Admin becomes a Moderator, then a player; they ask to be reinstated ----
await db.query(`UPDATE users SET staff_active_at = now() - interval '100 days' WHERE id = $1`, [mod]);
r = await m("/language/reset", { id: pc, reason: "activity test" }); t.ok(r.body.ok, "(a staff action)", r.body); await sleep(300);
let act = (await db.query(`SELECT staff_active_at FROM users WHERE id = $1`, [mod])).rows[0].staff_active_at; t.ok(Date.now() - new Date(act) < 60_000, "anything a staff member does in the panel keeps them active (owner)", act);
await db.query(`UPDATE users SET role = 'admin', lapsed_role = NULL, staff_active_at = now() - interval '91 days' WHERE id = $1`, [mod]);
await g("/game/admin/dev/lapse", {}); let ru = (await db.query(`SELECT role, lapsed_role FROM users WHERE id = $1`, [mod])).rows[0];
t.ok(ru.role === "mod" && ru.lapsed_role === "admin", "90 days without staff activity: an Admin becomes a Moderator (owner)", ru);
await db.query(`UPDATE users SET staff_active_at = now() - interval '91 days' WHERE id = $1`, [mod]); await g("/game/admin/dev/lapse", {});
ru = (await db.query(`SELECT role, lapsed_role FROM users WHERE id = $1`, [mod])).rows[0]; t.ok(ru.role === null && ru.lapsed_role === "admin", "90 more: a player, who keeps the Admin button (owner)", ru);
r = await g("/game/state", null, "WatMod"); t.ok(r.body.profile.lapsedRole === "admin", "their game knows", r.body.profile);
await db.query(`DELETE FROM reinstatements WHERE user_id = $1`, [mod]);
r = await g("/game/admin/reinstate", { reason: "" }, "WatMod"); t.ok(r.status === 400, "asking needs a reason");
r = await g("/game/admin/reinstate", { reason: "I was away for surgery" }, "WatMod"); t.ok(r.body.ok, "they ask the Head Admin to be reinstated (owner)", r.body);
r = await g("/game/admin/reinstate", { reason: "again" }, "WatMod"); t.ok(r.status === 400, "one request at a time");
notes = (await g("/game/admin/notes")).body; t.ok(notes.some((n) => /WatMod asks to be reinstated as Admin: I was away/.test(n.text)), "the Head Admin is told");
r = await g("/game/admin/reinstatements"); const rq = r.body.find((x) => x.name === "WatMod"); t.ok(rq && rq.role === "admin", "and sees it under Staff");
r = await g("/game/admin/reinstatement", { id: rq.id, approve: true }); ru = (await db.query(`SELECT role, lapsed_role, admin_pw_hash FROM users WHERE id = $1`, [mod])).rows[0];
t.ok(r.body.ok && ru.role === "admin" && !ru.lapsed_role && !ru.admin_pw_hash, "approved: their role back, a new password to make", ru);
await db.query(`UPDATE users SET role = 'mod', admin_pw_hash = $2, staff_active_at = now() WHERE id = $1`, [mod, await hashSecret(MPW)]); await m("/unlock", { password: MPW });

// ---- what staff see on the map (owner): Moderators no other ships; Admins only in admin mode ----
for (const n of ["WatAnn", "WatCid"]) if (!(await g("/game/state", null, n)).body.pilots.length) await g("/game/pilot/create", { name: n + " Pilot" }, n);
{ const pl = await connect("?as=WatAnn"); pl.dev({ cmd: "move", x: 300, y: 300 }); await sleep(300);
  const cm = await connect("?as=WatMod"); cm.dev({ cmd: "move", x: 301, y: 300 }); await sleep(300); cm.send({ t: "view", x: 300, y: 300, w: 50 }); await sleep(500);
  const seen = (c) => (c.last.snap?.ships || []).some((x) => !x.mine);
  t.ok(!seen(cm), "a Moderator sees no other players' ships"); cm.send({ t: "mode", admin: true }); await sleep(400); t.ok(!seen(cm), "not even in admin mode");
  await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [mod]); cm.send({ t: "pilots" }); await sleep(400);
  t.ok(!seen(cm), "an Admin, in player mode, doesn't either"); cm.send({ t: "mode", admin: true }); await sleep(400); t.ok(seen(cm), "in admin mode they do");
  cm.send({ t: "mode", admin: false }); await sleep(400); t.ok(!seen(cm), "and not after");
  const pv = await connect("?as=WatCid"); pv.dev({ cmd: "move", x: 302, y: 300 }); await sleep(300); pv.send({ t: "view", x: 300, y: 300, w: 50 }); await sleep(500); t.ok(seen(pv), "players see each other as before");
  await db.query(`UPDATE users SET role = 'mod' WHERE id = $1`, [mod]); await pl.close(); await cm.close(); await pv.close(); }
await db.end();
t.done();
