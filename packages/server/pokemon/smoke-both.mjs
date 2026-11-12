// (owner, 2026-11-11) both games on one server, as on live (src/index.js): Critter Courier's socket at /pets and Pet
// Delivery Co.'s at /pokemon each answer their own players with their own saves, and any other path is turned away. Run: cd packages/server && node pokemon/smoke-both.mjs
process.env.ATAMUS_PTR = "1";
import http from "node:http";
import { WebSocket } from "ws";
import { routeUpgrades } from "../src/upgrades.js";
import { attachPets } from "../src/pets.js";
import { attachPokemon } from "../src/pokemon/pets.js";

const fail = (msg) => { console.error("SMOKE FAILED:", msg); process.exit(1); };
setTimeout(() => fail("both games: timed out"), 15000).unref();
const server = http.createServer((_q, s) => s.end("ok"));
const ends = routeUpgrades(server, ["/pets", "/pokemon"]);
attachPets(ends["/pets"], { allowLocal: true });
attachPokemon(ends["/pokemon"], { allowLocal: true });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `ws://127.0.0.1:${server.address().port}`;
const hello = (path, m) => new Promise((res, rej) => {
  const ws = new WebSocket(base + path);
  ws.on("open", () => ws.send(JSON.stringify(m)));
  ws.on("message", (raw) => { const j = JSON.parse(raw); if (j.t === "welcome") { ws.close(); res(j); } if (j.t === "auth_err") rej(new Error(path + " " + j.why)); });
  ws.on("error", (e) => rej(new Error(path + " " + e.message)));
});
try {
  const a = await hello("/pets", { t: "register", user: "bothA", pass: "pass1234" });
  const b = await hello("/pokemon", { t: "register", user: "bothA", pass: "pass1234" });
  if (!a.data || !b.data || !Array.isArray(b.data.pets)) fail("both games welcome their players");
  if (JSON.stringify(a.data) === JSON.stringify(b.data)) fail("the two games keep their own saves");
  const bad = await new Promise((res) => { const ws = new WebSocket(base + "/nope"); ws.on("open", () => res(false)); ws.on("error", () => res(true)); });
  if (!bad) fail("any other path is turned away");
} catch (e) { fail(e.message); }
console.log("smoke ok: both games on one server");
process.exit(0);
