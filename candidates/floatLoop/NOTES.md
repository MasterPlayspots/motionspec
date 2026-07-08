# floatLoop — Primitive Notes

CSS-only ambient float via native `@keyframes` — no JavaScript. A decorative element
gently bobs back and forth along one axis, forever. This is **Family C** (auto/infinite
motion), so the reduced-motion fallback is `static`: the compiled output gates the
animation behind `@media (prefers-reduced-motion: no-preference)`, so reduced-motion
users get the element at rest (no bob), satisfying WCAG 2.2.2 (Pause/Stop/Hide) intent.

## Provenance
- Derived from `docs/fast-lane/02_B2_Katalog-Ausbau_12-Primitive.md` **C2 · floatLoop**
  (Tier 1, cost ~1, RM → static), and structurally modelled on the existing CSS-loop
  primitive `marquee` (same `output: "css"`, `engine: "native-css"`, `@keyframes` +
  reduced-motion gating).
- Lesson applied from `cssTransition`: **every string param carries a `pattern`/bound** —
  `distance` (`^[0-9]*\.?[0-9]+(px|rem|%)$`) and `axis` (`^(x|y)$`). No pattern-less param.

## Params
- `distance` (string, default `"8px"`) — travel amount of the bob; CSS length (px/rem/%).
- `duration` (number, default `3`, 1–10s) — one half-cycle; with `alternate` the full
  bob takes `2×duration`.
- `axis` (string, default `"y"`, `x|y`) — which axis to float along. CSS function names
  are ASCII case-insensitive, so `translate{axis}` → `translatex`/`translatey` is valid.

## Compositor / perf
Pure `transform` keyframe (no layout, no paint of position) → compositor-only, `cost 1`.
`lcpSafe: true` (decorative, no layout shift). On-device taste + perf confirmation is the
**Tor-1 merge gate** (Kevin Fröba), per the Fast-Lane blueprint — the catalog `verified` flag is
flipped to `true` at promotion.

## Author duplication / usage
Apply to a single decorative element (badge, orb, icon). No HTML duplication required
(unlike `marquee`). Keep `distance` small (≤ ~16px) so the motion reads as ambient, not
distracting.
