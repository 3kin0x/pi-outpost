## ADDED Requirements

### Requirement: File lifecycle messages

The WebSocket protocol SHALL carry correlated `open_native`, `rename_file`, `delete_file`, `move_file`, and `copy_file` client messages, each with a request id and browser-root-relative paths sufficient for its operation. A successful native-open SHALL acknowledge the request id; successful rename, delete, move, and copy SHALL return the resulting path or an equivalent acknowledgement under the request id. Refusals and launcher failures SHALL be reported as file-browser errors under the same request id with a machine-readable reason.

#### Scenario: Correlated move result
- **WHEN** a client sends `move_file` for a valid source file and destination directory
- **THEN** the server returns the moved file path or acknowledgement under that message's request id

#### Scenario: Correlated copy result
- **WHEN** a client sends `copy_file` for a confined source file and writable destination directory
- **THEN** the server returns the copied file path or acknowledgement under that message's request id

#### Scenario: Correlated lifecycle error
- **WHEN** a lifecycle operation is refused for a denied, conflicting, invalid, or escaping path
- **THEN** the client receives a file-browser error under its request id and can associate it with the initiating action
