# rotateOnScroll

> Rotation tied to scroll progress — the element rotates as it scrolls through the viewport (scrubbed).

| Field | Value |
| --- | --- |
| Name | `rotateOnScroll` |
| Version | `1.0.0` |
| Output | `js` |
| Engine | `gsap.ScrollTrigger` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `degrees` | `number` | `15` | `-180` | `180` | — |
| `scrub` | `number` | `1` | `0` | `3` | — |

## Trigger defaults

| Key | Value |
| --- | --- |
| `end` | `"bottom top"` |
| `start` | `"top bottom"` |

## Accessibility

- Reduced-motion fallback: `static`

## Performance

- Verified: yes
- LCP-safe: yes
- Cost budget: `1`
- Verified at: `2026-07-04`

## Demo

Demo parameters:

```json
{
  "degrees": 20,
  "scrub": 1
}
```

Demo markup:

```html
<div class="d-rotateOnScroll" style="display:inline-flex;align-items:center;justify-content:center;width:8rem;height:8rem;border-radius:14px;background:var(--surface);border:1px solid var(--line);margin:20vh auto">ROTATE</div>
```

---

_Generated from `primitives/rotateOnScroll.json` by `bin/catalog-docs.js`. Do not edit by hand._
