// (owner, 2026-10-16) The art, drawn on the game's canvas: the seven ships on one hull (the owner-approved sketch sheet,
// "Ring Mining Ships"), the station, asteroids and Saturn. Ships are drawn in the sheet's own units (180 wide, nose up)
// and scaled to the world (ART m per unit); everything animates from the time and the ship's state.
export const C = {
  void: "#0b0e15", plate: "#121824", rule: "#263044", ink: "#ebe5d6", dim: "#9c9888",
  hull: "#4a515e", hullDk: "#2f3540", hullLt: "#6b7382", glass: "#bfe9ff",
  gold: "#d8b06a", ice: "#7cc3d6", signal: "#e5604f", ore: "#b98cf0", heat: "#f2a33a", brown: "#a67c52", rock: "#8a857a",
};
export const ART = 0.28;                         // m per sheet unit: a ship is 50 m wide
export const hullLen = (m) => (m === "hauler" || m === "fueler" ? 200 : 130);
const TAU = Math.PI * 2;
const rr = (c, x, y, w, h, r = 0) => { c.beginPath(); if (r && c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
const box = (c, x, y, w, h, r, fill, a = 1) => { c.globalAlpha = a; c.fillStyle = fill; rr(c, x, y, w, h, r); c.fill(); c.globalAlpha = 1; };
const disc = (c, x, y, r, fill, a = 1) => { c.globalAlpha = a; c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.globalAlpha = 1; };
const poly = (c, pts, fill, a = 1) => { c.globalAlpha = a; c.fillStyle = fill; c.beginPath(); for (let i = 0; i < pts.length; i += 2) i ? c.lineTo(pts[i], pts[i + 1]) : c.moveTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); c.globalAlpha = 1; };
const ring = (c, x, y, r, stroke, w, a = 1, dash = null, rot = 0) => { c.save(); c.globalAlpha = a; c.strokeStyle = stroke; c.lineWidth = w; if (dash) c.setLineDash(dash); c.translate(x, y); c.rotate(rot); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); c.restore(); };
const pulse = (t, period, phase = 0) => 0.5 + 0.5 * Math.sin((t / period + phase) * TAU);
// a hold gauge: raw (brown) from the bottom, refined (purple) stacked on it, as fractions of the 30-unit gauge
function gauge(c, x, y, raw, ref) {
  raw = Math.max(0, Math.min(1, raw)); ref = Math.max(0, Math.min(1 - raw, ref));
  if (raw > 0) box(c, x, y + 30 - 30 * raw, 24, 30 * raw, 1, C.brown);
  if (ref > 0) box(c, x, y + 30 - 30 * (raw + ref), 24, 30 * ref, 1, C.ore);
}

