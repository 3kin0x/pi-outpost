# Scenario-to-test matrix — add-dropped-file-upload

Every `#### Scenario:` in `openspec/changes/add-dropped-file-upload/specs/`, enumerated with
`rg '^#### Scenario:' openspec/changes/add-dropped-file-upload/specs/` (32 scenarios).

## `file` — UploadFileFromBrowser

| Scenario | Status | Test |
|---|---|---|
| UploadInsideWritableZone | covered | `server/test/fileBrowser.test.ts` — "stores a binary payload byte-identically and reports the written path"; the notification half in `server/test/file-upload.test.mjs` — "stores an uploaded file, answers with its path and tells open trees" (observer waits for `file_changed`) |
| UploadPreservesBinaryContent | covered | `server/test/fileBrowser.test.ts` — "stores a binary payload byte-identically…" (PDF header + NUL + high bytes, `deepEqual` on the bytes read back) |
| UploadOutsideWritableZone | covered | `server/test/fileBrowser.test.ts` — "refuses a read-only sandbox", "refuses a destination outside the writable zone" (both assert nothing was written) |
| UploadOutsideRoot | covered | `server/test/fileBrowser.test.ts` — "refuses a destination that climbs out of the root", "refuses a destination reached through a symlink out of the root" |
| UploadedNameIsNotAPath | covered | `server/test/fileBrowser.test.ts` — "refuses a name that is a route rather than a name" (empty, whitespace, `.`, `..`, `/`, `\`, control character; asserts no `sub` directory was created) |
| UploadedNameIsPortable | covered | `server/test/fileBrowser.test.ts` — "refuses names another platform would resolve to something else" (trailing dot, trailing space, `:`, `CON`, `con.txt`, `LPT1.pdf`, `nul`, 256-char name) |
| UploadDoesNotOverwrite | covered | `server/test/fileBrowser.test.ts` — "does not overwrite a taken name: it suffixes and reports what it wrote" (asserts the first file's content is intact and the returned path is the suffixed one) |
| UploadCreatesMissingDirectories | covered | `server/test/fileBrowser.test.ts` — "creates the destination directory when it does not exist" |
| UploadBeyondSizeLimit | covered | `server/test/fileBrowser.test.ts` — "refuses a wire payload longer than the base64 cap, before decoding it" and "refuses a payload whose decoded size exceeds the cap" (both assert nothing was written) |

## `api` — UploadFileMessage

| Scenario | Status | Test |
|---|---|---|
| UploadStoresFileAndReturnsPath | covered | `server/test/file-upload.test.mjs` — "stores an uploaded file, answers with its path and tells open trees" (correlates by request id, reads the bytes back off disk) |
| UploadedNameCollisionReportsWrittenPath | covered | `server/test/file-upload.test.mjs` — "answers a colliding name with the path it actually wrote" |
| UploadDestinationIsNotTheClientsChoice | covered | `server/test/file-upload.test.mjs` — "refuses a writable destination that is not the uploads directory"; the unit-level sweep in `server/test/fileBrowser.test.ts` — "refuses any destination but the uploads directory, even inside the writable zone" (zone root, sibling, nested, case-differing) |
| UploadRefusedCarriesReason | covered | `server/test/file-upload.test.mjs` — "refuses a destination outside the writable zone as denied", "refuses a destination that escapes the browser root", "refuses a name that is a path, and an undecodable body, as invalid", "refuses a payload past the cap as too-large", and "refuses every upload as denied" (read-only sandbox suite) |
| MaximumUploadSurvivesTheTransport | covered | `server/test/file-upload.test.mjs` — "answers a maximum-sized upload instead of closing the connection" (25 MiB payload answered under its request id; asserts the socket did not close) |
| WriteAndCreateAreUnchanged | covered | The pre-existing `write_file` / `create_file` tests are untouched and still pass: `server/test/fileBrowser.test.ts` (writeFileFromBrowser / createFileFromBrowser suites) and `server/test/file-lifecycle.test.mjs` |

## `composer-file-upload`

| Scenario | Status | Test |
|---|---|---|
| Dropped PDF becomes a path reference | covered | `ui/src/App.test.tsx` — "copies a dropped PDF into the workspace and references the path it wrote"; the no-bytes half in `ui/src/attachments.test.ts` — "uploads a PDF and attaches the written path instead of its bytes" (the only attachment produced is `kind: "path"`) |
| Attach button and drop behave alike | covered | `ui/src/App.test.tsx` — "produces the same attachment from the attach button as from a drop" |
| Image within the limit is shown to the model without a copy | covered | `ui/src/attachments.test.ts` — "attaches an image within the limit as bytes, with no copy in the workspace" (asserts the upload was never called); `ui/src/App.test.tsx` — "attaches a pasted image without copying it into the workspace" |
| Image within the limit survives a workspace that cannot be written | covered | `ui/src/attachments.test.ts` — "attaches an image's bytes even in a workspace that cannot be written" |
| Oversized image is referenced instead of refused | covered | `ui/src/attachments.test.ts` — "references an oversized image by path rather than refusing it" (asserts `errors` is empty) |
| Small text file is still inlined | covered | `ui/src/attachments.test.ts` — "converts text files to text attachments" (asserts the upload function was never called) |
| Large text file is referenced instead of refused | covered | `ui/src/attachments.test.ts` — "references text too large to inline instead of refusing it" and "refuses text past the upload cap against that cap, not the inline limit" |
| Unsupported binary names its own reason | covered | `ui/src/attachments.test.ts` — "names an unsupported binary's own type instead of the text limit" (asserts the message does *not* contain "512 KB") |
| Uploads directory is created on demand | covered | `server/test/fileBrowser.test.ts` — "creates the destination directory when it does not exist" (the destination is server-owned; the client only names it) |
| Colliding name does not overwrite | covered | `server/test/fileBrowser.test.ts` — "does not overwrite a taken name…"; the client-side half in `ui/src/attachments.test.ts` — "references the path the server wrote, not the name it was asked for" |
| Stored copy is byte-identical | covered | `server/test/fileBrowser.test.ts` — "stores a binary payload byte-identically…" |
| Read-only sandbox | covered | `ui/src/attachments.test.ts` — "reports a read-only workspace as such, leaving no attachment behind"; `ui/src/App.test.tsx` — "leaves no attachment and clears the pending chip when an upload fails" |
| File beyond the upload limit | covered | `ui/src/attachments.test.ts` — "rejects a file past the upload cap without reading or sending it" (asserts the upload was never attempted) and "reports the server's own size refusal" |
| Upload fails after it starts | covered | `ui/src/attachments.test.ts` — "reports a server-side upload failure without inventing a path"; `ui/src/App.test.tsx` — "leaves no attachment and clears the pending chip when an upload fails" |
| One failure does not sink the others | covered | `ui/src/attachments.test.ts` — "settles every file in a mixed drop: one refusal keeps the rest", "runs the uploads of a multi-file drop concurrently" and "keeps the batch alive when a file cannot be read at all"; across batches, `ui/src/App.test.tsx` — "keeps both refusals when two drops overlap" |
| Upload in progress is visible | covered | `ui/src/components/Composer.test.tsx` — "shows a chip for a file still being copied into the workspace"; `ui/src/App.test.tsx` — "shows a pending chip and blocks sending until the upload settles" |
| Submitting during an upload does not lose the attachment | covered | `ui/src/components/Composer.test.tsx` — "refuses to send while an upload is outstanding" (button disabled *and* Enter suppressed), "says why Enter did nothing, rather than swallowing it", and "sends the written path exactly once when the upload settles" |

## Verified in the running app

Driven through Playwright against a real server (`npm run dev --workspace web` against
`tsx server/src/index.ts`), reading the DOM, the filesystem and the session transcript:

- Dropped `Salon ALL AMERICAN.pdf` (600 KB, spaces in the name) → chip
  `uploads/Salon ALL AMERICAN.pdf`; the file on disk has the same SHA-256 as the original.
- Sending that prompt: the agent called `pdf_extract` on `uploads/Salon ALL AMERICAN.pdf` and
  quoted the title back. The session transcript is 2.5 KB and contains no `%PDF` header and no
  padding run — the bytes never travelled.
- An 80 B PNG arrived as image bytes; an 8 MB PNG arrived as `uploads/huge.png` with no error.
  Both are on disk.
- `archive.zip` was refused as "unsupported file type (application/zip)" — not the text limit.
- Two `notes.docx` drops produced `uploads/notes.docx` and `uploads/notes-1.docx`, both shown in
  the tree.
- With `allowWrite: false`, a dropped PDF reported "cannot upload — the workspace is read-only"
  and left no attachment.

Re-run after the code-review follow-up (section 8bis), against a workspace with an empty `uploads/`:

- A dropped PNG produced an image chip and **nothing in `uploads/`** — the copy that used to be
  written on every paste is gone.
- A 600 KB `server.log`, previously refused against the 512 KB inline limit, arrived as
  `uploads/server.log` with no error.
- `CON.pdf` was refused as `"CON.pdf" is a reserved device name`.

Two of the follow-up fixes have no deterministic test: the exclusive temp-file creation (8bis.1/.2)
and the re-confinement after `mkdir -p` (8bis.3) both guard races that cannot be triggered from a
test without a seam in production code. They were verified by inspection; the existing confinement
tests around them still pass.
