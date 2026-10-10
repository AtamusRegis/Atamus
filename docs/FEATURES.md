# Atamus: how the game works today

This is a living spec of the game. Read it before every patch, and update it in the same commit as any change to behavior. Rules marked **(owner)** were decided explicitly by the owner, so keep them unless the owner says otherwise.

## World and setting

- **Region:** the Expanse, one persistent home system for everyone. See **The Expanse** below.
- **Station lights:** a soft blue glow behind the station. Red and white beacons on the masts and arm tips give a short double flash now and then (every ~6 s, staggered). Running lights chase slowly (1.4 steps a second) along both edges of the docking bay toward its back wall **(owner: slow and occasional)**. The lights show once the station is at least 70 px wide on screen.
- **Simulation:** the server ticks at 20 Hz and sends snapshots at 15 Hz. Distances inside a POI are in km; map positions are in AU.
- **Stargates (owner):** players don't control them. Each sits at the centre of its gate POI. Nomad space doesn't exist yet, so every stargate is **offline**: slow occasional blinking lights only. **Clicking a gate** opens the Stargate window (Status: Offline) without changing the selection.
- **Factions** (`game/factions.js`, not used in gameplay yet):

  | Faction | Role |
  |---|---|
  | Deep Core Industries (DCI) | Builds the mining hulls, and every new pilot's corp **(owner)** |
  | Orbital Defense Industries (ODI) | Builds combat hulls (just a hull maker; no NPC escorts) **(owner)** |
  | Expanse Transit Authority (ETA) | Law (omni weapons) |
  | Belt Raiders | Pirates (bullets) |
  | Free Salvage Union | Pirates (missiles) |
  | Consolidated Ore Trading | Aggressive competitor (hybrid weapons) |
  | Helios Resource Group | Aggressive competitor (lasers) |

  Names are in DarkOrbit style: plain and corporate, nothing "on the nose" **(owner)**.

## The Expanse (owner)

The first phase of docs/DESIGN.md. Today's personal home systems, fuel stargates, asteroid beacons, asteroid instances, home rocks and offline mining are gone.

- **Shape:** a flat-top hexagon 1 AU across with the sun at its centre (a backdrop and landmark, not a POI). The map draws its edge.
- **Points of interest (POIs):** every ship is always in exactly one POI (or warping between two). A POI is its own local space: a circle you fly freely inside, with everything at true km scale around its centre. Nothing exists between POIs.
  - **Fixed POIs** never expire: 4 **planets** (Expanse I–IV, 80 km, at 0.10, 0.18, 0.27 and 0.38 AU), the **Expanse Station** (100 km, beside Expanse II; the market, fitting and hangars, docking within 4 km of the station), and 6 **stargates** (60 km, the middle of each edge, offline for now).
  - **Planets** are procedural (one of ocean, desert, ice or gas giant per planet), drawn as a 16 km sphere at the POI centre and lit from the sun. Landing comes with the base surface (DESIGN.md phase 2).
  - **Asteroid belts (owner)** are POIs 50 km across, spawned by population: one per 12 players online, at least 3. Each holds one rich field (70–110 rocks, 250k–600k m³, a primary ore rolled by rarity plus up to two lower ores) and has a **hidden lifetime** of 60–120 minutes.
  - **When a belt's time runs out or it's mined out (owner),** it leaves the map at once (no icon, nobody new can warp to it or look into it), but stays open for whoever is inside until the last ship leaves. A held belt doesn't count toward the population number, so a replacement spawns. Belts are saved (in the `instances` table) and survive restarts.
