// The tutorial shard (owner): a private, throwaway copy of the game for testers. Each entry from the website builds a
// fresh World just for that player: nothing in it is saved, and nothing in the live game is touched. A list of steps
// walks through flying and mining, the station, the home planet and the base; the base runs 60× faster here.
import { World } from "./world.js";
import * as Base from "./base.js";
import * as Inv from "./inventory.js";

export const TUTORIAL_BASE_SPEED = 60;                // base production runs this many times faster in the tutorial
const START_CREDITS = 10_000_000;
const STOCK = { hull_plating: 10, structural_beam: 8, bolts_fasteners: 40, cable_spool: 4, circuit_board: 2, power_cell: 1, thruster_nozzle: 2, engine_assembly: 1, sensor_dish: 1, gyroscope: 1, viewport_glass: 1 };

const ships = (w, p) => [...w.ships.values()].filter((s) => s.owner === p.id);
const anyShip = (w, p, f) => ships(w, p).some(f);
const ofType = (p, t) => p.base.buildings.filter((q) => q.type === t);
const links = (p) => Base.links(p.base);
const feeds = (p, a, b) => { const L = links(p); return a.some((x) => b.some((y) => L.down.get(x) && L.down.get(x).has(y))); };
const stores = (p) => p.base.buildings.filter((q) => q.type.startsWith("storage"));

// [title, what to do, done?(world, player, tutorial state)]
export const STEPS = [
  ["Undock", "Your Prospector is docked at Expanse Station. Select it and press Undock.", (w, p) => anyShip(w, p, (s) => !s.docked)],
  ["Warp to a belt", "Right-click (or hold) empty space, open Belts and pick one to warp there.", (w, p) => anyShip(w, p, (s) => s.sys && (w.pois.get(s.sys) || {}).kind === "belt" && !s.wp)],
  ["Lock an asteroid", "Right-click (or hold) an asteroid and choose Lock.", (w, p) => anyShip(w, p, (s) => (s.targets || []).length > 0)],
  ["Mine", "Press Mine (X) to run your mining lasers on it. Ore lands in your ore hold at the end of each cycle.", (w, p) => anyShip(w, p, (s) => (s.lasers || []).some((l) => l.on))],
  ["Fill up", "Mine 100 m³ of ore.", (w, p) => anyShip(w, p, (s) => Inv.usedM3(s.inv.ore) >= 100)],
  ["Back to the station", "Warp to Expanse Station (right-click space › Stations).", (w, p) => anyShip(w, p, (s) => s.sys === "station" && !s.wp)],
  ["Dock", "Fly close to the station and press Dock.", (w, p) => anyShip(w, p, (s) => s.docked && s.sys === "station")],
  ["Sell some ore", "Open your ship's inventory, right-click (or hold) the ore and Sell some of it. Keep some for your base.", (w, p, st) => st.sold],
  ["Buy a module", "Open the Market and buy a Mining Laser Upgrade. It's delivered to the station's Deliveries.", (w, p, st) => st.bought],
  ["Fit it", "Open your ship's Fitting and drag the module from Deliveries onto it.", (w, p, st) => st.fitted],
  ["Fly home", "Undock and warp to your home planet (right-click space › Planets; it's the one marked as home).", (w, p) => anyShip(w, p, (s) => s.sys === p.home && !s.wp)],
  ["Dock at home", "Dock at your home planet. Your ore hold empties into the Home Base.", (w, p) => anyShip(w, p, (s) => s.docked && s.sys === p.home)],
  ["Open your base", "Open the Base window (left panel, or right-click your home planet › Open base).", (w, p) => p.baseOpen],
  ["Build a refinery", "Pick Refinery in the palette and click the grid to place it. R or right-click turns it first.", (w, p) => ofType(p, "refinery").length > 0],
  ["Pipe ore to it", "Pick Pipe and drag from a socket on the Home Base to a socket on the refinery. Pipes flow the way you drag.", (w, p) => feeds(p, ofType(p, "home"), ofType(p, "refinery"))],
  ["Store the iums", "Drag a pipe from the refinery to a storage depot. Refined iums collect there.", (w, p) => feeds(p, ofType(p, "refinery"), stores(p))],
  ["Build a factory", "Place a Factory, pipe a storage depot into it, select it and pick Steel Plate.", (w, p) => ofType(p, "factory").some((q) => q.recipe && links(p).up.get(q) && [...links(p).up.get(q)].some((x) => x.type.startsWith("storage")))],
  ["Make a Steel Plate", "Wait for the factory to make one (the base runs 60× faster in the tutorial). Pipe its output to storage if it stalls.", (w, p) => ofType(p, "factory").some((q) => (q.made || 0) > 0)],
  ["Build a shipyard", "Place a Frigate Shipyard and pipe the Supply Depot (already stocked with a Prospector's parts) into it.", (w, p) => ofType(p, "dock_frigate").some((q) => links(p).up.get(q) && links(p).up.get(q).size > 0)],
  ["Start a build", "Select the shipyard and pick the Prospector.", (w, p) => ofType(p, "dock_frigate").some((q) => q.job || (q.made || 0) > 0)],
  ["Launch it", "A Prospector takes 2 hours, 2 minutes here. It appears docked at your home planet when done.", (w, p, st) => st.built],
];

