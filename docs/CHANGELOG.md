# Changelog

Newest first. Add one entry per patch in the same commit, and keep it short: what changed for players and any rule decided. Use `git log` for the code detail.

## 2026-10-12

- **Aim pointer locks while orbiting (owner):** holding the middle mouse pointer-locks the cursor — it freezes (hidden) where the press began and the right-click aim stays raycast from that spot; releasing restores the cursor there. (Falls back to freezing just the aim raycast where the browser refuses the lock.)
- **Deploy countdown 1 s for now (owner):** pushes switch the live build after a 1 s warning instead of 30 (gamehttp + both workflows).
- **Sprint, camera sliders, steady grid (owner):** holding Shift doubles the speed (server-applied). A panel of camera sliders: pitch, a two-handle min / max zoom, rotation speed, kept per browser. The grid moved into the ground's own shader (anti-aliased lines on the surface), fixing the flicker a separate line layer caused against the ground.
- **A bigger world (owner): 126 km flat to flat and 300 m/s** (the sphere stays 100 m). The own-movement hard-snap threshold now scales with speed so the faster pace doesn't rubber-band.
- **Right-click aiming, inverted orbit, max zoom (owner):** middle-mouse camera rotation is inverted; zoom is capped at 2,200 m. Holding right-click shows a circle on the ground at the pointer with a line from the sphere to it; the camera slides toward a point between the player and the circle (leashed to 700 m) and zooms out to keep the player in shot, easing back on release. The circle moves nothing yet.
- **Fix: movement rubber-banding.** The client's own-sphere correction snapped back to the server's (half-a-round-trip-old) position every snapshot while moving; it now corrects toward the server's position projected forward by the measured latency (a ping every 2 s), snapping only past 25 m. Direction sends are capped at 20/s (orbiting the camera while moving flooded past the server's 40/s limit, which then dropped inputs).
- **Atamus rebuilt in 3D (owner):** the 2D game is wiped from `main` (all of it preserved on the `legacy-2d` branch, tip `e56e61d`; the database keeps the old data untouched). The new game: one shared 3D world, no POIs, everyone sees everyone; a flat plane with a 2D grid; the same flat-top hexagon border at 5 miles flat to flat; one 100 m sphere per account (yours blue, others red) traveling on the ground plane only at 60 m/s; WASD relative to the camera; middle mouse (touch: one-finger drag) orbits the camera, fixed at 75° looking down; wheel / pinch zooms. Server-authoritative (direction in, 20 Hz sim, 15 Hz snapshots to all), positions persisted per account (`world3d`). The accounts backend, website and deploy countdown are kept; play.html drops character / pilot creation and goes straight to Enter System; the client is Three.js (vendored in `website/vendor/`). The old PTR test suite, wormhole sim and asset generators went with the 2D game.
- **The front page always shows (owner):** signed-in visitors no longer get redirected from atamus.io to the login page; the front page shows for everyone (`front.js` removed). Not-logged-in tabs on play.html and in the game still go to Log in.

## 2026-10-11

