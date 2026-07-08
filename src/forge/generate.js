"use strict";
/*
 * Forge generator (building block 4) — the LLM-assisted head, built last.
 * ----------------------------------------------------------------------
 * generate(gap, opts) -> { ok:true, name, candidatePath } | { escalate:true, name, checks }
 *
 * Builds a candidate bundle (candidates/<name>/) from a prioritized gap,
 * has the gauntlet (building block 2) verify it, repairs EXACTLY ONCE on
 * failure and then escalates — forces nothing (anti-goal A5). NEVER promotes
 * (anti-goal A2): it only writes candidates/, never calls gate(--prepare).
 *
 * The generator OWNS the name (canonicalizes it) so prim.name === folder name
 * (gate stage 1). The trust boundary + the gauntlet are the truth; the model
 * is only a proposal.
 */
const fs = require("fs");
const path = require("path");
const { loadCatalog, catalogSummary } = require("../compiler/catalog.js");
const { extractJson } = require("../router/route.js");
const { openAICompatClient } = require("../router/clients.js");
const { gate } = require("../../bin/promote-gate.js");

const ROOT = path.join(__dirname, "..", "..");
const NAME_RE = /^[A-Za-z][A-Za-z0-9]{1,40}$/;

/** Robust: intent text of a gap (string | discover gap | prioritize entry). */
function intentOf(gap) {
  if (typeof gap === "string") return gap;
  if (!gap || typeof gap !== "object") return "";
  return gap.what || gap.intent || gap.pattern || gap.gapKey || "";
}
function exemplarOf(gap) {
  if (!gap || typeof gap !== "object") return null;
  if (gap.target) return gap.target;
  if (Array.isArray(gap.exemplars) && gap.exemplars.length) return gap.exemplars[0];
  return null;
}

/** Canonicalizes a proposal into a valid, new camelCase catalog name. */
function slugName(text) {
  const words = String(text || "").replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "genPrimitive";
  let n = words[0].toLowerCase() + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
  if (/^[0-9]/.test(n)) n = "x" + n;
  n = n.slice(0, 40);
  return NAME_RE.test(n) ? n : "genPrimitive";
}

function buildSystemPrompt(catalog) {
  return [
    "You design ONE new MotionSpec primitive for a motion intent that the current catalog does NOT cover.",
    "You output ONLY a single JSON object. No Markdown, no text before/after it.",
    "",
    "Schema of the JSON object:",
    JSON.stringify({
      name: "camelCase, [A-Za-z][A-Za-z0-9]{1,40}",
      version: "1.0.0",
      output: "js | css",
      engine: "e.g. gsap.ScrollTrigger",
      purpose: "one sentence",
      cost: "integer 1..3 (performance cost)",
      reducedMotionFallback: "e.g. instant-visible",
      paramSchema: { "<param>": { type: "number|string|boolean|transform", required: "bool?", default: "?", min: "num?", max: "num?", pattern: "regex?" } },
      triggerDefaults: { start: "top 80%", once: true },
      template: "{{...}} template; ONLY compositor-friendly transforms (opacity/x/y/scale/rotation); NO Math.random/Date.now/new Date",
      exampleSpec: { specVersion: "1.0", meta: { project: "x", target: "vanilla-gsap" }, globals: { respectReducedMotion: true }, motions: [{ id: "m1", primitive: "<name>", target: ".sel", params: {} }] },
      keywordRule: { source: "regex that matches the intent", flags: "i", target: ".sel", params: {} },
    }, null, 1),
    "",
    "HARD RULES:",
    "1. reducedMotionFallback is mandatory. The compiled output carries the prefers-reduced-motion guard (the compiler sets it when the primitive is clean).",
    "2. template lowers to compositor-friendly transforms; NEVER animate layout-driving properties; NEVER non-deterministic tokens.",
    "3. Stay within the performance budget (keep cost small).",
    "4. Do NOT reuse existing catalog names: " + Object.keys(catalog).sort().join(", ") + ".",
    "",
    "CATALOG (context, do NOT copy):",
    JSON.stringify(catalogSummary(catalog), null, 1),
  ].join("\n");
}

function buildUserPrompt(gap) {
  const target = exemplarOf(gap);
  return [
    "Motion intent (catalog gap): " + intentOf(gap),
    target ? "Example target selector: " + target : "No target selector given — choose a plausible one.",
    "Now design the primitive bundle as a single JSON object.",
  ].join("\n");
}

function buildRepairPrompt(gap, badBundleRaw, failedChecks) {
  return [
    "Your previous primitive bundle did NOT pass the gauntlet.",
    "Intent: " + intentOf(gap),
    "Your output was:",
    String(badBundleRaw).slice(0, 4000),
    "Failed gates:",
    ...failedChecks.map((c) => "- " + c.label + (c.detail ? ": " + c.detail : "")),
    "Output the corrected, complete bundle as a single JSON object. JSON only.",
  ].join("\n");
}

/* Builds the candidate files from a (raw) model bundle. The generator
 * canonicalizes name + example spec; the model only supplies raw material. */
