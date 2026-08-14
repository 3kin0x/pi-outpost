## Why

The **Files** panel currently supports browsing and previewing the workspace, but it lacks common file operations: opening a document in its native application, renaming it, deleting it, or organizing it. Users must leave the application for operations that should be available directly from the tree.

## What Changes

- Add an action to open a tree file with its operating-system-associated application (for example, Word for a `.docx`).
- Add file rename and delete actions to the tree; deletion requires explicit confirmation.
- Allow a writable file to be moved into a directory by dragging and dropping it in the tree, and copy a read-only file when it is dropped into a writable directory.
- Extend the WebSocket protocol and server with file-system operations confined to the browser root and protected by the same write permissions as creation and editing.
- Update the file tree and its component contracts to expose these actions and synchronize displayed state after success or failure.
- Automatically reference selected `.docx` and `.xlsx` files when inline preview is unsupported but a built-in extraction tool can read them by path.
- Expose complete file and directory names through the Git tree's existing hover-tooltip convention when labels are truncated.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `file`: users can perform the new file lifecycle operations from the tree within writable-zone limits.
- `api`: the WebSocket protocol carries native-open, rename, delete, move, and copy requests and results.
- `components`: `FileTree` exposes and renders the file actions, confirmation, and drop interaction.
- `preview-file-attachments`: tool-readable binary selections become automatic path references.

## Impact

- Server: `server/src/fileBrowser.ts`, WebSocket routing, and file-change notifications.
- Shared contract: `shared/src/protocol.ts`.
- UI: `ui/src/App.tsx` orchestration, `FileTree`, and their tests.
- Native opening depends on the host system launcher and must receive only validated, confined paths.
