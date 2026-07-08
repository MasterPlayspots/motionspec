"use strict";
/* ADR-0001 — Schema Freeze v1 (signed 2026-06-15 by Kevin Fröba).
 * D1: v1 carries "1.0".  D4: "0.1" stays accepted for one minor cycle
 * (deprecated) and the compile report must carry a machine-readable note.
 * These tests are the executable contract for the freeze. */
const { test } = require("node:test");
const assert = require("node:assert");
const { validateSpec, deprecationsFor, SPEC_VERSIONS, DEPRECATED_VERSIONS } = require("../src/compiler/validate.js");
const { compileSpec } = require("../src/compiler/compile.js");
const { loadCatalog } = require("../src/compiler/catalog.js");

const catalog = loadCatalog();
const spec = (ver) => ({
  specVersion: ver,
  meta: { project: "t", target: "vanilla-gsap" },
  globals: { respectReducedMotion: true },
  motions: [{ id: "m", primitive: "scrollReveal", target: ".h", params: { from: { opacity: 0 } } }],
});

test("D1: specVersion \"1.0\" validates", () => {
  const v = validateSpec(spec("1.0"), catalog);
  assert.equal(v.ok, true, v.errors && v.errors.join("; "));
});

test("D1: specVersion \"1.0\" compiles, report carries no deprecation", () => {
  const r = compileSpec(spec("1.0"), catalog, { specName: "v1" });
  assert.equal(r.ok, true);
  assert.equal(r.report.specVersion, "1.0");
  assert.deepEqual(r.report.deprecations, []);
});

/* D4 (removed at v1.2): "0.1" was accepted for one deprecated minor cycle and is
 * now REJECTED like any other unknown version. These flip the old compat tests. */
test("D4 removed: \"0.1\" is now REJECTED (validate + compile fail-closed)", () => {
  const v = validateSpec(spec("0.1"), catalog);
  assert.equal(v.ok, false, '"0.1" must no longer validate at v1.2');
  assert.ok(v.errorCodes.includes("MS-SPEC-VER"), "rejection is MS-SPEC-VER");
  const r = compileSpec(spec("0.1"), catalog, { specName: "legacy" });
  assert.equal(r.ok, false, '"0.1" must no longer compile');
  assert.equal(r.report, undefined, "no report on a rejected spec");
});

test("D4 removed: no deprecation machinery fires for any accepted version", () => {
  const v = validateSpec(spec("1.0"), catalog);
  assert.equal(v.ok, true);
  assert.deepEqual(v.deprecations, [], "1.0 carries no deprecation");
});

test("unknown version still rejected (freeze did not open the gate)", () => {
  const v = validateSpec(spec("2.0"), catalog);
  assert.equal(v.ok, false);
  assert.ok(v.errorCodes.includes("MS-SPEC-VER"));
});

/* Re-audit 2026-06-15 (independent specialist team) — gap-closing tests,
 * updated at v1.2 for the "0.1" removal (ADR-0001 D4). */

test("D4 removed: the rejection is path-independent — a CSS-only 0.1 spec also fails", () => {
  const cssSpec = {
    specVersion: "0.1",
    meta: { project: "t", target: "vanilla-gsap" },
    globals: { respectReducedMotion: true },
    motions: [{ id: "fade", primitive: "cssTransition", target: ".x", params: { property: "opacity" } }],
  };
  const v = validateSpec(cssSpec, catalog);
  assert.equal(v.ok, false);
  assert.ok(v.errorCodes.includes("MS-SPEC-VER"));
  const r = compileSpec(cssSpec, catalog, { specName: "css-legacy" });
  assert.equal(r.ok, false, "CSS-only 0.1 spec must also be rejected");
  assert.equal(r.report, undefined);
});

test("hard validation error still fires alongside the version rejection (0.1 + responsive)", () => {
  const bad = spec("0.1");
  bad.motions[0].responsive = { mobile: { params: { duration: 0.3 } } };
  const v = validateSpec(bad, catalog);
  assert.equal(v.ok, false);
  assert.ok(v.errorCodes.includes("MS-SPEC-VER"), "0.1 is rejected");
  assert.ok(v.errorCodes.includes("MS-RESP-UNSUPPORTED"), "responsive still rejected too");
  const r = compileSpec(bad, catalog, { specName: "bad" });
  assert.equal(r.ok, false);
  assert.equal(r.report, undefined, "no report on a rejected spec");
});

test("deprecation machinery is intact but empty: 1.0 carries no deprecation", () => {
  const v10 = validateSpec(spec("1.0"), catalog);
  assert.equal(v10.ok, true);
  assert.deepEqual(v10.deprecations, []);
  assert.deepEqual(deprecationsFor("1.0"), []);
  assert.deepEqual(deprecationsFor("0.1"), [], "0.1 is no longer a deprecated version, it is unknown");
});

/* ADR-0001 D4 tripwire: satisfied at v1.2. "0.1" has been removed from
 * SPEC_VERSIONS/DEPRECATED_VERSIONS and the D4 tests above assert rejection.
 * Guard the removal so it cannot silently regress. */
test("v1.2: SPEC_VERSIONS no longer accepts 0.1 (removal complete)", () => {
  assert.equal(SPEC_VERSIONS.includes("0.1"), false, '"0.1" must be removed from SPEC_VERSIONS at v1.2');
  assert.deepEqual(DEPRECATED_VERSIONS, [], "no deprecated versions remain");
});
