// Browser smoke test (part of the required check): the game page itself runs. Serves website/ and the real /pets
// server (in memory, no database) on a free local port, opens pets.html in headless Chrome, creates an account, rides,
// grabs a parcel off the conveyor, delivers it and sees the reward roll, opens every menu, then a second player joins
// and the first must see them move and take their kick; it fails on any page error, console error or failed request.
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
const game = attachPets(server, { allowLocal: true }).game;
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
  const state = await pg.evaluate(() => { const P = window.Pets, s = P.save; return JSON.stringify({ in: P.loggedIn, coins: s.coins, eggs: s.eggs, mounts: s.mounts.map((m) => m.sp + m.lv), up: s.up, del: s.stats.del, parcel: !!P.parcel, at: [Math.round(P.me.x), Math.round(P.me.z)] }); }).catch(() => "");
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
  await until(page, () => getComputedStyle(document.getElementById("card")).display !== "none" && / m$/.test(document.querySelector("#card .cdist").textContent), "the parcel card didn't show");
  const card = await page.evaluate(() => ({ shown: getComputedStyle(document.getElementById("card")).display, tier: document.querySelector("#card .ctier").textContent, addr: document.querySelector("#card .caddr").textContent, pips: document.querySelectorAll("#card .cpips i.on").length, timer: document.querySelector("#card .ctimer") ? "block" : "none", way: window.Pets.arrow.visible }));
  if (card.shown === "none" || card.tier !== "Bronze" || !/Main Street/.test(card.addr) || card.pips !== 3 || card.timer === "none" || !card.way) problems.push("the parcel card is wrong: " + JSON.stringify(card));
  await until(page, () => document.getElementById("tutt").textContent === "Drop them off", "the tutorial didn't move on after the grab");
  step = "deliver it and see the roll";
  await page.evaluate(() => { const P = window.Pets, h = P.World.houses[P.parcel.house]; P.teleport(h.mx, h.mz, h.my); });
  await until(page, () => window.Pets.save.stats.del === 1 && !window.Pets.parcel, "the delivery didn't land");
  await until(page, () => getComputedStyle(document.getElementById("gifts")).display !== "none" && document.querySelectorAll("#gq .gtile").length === 1, "no delivered parcel on the left");
  await page.click("#gq .gtile"); await until(page, () => getComputedStyle(document.getElementById("gopen")).display !== "none", "the gift didn't start opening");
  for (let k = 0; k < 3; k++) { await page.click("#gopen").catch(() => {}); await page.waitForTimeout(80); }   // taps hurry the build-up
  await until(page, () => getComputedStyle(document.getElementById("gres")).display !== "none" && document.querySelectorAll("#glist .grow").length > 0, "the gift's contents didn't show", null, 8000);
  await page.click("#gx"); await until(page, () => getComputedStyle(document.getElementById("gifts")).display === "none", "the gift didn't close");
  await until(page, () => document.getElementById("coinn").textContent !== "0", "the coin counter didn't move");
  await page.click("#tutskip"); await until(page, () => getComputedStyle(document.getElementById("tut")).display === "none" && window.Pets.save.set.tut, "the tutorial didn't skip");
  step = "open the menus";
  for (const [id, title] of [["mstable", "Stable"], ["mup", "Upgrades"], ["modds", "Odds"], ["mset", "Settings"]]) {
    await page.click("#" + id); await page.locator("#ptitle", { hasText: title }).waitFor({ timeout: 5000 });
    if (!(await page.evaluate(() => document.getElementById("pbody").children.length))) problems.push(title + " is empty");
    await page.click("#pclose");
  }
  step = "level the mount and hatch an egg";
  const had = await page.evaluate(() => { const s = window.Pets.save; return { eggs: s.eggs.basic, mounts: s.mounts.length }; });   // (the roll may have given an egg)
  await page.evaluate(() => { window.Pets.netSend({ t: "admin", op: "quick", cmd: "coins", n: 5000, name: "Nyssary" }); window.Pets.netSend({ t: "admin", op: "give", what: "egg:basic", n: 1, name: "Nyssary" }); });
  await until(page, (h) => window.Pets.save.coins >= 5000 && window.Pets.save.eggs.basic === h.eggs + 1, "the admin's gifts didn't arrive", had);
  await page.click("#mstable"); await page.click(".btn.buy"); await until(page, () => window.Pets.save.mounts[0].lv === 2, "the level wasn't bought");
  await page.click(".eggc .btn.go"); await until(page, (h) => window.Pets.save.mounts.length === h.mounts + 1 && getComputedStyle(document.getElementById("hatch")).display !== "none", "the egg didn't hatch", had);
  await page.waitForTimeout(2100); await page.click("#hatch"); await page.click("#pclose");
  await page.click("#mup"); await page.click(".uprow .btn.buy"); await until(page, () => window.Pets.save.up.routes === 1, "the upgrade wasn't bought"); await page.click("#pclose");
  // a second player joins: the first must see them move, and take their kick (out of the post office's safe zone)
  step = "see a second player move";
  browser2 = await chromium.launch({ executablePath: chrome, args });   // its own browser, so neither page is a background tab
  const page2 = await browser2.newPage({ viewport: { width: 640, height: 480 } });
  page2.on("pageerror", (e) => problems.push("page error (player 2): " + e.message));
  const name2 = "smoke2" + Date.now().toString(36).slice(-6); await join(page2, name2);
  await until(page, () => window.Pets.others.size === 1, "the first player doesn't see the second");
  await page.evaluate(() => window.Pets.teleport(60, 30)); await page2.evaluate(() => { window.Pets.teleport(60, 27.6); window.Pets.me.yaw = 0; });
  await until(page, () => { const o = [...window.Pets.others.values()][0]; return Math.abs(o.x - 60) < 1 && Math.abs(o.z - 27.6) < 1; }, "the second player looks frozen to the first");
  step = "take a kick"; await page.waitForTimeout(400);
  await page2.keyboard.press("KeyF");
  await until(page, () => window.Pets.me.foot && window.Pets.me.stun > 0, "the kick didn't land");
} catch (e) { problems.push(`could not ${step}: ${e.message.split("\n")[0]}`); }
await browser.close(); if (browser2) await browser2.close(); server.close();
if (problems.length) { console.error("SMOKE FAILED (browser)\n" + problems.map((p) => "  " + p).join("\n")); process.exit(1); }
console.log("browser smoke passed: the game loads, a parcel is grabbed, delivered and rolled, the menus work, and a second player is seen moving and kicking");
process.exit(0);
