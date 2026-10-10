# Atamus redesign: the Expanse, nomad space and a 1,000-player world

Status: **planned** (rev. 2, 2026-10-09). `docs/FEATURES.md` still describes the live game. This file is the agreed target. As each phase ships, its rules move into FEATURES.md and get marked done here.

## Goal

The game must hold **1,000 concurrent players**: the likeliest launch stress test, driven by marketing. Every engine decision below serves that number, and the server grows in stages (100 → 500 → 1,000+). Each stage is **proven by a bot load test**, not assumed.

## World structure (owner)

The world is a set of **systems**, and every system is a set of **points of interest (POIs)**. A POI is the unit of everything: you're always in exactly one, you see only who's in the same POI, and the server simulates and updates each POI on its own. Nothing is simulated in the space between POIs. A system's 1 AU size is a map that sets warp times and how the map looks, not simulated coordinates.

### The Expanse (the home world)

- **One persistent solar system, a flat-top hexagon 1 AU across (owner).** Most players live here for a long time.
- **Layout to start (owner):**
  - **1 sun** at the center. It's a backdrop and a map landmark, not a POI.
  - **4 planets**, each a POI. Player bases sit on them: a player's home is a dot on one planet, and "landing" opens the base surface (below), with no instance or world simulation behind it.
  - **1 station** for the marketplace and fitting. It's a POI.
  - **6 stargates, one in the middle of each side of the hexagon,** each a POI. They are the Expanse's links to nomad space (they replace wormholes here), and **players don't control them**. The server sets and changes where each one leads, by the balancing rules below.
  - **Asteroid belts are POIs, and their number is set by population (owner):** belt POIs spawn and despawn with how many players are in the Expanse. More players means more belts, so belts stay workable at any player count. *Proposed:* about one belt per 10–15 players in the Expanse, minimum 3; a belt with players in it is never despawned. New players mine here until they own an arc.
- **POIs are 50–100 km across (owner).** *Proposed:* station 100 km (popular), planets 80 km, stargates 60 km, belts 50 km. Each POI is its own local space, with free flight inside its boundary.
- **Proposed positions** (distance from the sun):
  - planets at about 0.10, 0.18, 0.27 and 0.38 AU, spread around the sun at different angles;
  - the station beside the second planet (about 0.18 AU);
  - stargates at the middle of each edge (about 0.48 AU, just inside the edge);
  - belts spawn between the planet orbits as population requires.
- **Map and zoom (owner):**
  - **Zoomed in** is POI scale: the POI you're in, at true km scale, as the game looks today.
  - **Zoomed out to solar scale,** every POI shows only as an icon. In the POI you're in, you also see its boundary and the ships inside.
  - *Proposed:* the same applies to any POI where you have ships (your own fleet only; strangers there show only when your camera is on that POI, per the engine rule).
- **Travel:** warp-to from POI to POI.
  - *Proposed:* warp speed about 3 AU/s, after aligning, so any hop in the Expanse takes a few seconds plus alignment.
  - You drop out at a scattered point inside the target POI.
- **More POIs later:** hundreds of them as content grows (more stations, NPC stations, belts and the like).
  - **Caps by popularity:** popular POIs (trading stations, NPC stations, home planets) get higher player caps; lower-priority ones (asteroid belts and the like) get lower caps.
  - **Bigger POIs** can contain **acceleration gates** to smaller capped instances.
- **The 6 stargates balance nomad space (owner).** What each gate connects to follows the Expanse's rules:
  - **new connections prefer low and mid** nomad systems (1–15 players, see the tiers below). They **can go to empty** world nomad systems, but only as a fallback, and **never to a high one**;
  - **an existing connection survives into high** (a system that grew to 16–25 while connected), but it's **cut the moment the system becomes overcrowded** (26+), after the 1-minute friend window. The Expanse is **never** connected to an overcrowded or past-50 system (owner);
  - a gate that gets too much traffic is also re-pointed elsewhere;
  - *Proposed:* a gate whose link is cut stays dark for a short while (about 1–2 minutes), then connects to a new system;
  - **Gate capacity (sim):** 6 gates with **one link each are enough up to a few hundred players** (61% of players in the Expanse at launch). At 1,000 players they're too few: players leave faster than they find a way back, so only 22% stay in the Expanse.
    - With **2 links per gate**, 36% stay in the Expanse (your third to half); with 3 links, 47%.
    - **Decided (owner): 6 gates with one link each for now.** If the Expanse share drops too low as players grow, **more gates are added** (rather than several links per gate). The sim says that's needed somewhere past a few hundred players online.
- **Stargates between hub worlds** only arrive if there's ever a second hub. The Expanse's 6 gates lead only to nomad space.

### Nomad space (wormhole systems)

- **Many smaller systems** (0.5 AU) with planets, belts and their own acceleration gate instances where needed. This is where better resources are.
- **No stable connections.** Wormholes open and close all the time, which is both the exploration and the **load balancing**.
- **Population tiers (owner):**

  | Tier | Players |
  |---|---|
  | Empty | 0 |
  | Low | 1–5 |
  | Mid | 6–15 |
  | High | 16–25 |
  | Overcrowded | 26–50 |
  | Past 50 | over 50 (population can keep growing) |

