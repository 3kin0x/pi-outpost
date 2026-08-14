## Purpose

Lets the agent read the text and declared tables of a workspace PowerPoint presentation without a
shell or external converter, while retaining slide order and safe resource bounds.

## ADDED Requirements

### Requirement: ExtractPptxContentTool

The system SHALL expose a tool that returns a workspace `.pptx` presentation as markdown. The tool
SHALL accept a path and an optional slide range. It SHALL return slides in their declared
presentation order, label each slide with its slide number, and use a slide's title when one is
declared so a later call can request a precise range.

Extraction SHALL read presentation markup locally. It MUST NOT fetch external resources, resolve
linked media, or execute embedded content. A path resolving — symlinks included — outside the
sandbox read zone SHALL be refused before the file is opened.

#### Scenario: ExtractPresentationInSlideOrder
- **WHEN** the tool is called on a readable presentation without a range
- **THEN** it returns the extractable content of its slides in the order the presentation declares,
  with each slide numbered

#### Scenario: ExtractSelectedSlides
- **WHEN** the tool is called with a slide range
- **THEN** it returns only the selected slides and does not read unselected slides into the result

#### Scenario: PathOutsideSandbox
- **WHEN** the tool targets a path that resolves outside the sandbox read zone
- **THEN** it reports access denied and reads no file

#### Scenario: NotAPresentation
- **WHEN** the tool is called on a non-PowerPoint or malformed PowerPoint file
- **THEN** it reports that the file is not a readable presentation rather than returning an empty result

#### Scenario: EncryptedPresentation
- **WHEN** the presentation is password-protected
- **THEN** the tool reports that reason rather than returning encrypted parts as text

### Requirement: SlideTextAndTablesPreserveDeclaredStructure

The system SHALL extract text-bearing shapes and declared tables from each slide. It SHALL preserve
their order in the slide's markup and render a declared table as a GitHub-flavoured markdown table.
Table-cell text MUST NOT be able to alter the table structure it occupies.

The system SHALL state when a readable presentation has no extractable slide text or tables. It
SHALL name unsupported visual-only content — including images, charts, diagrams, animations,
speaker notes, comments, and embedded media — rather than implying the extraction describes it.

#### Scenario: TextAndTableOnOneSlide
- **GIVEN** a slide containing text shapes and a declared table
- **WHEN** it is extracted
- **THEN** the text and table appear in their declared order, and the table has the rows and cells
  the presentation declares

#### Scenario: CellCannotBreakTheTable
- **GIVEN** a table cell containing a pipe or a backslash
- **WHEN** the table is returned as markdown
- **THEN** every returned row keeps the number of columns the table declares

#### Scenario: VisualOnlySlide
- **GIVEN** a readable slide whose content is only an image or chart
- **WHEN** it is extracted
- **THEN** the output reports that the slide has no extractable text and names the unread visual content

### Requirement: BoundedPptxExtraction

The system SHALL bound a normal extraction by both the number of slides and the markdown returned.
When either cap truncates the result, it SHALL state that truncation, name the slide range covered,
and explain how to request the remainder.

Before parsing, a file above the configured presentation size ceiling SHALL be refused. While
reading the Office archive, the total decompressed bytes, the entry count, and the parsing time
SHALL each be capped. Exceeding any cap SHALL fail with a reason rather than exhausting the process.

The tool SHALL support whole-presentation extraction and optional writing of that whole extraction
to a new path in the writable zone. An existing destination, a destination outside that zone, or
writes disabled SHALL be refused without writing anything.

#### Scenario: LongPresentationTruncated
- **GIVEN** a presentation beyond the normal per-call slide or output cap
- **WHEN** it is extracted without a slide range
- **THEN** it returns the covered slides, reports truncation, and names the remaining range

#### Scenario: OversizePresentationRefused
- **WHEN** a presentation exceeds the configured size ceiling
- **THEN** the tool refuses it before parsing and reports the limit

#### Scenario: CompressionBombRefused
- **GIVEN** a presentation archive whose entries expand beyond the decompression cap
- **WHEN** it is read
- **THEN** extraction stops and reports the exceeded decompression limit

#### Scenario: WholePresentationToFile
- **GIVEN** a new destination inside the writable zone
- **WHEN** whole-presentation extraction is requested with that destination
- **THEN** the complete extraction is written there and the tool returns its path, coverage, and an excerpt

#### Scenario: PresentationDestinationRefused
- **WHEN** the extraction destination already exists, is outside the writable zone, or writes are disabled
- **THEN** the tool refuses the request and writes nothing
