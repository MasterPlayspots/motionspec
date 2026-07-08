# pressShrink

> Press feedback — the element briefly shrinks on activation (:active) and springs back (transform only).

| Field | Value |
| --- | --- |
| Name | `pressShrink` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `0.12` | `0.05` | `0.5` | — |
| `scale` | `number` | `0.96` | `0.8` | `1` | — |

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
  "duration": 0.12,
  "scale": 0.94
}
```

Demo markup:

```html
<button class="d-pressShrink" style="background:var(--teal);color:var(--on-teal);border:none;border-radius:10px;padding:.7rem 1.2rem;font-weight:600;cursor:pointer">Press me</button>
```

---

_Generated from `primitives/pressShrink.json` by `bin/catalog-docs.js`. Do not edit by hand._
