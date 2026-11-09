# Pet Delivery Co.: working notes for Claude

Pet Delivery Co. is a co-op, phone-first 3D browser game (Three.js, 1 unit = 1 m): ride your pet around a floating
town delivering mail, hatch and train pets, build a house on your plot, play with friends. The website is on GitHub
Pages (atamus.io); the co-op server is Node behind Caddy (play.atamus.io, WebSocket `/pets`). Claude writes the code and
runs deploys; several people now work on this repository.

**Before you change anything:**

1. Read `docs/PETS.md`. It describes how the game behaves today: every implemented rule and decision, plus things the
   owner rejected.
2. Skim the top of `docs/CHANGELOG.md` to see what changed recently.
3. `main` is the one source of truth (owner, 2026-11-08): everything deploys from it; the older Atamus prototypes were
   removed (they're in git history only). **Old database data stays untouched** (older tables are left in the live
   database, unused).

**In the same commit as any change to behavior:**

- Update `docs/PETS.md`. Add new rules, edit changed ones, and move anything removed to "Rejected / removed".
- Add a dated entry to `docs/CHANGELOG.md`.

These docs are the project's memory between sessions. If they disagree with the code, the code wins: fix the doc.

## Owner's standing rules

- **No unrequested UI.** Don't add UI, panels or UX unless the owner asks for it.
- **No helper or hint text**, anywhere. Tooltips show names only.
- **Mobile parity.** Everything works on touch screens too: tap selects and places, a thumb joystick moves, drag turns
  the camera, two fingers pinch the zoom.
- **US spelling.**
- **Push straight to live** (no PTR step for now). Still run `scripts/check.sh` before every push (the deploy workflows
  run it too and refuse to deploy a broken file). `scripts/ptr.sh` runs the server + site locally when a quick look is
  worth it.
- **Front-page updates.** When a new feature ships (never minor changes or fixes), add a bullet to that day's entry in
  the Updates list in `website/index.html` (one entry per day, newest first). Say what was added or changed, never how
  it works: no timers, thresholds, counts or rules.
- **Read the real game files.** Don't guess at behavior. Read the code, or ask when it's a design decision.

## Layout

```
website/              GitHub Pages site (atamus.io)
  index.html          the front page (Updates list); style.css + theme.css + front-updates.js for it
  pets.html           the game page and HUD; its <meta name="pets-server"> (and CSP connect-src) name the game server
  pets.js             the whole client: town, riding, parcels, eggs, training, items, houses and building, co-op client
  pets-world.js       the world, shared with the server: terrain, roads, houses, islands, plots, animal control, the
                      player-data rules (cleanData). packages/server/src/pets-world.js must be an identical copy
                      (scripts/check.sh compares them)
  vendor/             Three.js (self-hosted); fonts/, assets/ (logo), favicon, CNAME
packages/server/src/
  index.js            Express bootstrap: /healthz {build}, the deploy workflows' /game routes, the /pets socket; in the
                      PTR it also serves website/
  pets.js             the co-op: WebSocket /pets, accounts, rooms of 16, positions, animal control, contracts, chat,
                      parties, trades, housing plots, staff (admin panel)
  petstore.js         accounts in Postgres (pet_accounts, pet_tokens, pet_admin_log) or in memory for tests
  pets-world.js       copy of website/pets-world.js (keep identical)
  build.js            SERVER_BUILD, website build polling (a new site build reloads players), the update countdown
  gamehttp.js         the deploy workflows' calls; db.js the schema (Pet Delivery Co.'s tables); config.js; hash.js
scripts/
  check.sh            syntax-check every JS file and compare the two pets-world.js copies (run before every push)
  ptr.sh              start|stop|reset|status for a local copy (local Postgres :5433, server :8090 serving website/)
  ptr-run.mjs         run a JS snippet in headless Chromium against the local copy
  deploy.sh           server-side redeploy (the forced command for the deploy key); setup.sh server provisioning
.github/workflows     deploy-website.yml (website/**), deploy-server.yml (packages/server/**): both on push to main
```

Changes under `docs/`, `CLAUDE.md` and `scripts/` (other than deploy.sh) trigger no deploy.

## Patch workflow

1. Make the change (if you touch `website/pets-world.js`, copy it over `packages/server/src/pets-world.js`).
2. Run `scripts/check.sh`.
3. If you touched client files, bump the `?v=` cache-buster on `pets.js` in `website/pets.html` (and on
   `style.css` / `front-updates.js` in `index.html` if you changed those).
4. Update `docs/PETS.md` and `docs/CHANGELOG.md`.
5. Commit, ending the message with the attribution lines. Push to `main` and the workflows deploy (website to GitHub
   Pages, server over the deploy key). A new website build reloads connected players onto it.
6. A quick local look when it's worth it: `scripts/ptr.sh start`, then open http://localhost:8090/pets.html.
