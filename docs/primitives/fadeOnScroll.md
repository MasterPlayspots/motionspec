# fadeOnScroll

> Opacity tied to scroll progress — the element softly fades out or in as you scroll (scrubbed).

| Field | Value |
| --- | --- |
| Name | `fadeOnScroll` |
| Version | `1.0.0` |
| Output | `js` |
| Engine | `gsap.ScrollTrigger` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `fromOpacity` | `number` | `1` | `0` | `1` | — |
| `scrub` | `number` | `1` | `0` | `3` | — |
| `toOpacity` | `number` | `0` | `0` | `1` | — |

## Trigger defaults

| Key | Value |
| --- | --- |
| `end` | `"bottom top"` |
| `start` | `"top top"` |

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
  "fromOpacity": 1,
  "scrub": 1,
  "toOpacity": 0.15
}
```

Demo markup:

```html
<div class="d-fadeOnScroll" style="display:inline-flex;align-items:center;justify-content:center;width:8rem;height:8rem;border-radius:14px;background:var(--surface);border:1px solid var(--line);margin:20vh auto">FADE</div>
```

---

_Generated from `primitives/fadeOnScroll.json` by `bin/catalog-docs.js`. Do not edit by hand._
