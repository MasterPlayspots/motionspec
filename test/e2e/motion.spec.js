// Phase B — real-browser e2e. Loads the demo page built from ACTUAL compiler
// output (not a mock) and asserts behaviour, not just "it loaded":
//   1. a below-the-fold scrollReveal/staggerReveal target starts hidden
//      (opacity ~0) and animates to fully visible (opacity 1) when scrolled in.
//   2. with prefers-reduced-motion: reduce, the compiled guard returns early and
//      content is fully visible WITHOUT animation (the a11y / EAA path).
// CI-only (sandbox is ARM). The GitHub Actions x86 run is the source of truth.
const { test, expect } = require("@playwright/test");
const path = require("path");
const { pathToFileURL } = require("url");
const { buildDemo } = require("../../src/demo/build-demo.js");

let demoUrl;

test.beforeAll(() => {
  const outDir = path.join(__dirname, "..", "..", "out", "demo-e2e");
  const { file } = buildDemo(outDir);
  demoUrl = pathToFileURL(file).href;
});

test("motion runs: a below-the-fold target animates from hidden to visible", async ({ page }) => {
  await page.goto(demoUrl);
  await page.waitForFunction(() => window.gsap && window.ScrollTrigger, null, { timeout: 15000 });

  const card = page.locator(".d-staggerReveal").first();
  await expect(card).toBeAttached();

  // gsap.from sets the from-state (opacity 0) immediately; below the fold it stays hidden.
  const before = await card.evaluate((el) => parseFloat(getComputedStyle(el).opacity));
  expect(before).toBeLessThan(0.5);

  await card.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => card.evaluate((el) => parseFloat(getComputedStyle(el).opacity)), { timeout: 6000 })
    .toBeGreaterThan(0.95);
});

test("reduced motion: content is fully visible without animation (a11y path)", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(demoUrl);
  await page.waitForFunction(() => typeof window.gsap !== "undefined", null, { timeout: 15000 });

  // The compiled IIFE returns before any gsap.from() runs, so targets keep their
  // natural opacity (1) — nothing is ever hidden. Assert across reveal targets.
  for (const sel of [".d-scrollReveal", ".d-staggerReveal"]) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      const opacity = await el.evaluate((node) => parseFloat(getComputedStyle(node).opacity));
      expect(opacity, sel + " must be visible under reduced motion").toBeGreaterThan(0.95);
    }
  }
  await context.close();
});
