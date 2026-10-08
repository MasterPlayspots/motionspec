# MotionSpec — web animation accessibility MCP server

<img src="https://motionspec.dev/logo-512.png" alt="MotionSpec logo" width="96" align="right">

[![npm](https://img.shields.io/npm/v/motionspec?color=cb3837&label=npm)](https://www.npmjs.com/package/motionspec)
[![node](https://img.shields.io/node/v/motionspec?color=339933)](https://www.npmjs.com/package/motionspec)
[![license](https://img.shields.io/npm/l/motionspec)](./LICENSE)
![tests](https://img.shields.io/badge/tests-354%20passing-brightgreen)
![coverage](https://img.shields.io/badge/coverage-97%25%20lines%20·%2095%25%20funcs%20·%2081%25%20branches-brightgreen)
![supply chain](https://img.shields.io/badge/runtime%20deps-2%20·%200%20vulns%20·%20SBOM-blue)
![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.github.MasterPlayspots%2Fmotionspec-6f42c1)
[![smithery badge](https://smithery.ai/badge/kevin-froeba/motionspec)](https://smithery.ai/servers/kevin-froeba/motionspec)

**MotionSpec is an MCP server and CLI for web animation accessibility.** It helps AI coding agents and frontend developers compile validated animation specs to deterministic **GSAP + CSS** and find motion-accessibility candidates in a page's loaded CSS: missing `prefers-reduced-motion` guards and missing pause paths for continuous animation.

The MIT compiler includes reduced-motion handling and loop pause controls by default. Its static audit supports review of **WCAG 2.2.2 (Pause, Stop, Hide — Level A)** and **WCAG 2.3.3 (Animation from Interactions — Level AAA)**. Findings need contextual review; a clean scan is not a full accessibility or WCAG-conformance assessment. Runtime JavaScript animation, flashing, video and Canvas are outside the audit's scope.

- **Create web animation:** choose a catalog primitive, validate a JSON spec, then compile vanilla-GSAP JavaScript and CSS. The internal WAAPI lowering is not a public build target.
- **Check CSS motion:** audit a URL for reduced-motion and pause-path candidates, then review the reported selectors and suggested fixes.
- **Prevent regressions:** use the [CI example](examples/ci/motion-audit.yml) to compare findings against an explicitly accepted baseline.

Local stdio MCP exposes all five tools without an API key (`npx -y motionspec`). The hosted endpoint at `https://api.motionspec.dev/mcp` provides keyless `motion_catalog` and `motion_validate`; hosted compile, audit and stats require a key. See the [installation guide](llms-install.md) and [motion accessibility guide](docs/motion-accessibility.md). Docs and product: https://motionspec.dev/docs.

The thesis: **capability lives in the catalog, not the model.** A bigger model can write more elaborate specs, but it can never emit a primitive, parameter, or selector the Trust Boundary hasn't approved. The compiler trusts only what passes.

```
request ──> Routing (small model, Stage A) ──> MotionSpec (JSON)
                 │ cache · 1 repair-retry · escalation     │
                 ▼                                          ▼
            telemetry                          TRUST BOUNDARY (fail-closed)
                                                            │
                                              ┌─────────────┴─────────────┐
                                              ▼                           ▼
                                   Compiler (no model, Stage B)   WAAPI lowering (internal — no CLI/MCP path yet)
                                              │                           │
                                   out/*.motion.js + .css       Element.animate / IO / @keyframes
```

### Not to be confused with

> **Not to be confused with:** the Android Material Components `MotionSpec` class, the iOS material-motion `MotionSpec`, Motion.dev / Framer Motion, the usemotion.com calendar app, the Motion Specialties mobility brand, or text-to-video generators (Runway/Sora/Kling/Viggle). MotionSpec checks the *UI animation inside web apps* — it does not generate video.

## 60-second start

```bash
npx motionspec                               # stdio MCP server — no install needed
claude mcp add motionspec -- npx motionspec  # register in Claude Code / any MCP host

npm install -g motionspec                    # or take the CLI:
motion compile spec.json                     # deterministic build → ./out in your cwd
```

The host LLM authors the spec; the Trust Boundary stays enforced either way. Listed on the MCP Registry as `io.github.MasterPlayspots/motionspec`. A hosted MCP endpoint is live: keyless `motion_catalog` + `motion_validate` at `https://api.motionspec.dev/mcp` (streamable-http; keyed tiers cover compile/audit/stats) — setup: https://motionspec.dev/docs.

### Claude Code plugin

This repo is also a Claude Code plugin: it bundles the MCP server (`npx motionspec`, all five tools, local, keyless) with two skills — `/motionspec:motion` (the author→validate→compile workflow) and `/motionspec:audit <url>` (motion-accessibility check, WCAG 2.2.2/2.3.3). Try it directly from a clone with `claude --plugin-dir .`, or install it from the community marketplace once listed:

```bash
/plugin marketplace add anthropics/claude-plugins-community
/plugin install motionspec@claude-community
```

## Status

| | |
|---|---|
| Version | **v1.2.8** · schema frozen at spec v1 (ADR-0001, signed) |
| Published | **npm `motionspec`** (104 kB packed, 67 files, nothing dev-only ships) · MCP Registry |
| Tests | **354 green** — injection attacks, 6000-spec fuzz, golden determinism, schema parity, pause-controls, motion-a11y audit · CI on Node 18/20/22 + x86 Playwright e2e |
| Catalog | **40 primitives**, every one device-verified, reduced-motion-fallback mandatory; the 18 continuous loops also carry a WCAG-2.2.2 pause path |
| Supply chain | **2 runtime deps** (MCP SDK, zod — both pinned) · 0 vulnerabilities · CycloneDX SBOM committed · all permissive licenses · CI actions SHA-pinned |
| Coverage | 97.23% lines / 95.17% functions / 80.82% branches of `src/` (`npm run coverage`, 2026-10-08; CI gate 90/90/75) |
| Last audit | 2026-07-03 — 17/17 integration handshakes evidenced, infra 8.1/10, security: **0 critical**, full-git-history secret scan clean |
| First client | CHS Computer — live on Vercel |
| Hosted MCP | **live** — keyless `motion_catalog`/`motion_validate` at api.motionspec.dev/mcp · keyed tier: Cloudflare Worker, per-key gated (hashed keys in KV) · two-stage rate limiting (pre-auth per IP + per key, burst-verified) · per-minute cron canary + external heartbeat (synthetic fault → alert in <5 min, proven on real infra) · Analytics Engine operations telemetry (request bodies, specs and error text are not stored) · gated `/dashboard` |

Schema v1 is frozen: `specVersion "1.0"` is the stable public contract; `"0.1"` is deprecated and accepted until v1.2 (a tripwire test enforces the revisit). The `[MS-XXX]` error-code registry is public API — codes are never reused or redefined.

## What the compiler guarantees

1. **Allow-list** — a primitive not in the catalog never reaches the compiler.
2. **Injection-proof** — ids, selectors, string params and triggers are charset-validated; every interpolation is a JS literal (`JSON.stringify`) or a CSS-screened raw value through one shared safety gate (`safety.js`). Malicious model output is rejected fail-closed — tested and fuzzed over 6000 random specs.
3. **a11y by construction (motion)** — safe defaults, enforced gates, and proof per build. `respectReducedMotion` is **default-on at the compiler level** (fail-safe): omitting it still yields a `prefers-reduced-motion` guard. Opting out is possible but emits `MS-GLOBALS-RRM-OFF`; a prompt-side instruction alone can never disable the guard.
4. **Pause/Stop for loops (WCAG 2.2.2)** — every continuous loop primitive is tagged `a11y.persistent`, and the compiler emits a pause path **by construction**: an `animation-play-state: paused` rule keyed on `html[data-ms-paused]` (outside the reduced-motion guard, so it is always live) plus, under `pauseControls: "auto"` (the fail-safe default), one accessible pause/stop toggle (`type="button"`, `aria-pressed` in sync, ≥24 px target, visible focus ring, not rendered under reduced motion). `pauseControls: "api"` keeps the CSS contract and leaves the control to the integrator; `"off"` opts out but emits `MS-GLOBALS-PAUSE-OFF` when a persistent motion is present. The promote-gate refuses any `infinite`/`repeat:-1` primitive that is not `a11y.persistent`. A spec with no loops adds **zero** extra bytes.
5. **Determinism** — same spec ⇒ byte-identical code (golden-file tests for the GSAP output and for the internal WAAPI lowering).
6. **Versioned** — schema frozen v1; catalog SemVer enforced by a diff-gate (a tightened bound shipped as a "patch" fails CI); specs may pin `catalogVersion` for reproducibility (`MS-CATALOG-PIN-MISMATCH` fail-closed).
7. **Observability** — every request logs `model | model-repaired | cache-hit | escalate-*` (local: JSONL sink · hosted: Cloudflare Analytics Engine, PII-scrubbed). Escalation clusters are the growth signal for new primitives.

## One build target, one internal lowering

What you can get out of the compiler today, through the CLI or the MCP tools, is exactly one target:

- **`vanilla-gsap`** — GSAP + ScrollTrigger. `meta.target` accepts nothing else (schema frozen at v1).

A second lowering exists in the codebase and is kept green by the test suite, but it is **not reachable** through any interface:

- **WAAPI/CSS lowering** (`src/compiler/lower-waapi.js`) — zero-GSAP output on `Element.animate`, IntersectionObserver, and `@keyframes`/`position: sticky`. Full catalog coverage, byte-identical golden per primitive, same accessibility guard, same CSS safety gate. This is the framework-decoupling hedge: the IR outlives any animation library. **Internal** — referenced only by the tests and `bin/promote-gate.js`; there is no CLI flag, no MCP tool and no schema target for it (ADR-0001 freezes `meta.target` to `vanilla-gsap`; engine wiring is out of scope, ADR-0002). Do not plan a build on it until a release note says otherwise.

## The catalog grows itself — humans keep the taste

The **Catalog Forge** (CI workflow, manual dispatch) picks the top telemetry-ranked gap, generates *one* candidate primitive, drives it through a multi-stage gauntlet — meta-schema, mandatory reduced-motion fallback, performance budget, output determinism (entropy tokens like `Math.random`/`Date.now` fail the gate), catalog-SemVer legality, golden creation — and opens a PR. **It cannot merge, publish, or deploy**: structurally (workflow permissions carry no `packages`/`id-token`, PR-only) and by regression test (`forge-workflow-guard` fails CI if anyone smuggles a publish step in). Gate 1 is always a human taste review.

## MCP server

| Tool | Contract |
|---|---|
| `motion_catalog` | primitives + authoring rules + catalog version (16-hex pin) |
| `motion_validate` | fail-closed Trust Boundary; precise `[MS-XXX]` errors; surfaces deprecations |
| `motion_compile` | deterministic spec → code; never emits on a failed validation |
| `motion_audit` | static motion-a11y check of a live URL (read-only, open-world) |
| `motion_stats` | telemetry summary (escalations = catalog growth signal) |

Input is size-capped (`MS-INPUT-TOO-LARGE`, 64 KB). The stdio server exposes one tool factory as the single source of truth, contract-tested in `test/mcp.test.mjs`. A hosted MCP endpoint is live: keyless `motion_catalog` + `motion_validate` at `https://api.motionspec.dev/mcp`; keyed tiers cover compile/audit/stats.

## Motion-a11y checker

`motion audit <url>` (CLI, `--json` for the machine payload) and the `motion_audit` MCP tool run a **static** scan of a page's HTML and linked stylesheets — no headless browser, no new dependency. It reports four motion problems: CSS animation/transition without an effective `prefers-reduced-motion` guard (WCAG 2.3.3 — the guard must win the cascade), animated properties other than transform/opacity, `infinite` animations with no pause path (`animation-play-state`/`data-*`), and `<marquee>`/autoplay motion over 5 s (WCAG 2.2.2). Colour/opacity-only transitions are not motion under 2.3.3 and are not reported; loading indicators (spinners, skeletons) are listed as `review` items with no score impact. Each finding carries a selector, the WCAG reference, and a copy-paste fix. The CLI, the `motion_audit` tool and the free check at motionspec.dev/motion-check run the same engine with the same limits (12 stylesheets, 2 MB, 8 s) and the same score. **It is honest about its limits:** runtime motion (WAAPI/GSAP/JS, WebGL libraries) is reported as *not audited (V2)* rather than silently passed, and a page with no CSS motion is `status: "not-measurable"` with `score: null` instead of a perfect score. The legacy `reduced-motion-safe` badge string is returned only for a measurable page with zero findings and no runtime motion library; it means only that these checks found no candidates in the loaded CSS, not that the page or its runtime motion is certified.

## Use in CI

`motion audit --json` is stable enough to gate a pull request. [`examples/ci/motion-audit.yml`](examples/ci/motion-audit.yml) is a copy-and-adapt GitHub Actions workflow that builds your site, serves the build directory on localhost, audits the paths you list with `npx -y -p motionspec@1.2.8 motion audit <url> --json` (local, MIT, no key, no hosted call), and compares each page with a checked-in baseline `.motionspec/baseline.json`.

The gate fails when a page got **worse** — the same rule MotionSpec's weekly re-scan uses: the score fell, *or* the number of Level-A findings (WCAG 2.2.2 Pause, Stop, Hide) rose. Scores are compared only when both runs are measurable and use the same scoring version; a baseline written by 1.2.7 or earlier (scoring v1) needs one re-baseline. A page without a baseline entry never fails; that run is the baseline. Re-baselining is a deliberate manual run (`workflow_dispatch` with `update_baseline: true`) that uploads the new file as an artifact for you to commit — the workflow never commits on its own. Fixed findings are listed as `- fixed:` lines, new ones as `+ new finding:`.

The machine payload is `{ ok, url, status, score, scoring, scoring_doc, summary, badge, findings, groups, disclosures, coverage }`; read `status` before using `score` (it is `null` when the page is not measurable). Note that `audit` takes a **URL**, not a directory — hence the local server step. And the scope caveat travels with it: this is a static CSS scan (no inline `style=""`, `@import`, CSS-in-JS, external JS bundles, video/GIF/Canvas, or flashing checks); a green gate means "no regression in the loaded CSS", not "accessible".

## Specification & conformance

MotionSpec is a governed format, not just a tool. The normative spec is [`SPEC.md`](SPEC.md) (versioned `1.0`, RFC-2119 MUST/SHOULD/MAY over the JSON Schema, with a documented ADR-based change process). [`CONFORMANCE.md`](CONFORMANCE.md) defines the five checks (schema, diagnostics, output, determinism, accessibility) an implementation passes to call itself *MotionSpec 1.0 compatible*, run against the published `test/golden` corpus. Multiple implementations passing the same corpus is what makes it a standard.

## Standards mapping

MotionSpec checks a limited set of motion signals. These are candidates for review, not a
conformance verdict or a substitute for testing the delivered interface.

| Criterion | Level | What to review with MotionSpec |
|---|---|---|
| [WCAG 2.2.2 — Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) | A | For non-essential moving, blinking or scrolling content that starts automatically, lasts more than five seconds and appears alongside other content, check for a usable pause, stop or hide mechanism. The compiler supplies loop pause paths by default; the static audit looks for missing-path candidates. Auto-updating content has separate requirements without the five-second threshold. |
| [WCAG 2.3.3 — Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | AAA | Non-essential motion triggered by interaction must be disableable. Reduced-motion handling is one implementation approach. A missing media query alone does not establish failure, and finding one does not establish success. |

Animating only `transform` and `opacity` is a performance recommendation, not by itself a
WCAG success criterion. The audit does not measure flashing (2.3.1), runtime GSAP/WAAPI,
video, Canvas, or the usability of a pause control. It does not establish compliance with
EN 301 549, Section 508, EAA, BFSG, or any other legal framework.

## Quickstart (from a clone)

```bash
npm ci                                      # install (0 runtime deps beyond MCP SDK + zod)
npm test                                    # 354 tests: validator, goldens, router, fuzz, parity
node bin/motion.js catalog                  # primitives + catalog version
node bin/motion.js compile examples/hero.motionspec.json
node bin/motion.js pipeline "Hero headline fades in, cards staggered" --mock
node bin/motion.js stats                    # telemetry (model / repaired / cache-hit / escalate)
```

Live model instead of `--mock`: set `MOTION_API_KEY` (or `OPENROUTER_API_KEY`); optional `MOTION_MODEL` (default `anthropic/claude-haiku-4.5`) and `MOTION_BASE_URL` (any OpenAI-compatible endpoint). See `.env.example`.

### Gates (run these — they are the contract)

```bash
npm test                   # full suite, fail-closed trust boundary + golden determinism
npm run coverage           # FAILS under 90/90/75 (lines/functions/branches)
npm run catalog-lock:check # ADR-0001 D2: a tightened bound shipped as a "patch" fails here
npm run sbom && npm run sbom:check && node bin/license-check.js
npm run e2e                # real-browser Playwright (CI x86 runner)
```

Releases run the whole chain plus a canonical-clone guard and finish with a **registry truth check** — a version is "live" when the npm dist-tag says so, not when a local run went green.

## Security

Defense in depth on the hosted path: constant-time admin-secret comparison (no timing side channel on position *or* length) · customer keys stored **hashed** (SHA-256) in KV, fail-closed on any lookup error · pre-auth per-IP rate limiting closes the key-enumeration gap before auth work starts, per-key limiting after · throttled abuse alerts with zero PII · telemetry scrubbed before storage · strict CSP/`X-Frame-Options`/`nosniff` on the only ungated page (a data-free dashboard shell). Full posture incl. reporting: [SECURITY.md](SECURITY.md). Last audit (2026-07-03): no critical findings, no secret ever committed across 197 commits of history.

## Layout

```
schema/            MotionSpec JSON schema (static contract, parity-tested against the validator)
primitives/        catalog: 40 verified primitives (safe templates)
catalog.lock.json  released catalog baseline (SemVer diff-gate)
src/compiler/      validate.js (Trust Boundary) · compile.js (GSAP) · lower-waapi.js (WAAPI/CSS)
                   safety.js (one shared CSS gate) · keyword-map.js · catalog.js · catalog-semver.js
src/router/        prompt.js · clients.js (openai-compat + mock) · route.js · cache.js · telemetry
src/mcp/           server.mjs (stdio) · register-tools.js (shared tool factory)
src/forge/         generate.js · prioritize.js — the gauntlet-verified catalog forge
src/discover/      gap analysis: request intents ↔ catalog coverage
src/demo/          device-verification demo pages (`?rm=1` simulates reduced motion)
bin/               motion.js (CLI) · promote-gate.js — dev/CI gate scripts stay repo-only
test/              354 tests incl. injection, fuzz, goldens (GSAP + internal WAAPI lowering), parity; test/e2e (Playwright)
docs/              ADR records (docs/adr/) and per-primitive reference (docs/primitives/)
```

## Docs

- [Web animation accessibility](docs/motion-accessibility.md) — reduced motion, pause controls, GSAP output, review workflow and audit limits.
- [Discovery and search measurement](docs/discovery.md) — separate registry, GitHub, npm and web search surfaces, with a repeatable query log.
- [Usage measurement plan](docs/analytics-plan.md) — current local telemetry, proposed aggregate hosted counters, and limits of npm download statistics.
- [AGENTS.md](AGENTS.md) — what a coding agent should know: when to use MotionSpec, the commands, the three motion rules (reduced motion · pause path · no flashing), and what the audit does **not** check. The same rules in editor form: [`.cursor/rules/motionspec.mdc`](.cursor/rules/motionspec.mdc) and [`.github/copilot-instructions.md`](.github/copilot-instructions.md).
- [SECURITY.md](SECURITY.md) — security posture of the npm package and hosted endpoint.
- `docs/adr/0001-schema-freeze-v1.md` — the frozen v1 contract and why.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup, the gate-driven PR checklist, commit conventions, golden-file regeneration, and a short architecture tour. Issue templates live under `.github/ISSUE_TEMPLATE/`.

## License

MIT.
