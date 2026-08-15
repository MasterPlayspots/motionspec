#!/usr/bin/env node
/**
 * changelog-gate.js — refuses to publish a version that has no CHANGELOG section.
 *
 * WHY THIS EXISTS
 * The previous gate only checked that CHANGELOG.md *existed*. It did, continuously,
 * while 1.2.5, 1.2.6 and 1.2.7 shipped to npm without an entry — three releases in
 * a row. A file-exists check cannot catch that; it was green the whole time.
 *
 * This is the cause of that gap, and it is a few lines.
 */
const fs = require("fs");

const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));

if (!fs.existsSync("CHANGELOG.md")) {
  console.error("changelog-gate: CHANGELOG.md is missing.");
  process.exit(1);
}

const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
// Match the Keep-a-Changelog heading exactly: `## [1.2.7]` — optionally dated.
const heading = new RegExp(
  `^##\\s*\\[${version.replace(/\./g, "\\.")}\\]`, "m");

if (!heading.test(changelog)) {
  console.error(
    `\nchangelog-gate: refusing to publish ${version}.\n\n` +
    `  CHANGELOG.md has no "## [${version}]" section.\n\n` +
    `  Add one before publishing. An entry written after the fact is written\n` +
    `  from the commit log; one written now is written from memory, and the\n` +
    `  difference shows.\n`);
  process.exit(1);
}

// An empty section is not an entry.
//
// Careful with the split: `rest` begins with the heading itself, so splitting on
// /^##\s/m puts an empty string first and the section body second. Taking [0]
// reports every section as empty — including full ones. Drop the heading line
// first, then split.
const rest = changelog.slice(changelog.search(heading));
const nachUeberschrift = rest.slice(rest.indexOf("\n") + 1);
const body = nachUeberschrift.split(/^##\s/m)[0].trim();
if (!body) {
  console.error(`\nchangelog-gate: the "## [${version}]" section is empty.\n`);
  process.exit(1);
}

console.log(`changelog-gate: ${version} is documented (${body.split("\n").length} lines).`);
