"use strict";
/*
 * safety.js — shared, security-critical constants + helpers.
 * ----------------------------------------------------------------------
 * ONE source for the injection/CSS protection layer shared by BOTH lowering
 * passes — the GSAP compiler (compile.js) and the WAAPI lowering (lower-waapi.js)
 * — as well as the trust boundary (validate.js, for the unsafe-token check).
 *
 * Previously CSS_SAFE_RE, the UNSAFE_TOKENS list, unsafeToken, cssRaw and
 * withDefaults lived duplicated in compile.js AND lower-waapi.js (UNSAFE_TOKENS
 * additionally in validate.js). Maintaining security-critical values twice is a
 * risk: a change to one copy lets the passes silently drift apart, and the
 * "defense in depth" would only be armed on one side. This here is the ONLY
 * definition; test/safety-parity.test.js pins via reference identity that both
 * passes use exactly these exports.
 *
 * Pure leaf module: imports nothing from the project (no cycles).
 */

/* CSS raw-text allow-list: characters permitted in values that get interpolated
 * into a CSS context. Applied identically in both passes. */
const CSS_SAFE_RE = /^[A-Za-z0-9 _\-#.:,()>+~*=%[\]"|^$]{0,200}$/;

/* Dangerous substrings that must never reach emitted JS/CSS — not even when
 * the charset gate would let them through (e.g. "url(javascript:…)",
 * "expression(…)"). Checked by BOTH: the trust boundary (so that
 * motion_validate ok=true predicts compile success — closes the
 * validate↔compile asymmetry) AND cssRaw (defense in depth). Lowercase. */
const UNSAFE_TOKENS = [
  "javascript:", "vbscript:", "expression(", "url(", "@import",
  "behavior:", "-moz-binding", "</", "<script",
];
function unsafeToken(s) {
  const l = String(s).toLowerCase();
  for (const t of UNSAFE_TOKENS) if (l.indexOf(t) !== -1) return t;
  return null;
}

/* Raw insertion for CSS contexts: returns the value only if it passes the
 * allow-list and contains neither a dangerous token nor a CSS comment
 * sequence (breakout risk) — otherwise abort (fail-closed). Throws; each
 * caller maps that onto its own [MS-…] code (compile.js: MS-COMPILE-CSS,
 * lower-waapi.js: MS-WAAPI-CSS). */
function cssRaw(v, where) {
  const s = String(v);
  const bad = unsafeToken(s);
  if (bad || !CSS_SAFE_RE.test(s) || s.includes("/*") || s.includes("*/")) {
    throw new Error(
      'CSS interpolation rejected for "' + where + '": value "' + s + '"' +
      (bad ? ' contains dangerous token "' + bad + '"' : " violates the CSS allow-list") + "."
    );
  }
  return s;
}

/* Fills missing parameters with the paramSchema defaults. Identical shape in
 * both passes so GSAP and WAAPI lowering end up with the same parameters. */
function withDefaults(schema, given) {
  const out = {};
  Object.keys(schema).forEach((k) => {
    out[k] = given && Object.prototype.hasOwnProperty.call(given, k) ? given[k] : schema[k].default;
  });
  return out;
}

/* ==========================================================================
 * pauseControls (WCAG 2.2.2) — ONE source shared by BOTH lowerings
 * (compile.js / GSAP and lower-waapi.js / WAAPI) so their pause mechanics can
 * NEVER byte-drift (golden parity test pins this). A spec with ZERO persistent
 * motions produces ZERO bytes here — pauseBlocks returns { css:null, js:null }.
 *
 * Determinism: pure string builders, no Math.random/Date/entropy. Same inputs
 * ⇒ identical bytes. Selectors are re-screened through cssRaw (validated); the
 * rest is a fixed literal so `!important` (which cssRaw would reject) is allowed.
 * ==========================================================================*/

/* Default button labels (EN). Overridable via globals.pauseLabels. */
const PAUSE_LABEL_DEFAULTS = { pause: "Pause animations", play: "Play animations" };

/* Which motions get a pause rule: those whose primitive is a11y.persistent. */
function persistentMotions(spec, catalog) {
  if (!spec || !Array.isArray(spec.motions) || !catalog) return [];
  return spec.motions.filter((m) => {
    const prim = m && catalog[m.primitive];
    return !!(prim && prim.a11y && prim.a11y.persistent === true);
  });
}

/* Per-persistent-motion CSS. `<target>` is validated via cssRaw (so it can
 * never break out of the selector context); the rest — including `!important`
 * and the `> *` child reach (marquee children carry the animation) — is a fixed
 * literal. Emitted OUTSIDE the prefers-reduced-motion @media block by the caller
 * so the pause path is always live. */
function pauseCssFor(target) {
  const t = cssRaw(target, "pauseControls.target");
  return "html[data-ms-paused] " + t + ", html[data-ms-paused] " + t +
    " > * { animation-play-state: paused !important; }";
}

/* The single, fixed pause toggle (only for pauseControls:"auto"). Deterministic:
 * labels are JSON.stringify'd (already validated as plain strings). The toggle:
 *  - is NOT rendered under prefers-reduced-motion: reduce (loops are static);
 *  - toggles data-ms-paused on document.documentElement;
 *  - keeps aria-pressed + text label in sync;
 *  - persists to localStorage("ms-paused") (defensive: wrapped in try/catch);
 *  - min 24x24px target size (WCAG 2.2 Target Size) + a visible :focus-visible ring.
 * The button's own <style> is scoped to .ms-pause-toggle and injected once. */
function pauseToggleJs(labels) {
  const L = labels || PAUSE_LABEL_DEFAULTS;
  const pauseLabel = typeof L.pause === "string" ? L.pause : PAUSE_LABEL_DEFAULTS.pause;
  const playLabel = typeof L.play === "string" ? L.play : PAUSE_LABEL_DEFAULTS.play;
  const j = (s) => JSON.stringify(String(s)); /* safe JS string literal */
  return [
    "  /* pauseControls: WCAG 2.2.2 pause/stop toggle (auto). Not rendered under prefers-reduced-motion: reduce. */",
    "  (function () {",
    "    if (document.querySelector('.ms-pause-toggle')) return;  /* single toggle */",
    "    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;",
    "    var PAUSE_LABEL = " + j(pauseLabel) + ", PLAY_LABEL = " + j(playLabel) + ";",
    "    var root = document.documentElement;",
    "    var style = document.createElement('style');",
    "    style.textContent = '.ms-pause-toggle{position:fixed;right:1rem;bottom:1rem;z-index:2147483647;min-width:24px;min-height:24px;padding:.5rem .75rem;font:inherit;line-height:1;cursor:pointer;border:1px solid currentColor;border-radius:6px;background:Canvas;color:CanvasText}.ms-pause-toggle:focus-visible{outline:3px solid Highlight;outline-offset:2px}';",
    "    document.head.appendChild(style);",
    "    var btn = document.createElement('button');",
    "    btn.type = 'button';",
    "    btn.className = 'ms-pause-toggle';",
    "    var stored = null;",
    "    try { stored = window.localStorage.getItem('ms-paused'); } catch (e) {}",
    "    var paused = stored === '1';",
    "    function sync() {",
    "      if (paused) { root.setAttribute('data-ms-paused', ''); } else { root.removeAttribute('data-ms-paused'); }",
    "      btn.setAttribute('aria-pressed', paused ? 'true' : 'false');",
    "      btn.textContent = paused ? PLAY_LABEL : PAUSE_LABEL;",
    "    }",
    "    btn.addEventListener('click', function () {",
    "      paused = !paused;",
    "      try { window.localStorage.setItem('ms-paused', paused ? '1' : '0'); } catch (e) {}",
    "      sync();",
    "    });",
    "    sync();",
    "    document.body.appendChild(btn);",
    "  })();",
  ].join("\n");
}

/**
 * Build the pauseControls artifacts for a spec. Returns { css, js } where each
 * is a string to APPEND (css: outside the RRM block; js: inside the main IIFE
 * or as a standalone block) or null when nothing is emitted. Byte-identical for
 * both lowerings because both call this ONE function with the same inputs.
 *
 * @param {Object} spec
 * @param {Object} catalog
 * @returns {{ css: string|null, js: string|null }}
 */
function pauseBlocks(spec, catalog) {
  const mode = (spec && spec.globals && spec.globals.pauseControls) || "auto"; /* fail-safe default */
  if (mode === "off") return { css: null, js: null };
  const persistent = persistentMotions(spec, catalog);
  if (persistent.length === 0) return { css: null, js: null };  /* zero-overhead */

  /* CSS: one rule per persistent motion, deterministic order (spec order). */
  const cssLines = ["/* pauseControls: WCAG 2.2.2 pause path (data-ms-paused). Outside the reduced-motion guard. */"];
  for (const m of persistent) cssLines.push(pauseCssFor(m.target));
  const css = cssLines.join("\n") + "\n";

  /* JS toggle only for "auto"; "api" leaves the CSS contract for the integrator. */
  const js = mode === "auto"
    ? pauseToggleJs(spec.globals && spec.globals.pauseLabels)
    : null;

  return { css, js };
}

module.exports = {
  CSS_SAFE_RE, UNSAFE_TOKENS, unsafeToken, cssRaw, withDefaults,
  pauseBlocks, persistentMotions, pauseCssFor, pauseToggleJs, PAUSE_LABEL_DEFAULTS,
};
