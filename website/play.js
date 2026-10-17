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

// Sent here by an update countdown: wait until the new version is live and the server takes logins, then let them back
// in. (owner, 2026-10-14) Not a timer: with ?to= (the commit going live) the page waits for exactly that version on the
// server (its build) and the website (version.json), then for the server to answer a login check; everyone's page looks
// every second, so Enter System comes back for all players at once. Each check gives up after 4 s (a request to a
// restarting server can stall), and a reload carries on the same wait. Only if the deploy never lands (a failed deploy)
// does a 5-minute backstop let them in anyway.
const timed = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
const getJson = (url) => { const c = new AbortController(), t = setTimeout(() => c.abort(), 4000); return fetch(url, { cache: "no-store", signal: c.signal }).then((r) => r.json()).finally(() => clearTimeout(t)); };
async function waitForUpdate() {
  updateStep.hidden = false; enterStep.hidden = true;
  timed(Api.get("/auth/me"), 4000).then((me) => { who.textContent = me.username; }).catch(() => {});
  const parts = (params.get("parts") || "server,web").split(","), web = params.get("web"), srv = params.get("srv");
  const to = /^[0-9a-f]{7,40}$/.test(params.get("to") || "") ? params.get("to") : "";
  let started = Date.now();
  try { const k = "atamus.updWait:" + location.search, s0 = +sessionStorage.getItem(k); if (s0 && Date.now() - s0 < 600_000) started = s0; else sessionStorage.setItem(k, String(started)); } catch {}
  // live: the target version when we know it; otherwise anything other than what was running before
  const webLive = async () => { try { const j = await getJson("version.json?t=" + Date.now()); if (!(!!j.v && ((to && j.v === to) || (!!web && j.v !== web) || (!to && !web)))) return false;
    if (!to) return true;                       // (owner, 2026-10-15) and the game page itself is the new one (the CDN can serve version.json first)
    const c = new AbortController(), t = setTimeout(() => c.abort(), 4000);
    try { const h = await (await fetch("game.html?t=" + Date.now(), { cache: "no-store", signal: c.signal })).text(); return h.includes('content="' + to + '"'); } finally { clearTimeout(t); } } catch { return false; } };
  // (owner, 2026-10-15) and the server agrees nothing is still on its way (it holds everyone until every changed half is live)
  const srvDone = async () => { try { return !(await getJson(API_BASE + "/game/update-status?t=" + Date.now())).updating; } catch { return false; } };
  // (the server's build is a short commit id; a newer push than the one waited for counts too)
  const srvLive = async () => { try { const b = (await getJson(API_BASE + "/healthz?t=" + Date.now())).build; if (!b) return false; return (to && to.startsWith(b)) || (!!srv && b !== srv) || (!srv && !to); } catch { return false; } };
  for (;;) {
    const live = (!parts.includes("web") || await webLive()) && (!parts.includes("server") || await srvLive()) && await srvDone();
    if (live) { try { await timed(showSteps(), 4000); break; } catch (e) { if (e.status === 401) { location.href = "login.html"; return; } } }   // the server answers: in
    if (Date.now() - started > 300_000) { try { await timed(showSteps(), 4000); break; } catch (e) { location.href = "login.html"; return; } }   // (a deploy that never landed)
    await new Promise((r) => setTimeout(r, 1000));
  }
  updateStep.hidden = true;
  history.replaceState(null, "", "play.html");
}

// always open the game fresh, never a cached copy of an older build
document.querySelectorAll('a[href="game.html"]').forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); location.href = "game.html?cb=" + Date.now(); }));
// (owner, 2026-10-15) an update in progress (its countdown started, or it hasn't fully landed yet): straight to the
// update page instead of Enter System
async function gate() {
  let u = null; try { u = (await getJson(API_BASE + "/game/update-status?t=" + Date.now())).updating; } catch {}
  if (u) { const q = new URLSearchParams({ updating: "1", parts: (u.parts || ["server", "web"]).join(",") }); if (u.to) q.set("to", u.to); location.replace("play.html?" + q.toString()); return; }
  showSteps().catch(() => { location.href = "login.html"; });
}
if (params.get("updating")) waitForUpdate();
else gate();

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  try { await Api.post("/auth/logout"); } catch { /* clear client-side regardless */ }
  try { sessionStorage.removeItem("atamus.in"); } catch {}
  location.href = "index.html";
});

