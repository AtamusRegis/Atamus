// (owner, 2026-10-16) Asteroids from seeds. This file is kept identical in packages/server/src/game/ringgen.js and
// website/ringgen.js (scripts/check.sh compares them): the server rolls each asteroid's seed from its secret and sends
// only the seed; the client turns it into the same position and size. What's inside (the ore) comes from the secret
// on the server alone, so it can't be read out of the seeds. Only integer math, + - * / and sqrt, so every browser
// gets exactly the server's numbers.
export function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// one asteroid of grid cell (cx, cy): its position, its ring and its size (1 crack per size; small ones are commoner)
export function genRock(cx, cy, seed, cell, rings, sizes) {
  const rand = rng(seed), x = cx * cell + rand() * cell, y = cy * cell + rand() * cell, r = Math.sqrt(x * x + y * y);
  let ring = -1; for (let i = 0; i < rings.length; i++) if (r >= rings[i][0] && r <= rings[i][1]) ring = i;
  if (ring < 0) return null;
  const lo = sizes[ring][0], hi = sizes[ring][1], u = Math.min(rand(), rand());
  return { x, y, ring, n: Math.min(hi, lo + Math.floor((hi - lo + 1) * u)) };
}
