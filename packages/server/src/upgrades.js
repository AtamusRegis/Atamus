// (owner, 2026-11-11) two games share one HTTP server: Critter Courier's socket at /pets and Pet Delivery Co.'s at
// /pokemon. A ws server attached with { server, path } turns away any other path, so each game gets its own stand-in
// "server" and every upgrade is handed to the one its path names (anything else goes to /pets, which turns it away).
import { EventEmitter } from "node:events";

export function routeUpgrades(server, paths) {
  const ends = Object.fromEntries(paths.map((p) => [p, new EventEmitter()]));
  server.on("upgrade", (req, socket, head) => {
    let path = "/"; try { path = new URL(req.url, "http://x").pathname; } catch { /* bad url */ }
    (ends[path] || ends[paths[0]]).emit("upgrade", req, socket, head);
  });
  return ends;
}
