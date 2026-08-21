# Scenario → test matrix

17 scenarios, enumerated with `rg '^#### Scenario:' openspec/changes/add-live-file-tree-refresh/`.
All 17 `covered`; none `partial` or `uncovered`.

Every row below was checked by reading the assertion, not the test name: a scenario counts as
covered only where breaking its GIVEN/WHEN/THEN would fail the test.

## `file` — WatchListedDirectories (8)

| Scenario | Test | File | Assertion that would break |
|---|---|---|---|
| ExternalChangeIsAnnounced | `announces a directory changed by something other than this server` | `server/test/fileWatcher.test.ts` | `onChange` records `""` after a `writeFile` no part of the watcher performed |
| " | `announces a file that appeared without this server's involvement` | `server/test/file-watching.test.mjs` | a `directory_changed` for `docs` reaches a real socket client after a bare `writeFile` |
| " | `announces both ends of a move made outside the process` | `server/test/file-watching.test.mjs` | both `inbox` and `archive` announced after an OS-level `rename` — the user's reported case |
| UnlistedDirectoryIsNotWatched | `says nothing about a directory that was never listed` | `server/test/fileWatcher.test.ts` | `seen` stays empty and `watched()` is `[""]` after writing into an unlisted child |
| " | `says nothing about a directory nobody listed` | `server/test/file-watching.test.mjs` | ordered against a *watched* directory's announcement, so it is a real check and not a sleep |
| RefusedListingRegistersNoWatch | `opens no watch on a path that does not confine to the root` | `server/test/fileWatcher.test.ts` | `watched()` is `[]` for `../..` and for an absolute path outside the root; later writes there announce nothing |
| " | `opens no watch on a directory that is not there` | `server/test/fileWatcher.test.ts` | `watched()` is `[]`, and `watch()` does not throw — the listing already answered the client |
| BurstIsCoalesced | `collapses a burst into one announcement` | `server/test/fileWatcher.test.ts` | exactly one announcement for 40 writes in one window |
| SustainedChangeStillReports | `keeps reporting while a directory is written to continuously` | `server/test/fileWatcher.test.ts` | ≥ 2 announcements across 8 windows of unbroken writing — the failure a resetting debounce would produce |
| LeastRecentlyListedIsEvicted | `drops the least recently listed directory once the cap is reached` | `server/test/fileWatcher.test.ts` | recency is of *listing* (re-listing `a` saves it, `b` goes); the evicted directory is silent, then announces again once re-listed |
| WatchingDoesNotHoldTheProcessOpen | `never keeps the process alive on its own` | `server/test/fileWatcher.test.ts` + `fixtures/watcher-exits.mjs` | a child that opens a watcher and does nothing else must exit; a persistent watcher hangs it until the 20 s timeout |
| WatchingDisabled | `still lists directories, and announces nothing` | `server/test/file-watching.test.mjs` | with `files.watch: false` the listing still succeeds, and `directory_changed` is never received — ordered behind a `file_changed` round trip so the absence is proven, not assumed |

## `config` — FileWatchSetting (3)

| Scenario | Test | File | Assertion that would break |
|---|---|---|---|
| WatchingOnByDefault | `files.watch defaults to on and can be turned off` | `server/test/config.test.ts` | `loadConfig({}).files.watch === true` |
| WatchingExplicitlyDisabled | same test | `server/test/config.test.ts` | `loadConfig({ files: { watch: false } }).files.watch === false` |
| InvalidWatchSetting | `files.watch refuses a value that is not a boolean` | `server/test/config.test.ts` | throws matching `"files.watch" must be a boolean` for `"yes"`, `1`, `null`, `{}` |

## `components` — FileTreeReflectsDiskChanges + ManualTreeRefresh (6)

| Scenario | Test | File | Assertion that would break |
|---|---|---|---|
| HeldDirectoryIsRelisted | `re-lists a directory the tree is holding` | `ui/src/useAgent.test.ts` | a `list_directory` for `docs` is sent, and `fileTree["docs"]` flips to `"loading"` |
| UnheldDirectoryIsIgnored | `ignores a directory the tree never expanded` | `ui/src/useAgent.test.ts` | no `list_directory` for `never-opened` |
| OpenPreviewFollowsItsDirectory | `re-reads the open preview when its own directory changed` | `ui/src/useAgent.test.ts` | a `read_file` for `docs/note.md` follows `directory_changed: docs` |
| " (negative half) | `leaves a preview alone when some other directory changed` | `ui/src/useAgent.test.ts` | no `read_file` at all after an unrelated directory changes |
| EditInProgressSurvives | `keeps an unsaved draft when the file is re-read from disk` | `ui/src/components/FileViewer.test.tsx` | the textarea still holds the draft after the `file` prop is replaced with different on-disk content |
| " (the honest half) | `says so, rather than silently resolving it, once the bytes have moved` | `ui/src/components/FileViewer.test.tsx` | the "changed on disk" banner appears, so the collision is surfaced rather than swallowed |
| RefreshRelistsEveryHeldDirectory | `re-lists every held directory on a manual refresh` | `ui/src/useAgent.test.ts` | `list_directory` sent for `""`, `docs` and `docs/deep` |
| " (bound) | `asks for nothing on refresh when the tree holds nothing` | `ui/src/useAgent.test.ts` | no `list_directory` when the tree is empty |
| RefreshIsAlwaysAvailable | `offers it on a read-only tree too` | `ui/src/components/FileTree.test.tsx` | the ↻ control is present where `+ new` is not — the control is not conditional on writability, and the client never learns whether watching is on, so it cannot be conditional on that either |

## Running-app verification

Unit and integration tests are necessary and not sufficient here (CLAUDE.md). The feature was
also driven in the real app: a file created and moved from a shell against a running server, with
the tree observed updating with no interaction, then the ↻ control exercised. See the change's
`tasks.md` §6.5.
