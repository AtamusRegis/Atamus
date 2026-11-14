// Critter Courier (owner, 2026-11-11: the game remade from the design document): a WebSocket at /pets.
// The server decides everything that matters; the page shows it and asks: grab, kick, equip, merge,
// buy an upgrade, use a shortcut.
// - Accounts: username / password (or a remembered token); each courier's data (coins, mounts, upgrades,
//   stats, settings) is kept here and saved to the store (petstore.js) every minute, when they leave,
//   and at once after a purchase.
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

const { cleanData, MOUNTS, UPGRADES, TIERS, DOG, GOOSE, GOAT, ROCK, SKYGOOSE, PIPE, ISLES, CANNON, hyp, clamp } = W;
const ROOM_MAX = 100, TICK_MS = 50, CHAT_GAP_MS = 1200, BEAT_MS = 10000, SAVE_MS = 60000, INVITE_MS = 30000, PARTY_MAX = 6, SPEED_CAP = 110;
const EXPRESS_EXTRA = [0, 0, 8, 40, 45, 70, 75, 80, 85, 90];   // seconds on top for the districts whose roads wind (the far zones: the cannon, the islands and the zipline first)
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
  const r = { players: new Map(), last: Date.now(), tick: 0, slow: 0, rocks: [], dives: [], plats: new Map(), pods: [null, null, null], podAt: 0, podPay: Date.now() + W.PODIUM.every * 1000 };
  r.dogs = W.dogs.map((d) => ({ id: d.id, x: d.hx, z: d.hz, y: d.y, yaw: 0, mode: 0, t: 0, target: null, cool: 0, pause: 0, stuck: 0, awake: false }));
  r.geese = W.geese.map((g) => ({ id: g.id, x: g.x, z: g.z, y: g.y, yaw: 0, mode: 0, t: 0, target: null, carry: null, wx: g.x, wz: g.z, awake: false }));
  r.goats = W.goats.map((g) => ({ id: g.id, x: g.hx, z: g.hz, y: g.y, yaw: Math.PI / 2, mode: 0, t: 0, dx: 0, dz: 0, cool: 0, stuck: 0, awake: false }));
  return r;
}
function roomFor() { let r = rooms.find((q) => q.players.size < ROOM_MAX); if (!r) { r = makeRoom(); rooms.push(r); } return r; }
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const all = (r, o, skip) => { const s = JSON.stringify(o); for (const p of r.players.values()) if (p !== skip && p.ws.readyState === 1) p.ws.send(s); };
const mountOf = (p) => { const d = p.acct.data; return d.mounts.find((m) => m.id === d.ride) || d.mounts[0]; };
const statsOf = (p) => W.mountStats(mountOf(p));
const pub = (p) => { const m = mountOf(p), d = p.acct.data; return { id: p.id, name: p.name, sp: m.sp, r: m.r, va: m.va, tr: m.tr || "", shirt: d.set.shirt, rank: W.rankOf(W.upTotal(d.up)), friendly: d.set.friendly, x: p.x, y: p.y, z: p.z, yaw: p.yaw, carry: p.bag.map((q) => [q.tier, q.mod]) }; };
const parcelView = (q) => (q ? { pid: q.pid, tier: q.tier, mod: q.mod, dur: q.dur, max: q.max, hits: q.hits, house: q.house, due: q.due } : null);
const dogView = (d) => [d.id, r1(d.x), r1(d.z), r2(d.yaw), d.mode, r1(d.y)], gooseView = (g) => [g.id, r1(g.x), r1(g.z), r1(g.y), r2(g.yaw), g.mode, g.carry ? g.carry.parcel.tier : -1], goatView = (g) => [g.id, r1(g.x), r1(g.z), r2(g.yaw), g.mode];

