import {
  FUEL_START_MS, FUEL_SESSION_MAX_MS, FUEL_REGEN_RATE, WARP_OPEN_MS, WARP_MIN_KM, WARP_EXIT_SHOW_MS, WARP_EXIT_FX_MS, WARP_STOP_MS, HUB_MIN_WAIT_MS, HUB_SEEK_INTERVAL_MS, HUB_SEEK_CHANCE, HUB_SYS,
  SHIP_TYPES, SHIP_ARRIVE_EPS_KM, SHIP_SLOW_RADIUS_KM, SHIP_STEER,
  WARP_MULT, DOCK_RADIUS_KM, LASER_M3_PER_S, MINING_CYCLE_MS, LASER_RANGE_KM, AUTO_MINER_BASE_MS, AUTO_MINER_STEP_MS, STATION_HANGAR_M3,
  INST_APOTHEM_KM, INST_RETURN_POS, INST_MAX_PLAYERS, INST_DECAY_HOURS, BEACON_RANGE_KM,
} from "./constants.js";
import * as Inv from "./inventory.js";
import { getLicense, hullEfficiency } from "../licenses.js";
import { STARGATE_CELLS, clampToSystem, clampToHex, STATION_POS } from "./geometry.js";
import { placeBeacons, createHomeField, tickHomeField, createInstField, decayField } from "./belts.js";

const homeSys = (pid) => `sys:${pid}`;
const HANGARS = 4;
// jettison cans (owner): only their owner can open them for 30 minutes, then anyone can for 10 more, then they're gone
const CAN_PRIVATE_MS = 30 * 60 * 1000, CAN_PUBLIC_MS = 10 * 60 * 1000, CAN_LIFE_MS = CAN_PRIVATE_MS + CAN_PUBLIC_MS, CAN_COOLDOWN_MS = 30 * 60 * 1000, CAN_M3 = 15000, CAN_RANGE_KM = 2.5;
const isInst = (sys) => typeof sys === "string" && sys.startsWith("inst:");
const HIBERNATE_GRACE_MS = 60 * 1000;
// Running hot: power past the capacitor builds heat (faster the further over); once heat is full, every
// powered module loses integrity; at 0 it burns out (offline until the ship docks). Under the limit, heat cools.
const HEAT_PER_S = 6;        // heat %/s at 100% over capacity (scales with how far over)
const COOL_PER_S = 5;        // heat %/s lost while within capacity
const BURN_PER_S = 4;        // integrity %/s per powered module at full heat and 100% over (min 1 %/s)

const shipLabel = (sh) => sh.name || (SHIP_TYPES[sh.type] || {}).name || "Ship";

export class World {
  constructor() {
    this.players = new Map(); // pid -> {id,name,send,offline}
    this.gates = new Map();   // gid -> gate
    this.ships = new Map();   // sid -> ship
    this.cans = new Map();    // jettison cans floating in space: id -> { id, owner, ownerName, sys, x, y, inv, publicAt, expiresAt }
    this.instances = new Map();   // asteroid instances: id (= its system id, "inst:…") -> { id, sys, field, createdAt }
    this.nextMaint = 0; this.nextDecay = 0;
  }

  addPlayer(id, name, send, saved = null) {
    const existing = this.players.get(id);
    if (existing) { existing.send = send; existing.offline = false; existing.name = name; this._ensureShips(id); return existing; }
    const now = Date.now();
    // asteroid beacons: fixed spots per player; each keeps its link to an instance across reloads and restarts
    const savedLinks = new Map(((saved && saved.beacons) || []).map((b) => [b.id, b.inst]));
    const beacons = placeBeacons(id).map((b) => ({ ...b, inst: this.instances.has(savedLinks.get(b.id)) ? savedLinks.get(b.id) : null }));
    const field = saved && saved.field && saved.field.kind === "home" ? saved.field : createHomeField(homeSys(id), beacons, now);   // (old belt fields are dropped)
    field.beacons = beacons.map((b) => ({ id: b.id, x: b.x, y: b.y }));
    const p = { id, name, send, offline: false, field, beacons, hangars: null, invDirty: false, credits: 0, licenses: (saved && saved.licenses) || {}, unlocked: (saved && saved.unlocked) || {}, pilots: [] };
    this.players.set(id, p);
    const savedGates = new Map((saved && saved.gates || []).map((g) => [g.id, g]));
    const downtime = saved && saved.savedAt ? Math.max(0, now - saved.savedAt) : 0; // the clock keeps running while you're gone
    STARGATE_CELLS.forEach((cell, i) => {
      const gid = `${id}:${i}`, sg = savedGates.get(gid);
      const g = {
        id: gid, owner: id, sys: homeSys(id), lx: cell.x, ly: cell.y,
        state: sg ? sg.state : "closed", fuelMs: sg ? sg.fuelMs : FUEL_START_MS, sessionUsedMs: sg ? sg.sessionUsedMs : 0, activatedAt: sg ? sg.activatedAt : 0,
        connToSys: sg ? (sg.connToSys || null) : null, connToGate: sg ? (sg.connToGate || null) : null, lastSeek: 0,
      };
      if (g.state !== "active" && downtime) g.fuelMs = Math.min(FUEL_START_MS, g.fuelMs + downtime * FUEL_REGEN_RATE);
      if (g.state === "active" && downtime) {
        g.fuelMs -= downtime; g.sessionUsedMs += downtime;
        if (g.fuelMs <= 0 || g.sessionUsedMs >= FUEL_SESSION_MAX_MS) { g.fuelMs = Math.max(0, g.fuelMs); g.state = "closed"; g.sessionUsedMs = 0; g.connToSys = null; g.connToGate = null; }
      }
      this.gates.set(gid, g);
      // re-link with the partner gate if it's loaded (either side loading completes the link)
      if (g.connToGate) { const partner = this.gates.get(g.connToGate); if (partner && partner.state === "active") { partner.connToSys = g.sys; partner.connToGate = g.id; } }
    });
    for (const sh of (saved && saved.ships) || []) {
      if (isInst(sh.sys) && this.instances.has(sh.sys)) { this.ships.set(sh.id, this._hydrateShip({ ...sh, owner: id })); continue; }   // still in its asteroid instance
      const rec = { ...sh, owner: id, sys: homeSys(id) };
      if (isInst(sh.sys)) { const b = beacons.find((x) => x.id === sh.via), at = this._nearBeacon(b); Object.assign(rec, at, { tx: at.x, ty: at.y, moving: false, targets: [], lasers: [], via: null }); }   // that instance is gone: back at its beacon
      this.ships.set(sh.id, this._hydrateShip(rec));
    }
    // four renameable station hangars; a save from before hangars existed becomes Hangar 1
    p.jetUntil = (saved && saved.jetUntil) || 0;
    for (const c of (saved && saved.cans) || []) if (c.expiresAt > now && (!isInst(c.sys) || this.instances.has(c.sys))) this.cans.set(c.id, { ...c, owner: id, sys: c.sys || homeSys(id), publicAt: c.publicAt || c.expiresAt - CAN_PUBLIC_MS });
    p.hangars = (saved && Array.isArray(saved.hangars) && saved.hangars.length) ? saved.hangars
      : [0, 1, 2, 3].map((i) => ({ name: "Hangar " + (i + 1), inv: (i === 0 && saved && saved.hangar) || Inv.makeInv(STATION_HANGAR_M3) }));
    p.delivery = (saved && saved.delivery) || Inv.makeInv(STATION_HANGAR_M3);   // market purchases land here
    while (p.hangars.length < HANGARS) p.hangars.push({ name: "Hangar " + (p.hangars.length + 1), inv: Inv.makeInv(STATION_HANGAR_M3) });
    this._ensureShips(id);
    return p;
  }

