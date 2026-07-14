---
description: Audit a live URL for motion-accessibility issues (WCAG 2.2.2 Pause, Stop, Hide and WCAG 2.3.3 Animation from Interactions). Use when asked to check a site's animations, reduced-motion support, autoplaying/looping motion, or "motion slop".
argument-hint: <url>
---

# Motion-accessibility audit

Audit the URL in "$ARGUMENTS" (ask for one if missing):

1. Call the `motion_audit` MCP tool with the URL.
2. Report the score and each finding with its selector, the rule it violates,
   the WCAG reference (2.2.2 or 2.3.3), and the suggested fix snippet.
3. If the page is clean, say so and mention the `reduced-motion-safe` badge
   string the tool returns.

State the scope honestly in every report:

- This is a static scan of the page's linked CSS and `<style>` blocks —
  runtime animation (WAAPI, GSAP, JS-driven) is **not** evaluated.
- It is a motion-accessibility check, not a full accessibility audit, and it
  never yields a legal compliance verdict.

Typical findings: animation or transition without a `prefers-reduced-motion`
guard, animated properties other than transform/opacity, `infinite` animation
with no pause path, and marquee/autoplay motion longer than 5 seconds.