- **Map and zoom (owner):** one continuous zoom from POI scale out to the whole system (1 AU is drawn as 20,000 km; the wheel takes bigger steps once zoomed out).
  - **Only POIs you have a ship in (docked counts) show their zone and contents (owner):** zoomed in, such a POI is at true scale with a dashed boundary circle, its rocks, structures and other players' ships. Every other POI is only ever its icon, at any zoom, and the server sends nothing from inside it.
  - Icons (owner's pixel art in `assets/icons/`, drawn crisp at their own size): the station, the stargate, an asteroid field for belts; planets are a small procedural sphere. Hovering an icon shows its name.
  - **Zoomed out (owner):** a ship smaller than 8 px on screen (or in a POI shrunk to its ring) is drawn as its **hull icon** from the owner's sheet (`assets/icons/ships/<sprite>_<blue|red>_s.png`): the blue set for yours, the red set for others'. Icons for future hulls (Gleaner, Lodestar, Motherload, Wick, Beacon, Vigil), arks and NPC law ships are already there. A hull without an icon falls back to the tinted class icon. A rock smaller than 6 px is drawn as its ore family's icon (10 px).
  - The marker icons (question, exclamation, circle, square, diamond) and the waypoint are kept in `assets/icons/` for temporary markers later **(owner)**.
  - **Wheel zoom (owner)** goes toward the point under the mouse, unless the camera is following a ship.
  - A POI your ships are in keeps a visible boundary at any zoom, with your ships as dots inside it.
  - Move orders go to the selected ships in the POI you clicked, and stay inside its boundary.
- **Warp to a POI (owner):** right-click (or hold, on touch) a POI's icon on the zoomed-out map → **Warp to *name*** for the selected ships.
  1. The ship aligns toward the target's bearing on the map, speeding up at its normal acceleration.
  2. At full speed and lined up, the warp window opens ahead; it coasts in (0.9 s) and leaves the POI.
  3. **Off-POI** it's a glowing ball crossing the map at constant speed for 2 s + 28 s per AU, so **crossing the 1 AU system takes 30 s (owner)** (`WARP_POI_BASE_MS`, `WARP_AU_PER_S`). Nothing is simulated meanwhile, and move and dock orders are ignored. The ball runs from the entry window straight to the exit window.
  4. It drops out of an exit window at a scattered point 15–50% of the way out from the target's centre (picked when it leaves), braking to a stop like a normal warp exit.
  - **Camera (owner):** following a ship at warp (in-POI transit or between POIs), the camera locks onto it instead of easing, so it never falls behind.
  - Targets, lasers and the auto miner reset when a warp-to starts. A warp in progress at logout lands in the target POI.
- **What you receive (owner):** every ship in the POI your camera is on (the client tells the server with `view`; only a POI where you have a ship counts), plus your own ships wherever they are. Rocks and cans come for those POIs too. The POI list comes on its own (`pois`) whenever it changes. Sockets are compressed (permessage-deflate).
- **Ships in different POIs** never see, target or bump each other.
- **Local chat** reaches everyone online in the Expanse.
- **Logging off (owner):** no logged-off presence. 20 s after the last connection closes (a reload fits in that), the player's fleet leaves the world.
- **Logging in (owner):** ships come back where they were. A ship whose POI no longer exists arrives at a random point outside any POI, inside a **new 20 km spawn-in POI** made around it. A spawn-in POI has **no map marker**, so nobody else can see it or warp to it, and it goes away once its player has left.
- **New players** start with their Prospector docked at the Expanse Station.

## Accounts, pilots and sessions

- **Wipes:** one-time resets run at server start, once each (`WIPES` in db.js, recorded in the `meta` table). They keep accounts but delete every pilot and system and zero credits. "2026-10-09 quick-training reset" was the first **(owner)**. "2026-10-09 the Expanse" was a world-only wipe: ships, hangars, cans and belts went; pilots, licenses and credits stayed.

- **Website (owner):** styled like the game's panels and buttons, over a nebula backdrop. The game itself no longer uses the nebula.
  - **Front page** (`index.html`): a header with the logo and Log in on the right; a description card ("The Expanse") with **Play now**, which goes to account creation; and an **Updates** card.
  - **Updates** lists **major changes only**, never small fixes. Edit the `<article class="update">` list in index.html, newest first.
  - Signed-in visitors skip the front page and go straight to play.html: "Welcome back, name" (or "Welcome" before the first pilot exists), with Enter System and Log out.
  - Pages: `login.html`, `signup.html`, `recover.html` and `play.html`. An expired session returns to login.html.
- **First pilot:** named on the website (play.html), not in the game **(owner)**.
- **Pilots (owner):** up to 3 per account (`MAX_PILOTS`), with no duplicate names.
  - The first pilot is free. Each extra pilot costs **1,000,000 cr** (`PILOT_PRICE`), taken from your in-game credits if you're online, otherwise from the database.
  - Creation runs in a locked transaction, so parallel requests can't get past the cap or skip the charge.
  - Extra pilots are created by right-clicking (or holding) the fleet bar's background: "New pilot · 1,000,000 cr" asks for a name, and the new pilot becomes the selected one. It's offered only while you're under the cap.
- **One session per account (owner).** Opening the game in a new tab or device ends the old session:
  - the old connection closes with code 4002;
  - the old tab shows "Playing on another tab or device", then goes to play.html;
  - the server ignores anything the replaced session sends.
- **Session expired:** a socket closing with code 4001 sends the client to index.html.
- **Credits** live in `users.credits`, kept in memory while online and updated with each change. Credit amounts always show in gold.

## Licenses (skills)

- **Training:** per pilot, through a queue you can add to, remove from, reorder, pause and cancel. The queue shows its **total time left**.
- **Categories (owner):**
  - ships: Mining Ships (frigates, barges, exhumers, command ships), Combat Ships, Industry Ships (hauler);
  - modules: Mining, Automation, Power, Missiles, Beams, Hybrid, Projectiles;
  - categories without licenses yet (the weapon ones) are hidden in the pilot window.
  - **For now (owner): level N of every license takes N minutes** (`QUICK_TRAINING` in licenses.js). The design times are kept in `designTimes`, and manual prices still come from them.
- **Starting licenses** (level 1 for every pilot): Mining Frigate, Mining Laser Yield, Automated Mining.
- **Free vs. manual:** free licenses can be trained straight away. Every other license needs its **training manual** read first; manuals are bought from the market and are a **consumable**: they can't be sold **(owner)**.
- **One bonus per license (owner):**

  | License | Bonus per level |
  |---|---|
  | Mining Laser Yield | +5% yield |
  | Mining Laser Range | +5% range |
  | Mining Laser Cycling | −3% cycle time |
  | Automated Mining | −30 s auto-miner cycle |

- **Hull licenses** reach level 8; levels 6–8 replaced the old specializations:
  - Mining Frigate, Mining Barges, Exhumers, Hauler, Industrial Command, Capital Industrial Command, Combat Frigate/Cruiser/Battleship;
  - efficiency flying that hull **(owner)**: +20% per level for levels 1–5 (100% at level 5), then +5% per level for levels 6–8 (up to 115%).
- **Bonuses** come from the pilot crewing the ship. The server refreshes them every 60 s and on crew.
- **UI:**
  - the license list shows level pips, a timer and a +/− queue;
  - clicking a name opens the license info popup: level boxes, bonus, "Level N unlocks", train time, requirements, and what the license is required for;
  - level boxes that unlock something get a **white outline**, in the info popup only, not in the list **(owner)**.

## Ships

- **Hulls (class names, owner):** the class is the hull, like EVE's "Venture". Players rename **individual ships** (≤20 chars); the class still shows in Info **(owner)**.
  - Mining Frigate: Prospector
  - Mining Barge: Dredger, Bulwark, Collier
  - Exhumer: Excavator, Rampart, Carrack
- **Market grouping:** each hull has a role (`SHIP_ROLES`), and the market groups ships as Ships › Role › Class, e.g. Industry › Mining Barge.
- **Crew:** a ship needs a pilot to undock.
  - Crew or decrew from the station hangar's right-click menu; it only works docked, and needs the right licenses.
  - A pilot already sitting in another docked ship walks across the station.
- **Buying:** bought ships arrive in **Deliveries** as packaged items. **Assemble** (in a station) turns one into a docked, uncrewed ship.
- **Movement (owner):** each hull has an acceleration (Prospector 150 m/s², Dredger 50, Bulwark 40, Collier 45, Excavator 55, Rampart 45, Carrack 50). Ships speed up and brake at that rate and arrive without overshooting.
- **Warp (owner):** the Warp action on a moving ship. All the effects are blue.
  1. **Align:** the ship speeds up toward the destination at its normal acceleration.
  2. **Window:** at full speed and lined up, a glowing rectangular warp window opens ahead of it, with particles streaming through it; the ship coasts into it (0.9 s).
  3. **Transit (owner):** the ship becomes a glowing ball with a trail, moving at constant **full warp speed** (20× the hull's max speed) the whole way through the field, with no acceleration or easing inside it. The course is locked: move and dock commands are ignored until it comes out.
  4. **Exit (owner):** it leaves the exit window still at full warp speed and brakes to dead still **outside** the window (0.9 s, cubic ease-out), exactly on the destination. That gives it a fast-drop feel. A blue streak and particles dissipate behind it. The exit window sits that stopping distance (warp speed × 0.9 s ÷ 3, about 2 km for a Prospector) short of the destination.
  - Hops too short for a window (under 2 km of transit after aligning and braking room) just fly normally.
  - **The exit window** appears for everyone, the owner included, only in the last second before the ship comes out **(owner)**. Other players see the entry window when it opens.
  - **Progress line:** the selected pilot's ship shows a dashed line from window to window, lit up to the ball's position.
  - **Between POIs:** see **Warp to a POI** under The Expanse.
  - A server restart drops any warp in progress; the ship keeps flying to its destination.
- **Smooth motion:** snapshots carry the server's simulation time (`st`), and ships are drawn 110 ms in the past, interpolated between the two snapshots around that moment (with brief extrapolation if one is late). The camera follows that smooth position, so it doesn't jitter, even at warp.
- **Undocking (owner):** a ship comes out of the docking bay's mouth (the station's open side, facing −x, spread ±20°), flies away, and stands still 3.6 km out, near the edge of the dock ring, facing away from the station.
- **Docking:** within 4 km of the station, in the station POI only. Refused mid-warp. Docking repairs the ship, clears its targets and stops its modules. A docked ship stays selected.

## Mining

- **Lasers:** mining lasers are fitted modules (see Fitting); a ship has as many as it has fitted. **Laser range is 1 km (owner, for now).**
- **Targeting range (owner, for now):** Prospector 3 km; Dredger 8, Bulwark 12, Collier 8; Excavator 11, Rampart 13.5, Carrack 9 (the earlier ranges × 0.2).
  - The Prospector fires from 4 arm hardpoints. Barges and exhumers fire from the circular hopper ports on their centerline.
  - Range is 5 km, before bonuses.
- **Cycle:** 15 s. Ore lands at the end of the cycle, and the cycle repeats until told otherwise.
- **Breaking a cycle (owner):** a cycle breaks only when the rock is gone, it's out of range, or the hold is full. A full hold refuses activation and stops a running laser at once, with one "ore hold full" message.
- **Hotbar clicks:**
  - clicking an active laser toggles whether it repeats; it never switches target mid-cycle;
  - clicking an idle laser starts it on the selected target.
- **Hull bonuses (owner):** a hull has no yield or range of its own. Modules have base stats (Mining Laser: 2 m³/s, 1 km, 15 s), and a hull's **Hull bonus** adds % to specific modules: Prospector +20% yield / +5% range; Dredger +350/+10; Bulwark +200/+5; Collier +275/+10; Excavator +500/+15; Rampart +300/+10; Carrack +400/+15. Other modules keep their base stats unless something else boosts them.
- **Yield:** per second = module base × (1 + hull bonus) × (1 + Mining Laser Yield license) × hull efficiency. Units are whole numbers; a rock with less than one unit left is mined out and removed.
- **Beams:** they aim at points on the rock and stop on the first opaque pixel of the rock sprite (an alpha-mask raycast). A chunk animation travels along the beam.
- **Auto Miner** (Automated Mining license): cycles every 3:00, −30 s per level. Each cycle it puts every idle, powered laser on the first locked rock in range.
- **Hotbar:** one fixed-size slot per hardpoint of the selected ship, filled with its fitted modules (free hardpoints show as empty slots).
  - **Fixed slots (owner):** every fitted module owns its slot (the server stores `slot` per fitted module). Fitting or unfitting other modules never moves it; only the player does, by dragging one slot onto another, which swaps them (`fitswap`, works anywhere). A module dropped from a hangar onto an empty slot is fitted there; otherwise it takes the first free slot.
  - **Keys 1–9, 0, −, =** fire the slots in order. Each slot shows only its key, in grey **(owner)**.
  - **States (owner):**
    - powered: an outline in the module's color **(owner)**: mining orange, combat red, automation / self blue, passive grey;
    - running: a fill timer in a lighter version of that color;
    - set to stop after this cycle: a grey outline and fill;
    - powered off: dark slate.
  - **Running modules:** the outline dims and a brighter stretch of the same color sweeps slowly clockwise. No white glint or shine **(owner)**.
  - **Standby (owner):** a target module (laser) switched on with no locked rock blinks "Standby" and fires on the next rock lock; pressing it again cancels. Automation (the auto miner) runs its cycles with or without a target.
  - **Stopping (owner):** a module set to stop after its cycle can't be re-armed until the cycle ends. The next activation goes to the current primary target (the HUD's selected target, or the first locked rock).
  - **Hover (mouse):** a laser shows Cycle time, Yield (m³ / cycle), Range and Capacitor use, with all bonuses applied; the auto miner shows Cycle time and Capacitor use; a battery shows its +Capacitor.
  - A thin integrity bar appears on a damaged module; a burnt-out one is dark red; one running past capacity has a red outline.
