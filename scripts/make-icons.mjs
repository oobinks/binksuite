// Renders public/logo.svg into the PNG icons phones use for "Add to Home Screen".
// Usage: node scripts/make-icons.mjs
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const svg = readFileSync("public/logo.svg", "utf8");
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
for (const [file, size, pad, bg] of [
  ["public/apple-touch-icon.png", 180, 14, "#fbf6ee"],
  ["public/icon-192.png", 192, 10, "transparent"],
  ["public/icon-512.png", 512, 26, "transparent"],
  ["public/icon-maskable-512.png", 512, 80, "#fbf6ee"],
]) {
  const p = await (await b.newContext({ viewport: { width: size, height: size } })).newPage();
  await p.setContent(`<html><body style="margin:0;background:${bg}"><div style="width:${size}px;height:${size}px;display:grid;place-items:center">${svg.replace("<svg ", `<svg width="${size - pad * 2}" height="${size - pad * 2}" `)}</div></body></html>`);
  await p.screenshot({ path: file, omitBackground: bg === "transparent" });
}
await b.close();
console.log("icons written");
