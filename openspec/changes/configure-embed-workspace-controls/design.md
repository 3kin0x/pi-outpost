## Context

See `proposal.md` for motivation and `specs/embed/spec.md` plus `specs/config/spec.md` for the observable contract.

The mounted app currently derives an `embedded` boolean from the presence of its Shadow DOM root and unconditionally folds that into `workspaceLocked`, so `ProjectMenu` disappears in every embed. Sandbox-root editing is already implemented end to end through Settings: the server-directory picker returns an absolute path, `update_config` validates and persists the complete sandbox projection, and the workspace rebuild replaces the current runtime. The multi-project change adds the separate open/switch/close path.

The server may serve standalone and embedded clients at the same time. `workspaceLock` is the existing server-enforced authorization boundary for project lifecycle operations; the new embed setting chooses which of the already-authorized controls a mounted widget presents.

## Goals / Non-Goals

**Goals:**

- Put the embed workspace-control choice in the loaded server configuration.
- Reuse the existing persistent sandbox update and project lifecycle paths.
- Keep standalone behavior unchanged and preserve all existing locks.
- Make each mode distinguishable and testable in the live embed bench.

**Non-Goals:**

- Adding sandbox enforcement to the RPC runtime.
- Letting a mount option grant more authority than the server configuration.
- Maintaining several workspaces in `root` mode.
- Introducing a second directory-browsing protocol.

## Decisions

### Carry an embed presentation policy in the session snapshot

`embed.workspaceControls` is parsed as `settings | root | projects`, defaults to `settings`, and is sent in the session snapshot. The React app combines that value with its local knowledge that it is embedded. Standalone clients ignore the field and retain their current project controls.

This is preferred to a mount-only option because the deployment configuration remains the single visible place where operators choose server-facing behavior. It is also preferred to overloading `workspaceLock`: that lock is a server-wide authorization boundary, while the new setting is an embed-specific presentation and workflow choice.

### Keep `workspaceLock` as the hard upper bound

In `projects` mode the embed renders `ProjectMenu` only when `workspaceLock` is false. The existing server checks continue to refuse forged or stale open, switch, and close requests under the lock. The new setting does not duplicate that authorization.

### Reuse `update_config` for mono-root replacement

`root` mode adds a compact header control showing the current sandbox root and opening the existing `ServerPathPicker`. On selection, the client submits the complete current sandbox projection with only `root` replaced. The existing update path persists first, validates locks and path relationships, rebuilds the current workspace, and acknowledges only after the new session is healthy.

The workspace identity and open-project set do not change. This deliberately differs from `projects` mode: session history remains attached to the same project while its file/tool boundary moves, matching the existing Settings behavior.

A preserved `writableRoot` that is outside the selected root makes the candidate sandbox invalid. The server refuses the whole update and the client keeps the picker/menu open with the error; it never silently clears or relocates the writable root.

### Make the header modes mutually exclusive

For an embed:

- `settings` renders no workspace control in the header;
- `root` renders the mono-root control;
- `projects` renders the existing project control.

Settings remains available in every mode. This avoids two competing root-changing affordances in the header while retaining the full configuration surface.

### Leave unsupported runtimes honest

The existing configuration rule rejecting `sandbox` with `agentRuntime.mode: "rpc"` remains unchanged. Consequently `root` mode has a usable header selector only when a sandbox snapshot exists; if no sandbox is configured, the control reports that no sandbox is available rather than pretending a boundary can be moved.

## Risks / Trade-offs

- [A root change can invalidate the preserved writable root] → validate atomically and retain the old configuration and workspace on refusal.
- [The directory picker exposes readable server directory names] → retain WebSocket authentication and the existing directory-only response contract.
- [A UI-only embed policy could be mistaken for authorization] → document and test that `workspaceLock`, sandbox locks, and runtime checks remain the enforcing boundaries.
- [Two selectors could contend for the single server-browse state] → make Settings, mono-root, and project pickers mutually exclusive in the app state and close the previous picker before opening another.
- [The active multi-project change is not yet archived] → implement against its current protocol and components without editing its already-modified task artifact; validate both changes together before archive.

## Migration Plan

Existing files need no migration. Missing `embed.workspaceControls` resolves to `settings`, which preserves the current embedded UI. Rollback removes the field and restores the unconditional embedded project-menu lock; persisted sandbox roots and open-project state remain valid.
