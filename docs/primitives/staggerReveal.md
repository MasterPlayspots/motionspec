# staggerReveal

> Fade in multiple child elements one after another, staggered.

| Field | Value |
| --- | --- |
| Name | `staggerReveal` |
| Version | `2.0.0` |
| Output | `js` |
| Engine | `gsap.ScrollTrigger` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `0.6` | `0.1` | `3` | — |
| `ease` | `string` | `power2.out` | — | — | `^[A-Za-z0-9.()]{1,40}$` |
| `from` | `transform` | — | — | — | required |
| `stagger` | `number` | `0.12` | `0.02` | `0.6` | — |

## Trigger defaults

| Key | Value |
| --- | --- |
| `once` | `true` |
| `start` | `"top 85%"` |

## Accessibility

- Reduced-motion fallback: `instant-visible`

## Performance

- Verified: yes
- LCP-safe: yes
- Cost budget: `1`
- Verified at: `2026-06-12`

## Demo

_No demo defined for this primitive._

---

_Generated from `primitives/staggerReveal.json` by `bin/catalog-docs.js`. Do not edit by hand._
