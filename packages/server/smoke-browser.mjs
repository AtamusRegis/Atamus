// Browser smoke test (2026-11-09, part of the required check): the game page itself runs. Serves website/ and the real
// /pets server (in memory, no database) on a free local port, opens pets.html in headless Chrome, creates an account,
// rides for a moment, then a second player joins and flies up and the first must see it (issue #7), and fails on any page error, console error or failed request. smoke.mjs covers the server and the
// world's rules; this covers website/pets.js, which the syntax check alone can't (a runtime error there breaks the game).
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
{ const W = await import("./src/pets-world.js"), { testWorld } = await import("./test-world.mjs"); W.setWorld(testWorld(W)); }   // (owner, 2026-11-10) a small town built on the square
const app = express(); app.use(express.static(fileURLToPath(new URL("../../website/", import.meta.url))));
const server = http.createServer(app);
attachPets(server, { allowLocal: true, packageEveryMs: 50 });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => { try { localStorage.setItem("petdelivery.nointro", "1"); } catch (e) { /* none */ } });   // the walk-through has its own check
const problems = [];
page.on("pageerror", (e) => problems.push("page error: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) problems.push("console error: " + m.text()); });
// version.json is stamped only by the Pages deploy, so it's missing here
page.on("response", (r) => { if (r.status() >= 400 && !new URL(r.url()).pathname.endsWith("/version.json")) problems.push(`HTTP ${r.status()} ${r.url()}`); });
let step = "open the game page", browser2 = null;
try {
  await page.goto(base + "/pets.html", { waitUntil: "load", timeout: 20000 });
  const user = page.locator("input[placeholder=Username]");
  await user.waitFor({ state: "visible", timeout: 20000 });
  step = "create an account";
  await user.fill("Nyssary");
  await page.fill("input[placeholder=Password]", "smoke-check-1");
  await page.click("text=Create account");
  await user.waitFor({ state: "hidden", timeout: 20000 });
  step = "see and claim a Package Rush prize";
  for (let i = 0; i < 50 && !(await page.evaluate(() => window.Pets.packageEvent && window.Pets.packageMeshes.size > 0)); i++) await page.waitForTimeout(100);
  if (!(await page.evaluate(() => window.Pets.packageEvent && window.Pets.packageMeshes.size > 0))) throw new Error("Package Rush did not start");
  for (let i = 0; i < 100 && (await page.evaluate(() => getComputedStyle(document.getElementById("packageevent")).display === "none")); i++) await page.waitForTimeout(50);
  const packageUi = await page.evaluate(() => ({
    title: document.getElementById("eventtitle").textContent,
    pill: getComputedStyle(document.getElementById("packageevent")).display,
    count: window.Pets.packageMeshes.size,
  }));
  if (packageUi.title !== "Package Rush!" || packageUi.pill === "none" || !packageUi.count) problems.push("Package Rush UI is missing: " + JSON.stringify(packageUi));
  const beforePackages = packageUi.count;
  await page.evaluate(() => { const P = window.Pets, b = P.packageEvent.boxes.values().next().value; P.teleport(b.x, b.z, b.y); });
  for (let i = 0; i < 50 && !(await page.evaluate((before) => window.Pets.packageMeshes.size < before, beforePackages)); i++) await page.waitForTimeout(100);
  if (!(await page.evaluate((before) => window.Pets.packageMeshes.size < before, beforePackages))) throw new Error("package was not claimed");
  const packagePrize = await page.evaluate(() => ({ title: document.getElementById("eventtitle").textContent, sub: document.getElementById("eventsub").textContent, flash: document.getElementById("eventflash").classList.contains("go") }));
  if (packagePrize.title !== "Prize package!" || !packagePrize.sub || !packagePrize.flash) problems.push("package reward celebration is missing: " + JSON.stringify(packagePrize));
  await page.evaluate(() => window.Pets.teleport(0, 14));
  step = "change the weather from the admin panel";
  await page.click("#gear"); await page.click("#gm-admin");   // the Admin Panel, from the gear menu (owner, 2026-11-09)
  await page.selectOption("#admin-weather", "snow");
  await page.selectOption("#admin-time", "night");
  let changed = false;
  for (let i = 0; i < 50 && !changed; i++) { await page.waitForTimeout(100); changed = await page.evaluate(() => window.Pets.environment.weather === "snow" && window.Pets.environment.time === "night" && window.Pets.sky.snow > 0.9); }
  if (!changed) throw new Error("the snow and night settings did not reach the game");
  await page.selectOption("#admin-weather", "auto");
  await page.selectOption("#admin-time", "auto");
  let restored = false;
  for (let i = 0; i < 50 && !restored; i++) { restored = await page.evaluate(() => window.Pets.environment.weather === "auto" && window.Pets.environment.time === "auto"); if (!restored) await page.waitForTimeout(100); }
  if (!restored) throw new Error("the automatic environment settings were not restored");
  await page.click("#p-admin .x");
  step = "check animal-control lights by day and night";
  const setSkyPhase = (phase) => page.evaluate((p) => { window.Pets.skyOffset = p * window.Pets.World.DAY_S - (Date.now() / 1000) % window.Pets.World.DAY_S; }, phase);
  const waitForLights = async (day) => {
    for (let i = 0; i < 50; i++) {
      const ready = await page.evaluate((wantDay) => wantDay === (window.Pets.daylight >= 0.5) && window.Pets.vehs.every((v) => v.kind ? v.beam.visible && (v.beam.material.uniforms.o.value > 0.15) !== wantDay && (v.spot.intensity > 0) !== wantDay : v.lit.visible !== wantDay), day);
      if (ready) return;
      await page.waitForTimeout(100);
    }
    throw new Error(`animal-control lights did not turn ${day ? "off in daylight" : "on at night"}`);
  };
  await setSkyPhase(0.25);
  await waitForLights(true);
  await setSkyPhase(0.75);
  await waitForLights(false);
  step = "check the airborne wind speed rules";
  const windFactors = await page.evaluate(() => {
    const f = window.Pets.windRideFactor;
    return [f("fly", true, 1, 0, 1, 0), f("glide", true, -1, 0, 1, 0), f("fly", true, 0, 1, 1, 0), f("land", true, 1, 0, 1, 0), f("fly", false, 1, 0, 1, 0)];
  });
  const expectedWindFactors = [1.1, 0.95, 1, 1, 1];
  if (windFactors.some((n, i) => Math.abs(n - expectedWindFactors[i]) > 0.0001)) problems.push(`airborne wind speed factors are wrong (${windFactors.join(", ")})`);
  step = "ride for a moment";
  await page.keyboard.down("KeyW"); await page.waitForTimeout(1500); await page.keyboard.up("KeyW"); await page.waitForTimeout(500);
  if (!(await page.locator("canvas").count())) problems.push("no game canvas");
  // talk to someone in town: lines type out, a click skips ahead, an answer is picked, walking away ends it
  step = "talk to someone in town";
  const talked = await page.evaluate(async () => {
    const P = window.Pets, wait = (ms) => new Promise((r) => setTimeout(r, ms)), n = P.folk.find((f) => f.id === "mabel");
    if (!n) return "Mabel isn't in town";
    P.startTalk(n); if (!P.talk) return "the talk didn't start";
    for (let i = 0; i < 12 && !document.querySelector("#tkopts button"); i++) { P.talkNext(); await wait(150); }
    if (!document.querySelector("#tkopts button")) return "no answers to pick";
    P.talkPick(1); P.talkNext(); await wait(50); if (!P.talk || !document.getElementById("tktext").textContent) return "the answer didn't go on";
    P.endTalk(); await wait(100); return P.talk ? "the talk didn't end" : "";
  });
  if (talked) problems.push(talked);
  // the egg shop: riding into its ring opens it, showing your coins (owner, 2026-11-09: the mount shop closed)
  step = "open the egg shop";
  await page.evaluate(() => { const P = window.Pets; P.save.coins = 3000; P.teleport(P.SHOP.x, P.SHOP.z); });
  await page.locator("#shopname", { hasText: "Egg Shop" }).waitFor({ timeout: 5000 });
  await page.locator("#shopcash", { hasText: "3,000" }).waitFor({ timeout: 5000 });
  await page.evaluate(() => { const P = window.Pets; const s = P.save, p = { id: s.nextId++, sp: "dragon", lv: 1 }; s.pets.push(p); P.ride(p.id); });
  if ((await page.evaluate(() => { const s = window.Pets.save; return s.pets.find((p) => p.id === s.ride).sp; })) !== "dragon") problems.push("couldn't ride a Dragon");
  step = "fly and pitch with the camera";
  const flightStart = await page.evaluate(() => { const P = window.Pets; P.teleport(0, 14, 40); P.cam.pitch = -0.5; return P.me.y; });
  await page.waitForTimeout(300);
  await page.keyboard.down("KeyW");
  let flightHigh;
  for (let i = 0; i < 50; i++) { flightHigh = await page.evaluate(() => ({ y: window.Pets.me.y, pitch: window.Pets.mine.body.rotation.x })); if (flightHigh.y > flightStart + 2 && flightHigh.pitch < -0.2) break; await page.waitForTimeout(100); }
  await page.evaluate(() => { window.Pets.cam.pitch = 1; });
  let flightLow;
  for (let i = 0; i < 50; i++) { flightLow = await page.evaluate(() => ({ y: window.Pets.me.y, pitch: window.Pets.mine.body.rotation.x })); if (flightLow.y < flightHigh.y - 2 && flightLow.pitch > 0.2) break; await page.waitForTimeout(100); }
  await page.keyboard.up("KeyW");
  if (!(flightHigh.y > flightStart + 2) || !(flightHigh.pitch < -0.2) || !(flightLow.y < flightHigh.y - 2) || !(flightLow.pitch > 0.2)) problems.push(`camera-directed flight is wrong (${JSON.stringify({ flightStart, flightHigh, flightLow })})`);
  await page.evaluate(() => { const P = window.Pets; P.teleport(0, 14); });
  // a second player joins and flies off: the first must see them move (issue #7: a joiner could look frozen)
  step = "see a second player move";
  browser2 = await chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });   // its own browser, so neither page is a background tab
  const page2 = await browser2.newPage({ viewport: { width: 640, height: 480 } });
  page2.on("pageerror", (e) => problems.push("page error (player 2): " + e.message));
  await page2.goto(base + "/pets.html", { waitUntil: "load", timeout: 20000 });
  const user2 = page2.locator("input[placeholder=Username]");
  await user2.waitFor({ state: "visible", timeout: 20000 });
  await user2.fill("smoke2" + Date.now().toString(36).slice(-6));
  await page2.fill("input[placeholder=Password]", "smoke-check-1");
  await page2.click("text=Create account");
  await user2.waitFor({ state: "hidden", timeout: 20000 });
  await page2.evaluate(() => { const P = window.Pets; P.teleport(P.me.x + 6, P.me.z, 40); });
  // the highest the first sees them, over a few seconds (a land pet falls back down from 40 m in under 2 s, and a slow
  // machine can read only after the landing, so a single late look isn't enough)
  let seen = null;
  for (let i = 0; i < 40 && !(seen > 30); i++) {
    await page.waitForTimeout(100);
    const ys = await page.evaluate(() => [...window.Pets.others.values()].map((o) => Math.max(...o.buf.map((s) => s.y))));
    if (ys.length) seen = Math.max(seen ?? -Infinity, ys[0]);
  }
  if (seen === null) problems.push("the first player doesn't see the second");
  else if (!(seen > 30)) problems.push(`the second player looks frozen to the first (highest seen ${seen}, it went up to 40)`);
} catch (e) { problems.push(`could not ${step}: ${e.message.split("\n")[0]}`); }
await browser.close(); if (browser2) await browser2.close(); server.close();
if (problems.length) { console.error("SMOKE FAILED (browser)\n" + problems.map((p) => "  " + p).join("\n")); process.exit(1); }
console.log("browser smoke passed: the game loads, Package Rush works, the town runs without errors and a second player is seen moving");
process.exit(0);