- **Population flow (owner):** a system's new wormholes depend on its tier. Each system can have **several wormholes at once**. The choices are **preferences**: if the preferred tier doesn't exist, the next one is used. In short, lone players drift toward groups, and big groups spread out.

  | From | Prefers, in order |
  |---|---|
  | Low | Mid, then high (high systems want to send people out) |
  | Mid | Anything except overcrowded or past 50 |
  | High | Lower tiers (low, then mid) |
  | Overcrowded | Empty, then low |
  | Past 50 | **Empty instanced systems only** (spawned if none are free) |

  - **Last resort:** if a system has no valid partner, the server spawns an empty instanced system for it. Nobody is ever stuck.
  - **Holes are checked when someone arrives:** after each arrival, the system's tier is recomputed and any of its holes that now break the rules close, after the friend delay. For example, 10 players entering a system of 20 make it 30 (overcrowded), so its holes are checked at once.
  - **Hole sizes (owner):** every hole spawns as **XS, S, M, L or XL**, letting through **5, 10, 15, 20 or 25 players**, and lives **30 minutes per size** (XS 30 min to XL 150 min).
    - **Life counts down from the moment it spawns,** and players never see the exact time.
    - **Every 5 crossings,** entering or leaving, **drop it one size**. Crossings shrink only the size, never the time, so an XS that started as an XL can still have 149 minutes left.
    - **How often each size spawns** (chosen by sim comparison): **XS 30%, S 30%, M 20%, L 12%, XL 8%**. Mostly small holes keep the network churning for exploration, with enough big ones for groups. Four other mixes landed within a few points of each; this one had the most players in mid systems.
    - **A group already going through always makes it,** even 100 at once. When a hole is used up it stays open **1 minute** for friends, then collapses.
    - *(sim, 1,000 players: holes collapse from use about 24 times an hour. Nomad space stays healthy (56% of players in mid, 33% high, 4% overcrowded, none past 50), and the 80-player group stays in empty instanced systems. The cost is that a whole group sometimes swamps a low system, about once every 3 hours, mostly groups leaving high systems as the rules intend; the tier rules spread them out again on the next hop. Two alternatives were rejected: refusing groups bigger than what's left of a hole traps any group over 25 forever, and making holes into low systems XS/S only barely helps.)*
  - **Settling is one-way:** a system that gets **busier switches tier immediately** (at the moment of arrival, so stricter rules apply at once); only **calming down** waits a few minutes, so one player hopping in and out doesn't flip its connections. *(sim: a two-way delay let an 80-player group keep slipping into world systems during the delay, reaching 111 players in one system. With one-way settling it stays in empty instanced systems.)*
- **Empty instanced systems (owner):** the server's dispersal tool, as **non-world** nomad systems made on demand.
  - **They have no planets,** so nobody can set home or camp there.
  - **They start with no connections.** A crowded system's group goes in, friends get **1 minute** to follow, then the hole **closes behind them**. The new system then connects only by its own tier (overcrowded: to empty or low; past 50: to empty only).
  - **A big group that won't split** just keeps hopping between empty systems, which is fine and never crushes a low system.
  - **Unused ones go away:** once empty, they're dropped.
  - **Logging out in one:** on login, the player arrives in a freshly spawned empty system with a wormhole out to a low or mid system, which closes behind them.
  - **Exits come at once:** a system that someone arrives in gets its exits immediately, not on the next maintenance pass.
- **How many world nomad systems (owner, checked by the sim):**
  - **At 1,000 players:** plan about **90**. With them, nomad players spend about 61% of their time in mid systems, 27% in high, 9% in low and 3% in overcrowded, with none past 50; the biggest system reaches 41.
  - **With only 40:** it still works, but it's busier (40% high, 6% overcrowded, a biggest system of 52).
  - **At launch (about 100 players):** about 12. With 8, high grows to 41%.
  - Unoccupied systems are unloaded, so the count costs nothing.
- **Expanse wormholes (sim):** keep about **one per 60 players online**. That gives about 37% of players in the Expanse (your third to half). With one per 120 it falls to about 20%, because players can't find a way back.
- **The follow window is 1 minute (owner):** when a hole is used up, cut by the rules, or leads into an empty instanced system, it stays open 1 minute for friends, then closes. That includes Expanse holes cut because their system became overcrowded.
- **No backtracking into crowds:** an unconnected system that fills up grows new exits of its own, but players can't backtrack to pile more people into it.
- **Home nomad system:** a player can have one (a world nomad system with a planet, never an empty system). On login they're put back there **even if it's overcrowded**; nomad space scales as needed.
- **Safety rules:**
  - **Every occupied system always has at least one exit.** An empty system that someone arrives in starts spawning exits by the rules above.
  - **Residents can always get home:** the arc has a **home jump (owner)**, a direct jump to your home nomad system on a long cooldown, whatever the wormholes are doing.
  - **The Expanse is reachable:** nomad space gets regular wormholes back to it (where bases and selling are). They follow the Expanse's own rules (low and mid systems, plus high ones already connected), so crowds return home by spreading out to quieter systems first. The return holes need to roughly match how fast the Expanse feeds players in (to tune).
- **Unloading:** world nomad systems with nobody in them are unloaded and reloaded from save, so a large pool costs nothing until it's used.

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
- **Nomad home:** how a player sets their home nomad system, and the home jump's cooldown.
- **Wormhole numbers:** the tiers, rules and hole sizes are set by the owner. Still to tune: how often wormholes spawn, and how long calming down takes to settle.
