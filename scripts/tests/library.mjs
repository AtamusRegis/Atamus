// The Library (docs/FEATURES.md › The Library): every space object's art in rows, in a POI of its own.
import { existsSync, readdirSync } from "node:fs";
import { World } from "../../packages/server/src/game/world.js";
import { BELTS_MIN } from "../../packages/server/src/game/constants.js";
import { suite } from "./lib.mjs";
const t = suite("library");
const ASSETS = new URL("../../website/assets/", import.meta.url).pathname;
const w = new World(), a = w.addPlayer("a", "A", () => {}, null, [{ id: 1, name: "Ann", licenses: { mining_frigate: 5 } }]); w.tick(0.05);
const lib = w.pois.get("library"), props = lib.field.props, sa = w.ships.get("a:ship:1");

t.ok(lib && lib.kind === "library" && lib.name === "Library", "the Library is a POI");
t.ok(w.poisFor(a).some((p) => p.id === "library" && !p.hidden), "on everyone's map");
t.ok([...w.pois.values()].filter((p) => p.kind === "belt" && !p.retired).length === BELTS_MIN, "belts are counted apart from it");
// every space object: each sprite under assets/ships and assets/rocks is on a shelf
const shown = new Set(props.map((o) => o.sprite));
const want = [...readdirSync(ASSETS + "ships").map((f) => "ships/" + f), ...readdirSync(ASSETS + "rocks").map((f) => "rocks/" + f)];
t.ok(want.every((f) => shown.has(f)), "every ship, structure and asteroid sprite is shown", want.filter((f) => !shown.has(f)));
t.ok(props.every((o) => existsSync(ASSETS + o.sprite) && o.name && o.w > 0 && o.h > 0), "each with its art, a name and a true size");
t.ok(props.find((o) => o.sprite === "ships/chisel_blue.webp").w === 0.128 && props.find((o) => o.sprite === "ships/ark_blue.webp").w === 5.646, "at true size (the Prospector 128 m, the Capital Ark 5.6 km)");
const rows = [...new Set(props.map((o) => o.y))];
t.ok(rows.length === 5, "in rows: ships (blue), ships (red), NPC ships, structures, asteroids", rows.length);
const overlap = props.some((o, i) => props.some((q, j) => j > i && Math.abs(o.x - q.x) < (o.w + q.w) / 2 && Math.abs(o.y - q.y) < (o.h + q.h) / 2));
t.ok(!overlap, "nothing overlaps");
t.ok(props.every((o) => Math.hypot(Math.abs(o.x - lib.x) + o.w / 2, Math.abs(o.y - lib.y) + o.h / 2) <= lib.r), "all inside the POI");

// only sent to players with a ship inside; warping in lands clear of the shelves; no destination on a prop
t.ok(!w.fieldsFor(a).fields.some((f) => f.poi === "library"), "its objects aren't sent from outside");
Object.assign(sa, { x: 0, y: 0, vx: 0, vy: 0 }); w._startWarp(sa, lib, Date.now());
const land = { x: sa.wp.tx, y: sa.wp.ty };
t.ok(Math.hypot(land.x - lib.x, land.y - lib.y) <= lib.r && props.every((o) => Math.abs(land.x - o.x) > o.w / 2 || Math.abs(land.y - o.y) > o.h / 2), "a warp drops out inside, clear of the shelves", land);
for (let i = 0; i < 400 && sa.wp; i++) { sa.wp.at -= 60000; w.tick(0.05); }
const f = w.fieldsFor(a).fields.find((x) => x.poi === "library");
t.ok(f && f.props.length === props.length && !f.rocks.length, "inside, its objects arrive");
const st = props.find((o) => o.name === "Station");
Object.assign(sa, { x: st.x - st.w, y: st.y, vx: 0, vy: 0 }); w.cmdMove("a", sa.id, st.x, st.y);
t.ok(Math.abs(sa.tx - st.x) >= st.w * 0.45 || Math.abs(sa.ty - st.y) >= st.h * 0.45, "a move order into one stops at its edge", [sa.tx - st.x, sa.ty - st.y]);
Object.assign(sa, { x: st.x - st.w, y: st.y, vx: 0, vy: 0 }); w.cmdMove("a", sa.id, st.x + st.w, st.y); let over = false;
for (let i = 0; i < 400; i++) { w.tick(0.05); if (Math.abs(sa.x - st.x) < st.w / 4 && Math.abs(sa.y - st.y) < st.h / 4) over = true; }
t.ok(over, "ships fly over them on the way");
for (let i = 0; i < 20; i++) w.tick(0.05); w.nextPoiTick = 0; w.tick(0.05);
t.ok(w.pois.has("library") && !lib.retired, "it never wastes away or closes");
t.done();
