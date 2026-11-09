# Pet Delivery Co.: how it behaves today

A second game on atamus.io (owner, 2026-11-08), separate from the cargo station game: `website/pets.html` +
`website/pets.js`, with its co-op in `packages/server/src/pets.js`. Phone first, 3D (Three.js, 1 unit = 1 m).

> own a pet, deliver mail, get money and items, buy and train new pets to do deliveries faster. 3D mobile first
> friendly. Co-op lets you take on big delivery contracts as a group.

Asked (owner): a web game on atamus.io (not Roblox), on its own page; the cargo game stays.

## The town

- **A big floating island (owner, 2026-11-08)**, about 465 m across with a ragged edge and rock tapering away beneath it;
  clouds above and below. Built from `website/pets-world.js`, which the server uses too (the two copies must match;
  `scripts/check.sh` compares them).
- **Terrain:** rolling ground stepped into plateaus whose steps are cliffs (up to about 48 m high), and four big hills.
  Ground pets can't climb anything steeper than about 39° (cliffs) and can't go past the edge; they can drop off
  ledges.
- **Winding roads:** two winding rings and six winding spokes out from the plaza, 8 m wide with dashed center lines,
  cut into the slopes so they climb gently through the cliffs.
- **The plaza** (flat, paved, in the middle): the **post office** (blue roof) with its **pickup ring** (gold) in front,
  the **contract board** (red ring), the **egg shop** (pink, a giant egg on top, pink ring), the **mount shop** (teal,
  a giant golden horseshoe on top, teal ring, facing the egg shop; owner, 2026-11-09), the **training yard**
  (a running track with hurdles, green ring) and the **pound** (animal control, striped front, a fenced yard).
- **Houses** (about 130) line the roads on both sides, facing them, each with a red mailbox at the roadside; trees on
  open ground.
- **Floating islands (owner, 2026-11-08: more, some above the town):** 10 off the town's edge, low (−10 to 16 m) so
  gliders can reach them, and 8 high above the town (84–124 m) that only flapping fliers reach; each has 3 houses and
  trees. Falling off into the clouds brings you back to the plaza.
- **Looks (owner, 2026-11-08):** the ground's colors blend smoothly (grass by height and in broad patches, fading into
  rock on steep slopes over a few metres) with a fine speckled texture; tall rocks and boulders stand on the cliffs
  and steep slopes (about 320).
- **Sky (owner, 2026-11-08), the same for everyone (timed off the clock):** a day lasts 20 minutes (a little more day
  than night): the sun moves, the sky and fog go through dusk to night (stars, house windows light up, lights dim).
  Every 4 minutes the weather's decided: about 1 in 4 rain (streaks around you, a grey sky, shorter fog, easing in and
  out). Wind streaks blow past (more up high and in the rain); god rays slant down from the sun (strongest with it
  low, none at night or in rain); 56 clouds in three layers (below the island, around it and high above).
- **Place labels (owner, 2026-11-09):** a speech bubble floats over each place saying what it is (Post Office: Pick up
  parcels here; Contract Board: Start a contract with your room; Egg Shop: Buy eggs to hatch new pets; Mount Shop: Buy pets to ride; Training Yard:
  Train the pet you ride; Animal Control: Where caught couriers end up; Sky Lift: Up to your plot / Down to the plaza),
  clear within 45 m and fading out by 70 m, growing a little with distance; hidden while building.
- Houses and buildings are solid (you slide along their walls). **A house between the camera and you fades (owner,
  2026-11-08):** the more of you it hides (5 points on you), the more see-through it gets (down to 18%), easing in and
  out.
- Roads are laid on the land vertex by vertex (5 across, every ~2 m) just above it, and pets stand on the road surface.
- No flicker: shadows are biased against acne and the vans' overlapping faces are offset.

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
  air also pitch with how they're really moving: nose-up climbing, nose-down diving or gliding down, up to about 40°,
  eased in, about the middle of pet and rider, the same for everyone's pets; level on the ground. Land pets never
  tilt. (The tilt removed on 2026-11-08 followed the camera, not the flight.)
  - **Space (or the Jump / Fly ▲ / Flap ▲ button) is pressed each time, never held (owner, 2026-11-08).**
  - **Land pets** jump: straight up when not moving, far on the run (1.6× speed in the air); a jump gets them up a
    ledge.
  - **Flapping fliers** (Butterfly, Owl, Dragon, Ice Dragon): Space rises straight up; moving forward climbs or dives the way the camera looks
    (look up, from below, to climb; the camera can go below them); they hover when stopped; up to 130 m. They fly at
    0.75× and walk at 0.7× their speed.
  - **Gliders** (Parrot, Pegasus, Phoenix, Pterodactyl): can't climb, but Space jumps off the ground and gives one flap
    up in the air; they glide, sinking 1.6 m/s (faster
    looking down) at 1.25× speed, and walk at 0.95×; they can step off the edge.