// (owner, 2026-10-16) a ship carries a section per fitted module, nose to tail: the miner always up front, the tractor
// always at the back (its claws trail past the engines), the rest in between. shipLayout gives each section's offset
// down the hull and the whole length (sheet units).
const ORDER = ["miner", "command", "scanner", "refinery", "hauler", "fueler", "tractor"];
export function shipLayout(mods) {
  const list = (Array.isArray(mods) ? mods : mods ? [mods] : []).filter((k, i, a) => ORDER.includes(k) && a.indexOf(k) === i).sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
  const off = {}; let L = 0; for (const k of list) { off[k] = L; L += hullLen(k); }
  if (!list.length) L = 130;
  return { list, off, L, yc: (10 + 56 + L + 92) / 2 };   // yc: the drawing's middle (the ship's center), from the top
}
// one ship, centered at the current origin, nose up, in sheet units. mods: the fitted modules; s: { t (s), raw, ref,
// fuel (0-1), firing, thrust (0-1), on: { kind: switched on }, busy: { kind: pumping / refining / towing } }
export function drawShip(c, mods, s) {
  const lay = shipLayout(mods), L = lay.L, r = 56 + L, t = s.t, at = (k) => ({ ...s, on: !!(s.on && s.on[k]), busy: !!(s.busy && s.busy[k]) });
  c.save(); c.translate(-90, -(10 + r + 92) / 2);
  box(c, 74, 56, 32, L, 0, C.hullDk);
  for (const k of [...lay.list].reverse()) { c.save(); c.translate(0, lay.off[k]); MIDS[k](c, at(k)); c.restore(); }   // (back to front: the front sections' parts lie over)
  // nose: a dome with the round cockpit
  c.fillStyle = C.hull; c.beginPath(); c.moveTo(68, 60); c.lineTo(68, 36); c.arc(90, 36, 22, Math.PI, 0); c.lineTo(112, 60); c.closePath(); c.fill();
  disc(c, 90, 38, 11, C.glass, 0.9); disc(c, 86, 34, 4, "#fff", 0.6);
  // the rear block: the hold gauge (left) and the fuel gauge (right)
  box(c, 46, r, 88, 52, 4, C.hull);
  box(c, 54, r + 8, 30, 36, 3, C.hullDk); gauge(c, 57, r + 11, s.raw || 0, s.ref || 0);
  box(c, 96, r + 8, 30, 36, 3, C.hullDk); const f = Math.max(0, Math.min(1, s.fuel ?? 1)); if (f > 0) box(c, 99, r + 11 + 30 - 30 * f, 24, 30 * f, 2, C.ice);
  box(c, 54, r + 54, 28, 30, 5, C.hullLt); box(c, 98, r + 54, 28, 30, 5, C.hullLt);
  const fl = 0.35 + 0.65 * (s.thrust || 0), fk = 1 + 0.12 * Math.sin(t * 40);
  c.globalAlpha = 0.85 * fl; c.fillStyle = C.heat;
  for (const ex of [68, 112]) { c.beginPath(); c.ellipse(ex, r + 88 + 4 * fl, 10, 6 + 10 * fl * fk, 0, 0, TAU); c.fill(); }
  c.globalAlpha = 1;
  for (const k of lay.list) if (OVERS[k]) { c.save(); c.translate(0, lay.off[k]); OVERS[k](c, at(k)); c.restore(); }
  c.restore();
}
const MIDS = {
  miner(c, s) {
    const ph = (s.t % 2) / 2, w = Math.sin(ph * TAU), a = s.firing ? -6 * Math.max(0, w) : 0, b = s.firing ? -6 * Math.max(0, -w) : 0;
    // each rod fires from its tip as it comes back in
    const za = s.firing ? (ph > 0.25 && ph < 0.5 ? 1 : 0.15) : 0, zb = s.firing ? (ph > 0.75 ? 1 : 0.15) : 0;
    for (const [x, off, z] of [[40, a, za], [128, b, zb]]) {
      box(c, x, 26 + off, 12, 150, 3, C.hullLt); box(c, x - 2, 18 + off, 16, 14, 2, C.signal);
      if (z) { c.globalAlpha = z; c.strokeStyle = C.signal; c.lineWidth = 3; c.lineCap = "round"; c.beginPath(); c.moveTo(x + 6, 18 + off); c.lineTo(x + 6, -40 + off); c.stroke(); c.globalAlpha = 1; }
    }
    box(c, 54, 80, 72, 96, 6, C.hull);
    for (let y = 92; y <= 148; y += 14) box(c, 60, y, 60, 6, 0, C.hullDk);
    disc(c, 90, 70, 12, C.hullDk); disc(c, 90, 70, 5, C.signal, s.on ? 1 : 0.4);
  },
  hauler(c, s) {
    box(c, 14, 66, 152, 188, 8, C.hull);
    const spots = [[24, 76], [94, 76], [24, 132], [94, 132], [24, 188], [94, 188]], rawU = (s.raw || 0) * 6, allU = rawU + (s.ref || 0) * 6;
    spots.forEach(([x, y], i) => {
      box(c, x, y, 62, 46, 3, C.hullDk);
      const fr = Math.max(0, Math.min(1, rawU - i)), fa = Math.max(0, Math.min(1, allU - i)), fp = fa - fr;
      if (fr > 0) box(c, x, y + 46 - 46 * fr, 62, 46 * fr, 2, C.brown);
      if (fp > 0) box(c, x, y + 46 - 46 * fa, 62, 46 * fp, 2, C.ore);
      box(c, x + 6, y + 20, 50, 4, 0, C.hullDk, 0.7);
    });
    box(c, 86, 66, 8, 188, 0, C.hullDk); box(c, 14, 122, 152, 6, 0, C.hullDk); box(c, 14, 178, 152, 6, 0, C.hullDk);
  },
  fueler(c, s) {
    box(c, 44, 62, 92, 184, 46, C.hullLt); box(c, 52, 70, 76, 168, 38, C.hullDk);
    const f = Math.max(0, Math.min(1, s.fuel ?? 1));
    c.save(); rr(c, 52, 70, 76, 168, 38); c.clip(); box(c, 52, 70 + 168 * (1 - f), 76, 168 * f, 0, C.ice, 0.9); c.restore();
    box(c, 52, 70, 76, 30, 20, "#fff", 0.12);
    c.strokeStyle = C.hullDk; c.lineWidth = 4; c.beginPath(); for (const y of [112, 154, 196]) { c.moveTo(48, y); c.lineTo(132, y); } c.stroke();
    disc(c, 90, 154, 22, C.hull); disc(c, 90, 154, 16, C.hullDk);
    ring(c, 90, 154, 11, C.ice, 3, 1, [6, 6], s.busy ? s.t * 6 : 0); disc(c, 90, 154, 3, C.ice);
  },
  tractor(c, s) {
    poly(c, [30, 110, 48, 110, 46, 300, 24, 300], C.hullLt); poly(c, [150, 110, 132, 110, 134, 300, 156, 300], C.hullLt);
    poly(c, [24, 300, 46, 300, 35, 318], C.ice); poly(c, [134, 300, 156, 300, 145, 318], C.ice);
    box(c, 62, 96, 56, 80, 6, C.hull); disc(c, 90, 136, 22, C.hullDk);
    ring(c, 90, 136, 14, C.ice, 4, s.busy ? 0.45 + 0.55 * pulse(s.t, 1.4) : 0.45); disc(c, 90, 136, 4, C.ice);
  },
  command(c) {
    poly(c, [90, 70, 128, 92, 128, 150, 90, 172, 52, 150, 52, 92], C.hull);
    poly(c, [90, 86, 114, 100, 114, 142, 90, 156, 66, 142, 66, 100], C.hullDk);
    box(c, 76, 62, 28, 5, 2, C.gold, 0.9);
  },
  refinery(c, s) {
    box(c, 40, 66, 100, 118, 6, C.hull); box(c, 54, 80, 72, 90, 4, C.hullDk);
    [64, 85, 106].forEach((x, i) => box(c, x, 92, 10, 66, 2, C.heat, s.busy ? 0.35 + 0.65 * pulse(s.t, 2.4, -i / 3) : 0.22));
    box(c, 18, 104, 24, 42, 3, C.hullLt); box(c, 24, 112, 12, 12, 0, C.brown); box(c, 24, 128, 12, 12, 0, C.brown);
    box(c, 138, 104, 24, 42, 3, C.hullLt); for (const y of [112, 124, 136]) box(c, 146, y, 8, 8, 0, C.ore);
    box(c, 52, 54, 14, 30, 3, C.hullLt); box(c, 114, 54, 14, 30, 3, C.hullLt);
    disc(c, 59, 50, 5, C.ore, s.busy ? 0.35 + 0.65 * pulse(s.t, 2.4) : 0.3); disc(c, 121, 50, 5, C.ore, s.busy ? 0.35 + 0.65 * pulse(s.t, 2.4, 0.5) : 0.3);
  },
  scanner(c, s) {
    disc(c, 90, 118, 44, C.hullLt); disc(c, 90, 118, 36, C.hullDk);
    const a = (s.t / 3) * TAU; c.save(); c.translate(90, 118); c.rotate(a); c.globalAlpha = 0.55; c.fillStyle = C.ice;
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 36, -Math.PI / 2, -Math.PI / 2 + 0.75); c.closePath(); c.fill(); c.restore(); c.globalAlpha = 1;
    c.strokeStyle = C.ice; c.globalAlpha = 0.6; c.lineWidth = 2; c.beginPath(); c.arc(90, 118, 32, Math.PI, 0); c.stroke(); c.globalAlpha = 1;
    disc(c, 90, 118, 5, C.ice);
    box(c, 22, 150, 30, 32, 5, C.hull); box(c, 128, 150, 30, 32, 5, C.hull); disc(c, 37, 166, 6, C.ice); disc(c, 143, 166, 6, C.ice);
  },
};
const OVERS = {
  command(c, s) {                                // the arms spin over the whole ship like a centrifuge while it boosts
    c.save(); c.translate(90, 121); c.rotate(s.on ? (s.t / 5) * TAU : 0);
    c.strokeStyle = C.hullLt; c.lineWidth = 6; c.lineCap = "round"; c.beginPath(); c.moveTo(-74, 0); c.lineTo(74, 0); c.stroke();
    for (const x of [-76, 76]) { disc(c, x, 0, 10, C.gold); disc(c, x, 0, 4, C.hullDk); }
    disc(c, 0, 0, 9, C.gold); c.restore();
  },
};

