# Salvage

A single-player sandbox prototype (owner, 2026-10-21): `website/salvage/` (atamus.io/salvage/), `index.html` +
`salvage.js` + `branko.png`. It replaced the two earlier side projects, Breach.io and Skeleton Crew (owner: "scrap the two
side projects"); they live only in git history now.

Isometric 2D pixel art. You command a salvage crew (one salvager for now, Branko) on a small tug docked to a derelict.
You take the derelict apart and haul the parts home to sell. Parts are wired, bolted, pressurized and powered together, so
the order you do things in matters. It's a sandbox: there's no goal, no timer and no losing. A dead salvager wakes back
up on the ship, and NEW DERELICT resets the wreck (your credits stay).

## Art

- **Branko** is the owner's sprite: 8 directions × idle / walk / interact, cut from the owner's sheet into `branko.png`.
  The sheet has 13 × 21 frames; columns are anim × 3 frames, rows are S, SE, E, NE, N, NW, W, SW.
- **Everything else is placeholder:** iso boxes and pixel icons drawn in code, waiting for the owner's art.
- **Rendering:** the world draws at low resolution and scales up by a whole number (nearest neighbor). Tiles are 2:1
  diamonds, 24 × 12. Walls are cutaway height, and a wall in front of Branko fades.

## Controls

- WASD / arrows walk, in screen directions. Clicking the deck walks there.
- 1–6 or the mouse wheel pick a tool.
- Hold left on a thing to use the tool on it (Branko walks over first). An action shows its name by the cursor and a
  progress bar.
- E uses hands on the thing under the cursor or the nearest one. Q, right click or the hands slot drops what you carry.
- M mutes.

## Tools

Hands (pick up / open / pull / switch), Screwdriver, Saw, Blowtorch, Cutters, Charges (3 s fuse).

## Carrying and selling

- Small loot goes into a 6-slot pack. Big loot is carried in your hands: one at a time, slower, and no other tools.
- Stepping on the **sell pad** in your ship sells the pack. Big items dropped on the pad sell.
- A crate carried home whole sells with its contents.

## The derelict, and how its parts tie together

**Power.** Power is on while the reactor runs and the breaker is closed (it's in the breached closet).
- With power: doors open at a touch, terminals run, and the wiring behind panels is live.
- Without power: doors must be cranked (slow), and the derelict is dark apart from your headlamp.

**Reactor** (engineering).
- The console SCRAMs it (power off; the core cools for a while) or restarts it if the fuel cell is in.
- To take the fuel cell (the most valuable part): unbolt the housing (4), open it, then pull the cell.
- Wrong order:
  - An open running reactor irradiates you.
  - Pulling the cell from a running reactor, or cutting into a running or still-cooling one, melts it down: a huge
    blast and fire.
  - Pulling the cell while it's still cooling burns you.
  - Cutting the console away while the reactor runs leaves no way to SCRAM it (the breaker still cuts power).

**Wall panels.**
- Unscrew 4, then pry the panel off (it's loot). That exposes the wiring.
- Cut or rip the wiring out for copper. If it's live, you're shocked and it's ruined.
- Sawing or torching a panel off cuts the wiring behind it (a shock if live).

**Terminals.**
- Unscrew the casing (4), lift it, then pull the data core. Cutters snip the cables (copper).
- Pulling the core with power on fries it (a corrupted core is worth far less).
- Cutting the terminal apart destroys the core.

**Breaker.** Hands switch it. Cutting it out while live shocks you.

**Coolant pipes.**
- Unscrew 2 clamps, then lift the pipe out. Sawing or torching it gives a cut pipe (worth less).
- Opening a pipe while the core is hot scalds you with steam.

**O₂ tanks** (pressurized).
- Open the valve first; then the tank can be carried.
- Torching a full tank blows it up. Sawing one ruptures it: it rockets off and blows up where it hits.

**Fuel barrels.**
- They can be carried.
- Torching one blows it up and spreads burning fuel. Sawing one spills fuel on the deck.
- A barrel carried through fire goes up.

**Cargo crates.**
- Crates are strapped down. Cutters cut the straps (2); then the crate can be carried home whole.
- Opening the lid spills its contents to pick up one by one.
- Sawing a crate scraps some of the contents; torching it burns everything and starts a fire.

**Doors.** Hands open them (crank when unpowered). The blowtorch cuts through one (a door slab to sell).

**Walls.**
- The blowtorch cuts through an inner bulkhead (it becomes rubble deck), or cuts a hull plate out of an outer wall
  (loot, and a breach to space).

**Charges.** A charge blows things up and chains into tanks, barrels and running reactors. It takes nearby walls out
(the hull becomes breaches), breaks doors, scraps loot in the blast and starts fires.

## Air

- Rooms hold air; open doors share it. A breach drains every room connected to it.
- Decompression blows loose loot toward the breach (it's lost to space) and pushes you.
- The breached closet starts in vacuum, so opening its door vents the bridge.
- Your ship refills its air when sealed.
- Your suit's O₂ drains in vacuum and refills in air. Out of O₂, you choke.

## Fire

- Fire needs air: vacuum puts it out. It spreads (fast over spilled fuel) and burns you.
- It cooks off barrels and tanks, and burns crates.
