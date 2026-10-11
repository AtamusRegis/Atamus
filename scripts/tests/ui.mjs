// Client checks in headless Chromium against the PTR: only the Player and Pilot windows exist, click / tap flies,
// drag pans, clicking your ship follows it again, the pinch and wheel zoom, windows survive a reload and fit a phone.
// No page errors allowed.
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import { suite, BASE, SHIP as A_SHIP } from "./lib.mjs";
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
t.ok(r.btns.join() === "player,pilot,chat,fleet", "the left panel has the Player, Pilot, Chat and Fleet windows", r.btns);
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
t.ok(r.afterDrag === null, "dragging pans the camera off the ship", r);
t.ok(r.refollow === null, "clicking your ship selects its pilot but doesn't centre on it (owner)", r);
// right-click / hold menus (owner): space → Center on ship, Belts › name › Warp to / Align to; Align shows the fleet's Align / Warp
r = await run(page, `if (document.querySelector('.win[data-id="fleet"]').hidden) document.querySelector('.wbtn[data-id="fleet"]').click(); await s(200);
  c.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 700, clientY: 500 })); await s(200);
  const top = [...document.querySelectorAll(".ctx-root > .ctx-menu > .ctx-item")].map((x) => x.textContent);
  const beltsRow = [...document.querySelectorAll(".ctx-item")].find((x) => x.textContent === "Belts"); beltsRow.click(); await s(100);
  const names = [...document.querySelectorAll('.ctx-sub[data-depth="1"] .ctx-item')].map((x) => x.textContent);
  const first = document.querySelector('.ctx-sub[data-depth="1"] .ctx-item'), bname = first.textContent;
  first.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 720, clientY: 520 })); await s(100);
  const opts = [...document.querySelectorAll('.ctx-sub[data-depth="2"] .ctx-item')].map((x) => x.textContent.replace(" " + bname, ""));
  const kept = document.querySelectorAll(".ctx-root > .ctx-menu").length;
  [...document.querySelectorAll('.ctx-sub[data-depth="2"] .ctx-item')].find((x) => x.textContent.startsWith("Align to")).click(); await s(800);
  const acts = document.querySelector(".fleet-acts2"), btns = [...acts.querySelectorAll(".fa-btn")].filter((b) => !b.hidden).map((b) => b.textContent);
  const centerRow = () => { c.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 700, clientY: 500 })); return [...document.querySelectorAll(".ctx-item")].find((x) => x.textContent === "Center on ship"); };
  ev("pointerdown", 300, 300); ev("pointermove", 380, 300); ev("pointerup", 380, 300); await s(100); centerRow().click(); await s(200);
  const centred = A.view.follow; A.send({ t: "dev", cmd: "move", x: 0, y: 0 }); await s(300);
  return { top, names: names.length, opts, kept, dest: A.myShip.dest || null, acts: !acts.hidden, btns, centred };`);
t.ok(r.top.join() === "Center on ship,Belts" && r.names >= 3, "space menu: Center on ship, Belts › a list of the belts", r);
t.ok(r.opts.join() === "Warp to,Align to" && r.kept === 3, "right-click a belt in the list: its own menu beside it, Warp to / Align to, the menus before it kept open (owner)", r);
t.ok(r.dest && r.acts && r.btns.join() === "Align,Warp", "aligning shows Align and Warp under the fleet", r);
t.ok(r.centred === A_SHIP, "Center on ship follows the selected pilot's ship", r);
r = await run(page, `const card = document.querySelector(".fleet-card"); const parts = card && [card.querySelector("canvas.portrait"), card.querySelector(".fc-ship img"), card.querySelector(".fc-sh i"), card.querySelector(".fc-hp i"), card.querySelector(".fc-name")].map(Boolean);
  ev("pointerdown", 300, 300); ev("pointermove", 380, 300); ev("pointerup", 380, 300); await s(100); const off = A.view.follow;
  card.click(); await s(200); const afterClick = A.view.follow; card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); await s(200); const afterDbl = A.view.follow;
  const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true }); document.body.dispatchEvent(menu);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" })); await s(400); window.dispatchEvent(new KeyboardEvent("keyup", { key: "d" }));
  return { parts, sel: card.classList.contains("sel"), off, afterClick, afterDbl, blocked: menu.defaultPrevented, afterKeys: A.view.follow };`);
t.ok(r.parts && r.parts.every(Boolean) && r.sel, "a fleet card: portrait, ship, shield and hull bars, name; the pilot is selected", r);
t.ok(r.off === null && r.afterClick === null, "selecting a pilot doesn't move the camera (owner)", r);
t.ok(r.afterDbl === A_SHIP, "double-clicking a card follows that pilot's ship", r);
t.ok(r.blocked, "right-click never opens the browser's menu", r);
t.ok(r.afterKeys === null, "WASD pans the camera off the ship", r);
r = await run(page, `for (let i = 0; i < 80; i++) c.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, clientX: 640, clientY: 400, bubbles: true, cancelable: true })); await s(800); const out = A.view.w;
  for (let i = 0; i < 80; i++) c.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: 640, clientY: 400, bubbles: true, cancelable: true })); await s(800); return { out, in: A.view.w };`);
