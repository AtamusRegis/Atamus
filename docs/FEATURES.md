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

- **A 72 × 44 grid of 32 px tiles**, 2D top down, north up. Placeholder pixel art drawn in code, to be replaced.
- **You build the port (owner, 2026-11-01: building instead of unlocking).** Below the water and the quay the land is a
  grid of 4 × 4 tile cells. The quay road runs along the top row of cells and can't be changed; everything else is
  roads and buildings you place (see "Building").
- **What's on it:**
  - water with **one berth** for one big ship
  - the quay, with up to four **STS cranes** (A–D) over the quay road
  - roads, storage areas with their RTG cranes, the export area, tractor parking and the customer lot, wherever you
    build them
  - gates where a road runs off the map's left, right or bottom edge
- **Art (2026-11-01, owner: containers should look like containers, the boat less clunky):** containers have ribbed
  roofs, side rails, corner castings and a door end (in stacks, each tier is a small container lid, still shaded by
  tier). The ship has a curved bow, a rounded stern with a white accommodation block (bridge wings, windows, lifeboats,
  a funnel with a colored band), an antifouling rim, a steel deck with hatch covers and a railing, a forecastle, mooring
  lines while docked and a wake while moving. The ground has grainy asphalt with oil stains and painted edge lines,
  concrete slabs with joints, a hazard-striped quay edge with bollards and fenders, crane rails, storage pads with
  painted slot outlines and tyre tracks, and a chain-link fence.
- **Art and animation (2026-11-01, placeholder):** cranes speed up and brake; their spreader (a yellow frame) drops onto
  a container and lifts it, the container drawn a little bigger with its shadow further off the higher it hangs, and
  the grab or drop happens at the bottom of the motion. STS cranes have a lattice boom, a machinery house and a blinking
  light at the tip; RTGs have tyred bogies, striped legs and a cab. Trucks have wheels, headlights and brake lights that
  glow when stopped. Ships have a bridge, hatch lines, foam along the waterline and a funnel puffing smoke that drifts
  away; foam laps at the quay.
- **Always the live build (2026-11-01):** a game page the browser kept from an older build loads the live one.
- **Camera:**
  - drag the map (or WASD / arrows) to pan
  - the wheel (or a pinch) zooms
  - it starts fitted to the screen; on a touch screen (owner, 2026-11-01) close enough for a fingertip, over crane A,
    the first storage area and the tractor parking. Resizing later (a phone's address bar sliding away, turning it)
    keeps the view as it is.

## Traffic (owner, 2026-10-31: "have an actual traffic rule")

- **Roads are 4 lanes, 2 each way (owner, 2026-11-01):** trucks keep right. In each direction the outer lane is the one
  trucks drive in and line up in (at a crane or an RTG), and the inner lane is for passing. A truck held up by a stopped
  truck passes it in the inner lane and moves back; trucks plan round trucks that are standing still to be served or
  waiting their turn from the start, so nobody lines up behind a line it isn't in. A lane change needs the tile beside
  it free, unless what's there is standing still and not about to move into that lane (so a truck can slip into its
  spot ahead of the one waiting behind it). A double yellow line divides the two directions, dashed white lines the
  lanes, and faint arrows show the way.
- **Cells work themselves out:** a road cell runs east–west, north–south or both, depending on which neighbours are
  roads. Where it has neighbours both ways it's a junction (or corner) and trucks can turn any way there. A road that
  ends (a dead end, or a gate) has a turning loop at its end.
- **Don't block the junction (stress test, 2026-11-01):** a truck only drives into a junction, corner or turning loop
  with room beyond to clear it (and past any junction just beyond), and keeps that room for itself until it's through.
- **Gates (owner, 2026-11-01):** a road running straight off the left, right or bottom edge of the map is a gate, in and
  out. Customer and export trucks come in at a gate on land (the quay road's ends only if there's none) and leave by
  the nearest one.
- **No overlapping or clipping:** a truck holds the tiles under it (4 tiles) and moves on only into a free tile.
  Trucks queue up behind each other, and none can pass through another.
- **Truck shape:** a cab and a trailer bend around corners along the tiles they hold.
- **Parking pockets are private:** only the truck headed for a parking or lot spot drives into it.

