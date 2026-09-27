/**
 * Development aid: measure frame rate and figures drawn on the static build,
 * with and without the CPU throttled.  node scripts/perf.mjs [port]
 */
import { chromium } from "@playwright/test";
const port = process.argv[2] ?? "3262";
const b = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--enable-accelerated-2d-canvas"] });
const rows = [];
for (const [w, h] of [[390, 844], [768, 1024], [1440, 900], [2560, 1440]]) {
  for (const rate of [1, 4]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const cdp = await p.context().newCDPSession(p);
    await p.goto(`http://localhost:${port}/?fresh&seed=7&x=960&clock=2026-06-16T15:30`);
    await p.waitForTimeout(6000);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    await p.waitForTimeout(9000);
    const r = await p.evaluate(() => {
      const a = window.__ashcombe;
      return { perf: a.perf(), agents: a.positions(1000).length };
    });
    rows.push({ viewport: `${w}x${h}`, cpu: `${rate}x`, fps: Math.round(r.perf.fps), p90: Math.round(r.perf.p90), tier: r.perf.tier, drawn: r.perf.figures, agents: r.agents, msPerStep: r.perf.msPerStep.toFixed(2) });
    await p.close();
  }
}
console.table(rows);
await b.close();
