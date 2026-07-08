# squashLoop

> Endless squash and stretch — non-uniform scaling (wider + flatter; the squash-and-stretch principle, compositor-friendly).

| Field | Value |
| --- | --- |
| Name | `squashLoop` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `1.5` | `0.5` | `8` | — |
| `scaleX` | `number` | `1.15` | `1.01` | `1.5` | — |
| `scaleY` | `number` | `0.9` | `0.5` | `0.99` | — |

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
  "duration": 1.5,
  "scaleX": 1.2,
  "scaleY": 0.85
}
```

Demo markup:

```html
<div class="d-squashLoop" style="display:inline-flex;align-items:center;justify-content:center;width:6rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">SQUASH</div>
```

---

_Generated from `primitives/squashLoop.json` by `bin/catalog-docs.js`. Do not edit by hand._