export function attachPets(server, { origins = [], allowLocal = false, store = memStore() } = {}) {
  // ---- saving ----
  const dirty = new Set();
  // (owner, 2026-11-13) the town the zone builder placed
  if (store.loadBuild) store.loadBuild().then((l) => { W.setBuild(l); }).catch((e) => console.error("[pets] loadBuild", e.message));
  const flush = async (acct) => { dirty.delete(acct); try { await store.save(acct.id, acct.data, acct.rev); } catch (e) { console.error("[pets] save", e.message); dirty.add(acct); } };
  setInterval(() => { for (const a of [...dirty]) flush(a); }, SAVE_MS).unref();
  const changed = (p) => { p.acct.rev++; dirty.add(p.acct); };
  const pushData = (p) => send(p.ws, { t: "data", data: p.acct.data });
  const showMount = (p) => { const m = mountOf(p); all(p.room, { t: "mount", id: p.id, sp: m.sp, r: m.r, va: m.va, tr: m.tr || "" }, p); };

  // ---- parcels ----
  const fillBelt = (p) => { const open = W.openFor(p.acct.data), rr = mountOf(p).r | 0; for (const k of ["ready", "next"]) if (p[k] && p[k].tier >= open) p[k] = null;   /* (owner, 2026-11-11) never a parcel for an area that isn't open (after a reset, say) */ if (!p.ready) { p.ready = p.next || W.rollParcel(open, rr, Math.random, p.acct.data.set.pz); p.next = null; } if (!p.next) p.next = W.rollParcel(open, rr, Math.random, p.acct.data.set.pz); send(p.ws, { t: "belt", ready: p.ready, next: p.next }); };
  // (owner, 2026-11-11) a mount carries 1 to 5 parcels by its level: p.bag (on the saddle), p.stolen (geese have them), p.dropped (on the ground after a busted goose)
  const carry = (p) => all(p.room, { t: "carry", id: p.id, c: p.bag.map((q) => [q.tier, q.mod]) }, p);
  const held = (p) => p.bag.length + p.stolen.length + p.dropped.length;
  const pick1 = (a) => a[Math.floor(Math.random() * a.length)];
  // everything about my parcels, after any change; ev says what happened
  const sendBag = (p, ev) => send(p.ws, { t: "bag", bag: p.bag.map(parcelView), stolen: p.stolen.map((q) => ({ ...parcelView(q), goose: q.goose, left: r1(Math.max(0, (q.sinkAt - Date.now()) / 1000)) })), dropped: p.dropped.map((o) => ({ ...parcelView(o.parcel), x: r1(o.x), y: r1(o.y), z: r1(o.z), left: r1(Math.max(0, (o.until - Date.now()) / 1000)) })), cap: W.bagSize(mountOf(p)), ev });
  const drop = (a, q) => { const n = a.indexOf(q); if (n >= 0) a.splice(n, 1); };
  // (owner, 2026-11-11) the attack queue: an animal takes one of a courier's slots to go after them (p.slots: the animals
  // chasing them) and leaves it when it attacks or gives up. No animal attacks while a parcel is with a goose or on the
  // ground, nor for ATTACK.calm s after one is back or lost (or after a bite or a butt).
  const takeSlot = (p, a) => p.slots.has(a) || (p.slots.size < W.ATTACK.slots && !!p.slots.add(a));
  const release = (a) => { if (a.target && a.target.slots) a.target.slots.delete(a); a.target = null; };
  const calmNow = (p, now) => now < p.calmUntil || p.stolen.length > 0 || p.dropped.length > 0;
  const settle = (p) => { if (!p.stolen.length && !p.dropped.length) p.calmUntil = Date.now() + W.ATTACK.calm * 1000; };   // a parcel back or lost: the calm starts now
  function lose(p, why, q) {   // a parcel is gone (broken, stolen for good)
    const was = p.stolen.includes(q) || p.dropped.some((k) => k.parcel === q);
    drop(p.bag, q); drop(p.stolen, q); const o = p.dropped.find((k) => k.parcel === q); if (o) drop(p.dropped, o); if (was) settle(p);
    const d = p.acct.data; d.fails = Math.min(99, d.fails + 1); changed(p);
    sendBag(p, { k: "lost", why, pid: q.pid }); carry(p); all(p.room, { t: "fx", k: "break", id: p.id, x: r1(p.x), y: r1(p.y), z: r1(p.z) }, p);
    runDone(p);
  }
  // (owner, 2026-11-11) the run's over (nothing left delivered, carried, with a goose or on the ground): back to the post office
  function runDone(p) { if (!held(p) && !p.gone) teleport(p, W.SPAWN.x + (Math.random() - 0.5) * 0.4, W.SPAWN.z + (Math.random() - 0.5) * 0.4, W.SPAWN.y, "home"); }   // (owner, 2026-11-13) the respawn point placed with the zone builder
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
    const now = Date.now(), d = p.acct.data; if (held(p) >= W.bagSize(mountOf(p)) || !p.ready || now < p.stunUntil || W.counterDist(p.x, p.z) > W.GRAB_R + 1.2 || Math.abs(p.y) > 3) return;
    if (p.ready.tier >= W.openFor(d)) { fillBelt(p); return; }   // rolled before the area closed (a reset): a new one
    const c = p.ready, hs = W.housesIn(c.tier), h = hs[Math.floor(Math.random() * hs.length)], max = W.boxDur(d.up.boxes); if (!h) { p.ready = null; fillBelt(p); return; }   // (owner, 2026-11-13) its zone's mailboxes were taken away
    const q = { pid: ++p.pids, tier: c.tier, mod: c.mod, dur: max, max, hits: 0, house: h.id, t0: now, left: W.DROP_S * 1000, due: c.mod === "express" ? now + 1000 * (Math.max(W.EXPRESS_MIN, hyp(h.mx, h.mz) * W.EXPRESS_PER_M) + EXPRESS_EXTRA[c.tier]) : 0 };
    p.bag.push(q); p.ready = null; sendBag(p, { k: "grab", pid: q.pid }); carry(p); fillBelt(p);
  }
  // (owner, 2026-11-11) a delivery pays its coins and leaves a gift of a rarity rolled now; what's inside is decided when
  // it's opened. Four unopened gifts of one rarity merge into one of the next.
  function deliver(p, q) {
    const d = p.acct.data, m = mountOf(p), now = Date.now(), late = q.mod === "express" && now > q.due;
    const coins = W.deliveryCoins(q.tier, q.mod, d.up.payout, q.hits, late), roll = W.rewardRoll(q.tier, d.up, Math.random, d.set.pz === q.tier ? q.tier + 1 : W.openFor(d));
    d.coins += coins; d.stats.del++; d.fails = 0;
    const gift = { gid: d.nextGid++, r: roll.tier, pt: q.tier };
    // a courier's second delivery brings a new mount, revealed when that gift is opened: (owner, 2026-11-11) the parcel's
    // area's animal, at the gift's rarity (set when it's opened, so a merged-up gift gives the better one)
    if (d.stats.del === 2 && d.mounts.length < W.MOUNT_CAP) { const nm = { id: d.nextId++, sp: W.CHASERS[q.tier], r: gift.r, va: 0 }; d.mounts.push(nm); gift.m = nm.id; }
    d.gifts.push(gift); const merges = W.mergeGifts(d.gifts, () => d.nextGid++);
    const over = d.gifts.length > W.GIFT_CAP ? d.gifts.slice(0, d.gifts.length - W.GIFT_CAP) : [];   // too many waiting: the oldest open by themselves
    if (over.length) openGifts(p, over.map((g) => g.gid), true);
    drop(p.bag, q); changed(p); flush(p.acct);
    send(p.ws, { t: "delivered", pid: q.pid, house: q.house, coins, gift, near: roll.near, merges, data: d });
    sendBag(p, { k: "delivered", pid: q.pid });
    all(p.room, { t: "fx", k: "del", id: p.id, house: q.house, roll: roll.tier }, p); carry(p);
    runDone(p);
  }
  const announce = (p, q, fused) => { const s = JSON.stringify({ t: "announce", name: p.name, sp: q.sp, r: q.r, va: q.va, ...(fused ? { fused: 1 } : {}) }); for (const o of online.values()) if (o.ws.readyState === 1) o.ws.send(s); };   // the whole server hears of a Shiny, Golden, Epic or Legendary
  function openGifts(p, gids, quiet) {   // open these gifts: roll what's inside each and add it
    const d = p.acct.data, list = [];
    for (const gid of new Set(gids)) {
      const g = d.gifts.find((k) => k.gid === gid); if (!g) continue; d.gifts.splice(d.gifts.indexOf(g), 1);
      const c = W.giftContents(g.r, g.pt, d.up, Math.random, d.set.pz === g.pt ? g.pt + 1 : W.openFor(d)); d.coins += c.coins;   // (owner, 2026-11-14) no bottom-raising bonus for the zone picked
      let mount = g.m ? d.mounts.find((k) => k.id === g.m) || null : null; if (mount) mount.r = g.r;   // the second delivery's mount: the gift's rarity
      else if (c.pet && d.mounts.length < W.MOUNT_CAP) { mount = { id: d.nextId++, sp: c.pet.sp, r: c.pet.r, va: c.pet.va }; d.mounts.push(mount); if (mount.va || mount.r >= 3) announce(p, mount); }   // (owner, 2026-11-11) a mount, the parcel's area's animal at its rarity
      delete c.pet; list.push({ gid, r: g.r, pt: g.pt, ...c, mount });
    }
    if (!list.length) return; changed(p); flush(p.acct);
    if (!quiet) send(p.ws, { t: "opened", list, data: d });
  }
  function teleport(p, x, z, y, why, yaw) { p.x = x; p.z = z; p.y = y; p.tpAt = Date.now(); p.lx = x; p.lz = z; p.lt = p.tpAt; send(p.ws, yaw === undefined ? { t: "tp", x, z, y, why } : { t: "tp", x, z, y, why, yaw }); }

  // ---- parties ----
  const invites = new Map();   // "to:from" -> expiry
  function sendParty(party) { const ms = [...party.members].map((q) => ({ id: q.id, name: q.name })); for (const q of party.members) send(q.ws, { t: "party", members: ms }); }
  function leaveParty(p) {
    const party = p.party; if (!party) return; party.members.delete(p); p.party = null; send(p.ws, { t: "party", members: [] });
    if (party.members.size < 2) { for (const q of party.members) { q.party = null; send(q.ws, { t: "party", members: [] }); } } else sendParty(party);
  }
  // ---- the staff panel ----
  const staffView = (a, p) => ({ id: a.id, name: a.name, role: rankOf(a) === 3 ? "owner" : a.role, online: !!p, muted: a.muteUntil > Date.now() ? (a.muteUntil === Infinity ? -1 : a.muteUntil) : 0, banned: a.banUntil > Date.now() ? (a.banUntil === Infinity ? -1 : a.banUntil) : 0 });
  const inv = (d) => ({ coins: d.coins, mounts: d.mounts, ride: d.ride, up: d.up });
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
    const putData = async (d) => { a.data = cleanData(d); if (p) { changed(p); pushData(p); flush(p.acct); showMount(p); fillBelt(p); all(p.room, { t: "rank", id: p.id, rank: W.rankOf(W.upTotal(a.data.up)) }); } else { a.rev++; await store.save(a.id, a.data, a.rev); } };
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
      case "give": {   // admins: coins or a mount (a kind, rarity and skin)
        if (my < 2) return reply("Not allowed");
        const n = Math.max(1, Math.min(1e7, Math.floor(+m.n || 1))), what = String(m.what || ""), d = cleanData(a.data);
        if (what === "coins") d.coins += n;
        else if (what.startsWith("mount:") && MOUNTS[what.slice(6)]) { const va = clamp(Math.floor(+m.va || 0), 0, 1), r = clamp(Math.floor(+m.r || 0), 0, 4); for (let k = 0; k < Math.min(n, 20) && d.mounts.length < W.MOUNT_CAP; k++) d.mounts.push({ id: d.nextId++, sp: what.slice(6), r, va }); }
        else return reply("Unknown");
        await putData(d); log("give", what + " x" + n); break;
      }
      // admins' quick commands, on themselves or anyone below them
      case "quick": {
        if (my < 2) return reply("Not allowed");
        const cmd = String(m.cmd || ""), every = cmd === "everything";
        if (!["coins", "allmounts", "upgrades", "everything", "reset"].includes(cmd)) return reply("Unknown");
        let d = cleanData(a.data);
        if (cmd === "reset") {   // (owner, 2026-11-11) a brand new courier: everything (coins, mounts, levels, upgrades, parcels, stats, settings, the tutorial)
          a.data = cleanData({}); log("quick", "reset");
          if (p) { p.bag = []; p.stolen = []; p.dropped = []; p.ready = p.next = null; p.slots = new Set(); p.calmUntil = 0; changed(p); flush(p.acct); send(p.ws, { t: "reset" }); p.ws.terminate(); }
          else { a.rev++; await store.save(a.id, a.data, a.rev); }
          break;
        }
        if (cmd === "coins" || every) d.coins = Math.min(1e12, d.coins + (every ? 1e7 : Math.max(1, Math.min(1e9, Math.floor(+m.n || 0)))));
        if (cmd === "allmounts" || every) { const have = new Set(d.mounts.map((q) => q.sp + q.r)); for (const sp of Object.keys(MOUNTS)) for (let r = 0; r < 5; r++) if (!have.has(sp + r) && d.mounts.length < W.MOUNT_CAP) d.mounts.push({ id: d.nextId++, sp, r, va: 0 }); }
        if (cmd === "upgrades" || every) for (const k of Object.keys(UPGRADES)) d.up[k] = W.UP_MAX;
        await putData(d); log("quick", cmd + (cmd === "coins" ? " " + m.n : "")); break;
      }
      case "inspect": { if (my < 2) return reply("Not allowed"); send(me.ws, { t: "admin_data", id: a.id, name: a.name, data: inv(cleanData(a.data)) }); return; }
      case "edit": {   // coins and upgrades
        if (my < 2) return reply("Not allowed");
        const d = cleanData(a.data), n = (v, hi) => Math.max(0, Math.min(hi, Math.floor(+v) || 0));
        if (m.coins !== undefined) d.coins = n(m.coins, 1e12);
        if (m.up && typeof m.up === "object") for (const k of Object.keys(UPGRADES)) if (m.up[k] !== undefined) d.up[k] = n(m.up[k], W.UP_MAX);
        await putData(d); log("edit", JSON.stringify({ coins: m.coins, up: m.up }).slice(0, 300));
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
        me = { id: nextId++, ws, room, acct, name: acct.name, x: W.SPAWN.x + (Math.random() - 0.5) * 0.4, y: W.SPAWN.y, z: W.SPAWN.z + (Math.random() - 0.5) * 0.4, yaw: Math.PI, mv: 0, ct: 0, vx: 0, vz: 0, lx: 0, lz: 0, lt: 0, tpAt: now, flags: 0, sus: 0,
          lastChat: 0, party: null, ready: null, next: null, bag: [], stolen: [], dropped: [], slots: new Set(), calmUntil: 0, pids: 0, stunUntil: 0, graceUntil: 0, lastIsle: -1, nextRock: 0, nextDive: 0, pipeAt: 0 };
        me.lx = me.x; me.lz = me.z; me.lt = now;
        online.set(acct.id, me);
        send(ws, { t: "welcome", plats: [...room.plats].filter(([, st]) => st.goneUntil).map(([id, st]) => [id, st.goneUntil === Infinity ? 1e12 : r1(st.goneUntil / 1000)]), build: W.build, zones: W.zones, web: websiteBuild(), by: websiteBy(), now, id: me.id, name: me.name, role: rankOf(acct) >= 2 ? "admin" : acct.role, token, data: acct.data, x: me.x, y: me.y, z: me.z, players: [...room.players.values()].map(pub),
          dogs: room.dogs.map(dogView), geese: room.geese.map(gooseView), goats: room.goats.map(goatView), pods: podView(room) });
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
          // (owner, 2026-11-11) any angle, wrapped (clamping it to +-10 left others riding sideways once they'd turned round a few times)
          me.x = x; me.y = y; me.z = z; me.yaw = Math.atan2(Math.sin(num(m.yaw, 1e6)), Math.cos(num(m.yaw, 1e6))); me.mv = clamp(m.mv | 0, 0, 255); me.ct = Number.isFinite(+m.ct) ? +m.ct : 0; me.fresh = true;
          const n = W.isleAt(x, z); if (n >= 0 && Math.abs(y - ISLES[n].y) < 3) me.lastIsle = n;
          break;
        }
        case "grab": grab(me); break;
        case "open": if (Array.isArray(m.gids)) openGifts(me, m.gids.slice(0, W.GIFT_CAP).map((g) => +g)); break;
        case "trail": {   // (owner, 2026-11-11) put an unlocked trail on a mount (or take it off)
          const q = d.mounts.find((k) => k.id === m.id), k = String(m.k || ""); if (!q || (k && !W.trailsFor(d).includes(k))) break;
          if (k) q.tr = k; else delete q.tr; changed(me); pushData(me); if (q.id === d.ride) showMount(me); break;
        }
        case "equip": { const q = d.mounts.find((k) => k.id === m.id); if (q && d.ride !== q.id) { d.ride = q.id; changed(me); pushData(me); showMount(me); sendBag(me, { k: "mount" }); } break; }
        case "fuse": {   // (owner, 2026-11-11) two of the same mount (coat and skin): the chosen one goes up a coat (rarity), the other goes
          const four = W.fuseSet(d.mounts, m.id); if (!four) break;
          const best = four[0]; best.r++;   // the one you chose
          for (const k of four) { best.cap = Math.max(best.cap | 0, k.cap | 0); best.spd = Math.max(best.spd | 0, k.spd | 0); }   // (owner, 2026-11-12) it keeps the better Aura upgrades of the two
          d.mounts = d.mounts.filter((k) => k === best || !four.includes(k)); if (!d.mounts.some((k) => k.id === d.ride)) d.ride = best.id;
          changed(me); flush(me.acct); send(ws, { t: "fused", m: best, data: d }); showMount(me);
          if (best.r >= 3 || best.va) announce(me, best, true);   // an Epic, Legendary or Shiny made by merging tells everyone
          break;
        }
        case "fuseall": {   // (owner, 2026-11-12) every merge there is, at once
          const made = W.fuseAll(d.mounts, d.ride); if (!made.length) break;
          if (!d.mounts.some((k) => k.id === d.ride)) d.ride = made[made.length - 1].id;
          const top = [...made].sort((a, b) => b.r - a.r || b.va - a.va)[0];
          changed(me); flush(me.acct); send(ws, { t: "fused", m: top, n: made.length, data: d }); showMount(me);
          for (const q of made) if (q.r >= 3 || q.va) announce(me, q, true);
          break;
        }
        case "sell": {   // (owner, 2026-11-12) a mount for Aura by its rarity
          const q = d.mounts.find((k) => k.id === m.id); if (!q || q.id === d.ride || d.mounts.length <= 1) break;
          const a = W.sellPrice(q); d.mounts = d.mounts.filter((k) => k !== q); d.coins += a; changed(me); flush(me.acct); send(ws, { t: "sold", n: a, data: d }); break;
        }
        case "petup": {   // (owner, 2026-11-12) Aura on one mount: carrying (cap) or speed (spd)
          const q = d.mounts.find((k) => k.id === m.id), k = m.k === "cap" ? m.k : "";   /* (owner, 2026-11-14) no speed (Boost) levels to buy */ if (!q || !k || (q[k] | 0) >= (k === "cap" ? W.CAP_MAX : W.SPD_MAX)) break;
          const cost = W.petUpCost(q, k); if (d.coins < cost) break;
          d.coins -= cost; q[k] = (q[k] | 0) + 1; changed(me); flush(me.acct); send(ws, { t: "petup", id: q.id, k, data: d }); break;
        }
        case "buytrail": {   // (owner, 2026-11-12) a trail bought with Aura
          const T = W.TRAILS.find((t) => t.k === m.k && t.cost); if (!T || d.trails.includes(T.k) || d.coins < T.cost) break;
          d.coins -= T.cost; d.trails.push(T.k); changed(me); flush(me.acct); pushData(me); break;
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
          if (m.tut === true) s.tut = true;
          if (m.pz !== undefined && Number.isFinite(+m.pz)) { const v = clamp(Math.floor(+m.pz), -1, W.TIERS.length - 1); if (v !== s.pz) { s.pz = v; me.ready = me.next = null; fillBelt(me); } }   // (owner, 2026-11-14) the zone picked for parcels: the conveyor follows at once
          changed(me); if (was !== s.friendly || shirt !== s.shirt) all(room, { t: "look", id: me.id, friendly: s.friendly, shirt: s.shirt }, me); break;
        }
        case "tube": {   // (owner, 2026-11-13) a pipe shortcut the builder linked: in its mouth, out of the other's
          const q = W.pipes.find((o) => o.id === +m.id), o = W.tubePartner(q); if (!o || now < me.stunUntil || now - (me.tubeAt || 0) < W.TUBE.cd * 1000) break;
          const [mx, mz] = W.turn(0, W.TUBE.l / 2 + 0.7, q.yaw); if (hyp(me.x - q.x - mx, me.z - q.z - mz) > 5 || Math.abs(me.y - q.y) > 4) break;
          me.tubeAt = now; const e = W.pipeExit(o); teleport(me, e.x, e.z, e.y, "tube", e.yaw); all(room, { t: "fx", k: "tube", id: me.id, x: e.x, y: e.y, z: e.z }, me); break;
        }
        case "kick": {   // (owner, 2026-11-14) kicking another courier: the nearest in reach and in front
          if (now < (me.kickAt || 0) + W.KICK.cd * 1000 || now < me.stunUntil || W.inSafeZone(me.x, me.z, me.y)) break;
          me.kickAt = now; all(room, { t: "fx", k: "kick", id: me.id }, me);
          const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw); let best = null, bd = Infinity;
          for (const o of room.players.values()) {
            if (o === me || o.gone || (me.party && me.party === o.party) || now < o.stunUntil || now < (o.kickSafe || 0) || W.inSafeZone(o.x, o.z, o.y) || Math.abs(o.y - me.y) > 2.5) continue;
            const dx = o.x - me.x, dz = o.z - me.z, d = hyp(dx, dz); if (d > W.KICK.range || (d > 1.2 && (dx * fx + dz * fz) / d < 0.2)) continue; if (d < bd) { bd = d; best = o; }
          }
          if (!best) break;
          const d = hyp(best.x - me.x, best.z - me.z), ux = d > 0.05 ? (best.x - me.x) / d : fx, uz = d > 0.05 ? (best.z - me.z) / d : fz;
          best.kickSafe = now + (W.KICK.down + W.KICK.grace) * 1000; stun(best, W.KICK.down, "kick");
          send(best.ws, { t: "kickfly", by: me.id, vx: r1(ux * W.KICK.fling), vy: W.KICK.up, vz: r1(uz * W.KICK.fling) }); send(me.ws, { t: "kickhit", id: best.id });
          break;
        }
        case "dropall": {   // (owner, 2026-11-14) letting go of the parcels you carry, to take new ones
          const all3 = [...me.bag, ...me.stolen, ...me.dropped.map((o) => o.parcel)]; for (const q of all3) lose(me, "drop", q); break;
        }
        case "pipe": {   // the sewer pipe: in one end, out the other; a goose inside costs a hit
          if (PIPE.off || now < me.stunUntil || now - me.pipeAt < 2000) break;
          const a = hyp(me.x - PIPE.a.x, me.z - PIPE.a.z) < PIPE.r + 3 && Math.abs(me.y - PIPE.a.y) < 2, b = hyp(me.x - PIPE.b.x, me.z - PIPE.b.z) < PIPE.r + 3 && Math.abs(me.y - PIPE.b.y) < 2; if (!a && !b) break;
          if (a && W.openFor(d) < 4) break;   // (owner, 2026-11-11) Cliffside isn't open yet
          me.pipeAt = now + PIPE.time * 1000; const out = a ? PIPE.b : PIPE.a, goose = W.pipeGoose(now / 1000);
          me.x = out.x; me.z = out.z; me.y = out.y; me.tpAt = now + PIPE.time * 1000; me.lx = out.x; me.lz = out.z; me.lt = me.tpAt;
          send(ws, { t: "piped", x: out.x, z: out.z, y: out.y, s: PIPE.time, goose }); all(room, { t: "fx", k: "pipe", id: me.id, s: PIPE.time }, me);
          if (goose) hit(me, "pipe"); break;
        }
        case "balloon": { const b = W.balloons.find((q) => hyp(me.x - q.x, me.z - q.z) < 11 && Math.abs(me.y - q.y) < 7); if (b && now >= me.stunUntil) teleport(me, W.SPAWN.x, W.SPAWN.z, W.SPAWN.y, "balloon"); break; }
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
        case "build": {   // (owner, 2026-11-13) the zone builder: admins only
          if (rankOf(me.acct) < 2) break;
          let list = W.build.slice();
          if (m.op === "add") { const q = W.cleanPiece({ ...m.piece, id: list.reduce((a, b) => Math.max(a, b.id), 0) + 1 }); if (!q || list.length >= W.BUILD_MAX) break; if (W.ONE_ONLY.includes(q.k)) list = list.filter((o) => o.k !== q.k); list.push(q); send(ws, { t: "buildok", tag: m.tag, id: q.id }); }   // (owner, 2026-11-13) the id back, for undo; one post office, one respawn point
          else if (m.op === "link" || m.op === "unlink") {   // (owner, 2026-11-13) two pipes joined into a shortcut (each loses any other partner), or parted
            const a = list.find((q) => q.id === +m.a && q.k === "pipe"), b = m.op === "link" ? list.find((q) => q.id === +m.b && q.k === "pipe" && q !== a) : null; if (!a || (m.op === "link" && !b)) break;
            list = list.map((q) => (q.k === "pipe" && (q.to === a.id || (b && q.to === b.id) || q === a || q === b) ? { ...q, to: q === a ? (b ? b.id : 0) : q === b ? a.id : 0 } : q));
          }
          else if (m.op === "del") { const n = list.length; list = list.filter((q) => q.id !== +m.id); if (list.length === n) break; }
          else if (m.op === "set") { const i = list.findIndex((q) => q.id === +(m.piece && m.piece.id)), q = i >= 0 && W.cleanPiece({ ...m.piece, k: list[i].k }); if (!q) break; list[i] = q; }   // (owner, 2026-11-13) a piece changed (a bound moved or resized)
          else if (m.op === "zone") { const n = +m.n; if (!(n >= 0 && n < W.TIERS.length)) break; W.zones[n] = W.cleanZone(m.zone, n); }   // a neighborhood's name, animal and chances
          else break;
          W.setBuild({ pieces: list, zones: W.zones.slice() }); store.saveBuild({ pieces: W.build, zones: W.zones }).catch((e) => console.error("[pets] saveBuild", e.message));
          for (const r of rooms) { r.plats.clear(); all(r, { t: "build", build: W.build, zones: W.zones }); for (const p of r.players.values()) { for (const k of ["ready", "next"]) if (p[k] && !W.housesIn(p[k].tier).length) p[k] = null; fillBelt(p); } }
          break;
        }
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
    const ox = o.x, oz = o.z, moved = ok(o.x + (dx / l) * st, o.z + (dz / l) * st) || ok(o.x + (dx / l) * st, o.z) || ok(o.x, o.z + (dz / l) * st);
    if (moved && hyp(o.x - ox, o.z - oz) > 1e-4) o.yaw = Math.atan2(o.x - ox, o.z - oz); else o.yaw = Math.atan2(dx, dz);   // (owner, 2026-11-11) facing the way it really went, never sideways
    return moved;
  };
  const near = (players, o, R) => players.some((p) => Math.abs(p.x - o.x) < R && Math.abs(p.z - o.z) < R);
  // dogs roam their district (owner, 2026-11-11), a short walk at a time, and go for any parcel that comes close
  function stepDogs(r, players, dt, now) {   // the chasers: each area's own kind (dogs, cats, gators, bears, wolves), Common to Legendary
    for (const q of r.dogs) {
      const D = W.dogs[q.id], S = W.chaserStats(D); q.awake = q.mode !== 0 || near(players, q, 110);
      if (!q.awake) continue;   // asleep while nobody's near
      if (now < (q.frozen || 0)) continue;   // (owner, 2026-11-12) frozen by a roar
      if (q.mode === 0) {
        if (now >= q.cool) for (const p of players) if (p.bag.length && Math.abs(p.y - q.y) < 3 && hyp(p.x - q.x, p.z - q.z) < S.trigger && exposed(p, now) && takeSlot(p, q)) { q.mode = 1; q.t = S.telegraph; q.target = p; q.sx = q.x; q.sz = q.z; break; }   // a free slot: a bark and a red "!"
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
      if (q.mode === 1) { if (!p || p.gone) { release(q); q.mode = 0; continue; } q.yaw = Math.atan2(p.x - q.x, p.z - q.z); q.t -= dt; if (q.t <= 0) { q.mode = 2; q.t = S.chase; } continue; }
      if (q.mode === 2) {
        if (!p || p.gone || !p.bag.length || !exposed(p, now) || Math.abs(p.y - q.y) > 3.5 || hyp(q.x - q.sx, q.z - q.sz) > DOG.leash || (q.t -= dt) <= 0) { release(q); q.mode = 0; q.cool = now + DOG.cool * 1000; q.pause = 1.5; q.wx = undefined; continue; }
        const d = hyp(p.x - q.x, p.z - q.z);
        pace(q, p.x, p.z, S.speed * (p.acct.data.fails >= 3 ? 0.8 : 1) * dt, 0.75);   // three failed runs in a row: the animals ease off
        if (d < DOG.bite && p.y - q.y < 0.8 && !calmNow(p, now)) {   // a courier jumping over it isn't bitten; nor in the calm after an attack (it keeps after them)
          if (Math.random() < W.shakeOff(mountOf(p), D.d, D.r)) all(r, { t: "fx", k: "shake", id: p.id });   // outgrown: the mount shakes it off
          else { stun(p, DOG.stun, "dog"); hit(p, "dog"); all(r, { t: "fx", k: "bite", dog: q.id, id: p.id }); }
          p.calmUntil = now + W.ATTACK.calm * 1000; release(q); q.mode = 0; q.cool = now + DOG.cool * 1000; q.pause = 2; q.wx = undefined; }
        continue;
      }
      // scared off (a kick, a Bark): it bolts back toward where it started, then carries on
      if (q.target) release(q);
      if (q.t3 === undefined) q.t3 = 2.5;
      if ((q.t3 -= dt) <= 0 || !pace(q, D.hx, D.hz, 9 * dt, 0.75) || hyp(q.x - D.hx, q.z - D.hz) < 1) { q.mode = 0; q.t3 = undefined; q.wx = undefined; q.pause = 1; }
    }
  }
  function stepGeese(r, players, dt, now) {
    for (const g of r.geese) {
      const G = W.geese[g.id], P = W.ponds[G.pond], S = W.gooseStats(G);
      g.awake = !!g.carry || g.mode !== 0 || players.some((p) => Math.abs(p.x - P.x) < 120 && Math.abs(p.z - P.z) < 120 && Math.abs(p.y - P.y) < 12);
      if (!g.awake) continue;   // asleep while nobody's near
      if (now < (g.frozen || 0)) continue;   // (owner, 2026-11-12) frozen by a roar
      // (owner, 2026-11-11) houses, fences, hedges and trees stop geese as they stop couriers: a goose slides along them
      // (one stuck for over a second with a parcel squeezes through, so a parcel can't be held forever)
      const inside = W.blocked(g.x, g.z, g.y, 0.3), free = (x, z) => inside || !W.blocked(x, z, g.y, 0.3) || (g.carry && g.stuck > 1);   // (already in something: it walks out)
      const go = (tx, tz, sp) => { const dx = tx - g.x, dz = tz - g.z, d = hyp(dx, dz) || 1, s = Math.min(d, sp * dt), ux = (dx / d) * s, uz = (dz / d) * s, ox = g.x, oz = g.z;
        if (free(g.x + ux, g.z + uz)) { g.x += ux; g.z += uz; } else if (free(g.x + ux, g.z)) g.x += ux; else if (free(g.x, g.z + uz)) g.z += uz;
        const mv = hyp(g.x - ox, g.z - oz); g.stuck = mv < s * 0.2 ? (g.stuck || 0) + dt : 0; g.yaw = mv > 1e-4 ? Math.atan2(g.x - ox, g.z - oz) : Math.atan2(dx, dz);
        const s2 = W.surfaceAt(g.x, g.z, P.y + 1.4); g.y = s2 > -100 ? s2 : P.y; return d; };
      if (g.mode === 4) { if ((g.t -= dt) <= 0) { g.mode = 0; g.cool = now + GOOSE.cool * 1000; } continue; }   // dizzy from a kick
      if (g.carry) {   // waddling to the pond with a parcel; (owner, 2026-11-11) when its time's up (the courier sees it count down), the parcel's gone
        const q = g.carry.parcel;
        if (now >= q.sinkAt) { const o = g.carry.p; g.carry = null; g.mode = 0; g.cool = now + GOOSE.cool * 1000; lose(o, "goose", q); continue; }
        if (g.mode !== 5) { if (go(P.x, P.z, GOOSE.carry) < 1) g.mode = 5; }   // out in the middle of its pond, it sinks the parcel as its time runs out
        continue;
      }
      if (g.mode === 0) {
        if (!(now < g.cool)) for (const p of players) if (p.bag.length && Math.abs(p.y - g.y) < 2.5 && hyp(p.x - g.x, p.z - g.z) < S.see && exposed(p, now) && takeSlot(p, g)) { g.mode = 1; g.t = S.telegraph; g.target = p; break; }   // a free slot: honk and flap
        if (g.mode === 0) { if (hyp(g.wx - g.x, g.wz - g.z) < 0.5 || Math.random() < 0.003) { const a = Math.random() * W.TAU, d = P.r + 1.5 + Math.random() * GOOSE.roam; g.wx = P.x + Math.cos(a) * d; g.wz = P.z + Math.sin(a) * d; } const ox = g.x, oz = g.z; go(g.wx, g.wz, GOOSE.wander); if (W.blocked(g.x, g.z, g.y, 0.3) && !W.blocked(ox, oz, g.y, 0.3)) { g.x = ox; g.z = oz; g.wx = ox; g.wz = oz; } }   // geese roam well away from their pond (owner, 2026-11-11), round houses and fences
        continue;
      }
      const p = g.target;
      if (g.mode === 1) { if (!p || p.gone) { release(g); g.mode = 0; continue; } g.yaw = Math.atan2(p.x - g.x, p.z - g.z); if ((g.t -= dt) <= 0) { g.mode = 2; g.t = GOOSE.lungeFor; } continue; }
      if (!p || p.gone || !p.bag.length || !exposed(p, now) || (g.t -= dt) <= 0) { release(g); g.mode = 0; g.cool = now + GOOSE.cool * 1000; continue; }
      if (go(p.x, p.z, S.lunge) < GOOSE.touch && Math.abs(p.y - g.y) < 2.5 && !calmNow(p, now)) {   // it has the parcel (no stun): off to the pond
        if (Math.random() < W.shakeOff(mountOf(p), G.d, G.r)) { all(r, { t: "fx", k: "shake", id: p.id }); p.calmUntil = now + W.ATTACK.calm * 1000; release(g); g.mode = 4; g.t = 1.5; continue; }   // outgrown: shaken off
        const q = pick1(p.bag); drop(p.bag, q); q.goose = g.id; q.sinkAt = now + 1000 * (hyp(P.x - g.x, P.z - g.z) / GOOSE.carry + GOOSE.dunk + 1); p.stolen.push(q); g.carry = { p, parcel: q }; g.stuck = 0; release(g); g.mode = 3;
        sendBag(p, { k: "stolen", pid: q.pid, goose: g.id }); carry(p); all(r, { t: "fx", k: "steal", goose: g.id, id: p.id }, p);
      }
    }
  }
  function stepGoats(r, players, dt, now) {   // goats wander their terrace and charge anyone who comes close (a free slot first)
    for (const g of r.goats) {
      const G = W.goats[g.id]; g.y = G.y; g.awake = g.mode !== 0 || near(players, g, 110);
      if (!g.awake) continue;
      if (now < (g.frozen || 0)) continue;
      const onLedge = (x, z) => W.surfaceAt(x, z, G.y + 0.3) === G.y && !W.blocked(x, z, G.y, 0.5);
      if (g.mode === 0) {
        if (now >= g.cool) for (const p of players) if (Math.abs(p.y - G.y) < 2.5 && hyp(p.x - g.x, p.z - g.z) < GOAT.see && now >= p.stunUntil && now >= p.tpAt && takeSlot(p, g)) { const d = hyp(p.x - g.x, p.z - g.z) || 1; g.target = p; g.mode = 1; g.t = GOAT.telegraph; g.dx = (p.x - g.x) / d; g.dz = (p.z - g.z) / d; g.yaw = Math.atan2(g.dx, g.dz); break; }   // it stomps
        if (g.mode !== 0) continue;
        if (g.wx === undefined || hyp(g.wx - g.x, g.wz - g.z) < 0.8 || g.stuck > 0.6) { g.stuck = 0; g.wx = g.x; g.wz = g.z; for (let k = 0; k < 8; k++) { const a = Math.random() * W.TAU, d = 5 + Math.random() * 24, x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d; if (onLedge(x, z)) { g.wx = x; g.wz = z; break; } } }
        const dx = g.wx - g.x, dz = g.wz - g.z, d = hyp(dx, dz) || 1, st = Math.min(d, GOAT.roam * dt), nx = g.x + (dx / d) * st, nz = g.z + (dz / d) * st;
        if (onLedge(nx, nz)) { g.x = nx; g.z = nz; g.yaw = Math.atan2(dx, dz); } else g.stuck += dt;
        continue;
      }
      if (g.mode === 1) { if ((g.t -= dt) <= 0) { g.mode = 2; g.t = GOAT.run; } continue; }
      if (g.mode === 2) {
        const sp = W.goatSpeed(G), nx = g.x + g.dx * sp * dt, nz = g.z + g.dz * sp * dt;
        if (onLedge(nx, nz)) { g.x = nx; g.z = nz; } else g.t = 0;   // it won't run off its ledge
        const p = g.target;
        if (p && !p.gone && Math.abs(p.y - G.y) < 2.5 && hyp(p.x - g.x, p.z - g.z) < GOAT.touch && now >= p.tpAt && !calmNow(p, now)) { send(p.ws, { t: "knock", x: -0.85 * GOAT.knock + g.dx * 4, z: g.dz * 6, y: 6 }); all(r, { t: "fx", k: "butt", goat: g.id, id: p.id }); p.calmUntil = now + W.ATTACK.calm * 1000; g.t = 0; }   // toward the ledge
        if ((g.t -= dt) <= 0) { release(g); g.mode = 0; g.cool = now + GOAT.cool * 1000; g.wx = undefined; }
        continue;
      }
      g.mode = 0; g.wx = undefined;   // kicked: it thinks better of it
    }
  }
  // (owner, 2026-11-14) breaking platforms (per room): stood on, a platform shakes and then breaks (on step: bt s after
  // it's first stood on; prolonged: once it's been stood on for bt s in all), and comes back rs s later (never with rs 0)
  function stepPlats(r, players, now) {
    const t = now / 1000;
    for (const q of W.movers) {
      if (!q.brk) continue; let st = r.plats.get(q.id); if (!st) r.plats.set(q.id, (st = { on: 0, warnAt: 0, goneUntil: 0, last: now }));
      const dt = (now - st.last) / 1000; st.last = now;
      if (st.goneUntil) { if (now >= st.goneUntil && st.goneUntil !== Infinity) { st.goneUntil = 0; st.on = 0; st.warnAt = 0; all(r, { t: "plat", id: q.id, gone: 0 }); } continue; }
      const p0 = W.moverPos(q, t), top = p0.y + q.h, stood = players.some((p) => !p.gone && Math.abs(p.y - top) < 0.45 && p.x >= p0.x - 0.3 && p.x <= p0.x + q.w + 0.3 && p.z >= p0.z - 0.3 && p.z <= p0.z + q.d + 0.3);
      if (q.brk === 1) { if (!st.warnAt && stood) { st.warnAt = now + q.bt * 1000; all(r, { t: "plat", id: q.id, warn: r1(st.warnAt / 1000) }); } }
      else if (stood) { st.on += dt; if (!st.warnAt) { st.warnAt = 1; all(r, { t: "plat", id: q.id, warn: 0 }); } }
      if ((q.brk === 1 && st.warnAt && now >= st.warnAt) || (q.brk === 2 && st.on >= q.bt)) { st.goneUntil = q.rs > 0 ? now + q.rs * 1000 : Infinity; all(r, { t: "plat", id: q.id, gone: q.rs > 0 ? r1(st.goneUntil / 1000) : 1e12 }); }
    }
  }
  function stepSky(r, players, now) {   // falling rocks on Cliffside; diving sky geese and the long drop on the islands
    for (const p of players) {
      const dist = W.districtAt(p.x, p.z, p.y);
      if (dist === 8 && W.lavaAt(p.x, p.z, p.y) && now >= (p.lavaAt || 0) && now >= p.stunUntil && now - p.tpAt > 600) { p.lavaAt = now + W.LAVA.every * 1000; stun(p, W.LAVA.stun, "lava"); hit(p, "lava"); }   // (owner, 2026-11-12) a lava pool burns
      if (p.y < W.EDGE_Y && !(ISLES.length && p.x > W.ISLE_X && p.x < W.FAR.x0 - 15) && now - p.tpAt > 600) {   // off the edge of the town: back to the respawn point, (owner, 2026-11-14) keeping the parcels you carry
        p.tpAt = now; teleport(p, W.SPAWN.x + (Math.random() - 0.5) * 0.4, W.SPAWN.z + (Math.random() - 0.5) * 0.4, W.SPAWN.y, "home"); continue;
      }
      if (ISLES.length && dist === 3 && p.y > 1 && p.y < W.SKY_Y) {   // (the old town's Cliffside rocks and sky geese: gone with it)
        if (!p.nextRock) p.nextRock = now + between(ROCK.every) * 1000;
        else if (now > p.nextRock) { p.nextRock = now + between(ROCK.every) * 1000; const k = { x: r1(p.x + p.vx * 0.8 + (Math.random() - 0.5) * 3), z: r1(p.z + p.vz * 0.8 + (Math.random() - 0.5) * 3), y: r1(p.y), at: now + ROCK.delay * 1000 }; r.rocks.push(k); all(r, { t: "rock", x: k.x, z: k.z, y: k.y, s: ROCK.delay }); }
      } else p.nextRock = 0;
      if (ISLES.length && dist === 4 && p.bag.length && p.lastIsle >= 0) {
        if (!p.nextDive) p.nextDive = now + between(SKYGOOSE.every) * 1000;
        else if (now > p.nextDive && !calmNow(p, now)) { p.nextDive = now + between(SKYGOOSE.every) * 1000; const k = { p, x: r1(p.x + p.vx * 0.7), z: r1(p.z + p.vz * 0.7), y: r1(p.y), at: now + SKYGOOSE.delay * 1000 }; r.dives.push(k); all(r, { t: "dive", x: k.x, z: k.z, y: k.y, s: SKYGOOSE.delay }); }
      } else p.nextDive = 0;
      if (ISLES.length && p.x > W.ISLE_X && p.x < W.FAR.x0 - 15 && p.y < W.FALL_Y && now - p.tpAt > 600) {   // (not the far zones below, nor the zipline down to them)
         // off an island: one hit, and back on the last one stood on
        const s = p.lastIsle >= 0 ? ISLES[p.lastIsle] : null; hit(p, "fall");
        if (s) teleport(p, s.x, s.z, s.y, "fall"); else teleport(p, CANNON.x - 8, CANNON.z, CANNON.y, "fall");
      }
      for (const o of [...p.dropped]) {   // a parcel a goose dropped: the courier picks it up whole, with a few coins for the trouble
        if (now > o.until) lose(p, "goose", o.parcel);
        else if (hyp(p.x - o.x, p.z - o.z) < W.PICKUP_R && Math.abs(p.y - o.y) < 3 && now >= p.stunUntil) { drop(p.dropped, o); o.parcel.left = Math.max(0, o.until - now); p.bag.push(o.parcel); settle(p); const bonus = GOOSE.bonus * TIERS[o.parcel.tier].mult; p.acct.data.coins += bonus; changed(p); sendBag(p, { k: "pickup", pid: o.parcel.pid, bonus, coins: p.acct.data.coins }); carry(p); }
      }
      if (p.bag.length && now >= p.stunUntil && now - p.sus > 2000 && now >= p.tpAt) for (const q of [...p.bag]) { const h = W.addr(q.house); if (!h) { lose(p, "gone", q); continue; } if (Math.abs(p.y - h.my) < 2.5 && hyp(p.x - h.mx, p.z - h.mz) < W.DELIVER_R) deliver(p, q); }   // delivered: in the zone in front of its mailbox
    }
    for (let n = r.rocks.length - 1; n >= 0; n--) { const k = r.rocks[n]; if (now < k.at) continue; r.rocks.splice(n, 1); for (const p of players) if (Math.abs(p.y - k.y) < 3 && hyp(p.x - k.x, p.z - k.z) < ROCK.r && now >= p.stunUntil && now >= p.tpAt) { stun(p, ROCK.stun, "rock"); hit(p, "rock"); } }
    for (let n = r.dives.length - 1; n >= 0; n--) { const k = r.dives[n]; if (now < k.at) continue; r.dives.splice(n, 1); const p = k.p; if (!p.gone && p.bag.length && Math.abs(p.y - k.y) < 3 && hyp(p.x - k.x, p.z - k.z) < SKYGOOSE.r && now >= p.graceUntil && !calmNow(p, now)) { all(r, { t: "fx", k: "skysteal", id: p.id }, p); lose(p, "skygoose", pick1(p.bag)); p.calmUntil = now + W.ATTACK.calm * 1000; } }
  }
  // (owner, 2026-11-12) the podiums: each room's three best mounts (up to three a courier) stand by the post office and pay Aura
  const podView = (r) => r.pods.map((q) => (q ? { id: q.p.id, name: q.p.name, sp: q.m.sp, r: q.m.r, va: q.m.va } : null));
  function stepPodiums(r, now) {
    const keep = r.pods.map((q) => (q && r.players.get(q.p.id) === q.p && q.p.acct.data.mounts.includes(q.m) ? q : null)), cands = [];
    for (const p of r.players.values()) for (const m of [...p.acct.data.mounts].sort((a, b) => W.podiumScore(b) - W.podiumScore(a)).slice(0, 3)) cands.push({ p, m, s: W.podiumScore(m), was: keep.some((q) => q && q.m === m) });
    cands.sort((a, b) => b.s - a.s || b.was - a.was);   // a rarer mount takes a podium; a tie keeps the one already standing
    const top = cands.slice(0, 3), next = [null, null, null];
    for (const c of top) { const n = keep.findIndex((q) => q && q.m === c.m); if (n >= 0) next[n] = keep[n]; }
    for (const c of top) if (!next.some((q) => q && q.m === c.m)) { const n = next.indexOf(null); next[n] = { p: c.p, m: c.m }; }
    const changedPods = next.some((q, n) => (q && q.m) !== (r.pods[n] && r.pods[n].m)); r.pods = next;
    if (changedPods) all(r, { t: "podiums", pods: podView(r) });
    if (now >= r.podPay) { r.podPay = now + W.PODIUM.every * 1000; for (const q of r.pods) if (q) { const a = W.podiumPay(q.m); q.p.acct.data.coins += a; changed(q.p); send(q.p.ws, { t: "aura", n: a, coins: q.p.acct.data.coins }); } }
  }
  setInterval(() => {
    const now = Date.now();
    for (const [k, exp] of invites) if (exp < now) invites.delete(k);
    for (const r of rooms) if (now >= r.podAt) { r.podAt = now + 1000; stepPodiums(r, now); }
    for (const r of rooms) {
      const dt = Math.min(0.25, (now - r.last) / 1000); r.last = now;
      const players = [...r.players.values()];
      stepDogs(r, players, dt, now); stepGeese(r, players, dt, now); stepGoats(r, players, dt, now); stepSky(r, players, now); stepPlats(r, players, now);
      if ((r.tick = (r.tick + 1) % 2)) continue;
      const dg = r.dogs.filter((d) => d.awake), gs = r.geese.filter((g) => g.awake), gt = r.goats.filter((g) => g.awake);
      r.slow = (r.slow + 1) % 10; const ps = players.length > 1 ? players.filter((p) => p.fresh || !r.slow).map((p) => { p.fresh = false; return [p.id, r2(p.x), r2(p.z), r2(p.yaw), p.mv, r2(p.y), p.ct || 0]; }) : [];
      if (ps.length || dg.length || gs.length || gt.length) all(r, { t: "snap", ts: now, ps, dogs: dg.map(dogView), geese: gs.map(gooseView), goats: gt.map(goatView) });
    }
  }, TICK_MS).unref();
  wss.game = { rooms, online };   // for the tests
  return wss;
}
