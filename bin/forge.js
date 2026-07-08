#!/usr/bin/env node
"use strict";
/*
 * Forge CLI (building block 4) — subcommands like bin/motion.js.
 * ----------------------------------------------------------------------
 *   node bin/forge.js queue                       prioritized build queue (from forge.gaps.json)
 *   node bin/forge.js next                         top gap
 *   node bin/forge.js generate "<gapKey>" [--mock] [--emit-name]
 *                                                  create a candidate from a gap
 *   node bin/forge.js verify <name>                promote-gate verify-only
 *
 * Gap source: forge.gaps.json (optional) — either an array of discover gaps
 *   [{ what, target }]  OR  { gaps:[...], telemetry:[{pattern,count}] }.
 * Without --mock, generate needs a model (MOTION_API_KEY / MOTION_MODEL).
 *
 * ANTI-GOALS: creates ONLY candidates + PR material; NEVER promotes/publishes/deploys.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { prioritize } = require("../src/forge/prioritize.js");
const { generate } = require("../src/forge/generate.js");
const { gate } = require("./promote-gate.js");
const { mockForgeClient, openAICompatClient } = require("../src/router/clients.js");

function loadGaps() {
  const f = path.join(ROOT, "forge.gaps.json");
  if (!fs.existsSync(f)) return { gaps: [], telemetry: [] };
  let data;
  try { data = JSON.parse(fs.readFileSync(f, "utf8")); }
  catch (e) { console.error("forge.gaps.json not valid JSON: " + e.message); return { gaps: [], telemetry: [] }; }
  if (Array.isArray(data)) return { gaps: data, telemetry: [] };
  return { gaps: data.gaps || [], telemetry: data.telemetry || [] };
}

function queue() {
  const { gaps, telemetry } = loadGaps();
  return prioritize(gaps, telemetry);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const arg = argv.slice(1).find((a) => !a.startsWith("--"));
  const emitName = flags.has("--emit-name");

  if (cmd === "queue") {
    const q = queue();
    if (!q.length) { console.log("Queue empty (forge.gaps.json missing or no gaps)."); return; }
    console.log("\n  Forge queue (" + q.length + " patterns, score-descending):\n");
    q.forEach((e, i) => console.log("   " + (i + 1) + ". " + e.pattern + "  [score " + e.score + ", exemplars: " + (e.exemplars.join(", ") || "—") + "]"));
    console.log("");
    return;
  }

  if (cmd === "next") {
    const q = queue();
    if (!q.length) { if (!emitName) console.log("Queue empty."); process.exitCode = 1; return; }
    if (emitName) console.log(q[0].gapKey);
    else console.log("\n  Next gap: " + q[0].pattern + "  [score " + q[0].score + "]\n");
    return;
  }

  if (cmd === "verify") {
    if (!arg) { console.error("Usage: node bin/forge.js verify <name>"); process.exit(2); }
    const r = gate(arg, { write: !flags.has("--no-report") });
    if (!emitName) {
      console.log("\n  Verify — " + arg + "\n");
      for (const c of r.checks) console.log("   " + (c.info ? (c.ok ? "i" : "!") : (c.ok ? "OK" : "x ")) + "  " + c.label + (c.detail ? "  — " + c.detail : ""));
      console.log("\n  " + (r.pass ? "PASS" : "FAIL") + "\n");
    }
    if (!r.pass) process.exitCode = 1;
    return;
  }

  if (cmd === "generate") {
    // Determine the gap: an explicit gapKey OR the top of the queue.
    let gap = arg;
    if (!gap) {
      const q = queue();
      if (!q.length) { if (!emitName) console.error("No gap given and queue empty."); process.exitCode = 1; return; }
      gap = q[0]; // prioritize entry (has what/pattern/exemplars)
    }
    const client = flags.has("--mock") ? mockForgeClient() : openAICompatClient();
    let res;
    try { res = await generate(gap, { client }); }
    catch (e) { if (!emitName) console.error("generate failed: " + e.message); process.exitCode = 1; return; }

    if (res.ok) {
      if (emitName) console.log(res.name);
      else console.log("\n  Candidate created: " + path.relative(process.cwd(), res.candidatePath) + "  (gauntlet GREEN — taste review pending)\n");
      return;
    }
    // Escalation: no PR-ready candidate.
    if (!emitName) console.error("\n  ESCALATED" + (res.name ? " (" + res.name + ")" : "") + ": " + (res.reason || "—") + "\n");
    process.exitCode = 1;
    return;
  }

  console.error("Commands: queue | next | generate <gapKey> [--mock] [--emit-name] | verify <name>");
  process.exit(2);
}

main().catch((e) => { console.error("Error: " + e.message); process.exit(1); });
