#!/usr/bin/env node
"use strict";
/*
 * Promote gate (building block 2) — the gauntlet around the existing gates.
 * ----------------------------------------------------------------------
 *   node bin/promote-gate.js <name> [--prepare] [--no-report] [--budget=N]
 *
 * Reads candidates/<name>/<name>.json + candidates/<name>/example.motionspec.json,
 * runs all gates (each stage fail-closed) and returns a PASS/FAIL report
 * (stdout + candidates/<name>/GATE_REPORT.md).
 *
 *   verify-only (default) : checks, changes NOTHING in primitives/.
 *   --prepare             : on PASS writes the promotion into the working tree
 *                           (copies to primitives/, optionally appends the
 *                           keyword rule) — commits/merges NOTHING (gate 1 = human).
 *
 * ANTI-GOALS (binding):
 *   A2  never promotes to main / never merges — writes at most the working tree.
 *   A4  NO version bump, NO relock in the auto path. The additive-minor property
 *       is ENFORCED by catalog-lock (stage 7 verifies it), not set here.
 *   A6  determinism is sacred — stage 6 rejects non-deterministic output.
 *
 * The testable logic lives in this module (`gate`); the CLI wrapper only calls it.
 *
 * Stages (in this order, all fail-closed except those marked INFO):
 *   1  primitive against the meta-schema (catalog.checkPrimitive) + reducedMotionFallback present
 *   2  validateSpec(example) against the catalog INCLUDING the candidate
 *   3  compileSpec(example) -> ok
 *   4  report.budgetOk === true
 *   5  reduced-motion guard in the artifact (when respectReducedMotion is on)
 *   6  pauseControls (WCAG 2.2.2): infinite/repeat:-1 template MUST be
 *      a11y.persistent; pauseControls-forced compile carries animation-play-state
 *      + data-ms-paused (only checked for persistent primitives; else INFO)
 *   7  determinism: compile twice -> byte-identical; no non-det. tokens;
 *      golden stable (candidates/<name>/<name>.golden.{js,css}) — if missing -> created only with --prepare
 *   8  catalog-lock classification: hypothetically added -> `added`/minor, NO violations
 *   9  INFO: WAAPI lowering readiness (new primitive without a lowering -> gate-1 human)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { loadCatalog, checkPrimitive, screenPattern } = require("../src/compiler/catalog.js");
const { validateSpec } = require("../src/compiler/validate.js");
const { compileSpec } = require("../src/compiler/compile.js");
const { snapshotCatalog, diffCatalog } = require("../src/compiler/catalog-semver.js");
const { SUPPORTED, lowerWaapi } = require("../src/compiler/lower-waapi.js");

/* Valid catalog/candidate name (identical to generate.slugName + catalog NAME_RE).
 * Checked BEFORE any file access -> no path traversal via `name`. */
const NAME_RE = /^[A-Za-z][A-Za-z0-9]{1,40}$/;

/* Normalize the version banner — goldens must not break on every version bump. */
const normVer = (s) => String(s == null ? "" : s).replace(/MotionSpec-Compiler v[0-9]+\.[0-9]+\.[0-9]+/g, "MotionSpec-Compiler vX");

/* Tokens that betray non-deterministic runtime output (anti-goal A6).
 * IMPORTANT: a denylist can NEVER be complete — it is a strong net,
 * NOT the sole proof. Determinism is also a gate-1 human duty.
 * Covers common forms incl. bracket access (Math[...]) and bare Date(). */
const NONDETERMINISTIC_RE = new RegExp([
  "Math\\s*\\.\\s*random", "Math\\s*\\[",
  "Date\\s*\\.\\s*(now|parse|UTC)", "new\\s+Date", "\\bDate\\s*\\(",
  "performance\\s*\\.\\s*(now|timeOrigin)",
  "crypto\\s*\\.\\s*(randomUUID|getRandomValues)", "getRandomValues",
  "hrtime", "process\\s*\\.\\s*hrtime",
].join("|"), "i");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function reducedMotionFallbackOf(prim) {
  if (!prim || typeof prim !== "object") return null;
  if (prim.a11y && prim.a11y.reducedMotionFallback) return prim.a11y.reducedMotionFallback;
  if (prim.reducedMotionFallback) return prim.reducedMotionFallback; // also accept the skeleton form (top-level)
  return null;
}

