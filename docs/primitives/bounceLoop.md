# bounceLoop

> Endless bouncing — the element springs up and falls back (translateY, 0-50-100 keyframes with ease-out; compositor-friendly).

| Field | Value |
| --- | --- |
| Name | `bounceLoop` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `distance` | `string` | `16px` | — | — | `^[0-9]*\\.?[0-9]+(px\|rem\|em)$` |
| `duration` | `number` | `1` | `0.4` | `6` | — |

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
  "distance": "16px",
  "duration": 1
}
```

Demo markup:

```html
<div class="d-bounceLoop" style="display:inline-flex;align-items:center;justify-content:center;width:6rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">BOUNCE</div>
```

---

_Generated from `primitives/bounceLoop.json` by `bin/catalog-docs.js`. Do not edit by hand._
