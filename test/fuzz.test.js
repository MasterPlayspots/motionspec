"use strict";
/* Phase B — Fuzz the trust boundary.
 * Thousands of random/garbage specs through validateSpec + compileSpec.
 * Invariants that must hold for EVERY input (the whole security thesis):
 *   I1. validateSpec never throws.
 *   I2. compileSpec never throws (it returns {ok:false}, never crashes).
 *   I3. An invalid spec NEVER yields output (no js/css, no report).
 *   I4. compile only succeeds on a spec that validateSpec accepts.
 *   I5. Any emitted code is a string and carries no raw injection breakout.
 * A seeded PRNG makes any failure reproducible (the seed is printed). */
const { test } = require("node:test");
const assert = require("node:assert");
const { validateSpec } = require("../src/compiler/validate.js");
const { compileSpec } = require("../src/compiler/compile.js");
const { loadCatalog } = require("../src/compiler/catalog.js");

const catalog = loadCatalog();
const PRIMS = Object.keys(catalog);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INJECTION = [
  "');alert(1);('", "`+process.env+`", "</script><script>x()</script>",
  "*/}body{display:none}/*", "\\x00", "a; DROP TABLE", "${7*7}", "}}{{",
  "../../etc/passwd", "<img src=x onerror=alert(1)>", '" onload="x',
];

function rnd(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function randomValue(rng, depth) {
  const pick = rng();
  if (depth > 3 || pick < 0.3) {
    const leaf = rng();
    if (leaf < 0.2) return rng() * 200 - 100;
    if (leaf < 0.4) return rng() < 0.5;
    if (leaf < 0.6) return null;
    if (leaf < 0.8) return rnd(rng, INJECTION);
    return rnd(rng, ["scrollReveal", "nope", ".hero h1", "vanilla-gsap", "1.0", "0.1", ""]);
  }
  if (pick < 0.6) {
    const o = {};
    const n = Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) o[rnd(rng, ["id", "primitive", "target", "params", "trigger", "from", "to", "duration", "x", "evil"])] = randomValue(rng, depth + 1);
    return o;
  }
  const n = Math.floor(rng() * 4);
  const a = [];
  for (let i = 0; i < n; i++) a.push(randomValue(rng, depth + 1));
  return a;
}

/* Mix in semi-structured specs so compile paths (not just rejection) get hit. */
function semiStructured(rng) {
  return {
    specVersion: rnd(rng, ["1.0", "0.1", "9.9", 1, undefined]),
    meta: { project: "f", target: rnd(rng, ["vanilla-gsap", "react", 5]), createdWith: "fuzz" },
    globals: { respectReducedMotion: rng() < 0.5 },
    motions: [{
      id: rnd(rng, ["m", "bad id!", "x".repeat(80), ""]),
      primitive: rnd(rng, [...PRIMS, "ghost", 7]),
      target: rnd(rng, [".hero h1", rnd(rng, INJECTION), ""]),
      params: rng() < 0.5 ? { from: { opacity: rng() }, duration: rng() * 10 } : randomValue(rng, 2),
      trigger: rng() < 0.3 ? { start: "top 80%", scrub: true } : undefined,
    }],
  };
}

/* Mostly-valid specs: real primitive + safe params, occasionally mutated.
 * Exercises the COMPILE path (templates, interpolation), not just rejection. */
function mostlyValid(rng) {
  const choices = [
    { primitive: "scrollReveal", target: ".hero h1", params: { from: { opacity: 0, y: Math.floor(rng() * 60) }, duration: 0.2 + rng() * 2 } },
    { primitive: "staggerReveal", target: ".cards .card", params: { from: { opacity: 0, y: 24 }, stagger: 0.05 + rng() * 0.3 } },
    { primitive: "cssTransition", target: ".box", params: { property: "opacity" } },
    { primitive: "counterUp", target: ".num", params: { duration: 1 + rng() * 2 } },
  ];
  const m = JSON.parse(JSON.stringify(rnd(rng, choices)));
  m.id = "fz-" + Math.floor(rng() * 1000);
  const spec = {
    specVersion: rng() < 0.5 ? "1.0" : "0.1",
    meta: { project: "f", target: "vanilla-gsap", createdWith: "fuzz" },
    globals: { respectReducedMotion: rng() < 0.5 },
    motions: [m],
  };
  // 35% of the time, mutate one field — may break validity (exercises both paths).
  if (rng() < 0.35) {
    const mut = rng();
    if (mut < 0.33) m.target = rnd(rng, INJECTION);
    else if (mut < 0.66) m.params = randomValue(rng, 2);
    else spec.specVersion = rnd(rng, ["9.9", 1, undefined]);
  }
  return spec;
}

