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

## The station

- **Meters, 3D (owner):** 1 unit = 1 m, x east, z south, y up. `game.js` has the rules, `game3d.js` draws it
  (Three.js, self-hosted in website/vendor/). Basic shapes for now (owner: the owner will make the models).
- **Deep space:** a starfield, a sun, a planet far below. The station is decks joined by trusses, with glowing edges.
- **What's where, north to south:** the freighter's berth; the docking spine with the loader arms (A–D) and, below it, the
  loading deck where haulers hover in the arms' lines; the main truss; seven storage platforms in a row (the seventh,
  east, is the export platform), each with its 5 bays on its south side and a waiting line south of them; the 48
  customer pads in 12 groups of 4. Haulers' dock stations are west.
- **Bought things fly in (owner, 2026-11-05):** a platform not bought yet is empty space with an orange arrow pointing
  down at it (grey while you can't afford it; tap it to buy). Bought, the platform (with its gantry) flies up into place
  from below on four thrusters. Every hauler bought comes with its own dock station (a pad with a back wall and red
  and blue lights, up to 22), which flies up the same way with the new hauler on it.
- **Freighter fire (owner, 2026-11-05):** blue fire out of its engines while it docks and leaves; orange hover thrusters
  firing under its hull the whole time, so it reads as floating.
- **Nothing is saved yet:** a reload starts a fresh station.
- **Always the live build (2026-11-01):** a game page the browser kept from an older build loads the live one.

## Containers (owner)

- **Hexagonal (owner, 2026-11-05):** pucks 2.4 m corner to corner, 0.8 m tall, pointy ends north and south.
- **Honeycomb storage (owner, 2026-11-05):** on the freighter's deck and on the platforms, stacks stand in a honeycomb
  (every other row shifted half a container), so neighbors nest flat side to flat side. Up to 3 high.
- **Nine colors:** red, orange, yellow, green, blue, purple, and the everyday white, gray and black (owner, 2026-11-01).
- **Every container is its own (owner):** a customer comes for one particular container.
- **Where a claimed container is (owner):** a selected customer's container flashes green on top of its stack, yellow
  in the middle, red at the bottom; so do freighter containers customers are waiting for, while they can still be
  claimed.

## Ships fly (owner, 2026-11-05: free-flying, no roads)

- **Haulers** (yellow manual, teal auto; numbered), **customer ships** (grey for everyday cargo, else their container's
  color) and **export ships** (grey-blue) fly freely. A ship heads for a hover point (a spot in a line, a bay, a pad).
  Further than 5 m off it climbs to its cruising height first (above the arms and gantries; haulers lower than
  customers, each a little different), flies level and comes down near the spot, slowing as it arrives. It turns to
  face where it's going, and north once settled.
- **Keeping clear:** a ship steers away from any ship within 3 m (not while settling into its own spot). Nothing holds
  tiles or waits for a road: lines stack up into the air instead.
- **A container rides under its ship** in the clamp.
- **Customers and export ships** come in from deep space to the south and leave the same way.

## The freighter and the loader arms (owner)

- **One freighter at a time:** small (6 × 3 stacks), medium (10 × 4) or large (14 × 5), on the part of the deck nearest
  the station, arriving from the west and leaving east. Each has 90 s plus 8 s per container (from docking) to be
  unloaded. Up to 3 containers per stack, imports or exports, never both.
- **Time's up (owner):** no new pickups; each hauler finishes only its next arm trip; then it leaves, and customers
  waiting for a container still aboard leave without it (a sad face).
- **Up to 4 loader arms, A–D (owner),** along the docking spine; the open ones split the deck's columns evenly, west to
  east. Each arm has two hover lines running south under its boom: auto haulers on the west one, manual on the east.
  The front of a line is where the arm loads; the 2nd and 3rd places are behind it, and past that a line stacks up
  into the air above the third place.
- **An arm serves the front of either line (owner),** one bringing an export first, else the nearest. A pickup sent for
  a claimed container gets that one: whatever unclaimed was left on top of it is set aside first (to low import stacks
  nearby, avoiding ones a customer wants); else the nearest unclaimed top container in its columns.
- **Which container (owner):** tapping a freighter stack claims its top unclaimed container for the trip (the claim
  follows the container if an arm moves it). Tap the arm's lines instead to take whatever the arm hands over.
- **Exports onto the freighter (owner):** an arm puts an export on the nearest stack with no imports and room (it pays
  $60 then) and, with an import left, hands one back to the same hauler.
- **Idle (owner):** a container the next hauler is coming for, if buried, is dug out first; with nobody coming, the arm
  digs out containers customers want, then evens its columns out into stacks of two. It never buries or moves a claimed
  or wanted container.
- **Leaving:** with its imports all off and nothing more promised it leaves after a moment; the next arrives 5–10 s later.

## Storage platforms and gantries (owner)

- **Seven platforms:** a honeycomb of 5 × 4 stacks, 3 high (60 containers), each with a gantry. The seventh, east, is the
  export platform (blue rings): export ships drop containers there and haulers take them to the freighter.
- **5 bays along the south edge are one line (owner):** a ship sent to a platform waits in the line south of the bays
  (stacking up into the air past the third place) until a bay is free, first come first served. Customers waiting on
  a pad take a bay once one is free.
- **The gantry** (a bridge on two rails, moving north–south; its trolley east–west) serves the ships hovering in its
  bays one at a time, the longer waiting first when close. It stays where it finished: at the bays it unloads a hauler
  next, out over the stacks it digs for a customer next. A hauler's container goes on a low stack near the container
  the next customer wants (never on it); the hauler leaves once its container is lifted. For a customer it moves what's
  on top of its container aside, one at a time, then loads it.
- **The export gantry** takes containers off export ships onto low stacks near the bays and puts one onto each empty
  hauler that comes for one (off a tall stack nearby; exports are all alike).

## Haulers: you send them (owner)

- **Start:** one manual hauler on its dock station. **+ Manual** and **+ Auto** buy more ($400 + $50 per hauler owned;
  auto ones 4×), each with a new dock station, up to 22.
- **Manual:** tap freighter stacks (or an arm's lines) for pickups, any number in a row; a loaded hauler with nothing
  queued takes its container where it goes by itself: an import to the nearest platform with room (a shorter line
  counts), an export to an arm with room for it on the freighter. Tap the export platform to fetch an export.
- **Auto (owner):** tap a platform to assign it. It shuttles by itself: empty, to an arm with containers left (the one
  with the shorter line), going for a container a customer is waiting for if one is in reach; loaded, to its platform.
  Assigned the export platform, it fetches exports for the freighter. Tapping a freighter stack with an auto hauler on
  its way to an arm makes that trip the stack's.
- **Idle haulers** fly to the nearest free dock station.
- **Only where it can be served (owner):** an empty hauler to an arm with a freighter to unload (or a stack with a
  container not yet claimed), a loaded one to a platform with room, a customer to the platform holding its container, or
  (customers only) a free pad. Queued trips count first: with an import aboard, a pickup gets a drop-off put in first.

## Customers (owner)

- **One arrives** every 8–14 s, faster the more pads are open and the fuller storage is with unclaimed containers.
- **Grey ones (most)** come for everyday cargo: they wait on a pad, and now and then the longest waiting takes the easiest
  to reach unclaimed white, gray or black container in storage. **Only while there's one for them (owner, 2026-11-05):** a grey one comes
  only while unclaimed everyday containers in storage outnumber the grey ones already waiting; otherwise a colored one
  comes instead (if a colored container is free), or nobody that time, so grey ones don't fill up the pads. **Colored ones** come for a particular container of
  their color, on the docked freighter or in storage (more of them the more unclaimed stored containers are colored).
- **To its platform by itself (owner):** one whose container is stored flies there (straight in if a bay is free, else
  from its pad once one is).
- **Paid:** loaded with its container, it pays **$60** (a green "+$60" rises), smiles and leaves.

## Selecting and sending (owner)

- **One tap for everything (owner, 2026-11-01):** tap a ship to select it (again to let go), tap where it goes to queue
  it, tap a numbered badge of its queue to take that trip back, tap empty space to let go. Press and hold a freighter
  container the selected hauler has claimed to call it off (the top one first). Right click takes back the last queued
  trip (or lets go). Escape lets go; 1–9 select hauler 1–9.
- **3D colliders (owner, 2026-11-04):** taps hit the first collider along the pointer's ray: a box around each ship and
  what it carries, every container's own hex shape (on a ship it selects the ship; stored, it means its platform), a
  flat hex over each freighter stack (so empty ones can be tapped), each arm's lines, each platform, each customer pad.
  Containers hanging from a crane don't block taps. On a touch screen, with nothing right under the finger, rays a
  little around it are tried, nearest first.
- **Showing it:** the selected ship has a pulsing white ring under it (a fainter one on hover); its queue is numbered
  dashed rings joined by a dashed line; under the pointer, green where a tap would send it, red where it can't go; a
  selected customer has a dotted line to its container (a grey one only once it has picked one); a selected auto hauler's platform is outlined.

## Progress: income and buying (owner, 2026-11-01)

- **Start:** 1 manual hauler, arm A, platform 1 (part full), 4 customer pads, $500.
- **Income:** $60 per customer served and per export loaded onto the freighter.
- **Prices at 10% for testing (owner, 2026-11-05):** every price below (haulers, arms, platforms, pads) is a tenth of
  what's listed (PRICE_SCALE in game.js); income stays $60.
- **Buying:** locked arms and pad groups show dimmed with their price (green when you can afford it), locked platforms as
  an arrow (orange when you can afford it); tap one to buy it. Arms B–D
  $2,000 / $3,500 / $5,000; platforms 2–6 $600 / $900 / $1,300 / $1,800 / $2,400, the export platform $1,000; pad groups
  $200 up to $1,400.

## Camera (owner, 2026-11-03 / 04)

- **A perspective camera (40° field of view)** looking down at 45° to 90° (straight down), turned any way, zoomed.
- **Touch:** one finger pans; two fingers pinch to zoom, twist to turn, or slide up or down together to tilt. **Mouse:**
  left drag pans, right (or middle) drag turns and tilts, the wheel zooms at the pointer. **Keys:** WASD / arrows pan,
  Q / E turn, R / F tilt, + / − zoom.
- **Smooth (owner, 2026-11-04):** zoom, turn and tilt ease in; a drag moves the map with the finger and a flick glides
  on; keys speed up and slow down; a touch stops any glide.
- It starts over the whole station; on a touch screen close up over arm A and platform 1.
- **Overlay:** hauler numbers, faces, "+$60", prices, the freighter's time left off its bow, the queue and outlines are
  drawn flat over the 3D view (cut where they pass behind the camera).

## Rejected / removed

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