- **Module menu** (right-click, or hold on touch) has three options:
  - **Activate / Deactivate**. There's no re-arming once deactivated.
  - **Power on/off:** powering off cuts an active module immediately, and that cycle gives nothing. An offline module is greyed out, can't be activated, and the auto-miner skips it. Power state is saved.
  - **Info:** opens the module's item info (Description / Stats / Fitting), with no ship or target details **(owner)**.
- **Rocks** are in belt POIs (see The Expanse). Rock ids carry their POI (`belt:…#3`).
- **Rock labels (owner):** hovering a rock, or clicking it (pinned until the next click), shows its ore name under it, plus its distance from the selected ship in "X.X km" when that ship is in the same POI.
- **Rock menu (owner):** right-click a rock → **Lock** / **Unlock** (for the selected ship, when it's in that POI) and **Info** (the ore's item info). Ctrl-click and hold (touch) still lock directly.
- **Rock labels (owner):** hovering a rock, or clicking it (pinned until the next click), shows its ore name under it, plus its distance from the selected ship in "X.X km" when that ship is in the same POI.
- **Rock menu (owner):** right-click a rock → **Lock** / **Unlock** (for the selected ship, when it's in that POI) and **Info** (the ore's item info). Ctrl-click and hold (touch) still lock directly.
- **Ores:**

  | Ore | Rarity | Price | Volume |
  |---|---|---|---|
  | Cryonite | common | 5 | 0.1 m³ |
  | Pyroxite | uncommon | 12 | 0.15 m³ |
  | Duranite | rare | 30 | 0.3 m³ |
  | Hexite | very rare | 80 | 0.6 m³ |
  | Tantalite | legendary | 220 | 1.2 m³ |

  - **Names (owner):** Cryonite, Pyroxite, Duranite, Hexite, Tantalite are the raw ores; refining (later, in refineries) turns each into its "-ium". The item keys are still the old names (`ironstone`, `cuprite`, `cobaltine`, `iridite`, `starglass`) because they're saved in player data.

