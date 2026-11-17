# Critter Courier: how it behaves today

(owner, 2026-11-11) The game was remade from the Critter Courier design document: a delivery runner with collecting
and light PvP, in the browser, phone first. The blocky couriers were kept; everything else was redone to the document
(nothing of the old Pet Delivery Co. was merged in). Owner's choices: a fixed town made in code (no editor), a fresh
start for everyone with logins kept, full color, and chat, the admin panel and parties kept.

Every rule below is in `website/pets-world.js` (shared with the server, an identical copy in `packages/server/src/`),
`packages/server/src/pets.js` (the server decides everything that matters) or `website/pets.js` (the page). 1 unit =
1 m. The document's studs became meters at about 0.36 m a stud.

## The run

1. **Grab.** Ride (or walk) into your Ready parcel on the post office conveyor. It snaps to your saddle, where everyone
   sees it.
2. **Ride** to the address: a random house in the parcel's district. (owner, 2026-11-11) The delivery spot is the one
   hot pink thing in town (the town's colors are kept calm around it): a tall beam, a spinning marker, a ring on the
   ground and the address on a label. A pink arrow on the ground a few meters out from you points the way (like the old
   game's).
3. **Deliver.** Ride into the glowing ring in front of that mailbox (within 3 m; no button). The server checks it. A
   wrong mailbox just shakes.
4. **Open it.** Coins pay out, and the delivered parcel (a **gift**, kept on the server
   and saved, so unopened ones are there next time) lands on the left of the screen with a small sparkle beside it in
   its rarity's color, the rarity popping up over the mailbox. The rarity is rolled on delivery; what's inside is
   rolled when you open it. **Four of one rarity merge** into one of the next (owner, 2026-11-11), its parcel tier the
   best of the four, with a little animation (they slide together and the new one pops out); merges chain up to
   Legendary. (owner, 2026-11-11: the loop) **They open by themselves once you have no parcels left** (all delivered
   or lost): your only parcel opens straight after its delivery; with several, they wait on the left until the last is
   delivered or lost, then (owner, 2026-11-11) **all open at once, on one screen**: each box in its own card in the
   middle of the screen with its rarity; they shake together (rays and glow growing, a little longer the rarer the best
   one), burst, and every card shows what was inside at once: coins, and a mount the parcel brought right there in its
   card (it drops in spinning over rays, its name and rarity under it, NEW! for the first of its kind and rarity). No
   separate unboxing to click through. (owner, 2026-11-12) No riding while it's up. (owner, 2026-11-13) It opens the moment the
   last parcel is delivered or lost, as you're sent back to the respawn point, and you can't move from then until it's
   closed. The boxes start cracking by themselves; a click cracks them at once; what was inside stays up until another
   click (so a double click goes straight through).
   (owner, 2026-11-11) **When the run's over** (nothing left delivered, carried, with a goose or on the ground) you're
   taken straight back to the post office. Up to 60 can wait;
   past that the oldest open by themselves.

(owner, 2026-11-12) **A stack of parcels:** every mount carries 1 parcel; Aura raises it a level at a time, up to 5
(the Stable's Carry row: 150 Aura x 4^level x (1 + 0.5 x rarity) x (1 + 0.5 x its area), so rarer and farther animals
cost more). Mounts from before kept what they carried (one per rarity rank), once. Ride back into the conveyor to load up. (owner, 2026-11-11) The mount shows **a big box for each parcel**, stacked. Each has its own address (the same neighborhood as another or a
different one), its own marker, and the parcel counter shows how many of how many. The ground arrow points to the nearest. Each delivers at its own mailbox and rolls; several rolls take turns.
A parcel that breaks or is lost is gone; the conveyor always has the next one. (owner, 2026-11-17) **You ride the same speed loaded or empty.**

## The conveyor

- (owner, 2026-11-11) **The post office is a building** (16 x 10 m, a red gabled roof, its sign over the door) on the
  north side of the square, with a **conveyor belt** coming out of its door 9 m toward the square. Each courier sees
  only their own **one big parcel** on it (1.7x; owner, 2026-11-11: one per courier), waiting at the belt's end.
  Grabbing: the belt runs and a pusher pushes the next one out of the door to the end (1.6 s) with a pop. A parcel
  rolled for an area that isn't open (after a reset) is rolled again. The building and the belt are solid; the server allows a grab within 1.8 + 4.6 m of the end.
- The address is picked when you grab. Nobody else sees your target; two couriers can have the same house.

## Parcels

| Tier | District | Coins | Roll luck | Share of parcels (all districts open) |
| --- | --- | --- | --- | --- |
| Bronze | Main Street | x1 | none | 40% |
| Silver | Maple Suburbs | x2 | +10% | 28% |
| Gold | Goose Marsh | x4 | +25% | 18% |
| Diamond | Cliffside | x8 | +50% | 10% |
| Sky | Floating Islands | x15 | +100% | 4% |
| Frost | Frostbite Fields | x22 | +120% | 3% |
| Dune | Sunscorch Dunes | x32 | +140% | 2.5% |
| Jungle | Jungle Ruins | x45 | +160% | 2% |
| Magma | Lava Flats | x62 | +180% | 1.5% |
| Star | Moon Garden | x85 | +200% | 1% |

- (owner, 2026-11-11) **At least 30% go to the farthest area you've opened**; the rest spread over the ones in between.
- (owner, 2026-11-11) **The next area opens once you have an Uncommon or better of the area before's animal** (Route
  Permits went): an Uncommon Dog opens Maple Suburbs, an Uncommon Cat Goose Marsh, an Uncommon Gator Cliffside, an
  Uncommon Bear the Floating Islands (`openFor`; in order: a Cat alone opens nothing). Tiers for districts you haven't
  opened never appear. The
  more districts are open, the bigger the higher tiers' share (tier n's weight x (1 + n x (open - 1) / 5)), and so does
  the ridden mount's rarity (owner, 2026-11-11: the rarer the mount, the pricier the parcels and the longer the
  trips): tier n's weight x (1 + n x rarity / 2).
