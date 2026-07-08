# marquee — Primitive Notes

CSS-only endless horizontal scroll band via native `@keyframes`. No JavaScript required.

Authors must **duplicate the child elements** in HTML to fill the track width; the animation shifts by `-100%` so the clone seamlessly takes over at the loop point.

The `direction` param accepts `"normal"` (left-scroll) or `"reverse"` (right-scroll). Reduced-motion users see a static row — the animation is gated by `@media (prefers-reduced-motion: no-preference)` in the compiled output.
