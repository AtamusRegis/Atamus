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
4. **Open it.** Coins and the parcel's Training XP pay out, and the delivered parcel (a **gift**, kept on the server
   and saved, so unopened ones are there next time) lands on the left of the screen with a small sparkle beside it in
   its rarity's color, the rarity popping up over the mailbox. The rarity is rolled on delivery; what's inside is
   rolled when you open it. **Four of one rarity merge** into one of the next (owner, 2026-11-11), its parcel tier the
   best of the four, with a little animation (they slide together and the new one pops out); merges chain up to
   Legendary. Tap a parcel to open it: it builds up (three shakes, its sparkle and glow growing, about 2 s) then shows
   the prize; tapping while it builds up makes it go faster. **Open all** opens every waiting parcel at once, showing
   each one's rarity and the totals. What came out (coins, XP, Level Coupons, eggs, a mount) stays under them until
   the next opening or you close it. Up to 60 can wait; past that the oldest open by themselves.

(owner, 2026-11-11) **A stack of parcels:** a mount carries 1 parcel, one more at levels 5, 10, 15 and 20 (5 at level
20); ride back into the conveyor to load up. Each has its own address (the same neighborhood as another or a
different one), its own marker, and its own row on the parcel card (with its distance; the card shows how many of how
many). The ground arrow points to the nearest. Each delivers at its own mailbox and rolls; several rolls take turns.
A parcel that breaks or is lost is gone; the conveyor always has the next one. **Empty-handed you ride twice as fast**
(owner, 2026-11-11: parcels weigh you down; empty mounts "way faster"), so the trip back to the post office is quick.

## The conveyor

- Runs round all four sides of the post office counter (a 10 m square in the middle of town). Each courier sees only
  their own two parcels riding it: **Ready** (grabbable) and **Next** (faded, just behind).
- Grabbing: Next slides up to Ready and a new Next drops in with a pop. The server allows a grab within about 4.6 m of
  the counter.
- The address is picked when you grab. Nobody else sees your target; two couriers can have the same house.

## Parcels

| Tier | District | Coins | Roll luck | Share of parcels (all districts open) |
| --- | --- | --- | --- | --- |
| Bronze | Main Street | x1 | none | 40% |
| Silver | Maple Suburbs | x2 | +10% | 28% |
| Gold | Goose Marsh | x4 | +25% | 18% |
| Diamond | Cliffside | x8 | +50% | 10% |
| Sky | Floating Islands | x15 | +100% | 4% |

- (owner, 2026-11-11) **At least 30% go to the farthest area you've opened**; the rest spread over the ones in between.
- (owner, 2026-11-11) **Districts open by themselves as your mounts level up** (Route Permits went): one more each time
  your best mount reaches level 3, 6, 9 and 12 (`OPEN_LV`). Tiers for districts you haven't opened never appear. The
  more districts are open, the bigger the higher tiers' share (tier n's weight x (1 + n x (open - 1) / 5)), and so does
  the ridden mount's level (owner, 2026-11-11: the higher level, the pricier the parcels and the
  longer the trips): tier n's weight x (1 + n x (level - 1) / 8).
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
| Common | 60% | 4-10 | 6 XP |
| Uncommon | 25% | 15-30 | 14 XP |
| Rare | 10% | 50-100 | 30% a Level Coupon; 10% a Basic Egg |
| Epic | 4% | 220-420 | a Level Coupon; 35% a Basic or Rare Egg |
| Legendary | 1% | 1,500-2,600 | 2 Level Coupons; 75% a Rare or Legendary Egg (Rare twice as likely) |

