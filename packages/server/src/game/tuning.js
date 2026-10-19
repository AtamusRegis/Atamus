// (owner, 2026-10-17; the sandbox build 2026-10-18) Live tuning on the server: the game's numbers that may be changed at
// runtime (the world's shape, each ship, chunks and densities, ring shells, the core,
// drops), checked as hostile, kept in the database (ring_tuning, one row) and put back on every start. The
// game client no longer carries a developer panel; staff sessions can still send tune ops. Changing the rings, the cell
// or the ring shells regrows the asteroids; only the station's place stays fixed.
import { pool } from "../db.js";
import * as R from "./rules.js";

export const ROOTS = { world: R.WORLD, ships: R.SHIPS, fly: R.FLY, chunk: R.CHUNK, layout: R.LAYOUT, core: R.CORE, corium: R.CORIUM, laser: R.LASER,
  rock: R.ROCK, ringShells: R.RING_SHELLS, ringSpawn: R.RING_SPAWN, ringBedrock: R.RING_BEDROCK, drops: R.DROPS, jetcan: R.JETCAN, tractor: R.TRACTOR, beams: R.STATION_BEAMS, econ: R.ECON };
const DEFAULTS = JSON.parse(JSON.stringify(ROOTS));
// each number's limits: [low, high, whole]
function limitsFor(path) {
  const [root, a] = path, last = path[path.length - 1];
  if (root === "world") return a === "cell" ? [100, 5000, true] : [50, 1e6, true];
  if (root === "ringShells") return [2, 24, true];
  if (root === "ringSpawn") return [0, 3, false];
  if (root === "ringBedrock") return [0, 0.9, false];
  if (root === "chunk") return last === "barren" ? [0, 1, false] : /^[wb]\d$/.test(last) ? [0, 100, true] : [0.01, 100, false];
  if (root === "layout") return a === "arcs" ? [6, 180, false] : a === "splitW" || a === "splitL" ? [0, 1, false] : [0.5, 200, false];
  if (root === "ships" && last === "hold") return [1, 1e6, false];
  return [0, 1e6, false];
}
// walk to a number in the live objects (only numbers already there can be set)
function at(path) {
  if (!Array.isArray(path) || path.length < 2 || path.length > 5 || !Object.hasOwn(ROOTS, path[0])) return null;
  let o = ROOTS[path[0]];
  for (let i = 1; i < path.length - 1; i++) { const k = path[i]; if (o === null || typeof o !== "object" || !(typeof k === "string" || Number.isInteger(k)) || !Object.hasOwn(o, k)) return null; o = o[k]; }
  const k = path[path.length - 1]; if (o === null || typeof o !== "object" || !(typeof k === "string" || Number.isInteger(k)) || !Object.hasOwn(o, k) || typeof o[k] !== "number") return null;
  return { o, k };
}
export function setValue(path, value) {
  if (path && path[0] === "world" && path[1] === "station") return false;   // (the station's place isn't a tuning number)
  const t = at(path); if (!t || typeof value !== "number" || !Number.isFinite(value)) return false;
  const [lo, hi, int] = limitsFor(path); let v = Math.max(lo, Math.min(hi, value)); if (int) v = Math.round(v);
  if (path[0] === "ringShells") { const pair = R.RING_SHELLS[path[1]]; if (path[2] === 0) v = Math.min(v, pair[1]); else v = Math.max(v, pair[0]); }   // (min <= max)
  t.o[t.k] = v; return true;
}
function copyInto(dst, src) {                    // numbers only, where the shapes match
  for (const k of Object.keys(dst)) {
    if (!src || !Object.hasOwn(src, k)) continue;
    if (typeof dst[k] === "number" && typeof src[k] === "number" && Number.isFinite(src[k])) dst[k] = src[k];
    else if (dst[k] && typeof dst[k] === "object") copyInto(dst[k], src[k]);
  }
}
export function resetAll() { copyInto(ROOTS, DEFAULTS); }
export async function loadTuning() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ring_tuning (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const { rows } = await pool.query(`SELECT data FROM ring_tuning WHERE id = 1`);
  if (rows[0]) { const d = rows[0].data; if (d._v >= 9) copyInto(ROOTS, d); }   // (_v < 9: saved before the station deposit fields; its numbers mean other things)
}
export async function saveTuning() {
  await pool.query(`INSERT INTO ring_tuning (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`, [JSON.stringify({ _v: 9, ...ROOTS })]);
}
// which changes regrow the asteroids (their places, sizes and layouts come from these)
export const reshapes = (path) => ["ringShells", "ringSpawn", "ringBedrock"].includes(path[0]) || (path[0] === "world" && (path[1] === "rings" || path[1] === "cell")) || (path[0] === "rock" && path[1] === "spawnChance") || path[0] === "layout" || (path[0] === "chunk" && /^([wb]\d|barren)$/.test(path[1]));