## Fitting and power (owner)

- No EVE-style high/mid/low slots and no CPU/powergrid. Each hull has three numbers:

  | Hull class | Hardpoints | Disposition | Capacitor |
  |---|---|---|---|
  | Mining Frigate | 5 | 50 | 30 |
  | Mining Barge | 6 | 90 | 60 |
  | Exhumer | 7 | 120 | 90 |

  - **Hardpoints:** how many modules fit. **Disposition:** the total size of fitted modules. **Capacitor:** shared power for *running* modules.
  - Each hull lists **accepted module categories** (mining hulls: Mining, Automation, Power). There are no per-type counts: 8 lasers is fine if hardpoints and disposition allow it.
- **Modules** are items, bought on the market (Modules › category):

  | Module | Category | Size | Power | Price |
  |---|---|---|---|---|
  | Mining Laser | Mining | 10 | uses 10 | 60,000 |
  | Auto Miner | Automation | 15 | uses 5 | 250,000 |
  | Capacitor Battery | Power | 8 | +12 capacitor (passive) | 120,000 |

  - Running a module needs its license (Mining Laser Yield 1, Automated Mining 1).
  - Capacitor Management license: +5% capacitor per level.
- **Fitting is docked only.** Fit by dragging a module from a station inventory onto the Fitting window, the hotbar, or a specific empty slot. Unfit by dragging a slot onto a hangar, or by right-clicking (or holding) it → Unfit (it goes to Hangar 1). Info is in the same menu.
- **Fitting window (owner):** EVE-like, a modified info page. Open it from the ship's right-click menu → Fitting, or by clicking the ring. Tabs:
  - **Fitting:** the ship's image beside its current numbers (Hardpoints, Disposition, Capacitor with the green hover breakdown, Heat, Shield / Hull), with the hardpoint slots below, exactly as on the hotbar (same slots, keys, colors, hover stats, drag to rearrange). The slots are centered, 8 to a row, wrapping downward on bigger hulls;
  - **Fitting stats:** what the fit does (Mining yield per cycle, laser range and cycle, auto miner cycle, capacitor need). No module table **(owner)**;
  - **Ship stats**, **Description** (with the Hull bonus), **Requirements**.
