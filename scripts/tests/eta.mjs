// (owner, 2026-10-11) the Expanse Transit Authority: its office, fleets, patrols and the response to aggression (driven
// on a World with a fake clock), then an Admin's ETA ship on the PTR (admin mode, cloak, warp-in, hull, locks, chat,
// the red diamonds) and aggression over the socket.
import pg from "../../packages/server/node_modules/pg/lib/index.js";
import { hashSecret } from "../../packages/server/src/hash.js";
import { suite, BASE, connect, sleep } from "./lib.mjs";
const t = suite("eta");
let T = Date.now(); const realNow = Date.now; Date.now = () => T;
const { World } = await import("../../packages/server/src/game/world.js");
const { ETA_OFFICE, READY, STATION_GUARDS, PATROLS, PATROL_PER_POI } = await import("../../packages/server/src/game/eta.js");
const { STATIONS, stationOfPlanet } = await import("../../packages/server/src/game/station.js");
const { planetByKey, systemAt } = await import("../../packages/server/src/game/celestials.js");
const { SHIP_TYPES } = await import("../../packages/server/src/game/constants.js");
const run = (w, sec) => { for (let i = 0; i < sec * 20; i++) { T += 50; w.tick(0.05); } };
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const roles = (w) => w.eta.officers().reduce((a, o) => ((a[o.role + ":" + o.type] = (a[o.role + ":" + o.type] || 0) + 1), a), {});

{ // the office, the fleets
  const w = new World(), off = w.pois.get(ETA_OFFICE.id), mars = planetByKey("mars");
  t.ok(off && off.kind === "office" && systemAt(off.x, off.y) === mars && d(off, mars) > mars.r + 100 && off.field.props[0].office && !off.field.props[0].station, "the ETA Office is a POI in the Mars system, not a station players dock at (owner)");
  const r = roles(w);
  t.ok(r["ready:deputy"] === READY.deputy && r["ready:constable"] === READY.constable && r["ready:magistrate"] === READY.magistrate && READY.deputy === 10 && READY.constable === 5 && READY.magistrate === 2, "10 Deputies, 5 Constables, 2 Magistrates stand ready at the office (owner)", r);
  t.ok(r["guard:magistrate"] === STATIONS.length * STATION_GUARDS && STATION_GUARDS === 3 && STATIONS.every((st) => w.eta.officers().filter((o) => o.role === "guard" && o.post.id === st.id && d(o, st) < 30).length === 3), "3 Magistrates at every NPC station (owner)");
  t.ok(r["patrol:deputy"] === PATROLS, "Deputies on patrol");
  t.ok(w.eta.officers().filter((o) => o.role === "ready").every((o) => d(o, off) < 20), "the ready ones are by the office");
  t.ok(Object.keys(SHIP_TYPES).filter((k) => SHIP_TYPES[k].size).map((k) => SHIP_TYPES[k].name).join() .includes("Deputy,Constable,Magistrate"), "the hulls: Deputy (frigate), Constable (cruiser), Magistrate (battleship)");
  run(w, 200);
  const pat = w.eta.officers().filter((o) => o.role === "patrol"), at = {}; for (const o of pat) if (o.at) at[o.at] = (at[o.at] || 0) + 1;
  t.ok(Math.max(...Object.values(at)) <= PATROL_PER_POI && Object.keys(at).length >= PATROLS / 2, "patrols spread over the POIs, no more than 2 at one (owner)", at);
  const moved = pat.filter((o) => o.wp || o.align || o.moving).length; t.ok(moved > 0, "and move about");
  t.ok(roles(w)["ready:deputy"] === 10 && w.eta.officers().length === 57, "nothing else spawns while all's quiet", roles(w));
  const mar = w.eta.officers().filter((o) => o.role === "guard"); t.ok(mar.every((o) => d(o, o.post) < 40), "guards stay at their stations");
  const orb = w.eta.officers().filter((o) => o.role === "guard" && o.circles), still = w.eta.officers().filter((o) => o.role === "guard" && !o.circles);
  t.ok(orb.length > 0 && still.length > 0 && orb.some((o) => o.moving) && still.every((o) => Math.hypot(o.vx, o.vy) < 0.01), "some orbit, some stay still (owner)");
}

