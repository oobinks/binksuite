// Click-through + screenshots against a running app (default: vite preview on :4173).
// Usage: node scripts/screenshots.mjs [baseUrl]
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:4173";
const OUT = "docs/screenshots";
const PASSWORD = "cosy little shop 123";
const SETUP_CODE = readFileSync(".dev.vars", "utf8").match(/SESSION_SECRET=(.*)/)[1].trim();
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const errors = [];

async function run(name, viewport, scheme, fn) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("401") && errors.push(`${name}: ${m.text()}`));
  await fn(page);
  await ctx.close();
}

const shot = (page, file) => page.screenshot({ path: `${OUT}/${file}.png` });
const login = async (page) => {
  await page.goto(BASE + "/login");
  await page.fill('input[type="password"]', PASSWORD);
  await page.click("button:has-text('Clock in')");
  await page.waitForURL(BASE + "/");
};

await run("desktop-light", { width: 1366, height: 900 }, "light", async (page) => {
  await page.goto(BASE + "/");
  await page.waitForURL(/setup/);
  await shot(page, "01-setup");
  await page.fill('input[autocomplete="new-password"] >> nth=0', PASSWORD);
  await page.fill('input[autocomplete="new-password"] >> nth=1', PASSWORD);
  await page.fill('input[placeholder^="Paste the SESSION_SECRET"]', SETUP_CODE);
  await page.click("button:has-text('Create password')");
  await page.waitForURL(BASE + "/");
  await page.waitForSelector("text=Daily briefing");
  await page.waitForTimeout(800);
  await shot(page, "02-daily-briefing");
  await page.click("button:has-text(\"Let's go\")");
  await page.waitForTimeout(2500);
  await shot(page, "03-hq-map");

  await page.click('a[aria-label^="Research Lab"]');
  await page.waitForSelector("text=Task board");
  await page.waitForTimeout(800);
  await shot(page, "04-research-room");
  await page.click("text=Tap to review");
  await page.waitForSelector("text=Approve niche");
  await page.waitForTimeout(500);
  await shot(page, "05-review-niche");
  await page.click("button:has-text('Approve niche')");
  await page.waitForTimeout(1500);

  await page.goto(BASE + "/room/finance");
  await page.waitForSelector("text=Fee calculator");
  await page.fill('input[aria-label="Price in pounds"]', "25");
  await page.waitForTimeout(1200);
  await shot(page, "06-finance-vault");
  await page.screenshot({ path: `${OUT}/06b-finance-full.png`, fullPage: true });

  await page.goto(BASE + "/journal");
  await page.waitForSelector("text=Starter campaign");
  await page.waitForTimeout(800);
  await shot(page, "07-journal");
  const claim = page.locator("button:has-text('Claim reward')").first();
  if (await claim.count()) {
    await claim.click({ force: true });
    await page.waitForTimeout(600);
    await shot(page, "08-quest-claimed");
  }

  await page.goto(BASE + "/room/studio");
  await page.waitForSelector("text=Task board");
  await page.waitForTimeout(800);
  await shot(page, "09-studio");

  await page.goto(BASE + "/room/strategy");
  await page.waitForSelector("text=Coming in Phase");
  await shot(page, "10-coming-soon");

  await page.goto(BASE + "/settings");
  await page.waitForSelector("text=Key Vault");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/11-settings.png`, fullPage: true });
});

await run("desktop-dark", { width: 1366, height: 900 }, "dark", async (page) => {
  await login(page);
  const brief = page.locator("button:has-text(\"Let's go\")");
  if (await brief.count()) await brief.click();
  await page.waitForTimeout(2500);
  await shot(page, "12-hq-map-dark");
});

await run("phone-light", { width: 390, height: 844 }, "light", async (page) => {
  await login(page);
  const brief = page.locator("button:has-text(\"Let's go\")");
  if (await brief.count()) await brief.click();
  await page.waitForTimeout(1500);
  await shot(page, "13-phone-hq");
  await page.goto(BASE + "/room/finance");
  await page.waitForSelector("text=Fee calculator");
  await page.waitForTimeout(800);
  await shot(page, "14-phone-finance");
});

await run("phone-dark", { width: 390, height: 844 }, "dark", async (page) => {
  await login(page);
  await page.goto(BASE + "/room/listing");
  await page.waitForSelector("text=Task board");
  await page.waitForTimeout(800);
  await shot(page, "15-phone-listing-dark");
});

await browser.close();
if (errors.length) {
  console.log("Browser errors:\n" + errors.join("\n"));
  process.exitCode = 1;
} else console.log("Click-through OK, screenshots in", OUT);
