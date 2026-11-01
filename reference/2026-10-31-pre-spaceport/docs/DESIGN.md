# Atamus design

**The mining redesign (owner, 2026-10-18).** The design document is **"Crack, Bank and Haul"** (draft 9, 17 Oct 2026), checked in at **`docs/Atamus_Ring_Mining.html`** — read it before touching gameplay. The ship, station, asteroid and Saturn art is the artifact **"Atamus ships"**: https://claude.ai/artifact/LMCjSamVAaYs8WbwALuzJw (drawn in `website/shipart.js`; the look in `website/theme.css`). What's built is in `docs/FEATURES.md`.

## The direction

- **A cooperative gather-and-craft MMO, like Palia. No PvP.** The cooperation lives inside the act of mining — how the rock is built, who maps it, who cuts where, when to pop — not in a payout table.
- **Ore is physical.** It banks in cores, pays at the pop, rides in holds, cans and crates, and only becomes money when it's delivered. A party shares everything evenly.
- **Bore or strip:** a bore reaches the core's ore fast; stripping the whole rock pays far more.
- **Each role is its own ship** (owner, 2026-10-18): Miner, Scanner (the core driller, + tractor), Hauler (hauler + refinery), Booster (command; boosted lasers are the only clean cut through bedrock, which is rich), Fueler. Every ship has a light laser. Kept from the old design: Saturn, the rings (three now), sectors, fog of war, movement.
- **No risk in transit for now**: only time takes ore.

## In the document but not built yet

- Crafting, station factories (solo or clan), missions, contracts, PvE, upgradable stations anyone can use — the document scopes them out ("mining and ore only").

Findings carried over from the 2D load tests, for whenever scale matters again: the $24 Vultr box held about 200–300 players spread out (100–150 gathered in one spot), at roughly 1.5–2 KB/s per player compressed.
