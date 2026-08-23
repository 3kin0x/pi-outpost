## ADDED Requirements

### Requirement: AFigureLeavesAsOneFile

The system SHALL be able to export a rendered graph or sequence as a figure that is complete on its
own: it SHALL carry its own geometry, text and colour, and SHALL depend on no stylesheet, script,
font file or network resource of the application that produced it.

A figure SHALL contain no control the reader cannot use — nothing that exists only to support
pointing, dragging, hovering or selecting inside the application.

A figure SHALL show exactly what the rendering it was taken from shows. Where that rendering is
narrowed, the figure SHALL be narrowed identically and SHALL carry the statement
`ReaderMayAdjustAndNarrowTheView` requires of it, so that a figure separated from its document still
says how much of that document it shows.

#### Scenario: TheFigureStandsAlone
- **WHEN** a figure is exported and opened outside the application
- **THEN** it draws the same picture, with no reference to any resource of the application

#### Scenario: InteractionAffordancesDoNotTravel
- **WHEN** a figure is exported from a rendering that supports pointing and dragging
- **THEN** nothing that exists only for those interactions is present in the figure

#### Scenario: ANarrowedFigureSaysSo
- **GIVEN** a rendering narrowed to a subset of kinds
- **WHEN** it is exported
- **THEN** the figure shows exactly that subset and states how much of the document it is showing

### Requirement: AFigureCanBeProducedWithoutABrowser

The system SHALL be able to produce a figure from a validated document and a narrowing without a
browser, a display, or a running interface.

A figure so produced SHALL be the same figure the interactive rendering exports for the same
document and the same narrowing. "The same" means the same elements, relationships, messages,
containers, directions, order, labels, colours and geometry; it does not require the two byte
streams to be identical.

Production SHALL be deterministic: the same document and the same narrowing SHALL yield the same
figure every time.

A document that fails validation SHALL NOT yield a figure. The failure SHALL be reported with the
reason, as validation failures are reported elsewhere, and SHALL NOT produce an empty or partial
figure.

#### Scenario: TheSamePictureWithoutADisplay
- **GIVEN** a validated document and a narrowing
- **WHEN** a figure is produced with no browser present
- **THEN** it carries the same elements, relationships, order, labels and colours as the figure the interactive rendering exports for that document and that narrowing

#### Scenario: ProducingAFigureIsDeterministic
- **WHEN** a figure is produced twice from the same document and the same narrowing
- **THEN** both figures draw the same picture

#### Scenario: AnInvalidDocumentYieldsNoFigure
- **WHEN** a figure is requested for a document that fails validation
- **THEN** the request fails, names the reason, and writes nothing

### Requirement: TheAgentCanWriteAFigureToAPath

The system SHALL offer the agent a way to write a figure for a validated document to a path, so that
the agent can reference that figure from a document it is writing.

The request SHALL carry the document, the narrowing to apply, and the path to write. The narrowing
SHALL be expressed in the same terms a reader narrows by — hidden kinds, with element and
relationship vocabularies independent of each other — and an empty narrowing SHALL mean the whole
document, as it does for a reader.

Writing SHALL be confined exactly as every other agent write is confined: a path outside the
writable zone SHALL be refused, and refusal SHALL name the confinement rather than the underlying
filesystem error.

The result SHALL tell the agent what was written and how much of the document it shows, so that a
narrowing which selected nothing is visible as such rather than delivered as an empty picture.

#### Scenario: AFigureIsWrittenWhereTheAgentAsked
- **WHEN** the agent requests a figure for a validated document at a path inside the writable zone
- **THEN** the file is written at that path and contains that figure

#### Scenario: TheNarrowingIsTheReadersNarrowing
- **GIVEN** an element kind and a relationship kind that share a name
- **WHEN** the agent hides one of them
- **THEN** only the one named is hidden, exactly as it would be for a reader

#### Scenario: NoNarrowingMeansTheWholeDocument
- **WHEN** the agent requests a figure and names no hidden kind
- **THEN** every element and relationship of the document is drawn

#### Scenario: WritingOutsideTheWritableZoneIsRefused
- **WHEN** the agent requests a figure at a path outside the writable zone
- **THEN** the request is refused, the refusal names the confinement, and nothing is written

#### Scenario: TheResultSaysHowMuchItShows
- **WHEN** a figure is written from a narrowed document
- **THEN** the result states how much of the document the figure shows

#### Scenario: ANarrowingThatHidesEverythingIsReportedNotDrawn
- **WHEN** a narrowing leaves no element to draw
- **THEN** the result says so rather than reporting an empty figure as a success
