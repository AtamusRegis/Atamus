// Celestials (docs/FEATURES.md › Celestials): the sun, planets and moons with anchors as their POIs; what spawns where.
import { World, insideExpanse } from "../../packages/server/src/game/world.js";
import { SUN, PLANETS, MOONS, celestialClearance, celestialsForClient } from "../../packages/server/src/game/celestials.js";
import { suite } from "./lib.mjs";
const t = suite("celestials");
t.ok(PLANETS.length === 5 && MOONS.length >= 5 && PLANETS.every((p) => p.moons.length >= 1), "five planets, each with moons", PLANETS.map((p) => p.moons.length));
t.ok(PLANETS.every((p) => Math.abs(Math.hypot(p.x, p.y) - p.orbit) < 0.1 && insideExpanse(p.x, p.y, p.zone)) && MOONS.every((m) => { const p = PLANETS.find((q) => q.id === m.parent); return Math.abs(Math.hypot(m.x - p.x, m.y - p.y) - m.orbit) < 0.1; }), "each sits on its orbit line (around the sun, or its planet), inside the Expanse");
t.ok([...PLANETS, ...MOONS].every((c) => { const d = Math.hypot(c.anchor.x - c.x, c.anchor.y - c.y); return d > c.r && d < c.r + 200; }), "each has an anchor on a ring just off it (owner: the warp-in point)");
const w = new World(), a = w.addPlayer("a", "A", () => {}, null, [{ id: 1, name: "A", licenses: {} }]); w.tick(0.05);
const pp = w.poisFor(a), planetPoi = pp.find((p) => p.id === PLANETS[0].id), moonPoi = pp.find((p) => p.id === MOONS[0].id);
t.ok(planetPoi && moonPoi && planetPoi.kind === "planet" && planetPoi.x === PLANETS[0].anchor.x && moonPoi.kind === "moon", "planets' and moons' anchors are POIs on everyone's map");
const s = w.ships.get("a:ship:1"); w._startWarp(s, w.pois.get(PLANETS[0].id), Date.now());
t.ok(Math.hypot(s.wp.tx - PLANETS[0].anchor.x, s.wp.ty - PLANETS[0].anchor.y) < 4, "a warp to a planet drops out at its anchor", s.wp);
// spawning
for (let i = 0; i < 40; i++) w._newBelt();
const bs = [...w.pois.values()].filter((p) => p.kind === "belt");
t.ok(bs.every((b) => Math.hypot(b.x, b.y) > SUN.clearKm), "nothing spawns near the sun (owner)", bs.map((b) => Math.round(Math.hypot(b.x, b.y))).sort((x, y) => x - y).slice(0, 3));
t.ok(bs.every((b) => PLANETS.some((p) => Math.hypot(b.x - p.x, b.y - p.y) < p.zone + 1100 || p.moons.some((m) => Math.hypot(b.x - m.x, b.y - m.y) < m.r + 450))), "belts spawn around planets and moons (owner)");
t.ok(bs.every((b) => PLANETS.every((p) => Math.hypot(b.x - p.x, b.y - p.y) > p.r + 50 && p.moons.every((m) => Math.hypot(b.x - m.x, b.y - m.y) > m.r + 50))), "but not on top of them");
for (let i = 0; i < 40; i++) w.addPlayer("h" + i, "H" + i, () => {}, null, []);
const hs = [...w.pois.values()].filter((p) => p.kind === "home");
t.ok(hs.length === 41 && hs.every((h) => celestialClearance(h.x, h.y) >= 0), "player stations keep clear of the sun, planets and moons (owner)", hs.filter((h) => celestialClearance(h.x, h.y) < 0).length);
const cc = celestialsForClient(); t.ok(cc.sun.rKm > 0 && cc.planets.length === 5 && cc.planets[0].moons.length && cc.planets[0].orbit && !("zone" in cc.planets[0]), "the client gets the sun, planets, moons and their orbits");
t.done();
