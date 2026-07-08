# skewOnScroll

> Skew tied to scroll progress — the element skews (skewY) as it scrolls through the viewport (scrubbed).

| Field | Value |
| --- | --- |
| Name | `skewOnScroll` |
| Version | `1.0.0` |
| Output | `js` |
| Engine | `gsap.ScrollTrigger` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `scrub` | `number` | `1` | `0` | `3` | — |
| `skewDegrees` | `number` | `6` | `-30` | `30` | — |

## Trigger defaults

| Key | Value |
| --- | --- |
| `end` | `"bottom top"` |
| `start` | `"top bottom"` |

## Accessibility

- Reduced-motion fallback: `static`

## Performance

- Verified: yes
- LCP-safe: yes
- Cost budget: `1`
- Verified at: `2026-07-04`

## Demo

Demo parameters:

```json
{
  "scrub": 1,
  "skewDegrees": 10
}
```

Demo markup:

```html
<div class="d-skewOnScroll" style="display:inline-flex;align-items:center;justify-content:center;width:8rem;height:8rem;border-radius:14px;background:var(--surface);border:1px solid var(--line);margin:20vh auto">SKEW</div>
```

---

_Generated from `primitives/skewOnScroll.json` by `bin/catalog-docs.js`. Do not edit by hand._
