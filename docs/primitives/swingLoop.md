# swingLoop

> Endless swinging — continuous pendulum motion around a top pivot (transform-origin top, compositor-friendly).

| Field | Value |
| --- | --- |
| Name | `swingLoop` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `angle` | `number` | `8` | `1` | `30` | — |
| `duration` | `number` | `2` | `0.5` | `10` | — |

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
  "angle": 10,
  "duration": 2
}
```

Demo markup:

```html
<div class="d-swingLoop" style="display:inline-flex;align-items:center;justify-content:center;width:6rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">SWING</div>
```

---

_Generated from `primitives/swingLoop.json` by `bin/catalog-docs.js`. Do not edit by hand._
