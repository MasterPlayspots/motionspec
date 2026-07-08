# hoverRotate

> Hover micro-interaction — the element tilts slightly on hover (rotate; transform only).

| Field | Value |
| --- | --- |
| Name | `hoverRotate` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `degrees` | `number` | `3` | `1` | `20` | — |
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
  "degrees": 4,
  "duration": 0.2
}
```

Demo markup:

```html
<div class="d-hoverRotate" style="display:inline-flex;align-items:center;justify-content:center;width:8rem;height:5rem;border-radius:14px;background:var(--surface);border:1px solid var(--line);cursor:pointer">Hover — rotate</div>
```

---

_Generated from `primitives/hoverRotate.json` by `bin/catalog-docs.js`. Do not edit by hand._
