const who = document.getElementById("who");
const logoutBtn = document.getElementById("logout");
const pilotStep = document.getElementById("pilot-step");
const enterStep = document.getElementById("enter-step");
const pilotForm = document.getElementById("pilot-form");
const pilotMsg = document.getElementById("pilot-msg");

// Gate the page: if not logged in, go back to the login screen. A new account names
// its first pilot here, on the website, before entering the game.
Api.get("/auth/me")
  .then(async (me) => {
    who.textContent = me.username;
    const state = await Api.get("/game/state").catch(() => null);
    const hasPilot = state && state.pilots && state.pilots.length;
    pilotStep.hidden = !!hasPilot; enterStep.hidden = !hasPilot;
    if (!hasPilot) pilotForm.elements.name.focus();
  })
  .catch(() => { location.href = "index.html"; });

pilotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = pilotForm.elements.name.value.trim();
  if (!name) { showMessage(pilotMsg, "Give your pilot a name."); return; }
  const btn = pilotForm.querySelector("button"); btn.disabled = true;
  try { await Api.post("/game/pilot/create", { name }); location.href = "game.html"; }
  catch (err) { showMessage(pilotMsg, err.message); btn.disabled = false; }
});

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  try { await Api.post("/auth/logout"); } catch { /* clear client-side regardless */ }
  location.href = "index.html";
});
