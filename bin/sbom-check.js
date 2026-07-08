#!/usr/bin/env node
"use strict";
/*
 * SBOM tool (TASK-021, audit finding #13). Zero-dep, CJS.
 *
 * Background: `npm sbom --omit dev` drops 9 runtime packages here
 * (cross-spawn, debug, ms, which, isexe, path-key, shebang-command,
 * shebang-regex, fast-deep-equal) — they hang off the prod tree of
 * @modelcontextprotocol/sdk but, because they are ADDITIONALLY reachable via
 * a dev path (eslint), npm wrongly prunes them. The license gate was
 * therefore incomplete. At the same time the SBOM must not contain pure
 * dev packages (eslint/…) because their licenses would otherwise
 * (rightly) turn the gate red, and they are not shipped.
 *
 * Solution: generate the FULL SBOM and filter it down to the RUNTIME packages
 * (source of truth: package-lock.json, top-level node_modules/* with
 * dev!==true). That yields a complete AND runtime-only SBOM.
 *
 * Modes:
 *   --filter   reads a full CycloneDX SBOM from stdin, writes the
 *              runtime-filtered SBOM to stdout (used by the `sbom` script).
 *   (default)  checks sbom.cdx.json: every runtime package MUST be present
 *              as a component; if one is missing -> list + exit 1, else exit 0.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOCK = path.join(ROOT, "package-lock.json");
const SBOM = path.join(ROOT, "sbom.cdx.json");

/* Runtime packages per the lockfile: top-level node_modules/<name>, dev !== true.
 * Returns a Set of full names (incl. @scope). */
function runtimeNames() {
  const lock = JSON.parse(fs.readFileSync(LOCK, "utf8"));
  const names = new Set();
  for (const key of Object.keys(lock.packages || {})) {
    const m = /^node_modules\/(@[^/]+\/[^/]+|[^/]+)$/.exec(key);
    if (!m) continue;                       // top-level only (no nested duplicates)
    if (lock.packages[key].dev === true) continue;  // omit pure dev packages
    names.add(m[1]);
  }
  return names;
}

/* Full name of a CycloneDX component (npm puts @scope directly into name, but
 * group is taken along defensively in case a generator does split it). */
function compName(c) {
  return c.group ? c.group + "/" + c.name : c.name;
}

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

function filterMode() {
  const full = JSON.parse(readStdin());
  const runtime = runtimeNames();
  const keep = (full.components || []).filter((c) => runtime.has(compName(c)));
  const keptRefs = new Set(keep.map((c) => c["bom-ref"]).filter(Boolean));
  full.components = keep;
  /* Prune the dependency graph to the kept components so no dangling
   * references remain (the root component stays). */
  if (Array.isArray(full.dependencies)) {
    const rootRef = full.metadata && full.metadata.component && full.metadata.component["bom-ref"];
    full.dependencies = full.dependencies
      .filter((d) => d.ref === rootRef || keptRefs.has(d.ref))
      .map((d) => Array.isArray(d.dependsOn)
        ? Object.assign({}, d, { dependsOn: d.dependsOn.filter((r) => r === rootRef || keptRefs.has(r)) })
        : d);
  }
  process.stdout.write(JSON.stringify(full, null, 2) + "\n");
}

function checkMode() {
  if (!fs.existsSync(SBOM)) { console.error("No sbom.cdx.json — run `npm run sbom` first."); process.exit(1); }
  const sbom = JSON.parse(fs.readFileSync(SBOM, "utf8"));
  const present = new Set((sbom.components || []).map(compName));
  const missing = [...runtimeNames()].filter((n) => !present.has(n)).sort();
  if (missing.length) {
    console.error("SBOM incomplete — " + missing.length + " runtime package(s) missing:");
    missing.forEach((n) => console.error("  - " + n));
    console.error("Fix: regenerate with `npm run sbom` (complete runtime SBOM).");
    process.exit(1);
  }
  console.error("SBOM OK — all " + present.size + " components cover the runtime packages.");
}

if (process.argv.includes("--filter")) filterMode();
else checkMode();