- **New ships come empty.** A new player's first Prospector comes with 2 mining lasers. Ships from before fitting existed kept 2 lasers plus an auto miner.
- **Running hot:** the capacitor never refuses; anything can be switched on.
  - Power past capacity builds **heat**: 6%/s at 100% over, scaled by how far over. Within capacity, heat cools at 5%/s.
  - At full heat, **only the modules running past capacity** lose integrity (4%/s at 100% over, minimum 1%/s). Power goes to modules in the order they were switched on, so the ones switched on last are the overloaded ones.
  - At 0 integrity a module **burns out**: it switches off and can't be switched on until the ship docks. Docking repairs every module and clears heat.
  - Overloaded modules simply let you run more; they don't perform better **(owner)**.
- **The ring** (left of the hotbar): the white crescent is disposition used and the right crescent is power in use, scaled to everything fitted running at once. A white tick marks the capacity; if everything fitted fits within the capacity, the tick sits at the crescent's top end, because that fit can't run hot.
  - The power crescent is yellow, since capacitor is yellow and shields are blue **(owner)**. Past the tick it shifts yellow → orange → red as heat builds; deep red and pulsing means overloaded modules are taking damage.
  - The middle shows hardpoints used. Clicking or tapping it opens the Fitting window. Its capacity number is white, and turns green when batteries or Capacitor Management add to it; hovering it (or tapping, on touch) shows Base and each contributor.

