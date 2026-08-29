## Why

Embedded deployments currently hide every project-opening and project-switching affordance unconditionally. That is too rigid for deployments where the embedded user is trusted to choose either one sandbox root or among several project-backed sandboxes, and forces the host application to build controls pi-outpost already owns.

## What Changes

- Add a server configuration setting, `embed.workspaceControls`, with `"settings"`, `"root"`, and `"projects"` modes.
- Make `"settings"` the default: the embed remains bound to one project, while its configured sandbox root stays editable through Settings subject to the existing sandbox locks and runtime capability checks.
- In `"root"` mode, show a compact root chooser at the left of the embed header. Choosing a directory persistently replaces the current sandbox root, preserves the other sandbox permissions and locks, and rebuilds that one workspace rather than opening another.
- In `"projects"` mode, expose the existing project open/switch/close controls inside the embed; the existing `workspaceLock` remains the server-enforced upper bound.
- Keep RPC runtime behavior unchanged: a runtime that cannot enforce a sandbox continues to refuse sandbox configuration rather than presenting a false boundary.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `embed`: Make workspace controls in mounted widgets follow an explicit server policy instead of being unconditionally hidden.
- `config`: Define and validate the embed workspace-control policy and its compatibility-preserving default.

## Impact

- Server configuration parsing and the session snapshot capability data.
- Shared WebSocket protocol types carrying the configured embed capability.
- Embedded React application gating for the project menu and sandbox settings.
- Embed, configuration, server, component, and running-bench tests.
- Depends on the project lifecycle and selector introduced by `add-multi-project-workspaces`.
