# Atamus: how the game works today

This is a living spec of the game. Read it before every patch, and update it in the same commit as any change to behavior. Rules marked **(owner)** were decided explicitly by the owner, so keep them unless the owner says otherwise.

## World and setting

- **Region:** the Expanse.
- **Systems:** every player owns a home system. It's a single flat-top hex 200 km across, holding a station at (-52, 38), stargates, and up to 5 asteroid belt slots.
- **Simulation:** the server ticks at 20 Hz and sends snapshots at 15 Hz. Distances are in km.
- **Stargates:** they use fuel and open timed links to other players' gates or to a hub. If a link closes while your ship is in someone else's system, the ship is destroyed with everything aboard and you respawn at your station. This code is older and lightly used.
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

## Accounts, pilots and sessions

- **Website** (atamus.io): signup, login, password recovery, and `play.html` (the hub).
- **First pilot:** named on the website (play.html), not in the game **(owner)**.
- **Pilots (owner):** up to 3 per account (`MAX_PILOTS`), with no duplicate names.
  - The first pilot is free. Each extra pilot costs **1,000,000 cr** (`PILOT_PRICE`), taken from your in-game credits if you're online, otherwise from the database.
  - Creation runs in a locked transaction, so parallel requests can't get past the cap or skip the charge.
  - Extra pilots are created from the pilot window's name dropdown: "New pilot · 1,000,000 cr" asks for a name. It's shown only while you're under the cap.
- **One session per account (owner).** Opening the game in a new tab or device ends the old session:
  - the old connection closes with code 4002;
  - the old tab shows "Playing on another tab or device", then goes to play.html;
  - the server ignores anything the replaced session sends.
- **Session expired:** a socket closing with code 4001 sends the client to index.html.
- **Credits** live in `users.credits`, kept in memory while online and updated with each change. Credit amounts always show in gold.

## Licenses (skills)

- **Training:** real-time (`DEV_TIME_SCALE = 1`), per pilot, through a queue you can add to, remove from, reorder, pause and cancel.
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
- **Docking:** within 4 km of the station. Docking repairs the ship, clears its targets and stops its modules. If the docked ship was selected, the selection is cleared.

## Mining

- **Lasers:** mining lasers are fitted modules (see Fitting); a ship has as many as it has fitted.
  - The Prospector fires from 4 arm hardpoints. Barges and exhumers fire from the circular hopper ports on their centerline.
  - Range is 5 km, before bonuses.
- **Cycle:** 15 s. Ore lands at the end of the cycle, and the cycle repeats until told otherwise.
- **Breaking a cycle (owner):** a cycle breaks only when the rock is gone, it's out of range, or the hold is full. A full hold refuses activation and stops a running laser at once, with one "ore hold full" message.
- **Hotbar clicks:**
  - clicking an active laser toggles whether it repeats; it never switches target mid-cycle;
  - clicking an idle laser starts it on the selected target.
- **Yield:** per second = hull `laserM3s` × (1 + Mining Laser Yield bonus) × hull efficiency. Units are whole numbers; a rock with less than one unit left is mined out and removed.
- **Beams:** they aim at points on the rock and stop on the first opaque pixel of the rock sprite (an alpha-mask raycast). A chunk animation travels along the beam.
- **Auto Miner** (Automated Mining license): cycles every 3:00, −30 s per level. Each cycle it puts every idle, powered laser on the first locked rock in range.
- **Hotbar:** one fixed-size slot per hardpoint of the selected ship, filled with its fitted modules (free hardpoints show as empty slots). The order can be rearranged by dragging and is remembered per ship.
  - A thin integrity bar appears on a damaged module; a burnt-out one is dark red; one running past capacity has a red outline.
- **Module menu** (right-click, or hold on touch) has three options:
  - **Activate / Deactivate** (and **Keep cycling** once deactivated).
  - **Power on/off:** powering off cuts an active module immediately, and that cycle gives nothing. An offline module is greyed out, can't be activated, and the auto-miner skips it. Power state is saved.
  - **Info:** status, target, cycle time, yield per cycle and range, including bonuses; it updates live.
