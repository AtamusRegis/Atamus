// Active modules at work, combat, drones and wrecks (owner, 2026-10-11). Installed onto World (world.js) as methods.
//
// - Mining lasers and strip miners cut ore from the first locked asteroid in reach (a strip miner wastes a share of the
//   rock). Weapons fire at the first locked ship of someone else's in reach; warp scramblers, webifiers and remote shield
//   extenders hold on it while they run; remote shield rechargers and repair drones work on another locked ship (never
//   their own); tractor beams pull a locked wreck in. A module with nothing to work on waits (standby) for a lock.
// - Damage hits the shield first, then the hull, less the hull's armor damage reduction. Shields come back slowly on
//   their own; docking repairs everything. At 0 hull the ship is destroyed: a wreck keeps a share of what it had
//   (fitted modules 25% each, everything else 50% each), and the pilot is back at their starting station in a new
//   Prospector. Attacking anyone (but a flagged ship) flags the attacker for the ETA.
// - Drones (owner): a Drone Link launches drones from the drone bay, each carrying a module from the cargo hold (a
//   mining laser or a weapon) and a fuel block; they work out to the link's control range. Recalled, they come home
//   (drones to the bay, modules to the cargo hold). Out of fuel before they're home, or left behind (a warp, docking),
//   they're lost to a wreck where they were.
import { SHIP_TYPES, DRONE, droneLegMs } from "./constants.js";
import { MODULES, ITEMS, itemKey, isOff, droneStats, hullBonuses, SIZE_RANK, HULL_RANK } from "./modules.js";
import { holdUsed, addItem, takeItem, aimPoint, isCountable, holdFor } from "./items.js";
import { sizeFor } from "./belts.js";
import { stationOfPlanet } from "./station.js";

const SHIELD_REGEN_S = 120;          // an empty shield fills on its own in this long
const LOOT_KM = 2.5;                 // how close a ship must be to open a wreck
const WRECK_MS = 2 * 3600_000;       // wrecks last this long
const DROP_FIT = 0.25, DROP_HOLD = 0.5;   // (owner) a fitted module drops 25% of the time; (held items: 50%)
const TRACTOR_HOLD_KM = 1;           // a tractor beam stops pulling this close
const SIZE_HIT = [1, 0.7, 0.45];     // a weapon this many sizes bigger than its target's hull does this share
const ROOKIE_FIT = ["mining_laser_s1"];   // a new Prospector after a loss has these fitted
const TARGETED = { weapon: "hostile", scram: "hostile", web: "hostile", remote_rep: "friend", remote_ext: "friend", hull_rep: "friend", tractor: "wreck", mining: "rock" };
const finite = (v) => typeof v === "number" && Number.isFinite(v);

