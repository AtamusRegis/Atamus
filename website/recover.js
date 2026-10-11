const stepUser = document.getElementById("step-user");
const stepAnswers = document.getElementById("step-answers");
const msg1 = document.getElementById("msg1");
const msg2 = document.getElementById("msg2");

let username = "";
let token = ""; // short-lived recovery token issued by the server after step 1

stepUser.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage(msg1, "");
  if (!stepUser.reportValidity()) return;

  username = formValues(stepUser).username;
  setBusy(stepUser, true);
  try {
    // Server returns the user's three questions (and a token tying the session together).
    const res = await Api.post("/auth/recover/start", { username });
    token = res.token;
    document.getElementById("q1-label").textContent = res.questions[0];
    document.getElementById("q2-label").textContent = res.questions[1];
    document.getElementById("q3-label").textContent = res.questions[2];
    stepUser.hidden = true;
    stepAnswers.hidden = false;
    stepAnswers.elements.a1.focus();
  } catch (err) {
    showMessage(msg1, err.message);
    setBusy(stepUser, false);
  }
});

// (owner) can't answer the questions: a reset request to the Head Admin, with a temporary password to follow it with
const stepRequest = document.getElementById("step-request"), msg3 = document.getElementById("msg3");
for (const b of document.querySelectorAll("[data-to-request]")) b.addEventListener("click", () => {
  const u = stepUser.elements.username.value; stepUser.hidden = true; stepAnswers.hidden = true; stepRequest.hidden = false;
  if (u) stepRequest.elements.username.value = u; (u ? stepRequest.elements.temp : stepRequest.elements.username).focus();
});
document.getElementById("req-eye").addEventListener("click", (e) => {
  e.preventDefault(); const t = stepRequest.elements.temp, show = t.type === "password";
  t.type = stepRequest.elements.confirm.type = show ? "text" : "password"; e.target.textContent = show ? "Hide" : "Show";
});
stepRequest.addEventListener("submit", async (e) => {
  e.preventDefault(); showMessage(msg3, "");
  if (!stepRequest.reportValidity()) return;
  const v = formValues(stepRequest);
  if (v.temp !== v.confirm) { showMessage(msg3, "Passwords don't match."); return; }
  setBusy(stepRequest, true);
  try {
    await Api.post("/auth/reset-request", { username: v.username, tempPassword: v.temp, text: v.text });
    showMessage(msg3, "Request sent. Log in with your username and temporary password to follow it.", "ok");
    for (const x of stepRequest.querySelectorAll("input, textarea, button[type=submit]")) x.disabled = true;
  } catch (err) { showMessage(msg3, err.message); setBusy(stepRequest, false); }
});

stepAnswers.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage(msg2, "");
  if (!stepAnswers.reportValidity()) return;

  const v = formValues(stepAnswers);
  if (v.password !== v.confirm) {
    showMessage(msg2, "Passwords don't match.");
    return;
  }

  setBusy(stepAnswers, true);
  try {
    await Api.post("/auth/recover/finish", {
      token,
      answers: [v.a1, v.a2, v.a3],
      password: v.password,
    });
    showMessage(msg2, "Password reset. Redirecting to log in…", "ok");
    setTimeout(() => (location.href = "login.html"), 1200);
  } catch (err) {
    showMessage(msg2, err.message);
    setBusy(stepAnswers, false);
  }
});
