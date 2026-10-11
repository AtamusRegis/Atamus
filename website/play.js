const who = document.getElementById("who");
const logoutBtn = document.getElementById("logout");
const pilotStep = document.getElementById("pilot-step");
const enterStep = document.getElementById("enter-step");
const pilotForm = document.getElementById("pilot-form");
const pilotMsg = document.getElementById("pilot-msg");

const params = new URLSearchParams(location.search);
const updateStep = document.getElementById("update-step");

const charStep = document.getElementById("char-step");
const charForm = document.getElementById("char-form");
const charMsg = document.getElementById("char-msg");
const card = document.getElementById("play-card");
let charBuilder = null, pilotBuilder = null;

// Gate the page: if not logged in, go back to the login screen. A new account makes its character (owner: one
// portrait for the player, used in chat; its name is the username), then its first pilot (male / female, portrait,
// name), here on the website, before entering the game.
async function showSteps() {
  const me = await Api.get("/auth/me");
  who.textContent = me.username;
  showResetNote(me.resetRequests || []);
  const state = await Api.get("/game/state").catch(() => null);
  const hasChar = !!(state && state.profile && state.profile.portrait), hasPilot = !!(state && state.pilots && state.pilots.length);
  charStep.hidden = hasChar; pilotStep.hidden = !hasChar || hasPilot; enterStep.hidden = !hasChar || !hasPilot;
  card.classList.toggle("card-wide", !hasChar || !hasPilot);
  document.getElementById("hello").textContent = hasPilot ? "Welcome back" : "Welcome";   // a brand-new account is greeted, not welcomed back
  if (!hasChar && !charBuilder) charBuilder = await Portrait.builder(document.getElementById("char-builder"));
  if (hasChar && !hasPilot && !pilotBuilder) { pilotBuilder = await Portrait.builder(document.getElementById("pilot-builder")); pilotForm.elements.name.focus(); }
}
charForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = charForm.querySelector('button[type="submit"]'); btn.disabled = true;
  try { await Api.post("/game/character", { portrait: charBuilder.value }); await showSteps(); }
  catch (err) { showMessage(charMsg, err.message); }
  btn.disabled = false;
});

// Sent here by an update countdown: wait until the new version is live, then let them back in.
async function waitForUpdate() {
  updateStep.hidden = false; pilotStep.hidden = true; charStep.hidden = true; enterStep.hidden = true;
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
document.querySelectorAll('a[href="game.html"]').forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); location.href = "game.html?cb=" + Date.now(); }));
if (params.get("updating")) waitForUpdate();
else showSteps().catch(() => { location.href = "login.html"; });

pilotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = pilotForm.elements.name.value.trim();
  if (!name) { showMessage(pilotMsg, "Give your pilot a name."); return; }
  const btn = pilotForm.querySelector('button[type="submit"]'); btn.disabled = true;
  try { await Api.post("/game/pilot/create", { name, portrait: pilotBuilder && pilotBuilder.value }); location.href = "game.html?cb=" + Date.now(); }
  catch (err) { showMessage(pilotMsg, err.message); btn.disabled = false; }
});

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  try { await Api.post("/auth/logout"); } catch { /* clear client-side regardless */ }
  location.href = "index.html";
});

// ---- (owner) a password reset was requested for this account: the owner can say it isn't them (the request closes and the
// Head Admin is told), then change their password ----
const resetNote = document.getElementById("reset-note"), pwForm = document.getElementById("pw-form"), pwMsg = document.getElementById("pw-msg");
let resetIds = [];
function showResetNote(list) {
  resetIds = list.map((r) => r.id); if (!list.length) { if (pwForm.hidden) resetNote.hidden = true; return; }
  resetNote.hidden = false;
  document.getElementById("reset-when").textContent = "Someone asked to reset this account's password on " + list.map((r) => new Date(r.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })).join(", ") + ".";
}
document.getElementById("not-me").addEventListener("click", async (e) => {
  e.target.disabled = true;
  try { for (const id of resetIds) await Api.post("/auth/reset/notme", { id }); } catch {}
  document.getElementById("reset-when").textContent = "The request is closed. Change your password:"; e.target.hidden = true; pwForm.hidden = false; pwForm.elements.current.focus();
});
pwForm.addEventListener("submit", async (e) => {
  e.preventDefault(); showMessage(pwMsg, ""); if (!pwForm.reportValidity()) return;
  const v = formValues(pwForm); if (v.password !== v.confirm) { showMessage(pwMsg, "Passwords don't match."); return; }
  setBusy(pwForm, true);
  try { await Api.post("/auth/account/password", { current: v.current, password: v.password }); resetNote.hidden = true; }
  catch (err) { showMessage(pwMsg, err.message); setBusy(pwForm, false); }
});
