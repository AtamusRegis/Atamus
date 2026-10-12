// The authoritative simulation (back to basics, owner 2026-10-10): the Expanse's hexagon with nothing in it, and one
// Prospector per pilot that flies, aligns and warps where it's told, and asteroid belt POIs. Everything else the game
// had is kept for reference in reference/2026-10-10-pre-reset/.
import { SHIP_TYPES, SHIP_ARRIVE_EPS_KM, LOGOUT_GRACE_MS, UNSAFE_LOGOFF_MS, SAFE_WARP_KM, DRONE, droneLegMs, EXPANSE_APOTHEM_KM, SPAWN_SPREAD_KM, BELTS_MIN, PLAYERS_PER_BELT, WARP_BASE_MS, WARP_KM_PER_S, ALIGN_SPEED, ALIGN_DEG, WARP_LAND_KM } from "./constants.js";
import { safeText } from "../textsafe.js";
import { BELT, createBeltField, decayField, fieldM3 } from "./belts.js";
import { LIBRARY, libraryProps, libraryLanding } from "./library.js";
import { STATION, STATIONS, stationById, stationOfPlanet, DOCK_KM, stationProps, stationLanding, stationRange, nearestHangar, hangarAt } from "./station.js";
const shipLen = (s) => (SHIP_TYPES[s.type] || {}).lengthKm || 0.13;
const RING_BELT_SHARE = 0.7, BELTS_PER_SYSTEM = 2;   // (owner) "a lot of the asteroid belts" are in the rings
const SAFE_DOCK_MAX_MS = 10 * 60 * 1000;   // (a safe log off's warp home and docking: the longest it's given)
const HANGAR_GAP_KM = 0.03, HANGAR_KMPS = 0.06, UNDOCK_KM = 5, UNDOCK_SPREAD = 0.5;   // (owner) a hangar: the gap in front, the speed in and out; undocking: how far out, how wide the angle
import { Obstacles } from "./obstacles.js";
import { HOME, homeId, homeProps, homeLanding } from "./home.js";
import { SUN, PLANETS, RINGED, celestialPois, anchorLanding, celestialClearance, systemAt, planetByKey } from "./celestials.js";
import { MODULES, STARTER_KIT, shipCalc, isOff } from "./modules.js";
import { Eta, ETA_OFFICE, officeProps } from "./eta.js";
import { ADMIN_TYPES } from "./constants.js";
import { ORES, sizeFor, oreOf } from "./belts.js";
import { readFileSync } from "node:fs";
import { nameProblem, censor } from "../namefilter.js";
const spawnAt = (st) => ({ x: st.x, y: st.y - 8 });   // a new ship appears just south of its pilot's starting station
const SOLAR_VIEW_KM = 60_000;                           // (owner) zoomed out past a planetary system: other ships aren't shown (only planets)
const hasMWD = (s) => !!(s.npc || s.admin || (s.fit && s.fit.passive.some((k, i) => k === "microwarp_drive" && !(s.fit.off && s.fit.off.passive && s.fit.off.passive[i]))));   // (owner) needed to warp between planetary systems
const WEB_SPEED = 0.4;                                  // (owner) an ETA web: top speed down to this share
const ADMIN_LOCK_KM = 200;                              // (owner) an admin's ETA ship locks instantly out to here
const CHAT_GROUP_KM = 150;   // (owner) your pilots this close together share one chat bubble
// (owner) a laser aims only at the rock itself: points well inside each rock sprite's opaque part, as fractions of its
// width from its center (v down, as drawn; scripts/gen/rockmasks.py makes them), turned and scaled like the art
const ROCK_MASKS = JSON.parse(readFileSync(new URL("./rockmasks.json", import.meta.url), "utf8"));
function aimPoint(k) {
  if (!k) return { ax: 0, ay: 0, size: 0 };
  const pts = ROCK_MASKS[((oreOf(k.ore) || {}).rock || "cratered") + "_" + k.size], w = k.size / 1000;
  const [u, v] = pts && pts.length ? pts[Math.floor(Math.random() * pts.length)] : [0, 0], c = Math.cos(k.rot || 0), sn = Math.sin(k.rot || 0);
  return { ax: +((u * c - v * sn) * w).toFixed(4), ay: +(-(u * sn + v * c) * w).toFixed(4), size: k.size };   // screen y is down, world y up
}

// the hexagon's edges: outward normals (flat top and bottom) — a point is inside when n · p ≤ apothem for all six
const NORMALS = [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 2 + k * Math.PI / 3; return [Math.cos(a), Math.sin(a)]; });
export const insideExpanse = (x, y, margin = 0) => NORMALS.every(([nx, ny]) => x * nx + y * ny <= EXPANSE_APOTHEM_KM - margin + 1e-9);
/** The nearest point inside the hexagon (`margin` km in from its edge). */
export function clampToExpanse(x, y, margin = 0) {
  const A = EXPANSE_APOTHEM_KM - margin;
  for (let i = 0; i < 4; i++) {                       // project onto each edge it's past; a few passes settle the corners
    let moved = false;
    for (const [nx, ny] of NORMALS) { const d = x * nx + y * ny - A; if (d > 0) { x -= nx * d; y -= ny * d; moved = true; } }
    if (!moved) break;
  }
  return { x, y };
}
const finite = (v) => typeof v === "number" && Number.isFinite(v);
/** A ship's name (owner: ships can be renamed): printable, squashed whitespace, 1-24 characters; null if nothing's left. */
export const cleanShipName = (v) => { if (typeof v !== "string") return null; const t = safeText(v, 24); return t || null; };   // (owner) the same cleaning as all player text
// (owner, 2026-10-11) ships fly straight to their destination, over anything in the way, until given another; they
// just can't stop on an object. A destination is kept DEST_CLEAR_KM clear of touching an asteroid (its whole art: half
// its size) or a Library prop (its art's box) — the zone the client outlines on hover.
const DEST_CLEAR_KM = 0.07;
const ORBIT_KM = 0.5;                                 // (owner) Orbit circles this far off an object's no-destination line
// ---- ship holds (owner): { ore: { item: qty }, cargo: { item: qty } }; a module is 5 m³ an item, ore 1 m³ a unit ----
const itemM3 = (k) => (MODULES[k] ? MODULES[k].m3 : 1);
const isItem = (k) => !!MODULES[k] || (typeof k === "string" && k.startsWith("ore:") && ORES.some((o) => "ore:" + o.key === k));
export const holdUsed = (h, hold) => Object.entries(h[hold] || {}).reduce((t, [k, n]) => t + itemM3(k) * n, 0);
function addItem(h, hold, k, n) { h[hold] ||= {}; h[hold][k] = +((h[hold][k] || 0) + n).toFixed(2); }
function takeItem(h, hold, k, n) { const v = +((h[hold][k] || 0) - n).toFixed(2); if (v <= 0) delete h[hold][k]; else h[hold][k] = v; }
function loadHolds(v, t) {
  const h = {}; for (const hd of t.holds) { h[hd.key] = {}; const src = v && typeof v === "object" && v[hd.key]; if (src && typeof src === "object") for (const [k, n] of Object.entries(src)) if (isItem(k) && Number.isFinite(n) && n > 0) h[hd.key][k] = +n.toFixed(2); }
  return h;
}
// (owner, 2026-10-11) a hangar per NPC station: { stationId: items } (the old single hangar was Earth Station's)
function loadHangars(saved) {
  const out = {}, src = saved && saved.hangars && typeof saved.hangars === "object" ? saved.hangars : saved && saved.hangar ? { station: saved.hangar } : {};
  for (const [id, items] of Object.entries(src)) if (stationById(id)) out[id] = loadHangar(items);
  return out;
}
function loadHangar(v) { const h = {}; if (v && typeof v === "object") for (const [k, n] of Object.entries(v)) if (isItem(k) && Number.isFinite(n) && n > 0) h[k] = +n.toFixed(2); return h; }
function loadFit(v, t) {
  const f = { active: Array(t.activeSlots).fill(null), passive: Array(t.passiveSlots).fill(null), off: { active: Array(t.activeSlots).fill(false), passive: Array(t.passiveSlots).fill(false) } };
  for (const kind of ["active", "passive"]) if (v && Array.isArray(v[kind])) v[kind].slice(0, f[kind].length).forEach((k, i) => { if (MODULES[k] && (MODULES[k].slot === kind || t.anySlot)) { f[kind][i] = k; f.off[kind][i] = !!(v.off && v.off[kind] && v.off[kind][i]); } });
  return f;
}
const cloneFit = (f) => ({ active: [...f.active], passive: [...f.passive], off: { active: [...f.off.active], passive: [...f.off.passive] } });
const VIEW_MAX_W = 10 * 20_000;                         // the widest camera view a client gets other ships for (10 AU: the system is 70 AU across)

export class World {
  constructor(opts = {}) {
    this.players = new Map();   // pid -> { id, name, send, offline, offlineSince, view, pilots: [{ id, name }] }
    this.ships = new Map();     // sid -> ship
    this.simAt = Date.now();    // the moment the ships' positions are for (snapshots carry it)
    this.pois = new Map();      // belt POIs: id -> { id, kind, name, x, y, r, createdAt, field, retired }
    this.poiVer = 1; this.nextPoiTick = 0; this.beltSeq = 0;
    this._ixs = new WeakMap();  // field -> { ver, ix }: each POI's objects indexed for pathing and collisions
    // (owner) the Library: every space object's art in rows, always on the map; its props are solid and nothing else
    this.pois.set(LIBRARY.id, { ...LIBRARY, createdAt: 0, field: { rocks: [], props: libraryProps(), dir: 0, ver: 1 }, retired: false });
    for (const st of STATIONS) this.pois.set(st.id, { ...st, createdAt: 0, field: { rocks: [], props: stationProps(st), dir: 0, ver: 1 }, retired: false });   // (owner) an NPC station at every planet
    for (const c of celestialPois()) this.pois.set(c.id, c);   // (owner) planets' and moons' anchors, always on the map
    this.pois.set(ETA_OFFICE.id, { ...ETA_OFFICE, createdAt: 0, field: { rocks: [], props: officeProps(), dir: 0, ver: 1 }, retired: false });   // (owner) the ETA Office, near Mars
    this.alerts = [];           // (owner) open help tickets and non-language reports: { uid, n } (net.js keeps it), red diamonds for Admins
    this.eta = new Eta(this);   // (owner) the Expanse Transit Authority
    if (opts.eta !== false) this.eta.populate();
    this.frozen = new Set();    // (owner) accounts an admin has frozen: their ships hold still, take no orders and can't be targeted
    this.homesReady = true;     // (the server clears this until the saved player stations are loaded, so none is made twice)
  }

