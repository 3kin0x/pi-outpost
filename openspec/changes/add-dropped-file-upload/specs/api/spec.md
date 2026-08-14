## ADDED Requirements

### Requirement: UploadFileMessage

The WebSocket protocol SHALL carry an `upload_file` client message naming a destination directory
relative to the browser root, the file's name, its content as base64, and a request id. Base64 is
required because the payload is binary: a UTF-8 encoded body cannot carry a PDF or an image
unchanged.

The server SHALL answer a successful upload with the browser-root-relative path it actually wrote,
under the request id — the client cannot assume the requested name survived a collision, and needs
the written path to reference the file.

A refusal SHALL be reported as a file-browser error carrying the request id and a machine-readable
reason from the extended file-browser error set: `denied` for a read-only sandbox or a destination outside the
writable zone, `outside-root` for a path that escapes, `too-large` for a payload beyond the upload
size limit, and `invalid` for a malformed name or an undecodable body.

This message SHALL NOT relax `write_file` or `create_file`. Unlike `write_file` it carries no mtime
precondition and creates rather than replaces; unlike `create_file` it carries content and MAY
create the destination directory. It is a distinct intent with its own message.

The server SHALL accept a WebSocket frame large enough to carry the maximum upload at its base64
size. An upload within the declared limit MUST NOT be dropped by a transport-level frame limit,
because a connection torn down mid-upload reports nothing the client can show the user.

#### Scenario: UploadStoresFileAndReturnsPath
- **WHEN** a client sends `upload_file` with base64 content for a destination inside the writable zone
- **THEN** the file is written and the client receives the browser-root-relative path under that request id

#### Scenario: UploadedNameCollisionReportsWrittenPath
- **GIVEN** a file with the requested name already exists at the destination
- **WHEN** a client sends `upload_file` for that name
- **THEN** the answer carries the distinct path the server actually wrote, not the requested one

#### Scenario: UploadRefusedCarriesReason
- **WHEN** an upload is refused because the sandbox is read-only, the destination is outside the writable zone, the path escapes the root, the payload exceeds the size limit, or the body is not decodable base64
- **THEN** the client receives a file-browser error under that request id with the matching reason

#### Scenario: MaximumUploadSurvivesTheTransport
- **WHEN** a client sends `upload_file` carrying the largest permitted payload
- **THEN** the server processes it and answers under the request id, rather than closing the connection

#### Scenario: WriteAndCreateAreUnchanged
- **WHEN** `write_file` or `create_file` is used as before
- **THEN** their preconditions and refusals are exactly as they were
