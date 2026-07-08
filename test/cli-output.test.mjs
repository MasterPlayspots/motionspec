import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* Regression (2026-06-19): the installed `motion` bin MUST write its artifacts
 * into the user's working directory, not into the package path
 * (previously OUT = __dirname/../out -> ended up in node_modules, EACCES global). */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const bin = path.join(repoRoot, "bin", "motion.js");

const VALID_SPEC = {
  specVersion: "1.0",
  meta: { project: "cli-cwd-test", target: "vanilla-gsap", createdWith: "test" },
  globals: { respectReducedMotion: true },
  motions: [
    {
      id: "hero",
      primitive: "scrollReveal",
      target: ".hero h1",
      params: { from: { opacity: 0, y: 48 }, duration: 0.8 },
      trigger: { start: "top 80%", once: true },
    },
  ],
};

test("motion compile writes out/ into the cwd, not into the package path", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ms-cli-"));
  const unique = "cli-cwd-" + Date.now();
  fs.writeFileSync(path.join(tmp, unique + ".json"), JSON.stringify(VALID_SPEC));

  execFileSync("node", [bin, "compile", unique + ".json"], { cwd: tmp, stdio: "pipe" });

  // ends up in the user's cwd
  assert.ok(
    fs.existsSync(path.join(tmp, "out", unique + ".motion.js")),
    "artifact is missing from the working directory (out/)"
  );
  // does NOT write into the package path
  assert.ok(
    !fs.existsSync(path.join(repoRoot, "out", unique + ".motion.js")),
    "artifact was wrongly written into the package path"
  );

  fs.rmSync(tmp, { recursive: true, force: true });
});
