# Atamus: working notes for Claude

Atamus is a browser-based multiplayer game. Claude writes all the code and runs every deploy.

**Before you change anything:**

1. Read `docs/FEATURES.md`. It describes how the game behaves today: every implemented rule and decision, plus things the owner rejected.
2. Skim the top of `docs/CHANGELOG.md` to see what changed recently.
3. `docs/DESIGN.md` holds the agreed direction; the design document itself is `docs/Atamus_Ring_Mining.html` ("Crack, Bank and Haul", draft 9).
4. **The mining redesign (owner, 2026-10-18):** the game was rebuilt from that document alone — a cooperative 2D gather-and-craft MMO like Palia, no PvP. Asteroids are hidden chunk masonry around a core; ore banks into the core and pays at the pop; it's physical cargo (holds, cans, party crates) until delivery; each role is its own ship (Miner, Scanner, Booster, Fueler, Hauler). Kept from before: Saturn, two rings, sectors, fog of war, movement, parties, chat, admin tools, the developer panel, live updates. **All old branches were deleted (owner: "delete all old branches, stop reading from them")** — older versions live only in git history and `reference/`. **Old database data stays untouched for reference.** Use the design document's look (`website/theme.css`) for the game and the website; the ship art artifact is linked from `docs/DESIGN.md`. Every number is in `rules.js`.

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
  auth.js         signup / login / logout / password recovery (cookie sessions)
  sessions.js     getSessionUser (always returns the "PTR" user in PTR mode)
  db.js           schema for the tables in use; every old game's tables stay in the database untouched, unused
  ptr.js, config.js, hash.js, ratelimit.js   the local test copy, settings, password hashing, rate limits
  security.js     failed-login backoff, device ids, account unlock (no login records)
  names.js, namefilter.js, textsafe.js   the name filter and banned names (sign-up), text cleaning
  admin.js        the small admin panel's API (players: kick / ban / mute; ban appeals) and the game hooks (gameHook)
  appeals.js      ban appeals (written from the login page, answered in the admin panel)
  gamehttp.js     the deploy workflows' calls (build-check, update-countdown, update-status)
  game/
    net.js        the game socket at /ws: cookie auth, one session per account (4002), one account per device (4003),
                  admin hooks (kick 4005 / ban 4006 pays out the tags / mute), input / act / st / party / chat (World,
                  Zone, Party, Whisper) in; 20 Hz sim, 15 Hz ship snapshots, 5 Hz rock summaries + per-socket chunk
                  layouts by version + cans / me / soc diffs, 1 Hz distress + party mates
    rules.js      every fixed number: world, ships, flying, chunks, rock sizes, the core, ores, pieces, cans, crates,
                  downtime, fuel, economy, services, limits
    tuning.js     the developer panel's server side: the editable groups of rules.js, checked, kept in ring_tuning
                  (_v: 5), reset; which changes regrow the asteroids
    world.js      the world: seeded rock slots, chunk generation (shells, seams, densities, the bedrock-free line),
                  laser / scan ray-walks, burst cascades, core banking and the pop, holds / cans / crates with tags,
                  delivery and even party splits (offline paid in the DB), the daily downtime, services (/rate, hire),
                  towing, fuel / crawl / distress, fog-of-war vision gating, parties, saving
                  (ring_players, ring_cans, ring_meta)
website/          GitHub Pages site (atamus.io) and the game client
  game.html       the game page (canvas, HUD, station panel, chat, minimap, overlays, __BUILD__ marker)
  game.js         the 2D canvas client: input (WASD + mouse; twin sticks on touch), my ship predicted, others
                  interpolated, camera and zoom, rings / Saturn / station, chunk rocks (unscanned solid, scanned
                  densities and ores, bedrock hatched, crack stages, the swelling core), beams, cans and crates, HUD
                  (hold pieces 25/5/1), station panel (ships + fuel), party list, minimap, chat, menus, prompts,
                  the developer panel, countdown and reconnect handling
  shipart.js      the art from the ship sheet: shipLayout / drawShip (a section per role, animated), drawStation,
                  drawSaturn
  theme.css       the design document's fonts and colors (fonts/ self-hosted), used by the game and style.css
  admin.css       the admin and disciplinary panels' styles
  adminpanel.js   the Admin button and panel (staff accounts only)
  index/login/signup/recover/eula/play.html (+ their .js), api.js, style.css, front-updates.js
                  the website, as before; play.html goes straight to Enter System
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
