# Pet Delivery Co.: working notes for Claude

Pet Delivery Co. is a co-op, phone-first 3D browser game (Three.js, 1 unit = 1 m): ride your pet around a floating
town delivering mail, hatch and train pets, build a house on your plot, play with friends. The website is on GitHub
Pages (atamus.io); the co-op server is Node behind Caddy (play.atamus.io, WebSocket `/pets`). Claude writes the code and
runs deploys. Two developers now work on this repository, each with their own Claude: follow **Working together** below.

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
- **Every change reaches main through a pull request that merges itself** (owner, 2026-11-08; see Working together).
  Merging deploys straight to live (no PTR step). `scripts/ptr.sh` runs the server + site locally when a quick look is
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
packages/server/smoke.mjs   the smoke test (npm run smoke); smoke-browser.mjs the game page in headless Chrome
                            (npm run smoke:browser)
scripts/
  check.sh            syntax-check every JS file and compare the two pets-world.js copies
  task.sh             the task workflow: start a task worktree, finish (merge main, check, PR, squash-merge, verify)
  protect-main.sh     the GitHub settings below, applied by an admin (owner), or checked by anyone with --verify
  ptr.sh              start|stop|reset|status for a local copy (local Postgres :5433, server :8090 serving website/)
  ptr-run.mjs         run a JS snippet in headless Chromium against the local copy
  deploy.sh           server-side redeploy (the forced command for the deploy key); setup.sh server provisioning
