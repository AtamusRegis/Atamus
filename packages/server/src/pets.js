// Pet Delivery Co. co-op (owner, 2026-11-08): a WebSocket at /pets.
// - Accounts: username / password (or a remembered token); each account's data (pets, coins, items, home) is kept here
//   and saved to the store (petstore.js). The page runs the game and sends its data back; a save is taken when it's
//   based on the latest copy (rev), otherwise the page is sent the latest copy.
// - Rooms of up to 16: where everyone is (10 times a second, stamped with the server's clock so pages play it back
//   smoothly), which pet they ride, animal control (pets-world.js, the same file the page uses) and wanted levels,
//   contracts (every delivery in the room counts, the reward split by deliveries) and chat.
// - Parties and trades between players, checked and carried out here.
// - Housing plots (owner, 2026-11-08): each player in a room gets a plot their house (kept in their data) stands on, seen
//   by everyone: VIPs the two on the VIP island, then the three near the middle (first come, first served), then one of
//   five around town at random; past 10 players the extra island's plots.
// Connections that go quiet are dropped; logging in again replaces the old connection. A new website build reloads
// everyone onto it.
import { WebSocketServer } from "ws";
import { makeVehicles, stepVehicles, cleanData, petCap, penPets } from "./pets-world.js";
import { onWebsiteUpdate, websiteBuild, websiteBy } from "./build.js";
import { hashSecret, verifySecret } from "./hash.js";
import { memStore } from "./petstore.js";

const ROOM_MAX = 16, SNAP_MS = 50, DEL_GAP_MS = 900, CHAT_GAP_MS = 1200, BEAT_MS = 10000, SAVE_MS = 3000, INVITE_MS = 30000, PARTY_MAX = 6;
const SPECIES = new Set(["pup", "kitten", "bunny", "duck", "fox", "penguin", "goat", "butterfly", "parrot", "stego", "deer", "bear", "horse", "owl", "trike", "raptor",
  "dragon", "unicorn", "pegasus", "phoenix", "trex", "ptero", "icedragon"]);
// (owner, 2026-11-08) three kinds of contract: the goal grows with the room; the reward is per parcel of the goal
const CONTRACTS = { rush: { time: 150, base: 3, per: 3, pay: 22 }, quick: { time: 240, base: 5, per: 4, pay: 26 }, big: { time: 420, base: 10, per: 8, pay: 30 } };   // (owner, 2026-11-08: more time)
const rooms = [], online = new Map();   // account id -> player
let nextId = 1;

const cleanChat = (s) => String(s || "").replace(/[\p{C}<>]/gu, "").replace(/\s+/g, " ").trim().slice(0, 120);
const num = (v, lim) => (Number.isFinite(+v) ? Math.max(-lim, Math.min(lim, +v)) : 0);
const color = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#3a8ee6");
const r2 = (v) => Math.round(v * 100) / 100;
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
// (owner, 2026-11-08) staff: Nyssary is always admin and the only one who makes or removes admins; admins make
// moderators and give items; moderators (and up) mute, kick and ban those below them
const OWNER = "nyssary", RANK = { player: 0, moderator: 1, admin: 2 };
const rankOf = (a) => (a.name.toLowerCase() === OWNER ? 3 : RANK[a.role] || 0);
const GIVE_ITEMS = new Set(["snack", "ribbon", "ticket"]);

