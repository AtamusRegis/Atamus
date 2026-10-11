// The game socket: one session per account, a few commands in, snapshots out at 15 Hz.
import { WebSocketServer } from "ws";
import { config } from "../config.js";
import { getSessionUser, readCookie } from "../sessions.js";
import { World } from "./world.js";
import { TICK_MS, SNAPSHOT_MS, SHIP_TYPES, EXPANSE_APOTHEM_KM, AU_KM, DRONE } from "./constants.js";
import { celestialsForClient } from "./celestials.js";
import { setGameHooks, isUnlocked, muteOf, logAction } from "../admin.js";
import { staffIds, storeNote, unreadNoteCount, saveStaffLine, mentioned, STAFF_ROLES, HIGH_ROLES } from "../staff.js";
import { personaOf } from "../personas.js";
import { loadSystem, saveSystem, loadPois, savePoi, deletePoi, loadAccounts, loadAdminDms, saveAdminDm, deleteAdminDm, setFrozenRow, userByName, roleOf } from "./persist.js";
import { scan } from "../namefilter.js";
import { flagLine, HEAT_MAX } from "../language.js";
import { onAppealLine, subscribers } from "../appeals.js";
import { hears } from "../relations.js";
import { onRelAppeal } from "../relappeals.js";
import { onTicket } from "../tickets.js";
import { ORES } from "./belts.js";
import { MODULES } from "./modules.js";
import { DOCK_KM } from "./station.js";
import { SERVER_BUILD, onWebsiteUpdate, onCountdown, activeCountdown } from "../build.js";
import { PTR, devCommand, ptrAs } from "../ptr.js";
import { getState } from "../pilots.js";

const world = new World();
const conns = new Map();   // pid -> sockets; one session per account: a new tab or device replaces the old one
const CLIENT_CONFIG = { expanseApothemKm: EXPANSE_APOTHEM_KM, auKm: AU_KM, shipTypes: SHIP_TYPES, ores: ORES, modules: MODULES, dockKm: DOCK_KM, drone: DRONE, celestials: celestialsForClient() };

