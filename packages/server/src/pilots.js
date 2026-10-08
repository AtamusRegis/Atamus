import { pool } from "./db.js";
import { LICENSES, getLicense, trainMs, requirementsMet } from "./licenses.js";

const CORP = "Delve Holdings";

function freshData() { return { licenses: {}, banked: {}, queue: [], activeStart: null, paused: false }; }
const banked = (d, key, level) => (d.banked[key] && d.banked[key][level]) || 0;
function setBanked(d, key, level, ms) { if (!d.banked[key]) d.banked[key] = {}; d.banked[key][level] = ms; }
function clearBanked(d, key, level) { if (d.banked[key]) delete d.banked[key][level]; }

/** Process completed training based on real elapsed time. Mutates data. */
function advance(d, now) {
  if (d.paused) return;                 // training frozen
  if (!d.queue.length) { d.activeStart = null; return; }
  if (d.activeStart == null) d.activeStart = now;
  while (d.queue.length) {
    const it = d.queue[0];
    const base = trainMs(it.key, it.level);
    if (base == null) { clearBanked(d, it.key, it.level); d.queue.shift(); continue; } // license no longer exists
    const need = base - banked(d, it.key, it.level);
    if (now - d.activeStart >= need) {
      d.licenses[it.key] = Math.max(d.licenses[it.key] || 0, it.level);
      clearBanked(d, it.key, it.level);
      d.queue.shift();
      d.activeStart += need;            // carry leftover time to the next item
    } else break;
  }
  if (!d.queue.length) d.activeStart = null;
}

// Count how many endorsements of a license are already queued.
const queuedCount = (d, key) => d.queue.filter((q) => q.key === key).length;

async function save(id, data) { await pool.query(`UPDATE pilots SET data = $1 WHERE id = $2`, [data, id]); }

export async function listPilotRows(userId) {
  const { rows } = await pool.query(`SELECT id, name, data FROM pilots WHERE user_id = $1 ORDER BY id`, [userId]);
  return rows;
}

export async function createPilot(userId, nameRaw) {
  const name = String(nameRaw || "").trim().slice(0, 24);
  if (!name) throw new Error("Pilot name required.");
  const { rows } = await pool.query(
    `INSERT INTO pilots (user_id, name, data) VALUES ($1, $2, $3) RETURNING id`,
    [userId, name, freshData()]
  );
  return rows[0].id;
}

async function getOwnedPilot(userId, pilotId) {
  const { rows } = await pool.query(`SELECT id, name, data FROM pilots WHERE id = $1 AND user_id = $2`, [pilotId, userId]);
  if (!rows[0]) throw new Error("Pilot not found.");
  return rows[0];
}

export async function queueAdd(userId, pilotId, key) {
  const row = await getOwnedPilot(userId, pilotId); const d = row.data; const now = Date.now();
  advance(d, now);
  const lic = getLicense(key); if (!lic) throw new Error("Unknown license.");
  const nextLevel = (d.licenses[key] || 0) + queuedCount(d, key) + 1;
  if (nextLevel > lic.maxLevel) throw new Error("License is maxed.");
  if (!requirementsMet(key, d.licenses)) throw new Error("Requirements not met.");
  if (!d.queue.length) d.activeStart = now;
  d.queue.push({ key, level: nextLevel });
  await save(row.id, d);
}

export async function queueRemove(userId, pilotId, key) {
  const row = await getOwnedPilot(userId, pilotId); const d = row.data; const now = Date.now();
  advance(d, now);
  let idx = -1, best = -1;
  d.queue.forEach((q, i) => { if (q.key === key && q.level > best) { best = q.level; idx = i; } });
  if (idx === -1) return;
  if (idx === 0) {                          // removing the active item: bank its progress
    const it = d.queue[0];
    setBanked(d, it.key, it.level, banked(d, it.key, it.level) + (now - d.activeStart));
    d.queue.splice(0, 1);
    d.activeStart = d.queue.length ? now : null;
  } else {
    d.queue.splice(idx, 1);
  }
  await save(row.id, d);
}

