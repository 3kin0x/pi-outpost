## Why

A graph and a sequence tell a reader which parts of them are new, which changed, and which are only
there for context; the palette and the legend that carry that reading already exist. A table tells
them nothing. `StructuredTableData` is `columns` plus rows of scalars, `TableView` is not even handed
`isProposal`, and a requirements table describing four additions and one deletion renders exactly
like a table describing nothing at all.

That is not an oversight in the renderer. `OnlySomeKindsMayBeProposed` states that a table "is a
projection over something else, and cannot be applied", and an envelope declaring a table with a
target or a removal is rejected — so `isProposal`, which is `target !== undefined`, can never be true
for a table. The rule is right: a table has no identity per row to patch against. What is missing is
the other half — a projection that reports on a change should be able to *say* what it observed, even
though it cannot be applied.

## What Changes

- A row in a table MAY declare a change role: `added`, `changed`, `context`, or `removed`. A row that
  declares none reads as `context` inside a table that declares roles anywhere, and as `unchanged` in
  a table that declares none — so a plain data table keeps rendering exactly as it does today.
- The declared role is rendered with the palette and the legend already used for a graph's elements,
  extended with `removed` (the tint the removals list already uses: red, struck through).
- A table remains unproposable: `target` and `removals` stay rejected for `kind: "table"`. The role is
  a statement about something the producer looked at, not an instruction this application can apply,
  and nothing in the approval flow treats a table as approvable.
- The row shape becomes a union in the v1 schema: the existing bare array of cells, or an object with
  `cells` and an optional `role`. **Not breaking** — every document valid before this change stays
  valid, and a table that declares no role is indistinguishable from one written before roles
  existed. This follows the precedent `PublishedVersionedSchema` set for containers, and inherits its
  caveat (see design.md: `@pi-outpost/embed` is published, so the caveat needs answering rather than
  repeating).
- The alignment check (`row-column-mismatch`) applies to a row's cells whichever form the row takes.
- The textual equivalent of a table — the accessible reading, and what a reader copies out — names
  each row's role, as it already does for an element or a relationship.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structured-exchange`: `OnlySomeKindsMayBeProposed` gains the distinction between *being a
  proposal* (still forbidden for a table) and *reporting roles* (newly permitted);
  `PublishedVersionedSchema`'s normative schema block gains the row union and its additive-change
  paragraph covers it; `NativeRenderingFromValidatedData` extends the textual equivalent to a row's
  role; and a new requirement, `TableRowsMayDeclareAChangeRole`, states the roles, how a reader sees
  them, and that the colouring is never inferred from a producer's own "status" column.

## Impact

- `shared/schemas/structured-exchange-1.json` — the row union, and the enumerated role values.
- `shared/src/structuredExchange.ts` — `StructuredTableCell`, `StructuredTableRow`, `StructuredTableData`.
- `shared/src/structuredExchangeValidation.ts` — row-length check over both row forms; the
  target/removal rejection for tables stays as it is.
- `shared/conformance/` — new valid cases (roles declared, roles absent, mixed) and invalid ones (an
  unknown role, a row object without `cells`), plus the existing table cases which must not move.
- `ui/src/presentations/StructuredExchangeView.tsx` — `TableView` reads the role, tints the row,
  renders the legend; `textualEquivalent` names roles.
- `ui/src/presentations/structuredExchange.ts` — a role resolver for a row, beside `elementRole` and
  `relationshipRole`.
- No protocol change: the envelope travels in a tool result's `details` exactly as it does now.
