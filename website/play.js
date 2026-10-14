// (owner) returning players come through the log-in page first
if (needLogin()) location.replace("login.html");
// (owner) another account logged in from another tab: this page follows who's logged in now
addEventListener("focus", () => { Api.get("/auth/me").then((u) => { const w = document.getElementById("who"); if (u && w && w.textContent && u.username !== w.textContent) location.reload(); }).catch(() => { location.href = "login.html"; }); });
const who = document.getElementById("who");
const logoutBtn = document.getElementById("logout");
const enterStep = document.getElementById("enter-step");

const params = new URLSearchParams(location.search);
const updateStep = document.getElementById("update-step");

// Gate the page: if not logged in, go back to the login screen. (owner, 2026-10-12: the 3D rebuild has no
// character or pilot creation; an account goes straight to Enter System.)
async function showSteps() {
  const me = await Api.get("/auth/me");
  who.textContent = me.username;
  enterStep.hidden = false;
  document.getElementById("hello").textContent = "Welcome back";
}

// Sent here by an update countdown: wait until the new version is live, then let them back in.
async function waitForUpdate() {
  updateStep.hidden = false; enterStep.hidden = true;
  Api.get("/auth/me").then((me) => { who.textContent = me.username; }).catch(() => {});
  const parts = (params.get("parts") || "server,web").split(","), web = params.get("web"), srv = params.get("srv");
  const started = Date.now();
  const webLive = async () => { try { const j = await fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then((r) => r.json()); return j.v && j.v !== web; } catch { return false; } };
  const srvLive = async () => { try { const j = await fetch(API_BASE + "/healthz?t=" + Date.now(), { cache: "no-store" }).then((r) => r.json()); return j.build && j.build !== srv; } catch { return false; } };
  for (;;) {
    const done = (!parts.includes("web") || await webLive()) && (!parts.includes("server") || await srvLive());
    if (done || Date.now() - started > 120_000) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  let ok = false;
  for (let i = 0; i < 30 && !ok; i++) {                // the server may still be warming up: retry; signed out: log in
    try { await showSteps(); ok = true; }
    catch (e) { if (e.status === 401) { location.href = "login.html"; return; } await new Promise((r) => setTimeout(r, 2000)); }
  }
  if (!ok) { location.href = "login.html"; return; }   // never a dead end with no way in
  updateStep.hidden = true;
  history.replaceState(null, "", "play.html");
}

// always open the game fresh, never a cached copy of an older build
document.querySelectorAll('a[href="game.html"]').forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); const rs = document.getElementById("reset-side"), rp = document.getElementById("reset-pos"); location.href = "game.html?cb=" + Date.now() + (rs && rs.checked ? "&reset=1" : "") + (rp && rp.checked ? "&resetpos=1" : ""); }));   // (owner) Reset faction: choose a side again; Reset location: back near the center
if (params.get("updating")) waitForUpdate();
else showSteps().catch(() => { location.href = "login.html"; });

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  try { await Api.post("/auth/logout"); } catch { /* clear client-side regardless */ }
  try { sessionStorage.removeItem("atamus.in"); } catch {}
  location.href = "index.html";
});

