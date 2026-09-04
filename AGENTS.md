# AGENTS.md — how a coding agent should use MotionSpec

This file is for AI coding agents (Claude Code, Cursor, Copilot, Codex, Cline, …) working in a
repository that builds a web UI. It says what MotionSpec is, when to reach for it, which commands
exist, and — just as important — what it does **not** check.

## What MotionSpec is

MotionSpec is an MIT-licensed npm package (`motionspec`) with two parts:

1. **A deterministic motion compiler.** You write a small JSON spec (`specVersion "1.0"`) that
   picks primitives from a fixed catalog of **40** (18 loops, 10 hover/press, 12 scroll). The
   compiler validates it fail-closed (45 `MS-*` error codes) and emits vanilla-GSAP JavaScript
   plus CSS. Same spec → byte-identical output. Every build carries a `prefers-reduced-motion`
   guard, and every continuous loop gets a pause path (`html[data-ms-paused]` +
   `animation-play-state: paused`) by construction.
2. **A static motion-accessibility audit** of a live URL: it fetches the HTML and linked
   stylesheets and scans the CSS text. No headless browser.

It is **not** the Android `MotionSpec` class, not Motion.dev / Framer Motion, not usemotion.com,
and not a video generator.

## When to use it

Use MotionSpec when you are about to add or change **animation or transitions in a web UI** —
scroll reveals, parallax, hover effects, loaders, marquees, hero loops — or when you are asked
whether a page's motion is accessible.

Do not use it as a general accessibility checker. Its scope is motion: WCAG 2.2.2
(Pause, Stop, Hide — Level A) and 2.3.3 (Animation from Interactions — Level AAA).

## The rules an agent should follow, with or without MotionSpec

1. **Respect `prefers-reduced-motion`.** Every animation and transition you write must be
   disabled or reduced under `@media (prefers-reduced-motion: reduce)` (CSS) or behind
   `matchMedia('(prefers-reduced-motion: reduce)')` (JS). This maps to WCAG 2.3.3 (AAA); it is
   a best practice, not a Level A fix.
2. **Provide a pause for motion that starts automatically and runs longer than 5 seconds,
   including `infinite` animations** (WCAG 2.2.2, Level A). A `prefers-reduced-motion` guard
   alone does not satisfy 2.2.2 — the user needs a visible pause/stop control or an
   equivalent mechanism.
3. **Never flash content more than 3 times per second** (WCAG 2.3.1, Level A).
   **MotionSpec does not audit flashing** — you have to check this yourself.
4. **Animate `transform` and `opacity`**, not layout properties (`width`, `top`, `background`…).
5. Prefer the catalog primitive over hand-written keyframes when one exists; if none fits,
   write CSS/JS by hand and still apply rules 1–4.

## Commands (local, free, MIT — nothing here needs a key)

The npm package installs two executables: `motion` (the CLI) and `motionspec` (the MCP server).

```bash
# Compile — this is also the validator: an invalid spec is rejected fail-closed with
# [MS-XXX] errors and exit code 1, and nothing is written.
npx -p motionspec@1.2.7 motion compile spec.motionspec.json      # → ./out/*.motion.js + .css

# List the 40 primitives and the catalog version
npx -p motionspec@1.2.7 motion catalog

# Audit a live URL (static scan). --json gives a stable machine payload.
npx -p motionspec@1.2.7 motion audit https://example.com --json
```

There is no separate `validate` subcommand in the CLI; validation is the first stage of
`compile`. Over MCP, validation is its own tool (`motion_validate`, see below).

`audit --json` returns
`{ ok, url, score, badge, findings: [{ selector, rule, wcag, fix }], summary, disclosures }`.
`score` is 0–100 (−25 per 2.2.2 finding, −10 per 2.3.3 finding); `badge` is the literal string
`"reduced-motion-safe"` when there are zero findings, otherwise `null`.

A minimal spec:

```json
{
  "specVersion": "1.0",
  "meta": { "target": "vanilla-gsap" },
  "motions": [
    { "id": "hero", "primitive": "scrollReveal", "target": ".hero h1",
      "params": { "from": { "y": 24, "opacity": 0 } } }
  ]
}
```

`meta.target` accepts only `"vanilla-gsap"` (schema frozen at v1). `globals.pauseControls` is
`"auto"` (default: an accessible pause button is emitted), `"api"` (you render the control) or
`"off"` (allowed, but emits `MS-GLOBALS-PAUSE-OFF` when a loop is present).

## MCP endpoint

- **Hosted, keyless:** `https://api.motionspec.dev/mcp` (streamable HTTP, stateless).
  Free tools: `motion_catalog`, `motion_validate` — both read-only. Rate limit: 60 requests per
  10 s per IP.
- **Hosted, keyed:** `motion_compile`, `motion_audit`, `motion_stats` require a key on the hosted
  endpoint. Keys: **Dev Key $39/month (1 domain)** or **Agency $249/month (up to 10 domains)** —
  https://motionspec.dev/pricing. Without a key these tools answer with a short notice instead of
  a result.
- **Local, all five tools, no key:** `npx -y motionspec` runs the same server over stdio on your
  machine. Compilation is MIT and runs locally — the key only gates the hosted endpoint.

```bash
claude mcp add --transport http motionspec https://api.motionspec.dev/mcp   # hosted
claude mcp add motionspec -- npx -y motionspec                              # local stdio
```

Suggested loop for an agent: `motion_catalog` → write the spec → `motion_validate` until
`ok: true` **and** `warnings` is empty or understood → compile (locally via CLI or
`motion_compile`) → paste the emitted code verbatim; change the spec, never the output.

## What the audit does NOT check (say so in every report)

The audit is a static scan of the page HTML, `<style>` blocks and `<link rel="stylesheet">`
sheets (max 20 sheets, 2 MB each, 8 s timeout). It reports four things: CSS animation/transition
without a reduced-motion guard (2.3.3); animated non-transform/opacity properties (2.3.3);
`infinite` animation without a pause path (2.2.2); `<marquee>` or autoplay animation > 5 s
without a pause path (2.2.2).

It does **not** evaluate: inline `style=""` attributes, `@import`ed sheets, CSS-in-JS, external
JavaScript bundles (GSAP/WAAPI/`requestAnimationFrame` are only *detected* as text signals in the
HTML and disclosed as "not audited"), `<video autoplay>`, animated GIF, Canvas/WebGL, SVG SMIL,
Lottie/Rive, View Transitions, scroll-driven animations, or flashing (2.3.1). A clean score
therefore means "nothing found in the loaded CSS", not "this page is accessible".

## Determinism

`compile` is a pure function of the spec and the catalog: the same input yields the same bytes
(golden-file tests in the repo). The audit's analysis is a pure function of the fetched text;
only the network layer touches the outside world. You can rely on both in CI — see
`examples/ci/motion-audit.yml` for a regression gate against a checked-in baseline.

## Where things live

- Repo: https://github.com/MasterPlayspots/motionspec · npm: https://www.npmjs.com/package/motionspec
- Docs: https://motionspec.dev/docs · agent context: https://motionspec.dev/llms.txt
- Editor rules in this repo: `.cursor/rules/motionspec.mdc`, `.github/copilot-instructions.md`
- Claude Code plugin: `.claude-plugin/` with the skills `/motionspec:motion` and `/motionspec:audit <url>`
