const form = document.getElementById("login-form");
const msg = document.getElementById("msg");

// (owner) every returning player logs in here (no skipping to the game). Remember Password fills the password field
// for a remembered account (the browser keeps a token, never the password); unticking it forgets it
const remBox = form.elements.remember, SAVED = "\u2022".repeat(12);
let byToken = false;
{ const r = Remember.get(); if (r) { form.elements.username.value = r.u; form.elements.password.value = SAVED; remBox.checked = true; byToken = true; } }
form.elements.password.addEventListener("input", () => { byToken = false; });
form.elements.username.addEventListener("input", () => { if (byToken) { byToken = false; form.elements.password.value = ""; } });
remBox.addEventListener("change", () => { if (remBox.checked) return; Remember.clear(); if (byToken) { byToken = false; form.elements.password.value = ""; } });

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
    const r = Remember.get(), useToken = byToken && r && r.u.toLowerCase() === username.toLowerCase();
    if (useToken) form.elements.password.value = "";   // (so the browser doesn't offer to save the placeholder)
    const res = await Api.post("/auth/login", useToken ? { username, token: r.t, remember: remBox.checked } : { username, password, remember: remBox.checked });
    if (res.remember) { try { localStorage.setItem("atamus.remember", JSON.stringify({ u: res.username, t: res.remember })); } catch {} }
    else if (!remBox.checked) Remember.clear();
    markLoggedIn();
    location.href = "play.html";
  } catch (err) {
    const d = err.data || {};
    if (d.forget) { try { localStorage.removeItem("atamus.remember"); } catch {} byToken = false; }   // (a remembered login that no longer works)
    else if (byToken) form.elements.password.value = SAVED;
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

