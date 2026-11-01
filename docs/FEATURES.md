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
  - the truck road with five **bays**
  - a fence around the land
  - three forklift parking spots
- **Camera:**
  - drag the map (or WASD / arrows) to pan
  - the wheel (or a pinch) zooms between 0.5× and 3×
  - it starts fitted to the screen

## Containers (owner)

- **Ten colors:** red, orange, yellow, lime, green, teal, blue, purple, pink, white.
- One container fills one tile for now. Containers block forklifts. They don't stack yet.

## Boats

- **Arriving:** an empty berth gets a boat after a few seconds. It sails in from the left and docks.
- **Cargo:** 8–14 containers in random colors, on a 2-row, 8-tile deck.
- **Leaving:** once its deck is empty (and no forklift is on it), the boat waits a moment and sails off. Another boat
  follows.
- **The deck:** a docked boat's deck is drivable, so the back row can be reached once a front container is out of the way.

## Moving containers: forklifts (owner)

- **Ordering:**
  - Click a container to select it (it pulses). A container on a boat that's still arriving can't be picked.
  - Click an empty yard tile to send it there; a green ghost shows a valid spot.
  - Or click a waiting truck to deliver it.
  - Clicking the container again, Escape or right click deselects. Clicking a waiting order's container cancels the order.
- **Access (owner):** an order is only accepted when a forklift can drive to a free tile beside the container (side by
  side, not diagonal) **and** to one beside the destination. Otherwise a red ✕ flashes.
- **While it waits:** the order shows as a dashed outline in the container's color at the destination, with a dashed
  line from the container. The destination is reserved.
- **Doing the work:** three forklifts take the oldest order they can reach.
  - A forklift drives up beside the container, lifts it, carries it on its forks to a tile beside the destination and
    sets it down.
  - If its way gets blocked (a container put in the path), it finds another way. With none, it waits with a red "!" and
    keeps trying.
  - Idle forklifts go back to their parking spots.

## Trucks (owner)

- **Arriving:** a truck pulls into a free bay every 6–14 s.
  - Its cab is the color of the container it wants, picked from colors in the port (boats and yard), favoring ones no
    other truck wants.
- **Delivering:**
  - Select a container of that color and click the truck. Matching trucks pulse green while a container is selected.
  - A forklift reaches the trailer from the apron tile above it, so keep that tile clear.
  - A wrong color is refused (red ✕).
- **Leaving:** once its container is on the trailer, the truck shows a smiley and drives off.

## Rejected / removed

- **The spaceport (2026-10-31, the same evening):** ships landing on two pads, cargo grids dragged to four storage units,
  and workers carrying one item at a time. Replaced by the seaport (owner: "lets do a seaport with boats instead").

- **The multiplayer ring-mining game (2026-10-16 to 2026-10-30):** Saturn's rings, chunk-masonry asteroids, the Miner and
  other ships, the station, name-and-play, the game server socket. Removed 2026-10-31 (owner: "get rid of multiplayer.
  SP only"). See `reference/2026-10-31-pre-spaceport/docs/FEATURES.md` for how it worked.
- **The side games:** Breach.io and Skeleton Crew (scrapped 2026-10-21), and Salvage (scrapped 2026-10-31, owner: "get rid of
  the sub-games").
