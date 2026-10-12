// NPC stations (owner, 2026-10-11): one at every planet, a pilot starts at the one of the planet picked when making
// them, each keeps its own hangar per account; no free player stations (they'll be bought). Drives the World directly.
import { World } from "../../packages/server/src/game/world.js";
import { STATIONS, stationOfPlanet } from "../../packages/server/src/game/station.js";
import { PLANETS } from "../../packages/server/src/game/celestials.js";
import { suite } from "./lib.mjs";
const t = suite("home");
const w = new World();
t.ok(STATIONS.length === 8 && PLANETS.every((p) => { const st = stationOfPlanet(p.key); return st && Math.hypot(st.x - p.x, st.y - p.y) < p.r + 300 && w.pois.get(st.id); }) && stationOfPlanet("earth").id === "station", "an NPC station at every planet, on the map (Earth's is still \"station\")");
const a = w.addPlayer("a", "Alice", () => {}, null, [{ id: 1, name: "Ann", start: "mars", licenses: {} }, { id: 2, name: "Bea", start: "earth", licenses: {} }]); w.tick(0.05);
const s1 = w.ships.get("a:ship:1"), s2 = w.ships.get("a:ship:2"), mars = stationOfPlanet("mars"), earth = stationOfPlanet("earth");
t.ok(Math.hypot(s1.x - mars.x, s1.y - mars.y) < 20 && Math.hypot(s2.x - earth.x, s2.y - earth.y) < 20, "each pilot starts at the station of the planet picked (owner)", [s1.x, s1.y]);
t.ok(![...w.pois.values()].some((p) => p.kind === "home"), "no free player station (owner)");
// a hangar per station
const dockAt = (s, st) => { Object.assign(s, { x: st.x - 1.3, y: st.y - 0.2, vx: 0, vy: 0 }); w.cmdDock("a", s.id, st.id); for (let i = 0; i < 4000 && !s.docked; i++) w.tick(0.05); };
dockAt(s1, mars); dockAt(s2, earth);
t.ok(s1.docked === mars.id && s2.docked === "station", "docking at a planet's station", [s1.docked, s2.docked]);
w.cmdTransfer("a", { ship: s1.id, hold: "cargo" }, "hangar", "mining_laser", 1);
w.cmdTransfer("a", { ship: s2.id, hold: "cargo" }, "hangar", "afterburner_1", 1);
t.ok(a.hangars[mars.id].mining_laser === 1 && !a.hangars[mars.id].afterburner_1 && a.hangars.station.afterburner_1 === 1 && !a.hangars.station.mining_laser, "each station keeps its own hangar (owner)", a.hangars);
const snap = w.snapshotFor(a); t.ok(snap.hangars && snap.hangars[mars.id] && snap.hangars.station, "docked ships' stations' hangars are sent");
t.ok(JSON.stringify(w.exportState("a").hangars) === JSON.stringify(a.hangars), "and saved");
// the old single hangar loads as Earth Station's
const w2 = new World(), b = w2.addPlayer("b", "B", () => {}, { ships: {}, hangar: { mining_laser: 3 } }, []);
t.ok(b.hangars.station && b.hangars.station.mining_laser === 3, "an old hangar becomes Earth Station's");
t.done();
