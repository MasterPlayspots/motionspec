# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Code, comments, docs, and this changelog are English (EN migration 2026-07-03).

## [Unreleased]

### Added
- `SPEC.md` — normative MotionSpec 1.0 specification (RFC-2119 MUST/SHOULD/MAY over the JSON Schema, with the ADR-based change process).
- `CONFORMANCE.md` — the five-check certification procedure (schema, diagnostics, output, determinism, accessibility) against the published `test/golden` corpus.
- README **Standards mapping** table (WCAG 2.2 SC 2.2.2 / 2.3.3 → EN 301 549, U.S. Section 508, EAA / BFSG) and a **Specification & conformance** section.

## [1.2.0] - 2026-07-06

Motion accessibility completed for the loop primitives (WCAG 2.2.2) and a
static motion-a11y checker for third-party pages. Additive minor: no existing
param bounds change, so the catalog SemVer gate stays green without a bump.

### Added
- **`pauseControls` (WCAG 2.2.2 Pause, Stop, Hide).** Every continuous loop
  primitive now carries `a11y.persistent: true`, and the compiler emits a pause
  path by construction for both targets (GSAP and WAAPI, byte-identical via one
  shared helper in `safety.js`): an `animation-play-state: paused !important`
  rule keyed on `html[data-ms-paused]` (outside the reduced-motion guard, so it
  is always live; `> *` reaches marquee children). Under `pauseControls: "auto"`
  (the fail-safe default) it also injects one accessible pause/stop toggle
  (`type="button"`, `aria-pressed` synced, ≥24 px target size, visible
  `:focus-visible` ring, `localStorage` persistence, not rendered under
  `prefers-reduced-motion: reduce`). `"api"` keeps the CSS contract without the
  button; `"off"` opts out but emits the warning `MS-GLOBALS-PAUSE-OFF` when a
  persistent motion is present. A spec with no loops adds zero extra bytes.
- New globals `pauseControls` (`"auto"|"api"|"off"`) and `pauseLabels`
  (`{pause?, play?}`), validated in `validate.js` and mirrored in the JSON
  schema; an invalid value is a hard error `MS-GLOBALS-PAUSE-BAD`.
- Promote-gate **Stage 6**: any primitive whose template runs `infinite` /
  `repeat: -1` must declare `a11y.persistent`, and a `pauseControls`-forced
  example compile must carry `animation-play-state` + `data-ms-paused`.
- **Motion-a11y checker** — `motion audit <url>` (CLI, `--json`) and the
  `motion_audit` MCP tool. A self-contained static scanner (no new runtime
  dependency) fetches a page's HTML + linked stylesheets and flags: animation/
  transition without a `prefers-reduced-motion` guard (2.3.3), animated
  non-transform/opacity properties, `infinite` animations with no pause path
  (2.2.2), and `<marquee>`/autoplay over 5 s (2.2.2). Output is
  `{score, findings, summary, badge, disclosures}` + a Markdown report; runtime
  motion (WAAPI/GSAP/JS) is disclosed as *nicht geprüft (V2)*. A clean page
  earns the `reduced-motion-safe` badge.

### Changed
- Promote-gate stages 6–8 (determinism/golden, catalog-lock, WAAPI readiness)
  renumbered to 7–9 to make room for the new pauseControls stage.
- WAAPI loop goldens gain the pause-path CSS; the `showcase` golden gains the
  pause CSS + toggle. No-loop artifacts (e.g. `hero`) stay byte-identical.

## [1.1.0] - 2026-07-05

Catalog expansion from 9 to 40 transform/opacity-only primitives, each with a
hand-written WAAPI lowering and committed golden. Additive minor: no existing
param bounds change. Catalog pin `99ad45d234ae909b`.

