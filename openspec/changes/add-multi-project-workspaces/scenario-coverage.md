# Scenario → test matrix

Every `#### Scenario:` in this change's five delta specs, and what proves it.
Built for task 8.3. Read the assertions, not the names: a scenario counts as
**covered** only when the test would fail if the behaviour broke at the boundary
the scenario describes.

Legend: **covered** · **partial** (proved at a narrower boundary than the scenario
names, or by the bench rather than a suite) · **uncovered**.

Files referenced:

- `server/test/multiProjectWorkspaces.test.mjs` — over the real wire (`mp`)
- `server/test/workspace-boundaries.test.ts` — workspace-owned resources and
  exact retirement policy (`wb`)
- `server/test/config.test.ts` (`cfg`) · `server/test/cors.test.mjs` ·
  `server/test/auth.test.mjs` · `server/test/credentials.test.mjs` ·
  `server/test/sandbox.test.ts`
- `ui/src/App.test.tsx` · `ui/src/useAgent.test.ts` · `ui/src/components/ProjectMenu.test.tsx` ·
  `ui/src/useWorkspaceNotifications.test.ts`
- `e2e/app.spec.ts` · `e2e/embed.spec.ts` · the bench run recorded in tasks 8.4/8.5

The 54 counted rows are the change's delta scenarios. The relevant scenarios
from the existing `api`, `architecture`, `config`, and `embed` main specs that
these deltas modify are repeated in the matching tables below; unchanged main
requirements remain regression-gated by the full suites and are not counted as
new multi-project scenarios.

## multi-project-workspaces (29)

| Scenario | Status | Proof |
|---|---|---|
| OpeningADirectoryFromThePicker | covered | mp "the open set is written before the project is opened, and survives a restart" (opens by path and switches to it); bench 8.4 drives the picker itself |
| OpenProjectsSurviveARestart | covered | mp same test — asserts the config file, then boots a second server from it |
| OpeningAnAlreadyOpenDirectory | covered | mp "opening a directory that is already open reuses it" |
| OpeningAnUnusableDirectory | covered | mp "opening an unreadable path fails and opens nothing" |
| FirstRunWithNoProjectsOpened | covered | mp "a single-project server offers no selector"; cfg "an existing configuration that never opened a project is served as before" |
| ClosingReleasesTheWorkspace | covered | mp "closing a project releases it, moves whoever was watching, and leaves its history on disk" |
| ReopeningFindsTheHistory | covered | mp same test — a seeded conversation is listed again after the reopen |
| ClosingAWorkingProjectIsRefused | covered | mp "closing a project is refused while its agent is streaming" |
| StartupDoesNotBuildEveryWorkspace | covered | mp "a persisted project is listed but has no session until it is opened" |
| FirstOpenBuildsTheSession | covered | mp "a client hears about another project's activity, and none of its content" observes `starting` on a client bound elsewhere and asserts it arrives before `workspace_switched`; "switching builds…" then proves the resulting session is distinct and idle |
| TheAgentKeepsWorkingAfterASwitch | covered | mp "a turn started before a switch finishes in the project it belongs to" |
| OtherClientsAreUnaffected | covered | mp "a streaming turn reaches its own project's clients and no others" |
| EventsDoNotCrossWorkspaces | covered | mp same test — the watcher's received frames are asserted to hold no turn content |
| SandboxIsPerWorkspace | covered | wb "the actual read tool of one workspace refuses another workspace's file" invokes the `ToolDefinition.execute` owned by alpha against beta's absolute file and requires a sandbox denial; mp separately proves the wire file boundary |
| HistoryFollowsTheProject | covered | mp "session listing is scoped to the project the connection is bound to" |
| TheLiveConversationSurvivesASwitch | covered | mp "an unwatched project is retired, stays listed, and comes back with its history" (same session id on return); bench 8.4 |
| TheOpenFileIsNotRestored | covered | `useAgent` "forgets the screen the project was left on"; bench 8.5 |
| TheUnsentDraftIsRestored | covered | `App.test.tsx` "restores a project's draft after a round trip through another project" drives alpha → beta → alpha and asserts the original value; Playwright `app.spec.ts` repeats that round trip over the real server and browser |
| DraftsDoNotFollowTheClient | covered | `App.test.tsx` "shows an empty composer when a project with no draft is selected" proves alpha's text does not appear in beta; Playwright `app.spec.ts` asserts the second project's real composer starts empty |
| WorkingWorkspacesAreNeverRetired | covered | mp "a project whose agent is streaming outlives any idle period" |
| ReopeningARetiredWorkspace | covered | mp "an unwatched project is retired, stays listed, and comes back with its history" |
| BackgroundProgressIsVisible | covered | mp "a client hears about another project's activity, and none of its content"; working→idle in the streaming and turn-finishes tests |
| APendingQuestionIsNotDiscarded | covered | mp "a question raised in a background project waits there, and can be answered on return" — the project reports `waiting`, and the question itself never reaches the client bound elsewhere |
| AnsweringAfterSwitchingBack | covered | mp same test. Writing it found the defect: the question was sent once, to whoever was bound at the time, so switching back left a project reporting that it needed an answer nobody could give. The workspace now keeps the request, not just its id, and re-presents it on every bind |
| NotificationOnlyWhenUnattended | covered | `useWorkspaceNotifications` "stays silent while the document is in the foreground" |
| NothingInterruptsTheCurrentWorkspace | covered | `ProjectMenu` "counts the waiting projects on the button" (badge only, no dialog); notifications hook raises nothing for the bound project |
| TwoWorkspacesWaitingAtOnce | covered | `useWorkspaceNotifications` "names each waiting project when two ask at once" |
| PinnedServerRefusesASwitch | covered | mp "a pinned server refuses to open, close or switch" |
| PinnedServerRefusesAnOpen | covered | mp same test |