export function attachGameServer(httpServer) {
  const sendTo = (pid, o) => { const s = JSON.stringify(o); for (const c of conns.get(pid) || []) if (c.readyState === c.OPEN && !c.replaced) c.send(s); };
  // (owner) admin DMs: an admin (with the panel open) messages an online player; the player's side is a window of its own
  // that they can't close, until the admin ends it. One admin conversation per player (kept in memory).
  // (owner) the admin is shown by their admin profile (personas.js), resolved when sent: a changed profile changes old lines
  const admDm = new Map();                              // player pid -> { admin, name, log: [{ from, text, ts, a (an admin's line: their account) }], frozen, graceAt }
  const pName = (adminPid) => (personaOf(adminPid) || {}).name || "Admin";
  const pOut = (adminPid) => { const pe = personaOf(adminPid) || {}; return { name: pe.name || "Admin", pic: pe.pic || 1, key: pe.key || "", rank: pe.rank || "admin" }; };
  const viewLog = (d) => d.log.map((l) => { if (!l.a) return { from: l.from, text: l.text, ts: l.ts }; const pe = pOut(String(l.a)); return { from: pe.name, text: l.text, ts: l.ts, key: pe.key, pic: pe.pic, rank: pe.rank }; });
  const saveDm = (pid) => { const d = admDm.get(pid); (d ? saveAdminDm(pid, { ...d, adminName: pName(d.admin) }) : deleteAdminDm(pid)).catch((e) => console.error("admin dm", e)); };
  loadAdminDms().then((rows) => { for (const r of rows) admDm.set(String(r.player_id), { admin: String(r.admin_id), name: r.player_name, log: (r.log || []).map((l) => (l.a || l.from !== r.admin_name ? l : { ...l, a: String(r.admin_id) })), frozen: !!r.frozen }); }).catch((e) => console.error("admin dms", e));
  const onlineByName = (name) => { if (typeof name !== "string" || name.length > 40) return null; for (const p of world.players.values()) if (!p.offline && p.name.toLowerCase() === name.toLowerCase()) return { id: p.id, name: p.name }; return null; };
  const cleanText = (t) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, 500) : "");
  const dmFor = (adminPid, name) => { for (const [pid, d] of admDm) if (d.admin === adminPid && d.name.toLowerCase() === String(name).toLowerCase()) return [pid, d]; return [null, null]; };
  // (owner) an admin opens a DM with a player (by name, online or not): both windows open at once
  async function admStart(pid, to) {
    if (!isUnlocked(pid) || !personaOf(pid) || typeof to !== "string" || to.length > 40) return null;
    const t = onlineByName(to) || await userByName(to); if (!t || t.id === pid) return null;
    let d = admDm.get(t.id);
    if (d && d.admin !== pid) { sendTo(d.admin, { t: "admend", with: d.name }); if (d.frozen) logAction(pid, pName(pid), t.id, t.name, "freeze taken over", "", { from: pName(d.admin) }).catch(() => {}); }   // another admin takes it over (and the freeze with it)
    if (!d || d.admin !== pid) { d = { admin: pid, name: t.name, log: d ? d.log : [], frozen: !!(d && d.frozen) }; admDm.set(t.id, d); saveDm(t.id); if (d.frozen) setFrozenRow(t.id, true, pid).catch(() => {}); }
    const pe = pOut(pid);
    sendTo(t.id, { t: "admopen", admin: pe.name, pic: pe.pic, key: pe.key, log: viewLog(d) }); sendTo(pid, { t: "admopen", with: d.name, log: viewLog(d), frozen: !!d.frozen });
    return [t.id, d];
  }
  async function admSay(pid, name, m) {
    const text = cleanText(m.text); if (!text) return;
    if (typeof m.to === "string" && isUnlocked(pid) && personaOf(pid)) {    // an admin to a player
      let [to, d] = dmFor(pid, m.to); if (!d) { const r = await admStart(pid, m.to); if (!r) return; [to, d] = r; }
      const pe = pOut(pid), line = { from: pe.name, text, ts: Date.now() }; d.log.push({ ...line, a: pid }); if (d.log.length > 100) d.log.shift(); saveDm(to);
      sendTo(to, { t: "admdm", ...line, key: pe.key, pic: pe.pic, rank: pe.rank, admin: pe.name }); sendTo(pid, { t: "admdm", ...line, key: pe.key, pic: pe.pic, rank: pe.rank, with: d.name });
      chatLine({ ch: "admin", fromId: pid, aid: pid, from: pe.name, toId: to, to: d.name, text });
      return;
    }
    const d = admDm.get(pid); if (!d) return;            // the player answering
    const pe = pOut(d.admin), line = { from: name, text, ts: Date.now() }; d.log.push(line); if (d.log.length > 100) d.log.shift(); saveDm(pid);
    sendTo(pid, { t: "admdm", ...line, admin: pe.name }); sendTo(d.admin, { t: "admdm", ...line, with: d.name });
    chatLine({ ch: "admin", fromId: pid, from: name, toId: d.admin, toAid: d.admin, to: pe.name, text });
  }
  // (owner) Freeze is a box in the admin's DM: no reason needed (it's logged); it lasts while that admin is around with the DM open
  async function setFreeze(playerPid, on, by, note = "") {
    const d = admDm.get(playerPid); if (d) { d.frozen = on; d.graceAt = null; saveDm(playerPid); sendTo(d.admin, { t: "admstate", with: d.name, frozen: on }); }
    await setFrozenRow(playerPid, on, by.id);
    world.setFrozen(playerPid, on); sendTo(playerPid, { t: "frozen", on });
    const name = (d && d.name) || (world.players.get(playerPid) || {}).name || "?";
    await logAction(by.id, by.name, playerPid, name, on ? "freeze" : "unfreeze", note).catch((e) => console.error("freeze log", e));
  }
  async function admFreeze(pid, m) {
    if (!isUnlocked(pid) || !personaOf(pid)) return;
    let [to, d] = dmFor(pid, m.to); if (!d) { const r = await admStart(pid, m.to); if (!r) return; [to, d] = r; }
    if (!!m.on === !!d.frozen) return;
    if (m.on && await roleOf(to)) { sendTo(pid, { t: "admstate", with: d.name, frozen: false }); return; }   // (owner) staff can't freeze staff
    await setFreeze(to, !!m.on, { id: pid, name: pName(pid) });
  }
  async function admEnd(pid, m) {                      // (owner) closing the DM ends it, and thaws the player
    const [to, d] = dmFor(pid, m.to); if (!d) return;
    if (d.frozen) await setFreeze(to, false, { id: pid, name: pName(pid) }, "admin DM closed");
    admDm.delete(to); saveDm(to); sendTo(to, { t: "admend" }); sendTo(pid, { t: "admend", with: d.name });
  }
  // (owner) the freezing admin gone (logged off) for 5 minutes: the player thaws. A frozen player back before the admin starts
  // the same 5 minutes.
  const THAW_MS = 5 * 60_000;
  setInterval(() => {
    const now = Date.now();
    for (const [pid, d] of admDm) {
      if (!d.frozen) continue;
      if (conns.has(d.admin)) { d.graceAt = null; continue; }
      if (!d.graceAt && (conns.has(pid) || d.wasOnline)) d.graceAt = now;
      if (d.graceAt && now - d.graceAt > THAW_MS) setFreeze(pid, false, { id: d.admin, name: pName(d.admin) }, "admin away 5 minutes").catch((e) => console.error("thaw", e));
    }
  }, 10_000);
  // (owner) a player's ships as named right now (their pilot, the ship's name, its hull), saved with a kick, ban or report
  const shipNamesOf = (pid) => world.shipsOf(pid).map((sh) => { const pl = ((world.players.get(pid) || {}).pilots || []).find((x) => x.id === sh.pilot); return { pilot: pl ? pl.name : sh.pilot, ship: sh.name || (pl ? pl.name + "'s " : "") + (SHIP_TYPES[sh.type] || {}).name, hull: (SHIP_TYPES[sh.type] || {}).name }; });
  // (owner) the last hour of chat (Local, Corp, DMs and admin DMs), saved with a kick, a ban or a report on a player
  const CHAT_KEEP_MS = 3600_000, chatBuf = [];
  function chatLine(l) { chatBuf.push({ ts: Date.now(), ...l }); while (chatBuf.length && chatBuf[0].ts < Date.now() - CHAT_KEEP_MS) chatBuf.shift(); if (chatBuf.length > 20000) chatBuf.shift(); }
  world.onLine = (l) => chatLine(l);
  function chatLogFor(pid) {                            // Local and Corp (everyone's), and the player's own DMs and admin DMs
    const since = Date.now() - CHAT_KEEP_MS;
    return chatBuf.filter((l) => l.ts >= since && (l.ch === "local" || l.ch === "corp" || l.fromId === pid || l.toId === pid)).slice(-600)
      .map((l) => ({ ts: l.ts, ch: l.ch, from: l.from, ...(l.to ? { to: l.to } : {}), ...(l.aid ? { aid: l.aid } : {}), ...(l.toAid ? { toAid: l.toAid } : {}), text: l.text }));   // (an admin's lines keep who: shown as their profile when read)
  }
  // (owner) the admin panel: who's online, kicking (a message, then the socket closes), and a player's pilots changed
  // (owner) muted players: no Local, Corp or DMs (an admin conversation still works) until it ends
  const mutes = new Map();                              // pid -> { perm, until (ms), reason }
  const mutedNow = (pid) => { const m = mutes.get(pid); if (!m) return null; if (!m.perm && m.until <= Date.now()) { mutes.delete(pid); return null; } return m; };
  // (owner) staff notifications: a line in the Admin chat for staff online with the panel unlocked, else kept in their
  // Notifications (the Admin button's red count) for when they're back
  async function deliver(id, kind, text, ref) {
    if (conns.has(id) && isUnlocked(id)) { sendTo(id, { t: "staffsys", kind, text, ref, ts: Date.now() }); return; }
    await storeNote(id, kind, text, ref); if (conns.has(id)) sendTo(id, { t: "staffnotes", n: await unreadNoteCount(id) });
  }
  async function staffNotify(roles, kind, text, ref = null, except = null) {
    try { for (const id of await staffIds(roles)) if (id !== except) await deliver(id, kind, text, ref); } catch (e) { console.error("staff notify", e); }
  }
  // (owner) the Admin chat: staff talk under their admin profiles; "@name" pings that staff member (kept for them if away)
  async function staffSay(pid, raw) {
    const pe = isUnlocked(pid) && personaOf(pid), text = cleanText(raw); if (!pe || !text) return;
    await saveStaffLine(pid, text);
    const msg = { t: "chat", ch: "staff", from: pe.name, admin: pe.key, pic: pe.pic, rank: pe.rank || "admin", text, ts: Date.now() };
    for (const id of conns.keys()) if (isUnlocked(id)) sendTo(id, msg);
    for (const id of await mentioned(text)) if (id !== pid && !(conns.has(id) && isUnlocked(id))) { await storeNote(id, "mention", pe.name + ": " + text, { tab: "staffchat" }); if (conns.has(id)) sendTo(id, { t: "staffnotes", n: await unreadNoteCount(id) }); }
  }
  // (owner) every Local / Corp line goes through the filter; flagged ones are kept for the admins (never DMs); a player's
  // language running hot is a notification for the Admins and the Head Admin
  world.onChat = (p, ch, text) => { if (ch === "dm") return; const r = scan(text); if (r.bad) flagLine(p.id, p.name, ch, text, r.cats, r.words).then((h) => {
    for (const id of conns.keys()) if (isUnlocked(id)) sendTo(id, { t: "chatflag" });
    if (h.alert) staffNotify(HIGH_ROLES, "language", "High profanity: " + p.name + " (" + Math.min(HEAT_MAX, Math.round(h.heat * 10) / 10) + "): " + text, { player: p.id, tab: "high" });
  }).catch((e) => console.error("chat flag", e)); };
  // (owner) a new line in a ban appeal: the admins subscribed to it (not the one who wrote it)
  onAppealLine(async (appealId, name, text, except) => {
    for (const id of await subscribers(appealId)) if (id !== except) await deliver(id, "appeal", "Appeal · " + name + ": " + text, { appeal: appealId });
  });
  // (owner) mutes and blocks: a player doesn't get the chat lines or DMs of someone they muted or blocked
  world.hears = hears;
  // (owner) a mute / block appeal changed: both players are told; a player's line is a notification for the staff. A support
  // ticket's new line: its player (an admin's answer) or the staff (the player's)
  onRelAppeal((id, players, fromPlayer) => { for (const p of players) sendTo(p, { t: "relappeal", id }); if (fromPlayer) staffNotify(STAFF_ROLES, "relappeal", "Mute / block appeal: a new line", { relappeal: id }); });
  onTicket((id, uid, fromAdmin, subject) => { if (fromAdmin) { if (uid) sendTo(uid, { t: "ticket", id, subject }); } else staffNotify(STAFF_ROLES, "ticket", "Support: " + subject, { ticket: id }); });
  setGameHooks({
    modSuspended: async (uid) => { for (const [pid2, d] of [...admDm]) if (d.admin === uid) await admEnd(uid, { to: d.name }).catch((e) => console.error("susp dm", e)); },
    staffNotify: (roles, kind, text, ref) => staffNotify(roles, kind, text, ref),
    // (owner) an admin's profile changed: everyone's chat shows their lines (old ones too) under the new one
    persona: (uid, pe) => { const msg = JSON.stringify({ t: "adminprofile", key: pe.key, name: pe.name, pic: pe.pic, rank: pe.rank || "admin" }); for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(msg);
      for (const [pid2, d] of admDm) if (d.admin === String(uid)) saveDm(pid2); },
    renameRequired: async (pid) => { sendTo(pid, { t: "renamereq" }); if (world.players.has(pid)) { try { const st = await getState(pid); world.setPilots(pid, st.pilots); } catch {} } },
    renamed: (pid, name) => { world.renamePlayer(pid, name); sendTo(pid, { t: "renamereq" }); },
    mute: (pid, m) => { if (m) mutes.set(pid, m); else mutes.delete(pid); },
    freeze: async (pid, on, by) => { await setFreeze(pid, on, by); },   // (the panel: unfreeze)
    chatLog: (pid) => chatLogFor(String(pid)),
    shipNames: (pid) => shipNamesOf(String(pid)),
    online: () => new Set(conns.keys()),
    kick: (pid, code, msg) => { for (const c of conns.get(pid) || []) { try { c.send(JSON.stringify(msg)); c.close(code, msg.t); } catch {} } },
    refreshPilots: async (pid) => { if (!world.players.has(pid)) return; try { const st = await getState(pid); world.setPilots(pid, st.pilots); } catch (e) { console.error("admin refresh", e); } },
  });
  const wss = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: 16 * 1024, perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 3 }, serverMaxWindowBits: 13, concurrencyLimit: 4 } });
  onCountdown((at, head, parts) => { const msg = JSON.stringify({ t: "countdown", at, in: Math.max(0, at - Date.now()), parts }); for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(msg); console.log("[build] update " + head.slice(0, 7) + " in " + Math.round((at - Date.now()) / 1000) + " s"); });
  // a new website build is live: tell every connected client to reload now
  onWebsiteUpdate((v) => { const msg = JSON.stringify({ t: "update", web: v }); for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(msg); console.log("[build] website " + v.slice(0, 7) + " live, clients told to reload"); });

  wss.on("connection", async (ws, req) => {
    const origin = req.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) { ws.close(4003, "origin"); return; }
    let user = await getSessionUser(readCookie(req));
    if (PTR) { const as = new URL(req.url || "/", "http://ptr").searchParams.get("as"); if (as) user = await ptrAs(as); }   // (PTR only: a second test account)
    if (!user) { ws.close(4001, "auth"); return; }

    const pid = String(user.id);
    const send = (s) => { if (ws.readyState === ws.OPEN) ws.send(s); };
    if (!conns.has(pid)) conns.set(pid, new Set());
    const mine = conns.get(pid);
    for (const old of mine) { old.replaced = true; try { old.close(4002, "elsewhere"); } catch {} }   // signed in elsewhere: the old session ends
    mine.add(ws);
    const sendAll = (s) => { for (const c of mine) if (!c.replaced && c.readyState === c.OPEN) c.send(s); };
    const inMemory = world.players.has(pid);               // a reload within the grace: memory is the truth
    let saved = null; if (!inMemory) try { saved = await loadSystem(pid); } catch (e) { console.error("loadSystem", e); }
    if (ws.readyState !== ws.OPEN) { mine.delete(ws); if (!mine.size) conns.delete(pid); return; }   // left while loading
    let st0 = null; try { st0 = await getState(user.id); } catch (e) { console.error("pilots", e); }
    if (ws.readyState !== ws.OPEN) { mine.delete(ws); if (!mine.size) conns.delete(pid); return; }
    const player = world.addPlayer(pid, user.username, sendAll, saved, st0 ? st0.pilots : []);
    player.portrait = st0 && st0.profile.portrait;          // the account's character: who you are in chat
    player.heavy = new Map();                              // a new session gets the whole fit / holds / hangar again
    // a pilot made or gone while you play (the client says so; and once a minute anyway)
    const refreshPilots = async () => { try { const st = await getState(user.id); world.setPilots(pid, st.pilots); player.portrait = st.profile.portrait; } catch (e) { console.error("pilots", e); } };
    const pilotTimer = setInterval(refreshPilots, 60000);
    ws.on("close", () => {
      clearInterval(pilotTimer); mine.delete(ws);
      if (mine.size) return;                                 // replaced by a newer session: it carries on
      conns.delete(pid); persist(pid).finally(() => { if (!conns.has(pid)) world.removePlayer(pid); });
    });
    const fl = world.fieldsFor(player); player.fieldSig = fl.sig; player.poiSig = world.poiSig(player);
    send(JSON.stringify({ t: "hello", build: SERVER_BUILD, countdown: activeCountdown(), you: { id: pid, name: user.username }, cfg: CLIENT_CONFIG, pois: world.poisFor(player), belts: fl.fields }));
    { const d = admDm.get(pid), frozen = !!(user.frozen && d && d.frozen);   // (owner) still frozen (only while an admin DM holds it)
      if (user.frozen && !frozen) setFrozenRow(pid, false, null).catch(() => {});
      world.setFrozen(pid, frozen); if (frozen) { send(JSON.stringify({ t: "frozen", on: true })); d.wasOnline = true; } }
    { const mu = muteOf(user); if (mu) mutes.set(pid, { perm: mu.perm, until: mu.until ? new Date(mu.until).getTime() : 0, reason: mu.reason }); else mutes.delete(pid); }
    { const d = admDm.get(pid); if (d) { const pe = pOut(d.admin); send(JSON.stringify({ t: "admopen", admin: pe.name, pic: pe.pic, key: pe.key, log: viewLog(d) })); } }   // an admin conversation still open
    for (const [to, d] of admDm) if (d.admin === pid) send(JSON.stringify({ t: "admopen", with: d.name, log: viewLog(d), frozen: !!d.frozen }));


    let budget = 40, budgetAt = Date.now();                 // flood guard: ~40 commands a second, extras dropped
    ws.on("message", (buf) => {
      if (ws.replaced) return;                              // nothing from a session that's been replaced
      const now = Date.now(); budget = Math.min(40, budget + (now - budgetAt) * 0.04); budgetAt = now;
      if (budget < 1) return; budget--;
      let m; try { m = JSON.parse(buf.toString()); } catch { return; }
      if (!m || typeof m !== "object" || typeof m.t !== "string") return;
      if (world.frozen.has(pid) && m.t !== "view" && m.t !== "adm") return;   // (owner) frozen: nothing but looking around and answering the admin
      try {
        switch (m.t) {
          case "move": world.cmdMove(pid, m.ship, m.x, m.y); break;
          case "view": world.cmdView(pid, m.x, m.y, m.w); break;
          case "pilots": refreshPilots(); break;
          case "torder": world.cmdTargetOrder(pid, m.ship, m.order); break;
          case "chat": {
            if (m.channel === "staff") { staffSay(pid, m.text).catch((e) => console.error("staff chat", e)); break; }   // (owner) the Admin chat
            // (owner) an admin's Admin switch: they speak under their admin profile (no ship says it); a DM becomes an admin DM
            if (m.as === "admin") { const pe = isUnlocked(pid) && personaOf(pid); if (!pe) break;
              if (m.channel === "dm") admSay(pid, pe.name, { to: m.to, text: m.text }).catch((e) => console.error("adm", e));
              else world.cmdChat(pid, m.text, m.channel, null, null, pe);
              break; }
            const mu = mutedNow(pid);
            if (mu) { send(JSON.stringify({ t: "notice", text: mu.perm ? "You're muted." : "You're muted until " + new Date(mu.until).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC." })); break; }   // (owner) muted
            world.cmdChat(pid, m.text, m.channel, m.to, m.ship); break;
          }
          case "adm": admSay(pid, (world.players.get(pid) || {}).name || user.username, m).catch((e) => console.error("adm", e)); break;
          case "admstart": admStart(pid, m.to).catch((e) => console.error("admstart", e)); break;
          case "admfreeze": admFreeze(pid, m).catch((e) => console.error("admfreeze", e)); break;
          case "admend": admEnd(pid, m).catch((e) => console.error("admend", e)); break;
          case "align": world.cmdAlign(pid, m.ship, m.poi); break;
          case "warp": world.cmdWarp(pid, m.ship, m.poi); break;
          case "lock": world.cmdLock(pid, m.ship, m.kind, m.id); break;
          case "unlock": world.cmdUnlock(pid, m.ship, m.kind, m.id); break;
          case "chase": world.cmdChase(pid, m.ship, m.kind, m.id, m.mode); break;
          case "info": world.cmdInfo(pid, m.kind, m.id); break;
          case "rename": world.cmdRename(pid, m.ship, m.name); break;
          case "fit": world.cmdFit(pid, m.ship, m.item, m.kind, m.slot); break;
          case "unfit": world.cmdUnfit(pid, m.ship, m.kind, m.slot); break;
          case "module": world.cmdModule(pid, m.ship, m.slot, !!m.on); break;
          case "power": world.cmdPower(pid, m.ship, m.kind, m.slot, !!m.on); break;
          case "dock": world.cmdDock(pid, m.ship, m.where); break;
          case "undock": world.cmdUndock(pid, m.ship); break;
          case "board": world.cmdBoard(pid, m.ship, !!m.on); break;
          case "transfer": world.cmdTransfer(pid, m.from, m.to, m.item, m.qty); break;
          case "dev": if (PTR) devCommand(world, pid, m); break;
        }
      } catch (e) { console.error("command " + m.t, e); }
    });
    ws.on("error", () => { try { ws.close(); } catch {} });
  });

  const lastSaved = new Map();                            // pid -> JSON last written: skip the write when nothing changed
  const persist = async (pid) => {
    if (!world.players.has(pid)) return;
    const json = JSON.stringify(world.exportState(pid)); if (lastSaved.get(pid) === json) return;
    try { await saveSystem(pid, json); lastSaved.set(pid, json); } catch (e) { console.error("saveSystem", e); }
  };
  world.onBeforePurge = (pid) => { lastSaved.delete(pid); saveSystem(pid, world.exportState(pid)).catch((e) => console.error("saveSystem(purge)", e)); };
  // belt POIs and player stations persist on their own (a station with its storage); a closed belt is deleted
  const poiSaved = new Map();
  const persistPois = () => { for (const poi of world.pois.values()) { if (poi.kind !== "belt" && poi.kind !== "home") continue;   // the Library and the Station are built at start-up
      const json = JSON.stringify(poi); if (poiSaved.get(poi.id) === json) continue; poiSaved.set(poi.id, json); savePoi(poi.id, json).catch((e) => console.error("savePoi", e)); } };
  world.onPoiClosed = (poi) => { poiSaved.delete(poi.id); deletePoi(poi.id).catch((e) => console.error("deletePoi", e)); };
  world.homesReady = false;                               // (no player station is made until the saved ones are in)
  const loadAll = (tries = 0) => loadPois().then(async (list) => { for (const d of list) world.loadPoi(d); world.homesLoaded(await loadAccounts()); })
    .catch((e) => { console.error("loadPois", e); setTimeout(() => loadAll(tries + 1), Math.min(30000, 2000 * (tries + 1))); });   // keep trying: never make stations over saved ones
  loadAll();
  setInterval(() => { for (const pid of world.players.keys()) persist(pid); persistPois(); }, 10000);

  // a ship's fit, holds and fitted stats, and the hangar, are only sent when they change (the client keeps the last ones)
  const HEAVY = ["fit", "holds", "calc"];
  const lighten = (p, snap) => {
    const hv = p.heavy || (p.heavy = new Map());
    const same = (key, v) => { const j = JSON.stringify(v); if (hv.get(key) === j) return true; hv.set(key, j); return false; };
    for (const e of snap.ships) if (e.mine) for (const k of HEAVY) if (k in e && same(e.id + "|" + k, e[k])) delete e[k];
    if (snap.hangar && same("hangar", snap.hangar)) delete snap.hangar;
    if (snap.home && same("home", snap.home)) delete snap.home;
    return snap;
  };
  let last = Date.now();
  setInterval(() => { const now = Date.now(), dt = Math.min(0.25, (now - last) / 1000); last = now; world.tick(dt); }, TICK_MS);
  setInterval(() => {
    for (const p of world.players.values()) {
      if (p.offline) continue;
      const ps = world.poiSig(p); if (ps !== p.poiSig) { p.poiSig = ps; p.send(JSON.stringify({ t: "pois", pois: world.poisFor(p) })); }   // the map's POIs changed
      const fs = world.fieldSig(p); if (fs !== p.fieldSig) { const fl = world.fieldsFor(p); p.fieldSig = fl.sig; p.send(JSON.stringify({ t: "belts", belts: fl.fields })); }   // a belt came into reach, or its rocks changed
      p.send(JSON.stringify(lighten(p, world.snapshotFor(p))));
    }
  }, SNAPSHOT_MS);

  return wss;
}
