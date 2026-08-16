## Context

The first structured-exchange contract deliberately carries only enough semantics to identify,
relate, present, and approve generic graph, sequence, and table data. Its schema is strict, versioned,
bounded, and locally validated; references and kinds are opaque, and a target is an artifact reference
rather than a revision. See `proposal.md` for why this boundary now needs a compatible extension.

This change depends on `add-structured-tool-results` being completed and integrated. It must preserve
the original contract rather than editing its committed schema in place. Independent producers and
receiving authorities may know a richer vocabulary, while the application must remain useful without
that knowledge and must not retrieve producer-selected schemas or code.

## Goals / Non-Goals

**Goals:**

- Add enough bounded semantic context for independent engineering tools to exchange useful views and
  safe proposals without coupling the core application to their metamodels.
- Preserve the distinction between opaque identity, navigational location, descriptive current state,
  applicability conditions, and proposed changes.
- Give a receiving authority the revision and expected values needed to detect stale work.
- Keep every new producer-controlled field inert, locally validated, accessible, and recoverable.
- Preserve version 1 behavior and make rollback a matter of disabling version 2 acceptance.

**Non-Goals:**

- Defining a vocabulary, profile registry, code model, requirements model, or systems-modeling
  metamodel.
- Downloading or executing profiles, renderers, actions, or linked artifacts during validation.
- Making the application authoritative for checking external revisions or expected values.
- Embedding source files, patches, reports, or binary evidence in the envelope.
- Defining a transaction, dependency graph, or rollback protocol across multiple authorities.
- Reproducing an external tool's layout or replacing its native edit/apply mechanism.

## Decisions

### Publish a strict version 2 beside version 1

The extension uses a new schema identifier and a new committed JSON Schema rather than loosening the
version 1 schema. Version 1 uses `additionalProperties: false`; accepting new fields under the same
identifier would make a previously invalid document valid and would destroy the meaning of a stable
contract. The version dispatcher will retain both validators, and unsupported versions will continue
to use the existing fallback behavior.

The version 2 target is always an object with `ref` and optional `revision`. This avoids a union at the
most important mode boundary and leaves the mere presence of `target` as the proposal discriminator.
Version 1 keeps its string target.

*Alternative considered:* add optional fields to version 1. Rejected because the published schema is
already the producer contract and is intentionally immutable.

### Profiles identify vocabulary but do not extend executable validation

`profile` is one bounded opaque identifier at envelope level. It tells a profile-aware producer or
authority which vocabulary owns `kind` and attribute names. The core validator checks only the
version 2 structural contract and never resolves the identifier. Unknown profiles therefore remain
renderable through a generic presentation.

Profile-specific validation belongs in the producer and receiving authority. A future locally
installed, explicitly trusted registry could add richer presentation, but it is not implied by the
identifier and is outside this change.

*Alternative considered:* use a profile URL as a dynamic JSON Schema reference. Rejected because it
would make validation network-dependent, expose document processing to producer-selected resources,
and make historical documents non-reproducible.

### Use a bounded typed value algebra instead of arbitrary JSON

Attributes are maps with bounded names and counts. A value is a string, finite number, boolean, null,
opaque reference object, or a single bounded list of those scalar/reference values. Lists cannot nest
and no other object shape is allowed. All strings, collections, and the complete document remain
subject to schema ceilings and deployment limits.

The reference variant allows an attribute to point at something owned elsewhere without parsing that
reference. Rich domain values can be encoded by a profile as bounded strings or decomposed into
separate named attributes; the core does not attempt to model quantities, signatures, stereotypes,
or language-specific types.

*Alternative considered:* permit arbitrary JSON values. Rejected because recursive data weakens size
analysis, generic rendering, deterministic comparison, and the attack boundary.

### Keep attribute deletion explicit

Current descriptive attributes live beside the item's identity. Proposed assignments live in the
item's `set.attributes` map, while proposed deletion uses a separate bounded
`set.removeAttributes` list. `null` remains an ordinary typed value and never means deletion. Semantic
validation rejects duplicate removal names and any name present in both assignment and removal.

This follows the version 1 rule that omission means unchanged and avoids replacing an entire
attribute map to change one property.

*Alternative considered:* use JSON Merge Patch and let null delete. Rejected because null may be a
valid domain value and merge-patch semantics would be a second implicit change language.