/**
 * @typedef {Object} GateCheck
 * @property {string} label
 * @property {boolean} ok
 * @property {string} [detail]
 * @property {boolean} [info]  - true: a finding that does NOT block the PASS (gate-1 human)
 */

/**
 * Runs the gauntlet for a candidate. Changes nothing except, optionally,
 * GATE_REPORT.md and (only with prepare) the working tree.
 * @param {string} name
 * @param {{root?:string,candidatesDir?:string,primitivesDir?:string,lockPath?:string,prepare?:boolean,write?:boolean,budget?:number}} [opts]
 * @returns {{pass:boolean, checks:GateCheck[], reportPath:string|null}}
 */
function gate(name, opts = {}) {
  const root = opts.root || ROOT;
  const candidatesDir = opts.candidatesDir || path.join(root, "candidates");
  const primitivesDir = opts.primitivesDir || path.join(root, "primitives");
  const lockPath = opts.lockPath || path.join(root, "catalog.lock.json");
  const write = opts.write !== false;
  const prepare = !!opts.prepare;
  const budget = typeof opts.budget === "number" ? opts.budget : 10;

  const checks = [];
  const must = (label, ok, detail) => { checks.push({ label, ok: !!ok, detail: detail || "" }); return !!ok; };
  const info = (label, ok, detail) => { checks.push({ label, ok: !!ok, detail: detail || "", info: true }); };

  /* --- Stage 0: name format (fail-closed BEFORE any fs access -> no path traversal) --- */
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    checks.push({ label: "0 name format valid", ok: false, detail: 'name "' + String(name).slice(0, 80) + '" violates ' + NAME_RE });
    return { pass: false, checks, reportPath: null }; // NOT finalize() -> no mkdir/write outside candidates/
  }
  const dir = path.join(candidatesDir, name);

  /* --- Load inputs (fail-closed) --- */
  const primFile = path.join(dir, name + ".json");
  const exFile = path.join(dir, "example.motionspec.json");
  let prim, example;
  try { prim = readJson(primFile); }
  catch (e) {
    must("candidate primitive readable", false, primFile + ": " + e.message);
    return finalize(dir, checks, false, write, false, null, null, primitivesDir);
  }
  try { example = readJson(exFile); }
  catch (e) {
    must("example spec readable", false, exFile + ": " + e.message);
    return finalize(dir, checks, false, write, false, null, null, primitivesDir);
  }

  /* Catalog INCLUDING the candidate (in-memory overlay; primitives/ is NOT touched). */
  let base;
  try { base = loadCatalog(primitivesDir); }
  catch (e) {
    must("base catalog loads", false, e.message);
    return finalize(dir, checks, false, write, false, prim, example, primitivesDir);
  }
  const overlaid = Object.assign({}, base, { [prim.name]: prim });
  const isNewName = !Object.prototype.hasOwnProperty.call(base, prim.name);

  /* --- Stage 1: meta-schema + reducedMotionFallback --- */
  let metaOk = true;
  try { checkPrimitive(prim, name); }
  catch (e) { metaOk = false; must("1 meta schema (checkPrimitive)", false, e.message); }
  if (metaOk) must("1 meta schema (checkPrimitive)", true, "name/version/output/template/paramSchema valid");
  must("1 reducedMotionFallback present", !!reducedMotionFallbackOf(prim),
    reducedMotionFallbackOf(prim) || "missing — a11y.reducedMotionFallback is mandatory");
  must("1 name == prim.name", prim.name === name, prim.name === name ? "" : 'file basename "' + name + '" != prim.name "' + prim.name + '"');
  /* Determinism screen already on the RAW template (catches entropy that
   * interpolation could obscure — compile renders the template 1:1). */
  const tplND = NONDETERMINISTIC_RE.exec(String(prim.template || ""));
  must("1 no non-det. tokens in the template", !tplND, tplND ? ('template contains "' + tplND[0] + '" (anti-goal A6)') : "");

  /* --- Stage 2: validateSpec --- */
  const v = validateSpec(example, overlaid);
  must("2 validateSpec(example)", v.ok, (v.errors || []).join(" | "));

  /* --- Stages 3 + 4: compile + budget --- */
  const c = v.ok ? compileSpec(example, overlaid, { specName: name, budget }) : { ok: false, errors: ["skipped: validate failed"] };
  must("3 compileSpec(example) ok", c.ok, c.ok ? "" : (c.errors || []).join(" | "));
  must("4 report.budgetOk", c.ok && c.report && c.report.budgetOk === true,
    c.ok && c.report ? ("cost " + c.report.cost + " / " + c.report.budget) : "no report");

  /* --- Stage 5: reduced-motion guard in the artifact — RRM FORCED, INDEPENDENT of the example ---
   * The example must not control whether its own a11y gate fires: we compile
   * an RRM-on variant and require the guard. The example's opt-out stays INFO only. */
  const artifact = c.ok ? ((c.js || "") + "\n" + (c.css || "")) : "";
  const forcedExample = Object.assign({}, example, { globals: Object.assign({}, example.globals, { respectReducedMotion: true }) });
  const cForced = compileSpec(forcedExample, overlaid, { specName: name, budget });
  const forcedArtifact = cForced.ok ? ((cForced.js || "") + "\n" + (cForced.css || "")) : "";
  must("5 reduced-motion guard in the artifact (RRM enforced)",
    cForced.ok && forcedArtifact.includes("prefers-reduced-motion"),
    cForced.ok ? "" : "no compile output with respectReducedMotion enforced");
  if (example.globals && example.globals.respectReducedMotion === false)
    info("5 example turns RRM off", true, "example opt-out — the gate verifies the guard independently (RRM enforced); intent is checked at gate 1");

  /* --- Stage 6 (pauseControls / WCAG 2.2.2): by-construction pause path ---
   * Mirrors Stage 5's "the example must not steer its own gate" pattern.
   *   (a) A primitive whose TEMPLATE runs forever (`infinite` or `repeat: -1`)
   *       MUST declare a11y.persistent===true — otherwise the compiler emits no
   *       pause path for a >5s loop (2.2.2 hole). Fail-closed.
   *   (b) With pauseControls FORCED to "auto" (independent of the example), the
   *       artifact of a persistent primitive MUST carry both the CSS pause state
   *       (`animation-play-state`) and the toggle contract (`data-ms-paused`). */
  const tpl = String(prim.template || "");
  const isPersistentTemplate = /\binfinite\b/.test(tpl) || /repeat\s*:\s*-1/.test(tpl);
  const declaredPersistent = !!(prim.a11y && prim.a11y.persistent === true);
  if (isPersistentTemplate) {
    must("6 persistent template declares a11y.persistent", declaredPersistent,
      declaredPersistent ? "" : "template runs 'infinite'/'repeat:-1' but a11y.persistent!==true — WCAG 2.2.2 pause path would not be emitted");
    /* Force pauseControls:auto so the example cannot opt its own gate out. */
    const pausedExample = Object.assign({}, example, {
      globals: Object.assign({}, example.globals, { respectReducedMotion: true, pauseControls: "auto" }),
    });
    const cPause = compileSpec(pausedExample, overlaid, { specName: name, budget });
    const pauseArtifact = cPause.ok ? ((cPause.js || "") + "\n" + (cPause.css || "")) : "";
    must("6 pause path in the artifact (pauseControls enforced)",
      cPause.ok && pauseArtifact.includes("animation-play-state") && pauseArtifact.includes("data-ms-paused"),
      cPause.ok ? "" : "no compile output with pauseControls enforced");
  } else {
    info("6 pauseControls not applicable", true, "template is not an infinite/repeat:-1 loop — no pause path required");
  }

  /* --- Stage 7 (determinism + golden) — was Stage 6; renumbered for the
   * pauseControls stage above. --- */
  if (c.ok) {
    const c2 = compileSpec(example, overlaid, { specName: name, budget });
    const deterministic = c2.ok && c2.js === c.js && c2.css === c.css;
    /* NOTE: the compiler is a pure function -> this check is a REGRESSION
     * GUARD (catches a compiler that turns impure in the future), NOT a proof of
     * runtime determinism. The latter comes from the token screen (stages 1+7) + goldens. */
    must("7 compiler determinism (regression guard)", deterministic, deterministic ? "" : "output varies between two runs — compiler no longer pure");
    const nd = NONDETERMINISTIC_RE.exec(artifact);
    must("7 no non-det. tokens in the output", !nd, nd ? ('output contains "' + nd[0] + '" (anti-goal A6)') : "");

    const goldenJs = path.join(dir, name + ".golden.js");
    const goldenCss = path.join(dir, name + ".golden.css");
    const haveJs = fs.existsSync(goldenJs);
    const haveCss = fs.existsSync(goldenCss);
    if (!haveJs && !haveCss) {
      if (prepare) {
        if (c.js != null) fs.writeFileSync(goldenJs, normVer(c.js));
        if (c.css != null) fs.writeFileSync(goldenCss, normVer(c.css));
        info("7 golden created", true, "candidates/" + name + "/" + name + ".golden.* (--prepare)");
      } else {
        info("7 golden missing", true, "created with --prepare; for now only determinism is checked");
      }
    } else {
      let stable = true; const why = [];
      if (haveJs) { const g = fs.readFileSync(goldenJs, "utf8"); if (normVer(c.js) !== g) { stable = false; why.push("js deviates"); } }
      if (haveCss) { const g = fs.readFileSync(goldenCss, "utf8"); if (normVer(c.css) !== g) { stable = false; why.push("css deviates"); } }
      must("7 golden byte-stable", stable, why.join("; "));
    }
  } else {
    must("7 determinism", false, "no compile output to check");
  }

  /* --- Stage 8: catalog-lock classification (additive minor) --- */
  try {
    const lock = readJson(lockPath).primitives;
    const current = snapshotCatalog(overlaid);
    const { violations, added } = diffCatalog(lock, current);
    const noViolations = violations.length === 0;
    const classedMinor = isNewName ? added.includes(prim.name) : true; // already locked -> no new add, but no violation = ok
    must("8 catalog-lock: no SemVer violations", noViolations, violations.map((x) => x.msg).join(" | "));
    must("8 catalog-lock: additive minor", classedMinor,
      isNewName ? ("expected in added[], was: " + JSON.stringify(added)) : "already in the lock (re-promotion) — no violation required");
  } catch (e) {
    must("8 catalog-lock classification", false, e.message);
  }

  /* --- Stage 9: INFO — WAAPI lowering readiness --- */
  if (Array.isArray(SUPPORTED) && SUPPORTED.includes(prim.name)) {
    let lowered = false; let detail;
    try {
      const r1 = lowerWaapi(example, overlaid, { specName: name });
      const r2 = lowerWaapi(example, overlaid, { specName: name });
      lowered = r1.ok && r2.ok && (r1.js || r1.css) === (r2.js || r2.css);
      detail = r1.ok ? "lowering deterministic" : (r1.errors || []).join(" | ");
    } catch (e) { detail = e.message; }
    info("9 WAAPI lowering present", lowered, detail);
  } else {
    info("9 WAAPI lowering", true,
      "new primitive without a lowering — waapi-lowering.test.js turns red in CI (SUPPORTED != catalog). " +
      "That is the gate-1 escalation: a human adds lowering+golden, not the forge (anti-goal A5).");
  }

  const pass = checks.filter((x) => !x.info).every((x) => x.ok);
  return finalize(dir, checks, pass, write, prepare, prim, example, primitivesDir, isNewName);
}