const methods = {
  // ---- switching modules on and off ----
  /** Switch an active module on or off. `req` for a Drone Link: { item, n } (the module the drones carry, how many). */
  cmdModule(pid, shipId, slot, on, req = null) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || !Number.isInteger(slot) || slot < 0 || slot >= s.fit.active.length) return;
    const m = MODULES[s.fit.active[slot]]; if (!m || m.slot !== "active") return;   // (a passive module in an admin's active slot: always on)
    if (!on) { if (m.kind === "drones") this._dronesOff(s, slot); else this._modOff(s, slot); return; }
    if (s.wp || s.docked || (s.act[slot] && s.act[slot].on)) return;
    if (isOff(s.fit, "active", slot)) return this._notice(pid, "Powered off");
    const c = s.calc.mods[slot] || {};
    if (m.kind === "drones") return this._launchDrones(s, slot, req);
    if (m.kind === "mining" && holdUsed(s.holds, "ore") >= (s.calc.holds.ore || 0) - 1e-6) return this._notice(pid, "Ore hold full");
    if (TARGETED[m.kind]) {
      const tg = this._findTarget(s, TARGETED[m.kind], c.rangeKm);
      s.act[slot] = tg ? this._begin(s, slot, tg, this.simAt) : { on: true, standby: true };   // (owner) no target yet: on standby, it starts on the first lock in reach
    } else s.act[slot] = { on: true, at: this.simAt };
    this._recalc(s);
  },
  // a cycle starting on target `tg`: a laser picks a spot inside the rock; every module a hardpoint on its arm
  _begin(s, slot, tg, at) {
    const t = SHIP_TYPES[s.type], arm = (t.arms || [[0]])[slot % (t.arms || [[0]]).length], hp = arm[Math.floor(Math.random() * arm.length)];
    const m = MODULES[s.fit.active[slot]];
    if (m && m.kind === "mining") return { on: true, at, tg, ...aimPoint(this._rock(tg)), hp };
    return { on: true, at, tg, hp, next: at };
  },
  _cycle(s, slot, tg, at) { return this._begin(s, slot, tg, at); },
  /** The first locked object a module can work on, within `range` (edge to edge): a rock, a wreck, someone else's ship
   *  (hostile) or any ship but this one (friend). */
  _findTarget(s, want, range, skip = null) {
    for (const g of s.targets) {
      if (!g.locked || g.id === skip) continue;
      if (want === "rock" || want === "wreck") { if (g.kind !== want) continue; }
      else { if (g.kind !== "ship" || g.id === s.id) continue; const o = this.ships.get(g.id); if (!o || (want === "hostile" && o.owner === s.owner)) continue; }
      const pos = this._objPos(g.kind, g.id); if (pos && this._range(s, pos) <= range) return g.id;
    }
    return null;
  },
  _locked(s, id) { return s.targets.some((g) => g.id === id && g.locked); },
  _miningTarget(s, slot) { return this._findTarget(s, "rock", (s.calc.mods[slot] || {}).rangeKm || 0); },
  _modOff(s, slot) { if (s.act[slot]) { s.act[slot] = null; this._recalc(s); } },
  /** Stop a slot for good (unfitted, powered off): drones out are lost where they are. */
  _stopSlot(s, slot) { const a = s.act[slot]; if (a && a.drones && !a.home) this._abandonDrones(s, slot); else if (a && a.drones) this._dronesIn(s, slot); else this._modOff(s, slot); },
  /** Everything off (a warp, docking, a freeze): drones out are left behind. */
  _clearActs(s) { if (!s.act) return; for (let i = 0; i < s.act.length; i++) if (s.act[i]) this._stopSlot(s, i); },
  /** The numbers a running module works by: its own, or (drones) what its drones carry, times how many. */
  _mcalc(s, i) {
    const a = s.act[i], c = (s.calc.mods && s.calc.mods[i]) || {};
    if (a && a.drones) { const d = a.drones.mod || {}; return { ...d, yield: (d.yield || 0) * a.drones.n, dmg: (d.dmg || 0) * a.drones.n, rangeKm: c.rangeKm || 0, cycleMs: d.cycleMs || 60_000 }; }
    return c;
  },

  // ---- every tick: modules at work ----
  _tickModules(now) {
    for (const s of this.ships.values()) {
      if (!s.act || !s.act.some(Boolean) || this.frozen.has(s.owner)) continue;
      if (s.wp) { this._clearActs(s); continue; }          // a warp switches everything off (drones out are left behind)
      for (let i = 0; i < s.act.length; i++) {
        const a = s.act[i], m = a && MODULES[s.fit.active[i]]; if (!a || !m) continue;
        if (a.drones) { this._tickDrones(s, i, a, now); continue; }
        if (m.kind === "mining") { this._tickLaser(s, i, a, now); continue; }
        if (!TARGETED[m.kind]) { if (m.kind === "shield_rep") this._tickSelfRep(s, i, a, now); continue; }
        const c = s.calc.mods[i] || {}, want = TARGETED[m.kind];
        if (!this._keep(s, i, a, want, c.rangeKm, now)) continue;
        if (m.kind === "weapon") { if (now >= a.next) { this._fire(s, a.tg, c, now, a); a.at = now; a.next = now + c.cycleMs; } }
        else if (m.kind === "remote_rep" || m.kind === "hull_rep") {
          if (now >= a.next) { const t = this.ships.get(a.tg); if (t) { if (m.kind === "remote_rep") t.shield = Math.min(t.shieldMax || 0, t.shield + c.amount); else t.hp = Math.min(SHIP_TYPES[t.type].hp, t.hp + c.amount); } a.at = now; a.next = now + c.cycleMs; }
        } else if (m.kind === "tractor") this._pull(s, a.tg, c, this._dt || 0.05);
      }
    }
    this._tickShots(now);
  },
  // keep a targeted module on its target (still locked, in reach), or move it to the next one, or wait on standby
  _keep(s, i, a, want, range, now) {
    if (a.tg && !a.standby) {
      const pos = this._objPos(want === "rock" || want === "wreck" ? want : "ship", a.tg);
      if (pos && this._locked(s, a.tg) && this._range(s, pos) <= range) return true;
    }
    const tg = this._findTarget(s, want, range);
    if (!tg) { if (!a.standby) { s.act[i] = { on: true, standby: true }; } return false; }
    s.act[i] = this._begin(s, i, tg, now); return true;
  },
  _tickSelfRep(s, i, a, now) {
    const c = s.calc.mods[i] || {}; if (now - a.at < c.cycleMs) return;
    s.shield = Math.min(s.shieldMax || 0, s.shield + c.amount); a.at = now;
  },
  // lasers and strip miners: ore lands in the ore hold when each cycle completes (owner); they stop when the rock is gone,
  // unlocked or out of reach, or the ore hold is full. A strip miner takes its waste from the rock too.
  _tickLaser(s, i, a, now) {
    if (a.standby) { const tg = this._miningTarget(s, i); if (tg) s.act[i] = this._begin(s, i, tg, now); return; }   // the first lock in reach
    const c = s.calc.mods[i] || {}, k = this._rock(a.tg), pos = k && { x: k.x, y: k.y, r: k.r };
    if (!k || !this._locked(s, a.tg) || this._range(s, pos) > c.rangeKm) { this._modOff(s, i); return; }
    if (a.size !== k.size) Object.assign(a, aimPoint(k));   // the rock shrank: aim at the smaller art
    if (now - a.at < c.cycleMs) return;
    const free = (s.calc.holds.ore || 0) - holdUsed(s.holds, "ore"), amt = Math.min(c.yield, k.m3, Math.max(0, free));
    if (amt > 0) { addItem(s.holds, "ore", "ore:" + k.ore, amt); this._mineRock(a.tg, amt * (1 + (c.waste || 0))); }
    s.act[i] = this._begin(s, i, a.tg, a.at + c.cycleMs);   // the next cycle: a new spot, maybe the other hardpoint
    if (free - amt <= 1e-6) { this._modOff(s, i); this._notice(s.owner, "Ore hold full"); }
  },
  // ore mined out of a rock: it shrinks a size at a time and is gone when empty
  _mineRock(id, amt) {
    const poi = this.pois.get(id.split("#")[0]), f = poi && poi.field, k = f && f.rocks.find((r) => r.id === id); if (!k) return;
    k.mined = +((k.mined || 0) + amt).toFixed(2); k.m3 = Math.max(0, +(k.m3 - amt).toFixed(2));
    if (k.m3 <= 0) { f.rocks.splice(f.rocks.indexOf(k), 1); f.ver++; return; }
    const size = sizeFor(k.m3); if (size !== k.size) { k.size = size; k.r = size / 2000; f.ver++; }
  },

  // ---- combat ----
  /** A weapon (or a drone's) fires at ship `tid`: missiles fly there first, the rest hit at once. Firing on someone
   *  flags the attacker (eta.js). */
  _fire(s, tid, c, now, a = null) {
    const t = this.ships.get(tid); if (!t) return;
    if (!s.npc) this.aggress(s.id, t.id);
    const tr = HULL_RANK[(SHIP_TYPES[t.type] || {}).size] ?? 0, wr = SIZE_RANK[c.size] ?? 0, k = wr > tr ? SIZE_HIT[Math.min(2, wr - tr)] : 1;   // (big guns on small hulls do less)
    const hit = { tg: tid, dmg: c.dmg * k, shieldK: c.shieldK || 1, hullK: c.hullK || 1, by: s.id };
    if (c.flightKmps) { const d = Math.hypot(t.x - s.x, t.y - s.y); this.shots.push({ ...hit, at: now + Math.round(d / c.flightKmps * 1000) }); if (a) a.fl = Math.round(d / c.flightKmps * 1000); }
    else this._damage(t, hit.dmg, hit.shieldK, hit.hullK, s);
  },
  _tickShots(now) {
    if (!this.shots.length) return;
    const due = this.shots.filter((x) => x.at <= now); if (!due.length) return;
    this.shots = this.shots.filter((x) => x.at > now);
    for (const h of due) { const t = this.ships.get(h.tg); if (t && !t.docked && !t.wp) this._damage(t, h.dmg, h.shieldK, h.hullK, this.ships.get(h.by) || null); }
  },
  /** Damage: the shield takes it first (times the weapon's shield factor), then the hull (its hull factor, less the
   *  hull's armor damage reduction). At 0 hull the ship is destroyed. */
  _damage(t, dmg, shieldK = 1, hullK = 1, by = null) {
    if (!t || t.docked || !(dmg > 0)) return;
    const sd = dmg * shieldK;
    if (t.shield >= sd) { t.shield -= sd; return; }
    const left = dmg - t.shield / shieldK; t.shield = 0;
    const dr = t.calc && finite(t.calc.armorDR) ? t.calc.armorDR : (SHIP_TYPES[t.type].armorDR || 0);
    t.hp -= left * hullK * (1 - dr);
    if (t.hp <= 0) this._destroy(t, by);
  },
  _regen(dt) {
    for (const s of this.ships.values()) { if (s.docked || !(s.shieldMax > 0) || s.shield >= s.shieldMax) continue; s.shield = Math.min(s.shieldMax, s.shield + s.shieldMax / SHIELD_REGEN_S * dt); }
  },
  /** (owner) A ship destroyed: an officer is the ETA's (eta.js); an admin's ship comes back cloaked; a player's leaves a
   *  wreck with a share of what it had, and its pilot is back at their starting station in a new Prospector. */
  _destroy(t, by) {
    for (const o of this.ships.values()) if (o.targets.length) o.targets = o.targets.filter((g) => g.id !== t.id);
    if (t.npc) { this.eta.officerDown(t.id, by && !by.npc ? by.id : null); return; }
    const p = this.players.get(t.owner);
    if (t.admin) { const name = t.name; this.setAdminShip(t.owner, false); if (p) p.adminAt = null; this.setAdminShip(t.owner, true, { name }); return; }
    const items = {}, drop = (k, n, ch) => { let x = 0; if (isCountable(k)) { for (let j = 0; j < Math.round(n); j++) if (Math.random() < ch) x++; } else x = +(n * ch).toFixed(2); if (x > 0) items[k] = +((items[k] || 0) + x).toFixed(2); };
    for (const kind of ["active", "passive"]) for (const k of t.fit[kind]) if (k) drop(k, 1, DROP_FIT);   // (owner) 25% of the fit
    for (const h of Object.values(t.holds)) for (const [k, n] of Object.entries(h)) drop(k, n, DROP_HOLD);
    for (const a of t.act || []) if (a && a.drones) { drop("drone", a.drones.n, DROP_HOLD); drop(a.drones.item, a.drones.n, DROP_HOLD); }
    const pl = p && p.pilots.find((x) => x.id === t.pilot), T = SHIP_TYPES.chisel;
    this._addWreck(t.x, t.y, (pl ? pl.name + "'s " : "") + (SHIP_TYPES[t.type] || T).name + " Wreck", items, t.owner);
    const killer = by && !by.npc && !by.admin ? by.owner : null;
    // the new Prospector, docked at the pilot's starting station
    const st = stationOfPlanet((pl && pl.start) || "earth"), prop = this._dockProp(t.owner, st.id);
    const fit = { active: Array(T.activeSlots).fill(null), passive: Array(T.passiveSlots).fill(null), off: { active: Array(T.activeSlots).fill(false), passive: Array(T.passiveSlots).fill(false) } };
    ROOKIE_FIT.forEach((k, i) => { fit.active[i] = k; });
    Object.assign(t, { type: "chisel", fit, holds: Object.fromEntries(T.holds.map((h) => [h.key, {}])), act: Array(T.activeSlots).fill(null), targets: [], chase: null, dest: null, warpReq: false, dockReq: false, dockSeq: null, wp: null,
      drift: false, moving: false, vx: 0, vy: 0, name: null, docked: st.id, x: prop ? prop.x : st.x, y: prop ? prop.y : st.y, hp: T.hp, radius: T.radiusKm, scram: false, webK: 1, extBuff: 0 });
    t.tx = t.x; t.ty = t.y; delete t.crim; delete t.unboarded;   // (owner) hunted till dead: the flag goes with the ship
    this._recalc(t); t.shield = t.shieldMax;
    this._notice(t.owner, "Your ship was destroyed");
    if (this.onKill) { try { this.onKill({ killer, victim: t.owner }); } catch (e) { console.error("onKill", e); } }
  },

  // ---- wrecks (owner): what a destroyed ship (or lost drones) left; anyone can open one beside it and take from it ----
  _addWreck(x, y, name, items, owner = null) {
    if (!Object.keys(items).length) return null;
    const id = "wreck:" + Date.now().toString(36) + (this.wreckSeq = (this.wreckSeq || 0) + 1).toString(36);
    const w = { id, x, y, name, items, owner, until: this.simAt + WRECK_MS }; this.wrecks.set(id, w); return w;
  },
  _tickWrecks(now) { for (const [id, w] of this.wrecks) if (now > w.until || !Object.keys(w.items).length) this.wrecks.delete(id); },
  _pull(s, wid, c, dt) {
    const w = this.wrecks.get(wid); if (!w) return;
    const dx = s.x - w.x, dy = s.y - w.y, d = Math.hypot(dx, dy); if (d <= TRACTOR_HOLD_KM + s.radius) return;
    const step = Math.min(d - TRACTOR_HOLD_KM - s.radius, c.pullKmps * dt); w.x += dx / d * step; w.y += dy / d * step;
  },
  _wreckFor(pid, shipId, wid) {
    const s = this.ships.get(shipId); if (!s || s.owner !== pid || s.docked || s.wp || typeof wid !== "string") return null;
    const w = this.wrecks.get(wid); if (!w || this._range(s, { x: w.x, y: w.y, r: 0.03 }) > LOOT_KM) return null;
    return { s, w };
  },
  /** Open a wreck beside one of your ships: its contents are sent. */
  cmdLoot(pid, shipId, wid) {
    const r = this._wreckFor(pid, shipId, wid), p = this.players.get(pid); if (!p) return;
    if (!r) { p.send(JSON.stringify({ t: "wreck", id: wid, gone: !this.wrecks.has(wid), far: true })); return; }
    p.send(JSON.stringify({ t: "wreck", id: r.w.id, name: r.w.name, items: r.w.items }));
  },
  /** Take an item (all of it, or `qty`) from an open wreck into the hold it belongs in, as much as fits. */
  cmdTake(pid, shipId, wid, item, qty = null) {
    const r = this._wreckFor(pid, shipId, wid); if (!r || typeof item !== "string") return;
    const { s, w } = r, have = w.items[item] || 0; if (!(have > 0)) return;
    const hold = holdFor(item); if (!s.holds[hold]) return this._notice(pid, "No room");
    const per = MODULES[item] ? MODULES[item].m3 : ITEMS[item] ? ITEMS[item].m3 : 1, free = (s.calc.holds[hold] || 0) - holdUsed(s.holds, hold);
    let n = qty == null ? have : (finite(qty) && qty > 0 ? Math.min(qty, have) : 0);
    n = Math.min(n, isCountable(item) ? Math.floor(free / per + 1e-9) : Math.floor(free / per * 100) / 100);
    if (!(n > 0)) return this._notice(pid, "Not enough room");
    addItem(s.holds, hold, item, n); const v = +(have - n).toFixed(2); if (v <= 0) delete w.items[item]; else w.items[item] = v;
    if (w.owner && w.owner !== pid && this.onLoot) { try { this.onLoot({ from: w.owner, to: pid, item, n }); } catch (e) { console.error("onLoot", e); } }
    if (!Object.keys(w.items).length) this.wrecks.delete(w.id);
    this.cmdLoot(pid, shipId, wid);
  },

  // ---- (owner) drones ----
  _launchDrones(s, slot, req) {
    const c = s.calc.mods[slot] || {}, item = req && typeof req.item === "string" ? itemKey(req.item) : null, m = item && MODULES[item];
    const nReq = req && Number.isInteger(req.n) ? req.n : 0;
    if (!m || !m.droneable || m.size !== "s" || nReq < 1) return this._notice(s.owner, "Unable to launch more drones");
    const n = Math.min(nReq, c.drones || 0, Math.floor((s.holds.drones || {}).drone || 0), Math.floor(s.holds.cargo[item] || 0), Math.floor(s.holds.cargo.drone_fuel || 0));
    if (n < 1) return this._notice(s.owner, "Unable to launch more drones");
    takeItem(s.holds, "drones", "drone", n); takeItem(s.holds, "cargo", item, n); takeItem(s.holds, "cargo", "drone_fuel", n);
    const mod = droneStats(item, s.lic, s.calc, hullBonuses(SHIP_TYPES[s.type], s.lic));
    const a = { on: true, drones: { item, n, mod, until: this.simAt + s.calc.drone.fuelMs }, home: true };
    const want = m.kind === "mining" ? "rock" : "hostile", tg = this._findTarget(s, want, c.rangeKm);
    if (tg) this._droneGo(s, a, tg, this.simAt); else a.standby = true;
    s.act[slot] = a; this._recalc(s);
  },
  // drones off to a target from the ship: they start once they're there
  _droneGo(s, a, tg, now) {
    const pos = this._objPos(a.drones.mod.kind === "mining" ? "rock" : "ship", tg); if (!pos) return;
    const fly = droneLegMs(Math.hypot(pos.x - s.x, pos.y - s.y) / (s.calc.drone.speedK || 1));
    Object.assign(a, { tg, at: now + fly, next: now + fly, standby: false, home: false, haul: null, ret: null });
    if (a.drones.mod.kind === "mining") Object.assign(a, aimPoint(this._rock(tg)));
  },
  /** Drones home: back into the drone bay, their modules into the cargo hold. */
  _dronesIn(s, slot) {
    const a = s.act[slot]; if (!a || !a.drones) return this._modOff(s, slot);
    addItem(s.holds, "drones", "drone", a.drones.n); addItem(s.holds, "cargo", a.drones.item, a.drones.n);
    s.act[slot] = null; this._recalc(s);
  },
  /** Drones lost (out of fuel, or left behind): a wreck where they were, with them and their modules. */
  _abandonDrones(s, slot, why = null) {
    const a = s.act[slot]; if (!a || !a.drones) return this._modOff(s, slot);
    const k = a.tg && (this._rock(a.tg) || this.ships.get(a.tg)), x = k ? k.x : s.x, y = k ? k.y : s.y;
    this._addWreck(x, y, "Lost Drones", { drone: a.drones.n, [a.drones.item]: a.drones.n }, s.owner);
    s.act[slot] = null; this._recalc(s); if (why) this._notice(s.owner, why);
  },
  // the key with drones out: send them to another locked target in control range, else recall them
  _dronesOff(s, slot) {
    const a = s.act[slot]; if (!a || !a.drones) return this._modOff(s, slot);
    if (a.home || a.standby) return this._dronesIn(s, slot);
    const c = this._mcalc(s, slot), mining = a.drones.mod.kind === "mining", now = this.simAt;
    if ((a.haul && a.haul.recall) || a.ret) return;          // already on their way in
    const next = this._findTarget(s, mining ? "rock" : "hostile", c.rangeKm, a.tg);
    if (next) { if (a.haul) { a.haul.next = next; return; } const from = mining ? this._rock(a.tg) : this.ships.get(a.tg), to = mining ? this._rock(next) : this.ships.get(next);
      const fly = from && to ? Math.round(Math.hypot(to.x - from.x, to.y - from.y) / DRONE.nearKmps * 1000) : 0;
      Object.assign(a, { tg: next, at: now + fly, next: now + fly }, mining ? { ...aimPoint(to), ...(from && fly ? { fx: from.x, fy: from.y, fs: from.size } : {}) } : {}); return; }
    this._recall(s, a, now);
  },
  _recall(s, a, now) {
    if (a.haul) { a.haul.recall = true; return; }
    const k = a.tg && (this._rock(a.tg) || this.ships.get(a.tg)), dk = k ? Math.hypot(k.x - s.x, k.y - s.y) : 0;
    if (a.drones.mod.kind === "mining" && k) { a.haul = { amt: 0, ore: k.ore, at: now, leg: droneLegMs(dk), dp: 0, dk: +dk.toFixed(3), rx: k.x, ry: k.y, rs: k.size || 0, recall: true }; return; }
    a.ret = { at: now, leg: droneLegMs(dk) };
  },
  // mining drones haul each cycle's ore to the ship (owner), circle it twice streaming the ore in, then fly back; weapon
  // drones fire at their target each cycle; both stay on a target out to the link's control range, locked or not
  _tickDrones(s, i, a, now) {
    if (!a.home && now > a.drones.until) return this._abandonDrones(s, i, "Drones ran out of fuel");   // (owner) disconnected
    if (a.home && now > a.drones.until) return this._dronesIn(s, i);
    const c = this._mcalc(s, i), mining = a.drones.mod.kind === "mining";
    if (a.ret) { if (now >= a.ret.at + a.ret.leg) this._dronesIn(s, i); return; }
    if (a.standby) { const tg = this._findTarget(s, mining ? "rock" : "hostile", c.rangeKm); if (tg) this._droneGo(s, a, tg, now); return; }
    if (!mining) {
      const t = this.ships.get(a.tg), pos = t && this._objPos("ship", a.tg);
      if (!pos || this._range(s, pos) > c.rangeKm) { const nx = this._findTarget(s, "hostile", c.rangeKm); if (nx) this._droneGo(s, a, nx, now); else this._recall(s, a, now); return; }
      if (now >= a.next) { this._fire(s, a.tg, c, now); a.at = now; a.next = now + c.cycleMs; }
      return;
    }
    const k = this._rock(a.tg), pos = k && { x: k.x, y: k.y, r: k.r };
    if (a.haul) {
      const h = a.haul, home = h.at + h.leg + h.dp;
      if (!h.dep && now >= home) {
        h.dep = true; const free = (s.calc.holds.ore || 0) - holdUsed(s.holds, "ore"), amt = Math.min(h.amt, Math.max(0, free));
        if (amt > 0) addItem(s.holds, "ore", "ore:" + h.ore, amt);
        if (h.recall) return this._dronesIn(s, i);           // recalled: in, and off
        if (h.amt > 0 && free - amt <= 1e-6) { this._dronesIn(s, i); this._notice(s.owner, "Ore hold full"); return; }
        const tg = h.next || a.tg, kk = this._rock(tg), dk = kk && Math.hypot(kk.x - s.x, kk.y - s.y);
        if (!kk || this._range(s, { x: kk.x, y: kk.y, r: kk.r }) > c.rangeKm) return this._dronesIn(s, i);   // nothing to go back to: they stay in
        h.back = { tg, leg: droneLegMs(dk), dk: +dk.toFixed(3), rx: kk.x, ry: kk.y, rs: kk.size };
      }
      if (!h.back || now < home + h.back.leg) return;
      Object.assign(a, { haul: null, tg: h.back.tg, at: now, next: now, ...aimPoint(this._rock(h.back.tg)) }); delete a.fx; return;
    }
    if (!k || this._range(s, pos) > c.rangeKm) { const nx = this._findTarget(s, "rock", c.rangeKm); if (nx) this._droneGo(s, a, nx, now); else this._recall(s, a, now); return; }
    if (a.size !== k.size) Object.assign(a, aimPoint(k));
    if (now - a.at < c.cycleMs) return;
    const amt = Math.min(c.yield, k.m3);
    if (amt > 0) {                                           // (owner) the drones carry it home: the rock loses it now, the hold gets it once streamed in
      this._mineRock(a.tg, amt); const dk = Math.hypot(k.x - s.x, k.y - s.y);
      a.haul = { amt, ore: k.ore, at: now, leg: droneLegMs(dk), dp: DRONE.depositMs, dk: +dk.toFixed(3), rx: k.x, ry: k.y, rs: k.size };
    }
  },

  // ---- warp scramblers, webs and remote shield extenders: who's held, slowed or boosted right now ----
  _tickEffects() {
    const scram = new Set(), web = new Map(), ext = new Map(), now = this.simAt;
    const hold = (o, q, T) => {
      const r = Math.max(0, Math.hypot(o.x - q.x, o.y - q.y) - o.radius - q.radius);
      if (T.scramKm && r <= T.scramKm) scram.add(q.id);
      if (T.webKm && r <= T.webKm) web.set(q.id, Math.min(web.get(q.id) || 1, 1 - 0.6));
    };
    for (const o of this.ships.values()) {
      if (o.wp || o.cloak) continue;
      if (o.npc || o.admin) {                                // (owner) the ETA's officers and admins' ETA ships: what they have locked
        const T = SHIP_TYPES[o.type]; if (!T || (!T.scramKm && !T.webKm)) continue;
        for (const g of o.targets) { if (!g.locked || g.kind !== "ship") continue; const q = this.ships.get(g.id); if (q && !q.npc && !q.wp) hold(o, q, T); }
      }
      if (!o.act || o.npc) continue;
      o.act.forEach((a, i) => {
        if (!a || !a.on || a.standby || !a.tg || a.drones) return;
        const m = MODULES[o.fit.active[i]], c = o.calc.mods[i]; if (!m || !c) return;
        const q = this.ships.get(a.tg); if (!q || q.wp) return;
        if (m.kind === "scram") { scram.add(q.id); if (!a.agg) { a.agg = true; this.aggress(o.id, q.id); } }
        else if (m.kind === "web") { web.set(q.id, Math.min(web.get(q.id) || 1, 1 - c.web)); if (!a.agg) { a.agg = true; this.aggress(o.id, q.id); } }
        else if (m.kind === "remote_ext") ext.set(q.id, (ext.get(q.id) || 0) + c.shieldAdd);
      });
    }
    for (const s of this.ships.values()) {
      if (s.npc) continue;
      s.scram = scram.has(s.id);
      const wk = web.get(s.id) || 1, eb = ext.get(s.id) || 0;
      if ((s.webK || 1) !== wk || (s.extBuff || 0) !== eb) { s.webK = wk; s.web = wk < 1; s.extBuff = eb; this._recalc(s); }
    }
  },
};

export function installCombat(World) { Object.assign(World.prototype, methods); }