  /** Everything about a player's system worth keeping across reloads/restarts. */
  exportState(id) {
    const ships = [...this.ships.values()].filter((s) => s.owner === id).map((s) => ({ id: s.id, type: s.type, x: s.x, y: s.y, tx: s.tx, ty: s.ty, moving: s.moving, h: s.h, docked: s.docked, warp: s.warp, sys: s.sys, via: s.via || null, fit: s.fit, heat: s.heat || 0, lasers: s.lasers, auto: s.auto, targets: s.targets, inv: s.inv, hp: s.hp, shield: s.shield, pilot: s.pilot, name: s.name }));
    const gates = [...this.gates.values()].filter((g) => g.owner === id).map((g) => ({ id: g.id, state: g.state, fuelMs: g.fuelMs, sessionUsedMs: g.sessionUsedMs, activatedAt: g.activatedAt, connToSys: g.connToSys, connToGate: g.connToGate }));
    const p = this.players.get(id);
    return { ships, gates, field: p ? p.field : null, beacons: p ? p.beacons.map((b) => ({ id: b.id, inst: b.inst })) : [], hangars: p ? p.hangars : null, delivery: p ? p.delivery : null, jetUntil: p ? p.jetUntil : 0, cans: [...this.cans.values()].filter((c) => c.owner === id), licenses: p ? p.licenses : {}, unlocked: p ? p.unlocked : {}, savedAt: Date.now() };
  }

  // Fill in live/derived ship fields from a saved or fresh record.
  _hydrateShip(sh) {
    const t = SHIP_TYPES[sh.type] || SHIP_TYPES.chisel;
    // ships from before fitting existed keep what they had: their lasers and an auto miner
    const fit = Array.isArray(sh.fit) ? sh.fit.filter((f) => f && Inv.MODULES[f.item]).map((f) => ({ item: f.item, hp: Number.isFinite(f.hp) ? f.hp : 100, burnt: !!f.burnt, slot: Number.isInteger(f.slot) ? f.slot : -1 }))
      : [...Array(t.lasers || 0).fill("module:mining_laser"), "module:auto_miner"].map((item) => ({ item }));
    this._fixSlots({ type: sh.type, fit });
    const nLasers = fit.filter((f) => Inv.MODULES[f.item].role === "laser").length;
    return {
      ...sh, vx: 0, vy: 0, speed: t.speedKmps, accel: t.accelKmps2 || 0.1, radius: t.radiusKm, mass: t.mass, fit,
      docked: !!sh.docked, warp: false, wp: null, lasers: Array.from({ length: nLasers }, (_, i) => ({ on: false, off: false, repeat: true, rock: null, hp: 0, ax: 0, ay: 0, start: 0, until: 0, ...((Array.isArray(sh.lasers) && sh.lasers[i]) || {}) })),
      auto: { on: false, off: false, next: 0, ...(sh.auto || {}) },
      hp: Number.isFinite(sh.hp) ? Math.min(sh.hp, t.hp) : t.hp, shield: Number.isFinite(sh.shield) ? Math.min(sh.shield, t.shield) : t.shield,
      targets: (sh.targets || []).map((tg) => ({ ...tg })),
      inv: { cargo: sh.inv?.cargo || Inv.makeInv(t.cargoM3), ore: sh.inv?.ore || Inv.makeInv(t.oreM3) },
    };
  }

