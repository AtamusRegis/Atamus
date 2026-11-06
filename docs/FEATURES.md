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

## A cargo station in space (owner, 2026-11-05)

> Let's pivot this to space sci-fi with ships and hexagonal containers instead of trucks and roads etc

Asked: free-flying ships (not a reskin on lanes), honeycomb storage, and remove the 2D page (owner). The rules carried
over from the container terminal (ships on a timer, claims, digging, queues, customers, exports, money and buying) are
kept; roads, lanes, tiles and the 2D game are gone (see Rejected / removed). The terminal's full spec is in git
(docs/FEATURES.md at commit 343a3d7).

## Building the station (owner, 2026-11-05)

> Let's start with 1 tractor, 1 crane, 1 storage stack, 1 input and 1 output parking for the storage. And 4 parking
> spots for trucks in general, as well as only 1 input/output parking spot per quay crane. Players can place ghost
> blueprints of buildings anywhere and confirm to buy them and place them there. [...] Also make stacks expandable same
> with Cranes. [...] For each upgraded slot per stack, player can choose what shape to use. Circle square or hexagon
> [...] Get rid of grey containers for certain trucks, make them picked up by their respective colors as well

Asked (owner): blueprints for platforms, customer pads, dock stations and loader arms; platforms grow a whole row or
column at a time; the freighter takes any shape; all at once.

## The station

- **Meters, 3D (owner):** 1 unit = 1 m, x east, z south, y up. `game.js` has the rules, `game3d.js` draws it
  (Three.js, self-hosted in website/vendor/). Basic shapes for now (owner: the owner will make the models).
- **Deep space:** a starfield, a sun, a planet far below. The station is separate decks with glowing edges.
- **What's fixed:** the freighter's berth at the north, the docking spine along it and the loading deck under the spine.
  Everything else is built where you put it (see Building), storage a unit at a time.
- **Bought things fly in (owner, 2026-11-05):** a new storage unit, loader arm, dock station or pad group flies up into place from
  below on its thrusters; a new hauler rides up on its dock station if that's new too.
- **Freighter fire (owner, 2026-11-05):** blue fire out of its engines while it docks and leaves; orange hover thrusters
  firing under its hull the whole time, so it reads as floating.
- **Nothing is saved yet:** a reload starts a fresh station.
- **Always the live build (2026-11-01):** a game page the browser kept from an older build loads the live one.

## Containers (owner)

- **Three shapes (owner, 2026-11-05):** circle, square or hexagon, 0.8 m tall (a hexagon is 2.4 m corner to corner),
  each a random shape and color. Up to 3 high.
- **Nine colors:** red, orange, yellow, green, blue, purple, white, gray, black, equally likely (owner, 2026-11-05: no
  more "everyday" grey cargo).
- **The freighter (owner, 2026-11-05):** its deck is a honeycomb (every other row shifted half a container); **each of
  its stacks is one shape (owner, 2026-11-06)**, but stacks side by side can be any. Its arms only stack a container on
  one of its own shape (exports, setting aside, sorting, evening out). A storage slot only takes the shape set on it.
- **Every container is its own (owner):** a customer comes for one particular container.
- **Where a claimed container is (owner):** a selected customer's container flashes green on top of its stack, yellow
  in the middle, red at the bottom; so do freighter containers customers are waiting for, while they can still be
  claimed.

## Ships fly (owner, 2026-11-05: free-flying, no roads)

