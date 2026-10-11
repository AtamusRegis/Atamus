// (owner) the front page, signed in: straight to the welcome-back page (a script file, for the Content-Security-Policy)
// already signed in: straight to the welcome-back page
fetch((/(^|\.)atamus\.io$/.test(location.hostname) ? "https://play.atamus.io" : location.origin) + "/auth/me", { credentials: "include" })
  .then((r) => { if (r.ok) location.replace("play.html"); }).catch(() => {});
