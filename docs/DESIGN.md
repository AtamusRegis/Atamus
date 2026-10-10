# Atamus redesign: zones, arcs and a 1,000-player world

Status: **planned** (2026-10-09). `docs/FEATURES.md` still describes the live game. This file is the agreed target. As each phase ships, its rules move into FEATURES.md and get marked done here.

## Goal

The game must hold **1,000 concurrent players** in high security: the likeliest launch stress test, driven by marketing. Every engine decision below serves that number. It is **proven by a bot load test before launch**, not assumed.

## The four zone types

1. **High security.** 20–30 persistent systems, each 1 AU across, linked by stargates.
   - New players start here and stay until they own an **arc**.
   - Each system has a sun, planets, stations, stargates and acceleration gates.
2. **Base surface.** Each player's home: a "dot" on a planet in their starting system.
   - Docking there opens the base surface, a grid where the player builds a **full production system connected by pipes** (no conveyors).
   - It's how players make an arc, other ships and modules, and it can also be bought.
   - It's a per-player instance, not part of the world simulation. Bases are created when players are on and dropped when they log off.
3. **Instances.** Asteroid belts, missions and quests, reached through **acceleration gates** in the main world.
   - Each instance type sets its own player cap, from 1 to 20.
   - Pilots and their ships go in; **arcs can't**, and wait in the main system.
4. **Wormhole space.** About 100 systems, 0.5 AU across, with planets and belts.
   - They have no stable connections: links to high security and to each other open and close all the time.
   - After logging off, a player never knows what their system will be connected to.

## The arc

- **A mobile base ship.** Before the arc, a player is bound to their starting system.
- **Moving between systems** happens by stargate and/or wormhole, and needs **all of the player's pilots inside the arc**. Once it has arrived, the pilots launch and go about the system independently until it moves again.
- **Pilots:** up to 5 per arc (open question: the account pilot cap is 3 today).

## Persistence (owner)

- **No logged-off presence in the world.** On logout, if not in a fight, the fleet docks in the arc and the arc despawns. Offline mining, staying awake offline and keeping ships in instances are removed.
- **Logging back in** warps the arc in from outside the system to where it was. In wormhole space it's the same system, though its links will have changed.
- **The only offline persistence is the base factory.** Its output is calculated when the player logs in (catch-up simulation), not ticked while they're away.
- **PvP comes later.** The design keeps room for an aggression timer and a "can't log off in a fight" state; nothing else is built for it yet.

## Scale and travel

- **Size.** 1 AU ≈ 150,000,000 km; today a system is 200 km. Free flight only makes sense locally.
- **Long travel is warp-to:** align, then warp to a point of interest (a planet, station, gate, acceleration gate, your arc, a fleet member) at AU-per-second speeds. A crossing takes roughly 5–40 s.
- **Local space:** around each point of interest, ships fly freely as they do today (a "grid" of a few hundred km).
- **The map zooms** from a few km to the whole system. At system scale it shows only points of interest (as icons), never distant ships.

## Engine targets (the 1,000-player budget)

| Budget | Target |
|---|---|
| Players online | 1,000 (design load), up to 5 ships each plus an arc, so about 6,000 world entities |
| Server tick | 20 Hz, under 50% of a core per system group at design load |
| Download per player | about 5–10 KB/s typical, under 40 KB/s in a crowded spot |
| Server upload total | about 10 MB/s typical at 1,000 players |
| Worst case | about 1,000 arcs and 5,000 ships at one station, survived through the cap, queue and time dilation (below) |

Today's engine (measured 2026-10-09): one system is good for 50–100 players, and the whole server for about 500 online. That's because every player gets every visible ship 15 times a second, and some checks loop over the whole world.

### How the engine gets there

1. **Systems are isolated.** Each system owns its entities, spatial index and tick. Cross-system work happens only at handoffs: gate or wormhole travel, chat, the market and the database. This lets system groups move onto separate cores or machines (worker threads, then processes) when needed.
2. **Spatial hash per system.** Collisions, targeting and "who's near me" are found by looking only at neighbouring cells. There are no world-wide loops.
3. **Interest management.** A client only gets entities on its grid (and its own fleet wherever it is):
   - **Changes only:** "entered", "left", and changed fields of what's still there. Positions are quantized; parked ships cost nearly nothing.
   - **Rate by distance:** about 15 Hz close up, about 5 Hz across the grid, and beyond a set count, far ships are sent as dots.
   - **Compression:** permessage-deflate on the socket, and binary encoding if measurements call for it.
