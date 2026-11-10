# Pet Delivery Co.: how it behaves today

A second game on atamus.io (owner, 2026-11-08), separate from the cargo station game: `website/pets.html` +
`website/pets.js`, with its co-op in `packages/server/src/pets.js`. Phone first, 3D (Three.js, 1 unit = 1 m).

> own a pet, deliver mail, get money and items, buy and train new pets to do deliveries faster. 3D mobile first
> friendly. Co-op lets you take on big delivery contracts as a group.

Asked (owner): a web game on atamus.io (not Roblox), on its own page; the cargo game stays.

## The town

- **A flat, square floating island (owner, 2026-11-09: flat, symmetric and grid-based)**, 448 m across with straight
  edges and rock tapering away beneath it; clouds above and below. Built from `website/pets-world.js`, which the server
  uses too (the two copies must match; `scripts/check.sh` compares them).
- **Terrain:** flat everywhere (no hills or cliffs), lower only under the water. Ground pets can't go past the edge.
- **Water (owner, 2026-11-09):** one big, deep (8 m), square-edged lake filling the middle block of the west side, and
  a river from it running straight west off the island's edge in a waterfall. The water stops at the edge; the fall
  pours **down** from the lip, out and clear of the rock, with spray at the lip. Ripples drift slowly on the lake and
  **run downstream** on the river. Deeper water is darker; the bed is sand. Houses and trees keep clear of it.
  - (owner, 2026-11-09: water pets scrapped) nobody swims now; the lake is scenery. The swimming rules below are kept
    in the code for any future swimmer.
  - **Swimmers** walk straight in and **swim underwater** (owner, 2026-11-09): Space (or Swim ▲) rises, Shift (or Swim
    ▼) dives, down to the bottom; with neither they drift up to the surface; Space at the surface leaps out. 1.35×
    their speed in the water. Bubbles trail behind them under water; with the camera under water everything goes a
    hazy blue.
  - **Land and air pets never go in or on the water** (owner, 2026-11-09): they can't walk into it, and anyone who ends
    up on it (a jump, a glide, a teleport) is put on the nearest shore. Fliers fly over it (low over it they hover and
    don't land); nobody goes over a waterfall.
- **Speed boosts (owner, 2026-11-09):** see-through orange chevrons laid on the roads (following the road's surface;
  at the same spots along every street, not by the square) for any pet; they always point, and run, away from you along
  the road (owner, 2026-11-09); 22 cyan rings in the air over town (16 to 76 m
  up), there only for fliers. Rings fade out with distance (gone past 120 m). Going through one: 1.6× for
  5 s (on top of Speed Candy), with a trail in the boost's color; not on foot or at home.
- **Streets (owner, 2026-11-09: a grid):** straight streets edge to edge, two running north-south and two east-west on
  each side of the square (64 m and 140 m out), 8 m wide with dashed center lines, making square city blocks.
- **The town square** (owner, 2026-11-09: round, the buildings evenly round it, mirrored left and right): flat and
  paved, 60 m across the middle, with the **contract board** (red ring) at its center and the four main buildings
  evenly round it (owner, 2026-11-09: the mount shop closed), each facing the middle with its ring in front: the **post
  office** (north; blue roof, its **pickup ring**, gold, in front), the **egg shop** (east; pink, a giant egg on top,
  pink ring), the **pound** (south; animal control, striped front, a fenced yard in front) and the **training yard**
  (west; a running track with hurdles, green ring). The lift stands south of the center, under the VIP island.
- **Houses** (about 290) line every street on both sides, facing it, evenly spaced between the cross streets, each with
  a red mailbox at the roadside; trees stand on an 8 m grid on open ground, mirrored across the town.
- **Floating islands (owner, 2026-11-09: a symmetric ring):** 8 off the town's edge, one off each side (6 m up) and one
  off each corner (14 m up), low enough to glide to; 8 in a ring high above the town (90 and 106 m, alternating) and
  one over the middle (124 m) that only fliers reach; each has 3 houses and trees. Falling off into the clouds brings
  you back to the square.
- **Looks (owner, 2026-11-08):** the ground's colors blend smoothly (grass in broad patches, rock down the lake's
  sides) with a fine speckled texture.
- **Sky (owner, 2026-11-08), the same for everyone:** normally a day lasts 20 minutes (a little more day than night):
  the sun moves, and the sky and fog go through dusk to night (stars, house windows light up, lights dim). Every 4
  minutes the automatic weather decides whether it rains (streaks around you, a gray sky, shorter fog, easing in and
  out). **Admins can override it for everyone from the Admin panel (owner, 2026-11-09):** Weather is Auto, Clear,
  Rain, Snow, Storm or Fog; time is Auto, Sunrise, Day, Sunset or Night. Snow falls and covers the land; storms bring
  heavy rain, full wind and lightning; Fog shortens sight. The chosen time also controls animal-control headlights and
  searchlights. Overrides last until an admin changes them or the server restarts. Wind (below); god rays slant down
  from the sun (strongest with it low, none at night or in rain); 56 clouds
  in three layers (below the island, around it and high above).
