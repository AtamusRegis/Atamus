// The Expanse Transit Authority (owner, 2026-10-11): the law of the solar system. Its ships (Deputies, Constables,
// Magistrates: constants.js ETA_TYPES) launch from the ETA Office near Mars. Some stand ready there, some guard the NPC
// stations, and Deputies patrol the POIs. Any ship causing aggression is flagged (its `crim`, saved with the ship, so
// a relog or a redeploy doesn't shake it) and hunted: the ETA sends a ship matching its size plus two Deputies, less
// the officers already at the scene. A dead officer brings two more of its kind and three Deputies. Officers lock with
// limited range and time; a locked Deputy warp scrambles, Constables and Magistrates also web. Flagged ships can't
// dock (or jump a stargate, once there are any). Nothing deals damage yet: aggression comes from World.aggress (a PTR
// dev command until there are weapons), and officerDown is the hook for when officers can die.
import { SHIP_TYPES, ETA_TYPES, WARP_BASE_MS, WARP_KM_PER_S } from "./constants.js";
import { planetByKey, systemAt } from "./celestials.js";
import { STATIONS, stationProps, hangarAt } from "./station.js";

const MARS = planetByKey("mars");
/** The ETA Office (owner: near Mars), inside the Mars system across the planet from Mars Station. */
export const ETA_OFFICE = { id: "eta-office", kind: "office", name: "Expanse Transit Authority Office", planet: "mars", x: +(MARS.x + Math.cos(0.5) * 650).toFixed(2), y: +(MARS.y + Math.sin(0.5) * 650).toFixed(2), r: 30 };
/** Its prop: a station's art and bay (ETA ships launch out of it and go back into it); players can't dock there. */
export const officeProps = () => stationProps(ETA_OFFICE).map((o) => ({ ...o, station: false, office: true }));

