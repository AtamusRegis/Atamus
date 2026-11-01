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

## The port

- **A 36 × 24 grid of 32 px tiles (owner)**, 2D top down, north up. Placeholder pixel art drawn in code, to be replaced.
- **What's on it:**
  - water along the top, with two **berths**, A and B
  - the quay and the container yard
  - an apron along the yard's bottom edge
  - **storage (owner, 2026-10-31):**
    - **one long walled storage area**, 18 × 5 inside, walled on the north, south and west and open at its east end
      (5 wide). A forklift drives in from that end, so it fills from the far end out.
    - **a 2 × 5 painted storage area with no walls**, east of it.
    - **Containers can be set down only in these two areas** (or on a truck).
  - the truck road with five **bays**
  - a fence around the land
  - three forklift starting spots
- **Camera:**
  - drag the map (or WASD / arrows) to pan
  - the wheel (or a pinch) zooms between 0.5× and 3×
  - it starts fitted to the screen

## Containers (owner)

- **Seven colors (owner, 2026-10-31):** red, orange, yellow, green, blue, purple, white (lime, teal and pink dropped).
- One container fills one tile for now. Containers block forklifts. They don't stack yet. Walls block forklifts too.

## Boats

- **Arriving:** an empty berth gets a boat after a few seconds. It sails in from the left and docks.
- **Cargo:** 8–14 containers in random colors, on a 2-row, 8-tile deck.
- **Leaving:** once its deck is empty (and no forklift is on it), the boat waits a moment and sails off. Another boat
  follows.
- **The deck:** a docked boat's deck is drivable, so the back row can be reached once a front container is out of the way.

## Forklifts: driven by you (owner, 2026-10-31)

> lets make the forklifts selectable and controllable individually instead of being AI. select forklift, select target,
> if forklift has container, selecting target is selecting where to drop the container. cant select to drop somewhere
> not accessible

- **Three forklifts**, numbered 1–3. Select one by clicking it, or with keys 1–3. Escape deselects.
- **Each forklift has a queue (owner, 2026-10-31):** every target you click is added to the end, and the forklift works
  through them in order (e.g. a container, then a truck: it picks the container up, then delivers it). No limit for now.
- **What a target can be** depends on what the forklift will be holding once its queue so far is done:
  - holding nothing: a container (drive up beside it and lift it), or an open tile (drive there).
  - holding a container: an empty storage tile (drive up beside it and set it down), a waiting truck of that
    container's color (load it from the apron tile above the trailer), or an open tile (drive there, still carrying).
- **Accepted only if it can still be done (owner):**
  - The forklift must be able to drive to it: to a free tile beside it (side by side, not diagonal) for a container or
    drop spot.
  - The check counts its own queued pickups as already gone and every claimed drop tile as already full. Anything else
    flashes a red ✕.
- **Claims (owner):** a queued action claims its container, drop tile or truck at once, and no other forklift can target
  it. A claim is released when the action is done or taken back.
- **Taking back:** right click removes the selected forklift's last queued action (not the one under way). With nothing
  left to take back, right click deselects.
- **Showing the queues:**
  - Every forklift's queued targets have dashed outlines: picks in the container's color, drops in the carried color.
  - The selected forklift's targets are numbered in order and joined by a dashed line from the forklift.
  - The tile under the cursor shows green or red, with a ghost of the container on a valid drop spot.
- **Blocked on the way:** if a container blocks its way, it finds another route. With none, it waits with a red "!" and
  keeps trying.
- Forklifts don't block each other.

## Trucks (owner)

- **Arriving:** a truck pulls into a free bay every 6–14 s.
  - Its cab is the color of the container it wants, picked from colors in the port (boats and yard), favoring ones no
    other truck wants.
- **Delivering:**
  - Have a forklift carry a container of that color and click the truck. Matching trucks pulse green while the
    selected forklift carries one.
  - A forklift reaches the trailer from the apron tile above it, so keep that tile clear.
  - A wrong color is refused (red ✕).
- **Leaving:** once its container is on the trailer, the truck shows a smiley and drives off.

## Rejected / removed

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
