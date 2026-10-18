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

- **A 2D plane, north up.** Saturn at the center (nothing flies inside it); **one station** just north of it. **Three asteroid rings**: 3–9 km, 12–18 km, 21–28 km. **Deeper means outward**: rarer ores (ring 1 iron/ice/titanium; ring 2 titanium/cobalt/platinum; ring 3 cobalt/platinum), **thicker asteroids** (shells rolled per ring: 2–5, 4–8, 7–10), rarer rocks (`ringSpawn`). A **red dashed locked line** at 29 km.
- **Four sectors** name the zones (top center; hovering the minimap names the zone under the pointer).
- **Seeded rocks:** 700 m cells, one rock slot each (60%), from a server-only secret, a 6-hour epoch and a per-slot generation. Rocks exist only near players. **A popped rock's slot re-rolls after 45 s**; a part-mined rock lasts **30 minutes after its last touch**. The client never builds rocks from seeds.

## The asteroid: a core surrounded by masonry

- **A rock is shells of masonry chunks around a core**, its size its shell count (2–10, rolled per ring): radius 46 + 11 × shells, chunk budget 18 + 7 × shells spread over the shells' circumferences, core radius and health scaling with the shells (`ROCK_SIZE`), ore types 1 (≤4 shells), 2 (≤7) or 3.
- **Every chunk is visible** — its density (shade) and its ore (colored pips) show from the start (owner, 2026-10-18: no Scanner, so nothing is hidden). Chunks draw as jittered rock-shaped slabs with lit/shadowed edges.
- **Density (owner): denser takes longer to mine, and holds more ore.** A chunk's health is its area × its density: Soft ×0.55 (paler), Normal ×1, Dense ×2.3 (darker, speckled), Ultra ×4 (darkest). **About half the chunks are barren**; an ore chunk holds one ore bit (100 units), +1 bit if dense, +2 if ultra.

## Mining

