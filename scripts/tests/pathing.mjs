// Pathfinding around asteroids and Library props (docs/FEATURES.md › Flying): random orders across real belt fields.
import { Obstacles, findPath } from "../../packages/server/src/game/pathing.js";
import { createBeltField } from "../../packages/server/src/game/belts.js";
import { libraryProps } from "../../packages/server/src/game/library.js";
import { suite } from "./lib.mjs";
const t = suite("pathing");
const PAD = 0.15;
let bad = 0, fails = 0, worst = 0, detours = 0, n = 0;
const check = (ix, a, b) => {
  const t0 = performance.now(), p = findPath(ix, a, b, PAD); worst = Math.max(worst, performance.now() - t0); n++;
  if (!p) { fails++; return; }
  if (p.length > 1) detours++;
  const skip = new Set(ix.containing(a.x, a.y, PAD)); let prev = a;
  for (const w of p) { if (ix.firstHit(prev.x, prev.y, w.x, w.y, PAD - 0.001, skip) >= 0) bad++; prev = w; }
  const e = p[p.length - 1]; if (Math.hypot(e.x - b.x, e.y - b.y) > 1e-9) bad++;
};
for (let trial = 0; trial < 20; trial++) {
  const f = createBeltField("b", 0, 0), ix = new Obstacles(); for (const k of f.rocks) ix.add({ x: k.x, y: k.y, r: k.r });
  const rp = () => { const a = f.dir + (Math.random() - 0.5) * Math.PI * 1.2, d = 35 + Math.random() * 18; return ix.pushOut({ x: Math.cos(a) * d, y: Math.sin(a) * d }, PAD + 0.01); };
  for (let q = 0; q < 20; q++) check(ix, rp(), rp());
}
const lx = new Obstacles(), props = libraryProps(); for (const o of props) lx.add({ x: o.x, y: o.y, hx: o.w / 2, hy: o.h / 2 });
const ys = props.map((o) => o.y), top = Math.max(...ys) + 4, bottom = Math.min(...ys) - 4;
for (let q = 0; q < 40; q++) check(lx, { x: (Math.random() - 0.5) * 30, y: bottom }, { x: (Math.random() - 0.5) * 30, y: top });
t.ok(!bad, "every leg of every path is clear of every object, and it ends at the destination", bad);
t.ok(!fails, "a path is always found", fails);
t.ok(detours > n / 4, "paths do go around things", { detours, n });
t.ok(worst < 250, "fast enough (worst " + worst.toFixed(1) + " ms)", worst);
t.done();
