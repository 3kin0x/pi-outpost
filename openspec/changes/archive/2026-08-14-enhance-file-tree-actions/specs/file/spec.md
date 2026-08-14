## ADDED Requirements

### Requirement: File lifecycle operations are confined and permissioned

The system SHALL rename, delete, move, and copy an existing regular file only after resolving every supplied path with the file browser's symlink-safe confinement rules. Rename, delete, and move SHALL require the source to be inside the writable zone. Copy SHALL allow a confined read-only source because it leaves that source unchanged. Move and copy SHALL require the destination directory to be inside the writable zone. A rename name SHALL be one non-empty path segment other than `.` or `..`; rename, move, and copy SHALL refuse an existing destination and SHALL NOT overwrite it. Deletion SHALL target a regular file only. On success, the system SHALL notify connected clients of the affected tree paths.

#### Scenario: Rename a writable file
- **GIVEN** `draft.docx` is an existing regular file in a writable directory
- **WHEN** the browser requests its rename to `final.docx`
- **THEN** `final.docx` exists, `draft.docx` no longer exists, and connected clients are notified of the change

#### Scenario: Refuse a rename that would overwrite
- **GIVEN** `draft.docx` and `final.docx` already exist in the same writable directory
- **WHEN** the browser requests to rename `draft.docx` to `final.docx`
- **THEN** the request is refused as a conflict and both original files remain unchanged

#### Scenario: Refuse a mutation outside the writable zone
- **WHEN** a browser requests to rename, delete, or move a file outside the writable zone or while the sandbox is read-only
- **THEN** the request is refused as denied and no file is changed

#### Scenario: Refuse an escaping mutation path
- **WHEN** a rename, delete, or move source or destination escapes the browser root by traversal or symlink resolution
- **THEN** the request is refused and no file is changed

#### Scenario: Move a file into a folder
- **GIVEN** `inbox/report.docx` is writable and `archive` is an existing writable directory
- **WHEN** the browser requests to move `inbox/report.docx` to `archive`
- **THEN** `archive/report.docx` exists, the source no longer exists, and connected clients are notified of both affected tree branches

#### Scenario: Copy a read-only file into a writable folder
- **GIVEN** `reference/report.docx` is confined to the browser root but outside the writable zone, and `workspace/archive` is writable
- **WHEN** the browser requests to copy `reference/report.docx` to `workspace/archive`
- **THEN** the file exists at both paths, and connected clients are notified for the destination branch

### Requirement: Native file opening is confined

The system SHALL request that the host operating system open a selected existing regular file inside the browser root with its associated application. It SHALL invoke the platform launcher without a shell and with the validated absolute path as an argument. Native opening SHALL not require the file to be writable. If the path is outside the browser root, is not a regular file, or the platform launcher fails, the system SHALL report an error and SHALL not launch an application for an unvalidated path.

#### Scenario: Open a Word document natively
- **GIVEN** `report.docx` is an existing file inside the browser root and Word is its associated application
- **WHEN** the browser requests native opening for `report.docx`
- **THEN** the system asks the host platform to open that validated file with its associated application

#### Scenario: Refuse native opening outside the browser root
- **WHEN** the browser requests native opening for an absolute path outside the browser root or a traversal path
- **THEN** the request is refused and no platform launcher is invoked
