## Context

See proposal.md — Why. What matters for the approach is where the current server keeps its state.

`server/src/index.ts` holds one project in module-level bindings, established at boot and never re-owned: `AGENT_CWD` (l.263, a `const`), `sandboxedTools` (l.299), `BROWSER_ROOT` / `WRITABLE_ROOT` / `GIT` (l.313-315), `fileWatcher` (l.331), `runtime` (l.888, a `const`), `activeWorkPlan` (l.937). Clients are a flat `Set<WebSocket>` (l.1094) and `broadcast()` (l.1098, 21 call sites) reaches all of them.

Two mechanisms already exist and shape the design:

- `handleUpdateConfig` (l.1438) moves the sandbox root at runtime: it persists first, then rebuilds roots, git, watcher and toolset, then rebuilds the session. It is the inventory of what a workspace owns — but it is the *wrong* pattern for switching, because it mutates the one server everyone sees.
- `handleBrowseServerDirectory` / `listServerDirectories` already lets a client walk the whole readable filesystem and pick a directory, which is exactly what opening a project needs.

Two throwaway spikes settled feasibility before this design was written: several pi `AgentSession` instances coexist in one Node process (~3-4 MB, ~30 ms each), and two turns run concurrently with real overlap (`max streaming at once: 2`), no cross-talk between event streams and no shared message logs.

## Goals / Non-Goals

**Goals:**
- One process holding N workspaces, each owning its resources.
- Switching that costs nothing on the server and disturbs no other workspace.
- A boundary crossed once, explicitly: after this change, no module-level binding in `index.ts` describes "the" project.

**Non-Goals:**
- Git worktree management. A worktree is just a directory here; creating or pruning one is out of scope.
- Multi-user or per-user workspace visibility. Every client of a server sees the same set of open projects.
- Cross-workspace agent operations (an agent in A reading B, a prompt fanned out to several projects).
- Moving `handleUpdateConfig`'s sandbox editing into a per-project settings UI beyond re-scoping it to one workspace.
- Keyboard shortcuts for switching. They answer a friction that only appears at high switching frequency, which is not the expected usage (two projects, occasional switching). The selector is a header component, so adding them later costs nothing that this design forecloses.

## Decisions

### One process, N embedded runtimes — not one child process per project

Chosen over `createRpcRuntime` child processes because the spikes showed embedded sessions coexist and run concurrently at ~3-4 MB each, and because the RPC path already carries a documented restriction: `handleUpdateConfig` refuses to change runtime settings under an RPC runtime, since the child builds its own resources. Multiplying that restriction by N projects would leave a UI showing boundaries nothing enforces.

*Alternative considered*: one child process per workspace. Better isolation — a hung project cannot take the others down, which the Windows startup hang makes a real concern. Rejected for now as a large step whose cost is not justified by evidence; the `AgentRuntime` boundary means it stays available later without redesigning the workspace layer. Note that this decision keeps the existing rule intact: a server configured for the RPC runtime supports one workspace, as today.

### Switching is a subscription change, not a server mutation

`clients: Set<WebSocket>` becomes a map from socket to workspace id. `broadcast()` becomes workspace-scoped; a small number of messages (workspace list, per-workspace activity) deliberately go to everyone. A `switch_workspace` message rebinds the socket and replies with that workspace's snapshot.

*Alternative considered*: one WebSocket per workspace, the client opening a second socket when it switches. Attractive — isolation falls out of the transport and `broadcast()` barely changes. Rejected because background awareness is the point of the feature: a client must hear about workspaces it is *not* viewing, which a per-workspace socket cannot deliver without connecting to every project anyway.

### Workspace identity is its resolved root path

No generated ids to persist and reconcile. Opening a directory already open is therefore a lookup, not a duplicate (spec: `OpeningAnAlreadyOpenDirectory`), and session history reattaches to a reopened project for free, since `SessionManager` is already keyed by cwd.

*Alternative considered*: a generated uuid with a display name. Better if projects are ever renamed or moved; rejected as premature — the path is the natural key and the one the user chose.

### The open set is persisted by the server, not authored by hand

It follows `persistEditableSettings`: write first, and abandon the operation if the write fails (spec: `WritingFailsBeforeAnythingMoves`). The reasoning is the one already recorded at `handleUpdateConfig` — a change the user watched take effect must not vanish at the next restart, and a configuration that cannot be saved must leave the running server exactly as it was.

### Retirement is driven by idleness, never by age

A workspace is retired only with no client subscribed *and* no turn running. This is the point where the feature's premise (work continues where nobody is looking) and the resource budget could contradict each other; idleness is what reconciles them. Retirement removes a workspace from memory but not from the open set (spec: `RetirementIsNotClosing`).

### Attention state is server-side, notification is client-side

