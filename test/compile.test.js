"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { compileSpec } = require("../src/compiler/compile.js");
const { loadCatalog } = require("../src/compiler/catalog.js");

const catalog = loadCatalog();
const hero = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "hero.motionspec.json"), "utf8"));
const GOLDEN_DIR = path.join(__dirname, "golden");
const normVer = (s) => s.replace(/MotionSpec-Compiler v[0-9]+\.[0-9]+\.[0-9]+/g, "MotionSpec-Compiler vX");

test("hero example compiles (deterministic golden file)", () => {
  const res = compileSpec(hero, catalog, { specName: "hero" });
  assert.equal(res.ok, true);
  assert.equal(res.report.budgetOk, true);
  assert.equal(res.report.reducedMotion, true);

  const goldenJs = path.join(GOLDEN_DIR, "hero.motion.js");
  const goldenCss = path.join(GOLDEN_DIR, "hero.motion.css");
  if (process.env.UPDATE_GOLDEN) {
    fs.writeFileSync(goldenJs, normVer(res.js));
    fs.writeFileSync(goldenCss, normVer(res.css));
  }
  /* Normalize the version banner: golden files must not break on every
   * version bump — the logic is compared, not the version number. */
  assert.equal(normVer(res.js), normVer(fs.readFileSync(goldenJs, "utf8")), "JS deviates from golden file");
  assert.equal(normVer(res.css), normVer(fs.readFileSync(goldenCss, "utf8")), "CSS deviates from golden file");
});

test("determinism: compiling twice yields identical code", () => {
  const a = compileSpec(hero, catalog, { specName: "hero" });
  const b = compileSpec(hero, catalog, { specName: "hero" });
  assert.equal(a.js, b.js);
  assert.equal(a.css, b.css);
});

test("selectors end up as safe JS literals in the code", () => {
  const res = compileSpec(hero, catalog, { specName: "hero" });
  assert.ok(res.js.includes('gsap.from(".hero h1"'), "selector must be JSON-quoted");
  assert.ok(!res.js.includes("'.hero h1'"), "no more bare single-quote interpolation");
});

test("reduced-motion gate is contained in the JS and CSS artifact", () => {
  const res = compileSpec(hero, catalog, { specName: "hero" });
  assert.ok(res.js.includes("prefers-reduced-motion"));
  assert.ok(res.css.includes("prefers-reduced-motion"));
});

test("invalid spec produces no output at all (fail-closed)", () => {
  const bad = JSON.parse(JSON.stringify(hero));
  bad.motions[0].primitive = "erfunden";
  const res = compileSpec(bad, catalog);
  assert.equal(res.ok, false);
  assert.equal(res.js, undefined);
  assert.equal(res.css, undefined);
});

test("budget gate reports overrun", () => {
  const big = JSON.parse(JSON.stringify(hero));
  for (let i = 0; i < 6; i++)
    big.motions.push({ id: "p" + i, primitive: "parallaxLayer", target: ".l" + i, params: {} });
  const res = compileSpec(big, catalog);
  assert.equal(res.ok, true);
  assert.equal(res.report.budgetOk, false);
});

/* ---------- TASK-004: respectReducedMotion default-on ---------- */

test("spec without globals -> report.reducedMotion===true (default-on)", () => {
  const spec = {
    specVersion: "1.0",
    meta: { project: "t", target: "vanilla-gsap" },
    motions: [{
      id: "m1",
      primitive: "scrollReveal",
      target: ".hero h1",
      params: { from: { opacity: 0, y: 48 } },
    }],
  };
  const res = compileSpec(spec, catalog, { specName: "defaultOn" });
  assert.equal(res.ok, true);
  assert.equal(res.report.reducedMotion, true, "reducedMotion should be true when globals is missing");
});

test("globals.respectReducedMotion:false -> reducedMotionOverriddenOff===true and no prefers-reduced-motion in JS", () => {
  const spec = {
    specVersion: "1.0",
    meta: { project: "t", target: "vanilla-gsap" },
    globals: { respectReducedMotion: false },
    motions: [{
      id: "m1",
      primitive: "scrollReveal",
      target: ".hero h1",
      params: { from: { opacity: 0, y: 48 } },
    }],
  };
  const res = compileSpec(spec, catalog, { specName: "rrmOff" });
  assert.equal(res.ok, true);
  assert.equal(res.report.reducedMotionOverriddenOff, true, "reducedMotionOverriddenOff should be true");
  assert.ok(
    !res.js.includes("prefers-reduced-motion"),
    "JS must not contain a prefers-reduced-motion guard when respectReducedMotion:false"
  );
});