function assembleCandidate(bundle, gap) {
  const name = slugName(bundle && bundle.name ? bundle.name : intentOf(gap));
  const cost = Number(bundle && bundle.cost);
  const prim = {
    name,
    version: typeof (bundle && bundle.version) === "string" && /^\d+\.\d+\.\d+$/.test(bundle.version) ? bundle.version : "1.0.0",
    purpose: String((bundle && bundle.purpose) || intentOf(gap) || "").slice(0, 300),
    output: bundle && bundle.output === "css" ? "css" : "js",
    engine: String((bundle && bundle.engine) || "gsap.ScrollTrigger").slice(0, 80),
    paramSchema: (bundle && typeof bundle.paramSchema === "object" && bundle.paramSchema) || {},
    triggerDefaults: (bundle && typeof bundle.triggerDefaults === "object" && bundle.triggerDefaults) || {},
    performance: { verified: false, lcpSafe: true, cost: Number.isFinite(cost) && cost > 0 ? cost : 1 },
    a11y: { reducedMotionFallback: String((bundle && bundle.reducedMotionFallback) || "instant-visible").slice(0, 60) },
    template: String((bundle && bundle.template) || ""),
  };

  // Example spec: adopt the model's proposal, but canonicalize it (fail-safe).
  const ex = (bundle && typeof bundle.exampleSpec === "object" && bundle.exampleSpec) || {};
  const exTarget = exemplarOf(gap) || (Array.isArray(ex.motions) && ex.motions[0] && ex.motions[0].target) || ".target";
  const exParams = (Array.isArray(ex.motions) && ex.motions[0] && ex.motions[0].params) || {};
  const example = {
    specVersion: "1.0",
    meta: { project: name + "-candidate", target: "vanilla-gsap", createdWith: "forge-generate" },
    globals: { respectReducedMotion: true },
    motions: [{ id: name + "-1", primitive: name, target: exTarget, params: exParams }],
  };

  let keywordRule = null;
  if (bundle && bundle.keywordRule && bundle.keywordRule.source) {
    keywordRule = {
      source: String(bundle.keywordRule.source),
      flags: typeof bundle.keywordRule.flags === "string" ? bundle.keywordRule.flags : "i",
      target: String(bundle.keywordRule.target || exTarget),
      params: (typeof bundle.keywordRule.params === "object" && bundle.keywordRule.params) || exParams,
    };
  }
  return { name, prim, example, keywordRule };
}

function writeCandidate(name, parts, gap, modelName, candidatesDir) {
  const dir = path.join(candidatesDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name + ".json"), JSON.stringify(parts.prim, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "example.motionspec.json"), JSON.stringify(parts.example, null, 2) + "\n");
  if (parts.keywordRule) fs.writeFileSync(path.join(dir, "keyword-rule.json"), JSON.stringify(parts.keywordRule, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "NOTES.md"), notesBody(name, gap, modelName, null));
  return dir;
}

function notesBody(name, gap, modelName, escalateChecks) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    "# " + name + " — forge provenance",
    "",
    "**MACHINE-DESIGNED — needs human taste review (gate 1).**",
    "",
    "- Gap (intent): " + intentOf(gap),
    "- Model: " + (modelName || "?"),
    "- Date: " + today,
    "- Created by: `bin/forge.js generate` (building block 4)",
    "",
    "This candidate is NOT promoted. A human reviews taste/design, adds the",
    "WAAPI lowering (+golden) if needed and then merges the PR (gate 1).",
  ];
  if (escalateChecks && escalateChecks.length) {
    lines.push("");
    lines.push("## ESCALATE — needs human design");
    lines.push("The gauntlet stayed red even after one repair attempt:");
    escalateChecks.forEach((c) => lines.push("- " + c.label + (c.detail ? ": " + c.detail : "")));
  }
  return lines.join("\n") + "\n";
}

/**
 * @param {string|object} gap  gap (intent text or discover/prioritize entry)
 * @param {{client?:object, candidatesDir?:string, primitivesDir?:string, lockPath?:string, maxRepairs?:number}} [opts]
 * @returns {Promise<{ok:true,name:string,candidatePath:string}|{escalate:true,name:string|null,checks?:object[],reason?:string}>}
 */
async function generate(gap, opts = {}) {
  const candidatesDir = opts.candidatesDir || path.join(ROOT, "candidates");
  const primitivesDir = opts.primitivesDir || path.join(ROOT, "primitives");
  const lockPath = opts.lockPath || path.join(ROOT, "catalog.lock.json");
  const maxRepairs = typeof opts.maxRepairs === "number" ? opts.maxRepairs : 1;
  const catalog = loadCatalog(primitivesDir);
  const client = opts.client || openAICompatClient();
  const system = buildSystemPrompt(catalog);

  let raw, name = null;
  let lastChecks = [];
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const user = attempt === 0 ? buildUserPrompt(gap) : buildRepairPrompt(gap, raw, lastChecks);
    try { raw = await client.complete(system, user); }
    catch (e) { return { escalate: true, name, reason: "Model transport error: " + String(e.message).slice(0, 200) }; }

    const bundle = extractJson(raw);
    if (!bundle) { lastChecks = [{ label: "JSON parseable", detail: "output was not valid JSON" }]; continue; }
    // Respect the model's self-escalation.
    if (bundle.escalate === true) return { escalate: true, name, reason: bundle.reason || "Model self-escalated." };

    const parts = assembleCandidate(bundle, gap);
    name = parts.name;
    writeCandidate(name, parts, gap, client.name, candidatesDir);

    // Gauntlet — verify-only, NEVER --prepare (anti-goal A2: never promotes).
    const r = gate(name, { candidatesDir, primitivesDir, lockPath, write: true });
    if (r.pass) return { ok: true, name, candidatePath: path.join(candidatesDir, name) };
    lastChecks = r.checks.filter((c) => !c.info && !c.ok);
  }

  // Still red after the repair -> escalate (do not force). Mark the NOTES.
  if (name) {
    try { fs.writeFileSync(path.join(candidatesDir, name, "NOTES.md"), notesBody(name, gap, client.name, lastChecks)); }
    catch { /* writing NOTES must not swallow the escalation */ }
  }
  return { escalate: true, name, checks: lastChecks, reason: "Gauntlet still red after repair." };
}

module.exports = { generate, slugName, assembleCandidate, intentOf, exemplarOf, buildSystemPrompt };
