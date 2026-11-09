// Game smoke check: open the game page on a running local server, create an account and get into the town, failing on
// any page error, console error or failed request. Used by the Check workflow (required to merge into main).
//   node scripts/smoke.mjs                      (server on http://localhost:8090, e.g. scripts/ptr.sh start)
// Env: SMOKE_URL (the server), CHROME (a Chrome/Chromium binary; /usr/bin/google-chrome by default),
//      PLAYWRIGHT (path to a playwright-core or playwright package; "playwright-core" by default)
import { pathToFileURL } from "node:url";
const base = (process.env.SMOKE_URL || "http://localhost:8090").replace(/\/$/, "");
const pwPath = process.env.PLAYWRIGHT;
const pw = await import(pwPath ? pathToFileURL(pwPath + "/index.mjs").href : "playwright-core");
const browser = await pw.chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const problems = [];
page.on("pageerror", (e) => problems.push("page error: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) problems.push("console error: " + m.text()); });
// version.json is stamped only by the Pages deploy, so it is missing locally
page.on("response", (r) => { if (r.status() >= 400 && !new URL(r.url()).pathname.endsWith("/version.json")) problems.push(`HTTP ${r.status()} ${r.url()}`); });
let step = "open the game page";
try {
  await page.goto(base + "/pets.html", { waitUntil: "load", timeout: 20000 });
  const user = page.locator("input[placeholder=Username]");
  await user.waitFor({ state: "visible", timeout: 20000 });
  step = "create an account";
  await user.fill("smoke" + Date.now().toString(36).slice(-7));
  await page.fill("input[placeholder=Password]", "smoke-check-1");
  await page.click("text=Create account");
  await user.waitFor({ state: "hidden", timeout: 20000 });
  step = "play for a moment";
  await page.keyboard.down("KeyW"); await page.waitForTimeout(1500); await page.keyboard.up("KeyW"); await page.waitForTimeout(500);
  if (!(await page.locator("canvas").count())) problems.push("no game canvas");
} catch (e) { problems.push(`could not ${step}: ${e.message.split("\n")[0]}`); }
await browser.close();
if (problems.length) { console.error("SMOKE FAILED\n" + problems.map((p) => "  " + p).join("\n")); process.exit(1); }
console.log("smoke: the game loads, an account is created and the town plays without errors");
