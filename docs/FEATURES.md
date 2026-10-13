# Atamus: how the game works today

This is a living spec of the game. Read it before every patch, and update it in the same commit as any change to behavior. Rules marked **(owner)** were decided explicitly by the owner, so keep them unless the owner says otherwise.

## The 3D rebuild (owner, 2026-10-12)

The owner wiped the 2D game to rebuild Atamus in 3D. **The whole 2D game — its world, client, UI, modules, combat, ETA, market, pilots, licenses and the rest — lives on the `legacy-2d` branch** (tip `e56e61d`); bring pieces back from there only when the owner asks. The accounts backend (auth, sessions, security, the admin API, the deploy countdown) was kept on `main` and still runs; the admin panel and chat have no frontend right now.

**Old data is kept (owner):** accounts, credits, pilots, licenses and the old game tables stay in the database untouched for reference. The 3D game only reads and writes `users` (auth) and its own `world3d` table.

## The world (owner, 2026-10-12)

- **One shared 3D world on one server: no POIs, no systems, no instances. Everyone sees everyone.**
- A flat ground plane with a **2D grid** (100 m cells) drawn on it.
- **The border is the same flat-top hexagon** (flat edges top and bottom, points east and west), **126 km flat to flat** (owner, 2026-10-12; was 5 miles), drawn as a glowing band on the ground. It stops players: movement walks as far along the step as still fits, and the sphere's edge rests on the line.
- **Each player is one sphere, 100 m in diameter** (your own blue, everyone else's red), rolling as it travels. One sphere per account; it spawns within 300 m of the center the first time and comes back where it was after that (positions saved every 10 s and on leaving; a saved position outside the hexagon respawns at the center).
- **Travel is on the ground plane only (XY): no movement up or down on Z.**
- **Speed: 300 m/s** (owner, 2026-10-12; `SPEED` in `world3d.js`). Crossing the map takes about 7 minutes.
- **Sprint (owner, 2026-10-12): holding Shift doubles the speed.** The sprint is just a flag to the server (`{t:"move", x, y, b}`); the server applies the doubling. *Open: its touch equivalent.*
- The grid is drawn by the ground's own shader (anti-aliased 100 m lines on the surface itself), after a separate layer of rendered lines flickered against the ground.
- **Server-authoritative:** the client only sends a direction (`{t:"move", x, y}`, clamped to length 1); the server simulates at 20 Hz and sends snapshots at 15 Hz to every client. The client predicts its own sphere locally (with the same border rule) and is softly corrected by snapshots; other spheres are drawn 120 ms in the past, interpolated between snapshots.
- A player leaving (socket closed) despawns at once; their position is saved.

## Controls (owner, 2026-10-12)

- **WASD moves the sphere; wherever the camera is facing is "forward".**
- **The middle mouse button, dragged, rotates the camera around the player** — **inverted** (owner, 2026-10-12): dragging right turns the view right. On touch, a one-finger drag does the same (mobile parity: drag = drag). *Open: how movement itself works on touch — nothing is decided yet.*
- **The camera orbits the player looking down toward it; its pitch, zoom range and rotation speed are sliders** (owner, 2026-10-12): a panel in the top right with **Pitch** (15–89°, default 75°), **Zoom** (one two-handle slider for min and max, 100–8,000 m, defaults 180–2,200 m) and **Rotation** speed (10–300%, default 100%), kept per browser (`atamus.cam`). The mouse wheel (touch: pinch) zooms within the chosen range; the right-click leash zooms out at most to the chosen max.
- **Right-click aiming (owner, 2026-10-12):** holding the right button shows a **circle outline on the ground where the mouse points** (scaled with zoom to stay readable) and a **line from the sphere to it**. While held, the **camera's focus slides toward a point between the player and the circle** (leashed to 700 m from the player) and **zooms out as needed to keep the player in the shot**, never past max zoom; releasing eases everything back. It's an indicator only — it doesn't move the sphere (yet). *Open: its touch equivalent (hold = right-click) once touch movement is decided.*
- The browser's own right-click menu never opens in the game (kept from before).

## Accounts and sessions

Kept from before, unchanged (`auth.js`, `sessions.js`, `security.js` and the rest): sign-up with the EULA, log in / log out, Remember Password, password recovery and reset requests, device ids, failed-login backoff, impossible-travel locks, bans and the session cookie. **One session per account:** a new tab or device replaces the old one (close 4002: "Playing on another tab or device"). A dead session (4001) goes back to the login page.

- **The website** (atamus.io) is unchanged except play.html: **no more character or pilot creation** — a logged-in account goes straight to **Enter System**. The front page, login, signup, recovery and the EULA are as they were. The pixel logo and icons stay.
- The admin panel's API, moderation, appeals, tickets, the name filter and the trade-watch tables still exist server-side but have no frontend; admin hooks into the game world are disconnected (kicks and freezes don't reach the 3D world yet).

## Live updates (kept)

- Every push to `main` warns every connected player ahead of the switch — **1 s for now (owner, 2026-10-12: "make countdown 1 second for now"**; it was 30 s and goes back up when the owner says): the game shows **"Update incoming — N s"** top center, then sends them to `play.html?updating=1`, which waits for the new build and offers Enter System again. The length lives in `gamehttp.js` (`announceUpdate(part, 1)`) and the `sleep` in both deploy workflows.
- The deploy workflows are unchanged (`deploy-website.yml` on `website/**`, `deploy-server.yml` on `packages/server/**`).

## Rejected / removed (don't reintroduce)

- **The whole 2D game (owner, 2026-10-12: "wipe the main game. were gonna make it 3D"):** shelved to `legacy-2d`, not rejected — the owner asks before anything comes back.
- **POIs, systems and instanced load-splitting (owner, 2026-10-12):** "the whole map will be one server, no poi's and stuff. everyone can see everyone."
- **Character and pilot creation on the website** (removed with the 3D rebuild; pilots don't exist in the 3D game yet).
- **The front page redirecting signed-in visitors to Log in** (owner, 2026-10-12: "show the front page again").
