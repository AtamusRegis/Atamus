// Critter Courier (owner, 2026-11-11: the game remade from the design document): a WebSocket at /pets.
// The server decides everything that matters; the page shows it and asks: grab, kick, equip, buy a level, use a coupon,
// hatch an egg, buy an upgrade, use a shortcut.
// - Accounts: username / password (or a remembered token); each courier's data (coins, mounts, eggs, coupons, upgrades,
//   the Stamp Meter, stats, settings) is kept here and saved to the store (petstore.js) every minute, when they leave,
//   and at once after a purchase or a hatch.
// - Rooms of up to 100 sharing one town: where everyone is (10 times a second, stamped with the server's clock), which
//   mount they ride, the parcel on their saddle.
// - The conveyor (each courier's own Ready and Next parcels), deliveries (checked here: the right mailbox, an unbroken
//   parcel), reward rolls and the Stamp Meter, parcel damage, kicks, dogs, geese, goats, falling rocks, sky geese, the
//   sewer pipe's goose and falling off the islands.
// - Chat, parties and the staff panel.
// Connections that go quiet are dropped; logging in again replaces the old connection. A new website build reloads
// everyone onto it.
import { WebSocketServer } from "ws";
import * as W from "./pets-world.js";
import { onWebsiteUpdate, websiteBuild, websiteBy } from "./build.js";
import { hashSecret, verifySecret } from "./hash.js";
import { memStore } from "./petstore.js";

const { cleanData, MOUNTS, EGGS, UPGRADES, TIERS, KICK, DOG, GOOSE, GOAT, ROCK, SKYGOOSE, PIPE, ISLES, CANNON, hyp, clamp } = W;
const ROOM_MAX = 100, TICK_MS = 50, CHAT_GAP_MS = 1200, BEAT_MS = 10000, SAVE_MS = 60000, INVITE_MS = 30000, PARTY_MAX = 6, SPEED_CAP = 60, DROP_S = 20;
const EXPRESS_EXTRA = [0, 0, 8, 40, 45];   // seconds on top for the districts whose roads wind
const rooms = [], online = new Map();   // account id -> player
let nextId = 1;

const cleanChat = (s) => String(s || "").replace(/[\p{C}<>]/gu, "").replace(/\s+/g, " ").trim().slice(0, 120);
const num = (v, lim) => (Number.isFinite(+v) ? Math.max(-lim, Math.min(lim, +v)) : 0);
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
// staff: Nyssary is always admin and the only one who makes or removes admins; admins make moderators and give things;
// moderators (and up) mute, kick and ban those below them
const OWNER = "nyssary", RANK = { player: 0, moderator: 1, admin: 2 };
const rankOf = (a) => (a.name.toLowerCase() === OWNER ? 3 : RANK[a.role] || 0);
const between = ([a, b]) => a + Math.random() * (b - a);

function makeRoom() {
  const r = { players: new Map(), last: Date.now(), tick: 0, slow: 0, rocks: [], dives: [] };
  r.dogs = W.dogs.map((d) => ({ id: d.id, x: d.hx, z: d.hz, y: d.y, yaw: 0, mode: 0, t: 0, target: null, cool: 0, pause: 0, stuck: 0, awake: false }));
  r.geese = W.geese.map((g) => ({ id: g.id, x: g.x, z: g.z, y: g.y, yaw: 0, mode: 0, t: 0, target: null, carry: null, wx: g.x, wz: g.z, awake: false }));
  r.goats = W.goats.map((g) => ({ id: g.id, x: g.hx, z: g.hz, y: g.y, yaw: Math.PI / 2, mode: 0, t: 0, dx: 0, dz: 0, cool: 0, stuck: 0, awake: false }));
  return r;
}
function roomFor() { let r = rooms.find((q) => q.players.size < ROOM_MAX); if (!r) { r = makeRoom(); rooms.push(r); } return r; }
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const all = (r, o, skip) => { const s = JSON.stringify(o); for (const p of r.players.values()) if (p !== skip && p.ws.readyState === 1) p.ws.send(s); };
const mountOf = (p) => { const d = p.acct.data; return d.mounts.find((m) => m.id === d.ride) || d.mounts[0]; };
const statsOf = (p) => { const m = mountOf(p); return W.mountStats(m.sp, m.lv); };
const pub = (p) => { const m = mountOf(p), d = p.acct.data; return { id: p.id, name: p.name, sp: m.sp, lv: m.lv, va: m.va, shirt: d.set.shirt, rank: W.rankOf(W.upTotal(d.up)), friendly: d.set.friendly, x: p.x, y: p.y, z: p.z, yaw: p.yaw, carry: p.bag.map((q) => [q.tier, q.mod]) }; };
const parcelView = (q) => (q ? { pid: q.pid, tier: q.tier, mod: q.mod, dur: q.dur, max: q.max, hits: q.hits, house: q.house, due: q.due } : null);
const dogView = (d) => [d.id, r1(d.x), r1(d.z), r2(d.yaw), d.mode, r1(d.y)], gooseView = (g) => [g.id, r1(g.x), r1(g.z), r1(g.y), r2(g.yaw), g.mode, g.carry ? g.carry.parcel.tier : -1], goatView = (g) => [g.id, r1(g.x), r1(g.z), r2(g.yaw), g.mode];

