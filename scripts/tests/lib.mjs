// Shared helpers for the PTR test suite (scripts/ptr-test.sh). The PTR must be running.
import WebSocket from "../../packages/server/node_modules/ws/index.js";

export const BASE = "http://localhost:8090";
export const STATION = { x: -52, y: 38 };
export const SHIP = "1:ship:0";
export const H0 = { owner: "station", inv: "hangar", h: 0 };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A game connection that keeps the latest message of each type plus all system lines.
export async function connect() {
  const ws = new WebSocket(BASE.replace("http", "ws") + "/ws", { headers: { origin: BASE } });
  const c = { ws, last: {}, msgs: [], snaps: 0, closeCode: null };
  ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "sys") c.msgs.push(m.text); else c.last[m.t] = m; if (m.t === "snap") c.snaps++; });
  ws.on("close", (code) => { c.closeCode = code; });
  await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
  await sleep(900);
  c.send = (o) => ws.send(typeof o === "string" ? o : JSON.stringify(o));
  c.dev = (o) => c.send({ t: "dev", ...o });
  c.inv = () => c.last.inv;
  c.ship = (id = SHIP) => (c.last.snap?.ships || []).find((x) => x.id === id);
  c.close = async () => { ws.close(); await sleep(300); };
  return c;
}
export const health = async () => { try { return (await fetch(BASE + "/healthz")).ok; } catch { return false; } };
export const firstPilotId = async () => (await (await fetch(BASE + "/game/state")).json()).pilots[0].id;

// Tiny assertion collector: every test file prints its results and exits non-zero on any failure.
export function suite(name) {
  const fails = []; let n = 0;
  return {
    ok(cond, label, extra) { n++; if (!cond) fails.push(label + (extra !== undefined ? " → " + JSON.stringify(extra) : "")); },
    done() {
      if (fails.length) { console.log(`✗ ${name}: ${fails.length}/${n} failed`); for (const f of fails) console.log("   - " + f); process.exit(1); }
      console.log(`✓ ${name}: ${n} checks`); process.exit(0);
    },
  };
}
// Put the test pilot's ship docked at the station, crewed, with an empty ore hold.
export async function resetShip(c) {   // (also brings the ship back from an asteroid instance)
  if (!c.ship().docked) { c.dev({ cmd: "move", ship: SHIP, x: STATION.x, y: STATION.y, sys: "sys:" + c.last.hello.you.id }); await sleep(300); c.send({ t: "dock", ship: SHIP, dock: true }); await sleep(600); }
  if (c.ship().pilot == null) { c.send({ t: "crew", ship: SHIP, pilot: await firstPilotId() }); await sleep(800); }
  for (let k = 0; k < 6 && c.inv().ships[SHIP].ore.slots.length; k++) { c.send({ t: "inv_move", from: { owner: "ship", id: SHIP, inv: "ore", slot: 0 }, to: H0 }); await sleep(300); }
  for (const L of [0, 1]) c.send({ t: "power", ship: SHIP, mod: "laser", idx: L, on: true });
  c.send({ t: "power", ship: SHIP, mod: "auto", on: true }); await sleep(200);
}
// Undock, spawn belts, park beside a rock and lock it. Returns the rock.
export async function atRock(c) {
  c.send({ t: "dock", ship: SHIP, dock: false }); await sleep(500);
  c.dev({ cmd: "belts" }); await sleep(600);
  const belts = c.last.belts?.belts || c.last.hello.belts, r = belts.find((b) => b.rocks.length).rocks[0];
  c.dev({ cmd: "move", ship: SHIP, x: r.x + 0.4, y: r.y }); await sleep(400);
  c.send({ t: "lock", ship: SHIP, kind: "rock", id: r.id }); await sleep(3600);
  return r;
}
