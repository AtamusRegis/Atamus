# Changelog

Newest first. Add one entry per patch in the same commit, and keep it short: what changed for players and any rule decided. Use `git log` for the code detail.

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
