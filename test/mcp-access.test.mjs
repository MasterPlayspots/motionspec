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

test("keyless tools describe access notices and never execute gated work", async () => {
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
      assert.ok(tool.description.includes(command));
      for (const arguments_ of [{}, args]) {
        const result = await client.callTool({ name, arguments: arguments_ });
        assert.equal(result.isError, true);
        assert.equal(result.structuredContent.ok, false);
        assert.equal(result.structuredContent.error, "PAYWALL");
        assert.equal(result.structuredContent.tool, name);
        const upgrade = result.structuredContent.upgrade;
        assert.equal(upgrade.header, "x-motionspec-key");
        assert.equal(upgrade.url, "https://motionspec.dev/pricing?src=mcp-" + name);
        assert.ok(upgrade.freeLocalAlternative.includes(command));
        assert.ok(result.content[0].text.includes(command));
        assert.equal(result.structuredContent.js, undefined);
        assert.equal(result.structuredContent.score, undefined);
        if (name === "motion_stats") assert.match(upgrade.freeLocalAlternative, /not hosted usage/);
      }
    }
    assert.equal(work, 0);
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
