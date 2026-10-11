// The authoritative simulation (back to basics, owner 2026-10-10): the Expanse's hexagon with nothing in it, and one
// Prospector per pilot that flies, aligns and warps where it's told, and asteroid belt POIs. Everything else the game
// had is kept for reference in reference/2026-10-10-pre-reset/.
import { SHIP_TYPES, SHIP_ARRIVE_EPS_KM, LOGOUT_GRACE_MS, EXPANSE_APOTHEM_KM, SPAWN_SPREAD_KM, BELTS_MIN, PLAYERS_PER_BELT, WARP_BASE_MS, WARP_KM_PER_S, ALIGN_SPEED, ALIGN_DEG, WARP_LAND_KM } from "./constants.js";
import { BELT, createBeltField, decayField, fieldM3 } from "./belts.js";

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
const ROCK_SOLID = 0.9;                               // a rock's solid radius, as a share of half its sprite's size (the art doesn't fill its square)
const VIEW_MAX_W = 4 * EXPANSE_APOTHEM_KM;            // the widest camera view a client may claim

export class World {
  constructor() {
    this.players = new Map();   // pid -> { id, name, send, offline, offlineSince, view, pilots: [{ id, name }] }
    this.ships = new Map();     // sid -> ship
    this.simAt = Date.now();    // the moment the ships' positions are for (snapshots carry it)
    this.pois = new Map();      // belt POIs: id -> { id, kind, name, x, y, r, createdAt, field, retired }
    this.poiVer = 1; this.nextPoiTick = 0; this.beltSeq = 0;
  }

  addPlayer(id, name, send, saved = null, pilots = []) {
    const existing = this.players.get(id);
    if (existing) { existing.send = send; existing.offline = false; existing.name = name; this.setPilots(id, pilots, saved); return existing; }
    const p = { id, name, send, offline: false, offlineSince: 0, view: null, pilots: [], saved };
    this.players.set(id, p);
    this.setPilots(id, pilots, saved);
    return p;
  }
  /** The account's pilots (from the database): each has one Prospector, and a pilot that's gone takes theirs with it. */
  setPilots(id, pilots, saved = null) {
    const p = this.players.get(id); if (!p) return;
    p.pilots = (pilots || []).map((x) => ({ id: String(x.id), name: x.name }));
    const keep = new Set(p.pilots.map((x) => this._sid(id, x.id)));
    for (const [sid, s] of this.ships) if (s.owner === id && !keep.has(sid)) this.ships.delete(sid);
    for (const pl of p.pilots) this._ensureShip(id, pl.id, saved || p.saved);
  }
  _sid(owner, pilotId) { return `${owner}:ship:${pilotId}`; }
  // a pilot's Prospector: where they left it, or a fresh one near the centre
  _ensureShip(id, pilotId, saved) {
    const sid = this._sid(id, pilotId);
    if (this.ships.has(sid)) return this.ships.get(sid);
    const t = SHIP_TYPES.chisel, sv = saved && saved.ships && saved.ships[pilotId];
    let x, y, h;
    if (sv && finite(sv.x) && finite(sv.y)) { ({ x, y } = clampToExpanse(sv.x, sv.y, t.radiusKm)); h = finite(sv.h) ? sv.h : Math.PI / 2; }
    else { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * SPAWN_SPREAD_KM; x = Math.cos(a) * d; y = Math.sin(a) * d; h = Math.random() * Math.PI * 2; }
    const s = { id: sid, owner: id, pilot: String(pilotId), type: "chisel", x, y, vx: 0, vy: 0, h, tx: x, ty: y, moving: false, speed: t.speedKmps, accel: t.accelKmps2, radius: t.radiusKm, mass: t.mass, hp: t.hp, shield: t.shield };
    this.ships.set(sid, s);
    return s;
  }
  // Logging off (owner: no logged-off presence): after a short grace for reloads the ship leaves the world.
  removePlayer(id) { const p = this.players.get(id); if (!p) return; p.offline = true; p.offlineSince = Date.now(); p.send = () => {}; }
  _purge(id) {
    if (this.onBeforePurge) { try { this.onBeforePurge(id); } catch (e) { console.error("onBeforePurge", e); } }
    for (const [sid, s] of this.ships) if (s.owner === id) this.ships.delete(sid);
    this.players.delete(id);
  }
  /** Everything about a player worth keeping across logins and restarts. */
  exportState(id) {
    const ships = {};
    for (const s of this.ships.values()) if (s.owner === id) ships[s.pilot] = { x: +s.x.toFixed(4), y: +s.y.toFixed(4), h: +s.h.toFixed(3) };
    return { ships, savedAt: Date.now() };
  }

