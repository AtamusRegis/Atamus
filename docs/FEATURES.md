# Atamus: how the game works today

This is a living spec of the game. Read it before every patch, and update it in the same commit as any change to behavior. Rules marked **(owner)** were decided explicitly by the owner, so keep them unless the owner says otherwise.

## Back to basics (owner, 2026-10-10)

The owner took the game back to scratch to focus on the Prospector's gameplay. **The game is the Player, Pilot, Chat and Fleet windows, the world boundary, a Prospector per pilot, and asteroid belts to align and warp to.** Gone from the live game: stations, stargates, planets, the sun, mining, modules, fitting, the market, whispers, settings and music, bases, the tutorial shard and every license in the trainer. (The Fleet window and Local / Corp chat came back the same day, owner: "I didn't tell you to get rid of the Fleet window". Target locking, the HUD with its hotbar, and the ship inventory came back on 2026-10-11, owner.)

- **Kept for reference:** everything that was live just before is in `reference/2026-10-10-pre-reset/` (client, server, tests, and the full FEATURES.md that described it) and at commit `0a745ec` (the last one before the reset). The art is still in `website/assets/`. Bring things back from there when the owner asks for them.
- docs/DESIGN.md is still the long-term plan.

## The world (owner)

- **The Expanse's hexagon, empty:** 1 AU across at the map scale the game always used (1 AU = 20,000 km), so **20,000 km across, flat to flat**, with flat top and bottom edges. The origin is its centre. Its edge is drawn as a thin line.
- **The edge stops ships:** a move order past it is pulled just inside, and a ship that reaches it stops dead there.
- **One Prospector per pilot:** each of your pilots has their own (id `<account>:ship:<pilot>`), which first appears within 5 km of the centre. A new pilot gets one (the server rereads your pilots when the client says so, and every minute); a pilot that's gone takes theirs along. It's the only ship (`SHIP_TYPES.chisel` in constants.js): 128 m long, top speed 335 m/s, acceleration 0.15 km/s², hull 200, shield 225 (shown in the Fleet window and the HUD; nothing damages ships yet), **targeting range 5 km, 5 targets, 3 s to lock** (its numbers from before the reset, owner's balance pass), **cargo 5,000 m³** (owner). No modules yet.
- **Flying:** the ship accelerates toward its target as fast as it can while still able to brake in time, faces the way it's moving, and stops on the point. At top speed, crossing the hexagon takes about 16½ hours.
- **Everything in space is solid (owner):** overlapping ships push apart (the lighter one more) and lose the velocity pushing them together, and a ship can't fly through an asteroid: it's pushed back out (to 90% of half the rock's sprite size plus its own radius; the art doesn't fill its square) and loses the velocity into it. A move order into a rock stops at its edge. Only a ship in warp passes through anything.
- **Logging off:** a closed connection keeps your ships in space for 20 s (a reload), then they leave the world. Logging back in puts each where it was (pulled inside the edge if it somehow wasn't). Positions are saved every 10 s and on leaving.
- **Other players:** your own ships are always sent to you (with their pilot, hull and shield). Other ships are sent while they're inside your camera's view (the client reports its view; a view wider than 40,000 km is capped). Other players' destinations aren't sent.
- The server simulates at 20 Hz and sends snapshots at 15 Hz; the client draws ships 110 ms in the past, interpolated between the two snapshots around that moment.

## Asteroid belts (owner)

- **Belt POIs:** 100 km across (`belts.js`). One per 12 players online, at least 3, placed anywhere inside the hexagon clear of its edge and at least 600 km from each other. They survive restarts (the `instances` table).
- **A half moon of rocks:** the rocks lie on a crescent around the POI's centre, facing a random way: within 90° either side of its middle, at **45 km from the centre, give or take 5 km** (owner: "near 50 km, give or take 5"; 45 keeps the crescent inside the POI's 50 km edge), thickest in the middle and thinning toward the horns.
- **Ore:** at least **2,000,000 m³** between all the rocks. **All five ores** are back: Cryonite, Pyroxite, Duranite, Hexite, Tantalite (keys ironstone, cuprite, cobaltine, iridite, starglass), each with its own rock art. A belt's main ore is picked by rarity (50 / 28 / 14 / 6 / 2), mixed with a couple of commoner ones.
- **Rock sizes follow their ore:** large (1000 m) from 20,000 m³, medium (500 m) from 5,000 m³, small (200 m) below that. A new large rock holds 25,000–60,000 m³, a medium 6,000–15,000, a small 1,500–4,000.
- **Wasting away (owner):** untouched for its first hour, then each rock loses ore steadily over 1–3 hours of its own, shrinking large → medium → small as it goes, until it's gone. There's no mining yet.
- **Mined out:** a belt with no rocks left **stops showing on the map** (and a replacement spawns), but **stays open while anyone's ships are inside**; it closes once they've left.
- **Who sees what (owner):** every belt still showing is on everyone's map as an asteroid-field marker (hover: its name). Its zone (a faint dashed circle) and rocks are only sent to, and drawn for, players with a ship inside it. Rocks are drawn at true size; when one would be under 6 px it's a dot, or its ore's icon when the belt is big on screen.

## The Library (owner)

A POI (`library.js`) that shows **every space object's art in rows**, always on everyone's map (map marker: the waypoint pin; hover: "Library"), 1,200 km north of the centre, 60 km across. It never wastes away or closes, isn't saved (it's built at start-up), and doesn't count toward the belts.