- **Every kind has its own build (owner, 2026-11-08):** body shape and size (boxy, round, upright birds, two-legged
  dinosaurs), leg length, a neck on horses, deer and dragons, head and snout, ears, tail and extras: floppy ears and a
  wagging tail (Pup), cat ears, whiskers and a curled tail (Kitten), a round body, long ears, a puff tail and a hop
  (Bunny), a long snout and bushy white-tipped tail (Fox), curled horns and a beard (Goat), antlers and spots (Deer),
  a big round body (Bear), a mane and hair tail (Horse; rainbow ones and a horn for the Unicorn; wings for the
  Pegasus), plates and a spiked tail (Stegosaurus), a frill and horns (Triceratops), bat wings, back horns, spikes and a
  spade tail (Dragons; ice-white spikes and a crest on the Ice Dragon), a flat bill (Duck), an upright body with
  flippers (Penguin), a hooked beak and long tail (Parrot), big eyes and tufts (Owl), a crest and fire tail (Phoenix), a
  long beak, back crest and bat wings (Pterodactyl), stripes, claws and a crest (Raptor), a huge head and tiny arms
  (T-Rex). Upright birds waddle.
- A pet grows 1.5% bigger with each level (owner, 2026-11-08), so a level 20 pet is about 29% bigger; others see it too.

## Animal control (owner, 2026-11-08)

- 8 white vans with light bars patrol the roads (driving on the right, turning round at a road's end) and 2
  helicopters circle over town. Online the server runs them for the whole room; offline the page does.
- They only go after players carrying parcels (owner, 2026-11-08); a chase ends if the bag empties (no star).
- Each spots a player near it (vans 16 m, helicopters 22 m, plus 7 m per wanted star; vans only see players on or near
  the ground) and chases them straight for a short while (vans 3 s, helicopters 3.5 s, plus 0.8 s per star), lights
  flashing (a helicopter shines a searchlight). Vans chase at 9.5 m/s, helicopters 11, plus 1.3 / 1.6 per star, so a
  faster pet gets away.
- **Caught** (a van touching you on the ground, a helicopter reaching you anywhere): you're taken straight to the
  pound's yard (no stun, owner 2026-11-08), your parcels go back to the post office and your wanted level is cleared; 7 s before you can be
  caught again.
- **Wanted level (0–5 stars):** each chase you get away from adds a star (at most one every 4 s); a star drops every
  25 s nobody's chasing you. Shown top right, and over your name for others. Each star adds **20% to delivery pay**.

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

## Items

- **Speed Candy** (was Speed Snack): a button by Pets (with its count); 30 s at 1.5× speed.
- **Training Ribbon:** a free training level (a button in the training yard).
- **Egg Ticket:** a free Basic Egg (a button in the egg shop).

## Pets

- Start: a Pup. 23 kinds in 4 rarities (speed m/s / bag; ✈ flies):
  - Common: Pup 7/2, Kitten 7.5/2, Bunny 8/2, Duck 6.5/3
  - Rare: Fox 9.5/3, Penguin 8.5/4, Goat 9/4, Butterfly ✈ 9/2, Parrot ✈ 9.5/3, Stegosaurus 8.5/5
  - Epic: Deer 11.5/3, Bear 10/6, Horse 12.5/4, Owl ✈ 11/4, Triceratops 11/6, Raptor 13/3
  - Legendary: Dragon ✈ 15/5, Unicorn 16/4, Pegasus ✈ 15.5/4, Phoenix ✈ 17/3, T-Rex 14.5/7, Pterodactyl ✈ 15/5,
    Ice Dragon ✈ 16/5
- **Fliers (owner, 2026-11-08):** climb to 11 m above the land while moving (higher near an island), over houses and
  trucks, and come down when stopped or within 10 m of a parcel's house, the post office, the shops or the board; they
  land on islands. Shown with a wing by their name in the menus.
- **Fliers and gliders are marked (owner, 2026-11-08):** a badge on every card (Flier: sky blue with flapping wings;
  Glider: teal with spread wings) and the card's frame and tint in that colour, also when an egg hatches.
- **Pets** (button) lists yours (best first) with level, speed and bag; tap one to ride it.
- **Shops (owner, 2026-11-09):** riding into a shop's ring opens its window in the middle of the screen, with your coins
  at the top and each item's price on its buy button (grayed out when you can't afford it; Full at the pet limit).
