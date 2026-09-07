# Copilot instructions — motion accessibility with MotionSpec

These instructions apply whenever you write or change animation or transitions in web UI code
(CSS, React/JSX/TSX, Vue, Svelte, plain JS). Full context lives in `AGENTS.md` at the repo root.

## Rules

1. **Respect `prefers-reduced-motion`.** Every animation and transition must be disabled or
   reduced under `@media (prefers-reduced-motion: reduce)` (CSS) or behind
   `window.matchMedia('(prefers-reduced-motion: reduce)')` (JS). This maps to WCAG 2.3.3
   (Level AAA) — a best practice, not a Level A fix.
2. **Provide a pause/stop control for motion that starts automatically and runs longer than
   5 seconds, and for every `infinite` animation** (WCAG 2.2.2, Level A). A reduced-motion guard
   alone does not satisfy 2.2.2.
3. **Never flash content more than 3 times per second** (WCAG 2.3.1, Level A). MotionSpec does
   **not** audit flashing — verify this yourself.
4. **Animate `transform` and `opacity` only.** Do not animate layout properties such as `width`,
   `height`, `top`, `left`, `margin`, or `background`.
5. When a MotionSpec catalog primitive fits (40 exist: 18 loops, 10 hover/press, 12 scroll),
   prefer writing a MotionSpec JSON spec and compiling it over hand-writing keyframes: the
   compiler emits the reduced-motion guard and the pause path by construction and its output
   is deterministic.

## Commands (local, free, MIT — no key needed)

```bash
npx -p motionspec@1.2.7 motion compile spec.motionspec.json     # validate (fail-closed, [MS-XXX] errors, exit 1) + emit ./out/*.motion.js and .css
npx -p motionspec@1.2.7 motion catalog                          # list the 40 primitives and the catalog version
npx -p motionspec@1.2.7 motion audit https://example.com --json # static motion-a11y scan of a live URL
```

There is no separate `validate` subcommand in the CLI; validation is the first stage of `compile`.

`audit --json` returns `{ ok, url, score, badge, findings: [{ selector, rule, wcag, fix }], summary, disclosures }`.
`badge` is the literal string `"reduced-motion-safe"` only when there are zero findings.

## MCP endpoint

`https://api.motionspec.dev/mcp` (streamable HTTP). Keyless tools: `motion_catalog`, `motion_validate`.
Keyed tools on the hosted endpoint: `motion_compile`, `motion_audit`, `motion_stats` — Dev Key $39/month
(1 domain) or Agency $249/month (up to 10 domains), see https://motionspec.dev/pricing.
`npx -y motionspec` runs all five tools locally over stdio without a key.

## Scope statement for every audit report

The audit is a static scan of the page HTML, `<style>` blocks and linked stylesheets. It does not
evaluate inline `style=""`, `@import`, CSS-in-JS, external JavaScript bundles (GSAP/WAAPI are only
detected and disclosed as "not audited"), `<video autoplay>`, GIF, Canvas/WebGL, SVG SMIL,
Lottie/Rive, View Transitions, scroll-driven animations, or flashing (2.3.1). A clean score means
"nothing found in the loaded CSS", not "this page is accessible".