export async function queuePause(userId, pilotId, paused) {
  const row = await getOwnedPilot(userId, pilotId); const d = row.data; const now = Date.now();
  advance(d, now);
  if (paused && !d.paused) {
    if (d.queue.length && d.activeStart != null) {
      const it = d.queue[0];
      setBanked(d, it.key, it.level, banked(d, it.key, it.level) + (now - d.activeStart));
    }
    d.paused = true; d.activeStart = null;
  } else if (!paused && d.paused) {
    d.paused = false; d.activeStart = d.queue.length ? now : null;
  }
  await save(row.id, d);
}

// Cancel an endorsement and every higher queued level of the same license.
export async function queueCancel(userId, pilotId, key, level) {
  const row = await getOwnedPilot(userId, pilotId); const d = row.data; const now = Date.now();
  advance(d, now);
  const oldTop = d.queue[0];
  const removedActive = oldTop && oldTop.key === key && oldTop.level >= level;
  if (removedActive && d.activeStart != null && !d.paused) {
    setBanked(d, oldTop.key, oldTop.level, banked(d, oldTop.key, oldTop.level) + (now - d.activeStart));
  }
  d.queue = d.queue.filter((q) => !(q.key === key && q.level >= level));
  if (!d.paused && removedActive) d.activeStart = d.queue.length ? now : null;
  await save(row.id, d);
}

export async function queueReorder(userId, pilotId, order) {
  const row = await getOwnedPilot(userId, pilotId); const d = row.data; const now = Date.now();
  advance(d, now);
  if (!Array.isArray(order) || order.length !== d.queue.length) throw new Error("Bad order.");
  // must be a permutation of the current queue
  const key = (q) => `${q.key}:${q.level}`;
  const have = d.queue.map(key).sort().join("|");
  const want = order.map(key).sort().join("|");
  if (have !== want) throw new Error("Bad order.");
  // per-license levels must stay ascending
  const seen = {};
  for (const q of order) { if (seen[q.key] != null && q.level < seen[q.key]) throw new Error("Out-of-order levels."); seen[q.key] = q.level; }

  const oldTop = d.queue[0];
  const newTop = order[0];
  if (oldTop && (oldTop.key !== newTop.key || oldTop.level !== newTop.level)) {
    setBanked(d, oldTop.key, oldTop.level, banked(d, oldTop.key, oldTop.level) + (now - d.activeStart));
    d.activeStart = now;
  }
  d.queue = order.map((q) => ({ key: q.key, level: q.level }));
  await save(row.id, d);
}

export async function getState(userId) {
  const now = Date.now();
  const { rows: urows } = await pool.query(`SELECT username, created_at, credits FROM users WHERE id = $1`, [userId]);
  const user = urows[0] || { username: "?", created_at: new Date() };
  const pilotRows = await listPilotRows(userId);

  const pilots = [];
  const maxByLicense = {};
  for (const row of pilotRows) {
    const d = row.data; advance(d, now); await save(row.id, d);
    let active = null;
    if (d.queue.length) {
      const it = d.queue[0];
      const need = trainMs(it.key, it.level) - banked(d, it.key, it.level);
      const elapsed = (d.paused || d.activeStart == null) ? 0 : (now - d.activeStart);
      active = { key: it.key, level: it.level, trainMs: trainMs(it.key, it.level), remainingMs: Math.max(0, need - elapsed), paused: !!d.paused };
    }
    for (const l of LICENSES) maxByLicense[l.key] = Math.max(maxByLicense[l.key] || 0, d.licenses[l.key] || 0);
    pilots.push({ id: row.id, name: row.name, licenses: d.licenses, banked: d.banked, queue: d.queue, active, paused: !!d.paused });
  }
  const totalSkillLevel = LICENSES.reduce((sum, l) => sum + (maxByLicense[l.key] || 0), 0);

  return {
    profile: { username: user.username, createdAt: user.created_at, corp: CORP, pilotCount: pilots.length, totalSkillLevel, credits: Number(user.credits || 0) },
    pilots, serverTime: now,
  };
}
