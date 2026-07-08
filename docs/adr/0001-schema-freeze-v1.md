# ADR 0001 — Schema Freeze v1
**Status:** ACCEPTED — Kevin Fröba signed off on D1–D5 as drafted, 2026-06-15. Implemented same day (validator + compiler + tests, suite green). Schema v1 is frozen.
**Date:** 2026-06-15 · **Decider:** Kevin Fröba (L0 sign-off required — irreversible)
**Informed by:** `docs/S2-01_FINDINGS.md` — v0.1 field shape was NOT stressed; 2 gaps, both additive.

> A-gates-B satisfied: the client run happened first. Below are the proposed decisions. Read, adjust if needed, sign. Nothing is locked in code yet.

## Proposed decisions at a glance (sign-off block)
| # | Decision | Proposal |
|---|---|---|
| D1 | Version string | v1 carries `"1.0"`; compiler also accepts `"0.1"` for one minor cycle |
| D2 | Versioning rules | Catalog SemVer: patch=template fix · minor=new optional param OR new primitive · major=removed/renamed primitive or tightened bounds. `catalogVersion` pin optional (recommended). Breaking the spec shape ⇒ v2. |
| D3 | In v1 vs deferred | Lock the v0.1 field shape as-is. Defer: `responsive`→0.2, react-gsap target→own ADR, animated-gradient & drawSVG→additive primitives post-v1 (S2-01 gaps). No new fields. |
| D4 | 0.1 deprecation | v1 accepts `"0.1"` for one minor cycle; compile report emits a deprecation note. Removed in v1.2. |
| D5 | Error-code stability | The `[MS-XXX]` registry is public API — codes never reused/redefined. |

**Sign-off:** [x] Kevin Fröba approves D1–D5 as above (2026-06-15, "Approve all D1–D5").

## Context
MotionSpec is at specVersion 0.1, 8 verified primitives, MCP live. The open-spec strategy means once specs exist in the wild, breaking the schema costs trust. v1 is the version we publish — so it must be both stable and extensible. We freeze *after* one real client page has exercised 0.1 (S2-01), so the freeze answers real needs, not guesses.

## Decisions to make (all TBD — fill from the Gap Report)

### D1 — What `specVersion` value does v1 carry?
Options: keep `"0.1"` and call it stable / bump to `"1.0"`. → *TBD.* Recommendation pending: `"1.0"` signals stability to adopters.

### D2 — Versioning & compatibility rules (the core of the freeze)
- Catalog uses SemVer. The meta-schema (`catalog.js`) currently enforces only the **format** of each primitive's `version` (`\d+.\d+.\d+`) — NOT the bump *direction*. Define: which catalog changes are **patch** (template fix), **minor** (new optional param, new primitive), **major** (removed/renamed primitive or changed param semantics).
- A spec MAY pin `catalogVersion` for reproducibility. Decide: is pinning optional or required for v1?

> **Re-audit correction (2026-06-15):** an earlier draft said SemVer was "already enforced by the meta-schema" — that was inaccurate; only the *format* was checked. **Now resolved (Phase B):** `bin/catalog-lock.js` + `catalog.lock.json` + `test/catalog-semver.test.js` enforce bump *direction* — a tightened bound shipped as a "patch" now fails CI. And `catalogVersion` is now an optional additive 1.x **spec field** (`TOP_KEYS` + schema): a spec MAY pin the 16-char catalog hash and is rejected fail-closed (`MS-CATALOG-PIN-MISMATCH`) if the loaded catalog differs — so reproducibility is enforceable. See `docs/PHASE_A_REAUDIT_2026-06-15.md` §4.
- Forward/back-compat policy: what is the contract that a v1.x compiler makes to a v1.0 spec? → *TBD.*

### D3 — What is IN v1 vs deferred?
- IN (current 0.1 surface): `specVersion, meta{project,target,createdWith}, globals{respectReducedMotion,defaultEase}, motions[]{id,primitive,target,params,trigger}`.
- DEFERRED to 0.2/1.x (do NOT smuggle into v1 — anti-goal B5): `responsive` (currently rejected honestly), additional `meta.target` values (react-gsap).
- **From the Gap Report (S2-01, 2026-06-15 — first real page):** the page needed **no new fields**; the schema shape was not stressed. Two gaps surfaced, both **additive primitives, not schema changes**:
  - (a) animated gradient background → recommend defer to 0.2 / future `animatedGradient` primitive.
  - (b) SVG path draw-in (`drawSVG`) → demand-driven S2-05 only.
  → **Provisional decision (pending sign-off): v1 locks the v0.1 field shape as-is; both gaps are post-v1 additive work.** See `docs/S2-01_FINDINGS.md`.

