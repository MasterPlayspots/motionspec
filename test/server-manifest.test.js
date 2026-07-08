"use strict";
/*
 * server-manifest.test.js
 * -----------------------
 * Keeps the MCP registry manifest (server.json) in lockstep with the
 * published npm package (package.json). Both carry a version, and a
 * registry entry that advertises a different version than what npm
 * actually ships is a silent supply-chain mismatch. This test fails
 * fast on any drift so the two versions are bumped together.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const server = JSON.parse(fs.readFileSync(path.join(ROOT, "server.json"), "utf8"));

test("server.json version matches package.json version", () => {
  assert.equal(server.version, pkg.version);
});

test("server.json npm package version matches package.json version", () => {
  const npmPkg = (server.packages || []).find((p) => p.registryType === "npm");
  assert.ok(npmPkg, "server.json must declare an npm package entry");
  assert.equal(npmPkg.version, pkg.version);
});