{ // an admin's ETA ship starts as a cloaked Magistrate under their admin name (owner)
  const w = new World({ eta: false }); w.addPlayer("x", "X", () => {}, null, [{ id: 9, name: "Xi", licenses: {} }]);
  const s = w.setAdminShip("x", true, { name: "Warden" });
  t.ok(s && s.type === "adm_magistrate" && s.cloak && s.name === "Warden" && s.pilot === "admin" && w.setAdminShip("x", true) === s, "an admin's ETA ship: a cloaked Magistrate under their admin name, one only");
  t.ok(s.fit.active.every(Boolean) && s.fit.active.includes("warp_scrambler_l2") && s.fit.passive.every(Boolean), "it comes fitted (owner)", s.fit);
  Object.assign(s.holds.cargo, { mining_laser_s1: 1, cargo_upgrade_s1: 1 }); w.cmdFit("x", s.id, "mining_laser_s1", "passive", 0); w.cmdFit("x", s.id, "cargo_upgrade_s1", "active", 0);
  t.ok(s.fit.passive[0] === "mining_laser_s1" && s.fit.active[0] === "cargo_upgrade_s1" && s.calc.holds.cargo > 1000, "its slots take active and passive modules alike, in space (owner)", s.fit);
  s.holds.cargo.coilgun_l2 = 30; for (let i = 1; i < 6; i++) w.cmdFit("x", s.id, "coilgun_l2", "passive", i);
  t.ok(s.fit.passive.filter((k) => k === "coilgun_l2").length === 5, "with no power or disposition limits (owner)");
  w.setAdminShip("x", false); t.ok(!w.ships.has(s.id) && !w.exportState("x").ships.admin, "out of admin mode it's gone (never saved)");
}

{ // aggression and the response
  const w = new World(), notes = [];
  w.addPlayer("a", "A", (m) => notes.push(JSON.parse(m)), null, [{ id: 1, name: "Ann", start: "mars", licenses: {} }]);
  w.addPlayer("b", "B", () => {}, null, [{ id: 2, name: "Bea", start: "mars", licenses: {} }]);
  w.addPlayer("c", "C", () => {}, null, [{ id: 3, name: "Cy", start: "mars", licenses: {} }]);
  run(w, 1);
  const a = w.ships.get("a:ship:1"), b = w.ships.get("b:ship:2"), c = w.ships.get("c:ship:3");
  t.ok(w.aggress(a.id, b.id) && a.crim && a.crim.vs.includes(b.id), "attacking flags the aggressor");
  t.ok(!w.aggress(b.id, a.id) && !b.crim, "the victim responding with force isn't flagged (owner)");
  const units = (s) => [...(w.eta.cases.get(s.id) || { units: [] }).units].map((id) => w.ships.get(id)).filter(Boolean);
  const u1 = units(a); t.ok(u1.length === 3 && u1.every((o) => o.type === "deputy"), "a frigate: one frigate to match plus 2 Deputies (owner)", u1.map((o) => o.type));
  t.ok(u1.every((o) => d(o, w.pois.get(ETA_OFFICE.id)) < 30 || (o.was.role === "patrol" && d(o, a) < 150)) && u1.every((o) => o.was.role !== "guard"), "from patrols at the scene, the rest from the office's ready pool (the Mars Station guards don't match a frigate)", u1.map((o) => o.was));
  run(w, 6); t.ok(roles(w)["ready:deputy"] >= 8, "the office launches replacements", roles(w));
  run(w, 14); t.ok(u1.every((o) => d(o, a) < 25), "they warp in to it", u1.map((o) => Math.round(d(o, a))));
  run(w, 10); t.ok(u1.some((o) => o.targets.some((g) => g.id === a.id && g.locked)) && a.scram && !a.web, "lock it and warp scramble it: Deputies don't web (owner)");
  t.ok(u1.every((o) => o.targets.length <= SHIP_TYPES.deputy.maxTargets) && SHIP_TYPES.deputy.targetRangeKm < 200 && SHIP_TYPES.deputy.lockMs > 0, "officers' locks are limited (owner: unlike admins)");
  notes.length = 0; w.cmdAlign("a", a.id, ETA_OFFICE.id, true); t.ok(notes.some((n) => n.text === "Warp scrambled") && !a.warpReq, "a scrambled ship can't warp", notes);
  notes.length = 0; w.cmdDock("a", a.id, "station:mars"); t.ok(notes.some((n) => n.text === "Docking refused") && !a.dockReq, "an aggressor can't dock (owner)");
  t.ok(w.snapshotFor(w.players.get("a")).ships.find((x) => x.id === a.id).scram === 1, "the snapshot says so");
  // a second aggressor joins in on the victim: its own response, less the officers already at the scene
  const before = w.eta.officers().length;
  t.ok(w.aggress(c.id, b.id), "another ship joining in on the victim is flagged too (owner)");
  const u2 = units(c); run(w, 1);
  t.ok(u2.length === 3 && u2.every((o) => u1.includes(o)) && w.eta.officers().length <= before + 1, "the officers already there take it on: nothing more is sent (owner)", { u2: u2.length, sent: w.eta.officers().length - before });
  // escalation: a dead officer brings 2 more of its kind and 3 Deputies
  const dead = u1[0]; w.eta.officerDown(dead.id, a.id); run(w, 1);
  const u3 = units(a); t.ok(!w.ships.has(dead.id) && u3.length === 2 + 2 + 3, "a dead officer: 2 more of its kind and 3 Deputies (owner)", u3.length);
  // persistent: saved with the ship, hunted again after a relog
  const saved = w.exportState("a"); t.ok(saved.ships[1].crim && saved.ships[1].crim.since, "the flag is saved with the ship (owner: relogs, redeploys)");
  w.pardon(c.id); w.pardon(a.id); run(w, 2); t.ok(!w.eta.cases.size && !a.scram, "pardoned: the officers stand down");
  run(w, 90); t.ok(w.eta.officers().every((o) => o.role !== "respond") && !w.eta.officers().some((o) => o.role === "return"), "and go back (the extra ones into the office)", roles(w));
  t.ok(roles(w)["ready:deputy"] === 10, "the ready pool full again", roles(w));
  const w2 = new World(); w2.addPlayer("a", "A", () => {}, saved, [{ id: 1, name: "Ann", start: "mars", licenses: {} }]); run(w2, 1);
  t.ok(w2.ships.get("a:ship:1").crim && w2.eta.cases.has("a:ship:1"), "after a restart the ETA is after it again (owner)");
  // gone (logged off) a while: they stand down, the flag stays
  w2.removePlayer("a"); w2._purge("a"); run(w2, 125); t.ok(!w2.eta.cases.size, "its ship gone for 2 minutes: the officers stand down");
}

