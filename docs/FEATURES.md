# Atamus: how the game works today

This is a living spec of the game. Read it before every patch, and update it in the same commit as any change to behavior. Rules marked **(owner)** were decided explicitly by the owner, so keep them unless the owner says otherwise.

## The mining redesign (owner, 2026-10-18)

The owner replaced the game with **"Crack, Bank and Haul"** (design document draft 9, 17 Oct 2026, `docs/Atamus_Ring_Mining.html`): "recreate the game/server from whats only in this document." Kept from the old design, at the owner's direction: **Saturn, the two asteroid rings, the sectors, the fog of war, the movement, and single-role ships** (the old hull + one module is now just a ship type: its look and behavior). Everything else of the old gameplay was removed (see Rejected / removed). Accounts, chat, parties, the admin and moderator tools, the developer panel and live updates carried over.

**Old data is kept (owner):** every old table stays untouched. The game uses `ring_players`, `ring_cans`, `ring_meta`, `ring_tuning` (`ring_corps` stays, unused).

Every number is in `packages/server/src/game/rules.js` (the document's prototype numbers where it gives them; the rest placeholders meant to change) and is sent to the client in the hello. The developer panel edits all of them live.

## The world

- **A 2D plane, north up.** Saturn sits at the center (nothing flies inside it); **one station** sits just north of it. Around them, **two asteroid rings, both 6 km wide**: ring 1 (3–9 km out) and ring 2 (12–18 km out). **Deeper means outward**: ring 2 has the rarer ores (titanium, cobalt, platinum to ring 1's iron, ice, titanium) and bigger rocks (medium–large to ring 1's small–medium). A **red dashed locked line** at 19 km: nobody flies past it.
- **Four sectors, North, East, South and West**, radiate from Saturn and name the zones; all four are always open. **The zone** shows top center ("Station", "Ring 1 · North"); **hovering the minimap names the zone under the pointer.** No shards.
- **Seeded rocks:** the rings are cut into 700 m cells; each cell rolls one rock slot (60% hold one) from a secret only the server knows, with a 6-hour epoch and a per-slot generation. Rocks exist only near players; an untouched rock vanishes when nobody's been near for a couple of minutes and comes back the same. **A popped rock's slot re-rolls a new rock (new place in the cell, size, layout) after 45 s**; a part-mined rock lasts **30 minutes after it was last touched**, however far out it is, then its slot re-rolls too. The whole untouched field reshuffles every 6 hours. **The client never builds rocks from seeds** — every rock arrives from the server.

## The asteroid (hidden masonry around a core)

- **A rock is shells of chunks around a core** (owner, 2026-10-18: bigger, varied by shells and size): 6 / 9 / 12 shells and 90 / 130 / 175 m radius small / medium / large, each shell cut into chunks of varying length and thickness, seams staggered shell to shell, thick shells splitting into stacked towers. Up to ~100 chunks on a large rock (60 / 80 / 100 on average, spread over the shells' circumferences so chunks stay slab-sized at every depth), up to ~14 deep at one angle.
- **Unscanned rock is one solid mass** — no borders, no seams, no layout, no core showing — so nothing can be read by looking (the chunk geometry travels to clients, but density and ore only once scanned, so it can't be read out of the traffic either).
- **A chunk's health is its area × 0.5 × its density**: Soft ×0.55 (paler), Normal ×1, Dense ×2.3 (darker, speckled, +1 ore), Ultra ×4 (darkest, heavily speckled, +2 ore), **Bedrock never breaks** (dark red, hatched once known). Bedrock is ~1 in 7, ignores bursts, and **doesn't count toward how stripped a rock is**. **Every rock keeps one straight line to the core free of bedrock**, so a bore is always possible.
- **About half of breakable chunks are barren**: plain stone, no ore. Ore chunks hold 1 unit (+1 dense, +2 ultra) of one of the rock's ore types: **1 type on a small rock, 2 on a medium, 3 on a large**, drawn from its ring's ores.
- **Ores: Iron 10 · Ice 14 · Titanium 20 · Cobalt 30 · Platinum 60 credits a unit**, plus the core's rare ore at 50.

## Mining, scanning, bursts

- **Every ship has a laser and can mine (owner, 2026-10-18)** — support ships a light one (5 / s at 180 m), **the Miner the strong one (15 / s at 220 m)**. The laser **cuts the first solid chunk on its line** — it can't reach through rock, so getting deeper means cutting a way there. Cutting bedrock shows spreading cracks, then the chunk holds and turns dark red (the laser found out the hard way; the scanner spots bedrock at once).
- **The scanner's beam reveals the one chunk it touches** (0.35 s a chunk): borders, density, ore. **Scanned chunks are see-through to the scanner's survey**, so holding one angle maps deeper chunk by chunk, down to the core — while its light laser chews the surface chunk. **The map is visible to everyone** at the rock. Scanning is fast, cutting is slow.
- **The beam sticks:** an aim wobble onto a touching chunk keeps cutting (or scanning) the one under way, and your own beam is drawn from your own aim, not the server's echo, so it doesn't lag the mouse.
- **Bursts:** breaking a chunk shocks every touching chunk (side by side or stacked) for **25% of its maximum health**; a shock that finishes a chunk breaks it too and the chain cascades. Bedrock and the core ignore shocks. Cut order matters.
- **Broken chunks drop nothing: their ore flies into the core and banks there**, credited to whoever broke the chunk (cascades credit the breaker who started them).

## The core and the pop

- **The core swells as ore banks in** (up to +50% when it holds everything the rock had) **and ripens gold to orange**; the fuller it is, the faster it breaks (up to ×4). **No numbers on screen** — the size and glow are the only readout. An untouched rock shows no core at all.
- **The pop pays everything banked**: each miner's bank goes into their own hold (a contributor who's gone — offline or far away — forfeits to the popper), **plus the core's rare ore to the popper: 8 / 16 / 22 max by size, × the strip fraction** (broken ÷ breakable chunks, bedrock not counted). Everything still attached shatters and its ore is lost.
- **Anyone may pop a core, strangers included**, even if it shatters what others were working on; a half-eaten rock's fat glowing core is worth finishing (owner-accepted).
- A boosted miner cuts faster (the Booster, below); the laser reaches the core only down an open bore.

## Ships (owner: each role is its own ship, swapped free at the station)

One hull, one role; the ship's look is the old hull with that role's module section(s). **Every ship carries a light laser (the Miner's is the strong one)**, and **each ship keeps its own fuel between boardings** (a ship boarded for the first time starts with the starting fuel) (owner, 2026-10-18). W / S thrust along the nose, A / D turn, Q / E strafe; the mouse aims; **holding the left button fires the beam** (laser or survey); the wheel zooms. **On a touch screen: twin sticks** — the left half of the screen flies, the right half aims and fires (the design document). New players start as a **Miner** with 200 credits and a full tank.

| Ship | Role | Numbers (start) |
| --- | --- | --- |
| **Miner** | The mining specialist; pop ore lands in miners' holds. | hold 12, laser 15 / s at 220 m, vision 1,000 m |
| **Scanner** | Support: maps rocks; **also tows** (the old tractor): right-click a rock to latch it on a leash (slower and thirstier the bigger it is; not once it's popped). Sees furthest. | hold 6, scan 0.35 s at 600 m, vision 1,500 m, tow at 250 m |
| **Booster** | Support: speeds up **one player's mining at a time** (×1.6 in 350 m) — the job is choosing who. | hold 6 |
| **Fueler** | Support: pumps fuel into other ships (20 / s at 200 m) from a 700 tank. | hold 6 |
| **Hauler** | Carries and refines: a big hold for cans and crates, with an onboard refinery that **compresses cargo en route** (1 raw unit every 5 s while flying; a refined unit takes a fifth of the room, same value). **Can never drop what it picks up** — delivery is the only way out. | hold 60 |

- **Fuel:** flying burns it, working gear burns it. An empty tank means crawling at a fifth speed and a **distress beacon: a red "!" every player sees** (over the ship, at the screen edge, on the minimap) until it has fuel.
- **Fog of war:** a ship sees its vision (the Scanner sees furthest); **nothing beyond it is sent** — ships, rocks, cans, effects — and the world fades to dark past the edge. Distress beacons and party minimap markers stay global on purpose.
- Ships bump off rocks, pass through each other, can't be destroyed. **No PvP; no risk in transit** — only time takes ore.

## Where ore goes (holds, cans, crates)

- **At the pop, ore goes straight into the miners' holds** (party ore is tagged with the party roster at that moment). **What doesn't fit goes into a can locked to that player** by the rock: private for **30 minutes** wherever it is, then **public for 15 more**, then gone. **Public ore belongs to whoever delivers it.**
- **One can per player**: a new can despawns the old one, unless someone is already hauling it (hauled cans don't count).
- **In a party, overflow cans are party crates**, locked to the party; anyone in the party can haul them. **The owner can unlock a crate for outsiders** (right-click it) with a slider for the deliverer's share, **5–50%, locked at pickup** so it can't be dropped once the crate is aboard.
- **Unrelated miners on one rock each get their own share** of what they banked.
- **Drop cargo (owner, 2026-10-18):** any ship but a Hauler can jettison its hold (right-click the cargo squares): own ore becomes its can, party ore its party crates, at the ship's position, under the usual can rules (a refined unit dropped loses its compression; the value is the same). Anyone can pick up a can they're entitled to (it rides in the hold, taking its units of room); **once something is picked up it can never be dropped** — delivery is the only way out, and Haulers can never drop at all. **No cargo status display**: the game doesn't announce who is carrying what.

## Parties, delivery, downtime

- **Parties of up to 10**: invite from a ship's, a chat name's or a party member's menu, or `/party invite Name` (`/invite Name`); an **Accept / Decline prompt** (2 minutes; `/party accept` works too). The leader can kick; `/party leave`. The party list sits top left; members show gold on the minimap wherever they are.
- **A party splits ALL its ore evenly on delivery, wherever its members are** (offline members are paid in the database). **Tags outlast the party**: the split goes to whoever was in it at pickup/earn time.
- **Delivery** (flying into the station circle) empties everything aboard: your own ore pays you, party-tagged ore splits evenly, a public can pays the deliverer, an unlocked crate pays the deliverer their locked share and the party the rest.
- **Party crates auto-deliver at the daily downtime** (09:00 UTC) so a stalled shipment can't sit forever — **except aboard ships logged off in the 30 minutes before it** (grab-and-log-off doesn't skip the trip; a holder who stays online through that half hour can stall one hold — accepted, the party deals with it socially). **Your own ore never auto-delivers**: distance stays a real cost.
- **A banned player's tagged cargo still pays the others on its tags**; their held cans drop where they were.

## Services (support for strangers)

- **Party members get each other's services free.** Outside a party, a support ship can **post a per-second charge**: `/rate N` (up to 50 cr/s; `/rate 0` clears it). The rate shows beside the ship's name.
- **Hire** from the ship's menu: the payer is charged per second **only while the service works near them** (within 600 m): the Booster boosting their firing laser, the Fueler pumping them, the Scanner scanning. **Either side stops it any time** (Stop hiring / clearing the rate); running out of credits stops it too. One hirer at a time per support ship.

## The station

- Flying into the station circle docks (delivering everything aboard) and opens the **Station panel**: the **five ships** (name and numbers; **Board** swaps, free), and **Fuel** (**Fill** the tank at 0.4 a unit). Switching ships ends tow/pump/boost and clears a posted rate; the tank clamps to the new ship's.

## Chat

- **At the bottom right**: tabs **All | World | Zone | Party | Whisper**, the lines, then the input labeled **"[Channel] Name:"**. Picking a tab points the channel at it; **TAB while typing cycles the channel**. **Zone** reaches your ring + sector; **Whisper** one player (`/w Name message`, `/w "Name with spaces" message`). **Enter** opens and sends; Escape closes. 240 characters; no history.
- **Right-clicking a name in chat**: Whisper, Invite to party (or Kick for the leader), Report (to the admins with the player's recent lines; at most 5 in 10 minutes), and for staff **Admin**. A muted player's lines go nowhere.

## Map and HUD

- **The minimap** (bottom left): Saturn, the station, the rings, the locked line, your ship, ships near you, your party (gold, anywhere), distress beacons; the wheel zooms it; hovering names the zone.
- **The HUD** (bottom center): the ship's name chip, the hold bar (brown raw, purple refined), the fuel bar, credits. **Above the hold bar, one square per ore type (raw / refined / party each their own), in the ore's color with that square's own count** (owner, 2026-10-18); refined squares edged white, party ore dotted gold, cans and crates aboard as their own containers with their counts. Hovering a square shows its ore, count and worth (names only otherwise — tooltips stay name-only).
- **Right-click menus:** a ship — Whisper, party, Fuel / Boost (by your ship), Hire / Stop hiring, Report; a rock (scanner) — tow / release; a can — Pick up (also a plain left-click in reach), and on your own crate, Unlock for outsiders.

## The developer panel (owner, 2026-10-17; re-pointed 2026-10-18)

- **The head admin and admins get a [D] button.** Tabs: **World** (Saturn, safe zone, ring radii, locked line, load circle, cell; flying numbers), **Ships** (a ship at a time, every number), **Rocks** (chunk weights, densities, health, burst, barren; a rock size at a time; the core; the field's timings; each ring's sizes), **Ores** (each price; the pieces; can timings; the crate share range), **Economy** (start credits/fuel, docking, fuel price, services, downtime, limits). **Hovering a number's name says what it does** in a wrapped window.
- **A change applies to everyone at once and is kept** (`ring_tuning`, `_v: 3` — older saved blobs are from the old game and are ignored). The station's place is refused. Changing the rings, the cell, rock sizes or the spawn chance regrows every asteroid. **Reset all** (pressed twice) restores `rules.js`.

## Accounts and sessions

Kept from before (`auth.js`, `sessions.js`, `security.js`): sign-up with the EULA, log in / log out, Remember Password, **password recovery with the three security questions only**, device ids, failed-login backoff, bans (told at login, with ban appeals written from the login page) and the session cookie. **No login records are kept** (owner, 2026-10-13). **One session per account:** a new tab or device replaces the old one (4002). **One account per device** (4003).

- **The website** (atamus.io): play.html goes straight to **Enter System**. The front page's description is "WIP prototype of a cooperative space mining game." with Play now; the Updates list holds only the current game's entries. Login, signup, recovery and the EULA as they were.
- **The admin panel** (owner, 2026-10-13): staff accounts (head / admin / mod; Nyssary is the Head Admin) see an **[A] button** (right edge, centered; left of the station panel while docked). One window, one size; sections **Players** (Online / Offline, search, 6 rows then scroll; name | Mute tag | Ban tag | last played | Discipline; tags lit while running with time left, grayed with total served), **Reports** (open first; the note and the player's recent lines), **Appeals** (read, reply, Accept unbans / Deny). Admins appear to players as "Admin". Every action goes in the admin log. Hidden on touch.
- **Moderators (owner, 2026-10-14):** Nyssary makes and removes them from the disciplinary panel. A moderator can Kick, Mute and Ban only, sees Players and Reports; **mutes and bans up to 3 days apply at once; 7 days and Indefinite are requests** Nyssary approves or denies in her Approvals section. **Staff badges in chat:** blue "m" moderator, red "A" admin.
- **The disciplinary panel** (owner, 2026-10-13): Type (Kick, Mute, Ban, Kill, Respawn, Teleport to me / to player, Unmute / Unban when running), Reason, a Length slider (5 min – Indefinite), an optional note. Kicked → Welcome back page; banned → login shows the ban and its appeal; muted → their lines go nowhere; killed / respawned → back at the station; teleported → 150 m from the other ship. Staff can't discipline staff.

## Live updates (kept)

- Every push to `main` warns every connected player ahead of the switch — **1 s for now (owner, 2026-10-12; it was 30 s and goes back up when the owner says)**: "Update incoming — N s" top center, then `play.html?updating=1`, which waits for the new build (not a timer: it carries the commit going live and lets everyone in together when the server and website both report it; a deploy that never lands is let through after 5 minutes). A push that changes both halves says so, so players wait for both. While an update is in progress nobody gets in.
- The deploy workflows: `deploy-website.yml` on `website/**`, `deploy-server.yml` on `packages/server/**`.

## The look (owner, 2026-10-16)

- **The design document's style for the game and the website:** the void, plates with hairline borders, warm ink, Saturn gold for actions, ice blue for fuel and scanning, purple for refined ore, brown for raw ore, signal red for the laser, distress and the locked line. **Big Shoulders Display** titles, **Atkinson Hyperlegible** text, **JetBrains Mono** numbers, self-hosted (`theme.css`). Ships, the station and Saturn are drawn from the ship art (`shipart.js`); rocks are drawn chunk by chunk from the server's geometry, in the design document's Fig. 1 style (owner, 2026-10-18): the unscanned mass soft and seamless, scanned chunks dark-outlined and ore-tinted with a pip per ore unit, bedrock hatched red, the core glowing warm.
- **Motion (owner, 2026-10-17):** exhaust trails, laser sparks and shivering rocks, crack debris and ore streaking into the core, the pop's burst rings with screen shake, gold glitter on delivery, pay flying into the hold bar, counting credits that flash on gains, eased wheel zoom, a camera that looks slightly ahead, a red low-fuel vignette, a pulsing dock circle, and entrance / press / hover motion across panels, menus, tooltips, prompts, chat lines and buttons — all skipped for reduced-motion browsers; particles capped.

## Rejected / removed (don't reintroduce)

- **The pre-redesign ring game (owner, 2026-10-18: "recreate the game/server from whats only in this document")**: crack-count asteroids (15 sizes, a crack per size) and client-built rocks from seeds (`ringgen.js`, deleted both places; the check.sh compare went with it); loose ore waiting to be clicked; **names riding on ore units and everyone named getting a full copy on delivery** (ore is physical custody now: holds, cans, crates, even party splits); module slots, hull upgrades, module upgrades (Mk I–IV) and the Shop; trading cargo to haulers by request; the station's storage grid, refine queues, selling, Make fuel and fuel blocks; field refining with pop-ups; the fueler's world pay (2.5 cr a unit — support is party-free or hired now); the Greek ore names (Alpha–Epsilon; back to Iron, Ice, Titanium, Cobalt, Platinum); crawl-home custody for logged-off carriers; the tutorial (and `ring_players.tutorial`); **shards** (zone copies, 40 a copy); **corporations' gameplay and UI** (`/corp`, the Corp chat tab, corp minimap markers — `ring_corps` and `ring_players.corp_id` stay in the database untouched); the F / 1–4 module switches and module chips; the old developer-panel shape (hulls / modules / per-ore refine numbers; a pre-redesign `ring_tuning` blob is ignored by `_v`).
- **The 25 / 5 / 1 payout-piece cargo display and `PIECES`** (owner, 2026-10-18: one square per ore type with that square's own count). **Only the Miner having a laser** (owner, 2026-10-18: every ship mines; miners just do a better job). **One fuel level following the pilot across ships** (owner, 2026-10-18: each ship keeps its own tank).
- **PvP, for now if not ever (owner, 2026-10-16).** **No helper or hint text anywhere; tooltips show names only (owner)** — the developer panel's hover descriptions are the owner-requested exception.
- **Sectors opening with player counts** (owner, 2026-10-16: always open). **Reset location / Reset faction** on the Welcome back page.
- **The 3D team game (owner, 2026-10-16)** — teams, Hangar, weapons, abilities, matches, capture points, the Build menu — and **the first 3D version's** creator/editor tooling before it (owner, 2026-10-15: "redo this all from scratch"). **The 2D space game before that (owner, 2026-10-12: "wipe the main game")** — the Expanse, pilots, licenses, markets, POIs — along with IP geolocation, password reset requests, login records, and the 2D-era admin leftovers (all removed 2026-10-13). Their database tables (`world3d*`, the 2D game's, `reset_requests`, `logins`, …) stay untouched for reference. **All old branches were deleted (owner, 2026-10-18: "delete all old branches, stop reading from them")** — history lives in git log only; `reference/` keeps old snapshots.
