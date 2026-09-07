"use strict";
/*
 * lockfile-gate.test.js
 * ---------------------
 * The gate exists because of a specific evening: a lock file was replaced by a
 * 32-line stub, the "restore" that followed wrote 6 of 249 entries, and nothing
 * in the repository objected until every CI job died at `npm ci`. These tests
 * replay both shapes and a few neighbours, so the gate cannot quietly stop
 * catching them.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const GATE = path.join(ROOT, "bin", "lockfile-gate.js");

const REAL_PKG = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
const REAL_LOCK = fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8");

/* Runs the gate in a throwaway directory holding exactly the two files it reads. */
function runGate({ pkg = REAL_PKG, lock = REAL_LOCK, args = [] }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-lockfile-gate-"));
  try {
    fs.writeFileSync(path.join(dir, "package.json"), pkg);
    if (lock !== null) fs.writeFileSync(path.join(dir, "package-lock.json"), lock);
    const r = spawnSync(process.execPath, [GATE, ...args], {
      cwd: dir,
      encoding: "utf8",
    });
    return { status: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function withLock(mutate) {
  const lock = JSON.parse(REAL_LOCK);
  mutate(lock);
  return JSON.stringify(lock, null, 2);
}

test("lockfile-gate: accepts the lock file this repository ships", () => {
  const { status, out } = runGate({});
  assert.equal(status, 0, out);
  assert.match(out, /lockfile-gate OK/);
});

test("lockfile-gate: rejects the gutted shape — root entry only", () => {
  const lock = withLock((l) => {
    l.packages = { "": l.packages[""] };
  });
  const { status, out } = runGate({ lock });
  assert.equal(status, 1);
  // The runtime dependencies are the part worth naming out loud.
  assert.match(out, /@modelcontextprotocol\/sdk/);
  assert.match(out, /zod/);
  assert.match(out, /ship at runtime/);
});

test("lockfile-gate: rejects the truncated shape — a handful of entries", () => {
  const lock = withLock((l) => {
    const keep = Object.keys(l.packages).filter((k) => k.startsWith("node_modules/")).slice(0, 6);
    const next = { "": l.packages[""] };
    keep.forEach((k) => { next[k] = l.packages[k]; });
    l.packages = next;
  });
  const { status, out } = runGate({ lock });
  assert.equal(status, 1);
  assert.match(out, /below the floor/);
});

test("lockfile-gate: rejects a tree missing one deep transitive dependency", () => {
  // Nothing structural gives this away — only npm's own resolver sees it.
  const victim = "node_modules/punycode";
  assert.ok(JSON.parse(REAL_LOCK).packages[victim], `fixture assumes ${victim} is in the tree`);
  const lock = withLock((l) => { delete l.packages[victim]; });
  const { status, out } = runGate({ lock });
  assert.equal(status, 1);
  assert.match(out, /npm cannot resolve the tree/);
});

test("lockfile-gate: rejects a version bump the lock file did not follow", () => {
  const pkg = JSON.stringify({ ...JSON.parse(REAL_PKG), version: "99.99.99" }, null, 2);
  const { status, out } = runGate({ pkg });
  assert.equal(status, 1);
  assert.match(out, /lock root version/);
});

test("lockfile-gate: rejects a missing or unparsable lock file", () => {
  const absent = runGate({ lock: null });
  assert.equal(absent.status, 1);
  assert.match(absent.out, /package-lock\.json is missing/);

  const garbage = runGate({ lock: "{ this is not json" });
  assert.equal(garbage.status, 1);
  assert.match(garbage.out, /not valid JSON/);
});

test("lockfile-gate: --min lowers the floor for a deliberate reduction", () => {
  const { status, out } = runGate({ args: ["--min=999999"] });
  assert.equal(status, 1, "a floor above the real count must fail");
  assert.match(out, /below the floor of 999999/);
});
