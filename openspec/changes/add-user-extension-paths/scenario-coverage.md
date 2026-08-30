# Scenario-to-test coverage

Scope: the four delta specs this change carries. Enumerated with
`rg '^#### Scenario:' openspec/changes/add-user-extension-paths/specs/`, which reports
**29** scenarios: 6 in `config`, 7 in `persistent-runtime-settings`, 4 in `api`, and 12
in `components`. Two of those files are MODIFIED deltas, so they restate scenarios that
existed before this change — a MODIFIED requirement must carry its full content. Those
are listed here too, with the tests that already held them, because a delta that drops
one silently is exactly what the full-content rule exists to prevent.

All 29 are `covered`.

| Scenario | Spec | Status | Test |
|---|---|---|---|
| TheTwoListsLoadTogether | config | covered | `extensionPaths.test.ts` — "loads the deployment's and the user's, in that order" |
| ADirectoryIsAValidExtensionPath | config | covered | `extensionPaths.test.ts` — "passes a directory through as it was written"; end to end in `extensionPathsWire.test.mjs` |
| BothListsAreReadExceptionsToTheSandbox | config | covered | `extensionPaths.test.ts` — "both lists are read exceptions" |
| ALockedServerRefusesTheChange | config | covered | `extensionPathsWire.test.mjs` — "a locked deployment refuses the change…" |
| TheLockIsReportedToClients | config | covered | same test, `hello.extensionLock === true` |
| TheLockLeavesSkillPathsAlone | config | covered | same test, the skill apply that follows the refusal |
| A removed user extension path leaves the deployment's paths intact | persistent-runtime-settings | covered | `extensionPaths.test.ts` — "leaves the deployment's extensionPaths and its lock byte for byte" |
| Restart preserves a selected extension path | persistent-runtime-settings | covered | `extensionPathsWire.test.mjs` — second server, same configuration file |
| The interface offers only the user's own extension paths | persistent-runtime-settings | covered | `SettingsMenu.test.tsx` — "shows the deployment's own paths, and offers no way to remove them" |
| A locked server refuses a hand-sent request | persistent-runtime-settings | covered | `extensionPathsWire.test.mjs` — the refusal, plus the unchanged file |
| A locked extension path does not block the rest of an apply | persistent-runtime-settings | covered | same test, the skill apply; and `SettingsMenu.test.tsx` — "leaves a locked list out of the payload" |
| New skill is visible after apply | persistent-runtime-settings | covered *(pre-existing)* | `settings-persistence.test.mjs` |
| New extension is loaded after apply | persistent-runtime-settings | covered | `extensionPathsWire.test.mjs`; and in a browser, `e2e/settings-extensions.spec.ts` |
| TheSnapshotNamesTheUsersOwnPaths | api | covered | `extensionPathsWire.test.mjs` — `userExtensionPaths` and `configuredExtensionPaths` asserted apart |
| ALockedServerSaysSo | api | covered | `extensionPathsWire.test.mjs` |
| AnAppliedChangeComesBackInTheAcknowledgement | api | covered | `extensionPathsWire.test.mjs` — the ack carries the new paths and the rebuilt session's commands |
| AnUnknowableInventoryIsNotReportedAsEmpty | api | covered | `extensionPathsWire.test.mjs` — an RPC server's snapshot omits the key |
| Select a server extension directory | components | covered | `SettingsMenu.test.tsx` — "adds a directory chosen from the server and reports it on apply" |
| Remove a user extension path | components | covered | `SettingsMenu.test.tsx` — "removes one, and reports the rest" |
| Adding an extension path says what it means | components | covered | `SettingsMenu.test.tsx` — "says what adding one means, at the moment of adding and not before" |
| A locked deployment offers no extension control | components | covered | `SettingsMenu.test.tsx` — "offers nothing to change when the deployment locks them"; in a browser, `e2e/settings-extensions.spec.ts` |
| Every inventory opens from a counted summary | components | covered | `SettingsMenu.test.tsx` — "opens every inventory from a counted summary and sorts every list"; tools, skills, and extensions are each asserted collapsed with a count |
| Inventories read in a stable order | components | covered | same test, separate ordering assertions for tools, skills, and extensions |
| ChangeModelOrThinkingLevel | components | covered *(pre-existing)* | `ModelBar.test.tsx` |
| PresentSandboxSettings | components | covered *(pre-existing)* | `SettingsMenu.test.tsx` — the sandbox form suite |
| Select a server skill directory | components | covered *(pre-existing)* | `SettingsMenu.test.tsx` — "adds a directory chosen from the server and reports it on apply" (skills) |
| Remove a user skill path | components | covered *(pre-existing)* | `SettingsMenu.test.tsx` — "removes a configured path" |
| SubmitAuthenticationToken | components | covered *(pre-existing)* | `TokenGate.test.tsx` |
| NavigateConversationTree | components | covered *(pre-existing)* | `TreeMenu.test.tsx` |

