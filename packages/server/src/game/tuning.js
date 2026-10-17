// (owner, 2026-10-17) The developer panel's side on the server: the game's numbers that may be changed live (the ship,
// hulls, modules per level, ores and rings, asteroids, fuel, economy, limits), checked as hostile, kept in the database
// (ring_tuning, one row) and put back on every start. The world's shape (Saturn, the station, the rings' radii, the
// asteroid grid) isn't here: clients build asteroids from it.
import { pool } from "../db.js";
import * as R from "./rules.js";

export const ROOTS = { ship: R.SHIP, hulls: R.HULLS, modules: R.MODULES, upgradeCost: R.UPGRADE_COST, ores: R.ORES, ringOres: R.RING_ORES, ringSizes: R.RING_SIZES,
  ringSlots: R.RING_SLOTS, rock: R.ROCK, fuel: R.FUEL, econ: R.ECON, limits: R.LIMITS };
const DEFAULTS = JSON.parse(JSON.stringify(ROOTS));
// whole numbers, with their limits (everything else: 0 up to a million)
function limitsFor(path) {
  const [root, a, b] = path, last = path[path.length - 1];
  if (root === "hulls" && last === "slots") return [1, 4, true];
  if (root === "ringSizes") return [1, 15, true];
  if (root === "ringSlots") return [0, 3, true];
  if (root === "limits") return [1, 1000, true];
  if (root === "ship" && (a === "hold" || a === "tank")) return [1, 1e6, true];
  if (root === "modules" && (b === "hold" || b === "tank")) return [1, 1e6, true];
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
  const { rows } = await pool.query(`SELECT data FROM ring_tuning WHERE id = 1`); if (rows[0]) copyInto(ROOTS, rows[0].data);
}
export async function saveTuning() {
  await pool.query(`INSERT INTO ring_tuning (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`, [JSON.stringify(ROOTS)]);
}
// which changes rebuild the untouched asteroids (their sizes and ores come from these)
export const reshapes = (path) => ["ringSizes", "ringSlots", "ringOres"].includes(path[0]);