export function attachPets(server, { origins = [], allowLocal = false, store = memStore() } = {}) {
  // ---- saving ----
  const dirty = new Set();
  const flush = async (acct) => { dirty.delete(acct); try { await store.save(acct.id, acct.data, acct.rev); } catch (e) { console.error("[pets] save", e.message); dirty.add(acct); } };
  setInterval(() => { for (const a of [...dirty]) flush(a); }, SAVE_MS).unref();
  const changed = (p) => { p.acct.rev++; dirty.add(p.acct); };
  const pushData = (p) => send(p.ws, { t: "data", data: p.acct.data });
  const showMount = (p) => { const m = mountOf(p); all(p.room, { t: "mount", id: p.id, sp: m.sp, lv: m.lv, va: m.va }, p); };

  // ---- parcels ----
  const fillBelt = (p) => { const up = p.acct.data.up, lv = mountOf(p).lv; if (!p.ready) { p.ready = p.next || W.rollParcel(up, lv); p.next = null; } if (!p.next) p.next = W.rollParcel(up, lv); send(p.ws, { t: "belt", ready: p.ready, next: p.next }); };
  // (owner, 2026-11-11) a mount carries 1 to 5 parcels by its level: p.bag (on the saddle), p.stolen (geese have them), p.dropped (on the ground after a busted goose)
  const carry = (p) => all(p.room, { t: "carry", id: p.id, c: p.bag.map((q) => [q.tier, q.mod]) }, p);
  const held = (p) => p.bag.length + p.stolen.length + p.dropped.length;
  const pick1 = (a) => a[Math.floor(Math.random() * a.length)];
  // everything about my parcels, after any change; ev says what happened
  const sendBag = (p, ev) => send(p.ws, { t: "bag", bag: p.bag.map(parcelView), stolen: p.stolen.map((q) => ({ ...parcelView(q), goose: q.goose })), dropped: p.dropped.map((o) => ({ ...parcelView(o.parcel), x: r1(o.x), y: r1(o.y), z: r1(o.z) })), cap: W.bagSize(mountOf(p).lv), ev });
  const drop = (a, q) => { const n = a.indexOf(q); if (n >= 0) a.splice(n, 1); };
  function lose(p, why, q) {   // a parcel is gone (broken, stolen for good)
    drop(p.bag, q); drop(p.stolen, q); const o = p.dropped.find((k) => k.parcel === q); if (o) drop(p.dropped, o);
    const d = p.acct.data; d.fails = Math.min(99, d.fails + 1); changed(p);
    sendBag(p, { k: "lost", why, pid: q.pid }); carry(p); all(p.room, { t: "fx", k: "break", id: p.id, x: r1(p.x), y: r1(p.y), z: r1(p.z) }, p);
  }
  function hit(p, why) {   // one hit to one of the parcels on the saddle: a durability pip and 20% of its payout
    const q = pick1(p.bag); if (!q) return;
    q.dur--; q.hits++;
    if (q.dur <= 0) return lose(p, "broke", q);
    sendBag(p, { k: "crack", why, pid: q.pid }); all(p.room, { t: "fx", k: "crack", id: p.id }, p);
  }
  function stun(p, secs, why) {
    const s = secs * (1 - statsOf(p).grip); p.stunUntil = Date.now() + s * 1000;
    send(p.ws, { t: "stun", s, why }); all(p.room, { t: "fx", k: "stun", id: p.id, s }, p);
  }
  function grab(p) {
    const now = Date.now(), d = p.acct.data, lv = mountOf(p).lv; if (held(p) >= W.bagSize(lv) || !p.ready || now < p.stunUntil || W.counterDist(p.x, p.z) > W.GRAB_R + 1.2 || Math.abs(p.y) > 3) return;
    const c = p.ready, hs = W.housesIn(c.tier), h = hs[Math.floor(Math.random() * hs.length)], max = c.mod === "fragile" ? 1 : W.boxDur(d.up.boxes);
    const q = { pid: ++p.pids, tier: c.tier, mod: c.mod, dur: max, max, hits: 0, house: h.id, t0: now, due: c.mod === "express" ? now + 1000 * (Math.max(W.EXPRESS_MIN, hyp(h.mx, h.mz) * W.EXPRESS_PER_M) + EXPRESS_EXTRA[c.tier]) : 0 };
    p.bag.push(q); p.ready = null; sendBag(p, { k: "grab", pid: q.pid }); carry(p); fillBelt(p);
  }
  // (owner, 2026-11-11) a delivery pays its coins and leaves a gift of a rarity rolled now; what's inside is decided when
  // it's opened. Four unopened gifts of one rarity merge into one of the next.
  function deliver(p, q) {
    const d = p.acct.data, m = mountOf(p), now = Date.now(), late = q.mod === "express" && now > q.due;
    const coins = W.deliveryCoins(q.tier, q.mod, d.up.payout, q.hits, late), roll = W.rewardRoll(q.tier, q.mod, d.up, d.stamp), xp = 5 + 3 * q.tier;
    const lvUp = W.addXp(m, xp);
    d.coins += coins; d.stamp = roll.stamp; d.stats.del++; if (q.mod === "golden") d.stats.golden++; d.fails = 0;
    const gift = { gid: d.nextGid++, r: roll.tier, pt: q.tier };
    // a courier's second delivery brings a new mount (a random Uncommon), revealed when that gift is opened
    if (d.stats.del === 2 && d.mounts.length < W.MOUNT_CAP) { const pool = Object.keys(MOUNTS).filter((k) => MOUNTS[k].r === 1), nm = { id: d.nextId++, sp: pool[Math.floor(Math.random() * pool.length)], va: 0, lv: 1, xp: 0 }; d.mounts.push(nm); gift.m = nm.id; }
    d.gifts.push(gift); const merges = W.mergeGifts(d.gifts, () => d.nextGid++);
    const over = d.gifts.length > W.GIFT_CAP ? d.gifts.slice(0, d.gifts.length - W.GIFT_CAP) : [];   // too many waiting: the oldest open by themselves
    if (over.length) openGifts(p, over.map((g) => g.gid), true);
    drop(p.bag, q); changed(p); flush(p.acct);
    send(p.ws, { t: "delivered", pid: q.pid, house: q.house, coins, xp, gift, near: roll.near, merges, lvUp, data: d });
    sendBag(p, { k: "delivered", pid: q.pid });
    all(p.room, { t: "fx", k: "del", id: p.id, house: q.house, roll: roll.tier }, p); carry(p);
    if (lvUp) { showMount(p); sendBag(p, { k: "mount" }); }
  }
  function openGifts(p, gids, quiet) {   // open these gifts: roll what's inside each and add it
    const d = p.acct.data, m = mountOf(p), list = []; let lvUp = 0;
    for (const gid of new Set(gids)) {
      const g = d.gifts.find((k) => k.gid === gid); if (!g) continue; d.gifts.splice(d.gifts.indexOf(g), 1);
      const c = W.giftContents(g.r, g.pt, d.up); d.coins += c.coins; d.coupons += c.coupons; if (c.egg) d.eggs[c.egg]++; lvUp += W.addXp(m, c.xp);
      const mount = g.m ? d.mounts.find((k) => k.id === g.m) || null : null; list.push({ gid, r: g.r, ...c, mount });
    }
    if (!list.length) return; changed(p); flush(p.acct);
    if (!quiet) send(p.ws, { t: "opened", list, lvUp, data: d });
    if (lvUp) { showMount(p); sendBag(p, { k: "mount" }); }
  }
  const kickable = (me, x, z, y, extra = 0) => { const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw), dx = x - me.x, dz = z - me.z, along = dx * fx + dz * fz; return Math.abs(y - me.y) < 2.6 && along > -0.6 && along < KICK.range + extra && Math.abs(dx * fz - dz * fx) < KICK.half + 0.9 + extra; };
  function kick(me) {
    const now = Date.now(), r = me.room; if (now < me.kickAt + KICK.cd * 1000 - 150 || now < me.stunUntil) return;
    me.kickAt = now; let landed = false; const d = me.acct.data;
    if (!W.inSafeZone(me.x, me.z, me.y)) {
      if (!d.set.friendly) for (const p of r.players.values()) {
        if (p === me || p.acct.data.set.friendly || (me.party && me.party === p.party) || W.inSafeZone(p.x, p.z, p.y) || now < p.graceUntil || now < p.stunUntil || !kickable(me, p.x, p.z, p.y)) continue;
        landed = true; stun(p, KICK.stun, "kick"); p.graceUntil = p.stunUntil + KICK.grace * 1000; all(r, { t: "fx", k: "grace", id: p.id, s: (p.graceUntil - now) / 1000 });
        if (now - (p.cracked.get(me.acct.id) || 0) > KICK.farm * 1000) { p.cracked.set(me.acct.id, now); hit(p, "kick"); }   // the same courier cracks your parcel once in 30 s
      }
      for (const g of r.geese) if (g.mode !== 4 && kickable(me, g.x, g.z, g.y, 0.5)) {
        landed = true;
        if (g.carry) {   // GOOSE BUSTED: the parcel drops where it stands, whole
          const o = g.carry.p, q = g.carry.parcel; drop(o.stolen, q); o.dropped.push({ parcel: q, x: g.x, z: g.z, y: g.y, until: now + DROP_S * 1000 }); g.carry = null;
          sendBag(o, { k: "dropped", pid: q.pid }); d.stats.geese++;
          all(r, { t: "fx", k: "busted", id: me.id, x: r1(g.x), y: r1(g.y), z: r1(g.z) });
        }
        g.mode = 4; g.t = 3; g.target = null;
      }
      for (const q of r.dogs) if (q.mode !== 3 && kickable(me, q.x, q.z, q.y, 0.4)) { landed = true; q.mode = 3; q.target = null; q.cool = now + DOG.cool * 1000; all(r, { t: "fx", k: "yelp", dog: q.id }); }
      for (const g of r.goats) if (kickable(me, g.x, g.z, W.goats[g.id].y, 0.4)) { landed = true; g.mode = 3; g.cool = now + GOAT.cool * 1000; }
    }
    if (landed) { d.stats.kicks++; changed(me); }
    all(r, { t: "fx", k: "kick", id: me.id, hit: landed ? 1 : 0 });
  }
  function bark(me) {   // the Bark ability: dogs near turn tail
    const m = mountOf(me), tier = W.abilityTier(m.lv), now = Date.now(); if (MOUNTS[m.sp].ab !== "bark" || !tier || now < me.abilityAt + W.ABILITY_CD.bark[tier] * 1000 - 150) return;
    me.abilityAt = now; const R = 7 + 3.5 * tier;
    for (const q of me.room.dogs) if (q.mode !== 3 && hyp(q.x - me.x, q.z - me.z) < R) { q.mode = 3; q.target = null; q.cool = now + DOG.cool * 1000; all(me.room, { t: "fx", k: "yelp", dog: q.id }); }
    all(me.room, { t: "fx", k: "bark", id: me.id, r: R });
  }
  function teleport(p, x, z, y, why) { p.x = x; p.z = z; p.y = y; p.tpAt = Date.now(); p.lx = x; p.lz = z; p.lt = p.tpAt; send(p.ws, { t: "tp", x, z, y, why }); }

  // ---- parties ----
  const invites = new Map();   // "to:from" -> expiry
  function sendParty(party) { const ms = [...party.members].map((q) => ({ id: q.id, name: q.name })); for (const q of party.members) send(q.ws, { t: "party", members: ms }); }
  function leaveParty(p) {
    const party = p.party; if (!party) return; party.members.delete(p); p.party = null; send(p.ws, { t: "party", members: [] });
    if (party.members.size < 2) { for (const q of party.members) { q.party = null; send(q.ws, { t: "party", members: [] }); } } else sendParty(party);
  }
  // ---- the staff panel ----
  const staffView = (a, p) => ({ id: a.id, name: a.name, role: rankOf(a) === 3 ? "owner" : a.role, online: !!p, muted: a.muteUntil > Date.now() ? (a.muteUntil === Infinity ? -1 : a.muteUntil) : 0, banned: a.banUntil > Date.now() ? (a.banUntil === Infinity ? -1 : a.banUntil) : 0 });
  const inv = (d) => ({ coins: d.coins, coupons: d.coupons, eggs: d.eggs, mounts: d.mounts, ride: d.ride, up: d.up, stamp: d.stamp });
  async function admin(me, m) {
    const my = rankOf(me.acct); if (my < 1) return;
    const reply = (msg) => send(me.ws, { t: "admin_msg", msg });
    if (m.op === "list") {
      const list = [...online.values()].map((p) => staffView(p.acct, p));
      if (m.q && /^[A-Za-z0-9_]{1,16}$/.test(m.q)) for (const a of await store.search(m.q)) if (!online.has(a.id)) list.push(staffView(a, null));
      send(me.ws, { t: "admin_list", list, q: m.q || "" }); return;
    }
    // the target: by account id (the panel) or by name
    const nm = typeof m.name === "string" && NAME_RE.test(m.name) ? m.name.toLowerCase() : null;
    const p = nm ? [...online.values()].find((q) => q.name.toLowerCase() === nm) : online.get(+m.id), a = p ? p.acct : nm ? await store.byName(nm) : await store.byId(+m.id);
    if (!a) return reply("Not found");
    const theirs = rankOf(a);
    if (theirs >= my && a.id !== me.acct.id) return reply("Not allowed");
    const log = (action, detail) => { store.log(me.name, a.name, action, detail).catch(() => {}); console.log(`[pets] ${me.name} ${action} ${a.name} ${detail || ""}`); };
    const putData = async (d) => { a.data = cleanData(d); if (p) { changed(p); pushData(p); flush(p.acct); showMount(p); all(p.room, { t: "rank", id: p.id, rank: W.rankOf(W.upTotal(a.data.up)) }); } else { a.rev++; await store.save(a.id, a.data, a.rev); } };
    const until = (mins) => (mins === "perma" ? Infinity : Date.now() + Math.max(1, Math.min(525600, +mins || 60)) * 60000);
    switch (m.op) {
      case "role": {
        const role = RANK[m.role] !== undefined ? m.role : null; if (!role || a.id === me.acct.id) return reply("Not allowed");
        if (my < 3 && (role === "admin" || a.role === "admin" || my < 2)) return reply("Not allowed");   // only the owner makes / removes admins; admins make moderators
        a.role = role; await store.setRole(a.id, role); if (p) send(p.ws, { t: "role", role }); log("role", role); break;
      }
      case "mute": { const u = m.mins === "off" ? 0 : until(m.mins); a.muteUntil = u; await store.setMute(a.id, u); if (p) send(p.ws, { t: "muted", until: u === Infinity ? -1 : u }); log("mute", String(m.mins)); break; }
      case "kick": if (p) { send(p.ws, { t: "kicked", why: "kick" }); p.ws.terminate(); } log("kick"); break;
      case "ban": {
        const u = m.mins === "off" ? 0 : until(m.mins); a.banUntil = u; await store.setBan(a.id, u);
        if (u && p) { send(p.ws, { t: "kicked", why: "banned", until: u === Infinity ? -1 : u }); p.ws.terminate(); }
        log("ban", String(m.mins)); break;
      }
      case "give": {   // admins: coins, Level Coupons, an egg or a mount
        if (my < 2) return reply("Not allowed");
        const n = Math.max(1, Math.min(1e7, Math.floor(+m.n || 1))), what = String(m.what || ""), d = cleanData(a.data);
        if (what === "coins") d.coins += n;
        else if (what === "coupons") d.coupons += n;
        else if (what.startsWith("egg:") && EGGS[what.slice(4)]) d.eggs[what.slice(4)] += n;
        else if (what.startsWith("mount:") && MOUNTS[what.slice(6)]) { const lv = clamp(Math.floor(+m.lv || 1), 1, W.MAX_LV), va = clamp(Math.floor(+m.va || 0), 0, 2); for (let k = 0; k < Math.min(n, 20) && d.mounts.length < W.MOUNT_CAP; k++) d.mounts.push({ id: d.nextId++, sp: what.slice(6), va, lv, xp: 0 }); }
        else return reply("Unknown");
        await putData(d); log("give", what + " x" + n); break;
      }
      // admins' quick commands, on themselves or anyone below them
      case "quick": {
        if (my < 2) return reply("Not allowed");
        const cmd = String(m.cmd || ""), every = cmd === "everything";
        if (!["coins", "allmounts", "maxlv", "eggs", "coupons", "upgrades", "everything", "reset"].includes(cmd)) return reply("Unknown");
        let d = cleanData(a.data);
        if (cmd === "reset") d = cleanData({ set: d.set });
        if (cmd === "coins" || every) d.coins = Math.min(1e12, d.coins + (every ? 1e7 : Math.max(1, Math.min(1e9, Math.floor(+m.n || 0)))));
        if (cmd === "allmounts" || every) { const have = new Set(d.mounts.map((q) => q.sp)); for (const sp of Object.keys(MOUNTS)) if (!have.has(sp)) d.mounts.push({ id: d.nextId++, sp, va: 0, lv: every ? W.MAX_LV : 1, xp: 0 }); }
        if (cmd === "maxlv" || every) for (const q of d.mounts) { q.lv = W.MAX_LV; q.xp = 0; }
        if (cmd === "eggs" || every) for (const k of Object.keys(EGGS)) d.eggs[k] += 10;
        if (cmd === "coupons" || every) d.coupons += 20;
        if (cmd === "upgrades" || every) for (const k of Object.keys(UPGRADES)) d.up[k] = W.UP_MAX;
        await putData(d); log("quick", cmd + (cmd === "coins" ? " " + m.n : "")); break;
      }
      case "inspect": { if (my < 2) return reply("Not allowed"); send(me.ws, { t: "admin_data", id: a.id, name: a.name, data: inv(cleanData(a.data)) }); return; }
      case "edit": {   // coins, coupons, eggs, upgrades, and each mount's level (0 takes it away)
        if (my < 2) return reply("Not allowed");
        const d = cleanData(a.data), n = (v, hi) => Math.max(0, Math.min(hi, Math.floor(+v) || 0));
        if (m.coins !== undefined) d.coins = n(m.coins, 1e12);
        if (m.coupons !== undefined) d.coupons = n(m.coupons, 1e6);
        if (m.eggs && typeof m.eggs === "object") for (const k of Object.keys(EGGS)) if (m.eggs[k] !== undefined) d.eggs[k] = n(m.eggs[k], 9999);
        if (m.up && typeof m.up === "object") for (const k of Object.keys(UPGRADES)) if (m.up[k] !== undefined) d.up[k] = n(m.up[k], W.UP_MAX);
        if (m.mounts && typeof m.mounts === "object") {
          for (const q of d.mounts) if (m.mounts[q.id] !== undefined) q.lv = Math.floor(+m.mounts[q.id]) || 0;
          const keep = d.mounts.filter((q) => q.lv > 0); if (keep.length) d.mounts = keep; else for (const q of d.mounts) q.lv = Math.max(1, q.lv);
        }
        await putData(d); log("edit", JSON.stringify({ coins: m.coins, coupons: m.coupons, eggs: m.eggs, up: m.up, mounts: m.mounts }).slice(0, 300));
        send(me.ws, { t: "admin_data", id: a.id, name: a.name, data: inv(a.data) });
        break;
      }
      default: return;
    }
    reply("Done");
    admin(me, { op: "list", q: m.q }).catch(() => {});
  }

  const wss = new WebSocketServer({
    server, path: "/pets", maxPayload: 65536,
    verifyClient: ({ origin }) => !origin || origins.includes(origin) || (allowLocal && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)),
  });
  wss.on("connection", (ws) => {
    let me = null, room = null, busy = false, lastAuth = 0;
    ws.alive = true; ws.on("pong", () => (ws.alive = true));
    const authErr = (why, until) => send(ws, { t: "auth_err", why, until });
    async function auth(m) {
      const now = Date.now(); if (busy || now - lastAuth < 800) return; busy = true; lastAuth = now;
      try {
        let acct = null, token = null;
        if (m.t === "resume") { const id = await store.tokenAccount(m.token); if (!id) return authErr("expired"); acct = await store.byId(id); token = m.token; }
        else {
          const user = String(m.user || "").trim(), pass = String(m.pass || "");
          if (!NAME_RE.test(user)) return authErr("name");
          if (pass.length < 4 || pass.length > 64) return authErr("pass");
          if (m.t === "register") {
            acct = await store.create(user, await hashSecret(pass), cleanData({}));
            if (!acct) return authErr("taken");
          } else {
            acct = await store.byName(user);
            if (!acct || !(await verifySecret(pass, acct.pass))) return authErr("wrong");
          }
          token = await store.tokenFor(acct.id);
        }
        if (!acct || ws.readyState !== 1) return;
        if (acct.banUntil > Date.now()) return authErr("banned", acct.banUntil === Infinity ? -1 : acct.banUntil);
        if (acct.name.toLowerCase() === OWNER && acct.role !== "admin") { acct.role = "admin"; store.setRole(acct.id, "admin"); }
        const fresh = !acct.data || !acct.data.v;   // an account from before the remake starts as a new courier
        acct.data = cleanData(acct.data); if (fresh) { acct.rev++; dirty.add(acct); }
        const old = online.get(acct.id);
        if (old) { send(old.ws, { t: "kicked" }); old.ws.terminate(); gone(old); acct = old.acct; }   // logged in again: the old connection goes
        room = roomFor();
        me = { id: nextId++, ws, room, acct, name: acct.name, x: W.SPAWN.x + (Math.random() - 0.5) * 8, y: 0, z: W.SPAWN.z + Math.random() * 4, yaw: Math.PI, mv: 0, ct: 0, vx: 0, vz: 0, lx: 0, lz: 0, lt: 0, tpAt: now, flags: 0, sus: 0,
          lastChat: 0, party: null, ready: null, next: null, bag: [], stolen: [], dropped: [], pids: 0, stunUntil: 0, graceUntil: 0, kickAt: 0, abilityAt: 0, cracked: new Map(), lastIsle: -1, nextRock: 0, nextDive: 0, pipeAt: 0 };
        me.lx = me.x; me.lz = me.z; me.lt = now;
        online.set(acct.id, me);
        send(ws, { t: "welcome", web: websiteBuild(), by: websiteBy(), now, id: me.id, name: me.name, role: rankOf(acct) >= 2 ? "admin" : acct.role, token, data: acct.data, x: me.x, z: me.z, players: [...room.players.values()].map(pub),
          dogs: room.dogs.map(dogView), geese: room.geese.map(gooseView), goats: room.goats.map(goatView) });
        room.players.set(me.id, me);
        all(room, { t: "join", p: pub(me) }, me);
        fillBelt(me); sendBag(me, { k: "mount" });
      } catch (e) { console.error("[pets] auth", e.message); authErr("server"); }
      finally { busy = false; }
    }
    function gone(p) {
      if (p.gone) return; p.gone = true;
      leaveParty(p);
      const r = p.room; if (r && r.players.get(p.id) === p) {
        for (const g of r.geese) { if (g.carry && g.carry.p === p) g.carry = null; if (g.target === p) { g.target = null; g.mode = 0; } }
        for (const d of r.dogs) if (d.target === p) { d.target = null; d.mode = 3; }
        r.players.delete(p.id); all(r, { t: "leave", id: p.id });
        if (!r.players.size) rooms.splice(rooms.indexOf(r), 1);
      }
      if (online.get(p.acct.id) === p) { online.delete(p.acct.id); flush(p.acct); }
    }
    ws.on("message", (raw) => {
      ws.alive = true;
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!me) { if (m.t === "login" || m.t === "register" || m.t === "resume") auth(m); return; }
      if (me.gone) return;
      const d = me.acct.data, now = Date.now();
      switch (m.t) {
        // each position carries the sender's own clock, passed on so others replay it at its true pace
        case "pos": {
          if (now - me.tpAt < 250) break;   // still on its way from before a teleport
          const x = num(m.x, 2000), y = num(m.y, 400), z = num(m.z, 2000), dt = (now - me.lt) / 1000;
          if (dt > 0.2) {   // the speed cap: far faster than anything in town moves
            const v = hyp(x - me.lx, z - me.lz) / dt; me.vx = (x - me.lx) / dt; me.vz = (z - me.lz) / dt;
            if (v > SPEED_CAP && now - me.tpAt > 1500) { me.flags++; me.sus = now; }
            me.lx = x; me.lz = z; me.lt = now;
          }
          me.x = x; me.y = y; me.z = z; me.yaw = num(m.yaw, 10); me.mv = clamp(m.mv | 0, 0, 255); me.ct = Number.isFinite(+m.ct) ? +m.ct : 0; me.fresh = true;
          const n = W.isleAt(x, z); if (n >= 0 && Math.abs(y - ISLES[n].y) < 3) me.lastIsle = n;
          break;
        }
        case "grab": grab(me); break;
        case "open": if (Array.isArray(m.gids)) openGifts(me, m.gids.slice(0, W.GIFT_CAP).map((g) => +g)); break;
        case "kick": kick(me); break;
        case "ability": bark(me); break;
        case "equip": { const q = d.mounts.find((k) => k.id === m.id); if (q && d.ride !== q.id) { d.ride = q.id; changed(me); pushData(me); showMount(me); sendBag(me, { k: "mount" }); } break; }
        case "level": {   // pay coins for a level
          const q = d.mounts.find((k) => k.id === m.id); if (!q || q.lv >= W.MAX_LV || d.coins < W.levelCost(q.lv)) break;
          d.coins -= W.levelCost(q.lv); q.lv++; if (q.lv >= W.MAX_LV) q.xp = 0; changed(me); flush(me.acct); send(ws, { t: "leveled", id: q.id, lv: q.lv, data: d }); if (q.id === d.ride) { showMount(me); sendBag(me, { k: "mount" }); } break;
        }
        case "coupon": {   // a Level Coupon: one whole level
          const q = d.mounts.find((k) => k.id === m.id); if (!q || q.lv >= W.MAX_LV || d.coupons < 1) break;
          d.coupons--; q.lv++; if (q.lv >= W.MAX_LV) q.xp = 0; changed(me); flush(me.acct); send(ws, { t: "leveled", id: q.id, lv: q.lv, data: d }); if (q.id === d.ride) { showMount(me); sendBag(me, { k: "mount" }); } break;
        }
        case "hatch": {
          const kind = EGGS[m.kind] ? m.kind : ""; if (!kind || d.eggs[kind] < 1 || d.mounts.length >= W.MOUNT_CAP) break;
          const h = W.hatchEgg(kind), q = { id: d.nextId++, sp: h.sp, va: h.va, lv: 1, xp: 0 };
          d.eggs[kind]--; d.mounts.push(q); changed(me); flush(me.acct); send(ws, { t: "hatched", kind, m: q, data: d });
          if (q.va) { const s = JSON.stringify({ t: "announce", name: me.name, sp: q.sp, va: q.va }); for (const p of online.values()) if (p.ws.readyState === 1) p.ws.send(s); }   // the whole server hears of a Shiny or a Golden
          break;
        }
        case "upgrade": {
          const k = UPGRADES[m.k] ? m.k : ""; if (!k || d.up[k] >= W.UP_MAX || d.coins < W.upgradeCost(k, d.up[k])) break;
          d.coins -= W.upgradeCost(k, d.up[k]); d.up[k]++; changed(me); flush(me.acct); send(ws, { t: "upgraded", k, lv: d.up[k], data: d });
          all(room, { t: "rank", id: me.id, rank: W.rankOf(W.upTotal(d.up)) }); break;
        }
        case "set": {   // settings: Friendly, the volumes, the shirt
          const s = d.set, was = s.friendly, shirt = s.shirt;
          if (typeof m.friendly === "boolean") s.friendly = m.friendly;
          if (Number.isFinite(+m.music)) s.music = clamp(Math.floor(+m.music), 0, 10);
          if (Number.isFinite(+m.sfx)) s.sfx = clamp(Math.floor(+m.sfx), 0, 10);
          if (/^#[0-9a-f]{6}$/i.test(m.shirt)) s.shirt = m.shirt;
          changed(me); if (was !== s.friendly || shirt !== s.shirt) all(room, { t: "look", id: me.id, friendly: s.friendly, shirt: s.shirt }, me); break;
        }
        case "pipe": {   // the sewer pipe: in one end, out the other; a goose inside costs a hit
          if (now < me.stunUntil || now - me.pipeAt < 2000) break;
          const a = hyp(me.x - PIPE.a.x, me.z - PIPE.a.z) < PIPE.r + 1.5 && Math.abs(me.y - PIPE.a.y) < 2, b = hyp(me.x - PIPE.b.x, me.z - PIPE.b.z) < PIPE.r + 1.5 && Math.abs(me.y - PIPE.b.y) < 2; if (!a && !b) break;
          me.pipeAt = now + PIPE.time * 1000; const out = a ? PIPE.b : PIPE.a, goose = W.pipeGoose(now / 1000);
          me.x = out.x; me.z = out.z; me.y = out.y; me.tpAt = now + PIPE.time * 1000; me.lx = out.x; me.lz = out.z; me.lt = me.tpAt;
          send(ws, { t: "piped", x: out.x, z: out.z, y: out.y, s: PIPE.time, goose }); all(room, { t: "fx", k: "pipe", id: me.id, s: PIPE.time }, me);
          if (goose) hit(me, "pipe"); break;
        }
        case "balloon": { const b = W.balloons.find((q) => hyp(me.x - q.x, me.z - q.z) < 4 && Math.abs(me.y - q.y) < 3); if (b && now >= me.stunUntil) teleport(me, W.SPAWN.x, W.SPAWN.z + 6, 0, "balloon"); break; }
        case "chat": {
          const text = cleanChat(m.text); if (!text || now - me.lastChat < CHAT_GAP_MS) break;
          if (me.acct.muteUntil > now) { send(ws, { t: "muted", until: me.acct.muteUntil === Infinity ? -1 : me.acct.muteUntil }); break; }
          me.lastChat = now; all(room, { t: "chat", id: me.id, name: me.name, text }, me); break;
        }
        case "invite": { const to = room.players.get(m.id); if (!to || to === me || (me.party && me.party === to.party)) break; invites.set(`${to.id}:${me.id}`, now + INVITE_MS); send(to.ws, { t: "invited", from: me.id, name: me.name }); break; }
        case "answer": {
          const key = `${me.id}:${m.from}`, exp = invites.get(key); invites.delete(key);
          const from = room.players.get(m.from); if (!from || !exp || exp < now || !m.yes) { if (from) send(from.ws, { t: "declined", name: me.name }); break; }
          if (me.party && me.party !== from.party) leaveParty(me);
          const party = from.party || (from.party = { members: new Set([from]) });
          if (party.members.size >= PARTY_MAX) break;
          party.members.add(me); me.party = party; sendParty(party); break;
        }
        case "party_leave": leaveParty(me); break;
        case "admin": admin(me, m).catch((e) => { console.error("[pets] admin", e.message); send(ws, { t: "admin_msg", msg: "Failed" }); }); break;
      }
    });
    ws.on("close", () => { if (me) gone(me); });
    ws.on("error", () => {});
  });
  // a new website build is live: everyone reloads onto it
  onWebsiteUpdate((v, by) => { const s = JSON.stringify({ t: "reload", web: v, by }); for (const ws of wss.clients) if (ws.readyState === 1) ws.send(s); });
  // a connection that doesn't answer a ping within 10 s is dropped
  setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch { /* closing */ } } }, BEAT_MS).unref();

  // ---- the town's dangers, 20 times a second; where everyone is, 10 times a second ----
  const exposed = (p, now) => now >= p.graceUntil && now >= p.stunUntil && now >= p.tpAt && !W.inSafeZone(p.x, p.z, p.y);
  // an animal's step toward a point, staying on ground it can walk (no walls, no drops); false when it can't
  const pace = (o, tx, tz, sp, tol) => {
    const dx = tx - o.x, dz = tz - o.z, l = hyp(dx, dz) || 1, st = Math.min(l, sp), ok = (x, z) => { const y = W.surfaceAt(x, z, o.y + tol); if (Math.abs(y - o.y) > tol || W.blocked(x, z, y, 0.4)) return false; o.x = x; o.z = z; o.y = y; return true; };
    o.yaw = Math.atan2(dx, dz); return ok(o.x + (dx / l) * st, o.z + (dz / l) * st) || ok(o.x + (dx / l) * st, o.z) || ok(o.x, o.z + (dz / l) * st);
  };
  const near = (players, o, R) => players.some((p) => Math.abs(p.x - o.x) < R && Math.abs(p.z - o.z) < R);
  // dogs roam their district (owner, 2026-11-11), a short walk at a time, and go for any parcel that comes close
  function stepDogs(r, players, dt, now) {
    for (const q of r.dogs) {
      const D = W.dogs[q.id]; q.awake = q.mode !== 0 || near(players, q, 110);
      if (!q.awake) continue;   // asleep while nobody's near
      if (q.mode === 0) {
        if (now >= q.cool) for (const p of players) if (p.bag.length && Math.abs(p.y - q.y) < 3 && hyp(p.x - q.x, p.z - q.z) < W.DOG_D[D.d].trigger && exposed(p, now)) { q.mode = 1; q.t = W.DOG_D[D.d].telegraph; q.target = p; q.sx = q.x; q.sz = q.z; break; }   // bark and a red "!"
        if (q.mode !== 0) continue;
        if ((q.pause -= dt) > 0) continue;
        if (q.wx === undefined || hyp(q.wx - q.x, q.wz - q.z) < 1 || q.stuck > 0.6) {   // somewhere new to trot to (now and then it stops for a sniff)
          q.stuck = 0; q.wx = D.hx; q.wz = D.hz; if (Math.random() < 0.3) q.pause = 1 + Math.random() * 3;
          for (let k = 0; k < 8; k++) { const a = Math.random() * W.TAU, d = 8 + Math.random() * 26, x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d; if (hyp(x - D.hx, z - D.hz) < DOG.range && W.roamOk(x, z, q.y, D.d)) { q.wx = x; q.wz = z; break; } }
        }
        if (!pace(q, q.wx, q.wz, DOG.roam * dt, 0.55) || W.inSafeZone(q.x, q.z, q.y)) q.stuck += dt;
        continue;
      }
      const p = q.target;
      if (q.mode === 1) { if (p) q.yaw = Math.atan2(p.x - q.x, p.z - q.z); q.t -= dt; if (q.t <= 0) { q.mode = 2; q.t = W.DOG_D[D.d].chase; } continue; }
      if (q.mode === 2) {
        if (!p || p.gone || !p.bag.length || !exposed(p, now) || Math.abs(p.y - q.y) > 3.5 || hyp(q.x - q.sx, q.z - q.sz) > DOG.leash || (q.t -= dt) <= 0) { q.mode = 0; q.target = null; q.cool = now + DOG.cool * 1000; q.pause = 1.5; q.wx = undefined; continue; }
        const d = hyp(p.x - q.x, p.z - q.z);
        pace(q, p.x, p.z, W.DOG_D[D.d].speed * (p.acct.data.fails >= 3 ? 0.8 : 1) * dt, 0.75);   // three failed runs in a row: the dogs ease off
        if (d < DOG.bite && p.y - q.y < 0.8) {   // (owner, 2026-11-11) a courier jumping over a dog isn't bitten
          if (Math.random() < W.shakeOff(mountOf(p).lv, D.d)) all(r, { t: "fx", k: "shake", id: p.id });   // outgrown: the mount shakes it off
          else { stun(p, DOG.stun, "dog"); hit(p, "dog"); all(r, { t: "fx", k: "bite", dog: q.id, id: p.id }); } q.mode = 0; q.target = null; q.cool = now + DOG.cool * 1000; q.pause = 2; q.wx = undefined; }
        continue;
      }
      // scared off (a kick, a Bark): it bolts back toward where it started, then carries on
      if (q.t3 === undefined) q.t3 = 2.5;
      if ((q.t3 -= dt) <= 0 || !pace(q, D.hx, D.hz, 9 * dt, 0.75) || hyp(q.x - D.hx, q.z - D.hz) < 1) { q.mode = 0; q.t3 = undefined; q.wx = undefined; q.pause = 1; }
    }
  }
  function stepGeese(r, players, dt, now) {
    for (const g of r.geese) {
      const G = W.geese[g.id], P = W.ponds[G.pond];
      g.awake = !!g.carry || g.mode !== 0 || players.some((p) => Math.abs(p.x - P.x) < 120 && Math.abs(p.z - P.z) < 120 && Math.abs(p.y - P.y) < 12);
      if (!g.awake) continue;   // asleep while nobody's near
      const go = (tx, tz, sp) => { const dx = tx - g.x, dz = tz - g.z, d = hyp(dx, dz) || 1, s = Math.min(d, sp * dt); g.yaw = Math.atan2(dx, dz); g.x += (dx / d) * s; g.z += (dz / d) * s; const s2 = W.surfaceAt(g.x, g.z, P.y + 1.4); g.y = s2 > -100 ? s2 : P.y; return d; };
      if (g.mode === 4) { if ((g.t -= dt) <= 0) { g.mode = 0; g.cool = now + GOOSE.cool * 1000; } continue; }   // dizzy from a kick
      if (g.carry) {   // waddling to the pond with a parcel
        if (g.mode !== 5) { if (go(P.x, P.z, GOOSE.carry) < 1) { g.mode = 5; g.t = GOOSE.dunk; } }   // out in the middle of its pond, it takes a moment to sink the parcel
        else if ((g.t -= dt) <= 0) { const o = g.carry.p, q = g.carry.parcel; g.carry = null; g.mode = 0; g.cool = now + GOOSE.cool * 1000; lose(o, "goose", q); }
        continue;
      }
      if (g.mode === 0) {
        if (!(now < g.cool)) for (const p of players) if (p.bag.length && Math.abs(p.y - g.y) < 2.5 && hyp(p.x - g.x, p.z - g.z) < W.GOOSE_D[G.d].see && exposed(p, now)) { g.mode = 1; g.t = W.GOOSE_D[G.d].telegraph; g.target = p; break; }   // honk and flap
        if (g.mode === 0) { if (hyp(g.wx - g.x, g.wz - g.z) < 0.5 || Math.random() < 0.003) { const a = Math.random() * W.TAU, d = P.r + 1.5 + Math.random() * GOOSE.roam; g.wx = P.x + Math.cos(a) * d; g.wz = P.z + Math.sin(a) * d; } const ox = g.x, oz = g.z; go(g.wx, g.wz, GOOSE.wander); if (W.blocked(g.x, g.z, g.y, 0.3) && !W.blocked(ox, oz, g.y, 0.3)) { g.x = ox; g.z = oz; g.wx = ox; g.wz = oz; } }   // geese roam well away from their pond (owner, 2026-11-11), round houses and fences
        continue;
      }
      const p = g.target;
      if (g.mode === 1) { if (p) g.yaw = Math.atan2(p.x - g.x, p.z - g.z); if ((g.t -= dt) <= 0) { g.mode = 2; g.t = GOOSE.lungeFor; } continue; }
      if (!p || p.gone || !p.bag.length || !exposed(p, now) || (g.t -= dt) <= 0) { g.mode = 0; g.target = null; g.cool = now + GOOSE.cool * 1000; continue; }
      if (go(p.x, p.z, W.GOOSE_D[G.d].lunge) < GOOSE.touch && Math.abs(p.y - g.y) < 2.5) {   // it has the parcel (no stun): off to the pond
        if (Math.random() < W.shakeOff(mountOf(p).lv, G.d)) { all(r, { t: "fx", k: "shake", id: p.id }); g.mode = 4; g.t = 1.5; g.target = null; continue; }   // outgrown: shaken off
        const q = pick1(p.bag); drop(p.bag, q); q.goose = g.id; p.stolen.push(q); g.carry = { p, parcel: q }; g.mode = 3; g.target = null;
        sendBag(p, { k: "stolen", pid: q.pid, goose: g.id }); carry(p); all(r, { t: "fx", k: "steal", goose: g.id, id: p.id }, p);
      }
    }
  }
  function stepGoats(r, players, dt, now) {   // goats wander their terrace and charge anyone who comes close
    for (const g of r.goats) {
      const G = W.goats[g.id]; g.y = G.y; g.awake = g.mode !== 0 || near(players, g, 110);
      if (!g.awake) continue;
      const onLedge = (x, z) => W.surfaceAt(x, z, G.y + 0.3) === G.y && !W.blocked(x, z, G.y, 0.5);
      if (g.mode === 0) {
        if (now >= g.cool) for (const p of players) if (Math.abs(p.y - G.y) < 2.5 && hyp(p.x - g.x, p.z - g.z) < GOAT.see && now >= p.stunUntil && now >= p.tpAt) { const d = hyp(p.x - g.x, p.z - g.z) || 1; g.mode = 1; g.t = GOAT.telegraph; g.dx = (p.x - g.x) / d; g.dz = (p.z - g.z) / d; g.yaw = Math.atan2(g.dx, g.dz); break; }   // it stomps
        if (g.mode !== 0) continue;
        if (g.wx === undefined || hyp(g.wx - g.x, g.wz - g.z) < 0.8 || g.stuck > 0.6) { g.stuck = 0; g.wx = g.x; g.wz = g.z; for (let k = 0; k < 8; k++) { const a = Math.random() * W.TAU, d = 5 + Math.random() * 24, x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d; if (onLedge(x, z)) { g.wx = x; g.wz = z; break; } } }
        const dx = g.wx - g.x, dz = g.wz - g.z, d = hyp(dx, dz) || 1, st = Math.min(d, GOAT.roam * dt), nx = g.x + (dx / d) * st, nz = g.z + (dz / d) * st;
        if (onLedge(nx, nz)) { g.x = nx; g.z = nz; g.yaw = Math.atan2(dx, dz); } else g.stuck += dt;
        continue;
      }
      if (g.mode === 1) { if ((g.t -= dt) <= 0) { g.mode = 2; g.t = GOAT.run; } continue; }
      if (g.mode === 2) {
        const nx = g.x + g.dx * GOAT.speed * dt, nz = g.z + g.dz * GOAT.speed * dt;
        if (onLedge(nx, nz)) { g.x = nx; g.z = nz; } else g.t = 0;   // it won't run off its ledge
        for (const p of players) if (Math.abs(p.y - G.y) < 2.5 && hyp(p.x - g.x, p.z - g.z) < GOAT.touch && now >= p.tpAt) { send(p.ws, { t: "knock", x: -0.85 * GOAT.knock + g.dx * 4, z: g.dz * 6, y: 6 }); all(r, { t: "fx", k: "butt", goat: g.id, id: p.id }); g.t = 0; }   // toward the ledge
        if ((g.t -= dt) <= 0) { g.mode = 0; g.cool = now + GOAT.cool * 1000; g.wx = undefined; }
        continue;
      }
      g.mode = 0; g.wx = undefined;   // kicked: it thinks better of it
    }
  }
  function stepSky(r, players, now) {   // falling rocks on Cliffside; diving sky geese and the long drop on the islands
    for (const p of players) {
      const dist = W.districtAt(p.x, p.z, p.y);
      if (dist === 3 && p.y > 1 && p.y < W.SKY_Y) {
        if (!p.nextRock) p.nextRock = now + between(ROCK.every) * 1000;
        else if (now > p.nextRock) { p.nextRock = now + between(ROCK.every) * 1000; const k = { x: r1(p.x + p.vx * 0.8 + (Math.random() - 0.5) * 3), z: r1(p.z + p.vz * 0.8 + (Math.random() - 0.5) * 3), y: r1(p.y), at: now + ROCK.delay * 1000 }; r.rocks.push(k); all(r, { t: "rock", x: k.x, z: k.z, y: k.y, s: ROCK.delay }); }
      } else p.nextRock = 0;
      if (dist === 4 && p.bag.length && p.lastIsle >= 0) {
        if (!p.nextDive) p.nextDive = now + between(SKYGOOSE.every) * 1000;
        else if (now > p.nextDive) { p.nextDive = now + between(SKYGOOSE.every) * 1000; const k = { p, x: r1(p.x + p.vx * 0.7), z: r1(p.z + p.vz * 0.7), y: r1(p.y), at: now + SKYGOOSE.delay * 1000 }; r.dives.push(k); all(r, { t: "dive", x: k.x, z: k.z, y: k.y, s: SKYGOOSE.delay }); }
      } else p.nextDive = 0;
      if (p.x > W.ISLE_X && p.y < W.FALL_Y && now - p.tpAt > 600) {   // off an island: one hit, and back on the last one stood on
        const s = p.lastIsle >= 0 ? ISLES[p.lastIsle] : null; hit(p, "fall");
        if (s) teleport(p, s.x, s.z, s.y, "fall"); else teleport(p, CANNON.x - 8, CANNON.z, CANNON.y, "fall");
      }
      for (const o of [...p.dropped]) {   // a parcel a goose dropped: the courier picks it up whole, with a few coins for the trouble
        if (now > o.until) lose(p, "goose", o.parcel);
        else if (hyp(p.x - o.x, p.z - o.z) < W.PICKUP_R && Math.abs(p.y - o.y) < 3 && now >= p.stunUntil) { drop(p.dropped, o); p.bag.push(o.parcel); const bonus = GOOSE.bonus * TIERS[o.parcel.tier].mult; p.acct.data.coins += bonus; changed(p); sendBag(p, { k: "pickup", pid: o.parcel.pid, bonus, coins: p.acct.data.coins }); carry(p); }
      }
      if (p.bag.length && now >= p.stunUntil && now - p.sus > 2000 && now >= p.tpAt) for (const q of [...p.bag]) { const h = W.houses[q.house]; if (Math.abs(p.y - h.my) < 2.5 && hyp(p.x - h.mx, p.z - h.mz) < W.DELIVER_R) deliver(p, q); }   // delivered: in the zone in front of its mailbox
    }
    for (let n = r.rocks.length - 1; n >= 0; n--) { const k = r.rocks[n]; if (now < k.at) continue; r.rocks.splice(n, 1); for (const p of players) if (Math.abs(p.y - k.y) < 3 && hyp(p.x - k.x, p.z - k.z) < ROCK.r && now >= p.stunUntil && now >= p.tpAt) { stun(p, ROCK.stun, "rock"); hit(p, "rock"); } }
    for (let n = r.dives.length - 1; n >= 0; n--) { const k = r.dives[n]; if (now < k.at) continue; r.dives.splice(n, 1); const p = k.p; if (!p.gone && p.bag.length && Math.abs(p.y - k.y) < 3 && hyp(p.x - k.x, p.z - k.z) < SKYGOOSE.r && now >= p.graceUntil) { all(r, { t: "fx", k: "skysteal", id: p.id }, p); lose(p, "skygoose", pick1(p.bag)); } }
  }
  setInterval(() => {
    const now = Date.now();
    for (const [k, exp] of invites) if (exp < now) invites.delete(k);
    for (const r of rooms) {
      const dt = Math.min(0.25, (now - r.last) / 1000); r.last = now;
      const players = [...r.players.values()];
      stepDogs(r, players, dt, now); stepGeese(r, players, dt, now); stepGoats(r, players, dt, now); stepSky(r, players, now);
      if ((r.tick = (r.tick + 1) % 2)) continue;
      const dg = r.dogs.filter((d) => d.awake), gs = r.geese.filter((g) => g.awake), gt = r.goats.filter((g) => g.awake);
      r.slow = (r.slow + 1) % 10; const ps = players.length > 1 ? players.filter((p) => p.fresh || !r.slow).map((p) => { p.fresh = false; return [p.id, r2(p.x), r2(p.z), r2(p.yaw), p.mv, r2(p.y), p.ct || 0]; }) : [];
      if (ps.length || dg.length || gs.length || gt.length) all(r, { t: "snap", ts: now, ps, dogs: dg.map(dogView), geese: gs.map(gooseView), goats: gt.map(goatView) });
    }
  }, TICK_MS).unref();
  wss.game = { rooms, online };   // for the tests
  return wss;
}