- **Place labels (owner, 2026-11-09):** a speech bubble floats over each place saying what it is (Post Office: Pick up
  parcels here; Contract Board: Start a contract with your room; Egg Shop: Buy eggs to hatch new pets; Training Yard:
  Train the pet you ride; Animal Control: Where caught couriers end up; Sky Lift: Up to your plot / Down to the plaza;
  the Egg Shop's over its circle, Animal Control's in front of its door, owner 2026-11-09),
  clear within 10 m and fainter the further you are (owner, 2026-11-09), gone past 45 m, so you mostly see them in the
  middle of town; growing a little with distance; hidden while building.
- **Wind (owner, 2026-11-09), the same for everyone (timed off the clock):** 3 to 40 mph, easing to a new strength
  every 3 minutes (about 17 mph on average; up to 10 mph more in the rain) with gusts on top, its direction swinging
  slowly round. Streaks blow past faster and more often the windier it is (and more up high and in the rain); rain
  and clouds drift with it. **From 12 mph (most at 40), a flier or glider in the air** drifts gently downwind (up to
  1.4 m/s) and bobs a little (under a metre up and down, a little side to side; flying pets nod slightly with it);
  never on the ground, while stunned or in a home, and the wind never pushes you into a cliff, wall or house. Wind
  streaks are short, faint and few (owner, 2026-11-09: they were too long, solid and frequent). **Airborne fliers and gliders**
  gain up to 10% speed flying with the wind and lose up to 5% flying against it, tapering to no change across it.
  **On screen** (the owner asked for it): a pill under your name with an arrow the way the wind blows (turned with the
  camera), its speed in mph, and the active flight speed percentage in green or red; hidden in a home.
