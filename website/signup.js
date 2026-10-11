const form = document.getElementById("signup-form");
// (owner) the EULA opens in a window here; its box can be ticked only once it's been scrolled to the bottom
{
  const box = form.elements.eula, label = box.closest("label");
  const open = async (e) => {
    e.preventDefault(); e.stopPropagation();
    let html = "";
    try { const d = new DOMParser().parseFromString(await (await fetch("eula.html", { cache: "no-cache" })).text(), "text/html"), a = d.querySelector(".eula"); a.querySelector("h1")?.remove(); a.querySelectorAll("a[href='signup.html']").forEach((x) => x.closest("p")?.remove()); html = a.innerHTML; }
    catch { location.href = "eula.html"; return; }
    const ov = document.createElement("div"); ov.className = "ulog-overlay";
    ov.innerHTML = '<div class="ulog-win card" role="dialog" aria-modal="true" aria-labelledby="eula-title"><div class="ulog-head"><h2 id="eula-title" class="brand">End User License Agreement</h2><button type="button" class="ulog-close" aria-label="Close">×</button></div><div class="ulog-body eula-text"></div></div>';
    const body = ov.querySelector(".ulog-body"); body.innerHTML = html;
    const read = () => { if (body.scrollTop + body.clientHeight >= body.scrollHeight - 6) { box.disabled = false; label.classList.add("ready"); } };
    body.addEventListener("scroll", read);
    const close = () => { ov.remove(); document.body.style.overflow = ""; removeEventListener("keydown", esc); };
    const esc = (k) => { if (k.key === "Escape") close(); };
    ov.addEventListener("click", (x) => { if (x.target === ov || x.target.closest(".ulog-close")) close(); });
    addEventListener("keydown", esc);
    document.body.append(ov); document.body.style.overflow = "hidden"; requestAnimationFrame(read);
  };
  document.getElementById("eula-link").addEventListener("click", open);
  label.addEventListener("click", (e) => { if (box.disabled) open(e); });
}
// (owner) what was typed on the login page before Create account: username, password and its confirmation filled in
try {
  const pre = JSON.parse(sessionStorage.getItem("atamus.signup") || "null"); sessionStorage.removeItem("atamus.signup");
  if (pre) { if (pre.u) form.elements.username.value = pre.u; if (pre.p) { form.elements.password.value = pre.p; form.elements.confirm.value = pre.p; } }
} catch {}
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
    eula: form.elements.eula.checked,   // (owner) the EULA, read and agreed
  };

  setBusy(form, true);
  try {
    await Api.post("/auth/signup", payload);
    markLoggedIn();
    location.href = "play.html";
  } catch (err) {
    showMessage(msg, err.message);
    setBusy(form, false);
  }
});
