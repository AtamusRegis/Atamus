# Atamus: working notes for Claude

Atamus is a browser-based multiplayer game. Claude writes all the code and runs every deploy.

**Before you change anything:**

1. Read `docs/FEATURES.md`. It describes how the game behaves today: every implemented rule and decision, plus things the owner rejected.
2. Skim the top of `docs/CHANGELOG.md` to see what changed recently.
3. `docs/DESIGN.md` holds the agreed direction (short right now: the 3D rebuild has just begun).
4. **The 3D rebuild (owner, 2026-10-12):** the 2D game (the Expanse, ships, modules, combat, the ETA, market, pilots, licenses, the whole old client and world) was wiped from `main` and preserved on the **`legacy-2d` branch** (tip `e56e61d`); older snapshots are in `reference/`. Bring pieces back only when the owner asks. The live game is one shared 3D world: a sphere per account on a gridded plane inside a 126 km hexagon. **Old database data stays untouched for reference.**

**In the same commit as any change to behavior:**

- Update `docs/FEATURES.md`. Add new rules, edit changed ones, and move anything removed to "Rejected / removed".
- Add a dated entry to `docs/CHANGELOG.md`.

These docs are the project's memory between sessions; DESIGN.md is the plan, FEATURES.md is what's live. If they disagree with the code, the code wins: fix the doc.

## Owner's standing rules

- **No unrequested UI.** Don't add UI, panels or UX unless the owner asks for it.
- **No helper or hint text**, anywhere. Tooltips show names only.
- **Mobile parity.** Every mouse action needs a touch equivalent: hold = right-click, drag = drag. **Exception (owner, 2026-10-13): Atamus 3D is a PC game; phones are only for testing a second account, so aiming has no touch version** (touch gets a movement joystick and camera drag).
- **US spelling.** Separately, the internal license key `exumers` is a misspelling saved in old player data: leave it as it is.
- **PTR suspended for now (owner, 2026-10-12): push straight to live to move fast.** Still run `scripts/check.sh` before every push. Batch changes so players aren't kicked repeatedly; a live push kicks everyone after a 30 s countdown. (`scripts/ptr.sh` still runs the server + site locally when a quick look is worth it.)
- **Front-page updates.** When a new feature ships (owner: never minor changes or fixes), add a bullet to that day's entry in the Updates list in `website/index.html` (one entry per day, newest first). Say what was added or changed, never how it works: no timers, thresholds, counts or rules.
- **Read the real game files.** Don't guess at behavior. Read the code, or ask when it's a design decision.

## Layout

```
packages/server/src/
  index.js        Express + ws bootstrap, /healthz {build}; in the PTR it also serves website/
  build.js        SERVER_BUILD, website build polling, update countdown (announceUpdate)
  auth.js         signup / login / logout / password recovery (cookie sessions)
  sessions.js     getSessionUser (always returns the "PTR" user in PTR mode)
  db.js           schema; the old game's tables stay for reference (WIPES is empty now)
  security.js, geo.js, suspicion.js, textsafe.js, names.js, namefilter.js   account security and the name/word filter
  admin.js, personas.js, staff.js, appeals.js, relations.js, relappeals.js, tickets.js, language.js, watch.js,
  pilots.js, licenses.js, portraits.js, gamehttp.js
                  the 2D era's accounts/moderation APIs: still mounted and running, but the game hooks are
                  disconnected and nothing in the 3D client uses them yet. Don't build on them without asking.
  game/
    net.js        the 3D game socket at /ws: cookie auth, one session per account (4002), side pick, move /
                  chat in; 20 Hz sim, 15 Hz per-player snapshots (only ships inside that player's load circle)
    world3d.js    the world: 126 km hexagon, momentum ships (accel / brake / turn-scaled thrust), capacitor,
                  LOAD_R (5,000 m load circle, snapshotFor), positions saved. Weapons/combat were removed
                  (owner, 2026-10-13); the last version is commit 956cb73
website/          GitHub Pages site (atamus.io) and the game client
  game.html       the 3D game page (canvas, status + countdown overlays, __BUILD__ marker)
  game3d.js       Three.js client: grid plane, hexagon band, spheres (own blue, others red, rolling),
                  orbit camera (75°, middle-mouse / touch-drag yaw, wheel / pinch zoom), WASD relative to it,
                  own-sphere prediction + snapshot interpolation, countdown and reconnect handling
  vendor/         three.module.js + three.core.js (vendored; CSP allows only our own scripts)
  index/login/signup/recover/eula/play.html (+ their .js), api.js, style.css, front-updates.js
                  the website, as before; play.html goes straight to Enter System (no pilots)
reference/        old snapshots, for reference only (never deployed); the full 2D game is the legacy-2d branch
scripts/
  check.sh        syntax-check every JS file (run before every push)
  ptr.sh          start|stop|reset|status for a local copy (local Postgres :5433, server :8090 serving website/)
  ptr-run.mjs     run a JS snippet in headless Chromium against the local copy (window.Atamus)
  deploy.sh       server-side redeploy (the forced command for the deploy key)
  setup.sh        server provisioning
.github/workflows deploy-server.yml (packages/server/**), deploy-website.yml (website/**)
```

Changes under `docs/`, `CLAUDE.md`, `reference/` and `scripts/` trigger no deploy.

## Patch workflow

1. Make the change.
2. Run `scripts/check.sh`.
3. If you touched client files, bump the cache-busters: the `?v=` stamps on the scripts in `website/game.html` and `website/play.html`,.
4. Update `docs/FEATURES.md` and `docs/CHANGELOG.md`.
5. Commit, ending the message with the attribution lines. Push to `main` and the workflows deploy:
   - each one first calls `/game/update-countdown`, which starts the 30 s countdown in every client;
   - it then sleeps 30 s and switches the live build;
   - clients are sent to `play.html?updating=1`, which waits for the new build.
6. A quick local look when it's worth it: `scripts/ptr.sh start`, then open http://localhost:8090/game.html (PTR mode is always signed in as the PTR user).

## Code conventions

- **Server-authoritative.** The client only sends commands (a movement direction). Validate every command field on the server as hostile: finite numbers, clamped ranges, the player can only act as themselves.
- **Syntax check before every commit.** `node --check` (via `scripts/check.sh`) runs before every commit. A syntax error once reached live.
