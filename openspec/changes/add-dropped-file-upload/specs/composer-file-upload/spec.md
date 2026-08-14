## Purpose

Gets a file that lives outside the workspace — dragged from the desktop or picked through the
composer's attach button — into the agent's reach. A document the agent can read at a path is
copied into the workspace and referenced by path rather than inlined, so a PDF costs the prompt
a filename instead of a megabyte.

## ADDED Requirements

### Requirement: Route a supplied file by what the agent can do with it

The system SHALL classify every file supplied from outside the workspace — whether dropped on the
application or chosen through the composer's attach button — and SHALL treat both sources
identically.

A file whose type has a path-based extraction tool (PDF, `.docx`, `.xlsx`, `.pptx`) SHALL be copied
into the workspace and attached as a path reference. Its bytes MUST NOT travel with the prompt.

An image SHALL be copied into the workspace, and SHALL additionally be attached as image bytes when
it is within the image attachment limit, because the agent cannot hand image bytes to the model on
its own. An image beyond that limit SHALL be attached as a path reference rather than refused.

A text file within the inline text limit SHALL continue to be attached as inline text, without
being copied into the workspace.

Any other file SHALL be refused with a message naming its own reason. A refusal MUST NOT report a
binary file as oversized text.

#### Scenario: Dropped PDF becomes a path reference
- **WHEN** the user drops a PDF no larger than the maximum upload size on the application
- **THEN** the file is copied into the workspace, the composer holds a removable attachment for the
  copy's path, the sent prompt mentions that path, and the PDF's bytes are not part of the prompt

#### Scenario: Attach button and drop behave alike
- **WHEN** the user chooses a `.docx` file through the composer's attach button
- **THEN** the resulting attachment is the same path reference a drop of that file produces

#### Scenario: Image within the limit is both copied and shown to the model
- **WHEN** the user drops an image no larger than the image attachment limit
- **THEN** the file is copied into the workspace and the composer holds an image attachment
  carrying its bytes

#### Scenario: Oversized image is referenced instead of refused
- **WHEN** the user drops an image larger than the image attachment limit
- **THEN** the file is copied into the workspace and attached as a path reference, and no
  size-related error is reported

#### Scenario: Small text file is still inlined
- **WHEN** the user drops a text file within the inline text limit
- **THEN** its content is attached inline and no copy is made in the workspace

#### Scenario: Unsupported binary names its own reason
- **WHEN** the user drops a file that is neither an image, nor a text file within the inline limit,
  nor a format with a path-based extraction tool
- **THEN** the composer reports that the file's type is not supported, and does not report it as
  exceeding the text limit

### Requirement: Copy supplied files into a dedicated uploads location

The system SHALL write every copied file into a directory reserved for uploads inside the writable
zone, creating that directory when it does not yet exist. It MUST NOT overwrite an existing file:
when the supplied name is already taken, the system SHALL store the copy under a distinct name and
SHALL reference the name it actually wrote.

The stored file SHALL be byte-identical to the file the user supplied.

#### Scenario: Uploads directory is created on demand
- **WHEN** the first file is uploaded into a workspace that has no uploads directory
- **THEN** the directory is created and the file is written inside it

#### Scenario: Colliding name does not overwrite
- **GIVEN** the uploads directory already holds a file with the supplied name
- **WHEN** the user supplies another file with that same name
- **THEN** the existing file is left untouched, the new file is stored under a distinct name, and
  the attachment references the name that was written

#### Scenario: Stored copy is byte-identical
- **WHEN** a binary file is uploaded
- **THEN** the bytes on disk match the supplied file exactly, with no text decoding applied

### Requirement: Refuse an upload the workspace cannot accept

The system SHALL refuse an upload the workspace cannot take, and SHALL report the refusal in the
composer rather than failing silently. Refusal reasons SHALL cover a read-only sandbox, a file
beyond the maximum upload size, and a rejection from the server.

An upload that does not complete MUST NOT leave an attachment behind: the composer SHALL NOT hold a
reference to a path that was never written.

#### Scenario: Read-only sandbox
- **GIVEN** a sandbox that does not allow writes
- **WHEN** the user drops a PDF
- **THEN** no attachment is added and the composer reports that the workspace is read-only

#### Scenario: File beyond the upload limit
- **WHEN** the user supplies a file larger than the maximum upload size
- **THEN** no attachment is added and the composer reports the size limit that was exceeded

#### Scenario: Upload fails after it starts
- **WHEN** the server refuses or fails an upload that has already begun
- **THEN** the composer holds no attachment for that file and reports the failure

#### Scenario: One failure does not sink the others
- **GIVEN** the user supplies several files at once and one of them is refused
- **THEN** the accepted files are attached and only the refused file is reported as an error

### Requirement: Keep the composer usable while an upload is in flight

The system SHALL indicate that a supplied file is being uploaded, and SHALL NOT send a prompt whose
attachments are still incomplete: submitting while an upload is in flight SHALL wait for it or be
prevented, never silently drop the attachment.

#### Scenario: Upload in progress is visible
- **WHEN** a large file is being uploaded
- **THEN** the composer shows that an attachment is still being prepared

#### Scenario: Submitting during an upload does not lose the attachment
- **WHEN** the user submits while an upload is in flight
- **THEN** the sent prompt either includes the finished reference or submission is held until the
  upload settles; the reference is never omitted without an error
