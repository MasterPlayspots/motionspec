"use strict";
/*
 * forge-generate.test.js (building block 4)
 * ----------------------------------------------------------------------
 * Proves the LLM-assisted head WITHOUT a real model (mockForgeClient):
 *   - good gap  -> bundle passes the gauntlet (ok), NO promotion side effect
 *   - failFirst -> ONE repair attempt heals -> ok
 *   - alwaysBad -> escalates cleanly (NOTES: ESCALATE), never promoted
 *   - slugName canonicalizes names
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { generate, slugName } = require("../src/forge/generate.js");
const { mockForgeClient } = require("../src/router/clients.js");

const ROOT = path.join(__dirname, "..");
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "forge-gen-"));

test("slugName: canonicalizes to a valid camelCase catalog name", () => {
  assert.equal(slugName("SVG-Pfad zeichnet sich"), "svgPfadZeichnetSich");
  assert.equal(slugName("   "), "genPrimitive");
  assert.equal(slugName("123 start"), "x123Start");
  assert.ok(/^[A-Za-z][A-Za-z0-9]{1,40}$/.test(slugName("a very long intent ".repeat(10))));
});

test("good gap -> bundle passes the gauntlet (ok), NO promotion side effect", async () => {
  const candidatesDir = tmpDir();
  const gap = { what: "svg pfad zeichnet sich", target: "svg.logo path" };
  const expectedName = slugName(gap.what);

  const res = await generate(gap, { client: mockForgeClient(), candidatesDir });
  assert.equal(res.ok, true, "good mock must pass the gauntlet: " + JSON.stringify(res));
  assert.equal(res.name, expectedName);

  // candidate files exist
  const dir = path.join(candidatesDir, expectedName);
  for (const f of [expectedName + ".json", "example.motionspec.json", "NOTES.md", "GATE_REPORT.md"]) {
    assert.ok(fs.existsSync(path.join(dir, f)), f + " is missing");
  }
  // provenance marker
  assert.ok(fs.readFileSync(path.join(dir, "NOTES.md"), "utf8").includes("MACHINE-DESIGNED"));
  // NO promotion side effect: primitives/ does NOT have the name
  assert.equal(fs.existsSync(path.join(ROOT, "primitives", expectedName + ".json")), false);
});

test("failFirst -> ONE repair attempt heals -> ok", async () => {
  const candidatesDir = tmpDir();
  const gap = { what: "reparable bewegung", target: ".rep" };
  const res = await generate(gap, { client: mockForgeClient({ failFirst: true }), candidatesDir });
  assert.equal(res.ok, true, "after one repair it must be green: " + JSON.stringify(res));
});

test("alwaysBad -> escalates cleanly (NOTES: ESCALATE), never promoted", async () => {
  const candidatesDir = tmpDir();
  const gap = { what: "unmoegliche bewegung", target: ".imp" };
  const res = await generate(gap, { client: mockForgeClient({ alwaysBad: true }), candidatesDir });
  assert.equal(res.escalate, true);
  assert.ok(Array.isArray(res.checks) && res.checks.length > 0, "escalation carries the red gates");

  const dir = path.join(candidatesDir, res.name);
  const notes = fs.readFileSync(path.join(dir, "NOTES.md"), "utf8");
  assert.ok(notes.includes("ESCALATE"), "NOTES must mark ESCALATE");
  // never promoted
  assert.equal(fs.existsSync(path.join(ROOT, "primitives", res.name + ".json")), false);
});

test("model transport error -> escalation instead of crash", async () => {
  const candidatesDir = tmpDir();
  const throwingClient = { name: "boom", async complete() { throw new Error("network down"); } };
  const res = await generate({ what: "egal" }, { client: throwingClient, candidatesDir });
  assert.equal(res.escalate, true);
  assert.match(res.reason, /transport error/);
});
