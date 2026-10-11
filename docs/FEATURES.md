# Atamus: how the game works today

This is a living spec of the game. Read it before every patch, and update it in the same commit as any change to behavior. Rules marked **(owner)** were decided explicitly by the owner, so keep them unless the owner says otherwise.

## Back to basics (owner, 2026-10-10)

The owner took the game back to scratch to focus on the Prospector's gameplay. **The only things in the game are the Player and Pilot pages, the world boundary and the Prospector.** Gone from the live game: stations, stargates, planets, the sun, asteroids and belts, mining, modules, fitting, inventories, the market, chat, the fleet bar, the HUD, settings and music, bases, the tutorial shard and every license in the trainer.

- **Kept for reference:** everything that was live just before is in `reference/2026-10-10-pre-reset/` (client, server, tests, and the full FEATURES.md that described it) and at commit `0a745ec` (the last one before the reset). The art is still in `website/assets/`. Bring things back from there when the owner asks for them.
- docs/DESIGN.md is still the long-term plan.

## The world (owner)

- **The Expanse's hexagon, empty:** 1 AU across at the map scale the game always used (1 AU = 20,000 km), so **20,000 km across, flat to flat**, with flat top and bottom edges. The origin is its centre. Its edge is drawn as a thin line.
- **The edge stops ships:** a move order past it is pulled just inside, and a ship that reaches it stops dead there.
- **One Prospector per player:** a new player's appears within 5 km of the centre. It's the only ship (`SHIP_TYPES.chisel` in constants.js): 128 m long, top speed 335 m/s, acceleration 0.15 km/s². It has no pilot, modules or holds.
- **Flying:** the ship accelerates toward its target as fast as it can while still able to brake in time, faces the way it's moving, and stops on the point. At top speed, crossing the hexagon takes about 16½ hours.
- **Ships don't overlap:** overlapping ships push apart (the lighter one more) and lose the velocity pushing them together.
- **Logging off:** a closed connection keeps the ship in space for 20 s (a reload), then it leaves the world. Logging back in puts it where it was (pulled inside the edge if it somehow wasn't). The ship's position is saved every 10 s and on leaving.
- **Other players:** your own ship is always sent to you. Other ships are sent while they're inside your camera's view (the client reports its view; a view wider than 40,000 km is capped). Other players' destinations aren't sent.
- The server simulates at 20 Hz and sends snapshots at 15 Hz; the client draws ships 110 ms in the past, interpolated between the two snapshots around that moment.

## The game screen

- **Canvas:** the space backdrop, the hexagon's edge and the ships. Your ship is drawn in its blue sprite, others in red, at true scale; once a ship would be under 10 px long it's drawn as its hull icon instead. While your ship is flying, a faint dashed line runs to its destination.
- **Controls (owner: mobile parity):**
  - **click / tap** empty space: fly there;
  - **drag:** pan the camera (it stops following your ship);
  - **click / tap your ship:** the camera follows it again (it follows from the start);
  - **wheel / pinch:** zoom, from 0.4 km across the screen out to the whole hexagon. The wheel zooms toward the pointer, or about your ship while following it.
- **Space backdrop (owner):** no nebula image in the game. It's built from these layers, redrawn every frame:
  - a dark radial gradient;
  - two layers of soft noise drifting slowly in different directions;
  - three layers of parallax stars (the nearer the layer, the more it moves as you pan), each star slowly dimming and brightening. They're crisp 1–2 device-pixel points (owner: no big blurry dots);
  - a very thin world grid whose spacing steps (1, 2, 5, 10… km) so lines stay at least 70 px apart, with every 5th line slightly brighter.
- **Left panel:** just the **Player** and **Pilot** buttons. A button's name shows only on hover, or while holding on touch.
- **Windows:** dragged by the title bar (touch-friendly), resizable, always kept on screen (fit to phone width); resizing never squeezes a window narrower than its content. **Tab stacking:** drop a window's title onto another window to group them; drag a tab out to split it again. Layout, groups and which windows are open are remembered in localStorage `atamus.ui`.
- **Player Sheet:** your username in the title; Day Born, Credits, Pilots, Total Endorsement Level, Corp.
- **Pilot window:** your first pilot (name in the title), with two tabs: Licenses (the trainer, empty for now) and Training Queue.
- **Persistence across reloads:** the camera (sessionStorage `atamus.view`) and the open windows.
- **Mobile:** phones play in landscape (owner): on a phone (touch, shorter side < 600 px; not tablets), the first tap goes fullscreen and locks landscape. On phones, game.html sets the viewport scale to the shorter side ÷ 540 (minimum 0.6), so the whole UI is about 30% smaller; it's recomputed when the phone rotates. Text selection and the long-press callout are disabled.

## Accounts, pilots and sessions

- **Wipes:** one-time resets run at server start, once each (`WIPES` in db.js, recorded in the `meta` table). They keep accounts but delete every pilot and system and zero credits. "2026-10-09 quick-training reset" was the first **(owner)**. "2026-10-09 the Expanse" was a world-only wipe: ships, hangars, cans and belts went; pilots, licenses and credits stayed. **"2026-10-10 back to basics" (owner) was a full wipe:** every pilot, ship, item, base and credit went; accounts stayed, so everyone names a new pilot on the website.

- **Website (owner):** styled like the game's panels and buttons, over a nebula backdrop. The game itself no longer uses the nebula.
  - **Front page** (`index.html`): a header with the logo and Log in on the right; a description card ("The Expanse") with **Play now**, which goes to account creation; and an **Updates** card.
  - **Updates** lists **major changes only**, never small fixes. Edit the `<article class="update">` list in index.html, newest first.
  - Signed-in visitors skip the front page and go straight to play.html: "Welcome back, name" (or "Welcome" before the first pilot exists), with Enter System and Log out.
  - Pages: `login.html`, `signup.html`, `recover.html` and `play.html`. An expired session returns to login.html.
- **First pilot:** named on the website (play.html), not in the game **(owner)**.
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
- At zero, players are logged out to `play.html?updating=1`. It waits for the new build, then shows Enter System. Enter System always loads a fresh (cache-busted) game page.
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
