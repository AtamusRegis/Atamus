// The base surface (DESIGN.md › The base surface): each player's production grid on their home planet.
// Ore → Home Base → pipes → Refinery (ore → -ium) → Factory (iums → components) → Shipyard (components → ships).
// Pipes have a direction (owner: "pipes direct flow"): output runs along them, instantly, to the buildings they lead
// into. A building takes its inputs from whatever pipes lead to it, and puts its output into the storage they lead to.
import { ITEMS, IUMS } from "./inventory.js";

export const BASE_W = 64, BASE_H = 64, PIPE_COST = 500, REFUND = 0.5;
const H = 3600e3;
// footprints in tiles (64 px art tiles); the frigate / cruiser / battleship docks only connect at their ports
export const BUILDINGS = {
  home:      { name: "Home Base", w: 4, h: 4, cost: 0, cap: 2_000_000 },
  storage_s: { name: "Small Storage Depot", w: 1, h: 1, cost: 60_000, cap: 10_000 },
  storage:   { name: "Medium Storage Depot", w: 2, h: 2, cost: 250_000, cap: 50_000 },
  storage_l: { name: "Large Storage Depot", w: 3, h: 3, cost: 1_000_000, cap: 250_000 },
  refinery:  { name: "Refinery", w: 3, h: 3, cost: 750_000, rate: 1 },                    // m³ of ore per second
  factory:   { name: "Factory", w: 3, h: 3, cost: 1_500_000 },
  dock_frigate:    { name: "Frigate Shipyard", w: 3, h: 2, cost: 2_000_000, rank: 1, art: "frigate", ports: [["W", 1], ["E", 1], ["S", 1]] },
  dock_cruiser:    { name: "Cruiser Shipyard", w: 5, h: 4, cost: 25_000_000, rank: 2, art: "cruiser", ports: [["W", 1], ["E", 1], ["S", 1], ["S", 3]] },
  dock_battleship: { name: "Battleship Shipyard", w: 14, h: 7, cost: 150_000_000, rank: 3, art: "battleship", ports: [["W", 3], ["E", 3], ["S", 3], ["S", 10]] },
  dock_large:      { name: "Mini Ark Yard", w: 4, h: 3, cost: 100_000_000, rank: 4, yard: "yard_mini", ark: "ark_mini" },
  dock_capital:    { name: "Small Ark Yard", w: 6, h: 4, cost: 1_000_000_000, rank: 5, yard: "yard_small", ark: "ark_small" },
  dock_ark:        { name: "Ark Yard", w: 8, h: 5, cost: 5_000_000_000, rank: 6, yard: "yard_ark", ark: "ark" },
};
export const BUF_M3 = 2000;   // a refinery's / factory's own output buffer when nothing on its network has room

