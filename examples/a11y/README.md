# Motion accessibility examples

Three small, reproducible examples for the motion-accessibility tasks MotionSpec covers.
Each one runs locally with the MIT package — no key, no hosted call — and is pinned by
`test/examples-a11y.test.js`, so the outputs described here are what the code produces.

Scope reminder: MotionSpec compiles motion from a validated spec and statically scans the
CSS a page loads. It is not a full WCAG audit. See
[Pause, Stop, Hide (2.2.2)](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
and [Animation from Interactions (2.3.3)](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

## 1. An endless loop with a visible pause control (WCAG 2.2.2)

[`01-loop-with-pause.motionspec.json`](01-loop-with-pause.motionspec.json) uses the
`marquee` primitive, which runs continuously.

```bash
npx -p motionspec@1.2.8 motion compile examples/a11y/01-loop-with-pause.motionspec.json
```

What the output contains:

- The animation sits inside `@media (prefers-reduced-motion: no-preference)`, so it does
  not run for visitors who ask for reduced motion.
- `globals.pauseControls: "auto"` emits a page-level toggle button
  (`aria-pressed`, keyboard-focusable, 24×24 px minimum). While paused,
  `html[data-ms-paused]` sets `animation-play-state: paused` — outside the reduced-motion
  guard, so the pause also works for everyone else.
- Validation reports no warnings. Set `pauseControls` to `"off"` and validation keeps
  `ok: true` but adds the warning `MS-GLOBALS-PAUSE-OFF`: the spec still compiles, it just
  no longer offers the 2.2.2 pause path.

Check by hand in the delivered page: the button is reachable and labelled in your
language (`globals.pauseLabels`), pausing stops the motion, and the choice persists.

## 2. Interaction-triggered motion with reduced-motion behaviour (WCAG 2.3.3)

[`02-interaction-reduced-motion.motionspec.json`](02-interaction-reduced-motion.motionspec.json)
lifts a card on hover (`hoverLift`) and shrinks a button while pressed (`pressShrink`).

```bash
npx -p motionspec@1.2.8 motion compile examples/a11y/02-interaction-reduced-motion.motionspec.json
```

The output is CSS only (no JavaScript). Every transition and transform is inside
`@media (prefers-reduced-motion: no-preference)`: with the OS setting "reduce motion"
the elements stay static (`reducedMotionFallback: "static"`) — the card and the button
keep working, they just do not move. Only `transform` is animated.

Check by hand: toggle the OS setting (or emulate `prefers-reduced-motion: reduce` in the
browser's dev tools) and confirm nothing moves; confirm focus styles are visible without
the motion.

## 3. A static audit and what it cannot see

[`03-audit-page/`](03-audit-page/) is a page with five deliberate cases in
[`styles.css`](03-audit-page/styles.css) and one runtime library. Serve it locally and
audit it:

```bash
(cd examples/a11y/03-audit-page && python3 -m http.server 4173 --bind 127.0.0.1) &
npx -p motionspec@1.2.8 motion audit http://127.0.0.1:4173/ --json
```

| Case in `styles.css` | Result |
| --- | --- |
| (1) `.ticker span` — endless animation, no pause path, no guard | `infinite-no-pause` (WCAG 2.2.2, Level A) and `unguarded` (2.3.3) |
| (2) `.cta` — hover `transform` transition without a guard | `unguarded` (2.3.3) |
| (3) `.link` — colour-only transition | no finding (not motion under 2.3.3; counted in `coverage`) |
| (4) `.spinner` — loading indicator | `preload-candidate`, `severity: "review"`, no score impact — verify by hand |
| (5) `.card` — hover motion with a later `prefers-reduced-motion` rule | no finding (the guard wins the cascade) |

The result is `status: "measured"`, `score: 64` (scoring v2) and `badge: null`. The badge
is withheld because the page loads GSAP from a `<script src>`: the audit **detects** the
runtime library and discloses it as *not audited*. Animations created by that script,
inline `style=""`, `@import`ed sheets, video, Canvas/WebGL and flashing (2.3.1) are outside
a static scan. A clean result means "nothing found in the loaded CSS", not "accessible".

Next step in a real project: fix the candidates, then keep a baseline in CI with
[`examples/ci/motion-audit.yml`](../ci/motion-audit.yml).