.github/workflows     check.yml (the required check, on pull requests), deploy-website.yml (website/**),
                      deploy-server.yml (packages/server/**): the deploys run on every push to main (= every merge)
```

Changes under `docs/`, `CLAUDE.md` and `scripts/` (other than deploy.sh) trigger no deploy.

## Working together (owner, 2026-11-08)

Two developers, each with their own Claude, each with their own clone. Goal: `main` always buildable and playable,
holding completed, verified increments. **You own each task from implementation to verified arrival on remote
`main`**: don't stop at "committed", "PR created" or "ready to merge", and don't ask whether to commit, push or merge
routine completed work. Nobody approves or clicks Merge.

**One task = one short-lived branch, one writer, one folder.** Name it `<you>/<task>` (e.g. `regis/pet-movement`).
Never run two sessions in the same folder; a second session on the same machine uses its own worktree. Never switch
branches, edit, stash, clean or commit inside another session's folder, or take over the other developer's branch.

**Start:**

1. Look at the current branch and `git status`. Keep any existing uncommitted or untracked work exactly as it is: if
   the folder has work that isn't this task's (or isn't yours), don't stash, discard, move or commit it; make a fresh
   worktree instead.
2. `git fetch origin`, then start from the latest `origin/main`: `scripts/task.sh start <you>/<task>` (a new worktree
   beside this folder), or, in a clean folder of your own, `git switch -c <you>/<task> origin/main`.
3. Read recent commits and the open pull requests (`gh api repos/{owner}/{repo}/pulls`) for overlapping work.

**While working:**

- Small, coherent, testable increments; merge each as soon as it's ready. No unrelated refactors, broad reformatting,
  renames or whole-file rewrites; stage only your task's files or hunks.
- Once there's a meaningful commit, push and open a draft pull request saying the scope and which shared systems it
  touches.
- Before changing a shared system, read its current code and the other developer's recent changes to it: the shared
  world (`pets-world.js`, both copies), client/server messages, saved player data (`cleanData`, the server's save and
  rev), coins / items / rewards, startup and configuration. A clean git merge doesn't mean the combined behavior is
  right; changes in different files can still clash.
- Never delete unfamiliar code, restore an older version, or remove the other developer's features because it makes
  your task easier. If an open pull request already does overlapping work, don't duplicate it: build on its interface,
  or let it land first, then update and carry on.

**Integrate, then finish** (with the task's changes committed and the folder clean):

1. `scripts/task.sh integrate`: fetches, merges `origin/main` into the branch (merges only: never rebase a pushed
   branch, never force-push), shows what the branch changes against `origin/main` (deleted files and touched shared
   systems called out) and runs the checks. **Read that diff**: anything deleted or changed in shared behavior that
   isn't your task's is a mistake to fix before going on.
2. `scripts/task.sh finish "<title>" <body-file> [<commit-message-file>]`: integrates again, pushes, opens (or reuses)
   the pull request, waits for the required `check`, squash-merges only once `check` passed on a commit that holds the
   latest `main`, verifies the merge commit is on `origin/main`, and reports `main`'s own `check` on it. If `main` moved
   meanwhile it integrates again and repeats. The body file ends with the pull-request attribution lines, the
   commit-message file with the commit attribution lines. If `check` fails, fix it on the branch and run finish again.
   It's a loop in this session only: it isn't automation that keeps running after the session, so stay with it until
   it reports the change on `main` (or a concrete blocker).
3. Report done only once finish says the change is on `main`. Never bypass the checks or use an admin override to merge.

**Conflicts** (exit 2): read both versions and their history, resolve each conflicting section so both changes'
intended behavior survives, check the affected callers and the gameplay, run the checks, commit, run it again. Never
take a whole file as ours or theirs, and never restore an old file over newer work. If the two intentions genuinely
can't both stand and the task, code, tests and docs don't settle it: keep both versions, leave that integration pending,
carry on with independent work, and report the exact decision needed.

**Frozen scope:** once a pull request is set to merge itself, its scope is frozen. If more changes turn out to be needed,
turn its auto-merge off first (`gh api -X DELETE repos/{owner}/{repo}/pulls/<n>/ccr/auto_merge`, or in the PR) and look
at its state: if it already merged, start a new task branch from fresh `main`; never keep adding to a squash-merged
branch.

**Never** (to resolve anything): force pushes (`--force-with-lease` included), resetting remote `main`, `git reset
--hard`, a destructive `git clean`, restoring files broadly over existing work, staging everything (`git add -A`) when
unrelated changes are present, or weakening tests and checks to get a merge through. Unfinished features stay on their
branch, unless a default-off feature flag lets a complete increment land without changing normal play.

**Assets that can't be merged** (images, fonts, `vendor/`, any future models or maps): there's no locking tool, so
before editing one, check the open pull requests; if another touches the same asset, let it land first; name every
such asset in your draft pull request. Never overwrite the other developer's version and call it merged. Prefer
separate modules and new files over editing shared ones.

**After merging:** the PR reports merged, its squash commit is on `origin/main` (not the task's own commits), and
`main`'s `check` passed: finish does all three. If it caused a regression, make the smallest corrective pull request
(or revert the change through a pull request, keeping later work) the same way; never rewrite `main`. Every next task
starts from freshly fetched `main`.

**Reports** are short and factual and keep apart: merged into `main` (PR and commit), still pending (with the exact
blocker), checks that passed, and verification that couldn't be done.

**Merge queue:** GitHub only offers it to organization-owned repositories; this one belongs to a user, so the
integrate / check / merge loop above is the workflow (`check.yml` already runs on `merge_group` should that change).

**The checks** (what the required `check` job runs, `.github/workflows/check.yml`, on every pull request merged with
the current `main`): `scripts/task.sh checks`, which is `bash scripts/check.sh` (every JS file parses, the two
`pets-world.js` copies match) and `cd packages/server && npm run smoke` (the world's rules, and the real `/pets` server in
memory with two players: register, welcome with plots, positions, saves and stale saves, house changes, chat, logging
in again) and `npm run smoke:browser` (the same in-memory server serving `website/`; `pets.html` in headless Chrome
loads, creates an account and rides, with no page or console errors or failed requests: the only check that runs
`website/pets.js`; set `CHROME` if it can't find Chrome, it skips locally without one but never in CI). Seconds. For gameplay changes also look at the game itself when it's worth it (`scripts/ptr.sh start`).

**GitHub settings this relies on** (set once by an owner with admin rights: `scripts/protect-main.sh`; a Claude session
with write access can't change repository settings or branch protection, and GitHub answers it 404): `main` protected
with pull requests required (0 approvals), the status check `check` required with branches up to date before merging,
force pushes and deletion blocked, applied to admins too; squash merging only, auto-merge allowed; head branches
deleted automatically after merging. `scripts/protect-main.sh --verify` checks them (any access); until it passes,
nothing enforces these rules, so follow them anyway and say so in reports.

## Patch checklist (inside every task)

1. Make the change (if you touch `website/pets-world.js`, copy it over `packages/server/src/pets-world.js`).
2. Run `scripts/task.sh checks`.
3. If you touched client files, bump the `?v=` cache-buster on `pets.js` in `website/pets.html` (and on
   `style.css` / `front-updates.js` in `index.html` if you changed those).
4. Update `docs/PETS.md` and `docs/CHANGELOG.md` (and the front page for a new feature).
5. Commit, ending the message with the attribution lines, then `scripts/task.sh finish`. Merging into `main` deploys
   (website to GitHub Pages, server over the deploy key); a new website build reloads connected players onto it.
6. A quick local look when it's worth it: `scripts/ptr.sh start`, then open http://localhost:8090/pets.html.
