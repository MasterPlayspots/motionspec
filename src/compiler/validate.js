"use strict";
/*
 * MotionSpec — Trust Boundary  (v0.3, Phase 2 / Sprint 2)
 * ----------------------------------------------------------------------
 * Anti-corruption layer between the author of a spec (model or human)
 * and the compiler. Principle: FAIL-CLOSED. A spec only passes if EVERY
 * check succeeds. A partial output is never produced.
 *
 * STABLE ERROR CODES (audit #15 / sprint-2 S2-04):
 *   Every error carries a language-neutral [MS-XXX] prefix. Integrators
 *   match on the code, not on the plaintext. validateSpec
 *   additionally returns errorCodes[] for purely programmatic use.
 *   The code list is API: codes are never reused/redefined.
 *
 * Code registry:
 *   MS-SPEC-OBJ      spec is not an object
 *   MS-SPEC-KEY      unknown top-level key
 *   MS-SPEC-VER      specVersion missing/unknown
 *   MS-SPEC-MOTIONS  motions missing/empty
 *   MS-META-MISSING  meta missing
 *   MS-META-KEY      unknown meta key
 *   MS-META-TARGET   meta.target not supported
 *   MS-GLOBALS-OBJ   globals is not an object
 *   MS-GLOBALS-KEY   unknown globals key
 *   MS-MOTION-OBJ    motion is not an object
 *   MS-MOTION-KEY    unknown motion key
 *   MS-ID-FORMAT     id missing/format violated
 *   MS-ID-DUP        id not unique
 *   MS-TARGET-UNSAFE target missing/unsafe selector
 *   MS-PRIM-MISSING  primitive missing
 *   MS-PRIM-UNKNOWN  primitive not in the catalog (allow-list)
 *   MS-PARAM-UNKNOWN unknown parameter
 *   MS-PARAM-REQ     required parameter missing
 *   MS-PARAM-TYPE    wrong parameter type
 *   MS-PARAM-MIN     parameter below the minimum
 *   MS-PARAM-MAX     parameter above the maximum
 *   MS-PARAM-CHARSET string parameter contains disallowed characters
 *   MS-PARAM-UNSAFE  string parameter contains a dangerous token (javascript:, expression(, url(, ...)
 *   MS-PARAM-PATTERN string parameter violates the allowed pattern
 *   MS-PARAM-PATTERN-DEF paramSchema.pattern is itself invalid
 *   MS-TRANSFORM-KEY disallowed transform key
 *   MS-TRANSFORM-TYPE transform value is not a number
 *   MS-TRIGGER-OBJ   trigger is not an object
 *   MS-TRIGGER-KEY   unknown trigger key
 *   MS-TRIGGER-VAL   trigger position value invalid
 *   MS-CATALOG-PIN     catalogVersion pin has the wrong format
 *   MS-CATALOG-PIN-MISMATCH catalogVersion pin does not match the loaded catalog
 *   MS-RESP-UNSUPPORTED responsive not supported yet (-> a future minor)
 *   MS-DEPRECATED-VERSION specVersion is deprecated. NOT a hard error:
 *                     reported in validateSpec().deprecations[] AND in the
 *                     compile report (shared source deprecationsFor; ADR-0001 D4).
 *   MS-GLOBALS-RRM-OFF  globals.respectReducedMotion is explicitly false — the
 *                     compiler emits no prefers-reduced-motion guard. Not a hard
 *                     error, but a warning (in validateSpec().warnings[]).
 *   MS-GLOBALS-PAUSE-BAD globals.pauseControls is not one of "auto"|"api"|"off",
 *                     or globals.pauseLabels is not an object of optional string
 *                     pause/play. Hard error (fail-closed).
 *   MS-GLOBALS-PAUSE-OFF globals.pauseControls is "off" AND the spec contains at
 *                     least one motion whose primitive is a11y.persistent — the
 *                     compiler emits no WCAG-2.2.2 pause path for a >5s loop.
 *                     Not a hard error, but a warning (mirrors MS-GLOBALS-RRM-OFF).
 *   MS-INPUT-TOO-LARGE  spec payload > MAX_SPEC_BYTES (64KB), MCP layer.
 */

