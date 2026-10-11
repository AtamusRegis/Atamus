const form = document.getElementById("login-form");
const msg = document.getElementById("msg");

// Already logged in? Skip straight to the game.
Api.get("/auth/me")
  .then((me) => { if (me && me.username) location.href = "play.html"; })
  .catch(() => { /* not logged in, or server offline: show the form */ });

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
    if (d.ban) {                                       // (owner) banned: why (and until when), where the appeal stands, and the appeal form
      const ap = d.appeal;
      showMessage(msg, err.message + (ap && ap.status === "open" ? " Your appeal is being reviewed." : ap && ap.status === "denied" ? " Your appeal was denied" + (ap.response ? ": " + ap.response : ".") : ""));
      setBusy(form, false);
      banned = { username, password };
      appealForm.hidden = !!(ap && ap.status === "open");
      return;
    }
    showMessage(msg, err.message);
    setBusy(form, false);
    form.elements.password.value = "";
    form.elements.password.focus();
  }
});

const appealForm = document.getElementById("appeal-form"), appealMsg = document.getElementById("appeal-msg");
let banned = null;
appealForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!banned) return;
  const text = appealForm.elements.text.value.trim(); if (!text) { showMessage(appealMsg, "Write your appeal."); return; }
  setBusy(appealForm, true);
  try { await Api.post("/auth/appeal", { ...banned, text }); appealForm.hidden = true; showMessage(msg, "Your appeal was sent.", "ok"); }
  catch (err) { showMessage(appealMsg, err.message); }
  setBusy(appealForm, false);
});
