# Breach.io

A second game on the site (owner, 2026-10-20): **Breach.io**, a 2D top-down breach-and-clear with vector (SVG) art.
Multiplayer later; **for now a quick single-player iteration**, entirely in the browser: `website/breach/` (index.html +
breach.js), live at atamus.io/breach/. Nothing on the server.

## How it plays (what's live)

- **The menu:** a callsign, a primary (Rifle, SMG, Shotgun, Sniper — the Sniper pierces), a grenade (Frag or Flashbang,
  two of them), and the size of the red team (10–30). The choices are remembered in the browser. Every operator also
  carries a pistol.
- **The map:** open ground around one procedural house — rooms by recursive splitting, each inner wall with a door
  (now and then an open archway), outer walls with 2–4 doors and a few glass windows. You spawn outside, by an outer door.
- **Doors:** E opens / closes the nearest; shooting a door wears it down until it breaks; frags blow doors and windows in.
  Glass blocks movement but not sight; bullets shatter it. The red team shoves doors open as they walk.
- **Vision:** line of sight — everything outside it is darkened, and red operators show only when in sight.
- **The red team:** spread through the rooms (two guard the payload). They wander room to room, see in a cone (620 m;
  850 once in a fight), react after a beat, fire in bursts (more accurate the longer they track you, less when you move),
  sidestep while fighting, hunt your last-seen spot, then search. Gunfire, doors, glass and blasts are heard through
  walls and draw them in. Flashbangs blind them; frags hurt everyone in the blast with a clear line, you included.
- **Winning:** kill the whole red team and secure the payload (hold E beside the case for 3 s). Dying ends the run. The
  end screen shows time, kills, accuracy and the payload.
- **Controls (owner, 2026-10-20):** WASD move (Shift walks: a little steadier), **left mouse fires, right mouse aims down
  sights** (tight spread, slower movement, the view reaches further toward the cursor, a faint sight line), **R reloads,
  F throws a grenade** at the cursor, 1 / 2 / Q / wheel swap weapons, E for doors and the payload. Desktop only for now.
