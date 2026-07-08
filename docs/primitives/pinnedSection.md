# pinnedSection

> Pin a section in place while its content scrolls through.

| Field | Value |
| --- | --- |
| Name | `pinnedSection` |
| Version | `2.0.0` |
| Output | `js` |
| Engine | `gsap.ScrollTrigger` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `distance` | `string` | `+=100%` | — | — | `^\\+=[0-9]{1,6}(\\.[0-9]{1,3})?(px\|%\|vh\|vw\|em\|rem)?$` |
| `pinSpacing` | `boolean` | `true` | — | — | — |

## Trigger defaults

| Key | Value |
| --- | --- |
| `start` | `"top top"` |

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

_Generated from `primitives/pinnedSection.json` by `bin/catalog-docs.js`. Do not edit by hand._
