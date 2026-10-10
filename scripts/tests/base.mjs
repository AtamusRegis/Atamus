// The base surface (docs/FEATURES.md › The base): home planets, unloading, pipes, refining, factories, shipyards,
// catch-up while away. Drives the World directly.
import { World } from "../../packages/server/src/game/world.js";
import * as Base from "../../packages/server/src/game/base.js";
import * as Inv from "../../packages/server/src/game/inventory.js";
import { suite } from "./lib.mjs";
const t = suite("base");
const w = new World();
const mk = (id) => { const p = w.addPlayer(id, "P" + id, () => {}); p.pilots = [{ id: "pl" + id, name: "Pilot", licenses: { mining_frigate: 5 } }]; w.assignDefaultPilots(id); return p; };
const ps = ["a", "b", "c", "d", "e", "f", "g", "h"].map(mk);
const homes = {}; for (const p of ps) homes[p.home] = (homes[p.home] || 0) + 1;
t.ok(Object.keys(homes).length === 4 && Object.values(homes).every((n) => n === 2), "home planets are handed out evenly", homes);
const a = ps[0], home = Base.homeOf(a.base);
t.ok(home && a.base.buildings.length === 1, "a new base has just its Home Base");

// docking at the home planet unloads the ore hold
const s = [...w.ships.values()].find((x) => x.owner === "a");
Object.assign(s, { docked: false, sys: a.home, x: 5, y: 0, tx: 5, ty: 0, moving: false });
Inv.add(s.inv.ore, "ironstone", 30000); Inv.add(s.inv.ore, "cobaltine", 4000);
w.cmdDock("a", s.id, true);
t.ok(s.docked && s.sys === a.home && !s.inv.ore.slots.length && home.store.ironstone === 30000 && home.store.cobaltine === 4000, "docking at your home planet unloads the ore into the Home Base", home.store);
const other = ps.find((p) => p.home !== a.home), s2 = [...w.ships.values()].find((x) => x.owner === other.id);
Object.assign(s2, { docked: false, sys: a.home, x: 5, y: 0 }); w.cmdDock(other.id, s2.id, true);
t.ok(!s2.docked, "you can't dock at someone else's home planet");
w.cmdDock("a", s.id, false); t.ok(!s.docked && s.sys === a.home, "undocking lifts off the planet");
t.ok(!w._inv("a", { owner: "ship", id: s.id, inv: "ore" }).docked, "a ship at the home planet can't trade with the station hangars");

// building: credits, overlap, pipes
a.credits = 10_000_000;
w.cmdBasePlace("a", "refinery", 30, 30); t.ok(a.base.buildings.length === 1, "no building on top of another");
w.cmdBasePlace("a", "refinery", 35, 30); w.cmdBasePlace("a", "storage", 35, 39); w.cmdBasePlace("a", "factory", 35, 35); w.cmdBasePlace("a", "dock_frigate", 35, 42);
t.ok(a.base.buildings.length === 5 && a.credits === 10_000_000 - 750_000 - 250_000 - 1_500_000 - 2_000_000, "buildings cost credits", a.credits);
w.cmdBasePlace("a", "dock_ark", 5, 5); t.ok(a.base.buildings.length === 5, "nothing you can't afford");
// pipes run one way, socket to socket: home → refinery → (down x = 38, past the factory's east socket) → storage →
// factory (which merges its output back into that line) and on to the shipyard
const path = (...pts) => w.cmdBasePipes("a", pts);
const col = (x, y0, y1) => { const o = []; for (let y = y0; y0 <= y1 ? y <= y1 : y >= y1; y += y0 <= y1 ? 1 : -1) o.push([x, y]); return o; };
const c0 = a.credits;
path([33, 31], [34, 31], [35, 31]);
t.ok(a.credits === c0 - Base.PIPE_COST && a.base.pipe["34,31"].o === "E" && a.base.pipe["34,31"].i === "W", "a dragged pipe flows from where the drag started; only new tiles cost", a.base.pipe["34,31"]);
path([37, 31], [38, 31], ...col(38, 32, 39), [37, 39], [36, 39]);
path([36, 39], [36, 38], [36, 37]);
path([37, 36], [38, 36], [38, 37]);
path([36, 38], [35, 38], [34, 38], ...col(34, 39, 43), [35, 43]);
const L = Base.links(a.base), byT = (k) => a.base.buildings.find((q) => q.type === k), dn = (k) => [...L.down.get(byT(k))].map((q) => q.type).sort();
t.ok(dn("home").join() === "refinery" && dn("refinery").join() === "storage" && dn("storage").join() === "dock_frigate,factory" && dn("factory").join() === "storage", "output goes where the pipes lead, and nowhere else", ["home", "refinery", "storage", "factory"].map(dn));
t.ok(!L.down.get(byT("refinery")).has(byT("factory")), "a pipe running past a building's socket doesn't feed it");
// sockets only (owner): no pipes in the middle of nowhere, none into a building's wall
{ const c1 = a.credits; path([50, 50], [51, 50]); t.ok(!a.base.pipe["50,50"] && a.credits === c1, "a pipe touching no pipe or socket can't be laid"); }
path([36, 30], [36, 29], [37, 29]); t.ok(!a.base.pipe["36,29"], "a refinery has no socket on its north side");
path([33, 33], [34, 33], [34, 32], [34, 31]); t.ok(a.base.pipe["34,33"] && !a.base.pipe["34,33"].i && a.base.pipe["34,33"].o === "N", "dragging out of a building's wall doesn't connect to it", a.base.pipe["34,33"]);
w.cmdBaseRemove("a", 34, 33); w.cmdBaseRemove("a", 34, 32);
t.ok(a.base.pipe["34,31"].i === "W" && Base.links(a.base).down.get(byT("home")).has(byT("refinery")), "and removing it leaves the line as it was", a.base.pipe["34,31"]);
// turning a building turns its sockets; a new pipe beside a socket turns to meet it
w.cmdBasePlace("a", "storage_s", 45, 30, 1);
const ss = a.base.buildings.find((q) => q.type === "storage_s");
t.ok(ss.rot === 1 && JSON.stringify(Base.sockets(ss)) === JSON.stringify([[45, 29, "N"], [45, 31, "S"]]), "a turned building's sockets turn with it", Base.sockets(ss));
w.cmdBasePlace("a", "storage_s", 47, 30, 7); t.ok(!a.base.buildings.some((q) => q.x === 47), "a turn is 0-3 quarter turns");
path([45, 29], [45, 28]); t.ok(a.base.pipe["45,29"].i === "S" && a.base.pipe["45,29"].o === "N", "a pipe starting beside a socket takes from it", a.base.pipe["45,29"]);
path([44, 28], [44, 29], [44, 30], [44, 31], [45, 31]); t.ok(a.base.pipe["45,31"].i === "W" && a.base.pipe["45,31"].o === "N", "and one ending beside a socket feeds it", a.base.pipe["45,31"]);
{ const L3 = Base.links(a.base); t.ok(L3.down.get(ss).size === 0 && [...L3.up.get(ss)].length === 0, "a loop back into itself isn't a link"); }
for (const k of ["45,29", "45,28", "44,28", "44,29", "44,30", "44,31", "45,31"]) w.cmdBaseRemove("a", ...k.split(",").map(Number));
w.cmdBaseRemove("a", 45, 30);
// a straight run across a straight pipe crosses it
path([39, 33], [38, 33], [37, 33]);
t.ok(a.base.pipe["38,33"].c === 1 && Base.links(a.base).down.get(byT("refinery")).size === 1, "crossing a pipe at right angles doesn't join it", a.base.pipe["38,33"]);
w.cmdBaseRemove("a", 39, 33); w.cmdBaseRemove("a", 37, 33); w.cmdBaseRemove("a", 38, 33);
t.ok(!a.base.pipe["38,33"] && a.base.pipe["38,32"].o === "" && !Base.links(a.base).down.get(byT("refinery")).size, "removing a pipe tile cuts the run there");
path(...col(38, 32, 34));
t.ok(Base.links(a.base).down.get(byT("refinery")).size === 1, "and redrawing mends it");
// bases saved before pipes had a direction: their pipes carry both ways
{ const old = { ver: 1, nextId: 3, buildings: [{ id: 1, type: "home", x: 0, y: 0, store: {} }, { id: 2, type: "refinery", x: 5, y: 0 }], pipes: ["4,1"] };   // home's east socket, the refinery's west
  Base.normalize(old); const L2 = Base.links(old);
  t.ok(old.pipe["4,1"].u && L2.down.get(old.buildings[0]).has(old.buildings[1]) && L2.down.get(old.buildings[1]).has(old.buildings[0]), "old two-way pipes still connect both ways"); }
