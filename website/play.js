const who = document.getElementById("who");
const logoutBtn = document.getElementById("logout");
const pilotStep = document.getElementById("pilot-step");
const enterStep = document.getElementById("enter-step");
const pilotForm = document.getElementById("pilot-form");
const pilotMsg = document.getElementById("pilot-msg");

const params = new URLSearchParams(location.search);
const updateStep = document.getElementById("update-step");

// Gate the page: if not logged in, go back to the login screen. A new account names
// its first pilot here, on the website, before entering the game.
async function showSteps() {
  const me = await Api.get("/auth/me");
  who.textContent = me.username;
  document.getElementById("server-pick").hidden = !(me.servers && me.servers.includes("tutorial"));   // testers pick a server (owner)
  const state = await Api.get("/game/state").catch(() => null);
  const hasPilot = state && state.pilots && state.pilots.length;
  pilotStep.hidden = !!hasPilot; enterStep.hidden = !hasPilot;
  document.getElementById("hello").textContent = hasPilot ? "Welcome back" : "Welcome";   // a brand-new account is greeted, not welcomed back
  if (!hasPilot) pilotForm.elements.name.focus();
}

// Sent here by an update countdown: wait until the new version is live, then let them back in.
async function waitForUpdate() {
  updateStep.hidden = false; pilotStep.hidden = true; enterStep.hidden = true;
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
  for (let i = 0; i < 30; i++) { try { await showSteps(); break; } catch { await new Promise((r) => setTimeout(r, 2000)); } }   // server may still be warming up
  updateStep.hidden = true;
  history.replaceState(null, "", "play.html");
}

// always open the game fresh, never a cached copy of an older build
document.querySelectorAll('a[href="game.html"]').forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  const tut = !document.getElementById("server-pick").hidden && document.getElementById("server").value === "tutorial";
  location.href = "game.html?cb=" + Date.now() + (tut ? "&shard=tutorial&new=1" : "");   // the tutorial starts fresh from here
}));
if (params.get("updating")) waitForUpdate();
else showSteps().catch(() => { location.href = "login.html"; });

pilotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = pilotForm.elements.name.value.trim();
  if (!name) { showMessage(pilotMsg, "Give your pilot a name."); return; }
  const btn = pilotForm.querySelector("button"); btn.disabled = true;
  try { await Api.post("/game/pilot/create", { name }); location.href = "game.html?cb=" + Date.now(); }
  catch (err) { showMessage(pilotMsg, err.message); btn.disabled = false; }
});

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  try { await Api.post("/auth/logout"); } catch { /* clear client-side regardless */ }
  location.href = "index.html";
});
