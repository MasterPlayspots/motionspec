# counterUp — Reviewer Notes

- **Markup-first**: always write the final formatted number as visible text content (e.g. `12.847`) AND set `data-count="12847"` — no-JS users and reduced-motion users see the end value immediately.
- **Reduced motion**: when `respectReducedMotion: true`, the compiler gates the entire IIFE, so the JS never runs; the static markup value is the fallback.
- **No plugins**: uses only core GSAP + ScrollTrigger; `snap` is a native GSAP tween prop, no TextPlugin needed.
- **Locale**: `toLocaleString` is called per-frame; for high-frequency counters consider a larger `step` to reduce formatting overhead.
- **Verified**: `performance.verified` is false until LCP/CLS impact is measured in a real browser run.
