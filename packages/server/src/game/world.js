import {
  WARP_OPEN_MS, WARP_MIN_KM, WARP_EXIT_SHOW_MS, WARP_EXIT_FX_MS, WARP_STOP_MS,
  SHIP_TYPES, SHIP_ARRIVE_EPS_KM,
  WARP_MULT, DOCK_RADIUS_KM, LASER_M3_PER_S, MINING_CYCLE_MS, LASER_RANGE_KM, AUTO_MINER_BASE_MS, AUTO_MINER_STEP_MS, STATION_HANGAR_M3,
  STATION_BAY, UNDOCK_STOP_KM, stackPenalty, WARP_AU_PER_S, WARP_POI_BASE_MS, BELTS_MIN, PLAYERS_PER_BELT, BELT_LIFE_MIN_MS, BELT_LIFE_MAX_MS, LOGOUT_GRACE_MS,
} from "./constants.js";
import * as Inv from "./inventory.js";
import { getLicense, hullEfficiency } from "../licenses.js";
import { fixedPois, freeSpot, createBeltField, POI_SIZE_KM, auDist } from "./expanse.js";

const STATION = "station";                 // the station POI; the station itself sits at its centre
const HANGARS = 4;
// jettison cans (owner): only their owner can open them for 30 minutes, then anyone can for 10 more, then they're gone
const CAN_PRIVATE_MS = 30 * 60 * 1000, CAN_PUBLIC_MS = 10 * 60 * 1000, CAN_LIFE_MS = CAN_PRIVATE_MS + CAN_PUBLIC_MS, CAN_COOLDOWN_MS = 30 * 60 * 1000, CAN_M3 = 15000, CAN_RANGE_KM = 2.5;
// Running hot: power past the capacitor builds heat (faster the further over); once heat is full, every
// powered module loses integrity; at 0 it burns out (offline until the ship docks). Under the limit, heat cools.
const HEAT_PER_S = 6;        // heat %/s at 100% over capacity (scales with how far over)
const COOL_PER_S = 5;        // heat %/s lost while within capacity
const BURN_PER_S = 4;        // integrity %/s per powered module at full heat and 100% over (min 1 %/s)

const shipLabel = (sh) => sh.name || (SHIP_TYPES[sh.type] || {}).name || "Ship";

export class World {
  constructor() {
    this.players = new Map(); // pid -> {id,name,send,offline,view}
    this.ships = new Map();   // sid -> ship; ship.sys = the POI it's in (null while warping between POIs)
    this.cans = new Map();    // jettison cans floating in a POI: id -> { id, owner, ownerName, sys, x, y, inv, publicAt, expiresAt }
    this.pois = new Map();    // the Expanse's points of interest: id -> { id, kind, name, ax, ay (AU), r (km), fixed, field?, expiresAt?, hidden?, owner? }
    for (const p of fixedPois()) this.pois.set(p.id, p);
    this.poiVer = 1; this.nextBelts = 0;
  }

  addPlayer(id, name, send, saved = null) {
    const existing = this.players.get(id);
    if (existing) { existing.send = send; existing.offline = false; existing.name = name; this._ensureShips(id); return existing; }
    const now = Date.now();
    const p = { id, name, send, offline: false, view: null, hangars: null, invDirty: false, credits: 0, licenses: (saved && saved.licenses) || {}, unlocked: (saved && saved.unlocked) || {}, pilots: [] };
    this.players.set(id, p);
    // Logging in (owner): ships come back where they were. One whose POI is gone arrives at a random point outside
    // any POI, inside a small unmarked POI made around them.
    let spawn = null;
    for (const sh of (saved && saved.ships) || []) {
      const rec = { ...sh, owner: id, wp: null, warp: false };
      const poi = rec.docked ? this.pois.get(STATION) : this.pois.get(rec.sys);
      if (rec.docked) rec.sys = STATION;
      else if (!poi || poi.retired) {
        spawn ||= this._newPoi("spawn", { owner: id });
        const a = Math.random() * Math.PI * 2, d = Math.random() * spawn.r * 0.5;
        Object.assign(rec, { sys: spawn.id, x: +(Math.cos(a) * d).toFixed(3), y: +(Math.sin(a) * d).toFixed(3), moving: false, targets: [], lasers: [] });
        rec.tx = rec.x; rec.ty = rec.y;
      } else { const c = this._clamp(rec.sys, rec.x, rec.y); rec.x = c.x; rec.y = c.y; if (!Number.isFinite(rec.tx)) { rec.tx = rec.x; rec.ty = rec.y; } }
      this.ships.set(sh.id, this._hydrateShip(rec));
    }
    // four renameable station hangars
    p.jetUntil = (saved && saved.jetUntil) || 0;
    for (const c of (saved && saved.cans) || []) if (c.expiresAt > now && this.pois.has(c.sys)) this.cans.set(c.id, { ...c, owner: id, publicAt: c.publicAt || c.expiresAt - CAN_PUBLIC_MS });
    p.hangars = (saved && Array.isArray(saved.hangars) && saved.hangars.length) ? saved.hangars
      : [0, 1, 2, 3].map((i) => ({ name: "Hangar " + (i + 1), inv: Inv.makeInv(STATION_HANGAR_M3) }));
    p.delivery = (saved && saved.delivery) || Inv.makeInv(STATION_HANGAR_M3);   // market purchases land here
    while (p.hangars.length < HANGARS) p.hangars.push({ name: "Hangar " + (p.hangars.length + 1), inv: Inv.makeInv(STATION_HANGAR_M3) });
    this._ensureShips(id);
    return p;
  }

  /** Everything about a player worth keeping across logins and restarts. */
  exportState(id) {
    const ships = [...this.ships.values()].filter((s) => s.owner === id).map((s) => {
      const poiWarp = s.wp && s.wp.ph === "poi";            // logging out mid-warp: it arrives where it was going
      return { id: s.id, type: s.type, x: poiWarp ? 0 : s.x, y: poiWarp ? 0 : s.y, tx: s.tx, ty: s.ty, moving: false, h: s.h, docked: s.docked, sys: poiWarp ? s.wp.to : s.sys, fit: s.fit, heat: s.heat || 0, lasers: s.lasers, auto: s.auto, targets: s.targets, inv: s.inv, hp: s.hp, shield: s.shield, pilot: s.pilot, name: s.name };
    });
    const p = this.players.get(id);
    return { ships, hangars: p ? p.hangars : null, delivery: p ? p.delivery : null, jetUntil: p ? p.jetUntil : 0, cans: [...this.cans.values()].filter((c) => c.owner === id), licenses: p ? p.licenses : {}, unlocked: p ? p.unlocked : {}, savedAt: Date.now() };
  }

  // Fill in live/derived ship fields from a saved or fresh record.
  _hydrateShip(sh) {
    const t = SHIP_TYPES[sh.type] || SHIP_TYPES.chisel;
    const fit = Array.isArray(sh.fit) ? sh.fit.filter((f) => f && Inv.MODULES[f.item]).map((f) => ({ item: f.item, hp: Number.isFinite(f.hp) ? f.hp : 100, burnt: !!f.burnt, slot: Number.isInteger(f.slot) ? f.slot : -1, off: !!f.off })) : [];
    this._fixSlots({ type: sh.type, fit });
    const nLasers = fit.filter((f) => Inv.MODULES[f.item].role === "laser").length;
    const out = {
      ...sh, vx: 0, vy: 0, speed: t.speedKmps, prop: { fi: -1, poweredAt: 0 }, drones: { on: false }, accel: t.accelKmps2 || 0.1, radius: t.radiusKm, mass: t.mass, fit,
      docked: !!sh.docked, warp: false, wp: null, lasers: Array.from({ length: nLasers }, (_, i) => ({ on: false, off: false, repeat: true, rock: null, hp: 0, ax: 0, ay: 0, start: 0, until: 0, ...((Array.isArray(sh.lasers) && sh.lasers[i]) || {}) })),
      auto: { on: false, off: false, next: 0, ...(sh.auto || {}) },
      hp: Number.isFinite(sh.hp) ? Math.min(sh.hp, t.hp) : t.hp, shield: Number.isFinite(sh.shield) ? Math.min(sh.shield, t.shield) : t.shield,
      targets: (sh.targets || []).map((tg) => ({ ...tg })),
      inv: { cargo: sh.inv?.cargo || Inv.makeInv(t.cargoM3), ore: sh.inv?.ore || Inv.makeInv(t.oreM3) },
    };
    this._applyHolds(out);
    return out;
  }
  // Upgrades (owner: diminishing returns): the total bonus of every fitted upgrade of one kind, stacking-penalized
  _upgrade(sh, stat) { let n = 0, sum = 0; for (const f of sh.fit) { const m = Inv.MODULES[f.item]; if (m.role === "upgrade" && m.stat === stat) sum += m.bonus * stackPenalty(n++); } return sum; }
  _applyHolds(sh) { const t = SHIP_TYPES[sh.type] || SHIP_TYPES.chisel, k = 1 + this._upgrade(sh, "hold"); sh.inv.cargo.cap = Math.round(t.cargoM3 * k); sh.inv.ore.cap = Math.round(t.oreM3 * k); }

  // A new player starts with a Prospector docked at the Expanse's station.
  _ensureShips(id) {
    for (const s of this.ships.values()) if (s.owner === id) return;
    const sid = `${id}:ship:0`;
    this.ships.set(sid, this._hydrateShip({ id: sid, owner: id, sys: STATION, type: "chisel", x: 0, y: 0, tx: 0, ty: 0, moving: false, h: Math.PI / 2, docked: true,
      fit: [{ item: "module:mining_laser" }, { item: "module:mining_laser" }] }));   // a new player's first Prospector comes with 2 mining lasers
  }