### D4 — 0.1 deprecation path
Decide: does v1 still accept `specVersion "0.1"` for one minor cycle (deprecate, don't remove — anti-goal B3)? Recommendation pending: yes, with a deprecation note in the compile report.

### D5 — Error-code stability commitment
S2-04 shipped stable `[MS-XXX]` codes. Decide: declare the code registry part of the public API contract (codes never reused/redefined). Recommendation pending: yes.

## What this ADR explicitly does NOT do
- Does not add `responsive` (0.2).
- Does not add the react-gsap target (separate ADR, MS-08).
- Does not decide hosting/publishing (out of Sprint-2 scope).

## Consequences (decided 2026-06-15)
- **Published contract.** `specVersion "1.0"` is the stable, public schema. The v0.1 field shape is locked: `specVersion, meta{project,target,createdWith}, globals{respectReducedMotion,defaultEase}, motions[]{id,primitive,target,params,trigger}`. No field may be added to v1 — new fields ⇒ 1.x (additive only) or v2 (breaking).
- **Back-compat window.** `"0.1"` still validates and compiles for one minor cycle. The compile report carries `deprecations: [{ code: "MS-DEPRECATED-VERSION", message }]`. Support is removed in **v1.2**.
- **What a v2 would require.** Any change to the spec *shape* (rename/remove a top-level or motion field, change a field's meaning) ⇒ new ADR + `specVersion "2.0"`. Catalog changes follow SemVer (D2) and do NOT bump the spec version.
- **Error codes are API.** The `[MS-XXX]` registry (incl. new `MS-DEPRECATED-VERSION`) is frozen — codes are never reused or redefined.
- **Deferred, explicitly out of v1:** `responsive` (→0.2), react-gsap `meta.target` (own ADR), `animatedGradient` & `drawSVG` primitives (additive, post-v1). These do not touch the frozen shape.

### Implementation record
- `src/compiler/validate.js`: `SPEC_VERSIONS = ["1.0","0.1"]`, `DEPRECATED_VERSIONS = ["0.1"]`, both exported.
- `src/compiler/compile.js`: report now carries `specVersion` + `deprecations[]`.
- `src/mcp/server.mjs`: authoring rules + example author against `"1.0"`.
- `package.json`: version `1.0.0`.
- `test/specversion-v1.test.js`: 5 tests asserting D1/D4 contract. Full suite 72/72 green, `npm audit` 0 vulnerabilities.

## Rollback (un-freeze before public launch)
The freeze is socially irreversible *after Phase F (public publish)* — that is the true point of no return, when third parties hold v1 specs. Before then it is technically reversible: delete the `v1.0.0-spec` tag, `git revert` the freeze commits, reopen this ADR to PROPOSED. This window exists precisely so an independent re-audit can still block. After Phase F, breaking the shape requires a v2 ADR, never a revert.

## Independent re-audit (2026-06-15, Law 4)
A six-specialist team independently re-verified Phase A *after* the tag (an ordering note: per Law 4, the next irreversible step — Phase F publish — must be verified BEFORE the action, not after). Verdict: runtime contract correct & secure (security specialist: Phase A did not weaken the trust boundary; 76/76 green), but the freeze was *half-applied* (generation path still authored "0.1") and two forward-promises (D2 SemVer, v1.2 removal) were prose-only. Same-day fixes: generation path migrated to "1.0"; `MS-DEPRECATED-VERSION` added to the code registry; v1.2 removal tripwire test added; MCP/CSS/responsive gap tests added; schema `$id` fixed. Remaining items routed to Phase B backlog (SemVer diff gate, schema↔validator parity test, optional `catalogVersion` pin field, `globals` key allow-list). Full findings: `docs/PHASE_A_REAUDIT_2026-06-15.md`.

## Sign-off
- [x] Gap Report (S2-01) attached and reviewed
- [x] D1–D5 decided (approved as drafted)
- [x] Kevin Fröba signs (irreversible-decision gate) — 2026-06-15
- [x] Independent re-audit performed; defects fixed or backlogged — 2026-06-15
