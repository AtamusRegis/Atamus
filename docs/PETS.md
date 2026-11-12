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
   game's), and the parcel card shows how far.
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
   separate unboxing to click through. A tap hurries the shaking, then closes it (it closes by itself after a few
   seconds too).
   (owner, 2026-11-11) **When the run's over** (nothing left delivered, carried, with a goose or on the ground) you're
   taken straight back to the post office. Up to 60 can wait;
   past that the oldest open by themselves.

(owner, 2026-11-12) **A stack of parcels:** every mount carries 1 parcel; Aura raises it a level at a time, up to 5
(the Stable's Carry row: 150 Aura x 4^level x (1 + 0.5 x rarity) x (1 + 0.5 x its area), so rarer and farther animals
cost more). Mounts from before kept what they carried (one per rarity rank), once. Ride back into the conveyor to load up. (owner, 2026-11-11) The mount shows **a big box for each parcel**, stacked. Each has its own address (the same neighborhood as another or a
different one), its own marker, and its own row on the parcel card (with its distance; the card shows how many of how
many). The ground arrow points to the nearest. Each delivers at its own mailbox and rolls; several rolls take turns.
A parcel that breaks or is lost is gone; the conveyor always has the next one. **Empty-handed you ride twice as fast**
(owner, 2026-11-11: parcels weigh you down; empty mounts "way faster"), so the trip back to the post office is quick.

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
- Every hit (a kick, a bite, a rock, a fall, the pipe's goose) lands on one of your parcels at random.
- Every parcel has 3 durability (Sturdy Boxes: 4 at level 5, 5 at level 10). Each hit takes 1 and 20% of the delivery
  coins; at 0 it breaks.
- (owner, 2026-11-11) Parcels differ only by tier (rarity) and timing: one parcel in five is **Express** (a countdown:
  0.16 s per meter to the address, at least 14 s, plus 8 / 40 / 45 s for the Marsh / Cliffside / Islands; no bonus if
  late; +150%). Fragile, Heavy and Golden parcels went.
- Delivery coins = 10 x tier x (1 + modifier bonus) x Payout upgrade x (1 - 0.2 per hit).

## The reward roll

| Roll | Chance | Coins (x square root of the tier's multiplier) | Also |
| --- | --- | --- | --- |
| Common | 60% | 4-10 | |
| Uncommon | 25% | 15-30 | |
| Rare | 10% | 50-100 | |
| Epic | 4% | 220-420 | |
| Legendary | 1% | 1,500-2,600 | |

- (owner, 2026-11-11) **Mounts drop from parcels:** a parcel can bring its area's animal, at the parcel's rarity or
  lower (a Legendary parcel from Main Street: a Common, Uncommon, Rare, Epic or Legendary Dog). (owner, 2026-11-11)
  (owner, 2026-11-12) Each rarity has its own chance: Common 40%, Uncommon 20%, Rare 10%, Epic 5%, Legendary 1%
  (`PET_CHANCE`). A parcel tries its own rarity first, then each one below, and gives one mount at most: a Legendary
  parcel 1% Legendary, else 5% Epic, else 10% Rare, else 20% Uncommon, else 40% Common. 1 in 10,000 is Shiny. Delivering in the same area again is how you chase a rarer one. Each new mount gets the unboxing in the
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

- (owner, 2026-11-11) **A gift on the second delivery:** a mount, that parcel's area's animal at the gift's rarity when
  it's opened, shown in a pink box after you close the roll's card.
- One equipped mount, seen by everyone; the rest wait in the Stable menu. (owner, 2026-11-11) **No mount levels: the
  rarity decides.** A mount's size is 1 + 0.25 x rarity (Common 1x, Legendary 2x); the rider stays the same size.
- (owner, 2026-11-11) **The mounts are the areas' animals:** Dog (Main Street, Bark), Cat (Maple Suburbs, Double
  Jump), Gator (Goose Marsh, Dash), Bear (Cliffside, Tough Hide), Wolf (Floating Islands, Howl), (owner, 2026-11-12) Fox (Frostbite Fields, Vanish),
  Raptor (Sunscorch Dunes, Pounce), Trike (Jungle Ruins, Charge), T-Rex (Lava Flats, Roar), Unicorn (Moon Garden, Blink), each **Common to Legendary**
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
  strip all the way across just east of the square) every mount goes the same 12 m/s (x2 empty, as anywhere). Over the
  pad its own speed switches on (a whoosh and purple sparks), for as long as you're east of it. Riding speeds up and
  stops quickly whatever the speed (grip 7x the speed, at least 70 m/s², so fast mounts don't drift; ice still slides).
- **Stats** (rarity 0-4, area a 0-4 for Dog to Wolf): (owner, 2026-11-12) Speed 12 m/s x (1 + 20% per rarity step) x
  (1 + 5% for each area its animal's own area is ahead of where it is, - 5% for each it's behind: a Wolf goes 120% on
  Main Street, a Dog 80% on the Floating Islands) x (1 + 5% per Aura **Boost** level, up to 10: the Stable's Boost row,
  100 Aura x 1.7^level x (1 + 0.5 x rarity) x (1 + 0.5 x a)); Jump 8 + 0.5 x rarity + 0.25 x a; Grip (shortens stuns) 10%
  x rarity + 3% x a.
- **Ability:** (owner, 2026-11-12) every animal its own (the button by Kick), stronger at Rare and Legendary (tier 1 /
  2 / 3: Common and Uncommon, Rare and Epic, Legendary): Dog **Bark** (animals within 10.5 / 14 / 17.5 m run home,
  geese let go of a parcel and goats back off); Cat **Double Jump** (higher at tier 2, a third at tier 3); Gator
  **Dash** (a burst of speed); Bear **Tough Hide** (3.25 / 4 / 4.75 s: nothing hits or stuns you, geese can't grab);
  Wolf **Howl** (4 / 5 / 6 s of 1.5x speed); Fox **Vanish** (3.25 / 4 / 4.75 s: animals can't see you; the ones
  after you give up); Raptor **Pounce** (a long, fast leap); Trike **Charge** (1.5 / 1.8 / 2.1 s at 1.6x: animals
  within 3 m are knocked aside, and no hits or stuns but falls); T-Rex **Roar** (animals within 15 / 18 / 21 m freeze
  for 2.5 / 3 / 3.5 s, geese drop what they hold); Unicorn **Blink** (to the farthest clear ground 13 / 16 / 19 m
  ahead). Cooldowns: Bark 12, Dash 8, Tough Hide 16, Howl 14, Vanish 14, Pounce 6, Charge 10, Roar 18, Blink 6 s,
  divided by 1 + 20% per rarity step.
- Legendary: a glowing name tag and sparkling footsteps.
- **Whistle** calls your mount. A stun knocks you off; you get up on foot (5.5 m/s) and the mount comes back when you
  whistle (owner, 2026-11-11: instantly, even while still stunned), when you reach it, or by itself after about 2 s.
- Every mount fits every shortcut. Kinds differ only by ability; rarity sets the stats.

## Aura and the podiums

- (owner, 2026-11-12) **Aura** (a shiny purple orb) is the money: it replaced coins one for one (the saved field is
  still `coins`). Deliveries, gifts, geese and everything else that paid coins pay Aura; the farther the area, the more
  a delivery pays (its tier). Aura buys courier upgrades, carry and Boost levels on a mount, and trails.
- **The podiums:** three by the post office (gold, silver, bronze). Each server's three best mounts stand on them, with
  their courier's name; each courier's best three can stand. Best: rarity, then Shiny, then the farther area, then its
  Aura levels. A better mount takes a podium from a lesser one; a tie keeps the one already standing; a courier leaving
  frees theirs. Every 10 s each podium pays its courier 2 x 2^rarity x (3 if Shiny) x (1 + 0.5 x its area) Aura.

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
  Boost levels of the ones merged. (owner, 2026-11-12) **Merge all** (the Stable, when there's a merge to make) makes every merge
  there is, Commons first so what they make can merge on up; in each group it keeps the ridden one if it's there, else
  the one with the most Aura levels. **Selling:** any mount but the one you ride (and never your last) sells for Aura
  by rarity: 15 / 60 / 250 / 1,000 / 4,000, x5 Shiny (the Stable's Sell button). An Epic, Legendary or Shiny made by merging is announced. Up to 60 mounts.

## The tutorial

(owner, 2026-11-11) A courier with no deliveries gets five short cards at the bottom of the screen (on narrow phones,
under the parcel card), each with its own words (the owner asked for this explanation, an exception to "no helper
text"): **Pick up parcels** (the ground arrow points at your parcel on the counter), **Drop them off**, **Open your
parcels** (the parcels on the left outlined), **Stable** and **Upgrades** (their buttons outlined in pink). The first three move on when you do them; the rest with Next. Skip ends it. It's shown once (saved
as a setting).

## The town

(owner, 2026-11-11) **Areas you haven't opened are there to see but closed off:** a shimmering wall with a padlock
across the town at each one's start (the Floating Islands: a bubble over the Sky Cannon). Heading east stops at it;
heading west is always fine. Ziplines, the sewer pipe and the Sky Cannon don't take you into a closed area. They go
when you open the area (an Uncommon or better of the area before's animal; see Parcels).

A fixed town made in code (`buildTown` in pets-world.js); 30 houses. (owner, 2026-11-11) **One line, short
neighborhoods, harder the farther out:** the post office at the west end, then one road east through every district;
each district is three houses long, three each side of the road (owner: "do like 3 houses long per neighbourhood").
The world is narrow (owner, 2026-11-11): 60 m across, the road down the middle, houses both sides, no back alleys, and
the going gets rougher farther out.
Each has more (and quicker) dangers than the last. (owner, 2026-11-11) Each area's animals are quicker and
trickier: dogs notice a parcel within 8 / 10 / 11 / 12 / 12 m, bark for 0.7 / 0.55 / 0.45 / 0.35 / 0.3 s, run 10.5 /
11.5 / 12.5 / 13.5 / 14.5 m/s and chase for 4 / 5 / 6 / 7 / 7 s; geese see you from 6 / 7 / 8 / 9 / 9 m, honk for
1.2 / 1 / 0.8 / 0.65 / 0.6 s and lunge at 11.5 / 13 / 14.5 / 15.5 / 16 m/s. **A mount outgrows the easier areas'
animals:** its chance to shake off a bite or a goose's grab (no stun, no hit, "SHAKEN OFF!") is 8% for every point its
power (4 x (rarity + half its area's number)) is past 4 x the animal's area number + 2 x the animal's rarity, up to 85%.

- **Post office** at the west end, on its square: the counter under an open frame. Within 20 m is the **safe zone**.
  You start just south of it, facing east down the road.
- **Main Street** (Bronze, x 40-90): 6 houses; 2 dogs.
- **Maple Suburbs** (Silver, x 120-170): 6 houses, fenced yards by the first two, two small ponds between houses
  (6 geese), 4 dogs, 4 sprinklers beside the road, and low hedges across half the road, side to side (jump or weave).
- **Goose Marsh** (Gold, x 190-290): over the bridge where the road leaves town. Mud (25% slower; 40% in a pond), a
  broken boardwalk on (gaps of mud to jump), one across the middle, 6 houses on platforms, three ponds (11 geese), 5 dogs.
- **Cliffside** (Diamond, x 290-415): three steps up the road, 6 m each, a ramp up the road onto each; a house each side
  on each step; boulders on each step to ride round; 6 dogs; 4 goats; falling rocks. The **Sky Cannon** at the top.
- (owner, 2026-11-11) The sewer pipe's mouth and the balloon take you from farther off: the pipe from 3.5 m round its
  middle (it was 1.7). (owner, 2026-11-11: no threading a needle) The balloon is 1.8x bigger and takes you from
  anywhere inside the red ring round it, 9 m (it was 3).
- **Floating Islands** (Sky): three islands 32 to 44 m up off Cliffside's far side, two houses each, joined by jump
  pads; 3 dogs, wind and sky geese (every 8 to 14 s). Each island's houses stand as far as they can from its pads,
  landing spots and middle (owner, 2026-11-12: and the zipline down, and the first island's houses clear of the cannon's
  landing and the way in); anyone who somehow ends up inside something solid is moved out to the nearest
  clear spot. Falling off costs a parcel 1 hit and puts you back on the last island you stood on.
- (owner, 2026-11-12) **Zones 6 to 10**, on the ground past the islands (`FAR`: x 600 to 1100, 100 m each), reached
  by the **zipline** from the last island (closed in a bubble until Frostbite Fields opens). (owner, 2026-11-12) The one
  **balloon** home to the post office is at the very end of the Moon Garden. One road down the middle, three houses each side, five of each zone's animal. Express
  parcels get 70 / 75 / 80 / 85 / 90 s on top. Each has its own going:
  - **Frostbite Fields** (Fox): ice everywhere: slow to start, turn and stop (12% grip).
  - **Sunscorch Dunes** (Raptor): sand (80% speed) and sandstorms: gusts like the islands' wind, 1.4x as strong.
  - **Jungle Ruins** (Trike): three rivers across it (50% speed) and thick trees.
  - **Lava Flats** (T-Rex): six lava pools: stepping in bounces you up, and the server burns a parcel (1 hit, a 0.6 s
    stun; once every 2 s).
  - **Moon Garden** (Unicorn): low gravity (45%).
  Falling off the islands only counts over the islands, not the zones below or the zipline down.

**Shortcuts:** (owner, 2026-11-12) none any more (the sewer pipe and the zipline tower went; the only zipline is the
way down to Frostbite Fields). **No walls round the outside:** ride or jump off any edge of the town (anywhere but
the islands, which put you back on the last one) and the run starts over: every parcel you hold is lost and you're
back at the post office (below 20 m down, `EDGE_Y`). Still there: boost pads (x1.6 speed for 2.5 s) on the road, the alleys and the marsh's main
boardwalk, and rooftop hops (three roofs, each 2 m higher, up the side of each Cliffside step's face: they need a jump
of about 2 m).

## Danger

- (owner, 2026-11-11) **Each area has its own chasers:** Main Street dogs, Maple Suburbs cats, Goose Marsh gators,
  Cliffside bears, the Floating Islands wolves (all run as "dogs" below, with that area's numbers). **Every animal
  (chasers, geese, goats) has a rarity**, Common to Legendary, fixed for the town and a little likelier rarer farther
  out (weights 50 / 25 / 14 / 8 / 3, each rank x (1 + 0.12 x the area's number)). Each rank: a bit bigger (+8%), a ring
  of its rarity's color at its feet (none for Common), sparkles for Epic and Legendary; chasers +6% speed, +0.8 m
  notice, 10% less warning, +0.5 s chase; geese +0.6 m sight, 10% less warning, +6% lunge; goats +5% charge. A rank
  counts as half an area against a mount shaking it off. Each chaser has its own call when it spots you (a bark, a meow, a hiss, a growl, a howl).
- (owner, 2026-11-11) **The attack queue:** a courier has 2 slots. An animal (any kind) has to take a free one to go
  after them, and leaves it when it attacks or gives up, so at most two are after you at once. **The calm:** no animal
  attacks while one of your parcels is with a goose or on the ground, nor for 3 s after it's back (picked up) or lost,
  or after a bite, a butt or a sky goose's snatch; an animal can still join the queue and chase in the meantime, it
  just can't bite, grab or butt. Sky geese don't dive in the calm either.

- (owner, 2026-11-11: dangers roam, and more of them) **Dogs** (20) roam their district: a short trot somewhere, now
  and then a pause, staying within 45 m of where they started, off the post office's safe zone, out of ponds. A
  courier carrying a parcel within 10 m sets one off: a bark and a red "!" for 0.5 s, then it chases for up to 6 s at
  11.5 m/s. A bite (not while you're jumping over it) stuns for 1.5 s and takes 1 hit. It gives up if you outrun it, get a wall between you, take it 38 m
  from where it started or reach the safe zone; then it rests 8 s. Scared off (a kick, Bark), it bolts away for 2.5 s.
- **Geese** (15) roam up to 34 m out from their pond, round houses and fences. One that sees a parcel within 7 m honks and flaps for 1 s, then lunges (13 m/s for
  up to 2.2 s). Touching you it takes one of your parcels (no stun) and waddles to its pond (7.2 m/s), then takes 3 s out in the
  middle to sink it: then it's lost. (owner, 2026-11-11) A stolen parcel has a visible countdown (over the goose, and
  on the parcel card): the goose's walk to its pond plus 4 s; when it runs out the parcel's gone, wherever the goose
  is. **Kick the goose** and the parcel drops where it stands, unharmed: pick it up for 15 coins x the tier. "GOOSE
  BUSTED!" (owner, 2026-11-11) **A parcel has 15 s on the ground** in all, counted down over it and on the card: picked
  up, its time stops; dropped again, it carries on from there (drop it with 8 s left and you have 8 s next time).
- (owner, 2026-11-11: animals have the same blocks couriers have) Houses, fences, hedges and trees stop geese as they
  stop couriers (and dogs): a goose slides along them; one stuck for over a second with a parcel squeezes through. A
  goose that would start inside something stands at a clear spot round its pond instead. Dogs, geese and goats face the
  way they actually move.
- (owner, 2026-11-11) A mount is as wide as it looks: the bigger it has grown, the farther from a wall, hedge or tree it
  stops (0.55 m on foot and when Common, up to about 1 m).
- **Sprinklers** (Suburbs): on 3 s in every 6, they shove you sideways.
- **Falling rocks** (Cliffside): every 3 to 6 s near a courier on the mountain; a shadow for 1 s, then a 1.5 s stun and
  1 hit within 2.3 m.
- **Goats** (Cliffside, 4): they wander their terrace; a goat that sees anyone within 9 m stomps for 0.8 s, then
  charges (owner, 2026-11-11: faster, 20 m/s for under a second) and knocks them back toward the ledge (no hit); it won't run off its own ledge.
- **Wind** (Islands): a gust for 3.5 s in every 11 pushes everyone the same way.
- **Sky geese** (Islands): every 9 to 16 s one dives at a courier carrying a parcel; a shadow circle for 1.4 s, then it
  takes one of your parcels for good if you're still within 2.2 m.
- **Hidden help:** after three failed runs in a row the dogs chasing you are 20% slower until you deliver.
- Animals sleep while nobody is near.

## Kicks

- Every 4 s. On couriers it reaches 3.6 m in front: a 1 s stun (less with Grip), knocked off the mount, 1 hit to one
  of their parcels. (owner, 2026-11-11) **On animals it hits every one within 4.5 m, all round:** geese dizzy for 3 s
  (and they drop the parcel they stole), chasers and goats sent home. No reward.
- **Protection:** no kicks in the safe zone; 5 s of grace after being kicked (a shimmer); the same courier can crack
  your parcel only once in 30 s; party members can't kick each other; **Friendly** (Settings) means you can't be kicked
  by couriers and can't kick them (animals still apply).
- Kicks only crack parcels; nobody can steal another courier's parcel.

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
- The parcel card top center: a row per parcel (tier, modifier, durability pips, address, distance, the Express
  countdown), stolen or dropped ones faded, and how many you carry of how many.
- Bottom right: Kick (with its cooldown), Whistle above it, the Ability beside it, Jump.
- Right edge: Stable, Upgrades, Odds, Settings (Friendly, music and SFX volume, shirt color, Admin for staff, Log out).
- Controls: WASD or arrows, Space to jump, F kick, Q whistle, E ability, Enter chat; drag to look, wheel to zoom. Touch:
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

## Co-op

- Rooms of up to 100 couriers share one town. Positions go out 10 times a second; dogs, geese and goats are the
  room's, run by the server 20 times a second.
- (owner, 2026-11-11: others rode sideways) Facing is sent as an angle within one turn (the server wraps any angle;
  it used to clamp it, which left a courier who had turned round a few times facing the wrong way for everyone else).
- Chat (Enter or the button); a bubble over the speaker.
- Parties: tap a courier, then Party; they accept or decline. Up to 6. Party members can't kick each other.
- A new website build reloads everyone onto it.

## The server decides

The page may ask: grab, kick, the Bark ability, equip, merge, a trail, open parcels, buy an upgrade, change
a setting, the sewer pipe, the balloon. Everything else (parcels, addresses, deliveries, rolls, damage, stuns, coins)
is the server's. Checks: a grab only near the conveyor; a delivery only in the right mailbox's ring with an unbroken
parcel; kick range and cooldown; coins for every purchase; a speed cap (anything over 110 m/s is flagged and blocks
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
a mount of a kind, rarity and variant), quick commands (coins, all mounts (every kind at every rarity), upgrades,
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