  // Logging off (owner: no logged-off presence): after a short grace for reloads the player's fleet leaves the world.
  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    p.offline = true; p.offlineSince = Date.now(); p.send = () => {};
  }
  _purge(id) {
    if (this.onBeforePurge) { try { this.onBeforePurge(id); } catch (e) { console.error("onBeforePurge", e); } }
    for (const [sid, s] of this.ships) if (s.owner === id) this.ships.delete(sid);
    for (const [cid, c] of this.cans) if (c.owner === id) this.cans.delete(cid);
    this.players.delete(id);
  }

  // ---- commands ----
  // which POI the player's camera is on: they get full updates for it (and their own ships everywhere). Only a POI
  // where they have a ship counts (owner): nobody sees into a POI from outside.
  cmdView(pid, poiId) {
    const p = this.players.get(pid); if (!p) return;
    p.view = typeof poiId === "string" && this.pois.has(poiId) && this._hasShipsIn(poiId, pid) ? poiId : null;
  }
  // sys: the system the order was given in (ships elsewhere ignore it); the point is local to that system
  cmdMove(pid, shipIds, x, y, sys) {
    if (!Array.isArray(shipIds)) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const owned = shipIds.map((sid) => this.ships.get(sid)).filter((s) => s && s.owner === pid && (typeof sys !== "string" || s.sys === sys));
    if (!owned.length) return;
    for (const s of owned) { if (s.docked || this._inWarp(s)) continue; const t = this._clamp(s.sys, x, y); s.tx = t.x; s.ty = t.y; s.moving = true; s.warp = false; if (s.wp && s.wp.ph === "exit") s.wp.free = true; else s.wp = null; }
  }

  // ---- targeting / mining / docking / warp ----
  _fieldOf(sys) { const poi = this.pois.get(sys); return poi ? poi.field || null : null; }
  _rockOf(sys, rockId) {
    const field = this._fieldOf(sys); if (!field || typeof rockId !== "string") return null;
    const r = field.rocks.find((x) => x.id === rockId); return r ? { rock: r, field } : null;
  }
  // inside a POI's boundary circle
  _clamp(sys, x, y) {
    const poi = this.pois.get(sys), R = poi ? poi.r : 25, d = Math.hypot(x, y);
    return d <= R ? { x, y } : { x: x / d * R, y: y / d * R };
  }
  // where a ship's target is, in the ship's own POI (targets elsewhere don't exist for it)
  _targetPos(sh, tg) {
    if (tg.kind === "rock") { const f = this._rockOf(sh.sys, tg.id); return f ? { x: f.rock.x, y: f.rock.y } : null; }
    if (tg.kind === "ship") { const o = this.ships.get(tg.id); return o && o.sys && o.sys === sh.sys && !o.docked ? { x: o.x, y: o.y } : null; }
    if (tg.kind === "station") return sh.sys === STATION ? { x: 0, y: 0 } : null;
    if (tg.kind === "gate") { const poi = this.pois.get(sh.sys); return poi && poi.kind === "gate" && tg.id === poi.id ? { x: 0, y: 0 } : null; }
    return null;
  }
  cmdLock(pid, shipId, kind, id) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid || sh.docked) return;
    const t = SHIP_TYPES[sh.type];
    const i = sh.targets.findIndex((tg) => tg.kind === kind && tg.id === id);
    if (i >= 0) { sh.targets.splice(i, 1); for (const L of sh.lasers) if (L.rock === id) this._laserStop(L); return; }   // toggle off: breaks any cycle on it
    if (sh.targets.length >= t.maxTargets) return;
    const pos = this._targetPos(sh, { kind, id }); if (!pos) return;
    if (Math.hypot(pos.x - sh.x, pos.y - sh.y) > t.targetRangeKm) return;                    // must be in range to begin a lock
    sh.targets.push({ kind, id, lockAt: Date.now() + t.lockMs, locked: false });
  }
  _laserStop(L) { L.on = false; L.repeat = true; L.rock = null; L.start = 0; L.until = 0; L.poweredAt = 0; }
  _laserStart(sh, L, i, rockId, f, now) {
    const t = SHIP_TYPES[sh.type];
    const a = Math.atan2(sh.y - f.rock.y, sh.x - f.rock.x) + (Math.random() - 0.5) * Math.PI * 0.9, arm = t.arms[i % t.arms.length];
    if (!L.on) L.poweredAt = now;                                    // when it took power (repeat cycles keep the original time)
    L.on = true; L.repeat = true; L.rock = rockId; L.hp = arm[Math.floor(Math.random() * arm.length)];
    const d = f.rock.r * (0.15 + Math.random() * 0.3);   // sprites are irregular with transparent margins: stay well inside the visible rock
    L.ax = +(f.rock.x + Math.cos(a) * d).toFixed(4); L.ay = +(f.rock.y + Math.sin(a) * d).toFixed(4);
    L.start = now; L.dur = this._cycleMs(sh, i); L.until = now + L.dur;
  }
  _lockedRock(sh, rockId) { return sh.targets.find((t) => t.kind === "rock" && t.locked && (rockId == null || t.id === rockId)); }
  _inLaserRange(sh, f, i = 0) { return Math.hypot(f.rock.x - sh.x, f.rock.y - sh.y) <= this._laserRange(sh, i); }
  // the module behind laser i
  _lmod(sh, i) { const f = this._modFit(sh, i); return (f && Inv.MODULES[f.item]) || Inv.MODULES["module:mining_laser"]; }
  // ---- license bonuses: they come from the pilot crewing the ship ----
  _lic(sh, key) {
    const p = this.players.get(sh.owner), pl = p && p.pilots.find((x) => String(x.id) === String(sh.pilot));
    return (pl && pl.licenses[key]) || 0;
  }
  _per(key) { const l = getLicense(key); return (l && l.per) || 0; }
  // a hull's bonus to a module stat, in % (e.g. Prospector: Mining Laser yield +20, range +5)
  _hullBonus(sh, item, stat) { const t = SHIP_TYPES[sh.type] || {}; return ((t.bonuses || {})[item] || {})[stat] || 0; }
  _laserRange(sh, i = 0) {
    const m = this._lmod(sh, i);
    return (m.range || LASER_RANGE_KM) * (1 + this._hullBonus(sh, "module:mining_laser", "range") / 100) * (1 + this._per("laser_range") * this._lic(sh, "laser_range"));
  }
  _cycleMs(sh, i = 0) { return Math.round(MINING_CYCLE_MS * Math.max(0.5, 1 - this._per("laser_cycle") * this._lic(sh, "laser_cycle"))); }
  _yieldM3s(sh, i = 0) {
    const t = SHIP_TYPES[sh.type] || {}, hullLic = Object.keys(t.req || {})[0], m = this._lmod(sh, i);
    // hull license = how efficiently the pilot flies it (Lvl 5 = 100% of the hull's yield)
    const eff = hullLic ? hullEfficiency(this._lic(sh, hullLic)) : 1;
    const base = m.yield || LASER_M3_PER_S;   // the module's base yield, boosted by the hull bonus, licenses and laser upgrades
    return base * (1 + this._hullBonus(sh, "module:mining_laser", "yield") / 100) * (1 + this._per("small_mining_laser") * this._lic(sh, "small_mining_laser")) * (1 + this._upgrade(sh, "yield")) * eff;
  }
  // All lasers at once: on -> spread over the locked rocks in range; off -> stop repeating.
  cmdMine(pid, shipId, on) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid || sh.docked) return;
    if (!on) { for (const L of sh.lasers) if (L.on) L.repeat = false; return; }
    const now = Date.now();
    const all = sh.targets.filter((tg) => tg.kind === "rock" && tg.locked).map((tg) => ({ tg, f: this._rockOf(sh.sys, tg.id) })).filter((x) => x.f);
    if (!all.length) return;
    if (!all.some((r) => Inv.canAdd(sh.inv.ore, r.f.rock.ore, 1) > 0)) { this._tell(pid, shipLabel(sh) + ": ore hold full."); return; }
    let told = false;
    sh.lasers.forEach((L, i) => {
      if (L.off || L.on) return; const rocks = all.filter((x) => this._inLaserRange(sh, x.f, i)); if (!rocks.length) return;
      if (!this._canRun(sh, i, told ? null : pid)) { told = true; return; } const r = rocks[i % rocks.length]; this._laserStart(sh, L, i, r.tg.id, r.f, now);
    });
  }
  // One laser. Active: a click toggles whether it repeats after this cycle (the cycle itself
  // runs to completion; a laser can't be retargeted mid-cycle). Idle: start on the rock.
  cmdLaser(pid, shipId, idx, on, rockId) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid || sh.docked) return;
    const L = sh.lasers[+idx]; if (!L || L.off) return;                 // powered off: nothing to activate
    if (L.on) { if (!on) L.repeat = false; return; }   // active: can be told to stop after this cycle; a stopping laser can't be re-armed until the cycle ends
    if (!on) return;
    const tg = this._lockedRock(sh, rockId); if (!tg) return;
    const f = this._rockOf(sh.sys, tg.id); if (!f || !this._inLaserRange(sh, f, +idx)) return;
    if (Inv.canAdd(sh.inv.ore, f.rock.ore, 1) <= 0) { this._tell(pid, shipLabel(sh) + ": ore hold full."); return; }
    if (!this._canRun(sh, +idx, pid)) return;
    this._laserStart(sh, L, +idx, tg.id, f, Date.now());
  }
  // Auto-miner module: on each of its cycles it puts every idle laser on the primary (first locked) rock.
  cmdAuto(pid, shipId, on) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid || sh.docked) return;
    if (!on) { sh.auto.on = false; return; }
    if (sh.auto.off || !this._hasAuto(sh)) return;             // automation runs its cycles with or without a target
    if (!this._canRun(sh, "auto", pid)) return;
    if (!sh.auto.on) sh.auto.poweredAt = Date.now();
    sh.auto.on = true; sh.auto.next = 0;                       // fires on the next tick
  }
  // Power a module on or off. Powering off an active module stops it at once (the cycle yields nothing).
  cmdPower(pid, shipId, mod, idx, on) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid) return;
    if (mod === "auto") { sh.auto.off = !on; if (!on) sh.auto.on = false; return; }
    if (mod === "prop") { const fi = Math.floor(Number(idx)), f = sh.fit[fi]; if (!f || Inv.MODULES[f.item].role !== "prop") return; f.off = !on; if (!on && sh.prop.fi === fi) this._propStop(sh); this._markInv(pid); return; }
    if (mod === "drones") { const f = this._droneFit(sh); if (!f) return; f.off = !on; if (!on) this._dronesRecall(sh); this._markInv(pid); return; }
    if (mod !== "laser") return;
    const L = sh.lasers[Math.floor(Number(idx))]; if (!L) return;
    L.off = !on; if (!on && L.on) this._laserStop(L);
  }
  // ---- fitting & capacitor ----
  _hasAuto(sh) { return sh.fit.some((f) => Inv.MODULES[f.item].role === "auto"); }
  _capMax(sh) {
    const t = SHIP_TYPES[sh.type] || {}, extra = sh.fit.reduce((a, f) => a + (Inv.MODULES[f.item].cap || 0), 0);
    return Math.round((t.capacitor + extra) * (1 + this._per("cap_management") * this._lic(sh, "cap_management")));
  }
  _capUsed(sh) {
    const autoDraw = Inv.MODULES["module:auto_miner"].draw, pf = sh.prop.fi >= 0 && sh.fit[sh.prop.fi];
    return sh.lasers.reduce((a, L, i) => a + (L.on ? this._lmod(sh, i).draw : 0), 0) + (sh.auto.on ? autoDraw : 0) + (pf ? Inv.MODULES[pf.item].draw : 0) + (sh.drones.on ? Inv.MODULES["module:mining_drones"].draw : 0);
  }
  // The fit entry behind laser n (lasers are numbered in fitting order) or the auto miner ("auto").
  _modFit(sh, which) {
    if (which === "auto") return sh.fit.find((f) => Inv.MODULES[f.item].role === "auto") || null;
    if (which === "prop") return (sh.prop.fi >= 0 && sh.fit[sh.prop.fi]) || null;
    if (which === "drones") return this._droneFit(sh);
    let n = -1; for (const f of sh.fit) if (Inv.MODULES[f.item].role === "laser" && ++n === which) return f;
    return null;
  }
  // Can this ship switch the module on? Needs the pilot's license and a module that hasn't burnt out.
  // The capacitor never refuses: power past it runs the ship hot.
  _canRun(sh, which, tellPid) {
    const f = this._modFit(sh, which), m = f && Inv.MODULES[f.item]; if (!m) return false;
    if (f.burnt) { if (tellPid) this._tell(tellPid, `${shipLabel(sh)}: that ${m.name} has burnt out. Dock to repair it.`); return false; }
    const lic = m.license;
    if (lic && this._lic(sh, lic[0]) < lic[1]) { if (tellPid) this._tell(tellPid, `${shipLabel(sh)}: the pilot needs ${(getLicense(lic[0]) || {}).name || lic[0]} ${lic[1]} to run a ${m.name}.`); return false; }
    return true;
  }
  // The powered modules that take the ship past its capacitor: power is handed out in the order modules were
  // switched on, so the ones switched on last (whose power doesn't fit under the capacity) are the overloaded ones.
  _overloaded(sh) {
    const autoDraw = Inv.MODULES["module:auto_miner"].draw, max = this._capMax(sh);
    const on = [];
    sh.lasers.forEach((L, i) => { if (L.on) on.push({ which: i, at: L.poweredAt || 0, draw: this._lmod(sh, i).draw }); });
    if (sh.auto.on) on.push({ which: "auto", at: sh.auto.poweredAt || 0, draw: autoDraw });
    if (sh.drones.on) on.push({ which: "drones", at: sh.drones.poweredAt || 0, draw: Inv.MODULES["module:mining_drones"].draw });
    if (sh.prop.fi >= 0 && sh.fit[sh.prop.fi]) on.push({ which: "prop", at: sh.prop.poweredAt || 0, draw: Inv.MODULES[sh.fit[sh.prop.fi].item].draw });
    on.sort((a, b) => a.at - b.at);
    let sum = 0; const over = [];
    for (const m of on) { sum += m.draw; if (sum > max) over.push(m.which); }
    return over;
  }
  // Heat and integrity, every tick.
  _tickHeat(sh, dtSec) {
    const max = this._capMax(sh), used = this._capUsed(sh), over = max > 0 ? (used - max) / max : (used > 0 ? 1 : 0);
    if (over <= 0) { sh.heat = Math.max(0, (sh.heat || 0) - COOL_PER_S * dtSec); return; }
    sh.heat = Math.min(100, (sh.heat || 0) + HEAT_PER_S * over * dtSec);
    if (sh.heat < 100) return;
    const loss = Math.max(1, BURN_PER_S * over) * dtSec;
    const burn = (f) => { f.hp = Math.max(0, (f.hp ?? 100) - loss); if (f.hp <= 0 && !f.burnt) { f.burnt = true; return true; } return false; };
    for (const which of this._overloaded(sh)) {                    // only the modules running past the capacity take damage
      const f = this._modFit(sh, which); if (!f || !burn(f)) continue;
      if (which === "auto") { sh.auto.on = false; this._tell(sh.owner, `${shipLabel(sh)}: Auto Miner burnt out.`); }
      else if (which === "drones") { this._tell(sh.owner, `${shipLabel(sh)}: Mining Drones burnt out.`); this._dronesRecall(sh); }
      else if (which === "prop") { this._tell(sh.owner, `${shipLabel(sh)}: ${Inv.MODULES[f.item].name} burnt out.`); this._propStop(sh); }
      else { this._laserStop(sh.lasers[which]); this._tell(sh.owner, `${shipLabel(sh)}: ${this._lmod(sh, which).name} ${which + 1} burnt out.`); }
    }
  }
  _repairModules(sh) { sh.heat = 0; for (const f of sh.fit) { f.hp = 100; f.burnt = false; } }
  // Every fitted module owns a hotbar slot (hardpoint) that never moves on its own: fitting or unfitting other
  // modules leaves it where it is; only the player rearranges them (owner). Fixes missing / clashing slots.
  _fixSlots(sh) {
    const n = Math.max((SHIP_TYPES[sh.type] || {}).fitSlots || 0, sh.fit.length), used = new Set();
    for (const f of sh.fit) { if (!Number.isInteger(f.slot) || f.slot < 0 || f.slot >= n || used.has(f.slot)) f.slot = -1; else used.add(f.slot); }
    for (const f of sh.fit) if (f.slot < 0) { let k = 0; while (used.has(k)) k++; f.slot = k; used.add(k); }
  }
  _refit(sh) {                                  // rebuild the live module state after the fit changed (always docked)
    this._fixSlots(sh);
    const n = sh.fit.filter((f) => Inv.MODULES[f.item].role === "laser").length;
    sh.lasers = Array.from({ length: n }, (_, i) => ({ on: false, off: !!(sh.lasers[i] && sh.lasers[i].off), repeat: true, rock: null, hp: 0, ax: 0, ay: 0, start: 0, until: 0 }));
    if (!this._hasAuto(sh)) sh.auto.on = false;
    this._propStop(sh); this._applyHolds(sh); if (!this._droneFit(sh)) this._dronesRecall(sh);
  }
  // ---- mining drones (owner): activating the module launches two drones, which stay out (and draw power) while it's
  // on. F sends them at the current target: they orbit it and mine in cycles until it's gone, out of range, or the hold
  // is full, then wait by the ship. Switching the module off (or docking, warping, logging off) recalls them. ----
  _droneFit(sh) { return sh.fit.find((f) => Inv.MODULES[f.item].role === "drones") || null; }
  _droneYield(sh) { const t = SHIP_TYPES[sh.type] || {}, hullLic = Object.keys(t.req || {})[0], m = Inv.MODULES["module:mining_drones"]; return m.yield * (hullLic ? hullEfficiency(this._lic(sh, hullLic)) : 1); }
  _dronesRecall(sh) { sh.drones = { on: false }; }
  cmdDrones(pid, shipId, on) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid) return;
    if (!on) { this._dronesRecall(sh); return; }
    const f = this._droneFit(sh); if (!f || f.off || sh.docked || !sh.sys || this._inWarp(sh) || sh.drones.on) return;
    if (!this._canRun(sh, "drones", pid)) return;
    sh.drones = { on: true, poweredAt: Date.now(), rock: null };
  }
  cmdDronesEngage(pid, shipId, rockId) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid || !sh.drones.on) return;
    const tg = this._lockedRock(sh, rockId); if (!tg) return;
    const f = this._rockOf(sh.sys, tg.id), m = Inv.MODULES["module:mining_drones"]; if (!f) return;
    if (Math.hypot(f.rock.x - sh.x, f.rock.y - sh.y) > m.range) { this._tell(pid, `${shipLabel(sh)}: that asteroid is out of drone range (${m.range} km).`); return; }
    if (Inv.canAdd(sh.inv.ore, f.rock.ore, 1) <= 0) { this._tell(pid, shipLabel(sh) + ": ore hold full."); return; }
    const now = Date.now(); Object.assign(sh.drones, { rock: tg.id, engagedAt: now, start: now, dur: m.cycle, until: now + m.cycle });
  }
  _tickDrones(sh, now) {
    const d = sh.drones; if (!d.on || !d.rock) return;
    const f = this._rockOf(sh.sys, d.rock), m = Inv.MODULES["module:mining_drones"], idle = () => { d.rock = null; };
    if (!f || Math.hypot(f.rock.x - sh.x, f.rock.y - sh.y) > m.range) return idle();
    if (Inv.canAdd(sh.inv.ore, f.rock.ore, 1) <= 0) { this._tell(sh.owner, shipLabel(sh) + ": ore hold full."); return idle(); }
    if (now < d.until) return;
    const def = Inv.ITEMS[f.rock.ore], units = Math.min(Math.floor(this._droneYield(sh) * d.dur / 1000 / def.unitM3), Math.ceil(f.rock.m3 / def.unitM3));
    const got = units > 0 ? Inv.add(sh.inv.ore, f.rock.ore, units) : 0;
    if (got <= 0) return idle();
    f.rock.m3 = Math.max(0, +(f.rock.m3 - got * def.unitM3).toFixed(3)); if (f.rock.m3 < def.unitM3) f.rock.m3 = 0;
    this._markInv(sh.owner);
    if (f.rock.m3 <= 0) { this._removeRock(f.field, f.rock); return idle(); }
    this._rockChanged(f.field, f.rock);
    d.start = now; d.until = now + d.dur;
  }
  // ---- propulsion (owner, like EVE): an afterburner or microwarpdrive raises top speed while it runs; one at a time ----
  _propStop(sh) { sh.prop = { fi: -1, poweredAt: 0 }; }
  _propBonus(s) { const f = s.prop && s.prop.fi >= 0 && s.fit[s.prop.fi]; return f ? Inv.MODULES[f.item].speed || 0 : 0; }
  cmdProp(pid, shipId, fi, on) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid) return;
    fi = Math.floor(Number(fi)); const f = sh.fit[fi], m = f && Inv.MODULES[f.item]; if (!m || m.role !== "prop") return;
    if (!on) { if (sh.prop.fi === fi) this._propStop(sh); return; }
    if (sh.docked || !sh.sys || this._inWarp(sh) || f.off) return;
    if (f.burnt) { this._tell(pid, `${shipLabel(sh)}: that ${m.name} has burnt out. Dock to repair it.`); return; }
    sh.prop = { fi, poweredAt: Date.now() };                   // switching one on switches any other off
  }
  cmdFit(pid, shipId, from) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid) return;
    if (!sh.docked) { this._tell(pid, "Dock to change a ship's fitting."); return; }
    const a = this._inv(pid, from); if (!a || !a.inv || !a.docked) return;
    const slot = this._slotOf(a.inv, from.slot, from.item), st = a.inv.slots[slot], m = st && Inv.MODULES[st.item]; if (!m) return;
    const t = SHIP_TYPES[sh.type];
    if (!t.accepts.includes(m.cat)) { this._tell(pid, `The ${t.name} can't fit ${m.name}s.`); return; }
    if (sh.fit.length >= t.fitSlots) { this._tell(pid, `No free hardpoints on ${shipLabel(sh)}.`); return; }
    const used = sh.fit.reduce((s2, f) => s2 + Inv.MODULES[f.item].size, 0);
    if (used + m.size > t.disposition) { this._tell(pid, `Not enough disposition on ${shipLabel(sh)} (${t.disposition - used} left, needs ${m.size}).`); return; }
    const key = st.item; if (Inv.take(a.inv, slot, 1) !== 1) return;
    const want = Math.floor(Number(from.at)), taken = new Set(sh.fit.map((f) => f.slot));   // optional: the hotbar slot it was dropped on
    sh.fit.push({ item: key, hp: 100, burnt: false, slot: Number.isInteger(want) && want >= 0 && want < t.fitSlots && !taken.has(want) ? want : -1 });
    this._refit(sh); this._markInv(pid);
  }
  // rearrange the hotbar: swap what's in two slots (either may be empty); works anywhere
  cmdFitSwap(pid, shipId, a, b) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid) return;
    const n = SHIP_TYPES[sh.type].fitSlots; a = Math.floor(Number(a)); b = Math.floor(Number(b));
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n || a === b) return;
    for (const f of sh.fit) { if (f.slot === a) f.slot = b; else if (f.slot === b) f.slot = a; }
    this._markInv(pid);
  }
  // to: optional station inventory (or this ship's own hold) to put the module in; default Hangar 1
  cmdUnfit(pid, shipId, idx, to) {
    const p = this.players.get(pid), sh = this.ships.get(shipId); if (!p || !sh || sh.owner !== pid) return;
    if (!sh.docked) { this._tell(pid, "Dock to change a ship's fitting."); return; }
    const i = Math.floor(Number(idx)), f = sh.fit[i]; if (!f) return;
    const dest = to ? this._inv(pid, to) : null, inv = dest && dest.inv && dest.docked && !dest.can ? dest.inv : p.hangars[0].inv;
    if (Inv.add(inv, f.item, 1) !== 1) { this._tell(pid, "No room for the module there."); return; }
    sh.fit.splice(i, 1); this._refit(sh); this._markInv(pid);
  }
  _autoCycleMs(sh) { const lvl = Math.max(1, this._lic(sh, "auto_miner")); return Math.max(30_000, AUTO_MINER_BASE_MS - AUTO_MINER_STEP_MS * (lvl - 1)); }
  cmdDock(pid, shipId, dock) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid) return;
    if (dock) {
      if (sh.docked || this._inWarp(sh) || sh.sys !== STATION || Math.hypot(sh.x, sh.y) > DOCK_RADIUS_KM) return;
      sh.docked = true; sh.moving = false; sh.warp = false; sh.wp = null; for (const L of sh.lasers) this._laserStop(L); sh.auto.on = false; sh.targets = []; sh.vx = sh.vy = 0; this._propStop(sh); this._dronesRecall(sh);
      sh.hp = SHIP_TYPES[sh.type].hp; sh.shield = SHIP_TYPES[sh.type].shield; this._repairModules(sh);   // docked: repaired and recharged
    } else {
      if (!sh.docked) return;
      if (!sh.pilot) { this._tell(pid, "That ship has no pilot. Crew it first."); return; }
      // undocking (owner): out of the docking bay's mouth, flying away until it stands still near the edge of the dock ring, facing away
      const a = Math.PI + (Math.random() - 0.5) * 0.7, bx = STATION_BAY.x, by = STATION_BAY.y;
      sh.docked = false; sh.sys = STATION; sh.x = bx; sh.y = by; sh.h = a; sh.vx = Math.cos(a) * sh.speed * 0.3; sh.vy = Math.sin(a) * sh.speed * 0.3;
      sh.tx = +(bx + Math.cos(a) * UNDOCK_STOP_KM).toFixed(3); sh.ty = +(by + Math.sin(a) * UNDOCK_STOP_KM).toFixed(3); sh.moving = true;
    }
    this._markInv(pid);
  }
  // Warp: align (speed up toward the destination) → at full speed a warp window opens ahead → the ship goes
  // through as a ball → comes out of a second window short of the destination at full speed → brakes to a stop.
  // (owner) no more warping point to point inside a POI: afterburners and microwarpdrives do that job
  cmdWarp() {}
  // Warp to another POI: align toward it on the map → a warp window opens ahead → the ship leaves the POI and is
  // off-POI (nothing simulated) for a time set by the map distance → it drops out at a scattered point in the target.
  cmdWarpTo(pid, shipIds, poiId) {
    if (!Array.isArray(shipIds) || typeof poiId !== "string") return;
    const dst = this.pois.get(poiId); if (!dst || !this._poiVisibleTo(dst, pid)) return;
    for (const sid of [...new Set(shipIds)].slice(0, 50)) {
      const s = this.ships.get(sid); if (!s || s.owner !== pid || s.docked || !s.sys || s.sys === poiId || this._inWarp(s)) continue;
      const src = this.pois.get(s.sys); if (!src) continue;
      for (const L of s.lasers) this._laserStop(L); s.auto.on = false; s.targets = []; this._propStop(s); this._dronesRecall(s);
      s.warp = true; s.wp = { ph: "palign", to: poiId, dir: Math.atan2(dst.ay - src.ay, dst.ax - src.ax) };
    }
    this._markInv(pid);
  }
  // Jump through a stargate (right-click it → Jump). Nomad space doesn't exist yet, so every gate is offline.
  cmdGateJump(pid, gateId, shipIds) {
    const poi = typeof gateId === "string" && this.pois.get(gateId); if (!poi || poi.kind !== "gate" || !Array.isArray(shipIds)) return;
    if (poi.state !== "active") { this._tell(pid, poi.name + " is offline."); return; }
  }
  _arrive(s, w, now) {
    let dst = this.pois.get(w.to);
    if (!dst || dst.retired) dst = this._newPoi("spawn", { owner: s.owner });   // it closed while you were on the way
    const brake = s.speed * WARP_MULT * WARP_STOP_MS / 1000 / 3;
    let { tx, ty } = w; if (!Number.isFinite(tx) || Math.hypot(tx, ty) > dst.r) { const a = Math.random() * Math.PI * 2, d = dst.r * (0.15 + Math.random() * 0.35); tx = Math.cos(a) * d; ty = Math.sin(a) * d; }
    const ex = tx - Math.cos(w.dir) * brake, ey = ty - Math.sin(w.dir) * brake;
    s.sys = dst.id; s.x = ex; s.y = ey; s.tx = tx; s.ty = ty; s.vx = 0; s.vy = 0; s.warp = false; s.moving = true;
    s.wp = { ph: "exit", at: now, dir: w.dir, fx: ex, fy: ey, ex, ey, tx, ty, stop: brake, dur: 0, arrived: true };
    this._markInv(s.owner);
  }
  _inWarp(s) { return !!(s.wp && (s.wp.ph === "open" || s.wp.ph === "transit" || s.wp.ph === "poi")); }
  _warpTick(s, now) {
    const w = s.wp; if (!w) return false;
    if (w.ph === "poi") { if (now - w.at >= w.dur) this._arrive(s, w, now); return true; }   // off-POI: not simulated
    if (w.ph === "palign") {                                                   // speeding up toward the target POI's bearing
      const ux = Math.cos(w.dir), uy = Math.sin(w.dir), v = Math.hypot(s.vx, s.vy);
      s.tx = s.x + ux * 50; s.ty = s.y + uy * 50; s.moving = true;
      if (v < s.speed * 0.97 || (s.vx * ux + s.vy * uy) / v < 0.995) return false;
      const lead = s.speed * WARP_OPEN_MS / 1000;
      s.wp = { ph: "open", to: w.to, at: now, dir: w.dir, fx: s.x + ux * lead, fy: s.y + uy * lead };
      return false;
    }
    if (w.ph === "align") {
      const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), v = Math.hypot(s.vx, s.vy);
      if (!s.moving || d < 1e-6) { s.wp = null; s.warp = false; return false; }
      if (v < s.speed * 0.97 || (s.vx * dx + s.vy * dy) / (v * d) < 0.995) return false;   // not at full speed / not lined up yet
      const ux = dx / d, uy = dy / d, lead = s.speed * WARP_OPEN_MS / 1000, brake = s.speed * WARP_MULT * WARP_STOP_MS / 1000 / 3;   // the drop-out stop covers v·T/3 (cubic ease-out from full warp speed)
      const L = d - lead - brake;
      if (L < WARP_MIN_KM) { s.wp = null; s.warp = false; return false; }                   // too short a hop: just fly there
      s.wp = { ph: "open", at: now, dir: Math.atan2(uy, ux), fx: s.x + ux * lead, fy: s.y + uy * lead, ex: s.tx - ux * brake, ey: s.ty - uy * brake, tx: s.tx, ty: s.ty, stop: brake,
        dur: Math.max(1, Math.round(L / (s.speed * WARP_MULT) * 1000)) };   // constant warp speed inside the field
      return false;
    }
    if (w.ph === "open") {
      if (now - w.at < WARP_OPEN_MS) return false;                                         // coasting into the window at full speed
      if (w.to) {                                                                          // into the window: gone from this POI
        const src = this.pois.get(s.sys), dst = this.pois.get(w.to), d = src && dst ? auDist(src, dst) : 0.3;
        // the drop-out point is picked now, so the ball's path across the map ends exactly at the exit window
        const a = Math.random() * Math.PI * 2, r = (dst ? dst.r : 25) * (0.15 + Math.random() * 0.35), tx = Math.cos(a) * r, ty = Math.sin(a) * r;
        const brake = s.speed * WARP_MULT * WARP_STOP_MS / 1000 / 3, ex = tx - Math.cos(w.dir) * brake, ey = ty - Math.sin(w.dir) * brake;
        s.wp = { ph: "poi", from: s.sys, to: w.to, at: now, dur: Math.round(WARP_POI_BASE_MS + d / WARP_AU_PER_S * 1000), dir: w.dir, fx: w.fx, fy: w.fy, tx, ty, ex, ey };
        s.sys = null; s.x = 0; s.y = 0; s.vx = 0; s.vy = 0; s.moving = false; s.targets = [];
        this._markInv(s.owner); return true;
      }
      w.ph = "transit"; w.at = now; s.x = w.fx; s.y = w.fy;
    }
    if (w.ph === "transit") {
      const u = Math.min(1, (now - w.at) / w.dur), e = u;                                                   // full warp speed the whole way through, no easing (owner)
      s.x = w.fx + (w.ex - w.fx) * e; s.y = w.fy + (w.ey - w.fy) * e; s.h = w.dir; s.vx = 0; s.vy = 0;
      if (u >= 1) { w.ph = "exit"; w.at = now; s.x = w.ex; s.y = w.ey; s.warp = false; }
      return true;                                                                            // position is scripted this tick
    }
    if (w.ph === "exit") {                                                                    // out at full speed, then a hard stop to dead still on the destination
      const T = WARP_STOP_MS, t = now - w.at;
      if (t < T && !w.free) {   // out of the field at warp speed, braking to dead still outside it
        const u = t / T, e = 1 - (1 - u) ** 3, v = s.speed * WARP_MULT * (1 - u) ** 2, cx = Math.cos(w.dir), cy = Math.sin(w.dir);
        s.x = w.ex + cx * w.stop * e; s.y = w.ey + cy * w.stop * e; s.vx = cx * v; s.vy = cy * v; s.h = w.dir; s.moving = true;
        return true;
      }
      if (!w.free) { w.free = true; s.x = w.tx; s.y = w.ty; s.vx = 0; s.vy = 0; s.moving = false; }
      if (t >= WARP_EXIT_FX_MS) s.wp = null;
    }
    return false;
  }
  _inv(pid, ref) {
    const p = this.players.get(pid); if (!p || !ref || typeof ref !== "object") return null;
    if (ref.owner === "can") { const c = this.cans.get(ref.id); return c ? { inv: c.inv, can: c } : null; }
    if (ref.owner === "station" && ref.inv === "delivery") return { inv: p.delivery, docked: true };
    if (ref.owner === "station") { const h = p.hangars[Math.max(0, Math.min(p.hangars.length - 1, (ref.h | 0)))]; return { inv: h.inv, docked: true }; }
    if (ref.owner !== "ship" || (ref.inv !== "ore" && ref.inv !== "cargo")) return null;
    const sh = this.ships.get(ref.id); if (!sh || sh.owner !== pid) return null;
    return { inv: sh.inv[ref.inv], docked: sh.docked, ship: sh };
  }
  // The client names the item it meant: if the stacks shifted under it (a sort, a merge, another tab),
  // find that item rather than acting on whatever now sits in the slot.
  _slotOf(inv, slot, item) {
    const i = Math.floor(Number(slot));
    if (typeof item !== "string") return inv.slots[i] ? i : -1;
    if (inv.slots[i] && inv.slots[i].item === item) return i;
    return inv.slots.findIndex((st) => st.item === item);
  }
  cmdInvMove(pid, from, to, qty) {
    const a = this._inv(pid, from), b = this._inv(pid, to); if (!a || !a.inv || !b || !b.inv) return;
    // transfers between different holders: both docked (station <-> ship, ship <-> ship), or a ship in space
    // within 2.5 km of a jettison can
    const sameHolder = from.owner === to.owner && (from.owner === "station" || from.id === to.id);
    const canEnd = a.can || b.can, shipEnd = a.can ? b : a;
    if (!sameHolder) {
      if (canEnd) {
        if (!this._canOpen(pid, canEnd)) { this._tell(pid, "Only " + canEnd.ownerName + " can open that can for " + Math.ceil((canEnd.publicAt - Date.now()) / 60000) + " more min."); return; }
        if (!shipEnd.ship || shipEnd.ship.docked || shipEnd.ship.sys !== canEnd.sys || Math.hypot(shipEnd.ship.x - canEnd.x, shipEnd.ship.y - canEnd.y) > CAN_RANGE_KM) { this._tell(pid, "Get within " + CAN_RANGE_KM + " km of the can."); return; }
      } else if (!(a.docked && b.docked)) return;
    }
    const fi = this._slotOf(a.inv, from.slot, from.item); if (fi < 0) return;
    if (Inv.move(a.inv, fi, b.inv, to.slot == null ? null : +to.slot, qty) > 0) { this._markInv(pid); if (canEnd) this._canChanged(canEnd); }
  }
  // Sell ore straight out of the hangar or a docked ship's hold. Credits are kept on the
  // user row; onCredits(pid, delta) persists the change.
  cmdSell(pid, ref, slot, qty, item) {
    const a = this._inv(pid, ref); if (!a || !a.inv || !a.docked) return;
    slot = this._slotOf(a.inv, slot, item); const st = a.inv.slots[slot]; if (!st) return;
    const def = Inv.ITEMS[st.item]; if (!def || !def.price || def.kind !== "ore") return;   // only ore sells; manuals are consumed, ships are assembled
    const n = Inv.take(a.inv, +slot, qty == null ? st.qty : +qty); if (n <= 0) return;
    const p = this.players.get(pid), delta = n * def.price;
    p.credits += delta; this._markInv(pid);
    if (this.onCredits) { try { this.onCredits(pid, delta); } catch (e) { console.error("onCredits", e); } }
  }
  cmdInvSplit(pid, ref, slot, qty, item) { const a = this._inv(pid, ref); if (a && a.inv && Inv.split(a.inv, this._slotOf(a.inv, slot, item), qty) > 0) this._markInv(pid); }
  // Jettison: items go into a new can floating beside the ship. One can every 30 minutes per pilot
  // account (destroying your can lifts that), cans hold 15,000 m³ and drift away after 30 minutes.
  cmdJettison(pid, ref, slot, qty, item) {
    const p = this.players.get(pid), a = this._inv(pid, ref); if (!p || !a || !a.inv || !a.ship) return;
    const sh = a.ship; if (sh.docked) { this._tell(pid, "Undock to jettison."); return; } if (!sh.sys || this._inWarp(sh)) return;
    slot = this._slotOf(a.inv, slot, item); const st = a.inv.slots[slot]; if (!st) return;
    const now = Date.now();
    if (now < p.jetUntil) { const m = Math.ceil((p.jetUntil - now) / 60000); this._tell(pid, `You can jettison again in ${m} min. Open your can to add more, or destroy it.`); return; }
    const can = { id: "can:" + pid + ":" + now.toString(36), owner: pid, ownerName: p.name, sys: sh.sys, x: +(sh.x + 0.25).toFixed(4), y: +(sh.y - 0.2).toFixed(4), inv: Inv.makeInv(CAN_M3), publicAt: now + CAN_PRIVATE_MS, expiresAt: now + CAN_LIFE_MS };
    const moved = Inv.move(a.inv, slot, can.inv, null, qty == null ? st.qty : qty);
    if (moved <= 0) { this._tell(pid, "That won't fit in a can."); return; }
    this.cans.set(can.id, can); p.jetUntil = now + CAN_COOLDOWN_MS; this._markInv(pid); this._canChanged(can);
  }
  // Destroy a can: anyone may destroy an empty can; its owner may destroy it with things inside.
  cmdDestroyCan(pid, canId) {
    const c = this.cans.get(canId); if (!c) return;
    if (c.inv.slots.length && c.owner !== pid) { this._tell(pid, "Only the owner can destroy a can that still holds items."); return; }
    this._removeCan(c);
  }
  _removeCan(c) {
    this.cans.delete(c.id);
    const o = this.players.get(c.owner); if (o) o.jetUntil = 0;           // its owner may jettison again right away
    this._canChanged(c);
  }
  _canOpen(pid, c) { return c.owner === pid || Date.now() >= (c.publicAt || 0); }
  _canChanged(c) { for (const p of this.players.values()) if (this._visibleSystems(p.id).has(c.sys)) p.invDirty = true; }
  // Rename one ship (its hull type stays what it is).
  cmdRenameShip(pid, shipId, name) {
    if (name != null && typeof name !== "string") return;
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid) return;
    const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, 20);
    sh.name = clean || null; this._markInv(pid);
  }
  // Station market: buy into the hangar.
  cmdBuy(pid, itemKey, qty) {
    const p = this.players.get(pid); if (!p) return;
    const offer = Inv.MARKET.find((m) => m.key === itemKey); if (!offer) return;
    const n = Math.max(1, Math.min(1_000_000, Math.floor(+qty || 1))), cost = offer.price * n;
    if (p.credits < cost) { p.send(JSON.stringify({ t: "sys", text: "Not enough credits." })); return; }
    { if (Inv.canAdd(p.delivery, itemKey, n) < n) { this._tell(pid, "The station's delivery container is full."); return; } Inv.add(p.delivery, itemKey, n); this._tell(pid, offer.name + " delivered to your station's Deliveries."); }
    p.credits -= cost; this._markInv(pid);
    if (this.onCredits) { try { this.onCredits(pid, -cost); } catch (e) { console.error("onCredits", e); } }
  }
  // Read a training manual: consumes it and unlocks that license for training.
  cmdRead(pid, ref, slot, item) {
    const a = this._inv(pid, ref); if (!a || !a.inv) return false;
    slot = this._slotOf(a.inv, slot, item); const st = a.inv.slots[slot]; const def = st && Inv.ITEMS[st.item]; if (!def || def.kind !== "manual") return false;
    const p = this.players.get(pid);
    if (p.unlocked[def.license]) { p.send(JSON.stringify({ t: "sys", text: "You already know this manual." })); return false; }
    Inv.take(a.inv, slot, 1); p.unlocked[def.license] = true; this._markInv(pid);
    p.send(JSON.stringify({ t: "sys", text: def.name.replace(" Manual", "") + " can now be trained." }));
    return true;
  }
  _tell(pid, text) { const p = this.players.get(pid); if (p) p.send(JSON.stringify({ t: "sys", text })); }
  // A pilot can crew a docked ship if their licenses cover the hull; a pilot already
  // in another docked ship walks across the station. Ships in space keep their pilot.
  cmdCrew(pid, shipId, pilotId) {
    const p = this.players.get(pid), sh = this.ships.get(shipId); if (!p || !sh || sh.owner !== pid) return;
    if (!sh.docked) { this._tell(pid, "Dock the ship to change its crew."); return; }
    const pl = p.pilots.find((x) => String(x.id) === String(pilotId)); if (!pl) return;
    const t = SHIP_TYPES[sh.type] || {};
    const missing = Object.entries(t.req || {}).filter(([k, lvl]) => (pl.licenses[k] || 0) < lvl);
    if (missing.length) { this._tell(pid, `${pl.name} can't fly the ${t.name}: needs ${missing.map(([k, l]) => k.replace(/_/g, " ") + " " + l).join(", ")}.`); return; }
    for (const o of this.ships.values()) if (o.owner === pid && o !== sh && String(o.pilot) === String(pl.id)) {
      if (!o.docked) { this._tell(pid, `${pl.name} is flying a ship in space.`); return; }
      o.pilot = null;
    }
    sh.pilot = pl.id; this._markInv(pid);
  }
  cmdDecrew(pid, shipId) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid) return;
    if (!sh.docked) { this._tell(pid, "Dock the ship to change its crew."); return; }
    sh.pilot = null; this._markInv(pid);
  }
  // Ships the player had before crewing existed get their first free pilot.
  assignDefaultPilots(pid) {
    const p = this.players.get(pid); if (!p || !p.pilots.length) return;
    const taken = new Set([...this.ships.values()].filter((s) => s.owner === pid && s.pilot != null).map((s) => String(s.pilot)));
    for (const s of this.ships.values()) {
      if (s.owner !== pid || s.pilot !== undefined) continue;
      const free = p.pilots.find((x) => !taken.has(String(x.id)));
      s.pilot = free ? free.id : null; if (free) taken.add(String(free.id));
    }
  }
  _buyShip(p, type) {
    let n = 0; while (this.ships.has(`${p.id}:ship:${n}`)) n++;
    const id = `${p.id}:ship:${n}`;
    this.ships.set(id, this._hydrateShip({ id, owner: p.id, sys: STATION, type, x: 0, y: 0, tx: 0, ty: 0, moving: false, h: Math.PI / 2, docked: true, pilot: null, fit: [] }));   // new ships come with nothing fitted
  }
  // Unpack a packaged ship sitting in a station container into a docked, uncrewed ship.
  cmdAssemble(pid, ref, slot, item) {
    const p = this.players.get(pid), a = this._inv(pid, ref); if (!p || !a || !a.inv || ref.owner !== "station") return;
    slot = this._slotOf(a.inv, slot, item); const st = a.inv.slots[slot], def = st && Inv.ITEMS[st.item]; if (!def || def.kind !== "ship") return;
    Inv.take(a.inv, slot, 1); this._buyShip(p, def.ship); this._markInv(pid);
    this._tell(pid, `${def.name} assembled. Crew it from the station's ship list.`);
  }
  cmdRenameHangar(pid, h, name) {
    if (typeof name !== "string") return;
    const p = this.players.get(pid), hg = p && p.hangars[h | 0]; if (!hg) return;
    const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, 20); if (!clean) return;
    hg.name = clean; this._markInv(pid);
  }
  cmdInvSort(pid, ref) { const a = this._inv(pid, ref); if (a && a.inv) { Inv.sort(a.inv); this._markInv(pid); } }
  _markInv(pid) { const p = this.players.get(pid); if (p) p.invDirty = true; }
  inventoriesFor(pid) {
    const p = this.players.get(pid); if (!p) return null;
    const ships = {};
    for (const sh of this.ships.values()) if (sh.owner === pid) ships[sh.id] = { cargo: Inv.summary(sh.inv.cargo), ore: Inv.summary(sh.inv.ore), fit: sh.fit.map((f) => f.item), slots: sh.fit.map((f) => f.slot) };
    const vis = this._visibleSystems(pid), cans = {};
    for (const c of this.cans.values()) if (vis.has(c.sys) && this._canOpen(pid, c)) cans[c.id] = { ...Inv.summary(c.inv) };
    return { t: "inv", ships, cans, jetUntil: p.jetUntil, hangars: p.hangars.map((h) => ({ name: h.name, ...Inv.summary(h.inv) })), delivery: Inv.summary(p.delivery), credits: p.credits, unlocked: p.unlocked };
  }

  cmdChat(pid, text, channel, to) {
    const p = this.players.get(pid);
    if (!p || typeof text !== "string") return;
    const clean = text.trim().slice(0, 240); if (!clean) return;

    if (channel === "whisper") {
      const target = String(to || "").trim();
      if (!target) return;
      const now = Date.now();
      const msg = JSON.stringify({ t: "chat", ch: "whisper", from: p.name, to: target, text: clean, ts: now });
      let delivered = false;
      for (const other of this.players.values()) {
        if (other.offline || other.name !== target) continue;
        other.send(msg); delivered = true;
      }
      p.send(msg); // echo to sender so it shows in their whisper thread
      if (!delivered) p.send(JSON.stringify({ t: "sys", text: `${target} is not online.` }));
      return;
    }

    const ch = channel === "corp" ? "corp" : "local";
    const msg = JSON.stringify({ t: "chat", ch, from: p.name, text: clean, ts: Date.now() });
    if (ch === "corp") {
      // Everyone is in Delve Holdings for now, so corp chat reaches all online players.
      for (const other of this.players.values()) if (!other.offline) other.send(msg);
    } else {                                            // local: the whole Expanse
      for (const other of this.players.values()) if (!other.offline) other.send(msg);
    }
  }

  // ---- POIs (docs/DESIGN.md › The Expanse) ----
  // A hidden POI (a spawn-in POI, or a belt held open by players after its time ran out) has no map marker:
  // only players with ships inside see it.
  _hasShipsIn(poiId, pid) { for (const s of this.ships.values()) if (s.sys === poiId && (pid == null || s.owner === pid)) return true; return false; }
  _poiVisibleTo(poi, pid) { return !!poi && (!poi.hidden || this._hasShipsIn(poi.id, pid)); }
  _newPoi(kind, extra = {}) {
    const now = Date.now(), id = kind + ":" + now.toString(36) + Math.floor(Math.random() * 1296).toString(36);
    const spot = kind === "belt" ? freeSpot(this.pois.values(), 0.12, 0.44) : freeSpot(this.pois.values(), 0.06, 0.45);
    const poi = { id, kind, name: kind === "belt" ? "Asteroid Belt " + id.slice(-3).toUpperCase() : "Deep Space", ...spot, r: POI_SIZE_KM[kind] / 2, fixed: false, createdAt: now, ...extra };
    if (kind === "belt") { poi.field = createBeltField(id, poi.r); poi.expiresAt = now + BELT_LIFE_MIN_MS + Math.random() * (BELT_LIFE_MAX_MS - BELT_LIFE_MIN_MS); }
    if (kind === "spawn") poi.hidden = true;
    this.pois.set(id, poi); this.poiVer++;
    return poi;
  }
  _removePoi(poi) {
    for (const c of [...this.cans.values()]) if (c.sys === poi.id) this.cans.delete(c.id);
    this.pois.delete(poi.id); this.poiVer++;
    if (this.onPoiClosed) { try { this.onPoiClosed(poi); } catch (e) { console.error("onPoiClosed", e); } }
  }
  // Belts by population (owner): one per PLAYERS_PER_BELT online, at least BELTS_MIN. A belt whose hidden lifetime ran
  // out (or that's mined out) leaves the map at once but stays open until nobody is inside; it no longer counts, so a
  // replacement spawns. A spawn-in POI goes once its player has left it.
  _maintainPois(now = Date.now()) {
    for (const poi of [...this.pois.values()]) {
      if (poi.fixed) continue;
      if (poi.kind === "belt" && !poi.retired && (now >= poi.expiresAt || !poi.field.rocks.length)) { poi.retired = true; poi.hidden = true; this.poiVer++; }
      if ((poi.retired || poi.kind === "spawn") && now - (poi.createdAt || 0) > 5000 && !this._hasShipsIn(poi.id)) this._removePoi(poi);
    }
    let online = 0; for (const p of this.players.values()) if (!p.offline) online++;
    const want = Math.max(BELTS_MIN, Math.ceil(online / PLAYERS_PER_BELT));
    let have = 0; for (const poi of this.pois.values()) if (poi.kind === "belt" && !poi.retired) have++;
    for (; have < want; have++) this._newPoi("belt");
  }
  // the POI list one player's map shows; sig changes when it does
  poiSig(p) { let sig = String(this.poiVer); for (const poi of this.pois.values()) if (poi.hidden && this._hasShipsIn(poi.id, p.id)) sig += "," + poi.id; return sig; }
  poisFor(p) {
    const out = [];
    for (const poi of this.pois.values()) {
      if (!this._poiVisibleTo(poi, p.id)) continue;
      const e = { id: poi.id, kind: poi.kind, name: poi.name, ax: poi.ax, ay: poi.ay, r: poi.r };
      if (poi.hidden) e.hidden = true;
      if (poi.state) e.state = poi.state;
      if (poi.seed != null) e.seed = poi.seed;
      if (poi.turrets) e.turrets = poi.turrets;
      out.push(e);
    }
    return out;
  }
  // belts survive restarts (they're shared); a player's own spawn-in POI is rebuilt at login instead
  exportPoi(poi) { return { id: poi.id, kind: poi.kind, name: poi.name, ax: poi.ax, ay: poi.ay, r: poi.r, field: poi.field, expiresAt: poi.expiresAt, createdAt: poi.createdAt, retired: !!poi.retired }; }
  loadPoi(d) {
    if (!d || d.kind !== "belt" || typeof d.id !== "string" || !d.field || !Array.isArray(d.field.rocks) || d.retired) return;
    this.pois.set(d.id, { ...d, fixed: false, hidden: false, retired: false }); this.poiVer++;
  }
  _visibleSystems(pid) {
    const set = new Set();
    for (const s of this.ships.values()) if (s.owner === pid && s.sys) set.add(s.sys);
    return set;
  }
  _stopShip(s) { s.vx = 0; s.vy = 0; s.moving = false; s.warp = false; s.wp = null; s.targets = []; s.auto.on = false; for (const L of s.lasers) this._laserStop(L); }

  // ---- tick ----
  tick(dtSec) {
    const now = Date.now();
    for (const c of this.cans.values()) if (now >= c.expiresAt) this._removeCan(c);
    this._tickShips(dtSec);
    this._tickTargeting(dtSec, now);
    if (now >= this.nextBelts) { this.nextBelts = now + 2000; this._maintainPois(now); }
    for (const p of [...this.players.values()]) if (p.offline && now - (p.offlineSince || 0) > LOGOUT_GRACE_MS) this._purge(p.id);   // logged off: the fleet leaves the world
  }

  // a rock changed / went: everyone looking at its system hears about it
  _rockChanged(field, rock) {
    for (const p of this.players.values()) if (!p.offline && this._visibleSystems(p.id).has(field.sys)) (p.rockDirty ||= new Map()).set(rock.id, rock.m3);
  }
  _removeRock(field, rock) {
    field.rocks = field.rocks.filter((r) => r !== rock); rock.m3 = 0;
    for (const o of this.ships.values()) { if (o.sys !== field.sys) continue; o.targets = o.targets.filter((x) => x.id !== rock.id); for (const q of o.lasers) if (q.rock === rock.id) this._laserStop(q); }
    this._rockChanged(field, rock);
  }
  // the rock fields a player can see, with a signature that changes when one appears / gains rocks
  fieldSig(p) { const sig = []; for (const sys of this._visibleSystems(p.id)) { const f = this._fieldOf(sys); if (f) sig.push(sys + ":" + f.ver); } return sig.join(","); }
  fieldsFor(p) {
    const out = [], sig = [];
    for (const sys of this._visibleSystems(p.id)) {
      const f = this._fieldOf(sys); if (!f) continue;
      sig.push(sys + ":" + f.ver);
      out.push({ id: sys, sys, color: f.color || null, rocks: f.rocks.map((r) => ({ id: r.id, x: r.x, y: r.y, r: r.r, size: r.size, ore: r.ore, m3: r.m3, rot: r.rot })) });
    }
    return { sig: sig.join(","), fields: out };
  }

  _tickTargeting(dtSec, now) {
    for (const sh of this.ships.values()) {
      if (sh.docked) continue;
      this._tickHeat(sh, dtSec);
      const t = SHIP_TYPES[sh.type]; const owner = this.players.get(sh.owner); if (!owner) continue;
      // locks: progress, and drop anything that left range or vanished
      for (let i = sh.targets.length - 1; i >= 0; i--) {
        const tg = sh.targets[i], pos = this._targetPos(sh, tg);
        if (!pos || Math.hypot(pos.x - sh.x, pos.y - sh.y) > t.targetRangeKm) { sh.targets.splice(i, 1); continue; }
        if (!tg.locked && now >= tg.lockAt) tg.locked = true;
      }
      // auto-miner: each of its cycles, (re)activate idle lasers on the first locked rock in range; with none it simply keeps cycling
      if (sh.auto.on && now >= sh.auto.next) {
        const cands = sh.targets.filter((tg) => tg.kind === "rock" && tg.locked).map((tg) => ({ tg, f: this._rockOf(sh.sys, tg.id) })).filter((x) => x.f);
        sh.lasers.forEach((L, i) => { if (L.off || L.on) return; const r = cands.find((x) => this._inLaserRange(sh, x.f, i)); if (r && this._canRun(sh, i)) this._laserStart(sh, L, i, r.tg.id, r.f, now); });
        sh.auto.next = now + this._autoCycleMs(sh);                     // with nothing in range it simply keeps cycling
      }
      // mining lasers: a cycle only breaks when its rock is gone / out of range or the hold is full;
      // the ore lands when the cycle completes, then the laser repeats (unless told not to)
      this._tickDrones(sh, now);
      let told = false;
      for (let i = 0; i < sh.lasers.length; i++) {
        const L = sh.lasers[i]; if (!L.on) continue;
        const tg = L.rock && this._lockedRock(sh, L.rock), f = tg ? this._rockOf(sh.sys, L.rock) : null;
        if (!f || !this._inLaserRange(sh, f, i)) { this._laserStop(L); continue; }
        if (Inv.canAdd(sh.inv.ore, f.rock.ore, 1) <= 0) { this._laserStop(L); if (!told) this._tell(sh.owner, shipLabel(sh) + ": ore hold full."); told = true; continue; }   // hold full: breaks the cycle now
        if (now < L.until) continue;
        const def = Inv.ITEMS[f.rock.ore];
        const units = Math.min(Math.floor(this._yieldM3s(sh, i) * (L.dur || MINING_CYCLE_MS) / 1000 / def.unitM3), Math.ceil(f.rock.m3 / def.unitM3));
        const got = units > 0 ? Inv.add(sh.inv.ore, f.rock.ore, units) : 0;
        if (got <= 0) { this._laserStop(L); continue; }
        f.rock.m3 = Math.max(0, +(f.rock.m3 - got * def.unitM3).toFixed(3));
        if (f.rock.m3 < def.unitM3) f.rock.m3 = 0;                                // less than one unit left: mined out
        owner.invDirty = true;
        if (f.rock.m3 <= 0) { this._removeRock(f.field, f.rock); continue; }
        this._rockChanged(f.field, f.rock);
        if (L.repeat) this._laserStart(sh, L, i, L.rock, f, now); else this._laserStop(L);
      }
    }
  }

  // Steering + mass-weighted separation. Ships steer toward their target, can't
  // overlap, and bump each other apart (heavier wins ground); contact kills the
  // inward velocity so they settle against each other instead of jittering.
  _tickShips(dtSec) {
    const ships = [...this.ships.values()];

    // 1) steer velocities toward targets, integrate
    const now = Date.now(); this.simAt = now;                 // the moment these positions are for (snapshots carry it)
    for (const s of ships) {
      if (s.docked) { s.vx = 0; s.vy = 0; continue; }
      if (this._warpTick(s, now)) continue;
      if (s.moving) {
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
        if (d <= SHIP_ARRIVE_EPS_KM) { s.moving = false; s.warp = false; if (s.wp && s.wp.ph === "align") s.wp = null; }
        else {
          const pb = this._propBonus(s), vmax = s.speed * (1 + pb), acc = (s.accel || 0.1) * (1 + pb * 0.5);   // propulsion raises top speed (and acceleration, half as much)
          const spd = Math.min(vmax, Math.sqrt(2 * acc * d) * 0.95);            // fast as it can while still able to brake in time
          const dvx = (dx / d) * spd - s.vx, dvy = (dy / d) * spd - s.vy, dv = Math.hypot(dvx, dvy), step = acc * dtSec;
          if (dv <= step) { s.vx += dvx; s.vy += dvy; } else { s.vx += dvx / dv * step; s.vy += dvy / dv * step; }   // acceleration-limited
        }
      }
      if (!s.moving) { const v = Math.hypot(s.vx, s.vy), step = (s.accel || 0.1) * dtSec; if (v <= step) { s.vx = 0; s.vy = 0; } else { s.vx -= s.vx / v * step; s.vy -= s.vy / v * step; } }
      s.x += s.vx * dtSec; s.y += s.vy * dtSec;
      if (Math.hypot(s.vx, s.vy) > 0.05) s.h = Math.atan2(s.vy, s.vx); // face travel direction

    }

    // 2) resolve overlaps pairwise, per POI (ships in different POIs never meet)
    const byPoi = new Map();
    for (const s of ships) { if (!s.sys || s.docked || this._inWarp(s)) continue; let a = byPoi.get(s.sys); if (!a) byPoi.set(s.sys, (a = [])); a.push(s); }
    for (const list of byPoi.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          const minD = a.radius + b.radius;
          if (d >= minD) continue;
          if (d < 1e-6) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy) || 1; }
          const nx = dx / d, ny = dy / d, overlap = minD - d;
          const wa = b.mass / (a.mass + b.mass), wb = a.mass / (a.mass + b.mass); // lighter moves more
          a.x -= nx * overlap * wa; a.y -= ny * overlap * wa;
          b.x += nx * overlap * wb; b.y += ny * overlap * wb;
          // kill the velocity component pushing each ship into the other → no ramming/jitter
          const avn = a.vx * nx + a.vy * ny; if (avn > 0) { a.vx -= avn * nx; a.vy -= avn * ny; }
          const bvn = b.vx * nx + b.vy * ny; if (bvn < 0) { b.vx -= bvn * nx; b.vy -= bvn * ny; }
        }
      }
    }

    // 3) keep inside the POI's boundary, finalize arrivals
    for (const s of ships) {
      if (s.docked || !s.sys) continue;
      const c = this._clamp(s.sys, s.x, s.y); s.x = c.x; s.y = c.y;
      if (s.moving && !this._inWarp(s) && Math.hypot(s.tx - s.x, s.ty - s.y) <= SHIP_ARRIVE_EPS_KM) { s.moving = false; s.warp = false; if (s.wp && s.wp.ph === "align") s.wp = null; }
    }
  }

  // ---- snapshot ----
  // Every ship in the POI the player's camera is on, plus their own ships wherever they are (docs/DESIGN.md › Engine).
  // One index per snapshot round: ships by POI and by owner, and each ship's public entry built once for every viewer.
  snapshotIndex() {
    const byPoi = new Map(), byOwner = new Map(), cansByPoi = new Map();
    for (const s of this.ships.values()) {
      let o = byOwner.get(s.owner); if (!o) byOwner.set(s.owner, (o = [])); o.push(s);
      if (s.docked || !s.sys) continue;
      let a = byPoi.get(s.sys); if (!a) byPoi.set(s.sys, (a = [])); a.push(s);
    }
    for (const c of this.cans.values()) { let a = cansByPoi.get(c.sys); if (!a) cansByPoi.set(c.sys, (a = [])); a.push(c); }
    return { now: Date.now(), byPoi, byOwner, cansByPoi, pub: new Map() };
  }
  _pubEntry(s, now) {
    const entry = { id: s.id, sys: s.sys, type: s.type, name: s.name || null, x: +s.x.toFixed(4), y: +s.y.toFixed(4), h: +s.h.toFixed(3), mine: false };
    if (s.drones.on) entry.drones = { on: true, rock: s.drones.rock || null, p: s.drones.rock ? Math.min(1, (now - s.drones.start) / s.drones.dur) : 0 };   // everyone sees mining drones
    const w = s.wp;
    if (w && w.ph !== "align" && w.ph !== "palign" && w.ph !== "poi") {   // others see the entry window, and the exit window only seconds before landing
      entry.wp = { ph: w.ph, el: now - w.at, dur: w.dur || 0, dir: +w.dir.toFixed(4), fx: +w.fx.toFixed(4), fy: +w.fy.toFixed(4) };
      if (w.ex != null && (w.ph === "exit" || (w.ph === "transit" && w.dur - (now - w.at) <= WARP_EXIT_SHOW_MS))) { entry.wp.ex = +w.ex.toFixed(4); entry.wp.ey = +w.ey.toFixed(4); }
    }
    return entry;
  }
  snapshotFor(p, idx = this.snapshotIndex()) {
    const now = idx.now, own = idx.byOwner.get(p.id) || [], view = p.view && own.some((s) => s.sys === p.view) ? p.view : null, ships = [];
    for (const s of (view && idx.byPoi.get(view)) || []) {
      if (s.owner === p.id) continue;
      let e = idx.pub.get(s.id); if (!e) idx.pub.set(s.id, (e = this._pubEntry(s, now)));
      ships.push(e);
    }
    const vis = new Set(view ? [view] : []);
    for (const s of own) {
      if (s.sys) vis.add(s.sys);
      const entry = { id: s.id, sys: s.sys, type: s.type, name: s.name || null, x: +s.x.toFixed(4), y: +s.y.toFixed(4), h: +s.h.toFixed(3), mine: true }, w = s.wp;
      if (w && w.ph === "poi") entry.wp = { ph: "poi", from: w.from, to: w.to, el: now - w.at, dur: w.dur, dir: +w.dir.toFixed(4), fx: +w.fx.toFixed(3), fy: +w.fy.toFixed(3), ex: +w.ex.toFixed(3), ey: +w.ey.toFixed(3) };
      else if (w && w.ph === "palign") entry.wp = { ph: "palign", to: w.to };
      else if (w && w.ph !== "align") {                       // the owner sees both windows
        entry.wp = { ph: w.ph, el: now - w.at, dur: w.dur || 0, dir: +w.dir.toFixed(4), fx: +w.fx.toFixed(4), fy: +w.fy.toFixed(4) };
        if (w.to) entry.wp.to = w.to;
        if (w.ex != null) { entry.wp.ex = +w.ex.toFixed(4); entry.wp.ey = +w.ey.toFixed(4); }
      }
      {
        if (s.moving && !(w && w.ph === "palign")) { entry.tx = +s.tx.toFixed(4); entry.ty = +s.ty.toFixed(4); }
        entry.docked = s.docked; entry.warp = s.warp; entry.moving = s.moving; entry.pilot = s.pilot ?? null; entry.hp = +s.hp.toFixed(1); entry.shield = +s.shield.toFixed(1);
        entry.spd = +Math.hypot(s.vx, s.vy).toFixed(4);
        entry.lasers = s.lasers.map((l, i) => ({ range: +this._laserRange(s, i).toFixed(3), ym: +(this._yieldM3s(s, i) * this._cycleMs(s, i) / 1000).toFixed(1), since: l.on ? now - (l.poweredAt || now) : 0, on: l.on, off: !!l.off, repeat: l.repeat, rock: l.rock, hp: l.hp, ax: l.ax, ay: l.ay, p: l.on ? Math.min(1, (now - l.start) / (l.dur || MINING_CYCLE_MS)) : 0, dur: l.dur || MINING_CYCLE_MS }));
        entry.laserRange = +this._laserRange(s).toFixed(3);
        const cyc = this._autoCycleMs(s);
        entry.yieldM3s = +this._yieldM3s(s).toFixed(3);
        entry.cap = { max: this._capMax(s), used: this._capUsed(s) };
        entry.heat = Math.round(s.heat || 0);
        entry.over = this._overloaded(s).map((w) => s.fit.indexOf(this._modFit(s, w)));   // fit indices running past capacity
        entry.fitHp = s.fit.map((f) => (f.burnt ? -1 : Math.round(f.hp ?? 100)));   // integrity per fitted module, -1 = burnt out
        entry.auto = { fitted: this._hasAuto(s), on: s.auto.on, off: !!s.auto.off, cyc, p: s.auto.on ? Math.max(0, 1 - (s.auto.next - now) / cyc) : 0 };
        entry.mining = s.lasers.some((l) => l.on);
        entry.prop = { fi: s.prop.fi, p: s.prop.fi >= 0 ? ((now - s.prop.poweredAt) % 10000) / 10000 : 0, speed: +(s.speed * (1 + this._propBonus(s))).toFixed(4) };
        entry.drones = s.drones.on ? { on: true, since: now - s.drones.poweredAt, rock: s.drones.rock || null, eng: s.drones.rock ? now - s.drones.engagedAt : 0, p: s.drones.rock ? Math.min(1, (now - s.drones.start) / s.drones.dur) : 0, ym: +(this._droneYield(s) * Inv.MODULES["module:mining_drones"].cycle / 1000).toFixed(1) } : { on: false, ym: +(this._droneYield(s) * Inv.MODULES["module:mining_drones"].cycle / 1000).toFixed(1) };
        entry.fitOff = s.fit.map((f, i) => (f.off ? i : -1)).filter((i) => i >= 0);
        entry.targets = s.targets.map((tg) => ({ kind: tg.kind, id: tg.id, locked: tg.locked, p: tg.locked ? 1 : Math.min(1, 1 - (tg.lockAt - now) / (SHIP_TYPES[s.type].lockMs)) }));
        entry.canDock = !s.docked && s.sys === STATION && !this._inWarp(s) && Math.hypot(s.x, s.y) <= DOCK_RADIUS_KM;
      }
      ships.push(entry);
    }

    const cans = [];
    for (const sys of vis) for (const c of idx.cansByPoi.get(sys) || []) cans.push({ id: c.id, sys: c.sys, x: c.x, y: c.y, mine: c.owner === p.id, owner: c.ownerName, left: Math.max(0, c.expiresAt - now), lockedFor: c.owner === p.id ? 0 : Math.max(0, (c.publicAt || 0) - now), empty: !c.inv.slots.length });
    return { t: "snap", st: this.simAt || now, view, ships, cans };   // st: server time, for client-side interpolation
  }
}
