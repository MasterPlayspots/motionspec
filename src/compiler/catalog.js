"use strict";
/*
 * Primitive catalog — loading + meta-schema + versioning
 *
 * Audit finding #8 (2026-06-12): primitive files are themselves a trust
 * boundary. Every file is checked against a meta-schema on load
 * (fail-closed): size limits, required fields, allowed paramSchema
 * types and ReDoS screening for pattern fields.
 *
 * catalogVersion = hash over all primitive definitions -> the cache key
 * invalidates automatically on every catalog change (patches included).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");


const MAX_FILE_BYTES = 64 * 1024;
const MAX_TEMPLATE_CHARS = 4096;
const MAX_PATTERN_CHARS = 100;
const NAME_RE = /^[A-Za-z][A-Za-z0-9]{1,40}$/;
const PARAM_TYPES = ["number", "string", "boolean", "transform"];
const OUTPUTS = ["js", "css"];
/* ReDoS heuristic: nested quantifiers such as (a+)+ or (a*)* */
const NESTED_QUANTIFIER_RE = /\([^)]*[+*][^)]*\)\s*[+*{]/;

function screenPattern(pat, where, fail) {
  if (typeof pat !== "string") fail(where + ": pattern must be a string.");
  if (pat.length > MAX_PATTERN_CHARS) fail(where + ": pattern too long (>" + MAX_PATTERN_CHARS + ").");
  if (NESTED_QUANTIFIER_RE.test(pat)) fail(where + ": pattern contains nested quantifiers (ReDoS risk).");
  try { new RegExp(pat); } catch (e) { fail(where + ": pattern is not a valid regular expression (" + e.message + ")."); }
}

function checkPrimitive(p, file) {
  const fail = (msg) => { throw new Error("Catalog rejected (" + file + "): " + msg); };
  if (typeof p !== "object" || p === null || Array.isArray(p)) fail("not an object");
  if (!NAME_RE.test(p.name || "")) fail("name missing or violates " + NAME_RE);
  if (typeof p.version !== "string" || !/^\d+\.\d+\.\d+$/.test(p.version)) fail("version missing or not SemVer.");
  if (OUTPUTS.indexOf(p.output) === -1) fail('output must be "js" or "css".');
  if (typeof p.template !== "string" || !p.template) fail("template missing.");
  if (p.template.length > MAX_TEMPLATE_CHARS) fail("template too long (>" + MAX_TEMPLATE_CHARS + ").");
  const ps = p.paramSchema || {};
  if (typeof ps !== "object" || ps === null) fail("paramSchema must be an object.");
  Object.keys(ps).forEach((k) => {
    const def = ps[k];
    if (typeof def !== "object" || def === null) fail('paramSchema.' + k + " must be an object.");
    if (PARAM_TYPES.indexOf(def.type) === -1) fail('paramSchema.' + k + ".type not allowed (allowed: " + PARAM_TYPES.join(", ") + ").");
    if (def.pattern !== undefined) screenPattern(def.pattern, "paramSchema." + k, fail);
  });
  return p;
}

/* Phase C / C3: pure catalog build from already-parsed primitive objects
 * (no fs) — so the Cloudflare Worker produces the bundled catalog with exactly
 * the same validation + the same pin as loadCatalog().  Order is irrelevant:
 * catalogVersion() sorts by name. */
function buildCatalog(primitives) {
  const cat = {};
  primitives.forEach((p, i) => {
    checkPrimitive(p, (p && p.name) ? p.name : ("#" + i));
    if (cat[p.name]) throw new Error("Duplicate primitive: " + p.name);
    cat[p.name] = p;
  });
  return cat;
}

function loadCatalog(dir) {
  const d = dir || path.join(__dirname, "..", "..", "primitives");
  const cat = {};
  fs.readdirSync(d)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .forEach((f) => {
      const full = path.join(d, f);
      const stat = fs.statSync(full);
      if (stat.size > MAX_FILE_BYTES) throw new Error("Catalog rejected (" + f + "): file too large (>" + MAX_FILE_BYTES + " bytes).");
      let p;
      try { p = JSON.parse(fs.readFileSync(full, "utf8")); }
      catch (e) { throw new Error("Catalog rejected (" + f + "): not valid JSON (" + e.message + ").", { cause: e }); }
      checkPrimitive(p, f);
      if (cat[p.name]) throw new Error("Duplicate primitive: " + p.name);
      cat[p.name] = p;
    });
  return cat;
}

function catalogVersion(catalog) {
  const stable = JSON.stringify(
    Object.keys(catalog).sort().map((k) => catalog[k])
  );
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

/* Shared catalog summary (TASK-026, audit #23). Previously there were two
 * diverging implementations (prompt.js 4 fields, register-tools.js 8). One
 * source: the default is all 8 fields; an optional fields subset returns fewer
 * (e.g. for a leaner prompt). Primitives sorted by name. */
function catalogSummary(catalog, fields) {
  const ALL = ["name", "version", "purpose", "engine", "cost", "paramSchema", "triggerDefaults", "reducedMotionFallback"];
  const pick = Array.isArray(fields) ? fields : ALL;
  return Object.keys(catalog).sort().map((name) => {
    const p = catalog[name];
    const full = {
      name,
      version: p.version,
      purpose: p.purpose,
      engine: p.engine,
      cost: (p.performance && p.performance.cost) || 0,
      paramSchema: p.paramSchema || {},
      triggerDefaults: p.triggerDefaults || {},
      reducedMotionFallback: (p.a11y && p.a11y.reducedMotionFallback) || null,
    };
    if (pick === ALL) return full;
    const o = {};
    pick.forEach((f) => { o[f] = full[f]; });
    return o;
  });
}

module.exports = { loadCatalog, buildCatalog, catalogVersion, checkPrimitive, catalogSummary, screenPattern };