## Containers (owner)

- **Nine colors:** red, orange, yellow, green, blue, purple, and the everyday white, gray and black (owner, 2026-11-01).
- **3 tiles long (owner).**
- **Every container is its own (owner, 2026-11-01):** a customer truck comes for one particular container, not a color.
- **A stack shows its top container at full size (owner, 2026-11-01),** as it looks on a truck (a container's footprint
  is 1 × 3: vertical in storage, horizontal on the ship). Stacks go up to 3 high.
- **Where a claimed container is in its stack (owner):** when a claimed container blinks, its whole stack blinks, green
  with it on top, yellow in the middle, red at the bottom.
- **One much larger ship at a single berth (owner, 2026-10-31)** instead of two small ones.
  - **Arriving:** it sails in from the west and docks a few seconds after the last one leaves.
  - **Small, medium and large (owner, 2026-11-01):** 6 × 3, 10 × 4 or 14 × 5 horizontal slots (columns from the west
    end × deck rows nearest the quay), each a stack of 0–3 containers. About a third small, two fifths medium, a quarter
    large. A small ship only reaches the western cranes.
  - **The timer (owner, 2026-11-01):** once docked, a ship has 90 s plus 8 s per container aboard to be unloaded,
    counting down beside its bow (red in the last 30 s). When it runs out, no new pickups can be assigned (owner), and
    each tractor still makes its next crane trip, the one it's on or else the first in its queue (owner, 2026-11-01), but
    no more: any crane trips after that, and export pickups, are called off, keeping the drop-off for what it's carrying. Then it sails with whatever is left, and customer trucks
    waiting for a container still aboard leave without it (frowning, unpaid).
- **Up to 4 STS cranes, A–D (owner, 2026-11-01),** side by side along the quay. The open ones split the ship's slot
  columns evenly, west to east (with only A, it works the whole ship).
- **Each crane's spot (owner, 2026-11-01):** a crane loads the truck stopped under it in the quay road's lane nearest
  the water (westbound): one cell of that lane, marked on the road. Trucks reach it heading west. The next truck for that
  crane waits in the cell just east of it; the rest wait in the tractor parking. No road can join the quay road from
  the south at a crane's spot, its waiting cell or the cell after that (kept clear, stress test 2026-11-01).
- **The STS crane unloads automatically, one container at a time (owner):** it serves the tractor standing at its
  spot. It runs along the quay to the slot, runs its trolley out, lifts the top container,
  brings it back and lowers it onto that tractor. Then it does the next.
- **Which slot (owner, 2026-11-01: "make the player able to tell the quay which column to pick a container from"):** a
  tractor sent by clicking a ship slot claims that slot's top container nobody has claimed yet, and gets **that
  container** (owner, 2026-11-01): if a crane moves it while sorting, the trip follows it (it's outlined where it is
  now). Cranes never set anything on top of a claimed container. If two tractors claimed containers in the same stack
  and the lower one's tractor arrives first, the two swap (owner). If containers whose trips were called off are left on
  top of it, the crane sets them aside on other slots of its columns first and still hands over the claimed one (owner),
  never a different one. Sent by clicking the crane or its spot, the crane takes the slot nearest the tractor
  (deck rows nearest the quay first), skipping containers claimed by slot.
- **Leaving:** once its imports are all off and nothing more is promised (exports on their way included), it sails off
  east with any exports loaded. Another follows.

## Storage areas and RTG cranes (owner)

- **Storage areas (owner, 2026-11-01: built, starting with a 1 × 5):** built beside four cells of plain straight road
  (no junction or dead end), 2 cells deep. Its containers lie along the road in 5 slots (3 tiles each), in rows going
  back from the road: 1 row to start, more bought one at a time, up to 6 (unbuilt rows show faint), stacked 3 high.
  The one you start with holds a few containers.
- **The export area (owner, 2026-11-01):** built the same way (one at most), framed blue and marked EXPORT. Once it's
  built, **export trucks** (grey cabs) come in every 10–16 s with a container (while there's room for it and room in its
  line), drop it at its RTG and leave. Its RTG stacks them on low stacks near the road and hands one to each empty
  tractor that comes for one, off the top of a tall stack nearby (exports are all alike: no digging). Customers never
  want exports. Export containers have a dark center.