- Every delivery also gives the mount 5 + 3 per tier Training XP.
- **Luck** (the tier's, plus Lucky Stamps) weights each roll by (1 + luck) to the power of its rank, then the odds are
  scaled back to 100%. Lucky Stamps at level 10 takes Legendary from 1% to 3% on a Bronze parcel.
- A roll that just missed Legendary hangs on it for a moment before landing (near miss).
- The Odds menu always shows the current odds for every tier, the Express bonus and the eggs.

## Mounts

- (owner, 2026-11-11) **A gift on the second delivery:** a random Uncommon mount (Cat, Fox or Deer), shown in a pink
  box after you close the roll's card.
- One equipped mount, seen by everyone; the rest wait in the Stable menu. Levels 1 to 20; a mount's size is 1 + 0.079 x
  (level - 1), so 2.5x at level 20. The rider stays the same size.
- **Twelve mounts, all on the ground** (owner, 2026-11-11: no flying pets): Common Pup (Bark), Piglet (Dash), Bunny
  (Double Jump); Uncommon Cat (Dash), Fox (Dash), Deer (Double Jump); Rare Raptor (Dash), Stegosaurus (Bark), Pony
  (Double Jump); Epic T-Rex (Bark), Triceratops (Dash); Legendary Unicorn (Double Jump). A new courier starts with a
  Pup. A Parrot, Owl or Dragon someone already had became a Deer, Stegosaurus or Unicorn, keeping its level.
- **Stats** (rarity 0-4, n = level - 1): Speed 10 + 0.6 x rarity + (0.3 + 0.03 x rarity) x n m/s (owner, 2026-11-11:
  faster as it levels; about 16 to 20 m/s at level 20); Jump 8 + 0.25 x rarity
  + (0.08 + 0.01 x rarity) x n; Grip (shortens stuns) 5% x rarity + 2% x n, up to 60%.
- **Ability** from level 5, stronger at 10 and 20: Dash (a burst of speed; every 8 / 6 / 4 s), Double Jump (a second jump, higher at 10, a third at 20), Bark (dogs within 10.5 / 14 / 17.5 m
  run home; every 12 / 9 / 6 s).
- **Leveling:** Train (XP from deliveries: 30 x 1.42^(level - 1) per level), Pay (100 x 1.6^(level - 1) coins: 100 for
  level 2, 655 for 6, about 472,000 for 20; about 1.26 million in all), or a Level Coupon (one whole level).
- Level 20: a glowing name tag and sparkling footsteps.
- **Whistle** calls your mount. A stun knocks you off; you get up on foot (5.5 m/s) and the mount comes back when you
  whistle, when you reach it, or by itself after about 2 s.
- Every mount fits every shortcut. Species differ only by rarity and ability.

## Eggs

- Only from reward rolls. Basic: Common 70%, Uncommon 25%, Rare 5%. Rare: Uncommon 50%, Rare 38%, Epic 10%, Legendary
  2%. Legendary: Rare 50%, Epic 38%, Legendary 12%. The odds are on each egg in the Stable before you hatch.
- Hatch from the Stable, no timer: the egg wobbles three times and opens. Any mount of the rolled rarity.
- (owner, 2026-11-11) **Merging mounts:** two of the same mount with the same skin merge (the Stable's Merge button,
  on either) into the better of the two (the higher level), which gets the next skin: normal, Shiny, Golden,
  **Rainbow** (violet with a sea-green trim and a rainbow trail; only by merging). The other goes. A Golden or
  Rainbow merge is announced to the server.
- 1 in 100 is **Shiny** (a lighter coat and a sparkle trail), 1 in 1,000 **Golden** (a gold coat and trail); the whole
  server is told. Up to 60 mounts.

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
when your mounts open the area (see Parcels).

A fixed town made in code (`buildTown` in pets-world.js); 30 houses. (owner, 2026-11-11) **One line, short
neighborhoods, harder the farther out:** the post office at the west end, then one road east through every district;
each district is three houses long, three each side of the road (owner: "do like 3 houses long per neighbourhood").
The world is narrow (owner, 2026-11-11): 60 m across, the road down the middle, houses both sides, no back alleys, and
the going gets rougher farther out.
Each has more (and quicker) dangers than the last. (owner, 2026-11-11) Each area's animals are quicker and
trickier: dogs notice a parcel within 8 / 10 / 11 / 12 / 12 m, bark for 0.7 / 0.55 / 0.45 / 0.35 / 0.3 s, run 10.5 /
11.5 / 12.5 / 13.5 / 14.5 m/s and chase for 4 / 5 / 6 / 7 / 7 s; geese see you from 6 / 7 / 8 / 9 / 9 m, honk for
1.2 / 1 / 0.8 / 0.65 / 0.6 s and lunge at 11.5 / 13 / 14.5 / 15.5 / 16 m/s. **A mount outgrows the easier areas'
animals:** its chance to shake off a bite or a goose's grab (no stun, no hit, "SHAKEN OFF!") is 8% a level past
1 + 4 x the area's number (0 for Main Street, 4 for the islands), up to 85%.

- **Post office** at the west end, on its square: the counter under an open frame. Within 20 m is the **safe zone**.
  You start just south of it, facing east down the road.
- **Main Street** (Bronze, x 40-90): 6 houses; 2 dogs.
- **Maple Suburbs** (Silver, x 120-170): 6 houses, fenced yards by the first two, two small ponds between houses
  (6 geese), 4 dogs, 4 sprinklers beside the road, and low hedges across half the road, side to side (jump or weave). The zipline tower at its east end.
- **Goose Marsh** (Gold, x 190-290): over the bridge where the road leaves town. Mud (25% slower; 40% in a pond), a
  broken boardwalk on (gaps of mud to jump), one across the middle, 6 houses on platforms, three ponds (11 geese), 5 dogs.
- **Cliffside** (Diamond, x 290-415): three steps up the road, 6 m each, a ramp up the road onto each; a house each side
  on each step; boulders on each step to ride round; 6 dogs; 4 goats; falling rocks. The **Sky Cannon** at the top.
- (owner, 2026-11-11) The sewer pipe's mouth and the balloon take you from farther off: the pipe from 3.5 m round its
  middle (it was 1.7), the balloon from 5.5 m (it was 3).
- **Floating Islands** (Sky): three islands 32 to 44 m up off Cliffside's far side, two houses each, joined by jump
  pads; 3 dogs, wind and sky geese (every 8 to 14 s). Each island's houses stand as far as they can from its pads,
  landing spots, balloon and middle; anyone who somehow ends up inside something solid is moved out to the nearest
  clear spot. Falling off costs a parcel 1 hit and puts you back on the last island you stood on. A **balloon** on the
  last island takes you back to the post office.

**Shortcuts:** the sewer pipe (Main Street to the foot of Cliffside in 4 s; a goose sits in it 8 s in every 24, eyes showing at both
ends, and costs 1 hit), ziplines (the tower at the suburbs' east end down into the marsh; the top of Cliffside back to
the tower), boost pads (x1.6 speed for 2.5 s) on the road, the alleys and the marsh's main
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
  stops (0.55 m on foot and at level 1, up to about 1 m).
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
| Coupon Press | 400 | +1% per level of a bonus Level Coupon on a roll |
| Sturdy Boxes | 350 | +1 durability at level 5 and at level 10 |

The total of all levels (of 40) is the **postmaster rank**, a badge on the name tag: Bronze from 1, Silver 10, Gold 20,
Platinum 30. (owner, 2026-11-11) Route Permits went (districts open with mount levels); a courier who had bought any
gets those coins back the next time their data loads.

## The screen

- Coins top left (they count up; coins fly to it). Chat button under it. Delivered parcels down the left.
- The parcel card top center: a row per parcel (tier, modifier, durability pips, address, distance, the Express
  countdown), stolen or dropped ones faded, and how many you carry of how many.
- Bottom right: Kick (with its cooldown), Whistle above it, the Ability beside it (gray until level 5), Jump.
- Right edge: Stable, Upgrades, Odds, Settings (Friendly, music and SFX volume, shirt color, Admin for staff, Log out).
- Controls: WASD or arrows, Space to jump, F kick, Q whistle, E ability, Enter chat; drag to look, wheel to zoom. Touch:
  a thumb joystick on the left, drag to look, pinch to zoom, the buttons.
- No helper text anywhere; buttons and tooltips are names only.

**Feel:** Next pops; grabbing squashes the mount and chimes; boosts streak, widen the view and whoosh; a dog's "!" and
bark; a hit shakes the screen, flashes red and shows "-20%"; a break bursts into splinters; stars over a stunned
courier; "KICK!" with a 0.05 s hold; a goose's honk, and feathers when it's busted; confetti and flying coins on
delivery; the roll's ticks, near miss and a burst in the rarity's color (Common white, Uncommon green, Rare blue, Epic
purple, Legendary gold); an egg popping out; the hatch; "LEVEL UP!" with a ring; sparkles on an upgrade; the Sky
Cannon's boom. Floating numbers rise and fade in 0.8 s. Every sound is made in the page (no files); music is a small
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

The page may ask: grab, kick, the Bark ability, equip, buy a level, use a coupon, hatch an egg, buy an upgrade, change
a setting, the sewer pipe, the balloon. Everything else (parcels, addresses, deliveries, rolls, damage, stuns, coins)
is the server's. Checks: a grab only near the conveyor; a delivery only in the right mailbox's ring with an unbroken
parcel; kick range and cooldown; coins for every purchase; a speed cap (anything over 110 m/s is flagged and blocks
deliveries for 2 s).

## Accounts and saving

- A username (3-16 letters, numbers or _) and a password; the browser remembers a token.
- (owner, 2026-11-11) **Fresh start, logins kept:** accounts and passwords carried over; every courier starts with a
  Pup and 0 coins. A courier's data is its own column (`courier`) on `pet_accounts`; the old game's `data` column and
  the `pet_world` table are left in the database untouched, unused.
- Saved: coins, mounts (id, kind, variant, level, Training XP), the equipped mount, eggs, Level Coupons, upgrades,
  stats (deliveries, Golden parcels, geese busted, kicks landed), settings, failed runs in a row. Not
  saved: the parcels you carry and the conveyor's parcels.
- Purchases and hatches save at once; everything else every 60 s and when you leave.

## Staff

Nyssary is always admin and the only one who makes or removes admins; admins make moderators; moderators (and up)
mute, kick and ban those below them. The Admin panel (Settings): find a courier, mute / kick / ban, role, give (coins,
Level Coupons, eggs, a mount at a level and variant), quick commands (coins, all mounts, max levels, eggs, coupons,
upgrades, everything, reset), and edit coins and coupons. Everything is logged (`pet_admin_log`).

## Pet Delivery Co. at /pokemon

(owner, 2026-11-11) The game from before the remake runs again at atamus.io/pokemon, on its own socket (`/pokemon`) and
its own fresh saves, with the same logins. It is described in `docs/POKEMON.md`; nothing of it is shared with Critter
Courier's rules.

## Rejected / removed

- (owner, 2026-11-11) The **Stamp Meter** (pity: Rare at every 25 rolls below Rare, Epic at 100), its bar on the HUD
  and its tutorial card; **Route Permits** (districts open with mount levels now; their coins refunded); the **Fragile,
  Heavy and Golden** parcels (only tiers and Express stay); merging **four** mounts (now two).

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
