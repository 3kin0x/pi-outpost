## Purpose

Enriches structured exchanges with domain-owned properties, concurrency context, navigable source
locations, and integrity-bound artifact links without teaching the core application a domain model.

## ADDED Requirements

### Requirement: CompatibleVersionedExtension

The system SHALL publish the enriched contract as a new Git-tracked structured-exchange schema with
a stable version-specific identifier. It SHALL continue to accept and present valid version 1
documents according to their original contract, and SHALL select validation solely from the declared
schema identifier.

Validation of either version MUST NOT retrieve a schema, profile, vocabulary, location, or linked
artifact over the network.

#### Scenario: VersionOneRemainsValid
- **WHEN** a document valid under version 1 is received after the enriched contract is installed
- **THEN** it is validated and presented with version 1 semantics unchanged

#### Scenario: VersionTwoSelectsItsOwnContract
- **WHEN** a document declares the enriched schema identifier
- **THEN** it is validated against the committed enriched schema and its semantic rules

#### Scenario: ValidationStaysOffline
- **WHEN** a document names a profile, locations, and linked artifacts
- **THEN** validation completes without retrieving any of them

### Requirement: OpaqueOptionalProfile

An enriched envelope MAY name one bounded, non-empty profile identifier. The profile SHALL identify
the vocabulary that owns kinds and attribute names, but the core application SHALL treat it as an
opaque value: it MUST NOT infer domain semantics from it, fetch it, execute it, or reject an otherwise
valid envelope merely because the profile is unknown.

The profile identifier SHALL survive validation, presentation, approval, and recovery unaltered. A
producer or receiving authority MAY apply additional profile-specific validation outside the core
contract.

#### Scenario: UnknownProfileUsesGenericPresentation
- **WHEN** a valid enriched envelope names a profile the application does not know
- **THEN** the application presents it generically and preserves the profile identifier unchanged

#### Scenario: ProfileDoesNotSupplyExecutableBehavior
- **WHEN** a profile identifier resembles a URL, module name, or executable instruction
- **THEN** the application treats it only as inert text and does not retrieve or execute it

#### Scenario: ProfileIsOptional
- **WHEN** a valid enriched envelope carries attributes but names no profile
- **THEN** core validation accepts the attributes and the application presents their names and values generically

### Requirement: BoundedTypedAttributes

An enriched graph element, graph relationship, sequence participant, or sequence message MAY declare
a bounded map of attributes describing that item. Attribute names SHALL be bounded, non-empty opaque
strings. An attribute value SHALL be a bounded string, finite number, boolean, null, opaque reference,
or bounded non-recursive list of those values. Arbitrary nested objects and executable values SHALL
be rejected.

On a referenced item in a proposal, descriptive attributes SHALL describe the current item. Proposed
attribute assignments SHALL be declared inside its change, and proposed removal of an attribute
SHALL be declared by naming that attribute explicitly. Omitted attributes SHALL remain untouched. A
single change MUST NOT both assign and remove the same attribute.

#### Scenario: AttributesRemainDomainOwned
- **WHEN** a valid item carries attribute names unknown to the application
- **THEN** their names and typed values are preserved and presented without domain interpretation

#### Scenario: AttributeChangeIsExplicit
- **WHEN** a proposal describes a current attribute and declares a different value in the item's change
- **THEN** the presentation distinguishes the current value from the proposed value

#### Scenario: OmittedAttributeRemainsUntouched
- **WHEN** a referenced item has attributes but its change omits one of them
- **THEN** the omitted attribute is neither presented nor recovered as changed or removed

#### Scenario: AttributeRemovalIsExplicit
- **WHEN** a proposal explicitly names an attribute for removal
- **THEN** the presentation identifies that attribute as removed rather than assigning it a null value

#### Scenario: ContradictoryAttributeChangeIsRejected
- **WHEN** one change both assigns and removes the same attribute name
- **THEN** semantic validation rejects the envelope with a diagnostic naming that attribute

#### Scenario: RecursiveAttributeValueIsRejected
- **WHEN** an attribute value contains an arbitrary nested object or nested list
- **THEN** schema validation rejects the envelope

### Requirement: TargetRevisionAndExpectations

An enriched proposal SHALL represent its target as an object containing the target's opaque reference
and MAY include the opaque revision from which the proposal was prepared. The presence of the target
object alone SHALL continue to determine that the envelope is a proposal.

A referenced item in a proposal MAY declare bounded expected current fields and attributes. An
expectation SHALL be understood as a precondition for the receiving authority, not as a change. The
application SHALL validate the structure of expectations and present them to the reader, but SHALL
NOT claim to verify them against an authority it does not own.

Target revisions and expectations SHALL be permitted only in proposals. They SHALL survive approval
and recovery unaltered so the receiving authority can refuse a stale or conflicting proposal.

