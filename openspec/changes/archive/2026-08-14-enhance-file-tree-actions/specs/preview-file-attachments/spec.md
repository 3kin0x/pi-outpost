## ADDED Requirements

### Requirement: Automatically attach tool-readable binary selections

When selection of a confined binary file reaches the normal unsupported-preview result, the system SHALL add it to the composer automatically if an available path-based extraction tool supports its file type. It SHALL represent the selection as a path reference rather than file bytes, preserve manually added attachments, and replace any previous automatic preview attachment. A binary file without a matching extraction tool SHALL remain unattached.

#### Scenario: Tool-readable binary selection becomes a path reference
- **WHEN** a selected `.docx` or `.xlsx` file reports that binary preview is unsupported
- **THEN** the composer contains a removable attachment referencing the file's path, and the prompt carries an `@path` mention rather than the file's bytes

#### Scenario: Unsupported binary selection is not attached automatically
- **WHEN** a selected binary file has no available path-based extraction tool
- **THEN** the composer receives no automatic attachment for that file
