## Purpose

Carries structured data between a tool and this application in both directions — describing what an
external authority holds, or proposing how it should change — so that a reader can approve a proposal
from what is shown and a producer can validate against a published contract instead of inferring one
from a rendering.

## ADDED Requirements

### Requirement: PublishedVersionedSchema

The system SHALL publish the following JSON Schema as the normative contract for version 1 of the
exchange envelope. Each supported major version SHALL be a Git-tracked source file, committed with
the implementation and its tests, carrying a stable version-specific `$id`. The runtime SHALL
validate against its committed copy and SHALL NOT retrieve a schema over the network. An
implementation MAY derive internal types from the schema, but those types SHALL NOT replace it as the
interchange contract.

The system SHALL also bound the size of a candidate document before parsing it, so that an oversized
document is refused rather than materialised. That bound is not expressible in the schema and is
stated as a separate check.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:structured-exchange:1",
  "title": "Structured exchange envelope v1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema",
    "kind",
    "data"
  ],
  "$defs": {
    "ref": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "localId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "label": {
      "type": "string",
      "maxLength": 500
    },
    "element": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/localId"
        },
        "ref": {
          "$ref": "#/$defs/ref"
        },
        "label": {
          "$ref": "#/$defs/label"
        },
        "set": {
          "$ref": "#/$defs/elementChange"
        }
      },
      "if": {
        "not": {
          "required": [
            "ref"
          ]
        }
      },
      "then": {
        "required": [
          "label"
        ]
      }
    },
    "edge": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "from",
        "to"
      ],
      "properties": {
        "from": {
          "$ref": "#/$defs/localId"
        },
        "to": {
          "$ref": "#/$defs/localId"
        },
        "kind": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "ref": {
          "$ref": "#/$defs/ref"
        },
        "label": {
          "$ref": "#/$defs/label"
        },
        "set": {
          "$ref": "#/$defs/edgeChange"
        }
      },
      "if": {
        "not": {
          "required": [
            "ref"
          ]
        }
      },
      "then": {
        "required": [
          "kind"
        ]
      }
    },
    "message": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "from",
        "to"
      ],
      "properties": {
        "from": {
          "$ref": "#/$defs/localId"
        },
        "to": {
          "$ref": "#/$defs/localId"
        },
        "ref": {
          "$ref": "#/$defs/ref"
        },
        "label": {
          "$ref": "#/$defs/label"
        },
        "set": {
          "$ref": "#/$defs/messageChange"
        }
      },
      "if": {
        "not": {
          "required": [
            "ref"
          ]
        }
      },
      "then": {
        "required": [
          "label"
        ]
      }
    },
    "removal": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "ref"
      ],
      "properties": {
        "type": {
          "enum": [
            "element",
            "relationship"
          ]
        },
        "ref": {
          "$ref": "#/$defs/ref"
        }
      }
    },
    "elementChange": {
      "type": "object",
      "additionalProperties": false,
      "minProperties": 1,
      "properties": {
        "label": {
          "$ref": "#/$defs/label"
        }
      }
    },
    "edgeChange": {
      "type": "object",
      "additionalProperties": false,
      "minProperties": 1,
      "properties": {
        "kind": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "label": {
          "$ref": "#/$defs/label"
        }
      }
    },
    "messageChange": {
      "type": "object",
      "additionalProperties": false,
      "minProperties": 1,
      "properties": {
        "label": {
          "$ref": "#/$defs/label"
        }
      }
    }
  },
  "properties": {
    "schema": {
      "const": "urn:structured-exchange:1"
    },
    "kind": {
      "enum": [
        "graph",
        "sequence",
        "table"
      ]
    },
    "target": {
      "$ref": "#/$defs/ref"
    },
    "removals": {
      "type": "array",
      "maxItems": 500,
      "items": {
        "$ref": "#/$defs/removal"
      }
    },
    "data": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "nodes",
            "edges"
          ],
          "properties": {
            "nodes": {
              "type": "array",
              "minItems": 1,
              "maxItems": 500,
              "items": {
                "$ref": "#/$defs/element"
              }
            },
            "edges": {
              "type": "array",
              "maxItems": 2000,
              "items": {
                "$ref": "#/$defs/edge"
              }
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "participants",
            "messages"
          ],
          "properties": {
            "participants": {
              "type": "array",
              "minItems": 1,
              "maxItems": 100,
              "items": {
                "$ref": "#/$defs/element"
              }
            },
            "messages": {
              "type": "array",
              "maxItems": 1000,
              "items": {
                "$ref": "#/$defs/message"
              }
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "columns",
            "rows"
          ],
          "properties": {
            "columns": {
              "type": "array",
              "minItems": 1,
              "maxItems": 50,
              "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              }
            },
            "rows": {
              "type": "array",
              "maxItems": 5000,
              "items": {
                "type": "array",
                "items": {
                  "type": [
                    "string",
                    "number",
                    "boolean",
                    "null"
                  ],
                  "maxLength": 1000
                },
                "maxItems": 50
              }
            }
          }
        }
      ]
    }
  }
}
```

#### Scenario: EnvelopeIsRejectedAgainstThePublishedSchema
- **WHEN** a document omits a required field, carries an undeclared property, or exceeds a declared collection bound
- **THEN** it is rejected and no specialized presentation is produced

#### Scenario: ValidationMakesNoNetworkRequest
- **WHEN** the application validates an envelope
- **THEN** validation completes without retrieving a schema over the network

### Requirement: TwoIdentitiesPerElement

An element SHALL carry an identifier scoped to the envelope, which relationships within that envelope
refer to. It MAY additionally carry a reference to an element the receiving authority already holds.

The two SHALL NOT be conflated: the envelope-scoped identifier is a local name, and the reference is
the join to an external artifact. An element that carries no reference SHALL be understood as one the
authority does not yet hold.

The system SHALL treat a reference as opaque. It SHALL NOT parse it, derive meaning from it, or alter
it, and SHALL reproduce it unchanged when the envelope is passed on.

A reference SHALL NOT be assumed unique across kinds of thing: the same string MAY identify an
element in one collection and a relationship in another. Anything naming a reference SHALL therefore
also say what kind of thing it names.

#### Scenario: AReferenceIsQualifiedByWhatItNames
- **WHEN** the same reference string identifies both an element and a relationship
- **THEN** each is addressed unambiguously, and neither is taken to mean the other

#### Scenario: RelationshipsResolveThroughEnvelopeIdentifiers
- **WHEN** a relationship names an endpoint
- **THEN** it is resolved against the envelope's own element identifiers, not against any external reference

#### Scenario: ElementWithoutAReferenceIsNew
- **WHEN** an element in a proposal carries no reference to an existing element
- **THEN** it is presented as an addition rather than as a change to something that already exists

#### Scenario: ReferencesSurviveUnaltered
- **WHEN** an envelope carrying references is displayed and passed on
- **THEN** every reference is reproduced exactly as supplied

### Requirement: ProposalsArePatches

An envelope that names a target SHALL be understood as a proposal to change that artifact, describing
only what changes. An element the proposal does not mention SHALL be understood as untouched; an
omission MUST NOT be interpreted as a removal.

A removal SHALL be declared explicitly, naming both the reference and what kind of thing it removes,
since a reference alone does not say whether it means an element or a relationship. Removals SHALL be
permitted only in a proposal that names a target, since an artifact that does not yet exist has
nothing to remove.

A modification SHALL be declared as such. On something carrying a reference, the fields declared
beside it SHALL be understood as **describing what already exists** — they are there so a reader can
recognise it — and SHALL NOT be applied. An intended change SHALL be stated separately, naming the
fields to change and the values they are to take.

The default SHALL run that way round, and not the other. A producer here may be generative, and it
will sometimes omit the declaration; what matters is what that costs. Were a declared field taken as
an intended change, a producer including twenty elements so the reader could see the surroundings
would be proposing twenty renames to the names those elements already have — and the reader, seeing
them marked as changes with no way to tell, could approve them. With this default the same omission
changes nothing and is noticed as nothing happening. A generative producer's mistakes MUST fail
inert, not destructive.

A change SHALL name something that exists: a change declared on an element or relationship carrying
no reference SHALL be refused, since there is nothing there to change and its fields are already its
values. A change declaring no field SHALL be refused rather than treated as a change of nothing.

It follows that an element or relationship carrying a reference and no declared change is context,
however much it describes: something already held, named and labelled so the reader can place what
surrounds the proposal. The system SHALL NOT present it as modified.

Where a described value and a change to the same field are both present, the system SHALL present
them as a transition from the one to the other. A reader asked to approve a change is entitled to
see what it is changing from.

A relationship's endpoints are its identity, not its state. They SHALL be declared on every
relationship, referenced or not, and declaring them SHALL NOT be read as a request to change them.
Re-attaching a relationship SHALL be expressed as a removal and a creation, not as a patch of its
endpoints.

This is the one place the field rule does not apply, and it is deliberate: the approval view has to
place every relationship it shows, and a relationship whose endpoints were omitted could only be
listed in prose. A reader approving a structural change should see the structure. Restating an
endpoint is safe in a way restating a label is not — an endpoint cannot be changed by restating it,
so a producer that gets one wrong states an inconsistency the receiving authority can detect against
what it already holds, rather than silently overwriting something.

#### Scenario: RelationshipPatchDeclaresItsEndpoints
- **WHEN** a proposal changes an attribute of an existing relationship
- **THEN** it declares that relationship's endpoints alongside its reference, and they are not presented as a change

#### Scenario: ReattachmentIsRemovalAndCreation
- **WHEN** a proposal moves a relationship to a different endpoint
- **THEN** it declares a removal and a new relationship, rather than patching the endpoints of the existing one

An envelope that names no target SHALL be understood as a complete new artifact. The system SHALL
determine which of the two applies from the presence of the target alone, and MUST NOT infer it from
whether references happen to appear, because a proposal that only adds elements carries none.

#### Scenario: OmissionDoesNotRemove
- **WHEN** a proposal names a target and does not mention an element the authority holds
- **THEN** that element is not presented as removed and no removal is proposed for it

#### Scenario: RemovalIsDeclared
- **WHEN** a proposal declares a removal, naming a reference and what kind of thing it removes
- **THEN** it is presented as a removal alongside the rest of the proposal

#### Scenario: OnlyDeclaredChangesChange
- **WHEN** a proposal references an existing element and declares a change to one of its fields
- **THEN** that field is presented as taking the declared value, and no other field of that element is presented as changing

#### Scenario: DescribedFieldsAreNotChanges
- **WHEN** a proposal references an existing element and declares its current name beside the reference, without declaring a change
- **THEN** the element is presented as existing context under that name, and nothing about it is presented as changing

#### Scenario: AChangeNamesSomethingThatExists
- **WHEN** a change is declared on an element or relationship that carries no reference, or declares no field
- **THEN** it is refused, and no specialized presentation is produced

#### Scenario: AChangeIsShownAsATransition
- **WHEN** a proposal declares both a field's current value and a change to it
- **THEN** the reader is shown the move from the one to the other, not merely that something changed

#### Scenario: AReferenceAloneIsContextNotAChange
- **WHEN** a proposal references an existing element and declares no change, so that a new relationship can attach to it
- **THEN** the element is presented as existing context and not as a modification

#### Scenario: AdditionOnlyProposalRemainsAPatch
- **WHEN** a proposal names a target and every element in it is new, so no reference appears anywhere
- **THEN** it is still treated as a patch of that target, not as a complete new artifact

#### Scenario: RemovalWithoutATargetIsRejected
- **WHEN** an envelope declares a removal but names no target
- **THEN** it is rejected and no specialized presentation is produced

### Requirement: OnlySomeKindsMayBeProposed

The supported kinds SHALL be a graph, a sequence, and a table. A graph SHALL declare elements and
directed relationships between them; a sequence SHALL declare participants and ordered messages
between them; a table SHALL declare columns and rows aligned to those columns.

A graph and a sequence SHALL be permitted to name a target and declare removals. A table SHALL NOT:
it is a projection over something else, and cannot be applied. An envelope declaring a table with a
target or a removal SHALL be rejected.

#### Scenario: TableCarryingATargetIsRejected
- **WHEN** an envelope declares a table together with a target or a removal
- **THEN** it is rejected and no specialized presentation is produced

#### Scenario: TableIsStillRenderedAndReadable
- **WHEN** an envelope declares a table with no target
- **THEN** it is rendered with its declared columns and rows

### Requirement: RelationshipsDeclareAnOpaqueKind

Every relationship in a graph SHALL declare a kind. The system SHALL treat that kind as an opaque
string: it MAY display it and MAY use it to distinguish two relationships that connect the same pair
of elements, and it SHALL NOT interpret its meaning, validate it against a fixed vocabulary, or alter
behaviour based on its value.

Two relationships connecting the same pair of elements SHALL be permitted when their kinds differ.

#### Scenario: RelationshipKindIsPreservedAndUninterpreted
- **WHEN** a graph declares relationships whose kinds are unfamiliar strings
- **THEN** they are rendered and distinguished by kind without any kind being rejected as unknown

#### Scenario: ParallelRelationshipsAreDistinct
- **WHEN** two relationships connect the same pair of elements with different kinds
- **THEN** both are presented, and neither replaces the other

### Requirement: SemanticValidationAfterSchemaValidation

The system SHALL perform deterministic semantic validation after schema validation, verifying that
element identifiers are unique within the envelope, that every relationship and message endpoint
resolves to a declared element, that every row has one value per declared column, that the declared
kind agrees with the shape of the data, that a target and removals appear only where permitted, that
a removal names a kind of thing the declared data kind can contain, and that no removal names a
reference the same envelope also declares — a proposal that both changes and removes the same thing
states two intentions at once and SHALL be refused rather than resolved by precedence.

Neither validation stage SHALL repair, complete, or guess at invalid data. A document that fails
either stage SHALL yield no structured result.

#### Scenario: SchemaValidButSemanticallyInvalidIsRejected
- **WHEN** a document passes schema validation but repeats an element identifier, names an endpoint that is not declared, declares a kind that disagrees with its data, or has a row whose length differs from its columns
- **THEN** it is rejected and no partial view is produced

#### Scenario: ContradictoryProposalIsRefused
- **WHEN** a proposal declares a change to a reference and also declares that same reference removed
- **THEN** it is refused rather than resolved in favour of either intention

#### Scenario: ValidationNeverRepairs
- **WHEN** a document is invalid in a way that could be guessed at, such as a relationship endpoint close to a declared identifier
- **THEN** no correction is attempted and no structured result is produced

### Requirement: BoundedDocument

The system SHALL bound a candidate document's total size and SHALL apply that bound before parsing
it, so that an oversized document is refused rather than materialised. Every string the schema
carries — references, identifiers, labels, relationship kinds, column names, and cell values — SHALL
be bounded as well as every collection.

Bounds SHALL exist at two levels. The schema SHALL carry a **ceiling** for each collection and
string: stable for the life of a schema version, and what any producer may assume is accepted
wherever that version is supported. A deployment MAY additionally apply an **operational limit** at
or below the ceiling, so that limits can be calibrated against real traffic without changing the
published contract or requiring a version. A limit above its ceiling SHALL have no effect.

A refusal SHALL be actionable for whoever must adjust it: it SHALL report the observed value, the
limit applied, and which of the two levels the document exceeded. Exceeding a bound SHALL NOT
produce a truncated document or a partial view.

The system SHALL record the observed size of documents it **accepts**, so an operational limit can be
set from evidence rather than from a first refusal.

#### Scenario: OversizedDocumentIsRefusedBeforeParsing
- **WHEN** a candidate document exceeds the total size bound
- **THEN** it is refused without being parsed, and no structured result is produced

#### Scenario: UnboundedStringIsRefused
- **WHEN** a label, reference, relationship kind, column name, or cell value exceeds its bound
- **THEN** the document is refused, and nothing is truncated

#### Scenario: RefusalIdentifiesTheLimitThatBit
- **WHEN** a document is refused for exceeding a bound
- **THEN** the diagnostic reports what was exceeded, the observed value, the limit applied, and whether that limit was the schema's ceiling or the deployment's own

#### Scenario: OperationalLimitIsStricterThanTheCeiling
- **GIVEN** a deployment applying an operational limit below the schema's ceiling
- **WHEN** a document exceeds that limit while remaining within the ceiling
- **THEN** it is refused, and the diagnostic attributes the refusal to the deployment rather than to the published contract

#### Scenario: AcceptedSizesAreObservable
- **WHEN** documents are accepted over time
- **THEN** their observed sizes are recorded, so a limit can be calibrated without waiting for a refusal

### Requirement: TheAgentCanPresentADocument

The system SHALL give the agent a way to present a structured-exchange document it
composed itself. Without one the contract is open only to producers that implement tools,
and the agent — which authors documents on request — could describe one and never show it.

That path SHALL validate the document exactly as a received one is validated, and SHALL
NOT present anything that fails. A refusal SHALL be returned to the agent as an error
carrying the same diagnostics a producer would receive, so it can correct the document
and present it again within the same exchange.

The agent SHALL be required to supply a summary alongside the document, because the
structured payload does not reach it on a later turn and a document it can no longer
read is one it cannot answer questions about.

#### Scenario: AgentPresentsAValidDocument
- **WHEN** the agent supplies a valid document and a summary
- **THEN** the document is presented, and the summary is what remains available to the agent afterwards

#### Scenario: AgentReceivesTheDiagnosticsForARefusal
- **WHEN** the agent supplies a document that fails validation
- **THEN** nothing is presented, and the agent is given the rule and the offending value as an error it can act on

#### Scenario: AgentCorrectsAndPresentsAgain
- **WHEN** the agent corrects a document that was refused and presents it again
- **THEN** the corrected document is presented, with no trace of the refused one

### Requirement: ApprovedProposalIsRecoverableUnchanged

An approved proposal SHALL remain available in exactly the form it was validated in, so that it can
be handed to the authority that will apply it. The system SHALL NOT re-serialise, reorder, normalise,
or otherwise alter a proposal between approval and recovery.

How a proposal reaches the authority that applies it, and what that authority reports back, are
outside this contract. This requirement covers only that nothing is lost or changed on this side of
that boundary.

#### Scenario: ApprovedProposalIsByteForByteWhatWasValidated
- **WHEN** a reader approves a proposal and it is recovered for handover
- **THEN** it is exactly the document that was validated and displayed, unaltered

### Requirement: ReferenceValidationAvailableToProducers

The system SHALL provide a documented reference validation interface usable by a producer that is not
part of this application. It SHALL accept a candidate document from a file or standard input, apply
the published schema and the same semantic validation the application applies, and emit
machine-readable diagnostics. Invalid input SHALL produce a non-zero process status.

The interface and the schema SHALL be usable independently of this application, so that a producer
built elsewhere can validate without reproducing the contract.

A successful producer-side validation SHALL NOT exempt the application from validating a received
document again.

#### Scenario: ProducerValidatesBeforeEmitting
- **WHEN** a producer passes a valid candidate document to the reference validation interface
- **THEN** it receives a successful machine-readable result and a zero exit status

#### Scenario: ProducerReceivesActionableDiagnostics
- **WHEN** a producer passes a document whose relationship names an endpoint that is not declared
- **THEN** the interface identifies that failure and exits with a non-zero status

#### Scenario: ApplicationValidatesOnReceipt
- **WHEN** a document arrives that a producer states it has already validated
- **THEN** the application validates it again before rendering it

### Requirement: ApprovalRenderingShowsWhatWouldChange

A proposal SHALL be rendered as what it would change, not as the resulting state. Additions, changed
elements, and declared removals SHALL be distinguishable from one another in the rendering.

The rendering SHALL show every element the proposal carries. It MUST NOT summarise, sample, or
truncate a proposal that passed validation, because what is shown is what a reader approves.

#### Scenario: ProposalRendersAsItsChanges
- **WHEN** a proposal naming a target is rendered
- **THEN** its additions, changes, and removals are shown and distinguishable

#### Scenario: EveryProposedElementIsShown
- **WHEN** a validated proposal carries the largest number of elements the contract permits
- **THEN** every one of them appears in the rendering, none omitted or summarised

#### Scenario: NewArtifactRendersAsItself
- **WHEN** an envelope naming no target is rendered
- **THEN** it is presented as a complete new artifact rather than as a set of changes

### Requirement: NativeRenderingFromValidatedData

For a validated graph, the system SHALL render every declared element and directed relationship from
the validated data, preserving labels and direction. For a validated sequence, it SHALL render every
participant and message in declared order, preserving direction and label. For a validated table, it
SHALL render columns in declared order and every cell in its corresponding row position.

The system SHALL NOT infer elements, relationships, messages, labels, or meaning from diagram syntax
or from any accompanying text. Layout MAY choose geometry for readability, and geometry SHALL NOT be
presented as data.

Producer-supplied text SHALL be rendered as text and never as markup. Every view SHALL expose an
accessible textual equivalent of what it displays.

#### Scenario: GraphPreservesDeclaredRelationships
- **WHEN** a valid graph is rendered
- **THEN** exactly the declared elements and directed relationships are displayed

#### Scenario: SequencePreservesDeclaredOrder
- **WHEN** a valid sequence is rendered
- **THEN** every message appears in its declared order and direction between declared participants

#### Scenario: TablePreservesDeclaredOrder
- **WHEN** a valid table is rendered
- **THEN** columns and each row appear in their declared order

#### Scenario: ProducerTextRemainsInert
- **WHEN** a label or value contains markup-like text
- **THEN** it is displayed as text and is neither executed nor interpreted as markup

### Requirement: DerivedDiagramExport

The system SHALL offer a diagram-syntax representation of a validated graph or sequence, derived
deterministically from the validated data, and SHALL label it as derived. The export SHALL carry the
same elements, relationships or messages, directions, and order as the data it was derived from.

The system SHALL NOT parse diagram syntax to create, repair, or augment authoritative data.

#### Scenario: ExportCarriesTheSameStructure
- **WHEN** a diagram export is derived from a validated graph
- **THEN** it contains exactly the same elements and directed relationships as that graph

#### Scenario: ExportIsDeterministic
- **WHEN** a diagram export is derived twice from the same validated data
- **THEN** both derivations are identical

#### Scenario: DiagramSyntaxIsNeverAnInput
- **WHEN** diagram syntax is present in or alongside a result
- **THEN** it is not parsed to produce, complete, or correct any structured data

### Requirement: RawOutputRemainsAvailable

Every structured presentation SHALL retain the tool's original input and complete original output and
keep them reachable. A rendering or a derived export SHALL NOT replace them.

An envelope that cannot be used — an unsupported version, an unsupported kind, or any validation
failure — SHALL leave the result readable as ordinary output.

#### Scenario: OriginalOutputStaysReachable
- **WHEN** a reader opens a structured presentation
- **THEN** the original tool input and output remain reachable

#### Scenario: UnsupportedVersionFallsBack
- **WHEN** a well-formed envelope declares a schema version the application does not support
- **THEN** no specialized presentation is attempted and the result stays readable as ordinary output
