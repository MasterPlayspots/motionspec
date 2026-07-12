"use strict";
/* Regression tests for the 2026-07-12 checker fixes (cubic-bezier + reduced-motion reset). */
const { test } = require("node:test");
const assert = require("node:assert");
const { analyze } = require("../src/audit/audit.js");
const findings = (css) => analyze({ url: "https://fixture/x", html: "<style>" + css + "</style>", styles: [] }).findings;
const asText = (arr) => arr.map((f) => f.rule + " " + (f.selector || "")).join(" || ");

test("FIX-3: cubic-bezier easing is not mis-parsed into fake animated properties", () => {
  const f = findings(".x{transition: transform .15s cubic-bezier(0.22,0.61,0.36,1)}");
  assert.ok(!/non-transform|0\.61|0\.36|1\)/.test(asText(f)), "cubic-bezier produced bogus numeric props: " + asText(f));
});
test("FIX-4: reduced-motion resets are not flagged as motion", () => {
  assert.strictEqual(findings(".x{animation:none}").length, 0, "animation:none flagged");
  assert.strictEqual(findings(".x{animation:none !important}").length, 0, "animation:none !important flagged");
  assert.strictEqual(findings(".x{transition:none}").length, 0, "transition:none flagged");
});
test("regression: a real unguarded infinite animation is still flagged", () => {
  const f = findings(".y{animation:spin 2s linear infinite} @keyframes spin{to{transform:rotate(1turn)}}");
  assert.ok(f.length >= 1, "real unguarded motion not flagged");
});
