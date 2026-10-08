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
  '7. WCAG 2.2.2: a primitive with "persistent": true keeps moving on its own and needs a pause/stop control. globals.pauseControls is "auto" (default, emits the control), "api" (you wire your own) or "off". Setting it to "off" with a persistent motion in the spec is a 2.2.2 violation and is reported in warnings[].',
  '8. warnings[] is advisory, not fatal: ok=true with a non-empty warnings[] means the spec compiles but does NOT meet the accessibility recommendation. Read it before you ship.',
].join("\n");

/* Catalog summary from the shared source (TASK-026). */
const { catalogSummary } = require("../compiler/catalog.js");

/* W1 → U04 (2026-09-04) — the keyless answer for a keyed tool. It now says what
 * the key costs and, above all, which routes are FREE: motion_validate on this
 * very server, the site check, and — for motion_compile — the local CLI. The W1
 * wording ("requires a key. Free check … Keys …") named two URLs and hid that
 * the compiler is MIT and runs locally for nothing; an agent that needed compile
 * hit a wall.
 *
 * The npm bin `motionspec` starts the stdio MCP server; the CLI bin is `motion`.
 * `npx motionspec compile x.json` therefore compiles NOTHING (measured
 * 2026-09-04 against motionspec@1.2.7: prints "[motionspec-mcp] ready", no out/).
 * Hence `npx -p motionspec motion compile <spec.json>` — verified the same day. */
const CHECK_URL = "motionspec.dev/motion-check";
/* Attribution (11.09.2026). The price page is attributed BY CONSTRUCTION — there
 * is no bare price-page literal (without ?src=) left in agent-facing code. The
 * site reads `?src=` from the landing URL, so a key bought after an agent relayed
 * the link can be attributed to the MCP channel. Texts say `mcp`, the structured
 * upgrade block says `mcp-<tool>` (keysUrlFor); both survive the site's cleaning
 * ([^A-Za-z0-9_-] stripped, max. 60) unchanged. */
const KEYS_URL = "motionspec.dev/pricing?src=mcp";
function keysUrlFor(tool) { return "https://" + KEYS_URL + "-" + tool; }
const LOCAL_COMPILE_CMD = "npx -p motionspec motion compile <spec.json>";
/* Dev Key is a SUBSCRIPTION ($39 per month, cancel anytime — /pricing, llms.txt),
 * never a one-off. The earlier "($39)" read as a one-time price next to
 * "($249/mo)"; `billing:"one-time"` in upgradeInfo() said so outright. */
const PAYWALL_PLANS = "a Dev Key ($39/mo) or Agency plan ($249/mo)";

function upgradeInfo(tool) {
  const url = keysUrlFor(tool);
  return {
    requiredFor: ["motion_compile", "motion_audit", "motion_stats"],
    plans: [
      { id: "dev-key", label: "Dev Key", price_usd: 39, billing: "monthly" },
      { id: "agency", label: "Agency plan", price_usd: 249, billing: "monthly" },
    ],
    url,
    header: "x-motionspec-key",
    freeLocalAlternative: "motion_compile runs locally for free: '" + LOCAL_COMPILE_CMD + "' (MIT).",
    selfServeCheckoutNotAutomatable: true,
    forAgents: "Unlocking " + tool + " needs a human with a payment method at " + url + ". Do not fetch that URL yourself or attempt checkout \u2014 surface this to your user/operator and stop.",
  };
}
function paywallHint(tool) {
  const free = tool === "motion_stats"
    ? "Free alternatives: motion_validate here and the free site check at " + CHECK_URL + "."
    : "Free alternatives: motion_validate here, the free site check at " + CHECK_URL +
      ", and motion_compile runs locally for free with '" + LOCAL_COMPILE_CMD + "' (MIT).";
  return tool + " requires " + PAYWALL_PLANS + ": " + KEYS_URL + ". " + free;
}