- **Tractors drive off at once (owner, 2026-11-01):** a tractor leaves an STS crane the moment its container is lowered
  onto it (not once the crane's whole job is done), or, bringing an export with nothing to take back, the moment the
  export is lifted off. At an RTG a tractor or export truck leaves the moment its container is lifted off, while the RTG
  is still carrying it to the stack.
- **Holding two (owner, 2026-11-01):** an STS crane can hold a second container. While it's at the ship and another tractor is on its
  way to it right now, it lifts a spare and holds it, and the next tractor (one not sent for a particular slot) gets it
  straight away. An idle crane with a tractor on its way lifts a spare to hold ready; with none on its way it puts the
  spare back (owner: no holding one for no reason).
- **The next tractor first (owner, 2026-11-01):** a crane keeps an eye on the tractors on their way to it and works for
  the nearest one before anything else. Coming for whatever the crane picks, with the second slot free, it lifts a
  container ready (one a customer is waiting for, if one is on top in reach). **Coming for a claimed container** (owner),
  it first sets aside anything left on top of it, then lifts it ready in its second slot, kept for that tractor alone,
  and hands it straight over when the tractor arrives. It only sorts with no tractor coming (or with the spare in hand
  while the nearest is still a good way off), and only evens the stacks out with none coming at all.
- **Sorting the ship while idle (owner, 2026-11-01):** a crane with no tractor to serve digs out buried containers that
  customers want, or (owner) that a tractor has been sent for: it takes the top container off such a slot in its columns
  (the least buried first) and sets it on the nearest slot of its columns with no exports and no wanted or claimed
  container, onto a single first (making a stack of two), then an empty slot.
- **Stacks of two while idle (owner, 2026-11-01):** with nothing to sort, a crane evens its section out into stacks of
  two: the top container of a stack of three goes onto a single (else an empty slot), and failing that a single goes
  onto another single further west. It never buries a claimed or wanted container (and never moves one), and leaves
  exports and slots a tractor is coming for alone.
- **Exports onto the ship (owner):** a tractor carrying an export joins a crane's line (its kind's), and the crane puts
  it on the ship in a slot with no imports (nearest first; a slot never mixes imports and exports). **It pays $60
  then.** On the way back the crane takes an import for that same tractor, if its columns have one, so no trip is empty.
  Cranes serve tractors bringing exports first.
