// Client checks in headless Chromium against the PTR: only the Player and Pilot windows exist, click / tap flies,
// drag pans, clicking your ship follows it again, the pinch and wheel zoom, windows survive a reload and fit a phone.
// No page errors allowed.
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import { suite, BASE } from "./lib.mjs";
const t = suite("ui");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const errors = [];
async function open(w, h, touch) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: !!touch });
  page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(BASE + "/game.html");
  await page.waitForFunction(() => window.Atamus && window.Atamus.cfg && window.Atamus.myShip, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  return page;
}
const run = (page, body) => page.evaluate(`(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms)), A = window.Atamus, c = document.getElementById("view");
  const wins = () => [...document.querySelectorAll(".win")].filter((w) => !w.hidden).map((w) => w.dataset.id);
  const ev = (type, x, y, id = 1, kind = "mouse") => c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: kind, button: 0, clientX: x, clientY: y, bubbles: true }));
  ${body} })()`);

let page = await open(1280, 800);
let r = await run(page, `A.send({ t: "dev", cmd: "move", x: 0, y: 0 }); await s(500);
  return { btns: [...document.querySelectorAll(".wbtn")].map((b) => b.dataset.id), wins: wins() };`);
t.ok(r.btns.join() === "player,pilot", "the left panel has just the Player and Pilot windows", r.btns);
r = await run(page, `for (const b of document.querySelectorAll(".wbtn")) b.click(); await s(500);
  return { wins: wins(), player: document.querySelector('.win[data-id="player"]').innerText, pilot: document.querySelector('.win[data-id="pilot"]').innerText };`);
t.ok(r.wins.includes("player") && r.wins.includes("pilot"), "both open from the panel", r.wins);
t.ok(/Credits/.test(r.player) && /Vera Kestrel/.test(r.pilot), "the Player Sheet and the pilot's window", r);

// click = fly; drag = pan (the camera stops following); click your ship = follow again
r = await run(page, `for (const b of document.querySelectorAll(".win:not([hidden]) .win-close")) b.click();
  const W = innerWidth, H = innerHeight; ev("pointerdown", W / 2 + 200, H / 2); ev("pointerup", W / 2 + 200, H / 2); await s(600);
  const moving = A.myShip.moving, tx = A.myShip.tx;
  ev("pointerdown", 300, 300); ev("pointermove", 360, 340); ev("pointermove", 420, 380); ev("pointerup", 420, 380); await s(300);
  const afterDrag = A.view.follow;
  const own = A.myShip, sc = innerWidth / A.view.w, sx = W / 2 + (own.x - A.view.cx) * sc, sy = H / 2 - (own.y - A.view.cy) * sc;
  ev("pointerdown", sx, sy); ev("pointerup", sx, sy); await s(200);
  return { moving, tx, afterDrag, refollow: A.view.follow };`);
t.ok(r.moving && r.tx > 0, "a click on space flies the ship there", r);
t.ok(r.afterDrag === false, "dragging pans the camera off the ship", r);
t.ok(r.refollow === true, "clicking your ship follows it again", r);
r = await run(page, `for (let i = 0; i < 80; i++) c.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, clientX: 640, clientY: 400, bubbles: true, cancelable: true })); await s(800); const out = A.view.w;
  for (let i = 0; i < 80; i++) c.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: 640, clientY: 400, bubbles: true, cancelable: true })); await s(800); return { out, in: A.view.w };`);
t.ok(r.out > 20000 && r.in < 1, "the wheel zooms out to the whole hexagon and back in to the ship", r);

// reload keeps the windows that were open
await run(page, `document.querySelector('.wbtn[data-id="pilot"]').click(); await s(400);`);
await page.reload(); await page.waitForFunction(() => window.Atamus && window.Atamus.myShip); await page.waitForTimeout(1200);
r = await run(page, `return wins();`);
t.ok(r.includes("pilot"), "a reload brings back the open windows", r);
await run(page, `for (const b of document.querySelectorAll(".win:not([hidden]) .win-close")) b.click(); await s(200);`);
await page.close();

// phone: windows fit the screen, a pinch zooms, a tap flies
page = await open(844, 390, true);
r = await run(page, `for (const b of document.querySelectorAll(".wbtn")) b.click(); await s(500);
  const over = [...document.querySelectorAll(".win:not([hidden])")].filter((w) => { const b = w.getBoundingClientRect(); return b.right > innerWidth + 1 || b.bottom > innerHeight + 1; }).map((w) => w.dataset.id);
  for (const b of document.querySelectorAll(".win:not([hidden]) .win-close")) b.click(); await s(200);
  const w0 = A.view.w; ev("pointerdown", 400, 200, 1, "touch"); ev("pointerdown", 500, 200, 2, "touch"); ev("pointermove", 350, 200, 1, "touch"); ev("pointermove", 550, 200, 2, "touch"); ev("pointerup", 350, 200, 1, "touch"); ev("pointerup", 550, 200, 2, "touch"); await s(500);
  const w1 = A.view.w; ev("pointerdown", 700, 120, 3, "touch"); ev("pointerup", 700, 120, 3, "touch"); await s(500);
  return { over, w0, w1, moving: A.myShip.moving };`);
t.ok(!r.over.length, "windows fit a phone screen", r.over);
t.ok(r.w1 < r.w0, "a pinch zooms in", r);
t.ok(r.moving, "a tap flies the ship", r);
await run(page, `A.send({ t: "dev", cmd: "move", x: 0, y: 0 }); await s(300);`);
await page.close(); await browser.close();
t.ok(!errors.length, "no page errors", errors.slice(0, 5));
t.done();
