// (owner, 2026-10-15) The Ship Editor (head admin and developers; S in the staff column): every number of the Blue and
// Yellow ships, changed live for everyone. Pick the team at the top (it opens on yours). Each field: type a number or drag
// sideways on it (numdrag.js); hovering a field's name says what it does and how its number changes it (the owner asked
// for these; everywhere else tooltips stay names only). The server clamps each value, keeps it and sends it to everyone.
(function () {
  // [key, label, group, description]
  const F = [
    ["hp", "Max Health", "Health", "How much hull damage the ship can take before it's destroyed. Higher = tougher. Its health bar is a share of this."],
    ["hpRegen", "Health Regen", "Health", "Health regained per second once Health Regen Delay has passed since the last damage. 0 = health never comes back until respawn."],
    ["hpDelay", "Health Regen Delay", "Health", "Seconds after taking any damage before health starts regenerating. Higher = no healing during a fight."],
    ["respawn", "Respawn Time", "Health", "Seconds a destroyed ship stays dead before it comes back near the center (then materializes for 3 s)."],
    ["speed", "Max Speed", "Movement", "Top speed flying forward, in m/s. Strafing and reversing are shares of this; boosting adds to it."],
    ["accel", "Acceleration", "Movement", "How fast the ship builds up speed, in m/s². Higher = reaches top speed sooner. Pushing off the nose gets only part of it."],
    ["brake", "Braking", "Movement", "How fast the ship slows down when no thrust is held, in m/s². Higher = stops shorter."],
    ["turn", "Turn Speed", "Movement", "Top turning rate for A / D, in degrees per second. Higher = turns around faster."],
    ["turnAccel", "Turn Acceleration", "Movement", "How fast turning spins up and eases off, in degrees per second². Higher = snappier turns; lower = a heavier feel."],
    ["strafe", "Strafe Speed", "Movement", "Top speed pushing sideways (Q / E), as a % of Max Speed. 100 = as fast as forward."],
    ["reverse", "Reverse Speed", "Movement", "Top speed backing up (S), as a % of Max Speed. 100 = as fast as forward."],
    ["boost", "Speed Boost", "Movement", "Extra speed while Shift is held flying forward, as a % on top of Max Speed. 0 = no boost."],
    ["boostCap", "Boost Capacitor Use", "Movement", "Capacitor used per second while boosting. Higher = shorter boosts."],
    ["boostMin", "Boost Minimum", "Movement", "Once the capacitor runs dry, how much it must refill before boosting works again."],
    ["armor", "Armor", "Defense", "Damage Reduction: the % of hull damage taken off. 50 = hull takes half. Shields aren't affected."],
    ["shield", "Max Shield", "Defense", "Shield points that take damage before the hull. 0 = no shield."],
    ["shRegen", "Shield Regen", "Defense", "Shield regained per second once Shield Regen Delay has passed since the last damage. A broken shield refills at this rate too, but only by spending capacitor."],
    ["shDelay", "Shield Regen Delay", "Defense", "Seconds after taking any damage before the shield starts regenerating."],
    ["shRestoreCap", "Shield Restore Cost", "Defense", "Capacitor spent per shield point to restore a broken shield (one knocked to 0). Higher = slower to come back while the capacitor is low. 0 = free."],
    ["cap", "Max Capacitor", "Capacitor", "The capacitor's size. Boosting, firing (if Capacitor Use is set) and restoring a broken shield draw from it."],
    ["capRegen", "Capacitor Regen", "Capacitor", "Capacitor regained per second, always."],
    ["wtype", "Weapon Type", "Weapon", "Bullets: separate shots that fly and can spread. Beam: a constant line held on target, damage every moment it touches."],
    ["dmg", "Damage", "Weapon", "Bullets: damage per bullet. Beam: damage per second while it touches. Full out to Optimal Range."],
    ["optimal", "Optimal Range", "Weapon", "Distance in meters out to which the weapon does 100% damage (and bullets keep full speed)."],
    ["falloff", "Falloff Range", "Weapon", "Meters past Optimal Range over which damage drops off. Max range = Optimal + Falloff: the beam's end, or where bullets vanish."],
    ["dmgEnd", "Damage at Max Range", "Weapon", "The % of Damage left at max range. 100 = no drop-off; 0 = nothing at the very end."],
    ["dmgCurve", "Damage Dropoff Curve", "Weapon", "The drop-off's shape past optimal. 1 = a straight line; above 1 holds strong longer and drops late; below 1 drops early."],
    ["mag", "Ammo per Reload", "Weapon", "Ammo in a full magazine. Bullets use 1 each; a beam drains it while firing."],
    ["rate", "Ammo Use Rate", "Weapon", "Ammo used per second. Bullets: shots per second. Beam: how fast firing drains the magazine."],
    ["reload", "Reload Time", "Weapon", "Seconds to reload. An empty magazine reloads by itself; R reloads early."],
    ["bspeed", "Bullet Speed", "Weapon", "Bullets: speed in m/s out to Optimal Range."],
    ["spdEnd", "Bullet Speed at Max Range", "Weapon", "Bullets: the % of Bullet Speed left at max range. 100 = they never slow down."],
    ["spdCurve", "Bullet Speed Dropoff Curve", "Weapon", "Bullets: the slowdown's shape past optimal. 1 = a straight line; above 1 keeps speed longer; below 1 slows early."],
    ["spread0", "Default Spread", "Weapon", "Bullets: degrees each way the shots can stray at rest. 0 = dead accurate."],
    ["spreadMax", "Max Spread", "Weapon", "Bullets: the most degrees each way the spread can grow to."],
    ["spreadAdd", "Spread per Bullet", "Weapon", "Bullets: degrees each way every shot adds to the spread."],
    ["spreadBack", "Spread Aim Speed", "Weapon", "Bullets: degrees per second the spread closes back in when not firing. Higher = steadier bursts."],
    ["rot", "Weapon Rotation Speed", "Weapon", "Degrees per second the aim turns toward the pointer. Lower = slower to track targets (beams turn at this on the server too)."],
    ["capUse", "Capacitor Use", "Weapon", "Capacitor per bullet; a beam: per second while firing. 0 = free. Out of capacitor: no firing."],
  ];
  const GROUPS = ["Health", "Movement", "Defense", "Capacitor", "Weapon"], TEAMS = [["blue", "Blue"], ["red", "Yellow"]];
  let send = () => {}, win = null, btn = null, body = null, tabs = null, ships = {}, team = null, mine = null, open = false, range = {};
  const $ = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const stepOf = (lo, hi) => (hi <= 1 ? 1 : hi <= 10 ? 0.05 : hi <= 100 ? 0.1 : 1);
  const timers = new Map(), inputs = new Map();
  function build() {
    body.textContent = ""; inputs.clear();
    for (const g of GROUPS) {
      const sec = $("div", "se-sec"); sec.append($("div", "se-head", g.toUpperCase()));
      for (const [k, label, grp, desc] of F) {
        if (grp !== g) continue;
        const row = $("label", "se-row"), lab = $("span", "se-lab", label); lab.title = desc; row.title = desc;
        let el;
        if (k === "wtype") { el = $("select"); el.append(new Option("Bullets", "0"), new Option("Beam", "1")); el.addEventListener("change", () => { sendNow(k, Number(el.value)); el.blur(); }); }
        else {
          const [lo, hi] = range[k] || [0, 100000]; el = $("input"); el.type = "number"; el.min = String(lo); el.max = String(hi); el.step = String(stepOf(lo, hi));
          el.addEventListener("input", () => { const v = Number(el.value); if (el.value === "" || !Number.isFinite(v)) return; clearTimeout(timers.get(k)); timers.set(k, setTimeout(() => sendNow(k, v), 120)); });
          el.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") el.blur(); });
        }
        el.dataset.k = k; inputs.set(k, el); row.append(lab, el); sec.append(row);
      }
      body.append(sec);
    }
  }
  const sendNow = (k, v) => send({ t: "ship", s: team, k, v });
  function fill() {
    const S = ships[team] || {};
    for (const [k, el] of inputs) { if (document.activeElement === el || document.body.classList.contains("num-dragging")) continue; if (typeof S[k] === "number") el.value = String(S[k]); }
    for (const b of tabs.children) b.classList.toggle("on", b.dataset.s === team);
  }
  function toggle(v) {
    open = v === undefined ? !open : !!v; win.hidden = !open; btn.classList.toggle("on", open);
    if (open) { if (!team) team = mine || "blue"; fill(); if (window.WinPos) window.WinPos.place(win, "shipedit"); }
  }
  window.ShipEditor = {
    mount(o) {
      send = o.send || send; if (Array.isArray(o.fields)) for (const [k, lo, hi] of o.fields) range[k] = [lo, hi];
      if (win) { build(); fill(); return; }
      btn = $("button", null, "S"); btn.type = "button"; btn.id = "ship-btn"; btn.title = "Ship Editor"; btn.addEventListener("click", () => toggle());
      (document.getElementById("staff-col") || document.body).appendChild(btn);
      win = $("div"); win.id = "ship-panel"; win.hidden = true;
      const top = $("div", "we-top"), x = $("button", "we-x", "×"); x.type = "button"; x.addEventListener("click", () => toggle(false));
      top.append($("span", "we-title", "SHIP EDITOR"), x);
      top.addEventListener("pointerdown", (e) => {   // dragged by its top bar
        if (e.button !== 0 || e.target.closest("button")) return; e.preventDefault();
        const r0 = win.getBoundingClientRect(), ox = e.clientX - r0.left, oy = e.clientY - r0.top;
        win.style.transform = "none"; win.style.left = r0.left + "px"; win.style.top = r0.top + "px";
        const mv = (ev) => { const r = win.getBoundingClientRect(); win.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - ox)) + "px"; win.style.top = Math.max(0, Math.min(innerHeight - r.height, ev.clientY - oy)) + "px"; };
        const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
        addEventListener("pointermove", mv); addEventListener("pointerup", up);
      });
      if (window.WinPos) window.WinPos.watch(top, win, "shipedit");
      tabs = $("div", "se-tabs"); for (const [s, n] of TEAMS) { const b = $("button", "se-tab", n); b.type = "button"; b.dataset.s = s; b.addEventListener("click", () => { team = s; fill(); }); tabs.append(b); }
      body = $("div", "se-body"); win.append(top, tabs, body); document.body.appendChild(win);
      win.addEventListener("pointerdown", (e) => e.stopPropagation());
      build();
    },
    set(s, side) { if (s && typeof s === "object") ships = s; if (side !== undefined && side !== mine) { mine = side; if (!open) team = side; } if (win && open) fill(); },
  };
})();
