## ADDED Requirements

### Requirement: FileTree lifecycle controls

`FileTree` SHALL expose callbacks for opening a file natively, renaming a file, deleting a file, moving a writable file to a directory, and copying a read-only file to a writable directory; it SHALL not perform filesystem operations itself. For a writable file, it SHALL expose rename and delete controls following the tree's existing hover/touch convention. Submitting a blank inline rename SHALL cancel the edit, restore the existing row, and report no rename request. It SHALL show a confirmation naming the target file before reporting a delete request, and cancellation SHALL report no request. It SHALL make a regular file row draggable and accept it only on a directory row that is a valid writable destination, reporting a move for a writable source and a copy for a read-only source. It SHALL expose native opening for any listed file inside the browser root, including a read-only file.

Every truncated file or directory label SHALL expose its complete entry name through the same hover tooltip convention used by the Git tree.

#### Scenario: Cancel a blank file rename
- **GIVEN** a writable file whose inline rename field is open
- **WHEN** the user clears the field and submits it
- **THEN** `FileTree` reports no rename request and restores the existing file row without an error

#### Scenario: Confirm a file deletion
- **GIVEN** a writable file in `FileTree`
- **WHEN** the user chooses delete and confirms the dialog
- **THEN** `FileTree` reports one delete request for that file through its callback

#### Scenario: Cancel a file deletion
- **WHEN** the user cancels the deletion confirmation
- **THEN** `FileTree` reports no delete request and keeps the file row displayed

#### Scenario: Drag a file onto a writable folder
- **GIVEN** a file row and a writable destination directory row
- **WHEN** the user drops the file row on that directory
- **THEN** `FileTree` reports the source file and destination directory through its move callback

#### Scenario: Drag a read-only file onto a writable folder
- **GIVEN** a read-only regular file row and a writable directory row
- **WHEN** the user drops the file row on that directory
- **THEN** `FileTree` reports the source file and destination directory through its copy callback and indicates a copy drag effect

#### Scenario: Do not accept an invalid drop destination
- **GIVEN** a file row and a read-only directory row
- **WHEN** the user attempts to drop the file on that directory
- **THEN** `FileTree` does not report a move request

#### Scenario: Open a read-only file natively
- **GIVEN** a read-only file row
- **WHEN** the user activates its native-open control
- **THEN** `FileTree` reports the file path through its native-open callback

#### Scenario: Reveal a truncated entry name
- **GIVEN** a file or directory name is too long for the fixed-width Files panel
- **WHEN** the user hovers the truncated label
- **THEN** the browser tooltip exposes the complete entry name