// ---- the station: a hex core, a turning habitat ring, four docking pads, fuel tanks, ore silos, a refinery stack (in m) ----
export function drawStation(c, t) {
  const U = 1.15;                                // m per sheet unit
  c.save(); c.scale(U, U);
  c.save(); c.rotate((t / 40) * TAU);
  ring(c, 0, 0, 112, C.hull, 14); ring(c, 0, 0, 112, C.hullLt, 3, 1, [30, 12]);
  for (let i = 0; i < 6; i++) { c.save(); c.rotate(i * Math.PI / 3); box(c, -10, -122, 20, 24, 3, C.hullLt); disc(c, 0, -110, 4, C.glass); c.restore(); }
  c.restore();
  for (let i = 0; i < 4; i++) {
    c.save(); c.rotate(Math.PI / 4 + i * Math.PI / 2);
    box(c, -10, -100, 20, 60, 0, C.hull); box(c, -22, -140, 44, 40, 5, C.hullDk);
    c.strokeStyle = C.gold; c.lineWidth = 2; rr(c, -22, -140, 44, 40, 5); c.stroke(); ring(c, 0, -120, 7, C.gold, 2);
    c.restore();
  }
  poly(c, [0, -64, 55, -32, 55, 32, 0, 64, -55, 32, -55, -32], C.hull);
  poly(c, [0, -48, 41, -24, 41, 24, 0, 48, -41, 24, -41, -24], C.hullDk);
  box(c, -32, -14, 22, 30, 4, C.ice); box(c, -6, -14, 22, 30, 4, C.ice, 0.85);
  box(c, 20, -18, 14, 14, 2, C.brown); box(c, 20, 0, 14, 14, 2, C.ore);
  disc(c, 0, -30, 9, C.hullLt); disc(c, 0, -30, 4, C.heat, 0.35 + 0.65 * pulse(t, 2.4)); disc(c, 0, 32, 6, C.gold);
  c.restore();
}

