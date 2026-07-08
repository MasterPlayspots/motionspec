# scaleOnScroll

> The element scales in proportion to scroll progress (GSAP ScrollTrigger scrub).

| Field | Value |
| --- | --- |
| Name | `scaleOnScroll` |
| Version | `1.0.0` |
| Output | `js` |
| Engine | `gsap.ScrollTrigger` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `fromScale` | `number` | `0.8` | `0.2` | `1` | — |
| `scrub` | `number` | `1` | `0` | `4` | — |
| `toScale` | `number` | `1` | `0.5` | `2` | — |
| `transformOrigin` | `string` | `center center` | — | — | `^[a-zA-Z0-9% ]{2,40}$` |

## Trigger defaults

| Key | Value |
| --- | --- |
| `end` | `"center center"` |
| `start` | `"top bottom"` |

## Accessibility

- Reduced-motion fallback: `instant-visible`

## Performance

- Verified: yes
- LCP-safe: yes
- Cost budget: `2`
- Verified at: `2026-06-12`

## Demo

Demo parameters:

```json
{
  "fromScale": 0.6,
  "scrub": 1.5,
  "toScale": 1,
  "transformOrigin": "center center"
}
```

Demo markup:

```html
<div class="d-scaleOnScroll" style="width:200px;height:200px;background:#6366f1;border-radius:12px;margin:60vh auto;">Scale me</div>
```

---

_Generated from `primitives/scaleOnScroll.json` by `bin/catalog-docs.js`. Do not edit by hand._
