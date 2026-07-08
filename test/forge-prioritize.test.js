"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { prioritize, normalize, intentOf } = require("../src/forge/prioritize.js");

test("empty/invalid input -> []", () => {
  assert.deepEqual(prioritize([]), []);
  assert.deepEqual(prioritize(undefined), []);
  assert.deepEqual(prioritize(null, null), []);
  assert.deepEqual(prioritize([{}, { what: "" }, { reason: "x" }]), []); // no intent -> ignored, not guessed
});

test("determinism: same input -> identical order", () => {
  const gaps = [
    { i: 0, what: "Hero-Headline gleitet herein", target: ".hero h1" },
    { i: 1, what: "SVG-Pfad zeichnet sich", target: "svg.logo" },
    { i: 2, what: "Hero-Headline gleitet herein", target: ".hero h2" },
  ];
  const a = prioritize(gaps);
  const b = prioritize(gaps);
  assert.deepEqual(a, b);
  assert.deepEqual(a.map((e) => e.gapKey), b.map((e) => e.gapKey));
});

test("frequency groups; exemplars deduplicate; more frequent pattern first", () => {
  const gaps = [
    { i: 0, what: "Hero-Headline gleitet herein", target: ".hero h1" },
    { i: 1, what: "Hero-Headline gleitet herein", target: ".hero h1" }, // dup target
    { i: 2, what: "Hero-Headline gleitet herein", target: ".hero h2" },
    { i: 3, what: "SVG-Pfad zeichnet sich", target: "svg.logo" },
  ];
  const q = prioritize(gaps);
  assert.equal(q.length, 2);
  assert.equal(q[0].pattern, "hero-headline gleitet herein");
  assert.equal(q[0].frequency, 3);
  assert.deepEqual(q[0].exemplars, [".hero h1", ".hero h2"]); // dedup
  assert.equal(q[0].score, 3);
  assert.equal(q[1].frequency, 1);
});

test("normalize folds upper/lower case + whitespace into the same group", () => {
  assert.equal(normalize("  Hero   Headline  "), "hero headline");
  const gaps = [
    { what: "Hero  Headline", target: ".a" },
    { what: "hero headline", target: ".b" },
  ];
  const q = prioritize(gaps);
  assert.equal(q.length, 1);
  assert.equal(q[0].frequency, 2);
});

test("telemetry lifts a matching pattern upward", () => {
  const gaps = [
    { what: "selten gebrauchte bewegung", target: ".x" },
    { what: "haeufige bewegung", target: ".y" },
    { what: "haeufige bewegung", target: ".z" },
  ];
  const base = prioritize(gaps);
  assert.equal(base[0].pattern, "haeufige bewegung");
  const boosted = prioritize(gaps, [{ pattern: "Selten gebrauchte Bewegung", count: 5 }]);
  assert.equal(boosted[0].pattern, "selten gebrauchte bewegung");
  assert.equal(boosted[0].score, 6); // 1 gap + 5 telemetry
  assert.equal(prioritize(gaps, [{ pattern: "gibt es nicht", count: 99 }]).length, base.length);
});

test("intentOf accepts real discover field `what` and legacy `intent`", () => {
  assert.equal(intentOf({ what: "A" }), "A");
  assert.equal(intentOf({ intent: "B" }), "B");
  assert.equal(intentOf({ what: "A", intent: "B" }), "A"); // `what` (real) wins
  const fromWhat = prioritize([{ what: "gemeinsame absicht", target: ".a" }]);
  const fromIntent = prioritize([{ intent: "gemeinsame absicht", target: ".a" }]);
  assert.equal(fromWhat[0].gapKey, fromIntent[0].gapKey);
});

test("equal scores -> deterministic tiebreak by gapKey (alphabetical)", () => {
  const q = prioritize([
    { what: "zebra bewegung", target: ".z" },
    { what: "alpha bewegung", target: ".a" },
  ]);
  assert.deepEqual(q.map((e) => e.pattern), ["alpha bewegung", "zebra bewegung"]);
});
