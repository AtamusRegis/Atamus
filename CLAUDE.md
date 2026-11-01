# Atamus: working notes for Claude

Atamus is a browser-based single-player game. Claude writes all the code and runs every deploy.

**Before you change anything:**

1. Read `docs/FEATURES.md`. It describes how the game behaves today: every implemented rule and decision, plus things the owner rejected.
2. Skim the top of `docs/CHANGELOG.md` to see what changed recently.
3. **The redo (owner, 2026-10-31): Atamus is a single-player seaport management game** (first a spaceport, made a
   seaport the same evening), in the browser with no server: boats dock at two berths with containers in seven colors and three walled storage areas in the yard;
   you tell forklifts which container goes where (they need a way to reach both ends); trucks want a container matching
   their cab color. 2D top down on a 32 × 32 px tile grid (NPCs come later), placeholder art the owner will replace. **No multiplayer.** The old multiplayer ring-mining game, name-and-play and the Salvage
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
  game.html       the game page: just the canvas
  game.js         the whole game, single player: the tile map and its placeholder art (drawn once), berths and boats,
                  containers, orders and the access check (4-way BFS), forklifts, truck bays and trucks, camera
                  (pan / zoom / pinch), click-to-select / click-to-place; window.Atamus for tests
  index.html      the front page (Updates list), style.css + theme.css + front-updates.js for it
  play.html       forwards to game.html (old links)
  fonts/, assets/ self-hosted fonts and the logo
packages/server/src/
  index.js        Express bootstrap: /healthz {build} and the deploy workflows' /game routes; in the PTR it also
                  serves website/. There is no game socket anymore.
  build.js        SERVER_BUILD, website build polling, the update countdown the workflows call (announceUpdate)
  gamehttp.js     the deploy workflows' calls (build-check, update-countdown, update-status)
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

- **Single player, client only.** The game lives entirely in `website/game.js`; keep it working without the server.
- **Syntax check before every commit.** `node --check` (via `scripts/check.sh`) runs before every commit. A syntax error once reached live.
