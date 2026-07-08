# counterUp

> A number counts up from 0 to its target value as it enters the viewport.

| Field | Value |
| --- | --- |
| Name | `counterUp` |
| Version | `1.0.0` |
| Output | `js` |
| Engine | `gsap.ScrollTrigger` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `1.6` | `0.2` | `5` | — |
| `ease` | `string` | `power1.out` | — | — | `^[A-Za-z0-9.()]{1,40}$` |
| `locale` | `string` | `de-DE` | — | — | `^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$` |
| `step` | `number` | `1` | `0.01` | `1000` | — |

## Trigger defaults

| Key | Value |
| --- | --- |
| `once` | `true` |
| `start` | `"top 85%"` |

## Accessibility

- Reduced-motion fallback: `instant-visible`

## Performance

- Verified: yes
- LCP-safe: yes
- Cost budget: `1`
- Verified at: `2026-06-12`

## Demo

Demo parameters:

```json
{
  "duration": 2,
  "ease": "power2.out",
  "locale": "de-DE",
  "step": 1
}
```

Demo markup:

```html
<p class="counter d-counterUp" data-count="12847">12.847</p>
<p class="counter d-counterUp" data-count="99">99</p>
```

---

_Generated from `primitives/counterUp.json` by `bin/catalog-docs.js`. Do not edit by hand._
