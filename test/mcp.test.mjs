import { test } from "node:test";
import assert from "node:assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function withClient(fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(ROOT, "src", "mcp", "server.mjs")],
  });
  const client = new Client({ name: "mcp-test", version: "0.0.1" });
  await client.connect(transport);
  try { return await fn(client); }
  finally { await client.close(); }
}

const validSpec = {
  specVersion: "1.0",
  meta: { project: "t", target: "vanilla-gsap", createdWith: "mcp-host" },
  globals: { respectReducedMotion: true },
  motions: [
    { id: "hero", primitive: "scrollReveal", target: ".hero h1", params: { from: { opacity: 0, y: 48 } } },
  ],
};

test("MCP: lists 5 motion_ tools", async () => {
  await withClient(async (c) => {
    const { tools } = await c.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["motion_audit", "motion_catalog", "motion_compile", "motion_stats", "motion_validate"]);
  });
});

test("MCP: motion_audit is registered with read-only + open-world annotations", async () => {
  await withClient(async (c) => {
    const { tools } = await c.listTools();
    const audit = tools.find((t) => t.name === "motion_audit");
    assert.ok(audit, "motion_audit must be registered");
    assert.equal(audit.annotations.readOnlyHint, true);
    assert.equal(audit.annotations.openWorldHint, true);
    assert.ok(/url/i.test(JSON.stringify(audit.inputSchema)), "input schema must expose a url field");
  });
});

test("MCP: motion_audit returns a structured result (error path is well-formed)", async () => {
  await withClient(async (c) => {
    /* A .invalid TLD never resolves -> exercises the audit failure path without
     * depending on any reachable host. The tool must still answer cleanly with a
     * structured { ok:false, error } and mark isError, never throw. */
    const r = await c.callTool({ name: "motion_audit", arguments: { url: "https://nonexistent.invalid/" } });
    const out = r.structuredContent;
    assert.equal(typeof out.ok, "boolean");
    if (out.ok === false) {
      assert.ok(typeof out.error === "string" && out.error.length > 0, "an error message is present");
      assert.equal(r.isError, true);
    } else {
      /* If some resolver did answer, the success shape must still hold. */
      assert.ok(Array.isArray(out.findings));
      assert.equal(typeof out.score, "number");
    }
    assert.ok(Array.isArray(r.content) && r.content[0].type === "text", "text content is returned");
  });
});

test("MCP: motion_catalog returns primitives + rules", async () => {
  await withClient(async (c) => {
    const r = await c.callTool({ name: "motion_catalog", arguments: {} });
    const out = r.structuredContent;
    assert.equal(out.primitives.length >= 5, true);
    /* TASK-026 (Finding #23): shared catalogSummary returns all 8 fields per
     * primitive (was split across two divergent local copies). */
    assert.equal(out.primitives.length, 40);
    const FIELDS = ["name", "version", "purpose", "engine", "cost", "paramSchema", "triggerDefaults", "reducedMotionFallback"];
    for (const p of out.primitives) {
      assert.deepEqual(Object.keys(p).sort(), [...FIELDS].sort(), "each primitive carries the 8 summary fields");
    }
    assert.ok(out.authoringRules.includes("Never invent"));
    assert.ok(out.catalogVersion.length === 16);
    /* Re-audit 2026-06-15: the MCP layer is the contract surface the model
     * consumes — it must advertise the frozen v1, not the deprecated 0.1. */
    assert.equal(out.specVersion, "1.0", "MCP must advertise the frozen spec version");
    assert.equal(out.exampleSpec.specVersion, "1.0", "example spec must model v1");
    assert.ok(out.authoringRules.includes('specVersion "1.0"'), "authoring rules must teach 1.0");
  });
});

test("MCP: valid spec compiles to GSAP with reduced-motion gate", async () => {
  await withClient(async (c) => {
    const r = await c.callTool({ name: "motion_compile", arguments: { spec: validSpec, specName: "hero" } });
    const out = r.structuredContent;
    assert.equal(out.ok, true);
    assert.ok(out.js.includes('gsap.from(".hero h1"'));
    assert.ok(out.js.includes("prefers-reduced-motion"));
    assert.equal(out.report.budgetOk, true);
  });
});

test("MCP: malicious/made-up spec is rejected fail-closed", async () => {
  await withClient(async (c) => {
    const evil = JSON.parse(JSON.stringify(validSpec));
    evil.motions[0].primitive = "magicSparkle";
    evil.motions[0].target = "');alert(1);('";
    const r = await c.callTool({ name: "motion_compile", arguments: { spec: evil } });
    const out = r.structuredContent;
    assert.equal(out.ok, false);
    assert.equal(r.isError, true);
    assert.ok(out.errors.some((e) => e.includes("magicSparkle")));
    assert.ok(out.errors.some((e) => e.toLowerCase().includes("selector")));
    assert.equal(out.js, undefined);
  });
});

test("MCP: motion_validate reports precise errors", async () => {
  await withClient(async (c) => {
    const bad = JSON.parse(JSON.stringify(validSpec));
    bad.motions[0].params.duration = 99;
    const r = await c.callTool({ name: "motion_validate", arguments: { spec: bad } });
    assert.equal(r.structuredContent.ok, false);
    assert.ok(r.structuredContent.errors[0].includes("maximum"));
  });
});

test("MCP: oversize spec is rejected before processing (DoS cap)", async () => {
  await withClient(async (c) => {
    const huge = JSON.parse(JSON.stringify(validSpec));
    huge.meta.project = "x".repeat(70 * 1024); // > 64 KB
    const r = await c.callTool({ name: "motion_compile", arguments: { spec: huge } });
    const out = r.structuredContent;
    assert.equal(out.ok, false);
    assert.equal(r.isError, true);
    assert.ok(out.errors[0].includes("MS-INPUT-TOO-LARGE"));
  });
});

test("MCP: motion_validate rejects a 0.1 spec (removed at v1.2, ADR-0001 D4)", async () => {
  await withClient(async (c) => {
    const legacy = JSON.parse(JSON.stringify(validSpec));
    legacy.specVersion = "0.1";
    const r = await c.callTool({ name: "motion_validate", arguments: { spec: legacy } });
    const out = r.structuredContent;
    assert.equal(out.ok, false, '"0.1" is no longer accepted at v1.2');
    assert.ok(out.errors.some((e) => e.includes("MS-SPEC-VER")), "unknown version -> MS-SPEC-VER");
  });
});

test("MCP: motion_stats returns telemetry summary", async () => {
  await withClient(async (c) => {
    const r = await c.callTool({ name: "motion_stats", arguments: {} });
    const out = r.structuredContent;
    assert.equal(typeof out.total, "number");
    assert.ok(out.byOutcome && typeof out.byOutcome === "object");
    assert.ok(out.escalations && typeof out.escalations === "object");
    assert.ok(out.note.includes("catalog growth signal"));
  });
});
