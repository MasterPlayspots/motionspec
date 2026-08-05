"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { validateSpec, safeSelector } = require("../src/compiler/validate.js");
const { loadCatalog } = require("../src/compiler/catalog.js");

const catalog = loadCatalog();

function baseSpec(motions) {
  return {
    specVersion: "1.0",
    meta: { project: "t", target: "vanilla-gsap" },
    globals: { respectReducedMotion: true },
    motions,
  };
}
const okMotion = () => ({
  id: "m1",
  primitive: "scrollReveal",
  target: ".hero h1",
  params: { from: { opacity: 0, y: 48 } },
});

test("valid spec passes", () => {
  assert.equal(validateSpec(baseSpec([okMotion()]), catalog).ok, true);
});

/* TASK-017 (Finding #27): globals.defaultEase is allowlisted (even though the
 * compiler does not currently evaluate it) — a spec using it must stay valid. */
test("globals.defaultEase is accepted (allowlisted)", () => {
  const spec = baseSpec([okMotion()]);
  spec.globals = { respectReducedMotion: true, defaultEase: "power3.out" };
  assert.equal(validateSpec(spec, catalog).ok, true);
});

test("made-up primitive is rejected (allow-list)", () => {
  const m = okMotion(); m.primitive = "magicSparkle";
  const v = validateSpec(baseSpec([m]), catalog);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes("magicSparkle")));
});

test("parameter outside min/max is rejected", () => {
  const m = okMotion(); m.params.duration = 99;
  assert.equal(validateSpec(baseSpec([m]), catalog).ok, false);
});

test("unknown parameter is rejected", () => {
  const m = okMotion(); m.params.explode = true;
  assert.equal(validateSpec(baseSpec([m]), catalog).ok, false);
});

/* ---------- Injection hardening (v0.2) ---------- */

test("JS string injection in selector is rejected", () => {
  const m = okMotion();
  m.target = "');alert(document.cookie);('";
  assert.equal(validateSpec(baseSpec([m]), catalog).ok, false);
});

test("CSS block injection in selector is rejected", () => {
  const m = okMotion();
  m.target = "x} body{display:none";
  assert.equal(validateSpec(baseSpec([m]), catalog).ok, false);
});

test("comment injection in id is rejected", () => {
  const m = okMotion();
  m.id = "x */ alert(1) /*";
  assert.equal(validateSpec(baseSpec([m]), catalog).ok, false);
});

test("backtick/backslash in string param is rejected", () => {
  const m = { id: "m1", primitive: "cssTransition", target: ".btn", params: { hoverValue: "`+alert(1)+`" } };
  assert.equal(validateSpec(baseSpec([m]), catalog).ok, false);
});

test("legitimate complex selectors pass", () => {
  for (const s of ['.hero h1', '#cta', '.features > .card:nth-child(2)', '[data-x="y"]', 'section.intro .col, section.intro .img']) {
    assert.equal(safeSelector(s), true, s);
  }
});

test("duplicate ids are rejected", () => {
  const v = validateSpec(baseSpec([okMotion(), okMotion()]), catalog);
  assert.equal(v.ok, false);
});

test("trigger with dangerous string is rejected", () => {
  const m = okMotion();
  m.trigger = { start: "top'); alert(1); ('" };
  assert.equal(validateSpec(baseSpec([m]), catalog).ok, false);
});

/* ---------- TASK-004: respectReducedMotion default-on + warning ---------- */

test("globals.respectReducedMotion:false -> ok===true and warning MS-GLOBALS-RRM-OFF", () => {
  const spec = {
    specVersion: "1.0",
    meta: { project: "t", target: "vanilla-gsap" },
    globals: { respectReducedMotion: false },
    motions: [okMotion()],
  };
  const r = validateSpec(spec, catalog);
  assert.equal(r.ok, true, "spec with respectReducedMotion:false should be ok");
  assert.ok(Array.isArray(r.warnings), "warnings must be an array");
  assert.ok(
    r.warnings.some((w) => w.code === "MS-GLOBALS-RRM-OFF"),
    "warnings must contain MS-GLOBALS-RRM-OFF"
  );
});

test("no globals -> r.warnings contains no MS-GLOBALS-RRM-OFF", () => {
  const spec = {
    specVersion: "1.0",
    meta: { project: "t", target: "vanilla-gsap" },
    motions: [okMotion()],
  };
  const r = validateSpec(spec, catalog);
  assert.ok(Array.isArray(r.warnings), "warnings must be an array");
  assert.ok(
    !r.warnings.some((w) => w.code === "MS-GLOBALS-RRM-OFF"),
    "warnings must not contain MS-GLOBALS-RRM-OFF when globals is missing"
  );
});

