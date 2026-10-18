# Atamus: working notes for Claude

Atamus is a browser-based multiplayer game. Claude writes all the code and runs every deploy.

**Before you change anything:**

1. Read `docs/FEATURES.md`. It describes how the game behaves today: every implemented rule and decision, plus things the owner rejected.
2. Skim the top of `docs/CHANGELOG.md` to see what changed recently.
3. `docs/DESIGN.md` holds the agreed direction; the design document itself is `docs/Atamus_Ring_Mining.html` ("Crack, Bank and Haul", draft 9).
4. **The mining redesign (owner, 2026-10-18):** the game was rebuilt from that document alone — a cooperative 2D gather-and-craft MMO like Palia, no PvP. Asteroids are hidden chunk masonry around a core; ore banks into the core and pays at the pop. **All old branches were deleted (owner: "delete all old branches, stop reading from them")** — older versions live only in git history and `reference/`. **Old database data stays untouched for reference.** Use the design document's look (`website/theme.css`) for the game and the website; the ship art artifact is linked from `docs/DESIGN.md`. Every number is in `rules.js`.
6. **Back to basics (owner, 2026-10-18, latest): "lets start from the bottom."** Cores surrounded by visible masonry; the Miner cuts through; ore chunks bank their bits into the core; denser takes longer; breaking the core piñatas every bit out as free drops. **Miner only.** Heat, beam stages, the charge shot, bursts, bedrock, scanning and the other ships are gone (FEATURES.md, Rejected / removed). Build back up from here only as the owner asks.
5. **The sandbox build (owner, 2026-10-18, same day, later): "make the sandbox the atamus live server."** The owner iterated a single-player sandbox artifact and it replaced the live game: **no login (create a name and play), no chat, no parties, no fuel, no money, no in-game admin or developer UI.** Four ships — Miner (charge shot), Scanner (drill, tow), Booster (one-ship boost beam + coolant spray, no laser), Hauler (refine beam) — beam heat stages (blue/yellow/red), free-for-all ore drops instead of cans, three rings with thicker bedrock-heavier rocks deeper, per-ship optional tutorials. FEATURES.md has the full rules.

**In the same commit as any change to behavior:**

- Update `docs/FEATURES.md`. Add new rules, edit changed ones, and move anything removed to "Rejected / removed".
- Add a dated entry to `docs/CHANGELOG.md`.

These docs are the project's memory between sessions; DESIGN.md is the plan, FEATURES.md is what's live. If they disagree with the code, the code wins: fix the doc.

## Owner's standing rules

