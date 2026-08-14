## Context

The file browser is a React interface backed by a typed WebSocket protocol to Fastify. Writes, creation, and previews are already confined to the browser root and, when the sandbox is enabled, to a writable zone. The new actions therefore cross the same shared contract, file service, message router, and `FileTree`.

## Goals / Non-Goals

**Goals:**

- Offer native opening, rename, confirmed deletion, and moving a file to a directory directly from the tree.
- Preserve existing confinement, permission, and multi-client synchronization guarantees.
- Maintain an accessible interface: keyboard controls, explicit deletion confirmation, and an unambiguous drop target.

**Non-Goals:**

- Handle directories (rename, delete, or move), moving by copy/paste, or uploading from the OS.
- Choose a specific application, preview inside a native application, or bypass system associations.
- Implement a recycle bin, undo, or moving between workspaces.

## Decisions

### Extend the file protocol rather than bypass the server

Add `requestId`-correlated messages for `open_native`, `rename_file`, `delete_file`, `move_file`, and `copy_file`, with typed results and existing or extended errors. The client constructs neither absolute paths nor system commands.

Alternative rejected: trigger a URL or HTTP API from the browser. A browser cannot reliably open the associated application, and this would weaken centralized validation.

### Validate every operation on the server at execution time

Resolve source and destination with the file browser's traversal- and symlink-safe protections. Rename, delete, and move require their source to be writable; move and copy require a writable destination. A copy may read a confined source outside the writable zone because it leaves that source unchanged. A rename name is one non-empty segment, and no existing destination is overwritten. Native opening requires only an existing file inside the root, so it remains available for read-only files.

Alternative rejected: rely on tree state or client-side validation, because that state is stale and forgeable.

### Delegate opening to the OS-associated launcher without a shell

The server launches the native equivalent of `open`, `start`, or `xdg-open` with the validated path as an argument and without shell interpolation. The response confirms that the launch was accepted or reports the system error.

Alternative rejected: an extension-to-application map. It would be platform-specific, disregard user preferences, and require association maintenance.

### Treat moving as an atomic mutation and refresh both branches

Dropping a writable file on a directory requests a move into that directory with the same name. The server creates a no-overwrite hard link at the destination, removes the source, and rolls the destination back if source removal fails. This preserves content and metadata while closing the overwrite race exposed by Node's replacement-style `rename`; it deliberately refuses cross-filesystem moves. Dropping a read-only file on a writable directory instead requests a no-overwrite copy and leaves the source untouched. After success, the client reloads the affected branches, updates or closes any affected active view, and connected clients receive the needed notifications.

Alternatives rejected: copy then delete can lose metadata, while checking the destination and then calling Node's `rename` leaves a race in which an independently created destination can be overwritten.

### Confirm before the destructive call

`FileTree` opens a confirmation that names the file. Cancelling produces no request; confirming triggers `delete_file`. Failures preserve context and show the error so the UI never implies successful deletion.

Alternative rejected: confirm only on the server. Confirmation is a UI decision; the server remains authoritative for security and consistency, not presentation.

### Treat tool-readable binary selections like path previews

The built-in `docx_extract` and `xlsx_extract` tools are available in both sandboxed and unrestricted sessions. When the text preview protocol reports its normal binary-preview refusal for one of those extensions, the client attaches the workspace path instead of the bytes. Other unsupported binary formats remain unattached. Truncated Files labels use the same native `title` tooltip convention as the Git tree.

## Risks / Trade-offs

- [The associated application is missing or the OS launcher fails] → return the correlated failure without changing the tree.
- [Race between display and external mutation] → recheck existence, type, confinement, and collision immediately before the operation; report a conflict rather than replace.
- [Move across filesystems] → handle the failure explicitly; do not simulate it with destructive copy in this version.
- [Drag-and-drop is inaccessible or ambiguous] → retain explicit open, rename, and delete actions; accept drops only from a file onto a directory row and expose the target state.

## Migration Plan

The new messages are additive. Deploy server and client together; an older client ignores them and an older server rejects them as unknown messages. Rollback consists of reverting to previous versions, with no data migration because mutations have already affected the workspace.

## Open Questions

- None for the initial scope: moving targets files only and deletion is permanent after confirmation.