/* tools/list description of a stub: same facts, in front of the real description. */
function paywallDescription(tool, description) {
  return "Requires " + PAYWALL_PLANS + " on the hosted endpoint (" + KEYS_URL + ")" +
    (tool === "motion_compile" ? "; runs locally for free with '" + LOCAL_COMPILE_CMD + "' (MIT)" : "") +
    ". " + description;
}

/* U04 — WHO pressed the door handle. The hosted worker is stateless: a
 * tools/call POST carries no clientInfo, so getClientVersion() only yields a
 * name when the same POST also carried `initialize` (stdio: always). The worker
 * therefore passes deps.caller = { ua, keyPresented, isProbe }: the HTTP
 * User-Agent is the only per-request identity there is (no IP — never logged),
 * keyPresented tells "no key at all" from "a key that did not authenticate", and
 * isProbe(name, ua) is the worker's classifier (worker/probe-clients.mjs) — it
 * stays out of the npm package, so probe is 0 whenever no classifier is given.
 * probe: 1 marks known registry/directory probes so the paywall meter can
 * separate them from agents. Never throws. */
function describeCaller(server, caller) {
  let name = "";
  try {
    const inner = server && server.server;
    const info = inner && typeof inner.getClientVersion === "function" ? inner.getClientVersion() : null;
    if (info && info.name) name = String(info.name);
  } catch { /* telemetry never breaks a call */ }
  const ua = caller && typeof caller.ua === "string" ? caller.ua : "";
  let probe = 0;
  try { if (caller && typeof caller.isProbe === "function" && caller.isProbe(name, ua)) probe = 1; } catch { /* marking only */ }
  return {
    client: name || (ua ? "ua:" + ua : ""),
    ua,
    probe,
    reason: caller && caller.keyPresented ? "invalid-key" : "no-key",
  };
}

/* The stub must answer with the hint for ANY argument shape. The SDK validates
 * arguments against inputSchema BEFORE the handler runs, so with the original
 * (required) schema a probing keyless caller got
 * "Invalid arguments for tool motion_audit: expected string ... at url" instead
 * of the pointer to the price page — the very dead end this change removes.
 * The advertised field names stay visible in tools/list; they are merely not
 * required on the stub, which reads none of them. */
function optionalShape(shape) {
  if (!shape || typeof shape !== "object") return shape;
  const out = {};
  for (const k of Object.keys(shape)) {
    const v = shape[k];
    out[k] = v && typeof v.optional === "function" ? v.optional() : v;
  }
  return out;
}

/* W2.2 (2026-09-11) — ONE checker, one score. motion_audit runs the SAME engine
 * and the SAME scoring as the free site check (motionspec.dev/api): src/audit/
 * audit.js is a byte-identical copy of the site's checker (compare with
 * `diff`/md5 before every release — the two files must not drift), and the
 * result is shaped field for field like the
 * site's /api JSON. The fetch limits are the site's too (12 stylesheets, 8 s,
 * 2 MB): a page with 15 stylesheets would otherwise score differently here.
 * `score` is null when the page has no CSS motion (status 'not-measurable' —
 * an agent must not read that as 0/100); loading indicators are `review`
 * findings with no score impact. */
const AUDIT_OPTS = Object.freeze({ maxStylesheets: 12, timeoutMs: 8000, maxBytes: 2 * 1024 * 1024 });
function auditResult(res, engine) {
  const v2 = engine.groupAndScoreV2(res);
  return {
    ok: true,
    url: res.url,
    status: v2.status || res.status,
    score: v2.score,
    scoring: v2.scoring,
    scoring_doc: v2.scoring_doc,
    summary: v2.summary,
    badge: res.badge,
    findings: res.findings,
    groups: v2.groups,
    disclosures: res.disclosures,
    coverage: res.coverage,
  };
}

