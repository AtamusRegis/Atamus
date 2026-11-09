# Atamus: working notes for Claude

Atamus is a browser-based single-player game. Claude writes all the code and runs every deploy.

**Before you change anything:**

1. Read `docs/FEATURES.md`. It describes how the game behaves today: every implemented rule and decision, plus things the owner rejected.
2. Skim the top of `docs/CHANGELOG.md` to see what changed recently.
3. **A second game, Pet Delivery Co. (owner, 2026-11-08):** a co-op, phone-first 3D game on its own page
   (`website/pets.html` + `pets.js`, co-op in `packages/server/src/pets.js`, WebSocket /pets on play.atamus.io). Its
   rules live in `docs/PETS.md` (that game's FEATURES.md); its changes go in the same CHANGELOG. Everything below about
   the cargo game (including "no multiplayer") is about the cargo game only.
4. **The redo (owner, 2026-10-31), in space since 2026-11-05: Atamus is a single-player cargo station game** in the
   browser with no server, in 3D (Three.js, 1 unit = 1 m): one freighter (small, medium or large, on a timer) docks at a
   time and loader arms (placed along the spine, one loading spot each) unload its containers (circle, square or hex, 9
   colors) onto haulers; haulers, customer ships and export ships fly freely (climb to cruise height, fly over, settle
   at their hover point, steer clear of each other; no roads); you build with blueprints (drag, ✓ / ✗), storage one
   2.7 m unit at a time on a grid: storage slots (one shape each, stacks 3 high), cranes (reach 10.5 m, upright arms that fold
   when idle; they hand containers on to each other through shared slots), hauler spots (haulers drop imports, take exports) and truck spots
   (customers pick up, export ships drop off); also customer pad groups, dock stations (bought with each hauler; waiting
   haulers park there) and loader arms; freighter stacks are one shape each; manual haulers (you tap what they fetch)
   and auto ones (assigned a platform via one of its hauler spots); built things can be picked to move (whole platforms
   too) or remove (empty slots); a platform always keeps a crane, a hauler spot and a truck spot; loader arms take up to
   4 line spots; every customer wants one particular container and pays $60; start with 1
   hauler, 1 loader arm, 9 slots, a crane, a hauler spot, a truck spot, 4 pads, $500. Camera: perspective, tilt 45–90°,
   turn, zoom, smoothed; selection by 3D colliders. Basic shapes; the owner will make the models. **No multiplayer.** The old multiplayer ring-mining game, name-and-play and the Salvage
   prototype were removed; their code and docs are snapshotted in `reference/2026-10-31-pre-spaceport/`. **Old database
   data stays untouched for reference.** Build up from here only as the owner asks.

**In the same commit as any change to behavior:**

- Update `docs/FEATURES.md`. Add new rules, edit changed ones, and move anything removed to "Rejected / removed".
- Add a dated entry to `docs/CHANGELOG.md`.

These docs are the project's memory between sessions; FEATURES.md is what's live. If they disagree with the code, the code wins: fix the doc.

## Owner's standing rules

- **No unrequested UI.** Don't add UI, panels or UX unless the owner asks for it.
- **No helper or hint text**, anywhere. Tooltips show names only. (The developer panel's hover descriptions are the owner-requested exception.)
- **Mobile parity.** Everything works on touch screens too: tap selects and places, one finger pans the map, two fingers pinch the zoom.
- **US spelling.** Separately, the internal license key `exumers` is a misspelling saved in old player data: leave it as it is.
- **PTR suspended for now (owner, 2026-10-12): push straight to live to move fast.** Still run `scripts/check.sh` before every push. (`scripts/ptr.sh` still runs the server + site locally when a quick look is worth it.)
- **Front-page updates.** When a new feature ships (owner: never minor changes or fixes), add a bullet to that day's entry in the Updates list in `website/index.html` (one entry per day, newest first). Say what was added or changed, never how it works: no timers, thresholds, counts or rules.
- **Read the real game files.** Don't guess at behavior. Read the code, or ask when it's a design decision.

## Layout

```
website/          GitHub Pages site (atamus.io) and the game
  game.html       the game page: game.js + game3d.js
  game.js         the rules, single player: the freighter, loader arms and platform gantries (op lists: move / lift /
                  lower), haulers, customers and export ships (free flight, lines, bays, queues, claims), clicks;
                  window.Atamus for tests
  game3d.html     forwards to game.html (old links)
  game3d.js       the 3D view (Three.js, self-hosted in vendor/): the station in basic shapes, the camera (tilt 45–90°,
                  turn, zoom), 3D colliders for picking, the screen overlay
  index.html      the front page (Updates list), style.css + theme.css + front-updates.js for it
  play.html       forwards to game.html (old links)
  pets.html       Pet Delivery Co. (owner, 2026-11-08): the page and HUD; pets.js the whole client (town, riding,
                  parcels, eggs, training, items, co-op client); save in localStorage
  fonts/, assets/ self-hosted fonts and the logo
packages/server/src/
  index.js        Express bootstrap: /healthz {build} and the deploy workflows' /game routes; in the PTR it also
                  serves website/. Its one socket is Pet Delivery Co.'s (/pets, pets.js).
  build.js        SERVER_BUILD, website build polling, the update countdown the workflows call (announceUpdate)
  gamehttp.js     the deploy workflows' calls (build-check, update-countdown, update-status)
  pets.js         Pet Delivery Co. co-op: WebSocket /pets, rooms of 16, positions, contracts, delivery effects
  db.js           the schema migrations (old tables stay untouched, unused), config.js, hash.js
reference/        old snapshots, for reference only (never deployed); 2026-10-31-pre-spaceport/ is the last
                  multiplayer game and Salvage
scripts/
  check.sh        syntax-check every JS file (run before every push)
  ptr.sh          start|stop|reset|status for a local copy (local Postgres :5433, server :8090 serving website/)
  ptr-run.mjs     run a JS snippet in headless Chromium against the local copy
  deploy.sh       server-side redeploy (the forced command for the deploy key)
  setup.sh        server provisioning
.github/workflows deploy-server.yml (packages/server/**), deploy-website.yml (website/**)
```

Changes under `docs/`, `CLAUDE.md`, `reference/` and `scripts/` trigger no deploy.

## Patch workflow

1. Make the change.
2. Run `scripts/check.sh`.
3. If you touched client files, bump the cache-busters: the `?v=` stamps on the scripts and stylesheet in the pages you changed (`website/game.html`, `website/play.html`, and the other pages for `style.css`).
4. Update `docs/FEATURES.md` and `docs/CHANGELOG.md`.
5. Commit, ending the message with the attribution lines. Push to `main` and the workflows deploy (website to GitHub Pages, server over the deploy key). The game is client only, so a deploy just takes effect on the next page load.
6. A quick local look when it's worth it: `scripts/ptr.sh start`, then open http://localhost:8090/game.html.

## Code conventions

- **Single player, client only.** The game lives in `website/game.js` (rules) and `website/game3d.js` (view); keep it working without the server.
- **Syntax check before every commit.** `node --check` (via `scripts/check.sh`) runs before every commit. A syntax error once reached live.
