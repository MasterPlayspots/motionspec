#!/usr/bin/env node
/**
 * lockfile-gate.js — refuses to push a package-lock.json that npm cannot install from.
 *
 * WHY THIS EXISTS
 * On 2026-09-07 the `security` job was red on two advisories. The attempt to clear
 * it replaced package-lock.json with a 32-line stub holding only the root entry —
 * all 249 node_modules entries gone, both production dependencies with them. The
 * follow-up commit that claimed to restore the file wrote 6 entries, alphabetically
 * up to @commitlint/ensure, and stopped. Neither commit was stopped by anything:
 * every CI job begins with `npm ci`, so all of them died at the same first step,
 * and the only error anyone saw was "Missing: punycode@2.3.1 from lock file" —
 * one arbitrary package out of two hundred, naming nothing about the real damage.
 *
 * This gate is the check that was missing. It is offline, needs no node_modules,
 * and runs in well under a second, so it can sit in a pre-push hook.
 *
 * Usage:  node bin/lockfile-gate.js [--min=200]
 * Exit 0 = the lock file is complete and resolvable. Exit 1 = do not push it.
 */
const fs = require("fs");
const { spawnSync } = require("child_process");

/* Floor for the number of node_modules entries. Not a precise figure — a blunt
 * backstop against wholesale truncation. The tree held 249 when this was written;
 * 200 leaves room to shrink without turning the gate into a maintenance chore. */
const DEFAULT_MIN_ENTRIES = 200;

const minArg = process.argv.find((a) => a.startsWith("--min="));
const MIN_ENTRIES = minArg ? Number(minArg.slice("--min=".length)) : DEFAULT_MIN_ENTRIES;

const problems = [];

function fail(message) {
  problems.push(message);
}

/* ---------- 1. both files must exist and parse ---------- */

function readJson(file) {
  if (!fs.existsSync(file)) {
    fail(`${file} is missing.`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    fail(`${file} is not valid JSON: ${err.message}`);
    return null;
  }
}

const pkg = readJson("package.json");
const lock = readJson("package-lock.json");

if (!pkg || !lock) {
  report();
}

/* ---------- 2. structure ---------- */

if (!(lock.lockfileVersion >= 3)) {
  fail(`lockfileVersion is ${JSON.stringify(lock.lockfileVersion)}; expected 3 or higher.`);
}

const packages = lock.packages;
if (!packages || typeof packages !== "object") {
  fail('package-lock.json has no "packages" object — nothing can be installed from it.');
  report();
}

const root = packages[""];
if (!root) {
  fail('package-lock.json has no root package entry ("").');
} else {
  if (root.name !== pkg.name) {
    fail(`lock root name is "${root.name}", package.json says "${pkg.name}".`);
  }
  if (root.version !== pkg.version) {
    fail(`lock root version is "${root.version}", package.json says "${pkg.version}".`);
  }
}

/* ---------- 3. every declared dependency must be in the tree ---------- */

const declared = {
  ...(pkg.dependencies || {}),
  ...(pkg.devDependencies || {}),
  ...(pkg.optionalDependencies || {}),
};

const missing = Object.keys(declared)
  .filter((name) => !packages[`node_modules/${name}`])
  .sort();

if (missing.length) {
  const prod = Object.keys(pkg.dependencies || {});
  const missingProd = missing.filter((n) => prod.includes(n));
  fail(
    `${missing.length} declared dependenc${missing.length === 1 ? "y is" : "ies are"} ` +
    `absent from the lock tree:\n      ${missing.join("\n      ")}` +
    (missingProd.length
      ? `\n    ${missingProd.length} of them ship at runtime: ${missingProd.join(", ")}`
      : "")
  );
}

/* ---------- 4. size floor ---------- */

const entries = Object.keys(packages).filter((k) => k.startsWith("node_modules/"));

if (entries.length < MIN_ENTRIES) {
  fail(
    `the lock tree holds ${entries.length} node_modules entries, below the floor of ${MIN_ENTRIES}.\n` +
    `    A dependency tree does not shrink by that much on its own. If this is a real,\n` +
    `    intended reduction, lower the floor in the same commit: --min=<n>.`
  );
}

/* ---------- 5. every entry must say where it comes from ---------- */

const unresolvable = entries.filter((k) => {
  const e = packages[k];
  return !e.link && (!e.resolved || !e.integrity);
});

if (unresolvable.length) {
  fail(
    `${unresolvable.length} entr${unresolvable.length === 1 ? "y has" : "ies have"} ` +
    `no resolved URL or no integrity hash — a half-written lock file:\n      ` +
    unresolvable.slice(0, 10).join("\n      ") +
    (unresolvable.length > 10 ? `\n      … and ${unresolvable.length - 10} more` : "")
  );
}

/* ---------- 6. npm's own resolver has the last word ---------- */

/* --package-lock-only reads the lock and nothing else: no network, no node_modules.
 * It catches what the checks above cannot — a transitive dependency that is
 * referenced but never declared anywhere in the tree. */
const ls = spawnSync("npm", ["ls", "--package-lock-only", "--all"], { encoding: "utf8" });

if (ls.error) {
  console.warn(`lockfile-gate: could not run "npm ls" (${ls.error.message}); skipped that check.`);
} else if (ls.status !== 0) {
  const lines = `${ls.stdout || ""}\n${ls.stderr || ""}`
    .split("\n")
    .filter((l) => /missing|invalid|UNMET/i.test(l))
    .slice(0, 8);
  fail(
    "npm cannot resolve the tree from this lock file — `npm ci` will fail.\n" +
    (lines.length ? `      ${lines.map((l) => l.trim()).join("\n      ")}` : "      (npm ls exited non-zero without a specific line)")
  );
}

/* ---------- verdict ---------- */

report();

function report() {
  if (!problems.length) {
    console.log(
      `lockfile-gate OK — ${entries.length} entries, every declared dependency present, tree resolves.`
    );
    process.exit(0);
  }
  console.error("\nlockfile-gate: refusing this package-lock.json.\n");
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}\n`));
  console.error(
    "  Do not hand-edit a lock file. Restore the last good one and let npm write it:\n" +
    "      git show <last-good-ref>:package-lock.json > package-lock.json\n" +
    "      npm ci && npm audit fix && npm ci\n"
  );
  process.exit(1);
}
