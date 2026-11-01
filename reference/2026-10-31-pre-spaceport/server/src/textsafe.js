// (owner, 2026-10-11) Every piece of text a player sends (chat, names, reasons, tickets, appeals) is cleaned before it's
// kept or shown to anyone: control characters, zero-width characters and the invisible direction overrides (used to make
// a name or line read as something it isn't) are removed, and the text is normalized. The pages always show text as text
// (never as HTML), and the website only runs its own scripts (a Content-Security-Policy), so text can't become code.
const BAD = /[\u0000-\u001F\u007F-\u009F­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ￰-￻]/g;
/** A player's text, safe to keep and show: normalized, invisible / control characters removed, whitespace squashed, cut to `max`. */
export function safeText(raw, max = 1000) {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFC").replace(/[\r\n\t]+/g, " ").replace(BAD, "").replace(/\s+/g, " ").trim().slice(0, max);
}
