"use strict";
/* ADR-0001 D2 — Catalog SemVer diff-gate (Phase B item 1).
 * Proves the gate (a) passes when the committed baseline is in sync and
 * (b) actually CATCHES a tightened bound shipped without a major bump —
 * the exact failure the re-audit flagged as unenforceable. */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { loadCatalog } = require("../src/compiler/catalog.js");
const { snapshotCatalog, classifyChange, diffCatalog } = require("../src/compiler/catalog-semver.js");

const LOCK = path.join(__dirname, "..", "catalog.lock.json");

test("committed catalog.lock.json is in sync with the catalog (no silent drift)", () => {
  assert.ok(fs.existsSync(LOCK), "catalog.lock.json must be committed");
  const lock = JSON.parse(fs.readFileSync(LOCK, "utf8")).primitives;
  const current = snapshotCatalog(loadCatalog());
  const { violations } = diffCatalog(lock, current);
  assert.deepEqual(violations, [], violations.map((v) => v.msg).join("\n"));
});

test("classify: lowering a max is MAJOR", () => {
  const prev = { version: "1.0.0", output: "js", params: { d: { type: "number", required: false, min: 0.2, max: 5, pattern: null } } };
  const curr = { version: "1.0.1", output: "js", params: { d: { type: "number", required: false, min: 0.2, max: 3, pattern: null } } };
  assert.equal(classifyChange(prev, curr).class, "major");
});

test("classify: raising a min is MAJOR", () => {
  const prev = { version: "1.0.0", output: "js", params: { d: { type: "number", required: false, min: 0.2, max: 5, pattern: null } } };
  const curr = { version: "1.0.0", output: "js", params: { d: { type: "number", required: false, min: 0.5, max: 5, pattern: null } } };
  assert.equal(classifyChange(prev, curr).class, "major");
});

test("classify: new optional param is MINOR; new required param is MAJOR", () => {
  const prev = { version: "1.0.0", output: "js", params: {} };
  const optional = { version: "1.0.0", output: "js", params: { x: { type: "number", required: false, min: null, max: null, pattern: null } } };
  const required = { version: "1.0.0", output: "js", params: { x: { type: "number", required: true, min: null, max: null, pattern: null } } };
  assert.equal(classifyChange(prev, optional).class, "minor");
  assert.equal(classifyChange(prev, required).class, "major");
});

test("GATE: tightened bound shipped as a PATCH is a violation", () => {
  const lock = { foo: { version: "1.0.0", output: "js", params: { d: { type: "number", required: false, min: 0.2, max: 5, pattern: null } } } };
  const current = { foo: { version: "1.0.1", output: "js", params: { d: { type: "number", required: false, min: 0.2, max: 3, pattern: null } } } };
  const { violations } = diffCatalog(lock, current);
  assert.equal(violations.length, 1);
  assert.match(violations[0].msg, /MAJOR bump/);
});

test("GATE: tightened bound WITH a major bump passes", () => {
  const lock = { foo: { version: "1.0.0", output: "js", params: { d: { type: "number", required: false, min: 0.2, max: 5, pattern: null } } } };
  const current = { foo: { version: "2.0.0", output: "js", params: { d: { type: "number", required: false, min: 0.2, max: 3, pattern: null } } } };
  assert.deepEqual(diffCatalog(lock, current).violations, []);
});

test("GATE: removed primitive is a breaking violation", () => {
  const lock = { foo: { version: "1.0.0", output: "js", params: {} }, bar: { version: "1.0.0", output: "js", params: {} } };
  const current = { foo: { version: "1.0.0", output: "js", params: {} } };
  const { violations, removed } = diffCatalog(lock, current);
  assert.deepEqual(removed, ["bar"]);
  assert.equal(violations.length, 1);
});

test("GATE: new primitive is allowed (catalog minor)", () => {
  const lock = { foo: { version: "1.0.0", output: "js", params: {} } };
  const current = { foo: { version: "1.0.0", output: "js", params: {} }, baz: { version: "1.0.0", output: "js", params: {} } };
  const { violations, added } = diffCatalog(lock, current);
  assert.deepEqual(added, ["baz"]);
  assert.deepEqual(violations, []);
});
