"use strict";
/*
 * register-tools — runtime-agnostic registration of the MotionSpec MCP tools
 * (phase C / C2).  Registers the four motion_ tools on a provided
 * McpServer.  NO stdio/process/createRequire assumptions: the caller
 * injects the catalog state (getCatalog/getCatVer); transport, catalog
 * reload and logging belong to the respective entrypoint (stdio: server.mjs,
 * worker: fetch handler).  This way stdio and worker share exactly the same
 * tool logic — one source of truth (ADR-0001 trust boundary).
 */
const { z } = require("zod");
const { validateSpec, MAX_SPEC_BYTES } = require("../compiler/validate.js");
const { compileSpec } = require("../compiler/compile.js");
const telemetry = require("../router/telemetry.js");

/* Phase B security: cap MCP input size BEFORE any work. MAX_SPEC_BYTES is the
 * single source in validate.js (MS-INPUT-TOO-LARGE) — imported, never redefined. */
function oversizeError(spec) {
  let bytes = Infinity;
  try { bytes = Buffer.byteLength(JSON.stringify(spec) || "", "utf8"); } catch { /* circular/garbage */ }
  if (bytes > MAX_SPEC_BYTES) {
    return { code: "MS-INPUT-TOO-LARGE", message: "spec exceeds " + MAX_SPEC_BYTES + " bytes (" + bytes + "). Reject without processing." };
  }
  return null;
}

const AUTHORING_RULES = [
  'Write a MotionSpec JSON object (specVersion "1.0").',
  '1. "primitive" MUST be a catalog name — nothing else exists. Never invent one.',
  "2. Params only from the primitive's paramSchema; respect min/max. Omit a param to use its default.",
  '3. "target" is a plain CSS selector without quotes/special characters (e.g. .hero h1, #cta).',
  '4. "id" matches [A-Za-z0-9_-]{1,64}, descriptive, unique per motion.',
  '5. meta.target is "vanilla-gsap". Set globals.respectReducedMotion: true.',
  "6. If no catalog primitive covers the request, do NOT improvise — tell the user which primitive is missing (this is an escalation signal).",
].join("\n");

/* Catalog summary from the shared source (TASK-026). */
const { catalogSummary } = require("../compiler/catalog.js");

/* Registers the four tools.  deps.getCatalog()/getCatVer() always return the
 * CURRENT catalog (stdio can reload via SIGHUP; the worker serves the
 * bundled catalog statically). */
