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
// (owner, 2026-10-14: it could hang) every check gives up after 4 s (a request to a restarting server can stall forever),
// the whole wait is at most 90 s, and that 90 s is kept across reloads (Ctrl+F5 doesn't start it over)
const timed = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
const getJson = (url) => { const c = new AbortController(), t = setTimeout(() => c.abort(), 4000); return fetch(url, { cache: "no-store", signal: c.signal }).then((r) => r.json()).finally(() => clearTimeout(t)); };
async function waitForUpdate() {
  updateStep.hidden = false; enterStep.hidden = true;
  timed(Api.get("/auth/me"), 4000).then((me) => { who.textContent = me.username; }).catch(() => {});
  const parts = (params.get("parts") || "server,web").split(","), web = params.get("web"), srv = params.get("srv");
  let started = Date.now();
  try { const k = "atamus.updWait:" + location.search, s0 = +sessionStorage.getItem(k); if (s0 && Date.now() - s0 < 600_000) started = s0; else sessionStorage.setItem(k, String(started)); } catch {}
  const webLive = async () => { try { const j = await getJson("version.json?t=" + Date.now()); return !!j.v && j.v !== web; } catch { return false; } };
  const srvLive = async () => { try { const j = await getJson(API_BASE + "/healthz?t=" + Date.now()); return !!j.build && j.build !== srv; } catch { return false; } };
  while (Date.now() - started < 90_000) {
    const done = (!parts.includes("web") || await webLive()) && (!parts.includes("server") || await srvLive());
    if (done) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) {                // the server may still be warming up: retry; signed out: log in
    try { await timed(showSteps(), 5000); ok = true; }
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

