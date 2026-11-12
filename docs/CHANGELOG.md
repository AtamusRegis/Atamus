# Changelog

Critter Courier (Pet Delivery Co. until 2026-11-11). Newest first. Add one entry per patch in the same commit, and keep it short: what changed for players
and any rule decided. Use `git log` for the code detail (and for the older Atamus prototypes, removed from the tree on
2026-11-08).

## 2026-11-12

- **Aura and podiums (owner).** Coins became Aura (one for one), a shiny purple currency. The server's three best
  mounts stand on three podiums by the post office and earn their couriers Aura. Every mount starts carrying one
  parcel; Aura buys carry levels (up to 5) and Boost levels (+5% speed each) per mount, and four new trails. Rarity
  gives +20% speed and shorter cooldowns per step; a mount is faster short of its own area and slower past it. Bark
  now hits every animal (geese and goats too).

## 2026-11-11

- **Every animal its own coats; merging raises the coat (owner).** Each animal has five coats of its own, one per
  rarity (a Gator goes Green, Albino, Sapphire, Black, Magma). Two of the same mount merge into the next coat up, keeping
  Shiny: two Shiny Tan Dogs make a Shiny Chocolate Dog.
- **Five coats, and a real Shiny (owner).** Every animal has the same five coats, one per rarity: Black, Orange, Gold,
  Diamond, Void (e.g. "Shiny Void Wolf"). The only other skin is Shiny, now 1 in 10,000: the same coat with sparkles
  twinkling around it. Golden and Rainbow went (owned ones became Shiny); merging two of the same makes a Shiny.
- **One reward screen; abilities for all (owner).** When a run's parcels open, the boxes shake together and everything
  shows at once, a new mount right in its card (no separate unboxing to click through). Every mount has its animal's
  ability from Common up; rarity only makes it stronger.
- **All at once, then home (owner).** A run's parcels open together, each in its own centered card; the new mount's
  unboxing is centered. When the run's over you're taken back to the post office. A box for each parcel on the saddle
  again. Mount chances per rarity: Common 80%, Uncommon 40%, Rare 20%, Epic 10%, Legendary 5%, tried from the parcel's
  rarity down.
- **The loop (owner).** Parcels open by themselves once you have none left to deliver: one straight away, several as a
  full-screen sequence. A parcel can bring its area's animal at its rarity or lower; an Uncommon or better of an area's
  animal opens the next area. A mount carries one parcel per rarity rank (Common 1 to Legendary 5). No mount levels:
  rarity (and the area) sets speed, size and ability (Training XP, Level Coupons and the Coupon Press went; its coins
  came back). Each area's animal is faster than the last, and rarity speeds it up. Every existing mount became a Dog
  of the same rarity and skin. Fixed: the town's chasers weren't drawn at all.
- **The areas' animals are the mounts; fixes (owner).** Mounts are now Dog, Cat, Gator, Bear and Wolf, each Common to
  Legendary; an area's parcels drop its animal at the parcel's rarity (no more eggs; old mounts and eggs became the
  animal of their rarity). The balloon is bigger and takes you from anywhere in its ring. Whistle is instant. One big
  parcel on the conveyor and one big box on the mount. Reset to new player wipes everything (and a parcel for an area
  that isn't open is never handed out).
- **Stage 3: presentation and rewards (owner).** The post office is a building with a conveyor belt out of its door
  pushing your (bigger) parcel to the end. Rarer parcels open with more punch (rays, heartbeat, shake, confetti,
  fanfare). New mounts drop in with their own animation (NEW! for a first); level ups show the mount on screen with a
  shine. A newly opened area gets a short showing of its gate, chasers and dangers. Trails: the Cloud Trail unlocks
  with the fifth area, for any mount.
- **Stage 2: the danger rework, zone melodies (owner).** Each area has its own chasers (dogs, cats, gators, bears,
  wolves), and every animal a rarity from Common to Legendary. Two attack slots per courier and a shared 3 s calm
  after any attack. Stolen and dropped parcels show their countdowns; a dropped parcel's 15 s carries over. Kicks hit
  every animal nearby. Closed areas are walled off until your mounts open them. The tune changes a little in each area.
- **Stage 1: fixes, cuts and feel (owner).** Others' mounts no longer ride sideways, and animals face the way they
  go. Geese are stopped by houses, hedges and trees like couriers, and a grown mount is as wide as it looks. Bigger
  pipe and balloon catch areas; goats charge faster. Mounts get faster as they level, and twice as fast empty. The
  Stamp Meter is gone; districts open by themselves as your mounts level (Route Permits gone, their coins refunded);
  only Express stays as a parcel modifier (Fragile, Heavy, Golden gone); two of the same mount merge (was four).
- **Pet Delivery Co. is back at atamus.io/pokemon (owner).** The game from before the remake, as it was, beside
  Critter Courier: same logins, everyone starting fresh there (its own saves and block world; the old saves and world
  stay untouched, the old town used as its starting town). Docs in `docs/POKEMON.md`.
- **Tutorial; merging mounts (owner).** New couriers get a six-step tutorial: picking up parcels, dropping them off,
  opening them, the Stable, Upgrades and the Stamp Meter. Four of the same mount with the same skin merge into the
  best of them with the next skin, up to the new Rainbow.
- **Merging parcels, harder areas, a narrow world (owner).** Unopened parcels are kept (and saved) on the server, their
  contents rolled when opened; four of one rarity merge into the next, with an animation. At least 30% of parcels go
  to your farthest open area. Each area's dogs and geese are quicker and trickier, and a mount shakes off the easier
  areas' animals more often as it levels. The world is narrow: the road down the middle, houses both sides, no
  alleys; hedges on the suburbs' road, a broken boardwalk in the marsh, boulders on Cliffside's steps.
- **Delivered parcels to open; jumping over dogs (owner).** Each delivery's parcel waits on the left with a sparkle in
  its rarity's color; tap one to open it (tapping during the build-up speeds it up) or Open all. Dogs no longer bite
  a courier jumping over them.
- **Gifts you open (owner).** A delivery's gift shows its rarity straight away (its color, and the rarity over the
  mailbox) and waits on the left until you open it: tap one (it shakes and bursts; tap again to skip), or Open all.
