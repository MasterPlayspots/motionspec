/*
 * audit-mcp-parity.test.mjs — W2.2 (2026-09-11): ONE checker, one score.
 * ----------------------------------------------------------------------
 * The motion_audit tool (stdio + hosted worker share this factory) must answer
 * with the SAME engine, the SAME fetch limits and the SAME v2 scoring as the
 * site's free check (motionspec.dev/api = audit.cjs + groupAndScoreV2), shaped
 * field for field like its JSON. Before this change the tool ran a pre-W1
 * engine copy with the v1 curve: the same URL scored 92 on the site and 15 in
 * the paid tool. The real handler runs here over InMemoryTransport with an
 * injected fetch — no network, no worker/ import (survives the public carve).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { registerMotionspecTools, AUDIT_OPTS, auditResult } = require("../src/mcp/register-tools.js");
const engine = require("../src/audit/audit.js");
const { loadCatalog, catalogVersion } = require("../src/compiler/catalog.js");
const telemetry = require("../src/router/telemetry.js");
const { MemorySink } = require("../src/router/telemetry-sink.js");

/* The site's /api JSON (worker.mjs `return json({...})`), key for key, in order. */
const SITE_API_KEYS = ["ok", "url", "status", "score", "scoring", "scoring_doc", "summary", "badge", "findings", "groups", "disclosures", "coverage"];

const page = (head, body = "") => "<html><head>" + head + "</head><body>" + body + "</body></html>";
const PAGES = {
  /* (a) Bootstrap pattern: guard as a separate @media rule AFTER the motion rule → clean. */
  "https://bootstrap.test/": { ok: true, text: page('<link rel="stylesheet" href="/bs.css">') },
  "https://bootstrap.test/bs.css": { ok: true, text: ".collapsing{transition:height .35s ease}@media (prefers-reduced-motion:reduce){.collapsing{transition:none}}.btn{transition:color .15s}" },
  /* WebGL page without CSS motion → not measurable, library disclosed. */
  "https://webgl.test/": { ok: true, text: page('<script src="/vendor/three.min.js"></script><style>.a{color:red}</style>', "<canvas></canvas>") },
  /* A loading spinner → review, no score impact, no badge. */
  "https://spinner.test/": { ok: true, text: page("<style>@keyframes fa-spin{to{transform:rotate(1turn)}}.fa-spin{animation:fa-spin 2s infinite linear}</style>") },
  /* A decorative endless drift without guard → 2.2.2 + 2.3.3 (v2: 100 − 20 − 8 = 72). */
  "https://hero.test/": { ok: true, text: page("<style>@keyframes drift{to{background-position:100% 0}}.hero{animation:drift 12s linear infinite}</style>") },
  /* 13 linked stylesheets; only the 13th carries motion → beyond the site's limit of 12, not scanned. */
  "https://many.test/": { ok: true, text: page(Array.from({ length: 13 }, (_, i) => '<link rel="stylesheet" href="/s' + (i + 1) + '.css">').join("")) },
};
for (let i = 1; i <= 12; i++) PAGES["https://many.test/s" + i + ".css"] = { ok: true, text: ".p" + i + "{color:red}" };
PAGES["https://many.test/s13.css"] = { ok: true, text: ".late{transition:transform .3s}" };
const fetchImpl = async (u) => PAGES[u] || { ok: false, error: "HTTP 404" };

