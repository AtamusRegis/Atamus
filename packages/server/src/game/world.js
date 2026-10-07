import {
  SHIP_SPEED_KMPS, SHIP_HP, MAX_SHIPS_PER_PLAYER,
  GATE_POS, GATE_RADIUS_KM, HUB_TIMER_MS,
  STATION_POS, STATION_RADIUS_KM,
  COMBAT_RANGE_KM, COMBAT_DPS, HUB_ARRIVAL_SCATTER_KM,
} from "./constants.js";
import { clampToHex, dist } from "./geometry.js";

const HUB = "hub";
const homeId = (pid) => `home:${pid}`;

let nextShipId = 1;

export class World {
  constructor() {
    /** @type {Map<string, {id,name,view,timerEndsAt,send:Function}>} */
    this.players = new Map();
    /** @type {Map<number, {id,owner,instance,x,y,tx,ty,hp,heading,alive}>} */
    this.ships = new Map();
  }

  // ---- players ----

  addPlayer(id, name, send) {
    if (this.players.has(id)) this.removePlayer(id); // reconnect: start fresh
    const player = { id, name, view: "home", timerEndsAt: null, send };
    this.players.set(id, player);
    // Two starting ships near the station.
    for (let i = 0; i < 2; i++) this._spawnAtStation(id);
    return player;
  }

  removePlayer(id) {
    for (const [sid, s] of this.ships) if (s.owner === id) this.ships.delete(sid);
    this.players.delete(id);
  }

