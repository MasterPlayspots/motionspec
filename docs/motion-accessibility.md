# Web animation accessibility with MotionSpec

MotionSpec is an MIT MCP server and CLI for creating GSAP web animation from validated
specs and reviewing motion-accessibility signals in HTML and CSS. Use it for AI-generated
interfaces, continuous hero loops, marquees, hover effects and scroll reveals.

## Choose the right workflow

| Task | Tool | Result and boundary |
|---|---|---|
| Find a supported animation | `motion_catalog` | Catalog and authoring rules; does not inspect a website. |
| Check an animation spec | `motion_validate` | Schema, catalog, safety errors and warnings; does not scan a URL. |
| Generate GSAP + CSS | `motion_compile` | Deterministic output with reduced-motion and loop pause defaults; inspect warnings and test integration. |
| Check an existing page | `motion_audit` | Static loaded-CSS findings with selectors and suggestions; runtime motion is outside scope. |
| Inspect local usage | `motion_stats` | Summary from the configured telemetry sink; not registry installs or global users. |

All five tools run locally without a key. On the hosted endpoint only `motion_catalog`
and `motion_validate` are keyless. See [installation](../llms-install.md).

## Create animation with reduced-motion and pause defaults

Ask your coding agent:

> Use MotionSpec to add a subtle scroll reveal and a continuous decorative loop. Start with
> motion_catalog, use only supported primitives, keep reduced-motion handling enabled and
> pauseControls set to auto. Validate the spec and review every warning before compiling.
> Test the resulting interface with reduced motion and keyboard-accessible pause controls.

The CLI offers the same compiler. Validation happens inside `compile`; there is no separate
CLI `validate` command:

```bash
node bin/motion.js catalog
node bin/motion.js compile examples/hero.motionspec.json
```

These commands run from a clone after `npm ci`. For package installation, use the current
published release as described in the [README](../README.md#60-second-start).
`vanilla-gsap` is the only public output target. The internal WAAPI lowering is not available
as a CLI flag, MCP tool or schema target.

## Review CSS motion on a website

```bash
node bin/motion.js audit https://example.com --json
```

Replace the example URL with a page you are authorized to inspect. For an agent:

> Run motion_audit on this URL. Separate static findings from untested runtime animation.
> Explain the selector, candidate issue and suggested fix, then list manual checks. Read
> `status` first: `not-measurable` (score `null`) means no CSS motion was found, not "safe".
> Do not interpret a score of 100 or the reduced-motion-safe badge as full WCAG conformance.

For a team maintaining many websites, start with representative page templates, review
findings and false positives, implement fixes, and use the
[CI regression example](../examples/ci/motion-audit.yml). A missing baseline does not fail
that example gate; review and commit the baseline deliberately.

## What do WCAG 2.2.2 and 2.3.3 mean here?

**WCAG 2.2.2 — Pause, Stop, Hide (Level A).** Non-essential moving, blinking or scrolling
content that starts automatically, runs longer than five seconds and appears alongside other
content needs a pause, stop or hide mechanism. Auto-updating content has a separate rule
without that five-second threshold. MotionSpec's pause-path scan is a heuristic; check that
an actual control works, is discoverable and is keyboard-operable. A reduced-motion query
alone is not an automatic substitute for this review.

**WCAG 2.3.3 — Animation from Interactions (Level AAA).** Non-essential movement triggered
by interaction must be disableable. `prefers-reduced-motion` is one way to support this.
Other effective controls may satisfy the requirement; a missing query alone is not proof
of failure. Presence of a query is not proof that every animation respects it.

The scanner also flags animated properties other than `transform` and `opacity`. Treat
that as a performance recommendation; property choice alone is not a WCAG failure.

Sources: [W3C 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html),
[W3C 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

## Audit coverage and manual checks

The audit fetches HTML, style blocks and linked stylesheets without a headless browser.
It does not audit inline style attributes, imported sheets, CSS-in-JS, external JavaScript
bundles, runtime GSAP/WAAPI, autoplay video, animated GIF, Canvas/WebGL, SVG SMIL,
Lottie/Rive, View Transitions, scroll-driven animation or flashing (WCAG 2.3.1).
See [AGENTS.md](../AGENTS.md#what-the-audit-does-not-check-say-so-in-every-report) for limits.

In the delivered page, test reduced-motion on and off, pause/resume behavior, keyboard
operation, visible focus, and animations created after load. Check flashing separately.
Read the audit's disclosures and failed-fetch information before drawing conclusions, and
verify `review` items (loading indicators) by hand: the preload exception of 2.2.2 applies
only while the indicator actually blocks interaction.

MotionSpec complements broader accessibility testing. It does not certify a website or
establish compliance with accessibility laws. The API's `reduced-motion-safe` badge is a
legacy zero-findings label for the loaded CSS, not a certificate.

## Continue

- [Reproducible examples](../examples/a11y/README.md): a loop with a pause control, interaction motion with reduced-motion behaviour, and a static audit with its limits.
- [GSAP and prefers-reduced-motion](https://motionspec.dev/blog/gsap-prefers-reduced-motion)
- [Catalog reference](primitives/README.md)
- [Agent workflow](../AGENTS.md)
- [Repeatable discovery measurements](discovery.md)
