"use strict";
/*
 * Client discovery (sprint-2 S2-01) — a tool, not the run itself.
 *
 * Input: a brief file (JSON) describing which motions a page WANTS —
 * in natural language plus a target selector:
 *   { "project": "kunde-x", "intents": [
 *       { "what": "hero headline glides in on scroll", "target": ".hero h1" },
 *       { "what": "numbers in the stats block count up", "target": ".stats .num" },
 *       ... ] }
 *
 * For every intent the tool tries to express it with the CURRENT catalog
 * (heuristic mapping, same keyword logic as the mock router) and compiles.
 * Result: a gap report (Markdown) with
 *   - covered:   intent -> primitive, compiled
 *   - GAP:       no primitive fits -> a named catalog gap
 * The tool DECIDES nothing and builds no primitives — it delivers the
 * data that informs phase B (freeze) and phase C (catalog).
 *
 * Anti-goal-compliant: gaps are LOGGED, never silently patched.
 */
const { loadCatalog } = require("../compiler/catalog.js");
const { compileSpec } = require("../compiler/compile.js");

/* Heuristic intent->primitive mapping from the shared source (TASK-025).
 * Order = API: mapIntent returns the FIRST match. discover ignores the
 * bundled target (it takes intent.target); params are used. */
const { KEYWORD_MAP: RULES } = require("../compiler/keyword-map.js");

function mapIntent(what) {
  for (const r of RULES) if (r.re.test(what)) return r;
  return null;
}

function discover(brief) {
  const catalog = loadCatalog();
  const covered = [];
  const gaps = [];
  (brief.intents || []).forEach((intent, i) => {
    const rule = mapIntent(intent.what || "");
    if (!rule) {
      gaps.push({ i, what: intent.what, target: intent.target, reason: "no catalog primitive matches the intent" });
      return;
    }
    const spec = {
      specVersion: "1.0",
      meta: { project: brief.project || "discovery", target: "vanilla-gsap", createdWith: "discover" },
      globals: { respectReducedMotion: true },
      motions: [{ id: "intent-" + i, primitive: rule.primitive, target: intent.target || ".target", params: rule.params }],
    };
    const res = compileSpec(spec, catalog);
    if (res.ok) covered.push({ i, what: intent.what, primitive: rule.primitive, budget: res.report.cost });
    else gaps.push({ i, what: intent.what, target: intent.target, reason: "mapping exists, but compile/validate failed: " + (res.errors || []).join(" | ") });
  });
  return { project: brief.project || "discovery", total: (brief.intents || []).length, covered, gaps, catalogPrimitives: Object.keys(catalog).sort() };
}

function toMarkdown(r) {
  const lines = [];
  lines.push("# Gap report — " + r.project);
  lines.push("");
  lines.push("Generated: " + new Date().toISOString().slice(0, 10) + " · Tool: `motion discover` (S2-01)");
  lines.push("Catalog: " + r.catalogPrimitives.join(", "));
  lines.push("");
  lines.push("**" + r.covered.length + " / " + r.total + " intents covered · " + r.gaps.length + " gap(s).**");
  lines.push("");
  lines.push("> The heuristic deliberately errs toward \"covered\" (keyword mapping). \"Covered\" is therefore A PROPOSAL that a human must confirm against the real design (anti-goal A2: no sham coverage). Reported GAPS, in contrast, are high-confidence.");
  lines.push("");
  lines.push("## Covered");
  if (r.covered.length === 0) lines.push("_none_");
  r.covered.forEach((c) => lines.push("- ✓ \"" + c.what + "\" → `" + c.primitive + "` (cost " + c.budget + ")"));
  lines.push("");
  lines.push("## GAPS (signal for phase B + C — nothing is silently patched)");
  if (r.gaps.length === 0) lines.push("_none — the current catalog covers the page completely._");
  r.gaps.forEach((g) => lines.push("- ✗ \"" + g.what + "\"  (target: " + (g.target || "—") + ")\n  - " + g.reason));
  lines.push("");
  lines.push("## Next step");
  lines.push(r.gaps.length === 0
    ? "Catalog suffices. Write specs, compile, device check, ship (S2-06)."
    : "Feed the gaps into S2-02 (freeze: does v1 cover them or 0.2?) and S2-05 (new primitives only for these gaps).");
  return lines.join("\n");
}

module.exports = { discover, toMarkdown, mapIntent };
