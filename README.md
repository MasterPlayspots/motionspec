# MotionSpec

<img src="https://motionspec.dev/logo-512.png" alt="MotionSpec logo" width="96" align="right">

[![npm](https://img.shields.io/npm/v/motionspec?color=cb3837&label=npm)](https://www.npmjs.com/package/motionspec)
[![node](https://img.shields.io/node/v/motionspec?color=339933)](https://www.npmjs.com/package/motionspec)
[![license](https://img.shields.io/npm/l/motionspec)](./LICENSE)
![tests](https://img.shields.io/badge/tests-295%20passing-brightgreen)
![coverage](https://img.shields.io/badge/coverage-%E2%89%8899%25%20lines%20·%2098%25%20funcs-brightgreen)
![supply chain](https://img.shields.io/badge/runtime%20deps-2%20·%200%20vulns%20·%20SBOM-blue)
![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.github.MasterPlayspots%2Fmotionspec-6f42c1)

**MotionSpec is an open-core trust layer that verifies and compiles reduced-motion-safe, on-budget UI animation for AI-generated web apps.** An LLM authors a **schema-validated JSON spec**; a **deterministic compiler** emits GSAP or native WAAPI/CSS — injection-proof and catalog-validated *by construction*, with an enforced `prefers-reduced-motion` fallback and a performance budget, checked against WCAG 2.2.2 (Pause, Stop, Hide) and WCAG 2.3.3 (Animation from Interactions).

> **Not to be confused with:** the Android Material Components `MotionSpec` class, the iOS material-motion `MotionSpec`, Motion.dev / Framer Motion, the usemotion.com calendar app, the Motion Specialties mobility brand, or text-to-video generators (Runway/Sora/Kling/Viggle). MotionSpec verifies the *UI animation inside web apps* — it does not generate video.

The thesis: **capability lives in the catalog, not the model.** A bigger model can write more elaborate specs, but it can never emit a primitive, parameter, or selector the Trust Boundary hasn't approved. The compiler trusts only what passes.

```
request ──> Routing (small model, Stage A) ──> MotionSpec (JSON)
                 │ cache · 1 repair-retry · escalation     │
                 ▼                                          ▼
            telemetry                          TRUST BOUNDARY (fail-closed)
                                                            │
                                              ┌─────────────┴─────────────┐
                                              ▼                           ▼
                                   Compiler (no model, Stage B)   WAAPI lowering (no GSAP)
                                              │                           │
                                   out/*.motion.js + .css       Element.animate / IO / @keyframes
```

## 60-second start

```bash
npx motionspec                               # stdio MCP server — no install needed
claude mcp add motionspec -- npx motionspec  # register in Claude Code / any MCP host

npm install -g motionspec                    # or take the CLI:
motion compile spec.json                     # deterministic build → ./out in your cwd
```

The host LLM authors the spec; the Trust Boundary stays enforced either way. Listed on the MCP Registry as `io.github.MasterPlayspots/motionspec`. A hosted MCP endpoint is live: keyless `motion_catalog` + `motion_validate` at `https://api.motionspec.dev/mcp` (streamable-http; keyed tiers cover compile/audit/stats) — setup: https://motionspec.dev/docs.

## Status

| | |
|---|---|
| Version | **v1.2.5** · schema frozen at spec v1 (ADR-0001, signed) |
| Published | **npm `motionspec`** (82 kB packed, 67 files, nothing dev-only ships) · MCP Registry |
| Tests | **295 green** — injection attacks, 6000-spec fuzz, golden determinism, schema parity, pause-controls, motion-a11y audit · CI on Node 18/20/22 + x86 Playwright e2e |
| Catalog | **40 primitives**, every one device-verified, reduced-motion-fallback mandatory; the 18 continuous loops also carry a WCAG-2.2.2 pause path |
| Supply chain | **2 runtime deps** (MCP SDK, zod — both pinned) · 0 vulnerabilities · CycloneDX SBOM committed · all permissive licenses · CI actions SHA-pinned |
| Coverage | ≈99% lines / ≈98% functions / ≈80% branches of `src/` + `worker/` (CI gate: 90/90/75) |
| Last audit | 2026-07-03 — 17/17 integration handshakes evidenced, infra 8.1/10, security: **0 critical**, full-git-history secret scan clean |
| First client | CHS Computer — live on Vercel |
| Hosted MCP | **live** — keyless `motion_catalog`/`motion_validate` at api.motionspec.dev/mcp · keyed tier: Cloudflare Worker, per-key gated (hashed keys in KV) · two-stage rate limiting (pre-auth per IP + per key, burst-verified) · per-minute cron canary + external heartbeat (synthetic fault → alert in <5 min, proven on real infra) · Analytics Engine telemetry, PII-scrubbed · gated `/dashboard` |

Schema v1 is frozen: `specVersion "1.0"` is the stable public contract; `"0.1"` is deprecated and accepted until v1.2 (a tripwire test enforces the revisit). The `[MS-XXX]` error-code registry is public API — codes are never reused or redefined.

## What the compiler guarantees

1. **Allow-list** — a primitive not in the catalog never reaches the compiler.
2. **Injection-proof** — ids, selectors, string params and triggers are charset-validated; every interpolation is a JS literal (`JSON.stringify`) or a CSS-screened raw value through one shared safety gate (`safety.js`). Malicious model output is rejected fail-closed — tested and fuzzed over 6000 random specs.
3. **a11y by construction (motion)** — safe defaults, enforced gates, and proof per build. `respectReducedMotion` is **default-on at the compiler level** (fail-safe): omitting it still yields a `prefers-reduced-motion` guard. Opting out is possible but emits `MS-GLOBALS-RRM-OFF`; a prompt-side instruction alone can never disable the guard.
4. **Pause/Stop for loops (WCAG 2.2.2)** — every continuous loop primitive is tagged `a11y.persistent`, and the compiler emits a pause path **by construction**: an `animation-play-state: paused` rule keyed on `html[data-ms-paused]` (outside the reduced-motion guard, so it is always live) plus, under `pauseControls: "auto"` (the fail-safe default), one accessible pause/stop toggle (`type="button"`, `aria-pressed` in sync, ≥24 px target, visible focus ring, not rendered under reduced motion). `pauseControls: "api"` keeps the CSS contract and leaves the control to the integrator; `"off"` opts out but emits `MS-GLOBALS-PAUSE-OFF` when a persistent motion is present. The promote-gate refuses any `infinite`/`repeat:-1` primitive that is not `a11y.persistent`. A spec with no loops adds **zero** extra bytes.
5. **Determinism** — same spec ⇒ byte-identical code (golden-file tests on both targets).
6. **Versioned** — schema frozen v1; catalog SemVer enforced by a diff-gate (a tightened bound shipped as a "patch" fails CI); specs may pin `catalogVersion` for reproducibility (`MS-CATALOG-PIN-MISMATCH` fail-closed).
7. **Observability** — every request logs `model | model-repaired | cache-hit | escalate-*` (local: JSONL sink · hosted: Cloudflare Analytics Engine, PII-scrubbed). Escalation clusters are the growth signal for new primitives.

## Two build targets, one boundary

Every catalog primitive compiles through the **same** validated spec to:

- **`vanilla-gsap`** — GSAP + ScrollTrigger, the production default.
- **WAAPI/CSS lowering** — zero-GSAP output on `Element.animate`, IntersectionObserver, and `@keyframes`/`position: sticky`. Full catalog coverage, byte-identical golden per primitive, same accessibility guard, same CSS safety gate. This is the framework-decoupling hedge: the IR outlives any animation library.

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

`motion audit <url>` (CLI, `--json` for the machine payload) and the `motion_audit` MCP tool run a **static** scan of a page's HTML and linked stylesheets — no headless browser, no new dependency. It reports four motion problems: CSS animation/transition without a `prefers-reduced-motion` guard (WCAG 2.3.3), animated properties other than transform/opacity, `infinite` animations with no pause path (`animation-play-state`/`data-*`), and `<marquee>`/autoplay motion over 5 s (WCAG 2.2.2). Each finding carries a selector, the WCAG reference, and a copy-paste fix. **It is honest about its limits:** runtime motion (WAAPI/GSAP/JS) is reported as *not audited (V2)* rather than silently passed. A page that clears every check earns the `reduced-motion-safe` badge — the exact output MotionSpec itself produces.

## Specification & conformance

MotionSpec is a governed format, not just a tool. The normative spec is [`SPEC.md`](SPEC.md) (versioned `1.0`, RFC-2119 MUST/SHOULD/MAY over the JSON Schema, with a documented ADR-based change process). [`CONFORMANCE.md`](CONFORMANCE.md) defines the five checks (schema, diagnostics, output, determinism, accessibility) an implementation passes to call itself *MotionSpec 1.0 compatible*, run against the published `test/golden` corpus. Multiple implementations passing the same corpus is what makes it a standard.

## Standards mapping

MotionSpec turns specific legal and normative accessibility requirements into compiler-enforced defaults. Each check maps to the frameworks that mandate it:

| MotionSpec mechanism | WCAG 2.2 | EN 301 549 | U.S. Section 508 | EAA / BFSG |
|---|---|---|---|---|
| Pause/stop path for every continuous loop (`animation-play-state` + accessible toggle) | **SC 2.2.2** Pause, Stop, Hide (Level A) | clause 9.2.2.2 (mirrors the WCAG SC) | incorporated (WCAG 2.0 A/AA baseline; 2.2.2 is Level A, in scope) | conformance presumed via EN 301 549 |
| Reduced-motion guard on every motion (`prefers-reduced-motion`) | **SC 2.3.3** Animation from Interactions (Level AAA) | clause 9.2.3.3 | beyond the AA baseline; provided anyway | supports the EAA "perceivable/operable" duties |
| `motion audit` static checks (loops without a pause path, motion missing a reduced-motion guard, autoplay > 5 s) | 2.2.2 / 2.3.3 | clause 9 (web) | WCAG-incorporated success criteria | pre-market self-check for covered products |

Notes: EN 301 549 is the EU harmonised standard whose clause 9 adopts the WCAG success criteria by number. U.S. Section 508 (Revised) incorporates WCAG 2.0 Level A and AA — SC 2.2.2 is Level A and therefore in scope; SC 2.3.3 is Level AAA and is provided as a stronger guarantee than the baseline requires. The European Accessibility Act (EAA) and its German transposition (BFSG, applicable from 28 June 2025) require covered digital products and services to be accessible, with conformance commonly demonstrated against EN 301 549. MotionSpec enforces the *motion* subset of these obligations by construction; it does not by itself make an entire product conformant.

## Quickstart (from a clone)

```bash
npm ci                                      # install (0 runtime deps beyond MCP SDK + zod)
npm test                                    # 295 tests: validator, goldens, router, fuzz, parity
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
test/              295 tests incl. injection, fuzz, goldens (both targets), parity; test/e2e (Playwright)
docs/              ADR records (docs/adr/) and per-primitive reference (docs/primitives/)
```

## Docs

- [SECURITY.md](SECURITY.md) — security posture of the npm package and hosted endpoint.
- `docs/adr/0001-schema-freeze-v1.md` — the frozen v1 contract and why.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup, the gate-driven PR checklist, commit conventions, golden-file regeneration, and a short architecture tour. Issue templates live under `.github/ISSUE_TEMPLATE/`.

## License

MIT.
