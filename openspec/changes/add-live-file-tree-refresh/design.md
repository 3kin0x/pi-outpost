## Context

Today the only thing that invalidates a tree is `announceFileChange`, driven by
`pendingFileMutations`, populated at `tool_start` for `edit` and `write` alone. It is a
report of *what this process did*, dressed as a report of *what changed*. The gap between
those two is every case in the proposal.

The client side already has the shape this needs. `state.fileTree` is a
`Record<string, DirState>` keyed by directory path, and the existing `file_changed` handler
already guards on `fileTreeRef.current[parentPath] !== undefined` before refetching — it
refreshes a directory only if the tree is actually holding it. What is missing is a source of
truth for "this directory changed", not a mechanism for acting on one.

## Goals / Non-Goals

**Goals**
- The tree reflects on-disk reality without interaction, whoever made the change.
- The open preview does not silently show bytes that are no longer on disk.
- A bounded, predictable cost: no watch is held for a directory nobody is looking at.

**Non-Goals**
- Watching the whole workspace recursively. Nothing displays a collapsed directory, so nothing
  needs to know it changed.
- Reporting *what* changed inside a directory (added vs. removed vs. renamed). The listing is
  cheap and authoritative; a diff would be a second source of truth to keep honest.
- Live-updating the *content* of a file being edited. An open editor buffer with unsaved changes
  is the user's, and the existing conflict-on-save path (`DetectConcurrentModification`) is how
  that collision is already resolved.

## Decisions

### D1 — Watch the directories that were listed, not the root recursively

Every directory the tree shows passes through exactly one funnel, `handleListDirectory`. That is
where a watch is registered. The watched set is therefore precisely "what someone expanded",
which has three consequences worth stating:

- **It is bounded by user action**, not by workspace size. A repo with a 40 000-directory
  `node_modules` costs nothing until somebody expands it.
- **It needs no ignore list.** A recursive watcher would need one (and `fs.watch` has no ignore
  option, so it would create the watches and then discard their events — paying the cost it was
  meant to avoid).
- **It matches what is refreshable.** The client can only refresh a directory it is holding, so
  a watch on anything else would produce a message with nothing to do.

*Alternative — one recursive watch on the browser root.* One watcher, no registration
bookkeeping. Rejected on cost and on failure mode: on Linux `fs.watch(recursive: true)` is
implemented by adding an inotify watch per subdirectory, so a large workspace either exhausts
`max_user_watches` (`ENOSPC`, and the watcher dies wholesale) or spends thousands of watches to
serve the handful of directories anyone is looking at.

### D2 — `fs.watch`, not `chokidar`

Node's `fs.watch` on a single directory is the well-supported case on all three platforms, and
`package.json` already requires Node >= 24. A dependency would buy recursive watching and
event normalisation; D1 declines the first, and the second is not needed because the reaction to
every event is identical — re-list the directory.

This also keeps the single-file SEA build honest: one less package to bundle, and no optional
native binding (`fsevents`) that is present in a dev install and absent in the executable.

Consistent with how this repo already treats dependencies: the OOXML readers parse zip and XML
by hand rather than take one.

### D3 — A `directory_changed` message, not a synthesised `file_changed`

`file_changed` carries a *file* path and the client derives the parent from it. A watcher's
honest unit of observation is the directory: `fs.watch` reports the containing directory
reliably and the entry name only sometimes (`filename` is documented as possibly null, and on a
rename it names one of the two sides). Manufacturing a file path to fit the old message would
be inventing precision the watcher does not have.

So: a new variant, `{ type: "directory_changed"; path }`, and the client decides what that
implies — re-list if held, re-read the preview if the open file lives there, refresh git status.
`file_changed` keeps its meaning (this exact file changed, and the server knows it did) and its
existing senders are untouched.

### D4 — Throttle from the first event, never a resettable debounce

One `write` produces several inotify events (create, modify, close-write); an `npm install` or
a `git checkout` in a watched directory produces thousands. Events are coalesced per directory
into a window opened by the *first* event and never extended.

The distinction matters: a debounce that resets on every event never fires during a sustained
write, which is exactly when the tree is most wrong. A fixed window bounds the message rate at
one per directory per window with no starvation, and the reaction (re-list) is idempotent, so
collapsing N events into one loses nothing.

### D5 — Watchers are non-persistent and LRU-capped

`persistent: false`, so a watcher can never be the reason a process stays alive — the server has
an HTTP listener for that, and a test does not.

The registry is capped (`MAX_WATCHED_DIRECTORIES`, 256) with least-recently-listed eviction. The
cap is a backstop, not a budget: expanding 256 directories in one session is already unusual, and
eviction degrades to today's behaviour (a stale directory, refreshable by hand) rather than to an
error. Re-listing an evicted directory re-registers it.

### D6 — Confinement is shared, not re-derived

`resolveConfined` in `fileBrowser.ts` becomes exported and is what the watcher resolves through.
The watcher is only ever asked to watch a path that `listDirectory` already accepted, so this is
defence in depth — but a second confinement implementation is exactly the kind of thing that
drifts out of agreement with the first, and this one would drift into "which directories may be
watched", i.e. which paths the server holds an open handle on.

### D7 — A manual refresh control, because a watcher is not a guarantee

`fs.watch` is best-effort by contract. Network filesystems, some container filesystems and an
exhausted inotify budget all produce a watcher that silently reports nothing. `files.watch: false`
produces one deliberately.

The control re-lists every directory the tree is currently holding, in one action, and is always
present — not conditional on watching being on. A fallback that only appears once you can prove
the primary failed is a fallback nobody can reach, since the failure mode is silence.

### D8 — A refresh must not blank a directory it can still show

**Added during implementation, from driving the running app.** The first version dispatched
`dir_list_started` for every directory it re-listed, exactly as a first-time expand does. The
wire traffic was perfect — one `list_directory` per held directory, every listing correct — and
the tree collapsed the moment anything refreshed it.

`"loading"` makes `DirChildren` render a placeholder instead of the directory's rows, which
unmounts them; a row's expanded state is its own `useState`, so remounting brings every branch
back closed. Re-listing the root therefore threw away the user's whole place in the tree, on
every automatic refresh as well as on the manual one.

So the placeholder is for a directory that has nothing to show: entries stay on screen until the
listing that replaces them arrives. A directory in an error state still gets it, having nothing
to preserve.

Worth stating because the unit tests passed. They asserted what was sent, which was right, and
the defect was in what remained on screen — the class of thing only the running app reports.

## Risks / Trade-offs

- **A busy watched directory costs one listing per window.** Bounded by D4 and by the fact that
  a listing is a `readdir` plus a `stat` per symlink. Accepted.
- **`fs.watch` can double-report.** Harmless: the reaction is idempotent and coalesced.
- **inotify budget.** D1 bounds the watch count by user action; D5 caps it outright.
- **A watched directory that is deleted** turns into an error event on some platforms and silence
  on others. Either way the watch is dropped and the parent's own watch reports the removal.

## Migration Plan

None. `files.watch` defaults to on; a deployment that wants the old behaviour sets it to false.
The `file_changed` senders and their meaning are unchanged, so a client that does not know
`directory_changed` (an embed pinned to an older `@pi-outpost/embed`) simply ignores an unknown
message type, as it already must.
