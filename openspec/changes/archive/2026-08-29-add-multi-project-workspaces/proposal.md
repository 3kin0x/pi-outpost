## Why

A pi-outpost server serves exactly one project: `config.cwd` is read once into a module-level `AGENT_CWD`, and one `AgentSession` is broadcast to every connected client. Working on a second project means a second server on a second port, and switching between them means losing sight of the first — the agent there stops being watched, not because it stopped working, but because nothing can show it.

The goal is to hold several projects at once in one server: switch the view from one to another, keep each project's own session history, and let an agent keep working in the project you are not looking at.

## What Changes

- A **workspace** becomes a first-class object owning what is today module-level server state: the agent runtime, the sandbox, the browser and writable roots, the git probe, the file watcher, the sandboxed toolset, the session manager and the work plan.
- The server holds **several workspaces at once**, each rooted at its own directory, each with its own live agent session.
- **Switching project becomes a client-side act**, not a server mutation: a connection subscribes to one workspace, and switching re-subscribes. Server state does not move, so a turn running in another workspace is untouched by the switch.
- Projects are **opened at runtime by browsing the server's filesystem** — the directory picker that Settings already uses for the sandbox root — not declared in the configuration file. The set of open projects persists across restarts, and a project can be **closed** again. A workspace's agent starts **lazily**, on first open, and stops after a period of inactivity — but never while a turn is running.
- Each workspace keeps **its own session history**. Session listing, opening and renaming are scoped to the workspace, not to the server.
- The UI gains a **project selector** carrying per-workspace state: idle, working, finished, or needing attention. A workspace that needs the user (a permission prompt, an extension question) raises a badge, plus a browser notification when the tab is not in the foreground.
- **BREAKING (wire protocol)**: client and server messages become workspace-addressed. A connection that names no workspace is served the default one, so an existing client keeps working, but the snapshot and broadcast paths change shape.
- The embed widget is **pinned to a single workspace** by configuration, with switching disabled — the host page decides which project its widget shows.

## Capabilities

### New Capabilities
- `multi-project-workspaces`: opening a project by browsing the filesystem, switching between open projects, closing one, and retiring idle ones; per-workspace session history; workspace lifecycle (lazy start, idle stop, never mid-turn); per-workspace activity and attention state surfaced to clients.

### Modified Capabilities
- `api`: `GETWebSocket` — a connection binds to a workspace, the snapshot describes that workspace, and messages carry workspace addressing; server messages reach only the clients subscribed to the originating workspace.
- `config`: the set of open projects is persisted the way editable runtime settings already are, not hand-written; a lock that forbids opening, closing and switching (the mechanism `sandboxLocks` already establishes), for deployments that must pin one project; an idle-retirement setting.
- `architecture`: `LayeredArchitecture` and `SecurityModel` — the server no longer holds one session broadcast to all clients but N sessions addressed per connection, and the sandbox is scoped per workspace rather than per server.
- `embed`: `ConfigureTheMountedWidget` — the host names the workspace its widget is bound to, and the widget offers no switching.

`server-path-selection` is reused unchanged: it already lets a client walk the whole readable filesystem and "select one as a configuration value", which is exactly what opening a project needs. No requirement of it changes.

## Impact

- `server/src/index.ts`: the module-level bindings become workspace-owned (`runtime` l.888, `sandboxedTools` l.299, `BROWSER_ROOT` l.313, `WRITABLE_ROOT` l.314, `GIT` l.315, `fileWatcher` l.331, `activeWorkPlan` l.937, `AGENT_CWD` l.263). `clients: Set<WebSocket>` becomes a map from socket to workspace, and `broadcast()` — 21 call sites — becomes workspace-scoped.
- `shared/src/protocol.ts`: workspace addressing on `ClientMessage`/`ServerMessage`; a workspace list and per-workspace status in the snapshot.
- `ui/src/useAgent.ts`: the socket lifecycle already owns `serverUrl` and the reconnect loop; it gains the workspace it is subscribed to. 27 modules import it.
- `ui/src/components/Header.tsx`: the project selector and its per-workspace state indicator.
- `server/src/config.ts`: persisting the set of open projects, and the lock that forbids opening, closing and switching.
- `handleUpdateConfig` (`server/src/index.ts:1438`) currently moves the sandbox root of the single server; it becomes an operation on one workspace.
- Two throwaway spikes established feasibility: several pi `AgentSession` instances coexist in one process (~3-4 MB and ~30 ms each), and two turns run concurrently with real overlap, no cross-talk between their event streams and no shared message logs. Neither exercised extensions, skills, sandboxed tools or file watchers under concurrency — that contention is the open risk.
