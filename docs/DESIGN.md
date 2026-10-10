# Atamus redesign: the Expanse, nomad space and a 1,000-player world

Status: **planned** (rev. 2, 2026-10-09). `docs/FEATURES.md` still describes the live game. This file is the agreed target. As each phase ships, its rules move into FEATURES.md and get marked done here.

## Goal

The game must hold **1,000 concurrent players**: the likeliest launch stress test, driven by marketing. Every engine decision below serves that number, and the server grows in stages (100 → 500 → 1,000+). Each stage is **proven by a bot load test**, not assumed.

## World structure (owner)

The world is a set of **systems**, and every system is a set of **points of interest (POIs)**. A POI is the unit of everything: you're always in exactly one, you see only who's in the same POI, and the server simulates and updates each POI on its own. Nothing is simulated in the space between POIs. A system's 1 AU size is a map that sets warp times and how the map looks, not simulated coordinates.

### The Expanse (the home world)

- **One persistent 1 AU solar system.** Most players live here for a long time.
- **Planets with player bases:** a player's home is a dot on a planet. "Landing" opens the base surface (below), with no instance or world simulation behind it.
- **Hundreds of POIs** to warp between: stations, trading and NPC stations, home planets, asteroid belts and so on.
  - **Caps by popularity:** popular POIs (trading stations, NPC stations, home planets) get higher player caps; lower-priority ones (asteroid belts and the like) get lower caps.
  - **Bigger POIs** can contain **acceleration gates** to smaller capped instances.
- **Wormholes** spawn and despawn in the Expanse and lead to nomad space.
  - **Load balancing:** when one gets too much traffic, it closes and a new one opens elsewhere.
- **Stargates** only arrive if there's ever a second hub world. They're skipped for now.

### Nomad space (wormhole systems)

- **Many smaller systems** (0.5 AU) with planets, belts and their own acceleration gate instances where needed. This is where better resources are.
- **No stable connections.** Wormholes open and close all the time, which is both the exploration and the **load balancing**.
- **Population flow (owner):** crowds drain outward toward empty space.
  - **A busy system's entrances** are biased to come from lower-population systems, so people are more likely to leave than to arrive.
  - **Its exits** are biased toward **empty, unconnected systems**.
  - **At a high threshold** (e.g. 100 players), a system's new wormholes lead to empty systems that have no other connections.
- **The follow window:** a wormhole stays open behind a traveller for a while (a set time or number of crossings), so friends can follow. It closes early if it's at its limit.
- **No backtracking into crowds:** an unconnected system that fills up grows new exits of its own, but players can't backtrack to pile more people into it.
- **Home nomad system:** a player can have one. On login they're put back there **even if it's over its threshold**; nomad space scales as needed.
- **Safety rules:**
  - **Every occupied system always has at least one exit.** A fresh unconnected system starts spawning exits once someone is in it.
  - **Residents can always get home:** their home system keeps a route in for them (see open questions).
  - **The Expanse is reachable:** nomad space gets regular wormholes back to it (where bases and selling are), biased to appear in busy nomad systems, which also drains them.
- **Unloading:** empty systems with no residents are unloaded and reloaded from save, so a large pool of nomad systems costs nothing until it's used.

### Instances (behind acceleration gates)

- Capped, private or deeper content: missions, quests, small belts (1–20 pilots, set per type), and better resources deeper inside a big POI. They can also serve as chokepoints once PvP exists.
- POIs already split the load, so gates are used only where they add something a POI can't.
- **Pilots go in; arcs can't,** and wait in the POI outside.

### The base surface

- Opened by landing at your home planet in the Expanse: a docked window showing your base layout and its editor.
- **A full production system connected by pipes** (no conveyors). It's where arcs, ships and modules are made (arcs can also be bought).
- **Offline:** the factory is the only thing that keeps going while you're away, and its output is calculated when you log in.

## The arc

- **A mobile base ship.** Before the arc, a player stays in the Expanse.
- **Moving between systems** goes through wormholes (stargates later), and needs **all of the player's pilots inside the arc**. Once it has arrived, the pilots launch and go about the system independently.
- **Pilots:** up to 5 per arc (open question: the account pilot cap is 3 today).

## Persistence (owner)

- **No logged-off presence in the world.** On logout, if not in a fight, the fleet docks in the arc and the arc despawns. Today's offline mining, staying awake offline and keeping ships in instances are removed.
- **Logging back in** warps the arc in from outside the system to where it was. In nomad space it's the same system (or your home nomad system), but the connections will have changed.
- **The only offline persistence is the base factory,** calculated when you log in.
- **PvP comes later** (always planned). The design keeps room for an aggression timer and a "can't log off in a fight" state.

## Engine (the 1,000-player budget)

| Budget | Target |
|---|---|
| Players online | 1,000 (design load), up to 5 ships each plus an arc, so about 6,000 entities |
| Server tick | 20 Hz, under 50% of a core per worker at design load |
| Download per player | about 5–10 KB/s typical, under 40 KB/s in a crowded POI |
| Server upload total | about 10 MB/s typical at 1,000 players |
| Worst case | a packed POI (e.g. a trading station at launch), survived through its cap and time dilation |

Today's engine (measured 2026-10-09): one system is good for 50–100 players, and the whole server for about 500 online. That's because every player gets every visible ship 15 times a second, and some checks loop over the whole world.

