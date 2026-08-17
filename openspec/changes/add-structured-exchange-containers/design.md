## Context

See proposal.md — Why. What shapes the approach here is what already exists:

- The contract is a committed JSON Schema, and `shared/src/generated/structuredExchangeCheck.ts` is
  generated from it. The generated check pins `data` to exactly its current keys, so the schema and
  the generated validator move together or not at all.
- `layoutGraph` in `ui/src/presentations/structuredExchange.ts` already runs dagre. Dagre supports
  compound graphs; it is the same call with a flag and a parent per member.
- The sequence view lays out one column and one lifeline per participant, in declared order.
- The spec's embedded copy of the schema has **drifted** from `shared/schemas/structured-exchange-1.json`:
  the file carries `$defs/kind`, `kind` on elements and element changes, and the fuller `removal`
  shape, none of which the spec's copy shows — though requirements elsewhere in the same spec
  (`ElementsMayDeclareAnOpaqueKind`, `RelationshipsDeclareAnOpaqueKind`) describe them. The delta's
  MODIFIED block restates the schema from the file, so landing this change also repairs that drift.

## Goals / Non-Goals

**Goals:**

- One layout engine, one styling vocabulary. Containers are geometry added behind what is already
  drawn.
- A membership that fits the existing change model, so a proposal can move a member without a new
  kind of patch.
- Deterministic column order in a sequence, predictable by a producer without reading the code.

**Non-Goals:**

- Nesting. Not modelled, not rendered, not validated against.
- Containers as things a proposal patches. A container is declared per envelope; `removals` gains no
  container type and a container carries no `ref` or `set`.
- Cross-container relationships being drawn any differently from ordinary ones — no routing around
  boundaries, no distinct styling for a boundary crossing.

## Decisions

### Membership on the member, not members on the container

`{ id, label, container }` rather than `{ id, label, members: [...] }`.

The deciding factor is the proposal model. Moving an element becomes `set: { container: "core" }` —
the change shape that already exists and already renders as a change. With member lists the same move
edits two containers, and "remove from a list" matches none of the current primitives: `removals`
takes a thing out of the target, not a membership out of a group. Single membership is then true by
construction rather than by a validation rule nothing else needs.

It also leaves the door open cheaply: nesting later is one optional field on a container, not a
second meaning for `members`.

Alternative considered and rejected: a top-level `groups` map from container id to member ids. Same
problems as member lists, plus a second place where element identifiers appear.

### Graph containers are dagre clusters

`layoutGraph` gains `compound: true`, calls `setParent(memberId, containerId)` for each member, and
returns the cluster rectangles dagre computes alongside the nodes and edges it already returns.

Verified against the installed `@dagrejs/dagre` before choosing it: cluster nodes come back with
their own `{x, y, width, height}` — the enclosing box, computed — members are placed inside, and
edges route through boundaries normally.

    electrical  {x:612, y:66,  w:376, h:115}
    control     {x:290, y:93,  w:188, h:168}
    battery     {x:706, y:71}      alternator {x:518, y:50}
    edge ecu→battery: 7 points, crossing the boundary

The alternative — grouping by hand and placing groups side by side — was prototyped and rejected: it
replaces the real layout with a worse one, and the requirement is that elements keep being drawn
exactly as they are.

### Sequence containers are a header, and the view orders columns

A header can only span adjacent columns, so a document that interleaves two containers cannot be
drawn with one header each. Two ways out: draw a container as several headers, or order the columns
so members are contiguous. The second was chosen — one container, one header, always — and the
ordering is stated in the spec so a producer can predict it rather than discover it.

The cost is real and worth naming: declared order is meaningful in a sequence diagram, and this view
may depart from it. It departs as little as it can — containers appear in order of first mention,
members keep their declared order among themselves, and an ungrouped participant does not move
relative to what precedes it.

### The empty container is drawn

An accepted-but-invisible container would contradict the perceptibility the spec already requires of
everything declared, and would leave a producer no way to see that its declaration arrived. Drawing
an empty box also lets a proposal add the group before its members.

### Extending version 1 rather than minting version 2

Adding optional properties to a schema whose objects are `additionalProperties: false` is additive
for producers and breaking for a consumer holding the older copy: it would reject a document
carrying `containers` outright. Confirmed with the author that no consumer outside this repository
holds the contract and that it is not yet in use, which is the only condition under which this is
sound. The spec now says so explicitly, so the next such addition has to re-examine the condition
rather than inherit the precedent.

## Risks / Trade-offs

- **The generated validator is regenerated from the schema; a stale copy silently accepts or rejects
  the wrong documents.** → Regeneration is a task, and the conformance corpus grows a case that only
  passes with the new schema, so a forgotten regeneration fails the suite rather than shipping.
- **Sequence reordering surprises a producer who chose its participant order deliberately.** → The
  rule is normative and stated in the spec, and the textual equivalent still reports membership, so
  the information is not lost even where the column order changes.
- **Dagre cluster layout can produce wider diagrams than the same graph ungrouped.** → The view
  already scrolls, and the enlarge control already exists for exactly this.
- **Restating the schema in the spec repairs drift, which makes the delta look larger than the
  feature.** → Called out here and in the proposal so a reviewer reads the diff correctly.

## Migration Plan

No data migration. Documents without containers are unaffected, and nothing persists an envelope
across the change. Rolling back is reverting the commit: a document that used containers would then
be rejected by the older schema, which is the correct behaviour for a contract that no longer
declares them.