- Every hit (a bite, a rock, a fall, the pipe's goose) lands on one of your parcels at random.
- Every parcel has 3 durability (Sturdy Boxes: 4 at level 5, 5 at level 10). Each hit takes 1 and 20% of the delivery
  coins; at 0 it breaks.
- (owner, 2026-11-11) Parcels differ only by tier (rarity) and timing: one parcel in five is **Express** (a countdown:
  0.16 s per meter to the address, at least 14 s, plus 8 / 40 / 45 s for the Marsh / Cliffside / Islands; no bonus if
  late; +150%). Fragile, Heavy and Golden parcels went.
- Delivery coins = 10 x tier x (1 + modifier bonus) x Payout upgrade x (1 - 0.2 per hit).

## The reward roll

| Roll | Chance | Coins (zone 0's range; see below) | Also |
| --- | --- | --- | --- |
| Common | 60% | 4-10 | |
| Uncommon | 25% | 15-30 | |
| Rare | 10% | 50-100 | |
| Epic | 4% | 220-420 | |
| Legendary | 1% | 1,500-2,600 | |

- (owner, 2026-11-14) **A gift's coins by zone:** the top of its range is 5% higher for each zone further out the parcel
  came from (x 1.05^zone), and the bottom is 5% higher for each zone you've opened past that one (x 1.05 per zone, up to
  the top), so older zones pay more reliably as you go further.

- (owner, 2026-11-11) **Mounts drop from parcels:** a parcel can bring its area's animal, at the parcel's rarity or
  lower (a Legendary parcel from Main Street: a Common, Uncommon, Rare, Epic or Legendary Dog). (owner, 2026-11-11)
  (owner, 2026-11-12) Each rarity has its own chance: Common 40%, Uncommon 20%, Rare 10%, Epic 5%, Legendary 1%
  (`PET_CHANCE`). A parcel tries its own rarity first, then each one below, and gives one mount at most: a Legendary
  parcel 1% Legendary, else 5% Epic, else 10% Rare, else 20% Uncommon, else 40% Common. 1 in 10,000 is Shiny. (owner, 2026-11-13) These are the defaults: each neighborhood sets its own chances, Shiny chance and animal (see the zone builder); the Odds menu shows the neighborhood you're in. Delivering in the same area again is how you chase a rarer one. Each new mount gets the unboxing in the
  opening sequence; an Epic, Legendary or Shiny one is announced to the server.

- **Luck** (the tier's, plus Lucky Stamps) weights each roll by (1 + luck) to the power of its rank, then the odds are
  scaled back to 100%. Lucky Stamps at level 10 takes Legendary from 1% to 3% on a Bronze parcel.
- A roll that just missed Legendary hangs on it for a moment before landing (near miss).
- The Odds menu always shows the current odds for every tier, the Express bonus and the mount chance for each rarity.

## Mounts

- (owner, 2026-11-11) **Trails:** one more to unlock every five areas opened; with five areas, the **Cloud Trail** (soft
  white puffs behind) once the Floating Islands are open; (owner, 2026-11-12) the **Comet Trail** (twinkling stars) once
  the Moon Garden is. (owner, 2026-11-12) More are bought with Aura (the Stable):
  Spark 2,500, Bubble 6,000, Heart 15,000, Flame 40,000 (kept in the courier's `trails`). Any mount can wear any unlocked trail (its button in the
  Stable, on or off); everyone sees it.

- (owner, 2026-11-11) **A gift on the second delivery** (a new courier carries one parcel, so that's the second run):
  a mount, (owner, 2026-11-16) a Main Street **Dog, Uncommon at least** (the gift's rarity when it's opened, if
  better), shown in a pink box after you close the roll's card.
- One equipped mount, seen by everyone; the rest wait in the Stable menu. (owner, 2026-11-11) **No mount levels: the
  rarity decides.** A mount's size is 1 + 0.25 x rarity (Common 1x, Legendary 2x); the rider stays the same size.
- (owner, 2026-11-17) **The critter models:** every mount and Main Street chaser is a chunky block model made in Blender
  (`website/critters/*.glb`, loaded by `website/critters.js` before anything is drawn; one skinned mesh under 1,300
  triangles, its colors from a small atlas; made in studs, 0.36 m each). The kinds kept their keys in saves and took their
  models' names: dog **Corgi Pup**, cat **Kitten**, gator **Axolotl**, bear **Cheetah Cub**, wolf **Griffin Chick**, fox
  **Bunny**, raptor **Baby Raptor**, trike **Mini Trike**, trex **Frog**, unicorn **Cloud Pony** (abilities unchanged).
  The town dog, goose and goat models (and each zone's mount model for its chasers) are wired in for the town's animals,
  but no animals roam today (see Danger). Each mount carries a mail bag; the rider sits on its `RiderSeat` bone (following it as it moves), the
  parcels stack at its `ParcelStack`. A **Shiny** swaps in the model's `_shiny` atlas, (owner, 2026-11-17) saturated well past the kit's pastel, shimmers (a soft glow that breathes, with a bright glint now and then) and sparkles (more and bigger stars than before). (owner, 2026-11-17) **Each
  rarity wears its coat:** Common is the model as made; Uncommon to Legendary recolor its atlas to the kind's coat for
  that rarity (`MOUNTS[..].coats`: the body colors to the coat's body color, the pale cream parts to its trim, each
  keeping its shading; the coat's lightness is pulled halfway to the model's own so dark coats stay bright toys; eyes,
  blush and the saddle, straps, bag and rack keep theirs). Other zones' chasers and Main Street's dogs wear the coat of
  their rarity too (the town dog takes the Dog coats). Clips: idle, run (sped up with the speed), jump
  (held in the air) and the ability: Sprint and Glide loop while on; **Blink** shrinks the mount to a dot with the rider
  hidden and the jump forward happens at frame 7 (others see it reappear from there); **Double Jump** flips the mount
  while the rider stays upright. (owner, 2026-11-17) Everyone sees your Glide, Sprint and Double Jump (`mv` bits 16, 32,
  64). One material per look (kind, coat, Shiny), shared by every copy; critters off screen aren't drawn, and far ones
  animate less often (20 times a second past 70 m, 8 past 160 m). Chasers: idle, run and attack (a dog's bark-lunge as it chases, a goose's honk-flap, a
  goat's headbutt). Sky geese stay the drawn ones. If a model can't load, the drawn animal is used.
- (owner, 2026-11-11) **The mounts are the areas' animals:** Dog (Main Street), Cat (Maple Suburbs), Gator
  (Goose Marsh), Bear (Cliffside), Wolf (Floating Islands), (owner, 2026-11-12) Fox (Frostbite Fields), Raptor (Sunscorch
  Dunes), Trike (Jungle Ruins), T-Rex (Lava Flats), Unicorn (Moon Garden), each **Common to Legendary**
  (the rarity is the mount's own: its coat, its stats and its name; the town's animals of that kind and rarity wear the
  same coat). (owner, 2026-11-11) **Each animal has its own five coats**, one per rarity, chosen to suit it (`MOUNTS[..].coats`),
  Common to Legendary: Dog Tan, Chocolate, Blue Merle, Ember, Starlight; Cat Tabby, Ginger, Siamese, Lilac, Cosmic; Gator
  Green, Albino, Sapphire, Black, Magma; Bear Brown, Black, Polar, Honey, Aurora; Wolf Gray, Timber, Arctic, Shadow, Spirit; Fox Snow, Silver, Red,
  Frost, Aurora; Raptor Sand, Rust, Scarab, Sunset, Pharaoh; Trike Moss, Clay, Jade, Orchid, Temple Gold; T-Rex Ash,
  Obsidian, Ember, Molten, Inferno; Unicorn Moonbeam, Lavender, Nebula, Comet, Celestial.
  A mount is named by its coat, e.g. "Black Gator", "Shiny Spirit Wolf". A new courier starts with a Common Dog. (owner, 2026-11-11) Every mount from before (and every
  leftover egg) became a **Dog** of the same rarity and skin, once (saved data version 2), so nobody has an animal
  from an area they haven't reached.
- (owner, 2026-11-12) **The start of the run:** around the post office (west of the purple **Aura pad**, a chevron
  strip all the way across just east of the square) every mount goes the same 12 m/s. Over the
  pad its own speed switches on (a whoosh and purple sparks), for as long as you're east of it. Riding speeds up and
  stops quickly whatever the speed (grip 7x the speed, at least 70 m/s², so fast mounts don't drift; ice still slides).
- **Stats:** (owner, 2026-11-16) **every mount goes the same 16 m/s** (no more by rarity or by zone); every mount jumps 8
  and has no grip. The Stable shows a mount's **Ability** instead of a speed.
- (owner, 2026-11-16) **Abilities**, one per animal: **Sprint** (Dog, Bear, Raptor): E or the purple ability button,
  3 s at 1.7x, then 8 s to recharge (the button fills back up). **Blink** (Gator, Trike): E or the button, straight
  ahead up to 12 m at the same height, stopping short of a wall, a block or a closed gate, every 3 s; a purple puff where
  you left and where you land, others see it too. **Double Jump** (Cat, Fox, T-Rex): jump again in the air, once till
  you land (90% of a jump). **Glide** (Wolf, Unicorn): hold jump while falling: down at most 2.5 m/s, at 55% speed the
  way you steer, till you land. The ability button shows only for Sprint and Blink, and not on foot. (owner, 2026-11-17) **A respawn resets it:** coming back at the respawn point or a gate recharges Sprint and Blink at once (and ends a Sprint).
- **Jumping** (owner, 2026-11-13): Space (or Jump, (owner, 2026-11-14) the big button now) jumps by the mount's Jump.
  **A jump keeps its speed:** in the air
  you carry on at the speed you left the ground with (letting go doesn't stop you), and the controls only steer gently.
  (owner, 2026-11-13) **Coyote time:** both jumps still work for 0.15 s after you run off an edge. **Landing
  forgiveness:** a block's or a podium's top reaches 5% past its sides for standing on (2.5% of its width on each side),
  so a near miss still lands; bumping into its sides uses the real block. Roofs and other pieces aren't widened.
  (owner, 2026-11-13) **No sliding off edges by accident:** on the ground with no direction held (say, just after a
  landing), you can still slide, but you stop at the edge of whatever you're standing on instead of going over; holding
  a direction (or jumping) takes you off as usual.
- Legendary: a glowing name tag and sparkling footsteps.
- **Whistle** calls your mount. A stun knocks you off; you get up on foot (5.5 m/s) and the mount comes back when you
  whistle (owner, 2026-11-11: instantly, even while still stunned), when you reach it, or by itself after about 2 s.
- Every mount fits every shortcut. Kinds differ only by look (and home zone); rarity sets the stats.

## Cannons (owner, 2026-11-16)

- **Unlocking:** standing by a Cannon Unlock shows "<neighborhood> Cannon" and Unlock with its price: 2,000 x 1.35^n
  Aura for neighborhood n (rounded to 100: neighborhood 5 is 9,000). Unlocked cannons are kept in your data
  (`cannons`).
- (owner, 2026-11-17) **Cannon Plots:** the builder places Cannon Plots (Shortcuts menu) anywhere: a 10 m fenced lot
  with "Cannon Plot" over it. Standing on or by one for sale (when you don't own one yet) shows Cannon Plot and Buy
  (7,500 Aura, the same for all). A plot has one owner (kept in the town's build: `ow`, `on` on the plot), shown by
  their name over it; one plot each.
- **Your plot's cannon:** standing by your plot shows your name, None and each cannon you've unlocked; picking one puts
  that cannon on the plot (its low base is solid), None takes it off. Swap any time.
- **Cannons** (owner, 2026-11-16) face the Cannon Pad they fire you to, whichever way the plot is turned. (owner, 2026-11-17) The town kit's
  cannon (turret on a turntable, barrel up 45 degrees, its launch pad behind, centered on the plot at 0.9 size) in
  the metal of the neighborhood it fires to: Bronze (1-2), Silver (3-4), Gold (5-6), Diamond (7-8), Rainbow (9); a
  Cannon Unlock's little turning one too. **Only its owner
  fires it:** touch it and you're inside while the fuse fizzes and sparkles (1.3 s; sparks at the breech;
  the camera turns to watch from behind and to the side), then BOOM (smoke, a flash, a shake; the kit's fire clip, its
  wind-up timed so its BOOM is the launch) and you fly in an arc to that neighborhood's Cannon Pad (2.4 s). Other couriers see the cannon go off and
  you vanish until you land.

## Aura and the podiums

- (owner, 2026-11-12) **Aura** (a shiny purple orb) is the money: it replaced coins one for one (the saved field is
  still `coins`). Deliveries, gifts, geese and everything else that paid coins pay Aura; the farther the area, the more
  a delivery pays (its tier). Aura buys courier upgrades, carry levels on a mount, and trails.
- (owner, 2026-11-16) **The podiums: Aura Farming.** Three plain marble podiums (tallest first). Stand on a free one, on
  your mount or on foot, and it's yours while you stay on it (stepping off or being kicked off frees it; one at a time).
  Every 10 s held pays you 2 x 2^rarity x (3 if Shiny) x (1 + 0.5 x its area) Aura, by the mount you ride. While you
  hold one, standing still on your mount, your courier strikes a new pose every few seconds (arms up, a flex, a wave,
  standing up surfing, a point) for everyone to see.

## Merging and skins

- (owner, 2026-11-12) **The Stable stacks identical mounts** (kind, coat, skin, Aura levels and trail) in one tile with
  a count (x3); selecting it shows one of them (the ridden one if it's there).

- (owner, 2026-11-11) **Two skins only: normal and Shiny.** 1 in 10,000 new mounts is **Shiny**: the same coat, but
  little stars twinkle on and around it all the time (in town, for everyone; its pictures have sparkles too). A Shiny
  drop is announced to the server.
- **Merging mounts:** the same mounts (kind, coat and skin) merge (the Stable's Merge button, on any of them) into the
  one you chose, which goes up to the next coat (rarity) and keeps its skin. (owner, 2026-11-12) How many: 2 Commons make
  an Uncommon, 4 Uncommons a Rare, 8 Rares an Epic, 16 Epics a Legendary (`fuseN`); two Tan Dogs make a Chocolate Dog,
  two Shiny Tan Dogs a Shiny Chocolate Dog. A Legendary can't merge. (owner, 2026-11-12) It keeps the best carry and
  levels of the ones merged. (owner, 2026-11-12) **Merge all** (the Stable, when there's a merge to make) makes every merge
  there is, Commons first so what they make can merge on up; in each group it keeps the ridden one if it's there, else
  the one with the most Aura levels. **Selling:** any mount but the one you ride (and never your last) sells for Aura
  by rarity: 15 / 60 / 250 / 1,000 / 4,000, x5 Shiny (the Stable's Sell button). An Epic, Legendary or Shiny made by merging is announced. Up to 120 mounts (owner, 2026-11-17: room for every kind, rarity and Shiny).

## The tutorial

(owner, 2026-11-11) A courier with no deliveries gets five short cards at the bottom of the screen (on narrow phones,
under the parcel card), each with its own words (the owner asked for this explanation, an exception to "no helper
text"): **Pick up parcels** (the ground arrow points at your parcel on the counter), **Drop them off**, **Open your
parcels** (the parcels on the left outlined), **Stable** and **Upgrades** (their buttons outlined in pink). The first three move on when you do them; the rest with Next. Skip ends it. It's shown once (saved
as a setting).

## The town: the zone builder

(owner, 2026-11-13) **The world is in the sky and an admin places everything** ("you make the mechanics, I place
them"; "start the world on one 1m block, and let me place EVERYTHING"). Nothing is fixed: a world with nothing placed
is one 1 m grass block (`SEED`) to stand on, with sky all round. Everything is a placed piece kept on the server (table
`pet_build`, one row; `W.build` / `setBuild`), the same for everyone, and changes for everyone at once.

- (owner, 2026-11-17) **The town kit:** pines, houses, the cannon, the post office and the parcel are chunky toy
  models made in Blender (`website/town/*.glb`, loaded by `website/town.js` before anything is drawn; made in studs of
  0.36 m, all colored from one shared atlas; a variant atlas recolors a roof or a cannon's metal). A **Tree** is one of
  five pines and a **House** one of five houses with one of five roof colors (red, blue, teal, purple, orange), both
  picked by the piece's id. The houses come without the kit's own mailbox, path and delivery pad (owner: the placed
  Mailbox pieces stay the addresses), shrunk where needed to fit the 8 m house lot. The **post office** is the kit's
  (about 28 x 20 m, 10 m tall) with its conveyor running out of the loading door along the piece's x = 0 (`PO_LOCAL`:
  the building west and behind, the belt's top 1.19 m, your Ready parcel comes out at the door and stops at the pickup
  point by the bumper); its belt's stripes scroll as a parcel comes out. **Parcels** are the kit's taped box, its
  cardboard in the tier's color (Express still has its blue band). If a model can't load, the drawn piece is used.
- **Pieces** (on a 1 m grid; quarter turns):
  - **Block:** W x H x D metres (1 to 60 each) of a material: grass, dirt, stone, brick, wood, road, sand, snow, ice,
    water. (owner, 2026-11-17) Blocks have soft gradients like the town kit's models: their sides darken toward the
    foot and their tops drift gently lighter and darker in broad patches (strongest on grass). You stand on its top and it stops you from the side (you can go under one in the air). Ice is slippery
    (12% grip), sand 80% speed, water 50%.
  - **Post Office:** the building, its conveyor and counter, and the safe zone (20 m round it), turned as placed. One
    at a time (a new one replaces it). None: no conveyor, no parcels, no safe zone.
  - **Respawn:** where couriers appear and come back to (after a run, a fall, the balloon), facing the way its arrow
    points, with the camera straight behind them looking the same way, (owner, 2026-11-14) 30 degrees
    down (also after falling below the town). (owner, 2026-11-13) It turns all the way round:
    holding R turns it (a full turn in 3 s), ⟳ steps it 45 degrees; only builders see it (in build mode).
    One at a time; none: on the first block.
  - **Podium:** up to three (marble; 1.6 / 1.1 / 0.7 m high in the order placed): couriers stand on them to Aura Farm
    (see Aura and the podiums).
  - **Start Line:** a purple chevron strip 8 m across, 2 m deep: crossing one switches on your mount's own speed until
    you're back at the post office (before it, every mount goes 12 m/s). No start lines: always its own speed.
  - **Boost:** a yellow chevron pad: x1.6 speed for a moment, the way it points.
  - **Tree:** solid, 6.5 m tall.
  - **House:** 8 x 8 m, solid, in its neighborhood's colors; turned to face its door.
  - (owner, 2026-11-16) **Cannon Unlock:** a pedestal with a little spinning cannon and "<neighborhood> Cannon": it
    unlocks the cannon of the neighborhood whose bounds it stands in (the owner places one every 5 neighborhoods).
  - (owner, 2026-11-16) **Cannon Pad:** a target on the ground, only builders see it: where that neighborhood's cannon lands you (one per
    neighborhood that has an unlock; the first placed counts).
  - **Mailbox:** an **address** in the neighborhood it stands in: parcels of that neighborhood's tier go to its
    mailboxes, named in order of placing with the neighborhood's name ("1 Main Street", "2 Main Street", "1 Maple
    Suburbs"...). No mailboxes in a neighborhood: no parcels for it. A mailbox taken away loses the parcels going to it.
  - **Gate:** 8 m wide, 7 m high, posts and a beam with (owner, 2026-11-13) **a holographic boundary**
    ((owner, 2026-11-14) in the neighborhood's own gate color: blue, pink, yellow, green, purple, orange, cyan, red,
    lime for neighborhoods 1 to 9, so two gates in a row never match; a bound wall takes its gate's color) (see-through
    blue, scan lines drifting up) and a padlock: closed (it stops you) until you've opened the neighborhood it's in ((owner, 2026-11-16) whose bounds it stands in)
    (an Uncommon or better of the one before's animal; see Parcels); then only its posts and beam. A newly opened
    neighborhood's showing flies to its gate as it opens.
  - (owner, 2026-11-16) In the builder, aiming passes through a gate's or wall's boundary (pieces don't snap to it);
    Select and Erase still pick it.
  - (owner, 2026-11-14) **A locked gate's (or wall's) boundary runs all the way up and down:** it stops you at any
    height (no jumping over or dropping under it) and is drawn fading out within 24 m above and below; unlocked, it's
    gone completely (a gate keeps its posts and beam).
  - **Wall** (owner, 2026-11-13, "bound walls"): the same blue boundary, 7 m high and 1 to 60 m long (L), no posts:
    closed like a gate of its neighborhood until that's open, then gone.
  - **Pipe** (owner, 2026-11-13, "pipe shortcuts"): a green pipe on its side (3.2 m across, 4 m long, solid), its mouth
    the way it's turned. **Shift-click two pipes** in the builder (they show as holograms; a third replaces the first)
    and a prompt offers **Link** (Unlink if those two are already joined); a pipe joins one other at a time. Linked
    pipes are bright green: riding into one's mouth brings you out 2 m in front of the other's, facing out of it and
    keeping your speed (once a second). Unlinked pipes are grey-green and go nowhere.
  - **Hazards** (owner, 2026-11-13):
    - **Block materials:** Mud (slows you), Ice (you slide), Water ((owner, 2026-11-16) see-through and **swimmable**: inside it you go 35% speed and (owner, 2026-11-17) float up to the top, bobbing with the surface at your chest; a jump there leaps out; all the water is drawn as one body, a meter at a time, with faces only where water meets something else, so joined or overlapping water blocks show no seams or doubled layers; (owner, 2026-11-17) where another block takes the same space, there's no water drawn there and no water face against it) and
      Turbine (a spinning fan on top; its updraft, 12 m high over the block, blows you up into the air).
    - **Gust:** a box of wind (W / H / D, like a block) that blows the way it's turned (hold R to turn it, any angle)
      for 1.6 s out of every few seconds (the same moment for everyone), pushing riders inside. Players see its wind
      streaks; only builders see its box and arrow. Selected (Select tile): its size, Every (the interval, 0.5 to
      30 s) and Power (1 to 60), and R (held) or the turn button turns it.
    - **Platform:** a block (W / H / D, any material but Turbine) going back and forth between where it was placed (A)
      and B at its Speed (m/s), resting 0.6 s at each end; riders standing on it go along. Selected (Select tile): its size, material, Speed, and the pin:
      (owner, 2026-11-14) while picking B a ghost of the platform follows the pointer with a dashed line from A showing
      the path, and a click sets B. Builders see B as a yellow ghost with a dashed line. Its sides don't stop you (only its top holds you).
      (owner, 2026-11-14) **Breaking** (selected: the Never Breaks / Break On Step / Prolonged Step button, then Timer
      and Respawn): **Break On Step** shakes once someone first stands on it and breaks Timer s later; **Prolonged
      Step** shakes while stood on and breaks once it's been stood on for Timer s in all; broken, it's gone (riders on
      it fall) until it comes back Respawn s later (No Respawn: gone until the town is rebuilt). The server keeps the
      state for each room, so everyone sees the same. (owner, 2026-11-14) While it's about to break it shakes harder
      as its timer runs out and dark cracks spread over it. **Its kind is picked before placing** (the Platform tile's
      bar: Moving or Static, Speed, the breaking button, Timer, Respawn); placing a Moving one selects it and goes
      straight on to picking its B.
  - **Bounds** (owner, 2026-11-13): a rectangle (up to 1000 x 1000 m, any height) for a neighborhood. **Anything inside
    belongs to that neighborhood** (where bounds overlap, the smallest wins); (owner, 2026-11-17) outside every bounds is **Spawn**: it plays as Main Street but has no deliveries (a mailbox there is
    no address).
- **The neighborhood a spot is in** is its bounds' (above): it names the mailboxes and colors the houses, and sets the
  the sky color.
- **Each neighborhood's settings** (owner, 2026-11-13; saved with the pieces): its name, the animal its parcels bring and
  each rarity's chance and the Shiny chance for those mounts, and (owner, 2026-11-13) **up to 5 cinematic shots**: each a short name (what
  it shows: "Wind", "Platforms"...) and a point. When the neighborhood opens, after its gate bursts open, the showing
  goes through each shot in order: the camera circles the point (about 4 s) with the shot's name over the
  neighborhood's. In the ⚙ panel: Shots, + (a new shot; the next left click in the world sets its point), each row's
  name, ▶ (plays that shot now, as typed, saved or not), 📍 (pick its point again) and ✕; Save keeps them. While building, the edited neighborhood's shot points show
  as rings with a post and their number and name ((owner, 2026-11-14) and a little camera; never shown to players). (owner, 2026-11-14)
  **Shots are things in the world too:** (owner, 2026-11-14) they're added only from the panel's shot list (no Shot
  tile); click a shot to pick it and drag its **move arrows** (red east-west, blue north-south, green up-down, like
  an editor's move tool, the same size on screen at any distance) to move it a meter at a time, saved as you let go;
  Delete (or Backspace) takes the picked shot away (defaults: the zone names, each zone's animal, 40 / 20 /
  10 / 5 / 1%, 1 in 10,000). The Odds menu's tier names are the neighborhoods' names.
- **Building** (admins; (owner, 2026-11-13) the Build button on screen, a hammer under the menu buttons; "no need for
  phone editor": building is for a computer, an exception to mobile parity): the freecam (fly where you look: WASD,
  Space or E up, C or Q down, Shift faster; drag to look) and a bar at the bottom, (owner, 2026-11-14) starting on **Select**: click any piece to select it (a yellow outline;
  empty space lets go) and the bar shows what it has to change: W / H / D, material, L (a wall), a gust's Every and
  Power, a platform's Speed and B, a turn (R too), Delete (the Delete key too) and Deselect; the other tiles place
  pieces; (owner, 2026-11-14) while a piece is selected the tiles go and the bar shows only its settings. The mouse
  wheel (while building) raises or lowers where the next piece goes, a meter a notch (the blueprint shows it)
  ((owner, 2026-11-13) every piece a rounded tile with a picture of
  the piece and its name under it), (owner, 2026-11-16) **The inspector:** a panel on the right shows everything about the selected piece or bounds (Position, Size, Angle or Facing, Material, Neighborhood, a gust's Every and Power, a platform's B offset and Pick B, Speed, Breaks, Timer, Respawn, a house's Owner; Delete, Deselect), all typed in or picked from lists, or the settings the picked Block, Gust, Platform or Wall tile places with; the bar keeps just the menus, the tiles and the neighborhood. Tiles (owner, 2026-11-16) in menus (**Ground**: Block, Wall, Gate, Bounds, Respawn Box; **Town**: House, Mailbox, Tree, Post Office,
  Respawn, Podium, Start Line; **Hazards**: Gust, Platform, Boost; **Shortcuts**: Pipe, Cannon Unlock, Cannon Pad), with
  Select first and Erase last whichever menu is open ((owner, 2026-11-14) no
  turn or close buttons: R turns, Escape, B or the Build button closes); under it **the neighborhood you're editing**
  (− name +) and ⚙, then (owner, 2026-11-14) W / H / L typed into one box side by side and the material for a block,
  L for a wall (W / L for bounds). (owner, 2026-11-14) **A piece placed inside a neighborhood's bounds makes that the
  neighborhood you're editing** (gates and walls don't switch it). **The ⚙ panel opens on the
  right of the screen.** (owner, 2026-11-13) Bounds are placed for the neighborhood you're editing; (owner, 2026-11-17) **Sculpting with blocks.** The Block tool
  places a square box: **Ctrl+wheel sets its size** (1 x 1, 2 x 2, 3 x 3...), **the wheel sets its level**, the
  inspector its Height and Material (and shows Size and Level too); it shows where it'll go (red outside bounds). Click
  for one, or hold and drag to draw squares in a row; on release a drawn outline that closes is **filled in**, and the
  new blocks plus every block of the same material they touch (and the ones those touch) are redone as **the fewest
  boxes** found (any shape, any heights: a 3 x 3 x 3 with a corner cut is a 3 x 3 x 2, a 3 x 2 and a 2 x 1). **The
  eraser** works the same way (size, level, height; click or drag, shown red) and cuts its boxes out of the blocks
  there, **this material** (the inspector's) or **all blocks**, redoing what's left as fewest boxes; over any other
  piece it erases that piece, as before. Each placing or cutting is one undo. While building, a respawn doesn't turn
  the camera. (owner, 2026-11-16) **pieces go only
  inside a neighborhood's bounds** (bounds and respawn boxes anywhere): outside, the hologram is red and nothing is
  placed. (owner, 2026-11-17) **Build Outside Bounds** (a button on the builder's bottom row, on or off) lets pieces go
  anywhere: outside, they're Spawn's (placed pieces there show no red, except a mailbox: it gets no deliveries). The
  inspector shows every piece's Neighborhood (Spawn outside every bounds). (owner, 2026-11-17) Blocks, trees and houses are drawn instanced (each
  mesh-and-material once, however many copies; aiming finds the piece by its instance), and the water body is only
  worked out again when a block changed. A piece belongs to whichever neighborhood's
  bounds it's in now. **A gate (or bound wall) belongs to and unlocks the neighborhood whose
  bounds it stands in** (outside any: the one it was placed in), and **the next neighborhood can't be picked for
  editing until this one (past Main Street) has a gate**. **⚙** opens that neighborhood's panel: name, animal, each rarity's
  chance (%), Shiny "1 in" (0: never), Save. **Bounds** (seen only while building: a see-through box in the
  neighborhood's color with its name; the edited neighborhood's brighter, the picked one outlined yellow): a left drag
  on open space draws new ones; **they can be edited after**: click bounds to pick them (that neighborhood becomes the
  one you're editing), drag inside to move them, drag an edge (within 1.5 m) to move that side; W / D for the picked
  bounds, Delete (or the Delete / Backspace key) takes them away; moving and resizing undo and redo too. While building,
  every gate and wall shows. **The preview is a blueprint hologram** of the piece itself (see-through blue with glowing edges; red for what
  Erase or Cut takes); (owner, 2026-11-13) the left button places, and **dragging with it keeps placing** on the level
  the drag started at (never on top of what the same drag placed; with Erase it erases what it passes over); the right
  button turns the camera. No browser menu on a right click anywhere in the game. **Everything turns** in quarter turns (a block's W and D swap; the post office
  with its conveyor; the respawn point sets the way couriers face, an arrow on it). A block goes against the face
  pointed at (on top, under, or beside it), or on the level of the first block (y 0) in open air; the rest stand on
  what's pointed at. **Ctrl+C** copies the pointed-at piece, **Ctrl+X** cuts it, **Ctrl+V** pastes (a hologram of it
  follows; a click places it, turned with ⟳), **Ctrl+Z** undoes your last place or erase, **Ctrl+Shift+Z** (or Ctrl+Y)
  redoes. Placing a post office or respawn point replaces the old one (undo brings it back). Up to 6,000 pieces.
  Erasing everything leaves the one block.
- **Falling off** (below 20 m down, `EDGE_Y`) sends you back to the respawn point; (owner, 2026-11-14) you keep the
  parcels you carry and go on with them. (owner, 2026-11-16) **Carrying a parcel in a neighborhood that has a gate**,
  you come back at its gate instead (the nearest gate into it), just inside, facing in. (owner, 2026-11-16) **Respawn boxes** (the
  builder's Respawn Box, under Ground: a see-through red box only builders see, any size, for a neighborhood) do the
  same at once: touching one counts as falling off (its neighborhood's gate if you carry a parcel, else the respawn
  point), so you don't fall for a while first. A box over the spot it would send you back to does nothing. (owner, 2026-11-16) With the
  Respawn Box tile, clicking a box picks it (open space lets go and places a new one, picked); the inspector edits it.
  **Picked bounds or a picked respawn box** (also with Select) show a small white square in the middle of each face
  (bounds: their four sides; a respawn box: all six): drag one to move that face, the opposite one staying put. **Drop** (the button beside the parcel counter) lets go of every parcel you
  carry (no banner), so you can take new ones.

## Danger

- (owner, 2026-11-13) **No animals roam the town any more** (no chasers, geese or goats; no falling rocks or sky geese).
  Each zone's animal is still the mount its parcels bring (see Mounts). The dangers left: other couriers' bonks, the
  edges, and what's built (ice, water, sand). The attack-queue, calm and shake-off rules stay in the code for when
  hazards come back.
- (owner, 2026-11-11) A mount is as wide as it looks: the bigger it has grown, the farther from a wall it stops (0.55 m
  on foot and when Common, up to about 1 m).

## Couriers and each other

- (owner, 2026-11-14) **Kicking is back, against other couriers:** F or the boot button (bottom right, beside Jump),
  once in 4 s. The server picks the nearest courier within 3.6 m in front of you (any height within 2.5 m): it throws
  them off their mount (14 m/s away from you, 9 m/s up), tumbling as a ragdoll (limbs flailing) for 1.4 s, then
  they're on foot: they get up and whistle their mount back (Q, or it comes by itself a moment later); thrown off the
  edge of the town, they're back at the respawn point (with their parcels). (owner, 2026-11-14) The kicked courier
  sees a short shot round their own tumbling ragdoll ("KICKED!" and the kicker's name); the kicker gets no shot, just a
  heavy hit (a held frame, a hard shake, a white flash, a burst and "KICK!" over the courier kicked). Never a party member, never at the post office, and a kicked courier
  can't be kicked again for 4 s after getting up. (owner, 2026-11-17) **Fair kicking:** one kick every 4 s; kicking the
  same courier again within 60 s is weaker each time (65% of the last throw), and after 3 it doesn't work on them
  until the minute clears; couriers with fewer than 5 deliveries can't be kicked; tapping a courier shows **Block**
  (Unblock): neither of you can kick the other, you don't get each other's chat, and they can't invite you (kept in
  your data, up to 200). No parcel damage, no Aura. (The 2026-11-13 bonk, its Aura and the
  Friendly setting stay gone.)

## Courier upgrades

Ten levels each; a level costs base x 1.8^(level it's bought at).

| Upgrade | Base | Does |
| --- | --- | --- |
| Payout | 300 | +10% delivery coins per level |
| Lucky Stamps | 500 | luck on every roll (Legendary 1% to 3%) |
| Sturdy Boxes | 350 | +1 durability at level 5 and at level 10 |

The total of all levels (of 30) is the **postmaster rank**, a badge on the name tag: Bronze from 1, Silver 8, Gold 15,
Platinum 23. (owner, 2026-11-11) The Coupon Press went with mount levels; its coins came back once. (owner, 2026-11-11) Route Permits went (districts open with mount levels); a courier who had bought any
gets those coins back the next time their data loads.

## The screen

- Aura top left (it counts up; orbs fly to it). Chat button under it. Delivered parcels down the left.
- (owner, 2026-11-14) **The zone slider**, bottom center (once two or more zones with mailboxes are open; hidden while the tutorial shows): one step
  per open zone with mailboxes, its name above. The top step (where it starts) is the usual mix; a lower step picks that
  zone and every parcel on the conveyor comes from it (the conveyor follows at once), to farm it. While a zone is
  picked, its gifts don't get the bottom-of-range raise for the zones opened past it.
- (owner, 2026-11-14) The parcel counter top center: a parcel icon and how many you carry of how many (the old parcel
  card's rows, with tier, pips, address, distance and countdown, are gone).
- (owner, 2026-11-14) Admins only: the Odds button (players don't see the rarity chart), and B opens or closes the build
  menu.
- Bottom right: Jump (the big button), Kick beside it, Whistle above.
- (owner, 2026-11-13) **Icons are drawn symbols** (website/icons.js): a barn for the Stable, a green up arrow for
  Upgrades, a die for Odds, a cog for Settings, a hammer for Build, a speech bubble for chat, a whistle, an arrow for
  Jump; the builder's turn, close, neighborhood (cog) and shot point (pin) buttons too.
- Right edge: Stable, Upgrades, Odds, Settings (music and SFX volume, shirt color, Admin for staff, Log out).
- Controls: WASD or arrows, Space to jump, F kick, Q whistle, Enter chat; drag to look, wheel to zoom. Touch:
  a thumb joystick on the left, drag to look, pinch to zoom, the buttons.
- No helper text anywhere; buttons and tooltips are names only.

**Feel:** Next pops; grabbing squashes the mount and chimes; boosts streak, widen the view and whoosh; a dog's "!" and
bark; a hit shakes the screen, flashes red and shows "-20%"; a break bursts into splinters; stars over a stunned
courier; "KICK!" with a 0.05 s hold; a goose's honk, and feathers when it's busted; confetti and flying coins on
delivery; the roll's ticks, near miss and a burst in the rarity's color (Common white, Uncommon green, Rare blue, Epic
purple, Legendary gold); an egg popping out; the hatch; "LEVEL UP!" with a ring; sparkles on an upgrade; the Sky
Cannon's boom. (owner, 2026-11-11: more umph, and moments for the big things)
- **Opening a parcel** builds up longer the rarer it is (2.2 s + 0.35 s a rank), with spinning rays in its color
  behind it, a heartbeat from Rare and the screen shaking from Epic; the reveal flashes, throws confetti (more the
  rarer), and from Rare says the rarity big; Epic and Legendary add a fanfare. A Rare or better delivery bursts bigger
  over the mailbox; Epic and Legendary say "EPIC PARCEL!" / "LEGENDARY PARCEL!".
- **A new mount** (hatched, merged or a gift), after the egg or box opens: it drops in spinning over rays with
  confetti (a fanfare for Epic, Legendary and the special skins); the first of its kind says NEW!.
- **A newly opened area** gets a short showing (about 9 s, letterbox bars, the HUD hidden, a tap or a key skips): the
  camera flies to its gate as it bursts open (its name and "OPEN!"), round its rarest chaser (the kind and its
  rarity), then to its other dangers: Suburbs geese and sprinklers; Marsh geese and mud; Cliffside goats and falling
  rocks; Islands wind and sky geese. Not when logging in. (owner, 2026-11-12) It waits until every parcel has been opened and
  every window is closed (the reward screen, a new mount or merge, the menus), then a moment more. Floating numbers rise and fade in 0.8 s. Every sound is made in the page (no files); music is a small
loop. (owner, 2026-11-11) The same tune in every area, a little different in each, switching at the next loop: Main
Street as it is; Maple Suburbs with a soft chime an octave up; Goose Marsh a touch slower and reedy with a bluesy note
or two; Cliffside brassier over a deeper bass; the Floating Islands an octave up, airy, with an echo.
(owner, 2026-11-14) **Five tunes** take turns (a random one first, each playing 8 loops before the next), all made the
same way and voiced by the zone as above; each zone also changes a small part of every tune: the last four notes of
each loop move up or down by the zone's own interval (none on Main Street).

## Co-op

- Rooms of up to 100 couriers share one town. Positions go out 10 times a second; dogs, geese and goats are the
  room's, run by the server 20 times a second.
- (owner, 2026-11-11: others rode sideways) Facing is sent as an angle within one turn (the server wraps any angle;
  it used to clamp it, which left a courier who had turned round a few times facing the wrong way for everyone else).
- Chat (Enter or the button); a bubble over the speaker.
- Parties: tap a courier, then Party; they accept or decline. Up to 6.
- A new website build reloads everyone onto it.

## The server decides

The page may ask: grab, equip, merge, a trail, open parcels, buy an upgrade, change
a setting, the sewer pipe, the balloon. Everything else (parcels, addresses, deliveries, rolls, damage, stuns, coins)
is the server's. Checks: a grab only near the conveyor; a delivery only in the right mailbox's ring with an unbroken
parcel; coins for every purchase; a speed cap (anything over 110 m/s is flagged and blocks
deliveries for 2 s).

## Accounts and saving

- A username (3-16 letters, numbers or _) and a password; the browser remembers a token.
- (owner, 2026-11-11) **Fresh start, logins kept:** accounts and passwords carried over; every courier starts with a
  Pup and 0 coins. A courier's data is its own column (`courier`) on `pet_accounts`; the old game's `data` column and
  the `pet_world` table are left in the database untouched, unused.
- Saved: coins, mounts (id, kind, rarity, variant, trail), the equipped mount, upgrades, unopened parcels,
  stats (deliveries, Golden parcels, geese busted, kicks landed), settings, failed runs in a row. Not
  saved: the parcels you carry and the conveyor's parcels.
- Purchases and hatches save at once; everything else every 60 s and when you leave.

## Staff

Nyssary is always admin and the only one who makes or removes admins; admins make moderators; moderators (and up)
mute, kick and ban those below them. The Admin panel (Settings): find a courier, mute / kick / ban, role, give (coins,
a mount of a kind, rarity and variant), quick commands (coins, all mounts (every kind at every rarity, normal and Shiny), upgrades,
everything, **Reset to new player**: owner, 2026-11-11, a brand new courier in every way: coins,
mounts, upgrades, unopened parcels, the parcels being carried and on the conveyor, stats, settings and the
tutorial; their page reloads as a new courier), and edit coins. Everything is logged (`pet_admin_log`).
- (owner, 2026-11-12) **Freecam** (admins, the Admin panel's top button): the camera leaves your courier and flies where
  you look: WASD or the stick, Space up, C down, Shift 3x faster, drag to look (up and down too); Escape or the button
  again ends it. Your courier stays where it was.

## Pet Delivery Co. at /pokemon

(owner, 2026-11-11) The game from before the remake runs again at atamus.io/pokemon, on its own socket (`/pokemon`) and
its own fresh saves, with the same logins. It is described in `docs/POKEMON.md`; nothing of it is shared with Critter
Courier's rules.

## Rejected / removed

- (owner, 2026-11-17) **Buying a Main Street house for a cannon** (2026-11-16): cannons go on Cannon Plots instead. A
  house still holding an owner refunds them 7,500 Aura when they next log in and goes back to a plain house.
- (owner, 2026-11-17) **Outside every bounds counting as Main Street:** it's Spawn now, with no deliveries (a mailbox
  there is no address); and the builder's red for pieces outside the bounds.

- (owner, 2026-11-16) The podiums showing the server's three best mounts (gold, silver, bronze) and paying their
  couriers: now couriers stand on them to Aura Farm.
- (owner, 2026-11-14) Mount Jump and Grip levels (by rarity and area) and their bars; the Aura Boost (speed) levels
  bought on a mount.

- (owner, 2026-11-14) Mounts going faster short of their own zone and slower past it; gift coins scaling with the
  square root of the tier's multiplier.

- (owner, 2026-11-14) **The Big Jump** (F, the big button); losing your parcels when you fall off the town.

- (owner, 2026-11-14) The parcel card's per-parcel rows (tier, durability pips, address, distance, Express countdown):
  replaced by just a counter. The Odds menu for players.

- (owner, 2026-11-13) **Mount abilities** (Bark, Double Jump, Dash, Tough Hide, Howl, Vanish, Pounce, Charge, Roar,
  Blink; (owner, 2026-11-16) four movement abilities came back, see Abilities) and **bonking** (the kick: stuns, cracked parcels, bonk Aura and its pop, grace, the Friendly setting):
  replaced by the Big Jump on every mount.

- (owner, 2026-11-13) **The hand-built town** (Main Street, Maple Suburbs, Goose Marsh, Cliffside, the Floating Islands
  and zones 6 to 10 with their houses, roads, hedges, ponds, mud, sprinklers, boost pads, jump pads, the Sky Cannon,
  the zipline, the balloon, wind, ice, sand, rivers, lava, low gravity and scenery; the gates across it) and **every
  roaming animal** (each zone's chasers, geese, goats, falling rocks, sky geese); the fixed post office square and the
  Aura pad round it: replaced by the zone builder, starting from one block in the sky. The zones' sky colors stay.

- (owner, 2026-11-12) The sewer pipe and the zipline tower (shortcuts); the walls round the outside of the town (ride
  off the edge to start a run over).

- (owner, 2026-11-12) The balloons on the last Floating Island and at Frostbite Fields' start: the only balloon is at
  the end of all the zones.

- (owner, 2026-11-12) **Coins** (now Aura); carrying set by rarity (now 1 for every mount, raised with Aura); each
  area's animal being faster than the last (now the same base speed, faster short of its own area and slower past it).

- (owner, 2026-11-11) A second screen for each new mount's unboxing after the parcels open (now shown in its card);
  abilities locked on Common mounts.

- (owner, 2026-11-11) Opening a run's parcels one after another (now all at once, each in its own card); one big box on
  the saddle for several parcels (a box each again); mount chances by parcel rarity (5% to 75%) with the rarity picked
  evenly (now each rarity's own chance, from the parcel's down).

- (owner, 2026-11-11) **Mount levels** (levels 1-20, Training XP, buying levels with coins, Level Coupons, the Coupon
  Press, the level-up card): a mount's rarity (and its area) decides its speed, size, ability and carrying.

- (owner, 2026-11-11) Areas opening with mount levels (3 / 6 / 9 / 12); parcels carried by level (now by rarity);
  turning old mounts into the area animal of their rarity (they all became Dogs); tapping a parcel to open it and Open
  all (they open by themselves once you have none left to deliver).

- (owner, 2026-11-11) **Eggs** (and hatching): parcels drop mounts directly. The twelve old species (Pup, Piglet,
  Bunny, Fox, Deer, Raptor, Stegosaurus, Pony, T-Rex, Triceratops, Unicorn, and before them Parrot, Owl, Dragon): the
  mounts are the areas' animals. The faded Next parcel on the conveyor, and the stack of small boxes on the saddle.

- (owner, 2026-11-11) The **Stamp Meter** (pity: Rare at every 25 rolls below Rare, Epic at 100), its bar on the HUD
  and its tutorial card; **Route Permits** (districts open with mount levels now; their coins refunded); the **Fragile,
  Heavy and Golden** parcels (only tiers and Express stay); merging **four** mounts (now two).
- (owner, 2026-11-11) The **Golden and Rainbow** skins (owned ones became Shiny), the Shiny's lighter coat (it sparkles
  now), the 1 in 100 Shiny chance (now 1 in 10,000), the same five coats for every animal (each has its own five), and merging into a Shiny (merging raises the coat now).

- (owner, 2026-11-11) Back alleys; the wide (120 m) town; rewards rolled in full on delivery (now the rarity on
  delivery, the contents on opening).
- (owner, 2026-11-11) Gift boxes, and tapping to skip an opening's build-up (now delivered parcels with a rarity
  sparkle, and a tap speeds the build-up up).
- (owner, 2026-11-11) The big reward reel in the middle of the screen and its card, then gifts that opened themselves
  with a rarity reel (replaced by gifts showing their rarity, opened when you choose).
- (owner, 2026-11-11) One parcel at a time (now 1 to 5 by level); the long neighborhoods (20 and 30 houses) and the
  big marsh, five-terrace mountain and six islands (now three houses long each).
- (owner, 2026-11-11) The round town (the post office in the middle, Main Street and the suburbs in rings round it,
  avenues out): replaced by the town in one line.
- (owner, 2026-11-11) Flying and gliding mounts: the Parrot, Owl and Dragon, and the Glide ability.
- (owner, 2026-11-11) The edge-of-screen guide arrow (replaced by the arrow on the ground round you); the reward roll
  over the mailbox (moved to the middle of the screen, with the card of what you got); dogs waiting in yards and geese
  staying by their ponds (they roam); the bright, saturated town colors.
- (owner, 2026-11-11) **All of Pet Delivery Co.**, replaced by Critter Courier rather than merged with it: the block
  world and the Build Town editor (van points, lots), animal control (vans, helicopters, wanted stars, the pound),
  contracts, houses and plots and building inside them, the training arena, items (Speed Candy, Training Ribbon, Egg
  Ticket), Treats and the Pet Farm, the egg shop, townsfolk and the walk-through with Walt, Package Rush, trading,
  free flight, day and night and weather, the gray look, the What's New panel, VIP.
- Not in the first version (the document's "later" list): daily rewards, codes, quests.
- Stealing another courier's parcel: kicks only crack parcels.
- Mount size limits on shortcuts: every mount fits.

From the old game, for the record:


- Live (dynamic) shadows (owner, 2026-11-09): replaced by baked ones.
- The Epic rarity and 16 pets (owner, 2026-11-09): Kitten, Bunny, Fox, Otter, Penguin, Goat, Butterfly, Stegosaurus, Deer,
  Bear, Horse, Triceratops, Unicorn, Pegasus, Phoenix, Pterodactyl, Ice Dragon (moved to the new pets, above).
- Ink outlines and pencil hatching in the gray look (owner, 2026-11-09): they drew lines over flat ground on phones;
  replaced by plain shades of gray.
- The mount shop and its keeper Rusty (owner, 2026-11-09); the Water type and its pets (Duck, Sea Turtle, Sea
  Serpent; deleted from saves); whirlpool boosts; Package Rush (off, the code kept).
- The hilly town (owner, 2026-11-09): plateaus and cliffs, four big hills, winding ring roads and spokes, the small lake
  with two rivers and a terraced stream, standing rocks, and the scattered islands: replaced by the flat grid town.
- Housing plots as 16 numbered places staff put down, and choosing them by kind (first come, VIP, random, extra) (owner,
  2026-11-10): replaced by lots on every town house, taken at random.
- The flat grid town (owner, 2026-11-10): the square island 448 m across, its street grid, about 290 houses, the lake
  and river with its waterfall, the 16 floating islands, the VIP and extra islands with their lifts, and the fixed van
  routes and boost pads: replaced by the block world admins build, starting from just the square.
- Gliders (owner, 2026-11-09): Parrot, Pegasus, Phoenix and Pterodactyl fly like the other fliers; the Flier / Glider / Swimmer badges became the Ground / Air / Water types.
- Building on the lot itself on a 5 x 5 grid with a level picker (owner, 2026-11-09): replaced by the 5 houses outside and freeform building inside.
- Training for coins (owner, 2026-11-09): replaced by the training arena's obstacle course.
- The courier's cap and mail bag (owner, 2026-11-09): replaced by the R6-style figure.
- Space as a single rise per press on a flier (owner, 2026-11-09): replaced by holding Space / Shift.
- Helicopters spotting players by distance and chasing them down (owner, 2026-11-09): replaced by the searchlight.
- (owner, 2026-11-17) Riding twice as fast empty-handed.
- (owner, 2026-11-16) Mount speed by rarity (+20% a step) and by zone (+5% each zone's animal): every mount goes the
  same speed now.
