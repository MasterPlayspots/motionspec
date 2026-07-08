#!/usr/bin/env node
"use strict";
/*
 * Relock the catalog baseline (ADR-0001 D2).
 *   node bin/catalog-lock.js            -> write catalog.lock.json from current catalog
 *   node bin/catalog-lock.js --check    -> exit non-zero if current catalog violates
 *                                          SemVer bump rules vs the committed lock
 *
 * Run --check in CI; run without flags at release time to advance the baseline.
 * Refuses to relock while there are unacknowledged bump violations.
 */
const fs = require("fs");
const path = require("path");
const { loadCatalog } = require("../src/compiler/catalog.js");
const { snapshotCatalog, diffCatalog } = require("../src/compiler/catalog-semver.js");

const LOCK = path.join(__dirname, "..", "catalog.lock.json");
const check = process.argv.includes("--check");
const current = snapshotCatalog(loadCatalog());

if (check) {
  if (!fs.existsSync(LOCK)) { console.error("No catalog.lock.json — run `npm run catalog-lock`."); process.exit(1); }
  const lock = JSON.parse(fs.readFileSync(LOCK, "utf8")).primitives;
  const { violations, added, removed } = diffCatalog(lock, current);
  if (violations.length) {
    console.error("Catalog SemVer violations:");
    violations.forEach((v) => console.error("  - " + v.msg));
    process.exit(1);
  }
  console.error("Catalog SemVer OK (added: " + (added.join(", ") || "none") + "; removed: " + (removed.join(", ") || "none") + ").");
  process.exit(0);
}

// Relock: validate first (refuse on violation), then advance the baseline.
if (fs.existsSync(LOCK)) {
  const lock = JSON.parse(fs.readFileSync(LOCK, "utf8")).primitives;
  const { violations } = diffCatalog(lock, current);
  if (violations.length) {
    console.error("Refusing to relock — fix these bumps first:");
    violations.forEach((v) => console.error("  - " + v.msg));
    process.exit(1);
  }
}
const out = { generatedAt: new Date().toISOString().slice(0, 10), note: "Released catalog baseline for ADR-0001 D2 SemVer gate. Relock at release time.", primitives: current };
fs.writeFileSync(LOCK, JSON.stringify(out, null, 2) + "\n");
console.error("Wrote catalog.lock.json (" + Object.keys(current).length + " primitives).");
