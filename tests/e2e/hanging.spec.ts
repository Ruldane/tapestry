import { expect, test, type Page } from "@playwright/test";

/**
 * Behavioural browser tests against the static export. The page exposes
 * read-only views of the village on window.__ashcombe (the same data the
 * parish roll and the biographies read) and the same commands the controls use.
 */

type Hooks = {
  ready: () => boolean;
  tick: () => number;
  positions: (n?: number) => { id: number; x: number; y: number; kind: number; act: number; inside: boolean }[];
  stranger: () => { present: boolean; x: number; y: number } | null;
  camX: () => number;
  clothToClient: (x: number, y: number) => { x: number; y: number } | null;
  hits: () => { id: number; x0: number; y0: number; x1: number; y1: number }[];
  ui: () => { selected: number | null; bio: { id: number; name: string; x: number; alive: boolean } | null; back: boolean; still: boolean; paused: boolean; visits: unknown[]; absence: { id: number; note: string } | null; founded: boolean };
  scene: () => { chronicle: { away: number | null }[] } | null;
  roster: () => { id: number; name: string }[];
  walkTo: (x: number) => void;
  save: () => void;
  savedAt: () => number | null;
  perf: () => { figures: number; cache: { pending: number } };
};

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || /hydrat/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page, query = "") {
  const errors = watch(page);
  await page.goto(`/?fresh&seed=7${query}`);
  await page.waitForFunction(() => {
    const a = (window as unknown as { __ashcombe?: Hooks }).__ashcombe;
    return !!a && a.ready() && a.tick() > 4;
  });
  return errors;
}

const h = <T>(page: Page, fn: (h: Hooks) => T) =>
  page.evaluate((src) => {
    const f = new Function("h", `return (${src})(h)`);
    return f((window as unknown as { __ashcombe: Hooks }).__ashcombe);
  }, fn.toString()) as Promise<Awaited<T>>;

// A daytime clock, so the village is up and about.
const DAY = "&clock=2026-06-16T10:30";

