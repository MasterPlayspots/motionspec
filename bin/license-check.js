#!/usr/bin/env node
"use strict";
/* Phase B security (roadmap anti-goal #5): block any dependency whose license
 * is not on the permissive allow-list. Reads the CycloneDX SBOM. Run after
 * `npm run sbom`. Exits non-zero on a disallowed or missing license. */
const fs = require("fs");
const path = require("path");

const ALLOW = new Set([
  "MIT", "ISC", "0BSD", "BSD-2-Clause", "BSD-3-Clause",
  "Apache-2.0", "CC0-1.0", "Unlicense", "BlueOak-1.0.0",
]);

const file = path.join(__dirname, "..", "sbom.cdx.json");
if (!fs.existsSync(file)) { console.error("No sbom.cdx.json — run `npm run sbom` first."); process.exit(1); }
const sbom = JSON.parse(fs.readFileSync(file, "utf8"));
const comps = sbom.components || [];

const bad = [];
for (const c of comps) {
  const ids = (c.licenses || []).map((l) => (l.license && (l.license.id || l.license.name)) || l.expression).filter(Boolean);
  if (!ids.length) { bad.push(c.name + "@" + c.version + " (no license declared)"); continue; }
  const ok = ids.some((id) => ALLOW.has(id));
  if (!ok) bad.push(c.name + "@" + c.version + " (" + ids.join(", ") + ")");
}

if (bad.length) {
  console.error("Disallowed / missing licenses (" + bad.length + "):");
  bad.forEach((b) => console.error("  - " + b));
  process.exit(1);
}
console.error("License check OK — " + comps.length + " components, all permissive.");
