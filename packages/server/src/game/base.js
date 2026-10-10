// The base surface (DESIGN.md › The base surface): each player's production grid on their home planet.
// Ore → Home Base → pipes → Refinery (ore → -ium) → Factory (iums → components) → Shipyard (components → ships).
// Pipes carry finished output instantly to whatever on the same pipe network needs it; storage holds the rest.
import { ITEMS, IUMS } from "./inventory.js";

export const BASE_W = 64, BASE_H = 64, PIPE_COST = 500, REFUND = 0.5;
const H = 3600e3;
// footprints in tiles; docks use the owner's dock art (64 px tiles) and only connect at their ports
export const BUILDINGS = {
  home:      { name: "Home Base", w: 4, h: 4, cost: 0, cap: 2_000_000 },
  storage:   { name: "Storage Unit", w: 2, h: 2, cost: 250_000, cap: 50_000 },
  refinery:  { name: "Refinery", w: 3, h: 3, cost: 750_000, rate: 1 },                    // m³ of ore per second
  factory:   { name: "Factory", w: 3, h: 3, cost: 1_500_000 },
  dock_frigate:    { name: "Frigate Shipyard", w: 3, h: 2, cost: 2_000_000, rank: 1, art: "frigate", ports: [["W", 1], ["E", 1], ["S", 1]] },
  dock_cruiser:    { name: "Cruiser Shipyard", w: 5, h: 4, cost: 25_000_000, rank: 2, art: "cruiser", ports: [["W", 1], ["E", 1], ["S", 1], ["S", 3]] },
  dock_battleship: { name: "Battleship Shipyard", w: 14, h: 7, cost: 150_000_000, rank: 3, art: "battleship", ports: [["W", 3], ["E", 3], ["S", 3], ["S", 10]] },
  dock_large:      { name: "Mini Ark Yard", w: 9, h: 6, cost: 100_000_000, rank: 4, art: "large", ports: [["W", 2], ["E", 2], ["S", 2], ["S", 6]] },
  dock_capital:    { name: "Small Ark Yard", w: 15, h: 7, cost: 1_000_000_000, rank: 5, art: "capital", ports: [["W", 3], ["E", 3], ["S", 3], ["S", 11]] },
  dock_ark:        { name: "Ark Yard", w: 49, h: 18, cost: 5_000_000_000, rank: 6, art: "ark", ports: [["W", 9], ["E", 9], ["S", 8], ["S", 40]] },
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
  const b = { ver: 1, nextId: 1, buildings: [], pipes: [] };
  b.buildings.push({ id: b.nextId++, type: "home", x: 30, y: 30, store: {} });
  return b;
}
export const homeOf = (b) => b.buildings.find((x) => x.type === "home");
const rectHas = (q, x, y) => x >= q.x && y >= q.y && x < q.x + BUILDINGS[q.type].w && y < q.y + BUILDINGS[q.type].h;
export const buildingAt = (b, x, y) => b.buildings.find((q) => rectHas(q, x, y)) || null;

// the tiles a building's pipes must touch: its ports (docks) or any tile around it
function portTiles(q) {
  const d = BUILDINGS[q.type], out = [];
  if (d.ports) for (const [side, i] of d.ports) out.push(side === "W" ? [q.x - 1, q.y + i] : side === "E" ? [q.x + d.w, q.y + i] : side === "S" ? [q.x + i, q.y + d.h] : [q.x + i, q.y - 1]);
  else { for (let i = 0; i < d.w; i++) out.push([q.x + i, q.y - 1], [q.x + i, q.y + d.h]); for (let i = 0; i < d.h; i++) out.push([q.x - 1, q.y + i], [q.x + d.w, q.y + i]); }
  return out;
}
// pipe networks: connected pipe tiles, and the buildings plugged into each (cached until the layout changes)
export function networks(b) {
  if (b._net && b._net.ver === b.ver) return b._net.list;
  const pipes = new Set(b.pipes), seen = new Map(), list = [];
  for (const t of pipes) {
    if (seen.has(t)) continue;
    const id = list.length, stack = [t]; seen.set(t, id);
    while (stack.length) { const [x, y] = stack.pop().split(",").map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + "," + (y + dy); if (pipes.has(k) && !seen.has(k)) { seen.set(k, id); stack.push(k); } } }
    list.push(new Set());
  }
  // a building touching several pipe runs joins them into one network
  const parent = list.map((_, i) => i), find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const q of b.buildings) {
    const ids = [...new Set(portTiles(q).map(([x, y]) => seen.get(x + "," + y)).filter((v) => v != null))];
    for (const id of ids) list[id].add(q);
    for (let i = 1; i < ids.length; i++) parent[find(ids[i])] = find(ids[0]);
  }
  const merged = new Map(); list.forEach((set, i) => { const r = find(i); if (!merged.has(r)) merged.set(r, new Set()); for (const q of set) merged.get(r).add(q); });
  const nets = [...merged.values()].map((s) => [...s]).filter((n) => n.length > 1);
  Object.defineProperty(b, "_net", { value: { ver: b.ver, list: nets }, writable: true, configurable: true, enumerable: false });
  return nets;
}

