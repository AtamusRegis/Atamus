const form = document.getElementById("login-form");
const msg = document.getElementById("msg");

// Already logged in? Skip straight to the game.
Api.get("/auth/me")
  .then((me) => { if (me && me.username) location.href = "play.html"; })
  .catch(() => { /* not logged in, or server offline: show the form */ });

// (owner) Create account carries what was typed here (username and password) to the sign-up form; kept only for this
// tab, and only until the sign-up page reads it
document.getElementById("to-signup").addEventListener("click", () => {
  const u = form.elements.username.value.trim(), p = form.elements.password.value;
  try { if (u || p) sessionStorage.setItem("atamus.signup", JSON.stringify({ u, p })); else sessionStorage.removeItem("atamus.signup"); } catch {}
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage(msg, "");

  if (!form.reportValidity()) return;
  const { username, password } = formValues(form);

  setBusy(form, true);
  try {
    await Api.post("/auth/login", { username, password });
    location.href = "play.html";
  } catch (err) {
    const d = err.data || {};
    if (d.reset) {                                     // (owner) a temporary password: the reset request's conversation
      resetToken = d.resetToken; showReset(d.reset);
      clearInterval(resetPoll); resetPoll = setInterval(refreshReset, 10000);
      showMessage(msg, ""); setBusy(form, false); return;
    }
    if (d.ban) {                                       // (owner) banned: why (and until when), and the appeal conversation
      showMessage(msg, err.message); setBusy(form, false);
      appealToken = d.appealToken; showAppeal(d.appeal);
      clearInterval(appealPoll); appealPoll = setInterval(refreshAppeal, 10000);
      return;
    }
    showMessage(msg, err.message);
    setBusy(form, false);
    form.elements.password.value = "";
    form.elements.password.focus();
  }
});

// ---- (owner) the appeal: the lines so far (yours and the admins'), and a box to write in it (or start a new one) ----
const appealBox = document.getElementById("appeal"), appealLines = document.getElementById("appeal-lines"), appealState = document.getElementById("appeal-state");
const appealForm = document.getElementById("appeal-form"), appealMsg = document.getElementById("appeal-msg");
let appealToken = null, appealPoll = 0, lastAppeal = "";
const when = (t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
function showAppeal(st) {
  if (!st) return;
  const sig = JSON.stringify(st); if (sig === lastAppeal) return; lastAppeal = sig;
  appealBox.hidden = false;
  const cur = st.current, open = !!(cur && cur.status === "open");
  appealLines.replaceChildren(...((cur && cur.messages) || []).map((l) => { const p = document.createElement("p"); p.className = "appeal-line" + (l.admin ? " admin" : ""); const b = document.createElement("b"); b.textContent = l.name + ": "; const t = document.createElement("span"); t.className = "appeal-when"; t.textContent = when(l.at) + " "; p.append(t, b, l.text); return p; }));
  appealLines.hidden = !(cur && cur.messages && cur.messages.length);
  appealLines.scrollTop = appealLines.scrollHeight;
  let note = "";
  if (cur && cur.status === "accepted") note = "Your appeal was accepted.";
  else if (cur && cur.status === "denied" && !open) note = "This appeal is closed.";
  if (!open && st.blockedUntil) note += (note ? " " : "") + "No new appeals until " + new Date(st.blockedUntil).toUTCString() + ".";
  else if (!open && !st.canNew && st.banned) note += (note ? " " : "") + "No appeals left for this ban.";
  else if (!open && st.canNew) note += (note ? " " : "") + st.left + (st.left === 1 ? " appeal left." : " appeals left.");
  appealState.textContent = note; appealState.hidden = !note;
  appealForm.hidden = !(open || st.canNew);
  document.getElementById("appeal-label").textContent = open ? "Reply" : "New appeal";
}
async function refreshAppeal() {
  if (!appealToken) return;
  try { showAppeal(await Api.post("/auth/appeal/state", { token: appealToken })); } catch { clearInterval(appealPoll); }
}
appealForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = appealForm.elements.text.value.trim(); if (!text) { showMessage(appealMsg, "Write your appeal."); return; }
  setBusy(appealForm, true); showMessage(appealMsg, "");
  try { showAppeal(await Api.post("/auth/appeal", { token: appealToken, text })); appealForm.elements.text.value = ""; }
  catch (err) { showMessage(appealMsg, err.message); }
  setBusy(appealForm, false);
});

// ---- (owner) a password reset request: its lines (yours and the Head Admin's), and a box to reply while it's open ----
const resetBox = document.getElementById("reset"), resetLines = document.getElementById("reset-lines"), resetState = document.getElementById("reset-state");
const resetForm = document.getElementById("reset-form"), resetMsg = document.getElementById("reset-msg");
let resetToken = null, resetPoll = 0;
function showReset(r) {
  if (!r) return;
  form.hidden = true; resetBox.hidden = false;
  const when = (t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  resetLines.replaceChildren(...r.lines.map((l) => { const p = document.createElement("p"); p.className = "appeal-line" + (l.admin ? " admin" : ""); const b = document.createElement("b"); b.textContent = l.name + ": "; const t = document.createElement("span"); t.className = "appeal-when"; t.textContent = when(l.at) + " "; p.append(t, b, l.text); return p; }));
  resetLines.scrollTop = resetLines.scrollHeight;
  resetState.textContent = "Password reset request · " + r.name + " · " + ({ open: "Open", approved: "Approved", denied: "Denied", disowned: "Closed" }[r.status] || r.status);
  resetForm.hidden = r.status !== "open";
  if (r.status !== "open") clearInterval(resetPoll);
}
async function refreshReset() { if (!resetToken) return; try { showReset(await Api.post("/auth/reset/state", { token: resetToken })); } catch { clearInterval(resetPoll); } }
resetForm.addEventListener("submit", async (e) => {
  e.preventDefault(); const text = resetForm.elements.text.value.trim(); if (!text) return;
  setBusy(resetForm, true); showMessage(resetMsg, "");
  try { showReset(await Api.post("/auth/reset/say", { token: resetToken, text })); resetForm.elements.text.value = ""; } catch (err) { showMessage(resetMsg, err.message); }
  setBusy(resetForm, false);
});
