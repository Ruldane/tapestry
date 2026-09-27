/**
 * Development aid: open the hanging in headless Chromium and save screenshots.
 *
 *   node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [js-to-run-before-shot]
 */
import { chromium } from "@playwright/test";

const [url, out, w = "1440", h = "900", wait = "6000", js = "", reduce = ""] = process.argv.slice(2);
const browser = await chromium.launch();
const dpr = Number(process.env.DPR ?? 1);
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: dpr, reducedMotion: reduce === "reduce" ? "reduce" : "no-preference" });
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForTimeout(Number(wait));
if (js) {
  const r = await page.evaluate(js);
  if (r !== undefined) console.log("eval:", JSON.stringify(r).slice(0, 2000));
  await page.waitForTimeout(2500);
}
const clip = process.env.CLIP ? process.env.CLIP.split(",").map(Number) : null;
await page.screenshot({ path: out, ...(clip ? { clip: { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } } : {}) });
const info = await page.evaluate(() => {
  const a = window.__ashcombe;
  return a ? { ready: a.ready(), tick: a.tick(), pop: a.population(), camX: a.camX(), perf: a.perf(), needle: a.needle(), stranger: a.stranger() } : null;
});
console.log(JSON.stringify(info));
for (const l of logs.slice(0, 20)) console.log(l);
await browser.close();