- **RTG spots (owner, 2026-11-01: the outer lane is the queue):** an RTG serves trucks stopped in the road's outer lane
  beside its storage area, one spot per cell (4 in all), driving in that lane's direction. You send a truck to an RTG,
  never to a spot: a truck takes the front free spot, or waits in the lane just before the storage area (when that cell
  is plain road the same way; up to 2, one behind the other, by who's nearest the front) until one clears, nearest
  first. With no waiting spot, a truck only heads there with a spot free. Trucks behind in line don't pass it; others
  pass in the inner lane. **A tractor only heads for an RTG with room in its line**; the rest wait in the tractor
  parking, and a loaded tractor drops off at another storage area with room if it can. Customer and export trucks only
  come in when there's room in their storage area's line.
- **Fair turns (bug 2026-11-01):** an RTG picks the nearest waiting truck, but the longer a truck has waited at its spot the
  more it counts, so a truck at a far spot is never passed over for good.
- **The RTG crane** spans the storage rows and the lane beside them and runs along the storage area. It serves the trucks
  at its spots one at a time.
- **It moves as little as it can (owner, 2026-11-01):** it stays where it finished instead of going back to rest. Over the
  lane (having just loaded a customer) it unloads a waiting tractor next; out in the stacks (having just set a container
  down) it digs for a waiting customer next. A tractor's container goes down near the container the next waiting
  customer wants (never on top of it), so the crane drops it on its way there.
- **A loaded yard tractor:** the RTG lifts the container off and stacks it on a low stack near the next customer's
  container (with no customer waiting, near the road), avoiding stacks holding a container a customer wants.
- **A customer truck:** the RTG finds the truck's container. It moves whatever is on top of it aside onto other stacks one
  by one, then lifts the container out and loads the truck.

## Trucks: you send them (owner)

- **Yard tractors** (numbered) start with one manual one, in the tractor parking. They can be empty or loaded.
- **Two kinds (owner, 2026-11-01):**
  - **Manual** (yellow cab): you pick what it fetches: a ship container (a slot, or a crane for its pick), or an export
    (click the export area). The rest it does itself (below).
  - **Auto** (teal cab): select it and click a storage area to assign it that RTG, outlined while it's
    selected. It then shuttles by itself: loaded, it takes the container to its RTG (when the area has room); empty, it
    fetches from the ship, a container a customer is waiting for if one is in reach and unclaimed, otherwise whatever its
    crane takes (the crane with the most left, one with room in its line first). **Assigned to the export area** it fetches
    exports instead, takes each to a crane, drops the import it's handed back at the nearest storage area with room,
    and goes back for the next. It works through anything you queue first,
    and parks when there's nothing to do or no RTG assigned.
- **The tractor parking (owner, 2026-11-01: built):** cells beside a straight road with 2 pull-in pockets each: in off
  the road's outer lane, round the far end and back out onto it. A tractor parks nose in, at the far end. **You can own
  as many tractors as there are spots**, so an idle tractor always has somewhere to park. You start with 3 cells (6
  spots). **New tractors appear there, and a tractor with nothing to do drives to the nearest free spot and parks**
  (loaded or empty). Sent somewhere on the way, it gives the spot up.
- **Loaded tractors deliver by themselves (owner, 2026-11-01):** any tractor that's loaded with nothing queued takes its
  container where it goes: an import to the nearest storage area with room (an auto tractor: its own RTG), an export
  to a crane (one with room for it on the ship, preferring one with room in its line and one that can hand back an import). You can still
  send it to a particular RTG yourself. An empty manual tractor waits in the tractor parking for you to pick what it
  fetches.
- **Waiting it out (bug fixes, 2026-11-01):** a tractor whose next step can't start yet (its crane line is full, there's
  no ship, nowhere to drop its container) waits in the tractor parking instead of where it stopped, and goes as soon as
  it can. An export is only picked up (by an auto tractor, or sent for by you) while a docked ship has room for one at a
  crane; a tractor still holding an export when its ship leaves parks and takes it to the next ship. When a ship
  leaves, each tractor's queue is tidied by what it will actually be carrying (crane trips go; an RTG trip stays only
  with an import to drop, an export pickup only empty-handed).
- **A list of pickups (owner, 2026-11-01):** click any number of ship slots (or the export area) for a manual tractor and
  it fetches them in turn, dropping each container off wherever it goes (as above) before the next. You never have to
  pick a storage area.
