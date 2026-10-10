# Atamus: working notes for Claude

Atamus is a browser-based, EVE-inspired multiplayer mining semi-RTS. Claude writes all the code and runs every deploy.

**Before you change anything:**

1. Read `docs/FEATURES.md`. It describes how the game behaves today: every implemented rule and decision, plus things the owner rejected.
2. Skim the top of `docs/CHANGELOG.md` to see what changed recently.
3. Read `docs/DESIGN.md`: the agreed redesign (the Expanse and nomad space built from POIs, arcs, the base surface, and a world built for 1,000 concurrent players) that the next phases build toward.

**In the same commit as any change to behavior:**

- Update `docs/FEATURES.md`. Add new rules, edit changed ones, and move anything removed to "Rejected / removed".
- Add a dated entry to `docs/CHANGELOG.md`.

These docs are the project's memory between sessions; DESIGN.md is the plan, FEATURES.md is what's live. If they disagree with the code, the code wins: fix the doc.

## Owner's standing rules

- **No unrequested UI.** Don't add UI, panels or UX unless the owner asks for it.
- **No helper or hint text**, anywhere. Tooltips show names only.
- **Mobile parity.** Every mouse action needs a touch equivalent: hold = right-click, drag = drag.
- **US spelling.** Separately, the internal license key `exumers` is a misspelling that is saved in player data: leave it as it is.
- **Test in the PTR before pushing to live.** Batch changes so players aren't kicked repeatedly; a live push kicks everyone after a 30 s countdown.
- **Front-page updates.** When a major feature ships (not a fix), add an entry to the Updates list in `website/index.html`.
- **Read the real game files.** Don't guess at behavior. Read the code, or ask when it's a design decision.

## Layout

```
packages/server/src/
  index.js        Express + ws bootstrap, /healthz {build}; in the PTR it also serves website/
  build.js        SERVER_BUILD, website build polling, update countdown (announceUpdate)
  auth.js         signup / login / logout / password recovery (cookie sessions)
  sessions.js     getSessionUser (always returns the "PTR" user in PTR mode)
  gamehttp.js     /game/*: catalog, state, pilot/create, training queue, deploy hooks
  pilots.js       pilots + training queues (Postgres pilots table, JSONB data); MAX_PILOTS
  licenses.js     license catalog, levels, bonuses, hullEfficiency, unlocks
  ptr.js          PTR flag, PTR user, dev commands
  game/
    net.js        websocket server: one session per account, command dispatch, snapshots 15 Hz
    world.js      authoritative simulation (20 Hz): ships, mining, cans, inventories, crews
    constants.js  tunables + SHIP_TYPES / SHIP_CLASSES / SHIP_ROLES
    inventory.js  ITEMS, MARKET, slot inventories (move/split/take with input sanitizing)
    belts.js      ores, home rock fields, asteroid beacons, instance fields (+ decay)
    geometry.js   hex cells, STATION_POS, stargates
    persist.js    systems table (JSONB per player), instances table (shared asteroid instances)
    factions.js   faction roster (not wired into gameplay yet)
website/          GitHub Pages site (atamus.io) and the game client
  game.html/js    canvas renderer, input, socket, update/countdown handling
  ui.js           all windows/panels/HUD (window manager, tab groups, inventories, market, licenses)
  game.css        game UI styles
  play.html/js    website hub: pilot creation, "updating" wait page, Enter System
  api.js          fetch helper; API_BASE = play.atamus.io on atamus.io, else same origin
scripts/
  ptr.sh          start|stop|reset|status for the PTR (local Postgres :5433, server :8090)
  ptr-run.mjs     run a JS snippet in headless Chromium against the PTR (window.Atamus ready)
  check.sh        syntax-check every JS file (run before every push)
  ptr-test.sh     regression/stress suite against the PTR (see scripts/tests/)
  deploy.sh       server-side redeploy (the forced command for the deploy key)
  sim/wormholes.mjs  nomad-space wormhole/population simulator for DESIGN.md (node scripts/sim/wormholes.mjs [scenario])
.github/workflows deploy-server.yml (packages/server/**), deploy-website.yml (website/**)
```

Changes under `docs/`, `CLAUDE.md` and `scripts/tests` trigger no deploy.

## Patch workflow

1. `scripts/ptr.sh start` (it restarts the server after code changes).
2. Make the change.
3. Run `scripts/check.sh`.
4. Test it:
   - **Targeted:** `node scripts/ptr-run.mjs steps.js [shot.png] [WxH]`. A steps file is the body of an async function with `s(ms)`, `A` (= window.Atamus) and `dev({cmd,...})` available.
   - **Broad:** `scripts/ptr-test.sh` runs the regression and stress suite.
   - **Phone layout:** check with a `390x844` screenshot.
5. If you touched client files, bump the cache-busters:
   - `?v=` on the scripts in `website/game.html`:
     `CUR=$(grep -oP 'game.js\?v=\K[0-9]+' website/game.html); sed -i "s/?v=$CUR/?v=$(date +%s)/g" website/game.html`
   - `play.js?v=` in `website/play.html`, if play.js changed.
6. Update `docs/FEATURES.md` and `docs/CHANGELOG.md`.
7. Commit, ending the message with the attribution lines. Push to `main` and the workflows deploy:
   - each one first calls `/game/update-countdown`, which starts the 30 s countdown in every client;
   - it then sleeps 30 s and switches the live build;
   - clients are sent to `play.html?updating=1`, which waits for the new build.

**PTR dev commands** (socket `{t:"dev", cmd}`, PTR only):

- `credits amount`, `license key level`, `ship type`, `item item qty`
- `belts` (fill the home rocks)
- `inst` (a new asteroid instance, every beacon linked to it)
- `offline` (mark yourself offline, to test offline rules)
- `move ship x y [sys]`
- `heat ship value`, `modhp ship value` (set a ship's heat / all its modules' integrity)
- `update seconds` (rehearse the countdown)

The single PTR pilot is "Vera Kestrel". Ships are `1:ship:N`, and the station is at (-52, 38).

## Code conventions

- **Server-authoritative.** The client only sends commands. Validate every command field on the server as hostile:
  - whole numbers only;
  - the target must be owned by the sender;
  - name the item, not just the slot.
- **No re-render while interacting.** The UI updates in place, and windows rebuild only when their structure signature changes. Don't rebuild DOM on every snapshot: buttons die mid-click.
- **Syntax check before every commit.** `node --check` (via `scripts/check.sh`) runs before every commit. A syntax error once reached live.