- **The rows**, top to bottom, each centred, smallest to largest left to right: every ship hull in **blue** (Prospector, Wick, Bulwark, Rampart, Dredger, Excavator, Collier, Carrack, Beacon, Light Ark, Gleaner, Lodestar, Motherlode, Vigil, Heavy Ark, Capital Ark); the same in **red**; the **NPC law ships** (Deputy, Constable, Magistrate); the **structures and small objects** (Mining Drone ×2, Jettison Can off / on, Turret Base, Turret Head, Acceleration Gate, Stargate, Station blue / red); and the **asteroids** (each ore's rock at 200, 500 and 1000 m). Every sprite in `assets/ships` and `assets/rocks` is on a shelf. (Base-surface buildings and shipyard docks aren't space objects.)
- **True size:** the size each object had in the game before the reset, otherwise its art at 1.875 m per pixel (the scale nearly every sprite was drawn at). Rocks are their size wide, as in a belt.
- The shelves sit above the POI's centre (clear of its marker); a warp drops out about 4 km below the bottom row.
- **Props:** drawn at true size, only sent to players with a ship inside (like a belt's rocks). They're **solid** (a box at 90% of the art's; a move order into one stops at its edge). A single click picks one: grey brackets and "Name - distance". Nothing else: no menu, locking or Info.

## Align and warp (owner)

- **Align to a POI:** the ship turns and flies toward it at regular speed; the POI becomes its **destination**. It can warp there as long as the POI still advertises itself (shows on the map). If the POI stops showing, the destination goes and the ship **drifts on** at its speed and heading (no braking) until given a new order or stopped by the edge.
- **Warp to a POI:** align, and warp as soon as aligned: at least 75% of top speed, heading within 5° of the POI. You can't warp to a POI you're already in.
- **The warp:** a straight line, easing in and out, taking 2 s plus the distance at about 714 km/s (owner: crossing the system takes about 30 s). It drops out 30 km from the belt's centre on the inside of its crescent (give or take a couple of km), at a dead stop, and the destination is cleared. No orders are taken mid-warp; ships in warp don't collide. A warping ship leaves a short fading streak.
- **Camera (owner):** following a ship through a warp zooms all the way out and holds the whole map still; when it drops out, the camera zooms back to where it was, onto the ship.
- **Where you order it:** right-click (or hold) a belt's (or the Library's) map marker → **Warp to name / Align to name**; or right-click (hold) space → **Belts ›**, a list of the belts: right-click (hold) one for its own menu, **Warp to / Align to** (owner: a list, not a third layer of submenus; a plain click on a name opens it too). That menu opens beside the name and the menus before it stay open until you pick something or move to another item in them. Under the Fleet window (below).

## Objects in space (owner)

Asteroids and ships (anyone's, including your other pilots' ships) are objects. **Right-click (or hold) one** for its menu, for the selected pilot's ship:

- **Lock Target:** shown while it's within targeting range (edge to edge) and the ship has a target free; the lock completes after the hull's lock time. Not mid-warp, not the ship itself, never the same object twice. Once locked, the menu shows **Unlock Target** instead; a lock in progress shows neither (owner: a lock in progress can't be cancelled).
  - **Locks break** when the object leaves targeting range, is gone (a rock wasted away) or warps away. A ship that starts a warp drops all its locks.
  - Locked objects get **orange corner brackets** on the map (owner: orange = targeted), blinking while the lock comes on.
  - A ship you've locked is sent to you wherever it is, even outside your camera's view.
- **Align To:** fly straight at it at full speed without braking (it keeps tracking a moving ship). Ships stay solid, so this ends against it.
- **Move towards:** fly to its edge and stop there; a ship keeps being followed.
  - Both replace any move or align order (and a move or POI order replaces them). They end if the object is gone.
- **Info:** a window titled with its name: an asteroid's ore icon, rarity, ore left (m³), size and belt (only for a belt you have a ship in); a ship's hull icon, class, pilot and player.

## The HUD (owner)

Bottom centre, for the selected pilot's ship:

- **Locked targets** on top, in the order they were locked (priority, left to right): the object's icon in a ring (blinking and filling while it locks, solid orange when locked) and its edge-to-edge distance underneath.
  - **×** unlocks a locked target; a target still locking has no × (owner).
  - Right-click (hold) a target for its menu: **Unlock Target**, Align To, Move towards, Info.
  - Hovering it (touch: while the finger is down) shows its name and draws a **thin, faint grey line** from your ship to it on the map (owner).
- **Shield** and **Hull** bars with their numbers, and **Speed** (m/s, km/s from 10 km/s, which only a warp reaches). Hovering Speed shows **Max speed** (owner).
- **The hotbar:** the **Inventory** button on the left, then **12 module slots**, keyed **1–9, 0, -, =** (not while typing). **Empty slots are hidden unless a module is being dragged** (owner); with no modules in the game yet, only the Inventory button shows.
- **Inventory:** a window "Pilot's Prospector" for the selected pilot's ship: its cargo bar (used / 5,000 m³) and a grid of its items plus one empty cell. Nothing goes in it yet.

## The game screen

- **Canvas:** the space backdrop, the hexagon's edge and the ships. Your ships are drawn in their blue sprite, others in red, at true scale; once a ship would be under 10 px long it's drawn as its hull icon instead. While one of your ships is flying, a faint dashed line runs to its destination.
- **The selected pilot (owner):** one is always selected (remembered in `atamus.ui`); a click in space flies *their* ship. **Selecting a pilot never moves the camera** (owner: the player doesn't always need to centre on the pilot). **Tab** selects the next pilot, left to right as in the Fleet window, wrapping (not while typing), and (owner) centres the camera on their ship, zoomed out to show a whole POI (110 km tall).
- **Controls (owner: mobile parity):**
  - **single click / tap selects (owner: single clicks are for selecting things):** one of your ships selects its pilot; an asteroid gets grey corner brackets (owner: grey = selected, orange = targeted) and a label with its ore's name and its distance from the selected pilot's ship's edge to the rock's ("Cryonite - 1.2 km"); empty space clears that.
  - **double click / tap** empty space (two within 350 ms, 14 px): the selected pilot's ship flies there;
  - **drag**, or **WASD** (owner): pan the camera (it stops following);
  - selecting one of your ships never centres the camera (owner); the camera follows the selected pilot's ship from the start;
  - **right-click / hold:** on an asteroid or a ship (not the selected pilot's own), its object menu (Objects in space); on a belt's map marker, Warp to / Align to it; anywhere else, the space menu: **Center on ship** (follow the selected pilot's ship) and **Belts ›** (the list of belts; right-click or hold one for its Warp to / Align to menu). Menus sit centred above the press (below it near the top; to the right of it near the left edge, to the left near the right edge); submenus open beside their row on hover or tap;
  - **wheel / pinch:** zoom, from **3.25 km across the screen** (owner: the Prospector about 1/25 of the screen's width) out to the whole hexagon. The wheel zooms toward the pointer, or about the followed ship.
  - The browser's own right-click menu never opens anywhere in the game (owner).
- **Space backdrop (owner):** no nebula image in the game. It's built from these layers, redrawn every frame:
  - a dark radial gradient;
  - two layers of soft noise drifting slowly in different directions;
  - three layers of parallax stars (the nearer the layer, the more it moves as you pan), each star slowly dimming and brightening. They're crisp 1–2 device-pixel points (owner: no big blurry dots);
  - a very thin world grid whose spacing steps (1, 2, 5, 10… km) so lines stay at least 70 px apart, with every 5th line slightly brighter.
- **Left panel:** **Player**, **Pilot**, **Chat** and **Fleet** buttons. A button's name shows only on hover, or while holding on touch.
- **Fleet window (owner: how you switch pilots):** a bar with no title, dragged by its background, exactly as big as its cards, open the first time you play. One card per pilot: their **portrait on the left**; on the right their **ship** (hull icon) with its **shield (blue) and hull (red) bars**, and the **pilot's name beneath**. The selected pilot's card has an orange outline. Click a card to select that pilot (the camera stays); double-click / double-tap it to also follow their ship.
  - **Align / Warp (owner):** under the cards, while the selected pilot's ship has a destination POI: **Align** (lit while aligning) and **Warp** (lit once ordered; shown only while that POI still shows on the map and the ship isn't already in it).
- **Chat (owner): Local and Corp** tabs. You speak as your **account's character**: each line shows its portrait, then your username and the message (240 characters at most, whitespace squashed). Local reaches everyone in the Expanse; everyone is in Deep Core Industries for now, so Corp reaches everyone too. An unread tab's label glows, and so does the Chat button while the window is closed. There's no history: you see what's said while you're online. Server notices show in Local.
  - **A name in chat (owner):** right-click (or hold) it for **Info**, **DM** and **Report** (just Info on your own).
  - **Info:** their Player Sheet in its own window: portrait and name, Day Born, Pilots, Total Endorsement Level, Corp (no credits), with **DM** and **Report** buttons at the bottom (not on your own).
  - **DM:** opens a chat tab with their name (× closes it); messages go to them only, and theirs to you open a tab for them. Messaging someone offline says "Name is not online." in that tab.
  - **Report:** a window "Report Name": what it's about (Harassment, Spam, Cheating, Offensive name, Other), what happened (up to 1,000 characters), Cancel / Send report. Reports are stored in the `reports` table (reporter, player, category, text, the chat line, status "open") for admin tools later; at most 10 an hour per account, never yourself.
- **Windows:** dragged by the title bar (touch-friendly), resizable (owner: a grip knob in the bottom-right corner, two thin blue-tinted bars, faint until hovered, 18 px, 30 px on touch screens, besides the edges), always kept on screen (fit to phone width); resizing never squeezes a window narrower than its content. **Tab stacking:** drop a window's title onto another window to group them; drag a tab out to split it again. Layout, groups and which windows are open are remembered in localStorage `atamus.ui`.
- **Player Sheet (owner):** titled "Player Sheet". A row with your character's small portrait and your username, then the stats: Day Born, Credits, Pilots, Total Endorsement Level, Corp. It can't be made smaller than its name row plus three stat rows, or narrower than its widest row; below full size only the stats scroll, not the window.
- **Pilot Sheet (owner):** titled "Pilot Sheet". Every pilot side by side (small portraits, room for 5), each with their name beneath; click one to select that pilot (and so their ship; the camera stays put). Below, the selected pilot's two tabs, centred: Licenses (the trainer, empty for now) and Training Queue.
- **Persistence across reloads:** the camera (sessionStorage `atamus.view`) and the open windows.
- **Mobile:** phones play in landscape (owner): on a phone (touch, shorter side < 600 px; not tablets), the first tap goes fullscreen and locks landscape. On phones, game.html sets the viewport scale to the shorter side ÷ 540 (minimum 0.6), so the whole UI is about 30% smaller; it's recomputed when the phone rotates. Text selection and the long-press callout are disabled.

## Accounts, pilots and sessions

- **Wipes:** one-time resets run at server start, once each (`WIPES` in db.js, recorded in the `meta` table). They keep accounts but delete every pilot and system and zero credits. "2026-10-09 quick-training reset" was the first **(owner)**. "2026-10-09 the Expanse" was a world-only wipe: ships, hangars, cans and belts went; pilots, licenses and credits stayed. **"2026-10-10 back to basics" (owner) was a full wipe:** every pilot, ship, item, base and credit went; accounts stayed, so everyone names a new pilot on the website. **"2026-10-10 pilot portraits" (owner: "reset everyone's pilots") was a pilots wipe:** every pilot and their ships went; accounts, characters and credits stayed.

- **Website (owner):** styled like the game's panels and buttons, over a nebula backdrop. The game itself no longer uses the nebula.
  - **Front page** (`index.html`): a header with the logo and Log in on the right; a description card ("The Expanse") with **Play now**, which goes to account creation; and an **Updates** card.
  - **Updates (owner): one entry per day**, newest first: the date, then a bullet per **new feature** that day (owner: never minor changes or fixes). Bullets say what was added or reworked, never how a system works (no timers, thresholds or rules), e.g. "Added wormholes to travel between solar systems", "Reworked wormholes". Add to today's `<article class="update">` in index.html, or start a new one. Entries before the 2026-10-10 reset were removed (owner).
  - Signed-in visitors skip the front page and go straight to play.html: "Welcome back, name" (or "Welcome" before the first pilot exists), with Enter System and Log out.
  - Pages: `login.html`, `signup.html`, `recover.html` and `play.html`. An expired session returns to login.html.
- **Character, then first pilot (owner):** both are made on the website (play.html), not in the game, in this order:
  1. **Your character:** the account's own portrait, which is who you'll be in chat (one person, not each of your pilots). Its name is your username.
  2. **Your first pilot:** a portrait plus a pilot name.
  - Then Enter System. The card widens for these steps; on narrow screens the portrait sits above the controls.
- **Portraits (owner, the scifi portrait builder art):** 32×32 pixel art in `website/assets/portraits/`, stacked background → outfit → head → hair (owner) and drawn crisp at any size (`website/portrait.js`).
  - The creator: a big preview, **Male / Female**, a ‹ › stepper each for Skin (5), Hair, Hair color (10), Outfit (5 styles), Outfit color (10) and Background (25), and Randomize. A new creator starts on a random look.
  - **Male / female** picks which hairstyles are offered (the art has no other differences): male buzz, short, quiff, spiky, mohawk, shaggy, curly; female long, bob, bun, curly, shaggy, short, mohawk. Switching keeps the hair if the other list has it.
  - The server keeps the part lists (`portraits.js`, served at `/game/portraits`) and refuses any pick not on them; it stores only the seven fields. The account's is `users.portrait` (`POST /game/character`), a pilot's is in its data (sent with `/game/pilot/create`; a pilot made without one gets a random portrait).
  - In the game, the Player Sheet shows your character's portrait and the Pilot window your pilot's (96 px, above their rows).
- **Pilots (owner):** up to 3 per account (`MAX_PILOTS`), with no duplicate names.
  - The first pilot is free. Each extra pilot costs **1,000,000 cr** (`PILOT_PRICE`), taken from the account's credits in the database (there's no way to earn credits right now).
  - Creation runs in a locked transaction, so parallel requests can't get past the cap or skip the charge.
- **One session per account (owner).** Opening the game in a new tab or device ends the old session:
  - the old connection closes with code 4002;
  - the old tab shows "Playing on another tab or device", then goes to play.html;
  - the server ignores anything the replaced session sends.
- **Session expired:** a socket closing with code 4001 sends the client to login.html.
- **Credits** live in `users.credits` and show in gold on the Player Sheet.

## Licenses (skills)

- **The trainer is empty (owner, 2026-10-10):** the license catalog has no licenses and new pilots start with none. Queuing anything is refused. The full catalog (ships, mining, automation, power…) is in `reference/2026-10-10-pre-reset/server/src/licenses.js`.
- **Training** still works the same way once licenses exist: per pilot, through a queue you can add to, remove from, reorder, pause and cancel, showing its total time left. Categories without licenses are hidden.

## Live updates (owner)

- Every push to `main` shows **every** player a 30 s "Update incoming" panel near the top of the screen. The number bounces each second.
- At zero, players are logged out to `play.html?updating=1`. It waits for the new build, then shows Enter System. If you're signed out by then (or the server doesn't answer for a minute), it goes to the login page instead. Enter System always loads a fresh (cache-busted) game page.
- Players who join mid-countdown see the time that's left.
- The server only starts a countdown if `main` is really ahead of what's live, once per commit. If it can't read GitHub, it counts down anyway.

## Server hardening

- Malformed or hostile messages are ignored and logged, never fatal. Every command field is checked: coordinates must be finite numbers, the ship must be the sender's.
- Rejected promises are logged.
- Each connection is limited to about 40 commands a second, with a 16 KB message limit.
- Autosave runs every 10 s but skips the database write when nothing changed. Offline players get no snapshots.
- Ship collisions are checked through a 1 km grid, so they stay cheap with many ships.

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
- The round stargate ring and its effects (blinking lights, motes, swirl when connected). Replaced by the bar design.
- Anyone looting a fresh jettison can. Cans are owner-only for 30 minutes now.
- Kicking idle online players out of instances, and matchmaking with friends (instances are random for now).
- **Replaced by the Expanse (docs/DESIGN.md phase 1):** personal home systems; fuel stargates linking players' systems and the pirate hub; asteroid beacons, acceleration-gate jumps and asteroid instances (they'll return as the "small belt" instance type behind acceleration gates); scattered home rocks; offline mining and systems staying awake while offline.
- **Shelved by "back to basics" (owner, 2026-10-10), not rejected:** everything listed under "Back to basics" above. It's kept in `reference/2026-10-10-pre-reset/` to bring back when the owner asks.