function registerMotionspecTools(server, deps) {
  const getCatalog = deps.getCatalog;
  const getCatVer = deps.getCatVer;

  server.registerTool(
    "motion_catalog",
    {
      title: "MotionSpec catalog & authoring rules",
      description:
        "Returns the catalog of verified motion primitives (names, purpose, parameter schemas, defaults) plus the authoring rules for writing a MotionSpec. Call this FIRST, then write the spec yourself and pass it to motion_compile.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const out = {
        catalogVersion: getCatVer(),
        specVersion: "1.0",
        authoringRules: AUTHORING_RULES,
        primitives: catalogSummary(getCatalog()),
        exampleSpec: {
          specVersion: "1.0",
          meta: { project: "example", target: "vanilla-gsap", createdWith: "mcp-host" },
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
      };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out };
    }
  );

  server.registerTool(
    "motion_validate",
    {
      title: "Validate a MotionSpec (trust boundary)",
      description:
        "Checks a MotionSpec against the schema, the primitive allow-list, parameter bounds and injection rules. Fail-closed: returns ok=false with precise errors. Use to pre-check a spec before compiling.",
      inputSchema: { spec: z.record(z.string(), z.any()).describe("The MotionSpec JSON object") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ spec }) => {
      const catVer = getCatVer();
      const big = oversizeError(spec);
      if (big) {
        const out = { ok: false, errors: ["[" + big.code + "] " + big.message], deprecations: [], catalogVersion: catVer };
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out, isError: true };
      }
      const v = validateSpec(spec, getCatalog());
      telemetry.log({ outcome: v.ok ? "mcp-validate-ok" : "mcp-validate-fail", model: "mcp-host", attempts: 1, errors: v.ok ? undefined : v.errors });
      const out = { ok: v.ok, errors: v.errors || [], deprecations: v.deprecations || [], catalogVersion: catVer };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out };
    }
  );

  server.registerTool(
    "motion_compile",
    {
      title: "Compile a MotionSpec to GSAP/CSS",
      description:
        "Validates (fail-closed) and deterministically compiles a MotionSpec into production-ready vanilla-GSAP JavaScript and CSS, with enforced prefers-reduced-motion fallbacks and a performance-budget report. Same spec always yields identical code. Returns {ok, js, css, report} or {ok:false, errors}.",
      inputSchema: {
        spec: z.record(z.string(), z.any()).describe("The MotionSpec JSON object"),
        specName: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional().describe("Optional name used in the artifact header"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ spec, specName }) => {
      const catVer = getCatVer();
      const big = oversizeError(spec);
      if (big) {
        const out = { ok: false, errors: ["[" + big.code + "] " + big.message], catalogVersion: catVer };
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out, isError: true };
      }
      const res = compileSpec(spec, getCatalog(), { specName: specName || "mcp-spec" });
      telemetry.log({ outcome: res.ok ? "mcp-compile-ok" : "mcp-compile-fail", model: "mcp-host", attempts: 1, errors: res.ok ? undefined : res.errors });
      const out = res.ok
        ? { ok: true, js: res.js, css: res.css, report: res.report, catalogVersion: catVer }
        : { ok: false, errors: res.errors, hint: "Fix the listed errors. Call motion_catalog to re-check allowed primitives and parameter bounds.", catalogVersion: catVer };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out, isError: !res.ok };
    }
  );

  server.registerTool(
    "motion_audit",
    {
      title: "Audit a live URL for motion accessibility (WCAG 2.2.2 / 2.3.3)",
      description:
        "Static motion-a11y checker: fetches a URL's HTML + linked stylesheets and scans the CSS for (1) animation/transition without a prefers-reduced-motion guard, (2) animated non-transform/opacity properties, (3) infinite animations with no pause path, (4) <marquee>/autoplay >5s. Runtime motion (WAAPI/GSAP/JS) is disclosed as 'not audited (V2)'. Returns {ok, score, findings, summary, badge, disclosures, markdown}; a clean site earns the badge 'reduced-motion-safe'. Does network I/O (openWorldHint).",
      inputSchema: { url: z.string().describe("The page URL to audit (http/https).") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url }) => {
      const { audit } = require("../audit/audit.js");
      let res;
      try { res = await audit(url); }
      catch (e) { res = { ok: false, error: "audit error" }; } /* never leak internals/PII */
      telemetry.log({ outcome: res.ok ? "mcp-audit-ok" : "mcp-audit-fail", model: "mcp-host", attempts: 1 });
      const out = res.ok
        ? { ok: true, url: res.url, score: res.score, badge: res.badge, findings: res.findings, summary: res.summary, disclosures: res.disclosures }
        : { ok: false, error: res.error || "fetch failed" };
      const text = res.ok ? res.markdown : ("Audit failed: " + out.error);
      return { content: [{ type: "text", text }], structuredContent: out, isError: !res.ok };
    }
  );

  server.registerTool(
    "motion_stats",
    {
      title: "MotionSpec usage telemetry",
      description:
        "Summary of routing/compile telemetry (counts per outcome). Escalation clusters indicate which new primitive the catalog needs next.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const s = await telemetry.summary();
      const out = { total: s.total, byOutcome: s.byOutcome, escalations: s.escalations, note: "escalations = catalog growth signal (validate/cache noise hidden)" };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out };
    }
  );
}

module.exports = { registerMotionspecTools, AUTHORING_RULES, MAX_SPEC_BYTES };
