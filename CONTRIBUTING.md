# Contributing to MotionSpec

Thanks for helping improve MotionSpec. This project is small and gate-driven:
the deterministic checks below are the contract — if they pass, your change is in
good shape. (Part of the bus-factor program, TASK-032 M1.)

## Setup

```bash
git clone https://github.com/MasterPlayspots/motionspec.git
cd motionspec
npm ci                 # install exactly per package-lock
npm run prepare        # install the git hooks (husky: commit-msg → commitlint)
npm test               # all tests must be green before any commit
npm run coverage       # FAILS under 90% lines/functions of src/
```

## How it fits together

- **Stage A** (`src/router/`) turns a request into a spec — a small model, or a host LLM via the MCP server.
- **Trust Boundary** (`src/compiler/validate.js`) is fail-closed: a spec passes only if every check does. The `[MS-XXX]` code registry in that file is public API — never reuse or redefine a code.
- **Stage B** (`src/compiler/compile.js`) deterministically emits GSAP/CSS. The same spec always yields the same code; every interpolation is gated (`jsLiteral` / `cssRaw`).
- **Catalog** (`primitives/*.json`, loaded by `src/compiler/catalog.js`) holds the capability — not the model. Changing a primitive means a SemVer bump and `npm run catalog-lock:check`.

The static `schema/motionspec.schema.json` is kept in parity with the validator by `test/schema-parity.test.js`.

## Golden files (generated — never edit by hand)

The committed artifacts under `test/golden/` are byte-compared. After an
*intentional* change to compiler/lowering output, regenerate them — each suite
has its own flag:

```bash
npm run test:golden-update                                  # compile goldens (hero)
UPDATE_GOLDEN=1 node --test test/catalog-wave1.test.js      # per-primitive compile goldens (showcase)
UPDATE_WAAPI_GOLDEN=1 node --test test/waapi-lowering.test.js  # WAAPI lowering goldens
```

Review the golden diff before committing: only the lines you intended to change
may differ. Forge candidates get their goldens via `bin/promote-gate.js --prepare`.

## Commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and are
enforced by commitlint via a git hook. Allowed types: `feat`, `fix`, `docs`,
`chore`, `refactor`, `test`, `ci`, `build`, `perf`, `style`, `revert`, `harden`,
`deps`. Example: `fix(worker): constant-time secret compare (TASK-016)`.

## Pull request checklist

- `npm test` green and `npm run coverage` ≥ 90% lines/functions.
- `npm run catalog-lock:check` passes (relock only on a deliberate catalog change at release time).
- `npm audit --audit-level=low` is clean; `npm run sbom && npm run sbom:check && node bin/license-check.js` pass.
- Zero runtime dependencies beyond `@modelcontextprotocol/sdk` and `zod` — prefer zero-dep.
- Schema is **frozen v1** (ADR-0001): additive ⇒ 1.x; any change to the spec shape ⇒ a new ADR + `specVersion "2.0"`.
- One change, one commit; new ideas mid-task go to a backlog, not the current change.
- Update `CHANGELOG.md` under `[Unreleased]`.

## Toolchain

The pinned Node version is in `.nvmrc` (Node 22 — `nvm use`). CI runs on Node 22.

Node 25 / npm 11 footgun: `npm sbom` fails there with `ESBOMPROBLEMS`
(`invalid: conventional-commits-parser@7.0.1, ^6.4.0 required`) because a deep
dev-only dependency of commitlint pins an older range that npm's SBOM validator
rejects. This is fixed by an `overrides` entry in `package.json`
(`"conventional-commits-parser": "7.0.1"`) that forces a single, consistent
resolution. If `npm run sbom` starts failing again after a dependency bump,
re-check that override target before touching anything else — and never commit a
truncated or empty `sbom.cdx.json` (the `sbom` script redirects stdout to the
file, so a mid-pipe error would truncate it).

## Contact

Open an issue (see the templates) or reach the maintainer **@MasterPlayspots**.
