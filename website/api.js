// Thin wrapper around the Atamus game server's HTTP API.
// The server runs at play.atamus.io; this static site only sends requests to it.
// Sessions are HTTP-only cookies set by the server, so we always send credentials.

const API_BASE = "https://play.atamus.io";

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
        body: JSON.stringify(body ?? {}),
      });
    } catch {
      throw new Error("Can't reach the Atamus server right now. Please try again in a moment.");
    }

    let data = {};
    try { data = await res.json(); } catch { /* empty body is fine */ }

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status}).`);
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
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
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
