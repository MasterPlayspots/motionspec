# hoverFlip

> Hover micro-interaction — the element flips in 3D on hover (rotateY; GPU-accelerated).

| Field | Value |
| --- | --- |
| Name | `hoverFlip` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `degrees` | `number` | `180` | `10` | `360` | — |
| `duration` | `number` | `0.5` | `0.1` | `2` | — |

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
  "degrees": 180,
  "duration": 0.5
}
```

Demo markup:

```html
<div class="d-hoverFlip" style="display:inline-flex;align-items:center;justify-content:center;width:8rem;height:5rem;border-radius:14px;background:var(--surface);border:1px solid var(--line);cursor:pointer">Hover — flip</div>
```

---

_Generated from `primitives/hoverFlip.json` by `bin/catalog-docs.js`. Do not edit by hand._
