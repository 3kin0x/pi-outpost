## 1. Introduce the workspace boundary (no behaviour change)

- [x] 1.1 Add a `Workspace` type in `server/src/` owning what `index.ts` holds at module level: agent runtime, sandbox settings, browser root, writable root, git state, file watcher, sandboxed toolset, session manager, work plan
- [x] 1.2 Give it a lifecycle: `open()` builds those resources for a root directory, `stop()` releases them (watcher closed, session disposed), `isBusy()` reports whether a turn is running
- [x] 1.3 Move `AGENT_CWD` (l.263), `sandboxedTools` (l.299), `BROWSER_ROOT`/`WRITABLE_ROOT`/`GIT` (l.313-315), `fileWatcher` (l.331), `runtime` (l.888) and `activeWorkPlan` (l.937) into the workspace, leaving the server holding exactly one
- [x] 1.4 Re-scope every read of those bindings to go through the workspace the request belongs to
- [x] 1.5 Verify the existing server suite passes unchanged — this step is a no-op by construction and the suite is the proof

## 2. Route by workspace

- [x] 2.1 Replace `clients: Set<WebSocket>` (l.1094) with a map from socket to workspace
- [x] 2.2 Split `broadcast()` (l.1098) into a workspace-scoped form taking the workspace explicitly and a server-wide form; make the workspace-scoped one the default shape so a global send is visible at the call site
- [x] 2.3 Walk all 21 `broadcast()` call sites and choose deliberately for each; record the few that are genuinely server-wide
- [x] 2.4 Move `runtime.cancelPendingExtensionRequests()` (l.2718) from "last client of the server disconnected" to "no clients on the server at all", so a workspace nobody is viewing keeps its pending requests
- [x] 2.5 Add a `WorkspaceRegistry` holding the open workspaces, resolving one by its root path

## 3. Protocol and connection binding

- [x] 3.1 Add workspace addressing to `ClientMessage`/`ServerMessage` in `shared/src/protocol.ts`
- [x] 3.2 Add the open-project list and per-workspace activity state to the snapshot
- [x] 3.3 Bind a `/ws` connection to the workspace named in the upgrade, defaulting to the server's default workspace when none is named
- [x] 3.4 Add `switch_workspace`: rebind the socket, reply with that workspace's snapshot, disturb nothing else
- [x] 3.5 Scope session listing, opening, renaming and searching to the connection's workspace; refuse a session file belonging to another
- [x] 3.6 Update the `@pi-outpost/embed` published type surface for the protocol change

## 4. Opening and closing projects

- [x] 4.1 Persist the open set alongside editable runtime settings, writing before the workspace is opened or stopped, abandoning the operation if the write fails
- [x] 4.2 Add `open_project`: take a directory chosen through the existing `browse_server_directory` picker, resolve it, reject an unreadable path, return the existing workspace if that directory is already open
- [x] 4.3 Add `close_project`: refuse while the agent is streaming, refuse for the last open project, otherwise stop the workspace, remove it from the set, and move any bound client to another open project
- [x] 4.4 Load the persisted open set at startup without building any session
- [x] 4.5 Re-scope `handleUpdateConfig` (l.1438) to act on one workspace rather than the server
- [x] 4.6 Add the lock that forbids opening, closing and switching, following the `sandboxLocks` convention (`config.ts:658`)

## 5. Workspace lifecycle

- [x] 5.1 Build a workspace's session on first open, not at startup; report `starting` until it is ready
- [x] 5.2 Add the idle-retirement sweep: stop a workspace with no subscriber and no running turn after the configured delay
- [x] 5.3 Make retirement configurable, including disabled, and prove it never stops a workspace mid-turn
- [x] 5.4 Rebuild a retired workspace transparently on next open, with its session history intact

## 6. Attention and activity

