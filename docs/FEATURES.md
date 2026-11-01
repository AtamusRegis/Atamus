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

## The port

- **A 36 × 24 grid of 32 px tiles (owner)**, 2D top down, north up. Placeholder pixel art drawn in code, to be replaced.
- **What's on it:**
  - a fence around the edge
  - two **landing pads**, A and B (5 × 5)
  - a taxi road
  - four **storage units** (3 × 3) with doors on the road side
  - crew quarters (where the workers wait) and a control tower (decor)
- **Camera:**
  - drag the map (or WASD / arrows) to pan
  - the wheel (or a pinch) zooms between 0.5× and 3×
  - it starts fitted to the screen

## Ships

- **Arriving:** an empty pad gets a new ship after a few seconds. The pad's border pulses green while a ship is inbound.
  - The ship flies in from off the map, high and with a big shadow, then descends onto the pad.
  - Ships are placeholder sprites with five hull colors and random wing and body shapes, and a name like "MV Kestrel".
- **Cargo:** a 6 × 3 cargo grid holding 3–6 stacks of Ore, Ice, Food, Fuel, Parts or Medical (4–16 each).
- **Leaving:** once its cargo is all unloaded, a landed ship waits a moment, then takes off and flies away. Depart sends it
  off with whatever is left (workers still walking to it give up).

## Unloading (owner)

- **Click a ship** to open its panel: name, status (Approaching / Landing / Landed / Taking off / Departing) with its pad,
  the cargo grid, and Depart. Escape, ×, or clicking empty ground closes it.
- **Drag a stack** (landed ships only):
  - onto a **storage unit**, either its card in the bottom strip or the building on the map, to send it there. The slot
    gets a badge in that unit's color and number. Dragging it again re-targets it.
  - onto another slot in the grid to move it there.
- **Workers (three for now)** do the carrying, always the nearest open job:
  - A worker walks to one of the pad's loading tiles and picks up **one item**.
  - They carry it to the unit's door and drop it in, then come back for the next. They carry the item over their head.
- **Until the unit is full:** storage units hold 40 items each, counting items already on the way. When the unit fills,
  the stack's slot turns red and its workers stop. Re-target it to another unit to carry on.
- **The storage strip** shows each unit's fill and its contents stacked by type. Clicking a card centers the map on the
  unit; clicking a unit on the map flashes its card. Each unit's roof shows a fill bar.

## Rejected / removed

- **The multiplayer ring-mining game (2026-10-16 to 2026-10-30):** Saturn's rings, chunk-masonry asteroids, the Miner and
  other ships, the station, name-and-play, the game server socket. Removed 2026-10-31 (owner: "get rid of multiplayer.
  SP only"). See `reference/2026-10-31-pre-spaceport/docs/FEATURES.md` for how it worked.
- **The side games:** Breach.io and Skeleton Crew (scrapped 2026-10-21), and Salvage (scrapped 2026-10-31, owner: "get rid of
  the sub-games").
