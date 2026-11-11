# Critter Courier

A phone-first 3D browser game: grab a parcel off the post office conveyor, ride your mount to its address past dogs,
geese and other couriers' kicks, deliver it and roll for rewards; hatch and level mounts and play alongside friends.

- Website (GitHub Pages, from `website/`): https://atamus.io — the game is `pets.html`
- Game server (Node behind Caddy, from `packages/server/`): https://play.atamus.io, WebSocket `/pets`

How the game works: [`docs/PETS.md`](docs/PETS.md). What changed: [`docs/CHANGELOG.md`](docs/CHANGELOG.md).
Working on the code: [`CLAUDE.md`](CLAUDE.md) (layout, rules, and how two developers work together: one branch per
task, pull requests that merge themselves once the required `check` passes; `scripts/task.sh`).

## Run it locally

Needs Node 20+ and PostgreSQL.

```sh
cd packages/server && npm install && cd ../..
scripts/ptr.sh start        # local Postgres on :5433 and the server on :8090, serving website/
# open http://localhost:8090/pets.html
scripts/ptr.sh stop
```

The server reads `DATABASE_URL` (required), `PORT` (8080), `ALLOWED_ORIGINS` (the site's origins, comma separated) and
`NODE_ENV`. It creates its tables on startup.

## Deploys (CI/CD)

Every pull request runs **check** (`.github/workflows/check.yml`: syntax, shared-file match, smoke test) on its merge
with the current `main`. Every push to `main` (every merge) deploys:

- `website/**` → **Deploy website**: syntax check, stamp `version.json`, publish to GitHub Pages, then tell the game
  server a new build is live (connected players reload onto it).
- `packages/server/**` → **Deploy server**: syntax check, then SSH to the server with the deploy key, whose forced
  command runs `scripts/deploy.sh` (pull `main`, `npm install`, restart the service).

Repository settings (GitHub → Settings → Secrets and variables → Actions):

| Name | Kind | What |
| --- | --- | --- |
| `DEPLOY_KEY` | secret | private half of the deploy key (`ATAMUS_DEPLOY_KEY` is still read) |
| `DEPLOY_HOST` | secret | the server's address (atamus.io's server if unset) |
| `GAME_SERVER` | variable | the server's https address, e.g. `https://play.example.com` (`https://play.atamus.io` if unset) |

GitHub Pages must be set to deploy from GitHub Actions; `website/CNAME` holds the site's domain.

## Moving to another server

1. Point a domain at the server and make a deploy key pair (`ssh-keygen -t ed25519`).
2. Run `scripts/setup.sh` on it as root (installs Node, Postgres and Caddy with automatic HTTPS, creates the database,
   clones the repo to `/opt/atamus`, runs the `atamus` service and adds the deploy key with `scripts/deploy.sh` as its
   forced command), setting `DOMAIN`, `SITE_ORIGINS` (the website's origin), `REPO` and `DEPLOY_PUBKEY` (see the top of
   the script).
3. In the GitHub repository set `DEPLOY_KEY` (the private half), `DEPLOY_HOST` and `GAME_SERVER`.
4. In `website/pets.html`, change `<meta name="pets-server">` and the `connect-src` in its Content-Security-Policy to
   the new `wss://…/pets` address. If the website moves too, change `website/CNAME`.
