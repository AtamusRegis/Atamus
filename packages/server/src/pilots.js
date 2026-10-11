import { pool } from "./db.js";
import { LICENSES, STARTING_LICENSES, getLicense, trainMs, requirementsMet } from "./licenses.js";
import { cleanPortrait, randomPortrait } from "./portraits.js";
import { checkName } from "./names.js";

export const CORP = "Deep Core Industries";   // everyone's corporation for now (users.corp NULL)

function freshData() { return { licenses: { ...STARTING_LICENSES }, banked: {}, queue: [], activeStart: null, paused: false }; }
const banked = (d, key, level) => (d.banked[key] && d.banked[key][level]) || 0;
function setBanked(d, key, level, ms) { if (!d.banked[key]) d.banked[key] = {}; d.banked[key][level] = ms; }
function clearBanked(d, key, level) { if (d.banked[key]) delete d.banked[key][level]; }

/** Process completed training based on real elapsed time. Mutates data. */
// Specialization licenses were folded into their base license as levels 6-8.
function migrateSpecs(d) {
  for (const k of Object.keys(d.licenses)) if (k.endsWith("_spec")) {
    const base = k.slice(0, -5), lvl = d.licenses[k];
    if (lvl > 0) d.licenses[base] = Math.max(d.licenses[base] || 0, 5 + lvl);
    delete d.licenses[k];
  }
  d.queue = d.queue.map((q) => q.key.endsWith("_spec") ? { key: q.key.slice(0, -5), level: 5 + q.level } : q)
    .filter((q) => (d.licenses[q.key] || 0) < q.level);
  for (const k of Object.keys(d.banked)) if (k.endsWith("_spec")) {
    const base = k.slice(0, -5); d.banked[base] = d.banked[base] || {};
    for (const lv in d.banked[k]) d.banked[base][5 + +lv] = d.banked[k][lv];
    delete d.banked[k];
  }
}

function advance(d, now) {
  migrateSpecs(d);
  for (const k in STARTING_LICENSES) if ((d.licenses[k] || 0) < STARTING_LICENSES[k]) d.licenses[k] = STARTING_LICENSES[k]; // granted to existing pilots too
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

export const MAX_PILOTS = 3;
// The first pilot is free; each extra one costs PILOT_PRICE credits.
export const PILOT_PRICE = 1_000_000;
// While a player is in the game their credits live in memory (game/net.js registers these):
// take() -> true (taken), false (not enough), null (not online: use the database).
let gameCredits = { take: () => null, give: () => {} };
export const useGameCredits = (hooks) => { gameCredits = hooks; };
export async function createPilot(userId, nameRaw, portraitRaw) {
  if (typeof nameRaw !== "string") throw new Error("Pilot name required.");
  const name = nameRaw.replace(/\s+/g, " ").trim().slice(0, 24);
  if (!name) throw new Error("Pilot name required.");
  { const np = await checkName(name); if (np) throw new Error(np); }   // (owner) the name filter and banned names
  const portrait = portraitRaw == null ? randomPortrait() : cleanPortrait(portraitRaw);   // the website always sends one
  if (!portrait) throw new Error("That portrait isn't valid.");
  const c = await pool.connect(); let taken = false;
  try {
    await c.query("BEGIN");
    const { rows: u } = await c.query(`SELECT credits FROM users WHERE id = $1 FOR UPDATE`, [userId]);   // one creation at a time per account
    const { rows: have } = await c.query(`SELECT name FROM pilots WHERE user_id = $1`, [userId]);
    if (have.length >= MAX_PILOTS) throw new Error(`An account can have at most ${MAX_PILOTS} pilots.`);
    if (have.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new Error("You already have a pilot with that name.");
    const cost = have.length ? PILOT_PRICE : 0;
    if (cost) {
      const mem = gameCredits.take(String(userId), cost);
      if (mem === false || (mem === null && Number(u[0]?.credits || 0) < cost)) throw new Error("A new pilot costs " + cost.toLocaleString("en-US") + " cr.");
      taken = mem === true;
      await c.query(`UPDATE users SET credits = credits - $1 WHERE id = $2`, [cost, userId]);
    }
    const { rows } = await c.query(`INSERT INTO pilots (user_id, name, data) VALUES ($1, $2, $3) RETURNING id`, [userId, name, { ...freshData(), portrait }]);
    await c.query("COMMIT");
    return rows[0].id;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    if (taken) gameCredits.give(String(userId), PILOT_PRICE);
    throw e;
  } finally { c.release(); }
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
  if (!lic.free && !(d.licenses[key] > 0)) {                       // first level needs the manual read (account-wide)
    const { rows } = await pool.query(`SELECT data FROM systems WHERE user_id = $1`, [userId]);
    const unlocked = (rows[0] && rows[0].data && rows[0].data.unlocked) || {};
    if (!unlocked[key]) throw new Error(`Read the ${lic.name} Manual first (station market).`);
  }
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
  const { rows: urows } = await pool.query(`SELECT username, created_at, credits, portrait, corp, role, rename_required, rename_reason, name_offer FROM users WHERE id = $1`, [userId]);
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
    pilots.push({ id: row.id, name: row.name, portrait: d.portrait || null, licenses: d.licenses, banked: d.banked, queue: d.queue, active, paused: !!d.paused, renameRequired: !!d.renameRequired, ...(d.renameRequired ? { renameReason: d.renameReason || "" } : {}), ...(d.nameOffer ? { nameOffer: d.nameOffer } : {}) });
  }
  const totalSkillLevel = LICENSES.reduce((sum, l) => sum + (maxByLicense[l.key] || 0), 0);

  return {
    profile: { username: user.username, createdAt: user.created_at, corp: user.corp || CORP, role: user.role || null, renameRequired: !!user.rename_required, ...(user.rename_required ? { renameReason: user.rename_reason || "" } : {}), ...(user.name_offer ? { nameOffer: user.name_offer } : {}), pilotCount: pilots.length, maxPilots: MAX_PILOTS, pilotPrice: PILOT_PRICE, totalSkillLevel, credits: Number(user.credits || 0), portrait: user.portrait || null },
    pilots, serverTime: now,
  };
}

// ---- (owner) after an admin's Ban Name: the player picks a new name for their account or that pilot ----
const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;
export async function renameAccount(userId, raw) {
  const name = typeof raw === "string" ? raw.trim() : "";
  const { rows } = await pool.query(`SELECT rename_required FROM users WHERE id = $1`, [userId]);
  if (!rows[0] || !rows[0].rename_required) throw new Error("Your name doesn't need changing.");
  if (!USERNAME_RE.test(name)) throw new Error("Names are 3–24 characters: letters, numbers and underscores.");
  { const np = await checkName(name); if (np) throw new Error(np); }
  const taken = await pool.query(`SELECT 1 FROM users WHERE lower(username) = lower($1) AND id <> $2`, [name, userId]);
  if (taken.rows[0]) throw new Error("That name is taken.");
  await pool.query(`UPDATE users SET username = $2, rename_required = false, rename_reason = NULL WHERE id = $1`, [userId, name]);
  return name;
}
export async function renamePilot(userId, pilotId, raw) {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 24) : "";
  if (typeof pilotId !== "string" && typeof pilotId !== "number") throw new Error("Pilot not found.");
  const p = await getOwnedPilot(userId, String(pilotId));
  if (!p.data.renameRequired) throw new Error("That pilot's name doesn't need changing.");
  if (!name) throw new Error("Pilot name required.");
  { const np = await checkName(name); if (np) throw new Error(np); }
  const { rows: have } = await pool.query(`SELECT 1 FROM pilots WHERE user_id = $1 AND lower(name) = lower($2) AND id <> $3`, [userId, name, p.id]);
  if (have[0]) throw new Error("You already have a pilot with that name.");
  delete p.data.renameRequired; delete p.data.renameReason;
  await pool.query(`UPDATE pilots SET name = $2, data = $3 WHERE id = $1`, [p.id, name, p.data]);
  return name;
}