  addPlayer(id, name, send, saved = null, pilots = []) {
    const existing = this.players.get(id);
    if (existing) { existing.send = send; existing.offline = false; existing.name = name; this.setPilots(id, pilots, saved); return existing; }
    const p = { id, name, send, offline: false, offlineSince: 0, view: null, pilots: [], saved, hangars: loadHangars(saved) };
    this.players.set(id, p);
    this._ensureHome(p);
    this.setPilots(id, pilots, saved);
    return p;
  }
  /** (owner) Freeze or unfreeze an account: its ships stop where they are, switch everything off and drop their locks, and
   *  no one can target them (net.js also refuses the account's commands while frozen). */
  /** (owner) A player renamed their account: chat and their station use the new name. */
  renamePlayer(pid, name) {
    const p = this.players.get(pid); if (p) p.name = name;
    const h = this._home(pid); if (h) { h.name = name + "'s Station"; h.field.props = homeProps(h); h.field.ver++; this.poiVer++; }
  }
  setFrozen(pid, on) {
    if (!on) { this.frozen.delete(pid); return; }
    this.frozen.add(pid);
    for (const s of this.shipsOf(pid)) {
      Object.assign(s, { vx: 0, vy: 0, moving: false, chase: null, dest: null, warpReq: false, dockReq: false, drift: false, targets: [], tx: s.x, ty: s.y });
      s.act = s.act.map(() => null); this._recalc(s);
    }
    for (const o of this.ships.values()) if (o.targets.length) o.targets = o.targets.filter((g) => !(g.kind === "ship" && this.ships.get(g.id) && this.ships.get(g.id).owner === pid));
  }
  // ---- (owner) player stations (home.js): one per account, made the first time they play ----
  _home(owner) { const h = this.pois.get(homeId(owner)); return h && h.kind === "home" ? h : null; }
  _makeHome(d) {
    const h = { id: homeId(d.owner), kind: "home", owner: d.owner, name: d.name, x: d.x, y: d.y, r: HOME.rKm, createdAt: d.createdAt || Date.now(), size: d.size || HOME.size, arms: !!d.arms, items: loadHangar(d.items), retired: false };
    h.field = { rocks: [], props: homeProps(h), dir: 0, ver: 1 };
    return h;
  }
  _ensureHome(p) {
    return;                                                // (owner, 2026-10-11) no free stations: they'll be bought (and spawn in deep space)
    if (!this.homesReady || this._home(p.id)) return;
    const at = this._homeSite();
    this.pois.set(homeId(p.id), this._makeHome({ owner: p.id, name: p.name + "'s Station", x: +at.x.toFixed(3), y: +at.y.toFixed(3) })); this.poiVer++;
  }
  /** The saved player stations are in: give everyone online who still has none theirs, and (owner) every other account
   *  without one (`accounts`: [{ id, name }] from the database). */
  homesLoaded(accounts = []) {
    this.homesReady = true;
    // (owner, 2026-10-11) the new solar system: stations made in the old, small one move somewhere new (storage and all)
    if (false) for (const h of [...this.pois.values()]) if (h.kind === "home" && h.resite) { this.pois.delete(h.id); this.poiVer++; const at = this._homeSite(); delete h.resite; h.x = +at.x.toFixed(3); h.y = +at.y.toFixed(3); h.field = { rocks: [], props: homeProps(h), dir: 0, ver: (h.field.ver || 1) + 1 }; this.pois.set(h.id, h); this.poiVer++; }
    for (const p of this.players.values()) this._ensureHome(p);
    let made = 0; for (const a of accounts) if (!this._home(String(a.id))) { this._ensureHome({ id: String(a.id), name: a.name }); made++; }
    if (made) console.log("[homes] " + made + " player stations made");
  }
  // (owner) somewhere random, as far as can be found from other players' stations and clear of every other POI
  _homeSite() {
    let best = null;
    for (let i = 0; i < 400; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * EXPANSE_APOTHEM_KM, x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (!insideExpanse(x, y, HOME.clearKm) || celestialClearance(x, y) < 0) continue;   // (owner) not near the sun, a planet or a moon
      let m = Infinity;
      for (const o of this.pois.values()) { if (o.ax != null) continue; const dd = Math.hypot(o.x - x, o.y - y); m = Math.min(m, o.kind === "home" ? dd : dd - o.r - HOME.clearKm + HOME.apartKm); }
      if (!best || m > best.m) best = { x, y, m };
      if (m > HOME.apartKm * 4) break;                     // plenty of room: no need to keep looking
    }
    return best || { x: 0, y: 0 };
  }
  /** The account's pilots (from the database): each has one Prospector, and a pilot that's gone takes theirs with it. */
  setPilots(id, pilots, saved = null) {
    const p = this.players.get(id); if (!p) return;
    p.pilots = (pilots || []).map((x) => ({ id: String(x.id), name: x.name, start: x.start || "earth", licenses: (x.licenses && typeof x.licenses === "object") ? x.licenses : {} }));
    const keep = new Set(p.pilots.map((x) => this._sid(id, x.id)));
    for (const [sid, s] of this.ships) if (s.owner === id && !keep.has(sid) && !s.admin) this.ships.delete(sid);   // (an admin's ETA ship isn't a pilot's)
    this._own = null;
    for (const pl of p.pilots) { const s = this._ensureShip(id, pl.id, saved || p.saved, pl.start); const key = JSON.stringify(pl.licenses); if (s.licKey !== key) { s.lic = pl.licenses; s.licKey = key; this._recalc(s); } }
  }
  _sid(owner, pilotId) { return `${owner}:ship:${pilotId}`; }
  // a pilot's Prospector: where they left it, or a fresh one near the center
  _ensureShip(id, pilotId, saved, start = "earth") {
    const sid = this._sid(id, pilotId);
    if (this.ships.has(sid)) return this.ships.get(sid);
    const t = SHIP_TYPES.chisel, sv = saved && saved.ships && saved.ships[pilotId];
    let x, y, h;
    if (sv && finite(sv.x) && finite(sv.y) && Math.hypot(sv.x, sv.y) > SUN.r + 50) { ({ x, y } = clampToExpanse(sv.x, sv.y, t.radiusKm)); h = finite(sv.h) ? sv.h : Math.PI / 2; }   // (never inside the Sun: then beside the Station)
    else { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * SPAWN_SPREAD_KM; const at = spawnAt(stationOfPlanet(start)); x = at.x + Math.cos(a) * d; y = at.y + Math.sin(a) * d; h = Math.random() * Math.PI * 2; }   // (owner: nothing at the sun) beside the Station
    const s = { id: sid, owner: id, pilot: String(pilotId), type: "chisel", x, y, vx: 0, vy: 0, h, tx: x, ty: y, moving: false, speed: t.speedKmps, accel: t.accelKmps2, radius: t.radiusKm, mass: t.mass, hp: t.hp, shield: t.shield, targetRange: t.targetRangeKm, lockMs: t.lockMs, maxTargets: t.maxTargets, targets: [], chase: null,   // (owner) always the hull's full stats
      name: sv && typeof sv.name === "string" ? cleanShipName(sv.name) : null,
      holds: loadHolds(sv && sv.holds, t), fit: loadFit(sv && sv.fit, t), act: Array.from({ length: t.activeSlots }, () => null), kit: !!(sv && sv.kit), lic: {}, docked: false };
    if (sv && sv.crim && typeof sv.crim === "object") s.crim = { since: finite(sv.crim.since) ? sv.crim.since : Date.now(), vs: Array.isArray(sv.crim.vs) ? sv.crim.vs.filter((x) => typeof x === "string").slice(-20) : [] };   // (owner) still hunted by the ETA
    if (sv && sv.docked && sv.unboarded) s.unboarded = true;   // (owner) its pilot had left it, docked
    if (sv && sv.docked) { s.docked = stationById(sv.docked) ? sv.docked : "station"; const st = this._dockProp(id, s.docked); if (st) { s.x = st.x; s.y = st.y; } s.tx = s.x; s.ty = s.y; }   // docked: where (a station gone, or a player station removed: Earth Station)
    if (!s.kit) { for (const [k, n] of STARTER_KIT) addItem(s.holds, "cargo", k, n); s.kit = true; }   // (owner) a starter kit in the cargo hold, once per ship
    this._recalc(s);
    this.ships.set(sid, s); this._own = null;
    return s;
  }
  // what the ship can do as fitted and as its pilot flies it (modules.js); the afterburner, when on, raises top speed
  _recalc(s) {
    const t = SHIP_TYPES[s.type]; s.calc = shipCalc(t, s.fit, s.lic);
    const ab = s.act.some((a, i) => a && a.on && MODULES[s.fit.active[i]] && MODULES[s.fit.active[i]].speedBonus);
    s.speed = (ab ? s.calc.abSpeed : s.calc.speed) * (s.web ? WEB_SPEED : 1); s.accel = s.calc.accel;   // (owner) an ETA web slows it
  }
  // Logging off (owner: no logged-off presence): after a short grace for reloads the ship leaves the world.
  // (owner) A safe log off (every ship docked) leaves after a short grace. Otherwise the ships carry on (mining, flying)
  // for UNSAFE_LOGOFF_MS, then each warps to a safe spot and they leave space there (and come back there).
  removePlayer(id) { const p = this.players.get(id); if (!p) return; this.setAdminShip(id, false); p.offline = true; p.offlineSince = Date.now(); p.safeWarp = false; p.send = () => {}; }
  /** Each account's ships (an index rebuilt only when ships come or go). */
  shipsOf(owner) {
    if (!this._own) { this._own = new Map(); for (const s of this.ships.values()) { let l = this._own.get(s.owner); if (!l) this._own.set(s.owner, l = []); l.push(s); } }
    return this._own.get(owner) || [];
  }
  _tickLogoffs(now) {
    for (const p of [...this.players.values()]) {
      if (!p.offline) continue;
      const ships = this.shipsOf(p.id), away = now - p.offlineSince;
      if (ships.every((s) => s.docked)) { if (away > LOGOUT_GRACE_MS) this._purge(p.id); continue; }
      if (away < UNSAFE_LOGOFF_MS) continue;
      if (!p.safeWarp) { p.safeWarp = true; for (const s of ships) if (!s.docked && !s.wp) this._safeWarp(s, now); }
      else if (ships.every((s) => s.docked || (!s.wp && !s.dockReq && !s.dockSeq)) || away > UNSAFE_LOGOFF_MS + SAFE_DOCK_MAX_MS) this._purge(p.id);   // (docked, or stuck: then it leaves anyway)
    }
  }
  // (owner) a ship left in space when its player has been offline a while warps to their station and docks (later: in
  // nomad space an ark ship makes a safe warp, and one in the system of its owner's station warps there and docks); with
  // no station, the Station; with neither, a safe spot SAFE_WARP_KM away
  _safeWarp(s, now) {
    if (s.crim || s.scram) return;                         // (owner) a ship the ETA is after stays where it is
    // (owner, 2026-10-11) the NPC station of the planetary system it's in (out in deep space: the nearest one)
    const sys = systemAt(s.x, s.y), stn = sys ? stationOfPlanet(sys.key) : STATIONS.reduce((b, o) => (!b || Math.hypot(o.x - s.x, o.y - s.y) < Math.hypot(b.x - s.x, b.y - s.y) ? o : b), null), goal = stn && this.pois.get(stn.id);
    if (goal) {
      s.act = s.act.map(() => null); s.targets = []; s.chase = null; s.dest = null; s.dockSeq = null; this._recalc(s);
      const where = stn.id, prop = this._dockProp(s.owner, where);
      if (prop && stationRange(s, prop) <= DOCK_KM) { this._startDock(s, where); return; }   // (already there: in it goes)
      this._startWarp(s, goal, now); s.dockReq = where; return;
    }
    const a = Math.random() * Math.PI * 2, to = clampToExpanse(s.x + Math.cos(a) * SAFE_WARP_KM, s.y + Math.sin(a) * SAFE_WARP_KM, 50), dist = Math.hypot(to.x - s.x, to.y - s.y);
    s.act = s.act.map(() => null); s.targets = []; s.chase = null; s.dest = null; s.dockReq = false; this._recalc(s);
    s.wp = { fx: s.x, fy: s.y, tx: to.x, ty: to.y, at: now, dur: Math.round(WARP_BASE_MS + dist / WARP_KM_PER_S * 1000), poi: null };
    s.h = Math.atan2(to.y - s.y, to.x - s.x); s.moving = false;
  }
  _purge(id) {
    if (this.onBeforePurge) { try { this.onBeforePurge(id); } catch (e) { console.error("onBeforePurge", e); } }
    for (const [sid, s] of this.ships) if (s.owner === id) this.ships.delete(sid);
    this._own = null;
    this.players.delete(id);
  }
  /** Everything about a player worth keeping across logins and restarts. */
  exportState(id) {
    const ships = {};
    for (const s of this.ships.values()) if (s.owner === id && !s.admin) ships[s.pilot] = { x: +s.x.toFixed(4), y: +s.y.toFixed(4), h: +s.h.toFixed(3), ...(s.name ? { name: s.name } : {}), holds: s.holds, fit: s.fit, kit: s.kit, ...(s.docked ? { docked: s.docked } : {}), ...(s.unboarded ? { unboarded: true } : {}), ...(s.crim ? { crim: s.crim } : {}) };
    const p = this.players.get(id);
    return { ships, hangars: p ? p.hangars : {}, savedAt: Date.now() };
  }

