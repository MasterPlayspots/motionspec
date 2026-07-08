"use strict";
/*
 * MotionSpec compiler — v0.2 (library)
 * ----------------------------------------------------------------------
 * Deterministically translates a validated MotionSpec into code.
 * No model involved: the same spec always yields the same code.
 *
 * Safe interpolation (v0.2):
 *   {{path}}      -> JS literal: strings/objects via JSON.stringify,
 *                    numbers/booleans directly. A value can NEVER leave
 *                    the string/expression context.
 *   {{css path}}  -> raw insertion for CSS contexts, but only if the
 *                    value passes the CSS allow-list (otherwise abort).
 *
 * Flow: trust boundary -> defaults -> templates -> gates -> report.
 */
const { validateSpec } = require("./validate.js");
/* CSS raw-text screening + default filling come from the shared source
 * (safety.js) — used byte-identically by the WAAPI lowering (lower-waapi.js). */
const { cssRaw, withDefaults, pauseBlocks } = require("./safety.js");
const VERSION = require("../../package.json").version;

const BUDGET = 10; /* performance budget: sum of the primitive costs */

function resolvePath(ctx, expr) {
  return expr.split(".").reduce(
    (o, k) => (o === undefined || o === null ? undefined : o[k]),
    ctx
  );
}

function jsLiteral(v) {
  if (v === undefined || v === null) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v); /* strings AND objects: always correctly escaped */
}

function fill(tpl, ctx) {
  return tpl.replace(/\{\{([^}]+)\}\}/g, (_, raw) => {
    const expr = raw.trim();
    if (expr.startsWith("css ")) {
      const v = resolvePath(ctx, expr.slice(4).trim());
      return cssRaw(v === undefined ? "" : v, expr);
    }
    return jsLiteral(resolvePath(ctx, expr));
  });
}

/**
 * @typedef {Object} CompileReport
 * @property {number} motions - number of compiled motions
 * @property {number} jsCount - number of JS outputs
 * @property {number} cssCount - number of CSS outputs
 * @property {number} cost - sum of the primitive costs
 * @property {number} budget - performance budget (default BUDGET)
 * @property {boolean} budgetOk - true if cost <= budget
 * @property {boolean} reducedMotion - whether a prefers-reduced-motion guard is emitted
 * @property {boolean} reducedMotionOverriddenOff - true if the spec explicitly disables the guard
 * @property {string} specVersion - specVersion of the source
 * @property {Array<{code:string,message:string}>} deprecations - deprecation notices (ADR-0001 D4)
 */
/**
 * @typedef {Object} CompileResult
 * @property {boolean} ok - true on success, false fail-closed (no partial output)
 * @property {string[]} [errors] - errors with [MS-XXX] prefix, only when ok=false
 * @property {string|null} [js] - generated JS (null if no JS motions)
 * @property {string|null} [css] - generated CSS (null if no CSS motions)
 * @property {CompileReport} [report] - report, only when ok=true
 */
/**
 * Validates (fail-closed) and deterministically compiles a MotionSpec to GSAP/CSS.
 * The same spec always yields the same code; on validation or CSS errors
 * nothing is emitted.
 * @param {Object} spec - the MotionSpec
 * @param {Object} catalog - loaded primitive catalog
 * @param {{specName?: string, budget?: number}} [opts] - optional artifact name + budget
 * @returns {CompileResult}
 */