w.cmdBaseSet("a", a.base.buildings.find((q) => q.type === "factory").id, { recipe: "steel_plate", mode: "count", count: 5 });
Base.step(a.base, 120e3, {});
const st = a.base.buildings.find((q) => q.type === "storage");
t.ok((st.store.cryonium || 0) + 0 >= 0 && a.base.buildings.find((q) => q.type === "refinery").done > 0, "the refinery turns ore into iums", st.store);
Base.step(a.base, 30 * 60e3, {});
t.ok(st.store.steel_plate === 5 && a.base.buildings.find((q) => q.type === "factory").made === 5, "a factory set to 5 makes exactly 5", st.store);
{ const c1 = a.credits; w.cmdBaseRemove("a", 35, 39); t.ok(!a.base.buildings.some((q) => q.type === "storage") && a.credits === c1 + 125_000, "removing a building refunds half"); }

// a frigate from scratch, while offline: everything the bill needs, piped in
const dock = a.base.buildings.find((q) => q.type === "dock_frigate");
w.cmdBasePlace("a", "storage", 35, 39);
const st2 = a.base.buildings.find((q) => q.type === "storage");
Object.assign(st2.store, { hull_plating: 10, structural_beam: 8, bolts_fasteners: 40, cable_spool: 4, circuit_board: 2, power_cell: 1, thruster_nozzle: 2, engine_assembly: 1, sensor_dish: 1, gyroscope: 1, viewport_glass: 1 });
w.cmdBaseSet("a", dock.id, { recipe: "chisel", mode: "count", count: 1 });
w.cmdBaseSet("a", dock.id, { recipe: "ark" }); t.ok(dock.recipe === "chisel", "a frigate shipyard can't build an ark");
t.ok(Base.SHIP_BUILDS.silo.rank === 2 && Base.SHIP_BUILDS.silo.ms === 72 * 3600e3, "exhumers build in the cruiser shipyard but take a battleship's 3 days");
const saved = JSON.parse(JSON.stringify(w.exportState("a")));
saved.savedAt -= 3 * 3600e3;                                       // three hours offline
w.removePlayer("a"); w.players.get("a").offlineSince = 0; w.tick(0.05);
const a2 = w.addPlayer("a", "Pa", () => {}, saved);
const built = [...w.ships.values()].filter((x) => x.owner === "a" && x.type === "chisel" && x.docked && x.sys === a2.home && x.pilot == null);
t.ok(built.length === 1, "a ship built while you were away waits docked at your home planet", built.length);
t.ok(a2.home === a.home, "your home planet stays yours");
t.done();
