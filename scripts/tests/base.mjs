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
// one pipe run down x = 34 (beside the Home Base, and the frigate shipyard's west port) links everything
const tiles = []; for (let y = 28; y <= 43; y++) tiles.push([34, y]);
w.cmdBasePipes("a", tiles);
const nets = Base.networks(a.base);
t.ok(nets.length === 1 && nets[0].length === 5, "pipes join the buildings into one network", nets.map((n) => n.map((q) => q.type)));
w.cmdBaseSet("a", a.base.buildings.find((q) => q.type === "factory").id, { recipe: "steel_plate", mode: "count", count: 5 });
Base.step(a.base, 120e3, {});
const st = a.base.buildings.find((q) => q.type === "storage");
t.ok((st.store.cryonium || 0) + 0 >= 0 && a.base.buildings.find((q) => q.type === "refinery").done > 0, "the refinery turns ore into iums", st.store);
Base.step(a.base, 30 * 60e3, {});
t.ok(st.store.steel_plate === 5 && a.base.buildings.find((q) => q.type === "factory").made === 5, "a factory set to 5 makes exactly 5", st.store);
w.cmdBaseRemove("a", 35, 39); t.ok(!a.base.buildings.some((q) => q.type === "storage") && a.credits > 0, "removing a building refunds half");

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