/* Writes the report and (only on PASS+prepare) performs the promotion. */
function finalize(dir, checks, pass, write, prepare, prim, example, primitivesDir) {
  const name = path.basename(dir);
  let reportPath = null;
  if (write) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      reportPath = path.join(dir, "GATE_REPORT.md");
      fs.writeFileSync(reportPath, renderReport(name, checks, pass, prepare && pass));
    } catch { /* writing the report must not flip the verdict */ }
  }
  if (pass && prepare && prim) {
    preparePromotion(name, prim, dir, primitivesDir);
  }
  return { pass, checks, reportPath };
}

/* preparePromotion: writes ONLY into the working tree. NO git, NO relock, NO
 * version bump (anti-goal A4 — catalog-lock enforces the minor property). */
function preparePromotion(name, prim, dir, primitivesDir) {
  const dest = path.join(primitivesDir, prim.name + ".json");
  fs.writeFileSync(dest, JSON.stringify(prim, null, 2) + "\n");

  // Optional keyword rule: candidates/<name>/keyword-rule.json or prim.keywordRule.
  let rule = null;
  const ruleFile = path.join(dir, "keyword-rule.json");
  if (fs.existsSync(ruleFile)) { try { rule = readJson(ruleFile); } catch { rule = null; } }
  if (!rule && prim.keywordRule) rule = prim.keywordRule;
  if (rule && rule.source && rule.target) {
    try { appendKeywordRule(prim.name, rule, path.join(primitivesDir, "..", "src", "compiler", "keyword-map.js")); }
    catch { /* best-effort: the keyword rule is gate-1 convenience, not a hard gate */ }
  }
}

