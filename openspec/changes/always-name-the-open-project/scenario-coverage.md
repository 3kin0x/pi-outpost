Every `#### Scenario:` in this change's two deltas — including the whole of
`GETWebSocket`, since a MODIFIED requirement replaces its block — and what proves it.
Built for task 5.1. Read the assertions, not the names: a scenario counts as
**covered** only when the check would fail if the behaviour broke at the boundary the
scenario describes.

Files referenced:

- `server/test/multiProjectWorkspaces.test.mjs` (`mp`) — over a real server and socket
- `server/test/embedWorkspaceControls.test.mjs` (`emb`)
- `ui/src/components/ProjectMenu.test.tsx` (`menu`) · `ui/src/App.test.tsx` (`app`)
- **bench** — driven in the running interface and read back from the DOM

## multi-project-workspaces (4)

| Scenario | Status | Evidence |
| --- | --- | --- |
| OneProjectIsStillNamed | covered | mp "a single-project server still says which project it is serving" asserts the bound project's root, the one-entry list, and that it carries a name and an activity — the two things the control shows. mp "a single project's activity reaches the client that is watching it" drives a real turn and requires the `workspace_activity` frame to arrive with that project working, so the state the control shows stays current. menu "names the project even when it is the only one open" asserts the rendered title and text. bench: the header read `pi-outpost-test-1YyAmK`, `Projet : … (au repos)` |
| TheControlDoesNotChangeShape | covered | menu "does not change shape when a second project appears" captures the button's tag, title and text at one project and requires them identical after a second arrives, then proves the menu grew from 2 rows to 3. bench: same `BUTTON`, same 26px height, across a real open |
| OpeningStaysReachableFromTheControl | covered | menu "keeps opening reachable with a single project, from that same control" opens the menu, requires exactly two items and no close button, and drives the open item. bench: the same path opened a second project for real |
| APinnedServerStillOffersNothing | covered | menu "offers nothing on a pinned server, with one project open" requires an empty DOM. bench: the widget under a `settings` policy shows no control at all, with the fields present |

## api — GETWebSocket (6)

| Scenario | Status | Evidence |
| --- | --- | --- |
| ASingleProjectIsStillDescribed | covered | mp "a single-project server still says which project it is serving", and mp "the project a client is bound to rides every snapshot, not only the first" — a settings acknowledgement and a session replacement must carry the same values, since a field present at connection and absent later would empty the control under the user |
| EstablishWebSocketConnection | covered | pre-existing; untouched |
| DisallowedOrigin | covered | pre-existing `cors` assertions; untouched |
| SnapshotCarriesCredentialStatus | covered | pre-existing; untouched |
| ConnectionWithoutAWorkspaceNamed | covered | pre-existing mp assertions on the default binding; untouched |
| MessagesReachOnlyTheirWorkspace | covered | pre-existing mp "a streaming turn reaches its own project's clients and no others"; untouched |

## Result

All **10 scenarios are covered**. There are no partial or uncovered rows.

## What the old behaviour cost, measured in tests that had to flip

Four assertions encoded the absence, and each marks a place it was observable:

- mp "a single-project server offers no selector" — the decision itself, asserted
  directly. It is now its opposite.
- mp "opening an unreadable path fails and opens nothing" and "a persisted set that
  cannot be written leaves the server untouched" — both proved "nothing was added" by
  the *absence* of the list. They now prove it by its length, which is what they meant.
- emb "a valid replacement moves the root and keeps the same project" compared the two
  fields by identity, which passed only because both were `undefined`. It now compares
  their contents, which is what it was trying to say.

None of them was weakened to pass. Each was saying something true about the old shape
and now says the same thing about the new one.

## A defect this change would have shipped, found by review

Rendering the control at one project was only half of it. `announceWorkspaceActivity()`
returned early below two open projects — "there is no selector to feed" — which was
true until this change made one. Left alone, the new control would have shown the
activity it was born with and never heard it change: "au repos" through an entire turn,
until a reconnect. The threshold is gone, and mp "a single project's activity reaches
the client that is watching it" drives a real turn over the wire to prove it.

The same sentence justified two thresholds in two files. Removing one and not the other
would have produced a control that lies quietly, which is worse than the `+` it replaced.

## The compatibility question, answered rather than assumed

`useAgent` reads `message.workspace ?? null` and `message.workspaces ?? []`, so the
fields are additive and no client branches on their presence. Confirmed in the running
widget against a single-project server: no control appeared where none appeared before.
