# Atamus before the reset (2026-10-10)

The owner took the live game back to basics on 2026-10-10 (just the Player and Pilot pages, the Expanse's boundary
and a Prospector to fly). This folder keeps everything that was live just before, for reference: copy ideas and code
from it, but nothing here is deployed or run.

- `website/`: the game client (game.js, ui.js, game.css, sun.js) and the website pages. The art it used is still
  in `website/assets/`.
- `server/src/`: the whole server, including the game (stations, stargates, belts and asteroids, mining, modules,
  drones, propulsion, fitting, inventories, market, chat, the base and its pipes, the tutorial shard) and the full
  license catalog (`licenses.js`).
- `tests/`: the regression suite that ran against it.
- `docs/FEATURES.md`: how all of that behaved.

The git tag `pre-reset-2026-10-10` is the exact commit.