- **No unrequested UI.** Don't add UI, panels or UX unless the owner asks for it.
- **No helper or hint text**, anywhere. Tooltips show names only. (The developer panel's hover descriptions are the owner-requested exception.)
- **Mobile parity.** The design document calls for twin-stick controls on touch screens: the left half flies, the right half aims and fires. Hold = right-click (menus), tap = pick up, a second finger on a busy half pinches the zoom; the layout compacts for landscape phones and chat folds behind a bubble.
- **US spelling.** Separately, the internal license key `exumers` is a misspelling saved in old player data: leave it as it is.
- **PTR suspended for now (owner, 2026-10-12): push straight to live to move fast.** Still run `scripts/check.sh` before every push. Batch changes so players aren't kicked repeatedly; a live push kicks everyone after a short countdown. (`scripts/ptr.sh` still runs the server + site locally when a quick look is worth it.)
- **Front-page updates.** When a new feature ships (owner: never minor changes or fixes), add a bullet to that day's entry in the Updates list in `website/index.html` (one entry per day, newest first). Say what was added or changed, never how it works: no timers, thresholds, counts or rules.
- **Read the real game files.** Don't guess at behavior. Read the code, or ask when it's a design decision.

## Layout

```
packages/server/src/
  index.js        Express + ws bootstrap, /healthz {build}; in the PTR it also serves website/
  build.js        SERVER_BUILD, website build polling, update countdown (announceUpdate)
  auth.js         signup / login / logout / password recovery (staff accounts only now; unlinked pages)
  guest.js        (owner, 2026-10-18) no login: POST /auth/guest claims a pilot name on a token cookie (guests table)
  sessions.js     getSessionUser (always returns the "PTR" user in PTR mode)
  db.js           schema for the tables in use; every old game's tables stay in the database untouched, unused
  ptr.js, config.js, hash.js, ratelimit.js   the local test copy, settings, password hashing, rate limits
  security.js     failed-login backoff, device ids, account unlock (no login records)
  names.js, namefilter.js, textsafe.js   the name filter and banned names (sign-up), text cleaning
  admin.js        the small admin panel's API (players: kick / ban / mute; ban appeals) and the game hooks (gameHook)
  appeals.js      ban appeals (written from the login page, answered in the admin panel)
  gamehttp.js     the deploy workflows' calls (build-check, update-countdown, update-status)
  game/
    net.js        the game socket at /ws: guest or session auth, one session per pilot (4002), one pilot per device
                  (4003), admin hooks kept server-side (kick 4005 / ban 4006 scatters the hold), input / act / st /
                  tune in; 20 Hz sim, 15 Hz ship snapshots (beam temp + charge in the rows), 5 Hz rock summaries +
                  per-socket chunk layouts by version + drops / me diffs
    rules.js      every fixed number: world, the four ships, flying, the chunk-sheet LAYOUT (layer arcs), chunks (3 densities, 1-3 ore bits), ROCK_SIZE(layers) + per-ring layer bands,
                  the core, heat (+ chunkBreak), the beam stages, the charge shot, ores, drops, econ
    tuning.js     live tuning server-side (no game UI): the editable groups of rules.js, checked, kept in ring_tuning
                  (_v: 6), reset; which changes regrow the asteroids
    world.js      the world: seeded rock slots, chunk generation (the chunk sheet: rotated layers of slots, width / length halves, densities, ore bits; older notes: the bedrock-free
                  line), laser ray-walks with beam temp stages and hot-chunk fast-cut, the Miner's charge blast, burst
                  cascades, core banking / weakening / the pop, the Booster's one-ship boost beam and coolant, the
                  Hauler's refine, free-for-all ore drops (flyover pickup), delivery into own storage, towing, marks,
                  fog-of-war vision gating, saving (ring_players, ring_drops, ring_meta)
website/          GitHub Pages site (atamus.io) and the game client
  game.html       the game page (canvas, HUD with the mode switch and tutorial chip, station panel, minimap,
                  overlays, __BUILD__ marker; no chat / admin / dev UI)
  game.js         the 2D canvas client: input (WASD + mouse; twin sticks on touch; F flips the mode switch), my ship
                  predicted, others interpolated, camera and zoom, rings / Saturn / station, chunk rocks (jittered
                  slabs, near-black bedrock, the blue swelling core with damage cracks), the staged beam colors,
                  charge / lance / coolant spray / boost pluses / refine beams, ore drops, HUD (one square per ore),
                  station panel (storage + the four ships), minimap, menus, per-ship tutorials, countdown and
                  reconnect handling
  shipart.js      the art from the ship sheet: shipLayout / drawShip (a section per role, animated), drawStation,
                  drawSaturn
  theme.css       the design document's fonts and colors (fonts/ self-hosted), used by the game and style.css
  admin.css, adminpanel.js   the old in-game admin UI (no longer loaded by the game page; kept on disk)
  index/login/signup/recover/eula/play.html (+ their .js), api.js, style.css, front-updates.js
                  the website; play.html is the name-and-play door (and the update-wait page); login/signup are
                  unlinked (staff by URL)
reference/        old snapshots, for reference only (never deployed)
scripts/
  check.sh        syntax-check every JS file (run before every push)
  ptr.sh          start|stop|reset|status for a local copy (local Postgres :5433, server :8090 serving website/)
  ptr-run.mjs     run a JS snippet in headless Chromium against the local copy (window.Atamus)
  deploy.sh       server-side redeploy (the forced command for the deploy key)
  setup.sh        server provisioning
.github/workflows deploy-server.yml (packages/server/**), deploy-website.yml (website/**)
docs/Atamus_Ring_Mining.html   the design document (draft 9), checked in
```

Changes under `docs/`, `CLAUDE.md`, `reference/` and `scripts/` trigger no deploy.

## Patch workflow

1. Make the change.
2. Run `scripts/check.sh`.
3. If you touched client files, bump the cache-busters: the `?v=` stamps on the scripts and stylesheet in the pages you changed (`website/game.html`, `website/play.html`, and the other pages for `style.css`).
4. Update `docs/FEATURES.md` and `docs/CHANGELOG.md`.
5. Commit, ending the message with the attribution lines. Push to `main` and the workflows deploy:
   - each one first calls `/game/update-countdown`, which starts the countdown in every client;
   - it then sleeps and switches the live build;
   - clients are sent to `play.html?updating=1`, which waits for the new build.
6. A quick local look when it's worth it: `scripts/ptr.sh start`, then open http://localhost:8090/game.html (PTR mode is always signed in as the PTR user; `?as=Name`, 3+ characters, plays as another account).

## Code conventions

- **Server-authoritative.** The client only sends commands (a movement direction). Validate every command field on the server as hostile: finite numbers, clamped ranges, the player can only act as themselves.
- **Syntax check before every commit.** `node --check` (via `scripts/check.sh`) runs before every commit. A syntax error once reached live.
