// Browser smoke test (2026-11-09, part of the required check): the game page itself runs. Serves website/ and the real
// /pets server (in memory, no database) on a free local port, opens pets.html in headless Chrome, creates an account,
// rides for a moment, then a second player joins and flies up and the first must see it (issue #7), and fails on any page error, console error or failed request. smoke.mjs covers the server and the
// world's rules; this covers website/pets.js, which the syntax check alone can't (a runtime error there breaks the game).
// Run: cd packages/server && npm run smoke:browser   (CHROME=/path/to/chrome when it isn't found; in CI it must be)
process.env.ATAMUS_PTR = "1";   // no live website to watch
import http from "node:http";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
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
const app = express(); app.use(express.static(new URL("../../website/", import.meta.url).pathname));
const server = http.createServer(app);
attachPets(server, { allowLocal: true });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
  await user.fill("smoke" + Date.now().toString(36).slice(-7));
  await page.fill("input[placeholder=Password]", "smoke-check-1");
  await page.click("text=Create account");
  await user.waitFor({ state: "hidden", timeout: 20000 });
  step = "ride for a moment";
  await page.keyboard.down("KeyW"); await page.waitForTimeout(1500); await page.keyboard.up("KeyW"); await page.waitForTimeout(500);
  if (!(await page.locator("canvas").count())) problems.push("no game canvas");
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
  await page.waitForTimeout(1500);
  const seen = await page.evaluate(() => [...window.Pets.others.values()].map((o) => { const s = o.buf[o.buf.length - 1]; return s ? s.y : null; }));
  if (!seen.length) problems.push("the first player doesn't see the second");
  else if (!(seen[0] > 30)) problems.push(`the second player looks frozen to the first (last height seen ${seen[0]}, it is at 40)`);
} catch (e) { problems.push(`could not ${step}: ${e.message.split("\n")[0]}`); }
await browser.close(); if (browser2) await browser2.close(); server.close();
if (problems.length) { console.error("SMOKE FAILED (browser)\n" + problems.map((p) => "  " + p).join("\n")); process.exit(1); }
console.log("browser smoke passed: the game loads, an account is created, the town runs without errors and a second player is seen moving");
process.exit(0);