// (owner) a banned name allowed again (the admin panel's Allow): not renamed yet, the rename is no longer needed; renamed,
// the old name is offered back, to take or to keep the new one
export async function offerName(userId, kind, pilotId, name) {
  if (kind === "player") {
    const { rows } = await pool.query(`SELECT username, rename_required FROM users WHERE id = $1`, [userId]); const u = rows[0]; if (!u) return;
    if (u.username.toLowerCase() === name.toLowerCase()) await pool.query(`UPDATE users SET rename_required = false, rename_reason = NULL, name_offer = NULL WHERE id = $1`, [userId]);
    else await pool.query(`UPDATE users SET name_offer = $2 WHERE id = $1`, [userId, name]);
    return;
  }
  const { rows } = await pool.query(`SELECT id, name, data FROM pilots WHERE user_id = $1`, [userId]);
  const p = rows.find((x) => pilotId && String(x.id) === pilotId) || rows.find((x) => x.data && x.data.bannedName && x.data.bannedName.toLowerCase() === name.toLowerCase()) || rows.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!p) return;
  const d = p.data || {};
  if (p.name.toLowerCase() === name.toLowerCase()) { delete d.renameRequired; delete d.renameReason; delete d.nameOffer; }
  else d.nameOffer = name;
  delete d.bannedName;
  await pool.query(`UPDATE pilots SET data = $2 WHERE id = $1`, [p.id, d]);
}
/** The player's answer to an offered name: take it back (`take`), or keep the name they have. Returns the name now. */
export async function answerNameOffer(userId, pilotId, take) {
  if (pilotId == null) {
    const { rows } = await pool.query(`SELECT username, name_offer FROM users WHERE id = $1`, [userId]); const u = rows[0];
    if (!u || !u.name_offer) throw new Error("No name to answer.");
    if (!take) { await pool.query(`UPDATE users SET name_offer = NULL WHERE id = $1`, [userId]); return { name: u.username, changed: false }; }
    { const np = await checkName(u.name_offer); if (np) throw new Error(np); }
    const taken = await pool.query(`SELECT 1 FROM users WHERE lower(username) = lower($1) AND id <> $2`, [u.name_offer, userId]);
    if (taken.rows[0]) { await pool.query(`UPDATE users SET name_offer = NULL WHERE id = $1`, [userId]); throw new Error("That name is taken."); }
    await pool.query(`UPDATE users SET username = $2, name_offer = NULL WHERE id = $1`, [userId, u.name_offer]);
    return { name: u.name_offer, changed: true };
  }
  if (typeof pilotId !== "string" && typeof pilotId !== "number") throw new Error("Pilot not found.");
  const p = await getOwnedPilot(userId, String(pilotId)), offer = p.data.nameOffer;
  if (!offer) throw new Error("No name to answer.");
  delete p.data.nameOffer;
  if (take) {
    { const np = await checkName(offer); if (np) throw new Error(np); }
    const { rows: have } = await pool.query(`SELECT 1 FROM pilots WHERE user_id = $1 AND lower(name) = lower($2) AND id <> $3`, [userId, offer, p.id]);
    if (have[0]) { await pool.query(`UPDATE pilots SET data = $2 WHERE id = $1`, [p.id, p.data]); throw new Error("You already have a pilot with that name."); }
    await pool.query(`UPDATE pilots SET name = $2, data = $3 WHERE id = $1`, [p.id, offer, p.data]);
    return { name: offer, changed: true };
  }
  await pool.query(`UPDATE pilots SET data = $2 WHERE id = $1`, [p.id, p.data]);
  return { name: p.name, changed: false };
}

