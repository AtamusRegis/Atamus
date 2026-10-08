import {
  FUEL_START_MS, FUEL_SESSION_MAX_MS, HUB_MIN_WAIT_MS, HUB_SEEK_INTERVAL_MS, HUB_SEEK_CHANCE, HUB_SYS,
  SHIP_TYPES, SHIP_ARRIVE_EPS_KM, SHIP_SLOW_RADIUS_KM, SHIP_STEER,
} from "./constants.js";
import { STARGATE_CELLS, clampToSystem, STATION_POS } from "./geometry.js";
import { createBeltField, tickBeltField, fieldBelts } from "./belts.js";

const homeSys = (pid) => `sys:${pid}`;

export class World {
  constructor() {
    this.players = new Map(); // pid -> {id,name,send,offline}
    this.gates = new Map();   // gid -> gate
    this.ships = new Map();   // sid -> ship
  }

  addPlayer(id, name, send) {
    const existing = this.players.get(id);
    if (existing) { existing.send = send; existing.offline = false; existing.name = name; this._ensureShips(id); return existing; }
    const p = { id, name, send, offline: false, beltField: createBeltField(id) };
    this.players.set(id, p);
    STARGATE_CELLS.forEach((cell, i) => {
      this.gates.set(`${id}:${i}`, {
        id: `${id}:${i}`, owner: id, sys: homeSys(id), lx: cell.x, ly: cell.y,
        state: "closed", fuelMs: FUEL_START_MS, sessionUsedMs: 0, activatedAt: 0,
        connToSys: null, connToGate: null, lastSeek: 0,
      });
    });
    this._ensureShips(id);
    return p;
  }

  // Every pilot starts with a Chisel, parked just off the station at system center.
  _ensureShips(id) {
    const sid = `${id}:ship:0`;
    if (this.ships.has(sid)) return;
    const t = SHIP_TYPES.chisel;
    const sx = STATION_POS.x + 4, sy = STATION_POS.y + 4; // spawn beside the station
    this.ships.set(sid, {
      id: sid, owner: id, sys: homeSys(id), type: "chisel",
      x: sx, y: sy, vx: 0, vy: 0, tx: sx, ty: sy, moving: false, h: Math.PI / 2,
      speed: t.speedKmps, radius: t.radiusKm, mass: t.mass,
    });
  }

  removePlayer(id) {
    const anyActive = [...this.gates.values()].some((g) => g.owner === id && g.state === "active");
    const p = this.players.get(id);
    if (p && anyActive) { p.offline = true; p.send = () => {}; return; }
    this._purge(id);
  }
  _purge(id) {
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
    for (const s of owned) { s.tx = t.x; s.ty = t.y; s.moving = true; }
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
    if (partner) { partner.connToSys = null; partner.connToGate = null; }
    g.connToSys = null; g.connToGate = null;
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
    for (const p of this.players.values()) {
      if (tickBeltField(p.beltField, now) && !p.offline) p.send(JSON.stringify({ t: "belts", belts: fieldBelts(p.beltField) }));
    }

    for (const p of [...this.players.values()]) {
      if (!p.offline) continue;
      const stillActive = [...this.gates.values()].some((g) => g.owner === p.id && g.state === "active");
      if (!stillActive) this._purge(p.id);
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
      if (s.moving) {
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
        if (d <= SHIP_ARRIVE_EPS_KM) { s.moving = false; }
        else {
          const spd = Math.min(s.speed, (d / SHIP_SLOW_RADIUS_KM) * s.speed); // ease to a stop
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
        if (a.sys !== b.sys) continue;
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
      if (s.moving && Math.hypot(s.tx - s.x, s.ty - s.y) <= SHIP_ARRIVE_EPS_KM) s.moving = false;
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
        entry.canClose = true;
        entry.away = 0;
      }
      gates.push(entry);
    }

    const ships = [];
    for (const s of this.ships.values()) {
      if (!vis.has(s.sys)) continue;
      const mine = s.owner === p.id;
      const entry = { id: s.id, sys: s.sys, type: s.type, x: +s.x.toFixed(4), y: +s.y.toFixed(4), h: +s.h.toFixed(3), mine };
      if (mine && s.moving) { entry.tx = +s.tx.toFixed(4); entry.ty = +s.ty.toFixed(4); }
      ships.push(entry);
    }

    return { t: "snap", systems, gates, ships, enemies: false };
  }
}