// Factory recipes: component -> { in: {item: qty}, ms, out }
export const RECIPES = {
  steel_plate:          { in: { cryonium: 20 }, ms: 60e3 },
  hull_plating:         { in: { steel_plate: 4, duranium: 10 }, ms: 240e3 },
  structural_beam:      { in: { cryonium: 30, duranium: 5 }, ms: 120e3 },
  bolts_fasteners:      { in: { cryonium: 5 }, ms: 30e3, out: 10 },
  cable_spool:          { in: { pyroxium: 15 }, ms: 60e3 },
  circuit_board:        { in: { pyroxium: 10, hexium: 2 }, ms: 180e3 },
  processor_chip:       { in: { circuit_board: 2, hexium: 5 }, ms: 360e3 },
  power_cell:           { in: { pyroxium: 10, duranium: 5 }, ms: 180e3 },
  reactor_core:         { in: { power_cell: 4, hexium: 10, tantalium: 2 }, ms: 1200e3 },
  thruster_nozzle:      { in: { duranium: 15, cryonium: 5 }, ms: 240e3 },
  engine_assembly:      { in: { thruster_nozzle: 2, power_cell: 1, bolts_fasteners: 4 }, ms: 720e3 },
  shield_emitter:       { in: { circuit_board: 1, duranium: 15, hexium: 2 }, ms: 480e3 },
  sensor_dish:          { in: { processor_chip: 1, cryonium: 10 }, ms: 480e3 },
  hydraulic_piston:     { in: { cryonium: 10, pyroxium: 5 }, ms: 120e3 },
  gyroscope:            { in: { hexium: 5, bolts_fasteners: 2 }, ms: 300e3 },
  coolant_canister:     { in: { pyroxium: 10, duranium: 3 }, ms: 120e3 },
  viewport_glass:       { in: { hexium: 6 }, ms: 180e3 },
  forcefield_generator: { in: { shield_emitter: 2, reactor_core: 1, tantalium: 5 }, ms: 2700e3 },
};
// Ship bills (owner: frigates 2 h, cruisers 24 h, battleships 3 days; arks 3 / 10 / 30 days). Exhumers (owner: the
// third tier of miners) cost and take as long as a battleship, but build in the cruiser shipyard their art belongs to.
const FRIGATE = { hull_plating: 10, structural_beam: 8, bolts_fasteners: 40, cable_spool: 4, circuit_board: 2, power_cell: 1, thruster_nozzle: 2, engine_assembly: 1, sensor_dish: 1, gyroscope: 1, viewport_glass: 1 };
const CRUISER = { hull_plating: 60, structural_beam: 40, bolts_fasteners: 200, cable_spool: 20, circuit_board: 10, processor_chip: 4, power_cell: 6, thruster_nozzle: 6, engine_assembly: 3, sensor_dish: 2, hydraulic_piston: 8, gyroscope: 2, coolant_canister: 6, viewport_glass: 4 };
const BATTLESHIP = { hull_plating: 400, structural_beam: 250, bolts_fasteners: 1000, cable_spool: 80, circuit_board: 40, processor_chip: 20, reactor_core: 4, thruster_nozzle: 16, engine_assembly: 8, shield_emitter: 8, sensor_dish: 6, hydraulic_piston: 30, gyroscope: 6, coolant_canister: 20, viewport_glass: 10 };
const times = (bill, n, extra) => { const o = {}; for (const [k, v] of Object.entries(bill)) o[k] = v * n; for (const [k, v] of Object.entries(extra || {})) o[k] = (o[k] || 0) + v; return o; };
export const SHIP_BUILDS = {
  chisel:      { rank: 1, ms: 2 * H, bill: FRIGATE, art: "chisel" },
  dragline:    { rank: 2, ms: 24 * H, bill: CRUISER, art: "barge_S" },
  bedrock:     { rank: 2, ms: 24 * H, bill: CRUISER, art: "barge_XS" },
  hopper:      { rank: 2, ms: 24 * H, bill: CRUISER, art: "barge_M" },
  bucketwheel: { rank: 2, ms: 72 * H, bill: BATTLESHIP, art: "exhumer_S" },
  keystone:    { rank: 2, ms: 72 * H, bill: BATTLESHIP, art: "exhumer_XS" },
  silo:        { rank: 2, ms: 72 * H, bill: BATTLESHIP, art: "exhumer_M" },
  ark_mini:    { rank: 4, ms: 72 * H, bill: times(BATTLESHIP, 1, { forcefield_generator: 1 }), art: "ark_mini" },
  ark_small:   { rank: 5, ms: 240 * H, bill: times(BATTLESHIP, 4, { forcefield_generator: 4 }), art: "ark_small" },
  ark:         { rank: 6, ms: 720 * H, bill: times(BATTLESHIP, 15, { forcefield_generator: 20 }), art: "ark" },
};
const ORE_OF = Object.fromEntries(Object.entries(IUMS).map(([o, i]) => [i, o]));
const m3 = (store) => { let s = 0; for (const k in store) s += store[k] * ((ITEMS[k] || {}).unitM3 || 0); return s; };
const isOre = (k) => (ITEMS[k] || {}).kind === "ore";

export function createBase() {
  const b = { ver: 1, nextId: 1, buildings: [], pipe: {} };
  b.buildings.push({ id: b.nextId++, type: "home", x: 30, y: 30, store: {} });
  return b;
}
/** Bring a saved base up to date: pipes laid before they had a direction stay two-way ({u:1}) until redrawn. */
export function normalize(b) {
  if (!b.pipe || typeof b.pipe !== "object") b.pipe = {};
  if (Array.isArray(b.pipes)) { for (const k of b.pipes) if (!b.pipe[k]) b.pipe[k] = { o: "", i: "", u: 1 }; delete b.pipes; }
  for (const q of b.buildings) if (isStore(q) && !q.store) q.store = {};
  b.buildings = b.buildings.filter((q) => BUILDINGS[q.type]);
  return b;
}
export const homeOf = (b) => b.buildings.find((x) => x.type === "home");
const rectHas = (q, x, y) => x >= q.x && y >= q.y && x < q.x + BUILDINGS[q.type].w && y < q.y + BUILDINGS[q.type].h;
export const buildingAt = (b, x, y) => b.buildings.find((q) => rectHas(q, x, y)) || null;