/** A fresh tutorial: its own World, set up for one player. */
export function createTutorial() {
  const world = new World();
  world.baseSpeed = TUTORIAL_BASE_SPEED;
  world._maintainPois();
  const st = { step: 0, sold: false, bought: false, fitted: false, built: false, sentSig: "", lastAt: Date.now() };
  // watch the player's own actions, without touching the World's code
  const wrap = (name, after) => { const orig = world[name].bind(world); world[name] = (pid, ...a) => { const p = world.players.get(pid), c0 = p ? p.credits : 0, f0 = p ? ships(world, p).reduce((n, s) => n + s.fit.length, 0) : 0; const r = orig(pid, ...a); if (p) after(p, c0, f0); return r; }; };
  wrap("cmdSell", (p, c0) => { if (p.credits > c0) st.sold = true; });
  wrap("cmdBuy", (p, c0) => { if (p.credits < c0) st.bought = true; });
  wrap("cmdFit", (p, c0, f0) => { if (ships(world, p).reduce((n, s) => n + s.fit.length, 0) > f0) st.fitted = true; });
  const spawn = world._spawnBuilt.bind(world); world._spawnBuilt = (p, type) => { spawn(p, type); st.built = true; };

  return {
    world, st,
    /** Join: a player, a fixed pilot, credits, a Home Base with ore in it and a stocked Supply Depot. */
    join(pid, name, send) {
      const p = world.addPlayer(pid, name, send);
      p.credits = START_CREDITS;
      p.pilots = [{ id: "tutorial", name, licenses: { mining_frigate: 1, small_mining_laser: 1 } }];
      p.licenses = { mining_frigate: 1, small_mining_laser: 1 };
      world.assignDefaultPilots(pid);
      if (!p.tutorialSetUp) {
        p.tutorialSetUp = true;
        const home = Base.homeOf(p.base); Object.assign(home.store, { ironstone: 20_000, cuprite: 5_000, cobaltine: 5_000 });
        const dep = Base.place(p.base, "storage", 24, 31); Object.assign(dep.store, STOCK); dep.label = "Supply Depot";
      }
      st.sentSig = "";
      return p;
    },
    /** Advance through every step already done; tell the client when the step changes. */
    tick(p) {
      while (st.step < STEPS.length && STEPS[st.step][2](world, p, st)) st.step++;
      const s = STEPS[st.step], msg = { t: "tut", i: st.step, n: STEPS.length, title: s ? s[0] : "Tutorial complete", text: s ? s[1] : "That's the game so far. Leave from the menu and pick a server again to start over.", done: !s };
      const sig = JSON.stringify(msg); if (sig !== st.sentSig) { st.sentSig = sig; p.send(sig); }
    },
  };
}