async function withTool(fn) {
  const orig = telemetry.getSink();
  telemetry.setSink(new MemorySink());
  const catalog = loadCatalog();
  const server = new McpServer({ name: "parity", version: "0.0.0" });
  registerMotionspecTools(server, { getCatalog: () => catalog, getCatVer: () => catalogVersion(catalog), auditFetchImpl: fetchImpl });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "parity-client", version: "0.0.0" });
  await client.connect(clientT);
  try { return await fn(client); }
  finally { await client.close(); telemetry.setSink(orig); }
}
const callAudit = (client, url) => client.callTool({ name: "motion_audit", arguments: { url } });
/* What the site's /api does with the same bytes (worker.mjs:581-594). */
async function siteResult(url) {
  const r = await engine.audit(url, { fetchImpl, maxStylesheets: 12, timeoutMs: 8000, maxBytes: 2 * 1024 * 1024 });
  const v2 = engine.groupAndScoreV2(r);
  return { status: v2.status, score: v2.score, summary: v2.summary, groups: v2.groups, findings: r.findings, badge: r.badge, disclosures: r.disclosures, coverage: r.coverage };
}

test("motion_audit uses the site's fetch limits (12 stylesheets, 8 s, 2 MB)", () => {
  assert.deepEqual({ ...AUDIT_OPTS }, { maxStylesheets: 12, timeoutMs: 8000, maxBytes: 2 * 1024 * 1024 });
  assert.ok(Object.isFrozen(AUDIT_OPTS));
});

test("motion_audit: structuredContent is the site's /api shape, key for key", async () => {
  await withTool(async (c) => {
    const r = await callAudit(c, "https://hero.test/");
    assert.equal(r.isError, false);
    assert.deepEqual(Object.keys(r.structuredContent), SITE_API_KEYS);
    assert.equal(r.structuredContent.scoring, "v2");
    assert.match(r.structuredContent.scoring_doc, /rules rev\. 2026-09-11/);
  });
});

test("parity: same URL → same score, status, findings, groups as the site pipeline (5 fixtures)", async () => {
  await withTool(async (c) => {
    for (const url of ["https://bootstrap.test/", "https://webgl.test/", "https://spinner.test/", "https://hero.test/", "https://many.test/"]) {
      const tool = (await callAudit(c, url)).structuredContent;
      const site = await siteResult(url);
      assert.equal(tool.ok, true, url);
      assert.equal(tool.status, site.status, url + " status");
      assert.equal(tool.score, site.score, url + " score");
      assert.equal(tool.summary, site.summary, url + " summary");
      assert.equal(tool.badge, site.badge, url + " badge");
      assert.deepEqual(tool.findings, site.findings, url + " findings");
      assert.deepEqual(tool.groups, site.groups, url + " groups");
      assert.deepEqual(tool.disclosures, site.disclosures, url + " disclosures");
      assert.deepEqual(tool.coverage, site.coverage, url + " coverage");
    }
  });
});

