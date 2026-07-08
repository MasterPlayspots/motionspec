# teeterLoop

> Endless teetering around a bottom pivot — continuous tipping as if on a base (transform-origin bottom).

| Field | Value |
| --- | --- |
| Name | `teeterLoop` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `angle` | `number` | `6` | `1` | `30` | — |
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
  "angle": 8,
  "duration": 2
}
```

Demo markup:

```html
<div class="d-teeterLoop" style="display:inline-flex;align-items:center;justify-content:center;width:6rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">TEETER</div>
```

---

_Generated from `primitives/teeterLoop.json` by `bin/catalog-docs.js`. Do not edit by hand._
