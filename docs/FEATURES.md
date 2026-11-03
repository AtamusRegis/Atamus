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

- **A 71 × 43 grid of 32 px tiles (owner, 2026-10-31: "make the game area bigger")**, 2D top down, north up. Placeholder
  pixel art drawn in code, to be replaced.
- **What's on it, top to bottom:**
  - water with **one berth** for one big ship
  - the quay with two **STS cranes**, A and B
  - the **STS lanes**
  - the quay road
  - six **storage areas** with their RTG cranes, and west of them the **tractor parking**
  - the RTG lanes: the exit lane (west) above the tractors' lane (east)
  - the **RTG bays**
  - the yard road
  - the **parking lot** (48 stalls, for customer trucks)
  - the lot road, and the back road along the south fence
  - a fence, with gates on the east side (in, to the RTGs), at the southeast corner (in, to the lot) and on the west
    side (out)
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

- **One-way roads, two lanes each (owner, 2026-11-01: "each road should have 2 lanes so one can be used for passing"):**
  both lanes run the same way. Trucks keep to the right-hand lane; one held up by a stopped truck moves to the other lane
  and passes it, then moves back. A lane change needs the tile beside it free too; a truck held up only by that (two
  side by side, each changing into the other's lane) carries straight on and changes later. A dashed line divides the lanes and
  faint arrows show the direction.
- **The road layout (owner, 2026-11-01: routes should make sense; then a redo from the owner's marked-up screenshot):**
  - The quay road runs west. The west side and a lane east of every storage area but the export area run south from it to the RTG lanes (the lane east of the export area runs north, for the cranes' waiting line).
  - **The RTG lanes are one lane each way (owner):** the tractors' lane runs east, and above it the exit lane runs west
    and out the west gate. Tractors only cross the exit lane.
  - **RTG bays work both ways (owner):** tractors drive in from the tractors' lane above and out the bottom onto the yard
    road; customer and export trucks drive in from the yard road below and out the top, across the tractors' lane onto
    the exit lane.
  - The yard road runs west, from the east gate. The east side runs north from the tractors' lane to the quay road.
  - **A street north beside every storage area (owner),** one lane, from the yard road to the quay road, crossing both
    RTG lanes (where the concrete strips were; the empty ground east of the export area is gone too).
  - **No leftover concrete (owner, 2026-11-01):** every bit of ground in the yard that isn't a storage pad is paved
    asphalt, including the islands between groups of bays and the gaps in the lot.
  - **Don't block the crossing (stress test, 2026-11-01):** where roads cross, a truck only drives in with room beyond
    to clear it (and past any crossing just beyond), and keeps that room for itself until it's through, so a waiting
    line can't sit across a crossing. The same goes for a truck driving out of the top of a bay.
  - The lot road runs west from the southeast gate. Parking stalls are entered from it, northbound, and left onto the
    yard road. The west side runs north from the lot road to the tractors' lane.
  - **The back road:** from the west end of the yard road it runs down the west side of the lot, east along the south
    fence and up onto the yard road at its east end, for a truck in the lot whose RTG is east of its stall.
  - **A tractor's loop:** STS lane → quay road west → down to the tractors' lane → its bay → yard road west → up the
    street beside a storage area → quay road west → its STS lane.
  - **A customer's trip (owner):** with its container already stored and a bay free there, in at the east gate → yard
    road west → into the bay from below. Otherwise in at the southeast gate → lot road west → its stall, then out onto
    the yard road → the bay. Loaded: out the top of the bay → exit lane west → out the west gate.
- **No overlapping or clipping:** a truck holds the tiles under it (4 tiles) and moves on only into a free tile.
  Trucks queue up behind each other, and none can pass through another.
- **Truck shape:** a cab and a trailer bend around corners along the tiles they hold.
- **Spots are private:** STS lanes, RTG bays and parking stalls are entered only by the truck headed there; nobody cuts
  through them. Each berth's three lanes run west: trucks enter up a column east of the crane and leave down a column
  west of it, facing west under the crane.

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
- **Three lanes under each crane, one truck wide (owner, 2026-11-01),** all running west from an entry column east of
  the crane:
  - **the top lane is for auto tractors and the bottom lane for manual ones:** each is a line ending under the crane,
    the tractor being loaded plus 2 waiting behind it. A tractor joins its own kind's line when its trip there starts
    and moves up as the ones ahead leave (the line goes by who is furthest in). With its line full it waits where it is.
  - **the middle lane is the way out:** a tractor loaded under the crane pulls out into it and drives on to the exit
    column west of the crane, so the next in line moves straight up.
- **The cranes' shared waiting line (owner, 2026-11-01):** a tractor whose crane line is full waits in one line shared
  by all the cranes, instead of in the tractor parking: along the south lane of the quay road (from just past crane A's
  way in, eastward; the north lane is left free to pass it) and, at its back, up the lane east of the export area (now
  two lanes north, entered off the tractors' lane; the other lane passes it). Room for 13. It leaves the street and lane
  after storage area 4 clear. The line goes by who is furthest along it; each moves up as ones ahead leave, and one
  leaves for its crane, front first, as soon as its crane line has room. Nobody else jumps it: a tractor whose crane
  has a tractor waiting in the line joins the back. With the line full, a tractor waits in the tractor parking. Auto tractors and
  loaded export tractors head for a crane even when every crane line is full (one with room first), so they wait in
  this line too (bug fix, 2026-11-01).
  - **Other trucks go round it (owner):** trucks plan round the stretch of the line in use (and the next place in it),
    the long way if it stands across a shortcut. A new place at the back is only taken while no truck is already set
    to drive through it. Where the line stands across the top of the lane down to an RTG's line, a tractor only heads to
    that RTG with a bay free for it (taken at once), going the long way round.
- **The STS crane unloads automatically, one container at a time (owner):** it picks an empty tractor standing at a lane
  spot (the nearest lane first). It runs along the quay to the slot, runs its trolley out, lifts the top container,
  brings it back and lowers it onto that tractor. Then it does the next.
- **Which slot (owner, 2026-11-01: "make the player able to tell the quay which column to pick a container from"):** a
  tractor sent by clicking a ship slot claims that slot's top container nobody has claimed yet, and gets **that
  container** (owner, 2026-11-01): if a crane moves it while sorting, the trip follows it (it's outlined where it is
  now). Cranes never set anything on top of a claimed container. If two tractors claimed containers in the same stack
  and the lower one's tractor arrives first, the two swap (owner). If containers whose trips were called off are left on
  top of it, the crane sets them aside on other slots of its columns first and still hands over the claimed one (owner),
  never a different one. Sent by clicking the crane or its lanes, the crane takes the slot nearest the tractor
  (deck rows nearest the quay first), skipping containers claimed by slot.
- **Leaving:** once its imports are all off and nothing more is promised (exports on their way included), it sails off
  east with any exports loaded. Another follows.

## Storage areas and RTG cranes (owner)

- **Six storage areas, vertical, each 5 wide and 12 long:** 5 × 4 slots, one container footprint each, stacked up to 3
  high. The first starts part full; the others start empty when bought.
- **The export area (owner, 2026-11-01):** a seventh area of the same size at the east end, framed blue and marked
  EXPORT, bought on the map ($1,000). Once it's open, **export trucks** (grey cabs) come in at the east gate every
  10–16 s with a container (while there's room for it and a bay free), drive into a bay from below, drop it and leave by
  the exit lane and the west gate. Its RTG stacks them on low stacks near the bays and hands one to each empty tractor that comes for one, off the
  top of a tall stack nearby (exports are all alike: no digging). Customers never want exports. Export containers have
  a dark center.
- **Tractors drive off at once (owner, 2026-11-01):** a tractor leaves an STS crane the moment its container is lowered
  onto it (not once the crane's whole job is done), or, bringing an export with nothing to take back, the moment the
  export is lifted off. At an RTG a tractor or export truck leaves the moment its container is lifted off, while the RTG
  is still carrying it to the stack.
- **Holding two (owner, 2026-11-01):** an STS crane can hold a second container. With empty tractors at the front of
  both its lines it lifts one for each in a single trip; otherwise, while it's at the ship and another tractor is on its
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
- **RTG bays (owner):** below each area are 5 vertical bays, one per column, so up to five trucks park side by side.
  Tractors drive in from above, other trucks from below (see the road layout). A bay stays reserved until the truck it's
  for has driven all the way out of it.
- **The bays are one queue of 5 (owner, 2026-11-01):** you send a truck to an RTG, never to a particular bay. A tractor
  takes whichever bay is free, or waits in line at the foot of the lane down just west of the area (the tractors' lane
  is one lane, so the line waits where others can pass it) until one clears, first come first served. A bay is only
  handed to a tractor that has reached the line (or is just coming along the tractors' lane to it), never one still
  stuck in traffic. Trucks behind it in line don't pass it. **At most 3 tractors head for an RTG's line at once**
  (stress test, 2026-11-01: what the lane holds without backing onto the quay road); the rest wait in the tractor
  parking, and a loaded tractor drops off at another storage area with room if it can. A tractor that finished there drives off to the tractor
  parking. Customer and export trucks only set off with a bay free for them, which is theirs from then on: a
  customer's stall is its place in line.
- **Fair turns (bug 2026-11-01):** an RTG picks the nearest waiting truck, but the longer a truck has waited in its bay the
  more it counts, so a truck in a far bay is never passed over for good.
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
  dock, and (2026-11-01, stress test) a second block of 9 below the RTG lanes, entered off the back road at its south end and up
  its east aisle (which carries on up onto the tractors' lane, so a tractor sent elsewhere on the way drives straight
  out), and left up its west aisle onto the tractors' lane. **You can own as many tractors as there are spots (22)**, so an idle
  tractor always has somewhere to park. Tractors drive in from the east (the quay road carries on west past the cranes to its east road) and out to the
  west, then down to the tractors' lane. **New tractors appear there, and a tractor with nothing to do drives there and
  parks** (loaded or empty), taking the free spot nearest the top of whichever block is nearer. Sent somewhere on the way, it gives the spot up.
- **Loaded tractors deliver by themselves (owner, 2026-11-01):** any tractor that's loaded with nothing queued takes its
  container where it goes: an import to the nearest storage area with room (an auto tractor: its own RTG), an export
  into a crane's line (one with room for it on the ship, preferring one that can hand back an import). You can still
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
- **Customer trucks (owner):** one arrives every 8–14 s (faster the more stalls are open (owner): divided by 1 + (open
  stalls − 4) / 16). One whose container is already stored, with a bay of its RTG free, comes in at the east gate and
  drives straight into that bay (owner, 2026-11-01). Any other comes in at the southeast gate, when a stall is free, and
  parks in the lot until you send it.
- **To its stack by itself (owner, 2026-11-01: "make trucks with a container in a stack automatically go to that stack"):**
  a parked customer truck whose container is in a storage area goes to that RTG on its own, as soon as a bay there is
  free (one still on its way to its stall parks first). Only a truck with something else queued waits for that first.
- **Everyday and colored cargo (owner, 2026-11-01):** containers come in nine colors; white, gray and black are
  everyday cargo, about 60% of all containers. **Grey trucks** (most customers) come for any everyday container: they
  park, and now and then the longest-waiting one takes the easiest-to-reach unclaimed white, gray or black container in
  storage (fewest on top of it); its cab stays grey. **Colored trucks** come for a particular container of their cab's
  color, on the docked ship (anywhere in a slot's stack, even at the bottom, so you may have to import the whole stack
  to reach it) or in storage: about a quarter of trucks, more the more of the unclaimed stored containers are colored
  (so colored ones don't pile up). Never one another truck wants.
- **Dynamic (owner: "lower stacks, less trucks, higher stacks, more trucks"):** the fuller storage is with unclaimed
  containers (out of the room in the open storage areas), the more customers come (about a third of the base rate with
  none, over four times with it full), the more of them come grey (fewer want ship cargo), and the sooner grey ones
  pick (every minute or two with none, every few seconds when full; a little faster with more stalls open). Empty
  stacks get time to fill; nearly full ones draw a crowd.
- **Its container (owner):** a truck's cab is its container's color. **While the truck is selected its container
  flashes** wherever it is: in storage, on the ship, on a tractor or in a crane, **and a white dotted line runs from the
  truck to it**. **With no customer truck selected, a container on the ship that a customer is waiting for flashes until
  enough tractors are queued for its slot to dig down to it** (a crane already on its way to the slot counts as one), and
  only while it can still be claimed: not once its crane's containers are all spoken for, nor with its slot fully
  claimed.
- **Sharing:** tractors and customers share the RTG bays.
- **Sending a truck:**
  - Select one by clicking it (or 1–3 for tractors). Click it again, or open ground (roads, concrete, water: anywhere that isn't a crane or its lanes, a ship slot, a storage area or its bays, or a stall), to let go of it. The bare quay concrete around a crane counts as open ground. So do the RTG lanes between a storage area and its bays (a storage area is its pad and its bays).
  - Then click an STS crane or its lanes, a ship slot (tractors), a storage area or its bays (the RTG; the bay is
    whichever clears first), or (customers) a parking stall.
  - Clicks queue up, with no limit for now. The same RTG can be queued any number of times (owner).
- **Only where it can be served (owner):**
  - an empty tractor → an STS crane whose half of the docked ship has a container no one has claimed, or a ship slot
    with a container no one has claimed
  - a loaded tractor → an RTG with room in its area. If the area fills up meanwhile, or the tractor has nothing to
    deliver after all (its crane trip was called off), the RTG trip is called off and the tractor goes to park.
  - a customer → the RTG of the storage area holding its container (just one trip), with one of its bays free. A
    container still on the ship has to be brought in first.
  - a customer → a free stall
  - Whether a truck is empty or loaded counts its queued trips first. A queued trip claims its stall or ship slot at once (a
    customer's RTG trip its bay too); a tractor's RTG bay is taken only when one clears for it. Anything else flashes a red ✕.
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
- **Done:** a loaded customer truck shows a smiley and drives out the west gate.

## Progress: income and unlocks (owner, 2026-11-01)

> start with 1 tractor, 1 stack/RTG, 1 Quay, and 4 parking lots. let player earn small income from loading trucks with
> their container. let player unlock more trucks or quays or rtg/stacks or parking spots for the trucks etc

- **Starting setup:** 1 yard tractor, STS crane A, storage area 1 (part full), and the first 4 parking stalls. $500 (owner, 2026-11-01).
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

## The 3D view (owner, 2026-11-03)

- **game3d.html** is the same game (game.js runs the rules, clicks and queues) drawn in 3D by game3d.js with Three.js
  (self-hosted in website/vendor/). game.html stays the 2D game.
- **Scale:** one map tile is 1 m (1 unit, as in Unity), so a container is 3 × 1 × 1 and stacks show every container,
  up to 3 high (ship stacks too). Basic shapes for now (owner: the owner will make the models): boxes for the
  trucks' cabs and trailers, the cranes, the ship's hull, deck and accommodation block. The ground is the 2D game's
  painted ground (roads, markings, pads, bays, stalls) on the land, with the sea below the quay.
- **Camera (owner):** an orthographic (isometric-style) camera looking down at 45° to 90° (straight down), turned any
  way, zoomed. Touch: one finger pans; two fingers pinch to zoom and twist to turn (around the point between them), or
  slide up or down together to tilt. Mouse: the left button drags to pan, the right (or middle) button drags to turn
  (sideways) and tilt (up and down), the wheel zooms at the pointer. Keys: WASD / arrows pan, Q / E turn, R / F tilt,
  + / − zoom. It starts over the whole port, or on a touch screen close up over crane A and the first storage area.
- **Selecting (owner: make sure it works well):** what's under the pointer is worked out on the screen: a numbered badge
  of the selected truck's queue first; then whatever the pointer's ray meets first (a truck, the container on a truck's
  trailer, a container on the docked ship); otherwise the nearest truck or ship slot within reach (more on a touch
  screen), measured to the truck's cab and trailer or the slot's top. A ray meeting a storage stack picks the tile at
  the stack's top, so tapping a stack sends to that storage area. Taps, the long press to call off a claimed container
  and the right click to take back the last queued trip work as in 2D. The selected truck has a white pad under it
  (pulsing), the hovered one a fainter one; its queue, the green or red outline of what a click would do, a customer's
  dotted line, locked things with their prices, tractor numbers, faces, "+$60" and the ship's time are drawn flat on
  the screen over the 3D view. A customer's container flashes itself (green, yellow or red for where it sits in its
  stack), as do the ship's containers customers are waiting for.

## Rejected / removed

- **Building the port (2026-11-01), with blueprints (owner: reverted for now, 2026-11-02):** 4-lane roads on a grid of
  cells, storage areas beside roads, parking and lot pockets, export, bulldozing, and draggable, turnable blueprints.
  Back to the fixed map with unlocking. The code is in git at commit 4fa15ee.
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
