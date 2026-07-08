"use strict";
/*
 * safety-parity.test.js — proves the de-duplication of the safety layer.
 * ----------------------------------------------------------------------
 * CSS_SAFE_RE, UNSAFE_TOKENS, unsafeToken, cssRaw and withDefaults previously
 * lived duplicated in compile.js (GSAP) AND lower-waapi.js (WAAPI). Maintaining
 * security-critical values twice means: one copy can drift, and the "defense in
 * depth" is then only armed on one side. Now there is ONE source
 * (src/compiler/safety.js). This test pins that down on three levels:
 *   (1) Reference identity: both passes export EXACTLY the objects from
 *       safety.js (===), not just structurally equal copies.
 *   (2) Source text: no file defines the constants a second time locally
 *       (no silent re-fork in the future).
 *   (3) Behavior: GSAP and WAAPI passes decide CSS safety identically.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const safety = require("../src/compiler/safety.js");
const compile = require("../src/compiler/compile.js");
const lower = require("../src/compiler/lower-waapi.js");
const validate = require("../src/compiler/validate.js");
const { loadCatalog } = require("../src/compiler/catalog.js");

const SRC = path.join(__dirname, "..", "src", "compiler");
const read = (f) => fs.readFileSync(path.join(SRC, f), "utf8");

/* ---- (0) safety.js is the ONE source and complete ------------------------ */
test("safety.js exports CSS_SAFE_RE, UNSAFE_TOKENS, unsafeToken, cssRaw, withDefaults", () => {
  assert.ok(safety.CSS_SAFE_RE instanceof RegExp, "CSS_SAFE_RE must be a RegExp");
  assert.ok(Array.isArray(safety.UNSAFE_TOKENS) && safety.UNSAFE_TOKENS.length > 0);
  assert.equal(typeof safety.unsafeToken, "function");
  assert.equal(typeof safety.cssRaw, "function");
  assert.equal(typeof safety.withDefaults, "function");
});

/* ---- (1) reference identity: both passes use THE SAME source ------------- */
test("reference identity: compile.js + lower-waapi.js share cssRaw/withDefaults from safety.js", () => {
  assert.strictEqual(compile.cssRaw, safety.cssRaw, "compile.cssRaw must be === safety.cssRaw");
  assert.strictEqual(compile.withDefaults, safety.withDefaults, "compile.withDefaults must be === safety.withDefaults");
  assert.strictEqual(lower.cssRaw, safety.cssRaw, "lowerWaapi.cssRaw must be === safety.cssRaw");
  assert.strictEqual(lower.withDefaults, safety.withDefaults, "lowerWaapi.withDefaults must be === safety.withDefaults");
  // the GSAP and WAAPI cssRaw are thus transitively the same object:
  assert.strictEqual(compile.cssRaw, lower.cssRaw);
  assert.strictEqual(compile.withDefaults, lower.withDefaults);
});

test("reference identity: validate.js uses unsafeToken from safety.js (one UNSAFE_TOKENS list)", () => {
  assert.strictEqual(validate.unsafeToken, safety.unsafeToken, "validate.unsafeToken must be === safety.unsafeToken");
});

/* ---- (2) source text: no second local definition of the constants -------- */
test("source text: every consumer file imports safety.js and re-forks nothing", () => {
  for (const f of ["compile.js", "lower-waapi.js", "validate.js"]) {
    const src = read(f);
    assert.match(src, /require\("\.\/safety\.js"\)/, f + " must import safety.js");
    assert.equal(/\bCSS_SAFE_RE\s*=/.test(src), false, f + " must not redefine CSS_SAFE_RE locally");
    // the UNSAFE_TOKENS list signature may live ONLY in safety.js:
    assert.equal(src.includes('"vbscript:"'), false, f + " contains a second UNSAFE_TOKENS copy");
    assert.equal(/function\s+cssRaw\s*\(/.test(src), false, f + " must not redefine cssRaw locally");
    assert.equal(/function\s+withDefaults\s*\(/.test(src), false, f + " must not redefine withDefaults locally");
  }
  // safety.js IS the source: it carries the list exactly once.
  const safetySrc = read("safety.js");
  assert.ok(safetySrc.includes('"vbscript:"'), "safety.js must carry the UNSAFE_TOKENS list");
  assert.match(safetySrc, /CSS_SAFE_RE\s*=/, "safety.js must define CSS_SAFE_RE");
});

/* ---- (3) behavior: both passes decide CSS safety identically ------------- */
const catalog = loadCatalog();
const cssSpec = (params) => ({
  specVersion: "1.0",
  meta: { project: "parity", target: "vanilla-gsap" },
  globals: { respectReducedMotion: true },
  motions: [{ id: "m", primitive: "cssTransition", target: ".box", params }],
});

test("behavior: GSAP and WAAPI passes accept/reject the same CSS values", () => {
  const cases = [
    [{ property: "transform", hoverValue: "translateY(-4px)" }, true],
    [{ property: "opacity", hoverValue: "0.5" }, true],
    [{ hoverValue: "url(javascript:alert(1))" }, false],
    [{ hoverValue: "expression(alert(1))" }, false],
  ];
  for (const [params, expectOk] of cases) {
    const g = compile.compileSpec(cssSpec(params), catalog, {});
    const w = lower.lowerWaapi(cssSpec(params), catalog, {});
    assert.equal(g.ok, expectOk, "GSAP pass disagrees for " + JSON.stringify(params));
    assert.equal(w.ok, expectOk, "WAAPI pass disagrees for " + JSON.stringify(params));
    assert.equal(g.ok, w.ok, "GSAP/WAAPI disagree (asymmetry) for " + JSON.stringify(params));
  }
});

test("behavior: the shared cssRaw throws fail-closed on dangerous token + allow-list violation", () => {
  assert.throws(() => safety.cssRaw("url(javascript:x)", "t"), /dangerous token/);
  assert.throws(() => safety.cssRaw("a/*b*/c", "t"), /allow-list|dangerous/);
  assert.equal(safety.cssRaw("translateY(-4px)", "t"), "translateY(-4px)");
});

test("behavior: the shared withDefaults fills missing fields from the paramSchema", () => {
  const schema = { a: { default: 1 }, b: { default: "x" } };
  assert.deepEqual(safety.withDefaults(schema, { a: 9 }), { a: 9, b: "x" });
  assert.deepEqual(safety.withDefaults(schema, undefined), { a: 1, b: "x" });
});
