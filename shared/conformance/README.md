# Structured-exchange conformance suite

The executable half of the contract. `../schemas/structured-exchange-1.json` says what
the shape is; these cases say what a correct implementation *does* with documents that
sit on either side of the line — including the ones JSON Schema alone cannot judge.

Any producer, in any language, can run this: the cases are plain JSON and
`index.json` states the expected verdict for each. Nothing here depends on this
repository, which is the point — a producer that has to read our TypeScript to know
whether it conforms does not have a contract, it has a dependency.

## Layout

- `valid/` — documents a conforming implementation accepts.
- `invalid/` — documents it refuses. `index.json` names the rule each one breaks.
- `index.json` — the manifest, with `expectedRule` for every invalid case.

## Rules that are not in the schema

JSON Schema decides shape. These are the relational rules that follow it, and the
`expectedRule` values that name them:

| Rule | What it refuses |
|---|---|
| `duplicate-identifier` | two elements sharing an envelope-scoped `id` |
| `duplicate-container-identifier` | two containers sharing an `id` |
| `unresolved-endpoint` | a relationship endpoint that no declared element carries |
| `unresolved-container` | an element assigned to a container the document never declares |
| `kind-data-mismatch` | a declared `kind` that disagrees with the data variant present |
| `kind-not-proposable` | a `table` carrying a `target` or a `removal` |
| `removal-without-target` | a removal in a document that targets nothing |
| `duplicate-reference` | the same reference addressed twice — changed twice, or changed and removed |
| `change-without-reference` | a `set` with no `ref` naming what should change |
| `change-without-target` | a `set` in an envelope that names no target authority |
| `too-many-kinds` | more distinct element or relationship kinds than the rendering can distinguish |
| `row-column-mismatch` | a row whose length differs from the declared columns |

Rules prefixed `schema/` come from the JSON Schema itself; the suffix is the keyword
that refused it.

## Running it here

```
node --import tsx/esm shared/bin/validate-structured-exchange.mjs shared/conformance/valid/graph-minimal.json
```

Exits 0 for a valid document, 1 for a refused one, 2 when the input could not be read
at all — which is not the same thing as invalid, and a producer's build should not
treat it as if it were.

## Two things a conforming implementation must not do

**Repair.** No case here is close enough to valid to be worth guessing at, and that is
deliberate: `unresolved-endpoint` names an endpoint one character from a declared
identifier. Correcting it would produce a document the producer never wrote.

**Report only the first problem.** A document breaking several rules is reported
against all of them. A producer that has to fix one thing, be refused, fix the next,
and be refused again is a producer that stops using the format.
