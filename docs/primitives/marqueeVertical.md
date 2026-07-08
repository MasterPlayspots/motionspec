# marqueeVertical

> Endless vertical marquee — content scrolls steadily upward (ticker, testimonials). Expects duplicated content for a seamless loop.

| Field | Value |
| --- | --- |
| Name | `marqueeVertical` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `direction` | `string` | `normal` | — | — | `^(normal\|reverse)$` |
| `duration` | `number` | `20` | `4` | `120` | — |
| `gap` | `string` | `1rem` | — | — | `^[0-9]*\\.?[0-9]+(px\|rem\|em)$` |

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
  "direction": "normal",
  "duration": 12,
  "gap": "0.6rem"
}
```

Demo markup:

```html
<div class="d-marqueeVertical" style="height:8rem;width:9rem;border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:0 .8rem"><div>News 1</div><div>News 2</div><div>News 3</div><div>News 4</div><div>News 1</div><div>News 2</div><div>News 3</div><div>News 4</div></div>
```

---

_Generated from `primitives/marqueeVertical.json` by `bin/catalog-docs.js`. Do not edit by hand._
