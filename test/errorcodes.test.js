"use strict";
/* S2-04 (Audit #15): stable, language-neutral error codes.
 * These tests match exclusively on codes — never on German
 * plaintext. This lets integrators rely on codes, no matter
 * which language the plaintext message is phrased in later. */
const { test } = require("node:test");
const assert = require("node:assert");
const { validateSpec, MAX_SPEC_BYTES } = require("../src/compiler/validate.js");
const registerTools = require("../src/mcp/register-tools.js");
const { loadCatalog } = require("../src/compiler/catalog.js");

const catalog = loadCatalog();
const base = (m) => ({
  specVersion: "1.0",
  meta: { project: "t", target: "vanilla-gsap" },
  globals: { respectReducedMotion: true },
  motions: [m],
});
const ok = () => ({ id: "m", primitive: "scrollReveal", target: ".h", params: { from: { opacity: 0 } } });

function codes(spec) {
  const v = validateSpec(spec, catalog);
  return v.errorCodes || [];
}

test("validateSpec returns errorCodes[] parallel to errors[]", () => {
  const v = validateSpec(base({ id: "m", primitive: "magicSparkle", target: ".h" }), catalog);
  assert.equal(v.ok, false);
  assert.ok(Array.isArray(v.errorCodes));
  assert.equal(v.errors.length, v.errorCodes.length);
  assert.ok(v.errors[0].startsWith("[MS-"), "plaintext carries the code prefix");
});

test("MS-PRIM-UNKNOWN: made-up primitive", () => {
  assert.ok(codes(base({ id: "m", primitive: "nope", target: ".h" })).includes("MS-PRIM-UNKNOWN"));
});

test("MS-PARAM-MAX / MS-PARAM-MIN: bounds", () => {
  const hi = ok(); hi.params.duration = 99;
  assert.ok(codes(base(hi)).includes("MS-PARAM-MAX"));
  const lo = ok(); lo.params.duration = 0.01;
  assert.ok(codes(base(lo)).includes("MS-PARAM-MIN"));
});

test("MS-TARGET-UNSAFE: injection selector", () => {
  const m = ok(); m.target = "');alert(1);('";
  assert.ok(codes(base(m)).includes("MS-TARGET-UNSAFE"));
});

test("MS-ID-FORMAT + MS-ID-DUP", () => {
  const bad = ok(); bad.id = "x y!";
  assert.ok(codes(base(bad)).includes("MS-ID-FORMAT"));
  const dup = validateSpec({ ...base(ok()), motions: [ok(), ok()] }, catalog);
  assert.ok(dup.errorCodes.includes("MS-ID-DUP"));
});

test("MS-RESP-UNSUPPORTED: responsive is rejected (deferred to 0.2)", () => {
  const m = ok(); m.responsive = { mobile: { params: { duration: 0.3 } } };
  assert.ok(codes(base(m)).includes("MS-RESP-UNSUPPORTED"));
});

test("MS-PARAM-PATTERN: charset-conforming but malicious value", () => {
  const m = { id: "c", primitive: "counterUp", target: ".n", params: { locale: "constructor" } };
  assert.ok(codes(base(m)).includes("MS-PARAM-PATTERN"));
});

test("MS-SPEC-VER: wrong specVersion", () => {
  const s = base(ok()); s.specVersion = "9.9";
  assert.ok(codes(s).includes("MS-SPEC-VER"));
});

test("valid spec: no codes", () => {
  assert.deepEqual(codes(base(ok())), []);
});

/* TASK-015 (Finding #12): MS-INPUT-TOO-LARGE belongs in the public registry.
 * validate.js is the single source of the 64 KB cap; the MCP layer imports it.
 * Lock the value AND the single-source wiring so the two can never diverge. */
test("MAX_SPEC_BYTES: public registry constant is 65536 and shared with the MCP layer", () => {
  assert.equal(MAX_SPEC_BYTES, 65536);
  assert.equal(registerTools.MAX_SPEC_BYTES, 65536);
  assert.equal(registerTools.MAX_SPEC_BYTES, MAX_SPEC_BYTES);
});