// the tiles a building's pipes must touch: its ports (docks) or any tile around it
function portTiles(q) {
  const d = BUILDINGS[q.type], out = [];
  if (d.ports) for (const [side, i] of d.ports) out.push(side === "W" ? [q.x - 1, q.y + i, "W"] : side === "E" ? [q.x + d.w, q.y + i, "E"] : side === "S" ? [q.x + i, q.y + d.h, "S"] : [q.x + i, q.y - 1, "N"]);
  else { for (let i = 0; i < d.w; i++) out.push([q.x + i, q.y - 1, "N"], [q.x + i, q.y + d.h, "S"]); for (let i = 0; i < d.h; i++) out.push([q.x - 1, q.y + i, "W"], [q.x + d.w, q.y + i, "E"]); }
  return out;
}
export const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const OPP = { N: "S", S: "N", E: "W", W: "E" };
const dirTo = (a, c) => (c[0] === a[0] + 1 ? "E" : c[0] === a[0] - 1 ? "W" : c[1] === a[1] + 1 ? "S" : "N");
const hasPort = (q, x, y) => portTiles(q).some(([px, py]) => px === x && py === y);
/** Where each building's output can go: the buildings its pipes lead into (cached until the layout changes). */
export function links(b) {
  if (b._net && b._net.ver === b.ver) return b._net;
  const down = new Map(), up = new Map(), P = b.pipe || {};
  for (const q of b.buildings) { down.set(q, new Set()); up.set(q, new Set()); }
  for (const q of b.buildings) {
    const seen = new Set(), stack = [];
    for (const [x, y, d] of portTiles(q)) { const t = P[x + "," + y]; if (t && (t.u || t.i.includes(OPP[d]))) stack.push([x, y, d]); }
    while (stack.length) {
      const [x, y, m] = stack.pop(), t = P[x + "," + y]; if (!t) continue;
      const key = x + "," + y + (t.c ? m : ""); if (seen.has(key)) continue; seen.add(key);
      const outs = t.u ? "NESW" : t.c ? (t.o.includes(m) ? m : "") : t.o;       // a crossing only carries straight through
      for (const e of outs) {
        const nx = x + DIRS[e][0], ny = y + DIRS[e][1], nb = buildingAt(b, nx, ny);
        if (nb) { if (nb !== q && hasPort(nb, x, y)) { down.get(q).add(nb); up.get(nb).add(q); } }
        else if (P[nx + "," + ny]) stack.push([nx, ny, e]);
      }
    }
  }
  const net = { ver: b.ver, down, up };
  Object.defineProperty(b, "_net", { value: net, writable: true, configurable: true, enumerable: false });
  return net;
}
// ---- moving things along the pipes ----
function isStore(q) { return q.type === "home" || q.type.startsWith("storage"); }
const capOf = (q) => (BUILDINGS[q.type].cap != null ? BUILDINGS[q.type].cap : BUF_M3);
const bufOf = (q) => (isStore(q) ? q.store : (q.buf ||= {}));
function avail(net, item) { let n = 0; for (const q of net) { const s = isStore(q) ? q.store : q.buf; if (s && s[item]) n += s[item]; } return n; }
function take(net, item, n) {
  for (const q of [...net].sort((a, c) => (isStore(a) ? 1 : 0) - (isStore(c) ? 1 : 0))) {   // producers' buffers first, then storage
    const s = isStore(q) ? q.store : q.buf; if (!s || !s[item]) continue;
    const k = Math.min(n, s[item]); s[item] -= k; if (!s[item]) delete s[item]; n -= k; if (!n) return;
  }
}
// room for n of item: ore goes to the home base (or storage); anything else to storage, else the maker's own buffer
function room(net, item, src) {
  const u = (ITEMS[item] || {}).unitM3 || 0, out = [];
  for (const q of net) if (isStore(q) && (q.type !== "home" || isOre(item))) out.push([q, Math.floor((capOf(q) - m3(q.store)) / u + 1e-9)]);
  if (src && !isStore(src)) out.push([src, Math.floor((BUF_M3 - m3(src.buf || {})) / u + 1e-9)]);
  return out;
}
function canPut(net, item, n, src) { return room(net, item, src).reduce((a, [, r]) => a + Math.max(0, r), 0) >= n; }
function put(net, item, n, src) { for (const [q, r] of room(net, item, src)) { const k = Math.min(n, Math.max(0, r)); if (!k) continue; const s = bufOf(q); s[item] = (s[item] || 0) + k; n -= k; if (!n) return true; } return n === 0; }

