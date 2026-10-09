#!/usr/bin/env node
"use strict";
// Compare two authoritative checkouts without exposing source or private comments.
// Run after npm ci: node scripts/check-shared-core.js /path/to/other/checkout
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const espree = require("espree");
const here = path.resolve(__dirname, "..");
const other = process.argv[2] && path.resolve(process.argv[2]);
if (!other || !fs.existsSync(path.join(other, "package.json"))) {
  console.error("Usage: node scripts/check-shared-core.js OTHER_AUTHORITATIVE_CHECKOUT");
  process.exit(2);
}
const roots = ["src", "primitives", "schema"];
const single = ["bin/motion.js", "bin/promote-gate.js", "catalog.lock.json", "server.json"];
function files(root, rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [rel];
  return fs.readdirSync(abs).sort().flatMap(name => files(root, path.join(rel, name)));
}
const all = [...new Set([...roots.flatMap(p => [...files(here, p), ...files(other, p)]), ...single])].sort();
const digest = crypto.createHash("sha256");
const differences = [];
let byteIdentical = 0;
let codeIdentical = 0;
for (const rel of all) {
  const a = path.join(here, rel), b = path.join(other, rel);
  if (!fs.existsSync(a) || !fs.existsSync(b)) { differences.push({ path: rel, reason: "missing" }); continue; }
  const left = fs.readFileSync(a), right = fs.readFileSync(b);
  let canonical = left.toString("utf8");
  if (left.equals(right)) byteIdentical++;
  else if (/\.(?:c?js|mjs)$/.test(rel)) {
    const tokens = text => JSON.stringify(espree.tokenize(text, {
      ecmaVersion: "latest", sourceType: rel.endsWith(".mjs") ? "module" : "script",
    }).map(token => [token.type, token.value]));
    if (tokens(left.toString("utf8")) !== tokens(right.toString("utf8"))) {
      differences.push({ path: rel, reason: "code-drift" }); continue;
    }
    codeIdentical++;
  } else { differences.push({ path: rel, reason: "byte-drift" }); continue; }
  if (/\.(?:c?js|mjs)$/.test(rel)) canonical = JSON.stringify(espree.tokenize(canonical, {
    ecmaVersion: "latest", sourceType: rel.endsWith(".mjs") ? "module" : "script",
  }).map(token => [token.type, token.value]));
  digest.update(rel + "\0" + canonical + "\0");
}
console.log(JSON.stringify({ ok: differences.length === 0, checked: all.length,
  byteIdentical, codeIdentical, canonicalSha256: differences.length ? null : digest.digest("hex"),
  differences }, null, 2));
process.exitCode = differences.length ? 1 : 0;
