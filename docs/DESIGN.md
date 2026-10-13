# Atamus design

**Superseded (owner, 2026-10-12): Atamus is being rebuilt in 3D.** The previous plan — the Expanse and nomad space built from POIs, arcs, the base surface, wormhole population flow and the 1,000-player engine budget — belongs to the 2D game and lives, with everything else, on the **`legacy-2d` branch** (`docs/DESIGN.md` there, plus `scripts/sim/wormholes.mjs` and its findings).

## The 3D direction (owner, 2026-10-12, so far)

- The game is 3D: one flat world with a 2D grid, the same flat-top hexagon border (126 km flat to flat).
- **One shared world on one server: no POIs, no instancing. Everyone sees everyone.**
- Players travel on the ground plane only (no Z), WASD relative to an orbiting camera (middle mouse, 75° down).
- The player is a 100 m sphere for now; real ships, gameplay and everything else are still to be decided.

Findings carried over from the 2D load tests, for whenever scale matters again: the $24 Vultr box held about 200–300 players spread out (100–150 gathered in one spot), at roughly 1.5–2 KB/s per player compressed.

Nothing else is decided. New decisions go here as the owner makes them; what ships moves to `docs/FEATURES.md`.