- **Minimap (owner, 2026-11-09):** a square map in the top right corner (the bag, wanted, players and contract pills
  sit under it), turned with the camera so up on it is always the way the camera looks; N marks north (−z) on its edge.
  **Drawn like the world (owner, 2026-11-09): white paper and black ink**, the water hatched; only the markers (you,
  others, bag houses, the guide, vans, home) keep their colors. It shows the land, the lake and river, roads, the square
  (post office, egg shop, training track, pound, board and the rings), houses (roof, door, mailbox), trees, the town plots and the islands; the islands
  above the town (and the VIP island) are faint until you climb (fully shown from about 50 m), the extra island only
  while it's in use. Live on it: everyone's built houses (each square's top piece, roofs white, floors gray; your plot outlined gold),
  the houses in your bag (gold, pink for an island) and where the guide points (a glowing dot, or a chevron on the edge
  pointing the way when it's off the map), vans (lights flashing while they chase), helicopters (rotors turning) and
  their searchlight beams and spots, the other players in your world (a dot in their shirt colour with a notch the way
  they face; party members ringed green, wanted ones ringed flashing red; a small ▲ / ▼ when more than 6 m above or
  below you; off the map they sit on its edge), a fading wedge of what the camera sees, and you in the middle as an
  arrow in your shirt colour the way your pet faces. It darkens at night and hides in a home. A tap (or click) zooms:
  40, 80, 170 or 300 m from the middle to the edge, remembered in the browser. Redrawn about 30 times a second.
- **Home marker (owner, 2026-11-09):** a compact Home pill shows the distance and compass direction to your plot (or Here
  when you are there), a gold house marker with a small Home label shows that plot on the minimap, including at its edge
  when out of view, and a world-space house sign says YOUR HOME over your plot.
- **Interaction (owner, 2026-11-09):** nearby townsfolk, players, lifts and pet pens show a circular E prompt and can
  be activated with E; F remains an alias for the same interaction. Tapping an NPC or object still activates it.
  On a computer, jumping uses Space rather than a right-side Jump button; touch controls keep the button.
- **The walk-through (owner, 2026-11-09):** once for every courier, new or not (`intro` in their data, set to 1 when
  it's done), after the What's New panel is closed: you're put by the post office and the camera moves in on **Walt**
  the mailman, who lost his helper and asks you and your pet to help deliver mail. He warns about animal control, over
  two short scenes with the camera 45° above, circling the nearest van, then a helicopter. Back with Walt, he gives you
  **two parcels** (the two houses nearest the post office; caught, they come back) and the camera moves to the first
  one's mailbox; he promises a voucher for a free egg. Delivering both sends the arrow back to Walt (owner, 2026-11-09), who congratulates you and gives
  you an **Egg Ticket**; then the arrow points to the egg shop, where the ticket's button glows. Once the egg hatches (Ride or Not now) the camera goes back to Walt, who
  tells you about contracts and wishes you luck. With no room for another pet the egg part is skipped. Walking away
  from Walt (Escape) skips the rest. Black bars and Walt's lines work as in any talk (a tap goes on).
- **Townsfolk and talking (owner, 2026-11-09):** six visibly different people live around the shops and post office,
  with their names above them, individual clothes, skin tones, idle movements and voices: Hazel keeps the Egg Shop,
  Walt the mailman (owner, 2026-11-09) stands by the pickup ring, Mabel sorts mail, Gus sweeps and wanders, Ziggy dances and Penny runs around. They wave
  when a courier approaches and pets bump against them instead of passing through them. Close by, tap the person (or press E;
  no name button, owner 2026-11-09) to talk: movement stops, black bars come in and the camera moves to a close-up of them. A line types in no
  more than 1.5 seconds and stays until you go on (owner, 2026-11-09: no timer); click, tap, Space, Enter or
  F finishes or advances it, number keys pick an answer, and Escape ends it. Hazel can open her shop;
  conversations also include tips, stories and jokes, dancing, rock-paper-scissors, high fives and hide-and-seek.
- Houses and buildings are solid (you slide along their walls). **Roofs (owner, 2026-11-09):** a pet that jumps or flies up onto a town house stands and walks on its roof (a pyramid over the walls; that house doesn't fade while you're on it). **A house between the camera and you fades (owner,
  2026-11-08):** the more of you it hides (5 points on you), the more see-through it gets (down to 18%), easing in and
  out.
- Roads are laid on the land vertex by vertex (5 across, every ~2 m) just above it, and pets stand on the road surface.
- **Gray look (owner, 2026-11-09: no outlines, no hatching):** the world is drawn in plain shades of gray: a screen pass
  turns each pixel into its brightness, keeping textures and shading; nights are brightened so it stays readable.
  Name tags, place labels and speech
  bubbles are drawn after the pass, in color, still hidden behind buildings; so are the guides and interaction circles (owner,
  2026-11-09): the guide arrow, the place rings (pickup, board, shops, training yard, lifts) and lift beams, the beams
  over parcel houses, Package Rush beams and rings, and the arena's next-obstacle beam; and **animal control is red** (vans and helicopters, red with a white stripe;
  owner, 2026-11-09). The lights reach that layer too. The HUD keeps its colors; the minimap is drawn in
  ink too (below).
- **Shadows are baked (owner, 2026-11-09):** no live shadows; the ground is darker under and a little to one side of
  every house, plaza building and tree (soft-edged, painted in once), and a soft dark spot lies on the ground under
  every pet, person, walker and van (smaller and fainter the higher they are). The vans' overlapping faces are offset
  (no flicker).
- **Bright at night (owner, 2026-11-09):** pets, riders, walkers and the townsfolk glow with their own colors as it
  gets dark (a lift to about half their color, owner 2026-11-09: light parts were blowing out to white), so they stay
  readable at night.

## The courier

- (owner, 2026-11-09) A blocky R6-style figure matched to the owner's reference picture: a 2 x 2 x 1 stud torso, 1 x 2 x
  1 arms and legs with softened edges and a rounded 1.25-stud head with two tall oval eyes and a smile (1 stud = 0.4 m,
  about 2.1 m tall). Head and arms are skin, the torso is the player's shirt color, the legs are dark. On foot its arms
  swing against its legs; riding, it sits at 0.8x size with its legs astride the pet and its arms reaching forward.

## Riding

- You ride your pet (the courier on its back). **Phone:** put a thumb down on the left half of
  the screen for a joystick there; drag elsewhere to turn the camera (up/down tilts it); two fingers pinch to zoom.
  **Computer:** WASD / arrows, drag to turn, the wheel zooms. Movement is relative to the camera.
- **How pets move (owner, 2026-11-08; pitch 2026-11-09):** a pet turns to face where it's going. Fliers and gliders in the
  air also pitch with how they're really moving: nose-up climbing (up to about 40°), nose-down diving or gliding down (1.4× steeper than
  the path, up to about 55°: owner, 2026-11-09), eased in, about the middle of pet and rider, the same for everyone's pets; level on the ground. Land pets never
  tilt. (The tilt removed on 2026-11-08 followed the camera, not the flight.)
  - **Space (or the Jump / Flap ▲ button) is pressed each time, never held (owner, 2026-11-08)**, except on a flapping
    flier, where it's held (below).
  - **Land pets** jump: straight up when not moving, far on the run (1.6× speed in the air); a jump gets them up a
    ledge.
  - **Fliers** (Parrot, Owl, Dragon; the gliders became fliers, owner 2026-11-09): **on the ground they walk** (like a
    land pet: no climbing cliffs, no jumping) **until Space (or Fly ▲) takes them up**; back down on the ground (sinking
    to it, or flying into rising ground) they walk again; off the ground (walking off a ledge too) they're flying. Fly ▼
    shows only while flying. In the air, hold Space (or Fly ▲) to rise straight up and hold Shift (or Fly ▼, shown
    only on a flier) to sink straight down. With neither held, moving forward climbs or dives where the camera looks;
    standing still holds height. Space / Shift override the camera. Up to 130 m, down to the ground.
    Vertical speed is 0.85× their flying speed. They fly at 0.75× and walk at 0.7× their speed. On a computer, a
    "Space Up · Shift Down" key strip shows at the bottom of the screen only while riding one (not while building).
- **Every kind has its own build (owner, 2026-11-08):** body shape and size (boxy, round, upright birds, two-legged
  dinosaurs), legs, neck, head and extras: floppy ears and a wagging tail (Pup), stripes, claws and a crest
  (Raptor), a huge head and tiny arms (T-Rex), a hooked beak and long tail (Parrot), big eyes and tufts (Owl), a neck,
  bat wings, back horns, spikes and a spade tail (Dragon). Upright birds waddle.
- A pet grows 1.5% bigger with each level (owner, 2026-11-08), so a level 20 pet is about 29% bigger; others see it too.

## Animal control (owner, 2026-11-08)

- **Telegraphs (owner, 2026-11-09, like an MMO's ground shapes):** animal control's reach is drawn on the ground as red
  shapes, in color: a translucent fill, lighter toward its edge, a bright rim and a ring pulsing out from the middle.
  Round each van that's looking (hidden while it chases): the shape of how far it can see you (farther ahead, less
  behind, more per wanted star of yours: `vanSight` in pets-world.js). Under each helicopter's searchlight: the circle
  it catches you in. Helicopters are red with a white stripe, and the searchlight is red. Animal control's red stays bright day and night
  (it glows a little; owner, 2026-11-09). The place rings are thin outlines (0.18 m).
- 8 animal control cars (red, owner 2026-11-09) with light bars patrol the roads (driving on the right, turning round at a road's end) and 2
  helicopters circle over town. Online the server runs them for the whole room; offline the page does.
- They only go after players carrying parcels (owner, 2026-11-08); a chase ends if the bag empties (no star).
- **Animal control cars** come in three silhouettes (compact, van and SUV) and matching speed tiers: slow, standard and
  fast (0.85× / 1× / 1.15× their patrol and chase speeds). They spot parcel carriers farther ahead (21 m) and to
  either side (18 m) than behind (14 m), plus 7 m per wanted star; only players on or near the ground. They chase
  straight for a short while (3 s, plus 0.8 s per star), lights flashing; the standard car chases at 9.5 m/s plus
  1.3 per star, so a faster pet can get away.
- **Vehicle headlights (owner, 2026-11-09):** on after daylight fades while a car is moving: lit lamps, two beams
  reaching ahead and a pool of light on the road. Headlights and the red/blue light bars do not work in daylight.
- **Helicopter searchlights (owner, 2026-11-09):** a helicopter no longer chases. It circles over town shining a
  searchlight down from under its nose: the beam turns slowly (about 15-35° a second), easing round to the other way
  every 3-8 s, while its spot drifts in and out from 6 to 24 m out from under the helicopter. It's a real light: it
  lights the ground, houses and pets where it lands, and the beam stops where it hits. **A parcel carrier inside the
  beam (anywhere along it, in the air too) for half a second is caught**; the cone is wider for anyone riding a flier
  or glider. Helicopters circle about 15% faster than before. Entering the beam flashes the helicopter's lights and
  shows "Animal control!". Helicopters keep circling in daylight, but their searchlights and red/blue lights are off
  and cannot spot or catch anyone until daylight fades. The server and the page test the same cone (pets-world.js
  `beamOf`), the server sending each helicopter's beam heading and reach.
- **Caught** (an animal control car touching you on the ground, or half a second in a searchlight): you're taken straight to the
  pound's yard (no stun, owner 2026-11-08), your parcels go back to the post office and your wanted level is cleared; 7 s before you can be
  caught again.
- **Wanted level (0–5 stars):** each car chase you get away from adds a star (at most one every 4 s); a star drops
  every 25 s nobody's chasing you (a searchlight on you counts as chasing). Shown top right, and over your name for others. Each star adds **20% to delivery pay**.

## Delivering

- **How far parcels go (owner, 2026-11-08):** by your best pet of the kind you're riding (land pets, or fliers and
  gliders): houses up to 75 m + 32 m per m/s your best land pet goes over 7 (riding a land pet), or 90 m + 40 m per m/s
  your best flier or glider goes over 9 (riding one), from the post office; a new courier's stay close (at least the
  nearest few houses always count). Riding a flier or glider, islands in that reach get parcels too.