/* ADR-0001 (signed 2026-06-15): v1 carries "1.0". "0.1" was accepted for one
 * deprecated minor cycle and is REMOVED at package 1.2.0 (D4 tripwire fired) —
 * "0.1" now fails MS-SPEC-VER like any other unknown version. The deprecation
 * machinery (deprecationsFor/DEPRECATED_VERSIONS) is kept as a general
 * mechanism but currently lists nothing. */
const SPEC_VERSIONS = ["1.0"];
const DEPRECATED_VERSIONS = [];

/* ADR-0001 D4: single source of the deprecation signal. Surfaced by BOTH
 * validateSpec (so validate-only callers see it) and the compile report. */
function deprecationsFor(specVersion) {
  if (DEPRECATED_VERSIONS.indexOf(specVersion) === -1) return [];
  return [{
    code: "MS-DEPRECATED-VERSION",
    message: 'specVersion "' + specVersion + '" is deprecated; migrate to "1.0". Accepted until v1.2.',
  }];
}
const TARGETS = ["vanilla-gsap"];
const TRANSFORM_KEYS = ["opacity", "x", "y", "scale", "rotation", "xPercent", "yPercent"];
const TOP_KEYS = ["specVersion", "catalogVersion", "meta", "globals", "motions"];
const CATALOG_PIN_RE = /^[0-9a-f]{16}$/;
const META_KEYS = ["project", "target", "createdWith"];
const GLOBALS_KEYS = ["respectReducedMotion", "defaultEase", "pauseControls", "pauseLabels"];
// defaultEase: allowlisted, but currently not consumed by the compiler — kept so specs don't break (TASK-017)
/* pauseControls: fail-safe like respectReducedMotion. Omitted => "auto" (the
 * compiler injects a pause toggle for persistent loops). "api" => CSS pause
 * contract only, no button. "off" => no pause path (warned when persistent
 * motions exist, see MS-GLOBALS-PAUSE-OFF). */
const PAUSE_CONTROLS = ["auto", "api", "off"];
const PAUSE_LABEL_KEYS = ["pause", "play"];
const MOTION_KEYS = ["id", "primitive", "target", "params", "trigger", "responsive"];

const { catalogVersion } = require("./catalog.js");
/* UNSAFE_TOKENS/unsafeToken now live in safety.js (one source, shared with
 * compile.js + lower-waapi.js). validate.js uses the check for MS-PARAM-UNSAFE
 * and re-exports unsafeToken unchanged for existing importers. */
