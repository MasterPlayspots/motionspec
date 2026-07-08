"use strict";
/* Sprint-1 Wave 1: scaleOnScroll, counterUp, marquee — gates from the S1 relay */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { validateSpec } = require("../src/compiler/validate.js");
const { compileSpec } = require("../src/compiler/compile.js");
const { loadCatalog } = require("../src/compiler/catalog.js");

const catalog = loadCatalog();
const showcase = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "showcase.motionspec.json"), "utf8"));
const GOLDEN_DIR = path.join(__dirname, "golden");

const base = (m) => ({
  specVersion: "1.0",
  meta: { project: "t", target: "vanilla-gsap" },
  globals: { respectReducedMotion: true },
  motions: [m],
});

test("catalog contains the 3 new primitives", () => {
  for (const n of ["scaleOnScroll", "counterUp", "marquee"]) assert.ok(catalog[n], n);
});

test("showcase compiles (golden files)", () => {
  const res = compileSpec(showcase, catalog, { specName: "showcase" });
  assert.equal(res.ok, true);
  const gj = path.join(GOLDEN_DIR, "showcase.motion.js");
  const gc = path.join(GOLDEN_DIR, "showcase.motion.css");
  const nv = (s) => s.replace(/MotionSpec-Compiler v[0-9]+\.[0-9]+\.[0-9]+/g, "MotionSpec-Compiler vX");
  if (process.env.UPDATE_GOLDEN) { fs.writeFileSync(gj, nv(res.js)); fs.writeFileSync(gc, nv(res.css)); }
  assert.equal(nv(res.js), nv(fs.readFileSync(gj, "utf8")));
  assert.equal(nv(res.css), nv(fs.readFileSync(gc, "utf8")));
});

/* ---- Adversary findings, now permanent gates ---- */

test("counterUp: locale 'constructor' is rejected (pattern gate)", () => {
  const v = validateSpec(base({ id: "c", primitive: "counterUp", target: ".n", params: { locale: "constructor" } }), catalog);
  assert.equal(v.ok, false);
});

test("counterUp: isFinite guard is in the template", () => {
  assert.ok(catalog.counterUp.template.includes("isFinite"));
});

test("marquee: direction only normal|reverse", () => {
  const v = validateSpec(base({ id: "m", primitive: "marquee", target: ".t", params: { direction: "alternate; animation-play-state: paused" } }), catalog);
  assert.equal(v.ok, false);
  const v2 = validateSpec(base({ id: "m", primitive: "marquee", target: ".t", params: { direction: "reverse" } }), catalog);
  assert.equal(v2.ok, true);
});

test("marquee: gap must be a CSS length (auto rejected)", () => {
  const v = validateSpec(base({ id: "m", primitive: "marquee", target: ".t", params: { gap: "auto" } }), catalog);
  assert.equal(v.ok, false);
});

test("scaleOnScroll: transformOrigin pattern keeps CSS junk out", () => {
  const v = validateSpec(base({ id: "s", primitive: "scaleOnScroll", target: ".x", params: { transformOrigin: "top); alert(1); (" } }), catalog);
  assert.equal(v.ok, false);
});

test("demo generator builds all 40 primitives", () => {
  const { buildDemo } = require("../src/demo/build-demo.js");
  const os = require("os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "demo-"));
  const r = buildDemo(tmp);
  assert.equal(r.primitives, 40);
  assert.equal(r.motions, 40);
  const html = fs.readFileSync(r.file, "utf8");
  assert.ok(!html.includes("NO DEMO BLOCK"));
});

/* ---- Audit findings 2026-06-12, permanent gates ---- */

test("Audit #3: responsive is honestly rejected (instead of silently ignored)", () => {
  const m = { id: "r", primitive: "scrollReveal", target: ".x", params: { from: { opacity: 0 } }, responsive: { mobile: { params: { duration: 0.3 } } } };
  const v = validateSpec(base(m), catalog);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes("responsive")));
});

test("Audit #2: poisoned cache entry does not reach the caller", async () => {
  const cache = require("../src/router/cache.js");
  const oG = cache.get, oS = cache.set;
  const store = {};
  cache.get = (k) => store[k] || null;
  cache.set = (k, s) => { store[k] = s; };
  try {
    const { route } = require("../src/router/route.js");
    const { catalogVersion } = require("../src/compiler/catalog.js");
    const req = "poison test " + Date.now();
    const k = cache.key(req, catalogVersion(catalog), "vanilla-gsap");
    store[k] = { specVersion: "1.0", meta: { target: "vanilla-gsap" }, motions: [{ id: "x", primitive: "magicSparkle", target: "');alert(1);('" }] };
    const r = await route(req, { client: { name: "never", complete: async () => JSON.stringify({ escalate: true, reason: "n/a" }) }, catalog });
    assert.notEqual(r.source, "cache", "poisoned cache was passed through");
  } finally { cache.get = oG; cache.set = oS; }
});
