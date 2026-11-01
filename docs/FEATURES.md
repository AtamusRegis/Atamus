# Atamus: how the game works today

This is a living spec of the game. Read it before every patch, and update it in the same commit as any change to
behavior. Rules marked **(owner)** were decided explicitly by the owner, so keep them unless the owner says otherwise.

## The redo (owner, 2026-10-31)

> new main game. get rid of multiplayer. SP only. were making a scifi spaceport management game. ships will come to land,
> ships will take off. for now just make two landing pads with ships going to and away from it. 2D top down, grid tile
> based art (will replace later with better visuals, 32x32 tiles cuz we will later have npc's). when ships land, you can
> click them to see their inventory grid, and drag the items in the grid to different storage units to have npc's come
> up, and take one item at a time to the storage unit until that storage unit is full

- **Single player, in the browser, no server (owner).** `website/game.html` + `game.js`. The multiplayer ring-mining game,
  name-and-play, the game socket and the Salvage prototype are gone. Their code is snapshotted in
  `reference/2026-10-31-pre-spaceport/` (with the old FEATURES.md and design docs). The old database tables stay untouched.
- **Nothing is saved yet:** a reload starts a fresh port.
- `play.html` just forwards to `game.html`. The front page's Play now goes straight to the game.

## A seaport, not a spaceport (owner, 2026-10-31, same evening)

> hmm, lets do a seaport with boats instead. 2 ports for now, instead of storage units, we will have containers. player
> moves containers via forklifts to where he tells them to be placed, and containers must have a way for forklifts to
> get to the destination to be picked up or dropped off. 10 different colors of containers. trucks come to the dock, and
> their cab is colored like the container they need. player must get the container color to match with a forklift and
> bring it to that truck for it to be happy.

## A container terminal (owner, 2026-10-31, later that evening)

> lets make ship to shore cranes automatically unload containers from the ships. lets make containers 3 units long, lets
> make each line of storage areas 5 units wide and 12 units long. lets make an RTG crane at the end of each unit for
> loading and unloading units to each storage area. lets make storage areas vertical on the screen. for each unit in
> storage, have 3 squares, each square can be the color of the unit type, and ordered from top to bottom … instead of
> forklifts, lets have trucks that can be empty or loaded to move between the ship to shores, and rtg's. for now, lets
> have the player choose a truck, tell it where to park next to an rtg, and have that rtg load that truck with a container
> for it to leave with

## The port

- **A 36 × 24 grid of 32 px tiles (owner)**, 2D top down, north up. Placeholder pixel art drawn in code, to be replaced.
- **What's on it, top to bottom:**
  - water with two **berths**, A and B
  - the quay, with a **ship-to-shore (STS) crane** at each berth
  - the quay road
  - four **storage areas** with an **RTG crane** at each one's south end
  - the yard road
  - a fence
- **Roads:** lanes between the storage areas join the two roads, and six parking stubs line the east side. Trucks drive
  only on roads.
- **Camera:**
  - drag the map (or WASD / arrows) to pan
  - the wheel (or a pinch) zooms
  - it starts fitted to the screen

## Containers (owner)

- **Seven colors:** red, orange, yellow, green, blue, purple, white.
- **3 tiles long (owner).**
- **A stack is drawn as three squares** down its 1 × 3 footprint (owner): the top square is the top of the stack and the
  bottom square the bottom, each in that container's color or empty. For example empty / green / red is two containers,
  red at the bottom and green on top. Ships' bays and storage slots both draw this way. Stacks go up to 3 high.

## Ships and STS cranes

- **Arriving:** an empty berth gets a ship after a few seconds. It sails in and docks.
- **Cargo:** 10 bays, each a stack of 0–3 containers (12 or more in all).
- **The STS crane unloads automatically (owner)** onto an empty yard truck parked under it:
  - it runs along the quay to the nearest bay with a container and runs its trolley out over the ship
  - it lifts the top container, brings it back and lowers it onto the truck
- **Leaving:** once its bays are empty and nothing more is promised, the ship sails off. Another follows.

## Storage areas and RTG cranes (owner)

- **Four storage areas, vertical, each 5 wide and 12 long:** 5 × 4 slots, one container footprint each, stacked up to 3
  high (60 containers per area). They start part full.
- **Each has an RTG crane at its south end.** Its gantry runs along the area and its trolley across it. It serves the truck
  parked at the area's spot on the yard road below it, then goes back to rest at the area's end.
- **A loaded yard truck:** the RTG lifts the container off and stacks it on the lowest stack nearest the road (on top of
  the same color when it can).
- **A customer truck:** the RTG finds a container of the truck's color with the fewest on top. It moves those aside onto
  other stacks one by one, then lifts the container out and loads the truck.

## Trucks: you send them (owner)

- **Three yard trucks** (yellow cabs, numbered 1–3) start at the parking stubs. They can be empty or loaded.
- **Customer trucks** pull into a free stub every 9–16 s. Their cab is the color of the container they want, picked
  from colors in storage that no other waiting customer wants.
- **Sending a truck:**
  - Select one by clicking it (or 1–3 for yard trucks).
  - Click a berth's STS crane or a storage area (its RTG), and the truck drives there by road and parks at its spot.
  - Clicks queue up, with no limit for now. For example STS A, then storage 2, then STS A again.
- **Only where it can be served (owner):**
  - an empty yard truck → an STS with a docked ship that still has a container no one has claimed
  - a loaded yard truck → an RTG whose area has room
  - a customer → an RTG whose area has its color, unclaimed. A customer takes just one trip.
  - Whether a truck is empty or loaded counts its queued trips first. Each queued trip claims its container or slot at
    once. Anything else flashes a red ✕.
- **Showing it:** the selected truck's queued spots are numbered and joined by a dashed line. The target under the cursor
  shows green or red.
- **Taking back:** right click removes the selected truck's last queued trip (not the one under way). With nothing left,
  right click deselects.
- **Sharing a spot:** a truck stops back from a spot another truck is using and pulls in when it's free. Trucks don't
  otherwise block each other.
- **Done:** a loaded customer truck shows a smiley and drives off east.

## Rejected / removed

- **Forklifts, 1-tile containers, the long walled storage and the 2 × 5 patch, apron truck bays (2026-10-31, later):**
  replaced by STS cranes, 3-tile containers, four vertical storage areas with RTG cranes, and trucks you send between
  them.

- **A forklift doing one thing at a time, a new target replacing the old (2026-10-31, the same evening):** replaced by
  each forklift's own queue.
- **Forklifts as AI, taking orders from a queue (2026-10-31, the same evening):** replaced by driving each forklift
  yourself. The three separate walled storage areas and placing containers anywhere in the yard were replaced by the
  long storage area and the 2 × 5 patch.

- **The spaceport (2026-10-31, the same evening):** ships landing on two pads, cargo grids dragged to four storage units,
  and workers carrying one item at a time. Replaced by the seaport (owner: "lets do a seaport with boats instead").

- **The multiplayer ring-mining game (2026-10-16 to 2026-10-30):** Saturn's rings, chunk-masonry asteroids, the Miner and
  other ships, the station, name-and-play, the game server socket. Removed 2026-10-31 (owner: "get rid of multiplayer.
  SP only"). See `reference/2026-10-31-pre-spaceport/docs/FEATURES.md` for how it worked.
- **The side games:** Breach.io and Skeleton Crew (scrapped 2026-10-21), and Salvage (scrapped 2026-10-31, owner: "get rid of
  the sub-games").