// ---- an asteroid: a lumpy rock from its id (the same for everyone); veins of its ore once scanned; a fracture line for
// every crack broken ----
const shapes = new Map();
function seeded(id) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shapeOf(id, n) {
  let s = shapes.get(id); if (s) return s;
  const rnd = seeded(id), k = 9 + Math.floor(rnd() * 3), pts = [], veins = [], cracks = [], rot = rnd() * TAU;
  for (let i = 0; i < k; i++) { const a = rot + i / k * TAU, m = 0.78 + rnd() * 0.3; pts.push(Math.cos(a) * m, Math.sin(a) * m); }
  for (let i = 0; i < 6; i++) { const a = rnd() * TAU, d = rnd() * 0.6; veins.push(Math.cos(a) * d, Math.sin(a) * d, 0.06 + rnd() * 0.07); }
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, b = a + (rnd() - 0.5) * 1.2, d1 = 0.25 + rnd() * 0.3; cracks.push([(rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, Math.cos(b) * d1, Math.sin(b) * d1, Math.cos(a) * 0.85, Math.sin(a) * 0.85]); }
  s = { pts, veins, cracks, spin: (rnd() - 0.5) * 0.15 }; if (shapes.size > 4000) shapes.clear(); shapes.set(id, s); return s;
}
export function drawRock(c, id, n, r, broken, oreColor, t, towed) {
  const s = shapeOf(id, n);
  c.save(); c.rotate(s.spin * t); c.scale(r, r);
  poly(c, s.pts, C.rock);
  c.globalAlpha = 0.12; c.fillStyle = "#fff"; c.beginPath(); c.moveTo(s.pts[0], s.pts[1]); c.lineTo(s.pts[2], s.pts[3]); c.lineTo(s.pts[4] * 0.4, s.pts[5] * 0.4); c.lineTo(0, 0); c.closePath(); c.fill(); c.globalAlpha = 1;
  if (oreColor) for (let i = 0; i < s.veins.length; i += 3) disc(c, s.veins[i], s.veins[i + 1], s.veins[i + 2], oreColor, 0.9);
  if (broken > 0) { c.strokeStyle = C.void; c.lineWidth = 2.2 / r; c.lineCap = "round"; c.beginPath(); for (let i = 0; i < Math.min(broken, s.cracks.length); i++) { const k = s.cracks[i]; c.moveTo(k[0], k[1]); c.lineTo(k[2], k[3]); c.lineTo(k[4], k[5]); } c.stroke(); }
  if (towed) { c.strokeStyle = C.ice; c.lineWidth = 2 / r; c.setLineDash([4 / r, 4 / r]); c.beginPath(); for (let i = 0; i < s.pts.length; i += 2) i ? c.lineTo(s.pts[i] * 1.12, s.pts[i + 1] * 1.12) : c.moveTo(s.pts[i] * 1.12, s.pts[i + 1] * 1.12); c.closePath(); c.stroke(); c.setLineDash([]); }
  c.restore();
}

// ---- Saturn from above the ring plane: a banded disc with its hexagonal polar storm (r in m) ----
export function drawSaturn(c, R, t) {
  const g = c.createRadialGradient(-R * 0.18, -R * 0.2, R * 0.1, 0, 0, R);
  g.addColorStop(0, "#f3dcaa"); g.addColorStop(0.55, "#cfa15a"); g.addColorStop(1, "#7a5524");
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
  c.strokeStyle = "rgba(60,36,10,.28)";
  for (const [k, w] of [[0.83, 0.06], [0.65, 0.04], [0.46, 0.08]]) { c.lineWidth = R * w * 0.6; c.beginPath(); c.arc(0, 0, R * k, 0, TAU); c.stroke(); }
  c.save(); c.rotate((t / 30) * TAU); c.strokeStyle = "rgba(60,36,10,.45)"; c.lineWidth = R * 0.04; c.beginPath();
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU - Math.PI / 2; i ? c.lineTo(Math.cos(a) * R * 0.29, Math.sin(a) * R * 0.29) : c.moveTo(Math.cos(a) * R * 0.29, Math.sin(a) * R * 0.29); }
  c.closePath(); c.stroke(); c.restore();
}
