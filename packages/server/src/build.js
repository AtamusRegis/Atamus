// Build markers. SERVER_BUILD: short git SHA of the running server (written by deploy.sh).
// The website's live build is read from its version.json; when it changes, every
// connected client is told to reload so nobody keeps playing an old version.
import fs from "node:fs";
import { execFile } from "node:child_process";

export let SERVER_BUILD = "dev";
try { SERVER_BUILD = fs.readFileSync(new URL("../BUILD", import.meta.url), "utf8").trim(); } catch {}

const SITE = "https://atamus.io/version.json";
let webBuild = null, onChange = () => {}, burstUntil = 0, burstTimer = 0;
export const onWebsiteUpdate = (fn) => { onChange = fn; };
export async function checkWebsiteBuild() {
  try {
    const r = await fetch(SITE + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return false;
    const v = (await r.json()).v; if (!v) return false;
    if (webBuild && v !== webBuild) { webBuild = v; onChange(v); return true; }
    webBuild = v; return false;
  } catch { return false; }
}
// A deploy just finished: the CDN can take a few seconds to serve the new file, so look every 2 s for a minute.
export function websiteDeployed() {
  burstUntil = Date.now() + 60_000;
  if (burstTimer) return;
  const tick = async () => { const changed = await checkWebsiteBuild(); if (changed || Date.now() > burstUntil) { burstTimer = 0; return; } burstTimer = setTimeout(tick, 2000); };
  burstTimer = setTimeout(tick, 0);
}
if (process.env.ATAMUS_PTR !== "1") { checkWebsiteBuild(); setInterval(checkWebsiteBuild, 20_000); }   // the PTR has no live website to watch                       // backstop if the deploy ping never arrives

// ---- update countdown: a deploy announces itself ~30 s before it switches anything ----
// Only honoured when the repo's main really is ahead of what's live, and once per commit,
// so a stray request can't spam players.
const REPO_DIR = new URL("../../../", import.meta.url).pathname;
let announced = null, announcedAt = 0, parts = new Set(), onCountdownFn = () => {};
export const onCountdown = (fn) => { onCountdownFn = fn; };
const mainHead = () => new Promise((res) => execFile("git", ["-C", REPO_DIR, "ls-remote", "origin", "refs/heads/main"], { timeout: 10_000 }, (err, out) => res(err ? null : String(out).split(/\s/)[0] || null)));
// part: "server" or "web" — which half of the game this deploy is about to switch
// also: (owner, 2026-10-15) the other half this commit changes too ("web" / "server"), worked out by the workflow from the
// pushed files, so players are held until both halves are live (one trip to the update page, not two)
export async function announceUpdate(part, seconds = 30, also) {
  part = part === "web" ? "web" : "server";
  const more = String(also || "").split(",").filter((p) => p === "web" || p === "server");
  const now = Date.now(), running = announced && now < announcedAt + 120_000;
  let head = await mainHead();
  if (!head) {                                            // can't reach GitHub: still warn, merging into a countdown that's already running
    console.log("[build] could not read main; counting down anyway");
    head = running ? announced : "unknown-" + now;
  }
  if (head === announced) {                               // the other workflow for the same commit: same countdown, more parts
    const n = parts.size; parts.add(part); for (const p of more) parts.add(p); if (parts.size !== n) { onCountdownFn(announcedAt, head, [...parts]); saveUpd(); }
    return { ok: true, at: announcedAt, parts: [...parts] };
  }
  const serverCurrent = head.startsWith(SERVER_BUILD), webCurrent = webBuild && head === webBuild;
  if (serverCurrent && webCurrent) { console.log("[build] countdown refused: nothing pending"); return { ok: false, why: "nothing pending" }; }
  announced = head; announcedAt = now + seconds * 1000; parts = new Set([part, ...more]);
  onCountdownFn(announcedAt, head, [...parts]); saveUpd();
  return { ok: true, at: announcedAt, parts: [...parts] };
}
// A countdown that's still running, for players who connect in the middle of it.
export const activeCountdown = () => (announced && announcedAt > Date.now() ? { in: announcedAt - Date.now(), parts: [...parts], head: /^[0-9a-f]{7,40}$/.test(announced) ? announced : undefined } : null);

// ---- (owner, 2026-10-15) an update in progress: from the countdown until every half the commit changes is live (5
// minutes at most, in case a deploy never lands). Kept in uploads/update.json (outside git, never wiped) so a server
// that restarts mid-update still knows. While it's on, nobody gets in: the play page and the game send everyone to the
// update page, which lets them in once this says it's done.
const UPD_FILE = REPO_DIR + "uploads/update.json", UPD_MAX = 300_000;
function saveUpd() { try { fs.mkdirSync(REPO_DIR + "uploads", { recursive: true }); fs.writeFileSync(UPD_FILE, JSON.stringify({ head: announced, at: announcedAt, parts: [...parts] })); } catch (e) { console.error("update file", e.message); } }
try { const o = JSON.parse(fs.readFileSync(UPD_FILE, "utf8")); if (o && typeof o.head === "string" && Date.now() < o.at + UPD_MAX) { announced = o.head; announcedAt = o.at; parts = new Set(Array.isArray(o.parts) ? o.parts : []); } } catch {}
export function updateStatus() {
  if (!announced || Date.now() > announcedAt + UPD_MAX) return null;
  const known = /^[0-9a-f]{7,40}$/.test(announced);
  if (!known) return Date.now() < announcedAt + 120_000 ? { to: "", parts: [...parts], pending: [...parts] } : null;
  const pending = [...parts].filter((p) => (p === "server" ? !announced.startsWith(SERVER_BUILD) : webBuild !== announced));
  return pending.length ? { to: announced, parts: [...parts], pending } : null;
}
