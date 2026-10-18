# Atamus: how the game works today

This is a living spec of the game. Read it before every patch, and update it in the same commit as any change to behavior. Rules marked **(owner)** were decided explicitly by the owner, so keep them unless the owner says otherwise.

## The sandbox build (owner, 2026-10-18: "make the sandbox the atamus live server")

The owner iterated a single-player mining sandbox (a Claude artifact) through a day of design changes, then replaced the live game with it. On top of the mining redesign ("Crack, Bank and Haul", design document draft 9, `docs/Atamus_Ring_Mining.html`), the sandbox build means: **no login (create a name and play), no chat, no parties, no admin or developer UI in the game, no fuel, no money** — delivery pays ore into the deliverer's station storage. Four ships: **Miner, Scanner, Booster, Hauler** ("for now no fueler"). Kept: Saturn, the three rings, sectors, fog of war, movement, towing, marks, the minimap, live updates, the server-authoritative core.

**Old data is kept (owner):** every old table stays untouched. The game uses `ring_players`, `ring_drops`, `ring_meta`, `ring_tuning`, `guests` (`ring_cans`, `ring_corps` and the account tables stay, unused by the game).

Every number is in `packages/server/src/game/rules.js` and is sent to the client in the hello. Staff sessions can still tune them over the socket (`t: "tune"`); there is no in-game UI for it.

## Names and sessions (owner, 2026-10-18: no login)

- **Create a name and play:** `play.html` asks for a pilot name (3–20 letters, numbers, spaces, `-` or `_`; the name filter and banned names apply) and sets a year-long token cookie that owns the pilot (`guests` table; `POST /auth/guest`). The same browser resumes its pilot and can rename at the door; names are not unique.
- The game socket accepts the guest cookie (or an account session, which still exists for staff; the login/signup pages are unlinked but reachable by URL). **One session per pilot** (a new tab replaces the old: 4002), **one pilot per device** (4003).
- The front page's Play now goes to `play.html`. The header's Log in link is gone.

## The world

- **A 2D plane, north up.** Saturn sits at the center (nothing flies inside it); **one station** sits just north of it. Around them, **three asteroid rings**: ring 1 (3–9 km), ring 2 (12–18 km) and ring 3 (21–28 km). **Deeper means outward**: rarer ores (ring 1 iron/ice/titanium; ring 2 titanium/cobalt/platinum; ring 3 cobalt/platinum), **thicker asteroids** (shells rolled per ring: 2–5, 4–8, 7–10), **heavier bedrock (`ringBed` ×1 / ×1.6 / ×2.4) and rarer rocks (`ringSpawn`)**. A **red dashed locked line** at 29 km.
- **Four sectors, North, East, South and West**, name the zones; all four are always open. **The zone** shows top center; **hovering the minimap names the zone under the pointer.**
- **Seeded rocks:** the rings are cut into 700 m cells; each cell rolls one rock slot (60% hold one) from a secret only the server knows, with a 6-hour epoch and a per-slot generation. Rocks exist only near players; an untouched rock vanishes when nobody's been near and comes back the same. **A popped rock's slot re-rolls after 45 s**; a part-mined rock lasts **30 minutes after it was last touched**, then re-rolls too. **The client never builds rocks from seeds.**

## The asteroid (hidden masonry around a core)