/* Registers the four tools.  deps.getCatalog()/getCatVer() always return the
 * CURRENT catalog (stdio can reload via SIGHUP; the worker serves the
 * bundled catalog statically). deps.auditFetchImpl (optional) replaces the
 * network layer of motion_audit — tests inject fixtures, a worker may inject a
 * guarded fetch; the analysis itself never changes. */
function registerMotionspecTools(server, deps) {
  const getCatalog = deps.getCatalog;
  const getCatVer = deps.getCatVer;

  /* Optional allow-list of tool names. Omitted/undefined => register ALL tools
   * (default: the stdio server and every existing caller stay byte-for-byte
   * unchanged). The hosted worker passes only ["motion_catalog","motion_validate"]
   * for its keyless free tier.
   *
   * W1 — a denied tool is no longer SILENTLY DROPPED. Until now `def` just did not
   * register it: it was absent from tools/list and a tools/call answered
   * "MCP error -32602: Tool motion_compile not found" (measured 2026-09-02 against
   * https://api.motionspec.dev/mcp — no price, no URL, not even the word "key").
   * A keyless agent therefore never learned that a paid product exists at all.
   *
   * Now the denied tool IS registered — as a STUB that performs NO work and
   * returns nothing but the pointer to the free check and the key page. It never
   * calls the real handler, never sets structuredContent, and keeps isError:true
   * so no agent can mistake the hint for a result. Callers that want the old
   * silent behaviour pass deps.paywallStub === false. */
  const only = deps.only;
  const stubDenied = deps.paywallStub !== false;

  const def = (name, spec, handler) => {
    if (!only || only.includes(name)) { server.registerTool(name, spec, handler); return; }
    if (!stubDenied) return;
    server.registerTool(
      name,
      {
        title: spec.title,
        description: paywallDescription(name, spec.description),
        inputSchema: optionalShape(spec.inputSchema),
        /* The stub itself does nothing at all: read-only and no network, no matter
         * what the real tool would do (motion_audit does I/O — the stub does not). */
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => {
        /* Countable: WHICH keyed tool was requested, how often — and by which
         * client (client/ua/probe/reason; ua and probe come only from a caller
         * that passes them, i.e. the hosted endpoint — stdio passes none). */
        const who = describeCaller(server, deps.caller);
        try {
          telemetry.log({ outcome: "paywall-hit", tool: name, model: "mcp-host", key: "free",
            reason: who.reason, client: who.client, ua: who.ua, probe: who.probe, attempts: 0 });
        } catch { /* telemetry never breaks a call */ }
        return { content: [{ type: "text", text: paywallHint(name) }], structuredContent: { ok: false, error: "PAYWALL", tool: name, upgrade: upgradeInfo(name) }, isError: true };
      },
    );
  };

  def(
    "motion_catalog",
    {
      title: "MotionSpec catalog & authoring rules",
      description:
        "Returns the catalog of verified motion primitives (names, purpose, parameter schemas, defaults) plus the authoring rules for writing a MotionSpec. Call this FIRST, then write the spec yourself and validate it with motion_validate (motion_compile runs in the CLI or with a key on the hosted endpoint). Free motion check: " + CHECK_URL + " · keys for the hosted endpoint: " + KEYS_URL + ".",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const out = {
        catalogVersion: getCatVer(),
        upgrade: upgradeInfo("motion_compile"),
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

  def(
    "motion_validate",
    {
      title: "Validate a MotionSpec (trust boundary)",
      description:
        "Checks a MotionSpec against the schema, the primitive allow-list, parameter bounds and injection rules. Fail-closed: returns ok=false with precise errors. Returns {ok, errors, warnings, deprecations, catalogVersion}. IMPORTANT: warnings[] carries the WCAG 2.2.2 / reduced-motion findings and can be non-empty while ok=true — a spec that compiles is not automatically accessible. Use to pre-check a spec before compiling.",
      inputSchema: { spec: z.record(z.string(), z.any()).describe("The MotionSpec JSON object") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ spec }) => {
      const catVer = getCatVer();
      const big = oversizeError(spec);
      if (big) {
        const out = { ok: false, errors: ["[" + big.code + "] " + big.message], warnings: [], deprecations: [], catalogVersion: catVer };
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out, isError: true };
      }
      const v = validateSpec(spec, getCatalog());
      telemetry.log({ outcome: v.ok ? "mcp-validate-ok" : "mcp-validate-fail", model: "mcp-host", attempts: 1, errors: v.ok ? undefined : v.errors });
      /* warnings[] carries the two WCAG 2.2.2 signals (MS-GLOBALS-RRM-OFF,
       * MS-GLOBALS-PAUSE-OFF). validate.js computes them; dropping the field
       * here made the only publicly reachable checker answer ok:true for a spec
       * with reduced-motion off, pause off and a 120 s marquee. */
      const out = { ok: v.ok, errors: v.errors || [], warnings: v.warnings || [], deprecations: v.deprecations || [], catalogVersion: catVer, upgrade: upgradeInfo("motion_compile") };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out };
    }
  );

  def(
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
        ? { ok: true, js: res.js, css: res.css, warnings: res.warnings || [], report: res.report, catalogVersion: catVer }
        : { ok: false, errors: res.errors, warnings: res.warnings || [], hint: "Fix the listed errors. Call motion_catalog to re-check allowed primitives and parameter bounds.", catalogVersion: catVer };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out, isError: !res.ok };
    }
  );

  def(
    "motion_audit",
    {
      title: "Audit a live URL for motion accessibility (WCAG 2.2.2 / 2.3.3)",
      description:
        "Static motion-a11y checker: fetches a URL's HTML + linked stylesheets and scans the CSS for (1) animation/transition that moves without an effective (cascade-aware) prefers-reduced-motion guard, (2) animated non-transform/opacity properties, (3) infinite animations with no pause path, (4) <marquee>/autoplay >5s. Colour/opacity-only transitions are not motion (WCAG 2.3.3). Same engine and scoring as the free site check at " + CHECK_URL + ". Returns {ok, score|null, status, findings, groups, summary, badge, disclosures, coverage, markdown}; pages without CSS motion return status 'not-measurable' with score null (runtime motion such as WAAPI/GSAP/WebGL is not audited); loading indicators (spinners, skeletons) are reported as 'review', not as violations. A clean, measurable page earns the badge 'reduced-motion-safe'. Does network I/O (openWorldHint).",
      inputSchema: { url: z.string().describe("The page URL to audit (http/https).") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url }) => {
      const engine = require("../audit/audit.js");
      const opts = Object.assign({}, AUDIT_OPTS, deps.auditFetchImpl ? { fetchImpl: deps.auditFetchImpl } : null);
      let res;
      try { res = await engine.audit(url, opts); }
      catch (e) { res = { ok: false, error: "audit error" }; } /* never leak internals/PII */
      telemetry.log({ outcome: res.ok ? "mcp-audit-ok" : "mcp-audit-fail", model: "mcp-host", attempts: 1 });
      const out = res.ok ? auditResult(res, engine) : { ok: false, error: res.error || "fetch failed" };
      /* The Markdown view carries the v2 score/summary so text and structuredContent never disagree. */
      const text = res.ok
        ? engine.toMarkdown(Object.assign({}, res, { score: out.score, summary: out.summary }), res.url)
        : ("Audit failed: " + out.error);
      return { content: [{ type: "text", text }], structuredContent: out, isError: !res.ok };
    }
  );

  def(
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

module.exports = { registerMotionspecTools, AUTHORING_RULES, MAX_SPEC_BYTES, paywallHint, paywallDescription, describeCaller, upgradeInfo, keysUrlFor, auditResult, AUDIT_OPTS, CHECK_URL, KEYS_URL, LOCAL_COMPILE_CMD, PAYWALL_PLANS };