{ // webs, station guards
  const w = new World(); w._damage = () => {}; w.addPlayer("a", "A", () => {}, null, [{ id: 1, name: "Ann", start: "earth", licenses: {} }]); run(w, 1);   // (no one dies here: combat.mjs)
  const a = w.ships.get("a:ship:1"), st = stationOfPlanet("earth"), sp = a.speed;
  a.x = st.x + 30; a.y = st.y; a.tx = a.x; a.ty = a.y; w.aggress(a.id, null);
  const g = w.eta.officers().filter((o) => o.role === "respond" && o.was && o.was.role === "guard");
  t.ok(g.length === 0, "Earth Station's Magistrates don't match a frigate, so they stay put");
  const con = w.eta.officers().find((o) => o.type === "constable" && o.role === "ready"); w.eta.officerDown(con.id, a.id);   // (a Constable killed: two more come)
  run(w, 40);
  t.ok(a.web && a.speed < sp * 0.5, "a Constable's web slows it (owner: cruisers and Magistrates scramble and web)", { web: a.web, speed: a.speed, sp });
  w.pardon(a.id); run(w, 1); t.ok(!a.web && Math.abs(a.speed - sp) < 1e-9, "and lets go");
  // a guard at the scene joins and chases it anywhere; another Magistrate warps in to guard the station (owner)
  for (const o of w.eta.officers()) if (o.role === "ready") w.ships.delete(o.id); w._own = null;
  SHIP_TYPES.chisel.size = "battleship"; w.aggress(a.id, null); SHIP_TYPES.chisel.size = "frigate";
  t.ok(w.eta.cases.get(a.id) && [...w.eta.cases.get(a.id).units].some((id) => w.ships.get(id).role === "respond" && w.ships.get(id).was && w.ships.get(id).was.role === "guard"), "a station's Magistrate at the scene matches a battleship (owner: officers at the scene count)");
  const gd = [...w.eta.cases.get(a.id).units].map((id) => w.ships.get(id)).find((o) => o.was && o.was.role === "guard");
  const guards = () => w.eta.officers().filter((o) => o.role === "guard" && o.post.id === st.id);
  t.ok(guards().length === 3 && guards().some((o) => o.align || o.wp || Math.hypot(o.x - st.x, o.y - st.y) > 100), "another Magistrate warps in to guard the station (owner)", guards().length);
  Object.assign(a, { x: st.x + 400, y: st.y, tx: st.x + 400, ty: st.y }); run(w, 20);
  t.ok(gd.role === "respond" && gd.cases.includes(a.id) && Math.hypot(gd.x - a.x, gd.y - a.y) < 40, "the station's Magistrate chases it far from its station (owner)", { role: gd.role, d: Math.hypot(gd.x - a.x, gd.y - a.y) });
  w.pardon(a.id); run(w, 2); t.ok(gd.role === "return", "standing down with its station guarded again, it goes back into the office");
  w.pardon(a.id);
}

