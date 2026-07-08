# flipLoop

> Endless 3D coin flip — continuous rotation around the Y axis (rotateY, GPU-accelerated).

| Field | Value |
| --- | --- |
| Name | `flipLoop` |
| Version | `1.0.0` |
| Output | `css` |
| Engine | `native-css` |

## Parameters

| Parameter | Type | Default | Min | Max | Constraint |
| --- | --- | --- | --- | --- | --- |
| `duration` | `number` | `4` | `1` | `30` | — |

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
  "duration": 4
}
```

Demo markup:

```html
<div class="d-flipLoop" style="display:inline-flex;align-items:center;justify-content:center;width:6rem;height:6rem;border-radius:14px;background:var(--surface);border:1px solid var(--line)">FLIP</div>
```

---

_Generated from `primitives/flipLoop.json` by `bin/catalog-docs.js`. Do not edit by hand._
