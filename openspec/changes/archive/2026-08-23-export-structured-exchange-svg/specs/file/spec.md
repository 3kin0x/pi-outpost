## ADDED Requirements

### Requirement: StructuredExchangeDocumentsArePreviewedAsWhatTheyDescribe

A file in the workspace whose content is a structured-exchange document SHALL be displayed by the
full-size viewer as the rendering that document describes, rather than as the JSON it is written in.

Recognition SHALL be by the document's own declared schema identity and not by its file name: a file
is a structured-exchange document because it says it is one, and any other JSON file SHALL keep the
display it has today.

The rendering SHALL be the same rendering a structured exchange receives anywhere else in the
application, with the same narrowing and the same export, so that a reader who narrowed a diagram in
a conversation finds the same control over a file.

The document as written SHALL stay one action away, as raw output stays reachable from a structured
presentation elsewhere.

A file that declares the schema but does not satisfy it SHALL be reported as a document that failed
validation, naming what failed, and SHALL remain readable as its own text. A file declaring a schema
version the application does not support SHALL fall back to that same text rather than attempt a
rendering.

A document too large for the viewer to fetch SHALL be reported as too large, naming the limit, and
SHALL NOT be reported as invalid — the document is not at fault.

#### Scenario: ADocumentFileOpensAsADiagram
- **WHEN** a file whose content declares a supported structured-exchange schema is opened in the viewer
- **THEN** it is displayed as the rendering that document describes

#### Scenario: RecognitionIsByContentNotByName
- **GIVEN** two files with the same extension, one declaring the schema and one not
- **WHEN** each is opened
- **THEN** only the one declaring the schema is rendered as a diagram, and the other is displayed as it is today

#### Scenario: TheReaderKeepsTheSameControls
- **WHEN** a structured-exchange document file is displayed
- **THEN** the reader can narrow it by kind and export the figure, exactly as in a conversation

#### Scenario: TheDocumentItselfStaysReachable
- **WHEN** a structured-exchange document file is displayed as a rendering
- **THEN** the document as written is one action away

#### Scenario: AnInvalidDocumentIsSaidToBeInvalid
- **WHEN** a file declares the schema but fails validation
- **THEN** the viewer says what failed and the file remains readable as text

#### Scenario: AnUnsupportedVersionFallsBackToText
- **WHEN** a file declares a schema version the application does not support
- **THEN** no rendering is attempted and the file remains readable as text

#### Scenario: TooLargeIsNotTheSameAsInvalid
- **WHEN** a valid document exceeds what the viewer may fetch
- **THEN** the viewer reports the size limit it hit, and does not report the document as invalid