### Added
- **Catalog 9 → 40 primitives (waves A–E).** 31 new transform/opacity-only
  primitives, each with a WAAPI lowering + committed golden, a keyword-map
  entry, and the reduced-motion guard enforced by construction:
  scroll-scrub (`parallaxX`, `rotateOnScroll`, `fadeOnScroll`, `skewOnScroll`),
  viewport reveal (`revealScale`, `flipReveal`), CSS loops (`pulseLoop`,
  `spinLoop`, `swayLoop`, `breatheLoop`, `marqueeVertical`, `kenBurns`,
  `jelloLoop`, `stretchLoop`, `wobbleLoop`, `squashLoop`, `tiltLoop`,
  `flipLoop`, `teeterLoop`, `glideLoop`, `bounceLoop`), and CSS hover/active
  (`pressShrink`, `hoverGrow`, `hoverLift`, `hoverRotate`, `hoverSink`,
  `hoverSkew`, `hoverFlip`, `hoverExpand`, `hoverSpin`). Wires `SUPPORTED` +
  `emitMotion`, the keyword-map, the worker catalog bundle, and the
  publish-shape allow-list. `catalog.lock.json` is deliberately NOT relocked
  (release-time only, ADR-0001 D2).
- `test/branch-hardening.test.js` — covers fail-closed edge/error paths the
  happy-path suite missed (catalog meta-schema rejections, request-cache
  miss/TTL/corrupt/sweep/evict, catalog SemVer diff violations, WAAPI
  once:false / no-opacity / scrub:0 / reduced-motion-off, Trust-Boundary
  non-object inputs). Branch coverage rises to ~80%.
- `STATUS.md` — project-status snapshot.

### Changed
- Drop the provably-dead `typeof params.X === "number" ? params.X : default`
  fallbacks in the wave A/B emitters (`rotateOnScroll`, `fadeOnScroll`,
  `revealScale`, `parallaxX`, `flipReveal`): `withDefaults()` already fills
  every param from its schema default, so the false branch was unreachable.
  WAAPI goldens stay byte-identical.
- README refresh — badges, WAAPI target, catalog forge, security posture,
  2026-07-03 audit, current layout. `build-demo.js` adopts the brand palette
  at page generation (primitive JSON untouched; catalog hash stable).

## [1.0.7] - 2026-07-03

Ships the EN migration to npm. Context: 1.0.6 was published 2026-07-03 11:16Z
from `e2c351a` (pre-migration) — this release moves the published package to
the fully English surface.

### Changed
- Full DE→EN migration of every shipped and living surface: code comments,
  logs, API/error messages, model prompts, generated reports, CLI/demo/dashboard
  UI, test titles and coupled assertions; goldens regenerated. Deliberately kept
  bilingual: `KEYWORD_MAP` intent regexes, one German few-shot request, German
  input fixtures (they exercise the German keyword paths).
- README truth fix (v1.0.6, 9 primitives); CONTRIBUTING now documents the three
  golden-regeneration flags; `make release` prints a registry dist-tag truth
  check after publishing (audit finding F2).

### Added
- internal audit reports — phase-0 inventory, migration report,
  17-handshake matrix, infrastructure audit (8.1/10), security findings
  (0 critical; secrets clean across working tree + full history), final report.

## [1.0.6] - 2026-07-03

Scanner-surface release: the npm tarball now ships only consumer-relevant
files. No runtime-logic changes.

### Fixed
- npm tarball ships only consumer files (35 instead of 41): the six dev/CI
  gate scripts (`assert-canonical`, `worker-smoke`, `sbom-check`,
  `license-check`, `catalog-lock`, `forge`) are repo-only now — they caused
  shell/network/env-access flags on the package itself (e.g. Socket.dev).
  `bin/motion.js` and `bin/promote-gate.js` (required by `src/forge/generate.js`)
  remain shipped.

### Added
- `test/publish-shape.test.js` — asserts the exact packed file list and that
  the extracted tarball loads `src/forge/generate.js` without `node_modules`
  (guards the promote-gate require edge).

### Docs
- `SECURITY.md` — supply chain, network/env/filesystem behavior, code-execution
  guarantees, hosted-endpoint hardening, vulnerability reporting; linked from
  the README.

## [1.0.5] - 2026-07-02

Credibility release: ships the current README to npm (the published 1.0.4
README still carried pre-1.0.4 figures) and the Wave-A engine hardening.

### Added
- Per-Key auth registry (KV) + per-key rate limiting; admin shared-secret retained.
- Abuse alert: worker posts to ABUSE_ALERT_URL when the rate limiter trips (throttled, fire-and-forget).
- Pre-auth rate limit (cf-connecting-ip) closing the key-enumeration window; `rate_limited` telemetry datapoint.
- `floatLoop` — 9th primitive (CSS-only, pattern-gated).
- `src/compiler/safety.js` — single source for the CSS safety constants (was duplicated across lowering passes).