## Inventories and items

- **Inventory slots:** each inventory holds up to 100 stacks and is limited by volume (m³). The header shows volume only, not the stack limit **(owner)**.
- **Station:** 4 renameable hangars plus Deliveries, which is gold and anchored at the bottom. The sidebar lists docked ships with their holds. Clicking the station opens the hangar window; there's no station selection panel **(owner)**.
- **Ship holds:** ore and cargo.
- **Transfers:** allowed between two inventories that are both at the station, or between a ship in space and a jettison can within 2.5 km.
- **Item menu** (right-click, or hold on touch):
  - **Split.**
  - **Jettison:** from a ship in space.
  - **Sell:** **ore only**, at the station. Opens a popup with price, slider and confirm.
  - **Read:** manuals.
  - **Assemble:** packaged ships, at the station.
  - **Info:** tabs like ship info **(owner)**:
    - Description;
    - Stats: Weight "unit / stack", Price "unit / stack" (just one value for a single item), plus category, disposition and capacitor for modules;
    - Fitting (modules only): which ship classes it fits, disposition, capacitor, required license.
    - No rarity row and no price per m³ **(owner)**. A packaged ship's Info opens the ship info.
- **Commands name their item.** If the stacks shifted underneath, the server finds that item rather than acting on whatever now sits in the slot. Quantities are whole numbers only.
- **Jettison cans (owner):**
  - hold 15,000 m³;
  - **only the player who jettisoned a can can open it for 30 minutes**; then it's open to anyone for 10 minutes, then it's destroyed with whatever is inside. Others don't even receive a locked can's contents, and its menu reads "locked N min";
  - one jettison every 30 minutes per account, and destroying your own can resets that;
  - anyone can destroy an empty can; the owner can destroy a full one, with confirmation;
  - the can sprite blinks (2 frames) so it's easy to spot.

## Market

- Opened from its own left-panel button.
- Sells mining hulls only for now **(owner)**, plus training manuals priced at 1M + 25k × the license's total training hours.
- **Search bar** at the top, which filters to a flat list by name or category.
- Collapsible nested groups, remembered: Ships › Industry › class, and Training Manuals › category.
- **Clicking a row opens the buy window.** There's no Buy button in the list **(owner)**.
- **Buy view (owner):** it opens **inside the market window**, replacing the list. Buy or Cancel returns to the list with your search kept, and closing the market drops an unfinished purchase.
  - the top shows the item's icon (a ship's sprite) and its description, plus an **Info** button that opens the full item info (or the ship info window with tabs) in its own window;
  - a divider separates the purchase section below it;
  - Price each; Quantity as [−][number][+], any whole number;
  - Total reads "cost / your credits";
  - Buy is greyed out when you can't afford it, and the typed quantity is kept if your credits change;
  - purchases go to Deliveries; the server accepts up to 1,000,000 per order, subject to Deliveries capacity.
