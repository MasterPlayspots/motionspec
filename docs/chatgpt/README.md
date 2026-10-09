# MotionSpec ChatGPT plugin: staged package

Status: **local preparation only; not deployed, uploaded, submitted or published**.
The proposed `https://api.motionspec.dev/chatgpt/mcp` route is not treated as live.
The existing npm/Claude plugin and commercial `/mcp` integration remain separate.

## Build and inspect

Run from this repository with Python 3.9+:

```sh
python3 scripts/build-chatgpt-plugin.py --check
python3 -m unittest discover -s test -p 'test_chatgpt_plugin.py'
python3 scripts/build-chatgpt-plugin.py
```

The last command writes an allowlisted eight-file ZIP and per-file SHA-256
manifest under `out/chatgpt-plugin/`. The root of the archive contains
`plugin.json`, `mcp.json`, `skills/`, `assets/` and the unchanged MIT `LICENSE`.
There is no outer wrapper directory, local stdio command, credential, app mapping,
hook, private source or generated report in the installable ZIP. The build uses
fixed timestamps, permissions, order and ZIP_STORED, making identical inputs
produce identical bytes independent of file modification time.

The builder checks our staged contract against documented field limits and
package rules. It is **not** OpenAI's complete validator. Upload validation,
remote tool discovery and the eight ChatGPT review cases remain separate gates.
Do not label those gates passed from a local build.

## Scope and listing

`openai-plugin/plugin.json` is the editable source for the English listing and
review cases. The initial scope is `motion_audit`, `motion_catalog` and
`motion_validate`, without login. The runtime declares noauth on the tools;
the portable MCP schema has no authentication field, so no invented auth field
is added to `mcp.json`. It declares only one streamable-http server.

The two adapted skills guide a public CSS audit and catalog/spec validation.
They do not request compilation, account operations, upgrades, payment or
installation of a different tool. They handle `not-measurable` / `score: null`,
incomplete coverage, advisory warnings and untrusted page-derived strings.

Claims are limited to static HTML/CSS screening. CSS flash heuristics, if an
engine reports them, are not rendered flash-frequency or luminance measurement.
The plugin does not execute JavaScript, audit runtime animation, measure video
or certify accessibility, WCAG compliance or legal compliance. A static badge
is never represented as certification.

The original repository logo is reused without alteration; it is a 512×512 PNG.
No fabricated ChatGPT screenshot or demonstration is included.

## Review inventory: all planned, not executed in ChatGPT

The release-plan inventory is preserved: exactly five positive and three negative
cases in the manifest. Public fixture URLs are proposed until approved deployment
and a live request prove them reachable.

| Case | Expected workflow | Execution status |
| --- | --- | --- |
| P1 | Unguarded CSS page → measured findings, honest scope | NOT RUN |
| P2 | Guarded finite CSS → actual clean result, honest coverage | NOT RUN |
| P3 | No CSS motion → not-measurable, null score | NOT RUN |
| P4 | Catalog → actual scrollReveal parameters/fallback | NOT RUN |
| P5 | Invalid primitive → failed validation with diagnostic | NOT RUN |
| N1 | 30-second promotional video → unsupported, no tool invocation | NOT RUN |
| N2 | Calendar appointment tomorrow → unrelated, no tool invocation | NOT RUN |
| N3 | Certificate without testing → no certificate, explain limits | NOT RUN |

Planned additional adversarial integration checks, separate from the review
inventory: private/loopback/metadata URL rejection, query/token rejection,
redirect-to-private rejection, stylesheet URL rejection, DNS failure/rebinding
behavior, too-large/slow responses, rate-limiter exhaustion, prompt injection in
selectors/fetched data, and unsupported commerce/compile/stats requests. Runtime
automated evidence belongs to the adapter and shared fetch test suite; these
prompts must also be exercised in ChatGPT after deployment.

## Release gates still open

- Approve monthly operating budget, resource bindings and production change.
- Review/merge the synchronized engine and adapter PRs, verify required CI gates.
- Deploy the disabled-by-default isolated route only after explicit approval;
  verify three-tool discovery, noauth declarations and actual execution.
- Verify the exact live fixture URLs, website/plugin parity, and abuse controls.
- Confirm publisher spelling against the verified developer identity and public
  legal/support pages. Dashboard account evidence stays in the private project
  plan and is deliberately absent from this public package.
- Finalize and publish the ChatGPT data-processing/privacy disclosures and support
  page; verify website, support, privacy and terms URLs are reviewer-accessible.
  The package currently uses the existing public GitHub issue tracker; switch to
  `/support` only after that prepared website page is approved and reachable.
- Confirm directory category and availability countries. Countries are omitted
  from this draft to avoid silently selecting worldwide publication.
- Create an actual reviewer-accessible demonstration video, then add its URL.
- Record a real ChatGPT run for P1–P5 and N1–N3 with model/date/build and results;
  retain screenshots or transcripts with no sensitive data.
- Obtain approval for upload/public submission, complete domain verification,
  automated metadata/skills/tool scans and the official review.
- Publish only on explicit approval after successful review.

No submission readiness is inferred from a successful local package check.

## Official references checked 2026-10-09

- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/plugins/build/skills
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/deploy/app-review
- https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
- https://agent-plugins.org/schemas/1.0.0/mcp.schema.json

The package follows the portable root manifest and fixed component paths.
OpenAI-specific listing/review fields live under `extensions.com.openai`.
Public submission excludes `.app.json` app mappings and lifecycle hooks.
The remote MCP and its review materials are included from the first package;
review video and live endpoint remain prerequisites, not fabricated placeholders.
