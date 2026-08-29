## Why

With one project open, the header shows a bare `+` and nothing else. The user cannot see which project they are in — and that is the single most useful thing the control could tell them. Open a second project and the interface changes shape: a named button with a state appears where the `+` was.

The reasoning behind it was "no selector where there is nothing to select". It mistakes what the control is for. A selector's first job is to say *where you are*; choosing is its second. With one project open, the first job is the only one left, and it is the one that was dropped.

## What Changes

- The server SHALL describe the project a connection is bound to, and list the open projects, whatever their number — including one. Today both are omitted below two, so the client has no name to show even if it wanted to.
- The interface SHALL always name the project it is showing, with the same control in the same place, whether one project is open or several. Opening a second project SHALL add a choice to that control, not replace it with a different one.
- Opening a project stays reachable from that control, as it is today.
- Nothing changes about what a pinned server or a mounted widget offers: `workspaceLock` and the embed policy still decide whether any workspace control appears at all. What this changes is what the control says when it does.

## Capabilities

### Modified Capabilities

- `multi-project-workspaces`: the interface's obligation to name the project on screen is currently written only for the case where several are open. It becomes unconditional, and the single-project case stops being a different interface.
- `api`: `GETWebSocket` already requires the snapshot to list every open project. It gains the scenario that pins the case the implementation currently skips — a server with exactly one.

## Impact

- The session snapshot: two fields that are omitted below two open projects, and every acknowledgement that carries a snapshot.
- The project selector, which loses its single-project branch.
- Existing clients: a snapshot that now always carries these fields, where the omission was described as what kept an older client working. Whether that is still true has to be established rather than assumed — it is the one compatibility question this change has to answer.
- The embed under a `settings` policy still shows no workspace control, and therefore still shows no project name. That is the host's decision and is unchanged here.
