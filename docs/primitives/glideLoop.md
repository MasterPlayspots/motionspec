# glideLoop

> Endless diagonal gliding — continuous drifting along both axes (translate X+Y; compositor-friendly).

| Field | Value |
| --- | --- |
| Name | `glideLoop` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `distance` | `string` | `10px` | — | — | `^[0-9]*\\.?[0-9]+(px\|rem\|em)$` |
| `duration` | `number` | `3` | `1` | `12` | — |

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
  "distance": "12px",
  "duration": 3
}
```

Demo markup:

```html
<div class="d-glideLoop" style="display:inline-flex;align-items:center;justify-content:center;width:6rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">GLIDE</div>
```

---

_Generated from `primitives/glideLoop.json` by `bin/catalog-docs.js`. Do not edit by hand._
