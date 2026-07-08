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
