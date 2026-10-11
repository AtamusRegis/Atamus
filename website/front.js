// (owner) the front page, signed in: to the log-in page (a script file, for the Content-Security-Policy)
fetch((/(^|\.)atamus\.io$/.test(location.hostname) ? "https://play.atamus.io" : location.origin) + "/auth/me", { credentials: "include" })
  .then((r) => { if (r.ok) location.replace("login.html"); }).catch(() => {});   // (owner) returning players log in first