- **Haulers** (yellow manual, teal auto; numbered), **customer ships** (their container's color) and **export ships**
  (grey-blue) fly freely. A ship heads for a hover point (an arm's loading spot, a hauler or truck spot, a pad, a dock
  station). Further than 5 m off it climbs to its cruising height first (above the arms; haulers lower than customers,
  each a little different), flies level and comes down near the spot, slowing as it arrives. It turns to face where
  it's going, and north once settled.
- **Keeping clear:** a ship steers away from any ship within 3 m (not while settling into its own spot).
- **A container rides on top of its ship (owner, 2026-11-05: so it shows),** on a flat cargo bed between two rails, the
  cabin ahead of it.
- **Customers and export ships** come in from deep space to the south and leave the same way.

## The freighter and the loader arms (owner)

- **One freighter at a time:** small (6 × 3 stacks), medium (10 × 4) or large (14 × 5), on the part of the deck nearest
  the station, arriving from the west and leaving east. Each has 90 s plus 8 s per container (from docking) to be
  unloaded. Up to 3 containers per stack, imports or exports, never both.
- **Time's up (owner):** no new pickups; each hauler finishes only its next arm trip; then it leaves, and customers
  waiting for a container still aboard leave without it (a sad face).
- **Loader arms (owner, 2026-11-05: placed),** anywhere along the docking spine, at least 6 m apart. Each deck column
  belongs to the nearest arm.
- **One loading spot per arm (owner, 2026-11-05):** on the loading deck under the arm. Haulers line up for it: the front
  one hovers at the spot, the rest wait at a free dock station (with none free, they stack up in the air behind the
  spot) and come in turn.
- **Line spots (owner, 2026-11-06):** a hauler spot blueprint dragged onto a loader arm's line (south of its loading
  spot) snaps into it, up to 4, one behind another 3.3 m apart. Haulers waiting for that arm wait on them in order (the
  next one on the nearest), and only past them at dock stations. Tapping one with a hauler selected sends it to that
  arm. They move with their loader arm, and can be moved to another place in a line or removed.
- **An arm serves the hauler at its spot.** A pickup sent for a claimed container gets that one: whatever unclaimed was
  left on top of it is set aside first (to low import stacks nearby, avoiding ones a customer wants); else the nearest
  unclaimed top container in its columns, preferring one with room for its shape at a hauler spot.
- **Which container (owner):** tapping a freighter stack claims its top unclaimed container for the trip (the claim
  follows the container if an arm moves it). Tap the arm's spot instead to take whatever the arm hands over.
- **Exports onto the freighter (owner):** an arm puts an export on the nearest stack with no imports and room (it pays
  $60 then) and, with an import left, hands one back to the same hauler.
- **Idle (owner):** a container the next hauler is coming for, if buried, is dug out first; with nobody coming, the arm
  digs out containers customers want, then evens its columns out into stacks of two. It never buries or moves a claimed
  or wanted container.
- **No waiting on nothing (owner, 2026-11-05):** when an arm has more pickups promised than imports left in its columns
  (the freighter's emptied, or an arm built since took some columns), the trips furthest back are called off (queued
  ones first, then the back of its line); one bringing an export still delivers it. Auto haulers then go to an arm
  with containers left; manual ones carry on with their queue or park.
- **Leaving:** with its imports all off and nothing more promised it leaves after a moment; the next arrives 5–10 s later.

## Storage, a unit at a time (owner, 2026-11-06)

> Platform upgrades are buildings now. And each building is 1 unit. When built, any shape can be selected on that unit.
> Cranes are also 1 unit and can be placed anywhere. If a container is on an opposite side of the platform but another
> crane can reach it and bring it closer. Make it do that.

Asked (owner): a hauler spot and a truck spot, each both a pickup and a drop-off for its kind of ship; auto haulers
assigned to a hauler spot.

