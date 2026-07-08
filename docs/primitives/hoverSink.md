# hoverSink

> Hover micro-interaction — the element sinks slightly on hover (translateY downward; transform only).

| Field | Value |
| --- | --- |
| Name | `hoverSink` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `distance` | `string` | `4px` | — | — | `^[0-9]*\\.?[0-9]+(px\|rem\|em)$` |
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
  "distance": "4px",
  "duration": 0.2
}
```

Demo markup:

```html
<div class="d-hoverSink" style="display:inline-flex;align-items:center;justify-content:center;width:8rem;height:5rem;border-radius:14px;background:var(--surface);border:1px solid var(--line);cursor:pointer">Hover — sink</div>
```

---

_Generated from `primitives/hoverSink.json` by `bin/catalog-docs.js`. Do not edit by hand._
