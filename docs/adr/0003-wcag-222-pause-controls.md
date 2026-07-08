# ADR-0003 — WCAG 2.2.2 Pause/Stop for continuous motion

**Status:** ACCEPTED — records the design **already shipped in v1.2.0** (a11y-motor, PR #69/#70). The mechanism below is implemented in `src/compiler/safety.js` (`pauseBlocks`), shared byte-identically by `compile.js` (GSAP) and `lower-waapi.js` (WAAPI), validated in `validate.js`, and covered by `test/pausecontrols.test.js`. The **Open questions** section is deliberately unresolved — flagged for review with an external accessibility expert (not an author/owner of the project).
**Date:** 2026-07-06 · **Decider:** Kevin Fröba (L0 sign-off — sole founder/author). Drafted by the AI assistant.

## Context

WCAG 2.2.2 (Pause, Stop, Hide) requires that for any **moving/blinking/scrolling** content that (a) starts automatically, (b) lasts more than 5 seconds, and (c) is presented in parallel with other content, the user has a mechanism to **pause, stop, or hide** it — unless the movement is essential.

MotionSpec is a **compile-time, catalog-based** system: a small model emits a schema-validated spec, and a deterministic compiler emits static GSAP or WAAPI/CSS. There is no runtime library and no framework to host a control. The catalog contains ~18 continuous-loop primitives (`a11y.persistent === true`) that compile to `animation: … infinite` / `repeat: -1`, which is exactly the WCAG-2.2.2 trigger. The core design question is therefore:

> **Where do pause/stop/hide controls belong in a compile-time, catalog-based system that emits static code and owns no runtime?**

`prefers-reduced-motion` already suppresses these loops for users who set it — but WCAG 2.2.2 also protects users who have **not** set that preference. So a reduced-motion guard alone is insufficient; a real pause affordance is required for the default case.

## Decision (as shipped in v1.2.0)

1. **Catalog tagging + promote-gate.** A continuous loop primitive must be tagged `a11y.persistent: true`. The promote-gate refuses any `infinite` / `repeat: -1` primitive that is not `a11y.persistent`, so no loop can enter the catalog without opting into the pause contract.

2. **A `globals.pauseControls` policy** with three modes, validated fail-closed (`MS-GLOBALS-PAUSE-BAD` on any other value):
   - **`"auto"` (fail-safe default).** Emits the CSS pause path **and** injects one accessible pause/stop toggle (details below). Chosen so that omitting the field still yields a compliant result.
   - **`"api"`.** Emits the CSS pause contract only and leaves the visible control to the integrator (who toggles `data-ms-paused` on `<html>`). For teams who want their own UI.
   - **`"off"`.** Opts out entirely. Emits `MS-GLOBALS-PAUSE-OFF` when the spec actually contains a persistent motion, so the opt-out is never silent.

3. **The CSS pause path is always live.** For each persistent motion the compiler emits, **outside** the `prefers-reduced-motion` guard:
   `html[data-ms-paused] <target>, html[data-ms-paused] <target> > * { animation-play-state: paused !important; }`
   The `<target>` is re-screened through the shared `cssRaw` safety gate; the `> *` reach covers marquee children that carry the animation. Being outside the reduced-motion block means the pause works regardless of the user's motion preference.

4. **The `"auto"` toggle** (`pauseToggleJs`) is a single, deterministic control:
   - `type="button"`, fixed bottom-right, `z-index` max, **min 24×24 px** (WCAG 2.2 Target Size), visible `:focus-visible` ring, system colors (`Canvas`/`CanvasText`/`Highlight`) for theme/contrast neutrality;
   - toggles `data-ms-paused` on `document.documentElement`, keeps `aria-pressed` and the text label in sync, persists to `localStorage("ms-paused")` (wrapped in try/catch);
   - **not rendered** under `prefers-reduced-motion: reduce` (the loops are already static there);
   - single instance guard; labels default to English, overridable via `globals.pauseLabels`.

5. **Zero-overhead + determinism.** A spec with no persistent motion emits **zero** pause bytes. The builder is pure (no `Math.random`/`Date`), so output is byte-identical — and because both lowerings call the one `pauseBlocks` source, a golden parity test pins GSAP and WAAPI to the same bytes.

## Consequences

**Positive.** Default-on and fail-safe; works for keyboard and AT users; identical across both compile targets; deterministic; no runtime dependency; the opt-out is loud, not silent.

**Trade-offs / limitations (the substance for external review).**
- The `"auto"` toggle is a **single, global, page-level** control at a **compiler-imposed** position and style. One button pauses *all* loops at once — there is no per-region control.
- WCAG 2.2.2 permits pause / stop / **hide**; we offer pause (stop). **Hide** is not provided.
- Injecting a `<button>` + `<style>` from a "compiler" is arguably a layer-boundary crossing; `"auto"` being the default means MotionSpec puts UI on the page unless told otherwise.
- Target-size (24×24) and system-color contrast are believed AA-safe but not audited across real themes/backgrounds.

## Open questions for external review

1. **Global vs per-region.** Is one page-level pause the right UX, or should controls be scoped to each animated region?
2. **Default mode.** Should `"auto"` (injects UI) remain the default, or should `"api"` (integrator supplies UI) be the default for real products, with `"auto"` as an opt-in convenience?
3. **Hide.** Is pause/stop sufficient, or do some content types need a real "hide"?
4. **Placement/style.** Is a fixed bottom-right, system-colored button acceptable as a compiler default, or too opinionated to impose?
5. **Contrast/target-size in practice.** Does the 24×24 + system-color toggle meet AA against arbitrary page backgrounds and themes?
6. **Reduced-motion interaction.** The toggle is hidden under `prefers-reduced-motion: reduce` (loops already static). Correct, or should a control still be present for consistency?

## Sign-off

- [ ] Kevin Fröba approves this ADR as the record of the shipped v1.2.0 design and the agenda for external expert review.
