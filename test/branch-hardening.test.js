"use strict";
/*
 * branch-hardening.test.js
 * ------------------------
 * Exercises the FAIL-CLOSED / edge branches that the happy-path suite leaves
 * uncovered — real code paths, not coverage theater:
 *   - catalog meta-schema rejections + buildCatalog dup/nameless + summary subset
 *   - request cache: miss / TTL-expiry / corrupt-JSON / back-compat / sweep / evict
 *   - discover: a mapped intent that fails to compile is reported as a gap
 *   - catalog SemVer diff: removed / major-without-bump / minor-without-bump
 *   - WAAPI lowering: once:false, no-opacity fallback, scrub:0 snap, RM-off
 *   - Trust Boundary: non-object transform / trigger / globals
 * Deterministic, no network, cache isolated to a tmpdir.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/* Isolate the request cache to a tmpdir BEFORE requiring cache.js (it reads
 * MOTION_CACHE_DIR at module load). node --test runs each file in its own
 * process, so this cannot leak into other test files. */
const CACHE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ms-cache-"));
process.env.MOTION_CACHE_DIR = CACHE_TMP;

const { test } = require("node:test");
const assert = require("node:assert");
const { loadCatalog, buildCatalog, checkPrimitive, catalogSummary } = require("../src/compiler/catalog.js");
const { lowerWaapi } = require("../src/compiler/lower-waapi.js");
const { validateSpec } = require("../src/compiler/validate.js");
const { diffCatalog } = require("../src/compiler/catalog-semver.js");
const { discover } = require("../src/discover/discover.js");
const cache = require("../src/router/cache.js");
const { buildDemo } = require("../src/demo/build-demo.js");

const CAT = loadCatalog();
const okPrim = { name: "okPrim", version: "1.0.0", output: "css", engine: "native-css", template: "t", paramSchema: {} };
function specFor(primitive, params, trigger) {
  const m = { id: "m1", primitive, target: ".x", params: params || {} };
  if (trigger !== undefined) m.trigger = trigger;
  return { specVersion: "1.0", meta: { project: "bh", target: "vanilla-gsap" }, globals: { respectReducedMotion: true }, motions: [m] };
}