## api (5)

| Scenario | Status | Proof |
|---|---|---|
| EstablishWebSocketConnection | covered | pre-existing: every harness test connects and waits for `hello` |
| DisallowedOrigin | covered | pre-existing `cors.test.mjs` |
| SnapshotCarriesCredentialStatus | covered | pre-existing `credentials.test.mjs` |
| ConnectionWithoutAWorkspaceNamed | covered | mp "a connection names the project it binds to, and an unknown one falls back" |
| MessagesReachOnlyTheirWorkspace | covered | mp "a streaming turn reaches its own project's clients and no others" |

## architecture (8)

| Scenario | Status | Proof |
|---|---|---|
| LayerSeparation | covered | pre-existing: the protocol is the only path, enforced by the type surface and the whole server suite |
| WorkspaceOwnsItsResources | covered | wb "moving one sandbox root replaces only that workspace's watcher and toolset" changes alpha's root and asserts beta keeps the exact browser root, watcher and toolset instances, whose read tool still works |
| CrossOriginRejected | covered | pre-existing `cors.test.mjs` |
| TokenRequired | covered | pre-existing auth tests; `e2e/embed.spec.ts` "a token-protected backend works across origins" |
| SandboxedFileAccess | covered | pre-existing `sandbox.test.ts` |
| OpeningAWorkspaceUnderALock | covered | mp "a pinned server refuses to open, close or switch" |
| ANewWorkspaceIsSandboxedAtItsOwnRoot | covered | mp "a project opened with no settings of its own inherits the server's sandbox" — writing refused as on the server, reading served at the project's own root |
| SessionsCannotBeOpenedAcrossWorkspaces | covered | mp "a session belonging to another project cannot be opened" |

## config (7)

| Scenario | Status | Proof |
|---|---|---|
| WritingFailsBeforeAnythingMoves | covered | mp "a persisted set that cannot be written leaves the server untouched" removes the configuration source, observes `workspace_error`, then connects again and proves the project set is still single-project; the test is no longer skipped |
| ProjectInheritsServerSandbox | covered | mp "a project opened with no settings of its own inherits the server's sandbox" |
| BackwardCompatibleConfiguration | covered | cfg "an existing configuration that never opened a project is served as before" |
| PinnedConfigurationRefusesSwitching | covered | mp "a pinned server refuses to open, close or switch" |
| PinnedConfigurationRefusesOpening | covered | mp same test |
| RetirementDisabled | covered | cfg "workspaceIdleTimeoutMs takes 0 as \"never retire\"" proves config acceptance; wb "a zero timeout cannot retire even a long-idle, unwatched workspace" calls the policy used by the sweep and contrasts it with the same state under a positive elapsed timeout |
| RetirementIsNotClosing | covered | mp "an unwatched project is retired, stays listed, and comes back with its history" |

## embed (5)

| Scenario | Status | Proof |
|---|---|---|
| HostSuppliesItsOwnToken | covered | `e2e/embed.spec.ts` "a token-protected backend works across origins, preflight and all" |
| NoBackendOriginGiven | covered | `e2e/embed.spec.ts` "the branding request survives the origin the widget was mounted from" |
| HostNamesTheWorkspace | covered | `useAgent` "names the workspace on the upgrade when the host supplies one"; mp "a connection names the project it binds to" |
| NoWorkspaceNamed | covered | `useAgent` "names no workspace when the host supplies none"; mp same test's fallback half |
| WidgetOffersNoSwitching | covered | `ProjectMenu` "offers nothing at all — not a disabled control"; `App.tsx` passes `state.workspaceLocked \|\| embedded` |

## Result

All **54 scenarios are covered**. There are no partial or uncovered rows.
