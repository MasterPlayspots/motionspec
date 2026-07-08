# parallaxLayer

> Depth offset: the layer moves slower or faster than the rest as you scroll.

| Field | Value |
| --- | --- |
| Name | `parallaxLayer` |
| Version | `1.1.0` |
| Output | `js` |
| Engine | `gsap.ScrollTrigger` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `scrub` | `number` | `1` | `0` | `4` | — |
| `yPercent` | `number` | `-20` | `-100` | `100` | — |

## Trigger defaults

| Key | Value |
| --- | --- |
| `end` | `"bottom top"` |
| `start` | `"top bottom"` |

## Accessibility

- Reduced-motion fallback: `instant-visible`

## Performance

- Verified: yes
- LCP-safe: yes
- Cost budget: `2`
- Verified at: `2026-06-12`

## Demo

_No demo defined for this primitive._

---

_Generated from `primitives/parallaxLayer.json` by `bin/catalog-docs.js`. Do not edit by hand._
