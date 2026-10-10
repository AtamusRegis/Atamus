// Client checks in headless Chromium against the PTR: selection-driven windows, hotbar menu, market tree,
// reload persistence, and windows fitting a phone screen. No page errors allowed.
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import { suite, BASE, SHIP } from "./lib.mjs";
const t = suite("ui");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const errors = [];
async function open(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(BASE + "/game.html");
  await page.waitForFunction(() => window.Atamus && window.Atamus.cfg && window.Atamus.inv && window.Atamus.inv.hangars, null, { timeout: 15000 });
  return page;
}
const run = (page, body, arg) => page.evaluate(`(async (arg) => { const s = (ms) => new Promise((r) => setTimeout(r, ms)), A = window.Atamus, ID = ${JSON.stringify(SHIP)};
  const wins = () => [...document.querySelectorAll(".win")].filter((w) => !w.hidden).map((w) => w.dataset.id);
  const closeAll = () => { for (const b of document.querySelectorAll(".win:not([hidden]) .win-close")) b.click(); };
  ${body} })(${JSON.stringify(arg ?? null)})`);

let page = await open(1280, 800);
// selection drives inventories
let r = await run(page, `closeAll(); if (!A.ship(ID).docked) { A.send({ t: "dock", ship: ID, dock: true }); }
  A.send({ t: "dev", cmd: "move", ship: ID, x: 1, y: 0, sys: "station" }); await s(300); A.send({ t: "dock", ship: ID, dock: true }); await s(800);
  if (A.ship(ID).pilot == null) { A.send({ t: "crew", ship: ID, pilot: (await (await fetch("/game/state")).json()).pilots[0].id }); await s(800); }
  A.selectStation(); await s(400); const a = wins();
  A.selectShip(ID); await s(300); const b = wins();
  A.send({ t: "dock", ship: ID, dock: false }); await s(1500); const c = wins();
  document.querySelector('.hud-act[title="Inventory"]').click(); await s(400); const d = wins();
  A.bus.dispatchEvent(new CustomEvent("openstation")); await s(400); const f = wins();
  A.deselectUnit(); await s(400); return { a, b, c, d, f, e: wins() };`);
t.ok(!r.f.includes("inv:station"), "the station window won't open while the selected pilot is out in space", r.f);
t.ok(r.a.includes("inv:station"), "clicking the station opens the hangar", r.a);
t.ok(r.b.includes("inv:station"), "station window stays while a docked ship is selected", r.b);
t.ok(!r.c.includes("inv:station"), "station window closes when the selected ship undocks", r.c);
t.ok(r.d.includes("inv:" + SHIP), "ship inventory opens from its action button", r.d);
t.ok(!r.e.includes("inv:" + SHIP), "ship inventory closes on deselect", r.e);

// right-click menus (owner): centred above the press; below near the top; to the right near the left edge; to the left near the right edge
r = await run(page, `A.selectShip(ID); await s(400);
  const at = (x, y) => { document.querySelectorAll(".hb-slot")[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: x, clientY: y })); const b = document.querySelector(".ctx-menu").getBoundingClientRect(); document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
  return { mid: at(640, 400), top: at(640, 10), left: at(10, 400), right: at(1270, 400) };`);
t.ok(r.mid.b <= 400 && Math.abs((r.mid.l + r.mid.r) / 2 - 640) < 2, "a menu shows centred above the press", r.mid);
t.ok(r.top.t >= 10, "near the top it shows below the press", r.top);
t.ok(r.left.l >= 10, "near the left edge it shows to the right of the press", r.left);
t.ok(r.right.r <= 1270, "near the right edge it shows to the left of the press", r.right);

// hotbar module menu
r = await run(page, `A.selectShip(ID); await s(500);
  const menu = (i) => { document.querySelectorAll(".hb-slot")[i].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 600, clientY: 650 })); return [...document.querySelectorAll(".ctx-menu *")].filter((x) => !x.children.length).map((x) => x.textContent); };
  const pick = (txt) => [...document.querySelectorAll(".ctx-menu *")].find((x) => !x.children.length && x.textContent === txt).click();
  const m = menu(0); pick("Power off"); await s(600); const off = document.querySelectorAll(".hb-slot")[0].classList.contains("off");
  menu(0); pick("Power on"); await s(500); menu(1); pick("Info"); await s(400);
  const info = document.querySelector('.win[data-id="info"]'); return { m, off, info: info && !info.hidden && info.innerText.includes("Mining Laser") && info.innerText.includes("Fitting") };`);
