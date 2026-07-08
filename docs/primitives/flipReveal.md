# flipReveal

> 3D flip on entering the viewport — the element swings open from a tilted position and fades in (fade + rotateX, GPU-accelerated).

| Field | Value |
| --- | --- |
| Name | `flipReveal` |
| Version | `1.0.0` |
| Output | `js` |
| Engine | `gsap.ScrollTrigger` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `degrees` | `number` | `90` | `15` | `90` | — |
| `duration` | `number` | `0.7` | `0.1` | `3` | — |
| `ease` | `string` | `power3.out` | — | — | `^[A-Za-z0-9.()]{1,40}$` |

## Trigger defaults

| Key | Value |
| --- | --- |
| `once` | `true` |
| `start` | `"top 80%"` |

## Accessibility

- Reduced-motion fallback: `instant-visible`

## Performance

- Verified: yes
- LCP-safe: yes
- Cost budget: `1`
- Verified at: `2026-07-04`

## Demo

Demo parameters:

```json
{
  "degrees": 90,
  "duration": 0.7
}
```

Demo markup:

```html
<div class="d-flipReveal" style="display:inline-flex;align-items:center;justify-content:center;width:10rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">FLIP</div>
```

---

_Generated from `primitives/flipReveal.json` by `bin/catalog-docs.js`. Do not edit by hand._