test("v2 curve, not the v1 curve: the unguarded endless drift scores 72 (v1 would say 65)", async () => {
  await withTool(async (c) => {
    const r = await callAudit(c, "https://hero.test/");
    const out = r.structuredContent;
    assert.equal(out.status, "measured");
    assert.equal(out.score, 72);
    assert.deepEqual(out.findings.map((f) => f.kind).sort(), ["infinite-no-pause", "unguarded"]);
    assert.equal(out.groups.find((g) => g.kind === "infinite-no-pause").deduction, 20);
    assert.equal(out.groups.find((g) => g.kind === "unguarded").deduction, 8);
    /* the Markdown view carries the SAME score — text and structured never disagree */
    assert.match(r.content[0].text, /^# MotionSpec Motion-a11y Audit/);
    assert.match(r.content[0].text, /\*\*Score:\*\* 72\/100/);
    assert.equal(/65\/100/.test(r.content[0].text), false, "the v1 score must not leak into the text");
    assert.match(r.content[0].text, /distinct motion-a11y root cause/);
  });
});

test("not measurable: no CSS motion → status 'not-measurable', score null, no badge, ok:true (not an error)", async () => {
  await withTool(async (c) => {
    const r = await callAudit(c, "https://webgl.test/");
    const out = r.structuredContent;
    assert.equal(r.isError, false);
    assert.equal(out.ok, true);
    assert.equal(out.status, "not-measurable");
    assert.equal(out.score, null);
    assert.equal(out.badge, null);
    assert.deepEqual(out.findings, []);
    assert.deepEqual(out.groups, []);
    assert.ok(out.disclosures.includes("No CSS motion found in the loaded CSS; runtime motion (JS/WebGL/WAAPI) is not audited."));
    assert.ok(out.disclosures.includes("Runtime motion library detected (three.js) — not audited (V2)."));
    assert.deepEqual(out.coverage.runtime_libraries, ["three.js"]);
    assert.match(out.summary, /^Not measurable/);
    assert.match(r.content[0].text, /\*\*Score:\*\* not measurable/);
    assert.match(r.content[0].text, /\*\*Status:\*\* not measurable/);
  });
});

test("loading indicator: 'review' finding with no score impact, no Level-A digits, no badge", async () => {
  await withTool(async (c) => {
    const out = (await callAudit(c, "https://spinner.test/")).structuredContent;
    assert.equal(out.status, "measured");
    assert.equal(out.score, 100);
    assert.equal(out.badge, null, "a review item is not a clean result");
    assert.equal(out.findings.length, 1);
    assert.equal(out.findings[0].kind, "preload-candidate");
    assert.equal(out.findings[0].severity, "review");
    assert.equal(out.findings[0].weight, 0);
    assert.equal(/\d+\.\d+\.\d+/.test(out.findings[0].wcag), false, "no x.y.z in wcag — downstream Level-A counters must not count it");
    assert.equal(out.groups[0].deduction, 0);
    assert.match(out.summary, /1 loading indicator\(s\) for manual review, no score impact/);
  });
});

test("clean Bootstrap-pattern page: cascade-aware guard → 100 + badge; colour transition not counted", async () => {
  await withTool(async (c) => {
    const out = (await callAudit(c, "https://bootstrap.test/")).structuredContent;
    assert.equal(out.score, 100);
    assert.equal(out.badge, engine.BADGE_SAFE);
    assert.deepEqual(out.findings, []);
    assert.equal(out.coverage.guarded_rules, 1);
    assert.equal(out.coverage.non_motion_transition_rules, 1);
  });
});

test("stylesheet limit is the site's: the 13th linked sheet is not scanned (same verdict as /api)", async () => {
  await withTool(async (c) => {
    const out = (await callAudit(c, "https://many.test/")).structuredContent;
    assert.equal(out.coverage.stylesheets, 12);
    assert.equal(out.status, "not-measurable");
    assert.equal(out.score, null);
  });
});

test("fetch failure stays a clean {ok:false, error} with isError", async () => {
  await withTool(async (c) => {
    const r = await callAudit(c, "https://missing.test/");
    assert.equal(r.isError, true);
    assert.deepEqual(r.structuredContent, { ok: false, error: "HTTP 404" });
    assert.equal(r.content[0].text, "Audit failed: HTTP 404");
  });
});

test("tools/list: motion_audit's description names not-measurable and review, no local-command noise", async () => {
  await withTool(async (c) => {
    const { tools } = await c.listTools();
    const t = tools.find((x) => x.name === "motion_audit");
    assert.match(t.description, /status 'not-measurable' with score null/);
    assert.match(t.description, /reported as 'review', not as violations/);
    assert.match(t.description, /Same engine and scoring as the free site check/);
    assert.match(t.description, /cascade-aware/);
    assert.equal(/npx/.test(t.description), false);
  });
});

test("auditResult() is a pure reshaping of audit()+groupAndScoreV2() (what bin/motion.js prints too)", async () => {
  const res = await engine.audit("https://hero.test/", { fetchImpl, ...AUDIT_OPTS });
  const out = auditResult(res, engine);
  assert.deepEqual(Object.keys(out), SITE_API_KEYS);
  assert.equal(out.score, engine.groupAndScoreV2(res).score);
  assert.equal(out.url, "https://hero.test/");
});
