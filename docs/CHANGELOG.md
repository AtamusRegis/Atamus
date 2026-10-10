# Changelog

Newest first. Add one entry per patch in the same commit, and keep it short: what changed for players and any rule decided. Use `git log` for the code detail.

## 2026-10-09

- **Warp between POIs:** crossing the system takes 30 s (2 s + 28 s per AU); the ball flies straight from the entry window to the exit window.
- **Camera:** locks onto a followed ship at warp instead of trailing behind.
- **POIs:** a POI's zone and contents (rocks, structures, other ships) only show, and are only sent, while you have a ship in it; otherwise it's just its icon at any zoom.
- **Map icons:** new pixel-art icons for the station, stargates and asteroid belts.

- **The Expanse (major, needs a wipe):** one shared home system replaces personal systems.
  - A 1 AU hexagon with the sun at its centre, made of points of interest: 4 procedural planets, the Expanse Station, 6 offline stargates on the edges, and asteroid belts spawned by population (one per 12 players online, at least 3) with hidden lifetimes; an expired belt is held open, unmarked, until the last ship leaves.
  - One zoom from true km scale out to the whole system map; right-click or hold a POI icon to **Warp to** it (align, window, a ball across the map, drop out inside).
  - You receive the POI your camera is on plus your own ships; collisions are per POI; sockets are compressed; local chat is Expanse-wide.
  - Logging off despawns your fleet after 20 s; logging in puts it back, or into a fresh unmarked 20 km POI if its POI is gone. New players start docked at the station.
  - Removed: home systems, fuel stargates, asteroid beacons and instances, home rocks, offline mining.
  - **World wipe:** ships, hangars, cans and belts are cleared; pilots, licenses and credits stay.

- **Stars:** smaller, crisp points, and they no longer rubber-band at the pan limit. The sun is dimmer.
- **Right-click menus:** centered above the press; below near the top; to the right near the left edge, to the left near the right edge.
- **Item info:** Weight and Price show one value for a single item.
- **Station window:** opens when a docked ship is selected or the selected ship docks.
- **Acceleration gates:** they pivot on the spine, so the spine points at the partner gate.
- **Phones:** forced landscape (fullscreen and orientation lock on the first tap; not iOS).

- **Backdrop:** the nebula is replaced by a dark gradient with slow drifting noise, a very thin world grid and parallax stars that dim and brighten.
- **Fix:** a GPU hiccup could blank the background and the sun; both now recover.
- **Station window:** opens only for a selected pilot inside the station.
- **Undocking:** ships fly out of the docking bay and stop near the edge of the dock ring, facing away.
- **Acceleration gate jumps:** fly into the gate, cross to the partner gate as a ball in 5 s (any distance), drop out and stop. Gates point at their partner gate.

- **Acceleration gates** replace the asteroid beacons: the point faces the instance they lead to, they glow when linked, and light runs along the spine. Linked instances show as faint empty hexes until you go through.
- **Stargate:** blinking lights, drifting light motes in the ring when powered, and a turning swirl when connected.
- **Station:** the blinkers are slow and occasional, and the running lights are much slower.
- **Warp:** the exit window only appears in the last second before the ship comes out.
- **Fitting window:** Fitting stats drops the module table; Stats is renamed Ship stats.

- **Asteroid instances (major):**
  - belts are gone; mining moves to small shared instances reached through 2–3 asteroid beacons in your system, which glow when linked;
  - Jump takes your selected ships in range;
  - 5 players per instance; instances decay over 24 h and close when mined out, sending ships home beside their beacons;
  - they survive restarts.
- **Home rocks:** scattered across the system, with clusters at the beacons.
- **Offline mining:** ships keep mining while you're offline until their targets are gone, holds full or lasers off/burnt; restarts carry on.
- **Jettison cans:** owner-only for 30 min, then open to anyone for 10 min, then gone.
- Added `scripts/tests/instances.mjs`.

- **Warp field:** full warp speed all the way through the field, with no easing. Ships drop out of the exit window at warp speed and brake to a stop outside it, on the destination.
- **Warp exit:** ships come out of the exit window at full speed and make a hard stop to dead still on the destination.
- **Smooth camera:** ships are interpolated between server-timestamped snapshots (stamped with the simulation time, which fixed the 20 Hz / 15 Hz mismatch), so following a ship no longer jitters, even at warp.
- **Fix:** closing the stargate window deselected your ship, hiding the HUD and fleet actions. The selected pilot's ship now always stays selected.
- **Hotbar slots** are fixed per module: fitting or unfitting never reshuffles them, and only your drags (slot onto slot) move them. Drop a module on an empty slot to fit it there.
- **Fitting window** rebuilt EVE-style: tabs for Fitting (ship image, current numbers, the slots below, 8 a row and centered), Fitting stats, Stats, Description and Requirements.
- **Station:** a soft glow, blinking beacons and running lights chasing into the docking bay.