#### Scenario: RevisionTravelsWithProposal
- **WHEN** a proposal names the revision of its target
- **THEN** the revision is visibly associated with the proposal and is recovered unchanged after approval

#### Scenario: RevisionDoesNotDefineProposalMode
- **WHEN** a target object is present without a revision
- **THEN** the envelope is still treated as a proposal

#### Scenario: ExpectationIsNotPresentedAsAChange
- **WHEN** a referenced item declares an expected current value and a proposed value
- **THEN** the presentation distinguishes the precondition from the proposed change

#### Scenario: ExpectationOutsideProposalIsRejected
- **WHEN** an envelope without a target declares an expected current value or target revision
- **THEN** semantic validation rejects it

#### Scenario: AuthorityCanReceiveConcurrencyContext
- **WHEN** an approved proposal carrying a target revision and expectations is recovered for handover
- **THEN** all concurrency context is present exactly as validated for the authority to check before applying it

### Requirement: NavigableLocationHints

An enriched addressable item MAY carry a bounded location consisting of an opaque URI, an optional
opaque revision, and an optional zero-based start and end position. When both positions are present,
the end MUST NOT precede the start.

A location SHALL be a navigation hint and MUST NOT replace, modify, or supply the item's identity or
reference. The application SHALL preserve and display the location as inert data. It MAY offer an
explicit navigation action only through its existing URI and workspace safety policy; it MUST NOT
open or retrieve a producer-supplied location automatically.

#### Scenario: LocationDoesNotBecomeIdentity
- **WHEN** two items carry the same location but different identifiers or references
- **THEN** they remain distinct items and validation does not merge them

#### Scenario: StaleLocationDoesNotChangeReference
- **WHEN** an item's location revision differs from the proposal's target revision
- **THEN** both opaque values are preserved and the location is not used to rewrite or resolve the reference

#### Scenario: InvalidRangeIsRejected
- **WHEN** a location's end position precedes its start position
- **THEN** semantic validation rejects the envelope with a diagnostic pointing to the range

#### Scenario: NavigationRequiresReaderAction
- **WHEN** a valid presentation contains a location URI
- **THEN** no resource is opened or retrieved until the reader explicitly invokes an allowed navigation action

### Requirement: IntegrityBoundArtifactLinks

An enriched envelope or addressable item MAY carry a bounded list of related artifact links. Each
link SHALL declare an opaque relationship, a bounded URI, and a SHA-256 digest of the artifact bytes,
and MAY declare a bounded media type and label. The link SHALL reference content rather than embedding
the content in the structured-exchange document.

The application SHALL preserve and present artifact links as inert metadata. It MUST NOT retrieve,
render, execute, or trust linked content during validation. Any later retrieval SHALL require an
explicit reader action, SHALL use the application's existing resource safety boundary, and SHALL
report a digest mismatch before the artifact is used.

#### Scenario: ArtifactLinkIsPresentedWithoutRetrieval
- **WHEN** a valid envelope carries a linked implementation or verification artifact
- **THEN** its relationship, label, media type, URI, and digest are available to the reader without fetching it

#### Scenario: EmbeddedArtifactPayloadIsRejected
- **WHEN** a producer places an inline binary or unbounded payload where an artifact link is expected
- **THEN** schema validation rejects the envelope

#### Scenario: DigestMismatchPreventsUse
- **WHEN** a reader explicitly retrieves a linked artifact whose bytes do not match its declared digest
- **THEN** the application reports the mismatch and does not open or apply the artifact

### Requirement: EnrichedInformationIsAccessibleAndRecoverable

The native presentation and its accessible textual equivalent SHALL expose the envelope's profile,
target revision, expectations, attributes, locations, and artifact links without interpreting
producer-controlled text as markup or executable content. A proposal view SHALL distinguish current
descriptions, expectations, proposed assignments, and proposed removals.

Approval and recovery SHALL retain every enriched field exactly as validated. A derived diagram
export MAY omit non-structural enrichment, but MUST NOT manufacture structure or silently become the
document handed to the receiving authority.

#### Scenario: GenericPresentationShowsEnrichment
- **WHEN** a valid enriched document contains every enrichment defined by this capability
- **THEN** each enrichment is available in both the native presentation and its accessible textual equivalent

#### Scenario: ProposalSeparatesConditionsFromChanges
- **WHEN** a proposal carries descriptions, expectations, assignments, and attribute removals
- **THEN** a reader can distinguish all four roles before approving it

#### Scenario: EnrichmentSurvivesApproval
- **WHEN** an enriched proposal is approved and recovered for handover
- **THEN** its profile, attributes, revision, expectations, locations, and artifact links are unchanged

#### Scenario: ProducerTextRemainsInert
- **WHEN** an enriched field contains markup-like or diagram-like text
- **THEN** it is displayed as text and neither executed nor interpreted as presentation syntax
