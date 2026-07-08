"use strict";
/*
 * Stage A — prompt builder
 * The small model receives: the task, schema rules, the catalog (names +
 * paramSchemas as a guardrail) and few-shot examples. It may output ONLY
 * JSON. Everything beyond that is enforced by the trust boundary.
 */

const FEW_SHOT = [
  {
    request: "Die Hero-Überschrift soll beim Scrollen sanft von unten einblenden.",
    spec: {
      specVersion: "1.0",
      meta: { project: "request", target: "vanilla-gsap", createdWith: "router" },
      globals: { respectReducedMotion: true },
      motions: [
        {
          id: "hero-headline",
          primitive: "scrollReveal",
          target: ".hero h1",
          params: { from: { opacity: 0, y: 48 }, duration: 0.8 },
          trigger: { start: "top 80%", once: true },
        },
      ],
    },
  },
  {
    request: "Three feature cards should appear one after another, and the section header pins while you scroll through.",
    spec: {
      specVersion: "1.0",
      meta: { project: "request", target: "vanilla-gsap", createdWith: "router" },
      globals: { respectReducedMotion: true },
      motions: [
        {
          id: "feature-cards",
          primitive: "staggerReveal",
          target: ".features .card",
          params: { from: { opacity: 0, y: 32 }, stagger: 0.12 },
        },
        {
          id: "features-pin",
          primitive: "pinnedSection",
          target: ".features",
          params: { distance: "+=100%" },
        },
      ],
    },
  },
];

/* Shared catalog summary (TASK-026) — one source in catalog.js. */
const { catalogSummary } = require("../compiler/catalog.js");

function buildSystemPrompt(catalog) {
  return [
    "You are a translator of natural-language motion requests into MotionSpec JSON (specVersion 1.0).",
    "You output ONLY a single JSON object. No Markdown, no text before or after it.",
    "",
    "HARD RULES:",
    '1. "primitive" MUST be one of these catalog names: ' + Object.keys(catalog).sort().join(", ") + ". Nothing else exists. Never invent a primitive.",
    "2. Parameters only from the paramSchema of the respective primitive; respect min/max. Omit a parameter when the default fits.",
    '3. "target" is a plain CSS selector without quotes/special characters (e.g. .hero h1, #cta, .features .card).',
    '4. "id" only [A-Za-z0-9_-], descriptive, unique.',
    '5. meta.target is always "vanilla-gsap". globals.respectReducedMotion is always true.',
    "6. If the request asks for something that NO catalog primitive covers, output instead:",
    '   {"escalate": true, "reason": "<short justification of which primitive is missing>"}',
    "",
    "CATALOG (guardrail):",
    JSON.stringify(catalogSummary(catalog), null, 1),
    "",
    "EXAMPLES:",
    ...FEW_SHOT.map(
      (ex) => "Request: " + ex.request + "\nOutput: " + JSON.stringify(ex.spec)
    ),
  ].join("\n");
}

function buildRepairPrompt(request, badOutput, errors) {
  return [
    "Your previous output for the request did NOT pass schema validation.",
    "Request: " + request,
    "Your output was:",
    badOutput,
    "Validation errors:",
    ...errors.map((e) => "- " + e),
    "Now output the corrected, complete MotionSpec as a single JSON object. JSON only.",
  ].join("\n");
}

module.exports = { buildSystemPrompt, buildRepairPrompt, catalogSummary, FEW_SHOT };
