# hoverSpin

> Hover micro-interaction — the element spins a full turn on hover (rotate 360; transform only).

| Field | Value |
| --- | --- |
| Name | `hoverSpin` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `0.6` | `0.1` | `2` | — |

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
  "duration": 0.6
}
```

Demo markup:

```html
<div class="d-hoverSpin" style="display:inline-flex;align-items:center;justify-content:center;width:8rem;height:5rem;border-radius:14px;background:var(--surface);border:1px solid var(--line);cursor:pointer">Hover — spin</div>
```

---

_Generated from `primitives/hoverSpin.json` by `bin/catalog-docs.js`. Do not edit by hand._
