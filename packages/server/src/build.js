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
let announced = null, onCountdownFn = () => {};
export const onCountdown = (fn) => { onCountdownFn = fn; };
const mainHead = () => new Promise((res) => execFile("git", ["-C", REPO_DIR, "ls-remote", "origin", "refs/heads/main"], { timeout: 10_000 }, (err, out) => res(err ? null : String(out).split(/\s/)[0] || null)));
export async function announceUpdate(seconds = 30) {
  const head = await mainHead(); if (!head) return { ok: false, why: "cannot read main" };
  if (head === announced) return { ok: true, already: true };
  const serverCurrent = head.startsWith(SERVER_BUILD), webCurrent = webBuild && head === webBuild;
  if (serverCurrent && webCurrent) return { ok: false, why: "nothing pending" };
  announced = head;
  const at = Date.now() + seconds * 1000;
  onCountdownFn(at, head);
  return { ok: true, at };
}