// ---- on the PTR: an Admin's ETA ship ----
Date.now = realNow;
const db = new pg.Pool({ connectionString: "postgres://postgres@127.0.0.1:5433/atamus" });
const g = (path, body, as) => fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", origin: BASE, ...(as ? { "x-ptr-as": as } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }).then(async (r) => ({ status: r.status, body: await r.json() }));
// an Admin (the PTR tester is left out of what staff see on the map): their own panel password and admin profile
const APW = "Eta#Warden2026";
await db.query(`INSERT INTO users (username, password, role) VALUES ('EtaAdm', '!', 'admin') ON CONFLICT (lower(username)) DO UPDATE SET role = 'admin'`);
const me = (await db.query(`SELECT id FROM users WHERE username = 'EtaAdm'`)).rows[0];
await db.query(`UPDATE users SET admin_pw_hash = $2, staff_active_at = now(), promo_pending = NULL, former_staff = false WHERE id = $1`, [me.id, await hashSecret(APW)]);
await g("/game/admin/unlock", { password: APW }, "EtaAdm");
let pr = await g("/game/admin/persona", { name: "EtaWarden", pic: 2 }, "EtaAdm"); if (!pr.body.ok) pr = await g("/game/admin/persona", { name: "EtaWarden" + Math.floor(Math.random() * 900 + 100), pic: 2 }, "EtaAdm");
t.ok(pr.body.ok, "(an Admin with a profile)", pr.body);
if (!(await g("/game/state", null, "EtaAdm")).body.pilots.length) await g("/game/pilot/create", { name: "Eta Adm Pilot" }, "EtaAdm");
if (!(await g("/game/state", null, "EtaBob")).body.pilots.length) await g("/game/pilot/create", { name: "Eta Bob" }, "EtaBob");
const bob = (await db.query(`SELECT id FROM users WHERE username = 'EtaBob'`)).rows[0];
const off = ETA_OFFICE;
const A = await connect("?as=EtaAdm"), B = await connect("?as=EtaBob");
const bobShip = () => B.mine();
B.dev({ cmd: "move", x: off.x - 40, y: off.y }); B.send({ t: "view", x: off.x - 40, y: off.y, w: 200 }); await sleep(600);
t.ok((B.last.snap.ships || []).some((x) => x.npc && x.type === "deputy"), "players see the ETA's ships (owner)");
const npc = B.last.snap.ships.find((x) => x.npc); B.send({ t: "info", kind: "ship", id: npc.id }); await sleep(300);
t.ok(B.last.info && B.last.info.owner === "Expanse Transit Authority", "an ETA ship's Info", B.last.info);
A.send({ t: "mode", admin: true }); await sleep(500);
const adm = () => (A.last.snap.ships || []).find((x) => x.mine && x.pilot === "admin");
A.send({ t: "ahull", hull: "magistrate" }); await sleep(200);
let as = adm(); t.ok(as && as.admin && as.cloak && as.type === "adm_magistrate" && /^EtaWarden/.test(as.name), "admin mode: one more pilot under the admin name, flying a Magistrate, cloaked (owner)", as);
t.ok(!as.id.includes(String(me.id)), "its id doesn't give the account away");
A.dev({ cmd: "move", ship: as.id, x: off.x - 45, y: off.y }); A.send({ t: "view", x: off.x - 40, y: off.y, w: 200 }); await sleep(500);
t.ok(!(B.last.snap.ships || []).some((x) => x.id === as.id), "cloaked, players don't see it (owner)");
A.send({ t: "chat", channel: "local", text: "eta test cloaked", as: "admin" }); await sleep(300);
t.ok(B.last.chat && B.last.chat.text === "eta test cloaked" && !B.last.chat.ships, "its chat bubble is hidden while cloaked (owner)", B.last.chat);
A.send({ t: "lock", ship: as.id, kind: "ship", id: bobShip().id }); await sleep(300);
t.ok((adm().targets || []).some((x) => x.locked && x.id === bobShip().id) && !bobShip().scram, "it can lock while cloaked, but doesn't scramble (owner)", adm().targets);
A.send({ t: "cloak", on: false }); await sleep(200);
let seen = (B.last.snap.ships || []).find((x) => x.id === as.id);
t.ok(seen && seen.wi > 0 && seen.wi <= 2000 && seen.npc && seen.type === "adm_magistrate", "uncloaking: players see it warp in (owner)", seen);
A.send({ t: "move", ship: as.id, x: off.x - 60, y: off.y }); await sleep(300); t.ok(!adm().moving, "anchored while it does (owner: 2 s)");
await sleep(1800); seen = (B.last.snap.ships || []).find((x) => x.id === as.id); t.ok(seen && !seen.wi, "then it's there");
t.ok(bobShip().scram, "uncloaked, it warp scrambles what it has locked (owner)");
B.send({ t: "warp", ship: bobShip().id, poi: "station:mars" }); await sleep(300); t.ok(!bobShip().warpReq, "the scrambled ship can't warp");
A.send({ t: "chat", channel: "local", text: "eta test seen", as: "admin" }); await sleep(300);
t.ok(B.last.chat && B.last.chat.text === "eta test seen" && (B.last.chat.ships || []).includes(as.id), "what the admin says shows over the ship (owner)", B.last.chat);
B.send({ t: "info", kind: "ship", id: as.id }); await sleep(300); t.ok(B.last.info && B.last.info.owner === "Expanse Transit Authority" && B.last.info.pilot === adm().name, "its Info: the ETA, the admin name", B.last.info);
A.send({ t: "ahull", hull: "deputy" }); await sleep(300); as = adm(); t.ok(as.type === "adm_deputy" && SHIP_TYPES.adm_deputy.speedKmps === 0.75, "the admin picks the hull (owner: Deputy 750 m/s)", as.type);
A.send({ t: "ahull", hull: "nope" }); await sleep(200); t.ok(adm().type === "adm_deputy", "(only the three)");
t.ok(SHIP_TYPES.adm_magistrate.speedKmps === 3 && SHIP_TYPES.adm_magistrate.shield === 10000 && SHIP_TYPES.adm_magistrate.hp === 10000 && SHIP_TYPES.adm_magistrate.shieldRep === 1000 && SHIP_TYPES.adm_magistrate.armorDR === 0.99 && SHIP_TYPES.adm_constable.speedKmps === 1.5 && SHIP_TYPES.adm_constable.shieldRep === 500, "the owner's numbers for the admin hulls");
A.send({ t: "cloak", on: true }); await sleep(200);
t.ok(adm().cloak && !bobShip().scram, "cloaked again: no scramble (owner)");
// a red diamond: an open help ticket's player, online
await db.query(`DELETE FROM tickets WHERE username = 'EtaBob'`);
await db.query(`INSERT INTO tickets (user_id, username, subject, category) VALUES ($1, 'EtaBob', 'stuck', 'Gameplay')`, [bob.id]);
await sleep(10_500);
let al = (A.last.snap.alerts || []).find((x) => x.n === "EtaBob");
t.ok(al && Math.abs(al.x - bobShip().x) < 1, "an open help ticket: a red diamond at its player for Admins in admin mode (owner)", A.last.snap.alerts);
t.ok(!B.last.snap.alerts, "players don't get them");
A.send({ t: "warppt", x: al.x, y: al.y }); await sleep(300); t.ok(adm().warp, "the admin ship warps to it");
await db.query(`UPDATE tickets SET category = 'Language' WHERE username = 'EtaBob'`); await sleep(10_500);
t.ok(!(A.last.snap.alerts || []).some((x) => x.n === "EtaBob"), "not for a Language ticket (owner)");
await db.query(`DELETE FROM tickets WHERE username = 'EtaBob'`);
A.send({ t: "mode", admin: false }); await sleep(400); t.ok(!adm(), "out of admin mode, the admin ship is gone");
// aggression over the socket (a PTR dev command until there are weapons)
B.dev({ cmd: "move", x: off.x - 120, y: off.y }); await sleep(300);
B.dev({ cmd: "aggress" }); await sleep(400);
t.ok(bobShip().crim, "a flagged ship (PTR: dev aggress)");
let got = false; for (let i = 0; i < 40 && !got; i++) { await sleep(500); got = !!bobShip().scram; }
t.ok(got, "the ETA comes and scrambles it");
B.send({ t: "dock", ship: bobShip().id, where: "station:mars" }); await sleep(300); t.ok(!bobShip().dockReq, "it can't dock");
B.dev({ cmd: "pardon" }); await sleep(400); t.ok(!bobShip().crim, "pardoned");
await A.close(); await B.close(); await db.end();
t.done();
