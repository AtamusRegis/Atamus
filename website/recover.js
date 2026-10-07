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
    setTimeout(() => (location.href = "index.html"), 1200);
  } catch (err) {
    showMessage(msg2, err.message);
    setBusy(stepAnswers, false);
  }
});
