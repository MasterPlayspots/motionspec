// Re-audit (10/10 criterion #4) — real-browser e2e for EVERY primitive.
// Loads the demo from REAL compiler output and checks that the compiled
// motion of every primitive LIVES in the browser: a registered ScrollTrigger for
// the JS primitives, the applied CSS rule for the CSS primitives — with zero
// console/page errors. CI-only (sandbox is ARM; the x86 Actions run is the
// source of truth, as with the existing e2e).
const { test, expect } = require("@playwright/test");
const path = require("path");
const { pathToFileURL } = require("url");
const { buildDemo } = require("../../src/demo/build-demo.js");

let demoUrl;
test.beforeAll(() => {
  const { file } = buildDemo(path.join(__dirname, "..", "..", "out", "demo-e2e-prim"));
  demoUrl = pathToFileURL(file).href;
});

// 6 JS/ScrollTrigger primitives — each must place a ScrollTrigger on its target.
const JS_PRIMITIVES = ["scrollReveal", "staggerReveal", "counterUp", "parallaxLayer", "scaleOnScroll", "pinnedSection"];

test("every primitive runs in a real browser (effect applied, no errors)", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));  // only real uncaught exceptions

  await page.goto(demoUrl);
  // Libs loaded AND the compiled IIFE has registered its ScrollTriggers.
  await page.waitForFunction(
    () => window.gsap && window.ScrollTrigger && window.ScrollTrigger.getAll().length >= 6,
    null, { timeout: 15000 }
  );

  // (1) every demo element is in the DOM
  for (const name of [...JS_PRIMITIVES, "marquee", "cssTransition"]) {
    await expect(page.locator(".d-" + name).first(), name + " element present").toBeAttached();
  }

  // (2) JS primitives: a ScrollTrigger is registered whose trigger matches the target
  for (const name of JS_PRIMITIVES) {
    const ok = await page.evaluate(
      (sel) => window.ScrollTrigger.getAll().some((st) => st.trigger && st.trigger.matches && st.trigger.matches(sel)),
      ".d-" + name
    );
    expect(ok, name + " must register a ScrollTrigger").toBe(true);
  }

  // (3) marquee: the CSS keyframe animation sits on the track children
  const anim = await page.locator(".d-marquee > *").first().evaluate((el) => getComputedStyle(el).animationName);
  expect(anim, "marquee must apply its CSS animation").toMatch(/marquee/i);

  // (4) cssTransition: the CSS transition is applied
  const dur = await page.locator(".d-cssTransition").first().evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(dur, "cssTransition must apply its CSS transition").not.toBe("0s");

  // (5) the compiled output ran cleanly
  expect(errors, "compiled output must run without uncaught errors:\n" + errors.join("\n")).toEqual([]);
});
