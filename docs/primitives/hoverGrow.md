# hoverGrow

> Hover micro-interaction — the element scales up gently on hover (transform only).

| Field | Value |
| --- | --- |
| Name | `hoverGrow` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `0.2` | `0.05` | `1` | — |
| `scale` | `number` | `1.05` | `1.01` | `1.3` | — |

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
  "duration": 0.2,
  "scale": 1.08
}
```

Demo markup:

```html
<div class="d-hoverGrow" style="display:inline-flex;align-items:center;justify-content:center;width:8rem;height:5rem;border-radius:14px;background:var(--surface);border:1px solid var(--line);cursor:pointer">Hover — grow</div>
```

---

_Generated from `primitives/hoverGrow.json` by `bin/catalog-docs.js`. Do not edit by hand._