t.ok(r.out > 20000 && Math.abs(r.in - 3.25) < 0.01, "the wheel zooms out to the whole hexagon and back in, no closer than 3.25 km across (owner)", r);

// Local / Corp chat (owner): you speak as your character, portrait and username
await fetch(BASE + "/game/character", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ portrait: { gender: "male", background: "nebula", skin: "tan", hair: "buzz", hairColor: "black", shirt: "armor", shirtColor: "red" } }) });
await page.reload(); await page.waitForFunction(() => window.Atamus && window.Atamus.myShip); await page.waitForTimeout(800);
r = await run(page, `document.querySelector('.wbtn[data-id="chat"]').click(); await s(300);
  const tabs = [...document.querySelectorAll('.win[data-id="chat"] .tab')].map((b) => b.textContent);
  const inp = document.querySelector('.win[data-id="chat"] input'); inp.value = "hello expanse"; inp.form.requestSubmit(); await s(600);
  const line = [...document.querySelectorAll('.win[data-id="chat"] .chat-line')].pop();
  document.querySelector('.win[data-id="chat"] .tab[data-ch="corp"]').click(); await s(100);
  const inp2 = document.querySelector('.win[data-id="chat"] input'); inp2.value = "corp hello"; inp2.form.requestSubmit(); await s(600);
  const corp = [...document.querySelectorAll('.win[data-id="chat"] .chat-line')].map((x) => x.textContent);
  document.querySelector('.win[data-id="chat"] .win-close').click();
  return { tabs, line: line && line.textContent, portrait: !!(line && line.querySelector("canvas.portrait")), corp };`);
t.ok(r.tabs.join() === "Local,Corp", "chat has Local and Corp", r.tabs);
t.ok(r.line === "PTR: hello expanse" && r.portrait, "a message shows the character's portrait and the username", r);
t.ok(r.corp.length === 1 && r.corp[0] === "PTR: corp hello", "corp has its own log", r.corp);

// the Player Sheet resizes both ways by its knob, down to a minimum (a stretched-row measurement once made it run away)
r = await run(page, `const w = document.querySelector('.win[data-id="player"]'); if (w.hidden) document.querySelector('.wbtn[data-id="player"]').click(); await s(500);
  w.style.width = "260px"; w.style.height = "260px"; await s(50); const k = w.querySelector(".rz-se"), out = [];
  const drag = async (dx, dy) => { const b = k.getBoundingClientRect(), x = b.left + 5, y = b.top + 5;
    k.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 9, pointerType: "mouse", button: 0, clientX: x, clientY: y, bubbles: true }));
    for (let i = 1; i <= 10; i++) window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 9, clientX: x + dx * i / 10, clientY: y + dy * i / 10 }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 9, clientX: x + dx, clientY: y + dy })); await s(80); out.push(w.offsetWidth, w.offsetHeight); };
  await drag(40, 20); await drag(-300, -300); const rows = w.querySelector(".ps-rows"); const scroll = rows.scrollHeight > rows.clientHeight;
  w.querySelector(".win-close").click(); return { out, scroll };`);
t.ok(r.out[0] === 300 && r.out[1] === 280 && r.out[2] < 260 && r.out[3] < 260 && r.out[2] > 150 && r.scroll, "the Player Sheet grows and shrinks with its knob, to a minimum where only its stats scroll", r);

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
  const w0 = A.view.w; ev("pointerdown", 400, 200, 1, "touch"); ev("pointerdown", 500, 200, 2, "touch"); ev("pointermove", 440, 200, 1, "touch"); ev("pointermove", 460, 200, 2, "touch"); ev("pointerup", 440, 200, 1, "touch"); ev("pointerup", 460, 200, 2, "touch"); await s(500);
  const w1 = A.view.w; ev("pointerdown", 700, 120, 3, "touch"); ev("pointerup", 700, 120, 3, "touch"); await s(500);
  return { over, w0, w1, moving: A.myShip.moving };`);
t.ok(!r.over.length, "windows fit a phone screen", r.over);
t.ok(r.w1 > r.w0, "a pinch zooms", r);
t.ok(r.moving, "a tap flies the ship", r);
await run(page, `A.send({ t: "dev", cmd: "move", x: 0, y: 0 }); await s(300);`);
await page.close(); await browser.close();
t.ok(!errors.length, "no page errors", errors.slice(0, 5));
t.done();