4. **A player cap per system with a queue** at gates and at login warp-in. The cap is set from the load test (provisionally about 400 players).
5. **Arrivals scatter:** arcs drop out at a random point 50–200 km from the station or gate, not on top of it.
6. **Time dilation:** an overloaded system slows its own simulation clock instead of lagging or dropping players.
7. **Client level of detail:** the number of drawn ships is capped, and dots replace sprites beyond it, so phones survive crowds.

### Scaling path (owner: start small, grow to 100, 500, 1,000 and beyond)

Node runs the simulation on one core, so a bigger server only helps once systems run in parallel. Phase 1 builds the seams for that, so each step up is a configuration and hardware change, not a rewrite.

| Stage | Players | Setup |
|---|---|---|
| A | ~100 | One process: the front door (sockets, sessions, routing) and every system together. Today's server size is fine. |
| B | ~500 | One machine with more cores. The front door stays on the main thread; systems are spread over worker threads (system groups), with the busy hubs on their own workers. |
| C | ~1,000 | A bigger machine (8–16 cores), or two. Same workers; the front door routes each player to the worker running the system they're in. |
| D | 1,000+ | Several machines. Workers become separate processes on any machine, the front door stays in front, and the database (Postgres) is shared. |

What makes the steps cheap:
- **Each system is a self-contained unit.** It owns its state and tick, and talks to the rest only by messages: a player entering or leaving, chat, market orders, saves. In stage A those messages are function calls; in B–D they go to other threads or machines.
- **Players are routed by system.** Gate travel and logging in are a handoff from one system's worker to another. The client never knows where a system runs.
- **Shared things never sit in a system's tick:** accounts, pilots, the market, chat channels, base surfaces (not simulated in the world tick) and the database.
- **Every step is load-tested:** before each stage, the bot harness runs at that stage's player count on the target hardware.

### Load test (required before launch)

A headless bot client (a websocket bot) that logs in, launches, warps between points of interest, enters instances, mines, travels by gate and logs out.

- **Runs:** 1,000 bots spread over high security, then the worst case (everyone at one station).
- **Measures:** tick time, CPU, memory, upload per client and total, and snapshot delay.
- **Needs:** the PTR has to support many accounts for bots (today it is single-user).

## Phases

Each phase leaves the game playable, and is built and load-tested in the PTR before it goes live.

1. **World engine (wipe), at stage A with the stage B–D seams in place:**
   - AU-scale shared high-security systems with points of interest and warp-to;
   - system isolation, the spatial hash and interest-managed changes-only snapshots;
   - logging off despawns everything; the system cap, queue and time dilation;
   - the bot harness and a 1,000-bot run.
   - Today's personal home systems, stations, stargates and beacons are replaced.
2. **Base and crafting:** the planet base and base surface, buildings, pipes, recipes and catch-up production at login; crafting or buying an arc.
3. **Arcs and instances:** arc travel by stargate, pilots aboard, launching. General instances (belts, missions) with caps, through acceleration gates, with arcs waiting outside.
4. **Wormhole space:** about 100 systems of 0.5 AU, with links that keep changing.
5. **PvP (later):** combat modules, the aggression timer and the logoff rules.

## Kept from today

Ships and hulls, fitting (hardpoints, disposition, capacitor, running hot), the hotbar, modules, licenses and training, pilots, the market, inventories, warp visuals, acceleration gate visuals, instances (generalized), and the UI and window system.

## Open questions

- **Warp speed** in AU/s, and alignment times per hull class.
- **Grid size** (how far "local" free flight and interest reach).
- **Pilots:** the per-account pilot cap (3 today) versus up to 5 pilots per arc.
- **Before the arc:** how a new player's ships leave and return to the planet base (launch from it, dock at it).
- **Where the market lives:** stations, the base, or both.
- **Base surface:** grid size, building list, pipe rules (throughput, mixing) and catch-up limits (cap offline production?).
- **High security:** the number of systems (20–30) and their layout (gate map, hubs).
