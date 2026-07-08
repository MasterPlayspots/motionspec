# wobbleLoop

> Endless wobbling — continuous back-and-forth of translation and rotation (translateX + rotate; compositor-friendly).

| Field | Value |
| --- | --- |
| Name | `wobbleLoop` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `angle` | `number` | `3` | `1` | `15` | — |
| `distance` | `string` | `6px` | — | — | `^[0-9]*\\.?[0-9]+(px\|rem\|em)$` |
| `duration` | `number` | `1.5` | `0.5` | `8` | — |

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
  "angle": 4,
  "distance": "8px",
  "duration": 1.5
}
```

Demo markup:

```html
<div class="d-wobbleLoop" style="display:inline-flex;align-items:center;justify-content:center;width:6rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">WOBBLE</div>
```

---

_Generated from `primitives/wobbleLoop.json` by `bin/catalog-docs.js`. Do not edit by hand._