// ---- the simulation: dt in ms; ctx.spawn(shipType) delivers a finished ship ----
export function step(b, dt, ctx) {
  const L = links(b);
  for (const q of b.buildings) {
    const net = [q, ...L.up.get(q)], out = [...L.down.get(q)];     // inputs: what leads in; output: where it leads
    if (q.type === "refinery") {
      q.budget = Math.min(60, (q.budget || 0) + BUILDINGS.refinery.rate * dt / 1000);          // m³ of ore it may refine (at most a minute's worth banked)
      for (let guard = 0; guard < 10 && q.budget > 0; guard++) {
        const ores = (q.ore && q.ore !== "any" ? [q.ore] : Object.keys(IUMS)).filter((o) => avail(net, o) >= 10);
        if (!ores.length) { q.budget = 0; q.idle = "No ore"; break; }
        const ore = ores.sort((a, c) => avail(net, c) - avail(net, a))[0], u = ITEMS[ore].unitM3;
        const n10 = Math.floor(Math.min(avail(net, ore), q.budget / u) / 10) * 10; if (n10 < 10) break;
        const ium = IUMS[ore];
        if (!canPut(out, ium, n10 / 10, q)) { q.idle = "No room"; q.budget = 0; break; }
        take(net, ore, n10); put(out, ium, n10 / 10, q); q.budget -= n10 * u; q.done = (q.done || 0) + n10 / 10; q.idle = null;
      }
    } else if (q.type === "factory" || BUILDINGS[q.type].rank) {
      const yard = !!BUILDINGS[q.type].rank;
      let left = dt;
      for (let guard = 0; guard < 1000; guard++) {
        if (q.job) {
          q.job.left -= left; left = 0;
          if (q.job.left > 0) break;
          left = -q.job.left;
          if (yard) { if (ctx && ctx.spawn) ctx.spawn(q.job.item); }
          else { const r = RECIPES[q.job.item], n = r.out || 1; if (!canPut(out, q.job.item, n, q)) { q.job.left = 0; q.idle = "No room"; break; } put(out, q.job.item, n, q); }
          q.made = (q.made || 0) + 1; q.job = null;
        }
        if (!q.recipe || (q.mode === "count" && (q.made || 0) >= (q.count || 0))) { q.idle = null; break; }
        const need = yard ? (SHIP_BUILDS[q.recipe] || {}).bill : (RECIPES[q.recipe] || {}).in; if (!need) break;
        if (!Object.entries(need).every(([k, v]) => avail(net, k) >= v)) { q.idle = "Missing inputs"; break; }
        for (const [k, v] of Object.entries(need)) take(net, k, v);
        const ms = yard ? SHIP_BUILDS[q.recipe].ms : RECIPES[q.recipe].ms;
        q.job = { item: q.recipe, left: ms, total: ms }; q.idle = null;
        if (left <= 0) break;
      }
    }
  }
}
/** Catch up on time away (owner: the base is the only thing that runs while you're offline), in 60 s steps, up to 31 days. */
export function catchUp(b, ms, ctx) { ms = Math.min(ms, 31 * 24 * H); while (ms > 0) { const d = Math.min(60e3, ms); step(b, d, ctx); ms -= d; } }

// ---- editing (validated by the caller: credits, ownership) ----
export function canPlace(b, type, x, y) {
  const d = BUILDINGS[type]; if (!d || type === "home" || d.hidden) return false;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + d.w > BASE_W || y + d.h > BASE_H) return false;
  for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) if (buildingAt(b, x + i, y + j) || b.pipe[(x + i) + "," + (y + j)]) return false;
  return true;
}
export function place(b, type, x, y) { const q = { id: b.nextId++, type, x, y }; if (isStore(q)) q.store = {}; b.buildings.push(q); b.ver++; return q; }
const inGrid = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < BASE_W && y < BASE_H;
/** A drag, sanitized: whole in-grid tiles, each next to the one before (a jump starts a new run). Returns the runs
 *  and how many new pipe tiles they'd lay. */
