## Why

A structured exchange describes a system as a flat set of elements. Real systems are not flat: a
battery and an alternator belong to the electrical system, a calculator and a dashboard to the
control system, and that membership is most of what a reader is looking for when they open the
diagram. Today a producer has nowhere to put it — the closest available field is `kind`, which is a
type, not a place — so the grouping is either lost or smuggled into labels.

## What Changes

- `data` MAY carry `containers`: named groups declared once, with an identifier and a label.
- An element or a participant MAY name one container it belongs to. Membership lives on the member,
  is single-valued, and is absent by default.
- Relationships are unaffected. An edge connects elements, and it crosses container boundaries
  freely — a container groups, it does not mediate.
- Containers do not nest in this change. A container names no parent, and nesting stays available
  later as one more optional field rather than a second meaning for an existing one.
- The graph view draws each container as an enclosing box behind the elements it holds. The existing
  layout and the existing element and relationship styling are unchanged.
- The sequence view draws a container as a header spanning the columns of its members, and orders
  columns so that a container's members are always adjacent. Lifelines, messages and the rest of the
  column layout are unchanged.
- Semantic validation rejects a member naming a container the envelope does not declare, alongside
  the existing check for a relationship naming an unknown element.
- A container that no member names is valid, and is drawn as an empty box.
- The schema for version 1 gains these optional properties in place. Every document valid today
  stays valid. No consumer outside this repository holds the contract yet, so the identifier keeps
  its meaning in practice; had one existed, this would have needed a version 2 instead.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structured-exchange`: the published schema gains optional containers and an optional membership
  field; semantic validation gains a rule for membership; the graph and sequence renderings gain
  container geometry; the textual equivalent states membership.

## Impact

- `shared/schemas/structured-exchange-1.json` — the normative contract.
- `shared/src/generated/structuredExchangeCheck.ts` — regenerated from it; the current check pins
  `data` to exactly its present keys.
- `shared/conformance/valid/` and `invalid/` — new cases for containers, membership, an unknown
  container, and a container at the ceiling.
- `ui/src/presentations/structuredExchange.ts` — `layoutGraph` becomes a compound dagre layout and
  returns container rectangles; the Mermaid derivation gains `subgraph` and `box`; the textual
  equivalent names each member's container.
- `ui/src/presentations/StructuredExchangeView.tsx` — the graph view draws container boxes; the
  sequence view draws spanning headers and orders its columns.
- The bundled structured-exchange skill, which tells a producer what it may declare.