/* Appends a keyword->primitive rule to KEYWORD_MAP (before the closing `];`).
 * Order is API, so NEW = lower precedence than the specific existing rules,
 * which is correct. Uses the new RegExp(...) form to avoid literal escaping. */
function appendKeywordRule(primitiveName, rule, keywordMapFile) {
  const flags = typeof rule.flags === "string" ? rule.flags : "i";
  // Same ReDoS/length bound as the catalog (catalog.screenPattern): a
  // model-controlled pattern must NEVER land unscreened in runtime source code
  // (the table is executed on untrusted client briefs). Throws on a
  // violation -> the best-effort try/catch in preparePromotion catches it ->
  // the rule is simply NOT appended (fail-closed).
  screenPattern(rule.source, "keywordRule.source", (msg) => { throw new Error(msg); });
  // Additionally check flag validity (screenPattern only tests the pattern):
  RegExp(rule.source, flags);
  const src = fs.readFileSync(keywordMapFile, "utf8");
  const entry =
    "  /* forge: " + primitiveName + " (taste review — human checks order/precedence) */\n" +
    "  { re: new RegExp(" + JSON.stringify(rule.source) + ", " + JSON.stringify(flags) + "), primitive: " +
    JSON.stringify(primitiveName) + ", target: " + JSON.stringify(rule.target) +
    ", params: " + JSON.stringify(rule.params || {}) + " },\n";
  const marker = "];";
  const idx = src.lastIndexOf(marker);
  if (idx === -1) throw new Error("KEYWORD_MAP end not found");
  const out = src.slice(0, idx) + entry + src.slice(idx);
  fs.writeFileSync(keywordMapFile, out);
}

