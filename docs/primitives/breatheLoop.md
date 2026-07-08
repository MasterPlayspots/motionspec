# breatheLoop

> Gentle, slow breathing — continuous fading of opacity in and out (opacity only, compositor-friendly; deliberately slow).

| Field | Value |
| --- | --- |
| Name | `breatheLoop` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `3` | `2` | `12` | — |
| `minOpacity` | `number` | `0.6` | `0` | `0.95` | — |

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
  "duration": 3,
  "minOpacity": 0.4
}
```

Demo markup:

```html
<div class="d-breatheLoop" style="display:inline-flex;align-items:center;justify-content:center;width:6rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">BREATHE</div>
```

---

_Generated from `primitives/breatheLoop.json` by `bin/catalog-docs.js`. Do not edit by hand._
