import { WebSocketServer } from "ws";
import { config } from "../config.js";
import { getSessionUser, readCookie } from "../sessions.js";
import { World } from "./world.js";
import { CLIENT_CONFIG, TICK_MS, SNAPSHOT_MS } from "./constants.js";

const world = new World();

/**
 * Attach the game WebSocket server to an existing http.Server, and start
 * the simulation + snapshot loops. Connections authenticate with the same
 * session cookie the web app uses.
 */
export function attachGameServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    // Origin check (same policy as the HTTP API).
    const origin = req.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) {
      ws.close(4003, "origin");
      return;
    }

    const user = await getSessionUser(readCookie(req));
    if (!user) { ws.close(4001, "auth"); return; }

    const pid = String(user.id);
    const send = (s) => { if (ws.readyState === ws.OPEN) ws.send(s); };
    world.addPlayer(pid, user.username, send);

    send(JSON.stringify({ t: "hello", you: { id: pid, name: user.username }, cfg: CLIENT_CONFIG }));

    ws.on("message", (buf) => {
      let m;
      try { m = JSON.parse(buf.toString()); } catch { return; }
      switch (m.t) {
        case "move":   world.cmdMove(pid, m.id, +m.x, +m.y); break;
        case "activate": world.cmdActivateGate(pid); break;
        case "spawn":  world.cmdSpawn(pid); break;
        case "view":   world.cmdView(pid, m.which); break;
        case "chat":   world.cmdChat(pid, m.text); break;
      }
    });

    ws.on("close", () => world.removePlayer(pid));
    ws.on("error", () => { try { ws.close(); } catch {} });
  });

  // Simulation loop.
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.25, (now - last) / 1000); // clamp to avoid huge steps
    last = now;
    world.tick(dt);
  }, TICK_MS);

  // Snapshot broadcast loop.
  setInterval(() => {
    for (const p of world.players.values()) {
      p.send(JSON.stringify(world.snapshotFor(p)));
    }
  }, SNAPSHOT_MS);

  return wss;
}
