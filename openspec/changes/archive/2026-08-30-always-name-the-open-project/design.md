## Context

See `proposal.md` for motivation and the two delta specs for the contract.

The absence is produced in one line of `snapshot()`:

```ts
...(workspaces.size > 1 ? { workspace: workspaceInfo(workspace), workspaces: workspaceInfos() } : {}),
```

and consumed in one branch of `ProjectMenu`:

```ts
if (workspaces.length < 2 || !workspace) { /* a bare + */ }
```

`useAgent` already defaults both to empty on a snapshot that omits them, so the client
handles their presence without change. `api`'s `GETWebSocket` already says the snapshot
"SHALL additionally list every open project" — unconditionally. The threshold is an
implementation decision that the specification does not actually require.

## Goals / Non-Goals

**Goals:**

- One interface, whatever the number of projects open.
- The name and state of the current project visible wherever a workspace control is.

**Non-Goals:**

- Changing whether a control is offered. `workspaceLock` and the embed policy keep that
  decision, unchanged.
- Showing a project name anywhere else — a title bar, a document title, a status line.
- Changing what the control offers beyond naming: no new action, no new state.
- Making a single-project server behave like a multi-project one in any other respect.

## Decisions

### Send both fields always, rather than teaching the client to cope without them

The alternative — keep the threshold and have the client name the project from
something else — has nothing to name it from. The snapshot is the only place the
project's name and activity exist.

Sending them always also removes a shape the client has to handle: today `workspace` is
`WorkspaceInfo | null` and `workspaces` is a list that is empty exactly when one project
is open, which is a state that means "one" rather than "none". Two fields that are
always present are simpler than two that are sometimes absent for a reason the reader
has to reconstruct.

### The compatibility claim reads worse than it is

The line that omits them says the absence "is what keeps an existing client working
against a new server". The code says otherwise, in both clients that exist: `useAgent`
reads `message.workspace ?? null` and `message.workspaces ?? []`, so the fields are
additive; the only thing that branched on their number is the selector's own `< 2`
test, which this change removes. An embed built before the workspace-control policy
gates on `workspaceLocked || embedded` and renders nothing regardless.

So this is one check in the running app, not a gate on the change.

### `ProjectMenu` loses its branch rather than gaining a mode

The single-project case becomes the general case with a list of one: the named button,
its activity mark, and a menu whose only entries are the current project and "open a
project". No second rendering path, and therefore no second set of states to keep
consistent — the badge, the amber tint and the attention count already work off the
list and would otherwise need a duplicate.

What replaces the bare `+` is the control a multi-project server already shows, at the
same size: it names one project either way. There is no trade here — if that control is
right above the threshold, nothing about one project makes it wrong below it.

## Risks / Trade-offs

- [An older client that keys a selector off these fields starts showing one] → Both
  clients here read the fields defensively and neither branches on their presence;
  confirmed in the running app rather than assumed.
- [A menu whose only choice is the project already open reads as pointless] → The menu
  still carries opening, and closing is refused for the last project anyway, so the
  entries are the current project and the way to add another.
- [Tests and fixtures that assert the absence] → They encode the old decision and must be
  changed with it, not worked around; each one that flips is a place the old behaviour
  was observable.
