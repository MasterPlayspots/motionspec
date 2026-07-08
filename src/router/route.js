"use strict";
/*
 * Model routing (stage A) — request to spec.  Concept doc chapter 8.
 *
 *   request -> cache?
 *           -> small model -> extract JSON -> TRUST BOUNDARY
 *           -> on error: exactly ONE repair attempt (errors as context)
 *           -> on repeated failure or self-escalation by the model:
 *              { escalate: true } — signal for +1 / catalog growth.
 *
 * Every request produces one telemetry data point (concept doc §3.3).
 */
const { loadCatalog, catalogVersion } = require("../compiler/catalog.js");
const { validateSpec } = require("../compiler/validate.js");
const { buildSystemPrompt, buildRepairPrompt } = require("./prompt.js");
const cache = require("./cache.js");
const telemetry = require("./telemetry.js");

/* Audit #11: startup sweep once per process — expired cache entries are
 * removed on the first routing call (sweep() was previously never called). */
let swept = false;
function sweepOnce() {
  if (swept) return;
  swept = true;
  try { cache.sweep(); } catch { /* cache hygiene must never block routing */ }
}

function extractJson(text) {
  if (typeof text !== "string") return null;
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); }
  catch { return null; }
}

/**
 * @typedef {Object} RouteResult
 * @property {boolean} ok - true if a valid spec was produced
 * @property {Object} [spec] - the validated MotionSpec, only when ok=true
 * @property {"cache"|"model"|"model-repaired"} [source] - origin of the spec, only when ok=true
 * @property {boolean} [escalate] - true if no primitive fits or the spec stayed invalid (ok=false)
 * @property {string} [reason] - escalation reason, only when ok=false
 * @property {string[]} [errors] - validation errors of the last attempt, if any
 * @property {number} attempts - number of model attempts (0 on a cache hit)
 * @property {number} ms - duration in milliseconds
 */
/**
 * Routes a natural-language request through cache -> model -> trust boundary
 * (with exactly one repair attempt) to a validated MotionSpec. Every request
 * produces one telemetry data point.
 * @param {string} request - the request in natural language
 * @param {{client: {name: string, complete: Function}, catalog?: Object, target?: string, noCache?: boolean}} opts - client is required
 * @returns {Promise<RouteResult>}
 */
async function route(request, opts) {
  const o = opts || {};
  const t0 = Date.now();
  const catalog = o.catalog || loadCatalog();
  const catVer = catalogVersion(catalog);
  const target = o.target || "vanilla-gsap";
  const client = o.client;
  if (!client) throw new Error("route(): opts.client is missing (mockClient or openAICompatClient).");
  sweepOnce();

  /* ---- 1. Cache ---- */
  const k = cache.key(request, catVer, target);
  if (!o.noCache) {
    const hit = cache.get(k);
    if (hit) {
      /* Audit finding #2 (2026-06-12): cache hits pass through the trust
       * boundary AGAIN — fail-closed also applies to tampered/stale
       * cache files. Invalid hits are discarded. */
      const vc = validateSpec(hit, catalog);
      if (vc.ok) {
        telemetry.log({ outcome: "cache-hit", key: k, model: null, attempts: 0, ms: Date.now() - t0 });
        return { ok: true, spec: hit, source: "cache", attempts: 0, ms: Date.now() - t0 };
      }
      telemetry.log({ outcome: "cache-invalidated", key: k, model: null, attempts: 0, ms: Date.now() - t0 });
    }
  }

  /* ---- 2. Small model ---- */
  const system = buildSystemPrompt(catalog);
  let raw, parsed, errors = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const user = attempt === 1 ? "Request: " + request : buildRepairPrompt(request, raw, errors);
    try { raw = await client.complete(system, user); }
    catch (e) {
      /* Audit finding #8: transport errors are an escalation, not an exception. */
      telemetry.log({ outcome: "escalate-transport", key: k, model: client.name, attempts: attempt, ms: Date.now() - t0, error: String(e.message).slice(0, 200) });
      return { ok: false, escalate: true, reason: "Model transport error: " + String(e.message).slice(0, 200), attempts: attempt, ms: Date.now() - t0 };
    }
    parsed = extractJson(raw);

    if (!parsed) { errors = ["Output is not parseable JSON."]; continue; }

    /* Self-escalation by the model: the request is outside the catalog */
    if (parsed.escalate === true) {
      telemetry.log({ outcome: "escalate-no-primitive", key: k, model: client.name, attempts: attempt, ms: Date.now() - t0, reason: parsed.reason || null, request: String(request).slice(0, 500) });
      return { ok: false, escalate: true, reason: parsed.reason || "No matching primitive in the catalog.", attempts: attempt, ms: Date.now() - t0 };
    }

    /* ---- 3. TRUST BOUNDARY ---- */
    const v = validateSpec(parsed, catalog);
    if (v.ok) {
      cache.set(k, parsed);
      const source = attempt === 1 ? "model" : "model-repaired";
      telemetry.log({ outcome: source, key: k, model: client.name, attempts: attempt, ms: Date.now() - t0 });
      return { ok: true, spec: parsed, source, attempts: attempt, ms: Date.now() - t0 };
    }
    errors = v.errors;
  }

  /* ---- 4. Escalation after a failed repair ---- */
  telemetry.log({ outcome: "escalate-invalid", key: k, model: client.name, attempts: 2, ms: Date.now() - t0, errors, request: String(request).slice(0, 500) });
  return { ok: false, escalate: true, reason: "Spec still invalid after the repair attempt.", errors, attempts: 2, ms: Date.now() - t0 };
}

module.exports = { route, extractJson };
