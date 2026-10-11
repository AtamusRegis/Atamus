// Character portraits (owner, 2026-10-10): 32×32 pixel art stacked from four layers in assets/portraits/
// (background, head, shirt, hair), drawn crisp at any size. The part lists come from the server (/game/portraits),
// which checks every pick. Used by the play page (the character and pilot creators) and the game's windows.
(() => {
  "use strict";
  let parts = null, partsP = null;
  const imgs = {};
  const img = (src) => { if (!imgs[src]) { imgs[src] = new Image(); imgs[src].src = src; } return imgs[src]; };
  const layers = (p) => ["background/" + p.background, "head/skin_" + p.skin, "shirt/" + p.shirt + "_" + p.shirtColor, "hair/" + p.hair + "_" + p.hairColor].map((f) => img("assets/portraits/" + f + ".png"));
  const NAMES = { darkbrown: "Dark brown", deepspace: "Deep space" };
  const nice = (k) => NAMES[k] || (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, " ");

  /** Draw a portrait into a canvas (redraws as its layers finish loading). */
  function draw(cv, p) {
    cv.width = 32; cv.height = 32; const g = cv.getContext("2d"); g.imageSmoothingEnabled = false;
    if (!p) { g.clearRect(0, 0, 32, 32); return; }
    const ls = layers(p), paint = () => { g.clearRect(0, 0, 32, 32); for (const im of ls) if (im.naturalWidth) g.drawImage(im, 0, 0); };
    paint(); for (const im of ls) if (!im.complete) im.addEventListener("load", paint, { once: true });
  }
  /** A canvas showing a portrait at `size` CSS pixels. */
  function canvas(p, size, cls) {
    const cv = document.createElement("canvas"); cv.className = "portrait" + (cls ? " " + cls : "");
    cv.style.width = cv.style.height = size + "px"; draw(cv, p); return cv;
  }
  async function loadParts() { if (parts) return parts; partsP ||= Api.get("/game/portraits").then((j) => (parts = j)); return partsP; }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function random(gender) {
    const P = parts, g = gender || pick(["male", "female"]);
    return { gender: g, background: pick(P.background), skin: pick(P.skin), hair: pick(P.hair[g]), hairColor: pick(P.hairColor), shirt: pick(P.shirt), shirtColor: pick(P.shirtColor) };
  }

  /** The creator: a big preview, Male / Female, a ‹ › stepper per part and a randomize button. */
  async function builder(host, initial) {
    const P = await loadParts();
    let p = initial && initial.gender ? { ...initial } : random();
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    host.innerHTML = ""; host.classList.add("pb");
    const preview = canvas(p, 160, "pb-preview");
    const side = el("div", "pb-side");
    const sex = el("div", "pb-sex");
    const sexBtn = {};
    for (const [g, label] of [["male", "Male"], ["female", "Female"]]) {
      const b = el("button", "pb-sex-btn", label); b.type = "button";
      b.addEventListener("click", () => { if (p.gender === g) return; p.gender = g; if (!P.hair[g].includes(p.hair)) p.hair = P.hair[g][0]; render(); });
      sexBtn[g] = b; sex.append(b);
    }
    side.append(sex);
    const rows = [["skin", "Skin", () => P.skin], ["hair", "Hair", () => P.hair[p.gender]], ["hairColor", "Hair color", () => P.hairColor],
      ["shirt", "Outfit", () => P.shirt], ["shirtColor", "Outfit color", () => P.shirtColor], ["background", "Background", () => P.background]];
    const vals = {};
    for (const [k, label, list] of rows) {
      const step = (d) => { const a = list(), i = a.indexOf(p[k]); p[k] = a[(i + d + a.length) % a.length]; render(); };
      const prev = el("button", "pb-arrow", "‹"), next = el("button", "pb-arrow", "›"); prev.type = next.type = "button";
      prev.setAttribute("aria-label", label + " previous"); next.setAttribute("aria-label", label + " next");
      prev.addEventListener("click", () => step(-1)); next.addEventListener("click", () => step(1));
      vals[k] = el("span", "pb-val");
      side.append(el("div", "pb-row"));
      side.lastChild.append(el("span", "pb-label", label), prev, vals[k], next);
    }
    const dice = el("button", "btn btn-ghost pb-random", "Randomize"); dice.type = "button";
    dice.addEventListener("click", () => { p = random(p.gender); render(); });
    side.append(dice);
    host.append(preview, side);
    function render() {
      draw(preview, p);
      for (const g in sexBtn) sexBtn[g].classList.toggle("on", p.gender === g);
      for (const k in vals) vals[k].textContent = nice(p[k]);
    }
    render();
    return { get value() { return { ...p }; } };
  }

  window.Portrait = { draw, canvas, builder, loadParts };
})();
