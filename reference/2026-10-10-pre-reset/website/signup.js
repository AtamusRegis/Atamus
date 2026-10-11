const form = document.getElementById("signup-form");
const msg = document.getElementById("msg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage(msg, "");
  if (!form.reportValidity()) return;

  const v = formValues(form);

  if (v.password !== v.confirm) {
    showMessage(msg, "Passwords don't match.");
    form.elements.confirm.focus();
    return;
  }

  // Recovery questions are all-or-nothing: either three complete pairs or none.
  const pairs = [1, 2, 3].map((i) => ({ question: v[`q${i}`], answer: v[`a${i}`] }));
  const filled = pairs.filter((p) => p.question || p.answer);
  const complete = pairs.filter((p) => p.question && p.answer);
  if (filled.length > 0 && complete.length < 3) {
    showMessage(msg, "Recovery questions are optional, but if you set them, fill in all three questions and answers.");
    return;
  }

  const payload = {
    username: v.username,
    password: v.password,
    email: v.email || null,
    recovery: complete.length === 3 ? complete : null,
  };

  setBusy(form, true);
  try {
    await Api.post("/auth/signup", payload);
    location.href = "play.html";
  } catch (err) {
    showMessage(msg, err.message);
    setBusy(form, false);
  }
});
