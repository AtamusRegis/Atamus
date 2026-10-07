const who = document.getElementById("who");
const logoutBtn = document.getElementById("logout");

// Gate the page: if not logged in, go back to the login screen.
Api.get("/auth/me")
  .then((me) => { who.textContent = me.username; })
  .catch(() => { location.href = "index.html"; });

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  try { await Api.post("/auth/logout"); } catch { /* clear client-side regardless */ }
  location.href = "index.html";
});
