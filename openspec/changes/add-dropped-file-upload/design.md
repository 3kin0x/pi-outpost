## Context

See proposal.md — Why. What shapes the approach:

- `filesToAttachments` (`ui/src/attachments.ts`) is a pure, synchronous-ish transform over `File`
  objects. It has no server access, which is precisely why it cannot do anything but inline bytes.
  Adding an upload makes it network-dependent, and its callers — `attachFiles` in `ui/src/App.tsx`
  and the composer's file input — must carry the resulting latency and failure.
- The server already refuses binary writes on purpose: `writeFileFromBrowser` rejects NUL bytes,
  caps at `MAX_PREVIEW_BYTES` (1 MiB), demands the file already exist, and checks an mtime. Every
  one of those guards is wrong for an upload, so this is a new operation, not a flag on the old one.
- The confinement primitives to reuse are `resolveConfined` and `isWithin` (`server/src/sandbox.ts`,
  `server/src/fileBrowser.ts`), plus the `writableRoot` resolution the write path already performs.
- File-browser requests are correlated by a `requestId` the client mints and the server echoes;
  errors come back as file-browser errors carrying that id. `file_changed` broadcasts keep open
  trees fresh.
- The agent-side contract is `hasPathExtractionTool` (`ui/src/util/workspacePath.ts`) plus the
  PDF-specific path route and `pathAttachment`. That inventory covers `.docx`, `.xlsx` and `.pptx`
  since `add-pptx-extraction` registered `pptx_extract`. Extraction-tool limits default to 25 MiB
  (`DEFAULT_PDF_MAX_BYTES` and siblings in `server/src/config.ts`).

## Goals / Non-Goals

**Goals:**

- One upload operation, reused by both entry points (drop and attach button).
- Confinement and permission decided on the server, never inferred in the browser.
- The client references the path the server wrote, never the path it asked for.

**Non-Goals:**

- Chunked or resumable uploads. One message, one file, capped.
- Uploading a directory, or handling a drop of a folder.
- Garbage-collecting the uploads directory. Files stay until the user deletes them; they are
  ordinary workspace files with an ordinary tree row.
- Making the uploads location configurable in this change.

## Decisions

**Base64 over a binary frame.** The WebSocket protocol is JSON throughout (`shared/src/protocol.ts`);
a binary frame would need a parallel framing and correlation scheme for one message. Base64 costs
33% on the wire for a payload that is already bounded. *Alternative considered*: a plain HTTP
`POST /files/upload` — closer to the metal and no base64, but it needs its own auth/CORS story
alongside the WebSocket's, and the client would still need the write to be announced to open trees.
Rejected as a larger surface for a smaller gain.

**Upload cap of 25 MiB raw.** Matches `DEFAULT_PDF_MAX_BYTES` / docx / xlsx / pptx: a document the agent's
tools can read must be one the upload accepts, or the feature has a hole in the middle. Base64 makes
that ~34 MiB on the wire, so `@fastify/websocket` must be registered with an explicit `maxPayload`
above that — the default is far below it, and an exceeded default closes the socket rather than
answering, which is the one failure the composer cannot report. The cap is checked twice: in the
browser before reading the file (fast, and avoids a pointless 34 MiB send) and on the server before
decoding (authoritative).

**A dedicated `uploads/` directory under the writable root, not the tree's current directory.**
A dropped file is not a statement about where in the project it belongs; scattering desktop files
into source directories is worse than a predictable location. Not dot-prefixed: `.`-prefixed entries
are skipped by file search (`server/src/fileBrowser.ts`), and a file the agent is meant to find
should be findable. *Alternative considered*: per-session subdirectories — better isolation, but it
needs a session identity in the upload path and leaves empty directories behind; a flat `uploads/`
is enough until the clutter is real.

**Collision handled by suffixing, server-side.** `report.pdf` → `report-1.pdf`. The server owns the
name because only the server can check the filesystem without a race, and it returns the written
path. The client attaches what came back. A supplied name must already be one safe segment:
separators, `.`, `..`, control characters, and blank names are refused as invalid. This preserves
the established file-creation contract rather than silently changing what the user named.

**Images are uploaded *and* attached as bytes under the limit.** The model cannot see a path, and
the agent cannot supply image bytes itself — that is why `imagePreviewToAttachment` exists. The
workspace copy stays available to the user and can be attached by path later; the current prompt
uses its image bytes. Above 7 MB the bytes are dropped and only the path reference remains, which turns
today's outright rejection into a degraded success. The two attachments must not both mention the
path, or the prompt would carry the file twice — the image attachment stays the bytes-only kind it
is today, and the path reference is added separately only when bytes are absent.

**Classification lives in the browser, enforcement on the server.** `filesToAttachments` decides
*what a file should become* from its MIME type and extension; the server decides *whether it may be
written*. A misclassification therefore produces a wrong attachment kind, never a write outside the
sandbox.

**`attachFiles` becomes a settle-all, not a fail-fast.** Several files can be dropped at once and one
refusal must not discard the rest, so uploads run concurrently and results are partitioned into
attachments and errors — the shape `filesToAttachments` already returns.

**In-flight uploads block submission rather than being dropped.** The composer's submit already
composes from `attachments`; an attachment that has not resolved is simply absent, which would
silently send a prompt about a file the agent cannot see. Track pending uploads and disable submit
while any is in flight, with a visible pending chip.

## Risks / Trade-offs

- **A 34 MiB JSON frame is a memory spike on the server** (base64 string + decoded Buffer, both
  live at once) → cap enforced before decoding; reject on `content.length` first, which bounds the
  Buffer allocation.
- **Raising `maxPayload` raises what an unauthenticated-adjacent client can push** → the cap is a
  single explicit number, and the sandbox's `allowWrite: false` still refuses the write outright;
  the frame limit is the only thing that changes, not who may write.
- **Uploads accumulate in the workspace** → they are ordinary files in a visible directory, deletable
  from the tree; no hidden state. Called out as a Non-Goal rather than half-solved.
- **The agent may still fail to read an uploaded document** (a corrupt PDF, an unsupported variant)
  → out of scope here; the upload succeeded and the failure surfaces as a tool error, which is the
  same path a workspace file already takes.
- **Latency on the attach path** where there was none → pending state is visible, and submission
  waits rather than losing the reference.
- **`filesToAttachments` is used elsewhere as a pure function** → the upload dependency is injected
  by the caller rather than imported, so its unit tests keep running without a socket.

## Migration Plan

No data migration. The new message is additive; older clients never send it. Rolling back removes
the operation and returns the old error text — files already uploaded remain as ordinary workspace
files and their `@path` references keep working.

## Open Questions

- Whether `uploads/` should later become configurable (`sandbox.uploadsDir`) or per-session. Both
  are additive and change no requirement in this change's specs.
