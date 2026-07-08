# cssTransition

> Simple hover micro-interaction with no JavaScript at all.

| Field | Value |
| --- | --- |
| Name | `cssTransition` |
| Version | `2.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `0.25` | `0.05` | `1` | — |
| `easing` | `string` | `ease-out` | — | — | `^(ease\|ease-in\|ease-out\|ease-in-out\|linear\|step-start\|step-end\|cubic-bezier\\([-0-9., ]{1,40}\\))$` |
| `hoverValue` | `string` | `translateY(-4px)` | — | — | `^[A-Za-z0-9#%.,()-]+( [A-Za-z0-9#%.,()-]+)?( [A-Za-z0-9#%.,()-]+)?$` |
| `property` | `string` | `transform` | — | — | `^(transform\|opacity\|color\|background-color\|border-color\|filter\|width\|height)$` |

## Accessibility

- Reduced-motion fallback: `none-needed`

## Performance

- Verified: yes
- LCP-safe: yes
- Cost budget: `0`
- Verified at: `2026-06-12`

## Demo

_No demo defined for this primitive._

---

_Generated from `primitives/cssTransition.json` by `bin/catalog-docs.js`. Do not edit by hand._