  // Every pilot starts with a Chisel, parked just off the station at system center.
  _ensureShips(id) {
    for (const s of this.ships.values()) if (s.owner === id) return;
    const sid = `${id}:ship:0`;
    const sx = STATION_POS.x + 2.2, sy = STATION_POS.y + 2.2; // spawn beside the station
    this.ships.set(sid, this._hydrateShip({ id: sid, owner: id, sys: homeSys(id), type: "chisel", x: sx, y: sy, tx: sx, ty: sy, moving: false, h: Math.PI / 2,
      fit: [{ item: "module:mining_laser" }, { item: "module:mining_laser" }] }));   // a new player's first Prospector comes with 2 mining lasers
  }

  // Logging off never drops the system immediately: it stays awake while a gate is
  // running or a ship still has an order, then hibernates after a short grace period.
  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    p.offline = true; p.offlineSince = Date.now(); p.send = () => {};
  }
  // Offline mining (owner): a ship keeps working while its owner is away until its targets are gone, its hold is
  // full, or its lasers are off / burnt out. Until then it (and its system) stays awake.
  _shipBusy(s) {
    if (s.docked) return false;
    if (s.moving || s.wp || s.lasers.some((L) => L.on)) return true;
    if (!s.auto.on || s.auto.off) return false;
    const runnable = s.lasers.some((L, i) => !L.off && this._canRun(s, i)); if (!runnable) return false;
    return s.targets.some((tg) => { if (tg.kind !== "rock" || !tg.locked) return false; const f = this._rockOf(s.sys, tg.id); return f && this._inLaserRange(s, f) && Inv.canAdd(s.inv.ore, f.rock.ore, 1) > 0; });
  }
  _busy(id) {
    for (const g of this.gates.values()) if (g.owner === id && g.state === "active") return true;
    for (const s of this.ships.values()) if (s.owner === id && this._shipBusy(s)) return true;
    return false;
  }
  _purge(id) {
    if (this.onBeforePurge) { try { this.onBeforePurge(id); } catch (e) { console.error("onBeforePurge", e); } }
    for (const [gid, g] of this.gates) if (g.owner === id) this.gates.delete(gid);
    for (const [sid, s] of this.ships) if (s.owner === id) this.ships.delete(sid);
    for (const [cid, c] of this.cans) if (c.owner === id) this.cans.delete(cid);
    this.players.delete(id);
  }

  // ---- commands ----
  cmdGate(pid, gateId, open) {
    const g = this.gates.get(gateId);
    if (!g || g.owner !== pid) return;
    if (open) {
      if (g.state === "closed" && g.fuelMs > 0) { g.state = "active"; g.sessionUsedMs = 0; g.lastSeek = 0; g.activatedAt = Date.now(); }
    } else {
      if (g.state !== "active") return;
      this._closeGate(g);
    }
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
  // the rock field of a system: a home system's scattered rocks, or an asteroid instance's field
  _fieldOf(sys) {
    if (isInst(sys)) { const i = this.instances.get(sys); return i ? i.field : null; }
    const p = typeof sys === "string" && sys.startsWith("sys:") ? this.players.get(sys.slice(4)) : null;
    return p ? p.field : null;
  }
  _rockOf(sys, rockId) {
    const field = this._fieldOf(sys); if (!field || typeof rockId !== "string") return null;
    const r = field.rocks.find((x) => x.id === rockId); return r ? { rock: r, field } : null;
  }
  _clamp(sys, x, y) { return isInst(sys) ? clampToHex(x, y, INST_APOTHEM_KM) : clampToSystem(x, y); }
  // where a ship's target is, in the ship's own system (targets in another system don't exist for it)
  _targetPos(sh, tg) {
    if (tg.kind === "rock") { const f = this._rockOf(sh.sys, tg.id); return f ? { x: f.rock.x, y: f.rock.y } : null; }
    if (tg.kind === "gate") { const g = this.gates.get(tg.id); return g && g.sys === sh.sys ? { x: g.lx, y: g.ly } : null; }
    if (tg.kind === "ship") { const o = this.ships.get(tg.id); return o && o.sys === sh.sys && !o.docked ? { x: o.x, y: o.y } : null; }
    if (tg.kind === "station") return isInst(sh.sys) || sh.sys === "sys:hub" ? null : { x: STATION_POS.x, y: STATION_POS.y };
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
    L.start = now; L.dur = this._cycleMs(sh); L.until = now + L.dur;
  }
  _lockedRock(sh, rockId) { return sh.targets.find((t) => t.kind === "rock" && t.locked && (rockId == null || t.id === rockId)); }
  _inLaserRange(sh, f) { return Math.hypot(f.rock.x - sh.x, f.rock.y - sh.y) <= this._laserRange(sh); }
  // ---- license bonuses: they come from the pilot crewing the ship ----
  _lic(sh, key) {
    const p = this.players.get(sh.owner), pl = p && p.pilots.find((x) => String(x.id) === String(sh.pilot));
    return (pl && pl.licenses[key]) || 0;
  }
  _per(key) { const l = getLicense(key); return (l && l.per) || 0; }
  // a hull's bonus to a module stat, in % (e.g. Prospector: Mining Laser yield +20, range +5)
  _hullBonus(sh, item, stat) { const t = SHIP_TYPES[sh.type] || {}; return ((t.bonuses || {})[item] || {})[stat] || 0; }
  _laserRange(sh) { const m = Inv.MODULES["module:mining_laser"]; return (m.range || LASER_RANGE_KM) * (1 + this._hullBonus(sh, "module:mining_laser", "range") / 100) * (1 + this._per("laser_range") * this._lic(sh, "laser_range")); }
  _cycleMs(sh) { return Math.round(MINING_CYCLE_MS * Math.max(0.5, 1 - this._per("laser_cycle") * this._lic(sh, "laser_cycle"))); }
  _yieldM3s(sh) {
    const t = SHIP_TYPES[sh.type] || {}, hullLic = Object.keys(t.req || {})[0];
    // hull license = how efficiently the pilot flies it (Lvl 5 = 100% of the hull's yield)
    const base = Inv.MODULES["module:mining_laser"].yield || LASER_M3_PER_S;   // the module's base yield, boosted by the hull bonus and licenses
    return base * (1 + this._hullBonus(sh, "module:mining_laser", "yield") / 100) * (1 + this._per("small_mining_laser") * this._lic(sh, "small_mining_laser")) * (hullLic ? hullEfficiency(this._lic(sh, hullLic)) : 1);
  }
  // All lasers at once: on -> spread over the locked rocks in range; off -> stop repeating.
  cmdMine(pid, shipId, on) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid || sh.docked) return;
    if (!on) { for (const L of sh.lasers) if (L.on) L.repeat = false; return; }
    const now = Date.now();
    const rocks = sh.targets.filter((tg) => tg.kind === "rock" && tg.locked).map((tg) => ({ tg, f: this._rockOf(sh.sys, tg.id) })).filter((x) => x.f && this._inLaserRange(sh, x.f));
    if (!rocks.length) return;
    if (!rocks.some((r) => Inv.canAdd(sh.inv.ore, r.f.rock.ore, 1) > 0)) { this._tell(pid, shipLabel(sh) + ": ore hold full."); return; }
    let told = false;
    sh.lasers.forEach((L, i) => { if (L.off || L.on) return; if (!this._canRun(sh, i, told ? null : pid)) { told = true; return; } const r = rocks[i % rocks.length]; this._laserStart(sh, L, i, r.tg.id, r.f, now); });
  }
  // One laser. Active: a click toggles whether it repeats after this cycle (the cycle itself
  // runs to completion; a laser can't be retargeted mid-cycle). Idle: start on the rock.
  cmdLaser(pid, shipId, idx, on, rockId) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid || sh.docked) return;
    const L = sh.lasers[+idx]; if (!L || L.off) return;                 // powered off: nothing to activate
    if (L.on) { if (!on) L.repeat = false; return; }   // active: can be told to stop after this cycle; a stopping laser can't be re-armed until the cycle ends
    if (!on) return;
    const tg = this._lockedRock(sh, rockId); if (!tg) return;
    const f = this._rockOf(sh.sys, tg.id); if (!f || !this._inLaserRange(sh, f)) return;
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
    const laserDraw = Inv.MODULES["module:mining_laser"].draw, autoDraw = Inv.MODULES["module:auto_miner"].draw;
    return sh.lasers.filter((L) => L.on).length * laserDraw + (sh.auto.on ? autoDraw : 0);
  }
  // The fit entry behind laser n (lasers are numbered in fitting order) or the auto miner ("auto").
  _modFit(sh, which) {
    if (which === "auto") return sh.fit.find((f) => Inv.MODULES[f.item].role === "auto") || null;
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
    const laserDraw = Inv.MODULES["module:mining_laser"].draw, autoDraw = Inv.MODULES["module:auto_miner"].draw, max = this._capMax(sh);
    const on = [];
    sh.lasers.forEach((L, i) => { if (L.on) on.push({ which: i, at: L.poweredAt || 0, draw: laserDraw }); });
    if (sh.auto.on) on.push({ which: "auto", at: sh.auto.poweredAt || 0, draw: autoDraw });
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
      else { this._laserStop(sh.lasers[which]); this._tell(sh.owner, `${shipLabel(sh)}: Mining Laser ${which + 1} burnt out.`); }
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
      if (sh.docked || this._inWarp(sh) || sh.sys !== homeSys(pid) || Math.hypot(sh.x - STATION_POS.x, sh.y - STATION_POS.y) > DOCK_RADIUS_KM) return;
      sh.docked = true; sh.moving = false; sh.warp = false; sh.wp = null; for (const L of sh.lasers) this._laserStop(L); sh.auto.on = false; sh.targets = []; sh.vx = sh.vy = 0;
      sh.hp = SHIP_TYPES[sh.type].hp; sh.shield = SHIP_TYPES[sh.type].shield; this._repairModules(sh);   // docked: repaired and recharged
    } else {
      if (!sh.docked) return;
      if (!sh.pilot) { this._tell(pid, "That ship has no pilot. Crew it first."); return; }
      sh.docked = false; sh.x = STATION_POS.x + 2.2; sh.y = STATION_POS.y + 2.2; sh.tx = sh.x; sh.ty = sh.y;
    }
    this._markInv(pid);
  }
  // Warp: align (speed up toward the destination) → at full speed a warp window opens ahead → the ship goes
  // through as a ball → comes out of a second window short of the destination at full speed → brakes to a stop.
  cmdWarp(pid, shipId) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid || sh.docked || !sh.moving || sh.warp) return;
    sh.warp = true; sh.wp = { ph: "align" };
  }
  _inWarp(s) { return !!(s.wp && (s.wp.ph === "open" || s.wp.ph === "transit")); }
  _warpTick(s, now) {
    const w = s.wp; if (!w) return false;
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
    const sh = a.ship; if (sh.docked) { this._tell(pid, "Undock to jettison."); return; }
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
    const id = `${p.id}:ship:${n}`, x = STATION_POS.x, y = STATION_POS.y;
    this.ships.set(id, this._hydrateShip({ id, owner: p.id, sys: homeSys(p.id), type, x, y, tx: x, ty: y, moving: false, h: Math.PI / 2, docked: true, pilot: null, fit: [] }));   // new ships come with nothing fitted
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
    } else {
      const vis = this._visibleSystems(pid);
      for (const other of this.players.values()) {
        if (other.offline) continue;
        const ov = this._visibleSystems(other.id);
        for (const s of ov) if (vis.has(s)) { other.send(msg); break; }
      }
    }
  }

  // ---- connections ----
  _connectGates(a, b) { a.connToSys = b.sys; a.connToGate = b.id; b.connToSys = a.sys; b.connToGate = a.id; }
  _connectToHub(g) { g.connToSys = HUB_SYS; g.connToGate = null; }
  _endConnection(g) {
    const partner = g.connToGate ? this.gates.get(g.connToGate) : null;
    if (partner) { partner.connToSys = null; partner.connToGate = null; this._evictVisitors(partner.sys); }
    this._evictVisitors(g.sys);
    g.connToSys = null; g.connToGate = null;
  }
  // When a gate link closes, any ship still in a system it doesn't own is destroyed
  // (with its cargo) and its pilot respawns at their own station.
  _evictVisitors(sysId) {
    const ownerId = sysId.startsWith("sys:") ? sysId.slice(4) : null;
    for (const sh of this.ships.values()) {
      if (sh.sys !== sysId || sh.owner === ownerId) continue;
      sh.sys = homeSys(sh.owner); sh.x = STATION_POS.x + 2.2; sh.y = STATION_POS.y + 2.2; sh.tx = sh.x; sh.ty = sh.y;
      sh.vx = 0; sh.vy = 0; sh.moving = false; sh.warp = false; sh.wp = null; sh.targets = []; sh.auto.on = false;
      for (const L of sh.lasers) this._laserStop(L);
      sh.inv.ore.slots = []; sh.inv.cargo.slots = [];           // destroyed with everything aboard
      const o = this.players.get(sh.owner);
      if (o && !o.offline) o.send(JSON.stringify({ t: "sys", text: "The gate closed on you. Your ship was destroyed; you respawn at your station." }));
    }
  }
  _closeGate(g) {
    this._endConnection(g);
    g.state = "closed"; g.sessionUsedMs = 0;
    const owner = this.players.get(g.owner);
    if (owner && !owner.offline) owner.send(JSON.stringify({ t: "sys", text: "Wormhole closed." }));
  }

  _visibleSystems(pid) {
    const set = new Set([homeSys(pid)]);
    for (const g of this.gates.values()) if (g.owner === pid && g.state === "active" && g.connToSys) set.add(g.connToSys);
    for (const s of this.ships.values()) if (s.owner === pid && isInst(s.sys)) set.add(s.sys);   // asteroid instances you have ships in
    return set;
  }

  // ---- tick ----
  tick(dtSec) {
    const now = Date.now(), dtMs = dtSec * 1000;
    for (const c of this.cans.values()) if (now >= c.expiresAt) this._removeCan(c);
    for (const g of this.gates.values()) {
      if (g.state !== "active") { if (g.fuelMs < FUEL_START_MS) g.fuelMs = Math.min(FUEL_START_MS, g.fuelMs + dtMs * FUEL_REGEN_RATE); continue; }
      if (g.connToGate) { const partner = this.gates.get(g.connToGate); if (!partner || partner.state !== "active" || partner.connToGate !== g.id) { g.connToSys = null; g.connToGate = null; } }
      g.fuelMs -= dtMs; g.sessionUsedMs += dtMs;
      if (g.fuelMs <= 0) { g.fuelMs = 0; this._closeGate(g); continue; }
      if (g.sessionUsedMs >= FUEL_SESSION_MAX_MS) { this._closeGate(g); continue; }
      if (!g.connToSys) {
        for (const o of this.gates.values()) {
          if (o !== g && o.state === "active" && !o.connToSys && o.owner !== g.owner) { this._connectGates(g, o); break; }
        }
        if (!g.connToSys && now - g.activatedAt >= HUB_MIN_WAIT_MS && now - g.lastSeek >= HUB_SEEK_INTERVAL_MS) {
          g.lastSeek = now; if (Math.random() < HUB_SEEK_CHANCE) this._connectToHub(g);
        }
      }
    }
    this._tickShips(dtSec);
    this._tickTargeting(dtSec, now);
    for (const p of this.players.values()) tickHomeField(p.field, now);   // home rocks regrow (viewers get the new field)
    if (now >= this.nextDecay) { const dt = this.nextDecay ? now - this.nextDecay + 60000 : 60000; this.nextDecay = now + 60000; this._decayInstances(dt); }
    if (now >= this.nextMaint) { this.nextMaint = now + 5000; this._maintainInstances(); }

    for (const p of [...this.players.values()]) {
      if (!p.offline || now - (p.offlineSince || 0) <= HIBERNATE_GRACE_MS) continue;
      // offline: a ship in an asteroid instance that has stopped working goes home through its beacon
      for (const s of this.ships.values()) if (s.owner === p.id && isInst(s.sys) && !this._shipBusy(s)) this._returnHome(s, null);
      if (!this._busy(p.id)) this._purge(p.id);   // hibernate
    }
  }

  // ---- asteroid instances (owner) ----
  // Small shared hexes, made by the server. Each player's asteroid beacons link to instances with room
  // (5 players each; returning members always fit); ships near a linked beacon can jump through.
  _members(inst) { const set = new Set(); for (const s of this.ships.values()) if (s.sys === inst.sys) set.add(s.owner); return set; }
  _hasRoom(inst, pid) { const m = this._members(inst); return m.has(pid) || m.size < INST_MAX_PLAYERS; }
  _newInstance() {
    const id = "inst:" + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
    const inst = { id, sys: id, field: createInstField(id, INST_APOTHEM_KM, INST_RETURN_POS), createdAt: Date.now() };
    this.instances.set(id, inst); return inst;
  }
  // keep twice the room the loaded players need (at least two instances with space), then link idle beacons
  _maintainInstances() {
    const need = Math.max(2, Math.ceil(2 * this.players.size / INST_MAX_PLAYERS));
    const free = () => [...this.instances.values()].filter((i) => this._members(i).size < INST_MAX_PLAYERS).length;
    if (this.instances.size < need || free() < 2) this._newInstance();
    for (const p of this.players.values()) {
      for (const b of p.beacons) {
        const cur = b.inst && this.instances.get(b.inst);
        if (cur && this._hasRoom(cur, p.id)) continue;
        b.inst = null;
        const taken = new Set(p.beacons.map((x) => x.inst)), cands = [...this.instances.values()].filter((i) => this._hasRoom(i, p.id));
        const fresh = cands.filter((i) => !taken.has(i.id)), pool = fresh.length ? fresh : cands;   // spread a player's beacons over different instances when possible
        if (pool.length) b.inst = pool[Math.floor(Math.random() * pool.length)].id;
      }
    }
  }
  // passive ore loss; an instance with no rocks left closes
  _decayInstances(dtMs) {
    for (const inst of [...this.instances.values()]) {
      const f = inst.field;
      for (const r of decayField(f, dtMs, INST_DECAY_HOURS)) { if (r.m3 < (Inv.ITEMS[r.ore] || {}).unitM3) this._removeRock(f, r); else this._rockChanged(f, r); }
      if (!f.rocks.length) this._closeInstance(inst);
    }
  }
  _closeInstance(inst) {
    for (const s of [...this.ships.values()]) if (s.sys === inst.sys) this._returnHome(s, "The asteroid field is mined out. Your ship returned to its beacon.");
    for (const c of [...this.cans.values()]) if (c.sys === inst.sys) this.cans.delete(c.id);
    for (const p of this.players.values()) for (const b of p.beacons) if (b.inst === inst.id) b.inst = null;
    this.instances.delete(inst.id);
    if (this.onInstanceClosed) { try { this.onInstanceClosed(inst.id); } catch (e) { console.error("onInstanceClosed", e); } }
  }
  // a spot just off a beacon (or the station if it's unknown)
  _nearBeacon(b) {
    const a = Math.random() * Math.PI * 2, d = 1.2 + Math.random() * 0.8;
    return b ? { x: +(b.x + Math.cos(a) * d).toFixed(3), y: +(b.y + Math.sin(a) * d).toFixed(3) } : { x: STATION_POS.x + 2.2, y: STATION_POS.y + 2.2 };
  }
  _stopShip(s) { s.vx = 0; s.vy = 0; s.moving = false; s.warp = false; s.wp = null; s.targets = []; s.auto.on = false; for (const L of s.lasers) this._laserStop(L); }
  // back to the owner's home system, beside the beacon it went through (owner: never destroyed, unlike gates)
  _returnHome(s, text) {
    const p = this.players.get(s.owner), b = p && p.beacons.find((x) => x.id === s.via), at = this._nearBeacon(b);
    this._stopShip(s); s.sys = homeSys(s.owner); s.x = at.x; s.y = at.y; s.tx = at.x; s.ty = at.y; s.via = null;
    if (text) this._tell(s.owner, shipLabel(s) + ": " + text);
    this._markInv(s.owner);
  }
  // Jump the given ships through a beacon: a linked home beacon into its instance, or an instance's beacon home.
  // Every ship must be the sender's, in that beacon's system, within range of it.
  cmdJump(pid, beaconId, shipIds) {
    const p = this.players.get(pid); if (!p || typeof beaconId !== "string" || !Array.isArray(shipIds)) return;
    let sys, pos, inst = null, home = null;
    if (beaconId.endsWith(":ret")) { inst = this.instances.get(beaconId.slice(0, -4)); if (!inst) return; sys = inst.sys; pos = INST_RETURN_POS; }
    else { home = p.beacons.find((b) => b.id === beaconId); if (!home) return; sys = homeSys(pid); pos = home; inst = home.inst && this.instances.get(home.inst); if (!inst) { this._tell(pid, "That beacon isn't linked to an asteroid field yet."); return; } }
    const ships = [...new Set(shipIds)].slice(0, 50).map((id) => this.ships.get(id)).filter((s) => s && s.owner === pid && s.sys === sys && !s.docked && !this._inWarp(s) && Math.hypot(s.x - pos.x, s.y - pos.y) <= BEACON_RANGE_KM);
    if (!ships.length) { this._tell(pid, "Get within " + BEACON_RANGE_KM + " km of the beacon."); return; }
    if (!home) { for (const s of ships) this._returnHome(s, null); return; }
    if (!this._hasRoom(inst, pid)) { this._tell(pid, "That asteroid field is full."); home.inst = null; return; }
    for (const s of ships) {
      this._stopShip(s);
      const a = (Math.random() - 0.5) * Math.PI * 0.8, d = 1.5 + Math.random() * 1.5;   // arrive spread out on the field side of the beacon
      s.sys = inst.sys; s.via = home.id; s.x = +(INST_RETURN_POS.x + Math.cos(a) * d).toFixed(3); s.y = +(INST_RETURN_POS.y + Math.sin(a) * d).toFixed(3); s.tx = s.x; s.ty = s.y; s.h = 0;
    }
    this._markInv(pid);
  }
  exportInstance(inst) { return { id: inst.id, field: inst.field, createdAt: inst.createdAt }; }
  loadInstance(d) { if (d && isInst(d.id) && d.field && Array.isArray(d.field.rocks) && d.field.rocks.length) this.instances.set(d.id, { id: d.id, sys: d.id, field: d.field, createdAt: d.createdAt || Date.now() }); }
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
        const cands = sh.targets.filter((tg) => tg.kind === "rock" && tg.locked).map((tg) => ({ tg, f: this._rockOf(sh.sys, tg.id) })).filter((x) => x.f && this._inLaserRange(sh, x.f));
        if (!cands.length) sh.auto.next = now + this._autoCycleMs(sh);    // nothing to put the lasers on: just keep cycling
        else { const r = cands[0]; sh.lasers.forEach((L, i) => { if (L.off) return; if (!L.on && this._canRun(sh, i)) this._laserStart(sh, L, i, r.tg.id, r.f, now); }); sh.auto.next = now + this._autoCycleMs(sh); }
      }
      // mining lasers: a cycle only breaks when its rock is gone / out of range or the hold is full;
      // the ore lands when the cycle completes, then the laser repeats (unless told not to)
      let told = false;
      for (let i = 0; i < sh.lasers.length; i++) {
        const L = sh.lasers[i]; if (!L.on) continue;
        const tg = L.rock && this._lockedRock(sh, L.rock), f = tg ? this._rockOf(sh.sys, L.rock) : null;
        if (!f || !this._inLaserRange(sh, f)) { this._laserStop(L); continue; }
        if (Inv.canAdd(sh.inv.ore, f.rock.ore, 1) <= 0) { this._laserStop(L); if (!told) this._tell(sh.owner, shipLabel(sh) + ": ore hold full."); told = true; continue; }   // hold full: breaks the cycle now
        if (now < L.until) continue;
        const def = Inv.ITEMS[f.rock.ore];
        const units = Math.min(Math.floor(this._yieldM3s(sh) * (L.dur || MINING_CYCLE_MS) / 1000 / def.unitM3), Math.ceil(f.rock.m3 / def.unitM3));
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
          const vmax = s.speed, acc = s.accel || 0.1;
          const spd = Math.min(vmax, Math.sqrt(2 * acc * d) * 0.95);            // fast as it can while still able to brake in time
          const dvx = (dx / d) * spd - s.vx, dvy = (dy / d) * spd - s.vy, dv = Math.hypot(dvx, dvy), step = acc * dtSec;
          if (dv <= step) { s.vx += dvx; s.vy += dvy; } else { s.vx += dvx / dv * step; s.vy += dvy / dv * step; }   // acceleration-limited
        }
      }
      if (!s.moving) { const v = Math.hypot(s.vx, s.vy), step = (s.accel || 0.1) * dtSec; if (v <= step) { s.vx = 0; s.vy = 0; } else { s.vx -= s.vx / v * step; s.vy -= s.vy / v * step; } }
      s.x += s.vx * dtSec; s.y += s.vy * dtSec;
      if (Math.hypot(s.vx, s.vy) > 0.05) s.h = Math.atan2(s.vy, s.vx); // face travel direction

    }

    // 2) resolve overlaps pairwise (same system), position-corrected by mass
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = ships[i], b = ships[j];
        if (a.sys !== b.sys || a.docked || b.docked || (a.wp && a.wp.ph === "transit") || (b.wp && b.wp.ph === "transit")) continue;
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

    // 3) keep inside the honeycomb, finalize arrivals
    for (const s of ships) {
      if (s.docked) continue;
      const c = this._clamp(s.sys, s.x, s.y); s.x = c.x; s.y = c.y;
      if (s.moving && !this._inWarp(s) && Math.hypot(s.tx - s.x, s.ty - s.y) <= SHIP_ARRIVE_EPS_KM) { s.moving = false; s.warp = false; if (s.wp && s.wp.ph === "align") s.wp = null; }
    }
  }

  // ---- snapshot ----
  snapshotFor(p) {
    const vis = this._visibleSystems(p.id);
    const myGates = [...this.gates.values()].filter((g) => g.owner === p.id);
    const now = Date.now();

    const systems = [];
    for (const sysId of vis) {
      let fromGateLocal = null, partnerGateId = null;
      if (sysId !== homeSys(p.id)) {
        const g = myGates.find((x) => x.state === "active" && x.connToSys === sysId);
        if (g) { fromGateLocal = { x: g.lx, y: g.ly }; partnerGateId = g.connToGate; }
      }
      if (isInst(sysId)) {   // an asteroid instance: drawn off the beacon your ships went through
        const s0 = [...this.ships.values()].find((s) => s.owner === p.id && s.sys === sysId), b = s0 && p.beacons.find((x) => x.id === s0.via);
        systems.push({ id: sysId, mine: false, inst: true, fromGateLocal: b ? { x: b.x, y: b.y } : null, players: this._members(this.instances.get(sysId)).size }); continue;
      }
      systems.push({ id: sysId, mine: sysId === homeSys(p.id), fromGateLocal, partnerGateId });
    }
    // asteroid beacons: yours at home (glowing when linked to an instance with room), and each instance's way home
    const beacons = p.beacons.map((b) => ({ id: b.id, sys: homeSys(p.id), x: b.x, y: b.y, linked: !!(b.inst && this.instances.has(b.inst)) }));
    for (const sysId of vis) if (isInst(sysId)) beacons.push({ id: sysId + ":ret", sys: sysId, x: INST_RETURN_POS.x, y: INST_RETURN_POS.y, linked: true, back: true });

    const gates = [];
    for (const g of this.gates.values()) {
      if (!vis.has(g.sys)) continue;
      const mine = g.owner === p.id;
      const entry = { id: g.id, sys: g.sys, lx: g.lx, ly: g.ly, mine, state: g.state, connToSys: g.connToSys };
      if (mine) {
        entry.fuelMs = Math.max(0, Math.round(g.fuelMs));
        entry.sessionRemMs = g.state === "active" ? Math.max(0, Math.round(FUEL_SESSION_MAX_MS - g.sessionUsedMs)) : null;
      }
      gates.push(entry);
    }

    const ships = [];
    for (const s of this.ships.values()) {
      if (!vis.has(s.sys)) continue;
      const mine = s.owner === p.id;
      if (s.docked && !mine) continue;                        // docked ships are out of sight
      const entry = { id: s.id, sys: s.sys, type: s.type, name: s.name || null, x: +s.x.toFixed(4), y: +s.y.toFixed(4), h: +s.h.toFixed(3), mine };
      const w = s.wp;
      if (w && w.ph !== "align") {   // the owner sees both windows; others see the exit window only seconds before landing
        entry.wp = { ph: w.ph, el: now - w.at, dur: w.dur, dir: +w.dir.toFixed(4), fx: +w.fx.toFixed(4), fy: +w.fy.toFixed(4) };
        if (mine || w.ph === "exit" || (w.ph === "transit" && w.dur - (now - w.at) <= WARP_EXIT_SHOW_MS)) { entry.wp.ex = +w.ex.toFixed(4); entry.wp.ey = +w.ey.toFixed(4); }
      }
      if (mine) {
        if (s.moving) { entry.tx = +s.tx.toFixed(4); entry.ty = +s.ty.toFixed(4); }
        entry.docked = s.docked; entry.warp = s.warp; entry.moving = s.moving; entry.pilot = s.pilot ?? null; entry.hp = +s.hp.toFixed(1); entry.shield = +s.shield.toFixed(1);
        entry.spd = +Math.hypot(s.vx, s.vy).toFixed(4);
        entry.lasers = s.lasers.map((l) => ({ on: l.on, off: !!l.off, repeat: l.repeat, rock: l.rock, hp: l.hp, ax: l.ax, ay: l.ay, p: l.on ? Math.min(1, (now - l.start) / (l.dur || MINING_CYCLE_MS)) : 0, dur: l.dur || MINING_CYCLE_MS }));
        entry.laserRange = +this._laserRange(s).toFixed(3);
        const cyc = this._autoCycleMs(s);
        entry.yieldM3s = +this._yieldM3s(s).toFixed(3);
        entry.cap = { max: this._capMax(s), used: this._capUsed(s) };
        entry.heat = Math.round(s.heat || 0);
        entry.over = this._overloaded(s).map((w) => s.fit.indexOf(this._modFit(s, w)));   // fit indices running past capacity
        entry.fitHp = s.fit.map((f) => (f.burnt ? -1 : Math.round(f.hp ?? 100)));   // integrity per fitted module, -1 = burnt out
        entry.auto = { fitted: this._hasAuto(s), on: s.auto.on, off: !!s.auto.off, cyc, p: s.auto.on ? Math.max(0, 1 - (s.auto.next - now) / cyc) : 0 };
        entry.mining = s.lasers.some((l) => l.on);
        entry.targets = s.targets.map((tg) => ({ kind: tg.kind, id: tg.id, locked: tg.locked, p: tg.locked ? 1 : Math.min(1, 1 - (tg.lockAt - now) / (SHIP_TYPES[s.type].lockMs)) }));
        entry.canDock = !s.docked && s.sys === homeSys(p.id) && Math.hypot(s.x - STATION_POS.x, s.y - STATION_POS.y) <= DOCK_RADIUS_KM;
        const jb = !s.docked && !this._inWarp(s) && beacons.find((b) => b.sys === s.sys && b.linked && Math.hypot(s.x - b.x, s.y - b.y) <= BEACON_RANGE_KM);
        entry.jump = jb ? jb.id : null;                                // a beacon it can jump through right now
      }
      ships.push(entry);
    }

    const cans = [];
    for (const c of this.cans.values()) if (vis.has(c.sys)) cans.push({ id: c.id, sys: c.sys, x: c.x, y: c.y, mine: c.owner === p.id, owner: c.ownerName, left: Math.max(0, c.expiresAt - now), lockedFor: c.owner === p.id ? 0 : Math.max(0, (c.publicAt || 0) - now), empty: !c.inv.slots.length });
    return { t: "snap", st: this.simAt || now, systems, gates, ships, cans, beacons };   // st: server time, for client-side interpolation
  }
}
