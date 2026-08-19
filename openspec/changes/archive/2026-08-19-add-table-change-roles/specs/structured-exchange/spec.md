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

Containers, membership, and a table row's declared role are optional additions to this version
rather than a new one. Every document valid before them SHALL remain valid, a document that declares
none of them SHALL be indistinguishable from one written before they existed, and a table row SHALL
remain expressible as a bare array of cells. This is only sound while no consumer outside this
repository holds a copy of the contract; once one does, an addition of this kind SHALL take a new
version instead, because a published identifier that changes meaning is not an identifier.

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
    },
    "cells": {
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
                "oneOf": [
                  {
                    "$ref": "#/$defs/cells"
                  },
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "cells"
                    ],
                    "properties": {
                      "cells": {
                        "$ref": "#/$defs/cells"
                      },
                      "role": {
                        "enum": [
                          "added",
                          "changed",
                          "context",
                          "removed"
                        ]
                      }
                    }
                  }
                ]
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

#### Scenario: ARowWrittenBeforeRolesExistedIsStillAccepted
- **WHEN** a table declares its rows as bare arrays of cells, as every document did before roles existed
- **THEN** it is accepted exactly as it was before roles existed

### Requirement: OnlySomeKindsMayBeProposed

The supported kinds SHALL be a graph, a sequence, and a table. A graph SHALL declare elements and
directed relationships between them; a sequence SHALL declare participants and ordered messages
between them; a table SHALL declare columns and rows aligned to those columns.

A graph and a sequence SHALL be permitted to name a target and declare removals. A table SHALL NOT:
it is a projection over something else, and cannot be applied. An envelope declaring a table with a
target or a removal SHALL be rejected.

A table SHALL nevertheless be permitted to report, per row, the role that row plays in a change it
projects. Reporting a role SHALL NOT make the table a proposal: no approval, application or handover
path SHALL treat a table as something that can be applied, whatever roles its rows declare.

#### Scenario: TableCarryingATargetIsRejected
- **WHEN** an envelope declares a table together with a target or a removal
- **THEN** it is rejected and no specialized presentation is produced

#### Scenario: TableIsStillRenderedAndReadable
- **WHEN** an envelope declares a table with no target
- **THEN** it is rendered with its declared columns and rows

#### Scenario: TableReportsRolesWithoutBecomingAProposal
- **WHEN** an envelope declares a table whose rows carry roles, and no target
- **THEN** it is accepted, and it is not offered for approval or application

### Requirement: NativeRenderingFromValidatedData

For a validated graph, the system SHALL render every declared element and directed relationship from
the validated data, preserving labels and direction. For a validated sequence, it SHALL render every
participant and message in declared order, preserving direction and label. For a validated table, it
SHALL render columns in declared order and every cell in its corresponding row position.

The system SHALL NOT infer elements, relationships, messages, labels, or meaning from diagram syntax
or from any accompanying text. Layout MAY choose geometry for readability, and geometry SHALL NOT be
presented as data. A document whose relationships form cycles SHALL be laid out at a size proportional
to what it contains, and SHALL NOT be rendered at a scale that makes it illegible.

Producer-supplied text SHALL be rendered as text and never as markup. Every view SHALL expose an
accessible textual equivalent of what it displays.

The textual equivalent SHALL carry everything the visual rendering carries: every element,
participant, relationship and message, including any nothing connects to; every declared kind; every
addition, change and removal; and, for a table, the role each row declares. Where the visual
rendering and the textual equivalent name the same thing, they SHALL name it the same way.

#### Scenario: GraphPreservesDeclaredRelationships
- **WHEN** a valid graph is rendered
- **THEN** exactly the declared elements and directed relationships are displayed

#### Scenario: ACyclicGraphIsStillLegible
- **WHEN** a graph whose relationships form feedback cycles is rendered
- **THEN** its extent stays proportionate to the number of elements it declares, and no element is drawn over another