- **Mount shop** (ride into its ring): every pet, any number of times, at level 1; buying one puts you on it (with
  confetti). Legendary pets cost $2,500; each rarity below costs a random 500–750 less than the one above, drawn once per
  pet: Pup $775, Kitten $625, Bunny $675, Duck $800; Fox $1,250, Penguin $1,300, Goat $1,325, Butterfly $1,150, Parrot
  $1,325, Stegosaurus $1,200; Deer $1,925, Bear $1,775, Horse $1,775, Owl $1,850, Triceratops $1,975, Raptor $1,925; every
  Legendary $2,500.
- **Egg shop** (ride into its ring): Basic Egg $150 (Common 72%, Rare 24%, Epic 4%), Golden Egg $1,500 (Rare 60%, Epic 32%,
  Legendary 8%); the pet is any of that rarity. The egg shakes harder and cracks, then bursts in a flash and fireworks (more for Epic and Legendary) with rays
  in the rarity's color; Ride puts you on it (with fireworks and confetti around you).
- **Pet Farm and Treats (owner, 2026-11-08, like a kind's candy):** a spare pet (you have another of its kind, and
  you're not riding it) shows **Pet Farm +N** in the Pets list; tap it, then **Sure?**, and it goes to live on the farm,
  leaving **N Treats** for its kind (5 + 1 per level it had). Treats show on that kind's cards. In the training yard a
  Treats button trains the pet you ride a level for Treats instead of coins: 1 per level up to level 4, 2 up to 8, 3 up
  to 12, 4 up to 16, 5 after.
- **Beds:** you can have 6 pets plus 2 for each bed in your home; eggs and mounts show Full when you're at the limit.
- **Training yard** (ride into its ring): trains the pet you ride a level for coins (40 × 1.32 per level, × 1 / 1.6 / 2.6
  / 4 by rarity), up to level 20: each level +5% speed; every 5 levels one more parcel in the bag.

## Co-op

- The game connects to the Atamus server (`wss://play.atamus.io/pets`) and puts you in a room of up to 16. Everyone in
  the room rides the same town and sees the others (their pet, shirt and name over their head), moving smoothly. Top
  right: a green dot when connected and how many are in the room. Offline, it keeps trying and you play alone.
- **Smooth movement (owner, 2026-11-08: rubber-banding):** your page sends your position 20 times a second (when it
  changes, and every second regardless) stamped with your own clock; the server passes positions on 20 times a second
  (animal control 10, stamped with its clock). Pages replay each player 170 ms in the past on that player's own clock
  (so speeds stay even), guessing ahead up to 0.2 s if an update's late (not if they'd stopped) and easing any
  correction in. Nothing is checked by the server (no anti-cheat).
- **Leaving (owner, 2026-11-08: ghosts and clones):** a tab that's put away disconnects and reconnects when it's back;
  the server drops connections that don't answer its ping within 10 s; a page that reconnects (same tab) replaces its
  old connection (keeping its wanted level).
- **Updates (owner, 2026-11-08):** when a new build of the site goes live, the server tells every connected page and it
  reloads onto it ("Updating!"); a page that connects with an older build than the server last saw reloads too (at most
  once a minute). Progress is in the browser, so nothing's lost but the parcels in the bag.
- **Chat history (owner, 2026-11-08):** while the chat line is open, everything said since you logged in shows above
  it (scrollable); a new login starts it fresh.
- **Chat (owner, 2026-11-08):** Chat (the button, or Enter or / on a computer) opens a line to type in (up to 120 characters,
  one message per 1.2 s); messages show in a list at the bottom left for 12 s and as a speech bubble over the sender for
  6 s. Online only.
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

- Next to another player (5 m), **F** (or the button with their name) opens a menu: **Trade** or **Party**, which sends
  them an invite; invites pop up with ✓ / ✕ (30 s).