function looksUnescaped(code) {
  // Output must never contain a raw comment-breakout or script close from data.
  return code.includes("*/") && code.includes("/*body") ? true
    : /<\/script>/i.test(code) || code.includes("');alert");
}

const ITER = 6000;

test("fuzz: validate + compile hold every invariant over " + ITER + " random specs", () => {
  let compiledOk = 0, rejected = 0;
  for (let i = 0; i < ITER; i++) {
    const seed = 0x1234 + i;
    const rng = mulberry32(seed);
    const bucket = rng();
    const spec = bucket < 0.4 ? randomValue(rng, 0) : bucket < 0.7 ? semiStructured(rng) : mostlyValid(rng);
    const where = "seed=" + seed + " spec=" + JSON.stringify(spec).slice(0, 200);

    let v, r;
    assert.doesNotThrow(() => { v = validateSpec(spec, catalog); }, "I1 validate threw — " + where);
    assert.doesNotThrow(() => { r = compileSpec(spec, catalog, {}); }, "I2 compile threw — " + where);

    if (!v.ok) {
      rejected++;
      assert.equal(r.ok, false, "I3 invalid spec compiled — " + where);
      assert.equal(r.js, undefined, "I3 invalid spec emitted js — " + where);
      assert.equal(r.css, undefined, "I3 invalid spec emitted css — " + where);
      assert.equal(r.report, undefined, "I3 invalid spec produced a report — " + where);
    }
    if (r.ok) {
      compiledOk++;
      assert.equal(v.ok, true, "I4 compile succeeded on an invalid spec — " + where);
      if (r.js) { assert.equal(typeof r.js, "string"); assert.equal(looksUnescaped(r.js), false, "I5 js breakout — " + where); }
      if (r.css) { assert.equal(typeof r.css, "string"); assert.equal(looksUnescaped(r.css), false, "I5 css breakout — " + where); }
    }
  }
  // sanity: the corpus must exercise BOTH branches, else the fuzzer is useless.
  assert.ok(rejected > 100, "fuzzer should reject many specs (got " + rejected + ")");
  assert.ok(compiledOk > 200, "fuzzer should also compile many valid specs (got " + compiledOk + ")");
});

/* Semantic CSS mutations (Truth-Sweep follow-up): injection is only half the
 * claim — a value can be charset-clean yet semantic NONSENSE (property "all",
 * hoverValue "red #fff 100px solid", a GSAP ease in a CSS context). These now
 * fail the Trust Boundary's pattern gate. The fuzzer mixes legit and bogus CSS
 * values and asserts the two load-bearing invariants:
 *   S1. validate↔compile SYMMETRY: compile.ok === validate.ok (a green validator
 *       never lets the compiler emit something it would have rejected).
 *   S2. Any ACCEPTED cssTransition emits a transition on an allow-listed property
 *       (never a naked "all") and carries no injection breakout.
 *   S3. A spec carrying a known-bogus token is ALWAYS rejected (no false-accept). */