#### Scenario: SequencePreservesDeclaredOrder
- **WHEN** a valid sequence is rendered
- **THEN** every message appears in its declared order and direction between declared participants

#### Scenario: TablePreservesDeclaredOrder
- **WHEN** a valid table is rendered
- **THEN** columns and each row appear in their declared order

#### Scenario: TheTextualEquivalentOmitsNothingVisual
- **WHEN** a graph or sequence carrying kinds, changes, removals, and a participant no message reaches is presented
- **THEN** the textual equivalent names all of them, using the same names the rendering displays

#### Scenario: ProducerTextRemainsInert
- **WHEN** a label or value contains markup-like text
- **THEN** it is displayed as text and is neither executed nor interpreted as markup

#### Scenario: TheTextualEquivalentOfATableNamesItsRoles
- **WHEN** a table whose rows declare roles is presented
- **THEN** the textual equivalent names each row's role, using the same names the rendering displays

### Requirement: ReaderMayAdjustAndNarrowTheView

A reader MAY adjust a rendering for legibility — repositioning what it draws, moving around it, and
narrowing it to selected kinds. For a table, the same narrowing SHALL be offered over the roles its
rows declare. Every kind and every role SHALL be shown by default, and the control SHALL be the key
itself, so what a reader reads a colour from is what they switch.

An adjustment SHALL be presentation only: it SHALL NOT alter the document, and SHALL NOT be carried
back to any authority.

While a rendering is narrowed, it SHALL state that it is showing less than the whole document, and
that statement SHALL be part of what an export carries — for a table, of its textual equivalent. For a proposal, the statement SHALL make
clear that what is hidden remains part of the proposal, and a hidden kind SHALL NOT be marked in a
way the same rendering uses for a removal.

#### Scenario: EverythingIsShownUntilTheReaderNarrowsIt
- **WHEN** a rendering that distinguishes kinds is first displayed
- **THEN** every element and relationship of the document is shown

#### Scenario: NarrowingIsReversibleAndDeclared
- **WHEN** a reader hides a kind
- **THEN** the rendering says what it is no longer showing, and offers to show everything again

#### Scenario: ANarrowedProposalStillSaysWhatItProposes
- **WHEN** a narrowed rendering of a proposal is exported
- **THEN** the exported figure states how much of the document it shows and that hidden kinds remain part of the proposal

#### Scenario: ElementAndRelationshipVocabulariesAreIndependent
- **WHEN** an element kind and a relationship kind share the same name and the reader hides one of them
- **THEN** only the one they hid is hidden

#### Scenario: AdjustmentDoesNotAlterTheDocument
- **WHEN** a reader repositions or narrows a rendering
- **THEN** the document recovered for handover is unchanged

#### Scenario: ATableNarrowsByRole
- **WHEN** a reader hides a role in a table that declares roles
- **THEN** only the rows declaring that role stop being shown, the rendering says what it is no longer showing, and it offers to show everything again

#### Scenario: AHiddenRoleIsNotARemovedRow
- **WHEN** a reader hides a role in a table that also declares removed rows
- **THEN** the hidden rows are absent rather than struck through, and the removed rows keep their own marking

## ADDED Requirements

### Requirement: TableRowsMayDeclareAChangeRole

A row of a table MAY declare the role it plays in the change the table projects: `added`, `changed`,
`context`, or `removed`. A row that declares no role SHALL read as `context` when any row of the same
table declares one, and as an ordinary row of data when none does — so a table that declares no role
anywhere SHALL be rendered exactly as it was before roles existed.

The rendering SHALL present each declared role distinguishably, and SHALL present a given role the
same way it is presented elsewhere in the application: a reader who has learnt what an addition looks
like in a graph SHALL recognise an added row without learning a second vocabulary. A removed row
SHALL be shown as struck through as well as tinted, so the distinction does not rest on colour alone.
A rendering carrying roles SHALL provide a key naming every role it shows. A table is rendered as text
rather than as a figure and is not exported as one, so the key SHALL be carried by the rendering
itself and by its accessible textual equivalent.