function renderReport(name, checks, pass, promoted) {
  const lines = [];
  lines.push("# Gate report — `" + name + "`");
  lines.push("");
  lines.push("**Verdict: " + (pass ? "PASS" : "FAIL") + "**" + (promoted ? " · promotion prepared in the working tree (`--prepare`)" : ""));
  lines.push("");
  lines.push("> MACHINE-CHECKED. PASS means \"all gates green\", NOT \"approved\". Gate 1 = human taste review (a human merges the PR).");
  lines.push("");
  lines.push("| Stage | OK | Detail |");
  lines.push("| --- | :-: | --- |");
  for (const c of checks) {
    const mark = c.info ? (c.ok ? "i" : "!") : (c.ok ? "PASS" : "FAIL");
    const detail = String(c.detail || "").replace(/\|/g, "\\|").slice(0, 300);
    lines.push("| " + c.label + " | " + mark + " | " + detail + " |");
  }
  lines.push("");
  lines.push("Legend: PASS/FAIL = fail-closed gate · i/! = INFO (does not block PASS; note for gate 1).");
  lines.push("");
  return lines.join("\n");
}

module.exports = { gate, preparePromotion, appendKeywordRule, renderReport, reducedMotionFallbackOf };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const name = argv.find((a) => !a.startsWith("--"));
  if (!name) { console.error("Usage: node bin/promote-gate.js <name> [--prepare] [--no-report]"); process.exit(2); }
  const budgetArg = argv.find((a) => a.startsWith("--budget="));
  const r = gate(name, {
    prepare: flags.has("--prepare"),
    write: !flags.has("--no-report"),
    budget: budgetArg ? Number(budgetArg.split("=")[1]) : undefined,
  });
  console.log("\n  Promote gate — " + name + "\n");
  for (const c of r.checks) {
    const mark = c.info ? (c.ok ? "i" : "!") : (c.ok ? "OK" : "x ");
    console.log("   " + mark + "  " + c.label + (c.detail ? "  — " + c.detail : ""));
  }
  console.log("\n  " + (r.pass ? "PASS" : "FAIL") + (r.reportPath ? "  (" + path.relative(process.cwd(), r.reportPath) + ")" : "") + "\n");
  if (!r.pass) process.exitCode = 1;
}