- **The Miner's laser (15 / s at 220 m) hits exactly what it points at (owner, 2026-10-18):** the first unbroken chunk — or the core — its line meets, with **no anchoring or lock-on**. **Every chunk has an exact hitbox**: the server builds each chunk's rock-shaped polygon once, sends the points to clients, which draw exactly those, and the laser ray tests exactly those edges (and the core's circle) on both sides. Getting deeper means cutting a way there. Cracks spread across a chunk as it's cut. Your own beam is drawn from your own aim with the same ray, so it doesn't lag.
- **When a chunk breaks, its ore bits fly into the core and bank there.** No shocks, no chain breaks, no heat — every chunk is broken by the laser, one at a time.
- **The core** sits in the middle: blue, **swelling as ore bits bank into it** (up to ×2.5 radius, `CORE.grow`, with a gulp per swallow), **cracking as the laser damages it**. The laser reaches it only down a path you've cut.

## The piñata (owner, 2026-10-18)

- **Breaking the core bursts every stored ore bit out around the rock as drops** (100-unit lumps, scattered out to ~1.4 × the rock's radius), **free for anyone, picked up by flying over them** — they pour in up to the room aboard; **the rest waits for more trips**. The rest of the rock shatters (barren and unmined chunks are gone; ore still in unmined chunks is lost). A drop drifts for 30 minutes, then it's gone. Drops survive restarts (`ring_drops`).
- **Drop cargo:** right-click (or hold) the cargo squares to jettison the hold as drops where you sit.
- **Delivery** (flying into the station circle) empties the hold **into the deliverer's own station storage**.

## The ship

- **Just the Miner for now** (owner, 2026-10-18): hold 1,200, speed 80, laser 15 / s at 220 m, vision 1,000 m. W / S thrust along the nose, A / D turn, Q / E strafe; the mouse aims; **holding the left button fires**; the wheel zooms. **On a touch screen: twin sticks** — the left half flies, the right half aims and fires — holding still half a second opens the thing's menu, a second finger pinches the zoom, zoom buttons by the minimap.
- **Fog of war:** nothing beyond the ship's vision is sent; the world fades to dark past the edge. Ships bump off rocks, pass through each other, can't be destroyed. **No PvP.**

## The station

- Flying into the station circle docks (delivering everything aboard) and opens the **Station panel**: **Storage**, each ore's count. (With one ship, there is no boarding list.)

## The optional tutorial (owner, 2026-10-18)

- A **Tutorial chip** by the hold bar starts a 5-step walkthrough (fly to a rock, cut through the masonry, break the core, scoop the ore, deliver); **steps advance as the player actually does them**; ✕ dismisses it. The owner-requested exception to "no helper text."

## Map and HUD

- **The minimap** (bottom left): Saturn, the station, the three rings, the locked line, your ship, ships near you, **your marked rock** (gold diamond; right-click / hold a rock → Mark). An off-screen mark gets a gold arrow at the screen's edge.
- **The HUD** (bottom center): the Tutorial chip, the ship's name chip and the hold bar, with **one square per ore type above it** (ore color, its count). Names over other ships (dim, bright under the pointer).

## Live updates (kept)

- Every push to `main` warns every connected player ahead of the switch (1 s for now; owner, 2026-10-12), then `play.html?updating=1` waits for the new build and shows the name form when it lands.
- The deploy workflows: `deploy-website.yml` on `website/**`, `deploy-server.yml` on `packages/server/**`.

## The look

- **The design document's style** (`theme.css`): the void, plates with hairline borders, warm ink, Saturn gold for actions, signal red for the laser and the locked line. **Big Shoulders Display**, **Atkinson Hyperlegible**, **JetBrains Mono**, self-hosted. **Ships are pixel-art sprites from the owner's ship sheet** (owner, 2026-10-18: `website/assets/ships/` — Miner, Scanner, Booster, Hauler, cut from the sheet; drawn crisp at the ship's existing size, nose forward; the vector `shipart.js` art stands in only until a sprite loads); the station and Saturn from `shipart.js`; rocks chunk by chunk from the server's geometry (jittered slabs, density greys tinted toward their ore, ore pips, the blue swelling core).
- **Motion:** exhaust trails, laser sparks, **the chunk under a laser bouncing slightly outward while it's cut — the rest of the asteroid holds still** (owner, 2026-10-18: no more whole-rock shake), crack debris and ore bits streaking into the core, the piñata's burst rings, shards and screen shake, eased zoom, a camera that looks slightly ahead, a pulsing dock circle — skipped for reduced-motion browsers.

## Rejected / removed (don't reintroduce)

- **The laser anchoring to chunks** (the "sticky beam" that kept cutting a chunk while the aim wobbled near it; owner, 2026-10-18: "stop the laser anchoring to chunks"), and **arc-shaped hit tests under jittered drawings** (the hitbox is the drawn polygon now).
- **Removed going back to basics (owner, 2026-10-18: "lets start from the bottom … just miner for now"):** **heat** (chunk heat, core heat, overheated cores burning down, cooling, heat seep, hot chunks cutting faster); **the beam's blue/yellow/red temperature stages**; **the Miner's charge shot**; **bursts / chain breaks**; **bedrock** (and per-ring bedrock weight, bedrock-free lines, boosted-only cutting); **hidden masonry and scanning** (every chunk is visible); **the Scanner (drill, tow), the Booster (boost beam, coolant), the Hauler (refine beam)** and their mode switches and hotkeys; **core weakening from stripped chunks**; **the core's rare ore**; **pop payouts into holds** (the core piñatas everything as drops now); **pop banks credited per miner**.
- **Removed with the sandbox build (owner, 2026-10-18):** accounts as the way in; chat entirely; parties and splits, party crates, the daily downtime; cans and crates; fuel and the Fueler; money (credits, prices, selling); the in-game admin button/panel and the developer panel (the server keeps the admin hooks and the tune op); services for hire; tow claims.
- **The pre-redesign ring game (owner, 2026-10-18)**: crack-count asteroids and client-built rocks (`ringgen.js`); loose ore; names on ore units; modules, upgrades, the Shop; trading; refine queues; Greek ore names; the first tutorial; shards; corporations.
- **PvP, for now if not ever (owner, 2026-10-16).** **No helper or hint text anywhere; tooltips show names only (owner)** — the tutorial is the owner-requested exception.
- **The 3D team game (owner, 2026-10-16)**, **the first 3D version** (2026-10-15), **the 2D space game (2026-10-12)** and its leftovers. Their tables stay untouched. **All old branches were deleted (owner, 2026-10-18).**
