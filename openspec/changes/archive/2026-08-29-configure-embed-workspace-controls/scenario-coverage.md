Every `#### Scenario:` in this change's two delta specs, and what proves it.
Built for task 4.1. Read the assertions, not the names: a scenario counts as
**covered** only when the test would fail if the behaviour broke at the boundary
the scenario describes.

Files referenced:

- `server/test/config.test.ts` (`cfg`) — the setting as loaded configuration
- `server/test/embedWorkspaceControls.test.mjs` (`wire`) — what actually leaves
  the server, over a real socket
- `ui/src/components/WorkspaceRootControl.test.tsx` (`ctl`) ·
  `ui/src/App.test.tsx` (`app`) · `ui/src/useAgent.test.ts` (`hook`)
- `e2e/embed.spec.ts` (`e2e`) — one server per policy, driven in a real browser
  through a real shadow root

The 16 rows are this change's delta scenarios. Five of them are carried over
unchanged from the `embed` main spec: a MODIFIED requirement replaces the whole
block, so they are repeated in the delta and re-verified here.

## config (5)

| Scenario | Status | Evidence |
| --- | --- | --- |
| SettingsModeIsTheDefault | covered | cfg "an embed policy is absent until one is configured…" asserts the loaded value is `settings` with nothing in the file; wire "a server that configures nothing says nothing about embed controls" asserts the field is absent from `hello`, which is what makes an older client keep its interface |
| ProjectsModeIsConfigured | covered | cfg "every accepted embed workspace-control value is loaded as written" (all three values) and wire "a configured policy reaches the widget on the snapshot it connects with" |
| RootModeIsConfigured | covered | same cfg test; wire "root mode reaches the widget the same way" |
| InvalidEmbedWorkspaceControls | covered | cfg "an unknown embed workspace-control value fails startup, naming the setting" requires the thrown message to name `embed.workspaceControls` |
| PolicyDoesNotWeakenWorkspaceLock | covered | wire "offering project controls to embeds does not unlock the server" reads both fields off `hello`, then sends `open_project` and requires the refusal — the boundary is checked where a forged request would arrive, not in the interface |

## embed (11)

| Scenario | Status | Evidence |
| --- | --- | --- |
| HostSuppliesItsOwnToken | covered | pre-existing e2e "a token-protected backend works across origins, preflight and all" |
| NoBackendOriginGiven | covered | pre-existing e2e "mounts inside a shadow root and connects across origins" |
| HostNamesTheWorkspace | covered | hook "names the workspace on the upgrade when the host supplies one" — the upgrade is the only moment the binding is decided |
| NoWorkspaceNamed | covered | hook "names no workspace when the host supplies none" |
| WidgetOffersNoSwitching | covered | app "an embed under the default policy offers neither a project selector nor a root chooser"; e2e "settings mode offers no header control…" proves it in a real widget. This is the guarantee that holds when nothing is configured, which is what the default preserves |
| SettingsModeKeepsProjectControlsHidden | covered | app same test, which also asserts Settings still offers the sandbox root; e2e "settings mode offers no header control, and still reaches the root through Settings" opens Settings and finds the browse control |
| RootModeReplacesTheSingleSandboxRoot | covered | app "replaces the sandbox root, preserving every other sandbox setting" asserts the exact `update_config` payload and that `openProject` was never called; wire "a valid replacement moves the root and keeps the same project" asserts the acknowledged root and that the workspace and project list are unchanged; e2e "root mode replaces the one sandbox root without opening a project" drives it in the browser and reads the moved root back off the header |
| RootReplacementMustPreserveAValidSandbox | covered | wire "a replacement root that would strand the writable root is refused, and nothing moves" requires the refusal to name `writableRoot` and then proves, on a second connection, that the persisted root and writable root are unchanged; ctl "keeps the picker open on a refusal, and says why" proves the control does not report a move that did not happen |
| LockedRootCannotBeReplaced | covered | ctl "reports a locked root instead of a chooser": the button is disabled, clicking it opens no picker and asks for no listing |
| ProjectsModeOffersProjectControls | covered | app "offers the project controls the standalone app has"; e2e "projects mode opens the selector and switches between open projects" opens the menu and switches, then reads the new project off the header |
| WorkspaceLockOverridesProjectsMode | covered | app "offers nothing once the server is workspace-locked"; e2e "a workspace lock still suppresses the controls projects mode would offer" against a server configured with both |

## Result

All **16 scenarios are covered**. There are no partial or uncovered rows.

## What the running app found that no suite did

Two defects, both invisible to the unit suites and both reached only by a real
mouse press inside a real shadow root:

1. `ProjectMenu` closed itself on `mousedown` before any item could be clicked.
   Its outside-click test used `rootRef.contains(event.target)`, and inside the
   widget every document-level event is retargeted to the shadow host — so the
   answer was "outside" for every click in the embed. `projects` mode was
   unusable in a widget. Fixed by the shared `eventHitsNode`, which the
   repository already had for exactly this reason. Regression: e2e "projects
   mode opens the selector and switches between open projects".
2. `SettingsMenu` released the shared server-browse listing on every pointer
   press anywhere outside itself, open or closed. The first click inside the new
   root chooser therefore emptied the listing it was walking. Fixed by acting
   only when that menu actually has something open. Regression: app "keeps the
   listing a control is walking when the pointer lands elsewhere".

Both were first seen by driving the bench, and both were reproduced by a
Playwright click before being fixed — a scripted `element.click()` does not fire
`mousedown` and reported success on the broken code.