const { unsafeToken } = require("./safety.js");

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SELECTOR_RE = /^[A-Za-z0-9 _\-#.:,()>+~*=[\]"|^$]{1,200}$/;
const STRING_PARAM_RE = /^[^\x00-\x1F\x7F`\\]{0,200}$/;

function safeSelector(s) {
  return (
    typeof s === "string" &&
    SELECTOR_RE.test(s) &&
    s.indexOf("/*") === -1 &&
    s.indexOf("*/") === -1
  );
}

function validateParams(prim, params, at, push, partial) {
  const schema = prim.paramSchema || {};
  Object.keys(params).forEach((k) => {
    if (!schema[k]) push("MS-PARAM-UNKNOWN", at + ': unknown parameter "' + k + '" for primitive "' + prim.name + '".');
  });
  Object.keys(schema).forEach((k) => {
    const def = schema[k];
    const has = Object.prototype.hasOwnProperty.call(params, k);
    if (!has) {
      if (def.required && !partial) push("MS-PARAM-REQ", at + ': required parameter "' + k + '" is missing.');
      return;
    }
    const v = params[k];
    if (def.type === "number") {
      if (typeof v !== "number" || isNaN(v)) { push("MS-PARAM-TYPE", at + ': "' + k + '" must be a number.'); return; }
      if (typeof def.min === "number" && v < def.min) push("MS-PARAM-MIN", at + ': "' + k + '" = ' + v + " is below the minimum " + def.min + ".");
      if (typeof def.max === "number" && v > def.max) push("MS-PARAM-MAX", at + ': "' + k + '" = ' + v + " is above the maximum " + def.max + ".");
    } else if (def.type === "string") {
      if (typeof v !== "string") push("MS-PARAM-TYPE", at + ': "' + k + '" must be a string.');
      else if (!STRING_PARAM_RE.test(v)) push("MS-PARAM-CHARSET", at + ': "' + k + '" contains disallowed characters (control characters, backslash, backtick) or is too long.');
      else if (unsafeToken(v)) push("MS-PARAM-UNSAFE", at + ': "' + k + '" contains a disallowed token "' + unsafeToken(v) + '" (e.g. javascript:, expression(, url(). Rejected.');
      else if (def.pattern) {
        let re = null;
        try { re = new RegExp(def.pattern); }
        catch { push("MS-PARAM-PATTERN-DEF", at + ': paramSchema.pattern for "' + k + '" is not a valid regular expression.'); }
        if (re && !re.test(v))
          push("MS-PARAM-PATTERN", at + ': "' + k + '" = "' + v + '" does not match the allowed pattern ' + def.pattern + ".");
      }
    } else if (def.type === "boolean") {
      if (typeof v !== "boolean") push("MS-PARAM-TYPE", at + ': "' + k + '" must be true or false.');
    } else if (def.type === "transform") {
      if (typeof v !== "object" || v === null || Array.isArray(v)) {
        push("MS-PARAM-TYPE", at + ': "' + k + '" must be a transform object.'); return;
      }
      Object.keys(v).forEach((tk) => {
        if (TRANSFORM_KEYS.indexOf(tk) === -1)
          push("MS-TRANSFORM-KEY", at + ': "' + k + "." + tk + '" is not an allowed transform key (allowed: ' + TRANSFORM_KEYS.join(", ") + ").");
        else if (typeof v[tk] !== "number")
          push("MS-TRANSFORM-TYPE", at + ': "' + k + "." + tk + '" must be a number.');
      });
    }
  });
}

function validateTrigger(trigger, at, push) {
  if (typeof trigger !== "object" || trigger === null || Array.isArray(trigger)) {
    push("MS-TRIGGER-OBJ", at + ": trigger must be an object."); return;
  }
  const KEYS = ["start", "end", "once"];
  Object.keys(trigger).forEach((k) => {
    if (KEYS.indexOf(k) === -1) push("MS-TRIGGER-KEY", at + ': trigger: unknown key "' + k + '".');
  });
  ["start", "end"].forEach((k) => {
    if (trigger[k] !== undefined) {
      if (typeof trigger[k] !== "string" || !/^[A-Za-z0-9 %+=.-]{1,40}$/.test(trigger[k]))
        push("MS-TRIGGER-VAL", at + ": trigger." + k + ' must be a plain position string (e.g. "top 80%").');
    }
  });
  if (trigger.once !== undefined && typeof trigger.once !== "boolean")
    push("MS-TRIGGER-VAL", at + ": trigger.once must be true or false.");
}

/* TASK-027: cohesive sub-validators extracted from validateSpec (behavior
 * identical) — keeps validateSpec flat and each part individually testable.
 * None of them is exported; the public interface remains validateSpec. */
function validateCatalogPin(spec, catalog, push) {
  /* ADR-0001 D2: optional catalogVersion pin for reproducibility. If a spec
   * pins a hash, it MUST match the loaded catalog — fail-closed. */
  if (spec.catalogVersion === undefined) return;
  if (typeof spec.catalogVersion !== "string" || !CATALOG_PIN_RE.test(spec.catalogVersion)) {
    push("MS-CATALOG-PIN", "catalogVersion must be a 16-char hex hash (or omitted).");
    return;
  }
  const actual = catalogVersion(catalog);
  if (spec.catalogVersion !== actual)
    push("MS-CATALOG-PIN-MISMATCH", "catalogVersion pin (" + spec.catalogVersion + ") does not match the loaded catalog (" + actual + "). The spec was written against a different catalog.");
}

function validateMeta(spec, push) {
  if (!spec.meta || typeof spec.meta !== "object") { push("MS-META-MISSING", "meta is missing."); return; }
  Object.keys(spec.meta).forEach((k) => {
    if (META_KEYS.indexOf(k) === -1) push("MS-META-KEY", 'meta: unknown key "' + k + '".');
  });
  if (TARGETS.indexOf(spec.meta.target) === -1)
    push("MS-META-TARGET", "meta.target is missing or not supported (allowed: " + TARGETS.join(", ") + ").");
}

function validateGlobals(spec, push, warnings) {
  if (spec.globals === undefined) return;
  if (typeof spec.globals !== "object" || spec.globals === null || Array.isArray(spec.globals)) {
    push("MS-GLOBALS-OBJ", "globals must be an object.");
    return;
  }
  Object.keys(spec.globals).forEach((k) => {
    if (GLOBALS_KEYS.indexOf(k) === -1) push("MS-GLOBALS-KEY", 'globals: unknown key "' + k + '" (allowed: ' + GLOBALS_KEYS.join(", ") + ").");
  });
  if (spec.globals.respectReducedMotion === false)
    warnings.push({ code: "MS-GLOBALS-RRM-OFF", message: "globals.respectReducedMotion is explicitly false — the compiler emits no prefers-reduced-motion guard. Recommendation: true." });

  /* pauseControls / pauseLabels shape (WCAG 2.2.2). Fail-closed on a bad value;
   * the persistence-aware MS-GLOBALS-PAUSE-OFF *warning* is raised later in
   * validateSpec (needs catalog + motions, which validateGlobals lacks). */
  if (spec.globals.pauseControls !== undefined &&
      PAUSE_CONTROLS.indexOf(spec.globals.pauseControls) === -1)
    push("MS-GLOBALS-PAUSE-BAD", 'globals.pauseControls must be one of "' + PAUSE_CONTROLS.join('", "') + '" (or omitted, defaults to "auto").');

  if (spec.globals.pauseLabels !== undefined) {
    const pl = spec.globals.pauseLabels;
    if (typeof pl !== "object" || pl === null || Array.isArray(pl)) {
      push("MS-GLOBALS-PAUSE-BAD", "globals.pauseLabels must be an object with optional string pause/play.");
    } else {
      Object.keys(pl).forEach((k) => {
        if (PAUSE_LABEL_KEYS.indexOf(k) === -1)
          push("MS-GLOBALS-PAUSE-BAD", 'globals.pauseLabels: unknown key "' + k + '" (allowed: ' + PAUSE_LABEL_KEYS.join(", ") + ").");
        else if (typeof pl[k] !== "string")
          push("MS-GLOBALS-PAUSE-BAD", "globals.pauseLabels." + k + " must be a string.");
      });
    }
  }
}

/* Validates ONE motion (TASK-027: extracted from validateSpec so validateSpec
 * stays flat and easy to test — behavior identical). `seen` is shared so id
 * uniqueness holds across all motions. Deliberately NOT exported. */
function validateMotion(m, i, catalog, push, seen) {
  const at = "motions[" + i + "]";
  if (typeof m !== "object" || m === null) { push("MS-MOTION-OBJ", at + " is not an object."); return; }

  Object.keys(m).forEach((k) => {
    if (MOTION_KEYS.indexOf(k) === -1) push("MS-MOTION-KEY", at + ': unknown key "' + k + '".');
  });

  if (typeof m.id !== "string" || !ID_RE.test(m.id))
    push("MS-ID-FORMAT", at + ": id is missing or violates the format [A-Za-z0-9_-]{1,64}.");
  else if (seen[m.id]) push("MS-ID-DUP", at + ': id "' + m.id + '" is not unique.');
  else seen[m.id] = true;

  if (!safeSelector(m.target))
    push("MS-TARGET-UNSAFE", at + ": target is missing or not a safe CSS selector (forbidden: quotes, backslash, {, }, ;, @, control characters; max. 200 characters).");

  /* --- Core protection: primitive allow-list --- */
  if (typeof m.primitive !== "string" || !m.primitive) {
    push("MS-PRIM-MISSING", at + ": primitive is missing.");
  } else if (!catalog[m.primitive]) {
    push("MS-PRIM-UNKNOWN", at + ': primitive "' + m.primitive + '" does not exist in the catalog. '
      + "Allowed are exclusively: " + Object.keys(catalog).sort().join(", ") + ".");
  } else {
    const prim = catalog[m.primitive];
    validateParams(prim, m.params || {}, at, push, false);
    if (m.trigger !== undefined) validateTrigger(m.trigger, at, push);
    if (m.responsive !== undefined) {
      push("MS-RESP-UNSUPPORTED", at + ": responsive is not supported in this specVersion yet (planned for a future minor). Remove the field.");
    }
  }
}

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} ok - true if the spec passes every check (fail-closed)
 * @property {string[]} errors - human-readable errors, each with an [MS-XXX] prefix
 * @property {string[]} errorCodes - the bare codes, index-parallel to errors
 * @property {Array<{code:string,message:string}>} deprecations - deprecation notices (not a hard error)
 * @property {Array<{code:string,message:string}>} warnings - warnings (not a hard error)
 */
/**
 * Trust boundary: checks a MotionSpec against schema shape, primitive allow-list,
 * parameter bounds and injection rules. Never produces a partial output.
 * @param {Object} spec - the MotionSpec to validate
 * @param {Object} catalog - loaded primitive catalog (allow-list)
 * @returns {ValidationResult}
 */
function validateSpec(spec, catalog) {
  const errors = [];
  const errorCodes = [];
  /* push(code, msg) -> errors receives "[code] msg", errorCodes the bare code. */
  const push = (code, m) => { errors.push("[" + code + "] " + m); errorCodes.push(code); };
  const warnings = [];

  if (typeof spec !== "object" || spec === null || Array.isArray(spec))
    return { ok: false, errors: ["[MS-SPEC-OBJ] Spec is not an object."], errorCodes: ["MS-SPEC-OBJ"], deprecations: [], warnings: [] };

  const deprecations = deprecationsFor(spec.specVersion);

  Object.keys(spec).forEach((k) => {
    if (TOP_KEYS.indexOf(k) === -1) push("MS-SPEC-KEY", 'Unknown top-level key: "' + k + '".');
  });

  if (SPEC_VERSIONS.indexOf(spec.specVersion) === -1)
    push("MS-SPEC-VER", "specVersion is missing or unknown (allowed: " + SPEC_VERSIONS.join(", ") + ").");

  validateCatalogPin(spec, catalog, push);
  validateMeta(spec, push);

  validateGlobals(spec, push, warnings);

  if (!Array.isArray(spec.motions) || spec.motions.length === 0) {
    push("MS-SPEC-MOTIONS", "motions is missing or empty.");
    return { ok: errors.length === 0, errors, errorCodes, deprecations, warnings };
  }

  const seen = {};
  spec.motions.forEach((m, i) => validateMotion(m, i, catalog, push, seen));

  /* MS-GLOBALS-PAUSE-OFF (mirror of MS-GLOBALS-RRM-OFF): pauseControls "off" +
   * ≥1 persistent motion ⇒ warn that no WCAG-2.2.2 pause path is emitted. Done
   * here (not in validateGlobals) because it needs the catalog + resolved
   * motions to know which primitives are a11y.persistent. */
  if (spec.globals && spec.globals.pauseControls === "off" && hasPersistentMotion(spec, catalog))
    warnings.push({ code: "MS-GLOBALS-PAUSE-OFF", message: "globals.pauseControls is \"off\" but the spec contains a persistent (looping >5s) motion — the compiler emits no pause/stop control (WCAG 2.2.2). Recommendation: \"auto\"." });

  return { ok: errors.length === 0, errors, errorCodes, deprecations, warnings };
}

/* True if the spec references at least one motion whose primitive is
 * a11y.persistent (an infinite/looping animation). Shared by the validator
 * (PAUSE-OFF warning) and the compilers (whether to emit the pause path). */
function hasPersistentMotion(spec, catalog) {
  if (!spec || !Array.isArray(spec.motions) || !catalog) return false;
  return spec.motions.some((m) => {
    const prim = m && catalog[m.primitive];
    return !!(prim && prim.a11y && prim.a11y.persistent === true);
  });
}

/* Phase B security: cap spec payload BEFORE any work (MS-INPUT-TOO-LARGE). A
 * spec is small by nature (a few motions); anything larger is abuse/DoS. 64 KB
 * is generous. Single source of truth — the MCP layer (register-tools.js)
 * imports this instead of redefining it, so the cap can never drift. */
const MAX_SPEC_BYTES = 64 * 1024;

module.exports = {
  validateSpec, safeSelector, ID_RE, deprecationsFor, unsafeToken, MAX_SPEC_BYTES,
  hasPersistentMotion,
  SPEC_VERSIONS, DEPRECATED_VERSIONS, TARGETS,
  TOP_KEYS, META_KEYS, GLOBALS_KEYS, MOTION_KEYS, PAUSE_CONTROLS,
};
