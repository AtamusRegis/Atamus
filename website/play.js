// (owner, 2026-10-18) No login: create a name and play. A token cookie owns the pilot; returning browsers find their
// name filled in. The update-wait flow stays: a live push sends every client here until the new build is up.
const params = new URLSearchParams(location.search);
const updateStep = document.getElementById("update-step");
const nameForm = document.getElementById("name-form"), nameIn = document.getElementById("name-in"), nameMsg = document.getElementById("name-msg");

async function showEntry() {
  try { const u = await Api.get("/auth/guest"); if (u && u.name) { nameIn.value = u.name; document.getElementById("title").textContent = "Welcome back"; } } catch {}
  nameForm.hidden = false;
  if (!nameIn.value) nameIn.focus();
}

// Sent here by an update countdown: wait until the new version is live, then let them back in. (owner, 2026-10-14) Not a
// timer: with ?to= (the commit going live) the page waits for exactly that version on the server (its build) and the
// website (version.json), then lets everyone back in at once. Each check gives up after 4 s; a reload carries on the
// same wait. Only if the deploy never lands does a 5-minute backstop let them in anyway.
const getJson = (url) => { const c = new AbortController(), t = setTimeout(() => c.abort(), 4000); return fetch(url, { cache: "no-store", signal: c.signal }).then((r) => r.json()).finally(() => clearTimeout(t)); };
async function waitForUpdate() {
  updateStep.hidden = false; nameForm.hidden = true;
  const parts = (params.get("parts") || "server,web").split(","), web = params.get("web"), srv = params.get("srv");
  const to = /^[0-9a-f]{7,40}$/.test(params.get("to") || "") ? params.get("to") : "";
  let started = Date.now();
  try { const k = "atamus.updWait:" + location.search, s0 = +sessionStorage.getItem(k); if (s0 && Date.now() - s0 < 600_000) started = s0; else sessionStorage.setItem(k, String(started)); } catch {}
  const webLive = async () => { try { const j = await getJson("version.json?t=" + Date.now()); if (!(!!j.v && ((to && j.v === to) || (!!web && j.v !== web) || (!to && !web)))) return false;
    if (!to) return true;
    const c = new AbortController(), t = setTimeout(() => c.abort(), 4000);
    try { const h = await (await fetch("game.html?t=" + Date.now(), { cache: "no-store", signal: c.signal })).text(); return h.includes('content="' + to + '"'); } finally { clearTimeout(t); } } catch { return false; } };
  const srvDone = async () => { try { return !(await getJson(API_BASE + "/game/update-status?t=" + Date.now())).updating; } catch { return false; } };
  const srvLive = async () => { try { const b = (await getJson(API_BASE + "/healthz?t=" + Date.now())).build; if (!b) return false; return (to && to.startsWith(b)) || (!!srv && b !== srv) || (!srv && !to); } catch { return false; } };
  for (;;) {
    const live = (!parts.includes("web") || await webLive()) && (!parts.includes("server") || await srvLive()) && await srvDone();
    if (live || Date.now() - started > 300_000) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  updateStep.hidden = true;
  history.replaceState(null, "", "play.html");
  await showEntry();
}

nameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameIn.value.trim(); if (!name) return;
  nameMsg.hidden = true;
  const btn = document.getElementById("enter-btn"); btn.disabled = true;
  try {
    await Api.post("/auth/guest", { name });
    location.href = "game.html?cb=" + Date.now();
  } catch (err) {
    nameMsg.textContent = err.message || "Try again."; nameMsg.hidden = false; btn.disabled = false;
  }
});

// an update in progress (its countdown started, or it hasn't fully landed): the wait page instead of the name form
async function gate() {
  let u = null; try { u = (await getJson(API_BASE + "/game/update-status?t=" + Date.now())).updating; } catch {}
  if (u) { const q = new URLSearchParams({ updating: "1", parts: (u.parts || ["server", "web"]).join(",") }); if (u.to) q.set("to", u.to); location.replace("play.html?" + q.toString()); return; }
  await showEntry();
}
if (params.get("updating")) waitForUpdate();
else gate();
