"use strict";
/*
 * Model clients for stage A.
 *
 *   openAICompatClient — any OpenAI-compatible endpoint (OpenRouter,
 *     Anthropic gateway, local vLLM ...). Config via options or env:
 *     MOTION_BASE_URL (default: https://openrouter.ai/api/v1)
 *     MOTION_MODEL    (default: anthropic/claude-haiku-4.5)
 *     MOTION_API_KEY  or OPENROUTER_API_KEY
 *
 *   mockClient — deterministic offline client for tests & demos.
 *     Simulates a small model via keyword mapping; can optionally make a
 *     typical model mistake on the first attempt (for repair-loop
 *     tests).
 */

function openAICompatClient(opts) {
  const o = opts || {};
  const baseURL = o.baseURL || process.env.MOTION_BASE_URL || "https://openrouter.ai/api/v1";
  const apiKey = o.apiKey || process.env.MOTION_API_KEY || process.env.OPENROUTER_API_KEY;
  const model = o.model || process.env.MOTION_MODEL || "anthropic/claude-haiku-4.5";
  if (!apiKey) throw new Error("No API key (MOTION_API_KEY / OPENROUTER_API_KEY).");

  return {
    name: model,
    async complete(system, user) {
      const res = await fetch(baseURL.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error("Model API " + res.status + ": " + (await res.text()).slice(0, 300));
      const data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message.content) || "";
    },
  };
}

/* ---------------------------------------------------------------- */

/* Keyword heuristic from the shared source (TASK-025) — identical to
 * discover.js, so the mock knows the same primitive set as the gap report. */
const { KEYWORD_MAP: KEYWORDS } = require("../compiler/keyword-map.js");

function mockClient(opts) {
  const o = opts || {};
  let calls = 0;
  return {
    name: "mock-small-model",
    async complete(system, user) {
      calls++;
      /* Optional: the first attempt returns a typical model mistake */
      if (o.failFirst && calls === 1) {
        return JSON.stringify({
          specVersion: "1.0",
          meta: { target: "vanilla-gsap" },
          motions: [{ id: "bad motion!", primitive: "magicSparkle", target: ".hero" }],
        });
      }
      const request = user.includes("Request:") ? user : user;
      const motions = [];
      const used = new Set();
      for (const k of KEYWORDS) {
        if (k.re.test(request) && !used.has(k.primitive)) {
          used.add(k.primitive);
          motions.push({
            id: k.primitive.toLowerCase() + "-" + motions.length,
            primitive: k.primitive,
            target: k.target,
            params: k.params,
          });
        }
      }
      if (motions.length === 0)
        return JSON.stringify({ escalate: true, reason: "No catalog primitive matches the request." });
      return JSON.stringify({
        specVersion: "1.0",
        meta: { project: "request", target: "vanilla-gsap", createdWith: "mock-small-model" },
        globals: { respectReducedMotion: true },
        motions,
      });
    },
  };
}

/* ---------------------------------------------------------------- */

/* Deterministic offline client for the forge generator (building block 4) — like
 * mockClient, but it returns a PRIMITIVE bundle (not a spec). Enables
 * `forge generate --mock` and tests without a real model. Options:
 *   failFirst : the first call returns a budget-busting bundle (repair loop)
 *   alwaysBad : every call returns a broken bundle (to test escalation) */
function mockForgeClient(opts) {
  const o = opts || {};
  let calls = 0;

  function goodReveal(intent, target) {
    return {
      name: intent || "generated motion",
      version: "1.0.0",
      output: "js",
      engine: "gsap.ScrollTrigger",
      purpose: "Mock reveal for: " + (intent || "?"),
      cost: 1,
      reducedMotionFallback: "instant-visible",
      paramSchema: {
        from: { type: "transform", required: true },
        duration: { type: "number", default: 0.8, min: 0.1, max: 3 },
        ease: { type: "string", default: "power3.out" },
      },
      triggerDefaults: { start: "top 80%", once: true },
      template: "gsap.from({{target}}, Object.assign({{params.from}}, { duration: {{params.duration}}, ease: {{params.ease}}, scrollTrigger: { trigger: {{target}}, start: {{trigger.start}}, once: {{trigger.once}} } }));",
      exampleSpec: { specVersion: "1.0", meta: { project: "mock", target: "vanilla-gsap" }, globals: { respectReducedMotion: true }, motions: [{ id: "m1", primitive: "x", target: target || ".target", params: { from: { opacity: 0, y: 24 } } }] },
      keywordRule: { source: "(mockreveal|testblende)", flags: "i", target: target || ".target", params: { from: { opacity: 0, y: 24 } } },
    };
  }

  function badBundle(intent, target) {
    // compilable, but cost 99 -> the budget gate (stage 4) fails.
    return {
      name: (intent || "bad") + " expensive",
      version: "1.0.0", output: "js", engine: "gsap", purpose: "deliberately expensive", cost: 99,
      reducedMotionFallback: "instant-visible", paramSchema: {}, triggerDefaults: {},
      template: "console.log({{target}});",
      exampleSpec: { specVersion: "1.0", meta: { project: "mock", target: "vanilla-gsap" }, globals: { respectReducedMotion: true }, motions: [{ id: "m1", primitive: "x", target: target || ".target", params: {} }] },
    };
  }

  return {
    name: "mock-forge",
    async complete(system, user) {
      calls++;
      const intent = (/Motion intent \(catalog gap\): (.+)/.exec(user) || [])[1] || "generated motion";
      const target = (/Example target selector: (.+)/.exec(user) || [])[1] || ".target";
      if (o.alwaysBad) return JSON.stringify(badBundle(intent, target));
      if (o.failFirst && calls === 1) return JSON.stringify(badBundle(intent, target));
      return JSON.stringify(goodReveal(intent, target));
    },
  };
}

module.exports = { openAICompatClient, mockClient, mockForgeClient };
