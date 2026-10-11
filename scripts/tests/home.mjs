// Player stations (docs/FEATURES.md › Player stations): one per account, far apart, a POI only its owner sees, docking,
// storage, refitting docked. Drives the World directly.
import { World } from "../../packages/server/src/game/world.js";
import { HOME, homeId, STATION_ART } from "../../packages/server/src/game/home.js";
import { DOCK_KM } from "../../packages/server/src/game/station.js";
import { suite } from "./lib.mjs";
const t = suite("home");
const w = new World(), notes = [];
const mk = (id, name) => w.addPlayer(id, name, (m) => { const o = JSON.parse(m); if (o.t === "notice") notes.push(o.text); }, null, [{ id: 1, name, licenses: {} }]);
const a = mk("a", "Alice"), b = mk("b", "Bob"); w.tick(0.05);
const ha = w.pois.get(homeId("a")), hb = w.pois.get(homeId("b"));
t.ok(ha && ha.kind === "home" && ha.owner === "a" && ha.r === HOME.rKm && ha.size === "small" && !ha.arms && ha.name === "Alice's Station", "every player gets a small station with a 50 km POI (owner)", ha && { r: ha.r, size: ha.size, name: ha.name });
t.ok(Math.hypot(ha.x - hb.x, ha.y - hb.y) >= HOME.apartKm, "stations start far apart (owner)", Math.hypot(ha.x - hb.x, ha.y - hb.y));
t.ok([...w.pois.values()].filter((p) => p.kind !== "home").every((p) => Math.hypot(p.x - ha.x, p.y - ha.y) > p.r + HOME.rKm), "and clear of every other POI");
const pa = w.poisFor(a).map((p) => p.id), pb = w.poisFor(b).map((p) => p.id);
t.ok(pa.includes(ha.id) && !pa.includes(hb.id) && pb.includes(hb.id) && !pb.includes(ha.id), "only its owner has it on the map (owner)");
const prop = ha.field.props[0], art = STATION_ART.sizes.small.retracted;
t.ok(prop.station && prop.home === "a" && prop.sprite === art.sprite && Math.abs(prop.w - art.w * 1.875 / 1000) < 1e-3, "the station is drawn at true size from its art (arms retracted)", prop);
// warping there: yours yes, someone else's no
const sa = w.ships.get("a:ship:1"), sb = w.ships.get("b:ship:1");
w.cmdAlign("b", sb.id, ha.id, true); t.ok(sb.dest !== ha.id, "no one can warp (or align) to someone else's station");
w.cmdAlign("a", sa.id, ha.id, true); t.ok(sa.dest === ha.id && sa.warpReq, "its owner can");
// docking, storage, refitting
Object.assign(sa, { x: prop.x, y: prop.y - 3, vx: 0, vy: 0, dest: null, warpReq: false, moving: false }); w.tick(0.05);
w.cmdDock("b", sb.id, "home"); t.ok(!sb.docked, "someone else can't dock at (or reach for) your station");
w.cmdDock("a", sa.id, "home"); t.ok(sa.docked === "home" && sa.x === prop.x, "dock at your station within " + DOCK_KM + " km of its edge", sa.docked);
w.cmdTransfer("a", { ship: sa.id, hold: "cargo" }, "home", "mining_laser", 1);
t.ok(ha.items.mining_laser === 1 && sa.holds.cargo.mining_laser === 1, "items go into its storage", ha.items);
w.cmdTransfer("a", { ship: sa.id, hold: "cargo" }, "hangar", "afterburner_1", 1);
t.ok(!a.hangar.afterburner_1, "not into the Station's hangar from there");
const snap = w.snapshotFor(a); t.ok(snap.home && snap.home.mining_laser === 1 && !snap.hangar && snap.ships.find((x) => x.id === sa.id).docked === "home", "docked there, you're sent its storage", snap.home);
w.cmdFit("a", sa.id, "mining_laser", "active", 0); t.ok(sa.fit.active[0] === "mining_laser", "and can refit (owner)");
t.ok(w.exportState("a").ships["1"].docked === "home", "a ship saved docked remembers where");
w.cmdBoard("a", sa.id, false); w.cmdUndock("a", sa.id); t.ok(sa.docked && sa.unboarded && w.snapshotFor(a).ships.find((x) => x.id === sa.id).unboarded && w.exportState("a").ships["1"].unboarded, "a pilot who leaves their docked ship can't undock it (owner)");
w.cmdBoard("a", sa.id, true); t.ok(!sa.unboarded, "boarding again");
w.cmdUndock("a", sa.id); t.ok(!sa.docked && Math.hypot(sa.x - prop.x, sa.y - prop.y) < 5, "undock beside it");
w.cmdTransfer("a", "home", { ship: sa.id, hold: "cargo" }, "mining_laser", 1); t.ok(ha.items.mining_laser === 1, "undocked, its storage is out of reach");
// a visitor who flies there sees it, though it isn't on their map
Object.assign(sb, { x: ha.x + 5, y: ha.y }); w.tick(0.05);
t.ok(w.fieldsFor(b).fields.some((f) => f.poi === ha.id && f.props[0].station), "someone who flies there sees the station (owner)");
// saved stations: none made until they're loaded; a loaded one keeps its place and storage
const w2 = new World(); w2.homesReady = false; const c = w2.addPlayer("a", "Alice", () => {}, null, []);
t.ok(!w2.pois.has(homeId("a")), "no station is made before the saved ones are loaded");
w2.loadPoi(JSON.parse(JSON.stringify(ha))); w2.homesLoaded();
const h2 = w2.pois.get(homeId("a")); t.ok(h2 && h2.x === ha.x && h2.items.mining_laser === 1 && w2.poisFor(c).some((p) => p.id === ha.id), "a saved station comes back where it was, with its storage", h2 && h2.items);
{ const w4 = new World(); w4.homesReady = false; w4.loadPoi(JSON.parse(JSON.stringify(ha))); w4.homesLoaded([{ id: "a", name: "Alice" }, { id: "z9", name: "Zoe" }]);
  t.ok(w4.pois.get(homeId("a")).x === ha.x && w4.pois.get(homeId("z9")) && w4.pois.get(homeId("z9")).name === "Zoe's Station", "at start-up every account without a station gets one, offline or not (owner)"); }
w2.loadPoi({ ...JSON.parse(JSON.stringify(ha)), id: "home:zzz" }); t.ok(!w2.pois.has("home:zzz"), "a bad saved station is ignored");
// many players: still spread out
const w3 = new World(); for (let i = 0; i < 60; i++) w3.addPlayer("p" + i, "P" + i, () => {}, null, []);
const hs = [...w3.pois.values()].filter((p) => p.kind === "home"); let minD = Infinity;
for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) minD = Math.min(minD, Math.hypot(hs[i].x - hs[j].x, hs[i].y - hs[j].y));
t.ok(hs.length === 60 && minD > HOME.apartKm, "60 players' stations are all over " + HOME.apartKm + " km apart", Math.round(minD));
t.done();
