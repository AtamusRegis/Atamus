# Pet Delivery Co.: how it behaves today

A second game on atamus.io (owner, 2026-11-08), separate from the cargo station game: `website/pets.html` +
`website/pets.js`, with its co-op in `packages/server/src/pets.js`. Phone first, 3D (Three.js, 1 unit = 1 m).

> own a pet, deliver mail, get money and items, buy and train new pets to do deliveries faster. 3D mobile first
> friendly. Co-op lets you take on big delivery contracts as a group.

Asked (owner): a web game on atamus.io (not Roblox), on its own page; the cargo game stays.

## The town

- A 5 × 5 grid of 40 m blocks between roads (8 m wide, dashed center lines), about 250 m across, the same for everyone.
- The middle block is the plaza: the **post office** (blue roof) with its **pickup ring** (gold) in front and the
  **contract board** (red ring) beside it. East of it the **egg shop** (pink, a giant egg on top, pink ring); west the
  **training yard** (a running track with hurdles, green ring). The other 22 blocks have 4 houses each (88), each with a
  red mailbox by the road, and trees.
- **Hills (owner, 2026-11-08):** rolling hills across town, roads and lawns draped over them; the middle row (plaza, egg
  shop, training yard) stays flat, and the land rises past the edge of town.
- **Floating islands (owner, 2026-11-08):** 5 above the corners and north edge of town (20–30 m up), each with 3 houses
  and trees. Only fliers reach them.
- **Animal control (owner, 2026-11-08):** 7 white vans with flashing lights drive set loops along the roads (on the right
  side), the same for everyone (timed off the clock). One touching you (unless you're flying more than 3 m up) stuns you
  for 1.5 s (dizzy stars) and your parcels go back to the post office; then 3 s before another can catch you.
- Houses and the two shops are solid (you slide along their walls); a house between the camera and you is hidden while
  it's in the way.

## Riding

- You ride your pet (the courier on its back: shirt, cap, mail bag). **Phone:** put a thumb down on the left half of
  the screen for a joystick there; drag elsewhere to turn the camera (up/down tilts it); two fingers pinch to zoom.
  **Computer:** WASD / arrows, drag to turn, the wheel zooms. Movement is relative to the camera.
- The camera follows behind and above (tilt and zoom kept between limits).

## Delivering

- Riding into the pickup ring fills your bag with parcels (as many as your pet's bag holds), each for a random house;
  on a flier about 3 in 10 are for island houses. Switching to a pet that can't fly hands island parcels back.
- Each house you have a parcel for shows a gold beam (pink for an island house) with a spinning parcel over its mailbox; a gold arrow over your pet
  points to the nearest one (or back to the post office when the bag's empty).
- Riding within 3.6 m of that mailbox delivers: **8 coins + 1 per 10 m from the post office** (about 8–25), **double
  for an island house**, and sometimes an item: Speed Candy 12%, Training Ribbon 4%, Egg Ticket 1%.

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
- **Training yard** (ride into its ring): trains the pet you ride a level for coins (40 × 1.32 per level, × 1 / 1.6 / 2.6
  / 4 by rarity), up to level 20: each level +5% speed; every 5 levels one more parcel in the bag.

## Co-op

- The game connects to the Atamus server (`wss://play.atamus.io/pets`) and puts you in a room of up to 16. Everyone in
  the room rides the same town and sees the others (their pet, shirt and name over their head), moving smoothly. Top
  right: a green dot when connected and how many are in the room. Offline, it keeps trying and you play alone.
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