- **The market, manuals, 10M (owner, for now):** every NPC station sells everything (modules, weapons, ammo, drones, fuel, license manuals, ore) into your hangar there; module licenses need their manual read first (Read from its menu; account-wide); players start with 10M (everyone below was raised to it once). Fixed: wrecks' Open never showed their contents. PTR: `wreck`.
- **Modules, combat, wrecks, drones, weapons (owner):** every module in S / M / L and I / II (a hull fits its size or smaller; a II is 30% stronger and needs its license at V), with the owner's icons and a license each; actives take power, passives disposition. New: Strip Miner, Tractor Beam, Shield Recharger / Extender, Microwarp Drive (active now), Warp Scrambler, Stasis Webifier, Remote Shield Recharger / Extender, Repair Drone; Targeting Range, Armor, Drone, Locking, Speed Upgrades, Target Tracker, Drone Bay Extender (the old modules are their S I). Weapons from The Reach: Missile Launchers, Beams, Repeaters, Coilguns in four roles, firing Swift / standard / Heavy ammo. Combat: shield, then hull less armor (armor is damage reduction now); destroyed ships leave a wreck (fitted modules drop 25%, the rest 50%) and their pilot is back docked in a new Prospector; wrecks to open and loot, tractor beams. Drones are items in a Drone Bay, launched with a module from the cargo hold and a fuel block each; out of fuel or left behind, they're lost to a wreck. The ETA: Deputies face the right way; officers have guns and can die (escalation); a station's Magistrate chases anywhere and another warps in to guard the station; admins' ETA ships come fitted. PTR: `give item n`.
- **The Expanse Transit Authority (owner):** the ETA Office near Mars, and the law's hulls: Deputy (frigate), Constable (cruiser), Magistrate (battleship), all with Microwarp Drives. 10 Deputies, 5 Constables and 2 Magistrates stand ready at the office, 3 Magistrates guard every NPC station, 16 Deputies patrol POIs (no more than 2 at one). Aggression flags a ship (saved with it: relogs and redeploys don't shake it) and the ETA hunts it: one ship of its size plus 2 Deputies, less the officers already at the scene; each dead officer brings 2 more of its kind and 3 Deputies; officers follow through warps, lock with limited range and time, warp scramble (Deputies) and web (Constables, Magistrates); flagged ships can't dock. The victim answering back isn't flagged; anyone joining in on the victim is. Nothing deals damage yet: aggression is a PTR dev command (`aggress`, `pardon`, `killofficer`). Rules for later: stargate guards (1 Magistrate, 2 Constables at ~20 km), no jumping while flagged. Admins in Admin mode get an ETA ship under their admin name (Deputy, Constable or Magistrate with the owner's numbers): cloak (unseen, no bubble, no scrambling), uncloak with a warp-in (anchored 2 s), instant locks to 200 km that scramble, any module in any slot with no limits, their Local lines over it; the ETA as blue dots zoomed out (no trails); red diamonds at open help tickets' and reports' players (not Language) while they're online, to warp to.
- **Planetary systems, NPC stations everywhere, Microwarp Drive (owner):** each planet is a container out to its outermost moon plus 1,000 km; warping between systems (or to deep space) needs a Microwarp Drive (comes with the market; ETA will have them). The solar view shows only planets and rogue POIs; zoom in on a system to see its contents; no other ships are sent with the camera wider than 60,000 km. An NPC station at every planet; pilots pick their starting planet; a hangar per station. Belts in every system. Free player stations removed (stations will be bought), their storage moved to Earth Station's hangar.
- **Drawing the big system smoothly:** planets, the Sun and rings far bigger than the screen are drawn only where they show; small bodies are plain discs; small moons share a few looks; orbit lines removed (owner); the world grid has steps for the whole system. (It stalled browsers zoomed in near a planet.)
- **Our solar system (owner):** the home system is now modelled on ours: 70 AU across (1.4 million km at 1 AU = 20,000 km), the Sun, the eight planets on their real elliptical orbits with real moon counts (major moons are POIs; small ones are drawn with Info), and rings on Jupiter, Saturn, Uranus and Neptune, where about 70% of asteroid belts spawn with scattered rocks. Earth Station (the Station, Earth's trading NPC station; trading comes with the market) and the Library orbit Earth; new pilots start there. Warp crosses the system in about 2 minutes. Once: old belts removed, player stations moved, ships in space docked at the Station.
- **Staff activity, safe log-off home, blue drone beams (owner):** Moderators and Admins get a free membership while active; 90 days without staff activity turns an Admin into a Moderator, then a player (no quotas); lapsed staff keep the Admin button to ask the Head Admin to be reinstated, with a reason (Approve / Deny under Staff). Ships left in space after a log-off now warp to their owner's station and dock instead of a random safe warp. Mining drones' beams are blue. Former staff (removed or lapsed) never see other players' ships, like Moderators.
- **Hangars, warp camera, Moderator bans, account switching (owner):** ships dock by flying to the front of the station's hangar (the Station's U-shaped bay, a player station's hangar window) and into it, hidden as they pass the front; undocking comes out of it, then away at full speed at a slight random angle, stopping about 5 km out. In warp the camera zooms smoothly all the way out and follows the ship, zooming back in as it drops out; switching pilots meanwhile refocuses on the new pilot's ship. Moderators may ban for a time again, but only while no Admin is online. Logging in to another account in another tab sends the first account's game back to Log in (the cause of the admin panel stuck on Loading).
- **Chat Moderators, trade watch, suspicion, auto-mutes, Remember Password (owner):** Moderators are chat moderators: mute and set mutes / blocks (no bans), reset a player's language, escalate reports / Language tickets / mute-block appeals to the Admins, suggest name bans and words; they see language reports, mute / block appeals, Language tickets, chat, the full log; never other players' ships on the map (Admins only in Admin mode). The promotion page drops the staff-name line for Moderators and mentions their membership perks. The ledger (trades, cans, kills, loot: for the features to come) feeds a Trades web per player with accounts sharing devices or addresses; red flags (credits from strangers, repeat kills, big loot, training without play, many new accounts on a device or address, and the login flags) add to a fading suspicion score: Admins told every 10 points, logins on hold for a day at 30. Language: automatic mutes 1, 5, 10, 30 minutes, an hour, a day (staff told past 30 minutes; staff reset); a people named alone never mutes, contempt before one is Group hostility. Remember Password (a device token); returning players always see Log in. The Head Admin repeals filter words. Also: a UTC clock at the foot of the left panel, Undock under the Fleet window, the Freeze box dark with a green check, red staff options in player menus, the Player / Admin switch red in Admin mode, the admin panel no longer stuck on Loading, Disciplined marks what's new (players leaving it no longer count), the Head Admin is told when a Moderator's suspension ends, Language categories for reports and tickets.
- **Account security (owner):** each browser has a device id; one account at a time per device (several per address are fine). Failed logins back off per account and device (5 free, then 1 minute doubling to an hour), not per address. Logins are recorded with their place (DB-IP Lite, credited on the front page) and whether the address is a known VPN; a login on another device from somewhere unreachable since the last one at 150 mph locks the account (not through a known VPN, and only flagged when the time zone matches), unlocked by the recovery questions, an approved reset or staff. More than 4 devices in 30 days, VPN jumps and a new place at an unusual hour are flagged to the Admins. Staff see a player's logins under Info › Security. A game client sending malformed messages is timed out by device and account (5 minutes, 30, a day). Player text is cleaned of control and invisible characters everywhere; every page has a Content-Security-Policy (inline scripts moved to files). Password fields no longer have Show / Hide.
- **Moderators reworked, staff chats, DM rooms, reset requests (owner):** Moderators have no pseudonym (their own name and portrait, orange) and can only mute, ban for a time and set mutes / blocks between players, each reviewed by the Admins (a Review tab: Approve, Edit, Lift); no freezing, kicking, permanent bans, name bans or deciding appeals. Only Nyssary makes or removes staff; Admins suspend Moderators for the Head Admin to review (only the Head Admin lifts it). A Moderator chat (Moderators and Admins) and an Admin chat (Admins only), both kept to catch up; notifications land in each person's own chat. Staff DMs are rooms: staff can add players or other staff; Freeze is per player, Admins only. The Admin promotion page has a note for Accept / Decline. Password reset requests: a temporary password follows the request, the Head Admin decides, and the account's owner sees open requests at login and can say "This is not me". Rule for later: subscriptions 50% off for Moderators, free for Admins.
- **Promotion page (owner):** a new Moderator or Admin sees a promotion window (the role's abilities, code of conduct, what's expected) and accepts or declines; the role has no powers until accepted; declining (with why) restores their previous role and tells only the Head Admin.
- **Staff passwords by role, Nyssary reset (owner):** Moderators' panel passwords need 8+ characters with a capital, a number and a symbol; Admins' 30+ with 3 of each; the form has Show / Hide and Confirm; any role change drops the old one. The Head Admin can reset an Admin's or Moderator's password; staff locked out can Request Reset with a reason, sent to the Head Admin only. Once, at start: the old Nyssary account (its login stopped working) becomes Nyssary_old_<id> with no role or admin data, and signing up as Nyssary makes the Head Admin at once.
- **Support button, list menus, login fields, EULA updates (owner):** Support has its own button in the left panel (not the chat menu); the Muted and Blocked lists open from right-clicking (holding) the Local or Corp tab. The website's fields stay dark when the browser autofills them. The EULA: continued use accepts every update (no new checkbox); at sign-up it opens in a window and its box can be ticked only once scrolled to the bottom. Log in: Create account carries the typed username and password into sign-up; Forgot your password? is back below Create account.
- **Admin chat, staff notifications, unread counts, High Profanity (owner):** staff get an Admin tab in the chat window (talk under admin profiles; @name pings, kept for them if away). Notifications (language running hot, Moderator suspended, reports, tickets, appeals) arrive there while online, else go to a Notifications tab with a red count on the Admin button (read with the password). Admin tabs show red unread counts per staff member. The Chat tab lists High Profanity players first. The on-screen admin notes are gone (replaced by these).
- **Three staff tiers, suspending Moderators, chat colors, the logo (owner):** staff are the Head Admin (Nyssary only), Admins and Moderators (roles `head` / `admin` / `mod`; the old regular admins become Moderators and any other Head Admin an Admin, once). Only Nyssary makes Admins; Admins make Moderators, handle credits / licenses / items and words, and can suspend a Moderator for 24 hours with a reason (panel locked, admin DMs ended; the Head Admin is told at once, or on their next connect); an Admin can lift it early. In chat, players are blue and Admin-mode lines red (Admins) or orange (Moderators). The website uses the new Atamus pixel logo in its header and the A as its icon.
- **Staff roles (owner):** regular admins are now Moderators (chat and behavior moderation only); credits, licenses and items are Head Admins' only. Several Head Admins are possible; only Nyssary makes or removes them. Staff can't kick, ban, mute, freeze or block staff. New staff make their own panel password (30+ characters, 3 capitals, 3 numbers, 3 symbols; Nyssary keeps the shared one); losing the role drops it. The Players › Admins tab is now Staff. The EULA says staff are unpaid volunteers whose permissions a Head Admin can revoke.
- **EULA and the update log (owner):** an End User License Agreement page; signing up needs its checkbox ticked (the server checks it and keeps the version agreed). The front page's update list collapses when long, with a Full Update Log window over a darkened page. In-game scams are allowed; scams outside the Game aren't. Fixes: the login page's appeal box shows only for a banned player who logged in, and the recovery page's first step hides once the questions show (hidden elements now always hide); Forgot your password? sits between Log in and Create account.
- **Mute, Block, support tickets (owner):** players mute (no chat lines or DMs from them) or block (also no trade / duel / invite prompts, as those come) each other from a name's menu; the world is unaffected. The chat window's menu has Muted List, Blocked List and Support. Admins can set a mute or block between two players (both lists, appeal only); the appeal is a conversation both players see, one message each until an admin gives another (one at a time), Accept lifts it. Support tickets: subject, category, message, then a conversation with the admins (Support tab). Admin tabs wrap.
- **Admin profiles, Freeze in DMs, language meters, filter words (owner):** admins act and speak under an admin name and one of six alien pictures (made on first unlock, changed from the panel's title menu); every earlier line and log entry shows the current profile. The chat has a Player / Admin switch for admins (as Admin: no ship bubble; a DM becomes an admin DM). An Admin submenu on chat names and in admin DMs. Freeze is the admin DM's checkbox (no reason, logged), lasts while that DM is open, survives redeploys, and thaws 5 minutes after the admin leaves or when the DM closes. Kicks, bans and reports save the last hour of chat (Local, Corp, the player's DMs and admin DMs) and the player's ship names; a Reports tab. Rename prompts and Freeze put a dark red overlay over the screen with the window centered; the rename shows the admin's reason. Allow on a banned name offers it back (Revert / Keep). Banned names match leet spellings. The filter gains Slurs and Groups categories and flags profanity in chat; banned words show as asterisks. The Chat tab has a tab per category and updates live. Each player has a language log and meters (overall and per category) that cool over time; running hot notifies admins. A Words tab: admins request filter words, the Head Admin approves (category can change) or denies. The admin Pilots tab looks like the Pilot window.
- **Station Ship Bay (owner):** the Station window lists docked ships under a Ship Bay heading, each a tab that expands to its holds; right-click a ship for Show Fitting, Info, Rename, Undock and Board / Unboard Pilot; a ship without its pilot aboard can't undock.
- **Names, chat log, appeal conversations (owner):** Ban Name (player or pilot): the name goes on a banned names list (Names tab) and they must rename. A name filter (sexual / racist / extremist / profanity, leet-speak too) for account, pilot and ship names. The admin Chat tab keeps flagged Local / Corp lines with the words highlighted (never DMs). Appeals are now a conversation while the ban lasts (login page ↔ every admin; subscribe for notes on new lines); 3 per ban; Timeout on any appeal (days / months / years) then 1 more. A redeploy unfreezes everyone. Celestial anchor markers show only while you're inside. The small station keeps its docking port.
- **Admin tools, celestial POIs, stations for everyone (owner):** the sun, planets and moons are POIs at the bodies themselves; aligning and warping head for their orbiting anchors (the sun has one too, and is in the Celestials menu). Every account without a station gets one at server start. Admin panel: Disciplined list (temp / perma bans, mutes, Freeze; sorted by date, name or type), search on Players / Admins / Disciplined, player links in the log, an Appeals tab (banned players appeal from the login page; accept unbans, deny answers), Mute (no chat), Freeze (ships and everything suspended, untargetable, screen grayed out but for the admin conversation) and admin DMs in their own window the player can't close. Kick / ban close codes are now 4005 / 4006.
- **Admin panel (owner):** Nyssary is the Head Admin. A second password opens the Admin window: Players (Players / Admins) with Info / DM / Report / Kick / Ban / Unban (and Make / Remove Admin for the Head Admin), a player Info with credits and corporation resets and +/−/reset on each pilot's licenses (Head Admin only), and a Log of every kick, ban and change with its reason (Unban from there). Bans are permanent or for hours / days, and the player sees the reason at login. New `users` columns role, corp, ban_perm / ban_until / ban_reason and an `admin_log` table.
- **Celestials (owner):** the sun is back at the center with its glow and flare; five planets with orbit lines and 1–3 moons each, every one with an anchor POI to align / warp to; right-click a body (or space › Celestials › Planets) for Warp to / Align to / Info and its moons. Nothing spawns near the sun (new ships start just south of the Station); belts spawn around planets and moons; player stations keep clear of planets and moons.
- **Player stations, refitting docked (owner):** every account gets its own small station (art cut from the owner's sheets, arms retracted / extended), spawned far from everyone else's with a 50 km POI only its owner sees; dock there, keep items in its own hangar and refit there. Fitting and unfitting now need the ship docked (power on / off still works in space). Local chat: several of your pilots in one place show one bubble. POIs are indexed on a grid so occupancy stays cheap with a station per player.
- **Drones and drag to reorder (owner):** mining lasers are blue; no destination line while orbiting. Drones fly slower within 5 km of the ship, circle it twice streaming their ore in before heading back, and stay on their rock (locked or not) out to the hull's new Drone Control Range (Prospector 20 km). The drone key sends them to another locked rock in range, or recalls them home. Items (per hold, this browser), training-queue entries (now pointer/touch, not HTML drag) and locked targets (priority) can be dragged into a new order, with the others dimming and sliding to preview it.
- **One training-time modifier (owner):** `TRAINING_TIME_MODIFIER` in licenses.js (0.2 for now) is the single value that scales every license's training time; the old unused time switches are gone. No change for players.
- **Training 5× faster for now (owner):** every license level trains in a fifth of its time (Mining Frigate V: 12 min).
- **Range rings, chat bubbles, smoother motion (owner):** the selected ship shows its targeting range (gray dash-dot) and each target-module's range (faint dashed; orange while you hover that module). Local chat shows in a bubble over the speaker's ship for players nearby. Orbiting ships and drones no longer skip: a steadier server-clock estimate, a longer render delay with brief extrapolation, and beams timed from their server start time.
- **Mining visuals and drone hauling (owner):** lasers aim only at points on a rock's art, never its transparent corners (precomputed per sprite). Drone beams reach the rock's center with ore squares riding them. Each drone yield is now flown to the ship (1 km/s), dropped in the ore hold on arrival, and the drones fly back before the next cycle.
- **Orbit, standby, power and log-offs (owner):** right-click an object → Orbit (full speed, 0.5 km beyond its no-destination line). Lasers and drones switched on without a target wait on standby and start on the first lock in range. Fitted modules can be powered off (disposition only, no power); a fit past power goes in powered off. Lasers fire from the Prospector's four hardpoints at a point inside the rock held for the cycle, with a yield square traveling the beam each cycle; drones orbit the rock's no-destination line facing it. Items can be dropped on another hold's tab, and only places that take the item light up. Tab rows are centered. Logging off with a ship undocked leaves your ships working for 5 minutes, then they safe-warp away; all docked is a safe log-off.
- **Cleanup and speed:** about 250 unused pre-reset CSS rules removed; US spelling in comments and docs. Snapshots send fit, holds, stats and the hangar only when they change; ships are indexed per account.
- **Modules, mining and the Station (owner):** eight modules (Mining Laser, Mining Drones, Afterburner I active; Cargo Expander, Inertia Stabilizer, Mining Laser Upgrade, Mining Beam Extender, Mining Overclocker passive) with power / disposition costs, a one-time starter kit in each ship's cargo hold, drag-to-fit, hotbar on/off, working lasers and drones that mine locked rocks into the ore hold, the afterburner, and five module licenses (Mining Lasers, Mining Drones, Mining Upgrades, Engineering Upgrades, Engines). A temporary Station: dock (a Dock button under the Fleet window when in range), an unlimited per-account hangar, and a Station window with the ship list and storage scrolling separately. The PTR's dev `move` also undocks.
- **Mining Frigate license, Fitting stats (owner):** the trainer has Mining Frigate again: 5 levels, level 1 known from the start, level N taking N × 12 min. Ships always fly at full stats; each level adds a step of the hull bonuses (Prospector: +4% Mining Laser yield, +1% range, +10% Mining Drones yield per level). The Fitting tab drops Max Power / Max Disposition from its stats; the Stats tab's Fitting section lists Active / Passive Slots and Max Power / Max Disposition instead of bars. The hotbar's empty slots and keys show while the Fitting window is open. (An efficiency curve scaling ship stats by license level was built and dropped the same day.)
- **Fitting layout everywhere, Show Fitting (owner):** the two-column Fitting tab (slots and ship left, stats right) is used on desktop too, with Power and Disposition fill bars under the modules (also on the Stats tab, replacing the slot counts). The left column down to the bars bounds the window's minimum; the stats scroll. Show Fitting is in the selected ship's and the fleet cards' menus.
- **Window polish and phones (owner):** Fitting's Active / Passive labels sit inside their boxes, small and gray, with the ship centered between them and the content close under the tabs. Inventory has a tab per hold with that hold's fill bar under the tabs; only the slots scroll, and the window always fits a slot. Right-clicking a fleet card gives its ship's menu plus Pilot Info. Phones get a compact layout (`html.phone`): tighter windows, and a two-column Fitting tab. A window grown to its minimum is put back on screen.
- **Look At, ship names, Fitting layout (owner):** right-click an object for Look At (the camera follows it, zooming about its center). Ships can be renamed (right-click one of yours, or its name on the Fitting window). The hover line runs from the target's ring on the HUD to the object, thinner. Storage stats list every hold (Prospector: Ore Hold 5,000 m³, Cargo Hold 50 m³ as before the reset). Requirements get a green check when met. The Fitting window keeps its tabs on top, scrolls only the stats, can't shrink below 6 slots × 4 stat rows, and labels the Active / Passive rows.
- **Active and passive modules (owner):** module slots are active (on the hotbar, keyed 1, 2, 3…) or passive, a number of each per hull; the Prospector has 4 active and 3 passive. The Fitting tab shows active slots above the ship and passive below; Stats lists both.
- **Fitting tabs and click controls (owner):** the Fitting window has Fitting (ship, slots, general stats), Hull (description, bonuses), Stats and Requirements (licenses, the ark that carries it) tabs; the Prospector gains armor 150 (placeholder), 12 slots, power 40, disposition 70, its old description and bonuses, and requirements Mining Frigate I / Light Ark (placeholder). A ship's Info uses the same general stats. Double-click an object to lock it; Ctrl + click: Align To; Shift + click: Move towards (on space: fly there). Windows open wholly on screen.
- **Straight flight, Align To, windows (owner):** pathfinding and object collisions are out again: ships fly straight to their destination until given another, over anything, but a destination still can't be on an object (dotted outline on hover). Align To now only turns the ship to face the object at the speed it had (standing still: just turns), stopping at the object's no-destination line. Inventory and Fitting are window buttons in the left panel (the hotbar's Inventory button is gone); a new Fitting window shows the ship and its 12 slots. A ship's Info is its hull's stats; another player's ship has Pilot Info (`/game/pilot-info/:id`). The Pilot Sheet is renamed Pilot Info.
- **Pathfinding and passing over (owner):** ships pass over each other; move orders and Move towards fly a path around asteroids and Library props (`pathing.js`). Objects are solid out to their whole art (no clipping), a destination can't be set within 70 m of one, and hovering one shows that zone as a light dotted outline. Distances to objects are edge to edge (the picked label now too). The destination line follows the path and shows even when the ship is off screen.
- **The Library (owner):** a POI 1,200 km north of the center with every space object's art in rows at true size: ship hulls in blue and red, NPC law ships, structures, and every ore's rock in each size. Its props are solid and can be picked (name and distance). The occupancy cache is now keyed on the tick, not the clock.
- **Targeting and the HUD (owner):** right-click (hold) an asteroid or ship for Lock Target / Unlock Target, Align To, Move towards and Info (Prospector: 5 km, 5 targets, 3 s locks; cargo 5,000 m³). A HUD at the bottom center shows the locked targets in priority order (× unlocks; a lock in progress can't be canceled; hover draws a faint line to the object), shield / hull / speed (hover: max speed), and the hotbar: an Inventory button and 12 module slots (keys 1-9, 0, -, =), empty slots hidden unless a module is dragged. The PTR's dev `move` now also clears the ship's orders.
- **Player Sheet buttons (owner):** another player's sheet has DM and Report buttons at the bottom.
- **Chat: Info, DM, Report (owner):** right-click (or hold) a name in chat for their Player Sheet, a direct-message tab, or a report (category and description, stored on the server for admin tools later).
- **Clicks (owner):** a single click selects (your ship's pilot, or an asteroid: gray brackets, its ore and distance; orange is kept for targeted); a double click on space flies the ship there.
- **Solid asteroids (owner):** ships can't fly through rocks (only warp passes through things); a move order into one stops at its edge.
- **Fixes:** a player who's signed out and lands on the "updating" page (say, a browser restored after an update) is sent to log in instead of being stuck at "Welcome back, …" with only Log out. Every scrolling box inside a window (like the Player Sheet's stats) uses the game's own scrollbar, not the browser's.
- **Fix:** the Player Sheet's minimum width measured its own stretched rows, so resizing only ever made it wider; it now resizes both ways.
- **Player Sheet (owner):** titled Player Sheet, with a row for your character's small portrait and your name; at its smallest it shows three stat rows and only they scroll. Resize knobs are two faint blue bars. The front page's Updates lists features only (the Pilot Sheet bullet came out).
- **Pilot Sheet (owner):** the Pilot window is now the Pilot Sheet: every pilot side by side with their name beneath (pick one to select them, no recentring), tabs centered. Resizable windows have a visible corner knob (bigger on touch). A belt's own menu opens beside the Belts list and keeps the list open. The front page's Updates is now one entry per day, starting from the reset.
- **Belts menu (owner):** space menu › Belts is now a plain list; right-click (or hold) a belt for its Warp to / Align to menu, instead of a third layer of submenus.
- **Design:** the owner's vertical-slice goals are at the top of DESIGN.md.
- **Asteroid belts, align and warp (owner, major):** belt POIs are back: 100 km across, a half moon of rocks 45 km out (give or take 5), all five ores, at least 2,000,000 m³ each. After an hour they slowly waste away, rocks shrinking large → medium → small; a mined-out belt leaves the map but stays open while ships are inside. Right-click (or hold) a belt's marker, or space › Belts, to Warp to or Align to it; Align and Warp also sit under the Fleet window. Aligning flies at regular speed toward the POI; Warp aligns then warps (about 30 s across the map); if the POI disappears you drift. Clicking your ship now only selects its pilot; Center on ship is in the space menu; Tab centers on the next pilot's ship, zoomed to a whole POI.

## 2026-10-10

- **Fleet, pilots and chat (owner):** the Fleet window is back as how you switch pilots: each card shows the pilot's portrait, their ship with shield and hull bars, and their name; click to select (the camera stays put), double-click to follow; Tab steps through pilots. Every pilot now has their own Prospector. Local and Corp chat are back, with each message showing the speaker's character portrait. WASD pans the camera; right-click no longer opens the browser menu; the closest zoom is now 3.25 km across. Everyone's pilots were reset (accounts and characters stay).
- **Characters and pilot portraits (owner, major):** the play page now has a character creator for your account (your one portrait in chat; its name is your username), then a pilot creator with a portrait and a name. Both use the new 32×32 portrait art: Male / Female (which hairstyles are offered), skin, hair and its color, outfit and its color, background, and Randomize. The Player Sheet and Pilot window show them.
- **Back to basics (owner, major):** the game is stripped back to the Player and Pilot pages, the Expanse's empty hexagon (20,000 km across) and one Prospector each that you click or tap to fly. Stations, stargates, planets, asteroids, mining, modules, inventories, the market, chat, the HUD, bases, the tutorial and every license are gone from the live game; all of it is kept in `reference/2026-10-10-pre-reset/` (and commit `0a745ec`, the last one before the reset). Full wipe: every pilot, ship, item and credit (accounts stay).
- **Warp camera:** following a ship between POIs now zooms all the way out and holds the map still while the warp trail shows the trip, then zooms back onto the ship when it drops out.
- **Arks renamed (owner):** Light Ark, Heavy Ark, Capital Ark (and their yards).
- **Tutorial shard (testers):** Nyssary can pick a Tutorial server on the play page: a fresh, unsaved private world with a 21-step playable tutorial from undocking to building a ship; the base runs 60× faster there.
- **Base sockets and turning:** pipes only connect at the sockets in each building's art and turn to meet a socket they start or end beside; pipes must start from a pipe or a socket. Buildings turn 90° (R, right-click or hold while placing) and show as a half-transparent preview; pipe drags preview at half opacity.
- **Balance (owner):** Mining Laser 10 m³ per 15 s cycle; Mining Drones 25 m³ per 60 s cycle; Cargohold Expansion +15%; Mining Laser Upgrade +5%; Prospector ore hold 5,000 m³.
- **Base art and directional pipes:** buildings, storage and ark yards use the owner's art; pipes flow the way you drag them (branch, merge, cross) and are drawn with the directional pipe tiles. New Small (1 × 1) and Large (3 × 3) Storage Depots; ark yards shrink to 4 × 3, 6 × 4 and 8 × 5. Old pipes stay two-way until redrawn.

- **Base:** the Home Base, storage, refineries and factories are drawn as steel frames in the docks' style instead of flat colored boxes (placeholder until their art exists).

- **The base (major):** every player gets a home planet (spread evenly); docking there unloads ore into your Home Base. The Base window lets you build refineries, factories, storage and shipyards with credits, link them with pipes, and refine ore into iums, iums into 18 components, and components into ships and arks (frigate 2 h, barge 24 h, exhumer 3 days, arks 3 / 10 / 30 days). It keeps running while you're offline. Arks exist as hulls.

- **Front page:** Updates scrolls inside its panel; "Help build Atamus" sits under the game description.
- **Design:** the base production chain (home base, pipes, refineries, factories, storage, shipyards), 18 components and arks as carriers are written up in DESIGN.md with first-pass numbers. Component icons added (not used yet).

- **Balance pass:** new hardpoints, disposition, capacitor and ore holds for every hull (Prospector 8 hardpoints), Prospector targeting 5 km, and role bonuses: Prospector drone yield, Bulwark / Rampart cheaper propulsion, Collier / Carrack stronger cargohold expansions.
- **Space menu:** right-click (or hold) empty space for Recenter on ship and Planets / Stations / Stargates / Belts submenus that warp you there.
- **Front page:** a "Help build Atamus" card (AI placeholder assets; how to get in touch).

- **New modules (major):** Mining Drones (launch once, press F to send them at your target: they orbit it and mine), Afterburner and Microwarpdrive (more top speed while running, one at a time), Cargohold Expansion (+50% holds) and Mining Laser Upgrade (+10% laser yield), both with diminishing returns. Fitting numbers are placeholders.
- **No more warping inside a POI;** use propulsion modules. Warp is only between POIs.
- **F** now sends drones; clicking a pilot in the fleet bar centers the camera on their ship.

- **Stargates** aren't selectable any more: left-click shows name and status; right-click (or hold) for Jump and Info.

- **Stargates:** new art, a 2.4 km bar with two glowing rings (the round ring and its effects are gone). Ark sprites added for later.
- **Defense turrets** stand around the station and every stargate (not armed yet; their heads sweep slowly).
- **Zoomed out:** ships use their own hull icons (blue yours, red others').
- **Rocks:** hover or click one to see its ore name and distance; right-click for Lock / Unlock and Info.

- **Ores renamed:** Cryonite, Pyroxite, Duranite, Hexite, Tantalite (refined later into "-iums").
- **Zoomed out:** ships show as their class icon (blue yours, red others') and rocks as their ore icon.
- **Wheel zoom** goes toward the mouse when the camera isn't following a ship.
- **Fleet bar actions** are a third bigger.

## 2026-10-09

- **Warp between POIs:** crossing the system takes 30 s (2 s + 28 s per AU); the ball flies straight from the entry window to the exit window.
- **Camera:** locks onto a followed ship at warp instead of trailing behind.
- **POIs:** a POI's zone and contents (rocks, structures, other ships) only show, and are only sent, while you have a ship in it; otherwise it's just its icon at any zoom.
- **Map icons:** new pixel-art icons for the station, stargates and asteroid belts.

- **The Expanse (major, needs a wipe):** one shared home system replaces personal systems.
  - A 1 AU hexagon with the sun at its center, made of points of interest: 4 procedural planets, the Expanse Station, 6 offline stargates on the edges, and asteroid belts spawned by population (one per 12 players online, at least 3) with hidden lifetimes; an expired belt is held open, unmarked, until the last ship leaves.
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
- **Hotbar colors:** mining modules orange, combat red, automation blue, passive gray. The running animation is a soft sweep in the module's color, without the shine.
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
- **Spelling:** "licenses" → "licenses".

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
  - keys 1–9, 0, −, = fire the slots, and each slot shows only its gray key label;
  - new states: amber outline when powered, a fill timer while running, gray when stopping (no re-arming), dark slate when off;
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

- **Market:** a search bar; rows open the buy window, with no Buy buttons in the list. The buy window has [−][count][+] for any quantity, Total as "cost / your credits", Buy grayed out when you can't afford it, and a divider between the info and the purchase.
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
- **Hotbar module menu** (right-click or hold): Activate/Deactivate/Keep cycling, Power on/off (saved; an offline module is grayed out and the auto-miner skips it), and Info (cycle, yield, range, live).
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
