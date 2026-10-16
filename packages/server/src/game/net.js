// The game socket for the 3D world (owner, 2026-10-12). One shared world: every
// connected player is in it, everyone sees everyone. One session per account (a new
// tab replaces the old: 4002). The client only sends commands ({t:"move", x, y}: a
// direction); the server simulates at 20 Hz and sends snapshots at 15 Hz. Deploy
// countdowns and website reloads reach every client here, as before.
import { WebSocketServer } from "ws";
import { readCookie, getSessionUser } from "../sessions.js";
import { SERVER_BUILD, onWebsiteUpdate, onCountdown, activeCountdown, updateStatus } from "../build.js";
import { World3D, inside, RAIL_RANGE, HEX_FLAT, SPHERE_R, SPEED, ACCEL, BRAKE, STOP_D, SPRINT, VEL_TURN, SHIP_R, BLOCK_HALF, BUILD_H, HP_MAX, SH_MAX, buildMsg, SIDE_SPEED, FWD_ARC, TURN_ACCEL, CAP_MAX, CAP_DRAIN, CAP_WALK, CAP_IDLE, CAP_RESUME, LOAD_R, FACTIONS, FAC_DEFAULT } from "./world3d.js";
import { PTR, ptrAs } from "../ptr.js";
import { setGameHooks } from "../admin.js";
import { deviceOf } from "../security.js";
import { pool } from "../db.js";
import { safeText } from "../textsafe.js";
import { Items } from "./items.js";