// ---- moving things around one network ----
const isStore = (q) => q.type === "home" || q.type === "storage";
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
  for (const q of net) if (isStore(q) && (q.type === "storage" || isOre(item))) out.push([q, Math.floor((capOf(q) - m3(q.store)) / u + 1e-9)]);
  if (src && !isStore(src)) out.push([src, Math.floor((BUF_M3 - m3(src.buf || {})) / u + 1e-9)]);
  return out;
}
function canPut(net, item, n, src) { return room(net, item, src).reduce((a, [, r]) => a + Math.max(0, r), 0) >= n; }
function put(net, item, n, src) { for (const [q, r] of room(net, item, src)) { const k = Math.min(n, Math.max(0, r)); if (!k) continue; const s = bufOf(q); s[item] = (s[item] || 0) + k; n -= k; if (!n) return true; } return n === 0; }

// ---- the simulation: dt in ms; ctx.spawn(shipType) delivers a finished ship ----
export function step(b, dt, ctx) {
  const nets = networks(b), netOf = new Map();
  for (const n of nets) for (const q of n) if (!netOf.has(q)) netOf.set(q, n);
  for (const q of b.buildings) {
    const net = netOf.get(q) || [q];
    if (q.type === "refinery") {
      q.budget = Math.min(60, (q.budget || 0) + BUILDINGS.refinery.rate * dt / 1000);          // m³ of ore it may refine (at most a minute's worth banked)
      for (let guard = 0; guard < 10 && q.budget > 0; guard++) {
        const ores = (q.ore && q.ore !== "any" ? [q.ore] : Object.keys(IUMS)).filter((o) => avail(net, o) >= 10);
        if (!ores.length) { q.budget = 0; q.idle = "No ore"; break; }
        const ore = ores.sort((a, c) => avail(net, c) - avail(net, a))[0], u = ITEMS[ore].unitM3;
        const n10 = Math.floor(Math.min(avail(net, ore), q.budget / u) / 10) * 10; if (n10 < 10) break;
        const ium = IUMS[ore];
        if (!canPut(net, ium, n10 / 10, q)) { q.idle = "No room"; q.budget = 0; break; }
        take(net, ore, n10); put(net, ium, n10 / 10, q); q.budget -= n10 * u; q.done = (q.done || 0) + n10 / 10; q.idle = null;
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
          else { const r = RECIPES[q.job.item], n = r.out || 1; if (!canPut(net, q.job.item, n, q)) { q.job.left = 0; q.idle = "No room"; break; } put(net, q.job.item, n, q); }
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
  const d = BUILDINGS[type]; if (!d || type === "home") return false;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + d.w > BASE_W || y + d.h > BASE_H) return false;
  const pipes = new Set(b.pipes);
  for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) if (buildingAt(b, x + i, y + j) || pipes.has((x + i) + "," + (y + j))) return false;
  return true;
}
export function place(b, type, x, y) { const q = { id: b.nextId++, type, x, y }; if (type === "storage") q.store = {}; b.buildings.push(q); b.ver++; return q; }
export function addPipes(b, tiles) {
  const have = new Set(b.pipes), add = [];
  for (const t of tiles) { if (!Array.isArray(t)) continue; const x = Math.floor(Number(t[0])), y = Math.floor(Number(t[1])); if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= BASE_W || y >= BASE_H) continue; const k = x + "," + y; if (have.has(k) || buildingAt(b, x, y)) continue; have.add(k); add.push(k); }
  return add;
}
export function remove(b, x, y) {
  const k = x + "," + y, pi = b.pipes.indexOf(k);
  if (pi >= 0) { b.pipes.splice(pi, 1); b.ver++; return { pipe: true }; }
  const q = buildingAt(b, x, y); if (!q || q.type === "home") return null;
  b.buildings = b.buildings.filter((o) => o !== q); b.ver++;
  return { building: q };
}
// what the client sees
export function view(b) {
  const nets = networks(b), netId = new Map(); nets.forEach((n, i) => n.forEach((q) => netId.set(q.id, i)));
  return {
    w: BASE_W, h: BASE_H, pipes: b.pipes,
    buildings: b.buildings.map((q) => ({ id: q.id, type: q.type, x: q.x, y: q.y, net: netId.has(q.id) ? netId.get(q.id) : -1, store: q.store, buf: q.buf, used: q.store ? Math.round(m3(q.store)) : undefined,
      ore: q.ore, recipe: q.recipe, mode: q.mode, count: q.count, made: q.made || 0, idle: q.idle || null, job: q.job ? { item: q.job.item, p: +(1 - q.job.left / q.job.total).toFixed(4), left: Math.max(0, Math.round(q.job.left)) } : null })),
  };
}
