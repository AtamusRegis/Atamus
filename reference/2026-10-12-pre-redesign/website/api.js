// Thin wrapper around the Atamus game server's HTTP API.
// The server runs at play.atamus.io; this static site only sends requests to it.
// Sessions are HTTP-only cookies set by the server, so we always send credentials.

// atamus.io talks to the live server; anything else (the private PTR copy) talks to whoever served the page
const API_BASE = /(^|\.)atamus\.io$/.test(location.hostname) ? "https://play.atamus.io" : location.origin;

// (owner) this browser's device id, made once and kept: the server allows one account at a time per device and looks at
// which devices an account logs in from (kept in memory for the page if storage is unavailable)
let deviceMem = null;
function deviceId() {
  try { let d = localStorage.getItem("atamus.device"); if (!/^[A-Za-z0-9_-]{16,64}$/.test(d || "")) { d = crypto.randomUUID().replace(/-/g, ""); localStorage.setItem("atamus.device", d); } return d; }
  catch { return deviceMem || (deviceMem = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("")); }
}
const timeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } };

// (owner) returning players always come through the log-in page (this tab must have logged in) before play.html and the
// game; on the live site only (the PTR is always signed in)
const LIVE_SITE = /(^|\.)atamus\.io$/.test(location.hostname);
function markLoggedIn() { try { sessionStorage.setItem("atamus.in", "1"); } catch {} }
function needLogin() { if (!LIVE_SITE) return false; try { return sessionStorage.getItem("atamus.in") !== "1"; } catch { return false; } }
// (owner) Remember Password: a token from the server for this account on this browser (never the password itself)
const Remember = {
  get() { try { const r = JSON.parse(localStorage.getItem("atamus.remember") || "null"); return r && typeof r.u === "string" && typeof r.t === "string" ? r : null; } catch { return null; } },
  set(u, t) { try { localStorage.setItem("atamus.remember", JSON.stringify({ u, t })); } catch {} },
  clear() { const r = Remember.get(); try { localStorage.removeItem("atamus.remember"); } catch {} if (r) Api.post("/auth/remember/forget", { token: r.t }).catch(() => {}); },
};

const Api = {
  /**
   * POST JSON to the server. Resolves with the parsed JSON body.
   * Rejects with an Error whose .message is safe to show to the user.
   */
  async post(path, body) {
    let res;
    try {
      res = await fetch(API_BASE + path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(/^\/auth\/(login|signup)$/.test(path) ? { ...(body ?? {}), device: deviceId(), tz: timeZone() } : (body ?? {})),
      });
    } catch {
      throw new Error("Can't reach the Atamus server right now. Please try again in a moment.");
    }

    let data = {};
    try { data = await res.json(); } catch { /* empty body is fine */ }

    if (!res.ok) {
      const e = new Error(data.error || `Request failed (${res.status}).`); e.status = res.status; e.data = data; throw e;
    }
    return data;
  },

  async get(path) {
    let res;
    try {
      res = await fetch(API_BASE + path, { credentials: "include" });
    } catch {
      throw new Error("Can't reach the Atamus server right now. Please try again in a moment.");
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty body is fine */ }
    if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status}).`); e.status = res.status; throw e; }
    return data;
  },
};

// ---- small helpers shared by the auth pages ----

function showMessage(el, text, kind = "error") {
  el.textContent = text;
  el.dataset.kind = kind;
  el.hidden = !text;
}

function setBusy(form, busy) {
  for (const el of form.elements) el.disabled = busy;
  form.classList.toggle("is-busy", busy);
}

function formValues(form) {
  const out = {};
  for (const [k, v] of new FormData(form)) out[k] = typeof v === "string" ? v.trim() : v;
  return out;
}
