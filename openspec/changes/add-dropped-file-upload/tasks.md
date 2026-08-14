## 0. Prerequisite

- [x] 0.1 Apply `add-pptx-extraction` before enabling `.pptx` in the upload classifier. Done:
  `pptx_extract` is registered on both tool paths and `hasPathExtractionTool` recognises `.pptx`.

## 1. Server: upload operation

- [ ] 1.1 Add `MAX_UPLOAD_BYTES` (25 MiB raw) to `server/src/fileBrowser.ts` and an upload-name validator accepting exactly one safe segment (no separators, not `.`/`..`, no control characters, non-empty after trimming).
- [ ] 1.2 Implement `uploadFileFromBrowser(root, writableRel, destinationDir, name, base64)` in `server/src/fileBrowser.ts`: refuse `writableRel === null` as `denied`; resolve the destination with `resolveConfined` + `isWithin(writableRoot, …)`; `mkdir -p` the destination; reject `content.length` beyond the base64 equivalent of the cap *before* decoding; decode to a Buffer and reject beyond the raw cap; write atomically (tmp + rename) with no NUL check; return the browser-root-relative written path.
- [ ] 1.3 Resolve name collisions server-side by suffixing (`report.pdf` → `report-1.pdf`), preserving the extension, and return the path actually written.
- [ ] 1.4 Add `upload_file` to `shared/src/protocol.ts` (client message: `destinationDirectory`, `name`, `contentBase64`, `requestId`), extend `FileBrowserErrorReason` with `invalid`, and add a success answer carrying the written `path` under the request id.
- [ ] 1.5 Handle `upload_file` in `handleClientMessage` (`server/src/index.ts`): validate field types, call the operation, answer with the written path, map `FileBrowserError` to the existing file-browser error reasons (`denied`, `outside-root`, `too-large`, `invalid`), and broadcast `file_changed` for the written path.
- [ ] 1.6 Register `@fastify/websocket` with an explicit `maxPayload` above the base64 size of the cap (~34 MiB) so a maximum upload is answered rather than closing the socket.

## 2. Server tests

- [ ] 2.1 Test `uploadFileFromBrowser` writes a binary payload byte-identically (PDF header + NUL bytes survive) and returns the written path.
- [ ] 2.2 Test refusals: read-only sandbox, destination outside the writable zone, path escaping the root by traversal and through a symlink, payload beyond the cap, undecodable base64, and a name that is `.`, `..`, empty, or contains a separator.
- [ ] 2.3 Test that an existing file is not overwritten: the collision is stored under a distinct name and that name is what is returned.
- [ ] 2.4 Test the destination directory is created when absent.
- [ ] 2.5 Test the `upload_file` message end to end over the harness socket: success answer correlates by request id, refusals arrive as file-browser errors with the right reason, and `file_changed` is broadcast.
- [ ] 2.6 Test a payload at the declared maximum is answered rather than dropped by the frame limit.

## 3. Client: upload plumbing

- [ ] 3.1 Add an `uploadFile(name, contentBase64)` request to `ui/src/useAgent.ts` following the existing `requestId` correlation pattern, resolving with the written path and rejecting with the server's error reason.
- [ ] 3.2 Add the uploads destination constant (`uploads`, relative to the writable root) in one place shared by the callers.

## 4. Client: attachment routing

- [ ] 4.1 Split `filesToAttachments` (`ui/src/attachments.ts`) into classification (`classifyDroppedFile`: `image` | `extraction-tool` | `inline-text` | `unsupported`, from MIME type and extension via `hasPathExtractionTool`, which covers `.docx`, `.xlsx` and `.pptx`) and the attachment build, taking the upload function as an injected parameter so the pure tests keep running without a socket.
- [ ] 4.2 Route extraction-tool formats: upload, then attach the returned path with `pathAttachment` and `source: "manual"`. No bytes in the prompt.
- [ ] 4.3 Route images: upload, and additionally attach the image bytes when within `MAX_IMAGE_FILE_BYTES`; above the limit attach the returned path instead and report no size error. The image attachment and the path reference must never both be produced for the same file.
- [ ] 4.4 Keep inline text under `MAX_TEXT_FILE_BYTES` exactly as today, with no upload.
- [ ] 4.5 Replace the misleading fallback error: an unsupported binary reports its own reason, never the text limit. Add distinct messages for a read-only sandbox, the upload size cap, and a server-side failure.
- [ ] 4.6 Run uploads concurrently over a multi-file drop and settle all of them, partitioning results into `attachments` and `errors` so one refusal does not discard the rest.
- [ ] 4.7 Enforce the size cap in the browser before reading the file, so an oversized file is refused without a 34 MiB send.

## 5. Client: composer state

- [ ] 5.1 Track in-flight uploads in `ui/src/App.tsx` (`attachFiles` becomes async over the round trip) and pass pending state to `Composer`.
- [ ] 5.2 Render a pending attachment chip in `ui/src/components/Composer.tsx` and disable submit while any upload is in flight, so a reference is never silently omitted.
- [ ] 5.3 Ensure a failed upload leaves no attachment behind and clears its pending chip.
- [ ] 5.4 Route the composer's attach-button file input through the same path as the drop handler, so both produce identical attachments.

## 6. Client tests

- [ ] 6.1 Unit-test classification: PDF/docx/xlsx/pptx → extraction-tool, image types → image, small text → inline, everything else → unsupported.
- [ ] 6.2 Unit-test attachment building with a stub upload: path reference for a PDF (no bytes), bytes for an image within the limit, path reference for an image beyond it, inline text unchanged.
- [ ] 6.3 Unit-test error paths: read-only refusal, oversized file, upload rejection — each producing its own message and no attachment.
- [ ] 6.4 Unit-test a mixed multi-file drop: accepted files attached, refused file reported alone.
- [ ] 6.5 Component-test that submit is disabled while an upload is pending and that the composed prompt mentions the written path once.
- [ ] 6.6 Component-test that the attach button and a drop produce the same attachment for the same file.

## 7. Verify in the running app

- [ ] 7.1 Start the app and drop the PDF from the original report (>512 KB, spaces in the name); confirm via the DOM that a path attachment appears, and via the filesystem that `uploads/` holds the byte-identical file.
- [ ] 7.2 Send that prompt and read the session transcript: the agent's PDF tool reads the uploaded path, and the prompt carries no PDF bytes.
- [ ] 7.3 Drop an image under 7 MB and one over it; confirm the first is visible to the model as bytes and the second arrives as a path reference with no error.
- [ ] 7.4 Drop an unsupported binary and confirm the error names its type, not the 512 KB text limit.
- [ ] 7.5 Drop two files with the same name and confirm the second lands under a distinct name with the tree showing both.
- [ ] 7.6 Run the app with `allowWrite: false` and confirm a dropped PDF reports a read-only workspace instead of failing silently.

## 8. Close out

- [ ] 8.1 Build the scenario-to-test matrix over every `#### Scenario:` in `openspec/changes/add-dropped-file-upload/specs/` (verify the list with `rg '^#### Scenario:' openspec/changes/add-dropped-file-upload/specs/`) and classify each as covered/partial/uncovered with its test name.
- [ ] 8.2 Run the focused tests, then the server and UI suites, then `openspec validate add-dropped-file-upload --strict`.