/** The account's character (owner): one portrait for the player, used in chat; its name is the username. */
export async function setCharacter(userId, portraitRaw) {
  const portrait = cleanPortrait(portraitRaw); if (!portrait) throw new Error("That portrait isn't valid.");
  await pool.query(`UPDATE users SET portrait = $1 WHERE id = $2`, [portrait, userId]);
  return portrait;
}

/** Another player's sheet (owner: Info on a chat name): what anyone may see. No credits. */
export async function publicProfile(nameRaw) {
  if (typeof nameRaw !== "string" || !nameRaw || nameRaw.length > 40) return null;
  const { rows } = await pool.query(`SELECT id, username, created_at, portrait, corp FROM users WHERE lower(username) = lower($1)`, [nameRaw]);
  const u = rows[0]; if (!u) return null;
  const pilotRows = await listPilotRows(u.id), maxBy = {};
  for (const r of pilotRows) for (const l of LICENSES) maxBy[l.key] = Math.max(maxBy[l.key] || 0, (r.data.licenses || {})[l.key] || 0);
  return { username: u.username, createdAt: u.created_at, portrait: u.portrait || null, corp: u.corp || CORP, pilotCount: pilotRows.length, totalSkillLevel: LICENSES.reduce((s2, l) => s2 + (maxBy[l.key] || 0), 0) };
}

/** (owner) Pilot Info on another player's ship: what anyone may see of a pilot. */
export async function publicPilot(idRaw) {
  if (typeof idRaw !== "string" || !/^[0-9]{1,15}$/.test(idRaw)) return null;
  const { rows } = await pool.query(`SELECT p.id, p.name, p.data, p.created_at, u.username, u.corp FROM pilots p JOIN users u ON u.id = p.user_id WHERE p.id = $1`, [idRaw]);
  const r = rows[0]; if (!r) return null;
  const lic = r.data.licenses || {};
  return { id: String(r.id), name: r.name, portrait: r.data.portrait || null, player: r.username, corp: r.corp || CORP, createdAt: r.created_at, totalSkillLevel: LICENSES.reduce((s2, l) => s2 + (lic[l.key] || 0), 0) };
}

// ---- reports (owner): stored for admin tools to read later ----
export const REPORT_CATEGORIES = ["Harassment", "Spam", "Cheating", "Offensive name", "Other"];
export async function fileReport(userId, b, chatOf = null) {
  const target = await pool.query(`SELECT id, username FROM users WHERE lower(username) = lower($1)`, [typeof b.target === "string" ? b.target.slice(0, 40) : ""]);
  const t = target.rows[0]; if (!t) throw new Error("No such player.");
  if (String(t.id) === String(userId)) throw new Error("You can't report yourself.");
  if (!REPORT_CATEGORIES.includes(b.category)) throw new Error("Pick what the report is about.");
  const text = typeof b.text === "string" ? b.text.replace(/\s+/g, " ").trim().slice(0, 1000) : "";
  if (!text) throw new Error("Describe the issue.");
  const context = typeof b.context === "string" ? b.context.slice(0, 300) : null;
  const extra = chatOf ? chatOf(String(t.id)) : { chat: [], ships: [] };   // (owner) with the last hour of chat and their ship names then
  await pool.query(`INSERT INTO reports (reporter, target, target_name, category, text, context, chat, ships) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [userId, t.id, t.username, b.category, text, context, JSON.stringify(extra.chat || []), JSON.stringify(extra.ships || [])]);
}