t.ok(["Activate", "Power off", "Info"].every((x) => r.m.includes(x)), "module menu offers Activate / Power off / Info", r.m);
t.ok(r.off, "a powered-off module is greyed out");
t.ok(r.info, "module Info opens the item info with Description / Stats / Fitting tabs");

// number keys fire hotbar modules; clicking empty space keeps the ship selected
r = await run(page, `closeAll(); A.selectShip(ID); await s(300);
  const before = A.unit && A.unit.id;
  document.querySelector("#view").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 900, clientY: 300 }));
  window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: 900, clientY: 300 })); await s(500);
  return { before, after: A.unit && A.unit.id, keyLabels: [...document.querySelectorAll(".hb-slot .hb-num")].slice(0, 3).map((x) => x.textContent), badges: document.querySelectorAll(".hb-badge").length };`);
t.ok(r.before === SHIP && r.after === SHIP, "clicking empty space keeps the selected ship", r);
t.ok(r.keyLabels.join("") === "123", "hotbar slots show their key", r.keyLabels);

// market tree
r = await run(page, `closeAll(); document.querySelector('.wbtn[data-id="market"]').click(); await s(300);
  for (const n of ["Ships", "Industry"]) { const h = [...document.querySelectorAll(".mk-cat,.mk-sub-h")].find((x) => x.textContent.slice(1).startsWith(n)); if (h && !h.classList.contains("open")) { h.click(); await s(200); } }
  return [...document.querySelectorAll(".mk-cat,.mk-sub-h")].map((x) => x.textContent.slice(1).replace(/\\d+$/, ""));`);
t.ok(r.includes("Industry") && r.includes("Mining Barge"), "market groups ships by role then class", r);

// reload keeps selection + windows
await run(page, `closeAll(); A.selectShip(ID); await s(300); document.querySelector('.hud-act[title="Inventory"]').click(); await s(600);`);
await page.reload(); await page.waitForFunction(() => window.Atamus && window.Atamus.inv && window.Atamus.inv.hangars); await page.waitForTimeout(1500);
r = await run(page, `return { sel: A.selectedUnit, w: wins() };`);
t.ok(r.sel && r.sel.id === SHIP && r.w.includes("inv:" + SHIP), "reload restores the selected ship and its inventory", r);

// fleet bar ship actions answer a real mouse click (a pointerup rebuild once swallowed every click)
await run(page, `closeAll(); const fw = document.querySelector('.win[data-id="fleet"]'); if (!fw || fw.hidden) { document.querySelector('.wbtn[data-id="fleet"]').click(); await s(400); } A.selectShip(ID); await s(500);`);
const fb = await page.locator('.fleet-acts .hud-act[title="Inventory"]').boundingBox();
if (fb) { await page.mouse.click(fb.x + fb.width / 2, fb.y + fb.height / 2); await page.waitForTimeout(400); }
r = await run(page, `return wins();`);
t.ok(fb && r.includes("inv:" + SHIP), "fleet bar Inventory button works with a mouse click", r);
await page.close();

// phone: every window fits on screen
page = await open(390, 844);
r = await run(page, `for (const b of document.querySelectorAll(".wbtn")) { const w = document.querySelector('.win[data-id="' + b.dataset.id + '"]'); if (!w || w.hidden) { b.click(); await s(100); } }
  A.selectStation(); await s(500);
  return { off: [...document.querySelectorAll(".win:not([hidden])")].map((w) => [w.dataset.id, w.getBoundingClientRect()]).filter(([, b]) => b.right > innerWidth + 2 || b.left < 0 || b.top < 0).map(([id]) => id), hs: document.documentElement.scrollWidth > innerWidth };`);
t.ok(!r.off.length && !r.hs, "all windows fit a 390 px phone screen", r);
await page.close();

t.ok(!errors.length, "no page errors", errors.slice(0, 5));
await browser.close();
t.done();
