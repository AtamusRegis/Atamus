# Atamus: how the game works today

This is a living spec of the game. Read it before every patch, and update it in the same commit as any change to behavior. Rules marked **(owner)** were decided explicitly by the owner, so keep them unless the owner says otherwise.

## Back to basics (owner, 2026-10-18: "lets start from the bottom")

After a day of layering systems (heat, beam stages, the charge shot, bursts, bedrock, scanning, four ships), the owner stripped the game to its core loop:

> asteroids are cores surrounded by masonry. mine through masonry to get to core. some masonry has ore bits that get sent to the core. the core breaking piñatas all stored ore bits to be picked up by players. chunks have density, and higher density takes longer to mine. just miner for now.

Kept from the sandbox build: **no login (create a name and play), no chat, no parties, no fuel, no money, no in-game admin or developer UI**, the three rings, sectors, fog of war, movement, marks, the minimap, live updates, the server-authoritative core.

**Old data is kept (owner):** every old table stays untouched. The game uses `ring_players`, `ring_drops`, `ring_meta`, `ring_tuning`, `guests`.

Every number is in `packages/server/src/game/rules.js` and is sent to the client in the hello. Staff sessions can still tune them over the socket (`t: "tune"`, `_v: 7`); there is no in-game UI for it.

## Names and sessions (owner, 2026-10-18: no login)

- **Create a name and play:** `play.html` asks for a pilot name (3–20 letters, numbers, spaces, `-` or `_`; the name filter and banned names apply) and sets a year-long token cookie that owns the pilot (`guests` table; `POST /auth/guest`). The same browser resumes its pilot and can rename at the door; names are not unique.
- The game socket accepts the guest cookie (or an account session, which still exists for staff; the login/signup pages are unlinked but reachable by URL). **One session per pilot** (4002), **one pilot per device** (4003).

## The world

- **A 2D plane, north up.** Saturn at the center (nothing flies inside it); **one station** just north of it. **Three asteroid rings**: 3–9 km, 12–18 km, 21–28 km. **Deeper means outward**: rarer ores (ring 1 iron/ice/titanium; ring 2 titanium/cobalt/platinum; ring 3 cobalt/platinum), **thicker asteroids** (layers rolled per ring: 2–5, 4–8, 7–10), rarer rocks (`ringSpawn`). A **red dashed locked line** at 29 km.
- **Four sectors** name the zones (top center; hovering the minimap names the zone under the pointer).
- **Seeded rocks:** 700 m cells, one rock slot each (60%), from a server-only secret, a 6-hour epoch and a per-slot generation. Rocks exist only near players. **A popped rock's slot re-rolls after 45 s**; a part-mined rock lasts **30 minutes after its last touch**. The client never builds rocks from seeds.

## The asteroid: a core surrounded by masonry

