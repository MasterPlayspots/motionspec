# Installing MotionSpec (MCP server)

MotionSpec's MCP server is **hosted** — nothing to build, nothing to install, and **no API key** for the read tools.

- Endpoint: `https://api.motionspec.dev/mcp` (streamable HTTP, stateless)
- Keyless tools: `motion_catalog`, `motion_validate` — both read-only (`readOnlyHint: true`)
- Keyed tools on the hosted endpoint (Dev Key): `motion_compile`, `motion_audit`, `motion_stats`

## Cline

Add to your MCP settings (Settings → MCP Servers → Configure, or `~/.cline/mcp.json`):

```json
{
  "mcpServers": {
    "motionspec": {
      "type": "streamableHttp",
      "url": "https://api.motionspec.dev/mcp",
      "disabled": false,
      "autoApprove": ["motion_catalog", "motion_validate"]
    }
  }
}
```

`"type": "streamableHttp"` matters — omitting it falls back to legacy SSE. Both keyless tools are read-only, so `autoApprove` is safe.

## Claude Code

```bash
claude mcp add --transport http motionspec https://api.motionspec.dev/mcp
```

## Claude (desktop / web)

Settings → Connectors → Add custom connector → `https://api.motionspec.dev/mcp`

## Local (stdio) alternative — full toolset, no key

```bash
npx -y motionspec
```

This runs the same server over stdio. Locally the **full** toolset is registered, including `motion_compile` — compilation is MIT-licensed and runs on your machine; the Dev Key only gates the hosted endpoint.

```json
{
  "mcpServers": {
    "motionspec-local": {
      "command": "npx",
      "args": ["-y", "motionspec"]
    }
  }
}
```

## Verify the endpoint is alive

```bash
curl -s -X POST https://api.motionspec.dev/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: two tools (`motion_catalog`, `motion_validate`), both with `"readOnlyHint": true`. The keyless path is rate-limited (60 requests / 10 s per IP).

## What the tools do

1. `motion_catalog` — the 40 verified motion primitives + authoring rules (18 are persistent/looping and carry a WCAG 2.2.2 pause path).
2. `motion_validate` — fail-closed validation of a MotionSpec JSON spec; reports WCAG 2.2.2 pause-path **candidates** as warnings (missing reduced-motion guards are flagged as a 2.3.3/AAA best-practice gap).

Docs: https://motionspec.dev/docs · llms context: https://motionspec.dev/llms.txt
