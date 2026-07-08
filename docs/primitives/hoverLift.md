# hoverLift

> Hover micro-interaction — the element lifts slightly on hover (translateY upward; transform only).

| Field | Value |
| --- | --- |
| Name | `hoverLift` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `distance` | `string` | `6px` | — | — | `^[0-9]*\\.?[0-9]+(px\|rem\|em)$` |
| `duration` | `number` | `0.2` | `0.05` | `1` | — |

## Accessibility

- Reduced-motion fallback: `static`

## Performance

- Verified: yes
- LCP-safe: yes
- Cost budget: `1`
- Verified at: `2026-07-04`

## Demo

Demo parameters:

```json
{
  "distance": "8px",
  "duration": 0.2
}
```

Demo markup:

```html
<div class="d-hoverLift" style="display:inline-flex;align-items:center;justify-content:center;width:8rem;height:5rem;border-radius:14px;background:var(--surface);border:1px solid var(--line);cursor:pointer">Hover — lift</div>
```

---

_Generated from `primitives/hoverLift.json` by `bin/catalog-docs.js`. Do not edit by hand._
