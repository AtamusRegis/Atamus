# Atamus: how the game works today

This is a living spec of the game. Read it before every patch, and update it in the same commit as any change to behavior. Rules marked **(owner)** were decided explicitly by the owner, so keep them unless the owner says otherwise.

## Back to basics (owner, 2026-10-10)

The owner took the game back to scratch to focus on the Prospector's gameplay. **The game is the Player, Pilot, Chat and Fleet windows, the world boundary and a Prospector per pilot.** Gone from the live game: stations, stargates, planets, the sun, asteroids and belts, mining, modules, fitting, inventories, the market, whispers, the HUD, settings and music, bases, the tutorial shard and every license in the trainer. (The Fleet window and Local / Corp chat came back the same day, owner: "I didn't tell you to get rid of the Fleet window".)

- **Kept for reference:** everything that was live just before is in `reference/2026-10-10-pre-reset/` (client, server, tests, and the full FEATURES.md that described it) and at commit `0a745ec` (the last one before the reset). The art is still in `website/assets/`. Bring things back from there when the owner asks for them.
- docs/DESIGN.md is still the long-term plan.

## The world (owner)

- **The Expanse's hexagon, empty:** 1 AU across at the map scale the game always used (1 AU = 20,000 km), so **20,000 km across, flat to flat**, with flat top and bottom edges. The origin is its centre. Its edge is drawn as a thin line.
- **The edge stops ships:** a move order past it is pulled just inside, and a ship that reaches it stops dead there.
- **One Prospector per pilot:** each of your pilots has their own (id `<account>:ship:<pilot>`), which first appears within 5 km of the centre. A new pilot gets one (the server rereads your pilots when the client says so, and every minute); a pilot that's gone takes theirs along. It's the only ship (`SHIP_TYPES.chisel` in constants.js): 128 m long, top speed 335 m/s, acceleration 0.15 km/s², hull 200, shield 225 (shown in the Fleet window; nothing damages ships yet). No modules or holds.
- **Flying:** the ship accelerates toward its target as fast as it can while still able to brake in time, faces the way it's moving, and stops on the point. At top speed, crossing the hexagon takes about 16½ hours.
- **Ships don't overlap:** overlapping ships push apart (the lighter one more) and lose the velocity pushing them together.
- **Logging off:** a closed connection keeps your ships in space for 20 s (a reload), then they leave the world. Logging back in puts each where it was (pulled inside the edge if it somehow wasn't). Positions are saved every 10 s and on leaving.
- **Other players:** your own ships are always sent to you (with their pilot, hull and shield). Other ships are sent while they're inside your camera's view (the client reports its view; a view wider than 40,000 km is capped). Other players' destinations aren't sent.
- The server simulates at 20 Hz and sends snapshots at 15 Hz; the client draws ships 110 ms in the past, interpolated between the two snapshots around that moment.

## The game screen

- **Canvas:** the space backdrop, the hexagon's edge and the ships. Your ships are drawn in their blue sprite, others in red, at true scale; once a ship would be under 10 px long it's drawn as its hull icon instead. While one of your ships is flying, a faint dashed line runs to its destination.
- **The selected pilot (owner):** one is always selected (remembered in `atamus.ui`); a click in space flies *their* ship. **Selecting a pilot never moves the camera** (owner: the player doesn't always need to centre on the pilot). **Tab** selects the next pilot, left to right as in the Fleet window, wrapping (not while typing).
- **Controls (owner: mobile parity):**
  - **click / tap** empty space: the selected pilot's ship flies there;
  - **drag**, or **WASD** (owner): pan the camera (it stops following);
  - **click / tap one of your ships:** select its pilot and follow that ship (the camera follows the selected pilot's ship from the start);
  - **wheel / pinch:** zoom, from **3.25 km across the screen** (owner: the Prospector about 1/25 of the screen's width) out to the whole hexagon. The wheel zooms toward the pointer, or about the followed ship.
  - **Right-click** does nothing yet, and never opens the browser's menu anywhere in the game (owner).
- **Space backdrop (owner):** no nebula image in the game. It's built from these layers, redrawn every frame:
  - a dark radial gradient;
  - two layers of soft noise drifting slowly in different directions;
  - three layers of parallax stars (the nearer the layer, the more it moves as you pan), each star slowly dimming and brightening. They're crisp 1–2 device-pixel points (owner: no big blurry dots);
  - a very thin world grid whose spacing steps (1, 2, 5, 10… km) so lines stay at least 70 px apart, with every 5th line slightly brighter.
- **Left panel:** **Player**, **Pilot**, **Chat** and **Fleet** buttons. A button's name shows only on hover, or while holding on touch.
- **Fleet window (owner: how you switch pilots):** a bar with no title, dragged by its background, exactly as big as its cards, open the first time you play. One card per pilot: their **portrait on the left**; on the right their **ship** (hull icon) with its **shield (blue) and hull (red) bars**, and the **pilot's name beneath**. The selected pilot's card has an orange outline. Click a card to select that pilot (the camera stays); double-click / double-tap it to also follow their ship.
- **Chat (owner): Local and Corp** tabs. You speak as your **account's character**: each line shows its portrait, then your username and the message (240 characters at most, whitespace squashed). Local reaches everyone in the Expanse; everyone is in Deep Core Industries for now, so Corp reaches everyone too. An unread tab's label glows, and so does the Chat button while the window is closed. There's no history: you see what's said while you're online. Server notices show in Local.
- **Windows:** dragged by the title bar (touch-friendly), resizable, always kept on screen (fit to phone width); resizing never squeezes a window narrower than its content. **Tab stacking:** drop a window's title onto another window to group them; drag a tab out to split it again. Layout, groups and which windows are open are remembered in localStorage `atamus.ui`.
- **Player Sheet:** your username in the title; your character's portrait; Day Born, Credits, Pilots, Total Endorsement Level, Corp.
- **Pilot window:** the selected pilot (name in the title), their portrait, and two tabs: Licenses (the trainer, empty for now) and Training Queue.
- **Persistence across reloads:** the camera (sessionStorage `atamus.view`) and the open windows.
- **Mobile:** phones play in landscape (owner): on a phone (touch, shorter side < 600 px; not tablets), the first tap goes fullscreen and locks landscape. On phones, game.html sets the viewport scale to the shorter side ÷ 540 (minimum 0.6), so the whole UI is about 30% smaller; it's recomputed when the phone rotates. Text selection and the long-press callout are disabled.

## Accounts, pilots and sessions

- **Wipes:** one-time resets run at server start, once each (`WIPES` in db.js, recorded in the `meta` table). They keep accounts but delete every pilot and system and zero credits. "2026-10-09 quick-training reset" was the first **(owner)**. "2026-10-09 the Expanse" was a world-only wipe: ships, hangars, cans and belts went; pilots, licenses and credits stayed. **"2026-10-10 back to basics" (owner) was a full wipe:** every pilot, ship, item, base and credit went; accounts stayed, so everyone names a new pilot on the website. **"2026-10-10 pilot portraits" (owner: "reset everyone's pilots") was a pilots wipe:** every pilot and their ships went; accounts, characters and credits stayed.

- **Website (owner):** styled like the game's panels and buttons, over a nebula backdrop. The game itself no longer uses the nebula.
  - **Front page** (`index.html`): a header with the logo and Log in on the right; a description card ("The Expanse") with **Play now**, which goes to account creation; and an **Updates** card.
  - **Updates** lists **major changes only**, never small fixes. Edit the `<article class="update">` list in index.html, newest first.
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