- **Party:** up to 6; members show under your name (✕ leaves). A party can visit each other's homes.
- **Trade:** both see each other's offer: tap your pets to offer them (not ones in a playpen) and type coins; when both
  press Ready (any change un-readies both) the server swaps them. Everyone keeps at least one pet, and nobody goes over
  their bed limit with what they get. Closing the panel cancels.

## Houses on plots (owner, 2026-11-08)

- **Plots** (20 x 20 m, `PLOTS` in pets-world.js): 3 near the middle of town, 2 on the **VIP island** floating above
  the middle (60 m up), 5 around town, and 6 on an **extra island** off the town's edge (400 m out) that appears when a
  room has more than 10 players. Town plots are flattened and kept clear of houses and trees; each shows a pale outline
  and, when someone has it, a sign with their name.
- Each player in a room gets a plot when they join (the server decides): VIPs one of the VIP island's two; then the
  three near the middle, first come first served; then one of the five around town at random; then the extra island.
  It's freed when they leave. **VIP** is given or taken by admins in the Admin panel (from their next login).
- Everyone's house stands on their plot and **everyone sees it** (the server sends each house, and changes to it).
- **Lifts:** a lift at the plaza (teal ring and beam; E or Home ▲) takes you to the front of your plot; lifts on the
  VIP and extra islands (E or ▼) bring you back to the plaza.
- **Building** (Build, on your own plot; the camera rises over it): a bar of pieces with prices: Floor 20, Wall 30,
  Window 50, Door 60, Roof 25, Slope roof 35, Stairs 80, Pet bed 400, Pet pen 800, Chair 60, Table 100, Shelf 90,
  Cabinet 120, Plant 40, Rug 50, Poster 30; 12 colours. The chosen piece follows the pointer on the level you're
  building (green, or red when you can't afford it): floors, roofs, slopes and stairs snap to a 4 m square of the 5 x 5
  grid, walls, windows and doors to the nearest edge of one, furniture to half a metre; a tap puts it down (the same
  structural piece in the same place isn't doubled). ⟳ (or R) turns it; ▲ ▼ change the level (3 floors of 4.5 m);
  the colour paints what you put down; **Paint** recolours what you tap; **Remove** takes away what you tap for half its
  price. ✕ / Done (or Escape) stops. Up to 300 pieces. Everyone starts with a little house (a 3 x 3 room with a door,
  windows and a roof).
- **Inside a house** (on its floors or steps with a ceiling or roof above you; on open-air floors and roofs you keep riding, owner 2026-11-09) you're off your pet, walking (5.5 m/s); walls (4.5 m)
  block, doors are gaps, stairs and slopes climb; the floors above you (and the roof) hide while you're inside so you can
  see in. Others see you walking too.
- **Shut in** (owner, 2026-11-09): pushing on for 1.5 s without getting anywhere, in a room with no doorway or open side to the plot and no stairs or slope, puts you out in front of the plot (not on a flier, which can fly up).
- **Beds** (pet beds) each hold 2 more pets (6 + 2 per bed). **Playpens:** tap one on your plot to choose its pet (not
  the one you ride, or — to empty it): it wanders there (others see it) and earns coins a minute (2 / 3.5 / 5.5 / 8 by
  rarity, +5% per level), up to 8 hours' worth, collected when you come onto your plot. A pet in a playpen can't be
  ridden, traded or sent to the farm.
- Homes from before plots (bought houses with rooms inside) became the starter house, their pet beds and pens moved
  into it (with their pets), and what was paid for the house, rooms and windows given back, once.

## Staff (owner, 2026-11-08)

- Roles: player, moderator, admin. The account **Nyssary** is always admin (the owner) and is the only one who makes or
  removes admins; admins make (and remove) moderators and give things; moderators and up mute, kick and ban anyone
  below them. Kept on the account (`pet_accounts.role`, `mute_until`, `ban_until`); every action is logged
  (`pet_admin_log`).
- **Admin** button (staff only) opens the panel: everyone online, and any account by name (type to search). Each shows
  online, role, muted / banned (with time left), and: role (who's allowed), Mute (10m, 1h, 1d, 7d, 30d, Perma, Off),
  Ban (the same), Kick (online), Give (admins).
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

- The courier's cap and mail bag (owner, 2026-11-09): replaced by the R6-style figure.
