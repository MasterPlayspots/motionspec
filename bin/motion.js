#!/usr/bin/env node
"use strict";
/*
 * MotionSpec CLI
 *
 *   node bin/motion.js compile <spec.json>             spec -> code (out/)
 *   node bin/motion.js route   "<request>" [--mock]    request -> spec (out/)
 *   node bin/motion.js pipeline "<request>" [--mock]   request -> spec -> code
 *   node bin/motion.js catalog                          list the primitives
 *   node bin/motion.js stats                            telemetry summary
 *   node bin/motion.js audit   <url> [--json]           motion-a11y checker (static)
 *
 * Without --mock, route/pipeline use an OpenAI-compatible endpoint
 * (MOTION_BASE_URL, MOTION_MODEL, MOTION_API_KEY/OPENROUTER_API_KEY).
 */
const fs = require("fs");
const path = require("path");
const { loadCatalog, catalogVersion } = require("../src/compiler/catalog.js");
const { compileSpec } = require("../src/compiler/compile.js");
const { route } = require("../src/router/route.js");
const { mockClient, openAICompatClient } = require("../src/router/clients.js");
const telemetry = require("../src/router/telemetry.js");

/* Output relative to the user's working directory, NOT to the package path.
 * Otherwise the installed bin writes into node_modules/motionspec/out (a global
 * install risks EACCES) and the user cannot find their artifacts. */
const OUT = path.join(process.cwd(), "out");

function writeOut(name, result) {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const written = [];
  if (result.js) { fs.writeFileSync(path.join(OUT, name + ".motion.js"), result.js); written.push("out/" + name + ".motion.js"); }
  if (result.css) { fs.writeFileSync(path.join(OUT, name + ".motion.css"), result.css); written.push("out/" + name + ".motion.css"); }
  return written;
}

function printReport(r, written) {
  console.log("  Compiled              : " + r.motions + " motions  (js: " + r.jsCount + ", css: " + r.cssCount + ")");
  console.log("  Reduced-motion guard  : " + (r.reducedMotion ? "active" : "OFF"));
  console.log("  Performance budget    : " + r.cost + " / " + r.budget + "  - " + (r.budgetOk ? "OK" : "EXCEEDED"));
  if (written.length) console.log("  Output                : " + written.join(", "));
}

async function main() {
  /* Audit finding #4: parse flags position-independently. */
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const arg = argv.slice(1).find((a) => !a.startsWith("--"));
  const catalog = loadCatalog();

  if (cmd === "catalog") {
    console.log("Catalog version: " + catalogVersion(catalog));
    Object.keys(catalog).sort().forEach((n) => {
      const p = catalog[n];
      console.log("  " + n + " v" + p.version + "  [" + p.engine + ", cost " + ((p.performance && p.performance.cost) || 0) + "]  " + p.purpose);
    });
    return;
  }

  if (cmd === "demo") {
    const { buildDemo } = require("../src/demo/build-demo.js");
    const r = buildDemo(path.join(OUT, "demo"));
    console.log("\n  Demo page: out/demo/index.html  (" + r.primitives + " primitives, " + r.motions + " motions, budget " + r.report.cost + "/" + r.report.budget + ")\n");
    return;
  }

  if (cmd === "discover") {
    if (!arg) { console.error('Usage: motion discover <brief.json>  (S2-01 gap report)'); process.exit(2); }
    const { discover, toMarkdown } = require("../src/discover/discover.js");
    let brief;
    try { brief = JSON.parse(fs.readFileSync(arg, "utf8")); }
    catch (e) { console.error("Brief not readable or not valid JSON: " + e.message); process.exit(2); }
    const r = discover(brief);
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
    const md = path.join(OUT, "gap-report-" + (r.project || "discovery") + ".md");
    fs.writeFileSync(md, toMarkdown(r));
    console.log("\n  Discovery: " + r.covered.length + "/" + r.total + " covered, " + r.gaps.length + " gap(s)  ->  " + path.relative(process.cwd(), md) + "\n");
    return;
  }

  if (cmd === "stats") {
    const s = await telemetry.summary();
    console.log("Telemetry: " + s.total + " events");
    Object.keys(s.byOutcome).forEach((k) => console.log("  " + k + ": " + s.byOutcome[k]));
    return;
  }

  if (cmd === "audit") {
    if (!arg) { console.error("Usage: motion audit <url> [--json]"); process.exit(2); }
    const { audit } = require("../src/audit/audit.js");
    const res = await audit(arg);
    /* ONE telemetry data point per run (a11y-checker usage signal). No URL/PII. */
    telemetry.log({ outcome: res.ok ? "audit-ok" : "audit-fail", model: "cli-audit", attempts: 1 });
    if (!res.ok) {
      console.error("Audit failed: " + res.error);
      process.exit(1);
    }
    if (flags.has("--json")) {
      /* keep the JSON payload lean — the Markdown report is a separate view */
      const json = { ok: res.ok, url: res.url, score: res.score, badge: res.badge, findings: res.findings, summary: res.summary, disclosures: res.disclosures };
      console.log(JSON.stringify(json, null, 2));
    } else {
      console.log(res.markdown);
    }
    return;
  }

  if (cmd === "compile") {
    if (!arg) { console.error("Usage: motion compile <spec.json>"); process.exit(2); }
    let spec;
    try { spec = JSON.parse(fs.readFileSync(arg, "utf8")); }
    catch (e) { console.error("Spec not readable or not valid JSON: " + e.message); process.exit(2); }
    const name = path.basename(arg).replace(/\.(motionspec\.)?json$/, "");
    const res = compileSpec(spec, catalog, { specName: path.basename(arg) });
    console.log("\n  MotionSpec-Compiler v" + require("../package.json").version + "  |  Catalog: " + Object.keys(catalog).length + " primitives\n");
    if (!res.ok) {
      console.log("  REJECTED by the Trust Boundary - no output produced:\n");
      res.errors.forEach((e) => console.log("     x  " + e));
      console.log("");
      process.exit(1);
    }
    console.log("  Trust Boundary : passed - spec is valid.\n");
    printReport(res.report, writeOut(name, res));
    console.log("");
    return;
  }

  if (cmd === "route" || cmd === "pipeline") {
    if (!arg) { console.error('Usage: motion ' + cmd + ' "<request>" [--mock]'); process.exit(2); }
    const client = flags.has("--mock") ? mockClient() : openAICompatClient();
    console.log("\n  Routing (stage A)  |  Model: " + client.name);
    const r = await route(arg, { client, catalog, noCache: flags.has("--no-cache") });
    if (!r.ok) {
      console.log("  ESCALATION -> +1  (" + r.reason + ")");
      if (r.errors) r.errors.forEach((e) => console.log("     x  " + e));
      console.log("");
      process.exit(3);
    }
    console.log("  Spec created  : source " + r.source + ", " + r.attempts + " attempt(s), " + r.ms + " ms");
    const name = "request-" + Date.now();
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
    const specFile = path.join(OUT, name + ".motionspec.json");
    fs.writeFileSync(specFile, JSON.stringify(r.spec, null, 2));
    console.log("  Spec          : out/" + path.basename(specFile));
    if (cmd === "pipeline") {
      const res = compileSpec(r.spec, catalog, { specName: name });
      if (!res.ok) { res.errors.forEach((e) => console.log("     x  " + e)); process.exit(1); }
      printReport(res.report, writeOut(name, res));
    }
    console.log("");
    return;
  }

  console.error("Commands: compile | route | pipeline | audit | demo | catalog | stats");
  process.exit(2);
}

main().catch((e) => { console.error("Error: " + e.message); process.exit(1); });
