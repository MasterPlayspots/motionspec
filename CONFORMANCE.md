# MotionSpec Conformance

This document defines what it means for an implementation to be **MotionSpec 1.0 compatible** and gives the procedure to certify one. It complements the normative [`SPEC.md`](SPEC.md); read that first.

A **conforming implementation** is a MotionSpec compiler that satisfies every **MUST** in SPEC.md §2–§7. Conformance is testable: the corpus below is published in this repository so that any implementation — not only the reference one — can be checked against the same fixtures.

---

## 1. The conformance corpus

Everything needed to test an implementation ships in the repo:

| Artifact | Path | Role |
|---|---|---|
| JSON Schema | `schema/motionspec.schema.json` | Structural validity (SPEC §2). |
| Catalog | `primitives/*.json` + `catalog.lock.json` | The 40-primitive capability set and its 16-hex pin. |
| Input specs | `examples/*.motionspec.json` | Valid documents to compile. |
| Expected output | `test/golden/*` | Byte-exact compiled output (CSS and WAAPI/JS targets) for the corpus. |
| Diagnostic fixtures | `test/*.test.js` (validator suites) | Invalid documents paired with the exact `MS-*` code each must raise. |

The reference implementation's `npm test` **is** the executable conformance runner over this corpus. An alternate implementation is expected to reproduce the same input → output and input → diagnostic mapping.

---

## 2. Certification procedure

An implementation certifies MotionSpec 1.0 compatibility by passing all five checks.

### C1 — Schema validity
Every document in `examples/` MUST validate against `schema/motionspec.schema.json`. Every diagnostic fixture that is *structurally* invalid MUST fail schema validation.

### C2 — Diagnostic conformance
For each invalid fixture, the implementation MUST reject it and MUST raise the **same `MS-*` code** the reference raises (SPEC §2–§4). Codes are the stable contract; wording and locale MAY differ. An implementation MUST fail closed — no output on any diagnostic.

### C3 — Output conformance
For each valid input spec, the implementation MUST compile to output that is **equal to the matching `test/golden/*` fixture**, byte-for-byte, after the documented normalization (§3). This applies per emitted target (`css`, `waapi`/JS) declared by the primitive.

### C4 — Determinism
Compiling any corpus document twice MUST yield **byte-identical** output (SPEC §5). The implementation MUST NOT introduce `Math.random`, `Date.now`, or unordered iteration into emitted code.

### C5 — Accessibility invariants (SPEC §6)
- Every primitive declares `a11y.reducedMotionFallback`; compiled motion is emitted under a reduced-motion guard unless `respectReducedMotion:false` (which MUST raise `MS-GLOBALS-RRM-OFF`).
- Every continuous (`infinite`/`repeat:-1`) primitive is `a11y.persistent:true`; a persistent motion emits the `animation-play-state`/`html[data-ms-paused]` pause path, and under `pauseControls:"auto"` exactly one accessible toggle (`type="button"`, synced `aria-pressed`, ≥24×24 px, visible focus, not rendered under reduced motion).
- A document with no persistent motion emits **zero** bytes of pause machinery.

An implementation that passes C1–C5 over the published corpus MAY describe itself as **"MotionSpec 1.0 compatible."**

---

## 3. Normalization (for C3)

Comparison is byte-exact after these and only these normalizations, so that trivial formatting differences do not mask real divergence:

- Trailing whitespace on each line is stripped; files end in a single `\n`.
- Line endings are normalized to `\n`.

No other transformation is permitted. In particular, selector text, property order, keyframe percentages, numeric formatting, and generated identifiers (`motion-<primitive>-<id>`) are **significant** — they are part of the deterministic contract.

---

## 4. Running the reference suite

```bash
npm ci
npm test                     # C1–C5 over the full corpus (node --test)
npm run catalog-lock:check   # the loaded catalog matches the 40-primitive pin
```

A green run is the reference certificate. To check your own implementation, compile each `examples/*.motionspec.json` and diff against `test/golden/`, then run your invalid fixtures and assert the `MS-*` codes from SPEC.md §2–§4.

---

## 5. The `reduced-motion-safe` signal

The `motion audit` tool (`motion audit <url>`, and the `motion_audit` MCP tool) statically checks a page and emits the `reduced-motion-safe` badge when it clears every check. This is the *output* badge MotionSpec produces for compliant pages; it is **not** a conformance claim about a compiler. Do not conflate "my page earned `reduced-motion-safe`" with "my compiler is MotionSpec 1.0 compatible" — the former is about a page, the latter about an implementation passing C1–C5.

---

## 6. Registering an implementation

There is no central registry gate for MotionSpec 1.0 today: the format and the MIT reference runtime are open, and passing the published corpus is the certificate. If you ship a compatible implementation, open a pull request adding it to an `IMPLEMENTATIONS.md` list with a link to your corpus run. Multiple independent implementations passing the same corpus is what makes MotionSpec a standard rather than a single tool.