export const READY = { deputy: 10, constable: 5, magistrate: 2 };   // (owner) standing ready at the office
export const STATION_GUARDS = 3;                                    // (owner) Magistrates per NPC station
export const GATE_GUARD = { magistrate: 1, constable: 2, km: 20 };  // (owner) per stargate, orbiting it (no stargates yet)
export const PATROLS = 16, PATROL_PER_POI = 2;                      // (owner) Deputies on patrol, at most two per POI
export const SIZE_TO_ETA = { frigate: "deputy", cruiser: "constable", battleship: "magistrate" };
export const PER_AGGRESSOR = { deputy: 2 };                         // (owner) plus one matching the aggressor's size
export const ESCALATION = { same: 2, deputy: 3 };                   // (owner) per dead officer
const SCENE_KM = 150;            // officers this close to an aggressor are at the scene
const ENGAGE_KM = 25;            // farther than this from its quarry, an officer warps to it
const LOST_MS = 120_000;         // an aggressor gone (logged off) this long: the officers stand down (the flag stays)
const SPAWN_MS = 4000;           // the office launches a ship this often to keep its ready pool full
const MAX_OFFICERS = 400;
const TYPES = ["deputy", "constable", "magistrate"];
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Eta {
  constructor(world) { this.w = world; this.seq = 0; this.cases = new Map(); this.nextSpawn = 0; }
  officers() { return this.w.shipsOf("eta"); }
  _make(type, x, y, h, role, extra = {}) {
    const t = ETA_TYPES[type], id = "eta:" + (++this.seq).toString(36);
    const s = { id, owner: "eta", npc: true, pilot: null, type, x, y, vx: 0, vy: 0, h, tx: x, ty: y, moving: false, speed: t.speedKmps, accel: t.accelKmps2, radius: t.radiusKm, mass: t.mass, hp: t.hp, shield: t.shield,
      targetRange: t.targetRangeKm, lockMs: t.lockMs, maxTargets: t.maxTargets, targets: [], chase: null, holds: {}, fit: { active: [], passive: [], off: { active: [], passive: [] } }, act: [], lic: {}, docked: false,
      role, cases: [], dir: Math.random() < 0.5 ? 1 : -1, ...extra };
    this.w._recalc(s); this.w.ships.set(id, s); this.w._own = null;
    return s;
  }
  _office() { const o = this.w.pois.get(ETA_OFFICE.id); return o && o.field.props[0]; }
  /** A ship out of the office's bay, heading out a few km. */
  _launch(type, role, extra = {}) {
    if (this.officers().length >= MAX_OFFICERS) return null;
    const h = hangarAt(this._office(), 0); if (!h) return null;
    const a = Math.atan2(h.ny, h.nx) + rnd(-0.4, 0.4), s = this._make(type, h.x + h.nx * 0.2, h.y + h.ny * 0.2, a, role, extra);
    const d = rnd(4, 9); s.tx = s.x + Math.cos(a) * d; s.ty = s.y + Math.sin(a) * d; s.moving = true;
    return s;
  }
  /** The world's ETA as it starts: the ready pool at the office, the guards at every NPC station, the patrols out. */
  populate() {
    const o = ETA_OFFICE;
    for (const type of TYPES) for (let i = 0; i < READY[type]; i++) this._idleShip(type, "ready", o);
    for (const st of STATIONS) for (let i = 0; i < STATION_GUARDS; i++) this._idleShip("magistrate", "guard", st);
    const spots = this._patrolPois();
    for (let i = 0; i < PATROLS; i++) {
      const poi = spots.length ? spots[Math.floor(Math.random() * spots.length)] : o, aim = this.w._poiAim(poi), p = this._inside(aim);
      if (this._patrollers(poi.id) >= PATROL_PER_POI) { const s = this._idleShip("deputy", "patrol", o); s.at = null; continue; }
      const s = this._make("deputy", p.x, p.y, rnd(0, 6.28), "patrol"); s.at = poi.id; s.leaveAt = Date.now() + rnd(5000, 90_000);
    }
  }
  // a ship standing by somewhere (the office, a station): some circle it, some hold a spot near it
  _idleShip(type, role, post) {
    const a = rnd(0, Math.PI * 2), R = role === "guard" ? rnd(15, 25) : rnd(6, 14), x = post.x + Math.cos(a) * R, y = post.y + Math.sin(a) * R;
    return this._make(type, x, y, a + Math.PI / 2, role, { post: { x: post.x, y: post.y, id: post.id }, orbitR: R, circles: Math.random() < 0.5 });
  }
  _patrolPois() {
    return [...this.w.pois.values()].filter((p) => !p.retired && (p.kind === "belt" || p.kind === "station" || p.kind === "office" || p.kind === "library" || p.kind === "planet" || p.kind === "moon"));
  }
  _patrollers(poiId) { let n = 0; for (const s of this.officers()) if (s.role === "patrol" && s.at === poiId) n++; return n; }
  _inside(aim) { const a = rnd(0, Math.PI * 2), d = Math.sqrt(Math.random()) * Math.min(20, (aim.r || 30) * 0.6); return { x: aim.x + Math.cos(a) * d, y: aim.y + Math.sin(a) * d }; }

  // ---- warping (every ETA ship has a Microwarp Drive): it turns toward where it's going for its hull's align time, then
  // warps, dropping out a few km off (a quarry: off where it is then, or where its own warp is taking it) ----
  _warpTo(s, goal, now, spread = [4, 12]) {
    if (s.wp || s.align) return;
    const g = this._goalPos(goal); if (!g) return;
    s.align = { at: now + ETA_TYPES[s.type].alignMs, goal, spread }; s.chase = null; s.targets = [];
    const a = Math.atan2(g.y - s.y, g.x - s.x); s.tx = s.x + Math.cos(a) * 50; s.ty = s.y + Math.sin(a) * 50; s.moving = true; s.cruise = true;
  }
  _goalPos(goal) {
    if (goal.q) { const q = this.w.ships.get(goal.q); if (!q || q.docked) return null; return q.wp ? { x: q.wp.tx, y: q.wp.ty } : { x: q.x, y: q.y }; }
    return goal;
  }
  _tickAlign(s, now) {
    if (!s.align || now < s.align.at) return;
    const g = this._goalPos(s.align.goal), sp = s.align.spread; s.align = null; s.cruise = false;
    if (!g) { s.moving = false; return; }
    const a = rnd(0, Math.PI * 2), d = rnd(sp[0], sp[1]), tx = g.x + Math.cos(a) * d, ty = g.y + Math.sin(a) * d, L = Math.hypot(tx - s.x, ty - s.y);
    if (L < 1) { s.moving = false; return; }
    s.wp = { fx: s.x, fy: s.y, tx, ty, at: now, dur: Math.round(WARP_BASE_MS + L / WARP_KM_PER_S * 1000), poi: null };
    s.h = Math.atan2(ty - s.y, tx - s.x); s.moving = false; s.chase = null; s.targets = []; s.vx = 0; s.vy = 0;
  }
  // circling a point (a station, the office) at its own radius, or holding its spot
  _circle(s, cx, cy, R) {
    const d = Math.hypot(s.x - cx, s.y - cy);
    if (d > R * 1.5 + 3) { s.tx = cx + (s.x - cx) / d * R; s.ty = cy + (s.y - cy) / d * R; s.moving = true; s.cruise = false; return; }
    const a = Math.atan2(s.y - cy, s.x - cx) + s.dir * Math.min(0.6, Math.max(0.05, s.speed * 4 / R));
    s.tx = cx + Math.cos(a) * R; s.ty = cy + Math.sin(a) * R; s.moving = true; s.cruise = true;
  }
  _standBy(s) {
    const p = s.post; if (!p) return;
    if (dist(s, p) > ENGAGE_KM * 4) { this._warpTo(s, { x: p.x, y: p.y }, this.w.simAt, [s.orbitR * 0.8, s.orbitR * 1.2]); return; }
    if (s.circles) this._circle(s, p.x, p.y, s.orbitR);
    else if (!s.spot) { s.spot = { x: s.x, y: s.y }; s.moving = false; }
  }

  // ---- (owner) patrols: warp to a POI (no more than two at one), move about there a while (to points in it, or circling
  // one), then warp on to another ----
  _patrol(s, now) {
    if (!s.at || (s.leaveAt && now >= s.leaveAt)) {
      const here = systemAt(s.x, s.y), all = this._patrolPois().filter((p) => p.id !== s.at && this._patrollers(p.id) < PATROL_PER_POI);
      const local = all.filter((p) => systemAt(p.x, p.y) === here), pick = (local.length && Math.random() < 0.6 ? local : all);
      if (!pick.length) { s.leaveAt = now + 30_000; return; }
      const poi = pick[Math.floor(Math.random() * pick.length)], aim = this.w._poiAim(poi);
      s.at = poi.id; s.leaveAt = 0; s.next = 0;
      this._warpTo(s, { x: aim.x, y: aim.y, poi: poi.id }, now, [0, Math.min(20, (aim.r || 30) * 0.6)]);
      return;
    }
    if (!s.leaveAt) s.leaveAt = now + rnd(40_000, 100_000);
    if (now < (s.next || 0)) { if (s.ring) this._circle(s, s.ring.x, s.ring.y, s.ring.r); return; }
    const poi = this.w.pois.get(s.at); if (!poi) { s.at = null; return; }
    const p = this._inside(this.w._poiAim(poi));
    s.next = now + rnd(12_000, 25_000);
    if (Math.random() < 0.4) { s.ring = { x: p.x, y: p.y, r: rnd(1.5, 4) }; this._circle(s, p.x, p.y, s.ring.r); }
    else { s.ring = null; const q = this.w._clearPoint(p, s); s.tx = q.x; s.ty = q.y; s.moving = true; s.cruise = false; }
  }

  // ---- (owner) aggression and the response ----
  /** A new aggressor (flagged now, or back in space with its flag): officers at the scene take it on, and the office
   *  sends whatever's still needed: one of the aggressor's size plus two Deputies. */
  respond(sid, now = this.w.simAt) {
    const q = this.w.ships.get(sid); if (!q || q.npc || !q.crim) return;
    const c = this._case(sid, now);
    const need = { ...PER_AGGRESSOR }, m = SIZE_TO_ETA[(SHIP_TYPES[q.type] || {}).size] || "deputy"; need[m] = (need[m] || 0) + 1;
    for (const o of this.officers()) {                     // (owner) officers already there count
      if (o.wp || o.align || o.role === "return" || dist(o, q) > SCENE_KM) continue;
      if ((need[o.type] || 0) > 0) { need[o.type]--; this._assign(o, c); }
      else if (o.role === "respond") this._assign(o, c);  // (busy at the scene: it takes this one on too)
    }
    for (const type of TYPES) this._dispatch(type, need[type] || 0, c);
  }
  _case(sid, now) { let c = this.cases.get(sid); if (!c) this.cases.set(sid, (c = { sid, since: now, units: new Set(), lostAt: 0 })); return c; }
  _assign(o, c) {
    if (o.role !== "respond") {
      if (o.role === "guard" && o.post) {                  // (owner) a station's Magistrate goes after it all the way; another warps in to guard the station
        const r = this._launch(o.type, "guard", { post: o.post, orbitR: rnd(15, 25), circles: Math.random() < 0.5 }); if (r) this._warpTo(r, { x: o.post.x, y: o.post.y }, this.w.simAt, [12, 25]);
      }
      o.was = { role: o.role, at: o.at || null }; o.role = "respond"; o.spot = null; o.ring = null;
    }
    if (!o.cases.includes(c.sid)) o.cases.push(c.sid); c.units.add(o.id);
  }
  // from the ready pool (launching more when it's short)
  _dispatch(type, n, c) {
    for (let i = 0; i < n; i++) {
      const o = this.officers().find((s) => s.role === "ready" && s.type === type) || this._launch(type, "ready", { post: { x: ETA_OFFICE.x, y: ETA_OFFICE.y, id: ETA_OFFICE.id }, orbitR: rnd(6, 14) });
      if (!o) return;
      this._assign(o, c);
    }
  }
  /** (owner) An officer is killed: two more of its kind and three Deputies go after whoever did it. */
  officerDown(oid, killerSid, now = this.w.simAt) {
    const o = this.w.ships.get(oid); if (!o || !o.npc) return;
    this.w.ships.delete(oid); this.w._own = null;
    for (const c of this.cases.values()) c.units.delete(oid);
    const k = this.w.ships.get(killerSid); if (!k || k.npc) return;
    if (!k.crim) { k.crim = { since: now, vs: [] }; }
    const c = this._case(killerSid, now);
    this._dispatch(o.type, ESCALATION.same, c); this._dispatch("deputy", ESCALATION.deputy, c);
  }
  /** The case closes (the flag cleared, or the aggressor long gone): its officers go back to what they were doing. */
  _close(sid) {
    const c = this.cases.get(sid); if (!c) return; this.cases.delete(sid);
    for (const id of c.units) { const o = this.w.ships.get(id); if (!o) continue; o.cases = o.cases.filter((x) => x !== sid); o.targets = o.targets.filter((g) => g.id !== sid); if (!o.cases.length) this._standDown(o); }
  }
  _standDown(o) {
    const was = o.was || { role: "return" }; o.was = null; o.chase = null; o.targets = []; o.moving = false; o.cruise = false; o.spot = null; o.gunTg = null;
    if (was.role === "patrol") { o.role = "patrol"; o.at = null; }
    else if (was.role === "guard" && this.officers().filter((x) => x.role === "guard" && x.post && o.post && x.post.id === o.post.id).length < STATION_GUARDS) o.role = "guard";   // (its station already has its guards: into the office)
    else o.role = "return";                                // (the ready pool has been refilled: back into the office)
  }
  _respond(o, now) {
    const T = ETA_TYPES[o.type];
    let q = null; for (const sid of o.cases) { const s = this.w.ships.get(sid); if (s && !s.docked) { q = s; break; } }
    if (!q) { if (o.chase) { o.chase = null; o.moving = false; } return; }
    if (q.wp) { if (Math.hypot(o.x - q.wp.tx, o.y - q.wp.ty) > ENGAGE_KM) this._warpTo(o, { q: q.id }, now); else if (o.chase) { o.chase = null; o.moving = false; } return; }   // (owner) after it, through warps too (already where it's going: wait for it)
    if (dist(o, q) > ENGAGE_KM) { this._warpTo(o, { q: q.id }, now); return; }
    if (!o.chase || o.chase.id !== q.id) { o.chase = { kind: "ship", id: q.id, mode: "orbit", dist: T.orbitKm }; o.cruise = false; }
    for (const sid of o.cases) {                           // lock what it's after, within its (owner: limited) lock range
      if (o.targets.length >= o.maxTargets) break;
      const s = this.w.ships.get(sid), pos = s && this.w._objPos("ship", sid);
      if (!pos || o.targets.some((g) => g.id === sid) || this.w._range(o, pos) > o.targetRange) continue;
      o.targets.push({ kind: "ship", id: sid, lockAt: now + o.lockMs, locked: false });
    }
    // (owner) officers fire on what they're after: the first locked one in their guns' reach
    const gun = T.gun; if (!gun) return;
    if (now < (o.gunNext || 0)) return;
    const g = o.targets.find((x) => x.locked && o.cases.includes(x.id) && (() => { const p = this.w._objPos("ship", x.id); return p && this.w._range(o, p) <= gun.rangeKm; })());
    if (!g) { o.gunTg = null; return; }
    this.w._fire(o, g.id, { dmg: gun.dmg, cycleMs: gun.cycleMs, shieldK: 1, hullK: 1 }, now); o.gunTg = g.id; o.gunAt = now; o.gunNext = now + gun.cycleMs;
  }
  _return(o, now) {
    const h = hangarAt(this._office(), 0); if (!h) { this._despawn(o); return; }
    const fx = h.x + h.nx * 0.3, fy = h.y + h.ny * 0.3, d = Math.hypot(o.x - fx, o.y - fy);
    if (d > ENGAGE_KM * 2) { this._warpTo(o, { x: fx + h.nx * 8, y: fy + h.ny * 8 }, now, [0, 3]); return; }
    if (d < 0.4) { this._despawn(o); return; }             // into the bay
    o.tx = fx; o.ty = fy; o.moving = true; o.cruise = false;
  }
  _despawn(o) { this.w.ships.delete(o.id); this.w._own = null; for (const c of this.cases.values()) c.units.delete(o.id); }

  tick(now) {
    // flagged ships back in space (a relog, a redeploy) with no case open: hunted again (owner)
    for (const s of this.w.ships.values()) if (s.crim && !s.npc && !s.docked && !this.cases.has(s.id)) this.respond(s.id, now);
    for (const [sid, c] of [...this.cases]) {
      const q = this.w.ships.get(sid);
      if (q && !q.crim) { this._close(sid); continue; }    // (the flag cleared)
      if (!q || q.docked) { if (!c.lostAt) c.lostAt = now; else if (now - c.lostAt > LOST_MS) this._close(sid); }
      else c.lostAt = 0;
    }
    // the office keeps its ready pool full
    if (now >= this.nextSpawn) {
      this.nextSpawn = now + SPAWN_MS;
      const have = { deputy: 0, constable: 0, magistrate: 0 }; for (const s of this.officers()) if (s.role === "ready") have[s.type]++;
      const t = TYPES.find((k) => have[k] < READY[k]); if (t) this._launch(t, "ready", { post: { x: ETA_OFFICE.x, y: ETA_OFFICE.y, id: ETA_OFFICE.id }, orbitR: rnd(6, 14), circles: Math.random() < 0.5 });
    }
    for (const s of [...this.officers()]) {
      this._tickAlign(s, now);
      if (s.wp || s.align) continue;
      if (s.role === "respond") this._respond(s, now);
      else if (s.role === "patrol") this._patrol(s, now);
      else if (s.role === "return") this._return(s, now);
      else if (!s.moving || s.circles) this._standBy(s);   // ready or guard (a just-launched ship finishes leaving the bay first)
    }
  }
}