/* ---- 2026-08-04: `ease` is a vocabulary, not a charset ---------------------
 * The catalog pattern ^[A-Za-z0-9.()]{1,40}$ was INVERTED in practice: it let
 * every invented value through and rejected real GSAP eases that contain a
 * comma. An invented value reached the emitted file verbatim and GSAP silently
 * fell back to its default. A vocabulary regex does not fit the 100-char
 * catalog screen, so the gate lives in the validator. */
const easeMotion = (ease) => ({
  id: "m1",
  primitive: "scrollReveal",
  target: ".hero h1",
  params: { from: { opacity: 0, y: 48 }, ease },
});
const easeOk = (e) => validateSpec(baseSpec([easeMotion(e)]), catalog).ok;

test("ease: real GSAP eases are accepted", () => {
  for (const e of ["none", "linear", "power0.in", "power1.in", "power2.out", "power3.out",
                   "power4.inOut", "back.out(1.7)", "back.in(2)", "elastic.out(1)",
                   "bounce.inOut", "sine.in", "circ.out", "expo.inOut",
                   "quad.out", "cubic.in", "quart.out", "quint.inOut",
                   "strong.out", "steps(5)", "steps(100)"]) {
    assert.equal(easeOk(e), true, "must accept the real ease " + JSON.stringify(e));
  }
});

/* Known, deliberate residue: a multi-argument config is a valid GSAP ease but
 * the primitive's charset pattern forbids the comma. Widening that pattern
 * changes the catalog and needs a MAJOR bump per primitive, so it is out of
 * scope here — the error must at least name the real cause instead of
 * claiming the ease is unknown. */
test("ease: a multi-argument config is refused with the honest reason", () => {
  for (const e of ["elastic.out(1,0.3)", "elastic.out(1, 0.3)"]) {
    const r = validateSpec(baseSpec([easeMotion(e)]), catalog);
    assert.equal(r.ok, false, e + " is still blocked by the catalog charset pattern");
    assert.ok(
      r.errors.some((m) => m.includes("MS-PARAM-EASE-UNSUPPORTED")),
      "must be reported as UNSUPPORTED, not as an unknown ease: " + JSON.stringify(r.errors)
    );
  }
});

test("ease: invented values are rejected (MS-PARAM-EASE)", () => {
  for (const e of ["quantumBounce9000", "powr3.out", "banana.out", "x", "ZZZ", "1",
                   "power9.out", "back.sideways", "steps(1234)"]) {
    const r = validateSpec(baseSpec([easeMotion(e)]), catalog);
    assert.equal(r.ok, false, "must reject " + JSON.stringify(e));
    assert.ok(
      r.errors.some((m) => m.includes("MS-PARAM-EASE") || m.includes("MS-PARAM-PATTERN")),
      "rejection of " + JSON.stringify(e) + " must name the ease rule"
    );
  }
});

test("ease: exactly one error per invented value (no double report)", () => {
  const r = validateSpec(baseSpec([easeMotion("banana.out")]), catalog);
  assert.equal(r.errors.length, 1, "charset screen and vocabulary gate must not both fire");
  assert.ok(r.errors[0].includes("MS-PARAM-EASE"));
});

/* ---- 2026-08-04: respectReducedMotion is type-checked ---------------------
 * Any truthy non-boolean used to pass as ok:true AND slip past the `=== false`
 * comparison, so not even the warning was raised. */
test("globals.respectReducedMotion must be a boolean (MS-GLOBALS-RRM-TYPE)", () => {
  for (const v of ["nein danke", "false", 0, 1, [], {}]) {
    const spec = {
      specVersion: "1.0",
      meta: { project: "t", target: "vanilla-gsap" },
      globals: { respectReducedMotion: v },
      motions: [okMotion()],
    };
    const r = validateSpec(spec, catalog);
    assert.equal(r.ok, false, "must reject respectReducedMotion=" + JSON.stringify(v));
    assert.ok(r.errors.some((m) => m.includes("MS-GLOBALS-RRM-TYPE")));
  }
  assert.equal(validateSpec(baseSpec([okMotion()]), catalog).ok, true, "true stays valid");
});
