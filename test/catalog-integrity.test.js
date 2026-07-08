"use strict";
/* Sprint-2 phase C anti-goal #2 with teeth: NO primitive may reach the
 * catalog that has not been verified on real hardware.
 * Previously this was only a rule in the plan — here it becomes a gate. */
const { test } = require("node:test");
const assert = require("node:assert");
const { loadCatalog } = require("../src/compiler/catalog.js");

const catalog = loadCatalog();
const names = Object.keys(catalog);

test("catalog is not empty", () => {
  assert.ok(names.length >= 8);
});

test("every primitive is hardware-verified (performance.verified + verifiedAt)", () => {
  const offenders = names.filter((n) => {
    const p = catalog[n].performance || {};
    return p.verified !== true || !/^\d{4}-\d{2}-\d{2}$/.test(p.verifiedAt || "");
  });
  assert.deepEqual(offenders, [], "unverified primitives in the catalog: " + offenders.join(", "));
});

test("every primitive has a reduced-motion fallback (a11y)", () => {
  const offenders = names.filter((n) => !(catalog[n].a11y && catalog[n].a11y.reducedMotionFallback));
  assert.deepEqual(offenders, [], "primitives without a11y fallback: " + offenders.join(", "));
});

test("every primitive has a performance budget (cost as a number)", () => {
  const offenders = names.filter((n) => typeof (catalog[n].performance || {}).cost !== "number");
  assert.deepEqual(offenders, [], "primitives without cost: " + offenders.join(", "));
});
