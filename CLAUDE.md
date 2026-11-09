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
- **Straight to live through `main`** (no PTR step for now). Two developers, each with Claude, share this repository:
  every change reaches `main` through its own pull request, fully automatically, as in "Getting changes into main"
  below. `main` deploys live, so it must stay playable. `scripts/ptr.sh` runs the server + site locally when a quick
  look is worth it.
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
  smoke.mjs           game smoke: load pets.html on a running server, create an account, play (part of the Check)
  land.sh             land the current task branch on main (the loop in "Getting changes into main")
  protect-main.sh     one-time repository settings and branch protection for that loop (admin), and --verify
  deploy.sh           server-side redeploy (the forced command for the deploy key); setup.sh server provisioning
.github/workflows     check.yml (the required "check" on every PR and on main), deploy-website.yml (website/**),
                      deploy-server.yml (packages/server/**): deploys on push to main
```

Changes under `docs/`, `CLAUDE.md` and `scripts/` (other than deploy.sh) trigger no deploy.

## Patch workflow

1. Make the change (if you touch `website/pets-world.js`, copy it over `packages/server/src/pets-world.js`).
2. Run `scripts/check.sh`.
3. If you touched client files, bump the `?v=` cache-buster on `pets.js` in `website/pets.html` (and on
   `style.css` / `front-updates.js` in `index.html` if you changed those).
4. Update `docs/PETS.md` and `docs/CHANGELOG.md`.
5. Commit on your task branch, ending the message with the attribution lines, then land it with `scripts/land.sh`
   (next section). The squash merge into `main` deploys (website to GitHub Pages, server over the deploy key); a new
   website build reloads connected players onto it.
6. A quick local look when it's worth it: `scripts/ptr.sh start`, then open http://localhost:8090/pets.html.

## Getting changes into main (agreed by both developers, 2026-11-09)

Fully automatic: Claude takes every task from branch to verified merge. Nobody approves, clicks Merge or updates
branches by hand, and Claude doesn't ask whether to commit, push or merge routine finished work.

**Repository rules** (`scripts/protect-main.sh` sets them, needs admin; `scripts/protect-main.sh --verify` checks them
with any access): `main` only through pull requests, 0 approvals, the Check workflow's `check` must pass on a branch
up to date with `main`, linear history, no force pushes or deletion, admins included; squash merging only, auto-merge
on, branches deleted after merge. No merge queue (GitHub offers it only to organization repositories). Until the
owner has run the script, `--verify` fails and nothing enforces these rules: follow them anyway, and say so in reports.

**The Check** (`.github/workflows/check.yml`, about two minutes; on a PR it runs on GitHub's merge with current `main`):
`scripts/check.sh` (syntax, the two `pets-world.js` copies), the server starting against Postgres, and
`scripts/smoke.mjs` (the game loads, an account is created, the town plays, no page or console errors or failed
requests). The same locally, with the PTR running: `bash scripts/check.sh && node scripts/smoke.mjs` (set `CHROME` and
`PLAYWRIGHT` if there's no `/usr/bin/google-chrome` or `playwright-core`). Never weaken or skip a check to get a merge.

**Each task:**

1. **Isolate.** One task, one branch, one writer, one folder. Look at the current branch and `git status` first and
   leave any existing work exactly as it is (no stash, reset, clean, checkout of files or committing it to tidy up).
   `git fetch origin`, then start from the latest main: `git switch -c <github-login>/<task> origin/main` in a clean
   folder of your own, or a fresh worktree whenever the folder has other work or another session uses it:
   `git worktree add ../Atamus-<task> -b <github-login>/<task> origin/main`. Never touch another session's folder.
2. **Look for overlap.** Recent `git log origin/main` and open PRs (`gh pr list`) touching the same systems. Don't
   duplicate an open PR or take over the other developer's branch: build on its interface, or let it land first and
   then merge `main` in.
3. **Small and careful.** One coherent, testable increment; no drive-by refactors, renames, reformatting or whole-file
   rewrites. Before changing a shared system (pets-world.js, the client/server messages in pets.js, saved player data
   and `cleanData`, coins/treats/rewards, start-up and config) read its current code and the other developer's recent
   changes to it. Never delete unfamiliar code or bring back an older version to make your task easier. Stage only
   your own files or hunks (no `git add -A` / `.` / `commit -a`). Once there's a meaningful commit, show the work:
   `scripts/land.sh --draft "<title>" <body-file>` (the body says the scope and the shared systems it touches).
   Unfinished features stay on the branch unless a default-off flag keeps them out of normal play.
4. **Land.** Commit everything for the task, then `scripts/land.sh "<title>" <body-file>` (PR body ends with the
   attribution line). It merges `origin/main` in (never rebase), runs `scripts/check.sh`, pushes, opens or reuses the
   PR, waits for the Check, squash-merges (or turns on auto-merge), goes round again whenever `main` moved first, then
   confirms the squash commit is on `origin/main` and that `main`'s Check passed. Exit 2: merging `main` conflicted.
   Exit 3: a Check failed. Fix, commit, rerun. It runs only while the session does; nothing keeps going afterwards.
5. **Conflicts.** Read both sides and their history (`git log -p` on the section), keep both intents where they fit,
   resolve section by section, never take "ours" or "theirs" for a whole file, then check the callers and play the
   affected feature. A clean merge can still be wrong: after merging `main`, read `git diff origin/main...HEAD` and
   `git diff origin/main` for deletions or changed shared behavior. If the two intents truly can't both hold and the
   task, code and docs don't decide it, keep both versions, leave the PR unmerged and report the exact decision.
6. **After the merge** start the next task from a fresh `origin/main`, never on the merged branch. Once auto-merge is
   on, the PR's scope is frozen: for more changes turn it off first (`gh pr merge --disable-auto`), or if it already
   merged, use a new branch. A regression gets the smallest corrective PR through the same loop, a needed revert is a
   `git revert` on a branch through a PR; `main` is never rewritten.
7. **Never:** force pushes (even `--force-with-lease`), rebasing published branches, resetting `main`, `git reset
   --hard`, destructive `git clean`, admin overrides, or skipping the Check.
8. **Report** briefly: merged (PR and squash commit) or pending (the exact blocker); which checks passed; what wasn't
   verified.

**Assets.** Models, the town and the pets are code in `pets.js` / `pets-world.js` and merge as text. The few binary
files (`website/assets/`, fonts, `favicon.svg`) have no lock: change one only in its own small PR, check open PRs
first, and never replace the other developer's version of it.
