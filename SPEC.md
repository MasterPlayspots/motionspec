# MotionSpec Specification

**Spec version:** 1.0 · **Status:** Stable · **Schema:** `schema/motionspec.schema.json` (`$id: https://motionspec.dev/schema/1.0/motionspec.schema.json`)

MotionSpec is a declarative format for scroll- and state-driven web motion, plus a deterministic contract for compiling it to CSS/JavaScript. This document is the **normative specification**: the JSON Schema defines the shape, and the requirements below define the behaviour a conforming implementation MUST provide over that shape. Where this document and the schema disagree, the schema is authoritative for structural validity and this document is authoritative for behaviour.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **MAY**, and **OPTIONAL** are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

An implementation of this specification is a **MotionSpec compiler**: a program that accepts a MotionSpec document and either rejects it with a diagnostic or emits deterministic presentation code. The reference implementation is the npm package [`motionspec`](https://www.npmjs.com/package/motionspec) (MIT).

---

## 1. Design invariants (informative)

These invariants motivate the normative rules; §2–§7 are what a conforming implementation is measured against.

1. **Trust boundary.** A language model — or any untrusted author — MAY write the spec. The spec is data, never code. All executable output is produced by the compiler from a fixed, audited catalog. A malformed or adversarial spec results in a diagnostic, never in emitted code.
2. **Determinism.** The same document compiled by the same catalog version MUST yield byte-identical output. No wall-clock, randomness, or ambient state may enter emitted code.
3. **Accessibility by construction.** Reduced-motion fallbacks and pause paths for continuous motion are emitted by the compiler, not left to the author (§6). The author cannot forget them.
4. **Fail closed.** Any validation failure aborts compilation with a stable `MS-*` diagnostic code; the compiler MUST NOT emit partial or "best-effort" output.

---

## 2. Document structure

A MotionSpec document is a single JSON object.

### 2.1 Top level

| Key | Required | Type | Notes |
|---|---|---|---|
| `specVersion` | **MUST** | string | MUST equal `"1.0"` for this specification. An implementation MUST reject any other value (`MS-SPEC-VER`). |
| `meta` | **MUST** | object | See §2.2. |
| `motions` | **MUST** | array | One or more motion entries (§2.3). An empty array MUST be rejected (`MS-SPEC-MOTIONS`). |
| `catalogVersion` | OPTIONAL | string | A 16-hex catalog pin. If present, an implementation MUST reject the document when the pin does not match its loaded catalog (`MS-CATALOG-PIN-MISMATCH`). If absent, an implementation MAY compile against its current catalog. |
| `globals` | OPTIONAL | object | See §2.4. |

An implementation MUST reject any unknown top-level key (`MS-SPEC-KEY`) and any non-object document (`MS-SPEC-OBJ`).

### 2.2 `meta`

| Key | Required | Type |
|---|---|---|
| `target` | **MUST** | string — the output **runtime target**. In spec 1.x the only supported value is `"vanilla-gsap"`. |
| `project` | OPTIONAL | string |
| `createdWith` | OPTIONAL | string |

`meta.target` names the runtime the compiler emits for; it is **not** a CSS selector. A missing or unsupported `meta.target` MUST be rejected (`MS-META-TARGET`); unknown `meta` keys MUST be rejected (`MS-META-KEY`).

### 2.3 `motions[]`

Each entry is an object:

| Key | Required | Type | Notes |
|---|---|---|---|
| `id` | **MUST** | string | Matches `^[A-Za-z][A-Za-z0-9_-]*$` (`MS-ID-FORMAT`) and MUST be unique within the document (`MS-ID-DUP`). |
| `primitive` | **MUST** | string | MUST name a primitive present in the catalog (`MS-PRIM-UNKNOWN`; missing key `MS-PRIM-MISSING`). |
| `target` | **MUST** | string | A CSS selector (§4). |
| `params` | OPTIONAL | object | Validated against the primitive's `paramSchema` (§3). |
| `trigger` | OPTIONAL | object | Scroll/state trigger; validated against the primitive's `triggerDefaults`. |
| `responsive` | OPTIONAL | object | Per-breakpoint overrides; an implementation MUST reject overrides a primitive does not support (`MS-RESP-UNSUPPORTED`). |

Unknown motion keys MUST be rejected (`MS-MOTION-KEY`); a non-object entry MUST be rejected (`MS-MOTION-OBJ`).

### 2.4 `globals`

| Key | Type | Default | Notes |
|---|---|---|---|
| `respectReducedMotion` | boolean | `true` | Setting `false` while a document contains motion MUST raise `MS-GLOBALS-RRM-OFF` (§6). |
| `defaultEase` | string | — | A default easing applied where a primitive permits. |
| `pauseControls` | `"auto"` \| `"api"` \| `"off"` | `"auto"` | Governs the WCAG 2.2.2 pause path (§6.2). An invalid value MUST be rejected (`MS-GLOBALS-PAUSE-BAD`). |
| `pauseLabels` | object | EN defaults | `{ pause?, play? }` accessible labels for the emitted control. |

Unknown `globals` keys MUST be rejected (`MS-GLOBALS-KEY`); a non-object `globals` MUST be rejected (`MS-GLOBALS-OBJ`).

---

## 3. Parameters

Each primitive declares a `paramSchema`. For every motion entry an implementation MUST:

- reject a required parameter that is absent (`MS-PARAM-REQ`);
- reject a parameter whose type does not match (`MS-PARAM-TYPE`);
- reject a numeric parameter outside `min`/`max` (`MS-PARAM-MIN` / `MS-PARAM-MAX`);
- reject a string parameter that fails the declared `pattern` (`MS-PARAM-PATTERN`);
- reject any parameter the primitive does not declare (`MS-PARAM-UNKNOWN`);
- reject values containing characters outside the safe set for interpolation (`MS-PARAM-CHARSET`, `MS-PARAM-UNSAFE`).

Defaults declared in `paramSchema` MUST be applied when a parameter is omitted, and a primitive's own default MUST itself satisfy the declared pattern (`MS-PARAM-PATTERN-DEF`).

---

## 4. Selector safety

Every `motions[].target` is a CSS selector interpolated into emitted CSS (`meta.target` is the runtime enum from §2.2 and is never interpolated). An implementation MUST validate each `motions[].target` against a conservative safe grammar and MUST reject any selector that could break out of a rule or inject at-rules, declarations, or comments (`MS-TARGET-UNSAFE`). An implementation MUST NOT emit output for a document containing an unsafe selector.

---

## 5. Compilation & determinism

Given a valid document and a catalog, an implementation:

- **MUST** produce output solely as a function of `(document, catalogVersion)`. Two runs with identical inputs MUST be byte-identical.
- **MUST NOT** introduce `Math.random`, `Date.now`, iteration order over unordered collections, or any other nondeterministic source into emitted code.
- **MUST** fail closed: on any diagnostic in §2–§4, no output is emitted (`MS-COMPILE-CSS` denotes a downstream compile guard).
- **MUST** enforce an input size cap and reject oversized documents (`MS-INPUT-TOO-LARGE`).
- **SHOULD** support emitting to the catalog-declared `output` target (`css` and/or JS/WAAPI) with identical accessibility semantics across targets.

`specVersion "0.1"` is removed as of schema v1 and MUST be rejected (`MS-DEPRECATED-VERSION`).

---

## 6. Accessibility conformance (normative)

Accessibility is not advisory in MotionSpec; it is enforced at compile time.

### 6.1 Reduced motion (WCAG 2.3.3 Animation from Interactions)

- Every catalog primitive **MUST** declare `a11y.reducedMotionFallback`.
- Unless `globals.respectReducedMotion` is explicitly `false`, an implementation **MUST** emit each motion inside a `@media (prefers-reduced-motion: reduce)` guard (or an equivalent mechanism for JS targets) such that the reduced-motion fallback is honoured.
- Setting `respectReducedMotion: false` in the presence of motion **MUST** raise `MS-GLOBALS-RRM-OFF`.

### 6.2 Pause / stop for continuous motion (WCAG 2.2.2 Pause, Stop, Hide)

- A primitive whose animation is continuous (`infinite` / `repeat: -1`) **MUST** declare `a11y.persistent: true`. An implementation's promotion/validation path **MUST** refuse a continuous primitive that is not so tagged.
- For every persistent motion, an implementation **MUST** emit a pause path that is live independently of the reduced-motion guard — an `animation-play-state: paused` rule keyed on a document-level paused state (reference: `html[data-ms-paused]`).
- Under `pauseControls: "auto"` (the fail-safe default) an implementation **MUST** additionally emit exactly one accessible control per document that toggles the paused state: `type="button"`, `aria-pressed` kept in sync, a target of at least 24×24 CSS pixels, a visible focus indicator, and it MUST NOT be rendered under reduced motion.
- Under `pauseControls: "api"` an implementation **MUST** keep the CSS pause contract and omit the control (the integrator supplies it).
- Under `pauseControls: "off"` an implementation **MUST** raise `MS-GLOBALS-PAUSE-OFF` when a persistent motion is present.
- A document with no persistent motion **MUST** add zero bytes of pause machinery.

### 6.3 Compositor safety (informative)

Primitives SHOULD animate only compositor-friendly properties (`transform`, `opacity`). The reference catalog marks each primitive's performance profile; alternate implementations SHOULD preserve these guarantees.

---

## 7. Versioning & change process (normative)

- This document specifies **spec version 1.0**, tied to schema `1.0`.
- **Additive, backward-compatible** changes (new primitive, new optional key that older documents can omit) are released as **1.x** and MUST NOT change the meaning of an existing valid document.
- Any change to the **document shape** — a new required key, a removed key, a changed type — is **breaking** and MUST be released as `specVersion "2.0"` accompanied by a new Architecture Decision Record (`docs/adr/`). Schema v1 is frozen by ADR-0001.
- Catalog changes (adding, changing, or removing a primitive) require a SemVer bump of the primitive and a re-lock of the catalog manifest (`catalog.lock.json`). The 16-hex catalog pin identifies the exact primitive set.
- The normative change process is: **proposal → ADR (`docs/adr/`) → review → versioned entry in `CHANGELOG.md`**. No spec-shape change lands without an ADR.

---

## 8. Conformance

An implementation conforms to MotionSpec 1.0 if it satisfies every **MUST** in §2–§7. See [`CONFORMANCE.md`](CONFORMANCE.md) for the test corpus and the procedure to certify a compatible implementation.

## 9. Standards mapping

MotionSpec operationalises specific legal and normative accessibility requirements. See the mapping table in [`README.md`](README.md#standards-mapping) (WCAG 2.2 SC 2.2.2 and 2.3.3, EN 301 549, U.S. Section 508, and the European Accessibility Act / BFSG).