- **Gifts on the left (owner).** Each delivery's reward is a gift on the left of the screen instead of the big reel
  in the middle: a smaller reel spins and lands, and what came out stays until the next gift or you close it. Tap to
  skip the spin; Open all lands every waiting gift at once.
- **Short neighborhoods, a stack of parcels, faster empty (owner).** Every district is three houses long, three each
  side of the road (30 houses in all; three Cliffside steps, three islands). A mount carries 1 parcel, one more at
  levels 5, 10, 15 and 20; each goes to its own address with its own marker and card row, and the higher the mount's
  level the more of them are pricier tiers going farther out. Hits land on one parcel at random; geese take one.
  Empty-handed you ride 1.5x faster. Fixed: getting stuck going up a ramp on a slow frame.
- **The town in one line; a new mount on your second delivery (owner).** The post office is at the west end and one
  road runs east through Main Street and Maple Suburbs, over the bridge into Goose Marsh, up Cliffside and out to the
  Floating Islands. The farther out, the more dogs and geese and the quicker the dogs (dogs on the islands too, and
  sky geese more often). Back alleys run behind the house rows; the zipline tower stands at the suburbs' end. Your
  second delivery brings a random Uncommon mount, revealed in a gift box.
- **Easier to see, dangers that roam, a bigger roll (owner).** The town's colors are calmer and the delivery spot is
  hot pink (a tall beam, a spinning marker, a ring and the address), with a pink arrow on the ground round you
  pointing the way (the edge-of-screen arrow is gone; the distance is on the parcel card). Dogs (41) roam their
  districts instead of waiting in yards, geese (37) roam well out from their ponds, two goats wander each Cliffside
  terrace. The reward roll spins big in the middle of the screen for 2.6 s, lands with a flash, then a card shows
  what you got until you close it. No flying pets: the Parrot, Owl and Dragon became a Deer, Stegosaurus and
  Unicorn (keeping their levels), and Glide is gone; the Triceratops is new. Fixed: getting stuck in the island
  houses by the jump pads (they moved clear of the pads, and anyone inside something solid is moved out).
- **Critter Courier (owner).** The game was remade from the Critter Courier design document, replacing Pet Delivery Co.
  rather than merging with it; the blocky couriers stay. Grab your Ready parcel off the post office conveyor, ride to
  its address, deliver in the mailbox's ring, and a reward roll spins. Five parcel tiers for five districts (Main
  Street, Maple Suburbs, Goose Marsh, Cliffside, Floating Islands), four modifiers, durability, the Stamp Meter;
  twelve mounts in five rarities that grow to 2.5x by level 20, with stats and an ability (Dash, Glide, Double Jump,
  Bark), eggs from rolls with Shiny and Golden hatches; dogs, geese, sprinklers, falling rocks, goats, wind and sky
  geese; kicks with a safe zone, grace and a Friendly setting; rooftop hops, back alleys, the sewer pipe, ziplines,
  boost pads, the Sky Cannon, jump pads and a balloon home; five courier upgrades and postmaster ranks; the Stable,
  Upgrades, Odds and Settings menus; all the document's effects and sounds. Owner's choices: a fixed town made in code
  (no editor), a fresh start with logins kept (old data left untouched in the database, unused), full color, and chat,
  the admin panel and parties kept. Rooms hold 100. The server decides parcels, deliveries, rolls, damage and coins.

