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

- **A 73 × 42 grid of 32 px tiles (owner, 2026-10-31: "make the game area bigger")**, 2D top down, north up. Placeholder
  pixel art drawn in code, to be replaced.
- **What's on it, top to bottom:**
  - water with **one berth** for one big ship
  - the quay with two **STS cranes**, A and B
  - the **STS lanes**
  - the quay road
  - six **storage areas** with their RTG cranes, and west of them the **tractor parking**
  - the RTG lane
  - the **RTG bays**
  - the yard road
  - the **parking lot** (48 stalls, for customer trucks)
  - the lot road
  - a fence, with a gate at its southwest corner (in) and one on the east side (out)
- **Camera:**
  - drag the map (or WASD / arrows) to pan
  - the wheel (or a pinch) zooms
  - it starts fitted to the screen

## Traffic (owner, 2026-10-31: "have an actual traffic rule")

- **One-way roads, two lanes each (owner, 2026-11-01: "each road should have 2 lanes so one can be used for passing"):**
  both lanes run the same way. Trucks keep to the right-hand lane; one held up by a stopped truck moves to the other lane
  and passes it, then moves back. A lane change needs the tile beside it free too; a truck held up only by that (two
  side by side, each changing into the other's lane) carries straight on and changes later. A dashed line divides the lanes and
  faint arrows show the direction.
- **The road layout (owner, 2026-11-01: routes should make sense, no loop back past the lot first):**
  - The quay road runs west. The west side and the lanes between the storage areas run south from it to the RTG lane,
    which runs east. RTG bays are drive-through southbound, from the RTG lane to the yard road.
  - The yard road runs east and out the east gate. The east side runs north from it to the quay road.
  - Customer trucks come in at the southwest gate and up the west side to the yard road. Parking stalls are
    drive-through southbound, from the yard road to the lot road, which runs west to the west side. From there it runs
    north to the RTG lane.
  - **A tractor's loop:** STS lane → quay road west → down to the RTG lane → its bay → yard road east → up the east side
    → quay road west → its STS lane.
  - **A customer's trip:** in at the southwest gate → yard road east → its stall. When sent: lot road west → up the west
    side → RTG lane east → its bay → yard road east → out the east gate.
- **No overlapping or clipping:** a truck holds the tiles under it (4 tiles) and moves on only into a free tile.
  Trucks queue up behind each other, and none can pass through another.
- **Truck shape:** a cab and a trailer bend around corners along the tiles they hold.
- **Spots are private:** STS lanes, RTG bays and parking stalls are entered only by the truck headed there; nobody cuts
  through them. Each berth's three lanes run west: trucks enter up a column east of the crane and leave down a column
  west of it, facing west under the crane.

## Containers (owner)

- **Seven colors:** red, orange, yellow, green, blue, purple, white.
- **3 tiles long (owner).**
- **Every container is its own (owner, 2026-11-01):** a customer truck comes for one particular container, not a color.
- **A stack is drawn as three squares** down its 1 × 3 footprint (owner): the top square is the top of the stack and the
  bottom square the bottom, each in that container's color or empty. For example empty / green / red is two containers,
  red at the bottom and green on top. Storage slots draw this way. **A ship's slots are 3 × 1, horizontal (owner)**, with
  the same three squares left to right (left the top). Stacks go up to 3 high.

## The ship and STS cranes

- **One much larger ship at a single berth (owner, 2026-10-31)** instead of two small ones.
  - **Arriving:** it sails in from the west and docks a few seconds after the last one leaves.
  - **Small, medium and large (owner, 2026-11-01):** 6 × 3, 10 × 4 or 14 × 5 horizontal slots (columns from the west
    end × deck rows nearest the quay), each a stack of 0–3 containers. About a third small, two fifths medium, a quarter
    large. A small ship only reaches the western cranes.
  - **The timer (owner, 2026-11-01):** once docked, a ship has 90 s plus 8 s per container aboard to be unloaded,
    counting down beside its bow (red in the last 30 s). When it runs out, no new pickups can be assigned (owner), but the
    ones already assigned, queued trips too, are finished first. Then it sails with whatever is left, and customer trucks
    waiting for a container still aboard leave without it (frowning, unpaid).
- **Up to 4 STS cranes, A–D (owner, 2026-11-01),** side by side along the quay. The open ones split the ship's slot
  columns evenly, west to east (with only A, it works the whole ship).
- **Three lanes under each crane, one truck wide (owner, 2026-11-01),** all running west from an entry column east of
  the crane:
  - **the top lane is for auto tractors and the bottom lane for manual ones:** each is a line ending under the crane,
    the tractor being loaded plus 2 waiting behind it. A tractor joins its own kind's line when its trip there starts
    and moves up as the ones ahead leave (the line goes by who is furthest in). With its line full it waits where it is.
  - **the middle lane is the way out:** a tractor loaded under the crane pulls out into it and drives on to the exit
    column west of the crane, so the next in line moves straight up.
- **The STS crane unloads automatically, one container at a time (owner):** it picks an empty tractor standing at a lane
  spot (the nearest lane first). It runs along the quay to the slot, runs its trolley out, lifts the top container,
  brings it back and lowers it onto that tractor. Then it does the next.
- **Which slot (owner, 2026-11-01: "make the player able to tell the quay which column to pick a container from"):** a
  tractor sent by clicking a ship slot gets the top container of that slot. That needs a slot with a container nobody
  has claimed, and claims it. Sent by clicking the crane or its lanes, the crane takes the slot nearest the tractor
  (deck rows nearest the quay first), skipping containers claimed by slot.
- **Leaving:** once its imports are all off and nothing more is promised (exports on their way included), it sails off
  east with any exports loaded. Another follows.

## Storage areas and RTG cranes (owner)

- **Six storage areas, vertical, each 5 wide and 12 long:** 5 × 4 slots, one container footprint each, stacked up to 3
  high. The first starts part full; the others start empty when bought.
- **The export area (owner, 2026-11-01):** a seventh area of the same size at the east end, framed blue and marked
  EXPORT, bought on the map ($1,000). Once it's open, **export trucks** (grey cabs) come in at the southwest gate every
  10–16 s with a container (while there's room for it), line up at its RTG like any truck, drop it and leave by the east
  gate. Its RTG stacks them on low stacks near the bays and hands one to each empty tractor that comes for one, off the
  top of a tall stack nearby (exports are all alike: no digging). Customers never want exports. Export containers have
  a dark center.
- **Exports onto the ship (owner):** a tractor carrying an export joins a crane's line (its kind's), and the crane puts
  it on the ship in a slot with no imports (nearest first; a slot never mixes imports and exports). **It pays $60
  then.** On the way back the crane takes an import for that same tractor, if its columns have one, so no trip is empty.
  Cranes serve tractors bringing exports first.
- **RTG bays (owner):** below each area are 5 vertical drive-through bays, one per column, so up to five trucks park side
  by side. Trucks drive in from the RTG lane and out onto the yard road (southbound).
- **The bays are one queue of 5 (owner, 2026-11-01):** you send a truck to an RTG, never to a particular bay. It takes
  whichever bay is free, or waits in line on the RTG lane at the area's west end until one clears, first come first
  served. Trucks behind it in line don't pass it. A tractor that finished there drives off to the tractor parking.
- **The RTG crane** starts at the area's south end. It serves the trucks standing in its bays one at a time, running its
  gantry down over them.
- **It moves as little as it can (owner, 2026-11-01):** it stays where it finished instead of going back to rest. At the
  bays (having just loaded a customer) it unloads a waiting tractor next; out in the stacks (having just set a container
  down) it digs for a waiting customer next. A tractor's container goes down near the container the next waiting
  customer wants (never on top of it), so the crane drops it on its way there.
- **A loaded yard tractor:** the RTG lifts the container off and stacks it on a low stack near the next customer's
  container (with no customer waiting, near the bays), avoiding stacks holding a container a customer wants.
- **A customer truck:** the RTG finds the truck's container. It moves whatever is on top of it aside onto other stacks one
  by one, then lifts the container out and loads the truck.

## Trucks: you send them (owner)

- **Yard tractors** (numbered) start with one manual one, in the tractor parking. They can be empty or loaded.
- **Two kinds (owner, 2026-11-01):**
  - **Manual** (yellow cab): you pick what it fetches: a ship container (a slot, or a crane for its pick), or an export
    (click the export area). The rest it does itself (below).
  - **Auto** (teal cab): select it and click a storage area (or its bays) to assign it that RTG, outlined while it's
    selected. It then shuttles by itself: loaded, it takes the container to its RTG (when the area has room); empty, it
    fetches from the ship, a container a customer is waiting for if one is in reach and unclaimed, otherwise whatever its
    crane takes (the crane with the most left, with room in its auto line). **Assigned to the export area** it fetches
    exports instead, takes each to a crane, drops the import it's handed back at the nearest storage area with room,
    and goes back for the next. It works through anything you queue first,
    and parks when there's nothing to do or no RTG assigned.
- **The tractor parking (owner, 2026-11-01):** one column of 13 horizontal spots west of the storage areas, left of the
  dock. Tractors drive in from the east (the quay road carries on west past the cranes to its east road) and out to the
  west, then down to the RTG lane. **New tractors appear there, and a tractor with nothing to do drives there and
  parks** (loaded or empty), taking the free spot nearest the top. Sent somewhere on the way, it gives the spot up.
- **Loaded tractors deliver by themselves (owner, 2026-11-01):** any tractor that's loaded with nothing queued takes its
  container where it goes: an import to the nearest storage area with room (an auto tractor: its own RTG), an export
  into a crane's line (one with room for it on the ship, preferring one that can hand back an import). You can still
  send it to a particular RTG yourself. An empty manual tractor waits in the tractor parking for you to pick what it
  fetches.
- **A list of pickups (owner, 2026-11-01):** click any number of ship slots (or the export area) for a manual tractor and
  it fetches them in turn, dropping each container off wherever it goes (as above) before the next. You never have to
  pick a storage area.
- **Fetching a slot with an auto tractor (owner):** click a ship slot with an auto tractor selected and it fetches that
  slot's top container next. If it's already on its way to a crane (and the crane hasn't started on it), that pickup
  becomes the slot's. It takes the container to its RTG and carries on.
- **Customer trucks park (owner):** a customer truck drives in at the southwest gate every 8–14 s (faster the more stalls
  are open (owner): divided by 1 + (open stalls − 4) / 16), when a stall is free,
  and parks in the lot until you send it.
- **To its stack by itself (owner, 2026-11-01: "make trucks with a container in a stack automatically go to that stack"):**
  a customer truck whose container is in a storage area goes to that RTG on its own. If it hasn't parked yet it skips
  the stall (giving it up) and drives straight up the west side; if it's parked it leaves when the container gets
  there. Only a truck with something else queued waits for that first.
- **Each customer wants one container (owner, 2026-11-01):** picked when it arrives from the containers in open storage
  areas or on top of a slot of the docked ship, never one another customer wants (with none to pick, none comes). A
  quarter want one already in storage, three quarters one on the ship (owner). Its
  cab is that container's color. **While the truck is selected its container flashes** wherever it is: in storage, on
  the ship, on a tractor or in a crane, **and a white dotted line runs from the truck to it** (owner). **With no customer
  truck selected, a container on the ship that a customer is waiting for flashes until a tractor is queued for its slot** (or a crane is already on its way to lift it)
  (owner).
- **Sharing:** tractors and customers share the RTG bays.
- **Sending a truck:**
  - Select one by clicking it (or 1–3 for tractors).
  - Then click an STS crane or its lanes, a ship slot (tractors), a storage area or its bays (the RTG; the bay is
    whichever clears first), or (customers) a parking stall.
  - Clicks queue up, with no limit for now. The same RTG can be queued any number of times (owner).
- **Only where it can be served (owner):**
  - an empty tractor → an STS crane whose half of the docked ship has a container no one has claimed, or a ship slot
    with a container no one has claimed
  - a loaded tractor → an RTG with room in its area. If the area fills up meanwhile, or the tractor has nothing to
    deliver after all (its crane trip was called off), the RTG trip is called off and the tractor goes to park.
  - a customer → the RTG of the storage area holding its container (just one trip). A container still
    on the ship has to be brought in first.
  - a customer → a free stall
  - Whether a truck is empty or loaded counts its queued trips first. A queued trip claims its stall or ship slot at once; an RTG
    bay is taken only when one clears for the truck. Anything else flashes a red ✕.
- **Showing it:** the selected truck's queued spots are outlined, numbered and joined by a dashed line. The target under
  the cursor shows green or red.
- **Taking back:** right click removes the selected truck's last queued trip (not the one under way). With nothing left,
  right click deselects.
- **Done:** a loaded customer truck shows a smiley and drives out the east gate.

## Progress: income and unlocks (owner, 2026-11-01)

> start with 1 tractor, 1 stack/RTG, 1 Quay, and 4 parking lots. let player earn small income from loading trucks with
> their container. let player unlock more trucks or quays or rtg/stacks or parking spots for the trucks etc

- **Starting setup:** 1 yard tractor, STS crane A, storage area 1 (part full), and the first 4 parking stalls. $0.
- **Income:** each customer truck loaded with its container pays **$60**. A green "+$60" rises over it.
- **The money** shows top left, beside **+ Manual** and **+ Auto**, which buy another yard tractor of that kind. It
  appears empty in the tractor parking or, with that full, at the front of an open crane's line for its kind or in a
  free RTG bay of an open storage area. With no free lane or bay the button is greyed out. Tractors cost
  $400, then $50 more each time (owner, 2026-11-01); an auto tractor costs 4 times that (owner).
- **Buying on the map:** locked things show dimmed with their price (green when you can afford it). Click one to buy it.
  A price you can't pay flashes a red ✕.
  - storage areas 2–6 with their RTG cranes and bays: $600, $900, $1,300, $1,800, $2,400; the export area: $1,000
  - STS cranes B, C, D with their lanes: $2,000, $3,500, $5,000
  - parking stalls, in groups of 4 (owner, 2026-11-01: 48 in all): $200, $300, $400, $500, $600, $700, $800, $900,
    $1,000, $1,200, $1,400
- **Locked things can't be used:** no trucks go to them, and customer trucks only park in open stalls and want containers
  in open storage (or on the ship).
- **With only crane A, it works the whole ship.** Each crane bought takes its share.

## Rejected / removed

- **Picking the RTG for every loaded manual tractor (2026-11-01):** loaded tractors now deliver by themselves (owner).

- **The Loop switch, three identical lanes under each of two cranes (2026-11-01):** replaced by auto and manual tractors
  (an auto one is assigned an RTG), and up to 4 cranes each with an auto line, a manual line and a way-out lane between.

- **Idle tractors staying where they finished, keeping their STS lane or RTG bay (2026-11-01):** replaced by the tractor
  parking (owner).

- **Picking and claiming a particular RTG bay when queuing (2026-11-01):** replaced by the 5 bays as one queue (owner).

- **Single-lane roads, northbound RTG bays and stalls, the gate road along the bottom (2026-11-01):** replaced by two-lane
  roads laid out so customers don't loop up past the quay first. Customers wanting any container of a color, and the
  RTG stacking onto the same color, replaced by one particular container per customer. Tractors going $300 more each
  replaced by $50 more each.

- **Two berths with a small ship each, ship slots running across the deck (2026-10-31, later):** replaced by one big ship
  with 3 × 1 horizontal slots, worked by both cranes.

- **Tractors working on their own when nothing was queued (2026-10-31, later; owner: "too automated"):** removed.

- **The single STS line of three trucks one behind another, tractors parking in the lot (2026-10-31, later):** replaced by
  three lanes side by side under each crane, and tractors that keep working.

- **Trucks driving through each other, a single parking spot at each crane, the east parking stubs (2026-10-31, later):**
  replaced by one-way traffic with held tiles, STS lines for three, RTG bays for five and the shared parking lot.

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
