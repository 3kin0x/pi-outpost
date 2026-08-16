## Why

The structured exchange contract can identify and relate things, but it cannot yet carry their
domain-owned properties, establish that a proposal was prepared against a particular revision, or
point a reader to the source and evidence behind an element. A small, domain-neutral extension will
let independent producers use the same validated exchange for richer engineering artifacts without
embedding any particular vocabulary or metamodel in the application.

## What Changes

- Publish a new, Git-versioned structured-exchange schema version while preserving support for
  version 1 documents.
- Let an envelope name an optional, opaque profile that owns the vocabulary of kinds and attributes;
  core validation remains local and makes no network request for that profile.
- Add bounded, typed attributes to addressable elements and relationships, including patch semantics
  for changing or clearing individual attributes without replacing the whole attribute set.
- Let a proposal identify the revision of its target and declare expected current values, allowing
  the receiving authority to detect a stale or conflicting proposal before applying it.
- Add optional, navigable locations that are explicitly hints rather than identities, and that may
  name a source revision and bounded range.
- Add content-addressable links to implementation, verification, evidence, or other related
  artifacts without embedding large payloads in the exchange document.
- Render the new information generically and accessibly, while leaving interpretation and
  application to the profile-aware authority.
- Defer orchestration of one logical change across multiple authorities; this change enriches one
  exchange envelope and does not define a distributed transaction protocol.

## Capabilities

### New Capabilities

- `structured-exchange-context`: Domain-neutral profiles, bounded attributes, optimistic-concurrency
  context, navigable locations, and linked artifacts layered on the structured-exchange contract.

### Modified Capabilities

None.

## Impact

- Adds a new committed JSON Schema, generated TypeScript types, semantic validation, conformance
  cases, and producer documentation alongside the existing version 1 contract.
- Extends the structured presentation and approval views with generic attribute, revision, location,
  and artifact information; no domain vocabulary or external-system integration is introduced.
- Extends the producer-facing validation interface and bundled authoring guidance for the new schema
  version.
- Requires compatibility tests proving that existing version 1 documents retain their current
  validation, rendering, recovery, and fallback behavior.
