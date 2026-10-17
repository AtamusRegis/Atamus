# Atamus design

**The ring game (owner, 2026-10-16).** The full design is the artifact **"Atamus Ring Mining"** (draft 6): https://claude.ai/artifact/CfeRmvahLSwVXTSod92caB, with the ship, station, asteroid and Saturn art in **"Atamus ships"**: https://claude.ai/artifact/LMCjSamVAaYs8WbwALuzJw. What's built is in `docs/FEATURES.md`. Earlier plans (the 2D space game, the 3D versions) are on the `legacy-2d`, `legacy-3d-v1` and `legacy-3d-v2` branches.

## The direction

- **A cooperative gather-and-craft MMO, like Palia.** Players work together, never against each other: no PvP for now, if ever.
- **Everyone who helps gets the full amount:** names ride on each ore unit and every named player gets a copy on delivery.
- Ships are one hull with one module each, so roles (miner, hauler, fueler, tractor, command, refinery, scanner) need each other; anyone can still solo slowly.
- Fuel is the pressure: the station is near Saturn, the rich ore is far out, fuelers are paid by the world.

## Decided but not built yet

- **Contracts** (personal, turned in remotely from station storage, needing your name on the ore) and **Operations** (party contracts with an ore quota and time limit, picked by the party leader from a station board).
- **Crafting:** raw ore → refined ore → components → advanced components → modules and hulls; modules with levels; more hulls.
- **Jump gates** and more stations, later. Trading, maybe later.

Findings carried over from the 2D load tests, for whenever scale matters again: the $24 Vultr box held about 200–300 players spread out (100–150 gathered in one spot), at roughly 1.5–2 KB/s per player compressed.
