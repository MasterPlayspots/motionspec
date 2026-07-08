# ADR 0002 — Non-GSAP Targets (Web Animations API / CSS lowering)

**Status:** PROPOSED (implementation shipped in 1.2.0; the public `meta.target` enum remains the deferred decision) — awaiting L0 sign-off. The recommended lowering (Option B) is IMPLEMENTED and shipped, so what remains open is only whether to promote `"waapi"` to a public target.
**Date:** 2026-06-21 (implementation shipped 2026-07-06 in 1.2.0) · **Decider:** target enum is part of the FROZEN v1 contract — touching it is an ADR-gated decision per ADR-0001 D3/D5.
**Informed by:** legal risk **B1** (GSAP's license forbids use in no-code tools that compete with Webflow) and the Phase B1 PoC (`scrollReveal` → WAAPI, 9/9 green), now extended to the **full 40-primitive catalog** (`src/compiler/lower-waapi.js`) and shipped in 1.2.0.

> A-gates-B satisfied: the full non-GSAP lowering exists and is golden-tested. It is IMPLEMENTED and shipped in 1.2.0 across all 40 primitives; what remains is the proposed decision on how to *expose* it (the public target enum). Read, adjust, sign.

## Decision at a glance (sign-off block)

| # | Decision | Proposal |
|---|---|---|
| D1 | How is the WAAPI lowering exposed? | **Option B — internal lowering, selected by an API/CLI flag (`engine: "waapi"`); the public `meta.target` enum stays `["vanilla-gsap"]` (schema UNCHANGED).** |
| D2 | When does `"waapi"` become a public `meta.target`? | Only once target→lowering **dispatch** exists in `compileSpec` AND a target-driven engine is a product requirement. Tracked as a follow-up (D1 of a future ADR-0004), not now. |
| D3 | Trust Boundary | Unchanged. The WAAPI lowering calls the **same** `validateSpec()`, fail-closed, no partial output. No validation is weakened. |
| D4 | Error codes | Add `MS-WAAPI-UNSUPPORTED` (primitive without a lowering) and `MS-WAAPI-CSS` (CSS-safety abort) to the public `[MS-XXX]` registry (ADR-0001 D5 — codes never reused/redefined). |

**Sign-off:** [ ] Kevin Fröba approves D1–D4 as above.

---

## Context

The validated MotionSpec is the **portable IR**. The GSAP compiler (`compile.js`) is *one* lowering of that IR. Legal risk **B1** means GSAP could become a liability overnight: its license forbids use in no-code tools that compete with Webflow, which is squarely the product's lane. The strategic hedge is to prove — and keep proven in CI — that the architecture is **not GSAP-locked**: the same specs, the same Trust Boundary, a different backend.

The PoC (`scrollReveal` only) shipped that proof for one primitive. The lowering now covers the **full 40-primitive catalog** (shipped in 1.2.0). The table below shows the strategy for the original 8 catalog primitives as a representative sample:

| Primitive | Catalog `output` | WAAPI lowering strategy | GSAP-free |
|---|---|---|---|
| `scrollReveal` | js | IntersectionObserver + `Element.animate` | ✅ |
| `staggerReveal` | js | same reveal engine + per-index `delay` | ✅ |
| `counterUp` | js | IntersectionObserver + `requestAnimationFrame` count (replaces `gsap.to({snap})`) | ✅ |
| `cssTransition` | css | pure CSS (was already CSS; byte-equivalent) | ✅ |
| `marquee` | css | pure CSS `@keyframes` (was already CSS; byte-equivalent) | ✅ |
| `parallaxLayer` | js | passive `scroll` listener + rAF, hand-rolled progress→`translateY` (replaces ScrollTrigger `scrub`) | ✅ |
| `scaleOnScroll` | js | passive `scroll` listener + rAF, progress→`scale` | ✅ |
| `pinnedSection` | css | `position: sticky` **best-effort** (semantic divergence — see below) | ✅ |

All of these (and the rest of the 40-primitive catalog, as shipped in 1.2.0) are golden-tested for byte-identity, determinism, the reduced-motion guard, and a **GSAP-free assertion** (`!/gsap\.|ScrollTrigger|registerPlugin/`).

The open question is **not** "can we lower without GSAP" (answered: yes) but **"how do we let a caller choose the WAAPI backend"**. Two options.

---

## Option A — Make `"waapi"` a public `meta.target`

Add `"waapi"` to the published contract so a spec author writes `meta.target: "waapi"` and gets the WAAPI artifact.

**What changes (lockstep, or CI breaks):**
1. `src/compiler/validate.js`: `const TARGETS = ["vanilla-gsap", "waapi"];`
2. `schema/motionspec.schema.json`: `meta.properties.target.enum = ["vanilla-gsap", "waapi"]`
3. *(no test edit needed)* `test/schema-parity.test.js` test #3 asserts `set(meta.properties.target.enum) deepEquals set(TARGETS)`. It stays green **iff** steps 1 and 2 are done together.

**Verified test ripple (measured in this build):**
- Patch **both** 1+2 → `schema-parity.test.js` **10/10 green**.
- Patch **validator only** (the realistic drift) → test #3 **FAILS** (`target enum == TARGETS`). The parity test is exactly the drift tripwire ADR-0001 added; it does its job here.

**Why Option A is the wrong move *right now* — the decisive finding:**
`compileSpec()` does **not** select the engine from `meta.target`. Its only use of the field is a comment label (`"Ziel: " + spec.meta.target`). The GSAP compiler compiles **every** valid target to GSAP. So if `"waapi"` joined the public enum **without** wiring target→lowering dispatch, a spec that declares `target: "waapi"` would **still compile to GSAP** through `compileSpec` — a silent, shipped contradiction between what the spec declares and what the artifact is. That is a worse failure than not offering the target at all: it makes the published contract lie.

Option A is therefore only safe **after** `compileSpec` (or a router above it) dispatches on target — i.e. a real architectural change, not an enum edit. It also permanently widens the **frozen** v1 contract (ADR-0001): once specs in the wild carry `target: "waapi"`, that value can never be removed without a v2. Adding it before the dispatch exists spends irreversible contract surface to buy nothing.

**Migration steps IF Option A is later chosen (recorded for the follow-up ADR):**
1. Implement target→lowering dispatch in a router (`compileSpec` switches: `vanilla-gsap` → GSAP path, `waapi` → `lowerWaapi`), or a thin `route()` above both. *This is the real work.*
2. `validate.js`: add `"waapi"` to `TARGETS` (exported).
3. `schema.json`: add `"waapi"` to `meta.target.enum`.
4. Keep `schema-parity.test.js` green (it will be, if 2+3 are lockstep).
5. Add an end-to-end test: `meta.target: "waapi"` produces the WAAPI artifact (NOT GSAP) — closes the contradiction.
6. Bump: this is an **additive 1.x** change to the spec contract (new allowed enum value), not v2 — document in CHANGELOG and a new ADR (the enum is ADR-gated).

---

## Option B — Internal lowering, selected by an API/CLI flag (RECOMMENDED)

Keep `meta.target` = `["vanilla-gsap"]` (schema **unchanged**, frozen contract untouched). Expose the WAAPI backend as an **engine selection** orthogonal to the spec: an API option / CLI flag (`--engine waapi`, or `lowerWaapi(spec, catalog)` called directly), not a spec field.

**What changes:**
- `src/compiler/lower-waapi.js` (this build) — the lowering. **No schema change. No `TARGETS` change. No parity ripple.**
- CLI/API wiring (follow-up, small): `bin/motion.js` and/or the MCP layer gain an `engine` switch that calls `lowerWaapi` instead of `compileSpec`. Out of scope for *this* build pack (which delivers the lowering + tests + this ADR); noted in `INTEGRATE.md`.
- New error codes `MS-WAAPI-UNSUPPORTED` / `MS-WAAPI-CSS` registered.

**Why B is right:**
- **The spec stays portable and engine-agnostic.** A spec describes *intent*, not backend. "Which engine renders it" is a build/deploy choice, exactly like "minify or not" — it does not belong in the frozen IR. This is the cleanest expression of the "validated spec is the portable IR" thesis that makes the GSAP hedge meaningful.
- **Zero contract risk.** The v1 freeze (ADR-0001) is socially irreversible after publish. Option B touches none of it. If the WAAPI backend is later dropped or renamed, no third-party spec breaks.
- **No silent contradiction.** Because engine selection is explicit at call time, there is no path where a declared target disagrees with the emitted artifact (the Option A footgun).
- **Same Trust Boundary, already proven.** `lowerWaapi` calls `validateSpec` first, fail-closed — identical security posture to `compileSpec`. The hedge is real *today* without widening the public surface.
- **Reversible.** A flag can be removed in a patch; an enum value in a frozen contract cannot.

**Trade-off (honest):** an end user authoring a spec can't say "give me WAAPI" *in the spec*. They (or the tool) choose it at compile time. For the current product shape — a model writes specs, a pipeline compiles them — the pipeline is exactly where the engine choice belongs, so this is not a real loss. If/when "per-spec target" becomes a product requirement, revisit via Option A's migration (which by then has the dispatch it needs).

---

## Recommendation: **Option B.**

Ship the full WAAPI lowering as an **internal, flag-selected** backend. Keep `meta.target` frozen at `["vanilla-gsap"]`. This delivers the entire B1 legal hedge — every primitive provably lowerable without GSAP, enforced in CI — **without** spending one byte of the irreversible v1 contract and **without** the "declares waapi, emits GSAP" contradiction that Option A introduces until target-dispatch is built. Promote to a public target (Option A) only when (a) `compileSpec` dispatches on target and (b) per-spec target selection is an actual requirement — at which point it is a clean additive 1.x change behind its own ADR.

---

## Pinning — the one semantic divergence (read before sign-off)

`pinnedSection` is the only primitive whose WAAPI lowering is **not behavior-faithful** to GSAP:

- **GSAP** pins by re-parenting the element into a generated **pin-spacer** and fixing it (`position: fixed`) for a computed scroll distance (`params.distance`, e.g. `"+=100%"`), with `pinSpacing` reserving layout so following content doesn't jump. This is runtime DOM surgery.
- **The WAAPI lowering** emits `position: sticky; top: 0` — the closest standards-native primitive. It differs in **mechanism and semantics**:
  - Sticky unpins at the **containing block's bottom**, *not* at an arbitrary `+=100%` distance ⇒ `params.distance` **cannot be honored faithfully**.
  - `pinSpacing` has **no direct sticky analogue** (sticky keeps the element in flow by nature; `pinSpacing:false` overlap is inexpressible).

This is documented inline in `emitPinnedSection` and flagged `// TODO(claude-code):`. Sticky covers the common "stick to top while content scrolls past, single section" case; **arbitrary distances and nested pins are NOT equivalent**. A faithful pin needs a real DOM/runtime decision (a JS pin runtime: spacer + measured `position:fixed` range) — deferred, because it reintroduces exactly the kind of imperative scroll-driven layout code GSAP exists to provide, and the common case is served by sticky. **Sign-off should acknowledge this divergence**; if faithful pinning is required for B1 parity, it becomes a scoped follow-up (a JS `pinnedSection` runtime), not a CSS emitter.

Two other primitives are **functional but not pixel-identical** to GSAP and rely on a real-DOM runtime decision (worth noting, not blocking):
- `parallaxLayer` / `scaleOnScroll`: GSAP's `scrub` (smoothing in seconds) is reimplemented as exponential smoothing toward a viewport-derived progress (`alpha = 1/(1+scrub*6)`, rounded for a stable golden). The *feel* matches; exact frame-by-frame values differ (and depend on scroll, as they must). The progress mapping is a deliberate, documented approximation of ScrollTrigger's `start`/`end` window.

The five reveal/counter/CSS primitives (`scrollReveal`, `staggerReveal`, `counterUp`, `cssTransition`, `marquee`) lower **cleanly** with no semantic caveat; `cssTransition` and `marquee` are byte-equivalent to the GSAP path's CSS.

---

## Consequences (if B is approved)

- **Published contract unchanged.** `meta.target` stays `["vanilla-gsap"]`. `schema-parity.test.js` is untouched and stays green (no TARGETS/enum edit).
- **New backend, same boundary.** `lowerWaapi` is a second consumer of `validateSpec`; the security review surface is the lowering's *emitters* (re-escaping), already covered by the golden + GSAP-free + CSS-safety tests.
- **Error codes are API.** `MS-WAAPI-UNSUPPORTED`, `MS-WAAPI-CSS` join the frozen registry (never reused/redefined).
- **Pinning caveat is documented**, not hidden — adopters relying on faithful pins are warned in-artifact and here.
- **Future Option A stays open** behind its own ADR once target-dispatch exists; this ADR records the exact migration + the contradiction it must close.

## What this ADR explicitly does NOT do
- Does **not** add `"waapi"` (or any value) to the public `meta.target` enum.
- Does **not** change the schema, `TARGETS`, or `schema-parity.test.js`.
- Does **not** wire the CLI/MCP `engine` flag (follow-up; see `INTEGRATE.md`).
- Does **not** ship a faithful `pinnedSection` pin runtime (deferred; sticky best-effort only).

## Rollback
Option B is technically reversible at any time: delete `lower-waapi.js` + its golden tests; nothing in the published contract depended on it. This reversibility is the point — it is why B is preferred over irreversibly widening the v1 enum.

## Sign-off
- [ ] Full non-GSAP lowering attached and green (shipped in 1.2.0: all 40 primitives golden-tested + parity green)
- [ ] Pinning semantic divergence acknowledged
- [ ] D1–D4 decided
- [ ] Kevin Fröba signs (target enum is ADR-gated; Option B leaves it frozen — sign-off confirms we do NOT take Option A now)
