# Installing MotionSpec (MCP server)

MotionSpec's MCP server is **hosted** — nothing to build, nothing to install, and **no API key**.

- Endpoint: `https://api.motionspec.dev/mcp` (streamable HTTP, stateless)
- Keyless tools: `motion_catalog`, `motion_validate`, `motion_compile` (all read-only, no network access) and `motion_audit` (fetches the public http(s) page you name: `openWorldHint: true`)
- `motion_stats` reports the operator's telemetry of the hosted service and needs the operator key; for your own local activity use `npx -p motionspec motion stats`

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

`"type": "streamableHttp"` matters — omitting it falls back to legacy SSE. `motion_catalog` and `motion_validate` are read-only and do no network access, so `autoApprove` is safe for them; `motion_audit` fetches a URL, so approve it per call.

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

This runs the same server over stdio. Locally the **full** toolset is registered — compilation and the audit are MIT-licensed and run on your machine, and `motion_stats` reads this machine's local activity.

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

Expected: five tools. `motion_catalog`, `motion_validate` and `motion_compile` carry `"readOnlyHint": true` and `"openWorldHint": false`; `motion_audit` carries `"openWorldHint": true`; `motion_stats` answers without the operator key with a short notice instead of a result. The keyless path is rate-limited (60 requests / 10 s per IP).

## What the tools do

1. `motion_catalog` — the 40 verified motion primitives + authoring rules (18 are persistent/looping and carry a WCAG 2.2.2 pause path).
2. `motion_validate` — fail-closed validation of a MotionSpec JSON spec; reports WCAG 2.2.2 pause-path **candidates** as warnings (missing reduced-motion guards are flagged as a 2.3.3/AAA best-practice gap).

Docs: https://motionspec.dev/docs · llms context: https://motionspec.dev/llms.txt
