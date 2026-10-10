// Drive the local PTR in headless Chromium: node scripts/ptr-run.mjs <steps.js> [shot.png] [WxH]
// steps.js is the body of an async function run in the page (window.Atamus is ready); its return value is printed.
import { readFileSync } from "node:fs";
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
const [, , stepsFile, shot = "", size = "1280x800"] = process.argv;
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width, height } });
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:8090/" + (process.env.PTR_PAGE || "game.html"), { waitUntil: "load" });   // PTR_PAGE="game.html?shard=tutorial&new=1" for the tutorial
await page.waitForFunction(() => window.Atamus && window.Atamus.cfg && window.Atamus.inv && window.Atamus.inv.hangars, null, { timeout: 15000 });
const body = stepsFile ? readFileSync(stepsFile, "utf8") : "return 'ready'";
const result = await page.evaluate(`(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms)); const A = window.Atamus; const dev = (o) => A.send({ t: "dev", ...o }); ${body} })()`);
if (shot) await page.screenshot({ path: shot });
console.log(JSON.stringify({ result, errors }, null, 1));
await browser.close();