- **Units:** storage is built one 2.7 m unit at a time, snapped to a grid, anywhere clear (not over the freighter's
  berth or the loading deck, pad groups or dock stations). Units side by side join into one deck (a glowing edge where
  nothing's built next to it). Four kinds:
  - **Storage slot:** holds a stack of up to 3 containers of its one shape (circle, square or hexagon, marked on it).
    The shape is chosen on the blueprint (tap the blueprint to turn it); after one is bought the next blueprint is
    ready beside it (east, south, west, north, whichever's clear; ✗ stops). An empty slot's shape can be changed later
    for a small fee ($50): tap it with nothing selected.
  - **Crane:** a robot arm on its own unit, reaching 10.5 m (a dashed circle while placing any unit). It works every
    slot and spot in its reach. **Upright (owner, 2026-11-06):** a turret that turns to face the work, with a shoulder
    and an elbow bending in the vertical plane (the elbow up), the wrist held above the gripper; with nothing to do it
    folds up small beside the turret, and opens out again when it starts a job.
  - **Hauler spot:** haulers drop imports there and take exports from there.
  - **Truck spot:** customers pick up there; export ships drop exports there.
- **Cranes work together (owner, 2026-11-06):** a container can go from crane to crane through slots of its shape that
  two cranes both reach. A customer's container (or an export a hauler is coming for) that's out of reach of its spot's
  crane is brought one move closer at a time, by the shortest chain of moves, through slots with room no other crane is
  working; the last crane hands it over. While a customer waits on a pad, its container is already brought toward the
  nearest truck spot.
- **What a crane does,** each time it's free (a few times a second), in order:
  1. Serves a ship at a spot in its reach (the longer waiting first when close): a hauler's import or an export ship's
     export goes onto the lowest stack of its shape in reach (one where it can be handed out, near the ship); the ship
     leaves once its container is lifted. A customer gets its container and a hauler its export, whatever's on top set
     aside first, each into a slot of its own shape in reach.
  2. Brings a wanted container one move closer (as above).
  3. **Flattens (owner, 2026-11-06):** takes the top off a tall stack (one burying a wanted container first) and sets it
     on a slot of the same shape at least two lower. It never moves a wanted container or puts anything on one, and
     never moves one out of where it can be handed out.
  Each crane keeps off the units the others are working.
- **Room:** a ship is only given a spot where a crane can serve it: room for its container's shape in reach (the last
  two spaces of each shape a spot's cranes reach are kept free, so a container can always be dug out), a customer's
  container that can be brought there, or an export to take. Customers only come for stored containers that can be
  brought to a truck spot.
- **Lines:** a ship sent to a spot that's taken waits its turn, first come first served (a hauler at a free dock
  station). A customer is only sent once a truck spot is free (it waits on its pad).
- **Moving and removing (owner, 2026-11-06):** with nothing selected, tap something built to pick it (again, or
  elsewhere, to let go). It's outlined (a unit's whole platform dotted, a crane's reach dashed), with buttons below it:
  **move** (cranes, hauler spots, truck spots, a loader arm's line spots, dock stations, pad groups, loader arms),
  **move the whole platform** (any unit: every unit joined to it edge to edge, cranes and containers included),
  **remove** (an empty storage slot, a line spot) and **turn its shape** (an empty storage slot, $50). Storage slots
  are removed, never moved on their own. A move is a blueprint like building (drag, ✓ / ✗, free); while it's out, the
  cranes being moved start nothing new, and it can't be placed until they've finished what they're doing. **A platform
  (units joined edge to edge) always keeps at least one crane, one hauler spot and one truck spot:** nothing is moved
  or removed that would leave a platform without one (or split one into a part without).
- **Exports (owner):** export ships bring a container to a free truck spot with room for its shape, while there's a
  hauler spot to take exports out from and exports fill under an eighth of storage. Haulers take them from hauler
  spots to the freighter.

## Haulers: you send them (owner)

- **Start:** one manual hauler on its dock station. **+ Manual** and **+ Auto** buy more ($400 + $50 per hauler owned;
  auto ones 4×), **only with a dock station of their own (owner, 2026-11-06):** the button puts out a dock station
  blueprint priced with the hauler, and buying it brings the hauler up on it.
- **Manual:** tap freighter stacks (or an arm's spot) for pickups, any number in a row; a loaded hauler with nothing
  queued takes its container where it goes by itself: an import to the nearest hauler spot with room for its shape (a
  shorter line counts), an export to an arm with room for it on the freighter. Tap a hauler spot to drop an import there,
  or (empty) to fetch an export from there. Sent to a spot without room for its container's shape, it goes elsewhere.
- **Auto (owner, 2026-11-06: assigned a platform):** tap a hauler spot to assign it that spot's platform; it uses any
  hauler spot on that platform (the nearest, a shorter line and a free spot counting; all are outlined while it's
  selected). It shuttles by itself: loaded, to one of them with room for that shape (or, with none, the nearest hauler
  spot that has); empty, it takes an export from one of them if one's there and the freighter has room, else to an arm with containers left (the one with the shorter line), going
  for a container a customer is waiting for if one is in reach. Tapping a freighter stack with an auto hauler on its way
  to an arm makes that trip the stack's.
- **Idle haulers** fly to the nearest free dock station.
- **Only where it can be served (owner):** an empty hauler to an arm with a freighter to unload (or a stack with a
  container not yet claimed), a loaded one to a hauler spot with room for its shape, an empty one to a hauler spot with
  exports to take, a customer to a free truck spot its container can be brought to, or (customers only) a free pad.
  Queued trips count first: with an import aboard, a pickup gets a drop-off put in first.

## Customers (owner)

- **One arrives** every 8–14 s, faster the more pads there are and the fuller storage is with unclaimed containers.
- **For one particular container (owner, 2026-11-05: by its color, no grey customers):** each comes for a container
  nobody else wants, on the docked freighter or in storage, and is that container's color.
- **To a truck spot by itself (owner):** one whose container is stored flies to a free truck spot it can be brought to
  (straight in, else from its pad once one is free).
- **Paid:** loaded with its container, it pays **$60** (a green "+$60" rises), smiles and leaves.

## Selecting and sending (owner)

- **One tap for everything (owner, 2026-11-01):** tap a ship to select it (again to let go), tap where it goes to queue
  it, tap a numbered badge of its queue to take that trip back, tap empty space to let go. Press and hold a freighter
  container the selected hauler has claimed to call it off (the top one first). Right click takes back the last queued
  trip (or lets go). Escape lets go; 1–9 select hauler 1–9. With nothing selected, tapping an empty storage slot
  changes its shape (a fee).
- **3D colliders (owner, 2026-11-04):** taps hit the first collider along the pointer's ray: a box around each ship and
  what it carries, every container's own shape (on a ship it selects the ship; stored, it means its slot), a flat hex
  over each freighter stack (so empty ones can be tapped), each arm's spot, each storage unit, each customer pad.
  Containers hanging from an arm don't block taps. On a touch screen, with nothing right under the finger, rays a
  little around it are tried, nearest first.
- **Showing it:** the selected ship has a pulsing white ring under it (a fainter one on hover); its queue is numbered
  dashed rings joined by a dashed line; under the pointer, green where a tap would send it, red where it can't go; a
  selected customer has a dotted line to its container; a selected auto hauler's spot is outlined.

## Progress: income and building (owner, 2026-11-01 / 2026-11-06)

- **Start (owner, 2026-11-06):** 1 manual hauler on its dock station, 1 loader arm, 9 storage slots (rows of circles,
  squares, hexagons; part full), a crane east of them, a hauler spot north of them and a truck spot south, 4 customer
  pads, $500.
- **Income:** $60 per customer served and per export loaded onto the freighter.
- **Building (owner, 2026-11-05):** the menu's Storage, Crane, Hauler spot, Truck spot, Pads, Dock station and Loader arm
  buttons (and + Manual / + Auto, as a dock station with its hauler) put a blueprint on the map (in the middle of the
  view, or the nearest clear place to it; the view glides to it). Drag it (or tap where it should go); it's green where
  it can go and red where it can't; ✓ buys it there, ✗ drops it. Units snap to the grid; pad groups (4 pads) and dock
  stations go anywhere clear; a loader arm slides along the spine (6 m from the others).
- **Prices (each a little dearer than the last of its kind):** storage slot $80 × 1.02 per slot past the first 9, crane
  $1,200 × 1.6, hauler spot and truck spot $200 × 1.5 each, pad group $200 × 1.4, dock station $250 × 1.15, loader arm
  $2,000 × 1.75; a slot shape change $50.
- **Prices at 10% for testing (owner, 2026-11-05):** every price here (and haulers) is a tenth of what's listed
  (PRICE_SCALE in game.js); income stays $60.

## Camera (owner, 2026-11-03 / 04)

- **A perspective camera (40° field of view)** looking down at 45° to 90° (straight down), turned any way, zoomed.
- **Touch:** one finger pans (or drags a blueprint, pressed on it); two fingers pinch to zoom, twist to turn, or slide up
  or down together to tilt. **Mouse:** left drag pans (or drags a blueprint), right (or middle) drag turns and tilts,
  the wheel zooms at the pointer. **Keys:** WASD / arrows pan, Q / E turn, R / F tilt, + / − zoom. Escape (or a right
  click) drops a blueprint.
- **Smooth (owner, 2026-11-04):** zoom, turn and tilt ease in; a drag moves the map with the finger and a flick glides
  on; keys speed up and slow down; a touch stops any glide.
- It starts over the loader arm, the storage and the pads.
- **Overlay:** hauler numbers, faces, "+$60", prices, offers, blueprints, the freighter's time left off its bow, the
  queue and outlines are drawn flat over the 3D view (cut where they pass behind the camera).

## Rejected / removed

- **Cranes with level arms (2026-11-05 to 2026-11-06; owner: vertical, folding when idle):** two links swinging
  level above the stacks, always stretched out to the gripper.

- **Storage platforms (2026-11-05 to 2026-11-06; owner: "platform upgrades are buildings now. And each building is 1
  unit"):** platforms as one building (3 × 3 to start, grown a row or column at a time up to 8 × 8, with drop-off and
  pickup aprons along their north and south edges and spots bought on them), managing a platform (tap it for its
  offers), robot arms joining the nearest platform, slots with no shape yet, the export platform, and auto haulers
  assigned a platform. Replaced by units built one at a time (slots, cranes, hauler spots, truck spots) and cranes that
  hand containers on to each other. The freighter taking any shape in a stack is gone too (one shape per stack).

- **Platform arms as upgrades (2026-11-05; owner: buildings, 2026-11-06):** a "+" offer on a managed platform put the next
  arm on an automatic mount (alternating east and west edges, spread along them), with links long enough to reach the
  whole deck however big it grew. Replaced by arms built where you put them, with a fixed reach. Buying a hauler onto a
  spare dock station (without building one with it) is gone too.

- **The fixed station with locked things to buy (2026-11-05, owner: build it yourself, same day):** arms A–D in fixed
  places with two hover lines each (auto and manual) three places deep; seven fixed honeycomb platforms of 5 × 4 stacks,
  each with 3 drop-off spots and one pickup dock; 48 fixed customer pads; 22 dock stations, one coming with each hauler;
  the trusses joining the decks; tapping a dimmed thing (or an arrow) to buy it. Replaced by building with blueprints.
- **Platform upgrades: a second arm and a parking lot (2026-11-05, same day):** the second arm (east one only taking
  deliveries in, west one only handing pickups out) became up to 8 arms that each do both; the parking lot (4 pads
  where ships waited for the platform) is gone: haulers wait at dock stations and customers on their pads.
- **Grey customers for everyday cargo (2026-11-01 to 2026-11-05; owner: "get rid of grey containers for certain trucks,
  make them picked up by their respective colors as well"):** grey customers who waited on a pad and took any white,
  gray or black container from storage, and white, gray and black making up most of the cargo.
- **The container terminal on a seaport (2026-10-31 to 2026-11-04; owner: pivot to space, 2026-11-05):** trucks on
  one-way two-lane roads holding grid tiles, STS cranes with lanes and a shared waiting line, vertical 5 × 12 storage
  areas of 3-tile containers with RTG cranes and bays, tractor parking, parking stalls, gates, the 2D page (game2d.html)
  and the quay. Replaced by the space station: free-flying ships, hex containers in honeycomb storage, loader arms and
  gantries. Its full spec is docs/FEATURES.md at commit 343a3d7. Dropped with it: an STS crane holding a second
  container (spare / twin lifts).
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
