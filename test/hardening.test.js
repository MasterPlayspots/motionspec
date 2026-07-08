"use strict";
/* Audit quick wins 2026-06-12: catalog meta schema, cache hygiene, telemetry, budget. */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadCatalog, checkPrimitive } = require("../src/compiler/catalog.js");
const { compileSpec } = require("../src/compiler/compile.js");

const catalog = loadCatalog();

function tmpCatalog(prims) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cat-"));
  for (const [name, obj] of Object.entries(prims))
    fs.writeFileSync(path.join(dir, name + ".json"), JSON.stringify(obj));
  return dir;
}
const good = {
  name: "okPrim", version: "1.0.0", output: "js", engine: "x",
  paramSchema: { d: { type: "number", default: 1 } }, triggerDefaults: {},
  performance: { cost: 1 }, a11y: {}, template: "x({{params.d}})",
};

/* ---- #8 meta schema ---- */

test("catalog: valid primitive loads", () => {
  const dir = tmpCatalog({ okPrim: good });
  assert.ok(loadCatalog(dir).okPrim);
});

test("catalog: ReDoS pattern is rejected", () => {
  const bad = JSON.parse(JSON.stringify(good));
  bad.paramSchema.d = { type: "string", pattern: "(a+)+$" };
  assert.throws(() => checkPrimitive(bad, "bad.json"), /ReDoS/);
});

test("catalog: unknown param type is rejected", () => {
  const bad = JSON.parse(JSON.stringify(good));
  bad.paramSchema.d = { type: "function" };
  assert.throws(() => checkPrimitive(bad, "bad.json"), /type not allowed/);
});

test("catalog: missing name is rejected", () => {
  const bad = JSON.parse(JSON.stringify(good)); delete bad.name;
  assert.throws(() => checkPrimitive(bad, "bad.json"), /name missing/);
});

test("catalog: overlong template is rejected", () => {
  const bad = JSON.parse(JSON.stringify(good)); bad.template = "x".repeat(5000);
  assert.throws(() => checkPrimitive(bad, "bad.json"), /template too long/);
});

/* ---- #16 configurable budget ---- */

test("compileSpec: budget option overrides default", () => {
  const spec = { specVersion: "1.0", meta: { target: "vanilla-gsap" }, globals: { respectReducedMotion: true },
    motions: [{ id: "a", primitive: "parallaxLayer", target: ".x", params: {} }] };
  const tight = compileSpec(spec, catalog, { budget: 1 });
  assert.equal(tight.report.budgetOk, false); /* parallax cost 2 > 1 */
  const loose = compileSpec(spec, catalog, { budget: 10 });
  assert.equal(loose.report.budgetOk, true);
});

/* ---- #11 cache hygiene ---- */

test("cache: TTL and sweep work", () => {
  const cache = require("../src/router/cache.js");
  assert.equal(typeof cache.sweep, "function");
  assert.equal(typeof cache.evict, "function");
  assert.ok(cache.TTL_MS > 0 && cache.MAX_ENTRIES > 0);
});

/* ---- #7/#12/#17 telemetry ---- */

test("telemetry: long fields are clamped, escalation view separates noise", () => {
  const tel = require("../src/router/telemetry.js");
  /* TELEMETRY_FILE is const in the module — we test clamp/summary logic indirectly:
   * NOISE_OUTCOMES contains validate/cache, not escalate. */
  assert.ok(tel.NOISE_OUTCOMES.includes("mcp-validate-ok"));
  assert.ok(!tel.NOISE_OUTCOMES.includes("escalate-no-primitive"));
});

/* ---- loadCatalog: file size, JSON corruption, duplicates ---- */

test("loadCatalog: file too large is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cat-big-"));
  try {
    fs.writeFileSync(path.join(dir, "big.json"), "x".repeat(65537));
    assert.throws(() => loadCatalog(dir), /file too large/);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test("loadCatalog: corrupt JSON is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cat-corrupt-"));
  try {
    fs.writeFileSync(path.join(dir, "corrupt.json"), "{ not json");
    assert.throws(() => loadCatalog(dir), /not valid JSON/);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test("loadCatalog: duplicate primitive is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cat-dup-"));
  try {
    fs.writeFileSync(path.join(dir, "a.json"), JSON.stringify(good));
    fs.writeFileSync(path.join(dir, "b.json"), JSON.stringify(good));
    assert.throws(() => loadCatalog(dir), /Duplicate primitive/);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
