"use strict";
/*
 * Forge prioritizer — which catalog gap comes next? Pure, deterministic.
 *
 * Turns accumulated `discover` gap reports (status GAP) plus optional
 * Analytics Engine telemetry into a deterministic build queue. DECIDES
 * nothing and builds nothing — it only delivers the order (discover.js
 * philosophy: gaps are prioritized, never silently patched).
 *
 * Grounded in the real discover output (`src/discover/discover.js`): a gap is
 *   { i, what, target, reason }
 * The pack-01 skeleton called the intent field `intent`; in reality it is `what`.
 * We accept both keys so hand-curated gap lists and real discover reports
 * are treated the same.
 */

/** Normalizes an intent text into a stable grouping key. */
function normalize(intentText) {
  return String(intentText == null ? "" : intentText)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Reads a gap's intent text robustly (real: `what`, skeleton/legacy: `intent`). */
function intentOf(gap) {
  if (!gap || typeof gap !== "object") return "";
  return gap.what != null ? gap.what : gap.intent;
}

/**
 * @param {Array<{what?:string,intent?:string,target?:string}>} gaps
 *   discover gaps (status GAP) or hand-curated equivalents.
 * @param {Array<{pattern:string,count:number}>} [telemetry]
 *   Aggregated live signals (e.g. how often an intent failed/escalated).
 *   `count` amplifies the frequency of the matching pattern.
 * @returns {Array<{gapKey:string,pattern:string,frequency:number,exemplars:string[],score:number}>}
 *   Descending by score, deterministic tiebreak by gapKey.
 */
function prioritize(gaps, telemetry = []) {
  const byPattern = new Map();

  for (const g of Array.isArray(gaps) ? gaps : []) {
    const key = normalize(intentOf(g));
    if (!key) continue; // ignore empty/broken entries instead of guessing
    const e = byPattern.get(key) || { gapKey: key, pattern: key, frequency: 0, exemplars: [] };
    e.frequency += 1;
    const target = g && g.target;
    if (target && !e.exemplars.includes(target)) e.exemplars.push(target);
    byPattern.set(key, e);
  }

  for (const t of Array.isArray(telemetry) ? telemetry : []) {
    if (!t) continue;
    const e = byPattern.get(normalize(t.pattern));
    if (e) e.frequency += Number(t.count) || 0; // telemetry amplifies existing patterns
  }

  const out = [...byPattern.values()].map((e) => ({ ...e, score: e.frequency /* x value weight later */ }));
  return out.sort((a, b) => b.score - a.score || a.gapKey.localeCompare(b.gapKey));
}

module.exports = { prioritize, normalize, intentOf };