### Changed
- cssTransition/pinnedSection/scrollReveal/staggerReveal now pattern-validate their params (catalog 2.0.0): injection-proof is now also correctness-checked.
- Cache tests run against an isolated tmpdir (`MOTION_CACHE_DIR` override); full suite is green on FUSE/sync mounts and clean-rooms.

## [1.0.4] - 2026-06-21

Audit remediation following the 2026-06-20 codebase audit. The hardened `src/`
now ships to npm consumers; the Worker is deployed with rate limiting verified
live.

### Added
- Shared `src/compiler/keyword-map.js` so the mock router and the discovery tool map the same 8 primitives (TASK-025).
- Shared `catalogSummary()` in `catalog.js` for the system prompt and the MCP catalog tool (TASK-026).
- Deeper Analytics Engine telemetry: per-outcome attempts and average latency via `GROUP BY`, surfaced on `/stats` (TASK-020).
- JSDoc typedefs for `validateSpec` / `compileSpec` / `route` (TASK-028).
- Complete runtime SBOM and a `sbom:check` completeness gate, wired into CI and `prepublishOnly` (TASK-021).
- `.github/CODEOWNERS` and a gated `deploy.yml` CD workflow (TASK-023, TASK-024).
- This changelog and a `prepublishOnly` guard requiring it (TASK-031).

### Changed
- Pinned `zod` to exact `4.4.3`; pinned all GitHub Actions to commit SHAs (TASK-011, TASK-009, TASK-010).
- Split `validateSpec` into per-section validators; behaviour unchanged (TASK-027).
- AE dataset name validated against an allow-list, reported as `MS-AE-DATASET` (TASK-017).
- `scheduled()` now runs the cron canary via `ctx.waitUntil` (TASK-018).
- Worker rate limiting migrated to the GA `[[ratelimits]]` binding; enforcement verified live — 429s under sustained over-limit load (#3).

### Fixed
- Schema `id`/`target` formats now mirror the runtime validator (`ID_RE`, 200-char selector cap) (TASK-012).
- `MS-INPUT-TOO-LARGE` published in the public error registry; `MAX_SPEC_BYTES` single-sourced (TASK-015).
- Constant-time secret comparison closes a length side-channel in the Worker auth gate (TASK-016).
- `package-lock.json` version synced to `1.0.3` (TASK-022).
- Phase 1: CLI now `await`s the telemetry summary, logging is fail-soft, reduced-motion defaults on with an `MS-GLOBALS-RRM-OFF` warning, and `/dashboard` carries security headers.
- Documentation test-count corrected (155 → 177); audit reports archived internally (raw metrics git-ignored).

## [1.0.3] - 2026-06-19
### Fixed
- CLI writes generated artifacts to the current working directory instead of into `node_modules`.
- README aligned with the published package.

## [1.0.2] - 2026-06-19
### Added
- MCP registry listing: `mcpName` and the `motionspec` bin entry.

## [1.0.0] - 2026-06-15
### Added
- Schema frozen as v1 (ADR-0001): `specVersion "1.0"` stable; `"0.1"` deprecated and accepted until v1.2.
- Catalog SemVer diff-gate and optional reproducibility pin (ADR-0001 D2).
- Phase C: hosted, secret-gated Cloudflare Worker MCP with Analytics Engine telemetry, a per-minute cron canary + external heartbeat, and a private dashboard.

## [0.5.1] - 2026-06-12
### Fixed
- Wired `cache.sweep()` on the first route (previously dead code); added cache and budget tests.

## [0.5] - 2026-06-12
### Fixed
- Closed 8 quick-win findings from the 2026-06-12 machine audit; added CI.

## [0.4] - 2026-06-12
### Added
- Sprint 1: demo generator and catalog wave 1 (8 device-verified primitives).

## [0.3] - 2026-06-12
### Added
- MCP server (`motionspec-mcp-server`) exposing the trust boundary to host LLMs.

## [0.2] - 2026-06-12
### Added
- Stage-A model routing and a hardened, fail-closed trust boundary feeding the deterministic compiler.
