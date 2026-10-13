// (owner) runs first on the game page: the phone layout and landscape lock (moved out of the page for the
// Content-Security-Policy: pages run only script files from this site)
// Phones: lay the page out on a larger canvas and scale it down, so the whole UI is ~30% smaller.
(function () {
  var meta = document.querySelector('meta[name="viewport"]');
  function fit() {
    var sw = screen.width, sh = screen.height, small = Math.min(sw, sh);
    var phone = window.matchMedia("(pointer: coarse)").matches && small < 600;
    document.documentElement.classList.toggle("phone", phone);   // (owner) phones get their own compact layouts (game.css .phone)
    if (!phone) { meta.content = "width=device-width, initial-scale=1"; return; }
    var s = Math.max(0.6, Math.min(1, small / 540));
    var w = window.matchMedia("(orientation: landscape)").matches ? Math.max(sw, sh) : small;
    meta.content = "width=" + Math.round(w / s) + ", initial-scale=" + s + ", minimum-scale=" + s + ", maximum-scale=" + s + ", user-scalable=no";
  }
  fit();
  addEventListener("orientationchange", function () { setTimeout(fit, 150); });
  // Phones (not tablets) play in landscape (owner). Browsers only allow an orientation lock in fullscreen, and
  // fullscreen needs a tap: so the first tap goes fullscreen and locks landscape (again after leaving fullscreen).
  function isPhone() { return window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600; }
  function lockLandscape() {
    if (!isPhone() || !screen.orientation || !screen.orientation.lock) return;
    var go = function () { screen.orientation.lock("landscape").catch(function () {}); };
    if (document.fullscreenElement) go();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: "hide" }).then(go).catch(function () {});
  }
  addEventListener("touchend", function () { if (!document.fullscreenElement) lockLandscape(); }, { passive: true });
})();