test("the village goes on with no input", async ({ page }) => {
  const errors = await open(page, `${DAY}&x=930`);
  const a = await h(page, (h) => ({ tick: h.tick(), pos: h.positions(400) }));
  await page.waitForTimeout(5000);
  const b = await h(page, (h) => ({ tick: h.tick(), pos: h.positions(400) }));
  expect(b.tick).toBeGreaterThan(a.tick + 12);
  const before = new Map(a.pos.map((p) => [p.id, p]));
  let moved = 0;
  for (const p of b.pos) {
    const q = before.get(p.id);
    if (q && Math.hypot(p.x - q.x, p.y - q.y) > 0.4) moved++;
  }
  expect(moved).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

test("staying the needle really stops the village, and letting it run resumes", async ({ page }) => {
  await open(page, `${DAY}&weather=rain`);
  const stay = page.getByRole("button", { name: /stay the needle/i });
  await stay.click();
  await expect(page.getByRole("button", { name: /the needle is stayed/i })).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(800);
  const t1 = await h(page, (h) => ({ tick: h.tick(), pos: h.positions(300) }));
  await page.waitForTimeout(2500);
  const t2 = await h(page, (h) => ({ tick: h.tick(), pos: h.positions(300) }));
  expect(t2.tick).toBe(t1.tick);
  expect(t2.pos).toEqual(t1.pos);
  // Nothing moves by itself on the cloth either: no rain, no birds, no swaying thread.
  await expect.poll(async () => h(page, (h) => h.perf().cache.pending), { timeout: 8000 }).toBe(0);
  const canvas = page.locator("canvas.cloth");
  const a = await canvas.screenshot();
  await page.waitForTimeout(1200);
  const b = await canvas.screenshot();
  expect(Buffer.compare(a, b)).toBe(0);
  await page.getByRole("button", { name: /the needle is stayed/i }).click();
  await expect.poll(async () => h(page, (h) => h.tick()), { timeout: 5000 }).toBeGreaterThan(t1.tick);
});

test("the stranger is stitched into the cloth and the village takes notice", async ({ page }) => {
  await open(page, `${DAY}&x=960&speed=6`);
  const s = await h(page, (h) => h.stranger());
  expect(s?.present).toBe(true);
  // The little figure is labelled for a first-time visitor.
  await expect(page.locator(".you-tag")).toHaveCSS("opacity", "1", { timeout: 10_000 });
  // Someone greets, follows or watches the stranger (acts 13, 14, 15).
  await expect
    .poll(async () => h(page, (h) => h.positions(400).filter((p) => p.kind === 0 && (p.act === 13 || p.act === 14 || p.act === 15)).length), {
      timeout: 60_000,
      intervals: [1000],
    })
    .toBeGreaterThan(0);
  // The stranger walks where the visitor walks.
  await h(page, (h) => h.walkTo(1120));
  await expect.poll(async () => h(page, (h) => h.stranger()?.x ?? 0), { timeout: 30_000 }).toBeGreaterThan(1060);
});

test("a biography tells a real villager's state", async ({ page }) => {
  await open(page, `${DAY}&x=930`);
  await page.waitForTimeout(1500);
  // Stay the needle so nobody walks out from under the pointer.
  await page.getByRole("button", { name: /stay the needle/i }).click();
  await page.waitForTimeout(600);
  const target = await h(page, (h) => {
    const hits = h
      .hits()
      .filter((b) => b.id !== 0)
      .map((b) => ({ id: b.id, pt: h.clothToClient((b.x0 + b.x1) / 2, b.y1 - 4)! }))
      .filter((b) => b.pt.x > 200 && b.pt.x < innerWidth - 420 && b.pt.y > 80 && b.pt.y < innerHeight - 160);
    return hits[Math.floor(hits.length / 2)];
  });
  await page.mouse.click(target.pt!.x, target.pt!.y);
  const panel = page.getByRole("complementary");
  await expect(panel).toBeVisible();
  await expect.poll(async () => h(page, (h) => h.ui().bio?.id ?? null)).not.toBeNull();
  const ui = await h(page, (h) => h.ui());
  const name = await h(page, (h) => h.roster());
  const entry = name.find((r) => r.id === ui.bio!.id);
  expect(entry?.name).toBe(ui.bio!.name);
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText(ui.bio!.name);
  // The biography's place matches where that villager is on the cloth.
  const live = await h(page, (h) => h.positions(400));
  const me = live.find((p) => p.id === ui.bio!.id);
  expect(me).toBeTruthy();
  expect(Math.abs(me!.x - ui.bio!.x)).toBeLessThan(12);
  await expect(panel).toContainText(/Now/);
});

test("the village persists across reloads, and the chronicle records the absence", async ({ page }) => {
  await open(page, DAY);
  await h(page, (h) => h.save());
  await expect.poll(async () => h(page, (h) => h.savedAt())).not.toBeNull();
  const visits = await h(page, (h) => h.ui().visits.length);
  const names = await h(page, (h) => h.roster().map((r) => r.name).slice(0, 10));
  // Come back three days later (on the village's clock).
  await page.goto(`/?clock=2026-06-19T10:30`);
  await page.waitForFunction(() => (window as unknown as { __ashcombe?: Hooks }).__ashcombe?.ready());
  const ui = await h(page, (h) => h.ui());
  expect(ui.founded).toBe(false);
  expect(ui.visits.length).toBe(visits + 1);
  expect(ui.absence?.note).toMatch(/You were away three days/);
  await expect(page.getByRole("dialog", { name: /while you were away/i })).toBeVisible();
  const away = await h(page, (h) => h.scene()?.chronicle.filter((c) => c.away !== null).length ?? 0);
  expect(away).toBeGreaterThan(0);
  const after = await h(page, (h) => h.roster().map((r) => r.name));
  expect(names.filter((n) => after.includes(n)).length).toBeGreaterThan(5);
});

test("the hanging can be walked by keyboard", async ({ page }) => {
  await open(page, DAY);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  const x0 = await h(page, (h) => h.camX());
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await expect.poll(async () => h(page, (h) => h.camX())).toBeGreaterThan(x0 + 30);
  await page.waitForTimeout(1200);
  const x1 = await h(page, (h) => h.camX());
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => h(page, (h) => h.camX())).toBeLessThan(x1);
  // The selvedge takes you to a scene, by keyboard too.
  await page.getByRole("button", { name: "The manor" }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => h(page, (h) => h.camX()), { timeout: 8000 }).toBeGreaterThan(1000);
});

test("reduced motion gives still pictures", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await open(page, `${DAY}&x=930`);
  expect(await h(page, (h) => h.ui().still)).toBe(true);
  // The village lives on (the clock runs), but the picture holds between stills.
  await page.waitForTimeout(4600);
  const canvas = page.locator("canvas.cloth");
  const a = await canvas.screenshot();
  await page.waitForTimeout(900);
  const b = await canvas.screenshot();
  expect(Buffer.compare(a, b)).toBe(0);
  const t = await h(page, (h) => h.tick());
  await page.waitForTimeout(1500);
  expect(await h(page, (h) => h.tick())).toBeGreaterThan(t);
  // A still picture is still a picture of people.
  expect(await h(page, (h) => h.perf().figures)).toBeGreaterThan(0);
  expect((await h(page, (h) => h.hits())).length).toBeGreaterThan(0);
  await ctx.close();
});

for (const [w, hgt] of [
  [390, 844],
  [768, 1024],
  [1440, 900],
  [2560, 1440],
] as const) {
  test(`no sideways overflow of the page at ${w}px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt } });
    const page = await ctx.newPage();
    const errors = await open(page, DAY);
    await h(page, (h) => h.walkTo(900));
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.locator("#roll").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow2).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test("the cloth can be turned over to show the threads between lives", async ({ page }) => {
  await open(page, `${DAY}&x=930`);
  await page.getByRole("button", { name: "Turn the cloth" }).click();
  await expect.poll(async () => h(page, (h) => h.ui().back), { timeout: 4000 }).toBe(true);
  await expect(page.getByRole("note", { name: /threads on the back/i })).toBeVisible();
  await page.getByRole("button", { name: "Turn it back" }).click();
  await expect.poll(async () => h(page, (h) => h.ui().back), { timeout: 4000 }).toBe(false);
});

test("the parish roll is a real table, and 'what is happening now' answers", async ({ page }) => {
  await open(page, DAY);
  await page.getByRole("button", { name: /what is happening now/i }).click();
  const dialog = page.getByRole("dialog", { name: /what is happening in ashcombe now/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/It is in the morning/);
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.locator("#roll").scrollIntoViewIfNeeded();
  const table = page.getByRole("table", { name: /households of ashcombe/i });
  await expect(table).toBeVisible();
  expect(await table.getByRole("row").count()).toBeGreaterThan(10);
});
