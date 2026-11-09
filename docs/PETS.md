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
  the **contract board** (red ring), the **egg shop** (pink, a giant egg on top, pink ring), the **training yard**
  (a running track with hurdles, green ring) and the **pound** (animal control, striped front, a fenced yard).
- **Houses** (about 130) line the roads on both sides, facing them, each with a red mailbox at the roadside; trees on
  open ground.
- **Floating islands:** 5 off the town's edge (20–38 m up), each with 3 houses and trees. Only fliers reach them.
- Houses and buildings are solid (you slide along their walls); a house between the camera and you is hidden while
  it's in the way.

## Riding

- You ride your pet (the courier on its back: shirt, cap, mail bag). **Phone:** put a thumb down on the left half of
  the screen for a joystick there; drag elsewhere to turn the camera (up/down tilts it); two fingers pinch to zoom.
  **Computer:** WASD / arrows, drag to turn, the wheel zooms. Movement is relative to the camera.
- **Flying (owner, 2026-11-08):** on a flier, moving forward climbs or dives the way the camera looks (look up, from
  below, to climb; look down to dive; the camera can go below a flier); it hovers when stopped and walks when on the
  ground. Up to 95 m.
- A pet grows 1.5% bigger with each level (owner, 2026-11-08), so a level 20 pet is about 29% bigger; others see it too.

## Animal control (owner, 2026-11-08)

- 8 white vans with light bars patrol the roads (driving on the right, turning round at a road's end) and 2
  helicopters circle over town. Online the server runs them for the whole room; offline the page does.
- Each spots a player near it (vans 16 m, helicopters 22 m, plus 7 m per wanted star; vans only see players on or near
  the ground) and chases them straight for a short while (vans 3 s, helicopters 3.5 s, plus 0.8 s per star), lights
  flashing (a helicopter shines a searchlight). Vans chase at 9.5 m/s, helicopters 11, plus 1.3 / 1.6 per star, so a
  faster pet gets away.
- **Caught** (a van touching you on the ground, a helicopter reaching you anywhere): you're taken to the pound's yard,
  dizzy for 2.2 s, your parcels go back to the post office and your wanted level is cleared; 7 s before you can be
  caught again.
- **Wanted level (0–5 stars):** each chase you get away from adds a star (at most one every 4 s); a star drops every
  25 s nobody's chasing you. Shown top right, and over your name for others. Each star adds **20% to delivery pay**.

## Delivering

- Riding into the pickup ring fills your bag with parcels (as many as your pet's bag holds), each for a random house;
  on a flier about 3 in 10 are for island houses. Switching to a pet that can't fly hands island parcels back.
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
- **Pets** (button) lists yours (best first) with level, speed and bag; tap one to ride it.
- **Egg shop** (ride into its ring): Basic Egg $150 (Common 72%, Rare 24%, Epic 4%), Golden Egg $1,500 (Rare 60%, Epic 32%,
  Legendary 8%); the pet is any of that rarity. The egg shakes harder and cracks, then bursts in a flash and fireworks (more for Epic and Legendary) with rays
  in the rarity's color; Ride puts you on it (with fireworks and confetti around you).
- **Pet Farm and Treats (owner, 2026-11-08, like a kind's candy):** a spare pet (you have another of its kind, and
  you're not riding it) shows **Pet Farm +N** in the Pets list; tap it, then **Sure?**, and it goes to live on the farm,
  leaving **N Treats** for its kind (5 + 1 per level it had). Treats show on that kind's cards. In the training yard a
  Treats button trains the pet you ride a level for Treats instead of coins: 1 per level up to level 4, 2 up to 8, 3 up
  to 12, 4 up to 16, 5 after.
- **Training yard** (ride into its ring): trains the pet you ride a level for coins (40 × 1.32 per level, × 1 / 1.6 / 2.6
  / 4 by rarity), up to level 20: each level +5% speed; every 5 levels one more parcel in the bag.

## Co-op

- The game connects to the Atamus server (`wss://play.atamus.io/pets`) and puts you in a room of up to 16. Everyone in
  the room rides the same town and sees the others (their pet, shirt and name over their head), moving smoothly. Top
  right: a green dot when connected and how many are in the room. Offline, it keeps trying and you play alone.
- **Smooth movement (owner, 2026-11-08: rubber-banding):** the server sends everyone's position and animal control 10
  times a second stamped with its clock; pages draw others and vehicles 140 ms in the past, gliding between updates
  (guessing ahead up to 0.2 s if one's late). Your own position is sent 10 times a second by the real clock (and every
  2 s regardless).
- **Leaving (owner, 2026-11-08: ghosts and clones):** a tab that's put away disconnects and reconnects when it's back;
  the server drops connections that don't answer its ping within 10 s; a page that reconnects (same tab) replaces its
  old connection (keeping its wanted level).
- **Updates (owner, 2026-11-08):** when a new build of the site goes live, the server tells every connected page and it
  reloads onto it ("Updating!"); a page that connects with an older build than the server last saw reloads too (at most
  once a minute). Progress is in the browser, so nothing's lost but the parcels in the bag.
- **Chat (owner, 2026-11-08):** Chat (the button, or Enter or / on a computer) opens a line to type in (up to 120 characters,
  one message per 1.2 s); messages show in a list at the bottom left for 12 s and as a speech bubble over the sender for
  6 s. Online only.
- Your name is a random two words (kept in the browser).
- **Contracts** (the contract board, owner 2026-11-08: shorter ones too): anyone starts one when none is running:
  - **Rush Order:** 3 + 3 per player parcels in 1 minute, 22 coins per parcel of the goal.
  - **Quick Contract:** 5 + 4 per player in 1:30, 26 per parcel.
  - **Big Contract:** 10 + 8 per player in 3 minutes, 30 per parcel. Every delivery by anyone in the room counts (the server
  takes at most one per player every 0.9 s). Met in time, each player who delivered gets a share of the reward by how
  many they delivered; out of time, nobody gets the reward, but each player who delivered gets a
  consolation by how close the room came (owner, 2026-11-08): **a Training Ribbon at 75%+ of the goal, 3 Speed Candies
  at 40%+**. Shown top right while it runs: time left, the room's progress, your
  count. Offline you can run one alone (goal as for 1 player).

## Celebrations (owner, 2026-11-08)

- Delivering: confetti and gold sparkles at the mailbox (more, plus a firework, at an island house). Others' deliveries
  show confetti over them too.
- Picking up parcels: sparkles. Training a level: rising sparkles and confetti. Speed Candy: a pink burst.
- A contract starting: its name across the screen. Won: "Contract complete!", fireworks and a burst of confetti.
  Lost: "Time's up".

## Saving

- Progress (coins, pets and levels, items, name, shirt, deliveries) is kept in this browser (localStorage), with no
  account. The server trusts what browsers report (coins aren't checked).

## Rejected / removed

- (nothing yet)
