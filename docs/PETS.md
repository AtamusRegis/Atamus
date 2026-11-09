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
- Houses and the two shops are solid (you slide along their walls); a house between the camera and you is hidden while
  it's in the way.

## Riding

- You ride your pet (the courier on its back: shirt, cap, mail bag). **Phone:** put a thumb down on the left half of
  the screen for a joystick there; drag elsewhere to turn the camera (up/down tilts it); two fingers pinch to zoom.
  **Computer:** WASD / arrows, drag to turn, the wheel zooms. Movement is relative to the camera.
- The camera follows behind and above (tilt and zoom kept between limits).

## Delivering

- Riding into the pickup ring fills your bag with parcels (as many as your pet's bag holds), each for a random house.
- Each house you have a parcel for shows a gold beam with a spinning parcel over its mailbox; a gold arrow over your pet
  points to the nearest one (or back to the post office when the bag's empty).
- Riding within 3.6 m of that mailbox delivers: **8 coins + 1 per 10 m from the post office** (about 8–25), and
  sometimes an item: Speed Snack 12%, Training Ribbon 4%, Egg Ticket 1%.

## Items

- **Speed Snack:** a button by Pets (with its count); 30 s at 1.5× speed.
- **Training Ribbon:** a free training level (a button in the training yard).
- **Egg Ticket:** a free Basic Egg (a button in the egg shop).

## Pets

- Start: a Pup. 12 kinds in 4 rarities (speed m/s / bag):
  - Common: Pup 7/2, Kitten 7.5/2, Bunny 8/2, Duck 6.5/3
  - Rare: Fox 9.5/3, Penguin 8.5/4, Goat 9/4
  - Epic: Deer 11.5/3, Bear 10/6, Horse 12.5/4
  - Legendary: Dragon 15/5, Unicorn 16/4
- **Pets** (button) lists yours (best first) with level, speed and bag; tap one to ride it.
- **Egg shop** (ride into its ring): Basic Egg $150 (Common 72%, Rare 24%, Epic 4%), Golden Egg $1,500 (Rare 60%, Epic 32%,
  Legendary 8%); the pet is any of that rarity. The egg wobbles and hatches; Ride puts you on it.
- **Training yard** (ride into its ring): trains the pet you ride a level for coins (40 × 1.32 per level, × 1 / 1.6 / 2.6
  / 4 by rarity), up to level 20: each level +5% speed; every 5 levels one more parcel in the bag.

## Co-op

- The game connects to the Atamus server (`wss://play.atamus.io/pets`) and puts you in a room of up to 16. Everyone in
  the room rides the same town and sees the others (their pet, shirt and name over their head), moving smoothly. Top
  right: a green dot when connected and how many are in the room. Offline, it keeps trying and you play alone.
- Your name is a random two words (kept in the browser).
- **Big contracts** (the contract board): anyone starts one when none is running: **deliver 10 + 8 per player parcels
  in 3 minutes**, reward **30 coins per parcel of the goal**. Every delivery by anyone in the room counts (the server
  takes at most one per player every 0.9 s). Met in time, each player who delivered gets a share of the reward by how
  many they delivered; out of time, nobody gets it. Shown top right while it runs: time left, the room's progress, your
  count. Offline you can run one alone (goal 18).

## Saving

- Progress (coins, pets and levels, items, name, shirt, deliveries) is kept in this browser (localStorage), with no
  account. The server trusts what browsers report (coins aren't checked).

## Rejected / removed

- (nothing yet)