- **A rock is layers of masonry chunks around a core — the owner's chunk sheet (owner, 2026-10-18).** Every rock has 2–10 layers (rolled per ring); the core has a 22.5 m radius, every layer 10 m thick with a 1 m gap between layers and between chunks (`LAYOUT`), so a rock's radius is 22.5 + 11 × layers. **Each layer splits into equal full-length slots, its arc from the sheet**: 60°, 45°, 36°, 30°, 24°, 20°, 18°, 15°, 15°, 12° for layers 1–10 (6 to 30 slots). **Each layer is rotated randomly** (owner: so the columns don't line up). A slot holds one full chunk, or **splits across its width into inner and outer halves** (30%) and/or **along its length into two halves side by side** (35%, per band): full / inner-half / outer-half width × full / half length. Ore types per rock: 1 (≤4 layers), 2 (≤7) or 3; core health scales with the layers (`ROCK_SIZE`).
- **Every chunk is visible** — its density (shade) and its ore bits show from the start. **Chunks draw as in the sheet:** a clean slab of its layer's ring with a dark outline, a lit outer edge and a shadowed inner one, and a few speckles.
- **Density (owner): denser takes longer to mine.** Three densities, darker = denser: D1 light blue-grey (health ×0.8, 40%), D2 grey (×1.6, 38%), D3 dark slate (×3, 22%); health = area × 0.11 × density.
- **Ore bits (owner): not every chunk has ore; the ones that do have 1–3 bits.** About half the chunks are barren; an ore chunk holds 1 bit (45%), 2 (35%) or 3 (20%), 100 units each, drawn as small squares in the ore's color with a darker corner, spread along the chunk. **Ore colors** (owner's mockup): iron orange, ice cyan, titanium yellow, cobalt green, platinum pink.
- **The laser glows** (owner, 2026-10-18): soft layered halos around a red body with a warm hot core and a faint flicker, not a flat line. **No push** (owner, 2026-10-18: the ship isn't pushed by the laser anymore). **The chunk under it bounces slightly; when the laser is on the core, the whole asteroid shakes and the core shudders harder** (owner, 2026-10-18).
- **The Miner's laser (15 / s at 220 m) hits exactly what it points at (owner, 2026-10-18):** the first unbroken chunk — or the core — its line meets, with **no anchoring or lock-on**. **Every chunk has an exact hitbox**: the server builds each chunk's rock-shaped polygon once, sends the points to clients, which draw exactly those, and the laser ray tests exactly those edges (and the core's circle) on both sides. Getting deeper means cutting a way there. Cracks spread across a chunk as it's cut. Your own beam is drawn from your own aim with the same ray, so it doesn't lag. **The beam originates at the ship's red dot** (owner, 2026-10-18: the ability origin marked on the ship sheet — the Miner's emitter, `muzzle` 8.3 m ahead of center; the server's ray, your aim and the drawn beam all start there). The sheet's dots for the other ships, for when they return: Scanner 52%, Booster 42%, Hauler 53% of their length from the stern, all on the centerline.
- **Ore bits ride the beam into the miner's hold (owner, 2026-10-18).** Waves run on the laser only when it cuts a chunk with ore bits: each bit leaves the chunk as the cut passes its share of the chunk's health (a 3-bit chunk sends one at ⅓, ⅔ and the break; a 1-bit chunk at the break) and rides a warm red-to-orange wave from the tip **toward the ship**, carrying the bit in the ore's color, at 140 m/s (`LASER.bitSpeed`). When it reaches the emitter the bit (100 units) is in the hold and **the ship swells for a second**. A full hold leaves the overflow adrift by the ship as drops. Timed on the server's clock. No shocks, no chain breaks, no heat — every chunk is broken by the laser, one at a time.
- **The core** sits in the middle, always in view, drawn beneath the masonry: blue, **swelling as the masonry around it comes away** (up to ×2.5 radius by the share of chunks broken, `CORE.grow`), **cracking as the laser damages it**. The laser reaches it only down a path you've cut.

## The piñata (owner, 2026-10-18)

- **The core holds its own corium (owner, 2026-10-18): deeper asteroids and asteroids with more layers drop more** — 100 × layers × the ring's factor (1, 1.5, 2) units, in whole lumps (`CORIUM`). Corium is a new ore (violet), found only in cores.
- **Breaking the core bursts all its corium out around the rock as drops** (100-unit lumps, scattered out to ~1.4 × the rock's radius), **free for anyone, picked up by flying over them** — they pour in up to the room aboard; **the rest waits for more trips**. The rest of the rock shatters (unmined chunks are gone, with any ore bits still in them). A drop drifts for **5 minutes**, then it's gone; **a small ring around it sweeps away over those 5 minutes** as its despawn timer (owner, 2026-10-18). Drops survive restarts (`ring_drops`).
- **Drop cargo:** right-click (or hold) the cargo squares to jettison the hold as drops where you sit.

## Tractor fields (owner, 2026-10-18)

- **The Miner and the Hauler press F to switch on holographic tractor areas out of both sides of the hull** (the owner's marked ship sheet): a trapezoid on each side, narrow at the hull and flaring outward — Miner: 36–70% of the hull's length at the hull, 12–76% at its outer edge, reaching half a ship length (~40 m) out; Hauler: 42–56% at the hull, 22–76% outside, a fifth of its length (~62 m) out (`SHIPS.*.tractor`, with each hull's `pivot` and half-width `hw`). **Any ore drop or jetcan you may haul inside an area is pulled toward the ship** (45 m/s, `TRACTOR.pull`) and scooped when it arrives; nothing is pulled while the hold is full, and your own jetcan only once you've flown off from it. F again switches it off; boarding another ship switches it off. Drawn as a faint ice hologram fading outward, scan lines drifting out from the hull, and a flickering edge — visible to everyone nearby.

## Jetcans (owner, 2026-10-18)

- **Send out a jetcan:** right-click (or hold) the cargo squares → **Jetcan**. The hold pours into a new can just behind the ship, **up to 100 ore bits** (10,000 units; the rest stays aboard). Every send makes a new can. **Up to 3 private cans per pilot** (owner, 2026-10-18); sending a 4th asks first — *Destroy your oldest jetcan and the ore in it?* — and Destroy removes the oldest, ore and all, then sends the new one. Public cans don't count.
- **Who can haul from it:** a **base** can only its owner; a **party** can only that party's members; a **public** can anyone. Haul by flying within 40 m — it pours in up to the room aboard, in as many trips as it takes; an empty can is gone. **The owner can haul from their own can only after flying 100 m away from it** (no re-scooping it on the spot; a top-up re-arms that).
- **Solo pilots make base cans; party members make party cans.** Either **turns public after 30 minutes**; a party can also **when its party disbands**. **A public can lasts 15 minutes**, then it's gone with whatever is left in it. (There are no parties in the game right now, so every can starts as a base can; the party rules are wired for when parties return.)
- Drawn from the owner's jetcan sheet: the 66 × 35 sprites (base, party with a purple outline, public with a white one), each blinking its light, 26.6 m long (the ships' 0.403 m per sheet pixel), lying along the heading it was sent on (`website/assets/jetcan/`, `JETCAN` in rules.js). Cans survive restarts (`ring_jetcans`).
- **Delivery** (flying into the station circle) empties the hold **into the deliverer's own station storage**.

## The ships

- **The Miner mines; the Scanner, Booster and Hauler fly but have no abilities yet** (owner, 2026-10-18: "add the other ships to fly just dont have them doing anything just yet"). Board any of them free at the station. Miner: hold 1,200, speed 80, laser 15 / s at 220 m, vision 1,000 m. Scanner: hold 600, speed 85, vision 1,500 m. Booster: hold 600, speed 85. Hauler: hold 6,000, speed 70. Every ship scoops ore drops into its hold by flying over them. **Ships are sized proportionally to the ship sheet** (owner, 2026-10-18: the Miner keeps its ~80 m; 0.403 m per sheet pixel): Scanner ~87 m, Booster ~185 m, Hauler ~312 m long, and each bumps at its own radius scaled the same way (24 / 26 / 55 / 93 m; `SHIPS.len`, `SHIPS.r`). **Each ship turns around its pivot and exhausts from its engines** (owner, 2026-10-18: marked pink and red on the ship sheet): the ship's position is its pivot (Miner 41% along from the stern, Scanner 34%, Booster 42%, Hauler 41%, all near the centerline), the sprite is drawn around it, and exhaust streams from each engine at the stern (Miner 3, Scanner 2, Booster 2, Hauler 5; `SPRITE_META` in game.js). The Miner's emitter is 15.8 m ahead of its pivot. The tutorial on a ship without a laser is a short flight version (fly out, scoop, deliver). W / S thrust along the nose, A / D turn, Q / E strafe; the mouse aims; **holding the left button fires**; the wheel zooms. **On a touch screen: twin sticks** — the left half flies, the right half aims and fires — holding still half a second opens the thing's menu, a second finger pinches the zoom, zoom buttons by the minimap.
- **Fog of war:** nothing beyond the ship's vision is sent; the world fades to dark past the edge. Ships bump off rocks, pass through each other, can't be destroyed. **No PvP.**

## The station

- Flying into the station circle docks (delivering everything aboard) and opens the **Station panel**: **Storage**, each ore's count. Below it, **the ships** (name, numbers, **Board**).

## The optional tutorial (owner, 2026-10-18)

- A **Tutorial chip** by the hold bar starts a 6-step walkthrough (fly to a rock, cut through the masonry, cut an ore chunk so its bits ride back into the hold, break the core, scoop the corium, deliver); **steps advance as the player actually does them**; ✕ dismisses it. The owner-requested exception to "no helper text."

## Map and HUD

- **The minimap** (bottom left): Saturn, the station, the three rings, the locked line, your ship, ships near you, **your marked rock** (gold diamond; right-click / hold a rock → Mark). A gold arrow circles your ship pointing at the mark, on or off screen, and stays until the rock is unmarked or mined out (owner, 2026-10-18).
- **The hamburger** (top left, owner, 2026-10-18): its menu says **Settings**; the Settings panel offers **Respawn at station** (the ship reappears just south of the station, hold kept aboard). ✕ or Esc closes it.
- **The HUD** (bottom center): the Tutorial chip, the ship's name chip and the hold bar, with **one square per ore type above it** (ore color, its count). Names over other ships (dim, bright under the pointer).

## Live updates (kept)

- Every push to `main` warns every connected player ahead of the switch (1 s for now; owner, 2026-10-12), then `play.html?updating=1` waits for the new build and shows the name form when it lands.
- The deploy workflows: `deploy-website.yml` on `website/**`, `deploy-server.yml` on `packages/server/**`.

## The look

- **The design document's style** (`theme.css`): the void, plates with hairline borders, warm ink, Saturn gold for actions, signal red for the laser and the locked line. **Big Shoulders Display**, **Atkinson Hyperlegible**, **JetBrains Mono**, self-hosted. **Ships are pixel-art sprites from the owner's ship sheet** (updated 2026-10-18 with doubled linework on the bigger ships; same sizes) (owner, 2026-10-18: `website/assets/ships/` — Miner, Scanner, Booster, Hauler, cut from the sheet; drawn crisp at the ship's existing size, nose forward; the vector `shipart.js` art stands in only until a sprite loads); the station and Saturn from `shipart.js`; rocks chunk by chunk from the server's geometry in the chunk sheet's style (outlined slabs in three density greys, ore-colored bits, the blue swelling core); each rock's masonry is cached as one bitmap, redrawn when its layout or the zoom changes.
- **Motion:** exhaust trails, laser sparks, **the chunk under a laser bouncing slightly outward while it's cut — the rest of the asteroid holds still** (owner, 2026-10-18: no more whole-rock shake), crack debris, ore bits riding the beam home and the ship swelling as each lands, the piñata's burst rings, shards and screen shake, eased zoom, a camera that looks slightly ahead, a pulsing dock circle — skipped for reduced-motion browsers.

## Rejected / removed (don't reintroduce)

- **The laser anchoring to chunks** (the "sticky beam" that kept cutting a chunk while the aim wobbled near it; owner, 2026-10-18: "stop the laser anchoring to chunks"), and **arc-shaped hit tests under jittered drawings** (the hitbox is the drawn polygon now).
- **Removed going back to basics (owner, 2026-10-18: "lets start from the bottom … just miner for now"):** **heat** (chunk heat, core heat, overheated cores burning down, cooling, heat seep, hot chunks cutting faster); **the beam's blue/yellow/red temperature stages**; **the Miner's charge shot**; **bursts / chain breaks**; **bedrock** (and per-ring bedrock weight, bedrock-free lines, boosted-only cutting); **hidden masonry and scanning** (every chunk is visible); **the Scanner (drill, tow), the Booster (boost beam, coolant), the Hauler (refine beam)** and their mode switches and hotkeys; **core weakening from stripped chunks**; **the core's rare ore**; **pop payouts into holds** (the core piñatas everything as drops now); **pop banks credited per miner**. **Later the same day (owner, 2026-10-18):** the laser's push on the ship (waves landing at the tip kicking it back), the always-running waves on the beam, and **ore bits banking into the core** (bits go to the miner's hold now; the core drops its own corium).
- **Removed with the sandbox build (owner, 2026-10-18):** accounts as the way in; chat entirely; parties and splits, party crates, the daily downtime; cans and crates; fuel and the Fueler; money (credits, prices, selling); the in-game admin button/panel and the developer panel (the server keeps the admin hooks and the tune op); services for hire; tow claims.
- **The pre-redesign ring game (owner, 2026-10-18)**: crack-count asteroids and client-built rocks (`ringgen.js`); loose ore; names on ore units; modules, upgrades, the Shop; trading; refine queues; Greek ore names; the first tutorial; shards; corporations.
- **PvP, for now if not ever (owner, 2026-10-16).** **No helper or hint text anywhere; tooltips show names only (owner)** — the tutorial is the owner-requested exception.
- **The 3D team game (owner, 2026-10-16)**, **the first 3D version** (2026-10-15), **the 2D space game (2026-10-12)** and its leftovers. Their tables stay untouched. **All old branches were deleted (owner, 2026-10-18).**