## Evidence for the scenarios this change introduces

### The lock, three ways

The requirement is not "the control is hidden" but "the deployment decides, and the
server enforces it". Three tests hold three different halves:

- `extensionPathsWire.test.mjs` sends `update_config` carrying extension paths **by
  hand**, as a client that drew no control would have to. The server answers with an
  error matching `/locked/i`, the configuration file has no `userExtensionPaths` key
  afterwards, and no session is replaced. Then the same connection applies a *skill*
  path and it succeeds — so the lock is about extensions, not about refusing settings.
- `SettingsMenu.test.tsx` asserts the payload the menu builds under a lock omits
  `userExtensionPaths` entirely (`expect.not.objectContaining`). Sending them unchanged
  would be refused by the rule above and would take a legitimate skill change down with
  it — a failure only a test of the payload's *shape* catches.
- `e2e/settings-extensions.spec.ts` loads a server started with `extensionLock: true` in
  a real browser: the locked notice is present, the add button has count 0, and the
  loaded inventory is still shown. The lock hides the controls, not the facts.

### That an added directory actually loads something

The weak version of this test asserts the path appears in a list, which any control
that stores a string can pass. `extensionPathsWire.test.mjs` writes a real extension
into the directory — `index.ts` registering a command — and asserts the command name is
in the replacement session's `commands`. Removing the path and applying again rebuilds a
session without it, so the assertion is not satisfied by a session that simply
accumulates.

`e2e/settings-extensions.spec.ts` closes the same loop through the interface: it types
the directory into the picker, applies, and then finds the extension's own command
answering in the **composer** — the place a user would look. Nothing short of a real
session rebuild produces that. It then opens the counted summary and checks the
directory is listed, so the accordion is shown to reflect server state rather than the
draft the user was editing.

### An inventory that is absent rather than empty

`RuntimeState.extensionPaths` is now optional. The RPC runtime omits it, the embedded
one fills it, and the snapshot omits the key rather than sending `[]`.
`extensionPathsWire.test.mjs` asserts `hello.extensionPaths === undefined` against a real
RPC server driven by `fixtures/fake-pi-rpc.mjs`; `SettingsMenu.test.tsx` asserts the two
states render differently — "Not reported by this runtime" against "No extensions
loaded" — and that neither appears in place of the other.

### The warning

Asserted for its content, not its presence: both facts a reader would not otherwise know
— that extensions run with the agent's privileges, and that choosing a directory chooses
everything inside it. It is also asserted **absent** before the picker opens, which is
what keeps it a statement about an act rather than a caption people stop seeing. The
browser test re-checks it on the real page, before the path is entered.

## Runs

- `server/test/extensionPaths.test.ts`: 9 passed. `server/test/extensionPathsWire.test.mjs`: 4 passed.
- Full server suite: 1624 passed, 0 failed, 0 skipped, 0 cancelled.
- UI suite: 63 files, 1354 tests passed.
- Playwright: 48 passed.
- `openspec validate add-user-extension-paths --strict`: valid.
