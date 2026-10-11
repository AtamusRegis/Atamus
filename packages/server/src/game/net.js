// The game socket: one session per account, a few commands in, snapshots out at 15 Hz.
import { WebSocketServer } from "ws";
import { config } from "../config.js";
import { getSessionUser, readCookie } from "../sessions.js";
import { World } from "./world.js";
import { TICK_MS, SNAPSHOT_MS, SHIP_TYPES, EXPANSE_APOTHEM_KM, AU_KM, DRONE } from "./constants.js";
import { celestialsForClient } from "./celestials.js";
import { setGameHooks, isUnlocked, muteOf, logAction } from "../admin.js";
import { staffIds, storeNote, unreadNoteCount, saveStaffLine, mentioned, rolesOf, STAFF_ROLES, HIGH_ROLES, CHAT_ROLES } from "../staff.js";
import { personaOf } from "../personas.js";
import { loadSystem, saveSystem, loadPois, savePoi, deletePoi, loadAccounts, loadAdminDms, deleteAdminDm, loadAdminRooms, saveAdminRoom, deleteAdminRoom, setFrozenRow, userByName, roleOf } from "./persist.js";
import { scan } from "../namefilter.js";
import { flagLine, HEAT_MAX } from "../language.js";
import { onAppealLine, subscribers } from "../appeals.js";
import { hears } from "../relations.js";
import { onRelAppeal } from "../relappeals.js";
import { onTicket } from "../tickets.js";
import { onResetLine } from "../resets.js";
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
  // (owner) staff DMs: rooms. A staff member opens one with a player (both windows open at once) and anyone staff in it can
  // add more people, players or staff, for a discussion. Players can't close theirs or leave; staff leave by closing the
  // window, and when the last staff member leaves the room ends. Staff show as their identity (an Admin's profile, a
  // Moderator's own name), resolved when sent. Freeze is per player, held by the Admin who froze them: it lasts while that
  // Admin is around with the room open (5 minutes' grace if they're away); leaving thaws it. Rooms are kept across restarts.
  const rooms = new Map();                               // room id -> { id, members: [{ id, name, staff }], log: [{ uid, a (staff), from, text, ts }], frozen: { playerId: adminId }, grace: {}, wasOnline: {} }
  const pName = (adminPid) => (personaOf(adminPid) || {}).name || "Admin";
  const pOut = (adminPid) => { const pe = personaOf(adminPid) || {}; return { name: pe.name || "Admin", pic: pe.pic || 1, key: pe.key || "", rank: pe.rank || "admin", ...(pe.portrait ? { portrait: pe.portrait } : {}) }; };   // (a Moderator: their own name and portrait)
  const lineOut = (l) => { if (!l.a) return { from: l.from, text: l.text, ts: l.ts }; const pe = pOut(String(l.a)); return { from: pe.name, text: l.text, ts: l.ts, key: pe.key, pic: pe.pic, rank: pe.rank, ...(pe.portrait ? { portrait: pe.portrait } : {}) }; };
  const memberOut = (r, m) => (m.staff ? { name: pName(m.id), staff: true, rank: pOut(m.id).rank } : { name: m.name, staff: false, frozen: !!r.frozen[m.id] });
  const isStaffIn = (r, pid) => r.members.some((m) => m.id === pid && m.staff), isIn = (r, pid) => r.members.some((m) => m.id === pid);
  const players = (r) => r.members.filter((m) => !m.staff), staffOf = (r) => r.members.filter((m) => m.staff);
  // what each member is sent: the room, its members, its lines; plus (for the old one-to-one view) the player's or staff member's name
  function openMsg(r, pid) {
    const me = r.members.find((m) => m.id === pid), base = { t: "admopen", room: r.id, members: r.members.map((m) => memberOut(r, m)), log: r.log.map(lineOut) };
    if (me && me.staff) { const p0 = players(r)[0]; return { ...base, with: p0 ? p0.name : (staffOf(r).find((m) => m.id !== pid) ? pName(staffOf(r).find((m) => m.id !== pid).id) : ""), frozen: !!(p0 && r.frozen[p0.id]) }; }
    const s0 = staffOf(r)[0], pe = s0 ? pOut(s0.id) : {}; return { ...base, admin: pe.name, pic: pe.pic, key: pe.key, rank: pe.rank };
  }
  const tellRoom = (r) => { for (const m of r.members) sendTo(m.id, openMsg(r, m.id)); };
  const saveRoom = (r) => (rooms.has(r.id) ? saveAdminRoom(r.id, r) : deleteAdminRoom(r.id)).catch((e) => console.error("admin room", e));
  loadAdminRooms().then(async (list) => {
    for (const r of list) rooms.set(r.id, { grace: {}, wasOnline: {}, frozen: {}, ...r });
    for (const d of await loadAdminDms()) {             // (the one-to-one admin DMs saved before rooms: each becomes a room)
      const id = "r" + d.player_id + "-" + Date.now().toString(36), r = { id, members: [{ id: String(d.admin_id), name: d.admin_name, staff: true }, { id: String(d.player_id), name: d.player_name, staff: false }], log: (d.log || []).map((l) => ({ ...l, ...(l.a ? { a: String(l.a) } : l.from === d.admin_name ? { a: String(d.admin_id) } : {}) })), frozen: d.frozen ? { [String(d.player_id)]: String(d.admin_id) } : {}, grace: {}, wasOnline: {} };
      rooms.set(id, r); await saveAdminRoom(id, r); await deleteAdminDm(String(d.player_id));
    }
  }).catch((e) => console.error("admin rooms", e));
  const onlineByName = (name) => { if (typeof name !== "string" || name.length > 40) return null; for (const p of world.players.values()) if (!p.offline && p.name.toLowerCase() === name.toLowerCase()) return { id: p.id, name: p.name }; return null; };
  const cleanText = (t) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, 500) : "");
  const roomOf = (pid, m) => { const r = typeof m.room === "string" ? rooms.get(m.room) : null; return r && isIn(r, pid) ? r : null; };
  // the room a staff member shares with a player (by name)
  // (the room they share: a one-to-one room first, else any room with both in it)
  const pairRoom = (staffPid, name) => { let any = null; for (const r of rooms.values()) if (isStaffIn(r, staffPid) && players(r).some((m) => m.name.toLowerCase() === String(name).toLowerCase())) { if (r.members.length === 2) return r; any = any || r; } return any; };
  const staffNow = (pid) => isUnlocked(pid) && personaOf(pid);
  async function findUser(name) { if (typeof name !== "string" || !name || name.length > 40) return null; const t = onlineByName(name) || await userByName(name); if (!t) return null; return { ...t, role: await roleOf(t.id) }; }
  async function admStart(pid, to) {                   // (owner) staff open a DM with someone: both windows open at once
    if (!staffNow(pid)) return null;
    const t = await findUser(to); if (!t || t.id === pid) return null;
    let r = !t.role ? pairRoom(pid, t.name) : null;
    if (!r) { r = { id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), members: [{ id: pid, name: pName(pid), staff: true }, { id: t.id, name: t.name, staff: !!t.role }], log: [], frozen: {}, grace: {}, wasOnline: {} }; rooms.set(r.id, r); saveRoom(r); }
    tellRoom(r); return r;
  }
  async function admAdd(pid, m) {                      // (owner) anyone staff in a room adds a player or another staff member
    const r = roomOf(pid, m); if (!r || !isStaffIn(r, pid) || !staffNow(pid)) return;
    const t = await findUser(m.name); if (!t || isIn(r, t.id)) return;
    r.members.push({ id: t.id, name: t.name, staff: !!t.role }); saveRoom(r); tellRoom(r);
  }
  function addLine(r, pid, text) {
    const st = isStaffIn(r, pid), from = st ? pName(pid) : (r.members.find((m) => m.id === pid) || {}).name, line = { uid: pid, from, text, ts: Date.now(), ...(st ? { a: pid } : {}) };
    r.log.push(line); if (r.log.length > 200) r.log.shift(); saveRoom(r);
    const out = lineOut(line); for (const m of r.members) sendTo(m.id, { t: "admdm", room: r.id, ...out, ...(m.staff ? { with: (players(r)[0] || {}).name } : { admin: (staffOf(r)[0] ? pName(staffOf(r)[0].id) : "") }) });
    chatLine({ ch: "admin", fromId: pid, ...(st ? { aid: pid } : {}), from, members: r.members.map((x) => x.id), to: r.members.filter((x) => x.id !== pid).map((x) => (x.staff ? pName(x.id) : x.name)).join(", "), text });
  }
  async function admSay(pid, name, m) {
    const text = cleanText(m.text); if (!text) return;
    let r = roomOf(pid, m);
    if (!r && typeof m.to === "string" && staffNow(pid)) r = pairRoom(pid, m.to) || await admStart(pid, m.to);   // (one-to-one, by name)
    if (!r && !staffNow(pid)) { for (const x of rooms.values()) if (isIn(x, pid) && !isStaffIn(x, pid)) r = x; }   // a player answering their latest room
    if (!r || !isIn(r, pid)) return;
    if (isStaffIn(r, pid) && !staffNow(pid)) return;
    addLine(r, pid, text);
  }
  // (owner) Freeze is a box beside each player in the room (Admins only, not Moderators): no reason needed (it's logged)
  async function setFreeze(playerPid, on, by, note = "", room = null) {
    for (const r of rooms.values()) { if (on && r !== room) continue; if (!on && !r.frozen[playerPid]) continue; if (on) r.frozen[playerPid] = by.id; else delete r.frozen[playerPid]; delete r.grace[playerPid]; saveRoom(r); for (const m of staffOf(r)) sendTo(m.id, { t: "admstate", room: r.id, with: (r.members.find((x) => x.id === playerPid) || {}).name, frozen: on }); tellRoom(r); }
    await setFrozenRow(playerPid, on, by.id);
    world.setFrozen(playerPid, on); sendTo(playerPid, { t: "frozen", on });
    const name = (world.players.get(playerPid) || {}).name || ([...rooms.values()].flatMap((r) => r.members).find((x) => x.id === playerPid) || {}).name || "?";
    await logAction(by.id, by.name, playerPid, name, on ? "freeze" : "unfreeze", note).catch((e) => console.error("freeze log", e));
  }
  const frozenAnywhere = (pid) => [...rooms.values()].some((r) => r.frozen[pid]);
  async function admFreeze(pid, m) {
    if (!staffNow(pid)) return;
    let r = roomOf(pid, m); if (!r && typeof m.to === "string") r = pairRoom(pid, m.to) || await admStart(pid, m.to);
    if (!r || !isStaffIn(r, pid)) return;
    const t = players(r).find((x) => x.name.toLowerCase() === String(m.to || "").toLowerCase()) || (players(r).length === 1 ? players(r)[0] : null); if (!t) return;
    if ((personaOf(pid) || {}).mod || (m.on && await roleOf(t.id))) { tellRoom(r); sendTo(pid, { t: "admstate", room: r.id, with: t.name, frozen: !!r.frozen[t.id] }); return; }   // (owner) Moderators can't freeze; staff can't freeze staff
    if (!!m.on === !!r.frozen[t.id]) return;
    await setFreeze(t.id, !!m.on, { id: pid, name: pName(pid) }, "", r);
  }
  async function admEnd(pid, m) {                      // (owner) a staff member closing the room leaves it (thawing whom they froze); the last one ends it
    let r = roomOf(pid, m); if (!r && typeof m.to === "string") r = pairRoom(pid, m.to); if (!r || !isStaffIn(r, pid)) return;
    for (const [p, by] of Object.entries(r.frozen)) if (by === pid || staffOf(r).length === 1) await setFreeze(p, false, { id: pid, name: pName(pid) }, "admin DM closed");
    r.members = r.members.filter((x) => x.id !== pid); sendTo(pid, { t: "admend", room: r.id, with: (players(r)[0] || {}).name });
    if (!staffOf(r).length) { rooms.delete(r.id); for (const x of r.members) sendTo(x.id, { t: "admend", room: r.id }); saveRoom(r); return; }
    saveRoom(r); tellRoom(r);
  }
  // (owner) the freezing Admin gone (logged off) for 5 minutes: the player thaws. A frozen player back before them starts the
  // same 5 minutes.
  const THAW_MS = 5 * 60_000;
  setInterval(() => {
    const now = Date.now();
    for (const r of rooms.values()) for (const [p, by] of Object.entries(r.frozen)) {
      if (conns.has(by)) { delete r.grace[p]; continue; }
      if (!r.grace[p] && (conns.has(p) || r.wasOnline[p])) r.grace[p] = now;
      if (r.grace[p] && now - r.grace[p] > THAW_MS) setFreeze(p, false, { id: by, name: pName(by) }, "admin away 5 minutes").catch((e) => console.error("thaw", e));
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
    return chatBuf.filter((l) => l.ts >= since && (l.ch === "local" || l.ch === "corp" || l.fromId === pid || l.toId === pid || (l.members && l.members.includes(pid)))).slice(-600)
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
  // (owner) the staff chats: the Admin chat (Admins) and the Moderator chat (Moderators; Admins read and write it too), each
  // under the speaker's identity; "@name" pings someone who can read it (kept for them if away)
  async function staffSay(pid, raw, channel) {
    const pe = isUnlocked(pid) && personaOf(pid), text = cleanText(raw); if (!pe || !text || !CHAT_ROLES[channel]) return;
    const online = [...conns.keys()].filter((id) => isUnlocked(id)), roles = await rolesOf(online.includes(pid) ? online : [...online, pid]);
    if (!CHAT_ROLES[channel].includes(roles.get(pid))) return;
    await saveStaffLine(pid, text, channel);
    const msg = { t: "chat", ch: channel === "mod" ? "modchat" : "staff", from: pe.name, admin: pe.key, pic: pe.pic, rank: pe.rank || "admin", ...(pe.portrait ? { portrait: pe.portrait } : {}), text, ts: Date.now() };
    for (const id of online) if (CHAT_ROLES[channel].includes(roles.get(id))) sendTo(id, msg);
    for (const id of await mentioned(text, channel)) if (id !== pid && !(conns.has(id) && isUnlocked(id))) { await storeNote(id, "mention", pe.name + ": " + text, { tab: channel === "mod" ? "modchat" : "staffchat" }); if (conns.has(id)) sendTo(id, { t: "staffnotes", n: await unreadNoteCount(id) }); }
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
  onResetLine((id, name, text) => staffNotify(["head"], "reset", "Password reset request · " + name + ": " + text, { reset: id }));   // (owner) the Head Admin only
  setGameHooks({
    modSuspended: async (uid) => { for (const r of [...rooms.values()]) if (isStaffIn(r, uid)) await admEnd(uid, { room: r.id }).catch((e) => console.error("susp dm", e)); },
    staffNotify: (roles, kind, text, ref) => staffNotify(roles, kind, text, ref),
    // (owner) an admin's profile changed: everyone's chat shows their lines (old ones too) under the new one
    persona: (uid, pe) => { const msg = JSON.stringify({ t: "adminprofile", key: pe.key, name: pe.name, pic: pe.pic, rank: pe.rank || "admin", ...(pe.portrait ? { portrait: pe.portrait } : {}) }); for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(msg);
      for (const r of rooms.values()) if (isStaffIn(r, String(uid))) tellRoom(r); },
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
    { const frozen = !!(user.frozen && frozenAnywhere(pid));   // (owner) still frozen (only while a staff DM holds it)
      if (user.frozen && !frozen) setFrozenRow(pid, false, null).catch(() => {});
      world.setFrozen(pid, frozen); if (frozen) { send(JSON.stringify({ t: "frozen", on: true })); for (const r of rooms.values()) if (r.frozen[pid]) r.wasOnline[pid] = true; } }
    { const mu = muteOf(user); if (mu) mutes.set(pid, { perm: mu.perm, until: mu.until ? new Date(mu.until).getTime() : 0, reason: mu.reason }); else mutes.delete(pid); }
    for (const r of rooms.values()) if (isIn(r, pid)) send(JSON.stringify(openMsg(r, pid)));   // (owner) staff DM rooms still open


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
            if (m.channel === "staff" || m.channel === "modchat") { staffSay(pid, m.text, m.channel === "modchat" ? "mod" : "admin").catch((e) => console.error("staff chat", e)); break; }   // (owner) the Admin and Moderator chats
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
          case "admadd": admAdd(pid, m).catch((e) => console.error("admadd", e)); break;   // (owner) add someone to a staff DM
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