- **Fetching a slot with an auto tractor (owner):** click a ship slot with an auto tractor selected and it fetches that
  slot's top container next. If it's already on its way to a crane (and the crane hasn't started on it), that pickup
  becomes the slot's. It takes the container to its RTG and carries on.
- **Customer trucks (owner):** one arrives every 8–14 s (faster the more lot spots there are). With a free spot in a
  customer lot it comes in and parks there until its container is in storage; with no lot (or it full) it only comes
  when a container for it is already stored, and drives straight to that storage area's line (owner, 2026-11-01).
- **To its stack by itself (owner, 2026-11-01: "make trucks with a container in a stack automatically go to that stack"):**
  a parked customer truck whose container is in a storage area goes to that RTG on its own, once there's room in its
  line (one still on its way to the lot parks first). Only a truck with something else queued waits for that first.
- **The customer lot (owner, 2026-11-01: built):** cells of 2 pull-in pockets, like the tractor parking. None at the
  start.
- **Everyday and colored cargo (owner, 2026-11-01):** containers come in nine colors; white, gray and black are
  everyday cargo, about 60% of all containers. **Grey trucks** (most customers) come for any everyday container: they
  wait (in the lot), and now and then the longest-waiting one takes the easiest-to-reach unclaimed white, gray or black container in
  storage (fewest on top of it); its cab stays grey. **Colored trucks** come for a particular container of their cab's
  color, on the docked ship (anywhere in a slot's stack, even at the bottom, so you may have to import the whole stack
  to reach it) or in storage: about a quarter of trucks, more the more of the unclaimed stored containers are colored
  (so colored ones don't pile up). Never one another truck wants.
- **Dynamic (owner: "lower stacks, less trucks, higher stacks, more trucks"):** the fuller storage is with unclaimed
  containers (out of the room in the open storage areas), the more customers come (about a third of the base rate with
  none, over four times with it full), the more of them come grey (fewer want ship cargo), and the sooner grey ones
  pick (every minute or two with none, every few seconds when full; a little faster with more lot spots). Empty
  stacks get time to fill; nearly full ones draw a crowd.
- **Its container (owner):** a truck's cab is its container's color. **While the truck is selected its container
  flashes** wherever it is: in storage, on the ship, on a tractor or in a crane, **and a white dotted line runs from the
  truck to it**. **With no customer truck selected, a container on the ship that a customer is waiting for flashes until
  enough tractors are queued for its slot to dig down to it** (a crane already on its way to the slot counts as one), and
  only while it can still be claimed: not once its crane's containers are all spoken for, nor with its slot fully
  claimed.
- **Sharing:** tractors and customers share the RTG spots.
- **Sending a truck:**
  - Select one by clicking it (or 1–3 for tractors). Click it again, or open ground (roads, concrete, water: anywhere that isn't a crane or its spot, a ship slot, a storage area or a lot), to let go of it.
  - Then click an STS crane or its spot, a ship slot (tractors), a storage area (its RTG; the spot is whichever clears
    first), or (customers) a lot.
  - Clicks queue up, with no limit for now. The same RTG can be queued any number of times (owner).
- **Only where it can be served (owner):**
  - an empty tractor → an STS crane whose half of the docked ship has a container no one has claimed, or a ship slot
    with a container no one has claimed
  - a loaded tractor → an RTG with room in its area. If the area fills up meanwhile, or the tractor has nothing to
    deliver after all (its crane trip was called off), the RTG trip is called off and the tractor goes to park.
  - a customer → the RTG of the storage area holding its container (just one trip). A
    container still on the ship has to be brought in first.
  - a customer → a free lot spot
  - Whether a truck is empty or loaded counts its queued trips first. A queued trip claims its lot spot or ship container at once;
    a spot at a crane or RTG is taken when one clears for the truck. Anything else flashes a red ✕.
- **Showing it:** the selected truck's queued spots are outlined, numbered and joined by a dashed line. The target under
  the cursor shows green or red.
- **Taking back (owner, 2026-11-01: everything one tap):** tap (click) a numbered badge of the selected truck's queue to
  take that trip back, any of them but the one under way. Right click still removes the last one (with nothing left,
  it deselects); a long press on a touch screen does nothing except on a claimed ship container (below).
- **Hold to unclaim (owner, 2026-11-01):** press and hold (about half a second) a ship container the selected tractor
  has claimed to call that pickup off. With several of its claims in one stack, each hold calls off the top one first.
  Its trip under way goes too while the crane hasn't started on it.
- **Bigger hit areas (owner, 2026-11-01):** trucks and the containers on the docked ship can be hit from a little way
  off (further on a touch screen), and where two overlap the one nearest the pointer wins (a truck measured to its cab
  and trailer, a ship container to the middle of its slot). A queue badge, drawn on top, comes first.
- **Touch friendly (owner, 2026-11-01):** every control is a single tap. On a touch screen the queue badges are bigger, a tap that drifts a little still counts as a tap, and there
  is no hover preview.
- **Done:** a loaded customer truck shows a smiley and leaves by the nearest gate.

## Progress: income and building (owner, 2026-11-01)

> start with 1 tractor, 1 stack/RTG, 1 Quay, and 4 parking lots. let player earn small income from loading trucks with
> their container. let player unlock more trucks or quays or rtg/stacks or parking spots for the trucks etc

> (later the same day) implement building instead of unlocking. Player starts with a tractor and a 1x5 stack with 1 rtg,
> and no parking for trucks only the rtg lane. 5 parking for tractors. Player can build roads, all roads are 4 lanes

- **Starting setup:** 1 manual yard tractor, STS crane A, a storage area of 5 × 1 (a few containers in it) on a loop of
  road down from the quay road, a road down to a gate at the bottom, a tractor parking of 3 cells (6 spots), no
  customer lot. $500.
- **Income:** each customer truck loaded with its container pays **$60**. A green "+$60" rises over it. An export loaded
  onto the ship pays $60 too.
- **The money** shows top left, beside **+ Manual** and **+ Auto**, which buy another yard tractor of that kind. It
  appears in a free tractor parking spot (greyed out with none). Tractors cost $400, then $50 more each time; an auto
  tractor costs 4 times that (owner).
- **Building (owner, 2026-11-01):** the build buttons beside them: **Road** ($30 a cell), **Storage** ($600; tap an
  existing storage area to add a row, $250), **Parking** ($150, 2 tractor spots), **Lot** ($120, 2 customer spots),
  **Export** ($1,000), **Bulldoze**. Tap one to turn it on (again, or Escape, to turn it off). Roads and bulldozing: tap
  the map, or paint along a drag (the right mouse button or two fingers still pan); under the pointer the cell shows
  green or red with the price. **Blueprints (owner, 2026-11-01):** Storage, Export, Parking and Lot put a blueprint on
  the map instead (blue, red where it can't go, with its price and a bright edge on the side that faces the road),
  starting at the spot nearest the middle of the screen where it fits. Drag it to move it (it snaps to the cells), or
  tap elsewhere to move it there; its two round buttons turn it a quarter (R) and build it (Enter). It stays on after
  building, for the next one. In Storage mode tapping an existing storage area still adds a row. A storage area needs 4
  cells of plain straight road beside it on the side it faces; parking or a lot, a straight road cell. A road can't join a road a building is served from from the side (it would make it a
  junction), nor the quay road below a crane's spot, its waiting cell or the cell after it. Bulldozing refunds half: an empty road cell
  (not the quay road, not one a building is served from), an empty storage area, or a parking or lot cell with nobody
  in or bound for it (keeping a spot for every tractor).
- **Cranes are bought on the map:** a locked crane shows dimmed with its price (green when you can afford it). Click it
  to buy it: B, C, D for $2,000, $3,500, $5,000. A price you can't pay flashes a red ✕.
- **With only crane A, it works the whole ship.** Each crane bought takes its share.

## Rejected / removed

- **Stacks drawn as three squares, shaded by tier (2026-10-31 to 2026-11-01):** replaced by the top container at full size,
  with claimed containers' stacks blinking green / yellow / red for where they sit (owner).

- **Grey trucks taking any stored container and turning its color (2026-11-01):** replaced by grey trucks for everyday
  white, gray and black cargo, and colored trucks for matching colored containers (owner: "feels weird").

- **Picking the RTG for every loaded manual tractor (2026-11-01):** loaded tractors now deliver by themselves (owner).

- **The Loop switch, three identical lanes under each of two cranes (2026-11-01):** replaced by auto and manual tractors
  (an auto one is assigned an RTG), and up to 4 cranes each with an auto line, a manual line and a way-out lane between.

- **Idle tractors staying where they finished, keeping their STS lane or RTG bay (2026-11-01):** replaced by the tractor
  parking (owner).

- **Picking and claiming a particular RTG bay when queuing (2026-11-01):** replaced by the 5 bays as one queue (owner).

- **The fixed map, unlocking by tapping locked things, RTG bays, crane lanes (auto, manual, way out), the cranes' shared
  waiting line, one-way roads (2026-11-01):** replaced by building (owner): 4-lane two-way roads you lay, storage areas
  served from the road's outer lane, a spot and short line at each crane, parking pockets.
- **Packing the ship toward the west end while idle (2026-11-01):** replaced by evening it out into stacks of two (owner).
- **The east-bound two-lane RTG lane, drive-through southbound bays and stalls, the southwest gate, the east-bound yard
  road out the east gate, the two north streets only after storage areas 2 and 4, and the concrete strips (2026-11-01):**
  replaced by the owner's layout: one lane each way above the bays, two-way bays, customers in at the east and
  southeast gates and out the west gate, and a street beside every storage area.
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
