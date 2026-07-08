# kenBurns

> Slow Ken Burns effect — continuous, gentle zooming and drifting (for hero images/backgrounds; transform only).

| Field | Value |
| --- | --- |
| Name | `kenBurns` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `20` | `6` | `60` | — |
| `scale` | `number` | `1.1` | `1.01` | `1.4` | — |

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
  "duration": 12,
  "scale": 1.15
}
```

Demo markup:

```html
<div class="d-kenBurns" style="display:inline-flex;align-items:center;justify-content:center;width:10rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">KEN BURNS</div>
```

---

_Generated from `primitives/kenBurns.json` by `bin/catalog-docs.js`. Do not edit by hand._
