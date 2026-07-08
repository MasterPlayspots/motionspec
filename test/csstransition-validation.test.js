"use strict";
/*
 * csstransition-validation.test.js — truth-in-claim: "injection-proof &
 * catalog-validated" must also be CORRECTNESS-true.
 * ----------------------------------------------------------------------
 * Previously the trust boundary accepted pattern-less string params: property
 * "all" or hoverValue "red #fff 100px solid" passed validation and
 * compiled to *syntactically valid nonsense*. Charset/unsafe-token gates
 * catch injection, but not semantic nonsense input.
 *
 * This test locks the behavior down: every newly patterned string param
 * (cssTransition.property/hoverValue/easing, pinnedSection.distance,
 * scroll/staggerReveal.ease) rejects nonsense with a clear [MS-PARAM-PATTERN]
 * and keeps letting legitimate values through — fail-closed, without partial output.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const { validateSpec } = require("../src/compiler/validate.js");
const { compileSpec } = require("../src/compiler/compile.js");
const { loadCatalog } = require("../src/compiler/catalog.js");

const catalog = loadCatalog();

/* Builds a single-motion spec for a primitive with the given params. */
function spec(primitive, target, params) {
  return {
    specVersion: "1.0",
    meta: { project: "t", target: "vanilla-gsap" },
    globals: { respectReducedMotion: true },
    motions: [{ id: "m", primitive, target, params }],
  };
}

/* Helpers: ok / rejected-with-code. A rejection MUST be fail-closed
 * (compile yields no output), so a green validator never overtakes the
 * compiler (validate↔compile symmetry). */
function expectReject(s, code, label) {
  const v = validateSpec(s, catalog);
  assert.equal(v.ok, false, label + ": should have been rejected");
  assert.ok(v.errorCodes.includes(code), label + ": expected " + code + ", got " + v.errorCodes.join(","));
  const r = compileSpec(s, catalog, {});
  assert.equal(r.ok, false, label + ": compile should have been fail-closed");
  assert.equal(r.js, undefined, label + ": no JS on rejection");
  assert.equal(r.css, undefined, label + ": no CSS on rejection");
}
function expectOk(s, label) {
  const v = validateSpec(s, catalog);
  assert.equal(v.ok, true, label + ": legitimate value must pass — " + v.errors.join("; "));
  assert.equal(compileSpec(s, catalog, {}).ok, true, label + ": legitimate value must compile");
}

/* ---- cssTransition.property: allow-list of sensible CSS props ------------ */
test("cssTransition.property: bare 'all' and junk are rejected with MS-PARAM-PATTERN", () => {
  for (const bad of ["all", "background", "; display:none", "transform; color", "POSITION", "transformm"]) {
    expectReject(spec("cssTransition", ".box", { property: bad }), "MS-PARAM-PATTERN", "property=" + JSON.stringify(bad));
  }
});
test("cssTransition.property: allowed props pass", () => {
  for (const good of ["transform", "opacity", "color", "background-color", "border-color", "filter", "width", "height"]) {
    expectOk(spec("cssTransition", ".box", { property: good }), "property=" + good);
  }
});

/* ---- cssTransition.hoverValue: structured CSS value ---------------------- */
test("cssTransition.hoverValue: multi-token nonsense ('red #fff 100px solid') is rejected", () => {
  for (const bad of ["red #fff 100px solid", "a b c d", "1px 2px 3px 4px 5px"]) {
    expectReject(spec("cssTransition", ".box", { hoverValue: bad }), "MS-PARAM-PATTERN", "hoverValue=" + JSON.stringify(bad));
  }
});
test("cssTransition.hoverValue: legitimate 1- to 3-token values pass", () => {
  for (const good of ["translateY(-4px)", "translateY(-4px) scale(1.04)", "translateY(-4px) scale(1.1) rotate(2deg)", "#fff", "0.5", "rgba(0,0,0,.2)", "scale(1.05)"]) {
    expectOk(spec("cssTransition", ".box", { hoverValue: good }), "hoverValue=" + good);
  }
});

/* ---- cssTransition.easing: CSS timing function without GSAP names -------- */
test("cssTransition.easing: GSAP/junk easings are rejected (no 'power3.out' in CSS context)", () => {
  for (const bad of ["power3.out", "jumpAround", "ease-out-in", "linearr"]) {
    expectReject(spec("cssTransition", ".box", { easing: bad }), "MS-PARAM-PATTERN", "easing=" + JSON.stringify(bad));
  }
});
test("cssTransition.easing: valid CSS easings pass", () => {
  for (const good of ["ease", "ease-in", "ease-out", "ease-in-out", "linear", "step-start", "step-end", "cubic-bezier(0.4, 0, 0.2, 1)"]) {
    expectOk(spec("cssTransition", ".box", { easing: good }), "easing=" + good);
  }
});

/* ---- pinnedSection.distance: relative ScrollTrigger distance ------------- */
test("pinnedSection.distance: free-form strings ('bottom top', 'all') are rejected", () => {
  const base = { distance: "+=100%", pinSpacing: true };
  for (const bad of ["bottom top", "all", "100%", "+=abc", "+=100%; evil"]) {
    expectReject(spec("pinnedSection", ".sec", Object.assign({}, base, { distance: bad })), "MS-PARAM-PATTERN", "distance=" + JSON.stringify(bad));
  }
});
test("pinnedSection.distance: relative distances pass", () => {
  for (const good of ["+=100%", "+=120%", "+=500", "+=300px", "+=80vh"]) {
    expectOk(spec("pinnedSection", ".sec", { distance: good, pinSpacing: true }), "distance=" + good);
  }
});

/* ---- scroll-/staggerReveal.ease: GSAP ease name -------------------------- */
test("scrollReveal/staggerReveal.ease: junk with spaces/semicolons is rejected", () => {
  const from = { from: { opacity: 0, y: 24 } };
  for (const prim of ["scrollReveal", "staggerReveal"]) {
    for (const bad of ["evil name", "power3.out; x", "po wer", "a".repeat(41)]) {
      expectReject(spec(prim, ".x", Object.assign({}, from, { ease: bad })), "MS-PARAM-PATTERN", prim + ".ease=" + JSON.stringify(bad));
    }
  }
});
test("scrollReveal/staggerReveal.ease: valid GSAP eases pass", () => {
  const from = { from: { opacity: 0, y: 24 } };
  for (const prim of ["scrollReveal", "staggerReveal"]) {
    for (const good of ["power3.out", "power2.out", "power1.out", "back.out(1.7)", "none"]) {
      expectOk(spec(prim, ".x", Object.assign({}, from, { ease: good })), prim + ".ease=" + good);
    }
  }
});

/* ---- Regression lock: injection gate stays BEFORE the pattern gate ------- */
test("injection still fires as MS-PARAM-UNSAFE/CHARSET (not only as PATTERN)", () => {
  // unsafe token (url(javascript:)) -> MS-PARAM-UNSAFE, not PATTERN
  const unsafe = validateSpec(spec("cssTransition", ".box", { property: "color", hoverValue: "url(javascript:alert(1))" }), catalog);
  assert.ok(unsafe.errorCodes.includes("MS-PARAM-UNSAFE"), "expected MS-PARAM-UNSAFE, got " + unsafe.errorCodes.join(","));
  // backtick -> charset gate
  const charset = validateSpec(spec("cssTransition", ".box", { hoverValue: "`+x+`" }), catalog);
  assert.ok(charset.errorCodes.includes("MS-PARAM-CHARSET"), "expected MS-PARAM-CHARSET, got " + charset.errorCodes.join(","));
});