### How the engine gets there

1. **The POI is the unit.** Each POI owns its entities, its spatial hash (local free flight over a few hundred km), its tick and its clock. Work outside a POI happens only at handoffs: warping between POIs, wormholes and gates, chat, the market and the database. There are no world-wide loops.
2. **Warp is a handoff.** Align in one POI, travel off-simulation (the warp effect plays; time comes from the map distance at an AU/s speed), then arrive in the target POI at a scattered drop-out point.
3. **Updates follow the camera:**
   - **Full updates only for the POI the camera is on:** changes only ("entered", "left", changed fields), quantized positions, so parked ships cost nearly nothing.
   - **For other POIs where you have ships,** you only get your own ships' status (shield, hull, cargo, modules) a couple of times a second.
   - A player with 5 ships in 5 POIs costs about one POI's worth of traffic.
   - **Sockets are compressed** (permessage-deflate), with binary encoding if measurements call for it.
4. **Time dilation per POI:** each POI runs its own simulation clock, and every timer inside it (cycles, locks, module timers, alignment, heat, cans) uses that clock, never the wall clock.
   - A POI over its tick budget slows its clock (down to about 10%) instead of lagging; other POIs run at full speed.
   - Real-time things stay real-time: training, factories, wormhole lifetimes, logout.
   - Players see the dilation % only if the owner wants it (that's UI).
5. **POI caps** are the backstop for crowds that last: a higher cap for popular POIs and a lower one for belts. When one is full, it either queues warp-ins or opens a second copy of the POI (to decide: copies scale, but once PvP exists they let people dodge fights).
6. **Client level of detail:** the number of drawn ships is capped, and dots replace sprites beyond it, so phones survive crowds.

### Scaling path (owner: start small, grow to 100, 500, 1,000 and beyond)

Node runs the simulation on one core, so a bigger server only helps once POIs run in parallel. Phase 1 builds the seams for that, so each step up is a configuration and hardware change, not a rewrite.

| Stage | Players | Setup |
|---|---|---|
| A | ~100 | One process: the front door (sockets, sessions, routing) and every POI together. Today's server size is fine. |
| B | ~500 | One machine with more cores. The front door stays on the main thread; POIs are spread over worker threads, with busy POIs on their own workers. |
| C | ~1,000 | A bigger machine (8–16 cores), or two. Same workers; the front door routes each player's updates from the worker running their POI. |
| D | 1,000+ | Several machines. Workers become processes on any machine, the front door stays in front, and the database (Postgres) is shared. |

- **Each POI is self-contained.** It talks to the rest only by messages: arrivals, departures, chat, market orders, saves. In stage A those are function calls; in B–D they go to other threads or machines.
- **Shared things never sit in a POI's tick:** accounts, pilots, the market, chat, base surfaces and the database.
- **Load tests before each stage:** the bot harness runs at that stage's player count on the target hardware.

### Load test

A headless bot client that logs in, warps between POIs, mines, enters instances, takes wormholes and logs out.

- **Runs:** 100, 500 and 1,000 bots spread over the Expanse and nomad space, then the worst case (everyone at one trading station).
- **Measures:** tick time, CPU, memory, upload per client and total, and snapshot delay.
- **Needs:** the PTR has to support many accounts for bots (today it's single-user).

## Phases

Each phase leaves the game playable, and is built and load-tested in the PTR before it goes live.

1. **World engine (wipe), at stage A with the B–D seams in place:**
   - the Expanse as systems of POIs, with warp-to between them;
   - per-POI simulation, clocks and time dilation;
   - camera-following changes-only updates, and POI caps;
   - logging off despawns everything;
   - the bot harness and runs at 100, 500 and 1,000 bots.
   - Today's personal home systems, stations, stargates, beacons and asteroid instances are replaced.
2. **Base and crafting:** the planet base, the base surface editor, buildings, pipes, recipes and catch-up production at login; crafting or buying an arc.
3. **Arcs and instances:** pilots boarding and launching from arcs. General instances (missions, small belts) with caps, through acceleration gates, with arcs waiting outside.
4. **Nomad space:** wormhole systems, the population-flow rules, home nomad systems, and loading and unloading on demand.
5. **PvP (later):** combat modules, the aggression timer and the logoff rules.

## Kept from today

Ships and hulls, fitting (hardpoints, disposition, capacitor, running hot), the hotbar, modules, licenses and training, pilots, the market, inventories, warp visuals, acceleration gate visuals, and the UI and window system. Today's asteroid instances become the "small belt" instance type.

## Open questions

- **Warp speed** in AU/s, and alignment times per hull class.
- **POI size** (local free flight) and the cap for each POI type.
- **Full POI:** queue or a second copy.
- **Pilots:** the per-account pilot cap (3 today) versus up to 5 pilots per arc.
- **Before the arc:** how a new player's ships leave and return to the planet base.
- **Where the market lives:** stations, the base, or both.
- **Base surface:** grid size, building list, pipe rules (throughput, mixing) and catch-up limits.
- **Nomad home:** how a player sets their home nomad system, and how residents are guaranteed a way home (a wormhole that's always findable, or an arc "return home" on a long cooldown).
- **Wormhole numbers:** thresholds (e.g. 100), the follow-window length and crossing count, and how often Expanse wormholes spawn.
