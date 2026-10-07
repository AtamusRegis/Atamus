import {
  SHIP_SPEED_KMPS, SHIP_HP, MAX_SHIPS_PER_PLAYER,
  COMBAT_RANGE_KM, COMBAT_DPS,
  FUEL_START_MS, FUEL_SESSION_MAX_MS, HUB_MIN_WAIT_MS, HUB_SEEK_INTERVAL_MS, HUB_SEEK_CHANCE,
  GATE_TRANSFER_RADIUS_KM, ARRIVAL_OFFSET_KM, STATION_RADIUS_KM, HUB_SYS,
} from "./constants.js";
import { STARGATE_CELLS, STATION_POS, clampToSystem, dist } from "./geometry.js";

const homeSys = (pid) => `sys:${pid}`;
let nextShipId = 1;

export class World {
  constructor() {
    this.players = new Map(); // pid -> {id,name,send,offline}
    this.ships = new Map();   // sid -> ship
    this.gates = new Map();   // gid -> gate
  }

  // ---- players ----
  addPlayer(id, name, send) {
    const existing = this.players.get(id);
    if (existing) { existing.send = send; existing.offline = false; existing.name = name; return existing; }
    const p = { id, name, send, offline: false };
    this.players.set(id, p);
    const sys = homeSys(id);
    STARGATE_CELLS.forEach((cell, i) => {
      this.gates.set(`${id}:${i}`, {
        id: `${id}:${i}`, owner: id, sys, lx: cell.x, ly: cell.y,
        state: "closed", fuelMs: FUEL_START_MS, sessionUsedMs: 0, activatedAt: 0,
        connToSys: null, connToGate: null, lastSeek: 0,
      });
    });
    for (let i = 0; i < 2; i++) this._spawnAtStation(id);
    return p;
  }

  removePlayer(id) {
    const anyActive = [...this.gates.values()].some((g) => g.owner === id && g.state === "active");
    const p = this.players.get(id);
    if (p && anyActive) { p.offline = true; p.send = () => {}; return; } // keep system alive until gates close
    this._purge(id);
  }
  _purge(id) {
    for (const [sid, s] of this.ships) if (s.owner === id) this.ships.delete(sid);
    for (const [gid, g] of this.gates) if (g.owner === id) this.gates.delete(gid);
    this.players.delete(id);
  }

