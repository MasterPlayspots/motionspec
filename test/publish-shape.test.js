"use strict";
/*
 * publish-shape.test.js
 * ---------------------
 * Machine-checks the publish shape of the npm package:
 *   1. `npm pack --dry-run` yields EXACTLY the approved file list —
 *      dev/CI scripts (assert-canonical, worker-smoke, sbom-check,
 *      license-check, catalog-lock, forge) must NEVER silently ship again
 *      (scanner flags: shell/network/env access on the package itself).
 *   2. Self-containedness: the real tarball, unpacked into an empty tmp
 *      directory, must load `src/forge/generate.js` WITHOUT node_modules —
 *      guards the require edge generate.js -> bin/promote-gate.js.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

/* The approved publish shape (67 files, sorted). Every change here
 * is a deliberate decision about the package's attack surface. */
const EXPECTED_FILES = [
  "LICENSE",
  "README.md",
  "bin/motion.js",
  "bin/promote-gate.js",
  "catalog.lock.json",
  "package.json",
  "primitives/bounceLoop.json",
  "primitives/breatheLoop.json",
  "primitives/counterUp.json",
  "primitives/cssTransition.json",
  "primitives/fadeOnScroll.json",
  "primitives/flipLoop.json",
  "primitives/flipReveal.json",
  "primitives/floatLoop.json",
  "primitives/glideLoop.json",
  "primitives/hoverExpand.json",
  "primitives/hoverFlip.json",
  "primitives/hoverGrow.json",
  "primitives/hoverLift.json",
  "primitives/hoverRotate.json",
  "primitives/hoverSink.json",
  "primitives/hoverSkew.json",
  "primitives/hoverSpin.json",
  "primitives/jelloLoop.json",
  "primitives/kenBurns.json",
  "primitives/marquee.json",
  "primitives/marqueeVertical.json",
  "primitives/parallaxLayer.json",
  "primitives/parallaxX.json",
  "primitives/pinnedSection.json",
  "primitives/pressShrink.json",
  "primitives/pulseLoop.json",
  "primitives/revealScale.json",
  "primitives/rotateOnScroll.json",
  "primitives/scaleOnScroll.json",
  "primitives/scrollReveal.json",
  "primitives/skewOnScroll.json",
  "primitives/spinLoop.json",
  "primitives/squashLoop.json",
  "primitives/staggerReveal.json",
  "primitives/stretchLoop.json",
  "primitives/swayLoop.json",
  "primitives/swingLoop.json",
  "primitives/teeterLoop.json",
  "primitives/tiltLoop.json",
  "primitives/wobbleLoop.json",
  "schema/motionspec.schema.json",
  "src/audit/audit.js",
  "src/compiler/catalog-semver.js",
  "src/compiler/catalog.js",
  "src/compiler/compile.js",
  "src/compiler/keyword-map.js",
  "src/compiler/lower-waapi.js",
  "src/compiler/safety.js",
  "src/compiler/validate.js",
  "src/demo/build-demo.js",
  "src/discover/discover.js",
  "src/forge/generate.js",
  "src/forge/prioritize.js",
  "src/mcp/register-tools.js",
  "src/mcp/server.mjs",
  "src/router/cache.js",
  "src/router/clients.js",
  "src/router/prompt.js",
  "src/router/route.js",
  "src/router/telemetry-sink.js",
  "src/router/telemetry.js",
];

const DEV_SCRIPT_RE =
  /assert-canonical|worker-smoke|sbom-check|license-check|catalog-lock\.js|bin\/forge\.js/;

function packedFileList() {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(out)[0].files.map((f) => f.path).sort();
}

test("publish shape: npm pack yields exactly the approved file list", () => {
  const files = packedFileList();
  assert.deepEqual(files, EXPECTED_FILES);
});

test("publish shape: no dev/CI script in the tarball", () => {
  const offenders = packedFileList().filter((f) => DEV_SCRIPT_RE.test(f));
  assert.deepEqual(offenders, [], `dev scripts in tarball: ${offenders.join(", ")}`);
});

test("self-containedness: unpacked tarball loads generate.js without node_modules", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ms-publish-shape-"));
  try {
    const packOut = execFileSync(
      "npm",
      ["pack", "--json", "--pack-destination", tmp],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
    );
    const tarball = path.join(tmp, JSON.parse(packOut)[0].filename);
    execFileSync("tar", ["-xzf", tarball, "-C", tmp], { encoding: "utf8" });

    const entry = path.join(tmp, "package", "src", "forge", "generate.js");
    // Must load without node_modules — guards generate.js -> bin/promote-gate.js.
    execFileSync(process.execPath, ["-e", `require(${JSON.stringify(entry)})`], {
      cwd: tmp,
      encoding: "utf8",
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
