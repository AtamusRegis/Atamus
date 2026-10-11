// Shared helpers for the PTR test suite (scripts/ptr-test.sh). The PTR must be running.
import WebSocket from "../../packages/server/node_modules/ws/index.js";

export const BASE = "http://localhost:8090";
export const SHIP = "1:ship:1";   // the PTR pilot Vera Kestrel (pilot 1 after a reset) flies ship <account>:ship:<pilot>
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A game connection that keeps the latest message of each type plus all system lines.
export async function connect(query = "") {
  const ws = new WebSocket(BASE.replace("http", "ws") + "/ws" + query, { headers: { origin: BASE } });
  const c = { ws, last: {}, msgs: [], snaps: 0, closeCode: null };
  ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "sys") c.msgs.push(m.text); else c.last[m.t] = m; if (m.t === "snap") c.snaps++; });
  ws.on("close", (code) => { c.closeCode = code; });
  await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
  await sleep(900);
  c.send = (o) => ws.send(typeof o === "string" ? o : JSON.stringify(o));
  c.dev = (o) => c.send({ t: "dev", ...o });
  c.ship = (id = SHIP) => (c.last.snap?.ships || []).find((x) => x.id === id);
  c.mine = () => (c.last.snap?.ships || []).find((x) => x.mine);
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
