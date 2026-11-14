// Browser smoke test (part of the required check): the game page itself runs. Serves website/ and the real /pets
// server (in memory, no database) on a free local port, opens pets.html in headless Chrome, creates an account, rides,
// grabs a parcel off the conveyor, delivers it and sees the reward roll, opens every menu, then a second player joins
// and the first must see them move and Big Jump; it fails on any page error, console error or failed request.
// smoke.mjs covers the server and the world's rules; this covers website/pets.js, which the syntax check alone can't
// (a runtime error there breaks the game).
// Run: cd packages/server && npm run smoke:browser   (CHROME=/path/to/chrome when it isn't found; in CI it must be)
process.env.ATAMUS_PTR = "1";   // no live website to watch
import http from "node:http";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import express from "express";
import { chromium } from "playwright-core";

const pwCache = `${homedir()}/.cache/ms-playwright`;
const cached = existsSync(pwCache) ? readdirSync(pwCache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse().map((d) => `${pwCache}/${d}/chrome-linux64/chrome`) : [];
const chrome = [process.env.CHROME, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", ...cached].find((p) => p && existsSync(p));
if (!chrome) {
  if (process.env.CI) { console.error("SMOKE FAILED: no Chrome found (set CHROME)"); process.exit(1); }
  console.log("browser smoke SKIPPED: no Chrome found here (set CHROME to run it; the required check always runs it)");
  process.exit(0);
}

const { attachPets } = await import("./src/pets.js");
const app = express(); app.use(express.static(fileURLToPath(new URL("../../website/", import.meta.url))));
const server = http.createServer(app);
const { memStore } = await import("./src/petstore.js"), { TEST_TOWN } = await import("./test-town.mjs"), store = memStore(); await store.saveBuild(TEST_TOWN);   // (owner, 2026-11-13) a town placed with the zone builder
const game = attachPets(server, { allowLocal: true, store }).game; await new Promise((r) => setTimeout(r, 50));
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const who = (name) => [...game.online.values()].find((p) => p.name === name);

const args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const browser = await chromium.launch({ executablePath: chrome, args });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const problems = [];
page.on("pageerror", (e) => problems.push("page error: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) problems.push("console error: " + m.text()); });
// version.json is stamped only by the Pages deploy, so it's missing here
page.on("response", (r) => { if (r.status() >= 400 && !new URL(r.url()).pathname.endsWith("/version.json")) problems.push(`HTTP ${r.status()} ${r.url()}`); });
const until = async (pg, fn, what, arg, ms = 12000) => {
  for (let i = 0; i < ms / 100; i++) { if (await pg.evaluate(fn, arg)) return; await pg.waitForTimeout(100); }
  const state = await pg.evaluate(() => { const P = window.Pets, s = P.save; return JSON.stringify({ in: P.loggedIn, coins: s.coins, mounts: s.mounts.map((m) => m.sp + m.r), up: s.up, del: s.stats.del, parcel: !!P.parcel, at: [Math.round(P.me.x), Math.round(P.me.z)] }); }).catch(() => "");
  throw new Error(what + " " + state);
};
const join = async (pg, name) => {
  await pg.goto(base + "/pets.html", { waitUntil: "load", timeout: 20000 });
  const user = pg.locator("input[placeholder=Username]"); await user.waitFor({ state: "visible", timeout: 20000 });
  await user.fill(name); await pg.fill("input[placeholder=Password]", "smoke-check-1"); await pg.click("text=Create account");
  await user.waitFor({ state: "hidden", timeout: 20000 }); await until(pg, () => window.Pets.loggedIn && !!window.Pets.belt.ready, "the conveyor never filled");
};
let step = "open the game page", browser2 = null;
try {
  step = "create an account"; await join(page, "Nyssary");
  if (!(await page.locator("canvas").count())) problems.push("no game canvas");
  who("Nyssary").ready = { tier: 0, mod: "express" };   // a known parcel (a fast machine reaches the conveyor during the ride below)
  step = "ride for a moment";
  const at0 = await page.evaluate(() => [window.Pets.me.x, window.Pets.me.z]);
  await page.keyboard.down("KeyW"); await page.waitForTimeout(1500); await page.keyboard.up("KeyW");
  await until(page, (p) => Math.hypot(window.Pets.me.x - p[0], window.Pets.me.z - p[1]) > 1, "W didn't move the mount", at0, 3000);
  step = "jump"; await page.keyboard.press("Space"); await until(page, () => window.Pets.me.y > 0.2, "Space didn't jump", null, 3000);
  step = "see the tutorial";
  await until(page, () => getComputedStyle(document.getElementById("tut")).display !== "none" && document.getElementById("tutt").textContent === "Pick up parcels", "a new courier gets no tutorial");
  step = "grab a parcel off the conveyor";
  for (let i = 0; i < 40 && !(await page.evaluate(() => !!window.Pets.parcel)); i++) { await page.evaluate(() => { const P = window.Pets, q = P.readyAt(), d = Math.hypot(q.x, q.z); P.teleport(q.x * (1 + 1.6 / d), q.z * (1 + 1.6 / d)); }); await page.waitForTimeout(250); }
  await until(page, () => !!window.Pets.parcel, "no parcel grabbed");
  // (owner, 2026-11-14) the parcel counter: how many you carry, of how many you can
  await until(page, () => getComputedStyle(document.getElementById("card")).display !== "none" && /^\d+ \/ \d+$/.test(document.querySelector("#card b").textContent), "the parcel counter didn't show");
  const card = await page.evaluate(() => ({ text: document.querySelector("#card b").textContent, odds: document.getElementById("modds").hidden === (window.Pets.role !== "admin"), way: window.Pets.arrow.visible }));
  if (!/^1 \/ \d+$/.test(card.text) || !card.odds || !card.way) problems.push("the parcel counter is wrong (or the Odds button shows to a player): " + JSON.stringify(card));
  await until(page, () => document.getElementById("tutt").textContent === "Drop them off", "the tutorial didn't move on after the grab");
  step = "deliver it and see the roll";
  await page.evaluate(() => { const P = window.Pets, h = P.World.addr(P.parcel.house); P.teleport(h.mx, h.mz, h.my); });
  await until(page, () => window.Pets.save.stats.del === 1 && !window.Pets.parcel, "the delivery didn't land");
  // (owner, 2026-11-11) the only parcel: it opens full screen by itself; taps hurry it, then move on
  await until(page, () => getComputedStyle(document.getElementById("reveal")).display !== "none", "the parcel didn't open full screen");
  for (let k = 0; k < 3; k++) { await page.mouse.click(640, 400); await page.waitForTimeout(80); }
  await until(page, () => document.querySelectorAll("#rgrid .rcard .grow").length > 0, "the parcel's contents didn't show", null, 8000);
  await page.waitForTimeout(500); for (let k = 0; k < 6 && (await page.evaluate(() => getComputedStyle(document.getElementById("reveal")).display !== "none" || getComputedStyle(document.getElementById("hatch")).display !== "none")); k++) { await page.mouse.click(640, 400); await page.waitForTimeout(700); }
  await until(page, () => getComputedStyle(document.getElementById("reveal")).display === "none", "the reveal didn't close");
  await until(page, () => document.getElementById("coinn").textContent !== "0", "the coin counter didn't move");
  await page.click("#tutskip"); await until(page, () => getComputedStyle(document.getElementById("tut")).display === "none" && window.Pets.save.set.tut, "the tutorial didn't skip");
  step = "open the menus";
  for (const [id, title] of [["mstable", "Stable"], ["mup", "Upgrades"], ["mset", "Settings"]]) {
    await page.click("#" + id); await page.locator("#ptitle", { hasText: title }).waitFor({ timeout: 5000 });
    if (!(await page.evaluate(() => document.getElementById("pbody").children.length))) problems.push(title + " is empty");
    await page.click("#pclose");
  }
  step = "a new mount shows in the Stable";
  const had = await page.evaluate(() => ({ mounts: window.Pets.save.mounts.length }));   // (the roll may have brought a mount)
  await page.evaluate(() => { window.Pets.netSend({ t: "admin", op: "quick", cmd: "coins", n: 5000, name: "Nyssary" }); window.Pets.netSend({ t: "admin", op: "give", what: "mount:bear", n: 1, r: 3, name: "Nyssary" }); });
  await until(page, (h) => window.Pets.save.coins >= 5000 && window.Pets.save.mounts.length === h.mounts + 1 && window.Pets.save.mounts.some((m) => m.sp === "bear" && m.r === 3), "the admin's gifts didn't arrive", had);
  await page.click("#mstable");
  await until(page, () => document.querySelectorAll(".mtile").length === new Set(window.Pets.save.mounts.map((m) => [m.sp, m.r, m.va, m.cap | 0, m.spd | 0, m.tr || ""].join())).size && [...document.querySelectorAll(".mtile img")].length > 0, "the new mount isn't in the Stable (identical ones stacked)", had); await page.click("#pclose");
  await page.click("#mup"); await page.click(".uprow .btn.buy"); await until(page, () => window.Pets.save.up.payout === 1, "the upgrade wasn't bought"); await page.click("#pclose");
  // a second player joins: the first must see them move, and Big Jump
  step = "see a second player move";
  browser2 = await chromium.launch({ executablePath: chrome, args });   // its own browser, so neither page is a background tab
  const page2 = await browser2.newPage({ viewport: { width: 640, height: 480 } });
  page2.on("pageerror", (e) => problems.push("page error (player 2): " + e.message));
  const name2 = "smoke2" + Date.now().toString(36).slice(-6); await join(page2, name2);
  await until(page, () => window.Pets.others.size === 1, "the first player doesn't see the second");
  await page.evaluate(() => window.Pets.teleport(60, 30)); await page2.evaluate(() => { window.Pets.teleport(60, 27.6); window.Pets.me.yaw = 0; });
  await until(page, () => { const o = [...window.Pets.others.values()][0]; return Math.abs(o.x - 60) < 1 && Math.abs(o.z - 27.6) < 1; }, "the second player looks frozen to the first");
  step = "see a Big Jump"; await page.waitForTimeout(400);   // (owner, 2026-11-13) the Big Jump replaced the bonk
  await until(page2, () => window.Pets.me.ground, "the second player isn't on the ground");
  await page.evaluate(() => { window.__maxY = 0; const f = () => { const o = [...window.Pets.others.values()][0]; if (o) window.__maxY = Math.max(window.__maxY, o.y); requestAnimationFrame(f); }; f(); });   // the highest the first player saw them
  await page2.keyboard.press("KeyF");
  await until(page2, () => window.Pets.me.y > 2.3, "the Big Jump didn't lift the second player");
  await until(page, () => window.__maxY > 2, "the second player's Big Jump wasn't seen");
} catch (e) { problems.push(`could not ${step}: ${e.message.split("\n")[0]}`); }
await browser.close(); if (browser2) await browser2.close(); server.close();
if (problems.length) { console.error("SMOKE FAILED (browser)\n" + problems.map((p) => "  " + p).join("\n")); process.exit(1); }
console.log("browser smoke passed: the game loads, a parcel is grabbed, delivered and rolled, the menus work, and a second player is seen moving and Big Jumping");
process.exit(0);
