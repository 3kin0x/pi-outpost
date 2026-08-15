## Why

A tool can already return Markdown or a diagram, but presentation syntax is a fragile interchange
boundary: it is written to be read, not to be relied on. Anything that wants to *act* on what a tool
returned has to parse prose or diagram source back into data it never had.

That is tolerable while the data only ever flows one way and only ever gets displayed. It stops being
tolerable when the same data has to make a round trip: an external authority states what exists, the
agent proposes an evolution of it, a human approves that proposal, and the authority applies it. At
that point the rendering is not documentation — it is the approval gate before a write to a system of
record, and a syntax-sensitive boundary in the middle of it is a liability.

## What Changes

- Define a generic, versioned exchange envelope as a normative JSON Schema, carrying a presentation
  kind, validated data, and — when the envelope proposes an evolution — the identifiers that let the
  receiving authority join it to what it already holds.
- Distinguish two identities on every element: one scoped to the envelope, which its relationships
  refer to, and an optional reference to an element the external authority already knows. An element
  with no such reference is new.
- Give a proposal patch semantics at every level. It describes only what changes: omitting an element
  never removes it, and omitting a field never clears it. Removals are declared explicitly, saying
  what kind of thing each one names, since a reference alone does not distinguish an element from a
  relationship. An envelope naming no target is a complete new artifact rather than a patch.
- Render a proposal as an approval view showing what it would change, because a proposal that carries
  only its changes *is* that view — no comparison against a previous state is required.
- Add a renderer contract and registry path that recognizes valid envelopes without coupling the
  application to any particular producer or domain.
- Provide a reference validation interface, usable by an independent producer before it emits an
  envelope and by the agent before it proposes one, sharing the schema and semantic rules the
  application applies on receipt.
- Provide generic graph, sequence, and table rendering derived from structured data. Rendered diagram
  syntax is an optional export, never authoritative input.
- Preserve raw output, fail safely to raw output when an envelope is unknown or invalid, and keep
  structured content inert.

## Capabilities

### New Capabilities

- `structured-exchange`: a versioned, producer-neutral envelope that carries structured data in
  either direction — describing what exists, or proposing what should change — together with the
  identifiers, validation, and approval rendering that make a round trip safe.

### Modified Capabilities

- `tool-result-presentations`: the presentation registry selects a recognized structured-exchange
  renderer while preserving existing precedence and raw-output access.
- `utilities`: parsing and validation expose a complete validated envelope or no structured result.

## Impact

- Shared JSON Schema and types, a two-stage reference validator, a producer-facing validation
  command, the presentation registry, generic renderers, an approval view, and tests.
- Two kinds of producer are expected and neither is privileged: an external tool that holds the
  authoritative artifact, and the agent itself, guided by a skill. The skill is part of this change —
  without it the format is available to the agent but not usable by it.
- Producers gain a documented contract they can validate against in their own language, rather than a
  shape they must infer from a rendering.
- No domain vocabulary, no external system integration, and no relationship taxonomy is defined here.
  The schema carries relationship kinds as opaque strings; what they mean belongs to the producer and
  its domain.
- Delivering an approved proposal to the authority that applies it, and reporting what applying it
  did, are deliberately out of scope. This change guarantees only that an approved proposal survives
  unaltered and can be recovered exactly as it was validated — the precondition any delivery
  mechanism would need, and the part that can be specified without a producer to shape it against.