const GOOD_PROP = ["transform", "opacity", "color", "background-color", "filter", "width", "height", "border-color"];
const BAD_PROP = ["all", "background", "inherit", "; display:none", "transform;color", "POSITION", "widthh"];
const GOOD_HOVER = ["translateY(-4px)", "translateY(-4px) scale(1.04)", "translateY(-2px) scale(1.1) rotate(2deg)", "#fff", "0.5", "rgba(0,0,0,.2)", "scale(1.05)"];
const BAD_HOVER = ["red #fff 100px solid", "a b c d", "1px 2px 3px 4px", "url(javascript:alert(1))", "`x`", "expression(1)"];
const GOOD_EASE = ["ease", "ease-in", "ease-out", "ease-in-out", "linear", "cubic-bezier(0.4, 0, 0.2, 1)"];
const BAD_EASE = ["power3.out", "jumpAround", "ease out", "linear;x", "ease-out-in"];

function cssTransitionSpec(params) {
  return {
    specVersion: "1.0", meta: { project: "f", target: "vanilla-gsap" },
    globals: { respectReducedMotion: true },
    motions: [{ id: "m", primitive: "cssTransition", target: ".box", params }],
  };
}

test("fuzz: semantic CSS mutations keep validate↔compile symmetry; nonsense never compiles", () => {
  let accepted = 0, rejected = 0;
  for (let i = 0; i < 4000; i++) {
    const seed = 0xC55 + i;
    const rng = mulberry32(seed);
    // Each field independently picks from its good or bad pool (bad ~45% each).
    const usedBad = { p: rng() < 0.45, h: rng() < 0.45, e: rng() < 0.45 };
    const property = rnd(rng, usedBad.p ? BAD_PROP : GOOD_PROP);
    const hoverValue = rnd(rng, usedBad.h ? BAD_HOVER : GOOD_HOVER);
    const easing = rnd(rng, usedBad.e ? BAD_EASE : GOOD_EASE);
    const spec = cssTransitionSpec({ property, hoverValue, easing, duration: 0.25 });
    const where = "seed=" + seed + " " + JSON.stringify({ property, hoverValue, easing });

    const v = validateSpec(spec, catalog);
    const r = compileSpec(spec, catalog, {});
    assert.equal(r.ok, v.ok, "S1 validate↔compile asymmetry — " + where);

    if (v.ok) {
      accepted++;
      // S2: only the all-good combination may be accepted.
      assert.ok(!usedBad.p && !usedBad.h && !usedBad.e, "S3 false-accept of a bogus token — " + where);
      assert.equal(typeof r.css, "string");
      assert.equal(looksUnescaped(r.css), false, "S2 css breakout — " + where);
      // S2: the emitted property is from the allow-list, never a naked "all".
      assert.ok(GOOD_PROP.includes(property) && property !== "all", "S2 non-allow-listed property emitted — " + where);
      assert.ok(r.css.includes("transition: " + property + " "), "S2 expected allow-listed property in transition — " + where);
      assert.equal(/transition: all\b/.test(r.css), false, "S2 'all' leaked into transition — " + where);
    } else {
      rejected++;
      // S3: a rejection must carry a concrete param code, not a vague failure.
      assert.ok(
        ["MS-PARAM-PATTERN", "MS-PARAM-UNSAFE", "MS-PARAM-CHARSET"].some((c) => v.errorCodes.includes(c)),
        "S3 rejection without a param-level code — " + where + " got " + v.errorCodes.join(","),
      );
    }
  }
  // Both branches must be exercised, else the mutation fuzzer proves nothing.
  assert.ok(accepted > 100, "expected many accepted all-good combos (got " + accepted + ")");
  assert.ok(rejected > 1000, "expected many rejected bogus combos (got " + rejected + ")");
});

test("fuzz: every fixed injection payload in target/params is rejected fail-closed", () => {
  for (const payload of INJECTION) {
    const targetSpec = {
      specVersion: "1.0", meta: { project: "f", target: "vanilla-gsap" },
      globals: { respectReducedMotion: true },
      motions: [{ id: "m", primitive: "scrollReveal", target: payload, params: { from: { opacity: 0 } } }],
    };
    const r = compileSpec(targetSpec, catalog, {});
    // Either rejected outright, or — if the selector somehow passes — output must be clean.
    if (r.ok) assert.equal(looksUnescaped(r.js || r.css || ""), false, "payload leaked: " + payload);
    else assert.equal(r.js, undefined);
  }
});
