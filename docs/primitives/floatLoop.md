# floatLoop

> Gentle, endless floating for decorative elements — continuous looping motion along one axis (compositor-friendly).

| Field | Value |
| --- | --- |
| Name | `floatLoop` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `axis` | `string` | `y` | — | — | `^(x\|y)$` |
| `distance` | `string` | `8px` | — | — | `^[0-9]*\\.?[0-9]+(px\|rem\|%)$` |
| `duration` | `number` | `3` | `1` | `10` | — |

## Accessibility

- Reduced-motion fallback: `static`
- Persistent animation (runs continuously): a WCAG 2.2.2 pause control is enforced by the compiler.

## Performance

- Verified: yes
- LCP-safe: yes
- Cost budget: `1`
- Verified at: `2026-06-29`

## Demo

Demo parameters:

```json
{
  "axis": "y",
  "distance": "10px",
  "duration": 3
}
```

Demo markup:

```html
<div class="float-box d-floatLoop" style="display:inline-flex;align-items:center;justify-content:center;width:6rem;height:6rem;border:1px solid #8886;border-radius:14px">FLOAT</div>
```

---

_Generated from `primitives/floatLoop.json` by `bin/catalog-docs.js`. Do not edit by hand._
