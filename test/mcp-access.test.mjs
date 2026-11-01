import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMotionspecTools } from "../src/mcp/register-tools.js";
import { loadCatalog, catalogVersion } from "../src/compiler/catalog.js";
import telemetry from "../src/router/telemetry.js";
import { MemorySink } from "../src/router/telemetry-sink.js";

async function withTools(deps, run) {
  const previous = telemetry.getSink();
  telemetry.setSink(new MemorySink());
  const server = new McpServer({ name: "access-contract", version: "1.0.0" });
  const client = new Client({ name: "access-test", version: "1.0.0" });
  try {
    registerMotionspecTools(server, deps);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await run(client);
  } finally {
    await client.close();
    await server.close();
    telemetry.setSink(previous);
  }
}

/* 2026-10-26: no subscription is sold any more. A stub answers why the tool does no
 * work here plus the free local command; it names no price, no plan, no price page. */
const PRICE_RE = /\$\s?\d|\bUSD\b|price|pricing|\bplans?\b|Dev Key|Agency|Motion Report|\/mo\b|monthly|one-time|subscription/i;

test("stubbed tools describe access notices, never execute gated work and name no price", async () => {
  let work = 0;
  const unexpected = () => { work++; throw new Error("gated work ran"); };
  await withTools({
    only: ["motion_catalog", "motion_validate"],
    getCatalog: unexpected,
    getCatVer: unexpected,
    auditFetchImpl: unexpected,
  }, async (client) => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 5);
    const cases = [
      ["motion_compile", { spec: {} }, "npx -p motionspec motion compile <spec.json>"],
      ["motion_audit", { url: "https://example.test/" }, "npx -p motionspec motion audit <url> --json"],
      ["motion_stats", {}, "npx -p motionspec motion stats"],
    ];
    for (const [name, args, command] of cases) {
      const tool = tools.find((entry) => entry.name === name);
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.annotations.openWorldHint, false);
      assert.deepEqual(tool.inputSchema.required || [], []);
      assert.match(tool.description, /access information only/);
      assert.match(tool.description, /does not compile code, fetch URLs, run an audit or read usage data/);
      assert.match(tool.description, /KEY_REQUIRED/);
      assert.ok(tool.description.includes(command));
      assert.doesNotMatch(tool.description, PRICE_RE);
      for (const arguments_ of [{}, args]) {
        const result = await client.callTool({ name, arguments: arguments_ });
        assert.equal(result.isError, true);
        assert.deepEqual(Object.keys(result.structuredContent).sort(), ["error", "freeLocalAlternative", "ok", "tool"]);
        assert.equal(result.structuredContent.ok, false);
        assert.equal(result.structuredContent.error, "KEY_REQUIRED");
        assert.equal(result.structuredContent.tool, name);
        assert.ok(result.structuredContent.freeLocalAlternative.includes(command));
        assert.ok(result.content[0].text.includes(command));
        assert.equal(result.structuredContent.js, undefined);
        assert.equal(result.structuredContent.score, undefined);
        assert.doesNotMatch(JSON.stringify(result), PRICE_RE);
        if (name === "motion_stats") {
          assert.match(result.structuredContent.freeLocalAlternative, /not hosted usage/);
          assert.ok(result.content[0].text.includes("operator telemetry; for your own local activity use 'npx -p motionspec motion stats'"));
        }
      }
    }
    assert.equal(work, 0);
  });
});

