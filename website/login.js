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
    showMessage(msg, err.message);
    setBusy(form, false);
    form.elements.password.value = "";
    form.elements.password.focus();
  }
});