/* ---- 1. Catalog meta-schema (the primitive files ARE a trust boundary) ---- */
test("buildCatalog rejects a duplicate primitive name", () => {
  assert.throws(() => buildCatalog([okPrim, Object.assign({}, okPrim)]), /Duplicate primitive: okPrim/);
});
test("buildCatalog reports the index for a nameless primitive", () => {
  assert.throws(() => buildCatalog([{}]), /Catalog rejected \(#0\)/);
});
test("checkPrimitive rejects bad output / empty template / non-SemVer / bad param type / ReDoS / oversize template", () => {
  assert.throws(() => checkPrimitive(Object.assign({}, okPrim, { output: "wat" }), "f"), /output must be/);
  assert.throws(() => checkPrimitive(Object.assign({}, okPrim, { template: "" }), "f"), /template missing/);
  assert.throws(() => checkPrimitive(Object.assign({}, okPrim, { version: "1.0" }), "f"), /SemVer/);
  assert.throws(() => checkPrimitive(Object.assign({}, okPrim, { paramSchema: { d: { type: "money" } } }), "f"), /type not allowed/);
  assert.throws(() => checkPrimitive(Object.assign({}, okPrim, { paramSchema: { d: { type: "string", pattern: "(a+)+" } } }), "f"), /ReDoS/);
  assert.throws(() => checkPrimitive(Object.assign({}, okPrim, { template: "x".repeat(5000) }), "f"), /template too long/);
});
test("catalogSummary returns a field subset and defaults cost/fallback for a bare primitive", () => {
  const bare = { name: "bare", version: "1.0.0", output: "css", engine: "x", template: "t", paramSchema: {} };
  assert.deepEqual(catalogSummary({ bare }, ["name", "cost"]), [{ name: "bare", cost: 0 }]);
  const full = catalogSummary({ bare });
  assert.equal(full[0].cost, 0);
  assert.equal(full[0].reducedMotionFallback, null);
});

/* ---- 2. Request cache — the non-happy branches (never a trust boundary) --- */
test("cache.get returns null for a missing key", () => {
  assert.equal(cache.get("no-such-key"), null);
});
test("cache.set + get round-trips a spec", () => {
  cache.set("k1", { hello: "world" });
  assert.deepEqual(cache.get("k1"), { hello: "world" });
});
test("cache.get drops an expired (TTL) entry and returns null", () => {
  const f = path.join(CACHE_TMP, "expired.json");
  fs.writeFileSync(f, JSON.stringify({ spec: { a: 1 }, savedAt: Date.now() - cache.TTL_MS - 1000 }));
  assert.equal(cache.get("expired"), null);
  assert.equal(fs.existsSync(f), false);
});
test("cache.get returns null on corrupt JSON", () => {
  fs.writeFileSync(path.join(CACHE_TMP, "corrupt.json"), "{ not valid json");
  assert.equal(cache.get("corrupt"), null);
});
test("cache.get is backwards-compatible with a raw (no .spec) entry", () => {
  fs.writeFileSync(path.join(CACHE_TMP, "raw.json"), JSON.stringify({ legacy: true }));
  assert.deepEqual(cache.get("raw"), { legacy: true });
});
test("cache.sweep removes expired entries and ignores corrupt ones", () => {
  fs.writeFileSync(path.join(CACHE_TMP, "old.json"), JSON.stringify({ spec: {}, savedAt: 1 }));
  fs.writeFileSync(path.join(CACHE_TMP, "junk.json"), "nope");
  assert.ok(cache.sweep() >= 1);
});
test("cache.evict trims down to MAX_ENTRIES when over the cap", () => {
  for (let i = 0; i <= cache.MAX_ENTRIES + 4; i++) fs.writeFileSync(path.join(CACHE_TMP, "e" + i + ".json"), "{}");
  cache.evict();
  const remaining = fs.readdirSync(CACHE_TMP).filter((f) => f.endsWith(".json")).length;
  assert.ok(remaining <= cache.MAX_ENTRIES, "evict left " + remaining + " > " + cache.MAX_ENTRIES);
});

/* ---- 3. discover: mapped intent whose spec fails to compile = a GAP ------- */
test("discover reports a gap when a mapped intent fails to compile (unsafe target)", () => {
  const r = discover({ project: "t", intents: [{ what: "hero headline reveal on scroll", target: "'); alert(1); //" }] });
  assert.equal(r.covered.length, 0);
  assert.equal(r.gaps.length, 1);
  assert.match(r.gaps[0].reason, /compile\/validate failed/);
});

/* ---- 4. Catalog SemVer diff-gate — the violation branches ----------------- */
test("diffCatalog flags a removed primitive as breaking", () => {
  const { violations, removed } = diffCatalog({ gone: { version: "1.0.0", output: "css", params: {} } }, {});
  assert.deepEqual(removed, ["gone"]);
  assert.match(violations[0].msg, /REMOVED/);
});
test("diffCatalog: tightening a bound without a MAJOR bump is a violation", () => {
  const prev = { version: "1.0.0", output: "js", params: { d: { type: "number", required: false, min: 0.2, max: 5, pattern: null } } };
  const curr = { version: "1.0.1", output: "js", params: { d: { type: "number", required: false, min: 0.2, max: 3, pattern: null } } };
  assert.match(diffCatalog({ p: prev }, { p: curr }).violations[0].msg, /MAJOR/);
});
test("diffCatalog: a new optional param without a MINOR bump is a violation", () => {
  const prev = { version: "1.0.0", output: "js", params: {} };
  const curr = { version: "1.0.0", output: "js", params: { x: { type: "number", required: false, min: null, max: null, pattern: null } } };
  assert.match(diffCatalog({ p: prev }, { p: curr }).violations[0].msg, /MINOR/);
});

/* ---- 5. WAAPI lowering — the edge branches ------------------------------- */
test("lower-waapi: reveal primitives honor trigger.once:false (re-observe path)", () => {
  assert.match(lowerWaapi(specFor("scrollReveal", { from: { opacity: 0, y: 20 } }, { once: false }), CAT).js, /re-observe: once=false/);
  assert.match(lowerWaapi(specFor("staggerReveal", { from: { opacity: 0 }, stagger: 0.1 }, { once: false }), CAT).js, /re-observe/);
  assert.match(lowerWaapi(specFor("counterUp", {}, { once: false }), CAT).js, /re-observe/);
});
test("lower-waapi: a reveal without from.opacity falls back to opacity 0", () => {
  const r = lowerWaapi(specFor("scrollReveal", { from: { y: 30 } }), CAT);
  assert.equal(r.ok, true);
  assert.match(r.js, /opacity = "0"/);
});
test("lower-waapi: scrub=0 snaps (ALPHA 1) for parallaxLayer and scaleOnScroll", () => {
  assert.match(lowerWaapi(specFor("parallaxLayer", { yPercent: -20, scrub: 0 }, { start: "top bottom", end: "bottom top" }), CAT).js, /ALPHA = 1/);
  assert.match(lowerWaapi(specFor("scaleOnScroll", { fromScale: 0.8, toScale: 1, scrub: 0 }, { start: "top bottom", end: "center center" }), CAT).js, /ALPHA = 1/);
});
test("lower-waapi: globals.respectReducedMotion:false drops the css @media guard", () => {
  const spec = specFor("floatLoop", { distance: "8px", duration: 3, axis: "y" });
  spec.globals.respectReducedMotion = false;
  const r = lowerWaapi(spec, CAT);
  assert.equal(r.ok, true);
  assert.ok(!/@media \(prefers-reduced-motion/.test(r.css));
});

/* ---- 6. Trust Boundary — non-object transform / trigger / globals -------- */
test("validate rejects a non-object transform / trigger / globals", () => {
  assert.ok(validateSpec(specFor("scrollReveal", { from: "nope" }), CAT).errorCodes.includes("MS-PARAM-TYPE"));
  assert.ok(validateSpec(specFor("scrollReveal", { from: { opacity: 0 } }, []), CAT).errorCodes.includes("MS-TRIGGER-OBJ"));
  const g = specFor("scrollReveal", { from: { opacity: 0 } });
  g.globals = [];
  assert.ok(validateSpec(g, CAT).errorCodes.includes("MS-GLOBALS-OBJ"));
});

/* ---- 7. Demo generator — demo-less / unverified / single-sink / brand map -- */
const DEMO_CAT = {
  aCss: { name: "aCss", version: "1.0.0", output: "css", engine: "native-css",
    template: "{{css target}} { animation: motion-a-{{css id}} 1s linear infinite }\n@keyframes motion-a-{{css id}} { from { transform: scale(1) } to { transform: scale(1.1) } }",
    paramSchema: {}, performance: { verified: true, lcpSafe: true, cost: 1, verifiedAt: "2026-01-01" },
    a11y: { reducedMotionFallback: "static" },
    demo: { html: "<div class=\"d-aCss\" style=\"background:#6366f1;color:#123456\">A</div>", params: {} } },
  bJs: { name: "bJs", version: "1.0.0", output: "js", engine: "gsap.ScrollTrigger",
    template: "gsap.to({{target}}, { opacity: 1 });",
    paramSchema: {}, performance: { lcpSafe: true, cost: 1 },
    a11y: { reducedMotionFallback: "instant-visible" },
    demo: { html: "<div class=\"d-bJs\">B</div>", params: {} } },
  cNoDemo: { name: "cNoDemo", version: "1.0.0", output: "css", engine: "native-css",
    template: "{{css target}} { opacity: 1 }", paramSchema: {},
    performance: { verified: true, lcpSafe: true, cost: 1, verifiedAt: "2026-01-01" },
    a11y: { reducedMotionFallback: "static" } },
};
test("build-demo: demo-less -> NO DEMO BLOCK, missing verifiedAt -> UNVERIFIED, brand-color mapping, fresh outDir", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ms-demo-"));
  const r = buildDemo(path.join(tmp, "nested-does-not-exist"), DEMO_CAT);
  const html = fs.readFileSync(r.file, "utf8");
  assert.equal(r.primitives, 3);
  assert.equal(r.motions, 2);          // cNoDemo skipped
  assert.match(html, /NO DEMO BLOCK/); // cNoDemo warning
  assert.match(html, /UNVERIFIED/);    // bJs has no verifiedAt
  assert.match(html, /var\(--teal\)/); // #6366f1 -> brand teal
  assert.match(html, /#123456/);       // unmapped hex passes through
});
test("build-demo: css-only and js-only catalogs exercise both single-sink branches", () => {
  const t1 = fs.mkdtempSync(path.join(os.tmpdir(), "ms-demo-css-"));
  assert.ok(fs.readFileSync(buildDemo(t1, { aCss: DEMO_CAT.aCss }).file, "utf8").length > 0);
  const t2 = fs.mkdtempSync(path.join(os.tmpdir(), "ms-demo-js-"));
  assert.ok(fs.readFileSync(buildDemo(t2, { bJs: DEMO_CAT.bJs }).file, "utf8").length > 0);
});
