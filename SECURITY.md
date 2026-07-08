# Security Policy

This document describes the security posture of the `motionspec` npm package
and its optional hosted endpoint. It is factual and verifiable against the
source at [github.com/MasterPlayspots/motionspec](https://github.com/MasterPlayspots/motionspec).

## Supply chain

- **2 direct runtime dependencies:** `@modelcontextprotocol/sdk` and `zod`
  (both pinned to exact versions in `package.json`).
- All published versions come from a single maintainer account.
- The npm tarball ships only consumer-relevant files (`src/`, `bin/motion.js`,
  `bin/promote-gate.js`, `primitives/`, `schema/`, `catalog.lock.json`); the
  exact file list is asserted by a regression test (`test/publish-shape.test.js`).
- A CycloneDX SBOM (`sbom.cdx.json`) is regenerated and verified on every CI run.

## Network

**None by default.** The MCP server (`npx motionspec`) is stdio-local and makes
no network requests. Outbound requests happen only if you opt into the router
by setting an API key; targets are then the configured `MOTION_BASE_URL` /
OpenRouter. The compiler, validator, and CLI work fully offline.

## Environment variables

All optional, read only for opt-in configuration:

| Variable | Purpose |
| --- | --- |
| `MOTION_BASE_URL` | Router endpoint (opt-in) |
| `MOTION_API_KEY` / `OPENROUTER_API_KEY` | Router auth (opt-in; absence = no network) |
| `MOTION_MODEL` | Router model override |
| `MOTION_CACHE_DIR` | Cache location override |

## Filesystem

- The CLI writes artifacts to `./out` under the current working directory.
- The cache lives under `MOTION_CACHE_DIR` (if configured).
- Telemetry appends to a local JSONL file (`telemetry/events.jsonl`) and is
  **never transmitted**.

## Code execution

- No `eval`, no `new Function`, no dynamic `require` in shipped code.
- Validation is fail-closed; specs are capped at 64 KB input.
- CSS output rejects unsafe tokens (fail-closed safety gate).

## Hosted endpoint (optional)

The hosted worker is separate from the npm package and never contacted by it:
per-key auth (keys stored hashed), constant-time secret comparison,
fail-closed on any auth error, rate-limited at 60 requests / 10 s.

## Reporting a vulnerability

Email **security@motionspec.dev**. You will receive an acknowledgement within
**72 hours**. Please include a reproduction; coordinated disclosure is
appreciated.