### Expectations are declarations for the authority, not assertions by the application

Version 2 referenced items may carry an `expect` object mirroring bounded current fields and
attributes. Target revision and expectations are allowed only when `target` exists. The core can
validate their shape and contradictions, and the approval view can display them, but only the
receiving authority can compare them with current external state.

Approval means the reader approves the proposal subject to those conditions; it does not mean the
application has established that the conditions hold. Recovery returns the exact validated
conditions for the authority to check immediately before application.

*Alternative considered:* have the application call the authority during validation. Rejected
because it would couple the contract to integrations, make offline review impossible, and introduce
time-of-check/time-of-use ambiguity without eliminating the authority's final check.

### References are identity; locations are disposable navigation hints

An optional location contains an opaque URI, optional revision, and optional zero-based line/character
range. It never participates in endpoint resolution, duplicate detection, or proposal identity.
Range ordering is semantic validation because JSON Schema cannot conveniently compare positions.

The generic UI displays and copies every location. It offers navigation only through the existing
workspace/resource safety policy and only after explicit reader action. No scheme becomes trusted by
being present in a valid envelope.

*Alternative considered:* encode file paths and ranges into `ref`. Rejected because moving a symbol
would change its identity and because consumers would be tempted to parse references the base
contract promises are opaque.

### Linked artifacts are integrity-bound references, not attachments

Artifact links can appear at envelope level or on addressable items. Each link has an opaque `rel`,
URI, mandatory `sha256:` digest, and optional media type and label. Mandatory digests make an approval
refer to stable bytes even when the URI is mutable. Payloads remain outside the envelope so existing
document ceilings remain meaningful.

Validation and initial rendering never retrieve a link. A later explicit open action uses existing
resource controls, hashes the received bytes before use, and refuses a mismatch. The raw link remains
visible even when its URI cannot be opened.

*Alternative considered:* allow inline base64 content. Rejected because it duplicates attachment
transport, encourages large tool results, and expands the rendering attack surface.

### Render enrichment as generic facts and proposal roles

The presentation model will expose ordered, escaped key/value rows for descriptive attributes and
separate rows for expectations, assignments, and removals. Profile, target revision, location, and
artifact links receive visible labels and equivalent accessible text. Unknown data is never hidden
merely because no richer renderer understands it.

Structural diagrams remain derived views: they may use kinds for generic colour/legend treatment but
do not need to serialize all enrichment into diagram syntax. Approval recovery continues to use the
validated structured document, never a derived export.

## Risks / Trade-offs

- **[Two supported schema versions increase maintenance cost]** → Keep version dispatch explicit and
  run the shared conformance suite against both versions, including frozen version 1 fixtures.
- **[Generic attributes can become an informal ungoverned vocabulary]** → Make profile ownership
  visible, preserve opaque names, and keep profile validation at producer/authority boundaries.
- **[Readers may mistake expectations for verified facts]** → Label them as applicability conditions
  and state that the receiving authority must check them.
- **[Locations and artifact URIs can target unsafe resources]** → Never fetch automatically; reuse the
  existing explicit-action safety boundary and verify artifact digests before use.
- **[Attribute rendering can overwhelm a diagram]** → Keep the full accessible representation and use
  expandable detail in the visual presentation without silently dropping data.
- **[Mandatory artifact digests add work for producers]** → Provide digest guidance and validation
  diagnostics; retain locations for mutable navigation targets that are not immutable artifacts.
- **[The base change may evolve before integration]** → Implement only after its schema and proposal
  semantics are stable, then reconcile this delta against the archived main capability.

## Migration Plan

1. Complete and integrate `add-structured-tool-results`, preserving its version 1 schema and fixtures.
2. Commit the version 2 schema, generated types, limits, semantic validator, and conformance corpus
   beside version 1.
3. Add version dispatch and producer-facing validation support, then prove frozen version 1 behavior
   before enabling version 2 presentation.
4. Add generic rendering, accessible text, approval recovery, and explicit safe navigation/opening.
5. Update bundled producer guidance and exercise both an unknown-profile document and a proposal in
   the running application.

Rollback disables version 2 dispatch and authoring guidance while leaving version 1 untouched.
Already recorded version 2 results then follow the existing unsupported-version fallback rather than
being misread as version 1.