- Riding into the pickup ring fills your bag with parcels (as many as your pet's bag holds), each for a house in reach;
  on a flapping flier about 3 in 10 are for island houses in reach (any island), on a glider the low ones only. Switching to a pet that can't fly hands island parcels back.
- **The guide (owner, 2026-11-08):** a long glowing arrow lying flat around your pet points toward the nearest house
  you have a parcel for (or the post office when the bag's empty); it tilts up only halfway toward a place above or
  below (fully when it's more than 4 m above you); a glowing marker bobs over the place when it's in view. Hidden
  within 6 m and while building.
- Each house you have a parcel for shows a gold beam (pink for an island house) with a spinning parcel over its mailbox; a gold arrow over your pet
  points to the nearest one (or back to the post office when the bag's empty).
- Riding within 3.6 m of that mailbox delivers: **8 coins + 1 per 10 m from the post office**, **double
  for an island house**, **+20% per wanted star**, and sometimes an item: Speed Candy 12%, Training Ribbon 4%, Egg Ticket 1%.
- After each delivery, a brief popup shows how many parcels remain in the bag, including zero. The Settings panel has a
  per-account option to hide the follow arrow when the bag is empty; it is on by default.

## Items

- **Speed Candy** (was Speed Snack): a button by Pets (with its count); 30 s at 1.5× speed.
- **Training Ribbon:** a free training level (a button on the training arena's gold circle).
- **Egg Ticket:** a free Basic Egg (a button in the egg shop).

## Package Rush

- **Off for now (owner, 2026-11-09):** the server starts no Package Rush (its period defaults to 0; the browser smoke
  test still runs one). As it worked:
- Every room starts a **Package Rush** every 10 minutes. It lasts a random 1–2 minutes and scatters shared prize
  packages at random town mailboxes: 8 plus 3 per player, up to 28. A purple beam and gold ring mark each one, and the
  event pill shows how many remain and the time left.
- Riding over a package claims it once for the whole room. Its server-owned random prize is **40–100 training points**
  (which can cross several levels), **1,500–6,000 coins**, **3–10** of a random item, or a **12% chance of a random
  pet** when there is room. Pet rarity is 50% Common, 46% Rare and 4% Legendary. A training-points prize for
  a level-20 pet becomes coins.
- The start and each prize use a large purple-and-gold announcement in the middle of the screen, confetti and
  fireworks. The server checks proximity, removes claimed packages and owns all rewards.

## Pets

- Start: a Pup. **Six pets (owner, 2026-11-09): a Common, a Rare and a Legendary of each type, the rarer the cooler;
  water pets scrapped** (speed m/s / bag; ✈ flies):
  - Ground: Pup 7.5/2 (Common), Raptor 12/4 (Rare), T-Rex 15.5/7 (Legendary)
  - Air: Parrot ✈ 8.5/2 (Common), Owl ✈ 12/4 (Rare), Dragon ✈ 16/5 (Legendary)
- **Water pets deleted (owner, 2026-11-09):** Duck, Sea Turtle and Sea Serpent (and the older Otter and Penguin) are
  dropped from saves and their Treats with them; a player left with no pet gets a Pup.
- **Retired pets (owner, 2026-11-09):** every other kind became the new pet of its type and rarity (Epic counted as
  Rare), keeping its level, training points and Treats (`PET_MOVED` in pets-world.js, applied whenever data is
  cleaned): Kitten, Bunny → Pup; Fox, Goat, Stegosaurus, Deer, Bear, Horse, Triceratops → Raptor; Unicorn → T-Rex;
  Butterfly → Owl; Pegasus, Phoenix, Pterodactyl, Ice Dragon → Dragon.
- **Riders stay their size (owner, 2026-11-09):** a pet grows with its level but the courier on it doesn't, so a
  big pet looks big under its rider.
- **Fliers (owner, 2026-11-08):** fly over houses and trucks and land on islands; they go up and down only as the
  player holds (see Riding). Shown with a wing by their name in the menus.
- **Two types (owner, 2026-11-09; Water scrapped):** every pet is **Ground** or **Air**, with a badge on every card (and
  when an egg hatches) and the card's frame and tint in its color: Ground brown with a peak, Air sky blue with flapping
  wings (every flying pet).
- **Pets** (button) lists yours (best first) with level, speed and bag; tap one to ride it.
- **Shops (owner, 2026-11-09):** riding into a shop's ring opens its window in the middle of the screen, with your coins
  at the top and each item's price on its buy button (grayed out when you can't afford it; Full at the pet limit).
- **Egg shop** (ride into its ring): Basic Egg $150 (Common 75%, Rare 22%, Legendary 3%), Golden Egg $1,500 (Rare 75%,
  Legendary 25%); the pet is any of that rarity. The egg shakes harder and cracks, then bursts in a flash and fireworks (more for Rare and Legendary) with rays
  in the rarity's color; Ride puts you on it (with fireworks and confetti around you), **Not now** (owner, 2026-11-09)
  keeps you on the pet you're riding and the new one waits in your Pets list (the same celebration).
- **Pet Farm and Treats (owner, 2026-11-08, like a kind's candy):** a spare pet (you have another of its kind, and
  you're not riding it) shows **Pet Farm +N** in the Pets list; tap it, then **Sure?**, and it goes to live on the farm,
  leaving **N Treats** for its kind (5 + 1 per level it had). Treats show on that kind's cards. In the training yard a
  Treats button (on the training arena's gold circle) trains the pet you ride a level for Treats: 1 per level up to level 4, 2 up to 8, 3 up
  to 12, 4 up to 16, 5 after.
- **Beds:** you can have 6 pets plus 2 for each bed in your home; eggs and mounts show Full when you're at the limit.
- **Training arena (owner, 2026-11-09):** in the training yard's ring, **E (Training Arena)** takes you to a floating arena (no longer
  riding in teleports you; owner, 2026-11-09) (80 m
  across, off the island's south edge, `AR` in pets.js) with a track and an obstacle course round it, in order: a
  hurdle, a hoop, a platform, two slalom gates (inner half, then outer half), a tunnel, a higher hurdle, a higher hoop.
  The next one glows (a gold beam and diamond, and the arrow points to it: at a gate, between its posts; owner, 2026-11-09). Clearing it, going round the track's way
  (counterclockwise from above), gives the pet you ride a **training point**: jump the hurdles (the bars are solid),
  jump through the hoops (over their low sill), land on the platform, pass between a gate's posts, ride through the
  tunnel. **20 points** for level 2, **4 more for each level after** (level 19 to 20: 92); spare points carry over. A
  star pill shows points / needed in the arena. Each pet keeps its own points (saved; a traded pet starts fresh). Up to
  level 20: each level +5% speed; every 5 levels one more parcel in the bag. The gold circle in the middle opens the
  Training Yard panel (the pet, its points, Treats and Training Ribbon buttons); the purple arch takes you back to town
  beside the yard. Land pets can't walk off the arena's edge.

## Co-op

- The game connects to the Atamus server (`wss://play.atamus.io/pets`) and puts you in a room of up to 16. Everyone in
  the room rides the same town and sees the others (their pet, shirt and name over their head), moving smoothly. Top
  right: a green dot when connected and how many are in the room. Offline, it keeps trying and you play alone.
- **Smooth movement (owner, 2026-11-08: rubber-banding):** your page sends your position 20 times a second (when it
  changes, and every second regardless) stamped with your own clock; the server passes positions on 20 times a second
  (animal control 10, stamped with its clock). Pages replay each player 170 ms in the past on that player's own clock
  (so speeds stay even), guessing ahead up to 0.2 s if an update's late (not if they'd stopped) and easing any
  correction in. Nothing is checked by the server (no anti-cheat).
- **Leaving (owner, 2026-11-08: ghosts and clones):** the server drops connections that don't answer its ping within 10 s; a page that reconnects (same tab) replaces its
  old connection (keeping its wanted level).
- **Everyone sees the pet you ride (owner, 2026-11-09: wrong pets):** whenever the pet you ride (or its level) changes,
  however it changed (riding another, training, a trade, your data coming back from the server at login or after a
  stale save), your page redraws it and tells the room; after logging in it tells the room again.
- **Staying in the game while away (owner, 2026-11-09):** a tab that's put away (minimized, behind another window, another
  tab) stays connected: you stop where you are, your keys and joystick let go, and others keep seeing you there. If the
  connection does drop (a phone suspending the page), it reconnects as soon as it can and when the tab is back.
- **What's New (owner, 2026-11-09):** after an update, a small panel in the middle of the screen shows the newest
  entry of the front page's Updates list (its date and lines) until you close it (✕); it shows again only when that
  entry changes. A browser that has never logged in doesn't get it.
- **Phones first (owner, 2026-11-09):** on touch screens the HUD, the map and the buttons are sized to the screen's short
  side; Jump (and Fly / Swim ▼) are big round buttons at the bottom right; held sideways the buttons sit in one row along
  the bottom right under the map (owner, 2026-11-09: they used to stack into the map), and panels use the screen's height.
- **Wind readout (owner, 2026-11-09):** shown only riding a flier or glider (the wind doesn't move other pets).
- **Coins (owner, 2026-11-09):** the coin pill sits at the top right (above the map), leaving the top left clear (as
  Roblox's chat would).
- **Updates (owner, 2026-11-08):** when a new build of the site goes live, the server tells every connected page and it
  reloads onto it ("Updating!"); a page that connects with an older build than the server last saw reloads too (at most
  once a minute). Progress is in the browser, so nothing's lost but the parcels in the bag. **Whose update (owner,
  2026-11-09):** under Updating! a small line says "Derek's Update" when it's Derek's (the merge commit's `Update-By`
  trailer, put in version.json by the website deploy; nothing shows without one).
- **Chat (owner, 2026-11-08; like Roblox's, 2026-11-09):** a window at the top left (where your name used to be):
  everything said since you logged in (a new login starts it fresh; names in colors), scrolling, with the line to type
  in at its foot (a tap on it, or Enter or / on a computer; up to 120 characters, one message per 1.2 s). Left alone 6 s
  its dark background and the typing line fade (the messages stay). The chat button shows or hides the window. Messages
  also show as a speech bubble over the sender for 6 s. Online only.
- **Menu (owner, 2026-11-09):** a gear left of the chat button opens a menu: **Settings**, for staff **Admin
  Panel**, and **Log Out** (owner, 2026-11-09: back to the login, to sign in to or make another account) (the side buttons Chat, Settings and Admin are gone).
- **Players online (owner, 2026-11-09):** a green dot (grey offline) and the count in white at the bottom right inside
  the map (the online pill is gone). The distance-to-home pill is gone too.
- **Candy (owner, 2026-11-09):** its button stays put (only its count changes), so it can be tapped while moving on a
  phone.
- **Contracts** (the contract board, owner 2026-11-08: shorter ones too): anyone starts one when none is running:
  - **Rush Order:** 3 + 3 per player parcels in 2:30, 22 coins per parcel of the goal.
  - **Quick Contract:** 5 + 4 per player in 4 minutes, 26 per parcel.
  - **Big Contract:** 10 + 8 per player in 7 minutes, 30 per parcel. (Times lengthened, owner 2026-11-08.) Every delivery by anyone in the room counts (the server
  takes at most one per player every 0.9 s). Met in time, each player who delivered gets a share of the reward by how
  many they delivered; out of time, nobody gets the reward, but each player who delivered gets a
  consolation by how close the room came (owner, 2026-11-08): **a Training Ribbon at 75%+ of the goal, 3 Speed Candies
  at 40%+**. Shown top right while it runs: time left, the room's progress, your
  count. Offline you can run one alone (goal as for 1 player).

## Accounts (owner, 2026-11-08)

- A login screen comes first: **Username** (3–16 letters, numbers or _, unique ignoring case) and **Password** (4–64
  characters), **Log in** or **Create account**; no security questions. Errors: wrong name or password, name taken,
  name or password not allowed. Passwords are stored hashed (scrypt).
- Your data (coins, pets, items, Treats, deliveries, shirt, home) is kept on the server (`pet_accounts`): the page sends
  it a second or two after a change, one save at a time, each built on the copy the server last confirmed; if the
  server's copy moved on (a trade), the page takes the server's. The browser remembers you (`pet_tokens`) and logs you
  straight back in. Logging in elsewhere sends the old page back to the login screen.
- The first account made in a browser starts from the progress that browser had before accounts. Your name over your
  head is your username.

## Players (owner, 2026-11-08)

- **Tap another player** (owner, 2026-11-09: no player panel, no name buttons; within 20 m; on a computer also F or E
  next to them) for two buttons right there: **Trade** or **Party**, which sends them an invite (a tap elsewhere or
  walking off closes them); invites pop up with ✓ / ✕ (30 s).
- **Party:** up to 6; members show under your name (✕ leaves). A party can visit each other's homes.
- **Trade:** both see each other's offer: tap your pets to offer them (not ones in a playpen) and type coins; when both
  press Ready (any change un-readies both) the server swaps them. Everyone keeps at least one pet, and nobody goes over
  their bed limit with what they get. Closing the panel cancels.

## Houses on plots (owner, 2026-11-08)

- **Plots** (20 x 20 m, `PLOTS` in pets-world.js): each in the middle of a city block (owner, 2026-11-09): 3 in the blocks
  diagonal to the square, 2 on the **VIP island** floating over the square (62 m up), 5 around town (the fourth diagonal
  block and the four corner blocks), and 6 on an **extra island** off the town's edge (400 m out) that appears when a
  room has more than 10 players. Town plots are flattened and kept clear of houses and trees; each shows a pale outline
  and, when someone has it, a sign with their name.
- Each player in a room gets a plot when they join (the server decides): VIPs one of the VIP island's two; then the
  three near the middle, first come first served; then one of the five around town at random; then the extra island.
  It's freed when they leave. **VIP** is given or taken by admins in the Admin panel (from their next login).
- **Outside (owner, 2026-11-09):** every lot with an owner has one of **5 ready-made houses**: Cottage, Cabin, Modern,
  Barn or Tower, chosen by its owner (Build, outside on your lot: the 5 names; free to change). **Everyone sees it** (the
  server sends each house, and changes). They're solid, and their roofs can be walked on. Its front door faces the
  front of the lot.
- **Inside (owner, 2026-11-09):** at the front door, **E (Enter)** takes you inside: your own, or a party member's.
  Inside is the house's own space: a 20 x 20 m floor and the front door, which are always there, with a black void
  round them; whoever is in the same house sees each other there (the server passes on whose house you're in), and
  nobody outside sees them. **E (Leave)** at the front door inside takes you back out in front of it. Pushing against
  walls for 3 s without getting anywhere puts you back by the front door.
- **Lifts:** a lift at the plaza (teal ring and beam; E or Home ▲) takes you to the front of your plot; lifts on the
  VIP and extra islands (E or ▼) bring you back to the plaza.
- **Building (owner, 2026-11-09)** (Build, inside your own house; Done or ✕ stops): a bar of pieces with prices: Floor
  20, Wall 30, Window 50, Door 60, Roof 25, Slope roof 35, Stairs 80, Pet bed 400, Pet pen 800, Chair 60, Table 100,
  Shelf 90, Cabinet 120, Plant 40, Rug 50, Poster 30; 12 colors behind **one color circle** (a tap opens them, picking one closes them). Putting a piece where the same piece already is (same kind and floor, within half a meter, turned the same way) **doesn't add a second one**: it takes the new color (a window, the view) for free, or nothing happens. The chosen piece follows the pointer **on the floor
  you're on** (no level picker), shown **as it will look**, see-through (reddish when you can't afford it), anywhere and
  at any angle (**freeform**, no grid): R or ⟳ turns it 15° (Shift+R back); a wall brought within 0.9 m of another
  wall's end, or a tile of a tile's side, meets it. A tap puts it down. Floors, roofs, slopes and stairs are 4 x 4 m,
  walls, windows and doors 4 m long; walls are 5.5 m high (3 floors of 5.5 m). **Windows** look out on a view chosen in
  the bar: Meadow, Beach, Mountains, Night sky, Forest or City (a selected window's view can be changed too).
  **Delete:** what you point at shows red; a tap selects it (stronger red); **Del** (the key, or the Del button)
  removes it for half its price. **Paint** recolors what you tap. Up to 300 pieces. The floors above yours (and the
  roof) hide while you're inside, and a wall between the camera and you goes see-through. Everyone starts with a 12 x
  12 m room round the front door, two windows and a roof.
- **Only inside a house** (owner, 2026-11-09: through its front door) you're off your pet, walking (5.5 m/s); others
  see you walking too. Outside, lots included, you keep riding.
- **Beds** (pet beds) each hold 2 more pets (6 + 2 per bed). **Playpens:** tap one in your house to choose its pet (not
  the one you ride, or — to empty it): it wanders there (others see it) and earns coins a minute (2 / 4 / 8 by
  rarity, +5% per level), up to 8 hours' worth, collected when you come into your house. A pet in a playpen can't be
  ridden, traded or sent to the farm.
- Houses built on the old 5 x 5 grid (before 2026-11-09) moved inside as they were (each piece where it stood, turned as it was), behind the front door; their lot shows the Cottage.
- Homes from before plots (bought houses with rooms inside) became the starter house, their pet beds and pens moved
  into it (with their pets), and what was paid for the house, rooms and windows given back, once.

## Staff (owner, 2026-11-08)

- Roles: player, moderator, admin. The account **Nyssary** is always admin (the owner) and is the only one who makes or
  removes admins; admins make (and remove) moderators and give things; moderators and up mute, kick and ban anyone
  below them. Kept on the account (`pet_accounts.role`, `mute_until`, `ban_until`); every action is logged
  (`pet_admin_log`).
- **Admin** button (staff only) opens the panel: everyone online, and any account by name (type to search). Each shows
  online, role, VIP, muted / banned (with time left), and: role (who's allowed), Mute (10m, 1h, 1d, 7d, 30d, Perma,
  Off), Ban (the same), Kick (online), Quick, VIP, Give and Edit (admins). Online players first; your own row has no mute,
  ban or kick. The search box keeps its focus while the list refreshes.
- **Environment controls (owner, 2026-11-09, admins):** the top of the panel changes the shared weather (Auto, Clear,
  Rain, Snow, Storm or Fog) and time of day (Auto, Sunrise, Day, Sunset or Night). Moderators don't get these controls.
- **Quick commands (owner, 2026-11-09, admins):** a "Me" grid at the top of the panel runs them on yourself, each
  row's Quick menu on that player (anyone below you, online or not): +10K / +100K / +1M coins, All pets (one level-1
  pet of every kind they don't have), Max levels (every pet to 20), Items (+100 of each), Treats (+100 of every
  kind), Clear wanted (stars to 0, online only), Everything (a million coins, every missing kind at level 20, all
  pets to 20, the items and the Treats). Logged like every other action.
- **Chat commands (staff):** a chat line starting with "/" from a moderator or admin is a command, never sent as chat
  (a player's "/" line is ordinary chat). `/coins 50k` (k / m), `/allpets`, `/maxlv`, `/items`, `/treats`,
  `/everything` (or `/all`), `/unwanted`, each on yourself or on the player named after it (`/coins 1m Name`);
  `/kick Name`, `/mute Name 1h`, `/ban Name 7d` (minutes, or m / h / d, `perma`, `off`; 1 hour if left out).
  Anything else: "Unknown". The server's own rules decide, as in the panel (moderators can't run the quick ones).
- **Edit (owner, 2026-11-09; admins, on anyone below them or themselves, online or not):** the player's inventory as
  it is: coins, each item, their Treats, and each pet with its level (and the one they ride ★); change the numbers, ✕
  takes a pet away (one always stays), **Save** sends it all; an online player gets it at once. Logged like the rest.
- **Give:** type to narrow the list of everything (Coins, Speed Candy, Training Ribbon, Egg Ticket, every pet, every
  kind's Treats; pets carry their Flier / Glider badge, owner 2026-11-09), pick one, the amount (and level for a pet), Give; it lands in their data straight away (online or
  not).
- Muted: chat messages are dropped ("Muted"). Kicked: back to the login screen ("Kicked"). Banned: kicked and can't log
  in until it ends ("Banned" with the time left).

## Celebrations (owner, 2026-11-08)

- Delivering: confetti and gold sparkles at the mailbox (more, plus a firework, at an island house). Others' deliveries
  show confetti over them too.
- Picking up parcels: sparkles. Training a level: rising sparkles and confetti. Speed Candy: a pink burst.
- A contract starting: its name across the screen. Won: "Contract complete!", fireworks and a burst of confetti.
  Lost: "Time's up".

## Saving

- See Accounts. The server trusts what pages report (coins aren't checked), except trades, which it checks and does.

## Rejected / removed

- Live (dynamic) shadows (owner, 2026-11-09): replaced by baked ones.
- The Epic rarity and 16 pets (owner, 2026-11-09): Kitten, Bunny, Fox, Otter, Penguin, Goat, Butterfly, Stegosaurus, Deer,
  Bear, Horse, Triceratops, Unicorn, Pegasus, Phoenix, Pterodactyl, Ice Dragon (moved to the new pets, above).
- Ink outlines and pencil hatching in the gray look (owner, 2026-11-09): they drew lines over flat ground on phones;
  replaced by plain shades of gray.
- The mount shop and its keeper Rusty (owner, 2026-11-09); the Water type and its pets (Duck, Sea Turtle, Sea
  Serpent; deleted from saves); whirlpool boosts; Package Rush (off, the code kept).
- The hilly town (owner, 2026-11-09): plateaus and cliffs, four big hills, winding ring roads and spokes, the small lake
  with two rivers and a terraced stream, standing rocks, and the scattered islands: replaced by the flat grid town.
- Gliders (owner, 2026-11-09): Parrot, Pegasus, Phoenix and Pterodactyl fly like the other fliers; the Flier / Glider / Swimmer badges became the Ground / Air / Water types.
- Building on the lot itself on a 5 x 5 grid with a level picker (owner, 2026-11-09): replaced by the 5 houses outside and freeform building inside.
- Training for coins (owner, 2026-11-09): replaced by the training arena's obstacle course.
- The courier's cap and mail bag (owner, 2026-11-09): replaced by the R6-style figure.
- Space as a single rise per press on a flier (owner, 2026-11-09): replaced by holding Space / Shift.
- Helicopters spotting players by distance and chasing them down (owner, 2026-11-09): replaced by the searchlight.
