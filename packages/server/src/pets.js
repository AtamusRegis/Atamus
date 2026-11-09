// Pet Delivery Co. co-op (owner, 2026-11-08): a WebSocket at /pets. Players are put in rooms of up to 16; the server
// shares where everyone is (10 times a second) and which pet they ride, and runs each room's big contract: anyone starts
// it, every delivery in the room counts, and when the goal's met in time the reward is split by deliveries. Everything
// else (the town, parcels, coins, pets) lives in the players' browsers.
import { WebSocketServer } from "ws";

const ROOM_MAX = 16, SNAP_MS = 100, DEL_GAP_MS = 900;
const SPECIES = new Set(["pup", "kitten", "bunny", "duck", "fox", "penguin", "goat", "butterfly", "parrot", "stego", "deer", "bear", "horse", "owl", "trike", "raptor",
  "dragon", "unicorn", "pegasus", "phoenix", "trex", "ptero", "icedragon"]);
// (owner, 2026-11-08) three kinds of contract: the goal grows with the room; the reward is per parcel of the goal
const CONTRACTS = { rush: { time: 60, base: 3, per: 3, pay: 22 }, quick: { time: 90, base: 5, per: 4, pay: 26 }, big: { time: 180, base: 10, per: 8, pay: 30 } };
const rooms = [];
let nextId = 1;

const clean = (s, n) => String(s || "").replace(/[^\p{L}\p{N} '_-]/gu, "").trim().slice(0, n);
const num = (v, lim) => (Number.isFinite(+v) ? Math.max(-lim, Math.min(lim, +v)) : 0);
const color = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#3a8ee6");

function roomFor() {
  let r = rooms.find((q) => q.players.size < ROOM_MAX);
  if (!r) { r = { players: new Map(), contract: null }; rooms.push(r); }
  return r;
}
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const all = (r, o, skip) => { const s = JSON.stringify(o); for (const p of r.players.values()) if (p !== skip && p.ws.readyState === 1) p.ws.send(s); };
const pub = (p) => ({ id: p.id, name: p.name, sp: p.sp, shirt: p.shirt, x: p.x, y: p.y, z: p.z, yaw: p.yaw });
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

export function attachPets(server, { origins = [], allowLocal = false } = {}) {
  const wss = new WebSocketServer({
    server, path: "/pets", maxPayload: 2048,
    verifyClient: ({ origin }) => !origin || origins.includes(origin) || (allowLocal && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)),
  });
  wss.on("connection", (ws) => {
    let me = null, room = null;
    ws.on("message", (data) => {
      let m; try { m = JSON.parse(data); } catch { return; }
      if (!me) {
        if (m.t !== "hi") return;
        room = roomFor();
        me = { id: nextId++, ws, name: clean(m.name, 18) || "Courier", sp: SPECIES.has(m.sp) ? m.sp : "pup", shirt: color(m.shirt), x: num(m.x, 130), y: num(m.y, 80), z: num(m.z, 130), yaw: 0, mv: 0, lastDel: 0, dirty: true };
        send(ws, { t: "welcome", id: me.id, players: [...room.players.values()].map(pub), contract: null });
        room.players.set(me.id, me);
        all(room, { t: "join", p: pub(me) }, me);
        send(ws, { t: "contract", c: contractFor(room, me) });
        return;
      }
      if (m.t === "pos") { me.x = num(m.x, 130); me.y = num(m.y, 80); me.z = num(m.z, 130); me.yaw = num(m.yaw, 10); me.mv = m.mv ? 1 : 0; me.dirty = true; }
      else if (m.t === "pet" && SPECIES.has(m.sp)) { me.sp = m.sp; all(room, { t: "pet", id: me.id, sp: me.sp }, me); }
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
    ws.on("close", () => {
      if (!me) return;
      room.players.delete(me.id); all(room, { t: "leave", id: me.id });
      if (!room.players.size) { room.contract = null; rooms.splice(rooms.indexOf(room), 1); }
    });
    ws.on("error", () => {});
  });
  // where everyone is, and contracts running out of time
  setInterval(() => {
    for (const r of rooms) {
      const ps = []; for (const p of r.players.values()) if (p.dirty) { ps.push([p.id, p.x, p.z, p.yaw, p.mv, p.y]); p.dirty = false; }
      if (ps.length) all(r, { t: "snap", ps });
      if (r.contract && Date.now() > r.contract.ends) finish(r, false);
    }
  }, SNAP_MS).unref();
  return wss;
}
