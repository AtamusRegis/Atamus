# Breach.io

A second game on the site (owner, 2026-10-20): **Breach.io**, a 2D top-down breach-and-clear with vector (SVG) art.
Multiplayer later; **for now a quick single-player iteration**, entirely in the browser: `website/breach/` (index.html +
breach.js), live at atamus.io/breach/. Nothing on the server.

## How it plays (what's live)

- **The menu:** a callsign, a primary (Rifle, SMG, Shotgun, Sniper — the Sniper pierces), a grenade (Frag or Flashbang,
  two of them), and the size of the red team (10–30). The choices are remembered in the browser. Every operator also
  carries a pistol.
- **The map:** open ground around one procedural house of **2 floors (3 with 22+ red)** (owner, 2026-10-20) — each
  floor its own rooms by recursive splitting, each inner wall with a door (now and then an open archway). The ground
  floor's outer walls have 2–4 doors and a few glass windows; upper floors have windows only. **Stairs** (up to two,
  at spots clear on every floor) join them: E on the stairs goes up or down (from a middle floor, the top half goes up,
  the bottom half down). You spawn outside, by an outer door.
- **Doors:** E opens / closes the nearest; shooting a door wears it down until it breaks; frags blow doors and windows in.
  Glass blocks movement but not sight; bullets shatter it. The red team shoves doors open as they walk (quietly).
- **Vision:** line of sight — everything outside it is darkened, and red operators show only when in sight. You only
  see, hear and shoot your own floor, and so do they.
- **The red team:** spread over the floors and rooms (two guard the payload, which is on the top floor in the room
  farthest from the stairs). **They bunker in** (owner, 2026-10-20): about 70% hold a post — a spot in their room
  watching its doorway — and only about 30% roam room to room. They see in a cone (450 m; 650 once in a fight) and
  **never from off your screen — they can't see you from anywhere you can't see them**, react after a beat, fire in
  bursts (more accurate the longer they track you, less when you move) and sidestep while fighting (holders barely).
  When they lose you, a holder stays put covering where you were, then goes back to its post; a roamer hunts your
  last-seen spot, then searches. **Noise draws two, not a pack:** gunfire, doors, glass and blasts are heard through
  walls on the same floor, and only the nearest two (roamers first) go to look; the rest who heard it turn toward it
  and hold, watching. Flashbangs blind them; frags hurt everyone in the blast with a clear line, you included.
- **Winning:** kill the whole red team and secure the payload (hold E beside the case for 3 s). Dying ends the run. The
  end screen shows time, kills, accuracy and the payload.
- **Controls (owner, 2026-10-20):** WASD move (Shift walks: a little steadier), **left mouse fires, right mouse aims down
  sights** (tight spread, slower movement, the view reaches further toward the cursor — and further up / down than sideways, so a wide window sees as far vertically as horizontally, a faint sight line), **R reloads,
  F throws a grenade** at the cursor, 1 / 2 / Q / wheel swap weapons, E for doors and the payload. Desktop only for now.