The server reports that a workspace is waiting for the user; the client decides between a badge and a browser notification based on document visibility. The server must also stop discarding pending requests when no client is subscribed: `runtime.cancelPendingExtensionRequests()` currently fires when the last client disconnects (l.2718), on the reasoning that nobody is left to answer a dialog. Under multi-project, "nobody is watching this workspace" becomes the normal state, so cancellation must move from "no clients on this workspace" to "no clients on the server at all".

### The selector is a header menu, not a permanent column

Settled visually before implementation; the artboards are in `docs/design/multi-project-selector/` (see its README — they show the decisions, this document and the spec state them). The header carries a button showing the current project's name and its state; opening it lists every open project with its full name, its path and its state in words. Full names throughout: a monogram costs the reader a decoding step for identity the name already carries, and the path is what separates two projects with the same basename.

*Alternatives considered*: a narrow icon rail — permanent visibility of every project's state, but 56 px only fit initials, which is what ruled it out; a wide named sidebar — permanent *and* legible, rejected because it adds a fourth permanent column to an app whose file tree is already short of width, spending screen on every frame for a gesture made a few times a day; a tab strip — familiar, but overflows past roughly five projects and reads like the file tabs of an IDE, which pi-outpost does not have.

The menu's known weakness is that it is closed almost all the time. Two things answer it: the button carries muted dots after a separator, one per other open project (a pulsing one means an agent is working there), and the whole button takes an amber tint with a count when a project is waiting for the user. The dots carry presence, not identity — nothing to decode, and the names are one click away.

### The view is not restored across a switch; the composer draft is

Returning to a project shows its conversation, not the screen it was left on: the open file, the scroll position and the diff pane are forgotten. That deliberately keeps view state out of the workspace — the server restores a conversation, and nothing else.

The composer draft is the exception, kept per project. Losing typed text is a data loss rather than a view reset, and it is the one piece of client state that cannot be reconstructed.

*Alternative considered*: restoring the full view per project. Better on paper — coming back to exactly what you left is what "fluid" means to a user — but it means modelling, storing and rehydrating a per-project view snapshot in `useAgent`, for a benefit measured against a conversation that is restored anyway.

### Attention escalates by what the user is doing, not by urgency

Three levels, and the third is a prohibition. Document in the foreground: the badge alone — nothing moves, nothing opens, focus stays where it is. Document unattended: the badge plus a browser notification whose title names the project, since a notification that does not say where to click is not actionable. Never: a modal or dialog over the current project. A question raised in one workspace must not seize the screen of another.

### What the eye sees during a switch

The chrome does not move. The conversation and the file tree cross-fade together, with no loading skeleton — the outgoing content holds until the incoming content is there, so a switch never reads as a page reload. Only the project name inside the button is replaced.

### The default workspace keeps single-project servers unchanged

A server where nothing has been opened serves one workspace rooted at `cwd`, and a connection naming no workspace gets it. Existing configurations, existing clients and the embed widget keep working without naming anything.

## Risks / Trade-offs

- **Contention under concurrency was never measured** (the spikes ran with tools off, no extensions, no skills, no watchers) → measure with the real workspace layer before the UI work; if N file watchers or N skill discoveries contend, retirement and lazy start are the levers already in the design.
- **A hung workspace start blocks only itself, but nothing says so** → the workspace's reported state is `starting`, with the same failure surface as the current startup hang. This design does not fix that hang; it does contain it to one project instead of the whole server.
- **`broadcast()` has 21 call sites** and every one must decide between "this workspace" and "everyone" → the compiler cannot catch a wrong choice. Mitigate by making the workspace-scoped form the one that takes a workspace argument, so the global form is always visible at the call site.
- **The wire protocol changes shape** → an unnamed workspace resolves to the default, so an old client keeps working; but the snapshot gains fields and `@pi-outpost/embed` publishes a type surface, so the package's types move with it.
- **Memory grows with open projects** → ~3-4 MB per bare session is a floor, not the real cost with extensions and watchers. Retirement is the release valve, and its timeout is configurable, including off.
- **Closing a project while its agent works is refused rather than queued** → simple and safe, at the cost of a user having to cancel the turn first.

## Migration Plan

No data migration: an existing configuration has no open set, so the server serves `cwd` as its default workspace exactly as before. The persisted open set is created the first time a project is opened.

Rollback is a version rollback. An open set written by the new version is ignored by the old one, which reads `cwd` and behaves as it always did — no state is destroyed by going back.

The refactor lands before any behaviour: introducing the workspace object and re-scoping `broadcast()` while the server still holds exactly one workspace is a no-op that the existing suite can validate. Opening, closing, switching and attention build on top of a boundary already proven not to have broken anything.

## Open Questions

- Whether a retired workspace should be rebuilt eagerly when a client is merely told about its activity, rather than on actual open. Deferrable: it is a latency optimisation, not a behaviour change.

Resolved since this document was first written: several workspaces needing attention at once raise **one notification per workspace**, each naming its own project. A coalesced notification ("2 projects need you") cannot be acted on without opening the app to find out which — and naming the project is what makes the notification worth sending. The in-app badge is the one that coalesces, as a count on the button.