- **Warp rework:** ships align to full speed, open a blue warp window, cross as a glowing ball, come out of a second window at full speed and brake to a stop on the destination, with no overshoot or bounce. Other players see the entry window, and the exit window seconds before landing. Your selected ship shows a progress line.
- **Stargates:** clicking a gate opens its window without changing the selection (like the station). Inactive gates refuel by themselves, 0 → 30 min in 10 min.
- **Pilot window:** shows the pilot selected in the fleet; the pilot dropdown and the Current Ship / Items tabs are gone. "New pilot" moved to the fleet bar's right-click / hold menu.
- **Hotbar colors:** mining modules orange, combat red, automation blue, passive grey. The running animation is a soft sweep in the module's color, without the shine.
- Added a warp check to `scripts/tests/gameplay.mjs`.

- **Hull bonuses:** hulls no longer have their own yield or range. Modules have base stats, and each hull's Hull bonus adds % to the Mining Laser (shown in ship info's Description).
- **Acceleration:** each hull has an acceleration stat; ships speed up and brake at that rate.
- **HUD:**
  - the status row reads "Speed: X"; hovering shows max speed and acceleration;
  - module hover shows cycle time, yield, range and capacitor use;
  - the HUD stays while docked with the pilot aboard, so modules drag between a hangar and the hotbar to fit or unfit them;
  - a pilot without a ship gets a "Pilot not in a ship" box;
  - dragging a target drags only that target.
- **Fitting window:** the green capacity number shows its contributors on hover instead of extra rows.
- **Ship info:** license requirements moved to the Fitting tab, in a collapsible section; Stats shows acceleration.
- **Fleet actions:** Undock and Inventory show while the pilot sits in a docked ship.
- **Settings:** sliders restyled to match the game.
- **Spelling:** "licences" → "licenses".

- **Targets:**
  - the primary target is the leftmost, with a white bar under it, and clicking a target makes it primary;
  - the tooltip and line to the target show on hover only;
  - rock names lose their size; the × is centered.
- **Hotbar:** a laser switched on with nothing locked waits on Standby (blinking) and fires on the next lock. Running modules have a glint circling their outline. The auto miner cycles without a target.
- **Ranges:** Prospector targeting is 3 km and laser range 1 km; the others were scaled down to match.
- **Licenses:** new categories (Mining / Combat / Industry Ships; Mining, Automation, Power and the weapon types). The training queue shows total time left.
- **Fleet actions** always show and their icons are centered. The fitting table has more room below Heat.
- **Fleet panel:** lists pilots with their ships, with smaller cards. One pilot is always selected, and clicks on empty space no longer deselect.
- **Hotbar:**
  - keys 1–9, 0, −, = fire the slots, and each slot shows only its grey key label;
  - new states: amber outline when powered, a fill timer while running, grey when stopping (no re-arming), dark slate when off;
  - hovering shows cycle time and m³ per cycle.
- **Item info:** Description / Stats / Fitting tabs. Module Info from the hotbar opens the item info.
- **Settings window:** a Sound tab (All / Music / SFX). Background music added.
- **Fix:** the hangar ship menu showed a stale crew state after crewing or removing a pilot.
- **Fix:** the fleet bar's ship action buttons ignored mouse clicks, because a rebuild on pointerup swallowed the click. They now rebuild only after the bar is actually dragged.
- **Website:** a new front page (description, Play now and a major-updates list), restyled to match the game. Login moved to login.html, and signed-in visitors go straight to "Welcome back".
- **Quick training:** level N of every license takes N minutes, for now.
- **Player reset:** accounts were kept. Every pilot, ship, item, can and credit was wiped, so everyone starts as a new player.
- **Fitting window:** the icon strip is gone, and modules are now a table: Module | Disposition | Capacitor.
- **Capacitor color:** yellow (shields are blue). Running hot shifts it yellow → orange → red.
- **Fitting ring:** the capacity tick always shows; it sits at the top end when the fit can't run hot. The capacity number turns green when batteries or Capacitor Management add to it, with green +rows for each addition and no Base row.

## 2026-10-08

