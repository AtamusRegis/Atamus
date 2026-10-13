// One game session per account: a second connection replaces the first, which can no longer act.
import { connect, suite, sleep, SHIP } from "./lib.mjs";
const t = suite("session");
const a = await connect();
a.dev({ cmd: "move", x: 0, y: 0 }); await sleep(400);
const b = await connect();
try { a.send({ t: "move", ship: SHIP, x: 50, y: 0 }); } catch {}
await sleep(1200);
t.ok(a.closeCode === 4002, "the old session is closed with code 4002", a.closeCode);
const s0 = b.snaps; await sleep(1000);
t.ok(b.snaps - s0 > 5, "the new session keeps receiving snapshots");
t.ok(!b.ship().moving && Math.abs(b.ship().x) < 0.5, "the replaced session's command is ignored", b.ship());
await b.close();
t.done();
