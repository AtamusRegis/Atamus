import {
  SHIP_SPEED_KMPS, SHIP_HP, MAX_SHIPS_PER_PLAYER,
  COMBAT_RANGE_KM, COMBAT_DPS,
  RECHARGE_MS, CONNECTION_MS, SEEK_TIMEOUT_MS,
  GATE_TRANSFER_RADIUS_KM, ARRIVAL_OFFSET_KM,
  STATION_RADIUS_KM, HUB_SYS,
} from "./constants.js";
import { STARGATE_CELLS, STATION_POS, clampToSystem, dist } from "./geometry.js";

const homeSys = (pid) => `sys:${pid}`;
let nextShipId = 1;

export class World {
  constructor() {
    this.players = new Map(); // pid -> {id,name,send}
    this.ships = new Map();   // sid -> {id,owner,sys,x,y,tx,ty,hp,heading,alive,viaGate}
    this.gates = new Map();   // gid -> {id,owner,sys,lx,ly,state,chargeAt,seekUntil,connToSys,connToGate,connEndsAt}
  }

  // ---- players ----
  addPlayer(id, name, send) {
    if (this.players.has(id)) this.removePlayer(id);
    this.players.set(id, { id, name, send });
    const sys = homeSys(id);
    STARGATE_CELLS.forEach((cell, i) => {
      const gid = `${id}:${i}`;
      this.gates.set(gid, {
        id: gid, owner: id, sys, lx: cell.x, ly: cell.y,
        state: "charged", chargeAt: 0, seekUntil: 0,
        connToSys: null, connToGate: null, connEndsAt: 0,
      });
    });
    for (let i = 0; i < 2; i++) this._spawnAtStation(id);
  }

  removePlayer(id) {
    for (const [sid, s] of this.ships) if (s.owner === id) this.ships.delete(sid);
    for (const [gid, g] of this.gates) {
      if (g.owner === id) { this._closeGate(g, true); this.gates.delete(gid); }
    }
    this.players.delete(id);
  }

