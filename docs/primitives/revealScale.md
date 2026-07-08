# revealScale

> Pop-in on entering the viewport — the element fades in while scaling from slightly reduced up to 1 (fade + scale).

| Field | Value |
| --- | --- |
| Name | `revealScale` |
| Version | `1.0.0` |
| Output | `js` |
| Engine | `gsap.ScrollTrigger` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `0.7` | `0.1` | `3` | — |
| `ease` | `string` | `power3.out` | — | — | `^[A-Za-z0-9.()]{1,40}$` |
| `fromScale` | `number` | `0.9` | `0.5` | `1` | — |

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
  "duration": 0.7,
  "fromScale": 0.85
}
```

Demo markup:

```html
<div class="d-revealScale" style="display:inline-flex;align-items:center;justify-content:center;width:10rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">POP-IN</div>
```

---

_Generated from `primitives/revealScale.json` by `bin/catalog-docs.js`. Do not edit by hand._
