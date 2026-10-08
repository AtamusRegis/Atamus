import {
  FUEL_START_MS, FUEL_SESSION_MAX_MS, HUB_MIN_WAIT_MS, HUB_SEEK_INTERVAL_MS, HUB_SEEK_CHANCE, HUB_SYS,
} from "./constants.js";
import { STARGATE_CELLS } from "./geometry.js";

const homeSys = (pid) => `sys:${pid}`;

export class World {
  constructor() {
    this.players = new Map(); // pid -> {id,name,send,offline}
    this.gates = new Map();   // gid -> gate
  }

  addPlayer(id, name, send) {
    const existing = this.players.get(id);
    if (existing) { existing.send = send; existing.offline = false; existing.name = name; return existing; }
    const p = { id, name, send, offline: false };
    this.players.set(id, p);
    STARGATE_CELLS.forEach((cell, i) => {
      this.gates.set(`${id}:${i}`, {
        id: `${id}:${i}`, owner: id, sys: homeSys(id), lx: cell.x, ly: cell.y,
        state: "closed", fuelMs: FUEL_START_MS, sessionUsedMs: 0, activatedAt: 0,
        connToSys: null, connToGate: null, lastSeek: 0,
      });
    });
    return p;
  }

  removePlayer(id) {
    const anyActive = [...this.gates.values()].some((g) => g.owner === id && g.state === "active");
    const p = this.players.get(id);
    if (p && anyActive) { p.offline = true; p.send = () => {}; return; }
    this._purge(id);
  }
  _purge(id) {
    for (const [gid, g] of this.gates) if (g.owner === id) this.gates.delete(gid);
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
    for (const p of [...this.players.values()]) {
      if (!p.offline) continue;
      const stillActive = [...this.gates.values()].some((g) => g.owner === p.id && g.state === "active");
      if (!stillActive) this._purge(p.id);
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

    return { t: "snap", systems, gates, enemies: false };
  }
}
