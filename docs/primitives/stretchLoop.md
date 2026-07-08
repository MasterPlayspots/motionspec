# stretchLoop

> Endless horizontal stretching — continuous, non-uniform scaling of the width (scaleX; compositor-friendly).

| Field | Value |
| --- | --- |
| Name | `stretchLoop` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `2` | `0.5` | `10` | — |
| `scaleX` | `number` | `1.12` | `1.01` | `1.5` | — |

## Accessibility

- Reduced-motion fallback: `static`
- Persistent animation (runs continuously): a WCAG 2.2.2 pause control is enforced by the compiler.

## Performance

- Verified: yes
- LCP-safe: yes
- Cost budget: `1`
- Verified at: `2026-07-04`

## Demo

Demo parameters:

```json
{
  "duration": 2,
  "scaleX": 1.2
}
```

Demo markup:

```html
<div class="d-stretchLoop" style="display:inline-flex;align-items:center;justify-content:center;width:8rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">STRETCH</div>
```

---

_Generated from `primitives/stretchLoop.json` by `bin/catalog-docs.js`. Do not edit by hand._
