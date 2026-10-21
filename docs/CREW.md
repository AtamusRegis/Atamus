# Skeleton Crew

A single-player tactical demo on the site (owner, 2026-10-21): `website/crew/` (atamus.io/crew/), `index.html` + `crew.js`.
One ship, three decks, not enough crew. You steer the ship and pick its target; the game is assigning the crew. Kept a
prototype: simple, a little progression, everything clickable.

## How it plays (what's live)

- **Screen:** space on the left (on the top on tall screens), the ship's three decks on the right (below on tall screens).
- **The ship:** each deck has rooms above and below a corridor, with a lift at the stern joining the decks.
  - Deck 1 Command: Bridge, Comms, Science, Research.
  - Deck 2 Tactical: Lasers, Torpedoes, Point Defense, Medical, Shields.
  - Deck 3 Engineering: Engines, Galley, Storage.
  - Each room has 1–2 stations (the pips light with its power).
- **Crew:** circles in Star Trek division colors: red command, gold operations (Tactical, Engineering, Operations), blue
  sciences (Science, Medical). Each shows a name with chevrons to its left in their specialty's color, one per rank (1–3).
  You start with 8: Command, 2 Tactical, 2 Engineering, Operations, Science, Medical.
- **Orders:** click a crew member (Shift adds; drag a box; 1–9 picks by number; Esc clears), then click a room to send
  them (they walk the corridor and ride the lift). Clicking a room with nobody selected selects whoever is in it.
- **Work in a room:** crew there fight a fire first, then repair damage (Engineering twice as fast), then work the
  stations. Room power is the best crew up to its station count: a specialist counts 1, anyone else ½; +25% per rank
  above 1; halved under 35% health. Damage scales it down, a fire halves it. A crewed Galley lifts everyone (up to +20%).
- **Rooms do:**
  - **Bridge:** steering and evasion (nearly dead in the water without it).
  - **Engines:** speed, and both the bridge and the engines are needed to jump.
  - **Lasers:** fire on the target in range (380).
  - **Torpedoes:** load (4 s at full power) and launch at the target in range (700); homing, heavy.
  - **Point Defense:** shoots down incoming missiles.
  - **Shields:** regenerate.
  - **Science:** scans the target; a scanned target takes +50%.
  - **Research:** research points.
  - **Storage:** restocks torpedoes.
  - **Medical:** heals whoever is in it (faster with a medic working it).
  - **Comms:** missions.
- **Space:** click space to set a waypoint; click a hostile (or Tab) to target it. Weapons fire only on your target.
  Raiders circle and fire missiles; frigates close in and fire lasers (evasion makes them miss).
- **Getting hit:** shields first, then the hull and a random room. The room is damaged, its crew are hurt, and it may
  catch fire. Fires grow, burn the room and the crew in it, and spread to the next room.
  - Crew die at 0 health.
  - The run ends when the hull reaches 0 or everyone is dead.
- **Missions** (every ~30 s, up to 3): a room must be worked long enough before its timer runs out.
  - Distress call (Comms): a new crew member joins (up to 12).
  - Spatial anomaly (Science): +3 research.
  - Salvage (Storage): torpedoes.
  - Enemy chatter (Comms): every hostile scanned.
  - Hazards (red) punish failure: a coolant leak (Engines) sets the engine room on fire; contagion (Medical) hurts all crew.
- **Progression:**
  - Crew rank up by working.
  - Research buys five one-time upgrades: Laser focus, Torpedo racks, Shield emitters, Hull plating, Auto-medic.
  - Missions recruit crew.
  - Five sectors: clear the hostiles, press JUMP, and the bridge and engines spin it up (+15 hull). Jumping out of sector 5 wins.
- **Space** pauses (also the ❚❚ button).
