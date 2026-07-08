"use strict";
/* Production-readiness audit fix (2026-06-15): the CSS value context could emit
 * url(javascript:…) / expression(…). Now rejected fail-closed at BOTH the
 * validator (so motion_validate ok=true predicts compile success — closes the
 * validate↔compile asymmetry) and cssRaw (defense in depth). */
const { test } = require("node:test");
const assert = require("node:assert");
const { validateSpec } = require("../src/compiler/validate.js");
const { compileSpec } = require("../src/compiler/compile.js");
const { loadCatalog } = require("../src/compiler/catalog.js");

const catalog = loadCatalog();
const spec = (params) => ({
  specVersion: "1.0",
  meta: { project: "t", target: "vanilla-gsap" },
  globals: { respectReducedMotion: true },
  motions: [{ id: "m", primitive: "cssTransition", target: ".box", params }],
});

const PAYLOADS = [
  { property: "background", hoverValue: "url(javascript:alert(document.cookie))" },
  { hoverValue: "expression(alert(1))" },
  { property: "background", hoverValue: "url(data:text/html,<script>x</script>)" },
];

for (const p of PAYLOADS) {
  test("validator rejects dangerous CSS token: " + JSON.stringify(p), () => {
    const v = validateSpec(spec(p), catalog);
    assert.equal(v.ok, false);
    assert.ok(v.errorCodes.includes("MS-PARAM-UNSAFE"), "expected MS-PARAM-UNSAFE, got " + v.errorCodes.join(","));
  });
  test("compiler fail-closed (no output) for: " + JSON.stringify(p), () => {
    const r = compileSpec(spec(p), catalog, {});
    assert.equal(r.ok, false);
    assert.equal(r.js, undefined);
    assert.equal(r.css, undefined);
  });
}

test("validate ok ⇒ compile ok agreement holds for these payloads (no asymmetry)", () => {
  for (const p of PAYLOADS) {
    const v = validateSpec(spec(p), catalog).ok;
    const c = compileSpec(spec(p), catalog, {}).ok;
    assert.equal(v, c, "validate and compile must agree on " + JSON.stringify(p));
  }
});

test("no regression: legit transform/hover values still validate + compile", () => {
  const ok = spec({ hoverValue: "translateY(-4px) scale(1.04)", duration: 0.25 });
  assert.equal(validateSpec(ok, catalog).ok, true);
  assert.equal(compileSpec(ok, catalog, {}).ok, true);
});
