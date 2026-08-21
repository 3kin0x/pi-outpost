## 1. The watcher

- [x] 1.1 New `server/src/fileWatcher.ts`: a registry of `fs.watch` handles keyed by browser-root-relative path, `persistent: false` (design D2/D5).
- [x] 1.2 Resolve every path through `fileBrowser`'s exported `resolveConfined` before opening a watch; a path that does not confine is not watched (D6).
- [x] 1.3 Coalesce per directory into a window opened by the first event and not extended (D4).
- [x] 1.4 LRU eviction at `MAX_WATCHED_DIRECTORIES`; re-listing re-registers (D5).
- [x] 1.5 Swallow watcher errors (deleted directory, permissions) by dropping that watch, never by throwing.
- [x] 1.6 `close()` releases every handle and cancels every pending window.

## 2. Configuration

- [x] 2.1 `FilesConfig { watch: boolean }` on `AppConfig`, defaulting to `true`.
- [x] 2.2 Validation: a non-boolean fails startup naming `"files.watch"`.

## 3. Wiring

- [x] 3.1 `directory_changed` added to `ServerMessage` in `shared/src/protocol.ts` (D3).
- [x] 3.2 Build the watcher in `server/src/index.ts` when `files.watch` is on; broadcast `directory_changed` from its callback.
- [x] 3.3 Register the directory in `handleListDirectory` **after** a successful listing only.
- [x] 3.4 Export `resolveConfined` from `server/src/fileBrowser.ts`.

## 4. Client

- [x] 4.1 Handle `directory_changed` in `ui/src/useAgent.ts`: re-list when held, re-read the open preview when it lives there, refresh git status.
- [x] 4.2 Leave an in-progress edit untouched (the viewer already owns its buffer — verify, do not assume). *Verified: the draft survives a re-read and the "changed on disk" banner appears, so the collision is surfaced rather than swallowed.*
- [x] 4.3 Expose `refreshFileTree()` re-listing every held directory.
- [x] 4.4 A refresh control on the tree, wired through `Sidebar` and `App` (D7).

## 5. Documentation

- [x] 5.1 `files.watch` in `README.md` and `pi-outpost.config.example.json`.

## 6. Verification

- [x] 6.1 `server/test/fileWatcher.test.ts` covering every scenario in the `file` delta.
- [x] 6.2 Config tests for the three `config` scenarios.
- [x] 6.3 UI tests for the four `FileTreeReflectsDiskChanges` scenarios and the two `ManualTreeRefresh` ones.
- [x] 6.4 A scenario-to-test matrix, classifying every scenario covered/partial/uncovered.
- [x] 6.5 Drive the running app: change a file from outside the process, watch the tree update untouched; then exercise the refresh control (CLAUDE.md's running-app rule). *Found the defect in design D8: refreshing collapsed every expanded branch while the wire traffic looked correct. Fixed, and pinned by a regression test that fails on the old code.*
- [x] 6.6 Full `server` and `ui` suites green. *`ui` 56 files / 1182 tests pass. `server` 1241 pass, 1 fail — `credentials.test.mjs` "an unconfigured server reports no usable model", which fails identically on a clean tree here (it wants a reachable model catalog) and is unrelated to this change.*