function compileSpec(spec, catalog, opts) {
  const o = opts || {};
  const budget = typeof o.budget === "number" ? o.budget : BUDGET; /* audit #16: configurable */
  const v = validateSpec(spec, catalog);
  if (!v.ok) return { ok: false, errors: v.errors };

  /* ADR-0001 D4: deprecation note comes from the validator (single source),
   * so validate-only callers and the compile report agree. */
  const deprecations = v.deprecations || [];

  const respectRM = !(spec.globals && spec.globals.respectReducedMotion === false);
  const js = [], css = [];
  let cost = 0, nJs = 0, nCss = 0;

  for (const m of spec.motions) {
    const prim = catalog[m.primitive];
    const params = withDefaults(prim.paramSchema || {}, m.params);
    const trigger = Object.assign({}, prim.triggerDefaults || {}, m.trigger || {});
    const ctx = { id: m.id, target: m.target, params, trigger, globals: spec.globals || {} };
    let code;
    try { code = fill(prim.template, ctx); }
    catch (e) { return { ok: false, errors: ["[MS-COMPILE-CSS] Compile aborted at motion '" + m.id + "': " + e.message] }; }
    cost += (prim.performance && prim.performance.cost) || 0;
    if (prim.output === "css") {
      css.push("  /* " + m.id + " (" + m.primitive + ") */");
      css.push("  " + code.split("\n").join("\n  "));
      nCss++;
    } else {
      js.push("  /* " + m.id + " (" + m.primitive + ") */");
      js.push("  " + code);
      nJs++;
    }
  }

  /* Audit finding #1: prevent comment injection via the file name. */
  const safeName = String(o.specName || "spec").replace(/\*\/|\/\*/g, "_").slice(0, 80);
  const specLabel = safeName + "  Target: " + spec.meta.target;
  let jsOut = null, cssOut = null;

  /* pauseControls (WCAG 2.2.2): shared with lower-waapi.js (byte-identical). A
   * spec with no persistent motion (or pauseControls:"off") yields { null, null }
   * ⇒ zero extra bytes vs. before. The button lives in the JS artifact; the
   * pause CSS goes OUTSIDE the reduced-motion guard so it is always live. */
  const pause = pauseBlocks(spec, catalog);

  if (nJs > 0) {
    const head = [
      "/* MotionSpec-Compiler v" + VERSION + " - generated artifact. Do NOT edit by hand; the spec is the source. */",
      "/* Spec: " + specLabel + " */",
      "(function () {",
      "  if (typeof gsap === 'undefined') { console.warn('[motion] GSAP not loaded.'); return; }",
      "  gsap.registerPlugin(ScrollTrigger);",
    ];
    if (respectRM) {
      head.push("  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;");
      head.push("  if (reduceMotion) return;  /* a11y: respectReducedMotion */");
    }
    jsOut = head.concat(js, ["})();", ""]).join("\n");
  }

  if (nCss > 0) {
    let body = "/* MotionSpec-Compiler v" + VERSION + " - generated artifact. */\n";
    if (respectRM) body += "@media (prefers-reduced-motion: no-preference) {\n" + css.join("\n") + "\n}\n";
    else body += css.join("\n") + "\n";
    cssOut = body;
  }

  /* Append the pause path. CSS: outside the RRM block (always live). JS: a
   * SELF-CONTAINED toggle IIFE appended after the main artifact — decoupled from
   * GSAP and from the main RRM guard (it self-guards prefers-reduced-motion), so
   * the button works even when the page is CSS-only. */
  if (pause.css) cssOut = (cssOut || "/* MotionSpec-Compiler v" + VERSION + " - generated artifact. */\n") + pause.css;
  if (pause.js) {
    const block = "(function () {\n" + pause.js + "\n})();\n";
    if (jsOut === null) {
      jsOut = "/* MotionSpec-Compiler v" + VERSION + " - generated artifact. Do NOT edit by hand; the spec is the source. */\n" +
        "/* Spec: " + specLabel + "  (pause controls only) */\n" + block;
    } else {
      jsOut = jsOut + block;
    }
  }

  return {
    ok: true,
    js: jsOut,
    css: cssOut,
    report: {
      motions: spec.motions.length,
      jsCount: nJs,
      cssCount: nCss,
      cost,
      budget,
      budgetOk: cost <= budget,
      reducedMotion: respectRM,
      reducedMotionOverriddenOff: !!(spec.globals && spec.globals.respectReducedMotion === false),
      specVersion: spec.specVersion,
      deprecations,
    },
  };
}

/* withDefaults/cssRaw are re-exported from safety.js so the parity test can
 * check the reference identity of both passes against the ONE source. */
module.exports = { compileSpec, fill, withDefaults, cssRaw, BUDGET };