test("hosted free list: compile and audit run for real, only motion_stats is a stub", async () => {
  let requests = 0;
  const catalog = loadCatalog();
  await withTools({
    only: ["motion_catalog", "motion_validate", "motion_compile", "motion_audit"],
    getCatalog: () => catalog,
    getCatVer: () => catalogVersion(catalog),
    auditFetchImpl: async () => { requests++; return { ok: true, text: "<html><head><style>.a{color:red}</style></head></html>" }; },
  }, async (client) => {
    const { tools } = await client.listTools();
    const stubs = tools.filter((tool) => /access information only/.test(tool.description)).map((tool) => tool.name);
    assert.deepEqual(stubs, ["motion_stats"]);
    const spec = { specVersion: "1.0", meta: { project: "t", target: "vanilla-gsap" }, globals: { respectReducedMotion: true },
      motions: [{ id: "hero", primitive: "scrollReveal", target: ".hero h1", params: { from: { opacity: 0, y: 48 } } }] };
    const compiled = await client.callTool({ name: "motion_compile", arguments: { spec } });
    assert.equal(compiled.structuredContent.ok, true);
    assert.equal(typeof compiled.structuredContent.js, "string");
    const audited = await client.callTool({ name: "motion_audit", arguments: { url: "https://example.test/" } });
    assert.equal(audited.isError, false);
    assert.equal(requests, 1);
    const stats = await client.callTool({ name: "motion_stats", arguments: {} });
    assert.equal(stats.structuredContent.error, "KEY_REQUIRED");
  });
});

test("upgrade block of catalog/validate: the one-time Motion Report and the free check, attributed, no subscription", async () => {
  const catalog = loadCatalog();
  await withTools({ getCatalog: () => catalog, getCatVer: () => catalogVersion(catalog) }, async (client) => {
    const { tools } = await client.listTools();
    const catalogTool = tools.find((tool) => tool.name === "motion_catalog");
    assert.ok(catalogTool.description.includes("https://motionspec.dev/motion-check"));
    assert.ok(catalogTool.description.includes("https://motionspec.dev/pricing?src=mcp-motion_catalog#p-report"));
    const results = {
      motion_catalog: await client.callTool({ name: "motion_catalog", arguments: {} }),
      motion_validate: await client.callTool({ name: "motion_validate", arguments: { spec: { specVersion: "1.0" } } }),
    };
    for (const [name, result] of Object.entries(results)) {
      const upgrade = result.structuredContent.upgrade;
      assert.equal(upgrade.url, "https://motionspec.dev/pricing?src=mcp-" + name + "#p-report");
      assert.equal(upgrade.freeCheck, "https://motionspec.dev/motion-check");
      assert.deepEqual(upgrade.plans, [{ id: "motion-report", label: "Motion Report", price_usd: 9, billing: "one-time" }]);
      assert.equal(upgrade.header, undefined, "no key to buy");
      assert.doesNotMatch(JSON.stringify(upgrade), /Dev Key|Agency|monthly|\/mo\b|\$39|\$249/);
    }
  });
});

test("enabled audit advertises network access and returns the documented v2 payload", async () => {
  let requests = 0;
  const catalog = loadCatalog();
  await withTools({
    getCatalog: () => catalog,
    getCatVer: () => catalogVersion(catalog),
    auditFetchImpl: async () => {
      requests++;
      return { ok: true, text: "<html><head><style>.hero{animation:move 10s infinite}@keyframes move{to{transform:translateX(20px)}}</style></head><body><div class='hero'>Move</div></body></html>" };
    },
  }, async (client) => {
    const { tools } = await client.listTools();
    const audit = tools.find((tool) => tool.name === "motion_audit");
    assert.equal(audit.annotations.openWorldHint, true);
    assert.deepEqual(audit.inputSchema.required, ["url"]);
    assert.match(audit.description, /scoring v2/);
    assert.match(audit.description, /Markdown report in text content/);
    assert.doesNotMatch(audit.description, /access information only/);
    const result = await client.callTool({ name: "motion_audit", arguments: { url: "https://example.test/" } });
    assert.equal(result.isError, false);
    assert.equal(result.structuredContent.scoring, "v2");
    assert.equal(result.structuredContent.status, "measured");
    assert.equal(typeof result.structuredContent.score, "number");
    assert.equal(result.structuredContent.markdown, undefined);
    assert.equal(result.content[0].type, "text");
    assert.ok(result.content[0].text.length > 0);
    assert.equal(requests, 1);
  });
});
