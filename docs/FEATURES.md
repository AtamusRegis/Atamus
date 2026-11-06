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
  Everything else is built where you put it (see Building).
- **Bought things fly in (owner, 2026-11-05):** a new platform, arm, dock station or pad group flies up into place from
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
- **The freighter takes any shape (owner, 2026-11-05);** its deck is a honeycomb (every other row shifted half a
  container). A storage slot only takes the shape set on it.
- **Every container is its own (owner):** a customer comes for one particular container.
- **Where a claimed container is (owner):** a selected customer's container flashes green on top of its stack, yellow
  in the middle, red at the bottom; so do freighter containers customers are waiting for, while they can still be
  claimed.

## Ships fly (owner, 2026-11-05: free-flying, no roads)

- **Haulers** (yellow manual, teal auto; numbered), **customer ships** (their container's color) and **export ships**
  (grey-blue) fly freely. A ship heads for a hover point (an arm's loading spot, a platform's spot, a pad, a dock
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
- **An arm serves the hauler at its spot.** A pickup sent for a claimed container gets that one: whatever unclaimed was
  left on top of it is set aside first (to low import stacks nearby, avoiding ones a customer wants); else the nearest
  unclaimed top container in its columns, preferring one with a free slot of its shape in storage (in an auto hauler's
  platform, or any).
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

## Storage platforms and their arms (owner)

- **A platform (owner, 2026-11-05):** a grid of square slots 2.7 m apart, 3 high, built 3 × 3 and grown a whole row or
  column at a time on any side, up to 8 × 8. Containers come in at the drop-off spots on an apron along the north edge
  and go out at the pickup spots on an apron along the south edge. It starts with one of each.
- **Slot shapes (owner, 2026-11-05):** each slot takes one shape (circle, square or hexagon), marked on the deck. New
  slots (from growing) have none yet (a faint square) and take nothing until set. Setting one is free; changing a set
  one costs a small fee ($50) and only while it's empty. The starting platform's rows are circles, squares, hexagons.
- **Arms (owner, 2026-11-05):** up to 8 per platform, on mounts off its east and west edges (the first east, the next
  west, and so on, spread along each edge); each one dearer than the last. Each arm's links are long enough to reach
  the far corner of the deck; arms side by side swing at different heights. Every arm serves the ships at the spots one
  at a time, each keeping off the stacks the others are working (from, to and set aside).
- **What an arm does (owner):** the longer waiting first when close. It stays where it finished: at the drop-off spots it
  unloads a hauler next, out over the stacks it digs for a customer next. A hauler's container goes on a low stack of
  its shape near the container the next customer wants (never on it), preferring the north rows; the hauler leaves once
  its container is lifted. For a customer it moves what's on top of its container aside, one at a time, each to a slot
  of its own shape, then loads it at a pickup spot.
- **Lines:** a ship sent to a platform takes a free spot of its kind, first come first served; a waiting hauler parks at a
  free dock station until one is free. A customer is only sent once a pickup spot is free (it waits on its pad).
- **The export platform (owner),** one, built from the menu (blue deck): its slots take any shape. Export ships drop
  containers there and haulers take them to the freighter; its arms take containers off export ships onto low stacks
  near the drop-off spots and put one onto each empty hauler at a pickup spot (off a tall stack; exports are all alike).

## Haulers: you send them (owner)

- **Start:** one manual hauler on its dock station. **+ Manual** and **+ Auto** buy more ($400 + $50 per hauler owned;
  auto ones 4×); each needs a dock station of its own (build more), and appears on it.
- **Manual:** tap freighter stacks (or an arm's spot) for pickups, any number in a row; a loaded hauler with nothing
  queued takes its container where it goes by itself: an import to the nearest platform with a free slot of its shape
  (a shorter line counts), an export to an arm with room for it on the freighter. Tap the export platform to fetch an
  export. Sent to a platform with no free slot of its container's shape, it goes elsewhere.
- **Auto (owner):** tap a platform to assign it. It shuttles by itself: empty, to an arm with containers left (the one
  with the shorter line), going for a container a customer is waiting for if one is in reach; loaded, to its platform
  (if it has a free slot of that shape). Assigned the export platform, it fetches exports for the freighter. Tapping a
  freighter stack with an auto hauler on its way to an arm makes that trip the stack's.
- **Idle haulers** fly to the nearest free dock station.
- **Only where it can be served (owner):** an empty hauler to an arm with a freighter to unload (or a stack with a
  container not yet claimed), a loaded one to a platform with a free slot of its shape, a customer to the platform
  holding its container (with a pickup spot free), or (customers only) a free pad. Queued trips count first: with an
  import aboard, a pickup gets a drop-off put in first.

## Customers (owner)

- **One arrives** every 8–14 s, faster the more pads there are and the fuller storage is with unclaimed containers.
- **For one particular container (owner, 2026-11-05: by its color, no grey customers):** each comes for a container
  nobody else wants, on the docked freighter or in storage, and is that container's color.
- **To its platform by itself (owner):** one whose container is stored flies there (straight in if a pickup spot is
  free, else from its pad once one is).
- **Paid:** loaded with its container, it pays **$60** (a green "+$60" rises), smiles and leaves.

## Selecting and sending (owner)

- **One tap for everything (owner, 2026-11-01):** tap a ship to select it (again to let go), tap where it goes to queue
  it, tap a numbered badge of its queue to take that trip back, tap empty space to let go. Press and hold a freighter
  container the selected hauler has claimed to call it off (the top one first). Right click takes back the last queued
  trip (or lets go). Escape lets go; 1–9 select hauler 1–9.
- **Managing a platform (owner, 2026-11-05):** with nothing selected, tap a platform. It's outlined, and shows what it
  offers, each with its price (tap to buy): a row or column on each side (outlined where it would go; grey where it
  doesn't fit or you can't afford it), another arm (on its mount), another drop-off and pickup spot (these start a
  blueprint on their apron). Tapping one of its slots turns its shape. Tap elsewhere to stop.
- **3D colliders (owner, 2026-11-04):** taps hit the first collider along the pointer's ray: a box around each ship and
  what it carries, every container's own shape (on a ship it selects the ship; stored, it means its platform and slot),
  a flat hex over each freighter stack (so empty ones can be tapped), each arm's spot, each platform, each customer pad.
  Containers hanging from an arm don't block taps. On a touch screen, with nothing right under the finger, rays a
  little around it are tried, nearest first.
- **Showing it:** the selected ship has a pulsing white ring under it (a fainter one on hover); its queue is numbered
  dashed rings joined by a dashed line; under the pointer, green where a tap would send it, red where it can't go; a
  selected customer has a dotted line to its container; a selected auto hauler's platform is outlined.

## Progress: income and building (owner, 2026-11-01 / 2026-11-05)

- **Start (owner, 2026-11-05):** 1 manual hauler on its dock station, 1 loader arm, a 3 × 3 platform (part full) with 1
  arm, 1 drop-off and 1 pickup spot, 4 customer pads, $500.
- **Income:** $60 per customer served and per export loaded onto the freighter.
- **Building (owner, 2026-11-05):** the menu's Platform, Export platform, Pads, Dock station and Loader arm buttons put
  a blueprint on the map (in the middle of the view, or the nearest clear place to it; the view glides to it). Drag it
  (or tap where it should go); it's green where it can go and red where it can't; ✓ buys it there, ✗ drops it. Platforms,
  pad groups (4 pads) and dock stations go anywhere clear of each other and of the freighter's berth and loading deck;
  a loader arm slides along the spine (6 m from the others); a drop-off or pickup spot slides along its apron (3 m from
  the others of its kind).
- **Prices (each a little dearer than the last of its kind):** platform $600 × 1.5 per platform built, export platform
  $1,000, pad group $200 × 1.4, dock station $250 × 1.15, loader arm $2,000 × 1.75; a platform's row or column $300 ×
  1.6 per growth, arm $1,200 × 2.5 per arm on it, drop-off or pickup spot $200 × 1.8 per spot of that kind; a slot
  shape change $50.
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
- It starts over the loader arm, the platform and the pads.
- **Overlay:** hauler numbers, faces, "+$60", prices, offers, blueprints, the freighter's time left off its bow, the
  queue and outlines are drawn flat over the 3D view (cut where they pass behind the camera).

## Rejected / removed

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
