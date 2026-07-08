# scaleOnScroll — Design Notes

1. Uses `gsap.fromTo` (not `gsap.to`) so both endpoints are explicit and scrub reversal is fully symmetrical — no GSAP initial-state snapshotting ambiguity.
2. `transformOrigin` is surfaced as a string param so callers can pin scale to bottom/top edges (e.g. for card-stack reveals); validated against STRING_PARAM_RE.
3. `fromScale` max is capped at 1 (not 2) — scaling *down* on scroll-in is the overwhelmingly common pattern; adversary should check whether fromScale > toScale (zoom-out) produces a broken scrub-reverse.
4. `end: "center center"` default finishes the animation mid-viewport so the element is fully scaled before the user reaches it — attack: very short elements where start/end collapse.
5. `scrub: 0` (instant snap) is allowed by the schema; adversary should verify the generated `ScrollTrigger` still renders correctly with `scrub: 0` (falsy in JS, GSAP treats it as no smoothing).
