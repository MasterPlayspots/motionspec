"use strict";
/*
 * Telemetry — every routed request is a data point (concept doc §3.3).
 * If 'escalate' piles up for one class of requests, that is the signal to
 * add a new primitive to the catalog (capacity -1 <- +1).
 *
 * Phase C / C1: storage goes through a swappable sink (see
 * telemetry-sink.js).  Default is the FileSink (JSONL, append-only,
 * telemetry/events.jsonl, gitignored) — behavior-identical to before.  On the
 * Worker an AnalyticsEngineSink is attached via setSink().  The
 * aggregation (byOutcome/escalations) stays here; the sink does I/O only.
 *
 * Audit findings #7/#12 (2026-06-12): every field is length-capped so no
 * huge request/error field bloats the storage.  #17: validate noise is
 * recognizable as an outcome and is hidden from the escalation view.
 */
const path = require("path");
const { FileSink } = require("./telemetry-sink.js");

const MAX_FIELD = 500;
const NOISE_OUTCOMES = ["mcp-validate-ok", "mcp-validate-fail", "cache-hit", "cache-invalidated"];

/* Resolve the default telemetry file LAZILY: __dirname only exists in Node (CJS),
 * not in the ESM worker bundle.  The worker installs an fs-free sink via
 * setSink() BEFORE anything is logged, so the file is never computed there. */
let _defaultFile = null;
function defaultTelemetryFile() {
  if (_defaultFile === null) _defaultFile = path.join(__dirname, "..", "..", "telemetry", "events.jsonl");
  return _defaultFile;
}

let sink = null;
function activeSink() {
  if (sink === null) sink = new FileSink(defaultTelemetryFile());
  return sink;
}
function setSink(s) { sink = s; }
function getSink() { return activeSink(); }

function clamp(v) {
  if (typeof v === "string") return v.length > MAX_FIELD ? v.slice(0, MAX_FIELD) : v;
  if (Array.isArray(v)) return v.slice(0, 20).map(clamp);
  return v;
}

function log(event) {
  const safe = {};
  for (const k of Object.keys(event)) safe[k] = clamp(event[k]);
  safe.ts = new Date().toISOString();
  try { activeSink().append(safe); } catch { /* never propagate sink errors to the caller */ }
}

async function summary() {
  const records = await activeSink().readAll();
  const byOutcome = {};
  const escalations = {};
  const avgMs = {};
  const totalAttempts = {};
  let total = 0;
  for (const e of records) {
    /* TASK-020: the AE sink returns ONE aggregated row per outcome with a count;
     * File-/MemorySink return individual records without count -> count 1 each. */
    const n = e.count || 1;
    total += n;
    byOutcome[e.outcome] = (byOutcome[e.outcome] || 0) + n;
    if (e.avg_ms !== undefined) avgMs[e.outcome] = Math.round(e.avg_ms || 0);
    totalAttempts[e.outcome] = (totalAttempts[e.outcome] || 0) + (e.attempts || 0);
    /* #17: only real escalations count toward the catalog growth signal */
    if (typeof e.outcome === "string" && e.outcome.startsWith("escalate") && NOISE_OUTCOMES.indexOf(e.outcome) === -1)
      escalations[e.outcome] = (escalations[e.outcome] || 0) + n;
  }
  return { total, byOutcome, escalations, avgMs, totalAttempts };
}

module.exports = { log, summary, setSink, getSink, NOISE_OUTCOMES };
/* Keep TELEMETRY_FILE as a lazy getter (tests read it; no __dirname at load time). */
Object.defineProperty(module.exports, "TELEMETRY_FILE", { enumerable: true, get: defaultTelemetryFile });