export function planPath(b, tiles) {
  const runs = []; let run = null;
  for (const t of Array.isArray(tiles) ? tiles.slice(0, 400) : []) {
    if (!Array.isArray(t)) continue; const x = Number(t[0]), y = Number(t[1]); if (!inGrid(x, y)) continue;
    const last = run && run[run.length - 1];
    if (last && last[0] === x && last[1] === y) continue;
    if (!last || Math.abs(last[0] - x) + Math.abs(last[1] - y) !== 1) { run = []; runs.push(run); }
    run.push([x, y]);
  }
  const fresh = new Set(); for (const r of runs) for (const [x, y] of r) if (!b.pipe[x + "," + y] && !buildingAt(b, x, y)) fresh.add(x + "," + y);
  return { runs, fresh: fresh.size };
}
const strip = (s, d) => s.replace(d, "");
const addDir = (s, d) => (s.includes(d) ? s : s + d);
/** Lay the runs, at most `budget` new tiles (the run stops where the money does). Each tile flows on toward the next
 *  one; a straight run across a perpendicular straight pipe crosses it instead of joining it. */
export function applyPath(b, runs, budget) {
  let laid = 0;
  for (const r of runs) {
    for (let k = 0; k < r.length; k++) {
      const [x, y] = r[k], key = x + "," + y; if (buildingAt(b, x, y)) continue;
      let t = b.pipe[key];
      if (!t) { if (laid >= budget) return laid; t = b.pipe[key] = { o: "", i: "" }; laid++; }
      const din = k > 0 ? dirTo(r[k], r[k - 1]) : null, dout = k < r.length - 1 ? dirTo(r[k], r[k + 1]) : null;
      if (t.u) { t.o = ""; t.i = ""; delete t.u; }
      const straight = din && dout && OPP[din] === dout, horiz = (d) => d === "E" || d === "W";
      const tStraight = !t.c && t.o.length === 1 && t.i.length === 1 && OPP[t.i] === t.o;
      if (straight && (t.c || (tStraight && horiz(dout) !== horiz(t.o)))) {
        // crossing: keep the other axis, (re)set this one
        const keepO = [...t.o].filter((d) => horiz(d) !== horiz(dout)).join(""), keepI = [...t.i].filter((d) => horiz(d) !== horiz(dout)).join("");
        t.o = keepO + dout; t.i = keepI + din; t.c = 1;
        continue;
      }
      if (t.c) delete t.c;
      if (dout) { t.i = strip(t.i, dout); t.o = addDir(t.o, dout); }
      if (din) { t.o = strip(t.o, din); t.i = addDir(t.i, din); }
    }
  }
  if (laid || runs.length) b.ver++;
  return laid;
}
export function remove(b, x, y) {
  const k = x + "," + y;
  if (b.pipe[k]) {
    delete b.pipe[k];
    for (const [d, [dx, dy]] of Object.entries(DIRS)) { const n = b.pipe[(x + dx) + "," + (y + dy)]; if (n && !n.u) { n.o = strip(n.o, OPP[d]); n.i = strip(n.i, OPP[d]); if (n.c) delete n.c; } }
    b.ver++; return { pipe: true };
  }
  const q = buildingAt(b, x, y); if (!q || q.type === "home") return null;
  b.buildings = b.buildings.filter((o) => o !== q); b.ver++;
  return { building: q };
}
// what the client sees
export function view(b) {
  const L = links(b);
  return {
    w: BASE_W, h: BASE_H, pipe: b.pipe,
    buildings: b.buildings.map((q) => ({ id: q.id, type: q.type, x: q.x, y: q.y, linked: L.up.get(q).size + L.down.get(q).size > 0, store: q.store, buf: q.buf, used: q.store ? Math.round(m3(q.store)) : undefined,
      ore: q.ore, recipe: q.recipe, mode: q.mode, count: q.count, made: q.made || 0, idle: q.idle || null, job: q.job ? { item: q.job.item, p: +(1 - q.job.left / q.job.total).toFixed(4), left: Math.max(0, Math.round(q.job.left)) } : null })),
  };
}
