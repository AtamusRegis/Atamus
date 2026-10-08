import { WebSocketServer } from "ws";
import { config } from "../config.js";
import { getSessionUser, readCookie } from "../sessions.js";
import { World } from "./world.js";
import {
  TICK_MS, SNAPSHOT_MS,
  CELL_APOTHEM_KM, CELL_CIRCUMRADIUS_KM, CELL_CORNER_ROUND_KM,
  GATE_TRANSFER_RADIUS_KM, SHIP_HP, FUEL_SESSION_MAX_MS, FUEL_START_MS,
} from "./constants.js";
import { CELLS, STARGATE_CELLS, STATION_POS } from "./geometry.js";
import { ORES, BELT, fieldBelts } from "./belts.js";
import { loadSystem, saveSystem, loadAwakeSystems } from "./persist.js";

const world = new World();

const CLIENT_CONFIG = {
  cells: CELLS,
  stargates: STARGATE_CELLS,
  station: STATION_POS,
  cellApothem: CELL_APOTHEM_KM,
  cellCircumradius: CELL_CIRCUMRADIUS_KM,
  cellCornerRound: CELL_CORNER_ROUND_KM,
  transferRadius: GATE_TRANSFER_RADIUS_KM,
  maxHp: SHIP_HP,
  fuelMaxMs: FUEL_SESSION_MAX_MS,
  fuelStartMs: FUEL_START_MS,
  ores: ORES,
  belt: BELT,
};

export function attachGameServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const origin = req.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) { ws.close(4003, "origin"); return; }
    const user = await getSessionUser(readCookie(req));
    if (!user) { ws.close(4001, "auth"); return; }

    const pid = String(user.id);
    const send = (s) => { if (ws.readyState === ws.OPEN) ws.send(s); };
    let saved = null; try { saved = await loadSystem(pid); } catch (e) { console.error("loadSystem", e); }
    const player = world.addPlayer(pid, user.username, send, saved);
    send(JSON.stringify({ t: "hello", you: { id: pid, name: user.username }, cfg: CLIENT_CONFIG, belts: fieldBelts(player.beltField) }));

    ws.on("message", (buf) => {
      let m; try { m = JSON.parse(buf.toString()); } catch { return; }
      switch (m.t) {
        case "gate": world.cmdGate(pid, m.gate, !!m.open); break;
        case "move": world.cmdMove(pid, m.ships, +m.x, +m.y); break;
        case "chat": world.cmdChat(pid, m.text, m.channel, m.to); break;
      }
    });
    ws.on("close", () => { persist(pid).finally(() => world.removePlayer(pid)); });
    ws.on("error", () => { try { ws.close(); } catch {} });
  });

  const persist = async (pid) => { if (!world.players.has(pid)) return; try { await saveSystem(pid, world.exportState(pid)); } catch (e) { console.error("saveSystem", e); } };
  world.onBeforePurge = (pid) => { const state = world.exportState(pid); saveSystem(pid, state).catch((e) => console.error("saveSystem(purge)", e)); };
  // On boot, bring back anyone whose gate was still running: timers and links keep going, logging off is not an escape.
  loadAwakeSystems().then((rows) => {
    for (const r of rows) { const p = world.addPlayer(String(r.user_id), r.username, () => {}, r.data); p.offline = true; p.offlineSince = Date.now(); }
    if (rows.length) console.log(`[world] restored ${rows.length} offline system(s) awake (running gate or unfinished orders)`);
  }).catch((e) => console.error("loadAwakeSystems", e));
  setInterval(() => { for (const pid of world.players.keys()) persist(pid); }, 10000);

  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    world.tick(dt);
  }, TICK_MS);

  setInterval(() => {
    for (const p of world.players.values()) p.send(JSON.stringify(world.snapshotFor(p)));
  }, SNAPSHOT_MS);

  return wss;
}
