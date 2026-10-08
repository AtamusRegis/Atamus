import {
  FUEL_START_MS, FUEL_SESSION_MAX_MS, HUB_MIN_WAIT_MS, HUB_SEEK_INTERVAL_MS, HUB_SEEK_CHANCE, HUB_SYS,
  SHIP_TYPES, SHIP_ARRIVE_EPS_KM, SHIP_SLOW_RADIUS_KM, SHIP_STEER,
  WARP_MULT, DOCK_RADIUS_KM, LASER_M3_PER_S, MINING_CYCLE_MS, LASER_RANGE_KM, AUTO_MINER_BASE_MS, AUTO_MINER_STEP_MS, STATION_HANGAR_M3,
} from "./constants.js";
import * as Inv from "./inventory.js";
import { STARGATE_CELLS, clampToSystem, STATION_POS } from "./geometry.js";
import { createBeltField, tickBeltField, fieldBelts } from "./belts.js";

const homeSys = (pid) => `sys:${pid}`;
const HIBERNATE_GRACE_MS = 60 * 1000;

export class World {
  constructor() {
    this.players = new Map(); // pid -> {id,name,send,offline}
    this.gates = new Map();   // gid -> gate
    this.ships = new Map();   // sid -> ship
  }

  addPlayer(id, name, send, saved = null) {
    const existing = this.players.get(id);
    if (existing) { existing.send = send; existing.offline = false; existing.name = name; this._ensureShips(id); return existing; }
    const now = Date.now();
    const beltField = saved && saved.beltField ? saved.beltField : createBeltField(id, now);
    if (saved && saved.beltField) tickBeltField(beltField, now);   // catch up while we were away
    const p = { id, name, send, offline: false, beltField, hangar: null, invDirty: false, credits: 0, licenses: (saved && saved.licenses) || {}, unlocked: (saved && saved.unlocked) || {} };
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
      if (g.state === "active" && downtime) {
        g.fuelMs -= downtime; g.sessionUsedMs += downtime;
        if (g.fuelMs <= 0 || g.sessionUsedMs >= FUEL_SESSION_MAX_MS) { g.fuelMs = Math.max(0, g.fuelMs); g.state = "closed"; g.sessionUsedMs = 0; g.connToSys = null; g.connToGate = null; }
      }
      this.gates.set(gid, g);
      // re-link with the partner gate if it's loaded (either side loading completes the link)
      if (g.connToGate) { const partner = this.gates.get(g.connToGate); if (partner && partner.state === "active") { partner.connToSys = g.sys; partner.connToGate = g.id; } }
    });
    for (const sh of (saved && saved.ships) || []) this.ships.set(sh.id, this._hydrateShip({ ...sh, owner: id, sys: homeSys(id) }));
    p.hangar = (saved && saved.hangar) || Inv.makeInv(STATION_HANGAR_M3);
    this._ensureShips(id);
    return p;
  }

  /** Everything about a player's system worth keeping across reloads/restarts. */
  exportState(id) {
    const ships = [...this.ships.values()].filter((s) => s.owner === id).map((s) => ({ id: s.id, type: s.type, x: s.x, y: s.y, tx: s.tx, ty: s.ty, moving: s.moving, h: s.h, docked: s.docked, warp: s.warp, lasers: s.lasers, auto: s.auto, targets: s.targets, inv: s.inv, hp: s.hp, shield: s.shield }));
    const gates = [...this.gates.values()].filter((g) => g.owner === id).map((g) => ({ id: g.id, state: g.state, fuelMs: g.fuelMs, sessionUsedMs: g.sessionUsedMs, activatedAt: g.activatedAt, connToSys: g.connToSys, connToGate: g.connToGate }));
    const p = this.players.get(id);
    return { ships, gates, beltField: p ? p.beltField : null, hangar: p ? p.hangar : null, licenses: p ? p.licenses : {}, unlocked: p ? p.unlocked : {}, savedAt: Date.now() };
  }

  // Fill in live/derived ship fields from a saved or fresh record.
  _hydrateShip(sh) {
    const t = SHIP_TYPES[sh.type] || SHIP_TYPES.chisel;
    return {
      ...sh, vx: 0, vy: 0, speed: t.speedKmps, radius: t.radiusKm, mass: t.mass,
      docked: !!sh.docked, warp: !!sh.warp, lasers: Array.from({ length: t.lasers || 0 }, (_, i) => ({ on: false, repeat: true, rock: null, hp: 0, ax: 0, ay: 0, start: 0, until: 0, ...((Array.isArray(sh.lasers) && sh.lasers[i]) || {}) })),
      auto: { on: false, next: 0, ...(sh.auto || {}) },
      hp: Number.isFinite(sh.hp) ? sh.hp : t.hp, shield: Number.isFinite(sh.shield) ? sh.shield : t.shield,
      targets: (sh.targets || []).map((tg) => ({ ...tg })),
      inv: { cargo: sh.inv?.cargo || Inv.makeInv(t.cargoM3), ore: sh.inv?.ore || Inv.makeInv(t.oreM3) },
    };
  }

  // Every pilot starts with a Chisel, parked just off the station at system center.
  _ensureShips(id) {
    const sid = `${id}:ship:0`;
    if (this.ships.has(sid)) return;
    const t = SHIP_TYPES.chisel;
    const sx = STATION_POS.x + 2.2, sy = STATION_POS.y + 2.2; // spawn beside the station
    this.ships.set(sid, this._hydrateShip({ id: sid, owner: id, sys: homeSys(id), type: "chisel", x: sx, y: sy, tx: sx, ty: sy, moving: false, h: Math.PI / 2 }));
  }

  // Logging off never drops the system immediately: it stays awake while a gate is
  // running or a ship still has an order, then hibernates after a short grace period.
  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    p.offline = true; p.offlineSince = Date.now(); p.send = () => {};
  }
  _busy(id) {
    for (const g of this.gates.values()) if (g.owner === id && g.state === "active") return true;
    for (const s of this.ships.values()) if (s.owner === id && s.moving) return true;
    return false;
  }
  _purge(id) {
    if (this.onBeforePurge) { try { this.onBeforePurge(id); } catch (e) { console.error("onBeforePurge", e); } }
    for (const [gid, g] of this.gates) if (g.owner === id) this.gates.delete(gid);
    for (const [sid, s] of this.ships) if (s.owner === id) this.ships.delete(sid);
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

  cmdMove(pid, shipIds, x, y) {
    if (!Array.isArray(shipIds)) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const owned = shipIds.map((sid) => this.ships.get(sid)).filter((s) => s && s.owner === pid);
    if (!owned.length) return;
    // clamp the destination into whatever system these ships are in (home for now)
    const t = clampToSystem(x, y);
    for (const s of owned) { if (s.docked) continue; s.tx = t.x; s.ty = t.y; s.moving = true; s.warp = false; }
  }

  // ---- targeting / mining / docking / warp ----
  _rockOf(pid, rockId) {
    const p = this.players.get(pid); if (!p) return null;
    for (const sl of p.beltField.slots) if (sl.belt) { const r = sl.belt.rocks.find((r) => r.id === rockId); if (r) return { rock: r, belt: sl.belt }; }
    return null;
  }
  _targetPos(pid, tg) {
    if (tg.kind === "rock") { const f = this._rockOf(pid, tg.id); return f ? { x: f.rock.x, y: f.rock.y } : null; }
    if (tg.kind === "gate") { const g = this.gates.get(tg.id); return g ? { x: g.lx, y: g.ly } : null; }
    if (tg.kind === "ship") { const o = this.ships.get(tg.id); return o ? { x: o.x, y: o.y } : null; }
    if (tg.kind === "station") return { x: STATION_POS.x, y: STATION_POS.y };
    return null;
  }
  cmdLock(pid, shipId, kind, id) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid || sh.docked) return;
    const t = SHIP_TYPES[sh.type];
    const i = sh.targets.findIndex((tg) => tg.kind === kind && tg.id === id);
    if (i >= 0) { sh.targets.splice(i, 1); for (const L of sh.lasers) if (L.rock === id) this._laserStop(L); return; }   // toggle off: breaks any cycle on it
    if (sh.targets.length >= t.maxTargets) return;
    const pos = this._targetPos(pid, { kind, id }); if (!pos) return;
    if (Math.hypot(pos.x - sh.x, pos.y - sh.y) > t.targetRangeKm) return;                    // must be in range to begin a lock
    sh.targets.push({ kind, id, lockAt: Date.now() + t.lockMs, locked: false });
  }
  _laserStop(L) { L.on = false; L.repeat = true; L.rock = null; L.start = 0; L.until = 0; }
  _laserStart(sh, L, i, rockId, f, now) {
    const t = SHIP_TYPES[sh.type];
    const a = Math.atan2(sh.y - f.rock.y, sh.x - f.rock.x) + (Math.random() - 0.5) * Math.PI * 0.9, arm = t.arms[i % t.arms.length];
    L.on = true; L.repeat = true; L.rock = rockId; L.hp = arm[Math.floor(Math.random() * arm.length)];
    const d = f.rock.r * (0.15 + Math.random() * 0.3);   // sprites are irregular with transparent margins: stay well inside the visible rock
    L.ax = +(f.rock.x + Math.cos(a) * d).toFixed(4); L.ay = +(f.rock.y + Math.sin(a) * d).toFixed(4);
    L.start = now; L.until = now + MINING_CYCLE_MS;
  }
  _lockedRock(sh, rockId) { return sh.targets.find((t) => t.kind === "rock" && t.locked && (rockId == null || t.id === rockId)); }
  _inLaserRange(sh, f) { return Math.hypot(f.rock.x - sh.x, f.rock.y - sh.y) <= LASER_RANGE_KM; }
  // All lasers at once: on -> spread over the locked rocks in range; off -> stop repeating.
  cmdMine(pid, shipId, on) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid || sh.docked) return;
    if (!on) { for (const L of sh.lasers) if (L.on) L.repeat = false; return; }
    const now = Date.now();
    const rocks = sh.targets.filter((tg) => tg.kind === "rock" && tg.locked).map((tg) => ({ tg, f: this._rockOf(pid, tg.id) })).filter((x) => x.f && this._inLaserRange(sh, x.f));
    if (!rocks.length) return;
    sh.lasers.forEach((L, i) => { if (L.on) { L.repeat = true; return; } const r = rocks[i % rocks.length]; this._laserStart(sh, L, i, r.tg.id, r.f, now); });
  }
  // One laser. Active: a click toggles whether it repeats after this cycle (the cycle itself
  // runs to completion; a laser can't be retargeted mid-cycle). Idle: start on the rock.
  cmdLaser(pid, shipId, idx, on, rockId) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid || sh.docked) return;
    const L = sh.lasers[+idx]; if (!L) return;
    if (L.on) { if (!on) L.repeat = false; else if (rockId == null || rockId === L.rock) L.repeat = true; return; }   // a different rock has to wait for the cycle
    if (!on) return;
    const tg = this._lockedRock(sh, rockId); if (!tg) return;
    const f = this._rockOf(pid, tg.id); if (!f || !this._inLaserRange(sh, f)) return;
    this._laserStart(sh, L, +idx, tg.id, f, Date.now());
  }
  // Auto-miner module: on each of its cycles it puts every idle laser on the primary (first locked) rock.
  cmdAuto(pid, shipId, on) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid || sh.docked) return;
    if (!on) { sh.auto.on = false; return; }
    if (!this._lockedRock(sh)) return;
    sh.auto.on = true; sh.auto.next = 0;                       // fires on the next tick
  }
  _autoCycleMs(pid) { const p = this.players.get(pid), lvl = Math.max(1, (p && p.licenses.auto_miner) || 1); return Math.max(30_000, AUTO_MINER_BASE_MS - AUTO_MINER_STEP_MS * (lvl - 1)); }
  cmdDock(pid, shipId, dock) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid) return;
    if (dock) {
      if (sh.docked || Math.hypot(sh.x - STATION_POS.x, sh.y - STATION_POS.y) > DOCK_RADIUS_KM) return;
      sh.docked = true; sh.moving = false; sh.warp = false; for (const L of sh.lasers) this._laserStop(L); sh.auto.on = false; sh.targets = []; sh.vx = sh.vy = 0;
      sh.hp = SHIP_TYPES[sh.type].hp; sh.shield = SHIP_TYPES[sh.type].shield;            // docked: repaired and recharged
    } else {
      if (!sh.docked) return;
      sh.docked = false; sh.x = STATION_POS.x + 2.2; sh.y = STATION_POS.y + 2.2; sh.tx = sh.x; sh.ty = sh.y;
    }
    this._markInv(pid);
  }
  cmdWarp(pid, shipId) {
    const sh = this.ships.get(shipId); if (!sh || sh.owner !== pid || sh.docked || !sh.moving) return;
    sh.warp = true;
  }
  _inv(pid, ref) {
    const p = this.players.get(pid); if (!p) return null;
    if (ref.owner === "station") return { inv: p.hangar, docked: true };
    const sh = this.ships.get(ref.id); if (!sh || sh.owner !== pid) return null;
    return { inv: sh.inv[ref.inv], docked: sh.docked, ship: sh };
  }
  cmdInvMove(pid, from, to, qty) {
    const a = this._inv(pid, from), b = this._inv(pid, to); if (!a || !a.inv || !b || !b.inv) return;
    // transfers between different holders require docking (station <-> ship, ship <-> ship)
    const sameHolder = from.owner === to.owner && (from.owner === "station" || from.id === to.id);
    if (!sameHolder && !(a.docked && b.docked)) return;
    if (Inv.move(a.inv, +from.slot, b.inv, to.slot == null ? null : +to.slot, qty) > 0) this._markInv(pid);
  }
  // Sell ore straight out of the hangar or a docked ship's hold. Credits are kept on the
  // user row; onCredits(pid, delta) persists the change.
  cmdSell(pid, ref, slot, qty) {
    const a = this._inv(pid, ref); if (!a || !a.inv || !a.docked) return;
    const st = a.inv.slots[+slot]; if (!st) return;
    const def = Inv.ITEMS[st.item]; if (!def || !def.price) return;
    const n = Inv.take(a.inv, +slot, qty == null ? st.qty : +qty); if (n <= 0) return;
    const p = this.players.get(pid), delta = n * def.price;
    p.credits += delta; this._markInv(pid);
    if (this.onCredits) { try { this.onCredits(pid, delta); } catch (e) { console.error("onCredits", e); } }
  }
  cmdInvSplit(pid, ref, slot, qty) { const a = this._inv(pid, ref); if (a && a.inv && Inv.split(a.inv, +slot, +qty) > 0) this._markInv(pid); }
  cmdJettison(pid, ref, slot, qty) {
    const a = this._inv(pid, ref); if (!a || !a.inv) return;
    const st = a.inv.slots[+slot]; if (!st) return;
    if (Inv.take(a.inv, +slot, qty == null ? st.qty : +qty) > 0) this._markInv(pid);   // gone for good (no wrecks yet)
  }
  // Station market: buy into the hangar.
  cmdBuy(pid, itemKey, qty) {
    const p = this.players.get(pid); if (!p) return;
    const offer = Inv.MARKET.find((m) => m.key === itemKey); if (!offer) return;
    const n = Math.max(1, Math.floor(+qty || 1)), cost = offer.price * n;
    if (p.credits < cost) { p.send(JSON.stringify({ t: "sys", text: "Not enough credits." })); return; }
    if (Inv.canAdd(p.hangar, itemKey, n) < n) { p.send(JSON.stringify({ t: "sys", text: "No room in the hangar." })); return; }
    Inv.add(p.hangar, itemKey, n); p.credits -= cost; this._markInv(pid);
    if (this.onCredits) { try { this.onCredits(pid, -cost); } catch (e) { console.error("onCredits", e); } }
  }
  // Read a training manual: consumes it and unlocks that license for training.
  cmdRead(pid, ref, slot) {
    const a = this._inv(pid, ref); if (!a || !a.inv) return false;
    const st = a.inv.slots[+slot]; const def = st && Inv.ITEMS[st.item]; if (!def || def.kind !== "manual") return false;
    const p = this.players.get(pid);
    if (p.unlocked[def.license]) { p.send(JSON.stringify({ t: "sys", text: "You already know this manual." })); return false; }
    Inv.take(a.inv, +slot, 1); p.unlocked[def.license] = true; this._markInv(pid);
    p.send(JSON.stringify({ t: "sys", text: def.name.replace(" Manual", "") + " can now be trained." }));
    return true;
  }
  cmdInvSort(pid, ref) { const a = this._inv(pid, ref); if (a && a.inv) { Inv.sort(a.inv); this._markInv(pid); } }
  _markInv(pid) { const p = this.players.get(pid); if (p) p.invDirty = true; }
  inventoriesFor(pid) {
    const p = this.players.get(pid); if (!p) return null;
    const ships = {};
    for (const sh of this.ships.values()) if (sh.owner === pid) ships[sh.id] = { cargo: Inv.summary(sh.inv.cargo), ore: Inv.summary(sh.inv.ore) };
    return { t: "inv", ships, hangar: Inv.summary(p.hangar), credits: p.credits, unlocked: p.unlocked };
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
      sh.vx = 0; sh.vy = 0; sh.moving = false; sh.cargo = null;
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
    return set;
  }

  // ---- tick ----
  tick(dtSec) {
    const now = Date.now(), dtMs = dtSec * 1000;
    for (const g of this.gates.values()) {
      if (g.state !== "active") continue;
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
    for (const p of this.players.values()) {
      if (tickBeltField(p.beltField, now) && !p.offline) p.send(JSON.stringify({ t: "belts", belts: fieldBelts(p.beltField) }));
    }

    for (const p of [...this.players.values()]) {
      if (!p.offline) continue;
      if (!this._busy(p.id) && now - (p.offlineSince || 0) > HIBERNATE_GRACE_MS) this._purge(p.id);   // hibernate
    }
  }

  _tickTargeting(dtSec, now) {
    for (const sh of this.ships.values()) {
      if (sh.docked) continue;
      const t = SHIP_TYPES[sh.type]; const owner = this.players.get(sh.owner); if (!owner) continue;
      // locks: progress, and drop anything that left range or vanished
      for (let i = sh.targets.length - 1; i >= 0; i--) {
        const tg = sh.targets[i], pos = this._targetPos(sh.owner, tg);
        if (!pos || Math.hypot(pos.x - sh.x, pos.y - sh.y) > t.targetRangeKm) { sh.targets.splice(i, 1); continue; }
        if (!tg.locked && now >= tg.lockAt) tg.locked = true;
      }
      // auto-miner: each of its cycles, (re)activate idle lasers on the primary locked rock; off when nothing is left
      if (sh.auto.on && now >= sh.auto.next) {
        const cands = sh.targets.filter((tg) => tg.kind === "rock" && tg.locked).map((tg) => ({ tg, f: this._rockOf(sh.owner, tg.id) })).filter((x) => x.f && this._inLaserRange(sh, x.f));
        if (!cands.length) sh.auto.on = false;
        else { const r = cands[0]; sh.lasers.forEach((L, i) => { if (!L.on) this._laserStart(sh, L, i, r.tg.id, r.f, now); else L.repeat = true; }); sh.auto.next = now + this._autoCycleMs(sh.owner); }
      }
      // mining lasers: a cycle only breaks when its rock is gone / out of range or the hold is full;
      // the ore lands when the cycle completes, then the laser repeats (unless told not to)
      for (let i = 0; i < sh.lasers.length; i++) {
        const L = sh.lasers[i]; if (!L.on) continue;
        const tg = L.rock && this._lockedRock(sh, L.rock), f = tg ? this._rockOf(sh.owner, L.rock) : null;
        if (!f || !this._inLaserRange(sh, f)) { this._laserStop(L); continue; }
        if (now < L.until) continue;
        const def = Inv.ITEMS[f.rock.ore];
        const units = Math.min(Math.floor(LASER_M3_PER_S * MINING_CYCLE_MS / 1000 / def.unitM3), Math.ceil(f.rock.m3 / def.unitM3));
        const got = units > 0 ? Inv.add(sh.inv.ore, f.rock.ore, units) : 0;
        if (got <= 0) { this._laserStop(L); continue; }                        // hold full: laser stops, target stays
        f.rock.m3 = Math.max(0, +(f.rock.m3 - got * def.unitM3).toFixed(3));
        if (f.rock.m3 < def.unitM3) f.rock.m3 = 0;                                // less than one unit left: mined out
        owner.invDirty = true; (owner.rockDirty ||= new Map()).set(f.rock.id, f.rock.m3);
        if (f.rock.m3 <= 0) {
          f.belt.rocks = f.belt.rocks.filter((r) => r.id !== f.rock.id);
          for (const o of this.ships.values()) { o.targets = o.targets.filter((x) => x.id !== f.rock.id); for (const q of o.lasers) if (q.rock === f.rock.id) this._laserStop(q); }
          continue;
        }
        if (L.repeat) this._laserStart(sh, L, i, L.rock, f, now); else this._laserStop(L);
      }
    }
  }

  // Steering + mass-weighted separation. Ships steer toward their target, can't
  // overlap, and bump each other apart (heavier wins ground); contact kills the
  // inward velocity so they settle against each other instead of jittering.
  _tickShips(dtSec) {
    const ships = [...this.ships.values()];
    const steer = 1 - Math.exp(-SHIP_STEER * dtSec);

    // 1) steer velocities toward targets, integrate
    for (const s of ships) {
      if (s.docked) { s.vx = 0; s.vy = 0; continue; }
      if (s.moving) {
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
        if (d <= SHIP_ARRIVE_EPS_KM) { s.moving = false; s.warp = false; }
        else {
          const vmax = s.warp ? s.speed * WARP_MULT : s.speed;
          const spd = Math.min(vmax, (d / SHIP_SLOW_RADIUS_KM) * vmax); // ease to a stop
          const dvx = (dx / d) * spd, dvy = (dy / d) * spd;
          s.vx += (dvx - s.vx) * steer; s.vy += (dvy - s.vy) * steer;
        }
      }
      if (!s.moving) { s.vx *= 0.6; s.vy *= 0.6; if (Math.hypot(s.vx, s.vy) < 1e-3) { s.vx = 0; s.vy = 0; } }
      s.x += s.vx * dtSec; s.y += s.vy * dtSec;
      if (Math.hypot(s.vx, s.vy) > 0.05) s.h = Math.atan2(s.vy, s.vx); // face travel direction

    }

    // 2) resolve overlaps pairwise (same system), position-corrected by mass
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = ships[i], b = ships[j];
        if (a.sys !== b.sys || a.docked || b.docked) continue;
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
      const c = clampToSystem(s.x, s.y); s.x = c.x; s.y = c.y;
      if (s.moving && Math.hypot(s.tx - s.x, s.ty - s.y) <= SHIP_ARRIVE_EPS_KM) { s.moving = false; s.warp = false; }
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
      systems.push({ id: sysId, mine: sysId === homeSys(p.id), fromGateLocal, partnerGateId });
    }

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
      const entry = { id: s.id, sys: s.sys, type: s.type, x: +s.x.toFixed(4), y: +s.y.toFixed(4), h: +s.h.toFixed(3), mine };
      if (mine) {
        if (s.moving) { entry.tx = +s.tx.toFixed(4); entry.ty = +s.ty.toFixed(4); }
        entry.docked = s.docked; entry.warp = s.warp; entry.moving = s.moving; entry.hp = +s.hp.toFixed(1); entry.shield = +s.shield.toFixed(1);
        entry.spd = +Math.hypot(s.vx, s.vy).toFixed(4);
        entry.lasers = s.lasers.map((l) => ({ on: l.on, repeat: l.repeat, rock: l.rock, hp: l.hp, ax: l.ax, ay: l.ay, p: l.on ? Math.min(1, (now - l.start) / MINING_CYCLE_MS) : 0 }));
        entry.auto = { on: s.auto.on, cyc: this._autoCycleMs(p.id), p: s.auto.on ? Math.max(0, 1 - (s.auto.next - now) / this._autoCycleMs(p.id)) : 0 };
        entry.mining = s.lasers.some((l) => l.on);
        entry.targets = s.targets.map((tg) => ({ kind: tg.kind, id: tg.id, locked: tg.locked, p: tg.locked ? 1 : Math.min(1, 1 - (tg.lockAt - now) / (SHIP_TYPES[s.type].lockMs)) }));
        entry.canDock = !s.docked && Math.hypot(s.x - STATION_POS.x, s.y - STATION_POS.y) <= DOCK_RADIUS_KM;
      }
      ships.push(entry);
    }

    return { t: "snap", systems, gates, ships };
  }
}
