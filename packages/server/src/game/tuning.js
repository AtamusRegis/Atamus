// (owner, 2026-10-17) The developer panel's side on the server: the game's numbers that may be changed live (the world's
// shape, each ship, chunks and densities, rock sizes, the core, ores, cans and crates, fuel, economy, services, limits),
// checked as hostile, kept in the database (ring_tuning, one row) and put back on every start. Changing the rings, the
// cell or the rock sizes regrows the asteroids; only the station's place stays fixed.
import { pool } from "../db.js";
import * as R from "./rules.js";

export const ROOTS = { world: R.WORLD, ships: R.SHIPS, fly: R.FLY, chunk: R.CHUNK, rockSizes: R.ROCKS, core: R.CORE, rock: R.ROCK,
  ringSizes: R.RING_SIZES, ores: R.ORES, pieces: R.PIECES, cans: R.CANS, crateShare: R.CRATE_SHARE, downtime: R.DOWNTIME,
  fuel: R.FUEL, econ: R.ECON, services: R.SERVICES, limits: R.LIMITS };
const DEFAULTS = JSON.parse(JSON.stringify(ROOTS));
// each number's limits: [low, high, whole]
function limitsFor(path) {
  const [root, a] = path, last = path[path.length - 1];
  if (root === "world") return a === "cell" ? [100, 5000, true] : [50, 1e6, true];
  if (root === "ringSizes") return [0, R.ROCKS.length - 1, true];
  if (root === "rockSizes") return last === "chunks" ? [4, 400, true] : last === "oreTypes" ? [1, 3, true] : [1, 1e6, false];
  if (root === "chunk") return last === "burst" || last === "barren" ? [0, 1, false] : last.startsWith("w") ? [0, 100, true] : [0.01, 100, false];
  if (root === "crateShare") return [0, 1, false];
  if (root === "downtime") return last === "hourUTC" ? [0, 23, true] : [0, 86400, true];
  if (root === "pieces") return [1, 1e6, true];
  if (root === "limits") return [1, 1000, true];
  if (root === "ships" && (last === "hold" || last === "tank")) return [1, 1e6, false];
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
  if (path[0] === "ringSizes") { const pair = R.RING_SIZES[path[1]]; if (path[2] === 0) v = Math.min(v, pair[1]); else v = Math.max(v, pair[0]); }   // (min <= max)
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
  if (rows[0]) { const d = rows[0].data; if (d._v >= 3) copyInto(ROOTS, d); }   // (_v < 3: saved for the pre-2026-10-18 game; its numbers mean other things)
}
export async function saveTuning() {
  await pool.query(`INSERT INTO ring_tuning (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`, [JSON.stringify({ _v: 3, ...ROOTS })]);
}
// which changes regrow the asteroids (their places, sizes and layouts come from these)
export const reshapes = (path) => ["ringSizes", "rockSizes"].includes(path[0]) || (path[0] === "world" && (path[1] === "rings" || path[1] === "cell")) || (path[0] === "rock" && path[1] === "spawnChance");
