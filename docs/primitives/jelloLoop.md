# jelloLoop

> Endless, soft wobbling — continuous skew distortion on both axes (jello effect, compositor-friendly).

| Field | Value |
| --- | --- |
| Name | `jelloLoop` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `2` | `0.5` | `10` | — |
| `skew` | `number` | `4` | `1` | `20` | — |

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
  "duration": 2,
  "skew": 6
}
```

Demo markup:

```html
<div class="d-jelloLoop" style="display:inline-flex;align-items:center;justify-content:center;width:6rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">JELLO</div>
```

---

_Generated from `primitives/jelloLoop.json` by `bin/catalog-docs.js`. Do not edit by hand._
