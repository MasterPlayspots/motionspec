# hoverSkew

> Hover micro-interaction — the element skews slightly on hover (skewX; transform only).

| Field | Value |
| --- | --- |
| Name | `hoverSkew` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `0.2` | `0.05` | `1` | — |
| `skew` | `number` | `4` | `1` | `20` | — |

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
  "skew": 6
}
```

Demo markup:

```html
<div class="d-hoverSkew" style="display:inline-flex;align-items:center;justify-content:center;width:8rem;height:5rem;border-radius:14px;background:var(--surface);border:1px solid var(--line);cursor:pointer">Hover — skew</div>
```

---

_Generated from `primitives/hoverSkew.json` by `bin/catalog-docs.js`. Do not edit by hand._