- **Ship info (owner):** the ship info window uses three tabs:
  - Description: image, text, class, and a **Hull bonus** box (e.g. "+20% Mining Laser Yield");
  - Stats: shield/hull, max speed, acceleration, holds, targeting, lock time, length (no yield: hulls have none);
  - Fitting: hardpoints, disposition, capacitor, accepted categories, and a collapsible **License requirements** section (remembered).

## UI and HUD

- **Space backdrop (owner):** no nebula image in the game. It's built from these layers, redrawn every frame, so a GPU reset can't leave it blank:
  - a dark radial gradient;
  - two layers of soft noise drifting slowly in different directions;
  - three layers of parallax stars (the nearer the layer, the more it moves as you pan), each star slowly dimming and brightening. They're crisp 1–2 device-pixel points (owner: no big blurry dots), drawn after the camera is clamped, so they never rubber-band at the pan limit;
  - a very thin world grid whose spacing steps (1, 2, 5, 10… km) so lines stay at least 70 px apart, with every 5th line slightly brighter.
  - The sun's WebGL layer rebuilds itself if the browser drops its context; that drop was the cause of a flicker.
- **Station windows (owner):** the station hangar (and docked ships' holds under it) only opens, and only stays open, while the selected pilot is inside the station, meaning in a docked ship or not in a ship. Selecting a docked ship, or the selected ship docking, opens it.

- **Left panel:** Player, Pilot, Chat, Fleet, Market and Settings buttons. A button's name shows only on hover, or while holding on touch.
- **Windows:**
  - dragged by the title bar (touch-friendly), resizable, always kept on screen (fit to phone width);
  - resizing never squeezes a window narrower than its content. Inventory windows are the exception: their slot grid reflows to any width.
- **Inventory grids (owner):** an inventory shows one cell per stack plus one empty cell to drop into, with no padding rows of fake slots. That holds for ship holds, hangars, Deliveries and cans.
  - Inventory windows have content-driven minimums **(owner)**. A window can't get narrower than its full row of tabs (hangar or hold names) or one slot, and can't get shorter than its first slot. This is checked while resizing and after every rebuild.
  - A tabless window (a single hold opened on its own) can be one slot wide. The station window moves its ship list above the grid if it's ever too narrow to sit beside it.
  - Dropping anywhere on the grid adds the item to that inventory.
  - **tab stacking:** drop a window's title onto another window to group them; drag a tab out to split it again;
  - layout, groups, open inventories (with their active tab) and the market are remembered in localStorage `atamus.ui`.
- **The selection drives the inventories:**
  - a ship in space shows only its own inventory;
  - the station window stays only while the station or a docked ship is selected;
  - it closes on deselect, or when the selected ship undocks.
- **Ships are run from the HUD** (no selection window for them):
  - target lock icons: untarget (a centered ×), distance under the circle, reorder by dragging **(owner)**:
    - the **primary target is the leftmost**, with a small white bar under its circle; clicking a target makes it primary;
    - hovering a target shows its tooltip (name, plus m³ left for rocks; no size, no distance) and the thin line to it on the map;
  - a shield, hull and **Speed** row (hull bars are red); hovering Speed shows Max speed and Acceleration;
  - the hotbar.
  - **Docked with the pilot aboard (owner):** the HUD stays, so modules can be dragged from a hangar onto the hotbar to fit them, and from the hotbar into a hangar to unfit them.
  - **Pilot not in a ship (owner):** when the selected pilot crews no ship, the HUD becomes a small "Pilot not in a ship" box.
  - Dragging a target shows only that target's circle.
- **Ship actions** (Inventory, Dock, Warp; Undock and Inventory while docked with the pilot aboard): always shown for the selected pilot's ship (docked: Inventory opens the station view of its holds). Anchored to the fleet bar, centered on its side facing the screen center: 24 px buttons (32 px on touch) **(owner: a third bigger)**.
- **Selection (owner):** one pilot is always selected, and that pilot's ship is always selected while they're in it; if anything clears the selection, the ship is reselected (a multi-ship box selection is left alone). Clicking empty space or an empty box-select never deselects. Clicking the station or a stargate opens its window without changing the selection, and closing that window doesn't deselect.
- **Fleet bar:**
  - lists **pilots** (owner), each with their ship (sprite and split shield|hull bar) or an empty marker if they don't crew one. Cards are small (52 px);
  - click a card to select that pilot; double-click locates their ship; right-click or hold opens the ship menu;
  - dragged by its background; hold or right-click the panel button to switch between horizontal and vertical;
  - auto-sized, wrapping instead of scrolling, no resize edges, 16 px end padding.
- **Pilot window (owner):** shows the pilot selected in the fleet window (name in the title, no dropdown), with two tabs: Licenses and Training Queue. Selecting another pilot in the fleet switches it.
- **Persistence across reloads:** the selection (ship or station, in localStorage `atamus.sel`) and the camera (sessionStorage `atamus.view`).
- **Settings window:** a Sound tab with All, Music and SFX sliders (themed: blue fill up to a round thumb), remembered. There are no sound effects yet; the SFX volume is ready for them.
- **Music (owner):** "Soviet Wave" (`assets/audio/soviet_wave.mp3`) loops in the game at All × Music volume. It starts on the first click or key, since browsers block sound before that.
- **Context menu:** always renders above windows, and closes on any tap elsewhere.
  - **Placement (owner):** centered above the press; below it if there's no room above; to the right of the press near the left edge, to the left of it near the right edge.
- **Mobile:**
  - tap, double-tap, pan, pinch, hold-to-lock and box select;
  - text selection and the long-press callout are disabled.
  - **phones play in landscape (owner):** on a phone (touch, shorter side < 600 px; not tablets), the first tap goes fullscreen and locks landscape, and again after leaving fullscreen. Browsers only allow the lock in fullscreen, and iOS Safari doesn't support it;
  - on phones (touch screen, shorter side < 600 px), game.html sets the viewport scale to the shorter side ÷ 540 (minimum 0.6). That lays the page out larger and shrinks the whole UI about 30%, and the map shows more space too. It's recomputed when the phone rotates.

## Live updates (owner)

- Every push to `main` shows **every** player a 30 s "Update incoming" panel near the top of the screen. The number bounces each second.
- At zero, players are logged out to `play.html?updating=1`. It waits for the new build, then shows Enter System. Enter System always loads a fresh (cache-busted) game page.
- Players who join mid-countdown see the time that's left.
- The server only starts a countdown if `main` is really ahead of what's live, once per commit. If it can't read GitHub, it counts down anyway.

## Server hardening

- Malformed or hostile messages are ignored and logged, never fatal.
- Rejected promises are logged.
- Each connection is limited to about 40 commands a second, with a 64 KB message limit.
- Autosave runs every 10 s but skips the database write when nothing changed. Offline players get no snapshots.
- Ship collisions are checked per POI.

## Rejected / removed (don't reintroduce)

- Helper text and hint tooltips, e.g. "hold for options".
- Holding back reloads until players are idle.
- The Live / Pending / PTR multi-server idea. The PTR is a private local box for Claude only, with no accounts.
- Hull specializations as separate licenses. They're merged into hull license levels 6–8.
- Ore and cargo bars in the ship panel.
- The station selection window.
- Separate station ore and cargo containers. There are 4 hangars plus Deliveries instead.
- Scrolling in the fleet bar.
- Unlock outlines on the main license list.
- Playing in several tabs or on several devices at once.
- Selling manuals or ships.
- Overburdening disposition past 100% in exchange for a smaller heat buffer (considered, scrapped).
- Names: "Expanse Excavations" and the "EMO" acronym; "Black Flag" for pirates; personal-sounding hull names.
- Asteroid belts in home systems (5 slots, spawning and drifting away). Replaced by scattered home rocks and asteroid instances.
- Anyone looting a fresh jettison can. Cans are owner-only for 30 minutes now.
- Kicking idle online players out of instances, and matchmaking with friends (instances are random for now).
- **Replaced by the Expanse (docs/DESIGN.md phase 1):** personal home systems; fuel stargates linking players' systems and the pirate hub; asteroid beacons, acceleration-gate jumps and asteroid instances (they'll return as the "small belt" instance type behind acceleration gates); scattered home rocks; offline mining and systems staying awake while offline.