- **A rock is shells of chunks around a core**, its size its shell count (owner, 2026-10-18: 2 shells up to 10, rolled per ring — thicker deeper): radius 46 + 11 × shells, chunk budget 18 + 7 × shells spread over the shells' circumferences, core radius/health/rare payout scaling with the shells (`ROCK_SIZE`), ore types 1 (≤4 shells), 2 (≤7) or 3. Shells are cut into chunks of varying length and thickness, seams staggered, thick shells splitting into stacked towers.
- **Unscanned rock is one solid mass** — the chunk geometry travels to clients, but density and ore only once scanned, so nothing can be read by looking or out of the traffic. **Chunks draw as jittered rock-shaped slabs** (owner, 2026-10-18: not perfect arcs), with lit outer and shadowed inner edges.
- **A chunk's health is its area × its density** (hpK): Soft ×0.55 (paler), Normal ×1, Dense ×2.3 (darker, speckled, +1 ore pip), Ultra ×4 (darkest, +2 pips), **Bedrock ×5 (near-black — owner, 2026-10-18: no red hatching, just much darker) — and only a boosted laser can cut it**. Everyone else's laser just wears it bare. **Bedrock is rich: always ore, base +200 units (`bedOre`)** — banked when a boosted laser breaks it, **lost when anything else opens it** (the drill's collateral). Bedrock ignores bursts and **doesn't count toward how stripped a rock is**. **Rings 1 and 2 guarantee one straight bedrock-free line to the core** (`ringFree`); **ring 3 doesn't — its cores can roll bedrock-encapsulated.**
- **About half of breakable chunks are barren.** Ore chunks hold a 100-unit drop (+100 dense, +200 ultra) of one of the rock's ore types, drawn from its ring's ores.
- **Ores: Iron, Ice, Titanium, Cobalt, Platinum**, plus the core's rare ore. **There is no money** (owner, 2026-10-18): ore in storage is the score.

## The beam, mining, bursts

- **The cutting laser belongs to the Miner (15 / s at 220 m, the strong one), the Scanner and the Hauler (5 / s at 180 m). The Booster carries no laser at all** (owner, 2026-10-18). The laser **cuts the first solid chunk on its line**; getting deeper means cutting a way there.
- **The beam has a temperature (owner, 2026-10-18): blue, yellow, red.** Held on rock it warms (~5 s to yellow, ~10 more to red; `BEAM.ramp` 14 s to full); **letting go snaps it back to blue; firing off the rock cools it.** Each stage cuts and heats differently: **blue ×1 and adds no heat at all; yellow ×1.5, heating slowly; red ×2.2, heating fast** (`BEAM.dpsF` / `heatF`). The beam draws in its own color, so it is the heat gauge.
- **Heat:** a yellow or red beam runs the chunk orange (0.09 heat/s × its density's heat factor — dense ×1.6, ultra ×2.2, **bedrock ×3** — × the beam stage, × a boost), and a share leaks to every touching chunk. Chunks cool slowly on their own. **A hot chunk also cracks faster — laser damage up to ×3 at full heat (`HEAT.chunkBreak`)** — so overheating trades speed against the cooling you'll owe, or a blown core. **A chunk's heat at the moment it breaks pours into the core** (× `coreK`).
- **The Miner's charge shot (owner, 2026-10-18):** a chunk at its breaking point **primes instead of popping while the beam holds** — keep holding to overcharge (~2 s to full; the beam runs white); **released, it blasts damage into the chunks behind it along the held line** (up to ~55 m at full charge, ×0.9 max-health damage each), with **a heavy heat price** (+0.5 × charge to every chunk the blast touches). Tap-release still breaks chunks one at a time, clean.
- **The beam sticks:** an aim wobble onto a touching chunk keeps cutting the one under way — but only while the aim stays within 3 m of that chunk's footprint; aiming squarely at a neighbor retargets. Your own beam is drawn from your own aim, so it doesn't lag the mouse.
- **The Scanner is the core driller.** The **Mine | Drill switch** sits by the hold bar (F flips it; tapping a segment picks it). In Drill, **holding fire bores a straight radial line toward the core** from wherever the ship sits, **revealing every chunk the head passes** (visible to everyone), and the ship keeps flying — **orbit the rock and the drill sweeps onto the next column**. Letting go stops it. It takes no ore; **bedrock is slow (×0.2) and shocks the chunks touching it — that ore is lost** (the loss cascades). A boost speeds the drill like everything else.
- **Bursts:** breaking a chunk shocks every touching chunk for **25% of its maximum health**; chains cascade. Bedrock and the core ignore shocks. Cut order matters.
- **Broken chunks drop nothing: their ore flies into the core and banks there**, credited to whoever broke the chunk.
- **Towing does not claim** (owner's claims rule retired with parties): any rock can be mined by anyone.

## The core and the pop

- **The core is blue and grows as chunks are stripped** (owner, 2026-10-18: any chunks, not just banked ore — up to ×2.5 radius, `CORE.grow` 1.5, with a little gulp as ore banks in), **running blue to orange as its heat climbs**. **Cracks across the core show how mined it is**: every chunk stripped weakens it a little (down to at most half its health — `CORE.weaken` — chunks alone can never pop it) and the laser's direct damage deepens the same cracks. **No numbers on screen.**
- **A hot core breaks up to ×4 faster — and an overheated core (heat at 100%) burns itself down and pops early with no popper**: absent contributors' banks and the rare ore are forfeited (a banked miner still present is paid), and everything still attached shatters. The Booster's coolant spray pulls heat back out — **cooling a chunk also pulls core heat at half rate** (owner, 2026-10-18).
- **The pop pays everything banked**: each miner's bank into their own hold (a contributor who's gone forfeits to the popper), **plus the core's rare ore to the popper** (`rareMax` by size × the strip fraction; bedrock not counted). Everything still attached shatters and its ore is lost.
- **Anyone may pop a core, strangers included.**

## Ships (owner: each role is its own ship, swapped free at the station)

W / S thrust along the nose, A / D turn, Q / E strafe; the mouse aims; **holding the left button fires the beam**; **F flips the mode switch by the hold bar**; the wheel zooms. **On a touch screen: twin sticks** — the left half flies, the right half aims and fires — holding still for half a second opens the thing's menu, a second finger on a busy half pinches the zoom, zoom buttons by the minimap. New players start as a **Miner**.

| Ship | Role | Numbers (start) |
| --- | --- | --- |
| **Miner** | The strong laser and **the charge shot** (prime a breaking chunk, release to blast); pop ore lands in miners' holds. | hold 1,200, laser 15 / s at 220 m, vision 1,000 m |
| **Scanner** | **The core driller** (Mine \| Drill switch) — its held drill surveys a line to the core; **also tows** (hold / right-click a rock: Tow; slower the bigger the rock). Sees furthest. | hold 600, drill 9 m/s (×0.2 in bedrock) at 250 m, vision 1,500 m, tow at 250 m |
| **Booster** | **The coordinator — no laser** (owner, 2026-10-18). **Boost \| Cool switch**: in Boost, **a held beam boosts one ship at a time** — green pluses stream in, the target glows blue and runs **×1.6 at whatever it's doing** (mining, drilling, cooling, refining) for 15 s from the last beam tick (no cooldown), and **boosted lasers are the only thing that cuts bedrock**. In Cool, a **coolant spray** (a stream of blue squares, no beam line; a white ring marks the cursor) pulls heat from chunks and cores at 0.3 / s. | hold 600, boost ×1.6 at 350 m, cool at 180 m |
| **Hauler** | The big hold with the refinery aboard: **compresses its own raw ore en route** (a 100-unit block every 5 s; refined takes a fifth of the room) and, on its **Mine \| Refine switch, a refine beam that compresses another ship's cargo where it sits** (owner, 2026-10-18). **Can never drop cargo.** | hold 6,000, laser 5 / s, refine at 200 m |

- **No fuel** (owner, 2026-10-18: "for now no fueler" — fuel went with it). No distress beacons.
- **Fog of war:** a ship sees its vision (the Scanner furthest); nothing beyond it is sent, and the world fades to dark past the edge.
- Ships bump off rocks, pass through each other, can't be destroyed. **No PvP.**

## Where ore goes (holds and drops)

- **At the pop, ore goes straight into the miners' holds. What doesn't fit scatters around the rock as drifting ore drops** (owner, 2026-10-18): 100-unit lumps, **free for anyone, picked up by flying over them** — they pour in up to the room aboard, and **the rest waits for as many trips as it takes** (or one visit from a Hauler). A drop drifts for 30 minutes (`DROPS.linger`), then it's gone. Drops survive restarts (`ring_drops`).
- **Drop cargo:** any ship but a Hauler can jettison its hold (right-click / hold the cargo squares): it scatters as drops at the ship's position, free for anyone.
- **Delivery** (flying into the station circle) empties the hold **into the deliverer's own station storage** — no splits, no money. The station panel's Storage section shows the counts.
- A banned pilot's hold scatters as drops where they were.

## The station

- Flying into the station circle docks (delivering everything aboard) and opens the **Station panel**: **Storage** (each ore's count) and the **four ships** (name and numbers; **Board** swaps, free). Switching ships ends tow/drill and resets the mode switch.

## The optional tutorial (owner, 2026-10-18)

- A **Tutorial chip** by the mode switch starts a per-ship walkthrough (5 short steps; a ✕ dismisses it; switching ships restarts it for that ship). **Steps advance when the player actually does them** (fly to a rock, cut, blast, pop, deliver; drill and sweep; boost a ship; refine), with timed fallbacks. This is the owner-requested exception to "no helper text" alongside nothing else: tooltips elsewhere stay name-only.

## Map and HUD

- **The minimap** (bottom left): Saturn, the station, the three rings, the locked line, your ship, ships near you, **your marked rock as a gold diamond** (hold / right-click a rock → Mark; yours only, until the rock is gone); the wheel zooms it; hovering names the zone. An off-screen mark gets a gold arrow at the screen's edge.
- **The HUD** (bottom center): **the mode switch and the Tutorial chip**, then the ship's name chip and the hold bar (brown raw, purple refined). **Above the bar, one square per ore type** (raw / refined each their own), in the ore's color with its count; refined squares edged white. Hovering a square shows its ore and count (tooltips stay name-only otherwise).
- **Names over ships** (dim, bright under the pointer). **Right-click menus:** a rock — Mark, and Tow on a Scanner; the cargo squares — Drop cargo (never on a Hauler).

## Live updates (kept)

- Every push to `main` warns every connected player ahead of the switch — **1 s for now (owner, 2026-10-12)**: "Update incoming — N s" top center, then `play.html?updating=1`, which waits for the new build and shows the name form when it lands. While an update is in progress nobody gets in.
- The deploy workflows: `deploy-website.yml` on `website/**`, `deploy-server.yml` on `packages/server/**`.

## The look

- **The design document's style for the game and the website** (`theme.css`): the void, plates with hairline borders, warm ink, Saturn gold for actions, ice blue for the drill and coolant, purple for refined ore, brown for raw ore, signal red for the locked line. **Big Shoulders Display** titles, **Atkinson Hyperlegible** text, **JetBrains Mono** numbers, self-hosted. Ships, the station and Saturn from the ship art (`shipart.js`); rocks chunk by chunk from the server's geometry — **jittered rock-shaped slabs with lit/shadowed edges, near-black bedrock, the blue swelling core** (owner, 2026-10-18).
- **Beams:** the cutting laser blue → yellow → red by its own temperature, white and widening as a charge winds up, with matching sparks; the charge's release a white lance; the coolant a water-like stream of blue squares splashing over the rock; the boost beam green pluses streaming to its one target; the refine beam purple squares; the drill ice.
- **Motion:** exhaust trails, laser sparks and shivering rocks, crack debris and ore streaking into the core, the pop's rings with screen shake, broken chunks shattering into drifting shards, pop payouts flying core-to-ship and into the hold bar, eased wheel zoom, a camera that looks slightly ahead, a pulsing dock circle — skipped for reduced-motion browsers; particles capped.

## Rejected / removed (don't reintroduce)

- **Removed with the sandbox build (owner, 2026-10-18: "make the sandbox the atamus live server, no chat, no admin tools, no dev tools, no login"):**
  - **Accounts as the way in** (sign-up, log in, Remember Password, recovery questions as the play flow — the pages stay by URL for staff; guests own pilots by token cookie now). The "logged in this tab" gate (`needLogin`).
  - **Chat entirely** (tabs, channels, whispers, `/commands`, the chat bubble on touch, mutes as a player-visible thing, reports from the game, staff badges).
  - **Parties and everything on them**: invites/prompts, the party list, party ore tags, favorable-percent splits, party crates, crate unlocking with the deliverer's share, the daily downtime (party crates auto-delivering, 09:00 UTC), party minimap markers, mates. Delivery pays the deliverer alone now.
  - **Cans and crates** (lock/public timers, one-can rule, pick-up menus, the can arrow) — overflow is free-for-all drops now. `ring_cans` stays in the database untouched.
  - **Fuel entirely**: tanks, burns, the fuel bar, station fuel sales, crawling, distress beacons and their "!" markers — and **the Fueler ship** ("for now no fueler").
  - **Money**: credits, ore prices, selling from storage, the credits HUD. Storage holds ore counts, full stop.
  - **The admin button and panel in the game, and the developer panel** (the server keeps the admin hooks and the tune op for staff sessions; no game UI reaches them). `adminpanel.js` / `admin.css` are no longer loaded by the game page.
  - **Services for hire** (`/rate`, Hire, per-second charges), **the Booster's area pulse** (one-ship held beam now), **the Booster's own laser and its bedrock-cutting** (no laser at all now), **the Miner's brief Cool mode** (sandbox iteration; cooling is the Booster's), **tow claims** (towed rocks were minable only by the tower's party), **fixed small/medium/large rock sizes and `RING_SIZES`** (shells roll per ring now), **red-hatched bedrock** (much darker instead), **the core ripening gold-to-orange from banked ore and swelling only with banked ore** (blue, growing with stripped chunks, orange with heat, cracking with damage), **heat-free mining** (the beam stages decide heating now), **the ore-count core crack visual** (cracks are damage now).
- **The pre-redesign ring game (owner, 2026-10-18)**: crack-count asteroids and client-built rocks from seeds (`ringgen.js`); loose ore waiting to be clicked; names riding on ore units; module slots, upgrades and the Shop; trading by request; the station's storage grid, refine queues, Make fuel; field refining pop-ups; the fueler's world pay; Greek ore names; crawl-home custody; the first tutorial (`ring_players.tutorial`); shards (zone copies); corporations (`ring_corps` untouched); the old developer-panel shapes (pre-sandbox `ring_tuning` blobs are ignored by `_v`).
- **PvP, for now if not ever (owner, 2026-10-16).** **No helper or hint text anywhere; tooltips show names only (owner)** — the per-ship tutorial is the owner-requested exception.
- **Sectors opening with player counts** (owner, 2026-10-16: always open).
- **The 3D team game (owner, 2026-10-16)** and **the first 3D version's** tooling before it (owner, 2026-10-15). **The 2D space game before that (owner, 2026-10-12: "wipe the main game")** — the Expanse, pilots, licenses, markets, POIs — along with IP geolocation, password reset requests, login records, and the 2D-era admin leftovers. Their database tables stay untouched for reference. **All old branches were deleted (owner, 2026-10-18)** — history lives in git log only; `reference/` keeps old snapshots.