  // ---- commands (every field hostile) ----
  /** Fly one of your ships to a point (clamped inside the hexagon). */
  cmdMove(pid, shipId, x, y) {
    if (!finite(x) || !finite(y)) return;
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || s.wp) return;   // no new orders mid-warp
    const t = clampToExpanse(x, y, s.radius);
    for (const poi of this.pois.values()) if (Math.hypot(t.x - poi.x, t.y - poi.y) <= poi.r + 1) for (const k of poi.field.rocks) this._pushOut(t, k.x, k.y, k.r * ROCK_SOLID + s.radius + 0.02);   // a point inside a rock: its edge
    s.tx = t.x; s.ty = t.y; s.moving = true; s.dest = null; s.warpReq = false; s.drift = false;
  }
  /** Align (owner): fly toward a POI at regular speed; it's now the ship's destination, which it can warp to as long as
   *  the POI still shows on the map. Warp: align, then warp as soon as it's aligned. */
  cmdAlign(pid, shipId, poiId, warp = false) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || s.wp) return;
    const poi = typeof poiId === "string" ? this.pois.get(poiId) : null;
    if (!poi || poi.retired) return;                       // only a POI that still advertises itself
    if (warp && this._inPoi(s, poi)) return;               // no warping to where you already are
    s.dest = poi.id; s.warpReq = !!warp; s.drift = false; s.tx = poi.x; s.ty = poi.y; s.moving = true;
  }
  cmdWarp(pid, shipId, poiId) { const s = this.ships.get(shipId); if (!s || s.owner !== pid) return; this.cmdAlign(pid, shipId, typeof poiId === "string" ? poiId : s.dest, true); }
  // push a ship out of a circle (cx, cy, minD), taking away the velocity that carried it in
  _pushOut(s, cx, cy, minD) {
    let dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy); if (d >= minD) return false;
    if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d; s.x = cx + nx * minD; s.y = cy + ny * minD;
    const vn = s.vx * nx + s.vy * ny; if (vn < 0) { s.vx -= vn * nx; s.vy -= vn * ny; }
    return true;
  }
  _inPoi(s, poi) { return Math.hypot(s.x - poi.x, s.y - poi.y) <= poi.r; }
  // aligned (owner, EVE-like): heading within ALIGN_DEG of the destination and at ALIGN_SPEED of top speed
  _aligned(s, poi) {
    const v = Math.hypot(s.vx, s.vy); if (v < s.speed * ALIGN_SPEED) return false;
    const want = Math.atan2(poi.y - s.y, poi.x - s.x), got = Math.atan2(s.vy, s.vx);
    let d = Math.abs(want - got) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d;
    return d <= ALIGN_DEG * Math.PI / 180;
  }
  _startWarp(s, poi, now) {
    // drop out on the inside of the crescent (WARP_LAND_KM toward its middle), give or take a couple of km
    const a = poi.field.dir + (Math.random() - 0.5) * 0.3, d = WARP_LAND_KM + (Math.random() - 0.5) * 4;
    const to = { x: poi.x + Math.cos(a) * d, y: poi.y + Math.sin(a) * d }, dist = Math.hypot(to.x - s.x, to.y - s.y);
    s.wp = { fx: s.x, fy: s.y, tx: to.x, ty: to.y, at: now, dur: Math.round(WARP_BASE_MS + dist / WARP_KM_PER_S * 1000), poi: poi.id };
    s.h = Math.atan2(to.y - s.y, to.x - s.x); s.moving = false; s.warpReq = false;
  }
  /** Where the player's camera is: other ships in view get sent to them. */
  cmdView(pid, x, y, w) {
    const p = this.players.get(pid); if (!p) return;
    if (!finite(x) || !finite(y) || !finite(w) || w <= 0) { p.view = null; return; }
    const c = clampToExpanse(x, y); p.view = { x: c.x, y: c.y, w: Math.min(w, VIEW_MAX_W) };
  }

  /** Local and Corp chat (owner): you speak as your account's character (its portrait and your username), not as a
   *  pilot. Local is everyone in the Expanse; everyone is in Deep Core Industries for now, so Corp reaches everyone too. */
  cmdChat(pid, text, channel, to) {
    const p = this.players.get(pid); if (!p || typeof text !== "string") return;
    const clean = text.replace(/\s+/g, " ").trim().slice(0, 240); if (!clean) return;
    if (channel === "dm") {                               // (owner) a direct message: both ends see it in a tab named for the other
      if (typeof to !== "string" || !to || to.length > 40) return;
      const msg = JSON.stringify({ t: "chat", ch: "dm", from: p.name, to, portrait: p.portrait || null, text: clean, ts: Date.now() });
      let sent = false;
      for (const o of this.players.values()) if (!o.offline && o.id !== pid && o.name.toLowerCase() === to.toLowerCase()) { o.send(msg); sent = true; }
      p.send(msg);
      if (!sent) p.send(JSON.stringify({ t: "sys", text: to + " is not online.", dm: to }));
      return;
    }
    const ch = channel === "corp" ? "corp" : "local";
    const msg = JSON.stringify({ t: "chat", ch, from: p.name, portrait: p.portrait || null, text: clean, ts: Date.now() });
    for (const other of this.players.values()) if (!other.offline) other.send(msg);
  }

  tick(dtSec) {
    const now = Date.now(); this.simAt = now;
    if (now >= this.nextPoiTick) { this.nextPoiTick = now + 2000; this._maintainPois(now); }
    this._tickShips(dtSec, now);
    for (const p of [...this.players.values()]) if (p.offline && now - p.offlineSince > LOGOUT_GRACE_MS) this._purge(p.id);
  }
  _tickShips(dtSec, now) {
    this.simAt = now;
    const ships = [...this.ships.values()];
    // 1) steer toward the target as fast as it can while still able to brake in time, then integrate
    for (const s of ships) {
      if (s.wp) {                                          // in warp: eased along the line, then a dead stop at the far end
        const k = Math.min(1, (now - s.wp.at) / s.wp.dur), e = 0.5 - 0.5 * Math.cos(Math.PI * k);
        s.x = s.wp.fx + (s.wp.tx - s.wp.fx) * e; s.y = s.wp.fy + (s.wp.ty - s.wp.fy) * e; s.vx = 0; s.vy = 0;
        if (k >= 1) { s.wp = null; s.dest = null; s.moving = false; s.tx = s.x; s.ty = s.y; }
        continue;
      }
      if (s.dest) {                                        // aligning: the POI must still advertise itself, or the ship drifts on
        const poi = this.pois.get(s.dest);
        if (!poi || poi.retired) { s.dest = null; s.warpReq = false; s.moving = false; s.drift = true; }
        else if (s.warpReq && this._aligned(s, poi)) { this._startWarp(s, poi, now); continue; }
      }
      if (s.moving) {
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
        if (d <= SHIP_ARRIVE_EPS_KM) s.moving = false;
        else {
          const spd = Math.min(s.speed, Math.sqrt(2 * s.accel * d) * 0.95);
          const dvx = (dx / d) * spd - s.vx, dvy = (dy / d) * spd - s.vy, dv = Math.hypot(dvx, dvy), step = s.accel * dtSec;
          if (dv <= step) { s.vx += dvx; s.vy += dvy; } else { s.vx += dvx / dv * step; s.vy += dvy / dv * step; }   // acceleration-limited
        }
      }
      if (!s.moving && !s.drift) { const v = Math.hypot(s.vx, s.vy), step = s.accel * dtSec; if (v <= step) { s.vx = 0; s.vy = 0; } else { s.vx -= s.vx / v * step; s.vy -= s.vy / v * step; } }
      s.x += s.vx * dtSec; s.y += s.vy * dtSec;
      if (Math.hypot(s.vx, s.vy) > 0.05) s.h = Math.atan2(s.vy, s.vx);   // face the way it's going
    }
    // 2) ships don't overlap: pairs in the same 1 km cell (or a neighbouring one) push apart, the lighter one more
    const cell = 1, grid = new Map(), key = (i, j) => i + "," + j;
    for (const s of ships) { if (s.wp) continue; const k = key(Math.floor(s.x / cell), Math.floor(s.y / cell)); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(s); }
    for (const a of ships) {
      const ci = Math.floor(a.x / cell), cj = Math.floor(a.y / cell);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const b of grid.get(key(ci + di, cj + dj)) || []) {
        if (b.id <= a.id) continue;
        let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); const minD = a.radius + b.radius;
        if (d >= minD) continue;
        if (d < 1e-6) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy) || 1; }
        const nx = dx / d, ny = dy / d, overlap = minD - d, wa = b.mass / (a.mass + b.mass), wb = a.mass / (a.mass + b.mass);
        a.x -= nx * overlap * wa; a.y -= ny * overlap * wa; b.x += nx * overlap * wb; b.y += ny * overlap * wb;
        const avn = a.vx * nx + a.vy * ny; if (avn > 0) { a.vx -= avn * nx; a.vy -= avn * ny; }   // no ramming / jitter
        const bvn = b.vx * nx + b.vy * ny; if (bvn < 0) { b.vx -= bvn * nx; b.vy -= bvn * ny; }
      }
    }
    // 2b) (owner) everything in space is solid: ships can't fly through asteroids (only a warp passes through anything)
    const occ = this._occupancy();
    for (const poi of this.pois.values()) {
      if (!occ.get(poi.id) || !occ.get(poi.id).size) continue;
      for (const s of ships) {
        if (s.wp || Math.hypot(s.x - poi.x, s.y - poi.y) > poi.r + 1) continue;
        for (const k of poi.field.rocks) this._pushOut(s, k.x, k.y, k.r * ROCK_SOLID + s.radius);
      }
    }
    // 3) the hexagon's edge stops ships (and whatever velocity was carrying them out)
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
      if (decayField(poi.field, now)) this.poiFieldVer = (this.poiFieldVer || 0) + 1;
      if (!poi.retired && !poi.field.rocks.length) { poi.retired = true; this.poiVer++; }
      if (poi.retired && !this._shipsIn(poi)) { this.pois.delete(poi.id); this.poiVer++; if (this.onPoiClosed) { try { this.onPoiClosed(poi); } catch (e) { console.error("onPoiClosed", e); } } }
    }
    let online = 0; for (const p of this.players.values()) if (!p.offline) online++;
    const want = Math.max(BELTS_MIN, Math.ceil(online / PLAYERS_PER_BELT));
    let have = 0; for (const poi of this.pois.values()) if (!poi.retired) have++;
    for (; have < want; have++) this._newBelt(now);
  }
  /** A belt from the database (a restart): back on the map with its rocks as they were. */
  loadPoi(d) {
    if (!d || d.kind !== "belt" || !d.field || !Array.isArray(d.field.rocks) || this.pois.has(d.id)) return;
    this.pois.set(d.id, { ...d, retired: !d.field.rocks.length }); this.poiVer++;
  }
  // who has ships in which POI, worked out once per tick (POIs are few; this keeps snapshots cheap with many players)
  _occupancy() {
    if (this._occ && this._occ.at === this.simAt && this._occ.ver === this.poiVer) return this._occ.map;
    const map = new Map(); for (const poi of this.pois.values()) map.set(poi.id, new Set());
    for (const s of this.ships.values()) { if (s.wp) continue; for (const poi of this.pois.values()) if (this._inPoi(s, poi)) map.get(poi.id).add(s.owner); }
    this._occ = { at: this.simAt, ver: this.poiVer, map };
    return map;
  }
  _shipsIn(poi, owner = null) { const set = this._occupancy().get(poi.id); return !!set && (owner == null ? set.size > 0 : set.has(owner)); }
  _newBelt(now = Date.now()) {
    // somewhere inside the hexagon, clear of the edge and of other belts
    let x = 0, y = 0;
    for (let t = 0; t < 500; t++) {
      const a = Math.random() * Math.PI * 2, d = (0.1 + Math.random() * 0.8) * EXPANSE_APOTHEM_KM; x = Math.cos(a) * d; y = Math.sin(a) * d;
      if (insideExpanse(x, y, BELT.radiusKm * 3) && [...this.pois.values()].every((o) => Math.hypot(o.x - x, o.y - y) > 600)) break;
    }
    const id = "belt:" + now.toString(36) + (this.beltSeq++).toString(36);
    const poi = { id, kind: "belt", name: "Asteroid Belt " + id.slice(-4).toUpperCase(), x: +x.toFixed(3), y: +y.toFixed(3), r: BELT.radiusKm, createdAt: now, field: createBeltField(id, x, y, now), retired: false };
    this.pois.set(id, poi); this.poiVer++;
    return poi;
  }
  // what one player's map shows: every belt still advertising itself, plus a mined-out one their ships are still in
  poiSig(p) { let sig = String(this.poiVer); for (const poi of this.pois.values()) if (poi.retired && this._shipsIn(poi, p.id)) sig += "," + poi.id; return sig; }
  poisFor(p) {
    const out = [];
    for (const poi of this.pois.values()) {
      if (poi.retired && !this._shipsIn(poi, p.id)) continue;
      const e = { id: poi.id, kind: poi.kind, name: poi.name, x: poi.x, y: poi.y, r: poi.r };
      if (poi.retired) e.hidden = true;
      out.push(e);
    }
    return out;
  }
  // (owner) a POI's zone and asteroids are only sent while one of your ships is inside it
  fieldSig(p) { let sig = ""; for (const poi of this.pois.values()) if (this._shipsIn(poi, p.id)) sig += poi.id + ":" + poi.field.ver + ","; return sig; }
  fieldsFor(p) {
    const out = [];
    for (const poi of this.pois.values()) if (this._shipsIn(poi, p.id)) out.push({ poi: poi.id, rocks: poi.field.rocks.map((k) => ({ id: k.id, x: k.x, y: k.y, size: k.size, ore: k.ore, rot: k.rot })) });
    return { fields: out, sig: this.fieldSig(p) };
  }

  // ---- snapshots: your own ships always, other ships inside your camera's view (or near your ship) ----
  snapshotFor(p) {
    const own = [...this.ships.values()].find((s) => s.owner === p.id);   // (no view yet: around one of your ships)
    const v = p.view || (own ? { x: own.x, y: own.y, w: 60 } : null);
    const half = v ? v.w * 0.75 : 0, ships = [];
    for (const s of this.ships.values()) {
      const mine = s.owner === p.id;
      if (!mine && (!v || Math.abs(s.x - v.x) > half || Math.abs(s.y - v.y) > half)) continue;
      const e = { id: s.id, type: s.type, x: +s.x.toFixed(4), y: +s.y.toFixed(4), h: +s.h.toFixed(3), mine };
      if (mine) {
        e.pilot = s.pilot; e.hp = s.hp; e.shield = s.shield; e.moving = s.moving; if (s.moving) { e.tx = +s.tx.toFixed(4); e.ty = +s.ty.toFixed(4); }
        if (s.dest) { e.dest = s.dest; if (s.warpReq) e.warpReq = true; }
        if (s.drift) e.drift = true;
      }
      if (s.wp) e.warp = { to: s.wp.poi, p: +Math.min(1, (this.simAt - s.wp.at) / s.wp.dur).toFixed(3), fx: +s.wp.fx.toFixed(2), fy: +s.wp.fy.toFixed(2), tx: +s.wp.tx.toFixed(2), ty: +s.wp.ty.toFixed(2) };
      ships.push(e);
    }
    return { t: "snap", st: this.simAt, ships };
  }
}