- **Fitting:** hardpoints, disposition and capacitor per hull. Modules (Mining Laser, Auto Miner, Capacitor Battery) are market items, fitted while docked in a new Fitting window. New ships come empty, and existing ships kept 2 lasers plus an auto miner. Added a Capacitor Management license.
- **Running hot:** going past the capacitor builds heat; at full heat the modules past capacity lose integrity and burn out; docking repairs them.
- **HUD:** the hotbar has one slot per hardpoint. A ring shows disposition and power, with a capacity tick (blue, then yellow, then red); click it for fitting details. Added `scripts/tests/fitting.mjs`.

- **Market:** the purchase view now opens inside the market window, and Buy or Cancel returns to the list.

- **Buy window:** shows only the item's icon and description at the top, plus an Info button that opens the item info or ship info in its own window. The ship tabs moved out of the buy window.

- **Market:** a search bar; rows open the buy window, with no Buy buttons in the list. The buy window has [−][count][+] for any quantity, Total as "cost / your credits", Buy greyed out when you can't afford it, and a divider between the info and the purchase.
- **Ship info:** Description / Stats / Fitting tabs, in the ship info window and the buy window.
- **Item info:** Weight and Price shown as unit / stack. Rarity and price per m³ removed.
- **Inventory header:** the stack limit is no longer shown.

- **Inventory windows:** minimum sizes now follow their content. They can't be narrowed past their tabs or one slot, or shortened past their first slot.

- **Inventories:** no more fake empty slots, just one spare cell to drop into. Every inventory window, the station hangar included, can shrink to one slot wide; the station's ship list moves above the grid when it's narrow.

- **Inventory windows** can be made narrower again; their slot grid reflows. A resize guard was snapping them back to full width.

- **Phones:** the whole UI is about 30% smaller (viewport scaling on small touch screens), and the map shows more space.

- **Pilots:** extra pilots cost 1,000,000 cr, up to 3 per account. Create them from "New pilot" in the pilot window's dropdown. Added `scripts/tests/pilots.mjs`.

- **Project memory:** added `CLAUDE.md`, `docs/FEATURES.md` (the living spec) and this changelog.
  - `scripts/check.sh` syntax-checks everything.
  - `scripts/ptr-test.sh` runs the PTR regression and stress suite.
- **Hotbar module menu** (right-click or hold): Activate/Deactivate/Keep cycling, Power on/off (saved; an offline module is greyed out and the auto-miner skips it), and Info (cycle, yield, range, live).
- **One session per account:** a new tab or device ends the old one (code 4002), and the old tab goes to play.html.
- **Only ore can be sold.** Manuals are consumables and ships are assembled.
- **Stress-test fixes:**
  - a malformed message could crash the server; it's now ignored and logged;
  - whole-number quantities only;
  - commands name their item;
  - lasers stop immediately on a full ore hold;
  - windows stay on screen (phones);
  - pilot cap of 3;
  - a flood limit of 40 commands a second, and a 64 KB message limit;
  - the station selection is restored on reload;
  - an expired session goes to the website;
  - ships lost when a gate closes now lose their cargo.
- **Cleanup:** removed dead code; rocks are indexed by id on the client; no snapshots for offline players; unchanged saves are skipped.
- **Market:** ships are grouped Ships › Industry › class.
- **License popups:** they drag on touch, and unlock outlines appear only in license info.
- **Selection drives the inventories:** a ship's inventory closes when it's deselected, and the station's closes when the selection leaves the station.
- **Update countdown:**
  - shown to players who join mid-countdown;
  - counts down even if GitHub can't be read;
  - Enter System always loads a fresh page;
  - deploy logs print the countdown response.
- **Names:** factions use a DarkOrbit-style roster. Deep Core Industries is both the mining hull maker and the starting corp. The region is the Expanse. Hull class names are Prospector, Dredger/Bulwark/Collier and Excavator/Rampart/Carrack.
- **Licenses:** specializations were merged into hull license levels 6–8, with one bonus per license. Hull efficiency is +20% per level for levels 1–5, then +5% per level. Unlock outlines added.
- **Jettison cans** and per-ship names.
- **Market:** a buy popup was added, and credits now show in gold.
- **Live updates:** a 30 s countdown, then logout to the updating page. The first pilot is named on the website. The PTR (a private local test copy) was introduced.

## Earlier

See `git log`. Earlier work covered:

- **Mining:** selling ore, mining lasers and cycles, beams, the auto miner, rock removal.
- **Inventories:** inventory grids, the item menu, station hangars and Deliveries, packaged ships.
- **Ships and crews:** crew/decrew, the fleet bar, the HUD (targets, status, hotbar).
- **Windows:** tab stacking, persistence across reloads.
- **Market and licenses:** the market, training manuals.
- **Mobile controls.**