  _spawnAtStation(pid) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * STATION_RADIUS_KM;
    const x = STATION_POS.x + Math.cos(a) * r, y = STATION_POS.y + Math.sin(a) * r;
    const ship = {
      id: nextShipId++, owner: pid, sys: homeSys(pid),
      x, y, tx: x, ty: y, hp: SHIP_HP, heading: -Math.PI / 2, alive: true, viaGate: null,
    };
    this.ships.set(ship.id, ship);
  }

  _aliveCount(pid) {
    let n = 0; for (const s of this.ships.values()) if (s.owner === pid && s.alive) n++; return n;
  }

  // ---- commands ----
  cmdMove(pid, shipId, x, y) {
    const s = this.ships.get(shipId);
    if (!s || !s.alive || s.owner !== pid) return;
    const c = clampToSystem(+x, +y);
    s.tx = c.x; s.ty = c.y;
  }

  cmdActivate(pid, gateId) {
    const g = this.gates.get(gateId);
    if (!g || g.owner !== pid || g.state !== "charged") return;
    g.state = "seeking";
    g.seekUntil = Date.now() + SEEK_TIMEOUT_MS;
    // Try to pair immediately with another seeking gate from a different player.
    for (const other of this.gates.values()) {
      if (other !== g && other.state === "seeking" && other.owner !== pid) {
        this._connectGates(g, other);
        return;
      }
    }
  }

  cmdSpawn(pid) {
    if (this._aliveCount(pid) < MAX_SHIPS_PER_PLAYER) this._spawnAtStation(pid);
  }

  cmdChat(pid, text) {
    const p = this.players.get(pid);
    if (!p || typeof text !== "string") return;
    const clean = text.trim().slice(0, 240);
    if (!clean) return;
    const vis = this._visibleSystems(pid);
    const msg = JSON.stringify({ t: "chat", from: p.name, text: clean, ts: Date.now() });
    for (const other of this.players.values()) {
      const ov = this._visibleSystems(other.id);
      let shared = false;
      for (const s of ov) if (vis.has(s)) { shared = true; break; }
      if (shared) other.send(msg);
    }
  }

  // ---- connections ----
  _connectGates(a, b) {
    const now = Date.now(), ends = now + CONNECTION_MS;
    a.state = b.state = "connected";
    a.connEndsAt = b.connEndsAt = ends;
    a.connToSys = b.sys; a.connToGate = b.id;
    b.connToSys = a.sys; b.connToGate = a.id;
  }
  _connectToHub(g) {
    g.state = "connected";
    g.connEndsAt = Date.now() + CONNECTION_MS;
    g.connToSys = HUB_SYS; g.connToGate = null;
  }
  _closeGate(g, silent) {
    // Return ships that travelled through this gate to their home.
    for (const s of this.ships.values()) {
      if (s.viaGate === g.id && s.alive) this._returnHome(s);
    }
    g.state = "charging";
    g.chargeAt = Date.now() + RECHARGE_MS;
    g.connToSys = null; g.connToGate = null; g.connEndsAt = 0;
    if (!silent) {
      const owner = this.players.get(g.owner);
      if (owner) owner.send(JSON.stringify({ t: "sys", text: "A wormhole collapsed — ships returned home." }));
    }
  }
  _returnHome(s) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * STATION_RADIUS_KM;
    s.sys = homeSys(s.owner);
    s.x = STATION_POS.x + Math.cos(a) * r; s.y = STATION_POS.y + Math.sin(a) * r;
    s.tx = s.x; s.ty = s.y; s.viaGate = null;
  }

  // ---- visibility ----
  _visibleSystems(pid) {
    const set = new Set([homeSys(pid)]);
    for (const g of this.gates.values()) {
      if (g.owner === pid && g.state === "connected" && g.connToSys) set.add(g.connToSys);
    }
    return set;
  }

  // ---- tick ----
  tick(dtSec) {
    const now = Date.now();

    // Movement.
    for (const s of this.ships.values()) {
      if (!s.alive) continue;
      const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
      if (d > 1e-4) {
        s.heading = Math.atan2(dy, dx);
        const step = SHIP_SPEED_KMPS * dtSec;
        if (step >= d) { s.x = s.tx; s.y = s.ty; }
        else { s.x += dx / d * step; s.y += dy / d * step; }
        const c = clampToSystem(s.x, s.y); s.x = c.x; s.y = c.y;
      }
    }

    // Gate lifecycle: recharge, seek timeout, connection expiry.
    for (const g of this.gates.values()) {
      if (g.state === "charging" && now >= g.chargeAt) g.state = "charged";
      else if (g.state === "seeking" && now >= g.seekUntil) this._connectToHub(g);
      else if (g.state === "connected" && now >= g.connEndsAt) this._closeGate(g, false);
    }

    // Fly-through: a ship near a connected gate in its system transfers.
    for (const s of this.ships.values()) {
      if (!s.alive) continue;
      for (const g of this.gates.values()) {
        if (g.sys !== s.sys || g.state !== "connected") continue;
        if (dist(s.x, s.y, g.lx, g.ly) > GATE_TRANSFER_RADIUS_KM) continue;
        this._transfer(s, g);
        break;
      }
    }

    // Combat: enemy ships in proximity in the same system.
    const bySys = new Map();
    for (const s of this.ships.values()) {
      if (!s.alive) continue;
      (bySys.get(s.sys) || bySys.set(s.sys, []).get(s.sys)).push(s);
    }
    for (const list of bySys.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (a.owner === b.owner) continue;
          if (dist(a.x, a.y, b.x, b.y) <= COMBAT_RANGE_KM) {
            const dmg = COMBAT_DPS * dtSec; a.hp -= dmg; b.hp -= dmg;
          }
        }
      }
    }
    for (const s of this.ships.values()) {
      if (s.alive && s.hp <= 0) {
        s.alive = false; this.ships.delete(s.id);
        const o = this.players.get(s.owner);
        if (o) o.send(JSON.stringify({ t: "sys", text: "A ship was destroyed." }));
      }
    }
  }

  _transfer(s, g) {
    if (g.connToSys === HUB_SYS) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 8;
      s.sys = HUB_SYS; s.x = Math.cos(a) * r; s.y = Math.sin(a) * r;
    } else {
      const partner = g.connToGate ? this.gates.get(g.connToGate) : null;
      if (!partner) return;
      // Arrive clear of the partner gate, offset toward the destination centre.
      const len = Math.hypot(partner.lx, partner.ly) || 1;
      const ix = -partner.lx / len, iy = -partner.ly / len; // inward
      s.sys = partner.sys;
      s.x = partner.lx + ix * ARRIVAL_OFFSET_KM;
      s.y = partner.ly + iy * ARRIVAL_OFFSET_KM;
    }
    s.tx = s.x; s.ty = s.y; s.viaGate = g.id;
  }

  // ---- snapshot ----
  snapshotFor(p) {
    const vis = this._visibleSystems(p.id);
    const myGates = [...this.gates.values()].filter((g) => g.owner === p.id);

    const systems = [];
    for (const sysId of vis) {
      let fromGateLocal = null, partnerGateId = null;
      if (sysId !== homeSys(p.id)) {
        const g = myGates.find((x) => x.state === "connected" && x.connToSys === sysId);
        if (g) { fromGateLocal = { x: g.lx, y: g.ly }; partnerGateId = g.connToGate; }
      }
      systems.push({ id: sysId, mine: sysId === homeSys(p.id), fromGateLocal, partnerGateId });
    }

    const ships = [];
    for (const s of this.ships.values()) {
      if (!s.alive || !vis.has(s.sys)) continue;
      const o = this.players.get(s.owner);
      ships.push({
        id: s.id, sys: s.sys, o: o ? o.name : "?", mine: s.owner === p.id,
        x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100,
        hp: Math.max(0, Math.round(s.hp)), hd: Math.round(s.heading * 1000) / 1000,
      });
    }

    const gates = [];
    const now = Date.now();
    for (const g of this.gates.values()) {
      if (!vis.has(g.sys)) continue;
      let chargePct = 1;
      if (g.state === "charging") chargePct = Math.max(0, Math.min(1, 1 - (g.chargeAt - now) / RECHARGE_MS));
      gates.push({
        id: g.id, sys: g.sys, lx: g.lx, ly: g.ly, mine: g.owner === p.id,
        state: g.state, chargePct,
        connEndsMs: g.state === "connected" ? Math.max(0, g.connEndsAt - now) : null,
      });
    }

    const stations = [];
    for (const sysId of vis) {
      if (sysId.startsWith("sys:") && sysId !== HUB_SYS)
        stations.push({ sys: sysId, x: STATION_POS.x, y: STATION_POS.y });
    }

    return { t: "snap", systems, ships, gates, stations, canSpawn: this._aliveCount(p.id) < MAX_SHIPS_PER_PLAYER };
  }
}
