# parallaxX

> Horizontal parallax — the element shifts sideways tied to scroll progress (depth, scrubbed).

| Field | Value |
| --- | --- |
| Name | `parallaxX` |
| Version | `1.0.0` |
| Output | `js` |
| Engine | `gsap.ScrollTrigger` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `scrub` | `number` | `1` | `0` | `3` | — |
| `xPercent` | `number` | `-20` | `-100` | `100` | — |

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
  "xPercent": -30
}
```

Demo markup:

```html
<div class="d-parallaxX" style="display:inline-flex;align-items:center;justify-content:center;width:8rem;height:8rem;border-radius:14px;background:var(--surface);border:1px solid var(--line);margin:20vh auto">PARALLAX-X</div>
```

---

_Generated from `primitives/parallaxX.json` by `bin/catalog-docs.js`. Do not edit by hand._