function roomFor() {
  let r = rooms.find((q) => q.players.size < ROOM_MAX);
  if (!r) { r = { players: new Map(), contract: null, vs: makeVehicles(), last: Date.now(), plots: new Array(16).fill(null) }; rooms.push(r); }
  return r;
}
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const all = (r, o, skip) => { const s = JSON.stringify(o); for (const p of r.players.values()) if (p !== skip && p.ws.readyState === 1) p.ws.send(s); };
const pub = (p) => ({ id: p.id, name: p.name, sp: p.sp, lv: p.lv, shirt: p.shirt, x: p.x, y: p.y, z: p.z, yaw: p.yaw, stars: p.stars, inst: p.inst, ft: p.ft });
const plotMsg = (plot, p) => {
  if (!p) return { t: "plot", plot, id: 0, name: "", pieces: [] };
  const d = p.acct.data, penSp = {};   // which kind of pet is in each playpen, so others see it
  for (const t of d.home.pieces) if (t.k === "pen" && t.pet) { const q = d.pets.find((x) => x.id === t.pet); if (q) penSp[t.pet] = q.sp; }
  return { t: "plot", plot, id: p.id, name: p.name, pieces: d.home.pieces, penSp };
};
function assignPlot(r, p) {
  const free = (ids) => ids.filter((i) => !r.plots[i]);
  let pick = null;
  if (p.acct.vip) pick = free([3, 4])[0];
  if (pick === undefined || pick === null) pick = free([0, 1, 2])[0];
  if (pick === undefined) { const f = free([5, 6, 7, 8, 9]); pick = f.length ? f[Math.floor(Math.random() * f.length)] : undefined; }
  if (pick === undefined) pick = free([10, 11, 12, 13, 14, 15])[0];
  if (pick === undefined) return;
  r.plots[pick] = p; p.plot = pick;
}
function contractFor(r, p) {
  const c = r.contract; if (!c) return null;
  return { kind: c.kind, goal: c.goal, done: c.done, mine: c.by.get(p.id) || 0, left: Math.max(0, (c.ends - Date.now()) / 1000), pool: c.pool };
}
function sendContract(r) { for (const p of r.players.values()) send(p.ws, { t: "contract", c: contractFor(r, p) }); }
function finish(r, won) {
  const c = r.contract; r.contract = null;
  for (const p of r.players.values()) {
    // (owner, 2026-11-08) won: a share by deliveries; lost: whoever delivered gets a consolation by how close the room came
    const n = c.by.get(p.id) || 0, pay = won && n > 0 ? Math.round((c.pool * n) / c.done) : 0;
    send(p.ws, { t: "done", won, pay, progress: c.done / c.goal, helped: n > 0 });
  }
  sendContract(r);
}