- **Belts:** 5 slots per system and uncommon spawns, so usually 1–2 are up. Each belt has 75–150 rocks and drifts away after 60–120 minutes.
- **Ores:**

  | Ore | Rarity | Price | Volume |
  |---|---|---|---|
  | Ironstone | common | 5 | 0.1 m³ |
  | Cuprite | uncommon | 12 | 0.15 m³ |
  | Cobaltine | rare | 30 | 0.3 m³ |
  | Iridite | very rare | 80 | 0.6 m³ |
  | Starglass | legendary | 220 | 1.2 m³ |

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
- **Fitting is docked only**, in the Fitting window (ship right-click menu → Fitting, or click the ring):
  - drag a module in from a station inventory to fit it;
  - right-click or hold a fitted module → Unfit (it goes to Hangar 1) or Info.
- **New ships come empty.** A new player's first Prospector comes with 2 mining lasers. Ships from before fitting existed kept 2 lasers plus an auto miner.
- **Running hot:** the capacitor never refuses; anything can be switched on.
  - Power past capacity builds **heat**: 6%/s at 100% over, scaled by how far over. Within capacity, heat cools at 5%/s.
  - At full heat, **only the modules running past capacity** lose integrity (4%/s at 100% over, minimum 1%/s). Power goes to modules in the order they were switched on, so the ones switched on last are the overloaded ones.
  - At 0 integrity a module **burns out**: it switches off and can't be switched on until the ship docks. Docking repairs every module and clears heat.
  - Overloaded modules simply let you run more; they don't perform better **(owner)**.
- **The ring** (left of the hotbar): the white crescent is disposition used and the right crescent is power in use, scaled to everything fitted running at once. A white tick marks the capacity; if everything fitted fits within the capacity, the tick sits at the crescent's top end, because that fit can't run hot.
  - Within capacity the power crescent is blue. Past the tick it turns yellow, warming to red with heat; deep red and pulsing means overloaded modules are taking damage.
  - The middle shows hardpoints used. Clicking or tapping it opens the Fitting window, which shows hardpoints, disposition, capacitor in use (broken down into base, batteries and Capacitor Management only when something adds to the base), heat, and each module's integrity, with running modules highlighted.

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
  - **Info:** description, Weight "unit / stack" and Price "unit / stack". There's no rarity row and no price per m³ **(owner)**.
- **Commands name their item.** If the stacks shifted underneath, the server finds that item rather than acting on whatever now sits in the slot. Quantities are whole numbers only.
- **Jettison cans (owner):**
  - hold 15,000 m³ and last 30 minutes;
  - one jettison every 30 minutes per account, and destroying your own can resets that;
  - anyone can loot a can, and anyone can destroy an empty one; the owner can destroy a full one, with confirmation;
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
  - Description: image, text, class, requirements;
  - Stats: shield/hull, speed, holds, yield, targeting, lock time, length;
  - Fitting: the modules fitted (Mining Laser × n, Auto Miner × 1).

## UI and HUD

- **Left panel:** Player, Pilot, Chat, Fleet and Market buttons. A button's name shows only on hover, or while holding on touch.
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
  - target lock icons: select, untarget, distance, a grey line to the target, a tooltip, reorder;
  - a shield, hull and speed row (hull bars are red);
  - the hotbar.
- **Ship actions** (Inventory, Dock, Warp): anchored to the fleet bar, centered on its side facing the screen center, half size.
- **Fleet bar:**
  - shows crewed ships, each with a split shield|hull bar;
  - dragged by its background; hold or right-click the panel button to switch between horizontal and vertical;
  - auto-sized, wrapping instead of scrolling, no resize edges, 16 px end padding.
- **Pilot window:** Licenses, Training Queue, Current Ship (with Locate) and Items.
- **Persistence across reloads:** the selection (ship or station, in localStorage `atamus.sel`) and the camera (sessionStorage `atamus.view`).
- **Context menu:** always renders above windows, and closes on any tap elsewhere.
- **Mobile:**
  - tap, double-tap, pan, pinch, hold-to-lock and box select;
  - text selection and the long-press callout are disabled.
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
