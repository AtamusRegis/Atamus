// Pet Delivery Co. co-op (owner, 2026-11-08): a WebSocket at /pets. Players are put in rooms of up to 16; the server
// shares where everyone is (10 times a second, stamped with its clock so pages can play it back smoothly) and which
// pet they ride, runs each room's animal control (pets-world.js, the same file the page uses) and wanted levels, its
// contracts (anyone starts one, every delivery in the room counts, the reward is split by deliveries) and its chat.
// Everything else (parcels, coins, pets) lives in the players' browsers.
// Connections that go quiet are dropped, and a page that reconnects (same session key) replaces its old connection,
// so nobody's left standing in town after they've gone.
import { WebSocketServer } from "ws";
import { makeVehicles, stepVehicles } from "./pets-world.js";

const ROOM_MAX = 16, SNAP_MS = 100, DEL_GAP_MS = 900, CHAT_GAP_MS = 1200, BEAT_MS = 10000;
const SPECIES = new Set(["pup", "kitten", "bunny", "duck", "fox", "penguin", "goat", "butterfly", "parrot", "stego", "deer", "bear", "horse", "owl", "trike", "raptor",
  "dragon", "unicorn", "pegasus", "phoenix", "trex", "ptero", "icedragon"]);
// (owner, 2026-11-08) three kinds of contract: the goal grows with the room; the reward is per parcel of the goal
const CONTRACTS = { rush: { time: 60, base: 3, per: 3, pay: 22 }, quick: { time: 90, base: 5, per: 4, pay: 26 }, big: { time: 180, base: 10, per: 8, pay: 30 } };
const rooms = [], byKey = new Map();
let nextId = 1;

const clean = (s, n) => String(s || "").replace(/[^\p{L}\p{N} '_-]/gu, "").trim().slice(0, n);
const cleanChat = (s) => String(s || "").replace(/[\p{C}<>]/gu, "").replace(/\s+/g, " ").trim().slice(0, 120);
const num = (v, lim) => (Number.isFinite(+v) ? Math.max(-lim, Math.min(lim, +v)) : 0);
const color = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#3a8ee6");
const r2 = (v) => Math.round(v * 100) / 100;

function roomFor() {
  let r = rooms.find((q) => q.players.size < ROOM_MAX);
  if (!r) { r = { players: new Map(), contract: null, vs: makeVehicles(), last: Date.now() }; rooms.push(r); }
  return r;
}
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const all = (r, o, skip) => { const s = JSON.stringify(o); for (const p of r.players.values()) if (p !== skip && p.ws.readyState === 1) p.ws.send(s); };
const pub = (p) => ({ id: p.id, name: p.name, sp: p.sp, lv: p.lv, shirt: p.shirt, x: p.x, y: p.y, z: p.z, yaw: p.yaw, stars: p.stars });
// what each player sees of the contract (their own count included)
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
function leave(me, room) {
  if (!room.players.has(me.id)) return;
  room.players.delete(me.id); if (byKey.get(me.key) === me) byKey.delete(me.key);
  all(room, { t: "leave", id: me.id });
  if (!room.players.size) { room.contract = null; rooms.splice(rooms.indexOf(room), 1); }
}

export function attachPets(server, { origins = [], allowLocal = false } = {}) {
  const wss = new WebSocketServer({
    server, path: "/pets", maxPayload: 2048,
    verifyClient: ({ origin }) => !origin || origins.includes(origin) || (allowLocal && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)),
  });
  wss.on("connection", (ws) => {
    let me = null, room = null;
    ws.alive = true; ws.on("pong", () => (ws.alive = true));
    ws.on("message", (data) => {
      ws.alive = true;
      let m; try { m = JSON.parse(data); } catch { return; }
      if (!me) {
        if (m.t !== "hi") return;
        const key = String(m.key || "").slice(0, 40), old = key && byKey.get(key);
        if (old) { old.ws.terminate(); leave(old, old.room); }   // the same page come back: its old self goes
        room = roomFor();
        me = { id: nextId++, key, ws, room, name: clean(m.name, 18) || "Courier", sp: SPECIES.has(m.sp) ? m.sp : "pup", lv: Math.max(1, Math.min(20, m.lv | 0)), shirt: color(m.shirt), x: num(m.x, 400), y: num(m.y, 200), z: num(m.z, 400), yaw: 0, mv: 0, lastDel: 0, lastChat: 0,
          stars: old ? old.stars : 0, lastChased: 0, lastStar: 0, immuneUntil: 0 };
        if (key) byKey.set(key, me);
        send(ws, { t: "welcome", id: me.id, players: [...room.players.values()].map(pub), contract: null, stars: me.stars });
        room.players.set(me.id, me);
        all(room, { t: "join", p: pub(me) }, me);
        send(ws, { t: "contract", c: contractFor(room, me) });
        return;
      }
      if (m.t === "pos") { me.x = num(m.x, 400); me.y = num(m.y, 200); me.z = num(m.z, 400); me.yaw = num(m.yaw, 10); me.mv = m.mv ? 1 : 0; }
      else if (m.t === "pet" && SPECIES.has(m.sp)) { me.sp = m.sp; me.lv = Math.max(1, Math.min(20, m.lv | 0)); all(room, { t: "pet", id: me.id, sp: me.sp, lv: me.lv }, me); }
      else if (m.t === "chat") {   // (owner, 2026-11-08)
        const now = Date.now(), text = cleanChat(m.text); if (!text || now - me.lastChat < CHAT_GAP_MS) return;
        me.lastChat = now; all(room, { t: "chat", id: me.id, name: me.name, text }, me);
      }
      else if (m.t === "start" && !room.contract) {
        const kind = CONTRACTS[m.kind] ? m.kind : "big", k = CONTRACTS[kind], goal = k.base + k.per * room.players.size;
        room.contract = { kind, goal, done: 0, by: new Map(), ends: Date.now() + k.time * 1000, pool: goal * k.pay };
        sendContract(room);
      }
      else if (m.t === "del") {
        const now = Date.now(); if (now - me.lastDel < DEL_GAP_MS) return;   // no faster than a pet can deliver
        me.lastDel = now;
        all(room, { t: "fx", id: me.id, k: "del" }, me);   // (owner, 2026-11-08) the others see its confetti
        const c = room.contract; if (!c) return;
        c.done++; c.by.set(me.id, (c.by.get(me.id) || 0) + 1);
        if (c.done >= c.goal) finish(room, true); else sendContract(room);
      }
    });
    ws.on("close", () => { if (me) leave(me, room); });
    ws.on("error", () => {});
  });
  // a connection that doesn't answer a ping within 10 s is dropped
  setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch { /* closing */ } } }, BEAT_MS).unref();
  // animal control, where everyone is, and contracts running out of time
  setInterval(() => {
    const now = Date.now();
    for (const r of rooms) {
      const dt = Math.min(0.5, (now - r.last) / 1000); r.last = now;
      const players = [...r.players.values()];
      for (const e of stepVehicles(r.vs, players, dt, now / 1000)) {
        const p = r.players.get(e.id); if (!p) continue;
        send(p.ws, { t: e.k, stars: e.stars || 0 });
      }
      all(r, { t: "veh", ts: now, v: r.vs.map((v) => [r2(v.x), r2(v.y), r2(v.z), r2(v.yaw), v.mode, v.target]) });
      if (players.length > 1) all(r, { t: "snap", ts: now, ps: players.map((p) => [p.id, p.x, p.z, p.yaw, p.mv, p.y, p.stars]) });
      if (r.contract && now > r.contract.ends) finish(r, false);
    }
  }, SNAP_MS).unref();
  return wss;
}