  _spawnAtStation(pid) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * STATION_RADIUS_KM;
    const x = STATION_POS.x + Math.cos(angle) * r;
    const y = STATION_POS.y + Math.sin(angle) * r;
    const ship = {
      id: nextShipId++, owner: pid, instance: homeId(pid),
      x, y, tx: x, ty: y, hp: SHIP_HP, heading: Math.PI / 2, alive: true,
    };
    this.ships.set(ship.id, ship);
    return ship;
  }

  _aliveCount(pid) {
    let n = 0;
    for (const s of this.ships.values()) if (s.owner === pid && s.alive) n++;
    return n;
  }

  // ---- commands (already authenticated to pid) ----

  cmdMove(pid, shipId, x, y) {
    const p = this.players.get(pid);
    const s = this.ships.get(shipId);
    if (!p || !s || !s.alive || s.owner !== pid) return;
    // Can only command ships in the instance the player is currently viewing.
    if (s.instance !== this._viewInstance(p)) return;
    const c = clampToHex(x, y);
    s.tx = c.x; s.ty = c.y;
  }

  cmdActivateGate(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    if (p.timerEndsAt == null) p.timerEndsAt = Date.now() + HUB_TIMER_MS;
    this._transferInRange(pid);
    p.view = "hub";
  }

  cmdSpawn(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    if (this._aliveCount(pid) >= MAX_SHIPS_PER_PLAYER) return;
    this._spawnAtStation(pid);
  }

  cmdView(pid, which) {
    const p = this.players.get(pid);
    if (!p) return;
    if (which === "hub" && p.timerEndsAt == null) return; // nothing there yet
    p.view = which === "hub" ? "hub" : "home";
  }

  cmdChat(pid, text) {
    const p = this.players.get(pid);
    if (!p || typeof text !== "string") return;
    const clean = text.trim().slice(0, 240);
    if (!clean) return;
    const inst = this._viewInstance(p);
    const msg = JSON.stringify({ t: "chat", from: p.name, text: clean, ts: Date.now() });
    for (const other of this.players.values()) {
      if (this._viewInstance(other) === inst) other.send(msg);
    }
  }

  _viewInstance(p) {
    return p.view === "hub" ? HUB : homeId(p.id);
  }

  _transferInRange(pid) {
    for (const s of this.ships.values()) {
      if (s.owner !== pid || !s.alive) continue;
      if (s.instance !== homeId(pid)) continue;
      if (dist(s.x, s.y, GATE_POS.x, GATE_POS.y) <= GATE_RADIUS_KM) {
        // Pop into the hub near its center.
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * HUB_ARRIVAL_SCATTER_KM;
        s.instance = HUB;
        s.x = Math.cos(a) * r; s.y = Math.sin(a) * r;
        s.tx = s.x; s.ty = s.y;
      }
    }
  }

  _returnHome(pid) {
    for (const s of this.ships.values()) {
      if (s.owner !== pid || !s.alive || s.instance !== HUB) continue;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * STATION_RADIUS_KM;
      s.instance = homeId(pid);
      s.x = STATION_POS.x + Math.cos(a) * r;
      s.y = STATION_POS.y + Math.sin(a) * r;
      s.tx = s.x; s.ty = s.y;
    }
  }

  // ---- simulation tick ----

  tick(dtSec) {
    const now = Date.now();

    // Movement.
    for (const s of this.ships.values()) {
      if (!s.alive) continue;
      const dx = s.tx - s.x, dy = s.ty - s.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-4) {
        s.heading = Math.atan2(dy, dx);
        const step = SHIP_SPEED_KMPS * dtSec;
        if (step >= d) { s.x = s.tx; s.y = s.ty; }
        else { s.x += (dx / d) * step; s.y += (dy / d) * step; }
        const c = clampToHex(s.x, s.y);
        s.x = c.x; s.y = c.y;
      }
    }

    // Timer-driven transfers and expiry.
    for (const p of this.players.values()) {
      if (p.timerEndsAt == null) continue;
      if (now >= p.timerEndsAt) {
        this._returnHome(p.id);
        p.timerEndsAt = null;
        if (p.view === "hub") p.view = "home";
        p.send(JSON.stringify({ t: "sys", text: "Wormhole collapsed — surviving ships returned home." }));
      } else {
        // While the timer runs, any ship reaching the gate is sent through.
        this._transferInRange(p.id);
      }
    }

    // Hub combat: enemy ships in proximity damage each other.
    const hubShips = [];
    for (const s of this.ships.values()) if (s.alive && s.instance === HUB) hubShips.push(s);
    for (let i = 0; i < hubShips.length; i++) {
      for (let j = i + 1; j < hubShips.length; j++) {
        const a = hubShips[i], b = hubShips[j];
        if (a.owner === b.owner) continue;
        if (dist(a.x, a.y, b.x, b.y) <= COMBAT_RANGE_KM) {
          const dmg = COMBAT_DPS * dtSec;
          a.hp -= dmg; b.hp -= dmg;
        }
      }
    }
    // Remove the dead (they stay lost).
    for (const s of hubShips) {
      if (s.hp <= 0 && s.alive) {
        s.alive = false;
        this.ships.delete(s.id);
        const owner = this.players.get(s.owner);
        if (owner) owner.send(JSON.stringify({ t: "sys", text: "A ship was destroyed in the hub." }));
      }
    }
  }

  // ---- snapshot for one player's current view ----

  snapshotFor(p) {
    const inst = this._viewInstance(p);
    const ships = [];
    for (const s of this.ships.values()) {
      if (s.instance !== inst || !s.alive) continue;
      const owner = this.players.get(s.owner);
      ships.push({
        id: s.id,
        o: owner ? owner.name : "?",
        mine: s.owner === p.id,
        x: Math.round(s.x * 100) / 100,
        y: Math.round(s.y * 100) / 100,
        hp: Math.max(0, Math.round(s.hp)),
        hd: Math.round(s.heading * 1000) / 1000,
      });
    }
    return {
      t: "snap",
      view: p.view,
      ships,
      gateActive: p.timerEndsAt != null,
      timerMs: p.timerEndsAt != null ? Math.max(0, p.timerEndsAt - Date.now()) : null,
      canSpawn: this._aliveCount(p.id) < MAX_SHIPS_PER_PLAYER,
    };
  }
}
