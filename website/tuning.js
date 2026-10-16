// (owner, 2026-10-15) The Tuning panel (staff: head admin, admins, developers; T in the staff column): the numbers of the
// faction you're flying (Ship, Weapon, Secondary), changed live for everyone. Each field drags sideways (numdrag.js);
// a change goes to the server, which clamps it, keeps it and sends every client the new numbers.
(function () {
  const LABEL = {
    ship: { hp: "Health", speed: "Speed", shield: "Shield", regen: "Shield Regen", resist: "Armor", load: "Load Radius", farIn: "Sight Fade Start", farOut: "Sight Range", visLo: "Visible From", visHi: "Solid At", cloudDeep: "Nebula Depth", cloudIn: "Nebula Floor" },
    weapon: { optimal: "Range", dps: "Damage / s", fall: "Falloff", falloff: "Falloff %", rotSpeed: "Turn Speed", life: "Lifetime", speed: "Speed", drag: "Drag", rate: "Fire Interval", dmg: "Damage", spread0: "Spread", spreadAdd: "Spread / Shot", aimSpeed: "Aim Recovery", reload: "Reload", mag: "Magazine" },
    second: { n: "Count", gap: "Gap", cd: "Cooldown", speed: "Speed", life: "Lifetime", turn: "Turn", pull: "Pull Range", seek: "Seek Range", pick: "Pick Range", aim: "Max Range", zig: "Zigzag", zigHz: "Zigzag Rate", blast: "Blast Radius", dmg: "Damage", dps: "Damage / s", decay: "Decay / s", orbit: "Orbit Gap", spin: "Orbit Speed", zap: "Zap Interval", hp: "Health", r: "Hitbox" },
  };
  const TITLE = { ship: "SHIP", weapon: "WEAPON", second: "SECONDARY" }, SIDE = { blue: "BLUE", red: "YELLOW" };
  let send = () => {}, win = null, btn = null, body = null, head = null, facs = {}, side = null, open = false;
  const $ = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const stepOf = (v) => (Math.abs(v) <= 2 ? 0.01 : Math.abs(v) < 20 ? 0.1 : 1);
  const timers = new Map();
  function draw() {
    if (!win || win.hidden) return;
    const F = facs[side]; head.textContent = "TUNING" + (SIDE[side] ? " · " + SIDE[side] : "");
    const focused = document.activeElement && win.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    if (!F) { body.textContent = ""; return; }
    if (body.dataset.side === side && body.childElementCount) {   // just refresh the numbers (not the one being edited)
      for (const i of body.querySelectorAll("input")) { if (i.dataset.key === focused || document.body.classList.contains("num-dragging")) continue; const o = i.dataset.g === "ship" ? F : F[i.dataset.g]; if (o && typeof o[i.dataset.k] === "number") i.value = String(o[i.dataset.k]); }
      return;
    }
    body.textContent = ""; body.dataset.side = side;
    for (const g of ["ship", "weapon", "second"]) {
      const o = g === "ship" ? F : F[g]; if (!o) continue;
      const sec = $("div", "tn-sec"); sec.append($("div", "tn-head", TITLE[g]));
      for (const [k, lab] of Object.entries(LABEL[g])) {
        if (typeof o[k] !== "number") continue;
        const row = $("label", "tn-row"), inp = $("input"); inp.type = "number"; inp.step = String(stepOf(o[k])); inp.value = String(o[k]);
        inp.dataset.g = g; inp.dataset.k = k; inp.dataset.key = g + "." + k;
        inp.addEventListener("input", () => {
          const v = Number(inp.value); if (!Number.isFinite(v)) return;
          clearTimeout(timers.get(inp.dataset.key)); timers.set(inp.dataset.key, setTimeout(() => send({ t: "tune", s: side, g, k, v }), 120));
        });
        row.append($("span", "tn-lab", lab), inp); sec.append(row);
      }
      body.append(sec);
    }
  }
  function toggle(v) {
    open = v === undefined ? !open : !!v; win.hidden = !open; btn.classList.toggle("on", open);
    if (open) { body.dataset.side = ""; draw(); if (window.WinPos) window.WinPos.place(win, "tune"); }
  }
  window.Tuning = {
    mount(o) {
      send = o.send || send; if (win) return;
      btn = $("button", null, "T"); btn.type = "button"; btn.id = "tune-btn"; btn.title = "Tuning"; btn.addEventListener("click", () => toggle());
      (document.getElementById("staff-col") || document.body).appendChild(btn);
      win = $("div"); win.id = "tune-panel"; win.hidden = true;
      const top = $("div", "we-top"); head = $("span", "we-title", "TUNING"); const x = $("button", "we-x", "×"); x.type = "button"; x.addEventListener("click", () => toggle(false));
      top.append(head, x);
      top.addEventListener("pointerdown", (e) => {   // dragged by its top bar
        if (e.button !== 0 || e.target.closest("button")) return; e.preventDefault();
        const r0 = win.getBoundingClientRect(), ox = e.clientX - r0.left, oy = e.clientY - r0.top;
        win.style.transform = "none"; win.style.left = r0.left + "px"; win.style.top = r0.top + "px";
        const mv = (ev) => { const r = win.getBoundingClientRect(); win.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - ox)) + "px"; win.style.top = Math.max(0, Math.min(innerHeight - r.height, ev.clientY - oy)) + "px"; };
        const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
        addEventListener("pointermove", mv); addEventListener("pointerup", up);
      });
      if (window.WinPos) window.WinPos.watch(top, win, "tune");
      body = $("div", "tn-body"); win.append(top, body); document.body.appendChild(win);
    },
    set(f, s) { if (f && typeof f === "object") facs = f; if (s !== undefined) side = s; draw(); },
  };
})();