export function attachPets(server, { origins = [], allowLocal = false, store = memStore() } = {}) {
  // ---- saving: changed accounts are written every few seconds (and when their player leaves) ----
  const dirty = new Set();
  const flush = async (acct) => { dirty.delete(acct); try { await store.save(acct.id, acct.data, acct.rev); } catch (e) { console.error("[pets] save", e.message); dirty.add(acct); } };
  setInterval(() => { for (const a of [...dirty]) flush(a); }, SAVE_MS).unref();
  const changed = (p) => { p.acct.rev++; dirty.add(p.acct); };
  const pushData = (p) => send(p.ws, { t: "data", rev: p.acct.rev, data: p.acct.data });

  // ---- parties ----
  const invites = new Map();   // "to:from:kind" -> expiry
  function sendParty(party) { const ms = [...party.members].map((q) => ({ id: q.id, name: q.name })); for (const q of party.members) send(q.ws, { t: "party", members: ms }); }
  function leaveParty(p) {
    const party = p.party; if (!party) return; party.members.delete(p); p.party = null; send(p.ws, { t: "party", members: [] });
    if (party.members.size < 2) { for (const q of party.members) { q.party = null; send(q.ws, { t: "party", members: [] }); } } else sendParty(party);
  }
  // ---- trades ----
  function endTrade(T, why, done) { for (const s of [T.a, T.b]) { s.p.trade = null; send(s.p.ws, { t: "trade_end", why, done: !!done }); } }
  function sendTrade(T) {
    const view = (s) => ({ pets: s.pets.map((id) => s.p.acct.data.pets.find((q) => q.id === id)).filter(Boolean), coins: s.coins, ready: s.ready });
    send(T.a.p.ws, { t: "trade", name: T.b.p.name, me: view(T.a), them: view(T.b) });
    send(T.b.p.ws, { t: "trade", name: T.a.p.name, me: view(T.b), them: view(T.a) });
  }
  function doTrade(T) {
    const A = T.a, B = T.b, da = A.p.acct.data, db = B.p.acct.data;
    const okSide = (s, d, other) => {
      const pens = penPets(d), mine = new Set(d.pets.map((q) => q.id));
      if (!s.pets.every((id) => mine.has(id) && !pens.has(id))) return false;
      if (s.coins > d.coins) return false;
      if (d.pets.length - s.pets.length < 1) return false;   // everyone keeps a pet
      return other.pets.length <= s.pets.length || d.pets.length - s.pets.length + other.pets.length <= petCap(d);
    };
    if (!okSide(A, da, B) || !okSide(B, db, A)) return endTrade(T, "failed");
    const move = (from, to, ids) => {
      const out = from.pets.filter((q) => ids.includes(q.id)); from.pets = from.pets.filter((q) => !ids.includes(q.id));
      if (!from.pets.some((q) => q.id === from.ride)) from.ride = from.pets[0].id;
      for (const q of out) to.pets.push({ id: to.nextId++, sp: q.sp, lv: q.lv });
    };
    move(da, db, A.pets); move(db, da, B.pets);
    da.coins += B.coins - A.coins; db.coins += A.coins - B.coins;
    changed(A.p); changed(B.p); flush(A.p.acct); flush(B.p.acct); pushData(A.p); pushData(B.p);
    endTrade(T, "done", true);
  }
  // ---- the admin panel (owner, 2026-11-08) ----
  const staffView = (a, p) => ({ id: a.id, name: a.name, role: rankOf(a) === 3 ? "owner" : a.role, vip: !!a.vip, online: !!p, muted: a.muteUntil > Date.now() ? (a.muteUntil === Infinity ? -1 : a.muteUntil) : 0, banned: a.banUntil > Date.now() ? (a.banUntil === Infinity ? -1 : a.banUntil) : 0 });
  async function admin(me, m) {
    const my = rankOf(me.acct); if (my < 1) return;
    const reply = (msg) => send(me.ws, { t: "admin_msg", msg });
    if (m.op === "list") {
      const list = [...online.values()].map((p) => staffView(p.acct, p));
      if (m.q && /^[A-Za-z0-9_]{1,16}$/.test(m.q)) for (const a of await store.search(m.q)) if (!online.has(a.id)) list.push(staffView(a, null));
      send(me.ws, { t: "admin_list", list, q: m.q || "" }); return;
    }
    const id = +m.id, p = online.get(id), a = p ? p.acct : await store.byId(id);
    if (!a) return reply("Not found");
    const theirs = rankOf(a);
    if (theirs >= my && a.id !== me.acct.id) return reply("Not allowed");
    const log = (action, detail) => { store.log(me.name, a.name, action, detail).catch(() => {}); console.log(`[pets] ${me.name} ${action} ${a.name} ${detail || ""}`); };
    const until = (mins) => (mins === "perma" ? Infinity : Date.now() + Math.max(1, Math.min(525600, +mins || 60)) * 60000);
    switch (m.op) {
      case "role": {
        const role = RANK[m.role] !== undefined ? m.role : null; if (!role || a.id === me.acct.id) return reply("Not allowed");
        if (my < 3 && (role === "admin" || a.role === "admin" || my < 2)) return reply("Not allowed");   // only the owner makes / removes admins; admins make moderators
        a.role = role; await store.setRole(a.id, role); if (p) send(p.ws, { t: "role", role }); log("role", role); break;
      }
      case "mute": { const u = m.mins === "off" ? 0 : until(m.mins); a.muteUntil = u; await store.setMute(a.id, u); if (p) send(p.ws, { t: "muted", until: u === Infinity ? -1 : u }); log("mute", String(m.mins)); break; }
      case "vip": {   // (owner, 2026-11-08) admins give or take VIP (the VIP island's plots, from their next login)
        if (my < 2) return reply("Not allowed");
        a.vip = !!m.on; await store.setVip(a.id, a.vip); if (p) send(p.ws, { t: "vip", on: a.vip }); log("vip", String(a.vip)); break;
      }
      case "kick": if (p) { send(p.ws, { t: "kicked", why: "kick" }); p.ws.terminate(); } log("kick"); break;
      case "ban": {
        const u = m.mins === "off" ? 0 : until(m.mins); a.banUntil = u; await store.setBan(a.id, u);
        if (u && p) { send(p.ws, { t: "kicked", why: "banned", until: u === Infinity ? -1 : u }); p.ws.terminate(); }
        log("ban", String(m.mins)); break;
      }
      case "give": {   // admins: coins, an item, Treats or a pet
        if (my < 2) return reply("Not allowed");
        const n = Math.max(1, Math.min(1e7, Math.floor(+m.n || 1))), what = String(m.what || ""), d = cleanData(a.data, SPECIES);
        if (what === "coins") d.coins += n;
        else if (GIVE_ITEMS.has(what)) d.items[what] += n;
        else if (what.startsWith("treat:") && SPECIES.has(what.slice(6))) d.treats[what.slice(6)] = (d.treats[what.slice(6)] || 0) + n;
        else if (what.startsWith("pet:") && SPECIES.has(what.slice(4))) { const lv = Math.max(1, Math.min(20, Math.floor(+m.lv || 1))); for (let k = 0; k < Math.min(n, 50); k++) d.pets.push({ id: d.nextId++, sp: what.slice(4), lv }); }
        else return reply("Unknown");
        a.data = d;
        if (p) { changed(p); pushData(p); flush(p.acct); } else { a.rev++; await store.save(a.id, a.data, a.rev); }
        log("give", what + " x" + n); break;
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
            acct = await store.create(user, await hashSecret(pass), cleanData(m.data, SPECIES));
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
        const wasOld = !!(acct.data && acct.data.home && !Array.isArray(acct.data.home.pieces));
        acct.data = cleanData(acct.data, SPECIES); if (wasOld) { acct.rev++; dirty.add(acct); }   // a home from before plots, turned into a house (and the refund) once
        const old = online.get(acct.id);
        if (old) { send(old.ws, { t: "kicked" }); old.ws.terminate(); gone(old); acct = old.acct; }   // logged in again: the old connection goes
        room = roomFor();
        me = { id: nextId++, ws, room, acct, name: acct.name, sp: SPECIES.has(m.sp) ? m.sp : "pup", lv: Math.max(1, Math.min(20, m.lv | 0)), shirt: color(m.shirt),
          x: num(m.x, 6000), y: num(m.y, 300), z: num(m.z, 6000), yaw: 0, mv: 0, lastDel: 0, lastChat: 0, stars: old ? old.stars : 0, lastChased: 0, lastStar: 0, immuneUntil: 0, inst: 0, party: null, trade: null, plot: -1, ft: 0 };
        online.set(acct.id, me);
        assignPlot(room, me);
        send(ws, { t: "welcome", web: websiteBuild(), by: websiteBy(), id: me.id, name: me.name, role: rankOf(acct) >= 2 ? "admin" : acct.role, token, data: acct.data, rev: acct.rev, players: [...room.players.values()].map(pub), contract: null, stars: me.stars, vip: !!acct.vip, plot: me.plot, plots: room.plots.map((p, i) => (p ? plotMsg(i, p) : null)).filter(Boolean) });
        room.players.set(me.id, me);
        all(room, { t: "join", p: pub(me) }, me);
        if (me.plot >= 0) all(room, plotMsg(me.plot, me), me);
        send(ws, { t: "contract", c: contractFor(room, me) });
      } catch (e) { console.error("[pets] auth", e.message); authErr("server"); }
      finally { busy = false; }
    }
    function gone(p) {
      if (p.gone) return; p.gone = true;
      if (p.trade) endTrade(p.trade, "left");
      leaveParty(p);
      const r = p.room; if (r && r.players.get(p.id) === p) {
        if (p.plot >= 0 && r.plots[p.plot] === p) { r.plots[p.plot] = null; all(r, plotMsg(p.plot, null)); }
        r.players.delete(p.id); all(r, { t: "leave", id: p.id });
        if (!r.players.size) { r.contract = null; rooms.splice(rooms.indexOf(r), 1); }
      }
      if (online.get(p.acct.id) === p) { online.delete(p.acct.id); flush(p.acct); }
    }
    ws.on("message", (raw) => {
      ws.alive = true;
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!me) { if (m.t === "login" || m.t === "register" || m.t === "resume") auth(m); return; }
      if (me.gone) return;
      const d = me.acct.data;
      switch (m.t) {
        // (owner, 2026-11-08: rubber-banding) each position carries the sender's own clock, passed on so others replay it at its true pace
        case "pos": me.x = num(m.x, 6000); me.y = num(m.y, 300); me.z = num(m.z, 6000); me.yaw = num(m.yaw, 10); me.mv = m.mv ? 1 : 0; me.ct = Number.isFinite(+m.ct) ? +m.ct : 0; me.bag = Math.max(0, Math.min(99, m.bag | 0)); me.ft = m.ft ? 1 : 0; me.fresh = true; break;
        case "pet": if (SPECIES.has(m.sp)) { me.sp = m.sp; me.lv = Math.max(1, Math.min(20, m.lv | 0)); all(room, { t: "pet", id: me.id, sp: me.sp, lv: me.lv }, me); } break;
        case "save": {
          if (m.rev !== me.acct.rev) { pushData(me); break; }
          const before = JSON.stringify(d.home);
          me.acct.data = cleanData(m.data, SPECIES); changed(me); send(ws, { t: "saved", rev: me.acct.rev });
          if (JSON.stringify(me.acct.data.home) !== before && me.plot >= 0) all(room, plotMsg(me.plot, me), me);   // everyone sees the house change
          break;
        }
        case "chat": {   // (owner, 2026-11-08)
          const now = Date.now(), text = cleanChat(m.text); if (!text || now - me.lastChat < CHAT_GAP_MS) break;
          if (me.acct.muteUntil > now) { send(ws, { t: "muted", until: me.acct.muteUntil === Infinity ? -1 : me.acct.muteUntil }); break; }
          me.lastChat = now; all(room, { t: "chat", id: me.id, name: me.name, text }, me); break;
        }
        case "start": if (!room.contract) {
          const kind = CONTRACTS[m.kind] ? m.kind : "big", k = CONTRACTS[kind], goal = k.base + k.per * room.players.size;
          room.contract = { kind, goal, done: 0, by: new Map(), ends: Date.now() + k.time * 1000, pool: goal * k.pay };
          sendContract(room);
        } break;
        case "del": {
          const now = Date.now(); if (now - me.lastDel < DEL_GAP_MS) break;   // no faster than a pet can deliver
          me.lastDel = now; all(room, { t: "fx", id: me.id, k: "del" }, me);   // (owner, 2026-11-08) the others see its confetti
          const c = room.contract; if (!c) break;
          c.done++; c.by.set(me.id, (c.by.get(me.id) || 0) + 1);
          if (c.done >= c.goal) finish(room, true); else sendContract(room);
          break;
        }
        // (owner, 2026-11-08) inviting another player (F next to them): to a party or a trade; to your house (your party)
        case "invite": {
          const to = room.players.get(m.id); if (!to || to === me) break;
          const kind = m.kind === "trade" ? "trade" : "party";
          if (kind === "party" && me.party && me.party === to.party) break;
          invites.set(`${to.id}:${me.id}:${kind}`, Date.now() + INVITE_MS); send(to.ws, { t: "invited", from: me.id, name: me.name, kind }); break;
        }
        case "answer": {
          const kind = ["party", "trade", "home"].includes(m.kind) ? m.kind : "", key = `${me.id}:${m.from}:${kind}`, exp = invites.get(key); invites.delete(key);
          const from = room.players.get(m.from); if (!from || !exp || exp < Date.now() || !m.yes) { if (from && kind) send(from.ws, { t: "declined", name: me.name, kind }); break; }
          if (kind === "party") {
            if (me.party && me.party !== from.party) leaveParty(me);
            const party = from.party || (from.party = { members: new Set([from]) });
            if (party.members.size >= PARTY_MAX) break;
            party.members.add(me); me.party = party; sendParty(party);
          } else if (kind === "trade") {
            if (me.trade || from.trade) break;
            const T = { a: { p: from, pets: [], coins: 0, ready: false }, b: { p: me, pets: [], coins: 0, ready: false } }; from.trade = me.trade = T; sendTrade(T);
          }
          break;
        }
        case "party_leave": leaveParty(me); break;
        case "admin": admin(me, m).catch((e) => { console.error("[pets] admin", e.message); send(ws, { t: "admin_msg", msg: "Failed" }); }); break;
        case "trade_offer": {
          const T = me.trade; if (!T) break; const s = T.a.p === me ? T.a : T.b, pens = penPets(d), mine = new Set(d.pets.map((q) => q.id));
          s.pets = [...new Set((Array.isArray(m.pets) ? m.pets : []).filter((id) => mine.has(id) && !pens.has(id)))].slice(0, 12);
          s.coins = Math.max(0, Math.min(d.coins, Math.floor(+m.coins || 0)));
          T.a.ready = T.b.ready = false; sendTrade(T); break;
        }
        case "trade_ready": {
          const T = me.trade; if (!T) break; const s = T.a.p === me ? T.a : T.b; s.ready = !!m.on;
          if (T.a.ready && T.b.ready) doTrade(T); else sendTrade(T); break;
        }
        case "trade_cancel": if (me.trade) endTrade(me.trade, "cancel"); break;
      }
    });
    ws.on("close", () => { if (me) gone(me); });
    ws.on("error", () => {});
  });
  // (owner, 2026-11-08) a new website build is live: everyone reloads onto it
  onWebsiteUpdate((v, by) => { const s = JSON.stringify({ t: "reload", web: v, by }); for (const ws of wss.clients) if (ws.readyState === 1) ws.send(s); });
  // a connection that doesn't answer a ping within 10 s is dropped
  setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch { /* closing */ } } }, BEAT_MS).unref();
  // animal control (for those out in town), where everyone is, and contracts running out of time
  setInterval(() => {
    const now = Date.now();
    for (const [k, exp] of invites) if (exp < now) invites.delete(k);
    for (const r of rooms) {
      const dt = Math.min(0.5, (now - r.last) / 1000); r.last = now;
      const players = [...r.players.values()];
      for (const e of stepVehicles(r.vs, players.filter((p) => !p.inst), dt, now / 1000)) { const p = r.players.get(e.id); if (p) send(p.ws, { t: e.k, stars: e.stars || 0 }); }
      if (r.tick = !r.tick) all(r, { t: "veh", ts: now, v: r.vs.map((v) => [r2(v.x), r2(v.y), r2(v.z), r2(v.yaw), v.mode, v.target]) });   // vehicles 10 times a second
      if (players.length > 1) { const ps = players.filter((p) => p.fresh || r.tick).map((p) => { p.fresh = false; return [p.id, p.x, p.z, p.yaw, p.mv, p.y, p.stars, p.inst, p.ct || 0, p.ft]; }); if (ps.length) all(r, { t: "snap", ts: now, ps }); }
      if (r.contract && now > r.contract.ends) finish(r, false);
    }
  }, SNAP_MS).unref();
  return wss;
}