  // ---- commands (every field hostile) ----
  /** Fly one of your ships to a point (clamped inside the hexagon). */
  cmdMove(pid, shipId, x, y) {
    if (!finite(x) || !finite(y)) return;
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || s.wp || s.docked || this._inHangar(s) || this._anchored(s)) return;   // no new orders mid-warp (or docked, or in a hangar's mouth, or an admin's ship uncloaking)
    const t = this._clearPoint(clampToExpanse(x, y, s.radius), s);   // (owner) never a destination inside an object's bounds
    s.tx = t.x; s.ty = t.y; s.dest = null; s.warpReq = false; s.drift = false; s.chase = null; s.moving = true; s.dockReq = false; s.dockSeq = null;
  }
  // ---- where a destination can't be (obstacles.js): asteroids and Library props ----
  _ix(poi) {                                           // a POI's objects, indexed (rebuilt when its rocks change)
    const f = poi.field; let c = this._ixs.get(f);
    if (!c || c.ver !== f.ver) {
      const ix = new Obstacles();
      for (const k of f.rocks) ix.add({ x: k.x, y: k.y, r: k.r });
      for (const o of f.props || []) ix.add({ x: o.x, y: o.y, hx: o.w / 2, hy: o.h / 2 });
      this._ixs.set(f, (c = { ver: f.ver, ix }));
    }
    return c.ix;
  }
  /** A destination moved just outside any object's bounds (the POIs it's in). */
  _clearPoint(p, s) {
    const q = { x: p.x, y: p.y };
    for (const poi of this._poisNear(q.x, q.y)) if (Math.hypot(q.x - poi.x, q.y - poi.y) <= poi.r + 2) this._ix(poi).pushOut(q, s.radius + DEST_CLEAR_KM);
    return q;
  }
  /** Align (owner): fly toward a POI at regular speed; it's now the ship's destination, which it can warp to as long as
   *  the POI still shows on the map. Warp: align, then warp as soon as it's aligned. */
  cmdAlign(pid, shipId, poiId, warp = false) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || s.wp || s.docked || this._inHangar(s) || this._anchored(s)) return;
    const poi = typeof poiId === "string" ? this.pois.get(poiId) : null;
    if (!poi || poi.retired) return;                       // only a POI that still advertises itself
    if (poi.kind === "home" && poi.owner !== pid) return;   // (owner) someone else's station isn't on your map
    const aim = this._poiAim(poi);
    if (warp && this._inPoi(s, aim)) return;               // no warping to where you already are
    if (warp && systemAt(s.x, s.y) !== systemAt(aim.x, aim.y) && !hasMWD(s)) return this._notice(pid, "A Microwarp Drive is needed to warp out of this planetary system");   // (owner)
    if (warp && s.scram) return this._notice(pid, "Warp scrambled");   // (owner) an ETA officer's warp scrambler
    if (warp && s.admin) { s.dockReq = false; s.dockSeq = null; s.dest = null; this._startWarp(s, poi, this.simAt); return; }   // (an admin's ETA ship warps at once)
    s.dest = poi.id; s.warpReq = !!warp; s.drift = false; s.chase = null; s.dockReq = false; s.dockSeq = null; s.tx = aim.x; s.ty = aim.y; s.moving = true;
  }
  cmdWarp(pid, shipId, poiId) { const s = this.ships.get(shipId); if (!s || s.owner !== pid) return; this.cmdAlign(pid, shipId, typeof poiId === "string" ? poiId : s.dest, true); }

  // ---- modules (owner): fit from the cargo hold into a slot of the module's kind, within the ship's power and
  // disposition; unfit back into the cargo hold; switch active modules on and off ----
  _notice(pid, text) { const p = this.players.get(pid); if (p) p.send(JSON.stringify({ t: "notice", text })); }
  cmdFit(pid, shipId, item, kind, slot) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || typeof item !== "string") return;
    const T = SHIP_TYPES[s.type], m = MODULES[item]; if (!m || (m.slot !== kind && !T.anySlot) || !Number.isInteger(slot) || slot < 0 || slot >= s.fit[kind].length) return;   // (owner) an admin's ETA ship: any module in any slot
    if (!((s.holds.cargo[item] || 0) >= 1)) return;
    if (!s.docked && !T.anySlot) return this._notice(pid, "Dock to refit");   // (owner) refitting is done docked
    if (kind === "active" && s.act[slot] && s.act[slot].on) this._modOff(s, slot);
    const old = s.fit[kind][slot], next = cloneFit(s.fit); next[kind][slot] = item; next.off[kind][slot] = false;
    let c = shipCalc(SHIP_TYPES[s.type], next, s.lic);
    if (c.disposition > c.dispositionMax + 1e-9 && !T.anySlot) return this._notice(pid, "Not enough disposition");
    if (c.power > c.powerMax + 1e-9 && !T.anySlot) { next.off[kind][slot] = true; this._notice(pid, "Not enough power: fitted offline"); }   // (owner) power it on when there's room
    takeItem(s.holds, "cargo", item, 1); if (old) addItem(s.holds, "cargo", old, 1);   // (a swap: same size, so it fits)
    s.fit = next; this._recalc(s);
  }
  cmdUnfit(pid, shipId, kind, slot) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || (kind !== "active" && kind !== "passive") || !Number.isInteger(slot) || slot < 0 || slot >= (s.fit[kind] || []).length) return;
    if (!s.docked && !SHIP_TYPES[s.type].anySlot) return this._notice(pid, "Dock to refit");   // (owner) in space you can see the fit, not change it (besides power)
    const item = s.fit[kind][slot]; if (!item) return;
    const without = cloneFit(s.fit); without[kind][slot] = null;   // (an expander out: the holds must still fit what's in them)
    if (holdUsed(s.holds, "cargo") + MODULES[item].m3 > this._holdCap(s, "cargo", without) + 1e-9) return this._notice(pid, "Cargo hold full");
    if (holdUsed(s.holds, "ore") > this._holdCap(s, "ore", without) + 1e-9) return this._notice(pid, "Ore hold full");
    if (kind === "active" && s.act[slot] && s.act[slot].on) this._modOff(s, slot);
    s.fit[kind][slot] = null; s.fit.off[kind][slot] = false; addItem(s.holds, "cargo", item, 1); this._recalc(s);
  }
  /** (owner) Power a fitted module off (it keeps its disposition but uses no power and does nothing) or back on (if
   *  the power's there). */
  cmdPower(pid, shipId, kind, slot, on) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || (kind !== "active" && kind !== "passive") || !Number.isInteger(slot) || slot < 0 || slot >= s.fit[kind].length || !s.fit[kind][slot]) return;
    if (!on) { if (kind === "active") this._modOff(s, slot); s.fit.off[kind][slot] = true; this._recalc(s); return; }
    const next = cloneFit(s.fit); next.off[kind][slot] = false;
    if (shipCalc(SHIP_TYPES[s.type], next, s.lic).power > s.calc.powerMax + 1e-9) return this._notice(pid, "Not enough power");
    s.fit = next; this._recalc(s);
  }
  _holdCap(s, hold, fit = s.fit) { return shipCalc(SHIP_TYPES[s.type], fit, s.lic).holds[hold] || 0; }
  /** Switch an active module on or off. Lasers and drones need a locked asteroid in their range (the first such target). */
  cmdModule(pid, shipId, slot, on) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || !Number.isInteger(slot) || slot < 0 || slot >= s.fit.active.length) return;
    const m = MODULES[s.fit.active[slot]]; if (!m || m.slot !== "active") return;   // (a passive module in an admin's active slot: always on)
    if (!on) { if (m.key === "mining_drones") this._dronesOff(s, slot); else this._modOff(s, slot); return; }
    if (s.wp || s.docked || (s.act[slot] && s.act[slot].on)) return;
    if (isOff(s.fit, "active", slot)) return this._notice(pid, "Powered off");
    if (m.yield) {
      if (holdUsed(s.holds, "ore") >= (s.calc.holds.ore || 0) - 1e-6) return this._notice(pid, "Ore hold full");
      const tg = this._miningTarget(s, m);
      s.act[slot] = tg ? this._cycle(s, slot, tg, this.simAt) : { on: true, standby: true };   // (owner) no target yet: on standby, it starts on the first lock in range
    } else s.act[slot] = { on: true, at: this.simAt };
    this._recalc(s);
  }
  // a mining cycle on rock `tg`: the laser picks a spot inside the rock and a hardpoint on its arm, kept for the cycle
  _cycle(s, slot, tg, at) {
    const k = this._rock(tg), t = SHIP_TYPES[s.type], arm = (t.arms || [[0]])[slot % (t.arms || [[0]]).length];
    return { on: true, at, tg, ...aimPoint(k), hp: arm[Math.floor(Math.random() * arm.length)] };
  }
  /** (owner) Reorder your locked targets (their priority): `order` is every current target as "kind:id", once each. */
  cmdTargetOrder(pid, shipId, order) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || !Array.isArray(order) || order.length !== s.targets.length) return;
    const by = new Map(s.targets.map((g) => [g.kind + ":" + g.id, g])), next = [];
    for (const k of order) { if (typeof k !== "string" || !by.has(k)) return; next.push(by.get(k)); by.delete(k); }
    s.targets = next;
  }
  /** (owner) Drones out: the key sends them to a different locked asteroid in drone range (the first such), or else
   *  recalls them: they fly home (dropping off anything they carry) and switch off when they're in. */
  _dronesOff(s, slot) {
    const a = s.act[slot]; if (!a || a.standby || !a.tg) return this._modOff(s, slot);
    if (a.haul && a.haul.recall) return;                   // already on their way in
    const m = MODULES.mining_drones, range = this._mcalc(s, m).rangeKm;
    const next = s.targets.find((g) => g.kind === "rock" && g.locked && g.id !== a.tg && (() => { const p = this._objPos("rock", g.id); return p && this._range(s, p) <= range; })());
    const now = this.simAt;
    if (next) {
      if (a.haul) { a.haul.next = next.id; return; }       // after this load they go to the new one
      const from = this._rock(a.tg), to = this._rock(next.id), fly = from && to ? Math.round(Math.hypot(to.x - from.x, to.y - from.y) / DRONE.nearKmps * 1000) : 0;
      s.act[slot] = { ...this._cycle(s, slot, next.id, now + fly), ...(from && fly ? { fx: from.x, fy: from.y, fs: from.size } : {}) };   // they fly over, then start
      return;
    }
    if (a.haul) { a.haul.recall = true; return; }
    const k = this._rock(a.tg); if (!k) return this._modOff(s, slot);
    const dk = Math.hypot(k.x - s.x, k.y - s.y);
    a.haul = { amt: 0, ore: k.ore, at: now, leg: droneLegMs(dk), dp: 0, dk: +dk.toFixed(3), rx: k.x, ry: k.y, rs: k.size, recall: true };
  }
  _modOff(s, slot) { if (s.act[slot]) { s.act[slot] = null; this._recalc(s); } }
  _controlKm(s) { return SHIP_TYPES[s.type].droneControlKm || 0; }
  _mcalc(s, m) { return m.key === "mining_drones" ? s.calc.drones : s.calc.laser; }
  // the first locked asteroid within this module's reach
  _miningTarget(s, m) {
    const range = this._mcalc(s, m).rangeKm;
    for (const g of s.targets) { if (g.kind !== "rock" || !g.locked) continue; const pos = this._objPos("rock", g.id); if (pos && this._range(s, pos) <= range) return g.id; }
    return null;
  }
  // lasers and drones: a laser's ore lands in the ore hold when its cycle completes; (owner) drones fly theirs to the ship,
  // drop it in the ore hold and fly back before the next cycle. They stop when the rock is gone, unlocked or out of reach,
  // or the ore hold is full
  _tickModules(now) {
    for (const s of this.ships.values()) {
      if (!s.act || !s.act.some(Boolean) || this.frozen.has(s.owner)) continue;
      if (s.wp) { s.act = s.act.map(() => null); this._recalc(s); continue; }   // a warp switches everything off
      for (let i = 0; i < s.act.length; i++) {
        const a = s.act[i], m = a && MODULES[s.fit.active[i]]; if (!a || !m || !m.yield) continue;
        if (a.standby) { const tg = this._miningTarget(s, m); if (tg) s.act[i] = this._cycle(s, i, tg, now); continue; }   // the first lock in range
        const c = this._mcalc(s, m), k = this._rock(a.tg), pos = k && { x: k.x, y: k.y, r: k.r };
        const drones = m.key === "mining_drones";
        if (a.haul) {                                      // (owner) drones: out to the ship, twice round it streaming the ore in, and back
          const h = a.haul, home = h.at + h.leg + h.dp;
          if (!h.dep && now >= home) {
            h.dep = true; const free = (s.calc.holds.ore || 0) - holdUsed(s.holds, "ore"), amt = Math.min(h.amt, Math.max(0, free));
            if (amt > 0) addItem(s.holds, "ore", "ore:" + h.ore, amt);
            if (h.recall) { this._modOff(s, i); continue; }   // recalled: in, and off
            if (h.amt > 0 && free - amt <= 1e-6) { this._modOff(s, i); this._notice(s.owner, "Ore hold full"); continue; }
            const tg = h.next || a.tg, kk = this._rock(tg), dk = kk && Math.hypot(kk.x - s.x, kk.y - s.y);
            if (!kk || this._range(s, { x: kk.x, y: kk.y, r: kk.r }) > this._controlKm(s)) { this._modOff(s, i); continue; }   // nothing to go back to: they stay in
            h.back = { tg, leg: droneLegMs(dk), dk: +dk.toFixed(3), rx: kk.x, ry: kk.y, rs: kk.size };
          }
          if (!h.back || now < home + h.back.leg) continue;
          s.act[i] = this._cycle(s, i, h.back.tg, now); continue;
        }
        // lasers need the lock and their range; (owner) drones, once on a rock, stay on it out to the hull's control range, locked or not
        if (!k || (drones ? this._range(s, pos) > this._controlKm(s) : !s.targets.some((g) => g.kind === "rock" && g.id === a.tg && g.locked) || this._range(s, pos) > c.rangeKm)) { this._modOff(s, i); continue; }
        if (a.size !== k.size) Object.assign(a, aimPoint(k));   // the rock shrank: aim at the smaller art
        if (now - a.at < c.cycleMs) continue;
        const free = (s.calc.holds.ore || 0) - holdUsed(s.holds, "ore"), amt = Math.min(c.yield, k.m3, Math.max(0, free));
        if (drones && amt > 0) {                           // (owner) the drones carry it home: the rock loses it now, the hold gets it once streamed in
          this._mineRock(a.tg, amt); const dk = Math.hypot(k.x - s.x, k.y - s.y);
          a.haul = { amt, ore: k.ore, at: now, leg: droneLegMs(dk), dp: DRONE.depositMs, dk: +dk.toFixed(3), rx: k.x, ry: k.y, rs: k.size };
          continue;
        }
        if (amt > 0) { addItem(s.holds, "ore", "ore:" + k.ore, amt); this._mineRock(a.tg, amt); }
        s.act[i] = this._cycle(s, i, a.tg, a.at + c.cycleMs);   // the next cycle: a new spot, maybe the other hardpoint
        if (free - amt <= 1e-6) { this._modOff(s, i); this._notice(s.owner, "Ore hold full"); }
      }
    }
  }
  // ore mined out of a rock: it shrinks a size at a time and is gone when empty
  _mineRock(id, amt) {
    const poi = this.pois.get(id.split("#")[0]), f = poi && poi.field, k = f && f.rocks.find((r) => r.id === id); if (!k) return;
    k.mined = +((k.mined || 0) + amt).toFixed(2); k.m3 = Math.max(0, +(k.m3 - amt).toFixed(2));
    if (k.m3 <= 0) { f.rocks.splice(f.rocks.indexOf(k), 1); f.ver++; return; }
    const size = sizeFor(k.m3); if (size !== k.size) { k.size = size; k.r = size / 2000; f.ver++; }
  }

  // ---- docking (owner): at the Station (temporary) or at your own station; within DOCK_KM of its edge (out of range:
  // fly there first, then dock); undock ----
  _station() { return this.pois.get(STATION.id).field.props[0]; }
  _dockProp(owner, where) { if (where === "home") { const h = this._home(owner); return h ? h.field.props[0] : null; } const poi = stationById(where) && this.pois.get(where); return poi ? poi.field.props[0] : null; }
  cmdDock(pid, shipId, where = "station") {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || s.wp || s.docked || this._inHangar(s) || this._anchored(s)) return;
    if (s.crim) { s.dockReq = false; return this._notice(pid, "Docking refused"); }   // (owner) the ETA's wanted can't dock
    if (typeof where !== "string" || !stationById(where)) where = "station";   // (owner) any planet's NPC station
    const st = this._dockProp(pid, where); if (!st) return;
    if (stationRange(s, st) <= DOCK_KM) { this._startDock(s, where); return; }
    const dx = s.x - st.x, dy = s.y - st.y, d = Math.hypot(dx, dy) || 1, k = Math.max(st.w, st.h) / 2 + 1.5;   // fly to just off it, then dock
    const t = this._clearPoint({ x: st.x + dx / d * k, y: st.y + dy / d * k }, s);
    s.tx = t.x; s.ty = t.y; s.dest = null; s.warpReq = false; s.drift = false; s.chase = null; s.moving = true; s.dockReq = where; s.dockSeq = null;
  }
  // (owner) docking and undocking through a hangar: in range, the ship flies to the front of the station's hangar (the
  // nearest, if it has more than one), then slowly into it, hidden as it passes the front (the client masks it); then
  // it's docked. Undocking runs the other way: out of the hangar, then away at full speed at a slightly random angle,
  // stopping about 5 km out. No orders while in the hangar's mouth.
  _inHangar(s) { return !!(s.dockSeq && s.dockSeq.phase !== "approach"); }
  _startDock(s, where) {
    if (s.crim) { s.dockReq = false; return; }
    const st = this._dockProp(s.owner, where), hg = st && nearestHangar(st, s.x, s.y);
    if (!hg) { this._dock(s, where); return; }
    const fx = hg.x + hg.nx * (shipLen(s) / 2 + HANGAR_GAP_KM), fy = hg.y + hg.ny * (shipLen(s) / 2 + HANGAR_GAP_KM);
    s.dockSeq = { phase: "approach", where, prop: st.id, i: hg.i, fx, fy, ix: hg.x - hg.nx * (shipLen(s) / 2 + HANGAR_GAP_KM), iy: hg.y - hg.ny * (shipLen(s) / 2 + HANGAR_GAP_KM), nx: hg.nx, ny: hg.ny };
    s.tx = fx; s.ty = fy; s.dest = null; s.warpReq = false; s.drift = false; s.chase = null; s.moving = true; s.dockReq = false;
  }
  _tickDockSeq(s, dtSec) {                                // true: this tick's motion is done
    const q = s.dockSeq, st = this._dockProp(s.owner, q.where);
    if (!st) { s.dockSeq = null; return false; }
    if (q.phase === "approach") {
      if (Math.hypot(q.fx - s.x, q.fy - s.y) <= Math.max(0.03, SHIP_ARRIVE_EPS_KM * 2) && Math.hypot(s.vx, s.vy) < 0.05) { q.phase = "in"; s.vx = 0; s.vy = 0; s.moving = false; s.h = Math.atan2(-q.ny, -q.nx); }
      else { s.tx = q.fx; s.ty = q.fy; s.moving = true; }
      return false;
    }
    const tx = q.phase === "in" ? q.ix : q.fx, ty = q.phase === "in" ? q.iy : q.fy, dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy), step = HANGAR_KMPS * dtSec;
    s.h = q.phase === "in" ? Math.atan2(-q.ny, -q.nx) : Math.atan2(q.ny, q.nx); s.vx = 0; s.vy = 0;
    if (d > step) { s.x += dx / d * step; s.y += dy / d * step; return true; }
    s.x = tx; s.y = ty;
    if (q.phase === "in") { s.dockSeq = null; this._dock(s, q.where); s.x = tx; s.y = ty; s.tx = tx; s.ty = ty; return true; }   // (kept where it went in)
    // out of the hangar: away at full speed, a little off straight out, stopping about 5 km away
    const a = Math.atan2(q.ny, q.nx) + (Math.random() - 0.5) * UNDOCK_SPREAD, v = s.speed;
    s.dockSeq = null; s.vx = Math.cos(a) * v; s.vy = Math.sin(a) * v; s.h = a;
    const t = this._clearPoint(clampToExpanse(s.x + Math.cos(a) * UNDOCK_KM, s.y + Math.sin(a) * UNDOCK_KM, s.radius), s); s.tx = t.x; s.ty = t.y; s.moving = true;
    return true;
  }
  _dock(s, where = "station") {
    const st = this._dockProp(s.owner, where); if (!st) return;
    Object.assign(s, { docked: where, dockReq: false, moving: false, vx: 0, vy: 0, chase: null, dest: null, warpReq: false, drift: false, targets: [], x: st.x, y: st.y, tx: st.x, ty: st.y });
    s.act = s.act.map(() => null); this._recalc(s);
  }
  cmdUndock(pid, shipId) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || !s.docked) return;
    if (s.unboarded) return this._notice(pid, "Board the ship first");   // (owner) a pilot not in their ship can't undock it
    const where = s.docked, st = this._dockProp(pid, where) || this._station();   // (that station's hangar)
    const h = st.hangars && st.hangars.length ? hangarAt(st, Math.floor(Math.random() * st.hangars.length)) : null;   // (a station with two hangars: either one)
    if (!h) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2, d = Math.max(st.w, st.h) / 2 + 2; Object.assign(s, { docked: false, x: st.x + Math.cos(a) * d, y: st.y + Math.sin(a) * d, vx: 0, vy: 0, h: a }); s.tx = s.x; s.ty = s.y; return; }
    const ix = h.x - h.nx * (shipLen(s) / 2 + HANGAR_GAP_KM), iy = h.y - h.ny * (shipLen(s) / 2 + HANGAR_GAP_KM);
    s.dockSeq = { phase: "out", where, prop: st.id, i: h.i, fx: h.x + h.nx * (shipLen(s) / 2 + HANGAR_GAP_KM), fy: h.y + h.ny * (shipLen(s) / 2 + HANGAR_GAP_KM), ix, iy, nx: h.nx, ny: h.ny };
    Object.assign(s, { docked: false, x: ix, y: iy, vx: 0, vy: 0, h: Math.atan2(h.ny, h.nx), moving: false, tx: ix, ty: iy });
  }
  /** (owner) Board or leave your ship while it's docked: a pilot who isn't aboard can't undock it. */
  cmdBoard(pid, shipId, on) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || !s.docked) return;
    s.unboarded = !on;
  }
  /** Move items (owner): between a station's storage (the Station's hangar, or your own station's) and your ships docked
   *  there, or between one ship's holds. The ore hold takes only ore; ship holds take what fits (the rest stays);
   *  storage takes anything. */
  cmdTransfer(pid, from, to, item, qty) {
    const p = this.players.get(pid); if (!p || typeof item !== "string" || !isItem(item)) return;
    const hold = (c) => {
      if (!c || typeof c !== "object" || typeof c.ship !== "string" || typeof c.hold !== "string") return null;
      const s = this.ships.get(c.ship); if (!s || s.owner !== pid || !s.holds[c.hold]) return null;
      return { kind: "hold", s, hold: c.hold, items: s.holds[c.hold], at: s.docked || null };
    };
    // (owner) "hangar": the hangar of the station the ship on the other side is docked at (each station has its own)
    const store = (other) => { if (!other || other.kind !== "hold" || !other.at || !stationById(other.at)) return null; return { kind: "store", items: (p.hangars[other.at] ||= {}), at: other.at }; };
    let A = from === "hangar" ? null : hold(from), B = to === "hangar" ? null : hold(to);
    if (from === "hangar") A = store(B); if (to === "hangar") B = store(A);
    if (!A || !B || A.items === B.items) return;
    if (!(A.kind === "hold" && B.kind === "hold" && A.s === B.s) && !(A.at && A.at === B.at)) return;   // storage only with ships docked at that station
    const have = A.items[item] || 0; if (!(have > 0)) return;
    let n = qty == null ? have : (Number.isFinite(qty) && qty > 0 ? Math.min(qty, have) : 0); if (!(n > 0)) return;
    if (B.kind === "hold") {
      if (B.hold === "ore" && !item.startsWith("ore:")) return this._notice(pid, "The ore hold takes only ore");
      const free = (B.s.calc.holds[B.hold] || 0) - holdUsed(B.s.holds, B.hold), per = itemM3(item);
      n = Math.min(n, MODULES[item] ? Math.floor(free / per + 1e-9) : Math.floor(free / per * 100) / 100);
      if (!(n > 0)) return this._notice(pid, "Not enough room");
    }
    const take = (o) => { const v = +((o[item] || 0) - n).toFixed(2); if (v <= 0) delete o[item]; else o[item] = v; };
    take(A.items); B.items[item] = +((B.items[item] || 0) + n).toFixed(2);
  }

  // ---- (owner) the Expanse Transit Authority (eta.js): aggression flags a ship and the ETA hunts it ----
  /** Ship `aid` attacks ship `vid`. Attacking a flagged ship (its victim answering back, or anyone else) is no crime;
   *  otherwise the attacker is flagged and, the first time, the ETA responds. True if it was flagged now. */
  aggress(aid, vid) {
    const a = this.ships.get(aid), v = vid ? this.ships.get(vid) : null; if (!a || a.npc || a.admin || a === v) return false;
    if (v && v.crim && !v.npc) return false;               // (owner) the victim responding with force isn't flagged
    const fresh = !a.crim; if (fresh) a.crim = { since: this.simAt, vs: [] };
    if (v && !a.crim.vs.includes(v.id)) { a.crim.vs.push(v.id); if (a.crim.vs.length > 20) a.crim.vs.shift(); }
    a.dockReq = false; if (a.dockSeq && a.dockSeq.phase === "approach") a.dockSeq = null;
    if (fresh) this.eta.respond(a.id, this.simAt);
    return fresh;
  }
  /** Clear a ship's flag: the officers after it stand down. */
  pardon(sid) { const s = this.ships.get(sid); if (s && s.crim) { delete s.crim; return true; } return false; }

  // ---- (owner) an admin's ETA ship: in admin mode an Admin gets one more pilot under their admin name, flying the hull
  // they pick (Deputy, Constable or Magistrate). It cloaks (unseen, no chat bubble, no scrambling; locks still work) and
  // uncloaks with a warp-in that anchors it for 2 s; it locks instantly out to 200 km and scrambles what it locks; its
  // warps start at once and need no Microwarp Drive; its slots take any module, with no power or disposition limits ----
  _anchored(s) { return !!(s.anchorUntil && s.anchorUntil > this.simAt); }
  _adminShip(pid) { const p = this.players.get(pid); const s = p && p.adminSid && this.ships.get(p.adminSid); return s && s.admin ? s : null; }
  setAdminShip(pid, on, persona = null) {
    const p = this.players.get(pid); if (!p) return null;
    const cur = this._adminShip(pid);
    if (!on) {
      if (!cur) return null;
      p.adminAt = { x: cur.x, y: cur.y, h: cur.h, fit: cur.fit, holds: cur.holds };   // (kept for the next time, while the server runs)
      this.ships.delete(cur.id); this._own = null;
      for (const o of this.ships.values()) if (o.targets.length) o.targets = o.targets.filter((g) => g.id !== cur.id);
      return null;
    }
    if (cur) { if (persona && persona.name) cur.name = persona.name; return cur; }
    const type = ADMIN_TYPES[p.adminHull] ? p.adminHull : "adm_magistrate", t = SHIP_TYPES[type], at = p.adminAt;
    const x = at ? at.x : ETA_OFFICE.x + (Math.random() - 0.5) * 6, y = at ? at.y : ETA_OFFICE.y - 10;
    const id = "adm:" + Math.random().toString(36).slice(2, 10);   // (its id doesn't give away the account)
    const s = { id, owner: pid, pilot: "admin", admin: true, cloak: true, type, x, y, vx: 0, vy: 0, h: at ? at.h : Math.PI / 2, tx: x, ty: y, moving: false, radius: t.radiusKm, mass: t.mass, targets: [], chase: null,
      name: (persona && persona.name) || "Admin", holds: loadHolds(at && at.holds, t), fit: loadFit(at && at.fit, t), act: Array.from({ length: t.activeSlots }, () => null), kit: true, lic: {}, docked: false };
    this._hull(s, type); p.adminSid = id; this.ships.set(id, s); this._own = null;
    return s;
  }
  _hull(s, type) {
    const t = SHIP_TYPES[type]; s.type = type;
    Object.assign(s, { radius: t.radiusKm, hp: t.hp, shield: t.shield, targetRange: t.targetRangeKm, lockMs: t.lockMs, maxTargets: t.maxTargets });
    if (s.targets.length > s.maxTargets) s.targets.length = s.maxTargets;
    this._recalc(s);
  }
  /** (owner) Pick the admin ship's hull: "deputy", "constable" or "magistrate". */
  cmdAdminHull(pid, hull) {
    const s = this._adminShip(pid), key = "adm_" + hull; if (!s || typeof hull !== "string" || !ADMIN_TYPES[key] || s.docked) return;
    this.players.get(pid).adminHull = key; this._hull(s, key);
  }
  /** (owner) Cloak or uncloak the admin ship; uncloaking warps it in where it is (anchored 2 s while players see it arrive). */
  cmdCloak(pid, on) {
    const s = this._adminShip(pid); if (!s || s.docked || s.wp || this._inHangar(s)) return;
    if (on) { s.cloak = true; s.anchorUntil = 0; return; }
    if (!s.cloak) return;
    Object.assign(s, { cloak: false, anchorUntil: this.simAt + 2000, vx: 0, vy: 0, moving: false, chase: null, dest: null, warpReq: false, drift: false, tx: s.x, ty: s.y });
  }
  /** (owner) The admin ship warps straight to a point (a red diamond's site). */
  cmdWarpPoint(pid, x, y) {
    const s = this._adminShip(pid); if (!s || !finite(x) || !finite(y) || s.wp || s.docked || this._inHangar(s) || this._anchored(s)) return;
    const a = Math.random() * Math.PI * 2, to = clampToExpanse(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 1), dist = Math.hypot(to.x - s.x, to.y - s.y); if (dist < 0.5) return;
    Object.assign(s, { chase: null, dest: null, warpReq: false, dockReq: false, dockSeq: null, drift: false, targets: [] });   // (a warp drops every lock)
    s.wp = { fx: s.x, fy: s.y, tx: to.x, ty: to.y, at: this.simAt, dur: Math.round(WARP_BASE_MS + dist / WARP_KM_PER_S * 1000), poi: null };
    s.h = Math.atan2(to.y - s.y, to.x - s.x); s.moving = false;
  }
  // (owner) the red diamonds: where each open ticket's or report's player is (a ship in space, else the station they're
  // docked at), only while they're online
  _alertsOut() {
    const out = [];
    for (const a of this.alerts) {
      const p = this.players.get(a.uid); if (!p || p.offline) continue;
      const ships = this.shipsOf(a.uid).filter((s) => !s.admin);
      const s = ships.find((x) => !x.docked && !x.wp) || ships.find((x) => !x.docked) || ships[0]; if (!s) continue;
      let x = s.x, y = s.y; if (s.docked) { const st = this._dockProp(a.uid, s.docked); if (st) { x = st.x; y = st.y; } }
      out.push({ id: a.id, n: p.name, x: +x.toFixed(2), y: +y.toFixed(2) });
      if (out.length >= 60) break;
    }
    return out;
  }

  // ---- objects in space (owner): asteroids and ships can be locked, aligned to, moved toward, and looked at ----
  /** Where an object is now: { x, y, r } (r = its solid radius), or null if it's gone (or a ship is in warp). */
  _objPos(kind, id) {
    if (typeof id !== "string" || id.length > 80) return null;
    if (kind === "ship") { const o = this.ships.get(id); return o && !o.wp && !o.docked && !o.cloak && !this.frozen.has(o.owner) ? { x: o.x, y: o.y, r: o.radius } : null; }   // (a cloaked admin ship can't be targeted)   // (a frozen player's ships can't be targeted)
    if (kind === "rock") { const k = this._rock(id); return k ? { x: k.x, y: k.y, r: k.r } : null; }   // to its edge (owner)
    return null;
  }
  _rock(id) { if (typeof id !== "string") return null; const poi = this.pois.get(id.split("#")[0]); return (poi && poi.field.rocks.find((k) => k.id === id)) || null; }
  _range(s, pos) { return Math.max(0, Math.hypot(pos.x - s.x, pos.y - s.y) - pos.r - s.radius); }   // edge to edge
  /** Lock Target: within targeting range, up to the hull's maximum; it locks after the hull's lock time. */
  cmdLock(pid, shipId, kind, id) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || s.wp || s.docked) return;
    if (kind === "ship" && id === s.id) return;                                   // not itself
    const pos = this._objPos(kind, id); if (!pos) return;
    if (s.targets.some((g) => g.kind === kind && g.id === id) || s.targets.length >= s.maxTargets) return;
    if (this._range(s, pos) > s.targetRange) return;
    s.targets.push({ kind, id, lockAt: this.simAt + s.lockMs, locked: false });
  }
  /** Unlock Target (owner: a lock in progress can't be canceled). */
  cmdUnlock(pid, shipId, kind, id) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid) return;
    const i = s.targets.findIndex((g) => g.kind === kind && g.id === id && g.locked); if (i >= 0) s.targets.splice(i, 1);
  }
  /** Align To (fly at the object at full speed, no braking) or Move towards (fly to its edge and stop; follows a ship). */
  cmdChase(pid, shipId, kind, id, mode) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || s.wp || s.docked || this._inHangar(s) || this._anchored(s)) return;
    if ((mode !== "align" && mode !== "approach" && mode !== "orbit") || (kind === "ship" && id === s.id) || !this._objPos(kind, id)) return;
    s.dockReq = false; s.dockSeq = null; s.chase = { kind, id, mode, v: Math.min(s.speed, Math.hypot(s.vx, s.vy)) }; s.dest = null; s.warpReq = false; s.drift = false; s.moving = mode === "approach";   // (owner) Align To keeps the speed it had
  }
  /** Info on an object: an asteroid you have a ship beside (its belt), or a ship. */
  cmdInfo(pid, kind, id) {
    const p = this.players.get(pid); if (!p) return;
    if (kind === "rock") {
      const k = this._rock(id), poi = k && this.pois.get(id.split("#")[0]); if (!k || !this._shipsIn(poi, pid)) return;
      p.send(JSON.stringify({ t: "info", kind, id, ore: k.ore, size: k.size, m3: k.m3, belt: poi.name }));
    } else if (kind === "ship") {
      const o = typeof id === "string" && this.ships.get(id); if (!o || (o.cloak && o.owner !== pid)) return;
      if (o.npc || o.admin) { p.send(JSON.stringify({ t: "info", kind, id, type: o.type, pilot: o.admin ? o.name : null, owner: "Expanse Transit Authority" })); return; }   // (owner) the ETA (an admin's ship shows only their admin name)
      const op = this.players.get(o.owner), pl = op && op.pilots.find((x) => x.id === o.pilot);
      p.send(JSON.stringify({ t: "info", kind, id, type: o.type, pilot: pl ? pl.name : null, owner: op ? op.name : null }));
    }
  }
  // locks complete, and break when the object is gone or out of range
  _tickTargets(now) {
    for (const s of this.ships.values()) {
      if (!s.targets.length) continue;
      const range = s.targetRange;
      s.targets = s.targets.filter((g) => { const pos = this._objPos(g.kind, g.id); return pos && this._range(s, pos) <= range; });
      for (const g of s.targets) if (!g.locked && now >= g.lockAt) g.locked = true;
    }
  }
  _inPoi(s, poi) { return Math.hypot(s.x - poi.x, s.y - poi.y) <= poi.r; }
  // where aligning and warping to a POI head: a celestial's anchor (owner: the point orbiting it), else the POI itself
  _poiAim(poi) { return poi.ax != null ? { x: poi.ax, y: poi.ay, r: poi.ar } : poi; }
  // aligned (owner, EVE-like): heading within ALIGN_DEG of the destination and at ALIGN_SPEED of top speed
  _aligned(s, poi) {
    const v = Math.hypot(s.vx, s.vy); if (v < s.speed * ALIGN_SPEED) return false;
    const aim = this._poiAim(poi), want = Math.atan2(aim.y - s.y, aim.x - s.x), got = Math.atan2(s.vy, s.vx);
    let d = Math.abs(want - got) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d;
    return d <= ALIGN_DEG * Math.PI / 180;
  }
  _startWarp(s, poi, now) {
    // drop out on the inside of the crescent (WARP_LAND_KM toward its middle), give or take a couple of km
    const scat = poi.field && poi.field.scatter, a = scat ? Math.random() * Math.PI * 2 : poi.field.dir + (Math.random() - 0.5) * 0.3, d = scat ? BELT.radiusKm - 1 : WARP_LAND_KM + (Math.random() - 0.5) * 4;   // (a ring belt: just inside its edge, clear of its rocks)
    const to = poi.kind === "library" ? libraryLanding(poi.field.props) : poi.kind === "station" || poi.kind === "office" ? stationLanding(poi) : poi.kind === "home" ? homeLanding(poi) : poi.ax != null ? anchorLanding(poi) : { x: poi.x + Math.cos(a) * d, y: poi.y + Math.sin(a) * d }, dist = Math.hypot(to.x - s.x, to.y - s.y);
    s.wp = { fx: s.x, fy: s.y, tx: to.x, ty: to.y, at: now, dur: Math.round(WARP_BASE_MS + dist / WARP_KM_PER_S * 1000), poi: poi.id };
    s.h = Math.atan2(to.y - s.y, to.x - s.x); s.moving = false; s.warpReq = false; s.chase = null; s.targets = [];   // a warp drops every lock
  }
  /** Rename one of your ships (owner); an empty name puts back the default ("Pilot's Prospector"). */
  cmdRename(pid, shipId, name) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || (name != null && typeof name !== "string") || (typeof name === "string" && name.length > 200)) return;
    const clean = cleanShipName(name);
    if (clean && nameProblem(clean)) return this._notice(pid, "That name isn't allowed.");   // (owner) the name filter
    s.name = clean;
  }
  /** Where the player's camera is: other ships in view get sent to them. */
  cmdView(pid, x, y, w) {
    const p = this.players.get(pid); if (!p) return;
    if (!finite(x) || !finite(y) || !finite(w) || w <= 0) { p.view = null; return; }
    const c = clampToExpanse(x, y); p.view = { x: c.x, y: c.y, w: Math.min(w, VIEW_MAX_W) };
  }

  /** Local and Corp chat (owner): you speak as your account's character (its portrait and your username), not as a
   *  pilot. Local is everyone in the Expanse; everyone is in Deep Core Industries for now, so Corp reaches everyone too. */
  cmdChat(pid, text, channel, to, ship, persona = null) {
    const p = this.players.get(pid); if (!p || typeof text !== "string") return;
    const clean = safeText(text, 240); if (!clean) return;
    if (persona) {                                        // (owner) an admin speaking as admin: their admin name and picture; no ship says it
      const ch = channel === "corp" ? "corp" : "local";
      const as = this._adminShip(pid), said = ch === "local" && as && !as.cloak && !as.docked && !as.wp ? { ships: [as.id] } : {};   // (owner) said aloud by their ETA ship (not while cloaked)
      const msg = JSON.stringify({ t: "chat", ch, from: persona.name, admin: persona.key, pic: persona.pic, rank: persona.rank || "admin", ...(persona.portrait ? { portrait: persona.portrait } : {}), text: censor(clean), ts: Date.now(), ...said });
      for (const other of this.players.values()) if (!other.offline) other.send(msg);
      if (this.onLine) this.onLine({ ch, fromId: pid, aid: pid, from: persona.name, text: clean });
      return;
    }
    if (channel === "dm") {                               // (owner) a direct message: both ends see it in a tab named for the other
      if (typeof to !== "string" || !to || to.length > 40) return;
      const msg = JSON.stringify({ t: "chat", ch: "dm", from: p.name, to, portrait: p.portrait || null, text: censor(clean), ts: Date.now() });   // (owner) banned words: asterisks
      let sent = false;
      let toId = null, refused = false;
      for (const o of this.players.values()) if (!o.offline && o.id !== pid && o.name.toLowerCase() === to.toLowerCase()) {
        if (this.hears && !this.hears(o.id, pid)) { refused = true; continue; }   // (owner) they muted or blocked you
        o.send(msg); sent = true; toId = o.id; }
      if (refused) { p.send(JSON.stringify({ t: "sys", text: to + " isn't taking your messages.", dm: to })); return; }
      p.send(msg);
      if (sent && this.onLine) this.onLine({ ch: "dm", fromId: pid, from: p.name, toId, to, text: clean });   // (owner) kept an hour, for kicks, bans and reports
      if (!sent) p.send(JSON.stringify({ t: "sys", text: to + " is not online.", dm: to }));
      return;
    }
    const ch = channel === "corp" ? "corp" : "local";
    // (owner) Local is also said aloud by the speaker's (selected) ship: a bubble over it for anyone near it
    // (owner) with several of your pilots in one place, only one of them says it: the selected one, else the first
    const speakers = [];
    if (ch === "local") {
      const mine = this.shipsOf(pid).filter((x) => !x.docked && !x.wp && !x.cloak && !x.admin), pref = typeof ship === "string" ? mine.find((x) => x.id === ship) : null;
      for (const x of [pref, ...mine]) if (x && !speakers.some((o) => Math.hypot(o.x - x.x, o.y - x.y) <= CHAT_GROUP_KM)) speakers.push(x);
    }
    const msg = JSON.stringify({ t: "chat", ch, from: p.name, portrait: p.portrait || null, text: censor(clean), ts: Date.now(), ...(speakers.length ? { ships: speakers.map((x) => x.id) } : {}) });
    for (const other of this.players.values()) if (!other.offline && (!this.hears || this.hears(other.id, pid))) other.send(msg);   // (owner) not to those who muted or blocked them
    if (this.onChat) { try { this.onChat(p, ch, clean); } catch (e) { console.error("onChat", e); } }
    if (this.onLine) this.onLine({ ch, fromId: pid, from: p.name, text: clean });   // (owner) kept an hour, for kicks, bans and reports   // (owner) Local / Corp lines are checked for the admins' Chat log
  }

  tick(dtSec) {
    const now = Date.now(); this.simAt = now; this.tickN = (this.tickN || 0) + 1;
    if (now >= this.nextPoiTick) { this.nextPoiTick = now + 2000; this._maintainPois(now); }
    this._tickShips(dtSec, now);
    this._tickTargets(now);
    this.eta.tick(now);
    this._tickModules(now);
    this._tickLogoffs(now);
  }
  _tickShips(dtSec, now) {
    this.simAt = now;
    const ships = [...this.ships.values()];
    // 1) steer toward the target as fast as it can while still able to brake in time, then integrate
    for (const s of ships) {
      if (s.docked) continue;                              // (owner) a docked ship is out of space
      if (this.frozen.has(s.owner) && !s.wp) { s.vx = 0; s.vy = 0; s.moving = false; continue; }   // (owner) frozen: it holds still
      if (s.anchorUntil) { if (now < s.anchorUntil) { s.vx = 0; s.vy = 0; continue; } s.anchorUntil = 0; }   // (owner) an admin's ship uncloaking: anchored while it warps in
      if (s.crim && s.dockReq) s.dockReq = false;
      if (s.dockReq && !s.wp) { const st = this._dockProp(s.owner, s.dockReq); if (!st) s.dockReq = false; else if (stationRange(s, st) <= DOCK_KM) this._startDock(s, s.dockReq); else if (!s.moving) this.cmdDock(s.owner, s.id, s.dockReq); }   // (out of a warp short of it: fly the rest)
      if (s.dockSeq && this._tickDockSeq(s, dtSec)) continue;   // (owner) into / out of a hangar
      if (s.wp) {                                          // in warp: eased along the line, then a dead stop at the far end
        const k = Math.min(1, (now - s.wp.at) / s.wp.dur), e = 0.5 - 0.5 * Math.cos(Math.PI * k);
        s.x = s.wp.fx + (s.wp.tx - s.wp.fx) * e; s.y = s.wp.fy + (s.wp.ty - s.wp.fy) * e; s.vx = 0; s.vy = 0;
        if (k >= 1) { s.wp = null; s.dest = null; s.moving = false; s.tx = s.x; s.ty = s.y; }
        continue;
      }
      if (s.dest) {                                        // aligning: the POI must still advertise itself, or the ship drifts on
        const poi = this.pois.get(s.dest);
        if (!poi || poi.retired) { s.dest = null; s.warpReq = false; s.moving = false; s.drift = true; }
        else if (s.warpReq && !s.scram && this._aligned(s, poi)) { this._startWarp(s, poi, now); continue; }   // (owner) not while warp scrambled
      }
      if (s.chase) {                                       // Align To / Move towards an object: its position, every tick
        const pos = this._objPos(s.chase.kind, s.chase.id);
        if (!pos) { s.chase = null; s.moving = false; }
        else if (s.chase.mode === "align") {               // (owner) Align To: face it at the speed it had (standing still: just turn), stopping at its no-destination line
          const dx = pos.x - s.x, dy = pos.y - s.y, d = Math.hypot(dx, dy), room = d - (pos.r + s.radius + DEST_CLEAR_KM);
          if (d > 1e-6) {
            s.h = Math.atan2(dy, dx); s.moving = false;
            const spd = Math.min(s.chase.v, room > 0 ? Math.sqrt(2 * s.accel * room) * 0.95 : 0);
            const dvx = dx / d * spd - s.vx, dvy = dy / d * spd - s.vy, dv = Math.hypot(dvx, dvy), step = s.accel * dtSec;
            if (dv <= step) { s.vx += dvx; s.vy += dvy; } else { s.vx += dvx / dv * step; s.vy += dvy / dv * step; }
            s.x += s.vx * dtSec; s.y += s.vy * dtSec;
            continue;
          }
        }
        else if (s.chase.mode === "orbit") {               // (owner) Orbit: circle it at full speed, ORBIT_KM off its no-destination line
          const R = pos.r + s.radius + DEST_CLEAR_KM + (s.chase.dist || ORBIT_KM), dx = s.x - pos.x, dy = s.y - pos.y, d = Math.hypot(dx, dy) || 1;
          if (!s.chase.dir) s.chase.dir = (dx * s.vy - dy * s.vx) >= 0 ? 1 : -1;   // the way it's already turning
          const ang = Math.atan2(dy, dx) + s.chase.dir * Math.min(0.8, Math.max(0.15, s.speed * 2 / R)), r = d > R * 1.5 ? d * 0.8 : R;
          s.tx = pos.x + Math.cos(ang) * r; s.ty = pos.y + Math.sin(ang) * r; s.moving = true; s.orbiting = true;
        }
        else {                                             // Move towards: to just off its edge (its no-destination line), and stop
          const dx = s.x - pos.x, dy = s.y - pos.y, d = Math.hypot(dx, dy) || 1, keep = pos.r + s.radius + DEST_CLEAR_KM + 0.01;
          const goal = this._clearPoint({ x: pos.x + dx / d * keep, y: pos.y + dy / d * keep }, s);
          s.tx = goal.x; s.ty = goal.y; s.moving = true;
        }
      }
      if (s.moving) {
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
        const orbit = s.chase && s.chase.mode === "orbit";
        if (d <= SHIP_ARRIVE_EPS_KM && !orbit && !s.cruise) s.moving = false;
        else if (d > 1e-6) {
          const spd = orbit || s.cruise ? s.speed : Math.min(s.speed, Math.sqrt(2 * s.accel * d) * 0.95);
          const dvx = (dx / d) * spd - s.vx, dvy = (dy / d) * spd - s.vy, dv = Math.hypot(dvx, dvy), step = s.accel * dtSec;
          if (dv <= step) { s.vx += dvx; s.vy += dvy; } else { s.vx += dvx / dv * step; s.vy += dvy / dv * step; }   // acceleration-limited
        }
      }
      if (!s.moving && !s.drift) { const v = Math.hypot(s.vx, s.vy), step = s.accel * dtSec; if (v <= step) { s.vx = 0; s.vy = 0; } else { s.vx -= s.vx / v * step; s.vy -= s.vy / v * step; } }
      s.x += s.vx * dtSec; s.y += s.vy * dtSec;
      if (Math.hypot(s.vx, s.vy) > 0.05) s.h = Math.atan2(s.vy, s.vx);   // face the way it's going
    }
    // 2) (owner) ships pass over each other and over every object on the way; only a destination stays off them.
    //    The hexagon's edge stops ships (and whatever velocity was carrying them out)
    for (const s of ships) {
      if (insideExpanse(s.x, s.y, s.radius)) continue;
      const c = clampToExpanse(s.x, s.y, s.radius); s.x = c.x; s.y = c.y; s.vx = 0; s.vy = 0; s.drift = false;
    }
  }

  // ---- asteroid belt POIs (owner) ----
  // Belts by population: one per PLAYERS_PER_BELT online, at least BELTS_MIN. A belt whose ore is all gone stops
  // showing on the map and no longer counts (a replacement spawns), but it stays open while anyone's ships are inside.
  _maintainPois(now = Date.now()) {
    for (const poi of [...this.pois.values()]) {
      if (poi.kind !== "belt") continue;                   // the Library stays as it is
      if (decayField(poi.field, now)) this.poiFieldVer = (this.poiFieldVer || 0) + 1;
      if (!poi.retired && !poi.field.rocks.length) { poi.retired = true; this.poiVer++; }
      if (poi.retired && !this._shipsIn(poi)) { this.pois.delete(poi.id); this.poiVer++; if (this.onPoiClosed) { try { this.onPoiClosed(poi); } catch (e) { console.error("onPoiClosed", e); } } }
    }
    // (owner, 2026-10-11) every planetary system keeps a couple of belts (players start at every planet); more with
    // more players online, most of them in the ringed planets' rings
    for (const pl of PLANETS) { let n = 0; for (const poi of this.pois.values()) if (poi.kind === "belt" && !poi.retired && Math.hypot(poi.x - pl.x, poi.y - pl.y) <= pl.sysR) n++; for (; n < BELTS_PER_SYSTEM; n++) this._newBelt(now, pl); }
    let online = 0; for (const p of this.players.values()) if (!p.offline) online++;
    const want = Math.max(BELTS_MIN, Math.ceil(online / PLAYERS_PER_BELT));
    let have = 0; for (const poi of this.pois.values()) if (poi.kind === "belt" && !poi.retired) have++;
    for (; have < want; have++) this._newBelt(now);
  }
  /** A belt from the database (a restart): back on the map with its rocks as they were. */
  loadPoi(d) {
    if (d && d.kind === "home") return;                    // (owner, 2026-10-11) free player stations are gone (they'll be bought)
    if (d && d.kind === "belt" && !systemAt(d.x, d.y)) return;   // (a belt left outside every planetary system)
    if (d && d.kind === "home" && typeof d.owner === "string" && finite(d.x) && finite(d.y) && d.id === homeId(d.owner) && !this.pois.has(d.id)) { const h = this._makeHome(d); if (d.resite) h.resite = true; this.pois.set(d.id, h); this.poiVer++; return; }   // a player's station (resite: the new solar system moves it)
    if (!d || d.kind !== "belt" || !d.field || !Array.isArray(d.field.rocks) || this.pois.has(d.id)) return;
    this.pois.set(d.id, { ...d, retired: !d.field.rocks.length }); this.poiVer++;
  }
  // who has ships in which POI, worked out once per tick (POIs are few; this keeps snapshots cheap with many players)
  _occupancy() {
    if (this._occ && this._occ.at === this.tickN && this._occ.ver === this.poiVer) return this._occ.map;   // once per tick
    const map = new Map(), byOwner = new Map(); for (const poi of this.pois.values()) map.set(poi.id, new Set());
    for (const s of this.ships.values()) {
      if (s.wp || s.npc) continue;                          // (the ETA's ships don't open belts or keep them)
      for (const poi of this._poisNear(s.x, s.y)) if (this._inPoi(s, poi)) { map.get(poi.id).add(s.owner); let o = byOwner.get(s.owner); if (!o) byOwner.set(s.owner, o = new Set()); o.add(poi); }
    }
    this._occ = { at: this.tickN, ver: this.poiVer, map, byOwner };
    return map;
  }
  _shipsIn(poi, owner = null) { const set = this._occupancy().get(poi.id); return !!set && (owner == null ? set.size > 0 : set.has(owner)); }
  _poisOf(owner) { this._occupancy(); return this._occ.byOwner.get(owner) || new Set(); }   // the POIs this account has ships in
  _poisNearAll(x, y, d) {                              // every POI whose grid cells come within d of a point
    const out = new Set(), C = 400;
    for (let dx = -d; dx <= d + C - 1; dx += C) for (let dy = -d; dy <= d + C - 1; dy += C) for (const o of this._poisNear(x + Math.min(dx, d), y + Math.min(dy, d))) out.add(o);
    return [...out];
  }
  // POIs indexed on a coarse grid (every player has a station, so there are as many POIs as players): what's near a point
  _poisNear(x, y) {
    const C = 400;
    if (!this._pg || this._pg.ver !== this.poiVer) {
      const g = new Map();
      for (const poi of this.pois.values()) { const r = poi.r + 3; for (let cx = Math.floor((poi.x - r) / C); cx <= Math.floor((poi.x + r) / C); cx++) for (let cy = Math.floor((poi.y - r) / C); cy <= Math.floor((poi.y + r) / C); cy++) { const k = cx + "," + cy; let l = g.get(k); if (!l) g.set(k, l = []); l.push(poi); } }
      this._pg = { ver: this.poiVer, g };
    }
    return this._pg.g.get(Math.floor(x / C) + "," + Math.floor(y / C)) || [];
  }
  _newBelt(now = Date.now(), planet = null) {
    // (owner, 2026-10-11) inside a planetary system: in a ringed planet's rings (Saturn's most), the rocks scattered, or
    // around the planet or one of its major moons (a crescent); clear of the bodies and other POIs
    let p = planet;
    if (!p) { if (Math.random() < RING_BELT_SHARE) { const w = RINGED.map((q) => (q.rings.bright ? 4 : 1.5)), tot = w.reduce((a, b) => a + b, 0); let r = Math.random() * tot; p = RINGED[0]; for (let i = 0; i < RINGED.length; i++) { r -= w[i]; if (r <= 0) { p = RINGED[i]; break; } } }
      else p = PLANETS[Math.floor(Math.random() * PLANETS.length)]; }
    const mk = (x, y, ring) => { const id = "belt:" + now.toString(36) + (this.beltSeq++).toString(36);
      const poi = { id, kind: "belt", name: p.name + (ring ? " Rings " : " Belt ") + id.slice(-4).toUpperCase(), x: +x.toFixed(3), y: +y.toFixed(3), r: BELT.radiusKm, createdAt: now, field: createBeltField(id, x, y, now, ring), retired: false };
      this.pois.set(id, poi); this.poiVer++; return poi; };
    if (p.rings && Math.random() < RING_BELT_SHARE + 0.1) for (let t = 0; t < 300; t++) {
      const mid = (p.rings.in + p.rings.out) / 2, half = Math.max(0, (p.rings.out - p.rings.in) / 2 - BELT.radiusKm * 0.6), a = Math.random() * Math.PI * 2, d = mid + (Math.random() * 2 - 1) * half;
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (p.moons.some((m) => Math.hypot(m.x - x, m.y - y) < m.r + BELT.radiusKm + 20)) continue;
      if (this._poisNearAll(x, y, 400).some((o) => Math.hypot(o.x - x, o.y - y) < (o.ax != null ? 120 : 110))) continue;
      return mk(x, y, true);
    }
    let x = p.x + p.sysR / 2, y = p.y;
    for (let t = 0; t < 500; t++) {
      const big = p.moons.filter((m) => m.major), body = Math.random() < 0.35 && big.length ? big[Math.floor(Math.random() * big.length)] : p;
      const a = Math.random() * Math.PI * 2, d = body === p ? p.r + 200 + Math.random() * Math.max(100, p.sysR - p.r - 350) : body.r + 150 + Math.random() * 250;
      x = body.x + Math.cos(a) * d; y = body.y + Math.sin(a) * d;
      if (Math.hypot(x - p.x, y - p.y) > p.sysR - BELT.radiusKm - 20) continue;   // (inside its system)
      if (p.rings && Math.hypot(x - p.x, y - p.y) > p.rings.in - BELT.radiusKm - 20 && Math.hypot(x - p.x, y - p.y) < p.rings.out + BELT.radiusKm + 20) continue;   // (not in the rings: those are scattered belts)
      if (Math.hypot(x - p.x, y - p.y) < p.r + BELT.radiusKm + 100 || p.moons.some((m) => Math.hypot(m.x - x, m.y - y) < m.r + BELT.radiusKm + 60)) continue;
      if (this._poisNearAll(x, y, 400).some((o) => Math.hypot(o.x - x, o.y - y) < (o.ax != null ? 120 : o.kind === "station" || o.kind === "library" ? 150 : 250))) continue;
      break;
    }
    return mk(x, y, false);
  }
  // what one player's map shows: every belt still advertising itself, plus a mined-out one their ships are still in
  poiSig(p) { let sig = String(this.poiVer); for (const poi of this._poisOf(p.id)) if (poi.retired) sig += "," + poi.id; return sig; }
  poisFor(p) {
    const out = [];
    for (const poi of this.pois.values()) {
      if (poi.retired && !this._shipsIn(poi, p.id)) continue;
      if (poi.kind === "home" && poi.owner !== p.id) continue;   // (owner) only your own station is on your map
      const e = { id: poi.id, kind: poi.kind, name: poi.name, x: poi.x, y: poi.y, r: poi.r };
      if (poi.ax != null) Object.assign(e, { ax: poi.ax, ay: poi.ay, ar: poi.ar });   // a celestial's anchor
      if (poi.retired) e.hidden = true;
      out.push(e);
    }
    return out;
  }
  // (owner) a POI's zone and asteroids are only sent while one of your ships is inside it
  fieldSig(p) { let sig = ""; for (const poi of this._poisOf(p.id)) sig += poi.id + ":" + poi.field.ver + ","; return sig; }
  fieldsFor(p) {
    const out = [];
    for (const poi of this._poisOf(p.id)) out.push({ poi: poi.id, rocks: poi.field.rocks.map((k) => ({ id: k.id, x: k.x, y: k.y, size: k.size, ore: k.ore, rot: k.rot })), ...(poi.field.props ? { props: poi.field.props } : {}) });
    return { fields: out, sig: this.fieldSig(p) };
  }

  // ---- snapshots: your own ships always, other ships inside your camera's view (or near your ship) ----
  snapshotFor(p) {
    const mineList = this.shipsOf(p.id), own = mineList[0];   // (no view yet: around one of your ships)
    const v = p.view || (own ? { x: own.x, y: own.y, w: 60 } : null);
    const half = v ? v.w * 0.75 : 0, ships = [], locked = new Set();
    for (const s of mineList) for (const g of s.targets) if (g.kind === "ship") locked.add(g.id);   // your targets are sent wherever they are
    for (const s of this.ships.values()) {
      const mine = s.owner === p.id;
      if (!mine && (s.docked || s.cloak)) continue;         // (owner) a cloaked admin ship is seen by no one
      if (!mine && v && v.w > SOLAR_VIEW_KM && !locked.has(s.id)) continue;   // (owner) the solar view shows planets, not ships
      if (!mine && !s.npc && !s.admin && p.staffRole && (p.staffRole === "mod" || !p.adminMode)) continue;   // (owner) staff see other players' ships only in admin mode (Admins; Moderators and former staff never)
      if (!mine && !locked.has(s.id) && (!v || Math.abs(s.x - v.x) > half || Math.abs(s.y - v.y) > half)) continue;
      const e = { id: s.id, type: s.type, x: +s.x.toFixed(4), y: +s.y.toFixed(4), h: +s.h.toFixed(3), mine };
      if (s.npc) e.npc = 1;                                  // (owner) an ETA ship
      if (s.admin) { if (!mine) e.npc = 1; else { e.admin = 1; if (s.cloak) e.cloak = 1; } }   // (an admin's ETA ship looks like the ETA's to everyone else)
      if (s.anchorUntil > this.simAt) e.wi = s.anchorUntil - this.simAt;   // (owner) warping in as it uncloaks
      if (mine) {
        e.pilot = s.pilot; if (s.name) e.name = s.name; if (s.scram) e.scram = 1; if (s.crim) e.crim = 1; e.hp = s.hp; e.shield = s.shield; e.moving = s.moving; if (s.moving) { e.tx = +s.tx.toFixed(4); e.ty = +s.ty.toFixed(4); }
        if (s.dest) { e.dest = s.dest; if (s.warpReq) e.warpReq = true; }
        if (s.drift) e.drift = true;
        // speed (km/s; in warp, along its eased line), locked targets in the order they were locked, Align To / Move towards
        e.v = s.wp ? +(Math.hypot(s.wp.tx - s.wp.fx, s.wp.ty - s.wp.fy) * Math.PI / 2 * Math.sin(Math.PI * Math.min(1, (this.simAt - s.wp.at) / s.wp.dur)) / (s.wp.dur / 1000)).toFixed(4) : +Math.hypot(s.vx, s.vy).toFixed(4);
        if (s.targets.length) { const lm = s.lockMs; e.targets = s.targets.map((g) => ({ kind: g.kind, id: g.id, locked: g.locked, p: g.locked ? 1 : +Math.max(0, Math.min(1, 1 - (g.lockAt - this.simAt) / lm)).toFixed(3) })); }
        if (s.chase) e.chase = { kind: s.chase.kind, id: s.chase.id, mode: s.chase.mode };
        // (owner) modules: what's fitted, what's running (and how far through its cycle), the holds, the ship as fitted
        e.fit = s.fit; e.holds = s.holds; e.calc = s.calc; if (s.docked) e.docked = s.docked; if (s.dockReq) e.dockReq = s.dockReq; if (s.unboarded) e.unboarded = true;
        e.act = s.act.map((a) => (!a ? null : a.standby ? { sb: 1 } : a.tg ? { p: a.p, tg: a.tg } : { p: 1 }));
      }
      if (s.act) {                                         // lasers and drones at work, for everyone to see: where, from which hardpoint, how far through the cycle
        const b = []; s.act.forEach((a, i) => {
          if (!a || !a.tg) return;
          const c = this._mcalc(s, MODULES[s.fit.active[i]]); a.p = a.haul ? 1 : +Math.min(1, (this.simAt - a.at) / c.cycleMs).toFixed(3);
          const e = { m: s.fit.active[i], tg: a.tg, ax: a.ax, ay: a.ay, hp: a.hp, p: a.p, c: c.cycleMs, t0: a.at };   // t0: when the cycle began (server time), so clients run it smoothly
          if (a.haul) {                                      // drones hauling: when they left, each stretch's length, where from and back to
            const h = a.haul; Object.assign(e, { h0: h.at, lg: h.leg, dp: h.dp, dk: h.dk, rx: h.rx, ry: h.ry, rs: h.rs, ore: h.ore, amt: h.amt });
            if (h.recall) e.rc = 1;
            if (h.back) e.bk = { lg: h.back.leg, dk: h.back.dk, rx: h.back.rx, ry: h.back.ry, rs: h.back.rs };
          }
          if (a.fx != null) Object.assign(e, { fx: a.fx, fy: a.fy, fs: a.fs });   // drones flying over from another rock until t0   // drones hauling: how far through the round trip
          b.push(e);
        });
        if (b.length) e.beams = b;
      }
      if (s.dockSeq && s.dockSeq.phase !== "approach") e.dk = { prop: s.dockSeq.prop, i: s.dockSeq.i };   // (owner) in a hangar's mouth: masked by its front
      if (s.wp) e.warp = { to: s.wp.poi, p: +Math.min(1, (this.simAt - s.wp.at) / s.wp.dur).toFixed(3), fx: +s.wp.fx.toFixed(2), fy: +s.wp.fy.toFixed(2), tx: +s.wp.tx.toFixed(2), ty: +s.wp.ty.toFixed(2) };
      ships.push(e);
    }
    const out = { t: "snap", st: this.simAt, ships };
    if (p.adminMode && this.alerts.length) out.alerts = this._alertsOut();   // (owner) red diamonds, for Admins in admin mode
    { const at = new Set(ships.filter((x) => x.mine && x.docked).map((x) => x.docked)); if (at.size) { out.hangars = {}; for (const id of at) out.hangars[id] = p.hangars[id] || {}; } }   // (each station's hangar where one of your ships is docked)
    if (ships.some((x) => x.docked === "home")) { const h = this._home(p.id); if (h) out.home = h.items; }   // (your station's storage, while docked at it)
    return out;
  }
}
