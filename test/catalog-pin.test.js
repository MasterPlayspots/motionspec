"use strict";
/* Phase B item 4 — optional catalogVersion pin (ADR-0001 D2).
 * Makes specs reproducible across catalog changes: a pinned spec fails-closed
 * if the loaded catalog no longer matches the hash it was authored against. */
const { test } = require("node:test");
const assert = require("node:assert");
const { validateSpec } = require("../src/compiler/validate.js");
const { compileSpec } = require("../src/compiler/compile.js");
const { loadCatalog, catalogVersion } = require("../src/compiler/catalog.js");

const catalog = loadCatalog();
const VER = catalogVersion(catalog);
const spec = (over) => Object.assign({
  specVersion: "1.0",
  meta: { project: "t", target: "vanilla-gsap" },
  globals: { respectReducedMotion: true },
  motions: [{ id: "m", primitive: "scrollReveal", target: ".h", params: { from: { opacity: 0 } } }],
}, over);

test("no pin = valid (field is optional)", () => {
  assert.equal(validateSpec(spec({}), catalog).ok, true);
});

test("correct pin validates and compiles", () => {
  const s = spec({ catalogVersion: VER });
  assert.equal(validateSpec(s, catalog).ok, true);
  assert.equal(compileSpec(s, catalog, {}).ok, true);
});

test("wrong pin is rejected fail-closed (MS-CATALOG-PIN-MISMATCH)", () => {
  const v = validateSpec(spec({ catalogVersion: "0000000000000000" }), catalog);
  assert.equal(v.ok, false);
  assert.ok(v.errorCodes.includes("MS-CATALOG-PIN-MISMATCH"));
  // fail-closed: a mismatched spec must not compile
  assert.equal(compileSpec(spec({ catalogVersion: "0000000000000000" }), catalog, {}).ok, false);
});

test("malformed pin is rejected (MS-CATALOG-PIN)", () => {
  const v = validateSpec(spec({ catalogVersion: "NOT-A-HASH" }), catalog);
  assert.equal(v.ok, false);
  assert.ok(v.errorCodes.includes("MS-CATALOG-PIN"));
});

test("the pin a spec would use round-trips (16-char hex)", () => {
  assert.match(VER, /^[0-9a-f]{16}$/);
});
