// One game session per account: a second connection replaces the first, which can no longer act.
import { connect, suite, sleep, H0 } from "./lib.mjs";
const t = suite("session");
const a = await connect();
a.dev({ cmd: "item", item: "cuprite", qty: 3 }); await sleep(400);
const q = (c) => (c.inv().hangars[0].slots.find((x) => x.item === "cuprite") || {}).qty || 0;
const before = q(a);
const b = await connect();
try { a.send({ t: "sell", ref: H0, slot: 0, item: "cuprite", qty: 1 }); } catch {}
await sleep(1200);
t.ok(a.closeCode === 4002, "the old session is closed with code 4002", a.closeCode);
const s0 = b.snaps; await sleep(1000);
t.ok(b.snaps - s0 > 5, "the new session keeps receiving snapshots");
t.ok(q(b) === before, "the replaced session's command is ignored", { before, after: q(b) });
await b.close();
t.done();
