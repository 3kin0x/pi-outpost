## Why

Dropping a PDF on the chat fails with `Salon ALL AMERICAN.pdf: file too large (max 512 KB for text)`.
The message is misleading: `filesToAttachments` has only two branches — images become bytes, and
*everything else* is inlined as UTF-8 text when it fits under 512 KB. A PDF therefore fails twice
over: above the limit it is reported as oversized text, and below it `file.text()` finds a NUL byte
and it is rejected as "unsupported binary file". No PDF, `.docx`, `.xlsx` or `.pptx` can ever be
attached by drop or by the attach button, even though the agent has path-based tools that read
exactly those formats — `pdf_extract`, `docx_extract`, `xlsx_extract` and `pptx_extract`.

The gap is the missing step in between: a file dragged from the desktop has no path inside the
workspace, so there is nothing for a path reference to point at. Give it one.

## What Changes

- A new server operation copies a client-supplied file into a dedicated uploads directory inside
  the writable zone, and answers with the path it wrote. Unlike `write_file` it accepts binary
  content (base64), creates the file rather than requiring it to exist, and carries no mtime
  precondition — there is no concurrent editor to conflict with.
- Files dropped on the app, or chosen through the composer's attach button, are routed by type:
  - **Formats with a path-based extraction tool** (PDF, `.docx`, `.xlsx`, `.pptx`) are uploaded and
    attached as an `@path` reference. Their bytes never travel with the prompt.
  - **Images** are uploaded *and* attached as image bytes while they fit under the existing 7 MB
    image limit, so the model still sees them. Above that limit an image is no longer rejected: the
    upload stands on its own and it is attached as an `@path` reference.
  - **Small text files** keep today's inline behaviour, unchanged.
  - **Anything else** is still refused, but with a message that names the real reason instead of
    borrowing the text limit's.
- Attachment errors distinguish a refused type from a failed upload, and a failed upload never
  leaves a reference to a file that is not on disk.
- The uploads directory is created on demand; a name that already exists is disambiguated rather
  than overwritten.

Not breaking: every attachment kind the composer already produces keeps its meaning, and the
prompt-side contract (`composePrompt`, `@path` mentions) is untouched.

## Capabilities

### New Capabilities
- `composer-file-upload`: how a file supplied from outside the workspace — dropped on the app or
  chosen through the composer's attach button — reaches the agent: which types are uploaded, what
  attachment each becomes, where the copy lands, and how a refusal or a failure is reported.

### Modified Capabilities
- `api`: the WebSocket protocol gains an upload request and its result/error messages, alongside
  the existing `write_file` / `create_file` lifecycle messages.
- `file`: a new browser-side upload operation, confined to the writable zone, that accepts binary
  content and creates the directories it needs.

## Impact

- `ui/src/attachments.ts` — `filesToAttachments` splits into classification plus an upload step;
  new error text.
- `ui/src/App.tsx` — `attachFiles`/`handleDrop` become asynchronous over the upload round trip.
- `ui/src/components/Composer.tsx` — attach button feeds the same path; in-flight upload state.
- `ui/src/useAgent.ts` — request/response plumbing for the new message.
- `shared/src/protocol.ts` — new message types.
- `server/src/index.ts` — new case in `handleClientMessage`, size validation.
- `server/src/fileBrowser.ts` — `uploadFileFromBrowser`, confined by `resolveConfined`/`isWithin`.
- Sandboxes with `allowWrite: false` cannot accept uploads at all; the refusal must be legible in
  the composer rather than silent.
- `.pptx` is an extractable uploaded document because `add-pptx-extraction` registered
  `pptx_extract` and added `.pptx` to `hasPathExtractionTool`.
