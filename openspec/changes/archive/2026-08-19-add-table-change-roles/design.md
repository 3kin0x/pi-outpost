## Context

See proposal.md — Why. Three constraints shape the approach:

- `OnlySomeKindsMayBeProposed` forbids a table from carrying a target or a removal, and the reason
  given is sound: a table has no per-row identity to patch against. `isProposal` is
  `envelope.target !== undefined`, so the existing role machinery (`elementRole`,
  `relationshipRole`) has nothing to compute from for a table and never will.
- The envelope is a published contract, `urn:structured-exchange:1`, committed as
  `shared/schemas/structured-exchange-1.json` with a conformance corpus beside it. Both the server
  and the widget validate against their committed copy.
- `@pi-outpost/embed` is on npm, and every published copy carries a validator built from that schema.
  A document written after this change reaches validators written before it.

## Goals / Non-Goals

**Goals:**

- A row can say what it is — added, changed, context, removed — and be seen to say it.
- One vocabulary of change across the three kinds: the same words, the same tints, the same key.
- Documents written before this change keep validating and keep rendering identically.

**Non-Goals:**

- Making a table applicable. No approval path, no `target`, no `removals` for `kind: "table"`.
- Diffing two tables. The producer says what changed; this application does not work it out.
- Per-cell roles. A row is the unit, as an element is the unit in a graph.

## Decisions

### A row becomes `cells` plus an optional `role`, not a parallel array of roles

A parallel `roles: [...]` array aligned to `rows` was the cheaper edit — no change to the row type,
no union. It was rejected because alignment is exactly what goes wrong: `row-column-mismatch` already
exists because a short row silently invents data, and a roles array introduces a second alignment
with the same failure mode and no natural place to report it. Carrying the role on the row it
describes cannot desynchronise.

The bare array form stays valid, so `rows: [["REQ-001", "…"]]` is unchanged and a producer that does
not care about roles writes what it writes today. The row type becomes
`StructuredTableCell[] | { cells: StructuredTableCell[]; role?: ChangeRole | "removed" }`, and one
accessor normalises the two forms for everything downstream.

### The role is declared, not derived — unlike a graph's

For an element, the role is derived: no `ref` means added, `set` present means changed. That works
because an element has identity against a target. A table has neither, so a derivation would have
nothing to read. The producer states the role instead.

This is a real divergence from the convention and it is the honest one: a table is a *projection*, so
what it reports is an observation, not a proposal. `TableRowsMayDeclareAChangeRole` says so
normatively — nothing in the application acts on a declared role.

### `removed` is a role, not an entry in `removals`

`removals` is rejected for a table, and rightly: a removal names a `ref` the envelope's own
collections must resolve, and a table has no such collection — `describeRemoval` would print the bare
identifier and the "the proposal does not say what this is" hedge for every one of them. A removed
row, by contrast, carries its own cells: the reader sees what is being removed. So removal for a
table is a row role, and the existing red-and-struck-through treatment is reused for it.

### Additive within version 1, with the caveat answered rather than repeated

`PublishedVersionedSchema` allows an addition of this kind only "while no consumer outside this
repository holds a copy of the contract". Published `@pi-outpost/embed` copies do hold one, so the
caveat has to be met head-on rather than cited.

What actually happens to an old consumer meeting a role-carrying row: its validator rejects the
envelope, and `RawOutputRemainsAvailable` / `UnsupportedVersionFallsBack` already govern that path —
the tool result renders as raw output instead of a table. Degraded, legible, not a crash, and
identical to what a v2 envelope would do to the same consumer. A new major version would therefore
buy nothing for old readers while forcing every producer to re-declare `schema`.

That reasoning holds because the only external consumers are copies of this application's own
renderer. The first genuinely third-party producer or renderer changes the answer, and the next
addition of this kind should take version 2.

### The colouring may not be inferred

A requirements table almost always has a "Status" column of the producer's own vocabulary —
`approved`, `draft`, `in review`. Colouring rows by matching those strings is the shortcut this
design forbids in the spec, for the same reason `TypeIsDistinguishableFromChange` keeps kind and
change on separate channels: the reader cannot tell a coincidence of wording from a statement of
change, and the producer loses the ability to say "this row is unchanged and its status is draft".

## Risks / Trade-offs

- **A producer marks roles on a table nobody proposed anything with, and every row reads as context.**
  → The spec makes a table with no roles render exactly as today, so the failure requires deliberate
  role-marking; the legend states what the roles mean.
- **Old embed copies reject role-carrying tables.** → Falls back to raw output, per the existing
  requirement; called out in the release notes when this ships, alongside a version bump of the
  widget.
- **Two row forms to handle for the life of v1.** → One normaliser at the boundary; validation,
  rendering, export and the textual equivalent all read the normalised row, so the union exists in
  exactly one place.
- **`removed` is a role here and a top-level `removals` entry for a graph.** → Divergent by
  necessity (see above); the textual equivalent names both "removed", so the reader sees one word.

## Migration Plan

No data migration: every existing document stays valid and renders unchanged. Ship order is
schema → validator → conformance corpus → renderer, so no build can accept a document the renderer
cannot draw. Rollback is the revert of a single schema addition; documents produced in the interim
degrade to raw output rather than failing.