  _spawnAtStation(pid) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * STATION_RADIUS_KM;
    this.ships.set(nextShipId, {
      id: nextShipId, owner: pid, sys: homeSys(pid),
      x: STATION_POS.x + Math.cos(a) * r, y: STATION_POS.y + Math.sin(a) * r,
      tx: STATION_POS.x, ty: STATION_POS.y, hp: SHIP_HP, heading: -Math.PI / 2, alive: true, viaGate: null,
    });
    this.ships.get(nextShipId).tx = this.ships.get(nextShipId).x;
    this.ships.get(nextShipId).ty = this.ships.get(nextShipId).y;
    nextShipId++;
  }

  _aliveCount(pid) { let n = 0; for (const s of this.ships.values()) if (s.owner === pid && s.alive) n++; return n; }
  _enemiesInSystem(pid) {
    const sys = homeSys(pid);
    for (const s of this.ships.values()) if (s.alive && s.sys === sys && s.owner !== pid) return true;
    return false;
  }
  _awayShips(gateId) {
    let n = 0;
    for (const s of this.ships.values()) if (s.alive && s.viaGate === gateId) n++;
    return n;
  }

  // ---- commands ----
  cmdMove(pid, shipId, x, y) {
    const s = this.ships.get(shipId);
    if (!s || !s.alive || s.owner !== pid) return;
    const c = clampToSystem(+x, +y); s.tx = c.x; s.ty = c.y;
  }
  cmdSpawn(pid) { if (this._aliveCount(pid) < MAX_SHIPS_PER_PLAYER) this._spawnAtStation(pid); }

  cmdGate(pid, gateId, open) {
    const g = this.gates.get(gateId);
    if (!g || g.owner !== pid) return;
    if (open) {
      if (g.state === "closed" && g.fuelMs > 0) { g.state = "active"; g.sessionUsedMs = 0; g.lastSeek = 0; g.activatedAt = Date.now(); }
    } else {
      if (g.state !== "active") return;
      if (this._enemiesInSystem(pid)) return;           // can't terminate with enemies present
      this._closeGate(g);                                // destroys any ships that went through
    }
  }

  cmdChat(pid, text) {
    const p = this.players.get(pid);
    if (!p || typeof text !== "string") return;
    const clean = text.trim().slice(0, 240); if (!clean) return;
    const vis = this._visibleSystems(pid);
    const msg = JSON.stringify({ t: "chat", from: p.name, text: clean, ts: Date.now() });
    for (const other of this.players.values()) {
      if (other.offline) continue;
      const ov = this._visibleSystems(other.id);
      for (const s of ov) if (vis.has(s)) { other.send(msg); break; }
    }
  }

  // ---- connections ----
  _connectGates(a, b) { a.connToSys = b.sys; a.connToGate = b.id; b.connToSys = a.sys; b.connToGate = a.id; }
  _connectToHub(g) { g.connToSys = HUB_SYS; g.connToGate = null; }

  _endConnection(g) {
    for (const s of this.ships.values()) if (s.viaGate === g.id && s.alive) { s.alive = false; this.ships.delete(s.id); }
    const partner = g.connToGate ? this.gates.get(g.connToGate) : null;
    if (partner) {
      for (const s of this.ships.values()) if (s.viaGate === partner.id && s.alive) { s.alive = false; this.ships.delete(s.id); }
      partner.connToSys = null; partner.connToGate = null; // partner stays active, resumes searching
    }
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

    // movement
    for (const s of this.ships.values()) {
      if (!s.alive) continue;
      const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
      if (d > 1e-4) {
        s.heading = Math.atan2(dy, dx);
        const step = SHIP_SPEED_KMPS * dtSec;
        if (step >= d) { s.x = s.tx; s.y = s.ty; } else { s.x += dx / d * step; s.y += dy / d * step; }
        const c = clampToSystem(s.x, s.y); s.x = c.x; s.y = c.y;
      }
    }

    // gates: burn fuel, search for connections, time out
    for (const g of this.gates.values()) {
      if (g.state !== "active") continue;
      g.fuelMs -= dtMs; g.sessionUsedMs += dtMs;
      if (g.fuelMs <= 0) { g.fuelMs = 0; this._closeGate(g); continue; }
      if (g.sessionUsedMs >= FUEL_SESSION_MAX_MS) { this._closeGate(g); continue; }
      if (!g.connToSys) {
        // Always try to pair with another waiting player gate (first priority).
        for (const o of this.gates.values()) {
          if (o !== g && o.state === "active" && !o.connToSys && o.owner !== g.owner) { this._connectGates(g, o); break; }
        }
        // Only fall back to the hub after the minimum wait, to give players a chance.
        if (!g.connToSys && now - g.activatedAt >= HUB_MIN_WAIT_MS && now - g.lastSeek >= HUB_SEEK_INTERVAL_MS) {
          g.lastSeek = now;
          if (Math.random() < HUB_SEEK_CHANCE) this._connectToHub(g);
        }
      }
    }

    // fly-through
    for (const s of this.ships.values()) {
      if (!s.alive) continue;
      for (const g of this.gates.values()) {
        if (g.sys !== s.sys || g.state !== "active" || !g.connToSys) continue;
        if (dist(s.x, s.y, g.lx, g.ly) > GATE_TRANSFER_RADIUS_KM) continue;
        this._transfer(s, g); break;
      }
    }

    // combat
    const bySys = new Map();
    for (const s of this.ships.values()) { if (!s.alive) continue; const a = bySys.get(s.sys) || (bySys.set(s.sys, []), bySys.get(s.sys)); a.push(s); }
    for (const list of bySys.values()) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.owner === b.owner) continue;
        if (dist(a.x, a.y, b.x, b.y) <= COMBAT_RANGE_KM) { const dmg = COMBAT_DPS * dtSec; a.hp -= dmg; b.hp -= dmg; }
      }
    }
    for (const s of this.ships.values()) if (s.alive && s.hp <= 0) {
      s.alive = false; this.ships.delete(s.id);
      const o = this.players.get(s.owner); if (o && !o.offline) o.send(JSON.stringify({ t: "sys", text: "A ship was destroyed." }));
    }

    // purge offline players once their gates are all closed
    for (const p of [...this.players.values()]) {
      if (!p.offline) continue;
      const stillActive = [...this.gates.values()].some((g) => g.owner === p.id && g.state === "active");
      if (!stillActive) this._purge(p.id);
    }
  }

  _transfer(s, g) {
    if (g.connToSys === HUB_SYS) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 8;
      s.sys = HUB_SYS; s.x = Math.cos(a) * r; s.y = Math.sin(a) * r;
    } else {
      const partner = g.connToGate ? this.gates.get(g.connToGate) : null; if (!partner) return;
      const len = Math.hypot(partner.lx, partner.ly) || 1;
      s.sys = partner.sys; s.x = partner.lx - partner.lx / len * ARRIVAL_OFFSET_KM; s.y = partner.ly - partner.ly / len * ARRIVAL_OFFSET_KM;
    }
    s.tx = s.x; s.ty = s.y; s.viaGate = g.id;
  }

  // ---- snapshot ----
  snapshotFor(p) {
    const vis = this._visibleSystems(p.id);
    const myGates = [...this.gates.values()].filter((g) => g.owner === p.id);
    const enemies = this._enemiesInSystem(p.id);

    const systems = [];
    for (const sysId of vis) {
      let fromGateLocal = null, partnerGateId = null;
      if (sysId !== homeSys(p.id)) {
        const g = myGates.find((x) => x.state === "active" && x.connToSys === sysId);
        if (g) { fromGateLocal = { x: g.lx, y: g.ly }; partnerGateId = g.connToGate; }
      }
      systems.push({ id: sysId, mine: sysId === homeSys(p.id), fromGateLocal, partnerGateId });
    }

    const ships = [];
    for (const s of this.ships.values()) {
      if (!s.alive || !vis.has(s.sys)) continue;
      const o = this.players.get(s.owner);
      ships.push({ id: s.id, sys: s.sys, o: o ? o.name : "?", mine: s.owner === p.id,
        x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100,
        hp: Math.max(0, Math.round(s.hp)), hd: Math.round(s.heading * 1000) / 1000 });
    }

    const gates = [];
    for (const g of this.gates.values()) {
      if (!vis.has(g.sys)) continue;
      const mine = g.owner === p.id;
      const entry = { id: g.id, sys: g.sys, lx: g.lx, ly: g.ly, mine, state: g.state, connToSys: g.connToSys };
      if (mine) {
        entry.fuelMs = Math.max(0, Math.round(g.fuelMs));
        entry.sessionRemMs = g.state === "active" ? Math.max(0, Math.round(FUEL_SESSION_MAX_MS - g.sessionUsedMs)) : null;
        entry.canClose = !enemies;
        entry.away = this._awayShips(g.id);
      }
      gates.push(entry);
    }

    const stations = [];
    for (const sysId of vis) if (sysId.startsWith("sys:") && sysId !== HUB_SYS) stations.push({ sys: sysId, x: STATION_POS.x, y: STATION_POS.y });

    return { t: "snap", systems, ships, gates, stations, enemies, canSpawn: this._aliveCount(p.id) < MAX_SHIPS_PER_PLAYER };
  }
}
