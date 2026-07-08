# marquee

> Endlessly scrolling horizontal marquee — author the content as TWO identical groups (seamless loop).

| Field | Value |
| --- | --- |
| Name | `marquee` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `direction` | `string` | `normal` | — | — | `^(normal\|reverse)$` |
| `duration` | `number` | `24` | `4` | `120` | — |
| `gap` | `string` | `3rem` | — | — | `^[0-9]*\\.?[0-9]+(px\|rem\|em\|vw\|ch\|%)$` |

## Accessibility

- Reduced-motion fallback: `static`
- Persistent animation (runs continuously): a WCAG 2.2.2 pause control is enforced by the compiler.

## Performance

- Verified: yes
- LCP-safe: yes
- Cost budget: `1`
- Verified at: `2026-06-12`

## Demo

Demo parameters:

```json
{
  "direction": "normal",
  "duration": 24,
  "gap": "3rem"
}
```

Demo markup:

```html
<div class="marquee-track"><div class="d-marquee"><div><span style="padding:0 2rem">ALPHA</span><span style="padding:0 2rem">BETA</span><span style="padding:0 2rem">GAMMA</span><span style="padding:0 2rem">DELTA</span></div><div><span style="padding:0 2rem">ALPHA</span><span style="padding:0 2rem">BETA</span><span style="padding:0 2rem">GAMMA</span><span style="padding:0 2rem">DELTA</span></div></div></div>
```

---

_Generated from `primitives/marquee.json` by `bin/catalog-docs.js`. Do not edit by hand._
