## ADDED Requirements

### Requirement: UploadFileFromBrowser

The system SHALL store a file supplied by the browser under exactly the permission rules that
govern a write: refused when the sandbox is read-only, refused when the resolved destination —
symlinks included — falls outside the writable zone, and refused when it falls outside the browser
root.

The content SHALL be written as bytes decoded from base64, not as text. A binary payload MUST be
stored unchanged: the NUL-byte rejection that guards text writes SHALL NOT apply here, because
storing a PDF is the point of the operation.

The stored size SHALL be capped at the maximum upload size, and the cap SHALL be enforced before
the payload is materialised on disk. The cap SHALL be at least as large as the largest document the
path-based extraction tools accept, so a file the agent could read is never rejected at the door.

The final segment SHALL be a name, not a route: a segment containing a path separator, or equal to
`.` or `..`, SHALL be refused, as SHALL an empty or whitespace-only name. The system SHALL not
rewrite a supplied name before storing it.

An existing path SHALL NOT be overwritten. The system SHALL pick a distinct name and SHALL report
the path it wrote. Missing directories in the destination SHALL be created.

The write SHALL be atomic: an interruption MUST NOT leave a truncated file where the reported path
points. On success the system SHALL report the written path and SHALL notify connected clients that
the tree changed, so every open tree shows the upload.

#### Scenario: UploadInsideWritableZone
- **WHEN** an upload is requested for a destination inside the writable zone
- **THEN** the file exists at the reported path with the supplied bytes, and connected clients are notified

#### Scenario: UploadPreservesBinaryContent
- **WHEN** the supplied content is binary, such as a PDF
- **THEN** the bytes on disk match the supplied bytes exactly and the write is not refused for containing NUL

#### Scenario: UploadOutsideWritableZone
- **WHEN** the destination is outside the writable zone, or the sandbox is read-only
- **THEN** it is refused as denied and nothing is written

#### Scenario: UploadOutsideRoot
- **WHEN** the destination resolves outside the browser root, by traversal or through a symlink
- **THEN** it is refused and nothing is written

#### Scenario: UploadedNameIsNotAPath
- **WHEN** the supplied name contains a path separator, or is `.`, `..`, empty, or whitespace only
- **THEN** it is refused as invalid, and nothing is written outside the destination directory

#### Scenario: UploadDoesNotOverwrite
- **GIVEN** a file already at the requested path
- **WHEN** an upload is requested for that name
- **THEN** the existing file is untouched, the upload is stored under a distinct name, and that path is reported

#### Scenario: UploadCreatesMissingDirectories
- **WHEN** the destination directory does not exist inside the writable zone
- **THEN** it is created and the file is written inside it

#### Scenario: UploadBeyondSizeLimit
- **WHEN** the payload exceeds the maximum upload size
- **THEN** it is refused as too large and nothing is written
