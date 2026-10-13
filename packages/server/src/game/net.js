// The game socket for the 3D world (owner, 2026-10-12). One shared world: every
// connected player is in it, everyone sees everyone. One session per account (a new
// tab replaces the old: 4002). The client only sends commands ({t:"move", x, y}: a
// direction); the server simulates at 20 Hz and sends snapshots at 15 Hz. Deploy
// countdowns and website reloads reach every client here, as before.
import { WebSocketServer } from "ws";
import { readCookie, getSessionUser } from "../sessions.js";
import { SERVER_BUILD, onWebsiteUpdate, onCountdown, activeCountdown } from "../build.js";
import { World3D, HEX_FLAT, SPHERE_R, SPEED } from "./world3d.js";

export function attachGameServer(httpServer) {
  const world = new World3D();
  const socks = new Map();                     // account id -> ws

  const wss = new WebSocketServer({
    server: httpServer, path: "/ws", maxPayload: 16 * 1024,
    perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 3 }, serverMaxWindowBits: 13, concurrencyLimit: 4 },
  });

  const broadcast = (obj) => { const msg = JSON.stringify(obj); for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(msg); };

  // ---- deploys: the 30 s countdown, and "the website switched: reload" ----
  onCountdown((at, head, parts) => { broadcast({ t: "countdown", at, in: Math.max(0, at - Date.now()), parts }); console.log("[build] update " + head.slice(0, 7) + " in " + Math.round((at - Date.now()) / 1000) + " s"); });
  onWebsiteUpdate((v) => { broadcast({ t: "update", web: v }); console.log("[build] website " + v.slice(0, 7) + " live, clients told to reload"); });

  wss.on("connection", async (ws, req) => {
    let user = null;
    try { user = await getSessionUser(readCookie(req)); } catch (e) { console.error("ws auth", e); }
    if (!user) { ws.close(4001, "Not logged in"); return; }
    if (user.frozen) { ws.close(4001, "Not available"); return; }
    const pid = String(user.id);

    const old = socks.get(pid);                // (owner) one session per account: the new one replaces the old
    if (old && old !== ws) { try { old.close(4002, "Replaced"); } catch {} }
    socks.set(pid, ws);

    const me = await world.join(pid, user.username);
    let cmds = 0;                              // rough flood cap: ~40 commands a second
    const cmdReset = setInterval(() => { cmds = 0; }, 1000);

    ws.send(JSON.stringify({
      t: "hello", build: SERVER_BUILD, countdown: activeCountdown(),
      you: { id: pid, name: user.username, x: me.x, y: me.y },
      cfg: { hexFlat: HEX_FLAT, sphereR: SPHERE_R, speed: SPEED },
      roster: world.roster(),
    }));
    broadcast({ t: "join", i: pid, n: user.username });

    ws.on("message", (data) => {
      if (socks.get(pid) !== ws) return;       // a replaced session: ignore everything it sends
      if (++cmds > 40) return;
      let m; try { m = JSON.parse(String(data)); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "move") world.setDir(pid, m.x, m.y);
      else if (m.t === "ping") { try { ws.send(JSON.stringify({ t: "pong", ts: m.ts })); } catch {} }
    });

    ws.on("close", () => {
      clearInterval(cmdReset);
      if (socks.get(pid) !== ws) return;       // replaced: the newer socket owns the player now
      socks.delete(pid);
      world.leave(pid).then(() => broadcast({ t: "leave", i: pid })).catch((e) => console.error("leave", e));
    });
    ws.on("error", (e) => console.error("ws", e.message));
  });

  setInterval(() => world.step(), 50);                                           // 20 Hz simulation
  setInterval(() => broadcast({ t: "snap", ts: Date.now(), p: world.snapshot() }), 66);   // 15 Hz snapshots

  console.log("3D world attached at /ws (hex " + Math.round(HEX_FLAT) + " m flat to flat)");
}
