#!/usr/bin/env node
"use strict";
/*
 * Generate reference documentation for the primitive catalog.
 *
 *   node bin/catalog-docs.js
 *
 * Reads every primitives/*.json, validates it through the same fail-closed
 * catalog loader the compiler uses, and emits one Markdown page per primitive
 * plus an index:
 *
 *   docs/primitives/<name>.md   — purpose, output/engine, param schema,
 *                                 a11y fallback, performance, demo
 *   docs/primitives/README.md   — index table of all primitives
 *
 * Generation is deterministic: primitives are processed in name order, object
 * keys are emitted in a fixed order, and no timestamps or environment-specific
 * values are written. Re-running on an unchanged catalog produces byte-identical
 * output, so the generated docs can be committed and checked in CI.
 */
const fs = require("fs");
const path = require("path");
const { loadCatalog } = require("../src/compiler/catalog.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "docs", "primitives");

/* --- small Markdown helpers ------------------------------------------- */

// Escape the characters that would break a Markdown table cell / inline text.
function mdCell(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

// Render a value as inline code, escaping backticks defensively.
function code(value) {
  const s = String(value);
  return "`" + s.replace(/`/g, "​`​") + "`";
}

// Fenced code block with an explicit language for a clean render.
function fence(lang, body) {
  return "```" + lang + "\n" + body + "\n```";
}

/* --- per-primitive page ----------------------------------------------- */

function renderParamSchema(paramSchema) {
  const keys = Object.keys(paramSchema || {}).sort();
  if (keys.length === 0) return "_This primitive takes no parameters._";

  const rows = keys.map((name) => {
    const def = paramSchema[name] || {};
    const type = def.type || "";
    const dflt = def.default !== undefined ? code(def.default) : "—";
    const min = def.min !== undefined ? code(def.min) : "—";
    const max = def.max !== undefined ? code(def.max) : "—";
    const constraint = def.pattern !== undefined
      ? code(def.pattern)
      : (def.required ? "required" : "—");
    return "| " + [code(name), code(type), dflt, min, max, mdCell(constraint)].join(" | ") + " |";
  });

  return [
    "| Parameter | Type | Default | Min | Max | Constraint |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function renderA11y(a11y) {
  const fallback = (a11y && a11y.reducedMotionFallback) || "none-needed";
  const lines = ["- Reduced-motion fallback: " + code(fallback)];
  if (a11y && a11y.persistent) {
    lines.push("- Persistent animation (runs continuously): a WCAG 2.2.2 pause control is enforced by the compiler.");
  }
  return lines.join("\n");
}

function renderPerformance(perf) {
  if (!perf) return "_No performance metadata recorded._";
  const parts = [];
  parts.push("- Verified: " + (perf.verified ? "yes" : "no"));
  parts.push("- LCP-safe: " + (perf.lcpSafe ? "yes" : "no"));
  if (perf.cost !== undefined) parts.push("- Cost budget: " + code(perf.cost));
  if (perf.verifiedAt) parts.push("- Verified at: " + code(perf.verifiedAt));
  return parts.join("\n");
}

function renderTriggerDefaults(triggerDefaults) {
  const keys = Object.keys(triggerDefaults || {}).sort();
  if (keys.length === 0) return null;
  const rows = keys.map((k) => "| " + code(k) + " | " + code(JSON.stringify(triggerDefaults[k])) + " |");
  return ["| Key | Value |", "| --- | --- |", ...rows].join("\n");
}

function renderDemo(demo) {
  if (!demo) return "_No demo defined for this primitive._";
  const blocks = [];
  if (demo.params && Object.keys(demo.params).length > 0) {
    blocks.push("Demo parameters:\n\n" + fence("json", stableJson(demo.params)));
  }
  if (demo.html) {
    blocks.push("Demo markup:\n\n" + fence("html", demo.html));
  }
  return blocks.length ? blocks.join("\n\n") : "_No demo defined for this primitive._";
}

// Deterministic JSON with sorted keys for any object we print.
function stableJson(value) {
  return JSON.stringify(sortValue(value), null, 2);
}
function sortValue(v) {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortValue(v[k]);
    return out;
  }
  return v;
}

function renderPrimitive(p) {
  const out = [];
  out.push("# " + p.name);
  out.push("");
  out.push("> " + (p.purpose || "").trim());
  out.push("");

  out.push("| Field | Value |");
  out.push("| --- | --- |");
  out.push("| Name | " + code(p.name) + " |");
  out.push("| Version | " + code(p.version) + " |");
  out.push("| Output | " + code(p.output) + " |");
  out.push("| Engine | " + code(p.engine || "—") + " |");
  out.push("");

  out.push("## Parameters");
  out.push("");
  out.push(renderParamSchema(p.paramSchema));
  out.push("");

  const trig = renderTriggerDefaults(p.triggerDefaults);
  if (trig) {
    out.push("## Trigger defaults");
    out.push("");
    out.push(trig);
    out.push("");
  }

  out.push("## Accessibility");
  out.push("");
  out.push(renderA11y(p.a11y));
  out.push("");

  out.push("## Performance");
  out.push("");
  out.push(renderPerformance(p.performance));
  out.push("");

  out.push("## Demo");
  out.push("");
  out.push(renderDemo(p.demo));
  out.push("");

  out.push("---");
  out.push("");
  out.push("_Generated from `primitives/" + p.name + ".json` by `bin/catalog-docs.js`. Do not edit by hand._");
  out.push("");

  return out.join("\n");
}

/* --- index ------------------------------------------------------------ */

function renderIndex(primitives) {
  const out = [];
  out.push("# Primitive reference");
  out.push("");
  out.push("MotionSpec ships a fixed catalog of **" + primitives.length + " primitives**. Each one is a");
  out.push("schema-validated motion spec the deterministic compiler lowers into GSAP or native CSS,");
  out.push("with an enforced reduced-motion fallback and a performance budget.");
  out.push("");
  out.push("These pages are generated from `primitives/*.json` by `bin/catalog-docs.js`.");
  out.push("Do not edit them by hand — regenerate instead.");
  out.push("");
  out.push("| Primitive | Output | Engine | Reduced-motion fallback | Purpose |");
  out.push("| --- | --- | --- | --- | --- |");
  for (const p of primitives) {
    const fallback = (p.a11y && p.a11y.reducedMotionFallback) || "none-needed";
    const link = "[" + code(p.name) + "](./" + p.name + ".md)";
    out.push("| " + [
      link,
      code(p.output),
      code(p.engine || "—"),
      code(fallback),
      mdCell((p.purpose || "").trim()),
    ].join(" | ") + " |");
  }
  out.push("");
  return out.join("\n");
}

/* --- main ------------------------------------------------------------- */

function main() {
  const catalog = loadCatalog();
  // loadCatalog() returns a map keyed by primitive name; sort for determinism.
  const primitives = Object.keys(catalog).sort().map((name) => catalog[name]);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let written = 0;
  for (const p of primitives) {
    const file = path.join(OUT_DIR, p.name + ".md");
    fs.writeFileSync(file, renderPrimitive(p));
    written += 1;
  }

  fs.writeFileSync(path.join(OUT_DIR, "README.md"), renderIndex(primitives));

  console.error("Wrote " + written + " primitive pages + index to " + path.relative(ROOT, OUT_DIR) + "/.");
}

main();
