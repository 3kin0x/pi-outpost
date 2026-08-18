## MODIFIED Requirements

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

Containers and membership are optional additions to this version rather than a new one. Every
document valid before them SHALL remain valid, and a document that declares neither SHALL be
indistinguishable from one written before they existed. This is only sound while no consumer outside
this repository holds a copy of the contract; once one does, an addition of this kind SHALL take a
new version instead, because a published identifier that changes meaning is not an identifier.

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
    "container": {
      "description": "A named group of elements or participants. Grouping only: relationships connect elements and cross container boundaries freely, and a container carries no relationship of its own.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "label"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/localId"
        },
        "label": {
          "$ref": "#/$defs/label"
        },
        "kind": {
          "$ref": "#/$defs/kind"
        }
      }
    },
    "kind": {
      "description": "The producing tool's type or stereotype for this thing \u2014 'block', 'sensor', 'power', 'thermal'. Free text, because the vocabulary belongs to the domain and not to this contract. Carries meaning, not presentation: a reader may colour by it, and a consumer may map it back to its own type system.",
      "type": "string",
      "minLength": 1,
      "maxLength": 100
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
        "kind": {
          "$ref": "#/$defs/kind"
        },
        "set": {
          "$ref": "#/$defs/elementChange"
        },
        "container": {
          "$ref": "#/$defs/localId"
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
          "$ref": "#/$defs/kind"
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
        },
        "label": {
          "$ref": "#/$defs/label"
        },
        "kind": {
          "$ref": "#/$defs/kind"
        },
        "from": {
          "$ref": "#/$defs/localId"
        },
        "to": {
          "$ref": "#/$defs/localId"
        }
      },
      "description": "Something to take out of the target, named by the reference the authority knows it by. The other fields describe it and never identify it: they exist so a reader can see what they are approving the removal of. This application holds one document, not the authority's model, so without them a removal is an opaque identifier and the reader is asked to approve the deletion of something they cannot see."
    },
    "elementChange": {
      "type": "object",
      "additionalProperties": false,
      "minProperties": 1,
      "properties": {
        "label": {
          "$ref": "#/$defs/label"
        },
        "kind": {
          "$ref": "#/$defs/kind"
        },
        "container": {
          "$ref": "#/$defs/localId"
        }
      }
    },
    "edgeChange": {
      "type": "object",
      "additionalProperties": false,
      "minProperties": 1,
      "properties": {
        "kind": {
          "$ref": "#/$defs/kind"
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
            },
            "containers": {
              "type": "array",
              "maxItems": 50,
              "items": {
                "$ref": "#/$defs/container"
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
            },
            "containers": {
              "type": "array",
              "maxItems": 50,
              "items": {
                "$ref": "#/$defs/container"
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

#### Scenario: SchemaIsTheContract
- **WHEN** a producer validates a document against the published schema and it passes
- **THEN** the application accepts that document without requiring anything the schema does not state

#### Scenario: ValidationMakesNoNetworkRequest
- **WHEN** the application validates an envelope
- **THEN** validation completes without retrieving a schema over the network

#### Scenario: EnvelopeIsRejectedAgainstThePublishedSchema
- **WHEN** a document omits a required field, carries an undeclared property, or exceeds a declared collection bound
- **THEN** it is rejected and no specialized presentation is produced

#### Scenario: DocumentsWithoutContainersAreUnaffected
- **WHEN** a document that declares no containers and no membership is validated
- **THEN** it is accepted exactly as it was before containers existed

### Requirement: SemanticValidationAfterSchemaValidation

The system SHALL perform deterministic semantic validation after schema validation, verifying that
element identifiers are unique within the envelope, that every relationship and message endpoint
resolves to a declared element, that every container identifier is unique within the envelope, that
every membership names a container the same envelope declares, that every row has one value per
declared column, that the declared kind agrees with the shape of the data, that a target and removals
appear only where permitted, that a removal names a kind of thing the declared data kind can contain,
and that no removal names a reference the same envelope also declares — a proposal that both changes
and removes the same thing states two intentions at once and SHALL be refused rather than resolved by
precedence.

Neither validation stage SHALL repair, complete, or guess at invalid data. A document that fails
either stage SHALL yield no structured result. In particular, a membership naming an undeclared
container SHALL NOT be dropped so that the rest of the document can render: silently ungrouping an
element misstates the system being described.

#### Scenario: SchemaValidButSemanticallyInvalidIsRejected
- **WHEN** a document passes schema validation but repeats an element identifier, names an endpoint that is not declared, declares a kind that disagrees with its data, or has a row whose length differs from its columns
- **THEN** it is rejected and no partial view is produced

#### Scenario: MembershipInAnUndeclaredContainerIsRejected
- **WHEN** an element or participant names a container the envelope does not declare
- **THEN** the document is rejected, rather than rendered with that element ungrouped

#### Scenario: RepeatedContainerIdentifierIsRejected
- **WHEN** two containers in one envelope declare the same identifier
- **THEN** the document is rejected

#### Scenario: ValidationNeverRepairs
- **WHEN** a document is invalid in a way that could be guessed at, such as a relationship endpoint close to a declared identifier
- **THEN** no correction is attempted and no structured result is produced

#### Scenario: ContradictoryProposalIsRefused
- **WHEN** a proposal declares a change to a reference and also declares that same reference removed
- **THEN** it is refused rather than resolved in favour of either intention

## ADDED Requirements

### Requirement: ContainersGroupWithoutMediating

A graph or a sequence MAY declare containers: named groups, each carrying an identifier scoped to the
envelope and a label, and optionally a kind. A container SHALL be declared once and referred to by its
members.

Membership SHALL live on the member. An element or a participant MAY name exactly one container, and
SHALL be understood as belonging to no container when it names none. A member SHALL NOT name more
than one container, which the single-valued field makes true by construction rather than by rule.

A container SHALL NOT contain another container in this version. Nesting is not expressed by any
other means in the meantime — a member names a container, never a chain of them.

A container SHALL group and SHALL NOT mediate. Relationships and messages connect elements, and they
SHALL be unaffected by grouping: an endpoint SHALL NOT name a container, and a relationship between
members of different containers SHALL be as ordinary as one within a single container. Removing every
container from a document SHALL leave the same elements connected the same way.

A container that no member names SHALL be valid. A producer builds a document incrementally, and a
proposal that adds a group before it adds anything to it is a coherent intention, not an error.

A proposal MAY change which container a member belongs to, in the same way it declares any other
change to that member.

#### Scenario: MembershipIsSingleValued
- **WHEN** an element declares the container it belongs to
- **THEN** it belongs to that one container, and there is no way for it to declare a second

#### Scenario: AnElementNeedNotBelongAnywhere
- **WHEN** a document declares containers and an element names none of them
- **THEN** the document is valid and that element belongs to no container

#### Scenario: RelationshipsCrossContainersFreely
- **WHEN** a relationship connects elements that belong to different containers
- **THEN** it is treated exactly as a relationship between two members of the same container

#### Scenario: ContainersCannotBeEndpoints
- **WHEN** a relationship or message names a container as an endpoint
- **THEN** the document is rejected, because a container identifier is not an element identifier

#### Scenario: AnEmptyContainerIsValid
- **WHEN** a document declares a container that no member names
- **THEN** the document is accepted

#### Scenario: AProposalMayMoveAMember
- **WHEN** a proposal declares that an existing element now belongs to a different container
- **THEN** that is presented as a change to that element, like any other declared change

### Requirement: ContainersArePerceptibleWithoutRestyling

Every declared container SHALL be perceptible in the rendering, including one that no member names,
and its label SHALL be shown. A reader SHALL be able to tell which container each member belongs to
from the rendering alone, without consulting the source document.

Containers SHALL NOT change how elements and relationships themselves are drawn. Adding a container
to a document SHALL leave every element and every relationship rendered as it was; grouping adds
geometry around them and takes none away.

In a graph, a container SHALL be drawn as an enclosure holding exactly its members, and every member
SHALL be laid out inside it.

In a sequence, a container SHALL be drawn as a header spanning the columns of its members, and the
column layout below that header — one column and one lifeline per participant, messages in declared
order — SHALL be unchanged. Because a header can only span adjacent columns, the view SHALL order
columns so that the members of a container are contiguous: walking participants in declared order,
the first time a member of a container is met, every member of that container is placed at that
point in its declared order; a participant belonging to no container keeps its place. Containers
therefore appear in order of first mention, and members keep the order they were declared in.

The textual equivalent SHALL state the container each element or participant belongs to, and SHALL
name every declared container including an empty one.

#### Scenario: EveryDeclaredContainerIsVisible
- **WHEN** a document declaring containers is rendered
- **THEN** each container appears with its label, including any container no member names

#### Scenario: GraphMembersAreDrawnInsideTheirContainer
- **WHEN** a graph declaring containers is rendered
- **THEN** every member is drawn within the enclosure of the container it names, and within no other

#### Scenario: SequenceKeepsItsColumnsAndGainsAHeader
- **WHEN** a sequence declaring containers is rendered
- **THEN** each participant still has one column and one lifeline, messages are still in declared order, and each container spans the columns of its own members

#### Scenario: InterleavedMembersAreOrderedContiguously
- **WHEN** a sequence declares participants whose containers alternate, such as a member of A, then a member of B, then another member of A
- **THEN** the columns are ordered so each container's members are adjacent, following order of first mention, and each container is drawn with a single header

#### Scenario: GroupingDoesNotRestyleWhatItGroups
- **WHEN** the same document is rendered with and without its containers declared
- **THEN** the elements and relationships are drawn the same way in both, and only the container geometry differs

#### Scenario: TextualEquivalentCarriesMembership
- **WHEN** the textual equivalent of a document declaring containers is produced
- **THEN** it names each container and states which one each element or participant belongs to