The colouring SHALL be derived only from the declared role. The system SHALL NOT infer a role from a
cell's value, from a column's name, or from any accompanying text — a producer's own "status" column
is data, and SHALL be rendered as data.

A declared role SHALL NOT be an instruction: it states what the producer observed in the authority it
projected, and nothing in this application SHALL act on it.

#### Scenario: DeclaredRolesAreVisiblyDistinct
- **WHEN** a table declares rows with the roles `added`, `changed`, `context` and `removed`
- **THEN** each is presented distinguishably from the others, and a removed row is struck through as well as tinted

#### Scenario: RolesReadTheSameWayAcrossKinds
- **WHEN** an added row and an added element are presented in the same session
- **THEN** they are marked as additions in the same way

#### Scenario: ARowWithoutARoleIsContextAmongRolesThatExist
- **WHEN** a table declares roles on some rows and not on others
- **THEN** a row without a declared role is presented as context, not as an addition

#### Scenario: ATableWithoutRolesIsUnchanged
- **WHEN** a table declares no role on any row
- **THEN** it is rendered as an ordinary table, with no role colouring and no key

#### Scenario: TheKeyNamesEveryRoleShown
- **WHEN** a table carrying roles is rendered
- **THEN** a key names every role present, and the textual equivalent names the same roles the same way

#### Scenario: StatusDataIsNotARole
- **WHEN** a table carries a column whose values are `added`, `removed` or similar, and no row declares a role
- **THEN** those values are rendered as data and no row is coloured as a change

#### Scenario: AnUnknownRoleIsRejected
- **WHEN** a row declares a role outside the defined set
- **THEN** the envelope is rejected and no specialized presentation is produced

#### Scenario: ARowObjectStillAlignsToItsColumns
- **WHEN** a row declaring a role carries more or fewer cells than the table declares columns
- **THEN** it is rejected, naming the row, the count of cells and the count of columns

### Requirement: ATableLeavesAsData

A graph and a sequence leave this application as a figure. A table SHALL leave it as
data: the reader SHALL be able to take the table away as a comma-separated file and
as a spreadsheet workbook, in a form a spreadsheet application opens without
repair.

An export SHALL carry what the reader is looking at: the declared columns in their
declared order, every row currently shown, and each cell's declared value — a
number as a number, an empty cell where the document declares null. Where rows
declare roles, the export SHALL carry each row's role as a column of its own, since
the colour that states it in the rendering cannot survive the crossing.

Where a rendering is narrowed, its export SHALL carry only the rows shown, and the
application SHALL say so at the moment of export rather than letting a reader
believe they took the whole table away.

#### Scenario: ATableIsTakenAwayAsCommaSeparatedValues
- **WHEN** a reader exports a table as comma-separated values
- **THEN** the file carries the declared columns and every shown row, with values that contain a separator, a quote or a newline quoted so the file parses back to what was displayed

#### Scenario: ATableIsTakenAwayAsAWorkbook
- **WHEN** a reader exports a table as a spreadsheet workbook
- **THEN** a spreadsheet application opens it without repair, with one sheet whose header row names the declared columns

#### Scenario: TheExportCarriesTheRolesTheColourCarried
- **WHEN** a table whose rows declare roles is exported in either form
- **THEN** each row's role travels as a value, using the same words the key displays

#### Scenario: ANarrowedTableExportsWhatItShows
- **WHEN** a reader hides a role and then exports the table
- **THEN** the export contains only the rows still shown, and the application states that the export is narrowed

#### Scenario: APlainTableExportsWithoutARoleColumn
- **WHEN** a table that declares no role is exported
- **THEN** the export carries exactly the declared columns, with no column the document did not declare
