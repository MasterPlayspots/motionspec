"use strict";
/*
 * Catalog SemVer diff-gate — makes ADR-0001 D2 machine-checkable.
 * ----------------------------------------------------------------------
 * D2 says catalog changes follow SemVer:
 *   patch = template/purpose fix (no contract change)
 *   minor = new OPTIONAL param, or a new primitive
 *   major = removed/renamed primitive, removed param, type change,
 *           a param made required, or TIGHTENED bounds (min raised / max
 *           lowered / pattern added or changed)
 *
 * The meta-schema only checks the version FORMAT. This module checks the
 * version DIRECTION: given the released baseline (catalog.lock.json) and the
 * current catalog, it classifies each primitive's change and asserts the
 * version bump is at least the required class. A tightened bound shipped as a
 * "patch" is a violation the test will catch.
 *
 * Baseline semantics: the lockfile is the LAST RELEASED state. You bump a
 * primitive's version in its .json when you change it; the lock stays put
 * until you deliberately relock at release time (`npm run catalog-lock`).
 */

function snapshotPrimitive(p) {
  const params = {};
  const ps = p.paramSchema || {};
  Object.keys(ps).sort().forEach((k) => {
    const d = ps[k] || {};
    params[k] = {
      type: d.type,
      required: !!d.required,
      min: typeof d.min === "number" ? d.min : null,
      max: typeof d.max === "number" ? d.max : null,
      pattern: typeof d.pattern === "string" ? d.pattern : null,
    };
  });
  return { version: p.version, output: p.output, params };
}

function snapshotCatalog(catalog) {
  const out = {};
  Object.keys(catalog).sort().forEach((name) => { out[name] = snapshotPrimitive(catalog[name]); });
  return out;
}

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v));
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function cmpSemver(a, b) {
  const x = parseSemver(a), y = parseSemver(b);
  if (!x || !y) return null;
  if (x.major !== y.major) return x.major - y.major;
  if (x.minor !== y.minor) return x.minor - y.minor;
  return x.patch - y.patch;
}

/* Classify the contract change of ONE primitive between baseline and current.
 * Returns { class: "major"|"minor"|"patch"|"none", reasons: [] }. */
function classifyChange(prev, curr) {
  const reasons = [];
  let cls = "none";
  const bump = (level, why) => {
    reasons.push(why);
    const rank = { none: 0, patch: 1, minor: 2, major: 3 };
    if (rank[level] > rank[cls]) cls = level;
  };

  if (prev.output !== curr.output) bump("major", "output changed " + prev.output + "->" + curr.output);

  const prevKeys = Object.keys(prev.params);
  const currKeys = Object.keys(curr.params);

  prevKeys.forEach((k) => {
    if (!(k in curr.params)) { bump("major", "param removed: " + k); return; }
    const a = prev.params[k], b = curr.params[k];
    if (a.type !== b.type) bump("major", "param type changed: " + k + " " + a.type + "->" + b.type);
    if (!a.required && b.required) bump("major", "param made required: " + k);
    if (a.min !== null && (b.min === null || b.min > a.min)) bump("major", "min raised: " + k + " " + a.min + "->" + b.min);
    if (a.max !== null && (b.max === null || b.max < a.max)) bump("major", "max lowered: " + k + " " + a.max + "->" + b.max);
    if (a.pattern === null && b.pattern !== null) bump("major", "pattern added: " + k);
    else if (a.pattern !== null && b.pattern !== a.pattern) bump("major", "pattern changed: " + k);
  });

  currKeys.forEach((k) => {
    if (!(k in prev.params)) {
      if (curr.params[k].required) bump("major", "new REQUIRED param: " + k);
      else bump("minor", "new optional param: " + k);
    }
  });

  // Any non-structural diff (template/purpose) is detected by the caller via
  // the catalogVersion hash; here, if nothing above fired, it's at most patch.
  return { class: cls, reasons };
}

/* Diff baseline lock vs current catalog snapshot.
 * Returns { violations: [{name, msg}], added: [], removed: [] }. */
function diffCatalog(lock, current) {
  const violations = [];
  const added = [];
  const removed = [];

  Object.keys(lock).forEach((name) => {
    if (!(name in current)) {
      removed.push(name);
      violations.push({ name, msg: 'primitive "' + name + '" REMOVED — breaking (major) catalog change. Acknowledge: update catalog.lock.json and note it as breaking.' });
    }
  });

  Object.keys(current).forEach((name) => {
    if (!(name in lock)) { added.push(name); return; } // new primitive = minor, allowed
    const prev = lock[name], curr = current[name];
    const { class: cls, reasons } = classifyChange(prev, curr);
    const c = cmpSemver(curr.version, prev.version);

    if (cls === "major" && !(parseSemver(curr.version).major > parseSemver(prev.version).major)) {
      violations.push({ name, msg: '"' + name + '" needs a MAJOR bump (was ' + prev.version + ", now " + curr.version + "). Reason(s): " + reasons.join("; ") });
    } else if (cls === "minor") {
      const pv = parseSemver(prev.version), cv = parseSemver(curr.version);
      const okMinor = cv.major > pv.major || (cv.major === pv.major && cv.minor > pv.minor);
      if (!okMinor) violations.push({ name, msg: '"' + name + '" needs at least a MINOR bump (was ' + prev.version + ", now " + curr.version + "). Reason(s): " + reasons.join("; ") });
    } else if (cls === "patch") {
      if (c !== null && c <= 0) violations.push({ name, msg: '"' + name + '" changed but version not bumped (still ' + curr.version + ")." });
    }
    // class "none": no contract change; version may stay or move, no constraint.
  });

  return { violations, added, removed };
}

module.exports = { snapshotPrimitive, snapshotCatalog, classifyChange, diffCatalog, parseSemver, cmpSemver };