## 2026-11-10

- **Fix: the town not drawing (owner).** Rock blocks on some tiles picked a shade that didn't exist, which stopped the whole town drawing (black world, empty map).
- **Fix: logging in with a bad piece in the town (owner).** Taking in and drawing the town can no longer stop logging in: a part that fails is skipped (and logged), so your pets, coins and staff role always load.
- **Build Town button (owner).** A green button with a brown house, the size of the item buttons, at the bottom right.
- **Van points by hand; Build Town button (owner).** Van points go anywhere on a road, and admins draw the lines between them (tap a point, tap another; tap a line's middle to remove it); vans drive those lines. Build Town has its own button on screen.
- **Van points (owner).** Admins mark van points on roads; vans drive from point to point along the roads joining them instead of turning at random.
- **Rocks, boulders, solid trees (owner).** Build Town has Rock blocks and Boulders to place on blocks like trees; trees and boulders stop you.
- **Your house in the town (owner).** Every town house stands on an 18 m lot; joining a room you take a random free one, your own house replacing it (turned the same way) until you leave. The editor's Plot pieces are gone. Town houses now sit centered on a tile, so ones already placed move half a tile.
- **Vehicles keep going while building (owner).** Placing a block or adding or deleting a vehicle no longer sends every van and helicopter back to its starting spot.
- **Night lighting, helicopters (owner).** Nights are lighter and players and pets are evenly lit at any hour (no lone bright limb). Helicopter searchlights catch parcel carriers by day too, and their circle no longer hangs in the air over the void.
- **Solid blocks (owner).** Blocks are solid boxes: no more popping up onto a block from beside it, and anyone caught in a block's side is pushed out and falls instead of getting stuck.
- **No falling into holes (owner).** The climb-out is gone (it let pets get up walls without a ramp); instead walking pets can't step off a block's edge down a drop, so heights change only on wedges and ramps.
- **Climb out of holes (owner).** Walking pets push into a block's side up to one block high and climb up onto it, so they can't get stuck in a hole.
- **Players and pets in color; dirt a step darker (owner).** Couriers and their pets are drawn in full color in the gray world; the dirt sides come down a step from the lighter brown.
- **Lighter dirt (owner).** Block sides are a lighter, sandier brown.
- **Fix: pickup with few mailboxes (owner).** With fewer addresses than your bag holds, the pickup ring no longer keeps flashing "+2" without adding parcels: it adds what's left, once.
- **Dirt sides, no green roofs, closed gables (owner).** Block sides are dirt brown; town houses and the Cabin no longer get green roofs; player houses' pitched roofs have their gable ends filled in.
- **Mailbox blue; no more glowing limbs (owner).** Mailboxes are the bright blue of animal control's light. Characters' lit legs and arms no longer blow out pale: the brightest parts ease off, the ground's bounced light is neutral, the night glow is softer, and boost chevrons no longer draw over the feet of anyone standing on them.
- **Corner roads (owner).** Build Town has Road Corner (half road, half grass, cut corner to corner) and Half Road (just the road half) to round off turns; vans drive round them.
- **Greener (owner).** Grass and trees show much more of their green in the gray look.
- **Pines, blue mailboxes, a hint of green; vehicles in the editor (owner).** Trees are tall pines, three to four blocks high; mailboxes are blue and in color; grass and trees keep a very slight green; helicopters shine a faint red beam down to their circle by day too. In Build Town, vans and helicopters can be selected where they are and deleted.
- **The block world and town editor (owner).** The world is now built from 6 m blocks on a grid, stacked in 3 m steps: land, wedges, roads, road ramps and water, floating where nothing is under them. It starts as just the square (the same size, in blocks); admins build the rest live with Build Town in the gear menu: blocks, trees, houses, mailboxes (every one a delivery address), boost pads, vans (they roam every road joined to theirs), helicopters (within a chosen radius) and the housing plots. The server keeps the world (`pet_world`). The flat grid town, its lake, islands and fixed routes are gone.
- **Personal and party contracts (owner).** A contract is yours alone, or your party's when you're in one, never the whole room's.
- **Chevrons fixed (owner).** Boost chevrons run away from you and the camera, never backwards, and fade out as they go instead of being cut off at the pad's edge.

## 2026-11-09

- **Polish (owner).** Log Out in the gear menu; thinner rings and telegraph rims; bright red animal control at any hour; short, faint, fewer wind streaks; characters' light parts no longer blow out at night.
- **Telegraphs, click-on talks, Walt's voucher (owner).** Animal control's reach is drawn as red ground shapes (van sight, searchlight circles); helicopters and searchlights are red; talk lines stay until you click; the walk-through sends you back to Walt for the egg voucher.
- **The walk-through (owner).** Walt the mailman shows every courier the job once: animal control scenes, two parcels to deliver, a free egg to hatch, and contracts.
- **Chevron boosts and van sight lines (owner).** Road boosts are see-through chevrons that point and run away from you; animal control vans show red sight lines on the ground, fading with distance.
- **Trimmed (owner).** Water pets scrapped (Duck, Sea Turtle and Sea Serpent deleted from saves), the mount shop closed (the square now has four buildings, 90° apart), Package Rush turned off for now, and animal control is red on the minimap too.
- **Plain grays (owner).** No outlines or hatching at all: the world is shades of gray, textures kept; labels, guides, rings and animal control stay in color.
- **No stripes on phones; red animal control (owner).** Flat ground no longer shows lines on phones (full-precision depth, and outlines only where depth breaks); animal control vans and helicopters are red, in color.
- **Flat grays (owner).** The sketch look drops its hatching and the ground's speckle: clear, flat grayscale with ink outlines.
- **Nine pets (owner).** A Common, Rare and Legendary of each type: Pup, Raptor, T-Rex; Parrot, Owl, Dragon; Duck, Sea Turtle and the new Sea Serpent (a snake-dragon). The Epic rarity is gone; every retired pet became the new one of its type and rarity, keeping levels, training and Treats. Eggs, prices, Package Rush prizes and pen earnings follow the three rarities.
- **Guides and circles in color (owner).** In the sketch look the guide arrow, the place rings, the lift beams and the delivery, Package Rush and arena beams stay in color.
- **Minimap in black and white (owner).** The minimap is drawn like the world, white paper and black ink with the water hatched; markers keep their colors.
- **The town rebuilt flat, symmetric and on a grid (owner).** A flat square island with straight streets in a grid and houses evenly along them; the round town square with the contract board in the middle and the post office, egg shop, training yard, pound and mount shop evenly round it, facing in; one big deep lake on the west side with a river running off the edge in a waterfall; a symmetric ring of floating islands (the VIP island now over the square). Plots sit in the middle of city blocks (same plot ids). Hills, cliffs, winding roads, the old lake, rivers and stream are gone.
- **Sketch look (owner).** The world is drawn like a pencil sketch, white paper with black outlines and light hatching, for a prototype feel; labels and bubbles stay in color and readable.
- **Admin: edit a player's inventory (owner).** Edit in the admin panel shows a player's coins, items, Treats and pets; admins change the numbers or take pets away and save (server ops `inspect` and `edit`).
- **Tap people; phone buttons in one row (owner).** The name buttons for players and townsfolk and the player panel are gone: tap a townsperson to talk, tap a player for Trade / Party right by them. Held sideways on a phone, the buttons stay in one row along the bottom instead of stacking into the map.
- **Bright characters at night; baked shadows (owner).** Pets, riders and townsfolk stay bright at night; live shadows are gone, replaced by darker ground under houses, buildings and trees and a soft spot under everyone moving.
- **Pet types: Ground, Air, Water; no more gliders (owner).** Every pet carries a Ground, Air or Water badge; the Parrot, Pegasus, Phoenix and Pterodactyl now fly like the other fliers.
- **Roblox-style chat and menu, players in the map, candy on phones, place labels, training arena prompt and guide (owner).** The chat is a window at the top left (with a gear menu for Settings and the Admin Panel beside it), replacing your name, the Chat/Settings/Admin buttons and the distance home; the player count sits in the map; the candy button can be tapped while moving; the Egg Shop and Mount Shop labels sit over their circles; the arena is an E prompt in the yard, and its guide points through a gate's gap (it used to point at a post, so you got stuck there).
- **Building: one color circle; no doubled pieces (owner).** The colors open from a single circle; placing a piece on the same piece recolors it instead of stacking a second.
- **Fix: dismount only inside houses (owner).** Lots on the VIP island put anyone below or above them on foot (the lot check had no lower limit); now you're only off your pet inside a house.
- **Houses rebuilt (owner).** Outside, each lot has one of 5 ready-made houses (Cottage, Cabin, Modern, Barn, Tower); its front door leads inside, to the house's own space (a floor and the front door in a black void) for you and your party. Building is inside only and freeform (any spot, any angle, on the floor you're on), with a true-to-life preview, window views, and Delete that marks red, selects and removes with Del. Walls are taller (5.5 m). Old houses moved inside as they were (home.v 2). Others see whose house you're in (pos carries inst).
- **Dismount only on built lots, walkable roofs, wind readout only when it matters, phone layout (owner).** You're off your pet only on a player's lot with something built on it (no longer under any roof); pets that jump or fly onto town houses walk on their roofs; the wind pill shows only on fliers and gliders; on touch screens the HUD and buttons are sized to the screen, with big round Jump buttons and, sideways, a row of buttons along the bottom.
- **Home and interaction prompts (owner).** Your plot now has a small Home label on the minimap and a world-space YOUR HOME sign with a house icon; nearby people, lifts and pet pens can be activated with E while taps still work.
- **Pet Delivery Co.:** deliveries briefly show how many parcels remain, and Settings can hide the follow arrow when the bag is empty.
- **Home marker and desktop controls (owner).** A small Home distance/direction pill and gold home marker make your plot easy to find; desktop players use Space to jump without a right-side Jump button.
- **Camera-directed flight restored (owner).** In the air, a flapping flier moving forward climbs or dives where the camera looks; its mount pitches with that direction. Holding Space or Shift still flies straight up or down and overrides the camera.
- **Admin environment controls (owner).** Admins can set the weather for everyone to Auto, Clear, Rain, Snow, Storm or Fog and the time to Auto, Sunrise, Day, Sunset or Night from the Admin panel. Snow falls and covers the land; storms bring heavy rain, full wind and lightning; fog cuts visibility. New logins get the current setting; moderators and players can't change it.
- **Package Rush events (owner).** Every 10 minutes, prize packages appear at random town mailboxes for 1–2 minutes. Shared packages give large training-point, coin or item prizes, with a chance of a random pet, and arrive with a purple-and-gold announcement, beams, confetti and fireworks.
- **Water fixes, swimming underwater, boosts by pet, What's New, riders' size, coins on the right (owner).** Waterfalls pour down (not up) and clear of the rock; water no longer hangs past the edge or spreads over the slopes; rivers' ripples run downstream, faster on the steep stream. Swimmers swim underwater (Space up, Shift down); land and air pets never go in or on the water (put on the nearest shore). Sky rings only for fliers and gliders, whirlpools (replacing water rings) only for swimmers, both fading with distance; road pads follow the road. A What's New panel after updates. Riders stay their size on big pets. The coin pill moved to the top right.
- **Townsfolk and conversations (owner).** Six distinct townsfolk now live around the shops and post office: the Egg Shop's Hazel, the Mount Shop's Rusty, postmaster Mabel, groundskeeper Gus, dancer Ziggy and Penny. Each has their own clothes, movement and conversation choices; the shopkeepers can open their shops, and the others offer stories, tips, jokes, dancing, rock-paper-scissors, high fives and hide-and-seek. Talking moves the camera in for a small cutscene, types each line before advancing, and a click or tap skips ahead.
- **Fliers walk until you take off; on foot on any plot (owner).** A flying pet walks on the ground until you press Space, then holding Space climbs; landing puts it back to walking. On any plot, in the yard as well as the house, you're off your pet.
- **Minimap (owner).** A square map in the top right corner (bag, wanted level, players and contract now sit under it) that turns with the camera so up on it is always the way you're looking, with N on its edge. It shows the town (land shaded by height and slope, roads, the plaza and its buildings and rings, houses, trees, the plots, the islands; the ones above the town fade in as you climb), everyone's built houses (your plot outlined gold), the houses in your bag (gold, pink for islands) and where the guide points (a chevron on the edge when it's off the map), animal control (vans that flash when they chase, helicopters and their searchlights), the other players (a dot in their shirt colour facing their way; party ringed green, wanted ringed red; marked when well above or below you; kept on the edge when far away), what the camera sees, and you as an arrow the way your pet faces. It dims at night. Tap it to zoom (4 levels, remembered).
- **Animal-control lights wait for night (owner).** Helicopters still circle during daylight, but their searchlights cannot spot or catch anyone until daylight fades. Vehicle headlights and all red/blue animal-control lights stay off by day too.
- **Flight down key (owner).** Hold Shift instead of Ctrl to descend on a flapping flier; the on-screen key strip now shows Shift.
- **Fix: others sometimes saw a different pet than you ride (owner).** When your data came back from the server (logging in, or after a stale save) your page redrew your pet but never told the room; now any change to the pet you ride is sent.
- **Smarter animal control (owner).** Animal control cars now have compact, van and SUV styles with slow, standard and fast speed tiers, and they watch farther ahead and to their sides than behind. Helicopters circle slightly faster and use a wider searchlight against couriers riding flying mounts. They still leave couriers alone unless they carry parcels.
- **Wind is easier to see and affects flight (owner).** More numerous, longer and brighter streaks make the wind clear around town. Airborne fliers and gliders gain up to 10% speed with the wind and lose up to 5% against it; the wind pill shows the active percentage in green or red.
- **Pet Delivery Co.: shops open in the middle of the screen, and a new mount shop (owner).** The shop window now sits in the middle of the screen and shows your coins beside its name; every item shows its price. The mount shop (teal, a golden horseshoe on top, across from the egg shop) sells every pet at level 1: Legendary $2,500, and each rarity below a random 500–750 less per pet (prices fixed in `MOUNT_PRICE`). Buying one rides it. It has its own place label (Mount Shop: Buy pets to ride). The browser smoke test now buys a Dragon there.
- **Training arena (owner).** The training yard now takes you to a big floating arena with an obstacle course: each obstacle you clear (hurdles, hoops, a platform, slalom gates, a tunnel) is a training point, and 20 points (4 more each level after) level your pet up. Training for coins is gone; Treats and Training Ribbons still work there. Saved pets keep a `tp` (points) field.
- **Fliers go up and down only by held keys (owner).** On a flapping flier, hold Space (or Fly ▲) to keep rising and hold Ctrl (or the new Fly ▼ button) to keep sinking; otherwise it holds its height. The camera's angle no longer makes it climb or dive. A "Space Up · Ctrl Down" strip shows at the bottom of the screen only while riding a flier (computers; phones have the two buttons). Land pets and gliders are unchanged.
- **Speed boosts (owner).** Arrow pads on the roads, rings in the air and rings on the water give your pet a short burst of speed when you go through them.
- **Water: a lake, rivers and waterfalls; swimmers (owner).** A small lake out past the outer road, two rivers running off the island's edge in waterfalls, and a stream stepping down the terraces into it. Swimmers (Duck, Penguin, and two new pets: Otter, Rare, and Sea Turtle, Epic) swim fast and walk straight in; other pets can't wade in from the shore and paddle slowly if they jump in. Swimmers have an indigo Swimmer badge.
- **Admin quick commands and a tidier admin panel (owner).** Admins get one-tap commands for themselves at the top of the Admin panel and in a Quick menu on every player: +10K / +100K / +1M coins, all pets, max levels, items, Treats, clear wanted, everything. Staff can also type them in chat (`/coins 1m`, `/allpets`, `/maxlv`, `/items`, `/treats`, `/everything`, `/unwanted`, optionally with a player's name, and `/kick`, `/mute`, `/ban` Name [time]); they're never sent as chat. The panel lists online players first, shows VIP, and its search no longer loses focus as the list refreshes.
- **Working together: finish no longer waits out a check that can't start.** While waiting for `check` it now also watches `main`; if `main` moves, it integrates again at once. GitHub doesn't start the check on a pull request that no longer merges cleanly, so before this the wait ran its full 10 minutes and ended "check ended: none" (it held up #12, #15 and #18). No player-facing change.
- **Wind (owner).** The wind now changes between 3 and 40 mph (windier in the rain, with gusts) and swings slowly round, the same for everyone; streaks, rain and clouds move with it. In a strong wind, fliers and gliders in the air drift gently downwind and bob a little. A pill under your name shows the wind's speed and an arrow the way it blows.
- **Whose update (owner).** Under Updating! a small line says whose update it is ("Derek's Update") when the merged change carries an `Update-By` trailer; `scripts/task.sh finish` adds it from the clone's `git config pets.updateBy`.
- **Van headlights and helicopter searchlights (owner).** Animal control vans have headlights while they're moving (beams ahead and a pool of light on the road, brightest at night). Helicopters no longer chase: each sweeps a real searchlight over town that turns slowly and swings back the other way now and then, its spot moving in and out; it lights the ground and anything it lands on. A parcel carrier who stays in the beam for half a second is caught.
- **Place labels fade sooner (owner).** The bubbles get fainter the further you are and disappear outside the middle of town.
- **Staying in the game while away (owner).** Minimizing the browser or switching to another window no longer takes you out of the game; you wait where you stopped.
- **Pet Delivery Co.: fliers and gliders tip further nose-down going down (owner).** 1.4× the angle of the path, up to about 55° (was 40°); climbing unchanged.
- **Working together: the two-player browser check no longer races a falling pet.** It now watches for the highest the second player is seen over a few seconds, not one look after 1.5 s (a land pet falls back from 40 m in under 2 s, so a slow CI runner could read only after the landing). It still fails when the #7 bug is put back. No player-facing change.
- **Hatching: Not now (owner).** A hatched pet no longer has to be ridden: Not now keeps you on your current pet; the new one goes to your Pets list.
- **Place labels (owner).** A speech bubble over each place in town (post office, contract board, egg shop, training yard, animal control, sky lifts) says what it is, fading with distance.
- **Pet Delivery Co.: players who just joined no longer look frozen to others (#7).** If the server shared where they were before their first position arrived, that one update (on the server's clock) made every later one look older, so they stood still at the spot where they joined. The browser smoke test now has a second player join and fly up, and checks the first sees it.
- **Pet Delivery Co.: fliers and gliders pitch with their flight (owner).** In the air they point nose-up while climbing and nose-down while diving or gliding down (by how they actually move, up to about 40°, for your pet and everyone else's); level on the ground. Land pets still never tilt.
- **Pet Delivery Co.: the admin Give list tags fliers and gliders (owner).** Pets in the list carry the same blue Flier / teal Glider badge as their cards.
- **Working together: the required check also plays the game page.** A browser smoke test (pets.html in headless Chrome against the in-memory server: loads, creates an account, rides, no errors) joins the syntax check and the server smoke test, so a runtime error in the game page can't merge. `scripts/protect-main.sh` applies the GitHub settings the workflow relies on (run once by an owner with admin rights) and `--verify` checks them. No player-facing change.
- **Pet Delivery Co.: the courier is a blocky R6-style figure (owner).** Matched to the owner's reference: a square torso, arms and legs with softened edges, a rounded head with two oval eyes and a smile; head and arms skin, torso the shirt color, legs dark. It rides astride the pet with arms forward and swings its arms when walking in houses. The cap and mail bag are gone.

## 2026-11-09

- **Fix: getting stuck inside houses (owner).** You're only off your pet under a ceiling or roof, so a flier or glider that drops into a roofless room keeps its wings; and pushing on in a room with no way out (no doorway, open side, stairs or slope) puts you out in front of the plot.

## 2026-11-08

- **Working together: the rest of the agreed workflow (owner).** `scripts/task.sh integrate` (merge main, show what the branch changes against main with deletions and shared systems called out, run the checks); finish merges only once check passed on a commit holding the latest main and reports main's own check afterwards; CLAUDE.md now covers conflicts, frozen scope after auto-merge, what never to do, unmergeable assets, regressions, reports and the merge queue. `scripts/protect-main.sh --verify` no longer needs gh's GraphQL. No player-facing change.
- **Working together: changes reach main through pull requests that merge themselves (owner).** One short-lived branch per task; a required check (syntax, the shared world file in sync, and a smoke test of the world's rules and the real server with two players) runs on every pull request merged with the current main; once it passes the pull request is squash-merged and checked to be on main (`scripts/task.sh`). No player-facing change.
- **The repository is Pet Delivery Co. only (owner).** The older Atamus prototypes (the cargo station game, its 3D view and pages, the old snapshots in reference/ and their assets) are gone from the tree; main is the one source of truth and every other branch was deleted. The front page now points to Pet Delivery Co. and lists only its updates. The server keeps only Pet Delivery Co.'s tables and routes (older tables stay in the live database, unused). Both deploy workflows syntax-check before deploying, and the server's address, host and deploy key can come from repository settings (atamus.io's by default); the game page reads its server from one setting in pets.html.
- **Pet Delivery Co.: houses on plots that everyone sees, built piece by piece (owner).** 16 plots (3 near the middle first come first served, 2 VIP on a new island above the middle, 5 around town at random, 6 on an extra island when a room passes 10 players), given out when you join; lifts to your plot and back. Build floors, walls, windows, doors, roofs, slope roofs and stairs on a 5 x 5 grid up to 3 floors, plus pet beds, pet pens, chairs, tables, shelves, cabinets, plants, rugs and posters, in 12 colours, with turning, levels, paint and remove. Inside a house you walk off your pet and the floors above hide. Old homes became starter houses with a refund. VIP is set by admins. Space is pressed each time: land pets jump straight up when still, fliers rise, gliders flap once. Flier / Glider badges on cards. The guide is now a flat glowing arrow that tilts only halfway up.
- **Pet Delivery Co.: a glowing guide arrow, freebuild homes with walls, roof and windows, longer contracts (owner).** The 3D arrow is replaced by a long glowing arrow on the screen that always points the way, plus a bobbing marker over the place. Homes have full walls and a roof; furniture goes anywhere (follows the pointer, turns, green or red), windows in outside walls, rooms anywhere next to another; Remove takes things away for half back; tap a playpen to choose its pet. Contracts last 2:30, 4 and 7 minutes.
- **Pet Delivery Co.: smoother players, distinct pets, homes you lay out, gentler animal control (owner).** Others' movement is replayed on each sender's own clock (sent 20 times a second) instead of the server's batches, with guesses ahead eased in, so no rubber-banding. Every pet kind has its own build. Choose where rooms and furniture go by tapping green markers; walking between rooms works. Animal control only chases players carrying parcels, and a catch teleports you to the pound with no stun. Houses in the way fade by how much they hide you instead of popping; roads sit on the land and pets on the roads; no more shadow flicker on houses and vans; wind streaks stay out of your way, slower and fainter; homes are always bright and dry.
- **Pet Delivery Co.: staff and admin panel, parcels by pet, a living sky, smoother land (owner).** Roles: Nyssary is admin and makes admins, admins make moderators; the Admin panel lists players (and finds any account) to set roles, mute, kick, ban (timed or permanent) and give items, coins, Treats or pets from a searchable list. New couriers get parcels near the post office; the better your best land pet, or flier/glider when riding one, the further out (and onto islands). Chat history while you're logged in. A 20-minute day and night cycle with stars and lit windows, rain, wind, god rays and many more clouds; the ground's colors now blend smoothly with a fine texture, and tall rocks stand on the cliffs.
- **Pet Delivery Co.: accounts, homes, trading and parties, new ways to move, more islands (owner).** Username / password accounts with data saved on the server (the first account in a browser keeps its old progress). F next to a player: trade pets and coins or invite to a party. Buy a house; its door takes you to your own copy where you build rooms, beds (more pets; 6 + 2 per bed) and playpens that earn coins from a pet while you're away; invite your party in. Land pets jump (high or far); flapping fliers go anywhere but slower; gliders are fast but can't climb. Pets no longer tilt toward where they fly. 13 more islands: low ones off the edge and a ring high above the town. Animal control vans no longer sink into the road on slopes.
- **Pet Delivery Co.: Pet Farm and Treats; reload on updates (owner).** A spare pet (another of its kind) can go to the Pet Farm for Treats of its kind (5 + its level − 1), which train any pet of that kind in the training yard instead of coins. When a new site build goes live, everyone playing is reloaded onto it.
- **Pet Delivery Co.: a floating town, real animal control, chat and smoother play (owner).** The town is now a big floating island of plateaus, cliffs and hills with winding roads, houses along them and the plaza in the middle; the small islands float off its edge (no more clipping). Animal control (vans on the roads and new helicopters) spots players, chases them briefly (faster pets get away) and takes whoever it catches to the new pound; getting away earns wanted stars (up to 5) that make you easier to spot and chased harder but add 20% per star to delivery pay. The server runs it for the whole room (the world is one file shared by page and server). Vans no longer drive backwards. Fliers climb and dive the way the camera looks. Pets grow 1.5% per level. Room chat with speech bubbles. Others and vehicles now glide smoothly (server-clock playback) instead of rubber-banding; departed players no longer linger and reloads no longer leave a clone.
- **Pet Delivery Co.: fliers, dinosaurs, islands, hills, animal control and celebrations (owner).** 11 new pets (23 in all): fliers (Butterfly, Parrot, Owl, Pegasus, Phoenix, Pterodactyl, Ice Dragon; the Dragon now flies) soar over houses and trucks, and dinosaurs (Stegosaurus, Triceratops, Raptor, T-Rex). Hills across town; 5 floating islands with houses only fliers reach, paying double. Animal control vans roam the roads: a touch stuns you and sends your parcels back. Rush Order (1 min) and Quick Contract (1:30) beside the Big Contract; falling short still gives whoever delivered a Training Ribbon (75%+) or 3 Speed Candies (40%+). The Speed Snack is now the Speed Candy. Confetti on deliveries (yours and others'), fireworks when eggs hatch and contracts are won, banners, sparkles on level-ups. The server shares heights and delivery effects and runs the three contract kinds.
- **New game: Pet Delivery Co. (owner).** A co-op, phone-first 3D game on its own page (pets.html): ride your pet around a small town delivering mail from the post office for coins and items (Speed Snack, Training Ribbon, Egg Ticket), hatch eggs for faster pets (12 kinds, 4 rarities), train them (speed and bag). Co-op through the Atamus server (WebSocket /pets): rooms of 16, everyone sees each other, and big contracts the room works on together with the reward split by deliveries. Progress is kept in the browser. The cargo game is unchanged. See docs/PETS.md.
