// Building block 3 — forge perf gate (the real measurement gap).
// The blueprint names the file test/perf-budget.e2e.js; it lives here under
// test/e2e/ so the existing `npm run e2e` (playwright testDir ./test/e2e)
// runs it WITHOUT a config change (DoD: "npm run e2e includes the perf spec").
//
// Renders REAL compiler output (buildDemo, like motion.spec.js/primitives.spec.js)
// on a tall scroll page, scrolls programmatically and measures via
// PerformanceObserver DURING scrolling: total long-task time, longest
// single long task, CLS. Asserts against forge.budget.json.
//
//   1. demo (real primitives) stays within budget.
//   2. Teeth: a deliberately expensive pseudo-primitive (synthetic 120ms long task in
//      the scroll handler) is detected as a budget breach by the SAME measurement path —
//      proves the gate has teeth, without producing a red test.
//   3. prefers-reduced-motion: reduce -> no animation runs (0 ScrollTriggers,
//      reveal targets fully visible) — the a11y/EAA path.
//
// CI-only (sandbox is ARM; the x86 Actions run is the source of truth).
const { test, expect } = require("@playwright/test");
const path = require("path");
const { pathToFileURL } = require("url");
const { buildDemo } = require("../../src/demo/build-demo.js");
const BUDGET = require("../../forge.budget.json");

let demoUrl;
test.beforeAll(() => {
  const { file } = buildDemo(path.join(__dirname, "..", "..", "out", "demo-perf"));
  demoUrl = pathToFileURL(file).href;
});

/* Installs PerformanceObserver for longtask + layout-shift BEFORE every
 * document script; accumulates into window.__perf. */
function installPerfObservers(page) {
  return page.addInitScript(() => {
    window.__perf = { longTasks: [], cls: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__perf.longTasks.push(e.duration);
      }).observe({ type: "longtask", buffered: true });
    } catch { /* longtask possibly unavailable — test stays meaningful via CLS */ }
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch { /* layout-shift possibly unavailable */ }
  });
}

/* Resets the measurement (mask load-time jank), scrolls the page through
 * programmatically in viewport steps and returns the scroll metrics. */
async function measureDuringScroll(page) {
  await page.evaluate(() => { window.__perf.longTasks.length = 0; window.__perf.cls = 0; });
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(200, Math.floor(window.innerHeight * 0.9));
    const max = document.documentElement.scrollHeight;
    for (let y = 0; y <= max; y += step) { window.scrollTo(0, y); await sleep(120); }
    window.scrollTo(0, max);
    await sleep(200);
  });
  return page.evaluate(() => {
    const lt = window.__perf.longTasks;
    return { total: lt.reduce((a, b) => a + b, 0), longest: lt.reduce((a, b) => Math.max(a, b), 0), cls: window.__perf.cls };
  });
}

const withinBudget = (m) =>
  m.total < BUDGET.longTasksTotalMs && m.longest < BUDGET.longestLongTaskMs && m.cls < BUDGET.cls;

test("real primitives (demo) stay within the perf budget during scroll", async ({ page }) => {
  await installPerfObservers(page);
  await page.goto(demoUrl);
  await page.waitForFunction(() => window.gsap && window.ScrollTrigger, null, { timeout: 15000 });

  const m = await measureDuringScroll(page);
  expect(m.total, `long tasks total ${m.total}ms < ${BUDGET.longTasksTotalMs}ms`).toBeLessThan(BUDGET.longTasksTotalMs);
  expect(m.longest, `longest long task ${m.longest}ms < ${BUDGET.longestLongTaskMs}ms`).toBeLessThan(BUDGET.longestLongTaskMs);
  expect(m.cls, `CLS ${m.cls} < ${BUDGET.cls}`).toBeLessThan(BUDGET.cls);
});

test("teeth: a deliberately expensive pseudo-primitive breaks the budget (detected by the same measurement path)", async ({ page }) => {
  await installPerfObservers(page);
  // Tall scroll page whose scroll handler blocks the main thread for 120ms —
  // exactly the kind of expensive primitive the gate MUST catch.
  const sections = Array.from({ length: 20 }, (_, i) => `<section style="min-height:90vh">Block ${i}</section>`).join("");
  const html =
    "<!doctype html><meta charset=utf-8><title>expensive</title>" +
    "<script>window.__perf={longTasks:[],cls:0};try{new PerformanceObserver(function(l){for(const e of l.getEntries())window.__perf.longTasks.push(e.duration)}).observe({type:'longtask',buffered:true})}catch(e){}try{new PerformanceObserver(function(l){for(const e of l.getEntries())if(!e.hadRecentInput)window.__perf.cls+=e.value}).observe({type:'layout-shift',buffered:true})}catch(e){}</script>" +
    "<body>" + sections + "<script>" +
    "addEventListener('scroll', function(){ var t=performance.now(); while(performance.now()-t<120){} }, {passive:true});" +
    "</script></body>";
  await page.setContent(html, { waitUntil: "load" });

  const m = await measureDuringScroll(page);
  // The gate detects the breach: the same withinBudget() that is true for the demo
  // is false here (longest long task >= budget).
  expect(m.longest, `synthetic long task ${m.longest}ms must break the budget (${BUDGET.longestLongTaskMs}ms)`).toBeGreaterThanOrEqual(BUDGET.longestLongTaskMs);
  expect(withinBudget(m), "withinBudget() must REJECT the expensive run").toBe(false);
});

test("reduced motion: no animation runs (0 ScrollTriggers, content fully visible)", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(demoUrl);
  await page.waitForFunction(() => typeof window.gsap !== "undefined", null, { timeout: 15000 });

  // The compiled guard returns before every gsap.from()/ScrollTrigger:
  // NO trigger gets registered => no running animation.
  const triggers = await page.evaluate(() => (window.ScrollTrigger ? window.ScrollTrigger.getAll().length : 0));
  expect(triggers, "under reduced-motion no ScrollTrigger may be registered").toBe(0);

  for (const sel of [".d-scrollReveal", ".d-staggerReveal"]) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      const opacity = await el.evaluate((node) => parseFloat(getComputedStyle(node).opacity));
      expect(opacity, sel + " must be immediately visible under reduced-motion").toBeGreaterThan(0.95);
    }
  }
  await context.close();
});
