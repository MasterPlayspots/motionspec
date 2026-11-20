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

/* Beschreibungen für npm und die MCP-Registry: Die Registry lehnt mehr als 100 Zeichen ab
 * (server.schema.json 2025-12-11, ServerDetail.description maxLength 100), und kein Text darf
 * eine verbotene Aussage enthalten (Teilwort, Kleinschreibung — auch Verneinungen fallen durch). */
const VERBOTENE_AUSSAGEN = ["konform", "conform", "compliant", "compliance", "garantiert barrierefrei", "guaranteed accessib",
  "fully accessible", "100% barrierefrei", "100% accessible", "siegel", "seal of", "gütesiegel", "zertifiziert", "certified"];

test("server.json description fits the registry limit (1..100 characters)", () => {
  assert.equal(typeof server.description, "string");
  assert.ok(server.description.length >= 1 && server.description.length <= 100, "length " + server.description.length);
});

test("npm and registry descriptions contain no forbidden claim", () => {
  for (const [wo, text] of [["package.json", pkg.description], ["server.json", server.description], ["server.json title", server.title]]) {
    const low = String(text).toLowerCase();
    for (const w of VERBOTENE_AUSSAGEN) assert.equal(low.includes(w), false, wo + " contains '" + w + "'");
  }
});