- [x] 6.1 Track and report per-workspace state: stopped, starting, idle, working, waiting for the user
- [x] 6.2 Send activity and attention changes to every connection, including those bound elsewhere, carrying no message content
- [x] 6.3 Mark a workspace as waiting when a permission prompt or extension request blocks its turn, and keep the request pending
- [x] 6.4 Resume the pending request when a client switches back to that workspace
- [ ] 6.5 Make extension renderers per-workspace: `configureExtensionRender` sets a process-wide singleton (`server/src/extensionRender.ts`), so with two embedded projects the last one to configure it renders the other's tool cards and custom messages, with its own extension runner and cwd. Needs a renderer instance threaded through `renderToolCallHtml`, `renderToolResultHtml` and `renderCustomMessageHtml` (found by review; display correctness, not a sandbox boundary)

## 7. Interface

> The settled design is drawn in `docs/design/multi-project-selector/` — read its README
> before starting this group. The artboards show placement, the five state marks, the
> attention levels and what the switch looks like. They are not normative: where they and
> `openspec/specs/multi-project-workspaces/spec.md` disagree, the spec wins.

- [x] 7.1 Add the subscribed workspace to `ui/src/useAgent.ts` alongside `serverUrl`, and reconnect on switch
- [x] 7.2 Add the project button to `ui/src/components/Header.tsx`, left of the `files` control: current project's name, its state dot, and the chevron — hidden entirely while only one project is open
- [x] 7.3 Add the muted dots after a separator on that button, one per other open project, pulsing for one that is working; tint the whole button amber with a count when any project is waiting for the user
- [x] 7.4 Add the open menu: one row per open project with full name, path in mono, and state in words (`travaille` / `t'attend` / `au repos` / `démarre…` / `arrêté`); the five state marks differ in shape, not only in colour
- [x] 7.5 Wire "Ouvrir un projet…" to the existing directory picker, and the per-row close control with its refusal cases surfaced (agent streaming, last project)
- [x] 7.6 Cross-fade the conversation and the file tree together on switch, with no loading skeleton — the outgoing content holds until the incoming content arrives; the header does not move
- [x] 7.7 Reset the view on switch (open file, scroll position, diff pane) and keep the composer draft per project
- [x] 7.8 Raise a browser notification only when the document is not in the foreground and permission is granted — one per waiting workspace, its title naming the project; never a modal over the current project
- [x] 7.9 Hide every switching, opening and closing affordance when the server reports the lock, and in the embed widget

## 8. Proof

- [x] 8.1 Measure the real per-workspace cost with extensions, skills, sandboxed tools and watchers active — the spikes measured a bare session only. `scripts/measure-workspace-cost.mjs` opens projects one at a time against a running server and reads its RSS: **~4-8 MB and ~180 ms per additional project** with a sandboxed toolset, a watcher, a skill and an extension loaded (two runs: 32 MB over 5 projects, 20 MB over 5). RSS moves with GC, so the figure to quote is growth over a whole run, not a single step
- [x] 8.2 Server tests: event isolation between two concurrently streaming workspaces, sandbox confinement per workspace, session listing scoped to its workspace, close refused while streaming, persistence failure leaving the server untouched (the last one is the file's one skipped test — see `scenario-coverage.md`)
- [x] 8.3 Build the scenario-to-test matrix over every `#### Scenario:` in the four delta specs, classifying each as covered, partial or uncovered — `scenario-coverage.md`, 54 scenarios: 47 covered, 6 partial, 1 uncovered. Writing it found and fixed a real defect (a pending question was never re-presented after a switch back) and closed the gaps in 8.2's own list
- [x] 8.4 Drive the running widget with `npm run bench` (rebuild `web`, then `@pi-outpost/embed`, then `build:e2e-host`): open a second project, switch while an agent is streaming, come back and read the DOM to confirm the turn completed, close a project, and check the button's dots and amber tint from a background workspace
- [x] 8.5 In the same running app, check what the switch actually looks like: that the header does not move, that no loading skeleton flashes, that a typed draft survives a round trip, and that an open file is gone on return
- [x] 8.6 Run `openspec validate add-multi-project-workspaces --strict` and the full suite