export function attachGameServer(httpServer) {
  const world = new World3D();
  const items = new Items(world);                // (owner, 2026-10-14) inventories and dropped-item crates
  const sendInv = (pid, ws) => { const s = items.get(pid); if (s) try { ws.send(JSON.stringify({ t: "inv", slots: s })); } catch {} };
  const crateCast = (c, gone) => broadcast(gone ? { t: "crategone", id: c.id } : { t: "crate", c: items.crateMsg(c) });
  setInterval(() => { for (const id of items.expire()) broadcast({ t: "crategone", id }); }, 1000);   // (owner) crates go after 5 minutes
  setInterval(() => { for (const b of world.tickNodes()) objCast("b", b); }, 1000);   // (owner, 2026-10-15) mined-out nodes respawning
  const socks = new Map();                     // account id -> ws
  const devs = new Map();                      // device id -> account id, for the connected sockets
  const mutes = new Map();                     // account id -> { perm, until } (ms), the connected players' chat mutes
  // (owner, 2026-10-13) the admin panel's hooks into the world: who's online, kicks (and bans), mutes; and one account
  // per device (auth.js asks at login; a second account's socket on a device in use is refused below)
  // (owner, 2026-10-14) each connected player's staff role, for the badge by their name in chat (m: moderator, a: admin)
  const builders = new Set();   // (owner, 2026-10-14) connected accounts that can use the Build menu
  const roles = new Map(), badge = (pid) => { const r = roles.get(pid); return r === "mod" ? "m" : r === "head" || r === "admin" ? "a" : undefined; };
  setGameHooks({
    staffChanged: (pid, role) => { roles.set(pid, role || null); const w = socks.get(pid); if (w) { try { w.send(JSON.stringify({ t: "staff" })); } catch {} } },   // (owner, 2026-10-14) made / removed as a moderator: their Admin button follows
    online: () => { const m = new Map(); for (const [pid] of socks) { const p = world.players.get(pid); m.set(pid, { side: p ? p.team : null }); } return m; },
    kick: (pid, code, reason) => { const w = socks.get(pid); if (w) { try { w.close(code, String(reason || "").slice(0, 100)); } catch {} } },
    mute: (pid, m) => { if (m) mutes.set(pid, m); else mutes.delete(pid); },
    // (owner) admin actions in the world: kill / respawn (back near the center), teleports (stopped, 150 m off the other
    // ship); the moved player is told where they are now. note: a line for the player's chat
    respawn: (pid) => { const p = world.respawn(pid); if (p) tell(pid, { t: "teleport", x: p.x, y: p.y }); return !!p; },
    teleportTo: (pid, toPid) => { const q = world.players.get(toPid); if (!q || !world.players.get(pid)) return false; const a = Math.random() * Math.PI * 2;
      const p = world.teleport(pid, q.x + Math.cos(a) * 150, q.y + Math.sin(a) * 150); if (p) tell(pid, { t: "teleport", x: p.x, y: p.y }); return !!p; },
    inWorld: (pid) => world.players.has(pid),
    note: (pid, text) => tell(pid, { t: "chat", ch: "sys", text }),
    deviceBusy: (device, uid) => { const o = devs.get(device); return !!o && o !== String(uid) && socks.has(o); },
  });
  // (owner, 2026-10-13) the last chat lines (everything sent, any channel), kept to go with a report: the reported
  // player's recent lines
  const recent = [];
  const remember = (line) => { recent.push(line); if (recent.length > 500) recent.shift(); };
  const reports = new Map();                   // account id -> recent report times: at most 5 in 10 minutes
  const reportOk = (pid) => { const now = Date.now(), l = (reports.get(pid) || []).filter((t) => now - t < 600_000); if (l.length >= 5) return false; l.push(now); reports.set(pid, l); return true; };
  const tell = (pid, obj) => { const w = socks.get(pid); if (w && w.readyState === w.OPEN) w.send(JSON.stringify(obj)); };
  const muted = (pid) => { const m = mutes.get(pid); return !!m && (m.perm || (m.until && m.until > Date.now())); };

  const wss = new WebSocketServer({
    server: httpServer, path: "/ws", maxPayload: 16 * 1024,
    perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 3 }, serverMaxWindowBits: 13, concurrencyLimit: 4 },
  });

  const toCreators = (obj) => { const msg = JSON.stringify(obj); for (const [pid, c] of socks) if (roles.get(pid) === "head" && c.readyState === c.OPEN) c.send(msg); };   // (owner, 2026-10-15) the head admin's sessions
  const broadcast = (obj) => { const msg = JSON.stringify(obj); for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(msg); };

  // ---- deploys: the 30 s countdown, and "the website switched: reload" ----
  onCountdown((at, head, parts) => { broadcast({ t: "countdown", at, in: Math.max(0, at - Date.now()), parts, head: /^[0-9a-f]{7,40}$/.test(head) ? head : undefined }); console.log("[build] update " + head.slice(0, 7) + " in " + Math.round((at - Date.now()) / 1000) + " s"); });   // head: the commit going live, for the waiting page
  onWebsiteUpdate((v) => { broadcast({ t: "update", web: v }); console.log("[build] website " + v.slice(0, 7) + " live, clients told to reload"); });

  wss.on("connection", async (ws, req) => {
    let user = null;
    try { user = await getSessionUser(readCookie(req)); } catch (e) { console.error("ws auth", e); }
    if (PTR) { const as = new URL(req.url, "http://x").searchParams.get("as"); if (as) user = await ptrAs(as).catch(() => null) || user; }   // (PTR only) ?as=Name tests as another account
    if (!user) { ws.close(4001, "Not logged in"); return; }
    if (user.frozen) { ws.close(4001, "Not available"); return; }
    const pid = String(user.id);
    const device = deviceOf(new URL(req.url, "http://x").searchParams.get("d"));
    if (device && devs.has(device) && devs.get(device) !== pid && socks.has(devs.get(device))) { ws.close(4003, "Another account is playing on this device."); return; }   // (owner) one account per device
    if (device) devs.set(device, pid);
    if (user.mute_perm || (user.mute_until && new Date(user.mute_until) > new Date())) mutes.set(pid, { perm: !!user.mute_perm, until: user.mute_until ? new Date(user.mute_until).getTime() : 0 });

    const old = socks.get(pid);                // (owner) one session per account: the new one replaces the old
    if (old && old !== ws) { try { old.close(4002, "Replaced"); } catch {} }
    socks.set(pid, ws); roles.set(pid, user.role || null); if (["head", "admin", "dev"].includes(user.role)) builders.add(pid);

    // (owner, 2026-10-13) a player joins the world only once they've sent {t:"side", s:"red"|"blue"}: the client sends
    // the remembered side (hello.side) by itself, or shows the picker the first time and when they chose Reset faction
    let joined = false;
    const staff = ["head", "admin"].includes(user.role);   // (owner, 2026-10-13) staff: the Item Creator, item commands (2026-10-14: not moderators)
    // (owner, 2026-10-15) the Object Placer (the Build menu): head admin, admins and developers (a role only the head admin
    // gives); the Object Creator (object types, models, colliders): the head admin only
    const placer = ["head", "admin", "dev"].includes(user.role), creator = user.role === "head";
    let cmds = 0, blockAt = 0, teamAt = 0;                           // rough flood cap: ~40 commands a second
    const cmdReset = setInterval(() => { cmds = 0; }, 1000);

    let saved = null;                          // (owner, 2026-10-13) the side this account chose last time: the client re-joins it unless resetting
    try { saved = await world.savedTeam(pid); } catch (e) { console.error("saved side", e); }
    let ui = {}; if (placer || staff) try { ui = await world.uiGet(pid); } catch (e) { console.error("ui", e); }   // (owner, 2026-10-15) where my editor windows were
    if (socks.get(pid) !== ws || ws.readyState !== ws.OPEN) { clearInterval(cmdReset); if (socks.get(pid) === ws) { socks.delete(pid); mutes.delete(pid); if (device && devs.get(device) === pid) devs.delete(device); } return; }   // closed or replaced meanwhile
    ws.send(JSON.stringify({
      t: "hello", side: saved, build: SERVER_BUILD, countdown: activeCountdown(), updating: updateStatus(), now: Date.now(), ui,
      you: { id: pid, name: user.username, staff: ["head", "admin", "mod"].includes(user.role), builder: placer, creator, items: staff },   // staff: the Admin button; builder: the Object Placer; creator: the Object Creator; items: the Item Creator
      cfg: { factions: FACTIONS, facDefault: FAC_DEFAULT, hpMax: HP_MAX, shMax: SH_MAX, shipR: SHIP_R, blockHalf: BLOCK_HALF, buildH: BUILD_H, loadR: LOAD_R, hexFlat: HEX_FLAT, sphereR: SPHERE_R, speed: SPEED, accel: ACCEL, brake: BRAKE, stopD: STOP_D, sprint: SPRINT, velTurn: VEL_TURN, sideSpeed: SIDE_SPEED, fwdArc: FWD_ARC, turnAccel: TURN_ACCEL, cap: { max: CAP_MAX, drain: CAP_DRAIN, walk: CAP_WALK, idle: CAP_IDLE, resume: CAP_RESUME } },
      // (owner, 2026-10-14) objects come with the load circle (syncObjects), once in the world
      weapons: world.weaponList(), weapon: world.defaultWeapon().id,   // (owner, 2026-10-14) the weapons, and the one this player has
      items: world.itemList(), icons: world.iconList(), types: world.typeList(), sounds: world.soundList(),   // types: (owner, 2026-10-15) the Object Creator's                // (owner, 2026-10-15) the Item Creator's items and icons
      crates: items.crateList(),
      ...(creator ? { assets: world.assetList() } : {}),                // (owner, 2026-10-15) the Importer's assets (head admin)                                       // (owner, 2026-10-14) dropped-item crates
      roster: world.roster(), blocks: [], builds: [], colliders: world.colliders, pivots: world.pivots, origins: world.origins, collExtra: world.collExtra, playerShip: world.playerShip, movers: world.movers, visOutlines: world.visOutlines,
    }));

    items.load(pid).then(() => { if (socks.get(pid) === ws) sendInv(pid, ws); }).catch((e) => console.error("inv", e));   // (owner, 2026-10-14) my hotbar and inventory

    ws.on("message", (data) => {
      if (socks.get(pid) !== ws) return;       // a replaced session: ignore everything it sends
      if (++cmds > 80) return;                 // moves and chat together
      let m; try { m = JSON.parse(String(data)); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "side") {
        if (joined || (m.s !== "red" && m.s !== "blue")) return;   // once per session, and only a real side
        joined = true;
        world.join(pid, user.username, m.s, m.rp === 1).then((me) => {
          if (socks.get(pid) !== ws) return;
          try { ws.send(JSON.stringify({ t: "spawn", x: me.x, y: me.y, s: me.team })); } catch {}
          broadcast({ t: "join", i: pid, n: user.username, s: me.team });
        }).catch((e) => { joined = false; console.error("join", e); });
      }
      else if (m.t === "move") world.setDir(pid, m.x, m.y, m.b, m.h, m.a, m.ta);
      else if (m.t === "fire") world.fire(pid, m.x, m.y);
      else if (m.t === "beam") world.setBeam(pid, m.on === 1, m.x, m.y);   // (owner, 2026-10-15) Blue's laser, held
      else if (m.t === "launch") world.launch(pid, m.x, m.y);              // (owner, 2026-10-15) F: missiles / drones
      else if (m.t === "reload") world.reload(pid);   // (owner, 2026-10-14) R   // (owner, 2026-10-14) the railgun; the world checks it and keeps the cooldown
      else if (m.t === "chat") {               // (owner, 2026-10-13) World (everyone), Faction (your side), Whisper (one player)
        const me = world.players.get(pid); if (!me || typeof m.text !== "string" || muted(pid)) return;   // (owner) a muted player's lines go nowhere
        const text = m.text.slice(0, 240); if (!text.trim()) return;
        const ch = m.ch === "side" ? "side" : m.ch === "whisper" ? "whisper" : "global";
        if (ch === "whisper") {                // to one player by account id; both sides get it, tagged with the other one
          let to = typeof m.to === "string" ? m.to : "";
          if (!to && typeof m.toName === "string") {   // (owner) /whisper Name: an online player by name, any case
            const want = m.toName.trim().toLowerCase().slice(0, 40);
            for (const [qid, q] of world.players) if (socks.has(qid) && String(q.name).toLowerCase() === want) { to = qid; break; }
            if (!to) { ws.send(JSON.stringify({ t: "chat", ch, sys: 1, withName: m.toName.trim().slice(0, 40), text: "offline" })); return; }
          }
          const tws = socks.get(to), tp = world.players.get(to);
          if (!tws || !tp || to === pid) { ws.send(JSON.stringify({ t: "chat", ch, sys: 1, with: to, text: "offline" })); return; }
          const line = { t: "chat", ch, i: pid, n: user.username, s: me.team, r: badge(pid), text };
          tws.send(JSON.stringify({ ...line, with: pid, withName: user.username }));
          ws.send(JSON.stringify({ ...line, with: to, withName: tp.name }));
          remember({ at: Date.now(), i: pid, n: user.username, ch: "whisper", text }); return;
        }
        const msg = JSON.stringify({ t: "chat", ch, i: pid, n: user.username, s: me.team, r: badge(pid), text });
        for (const [qid, qws] of socks) { const q = world.players.get(qid); if (q && qws.readyState === qws.OPEN && (ch === "global" || q.team === me.team)) qws.send(msg); }
        remember({ at: Date.now(), i: pid, n: user.username, ch, text });
      }
      else if (m.t === "report") {             // (owner, 2026-10-13) a player reports another: kept for the admin panel with their recent lines
        if (!reportOk(pid) || typeof m.i !== "string" || m.i === pid || !/^[0-9]{1,15}$/.test(m.i)) return;
        const text = safeText(m.text, 1000); if (!text) return;
        const chat = recent.filter((l) => l.i === m.i).slice(-30).map((l) => ({ at: l.at, ch: l.ch, text: l.text }));
        pool.query(`INSERT INTO reports (reporter, target, target_name, category, text, chat) SELECT $1, id, username, 'player', $3, $4 FROM users WHERE id = $2`, [pid, m.i, text, JSON.stringify(chat)])
          .then(() => ws.send(JSON.stringify({ t: "reported" }))).catch((e) => console.error("report", e));
      }
      else if (m.t === "team") {              // (owner, 2026-10-15) switching faction in the game (at most every 2 s)
        const now = Date.now(); if (!joined || (m.s !== "red" && m.s !== "blue") || now - teamAt < 2000) return; teamAt = now;
        const p = world.setTeam(pid, m.s); if (p) broadcast({ t: "side", i: pid, s: p.team });
      }
      else if (m.t === "enemy") {             // (owner, 2026-10-15) X spawns an enemy ship (at most one a second)
        const now = Date.now(); if (now - blockAt < 1000) return; blockAt = now;
        world.spawnEnemy(pid);
      }
      // (owner, 2026-10-13) the admin Build menu: staff place, edit and delete pieces; everyone is sent the result
      else if (m.t === "bnew" || m.t === "bset" || m.t === "bdel") {
        if (!placer) return;
        const bid = typeof m.id === "string" && /^[0-9]{1,15}$/.test(m.id) ? m.id : null;
        if (m.t === "bnew") {
          const q = Number.isInteger(m.q) ? m.q : 0;
          world.addBuild(m, pid).then((b) => {
            if (!b) return;
            objCast("b", b);
            if (b.k === "ship") broadcast({ t: "join", i: "b" + b.id, n: "Test Ship", s: "test" });   // (owner) its stand-in ship
            if (socks.get(pid) === ws) ws.send(JSON.stringify({ t: "bnew", q, id: b.id }));   // so the builder can select it
          }).catch((e) => console.error("build", e));
        } else if (m.t === "bset") {
          const b = bid && world.setBuild(bid, m); if (b) objCast("b", b);
        } else if (bid) { const wasShip = world.builds.get(bid)?.k === "ship"; world.delBuild(bid).then((ok) => { if (ok) { objGone("b", [bid]); if (wasShip) broadcast({ t: "leave", i: "b" + bid }); } }).catch((e) => console.error("unbuild", e)); }
      }
      else if (m.t === "itemset") {            // (owner, 2026-10-15) the Item Creator: staff change an item (id) or make one (no id)
        if (!staff) return;
        const id = typeof m.id === "string" && /^[0-9]{1,9}$/.test(m.id) ? m.id : null;
        world.setItem(id, m.item).then((o) => {
          if (!o) { try { ws.send(JSON.stringify({ t: "itemsaved", error: "That item can't be saved." })); } catch {} return; }
          broadcast({ t: "items", list: world.itemList() }); try { ws.send(JSON.stringify({ t: "itemsaved", id: o.id })); } catch {}
        }).catch((e) => console.error("item", e));
      }
      else if (m.t === "itemdel") {            // (owner, 2026-10-15) the Item Creator's Delete
        if (!staff) return;
        const id = typeof m.id === "string" && /^[0-9]{1,9}$/.test(m.id) ? m.id : null; if (!id) return;
        world.delItem(id).then((ok) => { if (ok) broadcast({ t: "items", list: world.itemList() }); }).catch((e) => console.error("item del", e));
      }
      else if (m.t === "iset") {               // (owner, 2026-10-14) the Icon Creator: staff save a new icon (or, with an id, change one)
        if (!staff) return;
        const iid = typeof m.id === "string" && /^[0-9]{1,9}$/.test(m.id) ? m.id : null;   // (owner, 2026-10-15) an id: the Icon Editor saving over that icon
        (iid ? world.setIcon(iid, m.icon) : world.addIcon(m.icon, user.username)).then((ic) => {
          if (!ic) { try { ws.send(JSON.stringify({ t: "isaved", error: "That icon can't be saved." })); } catch {} return; }
          broadcast({ t: "icons", list: world.iconList() }); try { ws.send(JSON.stringify({ t: "isaved", id: ic.id })); } catch {}
        }).catch((e) => console.error("icon", e));
      }
      else if (m.t === "icondel") {            // (owner, 2026-10-15) the CREATOR: staff delete an icon nothing uses
        if (!staff) return;
        const id = typeof m.id === "string" && /^[0-9]{1,9}$/.test(m.id) ? m.id : null; if (!id) return;
        world.delIcon(id).then((r) => { if (r.ok) { broadcast({ t: "icons", list: world.iconList() }); if (r.types) broadcast({ t: "types", list: world.typeList() }); if (r.items) broadcast({ t: "items", list: world.itemList() }); if (r.sounds) broadcast({ t: "sounds", list: world.soundList() }); } else if (r.error) try { ws.send(JSON.stringify({ t: "isaved", error: r.error })); } catch {} }).catch((e) => console.error("icon del", e));
      }
      else if (m.t === "ui") { if (placer || staff) world.uiSet(pid, m.k, m.x, m.y).catch((e) => console.error("ui", e)); }   // (owner, 2026-10-15) an editor window moved
      else if (m.t === "pship") {              // (owner, 2026-10-15) the CREATOR: the head admin picks the Ship object players fly (null: the built-in one)
        if (!creator) return;
        const id = m.id === null ? null : typeof m.id === "string" && /^[0-9]{1,9}$/.test(m.id) ? m.id : undefined; if (id === undefined) return;
        world.setPlayerShip(id).then((ok) => { if (ok) broadcast({ t: "pship", id }); }).catch((e) => console.error("player ship", e));
      }
      else if (m.t === "sset") {               // (owner, 2026-10-15) the CREATOR: the head admin makes or changes a sound (SFX / Music Track)
        if (!creator) return;
        const id = typeof m.id === "string" && /^[0-9]{1,9}$/.test(m.id) ? m.id : null;
        world.setSound(id, m.sound).then((o) => {
          try { ws.send(JSON.stringify(o ? { t: "ssaved", id: o.id } : { t: "ssaved", error: "That sound can't be saved." })); } catch {}
          if (o) broadcast({ t: "sounds", list: world.soundList() });
        }).catch((e) => console.error("sound", e));
      }
      else if (m.t === "sdel") {
        if (!creator) return;
        const id = typeof m.id === "string" && /^[0-9]{1,9}$/.test(m.id) ? m.id : null; if (!id) return;
        world.delSound(id).then((ok) => { if (ok) broadcast({ t: "sounds", list: world.soundList() }); }).catch((e) => console.error("sound del", e));
      }
      // (owner, 2026-10-14) the hotbar and inventory: move (swap two slots), give (staff: a copy from the Item Creator),
      // drop (into a crate where the ship is), take (out of a crate within reach); the result goes back as the whole inventory
      // (owner, 2026-10-15) staff also: icrate (an Item Creator item dragged onto the world: a crate of n), idel (delete a
      // slot's stack), icdel (delete a crate's stack)
      else if (["imove", "igive", "idrop", "itake", "icrate", "idel", "icdel"].includes(m.t)) {
        if (["igive", "icrate", "idel", "icdel"].includes(m.t) && !staff) return;
        if (m.t === "imove") items.move(pid, m.from, m.to);
        else if (m.t === "igive") items.give(pid, m.item, m.to, m.n);
        else if (m.t === "idel") items.remove(pid, m.from);
        else if (m.t === "icdel") { const r = items.unstock(m.c, m.i); if (r) crateCast(r.crate, r.gone); }
        else {
          const p = world.players.get(pid); if (!p) return;
          const h = p.h || 0; let x = p.x - Math.sin(h) * 70, y = p.y + Math.cos(h) * 70; if (!inside(x, y)) { x = p.x; y = p.y; }   // (just behind the ship, clear of its hull, so it can be seen)
          if (m.t === "idrop" || m.t === "icrate") {
            const c = m.t === "idrop" ? items.drop(pid, m.from, x, y) : items.spawn(m.item, m.n, x, y); if (c) crateCast(c);
          }
          else { const r = items.take(pid, m.c, m.i, m.to, p.x, p.y); if (r) crateCast(r.crate, r.gone); }
        }
        sendInv(pid, ws);
      }
      // (owner, 2026-10-14) staff delete things in the world by right-click: a crate, a Build piece (bdel above) or a block
      else if (m.t === "cratedel") { if (!placer) return; const id = String(m.id || ""); if (items.del(id)) broadcast({ t: "crategone", id }); }
      else if (m.t === "blockdel") { if (!placer) return; const id = Number(m.id); if (Number.isInteger(id) && world.delBlock(id)) objGone("k", [String(id)]); }
      else if (m.t === "tset") {               // (owner, 2026-10-15) the Object Creator: the head admin changes an object type (id) or makes one
        if (!creator) return;
        const id = typeof m.id === "string" && /^[0-9]{1,9}$/.test(m.id) ? m.id : null;
        world.setType(id, m.type).then((o) => {
          if (!o) { try { ws.send(JSON.stringify({ t: "tsaved", error: "That object can't be saved." })); } catch {} return; }
          broadcast({ t: "types", list: world.typeList() }); try { ws.send(JSON.stringify({ t: "tsaved", id: o.id })); } catch {}
        }).catch((e) => console.error("type", e));
      }
      else if (m.t === "tdel") {
        if (!creator) return;
        const id = typeof m.id === "string" && /^[0-9]{1,9}$/.test(m.id) ? m.id : null; if (!id) return;
        world.delType(id).then((r) => { if (r.ok) broadcast({ t: "types", list: world.typeList() }); else if (r.error) try { ws.send(JSON.stringify({ t: "tsaved", error: r.error })); } catch {} }).catch((e) => console.error("type del", e));
      }
      else if (m.t === "aset") {               // (owner, 2026-10-15) the Importer: the head admin adds an asset (an uploaded file) or changes one (id)
        if (!creator) return;
        const id = typeof m.id === "string" && /^[0-9]{1,9}$/.test(m.id) ? m.id : null;
        world.setAsset(id, m.asset).then((o) => {
          try { ws.send(JSON.stringify(o ? { t: "asaved", id: o.id, n: m.n } : { t: "asaved", error: "That asset can't be saved.", n: m.n })); } catch {}
          if (o) { toCreators({ t: "assets", list: world.assetList() }); if (o.kind === "model") broadcast({ t: "types", list: world.typeList() }); }
        }).catch((e) => console.error("asset", e));
      }
      else if (m.t === "adel") {
        if (!creator) return;
        const id = typeof m.id === "string" && /^[0-9]{1,9}$/.test(m.id) ? m.id : null; if (!id) return;
        world.delAsset(id).then((r) => { if (r.ok) { toCreators({ t: "assets", list: world.assetList() }); if (r.types) broadcast({ t: "types", list: world.typeList() }); } else if (r.error) try { ws.send(JSON.stringify({ t: "asaved", error: r.error })); } catch {} }).catch((e) => console.error("asset del", e));
      }
      else if (m.t === "coll") {               // (owner, 2026-10-14) the Object Editor: staff change a kind's collider outline
        if (!creator) return;
        world.setCollider(m.k, m.parts, m.pv, m.mv, m.vis, m.wo, m.ex).then((c) => { if (c) broadcast({ t: "coll", k: m.k, parts: c.parts, pv: c.pv, mv: c.mv, vis: c.vis, wo: c.wo, ex: c.ex }); }).catch((e) => console.error("collider", e));
      }
      else if (m.t === "ping") { try { ws.send(JSON.stringify({ t: "pong", ts: m.ts })); } catch {} }
    });

    ws.on("close", () => {
      clearInterval(cmdReset);
      if (socks.get(pid) !== ws) return;       // replaced: the newer socket owns the player now
      socks.delete(pid); mutes.delete(pid); roles.delete(pid); builders.delete(pid);
      if (device && devs.get(device) === pid) devs.delete(device);
      if (!joined) return;
      world.leave(pid).then(() => broadcast({ t: "leave", i: pid })).catch((e) => console.error("leave", e));
    });
    ws.on("error", (e) => console.error("ws", e.message));
  });

  // ---- (owner, 2026-10-14) objects (Build pieces "b", blocks "k") are sent only to players whose load circle reaches
  // them: each socket keeps the ids it has been sent (ws.known), topped up and trimmed twice a second as ships move ----
  const msgOf = (kind, o) => kind === "b" ? { t: "build", o: buildMsg(o) } : { t: "block", b: [o.id, o.x, o.y] };
  const goneOf = (kind, ids) => kind === "b" ? ids.map((id) => ({ t: "unbuild", id })) : [{ t: "block", gone: ids.map(Number) }];
  const reach = (p, kind, o) => Math.hypot(o.x - p.x, o.y - p.y) - (kind === "b" ? o.far : BLOCK_HALF * 1.5) <= LOAD_R;
  const sockOf = (ws) => { if (!ws.known) ws.known = { b: new Set(), k: new Set() }; return ws.known; };
  function objCast(kind, o) {                  // a new or changed object: to whoever has it or can now see it
    const id = String(o.id); let msg = null;
    for (const [qid, qws] of socks) {
      const p = world.players.get(qid); if (!p || qws.readyState !== qws.OPEN) continue;
      const k = sockOf(qws)[kind];
      if (k.has(id) || reach(p, kind, o)) { k.add(id); qws.send(msg || (msg = JSON.stringify(msgOf(kind, o)))); }   // (written once, sent to each)
    }
  }
  function objGone(kind, ids) {                // removed objects: to whoever had them
    for (const [, qws] of socks) {
      if (qws.readyState !== qws.OPEN) continue; const k = sockOf(qws)[kind], had = ids.filter((id) => k.delete(id));
      for (const m of had.length ? goneOf(kind, had) : []) qws.send(JSON.stringify(m));
    }
  }
  function syncObjects() {
    for (const [pid, ws] of socks) {
      const p = world.players.get(pid); if (!p || ws.readyState !== ws.OPEN) continue;
      const known = sockOf(ws), out = [];
      for (const [kind, list] of [["b", world.builds.values()], ["k", world.blocks]]) {
        const k = known[kind], seen = new Set();
        for (const o of list) { const id = String(o.id); if (!reach(p, kind, o)) continue; seen.add(id); if (!k.has(id)) { k.add(id); out.push(msgOf(kind, o)); } }
        const drop = [...k].filter((id) => !seen.has(id)); for (const id of drop) k.delete(id);
        if (drop.length) out.push(...goneOf(kind, drop));
      }
      if (out.length) ws.send(JSON.stringify({ t: "batch", m: out }));
    }
  }
  setInterval(syncObjects, 500);

  const hadOrd = new Set();                    // sockets last sent a non-empty ordnance list
  setInterval(() => {                                                           // 20 Hz simulation
    world.step();
    for (const e of world.joined) broadcast({ t: "join", i: e.id, n: e.name, s: e.team }); world.joined.length = 0;   // (owner, 2026-10-15) X's enemies
    for (const id of world.left) broadcast({ t: "leave", i: id }); world.left.length = 0;
    if (world.ords.length || world.booms.length || hadOrd.size) {   // (owner, 2026-10-15) missiles / drones near each player, and blasts
      for (const [pid, ws] of socks) {
        const p = world.players.get(pid); if (!p || ws.readyState !== ws.OPEN) continue;
        const R = LOAD_R, o = world.ords.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) <= R).map((q) => [q.id, q.k === "drone" ? 1 : 0, Math.round(q.x * 10), Math.round(q.y * 10), Math.round(q.h * 100)]);
        const b = world.booms.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) <= R).map((q) => [Math.round(q.x), Math.round(q.y), Math.round(q.r), q.k === "drone" ? 1 : 0, q.h ?? null, q.z || null]);   // z: a drone's zap, to its target
        if (!o.length && !b.length && !hadOrd.has(pid)) continue;
        ws.send(JSON.stringify({ t: "ord", o, ...(b.length ? { b } : {}) }));
        if (o.length) hadOrd.add(pid); else hadOrd.delete(pid);
      }
      for (const pid of hadOrd) if (!socks.has(pid)) hadOrd.delete(pid);
      world.booms.length = 0;
    }
    if (world.hits.length) {                   // (owner, 2026-10-14) impacts: to the players whose load circle has them
      for (const [pid, ws] of socks) {
        const p = world.players.get(pid); if (!p || ws.readyState !== ws.OPEN) continue;
        const near = world.hits.filter((h) => Math.hypot(h.x - p.x, h.y - p.y) <= LOAD_R)
          .map((h) => ({ t: "hit", x: Math.round(h.x), y: Math.round(h.y), s: h.s, a: h.a, b: h.b, dx: Math.round(h.dx * 100) / 100, dy: Math.round(h.dy * 100) / 100, ...(h.sa ? { sa: 1 } : {}), ...(h.sb ? { sb: 1 } : {}) }));
        if (near.length) ws.send(JSON.stringify(near.length === 1 ? near[0] : { t: "batch", m: near }));   // (one message a tick, owner 2026-10-15)
      }
      world.hits.length = 0;
    }
    if (world.projEv.length) {                 // (owner, 2026-10-14) railgun projectiles starting / ending, to the players near them
      const r1 = (v) => Math.round(v * 10) / 10;
      for (const [pid, ws] of socks) {
        const p = world.players.get(pid); if (!p || ws.readyState !== ws.OPEN) continue;
        const out = world.projEv.filter((e) => Math.hypot(e.x - p.x, e.y - p.y) <= LOAD_R + (e.t === "proj" ? RAIL_RANGE : 0))
          .map((e) => (e.t === "proj" ? { t: "proj", i: e.i, a: e.a, x: r1(e.x), y: r1(e.y), vx: r1(e.vx), vy: r1(e.vy), ...(e.k ? { k: e.k } : {}) } : { t: "pend", i: e.i, x: r1(e.x), y: r1(e.y), h: e.h, s: e.s, ...(e.sh ? { sh: 1 } : {}) }));
        if (out.length) ws.send(JSON.stringify({ t: "batch", m: out }));
      }
      world.projEv.length = 0;
    }
  }, 50);
  // (owner, 2026-10-14) for builders: where each test ship heading back to its route is going (drawn as a leash), 3 a second
  setInterval(() => {
    const g = []; for (const p of world.players.values()) if (p.bot && p.ai && p.ai.goal) g.push([p.id, Math.round(p.ai.goal.x), Math.round(p.ai.goal.y)]);
    for (const [pid, ws] of socks) { if (ws.readyState !== ws.OPEN || !builders.has(pid)) continue; const me = world.players.get(pid); if (!me) continue;
      const msg = JSON.stringify({ t: "botgoals", g: g.filter(([id]) => { const q = world.players.get(id); return q && Math.hypot(q.x - me.x, q.y - me.y) <= LOAD_R; }) });
      if (msg !== ws.lastGoals) { ws.lastGoals = msg; ws.send(msg); } }   // (owner, 2026-10-15) only when they change
  }, 333);
  // 15 Hz snapshots, each player's own: only what's inside their load circle (owner, 2026-10-13)
  // (owner, 2026-10-15: less traffic) as changes since the last one this socket got: p, the ships whose row changed (or
  // that just came into range); u, the ids of the ones exactly as before; nothing changed at all: { same: 1 }. A ship in
  // neither has left the load circle. The client rebuilds the full list from what it had.
  setInterval(() => {
    const ts = Date.now();
    for (const [pid, ws] of socks) {
      const p = world.players.get(pid); if (!p || ws.readyState !== ws.OPEN) continue;
      const rows = world.snapshotFor(p), last = ws.lastSnap || new Map(), now = new Map(), ch = [], un = [];
      for (const r of rows) { const id = r[0], key = r.join(","); now.set(id, key); if (last.get(id) === key) un.push(id); else ch.push(r); }
      ws.lastSnap = now;
      ws.send(JSON.stringify(!ch.length && un.length === last.size ? { t: "snap", ts, same: 1 } : { t: "snap", ts, p: ch, u: un }));
    }
  }, 66);
  setInterval(() => {                                                           // each player's own capacitor, 4 Hz, to them only
    for (const [pid, ws] of socks) { const p = world.players.get(pid); if (!p || ws.readyState !== ws.OPEN) continue;
      const msg = JSON.stringify({ t: "cap", c: Math.round((p.cap ?? CAP_MAX) * 10) / 10, o: p.capOut ? 1 : 0 }); if (msg !== ws.lastCap) { ws.lastCap = msg; ws.send(msg); } }   // (owner, 2026-10-15) only when it changes
  }, 250);

  console.log("3D world attached at /ws (hex " + Math.round(HEX_FLAT) + " m flat to flat)");
}
