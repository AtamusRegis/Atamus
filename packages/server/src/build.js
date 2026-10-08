// Build markers. SERVER_BUILD: short git SHA of the running server (written by deploy.sh).
// The website's live build is read from its version.json; when it changes, every
// connected client is told to reload so nobody keeps playing an old version.
import fs from "node:fs";

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
checkWebsiteBuild();
setInterval(checkWebsiteBuild, 20_000);                       // backstop if the deploy ping never arrives
