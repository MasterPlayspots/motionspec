# candidates/ — Primitive staging area

**This is intentional staging, not dead duplication.** Each subfolder here holds a
primitive *in development* before promotion into `primitives/`.

## Layout

```
candidates/<name>/
├── <name>.json              # draft primitive (pre-promotion; may differ from the promoted version)
├── example.motionspec.json  # worked example exercising the draft
└── NOTES.md                 # design notes / rationale / open questions
```

## Why these are kept (and why the basenames overlap `primitives/`)

`counterUp`, `marquee`, and `scaleOnScroll` already have promoted versions in
`primitives/`. The drafts here are **not identical** to the promoted files
(`diff` differs) — they retain the original staging notes and worked examples that
informed promotion. Deleting them would discard that design history.

A name appearing in both `candidates/` and `primitives/` therefore means
"promoted, with its staging record preserved" — not an accidental copy.

## Promotion

Only `primitives/*.json` is the source of truth (loaded by the compiler/catalog and
covered by `catalog-lock`). Files under `candidates/` are **not** loaded at runtime
and are **not** part of the catalog lock. When a draft is ready, its reviewed form is
copied to `primitives/` and the catalog lock is regenerated.

> Audit note: the 2026-06-26 IST-Audit (§D1) initially flagged these as "tote
> Duplikate". Wave-1 verification corrected this — see
> `docs/fertigstellung/` (D1 correction): the files differ and carry NOTES/examples,
> i.e. genuine staging.
