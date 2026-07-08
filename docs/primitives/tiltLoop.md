# tiltLoop

> Endless tilting with a pulse — continuous tilting combined with gentle scaling (rotate + scale; compositor-friendly).

| Field | Value |
| --- | --- |
| Name | `tiltLoop` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `angle` | `number` | `4` | `1` | `20` | — |
| `duration` | `number` | `2` | `0.5` | `10` | — |
| `scale` | `number` | `1.05` | `1.01` | `1.3` | — |

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
  "angle": 5,
  "duration": 2,
  "scale": 1.06
}
```

Demo markup:

```html
<div class="d-tiltLoop" style="display:inline-flex;align-items:center;justify-content:center;width:6rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">TILT</div>
```

---

_Generated from `primitives/tiltLoop.json` by `bin/catalog-docs.js`. Do not edit by hand._
